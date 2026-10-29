/* =====================================================================
 * bimenviarsu.js — ENVIAR O MODELO DO ORÇAPRO PARA O SKETCHUP (motor puro, ES5)
 *
 * Fase S1 do docs/PLANO-ENVIAR-SKETCHUP-REVIT.md (29/10/2026). Pedido do
 * Rogério: "a modelagem que a gente fez aqui converter para o SketchUp e vir
 * com tudo lá, as informações".
 *
 * O QUE FAZ. Recebe as MALHAS que estão na cena do editor (já com a matriz de
 * cada uma), o registro de parâmetros resolvido (BimParam.resolver — o mesmo
 * que alimenta a paleta de Propriedades) e o estado do editor, e devolve o
 * documento `<projeto>.orcapro-su.json`: o formato OrcaPRO-Malha v1 (o que a
 * extensão do SketchUp já exporta e o BIM já importa) MAIS o que só o OrçaPRO
 * sabe: classe IFC, fase, marca, comentários, código de orçamento, nível,
 * ambiente e TODOS os parâmetros, materiais com nome estável, e as famílias
 * como DEFINIÇÕES (a mesma família+tipo vira um componente só no SketchUp,
 * reaproveitado em cada colocação).
 *
 * ⚠ POR QUE UM SUPERCONJUNTO DO MALHA v1 (e não um formato novo): o leitor
 *   que já existe (bim.js, "OrcaPRO-Malha") ignora campos que não conhece, e
 *   a extensão do SketchUp que o gera é a mesma que vai ler este. Uma peça
 *   de FAMÍLIA vai SEM posicoes/indices (vai `instancia`: definição + matriz);
 *   o resto leva a geometria já no mundo, em metros, Y para cima.
 *
 * ⚠ ESPAÇO DE VISTAS E PRANCHAS (S2): `vistas` e `pranchas` já existem no
 *   documento, vazios, de propósito — a fase S2 preenche sem mudar a versão
 *   do contrato do resto.
 *
 * Sem DOM, sem THREE: roda em Node (tools/test-bimenviarsu.js).
 *
 *   BimEnviarSU.montar(entrada) -> { ok, doc, resumo, avisos }
 *   entrada = {
 *     projeto, versaoApp, niveis:[{id,nome,elevacao}],
 *     malhas:[{ id, matriz:[16 colunas], pos:[x,y,z…] LOCAL, idx:[…]|null,
 *               cor:[r,g,b] 0..1 sRGB, opacidade, matNome }],
 *     elementos:[{ id, tipo:'IFCWALL', nome, codOrc, disciplina,
 *                  familia:{famId,tipoId}, famCategoria, famNome, tipoNome }],
 *     res: BimParam.resolver(...)  (opcional: sem ele vai só o que o elemento diz),
 *     estado: { ambientes:[{id,nome,numero,calc:{contorno,base,topo}}], caixas, familias },
 *     agora: ISO (teste determinístico)
 *   }
 * ===================================================================== */
