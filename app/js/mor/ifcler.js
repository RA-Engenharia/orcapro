/* =====================================================================
 * mor/ifcler.js — LEITURA COMPLETA DO IFC (F13 do MOR, ESPEC §16.1)
 *
 * O QUE FAZ. Lê o arquivo IFC (texto STEP) e devolve TODOS os elementos, com Psets/Qto, material e
 * camadas (IfcMaterialLayerSet), ambiente (IfcSpace que o contém) e classificação — e CLASSIFICA cada
 * um em um «papel» construtivo (parede-alvenaria, sapata, tubo, louça…) que o resto do MOR entende.
 *
 * ⚠ NADA É DESCARTADO EM SILÊNCIO. O relatório de cobertura diz: N elementos lidos → N classificados,
 *   N «sem regra» (LISTADOS, com classe IFC, tipo, material e Pset), e o que não é elemento
 *   (relações, geometria, propriedades, tipos) CONTADO por categoria. Classe que não conhecemos vira
 *   «sem regra» com o motivo — nunca some.
 * ⚠ Este arquivo NÃO decide preço, código nem quantidade de item implícito. Só lê e classifica.
 *   A quantidade lida vem do Qto do arquivo (fonte «ifc»); quando o arquivo não traz, uma estimativa
 *   pela geometria simples (extrusão retangular/circular/polilinha) sai marcada «estimado» — e a
 *   regra 3 do bimorc vale: estimado ≠ medido, a fonte aparece na tela.
 * ⚠ Tamanho: lê o texto inteiro na memória (a aba trava com IFC de 300 MB). Para modelos grandes o
 *   caminho é o do viewer (`deElementosViewer`), que recebe as peças que o BIM já abriu.
 * Puro, ES5, Node-testável: tools/test-mor-ifc.js.
 * ===================================================================== */
