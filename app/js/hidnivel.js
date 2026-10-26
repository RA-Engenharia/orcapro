/* =====================================================================
 * hidnivel.js — NÍVEL AUTOMÁTICO de caixas, ralos e grelhas (motor PURO, ES5, Node-testável). 18/10/2026.
 *
 * Pedido do Rogério: "ao colocar caixa sifonada, ralo, grelha, ralo linear, caixa de gordura, caixa de inspeção ou caixa de
 * passagem, a TAMPA ou a GRELHA fica sempre no nível do PISO ACABADO naquele ponto". A fonte do nível, nesta ordem:
 *   1. o PISO MODELADO no BIM: as lajes/pisos sob o ponto (contrapiso + revestimento empilhados = o topo da camada de CIMA;
 *      só o contrapiso = o topo dele), dentro da faixa de busca em volta da cota de referência;
 *   2. o IFC IMPORTADO (IfcSlab / IfcCovering): o topo da face superior no ponto — a amostra vem da tela (raio vertical,
 *      HidNivel.fonteIfc(fn)); em Node o teste injeta a fonte;
 *   3. na ÁREA EXTERNA, o TERRENO (topossólido) ou a PLATAFORMA/calçada (js/bimterreno.js) — a cota do terreno no ponto;
 *   4. sem nada disso, a cota de referência (o nível) + o PISO ACABADO PADRÃO do projeto (parametros.pisoAcabado), com AVISO.
 *
 *   HidNivel.em(estado, ponto{x,z}, yRef, parametros) → { y, origem, fonte: "bim"|"ifc"|"terreno"|"padrao", id?, aviso? }
 *   HidNivel.alvos(estado, ops) → as peças e famílias com nível automático (caixas, ralos, grelhas) — `nivelAuto: false` na op
 *     tira a peça da regra.
 *   Extensão do replay (BimEdit.estender "hidNivel"): no FIM de cada replay a TAMPA/GRELHA de cada alvo vai para o nível do
 *     ponto (associativo: mover a peça ou mudar o piso refaz); `estado.nivelAjustes` diz o que mudou (a tela religa o ambiente
 *     ou refaz a rede das peças GERADAS — js/hidkitui.js).
 * ⚠ Nenhum número de norma aqui: os "hid:ok" são faixa de busca e tolerância, declarados e trocáveis em parametros.
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { if (v === null || v === undefined || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  var CASAS = 10000;   // hid:ok 4 casas do biminst
  function r4(v) { return Math.round(v * CASAS) / CASAS; }
  function f2(v) { return (Math.round(v * 100) / 100).toFixed(2).replace(".", ","); }
  var EPS = 1e-6;   // hid:ok

  /* faixa de busca e tolerância (não é norma) */
  var GEO_NIVEL = {
    acima: 0.30,      // hid:ok o piso acabado pode estar até isto ACIMA da cota de referência (contrapiso + revestimento sobre a laje)
    abaixo: 0.10,     // hid:ok … e até isto ABAIXO (box rebaixado, degrau). ⚠ Mais fundo é a LAJE ESTRUTURAL rebaixada (o rebaixo do
                      //   banheiro, 0,15–0,30 m) — ela não é piso acabado: sem camada de piso modelada, vale a regra 4 (com aviso)
    tolAjuste: 0.001  // hid:ok 1 mm: abaixo disto a peça não "mudou de nível"
  };
  function geo(par, k) { return par && par[k] != null && isFinite(Number(par[k])) ? Number(par[k]) : GEO_NIVEL[k]; }

  /* AS PEÇAS DA REGRA: as do motor (biminst) e as famílias que o grafo trata como elas (js/hidgrafo.js pecaDaFamilia) */
  var PECAS_NIVEL = { ralo_seco: 1, ralo_sifonado: 1, caixa_sifonada: 1, caixa_inspecao: 1, caixa_gordura: 1, caixa_areia: 1, caixa_passagem: 1, grelha: 1, ralo_linear: 1 };
  var FAMILIAS_NIVEL = { "hid-ralo": 1, "hid-caixa-sifonada": 1, "hid-caixa-inspecao": 1, "hid-caixa-gordura": 1, "hid-caixa-areia": 1 };
  function familiaNoNivel(f) {
    if (!f) return false;
    if (FAMILIAS_NIVEL[f.famId]) return true;
    var HB = dep("HidBiblioteca", "./biminstbiblioteca.js");
    if (HB && HB.ehEscritorio && HB.ehEscritorio(f.famId)) { var p = null; try { p = HB.pecaGrafo(f.famId, f.tipoId); } catch (e) { p = null; } return !!(p && PECAS_NIVEL[p]); }
    return false;
  }

  /* ---------------------------------------------------------- 1) PISO DO BIM */
  function dentroCaixa(c, p) {
    var cs = Math.cos(num(c.rotY, 0)), sn = Math.sin(num(c.rotY, 0)), dx = p.x - num(c.cx, 0), dz = p.z - num(c.cz, 0);
    var u = dx * cs - dz * sn, w = dx * sn + dz * cs;   /* o eixo local da caixa (o mesmo do BimEdit: x' ao longo do comprimento) */
    return Math.abs(u) <= num(c.comprimento, 0) / 2 + EPS && Math.abs(w) <= num(c.espessura, 0) / 2 + EPS;
  }
  function pisoBim(estado, p, yRef, par) {
    var melhor = null;
    arr(estado && estado.caixas).forEach(function (c) {
      if (!c || c.tipo !== "laje" || !dentroCaixa(c, p)) return;
      var topo = num(c.cy, 0) + num(c.altura, 0) / 2;
      if (topo > yRef + geo(par, "acima") + EPS || topo < yRef - geo(par, "abaixo") - EPS) return;
      if (!melhor || topo > melhor.y + EPS) melhor = { y: r4(topo), id: c.id, rotulo: c.tipoLaje && c.tipoLaje.rotulo ? c.tipoLaje.rotulo : "laje/piso" };
    });
    return melhor;
  }
  /* ---------------------------------------------------------- 2) IFC */
  function pisoIfc(p, yRef, par) {
    if (typeof HidNivel._fonteIfc !== "function") return null;
    var h = null; try { h = HidNivel._fonteIfc(p.x, p.z, yRef + geo(par, "acima")); } catch (e) { h = null; }
    if (!h || !isFinite(num(h.y, NaN)) || h.y < yRef - geo(par, "abaixo") - EPS) return null;
    return { y: r4(h.y), tipo: h.tipo || "IFCSLAB", uid: h.uid || null };
  }
  /* ---------------------------------------------------------- 3) TERRENO / PLATAFORMA */
  function dentroPoli(p, pts) { var d = false; for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) { var a = pts[i], b = pts[j]; if (((a.z > p.z) !== (b.z > p.z)) && (p.x < (b.x - a.x) * (p.z - a.z) / (b.z - a.z) + a.x)) d = !d; } return d; }
  function terreno(estado, p) {
    var T = estado && estado.terreno, BT = dep("BimTerreno", "./bimterreno.js"); if (!T || !BT) return null;
    /* a plataforma (calçada, pátio) manda sobre o topossólido sob ela */
    var pl = arr(T.plataformas).filter(function (q) { return arr(q.contorno).length >= 3 && dentroPoli(p, q.contorno) && isFinite(num(q.base, NaN)); })[0];   // hid:ok polígono tem 3+ vértices
    if (pl) return { y: r4(num(pl.base, 0)), id: pl.id, tipo: "plataforma" };
    for (var i = 0; i < arr(T.topos).length; i++) {
      var S = BT.superficieDe(estado, T.topos[i].id), y = S ? BT.cota(S, p.x, p.z) : null;
      if (y != null && isFinite(y)) return { y: r4(y), id: T.topos[i].id, tipo: "topossolido" };
    }
    return null;
  }

  /* O NÍVEL no ponto */
  function em(estado, p, yRef, par) {
    par = par || {}; yRef = num(yRef, 0);
    var b = pisoBim(estado, p, yRef, par);
    if (b) return { y: b.y, fonte: "bim", id: b.id, origem: "topo da " + b.rotulo + " " + b.id };
    var f = pisoIfc(p, yRef, par);
    if (f) return { y: f.y, fonte: "ifc", id: f.uid, origem: "topo do " + f.tipo + " do IFC importado" };
    var t = terreno(estado, p);
    if (t) return { y: t.y, fonte: "terreno", id: t.id, origem: (t.tipo === "plataforma" ? "plataforma/calçada " : "terreno ") + t.id };
    var pa = num(par.pisoAcabado, null), y = r4(yRef + (pa == null ? 0 : pa));
    return { y: y, fonte: "padrao", origem: "cota do nível " + f2(yRef) + " m" + (pa == null ? " (piso acabado padrão do projeto não informado)" : " + piso acabado padrão " + f2(pa) + " m"),
             aviso: "sem piso, IFC nem terreno sob o ponto (" + f2(p.x) + "; " + f2(p.z) + "): a tampa ficou na cota do nível" + (pa == null ? " — informe o piso acabado padrão do projeto" : " + o piso acabado padrão") };
  }

  /* os alvos do estado: { tipo: "peca"|"familia", ref (objeto do estado), id, gerado } */
  function alvos(estado, ops) {
    var K = dep("HidKit", "./hidkit.js"), opsPor = {}, lista = K && K.achatar ? K.achatar(arr(ops)) : arr(ops);
    /* ⚠ 25/10/2026: a op que CRIA a peça (familia/peca) — não a última com o mesmo id: o "orcar" da peça (Propriedades ›
       Orçamento) vinha depois e escondia o nivelAuto:false e a marca de gerada (kit/amb/rede) da criação (projeto exemplo) */
    lista.forEach(function (o) { if (o && o.id != null && (o.op === "familia" || o.op === "peca" || !opsPor[String(o.id)])) opsPor[String(o.id)] = o; });
    var out = [];
    arr(estado && estado.instalacoes && estado.instalacoes.pecas).forEach(function (k) {
      if (!PECAS_NIVEL[k.peca]) return; var o = opsPor[String(k.id)] || {};
      if (o.nivelAuto === false) return;
      out.push({ tipo: "peca", ref: k, id: k.id, gerado: o.kit != null || o.amb != null || o.rede != null || o.predio != null });
    });
    arr(estado && estado.familias).forEach(function (f) {
      if (!familiaNoNivel(f)) return; var o = opsPor[String(f.id)] || {};
      if (o.nivelAuto === false) return;
      out.push({ tipo: "familia", ref: f, id: f.id, gerado: o.kit != null || o.amb != null || o.rede != null || o.predio != null });
    });
    return out;
  }

  /* a EXTENSÃO do replay: o nível de cada alvo (o y da op é a cota de referência) */
  function fim(ctx, saida) {
    var ops = ctx && ctx._ops ? ctx._ops : null, par = HidNivel.parametros || {}, aj = [];
    alvos(saida, ops).forEach(function (a) {
      var k = a.ref, yRef = num(k.y, 0), N = em(saida, { x: num(k.x, 0), z: num(k.z, 0) }, yRef, par), dy = N.y - yRef;
      if (k.hub) { k.hub.x = k.x; k.hub.z = k.z; }   /* o "mover" da peça troca x/z e não o cilindro de captura */
      if (Math.abs(dy) <= geo(par, "tolAjuste")) { k.nivel = { fonte: N.fonte, origem: N.origem, aviso: N.aviso || null }; return; }
      k.y = N.y; k.nivel = { fonte: N.fonte, origem: N.origem, de: r4(yRef), aviso: N.aviso || null };
      if (k.hub) { k.hub.yTop = r4(k.hub.yTop + dy); k.hub.yBot = r4(k.hub.yBot + dy); }
      aj.push({ id: a.id, tipo: a.tipo, gerado: a.gerado, de: r4(yRef), para: N.y, fonte: N.fonte, origem: N.origem, aviso: N.aviso || null });
    });
    if (aj.length) saida.nivelAjustes = aj;
  }
  function registrar() {
    var BE = dep("BimEdit", "./bimedit.js"); if (!BE || !BE.estender) return false;
    return BE.estender({ nome: "hidNivel", aplicar: function () { return false; }, fim: fim });
  }

  var HidNivel = { VERSAO: 1, GEO_NIVEL: GEO_NIVEL, PECAS_NIVEL: PECAS_NIVEL, FAMILIAS_NIVEL: FAMILIAS_NIVEL, em: em, alvos: alvos, registrar: registrar, parametros: {},
    _fonteIfc: null, fonteIfc: function (fn) { HidNivel._fonteIfc = typeof fn === "function" ? fn : null; return true; },
    _int: { pisoBim: pisoBim, pisoIfc: pisoIfc, terreno: terreno, dentroCaixa: dentroCaixa, fim: fim } };
  global.HidNivel = HidNivel;
  if (typeof module !== "undefined" && module.exports) module.exports = HidNivel;
  registrar();
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
