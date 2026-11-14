/* =====================================================================
 * mor/catalogo-dados/intencoes.js — O DICIONÁRIO DE INTENÇÕES (DADOS, não código)
 *
 * Cada linha: [ "forma|forma|…", etapa, resposta, busca, tipo ]
 *   formas   como o texto livre escreve o termo (sem acento; plural e maiúscula são tratados pelo motor)
 *   etapa    id da etapa do CATÁLOGO que o termo ativa (ou "" = só reconhecido, sem etapa)
 *   resposta { idPergunta: valor } — resposta IMPLÍCITA às perguntas do catálogo (conferida pelo teste:
 *            a pergunta e o valor têm de existir em js/mor/catalogo.js); "_tipologia" fixa o tipo de obra
 *   busca    texto de busca para o casador (palavras que a BASE usa) — nunca um código
 *   tipo     S serviço · M material/variante · A ação · T tipologia · N ruído conhecido ·
 *            W palavra FRACA (genérica: «parede», «pilar» — reconhecida, mas só vira item se a frase não tem nada melhor)
 * Ligado a Escopo.SINONIMOS: toda chave daquele dicionário também é reconhecida (js/mor/intencoes.js
 * acrescenta as que faltam aqui, com a etapa inferida), e tools/test-mor-leitor.js cobra isso.
 * Nunca há código SINAPI neste arquivo.
 * ===================================================================== */
