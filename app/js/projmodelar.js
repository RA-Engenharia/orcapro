/* =====================================================================
 * projmodelar.js — F5: «MODELAR NO 3D» a partir do projeto lido (DXF/PDF). Motor PURO, ES5, Node-testável
 * (node tools/test-projmodelar.js). 14/11/2026.
 *
 * ENTRADA: o modelo da junção (ProjOrcar.orcar(...).modelo — elementos do projler/projpdf com `geo` em METROS no
 * plano do desenho, `qto`, `pavimento`, `hospedeiro`) + modelo.modelo.pavimentos [{ nome, cota, altura }].
 * SAÍDA: { lote, ops, criadas: { parede, porta, janela, louca, generico }, avisos, pavimentos } — UM lote do editor
 * (js/bimedit.js): um Ctrl+Z desfaz tudo. Nada é gravado aqui; quem grava é BIM.editarLote (fiação: js/mor/ifcui.js).
 *
 * REGRAS (cada uma com o porquê; nada de pergunta — um clique):
 *   · Parede = E.parede(eixo, espessura medida, altura do pavimento, cota do pavimento), unida nos cantos como no
 *     editor. Coordenada: x do desenho = x do mundo; y do desenho = −z (a planta vista de cima não espelha).
 *   · Porta/janela = família do catálogo HOSPEDADA na parede do vão (o editor recorta a parede pelo vão da família),
 *     no centro do vão medido. Largura MEDIDA; altura PADRÃO (deduzida): porta 2,10 m, janela 1,20 m com peitoril
 *     0,90 m (a verga da janela alinhada à da porta, 2,10 m). A folha da porta desconta o batente, como no conversor IFC.
 *   · Louça = família do catálogo pelo tipo lido (bacia, lavatório, chuveiro, tanque, pia) na posição e rotação do
 *     bloco. Tipo sem família, ou vão sem parede criada → objeto GENÉRICO marcado («sem família compatível»), nunca
 *     uma família inventada.
 *   · Pavimentos empilhados pela COTA lida; sem cota, pela ordem do nome (térreo, 1º, 2º …), cada um em cima da
 *     altura do anterior (DEDUZIDO, avisado). Cada pavimento é trazido à origem pelo canto do seu contorno de paredes
 *     (as plantas ficam lado a lado no DXF): alinhamento por elemento comum (escada, elevador) ainda não existe.
 * ===================================================================== */
