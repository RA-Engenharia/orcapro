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
        { id: "observacao", nome: "Observação", tipo: "multi", dica: "O que NÃO está incluso costuma ir aqui — é o que evita discussão depois." }
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
    {
      id: "condensada",
      nome: "Condensada — títulos pesados",
      exemplo: "PROPOSTA",
      titulo: '"Arial Narrow", "Haettenschweiler", Impact, "Franklin Gothic Medium", sans-serif',
      texto: '"Segoe UI", "Helvetica Neue", Arial, sans-serif'
    },
    {
      id: "geometrica",
      nome: "Geométrica — moderna e redonda",
      exemplo: "Proposta",
      titulo: '"Century Gothic", "Futura", "Trebuchet MS", "Segoe UI", sans-serif',
      texto: '"Century Gothic", "Futura", "Trebuchet MS", "Segoe UI", sans-serif'
    },
    {
      id: "classica",
      nome: "Clássica — serifada, sóbria",
      exemplo: "Proposta",
      titulo: 'Georgia, "Times New Roman", "Palatino Linotype", serif',
      texto: 'Georgia, "Times New Roman", "Palatino Linotype", serif'
    },
    {
      id: "mista",
      nome: "Mista — título serifado, texto seco",
      exemplo: "Proposta",
      titulo: 'Georgia, "Palatino Linotype", "Book Antiqua", serif',
      texto: '"Segoe UI", "Helvetica Neue", Arial, sans-serif'
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
  var ESTILO_PADRAO = {
    corTitulo: "#1B2A5B",
    corTexto: "#2A2A2A",
    corFundo: "#FFFFFF",
    corDestaque: "#B3202E",
    corFundoEscuro: "#5C3A1E",
    textura: "",
    fonte: "condensada",
    formato: "a4"
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

    var paginas = arr(m.paginas).map(function (p, i) {
      var b = PropTpl.bloco(p && p.tipo);
      if (!b) return null;
      var out = { id: txt(p.id) || ("pg" + (i + 1)), tipo: b.tipo };
      b.campos.forEach(function (c) {
        var v = p[c.id];
        if (c.tipo === "sim_nao") out[c.id] = (v === undefined || v === null) ? !!c.padrao : !!v;
        else out[c.id] = (v === undefined || v === null || txt(v) === "") ? txt(c.padrao) : txt(v);
      });
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
          paginaNome: b.nome,
          ordemNaPagina: i + 1,
          rotulo: "Imagem " + n,
          onde: b.nome + (b.imagens > 1 ? " · " + (i + 1) + "ª" : ""),
          ref: m.imagens[String(n)] || null
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
    var vazios = PropTpl.slots(m).filter(function (s) { return !s.ref; });
    if (vazios.length) {
      av.push(vazios.length + " imagem(ns) sem foto: " +
        vazios.slice(0, 4).map(function (s) { return s.rotulo + " (" + s.onde + ")"; }).join(", ") +
        (vazios.length > 4 ? "…" : "") + ". A proposta sai com o espaço em branco.");
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
    var vertical = m.estilo.formato === "vertical";

    var partes = m.paginas.map(function (p) {
      var bl = PropTpl.bloco(p.tipo);
      if (!bl) return "";
      var corpo = "";

      if (p.tipo === "capa") {
        corpo = '<div class="tp-full">' + proxImg("foto de capa", "tp-bg") + '<div class="tp-sombra"></div>'
          + '<div class="tp-capa-txt">'
          + (p.mostrarLogo && d.logoHTML ? '<div class="tp-logo">' + d.logoHTML + "</div>" : "")
          + '<h1 class="tp-h1">' + esc(p.titulo) + (p.subtitulo ? '<br><span>' + esc(p.subtitulo) + "</span>" : "") + "</h1>"
          + (p.chamada ? '<p class="tp-chamada">' + esc(p.chamada) + "</p>" : "")
          + (p.mostrarCliente && d.cliente ? '<p class="tp-cli">' + esc(d.cliente) + "</p>" : "")
          + "</div></div>";
      }
      else if (p.tipo === "sobre") {
        corpo = '<div class="tp-full">' + proxImg("foto de apresentação", "tp-bg") + '<div class="tp-sombra"></div>'
          + '<div class="tp-sobre-txt">'
          + (p.mostrarLogo && d.logoHTML ? '<div class="tp-logo tp-logo-c">' + d.logoHTML + "</div>" : "")
          + '<h2 class="tp-vazado">' + esc(p.titulo) + "</h2>"
          + '<p class="tp-sobre-p">' + escML(p.texto) + "</p>"
          + "</div></div>";
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
        corpo = '<h2 class="tp-h2">' + esc(p.titulo) + '</h2><div class="tp-rule"></div>'
          + (txt(p.abertura) ? '<p class="tp-p">' + escML(p.abertura) + "</p>" : "")
          + (its.length ? '<p class="tp-p tp-rot">' + esc(p.rotuloLista) + "</p><ul class=\"tp-ul\">"
              + its.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : "")
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
        if (p.usarPrazo && txt(com.prazoExecucao)) ps.push("Prazo de execução: " + txt(com.prazoExecucao) + ".");
        if (p.usarGarantia && txt(com.garantia)) ps.push("Garantia: " + txt(com.garantia) + ".");
        corpo = '<h2 class="tp-h2">' + esc(p.titulo) + '</h2><div class="tp-rule"></div>'
          + ps.map(function (x) { return '<p class="tp-p tp-solto">' + esc(x) + "</p>"; }).join("");
      }
      else if (p.tipo === "encerramento") {
        corpo = '<div class="tp-full">' + proxImg("foto de encerramento", "tp-bg") + '<div class="tp-sombra"></div>'
          + '<div class="tp-fim-txt">'
          + (p.mostrarLogo && d.logoHTML ? '<div class="tp-logo tp-logo-g">' + d.logoHTML + "</div>" : "")
          + '<p class="tp-fim-p">' + escML(p.frase) + "</p>"
          + "</div></div>";
      }
      else if (p.tipo === "contato") {
        var foto = proxImg("foto da equipe", "tp-contato-img");
        corpo = '<p class="tp-marca">' + esc(txt(emp.nome)) + '</p><div class="tp-rule"></div>'
          + (p.molduraCelular ? '<div class="tp-cel"><div class="tp-cel-tela">' + foto + "</div></div>" : '<div class="tp-contato-livre">' + foto + "</div>")
          + '<h2 class="tp-h1c tp-h1e">' + esc(p.titulo) + "</h2>"
          + '<div class="tp-contatos">'
          + (txt(p.pessoas) ? "<div>" + esc(p.pessoas) + "</div>" : "")
          + (txt(p.redes) ? "<div>" + esc(p.redes) + "</div>" : "")
          + (txt(p.telefone) ? "<div>" + esc(p.telefone) + "</div>" : "")
          + (txt(p.site) ? "<div>" + esc(p.site) + "</div>" : "")
          + "</div>";
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

      var escuro = (p.tipo === "texto" || p.tipo === "condicoes" || p.tipo === "imagens");
      var cls = "tp-pg" + (vertical ? " tp-vert" : "")
        + (p.tipo === "capa" || p.tipo === "sobre" || p.tipo === "encerramento" ? " tp-cheia" : "")
        + (escuro ? " tp-escura" : "");
      var estilo = (p.tipo === "capa" || p.tipo === "sobre" || p.tipo === "encerramento")
        ? "" : ' style="' + fundoDe(m, escuro) + '"';
      return '<section class="' + cls + '"' + estilo + ">" + corpo + "</section>";
    }).join("");

    return '<div class="tp-doc" style="' + estiloRaiz(m, f) + '">' + partes + "</div>";
  };

  function estiloRaiz(m, f) {
    return "--tp-titulo:" + m.estilo.corTitulo
      + ";--tp-texto:" + m.estilo.corTexto
      + ";--tp-destaque:" + m.estilo.corDestaque
      + ";--tp-escuro:" + m.estilo.corFundoEscuro
      + ";--tp-f-tit:" + f.titulo
      + ";--tp-f-txt:" + f.texto;
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
  PropTpl.css = function () {
    return [
      "@page{margin:0}",
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
      ".tp-logo{max-width:34mm;margin-bottom:8mm}",
      ".tp-logo img,.tp-logo svg{max-width:100%;height:auto;display:block}",
      ".tp-logo-c{margin:0 auto 6mm;max-width:44mm}",
      ".tp-logo-g{margin:0 auto 8mm;max-width:62mm}",
      ".tp-h1{font-family:var(--tp-f-tit);font-weight:700;font-size:44pt;line-height:.94;letter-spacing:-.01em;text-transform:uppercase;margin:0 0 6mm;color:#fff}",
      ".tp-vert .tp-h1{font-size:34pt}",
      ".tp-chamada{font-family:var(--tp-f-tit);font-size:13pt;text-transform:uppercase;letter-spacing:.02em;margin:0 0 4mm;color:#fff}",
      ".tp-cli{font-size:12pt;letter-spacing:.12em;text-transform:uppercase;margin:0;color:rgba(255,255,255,.92)}",
      ".tp-sobre-txt{position:absolute;left:0;right:0;top:16%;padding:0 12mm}",
      ".tp-vazado{font-family:var(--tp-f-tit);font-size:30pt;text-transform:uppercase;letter-spacing:.02em;margin:0 0 5mm;color:transparent;-webkit-text-stroke:1px rgba(255,255,255,.92);text-align:center}",
      ".tp-sobre-p{font-size:12.5pt;line-height:1.55;margin:0;color:#fff}",
      ".tp-h2{font-family:var(--tp-f-tit);font-size:17pt;font-weight:700;margin:0 0 4mm;letter-spacing:.01em}",
      ".tp-h1c{font-family:var(--tp-f-tit);font-size:26pt;font-weight:700;text-transform:uppercase;text-align:center;color:var(--tp-titulo);margin:0 0 8mm;letter-spacing:.01em}",
      ".tp-h1e{margin-top:8mm}",
      ".tp-h3pag{font-size:18pt;margin-top:12mm}",
      ".tp-rule{height:1.4px;background:var(--tp-titulo);margin:0 0 7mm}",
      ".tp-p{font-size:11.5pt;margin:0 0 4mm}",
      ".tp-solto{margin-bottom:6mm}",
      ".tp-rot{margin-bottom:2mm}",
      ".tp-ul{margin:0 0 5mm;padding-left:6mm;font-size:11.5pt}",
      ".tp-ul li{margin-bottom:2mm}",
      ".tp-obs{font-size:11pt;margin:6mm 0 0}",
      ".tp-leg{font-size:10.5pt;margin:4mm 0 0;opacity:.9}",
      ".tp-galeria{display:flex;flex-direction:column;gap:5mm}",
      ".tp-gal{width:100%;height:52mm;object-fit:cover;display:block}",
      ".tp-vert .tp-gal{height:44mm}",
      ".tp-tbl{width:100%;border-collapse:collapse;font-size:11.5pt}",
      ".tp-tbl th{background:var(--tp-titulo);color:#fff;text-align:left;padding:4mm 4mm;font-weight:600}",
      ".tp-tbl td{border:1px solid var(--tp-titulo);padding:3.4mm 4mm;vertical-align:top}",
      ".tp-tbl .tp-num{text-align:right;white-space:nowrap}",
      ".tp-tbl th.tp-num{text-align:right}",
      ".tp-grupo td{background:rgba(0,0,0,.05);font-weight:600;text-transform:uppercase;font-size:9.5pt;letter-spacing:.06em}",
      ".tp-qtd{opacity:.7;font-size:10pt}",
      ".tp-vaziotxt{text-align:center;opacity:.6}",
      ".tp-total{text-align:center;font-size:14pt;margin:7mm 0 0;color:var(--tp-titulo)}",
      ".tp-pag{text-align:center;font-size:12.5pt;margin:0;color:var(--tp-titulo)}",
      ".tp-marca{font-size:11pt;letter-spacing:.08em;text-transform:uppercase;margin:0 0 3mm;color:var(--tp-titulo)}",
      ".tp-cel{width:56mm;margin:10mm auto;border:2.4mm solid #1b1b1f;border-radius:7mm;background:#1b1b1f;padding:0;overflow:hidden}",
      ".tp-cel-tela{position:relative;width:100%;height:96mm;overflow:hidden;border-radius:3mm}",
      ".tp-contato-img{width:100%;height:100%;object-fit:cover;display:block}",
      ".tp-contato-livre{width:100%;height:80mm;overflow:hidden;margin:8mm 0}",
      ".tp-contato-livre .tp-vazio{height:100%}",
      ".tp-cel-tela .tp-vazio{height:100%}",
      ".tp-contatos{text-align:center;font-size:12pt;line-height:1.7;color:var(--tp-titulo)}",
      ".tp-fim-txt{position:absolute;left:0;right:0;top:38%;padding:0 14mm;text-align:center}",
      ".tp-fim-p{font-size:14pt;line-height:1.5;margin:0;color:#fff}",
      ".tp-local{margin-top:14mm}",
      ".tp-assin{display:flex;gap:12mm;margin-top:20mm;font-size:10.5pt;text-align:center}",
      ".tp-assin>div{flex:1}",
      ".tp-linha{border-top:1px solid var(--tp-texto);margin-bottom:2mm}"
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
        estilo: m.estilo, paginas: m.paginas
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
      estilo: cru.estilo, paginas: cru.paginas
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
    return { ok: true, modelo: m, imagens: imgs, nSlots: sl.length, nFotos: n };
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
