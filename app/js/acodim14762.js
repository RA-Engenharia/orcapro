/* =====================================================================
 * acodim14762.js — DIMENSIONAMENTO DE BARRAS DE PERFIS FORMADOS A FRIO
 * pela ABNT NBR 14762:2010 com o MÉTODO DA RESISTÊNCIA DIRETA (Anexo C)
 * (motor PURO, ES5, sem DOM, Node-testável).
 *
 *   AcoDim14762.verificar(secao, aco, esforcos, comprimentos, opcoes)
 *     secao        js/acosecao.js formadoFrio(tipo, {bw, bf, D, t, ri})
 *                  (tipos U, Ue, Z90, Z45, Cr) ou {tipo, bw, bf, D, t, ri}
 *     aco          {fy, fu, E = 200000, G = 77000} (MPa)
 *     esforcos     {N (kN; + tração, − compressão), Mx, My (kN·m), Vx, Vy (kN)}
 *                  — valores de CÁLCULO já com os efeitos de 2ª ordem
 *                  (a NBR 14762:2010 remete a análise à NBR 8800 —
 *                  SANTOS/UFAL, PFF flexão composta, slide 6)
 *                  Mx > 0 comprime as fibras com y > yc; My > 0 comprime as
 *                  fibras com x > xc (a convenção do js/acofsm.js)
 *     comprimentos {Lx, Ly, Lt (mm) entre contenções; Kx, Ky, Kz (padrão
 *                  1,0); Cb ou momentos {Mmax, MA, MB, MC}; Cm (Anexo E);
 *                  Lfl (mm, comprimento de flambagem na esbeltez, opcional)}
 *     opcoes       {terca: {mesaFixadaNaTelha, succao, Lcorrentes (mm)},
 *                  ligacao: {...} (tração: Ct), An0 (mm²), enrijecedoresAlma:
 *                  {a (mm)}, fsm: {opções do js/acofsm.js}, criticos: {Ne,
 *                  Nl, Ndist (kN), Mex, Mlx, Mdistx, Mey, Mly, Mdisty (kN·m)}
 *                  — valores elásticos dados de fora (ex.: tabela publicada)}
 *     → {ok, aproveitamento (= razao), governante, verificacoes: [{nome, item,
 *        formula, valores, passos [{rotulo, valor}], resistencia, unidade,
 *        solicitante, razao, ok, fonte}], resumo (NcRd, NtRd, MxRd, MyRd, VxRd,
 *        VyRd), criticos (Ne, Nl, Ndist, Me, Ml, Mdist), avisos}
 *     (formato compatível com o do AcoDim8800 em docs/metalica/CONTRATO.md)
 *
 * FONTES (a NBR 14762:2010 não está na biblioteca; cada fórmula foi conferida
 * nas fontes secundárias abaixo — o número do slide/página vai junto):
 *  [MRD]   SANTOS, L. B. PFF – O Método da Resistência Direta: notas de aula.
 *          UFAL/CTEC, 2020 (CC BY-NC-SA). https://educapes.capes.gov.br/bitstream/capes/572687/2/7%20-%20PFF%20-%20M%c3%89TODO%20DA%20RIGIDEZ%20DIRETA%20-%20NOTAS%20DE%20AULA.pdf
 *  [COMP]  SANTOS, L. B. PFF – Barras submetidas à compressão axial. UFAL, 2020.
 *          https://educapes.capes.gov.br/bitstream/capes/572684/2/4%20-%20PFF%20-%20COMPRESS%c3%83O%20AXIAL%20-%20NOTAS%20DE%20AULA.pdf
 *  [FLEX]  SANTOS, L. B. PFF – Barras submetidas à flexão simples. UFAL, 2020.
 *          https://educapes.capes.gov.br/bitstream/capes/572685/2/5%20-%20PFF%20-%20FLEX%c3%83O%20SIMPLES%20-%20NOTAS%20DE%20AULA.pdf
 *  [FCOMP] SANTOS, L. B. PFF – Barras submetidas à flexão composta. UFAL, 2020.
 *          https://educapes.capes.gov.br/bitstream/capes/572686/2/6%20-%20PFF%20-%20FLEX%c3%83O%20COMPOSTA%20-%20NOTAS%20DE%20AULA.pdf
 *  [TRAC]  SANTOS, L. B. PFF – Barras submetidas à tração axial. UFAL, 2020.
 *          https://educapes.capes.gov.br/bitstream/capes/572683/2/3%20-%20PFF%20-%20TRA%c3%87%c3%83O%20AXIAL%20-%20NOTAS%20DE%20AULA.pdf
 *  [JMMS]  SILVA, J. M. M. Terças de aço em perfis formados a frio com alma
 *          enrijecida. Dissertação, EESC/USP, 2018. https://producaocientifica.eesc.usp.br/producao/2018ME_JulianaMariaMazzetiSilva.pdf
 *  [LONG]  Validação de longarina pela NBR 14762 (TCC UTFPR). https://repositorio.utfpr.edu.br/jspui/bitstream/1/30438/1/validacaolongarinanorma14762.pdf
 *  [ABACO] Ábaco de pré-dimensionamento de terças (TCC UTFPR). https://riut.utfpr.edu.br/jspui/bitstream/1/25039/1/abacopredimensionamentotercas.pdf
 *  [JAVA]  JAVARONI, C. E. Perfis de aço formados a frio submetidos à flexão:
 *          análise teórico-experimental. Tese, EESC/USP, 1999. https://teses.usp.br/teses/disponiveis/18/18134/tde-11122017-112750/publico/Tese_Javaroni_CarlosE.pdf
 *  [BASA]  BASAGLIA, C. D. Dissertação, EESC/USP, 2004. https://producaocientifica.eesc.usp.br/producao/2004ME_CilmarDonizetiBasaglia.pdf
 *  [UFU]   Verificação de segurança de galpão (TCC UFU). https://repositorio.ufu.br/bitstream/123456789/21137/3/Verifica%c3%a7%c3%a3oSeguran%c3%a7aGalp%c3%a3o.pdf
 *  [PB18]  TCC UTFPR PB_DAMEC_2018_2_19. https://repositorio.utfpr.edu.br/jspui/bitstream/1/15116/1/PB_DAMEC_2018_2_19.pdf
 *  [DOB]   DOBKOWSKI, L. C. Galpão em PFF pela NBR 14762:2010. TCC UTFPR, 2018. https://riut.utfpr.edu.br/jspui/bitstream/1/15115/1/PB_DAMEC_2018_2_17.pdf
 *  [PIER]  PIERIN, I.; SILVA, V. P.; LA ROVERE, H. L. Forças normais e momentos
 *          fletores críticos de perfis formados a frio. Revista da Estrutura de
 *          Aço, v. 2, n. 1, p. 21-40, 2013. https://www.cbca-acobrasil.org.br/lib/php/download.php?cfg=1&arq=produtos/arq_20210430191244_rea-v.02.n.01.pdf
 *  Conferência cruzada: docs/metalica/gabarito-normas.md, seção 13 (PF-01 a PF-44), montado por outra frente
 *  com as mesmas fontes — os itens e expressões batem com os daqui (o PF-44, fator R da terça sob sucção, está
 *  "pendente" lá também: não é aplicado).
 *
 * SEM FONTE (decisão de engenharia, sinalizada nos avisos):
 *  · cortante paralela às mesas (Vx): a 9.8.3 é escrita para a alma; aqui é
 *    aplicada às mesas como se fossem almas (kv = 5,0);
 *  · Ct de perfil Z ligado pela alma: usa a excentricidade da meia seção;
 *  · comprimentos dos eixos principais do Z na compressão: L1 = Lx, L2 = Ly;
 *  · limites geométricos de validade do Anexo C (se houver): não aplicados.
 * Teste: node tools/test-aco-14762.js
 * ===================================================================== */
