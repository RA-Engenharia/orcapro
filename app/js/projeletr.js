/* =====================================================================
 * projeletr.js — LEITOR DO PROJETO ELÉTRICO em PDF vetorial (motor PURO, Node-testável). window.ProjEletr.
 *
 * Entrada: o TEXTO das pranchas, linha a linha (no app: Gestao._pdfTexto(file, cb, { porLinha: true }) — o mesmo
 * extrator de PDF que o sistema já usa). Saída:
 *   · QUADROS DE CARGAS (QGBT, QD1…QDn, QDC, QF): por circuito — potência (W/VA), seção (mm²), disjuntor (A e polos),
 *     DR (A/mA); total por quadro (o TOTAL escrito, conferido com a soma dos circuitos).
 *   · PONTOS pelos rótulos da planta: luz por potência («24W»), tomadas múltiplas «(2x)»/«(4x)», ar-condicionado
 *     por BTU («ARC12000»), chuveiro por potência («CHU 5500W»). A linha da LEGENDA não conta (é a explicação do
 *     símbolo, não o ponto).
 *   · QUANTIDADES: disjuntores por corrente e polos, DR, DPS, quadros, cabos por seção (comprimento: o PDF não diz →
 *     PENDENTE, nunca inventado), pontos.
 *   · ELEMENTOS no formato do js/mor/ifcorc.js (papéis disjuntor, quadro-eletrico, cabo, luminaria, tomada), para o
 *     mesmo motor de orçamento casar os códigos pelo catálogo (nenhum código SINAPI é escrito aqui).
 * Sem IA: só expressões regulares e contagem. ES5.
 * ===================================================================== */
