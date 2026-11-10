/* =====================================================================
 * cplproregras.js — CPLPRO: DADOS das regras (sem lógica)
 *
 * O CPLPRO é o módulo do OrçaPRO para o ÓRGÃO PÚBLICO montar o processo de
 * licitação de obra (o inverso do CertamePRO). Este arquivo é só dado: cada
 * regra carrega a `fonte` (artigo / norma) e, quando a fonte é secundária ou a
 * leitura ainda não foi feita no texto oficial, `conferir: true`.
 * Quem usa: js/cplpro.js (motor puro). Plano: RA-Equipe\orcapro\PLANO-MODULO-PREFEITURAS.md
 *
 * REGRA QUE NÃO CEDE: nenhum campo aqui vira "valor padrão escondido". O que o
 * sistema SUGERE aparece como `sugerido` com regra e artigo; o `valor` do
 * processo só existe depois que uma pessoa aceita (senão null + pendência).
 *
 * Artigos = Lei 14.133/2021, salvo indicação. Texto de risco e de "porque" é da
 * casa (curto). ES5 puro.
 * ===================================================================== */
(function (global) {
  "use strict";

  var LEI = "Lei 14.133/2021";

  /* ---------- ACERVO: classificação de arquivo do processo ----------
   * `regex`: aplicado ao nome JÁ NORMALIZADO (minúsculo, sem acento, separadores
   * "_ - ." viram espaço) — por isso as classes [oô] etc. são só cinto-e-suspensório.
   * `prioridade` desempata quando dois tipos casam com o mesmo peso. */
  var ACERVO_TIPOS = {
    projeto_arquitetonico:   { nome: "Projeto arquitetônico", disciplina: "Arquitetura", prioridade: 3,
      regex: "\\b(arq|arquitet[oô]n\\w*|planta baixa|fachadas?|layout|implanta[cç][aã]o|projeto arq\\w*)\\b", extensoes: ["pdf", "dwg", "rvt", "ifc"] },
    projeto_estrutural:      { nome: "Projeto estrutural", disciplina: "Estrutura", prioridade: 3,
      regex: "\\b(est|estrut\\w*|formas?|arma[cç][aã]o|armadura|pilares?|vigas?|lajes?)\\b", extensoes: ["pdf", "dwg", "ifc"] },
    projeto_fundacao:        { nome: "Projeto de fundação", disciplina: "Fundação", prioridade: 4,
      regex: "\\b(fund|funda[cç]\\w*|sapatas?|estacas?|baldrames?|radier|blocos? de funda\\w*)\\b", extensoes: ["pdf", "dwg"] },
    projeto_hidrossanitario: { nome: "Projeto hidrossanitário", disciplina: "Hidrossanitário", prioridade: 3,
      regex: "\\b(hid|hidr\\w*|hidrossanit\\w*|sanit[aá]ri\\w*|hs|agua fria|[aá]gua fria|esgoto)\\b", extensoes: ["pdf", "dwg", "ifc"] },
    projeto_eletrico:        { nome: "Projeto elétrico", disciplina: "Elétrica", prioridade: 3,
      regex: "\\b(ele|el[eé]tric\\w*|spda|luminot[eé]cni\\w*|ilumina[cç][aã]o|cabeamento|telecom\\w*|cftv)\\b", extensoes: ["pdf", "dwg", "ifc"] },
    projeto_drenagem:        { nome: "Projeto de drenagem", disciplina: "Drenagem", prioridade: 4,
      regex: "\\b(dren\\w*|pluvia\\w*|galerias?|bueiros?|sarjetas?|boca de lobo)\\b", extensoes: ["pdf", "dwg"] },
    projeto_pavimentacao:    { nome: "Projeto de pavimentação", disciplina: "Pavimentação", prioridade: 4,
      regex: "\\b(pav|pavimenta\\w*|asfalt\\w*|terraplenagem|recapeamento)\\b", extensoes: ["pdf", "dwg"] },
    memorial_descritivo:     { nome: "Memorial descritivo", disciplina: "Geral", prioridade: 5,
      regex: "\\b(mem|memorial|memorial descritivo)\\b", extensoes: ["docx", "doc", "pdf", "odt"] },
    especificacao_tecnica:   { nome: "Especificação técnica", disciplina: "Geral", prioridade: 5,
      regex: "\\b(especifica[cç]\\w*|espec|caderno de encargos)\\b", extensoes: ["docx", "doc", "pdf"] },
    sondagem:                { nome: "Sondagem / geotecnia", disciplina: "Geotecnia", prioridade: 6,
      regex: "\\b(sondagem|spt|sond|geot[eé]cni\\w*|ensaio de solo)\\b", extensoes: ["pdf", "xlsx", "xls"] },
    topografia:              { nome: "Levantamento topográfico", disciplina: "Topografia", prioridade: 6,
      regex: "\\b(topo|topograf\\w*|planialtim[eé]tri\\w*|georreferenc\\w*)\\b", extensoes: ["dwg", "pdf", "dxf"] },
    orcamento_planilha:      { nome: "Orçamento / planilha", disciplina: "Orçamento", prioridade: 4,
      regex: "\\b(or[cç]amento|or[cç]ament[aá]ria|planilha|bdi|composi[cç]\\w*|cpu|sinapi|curva abc)\\b", extensoes: ["xlsx", "xls", "pdf"] },
    cronograma:              { nome: "Cronograma", disciplina: "Planejamento", prioridade: 4,
      regex: "\\b(cronograma|crono|gantt)\\b", extensoes: ["xlsx", "xls", "pdf", "mpp"] },
    art_rrt:                 { nome: "ART / RRT / TRT", disciplina: "Responsabilidade técnica", prioridade: 7,
      regex: "\\b(art|rrt|trt|anota[cç][aã]o de responsabilidade t[eé]cnica|registro de responsabilidade t[eé]cnica)\\b", extensoes: ["pdf"] },
    licenca_ambiental:       { nome: "Licença ambiental", disciplina: "Ambiental", prioridade: 6,
      regex: "\\b(licen[cç]a ambiental|licenciamento|ambiental|outorga)\\b", extensoes: ["pdf"] },
    alvara_aprovacao:        { nome: "Alvará / aprovação", disciplina: "Regularização", prioridade: 6,
      regex: "\\b(alvar[aá]|aprova[cç][aã]o|habite se|avcb|bombeiros)\\b", extensoes: ["pdf"] },
    matricula_imovel:        { nome: "Matrícula do imóvel", disciplina: "Regularização", prioridade: 6,
      regex: "\\b(matr[ií]cula|registro de im[oó]veis|escritura)\\b", extensoes: ["pdf"] },
    fotos:                   { nome: "Fotos / registro fotográfico", disciplina: "Registro", prioridade: 2,
      regex: "\\b(fotos?|fotogr[aá]fic\\w*|img|imagem)\\b", extensoes: ["jpg", "jpeg", "png", "heic"] },
    laudo:                   { nome: "Laudo / vistoria", disciplina: "Diagnóstico", prioridade: 5,
      regex: "\\b(laudo|parecer t[eé]cnico|vistoria|diagn[oó]stico|patologia)\\b", extensoes: ["pdf", "docx"] },
    outros:                  { nome: "Outros", disciplina: "Não classificado", prioridade: 0, regex: null, extensoes: [] }
  };

  /* ---------- ACERVO PELO TEXTO DO PDF (10/11/2026) ----------
   * Quando o NOME do arquivo não basta ("Documento 7.pdf"), o sistema lê o texto das páginas 1 e 2 do PDF e procura as
   * frases que o carimbo e o corpo de cada tipo de documento trazem. Cada frase vale um peso (frase longa e exclusiva = 3;
   * palavra que também aparece em prosa = 1) e o tipo só é sugerido com soma >= LIMITE_TEXTO: uma palavra solta
   * ("estrutura", "art", "ele") NUNCA classifica sozinha — é para isso que as regras de nome, com abreviaturas, não servem
   * aqui. O texto chega JÁ LIDO (este arquivo é só dado); o resultado é sempre confiança baixa: a pessoa confirma. As frases
   * estão sem acento e em minúsculas (o texto é normalizado antes). */
  var LIMITE_TEXTO = 3;
  var ACERVO_TEXTO = {
    projeto_arquitetonico:   [["planta baixa", 3], ["projeto arquitetonico", 3], ["planta de situacao", 2], ["planta de cobertura", 2], ["fachada", 1], ["fachadas", 1], ["cortes e fachadas", 3], ["planta de layout", 2], ["quadro de esquadrias", 2]],
    projeto_estrutural:      [["projeto estrutural", 3], ["planta de formas", 3], ["forma do pavimento", 3], ["formas e armacao", 3], ["detalhamento de armacao", 3], ["relacao do aco", 3], ["resumo do aco", 3], ["armacao de vigas", 3], ["armacao de pilares", 3], ["lajes", 1], ["pilares", 1], ["vigas", 1]],
    projeto_fundacao:        [["projeto de fundacao", 3], ["projeto de fundacoes", 3], ["planta de locacao de pilares", 3], ["locacao das estacas", 3], ["locacao de estacas", 3], ["blocos de coroamento", 3], ["sapatas", 1], ["estacas", 1], ["baldrames", 1], ["planta de fundacao", 3]],
    projeto_hidrossanitario: [["projeto hidrossanitario", 3], ["instalacoes hidrossanitarias", 3], ["instalacoes hidraulicas", 3], ["agua fria", 2], ["esgoto sanitario", 3], ["rede de esgoto", 2], ["instalacoes sanitarias", 3], ["agua quente", 1]],
    projeto_eletrico:        [["projeto eletrico", 3], ["instalacoes eletricas", 3], ["quadro de cargas", 3], ["diagrama unifilar", 3], ["luminotecnico", 3], ["spda", 2], ["sistema de protecao contra descargas", 3], ["cabeamento estruturado", 3]],
    projeto_drenagem:        [["projeto de drenagem", 3], ["drenagem pluvial", 3], ["galerias pluviais", 3], ["boca de lobo", 3], ["bocas de lobo", 3], ["sarjeta", 1], ["bueiro", 2]],
    projeto_pavimentacao:    [["projeto de pavimentacao", 3], ["secao tipo", 2], ["pavimento flexivel", 3], ["perfil longitudinal", 2], ["terraplenagem", 2], ["camadas do pavimento", 3], ["cbuq", 2]],
    memorial_descritivo:     [["memorial descritivo", 3], ["memorial de especificacoes", 3], ["descricao do projeto", 1], ["memorial tecnico", 2]],
    especificacao_tecnica:   [["especificacoes tecnicas", 3], ["especificacao tecnica", 3], ["caderno de encargos", 3], ["caderno de especificacoes", 3]],
    sondagem:                [["sondagem a percussao", 3], ["boletim de sondagem", 3], ["sondagem spt", 3], ["perfil individual de sondagem", 3], ["sondagem", 2], ["nspt", 2], ["spt", 1], ["nivel d agua", 1], ["ensaio de penetracao", 2]],
    topografia:              [["levantamento planialtimetrico", 3], ["levantamento topografico", 3], ["planta planialtimetrica", 3], ["planialtimetrico", 2], ["topografico", 1], ["georreferenciamento", 2], ["curvas de nivel", 2]],
    orcamento_planilha:      [["planilha orcamentaria", 3], ["orcamento sintetico", 3], ["orcamento analitico", 3], ["composicao de custos", 3], ["curva abc", 2], ["bdi", 1], ["sinapi", 1]],
    cronograma:              [["cronograma fisico financeiro", 3], ["cronograma fisico-financeiro", 3], ["cronograma de obra", 3], ["cronograma fisico", 3]],
    art_rrt:                 [["anotacao de responsabilidade tecnica", 3], ["registro de responsabilidade tecnica", 3], ["termo de responsabilidade tecnica", 3], ["art de obra ou servico", 3], ["art de projeto", 3], ["conselho regional de engenharia", 1], ["crea", 1], ["conselho de arquitetura e urbanismo", 1]],
    licenca_ambiental:       [["licenca ambiental", 3], ["licenca previa", 3], ["licenca de instalacao", 3], ["licenca de operacao", 3], ["outorga de direito de uso", 3], ["autorizacao de supressao", 3]],
    alvara_aprovacao:        [["alvara de construcao", 3], ["alvara de execucao", 3], ["alvara de aprovacao", 3], ["aprovacao de projeto", 2], ["habite se", 2], ["auto de vistoria do corpo de bombeiros", 3], ["avcb", 2]],
    matricula_imovel:        [["matricula do imovel", 3], ["registro de imoveis", 2], ["oficial de registro de imoveis", 3], ["certidao de matricula", 3], ["certidao de inteiro teor", 3], ["escritura publica", 2]],
    laudo:                   [["laudo tecnico", 3], ["laudo de vistoria", 3], ["laudo de inspecao", 3], ["parecer tecnico", 2], ["relatorio de vistoria", 3], ["patologias", 1], ["manifestacoes patologicas", 3]]
  };

  /* ---------- BIBLIOTECA DE RISCOS (texto da casa, curto; sugestão a conferir) ---------- */
  function risco(id, descricao, categoria, prob, impacto, alocacao, mitigacao) {
    return { id: id, descricao: descricao, categoria: categoria, prob: prob, impacto: impacto, alocacao: alocacao, mitigacao: mitigacao };
  }
  var BIBLIOTECA_RISCOS = {
    solo_diferente:      risco("solo_diferente", "Solo encontrado diferente do previsto na sondagem", "geotécnico", 3, 4, "compartilhado", "Sondagem suficiente ao projeto; cláusula de revisão quando o solo divergir do laudo."),
    interferencia_rede:  risco("interferencia_rede", "Interferência com redes existentes (água, esgoto, energia, telecom)", "técnico", 3, 4, "contratante", "Cadastro das redes antes do edital; sondagem de interferências; plano de remanejamento."),
    chuva_acima_media:   risco("chuva_acima_media", "Chuvas acima da média histórica atrasam a obra", "clima", 3, 3, "compartilhado", "Cronograma com dias de chuva considerados; critério de suspensão e de recomposição do prazo."),
    atraso_licenca:      risco("atraso_licenca", "Atraso de licença ou alvará", "regulatório", 3, 4, "contratante", "Licenças obtidas antes da ordem de serviço; prazo de emissão no cronograma."),
    posse_terreno:       risco("posse_terreno", "Terreno sem posse ou desapropriação pendente", "fundiário", 2, 5, "contratante", "Matrícula e posse comprovadas antes do edital."),
    variacao_insumo:     risco("variacao_insumo", "Variação de preço de insumo acima do previsto", "econômico", 3, 3, "compartilhado", "Reajuste por índice e data-base definidos no edital."),
    projeto_incompleto:  risco("projeto_incompleto", "Projeto incompleto ou incompatível entre disciplinas", "técnico", 3, 4, "contratante", "Compatibilização dos projetos e revisão do projeto básico antes da publicação."),
    falha_fornecimento:  risco("falha_fornecimento", "Falha no fornecimento de material", "suprimentos", 2, 3, "contratada", "Plano de suprimentos; marcas equivalentes aceitas no edital."),
    acidente_trabalho:   risco("acidente_trabalho", "Acidente de trabalho no canteiro", "segurança", 2, 5, "contratada", "PGR/PCMAT, treinamento e fiscalização de segurança."),
    furto_canteiro:      risco("furto_canteiro", "Vandalismo ou furto no canteiro", "segurança", 3, 2, "contratada", "Vigilância e guarda de material no canteiro."),
    achado_arqueologico: risco("achado_arqueologico", "Achado arqueológico paralisa a obra", "regulatório", 1, 4, "contratante", "Consulta prévia ao órgão de patrimônio quando a área exigir."),
    mudanca_normas:      risco("mudanca_normas", "Mudança de norma técnica ou legal durante a obra", "regulatório", 1, 3, "contratante", "Cláusula de adequação com recomposição do equilíbrio."),
    atraso_pagamento:    risco("atraso_pagamento", "Atraso de pagamento pelo órgão", "financeiro", 2, 4, "contratante", "Previsão orçamentária reservada; prazo de pagamento e encargos por atraso no contrato."),
    abandono_contratada: risco("abandono_contratada", "Abandono da obra pela contratada", "contratual", 2, 5, "contratada", "Garantia contratual, seguro-garantia e cláusula de retomada."),
    erro_quantitativo:   risco("erro_quantitativo", "Erro de quantitativo na planilha de referência", "orçamento", 3, 3, "contratante", "Quantitativo com memória de cálculo e origem; revisão independente antes da publicação.")
  };
  function todosRiscos() { var o = []; for (var k in BIBLIOTECA_RISCOS) o.push(k); return o; }

  /* ---------- TIPOS DE OBJETO ----------
   * servicoComumEngenharia: define se cabe pregão (art. 29, parágrafo único).
   * reforma: libera acréscimo de 50% no aditivo (art. 125). `base`: base de preços sugerida.
   * `documentosExigidos` = ids do ACERVO; `porque` = a razão de cada um, em 1 linha. */
  var RISCOS_EDIFICACAO = ["solo_diferente", "interferencia_rede", "chuva_acima_media", "atraso_licenca", "posse_terreno", "variacao_insumo", "projeto_incompleto", "falha_fornecimento", "acidente_trabalho", "furto_canteiro", "atraso_pagamento", "abandono_contratada", "erro_quantitativo"];
  var TIPOS_OBJETO = {
    obra_nova: { nome: "Obra nova (edificação)", palavras: ["obra nova", "construcao de", "construir", "edificacao nova", "implantacao de", "nova sede", "novo predio", "nova escola", "nova creche", "nova ubs"],
      servicoComumEngenharia: false, reforma: false, base: "SINAPI",
      documentosExigidos: ["projeto_arquitetonico", "projeto_estrutural", "projeto_fundacao", "projeto_hidrossanitario", "projeto_eletrico", "memorial_descritivo", "sondagem", "topografia", "art_rrt"],
      porque: { projeto_arquitetonico: "arquitetônico: define o que será construído", projeto_estrutural: "estrutural: base dos quantitativos de concreto, forma e aço", projeto_fundacao: "fundação: depende da sondagem e é o maior risco de aditivo", projeto_hidrossanitario: "hidrossanitário: instalações prediais do projeto básico", projeto_eletrico: "elétrico: instalações prediais do projeto básico", memorial_descritivo: "memorial: descreve materiais e métodos que o orçamento precifica", sondagem: "sondagem: base do projeto de fundação", topografia: "topografia: base da implantação e dos movimentos de terra", art_rrt: "ART/RRT: responsabilidade técnica pelos projetos" },
      riscos: RISCOS_EDIFICACAO.concat(["achado_arqueologico", "mudanca_normas"]) },
    reforma: { nome: "Reforma", palavras: ["reforma", "reformar", "restauro", "restauracao", "revitalizacao", "requalificacao", "adequacao de", "recuperacao de predio"],
      servicoComumEngenharia: false, reforma: true, base: "SINAPI",
      documentosExigidos: ["projeto_arquitetonico", "memorial_descritivo", "fotos", "art_rrt"],
      porque: { projeto_arquitetonico: "arquitetônico: levantamento do existente e do que muda", memorial_descritivo: "memorial: descreve o que é demolido, mantido e refeito", fotos: "fotos: registro do estado atual antes da obra", art_rrt: "ART/RRT: responsabilidade técnica pelo projeto de reforma" },
      riscos: ["interferencia_rede", "chuva_acima_media", "atraso_licenca", "variacao_insumo", "projeto_incompleto", "falha_fornecimento", "acidente_trabalho", "furto_canteiro", "atraso_pagamento", "abandono_contratada", "erro_quantitativo", "mudanca_normas"] },
    ampliacao: { nome: "Ampliação", palavras: ["ampliacao", "ampliar", "acrescimo de area", "anexo", "novo bloco", "nova ala"],
      servicoComumEngenharia: false, reforma: false, base: "SINAPI",
      documentosExigidos: ["projeto_arquitetonico", "projeto_estrutural", "projeto_fundacao", "projeto_hidrossanitario", "projeto_eletrico", "memorial_descritivo", "sondagem", "art_rrt"],
      porque: { projeto_arquitetonico: "arquitetônico: define a área acrescida e a ligação com o existente", projeto_estrutural: "estrutural: base dos quantitativos e da interface com a estrutura existente", projeto_fundacao: "fundação: da parte ampliada", projeto_hidrossanitario: "hidrossanitário: instalações da parte ampliada", projeto_eletrico: "elétrico: instalações da parte ampliada", memorial_descritivo: "memorial: descreve materiais e métodos", sondagem: "sondagem: base do projeto de fundação da ampliação", art_rrt: "ART/RRT: responsabilidade técnica pelos projetos" },
      riscos: RISCOS_EDIFICACAO.concat(["mudanca_normas"]) },
    pavimentacao: { nome: "Pavimentação", palavras: ["pavimentacao", "pavimento", "asfalto", "asfaltica", "recapeamento", "cbuq", "paralelepipedo", "calcamento", "via publica", "ruas"],
      servicoComumEngenharia: false, reforma: false, base: "SICRO", baseNota: "conferir: SICRO para infraestrutura de transportes; vias urbanas podem usar SINAPI ou tabela local", baseConferir: true,
      documentosExigidos: ["topografia", "projeto_pavimentacao", "projeto_drenagem", "sondagem", "memorial_descritivo", "art_rrt"],
      porque: { topografia: "topografia: base do greide e dos volumes de terraplenagem", projeto_pavimentacao: "pavimentação: define camadas e quantitativos", projeto_drenagem: "drenagem: água mal conduzida destrói o pavimento", sondagem: "sondagem: base do dimensionamento do pavimento (suporte do subleito)", memorial_descritivo: "memorial: descreve materiais e métodos", art_rrt: "ART/RRT: responsabilidade técnica pelos projetos" },
      riscos: ["solo_diferente", "interferencia_rede", "chuva_acima_media", "atraso_licenca", "posse_terreno", "variacao_insumo", "projeto_incompleto", "falha_fornecimento", "acidente_trabalho", "atraso_pagamento", "abandono_contratada", "erro_quantitativo", "achado_arqueologico"] },
    drenagem: { nome: "Drenagem", palavras: ["drenagem", "galeria pluvial", "galerias", "bueiro", "sarjeta", "boca de lobo", "aguas pluviais", "canalizacao de corrego"],
      servicoComumEngenharia: false, reforma: false, base: "SINAPI",
      documentosExigidos: ["topografia", "projeto_drenagem", "sondagem", "memorial_descritivo", "art_rrt"],
      porque: { topografia: "topografia: define caimentos e bacias de contribuição", projeto_drenagem: "drenagem: dimensionamento e traçado das redes", sondagem: "sondagem: escavação e escoramento dependem do solo", memorial_descritivo: "memorial: descreve materiais e métodos", art_rrt: "ART/RRT: responsabilidade técnica pelo projeto" },
      riscos: ["solo_diferente", "interferencia_rede", "chuva_acima_media", "atraso_licenca", "posse_terreno", "variacao_insumo", "projeto_incompleto", "acidente_trabalho", "atraso_pagamento", "abandono_contratada", "erro_quantitativo", "achado_arqueologico"] },
    saneamento: { nome: "Saneamento (água e esgoto)", palavras: ["saneamento", "esgoto", "esgotamento sanitario", "rede de agua", "abastecimento de agua", "estacao de tratamento", "ete", "eta"],
      servicoComumEngenharia: false, reforma: false, base: "SINAPI",
      documentosExigidos: ["topografia", "projeto_hidrossanitario", "sondagem", "memorial_descritivo", "licenca_ambiental", "art_rrt"],
      porque: { topografia: "topografia: define declividades e cotas da rede", projeto_hidrossanitario: "projeto de redes: traçado e dimensionamento", sondagem: "sondagem: escavação, escoramento e nível d'água", memorial_descritivo: "memorial: descreve materiais e métodos", licenca_ambiental: "licença ambiental: obras de saneamento costumam exigi-la (conferir com o órgão ambiental)", art_rrt: "ART/RRT: responsabilidade técnica pelo projeto" },
      riscos: ["solo_diferente", "interferencia_rede", "chuva_acima_media", "atraso_licenca", "posse_terreno", "variacao_insumo", "projeto_incompleto", "falha_fornecimento", "acidente_trabalho", "atraso_pagamento", "abandono_contratada", "erro_quantitativo", "achado_arqueologico", "mudanca_normas"] },
    servico_engenharia_comum: { nome: "Serviço comum de engenharia", palavras: ["servico comum de engenharia", "servicos comuns", "pintura", "pequenos reparos", "conserto"],
      servicoComumEngenharia: true, reforma: false, base: "SINAPI",
      documentosExigidos: ["memorial_descritivo", "art_rrt"],
      porque: { memorial_descritivo: "memorial: descreve o serviço e o padrão de aceitação", art_rrt: "ART/RRT: responsabilidade técnica pela especificação" },
      riscos: ["variacao_insumo", "falha_fornecimento", "acidente_trabalho", "furto_canteiro", "atraso_pagamento", "abandono_contratada", "erro_quantitativo"] },
    servico_engenharia_especial: { nome: "Serviço especial de engenharia", palavras: ["servico especial de engenharia", "elaboracao de projeto", "projeto executivo", "projeto basico", "fiscalizacao de obra", "gerenciamento", "supervisao de obra", "consultoria", "estudo de viabilidade"],
      servicoComumEngenharia: false, reforma: false, base: "SINAPI", baseNota: "conferir: serviços técnicos profissionais podem usar tabela própria de honorários", baseConferir: true,
      documentosExigidos: ["especificacao_tecnica", "memorial_descritivo", "art_rrt"],
      porque: { especificacao_tecnica: "especificação: define o produto e o critério de aceite do serviço", memorial_descritivo: "memorial: descreve escopo e premissas", art_rrt: "ART/RRT: responsabilidade técnica" },
      riscos: ["projeto_incompleto", "mudanca_normas", "atraso_licenca", "atraso_pagamento", "abandono_contratada", "erro_quantitativo"] },
    manutencao: { nome: "Manutenção", palavras: ["manutencao", "conservacao", "preventiva", "corretiva", "zeladoria", "operacao e manutencao"],
      servicoComumEngenharia: true, servicoComumConferir: true, reforma: false, base: "SINAPI",
      documentosExigidos: ["memorial_descritivo", "fotos", "art_rrt"],
      porque: { memorial_descritivo: "memorial: descreve rotinas e padrão de aceitação", fotos: "fotos: registro do estado atual", art_rrt: "ART/RRT: responsabilidade técnica pelo plano de manutenção" },
      riscos: ["variacao_insumo", "falha_fornecimento", "acidente_trabalho", "furto_canteiro", "atraso_pagamento", "abandono_contratada", "erro_quantitativo"] }
  };

  /* ---------- PRAZO MÍNIMO DE PUBLICAÇÃO (dias ÚTEIS) ---------- */
  var PRAZO_PUBLICACAO = {
    fonte: LEI + ", art. 55, II a IV", conferir: true,
    contagem: "Dias úteis (art. 183): exclui o dia da publicação, inclui o do vencimento; não conta sábado, domingo nem feriado.",
    regras: [
      { id: "menor_preco_comum",     dias: 10, descricao: "menor preço ou maior desconto, serviço comum / obra e serviço comum de engenharia", fonte: LEI + ", art. 55, II" },
      { id: "menor_preco_especial",  dias: 25, descricao: "menor preço ou maior desconto, serviço especial / obra e serviço especial de engenharia", fonte: LEI + ", art. 55, II" },
      { id: "contratacao_integrada", dias: 60, descricao: "contratação integrada", fonte: LEI + ", art. 55, II" },
      { id: "semi_integrada",        dias: 35, descricao: "contratação semi-integrada ou demais hipóteses", fonte: LEI + ", art. 55, II" },
      { id: "maior_lance",           dias: 15, descricao: "maior lance", fonte: LEI + ", art. 55, III (conferido 10/11/2026: 15 dias úteis)", conferir: false },
      { id: "tecnica_preco",         dias: 35, descricao: "técnica e preço ou melhor técnica", fonte: LEI + ", art. 55, IV" }
    ]
  };

  /* ---------- ETP (art. 18, §1º, I a XIII). Obrigatórios pelo §2º: I, IV, VI, VIII, XIII ---------- */
  var ETP_ELEMENTOS = [
    { id: "I",    nome: "Descrição da necessidade (problema a resolver, interesse público)", obrigatorio: true },
    { id: "II",   nome: "Previsão no plano de contratações anual", obrigatorio: false },
    { id: "III",  nome: "Requisitos da contratação", obrigatorio: false },
    { id: "IV",   nome: "Estimativa das quantidades, com memória de cálculo", obrigatorio: true },
    { id: "V",    nome: "Levantamento de mercado e justificativa da solução", obrigatorio: false },
    { id: "VI",   nome: "Estimativa do valor, com preços unitários referenciais e memória", obrigatorio: true },
    { id: "VII",  nome: "Descrição da solução como um todo", obrigatorio: false },
    { id: "VIII", nome: "Justificativa do parcelamento ou não da solução", obrigatorio: true },
    { id: "IX",   nome: "Resultados pretendidos (economicidade)", obrigatorio: false },
    { id: "X",    nome: "Providências prévias ao contrato (inclusive capacitação para a fiscalização)", obrigatorio: false },
    { id: "XI",   nome: "Contratações correlatas e/ou interdependentes", obrigatorio: false },
    { id: "XII",  nome: "Impactos ambientais e medidas de mitigação", obrigatorio: false },
    { id: "XIII", nome: "Posicionamento conclusivo sobre a adequação da contratação", obrigatorio: true }
  ];
  var ETP_FONTE = LEI + ", art. 18, §1º, I a XIII; obrigatórios: art. 18, §2º (I, IV, VI, VIII, XIII); os demais, se não contemplados, exigem justificativa";

  /* ---------- PARÂMETROS DO EDITAL (passo 8) ----------
   * Cada um: como o sistema sugere, a fonte e se precisa de conferência do jurídico.
   * `resposta`: forma esperada do valor. Sem valor padrão. */
  var PARAMETROS = {
    modalidade:          { id: "modalidade", nome: "Modalidade", resposta: "texto", como: "Obra: concorrência. Serviço comum de engenharia: pregão ou concorrência. Nunca pregão para obra.", fonte: LEI + ", art. 28; art. 29, parágrafo único", conferir: true },
    criterio_julgamento: { id: "criterio_julgamento", nome: "Critério de julgamento", resposta: "texto", opcoes: ["menor preço", "maior desconto", "técnica e preço"], como: "Menor preço / maior desconto / técnica e preço, pelo tipo de objeto.", fonte: LEI + ", art. 33", conferir: true },
    regime_execucao:     { id: "regime_execucao", nome: "Regime de execução", resposta: "texto", opcoes: ["empreitada por preço unitário", "empreitada por preço global", "empreitada integral", "contratação integrada", "contratação semi-integrada"], como: "Sem padrão: decisão do órgão. Contratação integrada parte de anteprojeto.", fonte: LEI + ", art. 46", conferir: true },
    sigiloso:            { id: "sigiloso", nome: "Orçamento sigiloso", resposta: "bool", opcoes: [true, false], como: "Escolha explícita, sem padrão. Se sim, liga a trava de vazamento do valor estimado.", fonte: LEI + ", art. 24", conferir: true },
    parcelas_relevancia: { id: "parcelas_relevancia", nome: "Parcelas de maior relevância", resposta: "obj", como: "Itens com valor igual ou maior que 4% do total estimado; quantidade mínima exigida limitada a 50% da parcela.", fonte: LEI + ", art. 67, §§1º e 2º", conferir: true },
    garantia_contrato:   { id: "garantia_contrato", nome: "Garantia do contrato", resposta: "obj", como: "Até 5%; até 10% com justificativa de complexidade e risco. Obra de grande vulto: seguro-garantia e cláusula de retomada até 30%. O valor de grande vulto é atualizado por decreto e fica sem preenchimento até ser informado.", fonte: LEI + ", arts. 96 a 99 (art. 98: percentuais; art. 99: seguro-garantia e retomada); grande vulto: art. 6º, XXII e art. 182", conferir: true },
    exequibilidade:      { id: "exequibilidade", nome: "Exequibilidade", resposta: "obj", como: "Proposta abaixo de 75% do valor orçado é inexequível; abaixo de 85% exige garantia adicional igual à diferença.", fonte: LEI + ", art. 59, §§4º e 5º", conferir: true },
    reajuste:            { id: "reajuste", nome: "Reajuste", resposta: "obj", como: "Índice (sem padrão) e data-base igual à data do orçamento estimado.", fonte: LEI + ", art. 25, §7º", conferir: true },
    aditivo_teto:        { id: "aditivo_teto", nome: "Teto de aditivos (fase de contrato)", resposta: "obj", como: "Acréscimos e supressões até 25%; em reforma de edifício ou equipamento, acréscimo até 50%.", fonte: LEI + ", art. 125", conferir: true },
    recurso_prazo:       { id: "recurso_prazo", nome: "Prazo de recurso", resposta: "obj", como: "3 dias úteis.", fonte: LEI + ", art. 165", conferir: true },
    visita_tecnica:      { id: "visita_tecnica", nome: "Visita técnica", resposta: "bool", opcoes: [true, false], como: "Pergunta sim/não, sem padrão. Sim: a visita fica prevista no edital. Não: o licitante assume o risco do que não viu.", fonte: LEI + ", art. 63, §2º", conferir: true },
    consorcio:           { id: "consorcio", nome: "Participação de consórcio", resposta: "bool", opcoes: [true, false], como: "Pergunta sim/não, sem padrão. Sim: o edital precisa fixar as regras do consórcio. Não: restringe a competição e pede justificativa.", fonte: LEI + ", art. 15", conferir: true },
    subcontratacao:      { id: "subcontratacao", nome: "Subcontratação", resposta: "bool", opcoes: [true, false], como: "Pergunta sim/não, sem padrão. Sim: o edital fixa o limite e as parcelas subcontratáveis.", fonte: LEI + ", art. 122", conferir: true },
    amostra:             { id: "amostra", nome: "Amostra / prova de conceito", resposta: "bool", opcoes: [true, false], como: "Pergunta sim/não, sem padrão. Sim: o edital descreve o critério de aceitação e o prazo.", fonte: LEI + " (artigo a conferir pelo jurídico do órgão)", conferir: true },
    me_epp:              { id: "me_epp", nome: "Tratamento de ME/EPP", resposta: "bool", opcoes: [true, false], como: "Pergunta sim/não, sem padrão. Sim: aplicam-se os benefícios da LC 123/2006. O jurídico confirma o enquadramento (exclusividade, cota, empate ficto).", fonte: "LC 123/2006", conferir: true }
  };
  var PARAMETROS_ORDEM = ["modalidade", "criterio_julgamento", "regime_execucao", "sigiloso", "parcelas_relevancia", "garantia_contrato", "exequibilidade", "reajuste", "aditivo_teto", "recurso_prazo", "visita_tecnica", "consorcio", "subcontratacao", "amostra", "me_epp"];

  /* ---------- REGULAMENTOS DE PESQUISA DE PREÇOS ----------
   * `ordem`: as fontes na ORDEM em que o regulamento manda procurar.
   *   tipo: sistema_oficial | outro_sistema | midia | contratacao_similar | cotacao | nota_fiscal
   *   exigeDataHora: a fonte só vale com data e hora de acesso.
   *   validade: {meses|anos, ref} — ref "dataPrevistaEdital" (cotação) ou "dataPesquisa" (similar).
   * `calculo.minimoPrecos`: abaixo disso, justificativa obrigatória (não bloqueia). */
  var REGULAMENTOS = {
    "federal-14133": {
      id: "federal-14133", nome: "Federal — Lei 14.133 (padrão para município sem decreto próprio)",
      fonte: LEI + ", art. 23, §2º; IN SEGES/ME 91/2022 (obras) — fonte secundária", conferir: true,
      ordem: [
        { ordem: 1, tipo: "sistema_oficial", nome: "SINAPI (edificações) / SICRO (infraestrutura de transportes)", bases: ["SINAPI", "SICRO"], limite: "mediana", exigeDataHora: false, umaFonteBasta: true, fonte: LEI + ", art. 23, §2º, I" },
        { ordem: 2, tipo: "midia", nome: "Mídia especializada, tabela de referência aprovada pelo Poder Executivo federal, sítios especializados ou de domínio amplo", exigeDataHora: true, fonte: LEI + ", art. 23, §2º, II" },
        { ordem: 3, tipo: "contratacao_similar", nome: "Contratações similares da Administração, em execução ou concluídas até 1 ano antes da pesquisa, atualizadas por índice", exigeDataHora: false, validade: { anos: 1, ref: "dataPesquisa" }, exigeIndice: true, fonte: LEI + ", art. 23, §2º, III" },
        { ordem: 4, tipo: "nota_fiscal", nome: "Base nacional de notas fiscais eletrônicas", exigeDataHora: false, fonte: LEI + ", art. 23, §2º, IV", conferir: true }
      ],
      calculo: { minimoPrecos: 3, metodos: ["media", "mediana", "menor"], descarta: "inexequíveis, inconsistentes e excessivamente elevados (critério configurável)", fonte: "IN SEGES/ME 65/2021, art. 6º", conferir: true },
      justificativa: "Menos de 3 preços só com justificativa aprovada pela autoridade (IN 65/2021, art. 6º — conferir)."
    },
    "sp-capital-62100": {
      id: "sp-capital-62100", nome: "São Paulo (capital) — Decreto Municipal 62.100/2022",
      fonte: "Decreto Municipal SP 62.100/2022, arts. 28 e 29 (FONTE PRIMÁRIA; texto lido em RA-Equipe\\orcapro\\pesquisas\\SP-Decreto-62100-2022-texto.txt)", conferir: false,
      ordem: [
        { ordem: 1, tipo: "sistema_oficial", nome: "Tabela de Custos Unitários da SIURB (composição ≤ mediana do item, mais BDI de referência e encargos sociais)", bases: ["SIURB", "SIURB_INFRA"], limite: "mediana", exigeDataHora: false, umaFonteBasta: true, fonte: "Decreto 62.100/2022, art. 28, caput",
          /* 10/11/2026: a base REAL está no OrçaPRO (js/basescat.js: SIURB = Edificações, SIURB_INFRA = Infraestrutura Urbana; gerada por tools/converter-siurb.js
             das planilhas oficiais, data-base julho/2026). O orçamento que usa os itens dessas bases já TEM a fonte 1: uma fonte basta (umaFonteBasta). */
          baseNoApp: { SIURB: "SIURB Edificações", SIURB_INFRA: "SIURB Infraestrutura Urbana" }, dataBaseNoApp: "2026-07", paginaOficial: "https://prefeitura.sp.gov.br/web/obras/w/tabelas_de_custos/355179" },
        { ordem: 2, tipo: "outro_sistema", nome: "Outros sistemas de custos (composição ≤ mediana do item)", exigeDataHora: false, fonte: "Decreto 62.100/2022, art. 28, §1º, I",
          conferir: true, nota: "O decreto não diz se um único sistema basta; aqui conta como 1 preço e o mínimo de 3 aplica-se ao conjunto. Decisão do jurídico." },
        { ordem: 3, tipo: "midia", nome: "Pesquisa publicada em mídia especializada e sítios especializados ou de domínio amplo, com data e hora de acesso", exigeDataHora: true, fonte: "Decreto 62.100/2022, art. 28, §1º, II" },
        { ordem: 4, tipo: "contratacao_similar", nome: "Contratações similares da Administração, em execução ou concluídas no ano anterior à data da pesquisa, com índice de atualização", exigeDataHora: false, validade: { anos: 1, ref: "dataPesquisa" }, exigeIndice: true, fonte: "Decreto 62.100/2022, art. 28, §1º, III" },
        { ordem: 5, tipo: "cotacao", nome: "Consulta direta a no mínimo 3 fornecedores, por solicitação formal, com justificativa da escolha, até 6 meses da divulgação do edital", exigeDataHora: false, validade: { meses: 6, ref: "dataPrevistaEdital" }, fonte: "Decreto 62.100/2022, art. 28, §1º, IV" }
      ],
      calculo: { minimoPrecos: 3, metodos: ["media", "mediana", "menor"], descarta: "critério configurável pelo órgão", fonte: "Decreto 62.100/2022, art. 29 (menos de 3 preços, nas consultas a contratações similares ou ao mercado, só com justificativa)",
        conferir: true, nota: "O art. 29 trata de contratações similares e consulta ao mercado; o mínimo de 3 foi aplicado ao conjunto por cautela — o jurídico confirma." },
      recursoFederal: "Com recursos da União valem as regras federais (art. 28, §2º): o motor troca para federal-14133.",
      justificativa: "Menos de 3 preços só mediante justificativa (art. 29)."
    }
  };
  var VALIDADE_FONTE = { cotacao: "6 meses até a data prevista do edital", contratacao_similar: "1 ano até a data da pesquisa", midia: "exige data e hora de acesso" };

  /* ---------- PAPÉIS (RBAC do órgão) ---------- */
  var ACOES = ["criar_processo", "editar_dfd", "editar_acervo", "editar_quantitativos", "editar_orcamento", "editar_pesquisa", "editar_etp", "editar_riscos", "editar_tr", "editar_parametros", "gerar_minuta", "enviar_juridico", "emitir_parecer", "responder_ressalva", "aprovar_justificativa", "autorizar_abertura", "publicar", "analisar_propostas", "adjudicar", "homologar", "gerenciar_logins", "gerenciar_modelos", "ler_tudo", "ler_auditoria"];
  var PAPEIS = {
    admin_orgao:      { nome: "Administrador do órgão", acoes: ["gerenciar_logins", "gerenciar_modelos", "ler_tudo"] },
    requisitante:     { nome: "Setor requisitante", acoes: ["criar_processo", "editar_dfd", "editar_acervo"] },
    engenharia:       { nome: "Engenharia / planejamento", acoes: ["editar_acervo", "editar_quantitativos", "editar_orcamento", "editar_pesquisa", "editar_etp", "editar_riscos", "editar_tr"] },
    cpl:              { nome: "Agente de contratação / comissão (CPL)", acoes: ["editar_parametros", "gerar_minuta", "enviar_juridico", "responder_ressalva", "analisar_propostas", "publicar"] },
    juridico:         { nome: "Jurídico (procuradoria / assessoria)", acoes: ["emitir_parecer", "ler_tudo"] },
    autoridade:       { nome: "Autoridade competente", acoes: ["aprovar_justificativa", "autorizar_abertura", "adjudicar", "homologar"] },
    controle_interno: { nome: "Controle interno", acoes: ["ler_tudo", "ler_auditoria"] },
    fiscal:           { nome: "Fiscal do contrato", acoes: ["ler_tudo"] }
  };
  var ACOES_ROTULO = {
    criar_processo: "criar processo", editar_dfd: "editar a demanda", editar_acervo: "editar o acervo", editar_quantitativos: "editar quantitativos",
    editar_orcamento: "editar o orçamento", editar_pesquisa: "editar a pesquisa de preços", editar_etp: "editar o ETP", editar_riscos: "editar os riscos",
    editar_tr: "editar o TR / projeto básico", editar_parametros: "editar os parâmetros do edital", gerar_minuta: "gerar a minuta", enviar_juridico: "enviar ao jurídico",
    emitir_parecer: "emitir parecer jurídico", responder_ressalva: "responder ressalva", aprovar_justificativa: "aprovar justificativa", autorizar_abertura: "autorizar a abertura",
    publicar: "publicar", analisar_propostas: "analisar propostas", adjudicar: "adjudicar", homologar: "homologar", gerenciar_logins: "gerenciar logins", gerenciar_modelos: "importar os modelos de documento do órgão",
    ler_tudo: "ler o processo inteiro", ler_auditoria: "ler a auditoria"
  };

  var CplproRegras = {
    versao: 1,
    ACERVO_TIPOS: ACERVO_TIPOS, ACERVO_TEXTO: ACERVO_TEXTO, LIMITE_TEXTO: LIMITE_TEXTO, BIBLIOTECA_RISCOS: BIBLIOTECA_RISCOS, TODOS_RISCOS: todosRiscos(),
    TIPOS_OBJETO: TIPOS_OBJETO, PRAZO_PUBLICACAO: PRAZO_PUBLICACAO,
    ETP_ELEMENTOS: ETP_ELEMENTOS, ETP_FONTE: ETP_FONTE,
    PARAMETROS: PARAMETROS, PARAMETROS_ORDEM: PARAMETROS_ORDEM,
    REGULAMENTOS: REGULAMENTOS, VALIDADE_FONTE: VALIDADE_FONTE,
    PAPEIS: PAPEIS, ACOES: ACOES, ACOES_ROTULO: ACOES_ROTULO
  };

  global.CplproRegras = CplproRegras;
  if (typeof module !== "undefined" && module.exports) module.exports = CplproRegras;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
