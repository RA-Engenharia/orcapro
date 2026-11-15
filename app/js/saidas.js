/* =====================================================================
 * saidas.js — O QUE SAI NO DOCUMENTO (motor puro; a tela é js/saidasui.js)
 *
 * POR QUE ISTO EXISTE (14/11/2026).
 * Cada gerador do sistema decide sozinho o que imprime: o pacote do licitante
 * (js/licitacaodocs.js) concatena as seções em ordem fixa, o orçamento de
 * referência (js/orcref.js e orcrefxls.js) faz o mesmo, e o Excel do orçamento
 * (js/excel.js) tem três abas fixas e o resto condicionado a dado. Uma obra
 * residencial não quer Encargos nem Curva ABC; uma prefeitura quer; um
 * condomínio quer rateio por unidade. Não havia onde escolher.
 *
 * Aqui mora a ESCOLHA, não a geração:
 *   - CATÁLOGO de seções com id ESTÁVEL (o id é gravado nos modelos dos clientes:
 *     renomear o rótulo pode, mudar o id não — modelo salvo perderia a seção);
 *   - PERFIS por tipo de orçamento (prefeitura, edital, residencial, comercial,
 *     industrial, condomínio, reforma), cada um com as seções ligadas e os
 *     parâmetros de texto que aquele tipo de documento precisa;
 *   - MEUS MODELOS: a escolha da empresa, salva em `prefs` (Store.lerPrefs/salvarPrefs).
 *
 * Os geradores aceitam `opcoes.secoes = { id: false }` e pulam o que estiver
 * desligado. SEM a opção a saída é a de sempre, byte a byte
 * (tools/test-saidas.js compara com a impressão digital do commit anterior).
 *
 * ⚠ DOIS CONJUNTOS DE ID, UM CATÁLOGO. Nem toda seção existe em todo gerador:
 *   `aplica` diz onde cada uma vale ("pacote" = licitante, "ref" = orçamento de
 *   referência PDF/XLSX, "excel" = Excel do orçamento, "proposta" = proposta
 *   comercial). A tela mostra a etiqueta; ligar uma seção que o gerador do
 *   momento não tem é inofensivo. O que é só da proposta comercial fica salvo
 *   no modelo para a proposta usar — essa fiação ainda não existe.
 * ⚠ AS TRÊS ABAS FIXAS DO EXCEL (Resumo, Sintética, Analítica) e a "Justificativa
 *   de Preços" não são desligáveis: as fórmulas das outras abas apontam para
 *   elas, e a justificativa é o quadro que o analista do órgão lê.
 * ⚠ OS TEXTOS-PADRÃO SÃO EDITÁVEIS E NÃO TÊM DADO DE CLIENTE. Dado do cliente
 *   (nome, CNPJ, valor, contato) entra na hora de gerar, vindo do orçamento. O
 *   `validar` recusa texto com CNPJ, e-mail ou telefone, para o modelo salvo
 *   não carregar a empresa de um orçamento para o outro.
 * ES5 de propósito (roda no WebView de instaladores antigos).
 * ===================================================================== */
