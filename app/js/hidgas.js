/* =====================================================================
 * hidgas.js — APARELHOS A GÁS: conferência da ABNT NBR 13103:2020 (FRENTE H6, 21/10/2026). Motor PURO, ES5,
 * Node-testável. Não grava nada: devolve os ACHADOS (cada um com o que é, Corrigir quando há correção automática e os
 * elementos para Mostrar no 3D).
 *
 * POR QUE. Até a 1.2.171 o "Traçar automaticamente" só dizia "ventilação e chaminé conforme a NBR 13103" (a norma não estava
 * na biblioteca) e acusava o aquecedor no banheiro por vizinhança de louça. Com os VALORES da norma transcritos
 * (dados-fonte/hidro/normas/nbr13103.json — exemplar NÃO licenciado: só valores, com o item; exemplarLicenciado:false), a
 * conferência passa a ser real: local proibido, potência por ambiente, volume e área de ventilação (quanto falta), exaustão
 * do B11 (cobertura, trechos, diâmetro, terminal na fachada), posição do aquecedor, registros e os pontos de gás e de força.
 *
 *   HidGas.conferir({ estado, avaliarFam, trechos?, acessorios?, parametros? })
 *     → { aparelhos[], ambientes[], achados[], decisoes[] }
 *   trechos/acessorios: os do lote do Traçar que ainda não estão no estado (o registro que o Traçar põe conta).
 *   parametros.ventilacoes: [{ ambiente, area_cm2, y0?, y1?, posicao?: "superior"|"inferior"|"unica" }] — abertura de
 *     ventilação PERMANENTE declarada pelo RT (grelha/veneziana fixa não é família do modelo). A família de porta/janela com
 *     o parâmetro Ventilacao_permanente_cm2 > 0 também conta. Janela comum NÃO conta (fecha).
 *
 * Achado: { chave, regra, gravidade: "erro"|"aviso"|"pendencia", item, titulo, texto, porque, fonte, elementos[], ponto,
 *           corrigir: { tipo: "ops", ops[], texto } | null, valores{} }.
 *   erro      = a norma proíbe / o valor não atende (PROIBIDO no critério de projetista);
 *   aviso     = recomendação da norma (8.3.4, 8.3.5) ou conferência que depende de algo fora do modelo;
 *   pendencia = o modelo não tem o dado (abertura de ventilação, duto, ponto de gás): diz o VALOR exigido, nunca finge que existe.
 *
 * CLASSIFICAÇÃO DO AMBIENTE (5.3/8.3.1): pelo NOME e pela OCUPAÇÃO do ambiente do modelo (js/bimambiente.js). Sem ambiente
 * delimitado: o critério da H5 (o aparelho no mesmo cômodo de bacia/chuveiro/banheira/bidê = instalação sanitária,
 * inferida) e o resto pendente (sem volume não há conta de ventilação).
 * ⚠ Leitura CONSERVADORA declarada: "permanência prolongada" do 8.3.1 (aquecedor) vale para sala/estar/escritório também,
 *   não só para o cômodo com leito (o 5.3 fala "com leito" para os demais aparelhos).
 * ⚠ Nenhum valor de norma aqui (tools/test-hid-sem-numero-magico.js): tudo do HidNormas (gas13103.*); os hid:ok são
 *   geometria e tolerância de desenho.
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function NN() { return dep("HidNormas", "./hidnormas.js"); }
  function HK() { return dep("HidKit", "./hidkit.js"); }
  function HF() { return dep("HidFamilias", "./hidfamilias.js"); }
  function BI() { return dep("BimInst", "./biminst.js"); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { if (v === null || v === undefined || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function txt(v) { return v == null ? "" : String(v); }
  function semAcento(s) { return txt(s).toLowerCase().normalize ? txt(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") : txt(s).toLowerCase(); }
  var CASAS = 10000;   // hid:ok 4 casas do biminst
  function r4(v) { return Math.round(v * CASAS) / CASAS; }
  function f2(v) { return v == null || !isFinite(v) ? "?" : (Math.round(v * 100) / 100).toFixed(2).replace(".", ","); }   // hid:ok formatação
  function f0(v) { return v == null || !isFinite(v) ? "?" : String(Math.round(v)); }
  var EPS = 1e-6;   // hid:ok tolerância numérica
  var TOL_ALTURA = 0.05;   // hid:ok 5 cm de tolerância de montagem na altura recomendada do aquecedor (8.3.5)
  var SONDA_FRENTE = 0.05;   // hid:ok o ponto de "dentro do cômodo" do aparelho: 5 cm à frente do corpo
  var ALCANCE_RAIO = 20;   // hid:ok até onde o raio procura parede para saber se o lado de trás é fechado (m)
  var ALEM_PAREDE = 0.1;   // hid:ok o ponto além da face de trás da parede (10 cm) para saber o que tem do outro lado
  var DESLOC_PONTO = 0.15;   // hid:ok o ponto a lançar (tomada / gás) fica a 15 cm da lateral do corpo
  var MAX_PAV = 3;   // hid:ok mais que isto de diferença de cota = outro pavimento (m)
  var VIGENCIA = "NBR 13103:2020 — texto conferido; a vigente é a 2024 = 2020 + Emenda 1, não lida — conferir";

  /* hid:fisica-inicio — unidade (não é norma): 1 kcal (Tabela Internacional) = 4,1868 kJ (BIPM, SI Brochure 9ª ed.,
     unidades fora do SI) → 1 kW = 3600 kJ/h ÷ 4,1868 = 859,845 kcal/h. 1 m² = 10 000 cm². */
  var KCAL_H_POR_KW = 3600 / 4.1868;
  var CM2_POR_M2 = 10000;
  /* hid:fisica-fim */

  /* ------------------------------------------------ norma (HidNormas, gas13103.*) */
  function lim(par) { var N = NN(); if (!N) return null; var c = N.consulta("gas13103.limites", { parametro: par }, "valor"); return c && c.ok ? { v: num(c.valor, null), item: c.linha.item, texto: c.linha.texto } : null; }
  function fonteTxt(chave) { var N = NN(), f = N ? N.fonte(chave) : null; return f ? f.doc + (f.exemplarLicenciado === false ? " (valores; exemplar não licenciado à RA)" : "") : "ABNT NBR 13103:2020 (fora da biblioteca)"; }
  function linhas(chave, filtro) { var N = NN(); return N ? arr(N.linhas(chave, filtro)) : []; }
  /* tipo do Anexo A: "B23" → { tipo, grupo, exaustao, AS }; "B22/B23" (a ficha só diz "forçada") → o grupo comum dos dois */
  function tipoInfo(t0) {
    var t = txt(t0).toUpperCase().replace(/\s+/g, ""), L = linhas("gas13103.tipos");
    if (!t) return null;
    /* a linha do Anexo A de cada parte; "A"/"AS" sem o número = o grupo A (as regras do A não dependem de A1/A2/A3) */
    function linhaDe(p) {
      var l = L.filter(function (x) { return x.tipo === p; })[0]; if (l) return l;
      var base = p.replace(/AS$/, "");
      if (/^A[123]?$/.test(base)) return L.filter(function (x) { return x.tipo === (base.length > 1 ? base : "A1"); })[0] || null;   // hid:ok "123" = os subtipos A1/A2/A3 no nome do tipo (não é número)
      if (/^C$/.test(p)) return L.filter(function (x) { return x.tipo === "C1"; })[0] || null;
      return null;
    }
    var partes = t.split("/"), ls = partes.map(linhaDe);
    if (ls.some(function (l) { return !l; })) return { tipo: t, grupo: null, desconhecido: true };
    var g = ls[0].grupo, ex = ls[0].exaustao;
    if (ls.some(function (l) { return l.grupo !== g || l.exaustao !== ex; })) return { tipo: t, grupo: null, ambiguo: true };
    return { tipo: t, grupo: g, exaustao: ex, as: partes.every(function (p) { return /^A[123]?AS$/.test(p); }), b11sensor: partes.every(function (p) { return p === "B11AS" || p === "B11BS"; }) };   // hid:ok "123" = os subtipos A1/A2/A3 no nome do tipo (não é número)
  }

  /* ------------------------------------------------ ambiente: nome/ocupação → classe da NBR 13103 */
  function classe(nome, ocupacao) {
    var s = semAcento(txt(nome) + " " + txt(ocupacao));
    if (!s.trim()) return null;
    if (/banh|\bwc\b|lavabo|sanit|sauna|toalete|vestiario|ducha/.test(s)) return "sanitario";
    if (/kitnet|kitinete|studio|estudio|loft|conjugad|quitinete/.test(s)) return "multiuso_com_leito";
    if (/dorm|quarto|suite|leito|enfermaria/.test(s)) return "dormitorio";
    if (/escada|rota de fuga|saida de emergencia/.test(s)) return "escada_rota_fuga";
    if (/\bsala\b|estar|jantar|escrit|estudo|\bhome\b|living|\btv\b|biblio|office/.test(s)) return "permanencia";
    if (/varanda|sacada|terraco|extern|quintal|abrigo|area tecnica externa|deck|pergolado/.test(s)) return "externo";
    if (/cozinha|copa|servico|lavander|\ba\.? ?s\.?\b|area tecnica|gourmet|churrasq|garagem|deposito|despensa/.test(s)) return "servico";
    return "outro";
  }
  var ROTULO = { sanitario: "instalação sanitária", dormitorio: "ambiente de permanência prolongada com leito", multiuso_com_leito: "ambiente multiuso com leito", permanencia: "ambiente de permanência prolongada", escada_rota_fuga: "escada/rota de fuga", externo: "ambiente externo", servico: "ambiente interno de serviço", outro: "ambiente interno" };
  function dentroPoli(p, P) { var c = false; for (var i = 0, j = P.length - 1; i < P.length; j = i++) { var a = P[i], b = P[j]; if (((a.z > p.z) !== (b.z > p.z)) && (p.x < (b.x - a.x) * (p.z - a.z) / (b.z - a.z) + a.x)) c = !c; } return c; }
  function ambienteDe(estado, p, y) {
    return arr(estado && estado.ambientes).filter(function (a) { var cl = a && a.calc; if (!cl || arr(cl.contorno).length < 3) return false; if (y != null && cl.base != null && (y < num(cl.base, 0) - EPS || (cl.topo != null && y > num(cl.topo, 0) + EPS))) return false; return dentroPoli(p, cl.contorno); })[0] || null;   // hid:ok polígono tem 3+ vértices
  }

  /* ------------------------------------------------ os aparelhos a gás do modelo */
  function avaliar(av, f) { try { return av ? av(f.famId, f.tipoId, f.inst || {}) : null; } catch (e) { return null; } }
  function aparelhos(estado, avaliarFam) {
    var out = [];
    arr(estado && estado.familias).forEach(function (f) {
      var a = avaliar(avaliarFam, f), v = (a && a.valores) || {};
      /* aparelho a gás = família com o parâmetro do tipo da NBR 13103 (aquecedor a gás de passagem e de acumulação; o fogão
         a gás quando houver família com o parâmetro). O cooktop do mobiliário não diz se é a gás: fica de fora (declarado) */
      if (!Object.prototype.hasOwnProperty.call(v, "Tipo_NBR13103")) return;
      var F = HF() && HF().porId ? HF().porId(f.famId) : null, aquecedor = !!F && arr(F.sistemas).indexOf("agua_quente") >= 0;
      var cx = a && a.caixa ? a.caixa : null, rot = num(f.rotY, 0), ti = tipoInfo(v.Tipo_NBR13103);
      out.push({ id: String(f.id), f: f, famId: f.famId, nome: F ? F.nome : f.famId, valores: v, caixa: cx, rot: rot, aquecedor: aquecedor, passagem: aquecedor && !/boiler|acumula/.test(String(f.famId)),
                 tipo: ti, potencia: num(v.Potencia_kW, 0) > 0 ? num(v.Potencia_kW, 0) : null, chamine_mm: num(v.Chamine_diametro_mm, 0) > 0 ? num(v.Chamine_diametro_mm, 0) : null,
                 saida: /cobert/i.test(txt(v.Chamine_saida)) ? "cobertura" : "fachada", tensao: txt(v.Tensao_V),
                 frente: { x: Math.sin(rot), z: Math.cos(rot) } });
    });
    return out;
  }

  /* ------------------------------------------------ geometria do aparelho */
  function mundo(A, lx, ly, lz) { var c = Math.cos(A.rot), s = Math.sin(A.rot); return { x: r4(num(A.f.x, 0) + lx * c + lz * s), y: r4(num(A.f.y, 0) + ly), z: r4(num(A.f.z, 0) - lx * s + lz * c) }; }
  function centro(A) { var c = A.caixa || { x0: 0, x1: 0, y0: 0, y1: 0, z0: 0, z1: 0 }; return mundo(A, (c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2, (c.z0 + c.z1) / 2); }
  function frenteP(A) { var c = A.caixa || { z1: 0 }; return mundo(A, 0, ((c.y0 || 0) + (c.y1 || 0)) / 2, num(c.z1, 0) + SONDA_FRENTE); }
  /* a parede atrás do aparelho (a origem das famílias de parede encosta na face) */
  function paredeAtras(estado, A) { var K = HK(); if (!K || !K._int) return null; var B = BI(), tol = B ? B.TOL : EPS; return K._int.paredeDe(estado, { x: num(A.f.x, 0) - A.frente.x * tol, z: num(A.f.z, 0) - A.frente.z * tol }, num(A.f.y, 0) + (A.caixa ? (A.caixa.y0 + A.caixa.y1) / 2 : 0)); }
  function pisoDe(estado, avaliarFam, A) { var K = HK(); if (!K || !K._int) return null; var P = K._int.pisoDe(estado, avaliarFam, A.f, null); return P && P.ok ? P.y : null; }

  /* ------------------------------------------------ rede (registros 8.3.4): trechos do estado + os do lote */
  function rede(estado, extraT, extraA) {
    var T = arr(estado && estado.instalacoes && estado.instalacoes.trechos).map(function (t) { return { id: String(t.id), sistema: t.sistema, p1: t.p1, p2: t.p2 }; });
    arr(extraT).forEach(function (o) { if (o && o.op === "trecho" && o.p1 && o.p2) T.push({ id: String(o.id), sistema: o.sistema, p1: o.p1, p2: o.p2 }); });
    var Ac = arr(estado && estado.instalacoes && estado.instalacoes.acessorios).filter(function (a) { return /registro/.test(txt(a.acessorio)); }).map(function (a) { return { trecho: String(a.trecho), novo: a.novoId != null ? String(a.novoId) : null, a: a.a, b: a.b }; });
    arr(extraA).forEach(function (o) { if (o && o.op === "acessorio" && /registro/.test(txt(o.famId) + txt(o.acessorio))) Ac.push({ trecho: String(o.trecho), novo: o.novoId != null ? String(o.novoId) : null, x: o.x, y: o.y, z: o.z }); });
    return { T: T, Ac: Ac };
  }
  function d3(a, b) { var dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z; return Math.sqrt(dx * dx + dy * dy + dz * dz); }
  function d2(a, b) { var dx = a.x - b.x, dz = a.z - b.z; return Math.sqrt(dx * dx + dz * dz); }
  /* a cadeia de tubos a partir do conector, até o primeiro tê (grau ≠ 2): tem registro? */
  function registroNaCadeia(R, ponto, sistema) {
    var B = BI(), tol = B ? B.TOL_CONECTOR || B.TOL : EPS, usados = {}, atual = ponto, ids = [], guarda = 0;
    function liga(t, p) { return d3(t.p1, p) <= tol ? t.p2 : (d3(t.p2, p) <= tol ? t.p1 : null); }
    while (guarda++ < R.T.length + 1) {
      var cand = R.T.filter(function (t) { return t.sistema === sistema && !usados[t.id] && liga(t, atual); });
      if (cand.length !== 1) break;
      var t = cand[0]; usados[t.id] = 1; ids.push(t.id); atual = liga(t, atual);
      /* o nó seguinte é tê (mais de um tubo continua)? para depois de anotar o trecho */
      var prox = R.T.filter(function (u) { return u.sistema === sistema && !usados[u.id] && liga(u, atual); });
      if (prox.length > 1) break;
    }
    if (!ids.length) return null;
    return R.Ac.some(function (a) { return ids.indexOf(a.trecho) >= 0 || (a.novo && ids.indexOf(a.novo) >= 0); });
  }

  /* ------------------------------------------------ CONFERIR */
  function conferir(e) {
    e = e || {};
    var estado = e.estado || {}, avaliarFam = e.avaliarFam, par = e.parametros || {}, out = { aparelhos: [], ambientes: [], achados: [], decisoes: [] };
    var K = HK(), N = NN(); if (!N) { out.achados.push(ach("gas.sem_norma", "pendencia", "", "Norma de gás não carregada", "a tabela da NBR 13103 (HidNormas) não carregou: nada conferido", [], null)); return out; }
    var AP = aparelhos(estado, avaliarFam); out.aparelhos = AP.map(function (A) { return { id: A.id, tipo: A.tipo ? A.tipo.tipo : "", potencia_kW: A.potencia }; });
    if (!AP.length) return out;
    var paredes = K && K._int ? K._int.paredes(estado) : [];
    var Rd = rede(estado, e.trechos, e.acessorios);
    var conectores = K && K._int ? function (f) { return K._int.conectores(avaliarFam, f); } : function () { return []; };
    var obst = null; try { var H = dep("HidRota", "./hidrota.js"); obst = H && H.obstaculosDoBim ? H.obstaculosDoBim(estado, avaliarFam) : null; } catch (eO) { obst = null; }
    var aberturas = arr(obst && obst.aberturas), famPorId = {}; arr(estado.familias).forEach(function (f) { famPorId[String(f.id)] = f; });
    function ach(regra, grav, item, titulo, texto, els, corrigir, valores, ponto) {
      /* coordenação, 21/10/2026: a 2020 foi substituída pela 2024 (= 2020 + Emenda 1, NÃO lida) — todo achado cita isso */
      if (/NBR 13103/.test(texto)) texto = texto + " [" + VIGENCIA + "]";   // hid:ok 13103 = o número da norma no texto
      return { chave: regra === "gas.local" ? "ta.aquecedor_local" : "ta." + regra, regra: regra, gravidade: grav, item: item || "", titulo: titulo, texto: texto, porque: "", fonte: fonteTxt("gas13103.limites") + (item ? ", " + item : ""),
               elementos: arr(els).map(String), corrigir: corrigir || null, valores: valores || {}, ponto: ponto || null };
    }
    function add(a) { out.achados.push(a); return a; }
    /* ---- o ambiente de cada aparelho */
    var grupos = {};
    AP.forEach(function (A) {
      var q = frenteP(A), yA = centro(A).y, amb = ambienteDe(estado, q, yA), cl = null, inferido = false;
      if (amb) cl = classe(amb.nome, amb.ocupacao);
      if (!amb || !cl) {
        /* sem ambiente delimitado: o critério da H5 — no mesmo cômodo de bacia/chuveiro/banheira/bidê (o aparelho se vê dele
           sem atravessar parede) = instalação sanitária (inferida) */
        var noBanho = arr(estado.familias).filter(function (f) {
          if (!/^hid-(bacia|chuveiro|banheira|bide)/.test(String(f.famId))) return false;
          var p = { x: num(f.x, 0), y: 0, z: num(f.z, 0) };
          if (Math.abs(num(f.y, 0) - num(A.f.y, 0)) > MAX_PAV) return false;
          return !paredes.some(function (w) { if (yA < w.base - EPS || yA > w.topo + EPS) return false; return seg2(q, p, w.p1, w.p2) < w.esp / 2 - EPS; });
        });
        if (noBanho.length) { cl = "sanitario"; inferido = noBanho.map(function (f) { return String(f.id); }); }
      }
      A.ambiente = amb; A.classe = cl; A.inferido = inferido; A.piso = pisoDe(estado, avaliarFam, A);
      var k = amb ? String(amb.id) : "_sem_" + A.id; (grupos[k] = grupos[k] || { amb: amb, aps: [] }).aps.push(A);
    });
    /* ---- 1) dados do aparelho (tipo e potência da ficha) */
    AP.forEach(function (A) {
      if (!A.tipo) add(ach("gas.tipo", "pendencia", "Anexo A", "Tipo do aparelho a gás sem fonte", A.nome + " " + A.id + ": a ficha não diz o tipo quanto à exaustão (A, B11, B22, B23, C) — informe o parâmetro Tipo_NBR13103 do tipo (Anexo A da NBR 13103); sem ele local, ventilação e exaustão não são conferidos", [A.id], null));
      else if (A.tipo.desconhecido || A.tipo.ambiguo) add(ach("gas.tipo", "pendencia", "Anexo A", "Tipo do aparelho a gás não reconhecido", A.nome + " " + A.id + ": tipo \"" + A.tipo.tipo + "\" " + (A.tipo.ambiguo ? "mistura grupos diferentes" : "fora do Anexo A") + " — corrija o parâmetro Tipo_NBR13103", [A.id], null));
      if (A.potencia == null) add(ach("gas.potencia", "pendencia", "5.1", "Potência do aparelho a gás sem fonte", A.nome + " " + A.id + ": potência nominal (kW) não informada na ficha — informe Potencia_kW; sem ela potência por ambiente, ventilação e exaustão não são conferidas", [A.id], null));
    });
    /* ---- 2) LOCAL proibido (5.3, 5.5, 8.3.1) */
    var LOC = linhas("gas13103.local");
    AP.forEach(function (A) {
      if (!A.classe || !A.tipo || !A.tipo.grupo) return;
      var regras = LOC.filter(function (l) { return l.classe === A.classe && (l.aparelho === "todos" || (l.aparelho === "aquecedor" && A.aquecedor)); });
      var viola = regras.filter(function (l) { return txt(l.gruposPermitidos).split(",").map(function (s) { return s.trim(); }).indexOf(A.tipo.grupo) < 0; });
      if (!viola.length) return;
      var l0 = viola.sort(function (a, b) { return (b.aparelho === "aquecedor") - (a.aparelho === "aquecedor"); })[0];
      /* Corrigir: trocar por um tipo C (estanque) da MESMA família, se o catálogo tiver; senão a pessoa muda o aparelho de lugar */
      var F = HF() && HF().porId ? HF().porId(A.famId) : null, tC = F ? arr(F.tipos).filter(function (t) { var ti = tipoInfo(t.valores && t.valores.Tipo_NBR13103); return ti && ti.grupo === "C"; })[0] : null;
      var amb = A.ambiente ? "\"" + txt(A.ambiente.nome || A.ambiente.id) + "\"" : "o cômodo de " + arr(A.inferido).join(", ") + " (banheiro, inferido pelas louças: delimite o ambiente)";
      add(ach("gas.local", "erro", l0.item, "Aparelho a gás em local proibido",
        "Aquecedor a gás " + A.id + " (tipo " + A.tipo.tipo + ") em " + amb + " — " + ROTULO[A.classe] + ": " + l0.texto + " (NBR 13103:2020 " + l0.item + "). " + (tC ? "Troque pelo tipo estanque (C) do catálogo ou mude o aparelho para a área de serviço / varanda técnica." : "Não há modelo tipo C (estanque) nesta família: mude o aparelho para a área de serviço / varanda técnica ventilada."),
        [A.id].concat(arr(A.inferido)).concat(A.ambiente ? [String(A.ambiente.id)] : []), tC ? { tipo: "ops", ops: [{ op: "instancia", id: A.f.id, tipoId: tC.id }], texto: "trocar pelo " + tC.nome + " (tipo C, estanque)" } : null,
        { classe: A.classe, tipo: A.tipo.tipo }));
    });
    /* ---- 3) por AMBIENTE: potência (5.1, 6.2.2.1, 6.2.2.4), volume (Tabela 1, 6.3.2.1, 6.4.2.1) e ventilação (6.1, 6.2.2.1, 6.3.2.1, 6.4.2.1, Anexo B) */
    var L = {}; ["potencia_max_ambiente", "tipoA_interno_potencia_max", "extracao_coef_area", "extracao_coef_potencia", "tabela1_limite_potencia", "tabela1_volume_ate_limite", "tabela1_desconto_acima", "avu_fator", "avu_min", "abertura_superior_min", "abertura_inferior_fracao",
      "aquecedor_tipoA_sem_AS_max", "aquecedor_tipoA_com_AS_max", "dispensa_vent_tipoA_m3_por_kW", "dispensa_vent_tipoA_volume_min", "dispensa_vent_tipoB_m3_por_kW", "b11_interno_volume_min", "b2_interno_volume_min", "b2_interno_avu_min",
      "abertura_superior_altura_min", "abertura_inferior_altura_max", "externo_abertura_min_por_aparelho", "externo_abertura_fracao_parede"].forEach(function (k) { L[k] = lim(k); });
    function v(k) { return L[k] ? L[k].v : null; }
    Object.keys(grupos).forEach(function (k) {
      var G = grupos[k], aps = G.aps.filter(function (A) { return A.tipo && A.tipo.grupo && A.classe !== "externo"; }), amb = G.amb, ids = G.aps.map(function (A) { return A.id; });
      var ambTxt = amb ? "ambiente \"" + txt(amb.nome || amb.id) + "\"" : "o ambiente do aparelho " + ids.join(", ");
      var semPot = G.aps.some(function (A) { return A.potencia == null; });
      var P = G.aps.reduce(function (s, A) { return s + num(A.potencia, 0); }, 0), PA = G.aps.filter(function (A) { return A.tipo && A.tipo.grupo === "A"; }).reduce(function (s, A) { return s + num(A.potencia, 0); }, 0);
      var ext = G.aps.some(function (A) { return A.classe === "externo"; });
      var R0 = { ambiente: amb ? String(amb.id) : null, aparelhos: ids, potencia_kW: P, classe: G.aps[0].classe };
      out.ambientes.push(R0);
      if (v("potencia_max_ambiente") != null && P > v("potencia_max_ambiente") + EPS) add(ach("gas.potencia_ambiente", "erro", L.potencia_max_ambiente.item, "Potência a gás acima do limite do ambiente", ambTxt + ": " + f2(P) + " kW de aparelhos a gás > " + f2(v("potencia_max_ambiente")) + " kW (NBR 13103:2020 " + L.potencia_max_ambiente.item + ") — acima disso é projeto específico; separe os aparelhos em ambientes diferentes", ids.concat(amb ? [String(amb.id)] : []), null, { potencia_kW: P }));
      if (PA > 0 && v("tipoA_interno_potencia_max") != null && PA > v("tipoA_interno_potencia_max") + EPS && !ext) {
        var Aar = amb && amb.calc ? num(amb.calc.area, null) : null, q = Aar != null ? v("extracao_coef_area") * Aar + v("extracao_coef_potencia") * PA : null;
        add(ach("gas.tipoA_potencia", "erro", L.tipoA_interno_potencia_max.item, "Aparelhos tipo A acima do limite em ambiente interno", ambTxt + ": " + f2(PA) + " kW de aparelhos tipo A > " + f2(v("tipoA_interno_potencia_max")) + " kW (NBR 13103:2020 " + L.tipoA_interno_potencia_max.item + ") — exige extração mecânica " + (q != null ? "q = " + f0(q) + " m³/h (10·A + 2·ΣQnA)" : "q = 10·A + 2·ΣQnA (área do ambiente não delimitada)") + " ou aparelho com duto (B/C)", ids, null, { potenciaA_kW: PA, extracao_m3h: q }));
      }
      G.aps.forEach(function (A) {
        if (!A.aquecedor || !A.tipo || A.tipo.grupo !== "A" || A.potencia == null || ext) return;
        var lk = A.tipo.as ? "aquecedor_tipoA_com_AS_max" : "aquecedor_tipoA_sem_AS_max";
        if (v(lk) != null && A.potencia > v(lk) + EPS) add(ach("gas.aquecedor_tipoA", "erro", L[lk].item, "Aquecedor tipo A acima da potência permitida em ambiente interno", "Aquecedor " + A.id + " tipo " + A.tipo.tipo + " de " + f2(A.potencia) + " kW em ambiente interno: máximo " + f2(v(lk)) + " kW " + (A.tipo.as ? "com" : "sem") + " sensor AS (NBR 13103:2020 " + L[lk].item + ") — use aquecedor com duto de exaustão (B) ou estanque (C)", [A.id], null, { potencia_kW: A.potencia, limite_kW: v(lk) }));
      });
      if (!aps.length) {
        if (ext) add(ach("gas.externo", "pendencia", L.externo_abertura_min_por_aparelho ? L.externo_abertura_min_por_aparelho.item : "6.2.3.1", "Ambiente externo: abertura para o exterior a conferir", ambTxt + " (externo): a abertura para o exterior precisa de ≥ " + f0(v("externo_abertura_fracao_parede")) + " % da parede de divisa e ≥ " + f2(v("externo_abertura_min_por_aparelho") * G.aps.length) + " m² (" + f2(v("externo_abertura_min_por_aparelho")) + " m² por aparelho) — o modelo não mede a abertura da varanda; confira na planta", ids, null, {}));
        return;
      }
      /* volume */
      var V = amb && amb.calc ? num(amb.calc.volume, null) : null;
      var temA = aps.some(function (A) { return A.tipo.grupo === "A"; }), temB11 = aps.some(function (A) { return A.tipo.exaustao === "natural"; }), temB2 = aps.some(function (A) { return A.tipo.exaustao === "forcada"; }), soC = aps.every(function (A) { return A.tipo.grupo === "C"; });
      if (soC) { out.decisoes.push({ id: "gas.tipoC", texto: ambTxt + ": só aparelhos tipo C (estanque) — sem volume mínimo nem área de ventilação (NBR 13103:2020 6.5.2)." }); return; }
      var Vmin = null, itV = null;
      if (temA && v("tabela1_limite_potencia") != null) { Vmin = PA <= v("tabela1_limite_potencia") + EPS ? v("tabela1_volume_ate_limite") : PA - v("tabela1_desconto_acima"); itV = L.tabela1_volume_ate_limite.item; }
      if (temB11 && v("b11_interno_volume_min") != null && (Vmin == null || v("b11_interno_volume_min") > Vmin)) { Vmin = v("b11_interno_volume_min"); itV = L.b11_interno_volume_min.item; }
      if (temB2 && v("b2_interno_volume_min") != null && (Vmin == null || v("b2_interno_volume_min") > Vmin)) { Vmin = v("b2_interno_volume_min"); itV = L.b2_interno_volume_min.item; }
      /* B11 em ambiente interno: só B11AS ou B11BS (6.3.2.1) */
      aps.forEach(function (A) { if (A.tipo.exaustao === "natural" && !A.tipo.b11sensor) add(ach("gas.b11_sensor", "erro", "6.3.2.1", "B11 em ambiente interno sem sensor", "Aquecedor " + A.id + " tipo " + A.tipo.tipo + " em ambiente interno: a NBR 13103:2020 (6.3.2.1) só admite B11AS (sensor de contaminação) ou B11BS (supervisor de exaustão) — confirme o sensor na ficha do fabricante (Tipo_NBR13103 = B11AS ou B11BS) ou instale em compartimento exclusivo (6.3.2.2) / área externa", [A.id], null, { tipo: A.tipo.tipo })); });
      if (V == null) {
        add(ach("gas.volume", "pendencia", itV || "6", "Volume do ambiente do aparelho a gás sem dado", ambTxt + ": " + (amb ? "o ambiente não tem volume calculado (delimite-o por paredes e piso/forro)" : "o aparelho não está num ambiente delimitado do modelo") + " — volume mínimo exigido " + f2(Vmin) + " m³ (NBR 13103:2020 " + (itV || "6") + "); a dispensa de ventilação (6.1) e a área de ventilação não foram conferidas", ids, null, { volumeMin_m3: Vmin }));
      } else {
        R0.volume_m3 = V;
        if (Vmin != null && V < Vmin - EPS) add(ach("gas.volume", "erro", itV, "Volume do ambiente insuficiente para o aparelho a gás", ambTxt + ": volume de " + f2(V) + " m³ < " + f2(Vmin) + " m³ exigidos (NBR 13103:2020 " + itV + ") — faltam " + f2(Vmin - V) + " m³; mude o aparelho para um ambiente maior ou use aparelho estanque (C)", ids.concat(amb ? [String(amb.id)] : []), null, { volume_m3: V, volumeMin_m3: Vmin, falta_m3: Vmin - V }));
      }
      /* ventilação: dispensa (6.1) ou a área útil exigida */
      if (semPot) return;
      var dispA = temA && V != null && v("dispensa_vent_tipoA_m3_por_kW") != null && V / P >= v("dispensa_vent_tipoA_m3_por_kW") - EPS && V >= v("dispensa_vent_tipoA_volume_min") - EPS;
      var dispB = !temA && V != null && v("dispensa_vent_tipoB_m3_por_kW") != null && V / P >= v("dispensa_vent_tipoB_m3_por_kW") - EPS;
      if (dispA || dispB) { out.decisoes.push({ id: "gas.ventilacao_dispensada", texto: ambTxt + ": V/ΣP = " + f2(V / P) + " m³/kW ≥ " + f2(dispA ? v("dispensa_vent_tipoA_m3_por_kW") : v("dispensa_vent_tipoB_m3_por_kW")) + " m³/kW — dispensa a ventilação mínima (NBR 13103:2020 6.1, ambiente não estanque)." }); return; }
      /* a exigência */
      var exige = {};
      if (temA || temB11) {
        var avu = Math.max(v("avu_fator") * P, v("avu_min"));
        exige = { tipo: "duas", avu: avu, sup: v("abertura_superior_min"), inf: avu * v("abertura_inferior_fracao") / 100, item: temA ? "6.2.2.1" : "6.3.2.1" };
      } else {
        /* B22/B23: uma abertura com AVu ≥ a soma das áreas das saídas dos aparelhos, mínimo 100 cm² (6.4.2.1) */
        var saidas = aps.reduce(function (s, A) { var d = num(A.chamine_mm, 0) / 10; return s + Math.PI * d * d / 4; }, 0);   // hid:ok área do círculo πd²/4
        exige = { tipo: "uma", avu: Math.max(saidas, v("b2_interno_avu_min")), item: "6.4.2.1", saidas: saidas, semDiametro: aps.some(function (A) { return A.chamine_mm == null; }) };
      }
      R0.ventilacao = exige;
      /* o que o modelo tem: abertura permanente declarada (parâmetro da porta/janela) ou informada pelo RT */
      var piso = G.aps[0].piso != null ? G.aps[0].piso : (amb && amb.calc ? num(amb.calc.base, 0) : 0);
      var temV = ventilacoesDo(amb, aberturas, famPorId, avaliarFam, par.ventilacoes);
      var sup = temV.filter(function (o) { return o.posicao === "superior" || (o.posicao == null && o.y0 != null && o.y0 - piso >= v("abertura_superior_altura_min") - EPS); }).reduce(function (s, o) { return s + o.area; }, 0);
      var inf = temV.filter(function (o) { return o.posicao === "inferior" || (o.posicao == null && o.y1 != null && o.y1 - piso <= v("abertura_inferior_altura_max") + EPS); }).reduce(function (s, o) { return s + o.area; }, 0);
      var tot = temV.reduce(function (s, o) { return s + o.area; }, 0);
      R0.ventilacaoModelo = { superior_cm2: sup, inferior_cm2: inf, total_cm2: tot };
      var txtEx = exige.tipo === "duas" ? "AVu = 21,5 × " + f2(P) + " kW = " + f0(exige.avu) + " cm² (mínimo " + f0(v("avu_min")) + "): abertura SUPERIOR ≥ " + f0(exige.sup) + " cm² a ≥ " + f2(v("abertura_superior_altura_min")) + " m do piso (Anexo B, B.3) e INFERIOR ≥ " + f0(exige.inf) + " cm² (" + f0(v("abertura_inferior_fracao")) + " % da AVu) a ≤ " + f2(v("abertura_inferior_altura_max")) + " m (B.4)"
        : "uma abertura permanente com AVu ≥ " + f0(exige.avu) + " cm² (≥ a soma das saídas de exaustão, " + (exige.semDiametro ? "diâmetro da saída sem ficha em parte dos aparelhos" : f0(exige.saidas) + " cm²") + "; mínimo " + f0(v("b2_interno_avu_min")) + " cm²)";
      if (!temV.length) { add(ach("gas.ventilacao", "pendencia", exige.item, "Ventilação permanente do ambiente não modelada", ambTxt + ": exige " + txtEx + " (NBR 13103:2020 " + exige.item + ") — o modelo não tem abertura de ventilação permanente (grelha/veneziana fixa; janela que fecha não conta). Lance as aberturas ou declare-as (parâmetro Ventilacao_permanente_cm2 da esquadria)", ids.concat(amb ? [String(amb.id)] : []), null, { exigido: exige })); return; }
      var falta = [];
      if (exige.tipo === "duas") { if (sup < exige.sup - EPS) falta.push("superior: faltam " + f0(exige.sup - sup) + " cm² (tem " + f0(sup) + ")"); if (inf < exige.inf - EPS) falta.push("inferior: faltam " + f0(exige.inf - inf) + " cm² (tem " + f0(inf) + ")"); if (tot < exige.avu - EPS) falta.push("total: faltam " + f0(exige.avu - tot) + " cm² (tem " + f0(tot) + ")"); }
      else if (tot < exige.avu - EPS) falta.push("faltam " + f0(exige.avu - tot) + " cm² (tem " + f0(tot) + ")");
      if (falta.length) add(ach("gas.ventilacao", "erro", exige.item, "Área de ventilação permanente insuficiente", ambTxt + ": exige " + txtEx + " — " + falta.join("; ") + " (NBR 13103:2020 " + exige.item + ")", ids.concat(amb ? [String(amb.id)] : []), null, { exigido: exige, modelo: R0.ventilacaoModelo }));
    });
    /* ---- 4) EXAUSTÃO (7.2.1, Anexo E, 7.2.2.3, 7.3) */
    var LB = {}; ["b11_cobertura_acima", "b11_vertical_min", "b11_horizontal_max", "b11_desvios_max", "chamine_fator_potencia"].forEach(function (k) { LB[k] = lim(k); });
    var TF = linhas("gas13103.terminal_fachada"), E2 = linhas("gas13103.chamine_e2").sort(function (a, b) { return a.ate_1000kcal_h - b.ate_1000kcal_h; });
    function tf(ref, dir) { var l = TF.filter(function (x) { return x.referencia === ref && x.direcao === dir; })[0]; return l ? num(l.distancia_m, null) : null; }
    var terminais = [];
    AP.forEach(function (A) {
      if (!A.tipo || !A.tipo.grupo || A.tipo.grupo === "A") return;
      var w = paredeAtras(estado, A), cx = A.caixa || { y1: 0, z1: 0 }, topo = num(A.f.y, 0) + num(cx.y1, 0);
      if (A.tipo.exaustao === "natural") {
        /* > 24,4 kW: à cobertura */
        if (A.potencia != null && LB.b11_cobertura_acima && A.potencia > LB.b11_cobertura_acima.v + EPS && A.saida !== "cobertura")
          add(ach("gas.b11_cobertura", "erro", LB.b11_cobertura_acima.item, "Exaustão do B11 tem de ir à cobertura", "Aquecedor " + A.id + " tipo " + A.tipo.tipo + " de " + f2(A.potencia) + " kW > " + f2(LB.b11_cobertura_acima.v) + " kW: o duto de exaustão vai à COBERTURA, não à fachada (NBR 13103:2020 " + LB.b11_cobertura_acima.item + ") — leve o duto à cobertura (terminal pelo 7.2.2.4) ou use aparelho de exaustão forçada/estanque",
            [A.id], { tipo: "ops", ops: [{ op: "instancia", id: A.f.id, inst: { Chamine_saida: "cobertura" } }], texto: "marcar a exaustão pela cobertura (o duto até lá fica como ponto a lançar)" }, { potencia_kW: A.potencia }));
        /* diâmetro: o da ficha; sem ele, Anexo E Método 2 (Tabela E.2, 85 % da potência em 1000 kcal/h) */
        if (A.chamine_mm != null) out.decisoes.push({ id: "gas.chamine", texto: "Aquecedor " + A.id + ": duto de exaustão Ø " + f0(A.chamine_mm) + " mm (ficha do fabricante)." });
        else if (A.potencia != null && LB.chamine_fator_potencia && E2.length) {
          var pk = A.potencia * LB.chamine_fator_potencia.v / 100 * KCAL_H_POR_KW / 1000, lin = E2.filter(function (x) { return pk <= num(x.ate_1000kcal_h, 0) + EPS; })[0];
          if (lin) out.decisoes.push({ id: "gas.chamine", texto: "Aquecedor " + A.id + ": duto de exaustão Ø " + f0(lin.d_cm * 10) + " mm pela NBR 13103:2020, Anexo E, Método 2 (Tabela E.2: 85 % de " + f2(A.potencia) + " kW = " + f2(pk) + " mil kcal/h) — a ficha não dá o diâmetro." });   // hid:ok cm → mm
          else add(ach("gas.chamine", "pendencia", "Anexo E", "Diâmetro do duto acima da Tabela E.2", "Aquecedor " + A.id + ": " + f2(pk) + " mil kcal/h passa da Tabela E.2 — o diâmetro do duto vem do fabricante", [A.id], null));
        }
        if (A.saida === "cobertura") { add(ach("gas.duto_cobertura", "pendencia", "7.2.2.4", "Duto de exaustão até a cobertura a lançar", "Aquecedor " + A.id + ": o duto de exaustão vai à cobertura (NBR 13103:2020 7.2.1) — não está modelado: no máximo " + f0(LB.b11_desvios_max ? LB.b11_desvios_max.v : null) + " desvios, trecho vertical ≥ " + f2(LB.b11_vertical_min ? LB.b11_vertical_min.v : null) + " m, terminal > 1 m acima da cumeeira (7.2.2.4)", [A.id], null)); return; }
        /* o duto PADRÃO pela fachada: sobe o mínimo, uma curva, atravessa a parede de trás (o que o 7.2.1 confere) */
        var hor = w ? num(cx.z1, 0) / 2 + w.esp : null, desv = 1;
        if (hor == null) add(ach("gas.duto", "pendencia", LB.b11_horizontal_max ? LB.b11_horizontal_max.item : "7.2.1", "Duto de exaustão: aparelho fora de parede", "Aquecedor " + A.id + ": não encosta em parede — o duto de exaustão não tem por onde sair à fachada; trecho horizontal ≤ " + f2(LB.b11_horizontal_max ? LB.b11_horizontal_max.v : null) + " m, máximo " + f0(LB.b11_desvios_max ? LB.b11_desvios_max.v : null) + " desvios (7.2.1)", [A.id], null));
        else if (LB.b11_horizontal_max && hor > LB.b11_horizontal_max.v + EPS) add(ach("gas.duto", "erro", LB.b11_horizontal_max.item, "Trecho horizontal do duto B11 longo demais", "Aquecedor " + A.id + ": o duto pela parede de trás tem " + f2(hor) + " m na horizontal > " + f2(LB.b11_horizontal_max.v) + " m (NBR 13103:2020 " + LB.b11_horizontal_max.item + ")", [A.id].concat(w ? [w.id] : []), null));
        else out.decisoes.push({ id: "gas.duto", texto: "Aquecedor " + A.id + ": duto de exaustão pela parede de trás — vertical ≥ " + f2(LB.b11_vertical_min ? LB.b11_vertical_min.v : null) + " m, " + desv + " desvio, horizontal " + f2(hor) + " m ≤ " + f2(LB.b11_horizontal_max ? LB.b11_horizontal_max.v : null) + " m (NBR 13103:2020 7.2.1)." });
      }
      if (A.saida === "cobertura" || !w) return;
      /* o terminal na fachada: na face de trás da parede, acima do aparelho (o trecho vertical mínimo do B11; forçado/estanque: na altura do topo) */
      /* B11: o trecho vertical mínimo e, se preciso, mais — o terminal na fachada a ≥ 2,20 m do chão (7.2.2.3) já no duto padrão (o
         duto sobe o que falta antes da curva; o horizontal não muda) */
      var pisoExt0 = paredes.reduce(function (m, q) { return Math.min(m, q.base); }, Infinity), dPiso0 = tf("piso", "acima");
      var yT = topo + (A.tipo.exaustao === "natural" && LB.b11_vertical_min ? LB.b11_vertical_min.v : 0);
      if (A.tipo.exaustao === "natural" && dPiso0 != null && isFinite(pisoExt0) && yT < pisoExt0 + dPiso0) { out.decisoes.push({ id: "gas.duto_vertical", texto: "Aquecedor " + A.id + ": o duto sobe até " + f2(pisoExt0 + dPiso0) + " m antes da curva — terminal na fachada a " + f2(dPiso0) + " m do chão (NBR 13103:2020 7.2.2.3)." }); yT = pisoExt0 + dPiso0; }
      var trasP = { x: num(A.f.x, 0) - A.frente.x * w.esp, z: num(A.f.z, 0) - A.frente.z * w.esp }, T0 = { x: r4(trasP.x), y: r4(yT), z: r4(trasP.z) };
      /* o outro lado da parede é EXTERIOR? (ambiente do modelo do outro lado = parede interna; o duto passaria pelo vizinho) */
      var alem = { x: num(A.f.x, 0) - A.frente.x * (w.esp + ALEM_PAREDE), z: num(A.f.z, 0) - A.frente.z * (w.esp + ALEM_PAREDE) }, ambAlem = ambienteDe(estado, alem, yT);
      if (ambAlem) add(ach("gas.terminal_interno", "erro", "7.2.2.1", "Duto de exaustão sai em outro ambiente", "Aquecedor " + A.id + ": atrás da parede " + w.id + " fica o ambiente \"" + txt(ambAlem.nome || ambAlem.id) + "\" — o duto de exaustão tem de sair para o EXTERIOR (fachada) e não passa por ambiente de permanência prolongada (NBR 13103:2020 7.2.2.1); mude o aparelho para uma parede de fachada", [A.id, w.id, String(ambAlem.id)], null, {}, T0));
      else if (!arr(estado.ambientes).length && fechadoPorParedes(alem, yT, paredes, w.id)) add(ach("gas.terminal_interno", "pendencia", "7.2.2.1", "Confirme que a parede de trás é de fachada", "Aquecedor " + A.id + ": atrás da parede " + w.id + " há paredes em toda volta (o modelo não tem ambientes delimitados para saber) — o duto de exaustão tem de sair para o exterior (NBR 13103:2020 7.2.2.1)", [A.id, w.id], null, {}, T0));
      terminais.push({ A: A, T: T0, w: w });
      if (A.tipo.exaustao !== "natural") return;
      /* 7.2.2.3: distâncias do terminal às janelas/portas da MESMA parede */
      var ux = w.p2.x - w.p1.x, uz = w.p2.z - w.p1.z, Lw = Math.sqrt(ux * ux + uz * uz); if (!(Lw > EPS)) return; ux /= Lw; uz /= Lw;
      function u(p) { return (p.x - w.p1.x) * ux + (p.z - w.p1.z) * uz; }
      var uT = u(T0), dAb = tf("janela_abertura", "abaixo"), dLat = tf("janela_abertura", "lateral"), dPiso = tf("piso", "acima");
      aberturas.forEach(function (ab) {
        if (!(seg2(ab.p1, ab.p2, w.p1, w.p2) < w.esp / 2 + EPS)) return;   /* a abertura é desta parede */
        var a0 = Math.min(u(ab.p1), u(ab.p2)), a1 = Math.max(u(ab.p1), u(ab.p2)), lat = uT < a0 ? a0 - uT : (uT > a1 ? uT - a1 : 0);
        var abaixo = T0.y < num(ab.y0, 0) ? num(ab.y0, 0) - T0.y : null, naAltura = T0.y >= num(ab.y0, 0) - EPS && T0.y <= num(ab.y1, 0) + EPS;
        if (dAb != null && abaixo != null && lat < (dLat || 0) - EPS && abaixo < dAb - EPS) add(ach("gas.terminal_janela", "erro", "7.2.2.3", "Terminal do duto perto de janela/porta", "Aquecedor " + A.id + ": o terminal do duto (a " + f2(T0.y) + " m) fica " + f2(abaixo) + " m abaixo da " + ab.tipo + " " + ab.id + " — mínimo " + f2(dAb) + " m abaixo de janela/abertura (NBR 13103:2020 7.2.2.3); mude o aparelho de lugar na parede", [A.id, String(ab.id)], null, { distancia_m: abaixo, minimo_m: dAb }, T0));
        else if (dLat != null && naAltura && lat < dLat - EPS) add(ach("gas.terminal_janela", "erro", "7.2.2.3", "Terminal do duto ao lado de janela/porta", "Aquecedor " + A.id + ": o terminal do duto fica a " + f2(lat) + " m na lateral da " + ab.tipo + " " + ab.id + " — mínimo " + f2(dLat) + " m (NBR 13103:2020 7.2.2.3); afaste o aparelho " + f2(dLat - lat) + " m ao longo da parede", [A.id, String(ab.id)], null, { distancia_m: lat, minimo_m: dLat }, T0));
      });
      var pisoExt = paredes.reduce(function (m, q) { return Math.min(m, q.base); }, Infinity);
      if (dPiso != null && isFinite(pisoExt) && T0.y - pisoExt < dPiso - EPS) add(ach("gas.terminal_piso", "erro", "7.2.2.3", "Terminal do duto baixo demais", "Aquecedor " + A.id + ": o terminal do duto fica a " + f2(T0.y - pisoExt) + " m do chão (o piso mais baixo do modelo) — mínimo " + f2(dPiso) + " m (NBR 13103:2020 7.2.2.3); suba o aparelho", [A.id], null, {}, T0));
    });
    /* entre terminais da mesma parede: B11 (7.2.2.3: 1,50 m vertical, 0,60 m lateral); forçados (7.3: 0,75 m) */
    var eVert = tf("entre_terminais", "vertical"), eLat = tf("entre_terminais", "lateral"), B2 = linhas("gas13103.exaustao_b2"), e2 = B2.filter(function (x) { return x.parametro === "entre_terminais"; })[0];
    for (var i = 0; i < terminais.length; i++) for (var j = i + 1; j < terminais.length; j++) {
      var a = terminais[i], b = terminais[j]; if (a.w.id !== b.w.id) continue;
      var dl = d2(a.T, b.T), dv = Math.abs(a.T.y - b.T.y), nat = a.A.tipo.exaustao === "natural" && b.A.tipo.exaustao === "natural";
      if (nat && eVert != null && eLat != null && dl < eLat - EPS && dv < eVert - EPS) add(ach("gas.entre_terminais", "erro", "7.2.2.3", "Terminais de exaustão próximos", "Aquecedores " + a.A.id + " e " + b.A.id + ": terminais a " + f2(dl) + " m na lateral e " + f2(dv) + " m na vertical — mínimo " + f2(eLat) + " m lateral ou " + f2(eVert) + " m vertical (NBR 13103:2020 7.2.2.3)", [a.A.id, b.A.id], null));
      else if (!nat && e2 && d3(a.T, b.T) < num(e2.valor, 0) - EPS) add(ach("gas.entre_terminais", "erro", "7.3", "Terminais de exaustão forçada próximos", "Aquecedores " + a.A.id + " e " + b.A.id + ": terminais a " + f2(d3(a.T, b.T)) + " m — mínimo " + f2(num(e2.valor, 0)) + " m entre terminais (NBR 13103:2020 7.3; 0,30 m com direcionador)", [a.A.id, b.A.id], null));
    }
    /* ---- 5) POSIÇÃO: 8.3.5 (recomendação, centro a 1,70 m) e 8.3.3 (B11: 0,20 m de lado, 0,40 m entre dois B11) */
    var c170 = lim("centro_aquecedor_altura"), l020 = lim("b11_afastamento_lateral"), l040 = lim("b11_entre_aquecedores");
    AP.forEach(function (A) {
      if (!A.passagem || !c170 || A.piso == null || !A.caixa) return;
      /* o centro do CORPO (a origem do aquecedor de passagem é o centro da face de baixo: + Altura/2; a caixa envolvente inclui os tocos das ligações) */
      var yc = num(A.f.y, 0) + (num(A.valores.Altura, 0) > 0 ? num(A.valores.Altura, 0) / 2 : (A.caixa.y0 + A.caixa.y1) / 2) - A.piso, d = yc - c170.v;
      if (Math.abs(d) > TOL_ALTURA) add(ach("gas.altura", "aviso", c170.item, "Altura do aquecedor fora da recomendada", "Aquecedor " + A.id + ": centro a " + f2(yc) + " m do piso; a NBR 13103:2020 recomenda " + f2(c170.v) + " m (" + c170.item + ")", [A.id],
        { tipo: "ops", ops: [{ op: "instancia", id: A.f.id, y: r4(num(A.f.y, 0) - d) }], texto: "subir/descer o aquecedor para o centro a " + f2(c170.v) + " m do piso" }, { centro_m: yc }));
    });
    AP.forEach(function (A, ia) {
      if (!A.tipo || A.tipo.exaustao !== "natural" || !A.caixa || !l020) return;
      var w = paredeAtras(estado, A); if (!w) return;
      var meia = (A.caixa.x1 - A.caixa.x0) / 2, lado = { x: Math.cos(A.rot), z: -Math.sin(A.rot) }, cA = centro(A);
      /* lateral: a parede perpendicular mais perto do lado do corpo */
      paredes.forEach(function (q) {
        if (q.id === w.id || cA.y < q.base - EPS || cA.y > q.topo + EPS) return;
        [1, -1].forEach(function (sg) { var pL = { x: cA.x + lado.x * sg * meia, z: cA.z + lado.z * sg * meia }, dd = seg2(pL, pL, q.p1, q.p2) - q.esp / 2;
          var dentro = seg2(cA, cA, q.p1, q.p2) - q.esp / 2 > dd + EPS;   /* a parede está do lado sg */
          if (dentro && dd < l020.v - EPS && dd > -EPS) add(ach("gas.b11_lateral", "erro", l020.item, "B11 colado na parede do lado", "Aquecedor " + A.id + " (B11): " + f2(dd) + " m da parede " + q.id + " na lateral — mínimo " + f2(l020.v) + " m (NBR 13103:2020 " + l020.item + ")", [A.id, q.id], null)); });
      });
      AP.forEach(function (B0, ib) { if (ib <= ia || !B0.tipo || B0.tipo.exaustao !== "natural" || !B0.caixa || !l040) return; var dd = d2(cA, centro(B0)) - meia - (B0.caixa.x1 - B0.caixa.x0) / 2;
        if (Math.abs(centro(B0).y - cA.y) < MAX_PAV && dd < l040.v - EPS) add(ach("gas.b11_entre", "erro", l040.item, "Dois B11 muito próximos", "Aquecedores " + A.id + " e " + B0.id + " (B11): " + f2(dd) + " m entre eles — mínimo " + f2(l040.v) + " m (NBR 13103:2020 " + l040.item + ")", [A.id, B0.id], null)); });
    });
    /* ---- 6) REGISTROS (8.3.4, recomendação): AF na entrada e AQ na saída do aquecedor */
    AP.forEach(function (A) {
      if (!A.aquecedor) return;
      var cs = conectores(A.f), af = cs.filter(function (c) { return c.sistema === "agua_fria"; })[0], aq = cs.filter(function (c) { return c.sistema === "agua_quente"; })[0];
      var rAF = af ? registroNaCadeia(Rd, af, "agua_fria") : null, rAQ = aq ? registroNaCadeia(Rd, aq, "agua_quente") : null, falta = [];
      if (rAF === false) falta.push("entrada de água fria"); if (rAQ === false) falta.push("saída de água quente");
      if (falta.length) add(ach("gas.registros", "aviso", "8.3.4", "Registro de bloqueio do aquecedor", "Aquecedor " + A.id + ": sem registro de bloqueio na " + falta.join(" e na ") + " (recomendação da NBR 13103:2020 8.3.4) — trace com o Traçar automaticamente (põe os dois) ou insira o registro no tubo", [A.id], null));
    });
    /* ---- 7) PONTOS: tomada exclusiva a ≤ 1 m (5.6) e ponto de gás com válvula a ≤ 0,6 m (5.7) */
    var lT = lim("tomada_distancia_max"), lG = lim("ponto_gas_distancia_max");
    AP.forEach(function (A) {
      if (!A.caixa) return;
      var cA = centro(A), meia = (A.caixa.x1 - A.caixa.x0) / 2, lado = { x: Math.cos(A.rot), z: -Math.sin(A.rot) };
      var pTom = { x: r4(cA.x - lado.x * (meia + DESLOC_PONTO)), y: r4(cA.y), z: r4(cA.z - lado.z * (meia + DESLOC_PONTO)) };
      var pGas = { x: r4(cA.x), y: r4(num(A.f.y, 0) + num(A.caixa.y0, 0) - DESLOC_PONTO), z: r4(cA.z) };
      var precisaForca = A.tipo && (A.tipo.exaustao === "forcada" || A.tipo.grupo === "C" || !!A.tensao);
      if (lT && precisaForca) {
        var tem = arr(estado.familias).some(function (f) { if (String(f.id) === A.id) return false; var F = HF() && HF().porId ? HF().porId(f.famId) : null; if (!F || F.categoria !== "dispositivo_eletrico") return false; return d3({ x: num(f.x, 0), y: num(f.y, 0), z: num(f.z, 0) }, cA) <= lT.v + meia + EPS; })
          || arr(estado.instalacoes && estado.instalacoes.pecas).some(function (k) { return /^caixa_4x/.test(txt(k.peca)) && d3({ x: num(k.x, 0), y: num(k.y, 0), z: num(k.z, 0) }, cA) <= lT.v + meia + EPS; });
        if (!tem) add(ach("gas.tomada", "pendencia", lT.item, "Tomada exclusiva do aquecedor a lançar", "Aquecedor " + A.id + (A.tensao ? " (" + A.tensao + " V)" : "") + ": tomada elétrica exclusiva a no máximo " + f2(lT.v) + " m do aparelho (NBR 13103:2020 " + lT.item + ", NBR 14136) — o modelo não tem; ponto sugerido ao lado do aparelho", [A.id],
          pontoForca(A, pTom), { sugerido: pTom }, pTom));
      }
      if (lG) add(ach("gas.ponto_gas", "pendencia", lG.item, "Ponto de gás com válvula de bloqueio a lançar", "Aparelho " + A.id + ": válvula de bloqueio exclusiva e o ponto de gás a no máximo " + f2(lG.v) + " m do aparelho (NBR 13103:2020 " + lG.item + ") — a rede de gás não é modelada pelo Traçar; ponto sugerido logo abaixo do aparelho (" + f2(pGas.x) + "; " + f2(pGas.y) + "; " + f2(pGas.z) + ")", [A.id], null, { sugerido: pGas }, pGas));
    });
    return out;
  }
  /* o ponto de força (família do pressurizador, genérica "tomada 2P+T") ao lado do aparelho: a op de lançar */
  function pontoForca(A, p) {
    var F = HF() && HF().porId ? HF().porId("hid-pz-ponto-forca") : null; if (!F) return null;
    return { tipo: "ops", ops: [{ op: "familia", id: "pf-" + A.id, famId: F.id, tipoId: F.tipos[0].id, x: p.x, y: p.y, z: p.z, rotY: A.rot, inst: { Equipamento: A.id, Tensao_V: A.tensao || "" } }], texto: "lançar a tomada exclusiva ao lado do aparelho" };
  }
  /* aberturas de ventilação permanente do ambiente: a esquadria com Ventilacao_permanente_cm2 (família) e a declarada pelo RT */
  function ventilacoesDo(amb, aberturas, famPorId, avaliarFam, decl) {
    var out = [];
    arr(decl).forEach(function (d) { if (!d || !(num(d.area_cm2, 0) > 0)) return; if (amb && d.ambiente != null && String(d.ambiente) !== String(amb.id)) return; out.push({ area: num(d.area_cm2, 0), y0: d.y0 != null ? num(d.y0, null) : null, y1: d.y1 != null ? num(d.y1, null) : null, posicao: d.posicao === "superior" || d.posicao === "inferior" ? d.posicao : (d.posicao === "unica" ? "unica" : null), origem: "declarada" }); });
    if (!amb || !amb.calc) return out;
    var ct = arr(amb.calc.contorno);
    aberturas.forEach(function (ab) {
      var f = famPorId[String(ab.id)]; if (!f) return;
      var a = avaliar(avaliarFam, f), vv = (a && a.valores) || {}, area = num(vv.Ventilacao_permanente_cm2, 0);
      if (!(area > 0)) return;
      var meio = { x: (ab.p1.x + ab.p2.x) / 2, z: (ab.p1.z + ab.p2.z) / 2 }, perto = false;
      for (var i = 0; i < ct.length && !perto; i++) { var p = ct[i], q = ct[(i + 1) % ct.length]; if (seg2(meio, meio, p, q) <= num(ab.espessura, 0) + EPS) perto = true; }
      if (perto) out.push({ area: area, y0: ab.y0, y1: ab.y1, posicao: null, origem: "esquadria " + ab.id });
    });
    return out;
  }
  /* o ponto está cercado por paredes nas 4 direções (na cota y)? — sem ambientes no modelo, é o sinal de parede interna */
  function fechadoPorParedes(p, y, paredes, exceto) {
    var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    return dirs.every(function (dd) { var q = { x: p.x + dd[0] * ALCANCE_RAIO, z: p.z + dd[1] * ALCANCE_RAIO }; return paredes.some(function (w) { if (w.id === exceto || y < w.base - EPS || y > w.topo + EPS) return false; return seg2(p, q, w.p1, w.p2) < w.esp / 2; }); });
  }
  /* distância em planta entre dois segmentos */
  function seg2(a, b, c, d) {
    function pt(p, u, v) { var dx = v.x - u.x, dz = v.z - u.z, L2 = dx * dx + dz * dz, t = L2 > 0 ? ((p.x - u.x) * dx + (p.z - u.z) * dz) / L2 : 0; t = Math.max(0, Math.min(1, t)); var qx = u.x + dx * t - p.x, qz = u.z + dz * t - p.z; return Math.sqrt(qx * qx + qz * qz); }
    function cruza(p1, p2, p3, p4) { function o(a1, b1, c1) { return (b1.x - a1.x) * (c1.z - a1.z) - (b1.z - a1.z) * (c1.x - a1.x); } var d1 = o(p3, p4, p1), d2b = o(p3, p4, p2), d3b = o(p1, p2, p3), d4 = o(p1, p2, p4); return ((d1 > 0 && d2b < 0) || (d1 < 0 && d2b > 0)) && ((d3b > 0 && d4 < 0) || (d3b < 0 && d4 > 0)); }
    if (cruza(a, b, c, d)) return 0;
    return Math.min(pt(a, c, d), pt(b, c, d), pt(c, a, b), pt(d, a, b));
  }

  var HidGas = { VERSAO: 1, conferir: conferir, aparelhos: aparelhos, classe: classe, tipoInfo: tipoInfo, _int: { pontoForca: pontoForca, ventilacoesDo: ventilacoesDo, registroNaCadeia: registroNaCadeia, rede: rede, KCAL_H_POR_KW: KCAL_H_POR_KW, CM2_POR_M2: CM2_POR_M2 } };
  global.HidGas = HidGas;
  if (typeof module !== "undefined" && module.exports) module.exports = HidGas;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