(function (global) {
  "use strict";

  function num(v, d) { var n = Number(v); return isFinite(n) ? n : d; }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function arr(v) { return Object.prototype.toString.call(v) === "[object Array]" ? v : []; }
  function br(v) { return String(Math.round(v * 100) / 100).replace(".", ","); }
  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  function sa(s) { return String(s || "").toLowerCase().normalize ? String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") : String(s || "").toLowerCase(); }

  var PADRAO = { alturaPorta: 2.10, alturaJanela: 1.20, peitoril: 0.90, peDireito: 2.80, alturaGenerico: 0.80 };
  var FAM_PORTA = { famId: "ra-porta-giro", tipoId: "p80", batente: 0.05 }, FAM_JANELA = { famId: "ra-janela-correr", tipoId: "j1210" };
  /* tipo de louça lido (projclass-dados: sub) → família do catálogo (js/hidfamilias.js) */
  var FAM_LOUCA = { bacia: "hid-bacia-caixa-acoplada", lavatorio: "hid-lavatorio-coluna", chuveiro: "hid-chuveiro", tanque: "hid-tanque-lavar", pia: "hid-pia-cozinha" };

  /* ordem do pavimento pelo nome, quando não há cota: subsolo < térreo < 1º < 2º … < cobertura */
  function ordemNome(nome) {
    var t = sa(nome), m;
    if (/subsolo|garagem/.test(t)) return -1;
    if (/terreo|termo|pavimento unico/.test(t)) return 0;
    if (/cobertura|atico|casa de maquinas|telhado/.test(t)) return 90;
    if (/superior/.test(t)) return 1;
    m = /(\d+)\s*(?:º|o|°)?\s*(?:pav|andar)/.exec(t) || /(?:pav|andar)\w*\s*(\d+)/.exec(t);
    if (m) return Number(m[1]);
    return 50;
  }

  function pavimentosDe(modelo, els) {
    var lidos = arr(modelo && modelo.modelo && modelo.modelo.pavimentos), por = {}, lista = [], avisos = [];
    lidos.forEach(function (p) { if (p && p.nome && !por[p.nome]) { por[p.nome] = { nome: p.nome, cota: typeof p.cota === "number" ? p.cota : null, altura: num(p.altura, 0) }; lista.push(por[p.nome]); } });
    els.forEach(function (e) { var n = e.pavimento || "PAVIMENTO"; if (!por[n]) { por[n] = { nome: n, cota: null, altura: 0 }; lista.push(por[n]); } });
    lista.forEach(function (p) {
      if (!(p.altura > 0)) els.forEach(function (e) { if ((e.pavimento || "PAVIMENTO") === p.nome && e.papel === "parede-alvenaria") p.altura = Math.max(p.altura, num(e.qto && e.qto.altura, 0)); });
      if (!(p.altura > 0)) p.altura = PADRAO.peDireito;
      /* origem do pavimento: canto do contorno das paredes dele */
      var x0 = Infinity, y0 = Infinity, y1 = -Infinity;
      els.forEach(function (e) { if ((e.pavimento || "PAVIMENTO") !== p.nome || !e.geo) return; var g = e.geo; [[g.x1, g.y1], [g.x2, g.y2], [g.x, g.y]].forEach(function (q) { if (isFinite(q[0]) && isFinite(q[1]) && q[0] !== undefined) { if (q[0] < x0) x0 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; } }); });
      p.ox = isFinite(x0) ? x0 : 0; p.oy = isFinite(y1) ? y1 : 0;
    });
    var comCota = lista.filter(function (p) { return p.cota !== null; }), semCota = lista.filter(function (p) { return p.cota === null; });
    if (lista.length > 1 && semCota.length) {
      semCota.sort(function (a, b) { return ordemNome(a.nome) - ordemNome(b.nome); });
      var topo = comCota.length ? Math.max.apply(null, comCota.map(function (p) { return p.cota + p.altura; })) : 0;
      semCota.forEach(function (p) { p.cota = topo; p.deduzida = true; topo += p.altura; });
      avisos.push(semCota.length + " pavimento(s) sem cota de nível no projeto: empilhados pela ordem do nome, cada um sobre a altura do anterior (DEDUZIDO, confira)");
    } else semCota.forEach(function (p) { p.cota = 0; });
    if (lista.length > 1) avisos.push("os pavimentos foram alinhados pelo canto do contorno das paredes de cada planta (elemento comum — escada, elevador — ainda não é usado): confira a sobreposição");
    return { lista: lista, por: por, avisos: avisos };
  }

  /* objeto genérico: caixa extrudada (volume livre, categoria genérico) marcada pelo nome */
  function generico(id, x, z, y, w, d, h, rotY, nome) {
    w = Math.max(0.1, num(w, 0.4)); d = Math.max(0.1, num(d, 0.4)); h = Math.max(0.1, num(h, PADRAO.alturaGenerico));
    var c = Math.cos(rotY || 0), s = Math.sin(rotY || 0), pts = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(function (q) { return [r4(x + q[0] * c - q[1] * s), r4(-(z + q[0] * s + q[1] * c))]; });
    /* plano horizontal na cota y: u = +x, v = −z → normal +y; o contorno vai em (x, −z) */
    return { op: "volume", id: id, volume: { categoria: "generico", material: "Genérico", nome: String(nome).slice(0, 80), receita: { forma: "extrusao", contorno: pts, altura: r4(h), plano: { o: [0, r4(y), 0], u: [1, 0, 0], v: [0, 0, -1] } } } };
  }

  /* opts: { novoId(prefixo), tipoDe(famId) → tipoId|"" (catálogo carregado), temFamilia(famId) → bool, unir } */
  function gerar(modelo, opts) {
    opts = opts || {};
    var E = dep("BimEdit", "./bimedit.js"), A = dep("BimArq", "./bimarq.js");
    var vazio = { ok: false, lote: null, ops: [], criadas: {}, avisos: [], genericos: [] };
    if (!E || !A) { vazio.erro = "o motor do editor (js/bimedit.js, js/bimarq.js) não carregou"; return vazio; }
    var els = arr(modelo && modelo.elementos);
    if (!els.some(function (e) { return e.papel === "parede-alvenaria" && e.geo; })) { vazio.erro = "o projeto lido não tem paredes com posição para modelar"; return vazio; }
    var cont = 0, nid = typeof opts.novoId === "function" ? opts.novoId : function (p) { return (p || "pm") + "x" + (++cont); };
    var temFam = typeof opts.temFamilia === "function" ? opts.temFamilia : function () { return true; };
    var tipoDe = typeof opts.tipoDe === "function" ? opts.tipoDe : function () { return ""; };
    var PV = pavimentosDe(modelo, els), ops = [], criadas = { parede: 0, porta: 0, janela: 0, louca: 0, generico: 0 }, avisos = PV.avisos.slice(), genericos = [], recusadas = [];
    function pav(e) { return PV.por[e.pavimento || "PAVIMENTO"]; }
    function mundo(p, x, y) { return { x: r4(x - p.ox), z: r4(p.oy - y) }; }   /* y do desenho → −z; origem no canto do pavimento */
    var caixaDe = {}, idDe = {};

    /* 1. paredes */
    els.forEach(function (e) {
      if (e.papel !== "parede-alvenaria" || !e.geo) return;
      var p = pav(e), g = e.geo, a = mundo(p, g.x1, g.y1), b = mundo(p, g.x2, g.y2), esp = num(e.qto && e.qto.largura, 0.15), h = num(e.qto && e.qto.altura, 0) > 0 ? e.qto.altura : p.altura;
      var c = E.parede(a, b, esp, h, p.cota);
      if (!c) { recusadas.push({ id: e.id, motivo: "parede fora das medidas do editor" }); return; }
      A.marcarParede(c, { unir: opts.unir !== false, anexarTopo: false });
      var id = nid("pa"); ops.push({ op: "criar", id: id, caixa: A.paraOp(c) });
      caixaDe[e.id] = c; idDe[e.id] = id; criadas.parede++;
    });

    /* 2. vãos: família hospedada no centro do vão medido */
    var tipos = {};
    els.forEach(function (e) {
      if ((e.papel !== "porta" && e.papel !== "janela") || !e.geo) return;
      var p = pav(e), g = e.geo, ehP = e.papel === "porta", W = num(e.qto && e.qto.largura, 0), F = ehP ? FAM_PORTA : FAM_JANELA;
      var hv = ehP ? PADRAO.alturaPorta : num(e.qto && e.qto.altura, PADRAO.alturaJanela), meio = mundo(p, (g.x1 + g.x2) / 2, (g.y1 + g.y2) / 2);
      var host = caixaDe[e.hospedeiro], lt = ehP ? r4(W - 2 * F.batente) : r4(W), at = ehP ? r4(hv - F.batente) : r4(hv);
      if (!host || !temFam(F.famId) || !(lt >= 0.25) || !(at >= 0.3)) {
        var mot = !host ? "a parede do vão não foi criada" : (!temFam(F.famId) ? "família de " + e.papel + " não está no catálogo" : "vão pequeno demais para a família (" + br(W) + " m)");
        var rot0 = host ? host.rotY : Math.atan2(-(g.y2 - g.y1), g.x2 - g.x1), gid = nid("ge");
        ops.push(generico(gid, meio.x, meio.z, p.cota + (ehP ? 0 : PADRAO.peitoril), W || 0.6, 0.1, hv, -rot0, "Genérico — " + e.papel + " " + br(W) + " m (sem família compatível: " + mot + ")"));
        genericos.push({ id: gid, elemento: e.id, motivo: mot }); criadas.generico++; return;
      }
      var fid = nid("fa"), inst = {}, t = E.tNaParede(host, meio);
      if (!ehP) inst.Peitoril = PADRAO.peitoril;
      ops.push({ op: "familia", id: fid, famId: F.famId, tipoId: F.tipoId, inst: inst, host: { id: idDe[e.hospedeiro], t: r4(t) } });
      var tk = e.papel + "|" + lt + "|" + at, tid = tipos[tk];
      if (!tid) {
        tid = "proj-" + e.papel.slice(0, 1) + "-" + String(lt).replace(".", "_") + "x" + String(at).replace(".", "_"); tipos[tk] = tid;
        var v = {}; v["fam:Largura"] = lt; v["fam:Altura"] = at;
        ops.push({ op: "ajustarTipo", categoria: e.papel, tipoId: tid, nome: br(W) + " × " + br(hv) + " (do projeto)", valores: v, ids: [fid] });
      } else ops.push({ op: "ajustarTipo", categoria: e.papel, tipoId: tid, ids: [fid] });
      criadas[e.papel]++;
    });

    /* 3. louças: família na posição do bloco */
    els.forEach(function (e) {
      if (e.papel !== "louca" || !e.geo || !isFinite(e.geo.x)) return;
      var p = pav(e), g = e.geo, q = mundo(p, g.x, g.y), rotY = r4(num(g.rot, 0) * Math.PI / 180), fam = FAM_LOUCA[e.sub];
      if (fam && temFam(fam)) {
        ops.push({ op: "familia", id: nid("lo"), famId: fam, tipoId: tipoDe(fam) || "", x: q.x, y: r4(p.cota), z: q.z, rotY: rotY, inst: {} });
        criadas.louca++; return;
      }
      var gid = nid("ge"), mot = fam ? "família «" + fam + "» não está no catálogo" : "tipo «" + (e.sub || e.nome || "?") + "» sem família no catálogo";
      ops.push(generico(gid, q.x, q.z, p.cota, g.w, g.h, PADRAO.alturaGenerico, -rotY, "Genérico — " + (e.nome || e.sub || "bloco") + " (sem família compatível: " + mot + ")"));
      genericos.push({ id: gid, elemento: e.id, motivo: mot }); criadas.generico++;
    });

    if (recusadas.length) avisos.push(recusadas.length + " parede(s) recusada(s) pelo editor (fora das medidas)");
    if (genericos.length) avisos.push(genericos.length + " objeto(s) GENÉRICO(S) marcado(s): sem família compatível — " + genericos[0].motivo + (genericos.length > 1 ? " …" : ""));
    avisos.push("altura de porta " + br(PADRAO.alturaPorta) + " m, janela " + br(PADRAO.alturaJanela) + " m e peitoril " + br(PADRAO.peitoril) + " m são PADRÃO (deduzidos): o projeto em planta não traz a altura do vão");
    var lote = ops.length ? { op: "lote", id: nid("lpm"), origem: "projeto-modelar", pedido: "Modelar no 3D a partir do projeto", ops: ops } : null;
    return { ok: !!lote, lote: lote, ops: ops, criadas: criadas, avisos: avisos, genericos: genericos, recusadas: recusadas, pavimentos: PV.lista.map(function (p) { return { nome: p.nome, cota: p.cota, altura: p.altura, deduzida: !!p.deduzida }; }) };
  }

  var ProjModelar = { gerar: gerar, PADRAO: PADRAO, FAM_LOUCA: FAM_LOUCA, _ordemNome: ordemNome };
  global.ProjModelar = ProjModelar;
  if (typeof module !== "undefined" && module.exports) module.exports = ProjModelar;
})(typeof window !== "undefined" ? window : globalThis);
