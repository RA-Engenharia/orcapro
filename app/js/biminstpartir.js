/* =====================================================================
 * biminstpartir.js — PARTIR O TUBO NAS CONEXÕES (15/11/2026) — motor PURO (ES5, Node-testável): devolve as ops; não grava nada.
 *
 * PEDIDO (Rogério, 15/11/2026): quando há um tubo (ex.: vertical) e se coloca sobre ele uma conexão (tê, registro, luva, junção, joelho
 * no meio) ou se liga um ramal num ponto do meio dele, o tubo tem de ficar PARTIDO naquele ponto: dois trechos, um de cada lado da peça,
 * recuados até as bocas dela. Antes o tubo seguia INTEIRO "atravessando" a peça — e selecionar/apagar do registro para cima pegava o
 * tubo todo até embaixo.
 *
 * O QUE ACHA (achar):
 *  (a) PONTA DE OUTRO TRECHO do mesmo sistema encostada no INTERIOR do tubo (o ramal ligado no meio): corta no ponto;
 *  (b) CONECTORES de uma peça em linha (família de tê, registro, luva, união importada) no eixo do tubo: com 2 ou mais conectores no mesmo
 *      tubo, o trecho entre o primeiro e o último é o CORPO da peça (sai do tubo); com 1, corta no ponto.
 *  O registro posto pela colocação já nasce partido (biminst.aplicarAcessorio) e a conexão do biminstcolocar já divide o trecho: ali as
 *  pontas já estão nas bocas, não há interior — por isso rodar de novo não acha nada (IDEMPOTENTE).
 *
 * O QUE DEVOLVE (ops): cada tubo cortado vira N trechos {op:'trecho'}: o primeiro mantém o id; os outros, id novo livre. Herdam material,
 * DN, sistema, classe/PN, emenda, aplicação, isolamento, passantes… (a inclinação é a mesma, porque os pontos estão no eixo). "continua" /
 * pecaIni / juntaIni ficam só na ponta de ORIGEM; "continua" / pecaFim / juntaFim só na ponta de FIM. O comprimento total do tubo por DN
 * não muda (só some o corpo da peça, quando há); a lista de material continua contando tubo, sem luva a mais.
 *
 * PARÂMETRO "Partir o tubo nas conexões" (padrão LIGADO), gravado no modelo pela op {op:'instOpcao', id:'partirNasConexoes', valor:bool}
 * (biminst.js guarda em estado.instalacoes.opcoes). Desligado: nada parte sozinho; o comando manual (aplicar com forcar) segue valendo.
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function BI() { return dep("BimInst", "./biminst.js"); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { var n = Number(v); return isFinite(n) ? n : d; }
  function r4(v) { return Math.round(v * 10000) / 10000; }   // hid:ok 4 casas do biminst
  var MIN_PEDACO = 0.005;   // hid:ok o biminst recusa trecho menor que 5 mm (normTrecho)
  var HERDA = ["emenda", "excentrica", "isolamento", "aparente", "comentarios", "nome", "faseCriada", "faseDemolida", "passantes", "aplicacao"];
  var GRUPOS_FORA = { eletrica: 1, ar: 1 };   /* eletroduto e duto de ar: sem peça em linha no sentido do tubo */

  function opcaoLigada(estado) {
    var o = estado && estado.instalacoes && estado.instalacoes.opcoes;
    return !(o && o.partirNasConexoes === false);
  }
  function opOpcao(ligada) { return { op: "instOpcao", id: "partirNasConexoes", valor: !!ligada }; }

  function idsUsados(estado) {
    var u = {}, ins = (estado && estado.instalacoes) || {};
    arr(ins.trechos).concat(arr(ins.pecas), arr(ins.acessorios)).forEach(function (x) { if (x && x.id != null) u[String(x.id)] = 1; if (x && x.novoId != null) u[String(x.novoId)] = 1; });
    arr(estado && estado.familias).forEach(function (f) { if (f && f.id != null) u[String(f.id)] = 1; });
    arr(estado && estado.caixas).forEach(function (f) { if (f && f.id != null) u[String(f.id)] = 1; });
    return u;
  }
  function idNovo(base, usados) {
    for (var i = 0; i < 1000; i++) { var id = base + (i === 0 ? "b" : "b" + (i + 1)); if (!usados[id]) { usados[id] = 1; return id; } }
    return base + "x" + Date.now();
  }

  /* eixo do trecho: origem, direção unitária, comprimento */
  function eixo(t) {
    var dx = t.p2.x - t.p1.x, dy = t.p2.y - t.p1.y, dz = t.p2.z - t.p1.z, L = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return L > 0 ? { o: t.p1, u: { x: dx / L, y: dy / L, z: dz / L }, L: L } : null;
  }
  /* projeção de q no eixo: { s, d } (s = distância desde p1; d = distância do ponto ao eixo) */
  function projetar(E, q) {
    var wx = q.x - E.o.x, wy = q.y - E.o.y, wz = q.z - E.o.z, s = wx * E.u.x + wy * E.u.y + wz * E.u.z;
    var px = E.o.x + E.u.x * s, py = E.o.y + E.u.y * s, pz = E.o.z + E.u.z * s;
    return { s: s, d: Math.sqrt((q.x - px) * (q.x - px) + (q.y - py) * (q.y - py) + (q.z - pz) * (q.z - pz)) };
  }
  function ponto(E, s) { return { x: r4(E.o.x + E.u.x * s), y: r4(E.o.y + E.u.y * s), z: r4(E.o.z + E.u.z * s) }; }

  /* tubo que pode ser partido: rígido, de seção redonda, fora de eletroduto/duto */
  function partivel(I, t) {
    var M = I.MATERIAIS[t.material], S = I.SISTEMAS[t.sistema];
    return !!(M && S && !M.secao && !M.flexivel && !GRUPOS_FORA[S.grupo]);
  }

  /* ACHAR: { cortes: { idTrecho: [{ sa, sb, de: "ramal"|"peca", ref }] }, n } — cortes ordenados e fundidos */
  function achar(estado, avaliarFam) {
    var I = BI(), ins = (estado && estado.instalacoes) || {}, trechos = arr(ins.trechos), cortes = {}, tol = I ? I.TOL : 0.02;
    if (!I || !trechos.length) return { cortes: {}, n: 0 };
    var E = {};
    trechos.forEach(function (t) { if (t && t.p1 && t.p2 && partivel(I, t)) { var e = eixo(t); if (e) E[t.id] = { t: t, e: e }; } });
    function marca(id, c) { (cortes[id] = cortes[id] || []).push(c); }
    /* (a) ponta de outro trecho encostada no interior */
    trechos.forEach(function (u) {
      if (!u || !u.p1 || !u.p2) return;
      Object.keys(E).forEach(function (id) {
        var d = E[id]; if (d.t.id === u.id || d.t.sistema !== u.sistema) return;
        ["p1", "p2"].forEach(function (k) {
          var pr = projetar(d.e, u[k]);
          if (pr.d <= tol && pr.s > tol && pr.s < d.e.L - tol) marca(id, { sa: pr.s, sb: pr.s, de: "ramal", ref: u.id });
        });
      });
    });
    /* (b) conectores de peça em linha */
    var porFam = {};
    if (typeof avaliarFam === "function") {
      I.conectoresDoEstado(estado, avaliarFam).forEach(function (k) { if (k && k.famInst != null) (porFam[k.famInst] = porFam[k.famInst] || []).push(k); });
    }
    Object.keys(porFam).forEach(function (fi) {
      Object.keys(E).forEach(function (id) {
        var d = E[id], dentro = [];
        porFam[fi].forEach(function (k) {
          if (k.sistema !== d.t.sistema) return;
          var pr = projetar(d.e, k);
          if (pr.d <= I.TOL_CONECTOR && pr.s > tol && pr.s < d.e.L - tol) dentro.push(pr.s);
        });
        if (!dentro.length) return;
        dentro.sort(function (a, b) { return a - b; });
        marca(id, { sa: dentro[0], sb: dentro[dentro.length - 1], de: "peca", ref: fi });
      });
    });
    /* funde cortes que se tocam (a peça e o ramal no mesmo lugar) */
    var n = 0;
    Object.keys(cortes).forEach(function (id) {
      var L = E[id].e.L, l = cortes[id].sort(function (a, b) { return a.sa - b.sa; }), out = [];
      l.forEach(function (c) {
        var u = out[out.length - 1];
        if (u && c.sa <= u.sb + tol) { if (c.sb > u.sb) u.sb = c.sb; if (c.de === "peca") u.de = "peca"; }
        else out.push({ sa: c.sa, sb: c.sb, de: c.de, ref: c.ref });
      });
      /* corte que sobra pedaço menor que o mínimo do motor nas pontas: não corta */
      out = out.filter(function (c) { return c.sa >= MIN_PEDACO && L - c.sb >= MIN_PEDACO; });
      if (out.length) { cortes[id] = out; n += out.length; } else delete cortes[id];
    });
    return { cortes: cortes, E: E, n: n };
  }

  /* o trecho `t` cortado em pedaços: a lista de ops {op:'trecho'} */
  function opsDoCorte(I, t, e, lista, usados) {
    var s0 = [0], s1 = [];
    lista.forEach(function (c) { s1.push(c.sa); s0.push(c.sb); });
    s1.push(e.L);
    var ops = [];
    for (var i = 0; i < s0.length; i++) {
      if (s1[i] - s0[i] < MIN_PEDACO) continue;
      var o = I.opDoTrecho(t);
      HERDA.forEach(function (k) { if (t[k] !== undefined && t[k] !== null && t[k] !== "") o[k] = JSON.parse(JSON.stringify(t[k])); });
      if (t.aplicacaoAuto) delete o.aplicacao;
      delete o.continua; delete o.pecaIni; delete o.pecaFim;
      var primeiro = i === 0, ultimo = i === s0.length - 1;
      o.id = ops.length ? idNovo(t.id, usados) : t.id;
      o.p1 = i === 0 ? { x: t.p1.x, y: t.p1.y, z: t.p1.z } : ponto(e, s0[i]);
      o.p2 = ultimo ? { x: t.p2.x, y: t.p2.y, z: t.p2.z } : ponto(e, s1[i]);
      if (primeiro && (t.continua === "p1" || t.continua === "ambos")) o.continua = "p1";
      if (ultimo && (t.continua === "p2" || t.continua === "ambos")) o.continua = o.continua ? "ambos" : "p2";
      if (primeiro && t.pecaIni) o.pecaIni = t.pecaIni;
      if (ultimo && t.pecaFim) o.pecaFim = t.pecaFim;
      if (!primeiro) delete o.juntaIni;
      if (!ultimo) delete o.juntaFim;
      ops.push(o);
    }
    return ops;
  }

  /* OPS: o lote que parte os tubos (ou { ok:true, ops:[], n:0 } quando não há o que partir). `cfg.forcar` ignora o parâmetro (o comando manual). */
  function ops(estado, avaliarFam, cfg) {
    cfg = cfg || {};
    var I = BI();
    if (!I) return { ok: false, erro: "O motor das instalações não está carregado.", ops: [], n: 0, pedacos: 0 };
    if (!cfg.forcar && !opcaoLigada(estado)) return { ok: true, ops: [], n: 0, pedacos: 0, desligado: true };
    var A = achar(estado, avaliarFam), usados = idsUsados(estado), out = [], n = 0, mudados = [];
    Object.keys(A.cortes).forEach(function (id) {
      var d = A.E[id], novos = opsDoCorte(I, d.t, d.e, A.cortes[id], usados);
      if (novos.length < 2) return;
      novos.forEach(function (o) { out.push(o); });
      n++; mudados.push(id);
    });
    return { ok: true, ops: out, n: n, pedacos: out.length, trechos: mudados };
  }

  /* o lote UM SÓ (Ctrl+Z desfaz tudo): a op agrupada, ou null quando não há o que partir */
  function lote(estado, avaliarFam, cfg) {
    var r = ops(estado, avaliarFam, cfg);
    if (!r.ok || !r.ops.length) return null;
    return { op: "lote", id: "partir-" + Date.now(), ops: r.ops };
  }

  global.BimInstPartir = { ops: ops, lote: lote, achar: achar, opcaoLigada: opcaoLigada, opOpcao: opOpcao, MIN_PEDACO: MIN_PEDACO };
  if (typeof module !== "undefined" && module.exports) module.exports = global.BimInstPartir;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
