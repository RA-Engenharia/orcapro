/* =====================================================================
 * proptpl.js — MODELOS DE PROPOSTA: o layout vira cadastro
 *
 * POR QUE ISTO EXISTE (31/08/2026).
 * A proposta em PDF do sistema tinha UM layout, escrito no código: capa,
 * apresentação, escopo, incluso/excluso, condições. Bom, sóbrio — e igual
 * para todo mundo. Quem já vende com uma proposta desenhada (a carpintaria
 * que mandou a dela, feita no Canva, com foto sangrando na página e a conta
 * numa tabela navy) tinha de escolher entre o documento do sistema e o
 * documento da empresa dele. Escolhia o dele, e o sistema virava planilha.
 *
 * Aqui o layout deixa de ser código e vira CADASTRO: um modelo é uma lista
 * de páginas, cada página é um bloco com campos, e as fotos entram por
 * SLOTS NUMERADOS. A empresa monta o modelo dela uma vez, dá um nome, e usa
 * em toda proposta. Pode ter vários — um por tipo de cliente.
 *
 * ---------------------------------------------------------------------
 * AS QUATRO REGRAS QUE MANDAM AQUI
 * ---------------------------------------------------------------------
 *
 * 1. ⚠ O DINHEIRO NÃO É RECALCULADO AQUI. A conta que fecha (quantidade ×
 *    unitário = total da linha, Σ linhas = total da proposta, com os
 *    acréscimos distribuídos em centavos) já existe em `CarpProposta.blocos`.
 *    Este arquivo RECEBE esses números prontos e só os desenha. Refazer a
 *    conta num segundo lugar é como nascem os dois totais diferentes na
 *    mesma empresa — já aconteceu com o parser de número, em 33 módulos.
 *
 * 2. ⚠ CUSTO E MARGEM NÃO EXISTEM NESTE ARQUIVO. Nenhum bloco lê
 *    `custoUnit`, `margemPct` ou `vendaMadeira` cru. O que o modelo desenha
 *    é preço de venda, e só. A varredura de vazamento do `carpproposta.js`
 *    continua rodando POR CIMA do que sai daqui — modelo novo não pode virar
 *    porta de saída para o custo da empresa.
 *
 * 3. ⚠ OS BYTES DA FOTO NÃO MORAM NO REGISTRO. O modelo guarda a REFERÊNCIA
 *    (`{id, remoto, w, h}`, ~80 bytes), e os bytes vivem no IndexedDB e no
 *    servidor, pela mesma estrada do `js/fotos.js`. Foto em base64 dentro da
 *    entidade é o defeito que já parou a sincronização de um cliente para
 *    sempre, com a tela dizendo "Sincronizado".
 *
 * 4. ⚠ O SLOT É NUMERADO E ESTÁVEL. "Imagem 1" é imagem 1 para sempre: quem
 *    trocar a foto da capa troca o slot 1 e não mexe em mais nada. Ordenar
 *    por posição na página faria uma página nova no meio renumerar tudo e
 *    embaralhar as fotos de propostas já enviadas.
 * ===================================================================== */
