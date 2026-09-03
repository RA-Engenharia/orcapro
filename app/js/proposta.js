/* =====================================================================
 * proposta.js — Gerador de Proposta Comercial (impressão/PDF via navegador)
 * Sem dependência externa: monta HTML pronto p/ "Imprimir → Salvar PDF".
 * Identidade RA Engenharia (navy/aço), marca d'água nas internas, placeholders.
 * Conteúdo conforme padrão A.7: capa, apresentação, escopo, incluso/excluso,
 * premissas, metodologia, resumo financeiro, condições, responsabilidades,
 * garantias, assinatura.
 * ===================================================================== */
(function (global) {
  "use strict";

  var Proposta = {

    /* Botão [GERAR PROPOSTA] só habilita se passar nesta validação. */
    validar: function (orc) {
      var faltando = [];
      if (!orc.cliente || !Util.naoVazio(orc.cliente.nome)) faltando.push("Cliente vinculado");
      var totais = Orcamento.totais(orc);
      if (totais.qtdItens < 1) faltando.push("Ao menos 1 item no escopo");
      // ZERO não é preço: orçamento com item sem custo não vira proposta —
      // o usuário cota (planilha ou detalhamento do insumo) e preenche antes.
      var semPreco = Orcamento.itensSemPreco ? Orcamento.itensSemPreco(orc) : [];
      if (semPreco.length) {
        faltando.push("Preço em " + semPreco.length + " item(ns): " +
          semPreco.slice(0, 3).map(function (i) { return i.numero + (i.codigo ? " (" + i.codigo + ")" : ""); }).join(", ") +
          (semPreco.length > 3 ? "…" : ""));
      }
      /* v1.1.232 — QUANTIDADE PENDENTE bloqueia igual ao preco zerado. O item
         trazido sem metragem (fluxo do memorial) passava por aqui valendo R$ 0:
         a proposta saia com o servico LISTADO no escopo e valendo nada — o
         cliente aceitava um preco que nao continha aquele servico. */
      var semQtd = Orcamento.itensSemQuantidade ? Orcamento.itensSemQuantidade(orc) : [];
      if (semQtd.length) {
        faltando.push("Quantidade em " + semQtd.length + " item(ns): " +
          semQtd.slice(0, 3).map(function (x) { return (x.item.codigo || x.item.descricao.slice(0, 18)); }).join(", ") +
          (semQtd.length > 3 ? "…" : "") + " — use o botao Calcular na linha");
      }
      Orcamento.garantirComercial(orc);
      if (!Util.naoVazio(orc.comercial.condicoesPagamento)) faltando.push("Condições de pagamento");
      return { ok: faltando.length === 0, faltando: faltando };
    },

    /* Converte texto multilinha em <li> (cada linha = um item). */
    _lista: function (txt) {
      return String(txt || "").split(/\r?\n/).filter(function (l) { return l.trim(); })
        .map(function (l) { return "<li>" + Util.esc(l.trim().replace(/;$/, "")) + "</li>"; }).join("");
    },

    /* Gera o documento completo (innerHTML do container de impressão). */
    gerarHTML: function (orc, usuario) {
      var c = Orcamento.garantirComercial(orc);
      var t = Orcamento.totais(orc);
      var sint = Orcamento.sintetico(orc);
      var marca = CONFIG.marca;
      var emp = (typeof Empresa !== "undefined") ? Empresa.dados() : null;
      // White-label: o documento é da EMPRESA DO CLIENTE — nunca cai no fabricante.
      var empresa = (emp && emp.nome) || (usuario && usuario.empresa) || "Sua Empresa";
      var logoHTML = (typeof Empresa !== "undefined") ? Empresa.logoHTML(80) : '<div class="logo-ph">[LOGO ' + Util.esc(empresa) + ']</div>';
      var hoje = new Date().toLocaleDateString("pt-BR");
      function hoje2ISO() { return Util.agoraISO(); }

      var linhasSint = sint.map(function (s) {
        return '<tr><td>' + Util.esc(s.codigo) + '</td><td>' + Util.esc(s.nome) + '</td>' +
          '<td class="r">' + Util.fmtMoeda(s.precoVenda) + '</td>' +
          '<td class="r">' + Util.fmtPct(s.peso, 1) + '</td></tr>';
      }).join("");

      var apresentacao = Util.naoVazio(c.apresentacao) ? Util.esc(c.apresentacao) :
        'A <b>' + Util.esc(empresa) + '</b> atua em projetos e execução de obras de engenharia e ' +
        'arquitetura, comprometida com qualidade técnica, transparência e cumprimento de prazos. ' +
        'Apresentamos a seguir nossa proposta para o empreendimento em referência.';

      // ---- Páginas ----
      var P = [];

      // 1) CAPA
      P.push(
        '<section class="pg capa">' +
          '<div class="capa-top">' + logoHTML + '</div>' +
          '<div class="capa-mid">' +
            '<div class="kicker">PROPOSTA COMERCIAL</div>' +
            '<h1>' + Util.esc(orc.nome) + '</h1>' +
            '<div class="capa-obra">' + Util.esc(orc.obra && orc.obra.nome ? orc.obra.nome : "Obra a definir") + '</div>' +
          '</div>' +
          '<div class="capa-info">' +
            row("Cliente", orc.cliente.nome) +
            row("Proposta nº", orc.numero) +
            row("Data", hoje) +
            /* a data vence a frase: "15 dias corridos" não diz ao cliente
               até quando ele pode aceitar (ver Proposta.validade) */
            row("Validade", (function () { var v = Proposta.validade(orc, hoje2ISO()); return v.temData ? v.texto.replace(/^Válida até /, "") : v.frase; })()) +
            rowRaw("Valor total", '<b style="color:var(--p-verde)">' + Util.fmtMoeda(t.precoVenda) + '</b>') +
          '</div>' +
          '<div class="capa-rod">' + Util.esc(empresa) +
            (emp && Util.naoVazio(emp.cnpj) ? ' · CNPJ ' + Util.esc(emp.cnpj) : '') +
            (emp && Util.naoVazio(emp.endereco) ? ' · ' + Util.esc(emp.endereco) : (emp && Util.naoVazio(emp.cidade) ? ' · ' + Util.esc(emp.cidade) : '')) +
            ((typeof Empresa !== "undefined" && Empresa.creditoTexto && Empresa.creditoTexto()) ? ' · ' + Util.esc(Empresa.creditoTexto()) : '') + '</div>' +
        '</section>');

      // 2) APRESENTAÇÃO
      P.push(pg("1. Apresentação", '<p>' + apresentacao + '</p>' +
        '<p>Esta proposta foi elaborada com base nas informações disponibilizadas e em composições de ' +
        'custos referenciadas ' + (Orcamento.basesUsadas(orc).length > 1 ? 'nas bases de preços' : 'na base de preços') + ' <b>' + Util.esc(Orcamento.basesUsadasTexto(orc)) + '</b>, ' +
        'acrescidas de BDI de <b>' + Util.fmtPct(t.bdiPercentual) + '</b>.</p>'));

      // 3) ENTENDIMENTO DO ESCOPO
      var escopoLi = sint.map(function (s) { return '<li><b>' + Util.esc(s.codigo) + '</b> — ' + Util.esc(s.nome) + ' (' + s.qtdItens + ' itens)</li>'; }).join("");
      P.push(pg("2. Entendimento do Escopo",
        '<p>O escopo dos serviços contempla as seguintes etapas:</p><ul>' + (escopoLi || '<li>—</li>') + '</ul>'));

      // 4) INCLUSO / EXCLUSO
      P.push(pg("3. Está Incluso / Não Está Incluso",
        '<div class="cols"><div><h3>' + (typeof Icones !== 'undefined' ? Icones.get('check', 15) : '') + ' Incluso</h3><ul>' + this._lista(c.incluso) + '</ul></div>' +
        '<div><h3>' + (typeof Icones !== 'undefined' ? Icones.get('fechar', 15) : '') + ' Não incluso</h3><ul>' + this._lista(c.excluso) + '</ul></div></div>'));

      // 5) PREMISSAS E METODOLOGIA
      P.push(pg("4. Premissas e Metodologia",
        '<p><b>Premissas:</b> condições normais de trabalho e acesso à obra; fornecimento de água e energia ' +
        'pelo contratante durante a execução; quantitativos sujeitos a confirmação em projeto executivo.</p>' +
        '<p><b>Metodologia:</b> execução por etapas com medição mensal, controle de qualidade e ' +
        'acompanhamento técnico responsável, seguindo normas técnicas vigentes (ABNT).</p>' +
        '<p><b>' + (Orcamento.basesUsadas(orc).length > 1 ? 'Bases de preços:' : 'Base de preços:') + '</b> ' + Util.esc(Orcamento.basesUsadasTexto(orc)) +
        ', regime <b>' + Util.esc(Orcamento.regimeDe ? Orcamento.regimeDe(orc) : (orc.desonerado ? 'desonerado' : 'onerado')) + '</b>, ' +
        'BDI conforme metodologia do Acórdão TCU nº 2.622/2013.</p>'));

      // 6) RESUMO FINANCEIRO
      P.push(pg("5. Resumo Financeiro",
        '<table class="prop-tbl"><thead><tr><th>Etapa</th><th>Descrição</th><th class="r">Valor</th><th class="r">Peso</th></tr></thead>' +
        '<tbody>' + (linhasSint || '<tr><td colspan="4">—</td></tr>') + '</tbody>' +
        '<tfoot><tr><td colspan="2">VALOR TOTAL DA PROPOSTA</td><td class="r">' + Util.fmtMoeda(t.precoVenda) + '</td><td class="r">100%</td></tr></tfoot></table>' +
        '<p class="nota">Valores com BDI de ' + Util.fmtPct(t.bdiPercentual) + ' incluso. Custo direto de referência: ' + Util.fmtMoeda(t.custoDireto) + '.</p>'));

      // 7) CONDIÇÕES COMERCIAIS
      P.push(pg("6. Condições Comerciais",
        bloco("Forma de pagamento", c.condicoesPagamento) +
        bloco("Prazo de execução", c.prazoExecucao) +
        bloco("Validade da proposta", c.validadeProposta)));

      // 8) RESPONSABILIDADES
      P.push(pg("7. Responsabilidades",
        '<div class="cols"><div><h3>Contratada</h3><ul>' +
          '<li>Execução dos serviços conforme escopo e normas técnicas;</li>' +
          '<li>Fornecimento de mão de obra e EPIs da equipe;</li>' +
          '<li>Responsável técnico com ART/RRT.</li></ul></div>' +
        '<div><h3>Contratante</h3><ul>' +
          '<li>Liberação da obra e acessos;</li>' +
          '<li>Fornecimento de água e energia;</li>' +
          '<li>Aprovação de projetos e licenças.</li></ul></div></div>'));

      // 9) GARANTIAS
      P.push(pg("8. Garantias", '<p>' + Util.esc(c.garantia) + '</p>'));

      // 10) ASSINATURA
      P.push(pg("9. Aceite e Assinatura",
        '<p>Declaramos estar de acordo com os termos, valores e condições desta proposta comercial.</p>' +
        '<div class="assinaturas">' +
          '<div class="assin"><div class="linha-assin"></div>' + Util.esc(empresa) + '<br><span>Contratada</span></div>' +
          '<div class="assin"><div class="linha-assin"></div>' + Util.esc(orc.cliente.nome) + '<br><span>Contratante</span></div>' +
        '</div>' +
        '<p class="nota mt">' + Util.esc(orc.obra && orc.obra.local ? orc.obra.local : "Local") + ', ' + hoje + '.</p>'));

      return P.join("");
    }
  };

  function row(k, v) { return '<div class="ci-row"><span>' + Util.esc(k) + '</span><b>' + Util.esc(v) + '</b></div>'; }
  function rowRaw(k, v) { return '<div class="ci-row"><span>' + Util.esc(k) + '</span><b>' + v + '</b></div>'; }
  function bloco(titulo, txt) { return '<div class="bloco"><h3>' + Util.esc(titulo) + '</h3><p>' + Util.esc(txt) + '</p></div>'; }
  function pg(titulo, corpo) {
    // White-label: marca d'água e rodapé são da EMPRESA DO CLIENTE (configurável em ⚙ Empresa)
    var temEmp = typeof Empresa !== "undefined";
    var wm = temEmp && Empresa.marcaDaguaTexto ? Empresa.marcaDaguaTexto() : "";
    var rod = (temEmp && Empresa.nomeDoc && Empresa.nomeDoc()) || "";
    var cred = temEmp && Empresa.creditoTexto ? Empresa.creditoTexto() : "";
    if (cred) rod = rod ? rod + " · " + cred : cred;
    return '<section class="pg interna">' + (wm ? '<div class="wm">' + Util.esc(wm) + '</div>' : '') +
      '<h2 class="pg-tit">' + Util.esc(titulo) + '</h2>' + corpo +
      (rod ? '<div class="pg-rod">' + Util.esc(rod) + '</div>' : '') + '</section>';
  }


  /* =====================================================================
   * O ORÇAMENTO ALIMENTANDO O MODELO DE PROPOSTA
   *
   * "Modelos de Proposta" nasceu para a carpintaria e só era lido por ela:
   * quem monta orçamento SINAPI desenhava o modelo, dava um nome, e ele nunca
   * aparecia na hora de gerar. Aqui o orçamento passa a montar o MESMO
   * contrato de dados que `carpintariaui.js` monta — o motor não muda.
   *
   * ⚠ O QUE VAI PARA O PAPEL É PREÇO DE VENDA, NUNCA CUSTO. Cada linha
   *   calculada carrega `precoTotal` (com BDI, é o que o cliente paga) ao
   *   lado de `custoTotal` (a conta interna). Trocar um pelo outro entrega a
   *   margem da empresa dentro do documento comercial dela. Aqui só
   *   `precoUnit`/`precoTotal` atravessam, e `auditar` abaixo é a segunda
   *   trava — a primeira é esta função nunca ler o campo errado.
   *
   * ⚠ E O MOTOR NÃO SOMA. `total` vem de `Orcamento.totais().precoVenda`, a
   *   mesma conta da tela, do Excel e do laudo. Somar de novo aqui criaria um
   *   quarto número para a mesma pergunta — e é o do papel que o cliente
   *   confere.
   *
   * ⚠ OS GRUPOS SÃO AS ETAPAS. É a estrutura que o orçamento realmente tem;
   *   o par "Material / Mão de obra" da carpintaria não descreve uma obra por
   *   etapas. Item solto (sem etapa) cai num grupo sem nome, que o motor
   *   desenha sem cabeçalho.
   * =================================================================== */
  /* =====================================================================
   * O CICLO COMERCIAL DA PROPOSTA — enviada, aceita, recusada
   *
   * POR QUE EXISTE. O app sabia dizer se o GESTOR aprovou o orçamento, e não
   * sabia dizer se ele foi ao CLIENTE. `propostaEm` estava no schema desde o
   * começo — é até apagado ao copiar e ao revisar, para a cópia não nascer
   * "já enviada" — mas nenhuma linha do sistema gravava. O painel, sem esse
   * dado, media conversão pela aprovação interna (ver `indicadoresCarteira`).
   *
   * ⚠ FUNÇÕES PURAS: recebem `quando` por parâmetro e devolvem o orçamento
   *   alterado, sem gravar. Quem grava é a tela — do contrário não dá para
   *   testar fora do navegador.
   * ⚠ O HISTÓRICO É APPEND-ONLY. "Reenviei dia 20 porque o cliente pediu
   *   outra versão" é informação de venda; sobrescrever a data anterior
   *   apagaria o tempo de resposta real do cliente.
   * ===================================================================== */
  Proposta.CANAIS = [
    { id: "whatsapp", nome: "WhatsApp" },
    { id: "email", nome: "E-mail" },
    { id: "impresso", nome: "Impressa / em mãos" },
    { id: "reuniao", nome: "Apresentada em reunião" },
    { id: "outro", nome: "Outro" }
  ];
  Proposta.RESPOSTAS = [
    { id: "aceita", nome: "Aceita — fechamos", cor: "#16a34a" },
    { id: "recusada", nome: "Recusada", cor: "#dc2626" },
    { id: "sem_resposta", nome: "Ainda sem resposta", cor: "#ea580c" }
  ];

  Proposta.enviada = function (orc) { return Util.naoVazio(orc && orc.propostaEm); };

  /* rascunho → enviada → aceita | recusada */
  Proposta.estadoComercial = function (orc) {
    if (!Proposta.enviada(orc)) return "rascunho";
    var r = String(((orc && orc.propostaResposta) || {}).estado || "");
    return (r === "aceita" || r === "recusada") ? r : "enviada";
  };

  Proposta.registrarEnvio = function (orc, dados) {
    if (!orc) return null;
    var d = dados || {};
    var quando = String(d.quando || Util.agoraISO());
    orc.propostaEm = quando;
    orc.propostaCanal = String(d.canal || "outro");
    orc.propostaPor = String(d.por || "");
    /* reenviar zera a resposta anterior: a proposta que está com o cliente é
       a nova, e manter "recusada" ali faria o funil contar uma venda perdida
       que já voltou para a mesa */
    if (orc.propostaResposta) delete orc.propostaResposta;
    orc.propostaHistorico = Util.arr(orc.propostaHistorico);
    orc.propostaHistorico.push({ acao: "enviada", em: quando, canal: orc.propostaCanal, por: orc.propostaPor });
    return orc;
  };

  Proposta.registrarResposta = function (orc, dados) {
    if (!orc) return null;
    var d = dados || {};
    var est = String(d.estado || "");
    if (!Proposta.RESPOSTAS.filter(function (r) { return r.id === est; }).length) return null;
    if (!Proposta.enviada(orc)) return null;      /* resposta sem envio não existe */
    var quando = String(d.quando || Util.agoraISO());
    if (est === "sem_resposta") delete orc.propostaResposta;
    else orc.propostaResposta = { estado: est, em: quando, motivo: String(d.motivo || ""), por: String(d.por || "") };
    orc.propostaHistorico = Util.arr(orc.propostaHistorico);
    orc.propostaHistorico.push({ acao: est, em: quando, motivo: String(d.motivo || ""), por: String(d.por || "") });
    return orc;
  };

  /* =====================================================================
   * MANDAR PELO WHATSAPP — o canal em que a proposta realmente vai
   *
   * ⚠ O PDF NÃO VAI NO LINK. `wa.me` abre a conversa com um texto; o arquivo
   *   quem anexa é a pessoa, no aparelho dela. Prometer "envio automático com
   *   anexo" seria mentira — aqui o trabalho que se poupa é achar o contato,
   *   escrever o texto e não errar o valor nem a validade.
   * ⚠ E O NÚMERO É O DO CLIENTE, não o da empresa: sai do cadastro
   *   (`clientes.telefone`) ou do contato digitado no orçamento.
   * ===================================================================== */
  function _soDigitos(v) { return String(v == null ? "" : v).replace(/\D/g, ""); }
  Proposta.telefoneCliente = function (orc, cadastro) {
    var n = _soDigitos((cadastro && (cadastro.telefone || cadastro.celular)) || "");
    if (!n) n = _soDigitos((orc && orc.cliente && orc.cliente.contato) || "");
    if (n.length < 10) return "";
    return n.length <= 11 ? "55" + n : n;
  };

  /* o texto que abre a conversa: quem, o quê, quanto e até quando */
  Proposta.textoWhatsApp = function (orc, empresa, hojeISO) {
    var t = {};
    try { t = Orcamento.totais(orc); } catch (e) {}
    var v = Proposta.validade(orc, hojeISO);
    var quem = Util.naoVazio(orc && orc.cliente && orc.cliente.nome) ? String(orc.cliente.nome).split(/\s+/)[0] : "";
    var linhas = [];
    linhas.push((quem ? "Olá, " + quem + "! " : "Olá! ") + "Segue a nossa proposta"
      + (Util.naoVazio(orc && orc.nome) ? " para " + orc.nome : "") + ".");
    if (Util.naoVazio(orc && orc.numero)) linhas.push("Proposta " + orc.numero + ".");
    if (t.precoVenda) linhas.push("Valor: " + Util.fmtMoeda(t.precoVenda) + ".");
    if (v.temData) linhas.push(v.texto.replace(/ —.*$/, "") + ".");
    var c = (orc && orc.comercial) || {};
    if (Util.naoVazio(c.prazoExecucao)) linhas.push("Prazo: " + String(c.prazoExecucao).trim().replace(/\.$/, "") + ".");
    linhas.push("O PDF vai anexado aqui. Qualquer dúvida é só chamar.");
    if (empresa && Util.naoVazio(empresa.nome)) linhas.push(String(empresa.nome));
    return linhas.join("\n");
  };

  Proposta.linkWhatsApp = function (numero, texto) {
    var n = _soDigitos(numero);
    if (!n) return "";
    return "https://wa.me/" + n + (texto ? "?text=" + encodeURIComponent(texto) : "");
  };

  /* a cobrança de quem sumiu: mesma conversa, outro assunto */
  Proposta.textoFollowUp = function (orc, hojeISO) {
    var v = Proposta.validade(orc, hojeISO);
    var quem = Util.naoVazio(orc && orc.cliente && orc.cliente.nome) ? String(orc.cliente.nome).split(/\s+/)[0] : "";
    var l = [(quem ? "Olá, " + quem + "! " : "Olá! ") + "Passando para saber se conseguiu ver a proposta"
      + (Util.naoVazio(orc && orc.numero) ? " " + orc.numero : "") + "."];
    if (v.temData && !v.vencida) l.push("Ela vale até " + v.ateBR + ".");
    else if (v.temData && v.vencida) l.push("A validade dela venceu em " + v.ateBR + ", mas consigo revalidar os preços se ainda tiver interesse.");
    l.push("Posso ajustar alguma coisa para facilitar?");
    return l.join("\n");
  };

  /* dias desde o envio, para a tela cobrar quem sumiu */
  Proposta.diasDesdeEnvio = function (orc, hojeISO) {
    if (!Proposta.enviada(orc)) return null;
    var a = new Date(String(orc.propostaEm).slice(0, 10) + "T12:00:00");
    var b = new Date(String(hojeISO || Util.agoraISO()).slice(0, 10) + "T12:00:00");
    if (isNaN(a.getTime()) || isNaN(b.getTime())) return null;
    return Math.round((b - a) / 86400000);
  };

  /* =====================================================================
   * VALIDADE COM DATA — e não só a frase
   *
   * A base de contagem é o dia do ENVIO quando ele existe; antes disso, hoje.
   * É o que faz a data impressa continuar verdadeira depois: uma proposta
   * enviada em 03/09 com 15 dias vence em 18/09, e reimprimi-la em outubro
   * não pode "renovar" o prazo sozinha.
   * ===================================================================== */
  function _somaDias(iso, n) {
    var d = new Date(String(iso).slice(0, 10) + "T12:00:00");
    if (isNaN(d.getTime())) return "";
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function _difDias(aISO, bISO) {
    var a = new Date(String(aISO).slice(0, 10) + "T12:00:00");
    var b = new Date(String(bISO).slice(0, 10) + "T12:00:00");
    if (isNaN(a.getTime()) || isNaN(b.getTime())) return null;
    return Math.round((b - a) / 86400000);
  }
  function _br(iso) {
    var s = String(iso || "").slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4) : "";
  }
  Proposta.dataBR = _br;

  Proposta.validade = function (orc, hojeISO) {
    var c = (orc && orc.comercial) || {};
    var hoje = String(hojeISO || Util.agoraISO()).slice(0, 10);
    var dias = Util.num(c.validadeDias);
    var frase = Util.naoVazio(c.validadeProposta) ? String(c.validadeProposta).trim().replace(/\.$/, "") : "";
    if (!(dias > 0)) {
      /* sem o número não há data: devolve a frase e diz que não há data */
      return { temData: false, dias: 0, frase: frase, vencida: false,
        texto: frase ? "Validade desta proposta: " + frase + "." : "" };
    }
    var base = Proposta.enviada(orc) ? String(orc.propostaEm).slice(0, 10) : hoje;
    var ate = _somaDias(base, dias);
    var faltam = _difDias(hoje, ate);
    var vencida = faltam !== null && faltam < 0;
    var texto = "Válida até " + _br(ate)
      + (vencida ? " — VENCIDA"
        : (faltam === 0 ? " — vence hoje"
          : (faltam !== null && faltam <= 3 ? " (vence em " + faltam + " dia" + (faltam === 1 ? "" : "s") + ")" : "")));
    return { temData: true, dias: dias, baseISO: base, ateISO: ate, ateBR: _br(ate),
      faltam: faltam, vencida: vencida, frase: frase, texto: texto };
  };

  /* =====================================================================
   * O CRONOGRAMA QUE VAI PARA O PAPEL
   *
   * ⚠ CALCULADO AQUI, DESENHADO LÁ. `Orcamento.cronograma` é a mesma conta da
   *   aba Cronograma e do Excel; o motor do modelo (js/proptpl.js) tem regra
   *   escrita de não fazer conta de dinheiro. Refazer a distribuição no
   *   desenho criaria um segundo cronograma para a mesma obra — e seria o do
   *   papel que o cliente cobraria.
   * ⚠ SÓ PREÇO DE VENDA: `Orcamento.cronograma` distribui `precoVenda`.
   * ===================================================================== */
  Proposta.cronogramaParaModelo = function (orc, meses) {
    var c;
    try { c = Orcamento.cronograma(orc, meses || (orc && orc.cronogramaMeses) || 6); }
    catch (e) { return null; }
    if (!c || !Util.arr(c.etapas).length) return null;
    return {
      meses: c.meses,
      total: Util.num(c.total),
      totaisMes: Util.arr(c.totaisMes).map(function (v) { return Util.num(v); }),
      acumPct: Util.arr(c.acumPct).map(function (v) { return Util.num(v); }),
      etapas: Util.arr(c.etapas).map(function (e) {
        var tot = Util.num(e.total);
        return {
          codigo: e.codigo || "", nome: e.nome || "", total: tot,
          meses: Util.arr(e.meses).map(function (v) { return Util.num(v); }),
          /* a barra do papel é o percentual DA ETAPA em cada mês */
          pcts: Util.arr(e.meses).map(function (v) { return tot ? (Util.num(v) / tot) * 100 : 0; })
        };
      })
    };
  };

  Proposta.blocosParaModelo = function (orc) {
    var linhas = Orcamento.linhas(orc) || [];
    var t = Orcamento.totais(orc);
    var ordem = [], porEtapa = {};
    linhas.forEach(function (L) {
      var nome = String(L.etapaNome || "").trim();
      var chave = String(L.etapaId || nome || "");
      if (!porEtapa[chave]) { porEtapa[chave] = { nome: nome, linhas: [] }; ordem.push(chave); }
      porEtapa[chave].linhas.push({
        descricao: L.descricao || L.codigo || "",
        unidade: L.unidade || "",
        qtd: Util.num(L.quantidade),
        /* o motor escreve `l.total`; o unitário viaja para quem quiser conferir */
        unitario: Util.num(L.precoUnit),
        total: Util.num(L.precoTotal)
      });
    });
    return {
      grupos: ordem.map(function (k) { return porEtapa[k]; }),
      total: Util.num(t.precoVenda)
    };
  };

  /* as condições comerciais que o modelo escreve, com os nomes que ele espera */
  Proposta.comercialParaModelo = function (orc) {
    var c = (orc && orc.comercial) || {};
    return {
      condicoesPagamento: c.condicoesPagamento || "",
      prazoExecucao: c.prazoExecucao || "",
      garantia: c.garantia || "",
      /* o bloco "Escopo em texto" pode ler a lista daqui (usarComercial) */
      incluso: c.incluso || "",
      excluso: c.excluso || ""
    };
  };

  /* =====================================================================
   * A AUDITORIA — a última chance antes de o papel abrir
   *
   * Mesma régua da carpintaria: palavra proibida, e o NÚMERO do custo escrito
   * no formato em que o documento escreveria dinheiro. Um custo pode coincidir
   * com um preço legítimo (o custo de um item batendo com a venda de outro),
   * então só acusa quando o número aparece E não é nenhum dos valores que o
   * documento DEVE mostrar.
   * =================================================================== */
  Proposta.PALAVRAS_PROIBIDAS = [
    "custo direto", "custo unit", "margem de", "lucro", "bdi de", "preço de compra"
  ];

  function _achatar(s) {
    /* ⚠ o espaço do "R$" é DURO (U+00A0) em `Util.fmtMoeda`: comparar texto
       cru deixaria passar o mesmo valor escrito com espaço comum */
    return String(s == null ? "" : s).replace(/\u00a0/g, " ").replace(/\s+/g, " ");
  }

  Proposta.auditar = function (html, orc) {
    var achados = [];
    var h = _achatar(html), baixo = h.toLowerCase();
    Proposta.PALAVRAS_PROIBIDAS.forEach(function (w) {
      if (baixo.indexOf(w) > -1) achados.push({ tipo: "palavra", achado: w });
    });

    var t = Orcamento.totais(orc);
    var b = Proposta.blocosParaModelo(orc);
    var legitimos = {};
    legitimos[_achatar(Util.fmtMoeda(b.total))] = 1;
    b.grupos.forEach(function (g) {
      g.linhas.forEach(function (l) {
        legitimos[_achatar(Util.fmtMoeda(l.total))] = 1;
        legitimos[_achatar(Util.fmtMoeda(l.unitario))] = 1;
      });
    });

    var suspeitos = [];
    if (t.custoDireto > 0) suspeitos.push({ v: t.custoDireto, o: "o custo direto da obra" });
    if (t.bdiValor > 0) suspeitos.push({ v: t.bdiValor, o: "o valor do BDI" });
    (Orcamento.linhas(orc) || []).forEach(function (L) {
      if (Util.num(L.custoTotal) > 0) suspeitos.push({ v: Util.num(L.custoTotal), o: "o custo de " + (L.descricao || "um item") });
    });

    suspeitos.forEach(function (s) {
      var fmt = _achatar(Util.fmtMoeda(s.v));
      if (h.indexOf(fmt) < 0) return;
      if (legitimos[fmt]) return;          /* coincide com um valor que o papel deve mostrar */
      achados.push({ tipo: "numero", achado: Util.fmtMoeda(s.v), motivo: s.o });
    });
    return achados;
  };

  /* =====================================================================
   * O CLIENTE DO ORÇAMENTO NÃO TEM ID — e por isso o casamento é EXATO
   *
   * ⚠ `orc.cliente` é objeto embutido (`{nome, doc, contato}`), sem vínculo
   *   com a entidade `clientes`. O modelo, por outro lado, guarda `paraCliente`
   *   com o ID. Para o "modelo deste cliente" funcionar aqui, alguém tem de
   *   ligar os dois — e o único jeito honesto é NOME IGUAL, normalizado.
   *
   * ⚠ SEMELHANÇA NÃO ENTRA, e ambiguidade também não: dois cadastros com o
   *   mesmo nome devolvem vazio, e a tela cai no modelo padrão. Sugerir o
   *   desenho do cliente errado é o tipo de erro que aparece na frente dele.
   * =================================================================== */
  Proposta.clienteIdDoOrcamento = function (orc) {
    var nome = String(((orc && orc.cliente) || {}).nome || "").trim().toLowerCase();
    if (!nome) return "";
    var achados = [];
    try {
      var eid = Auth.empresaId();
      (Store.listar(eid, "clientes") || []).forEach(function (c) {
        var n = String((c && (c.nome || c.razaoSocial)) || "").trim().toLowerCase();
        if (n && n === nome) achados.push(c.id);
      });
    } catch (e) { return ""; }
    return achados.length === 1 ? achados[0] : "";
  };

  global.Proposta = Proposta;
})(window);
