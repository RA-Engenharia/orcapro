/* =====================================================================
 * blocokref.js — OBRA DE REFERÊNCIA do Blocok: a casa REAL de Itacaré/BA
 * do artigo BJD 2024, o COMPARATIVO de custo e de prazo Blocok × alvenaria
 * convencional e o CRONOGRAMA parametrizado. Motor PURO (ES5, sem DOM),
 * Node-testável.
 *
 *   BlocokRef.obra(opcoes)                → { obra, avisos, convencional, vaos, premissas }
 *   BlocokRef.areaPlaca(resultado)        → área de placa do sistema × 144 m² do artigo, com a explicação
 *   BlocokRef.contaArtigo()               → as tabelas 2 a 4 refeitas à mão + inconsistências do artigo
 *   BlocokRef.custoSistema(resultado,cfg) → Blocok (preços RA out/2026) × convencional (SINAPI BA 06/2026)
 *                                           em DOIS quadros iguais nos dois métodos: (a) vedação +
 *                                           revestimento; (b) + estrutura de reforço (cfg.obra = a obra)
 *   BlocokRef.cronograma(resultado, cfg)  → dias por etapa e os totais (a), (b) e até a massa corrida
 *   BlocokRef.paraCronogramaSistema(cr, metodo) → { etapas, cronograma } no formato do Cronograma.estimar
 *   BlocokRef.pesoPorMateriais(esp)       → peso da peça pelos materiais (NBR 6120) × as outras fontes
 *
 * POR QUE ESTE ARQUIVO EXISTE (14/10/2026). O Rogério quer apresentar o
 * sistema a qualquer cliente da Blocok com uma obra REAL. A única obra real
 * publicada com o produto é a casa de Itacaré/BA (FONTES.artigo). O artigo
 * traz a planta (Fig. 8), a área de parede (144 m²) e os custos de 2023, mas
 * NÃO mede o prazo. Aqui a casa é remodelada no módulo, o sistema refaz a
 * conta e mostra lado a lado o que o artigo publicou e o que o sistema
 * calcula — SEM misturar as duas fontes.
 *
 * REGRAS (as mesmas do resto do módulo):
 *  · O painel é VEDAÇÃO; pilaretes, vergas e cintas são concreto armado
 *    moldado dentro da peça. Nenhum número do fabricante vira resistência do
 *    painel.
 *  · Nada inventado. Coeficiente do convencional = SINAPI do próprio sistema
 *    (data/sinapi-BA-analitico.json, 06/2026); o teste confere este
 *    instantâneo contra o arquivo. Etapa sem fonte de produtividade fica
 *    "a definir" e não entra na soma.
 *  · O que é premissa ou recomendação da RA vem escrito como tal.
 *
 * Teste: node tools/test-blocokref.js
 * ===================================================================== */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory(root);
  else root.BlocokRef = factory(root);
})(typeof self !== "undefined" ? self : this, function (root) {
  "use strict";

  function num(v, d) { var n = +v; return isFinite(n) ? n : (d == null ? 0 : d); }
  function r2(n) { return Math.round((+n || 0) * 100) / 100; }
  function r3(n) { return Math.round((+n || 0) * 1000) / 1000; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  /* número BR com milhar: 15708.2 → "15.708,20" */
  function br(v, c) {
    c = c == null ? 2 : c;
    var n = +v; if (!isFinite(n)) return "—";
    var s = Math.abs(n).toFixed(c), p = s.split("."), i = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return (n < 0 && Number(s) !== 0 ? "−" : "") + i + (p.length > 1 ? "," + p[1] : "");
  }
  function dep(nome, arq) {
    var m = root && root[nome];
    if (!m && typeof require !== "undefined") { try { m = require(arq); } catch (e) { m = null; } }
    return m;
  }
  function Exec() { var E = dep("BlocokExec", "./blocokexec.js"); if (!E) throw new Error("BlocokRef: BlocokExec ausente"); return E; }
  function mesclar(base, o) {
    if (!o || typeof o !== "object") return base;
    Object.keys(o).forEach(function (k) {
      var v = o[k];
      if (v && typeof v === "object" && !Array.isArray(v) && base[k] && typeof base[k] === "object" && !Array.isArray(base[k])) mesclar(base[k], v);
      else if (v !== undefined && v !== null && v !== "") base[k] = v;
    });
    return base;
  }

  /* ------------------------------------------------------------------
   * FONTES (citadas em todo lugar que usa o número)
   * ------------------------------------------------------------------ */
  var FONTES = {
    artigo: {
      ref: "MARTINS, Camila Moreira Paraíso; KRAUSE, Marcelo O'Donnel; MARINHO, Felipe José Estrela; LINS, Ittana de Oliveira. Estudo comparativo do método de construção da casa pré-moldada em relação ao de alvenaria convencional, um estudo de caso em Itacaré, Bahia. Brazilian Journal of Development, Curitiba, v. 10, n. 11, p. 01-22, 2024.",
      doi: "10.34117/bjdv10n11-037",
      curto: "MARTINS et al., Brazilian Journal of Development, v. 10, n. 11, 2024"
    },
    site: {
      ref: "Blocok Paredes Prontas ORIGINAL (Franquia Blocok, Nova Friburgo/RJ). https://blocok.vercel.app/ — acesso em 14/10/2026.",
      url: "https://blocok.vercel.app/",
      curto: "site oficial Blocok (blocok.vercel.app, acesso em 14/10/2026)"
    },
    naoOficial: {
      ref: "Quadro “Comparativo Blocok x Bloco” de site NÃO oficial (imagem guardada pela RA em 14/10/2026): peso “4,7k Newtons por m²”, tempo “48,20 m² por dia”, “rejunte de 1,5 cm em acabamento”, “sem necessidade de emboço”.",
      curto: "quadro “Comparativo Blocok x Bloco” (site não oficial)"
    },
    sinapi: "SINAPI BA 06/2026, não desonerado — data/sinapi-BA-analitico.json do sistema",
    nbr6120: "ABNT NBR 6120:2019, Tabela 1 (p. 15): concreto simples 24 kN/m³"
  };

  /* ------------------------------------------------------------------
   * O QUE O ARTIGO PUBLICOU (transcrição; páginas do PDF)
   * ------------------------------------------------------------------ */
  var ARTIGO = {
    ano: 2023, uf: "BA", local: "Itacaré/BA (zona rural)",
    areaConstruida: 81.84,                               // p. 13
    comodos: [["Sala", 25.96], ["Quarto", 13.12], ["Cozinha", 7.70], ["Suíte", 12.30], ["WC", 2.88], ["WC suíte", 9.00]],   // Tabela 1, p. 14
    totalComodos: 70.96,
    fig8: { comprimento: 13.80, largura: 6.80, cotas: "3,00 · 4,10 · 1,60 · 4,10 (fundos); 4,10 · 5,80 (frente); 3,00 · 3,20 (lateral)" },
    placaEspessuraCm: 10,                                // p. 16
    areaParede: 144, areaReboco: 288,                    // p. 16 e 17
    fiadasAteLaje: 3, profissionais: 3,                  // p. 8
    blocok: {                                            // Tabela 2, p. 17 — dados do proprietário, 2023
      itens: [
        { item: "Placa pré-moldada", m2: 60.45, total: 8704.20 },
        { item: "Cimento", m2: 17.00, total: 2448.00 },
        { item: "Argamassa AC3", m2: 1.64, total: 236.00 },
        { item: "Mão de obra", m2: 30.00, total: 4320.00 }
      ],
      total: 15708.20
    },
    reboco: { material: { m2: 36, total: 10368 }, mo: { m2: 27, total: 7776 }, m2: 63, total: 18144 },          // Tabela 3, p. 17 (288 m²)
    alvenaria: { material: { m2: 55, total: 7920 }, mo: { m2: 25, total: 3600 }, m2: 80, total: 11520 },        // Tabela 4, p. 17 (144 m²)
    convencionalTotal: 29664,
    reducaoPct: 47.05, reducaoMaterialRebocoPct: 97.72, economiaMOPct: 62,             // p. 18 e 19
    fig16: { materialParedeBlocok: 11525.20, materialParedeConv: 7920, materialRebocoBlocok: 236, materialRebocoConv: 10368, moBlocok: 4320, moConv: 11376 },
    fig17: { convencional: 29664, blocok: 15708.20 },
    mediuPrazo: false                                    // o artigo NÃO mede dias de execução
  };

  /* ------------------------------------------------------------------
   * SINAPI do sistema — instantâneo de data/sinapi-BA-analitico.json
   * (06/2026, BA, não desonerado). O teste confere cada número contra o
   * arquivo: se a base mudar, o teste avisa. `h` = horas de MÃO DE OBRA por
   * unidade, da composição e das sub-composições de material (argamassa e
   * concreto preparados, fabricação de fôrma, corte e dobra) — profissional
   * "com encargos complementares" em H; equipamento (CHP/CHI) não entra.
   * ------------------------------------------------------------------ */
  var SINAPI = {
    mes: "06/2026", uf: "BA", fonte: FONTES.sinapi,
    itens: {
      "103328": { descricao: "ALVENARIA DE VEDAÇÃO DE BLOCOS CERÂMICOS FURADOS NA HORIZONTAL DE 9X19X19 CM (ESPESSURA 9 CM) E ARGAMASSA DE ASSENTAMENTO COM PREPARO EM BETONEIRA. AF_12/2021", unidade: "M2", custoUnitario: 115.64, h: 2.456 },
      "87879": { descricao: "CHAPISCO APLICADO EM ALVENARIAS E ESTRUTURAS DE CONCRETO INTERNAS, COM COLHER DE PEDREIRO. ARGAMASSA TRAÇO 1:3 COM PREPARO EM BETONEIRA 400L. AF_10/2022", unidade: "M2", custoUnitario: 5.95, h: 0.1096 },
      "87905": { descricao: "CHAPISCO APLICADO EM ALVENARIA (COM PRESENÇA DE VÃOS) E ESTRUTURAS DE CONCRETO DE FACHADA, COM COLHER DE PEDREIRO. ARGAMASSA TRAÇO 1:3 COM PREPARO EM BETONEIRA 400L. AF_10/2022", unidade: "M2", custoUnitario: 10.52, h: 0.2459 },
      "104951": { descricao: "MASSA ÚNICA, EM ARGAMASSA TRAÇO 1:2:8, PREPARO MECÂNICO, APLICADA MANUALMENTE EM PAREDES INTERNAS DE AMBIENTES COM ÁREA MAIOR QUE 10M², E = 17,5MM, COM TALISCAS. AF_03/2024", unidade: "M2", custoUnitario: 45.23, h: 0.7227 },
      "87775": { descricao: "EMBOÇO OU MASSA ÚNICA EM ARGAMASSA TRAÇO 1:2:8, PREPARO MECÂNICO COM BETONEIRA 400 L, APLICADA MANUALMENTE EM PANOS DE FACHADA COM PRESENÇA DE VÃOS, ESPESSURA DE 25 MM. AF_08/2022", unidade: "M2", custoUnitario: 71.1, h: 1.4993 },
      "88495": { descricao: "EMASSAMENTO COM MASSA LÁTEX, APLICAÇÃO EM PAREDE, UMA DEMÃO, LIXAMENTO MANUAL. AF_04/2023", unidade: "M2", custoUnitario: 13.4, h: 0.3279 },
      "88497": { descricao: "EMASSAMENTO COM MASSA LÁTEX, APLICAÇÃO EM PAREDE, DUAS DEMÃOS, LIXAMENTO MANUAL. AF_04/2023", unidade: "M2", custoUnitario: 20.46, h: 0.4813 },
      "105024": { descricao: "VERGA MOLDADA IN LOCO EM CONCRETO, ESPESSURA DE *10* CM. AF_03/2024", unidade: "M", custoUnitario: 60.29, h: 0.778 },
      "105030": { descricao: "CONTRAVERGA MOLDADA IN LOCO EM CONCRETO, ESPESSURA DE *10* CM. AF_03/2024", unidade: "M", custoUnitario: 46.44, h: 0.4955 },
      "105034": { descricao: "CINTA DE AMARRAÇÃO DE ALVENARIA MOLDADA IN LOCO COM UTILIZAÇÃO DE BLOCOS CANALETA, ESPESSURA DE *10* CM. AF_03/2024", unidade: "M", custoUnitario: 54.79, h: 0.7738 },
      "92413": { descricao: "MONTAGEM E DESMONTAGEM DE FÔRMA DE PILARES RETANGULARES E ESTRUTURAS SIMILARES, PÉ-DIREITO SIMPLES, EM MADEIRA SERRADA, 4 UTILIZAÇÕES. AF_09/2020", unidade: "M2", custoUnitario: 127.51, h: 2.6343 },
      "104108": { descricao: "ARMAÇÃO DE PILAR OU VIGA DE ESTRUTURA DE CONCRETO ARMADO EMBUTIDA EM ALVENARIA DE VEDAÇÃO UTILIZANDO AÇO CA-50 DE 10,0 MM - MONTAGEM. AF_06/2022", unidade: "KG", custoUnitario: 13.47, h: 0.1214 },
      "104111": { descricao: "ARMAÇÃO DE PILAR OU VIGA DE ESTRUTURA DE CONCRETO ARMADO EMBUTIDA EM ALVENARIA DE VEDAÇÃO UTILIZANDO AÇO CA-60 DE 5,0 MM - MONTAGEM. AF_06/2022", unidade: "KG", custoUnitario: 23.35, h: 0.4275 },
      "103669": { descricao: "CONCRETAGEM DE PILARES, FCK = 25 MPA, COM USO DE BALDES - LANÇAMENTO, ADENSAMENTO E ACABAMENTO. AF_02/2022", unidade: "M3", custoUnitario: 1194.27, h: 12.295 }
    },
    /* por que estes códigos (escolha RA, editável em cfg.convencional.codigos):
       alvenaria = bloco cerâmico (o artigo compara com "bloco cerâmico e cimento", Tabela 4);
       massa única interna "> 10 m²" = sala, quarto e suíte são 83 % da área dos cômodos de placa (51,38 de 61,96 m², Tabela 1);
       fachada "com presença de vãos" = todas as fachadas da casa têm porta ou janela. */
    porque: "alvenaria de bloco cerâmico (Tabela 4 do artigo); massa única interna de ambiente maior que 10 m² (sala, quarto e suíte = 83 % da área dos cômodos de placa); fachada com vãos (todas as fachadas têm porta ou janela)",
    /* ESTRUTURA DE REFORÇO DO CONVENCIONAL (igual com igual, pedido do gerente
       14/10/2026): as MESMAS posições da paginação base do Blocok (pilaretes em
       canto, borda de vão e a cada ≤ 4 m; vergas, contravergas, cinta), moldadas
       com fôrma na alvenaria de bloco de 9 cm. Pilarete: fôrma de madeira nas 2
       faces (92413), armadura construtiva do motor (104108 φ10, 104111 φ5) e concretagem
       com seção de 9 cm (103669). Verga, contraverga e cinta pelas composições por
       metro de 10 cm (105024, 105030, 105034 — na cinta a canaleta é fôrma perdida). */
    porqueEstrutura: "mesmas posições da paginação base do Blocok (cantos, bordas de vão, pilarete a cada ≤ 4 m, cinta de respaldo — sem o ajuste do painel Blocok); pilarete com fôrma de madeira nas 2 faces (92413), armadura construtiva do motor (104108 φ10 e 104111 φ5) e concreto na espessura do bloco, 9 cm (103669); verga 105024, contraverga 105030 e cinta 105034 (canaleta como fôrma perdida), por metro",
    espBloco: 0.09
  };
  function hSinapi(cod) { var it = SINAPI.itens[cod]; return it ? it.h : null; }

  /* ------------------------------------------------------------------
   * GEOMETRIA — Fig. 8 do artigo. As cotas são de VÃO LIVRE e as paredes
   * estão desenhadas com 20 cm: 0,20 + 3,00 + 0,20 + 4,10 + 0,20 + 1,60 +
   * 0,20 + 4,10 + 0,20 = 13,80 m e 0,20 + 3,00 + 0,20 + 3,20 + 0,20 = 6,80 m.
   * Os eixos ficam no meio dessas paredes. Conferência: a sala sai 5,90 ×
   * 4,40 = 25,96 m², exatamente a Tabela 1 (a cota "5,80" da figura não
   * fecha com a área). x para a direita, z para baixo da figura (fundos em
   * cima, frente embaixo). Vão: x0/x1 a partir de p1, y0/y1 a partir do piso.
   * ------------------------------------------------------------------ */
  var NOME = "Residência Itacaré/BA — referência Blocok (BJD 2024)";
  var LOCAL = { nome: "Itacaré/BA", lat: -14.2784, lon: -38.9963 };
  var EST = "estimado da figura (Fig. 8 a 10)";
  function V(tipo, x0, x1, y0, h, onde) { return { tipo: tipo, x0: x0, x1: x1, y0: y0, y1: r3(y0 + h), onde: onde, fonte: EST }; }
  /* peitoril 0,915 m = 1 fiada (0,90) + junta (0,015): o vão fecha com a fiada e não sobra tira fina */
  var PAREDES = [
    { id: "P01", nome: "Fachada dos fundos (suíte, WC, cozinha)", p1: [3.30, 0.10], p2: [13.70, 0.10], fachada: true,
      vaos: [V("janela", 1.55, 2.75, 0.915, 1.0, "suíte"), V("janela", 4.90, 5.50, 1.83, 0.6, "WC"), V("janela", 7.50, 9.00, 0.915, 1.0, "cozinha")] },
    { id: "P02", nome: "Lateral direita (cozinha, sala)", p1: [13.70, 0.10], p2: [13.70, 6.70], fachada: true,
      vaos: [V("porta", 3.30, 4.10, 0, 2.1, "sala → varanda"), V("janela", 4.70, 5.90, 0.915, 1.0, "sala")] },
    { id: "P03", nome: "Fachada frontal (quarto, sala)", p1: [3.30, 6.70], p2: [13.70, 6.70], fachada: true,
      vaos: [V("janela", 1.40, 2.90, 0.915, 1.0, "quarto"), V("porta", 6.00, 7.60, 0, 2.1, "entrada, 2 folhas"), V("janela", 8.30, 9.80, 0.915, 1.0, "sala")] },
    { id: "P04", nome: "Lateral esquerda (suíte, quarto)", p1: [3.30, 0.10], p2: [3.30, 6.70], fachada: true,
      vaos: [V("porta", 2.10, 2.80, 0, 2.1, "suíte → WC suíte")] },
    { id: "P05", nome: "Divisa suíte / quarto", p1: [3.30, 3.30], p2: [7.60, 3.30], fachada: false, vaos: [] },
    { id: "P06", nome: "Eixo 7,60 (suíte e quarto / WC e sala)", p1: [7.60, 0.10], p2: [7.60, 6.70], fachada: false,
      vaos: [V("porta", 2.15, 2.95, 0, 2.1, "suíte"), V("porta", 3.55, 4.35, 0, 2.1, "quarto")] },
    { id: "P07", nome: "Divisa WC / cozinha", p1: [9.40, 0.10], p2: [9.40, 2.10], fachada: false, vaos: [] },
    { id: "P08", nome: "Divisa WC / sala", p1: [7.60, 2.10], p2: [9.40, 2.10], fachada: false,
      vaos: [V("porta", 0.45, 1.05, 0, 2.1, "WC")] }
  ];
  /* a linha cozinha/sala: a Fig. 8 a desenha, mas o texto diz "sala e cozinha
     conjugadas" (p. 13), as fotos mostram bancada com banquetas (Figs. 14 e
     15) e a cozinha da Tabela 1 (7,70 m² = 4,10 × 1,88) é mais funda que a
     do desenho com parede de 20 cm (4,10 × 1,80) — é bancada, não parede */
  var BANCADA = { id: "P09", nome: "Linha cozinha / sala (bancada; a Fig. 8 desenha como parede)", p1: [9.40, 2.10], p2: [13.70, 2.10], fachada: false, vaos: [] };
  /* WC da suíte: alvenaria convencional, como foi construído (p. 16) — fora da placa */
  var CONVENCIONAL = [
    { id: "C1", nome: "WC suíte — fundos", p1: [0.10, 0.10], p2: [3.30, 0.10] },
    { id: "C2", nome: "WC suíte — lateral", p1: [0.10, 0.10], p2: [0.10, 3.30] },
    { id: "C3", nome: "WC suíte — frente", p1: [0.10, 3.30], p2: [3.30, 3.30] }
  ];
  var VERSOES = {
    construida: { nome: "Como construída (BJD 2024)", fachada: 10, interna: 10,
      fonte: "placas de 10 cm em todas as paredes (artigo, p. 16)" },
    ra: { nome: "Variante RA (fachadas 20 cm, internas 13 cm)", fachada: 20, interna: 13,
      fonte: "recomendação RA: as fachadas recebem o telhado e só a peça de 20 cm comporta pilar embutido ≥ 14 cm (NBR 6118, 13.2.3); as internas de 13 cm comportam verga e pilarete de travamento (concreto de 10 cm)" }
  };
  function comprimento(p) { var dx = p.p2[0] - p.p1[0], dz = p.p2[1] - p.p1[1]; return Math.sqrt(dx * dx + dz * dz); }
  function alturaFiadas(n) { var c = Exec().cfgPadrao(); return r3(n * c.placa + (n - 1) * c.junta); }

  /* V0 de Itacaré pelo mapa de isopletas do sistema (js/acoisopletas.js) */
  function ventoLocal() {
    var I = dep("AcoIsopletas", "./acoisopletas.js"), m = null;
    try { m = I && I.v0 ? I.v0(LOCAL.lat, LOCAL.lon) : null; } catch (e) { m = null; }
    if (m && isFinite(m.v0Adotado)) return { v0: m.v0Adotado, fonte: "NBR 6123, isopletas (js/acoisopletas.js) em " + br(LOCAL.lat, 4) + "°, " + br(LOCAL.lon, 4) + "°" };
    return { v0: null, fonte: "mapa de isopletas não carregado — V0 fica pendente no cálculo" };
  }

  /* ------------------------------------------------------------------
   * A OBRA no formato do BlocokCalc (via BlocokModelo, como a tela faz)
   *   opcoes = { versao: "construida" | "ra", bancadaComoParede: bool,
   *              espessuras: { fachada, interna } (cm), param: { fck, caa, painel } }
   * ------------------------------------------------------------------ */
  function obra(opcoes) {
    opcoes = opcoes || {};
    var M = dep("BlocokModelo", "./blocokmodelo.js");
    if (!M) throw new Error("BlocokRef: BlocokModelo ausente");
    var ver = VERSOES[opcoes.versao] ? opcoes.versao : "construida", VS = VERSOES[ver];
    var es = opcoes.espessuras || {};
    var eF = num(es.fachada, VS.fachada) || VS.fachada, eI = num(es.interna, VS.interna) || VS.interna;
    var H = alturaFiadas(ARTIGO.fiadasAteLaje);
    var lista = PAREDES.concat(opcoes.bancadaComoParede ? [BANCADA] : []);
    var vaosMeta = [];
    var ps = lista.map(function (p) {
      var esp = p.fachada ? eF : eI;
      return { id: p.id, nome: p.nome, p1: p.p1.slice(), p2: p.p2.slice(), t: esp / 100, H: H, y0: 0, esp: esp,
        vaos: p.vaos.map(function (v, i) {
          var id = (v.tipo === "porta" ? "PT" : "JN") + (i + 1);
          vaosMeta.push({ parede: p.id, id: id, tipo: v.tipo, onde: v.onde, largura: r3(v.x1 - v.x0), altura: r3(v.y1 - v.y0), peitoril: v.y0, fonte: v.fonte });
          return { id: id, tipo: v.tipo, x0: v.x0, x1: v.x1, y0: v.y0, y1: v.y1 };
        }) };
    });
    var vt = ventoLocal();
    var prm = opcoes.param || {};
    var r = M.obra(ps, {
      nome: NOME, cliente: "[CLIENTE]", local: LOCAL.nome, lat: LOCAL.lat, lon: LOCAL.lon,
      laje: { tipo: "nenhuma" },
      cobertura: { g: 0.5, q: 0.25, vao: 6.6 },
      vento: { v0: vt.v0, categoria: "III", grupoS3: 2 },
      solo: {}, painel: prm.painel || {}
    });
    if (prm.fck) r.obra.parametros.fck = num(prm.fck, 25);
    if (prm.caa) r.obra.parametros.caa = prm.caa;
    r.obra.referencia = { id: "itacare-bjd-2024", versao: ver, versaoNome: VS.nome, espessuras: { fachada: eF, interna: eI }, bancadaComoParede: !!opcoes.bancadaComoParede };
    var premissas = [
      { item: "Planta", valor: "eixos da Fig. 8 (paredes desenhadas de 20 cm): bloco principal de " + br(PAREDES[0].p2[0] - PAREDES[0].p1[0] + 0.2, 2) + " × " + br(PAREDES[3].p2[1] - PAREDES[3].p1[1] + 0.2, 2) + " m", fonte: FONTES.artigo.curto + ", Fig. 8" },
      { item: "Pé-direito", valor: ARTIGO.fiadasAteLaje + " fiadas = " + br(H, 3) + " m (3 × 0,90 + 2 juntas de 1,5 cm)", fonte: FONTES.artigo.curto + ", p. 8" },
      { item: "Espessura", valor: VS.nome + ": fachadas " + eF + " cm, internas " + eI + " cm", fonte: VS.fonte },
      { item: "WC da suíte", valor: "alvenaria convencional (fora da placa), como foi construído", fonte: FONTES.artigo.curto + ", p. 16" },
      { item: "Linha cozinha / sala", valor: opcoes.bancadaComoParede ? "parede de placa (como desenhada na Fig. 8)" : "bancada, fora da placa (sala e cozinha conjugadas)", fonte: FONTES.artigo.curto + ", p. 13 e Figs. 8, 14 e 15" },
      { item: "Portas e janelas", valor: vaosMeta.length + " vãos com medidas padrão", fonte: EST },
      { item: "Cobertura", valor: "telhado cerâmico sobre madeira, sem laje (Fig. 14); vão 6,60 m (estimado da Fig. 8); cargas padrão do sistema", fonte: "estimado das figuras" },
      { item: "Vento", valor: vt.v0 ? "V0 = " + br(vt.v0, 0) + " m/s; categoria III (zona rural, casas esparsas — Figs. 5 e 11 a 13)" : "V0 pendente", fonte: vt.fonte },
      { item: "Solo", valor: "sem sondagem: a tensão admissível fica pendente", fonte: "o artigo não informa" }
    ];
    var av = r.avisos.slice();
    if (ver === "construida") av.push("Como construída: a peça de 10 cm não comporta pilarete, verga nem cinta armados (concreto embutido de 7 cm, abaixo dos 10 cm da NBR 6118, 13.2.2), e o artigo descreve pilares embutidos nela (p. 10). O cálculo aponta isso; a variante RA (fachadas 20 cm, internas 13 cm) atende.");
    return { obra: r.obra, avisos: av, paredesModelo: ps, convencional: CONVENCIONAL.map(function (c) { return { id: c.id, nome: c.nome, comprimento: r3(comprimento(c)), altura: H, area: r3(comprimento(c) * H) }; }),
      vaos: vaosMeta, premissas: premissas, versao: ver, versoes: VERSOES };
  }

  /* ------------------------------------------------------------------
   * ÁREA DE PLACA: sistema × 144 m² do artigo
   * ------------------------------------------------------------------ */
  function pagsDe(res) {
    var l = Array.isArray(res) ? res : (res && res.paredes) || [];
    return l.map(function (p) { return p && p.quant ? p : (p && p.pag); }).filter(function (p) { return p && p.quant; });
  }
  function areaPlaca(resultado) {
    var pags = pagsDe(resultado);
    var L = 0, bruta = 0, vaos = 0, liquida = 0, pecas = 0, H = 0, nf = 0, temBancada = false;
    pags.forEach(function (p) {
      L += num(p.comprimento); bruta += num(p.comprimento) * num(p.altura); vaos += num(p.quant.areaVaos); liquida += num(p.quant.areaLiquida); pecas += num(p.quant.areaPecas);
      H = Math.max(H, num(p.altura)); nf = Math.max(nf, (p.fiadas || []).length);
      if (p.id === BANCADA.id) temBancada = true;
    });
    var Lb = comprimento(BANCADA), bancadaM2 = Lb * H;
    var brutaComBancada = temBancada ? bruta : bruta + bancadaM2, A = ARTIGO.areaParede;
    var o = {
      comprimentoEixos: r2(L), altura: r3(H), fiadas: nf, bruta: r2(bruta), vaos: r2(vaos), liquida: r2(liquida), areaPecas: r2(pecas),
      artigo: A, temBancada: temBancada, bancadaComprimento: r2(Lb), bancadaM2: r2(bancadaM2),
      brutaComBancada: r2(brutaComBancada), comprimentoComBancada: r2(temBancada ? L : L + Lb),
      difBruta: r2(bruta - A), difLiquida: r2(liquida - A), difComBancada: r2(brutaComBancada - A)
    };
    o.explicacao = [
      "Artigo: " + br(A, 0) + " m² de parede de placa (p. 16), sem dizer como foi medido.",
      "Sistema: " + br(L, 2) + " m de parede nos eixos × " + br(H, 3) + " m (" + nf + " fiadas) = " + br(bruta, 2) + " m² brutos" + (temBancada ? " (com a linha cozinha/sala como parede)" : "") + ".",
      (temBancada ? "" : "Somando a linha cozinha/sala, que a Fig. 8 desenha como parede (" + br(Lb, 2) + " m × " + br(H, 3) + " m = " + br(bancadaM2, 2) + " m²), dá " + br(brutaComBancada, 2) + " m² — " + (Math.abs(brutaComBancada - A) < 2 ? "praticamente os " + br(A, 0) + " m² do artigo" : "diferença de " + br(brutaComBancada - A, 2) + " m²") + ". Conclusão: o artigo mediu a área BRUTA (comprimento × altura, sem descontar portas e janelas) e contou a bancada como parede.") ,
      "Descontando " + br(vaos, 2) + " m² de portas e janelas (medidas estimadas das figuras), sobram " + br(liquida, 2) + " m² líquidos — é essa a área que vai para a compra, o orçamento e o cronograma do sistema.",
      "A área das peças (" + br(pecas, 2) + " m²) é menor que a líquida porque não conta as juntas de 1,5 cm."
    ].filter(Boolean);
    return o;
  }

  /* ------------------------------------------------------------------
   * O ARTIGO REFEITO À MÃO — e as inconsistências
   * ------------------------------------------------------------------ */
  function contaArtigo() {
    var A = ARTIGO, a = A.areaParede, inc = [], linhas = [];
    var somaConta = 0, somaPub = 0;
    A.blocok.itens.forEach(function (it) {
      var conta = r2(it.m2 * a);
      somaConta += conta; somaPub += it.total;
      linhas.push({ item: it.item, m2: it.m2, conta: conta, publicado: it.total, diferenca: r2(it.total - conta) });
      if (Math.abs(it.total - conta) >= 0.005) inc.push({ chave: "tab2-" + it.item, texto: "Tabela 2, " + it.item + ": R$ " + br(it.m2) + " × " + a + " m² = R$ " + br(conta) + ", mas o artigo publica R$ " + br(it.total) + " (diferença de R$ " + br(it.total - conta) + ")." });
    });
    somaConta = r2(somaConta); somaPub = r2(somaPub);
    var reb = r2(A.reboco.m2 * A.areaReboco), alv = r2(A.alvenaria.m2 * a), conv = r2(reb + alv);
    var f16 = A.fig16, placaCim = r2(A.blocok.itens[0].total + A.blocok.itens[1].total), comAC3 = r2(placaCim + A.blocok.itens[2].total);
    var somaFig16 = r2(f16.materialParedeBlocok + f16.materialRebocoBlocok + f16.moBlocok), somaFig16Certa = r2(placaCim + f16.materialRebocoBlocok + f16.moBlocok);
    inc.push({ chave: "fig16", texto: "Fig. 16, material da parede pré-moldada: R$ " + br(f16.materialParedeBlocok) + ". Pela Tabela 2, placa + cimento = R$ " + br(placaCim) + " (a AC3 de R$ " + br(f16.materialRebocoBlocok) + " está na barra do reboco) ou R$ " + br(comAC3) + " com a AC3. Com R$ " + br(placaCim) + " as três barras somam R$ " + br(somaFig16Certa) + " (o total da Fig. 17); com R$ " + br(f16.materialParedeBlocok) + " somariam R$ " + br(somaFig16) + ". Dígitos trocados: 11.152 virou 11.525." });
    var red = r2((1 - A.blocok.total / A.convencionalTotal) * 100), redConta = r2((1 - somaConta / conv) * 100);
    inc.push({ chave: "escopo-47", texto: "A redução de " + br(A.reducaoPct) + " % (conferida: 1 − " + br(A.blocok.total) + " ÷ " + br(A.convencionalTotal) + " = " + br(red) + " %) vale só para parede + reboco: não entram estrutura (o convencional não tem pilar, viga nem verga; a Tabela 2 não tem aço, areia nem brita dos pilares embutidos), chapisco, instalações, acabamento, BDI nem prazo." });
    inc.push({ chave: "sem-prazo", texto: "O artigo não mede dias de execução: diz só que a obra é \"mais rápida\" (p. 18). O site do fabricante fala em ~50 % do tempo total, sem conta." });
    inc.push({ chave: "cota-sala", texto: "Fig. 8: a cota da sala é 5,80 m, mas a área da Tabela 1 (25,96 m²) é 5,90 × 4,40 — a cota que fecha com o desenho é 5,90 m." });
    inc.push({ chave: "cozinha", texto: "Tabela 1: cozinha de 7,70 m² (4,10 × 1,88), mas a Fig. 8 com parede de 20 cm dá 4,10 × 1,80 = 7,38 m² — a linha cozinha/sala é mais fina que parede (bancada)." });
    var fig8 = r2((A.fig8.comprimento - 3.20) * A.fig8.largura + 3.20 * 3.40);
    inc.push({ chave: "area-construida", texto: "Área construída de " + br(A.areaConstruida) + " m² (p. 13); pela Fig. 8, bloco de 10,60 × 6,80 m + anexo do WC suíte de 3,20 × 3,40 m = " + br(fig8) + " m²." });
    return {
      area: a, blocok: { linhas: linhas, somaConta: somaConta, somaPublicada: somaPub, totalPublicado: A.blocok.total, porM2: r2(A.blocok.total / a) },
      convencional: { reboco: reb, rebocoPublicado: A.reboco.total, alvenaria: alv, alvenariaPublicado: A.alvenaria.total, total: conv, totalPublicado: A.convencionalTotal, porM2: r2(A.convencionalTotal / a) },
      reducaoPct: red, reducaoPctConta: redConta, reducaoMaterialRebocoPct: r2((1 - A.blocok.itens[2].total / A.reboco.material.total) * 100),
      economiaMOPct: r2((1 - A.blocok.itens[3].total / f16.moConv) * 100), fig16Soma: somaFig16, fig16SomaCerta: somaFig16Certa,
      inconsistencias: inc, fonte: FONTES.artigo.curto + " — Tabelas 2, 3 e 4 (p. 17) e Figs. 16 e 17 (p. 18 e 19); valores de " + A.ano + ", " + A.uf
    };
  }

  /* ------------------------------------------------------------------
   * QUANTIDADES da obra calculada (para custo e cronograma)
   * ------------------------------------------------------------------ */
  function ehVerga(el) { return /^(verga|viga|contraverga)/i.test(el) || /(^|\s)C?V-/.test(el); }
  /* obra (opcional): a estrutura do CONVENCIONAL sai da paginação BASE de cada
     parede (BlocokExec.paginar sem o ajuste do painel): cantos, bordas de vão,
     pilarete a cada ≤ 4 m e cinta de respaldo, com a armadura construtiva do
     motor (2 φ10 + estribos φ5 c/ 20 cm). O ajuste do painel (pilaretes mais
     próximos e cinta intermediária) é necessidade do painel Blocok — não vai
     para a alvenaria de bloco. Sem a obra, usa o arranjo do resultado. */
  function quantidades(resultado, obra) {
    var pags = pagsDe(resultado), E = Exec(), R = E._ret;
    var base = obra && Array.isArray(obra.paredes) && obra.paredes.length ? obra.paredes.map(function (w) { var w0 = clone(w); delete w0.cfg; return E.paginar(w0); }).filter(function (p) { return p && p.ok; }) : null;
    var q = { A: 0, a1: 0, fachada: 0, interna: 0, acoVerga: 0, acoPil: 0, concVerga: 0, concTotal: 0, nVergas: 0, telaM: 0, eps: 0, grampos: 0,
      /* estrutura de reforço do CONVENCIONAL (mesmas posições do Blocok) */
      cnv: { pilaretes: 0, formaM2: 0, concM3: 0, aco10: 0, aco5: 0, acoOutro: [], vergaM: 0, contraM: 0, cintaM: 0, layout: base ? "paginação base (sem o ajuste do painel), armadura construtiva" : "arranjo do resultado (obra não informada)" } };
    pags.forEach(function (p) {
      var Q = p.quant, al = num(Q.areaLiquida), a1 = 0;
      (p.pecas || []).forEach(function (pc) { if (pc.fiada === 1) a1 += num(pc.area); });
      q.A += al; q.a1 += Q.areaPecas > 0 ? al * Math.min(1, a1 / Q.areaPecas) : 0;
      if (p.externa) { q.fachada += al; q.interna += al; } else q.interna += 2 * al;
      (Q.aco || []).forEach(function (a) { if (ehVerga(String(a.elemento || ""))) q.acoVerga += num(a.kg); else q.acoPil += num(a.kg); });
      var cw = num(p.catalogo && p.catalogo.concreto), rf = p.reforcos || {};
      var fx = [].concat(rf.vergas || [], rf.contravergas || []).map(function (f) { return { x: f.x, y: f.y, w: f.w, h: f.h }; });
      var vs = (p.vaos || []).map(function (v) { return { x: v.x, y: v.y, w: v.w, h: v.h }; });
      q.concVerga += R.areaUniao(R.subtrairTodos(fx, vs)) * cw;
      q.concTotal += num(Q.concretoM3);
      q.nVergas += num(Q.escoramentoVergas); q.telaM += num(Q.tratamento && Q.tratamento.telaM); q.eps += num(Q.epsRetiradoM3); q.grampos += num(Q.grampos);
    });
    (base || pags).forEach(function (p) {
      var Q = p.quant, rf = p.reforcos || {}, cv = q.cnv;
      /* armadura construtiva do motor (BlocokExec.cfgPadrao().aco.pilarete: 2 φ10 com
         espera na fundação + estribo φ5 c/ 20 cm) com o estribo na seção do pilarete
         do convencional (9 cm × largura), a mesma conta de BlocokExec.quantitativos */
      var A0 = E.cfgPadrao(), ap = A0.aco.pilarete, M = E.MASSA, e9 = SINAPI.espBloco;
      (rf.pilaretes || []).filter(function (pl) { return pl.dono !== false; }).forEach(function (pl) {
        var w = num(pl.w), h = num(pl.h);
        cv.pilaretes++; cv.formaM2 += 2 * w * h; cv.concM3 += e9 * w * h;
        var kgL = ap.barras * (h + A0.pilarete.esperaFundacao) * (M[ap.bitola] || 0);
        var nE = Math.ceil(h / ap.estriboEsp) + 1, per = 2 * (Math.max(0.03, e9 - 0.03) + Math.max(0.03, w - 0.03)) + 0.10, kgE = nE * per * (M[ap.estriboBitola] || 0);
        if (ap.bitola === 10) cv.aco10 += kgL; else cv.acoOutro.push({ bitola: ap.bitola, kg: kgL });
        if (ap.estriboBitola === 5) cv.aco5 += kgE; else cv.acoOutro.push({ bitola: ap.estriboBitola, kg: kgE });
      });
      (rf.vergas || []).forEach(function (v) { cv.vergaM += num(v.w); });
      (rf.contravergas || []).forEach(function (v) { cv.contraM += num(v.w); });
      (rf.cintas || []).forEach(function (c) { cv.cintaM += num(c.w); });
    });
    q.concPil = Math.max(0, q.concTotal - q.concVerga);
    q.paredes = pags.length;
    return q;
  }

  /* ------------------------------------------------------------------
   * CUSTO PELO SISTEMA (sem BDI) — Blocok pelos preços RA de out/2026
   * (js/blocokorc.js) e convencional pela SINAPI BA 06/2026 do sistema.
   * Nenhum número do artigo entra aqui.
   * ------------------------------------------------------------------ */
  var COD_PAREDE = /^BLK-0[12678]/, COD_ESTRUTURA = /^BLK-0[345]/;
  function codigosConv(cfg) {
    var c = (cfg && cfg.convencional && cfg.convencional.codigos) || {};
    return { alvenaria: c.alvenaria || "103328", chapiscoInterno: c.chapiscoInterno || "87879", chapiscoFachada: c.chapiscoFachada || "87905",
      embocoInterno: c.embocoInterno || "104951", embocoFachada: c.embocoFachada || "87775", massaBlocok: c.massaBlocok || "88495", massaConv: c.massaConv || "88497" };
  }
  /* estrutura de reforço do CONVENCIONAL: [código SINAPI, quantidade, unidade, o que é] */
  function estruturaConv(q) {
    var c = q.cnv;
    var itens = [
      ["92413", c.formaM2, "m²", "fôrma de madeira dos " + c.pilaretes + " pilaretes (2 faces)"],
      ["104108", c.aco10, "kg", "aço φ10 dos pilaretes (armadura construtiva do motor: 2 barras)"],
      ["104111", c.aco5, "kg", "estribos φ5 c/ 20 cm dos pilaretes (armadura construtiva do motor)"],
      ["103669", c.concM3, "m³", "concreto dos pilaretes (seção na espessura do bloco, 9 cm)"],
      ["105024", c.vergaM, "m", "vergas (mesmos vãos e apoios do Blocok)"],
      ["105030", c.contraM, "m", "contravergas (mesmos comprimentos)"],
      ["105034", c.cintaM, "m", "cinta de amarração no topo (canaleta como fôrma perdida)"]
    ].filter(function (x) { return x[1] > 1e-9; });
    var pendentes = c.acoOutro.map(function (a) { return { kg: r2(a.kg), texto: "aço φ" + br(a.bitola, 1) + " dos pilaretes (" + br(a.kg, 1) + " kg): sem composição SINAPI de armação embutida desta bitola no instantâneo — pendente" }; });
    return { itens: itens, pendentes: pendentes };
  }
  function custoSistema(resultado, cfgIn) {
    var cfg = cfgIn || {}, O = dep("BlocokOrc", "./blocokorc.js");
    if (!O) throw new Error("BlocokRef: BlocokOrc ausente");
    var q = quantidades(resultado, cfg.obra), orc = O.orcar(resultado, cfg.orc || {});
    var grupo = { parede: 0, estrutura: 0 }, linhasB = [];
    (orc.linhas || []).forEach(function (l) {
      var t = num(l.custoTotal != null ? l.custoTotal : l.custoUnitarioParcial * l.quantidade);
      var g = COD_ESTRUTURA.test(l.codigo) ? "estrutura" : "parede";
      grupo[g] += t;
      linhasB.push({ codigo: l.codigo, descricao: l.descricao, quantidade: l.quantidade, unidade: l.unidade, custoUnitario: l.custoUnitario, total: r2(t), grupo: g });
    });
    var C = codigosConv(cfg), S = SINAPI.itens, linhasC = [];
    function lc(etapa, g, cod, qtd, onde, un) {
      var it = S[cod]; if (!it) { linhasC.push({ etapa: etapa, grupo: g, codigo: cod, pendente: true, descricao: "código fora do instantâneo SINAPI — pendente" }); return 0; }
      var qq = r3(qtd), t = r2(it.custoUnitario * qq);   // a linha fecha com a quantidade que ela mostra
      linhasC.push({ etapa: etapa, grupo: g, codigo: cod, descricao: it.descricao, onde: onde, quantidade: qq, unidade: un || "m²", custoUnitario: it.custoUnitario, total: t });
      return t;
    }
    var alv = lc("Alvenaria", "vedacao", C.alvenaria, q.A, "área líquida das paredes");
    var chap = lc("Chapisco", "vedacao", C.chapiscoInterno, q.interna, "faces internas") + lc("Chapisco", "vedacao", C.chapiscoFachada, q.fachada, "face externa das fachadas");
    var emb = lc("Emboço / massa única", "vedacao", C.embocoInterno, q.interna, "faces internas") + lc("Emboço / massa única", "vedacao", C.embocoFachada, q.fachada, "face externa das fachadas");
    var ec = estruturaConv(q), est = 0;
    ec.itens.forEach(function (it) { est += lc("Estrutura de reforço", "estrutura", it[0], it[1], it[3], it[2]); });
    ec.pendentes.forEach(function (p) { linhasC.push({ etapa: "Estrutura de reforço", grupo: "estrutura", codigo: null, pendente: true, descricao: p.texto }); });
    var convVed = r2(alv + chap + emb), convEst = r2(est), convTot = r2(convVed + convEst);
    var blkParede = r2(grupo.parede), blkEstr = r2(grupo.estrutura), blkTotal = r2(blkParede + blkEstr);
    function dif(b, c) { return c > 0 ? r2((b / c - 1) * 100) : null; }
    return {
      area: r2(q.A), faces: { fachada: r2(q.fachada), interna: r2(q.interna) },
      blocok: { linhas: linhasB, parede: blkParede, estrutura: blkEstr, total: blkTotal, porM2: q.A > 0 ? r2(blkTotal / q.A) : null, paredePorM2: q.A > 0 ? r2(blkParede / q.A) : null,
        fonte: "preços de referência RA (" + O.DATA_BASE_PRECOS + ", editáveis) × composições próprias BLK-xx (js/blocokorc.js); sem BDI" },
      convencional: { linhas: linhasC, alvenaria: r2(alv), chapisco: r2(chap), emboco: r2(emb), vedacao: convVed, estrutura: convEst, total: convTot,
        layout: q.cnv.layout, porM2: q.A > 0 ? r2(convTot / q.A) : null, vedacaoPorM2: q.A > 0 ? r2(convVed / q.A) : null, pendencias: ec.pendentes.map(function (p) { return p.texto; }),
        fonte: SINAPI.fonte + " — " + SINAPI.porque + "; estrutura de reforço: " + SINAPI.porqueEstrutura + "; sem BDI" },
      quadros: {
        vedacao: { titulo: "(a) Vedação + revestimento", blocok: blkParede, convencional: convVed, diferencaPct: dif(blkParede, convVed),
          texto: "Só a parede pronta para o acabamento, nos dois métodos — o mesmo recorte do artigo. Blocok: peça, assentamento, juntas e ligações. Convencional: alvenaria de bloco cerâmico, chapisco e emboço nos dois lados. Nenhum dos dois tem estrutura." },
        comEstrutura: { titulo: "(b) Vedação + revestimento + estrutura de reforço", blocok: blkTotal, convencional: convTot, diferencaPct: dif(blkTotal, convTot),
          texto: "Os dois com a mesma estrutura de reforço, nas mesmas posições: pilaretes, vergas, contravergas e cinta. No Blocok, concreto e aço vão dentro da peça (a face é a fôrma) e só a verga é escorada. No convencional, os mesmos elementos são moldados com fôrma de madeira ou canaleta, pela SINAPI." }
      },
      notas: ["BDI não incluso nos dois lados.", "Preços de datas e fontes diferentes do artigo (2023, proprietário): não somar nem misturar com a coluna do artigo.",
        "O pilarete do convencional tem 9 cm (a espessura do bloco): a mesma NBR 6118 que reprova a placa de 10 cm reprovaria esse pilarete — o quadro (b) compara custo e prazo, não conformidade."]
    };
  }

  /* ------------------------------------------------------------------
   * CRONOGRAMA COMPARATIVO (dias úteis; equipe inteira na etapa; etapas
   * em sequência). dias = horas de mão de obra ÷ (pessoas × jornada) ou
   * área ÷ produtividade. Cada etapa diz a conta e a fonte e o GRUPO:
   *   vedacao    → quadro (a) vedação + revestimento
   *   estrutura  → entra no quadro (b) (com a cura do concreto)
   *   acabamento → só no total da obra das paredes (o Gantt)
   *   instalacoes → a definir (sem produtividade publicada), fora da soma
   *   cfg = { jornadaH: 8,
   *     blocok: { m2Dia: 48.2, equipe: 3 },        // BlocokExec.cfgPadrao().produtividade
   *     convencional: { equipe: 3, codigos: {…} },
   *     marcacaoDias: 1, curaConcretoDias: 3,      // parâmetros RA do js/blocokorc.js (cura vale nos dois)
   *     orc: { … } }                                // cfg do BlocokOrc (coeficientes BLK-xx)
   * ------------------------------------------------------------------ */
  function cfgCrono(cfgIn) {
    var E = Exec(), O = dep("BlocokOrc", "./blocokorc.js"), pr = E.cfgPadrao().produtividade, oc = O ? O.cfgPadrao() : { marcacaoDias: 1, curaConcretoDias: 3, jornadaH: 8 };
    var base = { jornadaH: oc.jornadaH || 8, blocok: { m2Dia: pr.m2Dia, equipe: pr.equipe, fonte: pr.fonte }, convencional: { equipe: pr.equipe, codigos: {} },
      marcacaoDias: oc.marcacaoDias, curaConcretoDias: oc.curaConcretoDias, orc: {} };
    return mesclar(base, cfgIn ? clone(cfgIn) : null);
  }
  function diasUteis(d) { return d == null ? null : (d > 1e-9 ? Math.ceil(d - 1e-9) : 0); }
  function cronograma(resultado, cfgIn) {
    var cfg = cfgCrono(cfgIn), O = dep("BlocokOrc", "./blocokorc.js");
    if (!O) throw new Error("BlocokRef: BlocokOrc ausente");
    var q = quantidades(resultado, cfgIn && cfgIn.obra);
    if (!q.paredes) return { ok: false, erro: "Sem paredes paginadas.", blocok: null, convencional: null };
    var comps = O.composicoes(cfg.orc, resultado), porCod = {};
    comps.forEach(function (c) { porCod[c.codigo] = c; });
    function hBlk(cod, qtd) { var c = porCod[cod], h = 0; if (!c) return 0; c.insumos.forEach(function (it) { if (it.tipo === "MO" && it.coeficiente != null) h += it.coeficiente * qtd; }); return h; }
    function hPorUn(cod) { return hBlk(cod, 1); }
    var J = num(cfg.jornadaH, 8), P = num(cfg.blocok.m2Dia, 48.2), eB = Math.max(1, num(cfg.blocok.equipe, 3)), eC = Math.max(1, num(cfg.convencional.equipe, 3));
    var cap = function (eq) { return eq * J; }, cura = num(cfg.curaConcretoDias);
    function et(o) { o.dias = o.dias == null ? null : r2(o.dias); o.diasUteis = diasUteis(o.dias); o.aDefinir = o.dias == null; o.estrutura = o.grupo === "estrutura"; return o; }
    var B = [], C = [], CC = codigosConv(cfg);
    var fP = "produtividade " + br(P) + " m²/dia com " + eB + " profissionais — " + cfg.blocok.fonte + " (estimado, editável)";

    // ---- BLOCOK ----
    var dAss1 = q.a1 / P, dAss2 = (q.A - q.a1) / P;
    B.push(et({ id: "blk-marc", n: 1, grupo: "vedacao", nome: "Marcação e 1ª fiada", quantidade: r2(q.a1), unidade: "m²", dias: num(cfg.marcacaoDias) + dAss1, assentamento: r2(dAss1),
      conta: br(cfg.marcacaoDias, 0) + " dia de marcação (parâmetro RA) + " + br(q.a1) + " m² ÷ " + br(P) + " m²/dia", fonte: fP }));
    B.push(et({ id: "blk-fiadas", n: 2, grupo: "vedacao", nome: "Fiadas 2 a " + ARTIGO.fiadasAteLaje + " (até a laje)", quantidade: r2(q.A - q.a1), unidade: "m²", dias: dAss2, assentamento: r2(dAss2),
      conta: br(q.A - q.a1) + " m² ÷ " + br(P) + " m²/dia (grampos de ligação dentro da produtividade)", fonte: fP }));
    var hArmP = hBlk("BLK-04", q.acoPil), hConcP = hBlk("BLK-03", q.concPil);
    B.push(et({ id: "blk-pil", n: 3, grupo: "estrutura", nome: "Retração do EPS, armação e concretagem de pilaretes e cintas", quantidade: r2(q.acoPil), unidade: "kg de aço", horas: r2(hArmP + hConcP),
      dias: (hArmP + hConcP) / cap(eB),
      conta: br(q.acoPil, 1) + " kg × " + br(hPorUn("BLK-04"), 3) + " h/kg + " + br(q.concPil, 3) + " m³ × " + br(hPorUn("BLK-03"), 1) + " h/m³ = " + br(hArmP + hConcP, 1) + " h ÷ (" + eB + " × " + J + " h); sem fôrma (a face da peça é a fôrma); a retração do EPS (" + br(q.eps, 3) + " m³ retirados) vai junto com a armação",
      fonte: "composições BLK-03 e BLK-04 (js/blocokorc.js, parâmetros RA editáveis); retração do EPS sem produtividade publicada" }));
    var hEsc = hBlk("BLK-05", q.nVergas), hArmV = hBlk("BLK-04", q.acoVerga), hConcV = hBlk("BLK-03", q.concVerga);
    B.push(et({ id: "blk-vergas", n: 4, grupo: "estrutura", nome: "Vergas e contravergas (embutidas) e cura do concreto", quantidade: q.nVergas, unidade: "vergas", horas: r2(hEsc + hArmV + hConcV), espera: cura,
      dias: (hEsc + hArmV + hConcV) / cap(eB) + cura,
      conta: q.nVergas + " escoramento(s) + " + br(q.acoVerga, 1) + " kg + " + br(q.concVerga, 3) + " m³ = " + br(hEsc + hArmV + hConcV, 1) + " h ÷ (" + eB + " × " + J + " h) + " + br(cura, 0) + " dias de cura (espera, parâmetro RA)",
      fonte: "composições BLK-03, BLK-04 e BLK-05 (js/blocokorc.js, parâmetros RA editáveis)" }));
    var hJ = hBlk("BLK-06", q.telaM);
    B.push(et({ id: "blk-juntas", n: 5, grupo: "vedacao", nome: "Juntas com AC3 e rejunte de 1,5 cm", quantidade: r2(q.telaM), unidade: "m de junta (2 faces)", horas: r2(hJ), dias: hJ / cap(eB),
      conta: br(q.telaM, 1) + " m × " + br(hPorUn("BLK-06"), 2) + " h/m = " + br(hJ, 1) + " h ÷ (" + eB + " × " + J + " h) — é o revestimento do Blocok (sem chapisco nem emboço)",
      fonte: "composição BLK-06 (js/blocokorc.js, parâmetro RA); AC3 e junta de 1,5 cm: artigo p. 9 e quadro não oficial" }));
    B.push(et({ id: "blk-inst", n: 6, grupo: "instalacoes", nome: "Instalações (furo no EPS com tubo de PVC; rasgo com serra e soprador)", quantidade: null, dias: null,
      conta: "a definir — sem produtividade publicada; não entra na soma", fonte: FONTES.artigo.curto + ", p. 10 (o método, sem tempo)" }));
    var aF = 2 * q.A, hMB = (hSinapi(CC.massaBlocok) || 0) * aF;
    B.push(et({ id: "blk-acab", n: 7, grupo: "acabamento", nome: "Acabamento fino (massa corrida, 1 demão)", quantidade: r2(aF), unidade: "m² (2 faces)", horas: r2(hMB), dias: hMB / cap(eB), sinapi: CC.massaBlocok,
      conta: br(aF) + " m² × " + br(hSinapi(CC.massaBlocok), 4) + " h/m² (SINAPI " + CC.massaBlocok + ") = " + br(hMB, 1) + " h ÷ (" + eB + " × " + J + " h)",
      fonte: SINAPI.fonte + "; 1 demão = premissa RA a partir do artigo (p. 9: a mesma massa corrida, em camada muito fina)" }));

    // ---- CONVENCIONAL ----  partes = [[código, quantidade, unidade, onde]]
    function sin(id, n, grupo, nome, partes, extra, espera) {
      var h = 0, txt = [], ok = true;
      partes.forEach(function (pt) { var hh = hSinapi(pt[0]); if (hh == null) { ok = false; return; } h += hh * pt[1]; txt.push(br(pt[1]) + " " + (pt[2] || "m²") + " × " + br(hh, 4) + " h (SINAPI " + pt[0] + (pt[3] ? ", " + pt[3] : "") + ")"); });
      var o = { id: id, n: n, grupo: grupo, nome: nome, quantidade: partes.length === 1 ? r2(partes[0][1]) : null, unidade: partes.length === 1 ? (partes[0][2] || "m²") : "várias", horas: ok ? r2(h) : null,
        dias: ok ? h / cap(eC) + (espera || 0) : null, espera: espera || 0, sinapi: partes.map(function (pt) { return pt[0]; }).join(" + "),
        conta: ok ? txt.join(" + ") + " = " + br(h, 1) + " h ÷ (" + eC + " × " + J + " h)" + (espera ? " + " + br(espera, 0) + " dias de cura (espera, o mesmo parâmetro RA do Blocok)" : "") : "coeficiente fora da base SINAPI do sistema — pendente",
        fonte: SINAPI.fonte + (extra ? "; " + extra : "") };
      return et(o);
    }
    var ec = estruturaConv(q);
    C.push(sin("cnv-alv", 1, "vedacao", "Alvenaria de bloco cerâmico", [[CC.alvenaria, q.A, "m²"]], "inclui a marcação"));
    var oE = sin("cnv-est", 2, "estrutura", "Estrutura de reforço: fôrma, armação e concretagem de pilaretes; vergas, contravergas e cinta; cura", ec.itens.map(function (it) { return [it[0], it[1], it[2], it[3]]; }), SINAPI.porqueEstrutura, cura);
    if (ec.pendentes.length) { oE.parcial = true; oE.conta += " — " + ec.pendentes.map(function (p) { return p.texto; }).join("; "); }
    C.push(oE);
    C.push(sin("cnv-chap", 3, "vedacao", "Chapisco nos dois lados", [[CC.chapiscoInterno, q.interna, "m²", "faces internas"], [CC.chapiscoFachada, q.fachada, "m²", "fachada"]]));
    C.push(sin("cnv-emb", 4, "vedacao", "Emboço / massa única nos dois lados", [[CC.embocoInterno, q.interna, "m²", "faces internas"], [CC.embocoFachada, q.fachada, "m²", "fachada"]]));
    C.push(et({ id: "cnv-inst", n: 5, grupo: "instalacoes", nome: "Instalações (rasgo na alvenaria)", quantidade: null, dias: null, conta: "a definir — não entra na soma (igual ao Blocok)", fonte: FONTES.artigo.curto + ", p. 10" }));
    C.push(sin("cnv-acab", 6, "acabamento", "Acabamento (massa corrida, 2 demãos)", [[CC.massaConv, aF, "m²"]], "2 demãos = premissa RA (a camada do convencional é a mais grossa — artigo p. 9)"));

    function tot(L, grupos) {
      var d = 0, u = 0; L.forEach(function (e) { if (e.dias == null || grupos.indexOf(e.grupo) < 0) return; d += e.dias; u += e.diasUteis; });
      return { dias: r2(d), diasUteis: u };
    }
    var G_A = ["vedacao"], G_B = ["vedacao", "estrutura"], G_T = ["vedacao", "estrutura", "acabamento"];
    var tB = { vedacao: tot(B, G_A), comEstrutura: tot(B, G_B), total: tot(B, G_T) }, tC = { vedacao: tot(C, G_A), comEstrutura: tot(C, G_B), total: tot(C, G_T) };
    function red(k) { return tC[k].diasUteis > 0 ? r2((1 - tB[k].diasUteis / tC[k].diasUteis) * 100) : null; }
    var pend = [
      { chave: "instalacoes", texto: "Instalações: nenhum dos dois métodos tem produtividade publicada — fora da soma." },
      { chave: "secao-conv", texto: "Estrutura de reforço do convencional nas mesmas posições da do Blocok, com o pilarete na espessura do bloco (9 cm): a mesma NBR 6118 que reprova a placa de 10 cm reprovaria esse pilarete. O quadro (b) compara custo e prazo, não conformidade." },
      { chave: "nbr7200", texto: "Intervalos de cura do revestimento do convencional (base → chapisco → emboço → acabamento) não entram: a NBR 7200 não está na biblioteca de normas da RA (a garimpar)." },
      { chave: "produtividade", texto: "Produtividade do Blocok de " + br(P) + " m²/dia: quadro NÃO oficial, sem tamanho de equipe; a equipe de " + eB + " é a do artigo. O orçamento usa 45 m²/dia (vídeo do fabricante), o lado do custo mais alto." }
    ].concat(ec.pendentes.map(function (p) { return { chave: "aco-conv", texto: p.texto }; }));
    return {
      ok: true, unidade: "dias úteis (equipe inteira na etapa, etapas em sequência)", parametros: { jornadaH: J, blocok: { m2Dia: P, equipe: eB, fonte: cfg.blocok.fonte }, convencional: { equipe: eC }, marcacaoDias: cfg.marcacaoDias, curaConcretoDias: cura },
      quantidades: { area: r2(q.A), primeiraFiada: r2(q.a1), facesInternas: r2(q.interna), fachada: r2(q.fachada), acoPilaretesCintas: r2(q.acoPil), acoVergas: r2(q.acoVerga), concretoPilaretesCintas: r3(q.concPil), concretoVergas: r3(q.concVerga), vergas: q.nVergas, juntaM: r2(q.telaM),
        convencional: { layout: q.cnv.layout, pilaretes: q.cnv.pilaretes, formaM2: r2(q.cnv.formaM2), concretoM3: r3(q.cnv.concM3), acoPhi10: r2(q.cnv.aco10), acoPhi5: r2(q.cnv.aco5), vergaM: r2(q.cnv.vergaM), contravergaM: r2(q.cnv.contraM), cintaM: r2(q.cnv.cintaM) } },
      blocok: { etapas: B, vedacao: tB.vedacao, comEstrutura: tB.comEstrutura, total: tB.total, assentamentoDias: r2(dAss1 + dAss2) },
      convencional: { etapas: C, vedacao: tC.vedacao, comEstrutura: tC.comEstrutura, total: tC.total },
      comparacao: {
        vedacao: { blocok: tB.vedacao.diasUteis, convencional: tC.vedacao.diasUteis, reducaoPct: red("vedacao"), titulo: "(a) Vedação + revestimento" },
        comEstrutura: { blocok: tB.comEstrutura.diasUteis, convencional: tC.comEstrutura.diasUteis, reducaoPct: red("comEstrutura"), titulo: "(b) Vedação + revestimento + estrutura de reforço (com a cura)" },
        total: { blocok: tB.total.diasUteis, convencional: tC.total.diasUteis, reducaoPct: red("total"), titulo: "Obra das paredes até a massa corrida (o Gantt)" },
        texto: "Mesma equipe de " + eB + " profissionais. (a) Vedação + revestimento: Blocok " + tB.vedacao.diasUteis + " × convencional " + tC.vedacao.diasUteis + " dias úteis. (b) Com a estrutura de reforço e a cura nos dois: Blocok " + tB.comEstrutura.diasUteis + " × convencional " + tC.comEstrutura.diasUteis + ". Até a massa corrida: " + tB.total.diasUteis + " × " + tC.total.diasUteis + "."
      },
      pendencias: pend
    };
  }

  /* ------------------------------------------------------------------
   * PARA O CRONOGRAMA DO SISTEMA (js/cronograma.js): cada etapa vira uma
   * etapa do orçamento com a duração gravada em cronograma.duracoes, em
   * sequência sem sobreposição (lag 0). Etapa "a definir" fica fora (vai em
   * `foraDoGantt`): o motor estimaria por categoria e inventaria um prazo.
   * ------------------------------------------------------------------ */
  function paraCronogramaSistema(cr, metodo) {
    var L = cr && cr[metodo === "convencional" ? "convencional" : "blocok"];
    if (!L) return null;
    var etapas = [], preds = {}, lags = {}, dur = {}, fora = [], ant = null;
    L.etapas.forEach(function (e) {
      if (e.aDefinir || !(e.diasUteis > 0)) { fora.push({ id: e.id, nome: e.nome, motivo: e.conta }); return; }
      var id = "ref_" + e.id.replace(/-/g, "_");
      etapas.push({ id: id, codigo: "", nome: e.nome, itens: [{ descricao: e.nome, unidade: e.unidade || "vb", quantidade: e.quantidade || 1, custoUnitario: 0 }], origem: "BlocokRef" });
      preds[id] = ant ? [ant] : [];
      if (ant) { lags[id] = {}; lags[id][ant] = 0; }
      dur[id] = e.diasUteis; ant = id;
    });
    return { etapas: etapas, cronograma: { predecessoras: preds, lags: lags, duracoes: dur }, foraDoGantt: fora, totalDias: etapas.reduce(function (s, e) { return s + dur[e.id]; }, 0) };
  }

  /* ------------------------------------------------------------------
   * PESO DA PEÇA pelos materiais — o "4,7k Newtons por m²" do quadro não
   * oficial NÃO é usado (não bate com a geometria). Faces de microconcreto
   * com o peso de concreto simples (NBR 6120) + núcleo de EPS (15 kg/m³, o
   * maior da faixa da classe F 13–15 kg/m³ — js/blocokensaio.js PARAM.eps).
   * ------------------------------------------------------------------ */
  function pesoPorMateriais(esp) {
    var E = Exec(), cat = E.catalogo(esp), cfg = E.cfgPadrao(), t = cfg.face, area = cfg.placa * cfg.placa;
    var gFace = 24, gEps = 0.15;
    var kNm2 = 2 * t * gFace + cat.nucleo * gEps, kgPeca = kNm2 * area / 0.00981;
    var catKNm2 = cat.peso * 0.00981 / area;
    return {
      espessura: Math.round(cat.esp * 100), kNm2: r3(kNm2), kgPeca: r2(kgPeca),
      conta: "2 faces × " + br(t * 100, 1) + " cm × 24 kN/m³ + núcleo " + br(cat.nucleo * 100, 0) + " cm × 0,15 kN/m³ = " + br(kNm2, 3) + " kN/m² (" + br(kgPeca, 1) + " kg por peça de " + br(area, 2) + " m²)",
      fonte: FONTES.nbr6120 + "; EPS 15 kg/m³ (faixa da classe F, js/blocokensaio.js)",
      catalogo: { kg: cat.peso, kNm2: r3(catKNm2), fonte: E.FONTES.peso },
      naoOficial: { kNm2: 4.7, fonte: FONTES.naoOficial.curto, razao: r2(4.7 / kNm2),
        leitura: "4,7 kN/m² é " + br(4.7 / kNm2, 1) + " vezes o peso pelos materiais; 47 kgf/m² (≈ 0,46 kN/m²) bateria com a tabela do franqueado para a peça de 10 cm — provável erro de unidade. Não usado." }
    };
  }

  return {
    FONTES: FONTES, ARTIGO: ARTIGO, SINAPI: SINAPI, VERSOES: VERSOES, NOME: NOME, LOCAL: LOCAL,
    PAREDES: PAREDES, BANCADA: BANCADA, CONVENCIONAL: CONVENCIONAL,
    obra: obra, areaPlaca: areaPlaca, contaArtigo: contaArtigo, custoSistema: custoSistema, cronograma: cronograma,
    paraCronogramaSistema: paraCronogramaSistema, pesoPorMateriais: pesoPorMateriais, alturaFiadas: alturaFiadas, hSinapi: hSinapi,
    _quantidades: quantidades
  };
});