(function (global) {
  "use strict";

  var PropTpl = {};

  function txt(v) { return String(v == null ? "" : v).trim(); }
  function num(v) { var n = +v; return isFinite(n) ? n : 0; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  /* quebra de linha do usuário vira <br>, e o resto continua escapado */
  function escML(s) { return esc(s).replace(/\r?\n/g, "<br>"); }
  function linhasDe(s) {
    return txt(s).split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
  }
  function moeda(v) {
    var n = num(v);
    return "R$ " + n.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }
  function n2(v) { return num(v).toFixed(2).replace(".", ","); }
  function dia(iso) {
    var s = txt(iso);
    return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4) : s;
  }

  /* =====================================================================
   * 1. OS BLOCOS
   *
   * Cada tipo de página declara o que o usuário preenche e quantas imagens
   * ela usa. A tela do editor é DESENHADA A PARTIR DAQUI — acrescentar um
   * bloco novo não exige tocar na tela.
   *
   * `imagens` é a QUANTIDADE de slots que o bloco consome. Os NÚMEROS dos
   * slots são atribuídos ao montar o modelo (ver `slots`), nunca aqui: o
   * bloco não sabe se é a primeira ou a quinta página.
   * ===================================================================== */
  PropTpl.BLOCOS = [
    {
      tipo: "capa",
      nome: "Capa",
      resumo: "Foto ocupando a página inteira, com o título por cima.",
      imagens: 1,
      campos: [
        { id: "titulo", nome: "Título", dica: "PROPOSTA", padrao: "PROPOSTA" },
        { id: "subtitulo", nome: "Segunda linha do título", dica: "PROJETO", padrao: "PROJETO" },
        { id: "chamada", nome: "Linha de apoio", dica: "Exclusivo em madeira | Sua Empresa" },
        { id: "mostrarCliente", nome: "Escrever o nome do cliente na capa", tipo: "sim_nao", padrao: true },
        { id: "mostrarNumero", nome: "Escrever o número e a data da proposta na capa", tipo: "sim_nao", padrao: false },
        { id: "mostrarLogo", nome: "Logo da empresa na capa", tipo: "sim_nao", padrao: true }
      ]
    },
    {
      tipo: "sobre",
      nome: "Quem somos",
      resumo: "Foto de fundo, título vazado e um parágrafo de apresentação.",
      imagens: 1,
      campos: [
        { id: "titulo", nome: "Título", padrao: "QUEM SOMOS" },
        { id: "texto", nome: "Texto", tipo: "multi", dica: "Duas a quatro linhas. Quem é a empresa e o que ela entrega." },
        { id: "mostrarLogo", nome: "Logo no topo", tipo: "sim_nao", padrao: true }
      ]
    },
    {
      tipo: "servicos",
      nome: "O que fazemos",
      resumo: "Título, uma frase de abertura e os serviços em cartões (título | descrição).",
      imagens: 0,
      campos: [
        { id: "titulo", nome: "Título", padrao: "O QUE FAZEMOS" },
        { id: "abertura", nome: "Frase de abertura", tipo: "multi", dica: "Uma ou duas linhas sobre como a empresa trabalha." },
        { id: "itens", nome: "Serviços", tipo: "multi", dica: "Uma linha por serviço: Título | descrição curta" },
        { id: "fechamento", nome: "Frase de fechamento", tipo: "multi" }
      ]
    },
    {
      tipo: "imagens",
      nome: "Galeria do projeto",
      resumo: "Título e até três imagens empilhadas — desenho, render, referência.",
      imagens: 3,
      campos: [
        { id: "titulo", nome: "Título", padrao: "O que inclui no projeto" },
        { id: "legenda", nome: "Legenda abaixo das imagens", tipo: "multi" }
      ]
    },
    {
      tipo: "texto",
      nome: "Escopo em texto",
      resumo: "Parágrafo de abertura, lista de itens e um bloco de observação.",
      imagens: 0,
      campos: [
        { id: "titulo", nome: "Título", padrao: "O que inclui no projeto" },
        { id: "abertura", nome: "Parágrafo de abertura", tipo: "multi" },
        { id: "rotuloLista", nome: "Frase antes da lista", padrao: "O escopo contempla:" },
        { id: "itens", nome: "Itens do escopo", tipo: "multi", dica: "Uma linha por item." },
        { id: "obsTitulo", nome: "Rótulo da observação", padrao: "Observação:" },
        { id: "observacao", nome: "Observação", tipo: "multi", dica: "O que NÃO está incluso costuma ir aqui — é o que evita discussão depois." },
        { id: "usarComercial", nome: "Com os campos acima vazios, usar o Incluso / Não incluso do orçamento", tipo: "sim_nao", padrao: false }
      ]
    },
    {
      tipo: "investimento",
      nome: "Investimento",
      resumo: "A tabela de preços da proposta, o total e a forma de pagamento.",
      imagens: 0,
      campos: [
        { id: "titulo", nome: "Título", padrao: "INVESTIMENTO" },
        { id: "colTrabalho", nome: "Nome da 1ª coluna", padrao: "Trabalho a executar" },
        { id: "colValor", nome: "Nome da 2ª coluna", padrao: "Investimento" },
        { id: "tituloPagamento", nome: "Título da forma de pagamento", padrao: "FORMA DE PAGAMENTO" },
        { id: "detalhar", nome: "Separar madeira e mão de obra em blocos", tipo: "sim_nao", padrao: false }
      ]
    },
    {
      tipo: "condicoes",
      nome: "Condições da entrega",
      resumo: "Parágrafos espaçados: garantia, compromisso, prazo, cronograma.",
      imagens: 0,
      campos: [
        { id: "titulo", nome: "Título", padrao: "CONDIÇÕES DA ENTREGA" },
        { id: "paragrafos", nome: "Parágrafos", tipo: "multi", dica: "Uma linha por parágrafo. Linha vazia vira espaço." },
        { id: "usarPrazo", nome: "Acrescentar o prazo de execução da proposta", tipo: "sim_nao", padrao: true },
        { id: "usarGarantia", nome: "Acrescentar a garantia da proposta", tipo: "sim_nao", padrao: true }
      ]
    },
    {
      tipo: "encerramento",
      nome: "Encerramento",
      resumo: "Foto de página inteira, logo grande e a frase de fechamento.",
      imagens: 1,
      campos: [
        { id: "frase", nome: "Frase de fechamento", tipo: "multi",
          dica: "Ex.: Estamos ansiosos para transformar o seu projeto em realidade." },
        { id: "mostrarLogo", nome: "Logo grande no centro", tipo: "sim_nao", padrao: true }
      ]
    },
    {
      tipo: "contato",
      nome: "Contato",
      resumo: "Uma foto da equipe e os canais de contato.",
      imagens: 1,
      campos: [
        { id: "titulo", nome: "Título", padrao: "DÚVIDAS?" },
        { id: "pessoas", nome: "Quem atende", dica: "Nome e nome" },
        { id: "redes", nome: "Rede social", dica: "@suaempresa" },
        { id: "telefone", nome: "Telefone", dica: "47 90000-0000" },
        { id: "site", nome: "Site ou link", dica: "www.suaempresa.com.br" },
        { id: "whatsapp", nome: "WhatsApp (só números, com DDD)", dica: "34999990000" },
        { id: "email", nome: "E-mail", dica: "contato@suaempresa.com.br" },
        { id: "endereco", nome: "Endereço", dica: "Rua, nº — Bairro — Cidade/UF" },
        { id: "usarEmpresa", nome: "Completar com os canais cadastrados em ⚙ Empresa", tipo: "sim_nao", padrao: true },
        { id: "textoZap", nome: "Texto do botão do WhatsApp", padrao: "Falar no WhatsApp" },
        { id: "botaoPlanilha", nome: "Botão para abrir a planilha da proposta (quando o orçamento tiver o link)", tipo: "sim_nao", padrao: true },
        { id: "mostrarFoto", nome: "Mostrar a foto da equipe", tipo: "sim_nao", padrao: true },
        { id: "textoBotao", nome: "Texto do botão da planilha", padrao: "Abrir a planilha desta proposta (Excel)" },
        { id: "molduraCelular", nome: "Mostrar a foto dentro de um celular", tipo: "sim_nao", padrao: true }
      ]
    },
    {
      tipo: "assinatura",
      nome: "Aceite e assinatura",
      resumo: "Validade, local e data, e as duas linhas de assinatura.",
      imagens: 0,
      campos: [
        { id: "titulo", nome: "Título", padrao: "ACEITE DA PROPOSTA" },
        { id: "texto", nome: "Texto do aceite", tipo: "multi",
          dica: "Ex.: A assinatura abaixo formaliza a aprovação do escopo e das condições acima." },
        { id: "mostrarValidade", nome: "Escrever a validade da proposta", tipo: "sim_nao", padrao: true }
      ]
    }
  ];

  PropTpl.bloco = function (tipo) {
    var t = txt(tipo);
    for (var i = 0; i < PropTpl.BLOCOS.length; i++) if (PropTpl.BLOCOS[i].tipo === t) return PropTpl.BLOCOS[i];
    return null;
  };

  /* =====================================================================
   * 2. TIPOGRAFIA E COR
   *
   * ⚠ FONTE DE SISTEMA, NÃO FONTE DA INTERNET. A proposta é impressa pelo
   *   navegador, e é impressa na hora em que o vendedor está com o cliente
   *   na frente — que costuma ser a hora com a pior internet do dia. Uma
   *   webfont que não carrega troca o desenho inteiro por Times New Roman,
   *   sem avisar. Cada par abaixo é uma PILHA com o que Windows, macOS e
   *   Android já têm instalado.
   * ===================================================================== */
  PropTpl.FONTES = [
    /* =====================================================================
     * OS PARES DE FONTE — título e texto, escolhidos juntos
     *
     * ⚠ NÃO É UMA LISTA DE FONTES, É UMA LISTA DE PARES. Deixar o usuário
     *   escolher título e texto separadamente parece mais liberdade e produz,
     *   na prática, proposta com Bebas Neue no título e Bebas Neue no corpo —
     *   ilegível em parágrafo. Cada linha aqui é uma combinação que funciona.
     *
     * ⚠ AS FAMÍLIAS SÃO EMBUTIDAS (css/fontes.css, base64, SIL OFL 1.1). O
     *   fallback do sistema fica depois na pilha para a máquina que, por
     *   algum motivo, não carregar a folha — melhor uma fonte parecida que
     *   um quadrado vazio.
     * =================================================================== */
    {
      id: "montserrat",
      nome: "Montserrat — geométrica, a mais usada em apresentação",
      exemplo: "Proposta",
      titulo: '"Montserrat", "Century Gothic", "Trebuchet MS", sans-serif',
      texto: '"Montserrat", "Century Gothic", "Trebuchet MS", sans-serif',
      pesoTitulo: 700
    },
    {
      id: "editorial",
      nome: "Editorial — serifada elegante no título, seca no texto",
      exemplo: "Proposta",
      titulo: '"Playfair Display", Georgia, "Times New Roman", serif',
      texto: '"Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif',
      pesoTitulo: 700
    },
    {
      id: "impacto",
      nome: "Impacto — condensada alta, para capa que grita",
      exemplo: "PROPOSTA",
      titulo: '"Bebas Neue", "Oswald", "Arial Narrow", Impact, sans-serif',
      texto: '"Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif',
      pesoTitulo: 400
    },
    {
      id: "condensada",
      nome: "Condensada — títulos pesados",
      exemplo: "PROPOSTA",
      titulo: '"Oswald", "Arial Narrow", "Franklin Gothic Medium", sans-serif',
      texto: '"Source Sans 3", "Segoe UI", "Helvetica Neue", Arial, sans-serif',
      pesoTitulo: 500
    },
    {
      id: "bloco",
      nome: "Bloco — título maciço, para marca forte",
      exemplo: "PROPOSTA",
      titulo: '"Archivo Black", "Arial Black", Impact, sans-serif',
      texto: '"Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif',
      pesoTitulo: 400
    },
    {
      id: "classica",
      nome: "Clássica — serifada dos dois lados, sóbria",
      exemplo: "Proposta",
      titulo: '"Playfair Display", Georgia, "Times New Roman", serif',
      texto: '"Lora", Georgia, "Times New Roman", serif',
      pesoTitulo: 700
    },
    {
      id: "tecnica",
      nome: "Técnica — neutra, para documento de engenharia",
      exemplo: "Proposta",
      titulo: '"IBM Plex Sans", "Segoe UI", Arial, sans-serif',
      texto: '"IBM Plex Sans", "Segoe UI", Arial, sans-serif',
      pesoTitulo: 600
    },
    {
      id: "geometrica",
      nome: "Geométrica — moderna e redonda",
      exemplo: "Proposta",
      titulo: '"Montserrat", "Century Gothic", "Futura", "Trebuchet MS", sans-serif',
      texto: '"Source Sans 3", "Segoe UI", "Helvetica Neue", Arial, sans-serif',
      pesoTitulo: 600
    },
    {
      id: "mista",
      nome: "Mista — título serifado, texto seco",
      exemplo: "Proposta",
      titulo: '"Lora", Georgia, "Times New Roman", serif',
      texto: '"Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif',
      pesoTitulo: 400
    }
  ];

  PropTpl.fonte = function (id) {
    var f = txt(id);
    for (var i = 0; i < PropTpl.FONTES.length; i++) if (PropTpl.FONTES[i].id === f) return PropTpl.FONTES[i];
    return PropTpl.FONTES[0];
  };

  /* texturas de fundo desenhadas em SVG — sem imagem para baixar, e elas
     imprimem igual em qualquer máquina */
  PropTpl.TEXTURAS = [
    { id: "", nome: "Cor sólida" },
    { id: "madeira", nome: "Veio de madeira" },
    { id: "linho", nome: "Linho" },
    { id: "papel", nome: "Papel" }
  ];

  function texturaCss(id, cor) {
    var c = encodeURIComponent(txt(cor) || "#000000");
    if (id === "madeira") {
      /* anéis concêntricos irregulares, bem apagados: lê como madeira e não
         briga com o texto por cima */
      return "background-image:url(\"data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='420' height='620'%3E%3Cg fill='none' stroke='" + c + "' stroke-opacity='.14' stroke-width='2'%3E%3Cellipse cx='210' cy='310' rx='40' ry='90'/%3E%3Cellipse cx='210' cy='310' rx='78' ry='150'/%3E%3Cellipse cx='210' cy='310' rx='120' ry='220'/%3E%3Cellipse cx='210' cy='310' rx='168' ry='300'/%3E%3Cellipse cx='210' cy='310' rx='215' ry='390'/%3E%3Cellipse cx='210' cy='310' rx='268' ry='480'/%3E%3C/g%3E%3C/svg%3E\");background-size:420px 620px";
    }
    if (id === "linho") {
      return "background-image:url(\"data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8'%3E%3Cg stroke='" + c + "' stroke-opacity='.10' stroke-width='1'%3E%3Cpath d='M0 0h8M0 4h8'/%3E%3Cpath d='M0 0v8M4 0v8'/%3E%3C/g%3E%3C/svg%3E\");background-size:8px 8px";
    }
    if (id === "papel") {
      return "background-image:url(\"data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60'%3E%3Cg fill='" + c + "' fill-opacity='.05'%3E%3Ccircle cx='7' cy='11' r='1'/%3E%3Ccircle cx='31' cy='4' r='1'/%3E%3Ccircle cx='49' cy='22' r='1'/%3E%3Ccircle cx='19' cy='38' r='1'/%3E%3Ccircle cx='42' cy='51' r='1'/%3E%3Ccircle cx='11' cy='55' r='1'/%3E%3C/g%3E%3C/svg%3E\");background-size:60px 60px";
    }
    return "";
  }
  PropTpl._texturaCss = texturaCss;

  /* =====================================================================
   * 3. O MODELO — normalização
   *
   * Tudo que a tela e o desenho leem passa por aqui primeiro. Modelo vindo
   * de outro aparelho, de uma versão anterior ou de um import mal feito
   * entra com campo faltando; a normalização decide UMA vez o que é o
   * padrão, em vez de cada bloco decidir por conta.
   * ===================================================================== */
  /* =====================================================================
   * TIPOGRAFIA POR PÁGINA — o que o usuário ajusta sem sair do sistema
   *
   * ⚠ POR PÁGINA, NÃO POR MODELO. Uma capa quer título centralizado e enorme;
   *   a página de escopo quer texto justificado e corrido. Um único ajuste
   *   para o documento inteiro obriga a escolher qual das duas fica errada —
   *   e é aí que a pessoa exporta para outro programa para "arrumar".
   *
   * ⚠ TUDO EM PORCENTAGEM DO PADRÃO, não em pixel. O documento é impresso em
   *   A4 e também aberto na vertical do celular: um "18px" que fica bom numa
   *   folha fica minúsculo na outra. A escala preserva a proporção que o
   *   desenho do bloco já tem.
   *
   * ⚠ E O JUSTIFICADO SÓ VALE PARA TEXTO CORRIDO. Justificar um título de
   *   duas palavras abre um vão enorme entre elas; por isso o alinhamento do
   *   título não oferece essa opção.
   * =================================================================== */
  PropTpl.ALINHAMENTOS = [
    { id: "esquerda", nome: "À esquerda", css: "left" },
    { id: "centro", nome: "Centralizado", css: "center" },
    { id: "direita", nome: "À direita", css: "right" },
    { id: "justificado", nome: "Justificado", css: "justify", soTexto: true }
  ];

  var TIPO_PADRAO = {
    alinhaTitulo: "",      /* "" = como o modelo do bloco desenha */
    alinhaTexto: "",
    escalaTitulo: 100,     /* % do tamanho que o bloco já usa */
    escalaTexto: 100,
    entrelinha: 100,       /* % da altura de linha */
    espacoLetra: 0,        /* centésimos de em: 5 = 0.05em */
    caixaAltaTitulo: false
  };

  function alinhamento(id, permitirJustificado) {
    var a = null;
    for (var i = 0; i < PropTpl.ALINHAMENTOS.length; i++) {
      if (PropTpl.ALINHAMENTOS[i].id === txt(id)) { a = PropTpl.ALINHAMENTOS[i]; break; }
    }
    if (!a) return "";
    if (a.soTexto && !permitirJustificado) return "";
    return a.css;
  }

  function pct(v, padrao, min, max) {
    var n = num(v);
    if (!n) return padrao;
    return Math.max(min, Math.min(max, n));
  }

  /* =====================================================================
   * LINHAS E SÍMBOLOS — o acabamento que hoje é cravado no código
   *
   * ⚠ A RÉGUA JÁ EXISTIA E NINGUÉM PODIA MEXER. `.tp-rule` é um traço de
   *   1,4 px sob o título, em sete páginas do documento. Para uma empresa que
   *   quer um documento mais leve ela é grossa demais; para outra, que quer
   *   marca forte, é invisível. Era o tipo de detalhe que fazia a pessoa
   *   exportar o PDF e "arrumar" em outro programa.
   *
   * ⚠ E O MARCADOR DA LISTA SAÍA SEMPRE COMO BOLINHA. Numa proposta de
   *   escopo, o "✓" diz outra coisa: cada linha é algo que ESTÁ INCLUÍDO. A
   *   bolinha é neutra; o símbolo é argumento de venda.
   * =================================================================== */
  PropTpl.REGUAS = [
    { id: "", nome: "Como o modelo desenha" },
    { id: "fina", nome: "Traço fino" },
    { id: "grossa", nome: "Traço grosso" },
    { id: "dupla", nome: "Linha dupla" },
    { id: "tracejada", nome: "Tracejada" },
    { id: "pontilhada", nome: "Pontilhada" },
    { id: "nenhuma", nome: "Sem linha" }
  ];
  PropTpl.LARGURAS_REGUA = [
    { id: "", nome: "Como o modelo desenha", css: "" },
    { id: "curta", nome: "Curta", css: "24mm" },
    { id: "media", nome: "Média", css: "60mm" },
    { id: "inteira", nome: "Largura inteira", css: "100%" }
  ];
  PropTpl.CORES_ELEMENTO = [
    { id: "", nome: "Como o modelo desenha", css: "" },
    { id: "titulo", nome: "Cor do título", css: "var(--tp-titulo)" },
    { id: "destaque", nome: "Cor de destaque", css: "var(--tp-destaque)" },
    { id: "texto", nome: "Cor do texto", css: "var(--tp-texto)" }
  ];
  /* ⚠ SÍMBOLO É TEXTO, NÃO IMAGEM: entra no PDF sem depender de arquivo, de
     fonte de ícone nem de internet, e o navegador imprime igual. */
  PropTpl.MARCADORES = [
    { id: "", nome: "Como o modelo desenha", css: "" },
    { id: "ponto", nome: "• Bolinha", css: "'\\2022  '" },
    { id: "traco", nome: "– Travessão", css: "'\\2013  '" },
    { id: "quadrado", nome: "▪ Quadradinho", css: "'\\25AA  '" },
    { id: "check", nome: "✓ Confere", css: "'\\2713  '" },
    { id: "seta", nome: "→ Seta", css: "'\\2192  '" },
    { id: "losango", nome: "◆ Losango", css: "'\\25C6  '" },
    { id: "numero", nome: "1. Numerado", css: "decimal" },
    { id: "nenhum", nome: "Sem marcador", css: "none" }
  ];

  /* =====================================================================
   * QUAL PAGINA SABE DESENHAR O QUE — medido, nao suposto
   *
   * ⚠ SO 5 DAS 9 PAGINAS TEM REGUA, e a lista com marcador existe numa
   *   unica: a de Texto. Oferecer "marcador dos itens" na capa e um controle
   *   que a pessoa mexe e nada acontece — e um controle assim ensina a
   *   desconfiar de todos os outros da tela. Pior: ela conclui que o recurso
   *   nao funciona e para de usar o que funciona.
   *
   * ⚠ ESTA TABELA E CONFERIDA CONTRA O HTML DE VERDADE em
   *   `tools/test-proptpl.js`: cada pagina e renderizada e o teste compara o
   *   que ela declara aqui com o que ela realmente desenha. Mudou o desenho
   *   de um bloco e ninguem lembrou desta tabela, o teste reprova aqui —
   *   em vez de o cliente descobrir mexendo num controle morto.
   * =================================================================== */
  PropTpl.FORMAS_DO_BLOCO = {
    capa:         { regua: false, marcador: false },
    sobre:        { regua: false, marcador: false },
    servicos:     { regua: true,  marcador: false },
    imagens:      { regua: true,  marcador: false },
    texto:        { regua: true,  marcador: true },
    investimento: { regua: false, marcador: false },
    condicoes:    { regua: true,  marcador: false },
    encerramento: { regua: false, marcador: false },
    contato:      { regua: true,  marcador: false },
    assinatura:   { regua: true,  marcador: false }
  };
  PropTpl.formasDoBloco = function (tipo) {
    var d = PropTpl.FORMAS_DO_BLOCO[txt(tipo)];
    return d ? { regua: d.regua, marcador: d.marcador }
             : { regua: false, marcador: false };
  };

  function _acha(lista, id) {
    for (var i = 0; i < lista.length; i++) if (lista[i].id === txt(id)) return lista[i];
    return null;
  }

  var FORMAS_PADRAO = { regua: "", reguaLargura: "", reguaCor: "", marcador: "" };

  function formas(f) {
    var d = f || {};
    function so(lista, v) { return _acha(lista, v) ? txt(v) : ""; }
    return {
      regua: so(PropTpl.REGUAS, d.regua),
      reguaLargura: so(PropTpl.LARGURAS_REGUA, d.reguaLargura),
      reguaCor: so(PropTpl.CORES_ELEMENTO, d.reguaCor),
      marcador: so(PropTpl.MARCADORES, d.marcador)
    };
  }
  PropTpl.formas = formas;

  /* ⚠ AS ASPAS DE NOVO. O style= da <section> e delimitado por aspas DUPLAS:
     um simbolo escrito como "¹3  " fecharia o atributo no meio e o resto
     do estilo viraria lixo no HTML. Foi exatamente o que apagou o seletor de
     fonte antes de aspaSimples() existir — e a lista voltava com bolinha sem
     ninguem entender por que. Aqui a tabela ja usa aspas simples; esta linha e
     a rede embaixo, para o dia em que alguem acrescentar um simbolo novo. */
  function estiloFormas(f) {
    var s = [];
    if (f.regua === "nenhuma") s.push("--tp-rg-disp:none");
    else if (f.regua === "fina") { s.push("--tp-rg-h:1px"); s.push("--tp-rg-borda:none"); }
    else if (f.regua === "grossa") { s.push("--tp-rg-h:4px"); s.push("--tp-rg-borda:none"); }
    else if (f.regua === "dupla") { s.push("--tp-rg-h:0"); s.push("--tp-rg-borda:double"); s.push("--tp-rg-bw:4px"); }
    else if (f.regua === "tracejada") { s.push("--tp-rg-h:0"); s.push("--tp-rg-borda:dashed"); s.push("--tp-rg-bw:2px"); }
    else if (f.regua === "pontilhada") { s.push("--tp-rg-h:0"); s.push("--tp-rg-borda:dotted"); s.push("--tp-rg-bw:2px"); }

    var lg = _acha(PropTpl.LARGURAS_REGUA, f.reguaLargura);
    if (lg && lg.css) s.push("--tp-rg-w:" + lg.css);
    var cor = _acha(PropTpl.CORES_ELEMENTO, f.reguaCor);
    if (cor && cor.css) s.push("--tp-rg-cor:" + cor.css);
    var mk = _acha(PropTpl.MARCADORES, f.marcador);
    if (mk && mk.css) s.push("--tp-mk:" + mk.css);
    return aspaSimples(s.join(";"));
  }

  function tipografia(tp) {
    var d = tp || {};
    return {
      alinhaTitulo: txt(d.alinhaTitulo),
      alinhaTexto: txt(d.alinhaTexto),
      escalaTitulo: pct(d.escalaTitulo, 100, 60, 180),
      escalaTexto: pct(d.escalaTexto, 100, 70, 160),
      entrelinha: pct(d.entrelinha, 100, 80, 200),
      espacoLetra: Math.max(-5, Math.min(40, num(d.espacoLetra))),
      caixaAltaTitulo: !!d.caixaAltaTitulo
    };
  }
  PropTpl.tipografia = tipografia;

  /* as variáveis CSS que a página recebe; vazio quando nada foi mudado */
  function estiloTipografia(tp) {
    var s = [];
    var at = alinhamento(tp.alinhaTitulo, false);
    var ax = alinhamento(tp.alinhaTexto, true);
    if (at) s.push("--tp-al-tit:" + at);
    if (ax) s.push("--tp-al-txt:" + ax);
    if (tp.escalaTitulo !== 100) s.push("--tp-esc-tit:" + (tp.escalaTitulo / 100));
    if (tp.escalaTexto !== 100) s.push("--tp-esc-txt:" + (tp.escalaTexto / 100));
    if (tp.entrelinha !== 100) s.push("--tp-lh:" + (tp.entrelinha / 100));
    if (tp.espacoLetra) s.push("--tp-ls:" + (tp.espacoLetra / 100) + "em");
    if (tp.caixaAltaTitulo) s.push("--tp-cx-tit:uppercase");
    return s.join(";");
  }

  var ESTILO_PADRAO = {
    corTitulo: "#1B2A5B",
    corTexto: "#2A2A2A",
    corFundo: "#FFFFFF",
    corDestaque: "#B3202E",
    corFundoEscuro: "#5C3A1E",
    textura: "",
    fonte: "condensada",
    formato: "a4",
    /* ---- acrescentados com o modelo "Engenharia moderno" ----
       corDestaque2: segunda cor de destaque (curvas, botões). Vazio = corDestaque.
       ornamento:    "" | "curvas" — traços curvos da marca nas capas e nos cantos.
       rodape:       "" | "contatos" — rodapé com os canais da empresa, clicáveis no PDF.
       fundoInternas:"" | "claro" — "claro" tira o fundo escuro de escopo/condições. */
    corDestaque2: "",
    ornamento: "",
    rodape: "",
    fundoInternas: "",
    /* ⚠ LOGO ESCURO EM PÁGINA ESCURA SOME — e some sem erro nenhum: a capa
       imprime, o arquivo abre, e a marca simplesmente não está lá. O logo da
       maioria das construtoras é azul-marinho, e a capa cheia é escura por
       definição (foto com sombra, ou o fundo da marca).
         ""         — desenha como veio (o que sempre foi; não mexe em modelo pronto)
         "clarear"  — versão negativa: o logo vira branco só nas páginas cheias
         "pastilha" — o logo colorido sobre uma pastilha branca */
    logoEscuro: ""
  };

  PropTpl.modelo = function (t) {
    var m = t || {};
    var est = m.estilo || {};
    var estilo = {};
    for (var k in ESTILO_PADRAO) {
      if (Object.prototype.hasOwnProperty.call(ESTILO_PADRAO, k)) {
        estilo[k] = txt(est[k]) || ESTILO_PADRAO[k];
      }
    }
    /* formato só aceita os dois que o CSS de impressão conhece */
    if (estilo.formato !== "vertical") estilo.formato = "a4";
    if (estilo.ornamento !== "curvas") estilo.ornamento = "";
    if (estilo.rodape !== "contatos") estilo.rodape = "";
    if (estilo.fundoInternas !== "claro") estilo.fundoInternas = "";
    if (estilo.logoEscuro !== "clarear" && estilo.logoEscuro !== "pastilha") estilo.logoEscuro = "";
    if (!/^#[0-9a-fA-F]{6}$/.test(estilo.corDestaque2)) estilo.corDestaque2 = "";

    var paginas = arr(m.paginas).map(function (p, i) {
      var b = PropTpl.bloco(p && p.tipo);
      if (!b) return null;
      var out = { id: txt(p.id) || ("pg" + (i + 1)), tipo: b.tipo };
      b.campos.forEach(function (c) {
        var v = p[c.id];
        if (c.tipo === "sim_nao") out[c.id] = (v === undefined || v === null) ? !!c.padrao : !!v;
        else out[c.id] = (v === undefined || v === null || txt(v) === "") ? txt(c.padrao) : txt(v);
      });
      out.tipografia = tipografia(p.tipografia);
      out.formas = formas(p.formas);
      return out;
    }).filter(Boolean);

    return {
      id: txt(m.id),
      nome: txt(m.nome) || "Modelo sem nome",
      descricao: txt(m.descricao),
      paraCliente: txt(m.paraCliente),
      padrao: !!m.padrao,
      base: txt(m.base),
      estilo: estilo,
      /* ⚠ as ORIGINAIS ficam ao lado das cortadas: sem isso, "cortar de novo"
         partiria da imagem ja cortada e cada ajuste comeria mais um pedaco da
         foto, sem volta. */
      /* logo próprio do modelo (opcional) — ver a nota de `logoDoc` */
      logo: PropTpl.logoValido(m.logo) ? txt(m.logo) : "",
      imagensOrig: (m.imagensOrig && typeof m.imagensOrig === "object") ? m.imagensOrig : {},
      paginas: paginas,
      imagens: (m.imagens && typeof m.imagens === "object") ? m.imagens : {}
    };
  };

  /* =====================================================================
   * 4. OS SLOTS NUMERADOS
   *
   * ⚠ A NUMERAÇÃO É POR POSIÇÃO NA LISTA DE PÁGINAS, e é isso que a torna
   *   previsível para quem usa: "imagem 1 é a da capa". Mas ela SÓ é
   *   recalculada quando a lista de páginas muda — e quando muda, `remapear`
   *   leva as fotos junto. Sem isso, acrescentar uma página no meio faria a
   *   foto da capa aparecer no encerramento de todas as propostas já
   *   enviadas, e ninguém entenderia por quê.
   * ===================================================================== */
  /* =====================================================================
   * A PROPORCAO DE CADA SLOT — medida do CSS, nao chutada
   *
   * O documento desenha toda imagem com `object-fit:cover`: o navegador corta
   * o que sobra, sempre pelo CENTRO, e o usuario nao tem voz nenhuma sobre o
   * que fica de fora. Uma foto de fachada com o predio a esquerda entra na
   * capa com o predio cortado pela metade.
   *
   * Para a ferramenta de corte saber QUAL retangulo pedir, cada bloco declara
   * aqui a proporcao (largura ÷ altura) da caixa onde a imagem sera desenhada.
   * Os numeros saem das medidas reais do CSS deste arquivo:
   *
   *   pagina inteira (capa, quem somos, encerramento)
   *       A4        210 ÷ 297                    = 0,707
   *       vertical  120 ÷ 213                    = 0,563
   *   galeria (a faixa da pagina, ja sem a margem)
   *       A4        (210-32) ÷ 52                = 3,423
   *       vertical  (120-24) ÷ 44                = 2,182
   *   contato, dentro da moldura de celular
   *       (56 - 2×2,4) ÷ 96                      = 0,533
   *
   * ⚠ MUDOU O CSS, MUDA AQUI. `tools/test-proptpl.js` cruza estes numeros com
   *   as medidas escritas nas regras: proporcao que mente faz a ferramenta
   *   entregar um corte que o documento corta de novo.
   * =================================================================== */
  PropTpl.PROPORCOES = {
    capa:         { a4: 210 / 297, vertical: 120 / 213 },
    sobre:        { a4: 210 / 297, vertical: 120 / 213 },
    encerramento: { a4: 210 / 297, vertical: 120 / 213 },
    imagens:      { a4: 178 / 52, vertical: 96 / 44 },
    contato:      { a4: 51.2 / 96, vertical: 51.2 / 96 }
  };

  PropTpl.proporcaoDo = function (tipo, formato) {
    var p = PropTpl.PROPORCOES[txt(tipo)];
    if (!p) return 0;                       /* 0 = sem proporcao declarada */
    return (formato === "vertical") ? p.vertical : p.a4;
  };

  PropTpl.slots = function (t) {
    var m = PropTpl.modelo(t);
    var out = [], n = 0;
    m.paginas.forEach(function (p, iPg) {
      var b = PropTpl.bloco(p.tipo);
      if (!b || !b.imagens) return;
      for (var i = 0; i < b.imagens; i++) {
        n++;
        out.push({
          numero: n,
          paginaId: p.id,
          paginaIndice: iPg,
          paginaTipo: p.tipo,
          paginaNome: b.nome,
          /* ⚠ O SLOT CONTINUA EXISTINDO mesmo quando a página decide não
             desenhar a foto (Contato › "Mostrar a foto da equipe" desligado):
             sumir com ele renumeraria as fotos seguintes e embaralharia as
             imagens de modelos já montados. Quem não é desenhado só não conta
             como pendência — ver `avisos`. */
          desenha: !(p.tipo === "contato" && p.mostrarFoto === false),
          ordemNaPagina: i + 1,
          rotulo: "Imagem " + n,
          onde: b.nome + (b.imagens > 1 ? " · " + (i + 1) + "ª" : ""),
          /* a caixa onde esta imagem vai ser desenhada, para a ferramenta de
             corte pedir o retangulo certo */
          proporcao: PropTpl.proporcaoDo(p.tipo, m.estilo.formato),
          ref: m.imagens[String(n)] || null,
          /* a original, quando existe: e dela que um novo corte parte */
          original: (m.imagensOrig || {})[String(n)] || null
        });
      }
    });
    return out;
  };

  /* devolve o mapa de imagens reordenado quando a lista de páginas muda:
     as fotos seguem a PÁGINA a que pertenciam, não o número antigo */
  PropTpl.remapear = function (antes, depois) {
    var a = PropTpl.slots(antes), d = PropTpl.slots(depois);
    var porPagina = {};
    a.forEach(function (s) { porPagina[s.paginaId + "#" + s.ordemNaPagina] = s.ref; });
    var novo = {};
    d.forEach(function (s) {
      var r = porPagina[s.paginaId + "#" + s.ordemNaPagina];
      if (r) novo[String(s.numero)] = r;
    });
    return novo;
  };

  /* =====================================================================
   * 5. VALIDAÇÃO
   *
   * O que impede o modelo de virar documento. Slot sem foto NÃO impede: a
   * proposta sai com o espaço em branco e a tela avisa quais faltam — quem
   * está montando o modelo pela primeira vez não pode ficar preso.
   * ===================================================================== */
  PropTpl.validar = function (t) {
    var m = PropTpl.modelo(t);
    var f = [];
    if (!m.nome || m.nome === "Modelo sem nome") f.push("Dê um nome ao modelo — é como ele aparece na hora de gerar a proposta.");
    if (!m.paginas.length) f.push("O modelo precisa de ao menos uma página.");
    var temInvest = m.paginas.filter(function (p) { return p.tipo === "investimento"; }).length;
    if (!temInvest) f.push("Falta a página de Investimento — é ela que leva os preços da proposta.");
    if (temInvest > 1) f.push("Há mais de uma página de Investimento. A tabela sairia repetida.");
    return f;
  };

  /* avisos: não impedem gerar, mas a tela mostra */
  PropTpl.avisos = function (t) {
    var m = PropTpl.modelo(t);
    var av = [];
    /* ⚠ O AVISO SEPARA DOIS CASOS, porque o estrago é diferente. Numa página
       CHEIA (capa, quem somos, encerramento) com o ornamento ligado, a falta de
       foto não deixa buraco: entra o fundo da marca com os traços. Já numa
       galeria ou no contato, a falta aparece como um retângulo listrado no meio
       do documento. Dizer "sai com o espaço em branco" nos dois casos fazia o
       usuário caçar um defeito que não existia na capa. */
    var CHEIA = { capa: 1, sobre: 1, encerramento: 1 };
    var vazios = PropTpl.slots(m).filter(function (s) { return !s.ref; });
    var comFundo = m.estilo.ornamento === "curvas";
    var buraco = vazios.filter(function (s) { return s.desenha && !(comFundo && CHEIA[s.paginaTipo]); });
    var cobertos = vazios.length - buraco.length;
    if (buraco.length) {
      av.push(buraco.length + " imagem(ns) sem foto: " +
        buraco.slice(0, 4).map(function (s) { return s.rotulo + " (" + s.onde + ")"; }).join(", ") +
        (buraco.length > 4 ? "…" : "") + ". A proposta sai com o espaço em branco.");
    }
    if (cobertos) {
      av.push(cobertos + " página(s) de foto inteira estão sem imagem, mas saem com o fundo da marca e os traços — dá para enviar assim.");
    }
    m.paginas.forEach(function (p) {
      if (p.tipo === "texto" && !linhasDe(p.itens).length && !txt(p.abertura)) {
        av.push('A página "Escopo em texto" está sem conteúdo.');
      }
      if (p.tipo === "condicoes" && !linhasDe(p.paragrafos).length && !p.usarPrazo && !p.usarGarantia) {
        av.push('A página "Condições da entrega" está sem conteúdo.');
      }
    });
    return av;
  };

  /* =====================================================================
   * 6. OS QUATRO MODELOS DE FÁBRICA
   *
   * ⚠ NENHUM DELES CARREGA FOTO. Foto de fábrica seria imagem de obra de
   *   alguém viajando dentro do pacote de todos os clientes — e ainda daria
   *   a impressão de que aquela obra é da empresa que abriu o sistema. Os
   *   slots nascem vazios, com o nome dizendo o que pôr.
   *
   * ⚠ E NENHUM DELES TEM NOME DE CLIENTE. São quatro pontos de partida
   *   genéricos; quem quiser o desenho da própria empresa duplica um e
   *   ajusta.
   * ===================================================================== */
  PropTpl.FABRICA = [
    {
      id: "tpl-vertical-foto",
      nome: "Vertical fotográfico",
      descricao: "Formato de celular, foto sangrando na página inteira. Para quem manda a proposta pelo WhatsApp.",
      estilo: {
        corTitulo: "#1B2A5B", corTexto: "#2A2A2A", corFundo: "#FFFFFF",
        corDestaque: "#B3202E", corFundoEscuro: "#5C3A1E",
        textura: "madeira", fonte: "condensada", formato: "vertical"
      },
      paginas: [
        { id: "p1", tipo: "capa", titulo: "PROPOSTA", subtitulo: "PROJETO", chamada: "", mostrarCliente: true, mostrarLogo: true },
        { id: "p2", tipo: "sobre", titulo: "QUEM SOMOS", texto: "", mostrarLogo: true },
        { id: "p3", tipo: "imagens", titulo: "O que inclui no projeto", legenda: "" },
        { id: "p4", tipo: "texto", titulo: "O que inclui no projeto", rotuloLista: "O escopo contempla:", obsTitulo: "Observação:" },
        { id: "p5", tipo: "investimento", titulo: "INVESTIMENTO", colTrabalho: "Trabalho a executar", colValor: "Investimento", tituloPagamento: "FORMA DE PAGAMENTO", detalhar: false },
        { id: "p6", tipo: "condicoes", titulo: "CONDIÇÕES DA ENTREGA", usarPrazo: true, usarGarantia: true },
        { id: "p7", tipo: "encerramento", frase: "", mostrarLogo: true },
        { id: "p8", tipo: "contato", titulo: "DÚVIDAS?", molduraCelular: true }
      ]
    },
    {
      id: "tpl-a4-classico",
      nome: "A4 clássico",
      descricao: "Papel de escritório, sóbrio, para imprimir e assinar. Sem foto obrigatória.",
      estilo: {
        corTitulo: "#14304F", corTexto: "#26262A", corFundo: "#FFFFFF",
        corDestaque: "#14304F", corFundoEscuro: "#14304F",
        textura: "", fonte: "classica", formato: "a4"
      },
      paginas: [
        { id: "p1", tipo: "capa", titulo: "PROPOSTA COMERCIAL", subtitulo: "", chamada: "", mostrarCliente: true, mostrarLogo: true },
        { id: "p2", tipo: "texto", titulo: "Escopo dos serviços", rotuloLista: "Está incluso:", obsTitulo: "Não está incluso:" },
        { id: "p3", tipo: "investimento", titulo: "Investimento", colTrabalho: "Descrição", colValor: "Valor", tituloPagamento: "Condições de pagamento", detalhar: true },
        { id: "p4", tipo: "condicoes", titulo: "Condições gerais", usarPrazo: true, usarGarantia: true },
        { id: "p5", tipo: "assinatura", titulo: "ACEITE DA PROPOSTA", mostrarValidade: true }
      ]
    },
    {
      id: "tpl-a4-visual",
      nome: "A4 com projeto",
      descricao: "A4 com uma página de imagens do projeto entre o escopo e o preço.",
      estilo: {
        corTitulo: "#1F3A2E", corTexto: "#26262A", corFundo: "#FFFFFF",
        corDestaque: "#A9682F", corFundoEscuro: "#1F3A2E",
        textura: "papel", fonte: "mista", formato: "a4"
      },
      paginas: [
        { id: "p1", tipo: "capa", titulo: "PROPOSTA", subtitulo: "", chamada: "", mostrarCliente: true, mostrarLogo: true },
        { id: "p2", tipo: "sobre", titulo: "Quem somos", texto: "", mostrarLogo: false },
        { id: "p3", tipo: "imagens", titulo: "O projeto", legenda: "" },
        { id: "p4", tipo: "texto", titulo: "Escopo", rotuloLista: "O escopo contempla:", obsTitulo: "Observação:" },
        { id: "p5", tipo: "investimento", titulo: "Investimento", colTrabalho: "Trabalho a executar", colValor: "Valor", tituloPagamento: "Forma de pagamento", detalhar: false },
        { id: "p6", tipo: "condicoes", titulo: "Condições da entrega", usarPrazo: true, usarGarantia: true },
        { id: "p7", tipo: "assinatura", titulo: "Aceite", mostrarValidade: true }
      ]
    },
    {
      id: "tpl-engenharia-moderno",
      nome: "Engenharia moderno",
      descricao: "A4 com traços curvos da marca, quem somos, o que fazemos, escopo, investimento e contatos clicáveis no PDF. Sem foto obrigatória.",
      estilo: {
        corTitulo: "#12395A", corTexto: "#26303A", corFundo: "#FFFFFF",
        corDestaque: "#7A6B4E", corDestaque2: "#3F7D22", corFundoEscuro: "#0F2F4A",
        textura: "", fonte: "montserrat", formato: "a4",
        ornamento: "curvas", rodape: "contatos", fundoInternas: "claro",
        logoEscuro: "clarear"
      },
      paginas: [
        { id: "p1", tipo: "capa", titulo: "PROPOSTA", subtitulo: "COMERCIAL", chamada: "Engenharia com precisão, do orçamento à entrega", mostrarCliente: true, mostrarNumero: true, mostrarLogo: true },
        { id: "p2", tipo: "sobre", titulo: "QUEM SOMOS", texto: "Somos uma empresa de engenharia que une planejamento, orçamento e execução. Trabalhamos com responsabilidade técnica, transparência de custos e prazo cumprido.", mostrarLogo: true },
        { id: "p3", tipo: "servicos", titulo: "O QUE FAZEMOS", abertura: "Atendemos do estudo inicial à entrega da obra, com o mesmo time do início ao fim.",
          itens: "Orçamentos e planejamento | Planilhas com bases oficiais, BDI e cronograma físico-financeiro.\nExecução de obras | Equipe própria, acompanhamento técnico e medições periódicas.\nProjetos e compatibilização | Projetos executivos e modelagem BIM para evitar retrabalho.\nLaudos e consultoria | Vistorias, laudos técnicos e apoio em licitações.",
          fechamento: "" },
        { id: "p4", tipo: "texto", titulo: "Escopo dos serviços", rotuloLista: "Está incluso:", obsTitulo: "Não está incluso:", usarComercial: true },
        { id: "p5", tipo: "investimento", titulo: "INVESTIMENTO", colTrabalho: "Serviço", colValor: "Valor", tituloPagamento: "CONDIÇÕES DE PAGAMENTO", detalhar: true, tipografia: { escalaTitulo: 90, escalaTexto: 90 } },
        { id: "p6", tipo: "condicoes", titulo: "Condições gerais", usarPrazo: true, usarGarantia: true },
        { id: "p7", tipo: "assinatura", titulo: "ACEITE DA PROPOSTA", texto: "A assinatura abaixo formaliza a aprovação do escopo, dos valores e das condições desta proposta.", mostrarValidade: true },
        { id: "p8", tipo: "contato", titulo: "FALE CONOSCO", usarEmpresa: true, botaoPlanilha: true, mostrarFoto: false, molduraCelular: false }
      ]
    },
    {
      id: "tpl-uma-pagina",
      nome: "Uma página",
      descricao: "Tudo numa folha só: escopo curto, preço e condições. Para orçamento pequeno e resposta rápida.",
      estilo: {
        corTitulo: "#26262A", corTexto: "#26262A", corFundo: "#FFFFFF",
        corDestaque: "#B3202E", corFundoEscuro: "#26262A",
        textura: "", fonte: "geometrica", formato: "a4"
      },
      paginas: [
        { id: "p1", tipo: "investimento", titulo: "Proposta", colTrabalho: "Trabalho a executar", colValor: "Valor", tituloPagamento: "Forma de pagamento", detalhar: false },
        { id: "p2", tipo: "condicoes", titulo: "Condições", usarPrazo: true, usarGarantia: true }
      ]
    }
  ];

  /* cópia limpa de um modelo de fábrica, pronta para gravar */
  PropTpl.deFabrica = function (id) {
    var base = null;
    PropTpl.FABRICA.forEach(function (f) { if (f.id === id) base = f; });
    if (!base) return null;
    var m = PropTpl.modelo(JSON.parse(JSON.stringify(base)));
    m.base = base.id;
    return m;
  };

  /* =====================================================================
   * 7. O DOCUMENTO
   *
   * `dados` é o que a proposta e a empresa trazem, JÁ CALCULADO:
   *   { empresa, logoHTML, cliente, obra, numero, data, validade,
   *     blocos: <saída de CarpProposta.blocos>, comercial: {...} }
   *
   * ⚠ Repetindo a regra 1 do cabeçalho: `blocos` vem pronto. Este arquivo
   *   soma nada, rateia nada e arredonda nada.
   * ===================================================================== */
  function fundoDe(m, escuro) {
    var cor = escuro ? m.estilo.corFundoEscuro : m.estilo.corFundo;
    var tex = texturaCss(m.estilo.textura, escuro ? "#FFFFFF" : "#000000");
    return "background-color:" + cor + (tex ? ";" + tex : "");
  }

  /* =====================================================================
   * O LOGO DO MODELO
   *
   * Por padrão o logo vem de ⚙ Empresa — é o que mantém o documento
   * white-label: cada conta imprime a marca dela. O modelo pode, porém,
   * guardar um logo PRÓPRIO, e aí ele vence. Isso existe por um motivo
   * prático: o modelo é exportado e enviado a outra pessoa, e sem o logo
   * dentro dele a proposta chega ao destino com [LOGO] na capa.
   *
   * ⚠ SÓ BITMAP EM data: URI (png/jpg/webp/gif) — a mesma régua das fotos do
   *   arquivo de modelo. SVG fica de fora de propósito: é documento, pode
   *   trazer script, e o modelo vem de fora da conta.
   * ⚠ E ELE VIAJA NO REGISTRO, não no IndexedDB como as fotos: é imagem
   *   pequena, presente em quase toda página, e que precisa estar lá no
   *   PRIMEIRO render — inclusive na prévia e no PDF, que saem antes de
   *   qualquer carregamento assíncrono terminar.
   * ===================================================================== */
  PropTpl.LOGO_RE = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=\s]+$/i;
  PropTpl.logoValido = function (v) { return PropTpl.LOGO_RE.test(txt(v)); };

  /* o que a página desenha: logo do modelo > logo da empresa > nada */
  function logoDoc(m, d) {
    if (txt(m.logo)) return '<img src="' + esc(m.logo) + '" alt="logo">';
    return txt(d.logoHTML) ? d.logoHTML : "";
  }

  function imgTag(ref, classe, alt) {
    var d = txt(ref && (ref.dataURI || ref.d));
    if (!d) return '<div class="tp-vazio ' + classe + '"><span>' + esc(alt || "imagem") + "</span></div>";
    return '<img class="' + classe + '" src="' + esc(d) + '" alt="' + esc(alt || "") + '">';
  }

  PropTpl.html = function (t, dados) {
    var m = PropTpl.modelo(t);
    var d = dados || {};
    var f = PropTpl.fonte(m.estilo.fonte);
    var sl = PropTpl.slots(m);
    var imgs = d.imagens || {};          /* {numero: {dataURI}} já resolvido pela tela */
    var nSlot = 0;
    function proxImg(alt, classe) {
      nSlot++;
      var ref = imgs[String(nSlot)] || (sl[nSlot - 1] && sl[nSlot - 1].ref) || null;
      return imgTag(ref, classe, alt);
    }

    var b = d.blocos || {};
    var com = d.comercial || {};
    var emp = d.empresa || {};
    var links = d.links || {};
    var logoHTML = logoDoc(m, d);
    var vertical = m.estilo.formato === "vertical";
    var orn = m.estilo.ornamento === "curvas";
    var comRodape = m.estilo.rodape === "contatos";
    var internasClaras = m.estilo.fundoInternas === "claro";

    /* página inteira SEM foto: com o ornamento ligado, o fundo é a cor escura
       com as curvas — sem ele, o quadro listrado de sempre pedindo a foto */
    function proxImgCheia(alt) {
      var n = nSlot + 1;
      var ref = imgs[String(n)] || (sl[n - 1] && sl[n - 1].ref) || null;
      var temFoto = !!txt(ref && (ref.dataURI || ref.d));
      if (!temFoto && orn) { nSlot++; return '<div class="tp-bg tp-bg-cor"></div>'; }
      return proxImg(alt, "tp-bg");
    }
    var ornCheia = orn ? curvas("cheia") : "";
    var ornCanto = orn ? (curvas("canto") + curvas("pe")) : "";
    var rodape = comRodape ? rodapeContatos(emp) : "";

    var partes = m.paginas.map(function (p) {
      var bl = PropTpl.bloco(p.tipo);
      if (!bl) return "";
      var corpo = "";

      if (p.tipo === "capa") {
        corpo = '<div class="tp-full">' + proxImgCheia("foto de capa") + '<div class="tp-sombra"></div>' + ornCheia
          + '<div class="tp-capa-txt">'
          + (p.mostrarLogo && logoHTML ? '<div class="tp-logo">' + logoHTML + "</div>" : "")
          + '<h1 class="tp-h1">' + esc(p.titulo) + (p.subtitulo ? '<br><span>' + esc(p.subtitulo) + "</span>" : "") + "</h1>"
          + (p.chamada ? '<p class="tp-chamada">' + esc(p.chamada) + "</p>" : "")
          + (p.mostrarCliente && d.cliente ? '<p class="tp-cli">' + esc(d.cliente) + "</p>" : "")
          + (p.mostrarNumero && (txt(d.numero) || txt(d.data)) ? '<p class="tp-cli tp-num-capa">'
              + (txt(d.numero) ? "Proposta " + esc(d.numero) : "") + (txt(d.numero) && txt(d.data) ? " · " : "") + (txt(d.data) ? esc(dia(d.data)) : "") + "</p>" : "")
          + "</div></div>";
      }
      else if (p.tipo === "sobre") {
        corpo = '<div class="tp-full">' + proxImgCheia("foto de apresentação") + '<div class="tp-sombra"></div>' + ornCheia
          + '<div class="tp-sobre-txt">'
          + (p.mostrarLogo && logoHTML ? '<div class="tp-logo tp-logo-c">' + logoHTML + "</div>" : "")
          + '<h2 class="tp-vazado">' + esc(p.titulo) + "</h2>"
          + '<p class="tp-sobre-p">' + escML(p.texto) + "</p>"
          + "</div></div>";
      }
      else if (p.tipo === "servicos") {
        var cards = linhasDe(p.itens).map(function (x) {
          var k = x.indexOf("|");
          var tt = k > -1 ? x.slice(0, k).trim() : x, ds = k > -1 ? x.slice(k + 1).trim() : "";
          return '<div class="tp-serv-card"><b>' + esc(tt) + "</b>" + (ds ? "<span>" + esc(ds) + "</span>" : "") + "</div>";
        }).join("");
        corpo = '<h2 class="tp-h2">' + esc(p.titulo) + '</h2><div class="tp-rule"></div>'
          + (txt(p.abertura) ? '<p class="tp-p">' + escML(p.abertura) + "</p>" : "")
          + (cards ? '<div class="tp-serv">' + cards + "</div>" : "")
          + (txt(p.fechamento) ? '<p class="tp-p tp-solto">' + escML(p.fechamento) + "</p>" : "");
      }
      else if (p.tipo === "imagens") {
        corpo = '<h2 class="tp-h2">' + esc(p.titulo) + '</h2><div class="tp-rule"></div>'
          + '<div class="tp-galeria">'
          + proxImg("imagem 1 do projeto", "tp-gal") + proxImg("imagem 2 do projeto", "tp-gal") + proxImg("imagem 3 do projeto", "tp-gal")
          + "</div>"
          + (txt(p.legenda) ? '<p class="tp-leg">' + escML(p.legenda) + "</p>" : "");
      }
      else if (p.tipo === "texto") {
        var its = linhasDe(p.itens);
        /* o escopo do ORÇAMENTO (Dados › Incluso / Não incluso) entra quando a
           página não tem texto próprio — é o que faz o modelo servir a qualquer
           orçamento sem ninguém reescrever a lista a cada proposta */
        var doOrc = !its.length && p.usarComercial;
        if (doOrc) its = linhasDe(com.incluso);
        var exc = (doOrc && !txt(p.observacao)) ? linhasDe(com.excluso) : [];
        corpo = '<h2 class="tp-h2">' + esc(p.titulo) + '</h2><div class="tp-rule"></div>'
          + (txt(p.abertura) ? '<p class="tp-p">' + escML(p.abertura) + "</p>" : "")
          + (its.length ? '<p class="tp-p tp-rot">' + esc(p.rotuloLista) + "</p><ul class=\"tp-ul\">"
              + its.map(function (x) { return "<li>" + esc(x.replace(/;$/, "")) + "</li>"; }).join("") + "</ul>" : "")
          + (exc.length ? '<p class="tp-p tp-rot tp-obs"><b>' + esc(p.obsTitulo) + "</b></p><ul class=\"tp-ul\">"
              + exc.map(function (x) { return "<li>" + esc(x.replace(/;$/, "")) + "</li>"; }).join("") + "</ul>" : "")
          + (txt(p.observacao) ? '<p class="tp-obs"><b>' + esc(p.obsTitulo) + "</b> " + escML(p.observacao) + "</p>" : "");
      }
      else if (p.tipo === "investimento") {
        corpo = '<h2 class="tp-h1c">' + esc(p.titulo) + "</h2>" + tabela(p, b, m);
        var pag = txt(com.condicoesPagamento);
        if (pag) {
          corpo += '<h3 class="tp-h1c tp-h3pag">' + esc(p.tituloPagamento) + "</h3>"
            + '<p class="tp-pag">' + escML(pag) + "</p>";
        }
      }
      else if (p.tipo === "condicoes") {
        var ps = linhasDe(p.paragrafos);
        if (p.usarPrazo && txt(com.prazoExecucao)) ps.push("Prazo de execução: " + txt(com.prazoExecucao).replace(/\.$/, "") + ".");
        if (p.usarGarantia && txt(com.garantia)) ps.push("Garantia: " + txt(com.garantia).replace(/\.$/, "") + ".");
        corpo = '<h2 class="tp-h2">' + esc(p.titulo) + '</h2><div class="tp-rule"></div>'
          + ps.map(function (x) { return '<p class="tp-p tp-solto">' + esc(x) + "</p>"; }).join("");
      }
      else if (p.tipo === "encerramento") {
        corpo = '<div class="tp-full">' + proxImgCheia("foto de encerramento") + '<div class="tp-sombra"></div>' + ornCheia
          + '<div class="tp-fim-txt">'
          + (p.mostrarLogo && logoHTML ? '<div class="tp-logo tp-logo-g">' + logoHTML + "</div>" : "")
          + '<p class="tp-fim-p">' + escML(p.frase) + "</p>"
          + "</div></div>";
      }
      else if (p.tipo === "contato") {
        var foto = "";
        if (p.mostrarFoto) foto = proxImg("foto da equipe", "tp-contato-img");
        else nSlot++;                      /* o slot continua contado: a numeração das fotos não muda */
        corpo = '<p class="tp-marca">' + esc(txt(emp.nome)) + '</p><div class="tp-rule"></div>'
          + (!foto ? "" : (p.molduraCelular ? '<div class="tp-cel"><div class="tp-cel-tela">' + foto + "</div></div>" : '<div class="tp-contato-livre">' + foto + "</div>"))
          + '<h2 class="tp-h1c tp-h1e">' + esc(p.titulo) + "</h2>"
          + '<div class="tp-contatos">' + contatosHtml(p, emp) + "</div>"
          + botoesHtml(p, emp, links);
      }
      else if (p.tipo === "assinatura") {
        var val = d.validade || {};
        corpo = '<h2 class="tp-h2">' + esc(p.titulo) + '</h2><div class="tp-rule"></div>'
          + (txt(p.texto) ? '<p class="tp-p">' + escML(p.texto) + "</p>" : "")
          + (p.mostrarValidade && txt(val.texto) ? '<p class="tp-p">' + esc(val.texto) + "</p>" : "")
          + '<p class="tp-p tp-local">' + esc(txt(emp.cidade) || "____________________") + ", " + esc(dia(d.data)) + ".</p>"
          + '<div class="tp-assin"><div><div class="tp-linha"></div>' + esc(txt(emp.nome) || "Contratada") + "</div>"
          + '<div><div class="tp-linha"></div>' + esc(txt(d.cliente) || "Contratante") + "</div></div>";
      }

      var cheia = (p.tipo === "capa" || p.tipo === "sobre" || p.tipo === "encerramento");
      var escuro = !internasClaras && (p.tipo === "texto" || p.tipo === "condicoes" || p.tipo === "imagens");
      if (!cheia) corpo = ornCanto + corpo + rodape;
      var cls = "tp-pg" + (vertical ? " tp-vert" : "")
        + (cheia ? " tp-cheia" : "")
        + (cheia && m.estilo.logoEscuro ? " tp-logo-" + m.estilo.logoEscuro : "")
        + (escuro ? " tp-escura" : "")
        + (!cheia && comRodape ? " tp-com-rodape" : "");
      var fundo = (p.tipo === "capa" || p.tipo === "sobre" || p.tipo === "encerramento")
        ? "" : fundoDe(m, escuro);
      var tipo = estiloTipografia(p.tipografia || tipografia(null));
      var form = estiloFormas(p.formas || formas(null));
      var junto = [fundo, tipo, form].filter(Boolean).join(";");
      var estilo = junto ? (' style="' + junto + '"') : "";
      return '<section class="' + cls + '"' + estilo + ">" + corpo + "</section>";
    }).join("");

    return '<div class="tp-doc" style="' + estiloRaiz(m, f) + '">' + partes + "</div>";
  };

  /* =====================================================================
   * ⚠ ASPA DUPLA DENTRO DE `style="..."` FECHA O ATRIBUTO
   *
   *   A pilha de fontes é escrita com aspas duplas ('"Playfair Display",
   *   Georgia, ...'), e ela ia inteira para dentro de um atributo delimitado
   *   por aspas duplas. O navegador lia
   *
   *       style="--tp-titulo:#1B2A5B;...;--tp-f-tit:"
   *
   *   e o resto virava atributo solto. Resultado: `--tp-f-tit` e `--tp-f-txt`
   *   NUNCA chegavam ao documento, e `font-family:var(--tp-f-tit)` caía em
   *   herança. O seletor de fonte existia, salvava a escolha, mostrava o
   *   exemplo na tela — e o papel saía sempre na mesma fonte. Defeito antigo,
   *   achado em 01/09/2026 ao perguntar ao navegador qual fonte ele resolveu,
   *   em vez de conferir que a variável estava no HTML.
   *
   *   CSS aceita aspa simples para nome de família: a troca resolve sem
   *   escapar nada e sem mexer na tabela de fontes.
   * =================================================================== */
  function aspaSimples(s) { return String(s == null ? "" : s).replace(/"/g, "'"); }

  /* =====================================================================
   * ORNAMENTO "CURVAS" — os traços da marca, desenhados em SVG
   *
   * Três arcos que varrem a página (título, destaque e 2º destaque), com a
   * grossura caindo do primeiro para o terceiro. Nas capas cobrem a folha; nas
   * internas ficam num canto e no pé, discretos. É SVG inline com as cores
   * vindas das variáveis do modelo: muda a cor no editor, muda o traço.
   * ⚠ pointer-events:none e z-index 0 — nunca fica na frente do texto. */
  function curvas(onde) {
    var c1 = "var(--tp-titulo)", c2 = "var(--tp-destaque)", c3 = "var(--tp-destaque2)";
    if (onde === "cheia") {
      return '<svg class="tp-orn tp-orn-cheia" viewBox="0 0 210 297" preserveAspectRatio="none" aria-hidden="true">'
        + '<g fill="none" stroke-linecap="round">'
        + '<path d="M-10 322 C 60 245, 140 262, 240 175" stroke="' + c1 + '" stroke-width="16" opacity=".32"/>'
        + '<path d="M-20 300 C 50 220, 125 238, 235 135" stroke="' + c2 + '" stroke-width="7" opacity=".75"/>'
        + '<path d="M-30 280 C 55 195, 130 215, 240 95" stroke="' + c3 + '" stroke-width="3.2" opacity=".9"/>'
        + '<path d="M125 -15 C 150 55, 200 75, 245 45" stroke="' + c2 + '" stroke-width="4" opacity=".55"/>'
        + '<path d="M150 -15 C 170 45, 215 62, 250 30" stroke="' + c3 + '" stroke-width="2" opacity=".6"/>'
        + "</g></svg>";
    }
    if (onde === "canto") {
      return '<svg class="tp-orn tp-orn-canto" viewBox="0 0 100 100" aria-hidden="true"><g fill="none" stroke-linecap="round">'
        + '<path d="M-5 90 C 30 40, 60 45, 105 5" stroke="' + c1 + '" stroke-width="9" opacity=".18"/>'
        + '<path d="M10 100 C 45 55, 70 60, 110 25" stroke="' + c2 + '" stroke-width="5" opacity=".45"/>'
        + '<path d="M25 105 C 55 70, 80 72, 112 45" stroke="' + c3 + '" stroke-width="2.5" opacity=".7"/>'
        + "</g></svg>";
    }
    return '<svg class="tp-orn tp-orn-pe" viewBox="0 0 100 60" aria-hidden="true"><g fill="none" stroke-linecap="round">'
      + '<path d="M-5 65 C 25 20, 55 25, 105 -5" stroke="' + c3 + '" stroke-width="2.5" opacity=".55"/>'
      + '<path d="M-5 75 C 30 35, 60 40, 108 8" stroke="' + c2 + '" stroke-width="4" opacity=".35"/>'
      + "</g></svg>";
  }

  /* ---- canais de contato viram LINK (o navegador guarda o link no PDF) ---- */
  function soDigitos(v) { return txt(v).replace(/\D/g, ""); }
  function linkZap(numero, texto) {
    var n = soDigitos(numero);
    if (!n) return "";
    if (n.length <= 11) n = "55" + n;               /* sem o país: assume Brasil */
    var msg = txt(texto) ? "?text=" + encodeURIComponent(txt(texto)) : "";
    return "https://wa.me/" + n + msg;
  }
  function linkTel(numero) { var n = soDigitos(numero); return n ? "tel:+" + (n.length <= 11 ? "55" + n : n) : ""; }
  function linkMail(e) { var v = txt(e); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? "mailto:" + v : ""; }
  function linkSite(u) {
    var v = txt(u); if (!v) return "";
    if (/^https?:\/\//i.test(v)) return v;
    if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(v)) return "https://" + v;
    return "";
  }
  function linkInsta(h) { var v = txt(h).replace(/^@/, ""); return /^[\w.]+$/.test(v) ? "https://instagram.com/" + v : ""; }
  function linkHttp(u) { var v = txt(u); return /^https?:\/\//i.test(v) ? v : ""; }
  function a(href, texto, classe) {
    return href ? '<a href="' + esc(href) + '" target="_blank" rel="noopener"' + (classe ? ' class="' + classe + '"' : "") + ">" + esc(texto) + "</a>" : esc(texto);
  }

  /* o bloco Contato: o que a página tem, completado (se pedido) por ⚙ Empresa */
  function canais(p, emp) {
    var usar = !!p.usarEmpresa;
    function ou(a1, a2) { return txt(a1) || (usar ? txt(a2) : ""); }
    return {
      pessoas: txt(p.pessoas),
      redes: ou(p.redes, emp.instagram),
      telefone: ou(p.telefone, emp.telefone),
      whatsapp: ou(p.whatsapp, emp.whatsapp),
      email: ou(p.email, emp.email),
      site: ou(p.site, emp.site),
      endereco: ou(p.endereco, emp.endereco)
    };
  }
  function contatosHtml(p, emp) {
    var c = canais(p, emp);
    return (c.pessoas ? "<div>" + esc(c.pessoas) + "</div>" : "")
      + (c.telefone ? "<div>" + a(linkTel(c.telefone), c.telefone) + "</div>" : "")
      + (c.whatsapp && c.whatsapp !== c.telefone ? "<div>WhatsApp " + a(linkZap(c.whatsapp, ""), c.whatsapp) + "</div>" : "")
      + (c.email ? "<div>" + a(linkMail(c.email), c.email) + "</div>" : "")
      + (c.site ? "<div>" + a(linkSite(c.site), c.site) + "</div>" : "")
      + (c.redes ? "<div>" + a(linkInsta(c.redes), c.redes) + "</div>" : "")
      + (c.endereco ? '<div class="tp-end">' + esc(c.endereco) + "</div>" : "");
  }
  function botoesHtml(p, emp, links) {
    var c = canais(p, emp);
    var zap = c.whatsapp ? linkZap(c.whatsapp, "Olá! Recebi a proposta de " + txt(emp.nome) + " e gostaria de conversar.") : "";
    var pl = p.botaoPlanilha ? linkHttp(links && links.planilha) : "";
    var out = "";
    if (zap) out += '<a class="tp-btn tp-btn-2" href="' + esc(zap) + '" target="_blank" rel="noopener">' + esc(txt(p.textoZap) || "Falar no WhatsApp") + "</a>";
    if (pl) out += '<a class="tp-btn" href="' + esc(pl) + '" target="_blank" rel="noopener">' + esc(txt(p.textoBotao) || "Abrir a planilha desta proposta") + "</a>";
    return out ? '<div class="tp-botoes">' + out + "</div>" : "";
  }
  /* rodapé das páginas internas: empresa · CNPJ · canais (clicáveis) */
  function rodapeContatos(emp) {
    var partes = [];
    if (txt(emp.nome)) partes.push("<b>" + esc(emp.nome) + "</b>");
    if (txt(emp.cnpj)) partes.push("CNPJ " + esc(emp.cnpj));
    if (txt(emp.telefone)) partes.push(a(linkTel(emp.telefone), emp.telefone));
    if (txt(emp.whatsapp) && txt(emp.whatsapp) !== txt(emp.telefone)) partes.push(a(linkZap(emp.whatsapp, ""), "WhatsApp " + emp.whatsapp));
    if (txt(emp.email)) partes.push(a(linkMail(emp.email), emp.email));
    if (txt(emp.site)) partes.push(a(linkSite(emp.site), emp.site));
    if (txt(emp.instagram)) partes.push(a(linkInsta(emp.instagram), emp.instagram));
    if (!partes.length && txt(emp.contato)) partes.push(esc(emp.contato));
    if (txt(emp.endereco)) partes.push(esc(emp.endereco) + (txt(emp.cidade) ? " — " + esc(emp.cidade) : ""));
    if (!partes.length) return "";
    return '<div class="tp-rodape">' + partes.map(function (x) { return "<span>" + x + "</span>"; }).join("") + "</div>";
  }

  function estiloRaiz(m, f) {
    return "--tp-titulo:" + m.estilo.corTitulo
      + ";--tp-texto:" + m.estilo.corTexto
      + ";--tp-destaque:" + m.estilo.corDestaque
      + ";--tp-destaque2:" + (m.estilo.corDestaque2 || m.estilo.corDestaque)
      + ";--tp-escuro:" + m.estilo.corFundoEscuro
      + ";--tp-f-tit:" + aspaSimples(f.titulo)
      + ";--tp-f-txt:" + aspaSimples(f.texto);
  }

  /* a tabela de preços — o único lugar deste arquivo que toca em número, e
     mesmo aqui ele só ESCREVE o que veio pronto em `blocos` */
  function tabela(p, b, m) {
    function linhasHtml(lista) {
      return arr(lista).map(function (l) {
        var q = num(l.qtd) > 0 ? (n2(l.qtd) + (txt(l.unidade) ? " " + esc(l.unidade) : "")) : "";
        return "<tr><td>" + esc(l.descricao) + (q ? ' <span class="tp-qtd">' + q + "</span>" : "")
          + '</td><td class="tp-num">' + esc(moeda(l.total)) + "</td></tr>";
      }).join("");
    }
    /* =====================================================================
     * OS GRUPOS VÊM DOS DADOS, NÃO DO CÓDIGO
     *
     * ⚠ Até 01/09/2026 esta função escrevia "Material" e "Mão de obra" à mão,
     *   lendo `b.madeira` e `b.mo`. Isso é o vocabulário de UMA operação — a
     *   carpintaria, para quem o recurso nasceu. O orçamento SINAPI agrupa por
     *   ETAPA (Serviços preliminares, Estrutura, Alvenaria…), e enfiar etapa
     *   dentro de um cabeçalho escrito "Mão de obra" seria entregar ao cliente
     *   um documento que mente sobre a própria estrutura.
     *
     *   Agora quem monta os dados diz o nome de cada grupo. O par antigo
     *   continua valendo: sem `grupos`, `madeira`/`mo` viram os dois grupos de
     *   sempre, com os mesmos rótulos e na mesma ordem — a carpintaria não
     *   percebe diferença nenhuma.
     *
     * ⚠ GRUPO SEM NOME NÃO GANHA CABEÇALHO. Um documento com uma faixa cinza
     *   vazia em cima da tabela parece defeito, e é assim que fica quem tem um
     *   grupo só (o caso de quem não usa etapa).
     * =================================================================== */
    function gruposDe(bb) {
      if (Array.isArray(bb.grupos)) {
        return bb.grupos.map(function (g) {
          return { nome: txt(g && g.nome), linhas: arr(g && g.linhas) };
        }).filter(function (g) { return g.linhas.length; });
      }
      var out = [];
      if (arr(bb.madeira).length) out.push({ nome: "Material", linhas: arr(bb.madeira) });
      if (arr(bb.mo).length) out.push({ nome: "Mão de obra", linhas: arr(bb.mo) });
      return out;
    }

    var gs = gruposDe(b);
    var corpo;
    if (p.detalhar) {
      corpo = gs.map(function (g) {
        return (g.nome ? '<tr class="tp-grupo"><td colspan="2">' + esc(g.nome) + "</td></tr>" : "")
          + linhasHtml(g.linhas);
      }).join("");
    } else {
      /* ⚠ sem `reduce`: `tools/test-proptpl.js` varre este arquivo atrás de
         `.reduce(`, `somar`, `calcular` e `ratear` para provar que o motor
         não faz conta de dinheiro. A guarda é grossa de propósito, e vale
         mais que a elegância de uma linha — aqui só se junta lista. */
      var todas = [];
      gs.forEach(function (g) { g.linhas.forEach(function (l) { todas.push(l); }); });
      corpo = linhasHtml(todas);
    }
    if (!corpo) corpo = '<tr><td colspan="2" class="tp-vaziotxt">Nenhum item com preço.</td></tr>';
    return '<table class="tp-tbl"><thead><tr><th>' + esc(p.colTrabalho) + '</th><th class="tp-num">' + esc(p.colValor) + "</th></tr></thead>"
      + "<tbody>" + corpo + "</tbody></table>"
      + '<p class="tp-total">Valor total: <b>' + esc(moeda(b.total)) + "</b></p>";
  }

  /* =====================================================================
   * 8. O CSS DO DOCUMENTO
   *
   * Sai junto com o HTML, no <style> da janela de impressão. Não depende do
   * css/app.css: o documento é aberto numa janela nova, e depender da folha
   * do app faria a proposta sair sem desenho quando o arquivo não carregasse.
   * ===================================================================== */
  /* `formato` é opcional: "vertical" imprime no papel 120×213 mm; o resto é A4.
     ⚠ SEM `size` o navegador usa o papel padrão da máquina — em máquina
       configurada para Carta (279 mm) cada página A4 vazava 18 mm para uma
       folha em branco: 8 páginas viravam 16. */
  PropTpl.css = function (formato) {
    var papel = (txt(formato) === "vertical") ? "120mm 213mm" : "210mm 297mm";
    return [
      "@page{margin:0;size:" + papel + "}",
      ".tp-doc{color:var(--tp-texto);font-family:var(--tp-f-txt);line-height:1.5}",


      ".tp-pg{position:relative;width:210mm;min-height:297mm;padding:18mm 16mm;box-sizing:border-box;overflow:hidden;page-break-after:always;background-color:#fff}",
      ".tp-pg.tp-vert{width:120mm;min-height:213mm;padding:14mm 12mm}",
      ".tp-pg:last-child{page-break-after:auto}",
      ".tp-cheia{padding:0;color:#fff}",
      ".tp-escura{color:#fff}",
      ".tp-escura .tp-rule{background:rgba(255,255,255,.7)}",
      ".tp-full{position:absolute;inset:0}",
      ".tp-bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}",
      ".tp-sombra{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.42) 0%,rgba(0,0,0,.12) 42%,rgba(0,0,0,.62) 100%)}",
      ".tp-vazio{display:flex;align-items:center;justify-content:center;background:repeating-linear-gradient(45deg,#e9e7e1,#e9e7e1 12px,#dedbd3 12px,#dedbd3 24px);color:#8b8474;font-size:11pt;letter-spacing:.06em;text-transform:uppercase}",
      ".tp-vazio.tp-bg{position:absolute;inset:0}",
      ".tp-capa-txt{position:absolute;left:0;right:0;top:26%;padding:0 12mm}",
      ".tp-logo{max-width:46mm;margin-bottom:8mm}",
      ".tp-vert .tp-logo{max-width:34mm}",
      ".tp-logo img,.tp-logo svg{max-width:100%;max-height:32mm;height:auto;width:auto;display:block;object-fit:contain}",
      /* versão negativa: serve ao logo escuro (a maioria) sobre página cheia */
      ".tp-logo-clarear .tp-logo img{filter:brightness(0) invert(1)}",
      ".tp-logo-pastilha .tp-logo{background:#fff;border-radius:2.5mm;padding:3mm 4mm;display:inline-block;max-width:56mm}",
      ".tp-logo-pastilha .tp-logo-c,.tp-logo-pastilha .tp-logo-g{display:block;width:-moz-fit-content;width:fit-content;margin-left:auto;margin-right:auto}",
      ".tp-logo-c img,.tp-logo-c svg{margin:0 auto}",
      ".tp-logo-g img,.tp-logo-g svg{margin:0 auto;max-height:46mm}",
      ".tp-logo-c{margin:0 auto 6mm;max-width:44mm}",
      ".tp-logo-g{margin:0 auto 8mm;max-width:62mm}",
      ".tp-h1{font-family:var(--tp-f-tit);font-weight:700;font-size:calc(44pt * var(--tp-esc-tit,1));line-height:.94;letter-spacing:-.01em;text-transform:uppercase;margin:0 0 6mm;color:#fff}",
      ".tp-vert .tp-h1{font-size:calc(34pt * var(--tp-esc-tit,1))}",
      ".tp-chamada{font-family:var(--tp-f-tit);font-size:calc(13pt * var(--tp-esc-tit,1));text-transform:uppercase;letter-spacing:.02em;margin:0 0 4mm;color:#fff}",
      ".tp-num-capa{margin-top:3mm;opacity:.8;letter-spacing:.06em}",
      ".tp-cli{font-size:calc(12pt * var(--tp-esc-txt,1));letter-spacing:.12em;text-transform:uppercase;margin:0;color:rgba(255,255,255,.92)}",
      ".tp-sobre-txt{position:absolute;left:0;right:0;top:16%;padding:0 12mm}",
      ".tp-vazado{font-family:var(--tp-f-tit);font-size:calc(30pt * var(--tp-esc-tit,1));text-transform:uppercase;letter-spacing:.02em;margin:0 0 5mm;color:transparent;-webkit-text-stroke:1px rgba(255,255,255,.92);text-align:center}",
      ".tp-sobre-p{font-size:calc(12.5pt * var(--tp-esc-txt,1));line-height:1.55;margin:0;color:#fff}",
      ".tp-h2{font-family:var(--tp-f-tit);font-size:calc(17pt * var(--tp-esc-tit,1));font-weight:700;margin:0 0 4mm;letter-spacing:.01em}",
      ".tp-h1c{font-family:var(--tp-f-tit);font-size:calc(26pt * var(--tp-esc-tit,1));font-weight:700;text-transform:uppercase;text-align:center;color:var(--tp-titulo);margin:0 0 8mm;letter-spacing:.01em}",
      ".tp-h1e{margin-top:8mm}",
      ".tp-h3pag{font-size:calc(16pt * var(--tp-esc-tit,1));margin-top:9mm;margin-bottom:5mm}",
      ".tp-rule{height:1.4px;background:var(--tp-titulo);margin:0 0 7mm}",
      ".tp-p{font-size:calc(11.5pt * var(--tp-esc-txt,1));margin:0 0 4mm}",
      ".tp-solto{margin-bottom:6mm}",
      ".tp-rot{margin-bottom:2mm}",
      ".tp-ul{margin:0 0 5mm;padding-left:6mm;font-size:calc(11.5pt * var(--tp-esc-txt,1))}",
      ".tp-ul li{margin-bottom:2mm}",
      ".tp-obs{font-size:calc(11pt * var(--tp-esc-txt,1));margin:6mm 0 0}",
      ".tp-leg{font-size:calc(10.5pt * var(--tp-esc-txt,1));margin:4mm 0 0;opacity:.9}",
      ".tp-galeria{display:flex;flex-direction:column;gap:5mm}",
      ".tp-gal{width:100%;height:52mm;object-fit:cover;display:block}",
      ".tp-vert .tp-gal{height:44mm}",
      ".tp-tbl{width:100%;border-collapse:collapse;font-size:calc(11.5pt * var(--tp-esc-txt,1))}",
      ".tp-tbl th{background:var(--tp-titulo);color:#fff;text-align:left;padding:4mm 4mm;font-weight:600}",
      ".tp-tbl td{border:1px solid var(--tp-titulo);padding:2.8mm 3.6mm;vertical-align:top}",
      ".tp-tbl .tp-num{text-align:right;white-space:nowrap}",
      ".tp-tbl th.tp-num{text-align:right}",
      ".tp-grupo td{background:rgba(0,0,0,.05);font-weight:600;text-transform:uppercase;font-size:9.5pt;letter-spacing:.06em}",
      ".tp-qtd{opacity:.7;font-size:10pt}",
      ".tp-vaziotxt{text-align:center;opacity:.6}",
      ".tp-total{text-align:center;font-size:calc(14pt * var(--tp-esc-txt,1));margin:7mm 0 0;color:var(--tp-titulo)}",
      ".tp-pag{text-align:center;font-size:calc(11.5pt * var(--tp-esc-txt,1));margin:0;color:var(--tp-titulo)}",
      ".tp-marca{font-size:11pt;letter-spacing:.08em;text-transform:uppercase;margin:0 0 3mm;color:var(--tp-titulo)}",
      ".tp-cel{width:56mm;margin:10mm auto;border:2.4mm solid #1b1b1f;border-radius:7mm;background:#1b1b1f;padding:0;overflow:hidden}",
      ".tp-cel-tela{position:relative;width:100%;height:96mm;overflow:hidden;border-radius:3mm}",
      ".tp-contato-img{width:100%;height:100%;object-fit:cover;display:block}",
      ".tp-contato-livre{width:100%;height:80mm;overflow:hidden;margin:8mm 0}",
      ".tp-contato-livre .tp-vazio{height:100%}",
      ".tp-cel-tela .tp-vazio{height:100%}",
      ".tp-contatos{text-align:center;font-size:calc(12pt * var(--tp-esc-txt,1));line-height:1.7;color:var(--tp-titulo)}",
      ".tp-fim-txt{position:absolute;left:0;right:0;top:38%;padding:0 14mm;text-align:center}",
      ".tp-fim-p{font-size:calc(14pt * var(--tp-esc-txt,1));line-height:1.5;margin:0;color:#fff}",
      ".tp-local{margin-top:14mm}",
      ".tp-assin{display:flex;gap:12mm;margin-top:20mm;font-size:calc(10.5pt * var(--tp-esc-txt,1));text-align:center}",
      ".tp-assin>div{flex:1}",
      ".tp-linha{border-top:1px solid var(--tp-texto);margin-bottom:2mm}",

      /* ---- ornamento de curvas, rodapé, serviços, links e botões ---- */
      ".tp-orn{position:absolute;pointer-events:none;z-index:0}",
      ".tp-orn-cheia{inset:0;width:100%;height:100%}",
      ".tp-orn-canto{right:-12mm;top:-14mm;width:92mm;height:92mm}",
      ".tp-orn-pe{left:-8mm;bottom:-6mm;width:84mm;height:50mm}",
      ".tp-pg.tp-com-rodape .tp-orn-pe{bottom:12mm}",
      ".tp-bg-cor{background:var(--tp-escuro);background-image:linear-gradient(160deg,rgba(255,255,255,.08) 0%,rgba(0,0,0,0) 45%,rgba(0,0,0,.28) 100%)}",
      ".tp-pg>*:not(.tp-orn):not(.tp-full):not(.tp-rodape){position:relative;z-index:1}",
      ".tp-com-rodape{padding-bottom:26mm}",
      ".tp-rodape{position:absolute;left:16mm;right:16mm;bottom:9mm;z-index:1;border-top:1px solid var(--tp-destaque);padding-top:2.5mm;font-size:8.5pt;line-height:1.5;display:flex;flex-wrap:wrap;gap:1mm 5mm;opacity:.92}",
      ".tp-vert .tp-rodape{left:12mm;right:12mm;bottom:7mm;font-size:8pt}",
      ".tp-rodape a,.tp-contatos a{color:inherit;text-decoration:none}",
      ".tp-escura .tp-rodape{border-color:rgba(255,255,255,.5)}",
      ".tp-serv{display:grid;grid-template-columns:1fr 1fr;gap:5mm;margin:2mm 0 6mm}",
      ".tp-vert .tp-serv{grid-template-columns:1fr}",
      ".tp-serv-card{border:1px solid rgba(0,0,0,.12);border-left:3px solid var(--tp-destaque2);padding:4mm 5mm;border-radius:2mm;background:rgba(0,0,0,.02)}",
      ".tp-escura .tp-serv-card{border-color:rgba(255,255,255,.35);background:rgba(255,255,255,.06)}",
      ".tp-serv-card b{display:block;font-family:var(--tp-f-tit);font-size:12pt;margin-bottom:1.5mm;color:var(--tp-titulo)}",
      ".tp-escura .tp-serv-card b{color:#fff}",
      ".tp-serv-card span{font-size:10.5pt;line-height:1.45;display:block}",
      ".tp-end{font-size:10.5pt;opacity:.85;margin-top:2mm}",
      ".tp-botoes{display:flex;justify-content:center;gap:5mm;margin-top:9mm;flex-wrap:wrap}",
      ".tp-btn{display:inline-block;padding:3.6mm 7mm;border-radius:2.2mm;background:var(--tp-titulo);color:#fff!important;text-decoration:none!important;font-family:var(--tp-f-tit);font-weight:600;font-size:11pt;letter-spacing:.02em}",
      ".tp-btn-2{background:var(--tp-destaque2)}",

      /* =================================================================
       * OS AJUSTES DE TIPOGRAFIA DA PÁGINA
       *
       * ⚠ CADA REGRA CAI NO DESENHO ORIGINAL QUANDO A VARIÁVEL NÃO EXISTE.
       *   `var(--tp-al-txt, left)` mantém, byte a byte, o que o bloco já
       *   fazia para quem nunca mexeu em nada — e é o que permite ligar isto
       *   sem reabrir os modelos que os clientes já montaram.
       *
       * ⚠ E VEM DEPOIS das regras dos blocos, de propósito: o ajuste do
       *   usuário é o último a falar. Um `text-align` escrito antes seria
       *   vencido pela regra específica do bloco e o botão não faria nada —
       *   o pior desfecho, porque a tela diria que mudou.
       * =============================================================== */
      ".tp-pg{letter-spacing:var(--tp-ls,normal)}",
      ".tp-pg h1,.tp-pg h2,.tp-pg .tp-h1,.tp-pg .tp-h1c,.tp-pg .tp-h2,.tp-pg .tp-vazado{"
        + "text-align:var(--tp-al-tit,inherit);"
        + "text-transform:var(--tp-cx-tit,inherit)}",
      ".tp-pg .tp-p,.tp-pg p,.tp-pg li,.tp-pg td{"
        + "text-align:var(--tp-al-txt,inherit);"
        + "line-height:calc(var(--tp-lh,1) * 1.5)}",
      /* ⚠ o valor da tabela continua à direita: número alinhado com o texto
         vira coluna torta, e isso não é preferência, é leitura de dinheiro */
      ".tp-pg td.tp-num{text-align:right}",

      /* =================================================================
       * A RÉGUA E O MARCADOR, quando o usuário mexeu
       *
       * ⚠ Cada propriedade cai no desenho original pelo segundo argumento do
       *   `var()`: quem nunca abriu "Linhas e símbolos" recebe exatamente o
       *   documento de antes, byte a byte.
       * =============================================================== */
      ".tp-pg .tp-rule{display:var(--tp-rg-disp,block);"
        + "height:var(--tp-rg-h,1.4px);"
        + "width:var(--tp-rg-w,100%);"
        + "background:var(--tp-rg-cor,var(--tp-titulo));"
        + "border-top-style:var(--tp-rg-borda,none);"
        + "border-top-width:var(--tp-rg-bw,0);"
        + "border-top-color:var(--tp-rg-cor,var(--tp-titulo))}",
      /* ⚠ na régua de borda (dupla/tracejada/pontilhada) a altura vai a ZERO:
         o fundo continua declarado mas nao pinta nada, e quem desenha e a
         borda. Sem isso sairia um bloco cheio com a borda por cima. */
      ".tp-pg ul{list-style-type:var(--tp-mk,disc)}",
    ].join("\n");
  };

  /* =====================================================================
   * 9. A VARREDURA DE VAZAMENTO
   *
   * O `carpproposta.js` já varre o documento dele. O modelo é caminho NOVO
   * até o mesmo papel, então precisa da mesma varredura — senão a proteção
   * que existe há meses vira meia proteção no dia em que alguém troca de
   * layout. Recebe o HTML pronto e os números que NÃO podem aparecer.
   * ===================================================================== */
  PropTpl.auditar = function (html, proibidos) {
    var h = String(html || "");
    var achados = [];
    /* palavras que não têm o que fazer num documento de cliente */
    ["custo de compra", "custo unit", "margem de", "margem:", "lucro"].forEach(function (p) {
      if (h.toLowerCase().indexOf(p) > -1) achados.push('a palavra "' + p + '"');
    });
    /* e os valores que a tela sabe que são internos */
    arr(proibidos).forEach(function (v) {
      var n = num(v);
      if (!(n > 0)) return;
      var s = moeda(n);
      if (h.indexOf(s) > -1) achados.push("o valor " + s);
    });
    return achados;
  };


  /* =====================================================================
   * LEVAR E TRAZER UM MODELO — o arquivo que vai de uma conta para outra
   *
   * Para quem quer usar o desenho de outra empresa, e para o caso de alguém
   * ficar só na criação dos modelos e mandar prontos para quem orça.
   *
   * ⚠ AS FOTOS VIAJAM DENTRO. Um modelo guarda a foto por REFERÊNCIA (`{id,
   *   remoto}`, uns 80 bytes) — a imagem em si mora no guardador de fotos da
   *   CONTA. Exportar só a referência entregaria um arquivo que abre com
   *   todos os slots vazios na outra ponta, e o desenho é justamente o que se
   *   está levando. Aqui as imagens vão embutidas em base64.
   *
   * ⚠ O QUE NÃO VIAJA, E POR QUÊ:
   *   · `id` — quem importa ganha id novo. Reaproveitar sobrescreveria um
   *     modelo que já existe na conta de destino, sem avisar.
   *   · `paraCliente` — é o id de um cliente da conta de ORIGEM. Na de
   *     destino ele não existe (viraria "cliente removido"), e é material de
   *     outra empresa: não tem por que atravessar.
   *   · `padrao` — importar não pode trocar, calado, qual modelo a empresa
   *     usa por omissão em toda proposta.
   *
   * ⚠ E O ARQUIVO SE IDENTIFICA. Sem a marca, qualquer .json cai no
   *   importador e o erro que sai é de campo faltando — a pessoa fica
   *   procurando defeito no modelo em vez de no arquivo escolhido.
   * =================================================================== */
  /* =====================================================================
   * MONTAR O MODELO A PARTIR DO ROTEIRO — sem servidor, sem inventar fato
   *
   * POR QUE ISTO EXISTE. "Montar com a IA" mandava o roteiro para o servidor
   * e, quando ele não respondia — sem licença, sem internet, rota fora do ar —
   * o botão terminava num toast vermelho e o usuário voltava à estaca zero.
   * Esta função monta a MESMA estrutura por regra, aqui dentro: escolhe as
   * páginas pelo que a pessoa respondeu, na ordem que uma proposta pede, e
   * escreve nos campos SÓ o que ela mesma digitou.
   *
   * ⚠ NÃO INVENTA FATO SOBRE A EMPRESA. Cada frase montada aqui é feita das
   *   palavras do roteiro. O que ninguém respondeu vira `[preencher: …]`, que
   *   a tela de anexos lista depois — em vez de virar uma afirmação que a
   *   empresa nunca fez e que o cliente lê como promessa.
   *
   * ⚠ E É PURA: não lê Store, não lê tela, não olha relógio. É o que permite
   *   testá-la fora do navegador e usá-la tanto como resposta principal
   *   quanto como rede embaixo da IA.
   * ===================================================================== */
  var AG_FOTOS = {
    "Nenhuma por enquanto": 0,
    "1 ou 2": 2,
    "3 a 5": 5,
    "Mais de 5": 9
  };
  var AG_TOM = {
    "Sóbrio e técnico": { fonte: "tecnica", ornamento: "", fundoInternas: "claro",
      estilo: { corTitulo: "#14304F", corTexto: "#26262A", corDestaque: "#14304F", corDestaque2: "#2E6F9E", corFundoEscuro: "#14304F" } },
    "Marcante e visual": { fonte: "impacto", ornamento: "curvas", fundoInternas: "",
      estilo: { corTitulo: "#1B2A5B", corTexto: "#2A2A2A", corDestaque: "#B3202E", corDestaque2: "#E08A1E", corFundoEscuro: "#1B2A5B" } },
    "Equilibrado": { fonte: "montserrat", ornamento: "curvas", fundoInternas: "claro",
      estilo: { corTitulo: "#12395A", corTexto: "#26303A", corDestaque: "#7A6B4E", corDestaque2: "#3F7D22", corFundoEscuro: "#0F2F4A" } }
  };
  function preencher(oque) { return "[preencher: " + oque + "]"; }

  /* uma linha "Título | descrição" para a página de serviços, a partir de
     uma linha crua do roteiro (que pode já vir com a barra ou não) */
  function servicoLinha(linha) {
    var x = txt(linha);
    if (!x) return "";
    if (x.indexOf("|") > -1) return x;
    /* "deck de cumaru instalado — com a instalação": o travessão vira a barra,
       porque é assim que a pessoa costuma separar o nome da explicação */
    var m = x.match(/^(.{3,60}?)\s+[—–-]\s+(.+)$/);
    if (m) return m[1].trim() + " | " + m[2].trim();
    return x;
  }

  PropTpl.montarDoRoteiro = function (roteiro) {
    var r = roteiro || {};
    var ramo = txt(r.ramo), vende = txt(r.oQueVende), paraQuem = txt(r.paraQuem);
    var tom = AG_TOM[txt(r.tom)] || AG_TOM["Equilibrado"];
    var nFotos = AG_FOTOS[txt(r.quantasFotos)];
    if (nFotos == null) nFotos = 2;
    var vertical = /celular/i.test(txt(r.formato));
    var itensVende = linhasDe(vende), difs = linhasDe(r.diferenciais), naoFalta = linhasDe(r.naoPodeFaltar);

    var estilo = {};
    for (var k in tom.estilo) if (Object.prototype.hasOwnProperty.call(tom.estilo, k)) estilo[k] = tom.estilo[k];
    estilo.corFundo = "#FFFFFF";
    estilo.textura = "";
    estilo.fonte = tom.fonte;
    estilo.formato = vertical ? "vertical" : "a4";
    /* ⚠ SEM FOTO, O ORNAMENTO NÃO É ENFEITE: é o que a capa tem para mostrar.
       Sem ele, quem respondeu "nenhuma por enquanto" recebe a capa com o
       quadro listrado de "falta foto" — e manda isso ao cliente. */
    estilo.ornamento = nFotos === 0 ? "curvas" : tom.ornamento;
    estilo.rodape = "contatos";
    estilo.fundoInternas = tom.fundoInternas;
    /* o logo da empresa costuma ser escuro, e toda capa aqui é escura */
    estilo.logoEscuro = "clarear";

    var paginas = [], n = 0;
    function pg(o) { o.id = "p" + (++n); paginas.push(o); return o; }

    /* 1. CAPA — sempre. Sem foto ela não fica vazia: o ornamento cobre. */
    pg({ tipo: "capa", titulo: "PROPOSTA", subtitulo: vertical ? "" : "COMERCIAL",
      chamada: ramo ? ramo.charAt(0).toUpperCase() + ramo.slice(1) : preencher("uma linha sobre o que a empresa faz"),
      mostrarCliente: true, mostrarNumero: true, mostrarLogo: true });

    /* 2. QUEM SOMOS — só com o que a pessoa escreveu */
    var quem = [];
    if (ramo) quem.push("Trabalhamos com " + ramo + ".");
    else quem.push(preencher("o que a empresa faz, em uma frase"));
    if (paraQuem) quem.push("Atendemos " + paraQuem + ".");
    if (difs.length) quem.push(difs.join(" "));
    else quem.push(preencher("por que o cliente escolhe vocês"));
    pg({ tipo: "sobre", titulo: "QUEM SOMOS", texto: quem.join("\n"), mostrarLogo: true });

    /* 3. O QUE FAZEMOS — os itens que a pessoa listou viram cartões */
    if (itensVende.length) {
      pg({ tipo: "servicos", titulo: "O QUE FAZEMOS",
        abertura: paraQuem ? "Atendemos " + paraQuem + ", do primeiro contato à entrega." : "",
        itens: itensVende.map(servicoLinha).filter(Boolean).join("\n"),
        fechamento: difs.length ? difs[0] : "" });
    }

    /* 4. GALERIA — só quando há foto para ela. Página de foto sem foto é
       espaço listrado no meio da proposta. */
    if (nFotos >= 5) pg({ tipo: "imagens", titulo: "Alguns trabalhos nossos", legenda: "" });

    /* 5. ESCOPO — a lista sai do orçamento na hora de gerar (usarComercial);
       o que a pessoa disse que não pode faltar entra como observação. */
    pg({ tipo: "texto", titulo: "Escopo dos serviços",
      abertura: "Os serviços abaixo foram dimensionados a partir das informações fornecidas pelo cliente.",
      rotuloLista: "Está incluso:", obsTitulo: "Não está incluso:",
      observacao: "", usarComercial: true });

    /* 6. o que NÃO pode faltar vira uma página própria, com as palavras dela */
    if (naoFalta.length) {
      pg({ tipo: "condicoes", titulo: "O que você recebe", paragrafos: naoFalta.join("\n"),
        usarPrazo: false, usarGarantia: false });
    }

    /* 7. INVESTIMENTO — obrigatória: é ela que leva os preços */
    pg({ tipo: "investimento", titulo: "INVESTIMENTO", colTrabalho: "Serviço", colValor: "Valor",
      tituloPagamento: "CONDIÇÕES DE PAGAMENTO", detalhar: true,
      tipografia: { escalaTitulo: 90, escalaTexto: 90 } });

    /* 8. CONDIÇÕES — prazo e garantia vêm do orçamento, prontos */
    pg({ tipo: "condicoes", titulo: "Condições gerais", paragrafos: "", usarPrazo: true, usarGarantia: true });

    /* 9. ACEITE */
    pg({ tipo: "assinatura", titulo: "ACEITE DA PROPOSTA",
      texto: "A assinatura abaixo formaliza a aprovação do escopo, dos valores e das condições desta proposta.",
      mostrarValidade: true });

    /* 10. ENCERRAMENTO — página de foto inteira; só quando há foto de sobra */
    if (nFotos >= 9) pg({ tipo: "encerramento", frase: "Obrigado pela oportunidade. Estamos à disposição para começar.", mostrarLogo: true });

    /* 11. CONTATO — sempre; a foto da equipe só quando ela existe */
    pg({ tipo: "contato", titulo: "FALE CONOSCO", usarEmpresa: true,
      botaoPlanilha: true, mostrarFoto: nFotos >= 2, molduraCelular: vertical });

    var nome = ramo ? ("Proposta — " + ramo.charAt(0).toUpperCase() + ramo.slice(1)) : "Modelo da minha empresa";
    return PropTpl.modelo({
      nome: nome.length > 60 ? nome.slice(0, 60) : nome,
      descricao: (vertical ? "Vertical (celular)" : "A4") + " · " + paginas.length + " páginas · montado pelo roteiro",
      estilo: estilo, paginas: paginas
    });
  };

  /* =====================================================================
   * A RESPOSTA DA IA, CONFERIDA ANTES DE VIRAR MODELO
   *
   * ⚠ `PropTpl.modelo` DESCARTA EM SILÊNCIO o que não reconhece: uma página
   *   com `tipo: "portfolio"` (que a IA pode inventar) simplesmente some, e o
   *   usuário recebe um modelo com menos páginas sem nenhuma explicação —
   *   ou, se sobrar pouca coisa, uma recusa seca de "falta a página de
   *   Investimento". Aqui o descarte é CONTADO e devolvido, para a tela poder
   *   dizer o que veio, o que não veio e por quê.
   *
   * ⚠ E A PÁGINA DE INVESTIMENTO É COSTURADA SE FALTAR: é ela que leva o
   *   preço. Um modelo sem ela não é um modelo de proposta.
   * ===================================================================== */
  PropTpl.doAgente = function (resposta) {
    var r = resposta || {};
    var descartadas = [];
    var brutas = arr(r.paginas);
    var boas = brutas.filter(function (p) {
      var t = txt(p && p.tipo);
      if (PropTpl.bloco(t)) return true;
      descartadas.push(t || "(sem tipo)");
      return false;
    });
    if (!boas.length) return { ok: false, erro: "A estrutura devolvida não tem nenhuma página que este sistema saiba desenhar." };

    var costurado = false;
    if (!boas.filter(function (p) { return txt(p.tipo) === "investimento"; }).length) {
      boas.push({ tipo: "investimento", titulo: "INVESTIMENTO", detalhar: true });
      costurado = true;
    }
    boas.forEach(function (p, i) { if (!txt(p.id)) p.id = "p" + (i + 1); });

    var m = PropTpl.modelo({ nome: r.nome, descricao: r.descricao, estilo: r.estilo, paginas: boas });
    var faltas = PropTpl.validar(m);
    if (faltas.length) return { ok: false, erro: faltas[0] };
    return { ok: true, modelo: m, descartadas: descartadas, investimentoCosturado: costurado };
  };

  PropTpl.MARCA_ARQUIVO = "orcapro:modelo-de-proposta";
  PropTpl.VERSAO_ARQUIVO = 1;

  /* `imagens` chega já resolvida pela tela: { "<slot>": "data:image/..." } */
  PropTpl.paraArquivo = function (modelo, imagens) {
    var m = PropTpl.modelo(modelo);
    var fora = {};
    (PropTpl.slots(m) || []).forEach(function (s) {
      var d = imagens && imagens[String(s.numero)];
      if (d) fora[String(s.numero)] = String(d);
    });
    return {
      marca: PropTpl.MARCA_ARQUIVO,
      versao: PropTpl.VERSAO_ARQUIVO,
      exportadoEm: null,          /* quem exporta carimba; o motor não olha relógio */
      modelo: {
        nome: m.nome, descricao: m.descricao,
        estilo: m.estilo, paginas: m.paginas,
        /* o logo VAI junto: `modelo()` já o validou, e sem ele o modelo chega
           na outra conta com [LOGO] na capa — o defeito que este campo evita */
        logo: m.logo
        /* sem id, sem paraCliente, sem padrao, sem imagens: ver o cabeçalho */
      },
      imagens: fora
    };
  };

  /* Lê o arquivo e devolve { ok, erro, modelo, imagens, nSlots, nFotos }.
     Puro: não grava nada, não conhece Store nem Fotos. */
  PropTpl.doArquivo = function (obj) {
    var d = obj || {};
    if (txt(d.marca) !== PropTpl.MARCA_ARQUIVO) {
      return { ok: false, erro: "Este arquivo não é um modelo de proposta do OrçaPRO." };
    }
    if (num(d.versao) > PropTpl.VERSAO_ARQUIVO) {
      return { ok: false, erro: "Este modelo veio de uma versão mais nova do OrçaPRO. Atualize o sistema e tente de novo." };
    }
    var cru = d.modelo || {};
    if (!txt(cru.nome)) return { ok: false, erro: "O arquivo não tem o nome do modelo." };

    var m = PropTpl.modelo({
      nome: cru.nome, descricao: cru.descricao,
      estilo: cru.estilo, paginas: cru.paginas, logo: cru.logo
    });
    if (!m.paginas.length) return { ok: false, erro: "O arquivo não tem nenhuma página." };

    var imgs = {}, n = 0;
    var sl = PropTpl.slots(m) || [];
    sl.forEach(function (s) {
      var v = (d.imagens || {})[String(s.numero)];
      /* ⚠ só data URI de imagem entra: o campo vem de arquivo de fora, e um
         `javascript:` ou um `http://` aqui viraria conteúdo de terceiro
         dentro do documento que a empresa manda para o cliente dela. */
      if (typeof v === "string" && /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(v)) {
        imgs[String(s.numero)] = v; n++;
      }
    });
    return { ok: true, modelo: m, imagens: imgs, nSlots: sl.length, nFotos: n, temLogo: !!m.logo };
  };

  /* nome que não colide com o que já existe na conta de destino */
  PropTpl.nomeLivre = function (nome, usados) {
    var base = txt(nome) || "Modelo importado";
    var tem = {};
    (usados || []).forEach(function (x) { tem[txt(x).toLowerCase()] = 1; });
    if (!tem[base.toLowerCase()]) return base;
    var tentativa = base + " (importado)";
    if (!tem[tentativa.toLowerCase()]) return tentativa;
    for (var i = 2; i < 200; i++) {
      var c = base + " (importado " + i + ")";
      if (!tem[c.toLowerCase()]) return c;
    }
    return base + " (importado)";
  };

  global.PropTpl = PropTpl;
  if (typeof module !== "undefined" && module.exports) module.exports = PropTpl;
})(typeof window !== "undefined" ? window : this);
