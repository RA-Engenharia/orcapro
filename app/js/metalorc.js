/* =====================================================================
 * metalorc.js — METÁLICA: ORÇAMENTO 100 % DA ESTRUTURA DE AÇO (por PESO)
 * Motor puro (ES5, Node-testável) + o diálogo e o "Criar o orçamento".
 *
 * Pedido (frente F2, 21/10/2026): a pintura saía "SEM preço e SEM código
 * SINAPI" (js/metalpintura.js) e a estrutura só por COMPRIMENTO no agente da
 * EAP (js/bimeap.js, regra estrutura-metalica). Aqui sai o orçamento inteiro:
 *   1. ESTRUTURA por kg (o MESMO kg do js/metalfab.js listas e do
 *      js/bimpeso.js: a massa das peças do modelo) — fornecimento,
 *      fabricação (corte, solda) e montagem, por tipo de peça:
 *        perfil laminado/soldado (W, H, I, U/C laminado, L, tubo, barra) → PROP-MET-9001
 *        perfil formado a frio (Ue, U, Z da NBR 6355; chapa dobrada)    → PROP-MET-9002
 *        chapas (ligação, placa de base, enrijecedor, gusset)           → PROP-MET-9003
 *   2. LIGAÇÕES: parafusos por diâmetro (conjunto A325 + porca pesada +
 *      2 arruelas, instalado), porcas/arruelas dos tirantes e chumbadores.
 *   3. PROTEÇÃO: jateamento + pintura por demão (SINAPI, área pela
 *      geometria — a mesma do js/metalpintura.js) OU galvanização a fogo
 *      (kg: a cotação do galvanizador ou, sem ela, PROP-MET-9031 provisória).
 *   4. IÇAMENTO: com o PLANO DE IÇAMENTO da obra (bim_icamento) as horas do
 *      plano no equipamento SINAPI equivalente; sem ele, o guindauto de
 *      montagem pelo coeficiente da SICRO (0,00502 h/kg).
 *   5. FRETE da fábrica à obra (t × km) + carga/manobra/descarga (t).
 *
 * ⚠ O QUE A SINAPI MG 06/2026 TEM (conferido na base do repositório em
 *   21/10/2026): NÃO tem composição de estrutura de perfil laminado ou
 *   soldado por kg. Tem só 100377/100378 (tesoura de U dobrado #3 +
 *   cantoneira, INCLUSO IÇAMENTO) e 104314 (trama de terças INCLUSOS
 *   parafusos A307 e transporte vertical) — usar as duas cobraria em dobro
 *   o parafuso e o içamento que este orçamento mede peça a peça, por isso
 *   NÃO entram (estão no memorial como referência). Tem, e são usadas:
 *   pintura por demão em perfil em fábrica (100719, 100727, 100729,
 *   100739), jateamento 100716, guindaste/guindauto CHP, transporte TXKM
 *   (106689/106690) e carga/descarga de perfil 106721.
 * ⚠ COMPOSIÇÕES PRÓPRIAS DE FÁBRICA (PROP-MET-90xx, insumos PROP-94xx —
 *   códigos conferidos sem colisão em todos os ramos em 21/10/2026):
 *   COEFICIENTES da SICRO/DNIT ES 04/2026 (2408149 estrutura em perfil
 *   ASTM A36 corte/solda/montagem: 15 kg/h com montador + ajudante, aço
 *   ×1,03, solda 0,015 kg/kg; 2408058 solda E70XX: 2,81 kg/h; 4806395
 *   fixação de parafuso: 10 un/h; 0407740 chumbador: 0,15 h/kg). PREÇOS:
 *   mão de obra e eletrodo da SINAPI MG 06/2026; o que a SINAPI não tem,
 *   o MAIOR preço público achado, com a fonte e a data, marcado
 *   "provisório — cotar com o fornecedor" (regra RA: 100 % orçado, na
 *   incerteza o mais alto). NADA "A COTAR".
 * ⚠ SEM COBRANÇA DUPLA: a tinta em litros do js/metalpintura.js NÃO vira
 *   linha (a composição SINAPI por demão já tem a tinta); o guindauto de
 *   montagem sai só para o peso que o plano de içamento não levanta; o
 *   agente da EAP (js/bimeap.js) passa a medir a metálica por kg e o
 *   aviso dele manda usar este orçamento, não os dois.
 * ⚠ GALVANIZAÇÃO SEM PREÇO PÚBLICO (SINAPI, SICRO, SETOP, SEINFRA, ORSE,
 *   IOPES e GOINFRA do repositório + busca na web em 21/10/2026): sem a
 *   cotação, sai a composição própria PROVISÓRIA PROP-MET-9031 pelo maior
 *   preço público derivável (diferencial galvanizado − preto da SINAPI,
 *   PROP-9417) + a viagem à galvanizadora; o cartão vira AVISO (informar a
 *   cotação ou voltar à pintura). Nunca bloqueia, nada "A COTAR" (revisor).
 * Teste: node tools/test-metal-orc.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  function Fab() { return dep("BimMetalFab", "./metalfab.js"); }
  function Pint() { return dep("BimMetalPintura", "./metalpintura.js"); }
  function Acab() { return dep("BimMetalAcab", "./metalacab.js"); }
  function Peso() { return dep("BimPeso", "./bimpeso.js"); }
  function Norma() { return dep("BimMetalNorma", "./metalnorma.js"); }
  function Aco() { return dep("PerfisAco", "./perfisaco.js"); }
  function IcCat() { return dep("IcarCatalogo", "./icarcatalogo.js"); }
  function IcPl() { return dep("IcarPlano", "./icarplano.js"); }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function r2(v) { return Math.round((num(v, 0) + 1e-9) * 100) / 100; }
  function r3(v) { return Math.round(num(v, 0) * 1000) / 1000; }
  function r4(v) { return Math.round(num(v, 0) * 10000) / 10000; }
  function tr2(v) { return Math.floor(num(v, 0) * 100 + 1e-7) / 100; }   /* trunca em 2 casas (padrão TCU, o do app) */
  function br(v, c) { c = c == null ? 2 : c; var s = (Math.round(num(v, 0) * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c), neg = s.charAt(0) === "-"; if (neg) s = s.slice(1); var p = s.split("."); return (neg ? "-" : "") + p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (p[1] ? "," + p[1] : ""); }
  function semAcento(s) { return txt(s).normalize ? txt(s).normalize("NFD").replace(/[̀-ͯ]/g, "") : txt(s); }

  var DATA_FAB = "2026-10-21T12:00:00.000Z";
  var FONTE_SICRO = "SICRO/DNIT ES 04/2026 (relatório analítico, data/sicro-ES-analitico.json)";
  var FONTE_SINAPI = "SINAPI MG 06/2026 não desonerada (data/sinapi-MG-2026-06.json e analítico)";

  /* ================================================================ INSUMOS PRÓPRIOS (PROP-94xx)
   * Só o que a SINAPI MG não tem. `prov` = provisório: cotar com o fornecedor (outra UF, outra data ou bitola fora da tabela). */
  function ins(codigo, descricao, unidade, preco, categoria, fonte, prov) {
    var o = { codigo: codigo, descricao: descricao, unidade: unidade, custoUnitario: preco, custoMO: categoria === "MO" ? preco : 0, custoMAT: categoria === "MAT" ? preco : 0, custoEQ: categoria === "EQ" ? preco : 0,
              tipoItem: "insumo", origem: "PROPRIA", categoria: categoria, criadoEm: DATA_FAB, atualizadoEm: DATA_FAB, criadoPor: "RA Engenharia — " + fonte };
    if (prov) o.provisorio = prov;
    return o;
  }
  var INSUMOS = [
    ins("PROP-9401", "ACO EM PERFIL LAMINADO OU SOLDADO (W, H, I, U/C, L, TUBO, BARRA), ASTM A572 GR.50 OU A36, QUALQUER BITOLA", "kg", 12.87, "MAT",
        "maior preço público achado em 21/10/2026: SICRO ES 04/2026 M0946 'Aço em perfis ASTM A572 grau 50' R$ 12,8653/kg (arredondado para cima). Outras: SICRO M0682 A36 R$ 10,9172; SINAPI MG 06/2026 43082 'PERFIL I OU W EM ACO LAMINADO' R$ 10,00",
        "preço de outra UF (SICRO ES 04/2026) — cotar o aço com o fornecedor"),
    ins("PROP-9402", "CHAPA DE ACO ASTM A36/A572, QUALQUER ESPESSURA (LIGACOES, PLACAS DE BASE, ENRIJECEDORES)", "kg", 10.77, "MAT",
        "maior preço das chapas grossas ASTM A36 da SINAPI MG 06/2026: 43667 (1\") R$ 10,77/kg; 1330 (1/4\") 8,89; 1332 (3/8\") 9,12; 1333 (1/2\") 8,97; 1334 (5/8\") 10,11; 10957 (3/4\") 10,25; 1335 (7/8\") 10,45", null),
    ins("PROP-9403", "PERFIL DE ACO FORMADO A FRIO (U, UE, Z, CANTONEIRA DOBRADA — NBR 6355), QUALQUER BITOLA", "kg", 9.12, "MAT",
        "maior preço dos perfis dobrados da SINAPI MG 06/2026 (analítico): 43692 U 200x50 #3 R$ 9,12/kg; 43083 Ue 200x75 #3,75 8,66; 40535 U 75x40 8,66; 40598 U 125x50 8,45", null),
    ins("PROP-9404", "PARAFUSO ESTRUTURAL ASTM A325, CABECA SEXTAVADA, ROSCA PARCIAL, DIAMETRO ATE 12,7 MM (1/2\" / M12)", "un", 3.39, "MAT",
        "maior A325 Ø 12,7 da SICRO ES 04/2026: M0954 C = 57,15 mm R$ 3,3875 (arredondado para cima)", "preço de outra UF (SICRO ES 04/2026) — cotar com o fornecedor de fixadores"),
    ins("PROP-9405", "PARAFUSO ESTRUTURAL ASTM A325, CABECA SEXTAVADA, ROSCA PARCIAL, DIAMETRO 16 MM (5/8\" / M16)", "un", 5.91, "MAT",
        "maior A325 Ø 16 da SICRO ES 04/2026: M0957 C = 63,5 mm R$ 5,9088", "preço de outra UF (SICRO ES 04/2026) — cotar com o fornecedor de fixadores"),
    ins("PROP-9406", "PARAFUSO ESTRUTURAL ASTM A325, CABECA SEXTAVADA, ROSCA PARCIAL, DIAMETRO 20 MM (3/4\" / M20)", "un", 8.74, "MAT",
        "maior A325 Ø 20 da SICRO ES 04/2026: M0961 C = 76,2 mm R$ 8,7358", "preço de outra UF (SICRO ES 04/2026) — cotar com o fornecedor de fixadores"),
    ins("PROP-9408", "PORCA SEXTAVADA PESADA ASTM A194 2H, DIAMETRO ATE 12,7 MM", "un", 1.23, "MAT", "SICRO ES 04/2026 M0966 R$ 1,2225", "preço de outra UF (SICRO ES 04/2026) — cotar com o fornecedor de fixadores"),
    ins("PROP-9409", "PORCA SEXTAVADA PESADA ASTM A194 2H, DIAMETRO 16 MM", "un", 2.10, "MAT", "SICRO ES 04/2026 M0967 R$ 2,10", "preço de outra UF (SICRO ES 04/2026) — cotar com o fornecedor de fixadores"),
    ins("PROP-9410", "PORCA SEXTAVADA PESADA ASTM A194 2H, DIAMETRO 20 MM", "un", 3.93, "MAT", "SICRO ES 04/2026 M0968 Ø 20 R$ 3,9215 (o maior publicado)", "preço de outra UF (SICRO ES 04/2026) — cotar com o fornecedor de fixadores"),
    ins("PROP-9411", "ARRUELA LISA ASTM F436, DIAMETRO ATE 12,7 MM", "un", 0.91, "MAT", "SICRO ES 04/2026 M0948 R$ 0,906", "preço de outra UF (SICRO ES 04/2026) — cotar com o fornecedor de fixadores"),
    ins("PROP-9412", "ARRUELA LISA ASTM F436, DIAMETRO 16 MM", "un", 1.34, "MAT", "SICRO ES 04/2026 M0949 R$ 1,3388", "preço de outra UF (SICRO ES 04/2026) — cotar com o fornecedor de fixadores"),
    ins("PROP-9413", "ARRUELA LISA ASTM F436, DIAMETRO 20 MM", "un", 1.60, "MAT", "SICRO ES 04/2026 M0950 Ø 20 R$ 1,60 (o maior publicado)", "preço de outra UF (SICRO ES 04/2026) — cotar com o fornecedor de fixadores"),
    ins("PROP-9414", "CORTE DE PERFIS E CHAPAS COM MACARICO OXIACETILENO (POR KG DE ESTRUTURA)", "kg", 0.07, "MAT",
        "SICRO ES 04/2026 1408173 'Corte de perfis metálicos com maçarico oxiacetileno' R$ 0,07 (coeficiente 1 por kg na 2408149)", "preço de outra UF (SICRO ES 04/2026) — cotar com a fábrica"),
    ins("PROP-9415", "BARRA DE ACO PARA CHUMBADOR, COM PORCAS E ARRUELAS (POR KG) — DIAMETRO ACIMA DE 25 MM", "kg", 39.58, "MAT",
        "maior preço público por kg achado: SINAPI MG 06/2026 39746 'CHUMBADOR DE ACO GALVANIZADO, 1\" X 600 MM, ... INCLUSO PORCA E ARRUELA' R$ 94,44/un ÷ 2,386 kg (barra Ø 25,4 × 600 mm × 7 850 kg/m³). Outra: SICRO M2979 chumbador CA-25 R$ 7,60/kg",
        "chumbador acima de 1\" sem preço público por unidade — cotar com o fornecedor"),
    ins("PROP-9416", "GUINDASTE AUTOPROPELIDO ACIMA DE 60 T — CUSTO HORARIO PRODUTIVO (COM OPERADOR)", "h", 2428.03, "EQ",
        "a SINAPI MG 06/2026 vai até 60 t (93287); maior guindaste público achado: SICRO ES 04/2026 E9094 'Guindaste móvel todo terreno 6 eixos 350 t' R$ 2.428,0269/h produtiva",
        "equipamento do plano acima de 60 t: referência SICRO de 350 t — cotar a locação com a locadora"),
    /* revisor 21/10/2026: a galvanização sem cotação BLOQUEAVA o orçamento (regra do dono: 100 % orçado, na dúvida o mais alto).
       Nenhuma base do repositório publica o serviço; o MAIOR preço público derivável é o diferencial galvanizado − preto dos tubos
       NBR 5580 da SINAPI MG 06/2026 (mesma classe, DN e espessura; o tubo é galvanizado a fogo dentro e fora), por kg de aço preto:
         classe L DN 15 e 2,25: (21008 R$ 19,43 − 20999 R$ 13,99) ÷ 1,06 kg/m = R$ 5,1321/kg  ← o maior
         classe L DN 25 e 2,65: (21010 33,97 − 21001 26,11) ÷ 2,02 = 3,89 · classe L DN 40: (21012 54,71 − 21003 42,91) ÷ 3,34 = 3,53
         classe L DN 80: (21015 114,77 − 21006 91,05) ÷ 7,07 = 3,36 · classe M DN 80: (7694 131,89 − 21024 107,20) ÷ 8,47 = 2,92
       Já tem o ZINCO e o PROCESSO (decapagem, fluxagem, banho). Referência do consumo: ~5 % do peso em zinco hoje (Dr. Thomas H.
       Cook, consultor de galvanização, finishing.com, 19/12/2014; ~10 % há 40 anos) — a peça fina (tubo) consome mais por kg, por
       isso o diferencial do tubo de parede 2,25 mm é o lado alto para perfil estrutural. */
    ins("PROP-9417", "GALVANIZACAO A FOGO POR IMERSAO A QUENTE (NBR 6323) — ZINCO E PROCESSO, POR KG DE ACO", "kg", 5.14, "MAT",
        "maior diferencial público galvanizado − preto por kg (SINAPI MG 06/2026, tubos NBR 5580 classe L DN 15 e = 2,25 mm: 21008 R$ 19,43/m − 20999 R$ 13,99/m, ÷ 1,06 kg/m = R$ 5,1321, arredondado para cima). Outros pares: DN 25 R$ 3,89; DN 40 3,53; DN 80 3,36; classe M DN 80 2,92. Consumo de zinco de referência ~5 % do peso (T. H. Cook, finishing.com, 2014)",
        "sem preço público do serviço de galvanização: maior diferencial galvanizado − preto da SINAPI — provisório, cotar com o galvanizador")
  ];
  /* DIÂMETRO ACIMA DE 20 MM (revisor, 21/10/2026). Antes: parafuso, porca e arruela de qualquer Ø > 20 mm saíam pelo preço do
   * Ø 20 (subcobrava — um M30 pelo preço do M20). Nenhuma base pública do repositório publica A325/A194/F436 acima de 20 mm, então
   * o preço é ESCALADO a partir do Ø 20 da SICRO ES 04/2026 pela regra declarada: parafuso e arruela pela SEÇÃO (d/20)², porca pelo
   * VOLUME (d/20)³ — os expoentes cobrem com folga a progressão publicada 16 → 20 mm (parafuso ×1,48, porca ×1,87, arruela ×1,19 contra
   * 1,56 / 1,95 / 1,56 da regra). Cada classe é cobrada pelo MAIOR diâmetro dela (M22 e 7/8" pelo 22,3; 1" pelo 25,4…) e arredondada
   * para CIMA; diâmetro desconhecido vai para a D36 (o maior do catálogo). Tudo provisório — cotar com o fornecedor de fixadores. */
  var GRANDES = [[22.3, "D22", "22 MM (M22) OU 7/8\""], [24, "D24", "24 MM (M24)"], [25.4, "D25", "25,4 MM (1\")"], [27, "D27", "27 MM (M27)"], [28.6, "D29", "28,6 MM (1.1/8\")"],
                 [30, "D30", "30 MM (M30)"], [31.8, "D32", "31,75 MM (1.1/4\")"], [36, "D36", "36 MM (M36)"], [42, "D42", "42 MM (M42)"], [48, "D48", "48 MM (M48)"], [56, "D56", "56 MM (M56)"], [64, "D64", "64 MM (M64)"]];
  function ce2(v) { return Math.ceil(num(v, 0) * 100 - 1e-7) / 100; }
  var PROV_GR = "sem preço público para Ø acima de 20 mm: escalado do Ø 20 da SICRO ES 04/2026 (parafuso e arruela × (d/20)², porca × (d/20)³) — cotar com o fornecedor de fixadores";
  function insGrande(g) {
    var f = g[0] / 20, k = g[1], d = br(g[0], 1) + " mm", o = [];
    o.push(ins("PROP-9407-" + k, "PARAFUSO ESTRUTURAL ASTM A325, CABECA SEXTAVADA, ROSCA PARCIAL, DIAMETRO " + g[2], "un", ce2(8.7358 * f * f), "MAT",
      "SICRO ES 04/2026 M0961 (A325 Ø 20 × 76,2 mm, R$ 8,7358, o maior publicado) × (" + d + " ÷ 20)² — escala pela seção", PROV_GR));
    o.push(ins("PROP-9410-" + k, "PORCA SEXTAVADA PESADA ASTM A194 2H, DIAMETRO " + g[2], "un", ce2(3.9215 * f * f * f), "MAT",
      "SICRO ES 04/2026 M0968 (porca pesada Ø 20, R$ 3,9215) × (" + d + " ÷ 20)³ — escala pelo volume", PROV_GR));
    o.push(ins("PROP-9413-" + k, "ARRUELA LISA ASTM F436, DIAMETRO " + g[2], "un", ce2(1.60 * f * f), "MAT",
      "SICRO ES 04/2026 M0950 (arruela F436 Ø 20, R$ 1,60) × (" + d + " ÷ 20)² — escala pela seção", PROV_GR));
    return o;
  }
  GRANDES.forEach(function (g) { insGrande(g).forEach(function (x) { INSUMOS.push(x); }); });
  var INS = {}; INSUMOS.forEach(function (x) { INS[x.codigo] = x; });

  /* insumos SINAPI usados dentro das composições próprias (preço MG 06/2026, conferido na base do repositório) */
  var SIN = {
    "88278": { d: "MONTADOR DE ESTRUTURAS METÁLICAS COM ENCARGOS COMPLEMENTARES", u: "h", p: 31.04, c: "MO" },
    "88240": { d: "AJUDANTE DE ESTRUTURA METÁLICA COM ENCARGOS COMPLEMENTARES", u: "h", p: 26.15, c: "MO" },
    "88317": { d: "SOLDADOR COM ENCARGOS COMPLEMENTARES", u: "h", p: 34.70, c: "MO" },
    "88245": { d: "ARMADOR COM ENCARGOS COMPLEMENTARES", u: "h", p: 33.37, c: "MO" },
    "10997": { d: "ELETRODO REVESTIDO AWS - E7018, DIAMETRO IGUAL A 4,00 MM", u: "kg", p: 62.81, c: "MAT" },
    "98764": { d: "INVERSOR DE SOLDA MONOFÁSICO DE 160 A, POTÊNCIA DE 7000 W, TENSÃO DE 220 V - CHP DIURNO. AF_06/2018", u: "h", p: 7.17, c: "EQ" },
    "39746": { d: "CHUMBADOR DE ACO GALVANIZADO, 1\" X 600 MM, PARA POSTES DE ACO COM BASE, INCLUSO PORCA E ARRUELA", u: "un", p: 94.44, c: "MAT" }
  };

  /* ================================================================ COMPOSIÇÕES PRÓPRIAS (PROP-MET-90xx) */
  function linhaIns(cod, coef, memoria) {
    var s = SIN[cod], p = INS[cod];
    if (s) return { codigo: cod, descricao: s.d, unidade: s.u, coeficiente: coef, custoUnitario: s.p, categoria: s.c, tipo: "insumo", fonte: "SINAPI", memoria: memoria };
    return { codigo: cod, descricao: p.descricao, unidade: p.unidade, coeficiente: coef, custoUnitario: p.custoUnitario, categoria: p.categoria, tipo: "insumo", fonte: "PROPRIA", memoria: memoria };
  }
  function compor(codigo, descricao, unidade, grupo, observacao, linhas, ref) {
    var mo = 0, mat = 0, eq = 0, tot = 0, prov = [];
    linhas.forEach(function (l) { var v = tr2(l.coeficiente * l.custoUnitario); tot += v; if (l.categoria === "MO") mo += v; else if (l.categoria === "EQ") eq += v; else mat += v; var pi = INS[l.codigo]; if (pi && pi.provisorio && prov.indexOf(pi.provisorio) < 0) prov.push(pi.provisorio); });
    var c = { codigo: codigo, descricao: descricao, unidade: unidade, tipoItem: "composicao", origem: "PROPRIA", grupo: grupo, metodo: "truncar2", modeloRef: "SINAPI",
              maoDeObra: linhas.some(function (l) { return l.categoria === "MO"; }), observacao: observacao, referenciaCodigo: ref || "",
              custoUnitario: tr2(tot), custoMO: tr2(mo), custoMAT: tr2(mat), custoEQ: tr2(eq), criadoEm: DATA_FAB, atualizadoEm: DATA_FAB, criadoPor: "RA Engenharia (frente metálica F2)", insumos: linhas };
    if (prov.length) c.provisorio = prov.join("; ");
    return c;
  }
  /* fabricação + montagem por kg: os coeficientes da SICRO 2408149 (15 kg/h, montador + ajudante) e da solda 2408058 (0,015 kg de solda por kg,
     2,81 kg/h de solda com soldador + ajudante: 0,015 ÷ 2,81387 = 0,0053 h/kg) */
  function fabMontagem() {
    return [
      linhaIns("10997", 0.015, "solda: 0,015 kg de eletrodo por kg de estrutura (SICRO 2408149 × 2408058)"),
      linhaIns("88317", 0.0053, "solda: 0,015 kg ÷ 2,81387 kg/h (produção da equipe da SICRO 2408058)"),
      linhaIns("98764", 0.0053, "máquina de solda nas mesmas horas do soldador (SICRO 2408058: gerador + máquina; SINAPI: inversor de solda CHP)"),
      linhaIns("PROP-9414", 1, "corte com maçarico, 1 por kg (SICRO 2408149)"),
      linhaIns("88278", 0.0667, "montagem: 1 montador ÷ 15 kg/h (produção da equipe da SICRO 2408149)"),
      linhaIns("88240", 0.0720, "1 ajudante ÷ 15 kg/h (SICRO 2408149) + 0,0053 h do ajudante da solda (SICRO 2408058)")
    ];
  }
  var OBS_FAB = "Coeficientes da " + FONTE_SICRO + ": 2408149 'Estrutura em perfil de aço ASTM A36 corte, solda e montagem - fornecimento e instalação' (equipe 15 kg/h, aço × 1,03, solda 0,015 kg/kg, corte 1408173) e 2408058 (solda E70XX, 2,81387 kg/h). Preços: " + FONTE_SINAPI + "; aço/corte sem SINAPI = PROP-94xx (maior preço público, com fonte). EXCLUSIVE pintura, içamento por guindaste e frete (linhas próprias do orçamento).";
  function classeD(dmm) {
    var d = num(dmm, 0);
    if (!(d > 0)) return "D36";   /* diâmetro desconhecido: o maior do catálogo (js/metalnorma.js), nunca o menor */
    if (d <= 12.71) return "12"; if (d <= 16.01) return "16"; if (d <= 20.01) return "20";
    for (var i = 0; i < GRANDES.length; i++) if (d <= GRANDES[i][0] + 0.01) return GRANDES[i][1];
    var k = "D" + Math.ceil(d); garantirClasse(k, Math.ceil(d)); return k;
  }
  var PAR = { "12": ["PROP-9404", "PROP-9408", "PROP-9411", "ATE 12,7 MM (1/2\" / M12)"], "16": ["PROP-9405", "PROP-9409", "PROP-9412", "16 MM (5/8\" / M16)"],
              "20": ["PROP-9406", "PROP-9410", "PROP-9413", "20 MM (3/4\" / M20)"] };
  var CODPAR = { "12": "PROP-MET-9011", "16": "PROP-MET-9012", "20": "PROP-MET-9013" };
  var CODTIR = { "12": "PROP-MET-9016", "16": "PROP-MET-9017", "20": "PROP-MET-9018" };
  var CLASSES_D = ["12", "16", "20"];
  GRANDES.forEach(function (g) { var k = g[1]; PAR[k] = ["PROP-9407-" + k, "PROP-9410-" + k, "PROP-9413-" + k, g[2]]; CODPAR[k] = "PROP-MET-9014-" + k; CODTIR[k] = "PROP-MET-9019-" + k; CLASSES_D.push(k); });
  var COMPOSICOES = [
    compor("PROP-MET-9001", "ESTRUTURA METALICA EM PERFIL LAMINADO OU SOLDADO (W, H, I, U/C, L, TUBO, BARRA) — FORNECIMENTO DO ACO, FABRICACAO (CORTE E SOLDA) E MONTAGEM, EXCLUSIVE PINTURA, ICAMENTO POR GUINDASTE E FRETE", "kg", "OUTROS", OBS_FAB,
      [linhaIns("PROP-9401", 1.03, "aço × 1,03 (perda de corte, SICRO 2408149)")].concat(fabMontagem()), "SICRO 2408149"),
    compor("PROP-MET-9002", "ESTRUTURA METALICA EM PERFIL FORMADO A FRIO (UE, U, Z DA NBR 6355; CHAPA DOBRADA) — TERCAS, TRAVESSAS E PECAS LEVES — FORNECIMENTO, FABRICACAO E MONTAGEM, EXCLUSIVE PINTURA, ICAMENTO POR GUINDASTE E FRETE", "kg", "OUTROS",
      OBS_FAB + " A SINAPI 104314 (trama de terças) não foi usada: inclui parafusos A307 e transporte vertical que aqui são medidos peça a peça (cobraria em dobro).",
      [linhaIns("PROP-9403", 1.03, "perfil dobrado × 1,03 (perda de corte, SICRO 2408149)")].concat(fabMontagem()), "SICRO 2408149"),
    compor("PROP-MET-9003", "CHAPAS DE ACO PARA LIGACOES, PLACAS DE BASE, ENRIJECEDORES E GUSSETS — FORNECIMENTO, CORTE, FURACAO, SOLDA E MONTAGEM, EXCLUSIVE PINTURA E FRETE", "kg", "OUTROS",
      OBS_FAB + " Mesmos coeficientes de fabricação/montagem por kg da 2408149 (a SICRO não separa a chapa de ligação); a chapa entra com a peça que ela liga (sem guindaste próprio).",
      [linhaIns("PROP-9402", 1.03, "chapa × 1,03 (perda de corte, SICRO 2408149)")].concat(fabMontagem()), "SICRO 2408149")
  ];
  function compsDaClasse(k) {
    var P = PAR[k], o = [];
    o.push(compor(CODPAR[k], "PARAFUSO ESTRUTURAL ASTM A325 DIAMETRO " + P[3] + ", COM PORCA PESADA E 2 ARRUELAS — FORNECIMENTO E INSTALACAO (APERTO) EM ESTRUTURA METALICA", "un", "OUTROS",
      "Instalação pela SICRO ES 04/2026 4806395 'Fixação de parafuso em estrutura metálica' (10 un/h, montador + ajudante). Material: " + FONTE_SICRO + " (maior preço do diâmetro; o comprimento modelado não muda a faixa). A classe modelada (A307/8.8/A325) é orçada como A325 (a mais cara das usuais).",
      [linhaIns(P[0], 1, "1 parafuso"), linhaIns(P[1], 1, "1 porca pesada"), linhaIns(P[2], 2, "2 arruelas (cabeça e porca — o lado da segurança)"),
       linhaIns("88278", 0.1, "1 montador ÷ 10 un/h (SICRO 4806395)"), linhaIns("88240", 0.1, "1 ajudante ÷ 10 un/h (SICRO 4806395)")], "SICRO 4806395"));
    o.push(compor(CODTIR[k], "JOGO DE 4 PORCAS E 4 ARRUELAS PARA TIRANTE DE BARRA REDONDA DIAMETRO " + P[3] + " (2 DE CADA POR PONTA) — FORNECIMENTO E INSTALACAO", "un", "OUTROS",
      "Regra de partida do js/metalfab.js listas: tirante = barra rosqueada nas pontas, 2 porcas e 2 arruelas por ponta. Preços " + FONTE_SICRO + "; instalação como 2 fixações da SICRO 4806395.",
      [linhaIns(P[1], 4, "4 porcas"), linhaIns(P[2], 4, "4 arruelas"), linhaIns("88278", 0.2, "2 pontas × 0,1 h (SICRO 4806395)"), linhaIns("88240", 0.2, "2 pontas × 0,1 h (SICRO 4806395)")], "SICRO 4806395"));
    return o;
  }
  CLASSES_D.forEach(function (k) { compsDaClasse(k).forEach(function (c) { COMPOSICOES.push(c); }); });
  /* Ø acima do maior da tabela (64 mm): a classe nasce na hora, pela mesma regra de escala (fora do envelope de fábrica) */
  function garantirClasse(k, d) {
    if (PAR[k]) return;
    var g = [d, k, d + " MM"];
    insGrande(g).forEach(function (x) { INS[x.codigo] = x; });
    PAR[k] = ["PROP-9407-" + k, "PROP-9410-" + k, "PROP-9413-" + k, g[2]]; CODPAR[k] = "PROP-MET-9014-" + k; CODTIR[k] = "PROP-MET-9019-" + k; CLASSES_D.push(k);
    compsDaClasse(k).forEach(function (c) { COMP[c.codigo] = c; });
  }
  var KG_CHUMB_1POL = 2.386;   /* barra Ø 25,4 × 600 mm × 7 850 kg/m³ — o chumbador SINAPI 39746 */
  COMPOSICOES.push(compor("PROP-MET-9021", "CHUMBADOR DE ACO DIAMETRO ATE 25 MM (1\") E ATE 2,386 KG (1\" X 600 MM) COM PORCA E ARRUELA — FORNECIMENTO E INSTALACAO COM GABARITO NA FUNDACAO", "un", "FUNDAÇÕES",
    "Material: SINAPI MG 06/2026 39746 (o maior chumbador por unidade da base, 1\" × 600 mm, galvanizado, com porca e arruela). Instalação: SICRO ES 04/2026 0407740 'Chumbador tipo espera ... fixação de estrutura metálica em concreto' — 0,15 h de armador e 0,15 h de ajudante por kg × 2,386 kg (barra Ø 25,4 × 600 mm).",
    [linhaIns("39746", 1, "1 chumbador com porca e arruela"), linhaIns("88245", 0.3579, "0,15 h/kg × 2,386 kg (SICRO 0407740)"), linhaIns("88240", 0.3579, "0,15 h/kg × 2,386 kg (SICRO 0407740)")], "SICRO 0407740"));
  COMPOSICOES.push(compor("PROP-MET-9022", "CHUMBADOR DE ACO DIAMETRO ACIMA DE 25 MM OU MAIS PESADO QUE 1\" X 600 MM, COM PORCAS E ARRUELAS — FORNECIMENTO E INSTALACAO NA FUNDACAO (POR KG)", "kg", "FUNDAÇÕES",
    "Material: PROP-9415 (preço por kg do maior chumbador público, SINAPI 39746 — escala pelo peso: o chumbador maior ou mais longo nunca sai pelo preço do 1\" × 600). Instalação: SICRO ES 04/2026 0407740 (0,15 h armador + 0,15 h ajudante por kg).",
    [linhaIns("PROP-9415", 1, "1 kg"), linhaIns("88245", 0.15, "SICRO 0407740"), linhaIns("88240", 0.15, "SICRO 0407740")], "SICRO 0407740"));
  COMPOSICOES.push(compor("PROP-MET-9031", "GALVANIZACAO A FOGO POR IMERSAO A QUENTE (NBR 6323) DA ESTRUTURA METALICA E DOS PARAFUSOS — POR KG DE ACO (PRECO PROVISORIO)", "kg", "PINTURA E ACABAMENTO",
    "Sem preço público do serviço (SINAPI, SICRO, SETOP, SEINFRA, ORSE, IOPES, GOINFRA e SUDECAP do repositório, 21/10/2026): PROP-9417, o maior diferencial galvanizado − preto por kg da SINAPI MG 06/2026 (tubos NBR 5580) — zinco e processo. O frete até a galvanizadora sai em linha própria. Com a cotação do galvanizador informada, ela substitui esta composição.",
    [linhaIns("PROP-9417", 1, "1 kg de aço galvanizado")], "SINAPI 21008 − 20999"));
  var COMP = {}; COMPOSICOES.forEach(function (c) { COMP[c.codigo] = c; });

  /* a base de fábrica (somente leitura), no molde do js/propriasra.js */
  var Propria = {
    fonte: "PROPRIA-RA-METALICA", uf: "MG", mes: "2026-10",
    lista: function () { return JSON.parse(JSON.stringify(COMPOSICOES.concat(INSUMOS))); },
    obter: function (c) { var k = String(c).toUpperCase(), x = COMP[k] || INS[k]; return x ? JSON.parse(JSON.stringify(x)) : null; },
    envelope: function () { return { app: "OrçaPRO", origem: "composicoes-proprias", exportadoEm: DATA_FAB, orcamentos: [], basePropria: { fonte: "PROPRIA", uf: "MG", mes: "2026-10", dados: this.lista() } }; }
  };

  /* ================================================================ SINAPI usada direto (o preço vem da base carregada) */
  var SINAPI = {
    jateamento: "100716", guindauto: "5928", frete30: "106689", freteExc: "106690", cargaDescarga: "106721",
    guindastes: [{ cod: "89272", t: 30 }, { cod: "93287", t: 60 }],
    muncks: [{ cod: "93402", tm: 5.8, kg: 3300 }, { cod: "91634", tm: 5.8, kg: 6500 }, { cod: "5928", tm: 11.7, kg: 6200 }, { cod: "105984", tm: 30.4, kg: 8500 }, { cod: "106251", tm: 42.3, kg: 14340 }]
  };
  var GUINDAUTO_H_KG = 0.00502;   /* SICRO 2408149: caminhão guindauto 6,2 t na montagem, h por kg */
  var H_MIN_LOCACAO = 8;         /* 1 diária de guindaste do plano (premissa RA, provisória — a base pública não tem franquia) */
  var PREMISSAS = { dmtKm: 30, preparo: "jateamento", sistema: "auto", bordas: false };

  /* ================================================================ LEVANTAMENTO (o mesmo kg das listas e do içamento) */
  function pesoKg(p) {
    var PS = Peso();
    if (PS && PS.pesoDe) { var r = PS.pesoDe({ tipo: p.ifc || "IFCPLATE", nome: p.nome, qto: { massa: p.massa } }, {}); if (r && r.ok) return r.kg; }
    return num(p.massa, 0);
  }
  function ehFrio(p) {
    if (p.kind === "chapa") return false;
    var cat = p.perfil && p.perfil.cat, A = Aco(), it = cat && A ? A.obter(cat) : null;
    if (it && it.forma === "frio") return true;
    return /^(ue|u|z|ze|cr)\s+\d/i.test(txt(cat)) && /x\s*\d+,\d+\s*$/.test(txt(cat));
  }
  function tipoComp(p) {
    if (p.kind === "chapa") return p.dobras ? "PROP-MET-9002" : "PROP-MET-9003";
    if (p.kind === "perfil" && ehFrio(p)) return "PROP-MET-9002";
    return "PROP-MET-9001";
  }
  function diamParafuso(b) {
    var N = Norma(), P = N && N.parafuso ? N.parafuso(b.idP) : null;
    if (P && num(P.d, 0) > 0) return num(P.d, 0);
    var m = /^M(\d+)/i.exec(txt(b.idP)); return m ? +m[1] : 0;
  }
  function levantar(estado, op) {
    op = op || {};
    var F = Fab(); if (!F || !F.numerar) return { ok: false, erro: "A numeração das peças metálicas não carregou (js/metalfab.js)." };
    var n = F.numerar(estado), porComp = {}, perfis = {}, chapas = {}, semPeso = [], kgEst = 0, pecasEst = 0, ids = [];
    n.grupos.forEach(function (g) {
      var p = g.rep, kg = pesoKg(p), q = g.ids.length, cod = tipoComp(p);
      if (!(kg > 0)) { g.ids.forEach(function (id) { semPeso.push({ id: id, marca: g.marca, nome: p.nome }); }); return; }
      var a = porComp[cod] || (porComp[cod] = { codigo: cod, kg: 0, pecas: 0, ids: [] });
      a.kg += kg * q; a.pecas += q; a.ids = a.ids.concat(g.ids); kgEst += kg * q; pecasEst += q; ids = ids.concat(g.ids);
      if (p.kind === "chapa") {
        var kc = br(p.t, 2) + "|" + txt(p.aco); var c = chapas[kc] || (chapas[kc] = { espessura: p.t, aco: txt(p.aco), pecas: 0, area: 0, kg: 0, marcas: [], composicao: cod });
        c.pecas += q; c.area += q * (num(p.areaLiq, 0) > 0 ? p.areaLiq : num(p.L, 0) * num(p.B, 0) / 1e6); c.kg += kg * q; if (c.marcas.indexOf(g.marca) < 0) c.marcas.push(g.marca);
      } else {
        var nome = p.kind === "perfil" ? txt(p.nomePerfil) : (txt(p.tipoMec) || "Peça mecânica"), kp = nome + "|" + txt(p.aco);
        var e = perfis[kp] || (perfis[kp] = { perfil: nome, aco: txt(p.aco), tipo: p.kind === "perfil" ? (ehFrio(p) ? "Formado a frio" : "Laminado / soldado") : "Mecânica", kgm: p.kind === "perfil" ? num(p.kgm, 0) : 0, pecas: 0, comprimento: 0, kg: 0, marcas: [], papeis: [], composicao: cod });
        e.pecas += q; e.comprimento += q * num(p.L, 0) / 1000; e.kg += kg * q; if (e.marcas.indexOf(g.marca) < 0) e.marcas.push(g.marca); if (p.papel && e.papeis.indexOf(p.papel) < 0) e.papeis.push(p.papel);
      }
    });
    /* LIGAÇÕES: parafusos por diâmetro; chumbadores por diâmetro; tirantes (4 porcas + 4 arruelas cada) */
    var par = {}, chumb = { ate25: { n: 0, kg: 0, ids: [] }, acima: { n: 0, kg: 0, ids: [] } }, kgPar = 0, kgChumb = 0, avisosLig = [], semD = 0, altaRes = 0;
    n.parafusos.forEach(function (b) {
      var d = diamParafuso(b), kg = num(b.massa, 0);
      if (/chumbador/i.test(txt(b.papel))) {
        /* revisor 21/10/2026: o preço por unidade é o do 1" × 600 mm (2,386 kg). Chumbador MAIS PESADO que isso (mais longo) ou
           acima de 1" vai por kg (o preço por kg do mesmo 1") — nunca abaixo do real; sem massa, o peso da barra (π d²/4 × L × 7 850) */
        var kgC = kg > 0 ? kg : (d > 0 && num(b.Lmm, 0) > 0 ? Math.PI / 4 * d * d * num(b.Lmm, 0) * 7850 / 1e9 : 0);
        var k2 = d > 0 && d <= 25.41 && kgC <= KG_CHUMB_1POL + 0.005 ? "ate25" : "acima";
        if (k2 === "acima" && !(kgC > 0)) { semPeso.push({ id: b.id, marca: "", nome: "Chumbador " + txt(b.idP) + " (sem diâmetro/comprimento)" }); return; }
        chumb[k2].n++; chumb[k2].kg += kgC; chumb[k2].ids.push(b.id); kgChumb += kgC; return;
      }
      if (!(d > 0)) semD++;
      if (/A490|10\.9/i.test(txt(b.classe))) altaRes++;
      var k = classeD(d); var x = par[k] || (par[k] = { classe: k, n: 0, kg: 0, ids: [], diametros: [] }); x.n++; x.kg += kg; x.ids.push(b.id); if (x.diametros.indexOf(txt(b.idP)) < 0) x.diametros.push(txt(b.idP)); kgPar += kg;
    });
    if (semD) avisosLig.push(semD + " parafuso(s) com diâmetro não reconhecido: orçados como Ø 36 mm (o maior do catálogo) — confira o parafuso no modelo");
    if (altaRes) avisosLig.push(altaRes + " parafuso(s) A490 / 10.9: sem preço público dessa classe, orçados pelo A325 (o maior preço público) — provisório, cotar com o fornecedor de fixadores");
    var tir = {};
    n.pecas.filter(function (p) { return p.papel === "Tirante"; }).forEach(function (p) {
      var d = num(p.dims && p.dims.h, 0), k = classeD(d); var x = tir[k] || (tir[k] = { classe: k, n: 0, ids: [] }); x.n++; x.ids.push(p.id);
    });
    /* PINTURA: a área pela geometria real (a mesma do js/metalpintura.js) */
    var PI = Pint(), area = 0, pint = null;
    if (PI && PI.calcular) { pint = PI.calcular(n, { bordas: !!op.bordas }); area = pint.total.m2; }
    /* ACABAMENTO POR PEÇA (js/metalacab.js): a estrutura repartida por acabamento (tipo + sistema de pintura) — a soma das partes é o total
       (kg da estrutura e m² de pintura). A peça sem acabamento próprio cai no do projeto, então o particionamento nunca perde nem repete peça. */
    var AC = Acab(), porAcab = {}, temAcab = !!(AC && AC.temAcabProprio(estado)), caixaPorId = {};
    if (temAcab) arr(estado && estado.caixas).forEach(function (c) { if (c) caixaPorId[String(c.id)] = c; });
    if (AC && PI && PI.areaPeca) {
      var proj = { galv: !!(op.galvanizacao && op.galvanizacao.usar), duplex: !!(op.galvanizacao && op.galvanizacao.duplex), sistema: op.pintura && op.pintura.sistema }, cfgA = PI.cfgDe ? PI.cfgDe({ bordas: !!op.bordas }) : { bordas: !!op.bordas };
      n.grupos.forEach(function (g) {
        var p = g.rep, kg = pesoKg(p), m2 = PI.areaPeca(p, cfgA).m2;
        g.ids.forEach(function (id) {
          var ef = AC.efetivo(caixaPorId[String(id)] || null, proj), k = ef.tipo + "|" + ef.sistema;
          var x = porAcab[k] || (porAcab[k] = { tipo: ef.tipo, sistema: ef.sistema, pecas: 0, kg: 0, m2: 0, ids: [], idsPeso: [], proprias: 0 });
          x.pecas++; x.kg += kg > 0 ? kg : 0; x.m2 += m2; x.ids.push(id); if (kg > 0) x.idsPeso.push(id); if (ef.proprio) x.proprias++;
        });
      });
      Object.keys(porAcab).forEach(function (k) { var x = porAcab[k]; x.kgBruto = x.kg; x.m2Bruto = x.m2; x.kg = r2(x.kg); x.m2 = r3(x.m2); });   /* kg/m2 = para mostrar; kgBruto/m2Bruto = a conta (a soma das partes fecha com o total) */
    }
    function fechar(o) { Object.keys(o).forEach(function (k) { var x = o[k]; ["kg", "area", "comprimento"].forEach(function (f) { if (x[f] != null) x[f] = f === "kg" ? r2(x[f]) : r3(x[f]); }); if (x.marcas) x.marcas = x.marcas.sort().join(", "); if (x.papeis) x.papeis = x.papeis.join(", "); }); return o; }
    var lista = Object.keys(fechar(perfis)).sort().map(function (k) { return perfis[k]; }), listaCh = Object.keys(fechar(chapas)).sort().map(function (k) { return chapas[k]; });
    Object.keys(porComp).forEach(function (k) { porComp[k].kg = r2(porComp[k].kg); });
    return { ok: true, numeracao: n, porComposicao: porComp, perfis: lista, chapas: listaCh, parafusos: par, chumbadores: chumb, tirantes: tir, pintura: pint,
             area_m2: r3(area), porAcabamento: porAcab, temAcabamentoProprio: temAcab, kgEstrutura: r2(kgEst), kgParafusos: r2(kgPar), kgChumbadores: r2(kgChumb), kgTotal: r2(kgEst + kgPar + kgChumb), pecas: pecasEst, ids: ids, semPeso: semPeso, avisos: arr(n.avisos).concat(avisosLig) };
  }

  /* ================================================================ IÇAMENTO PELO PLANO */
  function capacidadeEq(eq) {
    if (!eq) return null;
    var kg = 0;
    if (eq.tabela && eq.tabela.linhas) eq.tabela.linhas.forEach(function (l) { arr(l[1]).forEach(function (v) { if (v != null && v > kg) kg = v; }); });
    if (eq.tabela && eq.tabela.pontos) eq.tabela.pontos.forEach(function (p) { if (p[1] > kg) kg = p[1]; });
    if (eq.tabela && eq.tabela.unidade === "t") kg *= 1000;
    /* a CLASSE nominal do guindaste ("90 t (59,2 t em 360°)") manda quando é maior: a locação é cobrada pela classe, não pela tabela em 360° */
    var mc = /^\s*(\d+(?:[.,]\d+)?)\s*t(?![a-z])/i.exec(txt(eq.classe)); if (mc) kg = Math.max(kg, num(mc[1], 0) * 1000);
    var munck = eq.momento_tm != null || !!(eq.tabela && eq.tabela.pontos);
    return { tipo: munck ? "munck" : "guindaste", kg: kg, tm: num(eq.momento_tm, null) };
  }
  /* o equipamento SINAPI equivalente ao do plano: o MENOR da tabela que cobre a capacidade (guindaste em t; munck pelo momento) */
  function sinapiDoEquipamento(eq) {
    var c = capacidadeEq(eq); if (!c) return null;
    if (c.tipo === "guindaste") {
      var t = c.kg / 1000, g = SINAPI.guindastes.filter(function (x) { return x.t >= t - 1e-6; })[0];
      if (g) return { codigo: g.cod, fonte: "SINAPI", motivo: "guindaste de " + br(t, 1) + " t → SINAPI " + g.cod + " (" + g.t + " t)" };
      return { codigo: "PROP-9416", fonte: "PROPRIA", provisorio: INS["PROP-9416"].provisorio, motivo: "guindaste de " + br(t, 1) + " t, acima do maior da SINAPI (60 t)" };
    }
    var ms = SINAPI.muncks, m = null;
    if (c.tm != null) m = ms.filter(function (x) { return x.tm >= c.tm - 1e-6; })[0];
    else m = ms.filter(function (x) { return x.kg >= c.kg - 1e-6; })[0];
    if (m) return { codigo: m.cod, fonte: "SINAPI", motivo: "munck " + (c.tm != null ? br(c.tm, 1) + " t·m" : br(c.kg, 0) + " kg") + " → SINAPI " + m.cod };
    return { codigo: "106251", fonte: "SINAPI", provisorio: "munck acima de 42,3 t·m (o maior da SINAPI) — cotar a locação", motivo: "munck acima do maior da SINAPI (42,3 t·m)" };
  }
  function icamentoDoPlano(plano, lev, opc) {
    if (!plano || !arr(plano.icamentos).length) return null;
    var e = plano.equipamento || {}, C = IcCat(), eq = e.catalogoId && C && C.porId ? C.porId(e.catalogoId) : null;
    if (!eq && e.outro && (num(e.outro.capacidade_kg, 0) > 0 || num(e.outro.momento_tm, 0) > 0)) eq = e.outro.tipo === "munck" ? { momento_tm: num(e.outro.momento_tm, null), tabela: { pontos: [[0, num(e.outro.capacidade_kg, 0)]] } } : { tabela: { unidade: "kg", linhas: [[0, [num(e.outro.capacidade_kg, 0)]]] } };
    var map = eq ? sinapiDoEquipamento(eq) : null;
    var meus = {}; lev.ids.forEach(function (id) { meus["edit:" + id] = 1; meus[String(id)] = 1; });
    var min = 0, semTempo = 0, ids = {}, avisos = [], posicoes = {};
    function chavePos(q) { return q && isFinite(+q.x) && isFinite(+q.y) ? (Math.round(+q.x * 10) / 10) + "|" + (Math.round(+q.y * 10) / 10) : null; }
    plano.icamentos.forEach(function (ic) {
      var us = arr(ic.uids).filter(function (u) { return meus[u]; });
      if (!us.length) return;
      us.forEach(function (u) { ids[String(u).replace(/^edit:/, "")] = 1; });
      var t = num(ic.tempo_min, 0);
      if (!(t > 0)) { var P = IcPl(); t = P && P.tempo ? P.tempo({ altura_m: num(opc && opc.alturaMax, 6), giro_graus: 180 }).total_min : 60; semTempo++; }
      min += t;
      var kp = chavePos(ic.pos || plano.pos); if (kp) posicoes[kp] = 1;
    });
    if (!min) return null;
    if (semTempo) avisos.push(semTempo + " içamento(s) do plano sem a estimativa de tempo: adotado o tempo do motor (js/icarplano.js) com giro de 180° e a altura da estrutura — confira no plano");
    /* 23/10/2026 (plano de montagem): o equipamento que MUDA DE POSIÇÃO no meio do plano gasta tempo recolhendo as patolas,
       andando e montando de novo — sem isto, o plano de 3 posições custava o mesmo que o de 1. Premissa do agente do
       equipamento (js/icaragente.js PREMISSAS.reposicionar_min, 45 min), a mesma que ele usa para desempatar por tempo. */
    var nPos = Object.keys(posicoes).length, AG = dep("IcarAgente", "./icaragente.js"), repMin = AG && AG.PREMISSAS && num(AG.PREMISSAS.reposicionar_min, 0) > 0 ? num(AG.PREMISSAS.reposicionar_min, 0) : 45;
    var minRep = nPos > 1 ? (nPos - 1) * repMin : 0;
    return { horas: Math.ceil((min + minRep) / 60 * 10) / 10, minutos: r2(min), minRep: r2(minRep), posicoes: nPos, repMin: repMin, ids: Object.keys(ids), map: map, eq: eq, avisos: avisos };
  }

  /* ================================================================ ORÇAMENTO */
  function precoSinapi(base, cod) {
    var b = base && base.obter ? base.obter(cod) : null;
    if (!b || !(num(b.custoUnitario, 0) > 0)) return null;
    return { codigo: String(b.codigo || cod), descricao: txt(b.descricao), unidade: txt(b.unidade), cu: num(b.custoUnitario, 0), mo: num(b.custoMO, 0), mat: num(b.custoMAT, 0), eq: num(b.custoEQ, 0) };
  }
  function precoPropria(cod, propriaCli) {
    var c = null; try { c = propriaCli && propriaCli.obter ? propriaCli.obter(cod) : null; } catch (e) { c = null; }
    var deFab = !c; if (!c) c = Propria.obter(cod);
    if (!c) return null;
    return { codigo: c.codigo, descricao: c.descricao, unidade: c.unidade, cu: num(c.custoUnitario, 0), mo: num(c.custoMO, 0), mat: num(c.custoMAT, 0), eq: num(c.custoEQ, 0), provisorio: deFab ? (c.provisorio || null) : null, daEmpresa: !deFab, comp: c };
  }
  /* op: { pintura: { sistema: "auto"|"epoxi"|"alquidico"|"nenhuma", demaos: [{nome, funcao, ligante}], preparo: "jateamento"|"nenhum", grau },
           galvanizacao: { usar, precoKg, fonte, data, duplex }, dmtKm, plano (bim_icamento), base (SINAPI: obter), propria (base própria da empresa: obter) } */
  function orcar(estado, op) {
    op = op || {};
    var lev = levantar(estado, op); if (!lev.ok) return lev;
    var base = op.base, L = [], problemas = [], pendPreco = [], avisos = lev.avisos.slice();
    function add(grupo, codigo, fonte, quantidade, memoria, pecas, extra) {
      if (!(quantidade > 0)) return null;
      var p = fonte === "SINAPI" ? precoSinapi(base, codigo) : (fonte === "PROPRIA" ? precoPropria(codigo, op.propria) : null);
      var l = { grupo: grupo, codigo: codigo, fonte: fonte, quantidade: r4(quantidade), memoria: memoria, pecas: arr(pecas).map(String) };
      if (extra) Object.keys(extra).forEach(function (k) { l[k] = extra[k]; });
      if (fonte === "COTACAO") { l.descricao = extra.descricao; l.unidade = extra.unidade; l.unitario = extra.unitario; }
      else if (!p) { l.status = "sem-base"; l.descricao = (extra && extra.descricao) || codigo; l.unidade = (extra && extra.unidade) || ""; l.unitario = null; }
      else { l.descricao = p.descricao; l.unidade = p.unidade; l.unitario = p.cu; l.mo = p.mo; l.mat = p.mat; l.eq = p.eq; if (p.provisorio && !l.provisorio) l.provisorio = { motivo: p.provisorio }; if (p.daEmpresa) l.daEmpresa = true; }
      if (l.unitario != null) { l.total = r2(l.quantidade * l.unitario); l.status = "ok"; }
      if (l.provisorio) pendPreco.push(l);
      L.push(l); return l;
    }
    /* 1. ESTRUTURA por kg */
    var ROT = { "PROP-MET-9001": "perfis laminados/soldados", "PROP-MET-9002": "perfis formados a frio e chapas dobradas", "PROP-MET-9003": "chapas de ligação e placas" };
    ["PROP-MET-9001", "PROP-MET-9002", "PROP-MET-9003"].forEach(function (cod) {
      var a = lev.porComposicao[cod]; if (!a) return;
      add("Estrutura", cod, "PROPRIA", a.kg, "Σ massa de " + a.pecas + " peça(s) de " + ROT[cod] + " = " + br(a.kg, 2) + " kg (geometria × 7 850 kg/m³, furos descontados — o mesmo peso das listas e do içamento)", a.ids);
    });
    /* 2. LIGAÇÕES */
    CLASSES_D.slice().forEach(function (k) {
      var x = lev.parafusos[k]; if (x) add("Ligações", CODPAR[k], "PROPRIA", x.n, x.n + " parafuso(s) modelado(s) (" + x.diametros.join(", ") + ")", x.ids);
      var t = lev.tirantes[k]; if (t) add("Ligações", CODTIR[k], "PROPRIA", t.n, t.n + " tirante(s): 2 porcas e 2 arruelas por ponta (regra de partida do js/metalfab.js)", t.ids);
    });
    if (lev.chumbadores.ate25.n) add("Ligações", "PROP-MET-9021", "PROPRIA", lev.chumbadores.ate25.n, lev.chumbadores.ate25.n + " chumbador(es) até 25 mm e até 2,386 kg (1\" × 600) modelado(s)", lev.chumbadores.ate25.ids);
    if (lev.chumbadores.acima.n) add("Ligações", "PROP-MET-9022", "PROPRIA", lev.chumbadores.acima.kg, lev.chumbadores.acima.n + " chumbador(es) acima de 25 mm ou mais pesados que o 1\" × 600: " + br(lev.chumbadores.acima.kg, 2) + " kg", lev.chumbadores.acima.ids);
    /* 3. PROTEÇÃO */
    var G = op.galvanizacao || {}, P0 = op.pintura || {}, PI = Pint(), A = lev.area_m2;
    var pintar = !G.usar || !!G.duplex, sis = P0.sistema || PREMISSAS.sistema;
    var galvKgReal = G.usar ? r2(lev.kgEstrutura + lev.kgParafusos) : 0, galvIdsReal = lev.ids;
    function lancarGalv(kgG, memG, idsG) {
      /* revisor 21/10/2026: galvaniza a estrutura E os parafusos (o A325 da SICRO é preto; o chumbador SINAPI 39746 já é galvanizado).
         Sem a cotação, a composição própria PROVISÓRIA (maior preço público) — o orçamento nunca fica bloqueado nem com item sem preço. */
      var pk = num(G.precoKg, 0);
      if (pk > 0 && txt(G.fonte).trim()) add("Proteção", "PROP-MET-9031-COT", "COTACAO", kgG, memG, idsG,
        { descricao: "GALVANIZACAO A FOGO POR IMERSAO A QUENTE (NBR 6323) DA ESTRUTURA METALICA — COTACAO " + txt(G.fonte).trim().toUpperCase() + (txt(G.data) ? " DE " + txt(G.data) : ""), unidade: "kg", unitario: pk, mat: pk, mo: 0, eq: 0, cotacao: { fonte: txt(G.fonte).trim(), data: txt(G.data) } });
      else {
        add("Proteção", "PROP-MET-9031", "PROPRIA", kgG, memG + " — preço PROVISÓRIO: o maior público derivado (SINAPI), até a cotação do galvanizador", idsG);
        problemas.push({ tipo: "galv-sem-preco", gravidade: "aviso", titulo: "Galvanização com preço provisório",
          texto: "O serviço de galvanização a fogo não tem preço público. O orçamento saiu com a composição própria PROP-MET-9031 pelo maior preço público derivável (diferencial galvanizado − preto da SINAPI, R$ " + br(INS["PROP-9417"].custoUnitario, 2) + "/kg), marcada provisória — informe a cotação do galvanizador para fechar o preço.",
          solucoes: [{ id: "galv-preco", texto: "Informar o preço por kg e de quem é a cotação" }, { id: "galv-pintura", texto: "Proteger com pintura em vez de galvanizar" }], pecas: idsG.slice(0, 200) });
      }
    }
    var memGv = "galvanização de " + br(r2(lev.kgEstrutura + lev.kgParafusos), 2) + " kg (" + br(lev.kgEstrutura, 2) + " kg de estrutura + " + br(lev.kgParafusos, 2) + " kg de parafusos; o chumbador já é galvanizado)";
    if (G.usar && !lev.temAcabamentoProprio) lancarGalv(r2(lev.kgEstrutura + lev.kgParafusos), memGv, lev.ids);
    if (lev.temAcabamentoProprio) {
      /* ACABAMENTO POR PEÇA (js/metalacab.js): a proteção é lançada POR ACABAMENTO — galvanizado e duplex por kg, pintura e duplex por m² × demãos.
         A peça sem acabamento próprio entra pelo do projeto, então nenhuma peça fica de fora nem conta duas vezes (a soma das partes é o levantamento). */
      var ac = lev.porAcabamento, kgGv = 0, idsGv = [], m2Jat = 0, idsJat = [], gruposP = {}, nBruto = 0, nInox = 0, kgSemProt = 0;
      Object.keys(ac).forEach(function (k) {
        var x = ac[k];
        if (x.tipo === "galvanizado" || x.tipo === "duplex") { kgGv += x.kgBruto; idsGv = idsGv.concat(x.idsPeso); }
        if (x.tipo === "pintura") { m2Jat += x.m2Bruto; idsJat = idsJat.concat(x.idsPeso); }
        if (x.tipo === "pintura" || x.tipo === "duplex") { var g = gruposP[x.sistema] || (gruposP[x.sistema] = { sistema: x.sistema, m2: 0, ids: [] }); g.m2 += x.m2Bruto; g.ids = g.ids.concat(x.idsPeso); }
        if (x.tipo === "bruto") { nBruto += x.pecas; kgSemProt += x.kgBruto; }
        if (x.tipo === "inox") nInox += x.pecas;
      });
      var nGv = 0; Object.keys(ac).forEach(function (k) { if (ac[k].tipo === "galvanizado" || ac[k].tipo === "duplex") nGv += ac[k].pecas; });
      var kgParGalv = G.usar ? lev.kgParafusos : 0, kgGvT = r2(kgGv + kgParGalv);
      galvKgReal = kgGvT; galvIdsReal = idsGv;
      if (kgGvT > 0) lancarGalv(kgGvT, "galvanização de " + br(kgGvT, 2) + " kg (" + nGv + " peça(s) com acabamento galvanizado ou duplex = " + br(kgGv, 2) + " kg de estrutura" + (kgParGalv > 0 ? " + " + br(kgParGalv, 2) + " kg de parafusos, galvanizados pela opção do projeto" : "") + "; o chumbador já é galvanizado)", idsGv);
      var jatArea = r3(m2Jat), temPint = false;
      if (P0.preparo !== "nenhum" && jatArea > 0) {
        var grau0 = txt(P0.grau);
        add("Proteção", SINAPI.jateamento, "SINAPI", jatArea, "preparo de superfície em " + br(jatArea, 2) + " m² (só as peças com acabamento de pintura; a galvanizada e a duplex dispensam o jateamento aqui)" + (/^St/i.test(grau0) ? " — sistema pede " + grau0 + " (limpeza mecânica): adotado o jateamento, o de maior preço" : ""), idsJat,
          { descricao: "JATEAMENTO ABRASIVO COM GRANALHA DE AÇO EM PERFIL METÁLICO EM FÁBRICA", unidade: "M2" });
      }
      var contA = {};
      Object.keys(gruposP).sort().forEach(function (sk) {
        var gp = gruposP[sk], areaG = r3(gp.m2); if (!(areaG > 0)) return;
        var demaosG = arr(P0.demaos).length ? arr(P0.demaos) : (PI ? PI.CONFIG.demaos : []);
        demaosG.forEach(function (d, i) {
          var m = PI && PI.composicaoDaDemao ? PI.composicaoDaDemao(d, i, demaosG.length, sk) : { codigo: "100727" };
          var c = contA[m.codigo] || (contA[m.codigo] = { area: 0, nomes: [], prov: null, avisos: [], ids: [], sis: [] });
          c.area += areaG; c.ids = c.ids.concat(gp.ids); if (c.sis.indexOf(sk) < 0) c.sis.push(sk);
          var nm = txt(d.nome) || "demão " + (i + 1); if (c.nomes.indexOf(nm) < 0) c.nomes.push(nm);
          if (m.provisorio) c.prov = m.provisorio; if (m.aviso && c.avisos.indexOf(m.aviso) < 0) c.avisos.push(m.aviso);
        });
      });
      Object.keys(contA).forEach(function (cod) {
        var c = contA[cod]; temPint = true;
        add("Proteção", cod, "SINAPI", r3(c.area), br(c.area, 2) + " m² de peças com pintura/duplex (sistema: " + c.sis.join(", ") + "; demãos: " + c.nomes.join("; ") + ") — a tinta está na composição por demão (os litros do js/metalpintura.js não viram linha: cobrariam em dobro)" + (c.avisos.length ? ". " + c.avisos.join(" ") : ""), c.ids,
          c.prov ? { provisorio: { motivo: c.prov } } : null);
      });
      void temPint;
      if (nBruto) avisos.push(nBruto + " peça(s) (" + br(kgSemProt, 2) + " kg) sem proteção contra corrosão (acabamento bruto, ou o projeto sem pintura): confirme que é aço patinável ou peça interna seca.");
      if (nInox) avisos.push(nInox + " peça(s) em inox: sem pintura e sem galvanização, o acabamento é o do próprio material.");
    } else {
    if (pintar && sis !== "nenhuma" && A > 0) {
        var demaos = arr(P0.demaos).length ? arr(P0.demaos) : (PI ? PI.CONFIG.demaos : []), cont = {};
        if (P0.preparo !== "nenhum" && !G.usar) {
          var grau = txt(P0.grau);
          add("Proteção", SINAPI.jateamento, "SINAPI", A, "preparo de superfície em " + br(A, 2) + " m² (área de pintura pela geometria, a mesma do js/metalpintura.js)" + (/^St/i.test(grau) ? " — sistema pede " + grau + " (limpeza mecânica): adotado o jateamento, o de maior preço" : ""), lev.ids,
            { descricao: "JATEAMENTO ABRASIVO COM GRANALHA DE AÇO EM PERFIL METÁLICO EM FÁBRICA", unidade: "M2" });
        }
        demaos.forEach(function (d, i) {
          var m = PI && PI.composicaoDaDemao ? PI.composicaoDaDemao(d, i, demaos.length, sis) : { codigo: "100727" };
          var c = cont[m.codigo] || (cont[m.codigo] = { n: 0, nomes: [], prov: null, avisos: [] });
          c.n++; c.nomes.push(txt(d.nome) || "demão " + (i + 1)); if (m.provisorio) c.prov = m.provisorio; if (m.aviso && c.avisos.indexOf(m.aviso) < 0) c.avisos.push(m.aviso);
        });
        Object.keys(cont).forEach(function (cod) {
          var c = cont[cod];
          add("Proteção", cod, "SINAPI", A * c.n, br(A, 2) + " m² × " + c.n + " demão(ões) (" + c.nomes.join("; ") + ") — a tinta está na composição por demão (os litros do js/metalpintura.js não viram linha: cobrariam em dobro)" + (c.avisos.length ? ". " + c.avisos.join(" ") : ""), lev.ids,
            c.prov ? { provisorio: { motivo: c.prov } } : null);
        });
      } else if (!G.usar && sis === "nenhuma") avisos.push("Sem pintura e sem galvanização: a estrutura sai sem proteção contra corrosão — confirme que é aço patinável ou peça interna seca.");
    }

    /* 4. IÇAMENTO */
    var alt = 0; lev.numeracao.pecas.forEach(function (p) { if (p.kind === "perfil" && /pilar/i.test(txt(p.papel))) alt = Math.max(alt, num(p.L, 0) / 1000); });
    var ic = icamentoDoPlano(op.plano, lev, { alturaMax: alt || 6 }), kgNoPlano = 0;
    if (ic && ic.map) {
      var noPlano = {}; ic.ids.forEach(function (id) { noPlano[id] = 1; });
      lev.numeracao.pecas.forEach(function (p) { if (noPlano[String(p.id)]) kgNoPlano += pesoKg(p); });
      /* revisor 21/10/2026: as horas do plano são só o tempo de içar — a locação do guindaste não sai por menos que a mobilização.
         Sem franquia na base pública: MÍNIMO de 1 diária (H_MIN_LOCACAO h) por obra, provisório (premissa RA, ajusta-se com a locadora) */
      var hIc = Math.max(ic.horas, H_MIN_LOCACAO), provIc = ic.map.provisorio || (hIc > ic.horas ? "mínimo de 1 diária (" + H_MIN_LOCACAO + " h) de locação do guindaste do plano — premissa RA; ajusta-se com a locadora" : null);
      /* revisor 23/10/2026: os 45 min por mudança de posição são PREMISSA do agente (sem fonte de locadora) — viram hora cobrada, então a linha sai provisória */
      if (!provIc && ic.minRep > 0) provIc = "inclui " + ic.minRep + " min de mudança de posição do equipamento (" + ic.repMin + " min por mudança — premissa do agente, sem fonte de locadora); confirmar com a locadora";
      add("Içamento", ic.map.codigo, ic.map.fonte, hIc, "plano de içamento da obra: " + ic.minutos + " min nos içamentos das peças desta estrutura (" + ic.ids.length + " peça(s), " + br(kgNoPlano, 0) + " kg)" + (ic.minRep > 0 ? " + " + ic.minRep + " min para mudar o equipamento de posição (" + (ic.posicoes - 1) + " × " + ic.repMin + " min — premissa do agente do equipamento: recolher patolas, andar e montar de novo)" : "") + " → " + br(ic.horas, 1) + " h produtivas" + (hIc > ic.horas ? ", cobrado o mínimo de 1 diária (" + H_MIN_LOCACAO + " h)" : "") + "; " + ic.map.motivo + ".", ic.ids,
        provIc ? { provisorio: { motivo: provIc } } : null);
      ic.avisos.forEach(function (a) { avisos.push(a); });
    } else if (op.plano && arr(op.plano.icamentos).length && ic && !ic.map) avisos.push("O plano de içamento não tem equipamento escolhido: o içamento saiu pelo guindauto de montagem (coeficiente da SICRO).");
    var kgResto = Math.max(0, lev.kgEstrutura - (ic && ic.map ? kgNoPlano : 0));
    if (kgResto > 0) add("Içamento", SINAPI.guindauto, "SINAPI", r2(kgResto * GUINDAUTO_H_KG), "guindauto 6,2 t na montagem: " + br(kgResto, 2) + " kg × 0,00502 h/kg (coeficiente da SICRO ES 04/2026 2408149)" + (ic && ic.map ? " — só o peso que o plano de içamento não levanta" : " — sem plano de içamento na obra"), lev.ids,
      { descricao: "GUINDAUTO HIDRÁULICO 6200 KG / 11,7 TM - CHP DIURNO", unidade: "CHP" });
    /* 5. FRETE */
    var t = lev.kgTotal / 1000, dmt = Math.max(0, num(op.dmtKm, PREMISSAS.dmtKm));
    if (t > 0 && dmt > 0) {
      add("Transporte", SINAPI.frete30, "SINAPI", r4(t * Math.min(dmt, 30)), br(t, 3) + " t × " + br(Math.min(dmt, 30), 1) + " km (distância da fábrica à obra: " + br(dmt, 1) + " km" + (op.dmtKm == null ? ", valor de PARTIDA — informe a real" : "") + ")", lev.ids, { descricao: "TRANSPORTE COM CAMINHÃO CARROCERIA COM GUINDAUTO (MUNCK) 42,3 TM, DMT ATÉ 30 KM", unidade: "TXKM" });
      if (dmt > 30) add("Transporte", SINAPI.freteExc, "SINAPI", r4(t * (dmt - 30)), br(t, 3) + " t × " + br(dmt - 30, 1) + " km além dos 30 km", lev.ids, { descricao: "TRANSPORTE COM MUNCK 42,3 TM, ADICIONAL DMT EXCEDENTE A 30 KM", unidade: "TXKM" });
    }
    if (t > 0) add("Transporte", SINAPI.cargaDescarga, "SINAPI", r4(t), br(t, 3) + " t (estrutura + parafusos + chumbadores)", lev.ids, { descricao: "CARGA, MANOBRA E DESCARGA DE PERFIL METÁLICO COM GUINDAUTO (MUNCK) 42,3 TM", unidade: "T" });
    /* galvanizado: a estrutura faz UMA viagem a mais (fábrica → galvanizadora) — premissa: a galvanizadora à mesma distância da obra */
    var tG = galvKgReal / 1000;
    if (tG > 0 && dmt > 0) {
      add("Transporte", SINAPI.frete30, "SINAPI", r4(tG * Math.min(dmt, 30)), br(tG, 3) + " t × " + br(Math.min(dmt, 30), 1) + " km — viagem da fábrica à galvanizadora (premissa: mesma distância da obra, " + br(dmt, 1) + " km; ajusta-se com a galvanizadora escolhida)", lev.ids, { descricao: "TRANSPORTE COM CAMINHÃO CARROCERIA COM GUINDAUTO (MUNCK) 42,3 TM, DMT ATÉ 30 KM", unidade: "TXKM" });
      if (dmt > 30) add("Transporte", SINAPI.freteExc, "SINAPI", r4(tG * (dmt - 30)), br(tG, 3) + " t × " + br(dmt - 30, 1) + " km além dos 30 km — viagem à galvanizadora", lev.ids, { descricao: "TRANSPORTE COM MUNCK 42,3 TM, ADICIONAL DMT EXCEDENTE A 30 KM", unidade: "TXKM" });
      add("Transporte", SINAPI.cargaDescarga, "SINAPI", r4(tG), br(tG, 3) + " t — carga e descarga na galvanizadora", lev.ids, { descricao: "CARGA, MANOBRA E DESCARGA DE PERFIL METÁLICO COM GUINDAUTO (MUNCK) 42,3 TM", unidade: "T" });
    }
    /* problemas */
    if (lev.semPeso.length) problemas.push({ tipo: "sem-peso", gravidade: "erro", titulo: lev.semPeso.length + " peça(s) sem peso",
      texto: "Peça sem massa não entra no orçamento por kg (nem no içamento). Costuma ser perfil sem catálogo ou seção não reconhecida: " + lev.semPeso.slice(0, 6).map(function (s) { return s.nome || s.id; }).join(", ") + (lev.semPeso.length > 6 ? "…" : "") + ".",
      solucoes: [{ id: "sem-peso-props", texto: "Abrir as Propriedades da peça e escolher o perfil do catálogo" }], pecas: lev.semPeso.map(function (s) { return s.id; }) });
    var semBase = L.filter(function (l) { return l.status === "sem-base"; });
    if (semBase.length) problemas.push({ tipo: "sem-base", gravidade: "erro", titulo: "Base SINAPI não carregada",
      texto: semBase.length + " linha(s) usam composição SINAPI (" + semBase.map(function (l) { return l.codigo; }).join(", ") + ") e a base de preços não está carregada neste aparelho.",
      solucoes: [{ id: "carregar-base", texto: "Carregar a base SINAPI" }], pecas: [] });
    var ok = L.filter(function (l) { return l.status === "ok"; }), total = 0, porGrupo = {};
    ok.forEach(function (l) { total += l.total; porGrupo[l.grupo] = r2((porGrupo[l.grupo] || 0) + l.total); });
    if (!lev.ids.length && !lev.semPeso.length) problemas.push({ tipo: "sem-pecas", gravidade: "aviso", titulo: "Não há estrutura metálica no modelo", texto: "Modele as peças (Metálica › Peças, Galpão, Peças prontas) e abra de novo.", solucoes: [], pecas: [] });
    return { ok: true, linhas: L, total: r2(total), porGrupo: porGrupo, kg: { estrutura: lev.kgEstrutura, parafusos: lev.kgParafusos, chumbadores: lev.kgChumbadores, total: lev.kgTotal },
             kgPorTonelada: lev.kgEstrutura > 0 ? r2(total / (lev.kgEstrutura / 1000)) : 0, area_m2: lev.area_m2, levantamento: lev, icamento: ic, problemas: problemas,
             pendenciasPreco: pendPreco.map(function (l) { return { codigo: l.codigo, descricao: l.descricao, motivo: l.provisorio.motivo }; }), avisos: avisos,
             podeCriar: !problemas.some(function (p) { return p.gravidade === "erro"; }) && ok.length > 0 };
  }

  /* para o orçamento: os itens prontos (o mesmo molde do js/orcmodelo.js paraOrcamento) */
  function paraOrcamento(r) {
    var itens = [];
    arr(r && r.linhas).forEach(function (l) {
      if (l.status !== "ok" || !(l.quantidade > 0)) return;
      itens.push({ codigo: l.codigo, fonte: l.fonte, descricao: l.descricao, unidade: l.unidade, quantidade: l.quantidade, unitario: l.unitario, mo: l.mo || 0, mat: l.mat || 0, eq: l.eq || 0,
                   provisorio: l.provisorio || null, memoria: l.memoria, elementos: l.pecas.slice(0, 200), grupo: l.grupo, cotacao: l.cotacao || null });
    });
    return { nome: "Estrutura metálica — orçamento por peso (do modelo)", itens: itens };
  }

  /* os uids das peças metálicas do editor (o agente da EAP mede estas por kg) */
  function uidsDoModelo(estado) {
    var st = estado || (global.BimMetalUI && BimMetalUI.estado ? BimMetalUI.estado() : null), o = {};
    arr(st && st.caixas).forEach(function (c) {
      if (!c) return;
      var aco = (c.tipo === "metal" && c.metal) || ((c.tipo === "viga" || c.tipo === "pilar") && c.perfil && (c.material === "aco" || /^(I|U|L|tubo-ret|tubo-circ)$/.test(c.perfil.forma)));
      if (aco) o["edit:" + c.id] = 1;
    });
    return o;
  }

  /* ================================================================ PLANILHA (.xlsx) — lista de materiais por perfil + orçamento */
  function xlsx(r, ExcelJS, info) {
    info = info || {};
    var wb = new ExcelJS.Workbook(); wb.creator = "OrçaPRO"; wb.created = info.data ? new Date(info.data) : new Date(0);
    var AZUL = "FF00406A", lev = r.levantamento;
    function aba(nome, tit, cols, linhas, tot, nota) {
      var ws = wb.addWorksheet(nome, { pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1 } });
      ws.mergeCells(1, 1, 1, cols.length); ws.getCell(1, 1).value = tit; ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: AZUL } };
      ws.mergeCells(2, 1, 2, cols.length); ws.getCell(2, 1).value = (info.obra ? info.obra + " · " : "") + (nota || "Peso = massa das peças do modelo (geometria × 7 850 kg/m³, furos descontados)."); ws.getCell(2, 1).font = { italic: true, size: 9, color: { argb: "FF555555" } };
      var cab = ws.getRow(4);
      cols.forEach(function (c, i) { cab.getCell(i + 1).value = c[1]; ws.getColumn(i + 1).width = c[2] || 14; cab.getCell(i + 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } }; });
      cab.font = { bold: true, color: { argb: "FFFFFFFF" } }; cab.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; cab.height = 30;
      linhas.concat(tot ? [tot] : []).forEach(function (l, k) {
        var row = ws.getRow(5 + k);
        cols.forEach(function (c, i) { var v = l[c[0]]; row.getCell(i + 1).value = v == null ? "" : v; if (c[3]) row.getCell(i + 1).numFmt = c[3]; row.getCell(i + 1).border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } }; if (c[4]) row.getCell(i + 1).alignment = { wrapText: true, vertical: "top" }; });
        if (tot && k === linhas.length) { row.font = { bold: true }; cols.forEach(function (c, i) { row.getCell(i + 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDDE5EE" } }; }); }
      });
      ws.views = [{ state: "frozen", ySplit: 4 }];
      return ws;
    }
    var kgP = 0, mP = 0; lev.perfis.forEach(function (p) { kgP += p.kg; mP += p.comprimento; });
    aba("Materiais por perfil", "Lista de materiais por perfil", [["perfil", "Perfil", 26], ["tipo", "Tipo", 16], ["aco", "Aço", 16], ["papeis", "Função", 30, null, true], ["pecas", "Peças", 8, "0"], ["comprimento", "Comprimento total (m)", 14, "#,##0.000"],
      ["kgm", "kg/m (catálogo)", 12, "#,##0.00"], ["kg", "Peso total (kg)", 14, "#,##0.00"], ["marcas", "Marcas", 24, null, true], ["composicao", "Composição", 15]], lev.perfis,
      { perfil: "TOTAL", pecas: lev.perfis.reduce(function (s, p) { return s + p.pecas; }, 0), comprimento: r3(mP), kg: r2(kgP) });
    var kgC = 0; lev.chapas.forEach(function (c) { kgC += c.kg; });
    aba("Chapas", "Chapas por espessura", [["espessura", "Espessura (mm)", 12, "#,##0.0"], ["aco", "Aço", 16], ["pecas", "Peças", 8, "0"], ["area", "Área (m²)", 12, "#,##0.000"], ["kg", "Peso (kg)", 12, "#,##0.00"], ["marcas", "Marcas", 40, null, true], ["composicao", "Composição", 15]],
      lev.chapas, { espessura: "", aco: "TOTAL", pecas: lev.chapas.reduce(function (s, c) { return s + c.pecas; }, 0), kg: r2(kgC) });
    var lig = [];
    CLASSES_D.slice().forEach(function (k) { var x = lev.parafusos[k]; if (x) lig.push({ item: "Parafuso + porca + 2 arruelas — Ø " + PAR[k][3].toLowerCase(), qtd: x.n, kg: r2(x.kg), detalhe: x.diametros.join(", "), composicao: CODPAR[k] }); var t = lev.tirantes[k]; if (t) lig.push({ item: "Jogo de porcas e arruelas de tirante — Ø " + PAR[k][3].toLowerCase(), qtd: t.n, kg: "", detalhe: "2 porcas + 2 arruelas por ponta", composicao: CODTIR[k] }); });
    if (lev.chumbadores.ate25.n) lig.push({ item: "Chumbador até 25 mm", qtd: lev.chumbadores.ate25.n, kg: r2(lev.chumbadores.ate25.kg), detalhe: "", composicao: "PROP-MET-9021" });
    if (lev.chumbadores.acima.n) lig.push({ item: "Chumbador acima de 25 mm", qtd: lev.chumbadores.acima.n, kg: r2(lev.chumbadores.acima.kg), detalhe: "orçado por kg", composicao: "PROP-MET-9022" });
    aba("Ligações", "Parafusos, tirantes e chumbadores", [["item", "Item", 44], ["qtd", "Qtd", 8, "0"], ["kg", "Peso (kg)", 12, "#,##0.00"], ["detalhe", "Diâmetros / regra", 30], ["composicao", "Composição", 15]], lig, null);
    var orc = r.linhas.map(function (l) { return { grupo: l.grupo, codigo: l.codigo, fonte: l.fonte === "PROPRIA" ? "Própria RA" : (l.fonte === "COTACAO" ? "Cotação" : "SINAPI"), descricao: l.descricao + (l.provisorio ? " — PROVISÓRIO, cotar com o fornecedor (" + l.provisorio.motivo + ")" : ""), unidade: l.unidade, quantidade: l.quantidade, unitario: l.unitario, total: l.total, memoria: l.memoria }; });
    aba("Orçamento", "Orçamento da estrutura metálica (custo direto, sem BDI)", [["grupo", "Grupo", 12], ["codigo", "Código", 15], ["fonte", "Fonte", 10], ["descricao", "Descrição", 60, null, true], ["unidade", "Un", 7], ["quantidade", "Qtd", 12, "#,##0.0000"],
      ["unitario", "Unitário (R$)", 13, "#,##0.00"], ["total", "Total (R$)", 14, "#,##0.00"], ["memoria", "Memória de cálculo", 60, null, true]], orc, { descricao: "TOTAL — " + br(r.kg.estrutura, 2) + " kg de estrutura (R$ " + br(r.kgPorTonelada, 2) + " por tonelada)", total: r.total },
      "Preços: SINAPI da base carregada; composições próprias PROP-MET-90xx com coeficientes da SICRO e preços SINAPI MG 06/2026 / maior preço público (fonte na aba Composições).");
    var comps = [];
    COMPOSICOES.concat(INSUMOS).forEach(function (c) { comps.push({ codigo: c.codigo, descricao: c.descricao, unidade: c.unidade, custo: c.custoUnitario, fonte: c.observacao || c.criadoPor, prov: c.provisorio || "" }); });
    aba("Composições", "Composições e insumos próprios de fábrica (RA)", [["codigo", "Código", 15], ["descricao", "Descrição", 60, null, true], ["unidade", "Un", 6], ["custo", "Custo (R$)", 12, "#,##0.00"], ["fonte", "De onde vem o número", 80, null, true], ["prov", "Provisório (cotar)", 40, null, true]], comps, null, "Composição própria: coeficiente da SICRO/DNIT, preço da SINAPI MG 06/2026 ou o maior preço público com fonte e data.");
    return wb;
  }

  /* ================================================================ A TELA (diálogo) e o "Criar o orçamento" */
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function moeda(v) { return "R$ " + br(v, 2); }
  function toast(t, tipo, ms) { try { if (global.UI) UI.toast(t, tipo || "ok", ms || 7000); } catch (e) {} }
  var CHAVE = "orcapro:metalorc:cfg:v1";
  function baseApp() {
    return { obter: function (c) {
      var b = null; try { b = global.Bases && Bases.obter ? Bases.obter("SINAPI", c) : null; } catch (e) { b = null; }
      if (!b && global.Sinapi && Sinapi.obter) b = Sinapi.obter(c);
      if (!b) return null;
      var o = { codigo: b.codigo, descricao: b.descricao, unidade: b.unidade, custoUnitario: b.custoUnitario };
      try { if (global.Analitico && Analitico.quebra) { var q = Analitico.quebra(c, b.custoUnitario); o.custoMO = q.custoMO; o.custoMAT = q.custoMAT; o.custoEQ = q.custoEQ; } } catch (e2) {}
      return o;
    } };
  }
  function propriaApp() { return { obter: function (c) { try { return global.Bases && Bases.obter ? Bases.obter("PROPRIA", c) : null; } catch (e) { return null; } } }; }
  function planoApp() {
    /* ⚠ a MESMA chave de obra do plano de içamento (Gestao._icarObra: a obra do BIM ou "geral"). Com `_bimSel` puro, o
       modelo aberto sem obra escolhida tinha plano gravado em "geral" e o orçamento não o via — cobrava o guindauto
       genérico no lugar das horas do plano (achado no e2e do plano de montagem, 23/10/2026) */
    var G = global.Gestao, ob = G && (G._icarObra ? G._icarObra() : G._bimSel);
    if (!ob || !global.Store || !global.Auth) return null;
    try { return (Store.listar(Auth.empresaId(), "bim_icamento") || []).filter(function (p) { return p && p.obraId === ob; })[0] || null; } catch (e) { return null; }
  }
  var UIx = {
    ultimo: null,
    cfg: function () { var c = {}; try { c = JSON.parse(global.localStorage.getItem(CHAVE) || "{}") || {}; } catch (e) { c = {}; } return { sistema: c.sistema || "auto", preparo: c.preparo || "jateamento", galv: !!c.galv, duplex: !!c.duplex, galvPreco: c.galvPreco || "", galvFonte: c.galvFonte || "", galvData: c.galvData || "", dmtKm: c.dmtKm != null ? c.dmtKm : "" }; },
    gravar: function (c) { try { global.localStorage.setItem(CHAVE, JSON.stringify(c)); } catch (e) {} },
    opcoes: function (c) {
      var F = global.MetalFabUI, pc = F && F.cfg ? F.cfg() : {};
      return { pintura: { sistema: c.sistema, demaos: pc.demaos, preparo: c.preparo, grau: pc.sistema && pc.sistema.preparo ? (Pint() ? Pint().grauDe(pc.sistema.preparo) : "") : "" }, bordas: !!pc.bordas,
               galvanizacao: { usar: c.galv, duplex: c.duplex, precoKg: num(c.galvPreco, 0), fonte: c.galvFonte, data: c.galvData }, dmtKm: c.dmtKm === "" ? null : num(c.dmtKm, null),
               plano: planoApp(), base: baseApp(), propria: propriaApp() };
    },
    calcular: function (estado) {
      var st = estado || (global.BimMetalUI ? BimMetalUI.estado() : null);
      if (!st) { toast("Abra o modelador primeiro.", "aviso"); return null; }
      var r = orcar(st, this.opcoes(this.cfg())); this.ultimo = r; return r;
    },
    abrir: function () {
      var self = this, c = this.cfg();
      function sel(id, v, ops) { return '<select data-mo-campo="' + id + '">' + ops.map(function (o) { return '<option value="' + o[0] + '"' + (String(o[0]) === String(v) ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select>"; }
      function lab(t, h) { return '<label style="display:flex;flex-direction:column;font-size:12px;gap:3px"><span>' + t + "</span>" + h + "</label>"; }
      var h = '<p class="muted" style="font-size:12px;margin:0 0 8px">Orçamento da estrutura de aço <b>por peso</b>: fornecimento, fabricação e montagem, ligações, proteção, içamento e frete. Tudo com preço — o que a SINAPI não tem sai pelo maior preço público, marcado <b>provisório — cotar com o fornecedor</b>.</p>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:8px 12px;margin:0 0 10px">' +
        lab("Pintura", sel("sistema", c.sistema, [["auto", "Pelas demãos de Pintura e peso"], ["epoxi", "Epóxi (fundo + acabamento)"], ["alquidico", "Alquídico (zarcão + esmalte)"], ["nenhuma", "Sem pintura"]])) +
        lab("Preparo de superfície", sel("preparo", c.preparo, [["jateamento", "Jateamento com granalha (fábrica)"], ["nenhum", "Sem preparo (já incluso)"]])) +
        lab("Galvanização a fogo", sel("galv", c.galv ? (c.duplex ? "duplex" : "sim") : "nao", [["nao", "Não"], ["sim", "Sim (sem pintura)"], ["duplex", "Sim + pintura (duplex)"]])) +
        lab("Galvanização: R$ por kg (cotação)", '<input data-mo-campo="galvPreco" inputmode="decimal" value="' + esc(c.galvPreco) + '">') +
        lab("Galvanização: de quem é a cotação", '<input data-mo-campo="galvFonte" value="' + esc(c.galvFonte) + '">') +
        lab("Galvanização: data da cotação", '<input data-mo-campo="galvData" value="' + esc(c.galvData) + '" placeholder="dd/mm/aaaa">') +
        lab("Distância da fábrica à obra (km)", '<input data-mo-campo="dmtKm" inputmode="decimal" value="' + esc(c.dmtKm) + '" placeholder="30 (partida)">') + "</div>" +
        '<div data-mo="res"></div>';
      var bg = UI.modal("Orçamento da estrutura metálica", h, [
        { texto: "Recalcular", onClick: function () { self._ler(); self._render(); } },
        { texto: "Baixar .xlsx", onClick: function () { self._ler(); self._render(); self.baixarXlsx(); } },
        { texto: "Criar o orçamento", classe: "primary", onClick: function () { self._ler(); var r = self._render(); if (r && r.podeCriar) { UI.fecharModal(); self.criarOrcamento(r); } else toast("Resolva os problemas em vermelho antes de criar o orçamento.", "aviso", 8000); } },
        { texto: "Fechar", onClick: function () { UI.fecharModal(); } }]);
      if (bg && bg.addEventListener) bg.addEventListener("change", function () { self._ler(); self._render(); });
      this._render();
    },
    _val: function (id) { var e = document.querySelector('[data-mo-campo="' + id + '"]'); return e ? e.value : null; },
    _ler: function () {
      var c = this.cfg(), g = this._val("galv");
      c.sistema = this._val("sistema") || c.sistema; c.preparo = this._val("preparo") || c.preparo; c.galv = g === "sim" || g === "duplex"; c.duplex = g === "duplex";
      c.galvPreco = this._val("galvPreco") || ""; c.galvFonte = this._val("galvFonte") || ""; c.galvData = this._val("galvData") || ""; c.dmtKm = this._val("dmtKm") || "";
      this.gravar(c); return c;
    },
    _render: function () {
      var self = this, r = this.calcular(), el = document.querySelector('[data-mo="res"]'); if (!r || !el) return r;
      if (!r.ok) { el.innerHTML = '<p style="color:var(--vermelho)">' + esc(r.erro) + "</p>"; return r; }
      var PC = global.ProblemaCard, probs = r.problemas.length && PC ? PC.lista(r.problemas, { titulo: "Para fechar o orçamento", acoes: { "galv-preco": "Informar o preço da cotação", "galv-pintura": "Proteger com pintura", "carregar-base": "Carregar a base SINAPI", "sem-peso-props": "Mostrar a peça e abrir as Propriedades" } }) : "";
      var grupos = ["Estrutura", "Ligações", "Proteção", "Içamento", "Transporte"], linhas = "";
      grupos.forEach(function (gN) {
        var ls = r.linhas.filter(function (l) { return l.grupo === gN; }); if (!ls.length) return;
        linhas += '<tr><td colspan="6" style="font-weight:700;background:var(--surface-2)">' + gN + (r.porGrupo[gN] ? " — " + moeda(r.porGrupo[gN]) : "") + "</td></tr>";
        ls.forEach(function (l) {
          linhas += '<tr data-mo-cod="' + esc(l.codigo) + '"><td>' + esc(l.codigo) + '</td><td style="font-size:12px">' + esc(l.descricao) + (l.provisorio ? ' <span class="mod-pil mod-pil-alerta" title="' + esc(l.provisorio.motivo) + '">provisório — cotar com o fornecedor</span>' : "") +
            '<div class="muted" style="font-size:11px">' + esc(l.memoria) + '</div></td><td>' + esc(l.unidade) + '</td><td class="num">' + br(l.quantidade, 2) + '</td><td class="num">' + (l.unitario != null ? br(l.unitario, 2) : "—") + '</td><td class="num">' + (l.total != null ? br(l.total, 2) : "—") + "</td></tr>";
        });
      });
      el.innerHTML = probs + '<p style="font-size:13px;margin:4px 0 8px"><b data-mo="total">' + moeda(r.total) + "</b> de custo direto (sem BDI) · <b>" + br(r.kg.estrutura, 1) + " kg</b> de estrutura + " + br(r.kg.parafusos + r.kg.chumbadores, 1) + " kg de parafusos e chumbadores · " + br(r.area_m2, 1) + " m² de pintura · " + moeda(r.kgPorTonelada) + " por tonelada</p>" +
        '<div style="max-height:340px;overflow:auto"><table class="tbl tbl-compacta" data-mo="tab"><thead><tr><th>Código</th><th>Descrição</th><th>Un</th><th class="num">Qtd</th><th class="num">Unitário</th><th class="num">Total</th></tr></thead><tbody>' + linhas + "</tbody></table></div>" +
        (r.pendenciasPreco.length ? '<p class="muted" style="font-size:11.5px;margin:6px 0 0">Preço provisório em ' + r.pendenciasPreco.length + " item(ns): é o maior preço público achado (fonte na aba Composições do .xlsx) — cotar com o fornecedor antes de fechar.</p>" : "") +
        (r.avisos.length ? '<p class="muted" style="font-size:11.5px;margin:4px 0 0">' + r.avisos.map(esc).join("<br>") + "</p>" : "");
      if (PC && PC.ligar) PC.ligar(el, { corrigir: function (sol) { self.corrigir(sol); } });
      return r;
    },
    corrigir: function (sol) {
      var c = this.cfg();
      if (sol === "galv-preco") { if (global.ProblemaCard) ProblemaCard.irPara('[data-mo-campo="galvPreco"]'); return; }
      if (sol === "galv-pintura") { c.galv = false; c.duplex = false; this.gravar(c); var e = document.querySelector('[data-mo-campo="galv"]'); if (e) e.value = "nao"; this._render(); return; }
      if (sol === "carregar-base") { var me = this; if (global.OrcModeloUI && OrcModeloUI.carregarBase) OrcModeloUI.carregarBase(function () { me._render(); }); else toast("Carregue a base SINAPI em Tabelas.", "aviso"); return; }
      if (sol === "sem-peso-props") { var r = this.ultimo, ids = r && r.levantamento ? r.levantamento.semPeso.map(function (s) { return s.id; }) : []; if (global.ProblemaCard) ProblemaCard.mostrarNo3D(ids); try { if (global.BimShell && BimShell.abrirPropriedades) BimShell.abrirPropriedades(); } catch (e2) {} }
    },
    baixarXlsx: function () {
      var r = this.ultimo; if (!r || !r.ok) return;
      var U = global.BimMetalUI, nome = (U ? U.arqBase() : "obra") + "-orcamento-estrutura-metalica.xlsx", go = function () {
        xlsx(r, global.ExcelJS, { obra: U ? U.nomeObra() : "" }).xlsx.writeBuffer().then(function (buf) { if (U) U.baixar(nome, buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"); toast("Lista de materiais e orçamento — " + nome + ".", "ok"); }, function (e) { toast("Não gerei a planilha: " + (e && e.message ? e.message : e), "erro"); });
      };
      if (global.ExcelJS) go(); else if (global.ExcelOrc && ExcelOrc.ensureExcelJS) ExcelOrc.ensureExcelJS(go); else toast("O gerador de Excel não carregou.", "erro");
    },
    criarOrcamento: function (r) {
      var A = global.App, G = global.Gestao;
      if (A && A._trialBloqueado && A._trialBloqueado()) { if (A._avisoTrial) A._avisoTrial(); return null; }
      if (A && A._orcNovoRecusado && A._orcNovoRecusado()) return null;
      if (!global.Orcamento || !global.Store || !global.Auth) { toast("O módulo de orçamento não carregou.", "erro"); return null; }
      var seed = paraOrcamento(r); if (!seed.itens.length) { toast("Nada para lançar.", "aviso"); return null; }
      var lim = Auth.limite ? Auth.limite("limiteItensPorOrcamento") : Infinity;
      if (seed.itens.length > lim) { toast("O orçamento tem " + seed.itens.length + " itens e o seu plano aceita " + lim + " por orçamento.", "erro", 9000); return null; }
      var obra = null; try { obra = G && G._bimSel ? Store.obter(Auth.empresaId(), "obras", G._bimSel) : null; } catch (e) {}
      var orc = Orcamento.novo({ nome: "Estrutura metálica — " + (obra ? obra.nome : "BIM"), obra: obra ? obra.nome : "" });
      Orcamento.addEtapa(orc, seed.nome);
      var etapa = orc.etapas[orc.etapas.length - 1];
      seed.itens.forEach(function (it) {
        var item;
        if (it.fonte === "SINAPI") {
          var b = null; try { b = global.Bases && Bases.obter ? Bases.obter("SINAPI", it.codigo) : null; } catch (eB) {}
          if (!b && global.Sinapi && Sinapi.obter) b = Sinapi.obter(it.codigo);
          item = b ? JSON.parse(JSON.stringify(b)) : { codigo: it.codigo, descricao: it.descricao, unidade: it.unidade, custoUnitario: it.unitario };
          item.baseFonte = "SINAPI";
          try { if (global.Analitico && Analitico.quebra) { var q = Analitico.quebra(it.codigo, item.custoUnitario); item.custoMO = q.custoMO; item.custoMAT = q.custoMAT; item.custoEQ = q.custoEQ; } } catch (eQ) {}
        } else if (it.fonte === "PROPRIA") {
          var pr = null; try { pr = global.Bases && Bases.obter ? Bases.obter("PROPRIA", it.codigo) : null; } catch (eP) {}
          item = JSON.parse(JSON.stringify(pr || Propria.obter(it.codigo))); item.baseFonte = "PROPRIA";
        } else item = { codigo: it.codigo, descricao: it.descricao, unidade: it.unidade, custoUnitario: it.unitario, custoMO: 0, custoMAT: it.unitario, custoEQ: 0, baseFonte: "MERCADO" };
        Orcamento.addItem(orc, etapa.id, item, it.quantidade);
        var nv = etapa.itens[etapa.itens.length - 1];
        if (nv) { nv.bimElementos = it.elementos; nv.memoria = it.memoria; if (it.provisorio) nv.precoProvisorio = { motivo: it.provisorio.motivo, desde: "metalica" }; if (it.cotacao) nv.cotacao = it.cotacao; }
      });
      orc.origemBim = { obraId: (G && G._bimSel) || null, em: new Date().toISOString(), origem: "metalica-por-peso", kg: r.kg.estrutura, composicoes: seed.itens.length };
      if (!Store.salvarOrcamento(Auth.empresaId(), orc)) { toast("Não gravei o orçamento (armazenamento cheio ou lista ilegível). Nada foi criado.", "erro", 9000); return null; }
      try { console.info("[metalorc] orçamento criado " + orc.id + " (" + seed.itens.length + " itens, " + r.kg.estrutura + " kg)"); } catch (eC) {}
      toast("Orçamento \"" + orc.nome + "\" criado: " + seed.itens.length + " item(ns), " + moeda(r.total) + " de custo direto" + (r.pendenciasPreco.length ? " (" + r.pendenciasPreco.length + " com preço provisório — cotar)" : "") + ". Abra em Orçamentos.", "ok", 9000);
      return orc;
    }
  };

  var MetalOrc = { VERSAO: 1, INSUMOS: INSUMOS, COMPOSICOES: COMPOSICOES, SINAPI: SINAPI, PREMISSAS: PREMISSAS, GUINDAUTO_H_KG: GUINDAUTO_H_KG, Propria: Propria,
    levantar: levantar, orcar: orcar, paraOrcamento: paraOrcamento, xlsx: xlsx, uidsDoModelo: uidsDoModelo, sinapiDoEquipamento: sinapiDoEquipamento, capacidadeEq: capacidadeEq, tipoComp: tipoComp, classeD: classeD, CODPAR: CODPAR, CODTIR: CODTIR, UI: UIx,
    abrir: function () { return UIx.abrir(); } };
  global.MetalOrc = MetalOrc;
  if (typeof module !== "undefined" && module.exports) module.exports = MetalOrc;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
