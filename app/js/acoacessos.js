/* =====================================================================
 * acoacessos.js — ACESSOS INDUSTRIAIS EM AÇO: regras de norma, escolha do
 * tipo de acesso, verificador de conformidade, dimensionamento e memorial
 * (motor PURO, ES5, sem DOM, Node-testável). 14/10/2026.
 *
 * Pedido do Rogério (14/10/2026): "escadas dentro da norma de segurança
 * (industrial), da norma de acessibilidade e de todos os parâmetros da área
 * industrial, norma brasileira primeiro"; guarda-corpos da NBR, pisos de
 * escada e de plataforma; dimensionar, memorial e quantitativo. O
 * engenheiro escolhe o acesso; o sistema garante a norma e explica cada
 * número (norma + edição + item em toda regra).
 *
 * FONTES (o texto que foi lido, não de memória):
 *   · NR-12 — texto atualizado 2025 (gov.br; cópia na biblioteca RA:
 *     "NR-12 (texto atualizado 2025).pdf"), Anexo III itens 1 a 13.1 —
 *     LIDOS no texto; as faixas da Figura 1 (rampa 0–10°, rampa com peças
 *     transversais 10–20°, escada com espelho 20–45°, sem espelho 45–75°,
 *     marinheiro 75–90°) lidas na figura (p. 33) e no glossário do Anexo IV
 *     (p. 48-49 e 59). A faixa preferida 30°–38° é a faixa escura da figura,
 *     sem legenda → `conferir: true`.
 *   · Saída de emergência: NPT 011/2024 do CBPMPR (versão jan/2024, que
 *     referencia a IT-11/2019 do CBPMESP) — lida; a IT do estado da obra
 *     prevalece (aviso no verificador).
 *   · ABNT NBR 6120:2019 — texto oficial na biblioteca RA (Tabela 10:
 *     escadas e passarelas, nota t do degrau; Tabela 12 e 6.3: força
 *     horizontal em guarda-corpos a 1,1 m do piso).
 *   · ABNT NBR 9050 — itens e valores da lista de verificação federal (Anexo I
 *     da IN MPDG 2/2017, coluna "item da NBR 9050/15"): edição 2015; a
 *     conferência com a 2020 fica pendente → `conferir: true`.
 *   · ABNT NBR 14718:2019 — altura ≥ 1,10 m (CBIC) e vão ≤ 0,11 m (fonte
 *     secundária) → `conferir: true`. ISO 14122-2/3/4:2016 — previews do
 *     editor e white paper do BSI (cláusulas) e fabricantes → `conferir: true`
 *     onde a fonte é secundária (pendências no docs/metalica/ACESSOS.md).
 *   · NBR 8800:2008/2024 — pelo js/acodim8800.js (a mesma régua do galpão).
 *
 * ESCOPO DA NR-12 (Anexo III, 1.2): não se aplica aos meios de acesso dos
 * prédios e das estruturas industriais fixas, EXCETO quando a função
 * principal for dar acesso à máquina/equipamento. O memorial diz isso.
 *
 * API
 *   AcoAcessos.NORMAS                 edições e fontes
 *   AcoAcessos.REQ                    a tabela de requisitos (id, tipos, perfis,
 *                                     grandeza, min, max, un, norma, item, texto, conferir)
 *   AcoAcessos.PERFIS                 nr12 | nr12-ingreme | nbr9050 | emergencia
 *   AcoAcessos.requisitos(tipo, perfil)
 *   AcoAcessos.degraus(H, perfil, op) → { ok, n, e, p, blondel, angulo, regra, faixa, passos }
 *   AcoAcessos.escolher(e)            → { ok, tipo, perfil, angulo, motivo, ranking[], avisos[] }
 *   AcoAcessos.verificar(g)           → { ok, itens[], naoConformes[], recomendacoes[], conferir[], resumo }
 *   AcoAcessos.forcaGuarda(uso)       NBR 6120:2019 Tabela 12
 *   AcoAcessos.sobrecarga(uso)        NBR 6120:2019 Tabela 10
 *   AcoAcessos.dimensionar(spec)      → { ok, aprovado, razao, verificacoes[], naoVerificados[], avisos[] }
 *   AcoAcessos.pisoKgM2(tipo, par)    peso do piso (grade, xadrez, expandida, perfurada)
 *   AcoAcessos.cores(uso)             cor de segurança e sistema de pintura (AcoCatalogoInd ou próprio)
 *   AcoAcessos.memorial(d, op)        → { ok, html, titulo, secoes, avisos }
 * Teste: node tools/test-aco-acessos.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function D88() { return dep("AcoDim8800", "./acodim8800.js"); }
  function Mat() { return dep("AcoMateriais", "./acomateriais.js"); }
  function Cat() { return dep("PerfisAco", "./perfisaco.js"); }
  function CatInd() { return global.AcoCatalogoInd || null; }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : d; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function br(v, c) { if (!fin(v)) return "—"; c = c == null ? 2 : c; var s = (Math.round(v * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c); return s.replace("-", "−").replace(".", ","); }
  function cm(v) { return br(v * 100, 1) + " cm"; }
  function m2(v) { return br(v, 2) + " m"; }
  function r4(v) { return Math.round(v * 1e4) / 1e4; }
  var GRAU = Math.PI / 180;

  /* ============================================================== NORMAS */
  var NORMAS = {
    nr12: { sigla: "NR-12", titulo: "Segurança no trabalho em máquinas e equipamentos — Anexo III: meios de acesso", edicao: "texto atualizado 2025 (Portaria MTb 3.214/1978 e alterações; Anexo III com a Portaria MTP 428/2021)", fonte: "gov.br/trabalho-e-emprego (NR-12); biblioteca RA: NR-12 (texto atualizado 2025).pdf; transcrito em docs/metalica/pesquisa/NORMAS-INDUSTRIAL.md (seção 4)", lido: true },
    nbr6120: { sigla: "ABNT NBR 6120", titulo: "Ações para o cálculo de estruturas de edificações", edicao: "2019", fonte: "texto oficial na biblioteca RA (ABNT NBR 6120-2019.pdf); Tabelas 10 e 12 transcritas em docs/metalica/pesquisa/NORMAS-INDUSTRIAL.md", lido: true },
    nr35: { sigla: "NR-35", titulo: "Trabalho em altura — Anexo III: escadas (escada fixa vertical de uso individual)", edicao: "texto atualizado 2025 (Anexo III com as Portarias MTE 1.680/2025 e 1.259/2026)", fonte: "gov.br/trabalho-e-emprego (NR-35); biblioteca RA: NR-35 (texto atualizado 2025).txt — itens 4.1.2, 4.1.2.1, 5.2.1.1, 5.2.1.2", lido: true },
    nbr8800: { sigla: "ABNT NBR 8800", titulo: "Projeto de estruturas de aço e de estruturas mistas de aço e concreto de edificações", edicao: "2024 (expressões de 2008 onde a mudança não foi confirmada — js/acodim8800.js)", fonte: "js/acodim8800.js", lido: false },
    nbr9050: { sigla: "ABNT NBR 9050", titulo: "Acessibilidade a edificações, mobiliário, espaços e equipamentos urbanos", edicao: "2020 (Versão Corrigida:2021, com a Emenda 1 — catálogo ABNT, 14/10/2026; itens e valores conferidos na lista federal da IN MPDG 2/2017, que cita a 2015)", fonte: "https://bombinhas.sc.gov.br/uploads/sites/369/2023/06/2066489_Lista_de_Verificacao_de_Acessibilidade.pdf — conferir no texto da 2020", lido: false },
    nbr14718: { sigla: "ABNT NBR 14718", titulo: "Esquadrias — Guarda-corpos para edificação — Requisitos, procedimentos e métodos de ensaio", edicao: "2019 (3ª edição, cancela a 2008)", fonte: "https://cbic.org.br/publicada-revisao-da-norma-de-guarda-corpos-para-edificacao/ (altura) — sem texto na biblioteca RA", lido: false },
    nbr9077: { sigla: "ABNT NBR 9077", titulo: "Projeto de saídas de emergência", edicao: "2025 (Versão Corrigida:2026; a 9077:1993/2001 foi CANCELADA — catálogo ABNT, pesquisa P1 de 14/10/2026)", fonte: "sem texto na biblioteca RA — nenhum valor da 2025 foi conferido; os números do motor vêm da NPT 011/2024 (CBPMPR), que segue a IT-11/2019 (CBPMESP)", lido: false },
    npt011: { sigla: "NPT 011 (CBPMPR)", titulo: "Norma de Procedimento Técnico 011 — Saídas de emergência (Corpo de Bombeiros do Paraná; referência: IT-11/2019 do CBPMESP)", edicao: "2024 (versão jan/2024, vigência 06/03/2024)", fonte: "https://www.bombeiros.pr.gov.br/sites/bombeiros/arquivos_restritos/files/documento/2024-03/npt-011-saidas_de_emergencia_versao_jan_2024.pdf — a IT do estado da obra prevalece", lido: true },
    it11: { sigla: "IT-11 (CBPMESP)", titulo: "Instrução Técnica nº 11 — Saídas de emergência (Corpo de Bombeiros da PM do Estado de São Paulo; cada estado tem a sua)", edicao: "2019 (a citada pela NPT 011/2024; edição posterior não conferida)", fonte: "referência; pedir a IT do estado da obra", lido: false },
    iso14122: { sigla: "ABNT NBR ISO 14122-1 a -4", titulo: "Safety of machinery — Permanent means of access to machinery (o Anexo III da NR-12 cita as partes 2 e 3 de 2016 nas Figuras 2 e 4; referência complementar)", edicao: "2023 (adoção brasileira da ISO 14122:2016; os valores foram lidos nas fontes da ISO 2016)", fonte: "previews do editor (cdn.standards.iteh.ai) e BS EN ISO 14122 White Paper 2021 (BSI) — sem texto completo na biblioteca RA", lido: false },
    nbr7195: { sigla: "ABNT NBR 7195", titulo: "Cores para segurança", edicao: "2018", fonte: "referência (a NR-26 remete às normas técnicas oficiais)", lido: false }
  };
  function ref(id, item) { var n = NORMAS[id]; return (n ? n.sigla + (/^\d{4}/.test(n.edicao) ? ":" + n.edicao.slice(0, 4) : "") : id) + (item ? ", " + item : ""); }

  /* ============================================================ PERFIS DE NORMA
   * O perfil decide qual régua vale para escada/rampa/guarda-corpo. */
  var PERFIS = {
    "nr12": { id: "nr12", rotulo: "Industrial — NR-12 (escada de 20° a 45°, item 12)", tipoEscada: "escada", norma: "nr12" },
    "nr12-ingreme": { id: "nr12-ingreme", rotulo: "Industrial íngreme — NR-12 (escada de degraus de 45° a 75°, item 11)", tipoEscada: "escada-ingreme", norma: "nr12" },
    "nbr9050": { id: "nbr9050", rotulo: "Rota acessível — NBR 9050:2020", tipoEscada: "escada", norma: "nbr9050" },
    "emergencia": { id: "emergencia", rotulo: "Escada de emergência — IT do Corpo de Bombeiros (NPT 011/2024 do PR; IT-11/2019 de SP; NBR 9077:2025 não lida)", tipoEscada: "escada", norma: "npt011" }
  };

  /* ============================================================ REQUISITOS
   * grandeza → o valor lido da geometria (ver ler()); min/max em m (ou ° / %).
   * sev: "nc" (obrigatório: reprova) | "rec" (recomendado: aviso). */
  var REQ = [
    /* ---------- NR-12, Anexo III — meio de acesso pelo ângulo (Figura 1; itens 6 e 6.1) */
    { id: "nr12-rampa-max", tipos: ["rampa"], perfis: ["nr12"], grandeza: "angulo", max: 20, un: "°", norma: "nr12", item: "Anexo III, 6.1", texto: "rampa com inclinação de no máximo 20° (proibida acima)", sev: "nc" },
    { id: "nr12-rampa-travessas", tipos: ["rampa"], perfis: ["nr12"], grandeza: "rampaTravessas", min: 0.40, max: 0.50, un: "m", norma: "nr12", item: "Anexo III, 6 (Figura 2)", texto: "entre 10° e 20°, quando for preciso mais resistência ao escorregamento: peças transversais a cada 0,40 a 0,50 m, com 0,01 a 0,02 m de altura", sev: "rec", quando: function (g) { return g.angulo > 10; } },
    { id: "nr12-escada-faixa", tipos: ["escada"], perfis: ["nr12"], grandeza: "angulo", min: 20, max: 45, un: "°", norma: "nr12", item: "Anexo III, 2 (Figura 1, letra C)", texto: "escada (\"com espelho\") para ângulo de lance de 20° a 45°", sev: "nc", nota: "Figura 1 e glossário do Anexo IV (escada de degraus com espelho: 20° a 45°)" },
    { id: "nr12-ingreme-faixa", tipos: ["escada-ingreme"], perfis: ["nr12-ingreme", "nr12"], grandeza: "angulo", min: 45, max: 75, un: "°", norma: "nr12", item: "Anexo III, 2 (Figura 1, letra D)", texto: "escada de degraus \"sem espelho\" para ângulo de lance de 45° a 75°", sev: "nc", nota: "Figura 1 e glossário do Anexo IV" },
    { id: "nr12-marinheiro-faixa", tipos: ["marinheiro"], perfis: ["nr12"], grandeza: "angulo", min: 75, max: 90, un: "°", norma: "nr12", item: "Anexo III, 2 (Figura 1, letra E) e 1.3", texto: "escada fixa tipo marinheiro (75° a 90°) só na impossibilidade técnica de rampa, passarela, plataforma ou escada de degraus", sev: "nc" },
    { id: "nr12-escada-angulo-iso", tipos: ["escada"], perfis: ["nr12"], grandeza: "angulo", min: 30, max: 38, un: "°", norma: "nr12", item: "Anexo III, Figura 1 (faixa escura 30°–38°)", texto: "faixa preferida da escada: 30° a 38° (a faixa marcada na figura, sem legenda)", sev: "rec", conferir: true },
    { id: "nr12-rampa-faixa", tipos: ["rampa"], perfis: ["nr12"], grandeza: "angulo", max: 20, un: "°", norma: "nr12", item: "Anexo III, Figura 1 (A: 0°–10°; B: 10°–20° com peças transversais)", texto: "rampa até 10°; de 10° a 20°, rampa com peças transversais", sev: "nc" },
    /* ---------- NR-12, Anexo III, 12 — escada (com espelho) */
    { id: "nr12-12a-largura", tipos: ["escada"], perfis: ["nr12"], grandeza: "largura", min: 0.60, un: "m", norma: "nr12", item: "Anexo III, 12 a) e 12.1", texto: "largura útil mínima de 0,60 m (0,50 m em lance único com altura abaixo de 1,50 m)", sev: "nc", minFn: function (g) { return g.lances === 1 && g.desnivel < 1.5 ? 0.50 : 0.60; } },
    { id: "nr12-12b-piso", tipos: ["escada"], perfis: ["nr12"], grandeza: "p", min: 0.20, un: "m", norma: "nr12", item: "Anexo III, 12 b)", texto: "degrau com profundidade mínima de 0,20 m", sev: "nc" },
    { id: "nr12-12d-espelho", tipos: ["escada"], perfis: ["nr12"], grandeza: "e", min: 0.20, max: 0.25, un: "m", norma: "nr12", item: "Anexo III, 12 d)", texto: "altura entre os degraus de 0,20 m a 0,25 m", sev: "nc" },
    { id: "nr12-12e-patamar", tipos: ["escada"], perfis: ["nr12"], grandeza: "desnivelEntrePatamares", max: 3.00, un: "m", norma: "nr12", item: "Anexo III, 12 e)", texto: "plataforma de descanso a intervalos de, no máximo, 3,00 m de altura", sev: "nc" },
    { id: "nr12-11e-patamar-larg", tipos: ["escada-ingreme"], perfis: ["nr12-ingreme", "nr12"], grandeza: "patamarLargura", min: 0.60, un: "m", norma: "nr12", item: "Anexo III, 11 e)", texto: "plataforma de descanso com largura útil mínima de 0,60 m", sev: "nc", quando: function (g) { return g.lances > 1; } },
    { id: "nr12-12e-patamar-larg", tipos: ["escada"], perfis: ["nr12"], grandeza: "patamarLargura", min: 0.60, un: "m", norma: "nr12", item: "Anexo III, 12 e)", texto: "plataforma de descanso com largura útil mínima de 0,60 m", sev: "nc", quando: function (g) { return g.lances > 1; } },
    { id: "iso-blondel", tipos: ["escada"], perfis: ["nr12"], grandeza: "blondel", min: 0.60, max: 0.66, un: "m", norma: "iso14122", item: "parte 3, 5.1–5.4 (600 ≤ g + 2h ≤ 660 mm)", texto: "600 ≤ g + 2h ≤ 660 mm (a mesma fórmula do item 11 g da NR-12)", sev: "rec", conferir: true },
    { id: "iso-piso-g", tipos: ["escada"], perfis: ["nr12"], grandeza: "p", min: 0.21, max: 0.31, un: "m", norma: "iso14122", item: "parte 3, 5.1–5.4 (g = 210 a 310 mm)", texto: "profundidade livre do degrau g de 210 a 310 mm", sev: "rec", conferir: true },
    { id: "iso-largura-escada", tipos: ["escada"], perfis: ["nr12"], grandeza: "largura", min: 0.80, un: "m", norma: "iso14122", item: "parte 3, 5.8 (w = 800 mm; 600 mm em uso ocasional)", texto: "largura livre de 800 mm (600 mm em uso ocasional; 1000 mm com várias pessoas)", sev: "rec", conferir: true },
    { id: "iso-altura-livre-escada", tipos: ["escada", "escada-ingreme"], perfis: ["nr12", "nr12-ingreme"], grandeza: "alturaLivre", min: 2.30, un: "m", norma: "iso14122", item: "parte 3 (altura livre sobre a linha dos bocéis)", texto: "altura livre mínima de 2,30 m sobre os degraus", sev: "rec", conferir: true },
    /* ---------- NR-12, Anexo III, 11 — escada de degraus sem espelho (íngreme) */
    { id: "nr12-11a-largura", tipos: ["escada-ingreme"], perfis: ["nr12-ingreme", "nr12"], grandeza: "largura", min: 0.60, un: "m", norma: "nr12", item: "Anexo III, 11 a) e 11.1", texto: "largura útil mínima de 0,60 m (0,50 m em lance único abaixo de 1,50 m)", sev: "nc", minFn: function (g) { return g.lances === 1 && g.desnivel < 1.5 ? 0.50 : 0.60; } },
    { id: "nr12-11b-piso", tipos: ["escada-ingreme"], perfis: ["nr12-ingreme", "nr12"], grandeza: "p", min: 0.15, un: "m", norma: "nr12", item: "Anexo III, 11 b)", texto: "degrau com profundidade mínima de 0,15 m", sev: "nc" },
    { id: "nr12-11d-espelho", tipos: ["escada-ingreme"], perfis: ["nr12-ingreme", "nr12"], grandeza: "e", max: 0.25, un: "m", norma: "nr12", item: "Anexo III, 11 d)", texto: "altura máxima entre os degraus de 0,25 m", sev: "nc" },
    { id: "nr12-11e-patamar", tipos: ["escada-ingreme"], perfis: ["nr12-ingreme", "nr12"], grandeza: "desnivelEntrePatamares", max: 3.00, un: "m", norma: "nr12", item: "Anexo III, 11 e)", texto: "plataforma de descanso (largura útil ≥ 0,60 m) a intervalos de, no máximo, 3,00 m de altura", sev: "nc" },
    { id: "nr12-11g-blondel", tipos: ["escada-ingreme"], perfis: ["nr12-ingreme", "nr12"], grandeza: "blondel", min: 0.60, max: 0.66, un: "m", norma: "nr12", item: "Anexo III, 11 g)", texto: "600 ≤ g + 2h ≤ 660 (mm)", sev: "nc" },
    /* ---------- NR-12, Anexo III, 7 — sistema de proteção contra quedas (todo meio de acesso, exceto marinheiro e elevador — 7.2) */
    { id: "nr12-7c-altura", tipos: ["escada", "escada-ingreme", "plataforma", "passarela", "rampa", "guarda-corpo"], perfis: ["nr12", "nr12-ingreme"], grandeza: "guardaAltura", min: 1.10, max: 1.20, un: "m", norma: "nr12", item: "Anexo III, 7 c)", texto: "travessão superior de 1,10 m a 1,20 m do piso, em toda a extensão", sev: "nc", minFn: function (g) { return g.abastecimento ? 1.00 : 1.10; }, maxFn: function (g) { return g.abastecimento ? 1.10 : 1.20; }, nota: "plataforma de abastecimento ou que acumula sujidade: 1,00 a 1,10 m (item 9, Figura 3)" },
    { id: "nr12-7c-lados", tipos: ["escada", "escada-ingreme", "plataforma", "passarela", "rampa"], perfis: ["nr12", "nr12-ingreme"], grandeza: "guardaLadosLivres", max: 0, un: "lado(s) sem proteção", norma: "nr12", item: "Anexo III, 7 c)", texto: "proteção contra quedas em ambos os lados (todo lado livre)", sev: "nc" },
    { id: "nr12-7d-plano", tipos: ["escada", "escada-ingreme", "plataforma", "passarela", "rampa", "guarda-corpo"], perfis: ["nr12", "nr12-ingreme"], grandeza: "superiorPlano", max: 0, un: "", norma: "nr12", item: "Anexo III, 7 d)", texto: "o travessão superior não pode ter superfície plana (tubo ou perfil arredondado)", sev: "nc" },
    { id: "nr12-7e-rodape", tipos: ["escada", "escada-ingreme", "plataforma", "passarela", "rampa", "guarda-corpo"], perfis: ["nr12", "nr12-ingreme"], grandeza: "rodape", min: 0.20, un: "m", norma: "nr12", item: "Anexo III, 7 e)", texto: "rodapé de, no mínimo, 0,20 m", sev: "nc" },
    { id: "nr12-7e-intermediaria", tipos: ["escada", "escada-ingreme", "plataforma", "passarela", "rampa", "guarda-corpo"], perfis: ["nr12", "nr12-ingreme"], grandeza: "intermediaria", min: 0.68, max: 0.72, un: "m", norma: "nr12", item: "Anexo III, 7 e)", texto: "travessão intermediário a 0,70 m do piso, entre o rodapé e o travessão superior (tolerância de execução ± 2 cm adotada)", sev: "nc" },
    { id: "iso-montantes", tipos: ["escada", "escada-ingreme", "plataforma", "passarela", "rampa", "guarda-corpo"], perfis: ["nr12", "nr12-ingreme"], grandeza: "espacMontantes", max: 1.50, un: "m", norma: "iso14122", item: "parte 3, 7.1 (montantes)", texto: "distância entre montantes de no máximo 1,50 m", sev: "rec", conferir: true },
    { id: "iso-vao-trav", tipos: ["escada", "escada-ingreme", "plataforma", "passarela", "rampa", "guarda-corpo"], perfis: ["nr12", "nr12-ingreme"], grandeza: "vaoTravessas", max: 0.50, un: "m", norma: "iso14122", item: "parte 3, 7.1 (vão livre)", texto: "vão livre entre travessas (e entre a intermediária e o rodapé) de no máximo 0,50 m", sev: "rec", conferir: true },
    /* ---------- NR-12, Anexo III, 10 — passarela, plataforma e rampa */
    { id: "nr12-10a-largura", tipos: ["plataforma", "passarela", "rampa"], perfis: ["nr12", "nr12-ingreme"], grandeza: "largura", min: 0.60, un: "m", norma: "nr12", item: "Anexo III, 10 a) e 10.1", texto: "largura útil mínima de 0,60 m (0,50 m se o comprimento for menor que 2,00 m ou o espaço for restrito por canalizações/cabos)", sev: "nc", minFn: function (g) { return (g.comprimento > 0 && g.comprimento < 2) || g.espacoRestrito ? 0.50 : 0.60; } },
    { id: "iso-altura-livre-plat", tipos: ["plataforma", "passarela"], perfis: ["nr12", "nr12-ingreme"], grandeza: "alturaLivre", min: 2.10, un: "m", norma: "iso14122", item: "parte 2, 4.2.2 (altura livre ≥ 2100 mm)", texto: "altura livre mínima de 2,10 m sobre a plataforma/passarela", sev: "rec" },
    { id: "iso-largura-plat", tipos: ["plataforma", "passarela"], perfis: ["nr12", "nr12-ingreme"], grandeza: "largura", min: 0.80, un: "m", norma: "iso14122", item: "parte 2, 4.2.2 (w = 800 mm; 600 mm em uso ocasional)", texto: "largura livre de 800 mm (600 mm em uso ocasional: menos de 30 dias/ano e 2 h/dia)", sev: "rec" },
    /* ---------- NR-12, Anexo III, 13 e 13.1 — escada fixa tipo marinheiro */
    { id: "nr12-13-impossibilidade", tipos: ["marinheiro"], perfis: ["nr12"], grandeza: "justificativa", max: 0, un: "", norma: "nr12", item: "Anexo III, 1.1 e 1.3", texto: "marinheiro só na impossibilidade técnica de elevador, rampa, passarela, plataforma ou escada de degraus — registre o motivo no projeto", sev: "nc" },
    { id: "nr35-412-hierarquia", tipos: ["marinheiro"], perfis: ["nr12"], grandeza: "justificativa", max: 0, un: "", norma: "nr35", item: "Anexo III, 4.1.2 e 4.1.2.1", texto: "escada fixa vertical só com COMPROVADA inviabilidade técnica dos outros meios (hierarquia: piso/solo → rampa ou escada coletiva → escada de inclinação elevada → escada fixa vertical)", sev: "nc" },
    { id: "nr35-5211f-spq", tipos: ["marinheiro"], perfis: ["nr12"], grandeza: "spq", max: 0, un: "", norma: "nr35", item: "Anexo III, 5.2.1.1 f) e 5.2.1.1.1", texto: "sistema de proteção contra quedas (SPQ) conforme o item 35.6, com a análise de risco específica (prazo da Portaria MTE 1.259/2026) — a gaiola sozinha não dispensa a análise", sev: "nc" },
    { id: "nr35-5211g-projeto", tipos: ["marinheiro"], perfis: ["nr12"], grandeza: "projetoHabilitado", max: 0, un: "", norma: "nr35", item: "Anexo III, 5.2.1.1 g)", texto: "projeto por profissional legalmente habilitado (dimensões, resistências, segurança nos acessos e o SPQ selecionado)", sev: "nc" },
    { id: "nr35-52122-descanso", tipos: ["marinheiro"], perfis: ["nr12"], grandeza: "descansoNaoLateral", max: 0, un: "", norma: "nr35", item: "Anexo III, 5.2.1.2 a 5.2.1.2.2", texto: "acima de 10 m, plataformas de descanso a no máximo 6 m, projetadas lateralmente ou basculantes", sev: "nc", quando: function (g) { return g.lances > 1; } },
    { id: "iso-abertura-cancela", tipos: ["plataforma", "passarela"], perfis: ["nr12", "nr12-ingreme"], grandeza: "aberturaSemCancela", max: 0, un: "", norma: "iso14122", item: "parte 3, 7.1 (abertura de acesso no guarda-corpo)", texto: "abertura de acesso no guarda-corpo protegida (cancela de autofechamento ou o guarda-corpo da escada que chega)", sev: "rec", conferir: true },
    { id: "nr12-12b-borda", tipos: ["escada"], perfis: ["nr12"], grandeza: "pInterno", min: 0.20, un: "m", norma: "nr12", item: "Anexo III, 12 b) (escada curva: conferido também junto da borda de dentro — premissa conservadora)", texto: "profundidade mínima de 0,20 m também junto da borda de dentro da escada curva", sev: "nc", quando: function (g) { return fin(g.pInterno); } },
    { id: "nr12-13c-gaiola", tipos: ["marinheiro"], perfis: ["nr12"], grandeza: "gaiolaFalta", max: 0, un: "", norma: "nr12", item: "Anexo III, 13 c)", texto: "gaiola de proteção obrigatória acima de 3,50 m de altura", sev: "nc" },
    { id: "nr12-13c-inicio", tipos: ["marinheiro"], perfis: ["nr12"], grandeza: "gaiolaInicio", max: 2.00, un: "m", norma: "nr12", item: "Anexo III, 13 c)", texto: "gaiola instalada a partir de 2,0 m do piso", sev: "nc", quando: function (g) { return !!(g.marinheiro && g.marinheiro.gaiola); } },
    { id: "nr12-13c-ultrapassa", tipos: ["marinheiro"], perfis: ["nr12"], grandeza: "gaiolaUltrapassa", min: 1.10, max: 1.20, un: "m", norma: "nr12", item: "Anexo III, 13 c)", texto: "a gaiola ultrapassa a plataforma de descanso ou o piso superior em 1,10 m a 1,20 m", sev: "nc", quando: function (g) { return !!(g.marinheiro && g.marinheiro.gaiola); } },
    { id: "nr12-13d-montantes", tipos: ["marinheiro"], perfis: ["nr12"], grandeza: "montantesUltrapassa", min: 1.10, max: 1.20, un: "m", norma: "nr12", item: "Anexo III, 13 d)", texto: "corrimão ou continuação dos montantes ultrapassando o piso superior em 1,10 m a 1,20 m", sev: "nc" },
    { id: "nr12-13e-largura", tipos: ["marinheiro"], perfis: ["nr12"], grandeza: "largura", min: 0.40, max: 0.60, un: "m", norma: "nr12", item: "Anexo III, 13 e)", texto: "largura de 0,40 m a 0,60 m", sev: "nc" },
    { id: "nr12-13f-lance", tipos: ["marinheiro"], perfis: ["nr12"], grandeza: "lanceUnico", max: 10.0, un: "m", norma: "nr12", item: "Anexo III, 13 f)", texto: "altura total máxima de 10,00 m em lance único", sev: "nc", quando: function (g) { return g.lances === 1; } },
    { id: "nr12-13g-lances", tipos: ["marinheiro"], perfis: ["nr12"], grandeza: "desnivelEntrePatamares", max: 6.0, un: "m", norma: "nr12", item: "Anexo III, 13 g)", texto: "em múltiplos lances, altura máxima de 6,00 m entre duas plataformas de descanso", sev: "nc", quando: function (g) { return g.lances > 1; } },
    { id: "nr12-13g-desloc", tipos: ["marinheiro"], perfis: ["nr12"], grandeza: "deslocLances", min: 0.70, un: "m", norma: "nr12", item: "Anexo III, 13 g)", texto: "lances consecutivos com eixos paralelos, distanciados no mínimo em 0,70 m", sev: "nc", quando: function (g) { return g.lances > 1; } },
    { id: "nr12-13h-espac", tipos: ["marinheiro"], perfis: ["nr12"], grandeza: "espacDegraus", min: 0.25, max: 0.30, un: "m", norma: "nr12", item: "Anexo III, 13 h)", texto: "espaçamento entre barras horizontais de 0,25 m a 0,30 m", sev: "nc" },
    { id: "nr12-13i-primeiro", tipos: ["marinheiro"], perfis: ["nr12"], grandeza: "primeiroDegrau", max: 0.55, un: "m", norma: "nr12", item: "Anexo III, 13 i)", texto: "do piso à primeira barra: no máximo 0,55 m", sev: "nc" },
    { id: "nr12-13j-afast", tipos: ["marinheiro"], perfis: ["nr12"], grandeza: "afastamento", min: 0.15, un: "m", norma: "nr12", item: "Anexo III, 13 j)", texto: "distância da estrutura em que é fixada de, no mínimo, 0,15 m", sev: "nc" },
    { id: "nr12-13k-diam", tipos: ["marinheiro"], perfis: ["nr12"], grandeza: "diamDegrau", min: 0.025, max: 0.038, un: "m", norma: "nr12", item: "Anexo III, 13 k)", texto: "barras horizontais de 25 mm a 38 mm de diâmetro ou espessura", sev: "nc" },
    { id: "nr12-13l-ranhura", tipos: ["marinheiro"], perfis: ["nr12"], grandeza: "degrauLiso", max: 0, un: "", norma: "nr12", item: "Anexo III, 13 l)", texto: "barras com superfície, forma ou ranhura contra deslizamento (especificar o degrau serrilhado/recartilhado)", sev: "nc" },
    { id: "nr12-131-diam", tipos: ["marinheiro"], perfis: ["nr12"], grandeza: "gaiolaDiametro", min: 0.65, max: 0.80, un: "m", norma: "nr12", item: "Anexo III, 13.1", texto: "gaiola com diâmetro de 0,65 m a 0,80 m", sev: "nc", quando: function (g) { return !!(g.marinheiro && g.marinheiro.gaiola); } },
    { id: "nr12-131a-vert", tipos: ["marinheiro"], perfis: ["nr12"], grandeza: "gaiolaEspacVert", max: 0.30, un: "m", norma: "nr12", item: "Anexo III, 13.1 a)", texto: "barras verticais da gaiola a no máximo 0,30 m entre si", sev: "nc", quando: function (g) { return !!(g.marinheiro && g.marinheiro.gaiola) && g.marinheiro.gaiolaArranjo !== "arcos"; } },
    { id: "nr12-131a-arcos", tipos: ["marinheiro"], perfis: ["nr12"], grandeza: "gaiolaEspacArcos", max: 1.50, un: "m", norma: "nr12", item: "Anexo III, 13.1 a)", texto: "arcos da gaiola a no máximo 1,50 m (com as verticais a 0,30 m); ou arcos a no máximo 0,30 m com barra vertical de sustentação (13.1 b)", sev: "nc", quando: function (g) { return !!(g.marinheiro && g.marinheiro.gaiola); }, maxFn: function (g) { return g.marinheiro && g.marinheiro.gaiolaArranjo === "arcos" ? 0.30 : 1.50; } },
    { id: "iso-cancela", tipos: ["marinheiro"], perfis: ["nr12"], grandeza: "semCancela", max: 0, un: "", norma: "iso14122", item: "parte 4 (saída no topo: portinhola de autofechamento)", texto: "acesso pela abertura do guarda-corpo do piso superior protegido por cancela de autofechamento", sev: "rec", conferir: true },
    { id: "iso-gaiola-3m", tipos: ["marinheiro"], perfis: ["nr12"], grandeza: "gaiolaFalta3", max: 0, un: "", norma: "iso14122", item: "parte 4, 4.2 (proteção contra queda a partir de 3,00 m)", texto: "dispositivo de proteção contra queda (gaiola ou trava-quedas guiado) quando a altura de queda passa de 3,00 m", sev: "rec" },
    { id: "iso-degrau-redondo", tipos: ["marinheiro"], perfis: ["nr12"], grandeza: "degrauRedondo", max: 0, un: "", norma: "iso14122", item: "parte 4, 5.2.2.4 (degrau de seção redonda não admitido)", texto: "degrau de seção redonda não é admitido pela ABNT NBR ISO 14122-4:2023 (= ISO 14122-4:2016) (a NR-12 13 k aceita barra de 25–38 mm) — preferir barra quadrada/serrilhada", sev: "rec", conferir: true },
    /* ---------- NBR 9050:2020 — rota acessível */
    { id: "nbr9050-espelho", tipos: ["escada"], perfis: ["nbr9050"], grandeza: "e", min: 0.16, max: 0.18, un: "m", norma: "nbr9050", item: "6.8.2", texto: "espelho de 0,16 m a 0,18 m", sev: "nc", conferir: true },
    { id: "nbr9050-piso", tipos: ["escada"], perfis: ["nbr9050"], grandeza: "p", min: 0.28, max: 0.32, un: "m", norma: "nbr9050", item: "6.8.2", texto: "piso de 0,28 m a 0,32 m", sev: "nc", conferir: true },
    { id: "nbr9050-blondel", tipos: ["escada"], perfis: ["nbr9050"], grandeza: "blondel", min: 0.63, max: 0.65, un: "m", norma: "nbr9050", item: "6.8.2", texto: "0,63 m ≤ p + 2e ≤ 0,65 m", sev: "nc", conferir: true },
    { id: "nbr9050-largura", tipos: ["escada", "rampa"], perfis: ["nbr9050"], grandeza: "largura", min: 1.20, un: "m", norma: "nbr9050", item: "6.8.3 e 6.6.2.5", texto: "largura mínima de 1,20 m em rota acessível (rampa: 1,50 m recomendável)", sev: "nc", conferir: true },
    { id: "nbr9050-corrimao-interm", tipos: ["escada", "rampa"], perfis: ["nbr9050"], grandeza: "corrimaoIntermFalta", max: 0, un: "", norma: "nbr9050", item: "6.9.4", texto: "largura acima de 2,40 m: corrimão intermediário (com 0,80 m livre no mínimo de cada lado — 6.9.4.1)", sev: "nc", conferir: true },
    { id: "nbr9050-patamar", tipos: ["escada"], perfis: ["nbr9050"], grandeza: "desnivelEntrePatamares", max: 3.20, un: "m", norma: "nbr9050", item: "6.8.7", texto: "patamar a cada 3,20 m de desnível no máximo e sempre que houver mudança de direção", sev: "nc", conferir: true },
    { id: "nbr9050-patamar-comp", tipos: ["escada", "rampa"], perfis: ["nbr9050"], grandeza: "patamarComprimento", min: 1.20, un: "m", norma: "nbr9050", item: "6.8.8 e 6.6.4", texto: "patamar com comprimento mínimo de 1,20 m (e a largura do lance)", sev: "nc", conferir: true, quando: function (g) { return g.lances > 1; } },
    { id: "nbr9050-corrimao", tipos: ["escada", "rampa"], perfis: ["nbr9050"], grandeza: "corrimaoDuplo", max: 0, un: "", norma: "nbr9050", item: "6.9.2", texto: "corrimão dos dois lados, em duas alturas: 0,92 m e 0,70 m do piso (medidas da quina do degrau)", sev: "nc", conferir: true },
    { id: "nbr9050-corrimao-parede", tipos: ["corrimao"], perfis: ["nbr9050"], grandeza: "corrimaoAlturas", max: 0, un: "", norma: "nbr9050", item: "6.9.2", texto: "corrimão em duas alturas: 0,92 m e 0,70 m", sev: "nc", conferir: true },
    { id: "npt011-folga", tipos: ["corrimao"], perfis: ["nbr9050", "emergencia"], grandeza: "folgaParede", min: 0.04, un: "m", norma: "npt011", item: "5.8.2.4", texto: "afastamento do corrimão à parede de no mínimo 40 mm (a NBR 9050 pede o mesmo — conferir)", sev: "nc" },
    { id: "npt011-corrimao-alt", tipos: ["corrimao"], perfis: ["emergencia"], grandeza: "corrimaoAltMax", min: 0.80, max: 0.92, un: "m", norma: "npt011", item: "5.8.2.1", texto: "corrimão a 0,80 m – 0,92 m do piso", sev: "nc" },
    { id: "nbr9050-prolong", tipos: ["escada", "rampa", "corrimao"], perfis: ["nbr9050"], grandeza: "prolongamento", min: 0.30, un: "m", norma: "nbr9050", item: "6.9.2.2", texto: "corrimão prolongado no mínimo 0,30 m antes do início e depois do término", sev: "nc", conferir: true },
    { id: "nbr9050-diam", tipos: ["escada", "rampa", "corrimao"], perfis: ["nbr9050"], grandeza: "corrimaoDiam", min: 0.030, max: 0.045, un: "m", norma: "nbr9050", item: "6.9.2.1", texto: "corrimão de seção circular com diâmetro de 30 mm a 45 mm", sev: "nc", conferir: true },
    { id: "nbr9050-rampa-i", tipos: ["rampa"], perfis: ["nbr9050"], grandeza: "inclinacaoPct", max: 8.33, un: "%", norma: "nbr9050", item: "6.6.2.1 (Tabela 4)", texto: "inclinação máxima de 8,33 % (1:12), com desnível máximo de 0,80 m por segmento entre 6,25 % e 8,33 %", sev: "nc", conferir: true },
    { id: "nbr9050-rampa-seg", tipos: ["rampa"], perfis: ["nbr9050"], grandeza: "desnivelSegmento", max: 1.50, un: "m", norma: "nbr9050", item: "6.6.2.1 (Tabela 4)", texto: "desnível máximo por segmento: 1,50 m (i ≤ 5 %), 1,00 m (5 % < i ≤ 6,25 %), 0,80 m (6,25 % < i ≤ 8,33 %)", sev: "nc", conferir: true, maxFn: function (g) { var i = num(ler(g, "inclinacaoPct"), 0); return i <= 5 ? 1.5 : (i <= 6.25 ? 1.0 : 0.8); } },
    { id: "nbr14718-altura", tipos: ["escada", "rampa", "plataforma", "passarela", "guarda-corpo"], perfis: ["nbr9050"], grandeza: "guardaAltura", min: 1.10, un: "m", norma: "nbr14718", item: "altura de proteção (item a conferir)", texto: "guarda-corpo com altura mínima de 1,10 m do piso acabado onde houver lado livre (a edição 2008 pedia 1,00 m)", sev: "nc", conferir: true },
    { id: "nbr14718-vao", tipos: ["escada", "rampa", "plataforma", "passarela", "guarda-corpo"], perfis: ["nbr9050"], grandeza: "vaoTravessas", max: 0.11, un: "m", norma: "nbr14718", item: "vão-luz entre perfis (item a conferir)", texto: "vão-luz de no máximo 0,11 m entre os elementos do guarda-corpo (uso com público/crianças) — com travessas horizontais escaláveis, fechar até 0,45 m", sev: "rec", conferir: true },
    /* ---------- IT do Corpo de Bombeiros (NPT 011/2024 lida; NBR 9077:2025 em vigor, não lida) — escada de emergência (referência: pedir a IT do estado) */
    { id: "npt011-espelho", tipos: ["escada"], perfis: ["emergencia"], grandeza: "e", min: 0.16, max: 0.18, un: "m", norma: "npt011", item: "5.7.3.1", texto: "altura do degrau de 0,16 m a 0,18 m (tolerância de 0,5 cm)", sev: "nc" },
    { id: "npt011-blondel", tipos: ["escada"], perfis: ["emergencia"], grandeza: "blondel", min: 0.63, max: 0.64, un: "m", norma: "npt011", item: "5.7.3.1 (Blondel)", texto: "0,63 m ≤ 2h + b ≤ 0,64 m", sev: "nc" },
    { id: "npt011-largura", tipos: ["escada"], perfis: ["emergencia"], grandeza: "largura", min: 1.20, un: "m", norma: "npt011", item: "5.4.2.1 (largura mínima 1,20 m; N = P/C, unidade de passagem 0,55 m — 5.4.1.2)", texto: "largura mínima de 1,20 m nas ocupações em geral (1,65 m em H-2 e H-3); a largura pela população é N = P/C × 0,55 m (informe a população)", sev: "nc", minFn: function (g) { return Math.max(1.20, num(g.larguraPopulacao, 0)); } },
    { id: "npt011-patamar", tipos: ["escada"], perfis: ["emergencia"], grandeza: "desnivelEntrePatamares", max: 3.70, un: "m", norma: "npt011", item: "5.7.3.2", texto: "lance com no máximo 3,70 m de altura entre patamares (e no mínimo 3 degraus)", sev: "nc" },
    { id: "npt011-guarda", tipos: ["escada"], perfis: ["emergencia"], grandeza: "guardaAltura", min: 1.05, un: "m", norma: "npt011", item: "5.8.1.2 e 5.8.1.3", texto: "guarda-corpo com no mínimo 1,05 m (1,30 m em escada aberta externa a mais de 12 m do solo)", sev: "nc", minFn: function (g) { return g.externaAlta ? 1.30 : 1.05; } },
    { id: "npt011-esfera", tipos: ["escada"], perfis: ["emergencia"], grandeza: "vaoTravessas", max: 0.15, un: "m", norma: "npt011", item: "5.8.1.4 a)", texto: "guarda-corpo vazado: uma esfera de 0,15 m não passa por nenhuma abertura", sev: "nc" },
    { id: "npt011-corrimao", tipos: ["escada"], perfis: ["emergencia"], grandeza: "corrimaoLados", min: 2, un: "lado(s)", norma: "npt011", item: "5.8.2.1", texto: "corrimão dos dois lados, a 0,80 m – 0,92 m do piso", sev: "nc" },
    { id: "npt011-diam", tipos: ["escada", "corrimao"], perfis: ["emergencia"], grandeza: "corrimaoDiam", min: 0.038, max: 0.065, un: "m", norma: "npt011", item: "5.8.2.3", texto: "corrimão circular de 38 mm a 65 mm de diâmetro", sev: "nc" }
  ];

  function requisitos(tipo, perfil) {
    return REQ.filter(function (q) { return q.tipos.indexOf(tipo) >= 0 && (!perfil || q.perfis.indexOf(perfil) >= 0); });
  }

  /* ============================================================ GEOMETRIA → VALOR
   * g (geometria do acesso, metros):
   *  { tipo: "escada"|"escada-ingreme"|"rampa"|"plataforma"|"passarela"|"marinheiro"|"guarda-corpo",
   *    perfil, desnivel, largura, comprimento, e, p, n, lances, desnivelEntrePatamares,
   *    patamar: {comprimento, largura}, alturaLivre, abastecimento, espacoRestrito,
   *    guarda: { ladosLivres, ladosProtegidos, altura, intermediaria, alturas: [..], rodape, espacMontantes, superiorPlano },
   *    corrimao: { alturas: [..], lados, diametro, prolongamento },
   *    rampa: { inclinacaoPct, travessas }, marinheiro: { ... } } */
  function ler(g, grandeza) {
    var gd = g.guarda || {}, co = g.corrimao || {}, mr = g.marinheiro || {};
    switch (grandeza) {
      case "angulo": if (fin(g.angulo)) return g.angulo; if (g.e > 0 && g.p > 0) return Math.atan(g.e / g.p) / GRAU; if (fin(g.inclinacaoPct)) return Math.atan(g.inclinacaoPct / 100) / GRAU; return null;
      case "blondel": return g.e > 0 && g.p > 0 ? r4(g.p + 2 * g.e) : null;
      case "guardaAltura": return fin(gd.altura) ? gd.altura : null;
      case "guardaLadosLivres": return fin(gd.ladosLivres) ? Math.max(0, gd.ladosLivres - num(gd.ladosProtegidos, 0)) : null;
      case "superiorPlano": return gd.superiorPlano == null ? null : (gd.superiorPlano ? 1 : 0);
      case "rodape": return gd.rodape == null ? null : num(gd.rodape, 0);
      case "intermediaria": if (!gd.alturas) return null; var hs = arr(gd.alturas).filter(function (h) { return h < num(gd.altura, 1.1) - 0.05; }); if (!hs.length) return 0; return hs.reduce(function (a, b) { return Math.abs(b - 0.70) < Math.abs(a - 0.70) ? b : a; });
      case "espacMontantes": return fin(gd.espacMontantes) ? gd.espacMontantes : null;
      case "vaoTravessas": if (!gd.alturas) return null; var hh = [num(gd.rodape, 0)].concat(arr(gd.alturas)).concat([num(gd.altura, 1.1)]).sort(function (a, b) { return a - b; }), mx = 0; for (var i = 1; i < hh.length; i++) mx = Math.max(mx, hh[i] - hh[i - 1]); return r4(mx);
      case "corrimaoDuplo": if (!co.alturas) return 1; var tem = function (h) { return arr(co.alturas).some(function (x) { return Math.abs(x - h) <= 0.011; }); }; return tem(0.92) && tem(0.70) && num(co.lados, 0) >= 2 ? 0 : 1;
      case "corrimaoLados": return fin(co.lados) ? co.lados : null;
      case "prolongamento": return fin(co.prolongamento) ? co.prolongamento : 0;
      case "corrimaoDiam": return fin(co.diametro) ? co.diametro : null;
      case "rampaTravessas": var tr = (g.rampa || {}).travessas; return tr && fin(tr.esp) ? tr.esp : null;
      case "inclinacaoPct": return fin(g.inclinacaoPct) ? g.inclinacaoPct : (g.rampa && fin(g.rampa.inclinacaoPct) ? g.rampa.inclinacaoPct : null);
      case "desnivelSegmento": return fin(g.desnivelEntrePatamares) ? g.desnivelEntrePatamares : g.desnivel;
      case "patamarComprimento": return g.patamar && fin(g.patamar.comprimento) ? g.patamar.comprimento : null;
      case "patamarLargura": return g.patamar && fin(g.patamar.largura) ? g.patamar.largura : null;
      case "gaiolaFalta": return g.desnivel > 3.5 && !mr.gaiola ? 1 : 0;
      case "gaiolaInicio": return fin(mr.gaiolaInicio) ? mr.gaiolaInicio : null;
      case "gaiolaUltrapassa": return fin(mr.gaiolaUltrapassa) ? mr.gaiolaUltrapassa : null;
      case "montantesUltrapassa": return fin(mr.montantesUltrapassa) ? mr.montantesUltrapassa : null;
      case "lanceUnico": return g.desnivel;
      case "deslocLances": return fin(mr.deslocLances) ? mr.deslocLances : null;
      case "espacDegraus": return fin(mr.espacDegraus) ? mr.espacDegraus : null;
      case "primeiroDegrau": return fin(mr.primeiroDegrau) ? mr.primeiroDegrau : null;
      case "afastamento": return fin(mr.afastamento) ? mr.afastamento : null;
      case "diamDegrau": return fin(mr.diamDegrau) ? mr.diamDegrau : null;
      case "degrauLiso": return mr.antiderrapante ? 0 : 1;
      case "gaiolaDiametro": return fin(mr.gaiolaDiametro) ? mr.gaiolaDiametro : null;
      case "gaiolaEspacVert": return fin(mr.gaiolaEspacVert) ? mr.gaiolaEspacVert : null;
      case "gaiolaEspacArcos": return fin(mr.gaiolaEspacArcos) ? mr.gaiolaEspacArcos : null;
      case "semCancela": return mr.cancela ? 0 : 1;
      case "justificativa": return mr.justificado == null ? null : (mr.justificado ? 0 : 1);
      case "corrimaoIntermFalta": return num(g.largura, 0) > 2.40 + 1e-9 && !co.intermediario ? 1 : 0;
      case "corrimaoAlturas": if (!co.alturas) return null; var tem2 = function (h) { return arr(co.alturas).some(function (x) { return Math.abs(x - h) <= 0.011; }); }; return tem2(0.92) && tem2(0.70) ? 0 : 1;
      case "folgaParede": return fin(co.folga) ? co.folga : null;
      case "corrimaoAltMax": return co.alturas && co.alturas.length ? Math.max.apply(null, co.alturas) : null;
      case "spq": return mr.spq == null ? null : (mr.spq ? 0 : 1);
      case "projetoHabilitado": return mr.projeto == null ? null : (mr.projeto ? 0 : 1);
      case "descansoNaoLateral": return mr.descansoLateral == null ? null : (mr.descansoLateral ? 0 : 1);
      case "aberturaSemCancela": return g.aberturaSemCancela == null ? 0 : (g.aberturaSemCancela ? 1 : 0);
      case "pInterno": return fin(g.pInterno) ? g.pInterno : null;
      case "gaiolaFalta3": return g.desnivel > 3.0 && !mr.gaiola ? 1 : 0;
      case "degrauRedondo": return mr.secaoDegrau === "quadrada" ? 0 : 1;
      default: return fin(g[grandeza]) ? g[grandeza] : null;
    }
  }
  function fmt(v, un) {
    if (v == null) return "—";
    if (un === "m") return v < 0.1 ? br(v * 1000, 0) + " mm" : br(v, 2) + " m";
    if (un === "°") return br(v, 1) + "°";
    if (un === "%") return br(v, 2) + " %";
    return br(v, v % 1 ? 2 : 0) + (un ? " " + un : "");
  }
  /* a correção sugerida para cada requisito que reprovou */
  function correcao(q, g, v, mn, mx) {
    var gr = q.grandeza;
    if (gr === "angulo") { if (g.tipo === "escada" && v > mx) return "Escada mais deitada (aumente o piso ou diminua o espelho) — ou use a escada de degraus de 45° a 75° (NR-12 item 11) se não houver espaço."; if (v < mn) return "Inclinação baixa para este tipo: troque pelo meio de acesso da faixa (Figura 1 da NR-12)."; return "Troque o meio de acesso pela faixa de ângulo: rampa até 20°, escada 20°–45°, escada de degraus 45°–75°, marinheiro 75°–90°."; }
    if (gr === "e" || gr === "p" || gr === "blondel") return "Refaça o degrau pela regra do perfil (AcoAcessos.degraus): espelho " + (q.min ? fmt(q.min, "m") : "") + (q.max ? " a " + fmt(q.max, "m") : "") + ".";
    if (gr === "desnivelEntrePatamares") return "Divida em lances com patamar a cada " + fmt(mx, "m") + " de altura (forma \"com patamares\", em L ou em U).";
    if (gr === "largura") return v < mn ? "Aumente a largura para " + fmt(mn, "m") + "." : "Reduza a largura para " + fmt(mx, "m") + ".";
    if (gr === "guardaAltura") return "Guarda-corpo com o travessão superior a " + fmt(mn, "m") + (mx ? "–" + fmt(mx, "m") : "") + " do piso.";
    if (gr === "guardaLadosLivres") return "Guarda-corpo nos dois lados (ou declare o lado encostado em parede).";
    if (gr === "rodape") return "Rodapé de chapa com " + fmt(Math.max(mn, 0.2), "m") + " de altura em todo o perímetro livre.";
    if (gr === "intermediaria") return "Travessão intermediário a 0,70 m do piso.";
    if (gr === "superiorPlano") return "Travessão superior em tubo redondo (sem superfície plana).";
    if (gr === "espacMontantes") return "Montantes a no máximo " + fmt(mx, "m") + ".";
    if (gr === "vaoTravessas") return "Mais travessas (ou tela/chapa) para o vão livre ficar em no máximo " + fmt(mx, "m") + ".";
    if (gr === "gaiolaFalta") return "Gaiola de proteção a partir de 2,00 m do piso, ultrapassando o piso superior em 1,10 m a 1,20 m.";
    if (gr === "lanceUnico" || (gr === "desnivelEntrePatamares" && g.tipo === "marinheiro")) return "Lances de no máximo 6,00 m com plataforma de descanso, eixos deslocados de 0,70 m.";
    if (gr === "corrimaoIntermFalta") return "Corrimão intermediário no meio da largura (o gerador põe com a norma NBR 9050).";
    if (gr === "corrimaoDuplo") return "Corrimão dos dois lados nas alturas 0,92 m e 0,70 m.";
    if (gr === "prolongamento") return "Prolongue o corrimão 0,30 m antes do 1º e depois do último degrau.";
    if (gr === "degrauLiso") return "Especifique degrau serrilhado, recartilhado ou com ranhura.";
    if (gr === "justificativa") return "Registre no projeto por que rampa, escada e escada de degraus são tecnicamente inviáveis e marque a declaração no diálogo (NR-12 1.3; NR-35 Anexo III 4.1.2.1).";
    if (gr === "spq") return "Defina o SPQ pelo item 35.6 com a análise de risco específica (NR-35 Anexo III 5.2.1.1.1) e marque no diálogo.";
    if (gr === "projetoHabilitado") return "Projeto por profissional legalmente habilitado (com ART) — marque no diálogo.";
    if (gr === "aberturaSemCancela") return "Cancela de autofechamento na abertura (ou a escada chegando com o guarda-corpo dela).";
    if (gr === "pInterno") return "Escada mais larga do lado de dentro (raio maior) ou piso maior: o degrau junto da borda de dentro fica abaixo de 0,20 m.";
    if (gr === "degrauRedondo") return "Use degrau de barra quadrada (ou perfil com face plana serrilhada).";
    if (gr === "gaiolaFalta3") return "Gaiola ou trava-quedas guiado a partir de 3,00 m de altura de queda.";
    if (gr === "semCancela") return "Cancela de autofechamento na saída do topo.";
    if (gr === "rampaTravessas") return "Peças transversais de 1 a 2 cm a cada 0,40–0,50 m.";
    return "Ajuste para " + (mn != null ? "≥ " + fmt(mn, q.un) : "") + (mn != null && mx != null ? " e " : "") + (mx != null ? "≤ " + fmt(mx, q.un) : "") + ".";
  }

  /* ============================================================ VERIFICADOR */
  function verificar(g) {
    g = g || {};
    if (!g.tipo) return { ok: false, motivo: "Geometria sem tipo de acesso." };
    var perfil = g.perfil || "nr12", itens = [];
    if (g.lances == null) g.lances = 1;
    if (g.desnivelEntrePatamares == null && fin(g.desnivel)) g.desnivelEntrePatamares = g.desnivel / Math.max(1, g.lances);
    requisitos(g.tipo, perfil).forEach(function (q) {
      if (q.quando && !q.quando(g)) return;
      var v = ler(g, q.grandeza), mn = q.minFn ? q.minFn(g) : q.min, mx = q.maxFn ? q.maxFn(g) : q.max;
      var it = { id: q.id, norma: ref(q.norma, q.item), normaId: q.norma, item: q.item, requisito: q.texto, grandeza: q.grandeza, valor: v, valorTexto: fmt(v, q.un), min: mn, max: mx,
        limite: (mn != null && mx != null ? fmt(mn, q.un) + " a " + fmt(mx, q.un) : (mn != null ? "≥ " + fmt(mn, q.un) : (mx != null ? "≤ " + fmt(mx, q.un) : ""))), sev: q.sev, conferir: !!q.conferir, nota: q.nota || null };
      if (["superiorPlano", "gaiolaFalta", "gaiolaFalta3", "degrauRedondo", "degrauLiso", "semCancela", "corrimaoDuplo", "guardaLadosLivres", "corrimaoIntermFalta", "corrimaoAlturas", "justificativa", "spq", "projetoHabilitado", "descansoNaoLateral", "aberturaSemCancela"].indexOf(q.grandeza) >= 0) it.limite = q.grandeza === "guardaLadosLivres" ? "nenhum lado livre sem proteção" : "exigido";
      if (v == null) { it.ok = null; it.situacao = (q.sev === "nc" ? "INCOMPLETO — obrigatório sem dado" : "não verificado: falta o dado") + " (" + q.grandeza + ")"; if (q.sev === "nc") it.correcao = correcao(q, g, v, mn, mx); }
      else { it.ok = !((mn != null && v < mn - 1e-9) || (mx != null && v > mx + 1e-9)); it.situacao = it.ok ? "atende" : (q.sev === "nc" ? "NÃO ATENDE" : "fora do recomendado"); if (!it.ok) it.correcao = correcao(q, g, v, mn, mx); }
      if (["superiorPlano", "gaiolaFalta", "gaiolaFalta3", "degrauRedondo", "degrauLiso", "semCancela", "corrimaoDuplo", "corrimaoIntermFalta", "corrimaoAlturas", "justificativa", "spq", "projetoHabilitado", "descansoNaoLateral", "aberturaSemCancela"].indexOf(q.grandeza) >= 0 && v != null)
        it.valorTexto = ({ superiorPlano: v ? "com superfície plana" : "tubo (sem superfície plana)", degrauRedondo: v ? "barra redonda" : "barra quadrada", degrauLiso: v ? "liso" : "antiderrapante", corrimaoIntermFalta: v ? "sem corrimão intermediário" : "atende", justificativa: v ? "não declarada" : "declarada", spq: v ? "não definido" : "definido", projetoHabilitado: v ? "não declarado" : "declarado", descansoNaoLateral: v ? "não lateral" : "lateral (lances deslocados)", aberturaSemCancela: v ? "abertura sem cancela" : "protegida", corrimaoAlturas: v ? "uma altura só" : "0,92 e 0,70 m", semCancela: v ? "sem cancela" : "com cancela", corrimaoDuplo: v ? "incompleto" : "duplo, dos dois lados" })[q.grandeza] || (v ? "sem gaiola" : "com gaiola");
      itens.push(it);
    });
    var nc = itens.filter(function (i) { return i.ok === false && i.sev === "nc"; }), rec = itens.filter(function (i) { return i.ok === false && i.sev !== "nc"; }), nv = itens.filter(function (i) { return i.ok == null; });
    /* REGRA DE OURO: requisito OBRIGATÓRIO sem dado = INCOMPLETO (nunca "conforme"); sem nenhum requisito = não avaliado */
    var inc = nv.filter(function (i) { return i.sev === "nc"; }), status = nc.length ? "nao-conforme" : (inc.length ? "incompleto" : (itens.length ? "conforme" : "sem-requisitos"));
    var conf = itens.filter(function (i) { return i.conferir; });
    var avisos = [];
    if (/^nr12/.test(perfil)) avisos.push("NR-12, Anexo III, 1.6: a máquina que atende norma técnica oficial ou internacional vigente em 30/07/2019 (ex.: ISO 14122) fica dispensada do Anexo III — este verificador aplica o Anexo III e a ISO 14122 como complemento.");
    if (/^nr12/.test(perfil)) avisos.push("NR-12, Anexo III, 1.2: o Anexo III vale para os meios de acesso a MÁQUINAS e equipamentos; nos acessos do prédio e das estruturas industriais fixas ele não se aplica, exceto quando a função principal for dar acesso à máquina — fora disso, use a NBR 9077/IT do Corpo de Bombeiros (rota de fuga) e a NBR 9050 (rota acessível) onde couberem.");
    if (perfil === "emergencia") avisos.push("Escada de emergência: os números são da NPT 011/2024 do Paraná (que segue a IT-11/2019 de SP); vale a IT do Corpo de Bombeiros do ESTADO DA OBRA. A largura sai da população (N = P/C × 0,55 m) e o tipo de escada (enclausurada, à prova de fumaça…) da ocupação — informe a população.");
    if (perfil === "nbr9050") avisos.push("Rota acessível: a escada sozinha NÃO é rota acessível — a NBR 9050 pede rampa ou equipamento eletromecânico junto.");
    return { ok: true, perfil: perfil, tipo: g.tipo, aprovado: status === "conforme", status: status, incompletos: inc, itens: itens, naoConformes: nc, recomendacoes: rec, naoVerificados: nv, conferir: conf, avisos: avisos,
      resumo: (nc.length ? nc.length + " não conformidade(s)" + (inc.length ? " e " + inc.length + " obrigatório(s) sem dado" : "") : (inc.length ? "INCOMPLETO — " + inc.length + " requisito(s) obrigatório(s) sem dado" : (itens.length ? "conforme" : "sem requisito aplicável — não avaliado"))) + " — " + itens.filter(function (i) { return i.ok; }).length + " de " + itens.length + " requisitos atendidos" + (rec.length ? "; " + rec.length + " fora do recomendado" : "") + (nv.length ? "; " + nv.length + " sem dado" : "") };
  }

  /* ============================================================ DEGRAUS
   * a geometria do degrau pelo perfil: n espelhos iguais, e = H/n; o piso p
   * na faixa do perfil, o mais perto do alvo de Blondel. */
  var REGRA_DEG = {
    "nr12": { eMin: 0.20, eMax: 0.25, pMin: 0.20, pMax: 0.40, fMin: 0.60, fMax: 0.66, alvo: 0.63, angMax: 45, blondelObrig: false, ePref: 0.22, ref: ref("nr12", "Anexo III, 12 b) e d) e Figura 1 C (até 45°)") + "; 600 ≤ g + 2h ≤ 660 como preferência (" + ref("iso14122", "parte 3") + ")", conferir: false },
    "nr12-ingreme": { eMin: 0.15, eMax: 0.25, pMin: 0.15, pMax: 0.25, fMin: 0.60, fMax: 0.66, alvo: 0.63, blondelObrig: true, ref: ref("nr12", "Anexo III, 11 b), d) e g)"), conferir: false, anguloMin: 45 },
    "nbr9050": { eMin: 0.16, eMax: 0.18, pMin: 0.28, pMax: 0.32, fMin: 0.63, fMax: 0.65, alvo: 0.64, blondelObrig: true, ref: ref("nbr9050", "6.8.2"), conferir: true },
    "emergencia": { eMin: 0.16, eMax: 0.18, pMin: 0.27, pMax: 0.32, fMin: 0.63, fMax: 0.64, alvo: 0.635, blondelObrig: true, ref: "NPT 011:2024 (CBPMPR), 5.7.3.1", conferir: false }
  };
  function degraus(H, perfil, op) {
    op = op || {};
    var R = REGRA_DEG[perfil] || REGRA_DEG.nr12;
    H = num(H, 0); if (!(H > 0.1)) return { ok: false, motivo: "Desnível inválido." };
    /* o piso p fica na faixa do perfil, em múltiplos de 5 mm PARA DENTRO; NR-12 (escada com espelho): p ≥ e (até 45°,
       Figura 1 C) e Blondel só como PREFERÊNCIA (item 12 não o exige; a ISO 14122-3 recomenda); íngreme: p ≤ e (45°+) e
       Blondel obrigatório (item 11 g); NBR 9050 e emergência: Blondel obrigatório. Preferência: Blondel, e ≤ ePref, alvo. */
    var nMin = Math.max(2, Math.ceil(H / R.eMax - 1e-9)), nMax = Math.max(nMin, Math.floor(H / R.eMin + 1e-9)), melhor = null;
    for (var n = nMin; n <= nMax; n++) {
      var e = H / n; if (e > R.eMax + 1e-9 || e < R.eMin - 1e-9) continue;
      var lo = R.pMin, hi = R.pMax;
      if (R.angMax) lo = Math.max(lo, e / Math.tan(R.angMax * GRAU));
      if (R.anguloMin) hi = Math.min(hi, e / Math.tan(R.anguloMin * GRAU));
      if (R.blondelObrig) { lo = Math.max(lo, R.fMin - 2 * e); hi = Math.min(hi, R.fMax - 2 * e); }
      lo = Math.ceil(lo * 200 - 1e-6) / 200; hi = Math.floor(hi * 200 + 1e-6) / 200;
      if (lo > hi + 1e-9) continue;
      var p = Math.min(hi, Math.max(lo, Math.round((R.alvo - 2 * e) * 200) / 200)), f = p + 2 * e, blOk = f >= R.fMin - 1e-9 && f <= R.fMax + 1e-9;
      var cand = { n: n, e: e, p: p, f: f, blOk: blOk, pena: (blOk ? 0 : 10) + (R.ePref && e > R.ePref + 1e-9 ? 5 : 0) + Math.abs(f - R.alvo) + n * 1e-4 };
      if (op.preferir === "menosDegraus") { if (!melhor) melhor = cand; }
      else if (!melhor || cand.pena < melhor.pena - 1e-9) melhor = cand;
    }
    if (!melhor) return { ok: false, motivo: "Não há degrau igual que atenda " + R.ref + " para " + br(H, 2) + " m — ajuste o desnível (o espelho fica entre " + cm(R.eMin) + " e " + cm(R.eMax) + ")." };
    var ang = Math.atan(melhor.e / melhor.p) / GRAU;
    return { ok: true, n: melhor.n, e: melhor.e, p: melhor.p, blondel: r4(melhor.f), blondelOk: melhor.blOk, angulo: ang, perfil: perfil, regra: R, ref: R.ref, conferir: R.conferir,
      passos: [
        { rotulo: "Número de espelhos", formula: "n = H / e, com " + cm(R.eMin) + " ≤ e ≤ " + cm(R.eMax), valor: "n = " + melhor.n + "; e = " + br(H, 3) + " / " + melhor.n + " = " + cm(melhor.e) },
        { rotulo: "Piso do degrau (múltiplo de 5 mm)", formula: br(R.fMin, 2) + " ≤ p + 2e ≤ " + br(R.fMax, 2) + " m" + (R.blondelObrig ? "" : " (preferência)") + "; " + cm(R.pMin) + " ≤ p" + (R.pMax < 0.4 ? " ≤ " + cm(R.pMax) : "") + (R.angMax ? "; p ≥ e (α ≤ " + R.angMax + "°)" : "") + (R.anguloMin ? "; p ≤ e (α ≥ " + R.anguloMin + "°)" : ""), valor: "p = " + cm(melhor.p) + "; p + 2e = " + cm(melhor.f) },
        { rotulo: "Ângulo de lance", formula: "α = atan(e/p)", valor: br(ang, 1) + "°" }
      ] };
  }

  /* ============================================================ ESCOLHA DO ACESSO
   * e = { desnivel (m), espacoPlanta (m de projeção horizontal disponível; vazio = sem limite),
   *       frequencia: "habitual"|"eventual"|"emergencia", rotaAcessivel, material (carrega material/ferramenta) } */
  function escolher(e) {
    e = e || {};
    var H = num(e.desnivel, 0), Lp = num(e.espacoPlanta, 0), freq = e.frequencia || "habitual", av = [], rk = [];
    if (!(H > 0)) return { ok: false, motivo: "Informe o desnível (m)." };
    function proj(angGraus) { return H / Math.tan(angGraus * GRAU); }
    if (e.rotaAcessivel) {
      var nSeg = Math.ceil(H / 0.80 - 1e-9), Lr = H / 0.0833 + Math.max(0, nSeg - 1) * 1.20;
      rk.push({ tipo: "rampa", perfil: "nbr9050", projecao: Lr, cabe: !Lp || Lr <= Lp, motivo: "rampa NBR 9050 a 8,33 % com patamar de 1,20 m a cada 0,80 m de desnível (" + nSeg + " segmento(s))", ref: ref("nbr9050", "6.6") });
      var dg = degraus(H, "nbr9050");
      rk.push({ tipo: "escada", perfil: "nbr9050", projecao: dg.ok ? (dg.n - 1) * dg.p + Math.max(0, Math.ceil(H / 3.2 - 1e-9) - 1) * 1.2 : null, cabe: dg.ok && (!Lp || (dg.n - 1) * dg.p <= Lp), motivo: "escada NBR 9050 + plataforma elevatória ou elevador (a escada sozinha não é rota acessível)", ref: ref("nbr9050", "6.8") });
      var esc0 = rk.filter(function (r) { return r.cabe; })[0] || rk[0];
      return { ok: true, tipo: esc0.tipo, perfil: esc0.perfil, angulo: esc0.tipo === "rampa" ? Math.atan(0.0833) / GRAU : (dg.ok ? dg.angulo : null), motivo: esc0.motivo, ranking: rk, avisos: Lp && !rk[0].cabe ? ["A rampa não cabe em " + m2(Lp) + " (precisa de " + m2(Lr) + "): escada NBR 9050 + equipamento eletromecânico."] : [] };
    }
    if (freq === "emergencia") {
      var de = degraus(H, "emergencia");
      return { ok: de.ok, tipo: "escada", perfil: "emergencia", angulo: de.ok ? de.angulo : null, motivo: "escada de emergência (NBR 9077/IT do Corpo de Bombeiros): degrau " + (de.ok ? cm(de.e) + " × " + cm(de.p) : "—") + "; a largura vem da população", ranking: [], avisos: ["Informe a população e a IT do estado: a largura e o tipo de escada (enclausurada, à prova de fumaça…) saem dela."] };
    }
    /* industrial: a faixa de ângulo que o espaço permite e a preferência pelo uso */
    var angMin = Lp > 0 ? Math.atan(H / Lp) / GRAU : 0;
    var cands = [
      { tipo: "rampa", perfil: "nr12", aMin: 0, aMax: 20, alvo: 10, motivo: "rampa (até 20°; acima de 10°, peças transversais) — a melhor para carregar material", ref: ref("nr12", "Anexo III, 2 e 6") },
      { tipo: "escada", perfil: "nr12", aMin: 20, aMax: 45, alvo: 34, motivo: "escada de 20° a 45° (faixa preferida 30°–38°) — o acesso habitual a plataformas", ref: ref("nr12", "Anexo III, 2 e 12") },
      { tipo: "escada-ingreme", perfil: "nr12-ingreme", aMin: 45, aMax: 75, alvo: 60, motivo: "escada de degraus íngreme (45° a 75°) — pouco espaço em planta", ref: ref("nr12", "Anexo III, 2 e 11") },
      { tipo: "marinheiro", perfil: "nr12", aMin: 75, aMax: 90, alvo: 90, motivo: "escada tipo marinheiro (75° a 90°) — só na impossibilidade técnica dos outros", ref: ref("nr12", "Anexo III, 1.3 e 13") }
    ];
    /* a PROJEÇÃO REAL de cada escada sai do degrau que o gerador faz (degraus()), com os patamares a cada 3,00 m;
       a íngreme é limitada ao ângulo ALCANÇÁVEL pelo item 11 (h ≤ 0,25 m, g ≥ 0,15 m, 600 ≤ g + 2h ≤ 660 → ≈ 59°) */
    var nL3 = Math.max(1, Math.ceil(H / 3.0 - 1e-9));
    function real(c) {
      if (c.tipo === "escada") { var d = degraus(H, "nr12"); return d.ok ? { ang: d.angulo, pr: (d.n - nL3) * d.p + (nL3 - 1) * 0.8 } : null; }
      if (c.tipo === "escada-ingreme") { var nI = Math.max(2, Math.ceil(H / 0.25 - 1e-9)), eI = H / nI, gI = Math.ceil(Math.max(0.15, 0.60 - 2 * eI) * 200 - 1e-6) / 200; if (gI > eI + 1e-9 || gI + 2 * eI > 0.66 + 1e-9) return null; return { ang: Math.atan(eI / gI) / GRAU, pr: (nI - nL3) * gI + (nL3 - 1) * 0.8 }; }
      if (c.tipo === "marinheiro") return { ang: 90, pr: 0.35 };
      var aR = Math.max(c.aMin + 1, Math.min(c.aMax, Math.max(angMin, c.alvo))); return { ang: aR, pr: proj(aR) };
    }
    cands.forEach(function (c) {
      var rl = real(c), aUso = rl ? rl.ang : c.alvo, semDeg = !rl && (c.tipo === "escada" || c.tipo === "escada-ingreme");
      var pr = rl ? rl.pr : Infinity;
      var cabe = !!rl && (!(Lp > 0) || pr <= Lp + 1e-6);
      var pont = (cabe ? 100 : 0) - Math.abs(aUso - c.alvo) * 0.5;
      if (c.tipo === "rampa") pont += (e.material ? 30 : -5) + (H <= 1.0 ? 15 : -Math.min(30, H * 6));
      if (c.tipo === "escada") pont += freq === "habitual" ? 30 : 20;
      if (c.tipo === "escada-ingreme") pont += freq === "eventual" ? 10 : -5;
      if (c.tipo === "marinheiro") pont -= freq === "habitual" ? 60 : 25;
      rk.push({ tipo: c.tipo, perfil: c.perfil, angulo: semDeg ? null : r4(aUso), projecao: isFinite(pr) ? r4(pr) : null, cabe: cabe, semDegrau: semDeg, pontos: pont,
        motivo: semDeg ? "não há degrau uniforme pela NR-12 para esse desnível (" + (c.tipo === "escada" ? "item 12: espelho de 0,20 a 0,25 m" : "item 11: espelho até 0,25 m com 600 ≤ g + 2h ≤ 660") + ") — ajuste o desnível ou use outro meio" : c.motivo, ref: c.ref });
    });
    rk.sort(function (a, b) { return b.pontos - a.pontos; });
    var esc = rk[0];
    if (esc.tipo === "marinheiro") av.push("Marinheiro só na impossibilidade técnica de rampa, escada ou escada de degraus (NR-12, Anexo III, 1.3): registre por que os outros não cabem.");
    if (esc.tipo === "marinheiro" && H > 3.5) av.push("Acima de 3,50 m: gaiola obrigatória (13 c)" + (H > 10 ? "; acima de 10 m, lances de no máximo 6 m com plataforma de descanso (13 f e g)." : "."));
    if ((esc.tipo === "escada" || esc.tipo === "escada-ingreme") && H > 3) av.push("Desnível acima de 3,00 m: plataforma de descanso a cada 3,00 m no máximo (NR-12, Anexo III, 11 e / 12 e).");
    if (!esc.cabe) av.push("Nenhum meio de acesso cabe em " + m2(Lp) + " de projeção para " + m2(H) + " de desnível.");
    return { ok: true, tipo: esc.tipo, perfil: esc.perfil, angulo: esc.angulo, projecao: esc.projecao, motivo: esc.motivo, ranking: rk, angMin: r4(angMin), avisos: av };
  }

  /* ============================================================ CARGAS (NBR 6120:2019) */
  var USOS_GUARDA = [
    { id: "manutencao", rotulo: "Passarelas acessíveis apenas para inspeção e manutenção", f: 0.4 },
    { id: "sem-publico", rotulo: "Coberturas, terraços, passarelas etc. sem acesso público; escadas privativas ou sem acesso público, escadas de emergência", f: 1.0 },
    { id: "publico", rotulo: "Áreas com acesso público", f: 1.0 },
    { id: "fluxo-paralelo", rotulo: "Zonas de fluxo de pessoas em áreas de acesso público — barreira paralela ao fluxo", f: 2.0 },
    { id: "fluxo-perpendicular", rotulo: "Zonas de fluxo de pessoas em áreas de acesso público — barreira perpendicular ao fluxo", f: 3.0 },
    { id: "industrial", rotulo: "Áreas de estoque e atividades industriais", f: 2.0 },
    { id: "emergencia", rotulo: "Escadas de emergência em edifícios (NBR 6120:2019, Tabela 12 — a NPT 011, 5.8.3.1, pede 730 N/m a 1,05 m, menos: a NBR governa)", f: 1.0, altura: 1.1 }
  ];
  function forcaGuarda(uso) {
    var u = USOS_GUARDA.filter(function (x) { return x.id === uso; })[0] || USOS_GUARDA.filter(function (x) { return x.id === "industrial"; })[0];
    var hF = u.altura || 1.1;
    return { f: u.f, uso: u.id, rotulo: u.rotulo, altura: hF, ref: u.ref || ref("nbr6120", "6.3 e Tabela 12"), texto: br(u.f, 2) + " kN/m horizontal a " + br(hF, 2) + " m do piso acabado (" + u.rotulo + ")" };
  }
  var USOS_PISO = [
    { id: "escada-sem-publico", rotulo: "Escadas e passarelas sem acesso público", q: 2.5 },
    { id: "escada-publico", rotulo: "Escadas e passarelas com acesso público", q: 3.0 },
    { id: "area-tecnica", rotulo: "Áreas técnicas em geral (fora da projeção dos equipamentos)", q: 3.0 },
    { id: "informado", rotulo: "Valor do projeto (processo/equipamento)", q: null }
  ];
  /* o MÍNIMO por tipo de acesso (NBR 6120:2019, Tabela 10): plataforma de manutenção e anelar = área técnica (3,0 kN/m²);
     escada, rampa e passarela = escadas e passarelas sem acesso público (2,5 kN/m²) */
  var MIN_TIPO = { plataforma: { q: 3.0, rotulo: "áreas técnicas em geral" }, anelar: { q: 3.0, rotulo: "áreas técnicas em geral" } };
  function sobrecarga(uso, qInf, tipo) {
    var u = USOS_PISO.filter(function (x) { return x.id === uso; })[0] || USOS_PISO[0], mt = MIN_TIPO[tipo] || { q: 2.5, rotulo: "escadas e passarelas sem acesso público" };
    var qi = num(qInf, null), q = u.q == null ? (qi != null && qi > 0 ? qi : null) : Math.max(u.q, num(qInf, 0)), avs = [];
    if (q != null && q < mt.q - 1e-9) { avs.push("Sobrecarga de " + br(q, 2) + " kN/m² abaixo do mínimo da NBR 6120:2019, Tabela 10 (" + mt.rotulo + ": " + br(mt.q, 1) + " kN/m²) para este tipo de acesso: usado " + br(mt.q, 1) + " kN/m²"); q = mt.q; }
    return { q: q, P: 2.5, avisos: avs, uso: u.id, rotulo: u.rotulo, ref: ref("nbr6120", "Tabela 10" + (/escada/.test(u.id) ? " e nota t" : "")), texto: (q == null ? "informe a carga" : br(q, 1) + " kN/m²") + " (" + u.rotulo + "); degrau isolado: 2,5 kN concentrada na posição mais desfavorável, sem a distribuída (nota t)" };
  }
  var GAMA = { g: 1.25, q: 1.50, ref: "NBR 8800:2024, Tabela 1 — expressão da 2008, sem mudança confirmada (γg = 1,25 peso próprio de estrutura metálica; γq = 1,50 ação variável de uso)" };
  var FLECHA = { piso: 350, ref: "NBR 8800:2024, Anexo C — limite da 2008 (vigas de piso: L/350), sem mudança confirmada" };

  /* ============================================================ PISOS
   * kg/m² pela geometria (grade e expandida) ou pela espessura (chapa); o
   * catálogo industrial (frente C, AcoCatalogoInd) manda quando existir. */
  var RHO = 7850;
  /* a grade do catálogo industrial (js/acocatalogoind.js) com a mesma geometria: barra portante h × t, passo a × b (mm) */
  function gradeDoCatalogo(p) {
    var C = CatInd(); if (!C || !C.tiposGrade) return null;
    var h = num(p.gradeH, 0.025) * 1000, t = num(p.gradeT, 0.003) * 1000, a = num(p.gradeA, 0.030) * 1000, b = num(p.gradeB, 0.100) * 1000, comTab = {};
    try { if (C.tiposComTabela) C.tiposComTabela().forEach(function (x) { comTab[x.id] = 1; }); } catch (e) {}
    var cand = [];
    try { cand = C.tiposGrade().filter(function (x) { return Math.abs(num(x.alturaBarra_mm, -9) - h) < 0.6 && Math.abs(num(x.espessuraBarra_mm, -9) - t) < 0.35 && Math.abs(num(x.passoPortante_mm, -9) - a) < 1.5 && Math.abs(num(x.passoTransversal_mm, -9) - b) < 1.5; }); } catch (e2) { return null; }
    cand.sort(function (x, y) { return (comTab[y.id] ? 1 : 0) - (comTab[x.id] ? 1 : 0); });
    return cand[0] ? { tipo: cand[0], temTabela: !!comTab[cand[0].id] } : null;
  }
  function nomeFab(t) { return t && t.fabricante ? (typeof t.fabricante === "object" ? t.fabricante.nome : t.fabricante) : ""; }
  function pisoKgM2(tipo, p) {
    p = p || {};
    if (tipo === "grade") { var gc = gradeDoCatalogo(p); if (gc && fin(num(gc.tipo.kgm2, NaN))) return { kgm2: num(gc.tipo.kgm2, 0), fonte: nomeFab(gc.tipo) + " " + (gc.tipo.codigoFabricante || gc.tipo.id) + " (catálogo industrial" + (gc.tipo.pagina ? ", " + gc.tipo.pagina : "") + ")", conferir: !!gc.tipo.conferir, catalogo: gc.tipo.id }; }
    if (tipo === "grade") { var h = num(p.gradeH, 0.025), t = num(p.gradeT, 0.003), a = num(p.gradeA, 0.030), b = num(p.gradeB, 0.100), s = num(p.gradeS, 0.005); return { kgm2: r4(RHO * (h * t / a + s * s / b)), fonte: "geometria da grade (barra portante " + br(h * 1000, 0) + " × " + br(t * 1000, 0) + " mm a cada " + br(a * 1000, 0) + " mm; travessa " + br(s * 1000, 0) + " mm a cada " + br(b * 1000, 0) + " mm) — conferir com o fabricante", conferir: true }; }
    if (tipo === "xadrez") { var tx = num(p.t, 0.00635); return { kgm2: r4(RHO * tx * 1.07), fonte: "chapa lisa de " + br(tx * 1000, 2) + " mm × 7.850 kg/m³ + 7 % do relevo (valor de partida — conferir na tabela da usina)", conferir: true }; }
    if (tipo === "expandida") { var te = num(p.t, 0.003), ce = num(p.cordao, 0.004), lm = num(p.losangoMenor, 0.025); return { kgm2: r4(RHO * te * 2 * ce / lm), fonte: "geometria da malha (cordão " + br(ce * 1000, 1) + " mm, espessura " + br(te * 1000, 1) + " mm, losango menor " + br(lm * 1000, 0) + " mm) — conferir com o fabricante", conferir: true }; }
    if (tipo === "perfurada") { var tp = num(p.t, 0.003), d = num(p.furoD, 0.010), pa = num(p.furoPasso, 0.015), ab = Math.PI * d * d / 4 / (pa * pa * Math.sqrt(3) / 2); return { kgm2: r4(RHO * tp * (1 - Math.min(0.8, ab))), aberta: r4(ab), fonte: "chapa de " + br(tp * 1000, 1) + " mm com furos Ø " + br(d * 1000, 0) + " mm a 60° no passo " + br(pa * 1000, 0) + " mm (área aberta " + br(ab * 100, 0) + " %)", conferir: false }; }
    var tl = num(p.t, 0.00635); return { kgm2: r4(RHO * tl), fonte: "chapa lisa de " + br(tl * 1000, 2) + " mm", conferir: false };
  }

  /* ============================================================ CORES E PINTURA */
  function cores(uso) {
    var C = CatInd();
    if (C) {
      try {
        var it = { marinheiro: "escada de marinheiro", escada: "escada de degraus", plataforma: "guarda-corpo", passarela: "guarda-corpo", anelar: "guarda-corpo" }[uso] || "guarda-corpo";
        var cs = C.corAplicacao ? C.corAplicacao(it) : null, ps = C.sistemaPintura ? C.sistemaPintura("C3", "H") : null;
        if (cs && cs.cor) {
          var f = ps && ps.fonte ? (typeof ps.fonte === "object" ? (ps.fonte.titulo || "") + (ps.fonte.url ? " — " + ps.fonte.url : "") : String(ps.fonte)) : null;
          return { cor: cs.cor, munsell: cs.munsell || null, ref: (cs.justificativa || "catálogo industrial").slice(0, 220), conferir: !!cs.conferir, sistema: ps ? "sistema " + ps.id + " (ambiente C3, durabilidade alta — ISO 12944; confirme o ambiente da obra)" + (ps.epsSoma_um ? ", " + ps.epsSoma_um + " µm" : "") : "conforme o ambiente (catálogo industrial › pintura)", sistemaRef: f || "catálogo industrial", origem: "catálogo industrial (js/acocatalogoind.js)" };
        }
      } catch (e) {}
    }
    return { cor: "amarela (guarda-corpo, corrimão, rodapé e bordas de degrau que apresentem risco)", munsell: "5Y 8/12", ref: ref("nbr7195", "amarelo — advertência") + " (a NR-26 remete às normas técnicas oficiais)", conferir: true,
      sistema: "galvanização a fogo (grade e peças pequenas) ou primer epóxi rico em zinco + intermediário epóxi + acabamento poliuretano alifático, especificado pela categoria de corrosividade do ambiente", sistemaRef: "ABNT NBR 6323 (galvanização a fogo) e ISO 12944-5 (sistemas de pintura) — conferir", origem: "padrão do motor de acessos (sem js/acocatalogoind.js)" };
  }

  /* ============================================================ DIMENSIONAMENTO
   * cada função devolve verificações no formato do js/acodim8800.js:
   * { nome, item, passos: [{rotulo, formula, valor}], resistencia, solicitante, unidade, razao, ok } */
  function aco(id) { var M = Mat(), a = M ? M.aco(id || "ASTM A36") : null; return a || { id: id || "ASTM A36", fy: 250, fu: 400 }; }
  function E_() { var M = Mat(); return M ? M.CONST.E : 200000; }
  function ga1() { var M = Mat(); return M ? M.GAMA.a1 : 1.10; }
  function secao(nome) {
    var C = Cat(); if (!C || !C.completo) return null;
    var s = C.completo(nome); if (!s || !(s.A > 0)) return null;
    s = clone(s);
    /* U laminado: o js/acosecao.js não dá h (altura livre da alma); h = d − 2·tf (a favor da segurança na esbeltez da alma) */
    if ((s.forma === "U" || s.forma === "I") && !(s.h > 0) && s.d > 0 && s.tf > 0) s.h = s.d - 2 * s.tf;
    return s;
  }
  function viaDim8800(nome, s, a, L, est, op) {
    var D = D88(); if (!D || !s) return null;
    var r = D.verificarBarra({ secao: s, aco: a, L: L, estacoes: est, flambagem: op.flambagem || { Lx: L, Ly: L, Lz: L }, travamentos: op.travamentos || { mais: [], menos: [] }, papel: op.papel || "viga", cb: op.cb });
    if (!r || r.ok == null) return null;
    return r;
  }
  function estacoesBiapoiada(L, wPerp, wAx, n) {
    var o = []; n = n || 8;
    for (var i = 0; i <= n; i++) { var x = L * i / n; o.push({ x: x, N: -wAx * (L - x), Vy: wPerp * (L / 2 - x), Mz: wPerp * x * (L - x) / 2, comb: "ELU" }); }
    return o;
  }
  function verifFlecha(nome, wk, L, I, lim, ref0) {
    var E = E_(), d = 5 * wk * Math.pow(L * 1000, 4) / (384 * E * I), dl = L * 1000 / lim;   /* wk em N/mm (= kN/m) */
    return { nome: nome, item: ref0, passos: [{ rotulo: "Flecha da sobrecarga (característica)", formula: "δ = 5·q·L⁴ / (384·E·I)", valor: "δ = " + br(d, 1) + " mm" }, { rotulo: "Limite", formula: "L/" + lim, valor: br(dl, 1) + " mm" }], resistencia: dl, solicitante: d, unidade: "mm", razao: d / dl, ok: d <= dl + 1e-9, els: true };
  }
  function resumir(nome, r, extra) {
    var vs = arr(r && r.verificacoes).map(function (v) { var o = clone(v); o.nome = nome + " — " + v.nome; o.ok = !(v.razao > 1 + 1e-9); return o; });
    return vs.concat(arr(extra));
  }

  /* LONGARINA da escada: viga inclinada biapoiada (pé fixo, topo móvel), travada pelos degraus */
  function longarina(sp) {
    var s = secao(sp.perfil), a = aco(sp.aco), out = { verificacoes: [], naoVerificados: [], avisos: [] };
    if (!s) { out.naoVerificados.push("não verificado: longarina — perfil \"" + sp.perfil + "\" sem propriedades no catálogo (longarina em chapa: verificar à parte)"); return out; }
    if (!(num(sp.e, 0) > 0.05 && num(sp.p, 0) > 0.05 && num(sp.Lh, 0) > 0.05)) { out.naoVerificados.push("não verificado: longarina — geometria inválida (espelho, piso ou projeção nulos) (CRÍTICO)"); return out; }
    var al = Math.atan(sp.e / sp.p), Lh = num(sp.Lh, 0), L = Lh / Math.cos(al), W = num(sp.largura, 1);
    var gPiso = num(sp.gPiso, 0.6), gProp = s.massa * 9.81 / 1000, q = num(sp.q, 2.5);
    var wG = gPiso * W / 2 + gProp / Math.cos(al), wQ = q * W / 2, wd = GAMA.g * wG + GAMA.q * wQ;   /* kN por metro HORIZONTAL */
    var wPerp = wd * Math.cos(al) * Math.cos(al), wAx = wd * Math.cos(al) * Math.sin(al);
    var trav = []; for (var x = sp.p / Math.cos(al); x < L; x += sp.p / Math.cos(al)) trav.push(r4(x));
    var r = viaDim8800("Longarina", s, a, L, estacoesBiapoiada(L, wPerp, wAx), { flambagem: { Lx: L, Ly: sp.p / Math.cos(al), Lz: sp.p / Math.cos(al) }, travamentos: { mais: trav, menos: trav }, papel: "viga" });
    var cargas = { nome: "Longarina — cargas", item: GAMA.ref, passos: [
      { rotulo: "Geometria", formula: "α = atan(e/p); L = Lh / cos α", valor: "α = " + br(al / GRAU, 1) + "°; Lh = " + m2(Lh) + "; L = " + m2(L) },
      { rotulo: "Permanente por metro horizontal (meia largura)", formula: "g = gpiso·W/2 + peso próprio/cos α", valor: br(wG, 3) + " kN/m (piso " + br(gPiso, 2) + " kN/m²)" },
      { rotulo: "Sobrecarga (" + sp.qRef + ")", formula: "q·W/2", valor: br(wQ, 3) + " kN/m" },
      { rotulo: "Combinação última", formula: "wd = 1,25·g + 1,50·q; w⊥ = wd·cos²α; wN = wd·cos α·sen α (compressão do pé ao topo)", valor: "wd = " + br(wd, 3) + " kN/m; w⊥ = " + br(wPerp, 3) + " kN/m; MSd = " + br(wPerp * L * L / 8, 2) + " kN·m" }
    ], resistencia: null, solicitante: null, razao: 0, ok: true, info: true };
    out.verificacoes = [cargas].concat(r ? resumir("Longarina", r) : []);
    if (!r) out.naoVerificados.push("não verificado: longarina — o js/acodim8800.js não carregou");
    if (r && r.avisos) out.avisos = out.avisos.concat(r.avisos);
    out.verificacoes.push(verifFlecha("Longarina — flecha", wQ * Math.cos(al) * Math.cos(al), L, s.Ix, FLECHA.piso, FLECHA.ref));
    out.avisos.push("Longarina: mesas travadas pelos degraus a cada " + cm(sp.p / Math.cos(al)) + " ao longo da barra (degrau soldado ou aparafusado nas duas longarinas — premissa)");
    return out;
  }
  /* DEGRAU: chapa (xadrez/lisa) como viga de largura p entre as longarinas, ou grade pelas barras portantes */
  /* ESPESSURA DO DEGRAU DE CHAPA: a menor chapa comercial que passa a flexão (2,5 kN, NBR 6120 nota t) E a flecha
     (1,5 kN, W/300 ≤ 6 mm, ISO 14122-3) com a largura W e o piso p da escada; nenhuma até 19 mm → { ok: false } (use grade) */
  var CHAPAS_DEGRAU = [0.00475, 0.00635, 0.008, 0.0095, 0.0125, 0.016, 0.019];
  function espessuraDegrau(W, pp, tMin) {
    for (var i = 0; i < CHAPAS_DEGRAU.length; i++) {
      var t = CHAPAS_DEGRAU[i]; if (t < num(tMin, 0) - 1e-9) continue;
      var r = degrau({ material: "chapa", t: t, vao: W, p: pp });
      if (r.verificacoes.length && r.verificacoes.every(function (v) { return v.ok; })) return { ok: true, t: t, verificacoes: r.verificacoes };
    }
    return { ok: false, motivo: "nenhuma chapa até 19 mm passa a flexão e a flecha com " + br(W, 2) + " m de largura e piso de " + cm(pp) + " — use degrau em GRADE" };
  }
  function degrau(sp) {
    var a = aco(sp.aco || "ASTM A36"), W = num(sp.vao, 1), pp = num(sp.p, 0.25), P = 2.5, q = num(sp.q, 2.5), out = { verificacoes: [], naoVerificados: [], avisos: [] }, g1 = ga1();
    if (sp.material === "grade") {
      var h = num(sp.gradeH, 0.025), t = num(sp.gradeT, 0.003), aa = num(sp.gradeA, 0.03), nb = Math.max(2, Math.floor(pp / aa) + 1), Wb = t * 1000 * Math.pow(h * 1000, 2) / 4, Ib = t * 1000 * Math.pow(h * 1000, 3) / 12;
      var nP = Math.max(1, Math.min(nb, Math.floor(0.20 / aa) + 1)), MP = GAMA.q * P * W / 4 / nP, MRd = 1.0 * Wb * a.fy / g1 / 1e6;
      out.verificacoes.push({ nome: "Degrau em grade — carga concentrada", item: ref("nbr6120", "Tabela 10, nota t (2,5 kN)") + "; NBR 8800:2024 (expressão da 2008), 5.4 (MRd = Z·fy/γa1, seção retangular cheia)", passos: [
        { rotulo: "Barras portantes no degrau", formula: "n = p/a + 1", valor: nb + " barras de " + br(h * 1000, 0) + " × " + br(t * 1000, 0) + " mm" },
        { rotulo: "Barras que recebem a carga (premissa: 2,5 kN repartida pelas barras numa faixa de 20 cm)", formula: "nP = 0,20/a + 1", valor: nP + " barras" },
        { rotulo: "Momento por barra", formula: "MSd = 1,5·P·W/4/nP", valor: br(MP, 3) + " kN·m" },
        { rotulo: "Resistência da barra (seção retangular compacta, travada pelas travessas da grade)", formula: "MRd = Z·fy/γa1, Z = t·h²/4 (= 1,5·W)", valor: br(MRd, 3) + " kN·m" }], resistencia: MRd, solicitante: MP, unidade: "kN·m", razao: MP / MRd, ok: MP <= MRd + 1e-9, conferir: true });
      var nP15 = Math.max(1, Math.min(nb, Math.floor(0.10 / aa) + 1)), dg = 1.5 * 1000 / nP15 * Math.pow(W * 1000, 3) / (48 * E_() * Ib), dlim = Math.min(W * 1000 / 300, 6);
      out.verificacoes.push({ nome: "Degrau em grade — flecha", item: ref("iso14122", "parte 3, 4.2.1 (1,5 kN em 100 × 100 mm; flecha < W/300 e ≤ 6 mm)"), passos: [{ rotulo: "Barras sob a carga (100 mm)", formula: "n = 0,10/a + 1", valor: nP15 + " barras" }, { rotulo: "δ = P·W³/(48·E·I) por barra", formula: "", valor: br(dg, 1) + " mm ≤ " + br(dlim, 1) + " mm" }], resistencia: dlim, solicitante: dg, unidade: "mm", razao: dg / dlim, ok: dg <= dlim, els: true, conferir: true });
      out.avisos.push("Grade do degrau: confirmar na tabela de vão × carga do fabricante (a repartição da carga concentrada entre as barras é premissa)");
      return out;
    }
    var tt = num(sp.t, 0.00635), Z = pp * 1000 * Math.pow(tt * 1000, 2) / 4, Wc = pp * 1000 * Math.pow(tt * 1000, 2) / 6, MRd2 = Math.min(Z, 1.5 * Wc) * a.fy / g1 / 1e6;
    var MP2 = GAMA.q * P * W / 4, Mq = (GAMA.q * q * pp + GAMA.g * 0.6 * pp) * W * W / 8, Md = Math.max(MP2, Mq);
    out.verificacoes.push({ nome: "Degrau em chapa — flexão", item: ref("nbr6120", "Tabela 10, nota t") + "; NBR 8800:2024 (expressão da 2008), 5.4 (seção retangular cheia: MRd = Z·fy/γa1 ≤ 1,5·W·fy/γa1)", passos: [
      { rotulo: "Carga concentrada (nota t) e distribuída — a pior, separadas", formula: "MP = 1,5·2,5·W/4; Mq = (1,5·q + 1,25·g)·p·W²/8", valor: "MP = " + br(MP2, 3) + " kN·m; Mq = " + br(Mq, 3) + " kN·m" },
      { rotulo: "Resistência (chapa plana sem dobra, largura = piso do degrau)", formula: "Z = p·t²/4", valor: "MRd = " + br(MRd2, 3) + " kN·m" }], resistencia: MRd2, solicitante: Md, unidade: "kN·m", razao: Md / MRd2, ok: Md <= MRd2 + 1e-9 });
    var Ich = pp * 1000 * Math.pow(tt * 1000, 3) / 12, dch = 1.5 * 1000 * Math.pow(W * 1000, 3) / (48 * E_() * Ich), dlch = Math.min(W * 1000 / 300, 6);
    out.verificacoes.push({ nome: "Degrau em chapa — flecha", item: ref("iso14122", "parte 3, 4.2.1 (1,5 kN em 100 × 100 mm; flecha < W/300 e ≤ 6 mm)"), passos: [{ rotulo: "δ = P·W³/(48·E·I), I = p·t³/12 (chapa plana sem dobra)", formula: "", valor: br(dch, 1) + " mm ≤ " + br(dlch, 1) + " mm" }], resistencia: dlch, solicitante: dch, unidade: "mm", razao: dch / dlch, ok: dch <= dlch + 1e-9, els: true, conferir: true });
    if (Md > MRd2 || dch > dlch) out.avisos.push("Degrau em chapa plana não passa: use chapa mais grossa, degrau com dobra (bocel) ou cantoneira de reforço por baixo");
    return out;
  }
  /* VIGA biapoiada da plataforma/passarela (faixa de influência) */
  function viga(sp) {
    var s = secao(sp.perfil), a = aco(sp.aco), L = num(sp.L, 3), b = num(sp.faixa, 1), out = { verificacoes: [], naoVerificados: [], avisos: [] };
    if (!s) { out.naoVerificados.push("não verificado: " + (sp.nome || "viga") + " — perfil \"" + sp.perfil + "\" sem propriedades"); return out; }
    var g = num(sp.gPiso, 0.6) * b + s.massa * 9.81 / 1000, q = num(sp.q, 3) * b, wd = GAMA.g * g + GAMA.q * q;
    var trav = sp.travadaPeloPiso ? (function () { var o = []; for (var x = 0.3; x < L; x += 0.3) o.push(r4(x)); return o; })() : [];
    var r = viaDim8800(sp.nome || "Viga", s, a, L, estacoesBiapoiada(L, wd, 0), { flambagem: { Lx: L, Ly: sp.travadaPeloPiso ? 0.3 : L, Lz: sp.travadaPeloPiso ? 0.3 : L }, travamentos: { mais: trav, menos: [] }, papel: "viga" });
    out.verificacoes.push({ nome: (sp.nome || "Viga") + " — cargas", item: GAMA.ref, passos: [{ rotulo: "Faixa de influência", formula: "b", valor: m2(b) }, { rotulo: "Cargas", formula: "g = gpiso·b + pp; q·b; wd = 1,25·g + 1,50·q", valor: "g = " + br(g, 3) + "; q = " + br(q, 3) + "; wd = " + br(wd, 3) + " kN/m; MSd = " + br(wd * L * L / 8, 2) + " kN·m" }], razao: 0, ok: true, info: true });
    if (r) { out.verificacoes = out.verificacoes.concat(resumir(sp.nome || "Viga", r)); out.avisos = out.avisos.concat(arr(r.avisos)); } else out.naoVerificados.push("não verificado: " + (sp.nome || "viga") + " — js/acodim8800.js ausente");
    out.verificacoes.push(verifFlecha((sp.nome || "Viga") + " — flecha", q, L, s.Ix, FLECHA.piso, FLECHA.ref));
    if (!sp.travadaPeloPiso) out.avisos.push((sp.nome || "Viga") + ": FLT com a mesa comprimida destravada no vão inteiro (premissa a favor da segurança)");
    return out;
  }
  /* CONSOLE em balanço (plataforma anelar / suporte de passarela): carga da faixa na ponta */
  function console_(sp) {
    var s = secao(sp.perfil), a = aco(sp.aco), L = num(sp.L, 1), out = { verificacoes: [], naoVerificados: [], avisos: [] };
    if (!s) { out.naoVerificados.push("não verificado: console — perfil \"" + sp.perfil + "\" sem propriedades"); return out; }
    var area = num(sp.area, L * 1.5), g = num(sp.gPiso, 0.6) * area + s.massa * 9.81 / 1000 * L + num(sp.gGuarda, 0.25) * num(sp.espac, 1.5), q = num(sp.q, 3) * area;
    var Fd = GAMA.g * g + GAMA.q * q, est = [];
    /* metade da carga distribuída ao longo do console e metade na ponta (envoltória simples, a favor da segurança);
       xr = distância até a ponta: M = Fd·xr²/(4L) + Fd·xr/2 (tração em cima → Mz negativo); V = Fd·xr/(2L) + Fd/2 */
    for (var i = 0; i <= 8; i++) { var x = L * i / 8, xr = L - x; est.push({ x: x, N: 0, Vy: -(Fd * xr / (2 * L) + Fd / 2), Mz: -(Fd * xr * xr / (4 * L) + Fd * xr / 2), comb: "ELU" }); }
    var r = viaDim8800("Console", s, a, L, est, { flambagem: { Lx: 2 * L, Ly: 2 * L, Lz: 2 * L }, travamentos: { mais: [], menos: [] }, papel: "viga", cb: 1 });
    out.verificacoes.push({ nome: "Console — cargas", item: GAMA.ref, passos: [{ rotulo: "Área de piso por console", formula: "A", valor: br(area, 2) + " m²" }, { rotulo: "Força de cálculo", formula: "Fd = 1,25·g + 1,50·q (metade distribuída, metade na ponta)", valor: br(Fd, 2) + " kN; MSd = " + br(Fd / 2 * L / 2 + Fd / 2 * L, 2) + " kN·m no engaste" }], razao: 0, ok: true, info: true });
    if (r) { out.verificacoes = out.verificacoes.concat(resumir("Console", r)); out.avisos = out.avisos.concat(arr(r.avisos)); }
    out.avisos.push("Console em balanço: FLT com Lb = 2·L e Cb = 1 (balanço livre na ponta — premissa a favor da segurança)");
    out.naoVerificados.push("não verificado: ligação do console no costado/estrutura (solda, chapa de reforço e a parede do equipamento) — detalhar com o projeto do equipamento");
    return out;
  }
  /* MONTANTE do guarda-corpo: balanço com a força da Tabela 12 a 1,1 m; ligação da base por filete em volta do tubo */
  function montante(sp) {
    var s = secao(sp.perfil), a = aco(sp.aco), fg = forcaGuarda(sp.uso), H = 1.1, esp = num(sp.espac, 1.2), out = { verificacoes: [], naoVerificados: [], avisos: [] };
    if (!s) { out.naoVerificados.push("não verificado: montante — perfil \"" + sp.perfil + "\" sem propriedades"); return out; }
    H = fg.altura || 1.1;
    var F = fg.f * esp, Fd = GAMA.q * F, Md = Fd * H, est = [];
    for (var i = 0; i <= 6; i++) { var x = H * i / 6; est.push({ x: x, N: 0, Vy: Fd, Mz: Fd * (H - x), comb: "ELU" }); }
    var r = viaDim8800("Montante", s, a, H, est, { flambagem: { Lx: 2 * H, Ly: 2 * H, Lz: 2 * H }, travamentos: { mais: [], menos: [] }, papel: "viga", cb: 1 });
    out.verificacoes.push({ nome: "Montante — força do guarda-corpo", item: fg.ref, passos: [{ rotulo: "Força horizontal (" + fg.rotulo + ")", formula: "F = f·s", valor: br(fg.f, 2) + " kN/m × " + m2(esp) + " = " + br(F, 2) + " kN a " + m2(H) }, { rotulo: "Momento na base", formula: "MSd = 1,5·F·h", valor: br(Md, 3) + " kN·m" }], razao: 0, ok: true, info: true });
    if (r) { out.verificacoes = out.verificacoes.concat(resumir("Montante", r)); out.avisos = out.avisos.concat(arr(r.avisos)); }
    /* solda de filete em volta do tubo (circular) ou do retangular: linha */
    var M = Mat(), el = M && M.ELETRODOS ? M.ELETRODOS.filter(function (x) { return x.id === "E70XX"; })[0] : null, fw = el ? el.fw : 485, gw2 = M && M.GAMA ? M.GAMA.w2 : 1.35;
    /* o cordão no CONTORNO do perfil: tubo redondo (círculo), tubo retangular (b × h) e seção aberta U/I (bf × d — o
       filete corre por fora das mesas e dos dois lados da alma; aproximado pelo retângulo bf × d, sem o miolo) */
    var perna = num(sp.perna, 6), aG = 0.707 * perna, aberta = s.forma === "U" || s.forma === "I", D, Bw, Sw, Aw;
    if (s.forma === "tubo-circ") { D = s.D || 48; Sw = Math.PI * D * D / 4 * aG; Aw = Math.PI * D * aG; }
    else if (aberta) { D = s.d; Bw = s.bf; Sw = (Bw * D + D * D / 3) * aG * 0.5 + 2 * (num(s.h, D - 2 * s.tf) * num(s.h, D - 2 * s.tf) / 6) * aG * 0.5; Aw = (2 * Bw + 2 * num(s.h, D - 2 * s.tf)) * aG; }
    else { D = s.h || s.d || 48; Bw = s.b || D; Sw = (Bw * D + D * D / 3) * aG; Aw = 2 * (Bw + D) * aG; }
    var B = Bw;
    var sig = Md * 1e6 / Sw, tau = Fd * 1000 / Aw, res = Math.sqrt(sig * sig + tau * tau), Rd = 0.60 * fw / gw2;
    out.verificacoes.push({ nome: "Montante — solda da base (" + (aberta ? "filete no contorno da seção aberta" : "filete em volta") + ")", item: "NBR 8800:2024 (expressão da 2008), 6.2.5.1 (metal da solda: 0,60·fw/γw2) — método da solda como linha", passos: [
      { rotulo: "Filete", formula: "a = 0,707·perna", valor: "perna " + br(perna, 0) + " mm; a = " + br(aG, 2) + " mm; eletrodo E70XX (fw = " + fw + " MPa)" },
      { rotulo: "Tensões", formula: s.forma === "tubo-circ" ? "Sw = π·D²·a/4; Aw = π·D·a" : (aberta ? "seção aberta (bf × d): metade do Sw do contorno retangular + as duas linhas da alma (h²/6), a favor da segurança" : "Sw = (B·D + D²/3)·a; Aw = 2(B + D)·a"), valor: "σ = " + br(sig, 1) + " MPa; τ = " + br(tau, 1) + " MPa; resultante " + br(res, 1) + " MPa" },
      { rotulo: "Resistência", formula: "0,60·fw/γw2", valor: br(Rd, 1) + " MPa" }], resistencia: Rd, solicitante: res, unidade: "MPa", razao: res / Rd, ok: res <= Rd + 1e-9 });
    out.naoVerificados.push("não verificado: chapa de base/chumbadores do montante quando a fixação for aparafusada (aqui: montante soldado na estrutura)");
    /* TRAVESSÃO SUPERIOR e INTERMEDIÁRIA entre montantes: a mesma força f (kN/m) da Tabela 12, viga biapoiada de vão s */
    var sc = sp.corrimao ? secao(sp.corrimao) : null;
    if (sc && D88()) {
      var Mt = GAMA.q * fg.f * esp * esp / 8, ft = D88().flexao(sc, aco(sp.aco), E_(), 77000, esp * 1000, 1, "x"), MRt = ft ? ft.MRd : 0;
      ["travessão superior", "travessa intermediária"].forEach(function (nm) {
        out.verificacoes.push({ nome: "Guarda-corpo — " + nm + " entre montantes", item: fg.ref + " (a mesma força distribuída); NBR 8800:2024 (expressão da 2008), 5.4", passos: [{ rotulo: "Momento (vão entre montantes)", formula: "MSd = 1,5·f·s²/8", valor: br(Mt, 3) + " kN·m (f = " + br(fg.f, 2) + " kN/m, s = " + m2(esp) + ")" }, { rotulo: "Resistência (" + (sc.nome || sp.corrimao) + ")", formula: "MRd (Anexo G)", valor: br(MRt, 3) + " kN·m" }], resistencia: MRt, solicitante: Mt, unidade: "kN·m", razao: Mt / MRt, ok: Mt <= MRt + 1e-9 });
      });
    } else out.naoVerificados.push("não verificado: travessão superior e intermediária — perfil do corrimão não informado (CRÍTICO)");
    return out;
  }
  /* PISO: chapa (faixa de 1 m) ou grade (barras portantes) no vão entre vigas */
  function piso(sp) {
    var a = aco(sp.aco || "ASTM A36"), L = num(sp.vao, 1), q = num(sp.q, 3), out = { verificacoes: [], naoVerificados: [], avisos: [] }, g1 = ga1();
    if (sp.material === "grade") {
      /* a TABELA DO FABRICANTE (catálogo industrial) manda quando a grade está nela; o cálculo pelas barras fica de conferência */
      var C = CatInd(), gc = gradeDoCatalogo(sp);
      if (C && gc && gc.temTabela && C.cargaGrade) {
        var tb = null; try { tb = C.cargaGrade(gc.tipo.id, L * 1000); } catch (e) { tb = null; }
        if (tb && tb.ok && fin(tb.cargaUniforme)) {
          var qadm = tb.cargaUniforme * 9.80665 / 1000, fonte = tb.fonte || {};
          out.verificacoes.push({ nome: "Piso em grade — tabela do fabricante (" + (tb.fabricante || nomeFab(gc.tipo)) + " " + (gc.tipo.codigoFabricante || gc.tipo.id) + ")", item: (fonte.titulo || "catálogo do fabricante") + (fonte.pagina ? ", " + fonte.pagina : "") + (fonte.url ? " — " + fonte.url : ""), passos: [
            { rotulo: "Carga uniforme admissível no vão de " + br(L * 1000, 0) + " mm (interpolada na tabela; não extrapola)", formula: "tabela", valor: br(tb.cargaUniforme, 0) + " kgf/m² = " + br(qadm, 2) + " kN/m²" },
            { rotulo: "Sobrecarga de projeto (característica)", formula: "q", valor: br(q, 2) + " kN/m²" }, { rotulo: "Critério do fabricante", formula: "", valor: String(tb.criterio || "").slice(0, 160) }], resistencia: qadm, solicitante: q, unidade: "kN/m²", razao: q / qadm, ok: q <= qadm + 1e-9, conferir: !!tb.conferir });
        } else if (tb && !tb.ok) out.avisos.push("Grade " + (gc.tipo.codigoFabricante || gc.tipo.id) + ": " + tb.motivo);
      } else if (C) out.avisos.push("A grade " + br(num(sp.gradeH, 0.025) * 1000, 0) + " × " + br(num(sp.gradeT, 0.003) * 1000, 0) + " mm a " + br(num(sp.gradeA, 0.03) * 1000, 0) + " × " + br(num(sp.gradeB, 0.1) * 1000, 0) + " mm não está nas tabelas de vão × carga do catálogo — confira com o fabricante");
      var h = num(sp.gradeH, 0.025), t = num(sp.gradeT, 0.003), aa = num(sp.gradeA, 0.03), Wb = t * 1000 * Math.pow(h * 1000, 2) / 6, Ib = t * 1000 * Math.pow(h * 1000, 3) / 12, kg = pisoKgM2("grade", sp).kgm2;
      var wd = (GAMA.q * q + GAMA.g * kg * 9.81 / 1000) * aa, Md = wd * L * L / 8, MRd = Wb * a.fy / g1 / 1e6;
      out.verificacoes.push({ nome: "Piso em grade — barra portante", item: "NBR 8800:2024 (expressão da 2008), 5.4 (seção retangular, regime elástico); sobrecarga " + ref("nbr6120", "Tabela 10"), passos: [
        { rotulo: "Carga por barra (faixa a)", formula: "wd = (1,5·q + 1,25·g)·a", valor: br(wd, 3) + " kN/m" }, { rotulo: "Momento", formula: "MSd = wd·L²/8", valor: br(Md, 4) + " kN·m" }, { rotulo: "Resistência", formula: "MRd = (t·h²/6)·fy/γa1", valor: br(MRd, 4) + " kN·m" }], resistencia: MRd, solicitante: Md, unidade: "kN·m", razao: Md / MRd, ok: Md <= MRd + 1e-9, conferir: true });
      var dq = 5 * q * aa * Math.pow(L * 1000, 4) / (384 * E_() * Ib), dl = Math.min(L * 1000 / 200, 10);
      out.verificacoes.push({ nome: "Piso em grade — flecha", item: "limite L/200 e 10 mm adotado (premissa usual de fabricante — conferir na tabela)", passos: [{ rotulo: "δ = 5·q·a·L⁴/(384·E·I)", formula: "", valor: br(dq, 1) + " mm ≤ " + br(dl, 1) + " mm" }], resistencia: dl, solicitante: dq, unidade: "mm", razao: dq / dl, ok: dq <= dl, els: true, conferir: true });
      out.avisos.push("Grade: o cálculo pelas barras portantes é de conferência; o vão × carga do fabricante manda (pedir a tabela da grade escolhida)");
      return out;
    }
    if (sp.material === "expandida" || sp.material === "perfurada") { out.naoVerificados.push("não verificado: piso em chapa " + sp.material + " — usar a tabela de vão × carga do fabricante"); return out; }
    var tt = num(sp.t, 0.00635), Z = 1000 * Math.pow(tt * 1000, 2) / 4, Ic = 1000 * Math.pow(tt * 1000, 3) / 12, MRd2 = Z * a.fy / g1 / 1e6, wd2 = GAMA.q * q + GAMA.g * tt * 78.5, Md2 = wd2 * L * L / 8;
    out.verificacoes.push({ nome: "Piso em chapa — flexão (faixa de 1 m, biapoiada)", item: "NBR 8800:2024 (expressão da 2008), 5.4; sobrecarga " + ref("nbr6120", "Tabela 10"), passos: [{ rotulo: "Momento", formula: "MSd = (1,5·q + 1,25·g)·L²/8", valor: br(Md2, 3) + " kN·m/m" }, { rotulo: "Resistência", formula: "MRd = (t²/4)·fy/γa1 por metro", valor: br(MRd2, 3) + " kN·m/m" }], resistencia: MRd2, solicitante: Md2, unidade: "kN·m/m", razao: Md2 / MRd2, ok: Md2 <= MRd2 + 1e-9 });
    var d2 = 5 * q * Math.pow(L * 1000, 4) / (384 * E_() * Ic), dl2 = L * 1000 / 200;
    out.verificacoes.push({ nome: "Piso em chapa — flecha", item: "limite L/200 adotado (premissa — conferir no projeto)", passos: [{ rotulo: "δ = 5·q·L⁴/(384·E·I)", formula: "", valor: br(d2, 1) + " mm ≤ " + br(dl2, 1) + " mm" }], resistencia: dl2, solicitante: d2, unidade: "mm", razao: d2 / dl2, ok: d2 <= dl2, els: true, conferir: true });
    return out;
  }
  /* CORRIMÃO DE PAREDE: o tubo entre suportes e o suporte em balanço com 900 N em qualquer ponto (NPT 011:2024, 5.8.3.2) */
  function corrimao(sp) {
    var s = secao(sp.perfil), a = aco(sp.aco), out = { verificacoes: [], naoVerificados: [], avisos: [] }, P = 0.9, g1 = ga1(), D = D88();
    if (!s || !D) { out.naoVerificados.push("não verificado: corrimão — perfil \"" + sp.perfil + "\" sem propriedades"); return out; }
    var L = num(sp.vao, 1.2), Md = GAMA.q * P * L / 4, f = D.flexao(s, a, E_(), 77000, L * 1000, 1, "x"), MRd = f ? f.MRd : 0;
    out.verificacoes.push({ nome: "Corrimão — tubo entre suportes", item: "NPT 011:2024 (CBPMPR), 5.8.3.2 (900 N em qualquer ponto); NBR 8800:2024 (expressão da 2008), 5.4", passos: [{ rotulo: "Momento (carga no meio do vão entre suportes)", formula: "MSd = 1,5·0,9·L/4", valor: br(Md, 3) + " kN·m (L = " + m2(L) + ")" }, { rotulo: "Resistência do tubo", formula: "MRd (Anexo G)", valor: br(MRd, 3) + " kN·m" }], resistencia: MRd, solicitante: Md, unidade: "kN·m", razao: Md / MRd, ok: Md <= MRd + 1e-9 });
    var d = num(sp.suporteD, 0.016), b = num(sp.braco, 0.1), Ms = GAMA.q * P * b, Zs = Math.pow(d * 1000, 3) / 6, MRs = Math.min(Zs, 1.5 * Math.PI * Math.pow(d * 1000, 3) / 32) * a.fy / g1 / 1e6;
    out.verificacoes.push({ nome: "Corrimão — suporte em balanço (barra redonda)", item: "NPT 011:2024, 5.8.3.2; NBR 8800:2024 (expressão da 2008), 5.4 (seção circular cheia)", passos: [{ rotulo: "Momento no engaste da parede", formula: "MSd = 1,5·0,9·braço", valor: br(Ms, 3) + " kN·m (braço " + br(b * 100, 1) + " cm)" }, { rotulo: "Resistência", formula: "Z = d³/6", valor: br(MRs, 3) + " kN·m (Ø " + br(d * 1000, 0) + " mm)" }], resistencia: MRs, solicitante: Ms, unidade: "kN·m", razao: Ms / MRs, ok: Ms <= MRs + 1e-9 });
    return out;
  }
  /* MARINHEIRO: degrau (barra redonda biapoiada nos montantes) e montante (barra chata entre fixações) */
  function marinheiro(sp) {
    var a = aco(sp.aco || "ASTM A36"), W = num(sp.largura, 0.45), d = num(sp.diamDegrau, 0.025), P = Math.max(2.5, num(sp.P, 2.5)), out = { verificacoes: [], naoVerificados: [], avisos: [] }, g1 = ga1();
    var quad = sp.secaoDegrau === "quadrada", Z = quad ? Math.pow(d * 1000, 3) / 4 : Math.pow(d * 1000, 3) / 6, Wd = quad ? Math.pow(d * 1000, 3) / 6 : Math.PI * Math.pow(d * 1000, 3) / 32, MRd = Math.min(Z, 1.5 * Wd) * a.fy / g1 / 1e6, Md = GAMA.q * P * W / 4;
    out.verificacoes.push({ nome: "Marinheiro — degrau (barra " + (quad ? "quadrada" : "redonda") + ")", item: ref("nbr6120", "Tabela 10, nota t (degrau isolado: 2,5 kN na posição mais desfavorável)") + "; a ISO 14122-4 pede 1,5 kN (menos: a NBR governa); NBR 8800:2024 (expressão da 2008), 5.4", passos: [
      { rotulo: "Momento", formula: "MSd = 1,5·P·W/4", valor: br(Md, 3) + " kN·m (P = " + br(P, 1) + " kN, W = " + m2(W) + ")" }, { rotulo: "Resistência", formula: quad ? "Z = d³/4 ≤ 1,5·W" : "Z = d³/6 ≤ 1,5·W", valor: "MRd = " + br(MRd, 3) + " kN·m" }], resistencia: MRd, solicitante: Md, unidade: "kN·m", razao: Md / MRd, ok: Md <= MRd + 1e-9, conferir: true });
    var b = num(sp.montB, 0.0635), t = num(sp.montT, 0.0095), Lf = num(sp.espFixacao, 2.0);
    var Wz = t * 1000 * Math.pow(b * 1000, 2) / 6, Mz = GAMA.q * P * Lf / 4, MRdz = Math.min(t * 1000 * Math.pow(b * 1000, 2) / 4, 1.5 * Wz) * a.fy / g1 / 1e6;
    out.verificacoes.push({ nome: "Marinheiro — montante entre fixações (força do degrau para fora da parede)", item: "NBR 8800:2024 (expressão da 2008), 5.4 (barra chata no eixo forte); fixação a cada " + m2(Lf) + " (premissa)", passos: [
      { rotulo: "Momento", formula: "MSd = 1,5·P·Lf/4 (P no meio do vão entre fixações)", valor: br(Mz, 3) + " kN·m" }, { rotulo: "Resistência (barra " + br(b * 1000, 1) + " × " + br(t * 1000, 1) + " mm)", formula: "Z = t·b²/4", valor: br(MRdz, 3) + " kN·m" }], resistencia: MRdz, solicitante: Mz, unidade: "kN·m", razao: Mz / MRdz, ok: Mz <= MRdz + 1e-9, conferir: true });
    out.naoVerificados.push("não verificado: suportes (orelhas) e chumbadores da escada de marinheiro na estrutura/equipamento — detalhar com a parede onde fixa");
    out.naoVerificados.push("não verificado: gaiola (arcos e barras verticais) — elemento de proteção sem carga de projeto definida no texto da NR-12");
    return out;
  }

  /* spec = { itens: [{ tipo: "longarina"|"degrau"|"viga"|"console"|"montante"|"piso"|"marinheiro", ... }], carga: {uso, q}, guarda: {uso} } */
  function dimensionar(spec) {
    spec = spec || {};
    var vs = [], nv = [], av = [], crit = [], F = { longarina: longarina, degrau: degrau, viga: viga, console: console_, montante: montante, piso: piso, marinheiro: marinheiro, corrimao: corrimao };
    arr(spec.itens).forEach(function (it) {
      var f = F[it.tipo]; if (!f) { nv.push("não verificado: " + it.tipo); return; }
      if (it.q === null) { crit.push("não verificado: " + it.tipo + " — sobrecarga não informada (CRÍTICO)"); return; }
      var r; try { r = f(it); } catch (e) { crit.push("não verificado: " + it.tipo + " — erro no cálculo (" + (e && e.message ? e.message : e) + ")"); return; }
      vs = vs.concat(r.verificacoes); nv = nv.concat(r.naoVerificados); av = av.concat(r.avisos);
      /* item sem NENHUMA verificação calculada (perfil fora do catálogo, piso sem tabela…) = verificação crítica não feita */
      if (!r.verificacoes.filter(function (v) { return !v.info; }).length) crit.push("não verificado: " + (it.nome || it.tipo) + " — nenhuma verificação calculada (CRÍTICO): " + (r.naoVerificados[0] || "sem dado"));
      r.naoVerificados.forEach(function (t) { if (/CRÍTICO/.test(t)) crit.push(t); });
    });
    arr(spec.naoVerificados).forEach(function (t) { nv.push(t); });
    arr(spec.externas).forEach(function (v) { vs.push(v); });
    arr(spec.criticos).forEach(function (t) { crit.push(t); });
    arr(spec.avisos).forEach(function (t) { av.unshift(t); });
    var calc = vs.filter(function (v) { return !v.info; }), razao = calc.reduce(function (m, v) { return Math.max(m, num(v.razao, 0)); }, 0), falhas = calc.filter(function (v) { return v.ok === false; });
    var gov = calc.slice().sort(function (a, b) { return num(b.razao, 0) - num(a.razao, 0); })[0];
    var unicos = []; av.forEach(function (a) { if (unicos.indexOf(a) < 0) unicos.push(a); });
    crit.forEach(function (t) { if (nv.indexOf(t) < 0) nv.unshift(t); });
    var status = falhas.length ? "reprovado" : (crit.length || !calc.length ? "incompleto" : "aprovado");
    return { ok: true, aprovado: status === "aprovado", status: status, criticos: crit, razao: razao, governante: gov ? gov.nome : null, falhas: falhas.length, verificacoes: vs, naoVerificados: nv, avisos: unicos,
      resumo: (crit.length && !falhas.length ? "INCOMPLETO — " + crit.length + " verificação(ões) crítica(s) não feita(s); " : "") + (calc.length ? (falhas.length ? falhas.length + " verificação(ões) não passam" : "todas as " + calc.length + " verificações passam") + " — maior aproveitamento " + br(razao * 100, 0) + " %" + (gov ? " (" + gov.nome + ")" : "") : "sem verificação") + (nv.length ? "; " + nv.length + " item(ns) não verificado(s)" : "") };
  }

  /* ============================================================ MEMORIAL */
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function t(s) { return esc(String(s == null ? "" : s).replace(/\b(undefined|NaN|null|Infinity)\b/g, "[valor indefinido]")); }
  function tab(cab, linhas) { return '<table class="t"><thead><tr>' + cab.map(function (c) { return "<th>" + c + "</th>"; }).join("") + "</tr></thead><tbody>" + linhas.map(function (l) { return "<tr" + (l.cls ? ' class="' + l.cls + '"' : "") + ">" + (l.c || l).map(function (x) { return "<td>" + (x == null ? "" : x) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table>"; }
  var CSS = "body{font-family:Arial,Helvetica,sans-serif;color:#1d2733;font-size:11pt;margin:24px}h1{font-size:16pt;margin:0 0 4px}h2{font-size:13pt;border-bottom:2px solid #1d2733;margin:22px 0 8px;padding-bottom:3px}h3{font-size:11pt;margin:14px 0 4px}" +
    ".t{border-collapse:collapse;width:100%;margin:6px 0 10px;font-size:9.5pt}.t th,.t td{border:1px solid #9aa5b1;padding:3px 5px;text-align:left;vertical-align:top}.t th{background:#e8edf2}tr.falha td{background:#fde8e8}tr.rec td{background:#fff6e0}" +
    ".ok{color:#15803d;font-weight:bold}.falha{color:#b91c1c;font-weight:bold}.caixa{border:1px solid #9aa5b1;padding:8px 10px;margin:8px 0;background:#f6f8fa}.alerta{border-color:#b91c1c;background:#fdf2f2}.ph{color:#b91c1c}.muted{color:#56606b;font-size:9.5pt}";
  /* d = { titulo, tipo, perfil, par, conformidade (verificar), dimensionamento (dimensionar), quantitativo: { pecas:[{papel, n, massa, area}], massa, area }, escolha } */
  function memorial(d, op) {
    d = d || {}; op = op || {};
    var v = d.conformidade, dm = d.dimensionamento, qt = d.quantitativo || {}, secoes = [], h = "", av = [];
    var titulo = "Memorial de cálculo — " + (d.titulo || "acesso industrial em aço");
    h += "<h1>" + t(titulo) + "</h1><p class=\"muted\">" + t(op.obra || "[OBRA]") + " · " + t(op.responsavel || "[RESPONSÁVEL TÉCNICO — CREA]") + " · " + t(op.data || new Date().toISOString().slice(0, 10)) + "</p>";
    secoes.push("objeto"); h += "<h2>1. Objeto e premissas</h2><p>" + t(d.descricao || d.titulo || "") + ".</p>";
    h += "<ul><li>Perfil de norma adotado: <b>" + t((PERFIS[d.perfil] || {}).rotulo || d.perfil || "—") + "</b>.</li><li>Aço: " + t((d.par && d.par.aco) || "ASTM A36") + " (propriedades do js/acomateriais.js). Unidades SI; vírgula decimal.</li>" +
      "<li>Coeficientes: " + t(GAMA.ref) + "; γa1 = " + br(ga1(), 2) + ".</li><li>As peças vêm do modelo (a mesma geometria do BIM e do quantitativo).</li></ul>";
    if (d.escolha) h += caixa("Escolha do meio de acesso: <b>" + t(d.escolha.tipo) + "</b> — " + t(d.escolha.motivo) + (d.escolha.angulo != null ? " (ângulo " + br(d.escolha.angulo, 1) + "°)" : ""));
    if (d.escopo) { secoes.push("escopo"); h += caixa("<b>Escopo desta verificação.</b> Verifica: " + t(arr(d.escopo.verifica).join("; ")) + ".<br><b>Não verifica:</b> " + t(arr(d.escopo.naoVerifica).join("; ")) + ".", true); }
    secoes.push("normas"); h += "<h2>2. Normas e edições</h2>" + tab(["Norma", "Título", "Edição", "De onde veio o texto"], Object.keys(NORMAS).map(function (k) { var n = NORMAS[k]; return [t(n.sigla), t(n.titulo), t(n.edicao), t(n.fonte) + (n.lido ? "" : ' <span class="ph">(conferir no texto)</span>')]; }));
    if (v && v.avisos) v.avisos.forEach(function (a) { h += caixa(t(a)); });
    secoes.push("conformidade"); h += "<h2>3. Conformidade item a item</h2>";
    if (v && v.ok) {
      h += "<p><b>" + t(v.resumo) + "</b></p>" + tab(["Requisito", "Norma / item", "Limite", "Projeto", "Situação", "Correção"], v.itens.map(function (i) {
        return { cls: i.ok === false ? (i.sev === "nc" ? "falha" : "rec") : "", c: [t(i.requisito) + (i.nota ? '<br><span class="muted">' + t(i.nota) + "</span>" : ""), t(i.norma) + (i.conferir ? ' <span class="ph">[conferir]</span>' : ""), t(i.limite), t(i.valorTexto), i.ok == null ? t(i.situacao) : (i.ok ? '<span class="ok">atende</span>' : '<span class="falha">' + t(i.situacao) + "</span>"), t(i.correcao || "")] };
      }));
    } else h += caixa("Conformidade não avaliada.", true);
    secoes.push("verificacoes"); h += "<h2>4. Verificações estruturais</h2>";
    if (dm && dm.ok) {
      h += "<p><b>" + t(dm.resumo) + "</b></p>";
      dm.verificacoes.forEach(function (x) {
        h += "<h3>" + t(x.nome) + (x.info ? "" : " — " + (x.ok ? '<span class="ok">atende</span>' : '<span class="falha">não atende</span>') + " (" + br(num(x.razao, 0) * 100, 0) + " %)") + "</h3><p class=\"muted\">" + t(x.item) + (x.conferir ? ' <span class="ph">[conferir]</span>' : "") + "</p>";
        h += tab(["Passo", "Fórmula", "Valor"], arr(x.passos).map(function (p) { return [t(p.rotulo), t(p.formula || ""), t(p.valor || "")]; }));
      });
      if (dm.avisos.length) h += "<h3>Premissas e avisos do cálculo</h3><ul>" + dm.avisos.map(function (a) { return "<li>" + t(a) + "</li>"; }).join("") + "</ul>";
    } else h += caixa("Dimensionamento não executado.", true);
    secoes.push("nao-verificado"); h += "<h2>5. Itens não verificados</h2>";
    var nvs = arr(dm && dm.naoVerificados).concat(arr(v && v.naoVerificados).map(function (i) { return "não verificado: " + i.requisito + " (falta o dado)"; }));
    h += nvs.length ? "<ul>" + nvs.map(function (x) { return "<li>" + t(x) + "</li>"; }).join("") + "</ul>" : "<p>Nenhum.</p>";
    secoes.push("quantitativo"); h += "<h2>6. Pesos, áreas de pintura e lista de materiais</h2>";
    if (arr(qt.pecas).length) h += tab(["Peça", "Qtd.", "Peso (kg)", "Área de pintura (m²)"], qt.pecas.map(function (p) { return [t(p.papel), String(p.n), br(p.massa, 1), br(p.area, 2)]; }).concat([["<b>Total</b>", "", "<b>" + br(num(qt.massa, 0), 1) + "</b>", "<b>" + br(num(qt.area, 0), 2) + "</b>"]]));
    else h += "<p>Sem peças.</p>";
    var co = cores(d.uso);
    secoes.push("pintura"); h += "<h2>7. Cor de segurança e proteção contra corrosão</h2><ul><li>Cor: " + t(co.cor) + (co.munsell ? " (Munsell " + t(co.munsell) + ")" : "") + " — " + t(co.ref) + (co.conferir ? ' <span class="ph">[conferir]</span>' : "") + ".</li><li>Proteção: " + t(co.sistema) + " — " + t(co.sistemaRef) + ".</li><li class=\"muted\">Origem: " + t(co.origem) + ".</li></ul>";
    var pend = arr(v && v.conferir).map(function (i) { return i.norma + ": " + i.requisito; });
    secoes.push("pendencias"); h += "<h2>8. Pendências de conferência de norma</h2>" + (pend.length ? "<ul>" + pend.map(function (x) { return "<li>" + t(x) + "</li>"; }).join("") + "</ul>" : "<p>Nenhuma.</p>");
    if (v && !v.aprovado) av.push(v.naoConformes.length + " não conformidade(s) de norma");
    if (dm && !dm.aprovado) av.push(dm.falhas + " verificação(ões) estrutural(is) não passam");
    var html = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>' + t(titulo) + "</title><style>" + CSS + "</style></head><body>" + h + "</body></html>";
    return { ok: true, html: html, titulo: titulo, secoes: secoes, avisos: av };
  }
  function caixa(h, alerta) { return '<div class="caixa' + (alerta ? " alerta" : "") + '">' + h + "</div>"; }

  var AcoAcessos = {
    NORMAS: NORMAS, PERFIS: PERFIS, REQ: REQ, REGRA_DEG: REGRA_DEG, USOS_GUARDA: USOS_GUARDA, USOS_PISO: USOS_PISO, GAMA: GAMA, FLECHA: FLECHA,
    ref: ref, requisitos: requisitos, ler: ler, verificar: verificar, degraus: degraus, escolher: escolher,
    forcaGuarda: forcaGuarda, sobrecarga: sobrecarga, pisoKgM2: pisoKgM2, cores: cores,
    dimensionar: dimensionar, corrimao: corrimao, espessuraDegrau: espessuraDegrau, CHAPAS_DEGRAU: CHAPAS_DEGRAU, longarina: longarina, degrau: degrau, viga: viga, console: console_, montante: montante, piso: piso, marinheiro: marinheiro,
    memorial: memorial
  };
  global.AcoAcessos = AcoAcessos;
  if (typeof module !== "undefined" && module.exports) module.exports = AcoAcessos;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