(function (global) {
  "use strict";

  var CH_VISTOS = "orcapro:saidas:semeados:v1:";
  var CH_PREVIA = "orcapro:tela:motor:v1";

  function s(v) { return String(v == null ? "" : v); }
  function copia(o) { return JSON.parse(JSON.stringify(o)); }
  function tem(a, x) { return a.indexOf(x) >= 0; }

  /* ---------------------------------------------------------------------
   * CATÁLOGO. A ordem daqui é a ordem em que a tela mostra, agrupada.
   * --------------------------------------------------------------------- */
  var SECOES = [
    { id: "capa", rotulo: "Capa", grupo: "Apresentação", aplica: ["proposta"], desc: "Folha de rosto do documento." },
    { id: "carta", rotulo: "Carta-proposta", grupo: "Apresentação", aplica: ["pacote", "excel"], desc: "Carta à comissão, com valor, prazo, validade e assinaturas." },
    { id: "resumo", rotulo: "Resumo do orçamento", grupo: "Apresentação", aplica: ["proposta", "excel"], desc: "Valor total e dados da obra em uma página." },
    { id: "resumoEtapas", rotulo: "Resumo por etapa", grupo: "Apresentação", aplica: ["pacote", "proposta", "excel"], desc: "Uma linha por etapa, com o peso de cada uma no total." },
    { id: "sintetico", rotulo: "Planilha sintética", grupo: "Planilha", aplica: ["pacote", "ref", "excel"], desc: "Itens, unidades, quantidades e preços." },
    { id: "analitico", rotulo: "Planilha analítica (composições)", grupo: "Planilha", aplica: ["pacote", "ref", "excel"], desc: "Insumos e coeficientes de cada composição." },
    { id: "custosItem", rotulo: "Custo por item (MO, material e equipamento)", grupo: "Planilha", aplica: ["pacote"], desc: "Quebra do custo direto de cada item por categoria." },
    { id: "composicoesProprias", rotulo: "Composições próprias", grupo: "Planilha", aplica: ["pacote"], desc: "Composições montadas fora das bases oficiais." },
    { id: "auxiliares", rotulo: "Composições auxiliares", grupo: "Planilha", aplica: ["pacote"], desc: "Composições que entram dentro de outras." },
    { id: "quantitativos", rotulo: "Quantitativos e insumos", grupo: "Planilha", aplica: ["pacote", "excel"], desc: "Lista de insumos com quantidade total." },
    { id: "memoriaCalculo", rotulo: "Memória de cálculo", grupo: "Planilha", aplica: ["ref", "excel"], desc: "Como cada quantidade foi medida." },
    { id: "curvaAbc", rotulo: "Curva ABC", grupo: "Análises", aplica: ["pacote", "ref", "excel"], desc: "Serviços e insumos ordenados pelo peso no custo." },
    { id: "cronograma", rotulo: "Cronograma físico-financeiro", grupo: "Análises", aplica: ["pacote", "ref", "excel", "proposta"], desc: "Desembolso e avanço mês a mês." },
    { id: "bdi", rotulo: "BDI detalhado", grupo: "Preço", aplica: ["pacote", "ref"], desc: "Composição do BDI parcela a parcela." },
    { id: "bdiOculto", rotulo: "BDI embutido (sem mostrar a taxa)", grupo: "Preço", aplica: ["proposta"], desc: "O preço sai fechado, sem a taxa de BDI à vista. Não combina com o BDI detalhado." },
    { id: "encargos", rotulo: "Encargos sociais", grupo: "Preço", aplica: ["pacote", "ref"], desc: "Tabela de encargos (desonerado e não desonerado)." },
    { id: "cotacoes", rotulo: "Mapa de cotações", grupo: "Preço", aplica: ["ref"], desc: "Pesquisa de preço dos itens sem base oficial." },
    { id: "custoM2", rotulo: "Custo por m²", grupo: "Análises", aplica: ["excel"], desc: "Custo total, por etapa e por m² construído (a área vem do orçamento)." },
    { id: "equipamentos", rotulo: "Equipamentos com horas", grupo: "Planilha", aplica: ["excel"], desc: "Equipamentos da obra com horas de uso e custo." },
    { id: "criterioMedicao", rotulo: "Critério de medição por item", grupo: "Planilha", aplica: ["excel"], desc: "Como cada item é medido e pago (unidade e critério)." },
    { id: "seguranca", rotulo: "Segurança do trabalho (NR-18/35/10)", grupo: "Conformidade", aplica: ["excel"], desc: "Texto-padrão de segurança, editável no modelo." },
    { id: "rateio", rotulo: "Rateio por unidade", grupo: "Análises", aplica: ["excel"], desc: "Valor por unidade pela fração ideal ou em partes iguais." },
    { id: "comparativo", rotulo: "Comparativo de opções", grupo: "Análises", aplica: ["excel"], desc: "Etapas opcionais lado a lado: com e sem cada uma." },
    { id: "desembolso", rotulo: "Desembolso mensal", grupo: "Análises", aplica: ["excel"], desc: "Parcela de cada mês, para a assembleia e o caixa." },
    { id: "imprevistos", rotulo: "Verba de imprevistos", grupo: "Preço", aplica: ["excel"], desc: "Reserva destacada para o que só aparece com a obra aberta." },
    { id: "opcionais", rotulo: "Opcionais com subtotal", grupo: "Preço", aplica: ["excel"], desc: "Itens opcionais separados do preço-base, cada um com seu subtotal." },
    { id: "fotosReferencia", rotulo: "Fotos de referência", grupo: "Proposta", aplica: ["proposta"], desc: "Imagens de obras e ambientes parecidos." },
    { id: "incluso", rotulo: "Incluso e excluso", grupo: "Proposta", aplica: ["proposta", "excel"], desc: "O que o preço cobre e o que fica de fora." },
    { id: "premissas", rotulo: "Premissas", grupo: "Proposta", aplica: ["proposta", "excel"], desc: "As condições em que o preço vale." },
    { id: "condicoesPagamento", rotulo: "Condições de pagamento", grupo: "Proposta", aplica: ["proposta", "excel"], desc: "Forma, parcelas e medição." },
    { id: "garantias", rotulo: "Garantias", grupo: "Proposta", aplica: ["proposta"], desc: "Prazos de garantia do serviço e dos materiais." },
    { id: "conferencia", rotulo: "Conferência da proposta (preço × teto)", grupo: "Conformidade", aplica: ["excel"], desc: "Preço global contra o teto do edital, itens obrigatórios e regra de arredondamento." },
    { id: "declaracoes", rotulo: "Declarações", grupo: "Conformidade", aplica: ["ref"], desc: "Declarações do responsável pelo orçamento." },
    { id: "pendencias", rotulo: "Pendências e pontos a conferir", grupo: "Conformidade", aplica: ["ref"], desc: "O que ainda falta preencher ou conferir." }
  ];
  var IDS = SECOES.map(function (x) { return x.id; });

  /* ---------------------------------------------------------------------
   * PERFIS. `secoes` = o que fica LIGADO; o resto sai desligado.
   * `parametros` = textos-padrão editáveis (sem dado de cliente — ver o ⚠ do topo).
   * Chaves entre chaves ({...}) são preenchidas na hora de gerar, a partir do orçamento.
   * --------------------------------------------------------------------- */
  function P(id, rotulo, padrao) { return { id: id, rotulo: rotulo, padrao: padrao }; }

  var PERFIS = [
    {
      id: "prefeitura", nome: "Prefeitura / órgão público", formato: { pdf: true, xlsx: true }, cronoEstilo: "oficial",
      desc: "Orçamento de referência no padrão do órgão: planilhas completas, BDI e encargos detalhados, cronograma físico-financeiro e declarações. Sem apresentação comercial.",
      secoes: ["resumoEtapas", "sintetico", "analitico", "composicoesProprias", "auxiliares", "quantitativos", "memoriaCalculo", "curvaAbc", "cronograma", "bdi", "encargos", "cotacoes", "declaracoes", "pendencias"],
      parametros: [
        P("dataBase", "Data-base dos preços", "Preços referidos à data-base {data-base}, conforme a base de referência indicada em cada item."),
        P("encargos", "Regime de encargos sociais", "Encargos sociais apresentados nos regimes desonerado e não desonerado; o regime adotado nesta planilha é o {regime}."),
        P("cronograma", "Cronograma físico-financeiro", "O cronograma físico-financeiro distribui o valor de cada etapa pelo prazo de execução de {prazo}."),
        P("declaracoes", "Declaração do responsável", "Declaro que os quantitativos e preços desta planilha foram elaborados com base nos projetos e nas bases de referência indicadas, e que o BDI adotado está discriminado em planilha própria.")
      ]
    },
    {
      id: "edital", nome: "Proposta para edital (licitação)", formato: { pdf: true, xlsx: true }, cronoEstilo: "oficial",
      desc: "Pacote do licitante: carta-proposta com validade, prazo e representante, planilhas sintética e analítica, curva ABC e cronograma.",
      secoes: ["carta", "resumoEtapas", "sintetico", "analitico", "composicoesProprias", "auxiliares", "curvaAbc", "cronograma", "bdi", "encargos", "conferencia"],
      parametros: [
        P("validade", "Validade da proposta", "A presente proposta tem validade de {validade} dias, contados da data de abertura da sessão."),
        P("prazo", "Prazo de execução", "Os serviços serão executados no prazo de {prazo}, contado da emissão da ordem de serviço."),
        P("representante", "Representante da empresa", "A proposta é assinada pelo representante legal da empresa, {representante}, com poderes para firmá-la."),
        P("arredondamento", "Regra de arredondamento", "Os preços unitários e totais seguem o critério do edital: {criterio-arredondamento}, aplicado igualmente a todos os itens.")
      ]
    },
    {
      id: "residencial", nome: "Obra residencial", formato: { pdf: true, xlsx: true }, cronoEstilo: "simples",
      desc: "Proposta para morador ou construtor de casa: capa, escopo incluso e excluso, resumo por etapa, pagamento por etapa e garantias. O BDI vai embutido no preço.",
      secoes: ["capa", "resumo", "resumoEtapas", "sintetico", "cronograma", "bdiOculto", "fotosReferencia", "incluso", "premissas", "condicoesPagamento", "garantias"],
      parametros: [
        P("pagamento", "Pagamento por etapa", "O pagamento é feito por etapa concluída e medida, conforme o cronograma, em até {dias-pagamento} dias após cada medição."),
        P("garantia", "Garantias", "Garantia de {garantia-solidez} para solidez e segurança da obra e de {garantia-acabamentos} para acabamentos e instalações, contados da entrega, sem prejuízo dos prazos previstos em lei."),
        P("excluso", "O que não está incluso", "Não estão inclusos projetos, taxas e licenças de órgãos públicos, ligações definitivas de água, energia e esgoto, e mobiliário, salvo se descritos no escopo.")
      ]
    },
    {
      id: "comercial", nome: "Obra comercial (loja, escritório, restaurante)", formato: { pdf: true, xlsx: true }, cronoEstilo: "gantt",
      desc: "Como a residencial, com o horário de execução e o cuidado com o funcionamento do estabelecimento durante a obra.",
      secoes: ["capa", "resumo", "resumoEtapas", "sintetico", "custoM2", "cronograma", "bdiOculto", "fotosReferencia", "incluso", "premissas", "condicoesPagamento", "garantias"],
      parametros: [
        P("horario", "Horário de execução", "Os serviços serão executados em {horario}, de forma a reduzir o impacto sobre o funcionamento do estabelecimento."),
        P("interferencia", "Interferência no funcionamento", "Serviços que gerem ruído, poeira ou interrupção de energia e água serão previamente combinados com o responsável pelo estabelecimento, com antecedência mínima de {antecedencia} dias."),
        P("pagamento", "Pagamento por etapa", "O pagamento é feito por etapa concluída e medida, em até {dias-pagamento} dias após cada medição."),
        P("garantia", "Garantias", "Garantia de {garantia-solidez} para solidez e segurança da obra e de {garantia-acabamentos} para acabamentos e instalações, contados da entrega.")
      ]
    },
    {
      id: "industrial", nome: "Obra industrial", formato: { pdf: true, xlsx: true }, cronoEstilo: "gantt",
      desc: "Proposta para planta industrial: normas de segurança (NR-18, NR-35, NR-10), ART, paradas programadas e medição por boletim.",
      secoes: ["capa", "resumo", "resumoEtapas", "sintetico", "criterioMedicao", "equipamentos", "seguranca", "cronograma", "bdiOculto", "incluso", "premissas", "condicoesPagamento", "garantias"],
      parametros: [
        P("seguranca", "Segurança do trabalho", "Os serviços seguem a NR-18 (condições e meio ambiente de trabalho na indústria da construção), a NR-35 (trabalho em altura) e a NR-10 (segurança em instalações e serviços em eletricidade), com treinamentos e documentos exigidos em dia antes do início."),
        P("art", "ART / RRT", "A responsabilidade técnica pelos serviços é registrada em ART ou RRT, emitida antes do início da obra."),
        P("paradas", "Paradas programadas", "Serviços que dependem de parada da produção só começam na janela de parada programada informada pelo contratante, com plano de trabalho aprovado antes."),
        P("medicao", "Medição por boletim", "A medição é mensal, por boletim de medição conferido pela fiscalização do contratante; a fatura é emitida após a aprovação do boletim.")
      ]
    },
    {
      id: "condominio", nome: "Condomínio", formato: { pdf: true, xlsx: true }, cronoEstilo: "simples",
      desc: "Proposta para síndico e assembleia: escopo, aprovação em assembleia, rateio por unidade e aviso aos moradores.",
      secoes: ["capa", "resumo", "resumoEtapas", "sintetico", "rateio", "comparativo", "desembolso", "cronograma", "bdiOculto", "incluso", "premissas", "condicoesPagamento", "garantias"],
      parametros: [
        P("assembleia", "Aprovação em assembleia", "A contratação depende de aprovação em assembleia, na forma da convenção do condomínio. Esta proposta tem validade de {validade} dias para que a assembleia seja realizada."),
        P("rateio", "Rateio por unidade", "O valor total pode ser apresentado dividido por unidade, conforme a fração ideal ou o critério definido pela assembleia: {criterio-rateio}."),
        P("aviso", "Aviso aos moradores", "Antes de cada etapa que afete as áreas comuns, a contratada fornece o texto do aviso aos moradores, com a data, o horário e o que muda no uso do prédio."),
        P("pagamento", "Pagamento por etapa", "O pagamento é feito por etapa concluída e medida, em até {dias-pagamento} dias após cada medição.")
      ]
    },
    {
      id: "reforma", nome: "Reforma", formato: { pdf: true, xlsx: true }, cronoEstilo: "simples",
      desc: "Proposta de reforma: visita técnica antes do preço fechado e reserva para imprevistos, que só aparecem quando a obra abre.",
      secoes: ["capa", "resumo", "resumoEtapas", "sintetico", "imprevistos", "opcionais", "cronograma", "bdiOculto", "fotosReferencia", "incluso", "premissas", "condicoesPagamento", "garantias"],
      parametros: [
        P("visita", "Visita técnica", "O preço foi elaborado com base na visita técnica feita em {data-visita}. Condições que a visita não permitiu ver podem alterar o escopo e o valor."),
        P("imprevistos", "Imprevistos", "Imprevistos que só aparecem com a demolição ou a abertura de paredes e forros (instalações ocultas, estrutura, umidade) são informados ao contratante antes de qualquer serviço adicional, com orçamento à parte."),
        P("pagamento", "Pagamento por etapa", "O pagamento é feito por etapa concluída e medida, em até {dias-pagamento} dias após cada medição."),
        P("garantia", "Garantias", "Garantia de {garantia-solidez} para solidez e segurança dos serviços estruturais e de {garantia-acabamentos} para acabamentos e instalações, contados da entrega.")
      ]
    }
  ];

  /* ---------------------------------------------------------------------
   * CONSULTA
   * --------------------------------------------------------------------- */
  function secoes() { return copia(SECOES); }
  function perfis() { return PERFIS.map(function (p) { return { id: p.id, nome: p.nome, desc: p.desc }; }); }
  function perfil(id) {
    for (var i = 0; i < PERFIS.length; i++) if (PERFIS[i].id === id) return copia(PERFIS[i]);
    return null;
  }

  /* escolha(perfilId, ajustes) → { perfil, secoes:{id:bool para TODOS os ids}, formato:{pdf,xlsx}, textos:{parametroId:texto} }
     ajustes (opcional): { secoes:{id:bool}, formato:{pdf,xlsx}, textos:{parametroId:texto} } — só o que a pessoa mudou.
     Perfil que não existe → null (quem chama decide; nada de cair num perfil "parecido"). */
  function escolha(perfilId, ajustes) {
    var p = perfil(perfilId);
    if (!p) return null;
    ajustes = ajustes || {};
    var sec = {};
    IDS.forEach(function (id) { sec[id] = tem(p.secoes, id); });
    var aj = ajustes.secoes || {};
    Object.keys(aj).forEach(function (id) { sec[id] = aj[id]; });   /* id desconhecido entra e é apontado por validar() */
    var fmt = { pdf: !!p.formato.pdf, xlsx: !!p.formato.xlsx };
    if (ajustes.formato) {
      if (ajustes.formato.pdf !== undefined) fmt.pdf = ajustes.formato.pdf;
      if (ajustes.formato.xlsx !== undefined) fmt.xlsx = ajustes.formato.xlsx;
    }
    var tx = {};
    p.parametros.forEach(function (q) { tx[q.id] = q.padrao; });
    var at = ajustes.textos || {};
    Object.keys(at).forEach(function (k) { tx[k] = at[k]; });
    var est = ajustes.estiloCronograma != null ? ajustes.estiloCronograma : p.cronoEstilo;
    return { perfil: p.id, secoes: sec, formato: fmt, textos: tx, estiloCronograma: est };
  }

  /* o que se passa aos geradores além de `secoes`: perfil, estilo do cronograma e os textos-padrão (editados ou não).
     ⚠ É daqui que a proposta lê os textos do modelo (PropTpl.aplicarSaidas) — uma fonte só. */
  function opcoesGerador(esc) {
    if (!esc) return {};
    return { secoes: secoesParaGerador(esc), perfil: esc.perfil, estiloCronograma: esc.estiloCronograma, textos: copia(esc.textos || {}), ligadas: copia(esc.secoes || {}) };
  }

  /* o que se passa aos geradores como `opcoes.secoes`: só os ids desligados, explícitos */
  function secoesParaGerador(esc) {
    var o = {};
    if (!esc || !esc.secoes) return o;
    IDS.forEach(function (id) { if (esc.secoes[id] === false) o[id] = false; });
    return o;
  }

  /* ---------------------------------------------------------------------
   * VALIDAÇÃO
   * Texto com CNPJ, e-mail ou telefone é dado de cliente (ou de empresa) viajando no modelo.
   * --------------------------------------------------------------------- */
  var RE_PROIBIDO = [
    [/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/, "CNPJ"],
    [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, "e-mail"],
    [/\(?\b\d{2}\)?[\s.-]?9?\d{4}[\s.-]\d{4}\b/, "telefone"]
  ];
  function dadoDeCliente(texto) {
    for (var i = 0; i < RE_PROIBIDO.length; i++) if (RE_PROIBIDO[i][0].test(s(texto))) return RE_PROIBIDO[i][1];
    return "";
  }

  function validar(esc) {
    var erros = [], avisos = [];
    if (!esc || typeof esc !== "object") return { ok: false, erros: ["Escolha vazia."], avisos: [] };
    var p = perfil(esc.perfil);
    if (!p) erros.push("Perfil desconhecido: " + s(esc.perfil) + ".");
    var sec = esc.secoes;
    if (!sec || typeof sec !== "object") { erros.push("Faltam as seções."); sec = {}; }
    Object.keys(sec).forEach(function (id) {
      if (!tem(IDS, id)) erros.push("Seção desconhecida: " + id + ".");
      else if (typeof sec[id] !== "boolean") erros.push("A seção " + id + " precisa ser verdadeiro ou falso.");
    });
    if (!IDS.some(function (id) { return sec[id] === true; })) erros.push("Nenhuma seção ligada: o documento sairia vazio.");
    if (sec.bdi === true && sec.bdiOculto === true) erros.push("BDI detalhado e BDI embutido não podem estar ligados juntos: um mostra a taxa, o outro a esconde.");
    if (esc.estiloCronograma != null && esc.estiloCronograma !== "" && !tem(["oficial", "simples", "gantt"], esc.estiloCronograma)) erros.push("Estilo de cronograma desconhecido: " + s(esc.estiloCronograma) + ".");
    var f = esc.formato;
    if (!f || typeof f !== "object") erros.push("Faltam os formatos.");
    else if (!f.pdf && !f.xlsx) erros.push("Escolha ao menos um formato (PDF ou Excel).");
    var tx = esc.textos || {}, ids = p ? p.parametros.map(function (q) { return q.id; }) : null;
    Object.keys(tx).forEach(function (k) {
      if (ids && !tem(ids, k)) avisos.push("Texto sem parâmetro correspondente neste perfil: " + k + ".");
      if (typeof tx[k] !== "string") { erros.push("O texto " + k + " precisa ser texto."); return; }
      var d = dadoDeCliente(tx[k]);
      if (d) erros.push("O texto \"" + k + "\" parece ter " + d + ". O modelo não leva dado de cliente: ele entra na hora de gerar, vindo do orçamento.");
    });
    if (sec.sintetico === false && sec.analitico === true) avisos.push("A analítica está ligada e a sintética desligada: o leitor fica sem a visão resumida.");
    return { ok: erros.length === 0, erros: erros, avisos: avisos };
  }

  /* ---------------------------------------------------------------------
   * MEUS MODELOS — por empresa, em prefs.saidasModelos = [{id,nome,perfil,escolha,base?}]
   * Store e empresa vêm de global.Store / global.Auth, ou de usar() (testes).
   * ⚠ Lê, troca só a chave `saidasModelos` e grava de volta: o resto de `prefs` é de outros recursos.
   * --------------------------------------------------------------------- */
  var _ctx = null;
  function usar(ctx) { _ctx = ctx || null; }
  function _store() { return (_ctx && _ctx.store) || global.Store || null; }
  function _eid() {
    if (_ctx && _ctx.empresaId !== undefined) return _ctx.empresaId;
    try { return global.Auth && global.Auth.empresaId ? global.Auth.empresaId() : "default"; } catch (e) { return "default"; }
  }
  function _ler() {
    var st = _store();
    if (!st || !st.lerPrefs) return { prefs: {}, lista: [], ok: false };
    var pr = st.lerPrefs(_eid()) || {};
    return { prefs: pr, lista: Array.isArray(pr.saidasModelos) ? pr.saidasModelos : [], ok: true };
  }
  function _gravar(c, lista) {
    var st = _store();
    if (!st || !st.salvarPrefs) return false;
    c.prefs.saidasModelos = lista;
    st.salvarPrefs(_eid(), c.prefs);
    return true;
  }
  function slug(nome) {
    return s(nome).toLowerCase().normalize ? s(nome).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") : s(nome).toLowerCase().replace(/[^a-z0-9]+/g, "-");
  }

  function meus() { return copia(_ler().lista); }
  function carregarMeu(id) {
    var l = _ler().lista;
    for (var i = 0; i < l.length; i++) if (l[i].id === id) return copia(l[i]);
    return null;
  }

  /* salvarMeu(nome, escolha[, base]) → { ok, id, erros }.
     IDEMPOTENTE: o id vem do nome (sem acento/caixa); salvar de novo com o mesmo nome substitui, não duplica. */
  function salvarMeu(nome, esc, base) {
    var nm = s(nome).replace(/\s+/g, " ").trim();
    if (!nm) return { ok: false, erros: ["Dê um nome ao modelo."] };
    if (nm.length > 60) return { ok: false, erros: ["O nome do modelo tem no máximo 60 caracteres."] };
    var v = validar(esc);
    if (!v.ok) return { ok: false, erros: v.erros };
    var c = _ler();
    if (!c.ok) return { ok: false, erros: ["Não há onde gravar o modelo neste momento."] };
    var id = "m-" + slug(nm);
    if (id === "m-") return { ok: false, erros: ["O nome precisa ter letras ou números."] };
    var item = { id: id, nome: nm, perfil: esc.perfil, escolha: copia(esc) };
    if (base) item.base = base;
    var lista = c.lista.filter(function (x) { return x.id !== id; });
    lista.push(item);
    _gravar(c, lista);
    return { ok: true, id: id, erros: [] };
  }

  /* MODELO EM USO (prefs.saidasAtivo = id de um dos meus modelos). É o que a proposta e o pacote do licitante leem para saber
     quais seções saem e quais textos valem — sem mexer no orçamento. Só vale com a prévia ?previa=motor ligada (quem lê confere). */
  function ativo() {
    var c = _ler(); if (!c.ok || !c.prefs.saidasAtivo) return null;
    var m = carregarMeu(c.prefs.saidasAtivo);
    return m ? m.escolha : null;
  }
  function ativoId() { var c = _ler(); return c.ok ? s(c.prefs.saidasAtivo) : ""; }
  function definirAtivo(id) {
    var c = _ler(); if (!c.ok) return false;
    if (id && !carregarMeu(id)) return false;
    var st = _store(); if (!st || !st.salvarPrefs) return false;
    c.prefs.saidasAtivo = id || "";
    st.salvarPrefs(_eid(), c.prefs);
    return true;
  }

  function excluirMeu(id) {
    var c = _ler();
    if (c.ok && c.prefs.saidasAtivo === id) { c.prefs.saidasAtivo = ""; }
    var lista = c.lista.filter(function (x) { return x.id !== id; });
    if (lista.length === c.lista.length) return false;
    return _gravar(c, lista);
  }

  /* semeia um modelo por tipo de obra (os 7 perfis) em "meus modelos". IDEMPOTENTE e sem tocar nos do usuário:
     só entra o perfil cujo modelo-base a empresa ainda não tem, e "uma vez semeado, nunca mais" (a marca fica no
     aparelho: quem EXCLUIU o modelo não o vê voltar no boot seguinte). Devolve quantos entraram. */
  function semearPerfis() {
    var c = _ler();
    if (!c.ok) return 0;
    var chave = CH_VISTOS + s(_eid()), vistos = {};
    try { vistos = JSON.parse(global.localStorage.getItem(chave) || "{}") || {}; } catch (e) { vistos = {}; }
    var tenho = {};
    c.lista.forEach(function (x) { if (x.base) tenho[x.base] = 1; });
    var lista = c.lista.slice(), n = 0;
    PERFIS.forEach(function (p) {
      if (tenho[p.id] || vistos[p.id]) return;
      var id = "m-modelo-" + p.id;
      if (lista.some(function (x) { return x.id === id; })) return;
      lista.push({ id: id, nome: "Modelo — " + p.nome, perfil: p.id, escolha: escolha(p.id), base: p.id });
      vistos[p.id] = 1; n++;
    });
    if (n) {
      _gravar(c, lista);
      try { global.localStorage.setItem(chave, JSON.stringify(vistos)); } catch (e2) {}
    }
    return n;
  }

  /* a prévia `?previa=motor` está ligada neste aparelho? (js/app.js grava a chave) */
  function previaLigada() {
    try { return !!(global.localStorage && global.localStorage.getItem(CH_PREVIA)); } catch (e) { return false; }
  }

  var Saidas = {
    secoes: secoes, perfis: perfis, perfil: perfil, escolha: escolha, secoesParaGerador: secoesParaGerador, opcoesGerador: opcoesGerador, validar: validar, dadoDeCliente: dadoDeCliente,
    ativo: ativo, ativoId: ativoId, definirAtivo: definirAtivo, meus: meus, carregarMeu: carregarMeu, salvarMeu: salvarMeu, excluirMeu: excluirMeu, semearPerfis: semearPerfis,
    previaLigada: previaLigada, usar: usar, IDS: IDS.slice()
  };
  global.Saidas = Saidas;
  if (typeof module !== "undefined" && module.exports) module.exports = Saidas;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
