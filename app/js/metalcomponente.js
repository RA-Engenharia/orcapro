/* =====================================================================
 * metalcomponente.js — a PEÇA PARAMÉTRICA COMO UM COMPONENTE SÓ (motor
 * PURO, ES5, sem DOM, Node-testável). Frente M5 (fase 2 da S10), 14/10/2026.
 *
 * Pedido do Rogério: "a peça paramétrica tem que ser UM COMPONENTE: o clique
 * seleciona tudo, o duplo clique edita, alças para esticar e tudo se refaz,
 * fixação automática na estrutura (parafuso ou solda por montante)".
 *
 * O QUE ESTE MOTOR DECIDE (a tela é o js/metalcomponenteui.js):
 *   · SELEÇÃO: o clique numa peça de uma peça pronta (caixa.pronta) devolve
 *     TODAS as peças dela; o Tab "entra" na peça clicada (e o Tab de novo
 *     passa para a próxima peça do componente); Shift+Tab volta ao todo;
 *   · ALÇAS: por tipo, a grandeza que cada alça estica (comprimento, largura,
 *     altura) no referencial do componente — ponto e direção no mundo;
 *   · ESTICAR: o valor novo da alça → o par novo (arredondado a 1 cm, dentro
 *     do que o tipo aceita). Quem refaz é o gerador de sempre (o montante é
 *     redistribuído pelo espaçamento máximo: ceil(L/espac) vãos iguais) e a
 *     tela manda apagar + criar num lote só (um Ctrl+Z);
 *   · FIXAÇÃO POR MONTANTE: o apoio embaixo de cada montante → s (SOLDADO no
 *     aço: viga ou piso de aço), c (CHAPA de base CHUMBADA no concreto, com
 *     os chumbadores dimensionados) ou n (sem apoio: CRÍTICO, nunca
 *     "aprovado").
 *
 * API
 *   MetalComponente.grupo(caixas, idPeca)          { id, tipo, pecas, info } | null
 *   MetalComponente.expandir(caixas, uid, st)      { uids, st }
 *   MetalComponente.tab(caixas, st, shift)         { uids, st, texto } | null
 *   MetalComponente.inteiro(caixas, uids)          o id da peça pronta quando a seleção é ela inteira
 *   MetalComponente.ALCAS                          { tipo: [{ k, campo, rotulo, min, max }] }
 *   MetalComponente.alcas(tipo, par, caixa)        [{ k, campo, rotulo, valor, p, dir, min, max }] (mundo)
 *   MetalComponente.esticar(tipo, par, k, valor)   { ok, par, valor, texto } | { ok:false, motivo }
 *   MetalComponente.fixacaoPorMontante(posts, els, elementoEm, op)  { codigos, texto, concreto, n }
 *   MetalComponente.espacamentoGuarda(r)           { max, espac, ok } (os vãos entre montantes do resultado)
 * Teste: node tools/test-metal-componente.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function MP() { return dep("MetalProntas", "./metalprontas.js"); }
  function MA() { return dep("MetalAcessos", "./metalacessos.js"); }
  function MG() { return dep("MetalGuardas", "./metalguardas.js"); }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function r2(v) { return Math.round(v * 100) / 100; }
  function r4(v) { return Math.round(v * 1e4) / 1e4; }
  function br(v, c) { c = c == null ? 2 : c; return (Math.round(num(v, 0) * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }

  /* ------------------------------------------------ SELEÇÃO */
  function grupo(caixas, idPeca) {
    var M = MP(); if (!M) return null;
    var c = arr(caixas).filter(function (x) { return x && String(x.id) === String(idPeca); })[0];
    if (!c || !c.pronta) return null;
    var g = M.prontas(caixas).filter(function (p) { return p.id === String(c.pronta); })[0];
    return g ? { id: g.id, tipo: g.tipo, pecas: g.pecas.slice(), info: g.info, n: g.n } : null;
  }
  function idDe(uid) { var s = String(uid == null ? "" : uid); return /^edit:/.test(s) ? s.slice(5) : null; }
  /* o clique numa peça: o componente inteiro (ou só a peça, quando o Tab já "entrou" neste componente) */
  function expandir(caixas, uid, st) {
    var id = idDe(uid); if (!id) return { uids: [uid], st: null };
    var g = grupo(caixas, id); if (!g || g.n < 2) return { uids: [uid], st: null };
    if (st && st.dentro && st.pronta === g.id) return { uids: [uid], st: { pronta: g.id, tipo: g.tipo, peca: uid, dentro: true } };
    return { uids: g.pecas.map(function (p) { return "edit:" + p; }), st: { pronta: g.id, tipo: g.tipo, peca: uid, dentro: false } };
  }
  function nomeDa(caixas, uid) { var id = idDe(uid), c = arr(caixas).filter(function (x) { return x && String(x.id) === id; })[0]; return c && c.metal ? (c.metal.papel || "peça") : "peça"; }
  function tab(caixas, st, shift) {
    if (!st || !st.pronta) return null;
    var M = MP(), g = M ? M.prontas(caixas).filter(function (p) { return p.id === st.pronta; })[0] : null; if (!g) return null;
    var todas = g.pecas.map(function (p) { return "edit:" + p; }), s2 = clone(st);
    if (shift) { s2.dentro = false; return { uids: todas, st: s2, texto: "Componente inteiro (" + todas.length + " peças). Tab entra na peça." }; }
    if (!st.dentro) { s2.dentro = true; if (todas.indexOf(s2.peca) < 0) s2.peca = todas[0]; }
    else { var i = todas.indexOf(st.peca); s2.peca = todas[(i + 1 + todas.length) % todas.length]; }
    return { uids: [s2.peca], st: s2, texto: "Peça do componente: " + nomeDa(caixas, s2.peca) + " (" + (todas.indexOf(s2.peca) + 1) + " de " + todas.length + "). Tab passa para a próxima; Shift+Tab volta ao componente inteiro." };
  }
  function inteiro(caixas, uids) {
    var ids = arr(uids).map(idDe).filter(Boolean); if (ids.length < 2) return null;
    var g = grupo(caixas, ids[0]); if (!g) return null;
    var s = {}; ids.forEach(function (i) { s[i] = 1; });
    return g.pecas.length === ids.length && g.pecas.every(function (p) { return s[p]; }) ? g.id : null;
  }

  /* ------------------------------------------------ ALÇAS
   * k: "u" (ao longo do componente), "w" (de lado), "y" (para cima); campo: o parâmetro que a alça muda */
  var ALCAS = {
    guardacorpo: [{ k: "u", campo: "comprimento", rotulo: "Comprimento", min: 0.3, max: 100 }, { k: "y", campo: "alturaGuarda", rotulo: "Altura do guarda-corpo", min: 0.6, max: 1.6 }],
    passarela: [{ k: "u", campo: "comprimento", rotulo: "Comprimento", min: 1, max: 60 }],
    corrimaoparede: [{ k: "u", campo: "comprimento", rotulo: "Comprimento", min: 0.3, max: 60 }],
    plataforma: [{ k: "u", campo: "Lx", rotulo: "Comprimento", min: 1, max: 60 }, { k: "w", campo: "Lz", rotulo: "Largura", min: 1, max: 60 }],
    piso: [{ k: "u", campo: "Lx", rotulo: "Comprimento", min: 0.3, max: 60 }, { k: "w", campo: "Lz", rotulo: "Largura", min: 0.3, max: 60 }],
    escada: [{ k: "y", campo: "desnivel", rotulo: "Desnível (altura)", min: 0.5, max: 8 }],
    rampa: [{ k: "y", campo: "desnivel", rotulo: "Desnível (altura)", min: 0.1, max: 6 }],
    marinheiro: [{ k: "y", campo: "altura", rotulo: "Altura", min: 1, max: 30 }],
    helicoidal: [{ k: "y", campo: "altura", rotulo: "Altura", min: 1, max: 30 }]
  };
  /* caixa = { mn: [x,y,z], mx: [x,y,z] } das peças do componente no mundo (a tela mede; o teste também) */
  function alcas(tipo, par, caixa) {
    var M = MP(), defs = ALCAS[tipo]; if (!M || !defs) return [];
    var p = M.normalizar(tipo, par), H = M.ajudantes(), F = H.quadroLocal([p.x0, p.y0, p.z0], p.giro), out = [];
    var top = caixa && caixa.mx ? caixa.mx[1] : null, cx = caixa && caixa.mn ? [(caixa.mn[0] + caixa.mx[0]) / 2, (caixa.mn[2] + caixa.mx[2]) / 2] : null;
    defs.forEach(function (d) {
      var a = { k: d.k, campo: d.campo, rotulo: d.rotulo, min: d.min, max: d.max, valor: num(p[d.campo], 0), p: null, dir: null };
      if (tipo === "guardacorpo") {
        if (p.soCorrimao && d.k === "y") return;
        var cm = MA() ? MA().lerCaminho(p.caminho) : [];
        if (cm.length >= 2) {
          var q1 = cm[cm.length - 1], q0 = cm[cm.length - 2], dl = H.unit([q1[0] - q0[0], 0, q1[1] - q0[1]]) || [1, 0, 0];
          if (d.k === "u") { a.campo = "caminho"; a.valor = r4(Math.hypot(q1[0] - q0[0], q1[1] - q0[1])); a.rotulo = "Comprimento do último trecho"; a.p = H.add(F.O, [q1[0], 0, q1[1]]); a.dir = dl; }
          else { var qm = cm[0]; a.p = H.add(F.O, [qm[0], p.alturaGuarda, qm[1]]); a.dir = [0, 1, 0]; }
        } else if (d.k === "u") { a.p = F.W([p.comprimento + (num(p.retornoFim, 0) > 0.05 ? 0 : 0), 0, 0]); a.dir = F.D([1, 0, 0]); }
        else { a.p = F.W([p.comprimento / 2, p.alturaGuarda, 0]); a.dir = [0, 1, 0]; }
      } else if (tipo === "passarela") { a.p = F.W([p.comprimento, p.altura, p.largura / 2]); a.dir = F.D([1, 0, 0]); }
      else if (tipo === "corrimaoparede") { a.p = F.W([p.comprimento, p.alturaSup, 0]); a.dir = F.D([1, 0, 0]); }
      else if (tipo === "plataforma" || tipo === "piso") {
        var hy = tipo === "plataforma" ? p.altura : 0;
        if (d.k === "u") { a.p = F.W([p.Lx, hy, p.Lz / 2]); a.dir = F.D([1, 0, 0]); } else { a.p = F.W([p.Lx / 2, hy, p.Lz]); a.dir = F.D([0, 0, 1]); }
        if (tipo === "piso" && String(p.contorno || "").trim()) return;   /* contorno livre: sem alça (o contorno manda) */
      } else {
        /* as alças de ALTURA da escada/rampa/marinheiro: no topo do componente, no meio da planta */
        a.p = top != null && cx ? [cx[0], top, cx[1]] : F.W([0, a.valor, 0]); a.dir = [0, 1, 0];
      }
      a.p = a.p.map(r4); a.dir = a.dir.map(r4);
      out.push(a);
    });
    return out;
  }
  function esticar(tipo, par, k, valor) {
    var M = MP(), defs = ALCAS[tipo]; if (!M || !defs) return { ok: false, motivo: "Esta peça não tem alça." };
    var d = defs.filter(function (x) { return x.k === k; })[0]; if (!d) return { ok: false, motivo: "Alça desconhecida: " + k + "." };
    var v = Math.round(num(valor, NaN) * 100) / 100; if (!isFinite(v)) return { ok: false, motivo: "Valor inválido." };
    var q = clone(par), campo = d.campo, vMin = d.min, vMax = d.max;
    if (tipo === "guardacorpo" && k === "u" && MA()) {
      var cm = MA().lerCaminho(q.caminho);
      if (cm.length >= 2) {
        var q1 = cm[cm.length - 1], q0 = cm[cm.length - 2], L = Math.hypot(q1[0] - q0[0], q1[1] - q0[1]), ux = (q1[0] - q0[0]) / L, uz = (q1[1] - q0[1]) / L;
        v = Math.max(0.3, Math.min(100, v));
        cm[cm.length - 1] = [r4(q0[0] + ux * v), r4(q0[1] + uz * v)];
        q.caminho = MA().textoCaminho(cm); campo = "caminho";
      } else { v = Math.max(vMin, Math.min(vMax, v)); q.comprimento = v; }
    } else { v = Math.max(vMin, Math.min(vMax, v)); q[campo] = v; }
    var e = M.validar(tipo, q); if (e) return { ok: false, motivo: e, par: q, valor: v };
    return { ok: true, par: q, valor: v, campo: campo, texto: d.rotulo + ": " + br(v) + " m" };
  }

  /* ------------------------------------------------ FIXAÇÃO POR MONTANTE
   * posts: os montantes no mundo; els: o que há no modelo (js/metalescadalinha.js elementos, SEM as peças deste
   * componente); elementoEm: a busca do mesmo motor. Concreto → c; aço → s; nada → n. */
  function fixacaoPorMontante(posts, els, elementoEm, op) {
    op = op || {};
    var cod = [], conc = null, por = { s: 0, c: 0, n: 0 };
    arr(posts).forEach(function (P) {
      var el = elementoEm ? elementoEm(els, P[0], P[2], P[1], { tolH: num(op.tolH, 0.03), tolV: num(op.tolV, 0.06) }) : null;
      var f = !el ? "n" : (el.material === "concreto" ? "c" : "s");
      if (f === "c" && !conc) conc = { esp: el.esp, fck: el.fck, id: el.id };
      cod.push(f); por[f]++;
    });
    var partes = []; if (por.s) partes.push(por.s + " soldado(s) no aço"); if (por.c) partes.push(por.c + " chumbado(s) no concreto"); if (por.n) partes.push(por.n + " sem apoio");
    return { codigos: cod, texto: partes.join(", "), concreto: conc, n: cod.length, por: por };
  }
  /* o maior vão entre montantes vizinhos MEDIDO nas peças geradas (a base de cada "Montante do guarda-corpo", na ordem ao longo do
     caminho de cada parte — a abertura da cancela separa as partes e não é vão de montante). bases (opcional) = as bases já medidas
     (o controle negativo do teste tira um montante e confere que acusa) */
  function espacamentoGuarda(r, bases) {
    var M = MP(), BM = dep("BimMetal", "./metalpeca.js"); if (!M || !r || !r.ok || !r.medidas) return null;
    var p = r.par || {}, H = M.ajudantes(), F = H.quadroLocal([num(p.x0, 0), num(p.y0, 0), num(p.z0, 0)], num(p.giro, 0));
    var partes = (arr(r.medidas.partes).length ? r.medidas.partes : [r.medidas.caminho]).filter(function (pt) { return arr(pt).length >= 2; }).map(function (pt) { return pt.map(function (q) { return F.W(q); }); });
    if (!bases) { bases = []; Object.keys(r.finais || {}).forEach(function (k) { var c = r.finais[k]; if (!c || !c.metal || !/^Montante do guarda-corpo/.test(c.metal.papel || "")) return; var mb = BM && BM.membro ? BM.membro(c) : null; if (mb) bases.push(mb.P0); }); }
    function abscissa(P, pts) { var best = null, acc = 0; for (var i = 0; i + 1 < pts.length; i++) { var a = pts[i], d = H.sub(pts[i + 1], a), L2 = H.dot(d, d); if (L2 < 1e-12) continue; var t = Math.max(0, Math.min(1, H.dot(H.sub(P, a), d) / L2)), Q = H.add(a, H.mul(d, t)), dd = Math.hypot(P[0] - Q[0], P[2] - Q[2]); if (!best || dd < best.d) best = { d: dd, s: acc + t * Math.sqrt(L2) }; acc += Math.sqrt(L2); } return best; }
    var mx = 0, ls = [];
    partes.forEach(function (pt) {
      var noCaminho = bases.map(function (P) { var a = abscissa(P, pt); return a && a.d < 0.15 ? { P: P, s: a.s } : null; }).filter(Boolean).sort(function (a, b) { return a.s - b.s; });
      for (var i = 1; i < noCaminho.length; i++) { var dv = Math.hypot(noCaminho[i].P[0] - noCaminho[i - 1].P[0], noCaminho[i].P[2] - noCaminho[i - 1].P[2]); ls.push(r4(dv)); mx = Math.max(mx, dv); }
    });
    return { max: r4(mx), espac: num(p.espac, 1), ok: ls.length > 0 && mx <= num(p.espac, 1) + 1e-6, lista: ls, montantes: bases.length, bases: bases };
  }

  var MetalComponente = { grupo: grupo, expandir: expandir, tab: tab, inteiro: inteiro, ALCAS: ALCAS, alcas: alcas, esticar: esticar, fixacaoPorMontante: fixacaoPorMontante, espacamentoGuarda: espacamentoGuarda, idDe: idDe };
  global.MetalComponente = MetalComponente;
  if (typeof module !== "undefined" && module.exports) module.exports = MetalComponente;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
