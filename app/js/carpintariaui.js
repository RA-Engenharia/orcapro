/* =====================================================================
 * carpintariaui.js — A TELA do módulo Carpintaria
 *
 * O motor (regras, conta, congelamento) está em js/carpintaria.js e não
 * conhece DOM nenhum. Aqui só há tela: ler o cadastro, montar HTML, coletar
 * o que a pessoa digitou e devolver para o motor decidir.
 *
 * ⚠ ESTE ARQUIVO NÃO MORA NO gestao.js DE PROPÓSITO. Módulo de um cliente
 *   não engorda o arquivo de 19 mil linhas que é de todos. O engate são três
 *   coisas que o gestao.js expõe: `Gestao.ui` (os helpers de tela),
 *   `Gestao.registrarAcoes` (o dispatcher de `data-gacao`, já com RBAC) e a
 *   atribuição de `Gestao.renderCarpintaria` aqui embaixo. Por isso este
 *   <script> vem DEPOIS do js/gestao.js no index.html.
 *
 * ⚠ NADA AQUI DECIDE DINHEIRO. Toda conta passa por `Carpintaria.calcular`.
 *   Se a tela somar por conta própria "só para mostrar", vira um segundo
 *   número — e o segundo número é sempre o que aparece na hora errada.
 * ===================================================================== */
