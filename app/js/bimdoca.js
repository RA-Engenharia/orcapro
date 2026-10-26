/* =====================================================================
 * bimdoca.js — o MODELO dos painéis encaixáveis do BIM (motor puro).
 *
 * Pedido do Rogério (25/10/2026): "poder ARRASTAR qualquer aba/painel para
 * onde eu quiser, ou RECOLHER, para aproveitar o máximo na modelagem".
 *
 * Este arquivo só sabe de DADOS: onde cada painel está (zona, grupo de abas,
 * janela solta), quem está recolhido, os tamanhos, os layouts prontos, o que
 * salvar e como validar o que volta do disco. Não toca em DOM nem em
 * localStorage — quem desenha é js/bimdocaui.js, e a casca (js/bimshell.js)
 * só liga os dois. É o padrão da casa: motor puro + fiação fina.
 *
 *   PAINÉIS    props (Propriedades), nav (Navegador de projeto) e
 *              ferr (Ferramentas: a gaveta onde abrem Instalações, Famílias,
 *              Pranchas, Render… um de cada vez)
 *   ZONAS      esq, dir (empilham em coluna) · base, topo (empilham em linha)
 *   GRUPO      um ou mais painéis EM ABAS no mesmo lugar ({abas, ativa, tam})
 *   SOLTO      `flut[id] = {x, y, w, h}` — janela dentro do app
 *   RECOLHIDO  `rec[id]` — vira uma aba fina na borda; clicar abre POR CIMA
 *              do 3D sem empurrá-lo; "fixar" desfaz o recolhimento
 *
 * ⚠ Todo layout que vem de fora (disco corrompido, versão antiga, mão de
 *   gente) passa por `validar`: painel repetido, painel que sumiu, número
 *   fora do limite, zona que não existe. Layout ruim NUNCA trava a tela —
 *   vira o padrão e a causa fica à mão (`carregar` devolve a origem: salvo, corrompido…).
 *
 * ES5, sem framework.
 * ===================================================================== */
