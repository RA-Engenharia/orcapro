/* =====================================================================
 * remunvarui.js — A TELA da Remuneração variável por produção
 *
 * O motor está em js/remunvar.js. Aqui só há tela — e uma responsabilidade
 * que a tela NÃO pode delegar: juntar as DUAS fontes do que já foi pago.
 *
 * ⚠ SÃO DOIS CAMINHOS DE PAGAMENTO SOBRE O MESMO m², E ELES NÃO SE FALAM
 *   SOZINHOS. A tela de Produção paga por medição (`producao_med`); esta
 *   paga por apuração (`remun_apur`). Cada uma sabe do que ela mesma pagou.
 *   Se esta tela consultasse só as próprias apurações, a metragem já medida
 *   na Produção entraria aqui de novo — e nada no sistema acusaria.
 *   `_jaPago()` soma as duas antes de qualquer conta. Não separe.
 * ===================================================================== */
(function (global) {
  "use strict";

  if (typeof global.Gestao === "undefined") return;

  var G = global.Gestao;
  var K = G.ui;
  var RV = global.RemunVar;

  var ENT_PARAM = "remun_param";
  var ENT_APUR = "remun_apur";

  function eid() { return (typeof Auth !== "undefined" && Auth.empresaId) ? Auth.empresaId() : "default"; }
  function esc(s) { return Util.esc(s == null ? "" : String(s)); }
  function moeda(v) { return v == null ? "—" : Util.fmtMoeda(v); }
  function n2(v) { return v == null ? "—" : Util.fmtNum(v, 2); }
  /* ⚠ MÊS LOCAL, nunca `toISOString()`: das 21h à meia-noite o ISO já está em
     amanhã, e no último dia do mês a competência pulava para o mês seguinte. */
  function compHoje() {
    var d = new Date();
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2);
  }

  function paramBruto() { var l = K.lista(ENT_PARAM); return l.length ? l[0] : { id: "remun-param" }; }

  /* ---- as duas fontes do que já foi pago (ver o aviso do cabeçalho) ---- */
  function _jaPago() {
    var mapa = {};
    function junta(m) {
      Object.keys(m || {}).forEach(function (k) {
        if (mapa[k] === Infinity || m[k] === Infinity) { mapa[k] = Infinity; return; }
        mapa[k] = (mapa[k] || 0) + m[k];
      });
    }
    try { junta(global.Producao.jaMedido(K.lista("producao_med"))); } catch (e) {}
    try { junta(RV.jaPago(K.lista(ENT_APUR))); } catch (e) {}
    return mapa;
  }

  G._rvAba = "apuracao";
  G._rvObra = "";
  G._rvComp = "";
  G._rvFora = {};        // ids desmarcados da divisão do pote, por obra

  function estado() {
    if (!G._rvComp) G._rvComp = compHoje();
    var per = RV.periodoDe(G._rvComp);
    var par = paramBruto();
    var rdos = K.lista("rdo");
    var colabs = K.lista("colaboradores");
    var linhas = [];
    try {
      linhas = global.Producao.acumular(rdos, {
        obraId: G._rvObra || undefined, de: per.de, ate: per.ate, jaMedido: _jaPago()
      }).linhas;
    } catch (e) { linhas = []; }
    var equipeToda = RV.equipeDaObra(colabs, linhas, G._rvObra, par);
    var fora = G._rvFora[G._rvObra || "*"] || {};
    var equipe = equipeToda.filter(function (x) { return !fora[x.id]; });
    var res = RV.apurar({
      obraId: G._rvObra, competencia: G._rvComp, de: per.de, ate: per.ate,
      producao: linhas, equipe: equipe, parametros: par
    });
    return { per: per, par: RV.parametros(par), equipeToda: equipeToda, equipe: equipe, res: res, colabs: colabs };
  }

  function apuracaoSalva() {
    var chave = (G._rvObra || "") + "|" + G._rvComp;
    var achou = null;
    K.lista(ENT_APUR).forEach(function (a) {
      if ((a.obraId || "") + "|" + (a.competencia || "") === chave) achou = a;
    });
    return achou;
  }

  /* ===================================================================
   * TELA
   * =================================================================== */
  G.renderRemunVar = function () {
    var abas = [["apuracao", "Apuração"], ["historico", "Histórico"], ["param", "Parâmetros"]];
    var html = this._head(K.svg("remunvar") + "Remuneração variável", null, null, _avisoParam());
    html += '<div class="tabs" style="margin-bottom:14px">' + abas.map(function (a) {
      return '<div class="tab' + (a[0] === G._rvAba ? " ativa" : "") + '" data-gacao="rv-aba" data-aba="' + a[0] + '">' + a[1] + "</div>";
    }).join("") + "</div>";
    if (G._rvAba === "param") return html + _param();
    if (G._rvAba === "historico") return html + _historico();
    return html + _apuracao();
  };

  function _avisoParam() {
    var f = RV.validarParametros(paramBruto());
    if (!f.length) return "";
    return '<span class="muted" style="margin-right:12px;align-self:center;color:var(--ambar,#b45309)">'
      + f.length + " parâmetro(s) por preencher — aba <b>Parâmetros</b></span>";
  }

  /* ---------- APURAÇÃO ---------- */
  function _apuracao() {
    var st = estado();
    var r = st.res;
    var obras = K.lista("obras");
    var salva = apuracaoSalva();
    var fechada = salva && (salva.estado === "aprovada" || salva.estado === "paga");

    var html = '<div class="card mb"><div class="row">'
      /* ⚠ O <select> fala por CHANGE e o dispatcher entrega só `{value}` —
         por isso a ação lê `ds.value`, e não o DOM. Lendo o DOM no clique, o
         valor era sempre o ANTERIOR e a obra nunca trocava. */
      + K.campo("Obra *", '<select id="rv-obra" data-gacao="rv-obra">'
        + K.optsRec(obras, "nome", G._rvObra, "— escolha a obra —") + "</select>")
      /* ⚠ O campo de MÊS não leva `data-gacao`: o dispatcher escuta clique, e
         clicar dentro do campo re-renderizava a tela — o input sumia debaixo
         do dedo e não dava para trocar a competência. Ele é ligado depois do
         DOM existir, por `Gestao.registrarWire` (fim deste arquivo). */
      + K.campo("Competência", '<input id="rv-comp" type="month" value="' + esc(G._rvComp) + '">')
      + K.campo("Período", '<div style="padding-top:9px" class="muted">' + esc(Util.fmtDia(st.per.de)) + " a " + esc(Util.fmtDia(st.per.ate)) + "</div>")
      + "</div>";
    html += '<span class="muted">Só entra metragem de diário <b>aprovado</b> (1º nível, o encarregado) e que ainda não foi paga — '
      + "nem por aqui, nem pela tela de Produção.</span></div>";

    if (fechada) {
      html += '<div class="card mb" style="border-left:4px solid #15803d"><b>Apuração já ' + esc(RV.ESTADOS[salva.estado].toLowerCase()) + ".</b> "
        + "Aprovada por " + esc(salva.aprovadaPor || "—") + " em " + esc(Util.fmtData(salva.aprovadaEm) || "—") + ". "
        + "Os valores abaixo são os que foram homologados — o que o diário disser depois não muda esta apuração.</div>";
      return html + _tabelaLinhas(salva.linhas, st.colabs, true) + _botoesFechada(salva);
    }

    /* KPIs */
    html += '<div class="kpis kpis-g mb">'
      + _kpi("Metragem aprovada", n2(r.m2) + " " + esc(r.unidade), "no período, ainda não paga")
      + _kpi("Pote", moeda(r.pote), r.porM2 == null ? "falta o R$/m²" : "a " + moeda(r.porM2) + " por " + esc(r.unidade))
      + _kpi("Parte da equipe", moeda(r.equipeTotal), r.quantosDividem + " pessoa(s) dividem")
      + _kpi("Parte individual", moeda(r.individualTotal), "de quem produziu")
      + "</div>";

    /* quem divide o pote */
    html += '<div class="card mb"><h3 style="margin:0 0 4px">Quem divide a parte da equipe</h3>'
      + '<p class="muted" style="margin:0 0 10px">O vínculo pessoa↔obra do sistema é um campo só, sem histórico — '
      + "quem troca de obra no meio do mês muda o valor de todo mundo. Confira nome a nome antes de aprovar.</p>";
    if (!st.equipeToda.length) html += '<p class="muted">Ninguém alocado nesta obra e ninguém com produção no período.</p>';
    else {
      var fora = G._rvFora[G._rvObra || "*"] || {};
      html += '<div class="flex" style="gap:16px;flex-wrap:wrap">' + st.equipeToda.map(function (x) {
        var marca = x.origem === "ambos" ? "alocado e produziu" : x.origem === "alocado" ? "alocado" : "produziu";
        return '<label style="display:inline-flex;align-items:center;gap:6px">'
          + '<input type="checkbox" data-gacao="rv-equipe" data-cid="' + esc(x.id) + '"' + (fora[x.id] ? "" : " checked") + "> "
          + esc(x.nome) + ' <span class="muted">(' + marca + (x.semCadastro ? ", sem cadastro" : "") + ")</span></label>";
      }).join("") + "</div>";
    }
    html += "</div>";

    if (r.pendencias.length) {
      html += '<div class="card mb" style="border-left:4px solid var(--ambar,#b45309)"><b>Antes de aprovar</b><ul style="margin:8px 0 0 18px">'
        + r.pendencias.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></div>";
    }
    if (!r.fecha) {
      html += '<div class="card mb" style="border-left:4px solid #dc2626"><b>O rateio não fechou com o pote.</b> '
        + "Isso é centavo criado ou perdido — não aprove. Avise o suporte.</div>";
    }

    html += _tabelaLinhas(r.linhas, st.colabs, false);

    var podeAprovar = r.completa && r.fecha;
    html += '<div class="flex mt">'
      + '<button class="btn primary"' + (podeAprovar ? "" : " disabled") + ' data-gacao="rv-aprovar">'
      + "Aprovar apuração de " + esc(G._rvComp) + " (2º nível)</button>"
      + '<span class="muted" style="align-self:center;margin-left:12px">A aprovação da gestão é o que transforma metragem em valor a pagar.</span></div>';
    return html;
  }

  function _kpi(rot, val, sub) {
    return '<div class="kpi"><div class="rotulo">' + esc(rot) + '</div><div class="num">' + val + "</div>"
      + (sub ? '<div class="muted" style="margin-top:4px;font-size:12px">' + esc(sub) + "</div>" : "") + "</div>";
  }

  function _tabelaLinhas(linhas, colabs, congelada) {
    linhas = Util.arr(linhas);
    if (!linhas.length) return '<div class="card"><p class="muted">Nenhuma linha para pagar neste período.</p></div>';
    var ix = {}; Util.arr(colabs).forEach(function (c) { if (c && c.id) ix[c.id] = c; });
    var html = '<table class="tbl"><thead><tr><th>Colaborador</th><th>Função</th><th class="num">Metragem</th>'
      + '<th class="num">Equipe</th><th class="num">Individual</th><th class="num">Total</th></tr></thead><tbody>';
    var t = 0;
    linhas.forEach(function (L) {
      var c = ix[L.colaboradorId] || {};
      t += (L.totalCent || 0);
      html += "<tr><td><b>" + esc(L.nome || c.nome || L.colaboradorId) + "</b></td><td>" + esc(c.funcao || "—") + '</td>'
        + '<td class="num">' + (L.m2 ? n2(L.m2) : "—") + '</td>'
        + '<td class="num">' + moeda(congelada ? L.equipeCent / 100 : L.equipe) + '</td>'
        + '<td class="num">' + moeda(congelada ? L.individualCent / 100 : L.individual) + '</td>'
        + '<td class="num"><b>' + moeda(congelada ? L.totalCent / 100 : L.total) + "</b></td></tr>";
    });
    html += '</tbody><tfoot><tr><td colspan="5" class="num"><b>Total</b></td><td class="num"><b>' + moeda(t / 100) + "</b></td></tr></tfoot></table>";
    return html;
  }

  function _botoesFechada(salva) {
    var vivos = Util.arr(salva.fsLancamentos).filter(function (lid) {
      return !!Store.obter(eid(), "fs_lancamentos", lid);
    });
    /* "já foi" é ter lançamento VIVO na Folha, não o estado guardado: quem
       apagou o lançamento por engano precisa conseguir reenviar. */
    var jaFoi = salva.estado === "paga" && vivos.length > 0;
    return '<div class="flex mt">'
      + '<button class="btn primary"' + (jaFoi ? " disabled" : "") + ' data-gacao="rv-folha" data-id="' + salva.id + '">'
      + (jaFoi ? "Já enviada para a Folha" : "Mandar para a Folha Semanal") + "</button>"
      + '<span class="muted" style="align-self:center;margin-left:12px">'
      + (jaFoi ? "O pagamento é feito na Folha Semanal." : "Cria um lançamento por pessoa, do tipo Produtividade medida.")
      + "</span></div>";
  }

  /* ---------- HISTÓRICO ---------- */
  function _historico() {
    var as = K.lista(ENT_APUR).slice().sort(function (a, b) { return String(b.competencia || "").localeCompare(String(a.competencia || "")); });
    if (!as.length) return K.vazioBox("Nenhuma apuração fechada ainda", null, null);
    var obras = {}; K.lista("obras").forEach(function (o) { obras[o.id] = o.nome; });
    var html = '<table class="tbl"><thead><tr><th>Competência</th><th>Obra</th><th class="num">Metragem</th><th class="num">Total</th><th>Situação</th><th>Aprovada por</th></tr></thead><tbody>';
    as.forEach(function (a) {
      var tot = Util.arr(a.linhas).reduce(function (s, L) { return s + (L.totalCent || 0); }, 0);
      html += "<tr><td><b>" + esc(a.competencia) + "</b></td><td>" + esc(obras[a.obraId] || "— todas —") + '</td>'
        + '<td class="num">' + n2(a.m2) + '</td><td class="num">' + moeda(tot / 100) + "</td>"
        + "<td>" + esc(RV.ESTADOS[a.estado] || a.estado) + "</td><td>" + esc(a.aprovadaPor || "—") + "</td></tr>";
    });
    return html + "</tbody></table>";
  }

  /* ---------- PARÂMETROS ---------- */
  function _param() {
    var b = paramBruto(), p = RV.parametros(b);
    var faltas = RV.validarParametros(b);
    var html = "";
    if (faltas.length) {
      html += '<div class="card mb" style="border-left:4px solid var(--ambar,#b45309)"><b>Falta preencher</b><ul style="margin:8px 0 0 18px">'
        + faltas.map(function (f) { return "<li>" + esc(f) + "</li>"; }).join("") + "</ul></div>";
    }
    html += '<div class="card"><div class="row">'
      + K.campo("Valor por m² produzido (R$) *", K.inp("rp-m2", b.porM2))
      + K.campo("Quanto do pote é da equipe (%)", K.inp("rp-rat", b.rateioEquipePct == null ? 50 : b.rateioEquipePct))
      + K.campo("Periodicidade do acerto", K.sel("rp-per", K.opts([["mensal", RV.PERIODOS.mensal], ["quinzenal", RV.PERIODOS.quinzenal], ["semanal", RV.PERIODOS.semanal]], p.periodicidade)))
      + "</div><div class=\"row\">"
      + K.campo('Quem é "a equipe"', K.sel("rp-eq", K.opts([["obra", RV.EQUIPES.obra], ["produtores", RV.EQUIPES.produtores], ["empresa", RV.EQUIPES.empresa]], p.equipe)))
      + "</div>"
      + '<p class="muted" style="margin:16px 0 6px"><b>Parte fixa</b> — guardada aqui para não se perder, e que <b>não entra</b> em nenhuma conta desta tela.</p>'
      + '<div class="row">'
      + K.campo("Piso da categoria (R$)", K.inp("rp-piso", b.pisoCategoria))
      + K.campo("Vale alimentação mensal (R$)", K.inp("rp-va", b.valeAlimentacao))
      + "</div>"
      + '<div class="flex mt"><button class="btn primary" data-gacao="rv-salvar-param">Salvar parâmetros</button></div></div>';
    return html;
  }

  /* ===================================================================
   * AÇÕES
   * =================================================================== */
  G.registrarAcoes("remunvar", {
    "rv-aba": function (ds) { G._rvAba = ds.aba || "apuracao"; App.render(); },
    "rv-obra": function (ds) { G._rvObra = ds && ds.value != null ? String(ds.value) : ""; App.render(); },
    "rv-equipe": function (ds) {
      var chave = G._rvObra || "*";
      G._rvFora[chave] = G._rvFora[chave] || {};
      var el = document.querySelector('[data-gacao="rv-equipe"][data-cid="' + ds.cid + '"]');
      if (el && el.checked) delete G._rvFora[chave][ds.cid];
      else G._rvFora[chave][ds.cid] = 1;
      App.render();
    },
    "rv-salvar-param": function () {
      var b = paramBruto();
      b.porM2 = K.v("rp-m2") === "" ? null : Util.num(K.v("rp-m2"));
      b.rateioEquipePct = K.v("rp-rat") === "" ? 50 : Util.num(K.v("rp-rat"));
      b.periodicidade = K.v("rp-per");
      b.equipe = K.v("rp-eq");
      b.pisoCategoria = K.v("rp-piso") === "" ? null : Util.num(K.v("rp-piso"));
      b.valeAlimentacao = K.v("rp-va") === "" ? null : Util.num(K.v("rp-va"));
      Store.salvar(eid(), ENT_PARAM, b);
      UI.toast("Parâmetros salvos.", "ok");
      App.render();
    },
    "rv-aprovar": function () {
      var st = estado();
      var r = st.res;
      var quem = (typeof Auth !== "undefined" && Auth.nome) ? Auth.nome() : "";
      UI.modal("Aprovar a apuração de " + esc(G._rvComp) + "?",
        "<p>Isto é o <b>2º nível</b>: a homologação da gestão. Depois dela o valor está pronto para pagamento e "
        + "a metragem usada fica marcada como paga — não entra em apuração nenhuma de novo.</p>"
        + "<p><b>" + n2(r.m2) + " " + esc(r.unidade) + "</b> · pote de <b>" + moeda(r.pote) + "</b> · "
        + Util.arr(r.linhas).length + " pessoa(s).</p>",
        [{ texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
         { texto: "Aprovar", classe: "primary", onClick: function () {
           var a = apuracaoSalva() || { obraId: G._rvObra, competencia: G._rvComp, estado: "rascunho" };
           var chk = RV.aprovar(a, r, quem, Util.agoraISO());
           if (!chk.ok) { UI.toast(chk.motivos.join(" "), "erro"); return; }
           Store.salvar(eid(), ENT_APUR, a);
           UI.fecharModal();
           UI.toast("Apuração aprovada.", "ok");
           App.render();
         } }]);
    },
    "rv-folha": function (ds) {
      var a = Store.obter(eid(), ENT_APUR, ds.id);
      if (!a) return;
      /* ⚠ GUARDA EM FUNÇÃO, não só o `disabled` do botão. O dispatcher é
         global e o `data-gacao` chega por qualquer caminho — atributo
         desabilitado não protege pagamento. Sem isto, disparar a ação duas
         vezes lançava a mesma apuração duas vezes na Folha. */
      if (a.estado !== "aprovada" && a.estado !== "paga") {
        UI.toast("Só apuração aprovada pela gestão vai para a folha.", "erro"); return;
      }
      /* ⚠ REENVIAR SÓ SE OS LANÇAMENTOS SUMIRAM — a mesma regra do lado da
         Produção (`prodParaFolha` confere `m.fsLancamentoId`). Marcar "paga"
         e não guardar o que foi criado deixava dois buracos: reenviar pagava
         duas vezes, e apagar o lançamento na Folha por engano trancava a
         metragem como paga para sempre, sem caminho de volta. */
      var vivos = Util.arr(a.fsLancamentos).filter(function (lid) {
        return !!Store.obter(eid(), "fs_lancamentos", lid);
      });
      if (a.estado === "paga" && vivos.length) {
        UI.toast("Esta apuração já está lançada na Folha Semanal (" + vivos.length + " lançamento(s)) — lançar de novo pagaria duas vezes.", "erro");
        return;
      }
      if (typeof global.FolhaSemanal === "undefined") {
        UI.toast("A Folha Semanal não está disponível nesta instalação.", "erro");
        return;
      }
      var lancs = RV.paraFolha(a, K.lista("colaboradores"));
      if (!lancs.length) { UI.toast("Nada a lançar.", "erro"); return; }
      /* ⚠ A SEMANA É A DO ÚLTIMO DIA DA COMPETÊNCIA, nunca a que estava
         aberta no filtro da Folha. O acerto é mensal e a Folha é ancorada em
         segunda-feira; usar o filtro da outra tela já lançou pagamento em
         semana fechada uma vez, e o dinheiro sumiu do fechamento certo. */
      var per = RV.periodoDe(a.competencia);
      var semana = G._prodSemanaDe(per.ate, global.FolhaSemanal) || global.FolhaSemanal.chaveSemana(new Date());
      var ids = [];
      lancs.forEach(function (L) {
        L.semana = semana;
        var gravado = Store.salvar(eid(), "fs_lancamentos", L);
        if (gravado && gravado.id) ids.push(gravado.id);
      });
      /* o vínculo de volta é o que permite conferir, reenviar depois de um
         estorno e rastrear de onde veio o valor na Folha */
      a.fsLancamentos = ids;
      a.estado = "paga";
      a.enviadaFolhaEm = Util.agoraISO();
      Store.salvar(eid(), ENT_APUR, a);
      UI.toast(lancs.length + " lançamento(s) enviados para a Folha Semanal.", "ok");
      App.render();
    }
  });

  /* ⚠ O CAMPO DE MÊS SE LIGA AQUI, depois do DOM existir — ver a nota no
     `registrarWire` do gestao.js. `change` (não `input`) porque o seletor de
     mês do navegador dispara `input` a cada clique dentro do calendário, e
     re-renderizar no meio fecharia o calendário na cara da pessoa. */
  G.registrarWire("remunvar", function () {
    var el = document.getElementById("rv-comp");
    if (!el) return;
    el.onchange = function () {
      if (!this.value) return;
      G._rvComp = this.value;
      App.render();
    };
  });

})(typeof window !== "undefined" ? window : this);
