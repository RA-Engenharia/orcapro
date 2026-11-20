/* =====================================================================
 * woodframepranchas.js — PRANCHAS DE MONTAGEM E DETALHES DO WOOD FRAME (fase 2A, 20/11/2026). Motor PURO, ES5, sem DOM, Node-testável.
 * Padrão RA de detalhamento (skill padrao-detalhamento, v2.0 = visual do TQS, carimbo RA INTOCADO): mesmo motor de folhas, mesmo carimbo e mesmo formato A1 das
 * pranchas da madeira engenharada (js/madt3pranchas.js, js/madengpranchas.js, js/madpranchas.js, js/prancha.js). Nada é redesenhado aqui: reaproveita o
 * Desenho (cota, tabela, rótulo sem sobreposição) e o carimbo; a geometria vem do MESMO quadro que o BIM mostra (js/woodframequadro.js).
 *
 *   WoodFramePranchas.gerar(estado, opcoes) → { ok, folhas, avisos, paineis, corte, consolidado, detalhes, marcas }
 *     estado = { caixas: [...] } do BIM (as paredes de quadro: tipo "wf-*");  opcoes.vaos = { <paredeId>: { aceitos } } (como no quantitativo) ou o BimEdit as calcula.
 *     opcoes = { obra, proprietario, contratante, local, empresa, responsavel, registro, tituloProfissional, codigo, revisao, data, formato ("A1"), logo, padrao, depurar }
 *
 * O JOGO DE FOLHAS
 *   WF01 planta de painéis (cada painel numerado P01, P02… + sentido de montagem + quadro de painéis)
 *   WF02… uma ELEVAÇÃO por painel (parede de quadro, do canto ao canto): montantes com eixo e cotas acumuladas, guias, vãos com verga/ombreiras/cripples, bloqueadores,
 *         modulação do OSB com as juntas, chumbadores e hold-downs, cotas gerais e a LISTA DE CORTE do painel
 *   WFnn  lista de corte CONSOLIDADA da obra (m³ e peças por seção, OSB)
 *   WFnn  DETALHES TÍPICOS desenhados do tipo de parede real (camadas e espessuras do tipo): canto L, encontro T, junta de OSB, esquadria; base e topo/verga
 *
 * CONVENÇÕES (escritas aqui para a conferência)
 *   · Cotas em centímetros, níveis em metros, seções e comprimentos de corte em milímetros (a madeira de 2" é pedida em 38×89 e a 400 mm de eixo).
 *   · A elevação é vista PELO LADO INTERNO (onde o quadro aparece, com o OSB atrás); o espelhamento por `inverterFaces` é feito para a vista ser sempre a do lado de dentro.
 *     Ponta A = início da parede no modelador, ponta B = fim. As cotas acumuladas partem da ponta de ORIGEM do alinhamento dos montantes e do OSB (parâmetro `origem` do tipo).
 *   · Marca da peça = <painel>-<tipo><n> (P01-M3): peças iguais (tipo, seção e comprimento) no painel têm a mesma marca.
 *   · Hold-down e chumbador são ESQUEMA: modelo, diâmetro e capacidade ficam para o cálculo (nada inventado — mesma regra do quantitativo da fase 1).
 *   · Nenhum código SINAPI aqui.
 * Teste: node tools/test-woodframe-pranchas.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) { /* ausente */ } } return null; }
  /* resolvidos NA HORA DE USAR (no BIM do navegador os motores de pranchas da madeira vêm no mesmo grupo, depois deste arquivo) */
  var W = null, EP = null, Q = null, I = null;
  function resolver() {
    W = W || dep("WoodFrameQuadro", "./woodframequadro.js");
    EP = EP || dep("MadEngPranchas", "./madengpranchas.js"); Q = EP && EP._p; I = Q && Q.I;
    return !!(W && EP && Q && I);
  }
  var VERMELHO = "#c00000";

  function arr(v) { return Array.isArray(v) ? v : []; }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function r4(v) { return Math.round(v * 1e4) / 1e4; }
  function mmI(v) { return Math.round(v * 1000); }
  function pad2(k) { return (k < 10 ? "0" : "") + k; }
  function br(v, c) { return I.br(v, c); }
  /* m → cota em cm ("40", "2,5") */
  function cmT(vm) { var v = Math.round(vm * 1000) / 10; return Math.abs(v - Math.round(v)) < 1e-6 ? String(Math.round(v)) : br(v, 1); }
  function nivelDe(c) { return String(c.nivelBase || c.nivelId || c.nivel || "n0"); }

  var NOME = { "guia-inferior": "Guia inferior", "guia-superior": "Guia superior (dupla)", "montante": "Montante", "montante-extremo": "Montante de extremidade",
    "montante-canto": "Montante de canto", "montante-encontro": "Montante de encontro T/X", "ombreira-rei": "Ombreira rei (king)", "ombreira-jack": "Ombreira jack (trimmer)",
    "verga": "Verga", "cripple-superior": "Cripple superior", "cripple-inferior": "Cripple inferior", "peitoril": "Peitoril", "bloco": "Bloco de pregação",
    "bloqueador": "Bloqueador", "espacador-verga": "Espaçador da verga (OSB/compensado)" };
  var PREF = { "guia-inferior": "GI", "guia-superior": "GS", "montante": "M", "montante-extremo": "ME", "montante-canto": "MC", "montante-encontro": "MT", "ombreira-rei": "OR",
    "ombreira-jack": "OJ", "verga": "V", "cripple-superior": "CS", "cripple-inferior": "CI", "peitoril": "PT", "bloco": "BL", "bloqueador": "BQ", "espacador-verga": "EV" };
  var ORDEM_TIPO = ["guia-inferior", "guia-superior", "montante", "montante-extremo", "montante-canto", "montante-encontro", "ombreira-rei", "ombreira-jack", "verga", "espacador-verga",
    "cripple-superior", "cripple-inferior", "peitoril", "bloco", "bloqueador"];
  function tipoBase(t) { return /^guia-superior/.test(t) ? "guia-superior" : t; }

  /* ================================================================== PAINÉIS */
  /* Um painel por parede de quadro (a parede do modelador vai de canto a canto / de encontro a encontro). Numeração P01, P02… na ORDEM DO MODELO (a da criação das paredes):
     esticar, editar ou apagar outra parede não renumera (ver c.wfPainel). */
  function paineis(estado, opc) {
    resolver();
    var avisos = [], lista = [], vz = {};
    if (!W) return { lista: [], avisos: ["js/woodframequadro.js não carregou."] };
    vz = W.vaosDasParedes(estado, opc || {}) || {};
    /* NUMERAÇÃO ESTÁVEL: o número do painel é gravado na parede na 1ª geração (c.wfPainel) e também em opc.numeracao {paredeId: n} (o que o chamador guarda:
       o estado do BIM é refeito das operações a cada leitura). Parede nova recebe max+1; apagar uma parede NÃO renumera as outras. */
    var numer = (opc && opc.numeracao) || {}, usados = {}, maxN = 0, wfs = arr(estado && estado.caixas).filter(function (c) { return W.ehWf(c); });
    wfs.forEach(function (c) { var n = Math.round(num(c.wfPainel != null ? c.wfPainel : numer[c.id], 0)); if (n > 0 && !usados[n]) { usados[n] = 1; c._wfN = n; if (n > maxN) maxN = n; } else c._wfN = 0; });
    wfs.forEach(function (c) { if (!c._wfN) { c._wfN = ++maxN; usados[c._wfN] = 1; } c.wfPainel = c._wfN; if (opc) { opc.numeracao = opc.numeracao || {}; opc.numeracao[c.id] = c._wfN; } });
    wfs.slice().sort(function (a, b2) { return a._wfN - b2._wfN; }).forEach(function (c) {
      var v = vz[c.id] ? arr(vz[c.id].aceitos) : [];
      var r = W.paraParede(c, v);
      if (!r || !r.ok) { avisos.push("Wood Frame " + c.id + ": " + (r && r.motivo ? r.motivo : "quadro não gerado")); return; }
      var k = c._wfN;
      lista.push({ marca: "P" + pad2(k), n: k, parede: String(c.id), nivel: nivelDe(c), c: c, vaos: v, res: r, espelho: !!c.inverterFaces,
        tipo: String((c.tipoParede && (c.tipoParede.rotulo || c.tipoParede.id)) || "Wood Frame") });
    });
    lista.forEach(function (P) { P.res.avisos.forEach(function (a) { avisos.push(P.marca + " (" + P.parede + "): " + a); }); });
    return { lista: lista, avisos: avisos };
  }

  /* volume BRUTO = seção de COMPRA (catálogo, ex. 50x100) × comprimento da peça; sem seção de compra no catálogo vale o volume final (a tabela diz "-") */
  function brutaDe(q) {
    var m = /^(\d+)x(\d+)$/.exec(String(q.compra || ""));
    return m ? (+m[1] / 1000) * (+m[2] / 1000) * q.comp : q.vol;
  }
  /* ================================================================== LISTA DE CORTE DO PAINEL */
  function corteDe(P) {
    resolver();
    var res = P.res, gr = {}, ordem = [], osb = {}, ordemO = [], marcaDe = {};
    res.pecas.forEach(function (q) {
      if (q.grupo === "osb") {
        var w = mmI(q.u1 - q.u0), h = mmI(q.y1 - q.y0), ko = w + "x" + h;
        if (!osb[ko]) { osb[ko] = { w: w, h: h, qtd: 0, ids: [] }; ordemO.push(ko); }
        osb[ko].qtd++; osb[ko].ids.push(q.id); return;
      }
      var tb = tipoBase(q.tipo), comp = mmI(q.comp), k = tb + "|" + q.secao + "|" + comp;
      if (!gr[k]) { gr[k] = { tipo: tb, nome: NOME[tb] || tb, secao: q.secao, compra: q.compra || null, comp_mm: comp, qtd: 0, vol_m3: 0, vol_bruta_m3: 0, ids: [], grupo: q.grupo }; ordem.push(k); }
      gr[k].qtd++; gr[k].vol_m3 += q.vol; gr[k].ids.push(q.id);
      gr[k].vol_bruta_m3 += brutaDe(q);
    });
    var linhas = ordem.map(function (k) { return gr[k]; });
    linhas.sort(function (a, b) {
      var ia = ORDEM_TIPO.indexOf(a.tipo), ib = ORDEM_TIPO.indexOf(b.tipo); if (ia < 0) ia = 99; if (ib < 0) ib = 99;
      return ia !== ib ? ia - ib : (b.comp_mm - a.comp_mm || (a.secao < b.secao ? -1 : 1));
    });
    var cont = {};
    linhas.forEach(function (l) {
      var pf = PREF[l.tipo] || "X"; cont[pf] = (cont[pf] || 0) + 1;
      l.marca = P.marca + "-" + pf + cont[pf]; l.vol_m3 = r6(l.vol_m3); l.vol_bruta_m3 = r6(l.vol_bruta_m3);
      l.ids.forEach(function (id) { marcaDe[id] = l.marca; });
    });
    var linhasO = ordemO.map(function (k) { return osb[k]; });
    linhasO.sort(function (a, b) { return (b.w * b.h) - (a.w * a.h); });
    linhasO.forEach(function (o, i) { o.marca = P.marca + "-O" + (i + 1); o.nome = "Chapa de OSB (recorte)"; o.secao = "OSB " + br(num(res.osb.e, 0), 1) + " mm"; o.comp_mm = Math.max(o.w, o.h); o.dim = o.w + "×" + o.h; o.ids.forEach(function (id) { marcaDe[id] = o.marca; }); });
    var tot = { pecas: 0, espacadores: 0, vol_m3: 0, vol_bruta_m3: 0 };
    linhas.forEach(function (l) { if (l.grupo === "madeira") { tot.pecas += l.qtd; tot.vol_m3 += l.vol_m3; tot.vol_bruta_m3 += l.vol_bruta_m3; } else tot.espacadores += l.qtd; });
    tot.vol_m3 = r6(tot.vol_m3); tot.vol_bruta_m3 = r6(tot.vol_bruta_m3);
    tot.osbChapas = res.osb.chapas; tot.osbRecortes = res.pecas.filter(function (q) { return q.grupo === "osb"; }).length; tot.osbArea_m2 = res.osb.area;
    return { painel: P.marca, modulo: arr(res.params.osbModulo).join("×"), linhas: linhas, osb: linhasO, totais: tot, marcaDe: marcaDe };
  }

  /* ================================================================== CONSOLIDADO DA OBRA */
  function consolidar(lista) {
    var chave = {}, ordem = [], sec = {}, ordS = [], osb = { chapas: 0, recortes: 0, area_m2: 0, itens: [] }, esp = { qtd: 0 };
    var tot = { pecas: 0, vol_m3: 0, vol_bruta_m3: 0, comp_m: 0 };
    lista.forEach(function (P) {
      var ct = P.corte;
      ct.linhas.forEach(function (l) {
        if (l.grupo !== "madeira") { esp.qtd += l.qtd; return; }
        var k = l.tipo + "|" + l.secao + "|" + l.comp_mm;
        if (!chave[k]) { chave[k] = { tipo: l.tipo, nome: l.nome, secao: l.secao, compra: l.compra, comp_mm: l.comp_mm, qtd: 0, vol_m3: 0, vol_bruta_m3: 0, paineis: [] }; ordem.push(k); }
        var x = chave[k]; x.qtd += l.qtd; x.vol_m3 += l.vol_m3; x.vol_bruta_m3 += l.vol_bruta_m3; if (x.paineis.indexOf(P.marca) < 0) x.paineis.push(P.marca);
        var ks = l.secao;
        if (!sec[ks]) { sec[ks] = { secao: l.secao, compra: l.compra, pecas: 0, comp_m: 0, vol_m3: 0, vol_bruta_m3: 0 }; ordS.push(ks); }
        if (!sec[ks].compra && l.compra) sec[ks].compra = l.compra;
        sec[ks].pecas += l.qtd; sec[ks].comp_m += l.qtd * l.comp_mm / 1000; sec[ks].vol_m3 += l.vol_m3; sec[ks].vol_bruta_m3 += l.vol_bruta_m3;
        tot.pecas += l.qtd; tot.vol_m3 += l.vol_m3; tot.vol_bruta_m3 += l.vol_bruta_m3; tot.comp_m += l.qtd * l.comp_mm / 1000;
      });
      osb.chapas += ct.totais.osbChapas; osb.recortes += ct.totais.osbRecortes; osb.area_m2 += ct.totais.osbArea_m2;
      if (ct.totais.osbChapas > 0) {
        var ee = P.res.osb.e == null ? null : P.res.osb.e, it = osb.itens.filter(function (z) { return z.e === ee && z.modulo === ct.modulo; })[0];
        if (!it) osb.itens.push(it = { e: ee, modulo: ct.modulo, chapas: 0 }); it.chapas += ct.totais.osbChapas;
      }
    });
    var linhas = ordem.map(function (k) { var x = chave[k]; x.vol_m3 = r6(x.vol_m3); x.vol_bruta_m3 = r6(x.vol_bruta_m3); return x; });
    linhas.sort(function (a, b) {
      if (a.secao !== b.secao) { var pa = parseSec(a.secao), pb = parseSec(b.secao); return pa[1] !== pb[1] ? pa[1] - pb[1] : pa[0] - pb[0]; }
      var ia = ORDEM_TIPO.indexOf(a.tipo), ib = ORDEM_TIPO.indexOf(b.tipo); if (ia < 0) ia = 99; if (ib < 0) ib = 99;
      return ia !== ib ? ia - ib : b.comp_mm - a.comp_mm;
    });
    var secoes = ordS.map(function (k) { var s = sec[k]; s.comp_m = r4(s.comp_m); s.vol_m3 = r6(s.vol_m3); s.vol_bruta_m3 = r6(s.vol_bruta_m3); return s; });
    secoes.sort(function (a, b) { var pa = parseSec(a.secao), pb = parseSec(b.secao); return pa[1] !== pb[1] ? pa[1] - pb[1] : pa[0] - pb[0]; });
    osb.area_m2 = r4(osb.area_m2); tot.vol_m3 = r6(tot.vol_m3); tot.vol_bruta_m3 = r6(tot.vol_bruta_m3); tot.comp_m = r4(tot.comp_m);
    return { linhas: linhas, secoes: secoes, totais: tot, osb: osb, espacadores: esp.qtd };
  }
  function parseSec(s) { var m = /(\d+)x(\d+)/.exec(String(s)); return m ? [+m[1], +m[2]] : [0, 0]; }
  function secTxt(s) { return String(s).replace("x", "×"); }

  /* ================================================================== AJUDAS DE DESENHO */
  function lg(D, s, h) { return Q.MP.largTexto(s, h); }
  /* acha um lugar livre perto de (ax,ay) para uma caixa w×h: anéis de raio crescente; a linha de chamada até a âncora não pode cortar outro texto */
  function acharLugar(D, ax, ay, w, h, area, raioMax) {
    var dx, passo = 1.4, ang, r, k, N = 24, melhor = null;
    for (r = 1.5; r <= raioMax; r += passo) {
      for (k = 0; k < N; k++) {
        ang = (k * 2 * Math.PI) / N + (r * 0.37);
        var cx = ax + r * Math.cos(ang), cy = ay + r * Math.sin(ang), bx = [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
        if (bx[0] < area[0] || bx[2] > area[2] || bx[1] < area[1] || bx[3] > area[3]) continue;
        if (!D.livre(bx, 0.5)) continue;
        var sx = Math.max(bx[0], Math.min(ax, bx[2])), sy = Math.max(bx[1], Math.min(ay, bx[3]));
        if (D.cortaTexto(sx, sy, ax, ay)) continue;
        melhor = [cx, cy, sx, sy]; return melhor;
      }
    }
    return melhor;
  }
  /* rótulo com linha de chamada até a âncora (marca da peça) */
  function rotular(D, ax, ay, texto, area, raio) {
    var h = D.E.T.nota, w = lg(D, texto, h) + 1.0, p = acharLugar(D, ax, ay, w, h + 0.6, area, raio || 40);
    if (!p) return false;
    D.texto(p[0], p[1], texto, h, { al: "C", meio: true });
    var dd = Math.sqrt((p[2] - ax) * (p[2] - ax) + (p[3] - ay) * (p[3] - ay));
    if (dd > 0.6) D.linha(p[2], p[3], ax, ay, "MAD-FINA");
    D.ponto(ax, ay, 0.4);
    return true;
  }
  /* texto curto num lugar livre perto de (cx,cy) (sem linha de chamada) */
  function colocar(D, cx, cy, t, h, raio) {
    var w = lg(D, t, h) + 0.8, r, k, N = 16;
    for (r = 0; r <= raio; r += 1.2) for (k = 0; k < (r === 0 ? 1 : N); k++) {
      var a = k * 2 * Math.PI / N, x = cx + r * Math.cos(a), y = cy + r * Math.sin(a), bx = [x - w / 2, y - h * 0.76, x + w / 2, y + h * 0.18];
      if (D.livre(bx, 0.4)) { D.texto(x, y, t, h, { al: "C" }); return true; }
    }
    return false;
  }
  function tracoRuptura(D, x, y0, y1, vertical) {
    var N = 4, k, pts = [];
    for (k = 0; k <= N; k++) { var t = k / N, off = (k % 2 ? 1.2 : -1.2); pts.push(vertical ? [x + (k === 0 || k === N ? 0 : off), y0 + (y1 - y0) * t] : [y0 + (y1 - y0) * t, x + (k === 0 || k === N ? 0 : off)]); }
    D.poli(pts, "MAD-FINA", false);
  }

  /* ================================================================== FOLHA DA ELEVAÇÃO DO PAINEL */
  var ESCALAS_EL = [20, 25, 50, 100];
  function colunasTabela() {
    return [{ t: "MARCA", al: "E" }, { t: "PEÇA", al: "E" }, { t: ["SEÇÃO", "mm"] }, { t: ["COMPRA", "bruta mm"] }, { t: ["COMP.", "mm"] }, { t: "QTD" }, { t: ["VOL. final / bruta", "m³"] }];
  }
  function linhasTabela(ct) {
    var out = [];
    ct.linhas.forEach(function (l) { out.push([l.marca, l.nome, l.secao.replace("x", "×"), l.compra ? l.compra.replace("x", "×") : "-", String(l.comp_mm), String(l.qtd), l.grupo === "madeira" ? br(l.vol_m3, 4) + " / " + br(l.vol_bruta_m3, 4) : "-"]); });
    if (ct.osb.length) {
      out.push({ titulo: "CHAPAS DE OSB (recortes dos módulos de " + ct.modulo + " mm)" });
      ct.osb.forEach(function (o) { out.push([o.marca, o.nome, o.secao.replace("OSB ", "") , "-", o.dim, String(o.qtd), "-"]); });
    }
    var t = ct.totais;
    out.push({ total: ["QTD (madeira)", String(t.pecas) + " peças de madeira" + (t.espacadores ? " + " + t.espacadores + " espaçador(es)" : "") + " · " + t.osbChapas + " chapa(s) de OSB", "", "", "", String(t.pecas), br(t.vol_m3, 4) + " / " + br(t.vol_bruta_m3, 4)] });
    return out;
  }

  function folhaPainel(P, esc) {
    return function (c) {
      var D = c.D, a = c.geo.area, T = D.E.T, res = P.res, Le = res.L, H = res.H, des = res.deslocU, s = 1000 / esc, esp = P.espelho, ct = P.corte, par = res.params;
      var guia = res.b;
      function X(u) { var r = u - des; return fx0 + (esp ? Le - r : r) * s; }
      function Y(y) { return fy1 - y * s; }
      function rx(u0, u1) { var x0 = X(u0), x1 = X(u1); return [Math.min(x0, x1), Math.max(x0, x1)]; }
      var tit = I.tituloVista(D, a.x + 2, a.y + 2, "PAINEL " + P.marca + " - ELEVAÇÃO DO QUADRO E MODULAÇÃO DO OSB", "ESC. 1:" + esc + "  -  PAREDE " + P.parede + "  -  " + P.tipo.toUpperCase() + "  -  VISTA PELO LADO INTERNO", P.marca);
      var tab = I.medirTabela(D, colunasTabela(), linhasTabela(ct), { fs: T.tabela });
      var fx0 = a.x + 30, fw = Le * s, fx1 = fx0 + fw;
      var fy0 = a.y + 2 + tit + 36, fy1 = fy0 + H * s;
      var direita = fx1 + 24 + tab.w <= a.x + a.w - 1;
      /* ---- guias, montantes e demais peças (a elevação é o quadro; o OSB fica na faixa de baixo) */
      var vistas = {}, i;
      var camPeca = { "verga": "MAD-PRINCIPAL", "peitoril": "MAD-PRINCIPAL", "bloco": "MAD-FINA", "bloqueador": "MAD-FINA" };
      res.pecas.forEach(function (q) {
        if (q.grupo !== "madeira") return;
        var xs = rx(q.u0, q.u1), y0 = Y(q.y1), y1 = Y(q.y0), ch = q.tipo + "|" + xs[0].toFixed(2) + "|" + xs[1].toFixed(2) + "|" + y0.toFixed(2) + "|" + y1.toFixed(2);
        if (vistas[ch]) return; vistas[ch] = 1;
        D.ret(xs[0], y0, xs[1] - xs[0], y1 - y0, camPeca[q.tipo] || "MAD-PECA");
      });
      /* ---- eixos dos montantes + cotas acumuladas a partir da ponta de origem */
      var origemU = par.origem === "fim" ? Le : 0, cands = [];
      res.pecas.forEach(function (q) {
        if (q.grupo !== "madeira" || !/^(montante|montante-extremo)$/.test(q.tipo)) return;
        cands.push({ u: (q.u0 + q.u1) / 2 - des, prio: 1, eixo: true });
      });
      res.vaos.forEach(function (v) { cands.push({ u: v.x0 - des, prio: 0 }); cands.push({ u: v.x1 - des, prio: 0 }); });
      function xr(u) { return fx0 + (esp ? Le - u : u) * s; }
      var aceitos = [];
      cands.filter(function (k) { return xr(k.u) - fx0 > 3.6 && fx1 - xr(k.u) > 3.6; }).sort(function (p, q2) { return p.prio - q2.prio || p.u - q2.u; }).forEach(function (k) {
        var x = xr(k.u); if (aceitos.every(function (o) { return Math.abs(o.x - x) >= 3.6; })) aceitos.push({ u: k.u, x: x, eixo: k.eixo });
      });
      aceitos.sort(function (p, q2) { return p.x - q2.x; });
      var yB = fy0 - 12, yTot = yB - 11;
      res.pecas.forEach(function (q) {
        if (q.grupo !== "madeira" || !/^(montante|montante-extremo)$/.test(q.tipo)) return;
        var xc = X((q.u0 + q.u1) / 2); D.linha(xc, fy0 - 3, xc, fy1 + 2, "MAD-EIXO");
      });
      D.linha(fx0, yB, fx1, yB, "MAD-COTA");
      aceitos.forEach(function (k) {
        if (!k.eixo) D.linha(k.x, fy0 - 0.5, k.x, yB, "MAD-FINA");
        else D.linha(k.x, fy0 - 3, k.x, yB, "MAD-EIXO");
        D.linha(k.x - 0.9, yB + 0.9, k.x + 0.9, yB - 0.9, "MAD-FINA");
        D.texto(k.x + T.cota * 0.29, yB - 1.3, cmT(Math.abs(k.u - origemU)), T.cota, { rot: -90 });
      });
      D.linha(fx0 - 0.9, yB + 0.9, fx0 + 0.9, yB - 0.9, "MAD-FINA"); D.linha(fx1 - 0.9, yB + 0.9, fx1 + 0.9, yB - 0.9, "MAD-FINA");
      D.texto(fx0 - 3.6, yB - 1.6, "COTAS ACUM. cm", T.nota * 0.84, { al: "D", cor: "#555" });
      /* cota geral */
      D.linha(fx0, fy0 - 1, fx0, yTot - 1.5, "MAD-COTA"); D.linha(fx1, fy0 - 1, fx1, yTot - 1.5, "MAD-COTA");
      D.cadeia([[fx0, yTot], [fx1, yTot]], 0, [cmT(Le)], { semExt: true });
      var ax = esp ? fx1 : fx0, bx = esp ? fx0 : fx1;
      D.balao(ax + (esp ? 6 : -6), yTot, "A"); D.balao(bx + (esp ? -6 : 6), yTot, "B");
      /* cotas verticais: níveis dos vãos e total à esquerda; guias e montante à direita */
      var niveis = [0]; res.vaos.forEach(function (v) { [v.y0, v.y1].forEach(function (yv) { if (yv > 0.001 && yv < H - 0.001 && niveis.every(function (z) { return Math.abs(z - yv) > 0.004; })) niveis.push(yv); }); });
      niveis.push(H); niveis.sort(function (p, q2) { return p - q2; });
      if (niveis.length > 2) D.cadeia(niveis.map(function (yv) { return [fx0, Y(yv)]; }), 9, niveis.slice(1).map(function (yv, k) { return cmT(yv - niveis[k]); }));
      D.cadeia([[fx0, Y(0)], [fx0, Y(H)]], niveis.length > 2 ? 21 : 9, [cmT(H)]);
      var yMont = H - 2 * guia;
      D.cadeia([[fx1, Y(0)], [fx1, Y(guia)], [fx1, Y(yMont)], [fx1, Y(H)]], -11, [cmT(guia), cmT(yMont - guia), cmT(2 * guia)].map(function (t) { return t; }));
      /* vãos: largura e altura livres dentro do vão + marca */
      res.vaos.forEach(function (v) {
        var xs = rx(v.x0, v.x1), ym = (Y(v.y0) + Y(v.y1)) / 2;
        D.cadeia([[xs[0], ym], [xs[1], ym]], 0, [cmT(v.x1 - v.x0)], { semExt: true });
        var xv = (xs[0] + xs[1]) / 2 + 0;
        var idv = String(v.id).toUpperCase(); D.texto(xv, Y(v.y1) + 4.6, /^(PORTA|JANELA)/.test(idv) ? idv : (v.porta ? "PORTA " : "JANELA ") + idv, T.nota * 0.92, { al: "C" });
        D.texto(xv, ym + 7.2, "H = " + cmT(v.y1 - v.y0) + (v.porta ? "" : "  PEIT. " + cmT(v.y0)), T.nota * 0.92, { al: "C" });
      });
      /* fundação, chumbadores e hold-downs */
      var bandaH = 5;
      D.ret(fx0 - 5, fy1, fw + 10, bandaH, "MAD-FINA");
      D.hachura(fx0 - 5, fy1, fw + 10, bandaH, 1.8, "MAD-HACHURA");
      var posCh = W.posChumbadores(res);       /* a MESMA função do quantitativo */
      posCh.forEach(function (u) {
        var x = xr(u); D.linha(x, Y(guia) - 2.0, x, fy1 + bandaH - 0.8, "MAD-FERRAGEM"); D.ret(x - 1.0, Y(guia) - 2.8, 2.0, 0.8, "MAD-FERRAGEM");
      });
      var cadCh = [fx0].concat(posCh.map(xr).sort(function (p, q2) { return p - q2; })).concat([fx1]).filter(function (x, k, A) { return k === 0 || x - A[k - 1] > 3.6; });
      var yCh = fy1 + bandaH + 7;
      if (cadCh.length > 2) D.cadeia(cadCh.map(function (x) { return [x, fy1 + bandaH]; }), -7, cadCh.slice(1).map(function (x, k) { return cmT((x - cadCh[k]) / s); }), { semExt: false });
      function hdPonta(t) { return t === "L" || t === "Lb" ? 0.5 : (t === "T" ? 0 : 1); }
      var hds = [];
      [["ini", res.pontas.ini], ["fim", res.pontas.fim]].forEach(function (pp) {
        if (!hdPonta(pp[1])) return;
        var xe = pp[0] === "ini" ? X(des) : X(des + Le), sgn = (pp[0] === "ini") === !esp ? 1 : -1, xh = xe + sgn * (guia * s + 0.4);
        var x0h = Math.min(xh, xh + sgn * 3.4), x1h = Math.max(xh, xh + sgn * 3.4);
        D.ret(x0h, Y(guia) - 10, x1h - x0h, 10, "MAD-FERRAGEM"); D.hachura(x0h, Y(guia) - 10, x1h - x0h, 10, 1.2, "MAD-FERRAGEM");
        hds.push([(x0h + x1h) / 2, Y(guia) - 5, pp[1]]);
      });
      /* faixa do OSB */
      var oTit = yCh + 11 + (cadCh.length > 2 ? 7 : 0), oy0 = oTit + 7, oy1 = oy0 + H * s;
      var temOsb = res.pecas.some(function (q) { return q.grupo === "osb"; });
      if (temOsb) {
      D.texto(fx0, oTit, "MODULAÇÃO DO OSB (CHAPA " + br(num(res.osb.e, 0), 1) + " mm, MÓDULO " + par.osbModulo[0] + "×" + par.osbModulo[1] + " mm) - MESMA ORIENTAÇÃO DO QUADRO", T.nota * 1.1, { peso: 0.06 });
      var osbPcs = res.pecas.filter(function (q) { return q.grupo === "osb"; });
      osbPcs.forEach(function (q) {
        var xs = rx(q.u0, q.u1), yy0 = oy1 - q.y1 * s, yy1 = oy1 - q.y0 * s;
        D.ret(xs[0], yy0, xs[1] - xs[0], yy1 - yy0, "MAD-PECA");
        var mk = ct.marcaDe[q.id], tl = mk ? mk.replace(P.marca + "-", "") : "";
        if (tl && xs[1] - xs[0] > lg(D, tl, T.nota) + 2 && yy1 - yy0 > T.nota + 2) D.texto((xs[0] + xs[1]) / 2, (yy0 + yy1) / 2, tl, T.nota, { al: "C", meio: true });
      });
      /* vãos no OSB (contorno tracejado) */
      res.vaos.forEach(function (v) { var xs = rx(v.x0, v.x1); D.ret(xs[0], oy1 - v.y1 * s, xs[1] - xs[0], (v.y1 - v.y0) * s, "MAD-OCULTA"); });
      var yJ = oy1 + 7;
      D.linha(fx0, yJ, fx1, yJ, "MAD-COTA");
      var juntas = arr(res.juntasOsb).map(function (j) { return { u: j.u - des, apoio: j.apoio }; });
      juntas.forEach(function (j) {
        var x = xr(j.u), cor = j.apoio ? null : VERMELHO;
        D.linha(x, oy1 + 0.5, x, yJ + 1.2, j.apoio ? "MAD-FINA" : "MAD-PEND");
        D.texto(x, yJ + 4.4, cmT(Math.abs(j.u - origemU)) + (j.apoio ? "" : " (FORA DO MONTANTE)"), T.cota, { al: "C", cor: cor });
      });
      D.texto(fx0, yJ + 9.4, "JUNTAS VERTICAIS DO OSB (cm, a partir da origem" + (par.origem === "fim" ? ": ponta B" : ": ponta A") + ")  -  FIXAÇÃO: BORDA A " + par.espOsbBorda + " mm, CAMPO A " + par.espOsbCampo + " mm", T.nota * 0.92);
      var hJ = par.osbModulo[1] / 1000;
      if (H > hJ + 0.05) D.texto(fx1 + 2, oy1 - hJ * s - 0.8, "junta horizontal " + cmT(hJ), T.nota * 0.84);
      } else { oy1 = oTit - 10; D.texto(fx0, oTit - 4, "SEM OSB NESTE PAINEL (PAREDE INTERNA SEM CONTRAVENTAMENTO DE CHAPA).", T.nota * 1.1, { peso: 0.06 }); }
      /* ---- rótulos das marcas (uma por marca, com linha de chamada) — depois de tudo desenhado */
      var areaQ = [fx0 + 0.6, fy0 + 0.6, fx1 - 0.6, fy1 - 0.6], feitos = {}, falhou = 0;
      var repres = {};
      res.pecas.forEach(function (q) { if (q.grupo === "madeira") { var mk = ct.marcaDe[q.id]; if (mk && !repres[mk]) repres[mk] = q; } });
      hds.forEach(function (h2) { if (!rotular(D, h2[0], h2[1], "HD", areaQ, 30)) falhou++; });
      if (posCh.length) { var x1c = xr(posCh[Math.floor(posCh.length / 2)]); if (!rotular(D, x1c, Y(guia) - 1.2, "CH", areaQ, 30)) falhou++; }
      ct.linhas.forEach(function (l) {
        var q = repres[l.marca]; if (!q) return;
        var xs = rx(q.u0, q.u1), ys = [Y(q.y1), Y(q.y0)], ax2 = (xs[0] + xs[1]) / 2, ay2 = (ys[0] + ys[1]) / 2;
        if (/^(montante|ombreira|cripple|montante-)/.test(q.tipo)) ay2 = ys[0] + (ys[1] - ys[0]) * 0.32;
        if (q.tipo === "bloqueador" || q.tipo === "bloco") ay2 = (ys[0] + ys[1]) / 2;
        if (!rotular(D, ax2, ay2, l.marca.replace(P.marca + "-", ""), areaQ, 46)) falhou++;
      });
      if (falhou) c.avisos.push("Painel " + P.marca + ": " + falhou + " rótulo(s) de marca sem lugar livre na elevação (a marca consta da lista de corte).");
      /* ---- tabela de corte */
      var tx, ty;
      if (direita) { tx = fx1 + 24; ty = fy0 - 8; } else { tx = a.x + 2; ty = oy1 + 24 + 6; }
      D.texto(tx, ty - 3.2, "LISTA DE CORTE DO PAINEL " + P.marca, T.nota * 1.1, { peso: 0.06 });
      D.tabela(tx, ty, colunasTabela(), linhasTabela(ct), { fs: T.tabela });
      var yFim = Math.max(ty + tab.h, oy1 + 24);
      D.texto(tx, ty + tab.h + 5.4, "Marcas iguais = peças iguais (mesma seção e corte). CH = chumbador na guia inferior; HD = hold-down (esquema: modelo e capacidade pelo cálculo).", T.nota * 0.92);
      colocar(D, fx1 + 20, fy1 + 3.2, "FUNDAÇÃO", T.nota * 0.84, 16);
      if (yFim > a.y + a.h + 0.01 || (!direita && ty + tab.h + 8 > a.y + a.h)) c.avisos.push("Painel " + P.marca + ": o desenho passa da área da folha na escala 1:" + esc + ".");
      return { escala: "1:" + esc };
    };
  }
  /* a escala que cabe: 1:25 → 1:50 → 1:100 (largura da elevação + tabela, altura das duas faixas) */
  function escalaDoPainel(P, geo, E) {
    var a = geo.area, Le = P.res.L, H = P.res.H, D = new I.Desenho(E, null), tab = I.medirTabela(D, colunasTabela(), linhasTabela(P.corte), { fs: E.T.tabela }), i;
    for (i = 0; i < ESCALAS_EL.length; i++) {
      var s = 1000 / ESCALAS_EL[i], fw = Le * s, wTot = 30 + fw + 24 + 16, hFaixas = 12 + 36 + H * s + 5 + 18 + 18 + H * s + 16;
      var direita = 30 + fw + 24 + tab.w <= a.w - 3, hTot = direita ? hFaixas : hFaixas + 30 + tab.h;
      if (wTot <= a.w - 3 && hTot <= a.h - 4) return ESCALAS_EL[i];
    }
    return ESCALAS_EL[ESCALAS_EL.length - 1];
  }

  /* ================================================================== FOLHA: PLANTA DE PAINÉIS */
  var ESCALAS_PL = [25, 50, 75, 100, 125, 150, 200, 250, 300];
  function colunasQuadro() { return [{ t: "PAINEL" }, { t: "PAREDE" }, { t: "TIPO", al: "E" }, { t: ["COMP.", "cm"] }, { t: ["ALT.", "cm"] }, { t: ["ESP.", "mm"] }, { t: "VÃOS" }, { t: "PEÇAS" }, { t: ["MADEIRA", "m³"] }, { t: ["OSB", "chapas"] }]; }
  function linhasQuadro(lista) {
    return lista.map(function (P) {
      return [P.marca, P.parede, P.tipo, cmT(P.res.L), cmT(P.res.H), br(P.res.t * 1000, 1), String(P.res.vaos.length), String(P.corte.totais.pecas), br(P.corte.totais.vol_m3, 3), String(P.corte.totais.osbChapas)];
    });
  }
  function caixaMundo(lista) {
    var xs = [], zs = [];
    lista.forEach(function (P) { var pose = P.res.parede, co = Math.cos(pose.rotY), si = Math.sin(pose.rotY), L = pose.comprimento, hw = P.res.t / 2;
      [[0, -hw], [L, -hw], [L, hw], [0, hw]].forEach(function (p) { var u = p[0] - L / 2, w = p[1]; xs.push(pose.cx + u * co + w * si); zs.push(pose.cz - u * si + w * co); }); });
    return { x0: Math.min.apply(null, xs), x1: Math.max.apply(null, xs), z0: Math.min.apply(null, zs), z1: Math.max.apply(null, zs) };
  }
  function folhaPlanta(lista, nivel, nTotal) {
    return function (c) {
      var D = c.D, a = c.geo.area, T = D.E.T, cx = caixaMundo(lista), ww = cx.x1 - cx.x0, hh = cx.z1 - cx.z0, i;
      var quadro = linhasQuadro(nTotal), tab = I.medirTabela(D, colunasQuadro(), quadro, { fs: T.tabela });
      var tit = 12, esc = null, tabAbaixo = false, k;
      var margem = 34;
      for (k = 0; k < ESCALAS_PL.length && !esc; k++) { var s = 1000 / ESCALAS_PL[k]; if (ww * s + 2 * margem <= a.w - tab.w - 30 && hh * s + 2 * margem + tit <= a.h - 4) esc = ESCALAS_PL[k]; }
      if (!esc) { tabAbaixo = true; for (k = 0; k < ESCALAS_PL.length && !esc; k++) { var s2 = 1000 / ESCALAS_PL[k]; if (ww * s2 + 2 * margem <= a.w - 4 && hh * s2 + 2 * margem + tit + tab.h + 14 <= a.h - 4) esc = ESCALAS_PL[k]; } }
      if (!esc) { esc = ESCALAS_PL[ESCALAS_PL.length - 1]; c.avisos.push("Planta de painéis: não coube em nenhuma escala padrão."); }
      tit = I.tituloVista(D, a.x + 2, a.y + 2, "PLANTA DE PAINÉIS - " + (nivel === "n0" ? "NÍVEL TÉRREO" : "NÍVEL " + String(nivel).toUpperCase()), "ESCALA 1:" + esc + "  -  CORTE A 1,00 m DO PISO", null);
      var s3 = 1000 / esc, ox = a.x + margem - cx.x0 * s3, oy = a.y + tit + margem - cx.z0 * s3;
      function PT(x, z) { return [ox + x * s3, oy + z * s3]; }
      lista.forEach(function (P) {
        var pl = W.planta(P.c, P.vaos, 1.0); if (!pl) return;
        var camadas = pl.itens.filter(function (it) { return it.k === "camada"; }), ids = [];
        camadas.forEach(function (it) { D.poli(it.pts.map(function (p) { return PT(p[0], p[1]); }), "MAD-FINA", true); });
        camadas.forEach(function (it) { if (ids.indexOf(it.camada) < 0) ids.push(it.camada); });
        var nSeg = camadas.filter(function (it) { return it.camada === ids[0]; }).length, sg;
        for (sg = 0; sg < nSeg; sg++) {
          var xs = [], zs = [];
          ids.forEach(function (idc, j) { var it = camadas[j * nSeg + sg]; if (it) it.pts.forEach(function (p) { xs.push(p[0]); zs.push(p[1]); }); });
          var q0 = PT(Math.min.apply(null, xs), Math.min.apply(null, zs)), q1 = PT(Math.max.apply(null, xs), Math.max.apply(null, zs));
          D.poli([[q0[0], q0[1]], [q1[0], q0[1]], [q1[0], q1[1]], [q0[0], q1[1]]], "MAD-PECA", true);
        }
        pl.itens.filter(function (it) { return it.k === "montante"; }).forEach(function (it) { D.poli(it.pts.map(function (p) { return PT(p[0], p[1]); }), "MAD-FINA", true); });
      });
      /* número do painel (fora da parede) e sentido de montagem (dentro) */
      var legendas = [];
      lista.forEach(function (P) {
        var pose = P.res.parede, co = Math.cos(pose.rotY), si = Math.sin(pose.rotY), sgn = pose.inverterFaces ? -1 : 1, hw = P.res.t / 2;
        var dU = [co, -si], nIn = [sgn * si, sgn * co], nOut = [-nIn[0], -nIn[1]];
        var cen = PT(pose.cx, pose.cz), br0 = D.raioBalao(P.marca);
        function lado(n, dist, desl) { return [cen[0] + n[0] * dist + dU[0] * desl, cen[1] + n[1] * dist + dU[1] * desl]; }
        var okB = false, dist = hw * s3 + br0 + 3.6, tent = [0, 12, -12, 24, -24, 36, -36, 48, -48];
        for (var ti = 0; ti < tent.length && !okB; ti++) for (var dj = 0; dj < 3 && !okB; dj++) {
          var pp = lado(nOut, dist + dj * 5, tent[ti]);
          if (D.livre([pp[0] - br0 - 0.6, pp[1] - br0 - 0.6, pp[0] + br0 + 0.6, pp[1] + br0 + 0.6], 0.3)) { D.balao(pp[0], pp[1], P.marca, ' data-painel="' + P.marca + '"'); okB = true; }
        }
        if (!okB) c.avisos.push("Planta de painéis: o número " + P.marca + " ficou sem lugar livre.");
        var Lw = pose.comprimento * s3, aL = Math.min(Lw * 0.30, 28), p0 = lado(nIn, hw * s3 + 4.0, -aL / 2), p1 = lado(nIn, hw * s3 + 4.0, aL / 2);
        if (D.livre([Math.min(p0[0], p1[0]) - 0.5, Math.min(p0[1], p1[1]) - 0.5, Math.max(p0[0], p1[0]) + 0.5, Math.max(p0[1], p1[1]) + 0.5], 0.1)) {
          D.linha(p0[0], p0[1], p1[0], p1[1], "MAD-PRINCIPAL"); D.seta(p1[0], p1[1], dU[0], dU[1], 2.4);
          colocar(D, p0[0] - dU[0] * 3.0, p0[1] - dU[1] * 3.0, "A", T.nota * 0.92, 7);
          colocar(D, p1[0] + dU[0] * 5.6, p1[1] + dU[1] * 5.6, "B", T.nota * 0.92, 7);
        }
      });
      /* vãos: marcação no corte (porta e janela) */
      lista.forEach(function (P) {
        var pose = P.res.parede, co = Math.cos(pose.rotY), si = Math.sin(pose.rotY), sgn = pose.inverterFaces ? -1 : 1, L = pose.comprimento;
        P.res.vaos.forEach(function (v) {
          var um = (v.x0 + v.x1) / 2 - L / 2 + 0; um = (v.x0 + v.x1) / 2 - L / 2;
          var wx = pose.cx + um * co, wz = pose.cz - um * si, p = PT(wx, wz), tx = (v.porta ? "P" : "J") + String(v.id).replace(/^.*-/, "");
          var nIn = [sgn * si, sgn * co], q = [p[0] + nIn[0] * (P.res.t / 2 * s3 + 8.4), p[1] + nIn[1] * (P.res.t / 2 * s3 + 8.4)];
          var w = lg(D, tx, T.nota * 0.92) + 0.8;
          if (D.livre([q[0] - w / 2, q[1] - 2, q[0] + w / 2, q[1] + 1.4], 0.3)) D.texto(q[0], q[1], tx, T.nota * 0.92, { al: "C" });
        });
      });
      /* quadro de painéis */
      var tx = tabAbaixo ? a.x + 2 : a.x + a.w - tab.w - 2, ty = tabAbaixo ? a.y + a.h - tab.h - 4 : a.y + tit + 12;
      D.texto(tx, ty - 3.2, "QUADRO DE PAINÉIS", T.nota * 1.1, { peso: 0.06 });
      D.tabela(tx, ty, colunasQuadro(), quadro, { fs: T.tabela });
      var yl = ty + tab.h + 8;
      ["Seta = sentido de montagem: ponta A (início da parede no modelador) para a ponta B.", "Ordem de montagem: P01, P02, … (a ordem do modelo). Elevação de cada painel na sua folha.", "Número do painel no balão, fora da parede; P e J = porta e janela.", "Planta cortada a 1,00 m do piso: camadas do tipo de parede e montantes na posição real."].forEach(function (t, k2) { D.texto(tx, yl + k2 * 4.4, t, T.nota * 0.92); });
      return { escala: "1:" + esc, _esc: esc };
    };
  }

  /* ================================================================== FOLHAS: LISTA DE CORTE CONSOLIDADA */
  function colunasSecao() { return [{ t: ["SEÇÃO FINAL", "mm"] }, { t: ["COMPRA", "bruta mm"] }, { t: "PEÇAS" }, { t: ["COMPRIMENTO", "total m"] }, { t: ["VOLUME final / bruta", "m³"] }]; }
  function colunasConsol() { return [{ t: "PEÇA", al: "E" }, { t: ["SEÇÃO", "mm"] }, { t: ["COMP.", "mm"] }, { t: "QTD" }, { t: ["VOL. final / bruta", "m³"] }, { t: "PAINÉIS", al: "E" }]; }
  function linhasConsol(cs) { return cs.linhas.map(function (l) { return [l.nome, secTxt(l.secao), String(l.comp_mm), String(l.qtd), br(l.vol_m3, 4) + " / " + br(l.vol_bruta_m3, 4), l.paineis.join(", ")]; }); }
  function folhasConsolidado(cs, nTotal) {
    var out = [], cols = colunasConsol(), linhas = linhasConsol(cs);
    return { linhas: linhas, cols: cols };
  }
  function defsConsolidado(cs, estilo, geo) {
    var D0 = new I.Desenho(estilo, null), T = estilo.T, hl = Math.max(4.4, T.tabela * 1.85), a = geo.area;
    var secL = cs.secoes.map(function (s) { return [secTxt(s.secao), s.compra ? secTxt(s.compra) : "-", String(s.pecas), br(s.comp_m, 2), br(s.vol_m3, 4) + " / " + br(s.vol_bruta_m3, 4)]; });
    secL.push({ total: ["TOTAL", "", String(cs.totais.pecas), br(cs.totais.comp_m, 2), br(cs.totais.vol_m3, 4) + " / " + br(cs.totais.vol_bruta_m3, 4)] });
    var secT = I.medirTabela(D0, colunasSecao(), secL, { fs: T.tabela });
    var linhas = linhasConsol(cs), cab = I.medirTabela(D0, colunasConsol(), [], { fs: T.tabela }).h;
    var topo = 14 + secT.h + 14, cap1 = Math.max(1, Math.floor((a.h - topo - cab - 6) / hl)), capN = Math.max(1, Math.floor((a.h - 24 - cab - 6) / hl));
    var paginas = [], rest = linhas.slice();
    paginas.push(rest.splice(0, cap1));
    while (rest.length) paginas.push(rest.splice(0, capN));
    return { secL: secL, secT: secT, paginas: paginas, tit: "LISTA DE CORTE CONSOLIDADA DA OBRA" };
  }
  function folhaConsol(cs, def, k) {
    return function (c) {
      var D = c.D, a = c.geo.area, T = D.E.T, nP = def.paginas.length;
      var th = I.tituloVista(D, a.x + 2, a.y + 2, def.tit + (nP > 1 ? " (" + (k + 1) + "/" + nP + ")" : ""), "TODOS OS PAINÉIS - MADEIRA DO QUADRO E OSB", null);
      var y = a.y + 2 + th + 4;
      if (k === 0) {
        D.texto(a.x + 2, y, "TOTAL POR SEÇÃO", T.nota * 1.1, { peso: 0.06 });
        D.tabela(a.x + 2, y + 3.2, colunasSecao(), def.secL, { fs: T.tabela });
        var osb = cs.osb, ex = a.x + 2 + def.secT.w + 16, linhasO = [];
        osb.itens.forEach(function (it) { linhasO.push(["OSB " + br(num(it.e, 0), 1) + " mm (" + it.modulo + ")", String(it.chapas) + " chapas"]); });
        linhasO.push({ total: ["RECORTES (peças de OSB)", String(osb.recortes)] }); linhasO.push(["ÁREA LÍQUIDA DE OSB", br(osb.area_m2, 2) + " m²"]);
        if (cs.espacadores) linhasO.push(["ESPAÇADORES DE VERGA", String(cs.espacadores) + " un"]);
        D.texto(ex, y, "OSB E ESPAÇADORES", T.nota * 1.1, { peso: 0.06 });
        D.tabela(ex, y + 3.2, [{ t: "ITEM", al: "E" }, { t: "TOTAL" }], linhasO, { fs: T.tabela });
        y += 3.2 + def.secT.h + 12;
      }
      D.texto(a.x + 2, y, "PEÇAS DE MADEIRA POR TIPO, SEÇÃO E COMPRIMENTO DE CORTE", T.nota * 1.1, { peso: 0.06 });
      D.tabela(a.x + 2, y + 3.2, colunasConsol(), def.paginas[k], { fs: T.tabela });
      return { escala: "S/ESC." };
    };
  }

  /* ================================================================== ORQUESTRAÇÃO */
  var DET = null;      /* detalhes típicos: js/woodframedetalhes.js (preenchido abaixo, por dep) */
  function gerar(estado, opcoes) {
    opcoes = opcoes || {}; var avisos = [];
    resolver();
    if (!W || !EP || !Q || !I) return { ok: false, folhas: [], avisos: ["js/woodframequadro.js ou js/madengpranchas.js não carregou."] };
    var P0 = Q.PR(); if (!P0 || !P0.carimboRA) return { ok: false, folhas: [], avisos: ["Motor de pranchas (js/prancha.js) não carregado."] };
    var pn = paineis(estado, opcoes);
    avisos = avisos.concat(pn.avisos);
    if (!pn.lista.length) return { ok: false, folhas: [], avisos: avisos.concat(["Não há parede de Wood Frame no modelo: nada para as pranchas."]), paineis: [] };
    pn.lista.forEach(function (P) { P.corte = corteDe(P); });
    var cs = consolidar(pn.lista);
    var E = I.estilo(opcoes.padrao);
    Object.keys(Q.PADRAO_ENG.base).forEach(function (k) { var b = E.camadas[Q.PADRAO_ENG.base[k]]; E.camadas[k] = { mm: b.mm, dash: b.dash, cor: b.cor }; });
    var formato = P0.FORMATOS[opcoes.formato] ? opcoes.formato : "A1", geo = P0.geometria(formato, "paisagem", "RA");
    var codigo = Q.txt(opcoes.codigo).trim() || "EST-MAD-WF", rev = (Q.txt(opcoes.revisao).trim() || "R00").toUpperCase(), data = Q.txt(opcoes.data).trim() || Q.hoje();
    var ctx0 = { E: E, geo: geo, op: opcoes, rev: rev, avisos: avisos, paineis: pn.lista, consolidado: cs };
    var ORDEM = [], niveis = [];
    pn.lista.forEach(function (P) { if (niveis.indexOf(P.nivel) < 0) niveis.push(P.nivel); });
    niveis.forEach(function (nv, i) {
      var sub = pn.lista.filter(function (P) { return P.nivel === nv; });
      ORDEM.push(["WF" + pad2(ORDEM.length + 1), "planta" + (niveis.length > 1 ? "-" + (i + 1) : ""), folhaPlanta(sub, nv, pn.lista), null, "PLANTA DE PAINÉIS" + (niveis.length > 1 ? " - NÍVEL " + String(nv).toUpperCase() : "") + " - NUMERAÇÃO E SENTIDO DE MONTAGEM"]);
    });
    pn.lista.forEach(function (P) {
      var esc = escalaDoPainel(P, geo, E); P.escala = esc;
      ORDEM.push(["WF" + pad2(ORDEM.length + 1), "painel-" + P.marca.toLowerCase(), folhaPainel(P, esc), null, "PAINEL " + P.marca + " - ELEVAÇÃO, OSB E LISTA DE CORTE"]);
    });
    var defC = defsConsolidado(cs, E, geo);
    defC.paginas.forEach(function (p, k) { ORDEM.push(["WF" + pad2(ORDEM.length + 1), "consolidado" + (defC.paginas.length > 1 ? "-" + (k + 1) : ""), folhaConsol(cs, defC, k), null, "LISTA DE CORTE CONSOLIDADA DA OBRA" + (defC.paginas.length > 1 ? " (" + (k + 1) + "/" + defC.paginas.length + ")" : "")]); });
    var DETm = dep("WoodFrameDetalhes", "./woodframedetalhes.js"), detRes = null;
    if (DETm) {
      try { detRes = DETm.defs(estado, pn.lista, opcoes); detRes.defs.forEach(function (d) { ORDEM.push(["WF" + pad2(ORDEM.length + 1), d[0], d[1], null, d[2]]); }); avisos = avisos.concat(detRes.avisos || []); }
      catch (e) { avisos.push("Detalhes típicos: " + e.message); }
    } else avisos.push("Detalhes típicos: js/woodframedetalhes.js não carregou.");
    var feitas = [];
    ORDEM.forEach(function (def, i) {
      var D = new I.Desenho(E, opcoes.depurar ? [] : null), c = {}, resF = {}; Object.keys(ctx0).forEach(function (k) { c[k] = ctx0[k]; }); c.D = D; c.rotulo = pad2(i + 1);
      try { resF = def[2](c) || {}; } catch (e) { avisos.push("Folha " + def[0] + ": " + (e && e.message ? e.message : String(e)) + (e && e.stack ? " @ " + String(e.stack).split("\n")[1] : "")); D.texto(geo.area.x + 10, geo.area.y + 20, "ERRO AO DESENHAR ESTA FOLHA - ver avisos", E.T.titulo, { cor: VERMELHO }); }
      feitas.push({ def: def, D: D, escala: resF.escala || "INDICADA", rotulo: c.rotulo, titulo: def[4] });
    });
    var emp = opcoes.empresa, empObj = emp && typeof emp === "object" ? emp : null, revNum = rev.replace(/^R/i, "") || "00";
    var pr = P0.normalizar({ id: "woodframepranchas", nome: "Wood Frame - painéis, lista de corte e detalhes típicos", formato: formato, orientacao: "paisagem", origem: "madeira",
      carimbo: { modelo: "RA", empresa: empObj ? "" : Q.txt(emp), responsavel: Q.txt(opcoes.responsavel), registro: Q.txt(opcoes.registro), titulo: Q.txt(opcoes.tituloProfissional), obra: Q.txt((opcoes.preliminar ? "PRELIMINAR — NÃO ATENDE — " : "") + (opcoes.obra || "")), proprietario: Q.txt(opcoes.proprietario),
        contratante: Q.txt(opcoes.contratante), local: Q.txt(opcoes.local), codigo: codigo, data: data, revisoes: [[revNum, Q.txt(opcoes.descricaoRevisao) || "EMISSÃO INICIAL - PAINÉIS E DETALHES", data]] },
      folhas: feitas.map(function (f, i) { return { id: f.def[1], n: i + 1, conteudo: f.titulo, escala: f.escala, numero: codigo + " " + rev }; }) });
    var notas = [
      { t: "Wood Frame (quadro leve de madeira). Cotas em centímetros, níveis em metros; seções e comprimentos de corte em milímetros. Não medir no desenho." },
      { t: "Elevação vista pelo lado interno (quadro à vista, OSB atrás). Ponta A = início da parede no modelo; B = fim. Cotas acumuladas a partir da ponta de origem do alinhamento." },
      { t: "Marca da peça: <painel>-<tipo><n>. Peças de mesma marca são iguais (seção e corte). Bruta = seção de compra do catálogo; final = beneficiada, premissa a confirmar com o fornecedor." },
      { t: "Vergas pré-dimensionadas por tabela RA (a confirmar no cálculo: NBR 7190-1:2022 e Diretriz SINAT nº 005). Chumbador e hold-down: esquema; diâmetro, modelo e capacidade pelo cálculo." },
      { t: "Sem código SINAPI: nenhum item de Wood Frame tem composição neste sistema (orçar à parte)." },
      { t: "VERMELHO = o que impede emitir: junta de OSB fora do montante, vão fora da tabela." }];
    var blocos = [{ titulo: "NOTAS GERAIS", itens: notas }];
    var camadas = {}; Object.keys(Q.MP.PADRAO_MAD.camadas).forEach(function (k) { camadas[k] = Q.MP.PADRAO_MAD.camadas[k]; }); Object.keys(Q.PADRAO_ENG.layers).forEach(function (k) { camadas[k] = Q.PADRAO_ENG.layers[k]; });
    var folhas = feitas.map(function (f, i) {
      var D = f.D, fl = pr.folhas[i], Wp = geo.papel.w, Hp = geo.papel.h, M = geo.moldura, Fd = new I.Desenho(E, null);
      Fd.ret(M.x, M.y, M.w, M.h, "MAD-MOLDURA");
      try { I.colunaNotas(Fd, geo, blocos); } catch (e) { avisos.push("Notas: " + e.message); }
      var rotuloFolha = f.rotulo + "/" + pad2(feitas.length); I.carimbo(Fd, pr, fl, geo, empObj, opcoes.logo || null, rotuloFolha);
      var numero = codigo + "-" + f.def[0];
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + I.n(Wp) + 'mm" height="' + I.n(Hp) + 'mm" viewBox="0 0 ' + I.n(Wp) + " " + I.n(Hp) + '" font-family="' + I.FONTE + '" data-folha="' + f.def[1] + '" data-numero="' + I.esc(numero) + '">' +
        "<title>" + I.esc(numero + " - " + f.titulo + " - " + rev) + "</title>" + '<rect x="0" y="0" width="' + I.n(Wp) + '" height="' + I.n(Hp) + '" fill="#fff"/>' + '<g data-corpo="1">' + D.svg() + "</g>" + Fd.svg() + '<text x="' + I.n(Wp / 2) + '" y="7" font-size="3" text-anchor="middle" fill="#c00000" data-faixa="1">' + I.esc((opcoes.preliminar ? "PRELIMINAR — NÃO ATENDE — " : "") + Q.FAIXA) + "</text></svg>";
      var o = { id: f.def[1], rotulo: f.rotulo, numero: numero, titulo: f.titulo, formato: formato, escala: f.escala, svg: svg, rotuloCarimbo: rotuloFolha };
      o.dxf = { familia: "madeira", pr: pr, folha: fl, geo: geo, empresa: empObj, rotulo: rotuloFolha, logo: !!opcoes.logo, padrao: opcoes.padrao || null, camadas: camadas, tituloH: E.T.titulo, codigo: codigo };
      if (opcoes.depurar) o.caixasTexto = D.caixas;
      return o;
    });
    folhas.forEach(function (f) { if (/NaN|undefined/.test(f.svg)) avisos.push("Folha " + f.numero + ": há valor inválido (NaN/undefined) no desenho."); });
    var marcas = {}; pn.lista.forEach(function (P) { marcas[P.parede] = P.marca; });
    return { ok: true, folhas: folhas, avisos: avisos, paineis: pn.lista.map(function (P) { return { marca: P.marca, parede: P.parede, nivel: P.nivel, escala: P.escala, espelho: P.espelho }; }),
      corte: pn.lista.map(function (P) { return P.corte; }), consolidado: cs, detalhes: detRes ? detRes.info : null, marcas: marcas, _lista: pn.lista };
  }

  var WoodFramePranchas = { gerar: gerar, paineis: paineis, corteDe: corteDe, consolidar: consolidar, NOME: NOME, PREF: PREF, _i: { acharLugar: acharLugar, rotular: rotular, colocar: colocar, tracoRuptura: tracoRuptura, cmT: cmT, lg: lg } };
  if (typeof module !== "undefined" && module.exports) module.exports = WoodFramePranchas; else global.WoodFramePranchas = WoodFramePranchas;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