(function (global) {
  "use strict";

  var AcoSecao = global.AcoSecao || (typeof require === "function" ? require("./acosecao.js") : null);
  var AcoFSM = global.AcoFSM || (typeof require === "function" ? require("./acofsm.js") : null);
  var PI = Math.PI;
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function r4(v) { return fin(v) ? Math.round(v * 1e4) / 1e4 : v; }

  /* coeficientes de ponderação das resistências
   * tração 1,10 / 1,35 / 1,65 — [TRAC] slide 5; compressão 1,20 — [COMP] slides 3 e 10, [MRD] slide 3;
   * flexão 1,10 — [FLEX] slides 5 e 14-15, [MRD] slide 4; cortante 1,10 — [FLEX] slide 46 */
  var GAMA = { tracEsc: 1.10, tracRupFora: 1.35, tracRupLig: 1.65, comp: 1.20, flex: 1.10, cort: 1.10 };

  var FONTE = {
    chi: "[COMP] slides 10 e 13 (Tabela 8); [MRD] slide 3",
    ne: "[COMP] slides 11-12; [MRD] slide 10",
    mrdN: "[MRD] slide 3",
    mrdM: "[MRD] slide 4; [JMMS] p. 53-54 (eq. 2.10-2.19)",
    me: "[FLEX] slide 16; [MRD] slide 10",
    anexoE: "[FLEX] slides 22-23 (Anexo E)",
    cb: "[FLEX] slides 18-20",
    cort: "[FLEX] slides 45-46; [LONG] p. 32 (PDF); [DOB] p. 43 — número 9.8.3 por sequência (9.8.4 = M+V em [ABACO] p. 28)",
    mv: "[FLEX] slide 47; [JMMS] p. 56-57 (MRd do modo local); [DOB] p. 43 (condição da expressão com enrijecedores)",
    fcomp: "[FCOMP] slides 6-8",
    trac: "[TRAC] slides 5, 7 e 9",
    esbC: "[COMP] slide 3; [UFU] p. 54 (PDF) — item 9.7.4",
    esbT: "[TRAC] slide 12; [UFU] p. 53 (PDF) — item 9.6.3",
    terca: "[JAVA] p. 98 (PDF p. 120): sob ação gravitacional a mesa comprimida fica travada pelo painel",
    succao: "[ABACO] p. 18 (PDF p. 19): terça com telha parafusada sob sucção — verificar o distorcional",
    dispC: "[COMP] slide 58 (Tabela 11)",
    dispF: "[FLEX] slide 36 (tabela de dispensa da flexão)"
  };

  /* ---------------------------------------------- curvas de resistência */
  /* 9.7.2 — χ: λ0 ≤ 1,5 → 0,658^(λ0²); λ0 > 1,5 → 0,877/λ0²  ([COMP] slide 10) */
  function chiCompressao(l0) { return l0 <= 1.5 ? Math.pow(0.658, l0 * l0) : 0.877 / (l0 * l0); }
  /* 9.8.2.2 e Anexo C — λ0 ≤ 0,6 → 1; 0,6 < λ0 < 1,336 → 1,11(1 − 0,278λ0²); λ0 ≥ 1,336 → 1/λ0²  ([FLEX] slide 15; [MRD] slide 4) */
  function chiFLT(l0) { return l0 <= 0.6 ? 1 : (l0 < 1.336 ? 1.11 * (1 - 0.278 * l0 * l0) : 1 / (l0 * l0)); }
  /* Anexo C — local (força ou momento): λl = (R_e/Xl)^0,5; λl ≤ 0,776 → R_e; senão (1 − 0,15/λl^0,8)·R_e/λl^0,8
   * ([MRD] slides 3 e 4) */
  function local(Re, Xl) {
    if (!(Xl > 0)) return { lambda: 0, R: Re };
    var l = Math.sqrt(Re / Xl), p = Math.pow(l, 0.8);
    return { lambda: l, R: l <= 0.776 ? Re : (1 - 0.15 / p) * Re / p };
  }
  /* Anexo C — distorcional da compressão: λd = (A·fy/Ndist)^0,5; λd ≤ 0,561 → A·fy; senão (1 − 0,25/λd^1,2)·A·fy/λd^1,2 ([MRD] slide 3; [COMP] slide 56) */
  function distN(Py, Nd) {
    if (!(Nd > 0) || !isFinite(Nd)) return { lambda: 0, R: Py };
    var l = Math.sqrt(Py / Nd), p = Math.pow(l, 1.2);
    return { lambda: l, R: l <= 0.561 ? Py : (1 - 0.25 / p) * Py / p };
  }
  /* Anexo C / 9.8.2.3 — distorcional da flexão: λd = (W·fy/Mdist)^0,5; λd ≤ 0,673 → W·fy; senão (1 − 0,22/λd)·W·fy/λd ([MRD] slide 4; [FLEX] slide 35) */
  function distM(My, Md) {
    if (!(Md > 0) || !isFinite(Md)) return { lambda: 0, R: My };
    var l = Math.sqrt(My / Md);
    return { lambda: l, R: l <= 0.673 ? My : (1 - 0.22 / l) * My / l };
  }
  /* Cb = 12,5·Mmax/(2,5·Mmax + 3·MA + 4·MB + 3·MC) (valores absolutos; [FLEX] slides 18-20) */
  function cb(m) {
    if (!m) return null;
    var Mm = Math.abs(num(m.Mmax, 0)), A = Math.abs(num(m.MA, 0)), B = Math.abs(num(m.MB, 0)), C = Math.abs(num(m.MC, 0));
    if (!(Mm > 0)) return null;
    return 12.5 * Mm / (2.5 * Mm + 3 * A + 4 * B + 3 * C);
  }

  /* ---------------------------------------------- seção */
  function familia(tipo) {
    tipo = String(tipo || "");
    if (tipo === "U" || tipo === "Ue") return "C";        /* simetria em torno de x (eixo horizontal) */
    if (tipo === "Z90" || tipo === "Z45" || tipo === "Z") return "Z";   /* ponto-simétrica */
    if (tipo === "Cr") return "Cr";                        /* simetria em torno de y (eixo vertical) */
    return null;
  }
  function prepararSecao(s) {
    if (!s) return null;
    if (!(s.A > 0) && s.tipo && AcoSecao) s = AcoSecao.formadoFrio(s.tipo, s);
    if (!s || !(s.A > 0)) return null;
    var o = {}; for (var k in s) if (Object.prototype.hasOwnProperty.call(s, k)) o[k] = s[k];
    if (!fin(o.rx)) o.rx = Math.sqrt(o.Ix / o.A);
    if (!fin(o.ry)) o.ry = Math.sqrt(o.Iy / o.A);
    if (!fin(o.r0)) o.r0 = Math.sqrt(o.rx * o.rx + o.ry * o.ry + num(o.x0, 0) * num(o.x0, 0) + num(o.y0, 0) * num(o.y0, 0));
    if (!fin(o.I1)) { o.I1 = Math.max(o.Ix, o.Iy); o.I2 = Math.min(o.Ix, o.Iy); }
    o.fam = familia(o.tipo);
    return o;
  }

  /* ---------------------------------------------- flambagem global elástica (compressão) — 9.7.2
   * Nex = π²EIx/(KxLx)²; Ney = π²EIy/(KyLy)²; Nez = [π²ECw/(KzLz)² + GJ]/r0² ([COMP] slide 12; [MRD] slide 10)
   * monossimétrica (eixo x de simetria): Ne = min(Ney, Nexz),
   *   Nexz = (Nex + Nez)/{2[1 − (x0/r0)²]}·{1 − √(1 − 4·Nex·Nez·[1 − (x0/r0)²]/(Nex + Nez)²)}
   * eixo y de simetria: Ne = min(Nex, Neyz) (troca x↔y)  — ([COMP] slide 12)
   * dupla simetria ou ponto-simétrica (Z): Ne = min(Nex, Ney, Nez) nos eixos principais
   * assimétrica: menor raiz de r0²(Ne−Nex)(Ne−Ney)(Ne−Nez) − Ne²(Ne−Ney)x0² − Ne²(Ne−Nex)y0² = 0 ([COMP] slide 11) */
  function flexoTorcao(Na, Nz, d0, r0) {
    var a = 1 - (d0 / r0) * (d0 / r0), s = Na + Nz;
    return s / (2 * a) * (1 - Math.sqrt(Math.max(0, 1 - 4 * Na * Nz * a / (s * s))));
  }
  function neGlobal(sec, aco, L) {
    var E = aco.E, G = aco.G, r0 = sec.r0, Lx = L.x, Ly = L.y, Lz = L.z, o = { avisos: [] };
    if (!(Lx > 0 && Ly > 0 && Lz > 0)) {
      o.Ne = Infinity; o.Nez = Infinity; o.item = "9.7.2"; o.caso = "comprimentos não informados";
      o.formula = "sem comprimento de flambagem: Ne = ∞ (global não verificada)";
      o.avisos.push("comprimentos de flambagem (Lx, Ly, Lt) não informados: flambagem global NÃO verificada");
      return o;
    }
    var Nez = (PI * PI * E * sec.Cw / (Lz * Lz) + G * sec.J) / (r0 * r0);
    o.Nez = Nez;
    if (sec.fam === "Z") {
      /* eixos principais: 1 (maior inércia) ~ x, 2 (menor) ~ y */
      var N1 = PI * PI * E * sec.I1 / (Lx * Lx), N2 = PI * PI * E * sec.I2 / (Ly * Ly);
      o.N1 = N1; o.N2 = N2; o.Ne = Math.min(N1, N2, Nez); o.item = "9.7.2.1"; o.caso = "ponto-simétrica (eixos principais)";
      o.formula = "Ne = min(N1, N2, Nez); N1,2 = π²E·I1,2/(K·L)²; Nez = [π²E·Cw/(KzLz)² + G·J]/r0²";
      o.avisos.push("Z: comprimento de flambagem do eixo principal 1 = KxLx e do eixo 2 = KyLy (aproximação, sem fonte específica)");
      return o;
    }
    var Nex = PI * PI * E * sec.Ix / (Lx * Lx), Ney = PI * PI * E * sec.Iy / (Ly * Ly);
    o.Nex = Nex; o.Ney = Ney;
    var x0 = num(sec.x0, 0), y0 = num(sec.y0, 0), tol = 1e-6 * r0;
    if (Math.abs(y0) <= tol && Math.abs(x0) > tol) {
      o.Nexz = flexoTorcao(Nex, Nez, x0, r0); o.Ne = Math.min(Ney, o.Nexz); o.item = "9.7.2.2"; o.caso = "monossimétrica (eixo x de simetria)";
      o.formula = "Ne = min(Ney, Nexz); Nexz = (Nex+Nez)/(2[1−(x0/r0)²])·{1 − √(1 − 4NexNez[1−(x0/r0)²]/(Nex+Nez)²)}";
    } else if (Math.abs(x0) <= tol && Math.abs(y0) > tol) {
      o.Neyz = flexoTorcao(Ney, Nez, y0, r0); o.Ne = Math.min(Nex, o.Neyz); o.item = "9.7.2.2"; o.caso = "monossimétrica (eixo y de simetria)";
      o.formula = "Ne = min(Nex, Neyz); Neyz = (Ney+Nez)/(2[1−(y0/r0)²])·{1 − √(1 − 4NeyNez[1−(y0/r0)²]/(Ney+Nez)²)}";
    } else if (Math.abs(x0) <= tol && Math.abs(y0) <= tol) {
      o.Ne = Math.min(Nex, Ney, Nez); o.item = "9.7.2.1"; o.caso = "dupla simetria";
      o.formula = "Ne = min(Nex, Ney, Nez)";
    } else {
      var f = function (N) { return r0 * r0 * (N - Nex) * (N - Ney) * (N - Nez) - N * N * (N - Ney) * x0 * x0 - N * N * (N - Nex) * y0 * y0; };
      var hi = Math.min(Nex, Ney, Nez), lo = 0;
      for (var it = 0; it < 200; it++) { var m = 0.5 * (lo + hi); if ((f(m) > 0) === (f(lo) > 0)) lo = m; else hi = m; }
      o.Ne = 0.5 * (lo + hi); o.item = "9.7.2.3"; o.caso = "assimétrica (menor raiz da cúbica)";
      o.formula = "r0²(Ne−Nex)(Ne−Ney)(Ne−Nez) − Ne²(Ne−Ney)x0² − Ne²(Ne−Nex)y0² = 0";
    }
    return o;
  }

  /* ---------------------------------------------- momento crítico de FLT — 9.8.2.2 e Anexo E
   * eixo de simetria (Ue/U em x; Cr em y): Me = Cb·r0·√(Ne,perp·Nez)  ([FLEX] slide 16)
   * Z ponto-simétrico com carga no plano da alma: Me = 0,5·Cb·r0·√(Ney·Nez)  ([FLEX] slide 16)
   * eixo perpendicular ao de simetria (Anexo E): Me = Cs·Ne,sim·[j + Cs·√(j² + r0²·Nez/Ne,sim)]/Cm,
   *   j = [∫s³dA + ∫s·r²dA]/(2·I_perp) − s0 (s = coordenada ao longo do eixo de simetria a partir do
   *   centróide; s0 = coordenada do centro de torção); Cs = +1 se o momento comprime o lado do centro de
   *   torção, −1 se o traciona; Cm = 0,6 − 0,4·M1/M2 ([FLEX] slides 22-23). j sai pela linha média
   *   (βx, βy do js/acosecao.js: j = β/2). Ney, Nez com ky = kz = 1,0 ([FLEX] slide 16). */
  function meFLT(sec, aco, eixo, sinal, Lb, Cb, Cm) {
    var E = aco.E, G = aco.G, r0 = sec.r0, o = { Cb: Cb };
    if (!(Lb.x > 0 && Lb.y > 0 && Lb.t > 0)) {
      o.Me = Infinity; o.item = "9.8.2.2"; o.formula = "sem comprimento destravado: Me = ∞ (FLT não verificada)"; o.fonte = FONTE.me;
      o.aviso = "comprimentos destravados (Lx, Ly, Lt) não informados: FLT NÃO verificada";
      return o;
    }
    var Nez = (PI * PI * E * sec.Cw / (Lb.t * Lb.t) + G * sec.J) / (r0 * r0);
    var Nex = PI * PI * E * sec.Ix / (Lb.x * Lb.x), Ney = PI * PI * E * sec.Iy / (Lb.y * Lb.y);
    o.Nez = Nez;
    if (sec.fam === "Z" && eixo === "x") {
      o.Ney = Ney; o.Me = 0.5 * Cb * r0 * Math.sqrt(Ney * Nez); o.item = "9.8.2.2"; o.formula = "Me = 0,5·Cb·r0·√(Ney·Nez)"; o.fonte = FONTE.me;
    } else if ((sec.fam === "C" && eixo === "x") || (sec.fam === "Cr" && eixo === "y")) {
      var Np = eixo === "x" ? Ney : Nex;
      if (eixo === "x") o.Ney = Ney; else o.Nex = Nex;
      o.Me = Cb * r0 * Math.sqrt(Np * Nez); o.item = "9.8.2.2"; o.fonte = FONTE.me;
      o.formula = eixo === "x" ? "Me = Cb·r0·√(Ney·Nez)" : "Me = Cb·r0·√(Nex·Nez) (Cr: eixo y de simetria)";
    } else if ((sec.fam === "C" && eixo === "y") || (sec.fam === "Cr" && eixo === "x")) {
      var simX = sec.fam === "C";
      var Ns = simX ? Nex : Ney, s0 = simX ? num(sec.x0, 0) : num(sec.y0, 0);
      /* a fórmula pressupõe o eixo de simetria ORIENTADO com o centro de torção na coordenada negativa
       * ("compressão na parte com coordenada x negativa, ou seja, do mesmo lado que o centro de torção",
       * [FLEX] slide 22; j = (1/2I)[∫x³dA + ∫xy²dA] + |x0|). No desenho do js/acosecao.js o Ue já está
       * assim (x0 < 0) e j = βy/2; na cartola o centro de torção fica acima (y0 > 0): inverte-se o eixo,
       * j = −βx/2. Conferido: j do Ue = fórmula fechada βw, βf, βl do slide 23 (tools/test-aco-14762.js). */
      var j = (simX ? sec.betaY : sec.betaX) / 2;
      if (s0 > 0) j = -j;
      /* lado comprimido: sinal do momento (convenção do js/acofsm.js) */
      var Cs = (sinal > 0) === (s0 > 0) ? 1 : -1;
      Cm = fin(Cm) && Cm > 0 ? Cm : 1;
      o.j = j; o.Cs = Cs; o.Cm = Cm; if (simX) o.Nex = Nex; else o.Ney = Ney;
      o.Me = Cs * Ns * (j + Cs * Math.sqrt(j * j + r0 * r0 * Nez / Ns)) / Cm;
      o.item = "Anexo E"; o.fonte = FONTE.anexoE;
      o.formula = "Me = Cs·" + (simX ? "Nex" : "Ney") + "·[j + Cs·√(j² + r0²·Nez/" + (simX ? "Nex" : "Ney") + ")]/Cm";
    } else {
      o.Me = Infinity; o.item = "—"; o.formula = "sem FLT (flexão em torno do eixo de menor rigidez do Z)"; o.fonte = "";
      o.aviso = "Z com My: a NBR (fontes consultadas) não dá Me; flexão em torno do eixo próximo ao de menor inércia — FLT não verificada";
    }
    return o;
  }

  /* ---------------------------------------------- forças/momentos críticos pelo js/acofsm.js */
  var CACHE = {}, nCache = 0;
  function criticosFSM(sec, aco, tipo, sinal, opcoes) {
    if (!AcoFSM) return null;
    var fo = opcoes.fsm || {};
    var chave = [sec.tipo, sec.bw, sec.bf, sec.D, sec.t, sec.ri, aco.E, tipo, sinal, JSON.stringify(fo)].join("|");
    if (CACHE[chave]) return CACHE[chave];
    var Z = sec.fam === "Z", carga;
    /* referência = esforço de início de escoamento (λ = Xcr/Xy); Z: flexão restrita em torno do eixo geométrico */
    if (tipo === "N") carga = { N: sec.A * aco.fy };
    else if (tipo === "Mx") carga = { Mx: sinal * sec.Wx * aco.fy, restrito: Z };
    else carga = { My: sinal * sec.Wy * aco.fy, restrito: Z };
    var op = { E: aco.E, nu: num(aco.nu, 0.3), carga: carga };
    for (var k in fo) if (Object.prototype.hasOwnProperty.call(fo, k)) op[k] = fo[k];
    var r = AcoFSM.assinatura(sec, op);
    if (!r) return null;
    function v(m) { return m ? (tipo === "N" ? m.Ncr : (tipo === "Mx" ? Math.abs(m.Mxcr) : Math.abs(m.Mycr))) : null; }
    var o = { local: v(r.local), dist: v(r.distorcional), Llocal: r.local && r.local.L, Ldist: r.distorcional && r.distorcional.L,
              distIndistinto: !!(r.distorcional && r.distorcional.indistinto), localSubstituto: !!(r.local && r.local.substituto),
              avisos: r.avisos.slice(), curva: r.curva };
    if (nCache > 300) { CACHE = {}; nCache = 0; }
    CACHE[chave] = o; nCache++;
    return o;
  }

  /* dispensa do distorcional pelas tabelas da norma (Ue e Z90): D/bw ≥ valor tabelado (interpolação linear;
   * bf, bw, D nominais). Compressão: Tabela 11 ([COMP] slide 58); flexão: [FLEX] slide 36. */
  var TAB_BF = [0.4, 0.6, 0.8, 1.0, 1.2, 1.4, 1.6, 1.8, 2.0], TAB_BT = [250, 200, 125, 100, 50];
  var TAB11 = [[0.02, 0.03, 0.04, 0.04, 0.08], [0.03, 0.04, 0.06, 0.06, 0.15], [0.05, 0.06, 0.08, 0.10, 0.22], [0.06, 0.07, 0.10, 0.12, 0.27],
               [0.06, 0.07, 0.12, 0.15, 0.27], [0.07, 0.08, 0.12, 0.15, 0.27], [0.07, 0.08, 0.12, 0.15, 0.27], [0.07, 0.08, 0.12, 0.15, 0.27], [0.07, 0.08, 0.12, 0.15, 0.27]];
  var TABF = [[0.05, 0.06, 0.10, 0.12, 0.25], [0.05, 0.06, 0.10, 0.12, 0.25], [0.05, 0.06, 0.09, 0.12, 0.22], [0.05, 0.06, 0.09, 0.11, 0.22],
              [0.05, 0.06, 0.09, 0.11, 0.20], [0.05, 0.06, 0.09, 0.10, 0.20], [0.05, 0.06, 0.09, 0.10, 0.20], [0.05, 0.06, 0.09, 0.10, 0.19], [0.05, 0.06, 0.09, 0.10, 0.19]];
  function interp1(xs, ys, x) { /* xs crescente ou decrescente */
    for (var i = 0; i + 1 < xs.length; i++) {
      var a = xs[i], b = xs[i + 1];
      if ((x - a) * (x - b) <= 0) return ys[i] + (ys[i + 1] - ys[i]) * (x - a) / (b - a);
    }
    return null;
  }
  function dispensaDist(sec, tabela) {
    if (!/^(Ue|Z90)$/.test(String(sec.tipo))) return null;
    var r1 = sec.bf / sec.bw, r2 = sec.bw / sec.t;
    if (r1 < 0.4 || r1 > 2.0 || r2 < 50 || r2 > 250) return { foraDaTabela: true };
    var col = TAB_BT.map(function (_, c) { return interp1(TAB_BF, tabela.map(function (l) { return l[c]; }), r1); });
    var lim = interp1(TAB_BT, col, r2);
    return { DbwMin: lim, Dbw: sec.D / sec.bw, dispensado: sec.D / sec.bw >= lim };
  }

  /* ---------------------------------------------- força cortante — 9.8.3 ([FLEX] slides 45-46; [LONG] p. 32)
   * h/t ≤ 1,08√(E·kv/fy): VRd = 0,6·fy·h·t/γ
   * 1,08√(E·kv/fy) < h/t ≤ 1,4√(E·kv/fy): VRd = 0,65·t²·√(kv·fy·E)/γ
   * h/t > 1,4√(E·kv/fy): VRd = 0,905·E·kv·t³/h/γ;  γ = 1,10
   * kv = 5,0 sem enrijecedores transversais (ou a/h > 3,0); kv = 5 + 5/(a/h)² com enrijecedores */
  function cortanteChapa(h, t, kv, aco) {
    var E = aco.E, fy = aco.fy, lim1 = 1.08 * Math.sqrt(E * kv / fy), lim2 = 1.4 * Math.sqrt(E * kv / fy), ht = h / t, VRk, faixa;
    if (ht <= lim1) { VRk = 0.6 * fy * h * t; faixa = "escoamento: 0,6·fy·h·t"; }
    else if (ht <= lim2) { VRk = 0.65 * t * t * Math.sqrt(kv * fy * E); faixa = "inelástica: 0,65·t²·√(kv·fy·E)"; }
    else { VRk = 0.905 * E * kv * t * t * t / h; faixa = "elástica: 0,905·E·kv·t³/h"; }
    return { VRd: VRk / GAMA.cort, faixa: faixa, ht: ht, lim1: lim1, lim2: lim2, kv: kv };
  }

  /* ---------------------------------------------- tração — 9.6 ([TRAC] slides 5, 7, 9)
   * Nt,Rd = min(A·fy/1,10; An0·fu/1,35; Ct·An·fu/1,65); An = 0,9·(A − nf·df·t + Σ t·s²/(4g)) */
  function coefCt(lig, sec, avisos) {
    var tipo = lig.tipo || "parafusada", el = lig.elemento || "perfil", d = num(lig.d, 0), g = num(lig.g, 0);
    var x = num(lig.x, NaN), L = num(lig.L, NaN), n = num(lig.parafusosNaDirecao, 1), C, expr;
    if (!fin(x)) {
      if (sec.fam === "Z") { x = excentricidadeMeioZ(sec); avisos.push("Ct do Z ligado pela alma: x = excentricidade da meia seção (" + x.toFixed(1) + " mm) — sem fonte específica"); }
      else x = sec.fam === "C" ? sec.xc + sec.t / 2 : 0;   /* face externa da alma → centróide */
    }
    if (el === "chapa" && tipo === "parafusada") {
      var dg = g > 0 ? d / g : 1;
      if (lig.mesmaSecao || n <= 1) { C = 2.5 * dg; expr = "Ct = 2,5·d/g ≤ 1,0"; }
      else if (n === 2) { C = 0.5 + 1.5 * dg; expr = "Ct = 0,5 + 1,5·d/g ≤ 1,0"; }
      else if (n === 3) { C = 0.67 + 0.83 * dg; expr = "Ct = 0,67 + 0,83·d/g ≤ 1,0"; }
      else { C = 0.75 + 0.625 * dg; expr = "Ct = 0,75 + 0,625·d/g ≤ 1,0"; }
      C = Math.min(1, C);
    } else if (tipo === "parafusada") {
      if (lig.todosConectados && n >= 2) { C = 1; expr = "Ct = 1,0 (todos os elementos conectados)"; }
      else if (lig.mesmaSecao || n <= 1) { C = Math.min(1, g > 0 ? 2.5 * d / g : 1); expr = "Ct = 2,5·d/g ≤ 1,0 (parafusos numa só seção)"; }
      else { C = Math.max(0.4, Math.min(0.9, 1 - 1.2 * x / L)); expr = "Ct = 1 − 1,2·x/L ≤ 0,9 (≥ 0,4)"; }
    } else {
      if (el === "chapa") {
        var b = num(lig.b, 0);
        if (lig.soldaTransversal) { C = 1; expr = "Ct = 1,0 (soldas longitudinais + transversais)"; }
        else { C = L >= 2 * b ? 1 : (L >= 1.5 * b ? 0.87 : 0.75); expr = "Ct por L/b (0,75 / 0,87 / 1,00)"; }
      } else if (lig.todosConectados) { C = 1; expr = "Ct = 1,0 (todos os elementos conectados)"; }
      else if (sec.fam === "C" || sec.fam === "Z") { C = Math.max(0.5, Math.min(0.9, 1 - 0.36 * x / L)); expr = "Ct = 1 − 0,36·x/L < 0,9 (≥ 0,5) — perfil U com soldas longitudinais"; }
      else { C = Math.max(0.4, Math.min(0.9, 1 - 1.2 * x / L)); expr = "Ct = 1 − 1,2·x/L < 0,9 (≥ 0,4)"; }
    }
    return { Ct: C, expr: expr, x: x, L: L };
  }
  function excentricidadeMeioZ(sec) {
    /* centróide da meia seção (mesa + enrijecedor + meia alma) medido da linha média da alma */
    var t = sec.t, b = sec.bf - t, d = sec.D > t ? sec.D - t / 2 : 0, h = (sec.bw - t) / 2;
    var A = (b + d + h) * t;
    return ((b * t) * (b / 2) + (d * t) * b) / A + t / 2;
  }

  /* ================================================== VERIFICAÇÃO */
  function verificar(secao, aco, esforcos, comprimentos, opcoes) {
    opcoes = opcoes || {}; comprimentos = comprimentos || {}; esforcos = esforcos || {};
    var sec = prepararSecao(secao), avisos = [], verif = [], criticos = {};
    if (!sec) return { ok: false, aproveitamento: Infinity, verificacoes: [], avisos: ["seção inválida"] };
    if (!sec.fam) return { ok: false, aproveitamento: Infinity, verificacoes: [], avisos: ["tipo " + sec.tipo + " fora do escopo (U, Ue, Z90, Z45, Cr)"] };
    aco = { fy: num(aco && aco.fy, 250), fu: num(aco && aco.fu, 400), E: num(aco && aco.E, 200000), G: num(aco && aco.G, 77000), nu: num(aco && aco.nu, 0.3) };
    var ext = opcoes.criticos || {};
    var N = num(esforcos.N, 0) * 1e3, Mx = num(esforcos.Mx, 0) * 1e6, My = num(esforcos.My, 0) * 1e6;
    var Vx = Math.abs(num(esforcos.Vx, 0)) * 1e3, Vy = Math.abs(num(esforcos.Vy, 0)) * 1e3;
    var Lx = num(comprimentos.Lx, 0), Ly = num(comprimentos.Ly, Lx), Lt = num(comprimentos.Lt, Ly);
    var Kx = num(comprimentos.Kx, 1), Ky = num(comprimentos.Ky, 1), Kz = num(comprimentos.Kz, 1);
    var terca = opcoes.terca || null;
    function add(v) {
      if (!v.unidade) v.unidade = /esbeltez|\+ cortante|Flexo|oblíqua/.test(v.nome) ? "—" : (/Flexão em/.test(v.nome) ? "kN·m" : "kN");
      v.razao = v.resistencia > 0 ? Math.abs(v.solicitante) / v.resistencia : (v.solicitante ? Infinity : 0);
      if (v.razao == null || !isFinite(v.razao)) v.razao = v.solicitante ? Infinity : 0;
      v.ok = v.razao <= 1 + 1e-9;
      Object.keys(v.valores || {}).forEach(function (k) { v.valores[k] = r4(v.valores[k]); });
      v.resistencia = r4(v.resistencia); v.solicitante = r4(v.solicitante); v.razao = r4(v.razao);
      v.passos = Object.keys(v.valores || {}).filter(function (k) { return v.valores[k] != null; })
        .map(function (k) { return { rotulo: k, valor: v.valores[k] }; });
      verif.push(v);
    }
    var Py = sec.A * aco.fy, res = {};

    /* ------------------------------ TRAÇÃO */
    if (N > 0) {
      var NtEsc = sec.A * aco.fy / GAMA.tracEsc;
      add({ nome: "Tração — escoamento da seção bruta", item: "NBR 14762:2010, 9.6", formula: "Nt,Rd = A·fy/γ (γ = 1,10)",
            valores: { "A (mm²)": sec.A, "fy (MPa)": aco.fy }, resistencia: NtEsc / 1e3, solicitante: N / 1e3, fonte: FONTE.trac });
      var NtRd = NtEsc;
      if (fin(opcoes.An0) && opcoes.An0 > 0) {
        var Nt0 = opcoes.An0 * aco.fu / GAMA.tracRupFora; NtRd = Math.min(NtRd, Nt0);
        add({ nome: "Tração — ruptura da seção líquida fora da ligação", item: "NBR 14762:2010, 9.6", formula: "Nt,Rd = An0·fu/γ (γ = 1,35)",
              valores: { "An0 (mm²)": opcoes.An0, "fu (MPa)": aco.fu }, resistencia: Nt0 / 1e3, solicitante: N / 1e3, fonte: FONTE.trac });
      }
      if (opcoes.ligacao) {
        var lg = opcoes.ligacao, nf = num(lg.furosNaSecao, 0), df = num(lg.df, num(lg.d, 0) + 1.5), zig = 0;
        (lg.ziguezague || []).forEach(function (q) { zig += sec.t * q.s * q.s / (4 * q.g); });
        var An = fin(lg.An) ? lg.An : 0.9 * (sec.A - nf * df * sec.t + zig);
        var ct = coefCt(lg, sec, avisos), NtL = ct.Ct * An * aco.fu / GAMA.tracRupLig; NtRd = Math.min(NtRd, NtL);
        add({ nome: "Tração — ruptura da seção líquida na ligação", item: "NBR 14762:2010, 9.6", formula: "Nt,Rd = Ct·An·fu/γ (γ = 1,65); An = 0,9·(A − nf·df·t + Σt·s²/4g); " + ct.expr,
              valores: { "An (mm²)": An, "nf": nf, "df (mm)": df, "x (mm)": ct.x, "L (mm)": ct.L, "Ct": ct.Ct, "fu (MPa)": aco.fu }, resistencia: NtL / 1e3, solicitante: N / 1e3, fonte: FONTE.trac });
      }
      res.NtRd = NtRd;
      var Lfl = num(comprimentos.Lfl, Math.max(Lx, Ly));
      if (Lfl > 0) {
        var rmin = sec.fam === "Z" ? Math.sqrt(sec.I2 / sec.A) : Math.min(sec.rx, sec.ry), lamT = Lfl / rmin;
        add({ nome: "Tração — esbeltez máxima (recomendação)", item: "NBR 14762:2010, 9.6.3", formula: "L/r ≤ 300",
              valores: { "L (mm)": Lfl, "r (mm)": rmin }, resistencia: 300, solicitante: lamT, fonte: FONTE.esbT });
      }
    }

    /* ------------------------------ COMPRESSÃO (MRD) */
    if (N < 0) {
      var NSd = -N, ng = neGlobal(sec, aco, { x: Kx * Lx, y: Ky * Ly, z: Kz * Lt });
      ng.avisos.forEach(function (a) { avisos.push(a); });
      var Ne = fin(ext.Ne) ? ext.Ne * 1e3 : ng.Ne;
      var l0 = Math.sqrt(Py / Ne), chi = chiCompressao(l0), NcRe = chi * Py;
      var fN = (fin(ext.Nl) && fin(ext.Ndist)) ? null : criticosFSM(sec, aco, "N", 1, opcoes);
      if (fN) fN.avisos.forEach(function (a) { avisos.push("FSM (compressão): " + a); });
      var Nl = fin(ext.Nl) ? ext.Nl * 1e3 : fN && fN.local, Nd = fin(ext.Ndist) ? ext.Ndist * 1e3 : fN && fN.dist;
      criticos.Ne = Ne / 1e3; criticos.Nl = Nl > 0 ? Nl / 1e3 : null; criticos.Ndist = Nd ? Nd / 1e3 : null;
      var vg = { "A (mm²)": sec.A, "fy (MPa)": aco.fy, "KxLx (mm)": Kx * Lx, "KyLy (mm)": Ky * Ly, "KzLz (mm)": Kz * Lt, "Nez (kN)": ng.Nez / 1e3, "Ne (kN)": Ne / 1e3, "λ0": l0, "χ": chi, "Nc,Re (kN)": NcRe / 1e3 };
      if (fin(ng.Nex)) vg["Nex (kN)"] = ng.Nex / 1e3; if (fin(ng.Ney)) vg["Ney (kN)"] = ng.Ney / 1e3;
      if (fin(ng.Nexz)) vg["Nexz (kN)"] = ng.Nexz / 1e3; if (fin(ng.Neyz)) vg["Neyz (kN)"] = ng.Neyz / 1e3;
      if (fin(ng.N1)) { vg["N1 (kN)"] = ng.N1 / 1e3; vg["N2 (kN)"] = ng.N2 / 1e3; }
      add({ nome: "Compressão — flambagem global (" + ng.caso + ")", item: "NBR 14762:2010, " + ng.item + " e Anexo C",
            formula: ng.formula + "; λ0 = (A·fy/Ne)^0,5; χ = 0,658^λ0² (λ0 ≤ 1,5) ou 0,877/λ0²; Nc,Re = χ·A·fy; Nc,Rd = Nc,Re/1,20",
            valores: vg, resistencia: NcRe / GAMA.comp / 1e3, solicitante: NSd / 1e3, fonte: FONTE.ne + "; " + FONTE.chi });
      var lc = local(NcRe, Nl);
      if (!(Nl > 0)) avisos.push("Nl não determinado: flambagem local da compressão NÃO verificada");
      else add({ nome: "Compressão — flambagem local (interação local-global)", item: "NBR 14762:2010, Anexo C",
            formula: "λl = (Nc,Re/Nl)^0,5; λl ≤ 0,776 → Nc,Rl = Nc,Re; senão Nc,Rl = (1 − 0,15/λl^0,8)·Nc,Re/λl^0,8; Nc,Rd = Nc,Rl/1,20",
            valores: { "Nl (kN)": Nl / 1e3, "Nc,Re (kN)": NcRe / 1e3, "λl": lc.lambda, "Nc,Rl (kN)": lc.R / 1e3, "Lcr local (mm)": fN && fN.Llocal },
            resistencia: lc.R / GAMA.comp / 1e3, solicitante: NSd / 1e3, fonte: FONTE.mrdN + (fN ? "; Nl por faixas finitas (js/acofsm.js)" : "; Nl dado") });
      var NcRd = Math.min(NcRe, lc.R);
      if (sec.tipo !== "U") {
        var disp = dispensaDist(sec, TAB11);
        if (Nd && !(fN && fN.distIndistinto && disp && disp.dispensado)) {
          var dc = distN(Py, Nd);
          add({ nome: "Compressão — flambagem distorcional", item: "NBR 14762:2010, 9.7.3 e Anexo C",
                formula: "λdist = (A·fy/Ndist)^0,5; λdist ≤ 0,561 → Nc,Rdist = A·fy; senão (1 − 0,25/λdist^1,2)·A·fy/λdist^1,2; Nc,Rd = Nc,Rdist/1,20",
                valores: { "Ndist (kN)": Nd / 1e3, "A·fy (kN)": Py / 1e3, "λdist": dc.lambda, "Nc,Rdist (kN)": dc.R / 1e3, "Lcr dist (mm)": fN && fN.Ldist, "indistinto (Ld de Hancock)": fN && fN.distIndistinto ? 1 : 0 },
                resistencia: dc.R / GAMA.comp / 1e3, solicitante: NSd / 1e3, fonte: FONTE.mrdN + (fN ? "; Ndist por faixas finitas (js/acofsm.js)" : "; Ndist dado") });
          NcRd = Math.min(NcRd, dc.R);
        } else if (disp && disp.dispensado) avisos.push("distorcional à compressão dispensado pela Tabela 11 (D/bw = " + disp.Dbw.toFixed(3) + " ≥ " + disp.DbwMin.toFixed(3) + ")");
      }
      res.NcRd = NcRd / GAMA.comp;
      var Lfc = num(comprimentos.Lfl, NaN), lamC;
      if (sec.fam === "Z") lamC = Math.max(Kx * Lx / Math.sqrt(sec.I1 / sec.A), Ky * Ly / Math.sqrt(sec.I2 / sec.A));
      else lamC = Math.max(Kx * Lx / sec.rx, Ky * Ly / sec.ry);
      if (fin(Lfc)) lamC = Lfc / (sec.fam === "Z" ? Math.sqrt(sec.I2 / sec.A) : Math.min(sec.rx, sec.ry));
      add({ nome: "Compressão — esbeltez máxima", item: "NBR 14762:2010, 9.7.4", formula: "KL/r ≤ 200",
            valores: { "KxLx/rx": Kx * Lx / sec.rx, "KyLy/ry": Ky * Ly / sec.ry }, resistencia: 200, solicitante: lamC, fonte: FONTE.esbC });
    }

    /* ------------------------------ FLEXÃO (MRD), por eixo */
    function flexao(eixo, M, V) {
      if (!M) return null;
      var sinal = M > 0 ? 1 : -1, W = eixo === "x" ? sec.Wx : sec.Wy, MyY = W * aco.fy, MSd = Math.abs(M);
      var Cb = fin(comprimentos.Cb) ? comprimentos.Cb : (cb(comprimentos.momentos) || 1.0);
      var Lb = { x: Lx, y: Ly, t: Lt }, semFLT = false, motivo = "";
      if (terca && eixo === "x") {
        if (terca.mesaFixadaNaTelha && !terca.succao) { semFLT = true; motivo = "mesa comprimida presa à telha (travamento contínuo)"; }
        if (terca.succao) {
          var Lc = num(terca.Lcorrentes, NaN);
          if (fin(Lc) && Lc > 0) { Lb.y = Lc; Lb.t = Lc; }
          if (!fin(comprimentos.Cb) && !comprimentos.momentos) Cb = 1.0;
          avisos.push("terça sob sucção: FLT da mesa livre com Ly = Lt = " + Lb.y.toFixed(0) + " mm" + (fin(Lc) ? " (entre correntes)" : "") +
                      "; o fator R do AISI (LaBoube) NÃO foi aplicado — não confirmado na NBR 14762:2010 (constava do Anexo F da edição de 2001: [BASA] p. 33 / PDF p. 41)");
        }
      }
      var me = semFLT ? { Me: Infinity, formula: "—", item: "9.8.2.2" } : meFLT(sec, aco, eixo, sinal, Lb, Cb, comprimentos.Cm);
      if (me.aviso) avisos.push(me.aviso);
      var Me = fin(ext["Me" + eixo]) ? ext["Me" + eixo] * 1e6 : me.Me;
      var l0 = isFinite(Me) ? Math.sqrt(MyY / Me) : 0, chiF = chiFLT(l0), MRe = chiF * MyY;
      var fM = (fin(ext["Ml" + eixo]) && (fin(ext["Mdist" + eixo]) || sec.tipo === "U")) ? null : criticosFSM(sec, aco, "M" + eixo, sinal, opcoes);
      if (fM) fM.avisos.forEach(function (a) { avisos.push("FSM (M" + eixo + "): " + a); });
      var Ml = fin(ext["Ml" + eixo]) ? ext["Ml" + eixo] * 1e6 : fM && fM.local;
      var Md = fin(ext["Mdist" + eixo]) ? ext["Mdist" + eixo] * 1e6 : fM && fM.dist;
      criticos["Me" + eixo] = isFinite(Me) ? Me / 1e6 : null; criticos["Ml" + eixo] = Ml > 0 ? Ml / 1e6 : null; criticos["Mdist" + eixo] = Md ? Md / 1e6 : null;
      var vF = { "W (mm³)": W, "fy (MPa)": aco.fy, "My = W·fy (kN·m)": MyY / 1e6, "Cb": Cb, "Me (kN·m)": isFinite(Me) ? Me / 1e6 : null, "λ0": l0, "χFLT": chiF, "MRe (kN·m)": MRe / 1e6 };
      ["Ney", "Nex", "Nez", "j", "Cs", "Cm"].forEach(function (k) { if (fin(me[k])) vF[k + (/^N/.test(k) ? " (kN)" : "")] = /^N/.test(k) ? me[k] / 1e3 : me[k]; });
      if (!semFLT) { vF["Ly (mm)"] = Lb.y; vF["Lt (mm)"] = Lb.t; }
      add({ nome: "Flexão em " + eixo + " — flambagem lateral com torção" + (semFLT ? " (dispensada: " + motivo + ")" : ""),
            item: "NBR 14762:2010, " + (me.item === "Anexo E" ? "Anexo E" : "9.8.2.2") + " e Anexo C",
            formula: (semFLT ? "χFLT = 1 (sem FLT)" : me.formula + "; λ0 = (W·fy/Me)^0,5; χFLT: 1 (λ0 ≤ 0,6), 1,11(1 − 0,278λ0²) (λ0 < 1,336), 1/λ0²") + "; MRe = χFLT·W·fy; MRd = MRe/1,10",
            valores: vF, resistencia: MRe / GAMA.flex / 1e6, solicitante: MSd / 1e6, fonte: semFLT ? FONTE.terca : (me.fonte + "; " + FONTE.mrdM) });
      var lm = local(MRe, Ml);
      if (!(Ml > 0)) avisos.push("Ml (" + eixo + ") não determinado: flambagem local da flexão NÃO verificada");
      else add({ nome: "Flexão em " + eixo + " — flambagem local (interação local-global)", item: "NBR 14762:2010, Anexo C",
            formula: "λl = (MRe/Ml)^0,5; λl ≤ 0,776 → MRl = MRe; senão MRl = (1 − 0,15/λl^0,8)·MRe/λl^0,8; MRd = MRl/1,10",
            valores: { "Ml (kN·m)": Ml / 1e6, "MRe (kN·m)": MRe / 1e6, "λl": lm.lambda, "MRl (kN·m)": lm.R / 1e6, "Lcr local (mm)": fM && fM.Llocal },
            resistencia: lm.R / GAMA.flex / 1e6, solicitante: MSd / 1e6, fonte: FONTE.mrdM + (fM ? "; Ml por faixas finitas (js/acofsm.js)" : "; Ml dado") });
      var MRd = Math.min(MRe, lm.R);
      if (sec.tipo !== "U" && Md) {
        var dispF = eixo === "x" ? dispensaDist(sec, TABF) : null;
        if (!(fM && fM.distIndistinto && dispF && dispF.dispensado)) {
          var dm = distM(MyY, Md);
          add({ nome: "Flexão em " + eixo + " — flambagem distorcional", item: "NBR 14762:2010, 9.8.2.3 e Anexo C",
                formula: "λdist = (W·fy/Mdist)^0,5; λdist ≤ 0,673 → MRdist = W·fy; senão (1 − 0,22/λdist)·W·fy/λdist; MRd = MRdist/1,10",
                valores: { "Mdist (kN·m)": Md / 1e6, "W·fy (kN·m)": MyY / 1e6, "λdist": dm.lambda, "MRdist (kN·m)": dm.R / 1e6, "Lcr dist (mm)": fM && fM.Ldist, "indistinto (Ld de Hancock)": fM && fM.distIndistinto ? 1 : 0 },
                resistencia: dm.R / GAMA.flex / 1e6, solicitante: MSd / 1e6,
                fonte: FONTE.mrdM + "; [FLEX] slide 35" + (terca && terca.succao ? "; " + FONTE.succao : "") + (fM ? "; Mdist por faixas finitas (js/acofsm.js)" : "; Mdist dado") });
          MRd = Math.min(MRd, dm.R);
        } else avisos.push("distorcional da flexão em x dispensado pela tabela da 9.8.2.3 (D/bw = " + dispF.Dbw.toFixed(3) + " ≥ " + dispF.DbwMin.toFixed(3) + ")");
      }
      /* momento do modo local SEM a FLT, para a interação com a cortante ([JMMS] p. 56-57) */
      var MRl0 = local(MyY, Ml).R / GAMA.flex;
      return { MRd: MRd / GAMA.flex, MRl0: MRl0, MSd: MSd, V: V };
    }
    var fx = flexao("x", Mx, Vy), fy = flexao("y", My, Vx);
    if (fx) res.MxRd = fx.MRd; if (fy) res.MyRd = fy.MRd;

    /* ------------------------------ CORTANTE — 9.8.3 */
    var a = opcoes.enrijecedoresAlma && num(opcoes.enrijecedoresAlma.a, NaN);
    function kvDe(h) { if (fin(a) && a > 0 && a / h <= 3) return 5 + 5 / ((a / h) * (a / h)); return 5.0; }
    var ri = num(sec.ri, sec.t), hAlma = sec.bw - 2 * (sec.t + ri), nAlmas = sec.fam === "Cr" ? 2 : 1;
    if (Vy > 0 || fx) {
      var cy = cortanteChapa(hAlma, sec.t, kvDe(hAlma), aco);
      res.VyRd = nAlmas * cy.VRd;
      if (Vy > 0) add({ nome: "Força cortante em y (alma" + (nAlmas > 1 ? "s" : "") + ")", item: "NBR 14762:2010, 9.8.3",
            formula: "VRd por h/t: " + cy.faixa + "; γ = 1,10; kv = " + cy.kv.toFixed(2) + (nAlmas > 1 ? "; 2 almas" : ""),
            valores: { "h (mm)": hAlma, "t (mm)": sec.t, "h/t": cy.ht, "1,08√(E·kv/fy)": cy.lim1, "1,4√(E·kv/fy)": cy.lim2, "kv": cy.kv },
            resistencia: res.VyRd / 1e3, solicitante: Vy / 1e3, fonte: FONTE.cort });
    }
    if (Vx > 0 || fy) {
      var hM = sec.fam === "Cr" ? sec.bf - 2 * (sec.t + ri) : (sec.D > sec.t ? sec.bf - 2 * (sec.t + ri) : sec.bf - (sec.t + ri));
      var nM = sec.fam === "Cr" ? 1 : 2, cx = cortanteChapa(hM, sec.t, 5.0, aco);
      res.VxRd = nM * cx.VRd;
      if (Vx > 0) {
        avisos.push("cortante paralela às mesas: 9.8.3 aplicada às mesas como almas (kv = 5,0) — extensão sem fonte específica");
        add({ nome: "Força cortante em x (mesas)", item: "NBR 14762:2010, 9.8.3 (aplicada às mesas)",
              formula: "VRd por h/t: " + cx.faixa + "; γ = 1,10; kv = 5,0; " + nM + " mesa(s)",
              valores: { "h (mm)": hM, "t (mm)": sec.t, "h/t": cx.ht, "kv": 5 }, resistencia: res.VxRd / 1e3, solicitante: Vx / 1e3, fonte: FONTE.cort + " (extensão às mesas: sem fonte)" });
      }
    }
    /* ------------------------------ MOMENTO + CORTANTE — 9.8.4 ([FLEX] slide 47; [JMMS] p. 56-57; [DOB] p. 43)
     * sem enrijecedores transversais: (MSd/MRd)² + (VSd/VRd)² ≤ 1,0;
     * com enrijecedores, só se MSd/MRd > 0,5 e VSd/VRd > 0,7: 0,6·MSd/MRd + VSd/VRd ≤ 1,3
     * MRd = momento resistente do MODO LOCAL (sem a FLT; "MRd do 9.8.2.1") */
    [[fx, Vy, res.VyRd, "x", "y"], [fy, Vx, res.VxRd, "y", "x"]].forEach(function (q) {
      var f = q[0], V = q[1], VRd = q[2];
      if (!f || !(V > 0) || !(VRd > 0)) return;
      var comEnr = fin(a) && a > 0, val;
      if (!comEnr) val = Math.pow(f.MSd / f.MRl0, 2) + Math.pow(V / VRd, 2);
      else if (f.MSd / f.MRl0 > 0.5 && V / VRd > 0.7) val = (0.6 * f.MSd / f.MRl0 + V / VRd) / 1.3;
      else return;   /* com enrijecedores e esforços abaixo de 0,5/0,7: a interação não é exigida */
      add({ nome: "Momento fletor em " + q[3] + " + cortante em " + q[4], item: "NBR 14762:2010, 9.8.4",
            formula: comEnr ? "(0,6·MSd/MRd + VSd/VRd)/1,3 ≤ 1 (MSd/MRd > 0,5 e VSd/VRd > 0,7)" : "(MSd/MRd)² + (VSd/VRd)² ≤ 1,0 (MRd do modo local, sem FLT)",
            valores: { "MSd (kN·m)": f.MSd / 1e6, "MRd local (kN·m)": f.MRl0 / 1e6, "VSd (kN)": V / 1e3, "VRd (kN)": VRd / 1e3 },
            resistencia: 1, solicitante: val, fonte: FONTE.mv });
    });

    /* ------------------------------ FLEXÃO COMPOSTA ([FCOMP] slides 7-8): NSd/NRd + MxSd/MxRd + MySd/MyRd ≤ 1,0 */
    var nTermos = (N ? 1 : 0) + (fx ? 1 : 0) + (fy ? 1 : 0);
    if (nTermos >= 2) {
      var NRd = N > 0 ? res.NtRd : res.NcRd, s = 0, vals = {};
      if (N) { s += Math.abs(N) / NRd; vals["NSd/NRd"] = Math.abs(N) / NRd; }
      if (fx) { s += fx.MSd / fx.MRd; vals["MxSd/MxRd"] = fx.MSd / fx.MRd; }
      if (fy) { s += fy.MSd / fy.MRd; vals["MySd/MyRd"] = fy.MSd / fy.MRd; }
      if (N > 0) avisos.push("flexo-tração: interação linear com a tração somada (a favor da segurança)");
      add({ nome: N < 0 ? "Flexo-compressão" : (N > 0 ? "Flexo-tração" : "Flexão oblíqua"), item: "NBR 14762:2010, 9.9 (flexão composta; numeração não conferida no texto oficial)",
            formula: "NSd/NRd + Mx,Sd/Mx,Rd + My,Sd/My,Rd ≤ 1,0 (esforços de 2ª ordem)", valores: vals, resistencia: 1, solicitante: s, fonte: FONTE.fcomp });
    }

    var aprov = 0, ok = true, gov = null;
    verif.forEach(function (v) { if (v.razao > aprov) { aprov = v.razao; gov = v.nome; } if (!v.ok) ok = false; });
    var resumo = {};
    Object.keys(res).forEach(function (k) { resumo[k] = r4(/^M/.test(k) ? res[k] / 1e6 : res[k] / 1e3); });
    return { ok: ok, aproveitamento: r4(aprov), razao: r4(aprov), governante: gov, verificacoes: verif, resumo: resumo, criticos: criticos, avisos: avisos,
             norma: "ABNT NBR 14762:2010 — Método da Resistência Direta (Anexo C)", unidades: "kN, kN·m, mm, MPa" };
  }

  var ED = "ABNT NBR 14762:2010 — Método da Resistência Direta (Anexo C); forças e momentos críticos local e distorcional por faixas finitas (js/acofsm.js); fórmulas conferidas em fontes secundárias (texto oficial pendente)";
  var AcoDim14762 = { ED: ED, EDICAO: ED, verificar: verificar, chiCompressao: chiCompressao, chiFLT: chiFLT, local: local, distN: distN, distM: distM,
                      cb: cb, neGlobal: function (s, a, L) { return neGlobal(prepararSecao(s), a, L); },
                      meFLT: function (s, a, eixo, sinal, L, Cb, Cm) { return meFLT(prepararSecao(s), a, eixo, sinal, L, Cb, Cm); },
                      cortanteChapa: cortanteChapa, coefCt: coefCt, dispensaDistorcional: function (s, flexao) { return dispensaDist(prepararSecao(s), flexao ? TABF : TAB11); },
                      GAMA: GAMA, FONTE: FONTE };
  global.AcoDim14762 = AcoDim14762;
  if (typeof module !== "undefined" && module.exports) module.exports = AcoDim14762;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
