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
    cam("ELE-MOLDURA", 0.5); cam("ELE-QD", 0.35, "#000", "6 2"); cam("ELE-ARQ", 0.25, "#6a6a6a"); cam("ELE-ELETRODUTO", 0.34); cam("ELE-ELETRODUTO-PISO", 0.25, "#000", "3 1.5"); cam("ELE-PONTO", 0.25); cam("ELE-PE", 0.25, "#1B7F3B", "4 1.5"); cam("ELE-PEND", 0.25, K2.vermelho, "3 1.5");
    /* v2.0 (modelo de referência, 20/11/2026): tabelas e legendas da folha única, condutores no eletroduto */
    cam("ELE-PONTO", 0.25, "#0000ff"); cam("ELE-PONTO2", 0.25); cam("ELE-AREXT", 0.25, "#00b8c8", "3 1.5"); cam("ELE-QUADRO", 0.5); cam("ELE-COND-F", 0.25, "#ff0000"); cam("ELE-COND-N", 0.25, "#0000ff"); cam("ELE-COND-T", 0.25, "#00ff00"); cam("ELE-COND-R", 0.3);
    cam("ELE-TABELA-RESUMO", 0.25); cam("ELE-TABELA-CABOS", 0.25); cam("ELE-TABELA-PECAS", 0.25); cam("ELE-TABELA-ELETRODUTOS", 0.25); cam("ELE-LEGENDA", 0.25); cam("ELE-ENTRADA", 0.35); cam("ELE-COND", 0.25);
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
  /* os textos do resumo (demanda, entrada, geral, alimentador, DR, DPS, quadro): os mesmos na folha de várias folhas e na folha única */
  function resumoTextos(Z) {
    var Tb = TB(), dm = Z.demanda, en = dm.entrada;
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
    return { esq: esq, dir: dir };
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
    var dm = Z.demanda, x = a.x + 4, wCol = (a.w - 8) / 2 - 3, rs = resumoTextos(Z), esq = rs.esq, dir = rs.dir, en = dm.entrada;
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
  var PL = { escalas: [50, 75, 100, 125, 150, 200, 250], escalasU: [50, 75, 100, 125, 150, 200, 250], hPonto: 2.0, rLuz: 2.0, tri: 1.8, legW: 92, folgaTit: 14, rotMin: 14 };
  function pavimentosDe(Z) {
    var L = Z.leitura || {}, ps = {}, nomes = arr(L.pavimentos);
    /* v2.3: só vira folha o pavimento com ponto LIGADO a circuito; ponto solto (ambiente sem nome em outro nível, como o da Reforma Casa 487) fica no relatório */
    var noCirc = {}; arr(Z.circuitos).forEach(function (ci) { arr(ci.pontos).forEach(function (id) { noCirc[id] = 1; }); });
    arr(Z.pontos).forEach(function (p) { if (noCirc[p.id]) ps[p.pav || 0] = 1; });
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


  /* ------------------------------------------------------------ v2.1: FOLHA ÚNICA "PROJETO ELÉTRICO" IGUAL AO MODELO DE REFERÊNCIA (Rogério, 20/11/2026)
     Tabelas (título dentro da tabela, cabeçalho em negrito, fase A vermelha / B cinza / C amarela), quadro de distribuição desenhado, unifilar com
     disjuntor em arco e marcas de condutor coloridas, diagrama da entrada, legendas em quadro, planta com paredes cinza cheias, eletrodutos em arco e
     símbolos azuis. TUDO vem do projeto analisado e do quantitativo do modelo — nenhum número de norma novo aqui (geometria de desenho em mm de papel).
     Não cabendo, a folha única não sai e o gerar() cai no modo de várias folhas (v1.1). Nada do autor do modelo (nome, logo, dados) foi copiado. */
  var AZ = "#0000ff", VM = "#e00000", VD = "#00a000";
  var KU = { h: 2.4, padX: 1.0, padY: 0.6, linhaH: 1.3, legW: 86, maxColuna: 13, fillA: "#ff6666", fillB: "#bfbfbf", fillC: "#ffffb3", fillN: "#b8d4ff", fillT: "#00cc44", fillCab: "#ffffff" };
  var FUNC = { "preto": ["FASE A", "F", 0, KU.fillA], "vermelho": ["FASE B", "F", 1, KU.fillB], "branco": ["FASE C", "F", 2, KU.fillC], "azul-claro": ["Neutro", "N", 3, KU.fillN], "verde-amarelo": ["TERRA", "PE", 4, KU.fillT], "cinza": ["Retorno", "R", 5, KU.fillCab] };
  function cm(nm) { return ' data-cam="' + nm + '"'; }
  /* tabela do modelo: título DENTRO da tabela, cabeçalho em negrito, bordas; cab = [{ t, fill }] ou textos; linhas = [{ cel[], forte, fill[], pend[], peq, rotulo }] */
  function tab(D, A0, x, y, ws, cab, linhas, h, cam, al, opt) {
    opt = opt || {};
    var xs = [x], W = 0; ws.forEach(function (w) { xs.push(xs[xs.length - 1] + w); W += w; });
    if (opt.titulo) { var ht = opt.hTit || 4.2, hl0 = ht * 2.2; R(D, x, y, W, hl0, cam); T(D, x + W / 2, y + hl0 / 2, opt.titulo, ht, { al: "C", meio: true, peso: 0.32 }); y += hl0; }
    function linha(cels, forte, fill, pend, tipo, hh, quebra) {
      if (tipo) {
        var hq = tipo === "peq" ? 1.3 : 2.8, hr = hq * 1.5 + 0.8;
        R(D, x, y, W, hr, cam); T(D, x + 0.8, y + hr / 2, txt(cels[0]), hq, { meio: true, peso: tipo === "peq" ? undefined : 0.12 }); y += hr; return;
      }
      var qs = cels.map(function (t, i) { return A0.quebrar(txt(t), hh, ws[i] - 2 * KU.padX); }), hl = Math.max.apply(null, qs.map(function (q) { return q.length; }).concat([1])) * hh * KU.linhaH + 2 * KU.padY;
      if (quebra) hl = Math.max(hl, quebra);
      cels.forEach(function (t, i) {
        if (fill && fill[i]) D.fundo(xs[i], y, ws[i], hl, fill[i]);
        R(D, xs[i], y, ws[i], hl, cam);
        var a1 = al && al[i] || "E", xx = a1 === "D" ? xs[i] + ws[i] - KU.padX : (a1 === "C" ? xs[i] + ws[i] / 2 : xs[i] + KU.padX), n0 = qs[i].length, y0 = y + hl / 2 - (n0 - 1) * hh * KU.linhaH / 2;
        qs[i].forEach(function (s, q) { T(D, xx, y0 + q * hh * KU.linhaH, s, hh, { al: a1, meio: true, peso: forte ? 0.16 : undefined, cor: pend && pend[i] ? K2.vermelho : undefined }); });
      });
      y += hl;
    }
    if (cab) linha(cab.map(function (c) { return typeof c === "string" ? c : c.t; }), true, cab.map(function (c) { return typeof c === "string" ? null : c.fill; }), null, null, h, 0);
    linhas.forEach(function (l) { linha(l.cel, l.forte, l.fill, l.pend, l.peq ? "peq" : (l.rotulo ? "rot" : null), l.h || h, 0); });
    return y;
  }
  /* título em negrito sublinhado (o do modelo: "Planta Baixa", "Quadro Distribuição"…) */
  function tituloSub(D, x, y, s, hh) {
    var w = AP().largTexto(s, hh) + hh * 0.35;
    T(D, x, y + hh * 0.8, s, hh, { peso: 0.7 }); L(D, x, y + hh * 1.0, x + w, y + hh * 1.0, "ELE-TITULO");
    return y + hh * 1.3;
  }
  function nota(D, A0, x, y, w, s, cor) { A0.quebrar(s, KU.h, w).forEach(function (q) { T(D, x, y + KU.h, q, KU.h, { cor: cor }); y += KU.h * 1.4; }); return y; }

  /* a carga por fase: o circuito dividido igualmente entre as fases dele; circuito sem fase NÃO entra (pendência vermelha, nunca zero silencioso).
     Em W quando TODO circuito tem a potência ativa dos pontos (p.w: aquecimento kW = kVA, demais kVA×0,92, CEMIG ND-5.1 - EleCircuitos.fpNaoAquecimento);
     senão a tabela inteira sai em VA com a nota. */
  function wDe(Z, ci) {
    var s = 0, ok = true, tem = false;
    arr(ci.pontos).forEach(function (id) { var p = Z.existe && Z.existe[id]; if (!p || p.kind === "interruptor") return; tem = true; if (!fin(p.w)) ok = false; else s += p.w; });
    return ok && tem ? s : null;
  }
  function cargaFases(Z) {
    var fs = arr(Z.fases && Z.fases.fases).length ? Z.fases.fases : ["A"], tot = {}, linhas = [], sem = [], emW = true;
    Z.circuitos.forEach(function (ci) { if (wDe(Z, ci) == null) emW = false; });
    fs.forEach(function (f) { tot[f] = 0; });
    Z.circuitos.forEach(function (ci) {
      var d = ci.dim, o = {}, ok = !!ci.fases && /^[ABC]+$/.test(txt(ci.fases)) && fin(d.va), base = emW ? wDe(Z, ci) : d.va;
      fs.forEach(function (f) { o[f] = 0; });
      if (ok) ci.fases.split("").forEach(function (f) { if (o[f] != null) { o[f] += base / ci.fases.length; tot[f] += base / ci.fases.length; } });
      else sem.push(ci);
      linhas.push({ ci: ci, f: o, ok: ok, base: base });
    });
    return { fases: fs, tot: tot, linhas: linhas, sem: sem, emW: emW, un: emW ? "W" : "VA" };
  }
  var FILL_FASE = { A: KU.fillA, B: KU.fillB, C: KU.fillC };
  function resumoTabela(D, A0, x, y, W, Z, pend) {
    var cf = cargaFases(Z), nf = cf.fases.length, wf = 0.33 * W / nf, ws = [0.06 * W, 0.30 * W, 0.10 * W, 0.12 * W, 0.09 * W];
    var cab = ["Circ.", "Descrição", "Disjuntor", "Potência (VA)", "Seção (mm²)"], al = ["C", "C", "C", "C", "C"];
    cf.fases.forEach(function (f) { ws.push(wf); cab.push({ t: "Fase " + f, fill: FILL_FASE[f] }); al.push("C"); });
    var linhas = [], totVA = 0, fl = [null, null, null, null, null], un = cf.un;
    cf.fases.forEach(function (f) { fl.push(FILL_FASE[f]); });
    linhas.push({ cel: ["QD"], rotulo: true });
    cf.linhas.forEach(function (l) {
      var ci = l.ci, d = ci.dim, cel = [ci.id.replace(/^C/, ""), ci.nome, br(d.In, 2) + " A", br(d.va, 0) + " VA", sec(d.secao)], pe = [0, 0, !d.In, !fin(d.va), !fin(d.secao)];
      cf.fases.forEach(function (f) { if (!l.ok) { cel.push(f === cf.fases[0] ? "SEM FASE" : "-"); pe.push(true); } else { cel.push(br(l.f[f], 0) + " " + un); pe.push(false); } });
      if (fin(d.va)) totVA += d.va;
      linhas.push({ cel: cel, fill: fl, pend: pe });
    });
    cf.sem.forEach(function (ci) { pend.push(ci.id + " (" + ci.nome + "): sem fase definida - a carga NÃO entra nos totais por fase (resolva o fornecimento ou a fase do circuito)."); });
    var g = Z.geral, al0 = Z.alimentador, cel0 = [cf.fases.join(","), "QD", g.In ? br(g.In, 2) + " A" : "?", br(totVA, 0) + " VA", al0 && al0.secao ? sec(al0.secao) : "-"], pe0 = [0, 0, !g.In, 0, !(al0 && al0.secao)];
    cf.fases.forEach(function (f) { cel0.push(br(cf.tot[f], 0) + " " + un); pe0.push(false); });
    linhas.push({ cel: ["QG"], rotulo: true });
    linhas.push({ cel: cel0, fill: fl, pend: pe0, forte: true });
    var celT = ["Totais:", "", "", br(totVA, 0) + " VA", ""]; cf.fases.forEach(function (f) { celT.push(br(cf.tot[f], 0) + " " + un); });
    linhas.push({ cel: celT, forte: true, h: 2.6 });
    y = tab(D, A0, x, y, ws, cab, linhas, KU.h, "ELE-TABELA-RESUMO", al, { titulo: "Resumo dos Circuitos" });
    if (!cf.emW) y = nota(D, A0, x, y + 0.5, W, "Fases em VA: nem todo circuito tem a potência ativa (W) dos pontos no modelo (W = VA x 0,92 nos aparelhos que não são de aquecimento, CEMIG ND-5.1).", K2.vermelho);
    if (cf.sem.length) y = nota(D, A0, x, y + 0.5, W, cf.sem.length + " circuito(s) sem fase: " + cf.sem.map(function (c) { return c.id; }).join(", ") + " - não somados nos totais por fase (pendência).", K2.vermelho);
    return y;
  }
  /* quantitativo de cabos por função e seção (EleCircuitos.cabos: trechos do modelo × condutores × seção do dimensionamento + sobras + alimentador);
     cabeçalho colorido como o modelo (fase A vermelha, B cinza, C amarela, neutro azul, terra verde, retorno branco); sem fiação -> "-" e pendência */
  function cabosTabela(D, A0, x, y, W, Z, pend) {
    var EC = dep("EleCircuitos", "./elecircuitos.js"), lista = null;
    try { lista = EC && EC.cabos ? EC.cabos(Z) : null; } catch (e) { lista = null; }
    var cols = {}, estim = 0;
    arr(lista).forEach(function (c) {
      var f = FUNC[c.cor]; if (!f || !fin(c.metros) || !fin(c.secao)) return;
      var k = f[2] + "|" + c.secao, o = cols[k] || (cols[k] = { nome: f[0], tipo: f[1], ordem: f[2], secao: c.secao, m: 0, fill: f[3] });
      o.m += c.metros; estim += c.estimado || 0;
    });
    var ks = Object.keys(cols).map(function (k) { return cols[k]; }).sort(function (a1, b1) { return a1.ordem - b1.ordem || a1.secao - b1.secao; });
    if (!ks.length) {
      y = tab(D, A0, x, y, [W * 0.5, W * 0.5], ["Função / seção (mm²)", "Metros"], [{ cel: ["-", "-"], pend: [true, true] }], KU.h, "ELE-TABELA-CABOS", ["C", "C"], { titulo: "Quantitativo de Cabos Flexíveis em Metros (mm²)", hTit: 3.6 });
      pend.push("Quantitativo de cabos: a fiação do modelo não tem condutores lançados (trechos × circuitos) - rode \"Circuitos e quadro\" com os eletrodutos traçados; nada foi inventado.");
      return y;
    }
    var tot = 0;
    for (var i = 0; i < ks.length; i += KU.maxColuna) {
      var ch = ks.slice(i, i + KU.maxColuna), ws = ch.map(function () { return W / Math.min(KU.maxColuna, ks.length); });
      y = tab(D, A0, x, y, ws, null, [{ cel: ch.map(function (k) { return k.nome + " " + sec(k.secao); }), fill: ch.map(function (k) { return k.fill; }), forte: true, h: 2.0 }, { cel: ch.map(function (k) { return br(k.m, 1); }), fill: ch.map(function (k) { return k.fill; }), forte: true }], KU.h, "ELE-TABELA-CABOS", ch.map(function () { return "C"; }), i ? null : { titulo: "Quantitativo de Cabos Flexíveis em Metros (mm²)", hTit: 3.6 });
      ch.forEach(function (k) { tot += k.m; });
    }
    y = nota(D, A0, x, y + 0.4, W, "Total " + br(tot, 1) + " m (inclui a sobra em cada caixa e no quadro e o alimentador, critério RA)." + (estim > 0 ? " Inclui " + br(estim, 1) + " m ESTIMADOS (ponto sem eletroduto até o quadro)." : ""), estim > 0 ? K2.vermelho : undefined);
    if (estim > 0) pend.push("Quantitativo de cabos: " + br(estim, 1) + " m estimados (ponto sem eletroduto até o quadro) - trace os eletrodutos.");
    return y;
  }
  /* o quantitativo do modelo (BimInst.qto): opcoes.qto, ou o calculado com opcoes.estado + opcoes.avaliarFam */
  function qtoDe(op) {
    var q = op && op.qto; if (q) return q;
    if (op && op.estado) { var BI = dep("BimInst", "./biminst.js"); if (BI && BI.qto) { try { return BI.qto(op.estado, op.avaliarFam); } catch (e) { return null; } } }
    return null;
  }
  var GRUPOS_PECAS = ["Caixas de Embutir", "Disjuntores e Proteções", "Interruptores", "Interruptores + Tomadas", "Placas", "Quadros", "Tomadas", "Tomadas para Telefone e Antena de TV", "Luminárias", "Outros"];
  function grupoDe(it) {
    var pc = txt(it.peca), s = pc + " " + txt(it.material) + " " + txt(it.nome);
    if (/^caixa/.test(pc)) return 0;
    if (/interruptor/.test(pc) && /tomada/.test(txt(it.material) + " " + txt(it.nome))) return 3;
    if (/interruptor/.test(pc)) return 2;
    if (/placa/.test(pc)) return 4;
    if (/quadro/.test(pc)) return 5;
    if (/tomada/.test(pc) && /(^| )(tv|rj|telef|antena)/i.test(s)) return 7;
    if (/tomada/.test(pc)) return 6;
    if (/luminaria/.test(pc)) return 8;
    return 9;
  }
  function pecasTabela(D, A0, x, y, W, Z, q, pend) {
    var gr = GRUPOS_PECAS.map(function () { return []; }), cont = {};
    function conta(k, desc, n) { var o = cont[k] || (cont[k] = { d: desc, n: 0 }); o.n += n; }
    Z.circuitos.forEach(function (ci) { conta("c|" + ci.polos + "|" + ci.dim.In, "Disjuntor termomagnético " + ci.polos + "P " + (ci.dim.In || "?") + " A (circuito)", 1); });
    if (Z.geral && Z.geral.In) conta("g|" + Z.geral.polos + "|" + Z.geral.In, "Disjuntor geral " + Z.geral.polos + "P " + Z.geral.In + " A", 1);
    arr(Z.drs).forEach(function (g) { conta("d|" + g.polos + "|" + g.In, "IDR Interruptor Diferencial Residual " + (g.polos === 2 ? "Bipolar" : g.polos + "P") + " In=" + (g.In || "?") + "A, 30mA", 1); });
    if (Z.dps && Z.dps.exigido) conta("p", "DPS - Dispositivo de proteção contra surtos, classe " + Z.dps.classe + ", Uc " + Z.dps.uc_V + " V, In " + Z.dps.in_kA + " kA", Z.dps.quantidade);
    Object.keys(cont).sort().forEach(function (k) { gr[1].push({ d: cont[k].d, n: cont[k].n }); });
    if (q) {
      arr(q.pecas).filter(function (g) { return g.sistema === "eletrica"; }).concat(arr(q.dispositivos)).forEach(function (g) {
        var d = txt(g.rotulo || (g.sinapi && g.sinapi.rotulo) || g.nome); gr[grupoDe(g)].push({ d: d, n: g.n != null ? g.n : g.quantidade });
      });
    } else pend.push("Lista de materiais (peças): o quantitativo do modelo não foi informado (opcoes.estado/avaliarFam ou opcoes.qto) - só as proteções do projeto estão listadas; nada foi inventado.");
    var linhas = [], total = 0;
    gr.forEach(function (it) { it.forEach(function (o) { if (fin(o.n)) total += o.n; }); });
    linhas.push({ cel: ["", String(total)], al: ["E", "C"] });
    gr.forEach(function (it, k) {
      if (!it.length) return;
      linhas.push({ cel: [GRUPOS_PECAS[k]], peq: true });
      it.forEach(function (o) { linhas.push({ cel: [o.d, fin(o.n) ? String(o.n) : "-"], pend: [false, !fin(o.n)] }); });
    });
    if (!q) linhas.push({ cel: ["quantitativo do modelo não informado", "-"], pend: [true, true] });
    return tab(D, A0, x, y, [W * 0.86, W * 0.14], [{ t: "Descrição do Material" }, { t: "Quantidade (peças)" }], linhas, KU.h, "ELE-TABELA-PECAS", ["E", "C"], { titulo: "Lista de Materiais - Peças" });
  }
  function eletrodutosTabela(D, A0, x, y, W, q, pend) {
    var linhas = [];
    if (q) {
      arr(q.tubos).filter(function (g) { return g.sistema === "eletrica"; }).sort(function (a1, b1) { return (a1.dn - b1.dn) || (txt(a1.material) < txt(b1.material) ? -1 : 1); }).forEach(function (g) {
        var d = txt(g.sinapi && g.sinapi.rotulo || g.nome || g.material).replace(/ \(elétrica \(eletroduto\)\)$/, "");
        linhas.push({ cel: [d, "Ø" + (g.dn || "?"), br(g.metros != null ? g.metros : g.quantidade, 2) + " m"] });
      });
    }
    if (!linhas.length) { linhas.push({ cel: ["quantitativo do modelo sem eletrodutos", "-", "-"], pend: [true, true, true] }); pend.push("Lista de materiais (eletrodutos): o quantitativo do modelo não tem eletrodutos - nada foi inventado."); }
    return tab(D, A0, x, y, [W * 0.62, W * 0.17, W * 0.21], ["Descrição do Material", "Diâmetro Nominal", "Comprimento (m)"], linhas, KU.h, "ELE-TABELA-ELETRODUTOS", ["E", "C", "C"], { titulo: "Lista de Materiais - Eletrodutos" });
  }

  /* ---- símbolos do modelo (os mesmos na planta e nas legendas) */
  /* marca de condutor: fase = traço vermelho; neutro = traço azul com pé (L); terra = traço verde com barra em cima (T); retorno = traço preto */
  var CAM_COND = { F: "ELE-COND-F", N: "ELE-COND-N", PE: "ELE-COND-T", R: "ELE-COND-R" };
  function marcaCond(D, px, py, ux, uy, tipo, tam) {
    var nx = -uy, ny = ux, s = tam || 1.1, cam = CAM_COND[tipo] || "ELE-COND-R";
    L(D, px - nx * s, py - ny * s, px + nx * s, py + ny * s, cam);
    if (tipo === "N") L(D, px - nx * s, py - ny * s, px - nx * s - ux * s * 0.9, py - ny * s - uy * s * 0.9, cam);
    if (tipo === "PE") L(D, px + nx * s - ux * s * 0.9, py + ny * s - uy * s * 0.9, px + nx * s + ux * s * 0.9, py + ny * s + uy * s * 0.9, cam);
  }
  function arcoPts(x1, y1, x2, y2, alt, n0) {
    var pts = [], cx = (x1 + x2) / 2 + (y2 - y1) * 0 , cy = (y1 + y2) / 2, nx = -(y2 - y1), ny = (x2 - x1), m = Math.sqrt(nx * nx + ny * ny) || 1;
    var qx = cx + nx / m * alt * 2, qy = cy + ny / m * alt * 2;
    for (var i = 0; i <= n0; i++) { var t = i / n0; pts.push([(1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * qx + t * t * x2, (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * qy + t * t * y2]); }
    return pts;
  }
  /* disjuntor termomagnético do modelo: dois círculos, arco entre eles e um traço vermelho por polo */
  function simDisj(D, cx, cy, polos) {
    D.circ(cx - 4.6, cy, 1.1, "ELE-SIMBOLO", cm("ELE-SIMBOLO")); D.circ(cx + 4.6, cy, 1.1, "ELE-SIMBOLO", cm("ELE-SIMBOLO"));
    D.poli(arcoPts(cx - 3.6, cy - 0.6, cx + 3.6, cy - 0.6, 3.4, 14), "ELE-SIMBOLO", false, cm("ELE-SIMBOLO"));
    for (var k = 0; k < polos; k++) { var xx = cx + (k - (polos - 1) / 2) * 1.5; L(D, xx, cy - 5.4, xx + 0.3, cy - 2.4, "ELE-COND-F"); }
  }
  function simDR(D, cx, cy, hh) { R(D, cx - 4, cy - hh / 2, 8, hh, "ELE-SIMBOLO"); R(D, cx - 2, cy - hh / 2 - 1.2, 4, 1.2, "ELE-SIMBOLO"); T(D, cx, cy, "DR", 2.0, { al: "C", meio: true }); }
  function simTerra(D, cx, cy) { L(D, cx, cy, cx, cy + 2, "ELE-PE"); L(D, cx - 3, cy + 2, cx + 3, cy + 2, "ELE-PE"); L(D, cx - 2, cy + 3.2, cx + 2, cy + 3.2, "ELE-PE"); L(D, cx - 1, cy + 4.4, cx + 1, cy + 4.4, "ELE-PE"); }
  function simDPS(D, cx, cy) {
    R(D, cx - 4, cy, 8, 10, "ELE-SIMBOLO"); T(D, cx - 3.4, cy + 2.2, "DPS", 1.7);
    D.cheio([[cx + 0.8, cy + 3], [cx - 1.4, cy + 6.6], [cx + 0.1, cy + 6.6], [cx - 0.9, cy + 9.4], [cx + 1.7, cy + 5.4], [cx + 0.2, cy + 5.4]], "#000", cm("ELE-SIMBOLO"));
    simTerra(D, cx, cy + 10);
  }
  function simKwh(D, cx, cy, w) { R(D, cx - w / 2, cy - 4, w, 8, "ELE-SIMBOLO"); L(D, cx - w / 2 + 3.2, cy - 4, cx - w / 2 + 3.2, cy + 4, "ELE-SIMBOLO"); T(D, cx + 1.4, cy, "kW.h", 2.4, { al: "C", meio: true }); }

  /* a curva do disjuntor do projeto: a do item do catálogo (Steck SDD, curva C - dispositivos.json, fonte com URL e data); sem catálogo, só a corrente */
  function labDisj(polos, In) {
    var EC = dep("EleCatalogoDados", "./elecatalogodados.js"), cv = "";
    try { var it = EC && EC.item ? EC.item({ 1: "disj_mini_1p_steck", 2: "disj_mini_2p_steck", 3: "disj_mini_3p_steck" }[polos || 1]) : null; cv = it && it.eletrico && it.eletrico.curva || ""; } catch (e) { cv = ""; }
    return cv ? cv + (In || "?") : (In || "?") + "A";
  }
  /* ---- quadro de distribuição DESENHADO (vetorial) a partir dos dispositivos do projeto: geral, DPS, DR e disjuntores no trilho */
  function quadroDesenho(D, A0, x, y, w, Z) {
    var U = 5.4, UR = 12, pad = 7, mH = 17, passo = 27, grupos = [], semDr = [];
    var g0 = Z.geral && Z.geral.In ? [{ k: "geral", u: Z.geral.polos || 1, lab: labDisj(Z.geral.polos, Z.geral.In) }] : [];
    var gd = []; if (Z.dps && Z.dps.exigido) for (var i = 0; i < Z.dps.quantidade; i++) gd.push({ k: "dps", u: 1, lab: "DPS" });
    var gg = g0.concat(gd); if (gg.length) grupos.push(gg);
    Z.circuitos.forEach(function (ci) { if (!ci.drId) semDr.push({ k: "disj", u: ci.polos || 1, lab: labDisj(ci.polos, ci.dim.In), id: ci.id }); });
    var corr = []; semDr.forEach(function (m) { corr.push(m); }); if (corr.length) grupos.push(corr);
    arr(Z.drs).forEach(function (d) {
      var gm = [{ k: "dr", u: d.polos || 2, lab: "IDR " + (d.In || "?") + "A 30mA" }];
      Z.circuitos.forEach(function (ci) { if (ci.drId === d.id) gm.push({ k: "disj", u: ci.polos || 1, lab: labDisj(ci.polos, ci.dim.In), id: ci.id }); });
      grupos.push(gm);
    });
    /* distribui nas fileiras: um dispositivo não parte; o grupo do DR fica junto quando cabe */
    var fil = [[]], uso = 0;
    grupos.forEach(function (gm, ig) {
      var un = gm.reduce(function (s, m) { return s + m.u; }, 0);
      if (ig && gm[0].k === "dr" && uso + un > UR && uso > 0) { fil.push([]); uso = 0; }
      gm.forEach(function (m) { if (uso + m.u > UR) { fil.push([]); uso = 0; } fil[fil.length - 1].push(m); uso += m.u; });
    });
    var W0 = UR * U + 2 * pad, hh = fil.length * passo + 22, x0 = x + (w - W0) / 2;
    /* caixa: borda grossa, painel cinza, furos de entrada de eletroduto nas bordas */
    D.fundo(x0, y, W0, hh, "#e6e6e6"); R(D, x0, y, W0, hh, "ELE-QUADRO"); R(D, x0 + 3.2, y + 3.2, W0 - 6.4, hh - 6.4, "ELE-QUADRO"); D.fundo(x0 + 3.6, y + 3.6, W0 - 7.2, hh - 7.2, "#b7b7b7");
    for (var f = 0; f < 8; f++) { var xe = x0 + 6 + f * (W0 - 12) / 7.5; D.poli(arcoPts(xe - 1.6, y + 1.6, xe + 1.6, y + 1.6, 0.5, 6).concat(arcoPts(xe + 1.6, y + 1.6, xe - 1.6, y + 1.6, -0.5, 6)), "ELE-QUADRO", true, cm("ELE-QUADRO")); }
    for (var f2 = 0; f2 < 5; f2++) { var ye = y + 8 + f2 * (hh - 16) / 4; D.circ(x0 + 1.6, ye, 0.9, "ELE-QUADRO", cm("ELE-QUADRO")); D.circ(x0 + W0 - 1.6, ye, 0.9, "ELE-QUADRO", cm("ELE-QUADRO")); }
    fil.forEach(function (fl, ifl) {
      var yr = y + 12 + ifl * passo, xx = x0 + pad;
      L(D, x0 + pad - 2, yr + mH / 2, x0 + W0 - pad + 2, yr + mH / 2, "ELE-QUADRO");
      fl.forEach(function (m) {
        var wm = m.u * U - 0.4;
        D.fundo(xx, yr, wm, mH, m.k === "dps" ? "#f3d0d0" : "#f4f4f4"); R(D, xx, yr, wm, mH, "ELE-QUADRO");
        for (var t = 0; t < m.u; t++) { D.circ(xx + (t + 0.5) * U - 0.2, yr + 1.6, 0.8, "ELE-QUADRO", cm("ELE-QUADRO")); D.circ(xx + (t + 0.5) * U - 0.2, yr + mH - 1.6, 0.8, "ELE-QUADRO", cm("ELE-QUADRO")); }
        if (m.k === "dr") {
          D.fundo(xx + 0.8, yr + 4, 2.4, 2.4, VM); D.fundo(xx + 0.8, yr + 8, 2.4, 3.4, VM);
          T(D, xx + 4.2, yr + 6.2, "IDR", 1.3, { peso: 0.1 }); T(D, xx + 4.2, yr + 8.6, m.lab.split(" ")[1], 1.3); T(D, xx + 4.2, yr + 11.0, "30mA", 1.3);
        } else {
          D.fundo(xx + wm * 0.22, yr + 9.5, wm * 0.56, 4.2, VM);
          T(D, xx + wm / 2, yr + 8.2, m.lab, 1.5, { al: "C", rot: -90, peso: 0.1, meio: true });
        }
        xx += m.u * U;
      });
    });
    return y + hh;
  }

  /* ---- entrada: rede da concessionária -> kW.h -> disjuntor -> QD (dentro de retângulos tracejados, como o modelo) */
  function entradaDiagrama(D, A0, x, y, W, Z) {
    var dm = Z.demanda, en = dm.entrada, al = Z.alimentador, g = Z.geral, totVA = 0, hh = 84;
    Z.circuitos.forEach(function (ci) { if (fin(ci.dim.va)) totVA += ci.dim.va; });
    R(D, x, y, W, hh, "ELE-QD");
    T(D, x + 4, y + 7, "Painel  ENTRADA", 3.2);
    T(D, x + 4, y + 14, "Pot. Instalada", 3.0); T(D, x + 4 + 44, y + 14, br(totVA, 0) + " VA", 3.0);
    T(D, x + 4, y + 21, "Pot. Demanda", 3.0); T(D, x + 4 + 44, y + 21, fin(dm.demanda_kVA) ? br(dm.demanda_kVA * 1000, 0) + " VA" : "não verificado", 3.0, { cor: fin(dm.demanda_kVA) ? undefined : K2.vermelho });
    var yc = y + 50, xr = x + 8;
    L(D, xr, y + 30, xr, y + hh - 6, "ELE-BARRA"); T(D, xr - 2, yc + 14, "Rede da Concessionária", 2.4, { rot: -90, al: "C" });
    D.ponto(xr, yc, 1.0);
    L(D, xr, yc, xr + 44, yc, "ELE-CIRC");
    var nF = (Z.fases && Z.fases.fases ? Z.fases.fases.length : 1);
    marcaCond(D, xr + 6, yc, 1, 0, "N", 2.2); for (var k = 0; k < nF; k++) marcaCond(D, xr + 9 + k * 2.6, yc, 1, 0, "F", 2.2);
    T(D, xr + 11, yc + 7, (al && al.secao ? "#" + sec(al.secao) : "alimentador não verificado") + "mm²", 2.0, { al: "C", cor: al && al.secao ? undefined : K2.vermelho });
    R(D, xr + 20, yc - 12, 66, 28, "ELE-QD"); T(D, xr + 53, yc - 14, "Quadro de ENTRADA", 2.0, { al: "C" });
    simKwh(D, xr + 36, yc, 20);
    L(D, xr + 46, yc, xr + 58, yc, "ELE-CIRC"); simDisj(D, xr + 66, yc, nF); L(D, xr + 70.6, yc, x + W - 1, yc, "ELE-CIRC");
    T(D, xr + 66, yc - 6.2, (en ? en.disjuntor_A : "?") + " A", 2.2, { al: "C", cor: en ? undefined : K2.vermelho });
    simTerra(D, xr + 53, yc + 16);
    T(D, x + W - 8, yc - 3.6, "QD", 2.2, { al: "C" });
    marcaCond(D, x + W - 17, yc, 1, 0, "N", 2.0); for (var k2 = 0; k2 < nF; k2++) marcaCond(D, x + W - 14 + k2 * 2.4, yc, 1, 0, "F", 2.0); marcaCond(D, x + W - 14 + nF * 2.4, yc, 1, 0, "PE", 2.0);
    T(D, x + W - 10, yc + 6, "# " + (al && al.secao ? sec(al.secao) : "?") + "mm²", 1.8, { al: "C" });
    if (al && al.provisorio) T(D, xr + 11, yc + 11, br(al.comprimento, 1) + " m (PROVISÓRIO)", 1.8, { al: "C", cor: K2.vermelho });
    return tituloSub(D, x, y + hh + 2, "Diagrama Unifilar", 4.4);
  }
  /* ---- legenda do diagrama unifilar (quadro com os símbolos do modelo) */
  function legendaDiagramas(D, A0, x, y, W, Z) {
    var polos = {}; Z.circuitos.forEach(function (ci) { polos[ci.polos] = 1; }); if (Z.geral && Z.geral.polos) polos[Z.geral.polos] = 1;
    var it = [];
    [1, 2, 3].forEach(function (k) { if (polos[k]) it.push(["disj", k, "Disjuntor Termomagnético " + ({ 1: "Monopolar", 2: "Bipolar", 3: "Tripolar" })[k], 12]); });
    it.push(["cond", 0, "Condutores Neutro, Fase, Terra, respectivamente", 9]);
    if (Z.dps && Z.dps.exigido) it.push(["dps", 0, "DPS-Dispositivo de proteção contra surtos", 19]);
    if (arr(Z.drs).length) it.push(["dr", 0, "IDR-Interruptor Diferencial Residual (Imax=30mA)", 14]);
    it.push(["med", 0, "Medidor de Energia", 11]);
    R(D, x, y, W, 8, "ELE-LEGENDA"); T(D, x + W / 2, y + 4, "LEGENDA  DIAGRAMAS", 3.0, { al: "C", meio: true, peso: 0.2 });
    var yy = y + 8, cx = x + 11;
    it.forEach(function (r) {
      R(D, x, yy, W, r[3], "ELE-LEGENDA"); L(D, x + 22, yy, x + 22, yy + r[3], "ELE-LEGENDA");
      var cy = yy + r[3] / 2 + (r[0] === "disj" ? 1.5 : 0);
      if (r[0] === "disj") simDisj(D, cx, cy + 1, r[1]);
      else if (r[0] === "cond") { L(D, x + 2, cy, x + 20, cy, "ELE-CIRC"); marcaCond(D, x + 6, cy, 1, 0, "N", 1.2); marcaCond(D, x + 11, cy, 1, 0, "F", 1.2); marcaCond(D, x + 15, cy, 1, 0, "PE", 1.2); }
      else if (r[0] === "dps") simDPS(D, cx, yy + 2);
      else if (r[0] === "dr") simDR(D, cx, cy + 1, 7);
      else simKwh(D, cx, cy, 15);
      A0.quebrar(r[2], 1.9, W - 25).forEach(function (s, j, a0) { T(D, x + 24, cy + (j - (a0.length - 1) / 2) * 2.6, s, 1.9, { meio: true }); });
      yy += r[3];
    });
    return tituloSub(D, x, yy + 2, "Legenda Diagrama Unifilar", 4.4);
  }

  /* ---- a planta no modelo: símbolos azuis, rótulo "circuito / potência", letra de comando, legenda em coluna */
  var LETRAS = "abcdefghijklmnopqrstuvwxyz";
  function letraN(i) { return i < 26 ? LETRAS.charAt(i) : LETRAS.charAt(Math.floor(i / 26) - 1) + LETRAS.charAt(i % 26); }
  function intTipo(p) { var t0 = txt(p.tipoId); return { tipo: /^p/.test(t0) ? "p" : (/^i/.test(t0) ? "i" : (/^m/.test(t0) ? "m" : "s")), nm: Number(t0.replace(/\D/g, "")) || 1 }; }
  /* a letra de comando: cada MÓDULO de interruptor, em ordem de leitura do modelo, recebe a, b, c…. A luminária leva a letra do módulo que a comanda quando o
     modelo tem o VÍNCULO (js/eletilum.js grava inst.Comando na luminária e inst.Comandos no interruptor, um id por módulo); sem vínculo, a do interruptor do
     ambiente pela ordem (o modelo não diz qual comanda qual - rótulo de projeto, não norma), contado em `semVinculo` (a folha avisa). */
  function letrasComando(Z, estado) {
    var porAmb = {}, mapa = {}, mod = {}, k = 0, fam = {}, porCmd = {}, semVinculo = 0;
    arr(estado && estado.familias).forEach(function (f) { if (f && f.id != null) fam[String(f.id)] = f; });
    arr(Z.pontos).forEach(function (p) {
      var o = porAmb[p.amb] || (porAmb[p.amb] = { ints: [], luz: [] });
      if (p.kind === "interruptor") {
        var nm = intTipo(p).nm, ls = []; for (var m = 0; m < nm; m++) ls.push(letraN(k++));
        o.ints.push(p); mod[p.id] = ls; mapa[p.id] = ls[0];
        var I = fam[String(p.id)] && fam[String(p.id)].inst || {};
        txt(I.Comandos).split(",").forEach(function (cid, m2) { cid = cid.trim(); if (cid && !porCmd[cid]) porCmd[cid] = ls[Math.min(m2, ls.length - 1)]; });
      } else if (p.kind === "luz") o.luz.push(p);
    });
    Object.keys(porAmb).forEach(function (am) {
      var o = porAmb[am]; if (!o.ints.length) return;
      o.luz.forEach(function (p, j) {
        var I = fam[String(p.id)] && fam[String(p.id)].inst || {}, cid = txt(I.Comando).trim();
        if (cid && porCmd[cid]) { mapa[p.id] = porCmd[cid]; return; }
        semVinculo++;
        var pi = o.ints[Math.min(j, o.ints.length - 1)]; mapa[p.id] = mapa[(o.ints[0].paralelo || /^p/.test(txt(o.ints[0].tipoId))) ? o.ints[0].id : pi.id];
      });
    });
    return { mapa: mapa, modulos: mod, semVinculo: semVinculo };
  }
  /* classe da tomada pela altura: a mais perto das alturas do EleRegras.criterios (baixa 30, média 120, alta 210 cm - padrão RA adotado pelo Rogério em 20/11/2026) */
  function classeAlt(h, C) {
    var al = [["baixa", C.alturaBaixa], ["media", C.alturaMedia], ["alta", C.alturaAlta]].filter(function (x) { return x[1] && fin(x[1].valor); }), best = al[0] || ["baixa", { valor: h }], bd = 1e9;
    al.forEach(function (x) { var d = Math.abs(h - x[1].valor); if (d < bd) { bd = d; best = x; } });
    return { classe: best[0], alt: best[1].valor };
  }
  function ampDe(p) { var m = /^t(\d+)$/.exec(txt(p.tipoId)); return m ? +m[1] : 10; }
  function condTrecho(Z, byId, t) {
    var o = { F: 0, N: 0, PE: 0, R: 0 }, any = false;
    arr(Z.porTrecho && Z.porTrecho[t]).forEach(function (id) { var ci = byId[id], c = ci && ci.cond && ci.cond[t]; if (c) { any = true; o.F += c.F || 0; o.N += c.N || 0; o.PE += c.PE || 0; o.R += c.R || 0; } });
    return any ? o : null;
  }
  /* símbolos da planta (azuis, como o modelo), em coordenadas LOCAIS: x = para dentro do ambiente (a normal da parede), y = ao longo da parede, origem na FACE da
     parede onde o ponto está. O quadradinho TOCA a face e o resto aponta para dentro do ambiente; na legenda ang = 0. MEDIDAS tiradas do PDF do modelo (20/11/2026,
     520 dpi): quadradinho 1,1 x 1,5 mm, tomada de 5,3 mm de comprimento com triângulo de 3,3 mm de altura, círculo de 20 A r = 1,9 mm, interruptor r = 1,45 mm,
     ponto de força r = 1,4 mm, círculo da luz r = 3,4 mm com texto de 3 mm, cúpula da luz de parede r = 2,8 mm, quadro 7,0 x 2,3 mm. */
  function xfm(cx, cy, ang) { var c0 = Math.cos(ang || 0), s0 = Math.sin(ang || 0); return function (x, y) { return [cx + x * c0 - y * s0, cy + x * s0 + y * c0]; }; }
  function plL(D, f, pts, fechado, cam) { D.poli(pts.map(function (q) { return f(q[0], q[1]); }), cam, fechado, cm(cam)); }
  function flL(D, f, pts, cor, cam) { D.cheio(pts.map(function (q) { return f(q[0], q[1]); }), cor, cm(cam)); }
  function ciL(D, f, x, y, r, cam) { var p = f(x, y); D.circ(p[0], p[1], r, cam, cm(cam)); }
  function lnL(D, f, x1, y1, x2, y2, cam) { var a1 = f(x1, y1), b1 = f(x2, y2); L(D, a1[0], a1[1], b1[0], b1[1], cam); }
  function sqL(D, f, x0, y0, w, h, cam) { plL(D, f, [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]], true, cam); }
  function discoL(D, f, x, y, r, cor) { var pts = []; for (var i = 0; i < 20; i++) pts.push([x + r * Math.cos(i * Math.PI / 10), y + r * Math.sin(i * Math.PI / 10)]); flL(D, f, pts, cor || AZ, "ELE-PONTO"); }
  function simTomada(D, cx, cy, classe, amp, piso, ang, sc, emb) {
    var f = xfm(cx, cy, ang), tri = [[2.25, -1.65], [5.3, 0], [2.25, 1.65]];
    if (!sc) { var bx = emb ? 0.45 : 0; sqL(D, f, bx, -0.75, 1.1, 1.5, "ELE-PONTO"); lnL(D, f, bx + 1.1, 0, 2.25, 0, "ELE-PONTO"); }
    if (classe === "alta" || (piso && amp >= 20)) flL(D, f, tri, AZ, "ELE-PONTO"); else if (classe === "media") flL(D, f, [[2.25, 0], [5.3, 0], [2.25, 1.65]], AZ, "ELE-PONTO");
    plL(D, f, tri, true, "ELE-PONTO");
    if (amp >= 20 && !piso) ciL(D, f, 3.4, 0, 1.9, "ELE-PONTO");
    if (piso) plL(D, f, [[1.7, -2.1], [5.9, -2.1], [5.9, 2.1], [1.7, 2.1]], true, "ELE-PONTO");
  }
  /* ponto de força: quadradinho + círculo; com placa (TUE) o círculo é CHEIO com uma faixa branca no meio; ligação direta / "h=x": círculo vazado com a faixa de 2 traços; haste à direita */
  function simPontoForca(D, cx, cy, hx, ang, sc, emb) {
    var f = xfm(cx, cy, ang);
    if (!sc) { var bx = emb ? 0.45 : 0; sqL(D, f, bx, -0.75, 1.1, 1.5, "ELE-PONTO"); lnL(D, f, bx + 1.1, 0, 2.0, 0, "ELE-PONTO"); }
    if (!hx) { discoL(D, f, 3.4, 0, 1.4); flL(D, f, [[2.05, -0.5], [4.75, -0.5], [4.75, 0.5], [2.05, 0.5]], "#ffffff", "ELE-PONTO"); }
    ciL(D, f, 3.4, 0, 1.4, "ELE-PONTO"); lnL(D, f, 2.1, -0.5, 4.7, -0.5, "ELE-PONTO"); lnL(D, f, 2.1, 0.5, 4.7, 0.5, "ELE-PONTO");
    lnL(D, f, 4.8, 0, 5.3, 0, "ELE-PONTO"); lnL(D, f, 5.3, -1.0, 5.3, 1.0, "ELE-PONTO");
  }
  /* ponto de luz no teto: círculo dividido (potência em cima; circuito | letra embaixo) - o do modelo; na parede: cúpula CHEIA deitada (base reta paralela à parede)
     com a haste e o quadradinho encostado na parede; o texto "100 / 1 a" vai ao lado (legenda) ou no rótulo empilhado (planta, semTexto) */
  function simLuz(D, cx, cy, va, circ, letra, parede, ang, semTexto, sc, emb) {
    var r = 3.4;
    if (parede) {
      var f = xfm(cx, cy, ang), cup = []; for (var i = 0; i <= 14; i++) cup.push([1.9 + 2.8 * Math.sin(i * Math.PI / 14), -2.8 * Math.cos(i * Math.PI / 14)]);
      if (!sc) { var bx = emb ? 0.45 : 0; sqL(D, f, bx, -0.8, 0.9, 1.6, "ELE-PONTO"); lnL(D, f, bx + 0.9, 0, 1.9, 0, "ELE-PONTO"); } flL(D, f, cup, AZ, "ELE-PONTO");
      if (!semTexto) { var pt = f(5.2, 0); T(D, pt[0], pt[1] - 0.8, va, 3.0); T(D, pt[0], pt[1] + 2.8, circ + " " + letra, 3.0); }
      return;
    }
    D.circ(cx, cy, r, "ELE-PONTO2", cm("ELE-PONTO2")); L(D, cx - r, cy, cx + r, cy, "ELE-PONTO2"); L(D, cx, cy, cx, cy + r, "ELE-PONTO2");
    T(D, cx, cy - 1.6, va, 2.8, { al: "C", meio: true }); T(D, cx - 1.7, cy + 1.8, circ, circ.length > 1 ? 2.2 : 2.8, { al: "C", meio: true }); T(D, cx + 1.7, cy + 1.8, letra, 2.8, { al: "C", meio: true });
  }
  /* interruptor: quadradinho + círculo menor; as letras (a em cima, b embaixo, c à direita) em corpo pequeno como o modelo; paralelo = círculo cheio */
  function simInt(D, cx, cy, letras, tipo, ang, flip, sc, pref, emb, lopt) {
    var f = xfm(cx, cy, ang);
    if (letras.length === 1 && tipo !== "p" && lopt && lopt.lat) {
      /* o do modelo: caixinha na parede, um 'cotovelo' lateral e o círculo (r = 1,5 mm) deslocado ao lado do eixo do eletroduto, com o circuito e a letra DENTRO ("1K") */
      var sy = flip ? 1 : -1, bx1 = emb ? 0.45 : 0, cxl = 4.2, cyl = 2.5 * sy, r1 = 1.5, tx1 = (pref ? pref : "") + letras[0], w1 = AP().largTexto(tx1, 1) || 1, tam = Math.min(2.0, 2.6 / w1), pc = f(cxl, cyl);
      if (!sc) { sqL(D, f, bx1, -0.7, 1.0, 1.4, "ELE-PONTO"); lnL(D, f, bx1 + 1.0, 0, 1.8, 0, "ELE-PONTO"); }
      lnL(D, f, 1.8, 0, 1.8, cyl, "ELE-PONTO"); lnL(D, f, 1.8, cyl, cxl - r1, cyl, "ELE-PONTO"); ciL(D, f, cxl, cyl, r1, "ELE-PONTO");
      T(D, pc[0], pc[1], tx1, tam, { al: "C", meio: true });
      return { c: pc, r: r1, texto: tx1, tam: tam };
    }
    if (!sc) { var bx = emb ? 0.45 : 0; sqL(D, f, bx, -0.7, 1.0, 1.4, "ELE-PONTO"); lnL(D, f, bx + 1.0, 0, 2.3, 0, "ELE-PONTO"); } ciL(D, f, 3.8, 0, 1.45, "ELE-PONTO");
    if (tipo === "p") discoL(D, f, 3.8, 0, 1.45);
    if (letras.length > 1 && tipo !== "p") { if (letras.length === 2) lnL(D, f, 2.35, 0, 5.25, 0, "ELE-PONTO"); else { lnL(D, f, 3.8, 0, 3.8, -1.45, "ELE-PONTO"); lnL(D, f, 3.8, 0, 5.0, 0.7, "ELE-PONTO"); lnL(D, f, 3.8, 0, 2.6, 0.7, "ELE-PONTO"); } }
    var n0 = letras.length, fy = flip ? -1 : 1, pos = n0 === 1 ? [[4.9, -2.3 * fy]] : (n0 === 2 ? [[4.9, -2.1 * fy], [4.9, 2.4 * fy]] : [[2.4, -2.4], [1.6, 2.2], [6.1, 0.2]]);
    /* o modelo escreve o circuito colado à letra ("1K") dentro do círculo do interruptor simples; nos conjuntos e no paralelo, junto de cada módulo */
    letras.forEach(function (l1, i) {
      var q = pos[Math.min(i, pos.length - 1)], tx = (pref ? pref : "") + l1;
      if (n0 === 1 && lopt) q = lopt.dentro ? [3.8, 0] : [lopt.x, q[1]];   /* fora do círculo, do lado oposto ao da luminária: o eletroduto termina na caixinha e não passa pelo texto */
      var p = f(q[0], q[1]); T(D, p[0], p[1], tx, pref ? 1.25 : 1.5, { al: "C", meio: true });
    });
  }
  /* o quadro (QD) DENTRO da espessura da parede, com o lado cheio para o ambiente (tw = espessura em mm de papel, lw = largura ao longo da parede) */
  function simQuadro(D, cx, cy, ang, tw, lw) {
    var f = xfm(cx, cy, ang), t0 = tw || 3, w0 = (lw || 7) / 2;
    plL(D, f, [[-t0, -w0], [0, -w0], [0, w0], [-t0, w0]], true, "ELE-PONTO"); flL(D, f, [[-t0, w0], [0, -w0], [0, w0]], AZ, "ELE-PONTO");
    lnL(D, f, -t0 - 3, 0, -t0, 0, "ELE-PONTO"); lnL(D, f, 0, 0, 3, 0, "ELE-PONTO");
  }
  /* legenda da planta (coluna à esquerda embaixo, como o modelo): só os símbolos que existem no projeto; cada linha com borda */
  function legendaPlanta(D, A0, x, y, W, itens, Z) {
    var rh = 7.4, yy = y;
    itens.forEach(function (r) {
      var cx = x + 11, cy = yy + rh / 2, k = r.k, h2 = r.h2 || rh;
      R(D, x, yy, W, h2, "ELE-LEGENDA");
      if (k === "tug") simTomada(D, cx - 2.7, cy, r.classe, r.amp, r.piso, 0);
      else if (k === "luz") simLuz(D, cx, cy, "100", "1", "a", false, 0);
      else if (k === "luzp") { simLuz(D, cx - 1, cy + 3.4, "100", "1", "a", true, -Math.PI / 2, true); T(D, cx + 4.2, cy - 0.4, "100", 3.0); T(D, cx + 4.2, cy + 3.2, "1 a", 3.0); }
      else if (k === "int") simInt(D, cx - 3, cy, r.letras, r.tipo, 0);
      else if (k === "tue") simPontoForca(D, cx - 2.7, cy, false, 0);
      else if (k === "ld") { simPontoForca(D, cx - 2.7, cy, true, 0); T(D, cx - 4.5, cy + 3.4, "h=\"x\"m", 1.5); }
      else if (k === "cp") R(D, cx - 3, cy - 1.5, 6, 3, "ELE-PONTO");
      else if (k === "qd") { R(D, cx - 3.5, cy - 1.15, 7, 2.3, "ELE-PONTO"); D.cheio([[cx - 3.5, cy + 1.15], [cx + 3.5, cy - 1.15], [cx + 3.5, cy + 1.15]], AZ, cm("ELE-PONTO")); L(D, cx - 6.5, cy, cx - 3.5, cy, "ELE-PONTO"); L(D, cx + 3.5, cy, cx + 6.5, cy, "ELE-PONTO"); }
      else if (k === "el") L(D, cx - 6, cy, cx + 6, cy, "ELE-LEGENDA");
      else if (k === "elp") L(D, cx - 6, cy, cx + 6, cy, "ELE-ELETRODUTO-PISO");
      else if (k === "sb") D.circ(cx, cy, 0.9, "ELE-ELETRODUTO", cm("ELE-ELETRODUTO"));
      else if (k === "med") { R(D, cx - 6, cy - 2.4, 12, 4.8, "ELE-PONTO"); T(D, cx - 5, cy - 0.4, "MED", 1.6); }
      else if (k === "cond") { L(D, cx - 7, cy, cx + 7, cy, "ELE-ELETRODUTO"); marcaCond(D, cx - 4.5, cy, 1, 0, "N", 1.2); marcaCond(D, cx - 1.5, cy, 1, 0, "F", 1.2); marcaCond(D, cx + 1.5, cy, 1, 0, "PE", 1.2); marcaCond(D, cx + 4.5, cy, 1, 0, "R", 1.2); }
      var ls = A0.quebrar(r.t, 1.9, W - 25);
      ls.forEach(function (s, j) { T(D, x + 23, cy + (j - (ls.length - 1) / 2) * 2.7, s, 1.9, { meio: true }); });
      yy += h2;
    });
    void Z;
    return tituloSub(D, x, yy + 2, "Legenda Planta Baixa", 4.6);
  }
  /* o CONJUNTO COMPLETO de símbolos da legenda do modelo (todos, mesmo os que o projeto ainda não usa); as alturas vêm do EleRegras.criterios */
  function itensLegendaCompleta(CL) {
    var cn = function (nm) { var al = CL[nm]; return al ? "a " + Math.round(al.valor * 100) + "cm do piso acabado" : "a \"x\" cm do piso acabado"; }, it = [];
    [10, 20].forEach(function (amp) {
      [["baixa", "Baixa", "alturaBaixa"], ["media", "Média", "alturaMedia"], ["alta", "Alta", "alturaAlta"]].forEach(function (c0) { it.push({ k: "tug", classe: c0[0], amp: amp, t: "Tomada " + c0[1] + " 2P+T, " + amp + "A, " + cn(c0[2]) }); });
    });
    it.push({ k: "tug", classe: "baixa", amp: 10, piso: true, t: "Tomada de Piso 2P+T, 10A" }); it.push({ k: "tug", classe: "baixa", amp: 20, piso: true, t: "Tomada de Piso 2P+T, 20A" });
    it.push({ k: "tue", t: "Ponto de Força (tomada de uso específico), a \"x\" cm do piso acabado" }); it.push({ k: "ld", t: "Ponto de Força com saída de fio (ligação direta), a \"x\" cm do piso acabado" });
    it.push({ k: "int", tipo: "s", letras: ["a"], h2: 8, t: "Interruptor simples de uma seção" }); it.push({ k: "int", tipo: "s", letras: ["a", "b"], h2: 11, t: "Conjunto de 2 Interruptores simples" });
    it.push({ k: "int", tipo: "s", letras: ["a", "b", "c"], h2: 12, t: "Conjunto de 3 Interruptores simples" }); it.push({ k: "int", tipo: "p", letras: ["a"], h2: 8, t: "Interruptor paralelo (three-way)" });
    it.push({ k: "cond", t: "Condutores Neutro, Fase, Terra e Retorno, respectivamente" });
    it.push({ k: "luz", h2: 12, t: "Ponto de luz embutido no teto" }); it.push({ k: "luzp", h2: 12, t: "Ponto de luz na parede, a \"x\" cm do piso acabado" });
    it.push({ k: "el", t: "Eletroduto corrugado flexível embutido no teto ou na parede" }); it.push({ k: "elp", t: "Eletroduto embutido no piso" });
    it.push({ k: "qd", h2: 9, t: "Quadro de distribuição de luz e força embutido" }); it.push({ k: "med", t: "Caixa para medidor" });
    return it;
  }
  /* escala da planta que cabe na região (a maior das PL.escalasU); null = nem a 1:250 */
  function geoPlanta(Z, pav) {
    var LE = Z.leitura || {}, pts = [];
    Object.keys(LE.porParede || {}).forEach(function (k) { var w = LE.porParede[k]; if ((w.pav || 0) === pav.k && arr(w.pts).length >= 3) arr(w.pts).forEach(function (q) { pts.push(q); }); });
    arr(LE.ambientes).filter(function (x) { return (x.pav || 0) === pav.k; }).forEach(function (x) { arr(x.pts).forEach(function (q) { pts.push(q); }); });
    if (!pts.length) return null;
    var xs = pts.map(function (q) { return q[0]; }), zs = pts.map(function (q) { return q[1]; });
    return { dx: Math.max.apply(null, xs) - Math.min.apply(null, xs), dz: Math.max.apply(null, zs) - Math.min.apply(null, zs) };
  }
  function escalaPlanta(Z, pav, Wd, Hd) {
    var g = geoPlanta(Z, pav); if (!g) return null;
    for (var i = 0; i < PL.escalasU.length; i++) { var k0 = 1000 / PL.escalasU[i]; if (g.dx * k0 <= Wd && g.dz * k0 <= Hd) return PL.escalasU[i]; }
    return null;
  }
  /* a PLANTA no estilo do modelo: paredes cinza cheias, área externa tracejada, ligações RETAS ponto a ponto com seta no meio e marcas de condutor CORTANDO a linha
     (nº do circuito acima), símbolos azuis ENCOSTADOS na face da parede e voltados para dentro do ambiente, QD dentro da espessura da parede, rótulos empilhados.
     O traçado é só REPRESENTAÇÃO: os metros de eletroduto e de cabo das listas vêm do modelo 3D. */
  function folhaPlantaRef(c, pav, reg) {
    var D = c.D, a = reg, A0 = AP(), Z = c.A, LE = Z.leitura || {}, ERc = dep("EleRegras", "./eleregras.js"), C0 = ERc && ERc.criterios ? ERc.criterios() : {}, ER0 = ERc;
    var walls = Object.keys(LE.porParede || {}).map(function (k) { return LE.porParede[k]; }).filter(function (w) { return (w.pav || 0) === pav.k && arr(w.pts).length >= 3; });
    var ambs = arr(LE.ambientes).filter(function (x) { return (x.pav || 0) === pav.k; }), pts = [];
    walls.forEach(function (w) { arr(w.pts).forEach(function (q) { pts.push(q); }); }); ambs.forEach(function (x) { arr(x.pts).forEach(function (q) { pts.push(q); }); });
    if (!pts.length) return { escala: "SEM ESCALA" };
    var x0 = Math.min.apply(null, pts.map(function (q) { return q[0]; })), x1 = Math.max.apply(null, pts.map(function (q) { return q[0]; }));
    var z0 = Math.min.apply(null, pts.map(function (q) { return q[1]; })), z1 = Math.max.apply(null, pts.map(function (q) { return q[1]; }));
    var Wd = a.w - 16, Hd = a.h - 24, esc = PL.escalasU[PL.escalasU.length - 1];
    for (var i = 0; i < PL.escalasU.length; i++) { var k0 = 1000 / PL.escalasU[i]; if ((x1 - x0) * k0 <= Wd && (z1 - z0) * k0 <= Hd) { esc = PL.escalasU[i]; break; } }
    var k = 1000 / esc, ox = a.x + 8 + (Wd - (x1 - x0) * k) / 2, oy = a.y + 4 + Math.max(0, (Hd - (z1 - z0) * k) / 2);
    function P(x, z) { return [ox + (x - x0) * k, oy + (z - z0) * k]; }
    var areaD = [a.x + 2, a.y + 2, a.x + a.w - 2, a.y + a.h - 18];
    /* arquitetura: paredes cinza cheias; área externa/coberta tracejada; vãos abrem a parede */
    walls.forEach(function (w) { var q = w.pts.map(function (p0) { return P(p0[0], p0[1]); }); D.cheio(q, "#a8a8a8", cm("ELE-ARQ")); D.poli(q, "ELE-ARQ", true, cm("ELE-ARQ")); });
    ambs.forEach(function (x) { if (x.cls && x.cls.grupo === "externa") D.poli(arr(x.pts).map(function (p0) { return P(p0[0], p0[1]); }), "ELE-AREXT", true, cm("ELE-AREXT")); });
    arr(LE.vaos).forEach(function (v) {
      if ((v.pav || 0) !== pav.k) return;
      var w = (LE.porParede || {})[v.parede]; if (!w) return;
      var r = Number(w.rotY) || 0, u = [Math.cos(r), -Math.sin(r)], nn = [Math.sin(r), Math.cos(r)], m = [w.cx + u[0] * v.t, w.cz + u[1] * v.t], hw = v.largura / 2, he = (w.espessura || 0.15) / 2 + 0.005;
      var q = [[m[0] - u[0] * hw - nn[0] * he, m[1] - u[1] * hw - nn[1] * he], [m[0] + u[0] * hw - nn[0] * he, m[1] + u[1] * hw - nn[1] * he], [m[0] + u[0] * hw + nn[0] * he, m[1] + u[1] * hw + nn[1] * he], [m[0] - u[0] * hw + nn[0] * he, m[1] - u[1] * hw + nn[1] * he]].map(function (p) { return P(p[0], p[1]); });
      D.s.push('<polygon points="' + q.map(function (p) { return n(p[0]) + "," + n(p[1]); }).join(" ") + '" fill="#fff" stroke="none"/>');
      L(D, q[0][0], q[0][1], q[3][0], q[3][1], "ELE-ARQ"); L(D, q[1][0], q[1][1], q[2][0], q[2][1], "ELE-ARQ");
      if (v.tipo === "janela") L(D, (q[0][0] + q[3][0]) / 2, (q[0][1] + q[3][1]) / 2, (q[1][0] + q[2][0]) / 2, (q[1][1] + q[2][1]) / 2, "ELE-ARQ");
      else if (!/correr/i.test(txt(v.famId)) && !v.correr) {
        /* folha e arco da porta de giro: a MESMA convenção do desenho de planta do BIM (js/arqdesenho.js vaosPlanta): Abre_para_fora -> a folha abre para +normal; Mao_direita -> dobradiça em +u */
        var lado = v.abreFora ? 1 : -1, sH = v.maoDireita ? 1 : -1;
        function Qd(a1, b1) { return P(m[0] + u[0] * a1 + nn[0] * b1, m[1] + u[1] * a1 + nn[1] * b1); }
        var Hd = Qd(sH * hw, 0), tipd = Qd(sH * hw, lado * v.largura), arc = [];
        L(D, Hd[0], Hd[1], tipd[0], tipd[1], "ELE-ARQ");
        for (var ia = 0; ia <= 14; ia++) { var ta = ia / 14 * Math.PI / 2; arc.push(Qd(sH * (hw - v.largura * Math.sin(ta)), lado * v.largura * Math.cos(ta))); }
        D.poli(arc, "ELE-ARQ", false, cm("ELE-ARQ"));
      }
    });
    var G = Z.grafo || {}, tr = G.trechos || {}, cota = (arr(LE.pavimentos)[pav.k] || {}).cota || 0, cotaProx = (arr(LE.pavimentos)[pav.k + 1] || {}).cota;
    var lc = letrasComando(Z, c.op && c.op.estado), letras = lc.mapa, legUso = {}, byId = {}, circDe = {}, uso = { el: 0, elp: 0, sb: 0, cond: 0, cp: 0, qd: 0 }, nLig = 0, nTronco = 0;
    arr(Z.circuitos).forEach(function (ci) { byId[ci.id] = ci; arr(ci.pontos).forEach(function (id) { circDe[id] = ci.id; }); });
    Object.keys(tr).forEach(function (id) {   /* o que o modelo 3D tem no pavimento, só para a legenda */
      var t = tr[id]; if (!t || !t.p1 || !t.p2) return;
      var ym = (Number(t.p1.y) + Number(t.p2.y)) / 2; if (ym < cota - 0.6 || (cotaProx != null && ym >= cotaProx - 0.4)) return;
      if (Math.abs(Number(t.p1.x) - Number(t.p2.x)) + Math.abs(Number(t.p1.z) - Number(t.p2.z)) < 0.02) uso.sb++; else if (t.aplicacao === "piso") uso.elp++; else uso.el++;
    });
    function dist2(p1, p2) { return Math.sqrt(Math.pow(p2[0] - p1[0], 2) + Math.pow(p2[1] - p1[1], 2)); }
    /* ---------- geometria do traçado: o que vem do modelo está em metros; o que é desenho, em mm de papel ---------- */
    function distSeg(c0, s1, s2) { var dx = s2[0] - s1[0], dy = s2[1] - s1[1], L2 = dx * dx + dy * dy || 1e-9, tt = Math.max(0, Math.min(1, ((c0[0] - s1[0]) * dx + (c0[1] - s1[1]) * dy) / L2)); return Math.hypot(c0[0] - (s1[0] + tt * dx), c0[1] - (s1[1] + tt * dy)); }
    function pip(pt, poly) {
      var ins = false;
      for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) { var xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1]; if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi)) ins = !ins; }
      return ins;
    }
    function dPoly(pt, poly) { var m = 1e9; for (var i = 0; i < poly.length; i++) m = Math.min(m, distSeg(pt, poly[i], poly[(i + 1) % poly.length])); return m; }
    var arestas = [];
    walls.forEach(function (w) { var q = w.pts; for (var i2 = 0; i2 < q.length; i2++) { var u1 = q[i2], v1 = q[(i2 + 1) % q.length]; if (Math.abs(u1[0] - v1[0]) + Math.abs(u1[1] - v1[1]) > 0.05) arestas.push([u1, v1]); } });
    /* o ambiente que CONTÉM o ponto; se o ponto está na espessura da parede (caixa embutida), o de borda mais perto (empate: o do próprio ponto) */
    function ambDe(px, pz, pref) {
      var found = null, best = null, bd = 1e9;
      ambs.forEach(function (x) {
        var pl = arr(x.pts); if (pl.length < 3) return;
        if (pip([px, pz], pl) && (!found || x.id === pref)) found = x;
        var d = dPoly([px, pz], pl); if (d < bd - 0.03 || (Math.abs(d - bd) <= 0.03 && x.id === pref)) { bd = d; best = x; }
      });
      return found || (bd < 0.4 ? best : null);
    }
    /* a FACE da parede do ponto: a aresta de parede mais perto cuja normal, para o lado do ambiente que contém o ponto, entra nesse ambiente; sem parede a 25 cm = null (ponto livre, sem caixinha) */
    function face(px, pz, am) {
      var best = null, bd = 1e9;
      arestas.forEach(function (e) {
        var dx = e[1][0] - e[0][0], dz = e[1][1] - e[0][1], L2 = dx * dx + dz * dz, Lm = Math.sqrt(L2), t = Math.max(0, Math.min(1, ((px - e[0][0]) * dx + (pz - e[0][1]) * dz) / L2));
        var fx = e[0][0] + t * dx, fz = e[0][1] + t * dz, d = Math.sqrt(Math.pow(px - fx, 2) + Math.pow(pz - fz, 2));
        if (d >= bd) return;
        var nx = -dz / Lm, nz = dx / Lm, sg;
        if (am) { if (pip([fx + nx * 0.12, fz + nz * 0.12], am.pts)) sg = 1; else if (pip([fx - nx * 0.12, fz - nz * 0.12], am.pts)) sg = -1; else return; }
        else sg = (nx * (px - fx) + nz * (pz - fz)) >= 0 ? 1 : -1;
        bd = d; best = { fx: fx, fz: fz, nx: nx * sg, nz: nz * sg, ed: e, t: t * Lm };
      });
      return best && bd <= 0.25 ? best : null;
    }
    function condMax(ci) {
      var o = { F: 0, N: 0, PE: 0, R: 0 }, any = false;
      Object.keys(ci && ci.cond || {}).forEach(function (t) { var q2 = ci.cond[t]; any = true; o.F = Math.max(o.F, q2.F || 0); o.N = Math.max(o.N, q2.N || 0); o.PE = Math.max(o.PE, q2.PE || 0); o.R = Math.max(o.R, q2.R || 0); });
      return any ? o : null;
    }
    function obbF(q, ang, x0, x1, y0, y1) { var c0 = Math.cos(ang), s0 = Math.sin(ang), cl = (x0 + x1) / 2, cv = (y0 + y1) / 2; return { t: "o", c: [q[0] + cl * c0 - cv * s0, q[1] + cl * s0 + cv * c0], u: [c0, s0], v: [-s0, c0], hu: (x1 - x0) / 2, hv: (y1 - y0) / 2 }; }
    function raioF(f) { return f.t === "c" ? f.r : Math.sqrt(f.hu * f.hu + f.hv * f.hv); }
    function dentroF(pt, f, inf) {
      if (f.t === "c") return dist2(pt, f.c) < f.r + inf;
      var dx = pt[0] - f.c[0], dy = pt[1] - f.c[1], lim0 = f.hu + f.hv + inf;
      if (dx > lim0 || dx < -lim0 || dy > lim0 || dy < -lim0) return false;
      return Math.abs(dx * f.u[0] + dy * f.u[1]) < f.hu + inf && Math.abs(dx * f.v[0] + dy * f.v[1]) < f.hv + inf;
    }
    /* distância, a partir do centro c0 e na direção d (unitária), até a SAÍDA da forma do nó (a linha toca a borda do símbolo, nunca entra) */
    function saidaF(f, c0, d) {
      if (f.t === "c") return f.r + 0.3;
      var ox = c0[0] - f.c[0], oy = c0[1] - f.c[1], ol = ox * f.u[0] + oy * f.u[1], ov = ox * f.v[0] + oy * f.v[1], dl = d[0] * f.u[0] + d[1] * f.u[1], dv = d[0] * f.v[0] + d[1] * f.v[1], t = 1e9;
      if (Math.abs(dl) > 1e-9) t = Math.min(t, ((dl > 0 ? f.hu : -f.hu) - ol) / dl);
      if (Math.abs(dv) > 1e-9) t = Math.min(t, ((dv > 0 ? f.hv : -f.hv) - ov) / dv);
      return Math.max(0, t) + 0.3;
    }
    /* fios por papel da ligação (tetos de marcas por tipo; o número real vem do ci.cond do modelo): tronco e tomada = fase, neutro, terra; interruptor-luz = fase e retorno; luz-luz = neutro, terra e retorno */
    var CAP_FNP = { F: 2, N: 2, PE: 2 };
    var coinc = [], simbolos = [], nodes = {}, nodeAmbId = {}, gruposParede = {}, porCirc = {}, rotPts = [], qdTexto = null;
    /* os símbolos: posição na face (ou livre), forma (para as linhas não atravessarem) e nó do grafo */
    arr(Z.pontos).forEach(function (p) {
      if ((p.pav || 0) !== pav.k || !p.caixaP || !circDe[p.id]) return;
      var cid = circDe[p.id], px = p.caixaP[0], pz = p.caixaP[2], Pp = P(px, pz), am = ambDe(px, pz, p.amb), amb0 = ambs.filter(function (x0) { return x0.id === p.amb; })[0];
      var hh1 = fin(p.h) ? p.h - (fin(cota) ? cota : 0) : 0.3, parede = p.kind === "luz" && !!(amb0 && fin(amb0.pe) && fin(p.h) && hh1 < amb0.pe - 0.3);
      var sm = { p: p, cid: cid, am: am, parede: parede, nrm: [1, 0], ang: 0, caixa: false, t: 0, edge: -1, real: Pp, piso: false };
      (porCirc[cid] = porCirc[cid] || { amb: {} }).amb[p.amb] = 1;
      if (p.kind === "luz" && !parede) {
        /* v2.3: duas luminárias no MESMO lugar (ambientes sobrepostos no modelo — o CLOSET em dobro da Reforma Casa 487) saem UMA vez na planta;
           o aviso vai para o relatório (diag.coincidentes), nunca para a folha */
        var dup = simbolos.filter(function (o) { return o.p.kind === "luz" && !o.parede && o.p.caixaP && Math.hypot(o.p.caixaP[0] - px, o.p.caixaP[2] - pz) < 0.03; })[0];   /* < 3 cm NO MODELO: a mesma luminária em dobro; spots de sanca a 10 cm continuam dois */
        if (dup) { nodes[p.id] = nodes[dup.p.id]; coinc.push([dup.p.id, p.id]); return; }
        /* luminária real a menos de um símbolo de outra no papel: desenha as duas, a segunda deslocada ao lado (nenhum ponto some) */
        for (var vz = 0; vz < 6 && simbolos.some(function (o) { return o.p.kind === "luz" && !o.parede && Math.hypot(o.q[0] - Pp[0], o.q[1] - Pp[1]) < 8.6; }); vz++) Pp = [Pp[0] + 8.8, Pp[1]];
        sm.q = Pp; sm.o = Pp; sm.cen = Pp; sm.forma = { t: "c", c: Pp, r: 4.2 };
      }
      else {
        var fc = face(px, pz, am), cs = p.kind === "interruptor" ? 3.0 : 2.8;
        if (fc) { sm.caixa = true; sm.q = P(fc.fx, fc.fz); sm.ang = Math.atan2(fc.nz, fc.nx); sm.nrm = [fc.nx, fc.nz]; sm.t = fc.t; sm.edge = arestas.indexOf(fc.ed); }
        else sm.q = [Pp[0] - cs, Pp[1]];   /* ponto longe da parede: a posição real do modelo, sem a caixinha */
        /* a caixinha fica DENTRO da espessura da parede, encostada na face; o símbolo começa na face e projeta para o ambiente (origem de desenho recuada 1,55 mm) */
        sm.o = sm.caixa ? [sm.q[0] - sm.nrm[0] * 1.55, sm.q[1] - sm.nrm[1] * 1.55] : sm.q; sm.fim = sm.caixa ? [sm.q[0] - sm.nrm[0] * 0.4, sm.q[1] - sm.nrm[1] * 0.4] : null;
        sm.cen = [sm.o[0] + sm.nrm[0] * cs, sm.o[1] + sm.nrm[1] * cs];
        var xi = sm.caixa ? 0.45 : 1.1;
        if (p.kind === "luz") sm.forma = obbF(sm.o, sm.ang, xi, 4.7, -2.8, 2.8);
        else if (p.kind === "interruptor") sm.forma = obbF(sm.o, sm.ang, xi, 6.2, -2.6, 2.6);
        else if (p.kind === "tue") sm.forma = obbF(sm.o, sm.ang, xi, 5.4, -1.5, 1.5);
        else { sm.piso = /piso/.test(txt(p.famId)) || hh1 < 0.1; sm.forma = obbF(sm.o, sm.ang, xi, sm.piso ? 5.9 : 5.4, sm.piso ? -2.1 : -1.9, sm.piso ? 2.1 : 1.9); }
      }
      simbolos.push(sm);
      nodes[p.id] = { id: p.id, c: sm.cen, f: sm.forma, R: raioF(sm.forma) + 1.2, circ: p.kind === "luz" && !parede, sm: sm, fim: sm.fim || null };
    });
    /* o nó de cada ambiente = a 1ª luminária (a de teto ou de parede); sem luminária no circuito, um ponto virtual */
    ambs.forEach(function (x) {
      var luz = arr(Z.pontos).filter(function (p) { return p.kind === "luz" && p.amb === x.id && p.caixaP && (p.pav || 0) === pav.k; })[0];
      if (luz && nodes[luz.id]) nodeAmbId[x.id] = luz.id;
      else { var cp = luz ? P(luz.caixaP[0], luz.caixaP[2]) : P(x.cx, x.cz), vid = "V:" + x.id; nodes[vid] = { id: vid, c: cp, f: { t: "c", c: cp, r: 0 }, R: 0, circ: false }; nodeAmbId[x.id] = vid; }
    });
    var qdFace = Z.quadro && Z.quadro.p && (Z.quadro.y == null || Math.abs(Z.quadro.y - cota) < 1.5) ? face(Z.quadro.p[0], Z.quadro.p[2], ambDe(Z.quadro.p[0], Z.quadro.p[2], Z.quadro.amb)) : null;
    var qdPos = Z.quadro && Z.quadro.p && (Z.quadro.y == null || Math.abs(Z.quadro.y - cota) < 1.5) ? (qdFace ? P(qdFace.fx, qdFace.fz) : P(Z.quadro.p[0], Z.quadro.p[2])) : null;
    var qdAj = qdPos && qdFace ? [qdPos[0] + qdFace.nx * 3.2, qdPos[1] + qdFace.nz * 3.2] : qdPos;
    if (qdAj) nodes.QD = { id: "QD", c: qdAj, f: { t: "c", c: qdAj, r: 2.4 }, R: 4.8, circ: false };
    /* ---------- o GRAFO: no máximo UMA ligação entre dois nós; os circuitos que dividem o trecho vão nela ---------- */
    var edges = {};
    function cm1(cid, caps, papel) { var o = {}, c = {}; Object.keys(caps).forEach(function (t) { c[t] = caps[t]; }); o[cid] = { c: c, papel: papel }; return o; }
    function mescla(dst, src) { Object.keys(src).forEach(function (c0) { var d = dst[c0] || (dst[c0] = { c: {}, papel: src[c0].papel }); if (d.papel !== src[c0].papel) d.papel = "misto"; Object.keys(src[c0].c).forEach(function (t) { d.c[t] = Math.max(d.c[t] || 0, src[c0].c[t]); }); }); }
    function addEdge(a, b, cmap, dir) {
      if (a === b || !nodes[a] || !nodes[b]) return;
      var kk = a < b ? a + "|" + b : b + "|" + a, e = edges[kk];
      if (!e) e = edges[kk] = { a: a, b: b, circ: {}, dir: dir };
      mescla(e.circ, cmap);
    }
    function uniao(maps) { var o = {}; maps.forEach(function (m0) { mescla(o, m0); }); return o; }
    /* luminárias que o módulo do interruptor comanda (pelo vínculo do modelo; sem vínculo, as do ambiente) */
    function luzesDoInt(sm) {
      var mods = lc.modulos[sm.p.id] || [], o = [];
      arr(Z.pontos).forEach(function (p) { if (p.kind === "luz" && p.amb === sm.p.amb && (p.pav || 0) === pav.k && nodes[p.id] && mods.indexOf(letras[p.id]) >= 0) o.push(p.id); });
      return o;
    }
    simbolos.forEach(function (sm) {
      var p = sm.p, nd = nodeAmbId[p.amb]; if (!nd) return;
      if (p.kind === "luz") { if (p.id !== nd) addEdge(nd, p.id, cm1(sm.cid, { N: 2, PE: 2, R: 1 }, "luz"), "b"); return; }
      if (p.kind === "interruptor") {
        var cm0 = luzesDoInt(sm), alvo = nd, bd0 = 1e9;
        cm0.forEach(function (id) { var d0 = dist2(nodes[id].c, sm.cen); if (d0 < bd0) { bd0 = d0; alvo = id; } });
        sm.alvo = alvo;
        if (intTipo(p).nm === 1 && intTipo(p).tipo !== "p") {
          /* o círculo do interruptor simples fica do lado OPOSTO ao da luminária que ele comanda; a forma (para as ligações não passarem) acompanha */
          var ndA = nodes[alvo], lyA = ndA ? (ndA.c[0] - sm.o[0]) * (-Math.sin(sm.ang)) + (ndA.c[1] - sm.o[1]) * Math.cos(sm.ang) : 0;
          sm.latFlip = lyA < 0;
          sm.forma = obbF(sm.o, sm.ang, sm.caixa ? 0.45 : 1.1, 6.0, sm.latFlip ? -1.0 : -4.2, sm.latFlip ? 4.2 : 1.0); nodes[p.id].f = sm.forma;
          var syD = sm.latFlip ? 1 : -1; nodes[p.id].disco = { c: [sm.o[0] + Math.cos(sm.ang) * 4.2 - Math.sin(sm.ang) * 2.5 * syD, sm.o[1] + Math.sin(sm.ang) * 4.2 + Math.cos(sm.ang) * 2.5 * syD], r: 1.5 };
        }
        addEdge(alvo, p.id, cm1(sm.cid, { F: 2, R: intTipo(p).tipo === "p" ? 2 : 1 }, "interruptor"), "b"); return;
      }
      if (!sm.caixa) { addEdge(nd, p.id, cm1(sm.cid, CAP_FNP, "tomada"), "b"); return; }
      /* tomadas e pontos de força da MESMA parede são encadeados em sequência ao longo dela; só um ramo vai à luminária */
      var gk = p.amb + "|" + sm.edge; (gruposParede[gk] = gruposParede[gk] || []).push(sm);
    });
    Object.keys(gruposParede).forEach(function (gk) {
      var gp = gruposParede[gk].sort(function (a1, b1) { return a1.t - b1.t; }), nd = nodeAmbId[gp[0].p.amb], m = 0, bd = 1e9, mp = gp.map(function (s0) { return cm1(s0.cid, CAP_FNP, "tomada"); }), nG = gp.length;
      gp.forEach(function (s0, i7) { var d7 = dist2(nodes[nd].c, s0.cen); if (d7 < bd) { bd = d7; m = i7; } });
      addEdge(nd, gp[m].p.id, uniao(mp), "b");
      for (var i8 = m - 1; i8 >= 0; i8--) addEdge(gp[i8 + 1].p.id, gp[i8].p.id, uniao(mp.slice(0, i8 + 1)), "b");
      for (var i9 = m + 1; i9 < nG; i9++) addEdge(gp[i9 - 1].p.id, gp[i9].p.id, uniao(mp.slice(i9)), "b");
    });
    /* o circuito encadeado: do ambiente mais perto do QD para os outros, de luminária em luminária (um caminho só) */
    Object.keys(porCirc).sort().forEach(function (cid) {
      var ids = Object.keys(porCirc[cid].amb).filter(function (a1) { return nodeAmbId[a1]; });
      if (!ids.length) return;
      var ref = qdAj || nodes[nodeAmbId[ids[0]]].c, ord = [], rest = ids.slice();
      while (rest.length) { rest.sort(function (u, v) { return dist2(nodes[nodeAmbId[u]].c, ref) - dist2(nodes[nodeAmbId[v]].c, ref); }); var nx = rest.shift(); ord.push(nx); ref = nodes[nodeAmbId[nx]].c; }
      if (qdAj) addEdge("QD", nodeAmbId[ord[0]], cm1(cid, CAP_FNP, "tronco"), "a");
      for (var i2 = 1; i2 < ord.length; i2++) addEdge(nodeAmbId[ord[i2 - 1]], nodeAmbId[ord[i2]], cm1(cid, CAP_FNP, "tronco"), "a");
    });
    /* uma ligação que passaria por cima de um nó (a luminária, ou um símbolo bem no caminho) é PARTIDA nele: A-C vira A-N e N-C, com os mesmos circuitos
       (elimina a linha duplicada e a sobreposta colinear: o trecho em comum fica numa linha só) */
    for (var pas = 0, mudou = true; mudou && pas < 10; pas++) {
      mudou = false;
      Object.keys(edges).forEach(function (kk) {
        var e = edges[kk]; if (!e) return;
        var A = nodes[e.a], B = nodes[e.b], Lq = dist2(A.c, B.c), best = null, bp = 1e9; if (Lq < 1e-6) return;
        var ex = (B.c[0] - A.c[0]) / Lq, ey = (B.c[1] - A.c[1]) / Lq;
        Object.keys(nodes).forEach(function (id) {
          if (id === e.a || id === e.b) return;
          var N = nodes[id], pr = (N.c[0] - A.c[0]) * ex + (N.c[1] - A.c[1]) * ey, lat = Math.abs(-(N.c[0] - A.c[0]) * ey + (N.c[1] - A.c[1]) * ex);
          if (pr > 1 && pr < Lq - 1 && lat < (N.circ ? N.R : 6.0) && pr < bp) { bp = pr; best = id; }
        });
        if (!best) return;
        delete edges[kk]; addEdge(e.a, best, e.circ, e.dir); addEdge(best, e.b, e.circ, e.dir); mudou = true;
      });
      /* duas ligações que chegam ao mesmo nó quase na mesma direção (< 24 graus) viram uma só: a mais longa passa a ligar-se à ponta da mais curta (nada de duas linhas coladas na chegada) */
      Object.keys(nodes).forEach(function (nid) {
        var inc = Object.keys(edges).filter(function (k1) { return edges[k1].a === nid || edges[k1].b === nid; });
        for (var x = 0; x < inc.length; x++) for (var y = x + 1; y < inc.length; y++) {
          var e1 = edges[inc[x]], e2 = edges[inc[y]], k2 = inc[y]; if (!e1 || !e2) continue;
          var A1 = e1.a === nid ? e1.b : e1.a, B1 = e2.a === nid ? e2.b : e2.a, N0 = nodes[nid].c, a1 = nodes[A1].c, b1 = nodes[B1].c;
          var d1 = dist2(N0, a1), d2 = dist2(N0, b1); if (d1 < 1e-6 || d2 < 1e-6) continue;
          if (d1 > d2) { var tmp = e1; e1 = e2; e2 = tmp; tmp = A1; A1 = B1; B1 = tmp; k2 = inc[x]; tmp = d1; d1 = d2; d2 = tmp; }
          var cs1 = ((a1[0] - N0[0]) * (b1[0] - N0[0]) + (a1[1] - N0[1]) * (b1[1] - N0[1])) / (d1 * d2);
          if (cs1 < Math.cos(24 * Math.PI / 180) || A1 === B1) continue;
          var tgt = e2.dir === "a" ? e2.a : e2.b;
          delete edges[k2]; addEdge(A1, B1, e2.circ, tgt === B1 ? "b" : "a"); mudou = true;
        }
      });
    }
    /* obstáculos: os nós (com folga); a ligação que passaria por cima de um símbolo contorna com uma curva leve (nunca atravessa) */
    var obst = Object.keys(nodes).filter(function (id) { return nodes[id].R > 0; }).map(function (id) { return { id: id, c: nodes[id].c, R: nodes[id].R }; });
    function rota(p1, p2, prof, ea, eb) {
      if (prof > 3) return [p1, p2];
      for (var i5 = 0; i5 < obst.length; i5++) {
        var o5 = obst[i5];
        if (o5.id === ea || o5.id === eb) continue;
        if (distSeg(o5.c, p1, p2) < o5.R - 0.35) {
          var dx = p2[0] - p1[0], dy = p2[1] - p1[1], Lm = Math.hypot(dx, dy) || 1, ex = dx / Lm, ey = dy / Lm, nx = -ey, ny = ex;
          var pr = (o5.c[0] - p1[0]) * ex + (o5.c[1] - p1[1]) * ey, fx = p1[0] + ex * pr, fy = p1[1] + ey * pr, sg = ((o5.c[0] - fx) * nx + (o5.c[1] - fy) * ny) > 0 ? -1 : 1;
          var w = [fx + sg * nx * (o5.R + 0.8), fy + sg * ny * (o5.R + 0.8)], a1 = rota(p1, w, prof + 1, ea, eb), b1 = rota(w, p2, prof + 1, ea, eb);
          return a1.concat(b1.slice(1));
        }
      }
      return [p1, p2];
    }
    /* v2.3: sem arco livre de símbolo, o arco leve passa por cima dele. O desvio por rota (rota + suave) dava voltas em ponto apertado — o
       "novelo" da Reforma Casa 487 (20/11/2026). Um eletroduto representativo nunca faz laço. */
    function rotaSemLaco(e, p1, p2) {
      var r0 = null; try { r0 = suave(rota(p1, p2, 0, e.a, e.b)); } catch (er) { return null; }
      if (!r0 || r0.length < 2) return null;
      /* corta cada laço: onde a linha cruza a si mesma, emenda no cruzamento e joga a volta fora (o "novelo" da Reforma Casa 487) */
      for (var guarda = 0; guarda < 50; guarda++) {
        var achou = false;
        for (var a = 0; a + 1 < r0.length && !achou; a++) for (var b = a + 2; b + 1 < r0.length && !achou; b++) {
          var X = segPt(r0[a], r0[a + 1], r0[b], r0[b + 1]); if (!X) continue;
          r0 = r0.slice(0, a + 1).concat([X], r0.slice(b + 1)); achou = true;
        }
        if (!achou) break;
      }
      var Lr = 0; for (var k = 0; k + 1 < r0.length; k++) Lr += dist2(r0[k], r0[k + 1]);
      return Lr > 4 * dist2(p1, p2) ? null : r0;
    }
    function segPt(a, b, c, d) {
      var r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]], den = r[0] * s[1] - r[1] * s[0]; if (Math.abs(den) < 1e-12) return null;
      var tt = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den, uu = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
      return tt > 1e-6 && tt < 1 - 1e-6 && uu > 1e-6 && uu < 1 - 1e-6 ? [a[0] + tt * r[0], a[1] + tt * r[1]] : null;
    }
    function segX(a, b, c, d) { function o(p, q, r) { return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); } return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0; }
    function arcoLivre(e, p1, p2) {
      /* entre arcos leves dos dois lados (flecha 6 a 25 %), o que encosta em menos símbolos alheios */
      var Lc = dist2(p1, p2), ux = (p2[0] - p1[0]) / Lc, uy = (p2[1] - p1[1]) / Lc, n0 = Math.max(10, Math.min(28, Math.ceil(Lc / 2.2))), best = null, bh = 1e9;
      [0.06, -0.06, 0.12, -0.12, 0.18, -0.18, 0.25, -0.25].forEach(function (fl) {
        var q = [(p1[0] + p2[0]) / 2 - uy * 2 * fl * Lc, (p1[1] + p2[1]) / 2 + ux * 2 * fl * Lc], pts = [], h = 0;
        for (var i = 0; i <= n0; i++) { var s = i / n0; pts.push([(1 - s) * (1 - s) * p1[0] + 2 * (1 - s) * s * q[0] + s * s * p2[0], (1 - s) * (1 - s) * p1[1] + 2 * (1 - s) * s * q[1] + s * s * p2[1]]); }
        pts.forEach(function (pt, k) { if (k < 2 || k > pts.length - 3) return; Object.keys(nodes).forEach(function (id) { var N = nodes[id]; if (id !== e.a && id !== e.b && N.R > 0 && dentroF(pt, N.f, 0.4)) h++; }); });
        h += Math.abs(fl) * 4;   /* a curva mais leve desempata */
        if (h < bh) { bh = h; best = pts; }
      });
      return best;
    }
    function suave(pts) {
      if (pts.length < 3) return pts;
      for (var it = 0; it < 2; it++) {
        var o = [pts[0]];
        for (var i = 0; i + 1 < pts.length; i++) { var a1 = pts[i], b1 = pts[i + 1]; o.push([0.75 * a1[0] + 0.25 * b1[0], 0.75 * a1[1] + 0.25 * b1[1]], [0.25 * a1[0] + 0.75 * b1[0], 0.25 * a1[1] + 0.75 * b1[1]]); }
        o.push(pts[pts.length - 1]); pts = o;
      }
      return pts;
    }
    var diag = { legs: [], simbolos: [], numeros: [], paredes: [], ambs: {}, k: k, semMarca: 0, setas: 0, nTrechos: 0, ints: [], semChamada: [], marcas: [], chamadas: [], nos: {}, paredesPoly: walls.map(function (w0) { return w0.pts.map(function (q0) { return P(q0[0], q0[1]); }); }), coincidentes: coinc }, rotLig = [], segsLig = [];
    arestas.forEach(function (e) { diag.paredes.push([P(e[0][0], e[0][1]), P(e[1][0], e[1][1])]); }); ambs.forEach(function (x) { diag.ambs[x.id] = arr(x.pts).map(function (q) { return P(q[0], q[1]); }); });
    /* ARCO LEVE em cada ligação (curvatura suave e constante, flecha de 10% do comprimento, como os arcos do modelo): o arco sai da ponta de MAIOR grau virando sempre para o mesmo lado (os arcos vizinhos
       do mesmo nó abrem em leque, sem se cruzar perto dele); se o lado escolhido bate num símbolo, tenta o outro lado e depois flechas menores; sem lugar, o caminho com desvio */
    Object.keys(nodes).forEach(function (id) { diag.nos[id] = nodes[id].c; });
    var grau = {};
    Object.keys(edges).forEach(function (kk) { var e0 = edges[kk]; grau[e0.a] = (grau[e0.a] || 0) + 1; grau[e0.b] = (grau[e0.b] || 0) + 1; });
    function arcoLig(e, p1, p2, infl, nrmDentro) {
      var Lc = dist2(p1, p2), ux = (p2[0] - p1[0]) / Lc, uy = (p2[1] - p1[1]) / Lc, nx = -uy, ny = ux, ga = grau[e.a] || 0, gb = grau[e.b] || 0, hubA = ga > gb || (ga === gb && e.a < e.b), sg0 = hubA ? 1 : -1;
      if (nrmDentro) sg0 = (nx * nrmDentro[0] + ny * nrmDentro[1]) >= 0 ? 1 : -1;   /* símbolos encadeados na mesma parede: o arco abre para DENTRO do ambiente */
      var n0 = Math.max(10, Math.min(28, Math.ceil(Lc / 2.2))), flechas = [0.09, 0.07, 0.05, 0.03, 0.02];
      for (var f = 0; f < flechas.length; f++) for (var sd = 0; sd < (nrmDentro ? 1 : 2); sd++) {
        var sg = sd ? -sg0 : sg0, q = [(p1[0] + p2[0]) / 2 + nx * sg * 2 * flechas[f] * Lc, (p1[1] + p2[1]) / 2 + ny * sg * 2 * flechas[f] * Lc], pts = [], ok = true;
        for (var i = 0; i <= n0; i++) { var t = i / n0; pts.push([(1 - t) * (1 - t) * p1[0] + 2 * (1 - t) * t * q[0] + t * t * p2[0], (1 - t) * (1 - t) * p1[1] + 2 * (1 - t) * t * q[1] + t * t * p2[1]]); }
        for (var j = 0; j < pts.length && ok; j++) Object.keys(nodes).forEach(function (id) {
          var N = nodes[id]; if (!ok || !(N.R > 0)) return;
          if (id === e.a || id === e.b) { if (!N.fim && j > 1 && j < pts.length - 2 && dentroF(pts[j], N.f, -0.3)) ok = false; if (N.disco && dist2(pts[j], N.disco.c) < N.disco.r + 0.8) ok = false; }
          else if (dentroF(pts[j], N.f, infl)) ok = false;
        });
        if (ok) return pts;
      }
      return null;
    }
    /* posição e tangente a s mm do começo da ligação (para a seta, as marcas e o número do circuito sobre o arco) */
    function ptS(it, s) { s = Math.max(0, Math.min(it.L, s)); var i = 1; while (i < it.pts.length - 1 && it.cum[i] < s) i++; var sg = (it.cum[i] - it.cum[i - 1]) || 1e-9, t = (s - it.cum[i - 1]) / sg; return [it.pts[i - 1][0] + (it.pts[i][0] - it.pts[i - 1][0]) * t, it.pts[i - 1][1] + (it.pts[i][1] - it.pts[i - 1][1]) * t]; }
    function posEm(it, s) { var a1 = ptS(it, s - 0.8), b1 = ptS(it, s + 0.8), d0 = dist2(a1, b1) || 1; return { p: ptS(it, s), u: [(b1[0] - a1[0]) / d0, (b1[1] - a1[1]) / d0] }; }
    /* desenha as ligações: UMA linha por par de nós, mais fina que a de antes (0,34 mm, a do modelo), com UMA seta pequena no meio */
    var arqN = D.sg.length;   /* os traços da arquitetura (paredes, vãos, portas) vêm antes dos eletrodutos: a chamada pode passar sobre a folha da porta, nunca sobre eletroduto, símbolo ou texto */
    var parFeito = {};
    Object.keys(edges).sort().forEach(function (kk) {
      var e = edges[kk], A = nodes[e.a], B = nodes[e.b], Lq = dist2(A.c, B.c); if (Lq < 1e-6) return;
      var kPar = [A.id, B.id].sort().join("|"); if (parFeito[kPar]) return; parFeito[kPar] = 1;   /* ponto repetido no modelo: a ligação sai uma vez */
      var ux0 = (B.c[0] - A.c[0]) / Lq, uy0 = (B.c[1] - A.c[1]) / Lq, sA = saidaF(A.f, A.c, [ux0, uy0]), sB = saidaF(B.f, B.c, [-ux0, -uy0]);
      var p1 = [A.c[0] + ux0 * sA, A.c[1] + uy0 * sA], p2 = [B.c[0] - ux0 * sB, B.c[1] - uy0 * sB];
      /* o eletroduto TERMINA na caixinha embutida (o do modelo passa por dentro do símbolo até ela); entre símbolos da mesma parede encadeados, para na borda como antes */
      var mesmaP = A.sm && B.sm && A.sm.caixa && B.sm.caixa && A.sm.edge >= 0 && A.sm.edge === B.sm.edge && A.sm.p.amb === B.sm.p.amb;
      if (A.fim && !mesmaP) p1 = A.fim; if (B.fim && !mesmaP) p2 = B.fim;
      var retaFim = false;
      if ((dist2(p1, p2) < 3 || Lq < 8) && A.fim && B.fim) { p1 = A.fim; p2 = B.fim; retaFim = true; if (dist2(p1, p2) < 1.5) return; }   /* caixinhas coladas: a ligação vai de caixinha a caixinha, reta, dentro da parede */
      if (dist2(p1, p2) < 3) return;
      var caminho = retaFim ? [p1, p2] : (arcoLig(e, p1, p2, 0.7, mesmaP ? A.sm.nrm : null) || arcoLig(e, p1, p2, 0.15, mesmaP ? A.sm.nrm : null) || rotaSemLaco(e, p1, p2) || arcoLivre(e, p1, p2)), cum = [0], Ltot = 0; nLig++;
      if (e.a === "QD" || e.b === "QD") nTronco++;
      for (var i6 = 0; i6 + 1 < caminho.length; i6++) { L(D, caminho[i6][0], caminho[i6][1], caminho[i6 + 1][0], caminho[i6 + 1][1], "ELE-ELETRODUTO"); segsLig.push({ k: kk, a: caminho[i6], b: caminho[i6 + 1] }); Ltot += dist2(caminho[i6], caminho[i6 + 1]); cum.push(Ltot); }
      diag.legs.push({ pts: caminho.slice(), a: e.a, b: e.b, k: kk });
      if (Ltot < 12) return;
      var cs0 = Object.keys(e.circ).sort(function (x2, y2) { return Number(x2.replace(/\D/g, "")) - Number(y2.replace(/\D/g, "")); }).map(function (cid) {
        var cd = condMax(byId[cid]), tipos = []; if (!cd) return null;
        ["N", "F", "PE", "R"].forEach(function (kk2) { var cap = e.circ[cid].c[kk2]; if (!cap) return; for (var q = 0; q < Math.min(cd[kk2] || 0, cap); q++) tipos.push(kk2); });
        tipos = tipos.slice(0, 6);
        return tipos.length ? { cid: cid, lab: cid.replace(/^C/, ""), tipos: tipos, papel: e.circ[cid].papel } : null;
      }).filter(Boolean);
      diag.nTrechos++;
      rotLig.push({ k: kk, pts: caminho, cum: cum, L: Ltot, sx: e.dir === "b" ? 1 : -1, cs: cs0, a: e.a, b: e.b });
    });
    simbolos.forEach(function (sm) {
      var p = sm.p, q = sm.o, ang = sm.ang, cid = sm.cid.replace(/^C/, ""), vaT = fin(p.va) ? br(p.va, 0) : "?", sc = !sm.caixa, emb = sm.caixa;
      if (p.kind === "luz") {
        if (sm.parede) { simLuz(D, q[0], q[1], vaT, cid, letras[p.id] || "?", true, ang, true, sc, emb); rotPts.push({ sm: sm, l1: vaT, l2: cid + " " + (letras[p.id] || "?") }); }
        else simLuz(D, sm.cen[0], sm.cen[1], vaT, cid, letras[p.id] || "?", false, 0);
      } else if (p.kind === "interruptor") {
        var it0 = intTipo(p), ndI = nodes[sm.alvo || nodeAmbId[p.amb]], lyI = ndI ? (ndI.c[0] - q[0]) * (-Math.sin(ang)) + (ndI.c[1] - q[1]) * Math.cos(ang) : 0;
        var flipI = lyI < 0, loptI = null, nmI = (lc.modulos[p.id] || ["?"]).length;
        if (nmI === 1 && it0.tipo !== "p") {
          /* o círculo do interruptor simples vai para o lado em que nenhuma ligação passa */
          flipI = !!sm.latFlip;
          loptI = { lat: true };
        } else if (nmI === 1) {
          var livreLado = function (fl, lx) { var fy = fl ? -1 : 1, gx = q[0] + Math.cos(ang) * lx - Math.sin(ang) * (-2.3 * fy), gy = q[1] + Math.sin(ang) * lx + Math.cos(ang) * (-2.3 * fy), bxI = [gx - 2.2, gy - 1.6, gx + 2.2, gy + 1.6]; return !segsLig.some(function (sg0) { return segCaixa(sg0.a, sg0.b, bxI); }); };
          var opcoesI = [[flipI, 4.9], [!flipI, 4.9], [flipI, 7.6], [!flipI, 7.6], [flipI, 10.4], [!flipI, 10.4]], achouI = false;
          opcoesI.forEach(function (o0) { if (!achouI && livreLado(o0[0], o0[1])) { achouI = true; flipI = o0[0]; loptI = { x: o0[1] }; } });
          if (!achouI) loptI = { x: 4.9 };
        }
        var retI = simInt(D, q[0], q[1], lc.modulos[p.id] || ["?"], it0.tipo, ang, flipI, sc, cid, emb, loptI);
        if (retI) diag.ints.push({ id: p.id, c: retI.c, r: retI.r, texto: retI.texto, tam: retI.tam });
      } else if (p.kind === "tue" && p.direta) { simPontoForca(D, q[0], q[1], true, ang, sc, emb); rotPts.push({ sm: sm, l1: cid, l2: vaT }); }
      else if (p.kind === "tue") { simPontoForca(D, q[0], q[1], false, ang, sc, emb); rotPts.push({ sm: sm, l1: cid, l2: vaT }); }
      else { var ca = classeAlt(fin(p.h) ? p.h - (fin(cota) ? cota : 0) : 0.3, C0); simTomada(D, q[0], q[1], ca.classe, ampDe(p), sm.piso, ang, sc, emb); rotPts.push({ sm: sm, l1: cid, l2: vaT }); }
      diag.simbolos.push({ id: p.id, kind: p.kind, parede: sm.parede, caixa: sm.caixa, caixaC: sm.caixa ? [sm.q[0] - sm.nrm[0] * 0.55, sm.q[1] - sm.nrm[1] * 0.55] : null, forma: sm.forma, q: sm.q, nrm: sm.nrm, real: sm.real, amb: sm.am ? sm.am.id : p.amb });
    });
    if (qdPos) { var angQ = qdFace ? Math.atan2(qdFace.nz, qdFace.nx) : 0; simQuadro(D, qdPos[0], qdPos[1], angQ, 0.15 * k, 0.28 * k); uso.qd++; qdTexto = [qdPos[0] + (qdFace ? qdFace.nx : 0) * 8, qdPos[1] + (qdFace ? qdFace.nz : 0) * 8]; diag.simbolos.push({ id: "QD", kind: "qd", caixa: true, forma: nodes.QD.f, q: qdPos, nrm: qdFace ? [qdFace.nx, qdFace.nz] : [1, 0], real: qdPos, amb: Z.quadro.amb }); }
    var marcasBox = [], hN = 2.4, blocosPlan = [];   /* blocos dos ambientes (nome, área...) PLANEJADOS: só são escritos depois das chamadas, e cedem lugar a elas */
    var PM = 0.8, SM = 1.05;   /* passo e meia-altura das marcas de condutor (medidas no PDF do modelo: traço de 2,05 mm, passo de 0,75-0,8 mm) */
    function segSeg(a, b, c0, d0) {
      function o(p, q, w) { return (q[0] - p[0]) * (w[1] - p[1]) - (q[1] - p[1]) * (w[0] - p[0]); }
      return o(a, b, c0) * o(a, b, d0) < 0 && o(c0, d0, a) * o(c0, d0, b) < 0;
    }
    function segCaixa(a, b, bx) {
      var t0 = 0, t1 = 1, dx = b[0] - a[0], dy = b[1] - a[1], pp = [-dx, dx, -dy, dy], qq = [a[0] - bx[0], bx[2] - a[0], a[1] - bx[1], bx[3] - a[1]];
      for (var i = 0; i < 4; i++) {
        if (Math.abs(pp[i]) < 1e-12) { if (qq[i] < 0) return false; continue; }
        var t = qq[i] / pp[i]; if (pp[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
      }
      return t1 - t0 > 1e-9;
    }
    /* a CHAMADA do modelo (não há seta de sentido no eletroduto): as marcas de condutor de cada circuito em pé sobre uma linha de base horizontal curta, o nº do circuito
       acima de cada grupo, e uma linha de chamada que sai da ponta da base até o eletroduto, terminando numa ponta de seta cheia encostada nele; uma por trecho, em lugar
       livre (a chamada não cruza símbolo, texto nem outra linha) e curta (6 a 23 mm) */
    /* índice em grade (células de 20 mm) dos traços já desenhados: a chamada procura lugar livre em milhares de tentativas, sem varrer todos os traços de cada vez */
    var CEL = 20, gradeSg = {}, idxN = 0;
    function indexaSg() {
      for (; idxN < D.sg.length; idxN++) {
        var g0 = D.sg[idxN], c0 = Math.floor(Math.min(g0[0], g0[2]) / CEL), c1 = Math.floor(Math.max(g0[0], g0[2]) / CEL), r0 = Math.floor(Math.min(g0[1], g0[3]) / CEL), r1 = Math.floor(Math.max(g0[1], g0[3]) / CEL);
        for (var cx = c0; cx <= c1; cx++) for (var cy = r0; cy <= r1; cy++) { var kk0 = cx + "," + cy; (gradeSg[kk0] || (gradeSg[kk0] = [])).push(idxN); }
      }
    }
    function tracosPerto(x0, y0, x1, y1, comArq) {
      var out = [], vistos = {}, c0 = Math.floor(Math.min(x0, x1) / CEL), c1 = Math.floor(Math.max(x0, x1) / CEL), r0 = Math.floor(Math.min(y0, y1) / CEL), r1 = Math.floor(Math.max(y0, y1) / CEL);
      for (var cx = c0; cx <= c1; cx++) for (var cy = r0; cy <= r1; cy++) { var lst = gradeSg[cx + "," + cy]; if (!lst) continue; for (var i = 0; i < lst.length; i++) if (!vistos[lst[i]] && (comArq || lst[i] >= arqN)) { vistos[lst[i]] = 1; out.push(D.sg[lst[i]]); } }
      return out;
    }
    var gradeTb = {}, tbN = 0;
    function indexaTb() {
      var tb0 = D.tb || [];
      for (; tbN < tb0.length; tbN++) { var t0 = tb0[tbN], c0 = Math.floor(t0[0] / CEL), c1 = Math.floor(t0[2] / CEL), r0 = Math.floor(t0[1] / CEL), r1 = Math.floor(t0[3] / CEL); for (var cx = c0; cx <= c1; cx++) for (var cy = r0; cy <= r1; cy++) { var kk0 = cx + "," + cy; (gradeTb[kk0] || (gradeTb[kk0] = [])).push(tbN); } }
    }
    function tbToca(x0, y0, x1, y1) {
      indexaTb();
      var c0 = Math.floor(x0 / CEL), c1 = Math.floor(x1 / CEL), r0 = Math.floor(y0 / CEL), r1 = Math.floor(y1 / CEL), tb0 = D.tb || [];
      for (var cx = c0; cx <= c1; cx++) for (var cy = r0; cy <= r1; cy++) { var lst = gradeTb[cx + "," + cy]; if (!lst) continue; for (var i = 0; i < lst.length; i++) { var t = tb0[lst[i]]; if (t[0] < x1 && t[2] > x0 && t[1] < y1 && t[3] > y0) return true; } }
      return false;
    }
    function livreG(bx, g, comArq) {
      var b = [bx[0] - g, bx[1] - g, bx[2] + g, bx[3] + g], i;
      if (tbToca(b[0], b[1], b[2], b[3])) return false;
      var ls = tracosPerto(b[0], b[1], b[2], b[3], comArq);
      for (i = 0; i < ls.length; i++) if (segCaixa([ls[i][0], ls[i][1]], [ls[i][2], ls[i][3]], b)) return false;
      return true;
    }
    /* os ambientes em mm de papel: a base da chamada fica DENTRO do ambiente do ponto onde a seta encosta (nunca sobre o cinza da parede nem fora dele) */
    var ambsP = ambs.map(function (x) { return { id: x.id, pts: arr(x.pts).map(function (q) { return P(q[0], q[1]); }) }; }).filter(function (x) { return x.pts.length >= 3; });
    function ambNo(pt) { for (var i = 0; i < ambsP.length; i++) if (pip(pt, ambsP[i].pts) && dPoly(pt, ambsP[i].pts) >= 0.8) return ambsP[i]; return null; }
    function caixaNoAmb(bx, am) {
      var xs = [bx[0], (bx[0] + bx[2]) / 2, bx[2]], ys = [bx[1], (bx[1] + bx[3]) / 2, bx[3]];
      for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) { var pt = [xs[i], ys[j]]; if (!pip(pt, am.pts) || dPoly(pt, am.pts) < 0.25) return false; }
      return true;
    }
    /* a CHAMADA do modelo (não há seta de sentido no eletroduto): as marcas de condutor de cada circuito em pé sobre uma linha de base horizontal curta, o nº do circuito
       acima de cada grupo, e uma linha de chamada de 6 a 15 mm que sai da ponta da base até o eletroduto, terminando numa ponta de seta cheia encostada nele.
       Resolvida em CONJUNTO: os trechos mais apertados primeiro e, se um não cabe, tira-se a chamada vizinha, coloca-se o trecho e recoloca-se a vizinha. */
    var planos = [], vistosLeg = {};
    function segsDoPlano(p0) { return [[p0.A, p0.Ls]].concat(p0.linhas.map(function (r0) { return [[r0.x0, r0.y], [r0.x1, r0.y]]; })); }
    function boxToca(a, b, m) { return a[0] < b[2] + m && a[2] > b[0] - m && a[1] < b[3] + m && a[3] > b[1] - m; }
    function validaCand(cd, it) {
      var i, j, T = cd.T, A = cd.A, Ls = cd.Ls, box = cd.box;
      if (box[0] < areaD[0] || box[2] > areaD[2] || box[1] < areaD[1] || box[3] > areaD[3]) return false;
      if (!caixaNoAmb(box, cd.am)) return false;
      if (!livreG(box, 0.25)) return false;
      for (i = 0; i < simbolos.length; i++) if (caixaToca(box, simbolos[i].forma, 0.6)) return false;
      if (!cd.ext && (!pip(A, cd.am.pts) || !pip([(A[0] + T[0]) / 2, (A[1] + T[1]) / 2], cd.am.pts))) return false;   /* a chamada fica no mesmo ambiente, sem atravessar parede */
      /* a ponta encosta só no próprio trecho: a 2 mm ou mais de qualquer outro eletroduto */
      for (i = 0; i < segsLig.length; i++) if (segsLig[i].k !== it.k && distSeg(T, segsLig[i].a, segsLig[i].b) < 2.0) return false;
      /* a linha de chamada não cruza traço (nenhum outro eletroduto, símbolo desenhado, parede), texto, símbolo nem outra chamada */
      var lsg = tracosPerto(Math.min(A[0], Ls[0]) - 0.4, Math.min(A[1], Ls[1]) - 0.4, Math.max(A[0], Ls[0]) + 0.4, Math.max(A[1], Ls[1]) + 0.4);
      for (i = 0; i < lsg.length; i++) { var sgm = lsg[i]; if (donoSeg[sgm[0].toFixed(3) + "," + sgm[1].toFixed(3) + "," + sgm[2].toFixed(3) + "," + sgm[3].toFixed(3)] === it.k) { if (segSeg(A, Ls, [sgm[0], sgm[1]], [sgm[2], sgm[3]])) return false; continue; } if (segSeg(A, Ls, [sgm[0], sgm[1]], [sgm[2], sgm[3]]) || distSeg([sgm[0], sgm[1]], A, Ls) < 0.35 || distSeg([sgm[2], sgm[3]], A, Ls) < 0.35) return false; }
      if (tbToca(Math.min(A[0], Ls[0]) - 0.4, Math.min(A[1], Ls[1]) - 0.4, Math.max(A[0], Ls[0]) + 0.4, Math.max(A[1], Ls[1]) + 0.4)) { var tbs = D.tb || []; for (i = 0; i < tbs.length; i++) if (segCaixa(A, Ls, [tbs[i][0] - 0.4, tbs[i][1] - 0.4, tbs[i][2] + 0.4, tbs[i][3] + 0.4])) return false; }
      for (i = 0; i < simbolos.length; i++) for (j = 0; j <= 12; j++) if (dentroF([A[0] + (Ls[0] - A[0]) * j / 12, A[1] + (Ls[1] - A[1]) * j / 12], simbolos[i].forma, 0.5)) return false;
      if (segCaixa([A[0] + cd.du[0] * 0.6, A[1] + cd.du[1] * 0.6], Ls, box)) return false;   /* a chamada sai da base para FORA, sem passar pelos próprios números */
      for (i = 0; i < blocosPlan.length; i++) { var bl0 = blocosPlan[i]; if (bl0.vivo === false) continue; if (boxToca(box, bl0.box, 0.5) || segCaixa(A, Ls, [bl0.box[0] - 0.4, bl0.box[1] - 0.4, bl0.box[2] + 0.4, bl0.box[3] + 0.4])) return false; }
      for (i = 0; i < planos.length; i++) {
        var o = planos[i]; if (o.vivo === false) continue;
        if (boxToca(box, o.box, 0.5)) return false;
        var sd = segsDoPlano(o), sc = segsDoPlano(cd);
        for (j = 0; j < sd.length; j++) { if (segSeg(A, Ls, sd[j][0], sd[j][1]) || segCaixa(sd[j][0], sd[j][1], box)) return false; }
        for (j = 0; j < sc.length; j++) if (segCaixa(sc[j][0], sc[j][1], o.box)) return false;
        if (segSeg(A, Ls, o.A, o.Ls)) return false;
        if (distSeg(T, o.A, o.Ls) < 1.0) return false;
      }
      return true;
    }
    var donoSeg = {};
    var cacheCand = {};
    function candidatos(it, cs1, nLin, fino, ext) {
      var ck = it.k + "|" + cs1.map(function (c) { return c.cid; }).join(",") + "|" + nLin + (fino ? "f" : "") + (ext ? "e" : "");
      if (cacheCand[ck]) return cacheCand[ck];
      var g = cs1.map(function (c) { var wl = A0.largTexto(c.lab, hN), wm = c.tipos.length * PM + 1.0; return { c: c, wl: wl, wm: wm, w: Math.max(wm, wl) + 1.2 }; }), porLin = Math.ceil(g.length / nLin), linhasG = [], i, W = 0;
      for (i = 0; i < g.length; i += porLin) linhasG.push(g.slice(i, i + porLin));
      linhasG.forEach(function (lg0) { var w0 = 2.4; lg0.forEach(function (x) { w0 += x.w; }); W = Math.max(W, w0); });
      var out = [], fr = [], k0;
      var passoF = fino ? 0.02 : 0.04;
      for (k0 = 0; k0 <= (fino ? 48 : 24); k0++) { fr.push(0.5 + (k0 % 2 ? 1 : -1) * Math.ceil(k0 / 2) * passoF); } fr.unshift(0.5);
      var angs = [Math.PI / 2, -Math.PI / 2, 1.05, -1.05, 2.1, -2.1, 0.7, -0.7, 2.45, -2.45, 1.4, -1.4, 1.75, -1.75], ds = [8, 10, 6.5, 12, 14.5];
      if (fino) { angs = []; for (var ga = 20; ga <= 340; ga += 10) angs.push(ga * Math.PI / 180); ds = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15]; }
      if (ext) ds = ds.concat([16, 17, 18, 19, 20, 21, 22]);   /* só para os trechos que não couberam: chamada de até 22 mm e base no ambiente vizinho */
      fr.forEach(function (f0) {
        if (f0 < 0.04 || f0 > 0.96) return;
        var Tp = posEm(it, it.L * f0), T = Tp.p, u = Tp.u, am = ambNo(T); if (!am && !ext) return;
        ds.forEach(function (d0) { angs.forEach(function (an) {
          var n0 = [u[0] * Math.cos(an) - u[1] * Math.sin(an), u[0] * Math.sin(an) + u[1] * Math.cos(an)], A = [T[0] + n0[0] * d0, T[1] + n0[1] * d0], dl = [T[0] - A[0], T[1] - A[1]], du = [dl[0] / d0, dl[1] / d0];
          if (Math.abs(du[0] * u[1] - du[1] * u[0]) < Math.sin(18 * Math.PI / 180)) return;
          var amC = ext ? ambNo(A) : am; if (!amC) return;
          [1, -1].forEach(function (h) {
            var x0 = Math.min(A[0], A[0] + h * W), x1 = Math.max(A[0], A[0] + h * W), box = [x0, A[1] - 4.1, x1, A[1] + 1.4 + (linhasG.length - 1) * 6.4];
            out.push({ T: T, u: u, A: A, du: du, h: h, W: W, box: box, am: amC, ext: !!ext, Ld: d0, Ls: [T[0] - du[0] * 0.8, T[1] - du[1] * 0.8], Ab: [T[0] - du[0] * 2.6, T[1] - du[1] * 2.6], linhasG: linhasG, score: Math.abs(f0 - 0.5) * 12 + Math.abs(d0 - 9) * 0.35 + Math.abs(Math.abs(an) - Math.PI / 2) * 1.5 + (A[1] > T[1] ? 0.3 : 0) });
          });
        }); });
      });
      out.sort(function (a1, b1) { return a1.score - b1.score; });
      cacheCand[ck] = out;
      return out;
    }
    function candidatosValidos(it, cs1, fino, ext, max) {
      var out = [];
      for (var nLin = 1; nLin <= 4 && out.length < max; nLin++) {
        if (nLin > 1 && cs1.length < nLin + 1) break;
        var cands = candidatos(it, cs1, nLin, fino, ext);
        for (var i = 0; i < cands.length && out.length < max; i++) {
          var cd = cands[i]; cd.linhas = []; cd.A2 = cd.A;
          cd.linhasG.forEach(function (lg0, r) { var y = cd.A[1] + r * 6.4, cur = cd.A[0] + cd.h * 1.2, gs = []; lg0.forEach(function (gg) { gs.push({ cx: cur + cd.h * gg.w / 2, g: gg }); cur += cd.h * gg.w; }); cd.linhas.push({ y: y, x0: Math.min(cd.A[0], cd.A[0] + cd.h * cd.W), x1: Math.max(cd.A[0], cd.A[0] + cd.h * cd.W), gs: gs }); });
          if (validaCand(cd, it)) { cd.it = it; cd.vivo = true; cd.cs = cs1; out.push(cd); }
        }
      }
      return out;
    }
    function tentaPlano(it, cs1, fino, ext) {
      for (var nLin = 1; nLin <= 4; nLin++) {
        if (nLin > 1 && cs1.length < nLin + 1) break;
        var cands = candidatos(it, cs1, nLin, fino, ext);
        for (var i = 0; i < cands.length; i++) {
          var cd = cands[i]; cd.linhas = []; cd.A2 = cd.A;
          cd.linhasG.forEach(function (lg0, r) { var y = cd.A[1] + r * 6.4, cur = cd.A[0] + cd.h * 1.2, gs = []; lg0.forEach(function (gg) { gs.push({ cx: cur + cd.h * gg.w / 2, g: gg }); cur += cd.h * gg.w; }); cd.linhas.push({ y: y, x0: Math.min(cd.A[0], cd.A[0] + cd.h * cd.W), x1: Math.max(cd.A[0], cd.A[0] + cd.h * cd.W), gs: gs }); });
          if (validaCand(cd, it)) { cd.it = it; cd.vivo = true; cd.cs = cs1; return cd; }
        }
      }
      return null;
    }
    function desenhaPlano(p0) {
      var it = p0.it, A = p0.A, T = p0.T, du = p0.du, Ab = p0.Ab;
      p0.linhas.forEach(function (r0) { L(D, r0.x0, r0.y, r0.x1, r0.y, "ELE-COND"); });
      L(D, A[0], A[1], Ab[0], Ab[1], "ELE-COND");
      D.cheio([[T[0], T[1]], [Ab[0] - du[1] * 0.55, Ab[1] + du[0] * 0.55], [Ab[0] + du[1] * 0.55, Ab[1] - du[0] * 0.55]], "#000", cm("ELE-COND"));
      var cids = [];
      p0.linhas.forEach(function (r0) { r0.gs.forEach(function (gp) {
        var gg = gp.g, cx = gp.cx;
        gg.c.tipos.forEach(function (kk2, q) { marcaCond(D, cx + (q - (gg.c.tipos.length - 1) / 2) * PM, r0.y, 1, 0, kk2, SM); });
        D.texto(cx, r0.y - SM - 1.5, gg.c.lab, hN, { al: "C", meio: true, attr: cm("ELE-TEXTO") });
        diag.numeros.push({ s: gg.c.lab, x: cx, y: r0.y - SM - 1.5, tipo: "lig", ref: [cx, r0.y], w: gg.wl });
        diag.marcas.push({ k: it.k, a: it.a, b: it.b, p: [cx, r0.y], u: [1, 0], cid: gg.c.cid, cids: [gg.c.cid], tipos: gg.c.tipos.slice(), papel: gg.c.papel });
        cids.push(gg.c.cid); uso.cond++;
      }); });
      diag.chamadas.push({ k: it.k, a: it.a, b: it.b, ext: !!p0.ext, amb: p0.am.id, base: [p0.linhas[0].x0, p0.linhas[0].y, p0.linhas[0].x1, p0.linhas[0].y], linhas: p0.linhas.map(function (r0) { return [r0.x0, r0.y, r0.x1, r0.y]; }), lider: [A, T], ponta: [T, Ab], box: p0.box, cids: cids });
    }
    /* resolve em conjunto: mais circuitos e trechos mais curtos primeiro; quem não cabe tenta de novo tirando uma chamada vizinha e recolocando-a depois */
    function resolveChamadas(lista) {
      indexaSg();
      segsLig.forEach(function (q) { donoSeg[q.a[0].toFixed(3) + "," + q.a[1].toFixed(3) + "," + q.b[0].toFixed(3) + "," + q.b[1].toFixed(3)] = q.k; });
      var ord = lista.slice().sort(function (a1, b1) { return (b1.cs.length - a1.cs.length) || (a1.L - b1.L); }), falhas = [];
      ord.forEach(function (it) {
        if (!it.cs.length) { diag.semMarca++; return; }
        var p0 = tentaPlano(it, it.cs);
        if (p0) { planos.push(p0); return; }
        falhas.push(it);
      });
      falhas.slice().forEach(function (it) {
        var mid = ptS(it, it.L / 2), viz = planos.filter(function (o) { return o.vivo && Math.hypot(o.T[0] - mid[0], o.T[1] - mid[1]) < 55; }).sort(function (a1, b1) { return Math.hypot(a1.T[0] - mid[0], a1.T[1] - mid[1]) - Math.hypot(b1.T[0] - mid[0], b1.T[1] - mid[1]); }).slice(0, 7), feito = false, i, j;
        viz = viz.slice(0, 5);
        /* tira UMA chamada vizinha, coloca o trecho e recoloca a vizinha; depois, PARES de vizinhas */
        var combos = []; for (i = 0; i < viz.length; i++) combos.push([viz[i]]); for (i = 0; i < Math.min(viz.length, 4); i++) for (j = i + 1; j < Math.min(viz.length, 4); j++) combos.push([viz[i], viz[j]]);
        for (i = 0; i < combos.length && !feito; i++) {
          var tirados = combos[i], novos = [];
          tirados.forEach(function (o) { o.vivo = false; });
          var pn = tentaPlano(it, it.cs), ok = !!pn;
          if (pn) { planos.push(pn); novos.push(pn); }
          for (j = 0; j < tirados.length && ok; j++) { var po = tentaPlano(tirados[j].it, tirados[j].cs); if (po) { planos.push(po); novos.push(po); } else ok = false; }
          if (ok) feito = true; else { novos.forEach(function (n0) { n0.vivo = false; }); tirados.forEach(function (o) { o.vivo = true; }); }
        }
        if (!feito) {
          /* o bloco do ambiente (nome, área...) é o último a ceder: sai do lugar, a chamada entra e o bloco procura outro lugar dentro do ambiente */
          var blv = blocosPlan.filter(function (b0) { return b0.vivo !== false && Math.hypot(b0.cc[0] - mid[0], b0.cc[1] - mid[1]) < 70; }).sort(function (a1, b1) { return Math.hypot(a1.cc[0] - mid[0], a1.cc[1] - mid[1]) - Math.hypot(b1.cc[0] - mid[0], b1.cc[1] - mid[1]); });
          for (i = 0; i < blv.length && !feito; i++) {
            var b1 = blv[i]; b1.vivo = false;
            var vals = candidatosValidos(it, it.cs, false, false, 12).concat(candidatosValidos(it, it.cs, true, false, 12), candidatosValidos(it, it.cs, true, true, 8));
            for (j = 0; j < vals.length && !feito; j++) {
              planos.push(vals[j]);
              var nc = procuraNoAmb(b1.pref, b1.wB, b1.hB, b1.poly, b1);
              if (!nc) { /* corpo do bloco 15% menor, só para este ambiente cheio */
                var hh2 = b1.hh0 || b1.hh, wB2 = Math.max.apply(null, b1.linhas.map(function (l1) { return A0.largTexto(l1, hh2 * 0.85); })), hB2 = b1.linhas.length * hh2 * 0.85 * 1.4;
                nc = procuraNoAmb(b1.pref, wB2, hB2, b1.poly, b1);
                if (nc) { b1.hh0 = hh2; b1.hh = hh2 * 0.85; b1.wB = wB2; b1.hB = hB2; }
              }
              if (nc) { b1.cc = nc; b1.box = [nc[0] - b1.wB / 2, nc[1] - b1.hB / 2, nc[0] + b1.wB / 2, nc[1] + b1.hB / 2]; b1.vivo = true; feito = true; } else { vals[j].vivo = false; }
            }
            if (!feito) b1.vivo = true;
          }
        }
        if (!feito) { var pf = tentaPlano(it, it.cs, true); if (pf) { planos.push(pf); feito = true; } }   /* busca fina: passo de 2% no trecho, ângulos de 10 em 10 graus, comprimentos de 1 em 1 mm */
        if (!feito && it.cs.length > 1) {
          /* última saída: os circuitos do trecho em duas chamadas (cada uma com a metade dos grupos) */
          var m1 = Math.ceil(it.cs.length / 2), pa1 = tentaPlano(it, it.cs.slice(0, m1));
          if (pa1) { planos.push(pa1); var pb1 = tentaPlano(it, it.cs.slice(m1)); if (pb1) { planos.push(pb1); feito = true; } else pa1.vivo = false; }
        }
        if (!feito) { var pe = tentaPlano(it, it.cs, true, true); if (pe) { planos.push(pe); feito = true; } else if (it.cs.length > 1) { var m2 = Math.ceil(it.cs.length / 2), pe1 = tentaPlano(it, it.cs.slice(0, m2), true, true); if (pe1) { planos.push(pe1); var pe2 = tentaPlano(it, it.cs.slice(m2), true, true); if (pe2) { planos.push(pe2); feito = true; } else pe1.vivo = false; } } }
        if (!feito && it.cs.length > 1) {
          /* último recurso: um grupo por chamada (cada uma com o seu líder, até 22 mm) */
          var unicos = [], okU = true;
          for (i = 0; i < it.cs.length && okU; i++) { var pu = tentaPlano(it, [it.cs[i]], true, true); if (pu) { planos.push(pu); unicos.push(pu); } else okU = false; }
          if (okU) feito = true; else unicos.forEach(function (u0) { u0.vivo = false; });
        }
        if (!feito) { it.semChamada = true; diag.semMarca++; diag.semChamada.push(it.k); }
      });
      var vistoPl = {};   /* a mesma chamada (mesmo lugar, mesmos circuitos) só uma vez: trechos repetidos no modelo davam o número empilhado */
      planos.filter(function (p0) { if (!p0.vivo) return false; var kp = p0.T[0].toFixed(1) + "," + p0.T[1].toFixed(1) + ":" + p0.linhas.map(function (r0) { return r0.gs.map(function (gp) { return gp.g.c.lab; }).join("+"); }).join("/"); if (vistoPl[kp]) return false; vistoPl[kp] = 1; return true; }).forEach(desenhaPlano);
    }
    /* textos: blocos dos ambientes, depois os rótulos - cada um no lugar livre mais perto (nada sobreposto) */
    function janela(q, r) { return [Math.max(areaD[0], q[0] - r), Math.max(areaD[1], q[1] - r), Math.min(areaD[2], q[0] + r), Math.min(areaD[3], q[1] + r)]; }
    var omitidos = 0;
    /* sem lugar livre de traço e de texto, o mais perto livre só de TEXTO (a linha pode passar atrás, nunca um texto por cima do outro) */
    function procuraTexto(pref, w, h2, raio) {
      var best = null, bd = 1e18, tb = D.tb || [];
      for (var yy = pref[1] - raio; yy <= pref[1] + raio; yy += 0.5) for (var xx = pref[0] - raio; xx <= pref[0] + raio; xx += 0.5) {
        var d2 = (xx - pref[0]) * (xx - pref[0]) + (yy - pref[1]) * (yy - pref[1]); if (d2 >= bd) continue;
        if (xx - w / 2 < areaD[0] || xx + w / 2 > areaD[2] || yy - h2 / 2 < areaD[1] || yy + h2 / 2 > areaD[3]) continue;
        var ok = true; for (var i4 = 0; i4 < tb.length && ok; i4++) { var b = tb[i4]; if (b[0] < xx + w / 2 + 0.4 && b[2] > xx - w / 2 - 0.4 && b[1] < yy + h2 / 2 + 0.4 && b[3] > yy - h2 / 2 - 0.4) ok = false; }
        if (ok) { bd = d2; best = [xx, yy]; }
      }
      return best;
    }
    function poe(pref, linhasT, hh, raios, folga) {
      var w = Math.max.apply(null, linhasT.map(function (s) { return A0.largTexto(s, hh); })), h2 = linhasT.length * hh * 1.25;
      for (var ir = 0; ir < raios.length; ir++) {
        var cc = D.procura([pref[0], pref[1]], w, h2, janela(pref, raios[ir]), { passo: 0.5, folga: folga || 0.4 });
        if (cc) { linhasT.forEach(function (s, j) { D.texto(cc[0], cc[1] - h2 / 2 + hh * 0.95 + j * hh * 1.25, s, hh, { al: "C", attr: cm("ELE-TEXTO") }); }); return true; }
      }
      omitidos++; return false;
    }
    /* o bloco do ambiente fica DENTRO do próprio ambiente: o lugar livre mais perto do centro, com a caixa inteira no polígono */
    function livreExtra(box, self) {
      var i, j;
      for (i = 0; i < blocosPlan.length; i++) if (blocosPlan[i] !== self && blocosPlan[i].vivo !== false && boxToca(box, blocosPlan[i].box, 0.5)) return false;
      for (i = 0; i < planos.length; i++) { var o = planos[i]; if (o.vivo === false) continue; if (boxToca(box, o.box, 0.5)) return false; var sd = segsDoPlano(o); for (j = 0; j < sd.length; j++) if (segCaixa(sd[j][0], sd[j][1], [box[0] - 0.4, box[1] - 0.4, box[2] + 0.4, box[3] + 0.4])) return false; }
      return true;
    }
    function procuraNoAmb(pref, w, h, poly, self) {
      var best = null, bd = 1e18, i, j;
      for (var yy = pref[1] - 40; yy <= pref[1] + 40; yy += 1.0) for (var xx = pref[0] - 60; xx <= pref[0] + 60; xx += 1.0) {
        var d2 = (xx - pref[0]) * (xx - pref[0]) + (yy - pref[1]) * (yy - pref[1]); if (d2 >= bd) continue;
        var ok = true, bx = [xx - w / 2, yy - h / 2, xx + w / 2, yy + h / 2];
        if (!pip([bx[0], bx[1]], poly) || !pip([bx[2], bx[1]], poly) || !pip([bx[0], bx[3]], poly) || !pip([bx[2], bx[3]], poly)) continue;
        if (!livreG(bx, 0.3, true)) continue;
        for (i = 0; i < 3 && ok; i++) for (j = 0; j < 3 && ok; j++) { var pt = [xx - w / 2 + w * i / 2, yy - h / 2 + h * j / 2]; if (!pip(pt, poly) || dPoly(pt, poly) < 0.4) ok = false; }
        if (ok && livreExtra(bx, self)) { bd = d2; best = [xx, yy]; }
      }
      return best;
    }
    indexaSg();
    var ambVisto = {};
    ambs.forEach(function (x) {
      var kA = txt(x.nome).toUpperCase() + "|" + (fin(x.area) ? x.area.toFixed(1) : "") + "|" + (fin(x.cx) ? x.cx.toFixed(1) : "") + "|" + (fin(x.cz) ? x.cz.toFixed(1) : ""); if (ambVisto[kA]) return; ambVisto[kA] = 1;   /* ambiente em dobro no modelo: um bloco só */
      var g0 = x.cls && x.cls.grupo || "demais", linhas = [txt(x.nome).toUpperCase(), "Área=" + br(x.area, 2) + " m²", "Perímetro=" + br(x.perimetro, 2) + " m",
        "Quant. mín. de TUGs=" + (ER0 && fin(x.area) && fin(x.perimetro) ? ER0.nTug(g0, x.area, x.perimetro, C0) : "-"), "Pot. de iluminação=" + (ER0 && fin(x.area) ? br(ER0.vaIluminacao(x.area, C0), 0) + " VA" : "-")];
      var hh = 1.45, wB = Math.max.apply(null, linhas.map(function (l1) { return A0.largTexto(l1, hh); })), hB = linhas.length * hh * 1.4, pref = P(x.cx, x.cz), cc = null, rr = [10, 20, 35, 60, 90, 130];
      var polyA = arr(x.pts).map(function (q) { return P(q[0], q[1]); }), bl = { linhas: linhas, hh: hh, wB: wB, hB: hB, pref: pref, poly: polyA, vivo: true };
      if (polyA.length >= 3) cc = procuraNoAmb(pref, wB, hB, polyA, bl);
      for (var ir = 0; ir < rr.length && !cc; ir++) cc = D.procura([pref[0], pref[1]], wB, hB, janela(pref, rr[ir]), { passo: 0.5, folga: 0.3 });
      cc = cc || procuraTexto(pref, wB, hB, 50) || pref;
      bl.cc = cc; bl.box = [cc[0] - wB / 2, cc[1] - hB / 2, cc[0] + wB / 2, cc[1] + hB / 2]; blocosPlan.push(bl);
    });
    resolveChamadas(rotLig);   /* as chamadas resolvem em conjunto com os blocos dos ambientes (que se movem dentro do ambiente se for preciso) */
    blocosPlan.forEach(function (bl) { bl.linhas.forEach(function (l1, i3) { D.texto(bl.cc[0], bl.cc[1] - bl.hB / 2 + bl.hh * 0.95 + i3 * bl.hh * 1.4, l1, bl.hh, { al: "C", attr: cm("ELE-TEXTO") }); }); });
    /* a caixa [x0, y0, x1, y1] toca a forma de um símbolo (com folga inf)? */
    function caixaToca(box, f, inf) {
      var i, j, rF = (f.t === "c" ? f.r : f.hu + f.hv) + inf;
      if (f.c[0] + rF < box[0] || f.c[0] - rF > box[2] || f.c[1] + rF < box[1] || f.c[1] - rF > box[3]) return false;
      for (i = 0; i <= 4; i++) for (j = 0; j <= 4; j++) if (dentroF([box[0] + (box[2] - box[0]) * i / 4, box[1] + (box[3] - box[1]) * j / 4], f, inf)) return true;
      if (f.t === "c") return false;
      var cs = [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]];
      for (i = 0; i < cs.length; i++) { var px = f.c[0] + f.u[0] * f.hu * cs[i][0] + f.v[0] * f.hv * cs[i][1], py = f.c[1] + f.u[1] * f.hu * cs[i][0] + f.v[1] * f.hv * cs[i][1]; if (px > box[0] - inf && px < box[2] + inf && py > box[1] - inf && py < box[3] + inf) return true; }
      return false;
    }
    function semTexto(b) { var tb = D.tb || []; for (var i = 0; i < tb.length; i++) { var t = tb[i]; if (t[0] < b[2] + 0.3 && t[2] > b[0] - 0.3 && t[1] < b[3] + 0.3 && t[3] > b[1] - 0.3) return false; } return true; }
    /* rótulo do ponto ("circuito" em cima, potência embaixo) COLADO ao símbolo, do lado de dentro do ambiente: o lugar livre mais perto do próprio símbolo */
    function poeRot(m) {
      var sm = m.sm, linhasT = [m.l1, m.l2], res = null;
      /* o lugar livre (de traço e de texto) mais perto do próprio símbolo, do lado de dentro; em ponto muito cercado, o corpo do texto cai de 2,8 para 2,2 mm antes de o número ir longe */
      [2.8, 2.2].forEach(function (hh) {
        if (res && res.d2 <= 121) return;
        var w = Math.max.apply(null, linhasT.map(function (s) { return A0.largTexto(s, hh); })), h2 = linhasT.length * hh * 1.25, best = null, bd = res ? res.d2 : 1e18;
        for (var dy = -16; dy <= 16; dy += 0.7) for (var dx = -16; dx <= 16; dx += 0.7) {
          var d2 = dx * dx + dy * dy; if (d2 >= bd) continue;
          var cx = sm.cen[0] + dx, cy = sm.cen[1] + dy, box = [cx - w / 2, cy - h2 / 2, cx + w / 2, cy + h2 / 2], ok = true;
          if (box[0] < areaD[0] || box[2] > areaD[2] || box[1] < areaD[1] || box[3] > areaD[3]) continue;
          if (sm.caixa) for (var ic = 0; ic < 4 && ok; ic++) { var cxx = ic % 2 ? box[2] : box[0], cyy = ic < 2 ? box[1] : box[3]; if ((cxx - sm.q[0]) * sm.nrm[0] + (cyy - sm.q[1]) * sm.nrm[1] < 0.3) ok = false; }
          for (var is = 0; is < simbolos.length && ok; is++) if (caixaToca(box, simbolos[is].forma, 0.5)) ok = false;
          if (ok && D.livre(box, 0.2)) { bd = d2; best = [cx, cy]; }
        }
        if (best) res = { d2: bd, c: best, hh: hh, w: w, h2: h2 };
      });
      if (!res) { omitidos++; return; }
      linhasT.forEach(function (s, j) { D.texto(res.c[0], res.c[1] - res.h2 / 2 + res.hh * 0.95 + j * res.hh * 1.25, s, res.hh, { al: "C", attr: cm("ELE-TEXTO") }); });
      diag.numeros.push({ s: linhasT.join(" "), x: res.c[0], y: res.c[1], tipo: "pt", ref: sm.cen, w: res.w });
    }
    rotPts.forEach(poeRot);
    /* as marcas de condutor de CADA circuito da ligação, em grupos lado a lado ao longo da linha, com o número do circuito logo ACIMA de cada grupo, colado nele */
    if (qdTexto) poe(qdTexto, ["QD"], 2.8, [4, 8, 16]);
    var itens = itensLegendaCompleta(C0);
    var lg = c.leg || {}, hLeg = legendaPlanta(new A0.Desenho(D.E, []), A0, 0, 0, lg.w || KU.legW, itens, Z), yLeg = Math.max(lg.y != null ? lg.y : a.y, (lg.baixo != null ? lg.baixo : a.y + a.h) - hLeg);
    lg.hLeg = hLeg; lg.yReal = yLeg; lg.fim = legendaPlanta(D, A0, lg.x != null ? lg.x : a.x, yLeg, lg.w || KU.legW, itens, Z); c.legItens = itens;
    /* título "Planta Baixa" sublinhado e a escala embaixo, como o modelo */
    var tl = c.tituloPlanta || "Planta Baixa", ty = a.y + a.h - 12;
    ty = tituloSub(D, a.x + 2, ty, tl, 5.2); T(D, a.x + 4, ty + 3.4, "1 : " + esc, 2.8);
    A0.quebrar(nLig + " ligação(ões) de desenho (" + nTronco + " tronco(s) a partir do QD) e " + (Z.pontos.filter(function (p) { return (p.pav || 0) === pav.k && p.caixaP; }).length) + " ponto(s) neste pavimento" + (omitidos ? "; " + omitidos + " rótulo(s) sem lugar livre (a linha não pode ser coberta): ver as tabelas" : "") + ". Traçado de desenho ponto a ponto (representação): os metros de eletroduto e de cabo das listas vêm do modelo 3D." + (lc.semVinculo ? " Letra de comando: " + lc.semVinculo + " luminária(s) sem vínculo interruptor-luminária no modelo: letra pela ordem do interruptor no ambiente." : " Letra de comando: pelo vínculo interruptor-luminária do modelo."), 1.6, a.w - 16 - A0.largTexto(tl, 5.2)).forEach(function (q, j) { T(D, a.x + 8 + A0.largTexto(tl, 5.2), a.y + a.h - 8 + j * 2.2, q, 1.6); });
    void legUso;
    return { escala: "1:" + esc, eletrodutos: nLig, pontos: simbolos.length, esc: esc, diag: diag };
  }

  /* o unifilar no estilo do modelo: retângulo tracejado com o painel, barramento vertical, disjuntor em arco ("1P/16A" em cima), marcas de condutor coloridas,
     "#2,5mm²", nº do circuito, "POT.: (n VA)" e "FASE X", descrição em caixa à direita; DR inline ("In:40A-30mA") no ramo do grupo; DPS com o PE */
  function unifilarRef(D, A0, x0, y, W, Z) {
    var circs = Z.circuitos, totVA = 0, cf = cargaFases(Z), faseDe = {}, pitch = 9.6, h = 2.0;
    cf.linhas.forEach(function (l) { faseDe[l.ci.id] = l.ok ? l.ci.fases : null; });
    circs.forEach(function (ci) { if (fin(ci.dim.va)) totVA += ci.dim.va; });
    var nL = circs.length, xB = x0 + 0.24 * W, xBrk = x0 + 0.37 * W, xDRc = x0 + 0.275 * W, xBus = x0 + 0.325 * W, xMk = x0 + 0.52 * W, xPot = x0 + 0.60 * W, xBox = x0 + 0.725 * W, wBox = x0 + W - xBox - 1;
    var yTop = y + 26, yBot = yTop + nL * pitch + 4, wDash = 0.48 * W;
    R(D, x0, y, wDash, yBot - y + 4, "ELE-QD");
    T(D, x0 + 0.12 * W * 0.0 + 12, y + 7, "Painel  QD1" + (Z.quadro && Z.quadro.ambNome ? " (" + txt(Z.quadro.ambNome) + ")" : ""), 3.4);
    T(D, x0 + 12, y + 13.5, "Pot. Instalada", 3.2); T(D, x0 + 52, y + 13.5, br(totVA, 0) + " VA", 3.2);
    T(D, x0 + 12, y + 20, "Pot. Demanda", 3.2); T(D, x0 + 52, y + 20, fin(Z.demanda.demanda_kVA) ? br(Z.demanda.demanda_kVA * 1000, 0) + " VA" : "não verificado", 3.2, { cor: fin(Z.demanda.demanda_kVA) ? undefined : K2.vermelho });
    L(D, xB, yTop - 3, xB, yBot, "ELE-BARRA");
    var ds = {}; arr(Z.drs).forEach(function (g) { ds[g.id] = g; });
    var ordem = circs.filter(function (ci) { return !ci.drId; });
    arr(Z.drs).forEach(function (g) { circs.filter(function (ci) { return ci.drId === g.id; }).forEach(function (ci) { ordem.push(ci); }); });
    var yy = yTop + pitch / 2, mostrados = {}, grupoY = {};
    ordem.forEach(function (ci) {
      var d = ci.dim, fa = faseDe[ci.id], g = ci.drId ? ds[ci.drId] : null;
      D.ponto(xB, yy, 1.0);
      if (g) {
        if (!mostrados[g.id]) {
          mostrados[g.id] = 1; grupoY[g.id] = [yy];
          L(D, xB, yy, xDRc - 4.5, yy, "ELE-CIRC"); simDR(D, xDRc, yy + 0.5, 6); L(D, xDRc + 4.5, yy, xBus, yy, "ELE-CIRC"); D.ponto(xBus, yy, 1.0);
          T(D, xDRc, yy - 4.4, "In:" + (g.In || "?") + "A-30mA", 1.8, { al: "C", cor: g.In ? undefined : K2.vermelho });
        } else { grupoY[g.id].push(yy); }
        L(D, xBus, yy, xBrk - 4.6, yy, "ELE-CIRC");
      } else L(D, xB, yy, xBrk - 4.6, yy, "ELE-CIRC");
      simDisj(D, xBrk, yy, ci.polos || 1); L(D, xBrk + 4.6, yy, xBox, yy, "ELE-CIRC");
      T(D, xBrk, yy - 6.4, (ci.polos || "?") + "P/" + (d.In || "?") + "A", 1.9, { al: "C", cor: d.In ? undefined : K2.vermelho });
      marcaCond(D, xMk - 1.6, yy, 0, 1, "N", 2.0); marcaCond(D, xMk, yy, 0, 1, "F", 2.0); marcaCond(D, xMk + 1.6, yy, 0, 1, "F", 2.0); marcaCond(D, xMk + 3.4, yy, 0, 1, "PE", 2.0);
      T(D, xMk + 1.2, yy - 3.6, ci.id.replace(/^C/, ""), 1.9, { al: "C" }); T(D, xMk + 1.2, yy + 3.6, "# " + sec(d.secao) + "mm²", 1.9, { al: "C", cor: fin(d.secao) ? undefined : K2.vermelho });
      T(D, xPot, yy - 1.0, "POT.: (" + br(d.va, 0) + " VA)", 1.9, { cor: fin(d.va) ? undefined : K2.vermelho });
      T(D, xPot + 1.6, yy + 3.6, fa ? "FASE " + fa.split("").join("+") : "SEM FASE", 1.9, { cor: fa ? undefined : K2.vermelho });
      D.fundo(xBox, yy - 3.2, wBox, 6.4, "#fff"); R(D, xBox, yy - 3.2, wBox, 6.4, "ELE-SIMBOLO");
      var ls = A0.quebrar(ci.id.replace(/^C/, "") + "-" + ci.nome, 1.9, wBox - 3);
      if (ls.length > 2) ls = [ls[0], ls[1]];
      ls.forEach(function (s, j) { T(D, xBox + wBox / 2, yy + (j - (ls.length - 1) / 2) * 2.5, s, 1.9, { al: "C", meio: true, cor: d.ok ? undefined : K2.vermelho }); });
      yy += pitch;
    });
    Object.keys(grupoY).forEach(function (id) { var ys = grupoY[id]; if (ys.length > 1) L(D, xBus, ys[0], xBus, ys[ys.length - 1], "ELE-CIRC"); });
    /* alimentação: disjuntor geral à esquerda, junção com o DPS (para o PE) */
    var yF = yTop + nL * pitch * 0.55, xj = x0 + 0.12 * W;
    L(D, x0 - 4, yF, xB, yF, "ELE-CIRC"); simDisj(D, x0 + 0.055 * W, yF, Z.geral.polos || 1); D.ponto(xj, yF, 1.0);
    T(D, x0 + 0.055 * W, yF - 5.0, "In " + (Z.geral.In ? Z.geral.In : "?") + " A", 1.9, { al: "C", cor: Z.geral.In ? undefined : K2.vermelho });
    if (Z.dps && Z.dps.exigido) {
      L(D, xj, yF, xj, yF + 14, "ELE-CIRC"); for (var q = 0; q < (Z.fases.fases.length); q++) marcaCond(D, xj, yF + 3 + q * 2.0, 1, 0, "F", 2.2); marcaCond(D, xj, yF + 3 + Z.fases.fases.length * 2.0, 1, 0, "N", 2.2);
      simDPS(D, xj, yF + 14);
      T(D, xj - 6, yF + 20, Z.dps.uc_V + " V", 1.9, { al: "D" }); T(D, xj - 6, yF + 24, Z.dps.in_kA + " kA", 1.9, { al: "D" });
    }
    return Math.max(yBot, yF + 36) + 6;
  }

  /* a FOLHA ÚNICA: devolve { ok: false, motivo } quando não cabe (o gerar() cai nas várias folhas) */
  function folhaUnica(c) {
    var D = c.D, g = c.geo, a = g.area, col = g.coluna, A0 = AP(), Z = c.A, op = c.op || {}, pend = [], pav = c.pav, q = qtoDe(op);
    var x1 = a.x + 4, W1 = 164, x2 = x1 + W1 + 6, W2 = 170, x3 = x2 + W2 + 6, W3 = a.x + a.w - 3 - x3, y0 = a.y + 3;
    var yA = pecasTabela(D, A0, x1, y0, W1, Z, q, pend);
    var yB = eletrodutosTabela(D, A0, x2, resumoTabela(D, A0, x2, y0, W2, Z, pend) + 8, W2, q, pend);
    var yC = cabosTabela(D, A0, x3, y0, W3, Z, pend) + 6, yQ = tituloSub(D, x3, quadroDesenho(D, A0, x3, yC, 92, Z) + 3, "Quadro Distribuição", 4.4);
    var yL = legendaDiagramas(D, A0, x3 + 100, yC, Math.min(W3 - 100, 130), Z), yE = entradaDiagrama(D, A0, x1, yA + 8, W1, Z);
    var topo = Math.max(yE, yB, yQ, yL);
    if (topo - a.y > a.h * 0.56) return { ok: false, motivo: "as tabelas do topo passam de " + Math.round(topo - a.y) + " mm" };
    var xP = x1 + KU.legW + 6, reg = { x: xP, y: topo + 4, w: a.x + a.w - 3 - xP, h: a.y + a.h - 2 - (topo + 4) }, rp = null;
    if (!c.semPlanta) {
      var esc = escalaPlanta(Z, pav, reg.w - 16, reg.h - 24);
      if (!esc || esc > 100) return { ok: false, dividir: true, motivo: "a planta não cabe até 1:100 ao lado das tabelas (" + (esc ? "1:" + esc : "nem 1:250") + ")" };
      /* v2.3 (20/11/2026, projeto real da Reforma Casa 487): abaixo de 1:50 os símbolos e textos (tamanho fixo no papel) se amontoam
         — 294 textos sobrepostos e fios em novelo. A planta vai sozinha numa folha a 1:50 e as tabelas, o quadro e o unifilar na seguinte. */
      if (esc > 50 && !c.aceitaReduzida) return { ok: false, dividir: true, motivo: "a planta só cabe a 1:" + esc + " ao lado das tabelas: vai sozinha numa folha" };
      c.leg = { x: x1, y: topo + 4, w: KU.legW, baixo: a.y + a.h - 3 }; c.tituloPlanta = c.tituloPlanta || "Planta Baixa";
      rp = folhaPlantaRef(c, pav, reg);
      if (!c.leg.fim || c.leg.yReal < topo + 2) return { ok: false, motivo: "a legenda da planta não cabe" };
    }
    var yU = unifilarRef(D, A0, col.x + 3, col.y + 3, col.w - 6, Z), yR = yU + 2;
    var rs = resumoTextos(Z), wR = col.w - 8;
    T(D, col.x + 4, yR + 3, "DEMANDA E PADRÃO DE ENTRADA", 3.0, { peso: 0.2 }); yR += 5.5;
    rs.esq.concat(rs.dir).forEach(function (s0) { A0.quebrar(s0, KU.h, wR).forEach(function (q0) { T(D, col.x + 4, yR + KU.h, q0, KU.h, { cor: /não verificado|PROVISÓRIO/.test(q0) ? K2.vermelho : undefined }); yR += KU.h * 1.4; }); yR += 0.8; });
    if (yR > g.carimbo.y - 40) return { ok: false, motivo: "o unifilar e o resumo não deixam lugar para as notas" };
    return { ok: true, escala: rp ? "1:" + rp.esc : "SEM ESCALA", colY: yR + 2, pend: pend, esc: rp ? rp.esc : null, diag: rp ? rp.diag : null };
  }

  /* ------------------------------------------------------------ COLUNA (notas, normas, pendências) */
  function coluna(D, g, blocos, yIni) {
    var A0 = AP(), col = g.coluna, car = g.carimbo, x0 = col.x + 4, wmax = col.w - 7, y = yIni != null ? yIni : col.y + 5, yMax = car.y - 3, h = K2.hPeq;
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
  function blocosDe(Z, extra) {
    var Tb = TB();
    var notas = [Tb.NORMA.ressalva,
      "Divisão: iluminação separada de tomadas (" + Tb.n5410("4.2.5.5") + "); aparelho acima de 10 A em circuito independente (9.5.3.1); tomadas de cozinha, copa e área de serviço em circuitos só delas (9.5.3.2).",
      "Condutores de cobre, isolação PVC 70 °C, 450/750 V. Capacidade pela Tabela 36 (2 condutores carregados — Tabela 46), fatores das Tabelas 40 e 42; coordenação IB ≤ In ≤ Iz (5.3.4.1); seção mínima pela Tabela 47; PE pela Tabela 58.",
      "Queda de tensão: até 4 % no circuito terminal e 5 % do ponto de entrega (6.2.7), cobre a 70 °C (" + Tb.RESISTENCIA.fonte + ").",
      "DR 30 mA onde a 5.1.3.2.2 exige; DPS no quadro (5.4.2.1.1; Uc pela Tabela 49).",
      "Cores (6.1.5.3): neutro azul-claro, PE verde-amarelo; fases e retorno: critério RA (preto, vermelho, branco; retorno cinza).",
      "Demanda e padrão de entrada: " + Tb.CEMIG.fonte + ".",
      "Eletrodutos: corrugado reforçado na laje, corrugado na parede e no forro; DN pelo número de condutores (" + Tb.OCUPACAO.fonte + "); caixa de passagem a cada 15 m menos 3 m por curva (6.2.11.1.6 b)."];
    var pend = arr(Z.pendencias).map(function (p) { return p.texto; }).concat(arr(Z.avisos).filter(function (s) { return /PROVISÓRIO|ESTIMADO/.test(s); })).concat(arr(extra));
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
    function nova(df, fn, Dpre) {
      var D = Dpre || new A.Desenho(E, []), c = { D: D, geo: geo, A: Z, qdNome: qdNome, qdAmb: qdAmb }, res = {}, i = feitas.length;
      try { res = fn(c) || {}; }
      catch (e) { avisos.push("Folha " + dois(i + 1) + " (" + df.titulo + "): " + (e && e.message ? e.message : String(e))); T(D, geo.area.x + 10, geo.area.y + 20, "ERRO AO DESENHAR ESTA FOLHA - ver avisos", 4.2, { cor: K2.vermelho }); }
      feitas.push({ def: df, D: D, escala: (res && res.escala) || "SEM ESCALA", rotulo: dois(i + 1), res: res });
      return res;
    }
    /* v2.0: a FOLHA ÚNICA "PROJETO ELÉTRICO" (modelo de referência) quando cabe; senão, o modo de várias folhas (v1.1) */
    var pavs = !opcoes.semPlanta && Z.leitura ? pavimentosDe(Z) : [], unica = null, motivoUnica = "", tri = null, dividida = false;
    if (opcoes.folhaUnica !== false && pavs.length) {
      tri = { D: new A.Desenho(E, []), geo: geo, A: Z, qdNome: qdNome, qdAmb: qdAmb, op: opcoes, pav: pavs[0], tituloPlanta: "Planta Baixa" };
      try { unica = folhaUnica(tri); } catch (e0) { unica = { ok: false, motivo: e0 && e0.message ? e0.message : String(e0) }; }
      if (unica.ok && !coluna(new A.Desenho(E, null), geo, blocosDe(Z, unica.pend), unica.colY)) unica = { ok: false, motivo: "as notas e pendências não cabem na coluna" };
      if (!unica.ok && unica.dividir && opcoes.dividir !== false) {
        /* a planta vai para a folha 01 (1:50); as tabelas, o quadro, o unifilar e as notas ficam na 02, no mesmo desenho da folha única */
        var tri2 = { D: new A.Desenho(E, []), geo: geo, A: Z, qdNome: qdNome, qdAmb: qdAmb, op: opcoes, pav: pavs[0], semPlanta: true };
        var u2; try { u2 = folhaUnica(tri2); } catch (e2) { u2 = { ok: false, motivo: e2 && e2.message ? e2.message : String(e2) }; }
        if (u2.ok && !coluna(new A.Desenho(E, null), geo, blocosDe(Z, u2.pend), u2.colY)) u2 = { ok: false, motivo: "as notas e pendências não cabem na coluna" };
        if (u2.ok) { unica = u2; tri = tri2; dividida = true; }
      }
      if (!unica.ok) { motivoUnica = unica.motivo; unica = null; }
    }
    var juntas = false;
    if (unica) {
      /* o desenho de teste, já pronto e aprovado, é o da folha (não desenha duas vezes) */
      if (dividida) pavs.forEach(function (pv) { plantaRef(pv); });
      nova({ id: "projeto-eletrico", titulo: dividida ? "QUADRO, DIAGRAMAS E TABELAS" : "PROJETO ELÉTRICO", tipo: "unica" }, function () { return unica; }, tri.D);
    } else {
      if (opcoes.folhaUnica !== false && pavs.length) avisos.push("Folha única não coube (" + motivoUnica + "): saiu no modo de várias folhas.");
      nova({ id: "quadro-cargas", titulo: "QUADRO DE CARGAS E DIAGRAMA UNIFILAR", tipo: "quadro" }, function (c) {
        var r1 = folhaQuadro(c), y = (r1.yFim || geo.area.y) + 12;
        if (geo.area.y + geo.area.h - y >= alturaUnifilar(Z)) { folhaUnifilar(c, y); juntas = true; }
        return r1;
      });
      if (!juntas) { feitas[0].def.titulo = "QUADRO DE CARGAS"; nova({ id: "unifilar", titulo: "DIAGRAMA UNIFILAR", tipo: "unifilar" }, function (c) { return folhaUnifilar(c); }); }
    }
    /* a planta de pontos e eletrodutos, uma folha por pavimento (opcoes.semPlanta tira); na folha única o 1º pavimento já está nela */
    function plantaRef(pv) {
      nova({ id: "planta-" + pv.k, titulo: "PLANTA DE PONTOS E ELETRODUTOS - " + txt(pv.nome).toUpperCase(), tipo: "planta" }, function (c) {
        var ar = c.geo.area, xP = ar.x + 4 + KU.legW + 6;
        c.op = opcoes; c.tituloPlanta = "Planta Baixa - " + txt(pv.nome); c.leg = { x: ar.x + 4, y: ar.y + 4, w: KU.legW, baixo: ar.y + ar.h - 3 };
        return folhaPlantaRef(c, pv, { x: xP, y: ar.y + 2, w: ar.x + ar.w - 3 - xP, h: ar.h - 4 });
      });
    }
    pavs.forEach(function (pv, ip) {
      if (dividida || (unica && ip === 0)) return;
      nova({ id: "planta-" + pv.k, titulo: "PLANTA DE PONTOS E ELETRODUTOS - " + txt(pv.nome).toUpperCase(), tipo: "planta" }, function (c) {
        if (!unica) return folhaPlanta(c, pv);
        /* v2.1: os pavimentos além do primeiro no MESMO estilo da folha única (bloco do ambiente, etiquetas, legenda em coluna embaixo-esquerda) */
        var ar = c.geo.area, xP = ar.x + 4 + KU.legW + 6;
        c.op = opcoes; c.tituloPlanta = "Planta Baixa - " + txt(pv.nome); c.leg = { x: ar.x + 4, y: ar.y + 4, w: KU.legW, baixo: ar.y + ar.h - 3 };
        return folhaPlantaRef(c, pv, { x: xP, y: ar.y + 2, w: ar.x + ar.w - 3 - xP, h: ar.h - 4 });
      });
    });
    var emp = opcoes.empresa, empObj = emp && typeof emp === "object" ? emp : null, revNum = rev.replace(/^R/i, "") || "00";
    var pr = P.normalizar({ id: "elepranchas", nome: "Projeto elétrico", formato: formato, orientacao: "paisagem", origem: "ele",
      carimbo: { modelo: "RA", empresa: empObj ? "" : txt(emp), responsavel: txt(opcoes.responsavel), registro: txt(opcoes.registro), titulo: txt(opcoes.tituloProfissional),
                 obra: txt(opcoes.obra), proprietario: txt(opcoes.proprietario), contratante: txt(opcoes.contratante), local: txt(opcoes.local),
                 codigo: codigo, data: data, revisoes: [[revNum, txt(opcoes.descricaoRevisao) || "EMISSÃO INICIAL - PROJETO EXECUTIVO", data]] },
      folhas: feitas.map(function (f, i) { return { id: f.def.id, n: i + 1, conteudo: f.def.titulo, escala: f.escala, numero: codigo + " " + rev }; }) });
    var verif = { folhas: [], sobreposicoes: 0 }, nP = feitas.length;
    var folhas = feitas.map(function (f, i) {
      var D = f.D, fl = pr.folhas[i], W = geo.papel.w, Hp = geo.papel.h, M = geo.moldura, Fd = new A.Desenho(E, null);
      R(Fd, M.x, M.y, M.w, M.h, "ELE-MOLDURA");
      if (!coluna(Fd, geo, blocosDe(Z, f.res && f.res.pend), f.res && f.res.colY) && i === 0) avisos.push("Notas e pendências não couberam inteiras na coluna: veja o memorial.");
      A.carimbo(Fd, pr, fl, geo, empObj, opcoes.logo || null, f.rotulo + "/" + dois(nP));
      var numero = codigo + "-" + f.rotulo;
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + n(W) + 'mm" height="' + n(Hp) + 'mm" viewBox="0 0 ' + n(W) + " " + n(Hp) + '" font-family="' + FONTE + '" data-folha="' + esc(f.def.id) + '" data-numero="' + esc(numero) + '">' +
        "<title>" + esc(numero + " - " + f.def.titulo + " - " + rev) + "</title>" + '<rect x="0" y="0" width="' + n(W) + '" height="' + n(Hp) + '" fill="#fff"/>' +
        '<g data-corpo="1">' + D.svg() + '</g><g data-folha-moldura="1">' + Fd.svg() + "</g></svg>";
      var cx = D.caixas || [], pares = A.sobreposicoes(cx);
      verif.folhas.push({ numero: numero, textos: cx.length, sobreposicoes: pares.length, pares: pares.slice(0, K2.parEx) });
      verif.sobreposicoes += pares.length;
      if (pares.length) avisos.push("Folha " + numero + ": " + pares.length + " par(es) de textos sobrepostos (ex.: " + pares.slice(0, K2.parAviso).map(function (q) { return q[0] + " x " + q[1]; }).join("; ") + ").");
      return { diagPlanta: f.res && f.res.diag, id: f.def.id, rotulo: f.rotulo, numero: numero, titulo: f.def.titulo, formato: formato, escala: f.escala, svg: svg, caixasTexto: cx };
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
          var rt = /rotate\((-?[\d.]+)/.exec(a.transform || ""); doc.texto(cT, pt[0], pt[1], fs * K2.letraDxf, s, rt ? -Number(rt[1]) : 0, al === "middle");
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
  /* Elétrica v2 L5: o memorial completo mora em js/elememorial.js; este é o texto curto anterior, que fica de reserva quando o módulo novo
     não está carregado (mesma assinatura e mesma forma de saída) */
  function memorial(Z, opcoes) {
    var EMm = dep("EleMemorial", "./elememorial.js");   // eletrica-v2
    if (EMm && EMm.gerar && Z && Z.ok) { var rm = EMm.gerar(Z, opcoes); if (rm && rm.ok) return rm; }   // eletrica-v2
    return memorialCurto(Z, opcoes);
  }
  function memorialCurto(Z, opcoes) {
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

  var ElePranchas = { VERSAO: 2, _letrasComando: letrasComando, K2: K2, gerar: gerar, exportar: exportar, memorial: memorial, estilo: estilo, paraDxf: paraDxf };
  global.ElePranchas = ElePranchas;
  if (typeof module !== "undefined" && module.exports) module.exports = ElePranchas;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
