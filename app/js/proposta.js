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
            row("Validade", c.validadeProposta) +
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
        '<div class="cols"><div><h3>✔ Incluso</h3><ul>' + this._lista(c.incluso) + '</ul></div>' +
        '<div><h3>✘ Não incluso</h3><ul>' + this._lista(c.excluso) + '</ul></div></div>'));

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

  global.Proposta = Proposta;
})(window);
