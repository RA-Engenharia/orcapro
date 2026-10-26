/* =====================================================================
 * bimfluidez.js — A FLUIDEZ DO BIM (25/10/2026): o motor puro de três coisas que a tela usa para não refazer o que
 * não mudou e para fazer de antemão o que vai ser pedido.
 *
 * PEDIDO DO ROGÉRIO (24/10/2026): "estou na vista 3D, clico na vista planta baixa e ela já abre no mesmo instante. O que
 * precisa fazer para ser mais fluido e não ter problema com espaço de memória, cache etc.?"
 *
 * ⚠ ROTEIRO DO QUE A MEDIÇÃO MOSTROU (tools/medir-fluidez.js, Chrome com a placa de vídeo, 25/10/2026):
 *  - creche (4 IFCs, 7.486 malhas): a 2ª troca 3D → planta levava 146 ms, e o desenho não era refeito. O tempo ia em
 *    `BIM.pavimentos2d()` (39 ms CADA chamada: a caixa do modelo e a "edificação" sobre todas as malhas), chamado 3 a 8
 *    vezes por troca — `Bim2D.def()` → `niveis()` pergunta os pavimentos a cada vez;
 *  - projeto exemplo: a 1ª planta levava 1,1–1,5 s; depois de editar no 3D, a volta para a planta, 0,4–0,8 s (a planta
 *    escondida fica "suja" e era refeita na hora do clique).
 *
 * O QUE ESTE ARQUIVO DÁ:
 *  1. assinaturaCena(raiz, opts) — um resumo BARATO (uma passada de números, sem caixa nem vértice) de tudo o que muda a
 *     geometria da cena: cada grupo e cada malha (id, geometria, matriz, camada; com `vis`, também a visibilidade e o
 *     material). Igual = a cena é a mesma para quem só LÊ a geometria. ⚠ A geometria da família com nível de detalhe
 *     (userData.famLod) troca com a distância da câmera — entra a do nível 0, senão girar a câmera "mudaria a cena".
 *  2. Memo — guarda UM resultado e a assinatura com que ele foi calculado; assinatura diferente recalcula.
 *  3. Fila — as tarefas de segundo plano (refazer a vista escondida, desenhar de antemão): uma de cada vez, só com a
 *     pessoa PARADA (sem mouse/teclado há QUIETO_MS), nunca duas seguidas sem deixar a tela respirar. Relógio e
 *     agendador injetados: a política inteira roda em Node (tools/test-bim-fluidez.js).
 * ===================================================================== */
