/* =====================================================================
 * laudo.js — Anexo Técnico de Orçamento p/ LAUDO PERICIAL (não comercial)
 * Documento formal para anexar a laudos de vícios/não conformidades:
 * metodologia SINAPI, BDI (TCU), normas ABNT, planilhas sintética/analítica,
 * composição de custo (MO/MAT/EQ) e encerramento com responsável técnico.
 * Reaproveita a infra de impressão (.pg/.interna/.wm/.prop-tbl) da Proposta.
 * ===================================================================== */
(function (global) {
  "use strict";

  var Laudo = {

    validar: function (orc) {
      var f = [];
      if (!orc.cliente || !Util.naoVazio(orc.cliente.nome)) f.push("Requerente/Cliente");
      if (Orcamento.totais(orc).qtdItens < 1) f.push("Ao menos 1 item");
      // LOTE 4: documento pericial sem registro técnico é irregular perante o
      // CREA/CAU — e sem data de vistoria não é formal. Bloqueia com instrução.
      if (!Util.naoVazio(orc.art)) f.push("ART/RRT (preencha em ⚙ Dados)");
      var emp = (typeof Empresa !== "undefined" && Empresa.dados) ? Empresa.dados() : null;
      if (!emp || !Util.naoVazio(emp.crea)) f.push("Registro CREA/CAU (preencha em ⚙ Empresa)");
      if (!Util.naoVazio(orc.dataVistoria)) f.push("Data da vistoria (preencha em ⚙ Dados)");
      return { ok: f.length === 0, faltando: f };
    },

    // Composição MO/MAT/EQ (só se a base analítica já estiver carregada — não força download)
    _momateq: function (orc) {
      if (typeof Analitico === "undefined" || !Analitico.carregado) return null;
      var mo = 0, mat = 0, eq = 0;
      Util.arr(orc.etapas).forEach(function (e) {
        Util.arr(e.itens).forEach(function (it) {
          var ct = Util.num(it.quantidade) * Util.num(it.custoUnitario);
          var a = it.origem === "SINAPI" ? Analitico.obter(it.codigo) : null;
          if (a && a.custoUnitario > 0) {
            mo += ct * ((a.custoMO || 0) / a.custoUnitario);
            mat += ct * ((a.custoMAT || 0) / a.custoUnitario);
            eq += ct * ((a.custoEQ || 0) / a.custoUnitario);
          } else { mat += ct; }
        });
      });
      return { mo: mo, mat: mat, eq: eq, total: (mo + mat + eq) || 1 };
    },

    gerarHTML: function (orc, usuario) {
      var t = Orcamento.totais(orc);
      var sint = Orcamento.sintetico(orc);
      var marca = CONFIG.marca;
      var emp = (typeof Empresa !== "undefined") ? Empresa.dados() : null;
      // White-label: o documento é da EMPRESA DO CLIENTE — nunca cai no fabricante.
      var empresa = (emp && emp.nome) || (usuario && usuario.empresa) || "Sua Empresa";
      var logoHTML = (typeof Empresa !== "undefined") ? Empresa.logoHTML(90) : '<div class="logo-ph">[LOGO ' + Util.esc(empresa) + ']</div>';
      var hoje = new Date().toLocaleDateString("pt-BR");
      var local = (orc.obra && orc.obra.local) ? orc.obra.local : ((orc.obra && orc.obra.nome) || "—");
      var pct = orc.bdi ? orc.bdi.percentual : 0;
      var mme = this._momateq(orc);
      var P = [];

      // ---- CAPA ----
      P.push('<section class="pg capa">' +
        '<div class="capa-top">' + logoHTML + '</div>' +
        '<div class="capa-mid"><div class="kicker">ANEXO TÉCNICO — ORÇAMENTO DE REPAROS</div>' +
        '<h1>' + Util.esc(orc.nome) + '</h1>' +
        '<div class="capa-obra">' + Util.esc(orc.obra && orc.obra.nome ? orc.obra.nome : "Imóvel periciado") + '</div></div>' +
        '<div class="capa-info">' +
          row("Requerente / Cliente", orc.cliente.nome) +
          row("Imóvel / Local", local) +
          row("Orçamento nº", orc.numero) +
          row("Data da vistoria", Util.naoVazio(orc.dataVistoria) ? orc.dataVistoria : "[____]") +
          row("Data de referência", hoje) +
          row((Orcamento.basesUsadas(orc).length > 1 ? "Bases de preços" : "Base de preços"), Orcamento.basesUsadasTexto(orc)) +
          rowRaw("Valor total estimado", '<b style="color:var(--p-verde,#16a34a)">' + Util.fmtMoeda(t.precoVenda) + '</b>') +
        '</div>' +
        '<div class="capa-rod">' + Util.esc(empresa) + ' · Documento técnico de subsídio ao laudo pericial</div></section>');

      // ---- 1. IDENTIFICAÇÃO ----
      P.push(pg("1. Identificação",
        '<div class="cols"><div><h3>Responsável Técnico</h3><p><b>' + Util.esc(empresa) + '</b>' +
        (emp && emp.cnpj ? '<br>CNPJ: ' + Util.esc(emp.cnpj) : '') + '<br>' +
        Util.esc((emp && emp.responsavel) || '[Eng./Arq. Responsável]') + (emp && emp.titulo ? ' — ' + Util.esc(emp.titulo) : '') + '<br>' +
        'Registro ' + Util.esc((emp && emp.crea) || 'CREA/CAU nº [____]') +
        (emp && emp.registroNacional ? '<br>Reg. Nacional: ' + Util.esc(emp.registroNacional) : '') +
        '<br>ART/RRT nº ' + (Util.naoVazio(orc.art) ? '<b>' + Util.esc(orc.art) + '</b>' : '[&nbsp;&nbsp;&nbsp;&nbsp;]') + '</p></div>' +
        '<div><h3>Objeto Periciado</h3><p>Requerente: <b>' + Util.esc(orc.cliente.nome) + '</b>' +
        (orc.cliente.doc ? '<br>' + Util.esc(orc.cliente.doc) : '') +
        '<br>Imóvel: ' + Util.esc(local) + '</p></div></div>'));

      // ---- 2. OBJETO ----
      P.push(pg("2. Objeto",
        '<p>O presente documento constitui <b>anexo técnico</b> ao laudo de constatação de vícios e não conformidades construtivas, e tem por objeto apresentar o <b>orçamento detalhado dos serviços necessários à correção</b> dos vícios identificados no imóvel objeto da perícia.</p>' +
        '<p>Os custos aqui apresentados destinam-se à quantificação do valor de reparo, servindo de subsídio técnico-financeiro à instrução do laudo, sem caráter de proposta comercial.</p>'));

      // ---- 3. METODOLOGIA ----
      P.push(pg("3. Metodologia e Critérios de Orçamentação",
        '<p>' + ((function () {
          var bs = Orcamento.basesUsadas(orc);
          if (bs.length === 1 && bs[0].fonte === "SINAPI") {
            return 'Os preços foram compostos a partir do <b>Sistema Nacional de Pesquisa de Custos e Índices da Construção Civil — SINAPI</b>, mantido pela Caixa Econômica Federal e pelo IBGE, na competência <b>' + Util.esc(orc.competenciaSinapi || "—") + ' (' + Util.esc(orc.uf || "—") + ')</b>, adotando-se:';
          }
          return 'Os preços foram compostos a partir das seguintes bases oficiais de referência de custos: <b>' + Util.esc(Orcamento.basesUsadasTexto(orc)) + '</b>' + (bs.some(function (x) { return x.fonte === "SINAPI"; }) ? ' (a SINAPI é mantida pela Caixa Econômica Federal e pelo IBGE)' : '') + ', adotando-se:';
        })()) + '</p>' +
        '<ul>' +
        '<li>composições oficiais de custo unitário, com quebra de mão de obra, material e equipamento, em regime <b>' + Util.esc(Orcamento.regimeDe ? Orcamento.regimeDe(orc) : (orc.desonerado ? "desonerado" : "onerado")) + '</b>;</li>' +
        '<li>itens sem correspondência direta nas bases adotadas, orçados por <b>cotação de mercado</b> ou composição própria, identificados na planilha;</li>' +
        '<li><b>BDI</b> (Benefícios e Despesas Indiretas) de <b>' + Util.fmtPct(pct) + '</b>, em conformidade com a metodologia do Acórdão <b>TCU nº 2.622/2013</b>;</li>' +
        '<li>quantitativos apurados a partir do levantamento técnico realizado em vistoria <i>in loco</i>' + (Util.naoVazio(orc.dataVistoria) ? ' em <b>' + Util.esc(orc.dataVistoria) + '</b>' : '') + '.</li>' +
        '</ul>' +
        '<p>Aplicam-se, no que couber, as normas <b>ABNT NBR 13.752</b> (perícias de engenharia na construção civil) e demais normas técnicas vigentes.</p>'));

      // ---- 4. SINTÉTICA ----
      var sintLi = sint.map(function (s) {
        return '<tr><td>' + Util.esc(s.codigo) + '</td><td>' + Util.esc(s.nome) + '</td>' +
          '<td class="r">' + Util.fmtMoeda(s.custoDireto) + '</td>' +
          '<td class="r">' + Util.fmtMoeda(s.precoVenda) + '</td>' +
          '<td class="r">' + Util.fmtPct(s.peso, 1) + '</td></tr>';
      }).join("");
      P.push(pg("4. Planilha Orçamentária Sintética",
        '<table class="prop-tbl"><thead><tr><th>Etapa</th><th>Descrição</th><th class="r">Custo direto</th><th class="r">Com BDI</th><th class="r">Peso</th></tr></thead>' +
        '<tbody>' + (sintLi || '<tr><td colspan="5">—</td></tr>') + '</tbody>' +
        '<tfoot><tr><td colspan="2">TOTAL</td><td class="r">' + Util.fmtMoeda(t.custoDireto) + '</td><td class="r">' + Util.fmtMoeda(t.precoVenda) + '</td><td class="r">100%</td></tr></tfoot></table>'));

      // ---- 5. ANALÍTICA ----
      var analHtml = '';
      Util.arr(orc.etapas).forEach(function (e, ei) {
        analHtml += '<tr class="grp-lau"><td><b>' + (ei + 1) + '</b></td><td colspan="6"><b>' + Util.esc(e.nome) + '</b></td></tr>';
        Util.arr(e.itens).forEach(function (it, ii) {
          var ct = Util.num(it.quantidade) * Util.num(it.custoUnitario);
          analHtml += '<tr><td><b>' + Orcamento.itemNumero(ei, ii) + '</b></td><td>' + Util.esc(it.codigo) + '</td><td>' + Util.esc(it.descricao) + '</td>' +
            '<td>' + Util.esc(it.unidade) + '</td>' +
            '<td class="r">' + Util.fmtNum(it.quantidade, 2) + '</td>' +
            '<td class="r">' + Util.fmtMoeda(it.custoUnitario) + '</td>' +
            '<td class="r">' + Util.fmtMoeda(ct) + '</td></tr>';
        });
      });
      P.push(pg("5. Planilha Orçamentária Analítica",
        '<table class="prop-tbl" style="font-size:11px"><thead><tr><th>Item</th><th>Código</th><th>Descrição do serviço</th><th>Un</th><th class="r">Qtd</th><th class="r">Custo unit.</th><th class="r">Custo total</th></tr></thead>' +
        '<tbody>' + analHtml + '</tbody>' +
        '<tfoot><tr><td colspan="6">CUSTO DIRETO (sem BDI)</td><td class="r">' + Util.fmtMoeda(t.custoDireto) + '</td></tr></tfoot></table>'));

      // ---- 5.1 MEMÓRIA DE CÁLCULO (Lei 14.133 — justificativa dos quantitativos) ----
      // LOTE 4: o campo já era capturado na UI mas não saía no PDF do laudo.
      var memHtml = '';
      Util.arr(orc.etapas).forEach(function (e) {
        Util.arr(e.itens).forEach(function (it) {
          if (!Util.naoVazio(it.memoriaCalculo)) return;
          memHtml += '<tr><td>' + Util.esc(it.codigo) + '</td><td>' + Util.esc(it.descricao) + '</td>' +
            '<td class="r">' + Util.fmtNum(it.quantidade, 2) + ' ' + Util.esc(it.unidade || '') + '</td>' +
            '<td>' + Util.esc(it.memoriaCalculo) + '</td></tr>';
        });
      });
      if (memHtml) {
        P.push(pg("5.1 Memória de Cálculo dos Quantitativos",
          '<p>Justificativa dos quantitativos adotados, conforme levantamento técnico (art. 23 da Lei nº 14.133/2021):</p>' +
          '<table class="prop-tbl" style="font-size:11px"><thead><tr><th>Código</th><th>Serviço</th><th class="r">Qtd</th><th>Memória de cálculo</th></tr></thead>' +
          '<tbody>' + memHtml + '</tbody></table>'));
      }

      // ---- 6. RESUMO FINANCEIRO ----
      var mmeHtml = mme ? ('<h3 style="margin-top:18px">Composição do custo</h3><table class="prop-tbl"><tbody>' +
        '<tr><td>Mão de obra</td><td class="r">' + Util.fmtMoeda(mme.mo) + '</td><td class="r">' + Util.fmtPct(mme.mo / mme.total * 100, 1) + '</td></tr>' +
        '<tr><td>Material</td><td class="r">' + Util.fmtMoeda(mme.mat) + '</td><td class="r">' + Util.fmtPct(mme.mat / mme.total * 100, 1) + '</td></tr>' +
        '<tr><td>Equipamento</td><td class="r">' + Util.fmtMoeda(mme.eq) + '</td><td class="r">' + Util.fmtPct(mme.eq / mme.total * 100, 1) + '</td></tr>' +
        '</tbody></table>') : '';
      P.push(pg("6. Resumo Financeiro",
        '<table class="prop-tbl"><tbody>' +
        '<tr><td>Custo direto (sem BDI)</td><td class="r">' + Util.fmtMoeda(t.custoDireto) + '</td></tr>' +
        '<tr><td>BDI (' + Util.fmtPct(pct) + ')</td><td class="r">' + Util.fmtMoeda(t.bdiValor) + '</td></tr>' +
        '</tbody><tfoot><tr><td>VALOR TOTAL ESTIMADO PARA REPAROS</td><td class="r">' + Util.fmtMoeda(t.precoVenda) + '</td></tr></tfoot></table>' + mmeHtml));

      // ---- 7. PREMISSAS ----
      P.push(pg("7. Premissas e Considerações Técnicas",
        '<ul>' +
        '<li>Os preços referem-se às bases de referência adotadas (<b>' + Util.esc(Orcamento.basesUsadasTexto(orc)) + '</b>) e estão sujeitos a reajuste conforme a data efetiva de execução;</li>' +
        '<li>Os quantitativos decorrem do levantamento em vistoria e poderão ser confirmados em projeto executivo;</li>' +
        '<li>O valor não inclui projetos complementares, taxas, licenças e serviços não identificáveis na vistoria;</li>' +
        '<li>O BDI adotado reflete despesas indiretas, tributos e remuneração, conforme metodologia consagrada;</li>' +
        '<li>Este orçamento tem finalidade técnico-pericial, não constituindo proposta comercial.</li>' +
        '</ul>'));

      // ---- 8. ENCERRAMENTO ----
      P.push(pg("8. Encerramento",
        '<p>O presente orçamento foi elaborado segundo critérios técnicos e preços oficiais de referência, constituindo subsídio à quantificação dos custos necessários à correção dos vícios construtivos constatados na perícia.</p>' +
        '<div class="assinaturas" style="margin-top:54px"><div class="assin"><div class="linha-assin"></div>' +
        Util.esc((emp && emp.responsavel) || empresa) + '<br><span>' + Util.esc(empresa) + ' — ' +
        Util.esc((emp && emp.crea) || 'CREA/CAU') + ' · ART/RRT nº ' + (Util.naoVazio(orc.art) ? Util.esc(orc.art) : '[&nbsp;&nbsp;&nbsp;]') + '</span></div></div>' +
        '<p class="nota mt">' + Util.esc(local) + ', ' + hoje + '.</p>'));

      return P.join("");
    }
  };

  function row(k, v) { return '<div class="ci-row"><span>' + Util.esc(k) + '</span><b>' + Util.esc(v) + '</b></div>'; }
  function rowRaw(k, v) { return '<div class="ci-row"><span>' + Util.esc(k) + '</span><b>' + v + '</b></div>'; }
  function pg(titulo, corpo) {
    // White-label: marca d'água e rodapé são da EMPRESA DO CLIENTE (configurável em ⚙ Empresa)
    var temEmp = typeof Empresa !== "undefined";
    var wm = temEmp && Empresa.marcaDaguaTexto ? Empresa.marcaDaguaTexto() : "";
    var rod = ((temEmp && Empresa.nomeDoc && Empresa.nomeDoc()) || "") + " · Anexo técnico de orçamento";
    var cred = temEmp && Empresa.creditoTexto ? Empresa.creditoTexto() : "";
    if (cred) rod += " · " + cred;
    return '<section class="pg interna">' + (wm ? '<div class="wm">' + Util.esc(wm) + '</div>' : '') +
      '<h2 class="pg-tit">' + Util.esc(titulo) + '</h2>' + corpo +
      '<div class="pg-rod">' + Util.esc(rod.replace(/^ · /, "")) + '</div></section>';
  }

  global.Laudo = Laudo;
})(window);