(function (global) {
  "use strict";

  function sa(s) { var t = String(s == null ? "" : s); try { t = t.normalize("NFD").replace(/[̀-ͯ]/g, ""); } catch (e) { /* */ } return t; }
  function nbr(t) { return parseFloat(String(t).replace(/\.(?=\d{3}\b)/g, "").replace(",", ".")); }

  var RE_QUADRO = /\b(QGBT|QGF|QDG|QDC\s*-?\s*\d*|QD\s*-?\s*\d+[A-Z]?|QF\s*-?\s*\d+|QL\s*-?\s*\d+)\b/i;
  var RE_POT = /(\d{1,3}(?:\.\d{3})*(?:,\d+)?|\d+(?:[.,]\d+)?)\s*(W|VA|kW|kVA)\b/i;
  var RE_SEC = /(\d+(?:[.,]\d+)?)\s*mm\s*[²2]/i;
  var RE_DISJ = /\b(\d{1,3})\s*A\b(?!\s*mA)/;
  var RE_POLOS = /\b([123])\s*P\b|\b(mono|bi|tri)\s*-?\s*polar/i;
  var RE_DR = /\b(I?DR)\b[^\n]*?(\d{2,3})\s*A?[^\n]*?(\d{2,3})\s*mA|\b(\d{2,3})\s*mA\b/i;
  var RE_LEGENDA = /legenda|ponto gen[eé]rico|simbologia|s[ií]mbolo|conven[cç]/i;

  function linhasDe(texto) { return Object.prototype.toString.call(texto) === "[object Array]" ? texto.map(String) : String(texto || "").split(/\r?\n/); }
  function polosDe(t) {
    var m = RE_POLOS.exec(t); if (!m) return 0;
    if (m[1]) return +m[1];
    return { mono: 1, bi: 2, tri: 3 }[m[2].toLowerCase()] || 0;
  }
  function potW(m) { var v = nbr(m[1]), u = m[2].toLowerCase(); return u === "kw" || u === "kva" ? v * 1000 : v; }

  function ler(texto, opts) {
    opts = opts || {};
    var emLeg = false, ls = linhasDe(texto), quadros = [], porNome = {}, atual = null, pontos = { luz: {}, tomada2x: 0, tomada4x: 0, arc: {}, chuveiro: {} }, dps = 0, avisos = [], ignoradas = 0;
    ls.forEach(function (l0, ix) {
      var l = sa(l0).replace(/\s+/g, " ").trim(); if (!l) { emLeg = false; return; }
      if (/^(legenda|simbologia|convencoes)\b/i.test(l)) { emLeg = true; ignoradas++; return; }   /* o bloco da legenda vai até a linha vazia ou o próximo quadro */
      var mq = RE_QUADRO.exec(l);
      var temCirc = /^(?:C\s*-?\s*)?(\d{1,3})\b/i.exec(l);
      var mp = RE_POT.exec(l), ms = RE_SEC.exec(l), md = RE_DISJ.exec(l.replace(RE_SEC, " ").replace(RE_POT, " "));
      if (mq && !(temCirc && mp && ms)) {
        /* cabeçalho de quadro: «QUADRO DE CARGAS - QD1», «QD-2 (PAV. SUPERIOR)» */
        var nome = mq[1].toUpperCase().replace(/\s|-/g, "");
        if (/quadro|carga|qgbt|^\s*q[dgfl]/i.test(l)) {
          if (!porNome[nome]) { porNome[nome] = { nome: nome, circuitos: [], totalW: null, linha: ix + 1, dr: [], dps: 0 }; quadros.push(porNome[nome]); }
          else if (porNome[nome].circuitos.length) avisos.push("quadro " + nome + " aparece de novo na linha " + (ix + 1) + ": circuitos repetidos não somam");
          atual = porNome[nome]; emLeg = false;
          return;
        }
      }
      if (/\bDPS\b/i.test(l)) { var nd = /(\d+)\s*x\s*DPS|DPS[^0-9]*\b(\d)\s*(?:un|p[cç])/i.exec(l); var k = nd ? +(nd[1] || nd[2]) : 1; if (atual) atual.dps += k; else dps += k; return; }
      if (atual && /\b(I?DR)\b/.test(l) && /mA/i.test(l)) {
        var a = /(\d{2,3})\s*A\b/.exec(l), mA = /(\d{2,3})\s*mA/i.exec(l);
        atual.dr.push({ corrente: a ? +a[1] : null, mA: mA ? +mA[1] : null, polos: polosDe(l) || (/(?:4|tetra)\s*P/i.test(l) ? 4 : 2), linha: ix + 1 });
        if (!(temCirc && mp && ms)) return;
      }
      if (atual && /^total/i.test(l) && mp) { atual.totalW = potW(mp); return; }
      if (atual && temCirc && mp && ms && md) {
        var id = temCirc[1];
        if (atual.circuitos.some(function (c) { return c.id === id; })) return;
        var resto = l.slice(temCirc[0].length).replace(RE_POT, "|").split("|")[0].trim();
        atual.circuitos.push({ id: id, desc: resto, potW: potW(mp), secao: nbr(ms[1]), disjA: +md[1], polos: polosDe(l) || 1, dr: /\bDR\b|IDR/.test(l), linha: ix + 1, texto: l });
        return;
      }
      /* pontos pelos rótulos (fora da legenda e das tabelas) */
      if (emLeg || RE_LEGENDA.test(l)) { ignoradas++; return; }
      var m, re;
      re = /\bARC\s*-?\s*(\d{4,5})\b/gi; while ((m = re.exec(l))) pontos.arc[m[1]] = (pontos.arc[m[1]] || 0) + 1;
      re = /\bCHU\s*-?\s*(\d{4})\s*W?\b/gi; while ((m = re.exec(l))) pontos.chuveiro[m[1]] = (pontos.chuveiro[m[1]] || 0) + 1;
      re = /\((2|4)\s*x\)/gi; while ((m = re.exec(l))) { if (m[1] === "2") pontos.tomada2x++; else pontos.tomada4x++; }
      var lz = l.replace(/\bCHU\s*-?\s*\d{4}\s*W?\b/gi, " ");
      if (!/mm|\bA\b|disj|circ/i.test(lz)) { re = /(?:^|\s)(\d{1,3})\s*W\b/g; while ((m = re.exec(lz))) { var w = +m[1]; if (w >= 5 && w <= 400) pontos.luz[w] = (pontos.luz[w] || 0) + 1; } }
    });

    /* totais e conferência */
    quadros.forEach(function (q) {
      q.somaW = q.circuitos.reduce(function (s, c) { return s + c.potW; }, 0);
      if (q.totalW != null && Math.abs(q.totalW - q.somaW) > Math.max(1, 0.01 * q.totalW)) avisos.push("quadro " + q.nome + ": TOTAL escrito " + q.totalW + " W ≠ soma dos circuitos " + q.somaW + " W (confira a tabela)");
      if (!q.circuitos.length) avisos.push("quadro " + q.nome + " sem circuitos legíveis no texto");
    });
    var disj = {}, cabos = {}, drs = {};
    quadros.forEach(function (q) {
      q.circuitos.forEach(function (c) {
        var k = c.disjA + "A " + c.polos + "P"; disj[k] = disj[k] || { corrente: c.disjA, polos: c.polos, n: 0, quadros: [] }; disj[k].n++; if (disj[k].quadros.indexOf(q.nome) < 0) disj[k].quadros.push(q.nome);
        var ks = String(c.secao); cabos[ks] = cabos[ks] || { secao: c.secao, circuitos: 0, comprimento: null, pendente: "o PDF não traz o comprimento dos condutores: medir na planta ou informar" }; cabos[ks].circuitos++;
      });
      q.dr.forEach(function (d) { var k = (d.corrente || "?") + "A " + (d.mA || "?") + "mA " + d.polos + "P"; drs[k] = drs[k] || { corrente: d.corrente, mA: d.mA, polos: d.polos, n: 0 }; drs[k].n++; });
      dps += q.dps;
    });
    var nLuz = Object.keys(pontos.luz).reduce(function (s, k) { return s + pontos.luz[k]; }, 0);

    /* elementos para o motor de orçamento (ifcorc) */
    var el = [], seq = 0;
    function E(papel, sub, nome, qto, porque, extra) { var e = { id: "ele" + (++seq), classe: "PDF-ELETRICO", nome: nome, tipoNome: "", papel: papel, disciplina: "eletrica", sub: sub || "", qto: qto || {}, qtoFonte: {}, ambientes: [], ambientesCat: [], externo: null, camadas: [], materiais: [], psets: {}, porque: porque }; if (extra) for (var k in extra) e[k] = extra[k]; el.push(e); }
    quadros.forEach(function (q) { E("quadro-eletrico", "", "Quadro " + q.nome, {}, "quadro de cargas «" + q.nome + "» (linha " + q.linha + " do texto do PDF), " + q.circuitos.length + " circuito(s)"); });
    quadros.forEach(function (q) { q.circuitos.forEach(function (c) { E("disjuntor", c.disjA + "A-" + c.polos + "P", "Disjuntor " + c.polos + "P " + c.disjA + " A — " + q.nome + " circ. " + c.id, {}, "quadro " + q.nome + ", circuito " + c.id + ": disjuntor " + c.disjA + " A, " + c.polos + " polo(s) (linha " + c.linha + ")"); }); });
    Object.keys(cabos).forEach(function (k) { E("cabo", "", "Cabo " + k + " mm²", {}, cabos[k].circuitos + " circuito(s) com seção " + k + " mm²; comprimento PENDENTE (o PDF não diz)", { psets: { Projeto: { secao: cabos[k].secao } } }); });
    Object.keys(pontos.luz).forEach(function (w) { for (var i = 0; i < pontos.luz[w]; i++) E("luminaria", w + "W", "Ponto de luz " + w + " W", {}, "rótulo «" + w + "W» na planta"); });
    for (var t2 = 0; t2 < pontos.tomada2x; t2++) E("tomada", "10A", "Tomada dupla (2x)", {}, "rótulo «(2x)» na planta", { modulos: 2 });
    for (var t4 = 0; t4 < pontos.tomada4x; t4++) E("tomada", "10A", "Tomada quádrupla (4x)", {}, "rótulo «(4x)» na planta", { modulos: 4 });

    return {
      ok: true, fonte: "pdf-eletrico", quadros: quadros, pontos: pontos, avisos: avisos, linhasLegenda: ignoradas,
      quantidades: {
        quadros: quadros.length, disjuntores: Object.keys(disj).map(function (k) { return disj[k]; }).sort(function (a, b) { return a.corrente - b.corrente || a.polos - b.polos; }),
        dr: Object.keys(drs).map(function (k) { return drs[k]; }), dps: dps, cabos: Object.keys(cabos).map(function (k) { return cabos[k]; }).sort(function (a, b) { return a.secao - b.secao; }),
        pontosLuz: nLuz, tomadas2x: pontos.tomada2x, tomadas4x: pontos.tomada4x,
        arCondicionado: pontos.arc, chuveiros: pontos.chuveiro
      },
      elementos: el, espacos: [], modelo: { pavimentos: [] }, cobertura: { fonte: "pdf-eletrico", elementos: el.length }
    };
  }

  var ProjEletr = { ler: ler };
  global.ProjEletr = ProjEletr;
  if (typeof module !== "undefined" && module.exports) module.exports = ProjEletr;
})(typeof window !== "undefined" ? window : globalThis);
