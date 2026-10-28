/* =====================================================================
 * andaime.js — ANDAIME TUBO-ROLL PARAMÉTRICO (motor PURO, ES5, sem DOM,
 * Node-testável). Frente "Andaimes", 26/10/2026 (etapas E1 + E2).
 *
 * Para que serve (Rogério, 26/10/2026): gerar o PROJETO DE ANDAIME que a
 * engenharia aprova para o trabalho em altura — o modelo montado, a lista de
 * locação, o plano de montagem, o cálculo. NÃO é para fabricar nem orçar.
 *
 * DUAS CAMADAS (⚠ não misture):
 *   1. Andaime.montar(par)  → modelo ABSTRATO em coordenadas locais (nós,
 *      barras comerciais, conexões, pisos, rodapés, bases, ancoragens,
 *      acessos, medidas). É a ÚNICA fonte de quantidade: o 3D, a lista de
 *      locação, o plano de montagem, o cálculo e o memorial leem dele.
 *      Nunca dois cálculos de quantidade.
 *   2. registrarTipo("andaime") nas Peças prontas (js/metalprontas.js): converte o
 *      modelo em caixas do editor. Ganha de graça polilinha + Enter,
 *      contorno fechado, prévia, um lote só (um Ctrl+Z), componente único.
 *
 * ⚠ AS PEÇAS DO ANDAIME NÃO SÃO AÇO FABRICADO. Toda caixa leva
 *   `caixa.andaime = { peca, cod }` e js/metalfab.js (pecasFab),
 *   js/metalorc.js (uidsDoModelo) pulam quem tem a marca. Sem isso o tubo de
 *   locação virava "aço fabricado por kg" no orçamento: o andaime aparecia
 *   como COMPRA de estrutura (dinheiro errado). Prancha e rodapé são MADEIRA
 *   (BimArq.vigaPerfil, material madeira) — nunca tipo "metal" (pegaria 7 850 kg/m³).
 *
 * VALOR SEM NORMA BRASILEIRA = parâmetro editável "confirmar pelo
 * responsável técnico" (confirmarRT), com a fonte secundária ao lado — nunca
 * escrito como regra da norma. Valor da NR-18 = regra (a verificação reprova).
 * Sem fonte → null + aviso; nenhum número é chutado. Fontes em
 * docs/andaime/catalogo-andaime.json (fonteId F01…).
 *
 * CONVENÇÕES: metros e kg. Eixos do BIM: x e z em planta, y para cima.
 * "esquerda" do sentido de traçado = (u.z, −u.x): com o traçado em +x, a esquerda
 * é −z (a mesma do ladoRetorno do guarda-corpo, js/metalacessos.js). Em contorno
 * fechado, "fora" é o lado de fora do polígono. y = 0 é o APOIO (topo do calço):
 * com `calco` o conjunto inteiro sobe a espessura do calço ao ser criado
 * (gerar), de modo que `altura` seja a altura do piso acima do apoio.
 *
 * API
 *   Andaime.PADRAO / Andaime.padrao()        parâmetros padrão
 *   Andaime.normalizar(par)                  padrão + o que veio, números lidos
 *   Andaime.validar(par)                     null | texto PT-BR (diz o que fazer)
 *   Andaime.montar(par)                      { ok, erro?, avisos[], niveis[], estacoes[], barras[],
 *                                              conexoes[], pranchas[], rodapes[], bases[], calcos[],
 *                                              ancoragens[], acessos[], tela:{area}, medidas{} }
 *   Andaime.pecasLocacao(modelo)             lista agregada do pedido de locação
 *   Andaime.CATALOGO                         tubo + peças com fonteId (nada sem fonte)
 *   Andaime.PARAMETROS_RT                    os valores "confirmar RT" e a fonte secundária
 * Teste: node tools/test-andaime.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function MP() { return dep("MetalProntas", "./metalprontas.js"); }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : d; }
  function r3(v) { return Math.round(v * 1e3) / 1e3; }
  function r4(v) { return Math.round(v * 1e4) / 1e4; }
  function brf(v, c) { c = c == null ? 2 : c; return (Math.round(num(v, 0) * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function hyp(a, b) { return Math.sqrt(a * a + b * b); }
  function dot2(a, b) { return a[0] * b[0] + a[1] * b[1]; }
  /* menor distância entre dois segmentos 3D (Ericson, "Real-Time Collision Detection" 5.1.9) */
  function segDist(p1, q1, p2, q2) {
    var d1 = [q1[0] - p1[0], q1[1] - p1[1], q1[2] - p1[2]], d2 = [q2[0] - p2[0], q2[1] - p2[1], q2[2] - p2[2]], r = [p1[0] - p2[0], p1[1] - p2[1], p1[2] - p2[2]];
    function dt(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
    var a = dt(d1, d1), e = dt(d2, d2), f = dt(d2, r), sN, tN, c = dt(d1, r), b = dt(d1, d2), den = a * e - b * b;
    sN = den > 1e-12 ? Math.max(0, Math.min(1, (b * f - c * e) / den)) : 0;
    tN = e > 1e-12 ? (b * sN + f) / e : 0;
    if (tN < 0) { tN = 0; sN = a > 1e-12 ? Math.max(0, Math.min(1, -c / a)) : 0; } else if (tN > 1) { tN = 1; sN = a > 1e-12 ? Math.max(0, Math.min(1, (b - c) / a)) : 0; }
    var cx = p1[0] + d1[0] * sN - (p2[0] + d2[0] * tN), cy = p1[1] + d1[1] * sN - (p2[1] + d2[1] * tN), cz = p1[2] + d1[2] * sN - (p2[2] + d2[2] * tN);
    return Math.sqrt(cx * cx + cy * cy + cz * cz);
  }
  var GRAU = Math.PI / 180;

  /* ================================================================ CATÁLOGO
   * Copiado de docs/andaime/catalogo-andaime.json — só os itens usados, cada um com o fonteId.
   * peso null = SEM FONTE: conta 0 e entra em `avisos` ("peso de X sem fonte: não somado"). */
  var FONTES = {
    F01: { rotulo: "NR-18 (texto 2026, Portaria MTE 836/2026)", classe: "primaria", url: "https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/NR18atualizada2026I.pdf" },
    F04: { rotulo: "Orguel/Mecan — Ficha técnica do andaime fachadeiro (ago/2020)", classe: "primaria", url: "https://orguel.com.br/wp-content/uploads/2022/06/Ficha-Tecnica-Fachadeiro.pdf" },
    F05: { rotulo: "Orguel/Mecan — Catálogo Mecanflex (jul/2019)", classe: "primaria", url: "https://orguel.com.br/wp-content/uploads/2022/06/Catalogo-Mecanflex-2019.pdf" },
    F06: { rotulo: "Layher — Catálogo Allround ESP 2024 (edição do Peru)", classe: "primaria", url: "https://layher.pe/wp-content/uploads/2026/04/CatalogoAllround-ESP2024-1.pdf" },
    F07: { rotulo: "Andasa — Tubo equipado (AECweb)", classe: "primaria", url: "https://www.aecweb.com.br/produto/tubo-equipado/125214" },
    F08: { rotulo: "Andasa — Acessórios para andaimes (AECweb)", classe: "primaria", url: "https://www.aecweb.com.br/produto/acessorios-para-andaimes-andasa/125217" },
    F11: { rotulo: "Brastub — Braçadeira fixa (AECweb)", classe: "primaria", url: "https://www.aecweb.com.br/produto/bracadeira-fixa/43112" },
    F12: { rotulo: "Brastub — Braçadeira giratória (AECweb)", classe: "primaria", url: "https://www.aecweb.com.br/produto/bracadeira-giratoria/43113" },
    F13: { rotulo: "Brastub — Placa base ajustável (AECweb)", classe: "primaria", url: "https://www.aecweb.com.br/produto/placa-base-ajustavel/43114" },
    F14: { rotulo: "Brastub — Placa base fixa (AECweb)", classe: "primaria", url: "https://www.aecweb.com.br/produto/placa-base-fixa/43115" },
    F21: { rotulo: "Doughty Engineering (UK) — T25000 Sleeve Coupler", classe: "primaria", url: "https://www.doughty-engineering.co.uk/wp-content/uploads/Data-Sheets-PDF/T25000-Data-Sheet.pdf" },
    F22: { rotulo: "HSA Irlanda — Code of Practice for Access and Working Scaffolds (2007)", classe: "primaria", url: "https://consultation.hsa.ie/general-applications/20071211ScaffoldingCOP06.pdf" },
    F24: { rotulo: "squote.app — Independent tied scaffold (TG20; fonte secundária)", classe: "secundaria", url: "https://squote.app/knowledge/scaffolding/independent-tied-scaffold" },
    R1: { rotulo: "Apostilas de treinamento de montador e material de cálculo de empresa de andaimes (fonte secundária, 26/10/2026)", classe: "secundaria", url: null },
    R2: { rotulo: "ABNT NBR 6494:1990 — Segurança nos andaimes (exemplar NÃO licenciado: só valores com o item; conferir no exemplar licenciado)", classe: "secundaria", url: null, exemplarLicenciado: false },
    F28: { rotulo: "Legisweb — NR-34, item 34.11 (fonte secundária)", classe: "secundaria", url: "https://www.legisweb.com.br/legislacao/?id=313454" }
  };

  var CATALOGO = {
    FONTES: FONTES,
    tubo: { cat: "HSS48.3X3.0", Dmm: 48.3, paredeNominalMm: 3.0, fonteId: "F07", kgmLista: 3.70, kgmListaFonteId: "R1", paredeMinMm: 2.65, diametroMinMm: 42.2, obs: "Ø 48,3 mm. Na LISTA DE LOCAÇÃO o peso é 3,70 kg/m (valor de mercado, apostila); o kg/m do perfil (PerfisAco) fica para a massa do BIM. NBR 6494 4.5.5: parede ≥ 2,65 mm e Ø ≥ 42,2 mm." },
    /* comprimentos comerciais de prancha de madeira (m): 1,0 e 1,5 vêm do catálogo Layher (F06 p.9); os maiores NÃO têm fonte → confirmarRT */
    comprPranchaMadeira: [1.0, 1.5, 2.0, 2.5, 3.0, 3.5],
    comprPisoMetalico: [2.05],
    pecas: {
      bracFixa: { nome: "Braçadeira fixa", nomeLocacao: "Abraçadeira Fixa", peca: "Abraçadeira Fixa", descricao: "Liga dois tubos em ângulo reto (travessa × montante, transversal × travessa, guarda-corpo × montante, ancoragem). Aço mola forjado.", un: "pç", pesoKg: 1.24, cargaKN: 8, fonteId: "F11", confirmarRT: true, obs: "o portal do fabricante mostra 1,24 kg também para a giratória; manual de outro fabricante de multidirecional (2016) lista 1,1 kg — fica o maior (peso a içar)" },
      bracGiratoria: { nome: "Braçadeira giratória", nomeLocacao: "Abraçadeira Giratória", peca: "Abraçadeira Giratória", descricao: "Liga dois tubos em qualquer ângulo (diagonais de contraventamento).", un: "pç", pesoKg: 1.24, cargaKN: 6, fonteId: "F12", confirmarRT: true, obs: "peso igual ao da fixa no portal; manual de outro fabricante (2016) lista 1,2 kg — fica o maior (peso a içar)" },
      luva: { nome: "Luva de emenda", nomeLocacao: "Luva", peca: "Luva", descricao: "Abraçadeira de emenda externa: liga dois tubos ponta a ponta.", un: "pç", pesoKg: 0.5, fonteId: "F21", confirmarRT: true, obs: "peso de ficha de fabricante do Reino Unido (Doughty) — confirmar com a locadora" },
      baseRegulavel: { nome: "Base regulável", nomeLocacao: "Base Regulável", peca: "Base Regulável", descricao: "Placa 120 × 120 com haste rosqueada para nivelar o montante (NR-18 18.12.13).", un: "pç", pesoKg: 1.24, h: 0.10, fonteId: "F13", confirmarRT: true, obs: "peso da ficha Brastub (placa base ajustável); curso da haste sem fonte: parâmetro cursoBase" },
      baseFixa: { nome: "Base fixa", nomeLocacao: "Base Sapata", peca: "Base Sapata", descricao: "Placa de apoio fixa do montante.", un: "pç", pesoKg: 1.05, h: 0.10, fonteId: "F14", confirmarRT: true, obs: "dimensões Andasa (F08); peso da placa 8 × 120 × 120 Brastub (F14)" },
      rodizio: { nome: "Rodízio", nomeLocacao: "Rodízio", peca: "Rodízio", descricao: "Rodízio com travas contra deslocamento acidental (NR-18 18.12.16). Proibido deslocar com trabalhadores (18.12.17).", un: "pç", pesoKg: 2.5, h: 0.345, fonteId: "F04", confirmarRT: true, obs: "rodízio simples Orguel ø150 × 345 mm, 2,5 kg" },
      pranchaMadeira: { nome: "Pranchão de madeira", nomeLocacao: "Pranchão de Madeira", peca: "Pranchão de Madeira", descricao: "Forração do piso de trabalho: completa, antiderrapante, travada (NR-18 18.12.5; NBR 6494 3.1.8). Pinho 1½\" × 12\".", un: "pç", largura: 0.30, esp: 0.038, pesoPorM: 9, fonteId: "R1", confirmarRT: true, obs: "0,30 × 0,038 m (1½\" × 12\", mercado brasileiro) e 9 kg/m: apostilas de montador, que citam a NR-34.11.13.1 (naval: referência). Balanço além do apoio ≤ 0,20 m e flecha ≤ L/200 são regra da NBR 6494 (3.1.8.4 e 3.1.7)." },
      pisoMetalico: { nome: "Piso metálico", nomeLocacao: "Piso metálico com gancho 0,37 × 2,05 m", descricao: "Piso de aço com gancho que engata na transversal.", un: "pç", largura: 0.37, pesos: { "2.05": 15.47 }, fonteId: "F04", confirmarRT: true, obs: "ficha Orguel (fachadeiro); a espessura do piso metálico não consta da ficha → parâmetro" },
      alcapao: { comprimento: 2.5, nome: "Alçapão", nomeLocacao: "Portinhola", peca: "Portinhola", descricao: "Abertura do piso para a escada de acesso (NR-18 18.12.14).", un: "pç", largura: 0.60, volumetrico: true, pesoKg: null, fonteId: "F04", confirmarRT: true, obs: "0,60 × 2,5 m na ficha Orguel (p.4); peso por volume × densidade derivada (790 kg/m³, R1)" },
      rodapeMadeira: { nome: "Rodapé de madeira", nomeLocacao: "Rodapé", peca: "Rodapé", descricao: "Rodapé do piso de trabalho, altura mínima 0,15 m rente ao piso (NR-18 18.9.4.2 c).", un: "pç", volumetrico: true, pesoKg: null, fonteId: "F01", confirmarRT: true, obs: "a altura mínima é da NR-18; dimensões comerciais e peso da madeira SEM FONTE (rodapé metálico Mecanflex: F05 p.4, sem peso)" },
      escadaMao: { nome: "Escada de mão", nomeLocacao: "Escada Montada", peca: "Escada Montada", descricao: "Escada de acesso por levante, largura mínima 0,40 m e degraus a cada 0,25–0,30 m (NR-18 18.12.14 a), até 7 m de extensão e ultrapassando 1,00 m o piso superior (18.8.6.13); inclinação de 50° a 75° (18.8.2 b).", un: "pç", largura: 0.40, pesoKg: null, fonteId: "F05", confirmarRT: true, passoCompr: 0.25, maxCompr: 7.0, anguloAlvo: 75, anguloMin: 50, anguloMax: 75, obs: "escada de acesso ø48 × 2 m do Mecanflex (p.4), sem peso; os comprimentos comerciais acima de 2 m (passo de 0,25 m) NÃO têm fonte de catálogo: o projeto escolhe o comprimento pela regra da NR-18 e a locadora confirma" },
      escadaMarinheiro: { nome: "Escada marinheiro", nomeLocacao: "Arco", peca: "Arco", descricao: "Escada fixa vertical (NR-18 18.8.6.2) de módulos de 2,00 m, largura 0,40 m.", un: "pç", largura: 0.40, modulo: 2.0, pesoKg: null, fonteId: "F08", confirmarRT: true, obs: "Andasa: altura 1 ou 2 m, largura 400 mm; peso SEM FONTE" },
      escadaColetiva: { nome: "Lance de escada de uso coletivo", nomeLocacao: "Lance de Escada Coletiva", peca: "Lance de Escada Coletiva", descricao: "Lance da torre de escada de uso coletivo: largura ≥ 0,60 m, corrimão dos dois lados, degraus antiderrapantes, espelho ≤ 0,20 m (NR-18 18.12.14 b e 18.8.6.1).", un: "pç", largura: 0.60, espelhoMax: 0.20, pisoMin: 0.25, pesoKg: null, fonteId: "F01", confirmarRT: true, obs: "medidas pelas regras da NR-18 (18.12.14 b; 18.8.6.1); peso SEM FONTE de catálogo" },
      cancela: { nome: "Cancela", nomeLocacao: "Cancela de Acesso", peca: "Cancela de Acesso", descricao: "Cancela no guarda-corpo, na chegada da torre de escada ao piso de trabalho. A NR-18 não traz item para a cancela: boa prática.", un: "pç", pesoKg: null, fonteId: null, confirmarRT: true, obs: "cancela SEM item de norma e SEM fonte de catálogo — confirmar com o responsável técnico" },
      plataformaDescanso: { nome: "Plataforma de descanso", nomeLocacao: "Plataforma de Descanso 0,60 × 0,60 m", peca: "Plataforma de Descanso", descricao: "Plataforma de descanso 0,60 × 0,60 m com guarda-corpo entre lances da escada marinheiro (NR-18 18.8.6.2).", un: "pç", largura: 0.60, pesoKg: null, fonteId: "F01", confirmarRT: true, obs: "dimensões da NR-18 18.8.6.2; peso SEM FONTE" },
      fixacaoMarinheiro: { nome: "Fixação da escada marinheiro", nomeLocacao: "Fixação da Escada Marinheiro", peca: "Fixação da Escada Marinheiro", descricao: "Fixação da escada fixa a cada 3 m e no topo (NR-18 18.8.6.2).", un: "pç", pesoKg: null, fonteId: "F01", confirmarRT: true, obs: "intervalo da NR-18 18.8.6.2; peça SEM FONTE de catálogo" },
      calco: { nome: "Calço de madeira", nomeLocacao: "Calço", peca: "Calço", pesoPorM: 9, descricao: "Distribui a carga da base no solo.", un: "pç", pesoKg: null, fonteId: "F22", confirmarRT: true, obs: "Calço = pedaço de pranchão 0,30 × 0,038 × 0,50 m (9 kg/m, apostila R1). HSA 3.3.1 pede calço com ≥ 35 mm de espessura, ≥ 220 mm de largura e ≥ 1 000 cm² de área em solo (a prancha 0,24 × 0,045 × 0,50 atende); peso derivado do pranchão" },
      olhal: { nome: "Olhal de ancoragem", nomeLocacao: "Olhal / chumbador de ancoragem", descricao: "Dispositivo fixado na face (chumbado ou cravado), por onde passa o tubo de amarração. Capacidade a definir pelo RT.", un: "pç", pesoKg: null, fonteId: "F22", confirmarRT: true, obs: "o HSA pede ≥ 6,25 kN de capacidade de trabalho (3.3.2); catálogo de olhal brasileiro SEM FONTE" },
      tela: { nome: "Tela de proteção", nomeLocacao: "Tela de proteção da fachada (m²)", descricao: "Tela da 1ª plataforma até 2 m acima da última (NR-18 18.12.15).", un: "m²", pesoKg: null, fonteId: "F01", confirmarRT: false, obs: "peso SEM FONTE" }
    }
  };

  /* os valores que NÃO são regra de norma brasileira: ficam editáveis e o RT confirma.
     fonteId = a fonte secundária ao lado (quando houver); null = sem fonte alguma */
  var PARAMETROS_RT = {
    afastamento: { padrao: 0.20, fonteId: null, obs: "face → linha interna de montantes: sem fonte brasileira" },
    vaoMax: { padrao: 2.00, fonteId: "F24", obs: "TG20 (secundária): 2,4 m; fachadeiro Orguel: painel de 2,0 m (F04 p.2)" },
    levanteMax: { padrao: 2.00, fonteId: "F24", obs: "TG20 (secundária) e painel Orguel de 2 000 mm (F04 p.2): cada andar de serviço com no máximo 2,00 m" },
    hVarredor: { padrao: 0.15, fonteId: "F22", obs: "HSA 3.2.3: a 1ª travessa o mais perto possível do pé do montante; a distância exata não tem fonte" },
    rodapeEsp: { padrao: 0.025, fonteId: null, obs: "espessura da tábua do rodapé: tábua serrada de 1\" (25 mm), decisão RA de 27/10/2026 (sem fonte de norma; o rodapé não é peça calculada)" },
    diagCada: { padrao: 5, fonteId: null, obs: "frequência das prumadas de diagonal: sem fonte brasileira" },
    ancH: { padrao: 6.0, fonteId: "R2", regra: true, max: 6.0, obs: "REGRA NBR 6494:1990 4.5.2 (exemplar não licenciado — conferir): amarrações a no máximo 6,00 m entre si nas duas direções e ≥ 1 a cada 36,00 m²" },
    ancV: { padrao: 4.0, fonteId: "R2", regra: true, max: 6.0, obs: "REGRA NBR 6494:1990 4.5.2 (exemplar não licenciado — conferir): ancH × ancV ≤ 36 m²" },
    espPisoMetal: { padrao: 0.045, fonteId: null, obs: "espessura do piso metálico: a ficha Orguel não informa" },
    pranchaVaoMax: { padrao: 2.00, fonteId: "R1", obs: "vão máximo do pranchão de 38 mm: 2,00 m, com apoio ≥ 0,20 m (apostila; NBR 6494 3.1.8.2 pede vão ≤ 2,00 m para a tábua de 0,025 m)" },
    pranchaBalancoMax: { padrao: 0.20, fonteId: "R2", regra: true, obs: "REGRA NBR 6494:1990 3.1.8.4: balanço da prancha além do apoio ≤ 0,20 m" },
    roscaBase: { padrao: 0.10, fonteId: null, obs: "rosca exposta da base regulável para nivelar: 0,10 m por decisão do projeto (confirmar RT). Altura da base = placa (0,10 m) + rosca. A carga admissível da base cai com a rosca exposta: tabela da apostila de 8 a 40 cm (R1), usada na verificação da E4. Sapata ajustável Orguel: 330 mm de curso total (F04 p.3)" },
    densMadeira: { padrao: 790, fonteId: "R1", derivado: true, obs: "densidade da madeira do rodapé e do alçapão: 790 kg/m³, DERIVADA da apostila (pranchão 38 × 300 mm = 9 kg/m → 9 / 0,0114 m²) — confirmar RT" },
    luvaDistMin: { padrao: 0.15, fonteId: null, obs: "folga mínima entre a emenda e a braçadeira do nó (duas braçadeiras lado a lado): critério de modelagem" },
    emendaTerco: { padrao: 1 / 3, fonteId: null, obs: "emenda da travessa a no máximo 1/3 do vão a partir de um montante: boa prática de montagem, fonte secundária não localizada (o HSA 3.2.2 pede luva onde não há tração)" },
    umaEmendaPorVao: { padrao: 1, fonteId: "R1", obs: "uma emenda só por vão, no montante e na travessa (apostila)" },
    emendaDesencontro: { padrao: 0.50, fonteId: null, obs: "emendas desencontradas entre montantes vizinhos em pelo menos 0,50 m: boa prática, sem fonte" },
    emendaTravessa: { padrao: 0.30, fonteId: null, obs: "nenhuma emenda de montante a menos de 0,30 m de uma travessa: boa prática, sem fonte" },
    escadaUltrapassa: { padrao: 1.00, fonteId: "F01", regra: true, obs: "REGRA NR-18 18.8.6.13: a escada de mão ultrapassa em 1,00 m (no mínimo) o piso superior" },
    escadaMaxLance: { padrao: 7.0, fonteId: "F01", regra: true, obs: "REGRA NR-18 18.8.6.13: escada de mão com no máximo 7 m de extensão" },
    larguraMinima: { padrao: 0.60, fonteId: "R2", regra: true, obs: "REGRA NBR 6494:1990 4.5.6 (exemplar não licenciado — conferir): plataforma com largura ≥ 0,60 m e altura livre ≥ 1,75 m" },
    alturaLivreMin: { padrao: 1.75, fonteId: "R2", regra: true, obs: "REGRA NBR 6494:1990 4.5.6: altura livre ≥ 1,75 m entre pisos forrados" }
  };

  /* ================================================================ PADRÃO */
  var PADRAO = {
    caminho: "", contorno: "", comprimento: 6, fechado: false, linhaE: "face", lado: "esquerda",
    altura: 6.0, afastamento: 0.20, nPranchas: 4, largura: 0, vaoMax: 2.00, levanteMax: 2.00, hVarredor: 0.15,
    pisos: "topo", piso: "madeira",
    guarda: 1.20, intermediaria: 0.70, rodape: 0.20, rodapeEsp: 0.025, guardaInterno: false, tela: true,
    tubo: "HSS48.3X3.0", barras: "6; 5,75; 5,5; 5,25; 5; 4,75; 4,5; 4,25; 4; 3,75; 3,5; 3,25; 3; 2,75; 2,5; 2,25; 2; 1,75; 1,5; 1,25; 1; 0,75; 0,5", nr34Montantes: false, pontaMin: 0.10, pontaMax: 0.30,   /* R3 (revisão 27/10): tubos de 0,25 em 0,25 m de 0,50 a 6,00 m (o que se aluga) e ponta de no máximo 0,30 m */
    diagCada: 5, diagTransv: true,
    ancoragem: "tubo", ancH: 6.0, ancV: 4.0,
    base: "regulavel", roscaBase: 0.10, calco: true, acesso: "auto", acessoPos: 0, conexoes3d: true,
    travaTopo: true, posteGuarda: false, ancTopo: true, abracDupla: "", faceAte: null,
    /* ANDAIME MULTIDIRECIONAL (M1, 27/10/2026): `sistema` escolhe o motor. "tuboroll" (padrão) = este arquivo, nada muda; "multidirecional" = js/andaimemulti.js.
       As 4 chaves seguintes só valem no multidirecional (linha do catálogo, largura do módulo = uma travessa da linha, nível do estrado em relação ao nó, curso máximo da rosca da base) */
    sistema: "tuboroll", linha: "roseta", larguraModulo: 0.80, offPiso: 0, regulagemMax: 0.25
  };
  var NUMS = ["comprimento", "altura", "afastamento", "nPranchas", "largura", "vaoMax", "levanteMax", "hVarredor", "guarda", "intermediaria", "rodape", "rodapeEsp",
    "pontaMin", "pontaMax", "diagCada", "ancH", "ancV", "acessoPos", "roscaBase", "larguraModulo", "offPiso", "regulagemMax"];
  var BOOLS = ["nr34Montantes", "fechado", "guardaInterno", "tela", "diagTransv", "calco", "conexoes3d", "travaTopo", "posteGuarda", "ancTopo"];

  /* ---- despacho para o multidirecional (M1): módulo preguiçoso; sem ele, erro claro (nunca cai no tubo-roll em silêncio) ---- */
  var ERRO_MULTI = "módulo do multidirecional não carregou (js/andaimemulti.js).";
  function Multi() { return dep("AndaimeMulti", "./andaimemulti.js"); }
  function ehMulti(x) { return !!x && String(x.sistema) === "multidirecional"; }

  function padrao() { return clone(PADRAO); }
  function bool(v) { return !(v === false || v === "false" || v === 0 || v === "0" || v === "nao" || v === "não"); }
  function normalizar(par) {
    if (ehMulti(par)) { var Mn = Multi(); if (Mn) return Mn.normalizar(par); }
    var p = clone(PADRAO);
    Object.keys(par || {}).forEach(function (k) { if (par[k] != null && par[k] !== "") p[k] = clone(par[k]); });
    NUMS.forEach(function (k) { p[k] = num(p[k], PADRAO[k]); });
    BOOLS.forEach(function (k) { p[k] = bool(p[k]); });
    return p;
  }

  /* ================================================================ LEITURA DOS TEXTOS */
  /* "x z; x z…" relativo à origem (a mesma leitura do guarda-corpo, js/metalacessos.js lerCaminho) */
  function lerCaminho(t) {
    var o = []; String(t == null ? "" : t).split(";").forEach(function (par) { var q = String(par).trim().split(/\s+/); if (q.length < 2) return; var x = num(q[0], NaN), z = num(q[1], NaN); if (isFinite(x) && isFinite(z)) o.push([x, z]); });
    return o;
  }
  /* "6; 5; 2,5" → [6, 5, 2.5] em ordem decrescente, sem repetidos */
  function lerLista(t) {
    var o = []; String(t == null ? "" : t).split(/[;\s]+/).forEach(function (s) { var v = num(s, NaN); if (isFinite(v) && v > 0) o.push(r4(v)); });
    o.sort(function (a, b) { return b - a; });
    return o.filter(function (v, i) { return i === 0 || v !== o[i - 1]; });
  }
  /* o caminho de verdade: contorno (modo "contorno" das Peças prontas) > caminho > trecho reto */
  function caminhoDe(p) {
    var c1 = lerCaminho(p.contorno), fechado = !!p.fechado, cam = null;
    if (c1.length >= 3) { cam = c1; fechado = true; }
    else { var c0 = lerCaminho(p.caminho); if (c0.length >= 2) cam = c0; }
    if (!cam) cam = [[0, 0], [num(p.comprimento, 6), 0]];
    if (fechado && cam.length >= 4 && hyp(cam[0][0] - cam[cam.length - 1][0], cam[0][1] - cam[cam.length - 1][1]) < 1e-6) cam = cam.slice(0, -1);
    return { cam: cam, fechado: fechado };
  }
  function areaAssinada(cam) { var a = 0; for (var i = 0; i < cam.length; i++) { var q = cam[(i + 1) % cam.length]; a += cam[i][0] * q[1] - q[0] * cam[i][1]; } return a / 2; }

  /* tubo do catálogo: Ø, kg/m (do PerfisAco) e o rótulo "Tubo Ø48,3 × 3,0 mm" */
  function tuboInfo(nome) {
    var A = dep("PerfisAco", "./perfisaco.js"), o = null;
    try { o = A && A.obter ? A.obter(nome) : null; } catch (e) { o = null; }
    var m = /X([\d.]+)/i.exec(String(nome || "")), parede = m ? num(m[1], CATALOGO.tubo.paredeNominalMm) : CATALOGO.tubo.paredeNominalMm;
    var Dmm = o && o.D ? o.D : CATALOGO.tubo.Dmm;
    var tn = o && (o.tn || o.t) ? (o.tn || o.t) : null;
    return { nome: nome, ok: !!(o && o.D), D: Dmm / 1000, Dmm: Dmm, paredeMm: tn, kgm: CATALOGO.tubo.kgmLista, kgmBim: o && o.massa ? o.massa : null, rotulo: "Tubo Ø" + brf(Dmm, 1) + " × " + brf(parede, 1) + " mm" };
  }

  /* ================================================================ VALIDAR
   * Texto PT-BR que diz o que fazer. Os limites da NR-18 citam o item. */
  function pisosDe(p, nL, lev) {
    var set = {}, t = String(p.pisos == null ? "topo" : p.pisos).trim().toLowerCase();
    set[nL] = true;
    if (t === "todos") { for (var k = 1; k <= nL; k++) set[k] = true; }
    else if (t !== "topo" && t !== "") {
      String(p.pisos).split(/[;\s]+/).forEach(function (s) { var h = num(s, NaN); if (isFinite(h) && h > 0) { var k2 = Math.max(1, Math.min(nL, Math.round(h / lev))); set[k2] = true; } });
    }
    return Object.keys(set).map(Number).sort(function (a, b) { return a - b; });
  }
  function validar(par) {
    if (ehMulti(par)) { var Mv = Multi(); return Mv ? Mv.validar(par) : ERRO_MULTI; }
    var p = normalizar(par), g = caminhoDe(p), cam = g.cam;
    var txtC = String(p.caminho || "").trim(), txtK = String(p.contorno || "").trim(), cm0 = lerCaminho(p.caminho), ck0 = lerCaminho(p.contorno);
    if (txtK && ck0.length < 3) return "Andaime: o contorno precisa de 3 pontos ou mais (x z; x z…).";
    if (!(txtK && ck0.length >= 3) && txtC && cm0.length < 2) return "Andaime: o caminho precisa de 2 pontos ou mais (x z; x z…).";
    if (p.fechado && !(ck0.length >= 3 || cm0.length >= 3)) return "Andaime fechado (em volta de um equipamento): precisa de um contorno de 3 pontos ou mais.";
    var nT = g.fechado ? cam.length : cam.length - 1, i;
    for (i = 0; i < nT; i++) { var a = cam[i], b = cam[(i + 1) % cam.length]; if (hyp(b[0] - a[0], b[1] - a[1]) < 0.30) return "Andaime: o trecho " + (i + 1) + " tem menos de 0,30 m (dois pontos quase no mesmo lugar)."; }
    if (cam.length === 2 && !(txtC || txtK) && !(p.comprimento >= 1 && p.comprimento <= 200)) return "Andaime: comprimento de 1 a 200 m (clique o começo e o fim, ou digite).";
    var vIni = g.fechado ? 0 : 1, vFim = g.fechado ? cam.length : cam.length - 1;
    for (var vi = vIni; vi < vFim; vi++) {
      var Ap = cam[(vi - 1 + cam.length) % cam.length], Bp = cam[vi], Cp = cam[(vi + 1) % cam.length];
      var w1 = [Bp[0] - Ap[0], Bp[1] - Ap[1]], w2 = [Cp[0] - Bp[0], Cp[1] - Bp[1]];
      var cs = Math.max(-1, Math.min(1, dot2(w1, w2) / (hyp(w1[0], w1[1]) * hyp(w2[0], w2[1]))));
      var ang = 180 - Math.acos(cs) / GRAU;   /* ângulo interno entre os trechos (180° = reto) */
      if (ang < 30 - 1e-6) return "Andaime: o encontro de " + brf(ang, 0) + "° é fechado demais para o andaime (mínimo 30°): divida em dois andaimes.";
    }
    if (!(p.altura >= 0.5 && p.altura <= 60)) return "Altura do piso de trabalho de 0,5 a 60 m.";
    if (!(p.guarda >= 1.20 - 1e-9)) return "Guarda-corpo de " + brf(p.guarda) + " m: a NR-18 (18.9.4.2 a) pede travessão superior a 1,20 m. Aumente a altura do guarda-corpo.";
    if (!(p.intermediaria >= 0.45 && p.intermediaria <= 0.80)) return "Travessão intermediário a " + brf(p.intermediaria) + " m: a NR-18 (18.9.4.2 b) pede 0,70 m (aceito de 0,45 a 0,80 m). Ajuste a altura do intermediário.";
    if (!(p.rodape >= 0.15 - 1e-9)) return "Rodapé de " + brf(p.rodape) + " m: a NR-18 (18.9.4.2 c) pede no mínimo 0,15 m de altura rente ao piso. Aumente o rodapé.";
    if (!(p.rodape <= 0.60)) return "Rodapé de " + brf(p.rodape) + " m passa de 0,60 m: confira a altura (a NR-18 pede o mínimo de 0,15 m).";
    if (!(p.rodapeEsp >= 0.01 && p.rodapeEsp <= 0.06)) return "Espessura do rodapé de 0,01 a 0,06 m.";
    if (!(p.afastamento >= 0.05 && p.afastamento <= 0.60)) return "Afastamento da face de 0,05 a 0,60 m.";
    if (!(Math.round(p.nPranchas) >= 1 && Math.round(p.nPranchas) <= 10)) return "Pranchas na largura: de 1 a 10.";
    if (p.largura !== 0 && !(p.largura >= 0.30 && p.largura <= 3)) return "Largura do andaime de 0,30 a 3,00 m (0 = pela quantidade de pranchas).";
    if (!(p.vaoMax >= 0.5 && p.vaoMax <= 3)) return "Vão longitudinal máximo de 0,5 a 3,0 m.";
    if (!(p.levanteMax >= 1 && p.levanteMax <= 3)) return "Distância máxima entre travessas (levante) de 1,0 a 3,0 m.";
    if (!(p.hVarredor >= 0.05 && p.hVarredor <= 0.5)) return "Travessa de base (varredor) de 0,05 a 0,50 m acima da base.";
    if (["madeira", "metalico"].indexOf(String(p.piso)) < 0) return "Piso: madeira ou metálico.";
    if (["auto", "escada", "coletiva", "marinheiro", "nenhum"].indexOf(String(p.acesso)) < 0) return "Acesso: automático, escada de mão por lance, torre coletiva, marinheiro ou nenhum.";
    if (["tubo", "nenhuma"].indexOf(String(p.ancoragem)) < 0) return "Ancoragem: tubo ou nenhuma.";
    if (["regulavel", "fixa", "rodizio"].indexOf(String(p.base)) < 0) return "Base: regulável, fixa ou rodízio.";
    if (!(p.roscaBase >= 0 && p.roscaBase <= 0.40 + 1e-9)) return "Rosca exposta da base regulável de 0 a 0,40 m (a tabela de carga da apostila vai de 8 a 40 cm).";
    if (!(p.diagCada >= 1)) return "Diagonais: uma prumada a cada N vãos, N de 1 em diante.";
    if (!(p.ancH > 0 && p.ancV > 0)) return "Ancoragem: os espaçamentos horizontal e vertical têm de ser maiores que zero.";
    if (!(p.pontaMin >= 0.05 && p.pontaMax >= p.pontaMin && p.pontaMax <= 1)) return "Balanço do tubo: mínimo de 0,05 m e máximo maior que o mínimo (até 1,0 m).";
    var Tv = tuboInfo(p.tubo);
    if (Tv.ok && (Tv.Dmm < CATALOGO.tubo.diametroMinMm - 1e-9 || (Tv.paredeMm != null && Tv.paredeMm < CATALOGO.tubo.paredeMinMm - 1e-9))) return "Tubo " + p.tubo + " (Ø " + brf(Tv.Dmm, 1) + " mm, parede " + brf(Tv.paredeMm, 2) + " mm): a NBR 6494 (4.5.5) pede montante metálico com parede ≥ 2,65 mm e Ø ≥ 42,2 mm. Escolha outro tubo.";
    if (p.acesso === "coletiva" && g.fechado) return "Acesso coletivo (torre de escada) em andaime fechado: a torre fica numa cabeceira e o contorno fechado não tem cabeceira. Use escada de mão por lance ou marinheiro, ou abra o contorno.";
    if (p.ancoragem === "tubo" && (p.ancH > PARAMETROS_RT.ancH.max + 1e-9 || p.ancV > PARAMETROS_RT.ancV.max + 1e-9 || p.ancH * p.ancV > 36 + 1e-9)) return "Ancoragem " + brf(p.ancH) + " × " + brf(p.ancV) + " m (" + brf(p.ancH * p.ancV) + " m²): a NBR 6494 (4.5.2) pede amarração a no máximo 6,00 m nas duas direções e ao menos uma a cada 36,00 m². Diminua os espaçamentos.";
    if (!lerLista(p.barras).length) return "Comprimentos comerciais dos tubos: digite pelo menos um (ex.: 6; 5; 4; 3; 2,5; 2; 1,5; 1).";
    if (!(num(p.acessoPos, 0) >= 0 && num(p.acessoPos, 0) <= 1)) return "Posição da escada de 0 a 1 ao longo do caminho (0 = 1º vão).";
    /* acesso "nenhum" só até 1,0 m de piso (NR-18 18.12.14) */
    var nL = Math.max(1, Math.ceil(p.altura / p.levanteMax - 1e-9)), lev = p.altura / nL, pk = pisosDe(p, nL, lev);
    if (p.acesso === "nenhum" && pk[0] * lev > 1.0 + 1e-9) return "Sem acesso: a NR-18 (18.12.14) exige escada quando o piso de trabalho passa de 1,00 m (aqui o piso mais baixo está a " + brf(pk[0] * lev) + " m). Escolha escada, torre coletiva ou marinheiro (ou deixe em automático).";
    /* largura da plataforma ≥ 0,60 m e altura livre ≥ 1,75 m entre pisos forrados (NBR 6494 4.5.6); rodízio: altura ≤ 4 × menor dimensão da base (4.5.12) */
    var pwV = p.piso === "metalico" ? 0.37 : 0.30, DV = Tv.D, WV = p.largura > 0 ? p.largura : Math.round(p.nPranchas) * pwV + DV + 0.01;
    if (WV < PARAMETROS_RT.larguraMinima.padrao - 1e-9) return "Largura da plataforma de " + brf(WV) + " m: a NBR 6494 (4.5.6) pede no mínimo 0,60 m. Aumente as pranchas na largura.";
    var espV = p.piso === "metalico" ? PARAMETROS_RT.espPisoMetal.padrao : CATALOGO.pecas.pranchaMadeira.esp;
    for (var iq = 1; iq < pk.length; iq++) { var livre = (pk[iq] - pk[iq - 1]) * lev - espV; if (livre < PARAMETROS_RT.alturaLivreMin.padrao - 1e-9) return "Altura livre de " + brf(livre) + " m entre os pisos de " + brf(pk[iq - 1] * lev) + " e " + brf(pk[iq] * lev) + " m: a NBR 6494 (4.5.6) pede no mínimo 1,75 m entre pisos forrados. Tire um dos pisos (pisos: topo) ou aumente o levante."; }
    if (p.base === "rodizio" && p.altura > 4 * WV + 1e-9) return "Andaime sobre rodízios: a altura do piso (" + brf(p.altura) + " m) passa de 4 vezes a menor dimensão da base (" + brf(WV) + " m → máximo " + brf(4 * WV) + " m) — NBR 6494 (4.5.12). Alargue a base ou use base fixa com ancoragem.";
    /* torre sem ancoragem: altura ≤ 4 × a menor dimensão da base (NR-18 18.12.3) */
    if (!g.fechado && cam.length === 2 && p.ancoragem === "nenhuma") {
      var Li = hyp(cam[1][0] - cam[0][0], cam[1][1] - cam[0][1]);
      if (Math.ceil(Li / p.vaoMax - 1e-9) === 1) {
        var D = tuboInfo(p.tubo).D, pw = p.piso === "metalico" ? 0.37 : 0.30, W = p.largura > 0 ? p.largura : Math.round(p.nPranchas) * pw + D + 0.01, menor = Math.min(Li, W);
        if (p.altura > 4 * menor + 1e-9) return "Torre sem ancoragem: a altura do piso (" + brf(p.altura) + " m) passa de 4 vezes a menor dimensão da base (" + brf(menor) + " m → máximo " + brf(4 * menor) + " m) — NR-18 18.12.3. Ancore à estrutura ou alargue a base.";
      }
    }
    return null;
  }

  /* ================================================================ BARRAS COMERCIAIS
   * cobrir: acha a sequência de barras (comprimentos comerciais, postas ponta a ponta) cujo FIM cai em [sMin, sMax],
   * com o MENOR número de barras (= menos luvas) e a emenda de cada junta aceita por okE(s).
   * ⚠ Programação dinâmica em vez de "guloso": a regra da emenda junto do nó (≤ 1/3 do vão) e a de desencontro dos
   * montantes às vezes só fecham com uma barra menor no começo; testar todas as alternativas é o que a especificação pede
   * ("testar as alternativas de 1ª barra e ficar com a que cumpre em todas as emendas"). */
  function cobrir(s0s, sMin, sMax, bars, okE, Lc, okBar) {
    var melhor = null;
    s0s.forEach(function (s0) {
      var memo = {};
      function f(s) {
        var k = Math.round(s * 1e4);
        if (memo.hasOwnProperty(k)) return memo[k];
        memo[k] = null;
        var best = null;
        for (var i = 0; i < bars.length; i++) {
          var l = bars[i], e = s + l, cand = null;
          if (e > sMax + 1e-9) continue;
          if (okBar && !okBar(l, s)) continue;
          if (e >= sMin - 1e-9) cand = [l];
          else if (okE(e, s, s0)) { var r = f(e); if (r) cand = [l].concat(r); }
          if (cand && (!best || cand.length < best.length)) best = cand;
        }
        memo[k] = best; return best;
      }
      var seq = f(s0); if (!seq) return;
      var tot = 0; seq.forEach(function (l) { tot += l; });
      var c = { seq: seq, s0: s0, fim: s0 + tot, n: seq.length, desb: Lc == null ? 0 : Math.abs((-s0) - (s0 + tot - Lc)) };
      if (!melhor || c.n < melhor.n || (c.n === melhor.n && c.desb < melhor.desb - 1e-9)) melhor = c;
    });
    return melhor;
  }
  /* último recurso (nenhuma combinação fecha a janela): a maior barra repetida e a menor que cobre o resto */
  function gulosa(s0, sMin, bars) {
    var seq = [], s = s0, maxB = bars[0], g = 0;
    while (s < sMin - 1e-9 && g++ < 1000) {
      var rest = sMin - s, pick = null;
      if (rest > maxB + 1e-9) pick = maxB; else { for (var i = bars.length - 1; i >= 0; i--) if (bars[i] >= rest - 1e-9) { pick = bars[i]; break; } if (pick == null) pick = maxB; }
      seq.push(pick); s += pick;
    }
    return { seq: seq, s0: s0, fim: s, n: seq.length, desb: 0 };
  }

  /* ================================================================ MONTAR */
  function montar(par) {
    if (ehMulti(par)) { var Mm = Multi(); return Mm ? Mm.montar(par) : { ok: false, erro: ERRO_MULTI, avisos: [] }; }
    var p = normalizar(par), erro = validar(par);
    if (erro) return { ok: false, erro: erro, avisos: [] };
    var T = tuboInfo(p.tubo), D = T.D, R = PARAMETROS_RT;
    var avisos = [], avisoVisto = {}, violacoes = [];
    function aviso(t) { if (!avisoVisto[t]) { avisoVisto[t] = 1; avisos.push(t); } }
    var bars = lerLista(p.barras), maxBar = bars[0];
    var madeira = p.piso !== "metalico";
    var pw = madeira ? CATALOGO.pecas.pranchaMadeira.largura : CATALOGO.pecas.pisoMetalico.largura;
    var espPiso = madeira ? CATALOGO.pecas.pranchaMadeira.esp : R.espPisoMetal.padrao;
    if (!madeira) aviso("Espessura do piso metálico: a ficha do fabricante não informa; usando " + brf(espPiso, 3) + " m (confirmar com o responsável técnico).");
    var nPr = Math.max(1, Math.round(p.nPranchas)), W, folga = 0;
    if (p.largura > 0) {
      W = p.largura; nPr = Math.max(1, Math.floor((W - D - 0.01) / pw + 1e-9)); folga = W - D - 0.01 - nPr * pw;
      if (folga > 0.03 + 1e-9) aviso("Largura forçada de " + brf(W) + " m: sobra " + brf(folga) + " m sem forração entre as " + nPr + " pranchas e os montantes — a NR-18 (18.12.5) pede forração completa. Ajuste a largura ou a quantidade de pranchas.");
    } else W = nPr * pw + D + 0.01;
    if (p.vaoMax > 2.4 + 1e-9) aviso("Vão longitudinal de " + brf(p.vaoMax) + " m passa de 2,4 m (referência TG20, fonte secundária): confirmar com o responsável técnico.");
    if (p.levanteMax > 2.0 + 1e-9) aviso("Levante de " + brf(p.levanteMax) + " m passa de 2,0 m (referência: artigo e painel Orguel, fontes secundária e de fabricante): confirmar com o responsável técnico.");

    /* ---------------- apoio, bases e níveis. ⚠ y = 0 é o CHÃO: o calço (pranchão de 0,038 m) apoia nele, a base (placa + rosca) vem por cima,
       o montante nasce no topo da base. A superfície do piso fica EXATAMENTE em `altura` — o calço e a base absorvem a diferença,
       o conjunto não sobe (antes o calço empurrava tudo 4,5 cm para cima). */
    var base = CATALOGO.pecas[p.base === "rodizio" ? "rodizio" : (p.base === "fixa" ? "baseFixa" : "baseRegulavel")];
    var rosca = p.base === "regulavel" ? num(p.roscaBase, R.roscaBase.padrao) : 0;
    var hBase = base.h + rosca;
    var hCalco = p.calco && p.base !== "rodizio" ? CATALOGO.pecas.pranchaMadeira.esp : 0;
    var yFoot = hCalco + hBase;
    var nL = Math.max(1, Math.ceil(p.altura / p.levanteMax - 1e-9)), lev = p.altura / nL;
    var yVarr = yFoot + p.hVarredor;
    function yPisoK(k) { return k * lev; }
    function yTk(k) { return k * lev - espPiso - 1.5 * D; }
    if (yTk(1) < yVarr + 0.10 - 1e-9) return { ok: false, erro: "Altura do 1º levante (" + brf(lev) + " m) baixa demais para o calço e a base escolhidos: a travessa do 1º piso ficaria a menos de 0,10 m do varredor. Aumente a altura ou troque a base (o rodízio é alto).", avisos: avisos };
    var pisoK = pisosDe(p, nL, lev), temPiso = {}; pisoK.forEach(function (k) { temPiso[k] = true; });
    /* ---------------- E9: o modo de ACESSO efetivo. "auto" decide pela altura do piso mais baixo (NR-18 18.12.14): até 1,00 m sem escada; acima, escada de mão
       POR LANCE (um lance por levante, no máximo 7 m — 18.8.6.13). Torre coletiva e marinheiro só por escolha do usuário (o auto só SUGERE). */
    var acessoEf = p.acesso, acessoMotivo = "", yBaixoPiso = yPisoK(pisoK[0]);
    if (acessoEf === "auto") {
      if (yBaixoPiso <= 1.0 + 1e-9) { acessoEf = "nenhum"; acessoMotivo = "O piso de trabalho mais baixo está a " + brf(yBaixoPiso) + " m (até 1,00 m): sem escada (NR-18 18.12.14)."; }
      else { acessoEf = "escada"; acessoMotivo = "O piso de trabalho mais baixo está a " + brf(yBaixoPiso) + " m (acima de 1,00 m): escada de mão por levante, passando pelo alçapão e ultrapassando o piso em 1,00 m (NR-18 18.12.14 a; 18.8.6.13)."; }
    } else acessoMotivo = "Acesso escolhido pelo usuário: " + acessoEf + ".";
    if ((acessoEf === "escada") && yPisoK(nL) > 10 + 1e-9) aviso("Piso do topo a " + brf(yPisoK(nL)) + " m (acima de 10 m): considere o acesso por torre de escada de uso coletivo (NR-18 18.12.14 b) — a escolha não muda sozinha.");
    var niveis = [{ k: 0, y: r4(yVarr), piso: false, papel: "varredor" }];
    for (var kk = 1; kk <= nL; kk++) niveis.push({ k: kk, y: r4(yTk(kk)), yPiso: r4(yPisoK(kk)), piso: !!temPiso[kk], papel: "travessa" });
    var hTop = yPisoK(nL);
    var wI = p.afastamento, wE = p.afastamento + W;

    /* ---------------- caminho, lado e trechos. Cada trecho é uma FAIXA no referencial dele: s ao longo (u), w a partir da face (ns, para o lado do andaime). */
    var g = caminhoDe(p), cam = g.cam, closed = g.fechado, nCam = cam.length, nT = closed ? nCam : nCam - 1;
    var sLado;
    if (closed) { var A = areaAssinada(cam), sOut = A > 0 ? 1 : -1; sLado = String(p.lado) === "dentro" ? -sOut : sOut; }
    else sLado = String(p.lado) === "direita" ? -1 : 1;
    var trecho = [];
    for (var ti = 0; ti < nT; ti++) {
      var P = cam[ti], Q = cam[(ti + 1) % nCam], L0 = hyp(Q[0] - P[0], Q[1] - P[1]), u0 = [(Q[0] - P[0]) / L0, (Q[1] - P[1]) / L0];
      trecho.push({ ti: ti, P: P, L: L0, u: u0, ns: [sLado * u0[1], -sLado * u0[0]], sS: 0, sE: L0, sOS: null, sOE: null });
    }
    function vertOff(vi, h) {
      var V = cam[vi], tIn = closed ? (vi - 1 + nT) % nT : vi - 1, tOut = vi < nT ? vi : null;
      var n1 = (closed || vi > 0) ? trecho[tIn].ns : null, n2 = tOut != null ? trecho[tOut].ns : null;
      if (!n1) n1 = n2; if (!n2) n2 = n1;
      var den = 1 + dot2(n1, n2);
      return [V[0] + h * (n1[0] + n2[0]) / den, V[1] + h * (n1[1] + n2[1]) / den];
    }
    function ptAt(T0, s, w) { return [T0.P[0] + T0.u[0] * s + T0.ns[0] * w, T0.P[1] + T0.u[1] * s + T0.ns[1] * w]; }
    function sOf(T0, pt) { return (pt[0] - T0.P[0]) * T0.u[0] + (pt[1] - T0.P[1]) * T0.u[1]; }
    /* ⚠ CANTO "CORRIDO": no canto CONVEXO (o andaime por fora da curva) o trecho que chega (A) atravessa o quadrado do canto até a linha
       externa do trecho que sai (B) — pranchões e longitudinais de A passam direto, B começa na linha interna de A. Sem isso o canto ficava
       com uma cunha sem piso e com vãos de linha externa de 2,6 a 2,9 m. No canto CÔNCAVO (por dentro) A vai até a linha interna de B e
       B começa na linha externa de A (o guarda-corpo de A para na quina externa). */
    var vIni = closed ? 0 : 1, vFim = closed ? nT : nT;
    for (var vi = vIni; vi < vFim; vi++) {
      var ia = closed ? (vi - 1 + nT) % nT : vi - 1, ib = vi, TA = trecho[ia], TB = trecho[ib];
      var pim = vertOff(vi, wI), pem = vertOff(vi, wE), convexo = dot2(TA.ns, TB.u) <= 1e-9;
      if (convexo) { TA.sE = sOf(TA, pem); TB.sS = sOf(TB, pim); var sosB = sOf(TB, pem); if (sosB < TB.sS - 1e-6) TB.sOS = sosB; }
      else { TA.sE = sOf(TA, pim); TA.sOE = sOf(TA, pem); TB.sS = sOf(TB, pem); }
    }
    var cumIni = 0, Ltotal = 0;
    for (ti = 0; ti < nT; ti++) { if (trecho[ti].sE - trecho[ti].sS < 0.30) return { ok: false, erro: "Andaime: o trecho " + (ti + 1) + " fica com menos de 0,30 m de faixa depois de resolver os cantos (largura " + brf(W) + " m): afaste os pontos ou use outro afastamento.", avisos: avisos }; Ltotal += trecho[ti].L; }

    /* ---------------- postes (montantes) sem duplicar: o mesmo ponto vindo de dois trechos é UM poste */
    var posts = [];
    function addPost(pt, papel, ti2) {
      for (var q = 0; q < posts.length; q++) if (hyp(posts[q].x - pt[0], posts[q].z - pt[1]) < 0.02) { posts[q][papel] = true; return posts[q]; }
      var o = { id: posts.length, key: "P" + posts.length, x: r4(pt[0]), z: r4(pt[1]), trecho: ti2, inner: false, outer: false, cab: false }; o[papel] = true; posts.push(o); return o;
    }
    function postAt(pt) { for (var q = 0; q < posts.length; q++) if (hyp(posts[q].x - pt[0], posts[q].z - pt[1]) < 0.02) return posts[q]; return null; }
    var est = [], vaos = [], nVaosTot = 0;
    trecho.forEach(function (T0) {
      var Ls = T0.sE - T0.sS; T0.nb = Math.max(1, Math.ceil(Ls / p.vaoMax - 1e-9)); T0.est = []; T0.outerExt = []; T0.cumIni = cumIni;
      for (var k = 0; k <= T0.nb; k++) {
        var s = T0.sS + Ls * k / T0.nb, pi = ptAt(T0, s, wI), pe = ptAt(T0, s, wE), st = { id: est.length, trecho: T0.ti, k: k, s: s, pi: pi, pe: pe, cum: cumIni + s, outerOnly: false };
        est.push(st); T0.est.push(st.id);
        var cabPt = !closed && ((T0.ti === 0 && k === 0) || (T0.ti === nT - 1 && k === T0.nb));
        var pI = addPost(pi, "inner", T0.ti), pE = addPost(pe, "outer", T0.ti); if (cabPt) { pI.cab = true; pE.cab = true; }
      }
      if (T0.sOS != null) {
        var lenO = T0.sS - T0.sOS, ne = Math.max(1, Math.ceil(lenO / p.vaoMax - 1e-9));
        for (var j = 0; j < ne; j++) {
          var so = T0.sOS + lenO * j / ne, pe2 = ptAt(T0, so, wE), st2 = { id: est.length, trecho: T0.ti, k: -1, s: so, pi: null, pe: pe2, cum: cumIni + so, outerOnly: true };
          est.push(st2); T0.outerExt.push(st2.id); addPost(pe2, "outer", T0.ti);
        }
      }
      for (var v = 0; v < T0.nb; v++) vaos.push({ idx: vaos.length, trecho: T0.ti, v: v, s0: T0.sS + Ls * v / T0.nb, s1: T0.sS + Ls * (v + 1) / T0.nb, spanI: Ls / T0.nb });
      nVaosTot += T0.nb; cumIni += T0.L;
    });
    var nVaos = vaos.length;
    /* os postes que caem em cima de uma linha (também os de outro trecho: o poste NO do canto fica na linha interna de A) viram ponto de acoplamento da corrida */
    function linePts(T0, ln, sa, sb) {
      var w = ln === "e" ? wE : wI, out = [];
      posts.forEach(function (q) {
        var d = [q.x - T0.P[0], q.z - T0.P[1]], lat = d[0] * T0.ns[0] + d[1] * T0.ns[1], s = d[0] * T0.u[0] + d[1] * T0.u[1];
        if (Math.abs(lat - w) < 0.01 && s >= sa - 0.01 && s <= sb + 0.01) out.push({ s: s, key: q.key, xz: [q.x, q.z] });
      });
      out.sort(function (a, b) { return a.s - b.s; });
      return out;
    }
    var maxVaoE = 0, maxVaoI = 0;
    trecho.forEach(function (T0) {
      T0.lineI = linePts(T0, "i", T0.sS, T0.sE);
      T0.lineE = linePts(T0, "e", T0.sOS != null ? T0.sOS : T0.sS, T0.sE);
      T0.lineEg = linePts(T0, "e", T0.sOS != null ? T0.sOS : T0.sS, T0.sOE != null ? T0.sOE : T0.sE);   /* o trecho da linha externa que leva guarda-corpo */
      for (var q = 0; q + 1 < T0.lineI.length; q++) maxVaoI = Math.max(maxVaoI, T0.lineI[q + 1].s - T0.lineI[q].s);
      for (q = 0; q + 1 < T0.lineE.length; q++) maxVaoE = Math.max(maxVaoE, T0.lineE[q + 1].s - T0.lineE[q].s);
    });
    var cabEst = []; if (!closed) { cabEst.push({ T0: trecho[0], st: est[trecho[0].est[0]] }); var tL = trecho[nT - 1]; cabEst.push({ T0: tL, st: est[tL.est[tL.est.length - 1]] }); }

    /* ---------------- construtores do modelo */
    var barrasM = [], conexoes = [], pranchas = [], rodapes = [], basesM = [], calcos = [], anc = [], acessos = [], postBars = {};
    var seqB = 0, seqC = 0, seqP = 0, corridaN = 0;
    function addBarra(papel, a, b, L, corrida, extra) {
      var o = { id: "B" + (++seqB), papel: papel, a: [r4(a[0]), r4(a[1]), r4(a[2])], b: [r4(b[0]), r4(b[1]), r4(b[2])], L: L, cod: "tubo", corrida: corrida };
      if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
      barrasM.push(o); return o;
    }
    function addCon(tipo, pos, barras) { conexoes.push({ id: "C" + (++seqC), tipo: tipo, pos: [r4(pos[0]), r4(pos[1]), r4(pos[2])], barras: barras }); }
    function comercialPara(dist) {
      var need = dist + 2 * p.pontaMin - 1e-9, pick = null;
      for (var i = bars.length - 1; i >= 0; i--) if (bars[i] >= need) { pick = bars[i]; break; }
      return pick;
    }
    function barraAte(papel, P1, P2, corrida, extra) {
      var d = [P2[0] - P1[0], P2[1] - P1[1], P2[2] - P1[2]], dist = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]), Lc = comercialPara(dist);
      if (Lc == null) { Lc = maxBar; aviso("Peça de " + brf(dist) + " m maior que o tubo comercial mais longo (" + brf(maxBar) + " m): " + papel + " ficou curta — emende ou reduza o vão."); }
      var ov = (Lc - dist) / 2, uu = [d[0] / dist, d[1] / dist, d[2] / dist];
      return addBarra(papel, [P1[0] - uu[0] * ov, P1[1] - uu[1] * ov, P1[2] - uu[2] * ov], [P2[0] + uu[0] * ov, P2[1] + uu[1] * ov, P2[2] + uu[2] * ov], Lc, corrida, extra);
    }

    /* ---------------- MONTANTES (vertical, emendados em barras comerciais com luva desencontrada) */
    var topExt = hTop + (p.tela ? 2.0 : p.guarda + 0.05), topInt = hTop + p.guarda + 0.05;
    /* E4.3: ancTopo só com fachada/estrutura até a cota do topo. faceAte = altura (m) da face onde dá para ancorar; null = NÃO INFORMADO → hipótese «face até o topo» com a pendência visível */
    var faceAteN = p.faceAte == null || p.faceAte === "" ? null : num(p.faceAte, null);
    var comAncTopo = !!(p.tela && p.ancTopo && p.ancoragem === "tubo" && (faceAteN == null || faceAteN >= topExt + p.pontaMax - 0.10 - 1e-9));
    var pendenciasM = [];
    if (p.tela && p.ancTopo && p.ancoragem === "tubo" && !comAncTopo) aviso("ancTopo desligado: a face/estrutura só vai até " + brf(faceAteN) + " m e a ancoragem do topo ficaria a até " + brf(topExt + p.pontaMax - 0.10) + " m — o balanço da tela é verificado como balanço.");   /* E4.2: o topo com tela ganha transversal e ancoragem na cota da longitudinal de topo */
    var railYs = []; pisoK.forEach(function (k) { railYs.push(yPisoK(k) + p.guarda, yPisoK(k) + p.intermediaria); });
    var juntsDe = {};   /* poste → alturas das emendas, para o desencontro */
    var raioViz = 1.05 * Math.max(W, maxVaoI, maxVaoE);
    posts.forEach(function (q, iq) {
      var top = q.outer || comAncTopo ? topExt : topInt, comTrilho = q.outer || q.cab || (p.guardaInterno && q.inner), prev = [];
      posts.forEach(function (o2) { if (o2.id < q.id && juntsDe[o2.key] && hyp(o2.x - q.x, o2.z - q.z) <= raioViz) prev = prev.concat(juntsDe[o2.key]); });
      var ordem = iq % 2 === 0 ? bars.slice() : bars.slice().reverse();
      var nivelOk = function (e, mTr) { for (var w = 0; w < niveis.length; w++) if (Math.abs(e - niveis[w].y) < mTr - 1e-9) return false; return true; };
      var trilhoOk = function (e) { if (!comTrilho) return true; for (var w = 0; w < railYs.length; w++) if (Math.abs(e - railYs[w]) < 0.15 - 1e-9) return false; return true; };
      var desencOk = function (e) { for (var w = 0; w < prev.length; w++) if (Math.abs(e - prev[w]) < R.emendaDesencontro.padrao - 1e-9) return false; return true; };
      /* uma emenda só por vão (entre duas travessas) e, na opção NR-34, sem tubo de 4,50 a 6,00 m a partir do 2º lance */
      var levIdx = function (y) { var c = 0; for (var w = 0; w < niveis.length; w++) if (niveis[w].y < y) c++; return c; };
      var umaPorVao = function (e, s0p, sIni) { return s0p === sIni || levIdx(e) !== levIdx(s0p); };
      var okBarNr34 = p.nr34Montantes ? function (l, sb) { return !(l >= 4.5 - 1e-9 && sb >= yFoot + lev - 1e-9); } : null;
      /* E4.1 (M2): a emenda do montante FICA JUNTO DO NÓ (0,15 a 0,30 m dele): a luva no meio do levante é o ponto de maior deslocamento na flambagem e a rigidez dela não tem fonte */
      var pertoDoNo = function (e) { for (var w = 0; w < niveis.length; w++) { var dn = Math.abs(e - niveis[w].y); if (dn >= 0.15 - 1e-9 && dn <= 0.30 + 1e-9) return true; } return false; };
      var tentativas = [
        { f: function (e, sp, s0p) { return umaPorVao(e, sp, s0p) && nivelOk(e, 0.15) && pertoDoNo(e) && trilhoOk(e) && desencOk(e); }, av: null },
        { f: function (e, sp, s0p) { return umaPorVao(e, sp, s0p) && nivelOk(e, 0.30) && trilhoOk(e) && desencOk(e); }, av: "emenda de montante a mais de 0,30 m do nó (no meio do levante): a rigidez da luva não tem fonte e o cálculo marca o levante como atenção" },
        { f: function (e, sp, s0p) { return umaPorVao(e, sp, s0p) && nivelOk(e, 0.30) && trilhoOk(e); }, av: "emendas de montantes vizinhos não ficaram desencontradas em 0,50 m" },
        { f: function (e) { return nivelOk(e, 0.30); }, av: "emenda de montante a menos de 0,15 m do guarda-corpo" },
        { f: function (e) { return nivelOk(e, 0.15); }, av: "emenda de montante a menos de 0,30 m de uma travessa" },
        { f: function () { return true; }, av: "emenda de montante sem folga das travessas" }
      ];
      var r = null, usada = -1;
      for (var w2 = 0; w2 < tentativas.length && !r; w2++) { r = cobrir([yFoot], top, top + p.pontaMax, ordem, tentativas[w2].f, null, okBarNr34); usada = w2; }
      if (!r) { r = gulosa(yFoot, top, bars); usada = 9; aviso("Montante em (" + brf(q.x) + "; " + brf(q.z) + "): nenhuma combinação de barras fechou a altura; usei a maior barra repetida."); }
      else if (usada > 0) aviso("Montante em (" + brf(q.x) + "; " + brf(q.z) + "): " + tentativas[usada].av + " (confirmar com o responsável técnico).");
      var y = yFoot, js = [], cor = "M" + q.id, lst = [];
      r.seq.forEach(function (l, i) {
        var b = addBarra("montante", [q.x, y, q.z], [q.x, y + l, q.z], l, cor, { poste: q.key, linha: q.outer ? "e" : "i" });
        lst.push({ id: b.id, y0: y, y1: y + l }); y += l; if (i < r.seq.length - 1) js.push(y);
      });
      for (var i2 = 0; i2 + 1 < lst.length; i2++) addCon("luva", [q.x, lst[i2].y1, q.z], [lst[i2].id, lst[i2 + 1].id]);
      juntsDe[q.key] = js; postBars[q.key] = lst;
      if (r.fim - top > p.pontaMax + 1e-6) aviso("Montante em (" + brf(q.x) + "; " + brf(q.z) + "): balanço de " + brf(r.fim - top) + " m acima do topo (limite " + brf(p.pontaMax) + " m).");
    });
    function barraNoPoste(key, y) {
      var l = postBars[key] || [];
      for (var i = 0; i < l.length; i++) if (y >= l[i].y0 - 1e-6 && y <= l[i].y1 + 1e-6) return l[i].id;
      return null;
    }

    /* ---------------- CORRIDAS horizontais (travessas, varredor, guarda-corpo): tubos postos ponta a ponta sobre os nós */
    function corrida(papel, pts, y, extra) {
      var P0 = pts[0].xz, Pn = pts[pts.length - 1].xz, d = [Pn[0] - P0[0], Pn[1] - P0[1]], Lc = hyp(d[0], d[1]), u = [d[0] / Lc, d[1] / Lc];
      var sP = pts.map(function (q) { return (q.xz[0] - P0[0]) * u[0] + (q.xz[1] - P0[1]) * u[1]; }), vao = 0, i;
      for (i = 0; i + 1 < sP.length; i++) vao = Math.max(vao, sP[i + 1] - sP[i]);
      var lim = 0.30;   /* E4.2: cada luva de longitudinal, guarda-corpo e varredor a no máximo 0,30 m de um montante (a rótula da luva fica praticamente sobre o apoio) */
      var vaoIdx = function (x) { var c = 0; for (var q = 0; q < sP.length; q++) if (sP[q] <= x + 1e-9) c++; return c; };
      /* uma emenda só por vão (apostila) + emenda junto do nó (≤ 0,30 m do montante) e folga de 0,15 m da braçadeira do nó */
      var okE = function (e, sPrev, s0p) { var dm = Infinity; for (var q = 0; q < sP.length; q++) dm = Math.min(dm, Math.abs(e - sP[q])); if (sPrev !== s0p && vaoIdx(e) === vaoIdx(sPrev)) return false; return dm >= R.luvaDistMin.padrao - 1e-9 && dm <= lim + 1e-9; };
      var as = []; for (var a = 0; p.pontaMin + a * 0.05 <= p.pontaMax + 1e-9; a++) as.push(-(p.pontaMin + a * 0.05));
      /* E4.2: toda barra cobre pelo menos 2 montantes (uma barra com 1 montante só vira alavanca e a rótula da luva não é apoiada) */
      var minPostes = Math.min(2, sP.length), okBarra = function (l, sIni) { var c = 0; for (var q = 0; q < sP.length; q++) if (sP[q] >= sIni - 1e-6 && sP[q] <= sIni + l + 1e-6) c++; return c >= minPostes; };
      var r = cobrir(as, Lc + p.pontaMin, Lc + p.pontaMax, bars, okE, Lc, okBarra), relaxou = false;
      if (!r) { r = cobrir(as, Lc + p.pontaMin, Lc + p.pontaMax, bars, function () { return true; }, Lc); relaxou = true; }
      if (!r) { r = gulosa(-p.pontaMin, Lc + p.pontaMin, bars); relaxou = true; }
      if (relaxou) aviso(papel + " de " + brf(Lc) + " m: nenhuma combinação de barras deixa todas as emendas a no máximo 0,30 m de um montante (confirmar com o responsável técnico).");
      var cor = "R" + (++corridaN), s = r.s0, lst = [], k;
      r.seq.forEach(function (l) {
        var b = addBarra(papel, [P0[0] + u[0] * s, y, P0[1] + u[1] * s], [P0[0] + u[0] * (s + l), y, P0[1] + u[1] * (s + l)], l, cor, extra);
        lst.push({ id: b.id, sA: s, sB: s + l }); s += l;
      });
      for (k = 0; k + 1 < lst.length; k++) addCon("luva", [P0[0] + u[0] * lst[k].sB, y, P0[1] + u[1] * lst[k].sB], [lst[k].id, lst[k + 1].id]);
      var fimBal = s - Lc; if (fimBal > p.pontaMax + 1e-6) aviso(papel + " com balanço de " + brf(fimBal) + " m na ponta (limite " + brf(p.pontaMax) + " m).");
      var run = { id: cor, papel: papel, P0: P0, u: u, y: y, bars: lst, sP: sP, pts: pts };
      return run;
    }
    function barraDoRun(run, q) {
      if (!run) return null;
      var s = (q[0] - run.P0[0]) * run.u[0] + (q[1] - run.P0[1]) * run.u[1];
      for (var i = 0; i < run.bars.length; i++) if (s >= run.bars[i].sA - 1e-6 && s <= run.bars[i].sB + 1e-6) return run.bars[i].id;
      return null;
    }
    function acoplarAosPostes(run, y) { run.pts.forEach(function (q) { addCon("fixa", [q.xz[0], y, q.xz[1]], [barraNoPoste(q.key, y), barraDoRun(run, q.xz)]); }); }
    var travRun = {};   /* ti|ln|k → run */
    var dupla = String(p.abracDupla || "").split(/[;,\s]+/).filter(function (x) { return x; });
    trecho.forEach(function (T0) {
      ["i", "e"].forEach(function (ln) {
        niveis.forEach(function (nv) {
          var run = corrida(nv.k === 0 ? "varredor" : "travessa", ln === "e" ? T0.lineE : T0.lineI, nv.y, { nivel: nv.k, linha: ln });
          travRun[T0.ti + "|" + ln + "|" + nv.k] = run; acoplarAosPostes(run, nv.y);
          /* E4.2 (f): abraçadeira DUPLA de segurança nos nós listados em abracDupla ("P4;P6") dos níveis com piso */
          if (nv.piso && dupla.length) run.pts.forEach(function (q) { if (dupla.indexOf(q.key) >= 0) { addCon("fixa", [q.xz[0], nv.y, q.xz[1]], [barraNoPoste(q.key, nv.y), barraDoRun(run, q.xz)]); conexoes[conexoes.length - 1].dupla = true; } });
        });
      });
    });

    /* ---------------- PISO: pranchões comerciais tilando a faixa de cada trecho, emendados por justaposição (NBR 6494 3.1.8.3).
       Depois da decisão de 26/10: as transversais do piso SEGUEM as pranchas — a transversal prende na longitudinal em qualquer ponto,
       então não precisa estar junto do montante. Em cada emenda um PAR de transversais (uma sob cada ponta, a 0,10 m dela); o balanço
       fica em 0,10 m e dentro do limite de 0,20 m da NBR 6494 3.1.8.4. Transversal de nó (a 0,15 m do montante) continua em todo nível. */
    var OFF = 0.15, APOIO = 0.10, plCom = madeira ? CATALOGO.comprPranchaMadeira : CATALOGO.comprPisoMetalico;
    function larguraTransv(w) {
      var Lcom = null, need = w + 2 * OFF - 1e-9;
      for (var i = bars.length - 1; i >= 0; i--) if (bars[i] >= need) { Lcom = bars[i]; break; }
      if (Lcom == null) { Lcom = maxBar; aviso("Largura de " + brf(w) + " m pede transversal maior que o tubo comercial mais longo (" + brf(maxBar) + " m)."); }
      var T2 = Lcom - w, folgaFace = p.afastamento - 0.05, bi = folgaFace >= 0.10 ? Math.min(T2 - 0.10, folgaFace) : 0.10;
      if (T2 < 0.20) bi = T2 / 2;
      return { L: Lcom, bi: Math.max(0.0, bi), bo: T2 - Math.max(0.0, bi) };
    }
    var tr = larguraTransv(W);
    /* as transversais de NÓ de um trecho (posições s ao longo da faixa) */
    trecho.forEach(function (T0) {
      T0.nos = T0.est.map(function (eid, ix) { return est[eid].s + (ix === T0.est.length - 1 ? -OFF : OFF); });
    });
    /* o ladrilhamento da faixa (igual em todos os níveis com piso e em todas as fileiras da largura) */
    function ladrilhar(T0) {
      var sS = T0.sS, sE = T0.sE, nos = T0.nos;
      var juntaOk = function (e) { for (var q = 0; q < nos.length; q++) if (Math.abs(e - nos[q]) < 0.25 - 1e-9) return false; return true; };
      var lens = plCom.slice().sort(function (a, b) { return b - a; }), r = null, folgaMax = 0.10, usou = 0, Lcat = CATALOGO.pecas.alcapao.comprimento;
      /* E10.1: o 1º vão do trecho de acesso é de EXATOS 2,50 m (a portinhola de catálogo, F04): o pranchão desse vão é de 2,50 m e os outros vãos se redistribuem a partir dele */
      if (madeira && acessoEf === "escada" && !closed && T0.ti === 0 && sE - sS >= Lcat + 1.0) {
        var r25 = cobrir([sS + Lcat], sE, sE + 0.10, lens, function (e) { return juntaOk(e); }, null);
        if (r25) { var cells25 = [{ s0: sS, s1: sS + Lcat, L: Lcat }], s25 = sS + Lcat; r25.seq.forEach(function (l) { cells25.push({ s0: s25, s1: s25 + l, L: l }); s25 += l; }); return { cells: cells25, fim: s25, sobra: s25 - sE, usou: 0 }; }
      }
      r = cobrir([sS], sE, sE + 0.10, lens, function (e) { return juntaOk(e); }, null);
      if (!r) { r = cobrir([sS], sE, sE + 0.10, lens, function () { return true; }, null); usou = 1; }
      var f = 0.15;
      while (!r && f <= 1.0 + 1e-9) { r = cobrir([sS], sE, sE + f, lens, function () { return true; }, null); usou = 2; f += 0.05; }
      if (!r) { r = gulosa(sS, sE, lens); usou = 2; }
      var cells = [], s = sS; r.seq.forEach(function (l) { cells.push({ s0: s, s1: s + l, L: l }); s += l; });
      return { cells: cells, fim: s, sobra: s - sE, usou: usou };
    }
    function suportesDe(T0, til) {
      var fl = [];
      til.cells.forEach(function (c, ix) {
        fl.push(c.s0 + APOIO, c.s1 - APOIO);
        var span = (c.s1 - APOIO) - (c.s0 + APOIO), nm = Math.ceil(span / R.pranchaVaoMax.padrao - 1e-9) - 1;
        for (var q = 1; q <= nm; q++) fl.push(c.s0 + APOIO + span * q / (nm + 1));
      });
      var sup = T0.nos.map(function (x) { return { s: x, no: true }; });
      fl.forEach(function (x) { if (!T0.nos.some(function (q) { return Math.abs(x - q) < OFF - 1e-9; })) sup.push({ s: x, no: false }); });
      sup.sort(function (a, b) { return a.s - b.s; });
      return sup;
    }
    var tilePorTrecho = {}, balancoMax = 0, balancoPior = null;
    if (madeira) trecho.forEach(function (T0) {
      var til = ladrilhar(T0); til.sup = suportesDe(T0, til); tilePorTrecho[T0.ti] = til;
      til.cells.forEach(function (c, ix) {
        var dentro = til.sup.filter(function (q) { return q.s > c.s0 + 1e-9 && q.s < c.s1 - 1e-9; }).map(function (q) { return q.s; });
        if (!dentro.length) { violacoes.push({ regra: "NBR 6494 3.1.8", trecho: T0.ti, texto: "Pranchão " + (ix + 1) + " do trecho " + (T0.ti + 1) + " sem apoio nenhum." }); return; }
        var b0 = dentro[0] - c.s0, b1 = c.s1 - dentro[dentro.length - 1], bm = Math.max(b0, b1); c.balanco = r3(bm);
        if (bm > balancoMax) { balancoMax = bm; balancoPior = { trecho: T0.ti, celula: ix, balanco: bm }; }
        if (bm > R.pranchaBalancoMax.padrao + 1e-6) violacoes.push({ regra: "NBR 6494 3.1.8.4", trecho: T0.ti, celula: ix, balanco: r3(bm), texto: "Trecho " + (T0.ti + 1) + ", pranchão " + (ix + 1) + " (" + brf(c.L) + " m): balanço de " + brf(bm) + " m além do apoio — NÃO ATENDE a NBR 6494 (3.1.8.4: máximo 0,20 m)." });
      });
      if (til.sobra > 0.10 + 1e-6) aviso("Trecho " + (T0.ti + 1) + ": nenhuma combinação de pranchões (1,0 a 3,5 m) fecha a faixa de " + brf(T0.sE - T0.sS) + " m com sobra de até 0,10 m; fechou com sobra de " + brf(til.sobra) + " m (balanço fora do limite no pranchão da ponta — o responsável técnico define o complemento).");
    });
    /* transversais */
    function transversal(T0, nv, s, tipo) {
      var Pin = ptAt(T0, s, wI), ns = T0.ns, yA = nv.y + D, a = [Pin[0] - ns[0] * tr.bi, yA, Pin[1] - ns[1] * tr.bi], b = [Pin[0] + ns[0] * (W + tr.bo), yA, Pin[1] + ns[1] * (W + tr.bo)];
      var bb = addBarra("transversal", a, b, tr.L, "T" + (seqB + 1), { nivel: nv.k, trecho: T0.ti, tipo: tipo });
      var pOut = [Pin[0] + ns[0] * W, Pin[1] + ns[1] * W];
      addCon("fixa", [Pin[0], nv.y + D / 2, Pin[1]], [bb.id, barraDoRun(travRun[T0.ti + "|i|" + nv.k], Pin)]);
      addCon("fixa", [pOut[0], nv.y + D / 2, pOut[1]], [bb.id, barraDoRun(travRun[T0.ti + "|e|" + nv.k], pOut)]);
      return bb;
    }
    var nTransvPiso = 0;
    trecho.forEach(function (T0) {
      niveis.forEach(function (nv) {
        if (nv.k === 0) return;
        if (nv.piso && madeira) tilePorTrecho[T0.ti].sup.forEach(function (q) { transversal(T0, nv, q.s, q.no ? "no" : "piso"); if (!q.no) nTransvPiso++; });
        else T0.nos.forEach(function (x) { transversal(T0, nv, x, "no"); });
      });
    });

    /* ---------------- DIAGONAIS (giratória no montante, a ≤ 0,30 m do nó: aqui no próprio nó) */
    var nDiagFach = 0, nDiagTransv = 0;
    trecho.forEach(function (T0) {
      var prumadas = {};
      for (var v = 0; v < T0.nb; v++) if (v === 0 || v === T0.nb - 1 || v % Math.round(p.diagCada) === 0) prumadas[v] = 1;
      Object.keys(prumadas).forEach(function (vk) {
        var v = Number(vk), e0 = est[T0.est[v]], e1 = est[T0.est[v + 1]];
        for (var l = 1; l <= nL; l++) {
          var yA = niveis[l - 1].y, yB = niveis[l].y, sobe = l % 2 === 1;
          var pj = e0.pe, pj1 = e1.pe;
          var P1 = sobe ? [pj[0], yA, pj[1]] : [pj1[0], yA, pj1[1]], P2 = sobe ? [pj1[0], yB, pj1[1]] : [pj[0], yB, pj[1]];
          var kA = postAt(sobe ? pj : pj1), kB = postAt(sobe ? pj1 : pj);
          var b = barraAte("diagonal", P1, P2, "D" + (seqB + 1), { nivel: l, trecho: T0.ti });
          addCon("giratoria", P1, [b.id, barraNoPoste(kA.key, yA)]);
          addCon("giratoria", P2, [b.id, barraNoPoste(kB.key, yB)]);
          nDiagFach++;
        }
      });
    });
    if (p.diagTransv) est.forEach(function (s) {
      if (s.outerOnly || s.id % 2 !== 0) return;
      /* R2 (revisão 27/10): a diagonal NA LARGURA cruza o espaço onde o trabalhador fica em pé. Só entra (a) na estação de CABECEIRA (o plano dela é o do guarda-corpo da
         cabeceira: não obstrui) e (b) no levante cujo nível de baixo NÃO tem piso. Nos demais, nada na largura. */
      var ehCab = cabEst.some(function (c) { return c.st === s; });
      for (var l = 1; l <= nL; l++) {
        if (!ehCab && temPiso[l - 1]) continue;
        var yA = niveis[l - 1].y, yB = niveis[l].y, sobe = l % 2 === 1;
        var P1 = sobe ? [s.pi[0], yA, s.pi[1]] : [s.pe[0], yA, s.pe[1]], P2 = sobe ? [s.pe[0], yB, s.pe[1]] : [s.pi[0], yB, s.pi[1]];
        var b = barraAte("diagonalTransv", P1, P2, "DT" + (seqB + 1), { nivel: l, estacao: s.id });
        addCon("giratoria", P1, [b.id, barraNoPoste(postAt(sobe ? s.pi : s.pe).key, yA)]);
        addCon("giratoria", P2, [b.id, barraNoPoste(postAt(sobe ? s.pe : s.pi).key, yB)]);
        nDiagTransv++;
      }
    });

    /* ---------------- GUARDA-CORPO (travessão + intermediário), nos níveis com piso */
    var guardRuns = {};
    function guardaLinha(T0, ln, k) {
      [[yPisoK(k) + p.guarda, "guarda"], [yPisoK(k) + p.intermediaria, "intermediaria"]].forEach(function (yy) {
        var ptsG = ln === "e" ? T0.lineEg : T0.lineI; if (ptsG.length < 2) return;
        var run = corrida(yy[1], ptsG, yy[0], { nivel: k, linha: ln });
        acoplarAosPostes(run, yy[0]);
        guardRuns[T0.ti + "|" + ln + "|" + k + "|" + yy[1]] = run;
      });
    }
    function cabeceira(c, k) {
      var pI = postAt(c.st.pi), pE = postAt(c.st.pe);
      [[yPisoK(k) + p.guarda, "guarda"], [yPisoK(k) + p.intermediaria, "intermediaria"]].forEach(function (yy) {
        var b = barraAte(yy[1], [c.st.pi[0], yy[0], c.st.pi[1]], [c.st.pe[0], yy[0], c.st.pe[1]], "C" + (seqB + 1), { nivel: k, cabeceira: true });
        addCon("fixa", [c.st.pi[0], yy[0], c.st.pi[1]], [barraNoPoste(pI.key, yy[0]), b.id]);
        addCon("fixa", [c.st.pe[0], yy[0], c.st.pe[1]], [barraNoPoste(pE.key, yy[0]), b.id]);
      });
    }
    pisoK.forEach(function (k) {
      trecho.forEach(function (T0) { guardaLinha(T0, "e", k); if (p.guardaInterno) guardaLinha(T0, "i", k); });
      cabEst.forEach(function (c) { cabeceira(c, k); });
    });
    /* E4.1 (contestação c): POSTE DE GUARDA-CORPO no meio de cada vão (opção posteGuarda): tubo curto preso na longitudinal do piso e nos dois trilhos;
       divide o vão do guarda-corpo por 2 e a carga de 90 kgf/m por poste cai à metade */
    if (p.posteGuarda) pisoK.forEach(function (k) {
      trecho.forEach(function (T0) {
        ["e"].concat(p.guardaInterno ? ["i"] : []).forEach(function (ln) {
          var ptsG = ln === "e" ? T0.lineEg : T0.lineI; if (ptsG.length < 2) return;
          var rg = guardRuns[T0.ti + "|" + ln + "|" + k + "|guarda"], ri = guardRuns[T0.ti + "|" + ln + "|" + k + "|intermediaria"], rt = travRun[T0.ti + "|" + ln + "|" + k];
          for (var iq = 0; iq + 1 < ptsG.length; iq++) {
            var A1 = ptsG[iq].xz, B1 = ptsG[iq + 1].xz, mid = [(A1[0] + B1[0]) / 2, (A1[1] + B1[1]) / 2], yb = niveis[k].y, ytop = yPisoK(k) + p.guarda + 0.05, len = ytop - yb, Lc = null;
            for (var ib = bars.length - 1; ib >= 0; ib--) if (bars[ib] >= len - 1e-9) { Lc = bars[ib]; break; }
            if (Lc == null) Lc = maxBar;
            var bp = addBarra("posteGuarda", [mid[0], ytop - Lc, mid[1]], [mid[0], ytop, mid[1]], Lc, "G" + (seqB + 1), { nivel: k, linha: ln });
            addCon("fixa", [mid[0], yb, mid[1]], [bp.id, barraDoRun(rt, mid)]);
            addCon("fixa", [mid[0], yPisoK(k) + p.guarda, mid[1]], [bp.id, barraDoRun(rg, mid)]);
            addCon("fixa", [mid[0], yPisoK(k) + p.intermediaria, mid[1]], [bp.id, barraDoRun(ri, mid)]);
          }
        });
      });
    });
    /* E4.1 (C3) + E4.2: longitudinal a 0,10 m abaixo do TOPO FÍSICO dos montantes (balanço da tela, NR-18 18.12.15.1): amarra a tela e os montantes entre si.
       Com ancTopo (padrão com tela e ancoragem por tubo) entram também a longitudinal da linha interna, as transversais e as ancoragens NESSA cota:
       o topo fica contido (perpendicular à fachada pela ancoragem e pela transversal) e o balanço vira viga entre o nó do piso e o nó do topo. */
    var yTT = null, topRun = {};
    if (p.tela && p.travaTopo) {
      var topFis = Infinity;
      posts.forEach(function (q) { var l = postBars[q.key]; if (!l || !l.length) return; if (q.outer || (comAncTopo && q.inner)) topFis = Math.min(topFis, l[l.length - 1].y1); });
      yTT = r4((isFinite(topFis) ? topFis : topExt) - 0.10);
      if (comAncTopo && faceAteN == null) pendenciasM.push("ancTopo: confirmar pelo RT que há onde ancorar a " + brf(yTT) + " m (face/estrutura existente até essa cota); informe faceAte.");
      trecho.forEach(function (T0) {
        var ptsT = T0.lineEg; if (ptsT.length < 2) return;
        var runT = corrida("travaTopo", ptsT, yTT, { nivel: nL, linha: "e" });
        acoplarAosPostes(runT, yTT); topRun[T0.ti + "|e"] = runT;
        if (comAncTopo && T0.lineI.length >= 2) { var runI = corrida("travaTopo", T0.lineI, yTT, { nivel: nL, linha: "i" }); acoplarAosPostes(runI, yTT); topRun[T0.ti + "|i"] = runI; }
        if (comAncTopo) T0.nos.forEach(function (sx) {
          var Pin = ptAt(T0, sx, wI), ns2 = T0.ns, a1 = [Pin[0] - ns2[0] * tr.bi, yTT, Pin[1] - ns2[1] * tr.bi], b1 = [Pin[0] + ns2[0] * (W + tr.bo), yTT, Pin[1] + ns2[1] * (W + tr.bo)];
          var bt2 = addBarra("transversalTopo", a1, b1, tr.L, "TT" + (seqB + 1), { nivel: nL, trecho: T0.ti, tipo: "topo" });
          var pOut2 = [Pin[0] + ns2[0] * W, Pin[1] + ns2[1] * W];
          addCon("fixa", [Pin[0], yTT - D / 2, Pin[1]], [bt2.id, barraDoRun(topRun[T0.ti + "|i"], Pin)]);
          addCon("fixa", [pOut2[0], yTT - D / 2, pOut2[1]], [bt2.id, barraDoRun(topRun[T0.ti + "|e"], pOut2)]);
        });
      });
    }

    /* ---------------- PISOS: as pranchas de cada fileira da largura; o ALÇAPÃO do acesso (E9) */
    var nAlc = Math.ceil(CATALOGO.pecas.alcapao.largura / pw - 1e-9);
    var usaLance = acessoEf === "escada";
    var posAcc = usaLance ? Math.max(0, Math.min(1, num(p.acessoPos, 0))) * Ltotal : -1, tAcc = 0, sAcc = 0, cellAcc = -1;
    if (posAcc >= 0) {
      for (ti = 0; ti < nT; ti++) if (posAcc <= trecho[ti].cumIni + trecho[ti].L + 1e-9 || ti === nT - 1) { tAcc = ti; break; }
      sAcc = Math.max(trecho[tAcc].sS, Math.min(trecho[tAcc].sE, posAcc - trecho[tAcc].cumIni));
    }
    function celulasDe(T0) {
      if (madeira) return tilePorTrecho[T0.ti].cells;
      var cs = [];   /* piso metálico: uma peça por vão (o gancho engata na transversal do nó) */
      vaos.filter(function (V) { return V.trecho === T0.ti; }).forEach(function (V) {
        var need = V.spanI - 1e-6, Lp = null; for (var i = 0; i < plCom.length; i++) if (plCom[i] >= need && plCom[i] - V.spanI <= 0.05 + 1e-6) { Lp = plCom[i]; break; }
        if (Lp == null) { Lp = plCom[0]; aviso("Piso metálico só em vão de 2,00 m; use madeira ou ajuste o vão (aqui " + brf(V.spanI) + " m)."); }
        cs.push({ s0: V.s0, s1: V.s1, L: Lp, centro: (V.s0 + V.s1) / 2 });
      });
      return cs;
    }
    if (usaLance && nPr < nAlc + 1) aviso("Poucos pranchões na largura (" + nPr + ") para o alçapão de 0,60 m + piso: aumente os pranchões ou mude o acesso.");
    var cellsPor = {}; trecho.forEach(function (T0) { cellsPor[T0.ti] = celulasDe(T0); });
    if (posAcc >= 0) { var cs0 = cellsPor[tAcc]; for (var ic = 0; ic < cs0.length; ic++) if (sAcc <= cs0[ic].s1 + 1e-9) { cellAcc = ic; break; } if (cellAcc < 0) cellAcc = cs0.length - 1; }

    /* ---- E9: escolha do vão e geometria das escadas de mão por lance (NR-18 18.8.6.13, 18.8.2 b, 18.12.14 a) ----
       Um lance por levante, inclinado a ~75° (de 50° a 75°), do piso k−1 ao piso k, passando pela portinhola do piso k e ultrapassando-o em 1,00 m (vertical).
       Lances ALTERNADOS: o pé do lance de cima fica no extremo oposto do vão, onde o piso é maciço — a portinhola de um piso nunca fica sobre o pé do lance de cima. */
    var latAcc = wI + D / 2 + 0.005 + nAlc * pw / 2, planoAcc = null, lanceK = {};
    function comercialPranch(x) { for (var q = 0; q < plCom.length; q++) if (Math.abs(plCom[q] - x) < 1e-6) return true; return false; }
    /* E10.1: a escada se inclina ATRAVÉS da largura (pé na faixa de fora, topo para o lado da face) e atravessa a portinhola de CATÁLOGO (0,60 × 2,50 m, F04) que fica na faixa
       de dentro: o pé do lance de cima fica sempre em piso maciço (a faixa de fora), nunca sobre a portinhola. Os lances alternam de lugar ao longo da portinhola (±0,60 m). */
    function conflitoLance(T0, ln, virt) {   /* os dois banzos do lance contra todo tubo já montado (e os que ainda vão existir) */
      var rad = D / 2 + 0.016 + 0.01, hit = null;
      [-1, 1].forEach(function (sg) {
        var pa = ptAt(T0, ln.sf + sg * 0.2, ln.latF), pb = ptAt(T0, ln.sf + sg * 0.2, ln.latT), A1 = [pa[0], ln.yf, pa[1]], B1 = [pb[0], ln.yt, pb[1]];
        barrasM.concat(virt).forEach(function (bq) { if (hit) return; var d = segDist(A1, B1, bq.a, bq.b); if (d < rad) hit = { lance: ln.k, barra: bq.id, papel: bq.papel, d: d }; });
      });
      return hit;
    }
    function planejarLances(ti, ix) {
      var T0 = trecho[ti], c = cellsPor[ti][ix], cS0 = c.s0, cS1 = c.s0 + c.L, Ee = CATALOGO.pecas.escadaMao, th = Ee.anguloAlvo * GRAU, ult = R.escadaUltrapassa.padrao, Lcat = CATALOGO.pecas.alcapao.comprimento;
      var run = lev / Math.tan(th), Lreq = (lev + ult) / Math.sin(th), Lc = Math.ceil(Lreq / Ee.passoCompr - 1e-9) * Ee.passoCompr, cat = false, h0 = cS0, h1 = cS1;
      var cm = (cS0 + cS1) / 2, v0 = 0; for (var qv = 0; qv + 1 < T0.est.length; qv++) if (est[T0.est[qv]].s <= cm + 1e-9) v0 = qv;
      v0 = Math.min(v0, T0.est.length - 2); var sa = est[T0.est[v0]].s, sb = est[T0.est[v0 + 1]].s;
      /* a portinhola de catálogo: 2,50 m dentro do pranchão do vão, com pedaços de pranchão comercial (ou nada) dos dois lados; a mais perto do meio do vão */
      if (madeira && c.L >= Lcat - 1e-9) {
        var melhorD = 1e9;
        [0].concat(plCom).forEach(function (lf) {
          var hs = cS0 + lf, rt = cS1 - hs - Lcat; if (rt < -1e-9 || !(rt < 1e-6 || comercialPranch(rt))) return;
          var d = Math.abs(hs + Lcat / 2 - cm); if (d < melhorD - 1e-9) { melhorD = d; h0 = hs; h1 = hs + Lcat; cat = true; }
        });
      }
      var latF = latAcc + run, latT = latF - Lc * Math.cos(th), virt = [], visto = {}, k, i;
      if (cat) [h0, h1].forEach(function (ss) { if (ss - cS0 < 1e-6 || cS1 - ss < 1e-6) return; for (var kq = 1; kq <= nL; kq++) [ss - 0.10, ss + 0.10].forEach(function (sx) { var yA = niveis[kq].y + D, a0 = ptAt(T0, sx, wI - tr.bi), b0 = ptAt(T0, sx, wI + W + tr.bo); virt.push({ a: [a0[0], yA, a0[1]], b: [b0[0], yA, b0[1]], papel: "transversal (junção da portinhola)", id: "virt" }); }); });
      for (var kq2 = 1; kq2 < nL; kq2++) if (!temPiso[kq2]) [sa, sb].forEach(function (sx) {
        var e0 = null; for (var qe = 0; qe < T0.est.length; qe++) if (Math.abs(est[T0.est[qe]].s - sx) < 1e-6) e0 = est[T0.est[qe]];
        if (e0) [p.guarda, p.intermediaria].forEach(function (hh2) { virt.push({ a: [e0.pi[0], yPisoK(kq2) + hh2, e0.pi[1]], b: [e0.pe[0], yPisoK(kq2) + hh2, e0.pe[1]], papel: "guarda-corpo do patamar", id: "virt" }); });
      });
      var lances = [], hmid = (h0 + h1) / 2, meia = (h1 - h0) / 2 - 0.25, hitTot = null;
      for (k = 1; k <= nL; k++) {
        var sgn = k % 2 === 1 ? -1 : 1, ords = [sgn * 0.6, -sgn * 0.6, sgn * 0.3, -sgn * 0.3, 0, sgn * 0.9, -sgn * 0.9], escolha = null;
        for (i = 0; i < ords.length && !escolha; i++) {
          if (Math.abs(ords[i]) > meia + 1e-9) continue;
          var ln = { k: k, dir: ords[i] > 1e-9 ? 1 : (ords[i] < -1e-9 ? -1 : 0), sf: hmid + ords[i], latF: latF, latT: latT, yf: (k - 1) * lev, yt: (k - 1) * lev + Lc * Math.sin(th), Lc: Lc, Lreq: Lreq, run: run, h0: h0, h1: h1 };
          if (!conflitoLance(T0, ln, virt)) escolha = ln;
          else if (i === 0 || !lances[k - 1]) lances[k - 1] = ln;
        }
        if (!escolha) { escolha = lances[k - 1] || { k: k, dir: 1, sf: hmid, latF: latF, latT: latT, yf: (k - 1) * lev, yt: (k - 1) * lev + Lc * Math.sin(th), Lc: Lc, Lreq: Lreq, run: run, h0: h0, h1: h1 }; hitTot = conflitoLance(T0, escolha, virt) || hitTot; }
        var pa = ptAt(T0, escolha.sf, latF), pb = ptAt(T0, escolha.sf, latT); escolha.a = pa; escolha.b = pb; lances[k - 1] = escolha;
      }
      return { lances: lances, zig: cat, cat: cat, Lh: h1 - h0, ti: ti, ix: ix, T0: T0, c: c, th: th, virt: virt, hit: hitTot };
    }
    function conflitoLances(pl) { return pl.hit; }
    if (usaLance) {
      var cand = [], ehCantoIni = function (t0) { return closed || t0 > 0; }, ehCantoFim = function (t0) { return closed || t0 < nT - 1; }, autoPos = num(p.acessoPos, 0) === 0;
      if (autoPos) {   /* auto: o 1º vão de uma cabeceira (trecho aberto) ou um vão que não seja de canto */
        for (var t1 = 0; t1 < nT; t1++) { var cl = cellsPor[t1]; for (var i1 = 0; i1 < cl.length; i1++) if (!(i1 === 0 && ehCantoIni(t1)) && !(i1 === cl.length - 1 && ehCantoFim(t1))) cand.push([t1, i1]); }
        if (!cand.length) { cand.push([tAcc, Math.max(0, cellAcc)]); aviso("Todos os vãos são de canto: a escada ficou no vão " + (Math.max(0, cellAcc) + 1) + " do trecho " + (tAcc + 1) + " (confirmar com o responsável técnico)."); }
      } else {
        cand.push([tAcc, Math.max(0, cellAcc)]);
        var cl2 = cellsPor[tAcc], viz = []; for (var i2 = 0; i2 < cl2.length; i2++) if (i2 !== cellAcc) viz.push(i2);
        viz.sort(function (x, y) { return Math.abs(x - cellAcc) - Math.abs(y - cellAcc) || x - y; }); viz.forEach(function (i3) { cand.push([tAcc, i3]); });
      }
      var escolhido = null, motivoDesloc = [], semCat = null;
      for (var q1 = 0; q1 < cand.length && !escolhido; q1++) {
        var pl = planejarLances(cand[q1][0], cand[q1][1]), hit = conflitoLances(pl);
        if (hit) { motivoDesloc.push("vão " + (cand[q1][1] + 1) + " (" + hit.papel + " " + hit.barra + " a " + brf(hit.d, 3) + " m da escada)"); continue; }
        if (pl.cat || !madeira) escolhido = pl; else if (!semCat) semCat = pl;
      }
      if (!escolhido && semCat) { escolhido = semCat; aviso("Nenhum vão tem pranchão de 2,50 m ou mais para a portinhola de catálogo (0,60 × 2,50 m, F04): aumente o vão ou o comprimento do pranchão — a portinhola ficou do comprimento do pranchão do vão " + (semCat.ix + 1) + " (" + brf(semCat.c.L) + " m), a confirmar com a locadora."); }
      if (!escolhido) { escolhido = planejarLances(cand[0][0], cand[0][1]); aviso("A escada de acesso encosta em tubo do andaime em todos os vãos tentados (" + motivoDesloc.join("; ") + "): o responsável técnico define o vão."); }
      else if (motivoDesloc.length) aviso("Escada de acesso deslocada: " + motivoDesloc.join("; ") + ".");
      planoAcc = escolhido; tAcc = planoAcc.ti; cellAcc = planoAcc.ix; planoAcc.lances.forEach(function (ln) { lanceK[ln.k] = ln; });
      if (!madeira) aviso("Piso metálico no vão de acesso: a portinhola de catálogo é de madeira (0,60 × 2,50 m); a locadora confirma a peça do piso metálico.");
    }
    var areaForrada = 0, sobreposicaoMax = 0;
    function addBoard(T0, k, ix, m, cS0, cS1) {   /* uma prancha da fileira m, do trecho T0, entre cS0 e cS1 */
      var yc = yPisoK(k) - espPiso / 2, lat = wI + D / 2 + 0.005 + pw / 2 + m * pw, A0 = ptAt(T0, cS0, lat), B0 = ptAt(T0, cS1, lat), cc = cellsPor[T0.ti][ix];
      var pr = { id: "P" + (++seqP), tipo: madeira ? "madeira" : "metalico", cod: madeira ? "pranchaMadeira" : "pisoMetalico", nivel: k, trecho: T0.ti, celula: ix, slot: m,
        a: [r4(A0[0]), r4(yc), r4(A0[1])], b: [r4(B0[0]), r4(yc), r4(B0[1])], L: r4(cS1 - cS0), larg: pw, esp: espPiso, yTopo: r4(yPisoK(k)), balanco: cc.balanco == null ? null : cc.balanco };
      if (!temPiso[k]) pr.patamar = true;
      pranchas.push(pr); areaForrada += (cS1 - cS0) * pw;
      if (madeira) { addCon("prancha", pr.a, [pr.id]); addCon("prancha", pr.b, [pr.id]); }
      return pr;
    }
    function pecasHatch(T0, c, ix, k) {   /* a portinhola do lance k (0,60 × Lh) e, ao lado, o piso maciço que sobra do vão */
      var ln = lanceK[k], yc = yPisoK(k) - espPiso / 2, AH = ptAt(T0, ln.h0, latAcc), BH = ptAt(T0, ln.h1, latAcc);
      pranchas.push({ id: "P" + (++seqP), tipo: "alcapao", cod: "alcapao", nivel: k, trecho: T0.ti, celula: ix + "h", slot: 0, a: [r4(AH[0]), r4(yc), r4(AH[1])], b: [r4(BH[0]), r4(yc), r4(BH[1])], L: r4(ln.h1 - ln.h0), larg: CATALOGO.pecas.alcapao.largura, esp: espPiso, yTopo: r4(yPisoK(k)), lance: k, patamar: !temPiso[k] });
      if (planoAcc.zig) {
        [[c.s0, ln.h0], [ln.h1, c.s0 + c.L]].forEach(function (seg) {   /* o piso maciço dos dois lados da portinhola */
          if (seg[1] - seg[0] < 1e-6) return;
          for (var mm2 = 0; mm2 < nAlc; mm2++) { var pm2 = addBoard(T0, k, ix, mm2, seg[0], seg[1]); pm2.macico = true; pm2.celula = ix + "m" + (seg[0] > ln.h0 ? "2" : "1"); }   /* a «célula» do cálculo é um pranchão contínuo sobre os seus apoios: cada pedaço é a sua */
        });
        [ln.h0, ln.h1].forEach(function (ss) {   /* par de transversais sob cada junção portinhola × piso maciço (apoio das duas pontas) */
          if (ss - c.s0 < 1e-6 || c.s0 + c.L - ss < 1e-6) return;
          transversal(T0, niveis[k], ss - 0.10, "piso"); transversal(T0, niveis[k], ss + 0.10, "piso"); nTransvPiso += 2;
        });
      }
    }
    pisoK.forEach(function (k) {
      trecho.forEach(function (T0) {
        cellsPor[T0.ti].forEach(function (c, ix) {
          var hatch = usaLance && T0.ti === tAcc && ix === cellAcc;
          for (var m = 0; m < nPr; m++) {
            if (hatch && m < nAlc) continue;
            addBoard(T0, k, ix, m, c.s0, c.s0 + c.L);
          }
          if (hatch) pecasHatch(T0, c, ix, k);
        });
      });
    });
    if (violacoes.length) aviso(violacoes.length + " pranchão(ões) fora da regra da NBR 6494 (3.1.8 / 3.1.8.4). Primeiro: " + violacoes[0].texto);

    /* ---------------- RODAPÉ de madeira (a "saia"): na face interna dos montantes externos e das cabeceiras */
    var rdCom = bars.filter(function (b) { return b <= 4 + 1e-9; });
    function comprimentoRodape(dist) { for (var i = rdCom.length - 1; i >= 0; i--) if (rdCom[i] >= dist - 1e-6) return rdCom[i]; return null; }
    var seqR = 0;
    function addRodape(k, A0, B0, cabece) {
      var dist = hyp(B0[0] - A0[0], B0[1] - A0[1]), Lr = comprimentoRodape(dist);
      if (Lr == null) { Lr = rdCom.length ? rdCom[0] : 4; aviso("Rodapé de " + brf(dist) + " m maior que a tábua comercial de 4 m: divida o vão."); }
      var u = [(B0[0] - A0[0]) / dist, (B0[1] - A0[1]) / dist], Cm = [(A0[0] + B0[0]) / 2, (A0[1] + B0[1]) / 2];
      var rd = { id: "RD" + (++seqR), cod: "rodapeMadeira", nivel: k, a: [r4(Cm[0] - u[0] * Lr / 2), r4(yPisoK(k) + p.rodape / 2), r4(Cm[1] - u[1] * Lr / 2)], b: [r4(Cm[0] + u[0] * Lr / 2), r4(yPisoK(k) + p.rodape / 2), r4(Cm[1] + u[1] * Lr / 2)],
        L: Lr, alt: p.rodape, esp: p.rodapeEsp, yTopo: r4(yPisoK(k) + p.rodape), cabeceira: !!cabece };
      rodapes.push(rd);
      [A0, B0].forEach(function (E) { for (var q = 0; q < 2; q++) addCon("rodape", [E[0], yPisoK(k) + p.rodape / 2, E[1]], [rd.id]); });
      return rd;
    }
    var recuo = D / 2 + p.rodapeEsp / 2;
    pisoK.forEach(function (k) {
      trecho.forEach(function (T0) {
        [["e", T0.lineEg, -1]].concat(p.guardaInterno ? [["i", T0.lineI, 1]] : []).forEach(function (cfg) {
          var pts = cfg[1], sg = cfg[2];
          for (var v = 0; v + 1 < pts.length; v++) addRodape(k, [pts[v].xz[0] + T0.ns[0] * sg * recuo, pts[v].xz[1] + T0.ns[1] * sg * recuo], [pts[v + 1].xz[0] + T0.ns[0] * sg * recuo, pts[v + 1].xz[1] + T0.ns[1] * sg * recuo], false);
        });
      });
      cabEst.forEach(function (c, ix) {
        var sg = ix === 0 ? 1 : -1;
        addRodape(k, [c.st.pi[0] + c.T0.u[0] * sg * recuo, c.st.pi[1] + c.T0.u[1] * sg * recuo], [c.st.pe[0] + c.T0.u[0] * sg * recuo, c.st.pe[1] + c.T0.u[1] * sg * recuo], true);
      });
    });

    /* ---------------- BASES e CALÇOS */
    posts.forEach(function (q, iq) {
      var T0 = trecho[q.trecho], b = { id: "BS" + (iq + 1), cod: p.base === "rodizio" ? "rodizio" : (p.base === "fixa" ? "baseFixa" : "baseRegulavel"), tipo: p.base, pos: [q.x, hCalco, q.z], y0: hCalco, h: hBase, rosca: rosca, poste: q.key };
      basesM.push(b);
      addCon("base", [q.x, hCalco + hBase / 2, q.z], [barraNoPoste(q.key, yFoot + 0.01), b.id]);
      if (hCalco > 0) calcos.push({ id: "CL" + (iq + 1), cod: "calco", pos: [q.x, hCalco / 2, q.z], L: 0.5, larg: CATALOGO.pecas.pranchaMadeira.largura, esp: hCalco, u: [T0.u[0], T0.u[1]], base: b.id });
    });

    /* ---------------- ANCORAGENS (tubo de amarração nos montantes INTERNOS, malha ancH × ancV) */
    if (p.ancoragem === "tubo") {
      var k0 = null;
      for (var kk2 = 1; kk2 <= nL; kk2++) if (niveis[kk2].y >= 2.0 - 1e-9) { k0 = kk2; break; }
      var alvoY = []; if (k0 != null) for (var yy = niveis[k0].y; yy <= hTop + 1e-9; yy += p.ancV) alvoY.push(yy);
      var linhasK = {}; alvoY.forEach(function (yv) { var kb = 1, db = Infinity; for (var kq = 1; kq <= nL; kq++) { var dd = Math.abs(niveis[kq].y - yv); if (dd < db - 1e-9) { db = dd; kb = kq; } } linhasK[kb] = true; });
      linhasK[nL] = true;
      var ks = Object.keys(linhasK).map(Number).sort(function (a, b) { return a - b; }), feito = {};
      /* só as estações cuja face existe (dentro do comprimento traçado do trecho): a sobra do canto corrido não tem parede para amarrar */
      var estAnc = est.filter(function (s) { return !s.outerOnly && s.s >= -1e-6 && s.s <= trecho[s.trecho].L + 1e-6; });
      ks.forEach(function (kAnc, r) {
        var deslocar = (r % 2) * p.ancH / 2;
        for (var sCum = deslocar; sCum <= Ltotal + 1e-9; sCum += p.ancH) {
          var best = null, bd = Infinity;
          estAnc.forEach(function (s) { var dd = Math.abs(s.cum - sCum); if (dd < bd - 1e-9) { bd = dd; best = s; } });
          if (best == null) continue;
          var kp = postAt(best.pi).key;
          if (feito[kp + "|" + kAnc]) continue;
          feito[kp + "|" + kAnc] = true;
          var T0 = trecho[best.trecho], yA = niveis[kAnc].y + D, face = [best.pi[0] - T0.ns[0] * p.afastamento, best.pi[1] - T0.ns[1] * p.afastamento];
          var Lt = null; for (var iq = bars.length - 1; iq >= 0; iq--) if (bars[iq] >= p.afastamento + 0.15 - 1e-9) { Lt = bars[iq]; break; }
          if (Lt == null) Lt = maxBar;
          var bt = addBarra("ancoragem", [face[0], yA, face[1]], [face[0] + T0.ns[0] * Lt, yA, face[1] + T0.ns[1] * Lt], Lt, "A" + (seqB + 1), { nivel: kAnc, estacao: best.id });
          addCon("fixa", [best.pi[0], yA, best.pi[1]], [bt.id, barraNoPoste(kp, yA)]);
          addCon("fixa", [best.pi[0], niveis[kAnc].y + D / 2, best.pi[1]], [bt.id, barraDoRun(travRun[best.trecho + "|i|" + kAnc], best.pi)]);
          anc.push({ id: "AN" + (anc.length + 1), barra: bt.id, estacao: best.id, nivel: kAnc, y: r4(yA), olhal: { tipo: "olhal", carga: null, cod: "olhal", pos: [r4(face[0]), r4(yA), r4(face[1])] } });
        }
      });
      /* E4.2: ancoragem do TOPO na cota da longitudinal de topo, nas mesmas estações da última fiada */
      if (comAncTopo && yTT != null) anc.filter(function (a0) { return a0.nivel === nL && !a0.topo; }).slice().forEach(function (a0) {
        var best2 = est[a0.estacao], T2 = trecho[best2.trecho], kp2 = postAt(best2.pi).key, b0 = barrasM.filter(function (x) { return x.id === a0.barra; })[0], runI2 = topRun[T2.ti + "|i"];
        if (!b0 || !runI2) return;
        var bt3 = addBarra("ancoragem", [b0.a[0], yTT, b0.a[2]], [b0.b[0], yTT, b0.b[2]], b0.L, "A" + (seqB + 1), { nivel: nL, estacao: a0.estacao, topo: true });
        addCon("fixa", [best2.pi[0], yTT, best2.pi[1]], [bt3.id, barraNoPoste(kp2, yTT)]);
        addCon("fixa", [best2.pi[0], yTT - D / 2, best2.pi[1]], [bt3.id, barraDoRun(runI2, best2.pi)]);
        anc.push({ id: "AN" + (anc.length + 1), barra: bt3.id, estacao: a0.estacao, nivel: nL, y: r4(yTT), topo: true, olhal: { tipo: "olhal", carga: null, cod: "olhal", pos: [r4(b0.a[0]), r4(yTT), r4(b0.a[2])] } });
      });
    } else if (closed) aviso("Anel fechado sem ancoragem: o responsável técnico confirma a estabilidade.");

    /* ---------------- ACESSO (E9) */
    var acessoInfo = { pedido: p.acesso, modo: acessoEf, motivo: acessoMotivo, notas: [], plataformas: [], fixacoes: [], cancelas: [], regras: [] };
    var torre = null;
    if (acessoEf === "escada" && planoAcc) {
      var Ee = CATALOGO.pecas.escadaMao, TAc = trecho[tAcc];
      planoAcc.lances.forEach(function (ln) {
        var lenU = ln.Lc - 0.30, nDeg = Math.max(2, Math.ceil(lenU / 0.30 - 1e-9));
        acessos.push({ id: "AC" + ln.k, tipo: "escada", cod: "escadaMao", nivel: ln.k, lance: ln.k, trecho: tAcc, celula: cellAcc, externa: false, larg: Ee.largura, L: r4(ln.Lc), Lnec: r4(ln.Lreq),
          angulo: Ee.anguloAlvo, ultrapasse: r4(ln.yt - yPisoK(ln.k)), degrausEntre: [0.25, 0.30], degrau: r4(lenU / nDeg), nDegraus: nDeg, dir: ln.dir, fixada: { base: true, topo: true },
          a: [r4(ln.a[0]), r4(ln.yf), r4(ln.a[1])], b: [r4(ln.b[0]), r4(ln.yt), r4(ln.b[1])], u: [r4(-TAc.ns[0]), r4(-TAc.ns[1])], inclinaAtravesDaLargura: true });
      });
      acessoInfo.regras.push("NR-18 18.12.14 a", "NR-18 18.8.6.13", "NR-18 18.8.2 b");
      /* PATAMARES de acesso nos levantes sem piso de trabalho: o lance k+1 precisa de onde partir. Piso do vão inteiro, portinhola, e guarda-corpo (travessão, intermediário e rodapé)
         nos 3 lados abertos do vão — a escada de mão não leva ninguém a um piso sem proteção (NR-18 18.9.4.2). */
      var cAc = cellsPor[tAcc][cellAcc];
      for (var kp = 1; kp < nL; kp++) {
        if (temPiso[kp]) continue;
        for (var mp = nAlc; mp < nPr; mp++) addBoard(TAc, kp, cellAcc, mp, cAc.s0, cAc.s0 + cAc.L).patamar = true;
        pecasHatch(TAc, cAc, cellAcc, kp);
        var cmid = cAc.s0 + cAc.L / 2, v0 = 0;
        for (var qv = 0; qv + 1 < TAc.est.length; qv++) if (est[TAc.est[qv]].s <= cmid + 1e-9) v0 = qv;
        v0 = Math.min(v0, TAc.est.length - 2);
        var e0 = est[TAc.est[v0]], e1 = est[TAc.est[v0 + 1]], kE0 = postAt(e0.pe), kE1 = postAt(e1.pe), kI0 = postAt(e0.pi), kI1 = postAt(e1.pi);
        [[yPisoK(kp) + p.guarda, "guarda"], [yPisoK(kp) + p.intermediaria, "intermediaria"]].forEach(function (yy) {
          var bo = barraAte(yy[1], [e0.pe[0], yy[0], e0.pe[1]], [e1.pe[0], yy[0], e1.pe[1]], "G" + (seqB + 1), { nivel: kp, patamar: true });
          addCon("fixa", [e0.pe[0], yy[0], e0.pe[1]], [bo.id, barraNoPoste(kE0.key, yy[0])]); addCon("fixa", [e1.pe[0], yy[0], e1.pe[1]], [bo.id, barraNoPoste(kE1.key, yy[0])]);
          [[e0, kI0, kE0], [e1, kI1, kE1]].forEach(function (tr3) {
            var bc = barraAte(yy[1], [tr3[0].pi[0], yy[0], tr3[0].pi[1]], [tr3[0].pe[0], yy[0], tr3[0].pe[1]], "G" + (seqB + 1), { nivel: kp, patamar: true });
            addCon("fixa", [tr3[0].pi[0], yy[0], tr3[0].pi[1]], [bc.id, barraNoPoste(tr3[1].key, yy[0])]); addCon("fixa", [tr3[0].pe[0], yy[0], tr3[0].pe[1]], [bc.id, barraNoPoste(tr3[2].key, yy[0])]);
          });
        });
        addRodape(kp, [e0.pe[0] - TAc.ns[0] * recuo, e0.pe[1] - TAc.ns[1] * recuo], [e1.pe[0] - TAc.ns[0] * recuo, e1.pe[1] - TAc.ns[1] * recuo], false);
        [[e0, 1], [e1, -1]].forEach(function (cc3) { addRodape(kp, [cc3[0].pi[0] + TAc.u[0] * cc3[1] * recuo, cc3[0].pi[1] + TAc.u[1] * cc3[1] * recuo], [cc3[0].pe[0] + TAc.u[0] * cc3[1] * recuo, cc3[0].pe[1] + TAc.u[1] * cc3[1] * recuo], false); });
        acessoInfo.notas.push("Patamar de acesso no levante " + kp + " (sem piso de trabalho): piso do vão, portinhola e guarda-corpo nos três lados.");
      }
      acessoInfo.notas.push("Portinhola de catálogo de " + brf(planoAcc.Lh) + " × 0,60 m (F04); a escada se inclina através da largura e o pé do lance de cima fica na faixa de piso maciço.");
      acessoInfo.notas.push("Portinhola fechada após a passagem (NR-18 18.12.14; boa prática de checklist).");
    } else if (acessoEf === "marinheiro") {
      var Mx = CATALOGO.pecas.escadaMarinheiro, ultM = 1.15, HtotM = hTop + ultM, nLanceM = HtotM <= 10 + 1e-9 ? 1 : Math.ceil(HtotM / 6 - 1e-9), segHM = HtotM / nLanceM;
      var c0 = cabEst.length ? cabEst[0] : { T0: trecho[0], st: est[trecho[0].est[0]] }, T00 = c0.T0, oM = [-T00.u[0], -T00.u[1]];
      var baseA = [(c0.st.pi[0] + c0.st.pe[0]) / 2 + oM[0] * (0.30 + D), (c0.st.pi[1] + c0.st.pe[1]) / 2 + oM[1] * (0.30 + D)], modN = 0;
      for (var lM = 0; lM < nLanceM; lM++) {
        var y0M = lM * segHM, y1M = (lM + 1) * segHM, offM = nLanceM === 1 ? 0 : (lM % 2 === 0 ? -0.35 : 0.35), baseL = [baseA[0] + T00.ns[0] * offM, baseA[1] + T00.ns[1] * offM];
        var nModL = Math.ceil((y1M - y0M) / Mx.modulo - 1e-9);
        for (var mdl = 0; mdl < nModL; mdl++) {
          var ya = y0M + mdl * Mx.modulo, yb = Math.min(ya + Mx.modulo, y1M);
          acessos.push({ id: "AC" + (++modN), tipo: "marinheiro", cod: "escadaMarinheiro", modulo: modN, lance: lM + 1, larg: Mx.largura, L: r4(yb - ya), a: [r4(baseL[0]), r4(ya), r4(baseL[1])], b: [r4(baseL[0]), r4(yb), r4(baseL[1])], u: [r4(oM[0]), r4(oM[1])], nivel: Math.min(nL, Math.max(1, Math.ceil(yb / lev - 1e-9))), eixo: r4(offM), primeiraBarra: 0.15, afastamento: r4(0.30 + D / 2) });
        }
        if (lM < nLanceM - 1) acessoInfo.plataformas.push({ y: r4(y1M), largura: 0.60, profundidade: 0.60, guardaCorpo: true, centro: [r4(baseA[0] + oM[0] * 0.30), r4(baseA[1] + oM[1] * 0.30)], cod: "plataformaDescanso" });
      }
      for (var yfx = 3.0; yfx < HtotM - 1e-9; yfx += 3.0) acessoInfo.fixacoes.push(r4(yfx));
      acessoInfo.fixacoes.push(r4(hTop));
      acessoInfo.marinheiro = { alturaTotal: r4(HtotM), lances: nLanceM, alturaLance: r4(segHM), ultrapasse: ultM, eixosParalelos: nLanceM > 1 ? 0.70 : null, primeiraBarra: 0.15, afastamento: r4(0.30 + D / 2) };
      acessoInfo.regras.push("NR-18 18.8.6.2", "NR-18 18.8.6.3");
      acessoInfo.notas.push("SPIQ obrigatório acima de 2 m na escada marinheiro (NR-18 18.8.6.3).");
      acessoInfo.notas.push("Abertura no guarda-corpo da cabeceira para a chegada ao piso do topo (cancela): confirmar com o responsável técnico.");
      acessoInfo.cancelas.push({ nivel: nL, cod: "cancela", local: "cabeceira" });
    } else if (acessoEf === "coletiva") {
      /* TORRE DE ESCADA de uso coletivo (NR-18 18.12.14 b; 18.8.6.1): tubo-roll próprio, acoplado à cabeceira, em lances duplos (ida e volta) de meio levante —
         patamar a cada meio levante (≤ 2,0 m < 2,9 m), largura 0,60 m por lance, espelho ≤ 0,20 m, corrimão dos dois lados, guarda-corpo nos patamares.
         O patamar de chegada fica rente à cabeceira, onde uma cancela substitui o fechamento do guarda-corpo. */
      var Ec = CATALOGO.pecas.escadaColetiva, noIni = num(p.acessoPos, 0) < 0.5, cTw = noIni ? cabEst[0] : cabEst[1], TT = cTw.T0, stT = cTw.st, oT = noIni ? [-TT.u[0], -TT.u[1]] : [TT.u[0], TT.u[1]], nsT = TT.ns;
      var nb0 = barrasM.length, nc0 = conexoes.length, g0 = 0.30, nPT = Math.ceil((1.40 - D - 0.01) / pw - 1e-9), Wt = Math.max(W, nPT * pw + D + 0.01), meio = lev / 2;
      var nEsp = Math.ceil(meio / Ec.espelhoMax - 1e-9), espT = meio / nEsp, runT = (nEsp - 1) * Ec.pisoMin;
      var XA = 1.30, XB = XA + runT, F = [0, 1.10, XB + 0.20, XB + 1.30], Lt = F[3];   /* frames em X; patamares de 1,5 m apoiados em F0–F1 (próximo) e F2–F3 (distante) */
      function Pw(X, Yl) { return [stT.pi[0] + oT[0] * (g0 + X) + nsT[0] * Yl, stT.pi[1] + oT[1] * (g0 + X) + nsT[1] * Yl]; }
      var twPost = {}, twLong = {}, nivT = [];
      for (var jT = 0; jT <= 2 * nL; jT++) nivT.push({ j: jT, yPiso: jT * meio, y: jT === 0 ? yVarr : jT * meio - espPiso - 1.5 * D });
      function okEmenda(e) { for (var w = 0; w < nivT.length; w++) if (Math.abs(e - nivT[w].y) < 0.30 - 1e-9) return false; return true; }
      var topT = hTop + p.guarda + 0.05;
      F.forEach(function (Xf, jf) {
        [0, Wt].forEach(function (Yl, jy) {
          var xz = Pw(Xf, Yl), key = "TW" + jf + jy, rT = cobrir([yFoot], topT, topT + p.pontaMax, bars.slice(), function (e) { return okEmenda(e); }, null) || cobrir([yFoot], topT, topT + p.pontaMax, bars.slice(), function () { return true; }, null) || gulosa(yFoot, topT, bars);
          var yq = yFoot, lstT = [];
          rT.seq.forEach(function (l, i) { var bT = addBarra("montante", [xz[0], yq, xz[1]], [xz[0], yq + l, xz[1]], l, "MT" + key, { poste: key, linha: jy ? "e" : "i", torre: true }); lstT.push({ id: bT.id, y0: yq, y1: yq + l }); yq += l; });
          for (var i3 = 0; i3 + 1 < lstT.length; i3++) addCon("luva", [xz[0], lstT[i3].y1, xz[1]], [lstT[i3].id, lstT[i3 + 1].id]);
          twPost[jf + "|" + jy] = { key: key, xz: xz, bars: lstT };
        });
      });
      function twNoPoste(jf, jy, y) { var l = twPost[jf + "|" + jy].bars; for (var i = 0; i < l.length; i++) if (y >= l[i].y0 - 1e-6 && y <= l[i].y1 + 1e-6) return l[i].id; return null; }
      function twLongo(papel, jy, ja, jb, y, extra) {
        var P1 = twPost[ja + "|" + jy].xz, P2 = twPost[jb + "|" + jy].xz, bT = barraAte(papel, [P1[0], y, P1[1]], [P2[0], y, P2[1]], "L" + (seqB + 1), extra);
        addCon("fixa", [P1[0], y, P1[1]], [bT.id, twNoPoste(ja, jy, y)]); addCon("fixa", [P2[0], y, P2[1]], [bT.id, twNoPoste(jb, jy, y)]);
        return bT;
      }
      nivT.forEach(function (nvT) {
        var papelT = nvT.j === 0 ? "varredor" : "travessa";
        [0, 1].forEach(function (jy) { for (var jf = 0; jf < F.length - 1; jf++) twLongo(papelT, jy, jf, jf + 1, nvT.y, { nivel: nvT.j / 2, nivelT: nvT.j, torre: true }); });
        if (nvT.j >= 1) {
          F.forEach(function (Xf, jf) {   /* transversal em cada frame (apoio dos patamares) */
            var A1 = twPost[jf + "|0"].xz, B1 = twPost[jf + "|1"].xz, bT = barraAte("transversal", [A1[0], nvT.y + D, A1[1]], [B1[0], nvT.y + D, B1[1]], "T" + (seqB + 1), { nivel: nvT.j / 2, nivelT: nvT.j, torre: true });
            addCon("fixa", [A1[0], nvT.y + D / 2, A1[1]], [bT.id, twNoPoste(jf, 0, nvT.y)]); addCon("fixa", [B1[0], nvT.y + D / 2, B1[1]], [bT.id, twNoPoste(jf, 1, nvT.y)]);
          });
          /* guarda-corpo do patamar: travessão e intermediário nas duas linhas e na ponta do fundo */
          [[nvT.yPiso + p.guarda, "guarda"], [nvT.yPiso + p.intermediaria, "intermediaria"]].forEach(function (yy) {
            [0, 1].forEach(function (jy) { for (var jf = 0; jf < F.length - 1; jf++) twLongo(yy[1], jy, jf, jf + 1, yy[0], { nivel: nvT.j / 2, nivelT: nvT.j, torre: true, patamar: true }); });
            var A2 = twPost["3|0"].xz, B2 = twPost["3|1"].xz, bE = barraAte(yy[1], [A2[0], yy[0], A2[1]], [B2[0], yy[0], B2[1]], "G" + (seqB + 1), { nivel: nvT.j / 2, nivelT: nvT.j, torre: true, patamar: true });
            addCon("fixa", [A2[0], yy[0], A2[1]], [bE.id, twNoPoste(3, 0, yy[0])]); addCon("fixa", [B2[0], yy[0], B2[1]], [bE.id, twNoPoste(3, 1, yy[0])]);
          });
          for (var jf2 = 0; jf2 < F.length - 1; jf2++) {   /* diagonal no plano externo, alternada */
            var Pa = twPost[jf2 + "|1"].xz, Pb = twPost[(jf2 + 1) + "|1"].xz, yA = nivT[nvT.j - 1].y, yB = nvT.y, sobe = (jf2 + nvT.j) % 2 === 0;
            var Q1 = sobe ? [Pa[0], yA, Pa[1]] : [Pb[0], yA, Pb[1]], Q2 = sobe ? [Pb[0], yB, Pb[1]] : [Pa[0], yB, Pa[1]], bD = barraAte("diagonal", Q1, Q2, "D" + (seqB + 1), { nivel: nvT.j / 2, nivelT: nvT.j, torre: true });
            addCon("giratoria", Q1, [bD.id, twNoPoste(sobe ? jf2 : jf2 + 1, 1, yA)]); addCon("giratoria", Q2, [bD.id, twNoPoste(sobe ? jf2 + 1 : jf2, 1, yB)]);
          }
          if (nvT.j % 2 === 0) {   /* ligação ao andaime: um tubo em cada linha, na cota da travessa do levante */
            var kLev = nvT.j / 2, yL = niveis[kLev].y;
            [[stT.pi, 0, 0], [stT.pe, W, 1]].forEach(function (lg) {
              var Pt = twPost["0|" + lg[2]].xz, kq = postAt(lg[0]), bL = barraAte("travessa", [lg[0][0], yL, lg[0][1]], [Pt[0], yL, Pt[1]], "L" + (seqB + 1), { nivel: kLev, torre: true, ligacao: true });
              addCon("fixa", [lg[0][0], yL, lg[0][1]], [bL.id, barraNoPoste(kq.key, yL)]); addCon("fixa", [Pt[0], yL, Pt[1]], [bL.id, twNoPoste(0, lg[2], yL)]);
            });
          }
        }
      });
      torre = { barras: barrasM.splice(nb0), conexoes: conexoes.splice(nc0), pranchas: [], bases: [], calcos: [], acessos: [], largura: r4(Wt), comprimento: r4(Lt), frames: F.map(r4), g0: g0, lado: noIni ? "inicio" : "fim" };
      torre.barras.forEach(function (bq) { bq.torre = true; });
      torre.conexoes.forEach(function (cq) { cq.torre = true; });
      /* bases e calços dos pontaletes da torre */
      Object.keys(twPost).forEach(function (kq, iq) {
        var pt = twPost[kq], b = { id: "BT" + (iq + 1), cod: p.base === "rodizio" ? "rodizio" : (p.base === "fixa" ? "baseFixa" : "baseRegulavel"), tipo: p.base, pos: [r4(pt.xz[0]), hCalco, r4(pt.xz[1])], y0: hCalco, h: hBase, rosca: rosca, poste: pt.key, torre: true };
        torre.bases.push(b);
        if (hCalco > 0) torre.calcos.push({ id: "CT" + (iq + 1), cod: "calco", pos: [r4(pt.xz[0]), hCalco / 2, r4(pt.xz[1])], L: 0.5, larg: CATALOGO.pecas.pranchaMadeira.largura, esp: hCalco, u: [r4(oT[0]), r4(oT[1])], base: b.id, torre: true });
      });
      /* patamares (pranchões de 1,5 m, uma fileira por 0,30 m de largura) e lances */
      var seqPT = 0;
      function tabuaT(j, X0, X1, kind) {
        for (var mT = 0; mT < nPT; mT++) {
          var Yl = D / 2 + 0.005 + pw / 2 + mT * pw, A0 = Pw(X0, Yl), B0 = Pw(X1, Yl), yc = nivT[j].yPiso - espPiso / 2;
          torre.pranchas.push({ id: "PT" + (++seqPT), tipo: "madeira", cod: "pranchaMadeira", nivel: j / 2, nivelT: j, tipoPatamar: kind, trecho: TT.ti, a: [r4(A0[0]), r4(yc), r4(A0[1])], b: [r4(B0[0]), r4(yc), r4(B0[1])], L: r4(X1 - X0), larg: pw, esp: espPiso, yTopo: r4(nivT[j].yPiso), torre: true });
        }
      }
      for (var jP = 1; jP <= 2 * nL; jP++) { if (jP % 2 === 0) tabuaT(jP, -0.20, 1.30, "chegada"); else tabuaT(jP, XB, XB + 1.50, "intermediario"); }
      var bandas = [D / 2 + 0.05 + Ec.largura / 2, Wt - D / 2 - 0.05 - Ec.largura / 2];   /* eixos das duas bandas (lance de subida e de volta) */
      for (var kT = 1; kT <= nL; kT++) {
        [0, 1].forEach(function (vol) {   /* vol 0: sobe de X=XA a X=XB; vol 1: sobe de X=XB a X=XA */
          var yi = (kT - 1) * lev + vol * meio, xi = vol ? XB : XA, xf = vol ? XA : XB, Aw = Pw(xi, bandas[vol]), Bw = Pw(xf, bandas[vol]);
          torre.acessos.push({ id: "AC" + (2 * kT - 1 + vol), tipo: "escadaColetiva", cod: "escadaColetiva", nivel: kT, lance: 2 * kT - 1 + vol, larg: Ec.largura, L: r4(hyp(runT, meio)), nDegraus: nEsp, espelho: r4(espT), piso: Ec.pisoMin, corrimao: "dois lados",
            patamarBaixo: r4(yi), patamarAlto: r4(yi + meio), a: [r4(Aw[0]), r4(yi), r4(Aw[1])], b: [r4(Bw[0]), r4(yi + meio), r4(Bw[1])], u: [r4((Bw[0] - Aw[0]) / Math.max(1e-6, runT)), r4((Bw[1] - Aw[1]) / Math.max(1e-6, runT))], torre: true });
        });
      }
      for (var kc = 1; kc <= nL; kc++) if (temPiso[kc]) acessoInfo.cancelas.push({ nivel: kc, cod: "cancela", local: "chegada da torre ao piso " + brf(yPisoK(kc)) + " m" });
      acessoInfo.torre = { largura: Wt, comprimento: Lt, espelho: r4(espT), degraus: nEsp, patamarCada: r4(meio), larguraLance: Ec.largura, lancesPorLevante: 2, lado: torre.lado };
      acessoInfo.regras.push("NR-18 18.12.14 b", "NR-18 18.8.6.1");
      acessoInfo.notas.push("Largura de 0,60 m por lance (NR-18 18.12.14 b); a regra geral de escada fixa de uso coletivo (18.8.6.1 c) fala em 0,80 m: confirmar com o responsável técnico.");
      acessoInfo.notas.push("Cancela na chegada ao piso de trabalho: sem item de norma, boa prática (confirmar com o responsável técnico).");
      acessoInfo.notas.push("Rodapé dos patamares da torre (0,15 m, NR-18 18.9.4.2 c): instalar em obra; a torre não é verificada pelo cálculo (montantes, bases e ligação ao andaime): o responsável técnico confere.");
      pendenciasM.push("Torre de escada coletiva: montantes, bases, ancoragem e ligação ao andaime NÃO são verificados pelo cálculo deste sistema; o responsável técnico verifica (NR-18 18.12.14 b).");
    }

    /* ---------------- TELA e MEDIDAS */
    var perimE = 0; trecho.forEach(function (T0) { if (T0.lineEg.length > 1) perimE += T0.lineEg[T0.lineEg.length - 1].s - T0.lineEg[0].s; });
    var kPrim = pisoK[0], altTela = (hTop - yPisoK(kPrim)) + 2.0, tela = { area: p.tela ? r3(perimE * altTela) : 0, perimetro: r3(perimE), altura: r3(altTela) };
    var nCon = { fixa: 0, giratoria: 0, luva: 0, base: 0, rodape: 0, prancha: 0 };
    var conexoesTodas = conexoes.concat(torre ? torre.conexoes : []), barrasTodas = barrasM.concat(torre ? torre.barras : []);
    conexoesTodas.forEach(function (c) { nCon[c.tipo] = (nCon[c.tipo] || 0) + 1; });
    var metros = 0, peso = 0, semPeso = {};
    barrasTodas.forEach(function (b) { metros += b.L; });
    if (T.kgm != null) peso += metros * T.kgm; else aviso("Peso do tubo sem fonte (perfil " + p.tubo + " não está no catálogo de perfis): não somado.");
    function somaPeca(cod, qtd, L, dim) {
      var pu = pesoDaPeca(cod, L, dim);
      if (pu == null) { if (qtd > 0) semPeso[cod] = 1; return; }
      peso += pu * qtd;
    }
    somaPeca("bracFixa", nCon.fixa); somaPeca("bracGiratoria", nCon.giratoria); somaPeca("luva", nCon.luva);
    basesM.concat(torre ? torre.bases : []).forEach(function (b) { somaPeca(b.cod, 1); });
    pranchas.concat(torre ? torre.pranchas : []).forEach(function (x) { somaPeca(x.cod, 1, x.L, x.cod === "alcapao" ? { a: x.larg, e: x.esp } : null); });
    rodapes.forEach(function (x) { somaPeca(x.cod, 1, x.L, { a: x.alt, e: x.esp }); });
    calcos.concat(torre ? torre.calcos : []).forEach(function (x) { somaPeca("calco", 1, x.L); });
    acessos.concat(torre ? torre.acessos : []).forEach(function (x) { somaPeca(x.cod, 1, x.L); });
    acessoInfo.cancelas.forEach(function () { somaPeca("cancela", 1); }); acessoInfo.plataformas.forEach(function () { somaPeca("plataformaDescanso", 1); }); acessoInfo.fixacoes.forEach(function () { somaPeca("fixacaoMarinheiro", 1); });
    anc.forEach(function () { somaPeca("olhal", 1); });
    Object.keys(semPeso).forEach(function (cod) { aviso("Peso de " + CATALOGO.pecas[cod].nome.toLowerCase() + " sem fonte: não somado."); });
    var areaPiso = 0, linhaMedia = 0; trecho.forEach(function (T0) { areaPiso += (T0.sE - T0.sS) * W; linhaMedia += (T0.sE - T0.sS); });
    var medidas = {
      comprimento: r3(Ltotal), alturaPiso: p.altura, largura: r4(W), nVaos: nVaos, nLevantes: nL, nPisos: pisoK.length, areaPiso: r3(areaPiso), areaPisoTotal: r3(areaPiso * pisoK.length), areaForrada: r3(areaForrada),
      areaFachada: r3(perimE * p.altura), volume: r3(linhaMedia * W * p.altura), nMontantes: posts.length + (torre ? torre.bases.length : 0), nTubosMontante: barrasTodas.filter(function (b) { return b.papel === "montante"; }).length, metrosTubo: r3(metros),
      nConexoes: nCon, nConexoesTotal: conexoesTodas.length, pesoTotal: r3(peso), hBase: hBase, roscaBase: rosca, hCalco: hCalco, yPeMontante: r4(yFoot), nPranchasLargura: nPr, folgaForracao: r4(folga),
      transversal: { L: tr.L, balancoFace: r4(tr.bi), balancoFora: r4(tr.bo) }, nTubos: barrasTodas.length, nTubosTorre: torre ? torre.barras.length : 0, nDiagonais: nDiagFach, nDiagonaisTransv: nDiagTransv, nAncoragens: anc.length, nTransversaisPiso: nTransvPiso,
      vaoExternoMax: r3(maxVaoE), vaoInternoMax: r3(maxVaoI), balancoPranchaoMax: madeira ? r3(balancoMax) : null, fechado: closed
    };
    if (!closed && nT === 1 && trecho[0].nb === 1 && p.ancoragem === "nenhuma") medidas.relacaoTorre = r3(p.altura / Math.min(trecho[0].L, W));
    var rt = ["afastamento", "vaoMax", "levanteMax", "hVarredor", "rodapeEsp", "diagCada", "ancH", "ancV", "roscaBase", "densMadeira"].map(function (kq) { return { chave: kq, valor: kq === "densMadeira" ? R.densMadeira.padrao : p[kq], fonteId: R[kq].fonteId, obs: R[kq].obs }; });
    return { ok: true, avisos: avisos, par: p, niveis: niveis,
      estacoes: est.map(function (s) { return { id: s.id, trecho: s.trecho, k: s.k, s: r3(s.s), pi: s.pi ? [r4(s.pi[0]), r4(s.pi[1])] : null, pe: [r4(s.pe[0]), r4(s.pe[1])], outerOnly: s.outerOnly, cum: r3(s.cum) }; }),
      postes: posts.map(function (q) { return { id: q.id, key: q.key, x: q.x, z: q.z, inner: q.inner, outer: q.outer, cab: q.cab }; }),
      trechos: trecho.map(function (t) { return { ti: t.ti, L: r3(t.L), nb: t.nb, sS: r3(t.sS), sE: r3(t.sE), sOS: t.sOS == null ? null : r3(t.sOS), sOE: t.sOE == null ? null : r3(t.sOE), est: t.est.slice(), u: t.u, ns: t.ns,
        celulas: (cellsPor[t.ti] || []).map(function (c) { return { s0: r3(c.s0), L: c.L, balanco: c.balanco == null ? null : c.balanco }; }) }; }), vaos: vaos,
      barras: barrasM, conexoes: conexoes, pranchas: pranchas, rodapes: rodapes, bases: basesM, calcos: calcos, ancoragens: anc, acessos: acessos, torre: torre, acessoInfo: acessoInfo, acessoEscolhido: { pedido: p.acesso, modo: acessoEf, motivo: acessoMotivo },
      tela: tela, medidas: medidas, violacoes: violacoes, tubo: { cat: p.tubo, D: D, Dmm: T.Dmm, kgm: T.kgm, kgmBim: T.kgmBim, rotulo: T.rotulo }, barrasComerciais: bars, parametrosRT: rt, yOffCalco: 0, pendencias: pendenciasM, faceAte: faceAteN };
  }

  /* o peso unitário de uma peça do catálogo (null = sem fonte) */
  function pesoDaPeca(cod, L, dim) {
    var c = CATALOGO.pecas[cod]; if (!c) return null;
    /* madeira fora da tabela (rodapé, alçapão): volume × densidade DERIVADA da apostila (790 kg/m³, confirmarRT) — o peso deixa de contar 0 */
    if (c.volumetrico) return L == null || !dim ? null : r3(PARAMETROS_RT.densMadeira.padrao * L * dim.a * dim.e);
    /* pranchão: 9 kg/m (apostila R1) = a tabela "peso tábua/piso" 38 mm: 1,0 → 9 · 1,5 → 13,5 · 2,0 → 18 · 2,5 → 22,5 · 3,0 → 27 · 3,5 → 31,5 kg */
    if (c.pesoPorM != null) return L == null ? null : r3(c.pesoPorM * L);
    if (c.pesos) { var v = c.pesos[(Math.round(num(L, 0) * 100) / 100).toFixed(2)]; return v == null ? null : v; }
    return c.pesoKg == null ? null : c.pesoKg;
  }

  /* ================================================================ LISTA DE LOCAÇÃO
   * Agrega o modelo na ordem do pedido: tubos, conexões, bases, pisos, rodapés, acesso, ancoragem, tela.
   * Os nomes são os que o MERCADO escreve (Pontalete, Longitudinal, Transversal, Portinhola, Abraçadeira Fixa…) e as colunas
   * seguem a relação de materiais de projeto de andaime: ITEM · QNT · PEÇA · DIMENSÕES · COMP. (m) · ÁREA (m²) · PESO UNIT · PESO TOTAL. */
  /* tudo o que o modelo tem, inclusive a torre de escada coletiva (que fica em modelo.torre para o cálculo do andaime principal não a confundir com a estrutura que ele verifica) */
  function todos(modelo) {
    var t = modelo && modelo.torre ? modelo.torre : null;
    return { barras: arr(modelo.barras).concat(t ? t.barras : []), conexoes: arr(modelo.conexoes).concat(t ? t.conexoes : []), pranchas: arr(modelo.pranchas).concat(t ? t.pranchas : []), bases: arr(modelo.bases).concat(t ? t.bases : []),
      calcos: arr(modelo.calcos).concat(t ? t.calcos : []), acessos: arr(modelo.acessos).concat(t ? t.acessos : []) };
  }
  var COLUNAS_LOCACAO = ["ITEM", "QNT", "PEÇA", "DIMENSÕES", "COMP. (m)", "ÁREA (m²)", "PESO UNIT", "PESO TOTAL"];
  var NOME_TUBO = { montante: "Pontalete", travessa: "Longitudinal", varredor: "Longitudinal", guarda: "Longitudinal", intermediaria: "Longitudinal", transversal: "Transversal", diagonal: "Diagonal", diagonalTransv: "Diagonal", ancoragem: "Tubo de Amarração", travaTopo: "Longitudinal", transversalTopo: "Transversal", posteGuarda: "Poste de Guarda-corpo" };
  function pecasLocacao(modelo) {
    if (!modelo || !modelo.ok) return [];
    if (ehMulti(modelo)) { var Ml = Multi(); return Ml ? Ml.pecasLocacao(modelo) : []; }
    var out = [], T = modelo.tubo || tuboInfo(CATALOGO.tubo.cat), P = modelo.par || PADRAO;
    function linha(cod, peca, dimensoes, qtd, L, area, extra) {
      var c = CATALOGO.pecas[cod], dimP = cod === "rodapeMadeira" ? { a: P.rodape, e: P.rodapeEsp } : (cod === "alcapao" ? { a: 0.60, e: CATALOGO.pecas.pranchaMadeira.esp } : null), pu = cod === "tubo" ? (T.kgm != null && L != null ? r3(T.kgm * L) : null) : pesoDaPeca(cod, L, dimP);
      if (cod === "abracRodape") pu = 1.30;
      var fonte = cod === "tubo" ? "Peso " + brf(T.kgm, 2) + " kg/m: " + CATALOGO.FONTES[CATALOGO.tubo.kgmListaFonteId].rotulo + "; tubo Ø 48,3 mm: " + CATALOGO.FONTES[CATALOGO.tubo.fonteId].rotulo : (c ? (c.fonteId ? c.fonteId + " — " + CATALOGO.FONTES[c.fonteId].rotulo : "SEM FONTE de catálogo") : "");
      var o = { item: out.length + 1, cod: cod, peca: peca, dimensoes: dimensoes || "", nomeLocacao: peca + (dimensoes ? " " + dimensoes : "") + (L != null && cod !== "tela" ? " — " + brf(L, 2) + " m" : ""),
        descricao: cod === "tubo" ? "Tubo de aço do andaime tubo-roll, comprimento comercial (tubo de locação não se corta)." : (c ? c.descricao : ""), un: cod === "tubo" ? "pç" : (c ? c.un : "pç"),
        qtd: qtd, qnt: qtd, comp: L == null ? null : L, area: area == null ? null : r3(area * qtd), pesoUnit: pu, pesoTotal: pu == null ? null : r3(pu * qtd), fonte: fonte, confirmarRT: cod === "tubo" ? false : !!(c && c.confirmarRT) };
      if (L != null) o.L = L;
      if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
      out.push(o);
    }
    var porL = {}, ordemK = [], dimTubo = "Ø" + brf(T.Dmm, 1) + " × " + brf(CATALOGO.tubo.paredeNominalMm, 1) + " mm";
    todos(modelo).barras.forEach(function (b) { var nm = NOME_TUBO[b.papel] || "Tubo", k = nm + "|" + b.L.toFixed(2); if (!porL[k]) { porL[k] = { nm: nm, L: b.L, q: 0 }; ordemK.push(k); } porL[k].q++; });
    var ordNome = ["Pontalete", "Longitudinal", "Poste de Guarda-corpo", "Transversal", "Diagonal", "Tubo de Amarração", "Tubo"];
    ordemK.sort(function (a, b) { var A = porL[a], B = porL[b], d = ordNome.indexOf(A.nm) - ordNome.indexOf(B.nm); return d !== 0 ? d : B.L - A.L; });
    ordemK.forEach(function (k) { var g = porL[k]; linha("tubo", g.nm, dimTubo, g.q, g.L, Math.PI * T.D * g.L, { papelTubo: g.nm }); });
    var nc = modelo.medidas.nConexoes;
    if (nc.fixa) linha("bracFixa", CATALOGO.pecas.bracFixa.peca, "", nc.fixa, null);
    if (nc.giratoria) linha("bracGiratoria", CATALOGO.pecas.bracGiratoria.peca, "", nc.giratoria, null);
    if (nc.luva) linha("luva", CATALOGO.pecas.luva.peca, "", nc.luva, null);
    var cods = {}; todos(modelo).bases.forEach(function (b) { cods[b.cod] = (cods[b.cod] || 0) + 1; });
    Object.keys(cods).forEach(function (cod) { linha(cod, CATALOGO.pecas[cod].peca, "", cods[cod], null); });
    var n = todos(modelo).calcos.length; if (n) linha("calco", CATALOGO.pecas.calco.peca, "0,30 × 0,038 × 0,50 m", n, 0.5);
    function porComprimento(lista, cod, filtro, pecaTxt, dimFn, areaFn) {
      var m = {}; lista.forEach(function (x) { if (filtro && !filtro(x)) return; var k = x.L.toFixed(2); m[k] = (m[k] || 0) + 1; });
      Object.keys(m).sort(function (a, b) { return Number(b) - Number(a); }).forEach(function (k) { linha(cod, pecaTxt, dimFn(Number(k)), m[k], Number(k), areaFn(Number(k))); });
    }
    var pm = CATALOGO.pecas.pranchaMadeira;
    porComprimento(todos(modelo).pranchas, "pranchaMadeira", function (x) { return x.tipo === "madeira"; }, pm.peca, function () { return "C × " + brf(pm.largura, 2) + " × " + brf(pm.esp, 3) + " m"; }, function (L) { return L * pm.largura; });
    porComprimento(todos(modelo).pranchas, "pisoMetalico", function (x) { return x.tipo === "metalico"; }, "Piso Metálico com gancho", function () { return "C × 0,37 m"; }, function (L) { return L * 0.37; });
    porComprimento(modelo.pranchas, "alcapao", function (x) { return x.tipo === "alcapao"; }, CATALOGO.pecas.alcapao.peca, function () { return "C × 0,60 m"; }, function (L) { return L * 0.60; });
    porComprimento(modelo.rodapes, "rodapeMadeira", null, CATALOGO.pecas.rodapeMadeira.peca, function () { return "C × " + brf(P.rodape, 2) + " × " + brf(P.rodapeEsp, 3) + " m"; }, function (L) { return L * P.rodape; });
    var ncRod = nc.rodape; if (ncRod) linha("abracRodape", "Abraçadeira de Rodapé", "", ncRod, null, null, { descricao: "Prende a tábua do rodapé ao montante (2 por tábua por montante cruzado).", un: "pç", fonte: "Peso 1,30 kg: " + CATALOGO.FONTES.R1.rotulo, confirmarRT: true });
    var ncPr = nc.prancha; if (ncPr) linha("presilhaPrancha", "Presilha de Pranchão", "", ncPr, null, null, { descricao: "Trava o pranchão contra deslocamento e desencaixe (NR-18 18.12.5 e 18.12.7; NBR 6494 3.1.8): 2 por pranchão.", un: "pç", fonte: "SEM FONTE de catálogo (presilha de prancha)", confirmarRT: true });
    var esc = modelo.acessos.filter(function (a) { return a.tipo === "escada"; });
    if (esc.length) { var mE = {}; esc.forEach(function (a) { var k = a.L.toFixed(2); mE[k] = (mE[k] || 0) + 1; }); Object.keys(mE).sort(function (a, b) { return Number(b) - Number(a); }).forEach(function (k) { linha("escadaMao", CATALOGO.pecas.escadaMao.peca, "0,40 m", mE[k], Number(k)); }); }
    var mar = modelo.acessos.filter(function (a) { return a.tipo === "marinheiro"; });
    if (mar.length) { var mM = {}; mar.forEach(function (a) { var k = a.L.toFixed(2); mM[k] = (mM[k] || 0) + 1; }); Object.keys(mM).sort(function (a, b) { return Number(b) - Number(a); }).forEach(function (k) { linha("escadaMarinheiro", CATALOGO.pecas.escadaMarinheiro.peca, "marinheiro 0,40 m (módulo)", mM[k], Number(k)); }); }
    var info = modelo.acessoInfo || {}, tAc = modelo.torre ? modelo.torre.acessos : [];
    if (tAc.length) linha("escadaColetiva", CATALOGO.pecas.escadaColetiva.peca, "0,60 m, espelho " + brf(tAc[0].espelho, 2) + " m", tAc.length, tAc[0].L);
    if (arr(info.plataformas).length) linha("plataformaDescanso", CATALOGO.pecas.plataformaDescanso.peca, "0,60 × 0,60 m", info.plataformas.length, null);
    if (arr(info.fixacoes).length) linha("fixacaoMarinheiro", CATALOGO.pecas.fixacaoMarinheiro.peca, "", info.fixacoes.length, null);
    if (arr(info.cancelas).length) linha("cancela", CATALOGO.pecas.cancela.peca, "", info.cancelas.length, null);
    n = modelo.ancoragens.length; if (n) linha("olhal", "Olhal / chumbador de ancoragem", "", n, null);
    if (modelo.tela && modelo.tela.area > 0) linha("tela", "Tela de proteção", "(m²)", modelo.tela.area, null, null, { area: modelo.tela.area });
    return out;
  }
  /* a relação de materiais pronta para a prancha/planilha: colunas + linhas + total geral */
  function tabelaLocacao(modelo) {
    if (ehMulti(modelo)) { var Mt = Multi(); if (Mt) return Mt.tabelaLocacao(modelo); }
    var l = pecasLocacao(modelo), pt = 0, ar = 0, qt = 0;
    var linhas = l.map(function (r) {
      if (r.pesoTotal != null) pt += r.pesoTotal; if (r.area != null) ar += r.area; qt += r.cod === "tela" ? 0 : r.qtd;
      var o = {}; o["ITEM"] = r.item; o["QNT"] = r.qtd; o["PEÇA"] = r.peca; o["DIMENSÕES"] = r.dimensoes; o["COMP. (m)"] = r.comp; o["ÁREA (m²)"] = r.area; o["PESO UNIT"] = r.pesoUnit; o["PESO TOTAL"] = r.pesoTotal; return o;
    });
    return { colunas: COLUNAS_LOCACAO.slice(), linhas: linhas, total: { qtd: qt, area: r3(ar), pesoTotal: r3(pt) }, avisoPeso: l.some(function (r) { return r.pesoTotal == null; }) ? "Linhas sem peso de fonte não entram no total." : "" };
  }

  /* ================================================================ REGISTRO NAS PEÇAS PRONTAS (E2) */
  var NOME_PAPEL = { montante: "Montante do andaime", travessa: "Travessa do andaime", varredor: "Varredor do andaime", transversal: "Transversal do andaime", diagonal: "Diagonal do andaime",
    diagonalTransv: "Diagonal transversal do andaime", guarda: "Guarda-corpo do andaime (travessão)", intermediaria: "Guarda-corpo do andaime (intermediário)", ancoragem: "Tubo de ancoragem do andaime",
    travaTopo: "Longitudinal de topo do andaime", transversalTopo: "Transversal de topo do andaime", posteGuarda: "Poste de guarda-corpo do andaime" };

  /* E7: as famílias ra-andaime-* (js/familiasandaime.js) — sem elas o gerador volta às caixas provisórias do E2 */
  function FAnd() { var Fa = dep("FamiliasAndaime", "./familiasandaime.js"); return Fa && Fa.cota ? Fa : null; }
  /* ⚠ teto de conexões desenhadas com as famílias: a medida que sustenta o número está no bloco [desempenho] de tools/test-familiasandaime.js */
  var TETO_CONEXOES_FAM = 6000;
  function gerar(p, K, novoId, ctx, H) {
    if (ehMulti(p)) { var Mg = Multi(); return Mg ? Mg.gerar(p, K, novoId, ctx, H) : { erro: ERRO_MULTI }; }
    var mod = montar(p);
    if (!mod.ok) return { erro: mod.erro };
    var BA = dep("BimArq", "./bimarq.js"), F = K.F, yOff = mod.yOffCalco, n0 = K.pecas.length, W3 = function (q) { return F.W([q[0], q[1] + yOff, q[2]]); };
    var FA = FAnd(), nFam = 0, TD = todos(mod);   /* TD = o andaime + a torre de escada coletiva (se houver) */
    /* E7: instância de família no lote (op "familia" do js/bimedit.js; rotY em radianos). A marca `andaime` e a massa do catálogo vão em `inst`
       (a família ignora o que não é parâmetro): o peso do modelo lê a massa, a locação lê a marca. NÃO é aço fabricado (a família não tem caixa). */
    function famOp(famId, tipoId, P, rotY, inst, peca, cod, massa) {
      var ii = {}; Object.keys(inst || {}).forEach(function (kk) { ii[kk] = inst[kk]; });
      ii.andaime = { peca: peca, cod: cod }; if (massa > 0) ii.Massa_kg = massa;
      K.ops.push({ op: "familia", id: String(novoId()), famId: famId, tipoId: tipoId, x: r4(P[0]), y: r4(P[1]), z: r4(P[2]), rotY: r4(rotY), inst: ii }); nFam++;
    }
    /* E7 — ENCAIXE DA BRAÇADEIRA NO TUBO (item 107 de docs/andaime/DUVIDAS.md). O modelo (montar) guarda as LINHAS DE CENTRO das barras, que se
       CRUZAM no nó — é com elas que o cálculo trabalha e isso não muda. A braçadeira do catálogo tem os dois furos a 54 mm (fixa) / 72 mm (giratória)
       um do outro: com os tubos desenhados em cima das linhas que se cruzam, nenhum furo coincidia com tubo algum (medido no app: até 60 mm).
       Então, SÓ NO DESENHO, o tubo 2 (o que não é o montante) é afastado pela distância entre eixos da família (lida das cotas, nunca à mão) e a
       braçadeira vai ao ponto médio dos dois eixos DESENHADOS. O montante não anda (a base e a luva ficam coaxiais a ele). Duas horizontais
       (transversal sobre travessa): a de baixo desce até os eixos ficarem à distância da família — o pranchão, que apoia no topo da de cima, não mexe. */
    var tetoCon = FA ? TETO_CONEXOES_FAM : 1500;
    var desenharCon = p.conexoes3d && mod.conexoes.length <= tetoCon;
    var encaixar = !!(FA && desenharCon);
    var enc = { off: {}, con: {} };
    function eSub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
    function eAdd(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
    function eMul(a, f) { return [a[0] * f, a[1] * f, a[2] * f]; }
    function eDot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
    function eCross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
    function eNorm(a) { var l = Math.sqrt(eDot(a, a)); return l > 1e-9 ? [a[0] / l, a[1] / l, a[2] / l] : null; }
    function dirLocal(b) { return eNorm(eSub(b.b, b.a)); }
    function linhaDesenhada(b) { var o = enc.off[b.id]; return { p: o ? eAdd(b.a, o.v) : b.a, d: dirLocal(b) }; }
    /* os dois pontos mais próximos entre duas retas (a de L1, b de L2); null se paralelas */
    function proxLinhas(L1, L2) {
      var w = eSub(L1.p, L2.p), b = eDot(L1.d, L2.d), d = eDot(L1.d, w), e = eDot(L2.d, w), den = 1 - b * b;
      if (den < 1e-9) return null;
      var t = (b * e - d) / den, u = (e - b * d) / den;
      return { a: eAdd(L1.p, eMul(L1.d, t)), b: eAdd(L2.p, eMul(L2.d, u)) };
    }
    function distEixos(tipo) { return (tipo === "giratoria" ? FA.cota("ra-andaime-abracadeira-giratoria", "distanciaEixosTubos_forjada") : FA.cota("ra-andaime-abracadeira-fixa", "distanciaEixosTubos")) * 0.001; }
    if (encaixar) (function () {
      var porId = {}, cx = 0, cz = 0, nm = 0;
      mod.barras.forEach(function (b) { porId[b.id] = b; var vt = Math.abs(dirLocal(b)[1]) > 0.999; enc.off[b.id] = { v: [0, 0, 0], fxz: vt, fy: vt }; if (b.papel === "montante") { cx += b.a[0]; cz += b.a[2]; nm++; } });
      if (nm) { cx /= nm; cz /= nm; }
      var conns = mod.conexoes.filter(function (c) { return (c.tipo === "fixa" || c.tipo === "giratoria") && c.barras && porId[c.barras[0]] && porId[c.barras[1]]; });
      /* passo 1: montante × outro tubo — o outro sai para FORA do conjunto (o lado oposto ao centro dos montantes) */
      conns.forEach(function (c) {
        var A = porId[c.barras[0]], B = porId[c.barras[1]], dA = dirLocal(A), dB = dirLocal(B), vA = Math.abs(dA[1]) > 0.999, vB = Math.abs(dB[1]) > 0.999;   /* só o montante é vertical de verdade (uma diagonal íngreme passa de 0,7) */
        if (vA === vB) return;
        var Mo = vA ? A : B, X = vA ? B : A, oX = enc.off[X.id];
        if (oX.fxz) return;
        var n = eCross(dirLocal(Mo), dirLocal(X)); n = eNorm([n[0], 0, n[2]]); if (!n) return;
        if ((c.pos[0] - cx) * n[0] + (c.pos[2] - cz) * n[2] < -1e-6) n = eMul(n, -1);
        var pr = proxLinhas(linhaDesenhada(Mo), linhaDesenhada(X)), sep = pr ? eSub(pr.b, pr.a) : [0, 0, 0], cor = eSub(eMul(n, distEixos(c.tipo)), sep);
        cor[1] = 0; oX.v = eAdd(oX.v, cor); oX.fxz = true;
        if (Math.abs(dirLocal(X)[1]) > 0.05) oX.fy = true;   /* diagonal: não sobe nem desce */
      });
      conns.forEach(function (c) {   /* a normal de cada braçadeira vertical = o sentido em que o tubo 2 foi afastado */
        var A = porId[c.barras[0]], B = porId[c.barras[1]], vA = Math.abs(dirLocal(A)[1]) > 0.999, vB = Math.abs(dirLocal(B)[1]) > 0.999;
        if (vA === vB) return;
        var oX = enc.off[(vA ? B : A).id], n = eNorm([oX.v[0], 0, oX.v[2]]); if (n) enc.con[c.id] = { n: n };
      });
      /* passo 2: duas horizontais — a de cima é o tubo 1; a de baixo desce até a distância da família */
      for (var it = 0; it < 4; it++) conns.forEach(function (c) {
        var A = porId[c.barras[0]], B = porId[c.barras[1]];
        if (Math.abs(dirLocal(A)[1]) > 0.5 || Math.abs(dirLocal(B)[1]) > 0.5) return;
        var pr = proxLinhas(linhaDesenhada(A), linhaDesenhada(B)); if (!pr) return;
        var sw = pr.b[1] > pr.a[1], up = sw ? B : A, lo = sw ? A : B, dlt = distEixos(c.tipo) - Math.abs(pr.a[1] - pr.b[1]);
        enc.con[c.id] = { swap: sw };
        if (Math.abs(dlt) < 1e-7) return;
        if (!enc.off[lo.id].fy) { enc.off[lo.id].v[1] -= dlt; enc.off[lo.id].fy = true; }
        else if (!enc.off[up.id].fy) { enc.off[up.id].v[1] += dlt; enc.off[up.id].fy = true; }
      });
    })();
    /* a braçadeira / luva entre duas barras: posição = a do nó; o quadro da peça sai das duas direções (tubo 1 = o montante ou o tubo de cima;
       o eixo do pino = a perpendicular comum). A instância só gira em Y: montante vertical → Montagem "vertical"; dois tubos horizontais →
       Montagem "horizontal" (o de cima é o tubo 1). */
    function famConexao(c, cod, porBarra) {
      var A = porBarra[c.barras[0]], B = porBarra[c.barras[1]], P = c.pos, tipo = c.tipo;
      function dirDe(b) { var d = [b.b[0] - b.a[0], b.b[1] - b.a[1], b.b[2] - b.a[2]], l = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]) || 1; return [d[0] / l, d[1] / l, d[2] / l]; }
      var Pw = F.W([P[0], P[1] + yOff, P[2]]);
      if (tipo === "luva") {
        var dl = A ? F.D(dirDe(A)) : [0, 1, 0], vert = Math.abs(dl[1]) > 0.7;
        if (encaixar && A && enc.off[A.id]) { var Pl = eAdd(P, enc.off[A.id].v); Pw = F.W([Pl[0], Pl[1] + yOff, Pl[2]]); }   /* a luva fica no eixo DESENHADO do tubo (o tubo 2 foi afastado) */
        famOp("ra-andaime-luva", "padrao", Pw, vert ? 0 : Math.atan2(-dl[2], dl[0]), { Eixo: vert ? "y" : "x" }, "luva", cod, pesoDaPeca(cod) || 0); return;
      }
      var famId = tipo === "giratoria" ? "ra-andaime-abracadeira-giratoria" : "ra-andaime-abracadeira-fixa", tp = tipo === "giratoria" ? "a90" : "padrao";
      if (!A || !B) { famOp(famId, tp, Pw, 0, {}, tipo, cod, pesoDaPeca(cod) || 0); return; }
      var ci = encaixar ? enc.con[c.id] : null;
      if (ci && ci.swap) { var sb = A; A = B; B = sb; }   /* duas horizontais: o tubo 1 é o de cima */
      if (encaixar) { var pxy = proxLinhas(linhaDesenhada(A), linhaDesenhada(B)); if (pxy) { var pm = eMul(eAdd(pxy.a, pxy.b), 0.5); Pw = F.W([pm[0], pm[1] + yOff, pm[2]]); } }   /* ponto médio dos eixos DESENHADOS */
      var dA = F.D(dirDe(A)), dB = F.D(dirDe(B)), vA = Math.abs(dA[1]) > 0.999, vB = Math.abs(dB[1]) > 0.999;   /* o tubo 1 é o MONTANTE (vertical de verdade): uma diagonal íngreme (dy > 0,7) vinha como tubo 1 e o Angulo saía 0 */
      if (!vA && vB) { var tt = dA; dA = dB; dB = tt; vA = true; vB = false; }   /* o tubo 1 é o vertical, quando há um */
      var inst = {}, rotY = 0;
      var nx = dA[1] * dB[2] - dA[2] * dB[1], ny = dA[2] * dB[0] - dA[0] * dB[2], nz = dA[0] * dB[1] - dA[1] * dB[0], nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (vA) {   /* montante vertical: o pino é horizontal; Z da peça = a normal do plano dos dois tubos */
        if (ci && ci.n) { var nw = F.D([ci.n[0], 0, ci.n[2]]); nx = nw[0]; nz = nw[2]; nl = 1; }   /* o lado em que o tubo 2 foi afastado no desenho */
        if (nl > 1e-6) { nx /= nl; nz /= nl; if (nx * nx + nz * nz > 1e-9) rotY = Math.atan2(nx, nz); }
        if (tipo === "giratoria" && nl > 1e-6) {
          var xs = [Math.cos(rotY), 0, -Math.sin(rotY)], up = dB[1] >= 0 ? dB : [-dB[0], -dB[1], -dB[2]];
          var ang = Math.atan2(up[0] * xs[0] + up[2] * xs[2], up[1]) * 180 / Math.PI; inst.Angulo = r4(ang < 0 ? ang + 360 : ang);
        }
      } else {   /* os dois horizontais: Montagem "horizontal" (tubo 1 = o de cima, em Z da peça) */
        inst.Montagem = "horizontal"; rotY = Math.atan2(dA[0], dA[2]);
        if (tipo === "giratoria") { var cr = dA[0] * dB[2] - dA[2] * dB[0], dt = dA[2] * dB[2] + dA[0] * dB[0]; inst.Angulo = r4(Math.atan2(Math.abs(cr), dt) * 180 / Math.PI); }
      }
      famOp(famId, tp, Pw, rotY, inst, tipo, cod, pesoDaPeca(cod) || 0);
    }
    mod.avisos.forEach(function (a) { K.avisos.push(a); });
    var cont = { tubos: 0, conexoes: 0, pranchas: 0, rodapes: 0, bases: 0, calcos: 0, acessos: 0 };
    function marca(cx, peca, cod) { if (cx) { cx.andaime = { peca: peca, cod: cod }; } return cx; }
    /* tubos */
    TD.barras.forEach(function (b) {
      var oe = enc.off[b.id] ? enc.off[b.id].v : [0, 0, 0];   /* ENCAIXE: o afastamento só do desenho (a linha do cálculo não muda) */
      var cx = K.barra([b.a[0] + oe[0], b.a[1] + yOff + oe[1], b.a[2] + oe[2]], [b.b[0] + oe[0], b.b[1] + yOff + oe[1], b.b[2] + oe[2]], { cat: p.tubo, just: "centro", papel: NOME_PAPEL[b.papel] || "Tubo do andaime", nome: (NOME_PAPEL[b.papel] || "Tubo do andaime") + " " + b.id + " — " + brf(b.L, 2) + " m", ifc: "IFCMEMBER", aco: p.aco }, "tubos");
      marca(cx, b.papel, b.cod);
    });
    /* madeira: prancha e rodapé como PEÇA DE MADEIRA (nunca tipo "metal") */
    function madeira(x, b, h, topoLocal, papel, cod, nome, massa) {
      var matM = papel === "calco" ? "madeira eucalipto" : "madeira pinus";   /* E7: o nome do material que o 3D veste de veio (js/bim.js b2) */
      if (!BA || !BA.vigaPerfil) { K.avisos.push("Prancha de madeira: o modelador (js/bimarq.js) não carregou."); return null; }
      var A = F.W([x.a[0], yOff, x.a[2]]), B = F.W([x.b[0], yOff, x.b[2]]), top = F.W([0, topoLocal + yOff, 0])[1];
      var cx = BA.vigaPerfil([A[0], A[2]], [B[0], B[2]], { perfil: { forma: "ret", b: b, h: h }, material: "madeira", topo: top });
      if (!cx) { K.avisos.push(nome + ": não foi possível criar a peça de madeira."); return null; }
      cx.nome = nome; cx.massa = massa == null ? 0 : massa; cx.madeiraMat = matM;
      K.nova(cx, nome, papel === "prancha" ? "pranchas" : "rodapes");
      K.linhas.push({ a: [A[0], top, A[2]], b: [B[0], top, B[2]], p: "Piso" });
      return marca(cx, papel, cod);
    }
    TD.pranchas.forEach(function (x) {
      if (x.tipo === "madeira") madeira(x, x.larg, x.esp, x.yTopo, "prancha", x.cod, "Prancha de madeira do andaime " + x.id + " — " + brf(x.L, 2) + " m", pesoDaPeca(x.cod, x.L));
      else if (x.tipo === "alcapao") madeira(x, x.larg, x.esp, x.yTopo, "alcapao", x.cod, "Alçapão do andaime " + x.id, pesoDaPeca("alcapao", x.L, { a: x.larg, e: x.esp }));
      else {
        var u = [x.b[0] - x.a[0], x.b[2] - x.a[2]], Lu = Math.hypot(u[0], u[1]) || 1; u = [u[0] / Lu, u[1] / Lu];
        /* piso metálico: chapa horizontal; a origem é um canto da face de CIMA e a espessura entra para baixo (ex × ey aponta para baixo) */
        var cx = K.chapa({ origem: [x.a[0] + u[1] * x.larg / 2, x.yTopo + yOff, x.a[2] - u[0] * x.larg / 2], ex: [u[0], 0, u[1]], ey: [-u[1], 0, u[0]], t: x.esp, ret: { L: x.L, B: x.larg }, papel: "Piso metálico do andaime", aco: p.aco, nome: "Piso metálico do andaime " + x.id }, "pranchas");
        if (cx) { marca(cx, "pisoMetalico", x.cod); cx.massa = pesoDaPeca(x.cod, x.L) || 0; }
      }
    });
    mod.rodapes.forEach(function (x) { madeira(x, x.esp, x.alt, x.yTopo, "rodape", x.cod, "Rodapé do andaime " + x.id + " — " + brf(x.L, 2) + " m", pesoDaPeca("rodapeMadeira", x.L, { a: x.alt, e: x.esp })); });
    /* bases, calços */
    TD.bases.forEach(function (b) {
      if (FA) {   /* E7: a base é a família do catálogo (placa + haste com filete + borboleta; garfo e roda no rodízio) */
        var Wb = F.W([b.pos[0], 0, b.pos[2]]), hRosca = Math.max(0, b.h - FA.cota("ra-andaime-base-regulavel", "placaEspessura") * 0.001 - FA.cota("ra-andaime-base-regulavel", "porcaBorboletaAltura") * 0.001);
        var fb = b.cod === "rodizio" ? "ra-andaime-rodizio" : (b.cod === "baseFixa" ? "ra-andaime-base-fixa" : "ra-andaime-base-regulavel");
        famOp(fb, "padrao", [Wb[0], b.y0 + yOff, Wb[2]], F.th, b.cod === "baseRegulavel" ? { Altura_rosca: r4(hRosca), Altura_total: r4(b.h + 0.15) } : {}, "base", b.cod, pesoDaPeca(b.cod) || 0);
        return;
      }
      var cx = K.chapa({ origem: [b.pos[0] - 0.06, b.y0 + b.h + yOff, b.pos[2] - 0.06], ex: [1, 0, 0], ey: [0, 0, 1], t: b.h, ret: { L: 0.12, B: 0.12 }, papel: "Base do andaime", aco: p.aco, nome: "Base do andaime " + b.id, ifc: "IFCMECHANICALFASTENER" }, "bases");
      if (cx) { marca(cx, "base", b.cod); cx.massa = pesoDaPeca(b.cod) || 0; }
    });
    TD.calcos.forEach(function (c) {
      madeira({ a: [c.pos[0] - c.u[0] * c.L / 2, 0, c.pos[2] - c.u[1] * c.L / 2], b: [c.pos[0] + c.u[0] * c.L / 2, 0, c.pos[2] + c.u[1] * c.L / 2] }, c.larg, c.esp, c.esp, "calco", c.cod, "Calço do andaime " + c.id, pesoDaPeca("calco", c.L));
    });
    /* acessos (E9): escada de mão INCLINADA (a família ra-andaime-escada, com Altura = o comprimento do lance e a inclinação em inst.Inclinacao_rad — js/bim.js gira a
       instância em X), marinheiro (a família, vertical) e lance da torre coletiva (provisório: banzos, degraus e corrimãos como tubos e chapas, não há família) */
    function lanceProvisorio(a) {
      var u = a.u, perp = [-u[1], u[0]], hw = a.larg / 2, nE = Math.max(2, a.nDegraus || 5), esp = (a.b[1] - a.a[1]) / nE, nome = "Lance de escada coletiva " + a.id;
      [-1, 1].forEach(function (sg) {
        var A1 = [a.a[0] + perp[0] * hw * sg, a.a[1] + yOff, a.a[2] + perp[1] * hw * sg], B1 = [a.b[0] + perp[0] * hw * sg, a.b[1] + yOff, a.b[2] + perp[1] * hw * sg];
        marca(K.barra(A1, B1, { cat: p.tubo, just: "centro", papel: "Banzo da escada coletiva", nome: nome + " (banzo)", ifc: "IFCSTAIRFLIGHT", aco: p.aco }, "acessos"), "escadaColetiva", a.cod);
        var C1 = [A1[0] + perp[0] * 0.04 * sg, A1[1] + 0.90, A1[2] + perp[1] * 0.04 * sg], C2 = [B1[0] + perp[0] * 0.04 * sg, B1[1] + 0.90, B1[2] + perp[1] * 0.04 * sg];
        marca(K.barra(C1, C2, { cat: p.tubo, just: "centro", papel: "Corrimão da escada coletiva", nome: nome + " (corrimão)", ifc: "IFCRAILING", aco: p.aco }, "acessos"), "escadaColetiva", a.cod);
      });
      var runL = hyp2(a.b[0] - a.a[0], a.b[2] - a.a[2]);
      for (var i = 0; i < nE; i++) {
        var f = nE > 1 ? i / (nE - 1) : 0, cx0 = a.a[0] + (a.b[0] - a.a[0]) * f, cz0 = a.a[2] + (a.b[2] - a.a[2]) * f, yT = a.a[1] + (i + 1) * esp + yOff, w = 0.25;
        var ch = K.chapa({ origem: [cx0 - u[0] * w / 2 - perp[0] * hw, yT, cz0 - u[1] * w / 2 - perp[1] * hw], ex: [u[0], 0, u[1]], ey: [perp[0], 0, perp[1]], t: 0.03, ret: { L: w, B: a.larg }, papel: "Degrau da escada coletiva", aco: p.aco, nome: nome + " (degrau " + (i + 1) + ")", ifc: "IFCSTAIRFLIGHT" }, "acessos");
        if (ch) { marca(ch, "escadaColetiva", a.cod); ch.massa = 0; }
      }
      return runL;
    }
    function hyp2(x, z) { return Math.sqrt(x * x + z * z); }
    TD.acessos.forEach(function (a) {
      if (a.tipo === "escadaColetiva") { lanceProvisorio(a); return; }
      if (FA) {
        var Wa = F.W([a.a[0], 0, a.a[2]]), inst = { Altura: a.L }, rotY;
        if (a.tipo === "escada") {   /* inclinada: o eixo Z da peça aponta para onde a escada se inclina (a direção do topo) */
          var dl = F.D([a.u[0], 0, a.u[1]]); rotY = Math.atan2(dl[0], dl[2]); inst.Inclinacao_rad = r4((90 - (a.angulo || 75)) * Math.PI / 180);
        } else { var exw = F.D([-a.u[1], 0, a.u[0]]); rotY = Math.atan2(-exw[2], exw[0]); }
        famOp(a.tipo === "escada" ? "ra-andaime-escada" : "ra-andaime-marinheiro", "padrao", [Wa[0], a.a[1] + yOff, Wa[2]], rotY, inst, a.tipo, a.cod, 0);
        return;
      }
      var u = a.u, ex = [-u[1], 0, u[0]], O = [a.a[0] - ex[0] * a.larg / 2, a.a[1] + yOff, a.a[2] - ex[2] * a.larg / 2];
      var cx = K.chapa({ origem: O, ex: ex, ey: [0, 1, 0], t: 0.03, ret: { L: a.larg, B: a.L }, papel: a.tipo === "escada" ? "Escada de acesso do andaime" : "Escada marinheiro do andaime", aco: p.aco, nome: (a.tipo === "escada" ? "Escada de acesso do andaime " : "Escada marinheiro do andaime ") + a.id, ifc: "IFCSTAIR" }, "acessos");
      if (cx) { marca(cx, a.tipo, a.cod); cx.massa = 0; }
    });
    arr(mod.acessoInfo && mod.acessoInfo.plataformas).forEach(function (pl, ip) {   /* plataforma de descanso do marinheiro: 0,60 × 0,60 */
      madeira({ a: [pl.centro[0] - 0.30, 0, pl.centro[1]], b: [pl.centro[0] + 0.30, 0, pl.centro[1]] }, 0.60, 0.038, pl.y, "prancha", "plataformaDescanso", "Plataforma de descanso " + (ip + 1) + " do marinheiro", 0);
    });
    /* conexões (desenho opcional). Com as famílias (E7) cada tipo vira UM InstancedMesh (js/andaime3d.js): o teto sobe de 1 500 (caixas) para
       TETO_CONEXOES_FAM, medido em tools/test-familiasandaime.js ([desempenho]); sem as famílias carregadas, volta ao teto das caixas. */
    if (p.conexoes3d && !desenharCon) K.avisos.push("Mais de " + brf(tetoCon, 0).replace(/(\d)(?=(\d{3})+$)/, "$1 ") + " conexões (" + mod.conexoes.length + "): não desenhei as braçadeiras no 3D — continuam na lista de locação.");
    var porBarra = {}; TD.barras.forEach(function (bq) { porBarra[bq.id] = bq; });
    if (desenharCon) TD.conexoes.forEach(function (c) {
      if (c.tipo === "base" || c.tipo === "prancha" || c.tipo === "rodape") return;   /* peças que já têm corpo próprio: base, prancha, rodapé */
      var cod = c.tipo === "luva" ? "luva" : (c.tipo === "giratoria" ? "bracGiratoria" : "bracFixa"), P = c.pos;
      if (FA) { famConexao(c, cod, porBarra); return; }
      var cx = K.chapa({ origem: [P[0] - 0.045, P[1] + yOff - 0.045, P[2] - 0.03], ex: [1, 0, 0], ey: [0, 1, 0], t: 0.06, ret: { L: 0.09, B: 0.09 }, papel: c.tipo === "luva" ? "Luva de emenda do andaime" : "Braçadeira do andaime", aco: p.aco, nome: "Braçadeira " + c.id, ifc: "IFCMECHANICALFASTENER" }, "conexoes");
      if (cx) { marca(cx, c.tipo, cod); cx.massa = pesoDaPeca(cod) || 0; }
    });
    for (var z = n0; z < K.pecas.length; z++) if (!K.pecas[z].andaime) K.pecas[z].andaime = { peca: "andaime", cod: "" };
    var m = mod.medidas, c = K.cont;
    return { resumo: "Andaime tubo-roll: " + m.nVaos + (m.nVaos === 1 ? " vão" : " vãos") + " × " + m.nLevantes + (m.nLevantes === 1 ? " levante" : " levantes") + ", piso a " + brf(m.alturaPiso) + " m — " + m.nTubos + " tubos, " + m.nConexoesTotal + " conexões",
      medidas: { andaime: m, locacao: pecasLocacao(mod) } };
  }

  var DICA = { titulo: "Andaime tubo-roll", oQueE: "Andaime de tubo e braçadeira montado de uma vez: montantes emendados em barras comerciais, travessas, transversais, diagonais, bases, pisos, guarda-corpo NR-18, rodapé, escada e ancoragens — com a lista do que pedir de locação.", ondeUsa: "Fachada, tanque, equipamento, reforma, qualquer trabalho acima de 2 m (NR-35).", dica: "Clique os pontos da FACE a trabalhar e Enter; o andaime fica do lado escolhido. Em volta de equipamento use o contorno fechado. Os valores sem norma brasileira ficam editáveis para o responsável técnico confirmar." };
  function desenhoAndaime(D) {
    var s = D.ln(40, 160, 280, 160, D.AUX, 1);
    [60, 160, 260].forEach(function (x) { s += D.mem(x, 160, x, 40, false, 4); });
    [150, 100, 50].forEach(function (y) { s += D.ln(60, y, 260, y, D.ACOL, 3); });
    s += D.ln(60, 150, 160, 100, D.DSTL, 2) + D.ln(160, 100, 260, 50, D.DSTL, 2) + '<rect x="58" y="46" width="204" height="5" fill="' + D.DST + '" stroke="' + D.DSTL + '"/>';
    return s + D.tx(160, 185, "montantes · travessas · pisos · diagonais", "middle");
  }

  var registrado = false;
  function registrar() {
    var M = MP(); if (!M || !M.registrarTipo) return false;
    M.registrarTipo("andaime", {
      rotulo: "Andaime tubo-roll", modo: "polilinha", modos: ["polilinha", "contorno"], cliques: 2, PADRAO: PADRAO, nums: NUMS, bools: BOOLS, perfis: ["tubo"],
      validar: function (p) { return validar(p); },
      gerar: gerar, dica: DICA, desenho: desenhoAndaime
    });
    registrado = true; return true;
  }
  registrar();

  /* a fiação da tela (botões da fita, modo de traçado, painel com abas) mudou para js/andaimeui.js (E5) — Andaime.UI é definido lá */
  var Andaime = {
    PADRAO: PADRAO, NUMS: NUMS, BOOLS: BOOLS, CATALOGO: CATALOGO, PARAMETROS_RT: PARAMETROS_RT,
    padrao: padrao, normalizar: normalizar, validar: validar, montar: montar, pecasLocacao: pecasLocacao, todos: todos, tabelaLocacao: tabelaLocacao, COLUNAS_LOCACAO: COLUNAS_LOCACAO, lerCaminho: lerCaminho, lerLista: lerLista, pesoDaPeca: pesoDaPeca, tuboInfo: tuboInfo,
    registrado: function () { return registrado; }, registrar: registrar,
    /* auxiliares PUROS de geometria, reaproveitados pelo multidirecional (js/andaimemulti.js) — o comportamento deles não muda */
    _geo: { lerCaminho: lerCaminho, lerLista: lerLista, caminhoDe: caminhoDe, areaAssinada: areaAssinada, pisosDe: pisosDe, tuboInfo: tuboInfo }
  };
  global.Andaime = Andaime;
  if (typeof module !== "undefined" && module.exports) module.exports = Andaime;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