(function (global) {
  "use strict";

  /* ---------------------------------------------------------------- 1. assinatura */
  /* soma de mistura de 32 bits (duas, para colisão não passar despercebida): número a número, sem texto */
  function Hash() { this.a = 0x811c9dc5; this.b = 0x9e3779b9; this.n = 0; }
  var F64 = new Float64Array(1), U32 = new Uint32Array(F64.buffer);
  Hash.prototype.num = function (x) {
    var v = +x;
    if (v !== v) v = -1.2345e-300;   /* NaN tem bits variados: um valor fixo */
    F64[0] = v;
    this._u(U32[0]); this._u(U32[1]);
    return this;
  };
  Hash.prototype._u = function (u) {
    this.a = Math.imul(this.a ^ u, 0x01000193) >>> 0;
    this.b = (Math.imul(this.b + u, 0x85ebca6b) ^ (this.b >>> 13)) >>> 0;
    this.n++;
  };
  Hash.prototype.txt = function (s) { s = String(s == null ? "" : s); this.num(s.length); for (var i = 0; i < s.length; i++) this._u(s.charCodeAt(i)); return this; };
  Hash.prototype.valor = function () { return this.n + ":" + this.a.toString(36) + ":" + this.b.toString(36); };

  function idGeo(m) {
    var ud = m.userData || {}, g = ud.famLod && ud.famLod.length ? ud.famLod[0] : m.geometry;
    return g ? (g.id != null ? g.id : -2) : -1;
  }
  function matIds(h, m) {
    var mt = m.material;
    if (!mt) { h.num(-1); return; }
    if (mt.length != null && typeof mt !== "string") { h.num(mt.length); for (var i = 0; i < mt.length; i++) h.num(mt[i] && mt[i].id != null ? mt[i].id : -1); }
    else h.num(mt.id != null ? mt.id : -1);
  }
  function matriz(h, o) {
    var e = o && o.matrixWorld && o.matrixWorld.elements;
    if (e) { for (var i = 0; i < 16; i++) h.num(e[i]); return; }
    var p = o && o.position, q = o && o.quaternion, s = o && o.scale;
    h.num(p ? p.x : 0).num(p ? p.y : 0).num(p ? p.z : 0).num(q ? q.x : 0).num(q ? q.y : 0).num(q ? q.z : 0).num(q ? q.w : 1).num(s ? s.x : 1).num(s ? s.y : 1).num(s ? s.z : 1);
  }
  /* raiz = o modelRoot (grupos → malhas, o mesmo formato do cadaMalha do js/bim.js).
     opts.vis: a visibilidade (da malha, do grupo e da raiz) e os materiais entram — é o que a vista 2D enxerga.
     opts.extra: valores de fora da cena (versão do editor, caixa de corte...) — entram na ordem dada. */
  function assinaturaCena(raiz, opts) {
    opts = opts || {};
    var h = new Hash(), vis = !!opts.vis;
    if (!raiz) return "vazio";
    h.num(raiz.id != null ? raiz.id : -1); matriz(h, raiz); if (vis) h.num(raiz.visible === false ? 0 : 1);
    var gs = raiz.children || [];
    h.num(gs.length);
    for (var i = 0; i < gs.length; i++) {
      var g = gs[i]; if (!g) { h.num(-3); continue; }
      h.num(g.id != null ? g.id : -1); matriz(h, g);
      if (vis) h.num(g.visible === false ? 0 : 1);
      var ms = g.children || [];
      h.num(ms.length);
      for (var j = 0; j < ms.length; j++) {
        var m = ms[j]; if (!m) { h.num(-3); continue; }
        h.num(m.id != null ? m.id : -1).num(idGeo(m)).num(m.layers && m.layers.mask != null ? m.layers.mask : 1);
        /* da malha, só o que um movimento muda (posição, a diagonal e o giro em volta do eixo vertical): 8 dos 16 números
           — com 7 mil malhas a assinatura inteira fica em ~1 ms; o grupo (o modelo inteiro) entra com a matriz toda */
        var e = m.matrixWorld && m.matrixWorld.elements;
        if (e) h.num(e[0]).num(e[2]).num(e[5]).num(e[8]).num(e[10]).num(e[12]).num(e[13]).num(e[14]); else matriz(h, m);
        if (vis) { h.num(m.visible === false ? 0 : 1); matIds(h, m); }
      }
    }
    var ex = opts.extra || [];
    for (var k = 0; k < ex.length; k++) { var x = ex[k]; if (typeof x === "number") h.num(x); else h.txt(x == null ? "" : (typeof x === "string" ? x : JSON.stringify(x))); }
    return h.valor();
  }

  /* ---------------------------------------------------------------- 2. memória por assinatura */
  function Memo() { this.sig = null; this.val = undefined; this.acertos = 0; this.calculos = 0; }
  /* sig null = não dá para assinar agora: calcula sempre e não guarda (nunca devolve o velho às cegas) */
  Memo.prototype.obter = function (sig, calc) {
    if (sig != null && sig === this.sig) { this.acertos++; return this.val; }
    var v = calc(); this.calculos++;
    if (sig != null) { this.sig = sig; this.val = v; } else { this.sig = null; this.val = undefined; }
    return v;
  };
  Memo.prototype.esquecer = function () { this.sig = null; this.val = undefined; };

  /* ---------------------------------------------------------------- 3. fila de segundo plano */
  /* o: { agora(), agendar(fn, ms) → alça, cancelar(alça), ocupado() → bool, quietoMs, pausaMs, log(msg) }
     ⚠ UMA TAREFA POR VEZ, E SÓ COM A PESSOA PARADA. A tarefa é síncrona e pode levar meio segundo (o desenho da planta);
     se rodasse com a pessoa girando o 3D, a fluidez que ela ganha na troca de vista se perderia no giro. */
  function Fila(o) {
    o = o || {};
    this.o = o;
    /* ⚠ 1 s parado (25/10/2026): com 0,6 s o soak de 30 min teve UMA troca de 2,4 s — o clique caiu no meio de uma
       tarefa já começada (a tarefa não é interrompível). Mais espera = menos colisão; o pior caso só volta ao de antes
       (a vista refeita na hora do clique). */
    this.QUIETO_MS = o.quietoMs > 0 ? o.quietoMs : 1000;
    this.PAUSA_MS = o.pausaMs > 0 ? o.pausaMs : 150;
    this.tarefas = [];
    this.ultEntrada = -1e15;
    this._alca = null; this._seq = 0;
    this.feitas = 0; this.falhas = 0; this.ultMs = 0;
  }
  Fila.prototype.agora = function () { return this.o.agora ? this.o.agora() : Date.now(); };
  /* id repetido substitui (a tarefa mais nova é a que vale) e fica com a MAIOR prioridade das duas */
  Fila.prototype.pedir = function (id, fn, prio) {
    id = String(id); prio = +prio || 0;
    for (var i = 0; i < this.tarefas.length; i++) {
      if (this.tarefas[i].id === id) { this.tarefas[i].fn = fn; if (prio > this.tarefas[i].prio) this.tarefas[i].prio = prio; this._agendar(this._espera()); return false; }
    }
    this.tarefas.push({ id: id, fn: fn, prio: prio, ordem: ++this._seq });
    this._agendar(this._espera());
    return true;
  };
  Fila.prototype.tirar = function (id) { id = String(id); var n0 = this.tarefas.length; this.tarefas = this.tarefas.filter(function (t) { return t.id !== id; }); return n0 !== this.tarefas.length; };
  Fila.prototype.limpar = function () { this.tarefas = []; this._cancelar(); };
  Fila.prototype.tem = function (id) { id = String(id); return this.tarefas.some(function (t) { return t.id === id; }); };
  /* mouse, roda, teclado: a pessoa está mexendo — a fila espera ela parar */
  Fila.prototype.entrada = function () { this.ultEntrada = this.agora(); };
  Fila.prototype._espera = function () { var d = this.agora() - this.ultEntrada; return d >= this.QUIETO_MS ? this.PAUSA_MS : (this.QUIETO_MS - d); };
  Fila.prototype._cancelar = function () { if (this._alca != null && this.o.cancelar) { try { this.o.cancelar(this._alca); } catch (e) {} } this._alca = null; };
  Fila.prototype._agendar = function (ms) {
    if (this._alca != null || !this.tarefas.length || !this.o.agendar) return;
    var self = this;
    this._alca = this.o.agendar(function () { self._alca = null; self.passo(); }, Math.max(0, ms));
  };
  /* um passo: roda a tarefa de maior prioridade se a pessoa está parada; senão reagenda. Devolve o id rodado ou null. */
  Fila.prototype.passo = function () {
    if (!this.tarefas.length) return null;
    var esp = this.agora() - this.ultEntrada;
    var ocup = false; try { ocup = !!(this.o.ocupado && this.o.ocupado()); } catch (e) { ocup = false; }
    if (esp < this.QUIETO_MS || ocup) { this._agendar(ocup ? this.QUIETO_MS : this.QUIETO_MS - esp); return null; }
    this.tarefas.sort(function (a, b) { return (b.prio - a.prio) || (a.ordem - b.ordem); });
    var t = this.tarefas.shift(), t0 = this.agora();
    try { t.fn(); this.feitas++; } catch (e) { this.falhas++; try { if (this.o.log) this.o.log("tarefa de segundo plano falhou: " + t.id, e); } catch (x) {} }
    this.ultMs = this.agora() - t0;
    this._agendar(this.PAUSA_MS);
    return t.id;
  };

  /* ---------------------------------------------------------------- 4. tempos de troca (o vigia lê) */
  /* os últimos N tempos de troca de vista: mediana, maior e o último — o js/memvigia.js manda para o diag/ */
  function Tempos(n) { this.n = n > 0 ? n : 40; this.l = []; }
  Tempos.prototype.anotar = function (de, para, ms) { if (!(ms >= 0)) return; this.l.push({ de: String(de || ""), para: String(para || ""), ms: Math.round(ms) }); if (this.l.length > this.n) this.l.shift(); };
  Tempos.prototype.resumo = function () {
    if (!this.l.length) return null;
    var v = this.l.map(function (x) { return x.ms; }).sort(function (a, b) { return a - b; });
    var u = this.l[this.l.length - 1];
    return { n: v.length, mediana: v[Math.floor(v.length / 2)], maior: v[v.length - 1], ultimo: u.ms, ultimoPara: u.para };
  };

  /* cópia funda de dado simples (objeto, lista, número, texto): ⚠ não usa JSON — Infinity e NaN viravam null, e quem
     recebe a cópia de um valor guardado tem de ver o MESMO que veria no cálculo novo */
  function copia(o, prof) {
    prof = prof || 0;
    if (o == null || typeof o !== "object" || prof > 40) return o;
    if (Array.isArray(o)) { var a = new Array(o.length); for (var i = 0; i < o.length; i++) a[i] = copia(o[i], prof + 1); return a; }
    if (o.buffer && o.BYTES_PER_ELEMENT) return o.slice();
    var r = {}; for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) r[k] = copia(o[k], prof + 1);
    return r;
  }

  var BimFluidez = { Hash: Hash, assinaturaCena: assinaturaCena, Memo: Memo, Fila: Fila, Tempos: Tempos, copia: copia };
  global.BimFluidez = BimFluidez;
  if (typeof module !== "undefined" && module.exports) module.exports = BimFluidez;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
