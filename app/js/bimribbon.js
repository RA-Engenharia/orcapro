/* =====================================================================
 * bimribbon.js — Motor da FAIXA DE OPÇÕES (ribbon) do módulo BIM.
 *
 * O BIM do OrçaPRO virou um AMBIENTE de trabalho, não uma página: a
 * organização é a de programa de projeto que o engenheiro já conhece — abas de
 * contexto, cada uma com painéis nomeados, cada painel com seus comandos.
 *
 * Este arquivo é o MODELO, não o desenho: descreve quais abas existem,
 * que comandos moram em cada painel, e — o que faltava — guarda o ESTADO
 * de cada comando em memória.
 *
 * Por que o estado importa: até aqui o "ligado/desligado" de cada
 * ferramenta do BIM só existia no style.background do botão. Quem
 * quisesse saber se a trena estava ativa tinha que ler uma cor. Ao
 * trocar a fita por uma ribbon isso quebraria calado. Aqui o estado é
 * dado (ativo, desabilitado, motivo), a cor é consequência.
 *
 * PURO e Node-testável: não toca no DOM, não conhece three.js, não
 * chama o BIM. Quem desenha é js/bimribbonui.js; quem executa é o app.
 * Teste: node tools/test-bimribbon.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function arr(v) { return Object.prototype.toString.call(v) === "[object Array]" ? v : []; }
  function str(v) { return v == null ? "" : String(v); }

  /* ---------------------------------------------------------------
   * O MAPA DE COMANDOS.
   * Cada aba tem painéis; cada painel tem comandos. Um comando é:
   *   id       — identificador estável (é o que o app recebe no clique)
   *   rotulo   — vai em DUAS linhas embaixo do ícone;
   *              use "\n" para escolher onde quebra
   *   icone    — nome no registry de ícones (js/icones.js)
   *   dica     — tooltip; texto de engenheiro, não de programador
   *   tipo     — "botao" (padrão) | "alterna" (liga/desliga) | "menu"
   *   itens    — para tipo "menu": subcomandos
   *   grande   — false = botão pequeno, empilha 3 por coluna
   *   requer   — pré-condição: "modelo" (algo carregado) | "selecao" | "obra"
   *   pro      — true = recurso de plano pago
   * --------------------------------------------------------------- */
  var ABAS = [
    {
      id: "arquivo", rotulo: "Arquivo", tipo: "backstage",
      paineis: [
        { nome: "Projeto", comandos: [
          { id: "novo-projeto", rotulo: "Novo\nprojeto", icone: "obra", grande: true, dica: "Começa um projeto do zero: define os níveis e desenha as paredes aqui mesmo." },
          { id: "abrir-ifc", rotulo: "Abrir\nIFC", icone: "abrir", grande: true, dica: "Abre um modelo IFC exportado do Revit, ArchiCAD, SketchUp ou do nosso plugin." },
          /* ⚠ SEM `requer` DE PROPÓSITO: é o caminho de quem ainda não tem modelo
             aberto. O "Importar pacote" morava só em Pontos de vista, que pede
             modelo — e o arquivo da obra (.zip) é justamente o que TRAZ o modelo.
             Roteiro do defeito (30/09/2026): obra nova, BIM vazio, "Pontos de
             vista" cinza — o passo 2 do LEIA-ME do grupo não tinha como ser feito. */
          { id: "arquivo-obra", rotulo: "Arquivo\nda obra", icone: "pasta", grande: true, dica: "Abre o arquivo da obra (.zip) que chegou no grupo: o modelo, os pontos de vista, as pranchas, a sondagem e a ficha de cada peça, de uma vez. Também aceita o pacote (.json)." },
          { id: "gerar-volumetria", rotulo: "Gerar de\ndesenho", icone: "importar", grande: true, dica: "Levanta a volumetria a partir de PDF, DWG/DXF, foto de prancha ou croqui feito à mão." },
          { id: "modelos", rotulo: "Modelos\nabertos", icone: "camadas", requer: "modelo", dica: "Federação: vários arquivos abertos juntos, com visibilidade e transparência por disciplina." },
          { id: "exemplo", rotulo: "Modelo de\nexemplo", icone: "obra", dica: "Abre um modelo de exemplo para conhecer as ferramentas." },
          { id: "remover-modelos", rotulo: "Remover\nmodelos", icone: "lixeira", requer: "modelo", dica: "Tira os modelos desta obra do visualizador. O arquivo .ifc no seu computador continua onde está." },
          { id: "p3d", rotulo: "Planta DXF\n→ 3D", icone: "importar", dica: "Reconstrói o 3D a partir da planta baixa em DXF (assistido: o sistema propõe as paredes, você confirma)." }
        ] },
        { nome: "Salvar e sair", comandos: [
          { id: "salvar-modelo", rotulo: "Salvar\nno projeto", icone: "salvar", requer: "modelo", dica: "Guarda o modelo e as edições dentro da obra." },
          { id: "exportar-ifc", emBreve: true, rotulo: "Exportar\nIFC", icone: "exportar", requer: "modelo", pro: true, dica: "Gera um IFC do que está aqui, para abrir em outro programa." },
          { id: "exportar-revit", rotulo: "Enviar ao\nRevit", icone: "revit", requer: "modelo", pro: true, dica: "Manda o orçamento e o avanço para o plugin OrçaPRO dentro do Revit." }
        ] }
      ]
    },
    {
      id: "arquitetura", rotulo: "Arquitetura",
      paineis: [
        { nome: "Construir", comandos: [
          { id: "parede", rotulo: "Parede", icone: "parede", grande: true, tipo: "alterna", dica: "Desenha parede clicando dois pontos. O tipo de parede define espessura e camadas." },
          { id: "piso", rotulo: "Piso", icone: "laje", grande: true, tipo: "alterna", dica: "Cria laje/contrapiso por dois cantos." },
          { id: "pilar", rotulo: "Pilar", icone: "pilar", grande: true, tipo: "alterna", dica: "Lança pilar pela seção definida no tipo." },
          { id: "porta", emBreve: true, rotulo: "Porta", icone: "porta", grande: true, tipo: "alterna", requer: "modelo", dica: "Abre vão de porta na parede — o vão desconta da alvenaria e do revestimento." },
          { id: "janela", emBreve: true, rotulo: "Janela", icone: "janela", grande: true, tipo: "alterna", requer: "modelo", dica: "Abre vão de janela com peitoril; desconta do quantitativo e gera verga e contraverga." },
          { id: "cobertura", emBreve: true, rotulo: "Cobertura", icone: "telhado", grande: true, tipo: "alterna", requer: "modelo", dica: "Telhado por inclinação e tipo de telha." },
          { id: "editor", rotulo: "Editor", icone: "editar", dica: "Cria paredes, lajes e pilares sintéticos, move, apaga e anota — salvo com a obra." }
        ] },
        { nome: "Tipo", comandos: [
          { id: "tipos-parede", rotulo: "Tipos de\nparede", icone: "camadas", grande: true, dica: "Biblioteca de paredes: bloco, espessura e as camadas de acabamento de cada face." },
          { id: "editar-tipo", rotulo: "Editar\ntipo", icone: "editar", requer: "selecao", dica: "Muda o tipo do que está selecionado — vale para todos os elementos daquele tipo." },
          { id: "combinar", emBreve: true, rotulo: "Igualar\ntipo", icone: "copiar", requer: "selecao", dica: "Aplica o tipo de um elemento em outro." }
        ] },
        { nome: "Nível", comandos: [
                    { id: "niveis", rotulo: "Níveis", icone: "niveis", grande: true, dica: "Cria e edita os níveis do projeto. Cada elemento pertence a um nível." },
          { id: "nivel-atual", rotulo: "Nível\natual", icone: "alvo", tipo: "menu", dica: "Escolhe em que nível o próximo elemento vai nascer." },
          { id: "plano-trabalho", emBreve: true, rotulo: "Plano de\ntrabalho", icone: "planta", dica: "Altura de referência para desenhar." }
        ] }
      ]
    },
    {
      id: "alvenaria", rotulo: "Alvenaria",
      paineis: [
        { nome: "Bloco", comandos: [
          { id: "familia-bloco", rotulo: "Família\ndo bloco", icone: "bloco", grande: true, dica: "Escolhe a família modular de bloco de concreto e as peças disponíveis." },
          { id: "modular", rotulo: "Modular\nparedes", icone: "regua", grande: true, requer: "modelo", dica: "Ajusta os comprimentos para fechar em bloco inteiro, evitando recorte." },
          { id: "junta", rotulo: "Junta e\ncompensador", icone: "ajustes", requer: "modelo", dica: "Afina a junta dentro da faixa aceitável para dispensar bolacha; se não fechar, encaixa a bolacha." }
        ] },
        { nome: "Paginação", comandos: [
          { id: "paginar-alvenaria", rotulo: "Paginar\nalvenaria", icone: "grade", grande: true, requer: "modelo", dica: "Distribui as peças fiada a fiada, com amarração nos encontros em L, T e X." },
          { id: "elevacoes", rotulo: "Elevações\nde parede", icone: "prancha", grande: true, requer: "modelo", dica: "Gera a prancha de elevação de cada parede, com peças numeradas e lista de material." },
          { id: "graute", emBreve: true, rotulo: "Graute e\narmadura", icone: "estrutura", requer: "modelo", dica: "Alvenaria estrutural: pontos de graute e armadura vertical, com m³ e kg." },
          { id: "blocok", rotulo: "Plantas\nBlocok", icone: "prancha", requer: "modelo", dica: "Plantas executivas Blocok: a prancha de cada parede com as placas 90×90 numeradas e a tabela de material." }
        ] },
        { nome: "Conferência", comandos: [
          /* sem `requer` de propósito: os dois são paramétricos puros — não
             leem o modelo em momento nenhum. Exigir um IFC aberto para saber
             quanto pesa um bloco é obstáculo sem motivo. */
          { id: "conferir-modulacao", rotulo: "Conferir\nmodulação", icone: "checklist", grande: true, dica: "Aponta onde a parede não fecha na modulação e o que fazer. Não precisa de modelo aberto." },
          { id: "peso-alvenaria", rotulo: "Peso por\nparede", icone: "balanca", dica: "Peso das peças por parede. Vem pré-definido de catálogo e você troca pelo peso do seu fornecedor." }
        ] }
      ]
    },
    {
      id: "acabamentos", rotulo: "Acabamentos",
      paineis: [
        { nome: "Parede", comandos: [
          /* sem `requer` de propósito: é o painel de CONFIGURAÇÃO, e o
             usuário precisa dele antes de existir qualquer parede. */
          { id: "parede-cebola", rotulo: "Camadas\nda parede", icone: "cebola", grande: true, dica: "Transforma a parede crua em parede executiva: chapisco, emboço, reboco, massa, pintura ou revestimento, face por face. Mexeu numa espessura, a parede recalcula na hora." },
          { id: "presets-acabamento", rotulo: "Padrões\nprontos", icone: "estrela", grande: true, dica: "Os acabamentos mais usados no Brasil, prontos para aplicar." },
          { id: "aplicar-ambiente", emBreve: true, rotulo: "Aplicar por\nambiente", icone: "ambiente", requer: "modelo", dica: "Define o acabamento de um ambiente inteiro de uma vez." }
        ] },
        { nome: "Piso e revestimento", comandos: [
          { id: "paginar-piso", rotulo: "Paginar\npiso", icone: "grade", grande: true, requer: "modelo", dica: "Escolhe o melhor ponto de partida para o menor recorte e nenhum recorte fino na entrada." },
          { id: "paginar-parede", rotulo: "Paginar\nrevestimento", icone: "azulejo", grande: true, requer: "modelo", dica: "Paginação do azulejo por parede, alinhada com o piso." },
          { id: "pranchas-paginacao", rotulo: "Pranchas de\npaginação", icone: "prancha", requer: "modelo", dica: "Gera as pranchas executivas de paginação para o pedreiro." }
        ] }
      ]
    },
    {
      id: "anotar", rotulo: "Anotar",
      paineis: [
        { nome: "Medir", comandos: [
          { id: "medir", rotulo: "Trena", icone: "medir", grande: true, tipo: "alterna", requer: "modelo", dica: "Mede a distância entre dois pontos do modelo." },
          { id: "area", rotulo: "Área", icone: "area", grande: true, tipo: "alterna", requer: "modelo", dica: "Mede área por um contorno de pontos." },
          { id: "angulo", rotulo: "Ângulo", icone: "angulo", grande: true, tipo: "alterna", requer: "modelo", dica: "Mede o ângulo entre duas direções." },
          { id: "snap", rotulo: "Snap", icone: "ima", tipo: "menu", dica: "Onde a medição se agarra: vértice, meio da aresta, aresta, interseção." },
          { id: "limpar-medidas", rotulo: "Apagar\nmedidas", icone: "lixeira", requer: "modelo", dica: "Apaga todas as cotas medidas com a trena, a área e o ângulo." }
        ] },
        /* cotar rede NÃO mede: mostra o comprimento que o projetista publicou no
           IFC. Painel próprio pelo mesmo motivo do grupo próprio no dock. */
        { nome: "Rede (tubos)", comandos: [
          { id: "cota", rotulo: "Cotar\ntubo", icone: "regua", grande: true, requer: "modelo", dica: "Toque num tubo e o comprimento dele aparece em cima da peça — o número vem do IFC, não é medido na tela." },
          { id: "cota-iguais", rotulo: "Cotar\niguais", icone: "camadas", requer: "modelo", dica: "Cota todos os trechos iguais ao último tocado." },
          { id: "cota-todas", rotulo: "Cotar a\nrede toda", icone: "grade", requer: "modelo", dica: "Cota a rede inteira que estiver à vista." },
          { id: "cota-numerar", rotulo: "Numerar\nrede", icone: "lista", requer: "modelo", dica: "Numera os tubos seguindo o encadeamento da rede (R01-T001…)." },
          { id: "cota-planilha", rotulo: "Planilha\nda rede", icone: "planilha", requer: "modelo", dica: "Baixa a relação dos tubos por ramal: número, comprimento e a conexão de cada ponta." },
          { id: "cota-limpar", rotulo: "Limpar\ncotas", icone: "lixeira", requer: "modelo", dica: "Apaga as cotas da rede." }
        ] },
        { nome: "Documentar", comandos: [
          { id: "cotas-auto", rotulo: "Cotas\nautomáticas", icone: "regua", grande: true, requer: "modelo", dica: "Gera as cadeias de cota da planta." },
          { id: "anotacao", rotulo: "Anotação", icone: "nota", tipo: "alterna", requer: "modelo", dica: "Marca um ponto do modelo com um texto." },
          { id: "foto", rotulo: "Foto da\nvista", icone: "camera", requer: "modelo", dica: "Captura a vista atual com carimbo para relatório." },
          { id: "pranchas", rotulo: "Pranchas\ndo projeto", icone: "prancha", grande: true, dica: "Folhas A0 a A4 com o carimbo da empresa e as vistas do modelo (com as cotas de cada ponto de vista) — e as pranchas que vieram no pacote da obra." }
        ] }
      ]
    },
    {
      id: "analisar", rotulo: "Analisar",
      paineis: [
        { nome: "Compatibilizar", comandos: [
          { id: "clash", rotulo: "Interfe-\nrências", icone: "clash", grande: true, requer: "modelo", dica: "Acha choque entre disciplinas: hidráulica x elétrica x estrutura." },
          { id: "planta", rotulo: "Planta\nbaixa", icone: "planta", grande: true, tipo: "alterna", requer: "modelo", dica: "Corta o modelo na altura da planta." },
          { id: "corte", rotulo: "Corte", icone: "corte", grande: true, tipo: "alterna", requer: "modelo", dica: "Plano de corte livre, em qualquer ângulo." },
          { id: "corte-tecnico", rotulo: "Corte\ntécnico", icone: "prancha", requer: "modelo", dica: "Vira o corte num desenho técnico em preto e branco, com hachura." }
        ] },
        { nome: "Tempo e custo", comandos: [
          { id: "quatro-d", rotulo: "4D\nSimulação", icone: "calendario", grande: true, requer: "modelo", dica: "A obra subindo dia a dia no calendário do cronograma (estilo TimeLiner): atividades, críticas, atrasos com o avanço real, filtros, curva S e o 3D em outra janela." },
          { id: "seis-d", rotulo: "6D/7D\nCiclo de vida", icone: "ciclo", grande: true, requer: "modelo", pro: true, dica: "Operação e manutenção do que foi construído." },
          { id: "curva-s", rotulo: "Curva S", icone: "grafico", requer: "modelo", dica: "Avanço planejado x real no tempo — no painel da Simulação 4D." }
        ] },
        { nome: "Canteiro", comandos: [
          { id: "estrutural", rotulo: "Projeto\nestrutural", icone: "estrutura", grande: true, dica: "Lê o PDF do projeto estrutural: a vista de cada sapata, pilar e viga como está no projeto, a armação, o cobrimento e a lista de material — para executar sem prancha." },
          { id: "detalhe-peca", rotulo: "Detalhe da\npeça", icone: "prancha", requer: "selecao", dica: "Abre o detalhe da peça selecionada no 3D (pelo carimbo OrcaPRO_Detalhe): a ficha do arquivo da obra — desenho, cálculo, prancha — ou a vista do projeto estrutural." },
          { id: "sondagem", rotulo: "Sondagem\n3D", icone: "niveis", grande: true, dica: "O boletim SPT dentro do sistema: o solo debaixo da obra em 3D, o relatório camada por camada com o plano descendo junto, e o simulador de até onde a estaca tem de ir para a carga do pilar." }
        ] }
      ]
    },
    {
      id: "quantitativos", rotulo: "Quantitativos",
      paineis: [
        { nome: "Levantar", comandos: [
          { id: "qto", rotulo: "Quantitativos\ndo modelo", icone: "calculadora", grande: true, requer: "modelo", dica: "Levanta as quantidades direto da geometria, por categoria." },
          { id: "eap", rotulo: "Gerar\norçamento", icone: "ia", grande: true, requer: "modelo", dica: "O agente monta a EAP e casa cada serviço com a base de preços — sem inventar código." },
          { id: "insumos-modelo", rotulo: "Insumos\ndo modelo", icone: "insumo", requer: "modelo", dica: "Todo insumo gasto: blocos, argamassa, graute, aço, tinta, cerâmica, rejunte." },
          { id: "req-bim", rotulo: "Requisitar\nmaterial", icone: "estoque", requer: "modelo", dica: "Levanta as peças do modelo por família, casa com o banco de insumos e monta a requisição de material." },
          { id: "familias", rotulo: "Banco de\nfamílias", icone: "tabela", dica: "Famílias salvas do modelo para reusar em qualquer projeto." }
        ] },
        { nome: "Conferir", comandos: [
          { id: "peso-total", rotulo: "Peso por\nnível", icone: "balanca", grande: true, requer: "modelo", dica: "Peso por parede, por nível e total." },
          { id: "rastrear", rotulo: "Rastrear no\norçamento", icone: "buscar", requer: "selecao", dica: "Do elemento 3D até a linha do orçamento — e de volta." }
        ] }
      ]
    },
    /* IÇAMENTO — o peso de cada peça é a base de tudo: guindaste e munck se
       escolhem pela carga. O plano de içamento (equipamento, posição, pontos
       de içamento, vento, simulação e o plano de rigging) entra por cima dele. */
    {
      id: "icamento", rotulo: "Içamento",
      paineis: [
        { nome: "Peso", comandos: [
          { id: "peso-pecas", rotulo: "Peso das\npeças", icone: "balanca", grande: true, requer: "modelo", dica: "Quanto pesa cada peça, em kg e em kN, e quanto ela representa do peso próprio da obra. Junta peças clicando no modelo ou por tipo e tira o relatório." },
          { id: "peso-coletar", rotulo: "Selecionar\nclicando", icone: "alvo", grande: true, tipo: "alterna", requer: "modelo", dica: "Ligado: cada clique numa peça do modelo entra (ou sai) da seleção de peso. Desligue para voltar a selecionar uma peça só." },
          { id: "peso-tipo", rotulo: "Selecionar\npor tipo", icone: "camadas", requer: "modelo", dica: "Todos os pilares, todos os vidros, todas as peças de um material ou de uma família — de uma vez." },
          { id: "peso-relatorio", rotulo: "Relatório\nde peso", icone: "planilha", requer: "modelo", dica: "Planilha e folha para imprimir: peso de cada peça, por tipo e da seleção, com a origem de cada número." }
        ] },
        { nome: "Plano de içamento", comandos: [
          { id: "icar-equipamento", rotulo: "Guindaste\ne munck", icone: "guindaste", grande: true, requer: "modelo", dica: "Escolhe o equipamento pela carga, pelo raio e pela altura, com a tabela de carga do fabricante." },
          { id: "icar-posicao", rotulo: "Posição do\nequipamento", icone: "caminhao", grande: true, requer: "modelo", dica: "Marca no projeto onde o guindaste ou o caminhão munck fica parado." },
          { id: "icar-pontos", rotulo: "Pontos de\niçamento", icone: "alvo", requer: "modelo", dica: "Onde vão as alças de içamento e por onde passa a linha de içamento de cada peça." },
          { id: "icar-vento", rotulo: "Vento no\nlocal", icone: "vento", requer: "modelo", dica: "Vento da cidade da obra pela NBR 6123, para liberar ou suspender o içamento." },
          { id: "icar-simular", rotulo: "Simular\niçamento", icone: "guindaste", requer: "modelo", dica: "O içamento passo a passo no 3D, com o equipamento modelado." },
          { id: "icar-plano", rotulo: "Plano de\nrigging", icone: "prancha", requer: "modelo", dica: "Memorial de cálculo, planilha de cargas, vistas e cortes, documentos do equipamento e do operador." }
        ] }
      ]
    },
    {
      id: "vista", rotulo: "Vista",
      paineis: [
        { nome: "Navegar", comandos: [
          { id: "home", rotulo: "Enquadrar\ntudo", icone: "casa", grande: true, requer: "modelo", dica: "Volta a ver o modelo inteiro." },
          { id: "orbita", rotulo: "Órbita", icone: "ciclo", grande: true, requer: "modelo", dica: "Gira em volta do modelo com o mouse (o modo de sempre). Sai do modo de voo." },
          { id: "voo", rotulo: "Modo de\nvoo", icone: "voo", grande: true, tipo: "alterna", requer: "modelo", dica: "Anda pelo modelo com o teclado, como num jogo." },
          { id: "mesa", rotulo: "Modo\nmesa", icone: "cadeado", grande: true, tipo: "alterna", requer: "modelo", dica: "Para o tablet ou a tela deitada na mesa: o 3D ocupa a tela, as ferramentas ficam numa barra ao lado e a câmera fica travada (encostar a mão não gira nem dá zoom)." },
          { id: "imersivo", rotulo: "Realidade\nvirtual", icone: "vr", grande: true, requer: "modelo", pro: true, dica: "Entra no modelo em escala 1:1, pelo celular ou visor." },
          { id: "ultra", rotulo: "Qualidade\nultra", icone: "estrela", tipo: "alterna", requer: "modelo", dica: "Nitidez máxima (usa mais a placa de vídeo)." }
        ] },
        { nome: "Exibir", comandos: [
          { id: "visibilidade", rotulo: "Visibilidade", icone: "olho", grande: true, requer: "modelo", dica: "Isola, oculta e usa raio-X na seleção." },
          { id: "pavimentos", rotulo: "Pavimentos", icone: "niveis", grande: true, requer: "modelo", dica: "Isola um pavimento do modelo importado." },
          { id: "sistemas", rotulo: "Cores por\nsistema", icone: "paleta", requer: "modelo", dica: "Pinta por sistema hidrossanitário ou disciplina." },
          { id: "conjuntos", rotulo: "Conjuntos\nde seleção", icone: "alvo", requer: "modelo", dica: "Monta \u201Ctubos de água fria do térreo\u201D por regra e usa isso no lugar de clicar peça por peça." },
          { id: "disciplinas", rotulo: "Disciplinas\ne etapas", icone: "camadas", grande: true, requer: "modelo", dica: "Só a fundação, só a armação, só os painéis de parede, só os pilares e vigas de madeira: filtra o modelo por disciplina ou etapa construtiva, com raio-X e cores." },
          { id: "estilo", rotulo: "Estilo de\nexibição", icone: "pincel", tipo: "menu", dica: "Sombreado, linhas, desenho técnico." },
          /* a caixa de corte da vista ativa, com as setas azuis nas seis faces */
          { id: "caixa-corte", rotulo: "Caixa de\ncorte", icone: "corte", grande: true, tipo: "alterna", requer: "modelo", dica: "Liga a caixa de corte da vista ativa: puxe as setas azuis de cada face para cortar o modelo de cima, de baixo e dos lados." },
          { id: "ortogonal", rotulo: "Ortogonal", icone: "grade", tipo: "alterna", requer: "modelo", dica: "Vista ortogonal (sem perspectiva) na vista ativa — também no botão direito do ViewCube." },
          /* textura por material (js/bimtextura.js): liga sozinho quando o IFC traz a textura dos materiais */
          { id: "materiais", rotulo: "Materiais\nrealistas", icone: "azulejo", tipo: "alterna", requer: "modelo", dica: "Veste as peças com a textura do material (tijolo, madeira, telha, concreto, porcelanato…) na escala real. Liga sozinho quando o IFC traz as texturas; usa mais a placa de vídeo." }
        ] },
        { nome: "Janelas", comandos: [
          { id: "nova-vista", rotulo: "Nova vista\n3D", icone: "mais", grande: true, requer: "modelo", dica: "Duplica a vista 3D numa aba nova, com câmera, caixa de corte e ViewCube próprios. A peça selecionada numa aparece em todas." },
          { id: "lado-a-lado", rotulo: "Vistas lado\na lado", icone: "grade", grande: true, tipo: "alterna", dica: "Mostra as vistas abertas lado a lado — para analisar o projeto de vários ângulos ao mesmo tempo." },
          { id: "tamanho-ui", rotulo: "Tamanho da\ninterface", icone: "expandir", dica: "Letras e botões do BIM menores ou maiores (100% → 90% → 80% → 110%). O 3D não muda." }
        ] },
        { nome: "Colaborar", comandos: [
          { id: "reuniao", rotulo: "Reunião no\nmodelo", icone: "obra", grande: true, requer: "modelo", pro: true, dica: "Várias pessoas dentro do mesmo modelo, com voz." },
          { id: "compartilhar", rotulo: "Compartilhar\nlink", icone: "link", requer: "modelo", dica: "Manda o modelo por link ou QR para abrir no celular." },
          { id: "vistas", rotulo: "Pontos de\nvista", icone: "camera", requer: "modelo", dica: "Salva o ângulo, o que está visível e o comentário — e exporta em BCF para o projetista abrir no Revit." },
          { id: "tarefas4d", rotulo: "Cronograma\n4D", icone: "calendario", requer: "modelo", dica: "A obra sobe com o SEU cronograma, não com o automático: datas previstas e reais, atraso sem piscar, e importação de CSV ou MS Project." }
        ] }
      ]
    }
  ];

  var Ribbon = {
    ABAS: ABAS,

    /* estado vivo — a cor do botão passa a ser CONSEQUÊNCIA disto, nunca a fonte */
    _st: { aba: "arquitetura", ativos: {}, desabilitados: {}, ctx: { modelo: false, selecao: false, obra: false, pro: false } },

    /* ---- leitura ---- */
    abas: function () {
      return ABAS.map(function (a) { return { id: a.id, rotulo: a.rotulo, tipo: a.tipo || "normal" }; });
    },
    abaAtiva: function () { return this._st.aba; },
    aba: function (id) {
      for (var i = 0; i < ABAS.length; i++) if (ABAS[i].id === id) return ABAS[i];
      return null;
    },
    comando: function (id) {
      for (var i = 0; i < ABAS.length; i++) {
        var ps = arr(ABAS[i].paineis);
        for (var j = 0; j < ps.length; j++) {
          var cs = arr(ps[j].comandos);
          for (var k = 0; k < cs.length; k++) {
            if (cs[k].id === id) return cs[k];
            var its = arr(cs[k].itens);
            for (var m = 0; m < its.length; m++) if (its[m].id === id) return its[m];
          }
        }
      }
      return null;
    },
    /* todos os ids, para o gate de RBAC e para os testes não deixarem comando órfão */
    ids: function () {
      var out = [];
      ABAS.forEach(function (a) {
        arr(a.paineis).forEach(function (p) {
          arr(p.comandos).forEach(function (c) {
            out.push(c.id);
            arr(c.itens).forEach(function (i) { out.push(i.id); });
          });
        });
      });
      return out;
    },

    /* ---- estado ---- */
    irPara: function (abaId) {
      if (!this.aba(abaId)) return false;
      this._st.aba = abaId; return true;
    },
    ativo: function (id) { return !!this._st.ativos[id]; },
    setAtivo: function (id, on) {
      var c = this.comando(id);
      if (!c) return false;
      /* "alterna" é o único tipo que guarda ligado/desligado; botão comum não fica aceso */
      if ((c.tipo || "botao") !== "alterna") return false;
      if (on) this._st.ativos[id] = true; else delete this._st.ativos[id];
      return true;
    },
    /* ferramentas que se excluem: ligar a trena desliga a área e o ângulo */
    _EXCLUSIVOS: ["medir", "area", "angulo", "parede", "piso", "pilar", "porta", "janela", "cobertura", "anotacao"],
    ligarExclusivo: function (id) {
      var self = this, mudou = false;
      this._EXCLUSIVOS.forEach(function (o) { if (o !== id && self._st.ativos[o]) { delete self._st.ativos[o]; mudou = true; } });
      if (this.setAtivo(id, true)) mudou = true;
      return mudou;
    },
    desligarTodas: function () {
      var self = this, n = 0;
      Object.keys(this._st.ativos).forEach(function (k) { delete self._st.ativos[k]; n++; });
      return n;
    },

    /* contexto: o que existe agora na tela (modelo aberto? algo selecionado? plano pago?) */
    setContexto: function (ctx) {
      var c = this._st.ctx;
      if (!ctx) return c;
      ["modelo", "selecao", "obra", "pro"].forEach(function (k) { if (ctx[k] != null) c[k] = !!ctx[k]; });
      return c;
    },
    contexto: function () { return this._st.ctx; },

    /* Um comando está disponível? Devolve o MOTIVO quando não está — a dica do
     * botão desabilitado explica o que fazer, em vez de só ficar cinza. */
    /* comando de PRÉVIA (`previa: "modelador"`, fases B2–B8): só aparece com a
       prévia ligada (js/bimprevia.js) — fora dela some da fita e da busca */
    visivel: function (c) {
      if (!c || !c.previa) return true;
      try { var P = global.BimPrevia; return !!(P && typeof P[c.previa] === "function" && P[c.previa]()); } catch (e) { return false; }
    },
    disponibilidade: function (id) {
      var c = this.comando(id);
      if (!c) return { ok: false, motivo: "Comando não existe." };
      if (!this.visivel(c)) return { ok: false, motivo: "Recurso em prévia — ligue a prévia do modelador." };
      if (this._st.desabilitados[id]) return { ok: false, motivo: this._st.desabilitados[id] };
      /* `emBreve` é o comando que ainda NÃO existe. Fica na fita de propósito
       * — é o roteiro do que vem, e o engenheiro precisa saber que está no
       * caminho — mas diz isso de frente, em vez de responder "ainda não está
       * disponível nesta versão" só depois do clique. */
      if (c.emBreve) return { ok: false, emBreve: true,
        motivo: "Ainda não está pronto — está no roteiro. Clique para ver o que já dá para fazer no lugar." };
      var ctx = this._st.ctx;
      if (c.pro && !ctx.pro) return { ok: false, motivo: "Disponível no plano PRO." };
      if (c.requer === "modelo" && !ctx.modelo) return { ok: false, motivo: "Abra ou gere um modelo primeiro." };
      if (c.requer === "selecao" && !ctx.selecao) return { ok: false, motivo: "Selecione um elemento no modelo (dois cliques)." };
      if (c.requer === "obra" && !ctx.obra) return { ok: false, motivo: "Escolha a obra no alto da tela." };
      return { ok: true, motivo: "" };
    },
    desabilitar: function (id, motivo) {
      if (!this.comando(id)) return false;
      if (motivo) this._st.desabilitados[id] = String(motivo); else delete this._st.desabilitados[id];
      return true;
    },

    /* ---- o que a camada de desenho consome ----
     * Devolve a aba inteira já resolvida: cada comando com ativo/disponível/motivo,
     * para o desenho ser burro (só pinta o que recebe). */
    /* DISCIPLINA (js/bimdisciplinas.js, 09/10/2026): com uma disciplina
       escolhida, a fita mostra só os comandos dela e os comuns — os outros
       SOMEM (não ficam cinza). Sem o motor de disciplinas, tudo aparece. */
    naDisciplina: function (c, abaId) {
      try { var D = global.BimDisciplinas; return !D || !c || D.mostra(c.id, abaId); } catch (e) { return true; }
    },
    /* as abas que a fita desenha: com disciplina, só as que têm algum comando
       à vista (com o nome da aba trocado quando a disciplina pede); em "Todas
       as disciplinas", exatamente as de `abas()` */
    abasVisiveis: function () {
      var self = this, D = global.BimDisciplinas, filtra = false;
      try { filtra = !!(D && D.filtrando()); } catch (e) { filtra = false; }
      if (!filtra) return this.abas();
      return ABAS.filter(function (a) {
        return a.tipo === "backstage" || arr(a.paineis).some(function (p) {
          return arr(p.comandos).some(function (c) { return self.visivel(c) && self.naDisciplina(c, a.id); });
        });
      }).map(function (a) { return { id: a.id, rotulo: D.rotuloAba(a.id, a.rotulo), tipo: a.tipo || "normal" }; });
    },
    render: function (abaId) {
      var self = this;
      var a = this.aba(abaId || this._st.aba);
      if (!a) return null;
      var ve = function (c) { return self.visivel(c) && self.naDisciplina(c, a.id); };
      return {
        id: a.id, rotulo: a.rotulo, tipo: a.tipo || "normal",
        paineis: arr(a.paineis).filter(function (p) { return arr(p.comandos).some(ve); }).map(function (p) {
          return {
            nome: p.nome,
            comandos: arr(p.comandos).filter(ve).map(function (c) {
              var d = self.disponibilidade(c.id);
              return {
                id: c.id, rotulo: str(c.rotulo), linhas: str(c.rotulo).split("\n"),
                icone: c.icone || "quadrado", dica: str(c.dica),
                tipo: c.tipo || "botao", grande: c.grande !== false && !!c.grande,
                pro: !!c.pro, ativo: self.ativo(c.id), habilitado: d.ok, motivo: d.motivo,
                emBreve: !!c.emBreve,
                itens: arr(c.itens).map(function (i) {
                  var di = self.disponibilidade(i.id);
                  return { id: i.id, rotulo: str(i.rotulo), icone: i.icone || "", dica: str(i.dica), ativo: self.ativo(i.id), habilitado: di.ok, motivo: di.motivo };
                })
              };
            })
          };
        })
      };
    },

    /* busca de comando pelo nome — alimenta o Ctrl+K dentro do BIM */
    buscar: function (termo) {
      var t = str(termo).toLowerCase().trim();
      if (!t) return [];
      var out = [], self = this;
      ABAS.forEach(function (a) {
        arr(a.paineis).forEach(function (p) {
          arr(p.comandos).forEach(function (c) {
            var alvo = (str(c.rotulo).replace(/\n/g, " ") + " " + str(c.dica) + " " + a.rotulo + " " + p.nome).toLowerCase();
            if (alvo.indexOf(t) >= 0 && self.visivel(c)) {
              out.push({ id: c.id, rotulo: str(c.rotulo).replace(/\n/g, " "), aba: a.id, abaRotulo: a.rotulo, painel: p.nome, habilitado: self.disponibilidade(c.id).ok });
            }
          });
        });
      });
      return out;
    },

    /* zera tudo (troca de obra, novo modelo) */
    limpar: function () {
      this._st.ativos = {}; this._st.desabilitados = {};
      this._st.ctx = { modelo: false, selecao: false, obra: false, pro: false };
      this._st.aba = "arquitetura";
    }
  };

  /* ===================================================================
   * B0/B1 — FITA ORGANIZADA (cara nova, prévia `?previa=visual`, 07/10/2026)
   * Pedido do Rogério: o BIM continua com cara de programa de projeto, mas com as abas
   * certas e NENHUM comando em dois lugares (PLANO-BIM-MODELADOR.md).
   *
   * Como: o mapa de cima continua sendo a fonte de cada comando (rótulo, ícone,
   * dica, tipo, requer). O LAYOUT_B1 só diz EM QUE ABA E PAINEL cada id mora;
   * `reorganizar` monta as abas novas reaproveitando os MESMOS objetos. Ele
   * recusa (e não troca nada) se um comando de hoje ficar de fora, se um id
   * aparecer duas vezes ou se o layout citar id que não existe — comando
   * perdido na reorganização é botão que o cliente usava e sumiu.
   * NOVOS = o que só existia na barra de título (Maximizar 3D, 3D em outra
   * janela, Quantitativo ilustrado), o que a B1 pede (Grade, Organizar
   * painéis, Estilo clássico) e o roteiro B2–B6 marcado "em breve".
   * `restaurar` volta ao mapa de sempre (prévia desligada).
   * =================================================================== */
  var ABAS_ORIG = ABAS, ABAS_BASE = ABAS;
  var B = function (id, rotulo, icone, dica) { return { id: id, rotulo: rotulo, icone: icone, grande: true, emBreve: true, dica: dica }; };
  Ribbon.NOVOS = {
    "viga": { id: "viga", rotulo: "Viga", icone: "estrutura", grande: true, dica: "Viga de dois cliques, seção 14 × 40, com o topo no topo da parede. Dá para digitar o comprimento. Volume e forma no quantitativo." },
    "fundacao": B("fundacao", "Fundação", "laje", "Sapata, bloco e estaca — fase B2 do modelador."),
    "tubo": B("tubo", "Tubo", "link", "Tubo por diâmetro e material, com inclinação — fase B5."),
    "conexao": B("conexao", "Conexão", "ciclo", "Joelho, tê e redução automáticos — fase B5."),
    "aparelho": B("aparelho", "Aparelho\nsanitário", "ambiente", "Louças, ralos e caixas — fase B5."),
    "eletroduto": B("eletroduto", "Eletroduto", "vento", "Eletrodutos, caixas e dutos — fase B5."),
    "extrusao": B("extrusao", "Extrusão", "bloco", "Qualquer contorno vira volume — fase B4."),
    "revolucao": B("revolucao", "Revolução", "ciclo", "Volume por giro de um perfil — fase B4."),
    "varredura": B("varredura", "Varredura", "regua", "Perfil que corre por um caminho — fase B4."),
    "unir": B("unir", "Unir", "mais", "Junta dois volumes num só — fase B4."),
    "subtrair": B("subtrair", "Subtrair", "corte", "Recorta um volume pelo outro — fase B4."),
    "empurrar": B("empurrar", "Empurrar\ne puxar", "expandir", "Puxa uma face, como no SketchUp — fase B4."),
    "templates": { id: "templates", rotulo: "Template\n.optpl", icone: "prancha", grande: true, dica: "Salvar este projeto como TEMPLATE OrçaPRO (.optpl: níveis, famílias, estilos das vistas) ou começar um projeto a partir de um." },
    "familias-param": { id: "familias-param", rotulo: "Famílias\nparamétricas", icone: "familia", grande: true, dica: "A biblioteca de famílias paramétricas (RA, suas e importadas): escolher o tipo, colocar no modelo, editar, exportar .opfam." },
    "editor-familia": { id: "editor-familia", rotulo: "Nova\nfamília", icone: "editar", grande: true, dica: "Criar uma família paramétrica: parâmetros de tipo e instância, fórmulas, tipos, geometria, vão e quantitativo." },
    "orc-modelo": { id: "orc-modelo", rotulo: "Orçamento\ndo modelo", icone: "calculadora", grande: true, dica: "O modelo já orçado: cada peça com composição SINAPI soma custo MO/MAT/EQ, horas de cada função, prazo com a equipe e peso — e o botão cria o orçamento da obra com os itens." },
    "componente": { id: "componente", rotulo: "Componente", icone: "familia", grande: true, dica: "Colocar uma família (mobiliário, louça, equipamento, pilar…). Escolha o tipo na biblioteca e clique no modelo." },
    "salvar-opbim": { id: "salvar-opbim", rotulo: "Salvar\n.opbim", icone: "salvar", grande: true, dica: "Salvar o PROJETO OrçaPRO (.opbim): o que foi modelado aqui, as famílias usadas, níveis, plantas e cortes e os IFC vinculados — um arquivo para mandar a outro usuário." },
    "abrir-opbim": { id: "abrir-opbim", rotulo: "Abrir\n.opbim", icone: "abrir", grande: true, dica: "Abrir um Projeto OrçaPRO (.opbim) recebido: entra o modelo, as famílias, os níveis e as vistas." },
    "importar-outros": { id: "importar-outros", rotulo: "Importar de\noutros programas", icone: "importar", grande: true, dica: "Revit, SketchUp, AutoCAD (DWG/DXF), glTF/GLB, OBJ, STL e IFC: o que dá para trazer de cada um e como." },
    "materiais-proj": B("materiais-proj", "Materiais\ndo projeto", "paleta", "Biblioteca de materiais do projeto — fase B6."),
    "planta-2d": { id: "planta-2d", rotulo: "Planta\nbaixa", icone: "planta", grande: true, requer: "modelo", dica: "Planta baixa em desenho técnico: o que o plano corta em linha grossa, o resto em linha fina, com cotas. Abre numa aba; os parâmetros ficam em Propriedades." },
    "corte-2d": { id: "corte-2d", rotulo: "Corte\nA, B, C…", icone: "corte", grande: true, requer: "modelo", dica: "Trace o corte com dois cliques na planta. Ele ganha a próxima letra, abre numa aba e fica em Navegador de projeto › Cortes." },
    "quant-ilustrado": { id: "quant-ilustrado", rotulo: "Quantitativo\nilustrado", icone: "tabela", grande: true, requer: "modelo", dica: "Caderno com a imagem de cada família, descrição, dimensões e quantidades do projeto inteiro." },
    "max-3d": { id: "max-3d", rotulo: "Só o 3D", icone: "expandir", grande: true, dica: "O 3D ocupa a tela inteira; as análises continuam na gaveta lateral. Esc volta." },
    "janela-3d": { id: "janela-3d", rotulo: "3D em outra\njanela", icone: "abrir", grande: true, dica: "Abre o 3D desta obra numa janela própria (2º monitor ou projetor)." },
    "grade": { id: "grade", rotulo: "Grade", icone: "grade", tipo: "alterna", dica: "Liga e desliga a grade do chão (tecla G)." },
    "paineis": { id: "paineis", rotulo: "Organizar\npainéis", icone: "camadas", grande: true, dica: "Põe Propriedades, Navegador e a janela da direita de volta no lugar e no tamanho padrão." },
    "pele-revit": { id: "pele-revit", rotulo: "Estilo clássico", icone: "revit", tipo: "alterna", dica: "Troca a pele do BIM para o cinza clássico (fita clara). Os comandos e os painéis são os mesmos." },
    /* IA (07/10/2026): família por IA (js/iafamilia.js) e render por IA (js/iarender.js) */
    "familia-ia": { id: "familia-ia", rotulo: "Família\npor IA", icone: "ia", grande: true, dica: "Descreva a peça ou anexe planta, corte, isométrico ou foto: a IA monta a família paramétrica, o OrçaPRO confere e ela abre no editor para você revisar e salvar." },
    "render-ia": { id: "render-ia", rotulo: "Renderizar\ncom IA", icone: "camera", grande: true, requer: "modelo", dica: "Render fotorrealista desta vista sem placa de vídeo: escreva o escopo (luz, paisagismo, materiais, objetos) e a IA mantém a geometria e o enquadramento. Ilustração, não projeto executivo." },
    "galeria-ia": { id: "galeria-ia", rotulo: "Galeria de\nrenders", icone: "prancha", grande: true, dica: "Os renders por IA desta obra: imagem, escopo, data, autor e modelo de IA; baixar em PNG com a marca de IA." },
    /* B8 (08/10/2026): modelagem por comando (js/iamodelar.js) — só na prévia do modelador */
    "modelar-ia": { id: "modelar-ia", rotulo: "Modelar por\ncomando", icone: "ia", grande: true, previa: "modelador", dica: "Escreva o que é para modelar (\u201Ccasa térrea 8 x 10 com 2 quartos, sala, cozinha e banheiro, laje e telhado 2 águas\u201D) ou anexe o croqui: a IA monta paredes, laje, cobertura, portas e janelas, o OrçaPRO confere e você vê a prévia antes de aplicar." }
  };
  /* na fita nova "Planta baixa" e "Corte" são o DESENHO técnico (planta-2d, corte-2d);
     os dois antigos são o recorte do 3D e ganham o nome do que fazem */
  /* comandos que na fita nova deixam de ser "em breve" (CÓPIA, o original fica) */
  Ribbon.SOBRE_B1 = {
    "porta": { emBreve: false, dica: "Porta hospedada: clique numa parede criada aqui — o vão abre e sai do quantitativo da parede. O tipo se escolhe na biblioteca de famílias." },
    "janela": { emBreve: false, dica: "Janela hospedada: clique numa parede criada aqui — o vão abre (com o peitoril) e sai do quantitativo da parede." },
    "cobertura": { emBreve: false, dica: "Cobertura de uma ou duas águas por dois cantos: inclinação, beiral e área INCLINADA no quantitativo." },
    /* estilo visual (07/10/2026): o menu dos quatro estilos (js/bimestilo.js) */
    "estilo": { rotulo: "Estilo\nvisual", dica: "Quatro estilos: linha oculta (preto e branco com as arestas), sombreado (a cor do material), textura e realista (relevo, brilho e sombra). Também no botão da barra das vistas.", requer: "modelo" }
  };
  Ribbon.ROTULOS_B1 = { "planta": "Plano de\ncorte 3D", "corte": "Corte 3D\nlivre" };
  /* MODELADOR (prévia `modelador`, js/bimprevia.js): o que cada fase B2–B8 tira
     do "em breve". Quem preenche é o módulo da fase (B5: js/biminstui.js); só
     vale com a prévia ligada — sem ela, a fita é a de antes. */
  Ribbon.SOBRE_MODELADOR = Ribbon.SOBRE_MODELADOR || {};

  /* B4 (volume livre) e B7 (IFC de saída) acrescentam as chaves delas no mesmo registro */
  (function (o) { for (var k in o) if (o.hasOwnProperty(k)) Ribbon.SOBRE_MODELADOR[k] = o[k]; })({
    /* B4 — volume livre (js/bimvolume.js) */
    "extrusao": { emBreve: false, tipo: "alterna", dica: "Extrusão: clique o contorno de qualquer forma no plano de trabalho, feche no 1º ponto (ou Enter) e ele sobe a altura do painel. Volume e área exatos no quantitativo." },
    "revolucao": { emBreve: false, tipo: "alterna", dica: "Revolução: clique o eixo, a direção do perfil e os pontos do perfil em pé; Enter gira (360° ou o ângulo do painel). Pilar torneado, vaso, cúpula." },
    "varredura": { emBreve: false, tipo: "alterna", dica: "Varredura: clique o caminho e o perfil do painel (retângulo ou círculo) corre por ele, com meia-esquadria nas dobras. Rodapé, mureta, meio-fio, tubo." },
    "unir": { emBreve: false, tipo: "alterna", dica: "Unir: clique um volume e depois outro — viram um só (o volume que sobrepõe não conta duas vezes)." },
    "subtrair": { emBreve: false, tipo: "alterna", dica: "Subtrair: clique o volume que vai ser recortado e depois o que recorta (ele some)." },
    "empurrar": { emBreve: false, tipo: "alterna", dica: "Empurrar e puxar, como no SketchUp: clique a face de um volume, mexa o mouse e clique — ou digite a distância (negativa empurra para dentro)." },
    /* P2-C — acabamento por ambiente (js/bimacabamento.js; o ambiente é o js/bimambiente.js) */
    "aplicar-ambiente": { emBreve: false, tipo: "alterna", dica: "Clique dentro de um cômodo fechado por paredes: o ambiente nasce (ou é escolhido) e, em Propriedades › Acabamentos, você escolhe piso, contrapiso, rodapé, parede e teto. As quantidades saem da fronteira do ambiente (rodapé sem as portas, parede por face sem os vãos) e as linhas entram no Orçamento do modelo." },
    /* B7 — IFC de saída (js/ifcsaida.js) */
    "exportar-ifc": { emBreve: false, rotulo: "Exportar IFC\ndo modelado", dica: "Gera um IFC4 com o que foi MODELADO aqui (paredes, lajes, pilares, vigas, coberturas, famílias, portas e janelas com o vão, volumes) com níveis, materiais, quantidades e o código de orçamento — para abrir no Revit e no CYPE. O IFC importado não entra: ele já é um IFC." },
    /* EMBREVE (09/10/2026) — os três que saíram do roteiro (js/bimembreveui.js).
       Igualar tipo É o "corresponder propriedades de tipo" da P4: um comando numa
       casa só (o Modificar não leva mais o dele — js/bimprecisao.js FITA). */
    "combinar": { emBreve: false, requer: null, dica: "Igualar tipo: clique a peça de ORIGEM (ou selecione antes) e depois cada peça que passa a ser do tipo dela — só da mesma categoria (parede com parede, laje com laje, pilar, viga, família da mesma família). Cada clique é um Ctrl+Z; Esc encerra." },
    "plano-trabalho": { emBreve: false, dica: "Plano de trabalho: onde o próximo elemento é desenhado — um nível com deslocamento, a face plana de uma peça (topo da laje, face da parede), um eixo ou linha de referência (plano vertical), ou o plano de outra peça. Mostra a grade do plano; o plano ativo aparece na barra de status." },
    "graute": { emBreve: false, dica: "Alvenaria estrutural: marque as paredes e o OrçaPRO põe o graute nos furos dos cantos, encontros, bordas de vão e a cada espaçamento máximo do projeto, com a armadura vertical. Volume (m³) e aço (kg) no Orçamento do modelo; espaçamento, transpasse e área do furo são parâmetros do projeto a conferir na NBR 16868-1." },
    /* MATERIAIS (09/10/2026) — o último do roteiro (js/bimmateriaisui.js, motor js/bimmateriais.js) */
    "materiais-proj": { emBreve: false, dica: "Os materiais desta obra: identidade (classe, fabricante, código SINAPI), gráficos (cor, transparência, padrões de superfície e de corte), aparência do render com a prévia e massa específica. Novo, duplicar, importar da biblioteca RA, substituir em todo o modelo e exportar ou importar a biblioteca (.json). Na peça, o campo Material de Propriedades." }
  });
  Ribbon.EXCLUSIVOS_MODELADOR = ["extrusao", "revolucao", "varredura", "unir", "subtrair", "empurrar", "aplicar-ambiente"];   /* P2-C: aplicar-ambiente */
  Ribbon.LAYOUT_B1 = [
    { id: "arquivo", rotulo: "Arquivo", tipo: "backstage", paineis: [
      { nome: "Projeto", ids: ["novo-projeto", "abrir-opbim", "abrir-ifc", "arquivo-obra", "exemplo"] },
      { nome: "Gerar e importar", ids: ["importar-outros", "gerar-volumetria", "p3d"] },
      { nome: "Salvar e enviar", ids: ["salvar-opbim", "salvar-modelo", "exportar-ifc", "exportar-revit"] }] },
    { id: "arquitetura", rotulo: "Arquitetura", paineis: [
      { nome: "Construir", ids: ["parede", "piso", "porta", "janela", "cobertura", "componente", "editor"] },
      { nome: "Tipo", ids: ["tipos-parede", "editar-tipo", "combinar"] },
      { nome: "Referência", ids: ["niveis", "nivel-atual", "plano-trabalho"] },
      { nome: "Por comando", ids: ["modelar-ia"] }] },
    { id: "alvenaria", rotulo: "Alvenaria", paineis: [
      { nome: "Bloco", ids: ["familia-bloco", "modular", "junta"] },
      { nome: "Paginação", ids: ["paginar-alvenaria", "elevacoes", "graute", "blocok"] },
      { nome: "Conferência", ids: ["conferir-modulacao", "peso-alvenaria"] }] },
    { id: "acabamentos", rotulo: "Acabamentos", paineis: [
      { nome: "Parede", ids: ["parede-cebola", "presets-acabamento", "aplicar-ambiente"] },
      { nome: "Piso e revestimento", ids: ["paginar-piso", "paginar-parede", "pranchas-paginacao"] }] },
    { id: "estrutura", rotulo: "Estrutura", paineis: [
      { nome: "Elementos", ids: ["pilar", "viga", "fundacao"] },
      { nome: "Projeto", ids: ["estrutural", "detalhe-peca", "sondagem"] }] },
    { id: "instalacoes", rotulo: "Instalações", paineis: [
      { nome: "Modelar", ids: ["tubo", "conexao", "aparelho", "eletroduto"] },
      { nome: "Rede (tubos)", ids: ["cota", "cota-iguais", "cota-todas", "cota-numerar", "cota-planilha", "cota-limpar"] }] },
    { id: "volume", rotulo: "Modelar volume", paineis: [
      { nome: "Criar", ids: ["extrusao", "revolucao", "varredura"] },
      { nome: "Combinar", ids: ["unir", "subtrair", "empurrar"] }] },
    { id: "anotar", rotulo: "Anotar", paineis: [
      { nome: "Medir", ids: ["medir", "area", "angulo", "snap", "limpar-medidas"] },
      { nome: "Documentar", ids: ["cotas-auto", "anotacao", "foto", "pranchas"] }] },
    { id: "analisar", rotulo: "Analisar", paineis: [
      { nome: "Desenho", ids: ["planta-2d", "corte-2d", "corte-tecnico"] },
      { nome: "Compatibilizar", ids: ["clash", "planta", "corte"] },
      { nome: "Tempo e custo", ids: ["quatro-d", "tarefas4d", "curva-s", "seis-d"] }] },
    { id: "quantitativos", rotulo: "Quantitativos", paineis: [
      { nome: "Levantar", ids: ["qto", "insumos-modelo", "quant-ilustrado", "peso-total"] },
      { nome: "Orçamento", ids: ["orc-modelo", "eap", "rastrear", "req-bim"] }] },
    { id: "icamento", rotulo: "Içamento", paineis: [
      { nome: "Peso", ids: ["peso-pecas", "peso-coletar", "peso-tipo", "peso-relatorio"] },
      { nome: "Plano de içamento", ids: ["icar-equipamento", "icar-posicao", "icar-pontos", "icar-vento", "icar-simular", "icar-plano"] }] },
    { id: "vista", rotulo: "Vista", paineis: [
      { nome: "Navegar", ids: ["home", "orbita", "voo", "mesa", "imersivo"] },
      { nome: "Exibir", ids: ["visibilidade", "pavimentos", "disciplinas", "sistemas", "conjuntos", "estilo", "materiais", "ultra", "caixa-corte", "ortogonal", "grade"] },
      { nome: "Janelas", ids: ["nova-vista", "lado-a-lado", "vistas", "max-3d", "janela-3d", "paineis", "tamanho-ui", "pele-revit"] },
      { nome: "Render por IA", ids: ["render-ia", "galeria-ia"] }] },
    { id: "gerenciar", rotulo: "Gerenciar", paineis: [
      { nome: "Biblioteca", ids: ["familias-param", "editor-familia", "familia-ia", "familias", "templates", "materiais-proj"] },
      { nome: "Modelos", ids: ["modelos", "remover-modelos"] },
      { nome: "Colaborar", ids: ["reuniao", "compartilhar"] }] }
  ];
  /* confere o layout contra o mapa de sempre; devolve o relatório sem trocar nada */
  Ribbon.conferirLayout = function (layout) {
    var idx = {}, orig = [], vistos = {}, rep = [], desc = [];
    ABAS_ORIG.forEach(function (a) { arr(a.paineis).forEach(function (p) { arr(p.comandos).forEach(function (c) { idx[c.id] = c; orig.push(c.id); }); }); });
    Object.keys(Ribbon.NOVOS).forEach(function (k) { idx[k] = Ribbon.NOVOS[k]; });
    arr(layout).forEach(function (a) { arr(a.paineis).forEach(function (p) { arr(p.ids).forEach(function (id) {
      if (vistos[id]) rep.push(id); vistos[id] = true; if (!idx[id]) desc.push(id);
    }); }); });
    var falt = orig.filter(function (id) { return !vistos[id]; });
    return { ok: !rep.length && !desc.length && !falt.length, repetidos: rep, desconhecidos: desc, faltando: falt, idx: idx };
  };
  /* `modelador` = a prévia do modelador ligada (padrão: pergunta ao BimPrevia
     do aparelho; o teste em Node passa explícito) */
  Ribbon.reorganizar = function (layout, opcoes) {
    var c = this.conferirLayout(layout || Ribbon.LAYOUT_B1);
    if (!c.ok) return { ok: false, repetidos: c.repetidos, desconhecidos: c.desconhecidos, faltando: c.faltando };
    var mod = opcoes && opcoes.modelador != null ? !!opcoes.modelador : !!(global.BimPrevia && global.BimPrevia.modelador && global.BimPrevia.modelador());
    var self = this;
    if (mod) Ribbon.EXCLUSIVOS_MODELADOR.forEach(function (id) { if (self._EXCLUSIVOS.indexOf(id) < 0) self._EXCLUSIVOS.push(id); });
    else this._EXCLUSIVOS = this._EXCLUSIVOS.filter(function (id) { return Ribbon.EXCLUSIVOS_MODELADOR.indexOf(id) < 0; });
    ABAS = arr(layout || Ribbon.LAYOUT_B1).map(function (a) {
      var o = { id: a.id, rotulo: a.rotulo, paineis: arr(a.paineis).map(function (p) { return { nome: p.nome, comandos: p.ids.map(function (id) {
        /* rótulo trocado só na fita nova: CÓPIA do comando, o original fica como era para o restaurar */
        var ro = Ribbon.ROTULOS_B1[id], so = Ribbon.SOBRE_B1[id], sm = mod ? Ribbon.SOBRE_MODELADOR[id] : null; if (!ro && !so && !sm) return c.idx[id];
        var cp = {}; Object.keys(c.idx[id]).forEach(function (k) { cp[k] = c.idx[id][k]; });
        if (ro) cp.rotulo = ro;
        if (so) Object.keys(so).forEach(function (k) { cp[k] = so[k]; });
        if (sm) Object.keys(sm).forEach(function (k) { cp[k] = sm[k]; });
        return cp;
      }) }; }) };
      if (a.tipo) o.tipo = a.tipo;
      return o;
    });
    Ribbon.ABAS = ABAS; ABAS_BASE = ABAS;
    if (!this.aba(this._st.aba)) this._st.aba = "arquitetura";
    return { ok: true, abas: ABAS.length };
  };
  Ribbon.restaurar = function () {
    ABAS = ABAS_ORIG; Ribbon.ABAS = ABAS; ABAS_BASE = ABAS;
    if (!this.aba(this._st.aba)) this._st.aba = "arquitetura";
    return true;
  };
  Ribbon.reorganizado = function () { return ABAS_BASE !== ABAS_ORIG; };   /* acrescentar (prévias) copia as abas, mas não reorganiza */
  /* PRÉVIAS (modelador B2+, js/bimprevia.js): põe comandos novos na fita
     ATUAL — a de sempre ou a reorganizada — sem tocar nos mapas fixos (o
     `conferirLayout` continua valendo para eles). Cria a aba/painel se faltar
     e PULA o id que já existe em qualquer aba: comando em dois lugares é o
     que o B0 proibiu. As abas são cópias rasas: o mapa de sempre não muda, e
     o próximo `reorganizar`/`restaurar` volta ao que era. */
  Ribbon.acrescentar = function (abaId, abaRotulo, painelNome, comandos, antesDe) {
    /* forma da B3 — acrescentar(abaId, {nome, comandos}): só na fita organizada; devolve
       {ok} / {ok, ja} / {ok:false, repetidos} (comando em duas casas é recusado inteiro) */
    if (abaRotulo && typeof abaRotulo === "object") {
      var painel = abaRotulo;
      if (ABAS_BASE === ABAS_ORIG) return { ok: false, motivo: "fita de sempre" };
      var a = this.aba(abaId); if (!a || !painel.nome || !arr(painel.comandos).length) return { ok: false, motivo: "aba ou painel inválido" };
      if (arr(a.paineis).some(function (p) { return p.nome === painel.nome; })) return { ok: true, ja: true };
      var ids = this.ids(), repet = arr(painel.comandos).filter(function (c) { return ids.indexOf(c.id) >= 0; }).map(function (c) { return c.id; });
      if (repet.length) return { ok: false, repetidos: repet };
      this.acrescentar(abaId, a.rotulo, painel.nome, painel.comandos);
      return { ok: true };
    }
    var self = this, novos = arr(comandos).filter(function (c) { return c && c.id && !self.comando(c.id); });
    if (!novos.length) return 0;
    ABAS = ABAS.map(function (a) { return { id: a.id, rotulo: a.rotulo, tipo: a.tipo, paineis: arr(a.paineis).map(function (p) { return { nome: p.nome, comandos: arr(p.comandos).slice() }; }) }; })
      .map(function (a) { if (!a.tipo) delete a.tipo; return a; });
    var aba = null;
    ABAS.forEach(function (a) { if (a.id === abaId) aba = a; });
    if (!aba) {
      aba = { id: abaId, rotulo: abaRotulo || abaId, paineis: [] };
      var ix = -1; ABAS.forEach(function (a, i) { if (a.id === antesDe) ix = i; });
      if (ix >= 0) ABAS.splice(ix, 0, aba); else ABAS.push(aba);
    }
    var pn = null;
    aba.paineis.forEach(function (p) { if (p.nome === painelNome) pn = p; });
    if (!pn) { pn = { nome: painelNome, comandos: [] }; aba.paineis.push(pn); }
    novos.forEach(function (c) { pn.comandos.push(c); });
    Ribbon.ABAS = ABAS;
    return novos.length;
  };

  global.BimRibbon = Ribbon;
  if (typeof module !== "undefined" && module.exports) module.exports = Ribbon;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
