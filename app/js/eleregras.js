/* =====================================================================
 * eleregras.js — PONTOS ELÉTRICOS POR AMBIENTE: as REGRAS com o nível de fonte (21/10/2026). Motor PURO, ES5.
 *
 * Pesquisa de origem: docs/eletrica/pesquisa/ (RESUMO.md, REGRAS-AMBIENTE.md, dados/pontos-por-ambiente.json — ramo
 * claude/pesquisa-eletrica). O teste tools/test-ele-pontos.js confere cada número daqui contra aquele JSON: número de
 * norma que muda aqui sem mudar lá (ou o contrário) derruba o teste.
 *
 * NBR 5410:2004 — CONFERIDA NO TEXTO (21/10/2026): o Rogério forneceu uma cópia que NÃO é exemplar licenciado à RA
 *   (exemplarLicenciado: false). Daqui só saem VALORES com o item (nunca o texto, nunca o PDF arquivado, nunca quem comprou).
 *   Cada regra que a pesquisa trazia por fonte secundária (Procobre/H. Moreno, TCC UNIFACIG) foi lida no item da norma
 *   (páginas da cópia renderizadas e lidas): 9.5.2.1.1, 9.5.2.1.2, 9.5.2.2.1 a)-e), 9.5.2.2.2, 9.5.2.3, 9.5.3.1,
 *   4.2.1.2.3 c)/d), 9.1.2.1 + Figuras 16-18 (volumes), 9.1.4.2.4, 9.1.4.3.1-9.1.4.3.3. Os NÚMEROS da pesquisa batem; os
 *   ITENS de algumas regras estavam errados ou "de memória" e foram trocados: circuito independente acima de 10 A é a
 *   9.5.3.1 (não a 4.2.5); a TUE a no máximo 1,5 m é a 4.2.1.2.3 d) (estava "sem fonte"); o afastamento do box é o VOLUME 2
 *   (0,60 m além do volume 1) e, sem box, o volume 1 é o raio de 0,60 m em volta da saída do chuveiro (Figura 18) — antes o
 *   motor usava um box "usual" de 0,90 m, que deixava a tomada perto demais.
 *
 * NÍVEIS (vão para a tela; ninguém lê "3,5 m" sem saber de onde veio):
 *   A  fonte primária lida (SINAPI MG 06/2026 — descrições das composições; CEMIG ND-5.1 rev. MAR/2026 — tabelas)
 *   N  NBR 5410:2004, item LIDO (exemplarLicenciado: false — só o valor com o item)
 *   S  NBR 5410 por FONTE SECUNDÁRIA — conferir (nenhuma regra usa mais: todas foram conferidas no item)
 *   C  critério RA (prática de projeto, decisão a aprovar pelo RT; editável neste aparelho)
 *   X  sem fonte lida — valor usual de projeto, conferir
 *
 * O NOME do ambiente é classificado pelo js/esqregras.js (o mesmo classificador das esquadrias — não duplica) e o tipo vira
 * o GRUPO da regra de tomadas (9.5.2.2.1): cozinha_servico · banheiro · sala_dormitorio · varanda · externa · demais.
 *   EleRegras.classificar(nome) → { id, rotulo, grupo, casou, termo }
 *   EleRegras.criterios(sobre) · nTug(grupo, area, perimetro, C) · vaIluminacao(area, C) · nLuminarias(area, alongado, comp, C)
 *   EleRegras.vaTug(grupo, n, C) · aparelhoDe(famId, valores, inst) · tomadaPara(potW, tensaoV, C) · potenciaAr(btu)
 * Teste: node tools/test-ele-pontos.js
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function ER() { return dep("EsqRegras", "./esqregras.js"); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function copia(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function num(v, d) { var n = Number(v); return v != null && v !== "" && isFinite(n) ? n : d; }

  var NIVEIS = {
    A: "fonte primária lida (SINAPI MG 06/2026 / CEMIG ND-5.1 / NBR 9050:2020)",
    N: "NBR 5410:2004, item lido (cópia não licenciada à RA — só o valor)",
    S: "NBR 5410 por fonte secundária — conferir na NBR 5410",
    C: "critério RA (prática de projeto, editável)",
    X: "sem fonte lida — conferir"
  };
  function rotuloNivel(n) { var k = String(n || "").charAt(0); return NIVEIS[k] || NIVEIS.X; }

  var F_PROCOBRE = "Procobre/H. Moreno, apostila \"Instalações elétricas em edifícios — NBR 5410\" (fonte secundária)";
  var F_TCC = "Câmara & Lima, TCC UNIFACIG (transcreve o item; fonte secundária)";
  var F_SINAPI = "SINAPI MG 06/2026, descrição das composições";
  var F_CEMIG = "CEMIG ND-5.1 rev. MAR/2026";
  var F_ENG360 = "engenharia360 (blog; sem item de norma)";
  var CONFERIR = " — conferir na NBR 5410";
  var F_NBR = "ABNT NBR 5410:2004, item lido (cópia não licenciada à RA, exemplarLicenciado: false)";
  var NORMA = { id: "ABNT NBR 5410:2004", exemplarLicenciado: false, conferidaEm: "2026-10-21", obs: "só valores com o item; o PDF não é arquivado; sem identificação de comprador" };

  /* ------------------------------------------------------------------ CRITÉRIOS (os de nível C/X editáveis na tela) */
  var CRITERIOS = {
    luzMinimo: { valor: 1, nivel: "N", item: "NBR 5410 9.5.2.1.1", rotulo: "Pontos de luz no teto por cômodo (mínimo)", fonte: F_NBR },
    luzVaBase: { valor: 100, nivel: "N", item: "NBR 5410 9.5.2.1.2 a)", rotulo: "Carga mínima de iluminação até a área base (VA)", fonte: F_NBR },
    luzAreaBase: { valor: 6, nivel: "N", item: "NBR 5410 9.5.2.1.2 a)", rotulo: "Área base da carga de iluminação (m²)", fonte: F_NBR },
    luzVaPasso: { valor: 60, nivel: "N", item: "NBR 5410 9.5.2.1.2 b)", rotulo: "Acréscimo de carga por passo de área inteiro (VA)", fonte: F_NBR },
    luzAreaPasso: { valor: 4, nivel: "N", item: "NBR 5410 9.5.2.1.2 b)", rotulo: "Passo de área (m² inteiros)", fonte: F_NBR },
    luzAreaUmPonto: { valor: 12, nivel: "C", rotulo: "Luminárias: um ponto central até esta área (m²)", fonte: "decisão RA da pesquisa (a NBR 5410 só exige 1 ponto); projeto luminotécnico manda" },
    luzAreaPorPonto: { valor: 9, nivel: "C", rotulo: "Luminárias: acima disso, um ponto a cada (m²)", fonte: "decisão RA da pesquisa (aprovar com o RT)" },
    luzCorredorPasso: { valor: 3, nivel: "C", rotulo: "Corredor: um ponto a cada (m de comprimento)", fonte: "decisão RA da pesquisa (aprovar com o RT)" },
    alongado: { valor: 2.5, nivel: "C", rotulo: "Ambiente alongado (comprimento ÷ largura) vira corredor", fonte: "critério RA" },
    tugPerimCozinha: { valor: 3.5, nivel: "N", item: "NBR 5410 9.5.2.2.1 b)", rotulo: "Cozinha/copa/serviço: 1 tomada a cada (m de perímetro, ou fração)", fonte: F_NBR },
    tugMinBancadaPia: { valor: 2, nivel: "N", item: "NBR 5410 9.5.2.2.1 b)", rotulo: "Cozinha: tomadas acima da bancada da pia (mínimo)", fonte: F_NBR },
    tugBanheiro: { valor: 1, nivel: "N", item: "NBR 5410 9.5.2.2.1 a)", rotulo: "Banheiro: tomadas próximo ao lavatório, atendidas as restrições de 9.1 (mínimo)", fonte: F_NBR },
    tugVaranda: { valor: 1, nivel: "N", item: "NBR 5410 9.5.2.2.1 c)", rotulo: "Varanda: tomadas (mínimo)", fonte: F_NBR },
    tugPerimSalaDorm: { valor: 5, nivel: "N", item: "NBR 5410 9.5.2.2.1 d)", rotulo: "Sala/dormitório: 1 tomada a cada (m de perímetro, ou fração)", fonte: F_NBR },
    tugDemaisArea: { valor: 6, nivel: "N", item: "NBR 5410 9.5.2.2.1 e)", rotulo: "Demais cômodos: até esta área, 1 tomada (m²; até 2,25 m² ela pode ficar fora, a ≤ 0,80 m da porta)", fonte: F_NBR },
    tugPerimDemais: { valor: 5, nivel: "N", item: "NBR 5410 9.5.2.2.1 e)", rotulo: "Demais cômodos acima da área: 1 tomada a cada (m de perímetro)", fonte: F_NBR },
    vaTugMolhada: { valor: 600, nivel: "N", item: "NBR 5410 9.5.2.2.2 a)", rotulo: "Potência por tomada em cozinha/serviço/banheiro, primeiras (VA)", fonte: F_NBR },
    qtdTugMolhada: { valor: 3, nivel: "N", item: "NBR 5410 9.5.2.2.2 a)", rotulo: "… quantas tomadas a 600 VA (as demais a 100 VA)", fonte: F_NBR + " (a norma admite 600 VA só até 2 pontos quando o conjunto passa de 6 tomadas; o motor fica no conservador, 3 × 600 VA)" },
    vaTugDemais: { valor: 100, nivel: "N", item: "NBR 5410 9.5.2.2.2 b)", rotulo: "Potência por tomada nos demais cômodos e excedentes (VA)", fonte: F_NBR },
    alturaBaixa: { valor: 0.30, nivel: "A", rotulo: "Tomada baixa (m do piso ao centro)", fonte: F_SINAPI + " 91998-92001 \"TOMADA BAIXA … (0,30 M DO PISO)\"" },
    alturaMedia: { valor: 1.30, nivel: "A", rotulo: "Tomada média (m)", fonte: F_SINAPI + " 91994-91997 \"TOMADA MÉDIA … (1,30 M DO PISO)\"" },
    alturaAlta: { valor: 2.00, nivel: "A", rotulo: "Tomada alta (m)", fonte: F_SINAPI + " 91990-91993 \"TOMADA ALTA … (2,00 M DO PISO)\"" },
    alturaInterruptor: { valor: 1.00, nivel: "A", item: "NBR 9050:2020 4.6.9, Figura 26", rotulo: "Interruptor (m do piso)", fonte: "ABNT NBR 9050:2020, 4.6.9 e Figura 26 (interruptor de 0,60 a 1,00 m; adotado o topo da faixa) — a NBR 5410:2004 não fixa altura. ⚠ UMA altura para o \"Lançar pontos\" e a \"Ligação da iluminação\" (integração n23, 23/10/2026: eram 1,20 m aqui e 1,00 m lá — dois interruptores na mesma porta em alturas diferentes)" },
    sobreBancada: { valor: 0.20, nivel: "C", rotulo: "Tomada sobre bancada: acima do tampo (m)", fonte: "decisão RA da pesquisa (0,15–0,25 m; faixa 1,10–1,30 m, orçada como média)" },
    alturaChuveiro: { valor: 2.20, nivel: "C", rotulo: "Chuveiro elétrico: caixa de ligação direta (m)", fonte: "decisão RA: logo acima do ponto d'água, faixa alta da pesquisa (2,00–2,25 m); ligação direta, sem tomada (NBR 5410 9.5.2.3); no volume, só a caixa do próprio aparelho (9.1.4.2.4)" },
    afastBox: { valor: 0.60, nivel: "N", item: "NBR 5410 9.1.4.3.1 + 9.1.2.1 (Figuras 16 a 18)", rotulo: "Banheiro: tomada/interruptor fora dos volumes 0, 1 e 2 — o volume 2 vai 0,60 m além do box/banheira (m)", fonte: F_NBR + "; tomada só no volume 3, com DR ≤ 30 mA (9.1.4.3.2 c); 0,60 m da porta de cabine pré-fabricada (9.1.4.3.3)" },
    raioVolume1: { valor: 0.60, nivel: "N", item: "NBR 5410 9.1.2.1, Figura 18", rotulo: "Chuveiro sem box modelado: volume 1 = raio em volta da saída do chuveiro (m)", fonte: F_NBR },
    saidaChuveiro: { valor: 0.30, nivel: "C", rotulo: "Saída do chuveiro: afastamento da parede (m)", fonte: "critério RA (o crivo usual fica a 0,30 m da parede)" },
    intVizinha: { valor: 0.60, nivel: "C", rotulo: "Interruptor na parede ao lado da porta (cômodo estreito): até esta distância do batente (m)", fonte: "critério RA (revisão 21/10/2026: lavabo, closet, depósito e corredor de 1 m com a porta no meio da parede curta não têm parede do lado da maçaneta)" },
    distBatente: { valor: 0.10, nivel: "X", rotulo: "Interruptor: do batente (vão) à borda da placa (m)", fonte: F_ENG360 + " (10–15 cm do batente, do lado da maçaneta)" },
    folgaVao: { valor: 0.10, nivel: "C", rotulo: "Ponto: folga mínima do vão de porta/janela (m)", fonte: "decisão RA da pesquisa" },
    folgaCanto: { valor: 0.10, nivel: "C", rotulo: "Ponto: folga mínima do canto (m)", fonte: "critério RA" },
    atrasPorta: { valor: 0.40, nivel: "C", rotulo: "Faixa atrás da folha aberta, do lado da dobradiça (m)", fonte: "decisão RA da pesquisa (nenhuma tomada atrás da folha aberta)" },
    distTue: { valor: 1.50, nivel: "N", item: "NBR 5410 4.2.1.2.3 d)", rotulo: "Tomada de uso específico: no máximo do ponto do aparelho (m)", fonte: F_NBR + " (a pesquisa trazia de memória, sem item)" },
    correnteExclusivo: { valor: 10, nivel: "N", item: "NBR 5410 9.5.3.1", rotulo: "Aparelho acima desta corrente nominal: circuito independente (A)", fonte: F_NBR + " (a pesquisa citava a 4.2.5)" },
    afastAgua: { valor: 0.60, nivel: "C", rotulo: "Tomada sobre a pia: longe do ponto d'água (m)", fonte: "decisão RA da pesquisa" },
    entrePontos: { valor: 0.30, nivel: "C", rotulo: "Distância mínima entre dois pontos na mesma parede (m)", fonte: "critério RA" },
    vaoTugMax: { valor: 5, nivel: "C", rotulo: "Trecho de perímetro sem tomada (alerta acima de, m)", fonte: "decisão RA da pesquisa (\"tão uniformemente quanto possível\", NBR 5410 9.5.2.2.1 d; o número 5 m é decisão RA)" },
    correnteT10: { valor: 10, nivel: "X", rotulo: "Aparelho até esta corrente: tomada 10 A (A)", fonte: "decisão RA da pesquisa (NBR 14136 não lida)" },
    correnteT20: { valor: 20, nivel: "X", rotulo: "Até esta corrente: tomada 20 A; acima, ligação direta (A)", fonte: "decisão RA da pesquisa (NBR 14136 não lida)" }
  };
  function criterios(sobre) {
    var out = copia(CRITERIOS);
    Object.keys(sobre || {}).forEach(function (k) {
      var v = Number(sobre[k]);
      if (!out[k] || !isFinite(v)) return;
      if (Math.abs(v - out[k].valor) > 1e-9) { out[k].valor = v; out[k].nivelOriginal = out[k].nivel; out[k].nivel = "C"; out[k].alterado = true; out[k].fonte = "alterado pelo usuário (era " + out[k].fonte + ")"; }
    });
    return out;
  }
  function citar(c) { return (c.item ? c.item + " — " : "") + rotuloNivel(c.nivel); }

  /* ------------------------------------------------------------------ CLASSIFICAÇÃO (o tipo do js/esqregras.js → o grupo) */
  var GRUPO = { cozinha: "cozinha_servico", area_servico: "cozinha_servico", area_gourmet: "cozinha_servico", banheiro: "banheiro", lavabo: "banheiro",
    sala_estar: "sala_dormitorio", sala_jantar: "sala_dormitorio", dormitorio: "sala_dormitorio", suite: "sala_dormitorio",
    varanda: "varanda", garagem: "demais", circulacao: "demais", escada: "demais", despensa: "demais", escritorio: "demais", generico: "demais" };
  var ROT_GRUPO = { cozinha_servico: "cozinha / copa / serviço", banheiro: "banheiro", sala_dormitorio: "sala / dormitório", varanda: "varanda", externa: "área externa", demais: "demais cômodos" };
  function classificar(nome) {
    var R = ER(), c = R ? R.classificar(nome) : { id: "generico", rotulo: "Ambiente", casou: false, termo: "" }, t = R ? R.normalizar(nome) : String(nome || "").toLowerCase();
    var g = GRUPO[c.id] || "demais";
    /* a 9.5.2.2.1 b) põe a COPA com a cozinha (o classificador das esquadrias a põe com o jantar) */
    if (/(^| )copa( |$)/.test(t)) g = "cozinha_servico";
    var ext = /(^| )(quintal|jardim|piscina|calcada|area externa)( |$)/.exec(t);
    if (ext) g = "externa";
    /* revisão 21/10/2026: "Área da piscina" casava como externa mas saía "nome sem tipo — usei a regra dos demais cômodos" */
    return { id: c.id, rotulo: c.rotulo, grupo: g, grupoRotulo: ROT_GRUPO[g], casou: !!c.casou || !!ext, termo: c.termo || (ext ? ext[2] : "") };
  }

  /* ------------------------------------------------------------------ AS CONTAS */
  function vaIluminacao(area, C) {
    C = C || CRITERIOS; var A = num(area, 0);
    if (A <= C.luzAreaBase.valor + 1e-9) return C.luzVaBase.valor;
    return C.luzVaBase.valor + C.luzVaPasso.valor * Math.floor((A - C.luzAreaBase.valor) / C.luzAreaPasso.valor + 1e-9);
  }
  /* número de luminárias (critério RA; o mínimo da norma é 1) */
  function nLuminarias(area, alongado, comprimento, C) {
    C = C || CRITERIOS; var A = num(area, 0), n;
    if (alongado) n = Math.ceil(num(comprimento, 0) / C.luzCorredorPasso.valor - 1e-9);
    else n = A <= C.luzAreaUmPonto.valor + 1e-9 ? 1 : Math.ceil(A / C.luzAreaPorPonto.valor - 1e-9);
    return Math.max(C.luzMinimo.valor, n);
  }
  /* número MÍNIMO de tomadas de uso geral (NBR 5410 9.5.2.2.1) */
  function nTug(grupo, area, perimetro, C) {
    C = C || CRITERIOS; var A = num(area, 0), P = num(perimetro, 0);
    if (grupo === "cozinha_servico") return Math.max(1, Math.ceil(P / C.tugPerimCozinha.valor - 1e-9));
    if (grupo === "banheiro") return C.tugBanheiro.valor;
    if (grupo === "varanda") return C.tugVaranda.valor;
    if (grupo === "sala_dormitorio") return Math.max(1, Math.ceil(P / C.tugPerimSalaDorm.valor - 1e-9));
    if (grupo === "externa") return 0;
    return A <= C.tugDemaisArea.valor + 1e-9 ? 1 : Math.max(1, Math.ceil(P / C.tugPerimDemais.valor - 1e-9));
  }
  function regraTug(grupo, C) {
    C = C || CRITERIOS;
    if (grupo === "cozinha_servico") return C.tugPerimCozinha;
    if (grupo === "banheiro") return C.tugBanheiro;
    if (grupo === "varanda") return C.tugVaranda;
    if (grupo === "sala_dormitorio") return C.tugPerimSalaDorm;
    return C.tugDemaisArea;
  }
  function vaTug(grupo, n, C) {
    C = C || CRITERIOS;
    if (grupo === "cozinha_servico" || grupo === "banheiro") { var k = Math.min(n, C.qtdTugMolhada.valor); return k * C.vaTugMolhada.valor + (n - k) * C.vaTugDemais.valor; }
    return n * C.vaTugDemais.valor;
  }

  /* ------------------------------------------------------------------ APARELHOS → TOMADA DE USO ESPECÍFICO
     Potências: CEMIG ND-5.1, Tabelas 8A/8B/9 (as típicas quando a placa não é conhecida) — a placa do aparelho comprado manda.
     altura: baixa | media | alta | chuveiro | forno (a chave do critério); ligacao: "tomada" ou "direta" pela corrente. */
  var AR_CONDICIONADO = { colunas: ["btu_h", "kcal_h", "potencia_W", "potencia_VA"], dados: [[8500, 2125, 1300, 1550], [10000, 2500, 1400, 1650], [12000, 3000, 1600, 1900], [14000, 3500, 1900, 2100], [18000, 4500, 2600, 2860], [21000, 5250, 2800, 3080], [30000, 7500, 3600, 4000]], fonte: F_CEMIG + ", Tabela 9" };
  function potenciaAr(btu) {
    var b = num(btu, 0); if (!(b > 0)) return null;
    var L = AR_CONDICIONADO.dados;
    for (var i = 0; i < L.length; i++) if (L[i][0] >= b - 1e-6) return { W: L[i][2], VA: L[i][3], btuTabela: L[i][0] };
    return null;   /* acima da tabela: a placa */
  }
  function sim(v) { return v === true || v === "true" || v === 1 || v === "1" || v === "sim"; }
  var APARELHOS = [
    { id: "chuveiro_220", rotulo: "Chuveiro elétrico", fam: /^hid-chuveiro$/, quando: function (v, i) { return sim(v.Eletrico) || sim(i.Eletrico); }, potW: 6000, tensao: 220, altura: "chuveiro", cemig: "Tabela 8A", forcaDireta: true, noVolume: true },
    { id: "forno_embutir", rotulo: "Forno elétrico de embutir", fam: /^ra-coz-torre-quente$/, potW: 4500, tensao: 220, altura: "baixa", cemig: "Tabela 8A", lateral: -0.15 },
    { id: "micro_ondas", rotulo: "Micro-ondas", fam: /^ra-coz-torre-quente$/, quando: function (v, i) { return !(v.Com_micro === false || i.Com_micro === false); }, potW: 750, tensao: 127, altura: "alta", cemig: "Tabela 8A", lateral: 0.15, sufixo: "mo" },
    { id: "fogao_4_bocas", rotulo: "Cooktop elétrico (4 bocas)", fam: /^ra-coz-inferior$/, quando: function (v) { return sim(v.Com_cooktop) && num(v.Comprimento, 0) >= 1.8; }, potW: 4 * 1500, tensao: 220, altura: "baixa", cemig: "Tabela 8A (1.500 W por queimador × 4)", confirmar: "cooktop: confirme se é elétrico (indução) e a potência da placa — se for a gás, apague este ponto", posLocal: "cooktop" },
    { id: "fogao_4_bocas", rotulo: "Cooktop elétrico da ilha", fam: /^ra-coz-ilha$/, quando: function (v) { return sim(v.Com_cooktop) && num(v.Comprimento, 0) >= 1.8; }, potW: 4 * 1500, tensao: 220, altura: "baixa", cemig: "Tabela 8A (1.500 W por queimador × 4)", semParede: true },
    { id: "lava_roupas", rotulo: "Máquina de lavar roupas", fam: /^ra-coz-lavadora$/, potW: 1500, tensao: 127, altura: "baixa", cemig: "Tabela 8B" },
    { id: "geladeira_freezer", rotulo: "Geladeira (ponto dedicado — decisão RA)", fam: /^ra-coz-geladeira$/, potW: 300, tensao: 127, altura: "baixa", cemig: "Tabela 8A (duplex 300 W)" },
    { id: "ar_condicionado", rotulo: "Ar-condicionado", fam: /^ra-clim-(evap-[a-z]+|janela)$/, potW: "btu", tensao: 220, altura: "alta", cemig: "Tabela 9" },
    { id: "hidromassagem", rotulo: "Banheira de hidromassagem (motor)", fam: /^ra-banho-hidromassagem$/, potW: null, tensao: 220, altura: "baixa", forcaDireta: true, noVolume: true },
    { id: "bomba_dagua", rotulo: "Bomba d'água", fam: /^hid-bomba$/, potW: null, tensao: 220, altura: "baixa", forcaDireta: true }
  ];
  /* os aparelhos de uma instância de família (lista: a torre quente dá o forno e o micro-ondas) */
  function aparelhosDe(famId, valores, inst) {
    var v = valores || {}, i = inst || {}, out = [];
    APARELHOS.forEach(function (a) { if (a.fam.test(String(famId || "")) && (!a.quando || a.quando(v, i))) out.push(a); });
    return out;
  }
  /* o chuveiro que não diz se é elétrico (a família antiga ra-chuveiro) */
  function chuveiroIndefinido(famId) { return /^ra-chuveiro$/.test(String(famId || "")); }
  function tomadaPara(potW, tensaoV, C, forcaDireta) {
    C = C || CRITERIOS;
    if (forcaDireta) return { ligacao: "direta", tipoId: null, corrente: potW && tensaoV ? potW / tensaoV : null };
    if (!(potW > 0) || !(tensaoV > 0)) return { ligacao: "tomada", tipoId: "t20", corrente: null };
    var I = potW / tensaoV;
    if (I <= C.correnteT10.valor + 1e-9) return { ligacao: "tomada", tipoId: "t10", corrente: I };
    if (I <= C.correnteT20.valor + 1e-9) return { ligacao: "tomada", tipoId: "t20", corrente: I };
    return { ligacao: "direta", tipoId: null, corrente: I };
  }
  /* o ponto de um aparelho: potência (a típica da CEMIG, ou pela capacidade do ar), tomada × ligação direta, e se o circuito
     é INDEPENDENTE pela regra (> 10 A, NBR 5410 9.5.3.1) ou só um ponto dedicado (decisão RA) */
  function tueDe(def, btu, C) {
    C = C || CRITERIOS;
    var potW = def.potW === "btu" ? null : def.potW, pAr = def.potW === "btu" ? potenciaAr(btu) : null;
    if (pAr) potW = pAr.W;
    var tom = tomadaPara(potW, def.tensao, C, def.forcaDireta);
    var exclusivo = !potW || tom.ligacao === "direta" || (tom.corrente != null && tom.corrente > C.correnteExclusivo.valor + 1e-9);
    return { potW: potW, pAr: pAr, tom: tom, exclusivo: exclusivo };
  }
  function alturaDe(chave, C) {
    C = C || CRITERIOS;
    return chave === "media" ? C.alturaMedia.valor : chave === "alta" ? C.alturaAlta.valor : chave === "chuveiro" ? C.alturaChuveiro.valor : C.alturaBaixa.valor;
  }

  /* ------------------------------------------------------------------ OBSTÁCULOS: móvel FIXO (não se põe tomada atrás) e bancada */
  var FIXO = /guarda-roupa|closet|^ra-coz-|armario|estante|^ra-banho-bancada|^ra-bancada|^hid-pia|^hid-tanque|^hid-lavatorio|^hid-cuba|^ra-lavatorio|^ra-banho-hidromassagem|^ra-lazer-churrasqueira|^hid-bacia|^ra-bacia/;
  var BANCADA = /^ra-coz-inferior$|^ra-bancada$|^ra-banho-bancada$|^hid-lavatorio|^hid-cuba-apoio$|^ra-lavatorio/;
  var LAVATORIO = /^hid-lavatorio|^hid-cuba-apoio$|^ra-lavatorio|^ra-banho-bancada$/;
  var PIA = /^hid-pia-cozinha$|^ra-coz-inferior$|^ra-bancada$/;
  var BOX = /^ra-banho-box$|^ra-banho-hidromassagem$/, CHUVEIRO = /^hid-chuveiro$|^ra-chuveiro$/;

  var EleRegras = {
    NIVEIS: NIVEIS, CRITERIOS: CRITERIOS, GRUPO: GRUPO, ROT_GRUPO: ROT_GRUPO, APARELHOS: APARELHOS, AR_CONDICIONADO: AR_CONDICIONADO,
    FIXO: FIXO, BANCADA: BANCADA, LAVATORIO: LAVATORIO, PIA: PIA, BOX: BOX, CHUVEIRO: CHUVEIRO,
    NORMA: NORMA, FONTES: { NBR: F_NBR, PROCOBRE: F_PROCOBRE, TCC: F_TCC, SINAPI: F_SINAPI, CEMIG: F_CEMIG, ENG360: F_ENG360 },
    rotuloNivel: rotuloNivel, citar: citar, criterios: criterios, classificar: classificar,
    vaIluminacao: vaIluminacao, nLuminarias: nLuminarias, nTug: nTug, regraTug: regraTug, vaTug: vaTug,
    aparelhosDe: aparelhosDe, chuveiroIndefinido: chuveiroIndefinido, tomadaPara: tomadaPara, tueDe: tueDe, alturaDe: alturaDe, potenciaAr: potenciaAr, arr: arr
  };
  global.EleRegras = EleRegras;
  if (typeof module !== "undefined" && module.exports) module.exports = EleRegras;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