(function (global) {
  "use strict";

  var VERSAO = 1;
  var PAINEIS = ["props", "nav", "ferr"];
  var ZONAS = ["esq", "dir", "base", "topo"];
  var ROTULO = { props: "Propriedades", nav: "Navegador de projeto", ferr: "Ferramentas" };
  /* a casa natural de cada painel: para onde "encaixar de volta" leva quem nunca esteve em outra zona */
  var CASA = { props: "esq", nav: "esq", ferr: "dir" };
  /* tamanho (px) de cada zona: largura em esq/dir, altura em base/topo */
  var LIM = {
    esq: { min: 200, max: 700, pad: 268 }, dir: { min: 280, max: 900, pad: 320 },
    base: { min: 90, max: 520, pad: 200 }, topo: { min: 90, max: 520, pad: 180 }
  };
  var FLUT_PAD = { w: 360, h: 320 }, FLUT_MIN = { w: 220, h: 120 };
  var CHAVE = "orcapro:bim:layout:v1";

  function num(v, d) { if (v == null || v === "" || typeof v === "boolean") return d; v = +v; return isFinite(v) ? v : d; }
  function entre(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function conhecido(id) { return PAINEIS.indexOf(id) >= 0; }
  function vertical(z) { return z === "esq" || z === "dir"; }   /* grupos empilham em coluna */
  function clonar(L) { return JSON.parse(JSON.stringify(L)); }

  /* ------------------------------------------------------------ PADRÃO */
  function padrao() {
    return {
      v: VERSAO,
      zonas: {
        esq: [{ abas: ["props"], ativa: "props", tam: 62 }, { abas: ["nav"], ativa: "nav", tam: 38 }],
        dir: [{ abas: ["ferr"], ativa: "ferr", tam: 100 }],
        base: [], topo: []
      },
      tam: { esq: LIM.esq.pad, dir: LIM.dir.pad, base: LIM.base.pad, topo: LIM.topo.pad },
      flut: {}, rec: {}, ult: {},
      fita: { rec: false }
    };
  }

  /* ------------------------------------------------------- NORMALIZAR */
  function normalizarTam(grupos) {
    if (!grupos.length) return;
    var soma = 0, i;
    for (i = 0; i < grupos.length; i++) { grupos[i].tam = Math.max(5, num(grupos[i].tam, 100 / grupos.length)); soma += grupos[i].tam; }
    for (i = 0; i < grupos.length; i++) grupos[i].tam = Math.round(grupos[i].tam / soma * 1000) / 10;
  }

  /* validar(L): nunca lança; devolve um layout íntegro (cópia). */
  function validar(L) {
    var out = padrao(), vistos = {}, z, i, j;
    if (!L || typeof L !== "object") return out;
    out.zonas = { esq: [], dir: [], base: [], topo: [] };
    var zs = L.zonas && typeof L.zonas === "object" ? L.zonas : {};
    for (i = 0; i < ZONAS.length; i++) {
      z = ZONAS[i];
      var gs = Array.isArray(zs[z]) ? zs[z] : [];
      for (j = 0; j < gs.length; j++) {
        var g = gs[j], abas = [];
        if (!g || !Array.isArray(g.abas)) continue;
        g.abas.forEach(function (id) { if (conhecido(id) && !vistos[id]) { vistos[id] = 1; abas.push(id); } });
        if (!abas.length) continue;
        out.zonas[z].push({ abas: abas, ativa: abas.indexOf(g.ativa) >= 0 ? g.ativa : abas[0], tam: num(g.tam, 0) });
      }
    }
    out.flut = {};
    var fl = L.flut && typeof L.flut === "object" ? L.flut : {};
    PAINEIS.forEach(function (id) {
      var r = fl[id];
      if (!r || vistos[id] || !conhecido(id)) return;
      vistos[id] = 1;
      out.flut[id] = {
        x: Math.round(num(r.x, 80)), y: Math.round(num(r.y, 80)),
        w: Math.round(entre(num(r.w, FLUT_PAD.w), FLUT_MIN.w, 1400)), h: Math.round(entre(num(r.h, FLUT_PAD.h), FLUT_MIN.h, 1200))
      };
    });
    /* quem sumiu volta para a casa dele (um painel nunca se perde) */
    PAINEIS.forEach(function (id) {
      if (vistos[id]) return;
      var cz = CASA[id];
      out.zonas[cz].push({ abas: [id], ativa: id, tam: 0 });
    });
    ZONAS.forEach(function (zn) {
      var gl = out.zonas[zn];
      /* tamanho sem valor (grupo novo ou corrompido): divide em partes iguais */
      var sem = gl.filter(function (g) { return !(g.tam > 0); }).length;
      if (sem) gl.forEach(function (g) { if (!(g.tam > 0)) g.tam = 100 / gl.length; });
      normalizarTam(gl);
    });
    var t = L.tam && typeof L.tam === "object" ? L.tam : {};
    ZONAS.forEach(function (zn) { out.tam[zn] = Math.round(entre(num(t[zn], LIM[zn].pad), LIM[zn].min, LIM[zn].max)); });
    out.rec = {}; out.ult = {};
    var rc = L.rec && typeof L.rec === "object" ? L.rec : {};
    var ul = L.ult && typeof L.ult === "object" ? L.ult : {};
    PAINEIS.forEach(function (id) {
      if (rc[id] === true) out.rec[id] = true;
      if (ZONAS.indexOf(ul[id]) >= 0) out.ult[id] = ul[id];
    });
    out.fita = { rec: !!(L.fita && L.fita.rec === true) };
    return out;
  }

  /* ------------------------------------------------------------- ONDE */
  /* onde(L, id) → { zona, grupo, aba } | { flut: true } | null */
  function onde(L, id) {
    if (L.flut && L.flut[id]) return { flut: true };
    for (var i = 0; i < ZONAS.length; i++) {
      var gs = L.zonas[ZONAS[i]];
      for (var g = 0; g < gs.length; g++) { var a = gs[g].abas.indexOf(id); if (a >= 0) return { zona: ZONAS[i], grupo: g, aba: a }; }
    }
    return null;
  }

  /* tira o painel de onde estiver (zona ou janela solta); devolve { zona, grupo, grupoSumiu } */
  function tirar(L, id) {
    var p = onde(L, id), r = { zona: null, grupo: -1, grupoSumiu: false };
    if (!p) return r;
    if (p.flut) { delete L.flut[id]; return r; }
    var gl = L.zonas[p.zona], g = gl[p.grupo];
    r.zona = p.zona; r.grupo = p.grupo;
    g.abas.splice(p.aba, 1);
    if (!g.abas.length) { gl.splice(p.grupo, 1); r.grupoSumiu = true; normalizarTam(gl); }
    else if (g.ativa === id) g.ativa = g.abas[Math.min(p.aba, g.abas.length - 1)];
    return r;
  }

  /* ---------------------------------------------------------- ENCAIXAR */
  /* encaixar(L, id, zona, op) → novo layout
   *   op.aba = true e op.grupo = i  → entra em abas no grupo i (op.pos = posição da aba)
   *   senão                          → vira um grupo novo em op.indice (padrão: no fim)
   * Os índices de op são os de ANTES da retirada (o que a tela mediu): o ajuste
   * quando o próprio painel sai da mesma zona é feito aqui. */
  function encaixar(L0, id, zona, op) {
    if (!conhecido(id) || ZONAS.indexOf(zona) < 0) return L0;
    op = op || {};
    var L = clonar(L0);
    var r = tirar(L, id);
    delete L.rec[id];
    /* quem veio de janela solta já tem a última zona em `ult` */
    if (r.zona) L.ult[id] = r.zona;
    var gl = L.zonas[zona], idx;
    if (op.aba && typeof op.grupo === "number" && op.grupo >= 0) {
      var gi = op.grupo;
      /* soltar o painel (sozinho no grupo) em cima do próprio grupo: nada a mudar */
      if (r.zona === zona && r.grupoSumiu && r.grupo === gi) return L0;
      if (r.zona === zona && r.grupoSumiu && r.grupo < gi) gi--;
      if (gi >= 0 && gi < gl.length) {
        var g = gl[gi], pos = typeof op.pos === "number" ? entre(op.pos, 0, g.abas.length) : g.abas.length;
        g.abas.splice(pos, 0, id); g.ativa = id;
        return validar(L);
      }
    }
    idx = typeof op.indice === "number" ? op.indice : gl.length;
    if (r.zona === zona && r.grupoSumiu && r.grupo < idx) idx--;
    idx = entre(idx, 0, gl.length);
    var n = gl.length, fatia = 100 / (n + 1);
    gl.forEach(function (g2) { g2.tam = g2.tam * n / (n + 1); });
    gl.splice(idx, 0, { abas: [id], ativa: id, tam: fatia });
    return validar(L);
  }

  function flutuar(L0, id, rect) {
    if (!conhecido(id)) return L0;
    var L = clonar(L0), r = tirar(L, id);
    delete L.rec[id];
    if (r.zona) L.ult[id] = r.zona;
    rect = rect || {};
    L.flut[id] = { x: num(rect.x, 80), y: num(rect.y, 80), w: num(rect.w, FLUT_PAD.w), h: num(rect.h, FLUT_PAD.h) };
    return validar(L);
  }

  /* encaixar de volta: na última zona (ou na casa do painel) */
  function voltar(L, id) {
    var z = (L.ult && L.ult[id]) || CASA[id];
    return encaixar(L, id, z, {});
  }

  function recolher(L0, id, on) {
    if (!conhecido(id)) return L0;
    var L = clonar(L0);
    if (on === false || (on == null && L.rec[id])) delete L.rec[id]; else L.rec[id] = true;
    return validar(L);
  }

  function posFlut(L0, id, rect) {
    if (!L0.flut || !L0.flut[id]) return L0;
    var L = clonar(L0), r = L.flut[id];
    ["x", "y", "w", "h"].forEach(function (k) { if (rect && rect[k] != null) r[k] = num(rect[k], r[k]); });
    return validar(L);
  }

  function tamZona(L0, zona, px) {
    if (ZONAS.indexOf(zona) < 0) return L0;
    var L = clonar(L0);
    L.tam[zona] = Math.round(entre(num(px, LIM[zona].pad), LIM[zona].min, LIM[zona].max));
    return L;
  }

  /* a divisória entre o grupo i e o j (padrão i+1; j é outro quando há um grupo escondido no meio):
     `pct` = fatia do grupo i, em % da soma dos dois */
  function divisoria(L0, zona, i, pct, j) {
    var gl = L0.zonas[zona];
    if (j == null) j = i + 1;
    if (!gl || i < 0 || j >= gl.length || i >= j) return L0;
    var L = clonar(L0), g = L.zonas[zona], soma = g[i].tam + g[j].tam;
    var a = entre(num(pct, g[i].tam / soma * 100), 12, 88) / 100 * soma;
    g[i].tam = a; g[j].tam = soma - a;
    normalizarTam(g);
    return L;
  }

  function fitaRec(L0, on) {
    var L = clonar(L0);
    L.fita.rec = on == null ? !L.fita.rec : !!on;
    return L;
  }

  function ativar(L0, id) {
    var p = onde(L0, id);
    if (!p || p.flut) return L0;
    var L = clonar(L0);
    L.zonas[p.zona][p.grupo].ativa = id;
    return L;
  }

  /* -------------------------------------------------------- LAYOUTS PRONTOS */
  var PRONTOS = [
    { id: "modelar", rotulo: "Modelar", dica: "Propriedades e Navegador à esquerda, ferramentas à direita — o arranjo de sempre." },
    { id: "documentar", rotulo: "Documentar", dica: "Navegador (vistas e pranchas) grande à esquerda; Propriedades e ferramentas em abas à direita." },
    { id: "instalacoes", rotulo: "Instalações", dica: "Ferramentas (Instalações) em cima e Propriedades embaixo, na direita; Navegador recolhido na borda." },
    { id: "ampla", rotulo: "Modelagem ampla", dica: "Tudo recolhido nas bordas e a fita só com as abas: o 3D ocupa quase a tela inteira." }
  ];
  function pronto(nome) {
    var L = padrao();
    if (nome === "documentar") {
      L = encaixar(L, "props", "dir", { aba: true, grupo: 0 });   /* Propriedades entra nas abas de Ferramentas */
      L = ativar(L, "props");
      L.tam.esq = 300;
      L.tam.dir = 380;
      return validar(L);
    }
    if (nome === "instalacoes") {
      L = encaixar(L, "ferr", "dir", { indice: 0 });
      L = encaixar(L, "props", "dir", {});
      L = divisoria(L, "dir", 0, 58);
      L = recolher(L, "nav", true);
      L.tam.dir = 420;
      return validar(L);
    }
    if (nome === "ampla") {
      L = recolher(L, "props", true); L = recolher(L, "nav", true); L = recolher(L, "ferr", true);
      L = fitaRec(L, true);
      return validar(L);
    }
    return padrao();   /* "modelar" e qualquer nome desconhecido */
  }

  /* ----------------------------------------------------- ONDE SOLTAR (hit-test) */
  /* alvo(geo, p) — o que acontece se o ponteiro for solto em p.
   *   geo = { corpo:{l,t,r,b}, centro:{l,t,r,b},
   *           zonas:{ esq:{l,t,r,b}|null, … },                 retângulo atual de cada zona (null = sem grupo visível)
   *           grupos:[{ zona, i, l,t,r,b, cab:{l,t,r,b}, abas:[{id,l,r}] }],
   *           borda: px da faixa de encaixe nas bordas do corpo }
   * Devolve { tipo:'aba'|'grupo'|'zona'|'flut', zona, grupo, indice, pos, rect }
   * (rect = o retângulo da pré-visualização) ou null quando solto fora de tudo. */
  function dentro(r, x, y) { return !!r && x >= r.l && x <= r.r && y >= r.t && y <= r.b; }
  function alvo(geo, p) {
    var x = p.x, y = p.y, i, g;
    var grupos = geo.grupos || [];
    for (i = 0; i < grupos.length; i++) {
      g = grupos[i];
      if (!dentro(g, x, y)) continue;
      if (dentro(g.cab, x, y)) {
        var pos = 0, as = g.abas || [];
        for (var k = 0; k < as.length; k++) { if (x > (as[k].l + as[k].r) / 2) pos = k + 1; }
        return { tipo: "aba", zona: g.zona, grupo: g.i, pos: pos, rect: { l: g.l, t: g.t, r: g.r, b: g.b } };
      }
      var vert = vertical(g.zona), f = vert ? (y - g.t) / Math.max(1, g.b - g.t) : (x - g.l) / Math.max(1, g.r - g.l);
      if (f < 0.25) return { tipo: "grupo", zona: g.zona, indice: g.i, rect: vert ? { l: g.l, t: g.t, r: g.r, b: g.t + (g.b - g.t) / 2 } : { l: g.l, t: g.t, r: g.l + (g.r - g.l) / 2, b: g.b } };
      if (f > 0.75) return { tipo: "grupo", zona: g.zona, indice: g.i + 1, rect: vert ? { l: g.l, t: g.t + (g.b - g.t) / 2, r: g.r, b: g.b } : { l: g.l + (g.r - g.l) / 2, t: g.t, r: g.r, b: g.b } };
      return { tipo: "aba", zona: g.zona, grupo: g.i, pos: (g.abas || []).length, rect: { l: g.l, t: g.t, r: g.r, b: g.b } };
    }
    var c = geo.corpo, borda = geo.borda || 72;
    if (dentro(c, x, y)) {
      var d = { esq: x - c.l, dir: c.r - x, base: c.b - y, topo: y - c.t }, melhor = null;
      ZONAS.forEach(function (z) { if (d[z] <= borda && (melhor === null || d[z] < d[melhor] || (d[z] === d[melhor] && vertical(z)))) melhor = z; });
      if (melhor) {
        var zr = geo.zonas && geo.zonas[melhor], pad = (geo.pad && geo.pad[melhor]) || LIM[melhor].pad, rect;
        if (zr) rect = { l: zr.l, t: zr.t, r: zr.r, b: zr.b };
        else if (melhor === "esq") rect = { l: c.l, t: c.t, r: c.l + pad, b: c.b };
        else if (melhor === "dir") rect = { l: c.r - pad, t: c.t, r: c.r, b: c.b };
        else if (melhor === "base") rect = { l: c.l, t: c.b - pad, r: c.r, b: c.b };
        else rect = { l: c.l, t: c.t, r: c.r, b: c.t + pad };
        return { tipo: "zona", zona: melhor, rect: rect };
      }
    }
    var ce = geo.centro;
    if (dentro(ce, x, y)) {
      var w = Math.min(FLUT_PAD.w, ce.r - ce.l), h = Math.min(FLUT_PAD.h, ce.b - ce.t);
      var fx = entre(x - 40, ce.l, ce.r - w), fy = entre(y - 12, ce.t, ce.b - h);
      return { tipo: "flut", rect: { l: fx, t: fy, r: fx + w, b: fy + h } };
    }
    return null;
  }

  /* aplica o alvo medido por `alvo` ao layout — a única porta de entrada do arrasto */
  function soltar(L, id, a) {
    if (!a) return L;
    if (a.tipo === "aba") return encaixar(L, id, a.zona, { aba: true, grupo: a.grupo, pos: a.pos });
    if (a.tipo === "grupo") return encaixar(L, id, a.zona, { indice: a.indice });
    if (a.tipo === "zona") return encaixar(L, id, a.zona, {});
    if (a.tipo === "flut") return flutuar(L, id, { x: a.rect.l, y: a.rect.t, w: a.rect.r - a.rect.l, h: a.rect.b - a.rect.t });
    return L;
  }

  /* ----------------------------------------------------------- GUARDAR */
  /* `arm` = { getItem, setItem, removeItem } (o localStorage, ou um de mentira nos testes).
     Tudo com try/catch: sem armazenamento a tela funciona do mesmo jeito. */
  function chave(usuario) { return CHAVE + (usuario ? ":" + String(usuario).replace(/[^A-Za-z0-9_.@-]/g, "_") : ""); }
  function carregar(arm, usuario) {
    var bruto = null;
    try { bruto = arm && arm.getItem(chave(usuario)); } catch (e) { return { layout: padrao(), origem: "sem-armazenamento" }; }
    if (bruto == null || bruto === "") return { layout: padrao(), origem: "padrao" };
    try {
      var o = JSON.parse(bruto);
      if (!o || typeof o !== "object" || o.v !== VERSAO) return { layout: padrao(), origem: "versao-desconhecida" };
      return { layout: validar(o), origem: "salvo" };
    } catch (e2) { return { layout: padrao(), origem: "corrompido" }; }
  }
  function salvar(arm, usuario, L) {
    try { if (arm) { arm.setItem(chave(usuario), JSON.stringify(validar(L))); return true; } } catch (e) {}
    return false;
  }
  function esquecer(arm, usuario) { try { if (arm) arm.removeItem(chave(usuario)); return true; } catch (e) { return false; } }

  var Doca = {
    VERSAO: VERSAO, PAINEIS: PAINEIS, ZONAS: ZONAS, ROTULO: ROTULO, CASA: CASA, LIM: LIM, FLUT_PAD: FLUT_PAD, FLUT_MIN: FLUT_MIN, PRONTOS: PRONTOS, CHAVE: CHAVE,
    padrao: padrao, validar: validar, onde: onde, encaixar: encaixar, flutuar: flutuar, voltar: voltar, recolher: recolher, posFlut: posFlut,
    tamZona: tamZona, divisoria: divisoria, fitaRec: fitaRec, ativar: ativar, pronto: pronto, alvo: alvo, soltar: soltar,
    vertical: vertical, chave: chave, carregar: carregar, salvar: salvar, esquecer: esquecer
  };
  global.BimDoca = Doca;
  if (typeof module !== "undefined" && module.exports) module.exports = Doca;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