(function (global) {
  "use strict";

  function arr(v) { return Object.prototype.toString.call(v) === "[object Array]" ? v : []; }
  function tem(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function r4(x) { return Math.round(x * 10000) / 10000; }
  function sa(s) {
    var t = String(s == null ? "" : s);
    try { t = t.normalize("NFD").replace(/[̀-ͯ]/g, ""); } catch (e) { /* sem normalize */ }
    return t.toLowerCase();
  }

  /* ---------------------------------------------------------------- STEP: texto → entidades */
  function decodificar(s) {
    if (s.indexOf("\\") < 0) return s;
    s = s.replace(/\\X2\\([0-9A-Fa-f]+)\\X0\\/g, function (m, h) {
      var o = ""; for (var i = 0; i + 3 < h.length + 1; i += 4) o += String.fromCharCode(parseInt(h.substr(i, 4), 16)); return o;
    });
    s = s.replace(/\\X\\([0-9A-Fa-f]{2})/g, function (m, h) { return String.fromCharCode(parseInt(h, 16)); });
    s = s.replace(/\\S\\(.)/g, function (m, c) { return String.fromCharCode(c.charCodeAt(0) + 128); });
    return s.replace(/\\\\/g, "\\");
  }

  /* lista de argumentos «(a,b,(c,d),#1,.ENUM.,$,*,IFCLABEL('x'),'texto',1.5)» → valores JS.
     ref → {r:n} · enum → {e:"X"} · tipado → {t:"IFCLABEL", v:valor} · $ → null · * → "*" */
  function parseArgs(raw) {
    var i = 0, n = raw.length;
    function ws() { while (i < n && raw.charCodeAt(i) <= 32) i++; }
    function valor() {
      ws();
      var c = raw.charAt(i), m, j;
      if (c === "$") { i++; return null; }
      if (c === "*") { i++; return "*"; }
      if (c === "'") {
        j = i + 1; var s = "";
        while (j < n) {
          if (raw.charAt(j) === "'") { if (raw.charAt(j + 1) === "'") { s += "'"; j += 2; continue; } break; }
          s += raw.charAt(j); j++;
        }
        i = j + 1; return decodificar(s);
      }
      if (c === "#") { m = /^#(\d+)/.exec(raw.substr(i, 14)); i += m[0].length; return { r: parseInt(m[1], 10) }; }
      if (c === ".") { m = /^\.([A-Za-z0-9_]*)\./.exec(raw.substr(i, 80)); if (m) { i += m[0].length; return { e: m[1].toUpperCase() }; } }
      if (c === "(") { i++; var l = []; ws(); if (raw.charAt(i) === ")") { i++; return l; } while (i < n) { l.push(valor()); ws(); if (raw.charAt(i) === ",") { i++; continue; } if (raw.charAt(i) === ")") { i++; break; } i++; } return l; }
      m = /^[-+]?[0-9]*\.?[0-9]*(?:[eE][-+]?[0-9]+)?/.exec(raw.substr(i, 40));
      if (m && m[0] !== "" && m[0] !== "-" && m[0] !== "+") { i += m[0].length; return parseFloat(m[0]); }
      m = /^([A-Za-z_][A-Za-z0-9_]*)\s*\(/.exec(raw.substr(i, 60));
      if (m) { i += m[0].length; var v = []; ws(); if (raw.charAt(i) === ")") { i++; } else { while (i < n) { v.push(valor()); ws(); if (raw.charAt(i) === ",") { i++; continue; } if (raw.charAt(i) === ")") { i++; break; } i++; } } return { t: m[1].toUpperCase(), v: v.length === 1 ? v[0] : v }; }
      i++; return null;
    }
    ws();
    var out = [];
    while (i < n) { out.push(valor()); ws(); if (raw.charAt(i) === ",") i++; else break; }
    return out;
  }

  function varrer(texto) {
    var ents = {}, total = 0, complexas = 0, esquema = "", p = texto.indexOf("FILE_SCHEMA");
    if (p >= 0) { var mm = /FILE_SCHEMA\s*\(\s*\(\s*'([^']*)'/.exec(texto.substr(p, 200)); if (mm) esquema = mm[1]; }
    var ini = texto.indexOf("DATA;"); if (ini < 0) return { ents: ents, total: 0, complexas: 0, esquema: esquema, erro: "O arquivo não tem a seção DATA; — não parece um IFC." };
    ini += 5;
    var fim = texto.indexOf("ENDSEC;", ini); if (fim < 0) fim = texto.length;
    var i = ini, dentro = false, cs = ini, c;
    while (i < fim) {
      c = texto.charCodeAt(i);
      if (c === 39) { if (dentro && texto.charCodeAt(i + 1) === 39) { i += 2; continue; } dentro = !dentro; }
      else if (!dentro) {
        if (c === 47 && texto.charCodeAt(i + 1) === 42) { var e = texto.indexOf("*/", i + 2); i = e < 0 ? fim : e + 2; continue; }
        if (c === 59) {
          var st = texto.substring(cs, i), m = /^\s*#(\d+)\s*=\s*([A-Za-z0-9_]+)\s*\(([\s\S]*)\)\s*$/.exec(st);
          if (m) { ents[m[1]] = { t: m[2].toUpperCase(), raw: m[3] }; total++; }
          else if (/^\s*#\d+\s*=\s*\(/.test(st)) complexas++;
          cs = i + 1;
        }
      }
      i++;
    }
    return { ents: ents, total: total, complexas: complexas, esquema: esquema, erro: "" };
  }

  /* ---------------------------------------------------------------- classes: o que é o quê */
  var ESPACIAL = { IFCPROJECT: 1, IFCSITE: 1, IFCBUILDING: 1, IFCBUILDINGSTOREY: 1 };
  /* entidades que NÃO são elemento: contadas por categoria no relatório */
  function categoriaNaoElemento(t) {
    if (t.indexOf("IFCREL") === 0) return "relação";
    if (/TYPE$/.test(t)) return "tipo";
    if (/^IFC(PROPERTY|QUANTITY|ELEMENTQUANTITY|COMPLEXPROPERTY|PHYSICALCOMPLEXQUANTITY|PROPERTYSET)/.test(t)) return "propriedade/quantidade";
    if (/^IFC(MATERIAL|CLASSIFICATION)/.test(t)) return "material/classificação";
    if (/^IFC(CARTESIAN|DIRECTION|AXIS|LOCALPLACEMENT|POLYLINE|POLYLOOP|FACE|EXTRUDED|SHAPE|PRODUCTDEFINITION|REPRESENTATION|MAPPED|ARBITRARY|RECTANGLE|CIRCLE|ISHAPE|BOUNDINGBOX|TRIMMED|COMPOSITECURVE|GEOMETRIC|STYLED|SURFACESTYLE|PRESENTATION|COLOUR|INDEXED|POLYGONAL|TRIANGULATED|FACETED|CLOSEDSHELL|OPENSHELL|BSPLINE|LINE|VECTOR|CURVE|PLANE|HALFSPACE|BOOLEAN|REVOLVED|SWEPT|SURFACE|CONNECTED|ADVANCED|SWEPTDISKSOLID|GRID|CARTESIANPOINTLIST|CARTESIANTRANSFORMATION|ELLIPSE|PCURVE|DERIVEDPROFILE|COMPOSITEPROFILE|TSHAPE|LSHAPE|USHAPE|CSHAPE|ZSHAPE|CENTERLINE|ASYMMETRIC|PARAMETERIZED|TRAPEZIUM|OFFSETCURVE)/.test(t)) return "geometria";
    if (/^IFC(SIUNIT|UNITASSIGNMENT|DERIVEDUNIT|CONVERSIONBASEDUNIT|MEASUREWITHUNIT|NAMEDUNIT|DIMENSIONALEXPONENTS|MONETARYUNIT)/.test(t)) return "unidade";
    if (/^IFC(OWNERHISTORY|PERSON|ORGANIZATION|APPLICATION|ACTOR|PERSONANDORGANIZATION|TELECOMADDRESS|POSTALADDRESS|CALENDAR|DOCUMENT|LIBRARY|TIME|DATE|LOCALTIME|COORDINATEDUNIVERSALTIME|APPROVAL|COST|PROJECTLIBRARY|SPATIALZONE|ANNOTATION)/.test(t)) return "metadado";
    if (/^IFC(PRESENTATIONLAYER|ANNOTATION|DRAUGHTING|TEXT|FILLAREA|SYMBOL)/.test(t)) return "apresentação";
    if (/^IFC(GROUP|SYSTEM|DISTRIBUTIONSYSTEM|ZONE|BUILDINGSYSTEM|DISTRIBUTIONCIRCUIT|PERMIT|WORKPLAN|TASK|PROCEDURE|STRUCTURALANALYSIS)/.test(t)) return "grupo/sistema";
    if (/^IFC(DISTRIBUTIONPORT|PORT)/.test(t)) return "porta de conexão";
    return null;
  }

  /* ---------------------------------------------------------------- material → classe */
  function materialClasse(txt) {
    var t = sa(txt); if (!t) return "";
    if (/drywall|gesso acartonado|placa de gesso|steel ?frame/.test(t)) return "drywall";
    if (/concreto celular|siporex|autoclavad|celular/.test(t)) return "celular";
    if (/bloco.*(de )?concreto|bloco estrutural|bloco vazado/.test(t)) return "bloco-concreto";
    if (/bloco|tijolo/.test(t) && /ceram|furado|baiano|vazado|furo/.test(t)) return "bloco-ceramico";
    if (/bloco|tijolo/.test(t)) return "bloco-ceramico";
    if (/chapisco/.test(t)) return "chapisco";
    if (/reboco|emboco|massa unica|argamassa|massa corrida/.test(t)) return "argamassa";
    if (/pintura|tinta|latex|acrilic|esmalte|verniz/.test(t)) return "pintura";
    if (/porcelanato/.test(t)) return "porcelanato";
    if (/vinilic/.test(t)) return "vinilico";
    if (/ceram|azulejo|pastilha|revestimento ceram/.test(t)) return "ceramica";
    if (/granito|marmore|pedra|quartzo/.test(t)) return "pedra";
    if (/concreto|fck|c\d{2}\b|cimento armado|armado/.test(t)) return "concreto";
    if (/madeira|pinus|eucalipto|cedrinho|angelim|cumaru|ipe|peroba|compensado|osb|mdf/.test(t)) return "madeira";
    if (/aluminio|alumínio/.test(t)) return "aluminio";
    if (/inox|aco|steel|metal|galvaniz|ferro|chapa/.test(t)) return "aco";
    if (/vidro|glass/.test(t)) return "vidro";
    if (/cpvc|ppr|pex|cobre|ferro fundido|pead|polietileno/.test(t)) return t.match(/cpvc|ppr|pex|cobre|ferro fundido|pead|polietileno/)[0].replace(/\s/g, "-");
    if (/pvc|plastic/.test(t)) return "pvc";
    if (/telha/.test(t)) return "telha";
    if (/manta|asfalt|impermeabil/.test(t)) return "imperm";
    if (/gesso/.test(t)) return "gesso";
    if (/alvenaria/.test(t)) return "alvenaria";
    if (/isolante|la de|poliestireno|eps|xps/.test(t)) return "isolante";
    return "";
  }

  function ambienteCat(nome) {
    var t = sa(nome); if (!t) return "";
    if (/varanda|sacada|terraco|quintal|jardim|garagem|area externa|externo|externa|calcada|pergola|deck|piscina/.test(t)) return "externo";
    if (/banheiro|wc|lavabo|sanitari|bwc|chuveiro|cozinha|copa\b|lavanderia|area de servico|a\. ?serv|servico|suite/.test(t) && !/^suite$/.test(t)) {
      if (/suite/.test(t) && !/banheiro|wc|bwc/.test(t)) return "seco";
      return "molhado";
    }
    return "seco";
  }

  /* ---------------------------------------------------------------- unidades */
  var PREFIXO = { EXA: 1e18, PETA: 1e15, TERA: 1e12, GIGA: 1e9, MEGA: 1e6, KILO: 1e3, HECTO: 1e2, DECA: 10, DECI: 0.1, CENTI: 0.01, MILLI: 0.001, MICRO: 1e-6, NANO: 1e-9 };
  function lerUnidades(ctx) {
    var U = { comprimento: 1, area: null, volume: null, massa: 1, avisos: [] }, id, e;
    var unidades = [];
    Object.keys(ctx.ents).forEach(function (k) { if (ctx.ents[k].t === "IFCUNITASSIGNMENT") { var a = ctx.args(+k); arr(a[0]).forEach(function (r) { if (r && r.r) unidades.push(r.r); }); } });
    function fator(uid) {
      var e2 = ctx.ents[uid]; if (!e2) return null;
      var a = ctx.args(uid);
      if (e2.t === "IFCSIUNIT") { var pre = a[2] && a[2].e ? PREFIXO[a[2].e] || 1 : 1; return { tipo: a[1] && a[1].e, f: pre, nome: a[3] && a[3].e }; }
      if (e2.t === "IFCCONVERSIONBASEDUNIT") {
        var mu = a[3] && a[3].r ? ctx.args(a[3].r) : null, comp = mu ? (mu[0] && mu[0].v !== undefined ? mu[0].v : mu[0]) : 1, base = mu && mu[1] && mu[1].r ? fator(mu[1].r) : { f: 1 };
        return { tipo: a[1] && a[1].e, f: (typeof comp === "number" ? comp : 1) * (base ? base.f : 1), nome: String(a[2] || "") };
      }
      return null;
    }
    unidades.forEach(function (uid) {
      var f = fator(uid); if (!f) return;
      if (f.tipo === "LENGTHUNIT") U.comprimento = f.f;
      else if (f.tipo === "AREAUNIT") U.area = f.f;
      else if (f.tipo === "VOLUMEUNIT") U.volume = f.f;
      else if (f.tipo === "MASSUNIT") U.massa = f.nome === "GRAM" ? f.f / 1000 : f.f;
    });
    if (U.area === null) U.area = U.comprimento * U.comprimento;
    if (U.volume === null) U.volume = U.comprimento * U.comprimento * U.comprimento;
    if (U.comprimento !== 1) U.avisos.push("unidade de comprimento do arquivo: fator " + U.comprimento + " para metro (convertido).");
    return U;
  }

  /* quantidade canônica a partir do nome do Qto/propriedade */
  var NOMEQ = [
    ["comprimento", /^(length|comprimento|netlength|grosslength)$/], ["largura", /^(width|largura|espessura|thickness)$/], ["altura", /^(height|altura|overallheight|nominalheight)$/],
    ["profundidade", /^(depth|profundidade)$/],
    ["areaLateral", /^(netsidearea|area lateral)$/], ["areaLateralBruta", /^(grosssidearea|area lateral bruta)$/], ["areaBruta", /^(grossarea|grossfootprintarea|grossfloorarea|area bruta)$/],
    ["area", /^(netarea|area|netfootprintarea|netfloorarea|projectedarea|area liquida)$/],
    ["volume", /^(netvolume|volume)$/], ["volumeBruto", /^(grossvolume)$/], ["perimetro", /^(perimeter|perimetro|netperimeter|grossperimeter|crosssectionperimeter)$/],
    ["areaSecao", /^(crosssectionarea)$/], ["peso", /^(netweight|grossweight|weight|peso)$/], ["altura", /^(nominalheight)$/]
  ];
  function chaveQ(nome) { var t = sa(nome).replace(/\s+/g, " ").trim(); for (var i = 0; i < NOMEQ.length; i++) if (NOMEQ[i][1].test(t)) return NOMEQ[i][0]; return ""; }

  /* ---------------------------------------------------------------- o leitor */
  function ler(texto, opts) {
    opts = opts || {};
    var v = varrer(String(texto || ""));
    var res = { ok: false, erro: v.erro || "", esquema: v.esquema, elementos: [], espacos: [], avisos: [], cobertura: null, unidades: null, modelo: { projeto: "", pavimentos: [] } };
    if (v.erro) return res;
    var ents = v.ents, cacheArgs = {};
    function args(id) { var c = cacheArgs[id]; if (c) return c; var e = ents[id]; if (!e) return []; c = cacheArgs[id] = parseArgs(e.raw); return c; }
    function tipoDe(id) { return ents[id] ? ents[id].t : ""; }
    var ctx = { ents: ents, args: args };
    var U = lerUnidades(ctx); res.unidades = U; U.avisos.forEach(function (a) { res.avisos.push(a); });
    var ids = Object.keys(ents).map(Number);

    /* ---- relações (uma passada) */
    var porProps = {}, porTipo = {}, porMat = {}, porClass = {}, contido = {}, agregado = {}, bordas = {}, vazios = {}, preenche = {}, grupos = {}, vaoDe = {};
    function lista(v2) { return arr(v2).map(function (r) { return r && r.r; }).filter(Boolean); }
    function push(o, k, val) { (o[k] = o[k] || []).push(val); }
    ids.forEach(function (id) {
      var t = ents[id].t; if (t.indexOf("IFCREL") !== 0) return;
      var a = args(id), k;
      if (t === "IFCRELDEFINESBYPROPERTIES") { lista(a[4]).forEach(function (o) { if (a[5] && a[5].r) push(porProps, o, a[5].r); }); }
      else if (t === "IFCRELDEFINESBYTYPE") { lista(a[4]).forEach(function (o) { if (a[5] && a[5].r) porTipo[o] = a[5].r; }); }
      else if (t === "IFCRELASSOCIATESMATERIAL") { lista(a[4]).forEach(function (o) { if (a[5] && a[5].r) porMat[o] = a[5].r; }); }
      else if (t === "IFCRELASSOCIATESCLASSIFICATION") { lista(a[4]).forEach(function (o) { if (a[5] && a[5].r) push(porClass, o, a[5].r); }); }
      else if (t === "IFCRELCONTAINEDINSPATIALSTRUCTURE") { lista(a[4]).forEach(function (o) { if (a[5] && a[5].r) contido[o] = a[5].r; }); }
      else if (t === "IFCRELAGGREGATES") { lista(a[5]).forEach(function (o) { if (a[4] && a[4].r) agregado[o] = a[4].r; }); }
      else if (t.indexOf("IFCRELSPACEBOUNDARY") === 0) { if (a[4] && a[4].r && a[5] && a[5].r) { push(bordas, a[5].r, a[4].r); } }
      else if (t === "IFCRELVOIDSELEMENT") { if (a[4] && a[4].r && a[5] && a[5].r) { push(vazios, a[4].r, a[5].r); } }
      else if (t === "IFCRELFILLSELEMENT") { if (a[4] && a[4].r && a[5] && a[5].r) preenche[a[4].r] = a[5].r; }
      else if (t === "IFCRELASSIGNSTOGROUP") { lista(a[4]).forEach(function (o) { if (a[6] && a[6].r) push(grupos, o, a[6].r); }); }
      else if (t === "IFCRELSPACEBOUNDARY") { /* coberto acima */ }
      k = 0;
    });

    /* ---- propriedades e quantidades */
    function valorProp(x) {
      if (x === null || x === undefined) return null;
      if (typeof x === "object" && x.t !== undefined) return valorProp(x.v);
      if (typeof x === "object" && x.e !== undefined) return x.e === "T" ? true : (x.e === "F" ? false : x.e);
      if (arr(x).length) return valorProp(x[0]);
      return x;
    }
    function lerDef(did, psets, qto, dimQ) {
      var t = tipoDe(did), a = args(did);
      if (t === "IFCPROPERTYSET") {
        var nome = String(a[2] || "Pset"), o = psets[nome] = psets[nome] || {};
        lista(a[4]).forEach(function (pid) {
          var pt = tipoDe(pid), pa = args(pid);
          if (pt === "IFCPROPERTYSINGLEVALUE") o[String(pa[0])] = valorProp(pa[2]);
          else if (pt === "IFCPROPERTYENUMERATEDVALUE") o[String(pa[0])] = valorProp(pa[2]);
          else if (pt === "IFCPROPERTYLISTVALUE") o[String(pa[0])] = valorProp(pa[2]);
          else if (pt === "IFCCOMPLEXPROPERTY") { /* aninhada: aplaina */ lista(pa[3]).forEach(function (q) { var qa = args(q); o[String(pa[0]) + "." + String(qa[0])] = valorProp(qa[2]); }); }
        });
      } else if (t === "IFCELEMENTQUANTITY") {
        var nq = String(a[2] || "Qto"), oq = psets[nq] = psets[nq] || {};
        lista(a[5]).forEach(function (qid) {
          var qt = tipoDe(qid), qa = args(qid), nm = String(qa[0] || ""), val = qa[3], k = chaveQ(nm), f;
          if (typeof val !== "number") return;
          if (qt === "IFCQUANTITYLENGTH") f = U.comprimento; else if (qt === "IFCQUANTITYAREA") f = U.area; else if (qt === "IFCQUANTITYVOLUME") f = U.volume; else if (qt === "IFCQUANTITYWEIGHT") f = U.massa; else { oq[nm] = val; if (qt === "IFCQUANTITYCOUNT" && /count|quantidade/i.test(nm)) qto._contagem = val; return; }
          oq[nm] = val * f;
          if (k && !(k in qto)) qto[k] = val * f;
        });
      }
    }

    /* ---- materiais */
    function lerMaterial(mid) {
      var t = tipoDe(mid), a = args(mid), out = { nomes: [], camadas: [], conj: false };
      function mat(rid) { var m = rid && rid.r ? args(rid.r) : []; return rid && rid.r && tipoDe(rid.r) === "IFCMATERIAL" ? String(m[0] || "") : ""; }
      if (t === "IFCMATERIAL") out.nomes.push(String(a[0] || ""));
      else if (t === "IFCMATERIALLAYERSETUSAGE") { var ls = a[0] && a[0].r; if (ls) { var sub = lerMaterial(ls); out.camadas = sub.camadas; out.nomes = sub.nomes; out.conjuntoNome = sub.conjuntoNome; } }
      else if (t === "IFCMATERIALLAYERSET") {
        out.conjuntoNome = String(a[1] || "");
        lista(a[0]).forEach(function (lid) { var la = args(lid), nm = mat(la[0]), esp = typeof la[1] === "number" ? la[1] * U.comprimento : null; out.camadas.push({ material: nm, espessura: esp, nome: String(la[3] || "") }); if (nm) out.nomes.push(nm); });
        if (out.conjuntoNome) out.nomes.push(out.conjuntoNome);
      } else if (t === "IFCMATERIALLAYER") { var nm2 = mat(a[0]); out.camadas.push({ material: nm2, espessura: typeof a[1] === "number" ? a[1] * U.comprimento : null, nome: String(a[3] || "") }); if (nm2) out.nomes.push(nm2); }
      else if (t === "IFCMATERIALCONSTITUENTSET") { out.conj = true; lista(a[2]).forEach(function (cid) { var ca = args(cid), nm3 = mat(ca[2]); if (nm3) out.nomes.push(nm3); if (ca[0]) out.nomes.push(String(ca[0])); }); }
      else if (t === "IFCMATERIALCONSTITUENT") { var nm4 = mat(a[2]); if (nm4) out.nomes.push(nm4); }
      else if (t === "IFCMATERIALLIST") { lista(a[0]).forEach(function (m2) { var ma = args(m2); if (ma[0]) out.nomes.push(String(ma[0])); }); }
      else if (t === "IFCMATERIALPROFILESETUSAGE" || t === "IFCMATERIALPROFILESET") { var ps = t === "IFCMATERIALPROFILESETUSAGE" ? (a[0] && a[0].r) : mid; if (ps) { lista(args(ps)[2]).forEach(function (pid2) { var pa2 = args(pid2), nm5 = mat(pa2[1]); if (nm5) out.nomes.push(nm5); if (pa2[0]) out.nomes.push(String(pa2[0])); }); } }
      return out;
    }

    /* ---- geometria simples (estimativa) */
    function ponto(pid) { var a = args(pid); return arr(a[0]).map(function (n) { return typeof n === "number" ? n * U.comprimento : 0; }); }
    function perfil(sid) {
      var t = tipoDe(sid), a = args(sid);
      if (t === "IFCRECTANGLEPROFILEDEF") { var x = a[3] * U.comprimento, y = a[4] * U.comprimento; if (!(x > 0 && y > 0)) return null; return { forma: "ret", x: x, y: y, area: x * y, perimetro: 2 * (x + y) }; }
      if (t === "IFCCIRCLEPROFILEDEF") { var r = a[3] * U.comprimento; if (!(r > 0)) return null; return { forma: "circ", r: r, x: 2 * r, y: 2 * r, area: Math.PI * r * r, perimetro: 2 * Math.PI * r }; }
      if (t === "IFCARBITRARYCLOSEDPROFILEDEF" || t === "IFCARBITRARYPROFILEDEFWITHVOIDS") {
        var cv = a[2] && a[2].r, pts = [];
        if (cv && tipoDe(cv) === "IFCPOLYLINE") pts = lista(args(cv)[0]).map(ponto);
        if (pts.length < 3) return null;
        var s = 0, p = 0, i, xs = [], ys = [];
        for (i = 0; i < pts.length; i++) { var q = pts[i], w = pts[(i + 1) % pts.length]; s += q[0] * w[1] - w[0] * q[1]; p += Math.sqrt(Math.pow(w[0] - q[0], 2) + Math.pow(w[1] - q[1], 2)); xs.push(q[0]); ys.push(q[1]); }
        var bx = Math.max.apply(null, xs) - Math.min.apply(null, xs), by = Math.max.apply(null, ys) - Math.min.apply(null, ys);
        return { forma: "poli", x: bx, y: by, area: Math.abs(s / 2), perimetro: p };
      }
      return null;
    }
    function itensCorpo(rid, prof) {
      var out = [];
      if (prof > 4) return out;
      var ps = args(rid), reps = tipoDe(rid) === "IFCPRODUCTDEFINITIONSHAPE" ? lista(ps[2]) : [rid];
      var escolhida = null;
      reps.forEach(function (r) { var ra = args(r); if (!escolhida && /body|corpo/i.test(String(ra[1] || ""))) escolhida = r; });
      if (!escolhida) escolhida = reps[0];
      if (!escolhida) return out;
      lista(args(escolhida)[3]).forEach(function (it) {
        var t = tipoDe(it), a = args(it);
        if (t === "IFCEXTRUDEDAREASOLID") { var pf = a[0] && a[0].r ? perfil(a[0].r) : null; if (pf && typeof a[3] === "number") out.push({ perfil: pf, profundidade: a[3] * U.comprimento }); }
        else if (t === "IFCMAPPEDITEM") { var src = a[0] && a[0].r, rm = src ? args(src) : []; if (rm[1] && rm[1].r) { var sub = [{ r: 0 }]; var rr = rm[1].r; var sa2 = args(rr); lista(sa2[3]).forEach(function (it2) { var a2 = args(it2); if (tipoDe(it2) === "IFCEXTRUDEDAREASOLID") { var pf2 = a2[0] && a2[0].r ? perfil(a2[0].r) : null; if (pf2 && typeof a2[3] === "number") out.push({ perfil: pf2, profundidade: a2[3] * U.comprimento }); } }); sub = null; } }
      });
      return out;
    }
    function geometria(id) {
      var a = args(id), rid = a[6] && a[6].r; if (!rid) return null;
      var its = itensCorpo(rid, 0); if (!its.length) return null;
      var it = its[0];
      return { perfil: it.perfil, profundidade: it.profundidade, nSolidos: its.length };
    }

    /* ---- elementos */
    function ehProduto(t, a) {
      if (ESPACIAL[t] || categoriaNaoElemento(t)) return false;
      if (typeof a[0] === "string" && a[0].length === 22) return true;
      return false;
    }
    var estat = { entidades: v.total, complexas: v.complexas, naoElemento: {}, espacial: 0, tiposVistos: 0, produtos: 0, desconhecidas: {} };
    var produtos = [], espacos = [], opens = {};
    ids.forEach(function (id) {
      var t = ents[id].t;
      if (ESPACIAL[t]) { estat.espacial++; if (t === "IFCPROJECT") res.modelo.projeto = String(args(id)[2] || ""); if (t === "IFCBUILDINGSTOREY") res.modelo.pavimentos.push({ id: id, nome: String(args(id)[2] || ""), cota: typeof args(id)[9] === "number" ? args(id)[9] * U.comprimento : null }); return; }
      var cat = categoriaNaoElemento(t);
      if (cat) { estat.naoElemento[cat] = (estat.naoElemento[cat] || 0) + 1; if (cat === "tipo") estat.tiposVistos++; return; }
      var a = args(id);
      if (!ehProduto(t, a)) { estat.desconhecidas[t] = (estat.desconhecidas[t] || 0) + 1; return; }
      if (t === "IFCSPACE") espacos.push(id); else if (t === "IFCOPENINGELEMENT" || t === "IFCOPENINGSTANDARDCASE") opens[id] = 1; else produtos.push(id);
    });
    estat.produtos = produtos.length;

    function psetsDe(id, tipoId) {
      var psets = {}, qto = {};
      if (tipoId && ents[tipoId]) { var ta = args(tipoId); lista(ta[5]).forEach(function (d) { lerDef(d, psets, {}, false); }); }
      (porProps[id] || []).forEach(function (d) { lerDef(d, psets, qto, true); });
      return { psets: psets, qto: qto };
    }
    function pavimentoDe(id) {
      var c = contido[id], guard = 0;
      while (c && guard++ < 8) { if (tipoDe(c) === "IFCBUILDINGSTOREY") return String(args(c)[2] || ""); var pai = agregado[c] || contido[c]; if (tipoDe(c) === "IFCSPACE" && contido[c]) { c = contido[c]; continue; } c = pai; }
      var p2 = agregado[id]; guard = 0; while (p2 && guard++ < 8) { if (tipoDe(p2) === "IFCBUILDINGSTOREY") return String(args(p2)[2] || ""); p2 = agregado[p2]; }
      return "";
    }
    function predefDe(a, tipoId) {
      var i, p = null;
      for (i = 8; i < a.length; i++) { if (a[i] && typeof a[i] === "object" && a[i].e) { p = a[i].e; break; } }
      if ((!p || p === "NOTDEFINED" || p === "USERDEFINED") && tipoId) { var ta = args(tipoId); for (i = 9; i < ta.length; i++) { if (ta[i] && typeof ta[i] === "object" && ta[i].e && ta[i].e !== "NOTDEFINED") { p = ta[i].e; break; } } }
      return p || "";
    }

    function montar(id, ehEspaco) {
      var t = ents[id].t, a = args(id), tipoId = porTipo[id] || null;
      var pq = psetsDe(id, tipoId), qto = pq.qto, psets = pq.psets;
      var mat = porMat[id] ? lerMaterial(porMat[id]) : (tipoId && porMat[tipoId] ? lerMaterial(porMat[tipoId]) : { nomes: [], camadas: [] });
      var tipoNome = tipoId ? String(args(tipoId)[2] || "") : "";
      var el = {
        id: id, globalId: String(a[0] || ""), classe: t, predef: predefDe(a, tipoId), nome: String(a[2] || ""), objetoTipo: typeof a[4] === "string" ? a[4] : "", tipoNome: tipoNome,
        tag: typeof a[7] === "string" ? a[7] : "", pavimento: pavimentoDe(id), psets: psets, qto: {}, qtoFonte: {}, materiais: mat.nomes.filter(function (x, i, l) { return x && l.indexOf(x) === i; }),
        camadas: mat.camadas, conjuntoNome: mat.conjuntoNome || "", ambientes: [], ambienteCat: "", externo: null, classificacao: [], vaos: [], sistema: "", chave: String(a[0] || "") ? "ifc::" + a[0] : ""
      };
      var k; for (k in qto) if (tem(qto, k) && k !== "_contagem") { el.qto[k] = qto[k]; el.qtoFonte[k] = "ifc"; }
      /* porta/janela: dimensões de cadastro (a[8] altura, a[9] largura) */
      if ((t === "IFCDOOR" || t === "IFCWINDOW") && typeof a[8] === "number" && typeof a[9] === "number") {
        if (!el.qto.altura) { el.qto.altura = a[8] * U.comprimento; el.qtoFonte.altura = "ifc"; }
        if (!el.qto.largura) { el.qto.largura = a[9] * U.comprimento; el.qtoFonte.largura = "ifc"; }
      }
      /* IsExternal */
      Object.keys(psets).forEach(function (pn) { var p = psets[pn]; if (p && p.IsExternal !== undefined && p.IsExternal !== null) el.externo = (p.IsExternal === true || p.IsExternal === "T"); });
      /* classificação (referência + propriedades) */
      (porClass[id] || (tipoId && porClass[tipoId]) || []).forEach(function (cid) {
        var ca = args(cid), fonte = ca[3] && ca[3].r ? args(ca[3].r) : [];
        el.classificacao.push({ sistema: String(fonte[3] || fonte[0] || ""), codigo: String(ca[1] || ""), nome: String(ca[2] || "") });
      });
      Object.keys(psets).forEach(function (pn) { var p = psets[pn]; Object.keys(p).forEach(function (pk) { if (/sinapi|omniclass|uniformat|classifica|codigo de servi|c[oó]digo sinapi/i.test(sa(pk)) && p[pk] !== null && String(p[pk]) !== "") el.classificacao.push({ sistema: pk, codigo: String(p[pk]), nome: pn }); }); });
      /* sistema (IfcSystem a que pertence) */
      (grupos[id] || []).forEach(function (g) { var ga = args(g); if (ga[2] || (ga[5] && ga[5].e)) el.sistema += (el.sistema ? " | " : "") + String(ga[2] || "") + (ga[5] && ga[5].e ? " [" + ga[5].e + "]" : ""); });
      /* geometria simples: só onde o arquivo não trouxe o Qto */
      var g = geometria(id);
      if (g) {
        el._geo = { forma: g.perfil.forma, x: r4(g.perfil.x), y: r4(g.perfil.y), areaSecao: r4(g.perfil.area), perimetroSecao: r4(g.perfil.perimetro), profundidade: r4(g.profundidade), n: g.nSolidos };
      }
      return el;
    }

    produtos.forEach(function (id) { res.elementos.push(montar(id, false)); });
    var porId = {}; res.elementos.forEach(function (e) { porId[e.id] = e; });

    /* ---- ambientes (IfcSpace) */
    espacos.forEach(function (id) {
      var e = montar(id, true), a = args(id); completarQto(e);
      var nome = e.nome || String(a[7] || ""), longo = typeof a[7] === "string" ? a[7] : "";
      e.longNome = longo; e.nomeCompleto = (nome + " " + longo).trim();
      var cat = ambienteCat(e.nomeCompleto);
      Object.keys(e.psets).forEach(function (pn) { var p = e.psets[pn]; if (p && p.IsExternal === true) cat = "externo"; });
      e.categoria = cat;
      e.areaPiso = e.qto.area || e.qto.areaBruta || 0; e.perimetroPiso = e.qto.perimetro || 0; e.altura = e.qto.altura || 0;
      res.espacos.push(e);
    });
    var espPorId = {}; res.espacos.forEach(function (e) { espPorId[e.id] = e; });
    /* elemento → ambientes: fronteira de espaço, ou contido no espaço */
    var contidoEmEspaco = {}; Object.keys(contido).forEach(function (o) { if (espPorId[contido[o]]) push(contidoEmEspaco, o, contido[o]); });
    res.elementos.forEach(function (e) {
      var sp = (bordas[e.id] || []).concat(contidoEmEspaco[e.id] || []);
      sp.forEach(function (s) { if (espPorId[s] && e.ambientes.indexOf(s) < 0) e.ambientes.push(s); });
      e.ambientesNome = e.ambientes.map(function (s) { return espPorId[s].nomeCompleto; });
      e.ambientesCat = e.ambientes.map(function (s) { return espPorId[s].categoria; });
      e.ambienteCat = e.ambientesCat.indexOf("molhado") >= 0 ? "molhado" : (e.ambientesCat.indexOf("externo") >= 0 ? "externo" : (e.ambientesCat.length ? "seco" : ""));
    });

    /* ---- vãos: parede → aberturas → esquadria que as preenche */
    Object.keys(vazios).forEach(function (wid) {
      var w = porId[wid]; if (!w) return;
      vazios[wid].forEach(function (oid) {
        var fill = preenche[oid], f = fill ? porId[fill] : null;
        var largura = f ? f.qto.largura : 0, altura = f ? f.qto.altura : 0, area = 0, fonte = f ? "ifc" : "";
        if (!(largura > 0 && altura > 0)) { var op = montar(oid, false); largura = op.qto.largura || (op._geo ? Math.max(op._geo.x, op._geo.y) : 0); altura = op.qto.altura || op.qto.profundidade || 0; if (op._geo && !(altura > 0)) altura = op._geo.profundidade; fonte = (op.qto.largura && op.qto.altura) ? "ifc" : "estimado"; }
        area = largura * altura;
        w.vaos.push({ abertura: oid, esquadria: fill || null, classe: f ? f.classe : "IFCOPENINGELEMENT", largura: largura, altura: altura, area: area, fonte: fonte });
        vaoDe[fill || oid] = wid;
      });
    });

    /* ---- classificar */
    var sem = [], por = {}, classificados = 0, semQto = 0, porDisc = {};
    res.elementos.forEach(function (e) {
      completarQto(e);
      var c = classificar(e);
      e.papel = c.papel; e.disciplina = c.disciplina; e.regra = c.regra; e.sub = c.sub || ""; e.semRegra = !c.papel; e.motivo = c.motivo || "";
      if (c.dn !== undefined) e.dn = c.dn; if (c.mat) e.matTubo = c.mat; if (c.tipoConexao !== undefined) { e.tipoConexao = c.tipoConexao; e.angulo = c.angulo; }
      if (c.papel) { classificados++; por[c.papel] = (por[c.papel] || 0) + 1; } else sem.push({ id: e.id, globalId: e.globalId, classe: e.classe, predef: e.predef, nome: e.nome, tipo: e.tipoNome, material: e.materiais.join(" / "), psets: Object.keys(e.psets), motivo: c.motivo });
      porDisc[e.disciplina || "indefinida"] = (porDisc[e.disciplina || "indefinida"] || 0) + 1;
      if (!(e.qto.comprimento > 0 || e.qto.area > 0 || e.qto.volume > 0 || e.qto.volumeBruto > 0 || e.qto.areaLateral > 0 || e.qto.peso > 0) && /^(parede|laje|piso|pilar|viga|sapata|baldrame|bloco|estaca|radier|tubo|cobertura|forro)/.test(e.papel || "")) semQto++;
    });
    res.cobertura = {
      entidades: estat.entidades, estruturaEspacial: estat.espacial, ambientes: res.espacos.length, tipos: estat.tiposVistos,
      lidos: res.elementos.length, classificados: classificados, semRegra: sem, porPapel: por, porDisciplina: porDisc,
      naoElemento: estat.naoElemento, naoReconhecidas: estat.desconhecidas, complexas: estat.complexas, semQuantidade: semQto,
      completa: sem.length + classificados === res.elementos.length
    };
    res.ok = true;
    return res;
  }

  /* quantidade pela geometria quando o arquivo não trouxe — sempre marcada «estimado» */
  function completarQto(e) {
    var g = e._geo; if (!g) return;
    function poe(k, v2) { if (k === "volume" && e.qto.volumeBruto > 0) return; if (!(e.qto[k] > 0) && v2 > 0) { e.qto[k] = r4(v2); e.qtoFonte[k] = "estimado"; } }
    var c = e.classe;
    if (/^IFC(COLUMN|PILE)/.test(c)) { poe("comprimento", g.profundidade); poe("areaSecao", g.areaSecao); poe("perimetro", g.perimetroSecao); poe("volume", g.areaSecao * g.profundidade); if (g.forma === "ret") { poe("largura", Math.min(g.x, g.y)); poe("altura", Math.max(g.x, g.y)); } }
    else if (/^IFC(BEAM|MEMBER)/.test(c)) { poe("comprimento", g.profundidade); poe("areaSecao", g.areaSecao); poe("perimetro", g.perimetroSecao); poe("volume", g.areaSecao * g.profundidade); if (g.forma === "ret") { poe("largura", Math.min(g.x, g.y)); poe("altura", Math.max(g.x, g.y)); } }
    else if (/^IFC(FOOTING)/.test(c)) { poe("volume", g.areaSecao * g.profundidade); poe("area", g.areaSecao); poe("perimetro", g.perimetroSecao); poe("altura", g.profundidade); if (g.forma === "ret") { poe("comprimento", Math.max(g.x, g.y)); poe("largura", Math.min(g.x, g.y)); } }
    else if (/^IFC(SLAB|COVERING|ROOF|PLATE)/.test(c)) { poe("area", g.areaSecao); poe("volume", g.areaSecao * g.profundidade); poe("perimetro", g.perimetroSecao); poe("largura", g.profundidade); }
    else if (/^IFC(WALL)/.test(c) && g.forma === "ret") { var L = Math.max(g.x, g.y), esp = Math.min(g.x, g.y); poe("comprimento", L); poe("largura", esp); poe("altura", g.profundidade); poe("areaLateral", L * g.profundidade); poe("volume", L * esp * g.profundidade); }
    else if (/^IFC(PIPESEGMENT|CABLE|DUCT|FLOWSEGMENT)/.test(c)) { poe("comprimento", g.profundidade); if (g.forma === "circ") poe("diametro", g.x); }
    else if (/^IFC(DOOR|WINDOW)/.test(c)) { /* dimensões vêm do cadastro */ }
    else if (c === "IFCSPACE") { poe("area", g.areaSecao); poe("perimetro", g.perimetroSecao); poe("altura", g.profundidade); }
    else if (/^IFC(STAIR|RAMP)/.test(c)) { /* sem estimativa */ }
  }

  /* ---------------------------------------------------------------- classificação (papel construtivo) */
  function txtEl(e) { return sa([e.nome, e.tipoNome, e.objetoTipo, e.conjuntoNome, e.materiais.join(" "), e.sistema].join(" ")); }
  function matEl(e) {
    /* material do NÚCLEO: a camada mais espessa (ou a única); senão o primeiro material */
    var c = e.camadas || [], best = null, i;
    for (i = 0; i < c.length; i++) { if (c[i].material && (!best || (c[i].espessura || 0) > (best.espessura || 0))) best = c[i]; }
    var m = best ? materialClasse(best.material) : "";
    if (!m) { for (i = 0; i < e.materiais.length && !m; i++) m = materialClasse(e.materiais[i]); }
    if (!m) m = materialClasse(e.nome + " " + e.tipoNome);
    return m;
  }
  function sistemaTubo(e) {
    var t = txtEl(e), p = e.psets, k, x = "";
    Object.keys(p).forEach(function (pn) { Object.keys(p[pn]).forEach(function (pk) { if (/system|sistema|classification/i.test(sa(pk)) && typeof p[pn][pk] === "string") x += " " + sa(p[pn][pk]); }); });
    t += " " + x;
    if (/esgoto|sanitari|sewage|waste|vent(ilacao)?\b|residual|cloaca/.test(t)) return "esgoto";
    if (/pluvial|stormwater|drenag|chuva|calha|gutter|rainwater/.test(t) || e.predef === "GUTTER") return "pluvial";
    if (/incendio|fire|hidrante|sprinkler/.test(t)) return "incendio";
    if (/gas|glp/.test(t) && !/agua/.test(t)) return "gas";
    if (/quente|hotwater|domestichotwater|aquecid/.test(t)) return "agua-quente";
    if (/fria|coldwater|domesticcoldwater|agua|potavel|abastec|hidraul/.test(t)) return "agua-fria";
    if (/ar condicionado|refriger|climatiz|condensad|dreno/.test(t)) return "climatizacao";
    return "";
  }
  function diametroMm(e) {
    var p = e.psets, v2 = 0;
    Object.keys(p).forEach(function (pn) { Object.keys(p[pn]).forEach(function (pk) { var k2 = sa(pk); if (/nominaldiameter|diametro nominal|diameter|diametro|dn$|^dn/.test(k2) && typeof p[pn][pk] === "number" && !(v2 > 0)) v2 = p[pn][pk]; }); });
    if (!(v2 > 0)) { var mm = /(?:dn|d|ø|diam(?:etro)?)\s*[=:]?\s*(\d{2,3})(?!\d)/i.exec(e.nome + " " + e.tipoNome); if (mm) v2 = +mm[1]; }
    if (!(v2 > 0) && e.qto.diametro > 0) v2 = e.qto.diametro;
    if (v2 > 0 && v2 < 1) v2 = v2 * 1000;          /* veio em metros */
    else if (v2 > 0 && v2 < 3 && /pol|inch|"/.test(sa(JSON.stringify(p)))) v2 = v2 * 25.4;
    return v2 > 0 ? Math.round(v2) : 0;
  }
  function classificar(e) {
    var c = e.classe, pd = e.predef, t = txtEl(e), m = matEl(e), R;
    function ok(papel, disc, regra, sub) { return { papel: papel, disciplina: disc, regra: regra, sub: sub || "" }; }
    function nao(motivo, disc) { return { papel: null, disciplina: disc || "", regra: "", motivo: motivo }; }
    if (/^IFCWALL/.test(c) || c === "IFCCURTAINWALL") {
      if (c === "IFCCURTAINWALL") return nao("pele de vidro/fachada cortina: sem composição de catálogo na F13 (sob cotação)", "arquitetura");
      if (pd === "PARAPET" || /platibanda|parapeito/.test(t)) return ok("parede-alvenaria", "arquitetura", "classe IFCWALL + PARAPET/nome «platibanda»", "platibanda");
      if (/arrimo|contencao|retaining/.test(t) || pd === "RETAININGWALL") return ok("muro-arrimo", "estrutura", "IFCWALL arrimo/contenção");
      if (m === "drywall" || pd === "PARTITIONING" && m === "gesso") return ok("parede-drywall", "arquitetura", "IFCWALL + material de gesso acartonado");
      if (m === "concreto") return ok("parede-concreto", "estrutura", "IFCWALL + material concreto");
      if (m === "bloco-ceramico" || m === "alvenaria" || m === "bloco-concreto" || m === "celular" || m === "") return ok("parede-alvenaria", "arquitetura", "IFCWALL" + (m ? " + material " + m : " (material não informado: assumida alvenaria de vedação)"), m === "" ? "material-assumido" : "");
      if (m === "madeira") return ok("parede-madeira", "arquitetura", "IFCWALL + madeira");
      return ok("parede-alvenaria", "arquitetura", "IFCWALL + material «" + m + "» tratado como vedação (confirmar)", "material-assumido");
    }
    if (c === "IFCSLAB" || c === "IFCSLABSTANDARDCASE" || c === "IFCSLABELEMENTEDCASE") {
      if (pd === "BASESLAB" || /radier/.test(t)) return ok("radier", "estrutura", "IFCSLAB BASESLAB/«radier»");
      if (pd === "ROOF") return ok(m === "concreto" || m === "" ? "laje-cobertura" : "cobertura-telhado", "arquitetura", "IFCSLAB ROOF");
      if (pd === "LANDING") return ok("laje", "estrutura", "IFCSLAB LANDING (patamar)");
      if (/piso|contrapiso|acabamento/.test(sa(e.nome + e.tipoNome)) && m !== "concreto") return ok("piso-laje", "arquitetura", "IFCSLAB modelado como piso (nome/camadas)");
      return ok("laje", "estrutura", "IFCSLAB " + (pd || "FLOOR"));
    }
    if (c === "IFCCOVERING") {
      if (pd === "FLOORING") return ok("piso-acabamento", "arquitetura", "IFCCOVERING FLOORING");
      if (pd === "CEILING") return ok("forro", "arquitetura", "IFCCOVERING CEILING");
      if (pd === "CLADDING") return ok("revestimento-parede", "arquitetura", "IFCCOVERING CLADDING");
      if (pd === "ROOFING") return ok("cobertura-telhado", "arquitetura", "IFCCOVERING ROOFING");
      if (pd === "MOLDING" || pd === "SKIRTINGBOARD" || /rodape/.test(t)) return ok("rodape", "arquitetura", "IFCCOVERING MOLDING/SKIRTINGBOARD");
      if (/forro/.test(t)) return ok("forro", "arquitetura", "IFCCOVERING «forro»");
      if (/piso/.test(t)) return ok("piso-acabamento", "arquitetura", "IFCCOVERING «piso»");
      if (/revest|ceramic|azulejo/.test(t)) return ok("revestimento-parede", "arquitetura", "IFCCOVERING «revestimento»");
      return nao("IFCCOVERING sem PredefinedType nem nome que diga o que é (piso, forro, revestimento…): informe o tipo no modelo", "arquitetura");
    }
    if (c === "IFCROOF") return ok("cobertura-telhado", "arquitetura", "IFCROOF");
    if (c === "IFCBEAM" || c === "IFCBEAMSTANDARDCASE") {
      if (pd === "LINTEL") return ok("verga-modelada", "estrutura", "IFCBEAM LINTEL (verga já modelada)");
      if (m === "aco") return nao("viga de aço: o orçamento da estrutura metálica é do módulo Metálica (peso e perfil), fora das regras da F13", "estrutura");
      if (m === "madeira") return nao("viga de madeira: sem composição de catálogo na F13 (módulo Madeira)", "estrutura");
      return ok("viga-concreto", "estrutura", "IFCBEAM" + (m ? " + " + m : " (material não informado: assumido concreto)"), m ? "" : "material-assumido");
    }
    if (c === "IFCCOLUMN" || c === "IFCCOLUMNSTANDARDCASE") {
      if (m === "aco") return nao("pilar de aço: o orçamento da estrutura metálica é do módulo Metálica, fora das regras da F13", "estrutura");
      if (m === "madeira") return nao("pilar de madeira: sem composição de catálogo na F13 (módulo Madeira)", "estrutura");
      return ok("pilar-concreto", "estrutura", "IFCCOLUMN" + (m ? " + " + m : " (material não informado: assumido concreto)"), m ? "" : "material-assumido");
    }
    if (c === "IFCFOOTING") {
      if (pd === "PILE_CAP" || /bloco/.test(t)) return ok("bloco", "estrutura", "IFCFOOTING PILE_CAP");
      if (pd === "FOOTING_BEAM" || /baldrame/.test(t)) return ok("baldrame", "estrutura", "IFCFOOTING FOOTING_BEAM/«baldrame»");
      if (pd === "STRIP_FOOTING" || /corrida/.test(t)) return ok("sapata-corrida", "estrutura", "IFCFOOTING STRIP_FOOTING");
      return ok("sapata", "estrutura", "IFCFOOTING " + (pd || "PAD_FOOTING"));
    }
    if (c === "IFCPILE") return ok("estaca", "estrutura", "IFCPILE");
    if (c === "IFCREINFORCINGBAR" || c === "IFCREINFORCINGMESH") return ok("armadura-modelada", "estrutura", c + " (armação modelada: a taxa sugerida deixa de valer)");
    if (c === "IFCDOOR") return ok("porta", "arquitetura", "IFCDOOR" + (m ? " + " + m : ""));
    if (c === "IFCWINDOW") return ok("janela", "arquitetura", "IFCWINDOW" + (m ? " + " + m : ""));
    if (c === "IFCSTAIR" || c === "IFCSTAIRFLIGHT") return nao("escada: sem composição de catálogo na F13 (a medida do modelo não define o tipo: concreto, metálica ou madeira)", "arquitetura");
    if (c === "IFCRAMP" || c === "IFCRAMPFLIGHT") return nao("rampa: sem composição de catálogo na F13", "arquitetura");
    if (c === "IFCRAILING") return ok("guarda-corpo", "arquitetura", "IFCRAILING");
    if (c === "IFCPLATE") return nao("chapa/placa (IfcPlate): sem regra — informe o uso (forro, tampo, chapa de aço…)", "arquitetura");
    if (c === "IFCMEMBER") { if (/terca|caibro|ripa|tesoura|trama|rafter|purlin/.test(t) || pd === "RAFTER" || pd === "PURLIN" || pd === "CHORD" || pd === "BRACE" || pd === "POST" || pd === "STRUT") return ok("estrutura-telhado", "arquitetura", "IFCMEMBER de telhado (" + (pd || "nome") + ")"); return nao("IfcMember sem papel claro (estrutura de telhado, perfil metálico…): sem regra", "estrutura"); }
    if (c === "IFCFURNISHINGELEMENT" || c === "IFCFURNITURE" || c === "IFCSYSTEMFURNITUREELEMENT") return nao("mobiliário: fora do escopo do orçamento de obra (sem regra; entra só por decisão do engenheiro)", "arquitetura");
    if (c === "IFCBUILDINGELEMENTPROXY") return nao("elemento genérico (IfcBuildingElementProxy): sem classe — o conversor do BIM (bimifcconv) pode reclassificar; aqui fica «sem regra»", "indefinida");
    if (c === "IFCCHIMNEY" || c === "IFCSHADINGDEVICE" || c === "IFCBUILDINGELEMENTPART") return nao(c + ": sem regra", "arquitetura");
    if (c === "IFCPIPESEGMENT" || c === "IFCFLOWSEGMENT") {
      var s = sistemaTubo(e); var dn = diametroMm(e);
      var mt = m === "cpvc" || m === "ppr" || m === "pex" || m === "cobre" || m === "aco" || m === "pead" || m === "ferro-fundido" ? m : (m === "pvc" || m === "" ? "pvc" : m);
      var disc = s === "esgoto" ? "esgoto" : (s === "pluvial" ? "pluvial" : (s === "incendio" ? "incendio" : (s === "climatizacao" ? "climatizacao" : "hidraulica")));
      var r2 = ok("tubo", disc, "IFCPIPESEGMENT" + (s ? " + sistema " + s : " (sistema não informado)") + (dn ? " DN " + dn : ""), s);
      r2.mat = mt; r2.dn = dn; return r2;
    }
    if (c === "IFCPIPEFITTING" || c === "IFCFLOWFITTING") {
      var s2 = sistemaTubo(e), dn2 = diametroMm(e), disc2 = s2 === "esgoto" ? "esgoto" : (s2 === "pluvial" ? "pluvial" : (s2 === "incendio" ? "incendio" : "hidraulica"));
      var tp = /joelho|elbow|bend|curva/.test(t) || pd === "BEND" ? "joelho" : (/\bte\b|tee|\bt\b/.test(t) || pd === "JUNCTION" ? "te" : (/luva|coupling|connector/.test(t) || pd === "CONNECTOR" ? "luva" : (/juncao|y\b/.test(t) ? "juncao" : (pd === "TRANSITION" || /reducao|redutor/.test(t) ? "reducao" : ""))));
      var ang = /45/.test(t) ? 45 : 90;
      var r3 = ok("conexao", disc2, "IFCPIPEFITTING" + (tp ? " " + tp : " (tipo não identificado)"), s2); r3.dn = dn2; r3.tipoConexao = tp; r3.angulo = ang; return r3;
    }
    if (c === "IFCSANITARYTERMINAL") {
      var tl = pd === "WC" || pd === "TOILETPAN" || /bacia|vaso|wc\b|sanitaria|toilet/.test(t) ? "bacia" : (pd === "WASHHANDBASIN" || /lavatorio|lavabo|washbasin|handbasin/.test(t) ? "lavatorio" : (pd === "SHOWER" || /chuveiro|ducha|shower|box/.test(t) ? "chuveiro" : (pd === "SINK" || /pia|cuba|sink/.test(t) ? "pia" : (/tanque|laundry/.test(t) ? "tanque" : (pd === "URINAL" || /mictorio/.test(t) ? "mictorio" : (pd === "BATH" || /banheira/.test(t) ? "banheira" : (pd === "BIDET" || /bide/.test(t) ? "bide" : "")))))));
      if (!tl) return nao("IfcSanitaryTerminal sem tipo identificável (bacia, lavatório, chuveiro, pia…): informe o PredefinedType", "hidraulica");
      var r4_ = ok("louca", "hidraulica", "IFCSANITARYTERMINAL " + tl); r4_.sub = tl; return r4_;
    }
    if (c === "IFCWASTETERMINAL") return ok("ralo", "esgoto", "IFCWASTETERMINAL " + (pd || ""));
    if (c === "IFCVALVE") return ok("registro", "hidraulica", "IFCVALVE" + (pd ? " " + pd : ""));
    if (c === "IFCTANK") return ok("reservatorio", "hidraulica", "IFCTANK");
    if (c === "IFCPUMP") return nao("bomba: equipamento sob cotação (sem composição no catálogo da F13)", "hidraulica");
    if (c === "IFCBOILER" || c === "IFCWATERHEATER") return nao("aquecedor: equipamento sob cotação/projeto (sem composição fechada no catálogo da F13)", "hidraulica");
    if (c === "IFCFIRESUPPRESSIONTERMINAL") { var ex = /co2/.test(t) ? "co2" : (/pqs|po quimico|\bbc\b|abc/.test(t) ? "pqs" : ""); var r5 = ok("incendio-terminal", "incendio", "IFCFIRESUPPRESSIONTERMINAL " + (pd || "")); r5.sub = ex || (pd === "FIREEXTINGUISHER" || /extintor/.test(t) ? "extintor" : (pd === "HOSEREEL" || /hidrante|mangueira/.test(t) ? "hidrante" : "outro")); return r5; }
    if (c === "IFCOUTLET" || c === "IFCELECTRICAPPLIANCE" && /tomada/.test(t)) { var r6 = ok("tomada", "eletrica", "IFCOUTLET " + (pd || "")); r6.sub = /20 ?a|uso especifico|tue/.test(t) ? "20A" : "10A"; return r6; }
    if (c === "IFCSWITCHINGDEVICE") return ok("interruptor", "eletrica", "IFCSWITCHINGDEVICE " + (pd || ""));
    if (c === "IFCLIGHTFIXTURE") return ok("luminaria", "eletrica", "IFCLIGHTFIXTURE");
    if (c === "IFCLAMP") return nao("lâmpada avulsa: sem regra (a luminária já inclui a lâmpada nas composições LED)", "eletrica");
    if (c === "IFCELECTRICDISTRIBUTIONBOARD" || c === "IFCELECTRICDISTRIBUTIONPOINT") return ok("quadro-eletrico", "eletrica", c);
    if (c === "IFCJUNCTIONBOX") return ok("caixa-passagem", "eletrica", "IFCJUNCTIONBOX");
    if (c === "IFCCABLESEGMENT") return ok("cabo", "eletrica", "IFCCABLESEGMENT");
    if (c === "IFCCABLECARRIERSEGMENT" || c === "IFCCABLECARRIERFITTING") { var eld = diametroMm(e), r7 = ok(c === "IFCCABLECARRIERFITTING" ? "eletroduto-conexao" : "eletroduto", "eletrica", c + (pd ? " " + pd : "")); r7.dn = eld; return r7; }
    if (c === "IFCPROTECTIVEDEVICE") return ok("disjuntor", "eletrica", "IFCPROTECTIVEDEVICE");
    if (c === "IFCLIGHTNINGPROTECTION" || /spda|para-?raio|captor/.test(t)) return nao("SPDA modelado: o catálogo trata SPDA por quantidade de captores/hastes do projeto — sem regra automática da F13", "spda");
    if (/^IFC(AIRTERMINAL|DUCT|UNITARYEQUIPMENT|FAN|CHILLER|COIL|COMPRESSOR|CONDENSER|EVAPORATOR|COOLED|HEATEXCHANGER|AIRTOAIR|DAMPER|FILTER)/.test(c)) return nao("climatização/ventilação (" + c + "): equipamento e rede sob projeto/cotação — sem composição no catálogo da F13", "climatizacao");
    if (/^IFC(COMMUNICATIONSAPPLIANCE|AUDIOVISUAL|SENSOR|ACTUATOR|ALARM|CONTROLLER|FLOWMETER|FLOWINSTRUMENT|TRANSFORMER|MOTORCONNECTION|GENERATOR|ELECTRICFLOWSTORAGE|SOLARDEVICE|ELECTRICGENERATOR|ELECTRICMOTOR|ELECTRICTIMECONTROL|TELECOM)/.test(c)) return nao("elétrica/telecom/automação (" + c + "): sem regra na F13 (SPDA, CFTV, alarme etc. entram por projeto)", "eletrica");
    if (c === "IFCGEOGRAPHICELEMENT" || c === "IFCCIVILELEMENT" || c === "IFCTRANSPORTELEMENT" || c === "IFCSOLARDEVICE") return nao(c + ": terreno/obra civil/transporte vertical — sem regra na F13 (movimento de terra e elevador entram por projeto)", "terreno");
    if (c === "IFCDISTRIBUTIONCHAMBERELEMENT") return nao("caixa/câmara de inspeção: sem composição fechada no catálogo da F13", "esgoto");
    if (c === "IFCPLATE" || c === "IFCOPENINGELEMENT") return nao(c + ": sem regra", "");
    return nao("classe " + c + " sem regra na F13 (não reconhecida): listada para decisão do engenheiro", "indefinida");
  }

  /* ---------------------------------------------------------------- adaptador: peças do viewer do BIM */
  function deElementosViewer(els) {
    var res = { ok: true, erro: "", esquema: "viewer", elementos: [], espacos: [], avisos: ["Leitura pelas peças já abertas no BIM: o viewer não traz Psets, camadas nem ambientes — o que depende disso fica «sem regra» ou sugerido. Para a leitura completa, escolha o arquivo .ifc."], cobertura: null, unidades: { comprimento: 1 }, modelo: { projeto: "", pavimentos: [] } };
    var sem = [], por = {}, cl = 0, porDisc = {}, naoEl = {};
    arr(els).forEach(function (x, i) {
      if (!x || !x.tipo) return;
      var q = x.qto || {};
      var e = {
        id: x.uid || x.id || i, globalId: x.globalId || "", classe: String(x.tipo).toUpperCase().replace(/[^A-Z0-9]/g, ""), predef: "", nome: x.nomeIfc || x.nome || "", objetoTipo: "", tipoNome: x.familia || "", tag: x.tag || "", pavimento: x.pavimento || "",
        psets: {}, qto: {}, qtoFonte: {}, materiais: arr(x.materiais).map(function (m) { return typeof m === "string" ? m : (m && (m.nome || m.material)) || ""; }).filter(Boolean), camadas: [], conjuntoNome: "", ambientes: [], ambienteCat: "", externo: null,
        classificacao: [], vaos: [], sistema: x.sistemaIfc || "", chave: x.chave || ""
      };
      var mapa = { comprimento: "comprimento", area: "area", volume: "volume", peso: "peso", largura: "largura", altura: "altura" }, k;
      for (k in mapa) if (q[k] > 0) { e.qto[mapa[k]] = q[k]; e.qtoFonte[mapa[k]] = "ifc"; }
      if (x.aabb && x.aabb.min && x.aabb.max) {
        var d = [Math.abs(x.aabb.max[0] - x.aabb.min[0]), Math.abs(x.aabb.max[1] - x.aabb.min[1]), Math.abs(x.aabb.max[2] - x.aabb.min[2])].sort(function (a, b) { return b - a; });
        if (!(e.qto.comprimento > 0)) { e.qto.comprimento = d[0]; e.qtoFonte.comprimento = "estimado"; }
        if (!(e.qto.area > 0)) { e.qto.area = d[0] * d[1]; e.qtoFonte.area = "estimado"; }
        if (!(e.qto.volume > 0)) { e.qto.volume = d[0] * d[1] * d[2]; e.qtoFonte.volume = "estimado"; }
      }
      if (/^IFC(SPACE|SITE|BUILDING|BUILDINGSTOREY|PROJECT|GRID|ANNOTATION)$|^IFC(OPENING|VIRTUAL)/.test(e.classe)) { naoEl.espacialOuVazio = (naoEl.espacialOuVazio || 0) + 1; return; }
      var c = classificar(e);
      e.papel = c.papel; e.disciplina = c.disciplina; e.regra = c.regra; e.sub = c.sub || ""; e.semRegra = !c.papel; e.motivo = c.motivo || "";
      if (c.dn !== undefined) e.dn = c.dn; if (c.mat) e.matTubo = c.mat; if (c.tipoConexao !== undefined) { e.tipoConexao = c.tipoConexao; e.angulo = c.angulo; }
      if (c.papel) { cl++; por[c.papel] = (por[c.papel] || 0) + 1; } else sem.push({ id: e.id, classe: e.classe, nome: e.nome, tipo: e.tipoNome, material: e.materiais.join(" / "), motivo: c.motivo });
      porDisc[e.disciplina || "indefinida"] = (porDisc[e.disciplina || "indefinida"] || 0) + 1;
      res.elementos.push(e);
    });
    res.cobertura = { entidades: res.elementos.length, estruturaEspacial: 0, ambientes: 0, tipos: 0, lidos: res.elementos.length, classificados: cl, semRegra: sem, porPapel: por, porDisciplina: porDisc, naoElemento: naoEl, naoReconhecidas: {}, complexas: 0, semQuantidade: 0, completa: sem.length + cl === res.elementos.length };
    return res;
  }

  function textoCobertura(res) {
    var c = res && res.cobertura; if (!c) return "";
    var l = [c.lidos + " elemento(s) lido(s) → " + c.classificados + " classificado(s), " + c.semRegra.length + " sem regra" + (c.completa ? " (cobertura 100 %: nada descartado)" : " — ATENÇÃO: contagem não fecha")];
    c.semRegra.forEach(function (s) { l.push("  sem regra: " + s.classe + (s.predef ? " " + s.predef : "") + " «" + s.nome + "»" + (s.material ? " [" + s.material + "]" : "") + " — " + s.motivo); });
    return l.join("\n");
  }

  var MorIfcLer = {
    ler: ler, deElementosViewer: deElementosViewer, textoCobertura: textoCobertura,
    classificar: classificar, materialClasse: materialClasse, ambienteCat: ambienteCat, sistemaTubo: sistemaTubo,
    _parseArgs: parseArgs, _varrer: varrer, _decodificar: decodificar, _diametroMm: diametroMm, _matEl: matEl, _txtEl: txtEl
  };
  if (typeof module !== "undefined" && module.exports) module.exports = MorIfcLer;
  global.MorIfcLer = MorIfcLer;
})(typeof window !== "undefined" ? window : globalThis);
