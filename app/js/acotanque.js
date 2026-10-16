/* =====================================================================
 * acotanque.js — TANQUES METÁLICOS: dimensionamento, vento, estabilidade,
 * ancoragem, cargas na fundação e quantitativo (motor PURO, ES5, sem DOM,
 * Node-testável). Frente T da Metálica industrial, 14/10/2026.
 *
 * Pedido do Rogério: "tanques de qualquer tipo (água, óleo, industriais),
 * modelos prontos e paramétricos, escada de marinheiro, plataformas,
 * dimensionar, memorial, quantitativo, simular o vento". O engenheiro não
 * precisa saber a norma: o motor escolhe e EXPLICA (decisoes[]).
 *
 * TIPOS
 *   vertical    cilíndrico vertical de fundo plano soldado, armazenamento
 *               atmosférico (API 650 — a base de cálculo de todos os tanques
 *               verticais daqui; NBR 7821 e AWWA D100 como referência);
 *               costado por anéis (método de um pé, projeto e teste
 *               hidrostático, sobreespessura de corrosão, espessura mínima
 *               por diâmetro, larguras comerciais de chapa); fundo (com anel
 *               anular quando exigido); teto cônico suportado (caibros +
 *               coluna central), cônico autoportante, domo autoportante ou
 *               aberto (anel de contraventamento de topo); cantoneira de
 *               topo; anéis intermediários de contraventamento (altura
 *               máxima do costado não enrijecido); vento NBR 6123 pelo
 *               endereço (AcoVento/AcoIsopletas) com Ca do cilindro da
 *               Tabela 10; estabilidade ao tombamento, ancoragem e
 *               deslizamento; sismo (NBR 15421: zona 0 dispensada); cargas
 *               na fundação (base anelar ou radier) por caso;
 *   horizontal  cilíndrico horizontal sobre duas selas (tampos planos),
 *               costado pela pressão do líquido + tensões nas selas pelo
 *               método de Zick (1951);
 *   elevado     cuba cilíndrica sobre torre de pilares contraventados
 *               (água — AWWA D100 como referência): cuba pelo método de um
 *               pé, torre por equilíbrio de painel (pilares à compressão com
 *               flambagem, diagonais à tração) e cargas por pilar na fundação.
 *
 * NÃO INVENTA: todo número de norma leva norma + edição + item; o que não
 * foi conferido no texto oficial leva `conferir: true` (e vai para
 * r.pendencias e para o memorial). O que o motor não verifica sai em
 * r.naoVerificado ("não verificado: …") — nunca "aprovado" silencioso.
 *
 * API
 *   AcoTanque.TIPOS, PRODUTOS, ACOS, NORMAS, PADRAO
 *   AcoTanque.padrao(tipo) / normalizar(par) / validar(par)
 *   AcoTanque.calcular(par) → resultado (contrato em docs/metalica/TANQUES.md)
 *   AcoTanque.dimensionar(volumeUtil, par) → { ok, par, resultado, alternativas, justificativa }
 *   AcoTanque.modelos() → catálogo de modelos prontos (dimensionados pelo motor)
 *   AcoTanque.caTabela10(hl, Re, superficie) / tensoesAdm(aco) / umPe(...)
 *   AcoTanque.zick(...) (selas), AcoTanque.acessosRef() (NR-12 / API)
 * Teste: node tools/test-aco-tanque.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  function Vento() { return dep("AcoVento", "./acovento.js"); }
  function Iso() { return dep("AcoIsopletas", "./acoisopletas.js"); }
  function Perf() { return dep("PerfisAco", "./perfisaco.js"); }
  function Cat() { return global.AcoCatalogoInd || null; }   /* frente C (opcional: sem ela, os padrões daqui) */
  function num(v, d) { if (v == null || v === "") return d; var n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : d; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function r1(v) { return Math.round(v * 10) / 10; }
  function r2(v) { return Math.round(v * 100) / 100; }
  function r3(v) { return Math.round(v * 1000) / 1000; }
  function r4(v) { return Math.round(v * 1e4) / 1e4; }
  var MENOS = "−";
  function br(v, c) {
    if (!fin(v)) return "—";
    c = c == null ? 2 : c;
    var s = Math.abs(v).toFixed(c), p = s.split("."), i = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return (v < 0 && Number(s) !== 0 ? MENOS : "") + i + (c ? "," + p[1] : "");
  }
  function passo(rotulo, formula, valor, extra) { return { rotulo: rotulo, formula: formula || "", valor: valor, extra: extra || "" }; }
  var PI = Math.PI, G_ACC = 9.81, RHO = 7850, GAMA_ACO = 77.0;   /* kN/m³ (7 850 kg/m³ × 9,81) */

  /* ============================================================ NORMAS
   * edição vigente (o que a biblioteca/catálogo diz) e o que o motor usou.
   * conferir: o texto oficial não está na biblioteca técnica da RA. */
  var NORMAS = {
    api650: { id: "API 650", titulo: "Welded Tanks for Oil Storage", edicao: "14ª ed. (ago/2025)", usada: "fórmulas conferidas no texto oficial da 11ª ed. (2007, adendo 3 de 2011, incorporado ao 49 CFR 195) — conferir na 14ª", fonte: "https://law.resource.org/pub/us/cfr/ibr/002/api.650.2007.pdf", conferir: true },
    nbr7821: { id: "ABNT NBR 7821", titulo: "Tanques soldados para armazenamento de petróleo e derivados", edicao: "04/1983, confirmada em 01/2022 (catálogo ABNT, fonte secundária)", usada: "referência (o cálculo segue a API 650, de que ela deriva)", conferir: true },
    awwaD100: { id: "AWWA D100", titulo: "Welded Carbon Steel Tanks for Water Storage", edicao: "D100-21", usada: "referência para reservatório de água (soldado) e tanque elevado", conferir: true },
    awwaD103: { id: "AWWA D103", titulo: "Factory-Coated Bolted Carbon Steel Tanks for Water Storage", edicao: "D103-19", usada: "referência (tanque aparafusado — não calculado aqui)", conferir: true },
    nbr6123: { id: "ABNT NBR 6123", titulo: "Forças devidas ao vento em edificações", edicao: "2023 (versão corrigida 2025)", usada: "1988 (único texto na biblioteca; mapa de isopletas igual na 2023) — Ca do cilindro (Tabela 10) e fatores S1/S2/S3 da edição de 1988, a conferir na 2023", conferir: true },
    nbr15421: { id: "ABNT NBR 15421", titulo: "Projeto de estruturas resistentes a sismos — Procedimento", edicao: "05/2023", usada: "zona sísmica informada; zona 0 sem requisito sísmico (texto de 2006 — conferir na 2023); a edição de 2006 excluía tanques do escopo (API 650, Anexo E)", conferir: true },
    nbr8800: { id: "ABNT NBR 8800", titulo: "Projeto de estruturas de aço e de estruturas mistas de aço e concreto", edicao: "2024 (errata 2025)", usada: "2008 nas expressões de compressão e tração (caibros, coluna, torre)", conferir: false },
    nr12: { id: "NR-12", titulo: "Segurança no trabalho em máquinas e equipamentos — Anexo III (meios de acesso)", edicao: "texto atualizado 2025 (biblioteca)", usada: "escada de marinheiro, gaiola, plataforma e guarda-corpo", conferir: true },
    nr13: { id: "NR-13", titulo: "Caldeiras, vasos de pressão, tubulações e tanques metálicos de armazenamento", edicao: "texto atualizado 2023 (biblioteca); tanques desde 04/07/2026 (Portaria MTP 1.846/2022, art. 3º)", usada: "aviso: tanque de fluido inflamável/combustível com Ø externo > 3 m e > 20.000 L entra na NR-13 (inspeção e pós-construção; 13.7.2.1 manda seguir o código de construção)", conferir: true },
    nr20: { id: "NR-20", titulo: "Segurança e saúde no trabalho com inflamáveis e combustíveis", edicao: "texto atualizado 2025 (biblioteca)", usada: "aviso para produto inflamável — não verificado aqui", conferir: true },
    nbr17505: { id: "ABNT NBR 17505", titulo: "Armazenamento de líquidos inflamáveis e combustíveis (partes 1 a 7)", edicao: "parte 2: 2026 (publ. 25/08/2026); parte 7: 2024; partes 1, 3, 5 e 6: 2013/2015", usada: "aviso para produto inflamável/combustível — não verificado aqui", conferir: true },
    zick: { id: "Zick (1951)", titulo: "Stresses in large horizontal cylindrical pressure vessels on two saddle supports (Welding Journal)", edicao: "1951 (reproduzido em ASME VIII-2, 4.15, e no Pressure Vessel Handbook)", usada: "tensões nas selas", conferir: true }
  };

  /* ============================================================ AÇOS
   * fy/fu mínimos das especificações ASTM (A283 Gr C: 30/55 ksi; A285 Gr C:
   * 30/55 ksi; A36: 36/58 ksi; A516 Gr 70: 38/70 ksi) = os da API 650, Tabela 5-2a
   * (Sd/St: A283 C e A285 C 137/154; A36 160/171; A516-485 173/195 MPa). O A572 Gr 50
   * NÃO consta da Tabela 5-2a (11ª ed.) e fica fora do costado.
   * — com a frente C (AcoCatalogoInd.fyFu), vale o catálogo dela.
   * Tensões admissíveis da API 650 (5.6.2.1/5.6.2.2): Sd = min(2/3·fy; 2/5·fu),
   * St = min(3/4·fy; 3/7·fu). */
  var ACOS = {
    "ASTM A283 Gr.C": { fy: 205, fu: 380, grupo: "I", tmax: 25, fonte: "ASTM A283/A283M (Grade C: 30 ksi / 55 ksi)" },
    "ASTM A285 Gr.C": { fy: 205, fu: 380, grupo: "I", tmax: 25, fonte: "ASTM A285/A285M (Grade C: 30 ksi / 55 ksi)" },
    "ASTM A36": { fy: 250, fu: 400, grupo: "II", tmax: 40, fonte: "ASTM A36/A36M (36 ksi / 58 ksi)" },
    "ASTM A516 Gr.70": { fy: 260, fu: 485, grupo: "IV", tmax: 40, fonte: "ASTM A516/A516M (Grade 70: 38 ksi / 70 ksi); API 650, Tabela 4-4a: A516M-485 laminado = Grupo IV" }
  };
  function acoDe(id) {
    var a = ACOS[id], C = Cat(), x = null;
    try { x = C && C.fyFu ? C.fyFu(id) : null; } catch (e) { x = null; }
    if (x && fin(x.fy) && fin(x.fu) && a) return { id: id, fy: x.fy, fu: x.fu, grupo: a.grupo, tmax: a.tmax, fonte: x.fonte || a.fonte, catalogo: true };
    return a ? { id: id, fy: a.fy, fu: a.fu, grupo: a.grupo, tmax: a.tmax, fonte: a.fonte } : null;
  }
  function tensoesAdm(aco) {
    var a = typeof aco === "string" ? acoDe(aco) : aco; if (!a) return null;
    var Sd = Math.min(2 / 3 * a.fy, 2 / 5 * a.fu), St = Math.min(3 / 4 * a.fy, 3 / 7 * a.fu);
    return { Sd: r1(Sd), St: r1(St), fy: a.fy, fu: a.fu, ref: "API 650, 5.6.2.1 e 5.6.2.2: Sd = min(2/3·fy; 2/5·fu), St = min(3/4·fy; 3/7·fu)" };
  }

  /* espessuras comerciais de chapa grossa (mm) — com a frente C, a lista dela */
  var ESPESSURAS = [4.75, 5.0, 6.3, 8.0, 9.5, 12.5, 16.0, 19.0, 22.4, 25.0, 31.5, 37.5, 44.5, 50.0];
  function espessuras() {
    var C = Cat(), l = null;
    try { l = C && C.espessurasChapa ? C.espessurasChapa("grossa") : null; } catch (e) { l = null; }
    l = arr(l).map(function (v) { return num(v, NaN); }).filter(function (v) { return v >= 4.5 && v <= 80; }).sort(function (a, b) { return a - b; });
    return l.length >= 6 ? l : ESPESSURAS.slice();
  }
  function comercial(tmm) { var l = espessuras(); for (var i = 0; i < l.length; i++) if (l[i] >= tmm - 1e-9) return l[i]; return Math.ceil(tmm); }

  /* ============================================================ PRODUTOS
   * G = densidade relativa (água = 1). Valores de PARTIDA a confirmar com a
   * ficha do produto (FISPQ) — o usuário informa o G real. */
  var PRODUTOS = {
    "agua": { nome: "Água (industrial / incêndio)", G: 1.0, inflamavel: false, agua: true },
    "agua-potavel": { nome: "Água potável", G: 1.0, inflamavel: false, agua: true, potavel: true },
    "diesel": { nome: "Óleo diesel", G: 0.85, inflamavel: false, combustivel: true },
    "gasolina": { nome: "Gasolina", G: 0.75, inflamavel: true },
    "etanol": { nome: "Etanol", G: 0.81, inflamavel: true },
    "oleo-combustivel": { nome: "Óleo combustível", G: 0.98, inflamavel: false, combustivel: true },
    "petroleo": { nome: "Petróleo cru", G: 0.90, inflamavel: true },
    "oleo-vegetal": { nome: "Óleo vegetal", G: 0.92, inflamavel: false },
    "produto": { nome: "Produto industrial (G informado)", G: 1.0, inflamavel: false, informado: true }
  };

  /* ============================================================ NBR 6123:1988, Tabela 10 (p. 22 do PDF da biblioteca)
   * Ca para corpos de seção constante — seção CIRCULAR. Colunas h/l1: 1/2, 1, 2, 5, 10, 20, ∞.
   * "liso" (metal, concreto, alvenaria rebocada): Re ≤ 3,5·10⁵ e Re ≥ 4,2·10⁵ (nota A: interpolar);
   * "rugoso": com rugosidade ou saliências = 0,02·l1 (todos os Re); "muito-rugoso": 0,08·l1. */
  var TAB10 = { hl: [0.5, 1, 2, 5, 10, 20, Infinity],
    lisoSub: [0.7, 0.7, 0.7, 0.8, 0.9, 1.0, 1.2], lisoSuper: [0.5, 0.5, 0.5, 0.5, 0.5, 0.6, 0.6],
    rugoso: [0.7, 0.7, 0.8, 0.8, 0.9, 1.0, 1.2], muitoRugoso: [0.8, 0.8, 0.9, 1.0, 1.1, 1.2, 1.4],
    ref: "NBR 6123:1988, 6.3 e Tabela 10 (seção circular), p. 22" };
  function interpHL(lin, hl) {
    var H = TAB10.hl;
    if (hl <= H[0]) return lin[0];
    for (var i = 0; i < H.length - 1; i++) {
      if (hl <= H[i + 1]) { if (!isFinite(H[i + 1])) return lin[i + 1]; return lin[i] + (lin[i + 1] - lin[i]) * (hl - H[i]) / (H[i + 1] - H[i]); }
    }
    return lin[H.length - 1];
  }
  function caTabela10(hl, Re, superficie) {
    var sup = superficie || "rugoso", ca, txt;
    if (sup === "liso") {
      var a = interpHL(TAB10.lisoSub, hl), b = interpHL(TAB10.lisoSuper, hl), R5 = Re / 1e5;
      if (R5 <= 3.5) { ca = a; txt = "liso, Re ≤ 3,5·10⁵"; }
      else if (R5 >= 4.2) { ca = b; txt = "liso, Re ≥ 4,2·10⁵"; }
      else { ca = a + (b - a) * (R5 - 3.5) / 0.7; txt = "liso, Re entre 3,5 e 4,2·10⁵ (interpolado, nota A)"; }
    } else if (sup === "muito-rugoso") { ca = interpHL(TAB10.muitoRugoso, hl); txt = "saliências = 0,08·l1"; }
    else { ca = interpHL(TAB10.rugoso, hl); txt = "rugosidade ou saliências = 0,02·l1 (escada, anéis, bocais)"; }
    return { Ca: r3(ca), texto: txt, hl: hl, Re: Re, ref: TAB10.ref };
  }

  /* ============================================================ REFERÊNCIAS DE ACESSO
   * escadas, gaiola, guarda-corpo. NR-12 Anexo III (texto da biblioteca) — itens a
   * conferir; os valores de API 650 (Tabelas 5-17 a 5-19) entram como referência. */
  var ACESSO = {
    guardaCorpo: { altura: 1.10, alturaMax: 1.20, intermediario: 0.70, rodape: 0.20, fonte: "NR-12, Anexo III, item 7 (travessão superior de 1,10 a 1,20 m, intermediário a 0,70 m, rodapé ≥ 0,20 m)", conferir: false },
    marinheiro: { gaiolaAcima: 3.5, gaiolaDesde: 2.0, gaiolaAlem: 1.10, diamGaiolaMin: 0.65, diamGaiolaMax: 0.80, barrasGaiola: 0.30, arcosGaiola: 1.50, larguraMin: 0.40, larguraMax: 0.60,
                  espDegrauMin: 0.25, espDegrauMax: 0.30, primeiroDegrau: 0.55, afastamento: 0.15, barraMin: 0.025, barraMax: 0.038, lanceUnico: 10.0, lanceMulti: 6.0,
                  fonte: "NR-12, Anexo III, itens 13 e 13.1 (escada fixa tipo marinheiro e gaiola)", conferir: false },
    escada: { larguraMin: 0.60, profundidadeMin: 0.15, alturaMax: 0.25, gMais2hMin: 0.600, gMais2hMax: 0.660, patamarCada: 3.00, patamarLargura: 0.60, anguloMin: 20, anguloMax: 45,
              fonte: "NR-12, Anexo III, item 11 (escada de degraus sem espelho: largura ≥ 0,60 m, degrau ≥ 0,15 m, altura ≤ 0,25 m, 600 ≤ g + 2h ≤ 660 mm, plataforma de descanso a cada 3,00 m de altura); ângulo pela Figura 1 (ISO 14122) — conferir", conferir: true },
    plataforma: { larguraMin: 0.60, fonte: "NR-12, Anexo III, item 10 (largura útil mínima 0,60 m)", conferir: false },
    aplicacao: "A NR-12 (Anexo III) é a referência brasileira de meio de acesso permanente; o item 1.2 exclui acessos de estruturas industriais fixas que não sirvam a máquina — adotada por analogia, a favor da segurança.",
    api650: { escadaLarguraMin: 0.61, escadaAnguloMax: 50, fonte: "API 650, Tabelas 5-17/5-18/5-19 (plataformas, passarelas e escadas) — referência; vale o mais exigente com a NR-12", conferir: true }
  };
  function acessosRef() {
    var A = global.AcoAcessos || null, o = clone(ACESSO);
    try { if (A && A.REF) o.frenteA = clone(A.REF); } catch (e) {}
    return o;
  }

  /* ============================================================ TIPOS e PADRÃO */
  var TIPOS = {
    vertical: { id: "vertical", rotulo: "Tanque vertical (fundo plano)" },
    horizontal: { id: "horizontal", rotulo: "Tanque horizontal sobre selas" },
    elevado: { id: "elevado", rotulo: "Reservatório elevado (torre)" }
  };
  var TETOS = { "conico-suportado": "Cônico suportado (caibros + coluna central)", "conico-autoportante": "Cônico autoportante", "domo": "Domo autoportante", "aberto": "Aberto (anel de contraventamento de topo)" };
  var PADRAO = {
    vertical: { tipo: "vertical", nome: "", produto: "agua", G: null, D: 6, H: 7.32, bordaLivre: 0.30, hMorto: 0.30, CA: 1.5, CAfundo: 1.5, CAteto: 0,
      aco: "ASTM A36", larguraChapa: 2.44, comprimentoChapa: 6.0, teto: "conico-autoportante", inclTeto: 20, raioDomo: 1.0, Lr: 1.0, Pe: 0.25, isolamento: 0,
      vento: { v0: 35, lat: null, lon: null, categoria: "II", grupoS3: 3, s1: "plano", superficie: "rugoso" }, sismo: { zona: 0 },
      ancoragem: "auto", acoChumbador: "ASTM F1554 Gr.36", fundacao: "anel", fckFundacao: 0,
      acessorios: { escada: "auto", larguraEscada: 0.80, plataforma: true, guardaCorpoTeto: true, bocaVisitaCostado: 1, bocaVisitaTeto: 1, indicadorNivel: true, bocais: "auto" },
      x0: 0, y0: 0, z0: 0, giro: 0 },
    horizontal: { tipo: "horizontal", nome: "", produto: "diesel", G: null, D: 2.5, L: 6.0, A: 0, anguloSela: 120, bSela: 0.25, alturaSela: 0.5, CA: 1.5, E: 0.85, pv: 0,
      aco: "ASTM A36", larguraChapa: 2.44, comprimentoChapa: 6.0, tampo: "plano",
      vento: { v0: 35, lat: null, lon: null, categoria: "II", grupoS3: 3, s1: "plano", superficie: "rugoso" }, sismo: { zona: 0 },
      acessorios: { escada: "marinheiro", plataforma: true, bocaVisitaTeto: 1, indicadorNivel: true, bocais: "auto" },
      x0: 0, y0: 0, z0: 0, giro: 0 },
    elevado: { tipo: "elevado", nome: "", produto: "agua-potavel", G: null, D: 4.0, H: 4.88, bordaLivre: 0.30, hMorto: 0.15, CA: 1.5, CAfundo: 1.5, CAteto: 0,
      aco: "ASTM A36", larguraChapa: 2.44, comprimentoChapa: 6.0, teto: "conico-autoportante", inclTeto: 20, raioDomo: 1.0, Lr: 1.0, Pe: 0.25, isolamento: 0,
      alturaTorre: 15, pilares: 4, aberturaBase: 0, paineis: 0, pilar: "auto", contravento: "auto", vigaFundo: "auto", fckFundacao: 0,
      vento: { v0: 35, lat: null, lon: null, categoria: "II", grupoS3: 3, s1: "plano", superficie: "rugoso" }, sismo: { zona: 0 },
      acessorios: { escada: "marinheiro", plataforma: true, guardaCorpoTeto: true, bocaVisitaTeto: 1, indicadorNivel: true, bocais: "auto" },
      x0: 0, y0: 0, z0: 0, giro: 0 }
  };
  function padrao(tipo) { return clone(PADRAO[tipo] || PADRAO.vertical); }
  function mesclar(a, b) { Object.keys(b || {}).forEach(function (k) { var v = b[k]; if (v == null || v === "") return; if (v && typeof v === "object" && !Array.isArray(v) && a[k] && typeof a[k] === "object" && !Array.isArray(a[k])) mesclar(a[k], v); else a[k] = clone(v); }); return a; }
  var NUMS = ["G", "D", "H", "L", "A", "bordaLivre", "hMorto", "CA", "CAfundo", "CAteto", "larguraChapa", "comprimentoChapa", "inclTeto", "raioDomo", "Lr", "Pe", "isolamento", "anguloSela", "bSela", "alturaSela", "E", "pv", "alturaTorre", "pilares", "aberturaBase", "paineis", "fckFundacao", "x0", "y0", "z0", "giro"];
  function normalizar(par) {
    var tipo = par && TIPOS[par.tipo] ? par.tipo : "vertical", p = mesclar(padrao(tipo), par || {});
    p.tipo = tipo;
    NUMS.forEach(function (k) { if (k in p && p[k] !== null) p[k] = num(p[k], PADRAO[tipo][k]); });
    var v = p.vento || {}; ["v0", "lat", "lon", "grupoS3"].forEach(function (k) { if (v[k] != null && v[k] !== "") v[k] = num(v[k], null); else v[k] = null; });
    if (v.grupoS3 == null) v.grupoS3 = 3;
    p.sismo = p.sismo || {}; p.sismo.zona = Math.round(num(p.sismo.zona, 0));
    var pr = PRODUTOS[p.produto] || PRODUTOS.agua; if (!PRODUTOS[p.produto]) p.produto = "agua";
    if (!(num(p.G, 0) > 0)) p.G = pr.G;
    return p;
  }
  function validar(par) {
    var p = normalizar(par);
    if (!acoDe(p.aco)) return "Aço do costado desconhecido: " + p.aco + " (use " + Object.keys(ACOS).join(", ") + ").";
    if (!(p.G >= 0.3 && p.G <= 2.5)) return "Densidade relativa G do produto entre 0,30 e 2,50.";
    if (!(p.CA >= 0 && p.CA <= 6)) return "Sobreespessura de corrosão entre 0 e 6 mm.";
    if (p.tipo !== "horizontal") {
      if (!(p.Pe >= 0 && p.Pe <= 0.25)) return "Vácuo de projeto (Pe) entre 0 e 0,25 kPa (API 650, 5.2.1 e 5.2.5): acima disso o tanque segue o Anexo V — fora do escopo desta ferramenta.";
      if (!(p.Lr >= 1.0 && p.Lr <= 10)) return "Carga acidental do teto (Lr) de no mínimo 1,0 kPa (API 650, 5.2.1-f).";
      if (!(p.isolamento >= 0 && p.isolamento <= 3)) return "Peso do isolamento do teto entre 0 e 3 kPa.";
      if (!(p.CAfundo >= 0 && p.CAfundo <= 6) || !(p.CAteto >= 0 && p.CAteto <= 6)) return "Corrosão do fundo e do teto entre 0 e 6 mm.";
    } else {
      if (!(p.E >= 0.5 && p.E <= 1)) return "Eficiência da junta (E) entre 0,5 e 1,0.";
      if (!(num(p.pv, 0) >= 0 && num(p.pv, 0) <= 1.0)) return "Pressão do respiro entre 0 e 1,0 kPa (tanque atmosférico — acima disso é vaso de pressão, fora do escopo; limite adotado).";
    }
    if (!(p.larguraChapa >= 1.0 && p.larguraChapa <= 3.2)) return "Largura comercial da chapa (altura do anel) entre 1,00 e 3,20 m.";
    var v = p.vento; if (!(fin(v.v0) && v.v0 >= 25 && v.v0 <= 55) && !(fin(v.lat) && fin(v.lon))) return "Vento: informe o endereço da obra (latitude e longitude) ou o V0 (25 a 55 m/s).";
    if (["I", "II", "III", "IV", "V"].indexOf(String(v.categoria)) < 0) return "Vento: categoria de rugosidade do terreno de I a V (NBR 6123, 5.3.1).";
    if (p.tipo === "vertical" || p.tipo === "elevado") {
      if (!(p.D >= 1.0 && p.D <= 61)) return "Diâmetro do tanque entre 1,0 e 61 m (o método de um pé da API 650 vale até 61 m).";
      if (!(p.H >= 1.0 && p.H <= 30)) return "Altura do costado entre 1,0 e 30 m.";
      if (!(p.bordaLivre >= 0 && p.bordaLivre < p.H - 0.5)) return "Borda livre entre 0 e a altura do costado menos 0,50 m.";
      if (!(p.hMorto >= 0 && p.hMorto < p.H - p.bordaLivre - 0.2)) return "Fundo morto (do fundo à saída) menor que o nível do líquido.";
      if (!TETOS[p.teto]) return "Teto: cônico suportado, cônico autoportante, domo ou aberto.";
      if (p.teto === "conico-autoportante" && !(p.inclTeto >= 9.5 && p.inclTeto <= 37)) return "Teto cônico autoportante: inclinação entre 9,5° e 37° (API 650, 5.10.5).";
      if (p.teto === "conico-suportado" && !(p.inclTeto >= 3.57 && p.inclTeto <= 37)) return "Teto cônico suportado: inclinação de 1:16 (3,6°) a 37° (API 650, 5.10.4.1).";
      if (p.teto === "domo" && !(p.raioDomo >= 0.8 && p.raioDomo <= 1.2)) return "Domo: raio entre 0,8·D e 1,2·D (API 650, 5.10.6).";
      if (p.tipo === "elevado") {
        if (!(p.alturaTorre >= 2 && p.alturaTorre <= 40)) return "Altura da torre (até o fundo da cuba) entre 2 e 40 m.";
        if ([3, 4, 6, 8].indexOf(Math.round(p.pilares)) < 0) return "Torre: 3, 4, 6 ou 8 pilares.";
        if (!(p.D <= 12)) return "Reservatório elevado: diâmetro da cuba até 12 m nesta ferramenta.";
      }
    } else {
      if (!(p.D >= 0.8 && p.D <= 4.5)) return "Tanque horizontal: diâmetro entre 0,8 e 4,5 m.";
      if (!(p.L >= 1.0 && p.L <= 25)) return "Tanque horizontal: comprimento do costado entre 1,0 e 25 m.";
      if (!(p.anguloSela >= 120 && p.anguloSela <= 150)) return "Ângulo de contato da sela entre 120° e 150° (método de Zick).";
      if (!(p.bSela >= 0.1 && p.bSela <= 1.0)) return "Largura da sela entre 0,10 e 1,0 m.";
      if (p.A && !(p.A >= 0.1 && p.A <= 0.25 * p.L)) return "Distância da sela ao tampo entre 0,10 m e L/4.";
    }
    return null;
  }

  /* ============================================================ VENTO
   * V0: o informado ou o do mapa (AcoIsopletas); Vk(z) = V0·S1·S2(z)·S3; q = 0,613·Vk². */
  function vento(p, R, Htot, dimFrontal) {
    var V = Vento(), I = Iso(), v = p.vento || {}, v0 = null, v0Info = null;
    if (fin(v.lat) && fin(v.lon) && I && I.v0) {
      var m = I.v0(v.lat, v.lon);
      if (m && fin(m.v0Adotado)) { v0 = m.v0Adotado; v0Info = m; }
    }
    if (fin(v.v0) && (v0 == null || v.v0Forcado)) { v0 = v.v0; v0Info = { texto: "V0 = " + br(v.v0, 0) + " m/s informado pelo usuário (NBR 6123, 5.1).", informado: true }; }
    if (v0 == null) return { erro: "Sem V0: informe o endereço da obra ou o V0." };
    var s1 = 1, s1Txt = "terreno plano ou fracamente acidentado: S1 = 1,0 (NBR 6123, 5.2-a)";
    if (V && V.fatorS1) { var f1 = V.fatorS1({ tipo: v.s1 || "plano", theta: v.theta, d: v.d, valor: v.s1Valor }, Htot); if (f1 && fin(f1.valor)) { s1 = f1.valor; s1Txt = f1.formula; } }
    var classe = V && V.classePorDimensao ? V.classePorDimensao(Math.max(Htot, dimFrontal)) : (Math.max(Htot, dimFrontal) <= 20 ? "A" : (Math.max(Htot, dimFrontal) <= 50 ? "B" : "C"));
    var s3 = V && V.fatorS3 ? V.fatorS3(v.grupoS3 || 3) : null, S3 = s3 ? s3.valor : 0.95;
    function S2(z) { var f = V && V.fatorS2 ? V.fatorS2(String(v.categoria || "II"), classe, z) : null; return f ? f.valor : 1; }
    function vk(z) { return v0 * s1 * S2(z) * S3; }
    function q(z) { var k = vk(z); return 0.613 * k * k / 1000; }
    return { v0: v0, v0Info: v0Info, s1: s1, s1Texto: s1Txt, classe: classe, categoria: String(v.categoria || "II"), S3: S3, s3: s3, S2: S2, vk: vk, q: q, superficie: v.superficie || "rugoso",
             lat: v.lat, lon: v.lon, ref: "NBR 6123:1988, 4.2 (Vk = V0·S1·S2·S3; q = 0,613·Vk²), 5.1–5.4" };
  }

  /* ============================================================ COSTADO (método de um pé)
   * API 650, 5.6.3.2 (SI): td = 4,9·D·(H − 0,3)·G/Sd + CA  e  tt = 4,9·D·(H − 0,3)/St (mm; D, H em m; S em MPa).
   * H = do fundo do anel até o nível de projeto do líquido. Mínimo por diâmetro: 5.6.1.1. */
  function tMinCostado(D, primeiro) {
    var t = D < 15 ? 5 : (D < 36 ? 6 : (D <= 60 ? 8 : 10)), n4 = primeiro && D > 3.2 && D < 15;
    if (n4) t = 6;
    return { t: t, ref: "API 650, 5.6.1.1 (espessura nominal mínima: D < 15 m → 5 mm; 15 a 36 m → 6 mm; 36 a 60 m → 8 mm; > 60 m → 10 mm" + (n4 ? "; nota 4: 1º anel com 3,2 m < D < 15 m → 6 mm" : "") + ")" };
  }
  function umPe(D, Hl, G, Sd, St, CA) {
    var h = Math.max(0, Hl - 0.3);
    return { td: 4.9 * D * h * G / Sd + CA, tt: 4.9 * D * h / St, h: h };
  }
  function costado(p, R, nivel) {
    var D = p.D, W = p.larguraChapa, n = Math.max(1, Math.ceil(p.H / W - 1e-6)), ad = tensoesAdm(p.aco), tm = tMinCostado(D), aneis = [], tLim = Math.min(45, num((acoDe(p.aco) || {}).tmax, 45));
    if (W < 1.8) R.avisos.push("Chapa do costado com " + br(W * 1000, 0) + " mm de largura: a API 650 (5.6.1.2) pede no mínimo 1.800 mm, salvo acordo com o comprador.");
    for (var i = 0; i < n; i++) {
      tm = tMinCostado(D, i === 0);
      var z0 = i * W, larg = Math.min(W, p.H - z0), Hl = Math.max(0, nivel - z0), u = umPe(D, Hl, p.G, ad.Sd, ad.St, p.CA);
      var treq = Math.max(u.td, u.tt, tm.t), tad = comercial(treq), gov = treq === tm.t ? "mínimo construtivo" : (u.td >= u.tt ? "projeto (produto)" : "teste hidrostático");
      var sigP = Hl > 0.3 && tad - p.CA > 0 ? 4.9 * D * u.h * p.G / (tad - p.CA) : 0, sigT = Hl > 0.3 ? 4.9 * D * u.h / tad : 0;
      var ps = [
        passo("Altura de líquido sobre o pé do anel", "H = nível − cota do pé do anel = " + br(nivel, 3) + " − " + br(z0, 3), br(Hl, 3) + " m"),
        passo("Espessura de projeto (produto)", "td = 4,9·D·(H − 0,3)·G/Sd + CA = 4,9 × " + br(D, 2) + " × " + br(u.h, 3) + " × " + br(p.G, 2) + " / " + br(ad.Sd, 1) + " + " + br(p.CA, 1), br(u.td, 2) + " mm"),
        passo("Espessura do teste hidrostático (água)", "tt = 4,9·D·(H − 0,3)/St = 4,9 × " + br(D, 2) + " × " + br(u.h, 3) + " / " + br(ad.St, 1), br(u.tt, 2) + " mm"),
        passo("Espessura mínima construtiva", tm.ref, br(tm.t, 1) + " mm"),
        passo("Espessura adotada (chapa comercial)", "t ≥ máx(td; tt; tmín) = " + br(treq, 2) + " mm → " + gov, br(tad, 2) + " mm"),
        passo("Limite de espessura do aço", "API 650, 4.2.2 (" + p.aco + ": até " + tLim + " mm) e 4.2.1.4 (costado até 45 mm)", br(tad, 1) + (tad <= tLim + 1e-9 ? " ≤ " : " > ") + tLim + " mm")
      ];
      var razT = Math.max(treq / tad, tad / tLim);
      R.verificacoes.push({ nome: "Costado — anel " + (i + 1), item: "API 650 (texto conferido: 11ª ed.; vigente: 14ª), 5.6.3.2 (método de um pé), 5.6.1.1 e 4.2.2", passos: ps, resistencia: tLim, solicitante: tad, unidade: "mm", razao: razT, ok: razT <= 1 + 1e-9, conferir: true });
      if (tad > tLim + 1e-9 && !R.problemas.some(function (x) { return x.tipo === "espessura"; })) R.problemas.push({ tipo: "espessura", texto: "Costado com " + br(tad, 1) + " mm no anel " + (i + 1) + ": acima do limite de " + tLim + " mm do " + p.aco + " (API 650, 4.2.2 / 4.2.1.4).", solucoes: [{ id: "aco", texto: "Aço de maior resistência (ex.: ASTM A516 Gr 70)" }, { id: "geometria", texto: "Reduzir o diâmetro ou a altura" }] });
      aneis.push({ i: i + 1, z0: r4(z0), largura: r4(larg), Hl: r4(Hl), td: r2(u.td), tt: r2(u.tt), tmin: tm.t, treq: r2(treq), t: tad, governa: gov, sigmaProduto: r1(sigP), sigmaTeste: r1(sigT),
                   massa: r1(PI * D * larg * tad / 1000 * RHO) });
    }
    if (D > 61) R.avisos.push("D > 61 m: a API 650 exige o método do ponto de projeto variável (5.6.4) — não implementado.");
    return { aneis: aneis, n: n, Sd: ad.Sd, St: ad.St, adm: ad, tmin: tMinCostado(D) };
  }

  /* ============================================================ FUNDO
   * API 650, 5.4.1: chapa do fundo com espessura nominal mínima de 6 mm (sem a corrosão);
   * anel anular (5.5.1) quando a tensão no 1º anel passa de 160 MPa (produto) ou 171 MPa
   * (teste) — conferir; espessura pela Tabela 5-1a e largura radial ≥ 600 mm e ≥ 215·ta/√(H·G). */
  var TAB51A = { tmax: [19, 25, 32, 40, 45], sig: [190, 210, 220, 250], t: [[6, 6, 7, 9], [6, 7, 10, 11], [6, 9, 12, 14], [8, 11, 14, 17], [9, 13, 16, 19]], ref: "API 650, Tabela 5-1a (SI) — conferir" };
  function fundo(p, R, cos, nivel) {
    var tb = comercial(6 + p.CAfundo), a1 = cos.aneis[0];
    var ps = [passo("Espessura mínima do fundo", "API 650, 5.4.1: 6 mm + corrosão do fundo (" + br(p.CAfundo, 1) + " mm)", br(6 + p.CAfundo, 1) + " mm"), passo("Chapa comercial adotada", "", br(tb, 2) + " mm")];
    R.verificacoes.push({ nome: "Fundo — espessura", item: "API 650, 5.4.1", passos: ps, resistencia: tb, solicitante: 6 + p.CAfundo, unidade: "mm", razao: (6 + p.CAfundo) / tb, ok: true, conferir: true });
    var grp = (acoDe(p.aco) || {}).grupo || "I", grupoAlto = /^(IV|IVA|V|VI)$/.test(grp);
    var exig = grupoAlto && (a1.sigmaProduto > 160 || a1.sigmaTeste > 171), an = null;
    if (exig) {
      var sigT = Math.max(a1.sigmaProduto, a1.sigmaTeste);
      var ti = 0; TAB51A.tmax.forEach(function (tm, k) { if (!ti && (a1.t - p.CA) <= tm) ti = k + 1; }); ti = (ti || TAB51A.tmax.length) - 1;
      var si = 0; while (si < TAB51A.sig.length - 1 && sigT > TAB51A.sig[si]) si++;
      var ta = Math.max(TAB51A.t[ti][si], 6) + p.CAfundo, taC = comercial(ta), Lr = Math.max(0.6, 0.215 * (taC - p.CAfundo) / Math.sqrt(Math.max(nivel, 0.5) * p.G));
      an = { t: taC, largura: r2(Lr + 0.05 + a1.t / 1000), interna: r3(Lr), ref: TAB51A.ref, conferir: true };
      R.verificacoes.push({ nome: "Fundo — anel anular", item: "API 650, 5.5.1–5.5.3 e Tabela 5-1a", passos: [
        passo("Material do 1º anel", p.aco + " = Grupo " + grp + " (API 650, Tabela 4-4a): Grupos IV a VI pedem anel anular soldado de topo (5.5.1)", "Grupo " + grp),
        passo("Tensões no 1º anel", "produto " + br(a1.sigmaProduto, 1) + " MPa (> 160?) · teste " + br(a1.sigmaTeste, 1) + " MPa (> 171?) — abaixo dos dois o fundo sobreposto seria aceito", "anel anular exigido"),
        passo("Espessura do anel anular", "Tabela 5-1a (t do 1º anel " + br(a1.t - p.CA, 1) + " mm; maior tensão " + br(sigT, 0) + " MPa) + corrosão", br(taC, 2) + " mm"),
        passo("Largura radial interna", "L = máx(600 mm; 215·ta/√(H·G)) = máx(600; 215 × " + br(taC - p.CAfundo, 1) + " / √(" + br(nivel, 2) + " × " + br(p.G, 2) + "))", br(Lr * 1000, 0) + " mm")
      ], resistencia: taC, solicitante: ta, unidade: "mm", razao: ta / taC, ok: true, conferir: true });
      R.decisoes.push({ tema: "Fundo", decisao: "Anel anular de " + br(taC, 1) + " mm, largura " + br(an.largura * 1000, 0) + " mm", motivo: "a tensão no 1º anel passa do limite que a API 650 aceita com o fundo sobreposto (5.5.1)" });
    }
    var proj = 0.05;   /* projeção do fundo para fora do costado: ≥ 50 mm (API 650, 5.4.2) */
    return { t: tb, anular: an, projecao: proj, Dext: r3(p.D + a1.t / 1000 + 2 * proj), ref: "API 650, 5.4 (6 mm corroídos, 5.4.1; projeção ≥ 50 mm, 5.4.2; chapas com largura ≥ 1.800 mm)", inclinacao: "1:120 subindo para o centro, salvo outra indicação (API 650, 5.4.4)" };
  }

  /* ============================================================ TETO */
  function cargaTeto(p, tmm) {
    var DL = (tmm / 1000) * GAMA_ACO + num(p.isolamento, 0), Pe = Math.max(num(p.Pe, 0.25), 0.25);   /* Pe de projeto ≥ 0,25 kPa (API 650, 5.2.1) */
    var T1 = DL + p.Lr + 0.4 * Pe, T2 = DL + Pe + 0.4 * p.Lr, T = Math.max(T1, T2);
    return { DL: DL, T: T, T1: T1, T2: T2, Pe: Pe, texto: "T = máx(DL + Lr + 0,4·Pe; DL + Pe + 0,4·Lr) = máx(" + br(T1, 3) + "; " + br(T2, 3) + ") kPa (API 650, 5.10.2.1 e 5.2.1; Lr = " + br(p.Lr, 2) + " kPa; Pe de projeto = máx(Pe informado " + br(num(p.Pe, 0.25), 2) + "; 0,25) = " + br(Pe, 2) + " kPa)" };
  }
  function cantoneiraTopoMin(D) {
    var nome = D <= 11 ? "L 50×50×5" : (D <= 18 ? "L 50×50×6" : "L 75×75×10"), cat = D <= 11 ? "L51X51X4.8" : (D <= 18 ? "L51X51X6.4" : "L76X76X9.5");
    return { nome: nome, cat: cat, ref: "API 650, 5.1.5.9-e (cantoneira de topo mínima por diâmetro) — conferir", conferir: true };
  }
  function perfilProps(cat) { var P = Perf(); return P && P.obter ? P.obter(cat) : null; }
  /* área participante na junção teto-costado (API 650, Figura F-2): costado 0,6·√(Rc·tc), teto 0,3·√(R2·th), cantoneira */
  /* Fa = menor tensão admissível de tração dos materiais da junção (5.10.3.1: AISC 360, ASD → fy/1,67) */
  function FaJuncao(p) { var a = acoDe(p.aco) || ACOS["ASTM A36"]; return Math.min(a.fy, 250) / 1.67; }
  /* API 650, 5.10.5.2 / 5.10.6.2: A ≥ p·D²/(8·Fa·tg θ) — p em kPa, D em m, Fa em MPa → mm² (× 1000) */
  function areaExigida(pT, D, Fa, th) { return pT * D * D * 1000 / (8 * Fa * Math.tan(th)); }
  function areaJuncao(p, R, tetoT, R2, th, cant, tc) {
    var Rc = p.D / 2 * 1000, wc = 0.6 * Math.sqrt(Rc * tc), wh = Math.min(0.3 * Math.sqrt(R2 * 1000 * th), 300), cp = perfilProps(cant.cat), Ac = cp ? cp.A : 0;
    return { A: wc * tc + wh * th + Ac, wc: wc, wh: wh, Acant: Ac };
  }
  function teto(p, R, cos, V) {
    var D = p.D, Rr = D / 2, tc = cos.aneis[cos.aneis.length - 1].t, cant = cantoneiraTopoMin(D), o = { tipo: p.teto, rotulo: TETOS[p.teto], cantoneira: cant };
    var tm0 = 5 + p.CAteto;
    if (p.teto === "aberto") {
      o.t = 0; o.area = 0; o.massa = 0; o.flecha = 0;
      return o;
    }
    if (p.teto === "conico-autoportante") {
      var th = Math.max(p.inclTeto, 9.5) * PI / 180, s = Math.sin(th), t = tm0, c = null, tr = 0;
      for (var it = 0; it < 4; it++) { c = cargaTeto(p, t); tr = D / (4.8 * s) * Math.sqrt(c.T / 2.2) + p.CAteto; t = comercial(Math.max(tr, tm0)); }
      var ok = tr - p.CAteto <= 13 + 1e-9;
      R.verificacoes.push({ nome: "Teto cônico autoportante — espessura", item: "API 650, 5.10.5.1", passos: [
        passo("Carga de projeto do teto", c.texto, br(c.T, 3) + " kPa"),
        passo("Espessura mínima", "t = máx[D/(4,8·sen θ)·√(T/2,2); D/(5,5·sen θ)·√(U/2,2)] + CA, U = T (sem neve) = " + br(D, 2) + "/(4,8 × sen " + br(p.inclTeto, 1) + "°) × √(" + br(c.T, 3) + "/2,2) + " + br(p.CAteto, 1), br(tr, 2) + " mm"),
        passo("Limites", "5 mm ≤ t (sem CA) ≤ 13 mm", ok ? "dentro" : "acima de 13 mm"), passo("Adotada", "", br(t, 2) + " mm")
      ], resistencia: Math.min(t, 13 + p.CAteto), solicitante: Math.max(tr, tm0), unidade: "mm", razao: Math.max(tr, tm0) / Math.min(t, 13 + p.CAteto), ok: ok, conferir: true });
      if (!ok) R.problemas.push({ tipo: "teto", texto: "Teto cônico autoportante passaria de 13 mm (D = " + br(D, 1) + " m).", solucoes: [{ id: "teto-domo", texto: "Usar domo autoportante" }, { id: "teto-suportado", texto: "Usar teto cônico suportado (caibros + coluna)" }, { id: "inclinar", texto: "Aumentar a inclinação do teto" }] });
      var R2 = Rr / s, rise = Rr * Math.tan(th), sl = Rr / Math.cos(th);
      var Fa = FaJuncao(p), Areq = areaExigida(c.T, D, Fa, th), ab = areaJuncao(p, R, null, R2, t - p.CAteto, cant, tc - p.CA);
      /* se a cantoneira mínima não basta, sobe a cantoneira */
      var candidatas = ["L51X51X4.8", "L51X51X6.4", "L64X64X6.4", "L76X76X6.4", "L76X76X9.5", "L102X102X9.5", "L102X102X12.7", "L127X127X12.7", "L152X152X12.7", "L152X152X15.9"], ci = Math.max(0, candidatas.indexOf(cant.cat));
      while (ab.A < Areq && ci < candidatas.length - 1) { ci++; cant = { nome: candidatas[ci], cat: candidatas[ci], ref: "aumentada para a área participante (API 650, 5.10.5.2)", conferir: true }; ab = areaJuncao(p, R, null, R2, t - p.CAteto, cant, tc - p.CA); }
      o.cantoneira = cant;
      R.verificacoes.push({ nome: "Junção teto-costado — área participante", item: "API 650, 5.10.5.2 e Figura F-2", passos: [
        passo("Área exigida", "A = p·D²/(8·Fa·tg θ) = " + br(c.T, 3) + " kPa × " + br(D, 2) + "² / (8 × " + br(Fa, 1) + " MPa × tg " + br(p.inclTeto, 1) + "°); Fa = fy/1,67 (5.10.3.1, AISC 360 ASD)", br(Areq, 0) + " mm²"),
        passo("Costado participante", "wc = 0,6·√(Rc·tc) = 0,6 × √(" + br(D * 500, 0) + " × " + br(tc - p.CA, 1) + ")", br(ab.wc, 0) + " mm"),
        passo("Teto participante", "wh = 0,3·√(R2·th) ≤ 300 mm, R2 = R/sen θ = " + br(R2, 2) + " m", br(ab.wh, 0) + " mm"),
        passo("Área disponível", "A = wc·tc + wh·th + A(" + cant.nome + ")", br(ab.A, 0) + " mm²")
      ], resistencia: ab.A, solicitante: Areq, unidade: "mm²", razao: Areq / ab.A, ok: Areq <= ab.A, conferir: true });
      o.t = t; o.T = c.T; o.flecha = r3(rise); o.geratriz = r3(sl); o.area = r2(PI * Rr * sl); o.massa = r1(o.area * t / 1000 * RHO); o.theta = p.inclTeto;
      return o;
    }
    if (p.teto === "domo") {
      var Rd = p.raioDomo * D, td2 = tm0, c2 = null, tr2 = 0;
      for (var j = 0; j < 4; j++) { c2 = cargaTeto(p, td2); tr2 = Rd / 2.4 * Math.sqrt(c2.T / 2.2) + p.CAteto; td2 = comercial(Math.max(tr2, tm0)); }
      var ok2 = tr2 - p.CAteto <= 13 + 1e-9, h = Rd - Math.sqrt(Rd * Rd - Rr * Rr), sn = Rr / Rd;
      R.verificacoes.push({ nome: "Domo autoportante — espessura", item: "API 650, 5.10.6.1", passos: [
        passo("Carga de projeto do teto", c2.texto, br(c2.T, 3) + " kPa"),
        passo("Espessura mínima", "t = máx[Rr/2,4·√(T/2,2); Rr/2,7·√(U/2,2)] + CA, U = T (sem neve) = " + br(Rd, 2) + "/2,4 × √(" + br(c2.T, 3) + "/2,2) + " + br(p.CAteto, 1), br(tr2, 2) + " mm"),
        passo("Adotada", "5 mm ≤ t (sem CA) ≤ 13 mm", br(td2, 2) + " mm")
      ], resistencia: Math.min(td2, 13 + p.CAteto), solicitante: Math.max(tr2, tm0), unidade: "mm", razao: Math.max(tr2, tm0) / Math.min(td2, 13 + p.CAteto), ok: ok2, conferir: true });
      if (!ok2) R.problemas.push({ tipo: "teto", texto: "Domo passaria de 13 mm (D = " + br(D, 1) + " m).", solucoes: [{ id: "teto-suportado", texto: "Usar teto cônico suportado com colunas" }] });
      var thD = Math.asin(Math.min(1, Rr / Rd)), Fa2 = FaJuncao(p), Areq2 = areaExigida(c2.T, D, Fa2, thD), cand2 = ["L51X51X4.8", "L51X51X6.4", "L64X64X6.4", "L76X76X6.4", "L76X76X9.5", "L102X102X9.5", "L102X102X12.7", "L127X127X12.7", "L152X152X12.7", "L152X152X15.9"], cj = Math.max(0, cand2.indexOf(cant.cat));
      var ab2 = areaJuncao(p, R, null, Rd, td2 - p.CAteto, cant, tc - p.CA);
      while (ab2.A < Areq2 && cj < cand2.length - 1) { cj++; cant = { nome: cand2[cj], cat: cand2[cj], ref: "aumentada para a área participante (API 650, 5.10.6.2)", conferir: true }; ab2 = areaJuncao(p, R, null, Rd, td2 - p.CAteto, cant, tc - p.CA); }
      o.cantoneira = cant;
      R.verificacoes.push({ nome: "Junção domo-costado — área participante", item: "API 650, 5.10.6 e 5.10.5.2", passos: [
        passo("Área exigida", "A = p·D²/(8·Fa·tg θ), θ = ângulo do domo na borda = " + br(thD * 180 / PI, 1) + "°; Fa = " + br(Fa2, 1) + " MPa", br(Areq2, 0) + " mm²"),
        passo("Área disponível", "costado " + br(ab2.wc, 0) + " mm + teto " + br(ab2.wh, 0) + " mm + " + cant.nome, br(ab2.A, 0) + " mm²")
      ], resistencia: ab2.A, solicitante: Areq2, unidade: "mm²", razao: Areq2 / ab2.A, ok: Areq2 <= ab2.A, conferir: true });
      o.t = td2; o.T = c2.T; o.Rd = r3(Rd); o.flecha = r3(h); o.area = r2(2 * PI * Rd * h); o.massa = r1(o.area * td2 / 1000 * RHO); o.senAbertura = sn;
      return o;
    }
    /* cônico SUPORTADO: chapa de 5 mm + CA (5.10.2.2), caibros espaçados b = t·√(1,5·Fy/p) ≤ 2.100 mm (5.10.4.4), coluna central.
       Caibro (5.10.4.3): peso próprio SEM travamento da mesa pelas chapas; com a sobrecarga, travado pelo atrito se d ≤ 375 mm e inclinação ≤ 1:6 */
    var th3 = Math.max(p.inclTeto, 3.58) * PI / 180, tp = comercial(tm0), c3 = cargaTeto(p, tp), rise3 = Rr * Math.tan(th3), sl3 = Rr / Math.cos(th3);
    var fyTeto = (ACOS["ASTM A36"]).fy, bmax = Math.min(2100, (tp - p.CAteto) * Math.sqrt(1.5 * fyTeto / (c3.T / 1000)));
    var nC = Math.max(4, Math.ceil(PI * D * 1000 / bmax - 1e-9)); nC = Math.ceil(nC / 4) * 4;
    var rCol = 0.35, Lc = Rr - rCol, s0 = PI * D / nC, w0 = c3.T * s0;   /* kN/m no apoio do costado (carga triangular: 0 no centro) */
    var wG = (c3.DL) * s0, wQ = (c3.T - c3.DL) * s0;
    var Mk = function (w) { return w * Lc * Lc / (9 * Math.sqrt(3)); };   /* carga linearmente crescente (máx. no costado): M = w0·L²/(9√3) */
    var Md = 1.25 * Mk(wG) + 1.5 * Mk(wQ), fyC = 345, E = 200000, inclOk = Math.tan(th3) <= 1 / 6 + 1e-9;
    var P = Perf(), lista = P ? P.listar("W").map(function (n) { return P.obter(n); }).filter(function (q) { return q && q.d <= 375 && q.Cw > 0 && q.J > 0; }) : [];
    lista.sort(function (a, b) { return a.massa - b.massa; });
    var esc = null, dl = 0, fl = null;
    function flt(q) {   /* só o peso próprio, mesa SEM travamento: Mcr = Cb·π²·E·Iy/Lb²·√(Cw/Iy·(1 + 0,039·J·Lb²/Cw)) (NBR 8800:2008, Anexo G), Cb = 1 */
      var Lb = Lc * 1000, Mcr = PI * PI * E * q.Iy / (Lb * Lb) * Math.sqrt(q.Cw / q.Iy * (1 + 0.039 * q.J * Lb * Lb / q.Cw)) / 1e6, Mpl = q.Zx * fyC / 1e6;
      var MRd = Math.min(Mpl, 0.7 * Mcr) / 1.10, MdG = 1.25 * Mk(wG + q.massa * G_ACC / 1000);
      return { Mcr: Mcr, MRd: MRd, Md: MdG, ok: MdG <= MRd };
    }
    for (var k2 = 0; k2 < lista.length; k2++) {
      var q2 = lista[k2], MRd = q2.Zx * fyC / 1.10 / 1e6, flecha = 0.01304 * w0 * Math.pow(Lc * 1000, 4) / (E * q2.Ix), f2 = flt(q2);
      if (Md <= MRd && flecha <= Lc * 1000 / 250 && f2.ok) { esc = q2; dl = flecha; fl = f2; break; }
    }
    o.t = tp; o.T = c3.T; o.flecha = r3(rise3); o.geratriz = r3(sl3); o.area = r2(PI * Rr * sl3); o.massa = r1(o.area * tp / 1000 * RHO); o.theta = p.inclTeto;
    o.caibros = { n: nC, espacamento: r3(s0), bmax: r3(bmax / 1000), vao: r3(Lc), perfil: esc ? esc.nome : null, aco: "ASTM A572 Gr.50", massa: esc ? r1(esc.massa * sl3 * nC) : 0 };
    R.verificacoes.push({ nome: "Teto suportado — chapa", item: "API 650, 5.10.2.2", passos: [passo("Espessura mínima", "5 mm + CA do teto", br(tm0, 1) + " mm"), passo("Adotada", "", br(tp, 2) + " mm")], resistencia: tp, solicitante: tm0, unidade: "mm", razao: tm0 / tp, ok: true, conferir: true });
    if (!inclOk) R.avisos.push("Teto suportado com inclinação acima de 1:6: o atrito das chapas não trava os caibros (API 650, 5.10.4.3-c) — a flambagem lateral com a sobrecarga não foi verificada.");
    if (!esc) {
      R.problemas.push({ tipo: "teto", texto: "Nenhum perfil W até 375 mm de altura vence o caibro de " + br(Lc, 2) + " m.", solucoes: [{ id: "teto-domo", texto: "Usar domo autoportante" }, { id: "colunas", texto: "Teto com anel de colunas intermediárias (não gerado — projetar à parte)" }] });
      R.verificacoes.push({ nome: "Caibro do teto suportado", item: "NBR 8800:2008, 5.4.2 (flexão) e API 650, 5.10.4.3", passos: [passo("Momento de cálculo", "Md = 1,25·MG + 1,5·MQ (carga triangular)", br(Md, 2) + " kN·m")], resistencia: 0, solicitante: Md, unidade: "kN·m", razao: Infinity, ok: false });
    } else {
      R.verificacoes.push({ nome: "Caibro do teto suportado (" + esc.nome + ")", item: "API 650, 5.10.4.3 e 5.10.4.4; NBR 8800:2008, 5.4.2 e Anexo G — conferir", passos: [
        passo("Espaçamento máximo dos caibros", "b = t·√(1,5·Fy/p) ≤ 2.100 mm = " + br(tp - p.CAteto, 1) + " × √(1,5 × " + fyTeto + "/" + br(c3.T / 1000, 5) + ")", br(bmax, 0) + " mm"),
        passo("Número de caibros", "n ≥ π·D/b, múltiplo de 4", nC + " caibros a " + br(s0, 3) + " m no costado"),
        passo("Carga no apoio do costado", "w0 = T·s = " + br(c3.T, 3) + " × " + br(s0, 3), br(w0, 3) + " kN/m"),
        passo("Momento de cálculo (carga linearmente crescente)", "Md = (1,25·wG + 1,5·wQ)·L²/(9√3), L = " + br(Lc, 2) + " m", br(Md, 2) + " kN·m"),
        passo("Momento resistente (mesa travada pelo atrito: d ≤ 375 mm" + (inclOk ? ", inclinação ≤ 1:6)" : " — inclinação > 1:6!)"), "MRd = Zx·fy/γa1 = " + br(esc.Zx / 1000, 0) + " cm³ × 345 / 1,10", br(esc.Zx * fyC / 1.10 / 1e6, 2) + " kN·m"),
        passo("Só o peso próprio, mesa sem travamento", "Mcr = π²·E·Iy/Lb²·√(Cw/Iy·(1 + 0,039·J·Lb²/Cw)) = " + br(fl.Mcr, 2) + " kN·m; MRd = mín(Mpl; 0,7·Mcr)/1,10 (a favor da segurança)", br(fl.Md, 2) + " ≤ " + br(fl.MRd, 2) + " kN·m"),
        passo("Flecha (serviço)", "δ = 0,01304·w0·L⁴/(E·I) ≤ L/250", br(dl, 1) + " mm ≤ " + br(Lc * 4, 1) + " mm")
      ], resistencia: esc.Zx * fyC / 1.10 / 1e6, solicitante: Md, unidade: "kN·m", razao: Md / (esc.Zx * fyC / 1.10 / 1e6), ok: true, conferir: true });
      R.decisoes.push({ tema: "Teto", decisao: nC + " caibros " + esc.nome + " (o mais leve que passa)", motivo: "carga do teto " + br(c3.T, 2) + " kPa no vão de " + br(Lc, 2) + " m; espaçamento ≤ " + br(bmax, 0) + " mm pela chapa do teto" });
    }
    /* coluna central: tubo circular, compressão NBR 8800 (λ0, χ) */
    var Ncol = (c3.T * PI * Rr * Rr / 2) * 1.0, Nd = 1.4 * Ncol, Lcol = p.H + rise3, colEsc = null, vr = null;
    var tubos = P ? P.listar("HSSC").map(function (n) { return P.obter(n); }).filter(Boolean) : [];
    tubos.sort(function (a, b) { return a.massa - b.massa; });
    for (var k3 = 0; k3 < tubos.length; k3++) {
      var tb = tubos[k3], cc = compressao(tb, Lcol, 250); if (cc.esb > 180 || tb.D / tb.t > 0.11 * 200000 / 250) continue;
      if (Nd <= cc.NcRd) { colEsc = tb; vr = cc; break; }
    }
    o.coluna = { L: r3(Lcol), N: r2(Ncol), Nd: r2(Nd), perfil: colEsc ? colEsc.nome : null, aco: "ASTM A36", massa: colEsc ? r1(colEsc.massa * Lcol) : 0 };
    if (colEsc) R.verificacoes.push({ nome: "Coluna central (" + colEsc.nome + ")", item: "NBR 8800:2008, 5.3 (compressão) — esbeltez ≤ 180 (API 650, 5.10.3.3 — conferir)", passos: [
      passo("Carga na coluna", "metade da carga do teto (caibros biapoiados): T·π·R²/2", br(Ncol, 1) + " kN"), passo("Força de cálculo", "Nd = 1,4·N", br(Nd, 1) + " kN"),
      passo("Comprimento de flambagem", "L = H + flecha do teto (K = 1)", br(Lcol, 2) + " m"), passo("Esbeltez", "KL/r", br(vr.esb, 0)),
      passo("Índice de esbeltez reduzido", "λ0 = √(A·fy/Ne)", br(vr.l0, 3)), passo("Fator de redução", vr.l0 <= 1.5 ? "χ = 0,658^(λ0²)" : "χ = 0,877/λ0²", br(vr.chi, 3)),
      passo("Resistência", "Nc,Rd = χ·A·fy/1,10", br(vr.NcRd, 1) + " kN")
    ], resistencia: vr.NcRd, solicitante: Nd, unidade: "kN", razao: Nd / vr.NcRd, ok: true });
    else R.problemas.push({ tipo: "teto", texto: "Nenhum tubo do catálogo vence a coluna central (" + br(Nd, 0) + " kN em " + br(Lcol, 1) + " m).", solucoes: [{ id: "teto-domo", texto: "Usar domo autoportante" }] });
    return o;
  }
  /* compressão simples NBR 8800:2008 5.3 (Q = 1) — perfil do catálogo (mm, mm², mm⁴), L em m, fy em MPa */
  function compressao(q, L, fy) {
    var I = Math.min(q.Ix || 0, q.Iy || q.Ix || 0), A = q.A, r = Math.sqrt(I / A), esb = L * 1000 / r, Ne = PI * PI * 200000 * I / Math.pow(L * 1000, 2) / 1000;
    var l0 = Math.sqrt(A * fy / 1000 / Ne), chi = l0 <= 1.5 ? Math.pow(0.658, l0 * l0) : 0.877 / (l0 * l0);
    return { esb: esb, Ne: Ne, l0: l0, chi: chi, NcRd: chi * A * fy / 1.10 / 1000, r: r };
  }

  /* ============================================================ VENTO NO TANQUE + ANÉIS DE CONTRAVENTAMENTO */
  function ventoTanque(p, R, cos, tt, V, base) {
    var D = p.D, H = p.H, z0 = base || 0, Ht = H + (tt.flecha || 0), vkTopo = V.vk(z0 + Ht), Re = 70000 * vkTopo * D;
    var ca = caTabela10(Ht / D, Re, V.superficie);
    /* força horizontal no costado por fatias de 0,5 m (q varia com a altura) */
    var F = 0, M = 0, dz = 0.5;
    for (var z = 0; z < H - 1e-9; z += dz) { var h = Math.min(dz, H - z), zm = z + h / 2, f = ca.Ca * V.q(z0 + zm) * D * h; F += f; M += f * zm; }
    var Ft = 0, Mt = 0;
    if (tt.flecha > 0) { var At = D * tt.flecha / (p.teto === "domo" ? 1.5 : 2), zt = H + tt.flecha / 3; Ft = ca.Ca * V.q(z0 + H + tt.flecha) * At; Mt = Ft * zt; }
    /* sucção no teto: API 650, 5.2.1(k): 1,44 kPa·(V/190)² na projeção horizontal (V em km/h = Vk no topo × 3,6) — a NBR 6123 não tem tabela de teto de cilindro */
    var Vkmh = vkTopo * 3.6, pUp = p.teto === "aberto" ? 0 : 1.44 * Math.pow(Vkmh / 190, 2), Fup = pUp * PI * D * D / 4, Mup = Fup * D / 2;
    var o = { Ca: ca, Re: r1(Re), vkTopo: r3(vkTopo), qTopo: r4(V.q(z0 + Ht)), Fcostado: r2(F), Mcostado: r2(M), Fteto: r2(Ft), Mteto: r2(Mt), pSuccao: r4(pUp), Fsuccao: r2(Fup), Msuccao: r2(Mup),
              F: r2(F + Ft), Mw: r2(M + Mt + Mup), Vkmh: r1(Vkmh) };
    R.verificacoes.push({ nome: "Vento — forças no tanque", item: "NBR 6123:1988, 4.2, 5.1–5.4, 6.3.6 e Tabela 10; sucção no teto: API 650, 5.2.1(k)", passos: [
      passo("Velocidade básica", V.v0Info && V.v0Info.texto ? V.v0Info.texto : "V0", br(V.v0, 1) + " m/s"),
      passo("Fatores", "S1 = " + br(V.s1, 2) + "; S2 pela categoria " + V.categoria + ", classe " + V.classe + " (5.3); S3 = " + br(V.S3, 2) + " (Tabela 3)", "Vk(topo) = " + br(vkTopo, 2) + " m/s"),
      passo("Pressão dinâmica no topo", "q = 0,613·Vk²", br(V.q(z0 + Ht), 3) + " kN/m²"),
      passo("Número de Reynolds", "Re = 70000·Vk·d = 70000 × " + br(vkTopo, 2) + " × " + br(D, 2), br(Re, 0)),
      passo("Coeficiente de arrasto", "Tabela 10, seção circular, h/l1 = " + br(Ht / D, 2) + " (" + ca.texto + ")", "Ca = " + br(ca.Ca, 2)),
      passo("Força no costado", "Fa = Σ Ca·q(z)·D·Δz (fatias de 0,5 m; 6.3.6)", br(F, 1) + " kN"),
      passo("Força no teto (projeção vertical)", "Ca·q·A", br(Ft, 1) + " kN"),
      passo("Sucção no teto", "p = 1,44·(V/190)² kPa, V = " + br(Vkmh, 0) + " km/h; F = p·π·D²/4", br(Fup, 1) + " kN"),
      passo("Momento de tombamento na base do costado", "Mw = Σ F·z + Fsucção·D/2", br(M + Mt + Mup, 1) + " kN·m")
    ], resistencia: null, solicitante: M + Mt + Mup, unidade: "kN·m", razao: 0, ok: true, info: true, conferir: true });
    return o;
  }
  /* API 650, 5.9.7: H1 = 9,47·t·√((t/D)³)·(190/V)² (m; t em mm, D em m, V em km/h); costado transformado Wtr = W·√((tuni/tanel)⁵) */
  function contraventamento(p, R, cos, vt) {
    var D = p.D, V = Math.max(vt.Vkmh, 1), an = cos.aneis, ttopo = an[an.length - 1].t - p.CA;
    var H1 = 9.47 * ttopo * Math.sqrt(Math.pow(ttopo / D, 3)) * Math.pow(190 / V, 2), Htr = 0, trans = [];
    an.slice().reverse().forEach(function (a) { var w = a.largura * Math.sqrt(Math.pow(ttopo / (a.t - p.CA), 5)); trans.push({ anel: a.i, W: a.largura, Wtr: r3(w) }); Htr += w; });
    var nInt = Htr > H1 ? Math.ceil(Htr / H1 - 1e-9) - 1 : 0, aneis = [];
    if (nInt > 5) { R.avisos.push("O costado pediria " + nInt + " anéis intermediários de contraventamento: acima de 5 reveja o tanque (chapas mais grossas no topo, menor diâmetro ou menor altura) — ficaram 5."); R.problemas.push({ tipo: "vento", texto: "Costado muito flexível sob o vento: " + nInt + " anéis intermediários (limite prático 5).", solucoes: [{ id: "topo-grosso", texto: "Engrossar os anéis de cima" }, { id: "reduzir-d", texto: "Reduzir o diâmetro" }] }); nInt = 5; }
    var ps = [
      passo("Velocidade de projeto", "V = Vk no topo × 3,6 (a pressão da fórmula escala com V²)", br(V, 0) + " km/h"),
      passo("Altura máxima não enrijecida", "H1 = 9,47·t·√((t/D)³)·(190/V)² = 9,47 × " + br(ttopo, 2) + " × √((" + br(ttopo, 2) + "/" + br(D, 2) + ")³) × (190/" + br(V, 0) + ")²", br(H1, 2) + " m"),
      passo("Costado transformado", "Wtr = W·√((t_topo/t_anel)⁵), somado do topo para baixo", br(Htr, 2) + " m"),
      passo("Anéis intermediários", Htr > H1 ? "Htr > H1 → n = ⌈Htr/H1⌉ − 1, espaçados igualmente no costado transformado" : "Htr ≤ H1 → dispensados", String(nInt))
    ];
    /* posição: espaçamento igual no transformado, convertido para a altura real */
    for (var k = 1; k <= nInt; k++) {
      var alvo = Htr * k / (nInt + 1), acc = 0, cotaTopo = p.H, zReal = null;
      for (var j = an.length - 1; j >= 0 && zReal == null; j--) {
        var a = an[j], f = Math.sqrt(Math.pow(ttopo / (a.t - p.CA), 5)), wtr = a.largura * f;
        if (acc + wtr >= alvo - 1e-9) zReal = cotaTopo - (alvo - acc) / f;
        acc += wtr; cotaTopo -= a.largura;
      }
      /* afastar de solda horizontal (≥ 150 mm — API 650, 5.9.7.3) */
      var zz = zReal; an.forEach(function (a) { if (Math.abs(zz - a.z0) < 0.15 && a.z0 > 0) zz = a.z0 + (zz >= a.z0 ? 0.15 : -0.15); });
      var Zreq = D * D * H1 / 17 * Math.pow(V / 190, 2);
      aneis.push({ cota: r3(zz), Zreq: r1(Zreq), secao: secaoAnel(Zreq), tipo: "intermediario" });
    }
    if (nInt) R.decisoes.push({ tema: "Anéis de contraventamento", decisao: nInt + " anel(éis) intermediário(s) em " + aneis.map(function (a) { return br(a.cota, 2) + " m"; }).join("; "), motivo: "o costado transformado (" + br(Htr, 2) + " m) passa da altura máxima não enrijecida sob o vento (" + br(H1, 2) + " m)" });
    if (p.teto === "aberto") {
      var H2 = p.H, Zt = D * D * H2 / 17 * Math.pow(V / 190, 2);
      aneis.unshift({ cota: r3(p.H - 0.6), Zreq: r1(Zt), secao: secaoAnel(Zt), tipo: "topo" });
      ps.push(passo("Anel de contraventamento de topo (tanque aberto)", "Z = D²·H2/17·(V/190)² = " + br(D, 2) + "² × " + br(H2, 2) + "/17 × (" + br(V, 0) + "/190)² (API 650, 5.9.6.1)", br(Zt, 1) + " cm³"));
      R.decisoes.push({ tema: "Tanque aberto", decisao: "Anel de contraventamento de topo: " + aneis[0].secao.nome, motivo: "sem teto o topo do costado precisa de anel para não ovalizar sob o vento (API 650, 5.9.6)" });
    }
    aneis.forEach(function (a) { if (a.tipo === "intermediario") ps.push(passo("Anel intermediário a " + br(a.cota, 2) + " m", "Z = D²·H1/17·(V/190)² (5.9.7.6)", br(a.Zreq, 1) + " cm³ → " + a.secao.nome)); });
    aneis.forEach(function (a) { ps.push(passo("Largura × espessura do anel a " + br(a.cota, 2) + " m", "b ≤ 16·t dispensa suportes (API 650, 5.9.5 — conferir)", "b/t = " + br(a.secao.b / a.secao.t, 1) + (a.secao.suportes ? " > 16" : " ≤ 16")));
      if (a.secao.suportes) R.naoVerificado.push("Anel de contraventamento a " + br(a.cota, 2) + " m (" + a.secao.nome + "): b/t > 16 — suportes do anel (API 650, 5.9.5) não dimensionados"); });
    R.verificacoes.push({ nome: "Costado sob vento — anéis de contraventamento", item: "API 650, 5.9.6 e 5.9.7", passos: ps, resistencia: H1, solicitante: Htr / (nInt + 1), unidade: "m", razao: Htr / (nInt + 1) / H1, ok: Htr / (nInt + 1) <= H1 * (1 + 1e-9), conferir: true });
    return { H1: r3(H1), Htr: r3(Htr), transformado: trans, n: nInt, aneis: aneis, V: V };
  }
  /* seção do anel: chapa horizontal (largura b, espessura t) — Z = t·b²/6 sem a ajuda do costado (a favor da segurança) */
  function secaoAnel(Zcm3) {
    var tts = [6.3, 8.0, 9.5, 12.5, 16.0, 19.0, 22.4, 25.0], best = null;
    tts.forEach(function (t) { var b = Math.sqrt(6 * Zcm3 * 1000 / t); b = Math.max(100, Math.ceil(b / 25) * 25); var m = b * t; if (b <= 16 * t && (!best || m < best.m)) best = { t: t, b: b, m: m }; });
    if (!best) tts.forEach(function (t) { var b = Math.sqrt(6 * Zcm3 * 1000 / t); b = Math.max(100, Math.ceil(b / 25) * 25); var m = b * t; if (b <= 1000 && (!best || m < best.m)) best = { t: t, b: b, m: m }; });
    if (!best) { var t2 = 12.5, b2 = Math.ceil(Math.sqrt(6 * Zcm3 * 1000 / t2) / 25) * 25; best = { t: t2, b: b2, m: b2 * t2 }; }
    return { nome: "chapa " + best.b + " × " + String(best.t).replace(".", ",") + " mm", b: best.b, t: best.t, suportes: best.b > 16 * best.t, Z: r1(best.t * best.b * best.b / 6 / 1000), ref: "Z = t·b²/6, sem a contribuição do costado (a favor da segurança)" };
  }

  /* ============================================================ ESTABILIDADE, ANCORAGEM, DESLIZAMENTO (API 650, 5.11 e 5.12) */
  function estabilidade(p, R, cos, fd, tt, vt, pesos) {
    var D = p.D, nivel = p.H - p.bordaLivre, acF = acoDe(p.aco), tb = Math.min((fd.anular ? fd.anular.t : fd.t) - p.CAfundo, cos.aneis[0].t - p.CA);
    var Wsh = pesos.costado + pesos.aneis + pesos.cantoneira + pesos.acessCostado, Wrf = pesos.teto + (pesos.caibros || 0) * 0.5;
    var MDL = Wsh * D / 2, MDLR = Wrf * D / 2;
    var wL = Math.min(59 * tb * Math.sqrt(acF.fy * nivel), 140.8 * nivel * D) / 1000;   /* kN/m */
    var MF = (D / 2) * wL * PI * D, Mw = vt.Mw;
    var c1L = 0.6 * Mw, c1R = MDL / 1.5 + MDLR, c2L = Mw, c2R = (MDL + MF) / 2 + MDLR;
    var ok1 = c1L < c1R, ok2 = c2L < c2R, FatPre = 0.4 * Math.max(0, pesos.total - vt.Fsuccao), deslPre = vt.F > FatPre;
    var anc = p.ancoragem === "sempre" || (p.ancoragem !== "nunca" && (!(ok1 && ok2) || deslPre));
    R.verificacoes.push({ nome: "Tombamento sob vento (tanque sem ancoragem)", item: "API 650, 5.11.2", passos: [
      passo("Momento do peso do costado (e do que ele carrega)", "MDL = W·D/2 = " + br(Wsh, 1) + " × " + br(D / 2, 3), br(MDL, 1) + " kN·m"),
      passo("Momento do peso do teto", "MDLR = Wteto·D/2", br(MDLR, 1) + " kN·m"),
      passo("Peso do líquido que resiste (por metro de costado)", "faixa de líquido junto ao costado com G = 0,7 e altura H/2: wL = 59·tb·√(Fby·H) ≤ 140,8·H·D (tb = fundo corroído sob o costado, ≤ 1º anel corroído) = 59 × " + br(tb, 1) + " × √(" + br(acF.fy, 0) + " × " + br(nivel, 2) + ")", br(wL, 2) + " kN/m"),
      passo("Momento do líquido", "MF = (D/2)·wL·π·D", br(MF, 1) + " kN·m"),
      passo("Critério 1", "0,6·Mw < MDL/1,5 + MDLR → " + br(c1L, 1) + " < " + br(c1R, 1), ok1 ? "atende" : "não atende"),
      passo("Critério 2", "Mw < (MDL + MF)/2 + MDLR → " + br(c2L, 1) + " < " + br(c2R, 1), ok2 ? "atende" : "não atende")
    ], resistencia: Math.min(c1R / 0.6, c2R), solicitante: Mw, unidade: "kN·m", razao: anc ? 0 : Math.max(c1L / c1R, c2L / c2R), ok: (ok1 && ok2) || anc, info: anc, conferir: true });
    if (!(ok1 && ok2) && !anc) R.problemas.push({ tipo: "tombamento", texto: "O tanque sem ancoragem não atende ao tombamento sob o vento (API 650, 5.11.2) e a ancoragem foi recusada.", solucoes: [{ id: "ancorar", texto: "Ancorar (chumbadores)" }, { id: "geometria", texto: "Tanque mais baixo e mais largo" }] });
    /* deslizamento: atrito 0,4 com o tanque vazio (API 650, 5.11.4 — conferir) */
    /* deslizamento: 0,40 × a força contra o fundo = peso do tanque vazio MENOS o levantamento do vento no teto (5.11.4) */
    var Wvazio = pesos.total, Fcontra = Math.max(0, Wvazio - vt.Fsuccao), Fat = 0.4 * Fcontra, desl = vt.F > Fat;
    /* W2 da Tabela 5-21a: costado e teto CORROÍDOS (o teto suportado só pela parcela que apoia no costado) */
    var sup = !!(R.teto && R.teto.caibros), W2 = 0;
    cos.aneis.forEach(function (a) { W2 += PI * D * a.largura * Math.max(0, a.t - p.CA) / 1000 * RHO * G_ACC / 1000; });
    W2 += pesos.cantoneira + pesos.aneis + (R.teto && R.teto.t > 0 ? pesos.teto * Math.max(0, R.teto.t - p.CAteto) / R.teto.t : 0) * (sup ? 0.5 : 1) + (pesos.caibros || 0) * (sup ? 0.5 : 0);
    var o = { MDL: r1(MDL), MDLR: r1(MDLR), wL: r3(wL), MF: r1(MF), Mw: r1(Mw), criterio1: ok1, criterio2: ok2, ancorado: anc, deslizamento: !desl, W2: r1(W2) };
    if (anc) o.chumbadores = chumbadores(p, R, vt, W2, desl);
    var razD = desl ? (anc && o.chumbadores ? o.chumbadores.razaoCisal : vt.F / Fat) : vt.F / Fat;
    R.verificacoes.push({ nome: "Deslizamento sob vento (tanque vazio)", item: "API 650, 5.11.4 (atrito máximo 0,40 da força contra o fundo)", passos: [
      passo("Força horizontal do vento", "F", br(vt.F, 1) + " kN"),
      passo("Força contra o fundo", "peso do tanque vazio − levantamento do vento no teto = " + br(Wvazio, 1) + " − " + br(vt.Fsuccao, 1), br(Fcontra, 1) + " kN"),
      passo("Atrito resistente", "0,40 × força contra o fundo", br(Fat, 1) + " kN"),
      passo("Se o atrito não vence", desl ? (anc ? "cortante nos chumbadores, verificado na ancoragem (interação tração + cisalhamento)" : "tanque sem ancoragem: desliza") : "o atrito vence", desl ? (anc ? "razão " + br(razD, 3) : "desliza") : "não desliza")
    ], resistencia: 1, solicitante: razD, unidade: "", razao: razD, ok: razD <= 1 + 1e-9, conferir: true });
    if (desl && !anc) R.problemas.push({ tipo: "deslizamento", texto: "O vento faz o tanque vazio deslizar (atrito 0,40) e a ancoragem foi recusada.", solucoes: [{ id: "ancorar", texto: "Ancorar (chumbadores)" }] });
    if (anc) R.decisoes.push({ tema: "Ancoragem", decisao: o.chumbadores ? o.chumbadores.n + " chumbadores " + o.chumbadores.nome + " no círculo de " + br(o.chumbadores.dc, 2) + " m" : "ancorar", motivo: p.ancoragem === "sempre" ? "pedida pelo usuário" : ((ok1 && ok2) ? "o atrito (0,40 da força contra o fundo, descontada a sucção do teto) não vence o vento — API 650, 5.11.4" : "o tanque sem ancoragem não atende " + (!ok1 ? "o critério 1 " : "") + (!ok2 ? "o critério 2 " : "") + "do tombamento (API 650, 5.11.2)") });
    else R.decisoes.push({ tema: "Ancoragem", decisao: "Tanque sem chumbadores (só guias de montagem)", motivo: "os dois critérios de tombamento sob vento atendem com folga e o atrito vence o deslizamento" });
    return o;
  }
  /* chumbadores em polegada (UNC): área da RAIZ (a tensão admissível da API 650 vale na área líquida de raiz — Tabela 5-21a) */
  var CHUMB = [{ nome: "Ø 1\" (25,4 mm)", d: 25.4, Ar: 355 }, { nome: "Ø 1 1/4\" (31,8 mm)", d: 31.75, Ar: 574 }, { nome: "Ø 1 1/2\" (38,1 mm)", d: 38.1, Ar: 835 }, { nome: "Ø 1 3/4\" (44,5 mm)", d: 44.45, Ar: 1125 }, { nome: "Ø 2\" (50,8 mm)", d: 50.8, Ar: 1484 }];
  function chumbadores(p, R, vt, Wdead, desl) {
    var D = p.D, dc = D + 0.3, n = Math.max(4, Math.ceil(PI * dc / 3.0 - 1e-9)); n = Math.ceil(n / 4) * 4;
    /* levantamento no vento (Tabela 5-21a): U = PWR·π·D²/4 + 4·MWH/D − W2 (W2 = peso do costado e do teto corroídos — 90 % do nominal, a favor da segurança) */
    var MWH = vt.Mcostado + vt.Mteto, U = Math.max(0, vt.Fsuccao + 4 * MWH / D - Wdead), fy = 250, adm = 0.8 * fy, dmin = 25.4 + num(p.CA, 0);
    /* o chumbador sai já pela TRAÇÃO (0,8·fy na raiz) E pelo CORTANTE com a interação (quando o atrito não vence): o menor
       diâmetro que passa nas duas; se nenhum passa, mais chumbadores (de 4 em 4, até 3 × o mínimo).
       Cortante: NBR 8800:2008, 6.3.3.2/6.3.3.4 com 1,4 nas forças — (Td/FtRd)² + (Vd/FvRd)² ≤ 1 (conferir) */
    function avalia(nn, c) { var tb = U / nn, vb = desl ? vt.F / (nn / 2) : 0, ab = PI * c.d * c.d / 4, ft = 0.75 * ab * 400 / 1.35 / 1000, fv = 0.4 * ab * 400 / 1.35 / 1000;
      return { tB: tb, Vb: vb, sig: tb * 1000 / c.Ar, FtRd: ft, FvRd: fv, inter: desl ? Math.pow(1.4 * tb / ft, 2) + Math.pow(1.4 * vb / fv, 2) : 0 }; }
    var esc = null, av = null, n0 = n;
    for (var nn = n0; nn <= 3 * n0 && !esc; nn += 4) for (var i = 0; i < CHUMB.length; i++) { if (CHUMB[i].d < dmin - 1e-9) continue; var a2 = avalia(nn, CHUMB[i]); if (a2.sig <= adm && a2.inter <= 1 + 1e-9) { esc = CHUMB[i]; av = a2; n = nn; break; } }
    if (!esc) { esc = CHUMB[CHUMB.length - 1]; n = 3 * n0; av = avalia(n, esc); }
    var tB = av.tB, Vb = av.Vb, sig = av.sig, FtRd = av.FtRd, FvRd = av.FvRd, razaoCisal = av.inter;
    R.verificacoes.push({ nome: "Chumbadores (" + n + " × " + esc.nome + ", " + p.acoChumbador + ")", item: "API 650, 5.12 (mínimo 4, espaçamento ≤ 3 m, Ø ≥ 1\" + corrosão) e Tabela 5-21a (vento: 0,8·fy na área de raiz)", passos: [
      passo("Número", "n ≥ π·dc/3 m, mínimo 4, múltiplo de 4; dc = D + 0,30 m = " + br(dc, 2) + " m" + (n > n0 ? "; aumentado para passar na interação tração + cortante" : ""), String(n)),
      passo("Levantamento no vento", "U = PWR·π·D²/4 + 4·MWH/D − W2 (W2 = costado e teto apoiado, corroídos) = " + br(vt.Fsuccao, 1) + " + 4 × " + br(MWH, 1) + "/" + br(D, 2) + " − " + br(Wdead, 1), br(U, 1) + " kN"),
      passo("Tração por chumbador", "tB = U/n", br(tB, 1) + " kN"),
      passo("Diâmetro", "≥ 1\" (25,4 mm) + corrosão " + br(num(p.CA, 0), 1) + " mm; o menor que passa na tração e na interação tração + cortante", br(dmin, 1) + " mm → " + esc.nome),
      passo("Tensão na raiz", "σ = tB/Ar (Ar = " + esc.Ar + " mm²) ≤ 0,8·fy = " + br(adm, 0) + " MPa", br(sig, 1) + " MPa"),
      passo("Cisalhamento (se o atrito não vence)", desl ? "V = F/(n/2) por chumbador; (1,4·tB/Ft,Rd)² + (1,4·V/Fv,Rd)² ≤ 1, Ft,Rd = " + br(FtRd, 1) + " kN, Fv,Rd = " + br(FvRd, 1) + " kN" : "o atrito vence: sem cisalhamento nos chumbadores", desl ? br(Vb, 1) + " kN → " + br(razaoCisal, 3) : "—")
    ], resistencia: adm, solicitante: sig, unidade: "MPa", razao: Math.max(sig / adm, razaoCisal), ok: sig <= adm && razaoCisal <= 1 + 1e-9, conferir: true });
    R.naoVerificado.push("Cadeira de ancoragem no costado e tensão local no costado (API 650, 5.12.10; admissível 170 MPa no vento — Tabela 5-21a) e ancoragem do chumbador no concreto (projeto de fundação)");
    /* 1.2.149 (revisão, CRÍTICO): a cadeira de ancoragem e a tensão local no costado (5.12.10) e a ancoragem do chumbador no
       concreto NÃO são calculadas aqui — todo tanque ANCORADO fica INCOMPLETO (o fck não tira esta pendência); antes saía
       "aprovado — todas as verificações feitas atendem" com elas só no "não verificado" */
    R.incompleto = "cadeira de ancoragem (API 650, 5.12.10) e ancoragem no concreto pelo projeto de fundação";
    R.problemas.push({ tipo: "ancoragem-tanque", critico: true, texto: "INCOMPLETO — " + R.incompleto + ": não calculadas aqui (" + n + " × " + esc.nome + ", tração " + br(tB, 1) + " kN" + (desl ? " e cortante " + br(Vb, 1) + " kN" : "") + " por chumbador).",
      solucoes: [{ id: "cadeira", texto: "Detalhar e verificar a cadeira de ancoragem e a tensão local no costado (API 650, 5.12.10; admissível da Tabela 5-21a) com a tração por chumbador deste memorial" },
                 { id: "fundacao", texto: "Dimensionar a ancoragem do chumbador no concreto no projeto de fundação com a tração e o cortante por chumbador deste memorial" }] });
    /* 1.2.149 (revisão de 15/10): tanque ANCORADO sem o fck da base → a mesma pendência CRÍTICA da torre (fck-fundacao): não aprova */
    if (!(num(p.fckFundacao, 0) > 0) || p.fckFundacaoReferencia) {
      R.aConfirmar = "fck do concreto da fundação (ancoragem do chumbador no concreto)";
      R.problemas.push({ tipo: "fck-fundacao", critico: true, texto: "A CONFIRMAR: chumbadores do tanque — falta o fck do concreto da fundação: ancoragem do chumbador no concreto não verificada (" + n + " × " + esc.nome + ", tração " + br(tB, 1) + " kN por chumbador).",
        solucoes: [{ id: "fck", texto: "Informe o fck do concreto da base do tanque (campo \"fck do concreto da fundação\") e detalhe a ancoragem no projeto de fundação" }] });
    }
    return { n: n, dc: r3(dc), nome: esc.nome, d: esc.d, U: r2(U), tB: r2(tB), V: r2(Vb), razaoCisal: r3(razaoCisal), aco: p.acoChumbador, ancoragem: "cadeira de ancoragem no costado (API 650, 5.12.10 — detalhar)" };
  }

  /* ============================================================ SISMO (NBR 15421) */
  function sismo(p, R) {
    var z = Math.round(num(p.sismo && p.sismo.zona, 0));
    if (z <= 0) { R.decisoes.push({ tema: "Sismo", decisao: "Verificação sísmica dispensada (zona sísmica 0)", motivo: "NBR 15421: na zona 0 (ag ≤ 0,025·g) nenhum requisito de resistência sísmica é exigido — a maior parte do território brasileiro (texto de 2006; edição vigente 2023 — conferir o item e o mapa)" }); return { zona: 0, dispensado: true, ref: "NBR 15421:2006 (zona 0, categoria A) — conferir na 2023" }; }
    if (z === 1) R.avisos.push("Zona sísmica 1: a NBR 15421 (2006) pede forças horizontais mínimas Fx = 0,01·wx nas duas direções; a edição de 2006 excluía tanques do escopo (vale a API 650, Anexo E).");
    R.naoVerificado.push("Sismo (zona " + z + "): efeitos hidrodinâmicos (impulsivo/convectivo) pela API 650 Anexo E e NBR 15421 — exige estudo específico");
    R.problemas.push({ tipo: "sismo", texto: "Zona sísmica " + z + ": a verificação sísmica do tanque é obrigatória e não foi feita aqui.", solucoes: [{ id: "anexo-e", texto: "Fazer a verificação sísmica (API 650, Anexo E / NBR 15421) em estudo específico" }] });
    R.avisos.push("Zona sísmica " + z + ": a verificação sísmica do tanque (massa impulsiva e convectiva) NÃO foi feita.");
    return { zona: z, dispensado: false };
  }

  /* ============================================================ FUNDAÇÃO (valores característicos por caso) */
  function fundacao(p, R, pesos, vt, est, nivel) {
    var D = p.D, per = PI * D, gL = 9.81 * p.G, area = PI * D * D / 4;
    var G_lin = (pesos.costado + pesos.aneis + pesos.cantoneira + pesos.acessCostado + pesos.teto * (pesos.caibros ? 0.5 : 1) + (pesos.caibros || 0) * 0.5) / per;
    var o = {
      tipo: p.fundacao === "radier" ? "radier" : "anel",
      G: { linha: r2(G_lin), fundo: r3((pesos.fundo + (pesos.anular || 0)) / area), colunaCentral: pesos.colunaCarga ? r1(pesos.colunaCarga) : 0, total: r1(pesos.total), texto: "peso próprio (costado, teto, anéis, acessórios) por metro de anel; fundo por m²" },
      L: { pressao: r2(gL * nivel), total: r1(gL * nivel * area), texto: "líquido de projeto (G = " + br(p.G, 2) + ", nível " + br(nivel, 2) + " m) — sobre o fundo" },
      T: { pressao: r2(9.81 * nivel), total: r1(9.81 * nivel * area), texto: "teste hidrostático com água até o nível de projeto" },
      W: { M: r1(vt.Mw), V: r1(vt.F), linhaMax: r2(4 * vt.Mw / (PI * D * D)), succaoTeto: r1(vt.Fsuccao), texto: "vento: momento na base, cortante e variação da carga de linha ±4·M/(π·D²)" },
      chumbadores: est && est.chumbadores ? { n: est.chumbadores.n, tracao: est.chumbadores.tB, cortante: est.chumbadores.V, dc: est.chumbadores.dc } : null,
      nota: "Valores CARACTERÍSTICOS por caso (G, L, T, W): combinar pela NBR 8681 e dimensionar a base pela NBR 6122 (projeto de fundação). Base " + (p.fundacao === "radier" ? "em radier" : "anelar sob o costado, com aterro compactado e camada de areia/asfalto sob o fundo") + "."
    };
    return o;
  }

  /* ============================================================ ACESSÓRIOS (parâmetros, massa e área — o 3D sai do js/metaltanque.js) */
  function bocaisPadrao(p, vol) {
    var dn = vol <= 50 ? 50 : (vol <= 500 ? 100 : (vol <= 5000 ? 200 : 300)), pr = PRODUTOS[p.produto] || {};
    if (p.tipo === "horizontal") p = { tipo: p.tipo, H: p.D, bordaLivre: 0.05 * p.D, hMorto: 0.15, teto: "horizontal" };
    var l = [{ id: "entrada", nome: "Entrada", dn: dn, onde: "costado", cota: Math.max(0.3, p.H - p.bordaLivre - 0.3), ang: 30 },
             { id: "saida", nome: "Saída", dn: dn, onde: "costado", cota: Math.max(0.25, p.hMorto), ang: 150 },
             { id: "dreno", nome: "Dreno", dn: 50, onde: "costado", cota: 0.15, ang: 210 }];
    if (pr.agua) l.push({ id: "ladrao", nome: "Ladrão (extravasor)", dn: dn, onde: "costado", cota: Math.max(0.3, p.H - p.bordaLivre + 0.05), ang: 60 });
    if (p.teto !== "aberto") l.push({ id: "respiro", nome: "Respiro", dn: Math.max(50, dn), onde: "teto", raio: 0.25, ang: 0 });
    return l;
  }
  function acessorios(p, R, vol, tt) {
    var a = p.acessorios || {}, D = p.D, H = p.H, out = { itens: [], massa: 0, area: 0 }, G = ACESSO;
    var esc = a.escada === "auto" || !a.escada ? (H > 6 && D >= 6 ? "helicoidal" : "marinheiro") : a.escada;
    if (p.tipo === "horizontal" && esc === "helicoidal") esc = "marinheiro";
    out.escada = esc;
    if (a.escada === "auto" || !a.escada) R.decisoes.push({ tema: "Acesso ao teto", decisao: esc === "helicoidal" ? "Escada helicoidal no costado" : (esc === "marinheiro" ? "Escada de marinheiro com gaiola" : "Sem escada"), motivo: esc === "helicoidal" ? "tanque alto (H > 6 m) e largo (D ≥ 6 m): a escada inclinada é mais segura para subir com ferramenta" : "tanque baixo ou estreito: a escada de marinheiro ocupa menos e atende à NR-12 com gaiola" });
    function add(nome, kg, m2, extra) { var it = { nome: nome, massa: r1(kg), area: r2(m2) }; Object.keys(extra || {}).forEach(function (k) { it[k] = extra[k]; }); out.itens.push(it); out.massa += kg; out.area += m2; return it; }
    var Hacesso = p.tipo === "horizontal" ? p.D + p.alturaSela : H;
    if (esc === "helicoidal") {
      /* degrau sem espelho: h = 0,20 m e g = 0,24 m → g + 2h = 0,64 m (600 a 660 mm); patamar de 0,80 m a cada 3,00 m de altura (NR-12, Anexo III, item 11) */
      var larg = Math.max(num(a.larguraEscada, 0.8), G.escada.larguraMin), e = 0.20, gd = 0.24, ang = Math.atan(e / gd) * 180 / PI, n = Math.ceil(Hacesso / e), nPat = Math.max(0, Math.ceil(Hacesso / G.escada.patamarCada - 1e-9) - 1);
      var Lh = n * Math.sqrt(e * e + gd * gd) + nPat * 0.8, kg = 2 * Lh * 17.1 + n * larg * gd * 0.00635 * RHO * 1.2 + nPat * 0.8 * larg * 40 + Lh * 2 * 3 * 2.0 * 4.0;
      add("Escada helicoidal", kg, Lh * 2 * 0.6 + n * larg * gd * 2 + Lh * 6 * 0.15, { degraus: n, espelho: e, piso: gd, angulo: r1(ang), largura: larg, comprimento: r2(Lh), patamares: nPat, patamarComp: 0.8, voltas: r3((n * gd + nPat * 0.8) / (PI * (D + 2 * 0.05 + larg))) });
      R.verificacoes.push({ nome: "Escada helicoidal — geometria", item: G.escada.fonte, passos: [
        passo("Degrau", "altura h = " + br(e * 100, 0) + " cm (≤ " + br(G.escada.alturaMax * 100, 0) + " cm); profundidade g = " + br(gd * 100, 0) + " cm (≥ " + br(G.escada.profundidadeMin * 100, 0) + " cm)", n + " degraus"),
        passo("Regra do passo", "600 ≤ g + 2h ≤ 660 mm → " + br(gd * 1000, 0) + " + 2 × " + br(e * 1000, 0), br((gd + 2 * e) * 1000, 0) + " mm"),
        passo("Inclinação", "tg α = h/g (faixa de " + G.escada.anguloMin + "° a " + G.escada.anguloMax + "° — Figura 1, conferir)", br(ang, 1) + "°"),
        passo("Plataformas de descanso", "a cada " + br(G.escada.patamarCada, 2) + " m de altura, largura ≥ " + br(G.escada.patamarLargura, 2) + " m", nPat + " patamar(es) de 0,80 m"),
        passo("Largura", "≥ " + br(G.escada.larguraMin, 2) + " m (NR-12) e ≥ " + br(G.api650.escadaLarguraMin, 2) + " m (API 650)", br(larg, 2) + " m"),
        passo("Guarda-corpo do lado de fora", G.guardaCorpo.fonte, br(G.guardaCorpo.altura, 2) + " m + 0,70 m + rodapé 0,20 m")
      ], resistencia: G.escada.gMais2hMax, solicitante: gd + 2 * e, unidade: "m", razao: (gd + 2 * e) / G.escada.gMais2hMax, ok: (gd + 2 * e) >= G.escada.gMais2hMin && e <= G.escada.alturaMax && larg >= G.escada.larguraMin, conferir: true });
    } else if (esc === "marinheiro") {
      var M = G.marinheiro, Hm = Hacesso, gaiola = Hm > M.gaiolaAcima, nLan = Hm > M.lanceUnico ? Math.ceil(Hm / M.lanceMulti - 1e-9) : 1, nd = Math.ceil(Hm / 0.30);
      var kgm = 2 * (Hm + 1.1) * 6.3 + nd * 0.45 * 3.85 + (gaiola ? (Math.ceil((Hm + 1.1 - M.gaiolaDesde) / 1.2) * 2.2 * 4.5 + 5 * (Hm + 1.1 - M.gaiolaDesde) * 2.4) : 0) + (nLan - 1) * 60;
      add("Escada de marinheiro" + (gaiola ? " com gaiola" : ""), kgm, (Hm + 1.1) * 2 * 0.15 + nd * 0.45 * 0.08 + (gaiola ? (Hm - 1) * 1.2 : 0), { altura: r2(Hm), prolongamento: 1.10, degraus: nd, passo: 0.30, largura: 0.45, barra: 0.025, gaiola: gaiola, gaiolaDesde: M.gaiolaDesde, diamGaiola: 0.70, arcos: 1.20, afastamento: 0.20, lances: nLan });
      R.verificacoes.push({ nome: "Escada de marinheiro — geometria", item: M.fonte, passos: [
        passo("Altura a vencer", "do piso ao topo; os montantes passam 1,10 m acima (item 13-d)", br(Hm, 2) + " m"),
        passo("Gaiola", "obrigatória acima de " + br(M.gaiolaAcima, 2) + " m, a partir de " + br(M.gaiolaDesde, 2) + " m do piso; Ø de " + br(M.diamGaiolaMin, 2) + " a " + br(M.diamGaiolaMax, 2) + " m; barras verticais a ≤ 0,30 m e arcos a ≤ 1,50 m (13.1)", gaiola ? "com gaiola Ø 0,70 m, arcos a 1,20 m" : "dispensada"),
        passo("Degraus", "espaçamento de " + br(M.espDegrauMin, 2) + " a " + br(M.espDegrauMax, 2) + " m; 1º a ≤ 0,55 m do piso; barra de 25 a 38 mm; largura de " + br(M.larguraMin, 2) + " a " + br(M.larguraMax, 2) + " m; ≥ 0,15 m da estrutura", nd + " degraus Ø 25 mm a 0,30 m, largura 0,45 m, a 0,20 m do costado"),
        passo("Lances", "lance único até " + br(M.lanceUnico, 0) + " m; acima, lances de até " + br(M.lanceMulti, 0) + " m com plataforma de descanso (13-f/g)", nLan > 1 ? nLan + " lances" : "lance único")
      ], resistencia: nLan > 1 ? M.lanceMulti : M.lanceUnico, solicitante: Hm / nLan, unidade: "m", razao: Hm / nLan / (nLan > 1 ? M.lanceMulti : M.lanceUnico), ok: true, conferir: false });
      if (nLan > 1) R.decisoes.push({ tema: "Escada de marinheiro", decisao: nLan + " lances com plataformas de descanso", motivo: "altura de " + br(Hm, 1) + " m passa do lance único de 10 m (NR-12, Anexo III, item 13-f)" });
    }
    if (a.plataforma !== false && !(a.passarelaAnel && p.tipo !== "horizontal")) {   /* a passarela em volta faz o papel da plataforma */
      var Lp = p.tipo === "horizontal" ? Math.min(2.0, p.L * 0.5) : 1.5, Bp = 0.9, kgp = Lp * Bp * 30 + 2 * (Lp + Bp) * 4 * 2.0 + 4 * 1.1 * 4.0;
      add("Plataforma de topo com guarda-corpo", kgp, Lp * Bp * 1.5 + 2 * (Lp + Bp) * 0.6, { comprimento: Lp, largura: Bp, guarda: G.guardaCorpo.altura });
    }
    if (a.passarelaAnel && p.tipo !== "horizontal") {
      var Pa = ACESSO.plataforma, wP = Math.max(num(a.larguraPassarela, 0.8), Pa.larguraMin), Rm = D / 2 + 0.05 + wP / 2, Lp2 = 2 * PI * Rm, kgPa = Lp2 * wP * 30 + 2 * PI * (D / 2 + 0.05 + wP) * (2 * 4.0 + 0.2 * 0.003 * RHO) + Math.ceil(Lp2 / 1.5) * (1.1 * 4.0 + 2 * wP * 6.1);
      add("Passarela em volta do topo (manutenção)", kgPa, Lp2 * wP * 1.5 + Lp2 * 0.6, { largura: wP, perimetro: r2(Lp2), cota: num(a.cotaPassarela, 0) > 0 ? num(a.cotaPassarela, 0) : null });
      R.verificacoes.push({ nome: "Passarela em volta — geometria", item: Pa.fonte + "; " + ACESSO.guardaCorpo.fonte, passos: [passo("Largura útil", "≥ " + br(Pa.larguraMin, 2) + " m", br(wP, 2) + " m"), passo("Guarda-corpo do lado de fora", "travessão a 1,10 m, intermediário a 0,70 m, rodapé 0,20 m", "em todo o perímetro (" + br(Lp2, 1) + " m)")],
        resistencia: wP, solicitante: Pa.larguraMin, unidade: "m", razao: Pa.larguraMin / wP, ok: wP >= Pa.larguraMin, conferir: false });
      R.naoVerificado.push("Passarela em volta: consoles e grade pela carga de uso (dimensionar pelo fabricante da grade e pela NBR 8800)");
    }
    if (a.guardaCorpoTeto !== false && p.tipo !== "horizontal" && p.teto !== "aberto") {
      var arco = Math.min(PI * D * 0.25, 12), kgg = arco * (3 * 4.0) + Math.ceil(arco / 1.5) * 1.1 * 4.0;
      add("Guarda-corpo no teto (trecho de acesso)", kgg, arco * 0.6, { arco: r2(arco), altura: G.guardaCorpo.altura });
    }
    var boc = a.bocais === "auto" || !Array.isArray(a.bocais) ? bocaisPadrao(p, vol) : a.bocais;
    out.bocais = boc;
    boc.forEach(function (b) { var dn = num(b.dn, 100) / 1000, kgb = PI * dn * 0.3 * 0.006 * RHO + PI / 4 * Math.pow(dn + 0.12, 2) * 0.02 * RHO; add("Bocal " + b.nome + " DN " + b.dn, kgb, PI * dn * 0.3 * 2); });
    if (a.bocaVisitaCostado && p.tipo === "vertical") add("Boca de visita no costado DN 600", 180, 2.5, { dn: 600 });
    if (a.bocaVisitaTeto) add("Boca de visita no teto DN 600", 90, 1.5, { dn: 600 });
    if (a.indicadorNivel) add("Indicador de nível (régua externa com boia)", 25 + Hacesso * 3, Hacesso * 0.2);
    if (!(boc.some(function (b) { return b.id === "respiro"; })) && p.teto !== "aberto" && p.tipo !== "horizontal") R.naoVerificado.push("Respiro: sem bocal de respiro informado");
    R.naoVerificado.push(p.tipo === "horizontal" ? "Bocais: diâmetros de PARTIDA (o processo define a vazão); reforço das aberturas do tanque horizontal não verificado" : "Bocais: diâmetros de PARTIDA (o processo define a vazão) — o reforço e os afastamentos estão verificados (API 650, 5.7)");
    R.naoVerificado.push("Respiro / alívio de pressão e vácuo: dimensionar pela API 2000 (8ª ed., conferir) / ISO 28300 com as vazões de enchimento e esvaziamento (NR-13, 13.7.2.1: dispositivo conforme o código de construção)");
    out.massa = r1(out.massa); out.area = r2(out.area);
    return out;
  }

  /* ============================================================ FABRICAÇÃO: PLANO DE CHAPAS DO COSTADO
   * cada anel: n chapas iguais (π·D/n ≤ comprimento comercial), cortadas da chapa comercial; juntas verticais
   * DEFASADAS entre anéis vizinhos de 1/3 da chapa — a API 650, 5.1.5.2-b, pede no mínimo 5·t (t do anel mais grosso
   * no ponto) e juntas de topo com penetração total (5.1.5.2-a). Chapas comerciais: catálogo industrial (frente C)
   * quando carregado; senão 2.440 × 6.000 mm (larguras de 1.000 a 2.440 mm e comprimentos de 2, 3, 6 e 12 m —
   * catálogo de chapas grossas ArcelorMittal, conferir com o fornecedor). */
  function comprimentosChapa() {
    var C = Cat(), l = null;
    try { var ch = C && C.chapas ? C.chapas() : null; l = ch && ch.chapaGrossa && ch.chapaGrossa.comprimentos_mm ? ch.chapaGrossa.comprimentos_mm.arcelormittal_LTQ : null; } catch (e) { l = null; }
    l = arr(l).map(function (v) { return num(v, NaN) / 1000; }).filter(function (v) { return v >= 1.5 && v <= 15; });
    return l.length ? { lista: l, fonte: "catálogo industrial (chapa grossa, comprimentos de estoque)" } : { lista: [2, 3, 6, 12], fonte: "chapa grossa: comprimentos de 2, 3, 6 e 12 m (catálogo ArcelorMittal — conferir com o fornecedor)" };
  }
  function planoChapas(p, R, cos) {
    var D = p.D, Lc = PI * D, Lp = num(p.comprimentoChapa, 6), cm = comprimentosChapa(), aneis = [], minOff = Infinity, piorReq = 0;
    var n = Math.max(1, Math.ceil(Lc / Lp - 1e-9)), Lpl = Lc / n, dAng = 360 / n;
    cos.aneis.forEach(function (a, i) {
      var off = (i % 3) * dAng / 3, juntas = []; for (var k = 0; k < n; k++) juntas.push(r3(off + dAng * k));
      aneis.push({ i: a.i, t: a.t, largura: a.largura, n: n, comprimento: r3(Lpl), chapaComercial: r3(Lp) + " × " + r3(a.largura), sobra: r3(Lp - Lpl), juntas: juntas, defasagem: r3(off) });
      if (i > 0) {
        var prev = aneis[i - 1], dmin = Infinity;
        juntas.forEach(function (ja) { prev.juntas.forEach(function (jb) { var d = Math.abs(ja - jb) % 360; d = Math.min(d, 360 - d); if (d < dmin) dmin = d; }); });
        var arco = dmin * PI / 180 * D / 2 * 1000, req = 5 * Math.max(a.t, prev.t); if (arco < minOff) { minOff = arco; piorReq = req; }
      }
    });
    if (aneis.length > 1) R.verificacoes.push({ nome: "Plano de chapas — juntas verticais defasadas", item: "API 650, 5.1.5.2-a/b (juntas verticais de topo com penetração total, defasadas no mínimo 5·t entre anéis vizinhos)", passos: [
      passo("Chapas por anel", "n = ⌈π·D/L⌉ = ⌈" + br(Lc, 3) + "/" + br(Lp, 2) + "⌉, chapas iguais de π·D/n", n + " chapas de " + br(Lpl * 1000, 0) + " mm"),
      passo("Defasagem entre anéis", "1/3 da chapa (" + br(dAng / 3, 2) + "°) — arco mínimo entre juntas de anéis vizinhos", br(minOff, 0) + " mm"),
      passo("Mínimo exigido", "5·t do anel mais grosso no ponto", br(piorReq, 0) + " mm")
    ], resistencia: minOff, solicitante: piorReq, unidade: "mm", razao: piorReq / minOff, ok: minOff >= piorReq, conferir: false });
    return { aneis: aneis, n: n, comprimento: r3(Lpl), comprimentoComercial: Lp, comprimentos: cm.lista, fonte: cm.fonte, ref: "API 650, 5.1.5.2" };
  }

  /* ============================================================ REFORÇO DE ABERTURAS (API 650, 5.7 e 5.8)
   * Tabela 5-6a (SI), 11ª ed.: NPS → OD do pescoço, tn (espessura mínima do pescoço), DR (furo na chapa de reforço),
   * Do (lado/diâmetro da chapa de reforço), J (costado → face do flange), HN (altura mínima do centro, tipo regular) */
  var T56A = {
    2: { OD: 60.3, tn: 5.54, DR: 63, Do: 0, J: 150, HN: 175 }, 3: { OD: 88.9, tn: 7.62, DR: 92, Do: 265, J: 175, HN: 239 }, 4: { OD: 114.3, tn: 8.56, DR: 117, Do: 305, J: 175, HN: 259 },
    6: { OD: 168.3, tn: 10.97, DR: 171, Do: 400, J: 200, HN: 306 }, 8: { OD: 219.1, tn: 12.7, DR: 222, Do: 485, J: 200, HN: 349 }, 10: { OD: 273.0, tn: 12.7, DR: 276, Do: 585, J: 225, HN: 399 },
    12: { OD: 323.8, tn: 12.7, DR: 327, Do: 685, J: 225, HN: 449 }, 14: { OD: 355.6, tn: 12.7, DR: 359, Do: 750, J: 250, HN: 481 }, 16: { OD: 406.4, tn: 12.7, DR: 410, Do: 850, J: 250, HN: 531 },
    18: { OD: 457.2, tn: 12.7, DR: 460, Do: 950, J: 250, HN: 581 }, 20: { OD: 508.0, tn: 12.7, DR: 511, Do: 1055, J: 275, HN: 634 }, 24: { OD: 609.6, tn: 12.7, DR: 613, Do: 1255, J: 300, HN: 734 },
    ref: "API 650 (11ª ed.), Tabela 5-6a-(SI) — conferir na 14ª" };
  var DN_NPS = { 50: 2, 80: 3, 100: 4, 150: 6, 200: 8, 250: 10, 300: 12, 350: 14, 400: 16, 450: 18, 500: 20, 600: 24 };
  function npsDe(dn) { var k = DN_NPS[Math.round(num(dn, 100))]; if (k) return k; var best = 2, bd = Infinity; Object.keys(DN_NPS).forEach(function (d) { var e = Math.abs(+d - num(dn, 100)); if (e < bd) { bd = e; best = DN_NPS[d]; } }); return best; }
  /* área: A exigida = d·t_req (5.7.2.1); disponível na faixa de d acima e abaixo do centro (5.7.2.3): excesso do costado,
     pescoço (4·tn para fora + a espessura do costado, 5.7.2.4) e chapa de reforço. Neck ASTM A106 Gr B (fy 240, fu 415). */
  function reforco(o) {
    var d = o.d, t = o.t, treq = o.treq, tn = o.tn, CA = o.CA || 0, Sd = o.Sd, fNeck = Math.min(1, Math.min(2 / 3 * 240, 2 / 5 * 415) / Sd);
    var Areq = d * treq, Acos = d * Math.max(0, t - treq), tnE = Math.max(0, tn - CA), Aneck = 2 * tnE * (4 * tn + t) * fNeck;
    var esp = espessuras(), tpad = 0, Do = 0, Apad = 0, dR = o.DR || d, i;
    if (Acos + Aneck < Areq) {
      var cands = esp.filter(function (x) { return x >= t - 1e-9 && x <= 2 * t + 1e-9; }); if (!cands.length) cands = [t];
      var Dos = [Math.max(o.Do || 0, dR + 50), dR + d];
      outer: for (var j = 0; j < Dos.length; j++) for (i = 0; i < cands.length; i++) {
        var w = Math.min((Dos[j] - dR) / 2, d / 2), A = 2 * w * (cands[i] - CA * 0);
        if (Acos + Aneck + A >= Areq) { tpad = cands[i]; Do = Dos[j]; Apad = A; break outer; }
        tpad = cands[i]; Do = Dos[j]; Apad = A;
      }
    }
    return { Areq: Areq, Acos: Acos, Aneck: Aneck, Apad: Apad, Adisp: Acos + Aneck + Apad, tpad: tpad, Do: Do, fNeck: fNeck, ok: Acos + Aneck + Apad >= Areq - 1e-6 };
  }
  function aberturas(p, R, cos, tt, plano) {
    var lst = [], D = p.D, Rmm = D / 2 * 1000, an = cos.aneis, Sd = cos.Sd, decis = [], probs = 0;
    arr(R.acessorios && R.acessorios.bocais).forEach(function (b) { lst.push({ ref: b, id: b.id, nome: "Bocal " + b.nome, dn: num(b.dn, 100), onde: b.onde || "costado", ang: num(b.ang, 0), cota: num(b.cota, 0.3), visita: false }); });
    var ac = p.acessorios || {};
    if (ac.bocaVisitaCostado && p.tipo === "vertical") lst.push({ id: "visita-costado", nome: "Boca de visita do costado", dn: 600, onde: "costado", ang: 330, cota: 0.75, visita: true });
    if (ac.bocaVisitaTeto && p.teto !== "aberto") lst.push({ id: "visita-teto", nome: "Boca de visita do teto", dn: 600, onde: "teto", visita: true });
    var costado = lst.filter(function (x) { return x.onde === "costado"; });
    function anelDe(z) { for (var i = 0; i < an.length; i++) if (z >= an[i].z0 - 1e-9 && z <= an[i].z0 + an[i].largura + 1e-9) return an[i]; return an[an.length - 1]; }
    /* geometria da abertura no costado (mm) */
    function geo(x) {
      var nps = npsDe(x.dn), tb = x.visita ? null : T56A[nps], a = anelDe(x.cota), t = a.t;
      var tn = x.visita ? Math.max(10, t) : (tb ? tb.tn : 12.7), OD = x.visita ? 600 + 2 * tn : tb.OD, DR = x.visita ? OD + 3 : tb.DR;
      var treq = Math.max(a.td, a.tt), rf = (x.visita || nps > 2) ? reforco({ d: DR, t: t, treq: treq, tn: tn, CA: p.CA, Sd: Sd, DR: DR, Do: x.visita ? T56A[24].Do : tb.Do }) : null;
      var tp = rf && rf.tpad ? rf.tpad : 0, w = tp ? Math.max(5, Math.min(Math.round(Math.min(tp, t)), 40)) : Math.max(5, Math.round(Math.min(tn, t))), rToe = (tp ? rf.Do / 2 : OD / 2) + w;
      return { nps: nps, tb: tb, anel: a, t: t, tn: tn, OD: OD, DR: DR, treq: treq, rf: rf, tpad: tp, w: w, rToe: rToe };
    }
    function reqA(g) { return g.t > 12.5 ? Math.max(8 * g.w, 250) : 150; }
    function reqB(g) { return g.t > 12.5 ? Math.max(8 * g.w, 250) : Math.max(75, 2.5 * g.t); }
    function reqE(g1, g2) { var tt2 = Math.max(g1.t, g2.t), ww = Math.max(g1.w, g2.w); return tt2 > 12.5 ? Math.max(8 * ww, 150) : Math.max(75, 2.5 * tt2); }
    function distVert(x, g) { var pa = (plano && plano.aneis[g.anel.i - 1]) || null; if (!pa) return Infinity; var dm = Infinity; pa.juntas.forEach(function (j) { var d = Math.abs(x.ang - j) % 360; d = Math.min(d, 360 - d); dm = Math.min(dm, d); }); return dm * PI / 180 * Rmm - g.rToe; }
    /* folga até a junta horizontal (ou o fundo) mais próxima, já descontada a exigida: a do fundo, para abertura sem
       chapa de reforço, é 75 mm do pé da solda ao pé da solda costado-fundo (5.7.3.3) */
    function folgaHor(x, g) { var z = x.cota * 1000, z0 = g.anel.z0 * 1000, z1 = (g.anel.z0 + g.anel.largura) * 1000, rb = reqB(g), rc = g.anel.z0 > 0 ? rb : (g.tpad ? rb : 75 + 8);
      return Math.min(z - z0 - g.rToe - rc, z1 - z - g.rToe - rb); }
    function distHor(x, g) { var z = x.cota * 1000, z0 = g.anel.z0 * 1000, z1 = (g.anel.z0 + g.anel.largura) * 1000; return Math.min(z - z0, z1 - z) - g.rToe; }
    function distE(x1, g1, x2, g2) { var da = Math.abs(x1.ang - x2.ang) % 360; da = Math.min(da, 360 - da); var s = da * PI / 180 * Rmm, dz = (x1.cota - x2.cota) * 1000; return Math.sqrt(s * s + dz * dz) - g1.rToe - g2.rToe; }
    /* posicionar: altura mínima (Tabela 5-6a, HN) e afastamento das juntas e das outras aberturas (5.7.3) — o sistema gira/sobe a abertura */
    costado.forEach(function (x, ix) {
      var g = geo(x), hn = x.visita ? 0.75 : (g.tb ? g.tb.HN / 1000 : 0.3);
      if (x.cota < hn - 1e-9) { decis.push(x.nome + ": centro subiu de " + br(x.cota, 3) + " para " + br(hn, 3) + " m (altura mínima HN da Tabela 5-6a)"); x.cota = hn; g = geo(x); }
      var okPos = function (xa, ga) { if (distVert(xa, ga) < reqA(ga) - 1e-6) return false; if (folgaHor(xa, ga) < -1e-6) return false;
        for (var k = 0; k < ix; k++) { var xb = costado[k], gb = geo(xb); if (distE(xa, ga, xb, gb) < reqE(ga, gb) - 1e-6) return false; } return true; };
      if (!okPos(x, g)) {
        var a0 = x.ang, z0 = x.cota, achou = false;
        /* 1) sobe/desce dentro do anel para fugir das juntas horizontais; 2) gira para fugir das verticais e das outras aberturas */
        /* alturas: a pedida e, a partir dela, de 5 em 5 cm para cima e para baixo dentro do anel (a mais perto da pedida que cabe) */
        var zs = [z0], zb = Math.max(hn, g.anel.z0), zt = g.anel.z0 + g.anel.largura;
        for (var dz = 0.05; dz < g.anel.largura; dz += 0.05) { if (z0 + dz <= zt) zs.push(r3(z0 + dz)); if (z0 - dz >= zb) zs.push(r3(z0 - dz)); }
        for (var zi = 0; zi < zs.length && !achou; zi++) for (var da = 0; da <= 60 && !achou; da += 1) for (var sg = -1; sg <= 1 && !achou; sg += 2) {
          var xt = { ang: ((a0 + sg * da) % 360 + 360) % 360, cota: zs[zi], dn: x.dn, visita: x.visita }; var gt = geo(xt);
          if (okPos(xt, gt)) { x.ang = r1(xt.ang); x.cota = r3(xt.cota); achou = true; }
        }
        if (achou && (Math.abs(x.ang - a0) > 1e-6 || Math.abs(x.cota - z0) > 1e-6)) decis.push(x.nome + ": de " + br(a0, 0) + "° / " + br(z0, 2) + " m para " + br(x.ang, 0) + "° / " + br(x.cota, 2) + " m (afastar das juntas do costado e das outras aberturas — 5.7.3)");
        if (!achou) { probs++; R.problemas.push({ tipo: "abertura", texto: x.nome + ": não cabe com os afastamentos da 5.7.3 no anel " + g.anel.i + ".", solucoes: [{ id: "insert", texto: "Usar chapa de inserção (insert plate) ou mudar a abertura de anel" }] }); }
      }
      if (x.ref) { x.ref.ang = x.ang; x.ref.cota = x.cota; }
    });
    /* verificações (áreas, soldas e afastamentos) */
    var saida = [];
    costado.forEach(function (x, ix) {
      var g = geo(x), rf = g.rf, ps = [], ok = true, razao = 0;
      ps.push(passo("Posição", "anel " + g.anel.i + " (t = " + br(g.t, 1) + " mm); centro a " + br(x.cota, 3) + " m, " + br(x.ang, 0) + "°", "NPS " + (x.visita ? "24 (DN 600)" : g.nps)));
      if (!rf) ps.push(passo("Reforço", "abertura até NPS 2: dispensada (5.7.2.1)", "sem chapa"));
      else {
        ps.push(passo("Área exigida", "A = d·t_req = " + br(g.DR, 0) + " × " + br(g.treq, 2) + " (t_req = máx(td; tt) no anel — 5.7.2.1)", br(rf.Areq, 0) + " mm²"));
        ps.push(passo("Excesso do costado", "(t − t_req)·d = (" + br(g.t, 1) + " − " + br(g.treq, 2) + ") × " + br(g.DR, 0) + " (5.7.2.3-d)", br(rf.Acos, 0) + " mm²"));
        ps.push(passo("Pescoço", "2·(tn − CA)·(4·tn + t)·f, tn = " + br(g.tn, 2) + " mm" + (x.visita ? " (boca de visita: tn ≥ máx(10 mm; t) adotado — conferir Tabela 5-4a)" : " (Tabela 5-6a)") + ", f = " + br(rf.fNeck, 3) + " (A106 Gr B — 5.7.2.3-e, 5.7.2.4)", br(rf.Aneck, 0) + " mm²"));
        ps.push(passo("Chapa de reforço", rf.tpad ? "Ø " + br(rf.Do, 0) + " × " + br(rf.tpad, 1) + " mm (efetiva até d/2 de cada lado do furo — 5.7.2.3)" : "não precisa (costado e pescoço bastam)", br(rf.Apad, 0) + " mm²"));
        ps.push(passo("Área disponível", "costado + pescoço + chapa", br(rf.Adisp, 0) + " mm² ≥ " + br(rf.Areq, 0)));
        ok = ok && rf.ok; razao = Math.max(razao, rf.Areq / Math.max(rf.Adisp, 1e-9));
        /* soldas: pescoço–costado com penetração total (5.7.2.2); periferia da chapa pela força da chapa (5.7.2.6) */
        ps.push(passo("Solda pescoço–costado", "penetração total através do costado e da chapa de reforço (5.7.2.2)", "penetração total"));
        if (rf.tpad) {
          var Fpad = rf.Apad * Sd / 1000, cap = 0.49 * Sd * g.w * (PI * rf.Do / 2) / 1000, capN = 0.49 * Sd * Math.min(g.tn, rf.tpad) * (PI * g.OD / 2) / 1000, Fn = rf.Aneck * Sd / 1000;
          ps.push(passo("Solda da periferia da chapa", "F = A_chapa·Sd = " + br(Fpad, 1) + " kN ≤ 0,49·Sd·w·(π·Do/2), filete w = mín(tchapa; t) = " + g.w + " mm (5.7.2.6; fator 0,49 de cisalhamento do filete da ASME VIII-1 UW-15 como referência — conferir)", br(cap, 1) + " kN"));
          ps.push(passo("Solda chapa–pescoço", "F = A_pescoço·Sd = " + br(Fn, 1) + " kN ≤ 0,49·Sd·mín(tn; tchapa)·(π·OD/2) (5.7.2.5)", br(capN, 1) + " kN"));
          ok = ok && Fpad <= cap && Fn <= capN; razao = Math.max(razao, Fpad / cap, Fn / capN);
        }
      }
      var dV = distVert(x, g), dH = distHor(x, g), rA = reqA(g), rB = reqB(g), fH = folgaHor(x, g);
      if (g.anel.z0 === 0 && !g.tpad && x.cota * 1000 - g.rToe < g.anel.largura * 500) rB = Math.min(rB, 83);
      ps.push(passo("Afastamento das juntas verticais", "do pé da solda à junta mais próxima do anel ≥ " + (g.t > 12.5 ? "máx(8·w; 250 mm)" : "150 mm") + " (5.7.3.1-a / 5.7.3.2)", br(dV, 0) + " ≥ " + br(rA, 0) + " mm"));
      ps.push(passo("Afastamento das juntas horizontais / do fundo", "≥ " + (g.t > 12.5 ? "máx(8·w; 250 mm)" : "máx(75 mm; 2,5·t)") + "; sem chapa, do fundo: 75 mm até o pé da solda costado-fundo (5.7.3.1 a 5.7.3.3)", br(dH, 0) + " mm (folga " + br(fH, 0) + " mm)"));
      var dEmin = Infinity, rE = 0; costado.forEach(function (y, iy) { if (iy === ix) return; var gy = geo(y), dd = distE(x, g, y, gy); if (dd < dEmin) { dEmin = dd; rE = reqE(g, gy); } });
      if (isFinite(dEmin)) ps.push(passo("Afastamento entre aberturas", "pé a pé ≥ " + (g.t > 12.5 ? "máx(8·w; 150 mm)" : "máx(75 mm; 2,5·t)") + " (5.7.3.1-b / 5.7.3.2)", br(dEmin, 0) + " ≥ " + br(rE, 0) + " mm"));
      var okE = !isFinite(dEmin) || dEmin >= rE - 1e-6;
      ok = ok && dV >= rA - 1e-6 && fH >= -1e-6 && okE;
      razao = Math.max(razao, rA / Math.max(dV, 1e-9), fH >= 0 ? (dH > 0 ? (dH - fH) / dH : 1) : 1 + Math.abs(fH) / 100, isFinite(dEmin) ? rE / Math.max(dEmin, 1e-9) : 0);
      R.verificacoes.push({ nome: "Abertura — " + x.nome + (x.visita ? "" : " DN " + x.dn), item: "API 650, 5.7.2 (reforço), 5.7.3 (afastamentos) e Tabela 5-6a", passos: ps, resistencia: 1, solicitante: razao, unidade: "", razao: razao, ok: ok, conferir: true });
      saida.push({ id: x.id, nome: x.nome, onde: "costado", dn: x.dn, nps: g.nps, ang: r1(x.ang), cota: r3(x.cota), anel: g.anel.i, t: g.t, tn: r2(g.tn), OD: r1(g.OD), furo: r1(g.DR), reforco: rf && rf.tpad ? { Do: r1(rf.Do), t: rf.tpad, solda: g.w } : null, Areq: rf ? r1(rf.Areq) : 0, Adisp: rf ? r1(rf.Adisp) : 0, ok: ok });
    });
    /* teto: até NPS 6 sem chapa (Tabela 5-14a, nota a); maiores e a boca de visita pela área com t_req do teto */
    lst.filter(function (x) { return x.onde === "teto"; }).forEach(function (x) {
      if (!(tt && tt.t > 0)) return;
      var nps = npsDe(x.dn), ps = [], ok = true, razao = 0, dp = x.visita ? 625 : (T56A[nps] ? T56A[nps].OD + 6 : num(x.dn, 100) + 10), tR = Math.max(5, (tt.t || 5) - p.CAteto), out = null;
      if (!x.visita && nps <= 6) ps.push(passo("Reforço", "bocal de teto até NPS 6: chapa de reforço não exigida (Tabela 5-14a, nota a)", "sem chapa"));
      else {
        var rf = reforco({ d: dp, t: tt.t, treq: tR, tn: x.visita ? 6 : (T56A[nps] ? T56A[nps].tn : 6), CA: p.CAteto, Sd: Sd, DR: dp, Do: 2 * dp });
        ps.push(passo("Furo no teto", x.visita ? "Dp = 625 mm (Tabela 5-13a, boca de visita de 600 mm; pescoço ≥ 6 mm)" : "Dp ≈ OD do pescoço", br(dp, 0) + " mm"));
        ps.push(passo("Área exigida", "A = Dp·t_req do teto = " + br(dp, 0) + " × " + br(tR, 2), br(rf.Areq, 0) + " mm²"));
        ps.push(passo("Área disponível", "excesso do teto + pescoço + chapa " + (rf.tpad ? "Ø " + br(rf.Do, 0) + " × " + br(rf.tpad, 1) + " mm" : "(não precisa)"), br(rf.Adisp, 0) + " mm²"));
        ok = rf.ok; razao = rf.Areq / Math.max(rf.Adisp, 1e-9); out = rf.tpad ? { Do: r1(rf.Do), t: rf.tpad, solda: Math.max(5, Math.round(0.7 * rf.tpad)) } : null;
      }
      R.verificacoes.push({ nome: "Abertura — " + x.nome + (x.visita ? "" : " DN " + x.dn), item: x.visita ? "API 650, 5.8.4 e Tabela 5-13a; reforço pela área (critério da 5.7.2 aplicado ao teto — conferir)" : "API 650, 5.8.5.6 e Tabela 5-14a", passos: ps, resistencia: 1, solicitante: razao, unidade: "", razao: razao, ok: ok, conferir: true });
      saida.push({ id: x.id, nome: x.nome, onde: "teto", dn: x.dn, nps: nps, furo: r1(dp), reforco: out, ok: ok });
    });
    decis.forEach(function (d) { R.decisoes.push({ tema: "Aberturas", decisao: d, motivo: "API 650, Tabela 5-6a e 5.7.3" }); });
    return { lista: saida, problemas: probs, tabela: T56A.ref };
  }

  /* MAPA DE SOLDAS: comprimento por tipo de junta (a lista do quantitativo + as aberturas) */
  function mapaSoldas(q, ab) {
    var tipos = {}, ordem = [];
    function add(tipo, m, item) { if (!(m > 0)) return; if (!tipos[tipo]) { tipos[tipo] = { tipo: tipo, m: 0, itens: [] }; ordem.push(tipo); } tipos[tipo].m += m; tipos[tipo].itens.push(item); }
    arr(q.solda).forEach(function (s) {
      var tp = /juntas verticais|juntas horizontais|longitudinais|circunferenciais|juntas radiais/.test(s.item) ? "Topo, penetração total" : (/Costado-fundo|Tampo-costado/.test(s.item) ? "Filete dos dois lados" : (/sobrepostas|Teto — juntas/.test(s.item) ? "Filete de junta sobreposta" : "Filete"));
      add(tp, s.m, s.item);
    });
    arr(ab && ab.lista).forEach(function (a) {
      var od = (a.OD || a.furo || 100) / 1000;
      add("Penetração total (pescoço–costado/teto)", PI * od, a.nome);
      if (a.reforco) { add("Filete (chapa de reforço)", PI * a.reforco.Do / 1000 + PI * od, a.nome); }
    });
    var tot = 0; ordem.forEach(function (k) { tipos[k].m = r1(tipos[k].m); tot += tipos[k].m; });
    return { tipos: ordem.map(function (k) { return tipos[k]; }), total: r1(tot) };
  }

  /* ============================================================ QUANTITATIVO (chapas, solda, pintura) */
  function linhasChapa(D, W, Lp) {
    /* chapas de largura W em faixas paralelas cobrindo um círculo de diâmetro D (corte em arco): nº de chapas por faixa */
    var n = Math.ceil(D / W - 1e-9), tot = 0, faixas = [];
    for (var i = 0; i < n; i++) { var y0 = -D / 2 + i * W, y1 = Math.min(D / 2, y0 + W), ym = Math.abs(y0) < Math.abs(y1) ? y0 : y1; if (y0 < 0 && y1 > 0) ym = 0; var corda = 2 * Math.sqrt(Math.max(0, D * D / 4 - ym * ym)); var k = Math.ceil(corda / Lp - 1e-9); faixas.push({ corda: r3(corda), chapas: k }); tot += k; }
    return { faixas: faixas, total: tot };
  }
  function quantitativo(p, R, cos, fd, tt, ct, ac, est) {
    var D = p.D, W = p.larguraChapa, Lp = p.comprimentoChapa, chapas = [], solda = [], pint = [];
    var porAnel = Math.ceil(PI * D / Lp - 1e-9);
    cos.aneis.forEach(function (a) { chapas.push({ item: "Costado — anel " + a.i, t: a.t, L: Lp, B: a.largura, qtd: porAnel, massa: r1(a.massa), obs: "calandrada (Ø " + br(D, 2) + " m)" }); });
    var lf = linhasChapa(fd.Dext, W, Lp);
    chapas.push({ item: "Fundo", t: fd.t, L: Lp, B: W, qtd: lf.total, massa: r1(PI * fd.Dext * fd.Dext / 4 * fd.t / 1000 * RHO), obs: "sobreposta; recorte em arco" });
    if (fd.anular) { var nA = Math.ceil(PI * D / Lp - 1e-9); chapas.push({ item: "Fundo — anel anular", t: fd.anular.t, L: Lp, B: fd.anular.largura, qtd: nA, massa: r1(PI * D * fd.anular.largura * fd.anular.t / 1000 * RHO), obs: "segmentos soldados de topo" }); }
    if (tt.t > 0) { var dev = tt.area, lt = Math.ceil(dev * 1.12 / (Lp * W) - 1e-9); chapas.push({ item: "Teto (" + tt.rotulo + ")", t: tt.t, L: Lp, B: W, qtd: lt, massa: r1(tt.massa), obs: "área desenvolvida " + br(dev, 1) + " m² + 12 % de recorte" }); }
    ct.aneis.forEach(function (a, i) { chapas.push({ item: "Anel de contraventamento " + (a.tipo === "topo" ? "de topo" : (i + 1)), t: a.secao.t, L: Lp, B: a.secao.b / 1000, qtd: Math.ceil(PI * (D + a.secao.b / 1000) / Lp - 1e-9), massa: r1(PI * (D + a.secao.b / 1000) * a.secao.b / 1000 * a.secao.t / 1000 * RHO), obs: "segmentos curvos" }); });
    /* soldas (m) */
    var nAn = cos.aneis.length;
    solda.push({ item: "Costado — juntas verticais (topo, penetração total)", m: r1(porAnel * p.H) });
    if (nAn > 1) solda.push({ item: "Costado — juntas horizontais (topo, penetração total)", m: r1((nAn - 1) * PI * D) });
    solda.push({ item: "Costado-fundo (filete dos dois lados)", m: r1(2 * PI * D) });
    solda.push({ item: "Fundo — juntas sobrepostas (filete)", m: r1(lf.total * (Lp + W) / 2 + PI * fd.Dext) });
    if (fd.anular) solda.push({ item: "Anel anular — juntas radiais e anel interno", m: r1(Math.ceil(PI * D / Lp) * fd.anular.largura + PI * (D - 2 * fd.anular.interna)) });
    if (tt.t > 0) { solda.push({ item: "Teto — juntas (filete)", m: r1(tt.area / (Lp * W) * (Lp + W) / 1.0) }); solda.push({ item: "Teto-cantoneira e cantoneira-costado", m: r1(2 * PI * D) }); }
    ct.aneis.forEach(function (a) { solda.push({ item: "Anel de contraventamento a " + br(a.cota, 2) + " m", m: r1(2 * PI * D) }); });
    var soldaTot = 0; solda.forEach(function (s) { soldaTot += s.m; });
    /* pintura (m²) */
    var Hc = p.H;
    pint.push({ item: "Costado — externa", m2: r1(PI * (D + cos.aneis[0].t / 1000) * Hc) });
    pint.push({ item: "Costado — interna" + ((PRODUTOS[p.produto] || {}).potavel ? " (revestimento atóxico p/ água potável)" : ""), m2: r1(PI * D * Hc) });
    pint.push({ item: "Fundo — face superior (interna)", m2: r1(PI * D * D / 4) });
    pint.push({ item: "Fundo — face inferior (proteção antes da montagem)", m2: r1(PI * fd.Dext * fd.Dext / 4) });
    if (tt.t > 0) { pint.push({ item: "Teto — externa", m2: r1(tt.area) }); pint.push({ item: "Teto — interna", m2: r1(tt.area) }); }
    if (tt.caibros && tt.caibros.perfil) { var P = Perf(), q = P ? P.obter(tt.caibros.perfil) : null; if (q) pint.push({ item: "Caibros e coluna", m2: r1(q.per * tt.geratriz * tt.caibros.n + PI * 0.2 * (tt.coluna ? tt.coluna.L : 0)) }); }
    pint.push({ item: "Acessórios (escada, plataforma, bocais)", m2: r1(ac.area) });
    var pi = 0, pe = 0; pint.forEach(function (x) { if (/interna/.test(x.item)) pi += x.m2; else pe += x.m2; });
    var vNom = PI * D * D / 4 * p.H, nivel = p.H - p.bordaLivre, vUtil = PI * D * D / 4 * (nivel - p.hMorto);
    var C = Cat(), sist = null; try { sist = C && C.sistemaPintura ? C.sistemaPintura("C3", "M") : null; } catch (e) { sist = null; }
    return { volumeNominal: r2(vNom), volumeUtil: r2(vUtil), volumeProjeto: r2(PI * D * D / 4 * nivel), chapas: chapas, solda: solda, soldaTotal: r1(soldaTot), pintura: pint, pinturaInterna: r1(pi), pinturaExterna: r1(pe), sistemaPintura: sist ? { id: sist.id, nome: sist.nome || sist.id, eps: sist.epsSoma_um || null, ambiente: "C3 (ISO 12944-2) — de partida, conferir o ambiente da obra" } : null };
  }

  /* ============================================================ VERTICAL */
  function calcVertical(p, R) {
    var nivel = p.H - p.bordaLivre;
    var cos = costado(p, R, nivel);
    var fd = fundo(p, R, cos, nivel);
    var tt = teto(p, R, cos);
    var base = p.tipo === "elevado" ? p.alturaTorre : 0;
    var V = vento(p, R, base + p.H + (tt.flecha || 0), p.D); if (V.erro) { R.ok = false; R.motivo = V.erro; return R; }
    var vt = ventoTanque(p, R, cos, tt, V, base);
    var ct = contraventamento(p, R, cos, vt);
    var vol = PI * p.D * p.D / 4 * (nivel - p.hMorto);
    var ac = acessorios(p, R, vol, tt);
    R.acessorios = ac;
    var plano = planoChapas(p, R, cos), ab = aberturas(p, R, cos, tt, plano);
    var cp = perfilProps(tt.cantoneira.cat);
    var pesos = { costado: 0, fundo: PI * fd.Dext * fd.Dext / 4 * fd.t / 1000 * RHO * G_ACC / 1000, anular: fd.anular ? PI * p.D * fd.anular.largura * fd.anular.t / 1000 * RHO * G_ACC / 1000 : 0,
                  teto: tt.massa * G_ACC / 1000, caibros: tt.caibros ? (tt.caibros.massa + (tt.coluna ? tt.coluna.massa : 0)) * G_ACC / 1000 : 0, cantoneira: cp ? cp.massa * PI * p.D * G_ACC / 1000 : 0,
                  aneis: 0, acessCostado: (fin(p._acessKg) ? p._acessKg : ac.massa) * G_ACC / 1000 };
    cos.aneis.forEach(function (a) { pesos.costado += a.massa * G_ACC / 1000; });
    ct.aneis.forEach(function (a) { pesos.aneis += PI * (p.D + a.secao.b / 1000) * a.secao.b / 1000 * a.secao.t / 1000 * RHO * G_ACC / 1000; });
    pesos.total = pesos.costado + pesos.fundo + pesos.anular + pesos.teto + pesos.caibros + pesos.cantoneira + pesos.aneis + pesos.acessCostado;
    if (tt.coluna) pesos.colunaCarga = tt.coluna.N + tt.coluna.massa * G_ACC / 1000;
    var est = p.tipo === "elevado" ? null : estabilidade(p, R, cos, fd, tt, vt, pesos);
    var sm = sismo(p, R);
    var fu = p.tipo === "elevado" ? null : fundacao(p, R, pesos, vt, est, nivel);
    var q = quantitativo(p, R, cos, fd, tt, ct, ac, est);
    q.planoChapas = plano; q.mapaSoldas = mapaSoldas(q, ab);
    q.chapas.forEach(function (c) { var m = /^Costado — anel (\d+)/.exec(c.item); if (m && plano.aneis[+m[1] - 1]) { var pa = plano.aneis[+m[1] - 1]; c.obs = "calandrada (Ø " + br(p.D, 2) + " m); " + pa.n + " chapas de " + br(pa.comprimento * 1000, 0) + " mm cortadas de " + br(plano.comprimentoComercial * 1000, 0) + " mm; juntas defasadas " + br(pa.defasagem, 1) + "°"; } });
    ab.lista.forEach(function (a) { if (a.reforco) q.chapas.push({ item: "Chapa de reforço — " + a.nome, t: a.reforco.t, L: a.reforco.Do / 1000, B: a.reforco.Do / 1000, qtd: 1, massa: r1(PI / 4 * (Math.pow(a.reforco.Do / 1000, 2) - Math.pow(a.furo / 1000, 2)) * a.reforco.t / 1000 * RHO), obs: "calandrada no " + (a.onde === "teto" ? "teto" : "costado") + "; furo Ø " + br(a.furo, 0) + " mm; furo de teste 6 mm" }); });
    R.aberturas = ab;
    var kg = function (kN) { return r1(kN * 1000 / G_ACC); };
    q.pesos = { costado: kg(pesos.costado), fundo: kg(pesos.fundo + pesos.anular), teto: kg(pesos.teto), estruturaTeto: kg(pesos.caibros), cantoneira: kg(pesos.cantoneira), aneisVento: kg(pesos.aneis), acessorios: kg(pesos.acessCostado),
                chumbadores: est && est.chumbadores ? r1(est.chumbadores.n * PI / 4 * Math.pow(est.chumbadores.d / 1000, 2) * 1.5 * RHO) : 0 };
    q.pesos.total = r1(q.pesos.costado + q.pesos.fundo + q.pesos.teto + q.pesos.estruturaTeto + q.pesos.cantoneira + q.pesos.aneisVento + q.pesos.acessorios + q.pesos.chumbadores);
    q.pesoChapas = r1(q.pesos.costado + q.pesos.fundo + q.pesos.teto);
    R.costado = cos; R.fundo = fd; R.teto = tt; R.vento = { v0: V.v0, v0Info: V.v0Info, s1: V.s1, s1Texto: V.s1Texto, classe: V.classe, categoria: V.categoria, S3: V.S3, s3: V.s3, lat: V.lat, lon: V.lon, ref: V.ref, tanque: vt };
    R.contraventamento = ct; R.acessorios = ac; R.estabilidade = est; R.sismo = sm; R.fundacao = fu; R.quantitativo = q; R.pesosKN = pesos;
    R.geometria = { D: p.D, H: p.H, nivel: r3(nivel), HD: r3(p.H / p.D), aneis: cos.n, bordaLivre: p.bordaLivre, hMorto: p.hMorto, flechaTeto: tt.flecha || 0 };
    return R;
  }

  /* ============================================================ ELEVADO (torre) */
  /* CANTONEIRA SIMPLES (catálogo: a, b, t em mm; Ix, Iy geométricos): eixo principal de MENOR inércia pela geometria
     (Iv = (Ix + Iy)/2 − √(((Ix − Iy)/2)² + Ixy²), Ixy das duas abas) e compressão pela NBR 8800:2008 — 5.3 com Q do
     Anexo F (elemento AL: b/t ≤ 0,45·√(E/fy) → 1; até 0,91·√(E/fy) → 1,34 − 0,76·(b/t)·√(fy/E); acima → 0,53·E/(fy·(b/t)²))
     e a esbeltez equivalente da cantoneira ligada por uma aba (L/rx ≤ 80: 72 + 0,75·L/rx; > 80: 32 + 1,25·L/rx — AISC 360,
     E5, como referência), ficando a MAIOR entre ela e L/r_mín (a favor da segurança — conferir). */
  function cantoneiraProps(q) {
    var a = num(q.a, 50), b = num(q.b, a), t = num(q.t, 5), A1 = b * t, x1 = b / 2, y1 = t / 2, A2 = (a - t) * t, x2 = t / 2, y2 = t + (a - t) / 2;
    var At = A1 + A2, xc = (A1 * x1 + A2 * x2) / At, yc = (A1 * y1 + A2 * y2) / At, Ixy = A1 * (x1 - xc) * (y1 - yc) + A2 * (x2 - xc) * (y2 - yc);
    var Ix = num(q.Ix, 0), Iy = num(q.Iy, Ix), Im = (Ix + Iy) / 2, Rr = Math.sqrt(Math.pow((Ix - Iy) / 2, 2) + Ixy * Ixy), Iv = Im - Rr;
    return { Iv: Iv, Iu: Im + Rr, rv: Math.sqrt(Iv / q.A), rx: Math.sqrt(Math.min(Ix, Iy) / q.A), bt: Math.max(a, b) / t };
  }
  function cantoneiraComp(q, L, fy) {
    var pr = cantoneiraProps(q), E = 200000, s1 = Math.sqrt(E / fy), bt = pr.bt, Q = bt <= 0.45 * s1 ? 1 : (bt <= 0.91 * s1 ? 1.34 - 0.76 * bt / s1 : 0.53 * E / (fy * bt * bt));
    var Lrx = L * 1000 / pr.rx, eq = Lrx <= 80 ? 72 + 0.75 * Lrx : 32 + 1.25 * Lrx, esb = Math.max(eq, L * 1000 / pr.rv);
    var Fe = PI * PI * E / (esb * esb), l0 = Math.sqrt(Q * fy / Fe), chi = l0 <= 1.5 ? Math.pow(0.658, l0 * l0) : 0.877 / (l0 * l0);
    return { NcRd: chi * Q * q.A * fy / 1.10 / 1000, esb: esb, eq: eq, Lrv: L * 1000 / pr.rv, Q: Q, chi: chi, l0: l0, rv: pr.rv, rx: pr.rx, bt: bt };
  }

  /* ============================================================ TORRE COMO PÓRTICO ESPACIAL (js/acoanalise.js)
   * nós em cada nível de painel; pilares contínuos (2 elementos por trecho, 2ª ordem); travessas e vigas do topo
   * rotuladas; diagonais em X só de tração; o fundo da cuba como diafragma (X só de tração no topo); bases rotuladas.
   * Casos: G (cuba + grelha + peso próprio), L (água), W0 e W45 (cuba: força no topo + binário; torre: força por painel;
   * sucção no teto). Combinações ELU adotadas a favor da segurança (1,25·G; 1,4·L; 1,4·W, sem ψ0 — conferir NBR 8681:2025). */
  function torreAnalise(p, R, g) {
    var AN = dep("AcoAnalise", "./acoanalise.js"), P = Perf(); if (!AN || !P || !AN.analisar) return null;
    var nP = g.nP, nPan = g.nPan, Ht = g.Ht, Rb = g.Rb, Rt = g.Rt, a0 = 45;
    function sec(q, menor) { var I1 = q.Ix * 1e-12, I2 = (q.Iy || q.Ix) * 1e-12; if (menor) { var Im = cantoneiraProps(q).Iv * 1e-12; I1 = Im; I2 = Im; } return { A: q.A * 1e-6, Iz: I1, Iy: I2, J: Math.max(q.J || 0, 1) * 1e-12 }; }
    function no(i, k) { return "n" + i + "_" + k; }
    function pos(i, k) { var r = Rb + (Rt - Rb) * k / nPan, a = (a0 + 360 * i / nP) * PI / 180; return [r * Math.cos(a), Ht * k / nPan, -r * Math.sin(a)]; }
    function len3(u, v) { return Math.sqrt(Math.pow(u[0] - v[0], 2) + Math.pow(u[1] - v[1], 2) + Math.pow(u[2] - v[2], 2)); }
    function montar(pil, dg, trv) {
      var nos = [], barras = [], apoios = [], i, k;
      for (i = 0; i < nP; i++) for (k = 0; k <= nPan; k++) { var q = pos(i, k); nos.push({ id: no(i, k), x: q[0], y: q[1], z: q[2] }); }
      var rot = { i: { ry: true, rz: true }, j: { ry: true, rz: true } }, rotD = rot;   /* sem soltar a torção (rx): com ela solta a matriz geométrica condensada acusa mecanismo na 2ª ordem */
      for (i = 0; i < nP; i++) {
        var j = (i + 1) % nP, rad = pos(i, 0); rad = [rad[0], 0, rad[2]];
        apoios.push({ no: no(i, 0), ux: true, uy: true, uz: true });
        for (k = 0; k < nPan; k++) {
          barras.push({ id: "P" + i + "_" + k, i: no(i, k), j: no(i, k + 1), secao: sec(pil), vy: rad, nElem: 2 });
          barras.push({ id: "D" + i + "_" + k + "a", i: no(i, k), j: no(j, k + 1), secao: sec(dg, true), libera: rotD });
          barras.push({ id: "D" + i + "_" + k + "b", i: no(j, k), j: no(i, k + 1), secao: sec(dg, true), libera: rotD });
        }
        for (k = 1; k <= nPan; k++) barras.push({ id: "T" + i + "_" + k, i: no(i, k), j: no(j, k), secao: sec(k === nPan && g.viga ? g.viga : trv, k !== nPan || !g.viga), libera: rot });
      }
      /* diafragma do topo (fundo da cuba): X só de tração entre pilares não vizinhos */
      for (i = 0; i < nP; i++) for (var j2 = i + 2; j2 < nP; j2++) { if (i === 0 && j2 === nP - 1) continue; barras.push({ id: "X" + i + "_" + j2, i: no(i, nPan), j: no(j2, nPan), secao: sec(dg, true), libera: rotD }); }
      var cG = [{ tipo: "pesoProprio" }], cL = [], cW = { W0: [], W45: [] };
      for (i = 0; i < nP; i++) { cG.push({ tipo: "no", no: no(i, nPan), F: [0, -(g.Wcuba + g.Wgrade) / nP, 0, 0, 0, 0] }); cL.push({ tipo: "no", no: no(i, nPan), F: [0, -g.Wagua / nP, 0, 0, 0, 0] }); }
      [["W0", 0], ["W45", 180 / nP]].forEach(function (w) {
        var ang = w[1] * PI / 180, d = [Math.cos(ang), 0, -Math.sin(ang)], s2 = 0, ss = [], ii;
        for (ii = 0; ii < nP; ii++) { var q2 = pos(ii, nPan), sp = q2[0] * d[0] + q2[2] * d[2]; ss.push(sp); s2 += sp * sp; }
        var Mc = g.Fc * (g.zc - Ht);
        for (ii = 0; ii < nP; ii++) cW[w[0]].push({ tipo: "no", no: no(ii, nPan), F: [g.Fc / nP * d[0], -Mc * ss[ii] / s2 + g.Fup / nP, g.Fc / nP * d[2], 0, 0, 0] });
        g.forcasPainel.forEach(function (fk, kk) { for (var i3 = 0; i3 < nP; i3++) { [kk, kk + 1].forEach(function (lv) { if (lv === 0) return; cW[w[0]].push({ tipo: "no", no: no(i3, lv), F: [fk / 2 / nP * d[0], 0, fk / 2 / nP * d[2], 0, 0, 0] }); }); } });
      });
      return { nos: nos, barras: barras, apoios: apoios, casos: [{ id: "G", cargas: cG }, { id: "L", cargas: cL }, { id: "W0", cargas: cW.W0 }, { id: "W45", cargas: cW.W45 }] };
    }
    var combs = [{ id: "ELU1", nome: "1,25·G + 1,4·L", fatores: { G: 1.25, L: 1.4 }, segundaOrdem: true },
                 { id: "ELU2a", nome: "1,25·G + 1,4·L + 1,4·W0", fatores: { G: 1.25, L: 1.4, W0: 1.4 }, segundaOrdem: true },
                 { id: "ELU2b", nome: "1,25·G + 1,4·L + 1,4·W45", fatores: { G: 1.25, L: 1.4, W45: 1.4 }, segundaOrdem: true },
                 { id: "ELU3a", nome: "1,0·G + 1,4·W0 (vazio)", fatores: { G: 1.0, W0: 1.4 }, segundaOrdem: true },
                 { id: "ELU3b", nome: "1,0·G + 1,4·W45 (vazio)", fatores: { G: 1.0, W45: 1.4 }, segundaOrdem: true },
                 { id: "SERV", nome: "1,0·G + 1,0·L + 1,0·W0 (característica)", fatores: { G: 1, L: 1, W0: 1 }, segundaOrdem: true }];
    var tubos = P.listar("HSSC").map(function (n) { return P.obter(n); }).filter(Boolean).sort(function (a, b) { return a.massa - b.massa; });
    var angs = P.listar("L").map(function (n) { return P.obter(n); }).filter(function (q) { return q && q.a === q.b; }).sort(function (a, b) { return a.massa - b.massa; });
    var pil = (g.pilar && P.obter(g.pilar)) || tubos[10], dg = (g.diagonal && P.obter(g.diagonal)) || angs[2], trv = P.obter("L76X76X6.4") || angs[4], res = null, it;
    var Lleg = Math.sqrt(Math.pow(Ht / nPan, 2) + Math.pow((Rb - Rt) / nPan, 2)), Ldg = len3(pos(0, 0), pos(1, 1)), Ltr = 2 * Rb * Math.sin(PI / nP);
    function envolt(r0) {
      var o = { pil: { Nc: 0, M: 0, comb: "" }, dg: { Nt: 0, Nc: 0, comb: "", combC: "" }, tr: { Nc: 0, comb: "" }, reac: { comp: 0, trac: 0, H: 0 }, ok: r0.ok };
      Object.keys(r0.combinacoes).forEach(function (cid) {
        if (cid === "SERV") return;
        var c = r0.combinacoes[cid]; if (!c.ok) { o.ok = false; return; }
        Object.keys(c.barras).forEach(function (bid) {
          var est = c.barras[bid].estacoes || [], t0 = bid.charAt(0);
          est.forEach(function (e) {
            var M = Math.sqrt(e.My * e.My + e.Mz * e.Mz);
            if (t0 === "P") { if (-e.N > o.pil.Nc) { o.pil.Nc = -e.N; o.pil.comb = cid; } if (M > o.pil.M) o.pil.M = M; }
            else if (t0 === "D" || t0 === "X") { if (e.N > o.dg.Nt) { o.dg.Nt = e.N; o.dg.comb = cid; } if (-e.N > o.dg.Nc) { o.dg.Nc = -e.N; o.dg.combC = cid; } }
            else if (t0 === "T") { if (-e.N > o.tr.Nc) { o.tr.Nc = -e.N; o.tr.comb = cid; } }
          });
        });
        Object.keys(c.reacoes || {}).forEach(function (nid) { var rr = c.reacoes[nid]; if (rr[1] > o.reac.comp) o.reac.comp = rr[1]; if (rr[1] < o.reac.trac) o.reac.trac = rr[1]; var hh = Math.sqrt(rr[0] * rr[0] + rr[2] * rr[2]); if (hh > o.reac.H) o.reac.H = hh; });
      });
      return o;
    }
    function verPil(q, e) { var c = compressao(q, Lleg, 250), MRd = q.Zx * 250 / 1.10 / 1e6, nr = e.pil.Nc / c.NcRd, mr = e.pil.M / MRd, it2 = nr >= 0.2 ? nr + 8 / 9 * mr : nr / 2 + mr; return { c: c, MRd: MRd, int: it2, ok: it2 <= 1 && c.esb <= 180 }; }
    function NtRd(q) { return Math.min(q.A * 250 / 1.10, 0.75 * q.A * 400 / 1.35) / 1000; }
    /* diagonal em X ligada no cruzamento: flambagem com L/2 no eixo de menor inércia (≈ 0,64·I da cantoneira — conferir) */
    function verDg(q, e) { var c = cantoneiraComp(q, Ldg / 2, 250); return { NtRd: NtRd(q), c: c, esb: c.esb, ok: e.dg.Nt <= NtRd(q) && e.dg.Nc <= c.NcRd && c.esb <= 200 }; }
    function verTr(q, e) { var c = cantoneiraComp(q, Ltr, 250); return { c: c, ok: e.tr.Nc <= c.NcRd && c.esb <= 200 }; }
    var env = null, metodo = "2ª ordem", amp = 1, lamb = null;
    /* 2ª ordem direta; se o solver acusar instabilidade numérica, 1ª ordem amplificada por B2 = 1/(1 − 1/λcr) com o
       fator de carga crítica da flambagem global (NBR 8800:2008, 4.9 — amplificação a favor da segurança em N e M) */
    function rodar(m) {
      var r0 = AN.analisar(m, { combinacoes: combs });
      if (r0 && r0.ok) { metodo = "2ª ordem"; amp = 1; return r0; }
      var c1 = combs.map(function (c) { return { id: c.id, nome: c.nome, fatores: c.fatores }; }), r1 = AN.analisar(m, { combinacoes: c1 });
      if (!r1 || !r1.ok || !AN.flambagem) return r0;
      var fl = AN.flambagem(m, { combinacao: { id: "ELU2a", fatores: combs[1].fatores } }), lc = fl && fl.ok && fl.modos && fl.modos.length ? fl.modos[0].lambda : null;
      if (!(lc > 1.05)) return r0;
      lamb = lc; amp = 1 / (1 - 1 / lc); metodo = "1ª ordem × B2"; return r1;
    }
    function ampEnv(o) { if (amp === 1) return o; o.pil.Nc *= amp; o.pil.M *= amp; o.dg.Nt *= amp; o.dg.Nc *= amp; o.tr.Nc *= amp; o.reac.comp *= amp; o.reac.trac *= amp; o.reac.H *= amp; return o; }
    var bom = null;   /* a última rodada que fechou: se a seguinte (perfis mais leves) não fechar, volta para ela */
    /* a 1ª rodada tem de fechar: se não fechar, engrossa pilar e diagonal (~+30 % de massa) e tenta de novo (até 6 vezes) */
    function maisPesado(lista, q) { for (var k = 0; k < lista.length; k++) if (lista[k].massa >= q.massa * 1.3) return lista[k]; return null; }
    for (var tent = 0; tent < 6; tent++) {
      var rt = rodar(montar(pil, dg, trv)); if (rt && rt.ok) break;
      var np2 = maisPesado(tubos, pil), nd2 = maisPesado(angs, dg); if (!np2 && !nd2) break;
      if (np2) pil = np2; if (nd2) dg = nd2;
    }
    for (it = 0; it < 6; it++) {
      res = rodar(montar(pil, dg, trv));
      if (!res || !res.ok) { if (bom) { res = bom.res; env = bom.env; metodo = bom.metodo + " (esforços da rodada anterior: a torre contraventada quase não redistribui com a troca de perfil)"; amp = bom.amp; lamb = bom.lamb; } break; }
      env = ampEnv(envolt(res));
      bom = { res: res, env: env, pil: pil, dg: dg, trv: trv, metodo: metodo, amp: amp, lamb: lamb };
      var chave = pil.nome + "|" + dg.nome + "|" + trv.nome, np = pil, nd = dg, nt = trv, k;
      for (k = 0; k < tubos.length; k++) { if (verPil(tubos[k], env).ok) { np = tubos[k]; break; } }
      for (k = 0; k < angs.length; k++) { if (verDg(angs[k], env).ok) { nd = angs[k]; break; } }
      for (k = 0; k < angs.length; k++) { if (verTr(angs[k], env).ok) { nt = angs[k]; break; } }
      pil = np; dg = nd; trv = nt;
      if (pil.nome + "|" + dg.nome + "|" + trv.nome === chave) break;
    }
    if (!res || !res.ok || !env) return { ok: false, motivo: res ? res.motivo : "a análise não rodou" };
    var vp = verPil(pil, env), vd = verDg(dg, env), vtt = verTr(trv, env), serv = res.combinacoes.SERV, dTopo = 0;
    if (serv && serv.ok) Object.keys(serv.desloc || {}).forEach(function (nid) { if (nid.split("_")[1] === String(nPan)) { var u = serv.desloc[nid]; dTopo = Math.max(dTopo, Math.sqrt(u[0] * u[0] + u[2] * u[2])); } });
    return { ok: true, pilar: pil, diagonal: dg, travessa: trv, env: env, vp: vp, vd: vd, vt: vtt, iteracoes: it + 1, nGL: res.nGL, combs: combs, dTopo: dTopo * amp, Lleg: Lleg, Ldg: Ldg, Ltr: Ltr, avisos: res.avisos, metodo: metodo, amp: amp, lambda: lamb };
  }

  /* ============================================================ LIGAÇÕES DA TORRE (reusa o js/acoligcalc.js, sem mudar nada nele)
   * placa de base rotulada do pilar tubular (AcoLigCalc.placaBase — Guia 1; o tubo entra pela envoltória: d = bf = Ø)
   * e a ligação da diagonal em cantoneira numa chapa gusset soldada no pilar: parafusos ASTM A325 a cisalhamento
   * simples, pressão de contato, rasgamento da cantoneira, gusset pela largura de Whitmore e solda gusset–pilar. */
  function ligacoesTorre(p, R, pil, dg, esf) {
    var L = dep("AcoLigCalc", "./acoligcalc.js"), P = Perf(), out = {}; if (!L || !L.placaBase) { R.naoVerificado.push("Torre: ligações (o js/acoligcalc.js não carregou)"); return out; }
    var qp = P ? P.obter(pil) : null, qd = P ? P.obter(dg) : null;
    if (qp) {
      var od = qp.D || qp.d || 150, tw = qp.t || qp.tn || 6;
      /* 1.2.149 (revisão de 15/10): o fck é o dos BLOCOS da torre (p.fckFundacao). Sem ele (ou só adotado) o 25 MPa é de
         REFERÊNCIA: a aderência do chumbador NÃO é verificada e a base fica A CONFIRMAR — a régua da placa de base comum
         (js/acoligcalc2.js, 1.2.148); antes o 25 entrava como dado e a ancoragem saía VERIFICADA */
      var fckF = num(p.fckFundacao, 0), fckRef = !(fckF > 0) || !!p.fckFundacaoReferencia;
      var pb = L.placaBase({ tipo: "rotulada", pilar: { d: od, bf: od, tw: tw, tf: tw }, aco: { fy: 250, fu: 400 }, chumbador: { id: "ASTM F1554 Gr.36", fy: 250, fu: 400 }, concreto: { fck: fckF > 0 ? fckF : 25, referencia: fckRef },
        esforcos: [{ comb: esf.combC || "ELU (compressão)", N: -esf.Nc, Vx: esf.V / Math.SQRT2, Vz: esf.V / Math.SQRT2 }].concat(esf.Nt > 0 ? [{ comb: esf.combT || "ELU (arrancamento)", N: esf.Nt, Vx: esf.V / Math.SQRT2, Vz: esf.V / Math.SQRT2 }] : []) });
      arr(pb.verificacoes).forEach(function (v) { R.verificacoes.push({ nome: "Torre — placa de base: " + v.nome, item: v.item + " (AcoLigCalc.placaBase; pilar tubular pela envoltória d = bf = Ø — conferir)", passos: v.passos, resistencia: v.resistencia, solicitante: v.solicitante, unidade: v.unidade, razao: v.razao, ok: v.razao <= 1 + 1e-9, conferir: true }); });
      out.placaBase = { ok: !!pb.ok, resumo: pb.resumo, dimensoes: pb.dimensoes, razao: pb.razao };
      if (arr(pb.pendenciasPlaca).length) {
        var ancT = pb.dimensoes && pb.dimensoes.chumbadores ? pb.dimensoes.chumbadores.ancoragem : null;
        out.placaBase.okVerificacoes = out.placaBase.ok; out.placaBase.ok = false; out.placaBase.aConfirmar = R.aConfirmar = "fck do concreto da fundação (ancoragem do chumbador por aderência)";
        out.placaBase.pendencias = pb.pendenciasPlaca.slice();
        R.problemas.push({ tipo: "fck-fundacao", critico: true, texto: "A CONFIRMAR: placa de base da torre — falta o fck do concreto da fundação: ancoragem do chumbador por aderência não verificada" + (ancT ? " (os " + br(ancT, 0) + " mm saíram com fck = 25 MPa de referência)" : "") + ".",
          solucoes: [{ id: "fck", texto: "Informe o fck do concreto dos blocos da torre (campo \"fck do concreto dos blocos da torre\")" }] });
      }
      if (!pb.ok) R.problemas.push({ tipo: "ligacao", texto: "Placa de base do pilar da torre não fechou: " + (pb.governante || ""), solucoes: [{ id: "placa", texto: pb.sugestao || "Aumentar a placa ou os chumbadores" }] });
      else R.decisoes.push({ tema: "Torre — placa de base", decisao: pb.resumo, motivo: "a menor placa e o menor chumbador que passam com a compressão, o arrancamento e o cortante da análise da torre" });
    }
    if (qd) {
      var N = Math.max(esf.Ndt, esf.Ndc), tA = qd.t, aba = qd.b || qd.a, d = aba <= 76.3 ? 15.88 : 19.05, nomeP = d < 17 ? "5/8\"" : "3/4\"", fub = 825, dh = L.furoPadrao(d);
      var e1 = Math.max(Math.ceil(1.75 * d), 30), s = Math.ceil(3 * d), lf = Math.min(e1 - dh / 2, s - dh), Fv = L.parafusoCisal(d, fub, true), Fb = L.pressaoContato(d, tA, 400, lf), F1 = Math.min(Fv, Fb);
      var n = Math.max(2, Math.ceil(N / F1 - 1e-9)), g = Math.round(aba * 0.55), rs = L.rasgamento({ t: tA, fy: 250, fu: 400, lv: (n - 1) * s + e1, lt: aba - g, dh: dh, furosV: n - 0.5, furosT: 0.5, Cts: 1 });
      var tg = comercial(Math.max(8, tA + 1.6)), Lw = 2 * (n - 1) * s * Math.tan(30 * PI / 180) + dh * 2, NtG = Lw * tg * 250 / 1.10 / 1000;
      var Lb = 1.5 * s, rG = tg / Math.sqrt(12), lamb = 0.65 * Lb / rG, Ne = PI * PI * 200000 * (Lw * Math.pow(tg, 3) / 12) / Math.pow(0.65 * Lb, 2) / 1000, l0 = Math.sqrt(Lw * tg * 250 / 1000 / Ne), chi = l0 <= 1.5 ? Math.pow(0.658, l0 * l0) : 0.877 / (l0 * l0), NcG = chi * Lw * tg * 250 / 1.10 / 1000;
      var Lg = (n - 1) * s + 2 * e1 + 40, aw = Math.max(5, L.pernaMinima(Math.max(tg, qp ? (qp.t || 6) : 6))), Fw = L.soldaFilete(aw, 2 * Lg, 485, 250);
      var raz = Math.max(N / (n * F1), esf.Ndt / rs.Rd, esf.Ndt / NtG, esf.Ndc / NcG, N / Fw);
      R.verificacoes.push({ nome: "Torre — ligação da diagonal (" + dg + " em gusset)", item: "NBR 8800:2008, 6.3 (parafusos), 6.5.6 (rasgamento) e 6.2 (solda), pelos helpers do AcoLigCalc; gusset pela largura de Whitmore e flambagem com K = 0,65 (método de Thornton — conferir)", passos: [
        passo("Força na diagonal", "máx(tração; compressão) " + (esf.fonte || "da análise da torre"), br(N, 1) + " kN (tração " + br(esf.Ndt, 1) + "; compressão " + br(esf.Ndc, 1) + ")"),
        passo("Parafusos", n + " × ASTM A325 Ø " + nomeP + " (furo " + br(dh, 1) + " mm), cisalhamento simples com rosca no plano: " + br(Fv, 1) + " kN; contato na cantoneira (t = " + br(tA, 1) + " mm, lf = " + br(lf, 1) + " mm): " + br(Fb, 1) + " kN", br(n * F1, 1) + " kN"),
        passo("Rasgamento da cantoneira", "lv = " + br((n - 1) * s + e1, 0) + " mm, lt = " + br(aba - g, 0) + " mm (6.5.6)", br(rs.Rd, 1) + " kN"),
        passo("Gusset à tração (Whitmore)", "Lw = 2·(n − 1)·s·tg 30° + 2·dh = " + br(Lw, 0) + " mm; t = " + br(tg, 1) + " mm; Lw·t·fy/1,10", br(NtG, 1) + " kN"),
        passo("Gusset à compressão", "K·L = 0,65 × " + br(Lb, 0) + " mm; λ0 = " + br(l0, 3) + ", χ = " + br(chi, 3), br(NcG, 1) + " kN"),
        passo("Solda gusset–pilar", "2 filetes de " + aw + " mm × " + br(Lg, 0) + " mm (6.2.5)", br(Fw, 1) + " kN")
      ], resistencia: 1, solicitante: raz, unidade: "", razao: raz, ok: raz <= 1 + 1e-9, conferir: true });
      out.diagonal = { parafusos: n, d: nomeP, classe: "ASTM A325", gusset: { t: tg, L: r1(Lg), Lw: r1(Lw) }, solda: aw, ok: raz <= 1 };
      if (raz > 1) R.problemas.push({ tipo: "ligacao", texto: "Ligação da diagonal da torre não fechou (razão " + br(raz, 2) + ").", solucoes: [{ id: "mais-parafusos", texto: "Mais parafusos, parafuso maior ou gusset mais grosso" }] });
    }
    R.naoVerificado.push("Torre: cruzamento das diagonais (parafuso no X), travessas e emendas dos pilares — não dimensionados");
    return out;
  }

  /* ============================================================ FUNDO DA CUBA DO ELEVADO SOBRE A GRELHA (C6)
   * torre de 4 pilares: as vigas de perímetro formam um quadrado CIRCUNSCRITO à cuba (lado = D, o fundo inteiro fica
   * apoiado, sem balanço) e vigas internas paralelas, a cada s, levam a chapa do fundo.
   *  chapa: faixa contínua de vão s — Md = 1,4·p·s²/10 ≤ MRd = (t − CA)²/4·fy/1,10 (por mm de largura, plástico — conferir);
   *  viga interna: biapoiada no vão D, w = 1,4·p·s — Md = w·D²/8 ≤ Zx·fy/1,10 (mesa comprimida travada pela chapa do fundo);
   *  viga de perímetro (a que recebe as internas): vão D, carga equivalente distribuída das reações + faixa de borda.
   * Escolhe o par (espessura, número de vigas internas) de MENOR peso de aço. Outros números de pilares: não dimensionado
   * → problema (não aprova). */
  function grelhaFundo(p, R, nivel) {
    var D = p.D, P = Perf(), CAf = p.CAfundo, fy = 250, pK = 9.81 * p.G * nivel, Ws = P ? P.listar("W").map(function (n) { return P.obter(n); }).filter(Boolean) : [];
    Ws.sort(function (a, b) { return a.massa - b.massa; });
    function vigaPara(Md, L, wS) { for (var i = 0; i < Ws.length; i++) { var q = Ws[i], MRd = q.Zx * fy / 1.10 / 1e6, fl = 5 * wS * Math.pow(L * 1000, 4) / (384 * 200000 * q.Ix); if (Md <= MRd && fl <= L * 1000 / 250) return { q: q, MRd: MRd, flecha: fl }; } return null; }
    var melhor = null, tMin = R.fundo.t, cands = espessuras().filter(function (x) { return x >= tMin - 1e-9 && x <= 25.4; });
    cands.forEach(function (t) {
      var pp = pK + (t / 1000) * GAMA_ACO, pd = 1.4 * pp / 1000, MRd = Math.pow(t - CAf, 2) / 4 * fy / 1.10, sMax = Math.sqrt(10 * MRd / pd) / 1000;
      var nb = Math.max(0, Math.ceil(D / sMax - 1e-9) - 1), sR = D / (nb + 1), wI = 1.4 * pp * sR, MdI = wI * D * D / 8, vI = nb ? vigaPara(MdI, D, pp * sR) : { q: null, MRd: 0 };
      var Preac = wI * D / 2, wPer = (nb * Preac + 1.4 * pp * sR / 2 * D) / D, MdP = wPer * D * D / 8, vP = vigaPara(MdP, D, wPer / 1.4);
      if (!vI || !vP) return;
      var massa = PI * D * D / 4 * t / 1000 * RHO + (vI.q ? vI.q.massa * D * nb : 0) + vP.q.massa * D * 4;
      if (!melhor || massa < melhor.massa) melhor = { t: t, nb: nb, s: sR, sMax: sMax, pK: pp, MdC: pd * sR * sR * 1e6 / 10, MRdC: MRd, vI: vI, MdI: MdI, vP: vP, MdP: MdP, massa: massa };
    });
    if (!melhor) { R.problemas.push({ tipo: "fundo-cuba", texto: "Fundo da cuba sobre a grelha: nenhuma combinação de chapa (até 25 mm) e vigas W fecha.", solucoes: [{ id: "fundo", texto: "Fundo cônico ou em domo, ou grelha projetada à parte" }] }); return null; }
    var m = melhor;
    R.verificacoes.push({ nome: "Fundo da cuba — chapa entre as vigas da grelha", item: "flexão da faixa contínua (NBR 8800:2008, plástico da chapa por unidade de largura — conferir); API 650, 5.4.1 (mínimo)", passos: [
      passo("Pressão no fundo", "p = 9,81·G·nível + peso da chapa = 9,81 × " + br(p.G, 2) + " × " + br(nivel, 2) + " + …", br(m.pK, 2) + " kPa"),
      passo("Vigas internas", m.nb + " vigas paralelas, s = D/(n + 1) = " + br(m.s * 1000, 0) + " mm (s máx. " + br(m.sMax * 1000, 0) + " mm)", m.nb + " × " + (m.vI.q ? m.vI.q.nome : "-")),
      passo("Momento de cálculo na chapa", "Md = 1,4·p·s²/10", br(m.MdC, 0) + " N·mm/mm"),
      passo("Momento resistente", "MRd = (t − CA)²/4·fy/1,10, t = " + br(m.t, 1) + " mm, CA = " + br(CAf, 1) + " mm", br(m.MRdC, 0) + " N·mm/mm")
    ], resistencia: m.MRdC, solicitante: m.MdC, unidade: "N·mm/mm", razao: m.MdC / m.MRdC, ok: m.MdC <= m.MRdC + 1e-9, conferir: true });
    if (m.nb) R.verificacoes.push({ nome: "Fundo da cuba — vigas internas (" + m.vI.q.nome + ")", item: "NBR 8800:2008, 5.4.2 (flexão, mesa comprimida travada pela chapa do fundo) e flecha L/250", passos: [
      passo("Carga", "w = 1,4·p·s = 1,4 × " + br(m.pK, 2) + " × " + br(m.s, 3), br(1.4 * m.pK * m.s, 2) + " kN/m"), passo("Momento", "Md = w·D²/8, D = " + br(D, 2) + " m", br(m.MdI, 2) + " kN·m"),
      passo("Resistência", "MRd = Zx·fy/1,10", br(m.vI.MRd, 2) + " kN·m"), passo("Flecha (serviço)", "5·w·L⁴/(384·E·I) ≤ L/250", br(m.vI.flecha, 1) + " mm")
    ], resistencia: m.vI.MRd, solicitante: m.MdI, unidade: "kN·m", razao: m.MdI / m.vI.MRd, ok: true, conferir: true });
    R.verificacoes.push({ nome: "Fundo da cuba — vigas de perímetro (" + m.vP.q.nome + ")", item: "NBR 8800:2008, 5.4.2 (flexão; reações das vigas internas como carga distribuída equivalente — conferir)", passos: [
      passo("Momento", "Md = w_eq·D²/8 (reações das " + m.nb + " vigas internas + faixa de borda)", br(m.MdP, 2) + " kN·m"), passo("Resistência", "MRd = Zx·fy/1,10", br(m.vP.MRd, 2) + " kN·m")
    ], resistencia: m.vP.MRd, solicitante: m.MdP, unidade: "kN·m", razao: m.MdP / m.vP.MRd, ok: true, conferir: true });
    R.decisoes.push({ tema: "Fundo da cuba", decisao: "Chapa de " + br(m.t, 1) + " mm sobre " + m.nb + " viga(s) interna(s) " + (m.vI.q ? m.vI.q.nome : "") + " a cada " + br(m.s * 1000, 0) + " mm e vigas de perímetro " + m.vP.q.nome, motivo: "o par chapa + vigas de menor peso que passa à flexão da chapa entre as vigas e das vigas (quadrado circunscrito à cuba: o fundo inteiro apoiado)" });
    return { t: m.t, nb: m.nb, s: r3(m.s), vigaInterna: m.vI.q ? m.vI.q.nome : null, vigaPerimetro: m.vP.q.nome, massa: r1(m.massa), lado: D };
  }

  function calcElevado(p, R) {
    calcVertical(p, R); if (R.ok === false) return R;
    var D = p.D, nP = Math.round(p.pilares), Ht = p.alturaTorre, nivel0 = p.H - p.bordaLivre, gr = null;
    /* C6: fundo da cuba — 4 pilares: grelha dimensionada (quadrado circunscrito, pilares nos cantos); outros: problema */
    if (nP === 4) {
      gr = grelhaFundo(p, R, nivel0);
      if (gr) {
        var tOld = R.fundo.t, dM = PI * R.fundo.Dext * R.fundo.Dext / 4 * (gr.t - tOld) / 1000 * RHO;
        R.fundo.t = gr.t; R.fundo.grelha = gr; R.pesosKN.fundo += dM * G_ACC / 1000; R.pesosKN.total += dM * G_ACC / 1000;
        R.quantitativo.pesos.fundo = r1(R.quantitativo.pesos.fundo + dM); R.quantitativo.pesos.total = r1(R.quantitativo.pesos.total + dM); R.quantitativo.pesoChapas = r1(R.quantitativo.pesoChapas + dM);
        R.quantitativo.chapas.forEach(function (c) { if (c.item === "Fundo") { c.t = gr.t; c.massa = r1(c.massa + dM); c.obs = "sobre a grelha (" + gr.nb + " vigas internas a " + Math.round(gr.s * 1000) + " mm)"; } });
      }
    } else R.problemas.push({ tipo: "fundo-cuba", texto: "Fundo da cuba sobre a grelha: dimensionado só para torre de 4 pilares (aqui " + nP + ").", solucoes: [{ id: "4-pilares", texto: "Usar 4 pilares" }, { id: "fundo", texto: "Projetar o fundo e a grelha à parte" }] });
    var Rtop = gr ? D / 2 * Math.SQRT2 : D / 2 * 0.85, aBase = p.aberturaBase > 0 ? p.aberturaBase / 2 : Math.max(Rtop, Ht / 8);
    var nPan = p.paineis > 0 ? Math.round(p.paineis) : Math.max(2, Math.ceil(Ht / 4.0 - 1e-9)), hp = Ht / nPan;
    var V = vento(p, R, Ht + p.H + (R.teto.flecha || 0), D), nivel = p.H - p.bordaLivre, area = PI * D * D / 4;
    var Wagua = 9.81 * p.G * nivel * area, Wcuba = R.pesosKN.total, Wgrade = 0;
    /* grelha do fundo: vigas W entre pilares (vão = lado do polígono do topo) — escolha pela flexão com a carga da água */
    var lado = 2 * Rtop * Math.sin(PI / nP), P = Perf(), Ws = P ? P.listar("W").map(function (n) { return P.obter(n); }).filter(Boolean) : [], viga = null;
    Ws.sort(function (a, b) { return a.massa - b.massa; });
    if (gr) { viga = P.obter(gr.vigaPerimetro); Wgrade = (gr.massa - PI * D * D / 4 * gr.t / 1000 * RHO) * G_ACC / 1000; }
    else {
      var wv = (Wagua + Wcuba) / (nP * lado), Mv = 1.4 * wv * lado * lado / 8;
      for (var i = 0; i < Ws.length; i++) { if (Mv <= Ws[i].Zx * 250 / 1.1 / 1e6) { viga = Ws[i]; break; } }
      if (viga) Wgrade = viga.massa * lado * nP * 2 * G_ACC / 1000;
    }
    /* vento na cuba + na torre (barras: Ca = 2,0 por barra, sem proteção mútua — conferir NBR 6123, 7) */
    var vkC = V.vk(Ht + p.H / 2), caC = caTabela10(p.H / D, 70000 * vkC * D, V.superficie).Ca, Fc = caC * V.q(Ht + p.H / 2) * D * p.H, zc = Ht + p.H / 2;
    var Ft = 0, Mt = 0, larg = 0.2, fPain = [];
    for (var k = 0; k < nPan; k++) { var zm = (k + 0.5) * hp, area2 = (2 * larg + 2 * 0.08 * Math.sqrt(1 + Math.pow(hp / (2 * aBase), 2))) * hp, f = 2.0 * V.q(zm) * area2; Ft += f; Mt += f * zm; fPain.push(f); }
    var Fup = 1.44 * Math.pow(V.vk(Ht + p.H) * 3.6 / 190, 2) * area, M = Fc * zc + Mt + Fup * D / 2, Vb = Fc + Ft;
    /* pilares: N = W/n ± M/(braço) — pior direção (diagonal para 4 pilares: um pilar sozinho no braço a·√2) */
    /* pilares igualmente espaçados no círculo de raio a: Σx² = n·a²/2 → a força do binário no pilar mais afastado é 2·M/(n·a) */
    var Wtot = Wagua + Wcuba + Wgrade, dNm = 2 * M / (nP * aBase), braco = nP * aBase / 2, nLado = 1;
    var Nmax = Wtot / nP + dNm, Nmin = (Wcuba + Wgrade) / nP - dNm;
    var Nd = 1.4 * Nmax, tubos = P ? P.listar("HSSC").map(function (n) { return P.obter(n); }).filter(Boolean) : [], pil = null, cc = null;
    tubos.sort(function (a, b) { return a.massa - b.massa; });
    for (var j = 0; j < tubos.length; j++) { var c = compressao(tubos[j], hp, 250); if (c.esb <= 200 && Nd <= c.NcRd) { pil = tubos[j]; cc = c; break; } }
    /* diagonais (X, só tração): cortante do painel mais baixo dividida pelas duas faces paralelas ao vento */
    /* diagonais: largura da face = lado do polígono da base (2·a·sen(π/n)); a face mais carregada leva 2·V/n (Σcos² = n/2) */
    var wFace = 2 * aBase * Math.sin(PI / nP), Vp = Vb, ang = Math.atan2(hp, wFace), Nd2 = 1.4 * (2 * Vp / nP) / Math.cos(ang), angs = P ? P.listar("L").map(function (n) { return P.obter(n); }).filter(function (q) { return q && q.a === q.b; }) : [], dg = null;
    angs.sort(function (a, b) { return a.massa - b.massa; });
    for (var m = 0; m < angs.length; m++) { var Lg = Math.sqrt(hp * hp + wFace * wFace), rmin = cantoneiraProps(angs[m]).rv; if (Lg * 1000 / rmin > 300) continue; if (Nd2 <= 0.9 * angs[m].A * 250 / 1.1 / 1000) { dg = angs[m]; break; } }
    /* análise do pórtico espacial (js/acoanalise.js): o equilíbrio de painel acima vira só o pré-dimensionamento e a conferência */
    var ta = torreAnalise(p, R, { nP: nP, nPan: nPan, Ht: Ht, Rb: aBase, Rt: Rtop, Wcuba: Wcuba, Wgrade: Wgrade, Wagua: Wagua, Fc: Fc, zc: zc, Fup: Fup, forcasPainel: fPain, viga: viga, pilar: pil ? pil.nome : null, diagonal: dg ? dg.nome : null });
    if (ta && ta.ok) {
      pil = ta.pilar; dg = ta.diagonal;
      var e = ta.env, vp = ta.vp, vd = ta.vd, vtr = ta.vt;
      R.verificacoes.push({ nome: "Torre — pilares (" + pil.nome + ")", item: "NBR 8800:2008, 5.3 e 5.5.1.2 (compressão com flexão; K = 1 no painel); esforços do pórtico espacial com 2ª ordem (js/acoanalise.js)", passos: [
        passo("Modelo", nP + " pilares contínuos, " + nPan + " painéis, travessas, vigas do topo e diagonais em X rotuladas, fundo da cuba como diafragma, bases rotuladas — " + ta.nGL + " graus de liberdade, " + ta.iteracoes + " rodada(s) até os perfis pararem de mudar", ta.amp > 1 ? ta.metodo.replace("B2", "B2 = " + br(ta.amp, 3) + " (λcr = " + br(ta.lambda, 2) + ")") : "análise " + ta.metodo),
        passo("Combinações (ELU)", ta.combs.filter(function (c) { return c.id !== "SERV"; }).map(function (c) { return c.nome; }).join("; ") + " — fatores a favor da segurança (conferir NBR 8681:2025)", "pior: " + e.pil.comb),
        passo("Compressão máxima no pilar", "Nd (envoltória)", br(e.pil.Nc, 1) + " kN"),
        passo("Momento máximo no pilar", "Md (envoltória, √(My² + Mz²))", br(e.pil.M, 2) + " kN·m"),
        passo("Resistência à compressão", "Nc,Rd = χ·A·fy/1,10 (L = " + br(ta.Lleg, 2) + " m; λ0 = " + br(vp.c.l0, 3) + ", χ = " + br(vp.c.chi, 3) + ")", br(vp.c.NcRd, 1) + " kN"),
        passo("Resistência à flexão", "MRd = Z·fy/1,10", br(vp.MRd, 2) + " kN·m"),
        passo("Interação", (e.pil.Nc / vp.c.NcRd >= 0.2 ? "Nd/NRd + 8/9·Md/MRd" : "Nd/(2·NRd) + Md/MRd") + " ≤ 1", br(vp.int, 3)),
        passo("Conferência por equilíbrio de painel", "N = W/n + M/braço (característico) = " + br(Nmax, 1) + " kN × 1,4", br(1.4 * Nmax, 1) + " kN")
      ], resistencia: 1, solicitante: vp.int, unidade: "", razao: vp.int, ok: vp.ok, conferir: true });
      R.verificacoes.push({ nome: "Torre — diagonais (" + dg.nome + ")", item: "NBR 8800:2008, 5.2 e 5.3 (tração com Ae ≈ 0,75·A — conferir com a ligação; compressão no cruzamento)", passos: [
        passo("Tração máxima", "Nt,Sd (envoltória, " + e.dg.comb + ")", br(e.dg.Nt, 1) + " kN"),
        passo("Resistência à tração", "Nt,Rd = mín(A·fy/1,10; 0,75·A·fu/1,35)", br(vd.NtRd, 1) + " kN"),
        passo("Compressão máxima", "Nc,Sd (envoltória, " + (e.dg.combC || "—") + ")", br(e.dg.Nc, 1) + " kN"),
        passo("Resistência à compressão", "Nc,Rd = χ·Q·A·fy/1,10, L/2 = " + br(ta.Ldg / 2, 2) + " m (cruzamento ligado); r_mín = " + br(vd.c.rv, 1) + " mm (eixo principal), b/t = " + br(vd.c.bt, 1) + " → Q = " + br(vd.c.Q, 3) + "; λ0 = " + br(vd.c.l0, 3), br(vd.c.NcRd, 1) + " kN"),
        passo("Esbeltez", "máx(esbeltez equivalente da cantoneira ligada por uma aba; L/r_mín) ≤ 200", br(vd.esb, 0))
      ], resistencia: 1, solicitante: Math.max(e.dg.Nt / vd.NtRd, e.dg.Nc / vd.c.NcRd), unidade: "", razao: Math.max(e.dg.Nt / vd.NtRd, e.dg.Nc / vd.c.NcRd), ok: vd.ok, conferir: true });
      R.verificacoes.push({ nome: "Torre — travessas (" + ta.travessa.nome + ")", item: "NBR 8800:2008, 5.3 e Anexo F (cantoneira simples: eixo principal de menor inércia, Q; esbeltez equivalente da cantoneira ligada por uma aba — conferir)", passos: [
        passo("Compressão máxima", "Nc,Sd (envoltória, " + e.tr.comb + ")", br(e.tr.Nc, 1) + " kN"), passo("Resistência", "Nc,Rd = χ·Q·A·fy/1,10 (L = " + br(ta.Ltr, 2) + " m; r_mín = " + br(vtr.c.rv, 1) + " mm; Q = " + br(vtr.c.Q, 3) + "; esbeltez " + br(vtr.c.esb, 0) + " ≤ 200)", br(vtr.c.NcRd, 1) + " kN")
      ], resistencia: vtr.c.NcRd, solicitante: e.tr.Nc, unidade: "kN", razao: e.tr.Nc / Math.max(vtr.c.NcRd, 1e-9), ok: vtr.ok, conferir: true });
      R.verificacoes.push({ nome: "Torre — deslocamento do topo (serviço)", item: "limite H/400 adotado (critério de projeto — conferir)", passos: [passo("Deslocamento horizontal do topo", "1,0·G + 1,0·L + 1,0·W0", br(ta.dTopo * 1000, 1) + " mm"), passo("Limite", "H/400", br(Ht / 400 * 1000, 1) + " mm")],
        resistencia: Ht / 400, solicitante: ta.dTopo, unidade: "m", razao: ta.dTopo / (Ht / 400), ok: ta.dTopo <= Ht / 400, conferir: true });

      R.torreAnalise = { metodo: ta.metodo, amp: r3(ta.amp), lambda: ta.lambda ? r2(ta.lambda) : null, pilar: pil.nome, diagonal: dg.nome, travessa: ta.travessa.nome, Nc: r1(e.pil.Nc), M: r2(e.pil.M), Nt: r1(e.dg.Nt), NcDiag: r1(e.dg.Nc), reacaoCompressaoELU: r1(e.reac.comp), reacaoTracaoELU: r1(e.reac.trac), reacaoHorizontalELU: r1(e.reac.H), dTopo: r4(ta.dTopo), iteracoes: ta.iteracoes, nGL: ta.nGL, avisos: ta.avisos };
      if (vp.ok && vd.ok && vtr.ok) R.decisoes.push({ tema: "Torre (pórtico espacial)", decisao: "pilares " + pil.nome + ", diagonais " + dg.nome + ", travessas " + ta.travessa.nome, motivo: "os perfis mais leves que passam com os esforços da análise de 2ª ordem (" + ta.iteracoes + " rodada(s))" });
    } else {
    R.verificacoes.push({ nome: "Torre — pilares" + (pil ? " (" + pil.nome + ")" : ""), item: "NBR 8800:2008, 5.3 (compressão, K = 1 no painel); esforços por equilíbrio de painel", passos: [
      passo("Peso total na torre", "água " + br(Wagua, 0) + " + cuba " + br(Wcuba, 0) + " + grelha " + br(Wgrade, 0), br(Wtot, 1) + " kN"),
      passo("Vento: cuba + torre", "Fcuba = Ca·q·D·H = " + br(Fc, 1) + " kN a " + br(zc, 2) + " m; torre (Ca = 2,0 por barra, conferir) = " + br(Ft, 1) + " kN; sucção no teto " + br(Fup, 1) + " kN", "M = " + br(M, 1) + " kN·m"),
      passo("Força no pilar mais carregado", "N = W/n + 2·M/(n·a), a = " + br(aBase, 3) + " m (Σx² = n·a²/2)", br(Nmax, 1) + " kN"),
      passo("Arrancamento (tanque vazio)", "N = Wvazio/n − 2·M/(n·a)", br(Nmin, 1) + " kN" + (Nmin < 0 ? " → chumbadores à tração" : "")),
      passo("Compressão de cálculo", "Nd = 1,4·N", br(Nd, 1) + " kN"),
      passo("Resistência", pil ? "Nc,Rd = χ·A·fy/1,10 (painel " + br(hp, 2) + " m; λ0 = " + br(cc.l0, 3) + ", χ = " + br(cc.chi, 3) + ")" : "nenhum tubo do catálogo", pil ? br(cc.NcRd, 1) + " kN" : "—")
    ], resistencia: pil ? cc.NcRd : 0, solicitante: Nd, unidade: "kN", razao: pil ? Nd / cc.NcRd : Infinity, ok: !!pil });
      R.verificacoes.push({ nome: "Torre — diagonais" + (dg ? " (" + dg.nome + ")" : ""), item: "NBR 8800:2008, 5.2 (tração, área líquida ≈ 0,90·A — conferir com a ligação)", passos: [
      passo("Cortante no painel de baixo", "V = Fcuba + Ftorre", br(Vp, 1) + " kN"),
      passo("Força na diagonal tracionada", "Nd = 1,4·(2·V/n)/cos α; face de " + br(wFace, 3) + " m, α = " + br(ang * 180 / PI, 1) + "°", br(Nd2, 1) + " kN"),
      passo("Resistência", dg ? "Nt,Rd = 0,90·A·fy/1,10" : "nenhuma cantoneira do catálogo", dg ? br(0.9 * dg.A * 250 / 1.1 / 1000, 1) + " kN" : "—")
    ], resistencia: dg ? 0.9 * dg.A * 250 / 1.1 / 1000 : 0, solicitante: Nd2, unidade: "kN", razao: dg ? Nd2 / (0.9 * dg.A * 250 / 1.1 / 1000) : Infinity, ok: !!dg, conferir: true });
      R.naoVerificado.push("Torre: análise espacial (pórtico com 2ª ordem) não feita — esforços por equilíbrio de painel; conferir no Cálculo › Estrutura desenhada com as peças geradas");
      if (ta && !ta.ok) R.avisos.push("Torre: a análise espacial não fechou (" + ta.motivo + ") — ficaram os esforços por equilíbrio de painel.");
      R.problemas.push({ tipo: "torre", texto: "Análise da torre não fechou" + (ta && ta.motivo ? ": " + ta.motivo : "") + " — no caminho de reserva (equilíbrio de painel) as travessas, que travam os pilares, não são dimensionadas.", solucoes: [{ id: "perfis", texto: "Pilares e diagonais mais robustos, mais painéis ou base mais aberta" }, { id: "estrutura-desenhada", texto: "Calcular a torre no Cálculo › Estrutura desenhada" }] });
    }
    R.torre = { pilares: nP, altura: Ht, paineis: nPan, hPainel: r3(hp), raioTopo: r3(Rtop), raioBase: r3(aBase), pilar: pil ? pil.nome : null, diagonal: dg ? dg.nome : null, travessa: R.torreAnalise ? R.torreAnalise.travessa : null, viga: viga ? viga.nome : null, lado: r3(lado), grelha: gr,
                Nmax: r1(Nmax), Nmin: r1(Nmin), M: r1(M), V: r1(Vb), Fcuba: r1(Fc), Ftorre: r1(Ft), Wagua: r1(Wagua), Wtotal: r1(Wtot),
                massa: r1((pil ? pil.massa * Math.sqrt(Ht * Ht + Math.pow(aBase - Rtop, 2)) * nP : 0) + (dg ? dg.massa * Math.sqrt(hp * hp + 4 * aBase * aBase) * 2 * nP * nPan : 0) + (gr ? gr.massa - PI * D * D / 4 * gr.t / 1000 * RHO : (viga ? viga.massa * lado * nP * 2 : 0)) + nPan * nP * 2 * aBase * 8.0) };
    R.fundacao = { tipo: "blocos sob os pilares", porPilar: { compressao: r1(Nmax), tracao: r1(Math.min(0, Nmin)), cortante: r1(Vb / nP) }, G: { total: r1(Wcuba + Wgrade + R.torre.massa * G_ACC / 1000) }, L: { total: r1(Wagua) }, W: { M: r1(M), V: r1(Vb) },
                   nota: "Valores CARACTERÍSTICOS (G + L + W combinados no pior pilar): conferir a combinação pela NBR 8681 e dimensionar os blocos pela NBR 6122." };
    R.quantitativo.pesos.torre = R.torre.massa; R.quantitativo.pesos.total = r1(R.quantitativo.pesos.total + R.torre.massa);
    /* ligações da torre (placa de base e diagonal em gusset) com os esforços de cálculo da análise (ou do equilíbrio × 1,4) */
    if (pil && dg) {
      var TA = R.torreAnalise, esfL = TA ? { Nc: TA.reacaoCompressaoELU, Nt: Math.max(0, -TA.reacaoTracaoELU), V: TA.reacaoHorizontalELU, Ndt: TA.Nt, Ndc: TA.NcDiag || 0, combC: "envoltória ELU", combT: "envoltória ELU (vazio)" }
                                 : { Nc: 1.4 * Nmax, Nt: 1.4 * Math.max(0, -Nmin), V: 1.4 * Vb / nP, Ndt: Nd2, Ndc: Nd2, fonte: "do equilíbrio de painel × 1,4 (a análise espacial não fechou)" };
      R.torre.ligacoes = ligacoesTorre(p, R, pil.nome || pil, dg.nome || dg, esfL);
    }
    if (!pil || !dg) R.problemas.push({ tipo: "torre", texto: "A torre não fechou com os perfis do catálogo.", solucoes: [{ id: "mais-pilares", texto: "Usar mais pilares ou abrir a base" }] });
    R.decisoes.push({ tema: "Torre", decisao: nP + " pilares " + (pil ? pil.nome : "?") + ", " + nPan + " painéis de " + br(hp, 2) + " m com diagonais " + (dg ? dg.nome : "?") + " em X, base Ø " + br(2 * aBase, 2) + " m", motivo: R.torreAnalise ? "base com abertura ≥ altura/4 e painéis de até 4 m; perfis pela análise do pórtico espacial" : "o perfil mais leve que passa à compressão (pilar) e à tração (diagonal) pelo equilíbrio de painel" });
    return R;
  }

  /* ============================================================ HORIZONTAL (selas, Zick) */
  /* Constantes de Zick para sela de 120°/150° (Pressure Vessel Handbook / ASME VIII-2 4.15) — conferir */
  var ZICK = {
    120: { K1: 0.335, K2a: 1.171, K2b: 0.880, K4: 0.401, K5: 0.760, K6a: 0.053, K6b: 0.0132 },
    150: { K1: 0.485, K2a: 0.799, K2b: 0.485, K4: 0.297, K5: 0.673, K6a: 0.032, K6b: 0.0079 },
    ref: "L. P. Zick (1951), constantes da sela em Megyesy, Pressure Vessel Handbook — conferir", conferir: true
  };
  function zick(o) {
    /* o = { Q (N, carga por sela), R (mm), t (mm, sem CA), L (mm, entre as linhas de tangência), A (mm), H (mm, profundidade do tampo), b (mm, largura da sela), ang (°), S (MPa adm.) } */
    var k = ZICK[o.ang >= 150 ? 150 : 120], Q = o.Q, Rm = o.R, t = o.t, L = o.L, A = o.A, H = o.H || 0, b = o.b;
    var enrij = A <= Rm / 2, K2 = enrij ? k.K2b : k.K2a, K1 = enrij ? 3.14 : k.K1;
    var s1s = Q * A * (1 - (1 - A / L + (Rm * Rm - H * H) / (2 * A * L)) / (1 + 4 * H / (3 * L))) / (K1 * Rm * Rm * t);
    var s1m = Q * L / 4 * ((1 + 2 * (Rm * Rm - H * H) / (L * L)) / (1 + 4 * H / (3 * L)) - 4 * A / L) / (PI * Rm * Rm * t);
    var s2 = K2 * Q / (Rm * t);
    var largEf = b + 1.56 * Math.sqrt(Rm * t), K6 = A / Rm >= 1 ? k.K6a : (A / Rm <= 0.5 ? k.K6b : k.K6b + (k.K6a - k.K6b) * (A / Rm - 0.5) / 0.5);
    var s4 = L >= 8 * Rm ? -Q / (4 * t * largEf) - 3 * K6 * Q / (2 * t * t) : -Q / (4 * t * largEf) - 12 * K6 * Q * Rm / (L * t * t);
    var s5 = -k.K5 * Q / (t * largEf);
    return { s1Sela: s1s, s1Meio: s1m, s2: s2, s4: s4, s5: s5, K1: K1, K2: K2, K6: K6, enrijecido: enrij, largEf: largEf,
             adm: { s1: o.S, s2: 0.8 * o.S, s4: 1.5 * o.S, s5: 0.5 * o.fy } };
  }
  function calcHorizontal(p, R) {
    var D = p.D, L = p.L, Rm = D / 2, ad = tensoesAdm(p.aco), aco = acoDe(p.aco), pr = PRODUTOS[p.produto] || {};
    var A = p.A > 0 ? p.A : Math.min(0.2 * L, 0.5 * Rm);
    /* costado: tensão circunferencial com a coluna de líquido cheia (D) + pressão do respiro */
    var pk = 9.81 * p.G * D + num(p.pv, 0), treq = pk * Rm * 1000 / (ad.Sd * p.E) / 1000 + p.CA, tmin = 5, t = comercial(Math.max(treq, tmin + p.CA * 0, tmin));
    /* C7 — TAMPO PLANO pela flexão de placa: t = d·√(C·P/(S·E)) + CA (forma da ASME VIII-1, UG-34, com C = 0,33 de tampo
       soldado como referência — conferir; P = pressão no fundo do tanque cheio + respiro; S = Sd; E = 1) */
    var Pmpa = pk / 1000, tFlat = D * 1000 * Math.sqrt(0.33 * Pmpa / ad.Sd) + p.CA, tTampoMin = comercial(tFlat), tTampo = Math.max(tTampoMin, t);
    R.verificacoes.push({ nome: "Tampos planos — flexão de placa", item: "forma da ASME VIII-1, UG-34 (tampo plano soldado, C = 0,33 como referência — conferir; a norma de fabricação do tanque aéreo pode permitir tampo enrijecido)", passos: [
      passo("Pressão de cálculo", "P = γ·G·D + pv = " + br(pk, 2) + " kPa (fundo do tanque cheio, a favor da segurança)", br(Pmpa, 4) + " MPa"),
      passo("Espessura exigida", "t = d·√(C·P/(S·E)) + CA = " + br(D * 1000, 0) + " × √(0,33 × " + br(Pmpa, 4) + "/" + br(ad.Sd, 1) + ") + " + br(p.CA, 1), br(tFlat, 2) + " mm"),
      passo("Adotada", "chapa comercial", br(tTampoMin, 2) + " mm")
    ], resistencia: tTampoMin, solicitante: tFlat, unidade: "mm", razao: tFlat / tTampoMin, ok: tFlat <= tTampoMin + 1e-9, conferir: true });
    R.decisoes.push({ tema: "Costado do tanque horizontal", decisao: "Chapa de " + br(t, 1) + " mm", motivo: "tensão circunferencial do líquido cheio (Sd·E) e mínimo construtivo de 5 mm adotado por analogia à API 650, 5.6.1.1 (a norma de fabricação do tanque aéreo horizontal define o mínimo — conferir)" });
    R.verificacoes.push({ nome: "Costado — tensão circunferencial", item: "membrana: t = p·R/(Sd·E) + CA (Sd pela API 650, 5.6.2.1; E = eficiência da junta)", passos: [
      passo("Pressão no fundo do tanque cheio", "p = γ·G·D + pv = 9,81 × " + br(p.G, 2) + " × " + br(D, 2) + " + " + br(num(p.pv, 0), 2), br(pk, 2) + " kPa"),
      passo("Espessura exigida", "t = p·R/(Sd·E) + CA = " + br(pk, 2) + " × " + br(Rm * 1000, 0) + "/(" + br(ad.Sd, 1) + " × 1000 × " + br(p.E, 2) + ") + " + br(p.CA, 1), br(treq, 2) + " mm"),
      passo("Adotada", "máx(t; 5 mm) → chapa comercial", br(t, 2) + " mm")
    ], resistencia: t, solicitante: Math.max(treq, tmin), unidade: "mm", razao: Math.max(treq, tmin) / t, ok: true, conferir: true });
    var vol = PI * D * D / 4 * L, Wliq = 9.81 * p.G * vol;
    var V = vento(p, R, D + p.alturaSela, L); if (V.erro) { R.ok = false; R.motivo = V.erro; return R; }
    var vol95 = vol * 0.95, nivel95 = D * 0.95;
    var vol0 = r2(vol), acs = acessorios(p, R, vol0, { flecha: 0 });
    /* o costado engrossa até as tensões de Zick nas selas passarem (o sistema decide; a outra saída é a chapa de desgaste) */
    var tLimH = Math.min(45, num((acoDe(p.aco) || {}).tmax, 45));
    var Wsh, Wtp, Wtot, Q, z, lim, t0 = t, lista = espessuras().filter(function (x) { return x >= t - 1e-9 && x <= tLimH + 1e-9; });
    if (!lista.length) lista = [t];
    for (var it = 0; it < lista.length; it++) {
      t = lista[it]; tTampo = Math.max(tTampoMin, t);
      Wsh = PI * D * L * t / 1000 * RHO * G_ACC / 1000; Wtp = 2 * PI * D * D / 4 * tTampo / 1000 * RHO * G_ACC / 1000;
      Wtot = Wsh + Wtp + Wliq + (fin(p._acessKg) ? p._acessKg : acs.massa) * G_ACC / 1000; Q = Wtot / 2 * 1000;
      z = zick({ Q: Q, R: Rm * 1000, t: t - p.CA, L: L * 1000, A: A * 1000, H: 0, b: p.bSela * 1000, ang: p.anguloSela, S: ad.Sd, fy: aco.fy }); lim = z.adm;
      if (Math.abs(z.s1Sela) <= lim.s1 && Math.abs(z.s1Meio) <= lim.s1 && Math.abs(z.s2) <= lim.s2 && Math.abs(z.s4) <= lim.s4 && Math.abs(z.s5) <= lim.s5) break;
    }
    /* N1 — o mesmo limite de espessura do aço do vertical (API 650, 4.2.2 / 4.2.1.4) no costado e nos tampos: acima, reprova */
    var okLimH = t <= tLimH + 1e-9 && tTampo <= tLimH + 1e-9;
    R.verificacoes.push({ nome: "Costado e tampos — limite de espessura do aço", item: "API 650, 4.2.2 (" + p.aco + ": até " + tLimH + " mm) e 4.2.1.4 (até 45 mm) — o mesmo limite do tanque vertical", passos: [
      passo("Costado", "espessura final (pressão e selas)", br(t, 1) + " mm"), passo("Tampos planos", "espessura pela flexão de placa", br(tTampo, 1) + " mm"), passo("Limite do aço", "", tLimH + " mm")
    ], resistencia: tLimH, solicitante: Math.max(t, tTampo), unidade: "mm", razao: Math.max(t, tTampo) / tLimH, ok: okLimH, conferir: true });
    if (!okLimH) R.problemas.push({ tipo: "espessura", texto: "Tanque horizontal com " + (tTampo > tLimH ? "tampo de " + br(tTampo, 1) + " mm" : "costado de " + br(t, 1) + " mm") + ": acima do limite de " + tLimH + " mm do " + p.aco + ".", solucoes: [{ id: "desgaste", texto: "Chapa de desgaste na sela ou anel enrijecedor (costado); tampo enrijecido ou conformado (tampos)" }, { id: "geometria", texto: "Reduzir o diâmetro" }] });
    if (t > t0) R.decisoes.push({ tema: "Costado nas selas", decisao: "Costado de " + br(t, 1) + " mm (a pressão pedia " + br(t0, 1) + " mm)", motivo: "a tensão circunferencial no chifre da sela (Zick) passava do admissível; alternativa: chapa de desgaste soldada sob a sela" });
    function vz(nome, val, adm, form) { var ok = Math.abs(val) <= adm + 1e-9; R.verificacoes.push({ nome: "Selas (Zick) — " + nome, item: ZICK.ref, passos: [passo(nome, form, br(val, 1) + " MPa"), passo("Admissível", "", br(adm, 1) + " MPa")], resistencia: adm, solicitante: Math.abs(val), unidade: "MPa", razao: Math.abs(val) / adm, ok: ok, conferir: true }); }
    vz("flexão longitudinal na sela", z.s1Sela, lim.s1, "S1 = Q·A·[1 − (1 − A/L + (R² − H²)/(2AL))/(1 + 4H/3L)]/(K1·R²·t), K1 = " + br(z.K1, 3));
    vz("flexão longitudinal no meio do vão", z.s1Meio, lim.s1, "S1 = (Q·L/4)·[(1 + 2(R² − H²)/L²)/(1 + 4H/3L) − 4A/L]/(π·R²·t)");
    vz("cisalhamento tangencial", z.s2, lim.s2, "S2 = K2·Q/(R·t), K2 = " + br(z.K2, 3) + (z.enrijecido ? " (A ≤ R/2: costado enrijecido pelo tampo)" : ""));
    vz("tensão circunferencial no chifre da sela", z.s4, lim.s4, "S4 = −Q/(4t(b + 1,56√(Rt))) − " + (L >= 8 * Rm ? "3K6·Q/(2t²)" : "12K6·Q·R/(L·t²)") + ", K6 = " + br(z.K6, 4));
    vz("compressão do anel na base da sela", z.s5, lim.s5, "S5 = −K5·Q/(t(b + 1,56√(Rt)))");
    /* vento e tombamento transversal (vazio) */
    var vk = V.vk(D + p.alturaSela), ca = caTabela10(L / 2 / D, 70000 * vk * D, V.superficie), F = ca.Ca * V.q(D + p.alturaSela) * D * L, hc = p.alturaSela + D / 2;
    var Wvazio = Wsh + Wtp + (fin(p._acessKg) ? p._acessKg : acs.massa) * G_ACC / 1000, larguraBase = 2 * Rm * Math.sin(p.anguloSela / 2 * PI / 180), Mres = Wvazio * larguraBase / 2, Mtomb = F * hc;
    R.verificacoes.push({ nome: "Vento transversal — tombamento (vazio)", item: "NBR 6123:1988, 6.3.3 e Tabela 10 (cilindro de eixo horizontal: h = metade do comprimento, 6.3.4)", passos: [
      passo("Ca", "h/l1 = (L/2)/D = " + br(L / 2 / D, 2) + " (" + ca.texto + ")", br(ca.Ca, 2)), passo("Força", "Fa = Ca·q·D·L", br(F, 1) + " kN"),
      passo("Momento de tombamento", "Fa × altura do eixo " + br(hc, 2) + " m", br(Mtomb, 1) + " kN·m"), passo("Momento resistente (vazio)", "W × meia largura de apoio na sela (" + br(larguraBase / 2, 2) + " m)", br(Mres, 1) + " kN·m")
    ], resistencia: Mres / 1.5, solicitante: Mtomb, unidade: "kN·m", razao: Mtomb / (Mres / 1.5), ok: Mtomb <= Mres / 1.5, conferir: true });
    if (Mtomb > Mres / 1.5) R.decisoes.push({ tema: "Selas", decisao: "Chumbar as selas na base", motivo: "o vento transversal tomba o tanque vazio com segurança menor que 1,5" });
    R.naoVerificado.push("Tampos planos: detalhe da solda tampo-costado (o C = 0,33 pressupõe o detalhe da UG-34) e a norma de fabricação do tanque aéreo — conferir");
    R.naoVerificado.push("Selas: chapa de desgaste, alma e base da sela e chumbadores da sela (só a carga por sela é dada)");
    if (pr.inflamavel || pr.combustivel) R.naoVerificado.push("Tanque aéreo de combustível/inflamável: dique de contenção, distâncias e aterramento pela NBR 17505 e NR-20");
    var massaKg = function (kN) { return r1(kN * 1000 / G_ACC); };
    var selaKg = 2 * (p.bSela * (D * 0.6) * 0.0125 + 0.25 * D * 0.6 * 0.0125 * 2 + p.bSela * D * 0.016) * RHO;
    R.geometria = { D: D, L: L, A: r3(A), nivel: r3(nivel95), volumeNominal: r2(vol), volumeUtil: r2(vol95), LD: r3(L / D) };
    R.costado = { aneis: [{ i: 1, t: t, largura: L, treq: r2(treq), massa: massaKg(Wsh) }], tampo: tTampo, n: 1, Sd: ad.Sd };
    R.selas = { n: 2, A: r3(A), angulo: p.anguloSela, b: p.bSela, altura: p.alturaSela, Q: r1(Q / 1000), zick: { s1Sela: r1(z.s1Sela), s1Meio: r1(z.s1Meio), s2: r1(z.s2), s4: r1(z.s4), s5: r1(z.s5) }, massa: r1(selaKg) };
    R.vento = { v0: V.v0, v0Info: V.v0Info, s1: V.s1, classe: V.classe, categoria: V.categoria, S3: V.S3, lat: V.lat, lon: V.lon, ref: V.ref, tanque: { Ca: ca, F: r1(F), Mw: r1(Mtomb), vkTopo: r2(vk) } };
    R.acessorios = acs; R.sismo = sismo(p, R);
    R.fundacao = { tipo: "duas selas", porSela: { vertical: r1(Q / 1000), horizontalVento: r1(F / 2), momentoVento: r1(Mtomb / 2) }, G: { total: r1(Wsh + Wtp) }, L: { total: r1(Wliq) }, W: { V: r1(F), M: r1(Mtomb) },
                   nota: "Valores CARACTERÍSTICOS por sela: combinar pela NBR 8681 e dimensionar as bases pela NBR 6122." };
    var chapas = [{ item: "Costado", t: t, L: p.comprimentoChapa, B: p.larguraChapa, qtd: Math.ceil(L / p.larguraChapa - 1e-9) * Math.ceil(PI * D / p.comprimentoChapa - 1e-9), massa: massaKg(Wsh), obs: "calandrada" },
                  { item: "Tampos planos", t: tTampo, L: D + 0.05, B: D + 0.05, qtd: 2, massa: massaKg(Wtp), obs: "disco Ø " + br(D, 2) + " m" }];
    var pesos = { costado: massaKg(Wsh), tampos: massaKg(Wtp), selas: r1(selaKg), acessorios: acs.massa };
    pesos.total = r1(pesos.costado + pesos.tampos + pesos.selas + pesos.acessorios);
    R.quantitativo = { volumeNominal: r2(vol), volumeUtil: r2(vol95), chapas: chapas,
      solda: [{ item: "Costado — juntas longitudinais", m: r1(Math.ceil(L / p.larguraChapa - 1e-9) * p.larguraChapa) }, { item: "Costado — juntas circunferenciais", m: r1((Math.ceil(L / p.larguraChapa - 1e-9) - 1) * PI * D) }, { item: "Tampo-costado (2 tampos)", m: r1(2 * 2 * PI * D) }],
      pintura: [{ item: "Costado e tampos — externa", m2: r1(PI * D * L + 2 * PI * D * D / 4) }, { item: "Costado e tampos — interna", m2: r1(PI * D * L + 2 * PI * D * D / 4) }, { item: "Acessórios e selas", m2: r1(acs.area + 2 * D * 1.5) }],
      pesos: pesos, pesoChapas: r1(pesos.costado + pesos.tampos) };
    var st = 0; R.quantitativo.solda.forEach(function (s) { st += s.m; }); R.quantitativo.soldaTotal = r1(st);
    R.quantitativo.pinturaInterna = R.quantitativo.pintura[1].m2; R.quantitativo.pinturaExterna = r1(R.quantitativo.pintura[0].m2 + R.quantitativo.pintura[2].m2);
    R.decisoes.push({ tema: "Selas", decisao: "2 selas de " + p.anguloSela + "° a " + br(A, 2) + " m dos tampos", motivo: A <= Rm / 2 ? "A ≤ R/2: o tampo enrijece o costado na sela (Zick) — menores tensões" : "A ≤ 0,2·L (Zick): momentos equilibrados entre sela e meio do vão" });
    return R;
  }

  /* ============================================================ CALCULAR */
  function calcular(par) {
    var e = validar(par); if (e) return { ok: false, motivo: e };
    var p = normalizar(par), pr = PRODUTOS[p.produto];
    var R = { ok: true, tipo: p.tipo, par: p, produto: { id: p.produto, nome: p.nomeProduto || pr.nome, G: p.G, inflamavel: !!pr.inflamavel, combustivel: !!pr.combustivel, potavel: !!pr.potavel },
              aco: acoDe(p.aco), verificacoes: [], decisoes: [], avisos: [], problemas: [], naoVerificado: [], pendencias: [], normas: [] };
    if (fin(num(par && par._acessKg, NaN))) p._acessKg = num(par._acessKg, 0);
    if (p.tipo === "vertical") calcVertical(p, R); else if (p.tipo === "elevado") calcElevado(p, R); else calcHorizontal(p, R);
    if (R.ok === false) return R;
    if (pr.inflamavel || pr.combustivel) R.naoVerificado.push("Junta frágil teto-costado e alívio de emergência (API 650, 5.10.2.6 / API 2000) — não verificados");
    if (pr.inflamavel) { R.avisos.push("Produto INFLAMÁVEL: arranjo, distâncias, bacia de contenção, ventilação de emergência e aterramento pela ABNT NBR 17505 e a NR-20 — não verificados aqui."); R.naoVerificado.push("Requisitos de armazenamento de inflamáveis (NBR 17505, NR-20): bacia de contenção, distâncias, respiro de emergência, aterramento"); }
    else if (pr.combustivel) { R.avisos.push("Produto COMBUSTÍVEL: arranjo e bacia de contenção pela ABNT NBR 17505 e a NR-20 — não verificados aqui."); R.naoVerificado.push("Requisitos de armazenamento de combustíveis (NBR 17505, NR-20)"); }
    if (pr.potavel) R.naoVerificado.push("Água potável: revestimento interno atóxico certificado para contato com água potável (especificar com o fornecedor)");
    if (pr.informado) R.avisos.push("Produto industrial: G = " + br(p.G, 2) + " informado — confirme na FISPQ; compatibilidade química do aço e do revestimento não verificada.");
    R.naoVerificado.push("Fundação: só as cargas (dimensionamento da base pelo projeto de fundação, NBR 6122)");
    R.naoVerificado.push("Temperatura mínima de projeto do metal e tenacidade do aço (API 650, 4.2 e Figura 4-1) — confirmar com a temperatura mínima do local");
    R.naoVerificado.push("Pressão interna acima da atmosférica (API 650, Anexo F) e vácuo acima de 0,25 kPa (Anexo V — recusados na entrada); teto flutuante (Anexos C e H) não é tratado aqui");
    R.naoVerificado.push("Cargas de tubulação nos bocais (API 650, Anexo P)");
    if (pr.agua) R.decisoes.push({ tema: "Norma do tanque de água", decisao: "Cálculo pela API 650 (com a AWWA D100 como referência)", motivo: "no Brasil não há norma específica de tanque metálico de água: os fabricantes usam a API 650, inteira ou em parte, ou a AWWA D100 — o memorial diz isso em vez de citar uma NBR que não trata do assunto" });
    R.naoVerificado.push("Ligações soldadas: procedimento de soldagem, ensaios não destrutivos e teste hidrostático pela norma de fabricação");
    /* fechamento */
    var rz = 0, gov = null, falhas = 0;
    R.verificacoes.forEach(function (v) { if (v.info) return; if (fin(v.razao) && v.razao > rz) { rz = v.razao; gov = v.nome; } if (!v.ok) falhas++; if (v.razao === Infinity) falhas += 0; });
    R.razao = r3(rz); R.governante = gov; R.falhas = falhas; R.aprovado = falhas === 0 && !R.problemas.length;
    /* 1.2.149: o resultado do aço à parte (sem a pendência do fck) — a escolha da H/D econômica não depende do fck */
    R.okVerificacoes = falhas === 0 && !R.problemas.filter(function (x) { return x.tipo !== "fck-fundacao" && x.tipo !== "ancoragem-tanque"; }).length;
    /* a situação dita pelo motor (resumo, memorial e folha usam o mesmo texto): o aço atende, mas há o que NÃO foi feito */
    var sitExt = []; if (R.incompleto) sitExt.push("INCOMPLETO — " + R.incompleto); if (R.aConfirmar) sitExt.push("A CONFIRMAR: falta o fck do concreto da fundação (ancoragem do chumbador não verificada); informe o fck do concreto da fundação");
    R.situacaoTexto = !R.aprovado && R.okVerificacoes && sitExt.length ? "NÃO APROVADO — " + sitExt.join("; ") : null;
    /* normas usadas e pendências de conferência */
    var ns = ["api650", "nbr6123", "nbr15421", "nr12"];
    if (p.tipo !== "horizontal") ns.push("nbr7821");
    if (pr.agua) ns.push("awwaD100");
    if (p.tipo === "horizontal") ns.push("zick");
    if ((R.teto && (R.teto.caibros || R.teto.coluna)) || p.tipo === "elevado") ns.push("nbr8800");
    if (pr.inflamavel || pr.combustivel) ns.push("nbr17505", "nr20");
    var dExt = p.tipo === "horizontal" ? p.D : p.D + 0.02, vNom = R.quantitativo ? R.quantitativo.volumeNominal : 0;
    if ((pr.inflamavel || pr.combustivel) && dExt > 3 && vNom > 20) {
      ns.push("nr13");
      R.avisos.push("NR-13: tanque metálico de armazenamento de fluido inflamável/combustível com Ø externo > 3 m e mais de 20.000 L — entra na NR-13 desde 04/07/2026 (Portaria MTP 1.846/2022): inspeção inicial, periódica e pós-construção a cargo do proprietário (a NR cita a API 653).");
    }
    R.normas = ns.map(function (k) { return clone(NORMAS[k]); });
    R.verificacoes.forEach(function (v) { if (v.conferir && R.pendencias.indexOf(v.item) < 0) R.pendencias.push(v.item); });
    /* M3 — o QUANTITATIVO sai das peças que o gerador do 3D desenha (a mesma geometria → a mesma massa do BIM). Se a massa
       real dos acessórios difere da estimada em mais de 1 %, o cálculo roda de novo com ela (pesos na estabilidade e na fundação). */
    var MTm = dep("MetalTanque", "./metaltanque.js");
    if (MTm && MTm.gerarResultado && MTm.massasPorParte) {
      var kq = 0, gq = null; try { gq = MTm.gerarResultado(R, function () { return "q" + (++kq); }); } catch (eG) { gq = null; }
      if (gq && gq.ok) {
        var mp = MTm.massasPorParte(gq.pecas), q0 = R.quantitativo;
        if (!fin(p._acessKg) && Math.abs(mp.acessorios - R.acessorios.massa) > 0.01 * Math.max(mp.acessorios, 1)) {
          var p2 = clone(par); p2._acessKg = mp.acessorios; var R2 = calcular(p2); if (R2 && R2.ok) { delete R2.par._acessKg; return R2; }
        }
        q0.pesosEstimados = clone(q0.pesos);
        q0.pesos = mp; q0.pesosFonte = "peças do modelo 3D (" + gq.pecas.length + " peças)";
        q0.pesoChapas = r1((mp.costado || 0) + (mp.fundo || 0) + (mp.teto || 0) + (mp.tampos || 0));
        R.acessorios.massaModelo = mp.acessorios;
      }
    }
    R.resumo = resumo(R);
    return R;
  }
  function resumo(R) {
    var q = R.quantitativo || {}, g = R.geometria || {}, p = R.par;
    var t = p.tipo === "horizontal" ? "Tanque horizontal Ø " + br(g.D, 2) + " × " + br(g.L, 2) + " m" : (p.tipo === "elevado" ? "Reservatório elevado Ø " + br(g.D, 2) + " × " + br(g.H, 2) + " m a " + br(p.alturaTorre, 1) + " m" : "Tanque Ø " + br(g.D, 2) + " × " + br(g.H, 2) + " m");
    return t + " — " + br(q.volumeUtil, 1) + " m³ úteis (" + br(q.volumeNominal, 1) + " m³ nominais), " + (R.produto ? R.produto.nome.toLowerCase() : "") + "; " + br(q.pesos ? q.pesos.total : 0, 0) + " kg de aço" + (R.aprovado ? "; verificações atendem" : (R.situacaoTexto ? "; " + R.situacaoTexto : "; NÃO APROVADO — " + (R.falhas + R.problemas.length) + " pendência(s) de cálculo"));
  }

  /* ============================================================ DIMENSIONAR PELO VOLUME (relação H/D econômica)
   * para cada número de anéis (1 a 8 de largura comercial), D sai do volume útil; o motor calcula o tanque inteiro e
   * fica com o de MENOR PESO DE CHAPAS (costado + fundo + teto) que atende, dentro de 0,4 ≤ H/D ≤ 2. */
  function dimensionar(volumeUtil, par) {
    var V = num(volumeUtil, 0); if (!(V >= 1 && V <= 100000)) return { ok: false, motivo: "Volume útil entre 1 e 100.000 m³." };
    var base = normalizar(par || {}), W = base.larguraChapa, alts = [], melhor = null;
    var nMax = base.tipo === "elevado" ? 4 : 8;
    for (var n = 1; n <= nMax; n++) {
      var H = r3(n * W), hl = H - base.bordaLivre - base.hMorto; if (hl < 0.5) continue;
      var D = Math.sqrt(4 * V / (PI * hl)); D = Math.ceil(D * 20 - 1e-9) / 20;
      var hd = H / D; if (hd < 0.35 || hd > 2.0 || D > 61 || D < 1.0) continue;
      var q = clone(base); q.H = H; q.D = r2(D);
      var r = calcular(q); if (!r.ok) continue;
      var m = r.quantitativo.pesoChapas, ok = r.okVerificacoes;   /* 1.2.149: sem o fck a base fica A CONFIRMAR, mas a geometria é a mesma */
      alts.push({ aneis: n, H: H, D: q.D, HD: r3(hd), peso: m, pesoTotal: r.quantitativo.pesos.total, aprovado: ok, volumeUtil: r.quantitativo.volumeUtil, _q: q, _r: r });
    }
    /* o mais leve que atende; entre os que ficam a até 3 % dele, o de H/D mais perto de 1 (menos vento, acesso mais curto, base menor) */
    var oks = alts.filter(function (x) { return x.aprovado; }), pMin = Infinity;
    oks.forEach(function (x) { if (x.peso < pMin) pMin = x.peso; });
    oks.filter(function (x) { return x.peso <= pMin * 1.03 + 1e-9; }).forEach(function (x) { if (!melhor || Math.abs(Math.log(x.HD)) < Math.abs(Math.log(melhor.par.H / melhor.par.D))) melhor = { par: x._q, r: x._r, peso: x.peso, n: x.aneis }; });
    var maisLeve = oks.filter(function (x) { return x.peso === pMin; })[0];
    alts.forEach(function (x) { delete x._q; delete x._r; });
    if (!melhor) { var semOk = alts.length ? alts.slice().sort(function (a, b) { return a.peso - b.peso; })[0] : null; if (!semOk) return { ok: false, motivo: "Nenhuma combinação de D e H atende ao volume com 0,35 ≤ H/D ≤ 2.", alternativas: alts }; var q2 = clone(base); q2.H = semOk.H; q2.D = semOk.D; melhor = { par: q2, r: calcular(q2), peso: semOk.peso, n: semOk.aneis }; }
    var j = "Relação H/D econômica: de " + alts.length + " alturas possíveis (1 a " + nMax + " anéis de " + br(W, 2) + " m), a de menor peso de chapas (costado + fundo + teto) que atende é " + (maisLeve && Math.abs(maisLeve.peso - melhor.peso) > 0.5 ? "H = " + br(maisLeve.H, 2) + " m (" + br(maisLeve.peso, 0) + " kg); entre as alternativas até 3 % mais pesadas ficou a de H/D mais perto de 1: " : "") + "H = " + br(melhor.par.H, 2) + " m com D = " + br(melhor.par.D, 2) + " m (H/D = " + br(melhor.par.H / melhor.par.D, 2) + "; " + br(melhor.peso, 0) + " kg). " +
            "Tanque baixo e largo gasta fundo e teto; alto e estreito gasta costado (a espessura cresce com a altura do líquido)." ;
    melhor.r.decisoes.unshift({ tema: "Dimensões (H/D econômica)", decisao: "D = " + br(melhor.par.D, 2) + " m, H = " + br(melhor.par.H, 2) + " m (" + melhor.n + " anel(éis))", motivo: j });
    return { ok: true, par: melhor.par, resultado: melhor.r, alternativas: alts, justificativa: j };
  }

  /* ============================================================ MODELOS PRONTOS (dimensionados pelo motor na hora) */
  var MODELOS = [
    { id: "agua-5", nome: "Água potável 5 m³", volume: 5, par: { tipo: "vertical", produto: "agua-potavel", teto: "conico-autoportante", larguraChapa: 1.8 } },
    { id: "agua-10", nome: "Água potável 10 m³", volume: 10, par: { tipo: "vertical", produto: "agua-potavel", teto: "conico-autoportante", larguraChapa: 1.8 } },
    { id: "agua-20", nome: "Água potável 20 m³", volume: 20, par: { tipo: "vertical", produto: "agua-potavel", teto: "conico-autoportante" } },
    { id: "agua-50", nome: "Água potável 50 m³", volume: 50, par: { tipo: "vertical", produto: "agua-potavel", teto: "conico-autoportante" } },
    { id: "agua-100", nome: "Água potável 100 m³", volume: 100, par: { tipo: "vertical", produto: "agua-potavel", teto: "conico-autoportante" } },
    { id: "agua-250", nome: "Água potável 250 m³", volume: 250, par: { tipo: "vertical", produto: "agua-potavel", teto: "conico-autoportante" } },
    { id: "agua-500", nome: "Água potável 500 m³", volume: 500, par: { tipo: "vertical", produto: "agua-potavel", teto: "conico-autoportante" } },
    { id: "agua-1000", nome: "Água potável 1.000 m³", volume: 1000, par: { tipo: "vertical", produto: "agua-potavel", teto: "domo" } },
    { id: "diesel-h15", nome: "Diesel horizontal 15 m³", volume: 15, par: { tipo: "horizontal", produto: "diesel", D: 2.2, L: 4.2 } },
    { id: "diesel-h30", nome: "Diesel horizontal 30 m³", volume: 30, par: { tipo: "horizontal", produto: "diesel", D: 2.6, L: 6.0 } },
    { id: "oleo-1000", nome: "Óleo combustível 1.000 m³", volume: 1000, par: { tipo: "vertical", produto: "oleo-combustivel", teto: "conico-suportado", inclTeto: 3.58 } },
    { id: "oleo-5000", nome: "Óleo combustível 5.000 m³", volume: 5000, par: { tipo: "vertical", produto: "oleo-combustivel", teto: "conico-suportado", inclTeto: 3.58 } },
    { id: "elevado-50", nome: "Reservatório elevado 50 m³ a 15 m", volume: 50, par: { tipo: "elevado", produto: "agua-potavel", alturaTorre: 15, teto: "conico-autoportante" } }
  ];
  var _cacheMod = {};
  function modelo(id) {
    var m = MODELOS.filter(function (x) { return x.id === id; })[0]; if (!m) return null;
    if (_cacheMod[id]) return clone(_cacheMod[id]);
    var o;
    if (m.par.tipo === "horizontal") { var r = calcular(m.par); o = { id: m.id, nome: m.nome, volume: m.volume, par: r.ok ? r.par : normalizar(m.par), resumo: r.ok ? r.resumo : r.motivo, justificativa: "Ø " + br(m.par.D, 2) + " × " + br(m.par.L, 2) + " m (L/D ≈ " + br(m.par.L / m.par.D, 1) + ": transporte rodoviário e selas a A ≤ R/2)", peso: r.ok ? r.quantitativo.pesos.total : 0, aprovado: r.ok && r.aprovado }; }
    else { var d = dimensionar(m.volume, m.par); o = { id: m.id, nome: m.nome, volume: m.volume, par: d.ok ? d.par : normalizar(m.par), resumo: d.ok ? d.resultado.resumo : d.motivo, justificativa: d.ok ? d.justificativa : d.motivo, peso: d.ok ? d.resultado.quantitativo.pesos.total : 0, aprovado: d.ok && d.resultado.aprovado, okVerificacoes: d.ok && !!d.resultado.okVerificacoes, aConfirmar: d.ok ? d.resultado.aConfirmar || null : null }; }   /* 1.2.149: o elevado sai A CONFIRMAR até o fck dos blocos */
    o.par.nome = m.nome;
    _cacheMod[id] = o; return clone(o);
  }
  function modelos() { return MODELOS.map(function (m) { return modelo(m.id); }); }

  var AcoTanque = {
    TIPOS: TIPOS, TETOS: TETOS, PRODUTOS: PRODUTOS, ACOS: ACOS, NORMAS: NORMAS, PADRAO: PADRAO, TAB10: TAB10, ZICK: ZICK, MODELOS_ID: MODELOS.map(function (m) { return m.id; }),
    padrao: padrao, normalizar: normalizar, validar: validar, calcular: calcular, dimensionar: dimensionar, modelos: modelos, modelo: modelo,
    caTabela10: caTabela10, tensoesAdm: tensoesAdm, umPe: umPe, tMinCostado: tMinCostado, zick: zick, acessosRef: acessosRef, espessuras: espessuras, comercial: comercial,
    acoDe: acoDe, secaoAnel: secaoAnel, compressao: compressao, br: br, reforco: reforco, T56A: T56A, npsDe: npsDe, ligacoesTorre: ligacoesTorre, cantoneiraComp: cantoneiraComp, cantoneiraProps: cantoneiraProps
  };
  global.AcoTanque = AcoTanque;
  if (typeof module !== "undefined" && module.exports) module.exports = AcoTanque;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
