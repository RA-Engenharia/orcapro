/* =====================================================================
 * metalelemento.js — METÁLICA: ELEMENTO e TIPO das peças do pórtico da
 * biblioteca (motor PURO, ES5, sem DOM, Node-testável). 21/11/2026.
 *
 * Pedido do Rogério (Pórticos industriais):
 *   1. "clicar numa peça seleciona o ELEMENTO inteiro" — o pilar treliçado
 *      (banzos + travejamento + placas), a tesoura, uma terça. Tab ou duplo
 *      clique entram na peça (o mesmo padrão do componente das peças
 *      prontas, js/metalcomponente.js); Shift+Tab volta ao todo; Esc sai.
 *   2. "grupo paramétrico por categoria" — elementos da mesma categoria e
 *      geometria formam um TIPO (Pilar PT-1, Tesoura TS-1, Terça TR-1…).
 *      Trocar o perfil de uma peça dentro de um elemento troca a MESMA peça
 *      (o mesmo "lugar" no elemento) em todos os elementos do tipo.
 *      "Separar este" dá ao elemento um tipo novo (TS-2) e ele passa a
 *      editar sozinho.
 *
 * ONDE O DADO MORA (sobrevive a salvar/reabrir: é campo da caixa, refeito
 * pelo replay do editor)
 *   caixa.elemMetal = { el, cat, rot, slot, tipo, tipoBase, anexo?, mud? }
 *     el ........ a chave do elemento DENTRO do pórtico ("k2:col:L", "b:b311")
 *                 — o elemento é (caixa.portico, el)
 *     cat ....... pilar | tesoura | vigaCob | terca | escora | … (o grupo)
 *     slot ...... o lugar da peça no elemento, em coordenadas LOCAIS (pilar:
 *                 x medido da face de fora para dentro — os pilares da
 *                 esquerda e da direita, espelhados, casam peça a peça)
 *     tipo ...... o tipo de agora; tipoBase o que a geometria deu ao nascer
 *     anexo ..... placa/clip/parafuso de ligação: vai junto na seleção do
 *                 elemento, mas não propaga edição
 *     mud ....... a edição manual guardada ({ cat: "…" })
 *   Ele fica no TOPO da caixa: a op metalAjustar (Propriedades) só troca a
 *   geometria (js/metalpeca.js GEOM_AJUSTAR) e não o apaga.
 *   caixa.porticoInfo.elemLog = [{ em, acao, tipo, slot, campo, de, para, n }]
 *     — a AUDITORIA da edição por tipo, na peça que guarda o porticoInfo.
 *   NADA SE PERDE NO RECÁLCULO: "Atualizar o pórtico no lugar" lê as edições
 *   (edicoesDe) e o gerador (js/metalporticos.js gerar, opG.edicoes) as
 *   reaplica na peça nova do mesmo tipo e lugar.
 *
 * Op do replay (extensão do BimEdit):
 *   metalElemento { ids:[…], tipo?, mud?: {campo: valor}, portico?, log?: {…} }
 *
 * API
 *   MetalElemento.marcar(barras, nos, op)       no gerador: slot + tipo de cada barra (b.elem)
 *   MetalElemento.elemento(caixas, id)          { chave, portico, el, cat, rot, tipo, pecas, n }
 *   MetalElemento.doTipo(caixas, portico, tipo) os elementos do tipo
 *   MetalElemento.expandir(caixas, uid, st)     { uids, st } — o clique
 *   MetalElemento.tab(caixas, st, shift)        { uids, st, texto }
 *   MetalElemento.correspondentes(caixas, id)   as peças do MESMO lugar nos outros elementos do tipo
 *   MetalElemento.propagar(caixas, id, mud, editar)  { ops, ids, log } — editar = MetalCriar.editar
 *   MetalElemento.separar(caixas, id, quando)   { ok, tipo, op }
 *   MetalElemento.painel(caixas, id)            { texto, tipo, n, proximo }
 *   MetalElemento.edicoesDe(caixas, portico)    { tipos, mud, log } para o gerador
 * Teste: node tools/test-metal-grupo-tipo.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function mm(v) { return Math.round(v * 1000); }

  /* as categorias: prefixo do tipo e rótulo */
  var CAT = {
    pilar: { pre: "PT", rot: "Pilar" }, tesoura: { pre: "TS", rot: "Tesoura" }, vigaCob: { pre: "VC", rot: "Viga de cobertura" },
    terca: { pre: "TR", rot: "Terça" }, escora: { pre: "ES", rot: "Escora" }, contravento: { pre: "CV", rot: "Contravento" },
    corrente: { pre: "CR", rot: "Corrente" }, tapamento: { pre: "CT", rot: "Coluna de tapamento" }, rolamento: { pre: "VR", rot: "Viga de rolamento" },
    maoFrancesa: { pre: "MF", rot: "Mão-francesa" }, secMez: { pre: "VS", rot: "Viga secundária do mezanino" }, pilarMez: { pre: "PM", rot: "Pilar do mezanino" },
    vigaMez: { pre: "VM", rot: "Viga do mezanino" }, outro: { pre: "EL", rot: "Elemento" }
  };
  /* grupos (js/metalporticos.js) que formam o PILAR do pórtico; os da cobertura que fazem dele uma TESOURA */
  var GR_PILAR = { pilar: 1, banzoColuna: 1, travejamento: 1, console: 1, pilarInterno: 1 };
  var GR_SOLO = { pilarMez: 1, vigaMez: 1 };
  var GR_TRELICA = { banzoSup: 1, banzoInf: 1, diagonal: 1, montante: 1 };
  /* os campos da Propriedades que valem para o TIPO (posição e comprimento são da peça) */
  var CAMPOS_TIPO = { cat: 1, aco: 1, giro: 1 };

  function catInfo(c) { return CAT[c] || CAT.outro; }

  /* ================================================================ NO GERADOR
   * a chave do elemento de uma barra do PÓRTICO (frame k): pilar por lado (ou por fila, no multivão/shed), a cobertura inteira
   * do pórtico, e as solitárias (mezanino) por barra. q = { pa, pb } os pontos do quadro; o = { vao, colX, porFila } */
  function chaveQuadro(grupo, k, xm, o) {
    if (GR_SOLO[grupo]) return null;   /* cada barra é o seu elemento (chave da barra) */
    if (GR_PILAR[grupo]) {
      var lado;
      if (o.porFila && arr(o.colX).length) { var best = 0, d0 = Infinity; o.colX.forEach(function (x, i) { var d = Math.abs(x - xm); if (d < d0) { d0 = d; best = i; } }); lado = "F" + best; }
      else lado = xm < o.vao / 2 ? "L" : "R";
      return { el: "k" + k + ":col:" + lado, cat: "pilar" };
    }
    return { el: "k" + k + ":cob", cat: "cob" };
  }
  /* slot + tipo de todas as barras. b.elem = { el, cat } (as sem elem viram elemento próprio). op = { xc } o meio do vão no mundo */
  function marcar(barras, nos, op) {
    op = op || {};
    var por = {}, ordem = [];
    arr(barras).forEach(function (b) {
      if (!b.elem) b.elem = { el: "b:" + b.id, cat: CAT[b.grupo] ? b.grupo : "outro" };
      var e = por[b.elem.el]; if (!e) { e = por[b.elem.el] = { el: b.elem.el, cat: b.elem.cat, barras: [] }; ordem.push(b.elem.el); }
      e.barras.push(b);
    });
    var tipos = {}, cont = {};
    ordem.forEach(function (k) {
      var e = por[k];
      if (e.cat === "cob") e.cat = e.barras.some(function (b) { return GR_TRELICA[b.grupo]; }) ? "tesoura" : "vigaCob";
      var pts = []; e.barras.forEach(function (b) { if (nos[b.a]) pts.push(nos[b.a]); if (nos[b.b]) pts.push(nos[b.b]); });
      var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
      pts.forEach(function (P) { for (var i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], P[i]); mx[i] = Math.max(mx[i], P[i]); } });
      /* o pilar mede de FORA para dentro (espelhado à direita); o resto da esquerda para a direita */
      var sx = 1, ox = mn[0];
      if (e.cat === "pilar" && op.xc != null && (mn[0] + mx[0]) / 2 > op.xc) { sx = -1; ox = mx[0]; }
      var loc = function (P) { return [mm((P[0] - ox) * sx), mm(P[1] - mn[1]), mm(P[2] - mn[2])].join(","); };
      var assin = [];
      e.barras.forEach(function (b) {
        var A = nos[b.a], Bp = nos[b.b]; if (!A || !Bp) { b.elem.slot = b.id; return; }
        var la = loc(A), lb = loc(Bp), par = la < lb ? la + "|" + lb : lb + "|" + la;
        b.elem.slot = (b.grupo || "") + "@" + par;
        assin.push(b.elem.slot + "=" + (b.cat || JSON.stringify(b.perfil || null)));
      });
      assin.sort();
      var sig = e.cat + "#" + assin.join(";");
      var t = tipos[sig];
      if (!t) { var pre = catInfo(e.cat).pre; cont[pre] = (cont[pre] || 0) + 1; t = tipos[sig] = pre + "-" + cont[pre]; }
      e.barras.forEach(function (b) { b.elem.cat = e.cat; b.elem.rot = catInfo(e.cat).rot; b.elem.tipo = t; b.elem.tipoBase = t; });
    });
    return { elementos: ordem.length, tipos: Object.keys(tipos).length };
  }
  /* no gerador: as edições guardadas aplicadas à barra (antes de virar peça) → { tipo, mud } */
  function edicaoDaBarra(b, ed) {
    if (!b || !b.elem || !ed) return null;
    var tipo = (ed.tipos && ed.tipos[b.elem.el]) || b.elem.tipo, mud = null;
    arr(ed.mud).forEach(function (x) { if (x && x.tipo === tipo && x.slot === b.elem.slot && CAMPOS_TIPO[x.campo]) { mud = mud || {}; mud[x.campo] = x.valor; } });
    return { tipo: tipo, mud: mud };
  }

  /* ================================================================ NO MODELO (as caixas) */
  function idDe(uid) { var s = String(uid == null ? "" : uid); return /^edit:/.test(s) ? s.slice(5) : s; }
  function porId(caixas) { var o = {}; arr(caixas).forEach(function (c) { if (c && c.id != null) o[String(c.id)] = c; }); return o; }
  function chave(c) { return c && c.elemMetal && c.portico ? String(c.portico) + "|" + c.elemMetal.el : null; }
  function elemento(caixas, id) {
    var cs = arr(caixas), P = porId(cs), c = P[idDe(id)], k = chave(c); if (!k) return null;
    var pecas = cs.filter(function (x) { return chave(x) === k; }).map(function (x) { return String(x.id); });
    var e = c.elemMetal;
    return { chave: k, portico: String(c.portico), el: e.el, cat: e.cat, rot: e.rot || catInfo(e.cat).rot, tipo: e.tipo, pecas: pecas, n: pecas.length };
  }
  function doTipo(caixas, portico, tipo) {
    var por = {}, ordem = [];
    arr(caixas).forEach(function (c) {
      if (!c || !c.elemMetal || String(c.portico) !== String(portico) || c.elemMetal.anexo || c.elemMetal.tipo !== tipo) return;
      var k = chave(c); if (!por[k]) { por[k] = { chave: k, el: c.elemMetal.el, pecas: [] }; ordem.push(k); }
      por[k].pecas.push(String(c.id));
    });
    return ordem.map(function (k) { return por[k]; });
  }
  /* o clique: o elemento inteiro (ou só a peça, quando o Tab/duplo clique já entrou NESTE elemento) */
  function expandir(caixas, uid, st) {
    var e = elemento(caixas, uid); if (!e || e.n < 2) return { uids: [uid], st: e ? { chave: e.chave, peca: uid, dentro: true } : null };
    if (st && st.dentro && st.chave === e.chave) return { uids: [uid], st: { chave: e.chave, peca: uid, dentro: true } };
    return { uids: e.pecas.map(function (p) { return "edit:" + p; }), st: { chave: e.chave, peca: uid, dentro: false } };
  }
  function nomeDa(P, uid) { var c = P[idDe(uid)]; return c && c.metal ? (c.metal.papel || "peça") : "peça"; }
  function tab(caixas, st, shift) {
    if (!st || !st.chave) return null;
    var cs = arr(caixas), P = porId(cs), todas = cs.filter(function (x) { return chave(x) === st.chave; }).map(function (x) { return "edit:" + x.id; });
    if (!todas.length) return null;
    var s2 = clone(st), e = elemento(cs, todas[0]);
    if (shift) { s2.dentro = false; return { uids: todas, st: s2, texto: e.rot + " " + e.tipo + " inteiro (" + todas.length + " peças). Tab entra na peça." }; }
    if (!st.dentro) { s2.dentro = true; if (todas.indexOf(s2.peca) < 0) s2.peca = todas[0]; }
    else { var i = todas.indexOf(st.peca); s2.peca = todas[(i + 1 + todas.length) % todas.length]; }
    return { uids: [s2.peca], st: s2, texto: "Peça do " + e.rot.toLowerCase() + " " + e.tipo + ": " + nomeDa(P, s2.peca) + " (" + (todas.indexOf(s2.peca) + 1) + " de " + todas.length + "). Tab passa para a próxima; Shift+Tab ou Esc volta ao elemento." };
  }
  /* as peças do MESMO lugar nos outros elementos do mesmo tipo (sem os anexos) */
  function correspondentes(caixas, id) {
    var cs = arr(caixas), c = porId(cs)[idDe(id)]; if (!c || !c.elemMetal || c.elemMetal.anexo) return [];
    var e = c.elemMetal, k = chave(c);
    return cs.filter(function (x) { return x !== c && x.elemMetal && !x.elemMetal.anexo && String(x.portico) === String(c.portico) && x.elemMetal.tipo === e.tipo && x.elemMetal.slot === e.slot && chave(x) !== k; })
             .map(function (x) { return String(x.id); });
  }
  function infoHolder(cs, portico) { return arr(cs).filter(function (x) { return x && x.porticoInfo && String(x.portico) === String(portico); })[0] || null; }
  /* a edição de UMA peça vira a de todas as do mesmo lugar no tipo — um lote só (um Ctrl+Z).
     editar(caixa, mud) → { caixa } | { erro } (MetalCriar.editar); as ops: metalAjustar de cada peça + o metalElemento que
     guarda a edição (mud) nas peças e o registro na auditoria */
  function propagar(caixas, id, mud, editar, quando) {
    var cs = arr(caixas), P = porId(cs), c = P[idDe(id)];
    if (!c || !c.elemMetal || typeof editar !== "function") return { ops: [], ids: [], erros: [] };
    var campos = Object.keys(mud || {}).filter(function (k) { return CAMPOS_TIPO[k]; });
    var outros = c.elemMetal.anexo ? [] : correspondentes(cs, id), ops = [], ids = [String(c.id)], erros = [];
    var mudT = {}; campos.forEach(function (k) { mudT[k] = mud[k]; });
    var r0 = editar(c, mud); if (!r0 || r0.erro) return { ops: [], ids: [], erros: [r0 ? r0.erro : "falhou"] };
    ops.push({ op: "metalAjustar", id: String(c.id), caixa: r0.caixa });
    if (campos.length) outros.forEach(function (oid) {
      var r = editar(P[oid], mudT); if (!r || r.erro) { erros.push(oid + ": " + (r ? r.erro : "falhou")); return; }
      ops.push({ op: "metalAjustar", id: oid, caixa: r.caixa }); ids.push(oid);
    });
    var log = null;
    if (campos.length && !c.elemMetal.anexo) {
      var de = {}; campos.forEach(function (k) { de[k] = k === "cat" ? (c.metal && c.metal.perfil && c.metal.perfil.cat) || null : k === "aco" ? (c.metal && c.metal.aco) || null : null; });
      log = { em: quando || new Date().toISOString(), acao: "editar-tipo", tipo: c.elemMetal.tipo, slot: c.elemMetal.slot, campos: mudT, de: de, n: ids.length };
      ops.push({ op: "metalElemento", ids: ids.slice(), mud: mudT, portico: String(c.portico), log: log });
    }
    return { ops: ops, ids: ids, erros: erros, log: log, tipo: c.elemMetal.tipo };
  }
  function proximoTipo(cs, portico, tipo) {
    var pre = String(tipo || "EL-1").split("-")[0], max = 0;
    arr(cs).forEach(function (x) {
      if (!x || !x.elemMetal || String(x.portico) !== String(portico)) return;
      [x.elemMetal.tipo, x.elemMetal.tipoBase].forEach(function (t) { var m = /^([A-Z]+)-(\d+)$/.exec(String(t || "")); if (m && m[1] === pre) max = Math.max(max, +m[2]); });
    });
    return pre + "-" + (max + 1);
  }
  /* SEPARAR ESTE: o elemento da peça ganha um tipo novo (as edições dele daí em diante são só dele) */
  function separar(caixas, id, quando) {
    var cs = arr(caixas), e = elemento(cs, id); if (!e) return { ok: false, motivo: "Esta peça não faz parte de um elemento do pórtico." };
    var iguais = doTipo(cs, e.portico, e.tipo).length;
    if (iguais < 2) return { ok: false, motivo: e.rot + " " + e.tipo + " já é o único do tipo." };
    var novo = proximoTipo(cs, e.portico, e.tipo);
    /* as edições que o tipo antigo tinha seguem valendo para o elemento separado (ele nasce igual, só passa a ser outro tipo) */
    var log = { em: quando || new Date().toISOString(), acao: "separar", tipo: e.tipo, para: novo, el: e.el, n: e.n };
    return { ok: true, tipo: novo, de: e.tipo, op: { op: "metalElemento", ids: e.pecas.slice(), tipo: novo, portico: e.portico, log: log } };
  }
  function painel(caixas, id) {
    var cs = arr(caixas), e = elemento(cs, id); if (!e) return null;
    var n = doTipo(cs, e.portico, e.tipo).length;
    return { tipo: e.tipo, rot: e.rot, n: n, el: e.el, pecas: e.n, texto: "Editando tipo " + e.tipo + " (" + n + (n === 1 ? " elemento" : " iguais") + ")", proximo: n > 1 ? proximoTipo(cs, e.portico, e.tipo) : null };
  }
  /* as edições do pórtico, para o gerador reaplicar ao refazer no lugar */
  function edicoesDe(caixas, portico) {
    var cs = arr(caixas), tipos = {}, mud = [], vis = {};
    cs.forEach(function (c) {
      if (!c || !c.elemMetal || String(c.portico) !== String(portico) || c.elemMetal.anexo) return;
      var e = c.elemMetal;
      if (e.tipo && e.tipoBase && e.tipo !== e.tipoBase) tipos[e.el] = e.tipo;
      if (e.mud) Object.keys(e.mud).forEach(function (k) { var kk = e.tipo + "|" + e.slot + "|" + k; if (vis[kk]) return; vis[kk] = 1; mud.push({ tipo: e.tipo, slot: e.slot, campo: k, valor: e.mud[k] }); });
    });
    var h = infoHolder(cs, portico);
    return { tipos: tipos, mud: mud, log: h && h.porticoInfo && arr(h.porticoInfo.elemLog).slice() };
  }

  /* ================================================================ OP DO REPLAY */
  var extensao = {
    nome: "metalElemento",
    valida: function (o) {
      if (!o || o.op !== "metalElemento") return undefined;
      if (!Array.isArray(o.ids) || !o.ids.length) return false;
      if (o.tipo != null && !/^[A-Z]{1,3}-\d{1,4}$/.test(String(o.tipo))) return false;
      if (o.mud != null && (typeof o.mud !== "object" || Object.keys(o.mud).some(function (k) { return !CAMPOS_TIPO[k]; }))) return false;
      return o.tipo != null || o.mud != null;
    },
    aplicar: function (o, ctx) {
      if (!o || o.op !== "metalElemento" || !ctx) return false;
      var feitas = 0;
      o.ids.forEach(function (id) {
        var c = ctx.caixas[String(id)]; if (!c || !c.elemMetal) return;
        var e = clone(c.elemMetal);
        if (o.tipo != null) e.tipo = String(o.tipo);
        if (o.mud) { e.mud = e.mud || {}; Object.keys(o.mud).forEach(function (k) { e.mud[k] = o.mud[k]; }); }
        c.elemMetal = e; feitas++;
      });
      if (feitas && o.log && o.portico != null) {
        var h = null; Object.keys(ctx.caixas).forEach(function (k) { var x = ctx.caixas[k]; if (!h && x && x.porticoInfo && String(x.portico) === String(o.portico)) h = x; });
        if (h) { var pi = clone(h.porticoInfo); pi.elemLog = arr(pi.elemLog).concat([clone(o.log)]).slice(-300); h.porticoInfo = pi; }
      }
      return feitas > 0;
    }
  };
  var BE = dep("BimEdit", "./bimedit.js"); if (BE && BE.estender) BE.estender(extensao);

  var MetalElemento = {
    CAT: CAT, CAMPOS_TIPO: CAMPOS_TIPO, chaveQuadro: chaveQuadro, marcar: marcar, edicaoDaBarra: edicaoDaBarra,
    idDe: idDe, chave: chave, elemento: elemento, doTipo: doTipo, expandir: expandir, tab: tab, correspondentes: correspondentes,
    propagar: propagar, separar: separar, painel: painel, edicoesDe: edicoesDe, proximoTipo: proximoTipo, extensao: extensao
  };
  global.MetalElemento = MetalElemento;
  if (typeof module !== "undefined" && module.exports) module.exports = MetalElemento;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
