/* =====================================================================
 * gestao.js — Módulos de Gestão de Obras (portados do ERP RA Engenharia)
 * Obras · Clientes · Contratos · Medições · Financeiro + Painel.
 * Integra com Orçamentos: orçamento → obra → contrato → medição → financeiro.
 * Segue a arquitetura do OrçaPRO: Store (por empresa), UI.modal, data-acao.
 * ===================================================================== */
(function (global) {
  "use strict";

  // ---------- Parametrização (enums do domínio) ----------
  var P = {
    obraStatus: [["planejamento", "Planejamento"], ["andamento", "Em andamento"], ["pausada", "Pausada"], ["concluida", "Concluída"]],
    obraTipo: [["residencial", "Residencial"], ["comercial", "Comercial"], ["predial", "Predial"], ["industrial", "Industrial"], ["reforma", "Reforma"], ["infraestrutura", "Infraestrutura"]],
    obraFase: [["projeto", "Projeto"], ["fundacao", "Fundação"], ["estrutura", "Estrutura"], ["alvenaria", "Alvenaria"], ["instalacoes", "Instalações"], ["acabamento", "Acabamento"], ["entrega", "Entrega"]],
    clienteTipo: [["PF", "Pessoa Física"], ["PJ", "Pessoa Jurídica"]],
    clienteStatus: [["ativo", "Ativo"], ["prospecto", "Prospecto"], ["inativo", "Inativo"]],
    clienteOrigem: [["indicacao", "Indicação"], ["site", "Site"], ["redes", "Redes sociais"], ["anuncio", "Anúncio"], ["outro", "Outro"]],
    uf: ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"],
    contratoStatus: [["elaboracao", "Em elaboração"], ["aguardando", "Aguardando assinatura"], ["ativo", "Ativo"], ["suspenso", "Suspenso"], ["concluido", "Concluído"], ["rescindido", "Rescindido"], ["cancelado", "Cancelado"]],
    contratoTipo: [["servico", "Prestação de serviço"], ["empreitada_global", "Empreitada global"], ["empreitada_unitario", "Empreitada por preço unitário"], ["administracao", "Administração"], ["mao_obra", "Mão de obra"], ["fornecimento", "Fornecimento de material"], ["misto", "Misto"], ["subempreitada", "Subempreitada"], ["consultoria", "Consultoria"]],
    contratoRegime: [["direta", "Direta"], ["indireta", "Indireta"], ["tarefa", "Tarefa"], ["integral", "Integral"]],
    formaPgto: [["avista", "À vista"], ["entrada_final", "Entrada + final"], ["parcelado", "Parcelado"], ["medicao", "Por medição"], ["medicao_retencao", "Por medição c/ retenção"]],
    tipoGarantia: [["nenhuma", "Nenhuma"], ["caucao", "Caução"], ["fianca", "Fiança"], ["seguro", "Seguro"]],
    medicaoStatus: [["pendente", "Pendente"], ["aprovada", "Aprovada"], ["paga", "Paga"]],
    finTipo: [["receita", "Receita"], ["despesa", "Despesa"]],
    finCategoria: [["obra", "Obra"], ["material", "Material"], ["mao_obra", "Mão de obra"], ["equipamento", "Equipamento"], ["administrativo", "Administrativo"], ["impostos", "Impostos"], ["medicao", "Medição"], ["outros", "Outros"]],
    finStatus: [["pago", "Pago / Recebido"], ["pendente", "Pendente"]]
  };
  var CORStatus = {
    planejamento: "#64748b", andamento: "#2e6f9e", pausada: "#f59e0b", concluida: "#16a34a",
    ativo: "#16a34a", prospecto: "#2e6f9e", inativo: "#94a3b8",
    elaboracao: "#64748b", aguardando: "#f59e0b", suspenso: "#f59e0b", concluido: "#16a34a", rescindido: "#dc2626", cancelado: "#94a3b8",
    pendente: "#f59e0b", aprovada: "#2e6f9e", paga: "#16a34a", pago: "#16a34a", receita: "#16a34a", despesa: "#dc2626"
  };

  function rot(lista, v) { for (var i = 0; i < lista.length; i++) if (lista[i][0] === v) return lista[i][1]; return v || "—"; }
  function opts(lista, sel) { return lista.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === sel ? " selected" : "") + '>' + o[1] + "</option>"; }).join(""); }
  function optsUf(sel) { return '<option value="">—</option>' + P.uf.map(function (u) { return "<option" + (u === sel ? " selected" : "") + ">" + u + "</option>"; }).join(""); }
  function optsRec(lista, campo, sel, vazio) { return '<option value="">' + (vazio || "—") + "</option>" + Util.arr(lista).map(function (r) { return '<option value="' + r.id + '"' + (r.id === sel ? " selected" : "") + ">" + Util.esc(r[campo] || r.nome || r.numero || r.id) + "</option>"; }).join(""); }
  function pill(status) { var c = CORStatus[status] || "#64748b"; return '<span class="g-pill" style="background:' + c + '22;color:' + c + '">' + Util.esc(rot(P.obraStatus.concat(P.clienteStatus, P.contratoStatus, P.medicaoStatus, P.finStatus), status)) + "</span>"; }
  function v(id) { var e = UI.el(id); return e ? e.value.trim() : ""; }
  function nv(id) { return Util.num(v(id)); }
  function campo(label, inner) { return '<div class="field"><label>' + label + "</label>" + inner + "</div>"; }
  function inp(id, val, ph, tipo) { return '<input id="' + id + '"' + (tipo ? ' type="' + tipo + '"' : "") + ' value="' + Util.esc(val == null ? "" : val) + '" placeholder="' + (ph || "") + '">'; }
  function sel(id, o) { return '<select id="' + id + '">' + o + "</select>"; }
  function eid() { return Auth.empresaId(); }
  function lista(ent) { return Store.listar(eid(), ent); }
  function vazioBox(txt, gacao, btn) { return '<div class="vazio card"><h3>' + txt + "</h3>" + (gacao ? '<button class="btn primary mt" data-gacao="' + gacao + '">+ ' + btn + "</button>" : "") + "</div>"; }

  var Gestao = {
    P: P, rot: rot,
    modulos: [
      { id: "dashboard", nome: "Painel", ic: "📊" },
      { id: "orcamentos", nome: "Orçamentos", ic: "🧮" },
      { id: "obras", nome: "Obras", ic: "🏗️" },
      { id: "clientes", nome: "Clientes", ic: "👥" },
      { id: "contratos", nome: "Contratos", ic: "📄" },
      { id: "medicoes", nome: "Medições", ic: "📐" },
      { id: "financeiro", nome: "Financeiro", ic: "💰" }
    ],

    // ---------- Sidebar (nav de módulos) ----------
    renderSidebar: function (viewAtiva) {
      var itens = this.modulos.map(function (m) {
        return '<button class="sb-item' + (m.id === viewAtiva ? " on" : "") + '" data-view="' + m.id + '"><span class="sb-ic">' + m.ic + "</span><span>" + m.nome + "</span></button>";
      }).join("");
      return '<div class="sb-top"><svg width="34" height="34" viewBox="0 0 100 100"><defs><linearGradient id="sbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#163a5c"/><stop offset="1" stop-color="#2e6f9e"/></linearGradient></defs><rect x="2" y="2" width="96" height="96" rx="24" fill="url(#sbg)"/><rect x="24" y="52" width="13" height="22" rx="4" fill="#fff" opacity=".55"/><rect x="44" y="38" width="13" height="36" rx="4" fill="#fff" opacity=".9"/><rect x="64" y="24" width="13" height="50" rx="4" fill="#6fd08a"/></svg></div>' +
        '<div class="sb-lbl">Módulos</div><nav class="sb-nav">' + itens + "</nav>";
    },

    // ---------- Dispatcher de view ----------
    render: function (view) {
      switch (view) {
        case "dashboard": return this.renderDashboard();
        case "obras": return this.renderObras();
        case "clientes": return this.renderClientes();
        case "contratos": return this.renderContratos();
        case "medicoes": return this.renderMedicoes();
        case "financeiro": return this.renderFinanceiro();
      }
      return "";
    },

    // header padrão de cada módulo
    _head: function (titulo, gacao, btn, extra) {
      return '<div class="flex between mb"><h1 style="margin:0">' + titulo + "</h1><div class=\"flex\">" + (extra || "") +
        (gacao ? '<button class="btn primary" data-gacao="' + gacao + '">+ ' + btn + "</button>" : "") + "</div></div>";
    },

    // =================== PAINEL / DASHBOARD ===================
    renderDashboard: function () {
      var obras = lista("obras"), clientes = lista("clientes"), contratos = lista("contratos"), med = lista("medicoes"), fin = lista("financeiro"), orc = Store.listarOrcamentos(eid());
      var emAndamento = obras.filter(function (o) { return o.status === "andamento"; }).length;
      var valorContratado = contratos.reduce(function (s, c) { return s + Util.num(c.valor); }, 0);
      var receitas = fin.filter(function (f) { return f.tipo === "receita"; }).reduce(function (s, f) { return s + Util.num(f.valor); }, 0);
      var despesas = fin.filter(function (f) { return f.tipo === "despesa"; }).reduce(function (s, f) { return s + Util.num(f.valor); }, 0);
      var aReceber = fin.filter(function (f) { return f.tipo === "receita" && f.status === "pendente"; }).reduce(function (s, f) { return s + Util.num(f.valor); }, 0);
      var medPend = med.filter(function (m) { return m.status !== "paga"; }).length;
      function k(rot, num, cls) { return '<div class="kpi ' + (cls || "") + '"><div class="rotulo">' + rot + '</div><div class="num">' + num + "</div></div>"; }
      var html = '<h1 class="mb">Painel de Gestão</h1>' +
        '<div class="kpis kpis-g">' +
          k("🏗️ Obras em andamento", emAndamento + " / " + obras.length) +
          k("📄 Valor contratado", Util.fmtMoeda(valorContratado), "custo") +
          k("💰 Recebido", Util.fmtMoeda(receitas), "destaque") +
          k("⏳ A receber", Util.fmtMoeda(aReceber)) +
          k("📉 Despesas", Util.fmtMoeda(despesas)) +
          k("📐 Medições pendentes", medPend) +
        "</div>";
      // resumo por obra (orçado x contratado x custo real)
      html += '<div class="card mt"><h3 style="margin:0 0 10px">Resumo por obra</h3>';
      if (!obras.length) html += '<p class="muted">Nenhuma obra ainda. Crie a primeira em <b>🏗️ Obras</b> (ou gere a partir de um orçamento).</p>';
      else {
        html += '<table class="tbl"><thead><tr><th>Obra</th><th>Status</th><th class="num">Contratado</th><th class="num">Custo real</th><th class="num">Recebido</th><th class="num">Margem</th></tr></thead><tbody>';
        obras.forEach(function (o) {
          var ctr = contratos.filter(function (c) { return c.obraId === o.id; }).reduce(function (s, c) { return s + Util.num(c.valor); }, 0);
          var custo = fin.filter(function (f) { return f.obraId === o.id && f.tipo === "despesa"; }).reduce(function (s, f) { return s + Util.num(f.valor); }, 0);
          var rec = fin.filter(function (f) { return f.obraId === o.id && f.tipo === "receita"; }).reduce(function (s, f) { return s + Util.num(f.valor); }, 0);
          var base = ctr || Util.num(o.valor);
          var margem = base > 0 ? ((base - custo) / base * 100) : 0;
          html += "<tr><td><b>" + Util.esc(o.nome) + "</b></td><td>" + pill(o.status) + '</td><td class="num">' + Util.fmtMoeda(base) + '</td><td class="num">' + Util.fmtMoeda(custo) + '</td><td class="num">' + Util.fmtMoeda(rec) + '</td><td class="num" style="color:' + (margem >= 0 ? "var(--verde)" : "var(--vermelho)") + '">' + Util.fmtPct(margem, 1) + "</td></tr>";
        });
        html += "</tbody></table>";
      }
      html += "</div>";
      return html;
    },

    // =================== OBRAS ===================
    renderObras: function () {
      var obras = lista("obras"), clientes = lista("clientes");
      var html = this._head("🏗️ Obras", "nova-obra", "Nova obra");
      if (!obras.length) return html + vazioBox("Nenhuma obra cadastrada", "nova-obra", "Criar primeira obra");
      html += '<div class="grid-cards">';
      obras.forEach(function (o) {
        var cli = clientes.filter(function (c) { return c.id === o.clienteId; })[0];
        html += '<div class="card orc-card" data-gopen="obras:' + o.id + '">' +
          '<div class="flex between"><h3>' + Util.esc(o.nome) + "</h3>" + pill(o.status) + "</div>" +
          '<div class="meta">' + (cli ? "👤 " + Util.esc(cli.nome) + " · " : "") + (o.tipo ? rot(P.obraTipo, o.tipo) : "") + (o.local ? " · 📍 " + Util.esc(o.local) : "") + "</div>" +
          '<div class="valor">' + Util.fmtMoeda(o.valor) + "</div></div>";
      });
      return html + "</div>";
    },
    novoObra: function () { this.formObra(null); },
    formObra: function (o) {
      o = o || {}; var clientes = lista("clientes"), orcs = Store.listarOrcamentos(eid());
      var corpo =
        '<div class="row">' + campo("Nome da obra *", inp("g-nome", o.nome, "Ex.: Residência Silva")) + campo("Cliente", sel("g-cliente", optsRec(clientes, "nome", o.clienteId, "— nenhum —"))) + "</div>" +
        '<div class="row">' + campo("Tipo", sel("g-tipo", '<option value="">—</option>' + opts(P.obraTipo, o.tipo))) + campo("Fase atual", sel("g-fase", '<option value="">—</option>' + opts(P.obraFase, o.fase))) + "</div>" +
        '<div class="row">' + campo("Status", sel("g-status", opts(P.obraStatus, o.status || "planejamento"))) + campo("Valor do contrato (R$)", inp("g-valor", o.valor)) + "</div>" +
        campo("Local / Endereço", inp("g-local", o.local, "Rua, nº, bairro, cidade")) +
        '<div class="row">' + campo("Início", inp("g-inicio", o.inicio, "", "date")) + campo("Previsão de término", inp("g-termino", o.termino, "", "date")) + "</div>" +
        '<div class="row">' + campo("Área construída (m²)", inp("g-areac", o.areaConstruida)) + campo("Área do terreno (m²)", inp("g-areat", o.areaTerreno)) + "</div>" +
        campo("Vincular a um orçamento", sel("g-orc", optsRec(orcs, "nome", o.orcamentoId, "— nenhum —"))) +
        campo("Observações", '<textarea id="g-obs" rows="2">' + Util.esc(o.obs || "") + "</textarea>");
      this._modalForm("obras", o, "Obra", corpo, function (obj) {
        obj.nome = v("g-nome"); if (!obj.nome) { UI.toast("Informe o nome da obra.", "erro"); return false; }
        obj.clienteId = v("g-cliente"); obj.tipo = v("g-tipo"); obj.fase = v("g-fase"); obj.status = v("g-status");
        obj.valor = nv("g-valor"); obj.local = v("g-local"); obj.inicio = v("g-inicio"); obj.termino = v("g-termino");
        obj.areaConstruida = nv("g-areac"); obj.areaTerreno = nv("g-areat"); obj.orcamentoId = v("g-orc"); obj.obs = v("g-obs");
        var cli = lista("clientes").filter(function (c) { return c.id === obj.clienteId; })[0];
        obj.clienteNome = cli ? cli.nome : "";
        return true;
      });
    },

    // =================== CLIENTES ===================
    renderClientes: function () {
      var cs = lista("clientes");
      var html = this._head("👥 Clientes", "nova-cliente", "Novo cliente");
      if (!cs.length) return html + vazioBox("Nenhum cliente cadastrado", "nova-cliente", "Cadastrar primeiro cliente");
      html += '<table class="tbl"><thead><tr><th>Nome</th><th>Tipo</th><th>CPF/CNPJ</th><th>Telefone</th><th>Cidade</th><th>Status</th></tr></thead><tbody>';
      cs.forEach(function (c) {
        html += '<tr class="lin" style="cursor:pointer" data-gopen="clientes:' + c.id + '"><td><b>' + Util.esc(c.nome) + "</b></td><td>" + rot(P.clienteTipo, c.tipo) + "</td><td>" + Util.esc(c.doc || "—") + "</td><td>" + Util.esc(c.telefone || "—") + "</td><td>" + Util.esc(c.cidade || "—") + (c.uf ? "/" + Util.esc(c.uf) : "") + "</td><td>" + pill(c.status) + "</td></tr>";
      });
      return html + "</tbody></table>";
    },
    novoCliente: function () { this.formCliente(null); },
    formCliente: function (c) {
      c = c || {};
      var corpo =
        '<div class="row">' + campo("Nome / Razão social *", inp("g-nome", c.nome)) + campo("Tipo", sel("g-tipo", opts(P.clienteTipo, c.tipo || "PF"))) + "</div>" +
        '<div class="row">' + campo("CPF / CNPJ", inp("g-doc", c.doc)) + campo("RG / Inscr. Estadual", inp("g-ie", c.ie || c.rg)) + "</div>" +
        '<div class="row">' + campo("Telefone *", inp("g-tel", c.telefone, "(34) 90000-0000")) + campo("E-mail", inp("g-email", c.email, "", "email")) + "</div>" +
        campo("Endereço", inp("g-end", c.endereco)) +
        '<div class="row"><div class="field" style="flex:2"><label>Cidade</label>' + inp("g-cidade", c.cidade) + "</div>" + campo("UF", sel("g-uf", optsUf(c.uf))) + campo("CEP", inp("g-cep", c.cep)) + "</div>" +
        '<div class="row">' + campo("Status", sel("g-status", opts(P.clienteStatus, c.status || "ativo"))) + campo("Origem", sel("g-origem", '<option value="">—</option>' + opts(P.clienteOrigem, c.origem))) + "</div>" +
        campo("Observações", '<textarea id="g-obs" rows="2">' + Util.esc(c.obs || "") + "</textarea>");
      this._modalForm("clientes", c, "Cliente", corpo, function (obj) {
        obj.nome = v("g-nome"); if (!obj.nome) { UI.toast("Informe o nome do cliente.", "erro"); return false; }
        obj.tipo = v("g-tipo"); obj.doc = v("g-doc"); obj.ie = v("g-ie"); obj.telefone = v("g-tel"); obj.email = v("g-email");
        obj.endereco = v("g-end"); obj.cidade = v("g-cidade"); obj.uf = v("g-uf"); obj.cep = v("g-cep");
        obj.status = v("g-status"); obj.origem = v("g-origem"); obj.obs = v("g-obs");
        return true;
      });
    },

    // =================== CONTRATOS ===================
    renderContratos: function () {
      var cs = lista("contratos"), obras = lista("obras"), clientes = lista("clientes");
      var html = this._head("📄 Contratos", "novo-contrato", "Novo contrato");
      if (!cs.length) return html + vazioBox("Nenhum contrato cadastrado", "novo-contrato", "Criar primeiro contrato");
      html += '<table class="tbl"><thead><tr><th>Nº</th><th>Cliente</th><th>Obra</th><th>Tipo</th><th class="num">Valor</th><th>Status</th></tr></thead><tbody>';
      cs.forEach(function (c) {
        var ob = obras.filter(function (o) { return o.id === c.obraId; })[0];
        html += '<tr class="lin" style="cursor:pointer" data-gopen="contratos:' + c.id + '"><td><b>' + Util.esc(c.numero || "—") + "</b></td><td>" + Util.esc(c.clienteNome || "—") + "</td><td>" + Util.esc(ob ? ob.nome : "—") + "</td><td>" + rot(P.contratoTipo, c.tipo) + '</td><td class="num">' + Util.fmtMoeda(c.valor) + "</td><td>" + pill(c.status) + "</td></tr>";
      });
      return html + "</tbody></table>";
    },
    novoContrato: function () { this.formContrato(null); },
    formContrato: function (c) {
      c = c || {}; var obras = lista("obras"), clientes = lista("clientes"), orcs = Store.listarOrcamentos(eid());
      var num = c.numero || ("CT-" + new Date().getFullYear() + "-" + String(lista("contratos").length + 1).padStart(3, "0"));
      var corpo =
        '<div class="row">' + campo("Número", inp("g-num", num)) + campo("Status", sel("g-status", opts(P.contratoStatus, c.status || "elaboracao"))) + "</div>" +
        '<div class="row">' + campo("Cliente", sel("g-cliente", optsRec(clientes, "nome", c.clienteId, "— selecionar —"))) + campo("Obra", sel("g-obra", optsRec(obras, "nome", c.obraId, "— selecionar —"))) + "</div>" +
        '<div class="row">' + campo("Tipo de contrato", sel("g-tipo", opts(P.contratoTipo, c.tipo || "empreitada_global"))) + campo("Regime", sel("g-regime", opts(P.contratoRegime, c.regime || "direta"))) + "</div>" +
        '<div class="row">' + campo("Valor total (R$)", inp("g-valor", c.valor)) + campo("Forma de pagamento", sel("g-forma", opts(P.formaPgto, c.formaPgto || "medicao"))) + "</div>" +
        '<div class="row">' + campo("Assinatura", inp("g-assin", c.dataAssinatura, "", "date")) + campo("Início", inp("g-inicio", c.inicio, "", "date")) + campo("Término", inp("g-termino", c.termino, "", "date")) + "</div>" +
        campo("Vincular a um orçamento", sel("g-orc", optsRec(orcs, "nome", c.orcamentoId, "— nenhum —"))) +
        campo("Objeto / Descrição do escopo", '<textarea id="g-desc" rows="2">' + Util.esc(c.descricao || "") + "</textarea>") +
        '<h3 style="margin:12px 0 4px;color:var(--aco)">Responsável técnico & garantias</h3>' +
        '<div class="row">' + campo("Responsável técnico", inp("g-rt", c.rtContratada)) + campo("CREA/CAU", inp("g-crea", c.creaContratada)) + campo("ART/RRT", inp("g-art", c.artContratada)) + "</div>" +
        '<div class="row">' + campo("Garantia dos serviços (meses)", inp("g-gserv", c.garantiaServicos == null ? 60 : c.garantiaServicos)) + campo("Tipo de garantia", sel("g-tgar", opts(P.tipoGarantia, c.tipoGarantia || "nenhuma"))) + campo("Multa por atraso (%/dia)", inp("g-multa", c.multaAtraso == null ? 0.1 : c.multaAtraso)) + "</div>" +
        campo("Cláusulas especiais", '<textarea id="g-clausulas" rows="2">' + Util.esc(c.clausulasEspeciais || "") + "</textarea>");
      this._modalForm("contratos", c, "Contrato", corpo, function (obj) {
        obj.numero = v("g-num"); obj.status = v("g-status"); obj.clienteId = v("g-cliente"); obj.obraId = v("g-obra");
        obj.tipo = v("g-tipo"); obj.regime = v("g-regime"); obj.valor = nv("g-valor"); obj.formaPgto = v("g-forma");
        obj.dataAssinatura = v("g-assin"); obj.inicio = v("g-inicio"); obj.termino = v("g-termino"); obj.orcamentoId = v("g-orc");
        obj.descricao = v("g-desc"); obj.rtContratada = v("g-rt"); obj.creaContratada = v("g-crea"); obj.artContratada = v("g-art");
        obj.garantiaServicos = nv("g-gserv"); obj.tipoGarantia = v("g-tgar"); obj.multaAtraso = nv("g-multa"); obj.clausulasEspeciais = v("g-clausulas");
        var cli = obras && lista("clientes").filter(function (x) { return x.id === obj.clienteId; })[0];
        obj.clienteNome = cli ? cli.nome : "";
        return true;
      });
    },

    // =================== MEDIÇÕES ===================
    renderMedicoes: function () {
      var ms = lista("medicoes"), obras = lista("obras"), contratos = lista("contratos");
      var html = this._head("📐 Medições", "nova-medicao", "Nova medição");
      if (!ms.length) return html + vazioBox("Nenhuma medição registrada", "nova-medicao", "Registrar primeira medição");
      html += '<table class="tbl"><thead><tr><th>Nº</th><th>Obra</th><th>Período</th><th class="num">%</th><th class="num">Valor</th><th>Status</th><th></th></tr></thead><tbody>';
      ms.forEach(function (m) {
        var ob = obras.filter(function (o) { return o.id === m.obraId; })[0];
        var acao = m.status === "pendente" ? '<button class="btn sm success" data-gacao="aprovar-medicao" data-id="' + m.id + '">Aprovar</button>' : (m.status === "aprovada" ? '<button class="btn sm primary" data-gacao="pagar-medicao" data-id="' + m.id + '">Registrar pgto</button>' : "✓");
        html += '<tr><td style="cursor:pointer" data-gopen="medicoes:' + m.id + '"><b>' + Util.esc(m.numero || "—") + "</b></td><td>" + Util.esc(ob ? ob.nome : "—") + "</td><td>" + Util.esc((m.periodoInicio || "") + (m.periodoFim ? " a " + m.periodoFim : "")) + '</td><td class="num">' + Util.fmtPct(m.percentual, 1) + '</td><td class="num">' + Util.fmtMoeda(m.valor) + "</td><td>" + pill(m.status) + '</td><td class="num">' + acao + "</td></tr>";
      });
      return html + "</tbody></table>";
    },
    novoMedicao: function () { this.formMedicao(null); },
    formMedicao: function (m) {
      m = m || {}; var obras = lista("obras"), contratos = lista("contratos");
      var num = m.numero || String(lista("medicoes").length + 1).padStart(2, "0") + "ª";
      var corpo =
        '<div class="row">' + campo("Nº da medição", inp("g-num", num)) + campo("Status", sel("g-status", opts(P.medicaoStatus, m.status || "pendente"))) + "</div>" +
        '<div class="row">' + campo("Obra *", sel("g-obra", optsRec(obras, "nome", m.obraId, "— selecionar —"))) + campo("Contrato", sel("g-contrato", optsRec(contratos, "numero", m.contratoId, "— nenhum —"))) + "</div>" +
        '<div class="row">' + campo("Período (início)", inp("g-pini", m.periodoInicio, "", "date")) + campo("Período (fim)", inp("g-pfim", m.periodoFim, "", "date")) + "</div>" +
        '<div class="row">' + campo("% executado no período", inp("g-pct", m.percentual)) + campo("Valor medido (R$) *", inp("g-valor", m.valor)) + campo("Retenção (%)", inp("g-ret", m.retencao == null ? 5 : m.retencao)) + "</div>" +
        campo("Descrição dos serviços medidos", '<textarea id="g-desc" rows="2">' + Util.esc(m.descricao || "") + "</textarea>");
      this._modalForm("medicoes", m, "Medição", corpo, function (obj) {
        obj.numero = v("g-num"); obj.status = v("g-status"); obj.obraId = v("g-obra");
        if (!obj.obraId) { UI.toast("Selecione a obra da medição.", "erro"); return false; }
        obj.contratoId = v("g-contrato"); obj.periodoInicio = v("g-pini"); obj.periodoFim = v("g-pfim");
        obj.percentual = nv("g-pct"); obj.valor = nv("g-valor"); obj.retencao = nv("g-ret"); obj.descricao = v("g-desc");
        return true;
      });
    },

    // =================== FINANCEIRO ===================
    renderFinanceiro: function () {
      var fs = lista("financeiro").slice().sort(function (a, b) { return (b.data || "").localeCompare(a.data || ""); });
      var obras = lista("obras");
      var rec = fs.filter(function (f) { return f.tipo === "receita"; }).reduce(function (s, f) { return s + Util.num(f.valor); }, 0);
      var desp = fs.filter(function (f) { return f.tipo === "despesa"; }).reduce(function (s, f) { return s + Util.num(f.valor); }, 0);
      var extra = '<span class="muted" style="margin-right:12px;align-self:center">Saldo: <b style="color:' + (rec - desp >= 0 ? "var(--verde)" : "var(--vermelho)") + '">' + Util.fmtMoeda(rec - desp) + "</b></span>";
      var html = this._head("💰 Financeiro", "novo-lancamento", "Novo lançamento", extra);
      if (!fs.length) return html + vazioBox("Nenhum lançamento financeiro", "novo-lancamento", "Registrar lançamento");
      html += '<table class="tbl"><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Obra</th><th class="num">Valor</th><th>Status</th></tr></thead><tbody>';
      fs.forEach(function (f) {
        var ob = obras.filter(function (o) { return o.id === f.obraId; })[0];
        var cor = f.tipo === "receita" ? "var(--verde)" : "var(--vermelho)";
        html += '<tr class="lin" style="cursor:pointer" data-gopen="financeiro:' + f.id + '"><td>' + Util.esc(f.data ? f.data.split("-").reverse().join("/") : "—") + "</td><td><b>" + Util.esc(f.desc) + "</b></td><td>" + rot(P.finCategoria, f.categoria) + "</td><td>" + Util.esc(ob ? ob.nome : "—") + '</td><td class="num" style="color:' + cor + '">' + (f.tipo === "despesa" ? "− " : "+ ") + Util.fmtMoeda(f.valor) + "</td><td>" + pill(f.status) + "</td></tr>";
      });
      return html + "</tbody></table>";
    },
    novoLancamento: function () { this.formFinanceiro(null); },
    formFinanceiro: function (f) {
      f = f || {}; var obras = lista("obras"), contratos = lista("contratos");
      var hoje = new Date().toISOString().slice(0, 10);
      var corpo =
        '<div class="row">' + campo("Data", inp("g-data", f.data || hoje, "", "date")) + campo("Tipo", sel("g-tipo", opts(P.finTipo, f.tipo || "despesa"))) + "</div>" +
        campo("Descrição *", inp("g-desc", f.desc)) +
        '<div class="row">' + campo("Categoria", sel("g-cat", opts(P.finCategoria, f.categoria || "material"))) + campo("Valor (R$) *", inp("g-valor", f.valor)) + campo("Status", sel("g-status", opts(P.finStatus, f.status || "pago"))) + "</div>" +
        '<div class="row">' + campo("Obra", sel("g-obra", optsRec(obras, "nome", f.obraId, "— nenhuma —"))) + campo("Contrato", sel("g-contrato", optsRec(contratos, "numero", f.contratoId, "— nenhum —"))) + "</div>" +
        '<div class="row">' + campo("Fornecedor / Cliente", inp("g-forn", f.fornecedor)) + campo("Forma de pagamento", sel("g-forma", '<option value="">—</option>' + opts(P.formaPgto, f.formaPgto))) + "</div>" +
        campo("Observações", '<textarea id="g-obs" rows="2">' + Util.esc(f.obs || "") + "</textarea>");
      this._modalForm("financeiro", f, "Lançamento", corpo, function (obj) {
        obj.desc = v("g-desc"); if (!obj.desc) { UI.toast("Informe a descrição.", "erro"); return false; }
        obj.data = v("g-data"); obj.tipo = v("g-tipo"); obj.categoria = v("g-cat"); obj.valor = nv("g-valor"); obj.status = v("g-status");
        obj.obraId = v("g-obra"); obj.contratoId = v("g-contrato"); obj.fornecedor = v("g-forn"); obj.formaPgto = v("g-forma"); obj.obs = v("g-obs");
        return true;
      });
    },

    // ---------- Modal genérico de formulário (salvar/excluir) ----------
    _modalForm: function (entidade, registro, titulo, corpo, coletar) {
      var self = this, ehNovo = !registro.id;
      var botoes = [{ texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } }];
      if (!ehNovo) botoes.push({ texto: "🗑 Excluir", classe: "danger", onClick: function () {
        if (confirm("Excluir este registro? Não pode ser desfeito.")) { Store.excluir(eid(), entidade, registro.id); UI.fecharModal(); App.render(); UI.toast(titulo + " excluído.", "ok"); }
      } });
      botoes.push({ texto: ehNovo ? "Salvar" : "Salvar alterações", classe: "primary", onClick: function () {
        var obj = Util.clone(registro);
        if (coletar(obj) === false) return;
        Store.salvar(eid(), entidade, obj);
        UI.fecharModal(); App.render(); UI.toast(titulo + (ehNovo ? " criado." : " salvo."), "ok");
      } });
      UI.modal((ehNovo ? "Novo " : "Editar ") + titulo, corpo, botoes);
    },

    // ---------- Integração: criar obra a partir de um orçamento ----------
    obraDeOrcamento: function (orc) {
      var t = Orcamento.totais(orc);
      var o = { nome: orc.nome || "Obra do orçamento", status: "planejamento", valor: t.precoVenda, orcamentoId: orc.id,
        clienteNome: (orc.cliente && orc.cliente.nome) || "", local: (orc.obra && orc.obra.nome) || "" };
      // tenta casar o cliente pelo nome
      var cli = lista("clientes").filter(function (c) { return c.nome && orc.cliente && c.nome.toLowerCase() === (orc.cliente.nome || "").toLowerCase(); })[0];
      if (cli) o.clienteId = cli.id;
      this.formObra(o);
    },

    // ---------- Dispatcher de ações (chamado pelo app.js) ----------
    acao: function (gacao, dataset, app) {
      var id = dataset.id;
      switch (gacao) {
        case "nova-obra": return this.novoObra();
        case "nova-cliente": return this.novoCliente();
        case "novo-contrato": return this.novoContrato();
        case "nova-medicao": return this.novoMedicao();
        case "novo-lancamento": return this.novoLancamento();
        case "aprovar-medicao": {
          var m = Store.obter(eid(), "medicoes", id); if (!m) return;
          m.status = "aprovada"; Store.salvar(eid(), "medicoes", m); App.render(); UI.toast("Medição aprovada.", "ok"); return;
        }
        case "pagar-medicao": {
          var md = Store.obter(eid(), "medicoes", id); if (!md) return;
          md.status = "paga"; md.dataPgto = new Date().toISOString().slice(0, 10); Store.salvar(eid(), "medicoes", md);
          // gera receita no financeiro (líquido de retenção)
          var liq = Util.num(md.valor) * (1 - Util.num(md.retencao) / 100);
          Store.salvar(eid(), "financeiro", { data: md.dataPgto, desc: "Recebimento medição " + (md.numero || ""), tipo: "receita", categoria: "medicao", valor: liq, status: "pago", obraId: md.obraId, contratoId: md.contratoId });
          App.render(); UI.toast("Medição paga e receita lançada no Financeiro.", "ok"); return;
        }
      }
    },
    abrir: function (entidade, id) {
      var r = Store.obter(eid(), entidade, id); if (!r) return;
      if (entidade === "obras") return this.formObra(r);
      if (entidade === "clientes") return this.formCliente(r);
      if (entidade === "contratos") return this.formContrato(r);
      if (entidade === "medicoes") return this.formMedicao(r);
      if (entidade === "financeiro") return this.formFinanceiro(r);
    }
  };

  global.Gestao = Gestao;
})(window);
