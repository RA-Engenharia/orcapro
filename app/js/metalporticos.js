/* =====================================================================
 * metalporticos.js — METÁLICA: BIBLIOTECA DE PÓRTICOS INDUSTRIAIS
 * PARAMÉTRICOS (motor PURO, ES5, sem DOM, Node-testável). 14/10/2026,
 * frente M4 da 1.2.145.
 *
 * Pedido do Rogério: "cria também modelos paramétricos de todos os tipos de
 * pórticos metálicos mais usados em área industrial" — e cada um vai para o
 * CÁLCULO, sem o engenheiro configurar nada à mão.
 *
 * AS TIPOLOGIAS (TIPOS) e o MOTOR de cada uma:
 *   alma-cheia-1 ....... alma cheia, uma água ............ motor do GALPÃO
 *   alma-cheia-2 ....... alma cheia, duas águas .......... motor do GALPÃO
 *   misula ............. duas águas com mísula ........... estrutura desenhada
 *   trelica-paralelos .. treliçado de banzos paralelos ... estrutura desenhada
 *   trelica-trapezoidal  treliçado trapezoidal ........... estrutura desenhada
 *   tesoura ............ tesoura Howe / Pratt / Warren ... estrutura desenhada
 *   shed ............... shed (dente de serra) ........... estrutura desenhada
 *   multivao ........... multivão (2 a 4 vãos) ........... estrutura desenhada
 *   ponte .............. com ponte rolante ............... estrutura desenhada
 *   mezanino ........... com mezanino interno ............ estrutura desenhada
 *   atirantado ......... pórtico atirantado .............. estrutura desenhada
 *   coluna-trelicada ... coluna treliçada ................ estrutura desenhada
 * O motor do galpão (js/acomodelo.js + js/acodimensionar.js) cobre o pórtico
 * de alma cheia de uma e de duas águas — ele calcula também terças,
 * travessas, ligações e placas; o modelo BIM é o do js/metalgalpao.js (o
 * mesmo do assistente). O RESTO vai para a estrutura desenhada
 * (js/acomodelolivre.js + js/acodimlivre.js + js/acoenvoltorio.js): as peças
 * nascem pela MESMA ferramenta do usuário (js/metalcriar.js — viga com a
 * linha no topo, pilar no eixo, terça apoiada na linha), e cada peça leva em
 * `metal.calc` o que a TIPOLOGIA decide e o leitor do cálculo respeita:
 *   { tipologia, papel ("pilar"|"viga"|"terca"|"diagonal"), ini/fim
 *     ("rigida"|"rotulada"|"continua"), base ("rotulada"|"engastada"),
 *     naoVerificado: [{ tema, motivo }] }
 * (a escolha da tela e a ligação desenhada valem antes; ver
 * js/acomodelolivre.js, condicao/apoioDe).
 *
 * NADA "APROVADO" COM VERIFICAÇÃO FALTANDO: o que o motor não verifica sai
 * em `naoVerificado` das peças (→ situação "incompleto" na tela e no
 * memorial):
 *   · mísula: a peça cônica (seção variável) — o cálculo usa a mísula em
 *     DEGRAUS de I soldado, cada um com a MENOR altura do trecho;
 *   · ponte rolante: fadiga (NBR 8800, Anexo K), flechas e torção da viga de
 *     rolamento; sem as cargas das rodas, o pórtico sai calculado SEM a ponte;
 *   · mezanino: a vibração do piso (NBR 8800, Anexo L);
 *   · shed e multivão geminado: o vento sai "não verificado" pelo envoltório
 *     (telhados múltiplos — NBR 6123, Tabelas 7 e 8, não estão no motor).
 * Duas águas SIMÉTRICAS (cumeeira no meio, correndo em z) vão à Tabela 5 do
 * motor de vento (js/acoenvoltorio.js formaCobertura).
 *
 * API
 *   MetalPorticos.TIPOS / ORDEM / padrao(tipo) / normalizar(tipo, par) / validar(tipo, par)
 *   MetalPorticos.motorDe(tipo, par)          "galpao" | "livre"
 *   MetalPorticos.modelo(tipo, par)           geometria pura: { nos {id: [x,y,z]}, barras, areas, pontuais, … }
 *   MetalPorticos.gerar(tipo, par, novoId)    lote do editor (um Ctrl+Z): { ok, op, pecas, mapa, areas, pontuais, resumo, … }
 *   MetalPorticos.parGalpaoBIM(tipo, par)     o par do BimMetalGalpao.gerar (alma cheia)
 *   MetalPorticos.parGalpao(tipo, par)        o par do AcoDimensionar.calcular (alma cheia)
 *   MetalPorticos.entradaLivre(tipo, par, g, op)  a entrada do AcoDimLivre.calcular (g = gerar())
 *   MetalPorticos.calcular(tipo, par, op)     tudo junto (para teste/automação): { ok, motor, r, … }
 *   MetalPorticos.esquema(tipo, par)          SVG (texto) do pórtico típico, para a prévia
 * Coordenadas: X no vão (0 = eixo do pilar esquerdo, ou do banzo de fora da
 * coluna treliçada), Y para cima a partir da cota da base, Z ao longo do
 * comprimento (o 1º pórtico em z0). m, kN, graus na tela.
 * Teste: node tools/test-metal-porticos.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  function MC() { return dep("MetalCriar", "./metalcriar.js"); }
  function BG() { return dep("BimMetalGalpao", "./metalgalpao.js"); }
  function Aco() { return dep("PerfisAco", "./perfisaco.js"); }
  function MLv() { return dep("AcoModeloLivre", "./acomodelolivre.js"); }
  function Env() { return dep("AcoEnvoltorio", "./acoenvoltorio.js"); }
  function DLv() { return dep("AcoDimLivre", "./acodimlivre.js"); }
  function Dim() { return dep("AcoDimensionar", "./acodimensionar.js"); }
  function MPr() { return dep("MetalProntas", "./metalprontas.js"); }

  function num(v, d) { if (v == null || v === "") return d; var n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : d; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function r2(v) { return Math.round(v * 100) / 100; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function br(v, c) { c = c == null ? 2 : c; return (Math.round(num(v, 0) * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  /* ================================================================ TIPOLOGIAS
   * Os perfis de partida de cada tipologia saíram do PRÓPRIO cálculo: o otimizador da estrutura desenhada (o mais leve que
   * passa, por grupo) rodado no prédio padrão de cada uma (V0 = 35 m/s, categoria II), arredondado para cima onde a razão
   * ficou perto de 1 — em outra geometria eles são só o ponto de partida.
   * Os perfis são de PARTIDA (o cálculo troca pelo mais leve que passa quando o engenheiro pede); as medidas de partida
   * são proporções usuais de projeto (treliça: altura ≈ vão/12 a vão/15; mísula: ≈ vão/10 de comprimento e a altura da
   * viga), não recomendação de cálculo. */
  var COMUM = {
    vao: 15, peDireito: 6, inclinacao: 10, espacamento: 6, nPorticos: 5, base: "rotulada", cota: 0, x0: 0, z0: 0,
    fechamento: "fechado", contraventamento: "X-barra", barraCv: "BR 5/8\" (D 15,88 mm) Gerdau", cantoneiraCv: "L64X64X6.4",
    pilar: "W 310 x 38,7 Gerdau", viga: "W 310 x 32,7 Gerdau", terca: "Ue 200 x 75 x 25 x 3,00", espTercas: 1.8, correntes: 1, barraCorrente: "BR 3/8\" (D 9,53 mm) Gerdau",
    /* coluna de tapamento em TUBO: a estrutura desenhada não modela travessas (a travessa só trava a mesa de fora, e o leitor
       trataria como trava das duas — otimista na sucção); o tubo não tem flambagem lateral com torção */
    tapamento: "TR 150 x 100 x 5 VMB", espTapamento: 6, permanenteExtra: 0.10,
    aco: "ASTM A572 Gr.50", acoFrio: "NBR 6650 CF-26", acoTubo: "VMB 350", acoBarra: "ASTM A36"
  };
  var TRELICA = { banzo: "TQ 100 x 100 x 5,6 VMB", diagonal: "TQ 70 x 70 x 4 VMB", montante: "TQ 60 x 60 x 3,6 VMB", escora: "TQ 90 x 90 x 4 VMB", padrao: "pratt", paineis: 0 };   /* escora de 6 m comprimida pelo contraventamento: L/r ≤ 200 pede r ≥ 3 cm */
  function tipo(id, rotulo, grupo, motor, desc, extra) {
    var P = clone(COMUM); Object.keys(extra || {}).forEach(function (k) { P[k] = extra[k]; });
    return { id: id, rotulo: rotulo, grupo: grupo, motor: motor, desc: desc, PADRAO: P };
  }
  function comTrelica(o) { var q = clone(TRELICA); Object.keys(o).forEach(function (k) { q[k] = o[k]; }); return q; }
  var TIPOS = {
    "alma-cheia-1": tipo("alma-cheia-1", "Alma cheia — uma água", "Alma cheia", "galpao", "Pórtico de alma cheia com a água caindo de um pilar para o outro: telheiro, galpão encostado, garagem de máquinas.", { aguas: 1, base: "engastada", vao: 12, tapamento: "W 200 x 15,0 Gerdau" }),
    "alma-cheia-2": tipo("alma-cheia-2", "Alma cheia — duas águas", "Alma cheia", "galpao", "O galpão mais comum: pilares e vigas I, cumeeira no meio do vão.", { aguas: 2, base: "engastada", tapamento: "W 200 x 15,0 Gerdau" }),
    "misula": tipo("misula", "Duas águas com mísula", "Alma cheia", "livre", "Alma cheia com mísula no joelho: mais altura onde o momento é maior, viga mais leve no vão.", { misulaComprimento: 0, misulaAltura: 0, degraus: 3, base: "engastada" }),
    "trelica-paralelos": tipo("trelica-paralelos", "Treliçado de banzos paralelos", "Treliçado", "livre", "Treliça de banzos paralelos (uma ou duas águas) apoiada nos pilares pelos dois banzos: vãos grandes com pouco aço.", comTrelica({ aguas: 2, alturaTrelica: 1.2, vao: 20, inclinacao: 5, base: "engastada" })),
    "trelica-trapezoidal": tipo("trelica-trapezoidal", "Treliçado trapezoidal", "Treliçado", "livre", "Banzo de cima em duas águas, banzo de baixo reto: altura no apoio para o pórtico e mais altura no meio do vão.", comTrelica({ alturaTrelica: 0.8, vao: 20, padrao: "howe", base: "engastada" })),
    "tesoura": tipo("tesoura", "Tesoura (Howe, Pratt, Warren)", "Treliçado", "livre", "Treliça triangular apoiada no topo dos pilares (pilares engastados na base): cobertura de vão médio com inclinação maior.", comTrelica({ vao: 15, inclinacao: 25, base: "engastada", padrao: "howe" })),
    "shed": tipo("shed", "Shed (dente de serra)", "Coberturas especiais", "livre", "Dentes de uma água com a face vertical envidraçada: iluminação natural uniforme em fábricas.", { dentes: 3, vaoDente: 8, alturaDente: 2, vao: 24, base: "engastada", pilar: "W 410 x 75,0 Gerdau", viga: "W 250 x 25,3 Gerdau" }),
    "multivao": tipo("multivao", "Multivão com pilar central", "Coberturas especiais", "livre", "Dois a quatro vãos com pilares internos: uma cobertura única em duas águas ou geminada (uma duas águas por vão).", { vaos: 2, vaoCada: 12, cobertura: "unica", pilarInterno: "W 310 x 38,7 Gerdau", ligInterna: "rigida", vao: 24, base: "engastada", pilar: "W 200 x 35,9 Gerdau", viga: "W 250 x 38,5 Gerdau" }),
    "ponte": tipo("ponte", "Com ponte rolante", "Industrial pesado", "livre", "Alma cheia com consoles nos pilares e viga de rolamento biapoiada em cada vão; as cargas das rodas vêm do fabricante da ponte.", { base: "engastada", vao: 18, peDireito: 8, pilar: "W 460 x 74,0 Gerdau", viga: "W 360 x 51,0 Gerdau", tapamento: "TR 200 x 150 x 6,4 VMB", cotaConsole: 0, excentricidade: 0.75, console: "W 250 x 32,7 Gerdau", vigaRolamento: "W 530 x 74,0 Gerdau", capacidade: 5, vaoPonte: 0, rodaMax: "", rodaMin: "", rodaTransv: "", forcaLong: "", entreEixos: 3.0 }),
    "mezanino": tipo("mezanino", "Com mezanino interno", "Industrial pesado", "livre", "Alma cheia com mezanino ao longo de uma lateral: vigas apoiadas no pilar do pórtico e numa fila de pilares própria.", { vao: 18, peDireito: 8, base: "engastada", pilar: "W 460 x 82,0 Gerdau", viga: "W 410 x 46,1 Gerdau", tapamento: "TR 180 x 130 x 6,4 VMB", largura: 5, cotaPiso: 3.5, vigaMez: "W 310 x 28,3 Gerdau", secMez: "W 310 x 32,7 Gerdau", pilarMez: "W 310 x 28,3 Gerdau", espSec: 1.5, uso: "industrial-adm", qInformado: "", gPiso: 0.5 }),
    "atirantado": tipo("atirantado", "Pórtico atirantado", "Alma cheia", "livre", "Duas águas com tirante de barra redonda entre os joelhos (e pendural na cumeeira): o tirante leva o empuxo das vigas.", { tirante: "BR 3/4\" (D 19,05 mm) Gerdau", pendural: "BR 5/8\" (D 15,88 mm) Gerdau", base: "engastada", pilar: "W 250 x 38,5 Gerdau", viga: "W 200 x 31,3 Gerdau" }),
    "coluna-trelicada": tipo("coluna-trelicada", "Coluna treliçada", "Industrial pesado", "livre", "Pilar treliçado (dois banzos e travejamento em zigue-zague) com viga de alma cheia: pé-direito alto e rigidez com pouco aço.", { vao: 20, peDireito: 10, larguraColuna: 0.8, banzoColuna: "W 200 x 26,6 Gerdau", travejamento: "TQ 60 x 60 x 3,6 VMB", painelColuna: 1.0, escora: "TQ 90 x 90 x 4 VMB", viga: "W 460 x 52,0 Gerdau", tapamento: "TR 250 x 150 x 7,1 VMB" })
  };
  /* o que fica NÃO VERIFICADO em cada tipologia (a tela mostra antes de gerar; o cálculo põe em "não verificados") */
  var NAO_VERIFICA = {
    misula: ["a mísula cônica (o cálculo usa a mísula em degraus de I soldado com a menor altura de cada trecho)"],
    shed: ["o vento da cobertura em shed (telhado múltiplo: NBR 6123, Tabelas 7 e 8 — não estão no motor)"],
    multivao: ["com cobertura GEMINADA: o vento (telhado múltiplo — NBR 6123, Tabelas 7 e 8)"],
    ponte: ["a fadiga (NBR 8800, Anexo K)", "as flechas e a torção da viga de rolamento", "o limite de deslocamento próprio de galpão com ponte rolante (Tabela C.1)", "sem as cargas das rodas (fabricante): a ponte não entra"],
    mezanino: ["a vibração do piso do mezanino (NBR 8800, Anexo L)"]   /* o deslocamento é o entre pisos (h/500): o pilar é dividido no piso */
  };
  Object.keys(NAO_VERIFICA).forEach(function (k) { TIPOS[k].naoVerifica = NAO_VERIFICA[k]; });
  Object.keys(TIPOS).forEach(function (k) {
    if (!TIPOS[k].naoVerifica) TIPOS[k].naoVerifica = [];
    /* REVISÃO M4: na estrutura desenhada as ligações declaradas pela tipologia não são dimensionadas (no galpão são) */
    if (TIPOS[k].motor === "livre") TIPOS[k].naoVerifica = TIPOS[k].naoVerifica.concat(["as ligações e placas de base que a tipologia declara (o cálculo da estrutura desenhada não as dimensiona)"]);
  });
  var ORDEM = ["alma-cheia-1", "alma-cheia-2", "misula", "atirantado", "trelica-paralelos", "trelica-trapezoidal", "tesoura", "shed", "multivao", "ponte", "mezanino", "coluna-trelicada"];
  var NUMS = ["vao", "peDireito", "inclinacao", "espacamento", "nPorticos", "cota", "x0", "z0", "espTercas", "espTapamento", "permanenteExtra", "correntes", "aguas", "misulaComprimento", "misulaAltura", "degraus",
              "alturaTrelica", "paineis", "dentes", "vaoDente", "alturaDente", "vaos", "vaoCada", "cotaConsole", "excentricidade", "capacidade", "vaoPonte", "entreEixos", "largura", "cotaPiso", "espSec", "gPiso",
              "larguraColuna", "painelColuna"];
  var PADROES = { howe: "Howe", pratt: "Pratt", warren: "Warren" };
  function padrao(t) { var T = TIPOS[t]; return T ? clone(T.PADRAO) : null; }
  /* #49 e) a regra, MEDIDA no cálculo (vento local do cpe médio, terça de beiral Ue 200 × 75 × 25 × 3,00 do padrão, atirantado
     10 × 12 com 6 m entre pórticos, v0 35 m/s): 1 linha ancorada (Lz 3 m) → razão 1,149, REPROVA; 2 linhas nos terços (Lz 2 m)
     → 0,69, passa. O trecho do eixo fraco entre correntes ancoradas fica até LIMITE_LZ_CORRENTE = 2,0 m: n = ⌈esp/2⌉ − 1 (até
     4 m 1 linha, até 6 m 2, acima 3). O cálculo confere sempre (tools/test-metal-porticos-calculo.js); se a terça reprovar, ele
     diz e traz a solução. */
  var LIMITE_LZ_CORRENTE = 2.0;
  var BITOLAS_BR = ["BR 1/4\" (D 6,35 mm) Gerdau", "BR 3/8\" (D 9,53 mm) Gerdau", "BR 1/2\" (D 12,70 mm) Gerdau", "BR 5/8\" (D 15,88 mm) Gerdau", "BR 3/4\" (D 19,05 mm) Gerdau", "BR 1\" (D 25,40 mm) Gerdau"];
  function areaBR(nome) { var m0 = /D ([0-9]+,[0-9]+) mm/.exec(String(nome)); var d = m0 ? Number(m0[1].replace(",", ".")) : 0; return Math.PI * d * d / 4; }
  function barraAncoragem(linha, n, cosB) {
    var Areq = areaBR(linha) / (Math.max(1, n) * Math.max(cosB, 0.2)), C = MC();
    if (!(cosB > 0.2)) return linha;
    for (var i = 0; i < BITOLAS_BR.length; i++) { var b = BITOLAS_BR[i]; if (areaBR(b) >= Areq - 1e-9 && areaBR(b) >= areaBR(linha) && (!C || !C.perfilCat || C.perfilCat(b))) return b; }
    return BITOLAS_BR[BITOLAS_BR.length - 1];
  }
  function linhasCorrentesPara(esp) { return Math.max(1, Math.min(3, Math.ceil(esp / LIMITE_LZ_CORRENTE - 1e-9) - 1)); }
  function normalizar(t, par) {
    var T = TIPOS[t]; if (!T) return null;
    var p = clone(T.PADRAO);
    Object.keys(par || {}).forEach(function (k) { if (par[k] != null && par[k] !== "") p[k] = clone(par[k]); });
    NUMS.forEach(function (k) { if (k in T.PADRAO || k in (par || {})) p[k] = num(p[k], num(T.PADRAO[k], 0)); });
    p.nPorticos = Math.max(2, Math.round(num(p.nPorticos, 5)));
    /* #49 e) (16/10/2026): sem escolha, as linhas de corrente por vão saem pela regra do cálculo (js/acodimlivre.js, vento local:
       o eixo fraco da terça vai de corrente ANCORADA a corrente ANCORADA, Lz = espaçamento/(n+1)) — LIMITE_LZ_CORRENTE */
    var corAuto = !par || par.correntes == null || par.correntes === "";
    p.correntes = corAuto ? linhasCorrentesPara(num(p.espacamento, 6)) : Math.max(0, Math.min(3, Math.round(num(p.correntes, 1))));
    p.correntesAuto = corAuto;
    p.base = p.base === "engastada" ? "engastada" : "rotulada";
    p.fechamento = p.fechamento === "aberto" ? "aberto" : "fechado";
    p.contraventamento = /^(X-barra|X-cantoneira|nenhum)$/.test(String(p.contraventamento)) ? p.contraventamento : "X-barra";
    if (t === "shed") { p.dentes = Math.round(p.dentes); p.vao = r6(p.dentes * p.vaoDente); p.inclinacao = r6(100 * p.alturaDente / p.vaoDente); }
    if (t === "multivao") { p.vaos = Math.round(p.vaos); p.vao = r6(p.vaos * p.vaoCada); p.cobertura = p.cobertura === "geminada" ? "geminada" : "unica"; p.ligInterna = p.ligInterna === "rotulada" ? "rotulada" : "rigida"; }
    if (t === "alma-cheia-1") p.aguas = 1;
    if (t === "alma-cheia-2" || t === "trelica-trapezoidal" || t === "tesoura") p.aguas = 2;
    if (t === "trelica-paralelos") p.aguas = num(p.aguas, 2) === 1 ? 1 : 2;
    if (p.padrao != null) p.padrao = PADROES[p.padrao] ? p.padrao : "pratt";
    if (t === "misula") { p.degraus = Math.max(2, Math.min(6, Math.round(num(p.degraus, 3)))); }
    p.comprimento = r6((p.nPorticos - 1) * p.espacamento);
    return p;
  }
  function motorDe(t) { return TIPOS[t] ? TIPOS[t].motor : null; }

  function catOk(nome) { var C = MC(); return !!(C && nome && C.perfilCat(nome)); }
  function perfilCat(nome) { var A = Aco(), C = MC(); var n = C && C.perfilCat(nome); return n && A ? A.paraPerfil(n) : null; }
  function faixa(v, a, b, nome, un) { return v >= a && v <= b ? null : nome + " entre " + br(a, a % 1 ? 1 : 0) + " e " + br(b, b % 1 ? 1 : 0) + " " + un + "."; }
  function validar(t, par) {
    var p = normalizar(t, par); if (!p) return "Tipologia desconhecida: " + t + ".";
    var e = faixa(p.vao, 4, 60, "Vão", "m") || faixa(p.peDireito, 2.5, 25, "Pé-direito", "m") || faixa(p.espacamento, 2, 15, "Espaçamento dos pórticos", "m") ||
            faixa(p.nPorticos, 2, 40, "Número de pórticos", "") || faixa(p.espTercas, 0.6, 3, "Espaçamento máximo das terças", "m");
    if (e) return e;
    if (t !== "shed" && (e = faixa(p.inclinacao, t === "trelica-paralelos" ? 3 : 2, 60, "Inclinação do telhado", "%"))) return e;
    var ks = ["pilar", "terca"];
    if (t === "alma-cheia-1" || t === "alma-cheia-2" || t === "misula" || t === "atirantado" || t === "ponte" || t === "mezanino" || t === "multivao" || t === "shed" || t === "coluna-trelicada") ks.push("viga");
    if (/^trelica|^tesoura/.test(t)) ks = ks.concat(["banzo", "diagonal", "montante", "escora"]);
    if (p.fechamento === "fechado") ks.push("tapamento");
    if (p.correntes > 0) ks.push("barraCorrente");
    if (p.contraventamento === "X-barra") ks.push("barraCv"); else if (p.contraventamento === "X-cantoneira") ks.push("cantoneiraCv");
    if (t === "multivao") ks.push("pilarInterno");
    if (t === "ponte") ks = ks.concat(["console", "vigaRolamento"]);
    if (t === "mezanino") ks = ks.concat(["vigaMez", "secMez", "pilarMez"]);
    if (t === "atirantado") ks = ks.concat(["tirante", "pendural"]);
    if (t === "coluna-trelicada") ks = ks.concat(["banzoColuna", "travejamento", "escora"]);
    var falta = ks.filter(function (k) { return !catOk(p[k]); });
    if (falta.length) return "Perfil não encontrado no catálogo: " + falta.map(function (k) { return k + " = " + p[k]; }).join(", ") + ".";
    if (p.contraventamento === "X-barra" && perfilCat(p.barraCv).forma !== "circ") return "Contraventamento em X de barra redonda: escolha uma barra redonda (BR) do catálogo.";
    /* CANTONEIRA SIMPLES COMPRIMIDA: o motor das barras (js/acodim8800.js) usa L/r mínimo, sem a esbeltez equivalente da
       NBR 8800, 5.3.4.4 (cantoneira ligada por uma aba — maior que a dele): alma de treliça e travejamento só em perfil que o
       motor verifica inteiro (tubo, U, I) */
    var webs = /^trelica|^tesoura/.test(t) ? ["diagonal", "montante"] : (t === "coluna-trelicada" ? ["travejamento"] : []);
    var emL = webs.filter(function (k) { var q = perfilCat(p[k]); return q && q.forma === "L"; });
    if (emL.length) return "Cantoneira simples na alma comprimida (" + emL.map(function (k) { return k + " = " + p[k]; }).join(", ") + "): a esbeltez equivalente da cantoneira ligada por uma aba (NBR 8800, 5.3.4.4) não está no motor — use tubo (TQ/TR/TC).";
    if (/^trelica|^tesoura/.test(t)) {
      if (t !== "tesoura" && (e = faixa(p.alturaTrelica, 0.3, 4, "Altura da treliça no apoio", "m"))) return e;
      if (t !== "tesoura" && p.alturaTrelica > p.vao / 4) return "Altura da treliça no apoio de no máximo 1/4 do vão.";
      if (t === "trelica-trapezoidal" && p.alturaTrelica >= p.peDireito - 1) return "A treliça no apoio tem de deixar pelo menos 1 m de pilar abaixo do banzo inferior.";
      if (t === "trelica-paralelos" && p.alturaTrelica >= p.peDireito - 1) return "A treliça tem de deixar pelo menos 1 m de pilar abaixo do banzo inferior.";
      if (t !== "tesoura" && p.alturaTrelica < tolLeitor(p.banzo, p.banzo)) return "Treliça: " + br(p.alturaTrelica, 2) + " m entre os banzos no apoio é menos que a seção deles (" + br(tolLeitor(p.banzo, p.banzo), 2) + " m): o cálculo juntaria os dois banzos no pilar.";
      if (p.paineis && (e = faixa(p.paineis, 2, 30, "Número de painéis", ""))) return e;
    }
    if (t === "shed") { if ((e = faixa(p.dentes, 2, 6, "Número de dentes", "") || faixa(p.vaoDente, 4, 20, "Vão de cada dente", "m") || faixa(p.alturaDente, 0.5, 6, "Altura do dente (face envidraçada)", "m"))) return e; if (p.alturaDente / p.vaoDente > 0.6) return "Dente com mais de 60 % de inclinação: aumente o vão ou baixe a altura do dente.";
      if (p.alturaDente < tolLeitor(p.viga, p.viga)) return "Shed: a face envidraçada de " + br(p.alturaDente, 2) + " m é menor que a seção das vigas (" + br(tolLeitor(p.viga, p.viga), 2) + " m): o cálculo juntaria as pontas das duas vigas no pilar — aumente o dente."; }
    if (t === "multivao" && (e = faixa(p.vaos, 2, 4, "Número de vãos", "") || faixa(p.vaoCada, 4, 40, "Vão de cada módulo", "m"))) return e;
    if (t === "atirantado" && p.inclinacao / 100 * p.vao / 2 < tolLeitor(p.viga, p.pendural)) return "Atirantado: a cumeeira fica só " + br(p.inclinacao / 100 * p.vao / 2, 2) + " m acima do tirante (menos que a seção da viga): aumente a inclinação.";
    if (t === "misula") {
      if (p.misulaAltura && (e = faixa(p.misulaAltura, 0.1, 1.5, "Altura acrescida pela mísula", "m"))) return e;
      var mmV = misulaMedidas(p);
      if (p.misulaComprimento && (e = faixa(p.misulaComprimento, mmV.min, p.vao / 4, "Comprimento da mísula (em planta; o mínimo são 2 degraus de 1,1 × a altura da seção)", "m"))) return e;
      if (mmV.Lm > p.vao / 4) return "Mísula: com esta viga a mísula precisa de " + br(mmV.min, 2) + " m em planta, mais que 1/4 do vão — aumente o vão ou use viga mais baixa.";
      /* alma do degrau mais alto: com h/tw > 5,70·√(E/fy) é alma ESBELTA (Anexo H) — o motor das barras não cobre (só avisa) */
      var pvM = perfilCat(p.viga), fyM = 345, hw = (pvM.d + mmV.dm * (1 - 1 / mmV.N) - 2 * pvM.tf) / pvM.tw, lim = 5.70 * Math.sqrt(200000 / fyM);
      if (hw > lim) return "Mísula: o degrau mais alto fica com alma esbelta (h/tw = " + br(hw, 1) + " > 5,70·√(E/fy) = " + br(lim, 1) + "; NBR 8800, Anexo H, não coberto pelo motor) — baixe a altura da mísula ou use viga de alma mais grossa.";
    }
    if (t === "ponte") {
      var cc = consoleCota(p); if ((e = faixa(cc, 2, p.peDireito - 0.5, "Cota do topo do console", "m"))) return e;
      if ((e = faixa(p.excentricidade, 0.25, 1.5, "Distância do eixo do pilar ao eixo da viga de rolamento", "m"))) return e;
      if (p.excentricidade < tolLeitor(p.pilar, p.vigaRolamento)) return "Ponte: a viga de rolamento fica a " + br(p.excentricidade, 2) + " m do eixo do pilar, menos que a meia seção dos dois (" + br(tolLeitor(p.pilar, p.vigaRolamento), 2) + " m): o cálculo juntaria a viga ao pilar — afaste a viga (excentricidade).";
      if ((e = faixa(p.entreEixos, 0.5, 2 * p.espacamento - 0.2, "Distância entre as rodas de um lado", "m"))) return e;
      if (p.nPorticos < 3) return "Ponte rolante: pelo menos 3 pórticos (o pórtico do meio recebe a ponte).";
      var rodas = ["rodaMax", "rodaMin", "rodaTransv", "forcaLong"].filter(function (k) { return p[k] !== "" && p[k] != null; });
      if (rodas.some(function (k) { return !(num(p[k], NaN) >= 0); })) return "Cargas da ponte: valores em kN, zero ou mais.";
      if (num(p.rodaMax, 0) > 0 && num(p.rodaMin, 0) > num(p.rodaMax, 0)) return "Cargas da ponte: a reação mínima da roda não pode passar da máxima.";
      /* com a ponte: TODAS as cargas do fabricante — vazio não vira zero calado (zero só se o fabricante disser) */
      if (num(p.rodaMax, 0) > 0 && ["rodaMin", "rodaTransv", "forcaLong"].some(function (k) { return p[k] === "" || p[k] == null; })) return "Cargas da ponte: com a reação máxima, informe também a mínima, a força transversal por roda e a longitudinal por trilho (do fabricante; zero só se ele disser).";
    }
    if (t === "mezanino") { if ((e = faixa(p.largura, 1, p.vao - 1, "Largura do mezanino", "m") || faixa(p.cotaPiso, 2, p.peDireito - 1, "Cota do piso do mezanino", "m") || faixa(p.espSec, 0.5, 3, "Espaçamento das vigas secundárias", "m"))) return e; }
    if (t === "coluna-trelicada") { if ((e = faixa(p.larguraColuna, 0.3, 2, "Largura da coluna treliçada (entre eixos dos banzos)", "m") || faixa(p.painelColuna, 0.4, 3, "Altura do painel do travejamento", "m"))) return e; if (p.larguraColuna > p.vao / 4) return "Coluna treliçada com no máximo 1/4 do vão de largura.";
      if (p.larguraColuna < tolLeitor(p.banzoColuna, p.banzoColuna)) return "Coluna treliçada: " + br(p.larguraColuna, 2) + " m entre os banzos é menos que a seção deles (" + br(tolLeitor(p.banzoColuna, p.banzoColuna), 2) + " m): o cálculo juntaria os dois banzos — alargue a coluna."; }
    return null;
  }
  /* A TOLERÂNCIA DO LEITOR (js/acomodelolivre.js, TOL): pontas a menos de 1 cm + meia seção de cada peça viram UM nó. Toda
     distância da tipologia entre pontas que não são o mesmo nó tem de passar disso, senão o cálculo junta o que não é junto
     (achados nos testes: a viga de rolamento W 530 a 0,50 m do pilar virou nó DO PILAR e a fila ficou um mecanismo; a mísula
     curta virou peça solta). altSec = a maior dimensão da seção, a mesma que o leitor usa (h = máx(altura, largura)). */
  function altSec(nome) { var q = perfilCat(nome); if (!q) return 0; return Math.max(num(q.d, 0), num(q.h, 0), num(q.bw, 0), num(q.bf, 0), num(q.b, 0), num(q.a, 0)); }
  function tolLeitor(a, b) { return 1.1 * (0.01 + 0.5 * (altSec(a) + altSec(b))); }
  function consoleCota(p) { return p.cotaConsole > 0 ? p.cotaConsole : r2(Math.max(2, 0.7 * p.peDireito)); }
  /* MÍSULA: comprimento (em planta) e degraus do cálculo. O leitor da estrutura desenhada junta pontas a menos de 1 cm + meia
     seção de cada peça (js/acomodelolivre.js TOL): o degrau tem de ser mais longo que a seção mais alta, senão as duas pontas
     dele viram um nó só (achado no teste: mísula de 1 m em 3 degraus com a viga W 310 — "peças soltas"). Por isso: cada degrau
     ≥ 1,1·(d + dm); o comprimento automático é o maior entre vão/10 e 3 desses passos (2 degraus no cálculo), até vão/4. */
  function misulaMedidas(p) {
    var pv = perfilCat(p.viga); if (!pv) return { Lm: 0, dm: 0, N: 2, min: 0 };
    var dm = p.misulaAltura > 0 ? p.misulaAltura : pv.d, passo = 1.1 * (pv.d + dm), min = 2 * passo;
    var Lm = p.misulaComprimento > 0 ? p.misulaComprimento : Math.min(p.vao / 4, Math.ceil(Math.max(p.vao / 10, 3 * passo) * 20) / 20);   /* automático: 2 degraus no cálculo quando cabe */
    var N = Math.max(2, Math.min(p.degraus, Math.floor(Lm / passo + 1e-9)));
    return { Lm: r6(Lm), dm: r6(dm), N: N, min: r6(min) };
  }

  /* ================================================================ O PÓRTICO TÍPICO (no plano x-y)
   * Q.P(nome, x, y) ponto; Q.M(a, b, o) peça entre dois pontos — o = { ferr, cat | perfil, just, giro, papel, grupo,
   * aco, calc }. Q.tel: as linhas das TERÇAS ({ pt (o ponto na linha de cálculo da peça do telhado), x, y (onde a terça
   * apoia), giro, agua }); Q.esc: os pontos das ESCORAS longitudinais (banzo inferior); Q.parede: os pontos de base e topo
   * das filas externas de pilares (o X das paredes); Q.topoTap(x): onde a coluna de tapamento do oitão encontra o
   * telhado; Q.colX: as filas de pilares do pórtico (o tapamento não repete). */
  function Quadro(p, t) {
    var Q = { pts: {}, mem: [], tel: [], esc: [], parede: {}, colX: [], aguas: [], extra: {}, nv: [], dec: [] };
    Q.P = function (n, x, y) { Q.pts[n] = [r6(x), r6(y)]; return n; };
    Q.M = function (a, b, o) { var m = {}; Object.keys(o || {}).forEach(function (k) { m[k] = o[k]; }); m.a = a; m.b = b; m.calc = m.calc || {}; Q.mem.push(m); return m; };
    return Q;
  }
  function pecaPilar(p, cat, calc, extra) { var o = { ferr: "pilar", cat: cat || p.pilar, just: "centro", papel: "Pilar", grupo: "pilar", aco: p.aco, calc: calc || {} }; Object.keys(extra || {}).forEach(function (k) { o[k] = extra[k]; }); return o; }
  function pecaViga(p, cat, calc, extra) { var o = { ferr: "viga", cat: cat || p.viga, just: "topo", papel: "Viga de cobertura", grupo: "viga", aco: p.aco, calc: calc || {} }; Object.keys(extra || {}).forEach(function (k) { o[k] = extra[k]; }); return o; }
  function acoDe(p, cat) { var q = perfilCat(cat); if (!q) return p.aco; return q.forma === "frio" ? p.acoFrio : q.forma === "tubo-ret" || q.forma === "tubo-circ" ? p.acoTubo : q.forma === "circ" ? p.acoBarra : q.forma === "L" ? "ASTM A36" : p.aco; }
  function pecaTrel(p, cat, papel, grupo, calc, extra) { var o = { ferr: papel === "Banzo superior" || papel === "Banzo inferior" ? "viga" : "diagonal", cat: cat, just: "centro", papel: papel, grupo: grupo, aco: acoDe(p, cat), calc: calc || {} }; Object.keys(extra || {}).forEach(function (k) { o[k] = extra[k]; }); return o; }
  function giroAgua(nx, ny) { return r6(Math.atan2(-nx, ny) * 180 / Math.PI); }   /* a terça corre em +z: Y = (−sen f, cos f, 0) = a normal da água */
  /* as terças de uma água (do ponto A ao ponto B, A embaixo), espaçadas até espTercas ao longo da água, com o ponto de cada
     uma numa peça da linha de cálculo (dyLinha: o quanto a terça apoia acima da linha — banzo de treliça) */
  /* a terça da cumeeira recebe as DUAS águas (área de cobertura e contraventamento de cada água chegam até ela) */
  function cumeeiraDasDuas(Q, xc) { Q.tel.forEach(function (tl) { if (Math.abs(tl.x - xc) < 1e-6) tl.aguas = ["esquerda", "direita"]; }); }
  function linhaTercas(Q, p, A, Bp, agua, pref, incluiFim, dyLinha) {
    var dx = Bp[0] - A[0], dy = Bp[1] - A[1], L = Math.sqrt(dx * dx + dy * dy); if (!(L > 1e-6)) return [];
    var n = Math.max(1, Math.ceil(L / p.espTercas - 1e-9)), out = [], nx = -dy / L, ny = dx / L; if (ny < 0) { nx = -nx; ny = -ny; }
    for (var j = 0; j <= n; j++) {
      if (j === n && !incluiFim) break;
      var x = A[0] + dx * j / n, y = A[1] + dy * j / n, nome = Q.P(pref + j, x, y);
      out.push({ pt: nome, x: r6(x), y: r6(y + num(dyLinha, 0)), giro: giroAgua(nx, ny), agua: agua, normal: [r6(nx), r6(ny)] });
    }
    out.forEach(function (q) { Q.tel.push(q); });
    return out;
  }

  /* ---------------------------------------------------------------- alma cheia de duas águas (misula, atirantado, ponte, mezanino) */
  function qDuasAguas(Q, p, t) {
    var B = p.vao, H = p.peDireito, i = p.inclinacao / 100, xc = B / 2, yc = H + i * xc, nom = TIPOS[t].rotulo;
    var yR = function (x) { return H + i * Math.min(x, B - x); };
    Q.P("BL", 0, 0); Q.P("EL", 0, H); Q.P("BR", B, 0); Q.P("ER", B, H); Q.P("C", xc, yc);
    /* REVISÃO M4 alto d (15/10/2026): no MEZANINO o pilar do pórtico é dividido no piso — um membro por piso, e o deslocamento é
       o ENTRE PISOS (h/500, Tabela C.1), não o H/300 do pavimento único */
    if (t === "mezanino") { Q.P("ML", 0, p.cotaPiso); Q.M("BL", "ML", pecaPilar(p, null, { base: p.base })); Q.M("ML", "EL", pecaPilar(p, null, {})); }
    else Q.M("BL", "EL", pecaPilar(p, null, { base: p.base }));
    Q.M("BR", "ER", pecaPilar(p, null, { base: p.base }));
    Q.colX.push(0, B);
    Q.parede = { esq: ["BL", "EL"], dir: ["BR", "ER"] };
    Q.topoTap = function (x) { return [x, yR(x)]; };
    Q.yR = yR;
    if (t === "misula") {
      /* MÍSULA em DEGRAUS: a viga perde dm de altura linearmente até o fim da mísula (Lm em planta); cada degrau é um I SOLDADO
         com a MENOR altura do seu trecho (a favor da segurança na resistência) — o último trecho já é a viga */
      var pv = perfilCat(p.viga), mm = misulaMedidas(p), Lm = mm.Lm, dm = mm.dm, N = mm.N;
      if (mm.N < p.degraus) Q.dec.push("Mísula: " + (mm.N - 1) + " degrau(s) no cálculo (pedidos " + (p.degraus - 1) + "): cada degrau precisa de pelo menos 1,1 × a altura da seção em planta (" + br(1.1 * (pv.d + dm), 2) + " m) — o cálculo junta as pontas mais próximas que meia seção.");
      Q.extra.misula = { comprimento: Lm, altura: dm, degraus: N, viga: p.viga };
      var nvM = [{ tema: "Mísula de seção variável", motivo: "a mísula (" + br(Lm, 2) + " m em planta, + " + br(dm * 1000, 0) + " mm no joelho) foi modelada e calculada em " + (N - 1) + " degraus de I soldado de seção constante, cada um com a MENOR altura do seu trecho (a favor da segurança na resistência); a peça CÔNICA fabricada não é verificada pelo motor (a NBR 8800 não traz o procedimento de barra de seção variável) — nem a diferença de rigidez entre ela e os degraus, que leva um pouco mais de momento ao joelho" }];
      [["L", 0, 1, "EL"], ["R", B, -1, "ER"]].forEach(function (ld) {
        var prev = ld[3];
        for (var j = 1; j <= N; j++) {
          var xj = ld[1] + ld[2] * Lm * j / N, nm = Q.P("M" + ld[0] + j, xj, yR(xj));
          if (j < N) {
            var dj = pv.d + dm * (1 - j / N), pf = { forma: "I", d: r6(dj), bf: pv.bf, tw: pv.tw, tf: pv.tf, r: 0, soldadoCalc: true, rotulo: "PS " + Math.round(dj * 1000) + " x " + Math.round(pv.bf * 1000) + " x " + br(pv.tw * 1000, 1) + " x " + br(pv.tf * 1000, 1) + " (mísula " + j + ")" };
            Q.M(prev, nm, pecaViga(p, null, { ini: j === 1 ? "rigida" : "continua", fim: "continua", naoVerificado: nvM }, { cat: null, perfil: pf, papel: "Mísula", grupo: "misula", nome: "Mísula " + (ld[0] === "L" ? "esquerda" : "direita") + " — degrau " + j }));
            prev = nm;
          } else Q.M(prev, "C", pecaViga(p, null, { ini: "continua", fim: "rigida" }));
        }
      });
    } else {
      Q.M("EL", "C", pecaViga(p, null, { ini: "rigida", fim: "rigida" })); Q.M("ER", "C", pecaViga(p, null, { ini: "rigida", fim: "rigida" }));
    }
    linhaTercas(Q, p, [0, H], [xc, yc], "esquerda", "TL", true);
    linhaTercas(Q, p, [B, H], [xc, yc], "direita", "TR", false);
    cumeeiraDasDuas(Q, xc);
    Q.aguas.push({ agua: "esquerda", x0: 0, x1: xc, normal: [-Math.sin(Math.atan(i)), Math.cos(Math.atan(i))] }, { agua: "direita", x0: xc, x1: B, normal: [Math.sin(Math.atan(i)), Math.cos(Math.atan(i))] });
    if (t === "atirantado") {
      Q.P("T", xc, H);
      Q.M("EL", "ER", { ferr: "diagonal", cat: p.tirante, just: "centro", papel: "Tirante do pórtico", grupo: "tirante", aco: acoDe(p, p.tirante), calc: {} });
      Q.M("C", "T", { ferr: "diagonal", cat: p.pendural, just: "centro", papel: "Pendural", grupo: "pendural", aco: acoDe(p, p.pendural), calc: {} });
      Q.dec.push("Tirante de barra redonda entre os joelhos: trabalha só à tração (sai do modelo quando comprimido — vento de sucção); o pendural da cumeeira segura o tirante no meio do vão.");
    }
    if (t === "ponte") {
      var yc0 = consoleCota(p), e = p.excentricidade;
      Q.P("CL0", 0, yc0); Q.P("CL1", e, yc0); Q.P("CR0", B, yc0); Q.P("CR1", B - e, yc0);
      /* a ponta do console é RÍGIDA no nó: a viga de rolamento apoia em GARFO (a torção dela fica presa no console); a viga
         continua rotulada à flexão nas duas pontas. Com o console rotulado na ponta, a fila de vigas girava em torno do próprio
         eixo sem nada que a segurasse — mecanismo no último console (achado no teste com 3 pórticos) */
      Q.M("CL0", "CL1", pecaViga(p, p.console, { ini: "rigida", fim: "rigida" }, { papel: "Console", grupo: "console", nome: "Console esquerdo" }));
      Q.M("CR0", "CR1", pecaViga(p, p.console, { ini: "rigida", fim: "rigida" }, { papel: "Console", grupo: "console", nome: "Console direito" }));
      Q.extra.consoles = { esq: "CL1", dir: "CR1", cota: yc0, e: e };
    }
    if (t === "mezanino") {
      var Lmz = p.largura, hm = p.cotaPiso;
      Q.P("MB", Lmz, 0); Q.P("MT", Lmz, hm); Q.P("ML", 0, hm);
      Q.M("MB", "MT", pecaPilar(p, p.pilarMez, { base: "rotulada" }, { papel: "Pilar do mezanino", grupo: "pilarMez" }));
      Q.M("ML", "MT", pecaViga(p, p.vigaMez, { ini: "rotulada", fim: "rotulada", naoVerificado: [{ tema: "Vibração do piso do mezanino", motivo: "a vibração do piso (NBR 8800, Anexo L — frequência natural e aceleração de pico) NÃO foi verificada pelo motor" }] }, { papel: "Viga do mezanino", grupo: "vigaMez" }));
      Q.extra.mez = { largura: Lmz, cota: hm };
    }
  }
  /* ---------------------------------------------------------------- uma água (só para o esquema/medidas do motor do galpão) */
  function qUmaAgua(Q, p) {
    var B = p.vao, H = p.peDireito, i = p.inclinacao / 100;
    Q.P("BL", 0, 0); Q.P("EL", 0, H); Q.P("BR", B, 0); Q.P("ER", B, H + i * B);
    Q.M("BL", "EL", pecaPilar(p)); Q.M("BR", "ER", pecaPilar(p)); Q.M("EL", "ER", pecaViga(p));
    Q.colX.push(0, B); Q.parede = { esq: ["BL", "EL"], dir: ["BR", "ER"] };
    Q.yR = function (x) { return H + i * x; };
    linhaTercas(Q, p, [0, H], [B, H + i * B], "unica", "TL", true);
  }
  /* ---------------------------------------------------------------- treliças */
  function qTrelica(Q, p, t) {
    var B = p.vao, H = p.peDireito, i = p.inclinacao / 100, duas = p.aguas !== 1, he = t === "tesoura" ? 0 : p.alturaTrelica;
    var pb = perfilCat(p.banzo), dch = Math.max(pb.d || 0, pb.h || 0, pb.bw || 0, 0.05);
    var yT = function (x) { return H + i * (duas ? Math.min(x, B - x) : x); };
    var yB = t === "trelica-paralelos" ? function (x) { return yT(x) - he; } : function () { return H - he; };
    var meio = duas ? B / 2 : B, nAuto = Math.max(2, Math.ceil(meio / 1.8 - 1e-9)), n = p.paineis ? Math.round(p.paineis) : nAuto;
    if (duas && p.paineis) n = Math.max(2, Math.round(p.paineis / 2));
    var lados = duas ? [["L", 0, 1], ["R", B, -1]] : [["L", 0, 1]];
    var nomT = function (ld, k) { return k === n && duas ? "TC" : "T" + ld + k; }, nomD = function (ld, k) { return k === n && duas ? "DC" : "D" + ld + k; };
    var calcBanzo = { ini: "rotulada", fim: duas ? "continua" : "rotulada" };
    lados.forEach(function (ld) {
      for (var k = 0; k <= n; k++) {
        var x = ld[1] + ld[2] * meio * k / n;
        if (!(k === n && duas && ld[0] === "R")) { Q.P(nomT(ld[0], k), x, yT(x)); Q.P(nomD(ld[0], k), x, yB(x)); }
      }
    });
    /* pilares até o nó do banzo de cima (o banzo de baixo encontra o pilar no meio dele) */
    Q.P("BL", 0, 0); Q.P("BR", B, 0);
    Q.M("BL", "TL0", pecaPilar(p, null, { base: p.base })); Q.M("BR", duas ? "TR0" : "TL" + n, pecaPilar(p, null, { base: p.base }));
    Q.colX.push(0, B); Q.parede = { esq: ["BL", "TL0"], dir: ["BR", duas ? "TR0" : "TL" + n] };
    Q.topoTap = function (x) { return [x, yT(x)]; };
    Q.yR = yT;
    /* banzos */
    lados.forEach(function (ld) {
      Q.M(nomT(ld[0], 0), nomT(ld[0], n), pecaTrel(p, p.banzo, "Banzo superior", "banzoSup", calcBanzo, { papel: "Banzo superior" }));
      if (t === "trelica-paralelos" || !duas) Q.M(nomD(ld[0], 0), nomD(ld[0], n), pecaTrel(p, p.banzo, "Banzo inferior", "banzoInf", calcBanzo));
    });
    if (t !== "trelica-paralelos" && duas) Q.M("DL0", "DR0", pecaTrel(p, p.banzo, "Banzo inferior", "banzoInf", { ini: "rotulada", fim: "rotulada" }));
    if (t === "tesoura") { /* tesoura: o banzo de baixo nasce no mesmo nó do de cima (DL0 = TL0) */ }
    /* alma: montantes e diagonais por meia treliça (do apoio para o meio) */
    var W = { papel: "diagonal" }, pad = p.padrao, depth = function (x) { return yT(x) - yB(x); };
    lados.forEach(function (ld) {
      var X = function (k) { return ld[1] + ld[2] * meio * k / n; };
      for (var k = 1; k <= n; k++) {
        if (k === n && duas && ld[0] === "R") continue;   /* o montante do meio é um só */
        var mont = pad !== "warren" || k === n || (t === "tesoura" && k === 1);
        if (mont && depth(X(k)) > 0.15) Q.M(nomD(ld[0], k), nomT(ld[0], k), pecaTrel(p, p.montante, "Montante", "montante", W));
      }
      for (var k2 = 0; k2 < n; k2++) {
        if (t === "tesoura" && k2 === 0) continue;   /* o 1º painel da tesoura é o triângulo dos banzos com o montante */
        var desce;   /* true: do topo em k2 ao pé em k2+1 (Howe: as diagonais descem para o meio) */
        if (pad === "howe") desce = true; else if (pad === "pratt") desce = false; else desce = (k2 - (t === "tesoura" ? 1 : 0)) % 2 === 0;
        var a = desce ? nomT(ld[0], k2) : nomD(ld[0], k2), b = desce ? nomD(ld[0], k2 + 1) : nomT(ld[0], k2 + 1);
        if (depth(X(desce ? k2 + 1 : k2)) < 0.15 && depth(X(desce ? k2 : k2 + 1)) < 0.15) continue;
        Q.M(a, b, pecaTrel(p, p.diagonal, "Diagonal", "diagonal", W));
      }
      /* terças em todos os nós do banzo de cima, apoiadas na face de cima do banzo */
      for (var k3 = 0; k3 <= n; k3++) {
        if (k3 === n && duas && ld[0] === "R") continue;
        var nm = nomT(ld[0], k3), P0 = Q.pts[nm], th = Math.atan(i), nx = k3 === n && duas ? 0 : -ld[2] * Math.sin(th), ny = k3 === n && duas ? 1 : Math.cos(th);
        if (!duas) { nx = -Math.sin(th); ny = Math.cos(th); }
        Q.tel.push({ pt: nm, x: P0[0], y: r6(P0[1] + dch / 2 / Math.cos(th)), giro: giroAgua(nx, ny), agua: duas ? (ld[0] === "L" ? "esquerda" : "direita") : "unica", normal: [r6(nx), r6(ny)], aguas: k3 === n && duas ? ["esquerda", "direita"] : null });
      }
      /* escoras do banzo de baixo a cada ~3 m (e no meio) */
      var m = Math.max(1, Math.round(3.0 / (meio / n)));
      for (var k4 = m; k4 <= n; k4 += m) { if (k4 === n && duas && ld[0] === "R") continue; if (depth(X(k4)) > 0.15 || t !== "tesoura") Q.esc.push({ pt: nomD(ld[0], k4), topo: nomT(ld[0], k4) }); }
      if (duas && ld[0] === "L" && n % m) Q.esc.push({ pt: "DC", topo: "TC" });
    });
    var th0 = Math.atan(i);
    if (duas) Q.aguas.push({ agua: "esquerda", x0: 0, x1: B / 2, normal: [-Math.sin(th0), Math.cos(th0)] }, { agua: "direita", x0: B / 2, x1: B, normal: [Math.sin(th0), Math.cos(th0)] });
    else Q.aguas.push({ agua: "unica", x0: 0, x1: B, normal: [-Math.sin(th0), Math.cos(th0)] });
    Q.extra.trelica = { paineis: duas ? 2 * n : n, painel: r6(meio / n), altura: he, padrao: PADROES[pad], dch: dch };
    Q.dec.push("Treliça " + PADROES[pad] + (t === "tesoura" ? " (tesoura)" : "") + ": banzos contínuos, diagonais e montantes articulados nos nós; banzos rotulados no pilar" + (he > 0 ? " — os dois banzos ligados ao pilar formam o pórtico (o binário dos banzos leva o momento)" : " — tesoura apoiada no topo do pilar: a estabilidade do pórtico vem da base " + p.base) + "; terças em todos os nós do banzo de cima; escoras longitudinais no banzo de baixo (travam o banzo comprimido pela sucção) ancoradas por X vertical entre as treliças dos vãos extremos.");
  }
  /* ---------------------------------------------------------------- shed */
  function qShed(Q, p) {
    var n = p.dentes, s = p.vaoDente, hd = p.alturaDente, H = p.peDireito, B = n * s, th = Math.atan(hd / s);
    for (var j = 0; j <= n; j++) {
      var x = j * s; Q.P("B" + j, x, 0); Q.P("E" + j, x, j === 0 ? H : H + hd); if (j > 0 && j < n) Q.P("M" + j, x, H);
      Q.M("B" + j, "E" + j, pecaPilar(p, null, { base: p.base })); Q.colX.push(x);
    }
    for (var d = 0; d < n; d++) {
      var a = d === 0 ? "E0" : "M" + d;
      Q.M(a, "E" + (d + 1), pecaViga(p, null, { ini: "rigida", fim: "rigida" }, { nome: "Viga do dente " + (d + 1) }));
      linhaTercas(Q, p, Q.pts[a], Q.pts["E" + (d + 1)], "dente" + (d + 1), "T" + d + "_", true);
      Q.aguas.push({ agua: "dente" + (d + 1), x0: d * s, x1: (d + 1) * s, normal: [-Math.sin(th), Math.cos(th)] });
    }
    Q.parede = { esq: ["B0", "E0"], dir: ["B" + n, "E" + n] };
    Q.topoTap = function (x) { var d2 = Math.min(n - 1, Math.floor(x / s)), xl = x - d2 * s; return [x, H + hd * xl / s]; };
    Q.yR = function (x) { return Q.topoTap(x)[1]; };
    Q.dec.push("Shed de " + n + " dentes de " + br(s, 2) + " m: viga de cada dente rígida nos pilares; a face vertical (envidraçada) é o trecho de cima do pilar.");
  }
  /* ---------------------------------------------------------------- multivão */
  function qMultivao(Q, p) {
    var n = p.vaos, s = p.vaoCada, B = n * s, H = p.peDireito, i = p.inclinacao / 100, uni = p.cobertura !== "geminada";
    var yR = uni ? function (x) { return H + i * Math.min(x, B - x); } : function (x) { var j = Math.min(n - 1, Math.floor(x / s + 1e-9)), xl = x - j * s; return H + i * Math.min(xl, s - xl); };
    for (var j = 0; j <= n; j++) {
      var x = j * s, interno = j > 0 && j < n; Q.P("B" + j, x, 0); Q.P("E" + j, x, yR(x));
      Q.M("B" + j, "E" + j, pecaPilar(p, interno ? p.pilarInterno : null, interno ? { base: p.base, fim: p.ligInterna === "rotulada" ? "rotulada" : null } : { base: p.base }, interno ? { papel: "Pilar interno", grupo: "pilarInterno" } : null));
      Q.colX.push(x);
    }
    /* o telhado: as quebras (pilares, cumeeiras, calhas) e as vigas entre elas */
    var qs = []; for (var j2 = 0; j2 <= n; j2++) qs.push(j2 * s);
    if (uni) { if (qs.every(function (x) { return Math.abs(x - B / 2) > 1e-6; })) qs.push(B / 2); } else for (var j3 = 0; j3 < n; j3++) qs.push(j3 * s + s / 2);
    qs.sort(function (a, b) { return a - b; });
    var nome = function (x) { var j4 = Math.round(x / s); return Math.abs(x - j4 * s) < 1e-6 ? "E" + j4 : Q.P("K" + Math.round(x * 1000), x, yR(x)); };
    for (var q = 0; q + 1 < qs.length; q++) {
      var xa = qs[q], xb = qs[q + 1], na = nome(xa), nb = nome(xb), sobe = yR(xb) > yR(xa) + 1e-9;
      var a = sobe ? na : nb, b = sobe ? nb : na, xA = sobe ? xa : xb;   /* a viga vai do ponto baixo para o alto */
      var ext = function (x) { return Math.abs(x) < 1e-6 || Math.abs(x - B) < 1e-6; };
      Q.M(a, b, pecaViga(p, null, { ini: ext(xA) ? "rigida" : (uni ? "continua" : "rigida"), fim: uni ? "continua" : "rigida" }));
      var agua = (uni ? (xa < B / 2 - 1e-6 ? "esquerda" : "direita") : "vao" + (Math.floor((xa + 1e-6) / s) + 1) + (xa - Math.floor((xa + 1e-6) / s) * s < s / 2 - 1e-6 ? "e" : "d"));
      linhaTercas(Q, p, Q.pts[a], Q.pts[b], agua, "T" + q + "_", true);   /* as linhas repetidas nas quebras saem logo abaixo */
      var th = Math.atan(i), nx = (sobe ? -1 : 1) * Math.sin(th);
      Q.aguas.push({ agua: agua, x0: xa, x1: xb, normal: [nx, Math.cos(th)] });
    }
    /* terças repetidas no mesmo ponto (a cumeeira e as calhas recebem a linha das duas águas): uma só */
    var vis = {}; Q.tel = Q.tel.filter(function (tl) { var k = Math.round(tl.x * 1000) + ":" + Math.round(tl.y * 1000); if (vis[k]) { vis[k].aguas = (vis[k].aguas || [vis[k].agua]).concat([tl.agua]); return false; } vis[k] = tl; return true; });
    Q.parede = { esq: ["B0", "E0"], dir: ["B" + n, "E" + n] };
    Q.topoTap = function (x) { return [x, yR(x)]; };
    Q.yR = yR;
    Q.dec.push("Multivão de " + n + " vãos de " + br(s, 2) + " m, cobertura " + (uni ? "única em duas águas (vigas contínuas sobre os pilares internos)" : "GEMINADA (uma duas águas por vão, calhas sobre os pilares internos)") + "; pilares internos " + (p.ligInterna === "rotulada" ? "ROTULADOS no topo (pendulares)" : "rígidos com as vigas") + ".");
  }
  /* ---------------------------------------------------------------- coluna treliçada */
  function qColunaTrel(Q, p) {
    var B = p.vao, H = p.peDireito, i = p.inclinacao / 100, bc = p.larguraColuna, xc = B / 2, yc = H + i * xc, hp = p.painelColuna;
    var yR = function (x) { return H + i * Math.min(x, B - x); };
    Q.P("C", xc, yc);
    [["L", 0, 1], ["R", B, -1]].forEach(function (ld) {
      var xo = ld[1], xi = ld[1] + ld[2] * bc, ytI = yR(xi);
      Q.P("BO" + ld[0], xo, 0); Q.P("EO" + ld[0], xo, H); Q.P("BI" + ld[0], xi, 0); Q.P("EI" + ld[0], xi, ytI);
      Q.M("BO" + ld[0], "EO" + ld[0], pecaPilar(p, p.banzoColuna, { base: "rotulada" }, { papel: "Banzo da coluna", grupo: "banzoColuna", nome: "Coluna treliçada " + (ld[0] === "L" ? "esquerda" : "direita") + " — banzo de fora" }));
      Q.M("BI" + ld[0], "EI" + ld[0], pecaPilar(p, p.banzoColuna, { base: "rotulada", fim: "rotulada" }, { papel: "Banzo da coluna", grupo: "banzoColuna", nome: "Coluna treliçada " + (ld[0] === "L" ? "esquerda" : "direita") + " — banzo de dentro" }));
      /* travejamento: horizontais a cada painel e uma diagonal por painel, alternando (zigue-zague) */
      var nP = Math.max(2, Math.round(H / hp)), h = H / nP;
      for (var k = 0; k <= nP; k++) {
        var y = k === 0 ? Math.min(0.3, h / 2) : (k === nP ? H - 0.05 : k * h);
        Q.P("TO" + ld[0] + k, xo, y); Q.P("TI" + ld[0] + k, xi, y);
        Q.M("TO" + ld[0] + k, "TI" + ld[0] + k, pecaTrel(p, p.travejamento, "Travejamento", "travejamento", { papel: "diagonal" }));
        if (k > 0) Q.M(k % 2 ? "TO" + ld[0] + (k - 1) : "TI" + ld[0] + (k - 1), k % 2 ? "TI" + ld[0] + k : "TO" + ld[0] + k, pecaTrel(p, p.travejamento, "Diagonal da coluna", "travejamento", { papel: "diagonal" }));
      }
      Q.M("EO" + ld[0], "C", pecaViga(p, null, { ini: "rotulada", fim: "rigida" }));
      /* TRAVAMENTO LONGITUDINAL dos banzos (fora do plano do pórtico): escoras a cada ~3 m nos dois banzos, ancoradas pelo X em
         painéis nas duas linhas de banzo dos vãos extremos — sem elas o banzo de dentro fica solto fora do plano na altura toda */
      var nNiv = Math.max(1, Math.round(H / 3)), ks = [];
      for (var q = 1; q < nNiv; q++) { var kq = Math.round(nP * q / nNiv); if (kq > 0 && kq < nP && ks.indexOf(kq) < 0) ks.push(kq); }
      Q.extra.colNiveis = Q.extra.colNiveis || { L: [], R: [] };
      ks.forEach(function (kq) { Q.esc.push({ pt: "TO" + ld[0] + kq, coluna: true }); Q.esc.push({ pt: "TI" + ld[0] + kq, coluna: true }); });
      Q.extra.colNiveis[ld[0]] = ["BO" + ld[0]].concat(ks.map(function (kq) { return "TO" + ld[0] + kq; })).concat(["EO" + ld[0]]);
      Q.extra.colNiveisI = Q.extra.colNiveisI || {};
      Q.extra.colNiveisI[ld[0]] = ["BI" + ld[0]].concat(ks.map(function (kq) { return "TI" + ld[0] + kq; })).concat(["TI" + ld[0] + nP]);
    });
    Q.colX.push(0, bc, B - bc, B);
    Q.parede = { esq: ["BOL", "EOL"], dir: ["BOR", "EOR"] };
    /* o X das paredes em PAINÉIS entre os níveis das escoras, nas linhas dos dois banzos */
    Q.paredesPaineis = [Q.extra.colNiveis.L, Q.extra.colNiveis.R, Q.extra.colNiveisI.L, Q.extra.colNiveisI.R];
    Q.topoTap = function (x) { return [x, yR(x)]; };
    Q.yR = yR;
    linhaTercas(Q, p, [0, H], [xc, yc], "esquerda", "TL", true);
    linhaTercas(Q, p, [B, H], [xc, yc], "direita", "TR", false);
    cumeeiraDasDuas(Q, xc);
    var th = Math.atan(i);
    Q.aguas.push({ agua: "esquerda", x0: 0, x1: xc, normal: [-Math.sin(th), Math.cos(th)] }, { agua: "direita", x0: xc, x1: B, normal: [Math.sin(th), Math.cos(th)] });
    Q.dec.push("Coluna treliçada de " + br(bc, 2) + " m entre eixos dos banzos: os dois banzos rotulados na base e no topo (a coluna é engastada pelo binário dos banzos), travejamento em zigue-zague articulado; a viga passa contínua sobre o banzo de dentro.");
  }

  function quadro(t, p) {
    var Q = Quadro(p, t);
    if (t === "alma-cheia-1") qUmaAgua(Q, p);
    else if (t === "alma-cheia-2" || t === "misula" || t === "atirantado" || t === "ponte" || t === "mezanino") qDuasAguas(Q, p, t);
    else if (t === "trelica-paralelos" || t === "trelica-trapezoidal" || t === "tesoura") qTrelica(Q, p, t);
    else if (t === "shed") qShed(Q, p);
    else if (t === "multivao") qMultivao(Q, p);
    else if (t === "coluna-trelicada") qColunaTrel(Q, p);
    return Q;
  }

  /* ================================================================ O PRÉDIO (pórticos + o que liga um ao outro) */
  function modelo(t, par) {
    var e = validar(t, par); if (e) return { ok: false, motivo: e };
    var p = normalizar(t, par), T = TIPOS[t], Q = quadro(t, p), esp = p.espacamento, nP = p.nPorticos;
    var nos = {}, barras = [], cont = {}, avisos = [], dec = Q.dec.slice(), nomeT = T.rotulo;
    function W(x, y, z) { return [r6(p.x0 + x), r6(p.cota + y), r6(p.z0 + z)]; }
    function no(id, x, y, z) { nos[id] = W(x, y, z); return id; }
    /* toda peça leva a tipologia e a declaração de GALPÃO DE UM PAVIMENTO (deslocamento do topo H/300 — js/acodimlivre.js) */
    function barra(o) { o.id = "b" + (barras.length + 1); o.calc = o.calc || {}; o.calc.tipologia = nomeT; if (t !== "mezanino") o.calc.umPavimento = true; barras.push(o); cont[o.grupo] = (cont[o.grupo] || 0) + 1; return o; }
    var zs = []; for (var k = 0; k < nP; k++) zs.push(r6(k * esp));
    /* pórticos */
    zs.forEach(function (z, k) {
      Object.keys(Q.pts).forEach(function (n) { no(k + ":" + n, Q.pts[n][0], Q.pts[n][1], z); });
      Q.mem.forEach(function (m) {
        var o = clone(m); o.a = k + ":" + m.a; o.b = k + ":" + m.b; o.portico = k + 1;
        o.nome = (m.nome || m.papel) + " — pórtico " + (k + 1);
        barra(o);
      });
    });
    /* terças (por vão entre pórticos), com as ids por água para as áreas de cobertura */
    var tercasPorAgua = {};
    zs.forEach(function (z, k) {
      if (k + 1 >= nP) return;
      Q.tel.forEach(function (tl, j) {
        var a = no("t" + k + ":" + j, tl.x, tl.y, z), b = no("t" + (k + 1) + ":" + j + "'", tl.x, tl.y, zs[k + 1]);
        var o = barra({ a: a, b: b, ferr: "terca", cat: p.terca, just: "base", giro: tl.giro, papel: "Terça", grupo: "terca", aco: acoDe(p, p.terca), nome: "Terça " + (j + 1) + " — vão " + (k + 1), calc: {} });
        (tl.aguas || [tl.agua]).forEach(function (ag) { (tercasPorAgua[ag] = tercasPorAgua[ag] || []).push(o.id); });
      });
    });
    /* CORRENTES de terça (barra redonda, só tração): em cada vão, `correntes` linhas ao longo da água, de terça a terça, do
       beiral (ou da calha) à cumeeira — travam a terça no eixo fraco e na flambagem lateral (a terça da cumeeira, comum às duas
       águas, ancora as duas cadeias); a barra passa no meio da alma da terça */
    var pt0 = perfilCat(p.terca), dT = pt0 ? (pt0.bw || pt0.d || pt0.h || 0.15) : 0.15, nCorr = 0, nAncC = 0, catsAnc = [];
    if (p.correntes > 0) zs.forEach(function (z, k) {
      if (k + 1 >= nP) return;
      Q.aguas.forEach(function (aq) {
        var ls = Q.tel.filter(function (tl) { return (tl.aguas || [tl.agua]).indexOf(aq.agua) >= 0; }).sort(function (a, b) { return a.x - b.x; });
        var nx = aq.normal[0], ny = aq.normal[1];
        for (var q = 0; q + 1 < ls.length; q++) for (var c = 1; c <= p.correntes; c++) {
          var zc = z + esp * c / (p.correntes + 1), A0 = ls[q], B0 = ls[q + 1];
          var a = no("cr" + k + ":" + aq.agua + ":" + q + ":" + c, A0.x + nx * dT / 2, A0.y + ny * dT / 2, zc), b = no("cr" + k + ":" + aq.agua + ":" + q + ":" + c + "'", B0.x + nx * dT / 2, B0.y + ny * dT / 2, zc);
          barra({ a: a, b: b, ferr: "diagonal", cat: p.barraCorrente, just: "centro", papel: "Corrente de terça", grupo: "corrente", aco: acoDe(p, p.barraCorrente), nome: "Corrente — vão " + (k + 1), calc: {} });
          nCorr++;
        }
        /* #49 e) ANCORAGEM da linha (como se executa): corrente DIAGONAL da terça logo abaixo da cumeeira (ou do lado alto da
           água) até a terça da cumeeira NO PÓRTICO — leva a força da linha ao ponto rígido. Sem ela a linha só vai de terça a terça
           e o cálculo não a conta (js/acomodelolivre.js tercasNaBorda: "corrente sem ancoragem não trava"). Linha da metade do vão
           para cada pórtico; a do meio (n ímpar) para os dois. */
        if (ls.length >= 2) {
          var iTop = 0; ls.forEach(function (tl, i2) { if (tl.y > ls[iTop].y + 1e-9) iTop = i2; });
          if (iTop === 0 || iTop === ls.length - 1) {
            var jTop = Q.tel.indexOf(ls[iTop]), qS = iTop === 0 ? 0 : ls.length - 2;
            for (var c2 = 1; c2 <= p.correntes; c2++) {
              var nS = "cr" + k + ":" + aq.agua + ":" + qS + ":" + c2 + (iTop === 0 ? "'" : ""), alvo = [];
              if (2 * c2 <= p.correntes + 1) alvo.push("t" + k + ":" + jTop);
              if (2 * c2 >= p.correntes + 1) alvo.push("t" + (k + 1) + ":" + jTop + "'");
              alvo.forEach(function (nT) {
                if (!nos[nS] || !nos[nT]) return;
                /* a diagonal leva a força da linha / (nº de diagonais no nó · cos β) (a mesma regra do cálculo) — bitola: a menor barra
                   do catálogo com A ≥ A_linha/(n·cos β), para trabalhar como a linha (área pelo diâmetro do nome do perfil) */
                var PS = nos[nS], PT = nos[nT], dl = [ls[iTop].x - ls[qS === 0 && iTop === 0 ? 1 : ls.length - 2].x, ls[iTop].y - ls[qS === 0 && iTop === 0 ? 1 : ls.length - 2].y, 0], dd = [PT[0] - PS[0], PT[1] - PS[1], PT[2] - PS[2]];
                var nl = Math.sqrt(dl[0] * dl[0] + dl[1] * dl[1]) || 1, nd = Math.sqrt(dd[0] * dd[0] + dd[1] * dd[1] + dd[2] * dd[2]) || 1, cosB = Math.abs((dl[0] * dd[0] + dl[1] * dd[1]) / (nl * nd));
                var catA = barraAncoragem(p.barraCorrente, alvo.length, cosB);
                barra({ a: nS, b: nT, ferr: "diagonal", cat: catA, just: "centro", papel: "Corrente de terça", grupo: "corrente", aco: acoDe(p, catA), nome: "Corrente diagonal (ancoragem) — vão " + (k + 1), calc: {} });
                if (catA !== p.barraCorrente && catsAnc.indexOf(catA) < 0) catsAnc.push(catA);
                nAncC++;
              });
            }
          }
        }
      });
    });
    if (nCorr) dec.push("Correntes de terça: " + p.correntes + " linha(s) por vão de barra redonda " + p.barraCorrente + " (só tração), encadeadas do beiral à cumeeira em cada água e ANCORADAS por corrente diagonal até a terça da cumeeira no pórtico (" + nAncC + " diagonais) — travam as terças no eixo fraco" + (catsAnc.length ? " — diagonal de ancoragem " + catsAnc.join(", ") + " (A ≥ A da corrente/(n·cos β): leva a força da linha / cos β)" : "") + (p.correntesAuto ? "; " + p.correntes + " linha(s) pela regra do cálculo: o trecho do eixo fraco entre correntes ancoradas até " + String(LIMITE_LZ_CORRENTE).replace(".", ",") + " m (vão " + String(esp).replace(".", ",") + " m / " + (p.correntes + 1) + ")" : " (escolha do engenheiro)") + ".");
    /* escoras do banzo de baixo (treliças) */
    zs.forEach(function (z, k) { if (k + 1 >= nP) return; Q.esc.forEach(function (es, j) { barra({ a: k + ":" + es.pt, b: (k + 1) + ":" + es.pt, ferr: "viga", cat: p.escora, just: "centro", papel: es.coluna ? "Escora da coluna" : "Escora do banzo inferior", grupo: "escora", aco: acoDe(p, p.escora), nome: "Escora " + (j + 1) + " — vão " + (k + 1), calc: { papel: "terca", ini: "rotulada", fim: "rotulada", escora: true } }); }); });   /* escora: L/r ≤ 200 sempre (js/acodimlivre.js aplicarEsbeltez) */
    /* ponte rolante: vigas de rolamento biapoiadas em cada vão, nos consoles */
    var rolamento = { esq: [], dir: [] };
    if (Q.extra.consoles) zs.forEach(function (z, k) {
      if (k + 1 >= nP) return;
      ["esq", "dir"].forEach(function (ld) {
        var nvR = [{ tema: "Ponte rolante — fadiga", motivo: "a viga de rolamento, os consoles e as ligações deles NÃO foram verificados à FADIGA (NBR 8800, Anexo K) — obrigatória no projeto de ponte rolante" },
                   { tema: "Ponte rolante — viga de rolamento", motivo: "as flechas vertical e horizontal da viga de rolamento (NBR 8800, Tabela C.1) e a torção pela força transversal no topo do trilho NÃO foram verificadas pelo motor" },
                   { tema: "Ponte rolante — deslocamento dos pilares", motivo: "o deslocamento horizontal dos pilares foi conferido com o limite de galpão comum (H/300); o limite próprio de galpão com ponte rolante da NBR 8800 (Tabela C.1) não está no motor — não verificado" }];
        var o = barra({ a: k + ":" + Q.extra.consoles[ld], b: (k + 1) + ":" + Q.extra.consoles[ld], ferr: "viga", cat: p.vigaRolamento, just: "base", papel: "Viga de rolamento", grupo: "rolamento", aco: p.aco, nome: "Viga de rolamento " + (ld === "esq" ? "esquerda" : "direita") + " — vão " + (k + 1),
                        calc: { ini: "rotulada", fim: "rotulada", naoVerificado: nvR } });
        rolamento[ld].push(o.id);
      });
    });
    /* mezanino: vigas secundárias ao longo de z, da linha do pilar do pórtico à fila do mezanino */
    var secMez = [];
    if (Q.extra.mez) {
      var Lmz = Q.extra.mez.largura, hm = Q.extra.mez.cota, nS = Math.max(1, Math.ceil(Lmz / p.espSec - 1e-9));
      zs.forEach(function (z, k) {
        if (k + 1 >= nP) return;
        for (var s = 0; s <= nS; s++) {
          var x = Lmz * s / nS, a = no("ms" + k + ":" + s, x, hm, z), b = no("ms" + (k + 1) + ":" + s + "'", x, hm, zs[k + 1]);
          secMez.push(barra({ a: a, b: b, ferr: "viga", cat: p.secMez, just: "topo", papel: "Viga secundária do mezanino", grupo: "secMez", aco: p.aco, nome: "Secundária do mezanino " + (s + 1) + " — vão " + (k + 1), calc: { ini: "rotulada", fim: "rotulada" } }).id);
        }
      });
    }
    /* CONTRAVENTAMENTO nos vãos extremos: paredes (X entre os pilares de fora), cobertura (X entre as linhas de terça da
       água) e, nas treliças, X vertical entre as treliças nas linhas das escoras; mezanino: X na fila de pilares dele */
    var cvCat = p.contraventamento === "X-barra" ? p.barraCv : p.contraventamento === "X-cantoneira" ? p.cantoneiraCv : null;
    var vaosCV = nP > 2 ? [0, nP - 2] : [0], nCV = 0;
    /* o X de CANTONEIRA trabalha só à TRAÇÃO, como no galpão (js/acomodelo.js): a diagonal comprimida é desprezada — e a
       compressão da cantoneira simples (NBR 8800, 5.3.4.4) não entra */
    function X(a, b, papel) { barra({ a: a, b: b, ferr: "diagonal", cat: cvCat, just: "centro", papel: papel, grupo: "contravento", aco: acoDe(p, cvCat), nome: papel, calc: p.contraventamento === "X-cantoneira" ? { tracao: true } : {} }); nCV++; }
    if (cvCat) vaosCV.forEach(function (v) {
      if (Q.paredesPaineis) Q.paredesPaineis.forEach(function (lv) { for (var q = 0; q + 1 < lv.length; q++) { X(v + ":" + lv[q], (v + 1) + ":" + lv[q + 1], "Contravento da coluna"); X((v + 1) + ":" + lv[q], v + ":" + lv[q + 1], "Contravento da coluna"); } });
      else ["esq", "dir"].forEach(function (ld) { var pr = Q.parede[ld]; if (!pr) return; X(v + ":" + pr[0], (v + 1) + ":" + pr[1], "Contravento da parede"); X((v + 1) + ":" + pr[0], v + ":" + pr[1], "Contravento da parede"); });
      /* cobertura: por água, as linhas de terça na ordem da água, em painéis de ângulo perto de 45° */
      var porAgua = {}; Q.tel.forEach(function (tl) { (tl.aguas || [tl.agua]).forEach(function (ag) { (porAgua[ag] = porAgua[ag] || []).push(tl); }); });
      Object.keys(porAgua).forEach(function (ag) {
        var ls = porAgua[ag], aq = Q.aguas.filter(function (q) { return q.agua === ag; })[0]; if (!aq || ls.length < 2) return;
        ls.sort(function (a, b) { return Math.abs(a.x - aq.x0) - Math.abs(b.x - aq.x0); });
        var sPl = Math.abs(ls[1].x - ls[0].x) || 1, passo = Math.max(1, Math.round(esp / sPl));
        for (var q = 0; q < ls.length - 1; q += passo) {
          var q2 = Math.min(q + passo, ls.length - 1); if (q2 === q) break;
          X(v + ":" + ls[q].pt, (v + 1) + ":" + ls[q2].pt, "Contravento da cobertura"); X((v + 1) + ":" + ls[q].pt, v + ":" + ls[q2].pt, "Contravento da cobertura");
        }
      });
      Q.esc.forEach(function (es) { if (!es.topo) return; X(v + ":" + es.pt, (v + 1) + ":" + es.topo, "Contravento vertical entre treliças"); X((v + 1) + ":" + es.pt, v + ":" + es.topo, "Contravento vertical entre treliças"); });
      if (Q.extra.mez) { X(v + ":MB", (v + 1) + ":MT", "Contravento do mezanino"); X((v + 1) + ":MB", v + ":MT", "Contravento do mezanino"); }
    });
    else avisos.push("Sem contraventamento: a estabilidade longitudinal fica sem caminho — o cálculo da estrutura desenhada vai acusar o mecanismo.");
    /* COLUNAS DE TAPAMENTO nos oitões fechados */
    var nTap = 0;
    if (p.fechamento === "fechado" && Q.topoTap) {
      var nT = Math.max(0, Math.ceil(p.vao / p.espTapamento - 1e-9) - 1);
      [0, nP - 1].forEach(function (k) {
        for (var q = 1; q <= nT; q++) {
          var x = p.vao * q / (nT + 1), perto = tolLeitor(p.tapamento, p.pilar) + 0.1; if (Q.colX.some(function (c) { return Math.abs(c - x) < perto; })) continue;   /* a menos da meia seção dos dois: seria o mesmo nó */
          if (Q.extra.mez && Math.abs(x - Q.extra.mez.largura) < perto) continue;
          var tp = Q.topoTap(x), a = no("tap" + k + ":" + q, x, 0, zs[k]), b = no("tap" + k + ":" + q + "t", tp[0], tp[1], zs[k]);
          barra({ a: a, b: b, ferr: "pilar", cat: p.tapamento, just: "centro", giro: 90, papel: "Coluna de tapamento", grupo: "tapamento", aco: p.aco, nome: "Coluna de tapamento — oitão " + (k ? "fundo" : "frente"), calc: { base: "rotulada", fim: "rotulada" } });
          nTap++;
        }
      });
    }
    /* ÁREAS de cobertura por água (as terças recebem por faixas) */
    var A = Env() && Env().telhaInfo ? Env().telhaInfo(Env().telhaPadrao("trapezoidal")) : null, gT = A && A.peso != null ? A.peso : null;
    var areas = Q.aguas.map(function (aq) {
      var th = Math.atan2(Math.abs(aq.normal[0]), aq.normal[1]), co = Math.cos(th), Lz = (nP - 1) * esp;
      var x0 = p.x0 + Math.min(aq.x0, aq.x1), x1 = p.x0 + Math.max(aq.x0, aq.x1);
      var g = (gT != null ? gT / co : 0) + num(p.permanenteExtra, 0);
      return { id: "cob-" + aq.agua, nome: "Cobertura — " + (aq.agua === "unica" ? "água única" : "água " + aq.agua), poligono: [[r6(x0), r6(p.z0)], [r6(x1), r6(p.z0)], [r6(x1), r6(p.z0 + Lz)], [r6(x0), r6(p.z0 + Lz)]],
               vigas: (tercasPorAgua[aq.agua] || []).slice(), normal: [r6(aq.normal[0]), r6(aq.normal[1]), 0], g: r6(g), gCategoria: "G-industrializado",
               gTexto: (A ? A.nome + " (" + br(gT, 3) + " kN/m² na superfície ÷ cos θ = " + br(gT / co, 3) + " kN/m² em planta)" : "telha sem peso no catálogo") + " + instalações/forro " + br(p.permanenteExtra, 2) + " kN/m² (premissa, a mesma do galpão)",
               uso: "cobertura", inclinacaoPct: r6(Math.tan(th) * 100), cobertura: true, direcao: "auto", agua: aq.agua };
    });
    if (gT == null) avisos.push("A telha de partida não tem peso no catálogo: o peso da telha não entra nas áreas de cobertura.");
    if (secMez.length) {
      var Lmz2 = Q.extra.mez.largura, Lz2 = (nP - 1) * esp;
      areas.push({ id: "piso-mezanino", nome: "Piso do mezanino", poligono: [[r6(p.x0), r6(p.z0)], [r6(p.x0 + Lmz2), r6(p.z0)], [r6(p.x0 + Lmz2), r6(p.z0 + Lz2)], [r6(p.x0), r6(p.z0 + Lz2)]], cota: r6(p.cota + Q.extra.mez.cota),
                   vigas: secMez.slice(), g: num(p.gPiso, 0), gCategoria: "G-geral", gTexto: "piso do mezanino (revestimento/chapa) " + br(p.gPiso, 2) + " kN/m² — valor de partida, conferir com o piso escolhido", uso: p.uso, qInformado: p.qInformado === "" ? null : num(p.qInformado, null), direcao: "auto" });
    }
    /* CARGAS DA PONTE ROLANTE (as reações das rodas vêm do fabricante): as posições que dão a maior reação no pórtico do meio
       (as rodas de um lado simétricas em relação a ele) com a força transversal nos dois sentidos, e a que dá o maior momento
       numa viga de rolamento — casos EXCLUDENTES entre si (js/acocargas.js, `exclusivo`) */
    var pontuais = [], nvPonte = [];
    if (Q.extra.consoles) {
      var Rmax = num(p.rodaMax, 0), Rmin = num(p.rodaMin, 0), HT = num(p.rodaTransv, 0), HL = num(p.forcaLong, 0), e2 = p.entreEixos, kM = Math.floor((nP - 1) / 2), zM = zs[kM];
      if (!(Rmax > 0)) nvPonte.push({ tema: "Ponte rolante — cargas", motivo: "as cargas das rodas da ponte não foram informadas (fabricante): o pórtico foi calculado SEM a ponte rolante" });
      else {
        var onde = function (zr) { var b2 = Math.max(0, Math.min(nP - 2, Math.floor((zr + 1e-9) / esp))); return { vao: b2, s: r6(zr - zs[b2]) }; };
        var rodas = function (zc) { return [zc - e2 / 2, zc + e2 / 2].filter(function (zr) { return zr >= -1e-9 && zr <= zs[nP - 1] + 1e-9; }); };
        var casosP = [["PR1", "esq", 1, zM, "máx. no trilho esquerdo, transversal +x"], ["PR2", "esq", -1, zM, "máx. no trilho esquerdo, transversal −x"], ["PR3", "dir", 1, zM, "máx. no trilho direito, transversal +x"], ["PR4", "dir", -1, zM, "máx. no trilho direito, transversal −x"]];
        /* o maior momento numa viga biapoiada com duas cargas iguais a e2: a resultante e uma roda simétricas ao meio do vão */
        var vM = Math.max(0, kM - 1), zMom = zs[vM] + esp / 2 + e2 / 4; if (e2 >= esp * 0.586) zMom = zs[vM] + esp / 2;   /* com as rodas muito afastadas, uma roda só no meio governa */
        casosP.push(["PR5", "esq", 1, zMom, "maior momento na viga de rolamento esquerda do vão " + (vM + 1)]);
        casosP.forEach(function (cp) {
          var cd = { id: cp[0], nome: "Ponte rolante — " + cp[4], categoria: "Q-ponte", exclusivo: "ponte" };
          var zr = cp[0] === "PR5" ? (e2 >= esp * 0.586 ? [cp[3]] : [cp[3] - e2 / 2, cp[3] + e2 / 2]) : rodas(cp[3]);
          ["esq", "dir"].forEach(function (ld) {
            var R = ld === cp[1] ? Rmax : Rmin;
            zr.forEach(function (z1, q) {
              var w = onde(z1);
              pontuais.push({ barra: rolamento[ld][w.vao], s: w.s, F: [cp[2] * HT, -R, HL / Math.max(1, zr.length)], casoDef: cd, nome: cd.nome + " — roda " + (q + 1) + " " + (ld === "esq" ? "esquerda" : "direita") });
            });
          });
        });
        dec.push("Ponte rolante: reação por roda " + br(Rmax, 1) + " kN (máx., com impacto) / " + br(Rmin, 1) + " kN (mín.), transversal " + br(HT, 1) + " kN por roda, longitudinal " + br(HL, 1) + " kN por trilho — valores do FABRICANTE informados pelo engenheiro; " + casosP.length + " posições excludentes entre si (as rodas simétricas ao pórtico " + (kM + 1) + " para a maior reação no console, com a transversal nos dois sentidos, e a do maior momento numa viga); ψ0 = ψ1 = ψ2 = 1,0 (sem redução — a linha das pontes rolantes da Tabela 2 da NBR 8800 não está transcrita no motor)");
      }
      if (nvPonte.length) barras.forEach(function (b) { if (b.grupo === "rolamento") b.calc.naoVerificado = arr(b.calc.naoVerificado).concat(nvPonte); });
    }
    /* REVISÃO M4 alto a (15/10/2026, decisão do gerente): as LIGAÇÕES que a tipologia declara (joelho rígido, base engastada, nó
       soldado de tubo) e que o motor da estrutura desenhada NÃO dimensiona entram como NÃO VERIFICADO explícito (situação
       Incompleto) — o "não abrangido" genérico do memorial não bastava */
    var tubo = function (b) { var q = perfilCat(b.cat); return !!(q && /^tubo/.test(q.forma)); };
    var itL = [];
    if (barras.some(function (b) { return b.calc.ini === "rigida" || b.calc.fim === "rigida"; })) itL.push("ligações RÍGIDAS (joelho, cumeeira" + (Q.extra.consoles ? ", console" : "") + ")");
    if (barras.some(function (b) { return b.calc.base === "engastada"; })) itL.push("placas de base ENGASTADAS (momento na fundação)"); else itL.push("placas de base");
    if (barras.some(function (b) { return /^(diagonal|montante|banzoSup|banzoInf|travejamento|escora)$/.test(b.grupo) && tubo(b); })) itL.push("nós SOLDADOS de tubo das treliças/travejamento (NBR 16239 — não está no motor)");
    itL.push("ligações rotuladas (vigas, terças, escoras e contraventamento)");
    var nvLig = { tema: "Ligações da tipologia", motivo: "a tipologia DECLARA as condições de ligação que o cálculo usou — " + itL.join("; ") + " — e o cálculo da estrutura desenhada NÃO as dimensiona: dimensionar e detalhar cada ligação e placa de base com os esforços deste cálculo antes de emitir" };
    barras.forEach(function (b) { b.calc.naoVerificado = arr(b.calc.naoVerificado).concat([nvLig]); });
    var nv = []; barras.forEach(function (b) { arr(b.calc.naoVerificado).forEach(function (x) { if (!nv.some(function (q) { return q.tema === x.tema; })) nv.push(x); }); });
    var resumo = nomeT + ": " + br(p.vao, 2) + " × " + br(p.comprimento, 2) + " m, " + nP + " pórticos a cada " + br(esp, 2) + " m, pé-direito " + br(p.peDireito, 2) + " m — " +
      Object.keys(cont).map(function (k) { return cont[k] + " " + (ROT_GRUPO[k] || k); }).join(", ") + ".";
    return { ok: true, tipo: t, par: p, nos: nos, barras: barras, areas: areas, pontuais: pontuais, contagem: cont, avisos: avisos, decisoes: dec, naoVerificados: nv, resumo: resumo,
             quadro: { pts: Q.pts, mem: Q.mem.length, extra: Q.extra }, medidas: { tercasPorAgua: tercasPorAgua, rolamento: rolamento, nContraventos: nCV, nTapamentos: nTap } };
  }
  var ROT_GRUPO = { pilar: "pilares", viga: "vigas", misula: "degraus de mísula", terca: "terças", contravento: "contraventos", tapamento: "colunas de tapamento", banzoSup: "banzos superiores", banzoInf: "banzos inferiores",
                    montante: "montantes", diagonal: "diagonais", escora: "escoras", console: "consoles", rolamento: "vigas de rolamento", pilarMez: "pilares do mezanino", vigaMez: "vigas do mezanino", secMez: "secundárias do mezanino",
                    tirante: "tirantes", pendural: "pendurais", corrente: "correntes", pilarInterno: "pilares internos", banzoColuna: "banzos de coluna", travejamento: "barras de travejamento" };

  /* ================================================================ MOTOR DO GALPÃO (alma cheia) */
  function parGalpaoBIM(t, par) {
    var p = normalizar(t, par);
    return { vao: p.vao, comprimento: p.comprimento, espacamento: p.espacamento, peDireito: p.peDireito, inclinacao: p.inclinacao, aguas: p.aguas, base: p.cota, x0: p.x0, z0: p.z0, tipo: "alma-cheia",
             pilar: p.pilar, viga: p.viga, terca: p.terca, espTercas: p.espTercas, contraventos: p.contraventamento !== "nenhum", contravento: p.contraventamento === "X-cantoneira" ? p.cantoneiraCv : "L51X51X4.8",
             tapamento: p.tapamento, tapamentos: p.fechamento === "fechado" ? Math.max(0, Math.ceil(p.vao / p.espTapamento - 1e-9) - 1) : 0, tirantes: true, ligacoes: true };
  }
  function parGalpao(t, par) {
    var p = normalizar(t, par), f = p.fechamento === "fechado" ? "telha" : "aberto";
    var o = { geometria: { vao: p.vao, comprimento: p.comprimento, espacamento: p.espacamento, peDireito: p.peDireito, inclinacaoPct: p.inclinacao, aguas: p.aguas, base: p.base, tipoPortico: "alma-cheia", ladoAlto: p.aguas === 1 ? "direita" : undefined },
              perfis: { pilar: p.pilar, viga: p.viga, tapamento: p.tapamento },
              fechamentos: { frente: { tipo: f }, fundo: { tipo: f }, esquerda: { tipo: f }, direita: { tipo: f } },
              contraventamento: p.contraventamento === "nenhum" ? "nenhum" : (p.contraventamento === "X-cantoneira" ? "X-cantoneira" : "X-barra"),
              cargas: { permanenteExtra: p.permanenteExtra } };
    if (p.contraventamento === "X-barra") { var b = perfilCat(p.barraCv); if (b) o.contraventoDiametro = r2(b.d * 1000); }
    if (p.contraventamento === "X-cantoneira") o.perfis.contravento = p.cantoneiraCv;
    if (p.vento) o.vento = clone(p.vento);
    return o;
  }

  /* ================================================================ GERAR (o lote do editor) */
  function gerar(t, par, novoId, opG) {
    opG = opG || {};
    var e = validar(t, par); if (e) return { ok: false, motivo: e };
    if (typeof novoId !== "function") return { ok: false, motivo: "Sem gerador de id." };
    var p = normalizar(t, par);
    if (TIPOS[t].motor === "galpao") {
      var G = BG(); if (!G) return { ok: false, motivo: "O gerador do galpão (js/metalgalpao.js) não carregou." };
      var rg = G.gerar(parGalpaoBIM(t, p), novoId); if (!rg.ok) return rg;
      rg.motor = "galpao"; rg.tipo = t; rg.parPortico = p; rg.parGalpao = parGalpaoBIM(t, p);
      return rg;
    }
    var M = modelo(t, p); if (!M.ok) return M;
    var C = MC(); if (!C) return { ok: false, motivo: "O motor das peças (js/metalcriar.js) não carregou." };
    var gid = opG.porticoId ? String(opG.porticoId) : "portico-" + String(novoId()), ops = [], pecas = [], mapa = {}, erros = [];   /* atualizar no lugar: o mesmo id */
    M.barras.forEach(function (b) {
      var o = { ferr: b.ferr, just: b.just, giro: b.giro || 0, papel: b.papel, aco: b.aco, nome: b.nome };
      if (b.perfil) o.perfil = b.perfil; else o.cat = b.cat;
      var c = C.barra(M.nos[b.a], M.nos[b.b], o);
      if (!c || c.erro) { erros.push(b.nome + ": " + (c ? c.erro : "falhou")); return; }
      c.id = String(novoId()); c.metal.calc = clone(b.calc); c.portico = gid;
      if (!pecas.length) c.porticoInfo = { id: gid, tipo: t, par: clone(par || {}), em: new Date().toISOString(), v: 1 };
      mapa[b.id] = c.id; pecas.push(c); ops.push({ op: "criar", id: c.id, caixa: c });
    });
    if (erros.length) return { ok: false, motivo: "Peças que não deu para desenhar: " + erros.slice(0, 4).join("; ") + (erros.length > 4 ? "…" : "") };
    var areas = M.areas.map(function (a) { var q = clone(a); q.vigas = a.vigas.map(function (id) { return mapa[id]; }).filter(Boolean); return q; });
    var pontuais = M.pontuais.map(function (q) { var o = clone(q); o.peca = mapa[q.barra]; delete o.barra; return o; });
    return { ok: true, motor: "livre", tipo: t, par: p, op: { op: "lote", id: String(novoId()), origem: "metal-porticos", pedido: "Pórtico paramétrico: " + TIPOS[t].rotulo, ops: ops }, pecas: pecas, mapa: mapa, porticoId: gid,
             areas: areas, pontuais: pontuais, contagem: M.contagem, resumo: M.resumo, avisos: M.avisos, decisoes: M.decisoes, naoVerificados: M.naoVerificados, modelo: M };
  }

  /* ================================================================ A ENTRADA DA ESTRUTURA DESENHADA
   * g = gerar(); op = { caixas (o modelo inteiro; padrão: as peças geradas), vento: { v0 | lat, lon, categoria, grupoS3 },
   *                    situacao ("livre" | "interna"), otimizar }
   * O fechamento de cada face do envoltório sai do `fechamento` da tipologia (fechado = telha trapezoidal; aberto) e é
   * guardado pela chave da face E pela posição (a tela pode ter a grade de eixos com outros nomes). */
  function fechamentoFaces(caixas, ids, p) {
    var M = MLv(), E = Env(); if (!M || !E) return {};
    var lido = M.ler(caixas, { ids: ids }); if (!lido.pecas.length) return {};
    var G; try { G = M.montar(lido, { basePadrao: p.base }); } catch (er) { return {}; }
    var env = E.ler(G, {}), pc = {}, tipoF = p.fechamento === "fechado" ? "telha-trapezoidal" : "aberta";
    arr(env.faces).forEach(function (f) { pc[E.chaveFace(f)] = { tipo: tipoF }; pc[[f.a[0], f.a[1], f.b[0], f.b[1]].map(function (v) { return Math.round(v * 20) / 20; }).join(",")] = { tipo: tipoF }; });
    return pc;
  }
  /* o que a tela da estrutura desenhada recebe (MetalCalcLivreUI.preparar): base, áreas, cargas da ponte, envoltório, peças */
  function presetLivre(t, par, g, caixas) {
    var p = normalizar(t, par), ids = arr(g && g.pecas).map(function (c) { return String(c.id); });
    return { apoios: { basePadrao: p.base, bases: {} }, ligacoes: { vigaPilar: "rotulada", vigaViga: "rotulada", pontas: {} }, areas: clone(arr(g && g.areas)), pontuais: clone(arr(g && g.pontuais)),
             envoltorio: { situacao: "livre", porChave: fechamentoFaces(caixas || arr(g && g.pecas), ids, p), cobertura: { tipo: "sem" } }, portico: g && g.porticoId, ids: ids };
  }
  function entradaLivre(t, par, g, op) {
    op = op || {};
    var p = normalizar(t, par), caixas = op.caixas || arr(g && g.pecas), pr = presetLivre(t, p, g, caixas);
    var vento = op.vento || p.vento || null;
    return {
      caixas: caixas, ids: pr.ids, apoios: pr.apoios, ligacoes: pr.ligacoes,
      cargas: { areas: pr.areas, pontuais: pr.pontuais, escadas: [], acrescimoLigacoes: 0.05, vento: vento ? clone(vento) : null },
      envoltorio: { situacao: op.situacao === "interna" ? "interna" : "livre", porChave: pr.envoltorio.porChave, cobertura: { tipo: "sem" }, eixos: [] },
      otimizar: !!op.otimizar
    };
  }

  /* ================================================================ CALCULAR (teste e automação; a tela usa as telas de cálculo) */
  function calcular(t, par, op) {
    op = op || {};
    var e = validar(t, par); if (e) return { ok: false, motivo: e };
    var p = normalizar(t, par);
    if (TIPOS[t].motor === "galpao") {
      var D = Dim(); if (!D) return { ok: false, motivo: "O cálculo do galpão (js/acodimensionar.js) não carregou." };
      var pg = parGalpao(t, p); if (op.vento) pg.vento = clone(op.vento);
      /* o galpão sem vento calcula e AVISA — aqui, como na tela (que exige o local), sem vento não calcula */
      if (!pg.vento) return { ok: false, motor: "galpao", motivo: "Falta o local da obra (ou o V0): o vento da NBR 6123 depende dele." };
      var r = D.calcular(pg, op.calc || {});
      return { ok: !!(r && r.ok), motor: "galpao", tipo: t, r: r, par: pg, situacao: r && r.ok ? (r.aprovado ? "aprovado" : "reprovado") : "nao-calculou", naoVerificados: [] };
    }
    var k = 0, g = gerar(t, p, op.novoId || function () { return "pt" + (++k); }); if (!g.ok) return g;
    var ent = entradaLivre(t, p, g, op), DL = DLv(); if (!DL) return { ok: false, motivo: "O cálculo da estrutura desenhada (js/acodimlivre.js) não carregou." };
    var r2 = DL.calcular(ent, op.calc || {});
    /* REVISOR (16/10, médio): a BITOLA da corrente pela FORÇA calculada — se a corrente reprova pela reação do eixo fraco do vento
       local (r.correntesVentoLocal), a linha sobe para a menor BR do catálogo com A ≥ A·razão·1,05 (a diagonal de ancoragem segue
       pela regra A ≥ A_linha/(n·cos β)) e o modelo é gerado e calculado de novo (até 3 vezes) — declarado nas decisões */
    var trocasCor = [];
    for (var it = 0; it < 3 && r2 && r2.ok && p.correntes > 0 && par.barraCorrente == null; it++) {
      var cvl = r2.correntesVentoLocal || {}, rzMax = 0;
      Object.keys(cvl).forEach(function (bm) { if (isFinite(cvl[bm].razao) && cvl[bm].razao > rzMax) rzMax = cvl[bm].razao; });
      if (!(rzMax > 1)) break;
      var Areq = areaBR(p.barraCorrente) * rzMax * 1.05, nova = null;
      for (var ib = 0; ib < BITOLAS_BR.length && !nova; ib++) if (areaBR(BITOLAS_BR[ib]) >= Areq && areaBR(BITOLAS_BR[ib]) > areaBR(p.barraCorrente)) nova = BITOLAS_BR[ib];
      if (!nova) break;
      trocasCor.push(p.barraCorrente + " → " + nova + " (razão " + String(Math.round(rzMax * 1000) / 1000).replace(".", ",") + ")");
      p.barraCorrente = nova; k = 0;
      g = gerar(t, p, op.novoId || function () { return "pt" + (++k); }); if (!g.ok) return g;
      ent = entradaLivre(t, p, g, op); r2 = DL.calcular(ent, op.calc || {});
    }
    if (trocasCor.length && r2 && r2.ok) r2.decisoes = arr(r2.decisoes).concat([{ tema: "Correntes — bitola pela força do cálculo", decisao: "corrente de terça " + trocasCor.join("; "), motivo: "a reação do eixo fraco das terças (vento local do cpe médio, NBR 6123:2023 6.1.2) acumulada na linha passou da resistência da barra redonda (NBR 8800 5.2 e 6.3.3.1): a menor bitola do catálogo com área ≥ a necessária; a diagonal de ancoragem pela regra A ≥ A da linha/(n·cos β)" }]);
    var sit = r2 && r2.situacao ? r2.situacao.id : (r2 && r2.ok ? (r2.aprovado ? "aprovado" : "reprovado") : "nao-calculou");
    return { ok: !!(r2 && r2.ok), motor: "livre", tipo: t, r: r2, entrada: ent, gerado: g, situacao: sit, naoVerificados: arr(r2 && r2.naoVerificados) };
  }

  /* ================================================================ ESQUEMA (SVG do pórtico típico) */
  function esquema(t, par, op) {
    op = op || {};
    var p = normalizar(t, par); if (!p) return "";
    var e = validar(t, p), Q = e ? null : quadro(t, p);
    var w = num(op.w, 420), h = num(op.h, 220), m = 18;
    if (!Q) return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + " " + h + '" width="' + w + '" height="' + h + '"><text x="10" y="24" font-size="12" fill="currentColor">' + esc(e || "—") + "</text></svg>";
    var xs = [], ys = []; Object.keys(Q.pts).forEach(function (n) { xs.push(Q.pts[n][0]); ys.push(Q.pts[n][1]); });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    var s = Math.min((w - 2 * m) / Math.max(1e-6, x1 - x0), (h - 2 * m) / Math.max(1e-6, y1 - y0));
    function X(x) { return r2(m + (x - x0) * s); } function Y(y) { return r2(h - m - (y - y0) * s); }
    var cor = { pilar: "#1d4a74", viga: "#0d6ebd", misula: "#e9a23b", banzoSup: "#0d6ebd", banzoInf: "#0d6ebd", montante: "#55677a", diagonal: "#55677a", console: "#e9a23b", tirante: "#c81e25", pendural: "#c81e25",
               pilarMez: "#15803d", vigaMez: "#15803d", pilarInterno: "#1d4a74", banzoColuna: "#1d4a74", travejamento: "#55677a" };
    var lin = Q.mem.map(function (mb) { var a = Q.pts[mb.a], b = Q.pts[mb.b], g = mb.grupo; return '<line x1="' + X(a[0]) + '" y1="' + Y(a[1]) + '" x2="' + X(b[0]) + '" y2="' + Y(b[1]) + '" stroke="' + (cor[g] || "#55677a") + '" stroke-width="' + (/pilar|viga|banzo|misula/.test(g) ? 3 : 1.6) + '" stroke-linecap="round" data-grupo="' + g + '"/>'; });
    var ter = Q.tel.map(function (tl) { return '<circle cx="' + X(tl.x) + '" cy="' + Y(tl.y) + '" r="2" fill="#e9a23b"/>'; });
    var base = '<line x1="' + X(x0) + '" y1="' + Y(0) + '" x2="' + X(x1) + '" y2="' + Y(0) + '" stroke="#9db0c4" stroke-dasharray="4 3"/>';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + " " + h + '" width="' + w + '" height="' + h + '" data-tipologia="' + esc(t) + '" role="img" aria-label="' + esc(TIPOS[t].rotulo) + '">' + base + lin.join("") + ter.join("") + "</svg>";
  }

  var MetalPorticos = { TIPOS: TIPOS, ORDEM: ORDEM, COMUM: COMUM, PADROES: PADROES, padrao: padrao, normalizar: normalizar, validar: validar, motorDe: motorDe, modelo: modelo, gerar: gerar,
                        misulaMedidas: misulaMedidas, tolLeitor: tolLeitor, parGalpaoBIM: parGalpaoBIM, parGalpao: parGalpao, entradaLivre: entradaLivre, presetLivre: presetLivre, NAO_VERIFICA: NAO_VERIFICA, calcular: calcular, esquema: esquema, consoleCota: consoleCota };
  global.MetalPorticos = MetalPorticos;
  if (typeof module !== "undefined" && module.exports) module.exports = MetalPorticos;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