(function (global) {
  "use strict";
  var D = global.MorDados = global.MorDados || {};
  D.intencoes = [
    /* ---- tipologias ---- */
    ["residencia|casa|residencial|moradia|casa terrea|unifamiliar|sobrado", "", { _tipologia: "residencial_unifamiliar" }, "", "T"],
    ["edificio|predio|multifamiliar|condominio residencial|apartamentos", "", { _tipologia: "residencial_multifamiliar" }, "", "T"],
    ["loja|escritorio|sala comercial|comercial|clinica|consultorio|restaurante", "", { _tipologia: "comercial" }, "", "T"],
    ["galpao|barracao industrial|galpao industrial|armazem|deposito industrial", "", { _tipologia: "galpao_industrial" }, "", "T"],
    ["reforma|reformar|requalificacao|retrofit|adequacao", "", { _tipologia: "reforma" }, "", "T"],
    ["escola|creche|unidade de ensino|ensino infantil", "", { _tipologia: "escola_creche" }, "", "T"],
    ["quiosque|quiosque de madeira|pergolado", "", { _tipologia: "quiosque_madeira" }, "", "T"],
    ["muro de arrimo|contencao|arrimo|talude contido", "", { _tipologia: "muro_arrimo" }, "", "T"],
    ["pavimentacao|via urbana|rua|estacionamento|pavimentar", "", { _tipologia: "pavimentacao" }, "", "T"],
    /* ---- ações ---- */
    ["demolir|demolicao|derrubar|derrubada|quebrar", "demolicoes", {}, "demolicao", "A"],
    ["remover|remocao|retirar|retirada|desmontar|desmontagem", "demolicoes", {}, "remocao retirada", "A"],
    ["substituir|substituicao|trocar|troca|reposicao|repor", "", {}, "", "A"],
    ["executar|execucao|colocar|colocacao|fazer|construir|construcao|instalar|instalacao|assentar|assentamento|aplicar|aplicacao|fornecer|fornecimento|montar|montagem|implantar|implantacao|refazer", "", {}, "", "A"],
    ["recuperar|reparar|reparo|restaurar|consertar|conserto", "", {}, "", "A"],
    /* ---- preliminares ---- */
    ["canteiro|canteiro de obras|mobilizacao|desmobilizacao|instalacoes provisorias", "preliminares", {}, "canteiro de obras", "S"],
    ["tapume|fechamento provisorio", "preliminares", {}, "tapume", "S"],
    ["placa de obra|placa da obra", "preliminares", {}, "placa de obra", "S"],
    ["locacao|locacao da obra|gabarito", "preliminares", {}, "locacao gabarito", "S"],
    ["ligacao provisoria|energia provisoria|agua provisoria|barracao de obra", "preliminares", {}, "ligacao provisoria canteiro", "S"],
    ["art|rrt|anotacao de responsabilidade", "preliminares", {}, "art rrt", "S"],
    ["andaime|andaime fachadeiro", "preliminares", {}, "andaime", "S"],
    /* ---- terra ---- */
    ["escavacao|escavar|vala|abertura de valas", "movterra", {}, "escavacao", "S"],
    ["aterro|aterrar|reaterro|reaterrar", "movterra", {}, "aterro compactado", "S"],
    ["terraplanagem|terraplenagem|corte e aterro|nivelamento do terreno", "movterra", {}, "terraplenagem corte aterro", "S"],
    ["compactacao|compactar|compactacao de solo", "movterra", {}, "compactacao mecanica de solo", "S"],
    ["bota fora|transporte de terra|empolamento", "movterra", {}, "transporte de solo", "S"],
    /* ---- fundações ---- */
    ["fundacao|fundacoes|infraestrutura", "infra", {}, "fundacao", "S"],
    ["sapata|sapatas|sapata isolada|sapatas isoladas|sapata corrida|sapatas corridas", "infra", { "infra.tipo": "sapata" }, "sapata", "M"],
    ["estaca|estacas|broca|brocas|estaca broca|estaca escavada|estaca helice", "infra", { "infra.tipo": "estaca" }, "estaca", "M"],
    ["radier|radiers", "infra", { "infra.tipo": "radier" }, "radier", "M"],
    ["baldrame|baldrames|viga baldrame|vigas baldrame|viga de fundacao", "infra", {}, "baldrame", "S"],
    ["bloco de coroamento|blocos de coroamento|bloco de fundacao", "infra", {}, "bloco de coroamento", "S"],
    ["lastro|lastro de concreto|concreto magro", "infra", {}, "lastro concreto magro", "S"],
    ["impermeabilizacao de baldrame|pintura betuminosa", "infra", {}, "impermeabilizacao baldrame", "S"],
    /* ---- superestrutura ---- */
    ["superestrutura|estrutura de concreto|concreto armado", "super", {}, "concreto armado estrutura", "S"],
    ["pilar de concreto|pilares de concreto|viga de concreto|vigas de concreto|pilares em concreto|vigas em concreto", "super", {}, "pilar viga concreto", "S"],
    ["pilar|pilares|viga|vigas", "", {}, "pilar viga", "W"],
    ["vergas|verga|contraverga|cinta|cintas", "super", {}, "viga concreto", "S"],
    ["parede|paredes|muro existente", "", {}, "parede", "W"],
    ["teto|tetos", "", {}, "teto", "W"],
    ["laje pre moldada|laje premoldada|laje trelicada|laje de vigotas|vigota|vigotas|trelicada", "super", { "super.laje": "premoldada" }, "laje pre moldada", "M"],
    ["laje macica|laje de concreto armado|laje nervurada|laje", "super", {}, "laje concreto", "S"],
    ["forma|formas|formas de madeira|escoramento|cimbramento", "super", {}, "forma escoramento", "S"],
    ["armacao|armadura|ferragem|aco ca-50|ca 50|vergalhao", "super", {}, "armacao aco ca-50", "S"],
    ["concretagem|concreto usinado|concreto fck|fck", "super", {}, "concretagem", "S"],
    ["escada de concreto|escada", "super", {}, "escada concreto", "S"],
    /* ---- alvenaria ---- */
    ["alvenaria|alvenarias|vedacao|alvenaria de vedacao", "alvenaria", {}, "alvenaria de vedacao", "S"],
    ["bloco ceramico|blocos ceramicos|tijolo|tijolos|tijolo furado|tijolo baiano|bloco de vedacao", "alvenaria", {}, "alvenaria vedacao blocos ceramicos furados", "S"],
    ["bloco de concreto|blocos de concreto|bloco estrutural|alvenaria estrutural", "alvenaria", {}, "alvenaria bloco de concreto", "S"],
    ["bloco celular|concreto celular|ytong|bloco autoclavado", "alvenaria", { "alv.bloco": "celular15" }, "alvenaria bloco concreto celular", "M"],
    ["drywall|gesso acartonado|parede de gesso|divisoria de gesso|steel frame", "alvenaria", { "alv.drywall": true }, "drywall parede", "M"],
    ["verga de porta|verga de janela|cintamento", "alvenaria", {}, "verga", "S"],
    ["encunhamento|fixacao da alvenaria|aperto de alvenaria", "alvenaria", {}, "encunhamento alvenaria", "S"],
    ["tela de ligacao|tela de alvenaria|ferro de arranque", "alvenaria", {}, "tela alvenaria", "S"],
    /* ---- impermeabilização ---- */
    ["impermeabilizacao|impermeabilizar|impermeabilizante", "imperm", {}, "impermeabilizacao superficie", "S"],
    ["manta asfaltica|manta|manta liquida", "imperm", {}, "impermeabilizacao superficie manta asfaltica", "S"],
    ["argamassa polimerica|cristalizante|membrana acrilica", "imperm", {}, "impermeabilizacao argamassa polimerica", "S"],
    ["box|boxes|area molhada|areas molhadas", "imperm", {}, "impermeabilizacao area molhada", "S"],
    ["terraco|laje impermeabilizada|laje de cobertura impermeabilizada", "imperm", {}, "impermeabilizacao terraco", "S"],
    ["reservatorio impermeabilizado|caixa dagua|caixa d agua", "imperm", {}, "impermeabilizacao reservatorio", "S"],
    /* ---- cobertura ---- */
    ["cobertura|telhado|telhamento|telhar", "cobertura", {}, "telhado", "S"],
    ["telha ceramica|telhas ceramicas|telha colonial|telha portuguesa|telha de barro|telha romana", "cobertura", { "cob.tipo": "ceramica" }, "telhamento telha ceramica", "M"],
    ["telha de concreto|telhas de concreto", "cobertura", { "cob.tipo": "concreto" }, "telha de concreto", "M"],
    ["telha de fibrocimento|telha fibrocimento|telha ondulada|fibrocimento|eternit|brasilit", "cobertura", { "cob.tipo": "fibrocimento" }, "telha fibrocimento", "M"],
    ["telha metalica|telhas metalicas|telha de aco|telha zincada|telha galvanizada|telha trapezoidal|telha termoacustica|telha sanduiche|telha de zinco|zinco", "cobertura", { "cob.tipo": "metalica" }, "telha metalica", "M"],
    ["estrutura de madeira|madeiramento|tesoura de madeira|trama de madeira|caibro|caibros|ripa|ripas|terca de madeira", "cobertura", { "cob.estrutura": "madeira" }, "madeiramento telhado", "M"],
    ["estrutura metalica do telhado|tesoura metalica|tesoura de aco|terca metalica|trama metalica", "cobertura", { "cob.estrutura": "metalica" }, "tesoura aco telhado", "M"],
    ["calha|calhas|calha de chapa|calha galvanizada", "cobertura", { "cob.calha": true }, "calha", "M"],
    ["rufo|rufos|rufo galvanizado|contra rufo", "cobertura", { "cob.rufo": true }, "rufo", "M"],
    ["cumeeira|cumeeiras|espigao|espigoes", "cobertura", { "cob.cumeeira": true }, "cumeeira", "M"],
    ["beiral|beirais|oitao|platibanda", "cobertura", {}, "beiral", "S"],
    ["condutor pluvial|tubo de queda|descida de agua", "pluvial", {}, "condutor pluvial", "S"],
    ["laje de cobertura|cobertura em laje", "cobertura", { "cob.tipo": "laje" }, "laje cobertura", "M"],
    /* ---- revestimentos de parede ---- */
    ["revestimento|revestimentos|revestimento de parede", "revestimento", {}, "revestimento", "S"],
    ["chapisco|chapiscar|salpico", "revestimento", {}, "chapisco alvenaria", "S"],
    ["emboco|reboco|massa unica|massa fina|rebocar|embocar", "revestimento", {}, "emboco argamassa", "S"],
    ["revestimento ceramico|azulejo|azulejos|ceramica de parede|revestimento de parede ceramico|pastilha|pastilhas", "revestimento", {}, "revestimento ceramico paredes internas placas esmaltada", "S"],
    ["gesso liso|gesso projetado|reboco de gesso", "revestimento", {}, "gesso parede", "S"],
    ["textura|grafiato|massa corrida|massa acrilica|emassamento|emassar|selador|fundo selador", "revestimento", {}, "massa emassamento", "S"],
    ["rodape|rodapes|soleira|soleiras|peitoril|peitoris|filete", "pisos", {}, "rodape", "S"],
    /* ---- pisos ---- */
    ["piso|pisos|pavimento interno|revestimento de piso", "pisos", {}, "piso", "S"],
    ["porcelanato|porcelanatos|piso porcelanato", "pisos", { "piso.tipo": "porcelanato" }, "revestimento ceramico piso placas porcelanato", "M"],
    ["ceramica|piso ceramico|ceramico|piso de ceramica|ceramica esmaltada", "pisos", { "piso.tipo": "ceramica" }, "revestimento ceramico piso placas esmaltada", "M"],
    ["vinilico|piso vinilico|laminado|piso laminado|manta vinilica|piso de vinil", "pisos", { "piso.tipo": "vinilico" }, "piso vinilico", "M"],
    ["cimentado|piso cimentado|cimento queimado|queimado|piso de cimento|granilite", "pisos", { "piso.tipo": "cimentado" }, "piso cimentado", "M"],
    ["contrapiso|contrapisos|regularizacao do piso|regularizacao de base", "pisos", {}, "contrapiso argamassa", "S"],
    ["piso tatil|piso podotatil|podotatil", "acessibilidade", {}, "piso tatil", "S"],
    ["intertravado|bloquete|piso intertravado|paver", "pavimento", {}, "piso intertravado", "S"],
    /* ---- forro ---- */
    ["forro|forros|rebaixamento", "forro", {}, "forro", "S"],
    ["forro de gesso|forro em gesso|forro gesso|forro de gesso acartonado", "forro", { "forro.tipo": "gesso" }, "forro gesso", "M"],
    ["forro de pvc|forro em pvc|forro pvc", "forro", { "forro.tipo": "pvc" }, "forro reguas pvc", "M"],
    ["forro de madeira|forro em madeira|forro de lambri|lambri", "forro", { "forro.tipo": "madeira" }, "forro madeira", "M"],
    ["forro mineral|forro modular|forro de fibra mineral|forro de isopor", "forro", { "forro.tipo": "mineral" }, "forro mineral", "M"],
    ["forro de drywall|forro em drywall", "forro", { "forro.tipo": "drywall" }, "forro drywall", "M"],
    ["forro de laje|laje aparente", "forro", { "forro.tipo": "laje" }, "", "M"],
    /* ---- esquadrias ---- */
    ["esquadria|esquadrias|janela|janelas|vitro|basculante|veneziana", "esquadrias", {}, "janela", "S"],
    ["janela de aluminio|janelas de aluminio|esquadria de aluminio|aluminio|janela em aluminio|janelas em aluminio", "esquadrias", { "esq.janela": "aluminio" }, "janela aluminio vidro incluso", "M"],
    ["janela de aco|janelas de aco|esquadria de aco|janela metalica|janela em aco", "esquadrias", { "esq.janela": "aco" }, "janela aco", "M"],
    ["janela de madeira|janelas de madeira|esquadria de madeira|janela em madeira", "esquadrias", { "esq.janela": "madeira" }, "janela madeira", "M"],
    ["porta|portas|porta de madeira|porta interna|porta externa|batente|batentes|fechadura|fechaduras|dobradica|dobradicas", "esquadrias", {}, "porta", "S"],
    ["portao|portoes|portao de aco|portao de correr|portao basculante|portao de enrolar|porta de enrolar", "fechamentos", {}, "portao", "S"],
    ["vidro|vidros|vidro temperado|vidro liso|vidro laminado|espelho", "esquadrias", {}, "vidro", "S"],
    ["corrimao|corrimaos|guarda corpo|grade|grades|gradil", "esquadrias", {}, "guarda corpo corrimao", "S"],
    /* ---- pintura ---- */
    ["pintura|pintar|tinta|tintas|demao|demaos|duas demaos", "pintura", {}, "pintura latex acrilica paredes", "S"],
    ["latex|tinta latex|latex acrilica|tinta acrilica|acrilica|pva", "pintura", {}, "pintura latex acrilica paredes", "S"],
    ["esmalte|tinta esmalte|esmalte sintetico|tinta a oleo|verniz|stain", "pintura", {}, "pintura esmalte", "S"],
    ["pintura de teto|pintura do teto|pintura de forro", "pintura", {}, "pintura teto", "S"],
    ["pintura de piso|demarcacao|pintura de demarcacao", "pintura", {}, "pintura piso demarcacao", "S"],
    /* ---- elétrica ---- */
    ["instalacao eletrica|instalacoes eletricas|eletrica|rede eletrica|ponto eletrico|pontos eletricos", "eletrica", {}, "instalacao eletrica", "S"],
    ["tomada|tomadas|ponto de tomada|pontos de tomada|tue|tomadas de uso especifico", "eletrica", {}, "tomada baixa embutir", "S"],
    ["interruptor|interruptores|ponto de luz|pontos de luz|ponto de iluminacao|pontos de iluminacao|iluminacao", "eletrica", {}, "interruptor simples embutir", "S"],
    ["luminaria|luminarias|lampada|lampadas|led|refletor|refletores", "eletrica", {}, "luminaria", "S"],
    ["eletroduto|eletrodutos|conduite|conduites|eletrocalha|canaleta", "eletrica", {}, "eletroduto", "S"],
    ["cabo|cabos|fiacao|fio|fios|condutor eletrico|condutores eletricos", "eletrica", {}, "cabo cobre", "S"],
    ["quadro de distribuicao|quadro eletrico|quadro de luz|disjuntor|disjuntores|dps|diferencial", "eletrica", {}, "quadro distribuicao", "S"],
    ["entrada de energia|padrao de entrada|medidor|cabine de medicao|ramal de entrada", "eletrica", {}, "entrada de energia", "S"],
    ["aterramento|haste de aterramento|malha de terra", "spda", {}, "aterramento haste", "S"],
    ["chuveiro eletrico", "hidro", {}, "chuveiro eletrico fornecimento instalacao", "S"],
    ["gerador|grupo gerador|nobreak", "eletrica", {}, "gerador", "S"],
    ["cabeamento estruturado|rede de dados|ponto de rede|telefonia|interfone|cftv|alarme", "eletrica", {}, "cabeamento", "S"],
    /* ---- hidrossanitárias ---- */
    ["instalacao hidraulica|instalacoes hidraulicas|hidraulica|hidrossanitaria|hidrossanitarias|encanamento|tubulacao|tubulacoes", "hidro", {}, "tubulacao pvc agua", "S"],
    ["esgoto|esgotamento|esgoto sanitario|rede de esgoto|ramal de esgoto", "hidro", {}, "esgoto", "S"],
    ["ligado a rede publica|ligacao na rede|rede publica de esgoto|rede coletora|ligacao a rede", "hidro", { "esgoto.tipo": "rede" }, "ligacao rede esgoto", "M"],
    ["fossa|fossa septica|sumidouro|filtro anaerobio|tanque septico", "hidro", { "esgoto.tipo": "fossa" }, "fossa septica sumidouro", "M"],
    ["agua quente|aquecedor|aquecimento solar|boiler|aquecimento a gas|pressurizador", "hidro", { "hid.quente": true }, "agua quente", "M"],
    ["caixa de inspecao|caixa de gordura|caixa sifonada|caixa de passagem|poco de visita", "hidro", {}, "caixa de inspecao esgoto", "S"],
    ["vaso sanitario|bacia sanitaria|bacia|vaso|privada|assento sanitario", "hidro", {}, "bacia sanitaria", "S"],
    ["lavatorio|pia|pias|cuba|cubas|bancada|bancadas|tanque|tanques|mictorio|bide", "hidro", {}, "lavatorio pia cuba", "S"],
    ["torneira|torneiras|registro|registros|chuveiro|ducha|duchas|misturador|sifao|ralo|ralos|ralo sifonado", "hidro", {}, "torneira registro", "S"],
    ["reservatorio|caixa dagua de fibra|cisterna|hidrometro|cavalete|ramal predial", "hidro", {}, "reservatorio agua", "S"],
    ["joelho|joelhos|luva|luvas|conexao|conexoes|adaptador|tubo de pvc|tubos de pvc|tubo pvc|tubo em pvc|cano pvc|pvc soldavel|cpvc|ppr", "hidro", {}, "tubo pvc conexao", "S"],
    ["teste de estanqueidade|teste hidrostatico|teste de pressao", "hidro", {}, "teste estanqueidade", "S"],
    ["aguas pluviais|agua pluvial|drenagem pluvial|rede pluvial|caixa de areia|bueiro|boca de lobo", "pluvial", {}, "agua pluvial", "S"],
    /* ---- SPDA / incêndio / climatização / gás ---- */
    ["spda|para raios|pararaios|captor|captores|descida de spda|descidas", "spda", {}, "spda captor", "S"],
    ["incendio|combate a incendio|prevencao de incendio|extintor|extintores|hidrante|hidrantes|sprinkler|sprinklers|sinalizacao de emergencia|luz de emergencia|iluminacao de emergencia|alarme de incendio|saida de emergencia", "incendio", {}, "incendio extintor hidrante", "S"],
    ["ar condicionado|climatizacao|split|splits|exaustor|exaustao|ventilacao", "eletrica", {}, "ar condicionado split", "S"],
    ["gas|rede de gas|glp|central de gas|ponto de gas", "hidro", {}, "gas", "S"],
    /* ---- estrutura metálica / galpão / fechamentos ---- */
    ["estrutura metalica|estruturas metalicas|perfil metalico|perfis metalicos|perfil laminado|perfil soldado|perfil dobrado|aco estrutural|aco a572|astm a36", "estmetal", {}, "estrutura metalica", "S"],
    ["pilar metalico|pilares metalicos|viga metalica|vigas metalicas|terca|tercas|contraventamento|contraventada|tirante|tirantes|mao francesa|chumbador|chumbadores|chapa de base", "estmetal", {}, "estrutura metalica contraventamento", "S"],
    ["fechamento lateral|fechamento em telha|tapamento|tapamentos|fechamento de galpao|fechamento", "fechamentos", {}, "fechamento lateral telha", "S"],
    ["mureta|muretas|alvenaria ate|alvenaria de fechamento", "fechamentos", {}, "mureta alvenaria", "S"],
    ["piso industrial|piso de concreto industrial|concreto polido|juntas serradas|juntas de piso|junta serrada|endurecedor de superficie", "pisoind", {}, "piso industrial", "S"],
    ["madeira serrada|pergola|deck|deck de madeira|madeira de lei|madeira tratada", "estmadeira", {}, "estrutura de madeira", "S"],
    ["tratamento da madeira|cupinicida|fungicida|verniz da madeira|preservativo|imunizante", "trmadeira", {}, "tratamento madeira", "S"],
    /* ---- muro / contenção / pavimentação ---- */
    ["muro|muros|muro de fechamento|muro de divisa|muro de alvenaria|muro em alvenaria", "muro", { "mur.tipo": "alvenaria" }, "muro alvenaria", "M"],
    ["gabiao|gabioes|muro de gabiao|muro de gabioes", "muro", { "mur.tipo": "gabiao" }, "gabiao", "M"],
    ["muro de concreto|muro de arrimo em concreto|arrimo de concreto|cortina de concreto|parede diafragma", "muro", { "mur.tipo": "concreto" }, "muro concreto armado", "M"],
    ["dreno|drenos|drenagem|barbacas|manta geotextil|geotextil|brita de dreno", "murodren", {}, "drenagem muro", "S"],
    ["meio fio|sarjeta|sarjetas|guia|guias", "meiofio", {}, "meio fio sarjeta", "S"],
    ["sub base|base de brita|base granular|brita graduada|bgs|macadame", "pavimento", {}, "base brita graduada", "S"],
    ["cbuq|asfalto|concreto asfaltico|pavimento asfaltico|capa asfaltica|imprimacao|pintura de ligacao", "pavimento", { "pav.tipo": "cbuq" }, "cbuq", "M"],
    ["placa de sinalizacao|placas de sinalizacao|sinalizacao viaria|sinalizacao horizontal|sinalizacao vertical|faixa de pedestre", "sinalizacao", {}, "sinalizacao", "S"],
    ["calcada|calcadas|passeio|passeios|rampa|rampas|rampa de acessibilidade", "acessibilidade", {}, "calcada passeio", "S"],
    ["paisagismo|grama|gramado|plantio|jardim|jardins|arvore|arvores|muda|mudas|irrigacao", "areasext", {}, "grama paisagismo", "S"],
    ["alambrado|cerca|cercas|cerca de arame|portao de alambrado", "areasext", {}, "alambrado cerca", "S"],
    /* ---- demolição e final ---- */
    ["entulho|cacamba|cacambas|limpeza de entulho", "demolicoes", {}, "entulho cacamba", "S"],
    ["limpeza|limpeza final|limpeza geral|limpeza pos obra|limpeza de obra|entrega da obra|habite-se", "finais", {}, "limpeza final de obra", "S"],
    ["acessibilidade|banheiro adaptado|barra de apoio|barras de apoio|nbr 9050|pcd", "acessibilidade", {}, "acessibilidade barra de apoio", "S"],
    ["elevador|plataforma elevatoria|escada rolante", "", {}, "elevador", "S"],
    ["fachada|fachadas|pele de vidro|acm", "revestimento", {}, "revestimento fachada", "S"],
    ["projeto|projetos|memorial|memorial descritivo|especificacao|especificacoes|caderno de encargos|planilha orcamentaria|conforme projeto|abnt|nbr|norma tecnica|normas tecnicas", "", {}, "", "N"],
    ["prazo|prazo de execucao|cronograma|dias corridos|dias uteis|meses|medicao|medicoes", "", {}, "", "N"]
  ];
})(typeof window !== "undefined" ? window : globalThis);