(function (global) {
  "use strict";

  function arr(a) { return Array.isArray(a) ? a : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function num(v, d) { var n = Number(v); return isFinite(n) ? n : d; }
  function r4(v) { return Math.round(v * 10000) / 10000; }

  /* IFC em maiúsculas (o que o editor grava) → o nome do tipo no esquema IFC4 do SketchUp */
  var IFC_NOME = {
    IFCWALL: "IfcWall", IFCWALLSTANDARDCASE: "IfcWall", IFCSLAB: "IfcSlab", IFCCOLUMN: "IfcColumn", IFCBEAM: "IfcBeam", IFCROOF: "IfcRoof",
    IFCDOOR: "IfcDoor", IFCWINDOW: "IfcWindow", IFCSTAIR: "IfcStair", IFCSTAIRFLIGHT: "IfcStairFlight", IFCRAILING: "IfcRailing",
    IFCCOVERING: "IfcCovering", IFCFOOTING: "IfcFooting", IFCPLATE: "IfcPlate", IFCMEMBER: "IfcMember", IFCSPACE: "IfcSpace",
    IFCFURNISHINGELEMENT: "IfcFurnishingElement", IFCBUILDINGELEMENTPROXY: "IfcBuildingElementProxy", IFCSANITARYTERMINAL: "IfcSanitaryTerminal",
    IFCPIPESEGMENT: "IfcPipeSegment", IFCPIPEFITTING: "IfcPipeFitting", IFCFLOWTERMINAL: "IfcFlowTerminal", IFCLIGHTFIXTURE: "IfcLightFixture",
    IFCCABLECARRIERSEGMENT: "IfcCableCarrierSegment", IFCFLOWSEGMENT: "IfcFlowSegment", IFCFLOWFITTING: "IfcFlowFitting",
    IFCSITE: "IfcSite", IFCGEOGRAPHICELEMENT: "IfcGeographicElement", IFCPILE: "IfcPile", IFCELEMENTASSEMBLY: "IfcElementAssembly"
  };
  function ifcNome(t) { var k = txt(t).toUpperCase(); return IFC_NOME[k] || (k ? "IfcBuildingElementProxy" : ""); }

  /* categoria do registro → etiqueta de MODELAGEM (plural, como o arquiteto vê no SketchUp) */
  var ROTULO_CAT = {
    parede: "Paredes", laje: "Pisos", forro: "Forros", cobertura: "Cobertura", telhado: "Cobertura", borda: "Cobertura", platibanda: "Cobertura",
    porta: "Esquadrias", janela: "Esquadrias", pilar: "Estrutura", viga: "Estrutura", fundacao: "Estrutura", escada: "Escadas", lance: "Escadas", patamar: "Escadas",
    guarda: "Guarda-corpos", rodape: "Rodapés", ambiente: "Ambientes", generico: "Mobiliário",
    dispositivo_eletrico: "Instalações", luminaria: "Instalações", equipamento_eletrico: "Instalações", mep: "Instalações",
    topossolido: "Terreno", subregiao: "Terreno", plataforma: "Terreno", divisa: "Terreno", componente_terreno: "Terreno"
  };
  /* a categoria da FAMÍLIA (biblioteca) quando ela é mais específica que "generico" */
  var ROTULO_FAM = {
    loucas: "Louças e metais", equipamento: "Equipamentos", acessorio_tubulacao: "Instalações", andaime: "Andaime", pilar: "Estrutura", viga: "Estrutura", estrutural: "Estrutura",
    porta: "Esquadrias", janela: "Esquadrias", mobiliario: "Mobiliário", moveis: "Mobiliário"
  };
  /* a peça que não passa pelo registro (volume livre, metálica, rufo…) é etiquetada pela classe IFC */
  var ROTULO_IFC = {
    IfcWall: "Paredes", IfcSlab: "Pisos", IfcColumn: "Estrutura", IfcBeam: "Estrutura", IfcMember: "Estrutura", IfcPlate: "Estrutura", IfcFooting: "Estrutura", IfcPile: "Estrutura",
    IfcRoof: "Cobertura", IfcCovering: "Forros e revestimentos", IfcDoor: "Esquadrias", IfcWindow: "Esquadrias", IfcStair: "Escadas", IfcStairFlight: "Escadas", IfcRailing: "Guarda-corpos",
    IfcPipeSegment: "Instalações", IfcPipeFitting: "Instalações", IfcFlowSegment: "Instalações", IfcFlowFitting: "Instalações", IfcFlowTerminal: "Instalações",
    IfcSanitaryTerminal: "Louças e metais", IfcLightFixture: "Instalações", IfcCableCarrierSegment: "Instalações", IfcFurnishingElement: "Mobiliário",
    IfcSite: "Terreno", IfcGeographicElement: "Terreno", IfcBuildingElementProxy: "Volumes e outros"
  };
  var DISC_ROTULO = { arquitetura: "Arquitetura", estrutura: "Estrutura", hidro: "Hidrossanitário", hidraulica: "Hidrossanitário", hidrossanitario: "Hidrossanitário", eletrica: "Elétrica", climatizacao: "Climatização", metalica: "Estrutura metálica", madeira: "Estrutura de madeira", marmoraria: "Marmoraria", outros: "Outros" };
  function discRotulo(d) { var k = txt(d).toLowerCase(); return DISC_ROTULO[k] || (k ? k.charAt(0).toUpperCase() + k.slice(1) : "Arquitetura"); }

  /* ---------- álgebra 4x4 em ordem de coluna (a do three.js) ---------- */
  function mulPonto(m, x, y, z) {
    return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
  }
  /* inversa de uma matriz AFIM (última linha 0 0 0 1) — a das peças do editor (posição + rotação + escala) */
  function inversaAfim(m) {
    var a = m[0], b = m[4], c = m[8], d = m[1], e = m[5], f = m[9], g = m[2], h = m[6], i = m[10];
    var det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
    if (Math.abs(det) < 1e-12) return null;
    var id = 1 / det;
    var A = (e * i - f * h) * id, B = (c * h - b * i) * id, C = (b * f - c * e) * id,
        D = (f * g - d * i) * id, E = (a * i - c * g) * id, F = (c * d - a * f) * id,
        G = (d * h - e * g) * id, H = (b * g - a * h) * id, I = (a * e - b * d) * id;
    var tx = m[12], ty = m[13], tz = m[14];
    return [A, D, G, 0, B, E, H, 0, C, F, I, 0, -(A * tx + B * ty + C * tz), -(D * tx + E * ty + F * tz), -(G * tx + H * ty + I * tz), 1];
  }
  function mulMat(p, q) {   /* p * q */
    var o = new Array(16), r, c, k;
    for (c = 0; c < 4; c++) for (r = 0; r < 4; r++) { var s = 0; for (k = 0; k < 4; k++) s += p[k * 4 + r] * q[c * 4 + k]; o[c * 4 + r] = s; }
    return o;
  }
  function arred16(m, n) { var f = Math.pow(10, n); return m.map(function (v) { var r = Math.round(v * f) / f; return r === 0 ? 0 : r; }); }

  /* hash curto e estável (FNV-1a 32) de uma lista de números/strings */
  function hash(partes) {
    var h = 0x811c9dc5 >>> 0, s = partes.join("|"), i;
    for (i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return ("00000000" + h.toString(16)).slice(-8);
  }
  function hashNums(a, casas) {
    var h = 0x811c9dc5 >>> 0, f = Math.pow(10, casas), i;
    for (i = 0; i < a.length; i++) { var v = Math.round(a[i] * f); h ^= (v & 0xffff); h = Math.imul(h, 0x01000193) >>> 0; h ^= ((v >> 16) & 0xffff); h = Math.imul(h, 0x01000193) >>> 0; }
    return ("00000000" + h.toString(16)).slice(-8) + ":" + a.length;
  }

  function hex(c) { return [0, 1, 2].map(function (i) { return ("0" + Math.max(0, Math.min(255, Math.round(num(c[i], 0.8) * 255))).toString(16)).slice(-2); }).join("").toUpperCase(); }
  function rgb255(c) { return [0, 1, 2].map(function (i) { return Math.max(0, Math.min(255, Math.round(num(c[i], 0.8) * 255))); }); }

  /* nome ESTÁVEL do material: o do projeto/cena quando existe; senão a cor (a mesma cor = o mesmo material, em qualquer reenvio) */
  function nomeMaterial(mm) {
    var op = Math.round(num(mm.opacidade, 1) * 100);
    var base = txt(mm.matNome).replace(/\s+/g, " ").trim();
    if (!base) base = "Cor " + hex(mm.cor || [0.8, 0.8, 0.8]);
    if (op < 100 && !/%/.test(base)) base += " " + op + "%";
    return "OrcaPRO · " + base;
  }

  /* ponto dentro de um polígono [{x,z}] */
  function dentro(px, pz, pol) {
    var d = false, i, j;
    for (i = 0, j = pol.length - 1; i < pol.length; j = i++) {
      var xi = pol[i].x, zi = pol[i].z, xj = pol[j].x, zj = pol[j].z;
      if (((zi > pz) !== (zj > pz)) && (px < (xj - xi) * (pz - zi) / (zj - zi) + xi)) d = !d;
    }
    return d;
  }

  function distContorno(px, pz, pol) {
    var m = 1e9, i, j;
    for (i = 0, j = pol.length - 1; i < pol.length; j = i++) {
      var ax = pol[j].x, az = pol[j].z, bx = pol[i].x, bz = pol[i].z, dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
      var t = L2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2)) : 0;
      var d = Math.sqrt(Math.pow(px - (ax + t * dx), 2) + Math.pow(pz - (az + t * dz), 2));
      if (d < m) m = d;
    }
    return m;
  }

  function nivelDe(niveis, y) {
    var ach = null;
    arr(niveis).forEach(function (n) { if (num(n.elevacao, 0) <= y + 0.05 && (!ach || num(n.elevacao, 0) >= num(ach.elevacao, 0))) ach = n; });
    return ach || (arr(niveis)[0] || null);
  }

  function grupoDe(it) { return txt(it && it.def && it.def.grupo) || "Outros"; }

  /* ============================================================ montar */
  function montar(e) {
    e = e || {};
    var avisos = [], niveis = arr(e.niveis).map(function (n) { return { id: txt(n.id), nome: txt(n.nome), elevacao: r4(num(n.elevacao, 0)) }; });
    var elPorId = {}; arr(e.elementos).forEach(function (x) { if (x && x.id != null) elPorId[String(x.id)] = x; });
    var resPorId = (e.res && e.res.porId) || {};
    var ambientes = arr(e.estado && e.estado.ambientes).filter(function (a) { return a && a.calc && arr(a.calc.contorno).length >= 3; });

    /* malhas por peça, na ordem em que aparecem */
    var ordem = [], porPeca = {};
    arr(e.malhas).forEach(function (m) {
      if (!m || !m.pos || m.pos.length < 9) return;
      var id = String(m.id);
      if (!porPeca[id]) { porPeca[id] = []; ordem.push(id); }
      porPeca[id].push(m);
    });

    var materiais = {}, ordemMat = [];
    function material(mm) {
      var nome = nomeMaterial(mm);
      if (!materiais[nome]) { materiais[nome] = { nome: nome, cor: rgb255(mm.cor || [0.8, 0.8, 0.8]), opacidade: Math.round(num(mm.opacidade, 1) * 1000) / 1000, pecas: 0 }; ordemMat.push(nome); }
      return materiais[nome];
    }

    var definicoes = {}, ordemDef = [], nomesDef = {};
    var objetos = [], tri = 0, nInst = 0, semMalha = 0, bbox = { min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] };
    function cresce(p) { for (var k = 0; k < 3; k++) { if (p[k] < bbox.min[k]) bbox.min[k] = p[k]; if (p[k] > bbox.max[k]) bbox.max[k] = p[k]; } }

    ordem.forEach(function (id) {
      var ms = porPeca[id], el = elPorId[id] || {}, pc = resPorId[id] || null;
      var ehFam = !!(el.familia && el.familia.famId != null);
      var cat = pc ? pc.categoria : (ehFam ? "generico" : "");
      var ifc = ifcNome(el.tipo);
      /* a etiqueta: instalações (mep) juntas; a categoria da família quando o registro só diz "genérico"; sem registro, a classe IFC */
      var rotCat;
      if (pc && pc.origem === "mep") rotCat = "Instalações";
      else if (cat === "generico" && ehFam && ROTULO_FAM[txt(el.famCategoria)]) rotCat = ROTULO_FAM[txt(el.famCategoria)];
      else if (pc && ROTULO_CAT[cat]) rotCat = ROTULO_CAT[cat];
      else if (el.volume && el.volume.categoria && ROTULO_CAT[el.volume.categoria] && el.volume.categoria !== "generico") rotCat = ROTULO_CAT[el.volume.categoria];
      else rotCat = ROTULO_IFC[ifc] || (ehFam ? "Mobiliário" : "Outros");
      var disc = discRotulo(el.disciplina);
      var tag = disc === rotCat ? disc : disc + " - " + rotCat;
      var nome = txt(el.nome) || (pc ? pc.nomeCategoria : id);
      var marca = pc && pc.marca != null ? txt(pc.marca) : "";
      var tipoNome = pc ? txt(pc.tipoNome) : txt(el.tipoNome);
      var famNome = txt(el.famNome);
      var defNome = ehFam ? ((famNome || nome) + (tipoNome && tipoNome !== famNome && (famNome || nome).indexOf(tipoNome) < 0 ? " : " + tipoNome : "")) : "";

      /* matérias das malhas → material dominante da peça (maior nº de triângulos) */
      var porMat = {}, domN = -1, dom = null;
      ms.forEach(function (m) {
        var mt = material(m), n = (m.idx ? m.idx.length : m.pos.length / 3) / 3;
        porMat[mt.nome] = (porMat[mt.nome] || 0) + n;
        if (porMat[mt.nome] > domN) { domN = porMat[mt.nome]; dom = mt; }
      });
      if (dom) dom.pecas++;

      /* parâmetros: todos os da paleta com valor */
      var parametros = [];
      if (pc) arr(pc.params).forEach(function (it) {
        var tx = txt(it.texto);
        if (it.valor == null && !tx) return;
        if (tx === "" && (it.valor === "" || it.valor == null)) return;
        parametros.push({ grupo: grupoDe(it), nome: txt(it.def.nome), id: txt(it.def.id), lado: txt(it.def.lado), un: txt(it.def.un), valor: (typeof it.valor === "number" || typeof it.valor === "boolean") ? it.valor : txt(it.valor), texto: tx });
      });
      /* sem registro (volume livre, metálica, rufo…): o que o editor mede da peça — o quantitativo — e o que ela é */
      if (!pc) {
        var QT = [["comprimento", "Comprimento", "m"], ["area", "Área", "m²"], ["areaVaos", "Área dos vãos", "m²"], ["volume", "Volume", "m³"], ["quantidade", "Quantidade", ""], ["contagem", "Contagem", ""]];
        QT.forEach(function (q) { var v = el.qto ? el.qto[q[0]] : null; if (typeof v === "number" && isFinite(v)) parametros.push({ grupo: "Quantitativo", nome: q[1], id: "QTO_" + q[0], lado: "instancia", un: q[2], valor: v, texto: String(Math.round(v * 10000) / 10000).replace(".", ",") }); });
        parametros.push({ grupo: "Dados de identidade", nome: "Nome", id: "NOME", lado: "instancia", un: "", valor: txt(el.nome), texto: txt(el.nome) });
        if (el.volume && el.volume.material) parametros.push({ grupo: "Materiais e acabamentos", nome: "Material", id: "MATERIAL", lado: "instancia", un: "", valor: txt(el.volume.material), texto: txt(el.volume.material) });
      }
      function param(idDef) { for (var i = 0; i < parametros.length; i++) if (parametros[i].id === idDef) return parametros[i]; return null; }

      /* posição de referência: caixa da peça no mundo (para nível e ambiente) */
      var lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
      var mundo = ms.map(function (m) {
        var o = new Array(m.pos.length), i, p;
        for (i = 0; i < m.pos.length; i += 3) {
          p = mulPonto(m.matriz, m.pos[i], m.pos[i + 1], m.pos[i + 2]);
          o[i] = r4(p[0]); o[i + 1] = r4(p[1]); o[i + 2] = r4(p[2]);
          for (var k = 0; k < 3; k++) { if (p[k] < lo[k]) lo[k] = p[k]; if (p[k] > hi[k]) hi[k] = p[k]; }
        }
        return o;
      });
      cresce(lo); cresce(hi);
      var cx = (lo[0] + hi[0]) / 2, cz = (lo[2] + hi[2]) / 2;

      var nivel = nivelDe(niveis, lo[1]);
      var elObj = null;
      if (e.estado) {
        var lst = (e.estado.caixas || []).concat(e.estado.familias || []);
        for (var q = 0; q < lst.length; q++) if (lst[q] && String(lst[q].id) === id) { elObj = lst[q]; break; }
      }
      if (elObj && elObj.nivelId != null) { var nv = niveis.filter(function (n) { return n.id === String(elObj.nivelId); })[0]; if (nv) nivel = nv; }
      /* ambiente: o que contém o centro da peça; parede e esquadria ficam na ESPESSURA da parede, fora do contorno (face do acabamento) —
         então vale o ambiente a até 0,35 m do centro, e a parede entre dois ambientes leva os dois */
      var ambs = [];
      if (cat !== "ambiente") {
        ambientes.forEach(function (a) {
          var base = num(a.calc.base, null), topo = num(a.calc.topo, null);
          if (base != null && topo != null && (lo[1] > topo - 0.05 || hi[1] < base - 0.05)) return;
          if (dentro(cx, cz, a.calc.contorno) || distContorno(cx, cz, a.calc.contorno) <= 0.35) ambs.push(a);
        });
      }
      var ambTxt = ambs.slice(0, 3).map(function (a) { return txt(a.nome) + (a.numero ? " (" + a.numero + ")" : ""); }).join(" / ");
      var fase = param("PHASE_CREATED"), coment = param("ALL_MODEL_INSTANCE_COMMENTS");
      var cods = [];
      if (el.codOrc) cods.push(txt(el.codOrc));
      arr(elObj && elObj.servicos).forEach(function (s) { if (s && s.codigo && cods.indexOf(txt(s.codigo)) < 0) cods.push(txt(s.codigo)); });
      ["RA_FAM_CODIGO", "RA_MEP_CODIGO"].forEach(function (idc) { var pcod = param(idc); if (pcod && pcod.texto && pcod.texto !== "pendente" && cods.indexOf(pcod.texto) < 0) cods.push(pcod.texto); });

      var ident = {
        Id: id, GlobalId: (param("IFC_GUID") && param("IFC_GUID").texto) || txt(el.guid), Categoria: pc ? txt(pc.nomeCategoria) : rotCat, ClasseIFC: ifc,
        Disciplina: disc, Etiqueta: tag, Familia: famNome, Tipo: tipoNome, Marca: marca,
        Comentarios: coment ? coment.texto : "", Fase: fase ? fase.texto : "",
        CodigoOrcamento: cods.join("; "), Nivel: nivel ? nivel.nome : "", Ambiente: ambTxt,
        Material: dom ? dom.nome : ""
      };
      var atr = { OrcaPRO: ident, "OrcaPRO_Parametros": {} };
      parametros.forEach(function (p) {
        var k = p.grupo + " | " + p.nome;
        if (atr.OrcaPRO_Parametros[k] === undefined) atr.OrcaPRO_Parametros[k] = p.texto || txt(p.valor);
      });

      var obj = {
        id: id, nome: nome + (marca ? " · " + marca : ""), definicao: ehFam ? defNome : "", tag: tag, disciplina: disc, categoria: rotCat,
        ifc: ifc, material: dom ? dom.nome : "", cor: dom ? dom.cor : [200, 204, 210], opacidade: dom ? dom.opacidade : 1,
        nivel: ident.Nivel, ambiente: ident.Ambiente, marca: marca, fase: ident.Fase, comentarios: ident.Comentarios, codigoOrcamento: ident.CodigoOrcamento,
        guid: ident.GlobalId || id, caminho: [disc, rotCat, nome].join(" › "), atributos: atr, parametros: parametros
      };

      if (ehFam) {
        /* a família: geometria LOCAL na definição, colocação por matriz (a 1ª malha é a âncora da peça) */
        var W0 = ms[0].matriz, inv = inversaAfim(W0);
        if (!inv) { ehFam = false; avisos.push("Peça " + id + ": matriz não inversível; foi como geometria solta."); }
        else {
          var partes = ms.map(function (m, ix) {
            var rel = ix === 0 ? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] : arred16(mulMat(inv, m.matriz), 4);
            var mt = material(m);
            var pos = new Array(m.pos.length);
            for (var i = 0; i < m.pos.length; i++) pos[i] = r4(m.pos[i]);
            var idx = m.idx ? Array.prototype.slice.call(m.idx) : (function () { var t = []; for (var k = 0; k < m.pos.length / 3; k++) t.push(k); return t; })();
            return { matriz: rel, material: mt.nome, posicoes: pos, indices: idx, _sig: hash([hashNums(pos, 3), hashNums(idx, 0), rel.join(","), mt.nome]) };
          });
          var chave = defNome + "#" + hash(partes.map(function (p) { return p._sig; }));
          if (!definicoes[chave]) {
            var nm = defNome, n2 = 2;
            while (nomesDef[nm]) { nm = defNome + " #" + n2; n2++; }
            nomesDef[nm] = 1;
            partes.forEach(function (p) { delete p._sig; });
            definicoes[chave] = { nome: nm, familia: famNome, tipo: tipoNome, ifc: ifc, tag: tag, partes: partes, usos: 0 };
            ordemDef.push(chave);
          }
          definicoes[chave].usos++;
          obj.definicao = definicoes[chave].nome;
          obj.instancia = { definicao: definicoes[chave].nome, matriz: arred16(W0, 5) };
          nInst++;
          partes.forEach(function (p) { tri += p.indices.length / 3; });
        }
      }
      if (!ehFam) {
        /* geometria no mundo, uma lista só (as malhas da peça concatenadas) */
        var pos2 = [], idx2 = [];
        ms.forEach(function (m, ix) {
          var base2 = pos2.length / 3, w = mundo[ix], i;
          for (i = 0; i < w.length; i++) pos2.push(w[i]);
          if (m.idx) for (i = 0; i < m.idx.length; i++) idx2.push(base2 + m.idx[i]);
          else for (i = 0; i < w.length / 3; i++) idx2.push(base2 + i);
        });
        obj.posicoes = pos2; obj.indices = idx2; tri += idx2.length / 3;
        if (!idx2.length) { semMalha++; return; }
      }
      objetos.push(obj);
    });

    var resumo = {
      pecas: objetos.length, triangulos: tri, instancias: nInst, definicoes: ordemDef.length, materiais: ordemMat.length,
      ocultosNaoExportados: 0, semMalha: semMalha,
      porEtiqueta: {}, comParametros: objetos.filter(function (o) { return o.parametros.length; }).length
    };
    objetos.forEach(function (o) { resumo.porEtiqueta[o.tag] = (resumo.porEtiqueta[o.tag] || 0) + 1; });
    if (!objetos.length) return { ok: false, erro: "nada modelado para enviar", avisos: avisos };

    var tagsOrd = Object.keys(resumo.porEtiqueta).sort();
    /* cenas: a 3D e uma planta por nível (o SketchUp as cria; a altura de corte é a de planta, 1,20 m acima do piso) */
    var cenas = [{ nome: "OrçaPRO - 3D", tipo: "3d" }];
    niveis.forEach(function (n) { cenas.push({ nome: "OrçaPRO - Planta " + n.nome, tipo: "planta", nivel: n.nome, elevacao: n.elevacao, corte: r4(n.elevacao + 1.2) }); });

    var doc = {
      formato: "OrcaPRO-Malha", versao: 1, programa: "OrçaPRO", subformato: "orcapro-su", subversao: 1,
      versaoPrograma: txt(e.versaoApp), extensao: "", modelo: txt(e.projeto) || "Projeto OrçaPRO", arquivo: "", unidade: "m", eixoY: "cima",
      criadoEm: e.agora || new Date().toISOString(),
      resumo: resumo,
      niveis: niveis,
      etiquetas: tagsOrd.map(function (t) { return { nome: t, pecas: resumo.porEtiqueta[t] }; }),
      materiais: ordemMat.map(function (n) { return materiais[n]; }),
      definicoes: ordemDef.map(function (k) { return definicoes[k]; }),
      cenas: cenas,
      caixa: { min: bbox.min.map(r4), max: bbox.max.map(r4) },
      vistas: [], pranchas: [],   /* S2: plantas/cortes/fachadas e pranchas do sistema entram aqui, sem mudar o resto do contrato */
      objetos: objetos
    };
    return { ok: true, doc: doc, resumo: resumo, avisos: avisos };
  }

  var BimEnviarSU = { montar: montar, ifcNome: ifcNome, nomeMaterial: nomeMaterial, inversaAfim: inversaAfim, mulMat: mulMat, ROTULO_CAT: ROTULO_CAT, IFC_NOME: IFC_NOME };
  global.BimEnviarSU = BimEnviarSU;
  if (typeof module !== "undefined" && module.exports) module.exports = BimEnviarSU;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