(function (global) {
  "use strict";

  if (typeof global.Gestao === "undefined") return;   // sem Gestão não há tela

  var G = global.Gestao;
  var K = G.ui;
  var C = global.Carpintaria;

  var ENT_PARAM = "carp_param";
  var ENT_MADEIRA = "carp_madeiras";
  var ENT_MO = "carp_mo";
  var ENT_PROP = "carp_propostas";
  var ENT_PARCEIRO = "carp_parceiros";

  function eid() { return (typeof Auth !== "undefined" && Auth.empresaId) ? Auth.empresaId() : "default"; }
  function esc(s) { return Util.esc(s == null ? "" : String(s)); }
  function moeda(v) { return v == null ? "—" : Util.fmtMoeda(v); }
  function n2(v) { return v == null ? "—" : Util.fmtNum(v, 2); }
  /* ⚠ DIA LOCAL, NUNCA `toISOString()`. Em Brasília, das 21h à meia-noite o
     ISO já está em AMANHÃ: a proposta feita às 22h nascia com a data do dia
     seguinte, e a validade de 30 dias contava errado. */
  function hojeISO() {
    var d = new Date();
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }

  /* ---------- parâmetros: um registro só ---------- */
  function param() {
    var l = K.lista(ENT_PARAM);
    return C.parametros(l.length ? l[0] : null);
  }
  function paramBruto() {
    var l = K.lista(ENT_PARAM);
    return l.length ? l[0] : { id: "carp-param" };
  }
  function ctx() {
    return { madeiras: K.lista(ENT_MADEIRA), servicos: K.lista(ENT_MO), parametros: paramBruto() };
  }

  /* ===================================================================
   * A TELA
   * =================================================================== */
  G._carpAba = "propostas";
  G._carpProp = null;          // id da proposta aberta no editor

  G.renderCarpintaria = function () {
    if (this._carpProp) return this._carpEditor();

    var abas = [
      ["propostas", "Propostas"],
      ["madeiras", "Madeiras"],
      ["mo", "Mão de obra"],
      ["parceiros", "Parceiros"],
      ["param", "Parâmetros"]
    ];
    var aba = this._carpAba;
    var novo = aba === "madeiras" ? ["carp-nova-madeira", "Nova madeira"]
      : aba === "mo" ? ["carp-novo-mo", "Novo serviço"]
        : aba === "parceiros" ? ["carp-novo-parceiro", "Novo parceiro"]
          : aba === "propostas" ? ["carp-nova-proposta", "Nova proposta"] : null;

    var html = this._head(K.svg("carpintaria") + "Carpintaria", novo ? novo[0] : null, novo ? novo[1] : null, _avisoParam());
    html += '<div class="tabs" style="margin-bottom:14px">' + abas.map(function (a) {
      return '<div class="tab' + (a[0] === aba ? " ativa" : "") + '" data-gacao="carp-aba" data-aba="' + a[0] + '">' + a[1] + "</div>";
    }).join("") + "</div>";

    if (aba === "madeiras") return html + _madeiras();
    if (aba === "mo") return html + _mo();
    if (aba === "parceiros") return html + _parceiros();
    if (aba === "param") return html + _param();
    return html + _propostas();
  };

  /* Aviso curto no cabeçalho quando falta parâmetro — a pessoa precisa saber
     ANTES de montar a proposta, não na hora de fechar. */
  function _avisoParam() {
    var f = C.validarParametros(paramBruto());
    if (!f.length) return "";
    return '<span class="muted" style="margin-right:12px;align-self:center;color:var(--ambar,#b45309)">'
      + f.length + ' parâmetro(s) por preencher — aba <b>Parâmetros</b></span>';
  }

  /* ===================================================================
   * MADEIRAS — item × fornecedor → preço de compra, com data
   * =================================================================== */
  function _madeiras() {
    var ms = K.lista(ENT_MADEIRA);
    if (!ms.length) return K.vazioBox("Nenhuma madeira cadastrada", "carp-nova-madeira", "Cadastrar a primeira");
    var forn = {};
    K.lista("fornecedores").forEach(function (f) { forn[f.id] = f.nome || f.razaoSocial || f.id; });

    var html = '<table class="tbl"><thead><tr><th>Espécie</th><th>Aplicação</th><th>Dimensão</th><th>Un.</th>'
      + '<th>Fornecedores e preços de compra</th></tr></thead><tbody>';
    ms.forEach(function (m) {
      var precos = C.fornecedoresDe(m).map(function (fid) {
        var p = C.precoFornecedor(m, fid);
        return '<span class="g-pill" style="background:#2e6f9e18;color:var(--aco,#2e6f9e);margin-right:6px">'
          + esc(forn[fid] || "(fornecedor removido)") + " · " + moeda(p.valor)
          + (p.data ? ' <span class="muted">' + esc(Util.fmtDia(p.data)) + "</span>" : "") + "</span>";
      }).join("");
      html += '<tr><td style="cursor:pointer" data-gacao="carp-editar-madeira" data-id="' + m.id + '"><b>' + esc(m.especie) + "</b></td>"
        + "<td>" + esc(m.aplicacao || "—") + "</td><td>" + esc(m.dimensao || "—") + "</td><td>" + esc(m.unidade || "—") + "</td>"
        + "<td>" + (precos || '<span class="muted">sem preço — a proposta não fecha com este item</span>') + "</td></tr>";
    });
    return html + "</tbody></table>";
  }

  G.carpFormMadeira = function (m) {
    m = m || {};
    var forns = K.lista("fornecedores");
    var precos = Util.arr(m.precos);
    /* ⚠ SEMPRE DUAS LINHAS EM BRANCO NO FIM, não "complete até três".
       Com `while (precos.length < 3)`, a madeira que já tinha três
       fornecedores abria o formulário SEM nenhuma linha vazia — e não havia
       outro caminho para cadastrar o quarto fornecedor nem para corrigir um
       preço. O cadastro é histórico (só acrescenta), então linha nova é o
       modo normal de trabalhar aqui, não a exceção. */
    precos = precos.slice();
    precos.push({ fornecedorId: "", valor: "", data: hojeISO() });
    precos.push({ fornecedorId: "", valor: "", data: hojeISO() });

    var corpo =
      '<div class="row">' + K.campo("Espécie *", K.inp("cm-esp", m.especie, "Itaúba, Cumaru, Garapeira…"))
      + K.campo("Aplicação", K.inp("cm-apl", m.aplicacao, "Deck, Forro, Ripado, Caibro"))
      + K.campo("Dimensão", K.inp("cm-dim", m.dimensao, "2x10, 5x5…")) + "</div>"
      + '<div class="row">' + K.campo("Unidade *", K.sel("cm-un", K.opts([["m2", "m² (deck)"], ["m", "metro linear (forro, ripado, caibro)"], ["un", "unidade"], ["pc", "peça"]], m.unidade || "m2"))) + "</div>"
      + '<p class="muted" style="margin:14px 0 6px">Preço de <b>compra</b> por fornecedor. A proposta congela o preço do dia e o fornecedor escolhido — mudar aqui não mexe em proposta já fechada.</p>'
      + '<table class="tbl"><thead><tr><th>Fornecedor</th><th>Preço de compra (R$)</th><th>Data</th></tr></thead><tbody>'
      + precos.map(function (p, i) {
        return "<tr><td>" + K.sel("cm-f" + i, K.optsRec(forns, "nome", p.fornecedorId, "— escolha —")) + "</td>"
          + "<td>" + K.inp("cm-v" + i, p.valor) + "</td>"
          + "<td>" + K.inp("cm-d" + i, p.data || hojeISO(), "", "date") + "</td></tr>";
      }).join("") + "</tbody></table>";

    this._modalForm(ENT_MADEIRA, m, "Madeira", corpo, function (obj) {
      obj.especie = K.v("cm-esp");
      if (!obj.especie) { UI.toast("Informe a espécie.", "erro"); return false; }
      obj.aplicacao = K.v("cm-apl"); obj.dimensao = K.v("cm-dim"); obj.unidade = K.v("cm-un");
      var novos = [];
      for (var i = 0; i < precos.length; i++) {
        var f = K.v("cm-f" + i), val = K.v("cm-v" + i);
        if (!f || val === "") continue;
        novos.push({ fornecedorId: f, valor: Util.num(val), data: K.v("cm-d" + i) || hojeISO() });
      }
      /* ⚠ o histórico de preço não é sobrescrito: lançamento novo do mesmo
         fornecedor entra ao lado do antigo, e `precoFornecedor` usa o mais
         recente. Apagar o passado apagaria a explicação de proposta antiga. */
      var antigos = Util.arr(m.precos);
      obj.precos = antigos.concat(novos.filter(function (n) {
        return !antigos.some(function (a) {
          return a.fornecedorId === n.fornecedorId && Util.num(a.valor) === n.valor && a.data === n.data;
        });
      }));
      return true;
    });
  };

  /* ===================================================================
   * MÃO DE OBRA — serviço → R$/m²
   * =================================================================== */
  function _mo() {
    var ss = K.lista(ENT_MO);
    var p = param();
    var nota = '<div class="card mb" style="padding:12px 15px"><span class="muted">'
      + "O valor de tabela é o de obra <b>acima de " + (p.corteM2 == null ? "…" : n2(p.corteM2)) + " " + esc(p.unidadeMO) + "</b>. "
      + "Abaixo disso o sistema aplica sozinho o acréscimo dos Parâmetros — não cadastre duas linhas.</span></div>";
    if (!ss.length) return nota + K.vazioBox("Nenhum serviço na tabela de mão de obra", "carp-novo-mo", "Cadastrar o primeiro");
    var html = nota + '<table class="tbl"><thead><tr><th>Serviço</th><th>Unidade</th><th class="num">Valor de tabela</th></tr></thead><tbody>';
    ss.forEach(function (s) {
      var semPreco = s.valor == null || String(s.valor) === "";
      html += '<tr><td style="cursor:pointer" data-gacao="carp-editar-mo" data-id="' + s.id + '"><b>' + esc(s.servico) + "</b></td>"
        + "<td>" + esc(s.unidade || p.unidadeMO) + '</td><td class="num">'
        + (semPreco ? '<span class="muted">sem preço</span>' : moeda(Util.num(s.valor)) + " / " + esc(s.unidade || p.unidadeMO)) + "</td></tr>";
    });
    return html + "</tbody></table>";
  }

  G.carpFormMO = function (s) {
    s = s || {};
    var p = param();
    var corpo = '<div class="row">' + K.campo("Serviço *", K.inp("cs-nome", s.servico, "Deck, Forro, Ripado, Caibro…"))
      + K.campo("Unidade", K.sel("cs-un", K.opts([["m2", "m²"], ["m", "metro linear"]], s.unidade || p.unidadeMO)))
      + K.campo("Valor de tabela (R$ por unidade) *", K.inp("cs-val", s.valor)) + "</div>";
    this._modalForm(ENT_MO, s, "Serviço de mão de obra", corpo, function (obj) {
      obj.servico = K.v("cs-nome");
      if (!obj.servico) { UI.toast("Informe o serviço.", "erro"); return false; }
      obj.unidade = K.v("cs-un");
      var val = K.v("cs-val");
      /* ⚠ campo vazio fica NULO, não zero — serviço a R$ 0,00 fecha proposta
         cobrando nada por ele e ninguém confere o que parece certo. */
      obj.valor = val === "" ? null : Util.num(val);
      return true;
    });
  };

  /* ===================================================================
   * PARÂMETROS
   * =================================================================== */
  function _param() {
    var b = paramBruto(), p = C.parametros(b);
    var faltas = C.validarParametros(b);
    var dets = p.detalhes.slice();
    while (dets.length < 4) dets.push({ id: "", nome: "", pct: "" });

    var html = "";
    if (faltas.length) {
      html += '<div class="card mb" style="border-left:4px solid var(--ambar,#b45309)"><b>Falta preencher</b><ul style="margin:8px 0 0 18px">'
        + faltas.map(function (f) { return "<li>" + esc(f) + "</li>"; }).join("") + "</ul></div>";
    }
    html += '<div class="card">'
      + '<div class="row">'
      + K.campo("Metragem que separa as faixas", K.inp("cp-corte", b.corteM2))
      + K.campo("Acréscimo abaixo dessa metragem (%)", K.inp("cp-acr", b.acrescimoAbaixoPct))
      + K.campo("Validade da proposta (dias)", K.inp("cp-val", b.validadeDias == null ? 30 : b.validadeDias))
      + "</div>"
      + '<div class="row">'
      + K.campo("O acréscimo de faixa incide sobre", K.sel("cp-inca", K.opts([["mo", C.BASES.mo], ["total", C.BASES.total]], p.incideAcrescimo)))
      + K.campo("O percentual do detalhe incide sobre", K.sel("cp-incd", K.opts([["mo", C.BASES.mo], ["total", C.BASES.total]], p.incideDetalhe)))
      + "</div>"
      + '<div class="field"><label>Quando os dois acréscimos caem juntos</label>'
      + K.sel("cp-comp", K.opts([["somado", C.COMPOSICOES.somado], ["composto", C.COMPOSICOES.composto]], p.composicaoAcrescimos))
      + '<span class="muted" style="display:block;margin-top:5px">Numa obra pequena com degrau, a diferença entre os dois modos é real. '
      + 'Confirme com quem faz o preço antes da primeira proposta.</span></div>'
      + '<p class="muted" style="margin:16px 0 6px"><b>Detalhes arquitetônicos</b> — cada um acrescenta o seu percentual.</p>'
      + '<table class="tbl"><thead><tr><th>Nome</th><th class="num">Percentual (%)</th></tr></thead><tbody>'
      + dets.map(function (d, i) {
        /* ⚠ O ID VIAJA JUNTO, escondido. Sem isto o `salvar` regerava o id a
           partir do nome — e "Iluminação embutida" vira "iluminacao-embutida",
           enquanto a semente gravou "iluminacao". Bastava abrir Parâmetros e
           salvar (sem mudar nada) para toda proposta que marcava esse detalhe
           perder os 6,1%, calada: o id deixava de existir e `fatorDetalhe` o
           reportava como "detalhe desconhecido". */
        return "<tr><td>" + K.inp("cd-n" + i, d.nome, "Degrau, Curva…")
          + '<input type="hidden" id="cd-i' + i + '" value="' + esc(d.id || "") + '">'
          + '</td><td class="num">' + K.inp("cd-p" + i, d.pct) + "</td></tr>";
      }).join("") + "</tbody></table>"
      + '<div class="flex mt"><button class="btn primary" data-gacao="carp-salvar-param" data-n="' + dets.length + '">Salvar parâmetros</button></div>'
      + "</div>";
    return html;
  }

  G.carpSalvarParam = function (ds) {
    var b = paramBruto();
    b.corteM2 = K.v("cp-corte") === "" ? null : Util.num(K.v("cp-corte"));
    b.acrescimoAbaixoPct = K.v("cp-acr") === "" ? null : Util.num(K.v("cp-acr"));
    b.validadeDias = K.v("cp-val") === "" ? 30 : Util.num(K.v("cp-val"));
    b.incideAcrescimo = K.v("cp-inca");
    b.incideDetalhe = K.v("cp-incd");
    b.composicaoAcrescimos = K.v("cp-comp");
    b.unidadeMO = b.unidadeMO || "m2";
    var n = parseInt(ds && ds.n, 10) || 4, dets = [], i;
    for (i = 0; i < n; i++) {
      var nome = K.v("cd-n" + i), pct = K.v("cd-p" + i);
      if (!nome) continue;
      var idAntigo = K.v("cd-i" + i);
      dets.push({ id: idAntigo || C.chaveDe(nome), nome: nome, pct: pct === "" ? null : Util.num(pct) });
    }
    b.detalhes = dets;
    Store.salvar(eid(), ENT_PARAM, b);
    UI.toast("Parâmetros salvos.", "ok");
    App.render();
  };

  /* ===================================================================
   * PROPOSTAS
   * =================================================================== */
  function _propostas() {
    var ps = K.lista(ENT_PROP);
    if (!ps.length) return K.vazioBox("Nenhuma proposta", "carp-nova-proposta", "Montar a primeira");
    var cli = {}; K.lista("clientes").forEach(function (c) { cli[c.id] = c.nome || c.razaoSocial || c.id; });
    var hoje = hojeISO();
    ps = ps.slice().sort(function (a, b) { return String(b.data || "").localeCompare(String(a.data || "")); });

    var html = '<table class="tbl"><thead><tr><th>Proposta</th><th>Cliente</th><th>Data</th><th class="num">Metragem</th><th class="num">Total</th><th>Situação</th></tr></thead><tbody>';
    ps.forEach(function (p) {
      var r = C.calcular(p, ctx());
      var val = C.validade(p, hoje, paramBruto());
      var sit = !C.estaFechada(p) ? '<span class="g-pill" style="background:#64748b22;color:#64748b">Rascunho</span>'
        : val.vencida ? '<span class="g-pill" style="background:#dc262622;color:#dc2626">Vencida há ' + Math.abs(val.restam) + " dia(s)</span>"
          : '<span class="g-pill" style="background:#15803d22;color:#15803d">Fechada · vence em ' + val.restam + " dia(s)</span>";
      html += '<tr><td style="cursor:pointer" data-gacao="carp-abrir-proposta" data-id="' + p.id + '"><b>' + esc(p.titulo || "(sem título)") + "</b></td>"
        + "<td>" + esc(cli[p.clienteId] || "—") + "</td><td>" + esc(Util.fmtDia(p.data)) + '</td>'
        + '<td class="num">' + n2(r.metragem) + " " + esc(r.parametros.unidadeMO) + '</td>'
        + '<td class="num">' + moeda(r.total) + "</td><td>" + sit + "</td></tr>";
    });
    return html + "</tbody></table>";
  }

  G.carpNovaProposta = function () {
    var p = Store.salvar(eid(), ENT_PROP, {
      titulo: "Proposta " + Util.fmtDia(hojeISO()), data: hojeISO(),
      itensMadeira: [], itensMO: [], detalhes: []
    });
    this._carpProp = p.id;
    App.render();
  };

  G.carpAbrir = function (ds) { this._carpProp = ds.id; App.render(); };
  /* ⚠ SAIR SALVA. O botão "← Propostas" fica a um pixel de "Salvar", e antes
     ele descartava em silêncio tudo o que estava na tela — margem digitada,
     quantidade corrigida, detalhe marcado. Guardar ao sair é o que a pessoa
     espera de um editor que já salva por dentro a cada ação. */
  G.carpVoltar = function () {
    var id = this._carpProp;
    if (id) {
      var p = Store.obter(eid(), ENT_PROP, id);
      if (p && !C.estaFechada(p)) {
        coletar(p, C.calcular(p, ctx()));
        Store.salvar(eid(), ENT_PROP, p);
      }
    }
    this._carpProp = null;
    App.render();
  };

  /* ---------- o editor ---------- */
  G._carpEditor = function () {
    var p = Store.obter(eid(), ENT_PROP, this._carpProp);
    if (!p) { this._carpProp = null; return this.renderCarpintaria(); }
    var cx = ctx(), par = C.parametros(paramBruto());
    var r = C.calcular(p, cx);
    var fechada = C.estaFechada(p);
    var recViva = fechada ? _receitaViva(p) : null;
    var val = C.validade(p, hojeISO(), paramBruto());
    var mads = K.lista(ENT_MADEIRA), servs = K.lista(ENT_MO), clientes = K.lista("clientes"), obras = K.lista("obras");
    var forn = {}; K.lista("fornecedores").forEach(function (f) { forn[f.id] = f; });

    var html = '<div class="flex between mb"><h1 style="margin:0">' + K.svg("carpintaria") + esc(p.titulo || "Proposta") + "</h1>"
      + '<div class="flex"><button class="btn ghost" data-gacao="carp-voltar">← Propostas</button>'
      + '<button class="btn" data-gacao="carp-imprimir-proposta" data-id="' + p.id + '">'
        + (typeof Icones !== "undefined" ? Icones.get("imprimir", 15) : "") + " Proposta em PDF</button>"
      /* ⚠ UMA FONTE DE VERDADE SÓ: o registro no Store, nunca o `financeiroId`
         cru. O botão decidia por um e o handler por outro — e as duas coisas
         discordam sempre que o lançamento some, o que acontece por dois
         caminhos reais: alguém apaga no Financeiro, ou a obra é excluída em
         cascata (o financeiro morre com ela; a proposta sobrevive). Nesses
         casos a tela dizia "Receita lançada" para sempre, apontando para nada,
         e não havia como lançar de novo. */
      + (fechada
        ? (recViva
            ? '<span class="muted" style="align-self:center" title="' + esc("Lançada em " + (Util.fmtData(p.financeiroEm) || p.financeiroEm || "—") + (p.financeiroPor ? " por " + p.financeiroPor : "")) + '">Receita de ' + moeda(recViva.valor) + ' lançada</span>'
            : '<button class="btn" data-gacao="carp-receita" data-id="' + p.id + '">'
              + (typeof Icones !== "undefined" ? Icones.get("dinheiro", 15) : "") + " Lançar receita no Financeiro</button>")
          + '<button class="btn ghost" data-gacao="carp-reabrir" data-id="' + p.id + '">Reabrir</button>'
          + '<button class="btn" data-gacao="carp-refazer" data-id="' + p.id + '">Refazer com preços de hoje</button>'
        : '<button class="btn" data-gacao="carp-salvar-proposta" data-id="' + p.id + '">Salvar</button>'
          + '<button class="btn primary" data-gacao="carp-fechar-proposta" data-id="' + p.id + '">Fechar proposta</button>')
      + "</div></div>";

    if (fechada) {
      html += '<div class="card mb" style="border-left:4px solid ' + (val.vencida ? "#dc2626" : "#15803d") + '">'
        + "<b>Proposta fechada em " + esc(Util.fmtData(p.fechadaEm) || p.fechadaEm)
        + (p.fechadaPor ? " por " + esc(p.fechadaPor) : "") + ".</b> "
        + "Os preços, o fornecedor escolhido e os dois fatores estão congelados — mudar o cadastro não mexe mais nela. "
        + (val.vencida
          ? "<b>Venceu há " + Math.abs(val.restam) + " dia(s).</b> O reajuste é manual: use <b>Refazer com preços de hoje</b>."
          : "Vence em " + val.restam + " dia(s).")
        + "</div>";
    }

    /* ---- cabeçalho comercial ---- */
    var dis = fechada ? " disabled" : "";
    html += '<div class="card mb"><div class="row">'
      + K.campo("Título", '<input id="cx-tit" value="' + esc(p.titulo || "") + '"' + dis + ">")
      + K.campo("Cliente", '<select id="cx-cli"' + dis + ">" + K.optsRec(clientes, "nome", p.clienteId, "— nenhum —") + "</select>")
      + K.campo("Obra (opcional)", '<select id="cx-obra"' + dis + ">" + K.optsRec(obras, "nome", p.obraId, "— nenhuma —") + "</select>")
      + "</div><div class=\"row\">"
      + K.campo("Margem sobre o custo da madeira (%) *", '<input id="cx-marg" value="' + esc(p.margemPct == null ? "" : K.numBR(p.margemPct)) + '"' + dis + ">")
      + K.campo("Data", '<input id="cx-data" type="date" value="' + esc(p.data || hojeISO()) + '"' + dis + ">")
      + "</div>";
    if (!fechada) {
      html += '<span class="muted">A margem é definida em cada proposta e é <b>obrigatória</b>: sem ela a madeira sairia a preço de custo.</span>';
    }
    /* detalhes arquitetônicos */
    if (par.detalhes.length) {
      html += '<p class="muted" style="margin:14px 0 6px"><b>Detalhes arquitetônicos desta obra</b></p><div class="flex" style="gap:14px;flex-wrap:wrap">'
        + par.detalhes.map(function (d) {
          var on = Util.arr(p.detalhes).indexOf(d.id) > -1;
          return '<label style="display:inline-flex;align-items:center;gap:6px"><input type="checkbox" id="cx-det-' + d.id + '"'
            + (on ? " checked" : "") + dis + "> " + esc(d.nome) + " <span class=\"muted\">+" + n2(d.pct) + "%</span></label>";
        }).join("") + "</div>";
    }
    html += "</div>";

    /* ---- madeira ---- */
    html += '<div class="card mb"><div class="flex between"><h3 style="margin:0">Madeira</h3>'
      + (fechada ? "" : '<button class="btn sm" data-gacao="carp-add-madeira" data-id="' + p.id + '">+ Item</button>') + "</div>";
    /* ⚠ CATALOGO VAZIO NAO PODE VIRAR UM DROPDOWN VAZIO.
       O item da proposta e ESCOLHIDO do catalogo de madeiras; sem catalogo, o
       `<select>` sai com "— escolha —" e mais nada. Quem esta montando a
       proposta clica, nao abre lista nenhuma, e conclui — com razao — que o
       sistema esta quebrado. Foi assim que chegou o relato: "nao esta abrindo
       a aba de escolha nem fornecedor".
       A tela nao pode oferecer uma escolha que nao existe. Ela diz o que
       falta e leva ate la. */
    if (!mads.length) {
      html += '<div class="mt" style="padding:12px;border-left:3px solid #b45309;background:#b4530911;border-radius:0 8px 8px 0">'
        + '<b>Nenhuma madeira cadastrada ainda.</b>'
        + '<p class="muted" style="margin:6px 0 8px;font-size:12.5px">O item da proposta é escolhido do seu catálogo de madeiras — e o preço vem de lá, por fornecedor. Enquanto o catálogo estiver vazio, o campo <b>Item</b> não tem o que oferecer.</p>'
        + '<button class="btn sm primary" data-gacao="carp-aba" data-aba="madeiras">Cadastrar madeira</button></div>';
    }
    if (!r.linhasMadeira.length) html += '<p class="muted mt">Nenhum item de madeira.</p>';
    else {
      html += '<table class="tbl mt"><thead><tr><th>Item</th><th>Fornecedor</th><th class="num">Qtd</th><th class="num">Custo unit.</th><th class="num">Subtotal</th>' + (fechada ? "" : "<th></th>") + "</tr></thead><tbody>";
      r.linhasMadeira.forEach(function (L, i) {
        var selMad = fechada ? esc(L.descricao)
          : '<select id="cx-m-mad' + i + '"' + (mads.length ? "" : ' class="aviso-vazio"') + '>' + K.optsRec(mads.map(function (m) { return { id: m.id, nome: C.descricaoMadeira(m) }; }), "nome", L.madeiraId, mads.length ? "— escolha —" : "— cadastre uma madeira primeiro —") + "</select>";
        var listaForn = (mads.filter(function (m) { return m.id === L.madeiraId; })[0] || null);
        var opForn = listaForn ? C.fornecedoresDe(listaForn).map(function (fid) { return { id: fid, nome: (forn[fid] && (forn[fid].nome || forn[fid].razaoSocial)) || "(removido)" }; }) : [];
        /* ⚠ O MOTIVO VAI DENTRO DO CAMPO, e nao numa nota que ninguem le.
           O preco e `madeira x fornecedor`: linha sem madeira nao tem
           fornecedor nenhum para oferecer, e linha com madeira sem preco
           cadastrado tambem nao. Nos dois casos o campo saia com "— escolha —"
           e mais nada, e o usuario ficava clicando num dropdown vazio.
           O texto do proprio placeholder e o unico lugar onde ele vai olhar. */
        var vazioForn = !L.madeiraId ? "— escolha a madeira primeiro —"
          : (!opForn.length ? "— esta madeira não tem preço de fornecedor —" : "— escolha —");
        var selForn = fechada ? esc((forn[L.fornecedorId] && (forn[L.fornecedorId].nome || forn[L.fornecedorId].razaoSocial)) || "—")
          : '<select id="cx-m-forn' + i + '"' + (opForn.length ? "" : ' class="aviso-vazio"') + '>' + K.optsRec(opForn, "nome", L.fornecedorId, vazioForn) + "</select>";
        html += "<tr><td>" + selMad + "</td><td>" + selForn + '</td><td class="num">'
          + (fechada ? n2(L.qtd) : '<input id="cx-m-qtd' + i + '" value="' + esc(K.numBR(L.qtd)) + '" style="width:90px;text-align:right">')
          + '</td><td class="num">' + (L.semPreco ? '<span class="muted">sem preço</span>' : moeda(L.custoUnit))
          + '</td><td class="num">' + moeda(L.subtotal) + "</td>"
          + (fechada ? "" : '<td><button class="btn danger sm" data-gacao="carp-rm-madeira" data-id="' + p.id + '" data-i="' + i + '">×</button></td>')
          + "</tr>";
      });
      html += "</tbody></table>";
    }
    html += "</div>";

    /* ---- mão de obra ---- */
    html += '<div class="card mb"><div class="flex between"><h3 style="margin:0">Mão de obra</h3>'
      + (fechada ? "" : '<button class="btn sm" data-gacao="carp-add-mo" data-id="' + p.id + '">+ Serviço</button>') + "</div>";
    if (!servs.length) {
      html += '<div class="mt" style="padding:12px;border-left:3px solid #b45309;background:#b4530911;border-radius:0 8px 8px 0">'
        + '<b>Nenhum serviço de mão de obra cadastrado ainda.</b>'
        + '<p class="muted" style="margin:6px 0 8px;font-size:12.5px">O serviço da proposta é escolhido da sua tabela de mão de obra, com o valor por m². Enquanto ela estiver vazia, o campo <b>Serviço</b> não tem o que oferecer.</p>'
        + '<button class="btn sm primary" data-gacao="carp-aba" data-aba="mo">Cadastrar serviço</button></div>';
    }
    if (!r.linhasMO.length) html += '<p class="muted mt">Nenhum serviço lançado.</p>';
    else {
      html += '<table class="tbl mt"><thead><tr><th>Serviço</th><th class="num">Metragem</th><th class="num">R$ / un.</th><th class="num">Subtotal</th>' + (fechada ? "" : "<th></th>") + "</tr></thead><tbody>";
      r.linhasMO.forEach(function (L, i) {
        var selS = fechada ? esc(L.servico)
          : '<select id="cx-s-srv' + i + '"' + (servs.length ? "" : ' class="aviso-vazio"') + '>' + K.optsRec(servs.map(function (s) { return { id: s.id, nome: s.servico }; }), "nome", L.servicoId, servs.length ? "— escolha —" : "— cadastre um serviço primeiro —") + "</select>";
        html += "<tr><td>" + selS + '</td><td class="num">'
          + (fechada ? n2(L.qtd) : '<input id="cx-s-qtd' + i + '" value="' + esc(K.numBR(L.qtd)) + '" style="width:90px;text-align:right">')
          + " " + esc(L.unidade) + '</td><td class="num">' + (L.semPreco ? '<span class="muted">sem preço</span>' : moeda(L.valorUnit))
          + '</td><td class="num">' + moeda(L.subtotal) + "</td>"
          + (fechada ? "" : '<td><button class="btn danger sm" data-gacao="carp-rm-mo" data-id="' + p.id + '" data-i="' + i + '">×</button></td>')
          + "</tr>";
      });
      html += "</tbody></table>";
    }
    html += "</div>";

    /* ⚠ o rastro da reabertura aparece na TELA. Gravar quem reabriu e não
       mostrar seria campo morto — e a pergunta que ele responde ("quem mexeu
       na proposta que eu enviei?") só se faz olhando esta tela. */
    /* ⚠ e sobrevive ao RE-FECHAMENTO. O fluxo normal é reabrir → corrigir →
       fechar de novo; com a guarda em `!fechada` o rastro sumia justamente
       quando a proposta voltava a valer, que é quando a pergunta "quem mexeu
       nisto?" costuma ser feita. */
    if (p.reabertaEm) {
      html += '<div class="card mb" style="border-left:4px solid var(--ambar,#b45309)">'
        + "<b>Reaberta em " + esc(Util.fmtData(p.reabertaEm) || p.reabertaEm)
        + (p.reabertaPor ? " por " + esc(p.reabertaPor) : "") + ".</b> "
        + "Estava fechada desde " + esc(Util.fmtData(p.fechadaAnteriorEm) || p.fechadaAnteriorEm)
        + " e voltou a seguir o cadastro de hoje.</div>";
    }

    /* ⚠ receita lançada com valor DIFERENTE do total de hoje: acontece quando a
       proposta é reaberta, alterada e fechada de novo. O lançamento no caixa
       não se corrige sozinho — e o silencio aqui deixaria o Financeiro com o
       preço velho para sempre. */
    if (recViva && Math.abs(Util.num(recViva.valor) - Util.num(r.total)) >= 0.01) {
      html += '<div class="card mb" style="border-left:4px solid #dc2626">'
        + "<b>A receita lançada não bate com esta proposta.</b> "
        + "No Financeiro está " + moeda(recViva.valor) + " e a proposta hoje soma " + moeda(r.total) + ". "
        + "Ajuste o lançamento no Financeiro — ele não se corrige sozinho.</div>";
    }

    /* ---- condições comerciais (o que vai no papel) ---- */
    html += _blocoComercial(p, fechada);

    /* ---- o resumo da conta ---- */
    html += _resumo(r);

    if (r.pendencias.length) {
      html += '<div class="card mb" style="border-left:4px solid var(--ambar,#b45309)"><b>Antes de fechar</b><ul style="margin:8px 0 0 18px">'
        + r.pendencias.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></div>";
    }
    /* avisos não impedem o fechamento — e por isso vêm em caixa diferente da
       de pendências, senão a pessoa procura o que "consertar" e não acha */
    if (Util.arr(r.avisos).length) {
      html += '<div class="card mb" style="border-left:4px solid var(--aco,#2e6f9e)"><b>Para você saber</b><ul style="margin:8px 0 0 18px">'
        + r.avisos.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></div>";
    }
    return html;
  };

  /* A conta, aberta linha a linha. ⚠ Todo número aqui vem de `Carpintaria.calcular` */
  function _resumo(r) {
    function ln(rot, val, forte, obs) {
      return '<tr><td>' + esc(rot) + (obs ? ' <span class="muted">' + esc(obs) + "</span>" : "")
        + '</td><td class="num"' + (forte ? ' style="font-weight:700"' : "") + ">" + moeda(val) + "</td></tr>";
    }
    var p = r.parametros;
    var h = '<div class="card mb"><h3 style="margin:0 0 10px">A conta</h3><table class="tbl"><tbody>';
    h += ln("Madeira a preço de compra", r.custoMadeira);
    h += ln("Margem de " + (r.margemPct == null ? "—" : n2(r.margemPct) + "%"), r.lucroMadeira, false,
      r.margemPct == null ? "informe a margem" : "");
    h += ln("Madeira ao cliente", r.vendaMadeira, true);
    h += ln("Mão de obra de tabela", r.moBase, false, n2(r.metragem) + " " + p.unidadeMO);
    if (r.faixa && r.faixa.abaixo) {
      h += ln("Acréscimo de obra abaixo de " + n2(r.faixa.corte) + " " + p.unidadeMO + " (+" + n2(r.faixa.pct) + "%)",
        r.acrescimoFaixa, false, "sobre " + C.BASES[p.incideAcrescimo]);
    }
    if (r.detalhe && r.detalhe.aplicados.length) {
      h += ln("Detalhes: " + r.detalhe.aplicados.map(function (d) { return d.nome + " +" + n2(d.pct) + "%"; }).join(", "),
        r.acrescimoDetalhe, false, "sobre " + C.BASES[p.incideDetalhe]);
    }
    h += ln("Mão de obra final", r.moTotal, true);
    h += '<tr><td style="font-size:15px"><b>Total da proposta</b></td><td class="num" style="font-size:17px;font-weight:800">' + moeda(r.total) + "</td></tr>";
    return h + "</tbody></table></div>";
  }

  /* ---------- coletar o que está na tela ANTES de qualquer ação ----------
     ⚠ Toda ação do editor passa por aqui primeiro. Sem isso, clicar em
       "+ Item" depois de digitar uma quantidade jogaria fora o que foi
       digitado — e o usuário aprende a não confiar na tela. */
  function coletar(p, r) {
    if (C.estaFechada(p)) return p;
    var t = K.v("cx-tit"); if (t) p.titulo = t;
    p.clienteId = K.v("cx-cli"); p.obraId = K.v("cx-obra"); p.data = K.v("cx-data") || p.data;
    var mg = K.v("cx-marg");
    p.margemPct = mg === "" ? null : Util.num(mg);
    var par = C.parametros(paramBruto());
    p.detalhes = par.detalhes.filter(function (d) {
      var e = UI.el("cx-det-" + d.id);
      return e && e.checked;
    }).map(function (d) { return d.id; });

    p.itensMadeira = r.linhasMadeira.map(function (L, i) {
      var mad = K.v("cx-m-mad" + i) || L.madeiraId;
      var f = K.v("cx-m-forn" + i);
      var q = UI.el("cx-m-qtd" + i);
      /* ⚠ TROCOU A MADEIRA → O FORNECEDOR CAI FORA. A lista de fornecedores
         daquela linha foi desenhada para a madeira ANTERIOR: manter o que está
         selecionado gravaria um fornecedor que a madeira nova não tem, e o item
         apareceria "sem preço" sem a pessoa entender por quê. Zerado, o próximo
         desenho já traz a lista certa e a pendência diz "falta escolher o
         fornecedor", que é o que de fato falta. */
      var trocouMadeira = mad !== L.madeiraId;
      return {
        madeiraId: mad,
        fornecedorId: trocouMadeira ? "" : (f || L.fornecedorId),
        qtd: q ? Util.num(q.value) : L.qtd
      };
    });
    p.itensMO = r.linhasMO.map(function (L, i) {
      var s = K.v("cx-s-srv" + i) || L.servicoId;
      var q = UI.el("cx-s-qtd" + i);
      return { servicoId: s, qtd: q ? Util.num(q.value) : L.qtd };
    });
    _coletarComercial(p);
    return p;
  }

  function comProposta(ds, fn) {
    var p = Store.obter(eid(), ENT_PROP, ds.id);
    if (!p) { UI.toast("Proposta não encontrada.", "erro"); return; }
    var r = C.calcular(p, ctx());
    coletar(p, r);
    fn(p);
    Store.salvar(eid(), ENT_PROP, p);
    App.render();
  }

  G.carpSalvarProposta = function (ds) { comProposta(ds, function () {}); UI.toast("Proposta salva.", "ok"); };
  G.carpAddMadeira = function (ds) { comProposta(ds, function (p) { p.itensMadeira.push({ madeiraId: "", fornecedorId: "", qtd: 0 }); }); };
  G.carpAddMO = function (ds) { comProposta(ds, function (p) { p.itensMO.push({ servicoId: "", qtd: 0 }); }); };
  G.carpRmMadeira = function (ds) { comProposta(ds, function (p) { p.itensMadeira.splice(parseInt(ds.i, 10), 1); }); };
  G.carpRmMO = function (ds) { comProposta(ds, function (p) { p.itensMO.splice(parseInt(ds.i, 10), 1); }); };

  function _quem() {
    try { return (typeof Auth !== "undefined" && Auth.nome) ? Auth.nome() : ""; } catch (e) { return ""; }
  }

  G.carpFechar = function (ds) {
    /* ⚠ fechar congela preço de venda: passa pelo mesmo gate de licença que o
       resto do que grava dinheiro. */
    if (G._bloqueado && G._bloqueado()) return;
    var p = Store.obter(eid(), ENT_PROP, ds.id);
    if (!p) return;
    var cx = ctx();
    coletar(p, C.calcular(p, cx));
    var chk = C.congelar(p, cx, Util.agoraISO(), _quem());
    if (!chk.ok) {
      /* ⚠ o motor recusou: NADA foi gravado como fechado. A tela diz o
         motivo em vez de fechar e deixar o problema para o cliente achar. */
      Store.salvar(eid(), ENT_PROP, p);
      UI.modal("Não dá para fechar ainda", "<ul style=\"margin:0 0 0 18px\">"
        + chk.pendencias.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>",
        [{ texto: "Entendi", classe: "primary", onClick: function () { UI.fecharModal(); App.render(); } }]);
      return;
    }
    Store.salvar(eid(), ENT_PROP, p);
    UI.toast("Proposta fechada — preços congelados.", "ok");
    App.render();
  };

  G.carpReabrir = function (ds) {
    if (G._bloqueado && G._bloqueado()) return;
    var p = Store.obter(eid(), ENT_PROP, ds.id);
    if (!p) return;
    /* ⚠ receita já lançada muda a conversa: reabrir passa a mexer no valor de
       uma venda que já está no caixa a receber. Não se proíbe — obra muda — mas
       não se deixa acontecer por engano. */
    var temReceita = !!_receitaViva(p);
    UI.modal("Reabrir a proposta?", "<p>Ela volta a ser rascunho e passa a seguir o <b>cadastro de hoje</b>: preços, "
      + "fornecedor e a faixa de metragem serão recalculados. O que foi congelado no fechamento é descartado.</p>"
      + "<p class=\"muted\">Se o objetivo é atualizar preços mantendo o histórico, use <b>Refazer com preços de hoje</b> — "
      + "ela cria uma proposta nova e preserva esta.</p>"
      + (temReceita ? '<div class="card" style="border-left:4px solid #dc2626"><b>Esta proposta já tem receita lançada no Financeiro.</b> '
          + "Reabrir não apaga esse lançamento — se o valor mudar, ajuste-o lá também, senão o caixa fica com o preço antigo.</div>" : ""),
      [{ texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
       { texto: "Reabrir", classe: "danger", onClick: function () {
         C.reabrir(p, _quem(), Util.agoraISO()); Store.salvar(eid(), ENT_PROP, p);
         UI.fecharModal(); UI.toast("Proposta reaberta.", "ok"); App.render();
       } }]);
  };

  G.carpRefazer = function (ds) {
    var velha = Store.obter(eid(), ENT_PROP, ds.id);
    if (!velha) return;
    var nova = C.refazer(velha, Util.agoraISO());
    nova.titulo = (velha.titulo || "Proposta") + " (refeita)";
    nova.data = hojeISO();
    var salva = Store.salvar(eid(), ENT_PROP, nova);
    this._carpProp = salva.id;
    UI.toast("Proposta nova criada com os preços de hoje. A anterior continua guardada.", "ok");
    App.render();
  };

  /* ===================================================================
   * PARCEIROS — o revendedor e a tabela que a carpintaria define para ele
   *
   * ⚠ O QUE VAI PARA O SERVIDOR PASSA POR `Parceiro.paraPortal`, SEMPRE.
   *   Ele monta o pacote campo a campo justamente para o custo de compra e o
   *   fornecedor não viajarem junto. Publicar `precos` direto entregaria a
   *   margem da carpintaria ao revendedor dela — o ponto mais sensível do
   *   escopo inteiro. Ver o cabeçalho de js/parceiro.js.
   * =================================================================== */
  function _srv() {
    return String((typeof CONFIG !== "undefined" && CONFIG.licencaServer) || "").replace(/\/$/, "");
  }
  function _chave() {
    return (typeof Licenca !== "undefined" && Licenca.chave) ? Licenca.chave() : "";
  }

  function _temParceiro() {
    if (typeof global.Parceiro !== "undefined") return true;
    try { UI.toast("O módulo de parceiros não carregou (js/parceiro.js). Atualize o sistema.", "erro"); } catch (e) {}
    return false;
  }

  function _parceiros() {
    /* ⚠ o motor do parceiro é outro <script>. Sem ele, a aba inteira quebraria
       com "Parceiro is not defined" e o módulo Carpintaria pareceria morto —
       o mesmo cuidado do `_moduloNaoCarregado` do gestao.js. */
    if (typeof global.Parceiro === "undefined") {
      return '<div class="card"><b>Parceiros indisponível.</b><p class="muted">'
        + "Falta <code>js/parceiro.js</code> no <code>index.html</code>. Atualize o sistema ou fale com o suporte.</p></div>";
    }
    var ps = K.lista(ENT_PARCEIRO);
    var html = '<div class="card mb" style="padding:12px 15px"><span class="muted">'
      + "O parceiro entra num portal só dele, vê <b>o preço que você definiu</b> e mantém um catálogo próprio — "
      + "que você também enxerga. Ele <b>não</b> vê o seu custo de compra nem o seu fornecedor, e não monta proposta aqui dentro."
      + '</span><div class="flex mt" style="gap:8px">'
      + '<button class="btn sm" data-gacao="carp-ler-catalogos">' + (typeof Icones !== "undefined" ? Icones.get("ciclo", 15) : "") + " Buscar os catálogos deles</button>"
      + "</div></div>";

    if (!ps.length) return html + K.vazioBox("Nenhum parceiro cadastrado", "carp-novo-parceiro", "Cadastrar o primeiro");

    var cx = { madeiras: K.lista(ENT_MADEIRA), servicos: K.lista(ENT_MO) };
    html += '<table class="tbl"><thead><tr><th>Parceiro</th><th>Login</th>'
      + '<th class="num">Margem madeira</th><th class="num">Ajuste mão de obra</th>'
      + "<th>Portal</th><th>Catálogo dele</th><th></th></tr></thead><tbody>";
    ps.forEach(function (raw) {
      var p = Parceiro.normalizar(raw);
      var r = Parceiro.precos(raw, cx);
      var cat = Util.arr(raw.catalogo);
      var situacao = !p.ativo
        ? '<span class="g-pill" style="background:#64748b22;color:#64748b">inativo</span>'
        : p.publicadoEm
          ? '<span class="g-pill" style="background:#15803d22;color:#15803d">publicado ' + esc(Util.fmtDia(p.publicadoEm)) + "</span>"
          : '<span class="g-pill" style="background:#b4530922;color:#b45309">nunca publicado</span>';
      html += '<tr><td style="cursor:pointer" data-gacao="carp-editar-parceiro" data-id="' + esc(p.id) + '"><b>' + esc(p.nome) + "</b>"
        + (r.pendencias.length ? '<br><span style="font-size:11.5px;color:var(--ambar,#b45309)">' + r.pendencias.length + " pendência(s)</span>" : "")
        + (!r.pendencias.length && Util.arr(r.avisos).length ? '<br><span class="muted" style="font-size:11.5px">' + r.avisos.length + " item(ns) sem preço ficam de fora</span>" : "")
        + "</td>"
        + "<td><code>" + esc(p.login) + "</code></td>"
        + '<td class="num">' + (p.margemMadeiraPct == null ? '<span class="muted">falta</span>' : n2(p.margemMadeiraPct) + "%") + "</td>"
        + '<td class="num">' + (p.ajusteMOPct > 0 ? "+" : "") + n2(p.ajusteMOPct) + "%</td>"
        + "<td>" + situacao + "</td>"
        + "<td>" + (cat.length
          ? '<button class="btn sm" data-gacao="carp-ver-catalogo" data-id="' + esc(p.id) + '">' + cat.length + " item(ns)</button>"
          : '<span class="muted">—</span>') + "</td>"
        + '<td><button class="btn sm primary" data-gacao="carp-publicar-parceiro" data-id="' + esc(p.id) + '">Publicar tabela</button></td>'
        + "</tr>";
    });
    return html + "</tbody></table>";
  }

  G.carpFormParceiro = function (raw) {
    raw = raw || {};
    var p = Parceiro.normalizar(raw);
    var forns = K.lista("fornecedores");
    var corpo =
      '<div class="row">' + K.campo("Nome do parceiro *", K.inp("cp-nome", p.nome, "Deck & Cia"))
      + K.campo("Login do portal *", K.inp("cp-login", p.login, "só letras, números, ponto e hífen")) + "</div>"
      + '<div class="row">'
      + K.campo("Margem da madeira (%) *", K.inp("cp-marg", raw.margemMadeiraPct))
      + K.campo("Ajuste da mão de obra (%)", K.inp("cp-aju", raw.ajusteMOPct == null ? 0 : raw.ajusteMOPct))
      + "</div>"
      + '<p class="muted" style="margin:2px 0 12px">A margem é aplicada sobre o <b>seu custo de compra</b> e forma o preço que ele vê — '
      + "por isso ela é obrigatória: sem margem, o portal mostraria o seu custo. "
      + "O ajuste da mão de obra é sobre a sua tabela (0% = preço de tabela; −10% = ele paga 10% menos).</p>"
      + '<div class="row">' + K.campo("Fornecedor vinculado (opcional)", K.sel("cp-forn", K.optsRec(forns, "nome", p.fornecedorId, "— nenhum —")))
      + K.campo("Situação", K.sel("cp-ativo", K.opts([["sim", "Ativo"], ["nao", "Inativo"]], p.ativo ? "sim" : "nao"))) + "</div>"
      + K.campo("Senha do portal", '<input id="cp-senha" type="password" value="" placeholder="'
        + (raw.senha ? "digitada, será enviada ao publicar" : (p.publicadoEm ? "em branco = manter a atual" : "mínimo 6 caracteres")) + '">')
      + '<p class="muted" style="margin:2px 0 0">A senha fica <b>guardada neste computador</b> até você publicar a tabela; '
      + "depois disso ela vive só no servidor, com hash. Em branco, mantém a que já está publicada.</p>";

    var self = this;
    this._modalForm(ENT_PARCEIRO, raw, "Parceiro", corpo, function (obj) {
      obj.nome = K.v("cp-nome");
      obj.login = K.v("cp-login").toLowerCase();
      obj.margemMadeiraPct = K.v("cp-marg") === "" ? null : Util.num(K.v("cp-marg"));
      obj.ajusteMOPct = K.v("cp-aju") === "" ? 0 : Util.num(K.v("cp-aju"));
      obj.fornecedorId = K.v("cp-forn");
      var eraAtivo = raw.ativo !== false;
      obj.ativo = K.v("cp-ativo") !== "nao";
      /* ⚠ INATIVO TEM DE TRANCAR A PORTA, e não só pintar o selo cinza. O
         campo ficava só no localStorage: a publicação seguinte carimbava
         `ativo:true` no servidor e o `if (rec.ativo === false)` do autenticador
         era código morto. Agora o estado viaja na publicação — e desativar
         revoga na hora, sem esperar a próxima. */
      if (eraAtivo && !obj.ativo) setTimeout(function () { G.carpRevogarNoServidor(obj, "desativado"); }, 0);
      var senha = K.v("cp-senha");
      if (senha) obj.senha = senha;
      var faltas = Parceiro.validar(obj);
      if (faltas.length) { UI.toast(faltas[0], "erro"); return false; }
      /* ⚠ login repetido é um parceiro vendo o portal do outro */
      if (!Parceiro.loginLivre(obj.login, obj.id, K.lista(ENT_PARCEIRO))) {
        UI.toast('O login "' + obj.login + '" já é de outro parceiro.', "erro"); return false;
      }
      return true;
    }, null, {
      /* ⚠ EXCLUIR AQUI TEM DE REVOGAR LÁ. Sem este gancho, o botão da lixeira
         apagava só o localStorage: o registro continuava no servidor com senha
         e tabela, e o ex-parceiro entrava no portal com o mesmo login pelo
         tempo que quisesse — inclusive recebendo as publicações seguintes.
         A tela dava a exclusão por concluída e ela não saía do navegador. */
      /* devolve promessa: se a revogação no portal falhar, o registro NÃO é
         apagado — senão o ex-parceiro continua entrando e não sobra na tela
         nada em que clicar para tentar de novo. */
      aoExcluir: function (reg) { return G.carpRevogarNoServidor(reg, "excluído"); }
    });
  };

  /* Tira o acesso do parceiro no servidor. Usado ao EXCLUIR e ao marcar como
     inativo. Falha aqui é dita em vermelho: o dono precisa saber que o antigo
     ainda entra — é a mesma regra da troca de usuário do Portal do Cliente. */
  /* Devolve uma promessa de BOOLEANO: `true` = pode seguir (revogado, ou nunca
     houve o que revogar), `false` = não revogou. Quem exclui usa isso para não
     apagar o registro de um parceiro que continua entrando no portal. */
  G.carpRevogarNoServidor = function (raw, verbo) {
    var p = Parceiro.normalizar(raw || {});
    if (!p.login || !p.publicadoEm) return Promise.resolve(true);   // nunca chegou ao servidor
    var srv = _srv(), chave = _chave();
    if (!srv || !chave) {
      UI.toast("Sem licença: o acesso de " + p.nome + " NÃO foi revogado no portal.", "erro");
      return Promise.resolve(false);
    }
    return fetch(srv + "/api/parceiro/remover", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-licenca": chave },
      body: JSON.stringify({ user: p.login })
    }).then(function (res) { return res.json(); }).then(function (j) {
      if (j && j.ok) { UI.toast("Parceiro " + (verbo || "removido") + " — o acesso ao portal foi revogado.", "ok"); return true; }
      UI.toast("ATENÇÃO: o acesso de " + p.nome + " ao portal NÃO foi revogado. Ele ainda entra.", "erro");
      return false;
    })["catch"](function () {
      UI.toast("ATENÇÃO: não consegui revogar o acesso de " + p.nome + " no portal. Ele ainda entra — tente de novo.", "erro");
      return false;
    });
  };

  G.carpPublicarParceiro = function (ds) {
    var raw = Store.obter(eid(), ENT_PARCEIRO, ds.id);
    if (!raw) return;
    var p = Parceiro.normalizar(raw);
    var cx = { madeiras: K.lista(ENT_MADEIRA), servicos: K.lista(ENT_MO) };
    var r = Parceiro.precos(raw, cx);

    if (!r.completa) {
      /* ⚠ MODAL SEM MOTIVO É PIOR QUE NENHUM MODAL. `completa` também é falsa
         quando não há item nenhum, e nesse caso `pendencias` podia vir vazia —
         a pessoa via a caixa "Ainda não dá para publicar" com uma lista em
         branco e nada para consertar. */
      var motivos = r.pendencias.length ? r.pendencias
        : ["Nada para publicar: cadastre madeira com preço ou serviço de mão de obra antes."];
      UI.modal("Ainda não dá para publicar", "<ul style=\"margin:0 0 0 18px\">"
        + motivos.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>",
        [{ texto: "Entendi", classe: "primary", onClick: function () { UI.fecharModal(); } }]);
      return;
    }
    var srv = _srv(), chave = _chave();
    if (!srv || !chave) { UI.toast("Sem licença ativa — o portal do parceiro precisa dela para publicar.", "erro"); return; }
    var senha = String(raw.senha || "");
    if (!p.publicadoEm && !senha) { UI.toast("Defina uma senha para o parceiro antes da primeira publicação.", "erro"); return; }

    var empresa = { nome: (typeof Empresa !== "undefined" && Empresa.nomeDoc && Empresa.nomeDoc()) || "", contato: (typeof Empresa !== "undefined" && Empresa.dados ? (Empresa.dados().contato || "") : "") };
    var pacote = Parceiro.paraPortal(raw, r, empresa, Util.agoraISO());

    /* ⚠ AUDITORIA ANTES DE SAIR DO NAVEGADOR. O `paraPortal` é allowlist, mas
       um campo novo acrescentado sem cuidado passaria por ele. Conferir aqui
       custa nada e é a última chance: depois do POST o custo já está no
       servidor, e não volta. */
    var vaz = Parceiro.auditar(pacote, r);
    if (vaz.length) {
      UI.modal("Publicação bloqueada", '<p>O pacote levaria informação que o parceiro não pode ver:</p><ul style="margin:0 0 0 18px">'
        + vaz.map(function (x) { return "<li><code>" + esc(x.caminho) + "</code> — " + esc(x.motivo) + "</li>"; }).join("")
        + "</ul><p class=\"muted\">Nada foi enviado. Avise o suporte.</p>",
        [{ texto: "Fechar", classe: "primary", onClick: function () { UI.fecharModal(); } }]);
      return;
    }

    UI.toast("Publicando a tabela de " + p.nome + "…", "ok");
    fetch(srv + "/api/parceiro/publicar", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-licenca": chave },
      body: JSON.stringify({ user: p.login, senha: senha, trocarSenha: !!senha, ativo: p.ativo, empresa: empresa.nome, tabela: pacote })
    }).then(function (res) { return res.json(); }).then(function (j) {
      if (!j || !j.ok) { UI.toast((j && j.erro) || "Falha ao publicar a tabela do parceiro.", "erro"); return; }
      /* ⚠ RELÊ ANTES DE GRAVAR. `raw` foi lido ANTES da viagem de rede; gravá-lo
         de volta reescreveria o registro com um retrato velho — e apagaria o
         catálogo que um "Buscar os catálogos" concorrente tivesse acabado de
         trazer. Regravar só os dois campos que esta ação decide. */
      var atual = Store.obter(eid(), ENT_PARCEIRO, p.id) || raw;
      atual.publicadoEm = Util.agoraISO();
      /* a senha some do cadastro local depois de aceita: ela vive no servidor,
         com hash. Guardar em claro no navegador não protege ninguém. */
      delete atual.senha;
      Store.salvar(eid(), ENT_PARCEIRO, atual);
      UI.toast("Tabela publicada. O parceiro já entra com o login " + p.login + ".", "ok");
      App.render();
    })["catch"](function (e) {
      UI.toast("Não consegui falar com o servidor: " + (e && e.message ? e.message : e), "erro");
    });
  };

  G.carpLerCatalogos = function () {
    var srv = _srv(), chave = _chave();
    if (!srv || !chave) { UI.toast("Sem licença ativa.", "erro"); return; }
    UI.toast("Buscando os catálogos…", "ok");
    fetch(srv + "/api/parceiro/catalogos", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-licenca": chave },
      body: JSON.stringify({})
    }).then(function (res) { return res.json(); }).then(function (j) {
      if (!j || !j.ok) { UI.toast((j && j.erro) || "Falha ao buscar os catálogos.", "erro"); return; }
      var porLogin = {};
      Util.arr(j.parceiros).forEach(function (x) { if (x && x.login) porLogin[String(x.login).toLowerCase()] = Util.arr(x.catalogo); });
      var n = 0;
      K.lista(ENT_PARCEIRO).forEach(function (raw) {
        var chaveL = String(raw.login || "").toLowerCase();
        /* ⚠ PARCEIRO QUE O SERVIDOR NÃO DEVOLVEU NÃO TEM O CATÁLOGO APAGADO.
           `porLogin[x]` ausente significa "não veio nesta resposta" — pode ser
           parceiro ainda não publicado, ou uma resposta parcial. Sobrescrever
           com vazio jogaria fora o que já tínhamos lido antes. */
        if (!Object.prototype.hasOwnProperty.call(porLogin, chaveL)) return;
        raw.catalogo = porLogin[chaveL];
        raw.catalogoEm = Util.agoraISO();
        Store.salvar(eid(), ENT_PARCEIRO, raw);
        n++;
      });
      UI.toast(n ? "Catálogo de " + n + " parceiro(s) atualizado." : "Nenhum parceiro tem catálogo ainda.", "ok");
      App.render();
    })["catch"](function (e) {
      UI.toast("Não consegui falar com o servidor: " + (e && e.message ? e.message : e), "erro");
    });
  };

  G.carpVerCatalogo = function (ds) {
    var raw = Store.obter(eid(), ENT_PARCEIRO, ds.id);
    if (!raw) return;
    var cat = Util.arr(raw.catalogo);
    var corpo = cat.length
      ? '<p class="muted" style="margin:0 0 10px">O que ' + esc(raw.nome) + " cadastrou no portal dele"
        + (raw.catalogoEm ? " · lido em " + esc(Util.fmtData(raw.catalogoEm)) : "") + ". Só ele edita — aqui é leitura.</p>"
        + '<table class="tbl"><thead><tr><th>Item</th><th>Unidade</th><th class="num">Valor</th></tr></thead><tbody>'
        + cat.map(function (x) {
          return "<tr><td>" + esc(x && x.descricao) + "</td><td>" + esc((x && x.unidade) || "—")
            + '</td><td class="num">' + moeda(Util.num(x && x.valor)) + "</td></tr>";
        }).join("") + "</tbody></table>"
      : '<p class="muted">Este parceiro ainda não cadastrou nada.</p>';
    UI.modal("Catálogo de " + esc(raw.nome), corpo,
      [{ texto: "Fechar", classe: "primary", onClick: function () { UI.fecharModal(); } }]);
  };

  /* ===================================================================
   * A PROPOSTA EM PAPEL
   *
   * ⚠ O QUE ESTÁ NA TELA E O QUE VAI NO PAPEL SÃO COISAS DIFERENTES. A tela
   *   mostra a conta aberta — custo de compra, margem, lucro — porque quem
   *   olha é quem faz o preço. O documento vai para quem PAGA: ali só existe
   *   o preço de venda. Por isso o gerador é outro arquivo
   *   (js/carpproposta.js), monta a partir dos valores de VENDA, e a
   *   auditoria roda ANTES de abrir. Ver o cabeçalho de lá.
   * =================================================================== */
  function _comercialPadrao() {
    var b = paramBruto();
    return (b && b.comercialPadrao) || {};
  }

  /* O bloco de campos comerciais dentro do editor da proposta. */
  function _blocoComercial(p, fechada) {
    if (typeof global.CarpProposta === "undefined") return "";
    var dis = fechada ? " disabled" : "";
    var com = CarpProposta.comercial(p, _comercialPadrao());
    var faltas = CarpProposta.validar(p, _comercialPadrao());
    var h = '<div class="card mb"><div class="flex between"><h3 style="margin:0">Condições comerciais</h3>'
      + '<span class="muted" style="font-size:12px;align-self:center">é o que vai no papel para o cliente</span></div>';
    if (faltas.length) {
      h += '<p class="muted" style="margin:6px 0 0;color:var(--ambar,#b45309)">' + esc(faltas.join(" ")) + "</p>";
    }
    h += '<div class="mt">' + CarpProposta.CAMPOS.map(function (c) {
      var id = "cxc-" + c.id;
      var rot = c.nome + (c.obrigatorio ? " *" : "");
      return K.campo(rot, c.multi
        ? '<textarea id="' + id + '" rows="3" placeholder="' + esc(c.dica || "") + '"' + dis + ">" + esc(com[c.id]) + "</textarea>"
        : '<input id="' + id + '" value="' + esc(com[c.id]) + '" placeholder="' + esc(c.dica || "") + '"' + dis + ">");
    }).join("") + "</div>";
    if (!fechada) {
      h += '<label style="display:inline-flex;align-items:center;gap:6px;margin-top:6px">'
        + '<input type="checkbox" id="cxc-padrao"> <span class="muted">Guardar estes textos como padrão das próximas propostas</span></label>';
    }
    return h + "</div>";
  }

  function _coletarComercial(p) {
    if (typeof global.CarpProposta === "undefined" || C.estaFechada(p)) return;
    CarpProposta.CAMPOS.forEach(function (c) {
      var el = UI.el("cxc-" + c.id);
      if (el) p[c.id] = String(el.value || "").trim();
    });
    /* ⚠ guardar como padrão é escolha EXPLÍCITA. Sem a caixa, digitar uma
       condição diferente numa proposta reescreveria o padrão de todas as
       próximas sem ninguém pedir. */
    var cx = UI.el("cxc-padrao");
    if (cx && cx.checked) {
      var b = paramBruto();
      b.comercialPadrao = b.comercialPadrao || {};
      CarpProposta.CAMPOS.forEach(function (c) { b.comercialPadrao[c.id] = p[c.id] || ""; });
      Store.salvar(eid(), ENT_PARAM, b);
    }
  }

  G.carpImprimirProposta = function (ds) {
    if (typeof global.CarpProposta === "undefined") {
      UI.toast("O gerador da proposta não carregou (js/carpproposta.js).", "erro"); return;
    }
    var p = Store.obter(eid(), ENT_PROP, ds.id);
    if (!p) return;
    var cx = ctx();
    /* `coletar` já traz os campos comerciais junto — o que está digitado na
       tela e ainda não foi salvo tem que entrar no papel. */
    if (!C.estaFechada(p)) { coletar(p, C.calcular(p, cx)); Store.salvar(eid(), ENT_PROP, p); }

    var r = C.calcular(p, cx);
    var faltas = r.pendencias.concat(CarpProposta.validar(p, _comercialPadrao()));
    if (!r.completa || faltas.length) {
      /* ⚠ proposta com pendência NÃO vira papel: o documento sairia com item
         faltando ou valor errado, e papel errado na mão do cliente não volta. */
      UI.modal("Ainda não dá para gerar a proposta", '<ul style="margin:0 0 0 18px">'
        + (faltas.length ? faltas : ["Complete os itens da proposta."]).map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("")
        + "</ul>", [{ texto: "Entendi", classe: "primary", onClick: function () { UI.fecharModal(); } }]);
      return;
    }

    var cliente = p.clienteId ? Store.obter(eid(), "clientes", p.clienteId) : null;
    var obra = p.obraId ? Store.obter(eid(), "obras", p.obraId) : null;
    var temEmp = typeof Empresa !== "undefined";

    /* ⚠ O MODELO NÃO SE IMPÕE. Quem nunca abriu "Modelos de Proposta" não tem
       modelo nenhum e continua recebendo o documento de sempre — trocar o
       desenho da proposta de alguém sem que a pessoa tenha pedido é o tipo de
       surpresa que ela descobre com o cliente na frente. Havendo modelos, a
       escolha aparece, com o do cliente (ou o padrão) já marcado. */
    var modelos = [];
    try { if (typeof PropTpl !== "undefined") modelos = K.lista("prop_modelos"); } catch (eM) { modelos = []; }
    if (modelos.length) {
      var sugerido = G.propModeloPara ? G.propModeloPara(p.clienteId) : null;
      var sugId = sugerido ? sugerido.id : "";
      UI.modal("Com qual desenho?",
        '<p class="muted">O conteúdo e os preços são os mesmos; muda o layout do papel.</p>'
        + '<label style="display:flex;gap:9px;align-items:flex-start;padding:9px;border:1px solid var(--linha);border-radius:5px;margin-bottom:7px;cursor:pointer">'
        + '<input type="radio" name="cpl" value=""' + (sugId ? "" : " checked") + ' style="margin-top:3px">'
        + "<span><b>Documento padrão do sistema</b><br><span class=\"muted\" style=\"font-size:12.5px\">Capa, escopo, incluso/excluso e condições.</span></span></label>"
        + modelos.map(function (mm) {
          var m2 = PropTpl.modelo(mm);
          return '<label style="display:flex;gap:9px;align-items:flex-start;padding:9px;border:1px solid var(--linha);border-radius:5px;margin-bottom:7px;cursor:pointer">'
            + '<input type="radio" name="cpl" value="' + esc(mm.id) + '"' + (mm.id === sugId ? " checked" : "") + ' style="margin-top:3px">'
            + "<span><b>" + esc(m2.nome) + "</b>"
            + (mm.id === sugId ? ' <span class="g-pill" style="background:#16a34a22;color:#16a34a;font-weight:700;font-size:10.5px">sugerido</span>' : "")
            + "<br><span class=\"muted\" style=\"font-size:12.5px\">" + esc(m2.descricao || (m2.paginas.length + " páginas")) + "</span></span></label>";
        }).join(""),
        [
          { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
          { texto: "Gerar", classe: "primary", onClick: function () {
            var sel = document.querySelector('input[name="cpl"]:checked');
            var escolhido = sel ? sel.value : "";
            UI.fecharModal();
            if (!escolhido) { G._carpDocClassico(p, r, cliente, obra); return; }
            G._carpDocModelo(escolhido, p, r, cliente, obra);
          } }
        ]);
      return;
    }
    G._carpDocClassico(p, r, cliente, obra);
  };

  /* ---- o documento pelo MODELO ----
     ⚠ Os números vêm de `CarpProposta.blocos(r)`, que é onde a conta fecha.
       Este caminho não soma nem rateia nada: ele desenha. */
  G._carpDocModelo = function (modeloId, p, r, cliente, obra) {
    var raw = Store.obter(eid(), "prop_modelos", modeloId);
    if (!raw) { UI.toast("Modelo não encontrado.", "erro"); return; }
    var temEmp = typeof Empresa !== "undefined";
    var m = PropTpl.modelo(raw);
    G._propModImagens(m, function (imgs) {
      var dados = {
        empresa: temEmp && Empresa.dados ? Empresa.dados() : {},
        logoHTML: temEmp && Empresa.logoHTML ? Empresa.logoHTML(120) : "",
        cliente: cliente ? (cliente.nome || cliente.razaoSocial || "") : "",
        obra: obra ? (obra.nome || "") : "",
        numero: p.numero || "",
        data: hojeISO(),
        validade: C.validade(p, hojeISO(), paramBruto()),
        blocos: CarpProposta.blocos(r),
        comercial: CarpProposta.comercial(p, _comercialPadrao()),
        imagens: imgs,
        tituloDoc: "Proposta — " + (p.titulo || "")
      };
      G.propModImprimir(m, dados, function (html) { return CarpProposta.auditar(html, r); });
    });
  };

  /* ---- o documento de sempre ---- */
  G._carpDocClassico = function (p, r, cliente, obra) {
    var temEmp = typeof Empresa !== "undefined";
    var doc = CarpProposta.gerar(p, {
      resultado: r,
      empresa: temEmp && Empresa.dados ? Empresa.dados() : {},
      logoHTML: temEmp && Empresa.logoHTML ? Empresa.logoHTML(80) : "",
      marcaDagua: temEmp && Empresa.marcaDaguaTexto ? Empresa.marcaDaguaTexto() : "",
      rodape: temEmp && Empresa.nomeDoc ? Empresa.nomeDoc() : "",
      credito: temEmp && Empresa.creditoTexto ? Empresa.creditoTexto() : "",
      clienteNome: cliente ? (cliente.nome || cliente.razaoSocial || "") : "",
      obraNome: obra ? (obra.nome || "") : "",
      padrao: _comercialPadrao(),
      validade: C.validade(p, hojeISO(), paramBruto()),
      numero: p.numero || "",
      hojeISO: hojeISO()
    }, { previa: !C.estaFechada(p), detalharAcrescimos: !!p.detalharAcrescimos });

    /* ⚠ A AUDITORIA RODA ANTES DE ABRIR, e é a última chance: depois de
       impresso ou enviado, custo no papel não volta. */
    var vaz = CarpProposta.auditar(doc.html, r);
    if (vaz.length) {
      UI.modal("Proposta bloqueada", "<p>O documento levaria informação que o cliente não pode ver:</p>"
        + '<ul style="margin:0 0 0 18px">' + vaz.map(function (x) {
          return "<li>" + esc(x.tipo === "palavra" ? 'a expressão "' + x.achado + '"' : x.achado + " — " + (x.motivo || "")) + "</li>";
        }).join("") + "</ul><p class=\"muted\">Nada foi aberto. Avise o suporte.</p>",
        [{ texto: "Fechar", classe: "primary", onClick: function () { UI.fecharModal(); } }]);
      return;
    }
    G._abrirDoc("Proposta — " + (p.titulo || ""), doc.html);
  };

  /* ===================================================================
   * DA PROPOSTA FECHADA PARA O FINANCEIRO
   *
   * ⚠ POR QUE ISTO PRECISOU EXISTIR. O OrçaPRO só sabia gerar receita por
   *   dois caminhos: dar baixa numa MEDIÇÃO e devolver retenção de CONTRATO.
   *   O perfil da carpintaria esconde os dois (decisão G2 do cliente), então
   *   a proposta fechada morria aqui: o Financeiro deles recebia só despesa —
   *   folha, madeira, gasto rápido — e o Painel mostrava TODA obra dando
   *   prejuízo, porque o custo estava certo e a receita era zero. Sistema que
   *   erra a conta na cara do dono é sistema que ele para de olhar.
   *
   * ⚠ E POR QUE É UM BOTÃO, NÃO UM GATILHO. Fechar a proposta é um ato
   *   comercial: o cliente ainda pode não aceitar. Lançar receita no fechamento
   *   encheria o caixa de dinheiro que não existe. Quem sabe que a obra foi
   *   ganha é gente — então o lançamento nasce de um clique, com confirmação,
   *   e nasce `pendente` (a receber), nunca `pago`.
   *
   * ⚠ E POR QUE GUARDA O ID. Sem o vínculo de volta, clicar duas vezes lança
   *   a mesma venda duas vezes. Com ele, o segundo clique é recusado — mas se
   *   alguém APAGAR o lançamento no Financeiro, o caminho reabre, porque
   *   trancar para sempre é o outro erro (mesma regra do `fsLancamentos` da
   *   Remuneração variável).
   * =================================================================== */
  function _receitaViva(p) {
    var id = p && p.financeiroId;
    if (!id) return null;
    try { return Store.obter(eid(), "financeiro", id) || null; } catch (e) { return null; }
  }

  G.carpLancarReceita = function (ds) {
    if (G._bloqueado && G._bloqueado()) return;
    if (typeof Auth !== "undefined" && Auth.podeModulo && !Auth.podeModulo("financeiro")) {
      UI.toast("Seu usuário não tem permissão no módulo Financeiro.", "erro"); return;
    }
    var p = Store.obter(eid(), ENT_PROP, ds.id);
    if (!p) return;

    if (!C.estaFechada(p)) {
      UI.toast("Só proposta fechada vira receita — o preço precisa estar congelado.", "erro"); return;
    }
    if (!p.obraId) {
      UI.toast("Escolha a obra na proposta antes: receita sem obra não entra no custo por obra.", "erro"); return;
    }
    var r = C.calcular(p, ctx());
    if (!(Util.num(r.total) > 0)) { UI.toast("Esta proposta não tem valor para lançar.", "erro"); return; }

    var jaTem = _receitaViva(p);
    if (jaTem) {
      UI.toast("Esta proposta já foi lançada no Financeiro (" + moeda(jaTem.valor) + ") — lançar de novo contaria a mesma venda duas vezes.", "erro");
      return;
    }

    var obra = Store.obter(eid(), "obras", p.obraId);
    var cliente = p.clienteId ? Store.obter(eid(), "clientes", p.clienteId) : null;
    var hoje = hojeISO();

    UI.modal("Lançar a receita desta proposta?", ""
      + "<p>Entra no Financeiro como <b>receita a receber</b> (status <b>Pendente</b>) — não como dinheiro já na conta. "
      + "Quando o cliente pagar, é lá que se dá a baixa.</p>"
      + '<div class="card" style="margin:10px 0">'
      + "<div><b>Valor</b> " + moeda(r.total) + "</div>"
      + "<div><b>Obra</b> " + esc(obra ? obra.nome : "—") + "</div>"
      + "<div><b>Cliente</b> " + esc(cliente ? (cliente.nome || cliente.razaoSocial || "—") : "—") + "</div>"
      + "</div>"
      + '<p class="muted">Se a obra for parcelada, lance aqui o total e ajuste as parcelas no Financeiro — '
      + "as condições de pagamento da proposta são texto do documento, não viram parcelas sozinhas.</p>",
      [{ texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
       { texto: "Lançar receita", classe: "primary", onClick: function () {
         /* ⚠ grava a RECEITA primeiro e o vínculo depois: se a segunda gravação
            falhar, sobra um lançamento visível no Financeiro (que a pessoa vê e
            resolve) em vez de uma proposta marcada como lançada sem lançamento
            nenhum — o buraco caro é o inverso deste. */
         var lanc = Store.salvar(eid(), "financeiro", {
           data: hoje,
           desc: "Proposta " + (p.numero ? p.numero + " — " : "") + (p.titulo || "carpintaria"),
           tipo: "receita",
           categoria: "obra",
           valor: Util.num(r.total),
           status: "pendente",
           obraId: p.obraId,
           clienteId: p.clienteId || "",
           origem: "carp_proposta",
           origemId: p.id
         });
         if (!lanc || !lanc.id) { UI.toast("Não consegui lançar no Financeiro. Tente de novo.", "erro"); return; }
         p.financeiroId = lanc.id;
         p.financeiroEm = hoje;
         /* simetria com `fechadaPor`: quem move dinheiro fica registrado */
         p.financeiroPor = _quem();
         Store.salvar(eid(), ENT_PROP, p);
         UI.fecharModal();
         UI.toast("Receita de " + moeda(r.total) + " lançada no Financeiro, a receber.", "ok");
         App.render();
       } }]);
  };

  /* ===================================================================
   * ENGATE
   * =================================================================== */
  G.registrarAcoes("carpintaria", {
    /* ⚠ O AVISO DE CATÁLOGO VAZIO MORA DENTRO DO EDITOR, e um botão que
       promete "leva até lá" tem de LEVAR. `renderCarpintaria` começa com
       `if (this._carpProp) return this._carpEditor()`, então trocar só a aba
       redesenhava a mesma proposta — e o redesenho ainda jogava fora o
       título e a margem digitados, porque vinha do Store. `carpVoltar` é o
       caminho que coleta o que está na tela antes de sair; a ordem importa,
       porque ele chama App.render() no fim. */
    "carp-aba": function (ds) {
      G._carpAba = ds.aba || "propostas";
      if (G._carpProp) G.carpVoltar(); else App.render();
    },
    "carp-nova-madeira": function () { G.carpFormMadeira(null); },
    "carp-editar-madeira": function (ds) { G.carpFormMadeira(Store.obter(eid(), ENT_MADEIRA, ds.id)); },
    "carp-novo-mo": function () { G.carpFormMO(null); },
    "carp-editar-mo": function (ds) { G.carpFormMO(Store.obter(eid(), ENT_MO, ds.id)); },
    "carp-salvar-param": function (ds) { G.carpSalvarParam(ds); },
    "carp-nova-proposta": function () { G.carpNovaProposta(); },
    "carp-abrir-proposta": function (ds) { G.carpAbrir(ds); },
    "carp-voltar": function () { G.carpVoltar(); },
    "carp-salvar-proposta": function (ds) { G.carpSalvarProposta(ds); },
    "carp-add-madeira": function (ds) { G.carpAddMadeira(ds); },
    "carp-add-mo": function (ds) { G.carpAddMO(ds); },
    "carp-rm-madeira": function (ds) { G.carpRmMadeira(ds); },
    "carp-rm-mo": function (ds) { G.carpRmMO(ds); },
    "carp-fechar-proposta": function (ds) { G.carpFechar(ds); },
    "carp-reabrir": function (ds) { G.carpReabrir(ds); },
    "carp-refazer": function (ds) { G.carpRefazer(ds); },
    "carp-imprimir-proposta": function (ds) { G.carpImprimirProposta(ds); },
    "carp-receita": function (ds) { G.carpLancarReceita(ds); },
    /* ⚠ as ações do parceiro passam por `_temParceiro`: o botão pode existir
       na barra do módulo mesmo quando o motor não carregou, e o dispatcher é
       global — sem a guarda, o clique estouraria "Parceiro is not defined". */
    "carp-novo-parceiro": function () { if (_temParceiro()) G.carpFormParceiro(null); },
    "carp-editar-parceiro": function (ds) { if (_temParceiro()) G.carpFormParceiro(Store.obter(eid(), ENT_PARCEIRO, ds.id)); },
    "carp-publicar-parceiro": function (ds) { if (_temParceiro()) G.carpPublicarParceiro(ds); },
    "carp-ler-catalogos": function () { if (_temParceiro()) G.carpLerCatalogos(); },
    "carp-ver-catalogo": function (ds) { G.carpVerCatalogo(ds); }
  });

  /* ===================================================================
   * O QUE SÓ DÁ PARA LIGAR DEPOIS QUE O DOM EXISTE
   *
   * ⚠ TROCAR A MADEIRA TEM DE REPOPULAR O FORNECEDOR. A lista de fornecedores
   *   de cada linha é montada a partir da madeira JÁ GRAVADA nela — preco é
   *   `item × fornecedor`, então linha sem madeira não tem fornecedor nenhum
   *   para oferecer. Em linha nova isso deixava o campo do fornecedor com
   *   "— escolha —" e mais nada: quem montava a proposta escolhia a madeira,
   *   ia no fornecedor e encontrava o campo vazio. Só salvando e voltando a
   *   lista certa aparecia — e a pendência dizia "falta escolher o
   *   fornecedor", sem contar como. Item a item, proposta a proposta.
   *
   * ⚠ E POR QUE AQUI, e não com `data-gacao` no <select>: o dispatcher entrega
   *   ao handler apenas `{value}`, sem o `data-i` — ele não teria como saber
   *   QUAL linha mudou. É exatamente o caso que `registrarWire` existe para
   *   resolver.
   *
   * `change`, não `input`: re-renderizar a cada tecla fecharia o dropdown na
   * cara de quem está escolhendo. E `coletar` roda antes, senão a quantidade
   * digitada e ainda não salva se perderia no redesenho.
   * =================================================================== */
  G.registrarWire("carpintaria", function () {
    if (!G._carpProp) return;                       // só no editor de proposta
    var selects = document.querySelectorAll('[id^="cx-m-mad"]');
    if (!selects.length) return;
    Array.prototype.forEach.call(selects, function (el) {
      el.onchange = function () {
        var p = Store.obter(eid(), ENT_PROP, G._carpProp);
        if (!p) return;
        coletar(p, C.calcular(p, ctx()));           // preserva o que está digitado
        Store.salvar(eid(), ENT_PROP, p);
        App.render();
      };
    });
  });

})(typeof window !== "undefined" ? window : this);
