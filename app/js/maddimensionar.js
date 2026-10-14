/* =====================================================================
 * maddimensionar.js — ORQUESTRADOR do cálculo da estrutura de madeira
 * (motor PURO, ES5, sem DOM, Node-testável). Contrato em
 * docs/madeira/CONTRATO.md — quem muda um campo muda lá primeiro.
 *
 *   MadDimensionar.calcular(entrada) → resultado (para o memorial, as
 *   pranchas, o manual, a exportação para o CYPE e a tela)
 *
 * PASSOS: espécies (MadEspecie) → piso seco (MadPiso) → modelo analítico
 * (MadModelo, rótula vertical embaixo) → análise global (MadAnalise: casca
 * nas paredes, cortante, carga consistente; E pela espécie/classe) →
 * combinações (NBR 8681:2003, kmod1 pela variável principal) → estabilidade
 * global (β dos pilares, se o motor tiver) → verificação por função
 * (MadDim.barra2022) → reações para a fundação → compra (MadMercado).
 *
 * O QUE AINDA NÃO ESTÁ AQUI (sai em `naoAbrangido`, nunca como "OK"):
 * flecha das coberturas pela análise global, ligações a partir dos
 * esforços da análise (hoje: memorial das ligações R00), vidro (NBR 7199
 * sem texto), vibração do piso.
 * Teste: node tools/test-mad-dimensionar.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function req(nome, arq) { return global[nome] || (typeof require === "function" ? require("./" + arq) : null); }
  var MM = req("MadMateriais", "madmateriais.js"), MD = req("MadDim", "maddim7190.js"), ME = req("MadEspecie", "madespecie.js");
  var MP = req("MadPiso", "madpiso.js"), MO = req("MadModelo", "madmodelo.js"), MA = req("MadAnalise", "madanalise.js");
  var MER = req("MadMercado", "madmercado.js");
  function opc(nome, arq) { try { return req(nome, arq); } catch (e) { return null; } }
  var WF = opc("MadWoodFrame", "madwoodframe.js"), ML = opc("MadLigCalc", "madligcalc.js");
  function br(x, c) { return (Math.round(x * Math.pow(10, c == null ? 2 : c)) / Math.pow(10, c == null ? 2 : c)).toFixed(c == null ? 2 : c).replace(".", ","); }

  var MadDimensionar = {};

  /* Quiosque: grupo do MODELO ANALÍTICO → espécie (coerente com MadEspecie.QUIOSQUE, que fala dos grupos da FONTE) */
  MadDimensionar.QUIOSQUE = {
    grupoEspecie: [
      [/^PILAR$|^COB_|^COBINF_/, "itauba"],                 // pergolado (cliente 11/10; pilares confirmados 12/10)
      [/^GUIA_10x20$|^VERGA_10x20$/, "tatajuba"],           // madeira dura por cálculo dentro da parede (a confirmar)
      [/^BAR_|^VP_|^DORM_|^TEST_/, "tatajuba"],             // piso (cliente)
      [/^FORRO_|^GUIA_10x5$/, "pinus_cca"]                  // wood frame / forro (cliente)
    ],
    /* DECISÕES DO RT aplicadas por padrão (seção/espécie por grupo do modelo; grupoFonte = grupo das peças na fonte, para a compra) */
    decisoesRT: {
      FORRO_5x15: { b_cm: 10, h_cm: 15, especie: "tatajuba", grupoFonte: "FORRO_BARROTE",
        motivo: "DEFINIÇÃO RA (RT, 12/10/2026): barrotes do forro em Pinus 5×15 reprovavam (η até 2,96 — escora do vento no topo das paredes); alternativas testadas: Tatajuba 10×15 η 0,61 (adotada: mais folga, largura da viga de topo, mesma compra do piso), Pinus 10×15 η 0,84 (sem bitola no catálogo), Tatajuba 7×15 η 0,82" }
    },
    verificar: /^PILAR$|^COB_|^COBINF_|^GUIA_10x20$|^VERGA_10x20$|^FORRO_/,
    pilar: /^PILAR$/,
    /* nome de cada função (grupo do modelo) no memorial */
    funcoes: { PILAR: "Pilares compostos 4×(7×7)", COB_7x20: "Vigas da cobertura superior 7×20", COBINF_7x20: "Vigas e bloqueadores da cobertura inferior 7×20",
      GUIA_10x20: "Viga de topo das paredes 10×20", VERGA_10x20: "Verga da frente do bar", FORRO_5x15: "Barrotes do forro (coberturas internas)" },
    /* diagnóstico das reprovações por função — explica o mecanismo e lista as ALTERNATIVAS (decisão do RT, nunca tomada aqui).
     * Rodada de 12/10/2026 (conversa da madeira): os barrotes do forro, ligados rigidamente às paredes e aos pilares no modelo, fazem
     * de escora horizontal do vento no topo das paredes (compressão + flexão no eixo fraco do Pinus 5×15) e os bloqueadores levam
     * torção pela ligação rígida que o gerador atribui. */
    diagnostico: {
      FORRO_5x15: {
        mecanismo: "No modelo analítico os barrotes do forro estão ligados às paredes e aos pilares sem liberação de giro. Com o vento, o topo das paredes desloca e o forro passa a trabalhar como escora horizontal entre as paredes: compressão axial somada à flexão no eixo fraco da seção 5×15 de Pinus (kc baixo no plano de 5 cm). Os bloqueadores do forro recebem torção e cortante pela mesma ligação rígida. A reprovação vem desse papel de contraventamento que o modelo atribui ao forro, não da carga de gravidade do forro.",
        alternativas: [
          "Rotular as ligações do forro (barrote e bloqueador) no modelo, para que o forro não participe do contraventamento, e garantir na execução a ligação correspondente (fixação que não transmita momento) — recalcular.",
          "Manter o forro como escora e trocar a seção ou a espécie dos barrotes e bloqueadores (madeira dura ou seção maior no plano fraco) — recalcular.",
          "Travar o topo das paredes por outro elemento (viga de topo contínua ou diafragma do forro com chapa pregada) que leve a força horizontal, deixando o forro só para a gravidade — recalcular.",
          "Conferir a rigidez das paredes de contraventamento adotada (chapa, pregação, redução de 50 %): parede mais rígida reduz o deslocamento do topo e a força no forro."
        ]
      }
    }
  };

  /* ---------- ligações do cálculo emitido (calc_ligacoes.json do PROJ-EST R03), passos refeitos pelo MadLigCalc ----------
   * Os esforços e os η são os do emitido; as resistências são refeitas aqui com as mesmas expressões (teste: tools/test-mad-lig.js)
   * e conferidas com o emitido — diferença > 1 % vira aviso. Ligações sem cálculo no emitido entram com eta null ("não verificada"). */
  MadDimensionar.ligacoesEmitidas = function (CL, LQ, extra) {
    if (!ML || !CL || !CL.premissas) return { lista: [], difs: ["MadLigCalc ou calc_ligacoes ausente"] };
    var L = ML, P = CL.premissas, RHO = P.rho_k.Tatajuba, FUB = P.fub, GL = P.gama_lig, out = [], difs = [];
    function kmodDe(combo) { var curta = /1,4V/.test(combo) && /\+ 1,4V/.test(combo), k1 = curta ? P.kmod1_curta : P.kmod1_longa; return { k: k1 * P.kmod2, txt: "kmod = " + br(k1, 1) + " (" + (curta ? "curta — vento principal" : "longa") + ") × " + br(P.kmod2, 1) + " (umidade 3) = " + br(k1 * P.kmod2, 2) }; }
    function r2(x) { return Math.round(x * 100) / 100; }
    function maior(l, f) { return l.slice().sort(function (a, b) { return f(b) - f(a); })[0]; }
    function confere(nome, a, b) { if (Math.abs(a - b) > 0.01 + 0.01 * Math.abs(b)) difs.push(nome + ": refeito " + a + " × emitido " + b); }
    var tipo = {};
    ((LQ && LQ.ligacoes) || []).forEach(function (x) { var k = x.codigo.split("-")[0]; if (!tipo[k]) tipo[k] = { tipo: x.tipo, descricao: x.descricao, status: x.status, regra: x.regra, n: 0 }; tipo[k].n++; });
    function T(k) { return tipo[k] || { tipo: k, descricao: "", n: null }; }
    if (CL.L01) {
      var x = maior(CL.L01, function (v) { return Math.max(v.eta_H, v.eta_T); }), ap = L.acoPino(16, FUB), My = L.myRk(16, FUB), fh = L.fhAlfa(16, RHO, 90) / 3, cs = L.corteSimples(fh, fh, 200, 200, 16, My);
      var kH = kmodDe(x.combo_H), kT = kmodDe(x.combo_T), RdM = L.rd(cs.Rk, kH.k) / 1000, Rax = L.rd(L.barraColadaRaxK(16, 200), kT.k) / 1000, e1 = Math.max(x.eta_H, x.eta_T);
      confere("L01 Rd madeira", r2(RdM), x.Rd_madeira_kN); confere("L01 Rax,d", r2(Rax), x.Rax_d_kN); confere("L01 Fv,Rd aço", r2(ap.FvRd), x.Fv_Rd_aco);
      out.push({ codigo: "L01", tipo: T("L01").tipo, descricao: T("L01").descricao, quantidade: T("L01").n, governante: "pilar " + x.pilar, eta: e1, ok: e1 <= 1,
        norma: "EN 1995-1-1:2004+A2:2014 8.2 (Johansen); EN 1993-1-8 Tab. 3.4 (aço do pino); DIN 1052:2008 (barra colada)",
        passos: [
          "Barra M16 A4-70 (fub = " + FUB + " MPa, As = " + br(ap.As, 0) + " mm²): Fv,Rd = 0,6·fub·As/γM2 = " + br(ap.FvRd) + " kN; Ft,Rd = 0,9·fub·As/γM2 = " + br(ap.FtRd) + " kN (γM2 = 1,25).",
          "Madeira (ρk = " + RHO + " kg/m³): fh,90,k = 0,081·(1 − 0,01·d)·ρk/(k90·sen²α + cos²α) = " + br(L.fhAlfa(16, RHO, 90)) + " MPa, reduzido a 1/3 no topo = " + br(fh) + " MPa; My,Rk = 0,3·fu·d^2,6 = " + br(My / 1000, 1) + " N·m.",
          "Corte simples madeira–madeira 200/200 mm (EN 1995-1-1 eq. 8.6): Rk = " + br(cs.Rk / 1000) + " kN (modo " + cs.modo + "); " + kH.txt + "; Rd = kmod·Rk/γlig = " + br(RdM) + " kN (γlig = " + br(GL, 1) + ").",
          "Arrancamento da barra colada (DIN 1052:2008): Rax,k = π·d·ℓad·f1,k = π·16·200·4,0 = " + br(L.barraColadaRaxK(16, 200) / 1000) + " kN; " + kT.txt + "; Rax,d = " + br(Rax) + " kN.",
          "Esforços (pilar " + x.pilar + "): H = " + br(x.H_kN) + " kN (" + x.combo_H + ") → η = H/Rd = " + br(x.eta_H, 3) + "; T = " + br(x.T_kN) + " kN (" + x.combo_T + ") → η = T/Rax,d = " + br(x.eta_T, 3) + "."],
        lista: CL.L01.map(function (v) { return { id: v.pilar, combo: v.combo_H + " / " + v.combo_T, Sd: "H " + br(v.H_kN) + " / T " + br(v.T_kN) + " kN", Rd: br(v.Rd_madeira_kN) + " / " + br(v.Rax_d_kN) + " kN", eta: Math.max(v.eta_H, v.eta_T) }; }) });
    }
    if (CL.L02) {
      var x2 = maior(CL.L02, function (v) { return v.eta; }), k2 = kmodDe(x2.combo), f90 = L.fhAlfa(10, RHO, 90), cd = L.corteDuplo(f90, f90, 70, 70, 10, L.myRk(10, FUB)), Rd2 = L.rd(2 * cd.Rk, k2.k) / 1000 * 2;
      CL.L02.forEach(function (v) { confere("L02 " + v.pilar, r2(L.rd(2 * cd.Rk, kmodDe(v.combo).k) / 1000 * 2), v.Rd_bloqueador_kN); });
      out.push({ codigo: "L02", tipo: T("L02").tipo, descricao: T("L02").descricao, quantidade: T("L02").n, governante: "pilar " + x2.pilar, eta: x2.eta, ok: x2.eta <= 1, norma: "EN 1995-1-1:2004+A2:2014 8.2.2 (corte duplo, eq. 8.7)",
        passos: [
          "Barra M10 A4-70 em corte duplo madeira–madeira, peças de 70 mm (7 + 7 + 7), força a 90° das fibras: fh,90,k = " + br(f90) + " MPa; My,Rk = " + br(L.myRk(10, FUB) / 1000, 1) + " N·m.",
          "Rk por plano = " + br(cd.Rk / 1000) + " kN (modo " + cd.modo + "); 2 planos por barra, 2 barras por braço: Rd = kmod·(2·Rk)/γlig × 2 = " + br(Rd2) + " kN (" + k2.txt + ").",
          "Vd = " + br(x2.Vd_kN) + " kN (" + x2.combo + ", pilar " + x2.pilar + ") → η = Vd/Rd = " + br(x2.eta, 3) + "."],
        lista: CL.L02.map(function (v) { return { id: v.pilar, combo: v.combo, Sd: br(v.Vd_kN) + " kN", Rd: br(v.Rd_bloqueador_kN) + " kN", eta: v.eta }; }) });
    }
    if (CL.L03) {
      var x3 = maior(CL.L03, function (v) { return v.eta; }), k3 = kmodDe(x3.combo), alfa = Math.atan2(x3.Fh_kN, x3.Fv_kN) * 180 / Math.PI;
      var a1 = L.fhAlfa(10, RHO, alfa), a2 = L.fhAlfa(10, RHO, 90 - alfa), c3 = L.corteDuplo(a1, a2, 70, 70, 10, L.myRk(10, FUB)), nef = L.nef(2, 100, 10), Rd3 = L.rd(2 * c3.Rk, k3.k) / 1000 * 2 * nef;
      confere("L03 governante", r2(Rd3), x3.Rd_kN);
      out.push({ codigo: "L03", tipo: T("L03").tipo, descricao: T("L03").descricao, quantidade: T("L03").n, governante: "pilar " + x3.pilar + ", nó z = " + br(x3.no_z, 3) + " m (" + x3.cobertura + ")", eta: x3.eta, ok: x3.eta <= 1,
        norma: "EN 1995-1-1:2004+A2:2014 8.2.2 (eq. 8.7), 8.1.2 (nef, eq. 8.34), eq. 8.31 (fh,α)",
        passos: [
          "Resultante Fd = √(Fv² + Fh²) = √(" + br(x3.Fv_kN) + "² + " + br(x3.Fh_kN) + "²) = " + br(x3.Fd_kN) + " kN; α = " + br(alfa, 1) + "° → fh,α,pilar = " + br(a1, 1) + " MPa; fh,viga = " + br(a2, 1) + " MPa.",
          "Rk por plano = " + br(c3.Rk / 1000) + " kN (modo " + c3.modo + "); nef = mín(n; n^0,9·(a1/13d)^0,25) = " + br(nef, 2) + " (n = 2, a1 = 100 mm); Rd = kmod·2·Rk/γlig × 2 × nef = " + br(Rd3) + " kN (" + k3.txt + ").",
          "η = Fd/Rd = " + br(x3.Fd_kN) + "/" + br(Rd3) + " = " + br(x3.eta, 3) + " (" + x3.combo + ")."],
        lista: CL.L03.map(function (v) { return { id: v.pilar + " z " + br(v.no_z, 3), combo: v.combo, Sd: br(v.Fd_kN) + " kN", Rd: br(v.Rd_kN) + " kN", eta: v.eta }; }) });
    }
    var dEf = 1.1 * 7, fl = L.fhAlfa(dEf, RHO, 90);
    if (CL.L04) {
      var rkt = L.corteSimples(fl, fl, 70, 80, dEf, L.myRk(dEf, FUB)).Rk / 3;
      ["bloqueador", "longarina"].forEach(function (t) {
        var x4 = CL.L04[t]; if (!x4) return;
        var k4 = kmodDe(x4.combo), Rd4 = L.rd(2 * rkt, k4.k) / 1000;
        confere("L04 " + t, r2(Rd4), x4.Rd_2_tirefonds_topo_kN);
        out.push({ codigo: "L04", sub: t, tipo: T("L04").tipo + " — " + t, descricao: T("L04").descricao, quantidade: t === "bloqueador" ? T("L04").n : null, governante: x4.peca, eta: x4.eta, ok: x4.eta <= 1, substituidaPor: x4.eta > 1 && CL.L08 ? "L08" : null,
          norma: "EN 1995-1-1:2004+A2:2014 8.2.2 (eq. 8.6) com diâmetro efetivo 1,1·d1 (8.7.1)",
          passos: [
            "Tirefond DIN 571 10×150 A4: diâmetro efetivo d,ef = 1,1 × 7 = " + br(dEf, 1) + " mm; fh,90,k = " + br(fl) + " MPa; corte simples 70/80 mm.",
            "Rk = " + br(rkt * 3 / 1000) + " kN, reduzido a 1/3 por entrar no topo da peça = " + br(rkt / 1000) + " kN; 2 tirefonds: Rd = kmod·2·Rk/γlig = " + br(Rd4) + " kN (" + k4.txt + ").",
            "Fd = " + br(x4.Fd_kN) + " kN (" + x4.combo + "; " + x4.peca + ") → η = " + br(x4.eta, 3) + (x4.eta > 1 && CL.L08 ? ". Não atende: na longarina de topo a ligação foi substituída pela L08 (cantoneiras de apoio)." : ".")] });
      });
    }
    if (CL.L08) {
      var x8 = CL.L08, k8 = kmodDe(x8.combo), t1 = 50 - 6.35, rk8 = L.acoMadeiraSimples(fl, t1, dEf, L.myRk(dEf, FUB), 1), Rd8 = L.rd(rk8.Rk, k8.k) / 1000 * 4;
      confere("L08 Rk", r2(rk8.Rk / 1000), x8.Rk_tirefond_kN); confere("L08 Rd", r2(Rd8), x8.Rd_4_tirefonds_kN);
      out.push({ codigo: "L08", tipo: T("L08").tipo, descricao: T("L08").descricao, quantidade: T("L08").n, governante: x8.peca, eta: x8.eta, ok: x8.eta <= 1, norma: "EN 1995-1-1:2004+A2:2014 8.2.3 (aço–madeira, eq. 8.9)",
        passos: [
          "Tirefond DIN 571 10×50 A4 na cantoneira inox 76×76×6,35: madeira t1 = 50 − 6,35 = " + br(t1) + " mm; d,ef = " + br(dEf, 1) + " mm; chapa tratada como fina (t ≤ 0,5·d), como no cálculo emitido R03.",
          "Modos (eq. 8.9): a = 0,4·fh·t1·d = " + br(rk8.modos.a / 1000) + " kN; b = 1,15·√(2·My·fh·d) = " + br(rk8.modos.b / 1000) + " kN → Rk = " + br(rk8.Rk / 1000) + " kN (modo " + rk8.modo + ").",
          "4 tirefonds por peça: Rd = kmod·Rk/γlig × 4 = " + br(Rd8) + " kN (" + k8.txt + "); Fd = " + br(x8.Fd_kN) + " kN (" + x8.combo + ") → η = " + br(x8.eta, 3) + "."] });
    }
    /* L15 (barrote da fila no pilar composto, "igual à L08") no barrote em BINÁRIO pilar + VP: a ponta presa no pilar segura o
     * arrancamento do balanço (13/10/2026). Mesma resistência da L08 (4 tirefonds 10×50 por peça, cantoneira 6,35 mm), kmod longa. */
    var bins = (extra && extra.binarios) || [], fezL15 = false;
    if (bins.length && CL.L08 && tipo.L15) {
      var kL = kmodDe("1,4G + 1,4Q"), rkB = L.acoMadeiraSimples(fl, 50 - 6.35, dEf, L.myRk(dEf, FUB), 1), RdB = L.rd(rkB.Rk, kL.k) / 1000 * 4;
      var cB = bins.map(function (b) { var Fd = 1.4 * Math.max(0, -b.R_G_kN) + 1.4 * Math.max(0, -b.R_Q_kN); return { b: b, Fd: Fd, eta: Fd / RdB }; });
      var gB = maior(cB, function (x) { return x.eta; });
      out.push({ codigo: "L15", tipo: tipo.L15.tipo, descricao: tipo.L15.descricao, quantidade: tipo.L15.n, governante: gB.b.marca, eta: gB.eta, ok: gB.eta <= 1, norma: "EN 1995-1-1:2004+A2:2014 8.2.3 (aço–madeira, eq. 8.9) — igual à L08",
        passos: ["Barrote " + gB.b.marca + " em binário: preso no pilar composto" + (gB.b.pilar ? " (" + gB.b.pilar + ")" : "") + " e apoiado na VP, balanço de " + br(gB.b.balanco_m) + " m; reação no pilar (característica) G = " + br(gB.b.R_G_kN) + " kN, Q = " + br(gB.b.R_Q_kN) + " kN (negativa = arrancamento).",
          "Fd = 1,4·|G| + 1,4·|Q| = " + br(gB.Fd) + " kN (vertical, perpendicular às fibras do barrote).",
          "Rk por tirefond = " + br(rkB.Rk / 1000) + " kN (modo " + rkB.modo + "); 4 tirefonds na peça: Rd = kmod·Rk/γlig × 4 = " + br(RdB) + " kN (" + kL.txt + ") → η = " + br(gB.eta, 3) + "."] });
      fezL15 = true;
    }
    ["L05", "L06", "L07", "L09", "L10", "L11", "L12", "L13", "L14", "L15"].forEach(function (k) {
      var d = tipo[k]; if (!d || (k === "L15" && fezL15)) return;
      out.push({ codigo: k, tipo: d.tipo, descricao: d.descricao, quantidade: d.n, eta: null, status: d.status, regra: d.regra,
        nota: k === "L06" && CL.L06 ? "Cortante de vento de cálculo na base de todo o quiosque: " + br(CL.L06.H_vento_total_d_kN) + " kN — " + CL.L06.nota + "." : null });
    });
    return { lista: out, difs: difs, premissas: P };
  };

  /* ---------- Painel Wall do piso: carga característica por zona × ficha do fabricante (sem η: a ficha não define a natureza do valor) ---------- */
  function conclusaoPainel(zonas, cfg, ref) {
    var acima = zonas.filter(function (z) { return z.acimaFicha; }).length;
    var todas = zonas.length && zonas.every(function (z) { return z.atendeReferencia; });
    var txt = (todas ? "Atende pela tabela de referência nas " + zonas.length + " zonas, mas o " : "") + "G + Q característico " + (todas ? "fica " : "") + "acima do valor publicado na ficha (4,90 kN/m² a ≤ 1,25 m) em " + acima + " de " + zonas.length + " zonas; a ficha não diz se o valor é admissível, característico ou de ruptura.";
    if (zonas.some(function (z) { return z.capReferencia_kN_m2 != null; })) {
      txt += " Pela tabela de referência (" + (ref && ref.produto || "Decorlit") + ") com o vão de cada zona: " + zonas.map(function (z) {
        return z.zona + " " + br(z.total, 2) + " kN/m²" + (z.gParedeFora ? " (sem as paredes de tijolo, " + br(z.gParedeFora, 2) + " kN/m², que descem pelos barrotes)" : "") + " a " + br(z.vao_m, 2) + " m → " + (z.atendeReferencia ? "atende" : "NÃO atende") + " (" + br(z.capReferencia_kN_m2, 2) + (z.foraTabela ? ", vão abaixo da tabela: adotado o do menor vão" : "") + ")";
      }).join("; ") + ".";
    }
    return txt + " Liberar o piso só com a carta do fabricante (Eternit/Nibra) com a carga para esses vãos e a natureza do valor.";
  }

  MadDimensionar.painelPiso = function (cfg, piso, MC) {
    if (!cfg || !MC || !MC.produto || !piso || !piso.cargasZona) return null;
    var p = MC.produto(cfg.produtoId); if (!p) return null;
    var dt = p.dados_tecnicos || {}, cap = dt.carga_distribuida_kN_m2_40mm_conversao, G = piso.cargasZona.G_Z_kN_m2, Q = piso.cargasZona.Q_Z_kN_m2;
    var zonas = Object.keys(G).map(function (z) {
      var vz = (cfg.vaoPorZona && cfg.vaoPorZona[z]) || cfg.vaoApoios_m;
      /* paredes apoiadas sobre a zona (tijolo da ducha): com vão LIVRE entre barrotes pequeno (16 cm de barrote a 20 cm de eixo = 4 cm)
       * a parede descarrega nos barrotes através da pedra e da chapa, que só trabalha à compressão — o peso dela sai da FLEXÃO da chapa
       * (decisão do RT 13/10/2026). O cálculo dos barrotes, VPs e pilaretes continua com o peso espalhado (mesmo total). */
      var pf = cfg.paredesNosBarrotes && cfg.paredesNosBarrotes[z] && piso.gTijolo && piso.zonaTijolo === z ? piso.gTijolo : 0;
      var tot = G[z] - pf + Q[z];
      return { zona: z, G: G[z] - pf, Q: Q[z], total: tot, vao_m: vz, acimaFicha: tot > cap, gParedeFora: pf || null,
        vaoLivre_m: cfg.larguraBarrotePorZona && cfg.larguraBarrotePorZona[z] ? vz - cfg.larguraBarrotePorZona[z] : null };
    });
    var ref = null, alt = cfg.referenciaVaoCarga ? MC.produto(cfg.referenciaVaoCarga) : null;
    if (alt) {
      var tb = (alt.tabelas_resistencia || [])[0];
      if (tb) {
        var lin = tb.linhas.filter(function (l) { return l[0] === cfg.espessuraMm; })[0], vaos = tb.colunas.slice(1).map(function (c) { return Number(/(\d+)_mm/.exec(c)[1]) / 1000; });
        var pts = []; vaos.forEach(function (v, i) { if (lin && lin[i + 1] != null) pts.push([v, lin[i + 1], tb.linhas_kN_m2_conversao.filter(function (l) { return l[0] === cfg.espessuraMm; })[0][i + 1]]); });
        var noVao = null, vv = cfg.vaoApoios_m;
        for (var i = 0; i + 1 < pts.length; i++) if (vv >= pts[i][0] && vv <= pts[i + 1][0]) { var w = (vv - pts[i][0]) / (pts[i + 1][0] - pts[i][0]); noVao = { kgf: pts[i][1] + w * (pts[i + 1][1] - pts[i][1]), kN: pts[i][2] + w * (pts[i + 1][2] - pts[i][2]) }; }
        ref = { produto: [alt.fabricante, alt.linha].filter(Boolean).join(" "), pagina: tb.pagina, url: tb.url, titulo: tb.titulo, hipoteses: tb.hipoteses, pontos: pts, noVao: noVao };
      }
    }
    if (ref && ref.pontos && ref.pontos.length) {          // capacidade da referência no vão de CADA zona (abaixo do menor vão tabelado: o valor dele, a favor)
      zonas.forEach(function (z) {
        var P = ref.pontos, v = z.vao_m, c = null, i;
        if (v <= P[0][0]) { c = P[0][2]; z.foraTabela = v < P[0][0]; }
        else for (i = 0; i + 1 < P.length; i++) if (v >= P[i][0] && v <= P[i + 1][0]) { c = P[i][2] + (v - P[i][0]) / (P[i + 1][0] - P[i][0]) * (P[i + 1][2] - P[i][2]); }
        z.capReferencia_kN_m2 = c; z.atendeReferencia = c != null && z.total <= c;
      });
    }
    /* ESPECIFICAÇÃO DE DESEMPENHO (decisão do Rogério 13/10/2026: "não ficar preso na carta; se mudar de fornecedor, mudou — o
     * memorial diz a capacidade por m² que o painel tem de garantir"). O cálculo fixa, por zona, a carga de serviço mínima no vão
     * do projeto; o painel fornecido (Eternit, Decorlit ou outro) tem de declará-la. Impede só se nem a referência publicada atende
     * (aí a geometria do piso é que tem de mudar). */
    var desempenho = cfg.criterio === "desempenho";
    var requisitos = zonas.map(function (z) {
      return { zona: z.zona, vao_m: z.vao_m, vaoLivre_m: z.vaoLivre_m, cargaServicoMin_kN_m2: Math.ceil(z.total * 100 - 1e-9) / 100,
        cargaServicoMin_kgf_m2: Math.ceil(z.total / 0.00980665 - 1e-9), referencia_kN_m2: z.capReferencia_kN_m2, referenciaAtende: !!z.atendeReferencia };
    });
    var semRef = desempenho && requisitos.filter(function (q) { return !q.referenciaAtende; });
    var concl = desempenho
      ? (semRef.length ? "Nem o produto de referência atende em " + semRef.map(function (q) { return q.zona; }).join(", ") + ": aproximar os barrotes nessa zona. " : "") +
        "Especificação de desempenho: o painel de piso de 40 mm (Painel Wall da Eternit, da Decorlit ou equivalente) deve ter carga distribuída ADMISSÍVEL (de serviço), declarada pelo fabricante, de no mínimo " +
        requisitos.map(function (q) { return br(q.cargaServicoMin_kN_m2, 2) + " kN/m² (" + q.cargaServicoMin_kgf_m2 + " kgf/m²) com apoios a " + br(q.vao_m, 2) + " m na zona " + q.zona; }).join("; ") +
        ". Referência que atende: " + (ref ? ref.produto : "tabela publicada") + " (" + requisitos.map(function (q) { return q.zona + " " + br(q.referencia_kN_m2, 2) + " kN/m²"; }).join("; ") + "). A troca de fabricante é livre desde que a capacidade declarada atenda."
      : conclusaoPainel(zonas, cfg, ref);
    return { produto: [p.fabricante, p.linha].filter(Boolean).join(" "), produtoId: p.id, pagina: dt.pagina, link: p.link,
      criterio: desempenho ? "desempenho" : "ficha", requisitos: requisitos,
      ficha: { carga_kgf_m2: dt.carga_distribuida_kgf_m2_40mm, carga_kN_m2: cap, apoios: dt.apoios_minimos_por_painel, vaoMax_m: dt.vao_maximo_entre_apoios_piso_mm_40mm / 1000,
        concentrada_kgf: dt.carga_concentrada_vertical_kgf_40mm, hipoteses: dt.carga_distribuida_hipoteses },
      fabricanteConfirmado: !!(p.item_orcamento_nibra && p.item_orcamento_nibra.fabricante_do_item_confirmado), obsFabricante: p.item_orcamento_nibra && p.item_orcamento_nibra.obs,
      vaoApoios_m: cfg.vaoApoios_m, fonteVao: cfg.fonteVao, premissaR03: cfg.premissaR03, zonas: zonas, referencia: ref,
      impedeUso: desempenho ? semRef.length > 0 : zonas.some(function (z) { return z.acimaFicha; }),
      conclusao: concl };
  };

  function especieDoGrupo(g, tab) {
    for (var i = 0; i < tab.length; i++) if (tab[i][0].test(g)) return tab[i][1];
    return null;
  }

  /** combinações ELU (NBR 8681:2003, edificação tipo 2: γ 1,4; ψ0 Q 0,7, vento 0,6) — kmod1 pela variável principal */
  MadDimensionar.combinacoes = function (hips) {
    var G = { PP: 1.4, CP: 1.4 }, out = [];
    function c(nome, f, car) { var x = {}; Object.keys(f).forEach(function (k) { if (hips.indexOf(k) >= 0) x[k] = f[k]; }); out.push({ nome: nome, fatores: x, carregamento: car }); }
    function mais(a, b) { var x = {}; [a, b].forEach(function (o) { Object.keys(o).forEach(function (k) { x[k] = o[k]; }); }); return x; }
    c("1,4G + 1,4Q", mais(G, { SCpiso: 1.4, SCcob: 1.4 }), "longa");
    ["V1", "V2", "V3", "V4"].forEach(function (v) {
      var fv = {}; fv[v] = 1.4;
      c("1,4G + 1,4" + v + " + 0,98Q", mais(mais(G, fv), { SCpiso: 0.98, SCcob: 0.98 }), "curta");
      var fv2 = {}; fv2[v] = 0.84;
      c("1,4G + 1,4Q + 0,84" + v, mais(mais(G, { SCpiso: 1.4, SCcob: 1.4 }), fv2), "longa");
      var fv3 = {}; fv3[v] = 1.4;
      c("1,0G + 1,4" + v, mais({ PP: 1.0, CP: 1.0 }, fv3), "curta");
    });
    return out;
  };

  /**
   * e = { fonte, sobreposicao, calcPiso, cargasCype, ventoParedes, entradasPiso?, especies?, classes?, perfil?, obra?,
   *       catalogoMadeira?, grupos? (QUIOSQUE), analise? }
   */
  MadDimensionar.calcular = function (e) {
    var t0 = Date.now(), Q = e.grupos || MadDimensionar.QUIOSQUE;
    var classes = e.classes || { tatajuba: "nativa:D40", itauba: "nativa:D40", pinus_cca: "peca:C20" };
    var perfBase = e.perfil || { umidade: 3, limVao: 350, limBalanco: 175, psi2: 0.4 };
    var pend = [], avisos = [], naoAbr = [], premissas = [];

    /* 1. espécies */
    var esp = ME.aplicar(e.fonte.pecas, e.especies || ME.QUIOSQUE);
    esp.conferir.forEach(function (c) { pend.push("Confirmar com o cliente (" + c.n + " peças): " + c.nota); });
    Object.keys(classes).forEach(function (k) {
      var es = MM.especie(k), cl = MM.classe2022(classes[k]);
      premissas.push({ item: "Classe de resistência — " + es.nome, valor: cl.nome, fonte: cl.fonte, confianca: "premissa conservadora do RT" });
    });

    /* 2. piso seco (verificação local) */
    var piso = e.entradasPiso ? MP.calcular(e.entradasPiso, { reacaoPorNo: true }) : null;
    if (!piso) naoAbr.push("Piso seco: entradas do MadPiso não informadas.");

    /* 3. modelo analítico */
    var G = MO.gerar(e.fonte, { sobreposicao: e.sobreposicao, calcPiso: e.calcPiso, cargasCype: e.cargasCype, ventoParedes: e.ventoParedes, rotulaVertical: "baixo" });
    var mod = JSON.parse(JSON.stringify(G.modelo)), gama = {};
    /* troca de seção/espécie por grupo do modelo (estudo de alternativa ou decisão do RT): { GRUPO: { b_cm, h_cm, especie } } */
    var troca = e.trocaSecao || (e.semDecisoesRT ? {} : (Q.decisoesRT || {}));
    /* espécie de cada grupo do modelo = a das SUAS peças na fonte depois das regras de espécie (maioria por volume). A tabela por nome
     * (Q.grupoEspecie) fica só para grupo sem peça conhecida. Até 13/10 valia só a tabela: na R04 o forro já veio 10×15 Tatajuba na
     * fonte, o nome virou FORRO_10x15 e a tabela ("^FORRO_" → pinus) verificava o forro como Pinus. */
    var paraId = {}; esp.pecas.forEach(function (p) { paraId[p.id] = p.para; });
    var volId = {}; e.fonte.pecas.forEach(function (p) { volId[p.id] = p.volume_m3 || 0; });
    var espFonte = {};
    Object.keys(G.idsPorEtiqueta || {}).forEach(function (g) {
      var v = {}; G.idsPorEtiqueta[g].forEach(function (id) { var k = paraId[id]; if (k) v[k] = (v[k] || 0) + (volId[id] || 1e-6); });
      var ks = Object.keys(v).sort(function (a, b) { return v[b] - v[a]; }); if (ks.length) espFonte[g] = ks[0];
    });
    var espDecisao = {};
    Object.keys(troca).forEach(function (g) {
      var s0 = mod.secoes[g], t = troca[g];
      if (!s0) {
        if (e.trocaSecao) throw new Error("trocaSecao: grupo " + g + " não existe no modelo");
        return;                                          // decisão padrão do RT já incorporada à fonte (ex.: R04 com o forro 10×15)
      }
      if (t.b_cm) s0.b_cm = t.b_cm; if (t.h_cm) s0.h_cm = t.h_cm; s0.perfil = s0.b_cm + "x" + s0.h_cm;
      if (t.especie) espDecisao[g] = t.especie;
      if (t.especie) { (Q = JSON.parse(JSON.stringify(Q, function (k, v) { return v instanceof RegExp ? { __re: v.source } : v; }), function (k, v) { return v && v.__re ? new RegExp(v.__re) : v; })).grupoEspecie.unshift([new RegExp("^" + g + "$"), t.especie]); }
      premissas.push({ item: "Seção alterada pelo RT — " + g, valor: s0.b_cm + "×" + s0.h_cm + (t.especie ? " " + t.especie : ""), fonte: t.motivo || "decisão de projeto", confianca: "decisão do RT" });
    });
    Object.keys(mod.secoes).forEach(function (g) {
      var s = mod.secoes[g], k = espDecisao[g] || espFonte[g] || especieDoGrupo(g, Q.grupoEspecie);
      if (!k || s.E_MPa) return;                           // ligações e apoios (aço genérico) mantêm o E próprio
      var es = MM.especie(k), cl = MM.classe2022(classes[k]);
      s.especie = es.nome; s.especieId = k; s.classe = classes[k];
      s.material = es.nome + " — " + cl.nome;
      s.E_MPa = cl.Ec0m;                                    // análise com E0,med (NBR 7190-1:2022; fluência só na flecha)
      gama[s.material] = es.gamaCarga;
    });
    premissas.push({ item: "Rigidez na análise global", valor: "E0,med da classe adotada (nativa D40: 14 500 MPa; C20: 9 500 MPa)", fonte: "NBR 7190-1:2022", confianca: "premissa do RT" });

    /* 4. análise global */
    var opA = e.analise || { placa: "casca", cortante: true };
    var M = MA.montar(mod, { placas: G.placas }, { placa: opA.placa || "casca", cortante: opA.cortante !== false, gama: gama });
    var C = MA.cargas(M, { hipoteses: G.hipoteses, ops: G.ops }, { cargaNodal: "consistente" });
    var R = MA.resolver(M, C);
    var ES = MA.esforcos(M, C, R, { estacoes: 5 });

    /* 5. combinações */
    var combs = MadDimensionar.combinacoes(R.hips);
    var EC = MA.combinar(ES, combs.map(function (c) { return { nome: c.nome, fatores: c.fatores }; }));

    /* 6. estabilidade global */
    var beta = {}, alphaCr = null, betaDet = {}, estab = null;
    if (typeof MA.estabilidade === "function") {
      try {
        /* Kg só dos pilares (P-Δ global do pórtico): com Kg de todas as barras o modelo gerado mostra um mecanismo LOCAL
         * falso (barrotes 16×20 da ducha sem o diafragma do Painel Wall). β de projeto = máx(1,0; β do autovalor) — o β do
         * autovalor abaixo de 1 é equivalente global, não comprimento de flambagem do pilar isolado.
         * ⚠ betaPorPilar[k] é um OBJETO { N, L, I, E, L0, beta } e a chave é o NOME do pilar (P1…), não o membro: até 12/10 o
         *   Math.max(1, objeto) dava NaN e o β do autovalor nunca chegava à verificação (caía sempre em 1,0). */
        var st = MA.estabilidade(M, C, R, { grupos: ["PILAR"] });
        alphaCr = st.alphaCrMin;
        estab = { alphaCrMin: st.alphaCrMin, combinacaoCritica: st.combinacaoCritica, alphaRefPilares: st.alphaRefPilares, grupos: ["PILAR"] };
        Object.keys(st.betaPorPilar || {}).forEach(function (k) {
          var bp = st.betaPorPilar[k], bv = bp && isFinite(bp.beta) ? bp.beta : null;
          beta[k] = bv == null ? 1.0 : Math.max(1.0, bv);
          betaDet[k] = { N: bp ? bp.N : null, L: bp ? bp.L : null, L0: bp ? bp.L0 : null, betaAutovalor: bv, betaProjeto: beta[k] };
        });
        premissas.push({ item: "Estabilidade global", valor: "α_cr = " + alphaCr.toFixed(1).replace(".", ",") + (alphaCr >= 10 ? " ≥ 10 → estrutura indeslocável (efeitos de 2ª ordem globais desprezíveis)" : " < 10 → considerar 2ª ordem"),
          fonte: "autovalor (K + α·Kg)φ = 0, Kg dos pilares, combinações ELU com vento", confianca: "cálculo do sistema" });
        premissas.push({ item: "Comprimento de flambagem dos pilares", valor: "L0 = máx(1,0; β do autovalor)·L, L = altura total do pilar (pé ao topo)", fonte: "decisão de projeto (RT)", confianca: "a favor da segurança" });
        if (alphaCr < 10) avisos.push("α_cr = " + alphaCr.toFixed(1) + " < 10: estrutura deslocável — verificar 2ª ordem global.");
        /* mecanismo local (barrote só apoiado em VPs girando em torno do próprio eixo): o gerador põe GARFO nesses barrotes (13/10/2026).
         * Prova opcional (≈ 30 s a mais): autovalor com a Kg de TODAS as barras — R03: sem garfo α_cr = 0 (mecanismo), com garfo 16,9. */
        var nGarfo = 0; (mod.barras || []).forEach(function (b) { if (/^GARFO_/.test(b.grupo)) nGarfo++; });
        var stT = null;
        if (opA.estabilidadeCompleta) { try { stT = MA.estabilidade(M, C, R, {}); estab.alphaCrTodas = stT.alphaCrMin; estab.combinacaoCriticaTodas = stT.combinacaoCritica; } catch (er2) { stT = null; } }
        if (stT && !(stT.alphaCrMin >= 1)) pend.push("Mecanismo local no modelo analítico: com a Kg de todas as barras α_cr = " + br(stT.alphaCrMin, 2) + " — conferir as ligações dos barrotes (garfos: " + nGarfo + ").");
        else premissas.push({ item: "Torção dos barrotes apoiados só em VPs", valor: (nGarfo ? nGarfo + " ligações com GARFO no barrote (giro de flexão livre, torção presa pelo Painel Wall parafusado e pelos bloqueadores)" : "nenhum barrote só apoiado em VPs") +
          (stT ? "; autovalor com a Kg de todas as barras: α_cr = " + br(stT.alphaCrMin, 1) + " (sem mecanismo local)" : ""), fonte: "decisão do RT (13/10/2026); regra 2 do gerador", confianca: stT ? "cálculo do sistema" : "decisão de modelagem" });
      } catch (er) { pend.push("Estabilidade global não calculada: " + er.message); }
    } else pend.push("Estabilidade global (β dos pilares por autovalor) ainda não disponível no motor — pilares verificados com β = 1,0 (na V18 o estudo deu β 1,2): reverificar.");

    /* 7. verificação por função, membro a membro (pior estação × combinação) */
    var porMembro = {};
    mod.barras.forEach(function (b) {
      if (!Q.verificar.test(b.grupo)) return;
      (porMembro[b.membro] = porMembro[b.membro] || []).push(b);
    });
    var verifs = [];
    Object.keys(porMembro).forEach(function (mid) {
      var segs = porMembro[mid].sort(function (a, b) { return a.seg - b.seg; });
      var g = segs[0].grupo, s = mod.secoes[g];
      var Ls = segs.map(function (b) { return ES.porId[b.id].L; }), Ltot = Ls.reduce(function (a, x) { return a + x; }, 0);
      var Lmax = Math.max.apply(null, Ls), ehPilar = Q.pilar.test(g);
      var nomeP = ehPilar ? (/\b(P\d+)\b/.exec(String(segs[0].desc || "")) || [])[1] : null;
      var be = ehPilar ? (beta[nomeP] || beta[segs[0].id] || beta[mid] || 1.0) : 1.0;
      var pior = null;
      combs.forEach(function (cb) {
        var perfil = MM.perfil2022({ carregamento: cb.carregamento, umidade: perfBase.umidade, limVao: perfBase.limVao, limBalanco: perfBase.limBalanco, psi2: perfBase.psi2 });
        segs.forEach(function (b) {
          var cs = EC.porId[b.id].casos[cb.nome];
          cs.est.forEach(function (q) {
            var r = MD.barra2022({ N: q.N, My: q.My, Mz: q.Mz, Vy: q.Vy, Vz: q.Vz, T: q.T, b: s.b_cm / 100, h: s.h_cm / 100,
              L0y: ehPilar ? be * Ltot : Ltot, L0z: ehPilar ? be * Ltot : Lmax, L1: Lmax, classe: s.classe, perfil: perfil });
            if (!pior || r.eta > pior.r.eta) pior = { r: r, comb: cb.nome, barra: b.id, x: q.x, esf: q };
          });
        });
      });
      verifs.push({ membro: mid, grupo: g, funcao: (Q.funcoes || {})[g] || g, pilar: nomeP, desc: segs[0].desc, especie: s.especie, classe: s.classe, secao: s.b_cm + "×" + s.h_cm,
        L: Ltot, beta: ehPilar ? be : null, L0: ehPilar ? be * Ltot : null, eta: pior.r.eta, ok: pior.r.ok, governa: pior.r.governa, combinacao: pior.comb,
        esforcos: { N: pior.esf.N, My: pior.esf.My, Mz: pior.esf.Mz, Vy: pior.esf.Vy, Vz: pior.esf.Vz, T: pior.esf.T },
        verif: pior.r.verif, norma: "NBR 7190-1:2022" });
    });
    verifs.sort(function (a, b) { return b.eta - a.eta; });
    naoAbr.push("Flecha das vigas das coberturas que apoiam o vidro: conferir com a flecha admissível do apoio informada pelo vidraceiro (NBR 7199:2025).");
    naoAbr.push("Ligações a partir dos esforços desta análise global: nesta versão valem os esforços do cálculo emitido PROJ-EST R03 (calc_ligacoes), com as resistências refeitas.");
    /* vidro da cobertura: dimensionado e fornecido pelo vidraceiro (NBR 7199:2025) com as ações desta estrutura — mesma lógica de
     * desempenho do painel do piso (decisão do Rogério 13/10/2026) */
    var qv = e.ventoParedes && isFinite(e.ventoParedes.q_kPa) ? Number(e.ventoParedes.q_kPa) : null;
    premissas.push({ item: "Vidro laminado da cobertura — fornecimento", valor: "Espessura, composição, calços, vedação e fixação dimensionados e garantidos pelo fabricante/vidraceiro conforme a ABNT NBR 7199:2025, para as ações desta estrutura: peso próprio, sobrecarga de cobertura de 0,50 kN/m² (NBR 6120:2019, 6.4)" +
      (qv != null ? " e vento com pressão dinâmica q = " + br(qv, 2) + " kN/m² (NBR 6123:2023; coeficientes de pressão da cobertura pela mesma norma)" : " e vento da NBR 6123:2023") + ". As vigas da cobertura que apoiam o vidro são verificadas neste memorial; o vidraceiro informa a flecha admissível do apoio.",
      fonte: "decisão do RT (13/10/2026)", confianca: "especificação de fornecimento" });
    naoAbr.push("Vibração do piso (NBR 7190-1:2022).");

    /* 8. reações para a fundação (característicos, por pilarete) */
    var reac = R.reacoes.map(function (rp) {
      var o = { pilarete: rp.id }, cs = rp.casos;
      o.G = { N: (cs.PP ? cs.PP.N : 0) + (cs.CP ? cs.CP.N : 0) };
      o.Q = { N: (cs.SCpiso ? cs.SCpiso.N : 0) + (cs.SCcob ? cs.SCcob.N : 0) };
      ["V1", "V2", "V3", "V4"].forEach(function (v) { if (cs[v]) o[v] = { N: cs[v].N, Vx: cs[v].Vx, Vy: cs[v].Vy }; });
      return o;
    });

    /* 9. compra */
    var compra = null;
    if (MER && e.catalogoMadeira) {
      var porId = {}; esp.pecas.forEach(function (p) { porId[p.id] = p.para; });
      var pecasC = e.fonte.pecas.filter(function (p) { return p.secao_cm && porId[p.id]; }).map(function (p) {
        var tr = null;
        Object.keys(troca).forEach(function (g) { if (troca[g].grupoFonte === p.grupo) tr = troca[g]; });
        return { id: p.id, grupo: p.grupo, especie: tr && tr.especie ? tr.especie : porId[p.id], b_cm: tr ? tr.b_cm : p.secao_cm[0], h_cm: tr ? tr.h_cm : p.secao_cm[1], comprimento_m: p.comprimento_m };
      });
      /* espécie sem NENHUMA bitola no catálogo (folhosa nativa) = madeireira, serrada sob medida → cotação por m³ (decisão do RT 13/10/2026:
       * Tatajuba e Itaúba não têm bitola comercial em catálogo de ninguém; a madeireira serra na medida e cobra por m³) */
      var sobMedida = e.sobMedida;
      if (!sobMedida) {
        sobMedida = [];
        pecasC.forEach(function (p) {
          if (sobMedida.some(function (s) { return s.especie === p.especie; })) return;
          if (e.catalogoMadeira.some(function (c) { return c.especie === p.especie; })) return;
          var es = MM.ESPECIES && MM.ESPECIES[p.especie];
          sobMedida.push({ especie: p.especie, nome: es ? es.nome : p.especie, fornecedor: "Madeireira (serrada sob medida)", obs: "cotar por m³ com a lista de corte; madeira seca ao ar, classe de resistência do memorial, sem medula nem nó na região de ligação" });
        });
      }
      compra = MER.listaDeCompra(pecasC, e.catalogoMadeira, { sobMedida: sobMedida, comporGrupo: /BLOQ/ });
      if (e.catalogoMadeiraFonte) compra.catalogoFonte = e.catalogoMadeiraFonte;
      compra.pendencias.forEach(function (x) { pend.push("Compra: " + x); });
      (compra.cotacao || []).forEach(function (c) { avisos.push("Cotação: " + br(c.volume_m3, 2) + " m³ de " + c.nomeEspecie + " em " + c.fornecedor + " (" + c.secoes.length + " seções; maior peça " + br(c.maiorPeca_m, 2) + " m)."); });
      compra.grupos.filter(function (gr) { return gr.origem; }).forEach(function (gr) { avisos.push("Compra: " + gr.secao + " de " + gr.especie + " — " + gr.origem.texto + "."); });
    }

    /* 10. paredes de contraventamento (MadWoodFrame, chapa da premissa: Evoply 12 do orçamento) */
    var paredes = null, premParedes = null;
    if (WF && e.paineis) {
      premParedes = e.premissasParedes || WF.EVOPLY_12;
      paredes = WF.calcular(e.paineis, premParedes, e.planos || []);
      delete paredes.bruto;
      if (premParedes.catalogo) {
        premissas.push({ item: "Chapa de contraventamento das paredes", valor: premParedes.catalogo.produto + " (" + br(premParedes.catalogo.largura_m, 2) + " × " + br(premParedes.catalogo.altura_m, 2) + " m, " + premParedes.catalogo.massa_kg + " kg), montantes ≤ " + premParedes.catalogo.montantesMaxCm + " cm", fonte: premParedes.catalogo.fonte + (premParedes.catalogo.decisaoRT ? "; " + premParedes.catalogo.decisaoRT : ""), confianca: premParedes.catalogo.decisaoRT ? "decisão do RT" : "premissa pelo orçamento recebido — confirmar" });
        premissas.push({ item: "G e ρk da chapa", valor: "G = " + premParedes.gChapa + " MPa; ρk = " + premParedes.rhoKChapa + " kg/m³", fonte: premParedes.fonte, confianca: "premissa do RT (catálogo não informa)" });
        if (!premParedes.catalogo.decisaoRT) pend.push("Confirmar o " + premParedes.catalogo.produto + " como chapa de contraventamento das paredes (no lugar do OSB do modelo R03).");
      }
      naoAbr.push("Solicitação de cálculo de cada painel de parede e dos hold-downs a partir da análise com casca (o memorial traz a resistência e a rigidez dos painéis, sem η).");
    }

    /* 11. ligações (cálculo emitido, passos refeitos) */
    var ligs = [];
    if (e.calcLigacoes) {
      var binarios = ((piso && piso.pecas) || []).filter(function (p) { return p.binarioPilar; }).map(function (p) { var b = p.binarioPilar; return { marca: p.marca, pilar: b.pilar, balanco_m: b.balanco_m, R_G_kN: b.R_G_kN, R_Q_kN: b.R_Q_kN }; });
      var LG = MadDimensionar.ligacoesEmitidas(e.calcLigacoes, e.ligacoesFonte, { binarios: binarios });
      ligs = LG.lista;
      LG.difs.forEach(function (x) { avisos.push("Ligação — resistência refeita difere do emitido: " + x); });
      if (LG.premissas) premissas.push({ item: "Ligações — coeficientes", valor: "γlig = " + br(LG.premissas.gama_lig, 1) + "; kmod1 " + br(LG.premissas.kmod1_longa, 1) + " (longa) / " + br(LG.premissas.kmod1_curta, 1) + " (curta); kmod2 " + br(LG.premissas.kmod2, 1) + "; ρk " + LG.premissas.rho_k.Tatajuba + " kg/m³ (folhosa) e " + LG.premissas.rho_k.Pinus + " kg/m³ (Pinus); fub " + LG.premissas.fub + " MPa (inox A4-70)", fonte: ML.PAR.fonte, confianca: "premissa do RT (cálculo emitido R03)" });
      ligs.filter(function (l) { return l.eta == null; }).forEach(function (l) { naoAbr.push("Ligação " + l.codigo + " (" + l.tipo + "): especificada, sem verificação de resistência."); });
    }

    /* 12. Painel Wall do piso × ficha do fabricante */
    var painel = MadDimensionar.painelPiso(e.painelPiso, piso, e.catalogo), impedimentos = [];
    /* o impedimento aparece UMA vez (na lista de impedimentos); até 13/10 repetia como 1ª pendência e a tela contava duas vezes */
    if (painel && painel.impedeUso) impedimentos.push("Painel Wall 40 mm do piso: " + painel.conclusao);
    else if (painel && painel.criterio === "desempenho") premissas.push({ item: "Painel do piso (40 mm) — especificação de desempenho", valor: painel.conclusao, fonte: "cálculo do sistema (G + Q característico por zona, NBR 6120:2019) e tabela publicada do produto de referência", confianca: "decisão do RT (13/10/2026)" });

    /* 13. premissas do piso, pendências da obra */
    if (piso && MP.PADRAO) {
      try { var pf = MM.perfil(MP.PADRAO.perfil); premissas.push({ item: "Perfil de cálculo do piso", valor: pf.nome + " — kmod " + br(pf.kmod, 3) + ", γ " + br(pf.gamaG, 1) + ", ψ2 " + br(pf.psi2, 1) + ", φ " + br(pf.phi, 1) + ", L/" + pf.limVao + " e L/" + pf.limBalanco, fonte: pf.fonte, confianca: "regressão do emitido R03" }); } catch (er) {}
      piso.classe = piso.classe || MP.PADRAO.classe; piso.perfil = piso.perfil || MP.PADRAO.perfil;
      (piso.avisos || []).forEach(function (a) { pend.push("Piso: " + a + " — só a faixa de carga foi calculada (sem verificação)."); });
      (piso.informacoes || []).forEach(function (a) { avisos.push("Piso: " + a + "."); });
    }
    var esPinus = MM.ESPECIES && MM.ESPECIES.pinus_cca;
    if (esPinus && esPinus.duvida) pend.push(esPinus.duvida + ".");
    /* conferência dos valores da 7190-1:2022 com o texto da norma: registro INTERNO (não é pendência do memorial — Rogério 13/10/2026) */
    var interno = ["Conferir com o texto da NBR 7190-1:2022 (convênio Confea) os valores usados de fonte técnica secundária: classes D/C, kmod1/kmod2, γw, kc (βc), kM, βM, φ e flecha final."];
    (e.pendenciasObra || []).forEach(function (x) { pend.push(x); });

    /* 14. combinações para o memorial (kmod de cada uma pelo perfil 2022 da obra) */
    var combMem = [];
    if (piso && MP.PADRAO) { try { var pp = MM.perfil(MP.PADRAO.perfil); combMem.push({ tipo: "ELU", expressao: br(pp.gamaG, 1) + "G + " + br(pp.gamaQ, 1) + "Q", kmod: pp.kmod, kmodTxt: pp.kmodPartes.replace(/\./g, ","), uso: "piso seco (perfil " + MP.PADRAO.perfil + ", verificação local)" }); } catch (er) {} }
    combs.forEach(function (cb) {
      var pf2 = MM.perfil2022({ carregamento: cb.carregamento, umidade: perfBase.umidade, limVao: perfBase.limVao, limBalanco: perfBase.limBalanco, psi2: perfBase.psi2 });
      combMem.push({ tipo: "ELU", expressao: cb.nome, kmod: pf2.kmod, kmodTxt: pf2.kmodPartes, uso: "análise global e verificação das barras" + (cb.carregamento === "curta" ? " (vento principal)" : ""), fatores: cb.fatores });
    });
    combMem.push({ tipo: "ELS", expressao: "G + " + br(perfBase.psi2, 1) + "·Q (quase permanente), flecha final com fluência", kmod: null, uso: "flecha do piso seco" });

    /* 15. reações: posição (eixos do modelo) e parcela do piso pela descida local, para comparação */
    var posP = {};
    if (piso) piso.reacoesPilaretes.pilaretes.forEach(function (p) { posP[p.id] = p; });
    reac.forEach(function (o) {
      var p = posP[o.pilarete]; if (!p) return;
      o.x = p.xt; o.y = p.yt; o.Gpiso = p.casos_kN.G.piso; o.Qpiso = p.casos_kN.Q.piso;
    });
    var cm = MP.QUIOSQUE && MP.QUIOSQUE.cypeParaMadeira;
    var convencao = "Reações características por hipótese da análise global (barras + casca das paredes): N > 0 = compressão no pilarete; Vx, Vy = forças horizontais nos eixos do MODELO de madeira (x ao longo do quiosque, y transversal)" +
      (cm ? "; eixos da fundação (concepção): x_f = y + " + br(-cm.yt0, 3) + " m, y_f = " + br(cm.xt0, 3) + " − x m" : "") + ". G = peso próprio + permanentes; Q = sobrecarga do piso + da cobertura; V1 a V4 = vento. M no topo do pilarete = 0 (sela inox sobre graute: articulação). As combinações da fundação ficam a cargo do projetista da fundação.";

    /* peças com as decisões do RT aplicadas (vale para pranchas, manual, compra e conferências do memorial) */
    var pecasOut = e.fonte.pecas.map(function (p) {
        var tr = null;
        Object.keys(troca).forEach(function (g) { if (troca[g].grupoFonte && troca[g].grupoFonte === p.grupo) tr = troca[g]; });
        if (tr && p.secao_cm) {                          // decisão do RT vale em TODAS as saídas (pranchas, manual, compra)
          var sec = [tr.b_cm || p.secao_cm[0], tr.h_cm || p.secao_cm[1]];
          return { id: p.id, grupo: p.grupo, nome: p.nome, marca: p.marca || null, secao_cm: sec, secaoFonte_cm: p.secao_cm,
            volume_m3: (p.comprimento_m || 0) * sec[0] * sec[1] / 1e4, comprimento_m: p.comprimento_m, p0: p.p0, p1: p.p1,
            dir_largura: p.dir_largura, extensoes_m: p.extensoes_m ? [p.extensoes_m[0], sec[1] / 100, sec[0] / 100] : null,
            etapa_montagem: p.etapa_montagem || null, especie: tr.especie || null, ifc: p.ifc || null, decisaoRT: tr.motivo };
        }
        return { id: p.id, grupo: p.grupo, nome: p.nome, marca: p.marca || null, secao_cm: p.secao_cm, volume_m3: p.volume_m3, comprimento_m: p.comprimento_m,
          p0: p.p0, p1: p.p1, dir_largura: p.dir_largura, extensoes_m: p.extensoes_m, etapa_montagem: p.etapa_montagem || null,
          especie: (esp.pecas.filter(function (q) { return q.id === p.id; })[0] || {}).para || null, ifc: p.ifc || null };
      });
    var porEsp = {};
    pecasOut.forEach(function (p) {
      if (!p.secao_cm || !p.especie) return;
      var x = porEsp[p.especie] = porEsp[p.especie] || { n: 0, volume_m3: 0, m: 0 };
      x.n++; x.volume_m3 += p.volume_m3 || 0; x.m += p.comprimento_m || 0;
    });
    esp.porEspecieFonte = esp.porEspecie; esp.porEspecie = porEsp;
    var reprov = verifs.filter(function (v) { return !v.ok; });
    reprov.forEach(function (v) { avisos.push(v.desc + " (" + v.secao + ", " + v.especie + "): η = " + br(v.eta, 2) + " em " + v.governa + " — " + v.combinacao); });
    var diag = [], gruposR = {};
    reprov.forEach(function (v) { (gruposR[v.grupo] = gruposR[v.grupo] || []).push(v); });
    Object.keys(gruposR).forEach(function (g) {
      var d = (Q.diagnostico || {})[g], l = gruposR[g], nomeF = (Q.funcoes || {})[g] || g, emax = Math.max.apply(null, l.map(function (v) { return v.eta; }));
      impedimentos.push(l.length + " membro(s) de " + nomeF + " não atendem (η até " + br(emax, 2) + ").");
      diag.push({ grupo: g, funcao: nomeF, membros: l.map(function (v) { return v.membro; }), etaMax: emax, mecanismo: d ? d.mecanismo : null, alternativas: d ? d.alternativas.slice() : [] });
      pend.unshift("IMPEDE O USO — decisão do RT: " + l.length + " membro(s) de " + nomeF + " não atendem (η até " + br(emax, 2) + ")" + (d ? "; alternativas: " + d.alternativas.map(function (a, i) { return "(" + (i + 1) + ") " + a; }).join(" ") : "") + ".");
    });

    return {
      ok: impedimentos.length === 0, impedimentos: impedimentos, versao: "MadDimensionar 1 (12/10/2026)", ms: Date.now() - t0,
      premissas: premissas, especies: esp, piso: piso,
      analise: { hips: R.hips, somas: R.somas, reacoes: R.reacoes, alphaCr: alphaCr, beta: beta, betaDetalhe: betaDet, estabilidade: estab, opcoes: opA,
        criterioBeta: "L0 = máx(1,0; β do autovalor)·L, L = altura total do pilar (pé ao topo); β do autovalor = π·√(E·I/(α_ref·N))/L, com α_ref do modo em que os pilares levam ≥ 30 % do deslocamento",
        combinacoes: combs.map(function (c) { return { nome: c.nome, carregamento: c.carregamento }; }) },
      modelo: { nos: mod.nos.length, barras: mod.barras.length, placas: G.placas.length, regras: MO.REGRAS, textosCype: G.textosCype,
        modelo: mod, placasLista: G.placas, hipoteses: G.hipoteses, ops: G.ops, balanco: G.balanco, resumo: G.resumo },
      verificacoes: verifs, reprovacoes: diag, reacoesFundacao: reac, reacoesConvencao: convencao, compra: compra,
      ligacoes: ligs, paredes: paredes, paredesPremissas: premParedes, painelWall: painel, combinacoes: combMem,
      acoes: { camadasPiso: e.camadasPiso || null, cargasCype: e.cargasCype || null, ventoParedes: e.ventoParedes || null },
      pecas: pecasOut,
      niveisFonte: (e.fonte.piso_pw && e.fonte.piso_pw.niveis) || null, classes: classes,
      nivel: { deltaPisoCm: 0, mensagem: "Nenhuma seção do piso foi alterada nesta rodada: o nível do piso acabado e o topo dos pilaretes não mudam." },
      pendencias: pend, avisos: avisos, naoAbrangido: naoAbr, conferenciaInterna: interno
    };
  };

  if (typeof module !== "undefined" && module.exports) module.exports = MadDimensionar;
  else global.MadDimensionar = MadDimensionar;
})(typeof window !== "undefined" ? window : this);
