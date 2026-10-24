/* =====================================================================
 * elepranchas.js — PRANCHAS e MEMORIAL dos CIRCUITOS ELÉTRICOS (frente E2, 21/10/2026). Motor PURO, ES5, sem DOM.
 *
 *   ElePranchas.gerar(analise, opcoes) → { ok, folhas: [{ id, rotulo, numero, titulo, formato, escala, svg, caixasTexto }], avisos, verificacao }
 *       analise = EleCircuitos.analisar(...) (o projeto gravado no quadro, ou o recém-calculado)
 *       opcoes  = { formato ("A1"), codigo ("ELE"), revisao, data, empresa, responsavel, registro, obra, proprietario, contratante, local, logo }
 *   ElePranchas.exportar(r, "pdf" | "svg" | "dxf")
 *   ElePranchas.memorial(analise, opcoes) → { titulo, secoes: [{ titulo, itens[] }], html, texto }
 *
 * O jogo (padrão RA de prancha ELÉTRICA v1.0 — seção "eletrica" do padrao_detalhamento_ra.json, criada nesta frente pela regra
 * "tipo sem padrão = pesquisar, criar e aplicar"; docs/eletrica/PADRAO-PRANCHA-ELETRICA.md):
 *   ELE-01  QUADRO DE CARGAS do QD (circuito, função, tensão/fases, pontos, potência, IB, método, agrupamento, seção, Iz corrigida,
 *           disjuntor, DR, comprimento, queda) + resumo da DEMANDA (CEMIG ND-5.1 8.2.3) e do PADRÃO DE ENTRADA (Tabelas 1/2)
 *   ELE-02  DIAGRAMA UNIFILAR do QD (entrada → alimentador → geral → DPS → barramento → DR → disjuntor → circuito)
 * Simbologia: a de uso corrente da NBR 5444:1989 (CANCELADA em 11/2014, sem substituta — a ABNT remete à IEC 60617, NÃO lida): as
 * caixas do unifilar levam o texto do dispositivo, para não depender do símbolo.
 * PADRÃO: papel, moldura e CARIMBO RA do js/prancha.js (o carimbo não muda); letra, tabela e título do js/acopranchas.js; TODA folha
 * sai com a conferência de sobreposição de texto (regra da RA). O que o cálculo não fechou sai em VERMELHO ("não verificado: …").
 * ⚠ NBR 5410:2004 lida numa cópia NÃO licenciada à RA, sem a Errata 1/2008: a coluna de NOTAS traz a ressalva em toda folha.
 * Teste: node tools/test-ele-pranchas.js
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function PR() { return dep("Prancha", "./prancha.js"); }
  function AP() { return dep("AcoPranchas", "./acopranchas.js"); }
  function TB() { return dep("EleTabelas", "./eletabelas.js"); }
  function PDF() { return dep("SvgPdf", "./svgpdf.js"); }
  function DXF() { return dep("BimDxf", "./bimdxf.js"); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function n(v) { return fin(v) ? String(Math.round(v * 1000) / 1000) : "NaN"; }
  function esc(s) { return txt(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function br(v, c) { if (!fin(v)) return "-"; var k = Math.pow(10, c == null ? 2 : c); return (Math.round(v * k) / k).toFixed(c == null ? 2 : c).replace(".", ","); }
  function sec(S) { return fin(S) ? String(S).replace(".", ",") : "-"; }
  function dois(k) { return ("0" + k).slice(-2); }
  function hoje() { var d = new Date(); return dois(d.getDate()) + "/" + dois(d.getMonth() + 1) + "/" + d.getFullYear(); }
  var FONTE = "RomanS, ISOCPEUR, Arial, Helvetica, sans-serif";

  /* geometria de DESENHO (mm de papel) — não é norma */
  var K2 = { hPeq: 2.1, h: 2.5, base: 0.76, titulo: 16, vermelho: "#c00000", tb: { padX: 1.4, padY: 1.1, linhaH: 1.4 },
    uni: { linha: 8.5, xEnt: 8, wCx: 40, hCx: 13, wDr: 36, wDisj: 26 },
    notaLinha: 1.42, notaEntre: 0.7, blocoEntre: 3.5, letraDxf: 0.7, parEx: 5, parAviso: 3 };

  function estilo() {
    var A = AP(), E = A.estilo();
    function cam(nome, mm, cor, dash) { E.camadas[nome] = { mm: mm, dash: dash || null, cor: cor || "#000" }; }
    cam("ELE-BARRA", 0.7); cam("ELE-CIRC", 0.35); cam("ELE-SIMBOLO", 0.25); cam("ELE-TEXTO", 0.18); cam("ELE-TABELA", 0.25); cam("ELE-TITULO", 0.35);
    cam("ELE-MOLDURA", 0.5); cam("ELE-QD", 0.35, "#000", "6 2"); cam("ELE-ARQ", 0.25, "#7a7a7a"); cam("ELE-ELETRODUTO", 0.35); cam("ELE-ELETRODUTO-PISO", 0.35, "#000", "3 1.5"); cam("ELE-PONTO", 0.25); cam("ELE-PE", 0.25, "#1B7F3B", "4 1.5"); cam("ELE-PEND", 0.25, K2.vermelho, "3 1.5");
    E.camadas["MET-TABELA"] = E.camadas["ELE-TABELA"]; E.camadas["MET-TITULO"] = E.camadas["ELE-TITULO"]; E.camadas["MET-FINA"] = E.camadas["ELE-TEXTO"];
    return E;
  }
  function L(D, x1, y1, x2, y2, cam) { D.linha(x1, y1, x2, y2, cam, ' data-cam="' + cam + '"'); }
  function R(D, x, y, w, h, cam) { D.ret(x, y, w, h, cam, ' data-cam="' + cam + '"'); }
  function T(D, x, y, s, h, o) { o = o || {}; o.attr = (o.attr || "") + ' data-cam="' + (o.cor ? "ELE-PEND" : "ELE-TEXTO") + '"'; return D.texto(x, y, s, h, o); }

  /* ------------------------------------------------------------ ELE-01: QUADRO DE CARGAS */
  var COLS = [["CIRC.", 0.045], ["DESCRIÇÃO", 0.17], ["TENSÃO / FASES", 0.06], ["PONTOS", 0.04], ["POTÊNCIA (VA)", 0.055], ["IB (A)", 0.045], ["MÉTODO (TAB. 33)", 0.06],
    ["CIRC. NO ELETRODUTO / FA", 0.07], ["FT", 0.03], ["SEÇÃO F / PE (mm²)", 0.065], ["IZ CORRIGIDA (A)", 0.055], ["DISJUNTOR (A / POLOS)", 0.065], ["DR 30 mA", 0.045], ["L (m)", 0.04], ["QUEDA (%)", 0.045], ["SITUAÇÃO", 0.11]];
  function tabela(D, A0, x, y, W, cab, linhas, h) {
    var ws = cab.map(function (c) { return c[1] * W; }), xs = [x]; ws.forEach(function (w) { xs.push(xs[xs.length - 1] + w); });
    var TBk = K2.tb;
    function linha(cels, forte, pend) {
      var qs = cels.map(function (t, i) { return A0.quebrar(txt(t), h, ws[i] - 2 * TBk.padX); }), hl = Math.max.apply(null, qs.map(function (q) { return q.length; }).concat([1])) * h * TBk.linhaH + 2 * TBk.padY;
      cels.forEach(function (t, i) {
        R(D, xs[i], y, ws[i], hl, "ELE-TABELA");
        qs[i].forEach(function (s, q) { T(D, xs[i] + TBk.padX, y + TBk.padY + h * K2.base + q * h * TBk.linhaH, s, h, { peso: forte ? 0.16 : undefined, cor: pend && pend[i] ? K2.vermelho : undefined }); });
      });
      y += hl;
    }
    linha(cab.map(function (c) { return c[0]; }), true);
    linhas.forEach(function (l) { linha(l.cel, l.forte, l.pend); });
    return y;
  }
  function folhaQuadro(c) {
    var D = c.D, a = c.geo.area, A0 = AP(), Tb = TB(), Z = c.A, h = K2.hPeq, y = a.y + 2;
    y += A0.tituloVista(D, a.x + 4, y, "QUADRO DE CARGAS - " + c.qdNome, "TABELA - SEM ESCALA") + 2;
    var linhas = [], tot = { va: 0 }, porFase = {};
    Z.circuitos.forEach(function (ci) {
      var d = ci.dim, ok = d.ok && !ci.semRota.length, sit = [];
      if (!d.ok) sit.push("NÃO ATENDE: " + d.motivos.join("; "));
      if (ci.semRota.length) sit.push("não verificado: falta eletroduto (" + ci.semRota.length + " ponto(s), L estimado)");
      if (arr(ci.pontos).some(function (id) { return Z.existe[id] && Z.existe[id].potPendente; })) sit.push("não verificado: falta a potência da placa");
      linhas.push({ cel: [ci.id, ci.nome, (ci.tensao || "") + " V " + (ci.fases || "?"), ci.pontos.filter(function (id) { return Z.existe[id] && Z.existe[id].kind !== "interruptor"; }).length, br(d.va, 0), br(d.ib, 2),
        d.metodo.ref + " (nº " + d.metodo.metodo + ", " + d.metodo.apl + ")", d.nAgrup + " / " + br(d.fa, 2) + (d.desprezado ? " (6.2.5.5.2)" : ""), br(d.ft, 2), sec(d.secao) + " / " + sec(d.pe), br(d.izc, 1),
        (d.In || "-") + " / " + ci.polos + "P", ci.drId || "-", br(d.L, 1) + (d.estimado ? " (est.)" : ""), br(d.dv, 2), sit.length ? sit.join("; ") : "atende"],
        pend: [0, 0, !ci.fases, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, d.estimado, !d.ok, sit.length > 0] });
      tot.va += d.va;
      if (ci.fases) ci.fases.split("").forEach(function (f) { porFase[f] = (porFase[f] || 0) + d.va / ci.fases.length; });
    });
    linhas.push({ cel: ["", "TOTAL INSTALADO", "", "", br(tot.va, 0), "", "", "", "", "", "", "", "", "", "", Object.keys(porFase).sort().map(function (f) { return "fase " + f + ": " + br(porFase[f], 0) + " VA"; }).join("; ")], forte: true });
    y = tabela(D, A0, a.x + 4, y, a.w - 8, COLS, linhas, h) + 6;
    /* resumo: demanda, entrada, geral, alimentador, DR, DPS, quadro */
    var dm = Z.demanda, en = dm.entrada, x = a.x + 4, wCol = (a.w - 8) / 2 - 3;
    var esq = [
      "POTÊNCIA INSTALADA: " + br(dm.cargaInstalada_kW, 2) + " kW (iluminação e tomadas " + br(dm.luzTomadas_kW, 2) + " kW)",
      "DEMANDA (CEMIG ND-5.1 8.2.3): a = " + br(dm.a, 2) + " (FD " + br(dm.fdLuzTomadas, 2) + ", Tabela 10) · b1 = " + br(dm.b1, 2) + " · b3 = " + br(dm.b3, 2) + " · b4 = " + br(dm.b4, 2) + " · b5 = " + br(dm.b5, 2) + " · c = " + br(dm.c, 2) + " · d = " + br(dm.d, 2) + "  →  D = " + br(dm.demanda_kVA, 2) + " kVA",
      dm.tipo ? "FORNECIMENTO: tipo " + dm.tipo + " (" + dm.motivoTipo + ")" : "FORNECIMENTO: não verificado — " + dm.motivoTipo,
      en ? "PADRÃO DE ENTRADA (" + en.tabela + "): faixa " + en.faixa + " · disjuntor IEC " + en.disjuntor_A + " A · cobre " + en.condutor_mm2 + " mm² · eletroduto PVC " + en.eletrodutoPVC_mm + " mm · " + en.hastes + " haste(s) · aterramento Cu nu " + en.aterramento_mm2 + " mm² · PE " + en.pe_mm2 + " mm² (mínimos)" : "PADRÃO DE ENTRADA: não verificado"
    ];
    var dir = [
      "DISJUNTOR GERAL: " + (Z.geral.In ? Z.geral.In + " A, " + Z.geral.polos + "P" : "não verificado") + " (IB de demanda " + br(Z.geral.ib, 1) + " A na fase mais carregada)",
      "ALIMENTADOR: " + (Z.alimentador.secao ? (Z.fases.fases.length + " fase(s) + N " + sec(Z.alimentador.secao) + " mm² + PE " + sec(Z.alimentador.pe) + " mm², " + br(Z.alimentador.comprimento, 1) + " m" + (Z.alimentador.provisorio ? " (PROVISÓRIO)" : "") + ", queda " + br(Z.alimentador.dv, 2) + " %") : "não verificado"),
      "DR 30 mA: " + (Z.drs.length ? Z.drs.map(function (g) { return g.id + " " + (g.In || "?") + " A " + g.polos + "P (" + g.circuitos.join(", ") + ")"; }).join(" · ") : "nenhum circuito exige"),
      "DPS: " + (Z.dps.exigido ? Z.dps.quantidade + " × classe II, Uc 175 V, In 20 kA (fases + neutro)" : "não exigido pelo critério adotado"),
      "QUADRO: " + (Z.quadroModelo ? Z.quadroModelo.espacos + " espaços (" + (Z.quadroModelo.material === "aco" ? "chapa de aço, barramento " + Z.quadroModelo.corrente : "PVC") + ", de embutir) para " + Z.modulos + " módulos com a reserva de " + Z.reserva + " (" + Tb.T59.item + ")" : "não verificado")
    ];
    var y1 = y, y2 = y;
    esq.forEach(function (s, i) { A0.quebrar(s, K2.h, wCol).forEach(function (q) { T(D, x, y1 + K2.h, q, K2.h, { cor: (i === 2 && !dm.tipo) || (i === 3 && !en) ? K2.vermelho : undefined }); y1 += K2.h * K2.notaLinha; }); y1 += K2.notaEntre; });
    dir.forEach(function (s) { A0.quebrar(s, K2.h, wCol).forEach(function (q) { T(D, x + wCol + 6, y2 + K2.h, q, K2.h, { cor: /não verificado|PROVISÓRIO/.test(q) ? K2.vermelho : undefined }); y2 += K2.h * K2.notaLinha; }); y2 += K2.notaEntre; });
    return { escala: "SEM ESCALA", yFim: Math.max(y1, y2) };
  }

  /* ------------------------------------------------------------ ELE-02: DIAGRAMA UNIFILAR */
  function alturaUnifilar(Z) { return (Z.circuitos.length + Z.drs.length) * K2.uni.linha + Z.drs.length * 2 + 52; }
  function folhaUnifilar(c, yIni) {
    var D = c.D, a = c.geo.area, A0 = AP(), Z = c.A, U = K2.uni, h = K2.h, y0 = yIni != null ? yIni : a.y + 2;
    y0 += A0.tituloVista(D, a.x + 4, y0, "DIAGRAMA UNIFILAR - " + c.qdNome, "SEM ESCALA") + 6;
    var x0 = a.x + U.xEnt, en = Z.demanda.entrada;
    /* entrada (medição) e alimentador */
    R(D, x0, y0, U.wCx, U.hCx, "ELE-SIMBOLO");
    T(D, x0 + 2, y0 + 4.5, "MEDIÇÃO CEMIG", h, { peso: 0.16 });
    T(D, x0 + 2, y0 + 9, Z.demanda.tipo ? "TIPO " + Z.demanda.tipo + (en ? " - " + en.faixa + " - " + en.disjuntor_A + " A" : "") : "não verificado", h, { cor: Z.demanda.tipo ? undefined : K2.vermelho });
    var yA = y0 + U.hCx / 2, xQ = x0 + U.wCx + 52;
    L(D, x0 + U.wCx, yA, xQ, yA, "ELE-CIRC");
    var al = Z.alimentador, tAl = al.secao ? Z.fases.fases.length + "#" + sec(al.secao) + " + N" + sec(al.secao) + " + PE" + sec(al.pe) + " mm²" : "alimentador não verificado";
    T(D, x0 + U.wCx + 3, yA - 1.6, tAl, h, { cor: al.secao ? undefined : K2.vermelho });
    T(D, x0 + U.wCx + 3, yA + 4.2, br(al.comprimento, 1) + " m" + (al.provisorio ? " (PROVISÓRIO)" : ""), h, { cor: al.provisorio ? K2.vermelho : undefined });
    /* o QD (contorno tracejado) */
    var circs = Z.circuitos, yQ = y0 - 4, wQD = a.w - (xQ - a.x) - 8, hQD = (circs.length + Z.drs.length) * U.linha + Z.drs.length * 2 + 30;
    R(D, xQ, yQ, wQD, hQD, "ELE-QD");
    T(D, xQ + 2, yQ + 4.5, c.qdNome + " - " + (Z.quadroModelo ? Z.quadroModelo.espacos + " ESPAÇOS" : "QUADRO") + (c.qdAmb ? " - " + c.qdAmb : ""), h, { peso: 0.16 });
    /* geral */
    var xG = xQ + 6;
    R(D, xG, yA - 3, 18, 6, "ELE-SIMBOLO"); T(D, xG + 9, yA + 0.8, (Z.geral.In || "?") + "A " + Z.geral.polos + "P", h, { al: "C" });
    L(D, xQ, yA, xG, yA, "ELE-CIRC");
    var xB = xQ + 60;
    L(D, xG + 18, yA, xB, yA, "ELE-CIRC");
    /* DPS (para o PE) */
    if (Z.dps.exigido) {
      var xD = xG + 26; L(D, xD, yA, xD, yA + 8, "ELE-CIRC"); R(D, xD - 6, yA + 8, 12, 6, "ELE-SIMBOLO"); T(D, xD, yA + 11.8, "DPS", h, { al: "C" });
      L(D, xD, yA + 14, xD, yA + 18, "ELE-PE"); L(D, xD - 3, yA + 18, xD + 3, yA + 18, "ELE-PE");
      T(D, xD - 7, yA + 12.4, Z.dps.quantidade + "x CL.II 175V 20kA", h, { al: "D" });
    }
    /* barramento vertical */
    var yTop = y0 + 6, yBot = yTop + (circs.length + Z.drs.length) * U.linha + 6;
    L(D, xB, Math.min(yTop, yA), xB, yBot, "ELE-BARRA");
    T(D, xB + 2, yBot + 4, "BARRAMENTO " + Z.fases.fases.join("-") + " + N + PE", h);
    /* ramais: sem DR direto no barramento; com DR, o DR e os circuitos dele */
    var y = yTop + U.linha, xDr = xB + 6, xDj = xDr + U.wDr + 12, xT = xDj + U.wDisj + 4;
    function ramal(ci, xIni) {
      var d = ci.dim;
      L(D, xIni, y, xDj, y, "ELE-CIRC");
      R(D, xDj, y - 3, U.wDisj, 6, "ELE-SIMBOLO"); T(D, xDj + U.wDisj / 2, y + 0.8, (d.In || "?") + "A " + ci.polos + "P", h, { al: "C" });
      L(D, xDj + U.wDisj, y, xT - 2, y, "ELE-CIRC");
      var s = ci.id + "  " + ci.nome + "  -  " + br(d.va, 0) + " VA  -  " + (ci.tensao || "") + " V " + (ci.fases || "?") + "  -  " + sec(d.secao) + " mm² + PE " + sec(d.pe) + " mm²" + (d.ok ? "" : "  -  NÃO ATENDE");
      var wmax = a.x + a.w - 6 - xT, ls = A0.quebrar(s, h, wmax);
      T(D, xT, y + 0.8, ls[0], h, { cor: d.ok ? undefined : K2.vermelho });
      y += U.linha * Math.max(1, ls.length > 1 ? 1.5 : 1);
      if (ls.length > 1) T(D, xT, y - U.linha * 0.5 + 0.8, ls.slice(1).join(" "), h, { cor: d.ok ? undefined : K2.vermelho });
    }
    circs.filter(function (ci) { return !ci.drId; }).forEach(function (ci) { ramal(ci, xB); });
    Z.drs.forEach(function (g) {
      var yDr = y;
      L(D, xB, yDr, xDr, yDr, "ELE-CIRC");
      R(D, xDr, yDr - 3.5, U.wDr, 7, "ELE-SIMBOLO"); T(D, xDr + U.wDr / 2, yDr + 0.8, g.id + " " + (g.In || "?") + "A 30mA", h, { al: "C", cor: g.In ? undefined : K2.vermelho });
      var xS = xDr + U.wDr + 4, ys = [];
      circs.filter(function (ci) { return ci.drId === g.id; }).forEach(function (ci) { ys.push(y); ramal(ci, xS); });
      L(D, xDr + U.wDr, yDr, xS, yDr, "ELE-CIRC");
      if (ys.length > 1) L(D, xS, ys[0], xS, ys[ys.length - 1], "ELE-CIRC");
      y += 2;
    });
    /* reserva */
    T(D, xT, y + 2.5, "RESERVA: " + Z.reserva + " espaço(s) (" + TB().T59.item + ")", h);
    return { escala: "SEM ESCALA" };
  }

  /* ------------------------------------------------------------ ELE-03…: PLANTA DE PONTOS E ELETRODUTOS (uma por pavimento)
     Pendência do revisor da E2 (integração n23, 23/10/2026): faltava a planta. Desenha, sobre as paredes e os vãos do modelo
     (EleAuto.leitura), TUDO o que a instalação tem — os pontos dos três motores (pontos, ligação da iluminação, circuitos) e os
     eletrodutos que existem — uma vez só: o desenho lê os objetos do modelo, não as listas de cada motor.
     Convenção (padrão RA de prancha elétrica v1.1; a NBR 5444:1989 foi CANCELADA sem substituta — os símbolos levam o texto):
       ponto de luz no teto = círculo com o circuito; interruptor = "S" (simples), "S3w" (paralelo), "S4w" (intermediário) + módulos;
       tomada de uso geral = triângulo cheio; uso específico = triângulo vazado + "TUE"; ligação direta = quadrado + "LD";
       caixa de passagem = quadrado vazado; quadro = retângulo meio cheio; eletroduto no teto (laje/forro) = linha contínua,
       no piso = tracejada, subida/descida na parede = círculo pequeno; rótulo do eletroduto = "Ø DN · circuitos". */
  var PL = { escalas: [50, 75, 100, 125, 150, 200, 250], hPonto: 2.0, rLuz: 2.0, tri: 1.8, legW: 92, folgaTit: 14, rotMin: 14 };
  function pavimentosDe(Z) {
    var L = Z.leitura || {}, ps = {}, nomes = arr(L.pavimentos);
    arr(Z.pontos).forEach(function (p) { ps[p.pav || 0] = 1; });
    return Object.keys(ps).map(Number).sort().map(function (k) { return { k: k, nome: (nomes[k] && nomes[k].nome) || ("Pavimento " + (k + 1)) }; });
  }
  function folhaPlanta(c, pav) {
    var D = c.D, a = c.geo.area, A0 = AP(), Z = c.A, LE = Z.leitura || {}, h = PL.hPonto;
    var walls = Object.keys(LE.porParede || {}).map(function (k) { return LE.porParede[k]; }).filter(function (w) { return (w.pav || 0) === pav.k && arr(w.pts).length >= 3; });
    var ambs = arr(LE.ambientes).filter(function (x) { return (x.pav || 0) === pav.k; });
    var pts = [];
    walls.forEach(function (w) { arr(w.pts).forEach(function (q) { pts.push(q); }); });
    ambs.forEach(function (x) { arr(x.pts).forEach(function (q) { pts.push(q); }); });
    if (!pts.length) return { escala: "SEM ESCALA" };
    var x0 = Math.min.apply(null, pts.map(function (q) { return q[0]; })), x1 = Math.max.apply(null, pts.map(function (q) { return q[0]; }));
    var z0 = Math.min.apply(null, pts.map(function (q) { return q[1]; })), z1 = Math.max.apply(null, pts.map(function (q) { return q[1]; }));
    var Wd = a.w - PL.legW - 16, Hd = a.h - PL.folgaTit - 10, esc = PL.escalas[PL.escalas.length - 1];
    for (var i = 0; i < PL.escalas.length; i++) { var k0 = 1000 / PL.escalas[i]; if ((x1 - x0) * k0 <= Wd && (z1 - z0) * k0 <= Hd) { esc = PL.escalas[i]; break; } }
    var k = 1000 / esc, yT = a.y + 2;
    yT += A0.tituloVista(D, a.x + 4, yT, "PLANTA DE PONTOS E ELETRODUTOS - " + txt(pav.nome).toUpperCase(), "ESCALA 1:" + esc) + 4;
    var ox = a.x + 8 + (Wd - (x1 - x0) * k) / 2, oy = yT + 2;
    function P(x, z) { return [ox + (x - x0) * k, oy + (z - z0) * k]; }
    var cam = function (nm) { return ' data-cam="' + nm + '"'; };
    var areaD = [a.x + 4, yT, a.x + 8 + Wd + 4, a.y + a.h - 4];
    /* arquitetura: paredes e vãos (o vão abre a parede: fundo branco e os batentes) */
    walls.forEach(function (w) { D.poli(w.pts.map(function (q) { return P(q[0], q[1]); }), "ELE-ARQ", true, cam("ELE-ARQ")); });
    arr(LE.vaos).forEach(function (v) {
      if ((v.pav || 0) !== pav.k) return;
      var w = (LE.porParede || {})[v.parede]; if (!w) return;
      var r = Number(w.rotY) || 0, u = [Math.cos(r), -Math.sin(r)], nn = [Math.sin(r), Math.cos(r)], m = [w.cx + u[0] * v.t, w.cz + u[1] * v.t], hw = v.largura / 2, he = (w.espessura || 0.15) / 2 + 0.005;
      var q = [[m[0] - u[0] * hw - nn[0] * he, m[1] - u[1] * hw - nn[1] * he], [m[0] + u[0] * hw - nn[0] * he, m[1] + u[1] * hw - nn[1] * he], [m[0] + u[0] * hw + nn[0] * he, m[1] + u[1] * hw + nn[1] * he], [m[0] - u[0] * hw + nn[0] * he, m[1] - u[1] * hw + nn[1] * he]].map(function (p) { return P(p[0], p[1]); });
      D.s.push('<polygon points="' + q.map(function (p) { return n(p[0]) + "," + n(p[1]); }).join(" ") + '" fill="#fff" stroke="none"/>');
      L(D, q[0][0], q[0][1], q[3][0], q[3][1], "ELE-ARQ"); L(D, q[1][0], q[1][1], q[2][0], q[2][1], "ELE-ARQ");
      if (v.tipo === "janela") L(D, (q[0][0] + q[3][0]) / 2, (q[0][1] + q[3][1]) / 2, (q[1][0] + q[2][0]) / 2, (q[1][1] + q[2][1]) / 2, "ELE-ARQ");
    });
    /* eletrodutos que existem no pavimento */
    var G = Z.grafo || {}, tr = G.trechos || {}, cota = (arr(LE.pavimentos)[pav.k] || {}).cota || 0, cotaProx = (arr(LE.pavimentos)[pav.k + 1] || {}).cota;
    var rotulos = [], nEl = 0;
    Object.keys(tr).forEach(function (id) {
      var t = tr[id]; if (!t || !t.p1 || !t.p2) return;
      var ym = (Number(t.p1.y) + Number(t.p2.y)) / 2; if (ym < cota - 0.6 || (cotaProx != null && ym >= cotaProx - 0.4)) return;
      var a1 = P(t.p1.x, t.p1.z), a2 = P(t.p2.x, t.p2.z), Lp = Math.sqrt(Math.pow(a2[0] - a1[0], 2) + Math.pow(a2[1] - a1[1], 2)); nEl++;
      if (Lp < 0.4) { D.circ(a1[0], a1[1], 0.7, "ELE-ELETRODUTO", cam("ELE-ELETRODUTO")); return; }   /* subida/descida na parede */
      L(D, a1[0], a1[1], a2[0], a2[1], t.aplicacao === "piso" ? "ELE-ELETRODUTO-PISO" : "ELE-ELETRODUTO");
      if (Lp >= PL.rotMin) rotulos.push({ m: [(a1[0] + a2[0]) / 2, (a1[1] + a2[1]) / 2], s: "Ø" + (t.dn || "?") + (arr(Z.porTrecho && Z.porTrecho[id]).length ? " " + Z.porTrecho[id].join(",") : ""), L: Lp });
    });
    /* pontos (o circuito de cada um, do projeto) */
    var circDe = {}; arr(Z.circuitos).forEach(function (ci) { arr(ci.pontos).forEach(function (id) { circDe[id] = ci.id; }); });
    var marcas = [];
    arr(Z.pontos).forEach(function (p) {
      if ((p.pav || 0) !== pav.k || !p.caixaP) return;
      var q = P(p.caixaP[0], p.caixaP[2]), cid = circDe[p.id] || "?", s;
      if (p.kind === "luz") { D.circ(q[0], q[1], PL.rLuz, "ELE-PONTO", cam("ELE-PONTO")); L(D, q[0] - PL.rLuz * 0.7, q[1] - PL.rLuz * 0.7, q[0] + PL.rLuz * 0.7, q[1] + PL.rLuz * 0.7, "ELE-PONTO"); L(D, q[0] - PL.rLuz * 0.7, q[1] + PL.rLuz * 0.7, q[0] + PL.rLuz * 0.7, q[1] - PL.rLuz * 0.7, "ELE-PONTO"); s = cid; }
      else if (p.kind === "interruptor") { D.ponto(q[0], q[1], 0.6); var t0 = txt(p.tipoId), nm = Number(t0.replace(/\D/g, "")) || 1; s = (/^p/.test(t0) ? "S3w" : (/^i/.test(t0) ? "S4w" : (/^m/.test(t0) ? "S misto" : "S"))) + (nm > 1 ? " x" + nm : ""); }
      else if (p.kind === "tue" && p.direta) { R(D, q[0] - 1.2, q[1] - 1.2, 2.4, 2.4, "ELE-PONTO"); s = "LD " + cid; }
      else if (p.kind === "tue") { D.poli([[q[0], q[1] - PL.tri], [q[0] + PL.tri, q[1] + PL.tri * 0.8], [q[0] - PL.tri, q[1] + PL.tri * 0.8]], "ELE-PONTO", true, cam("ELE-PONTO")); s = "TUE " + cid; }
      else { D.cheio([[q[0], q[1] - PL.tri], [q[0] + PL.tri, q[1] + PL.tri * 0.8], [q[0] - PL.tri, q[1] + PL.tri * 0.8]], "#000", cam("ELE-PONTO")); s = cid; }
      marcas.push({ q: q, s: s });
    });
    arr(G.nos).forEach(function (nd) { if (nd.tipo === "caixa" && /^elecp-/.test(txt(nd.ref))) { var q = P(nd.p[0], nd.p[2]); R(D, q[0] - 1, q[1] - 1, 2, 2, "ELE-PONTO"); } });
    if (Z.quadro && Z.quadro.p && (Z.quadro.y == null || Math.abs(Z.quadro.y - cota) < 1.5)) {
      var qq = P(Z.quadro.p[0], Z.quadro.p[2]); R(D, qq[0] - 3, qq[1] - 1.5, 6, 3, "ELE-PONTO"); D.cheio([[qq[0] - 3, qq[1] - 1.5], [qq[0] + 3, qq[1] - 1.5], [qq[0] - 3, qq[1] + 1.5]], "#000", cam("ELE-PONTO"));
      marcas.push({ q: [qq[0], qq[1] - 3.5], s: "QD1" });
    }
    /* textos: nomes dos ambientes, depois os pontos, depois os eletrodutos — cada um no lugar livre mais perto (nada sobreposto) */
    function janela(q, r) { return [Math.max(areaD[0], q[0] - r), Math.max(areaD[1], q[1] - r), Math.min(areaD[2], q[0] + r), Math.min(areaD[3], q[1] + r)]; }
    /* o lugar livre mais perto; sem lugar, a janela cresce; o rótulo de eletroduto que não acha lugar fica de fora (contado) — nunca por cima */
    var omitidos = 0;
    function poe(pref, s, hh, raios, opcional) {
      var w = A0.largTexto(s, hh);
      for (var ir = 0; ir < raios.length; ir++) { var cc = D.procura([pref[0], pref[1] + 0.08 * hh], w, 0.94 * hh, janela(pref, raios[ir]), { passo: 0.5, folga: 0.5 }); if (cc) { D.texto(cc[0], cc[1] - 0.08 * hh, s, hh, { al: "C", meio: true, attr: cam("ELE-TEXTO") }); return true; } }
      if (opcional) { omitidos++; return false; }
      D.texto(pref[0], pref[1], s, hh, { al: "C", meio: true, attr: cam("ELE-TEXTO") }); return true;
    }
    ambs.forEach(function (x) { poe(P(x.cx, x.cz), txt(x.nome).toUpperCase(), 2.5, [8, 16, 30]); });
    marcas.forEach(function (m) { poe([m.q[0] + 3.2, m.q[1] - 2.2], m.s, h, [6, 12, 20]); });
    rotulos.sort(function (x, y) { return y.L - x.L; }).forEach(function (r) { poe([r.m[0], r.m[1] - 1.4], r.s, 1.8, [4, 7], true); });
    /* legenda */
    var xl = a.x + a.w - PL.legW - 2, yl = yT + 4, hl = 2.2;
    T(D, xl, yl, "LEGENDA", 3, { peso: 0.26 }); yl += 6;
    var itens = [["luz", "ponto de luz no teto (caixa octogonal) - circuito"], ["int", "interruptor: S simples, S3w paralelo, S4w intermediário (x módulos)"], ["tug", "tomada de uso geral 2P+T - circuito"], ["tue", "tomada de uso específico (TUE) - circuito"],
      ["ld", "ligação direta (caixa 4x2, sem tomada) - circuito"], ["cp", "caixa de passagem"], ["qd", "quadro de distribuição QD1"], ["el", "eletroduto embutido no teto (laje/forro) - Ø DN · circuitos"], ["elp", "eletroduto embutido no piso"], ["sb", "subida/descida de eletroduto na parede"]];
    itens.forEach(function (it) {
      var cx = xl + 3, cy = yl - 0.9, s = it[0];
      if (s === "luz") { D.circ(cx, cy, 1.6, "ELE-PONTO", cam("ELE-PONTO")); L(D, cx - 1.1, cy - 1.1, cx + 1.1, cy + 1.1, "ELE-PONTO"); L(D, cx - 1.1, cy + 1.1, cx + 1.1, cy - 1.1, "ELE-PONTO"); }
      else if (s === "int") D.ponto(cx, cy, 0.6);
      else if (s === "tug") D.cheio([[cx, cy - 1.5], [cx + 1.5, cy + 1.2], [cx - 1.5, cy + 1.2]], "#000", cam("ELE-PONTO"));
      else if (s === "tue") D.poli([[cx, cy - 1.5], [cx + 1.5, cy + 1.2], [cx - 1.5, cy + 1.2]], "ELE-PONTO", true, cam("ELE-PONTO"));
      else if (s === "ld") R(D, cx - 1.2, cy - 1.2, 2.4, 2.4, "ELE-PONTO");
      else if (s === "cp") R(D, cx - 1, cy - 1, 2, 2, "ELE-PONTO");
      else if (s === "qd") { R(D, cx - 3, cy - 1.5, 6, 3, "ELE-PONTO"); D.cheio([[cx - 3, cy - 1.5], [cx + 3, cy - 1.5], [cx - 3, cy + 1.5]], "#000", cam("ELE-PONTO")); }
      else if (s === "el") L(D, cx - 3, cy, cx + 3, cy, "ELE-ELETRODUTO");
      else if (s === "elp") L(D, cx - 3, cy, cx + 3, cy, "ELE-ELETRODUTO-PISO");
      else D.circ(cx, cy, 0.7, "ELE-ELETRODUTO", cam("ELE-ELETRODUTO"));
      A0.quebrar(it[1], hl, PL.legW - 10).forEach(function (q, j) { T(D, xl + 8, yl + j * hl * 1.4, q, hl); yl += j ? hl * 1.4 : 0; });
      yl += hl * 2.2;
    });
    A0.quebrar(nEl + " trecho(s) de eletroduto e " + marcas.length + " ponto(s) neste pavimento" + (omitidos ? "; " + omitidos + " rótulo(s) de eletroduto sem lugar livre: ver o modelo" : ""), hl, PL.legW - 4).forEach(function (q, j) { T(D, xl, yl + 2 + j * hl * 1.4, q, hl); });
    return { escala: "1:" + esc, eletrodutos: nEl, pontos: marcas.length };
  }

  /* ------------------------------------------------------------ COLUNA (notas, normas, pendências) */
  function coluna(D, g, blocos) {
    var A0 = AP(), col = g.coluna, car = g.carimbo, x0 = col.x + 4, wmax = col.w - 7, y = col.y + 5, yMax = car.y - 3, h = K2.hPeq;
    L(D, col.x, col.y, col.x, car.y, "ELE-MOLDURA");
    var cortou = false;
    blocos.forEach(function (b) {
      if (y + 6 > yMax) { cortou = true; return; }
      T(D, x0, y + 3, b.titulo, 3, { peso: 0.26, cor: b.cor }); y += 5.5;
      b.itens.forEach(function (it, i) {
        var pre = (i + 1) + "- ", rec = A0.largTexto(pre, h);
        A0.quebrar(it, h, wmax - rec).forEach(function (s, k) { if (y + h > yMax) { cortou = true; return; } if (!k) T(D, x0, y + h, pre, h, { cor: b.cor }); T(D, x0 + rec, y + h, s, h, { cor: b.cor }); y += h * K2.notaLinha; });
        y += K2.notaEntre;
      });
      y += K2.blocoEntre;
    });
    return !cortou;
  }
  function blocosDe(Z) {
    var Tb = TB();
    var notas = [Tb.NORMA.ressalva,
      "Divisão: iluminação separada de tomadas (" + Tb.n5410("4.2.5.5") + "); aparelho acima de 10 A em circuito independente (9.5.3.1); tomadas de cozinha, copa e área de serviço em circuitos só delas (9.5.3.2).",
      "Condutores de cobre, isolação PVC 70 °C, 450/750 V. Capacidade pela Tabela 36 (2 condutores carregados — Tabela 46), fatores das Tabelas 40 e 42; coordenação IB ≤ In ≤ Iz (5.3.4.1); seção mínima pela Tabela 47; PE pela Tabela 58.",
      "Queda de tensão: até 4 % no circuito terminal e 5 % do ponto de entrega (6.2.7), cobre a 70 °C (" + Tb.RESISTENCIA.fonte + ").",
      "DR 30 mA onde a 5.1.3.2.2 exige; DPS no quadro (5.4.2.1.1; Uc pela Tabela 49).",
      "Cores (6.1.5.3): neutro azul-claro, PE verde-amarelo; fases e retorno: critério RA (preto, vermelho, branco; retorno cinza).",
      "Demanda e padrão de entrada: " + Tb.CEMIG.fonte + ".",
      "Eletrodutos: corrugado reforçado na laje, corrugado na parede e no forro; DN pelo número de condutores (" + Tb.OCUPACAO.fonte + "); caixa de passagem a cada 15 m menos 3 m por curva (6.2.11.1.6 b)."];
    var pend = arr(Z.pendencias).map(function (p) { return p.texto; }).concat(arr(Z.avisos).filter(function (s) { return /PROVISÓRIO|ESTIMADO/.test(s); }));
    var b = [{ titulo: "NOTAS", itens: notas }];
    if (pend.length) b.push({ titulo: "PENDÊNCIAS", itens: pend, cor: K2.vermelho });
    return b;
  }

  /* ------------------------------------------------------------ GERAR */
  function gerar(Z, opcoes) {
    opcoes = opcoes || {};
    var avisos = [], P = PR(), A = AP();
    if (!P || !P.carimboRA || !A) return { ok: false, folhas: [], avisos: ["Motores de prancha (prancha.js, acopranchas.js) não carregados."] };
    if (!Z || !Z.ok || !arr(Z.circuitos).length) return { ok: false, folhas: [], avisos: ["Sem circuitos calculados: rode \"Circuitos e quadro\" antes das pranchas."] };
    var E = estilo(), formato = P.FORMATOS && P.FORMATOS[opcoes.formato] ? opcoes.formato : "A1", geo = P.geometria(formato, "paisagem", "RA");
    var codigo = txt(opcoes.codigo).trim() || "ELE", rev = (txt(opcoes.revisao).trim() || "R00").toUpperCase(), data = txt(opcoes.data).trim() || hoje();
    var qdNome = (Z.quadro && Z.quadro.id ? "QD1" : "QD1"), qdAmb = Z.quadro && Z.quadro.ambNome ? txt(Z.quadro.ambNome).toUpperCase() : "";
    /* o quadro de cargas e o unifilar na MESMA folha quando cabem (a A1 sobrava em branco); senão, uma folha cada */
    var feitas = [];
    function nova(df, fn) {
      var D = new A.Desenho(E, []), c = { D: D, geo: geo, A: Z, qdNome: qdNome, qdAmb: qdAmb }, res = {}, i = feitas.length;
      try { res = fn(c) || {}; }
      catch (e) { avisos.push("Folha " + dois(i + 1) + " (" + df.titulo + "): " + (e && e.message ? e.message : String(e))); T(D, geo.area.x + 10, geo.area.y + 20, "ERRO AO DESENHAR ESTA FOLHA - ver avisos", 4.2, { cor: K2.vermelho }); }
      feitas.push({ def: df, D: D, escala: (res && res.escala) || "SEM ESCALA", rotulo: dois(i + 1) });
      return res;
    }
    var juntas = false;
    nova({ id: "quadro-cargas", titulo: "QUADRO DE CARGAS E DIAGRAMA UNIFILAR", tipo: "quadro" }, function (c) {
      var r1 = folhaQuadro(c), y = (r1.yFim || geo.area.y) + 12;
      if (geo.area.y + geo.area.h - y >= alturaUnifilar(Z)) { folhaUnifilar(c, y); juntas = true; }
      return r1;
    });
    if (!juntas) { feitas[0].def.titulo = "QUADRO DE CARGAS"; nova({ id: "unifilar", titulo: "DIAGRAMA UNIFILAR", tipo: "unifilar" }, function (c) { return folhaUnifilar(c); }); }
    /* a planta de pontos e eletrodutos, uma folha por pavimento (opcoes.semPlanta tira) */
    if (!opcoes.semPlanta && Z.leitura) pavimentosDe(Z).forEach(function (pv) {
      nova({ id: "planta-" + pv.k, titulo: "PLANTA DE PONTOS E ELETRODUTOS - " + txt(pv.nome).toUpperCase(), tipo: "planta" }, function (c) { return folhaPlanta(c, pv); });
    });
    var emp = opcoes.empresa, empObj = emp && typeof emp === "object" ? emp : null, revNum = rev.replace(/^R/i, "") || "00";
    var pr = P.normalizar({ id: "elepranchas", nome: "Projeto elétrico", formato: formato, orientacao: "paisagem", origem: "ele",
      carimbo: { modelo: "RA", empresa: empObj ? "" : txt(emp), responsavel: txt(opcoes.responsavel), registro: txt(opcoes.registro), titulo: txt(opcoes.tituloProfissional),
                 obra: txt(opcoes.obra), proprietario: txt(opcoes.proprietario), contratante: txt(opcoes.contratante), local: txt(opcoes.local),
                 codigo: codigo, data: data, revisoes: [[revNum, txt(opcoes.descricaoRevisao) || "EMISSÃO INICIAL - PROJETO EXECUTIVO", data]] },
      folhas: feitas.map(function (f, i) { return { id: f.def.id, n: i + 1, conteudo: f.def.titulo, escala: f.escala, numero: codigo + " " + rev }; }) });
    var blocos = blocosDe(Z), verif = { folhas: [], sobreposicoes: 0 }, nP = feitas.length;
    var folhas = feitas.map(function (f, i) {
      var D = f.D, fl = pr.folhas[i], W = geo.papel.w, Hp = geo.papel.h, M = geo.moldura, Fd = new A.Desenho(E, null);
      R(Fd, M.x, M.y, M.w, M.h, "ELE-MOLDURA");
      if (!coluna(Fd, geo, blocos) && i === 0) avisos.push("Notas e pendências não couberam inteiras na coluna: veja o memorial.");
      A.carimbo(Fd, pr, fl, geo, empObj, opcoes.logo || null, f.rotulo + "/" + dois(nP));
      var numero = codigo + "-" + f.rotulo;
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + n(W) + 'mm" height="' + n(Hp) + 'mm" viewBox="0 0 ' + n(W) + " " + n(Hp) + '" font-family="' + FONTE + '" data-folha="' + esc(f.def.id) + '" data-numero="' + esc(numero) + '">' +
        "<title>" + esc(numero + " - " + f.def.titulo + " - " + rev) + "</title>" + '<rect x="0" y="0" width="' + n(W) + '" height="' + n(Hp) + '" fill="#fff"/>' +
        '<g data-corpo="1">' + D.svg() + '</g><g data-folha-moldura="1">' + Fd.svg() + "</g></svg>";
      var cx = D.caixas || [], pares = A.sobreposicoes(cx);
      verif.folhas.push({ numero: numero, textos: cx.length, sobreposicoes: pares.length, pares: pares.slice(0, K2.parEx) });
      verif.sobreposicoes += pares.length;
      if (pares.length) avisos.push("Folha " + numero + ": " + pares.length + " par(es) de textos sobrepostos (ex.: " + pares.slice(0, K2.parAviso).map(function (q) { return q[0] + " x " + q[1]; }).join("; ") + ").");
      return { id: f.def.id, rotulo: f.rotulo, numero: numero, titulo: f.def.titulo, formato: formato, escala: f.escala, svg: svg, caixasTexto: cx };
    });
    folhas.forEach(function (f) { if (/NaN|undefined/.test(f.svg)) avisos.push("Folha " + f.numero + ": há valor inválido (NaN/undefined) no desenho."); });
    return { ok: true, folhas: folhas, avisos: avisos, verificacao: verif };
  }

  /* ------------------------------------------------------------ EXPORTAR */
  function atributos(s) { var o = {}, re = /([\w:-]+)="([^"]*)"/g, m; while ((m = re.exec(s))) o[m[1]] = m[2]; return o; }
  function desesc(s) { return txt(s).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&amp;/g, "&"); }
  function paraDxf(r) {
    var X = DXF(); if (!X || !r || !r.ok || !r.folhas.length) return null;
    var doc = X.novoDoc({ unidade: "mm" }), E = estilo(), A0 = AP(), x0 = 0; doc.escala = 1;
    function camada(nome, folha, a) {
      var nm = folha ? (/MOLDURA/.test(nome || "") ? "FOLHA-MOLDURA" : "FOLHA-CARIMBO") : (/^ELE-/.test(nome || "") ? nome : "ELE-SIMBOLO"), cm = E.camadas[nm] || {};
      doc.especificar(nm, cm.mm || +a["stroke-width"] || 0.18, (a["stroke-dasharray"] || cm.dash) ? "TRACEJADO" : null, nm === "ELE-PEND" ? 1 : (nm === "ELE-PE" ? 3 : 7));
      return doc.camada(nm);
    }
    r.folhas.forEach(function (f) {
      var vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(f.svg) || [], W = +vb[1] || 0, Hp = +vb[2] || 0, corte = f.svg.indexOf('<g data-folha-moldura="1">');
      function P(x, y) { return [x0 + (+x), Hp - (+y)]; }
      var re = /<(line|polygon|polyline|rect|circle|text)\b([^>]*?)(\/?)>([^<]*)/g, m;
      while ((m = re.exec(f.svg))) {
        var tag = m[1], a = atributos(m[2]), st = a.stroke && a.stroke !== "none" ? a.stroke : null, folha = corte >= 0 && m.index > corte, cam = a["data-cam"];
        if (tag === "line" && st) { var p1 = P(a.x1, a.y1), p2 = P(a.x2, a.y2); doc.linha(camada(cam, folha, a), p1[0], p1[1], p2[0], p2[1]); }
        else if ((tag === "polygon" || tag === "polyline") && st) doc.poli(camada(cam, folha, a), txt(a.points).trim().split(/\s+/).map(function (q) { var v = q.split(","); return P(v[0], v[1]); }), tag === "polygon");
        else if (tag === "rect" && st) { var x = +a.x, y = +a.y, w = +a.width, h = +a.height; doc.poli(camada(cam, folha, a), [P(x, y), P(x + w, y), P(x + w, y + h), P(x, y + h)], true); }
        else if (tag === "circle" && st) { var pc = P(a.cx, a.cy); doc.circulo(camada(cam, folha, a), pc[0], pc[1], +a.r); }
        else if (tag === "text" && m[3] !== "/") {
          var s = desesc(m[4]); if (!s.trim()) continue;
          var pt = P(a.x, a.y), al = a["text-anchor"], fs = +a["font-size"], red = a.fill && a.fill !== "#000" && a.fill !== "none";
          var cT = doc.camada(folha ? (red ? "FOLHA-TEXTO-PEND" : "FOLHA-TEXTO") : (red ? "ELE-TEXTO-PEND" : "ELE-TEXTO"), 0.18, null, red ? 1 : 7);
          if (al === "end") pt = [pt[0] - A0.largTexto(s, fs), pt[1]];
          doc.texto(cT, pt[0], pt[1], fs * K2.letraDxf, s, 0, al === "middle");
        }
      }
      x0 += W + 40;
    });
    return X.escrever(doc);
  }
  function exportar(r, formato) {
    if (!r || !r.ok) return null;
    if (formato === "svg") return r.folhas.map(function (f) { return { nome: f.numero + " " + f.titulo + ".svg", svg: f.svg }; });
    if (formato === "pdf") { var Sp = PDF(); return Sp ? Sp.pdf(r.folhas.map(function (f) { return f.svg; }), { titulo: "Projeto elétrico" }) : null; }
    if (formato === "dxf") return paraDxf(r);
    return null;
  }

  /* ------------------------------------------------------------ MEMORIAL */
  function memorial(Z, opcoes) {
    opcoes = opcoes || {};
    var Tb = TB(), secoes = [];
    if (!Z || !Z.ok) return { titulo: "Memorial descritivo e de cálculo — instalações elétricas", secoes: [], html: "", texto: "" };
    var dm = Z.demanda, en = dm.entrada, C = Z.criterios;
    secoes.push({ titulo: "1. Normas e ressalva", itens: [
      "ABNT NBR 5410 — Instalações elétricas de baixa tensão. " + Tb.NORMA.ressalva,
      Tb.CEMIG.fonte + " — tipo de fornecimento, padrão de entrada e cálculo da demanda (PDF público da CEMIG).",
      "SINAPI MG 06/2026 (não desonerado) — orçamento. Fabricantes: " + Tb.FONTES.SIL + "; " + Tb.FONTES.PLASTUBOS + "; " + Tb.FONTES.LAPP + ".",
      "NR-10 (projeto sob responsabilidade de profissional legalmente habilitado; circuitos identificados; desligamento com impedimento de reenergização)."] });
    secoes.push({ titulo: "2. Fornecimento e demanda", itens: [
      "Tensão " + C.tensaoFN.valor + "/" + C.tensaoFF.valor + " V (rede secundária da CEMIG). Esquema de aterramento adotado: TN-S a partir do quadro (critério RA — conferir com o padrão da CEMIG).",
      "Potência instalada: " + br(dm.cargaInstalada_kW, 2) + " kW, dos quais iluminação e tomadas " + br(dm.luzTomadas_kW, 2) + " kW (carga mínima de iluminação da NBR 5410 9.5.2.1.2 e das tomadas 9.5.2.2.2, ou a dos aparelhos — a maior).",
      "Demanda provável (ND-5.1 " + Tb.CEMIG.demanda.item + ", " + Tb.CEMIG.demanda.formula + "): a = " + br(dm.a, 2) + " kVA (fator " + br(dm.fdLuzTomadas, 2) + " da " + Tb.CEMIG.tabela10.item + ", kVA = kW/0,92); b1 (chuveiros) = " + br(dm.b1, 2) + "; b3 (fornos e fogões, " + Tb.CEMIG.tabela12.item + ") = " + br(dm.b3, 2) + "; b4 (lavar/secar) = " + br(dm.b4, 2) + "; b5 (demais) = " + br(dm.b5, 2) + "; c (ar-condicionado) = " + br(dm.c, 2) + "; d (motores) = " + br(dm.d, 2) + " — fatores da " + Tb.CEMIG.tabela13.item + ". D = " + br(dm.demanda_kVA, 2) + " kVA.",
      dm.tipo ? "Fornecimento tipo " + dm.tipo + ": " + dm.motivoTipo + "." : "Fornecimento: " + dm.motivoTipo + ".",
      en ? "Padrão de entrada (" + en.tabela + ", valores mínimos): faixa " + en.faixa + ", disjuntor termomagnético IEC " + en.disjuntor_A + " A curva C ou D pós-medidor, " + en.fios + " fios, cobre " + en.condutor_mm2 + " mm² (cabo), eletroduto PVC " + en.eletrodutoPVC_mm + " mm ou aço " + en.eletrodutoAco_mm + " mm, " + en.hastes + " haste(s), aterramento cobre nu " + en.aterramento_mm2 + " mm², condutor de proteção " + en.pe_mm2 + " mm². Poste, caixa de medição e afastamentos: capítulo 7 e desenhos 66-67 da ND-5.1 (não transcritos — conferir)." : "Padrão de entrada: não verificado."] });
    secoes.push({ titulo: "3. Quadro de distribuição", itens: [
      (Z.quadro && Z.quadro.regra ? "Posição: " + Z.quadro.regra + "." : "Posição: a do modelo.") + " Local de fácil acesso, identificado (" + Tb.n5410("6.5.4.8 e 6.5.4.9") + ").",
      "Disjuntor geral " + (Z.geral.In ? Z.geral.In + " A, " + Z.geral.polos + " polos" : "não verificado") + "; " + Z.geral.regra + ".",
      "Alimentador: " + (Z.alimentador.secao ? sec(Z.alimentador.secao) + " mm² (fases e neutro) + PE " + sec(Z.alimentador.pe) + " mm², " + br(Z.alimentador.comprimento, 1) + " m" + (Z.alimentador.provisorio ? " (PROVISÓRIO: o padrão de entrada não está no modelo — " + C.alimentadorComprimento.fonte + ")" : "") + ", queda " + br(Z.alimentador.dv, 2) + " % (Tabela 36 B1, " + Z.alimentador.nCarr + " condutores carregados)." : "não verificado."),
      "Espaços: " + Z.modulos + " módulos (disjuntores, DR, DPS, geral e reserva de " + Z.reserva + " pela " + Tb.T59.item + ")" + (Z.quadroModelo ? " — quadro de " + Z.quadroModelo.espacos + " espaços (SINAPI " + Z.quadroModelo.codigo + ")." : "."),
      Z.dps.exigido ? "DPS: " + Z.dps.regra + "." : "DPS: não adotado (" + C.dpsAQ2.fonte + ").",
      "DR 30 mA por grupo de até " + C.drCircuitosMax.valor + " circuitos, ligados ao barramento depois do disjuntor geral: o DR não se protege contra sobrecarga, então a corrente nominal dele cobre a soma dos disjuntores a jusante, limitada à do geral (" + Tb.n5410("6.3.6.2.2 a)") + "; critério RA conservador). Não há DR em série: a seletividade entre DR (6.3.6.3) não se aplica — havendo DR geral a montante, ele precisa de IΔn de pelo menos 3 × 30 mA e de não atuar antes do de 30 mA — o tipo S é a forma usual (6.3.6.3.2 e a NOTA).",
      "Temperatura de referência dos condutores " + C.tempAmbiente.valor + " °C (Tabela 40): no entreforro sob telhado sem ventilação a temperatura pode passar disso — confira e, se passar, ajuste em Critérios dos circuitos (o fator da Tabela 40 cai a 0,87 a 40 °C)."] });
    var itensC = Z.circuitos.map(function (ci) {
      var d = ci.dim;
      return ci.id + " — " + ci.nome + ": " + br(d.va, 0) + " VA em " + ci.tensao + " V (" + (ci.fases || "fase não verificada") + "), IB = " + br(d.ib, 2) + " A; método " + d.metodo.ref + " (Tabela 33 nº " + d.metodo.metodo + ", " + d.metodo.apl + "), " + d.nAgrup + " circuito(s) no eletroduto mais cheio (FA " + br(d.fa, 2) + ", Tabela 42" + (d.desprezado ? "; desprezado no agrupamento dos outros pela 6.2.5.5.2" : "") + "), FT " + br(d.ft, 2) + " (Tabela 40, " + C.tempAmbiente.valor + " °C); " +
        "seção " + sec(d.secao) + " mm² (mínimo " + sec(d.secMin) + " — Tabela 47), Iz corrigida " + br(d.izc, 1) + " A; disjuntor " + d.In + " A " + ci.polos + "P (IB ≤ In ≤ Iz — 5.3.4.1); queda " + br(d.dv, 2) + " % em " + br(d.L, 1) + " m" + (d.estimado ? " (comprimento ESTIMADO)" : "") + " (limite " + br(d.limiteQueda, 2) + " % — 6.2.7); PE " + sec(d.pe) + " mm² (Tabela 58)" +
        (ci.drId ? "; DR " + ci.drId + " 30 mA (5.1.3.2.2 " + ci.dr.map(function (k) { return k + ")"; }).join(", ") + ")" : "") + (d.ok ? "." : ". NÃO ATENDE: " + d.motivos.join("; ") + ".");
    });
    secoes.push({ titulo: "4. Circuitos (divisão: " + Tb.n5410("4.2.5.5, 9.5.3.1 e 9.5.3.2") + "; o motor não usa a exceção da 9.5.3.3)", itens: itensC });
    secoes.push({ titulo: "5. Eletrodutos e caixas", itens: [
      "Eletroduto de PVC corrugado: reforçado embutido na laje (a SINAPI 06/2026 só orça esse em laje), comum na parede e no forro (" + Tb.T33.parede.desc + " = método B1; forro = " + Tb.T33.forro.desc + ").",
      "Do quadro sai um ramal por grupo de no máximo " + C.circuitosPorEletroduto.valor + " circuito(s) (" + C.circuitosPorEletroduto.fonte + "); o aparelho de mais de " + C.pesadoIb.valor + " A vai em eletroduto só dele.",
      "DN pelo número de condutores da mesma seção (" + Tb.OCUPACAO.fonte + ") — taxa de ocupação da " + Tb.n5410("6.2.11.1.6 a)") + ": 53 % (1 condutor), 31 % (2), 40 % (3 ou mais). Seções diferentes no mesmo eletroduto contadas como a maior (critério RA).",
      "Caixa de passagem a cada trecho contínuo de 15 m menos 3 m por curva de 90°, no máximo 3 curvas entre caixas (6.2.11.1.6 b e 6.2.11.1.7); emendas só dentro de caixa (6.2.11.1.11)."] });
    secoes.push({ titulo: "6. Condutores, cores e identificação", itens: [
      "Cobre flexível, isolação PVC 70 °C, 450/750 V, não propagante de chama (SINAPI 91924–91934).",
      "Neutro azul-claro (6.1.5.3.1); proteção verde-amarelo (6.1.5.3.2); fases preto, vermelho e branco e retorno cinza (critério RA — a 6.1.5.3.4 admite qualquer cor, exceto só amarelo).",
      "Tomadas de 220 V marcadas com a tensão no espelho (" + Tb.n5410("6.5.3.2") + "). Quadro com a advertência da 6.5.4.10 e os circuitos identificados (6.5.4.9; NR-10 10.4.3.1)."] });
    var pend = arr(Z.pendencias).map(function (p) { return p.texto; }).concat(arr(Z.avisos));
    if (pend.length) secoes.push({ titulo: "7. Pendências e avisos", itens: pend });
    var titulo = "Memorial descritivo e de cálculo — instalações elétricas" + (opcoes.obra ? " — " + opcoes.obra : "");
    var html = "<!doctype html><html lang=\"pt-BR\"><head><meta charset=\"utf-8\"><title>" + esc(titulo) + "</title><style>body{font:13px/1.5 system-ui,sans-serif;max-width:900px;margin:24px auto;padding:0 16px;color:#16202a}h1{font-size:18px}h2{font-size:15px;margin-top:18px}li{margin:3px 0}.r{background:#fff3cd;padding:8px;border-radius:6px}</style></head><body>" +
      "<h1>" + esc(titulo) + "</h1><p class=\"r\">" + esc(Tb.NORMA.ressalva) + "</p>" + secoes.map(function (s) { return "<h2>" + esc(s.titulo) + "</h2><ul>" + s.itens.map(function (i) { return "<li>" + esc(i) + "</li>"; }).join("") + "</ul>"; }).join("") + "</body></html>";
    var texto = titulo + "\n\n" + secoes.map(function (s) { return s.titulo + "\n" + s.itens.map(function (i) { return "- " + i; }).join("\n"); }).join("\n\n");
    return { titulo: titulo, secoes: secoes, html: html, texto: texto };
  }

  var ElePranchas = { VERSAO: 1, K2: K2, gerar: gerar, exportar: exportar, memorial: memorial, estilo: estilo, paraDxf: paraDxf };
  global.ElePranchas = ElePranchas;
  if (typeof module !== "undefined" && module.exports) module.exports = ElePranchas;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
