/* =====================================================================
 * gestao.js — Módulos de Gestão de Obras (portados do ERP RA Engenharia)
 * Obras · Clientes · Contratos · Medições · Financeiro + Painel.
 * Integra com Orçamentos: orçamento → obra → contrato → medição → financeiro.
 * Segue a arquitetura do OrçaPRO: Store (por empresa), UI.modal, data-acao.
 * ===================================================================== */
(function (global) {
  "use strict";

  // ---------- Fotos dos RDOs (Portal do Cliente) ----------
  var RDO_MAX_FOTOS = 6;            // teto de fotos por diário
  var RDO_FOTO_MAXW = 1024;         // px no lado maior (reencode)
  var RDO_FOTO_Q = 0.6;             // qualidade JPEG
  var SNAP_MAX_BYTES = 8 * 1024 * 1024; // teto do snapshot serializado (< 10MB da rota + 12MB do body)

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
    finStatus: [["pago", "Pago / Recebido"], ["pendente", "Pendente"]],
    fornCategoria: [["material", "Material"], ["servico", "Serviço"], ["equipamento", "Equipamento"], ["mao_obra", "Mão de obra"], ["transporte", "Transporte"], ["locacao", "Locação"], ["outros", "Outros"]],
    fornStatus: [["ativo", "Ativo"], ["homologado", "Homologado"], ["inativo", "Inativo"]],
    compraStatus: [["cotacao", "Em cotação"], ["aprovado", "Aprovado"], ["recebido", "Recebido"], ["cancelado", "Cancelado"]],
    estoqueCategoria: [["cimento", "Cimento/Argamassa"], ["aco", "Aço/Ferragem"], ["agregados", "Agregados"], ["hidraulica", "Hidráulica"], ["eletrica", "Elétrica"], ["madeira", "Madeira/Forma"], ["acabamento", "Acabamento"], ["epi", "EPI/Ferramentas"], ["outros", "Outros"]],
    movTipo: [["entrada", "Entrada"], ["saida", "Saída"]],
    rdoClima: [["ensolarado", "Ensolarado"], ["nublado", "Nublado"], ["chuvoso", "Chuvoso"], ["chuva_forte", "Chuva forte"]],
    rdoCondicao: [["praticavel", "Praticável"], ["parcial", "Parcialmente praticável"], ["impraticavel", "Impraticável"]],
    rdoStatus: [["rascunho", "Rascunho"], ["finalizado", "Finalizado"]],
    tipoContrato: [["clt", "CLT"], ["diarista", "Diarista"], ["empreiteiro", "Empreiteiro"], ["terceiro", "Terceirizado"], ["pj", "PJ"], ["autonomo", "Autônomo"]],
    unidadeRem: [["mensal", "Mensal"], ["diaria", "Diária"], ["hora", "Hora"]],
    colabStatus: [["ativo", "Ativo"], ["afastado", "Afastado"], ["desligado", "Desligado"]],
    pontoStatus: [["aberto", "Aberto"], ["lancado", "Lançado"]],
    frotaTipo: [["veiculo", "Veículo"], ["caminhao", "Caminhão"], ["maquina", "Máquina pesada"], ["equipamento", "Equipamento"], ["ferramenta", "Ferramenta"]],
    frotaPosse: [["proprio", "Próprio"], ["alugado", "Alugado/Locado"]],
    frotaStatus: [["disponivel", "Disponível"], ["em_uso", "Em uso"], ["manutencao", "Em manutenção"], ["inativo", "Inativo"]],
    frotaCusto: [["combustivel", "Combustível"], ["manutencao", "Manutenção"], ["seguro", "Seguro"], ["locacao", "Locação"], ["pneus", "Pneus"], ["outros", "Outros"]],
    reqPrioridade: [["baixa","Baixa"],["normal","Normal"],["alta","Alta"],["urgente","Urgente"]],
      reqStatus: [["aberta","Aberta"],["cotando","Cotando"],["aprovada","Aprovada"],["comprada","Comprada"],["cancelada","Cancelada"]],
      reqUnidade: [["un","un"],["m","m"],["m2","m²"],["m3","m³"],["kg","kg"],["sc","saco"],["cx","caixa"],["pc","peça"],["l","litro"]],
    fiscalTipo: [["entrada", "Entrada"], ["saida", "Saída"]],
    fiscalStatus: [["emitida", "Emitida"], ["cancelada", "Cancelada"]],
    patrimonioCategoria: [["imovel","Imóvel"],["movel","Móvel"],["informatica","Informática"],["equipamento","Equipamento"],["outros","Outros"]],
      patrimonioEstado: [["novo","Novo"],["bom","Bom"],["regular","Regular"],["ruim","Ruim"],["baixado","Baixado"]],
    centrocustoTipo: [["direto","Direto"],["indireto","Indireto"],["administrativo","Administrativo"]],
    folhaStatus: [["aberta","Aberta"],["lancada","Lançada"]],
  };
  var CORStatus = {
    planejamento: "#64748b", andamento: "#2e6f9e", pausada: "#f59e0b", concluida: "#16a34a",
    ativo: "#16a34a", prospecto: "#2e6f9e", inativo: "#94a3b8",
    elaboracao: "#64748b", aguardando: "#f59e0b", suspenso: "#f59e0b", concluido: "#16a34a", rescindido: "#dc2626", cancelado: "#94a3b8",
    pendente: "#f59e0b", aprovada: "#2e6f9e", paga: "#16a34a", pago: "#16a34a", receita: "#16a34a", despesa: "#dc2626",
    homologado: "#16a34a", cotacao: "#f59e0b", aprovado: "#2e6f9e", recebido: "#16a34a", entrada: "#16a34a", saida: "#dc2626",
    rascunho: "#64748b", finalizado: "#16a34a",
    afastado: "#f59e0b", desligado: "#94a3b8", aberto: "#f59e0b", lancado: "#16a34a",
    disponivel: "#16a34a", em_uso: "#2e6f9e", manutencao: "#f59e0b",
    aberta: "#2e6f9e", cotando: "#f59e0b", comprada: "#16a34a", urgente: "#dc2626", prioridade_alta: "#ea580c",
    emitida: "#16a34a", cancelada: "#dc2626",
    novo: "#16a34a", regular: "#f59e0b", ruim: "#dc2626", baixado: "#94a3b8",
    aberta: "#f59e0b", lancada: "#16a34a",
  };

  function rot(lista, v) { for (var i = 0; i < lista.length; i++) if (lista[i][0] === v) return lista[i][1]; return v || "—"; }
  function opts(lista, sel) { return lista.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === sel ? " selected" : "") + '>' + o[1] + "</option>"; }).join(""); }
  function optsUf(sel) { return '<option value="">—</option>' + P.uf.map(function (u) { return "<option" + (u === sel ? " selected" : "") + ">" + u + "</option>"; }).join(""); }
  function optsRec(lista, campo, sel, vazio) { return '<option value="">' + (vazio || "—") + "</option>" + Util.arr(lista).map(function (r) { return '<option value="' + r.id + '"' + (r.id === sel ? " selected" : "") + ">" + Util.esc(r[campo] || r.nome || r.numero || r.id) + "</option>"; }).join(""); }
  function pill(status) { var c = CORStatus[status] || "#64748b"; return '<span class="g-pill" style="background:' + c + '22;color:' + c + '">' + Util.esc(rot(P.obraStatus.concat(P.clienteStatus, P.contratoStatus, P.medicaoStatus, P.finStatus, P.fornStatus, P.compraStatus, P.rdoStatus, P.colabStatus, P.pontoStatus, P.frotaStatus, P.reqStatus, P.fiscalStatus, P.patrimonioEstado, P.folhaStatus), status)) + "</span>"; }
  function v(id) { var e = UI.el(id); return e ? e.value.trim() : ""; }
  function nv(id) { return Util.num(v(id)); }
  function campo(label, inner) { return '<div class="field"><label>' + label + "</label>" + inner + "</div>"; }
  function inp(id, val, ph, tipo) { return '<input id="' + id + '"' + (tipo ? ' type="' + tipo + '"' : "") + ' value="' + Util.esc(val == null ? "" : val) + '" placeholder="' + (ph || "") + '">'; }
  function sel(id, o) { return '<select id="' + id + '">' + o + "</select>"; }
  function eid() { return Auth.empresaId(); }
  function lista(ent) { return Store.listar(eid(), ent); }
  function vazioBox(txt, gacao, btn) { return '<div class="vazio card"><h3>' + txt + "</h3>" + (gacao ? '<button class="btn primary mt" data-gacao="' + gacao + '">+ ' + btn + "</button>" : "") + "</div>"; }

  // Ícones profissionais (monoline SVG, estilo Lucide) — sem emoji.
  var ICON = {
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
    orcamentos: '<rect x="5" y="2" width="14" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="11" x2="8" y2="11"/><line x1="12" y1="11" x2="12" y2="11"/><line x1="16" y1="11" x2="16" y2="11"/><line x1="8" y1="15" x2="8" y2="15"/><line x1="12" y1="15" x2="12" y2="15"/><line x1="16" y1="15" x2="16" y2="15"/><line x1="8" y1="19" x2="8" y2="19"/><line x1="12" y1="19" x2="16" y2="19"/>',
    obras: '<path d="M3 21h18"/><path d="M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16"/><path d="M15 21V9h2a2 2 0 0 1 2 2v10"/><path d="M8 7h1M11 7h1M8 11h1M11 11h1M8 15h1M11 15h1"/>',
    clientes: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    contratos: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>',
    medicoes: '<path d="M21.3 8.7 8.7 21.3a1 1 0 0 1-1.4 0l-4.6-4.6a1 1 0 0 1 0-1.4L15.3 2.7a1 1 0 0 1 1.4 0l4.6 4.6a1 1 0 0 1 0 1.4Z"/><path d="m7.5 10.5 2 2"/><path d="m11 7 2 2"/><path d="m14.5 3.5 2 2"/><path d="m4 14 2 2"/>',
    financeiro: '<path d="M20 12V8H6a2 2 0 0 1 0-4h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>',
    fornecedores: '<path d="M10 17h4V5H2v12h3"/><path d="M14 8h4l3 4v5h-2"/><path d="M14 17h1"/><circle cx="7.5" cy="17.5" r="1.5"/><circle cx="17.5" cy="17.5" r="1.5"/>',
    compras: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>',
    estoque: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/><path d="m7.5 4.3 9 5.2"/>',
    rdo: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M8 11h8M8 15h5"/>',
    colaboradores: '<path d="M2 18h20"/><path d="M4 18v-2a8 8 0 0 1 16 0v2"/><path d="M10 8V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v3"/>',
    ponto: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    frota: '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.5-1.5-1.5H18l-2-4H6L4 11H2.5C1.7 11.5 1 12.1 1 13v3c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
    requisicoes: '<path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6"/><path d="M9 16h4"/>',
    fiscal: '<path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z"/><path d="M9 9h1"/><path d="M9 13h6"/><path d="M9 17h6"/>',
    patrimonio: '<path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 9h.01"/><path d="M15 9h.01"/><path d="M9 13h.01"/><path d="M15 13h.01"/><path d="M10 21v-4h4v4"/>',
    centrocusto: '<path d="M12 2v20"/><path d="M2 5h20"/><path d="M4 5v14c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V5"/><path d="M8 10h8"/><path d="M8 14h5"/>',
    folha: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M8 4v16"/><path d="M12 14h5"/><path d="M12 17h5"/>',
    relatorios: '<path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6"/><rect x="12" y="8" width="3" height="10"/><rect x="17" y="5" width="3" height="13"/>',
  };
  function svg(id, size) { size = size || 20; return '<svg class="g-ic" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICON[id] || "") + "</svg>"; }

  var Gestao = {
    P: P, rot: rot,
    modulos: [
      { id: "dashboard", nome: "Painel" },
      { id: "orcamentos", nome: "Orçamentos" },
      { id: "obras", nome: "Obras" },
      { id: "clientes", nome: "Clientes" },
      { id: "contratos", nome: "Contratos" },
      { id: "medicoes", nome: "Medições" },
      { id: "financeiro", nome: "Financeiro" },
      { id: "fornecedores", nome: "Fornecedores" },
      { id: "compras", nome: "Compras" },
      { id: "estoque", nome: "Estoque" },
      { id: "rdo", nome: "Diário (RDO)" },
      { id: "colaboradores", nome: "Colaboradores" },
      { id: "ponto", nome: "Ponto / Folha" },
      { id: "frota", nome: "Frota" },
      { id: "requisicoes", nome: "Requisições" },
      { id: "fiscal", nome: "Fiscal / NF-e" },
      { id: "patrimonio", nome: "Patrimônio" },
      { id: "centrocusto", nome: "Centro de Custo" },
      { id: "folha", nome: "Folha / Encargos" },
      { id: "relatorios", nome: "Relatórios" }
    ],

    // ---------- Sidebar (nav de módulos) ----------
    renderSidebar: function (viewAtiva) {
      var pode = this.podeGestao();
      var mods = pode ? this.modulos : this.modulos.filter(function (m) { return m.id === "orcamentos"; });
      var itens = mods.map(function (m) {
        return '<button class="sb-item' + (m.id === viewAtiva ? " on" : "") + '" data-view="' + m.id + '"><span class="sb-ic">' + svg(m.id, 19) + "</span><span>" + m.nome + "</span></button>";
      }).join("");
      if (!pode) itens += '<button class="sb-item sb-upsell" data-gacao="upsell-plus"><span class="sb-ic">⭐</span><span>Desbloquear Gestão</span></button>';
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
        case "fornecedores": return this.renderFornecedores();
        case "compras": return this.renderCompras();
        case "estoque": return this.renderEstoque();
        case "rdo": return this.renderRdo();
        case "colaboradores": return this.renderColaboradores();
        case "ponto": return this.renderPonto();
        case "frota": return this.renderFrota();
        case "requisicoes": return this.renderRequisicoes();
        case "fiscal": return this.renderFiscal();
        case "patrimonio": return this.renderPatrimonio();
        case "centrocusto": return this.renderCentrocusto();
        case "folha": return this.renderFolha();
        case "relatorios": return this.renderRelatorios();
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
      var compras = lista("compras"), estoque = lista("estoque"), rdos = lista("rdo");
      var comprasAbertas = compras.filter(function (c) { return c.status === "cotacao" || c.status === "aprovado"; }).length;
      var valorEstoque = estoque.reduce(function (s, i) { return s + Util.num(i.saldo) * Util.num(i.custoUnit); }, 0);
      var emAndamento = obras.filter(function (o) { return o.status === "andamento"; }).length;
      var valorContratado = contratos.reduce(function (s, c) { return s + Util.num(c.valor); }, 0);
      var receitas = fin.filter(function (f) { return f.tipo === "receita"; }).reduce(function (s, f) { return s + Util.num(f.valor); }, 0);
      var despesas = fin.filter(function (f) { return f.tipo === "despesa"; }).reduce(function (s, f) { return s + Util.num(f.valor); }, 0);
      var aReceber = fin.filter(function (f) { return f.tipo === "receita" && f.status === "pendente"; }).reduce(function (s, f) { return s + Util.num(f.valor); }, 0);
      var medPend = med.filter(function (m) { return m.status !== "paga"; }).length;
      function k(rot, num, cls) { return '<div class="kpi ' + (cls || "") + '"><div class="rotulo">' + rot + '</div><div class="num">' + num + "</div></div>"; }
      var html = '<h1 class="mb">Painel de Gestão</h1>' +
        '<div class="kpis kpis-g">' +
          k("Obras em andamento", emAndamento + " / " + obras.length) +
          k("Valor contratado", Util.fmtMoeda(valorContratado), "custo") +
          k("Recebido", Util.fmtMoeda(receitas), "destaque") +
          k("A receber", Util.fmtMoeda(aReceber)) +
          k("Despesas", Util.fmtMoeda(despesas)) +
          k("Medições pendentes", medPend) +
          k("Compras em aberto", comprasAbertas) +
          k("Valor em estoque", Util.fmtMoeda(valorEstoque)) +
          k("Diários (RDO)", rdos.length) +
        "</div>";
      // resumo por obra (orçado x contratado x custo real)
      html += '<div class="card mt"><h3 style="margin:0 0 10px">Resumo por obra</h3>';
      if (!obras.length) html += '<p class="muted">Nenhuma obra ainda. Crie a primeira em <b>Obras</b> (ou gere a partir de um orçamento).</p>';
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
      var html = this._head(svg("obras") + "Obras", "nova-obra", "Nova obra");
      if (!obras.length) return html + vazioBox("Nenhuma obra cadastrada", "nova-obra", "Criar primeira obra");
      html += '<div class="grid-cards">';
      obras.forEach(function (o) {
        var cli = clientes.filter(function (c) { return c.id === o.clienteId; })[0];
        html += '<div class="card orc-card" data-gopen="obras:' + o.id + '">' +
          '<div class="flex between"><h3>' + Util.esc(o.nome) + "</h3>" + pill(o.status) + "</div>" +
          '<div class="meta">' + (cli ? "👤 " + Util.esc(cli.nome) + " · " : "") + (o.tipo ? rot(P.obraTipo, o.tipo) : "") + (o.local ? " · 📍 " + Util.esc(o.local) : "") + "</div>" +
          '<div class="valor">' + Util.fmtMoeda(o.valor) + "</div>" +
          '<div style="margin-top:10px;text-align:right"><button class="btn sm" data-gacao="portal-obra" data-id="' + o.id + '" style="font-size:12px;padding:6px 12px">📱 Portal do cliente' + (o.portalUser ? " ✓" : "") + "</button></div></div>";
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
      var html = this._head(svg("clientes") + "Clientes", "nova-cliente", "Novo cliente");
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
      var html = this._head(svg("contratos") + "Contratos", "novo-contrato", "Novo contrato");
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
      var html = this._head(svg("medicoes") + "Medições", "nova-medicao", "Nova medição");
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
      var extra = '<button class="btn sm" data-gacao="doc-financeiro" style="margin-right:10px;align-self:center;background:#0f2740;color:#fff">📄 Lançar de documento (IA)</button>' +
        '<span class="muted" style="margin-right:12px;align-self:center">Saldo: <b style="color:' + (rec - desp >= 0 ? "var(--verde)" : "var(--vermelho)") + '">' + Util.fmtMoeda(rec - desp) + "</b></span>";
      var html = this._head(svg("financeiro") + "Financeiro", "novo-lancamento", "Novo lançamento", extra);
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

    // =================== FORNECEDORES ===================
    renderFornecedores: function () {
      var fs = lista("fornecedores");
      var html = this._head(svg("fornecedores") + "Fornecedores", "novo-fornecedor", "Novo fornecedor");
      if (!fs.length) return html + vazioBox("Nenhum fornecedor cadastrado", "novo-fornecedor", "Cadastrar primeiro fornecedor");
      html += '<table class="tbl"><thead><tr><th>Nome</th><th>Categoria</th><th>CNPJ/CPF</th><th>Telefone</th><th>Cidade</th><th>Status</th></tr></thead><tbody>';
      fs.forEach(function (f) {
        html += '<tr class="lin" style="cursor:pointer" data-gopen="fornecedores:' + f.id + '"><td><b>' + Util.esc(f.nome) + "</b></td><td>" + rot(P.fornCategoria, f.categoria) + "</td><td>" + Util.esc(f.doc || "—") + "</td><td>" + Util.esc(f.telefone || "—") + "</td><td>" + Util.esc(f.cidade || "—") + (f.uf ? "/" + Util.esc(f.uf) : "") + "</td><td>" + pill(f.status) + "</td></tr>";
      });
      return html + "</tbody></table>";
    },
    novoFornecedor: function () { this.formFornecedor(null); },
    formFornecedor: function (f) {
      f = f || {};
      var corpo =
        '<div class="row">' + campo("Nome / Razão social *", inp("g-nome", f.nome)) + campo("Categoria", sel("g-cat", opts(P.fornCategoria, f.categoria || "material"))) + "</div>" +
        '<div class="row">' + campo("Tipo", sel("g-tipo", opts(P.clienteTipo, f.tipo || "PJ"))) + campo("CPF / CNPJ", inp("g-doc", f.doc)) + campo("Inscr. Estadual", inp("g-ie", f.ie)) + "</div>" +
        '<div class="row">' + campo("Telefone *", inp("g-tel", f.telefone, "(34) 90000-0000")) + campo("E-mail", inp("g-email", f.email, "", "email")) + campo("Contato (pessoa)", inp("g-contato", f.contato)) + "</div>" +
        campo("Endereço", inp("g-end", f.endereco)) +
        '<div class="row"><div class="field" style="flex:2"><label>Cidade</label>' + inp("g-cidade", f.cidade) + "</div>" + campo("UF", sel("g-uf", optsUf(f.uf))) + campo("Status", sel("g-status", opts(P.fornStatus, f.status || "ativo"))) + "</div>" +
        campo("Produtos / serviços fornecidos", '<textarea id="g-prod" rows="2">' + Util.esc(f.produtos || "") + "</textarea>") +
        campo("Observações", '<textarea id="g-obs" rows="2">' + Util.esc(f.obs || "") + "</textarea>");
      this._modalForm("fornecedores", f, "Fornecedor", corpo, function (obj) {
        obj.nome = v("g-nome"); if (!obj.nome) { UI.toast("Informe o nome do fornecedor.", "erro"); return false; }
        obj.categoria = v("g-cat"); obj.tipo = v("g-tipo"); obj.doc = v("g-doc"); obj.ie = v("g-ie");
        obj.telefone = v("g-tel"); obj.email = v("g-email"); obj.contato = v("g-contato"); obj.endereco = v("g-end");
        obj.cidade = v("g-cidade"); obj.uf = v("g-uf"); obj.status = v("g-status"); obj.produtos = v("g-prod"); obj.obs = v("g-obs");
        return true;
      });
    },

    // =================== COMPRAS (pedidos de compra) ===================
    renderCompras: function () {
      var cs = lista("compras").slice().sort(function (a, b) { return (b.data || "").localeCompare(a.data || ""); });
      var obras = lista("obras");
      var total = cs.reduce(function (s, c) { return s + Util.num(c.valor); }, 0);
      var pend = cs.filter(function (c) { return c.status === "cotacao" || c.status === "aprovado"; }).length;
      var extra = '<span class="muted" style="margin-right:12px;align-self:center">Em aberto: <b>' + pend + "</b> · Total: <b>" + Util.fmtMoeda(total) + "</b></span>";
      var html = this._head(svg("compras") + "Compras", "nova-compra", "Novo pedido", extra);
      if (!cs.length) return html + vazioBox("Nenhum pedido de compra", "nova-compra", "Criar primeiro pedido");
      html += '<table class="tbl"><thead><tr><th>Nº</th><th>Fornecedor</th><th>Obra</th><th>Descrição</th><th class="num">Valor</th><th>Status</th><th></th></tr></thead><tbody>';
      cs.forEach(function (c) {
        var ob = obras.filter(function (o) { return o.id === c.obraId; })[0];
        var acao = c.status === "cotacao" ? '<button class="btn sm primary" data-gacao="aprovar-compra" data-id="' + c.id + '">Aprovar</button>'
          : (c.status === "aprovado" ? '<button class="btn sm success" data-gacao="receber-compra" data-id="' + c.id + '">Receber</button>' : (c.status === "recebido" ? "✓" : ""));
        html += '<tr><td style="cursor:pointer" data-gopen="compras:' + c.id + '"><b>' + Util.esc(c.numero || "—") + "</b></td><td>" + Util.esc(c.fornecedorNome || "—") + "</td><td>" + Util.esc(ob ? ob.nome : "—") + "</td><td>" + Util.esc(c.descricao || "—") + '</td><td class="num">' + Util.fmtMoeda(c.valor) + "</td><td>" + pill(c.status) + '</td><td class="num">' + acao + "</td></tr>";
      });
      return html + "</tbody></table>";
    },
    novoCompra: function () { this.formCompra(null); },
    formCompra: function (c) {
      c = c || {}; var forn = lista("fornecedores"), obras = lista("obras");
      var num = c.numero || ("PC-" + new Date().getFullYear() + "-" + String(lista("compras").length + 1).padStart(3, "0"));
      var hoje = new Date().toISOString().slice(0, 10);
      var corpo =
        '<div class="row">' + campo("Número", inp("g-num", num)) + campo("Status", sel("g-status", opts(P.compraStatus, c.status || "cotacao"))) + "</div>" +
        '<div class="row">' + campo("Fornecedor", sel("g-forn", optsRec(forn, "nome", c.fornecedorId, "— selecionar —"))) + campo("Obra", sel("g-obra", optsRec(obras, "nome", c.obraId, "— nenhuma —"))) + "</div>" +
        campo("Descrição do que será comprado *", inp("g-desc", c.descricao, "Ex.: 200 sacos de cimento CP-II 50kg")) +
        '<div class="row">' + campo("Valor total (R$) *", inp("g-valor", c.valor)) + campo("Categoria", sel("g-cat", opts(P.fornCategoria, c.categoria || "material"))) + campo("Forma de pagamento", sel("g-forma", '<option value="">—</option>' + opts(P.formaPgto, c.formaPgto))) + "</div>" +
        '<div class="row">' + campo("Data do pedido", inp("g-data", c.data || hoje, "", "date")) + campo("Previsão de entrega", inp("g-entrega", c.previsaoEntrega, "", "date")) + "</div>" +
        campo("Observações", '<textarea id="g-obs" rows="2">' + Util.esc(c.obs || "") + "</textarea>") +
        (c.status === "recebido" ? '<p class="muted">✓ Recebida — já lançou uma despesa no Financeiro.</p>' : '<p class="muted">Ao <b>Receber</b> na lista, o valor vira uma despesa no Financeiro (vinculada à obra).</p>');
      this._modalForm("compras", c, "Pedido de compra", corpo, function (obj) {
        obj.numero = v("g-num"); obj.status = v("g-status"); obj.fornecedorId = v("g-forn"); obj.obraId = v("g-obra");
        obj.descricao = v("g-desc"); if (!obj.descricao) { UI.toast("Descreva o que será comprado.", "erro"); return false; }
        obj.valor = nv("g-valor"); obj.categoria = v("g-cat"); obj.formaPgto = v("g-forma");
        obj.data = v("g-data"); obj.previsaoEntrega = v("g-entrega"); obj.obs = v("g-obs");
        var fo = lista("fornecedores").filter(function (x) { return x.id === obj.fornecedorId; })[0];
        obj.fornecedorNome = fo ? fo.nome : "";
        return true;
      });
    },

    // =================== ESTOQUE / ALMOXARIFADO ===================
    renderEstoque: function () {
      var its = lista("estoque"), obras = lista("obras");
      var valorTotal = its.reduce(function (s, i) { return s + Util.num(i.saldo) * Util.num(i.custoUnit); }, 0);
      var baixos = its.filter(function (i) { return Util.num(i.estoqueMin) > 0 && Util.num(i.saldo) <= Util.num(i.estoqueMin); }).length;
      var extra = '<span class="muted" style="margin-right:12px;align-self:center">' + (baixos ? '<b style="color:var(--laranja,#f59e0b)">' + baixos + ' abaixo do mínimo</b> · ' : "") + 'Valor: <b>' + Util.fmtMoeda(valorTotal) + "</b></span>";
      var html = this._head(svg("estoque") + "Estoque / Almoxarifado", "novo-item-estoque", "Novo item", extra);
      if (!its.length) return html + vazioBox("Nenhum item em estoque", "novo-item-estoque", "Cadastrar primeiro item");
      html += '<table class="tbl"><thead><tr><th>Item</th><th>Categoria</th><th>Obra</th><th class="num">Saldo</th><th class="num">Custo un.</th><th class="num">Total</th><th></th></tr></thead><tbody>';
      its.forEach(function (i) {
        var ob = obras.filter(function (o) { return o.id === i.obraId; })[0];
        var baixo = Util.num(i.estoqueMin) > 0 && Util.num(i.saldo) <= Util.num(i.estoqueMin);
        var saldoTxt = Util.fmtNum(i.saldo, 2) + " " + Util.esc(i.unidade || "") + (baixo ? ' <span class="g-pill" style="background:#f59e0b22;color:#f59e0b">baixo</span>' : "");
        html += '<tr><td style="cursor:pointer" data-gopen="estoque:' + i.id + '"><b>' + Util.esc(i.nome) + "</b></td><td>" + rot(P.estoqueCategoria, i.categoria) + "</td><td>" + Util.esc(ob ? ob.nome : "Central") + '</td><td class="num">' + saldoTxt + '</td><td class="num">' + Util.fmtMoeda(i.custoUnit) + '</td><td class="num">' + Util.fmtMoeda(Util.num(i.saldo) * Util.num(i.custoUnit)) + '</td><td class="num"><button class="btn sm success" data-gacao="entrada-estoque" data-id="' + i.id + '">+ Entrada</button> <button class="btn sm" data-gacao="saida-estoque" data-id="' + i.id + '">− Saída</button></td></tr>';
      });
      return html + "</tbody></table>";
    },
    novoItemEstoque: function () { this.formEstoque(null); },
    formEstoque: function (i) {
      i = i || {}; var obras = lista("obras");
      var corpo =
        '<div class="row">' + campo("Nome do item *", inp("g-nome", i.nome, "Ex.: Cimento CP-II 50kg")) + campo("Categoria", sel("g-cat", opts(P.estoqueCategoria, i.categoria || "outros"))) + "</div>" +
        '<div class="row">' + campo("Unidade", inp("g-un", i.unidade, "sc, m², kg, un")) + campo("Saldo atual", inp("g-saldo", i.saldo)) + campo("Estoque mínimo", inp("g-min", i.estoqueMin)) + "</div>" +
        '<div class="row">' + campo("Custo unitário (R$)", inp("g-custo", i.custoUnit)) + campo("Obra", sel("g-obra", optsRec(obras, "nome", i.obraId, "— Central —"))) + campo("Localização", inp("g-loc", i.localizacao, "Ex.: Galpão A")) + "</div>" +
        campo("Observações", '<textarea id="g-obs" rows="2">' + Util.esc(i.obs || "") + "</textarea>") +
        '<p class="muted">Use <b>+ Entrada</b> / <b>− Saída</b> na lista para movimentar o saldo (registra a movimentação).</p>';
      this._modalForm("estoque", i, "Item de estoque", corpo, function (obj) {
        obj.nome = v("g-nome"); if (!obj.nome) { UI.toast("Informe o nome do item.", "erro"); return false; }
        obj.categoria = v("g-cat"); obj.unidade = v("g-un"); obj.saldo = nv("g-saldo"); obj.estoqueMin = nv("g-min");
        obj.custoUnit = nv("g-custo"); obj.obraId = v("g-obra"); obj.localizacao = v("g-loc"); obj.obs = v("g-obs");
        return true;
      });
    },
    _movEstoque: function (id, tipo) {
      var it = Store.obter(eid(), "estoque", id); if (!it) return;
      var lbl = tipo === "entrada" ? "entrada (adicionar ao saldo)" : "saída (baixar do saldo)";
      var q = window.prompt("Quantidade de " + lbl + ' para "' + it.nome + '" (' + (it.unidade || "un") + "):", "");
      if (q === null) return;
      var qtd = Util.num(q); if (!(qtd > 0)) { UI.toast("Quantidade inválida.", "erro"); return; }
      var saldoAtual = Util.num(it.saldo);
      if (tipo === "saida" && qtd > saldoAtual) { UI.toast("Saída maior que o saldo (" + Util.fmtNum(saldoAtual, 2) + ").", "erro"); return; }
      it.saldo = tipo === "entrada" ? saldoAtual + qtd : saldoAtual - qtd;
      Store.salvar(eid(), "estoque", it);
      Store.salvar(eid(), "estoque_mov", { itemId: it.id, itemNome: it.nome, tipo: tipo, qtd: qtd, custoUnit: Util.num(it.custoUnit), data: new Date().toISOString().slice(0, 10), obraId: it.obraId });
      App.render(); UI.toast("Movimentação registrada. Novo saldo: " + Util.fmtNum(it.saldo, 2) + " " + (it.unidade || ""), "ok");
    },

    // =================== RDO — DIÁRIO DE OBRA ===================
    renderRdo: function () {
      var rs = lista("rdo").slice().sort(function (a, b) { return (b.data || "").localeCompare(a.data || ""); });
      var obras = lista("obras");
      var html = this._head(svg("rdo") + "Diário de Obra (RDO)", "novo-rdo", "Novo diário");
      if (!rs.length) return html + vazioBox("Nenhum diário registrado", "novo-rdo", "Registrar primeiro diário");
      html += '<table class="tbl"><thead><tr><th>Nº</th><th>Data</th><th>Obra</th><th>Clima</th><th class="num">Efetivo</th><th>Atividades</th><th>Status</th><th></th></tr></thead><tbody>';
      rs.forEach(function (r) {
        var ob = obras.filter(function (o) { return o.id === r.obraId; })[0];
        var ef = Util.num(r.efetivoDireto) + Util.num(r.efetivoIndireto);
        var clima = rot(P.rdoClima, r.climaManha) + (r.climaTarde && r.climaTarde !== r.climaManha ? " / " + rot(P.rdoClima, r.climaTarde) : "");
        var resumo = (r.atividades || "").replace(/\s+/g, " ").slice(0, 60) + ((r.atividades || "").length > 60 ? "…" : "");
        var nf = (r.fotos && r.fotos.length) ? ' <span title="fotos anexadas" style="color:#2e6f9e;font-weight:700">📷' + r.fotos.length + "</span>" : "";
        var acao = r.status === "rascunho" ? '<button class="btn sm success" data-gacao="finalizar-rdo" data-id="' + r.id + '">Finalizar</button>' : "✓";
        html += '<tr><td style="cursor:pointer" data-gopen="rdo:' + r.id + '"><b>' + Util.esc(r.numero || "—") + "</b></td><td>" + Util.esc(r.data ? r.data.split("-").reverse().join("/") : "—") + "</td><td>" + Util.esc(ob ? ob.nome : "—") + "</td><td>" + Util.esc(clima) + '</td><td class="num">' + ef + "</td><td>" + Util.esc(resumo || "—") + nf + "</td><td>" + pill(r.status) + '</td><td class="num">' + acao + "</td></tr>";
      });
      return html + "</tbody></table>";
    },
    novoRdo: function () { this.formRdo(null); },
    formRdo: function (r) {
      r = r || {}; var self = this, obras = lista("obras");
      var num = r.numero || ("RDO-" + String(lista("rdo").length + 1).padStart(4, "0"));
      var hoje = new Date().toISOString().slice(0, 10);
      var fotosBuf = (r.fotos || []).map(function (f) { return { d: f.d, leg: f.leg || "" }; }); // edição: fotos já salvas
      var eu = (typeof Auth !== "undefined" && Auth.usuario && Auth.usuario()) || {};
      var autorDef = r.autor || eu.nome || eu.empresa || eu.email || "";
      var corpo =
        '<div class="row">' + campo("Nº", inp("g-num", num)) + campo("Data", inp("g-data", r.data || hoje, "", "date")) + campo("Status", sel("g-status", opts(P.rdoStatus, r.status || "rascunho"))) + "</div>" +
        campo("Obra *", sel("g-obra", optsRec(obras, "nome", r.obraId, "— selecionar —"))) +
        '<div class="row">' + campo("Clima (manhã)", sel("g-cmanha", opts(P.rdoClima, r.climaManha || "ensolarado"))) + campo("Clima (tarde)", sel("g-ctarde", opts(P.rdoClima, r.climaTarde || "ensolarado"))) + campo("Condição de trabalho", sel("g-cond", opts(P.rdoCondicao, r.condicao || "praticavel"))) + "</div>" +
        '<div class="row">' + campo("Efetivo direto (nº)", inp("g-efd", r.efetivoDireto)) + campo("Efetivo indireto (nº)", inp("g-efi", r.efetivoIndireto)) + campo("Terceiros / equipes", inp("g-terc", r.terceiros)) + "</div>" +
        campo("Atividades executadas *", '<textarea id="g-ativ" rows="3" placeholder="O que foi executado no dia">' + Util.esc(r.atividades || "") + "</textarea>") +
        campo("Ocorrências / paralisações", '<textarea id="g-ocor" rows="2" placeholder="Chuva, falta de material, acidente, visita técnica...">' + Util.esc(r.ocorrencias || "") + "</textarea>") +
        '<div class="row">' + campo("Equipamentos em obra", inp("g-equip", r.equipamentos, "Betoneira, andaimes...")) + campo("Responsável (RT)", inp("g-resp", r.responsavel)) + "</div>" +
        '<div class="row">' + campo("Elaborado por (autor)", inp("g-autor", autorDef, "Quem registrou o diário")) + "</div>" +
        campo('Fotos do dia <span class="muted" style="font-weight:400">(aparecem no Portal do Cliente · máx ' + RDO_MAX_FOTOS + ")</span>",
          '<input type="file" id="g-fotos" accept="image/*" multiple style="display:none">' +
          '<button type="button" class="btn sm" id="g-fotos-btn" style="background:#0f2740;color:#fff">📷 Adicionar fotos</button>' +
          '<div id="g-fotos-gal" style="display:flex;flex-wrap:wrap;gap:10px;margin-top:10px"></div>');
      this._modalForm("rdo", r, "Diário de obra", corpo, function (obj) {
        obj.numero = v("g-num"); obj.data = v("g-data"); obj.status = v("g-status"); obj.obraId = v("g-obra");
        if (!obj.obraId) { UI.toast("Selecione a obra do diário.", "erro"); return false; }
        obj.climaManha = v("g-cmanha"); obj.climaTarde = v("g-ctarde"); obj.condicao = v("g-cond");
        obj.efetivoDireto = nv("g-efd"); obj.efetivoIndireto = nv("g-efi"); obj.terceiros = v("g-terc");
        obj.atividades = v("g-ativ"); if (!obj.atividades) { UI.toast("Descreva as atividades do dia.", "erro"); return false; }
        obj.ocorrencias = v("g-ocor"); obj.equipamentos = v("g-equip"); obj.responsavel = v("g-resp");
        obj.autor = v("g-autor");
        obj.fotos = fotosBuf.slice(0, RDO_MAX_FOTOS);
        var ob = lista("obras").filter(function (o) { return o.id === obj.obraId; })[0];
        obj.obraNome = ob ? ob.nome : "";
        return true;
      });
      // UI.modal já colocou o form no DOM (síncrono). Liga upload + galeria (legenda + remover por foto).
      function renderGal() {
        var g = document.getElementById("g-fotos-gal"); if (!g) return;
        if (!fotosBuf.length) { g.innerHTML = '<span class="muted" style="font-size:12px">Nenhuma foto anexada.</span>'; return; }
        g.innerHTML = fotosBuf.map(function (f, i) {
          return '<div style="position:relative;width:76px">' +
            '<img src="' + f.d + '" style="width:76px;height:76px;object-fit:cover;border-radius:8px;border:1px solid #d3e0ee">' +
            '<button type="button" data-rmf="' + i + '" title="Remover" style="position:absolute;top:-7px;right:-7px;background:#dc2626;color:#fff;border:0;border-radius:50%;width:20px;height:20px;line-height:18px;cursor:pointer;font-size:13px">×</button>' +
            '<input type="text" data-legf="' + i + '" placeholder="legenda" style="width:76px;font-size:10px;margin-top:3px;padding:2px 4px;border:1px solid #d3e0ee;border-radius:5px">' +
            '</div>';
        }).join("");
        Array.prototype.forEach.call(g.querySelectorAll("[data-legf]"), function (el) { var i = +el.getAttribute("data-legf"); el.value = fotosBuf[i].leg || ""; el.oninput = function () { fotosBuf[i].leg = el.value; }; });
        Array.prototype.forEach.call(g.querySelectorAll("[data-rmf]"), function (b) { b.onclick = function () { fotosBuf.splice(+b.getAttribute("data-rmf"), 1); renderGal(); }; });
      }
      var btn = document.getElementById("g-fotos-btn"), inpF = document.getElementById("g-fotos");
      if (btn && inpF) {
        btn.onclick = function () { inpF.click(); };
        inpF.onchange = function () {
          Array.prototype.slice.call(inpF.files || []).forEach(function (file) {
            if (fotosBuf.length >= RDO_MAX_FOTOS) { UI.toast("Máximo de " + RDO_MAX_FOTOS + " fotos por diário.", "erro"); return; }
            self._comprimirFoto(file, RDO_FOTO_MAXW, RDO_FOTO_Q, function (d) {
              if (!d) { UI.toast("Foto inválida — ignorada.", "erro"); return; }
              if (fotosBuf.length >= RDO_MAX_FOTOS) return;
              fotosBuf.push({ d: d, leg: "" }); renderGal();
            });
          });
          inpF.value = "";
        };
      }
      renderGal();
    },

    // =================== RH — COLABORADORES ===================
    renderColaboradores: function () {
      var cs = lista("colaboradores"), obras = lista("obras");
      var ativos = cs.filter(function (c) { return c.status === "ativo"; }).length;
      var extra = '<span class="muted" style="margin-right:12px;align-self:center">Ativos: <b>' + ativos + "</b> / " + cs.length + "</span>";
      var html = this._head(svg("colaboradores") + "Colaboradores", "novo-colaborador", "Novo colaborador", extra);
      if (!cs.length) return html + vazioBox("Nenhum colaborador cadastrado", "novo-colaborador", "Cadastrar primeiro colaborador");
      html += '<table class="tbl"><thead><tr><th>Nome</th><th>Função</th><th>Contrato</th><th>Obra</th><th class="num">Remuneração</th><th>Status</th></tr></thead><tbody>';
      cs.forEach(function (c) {
        var ob = obras.filter(function (o) { return o.id === c.obraId; })[0];
        var rem = Util.fmtMoeda(c.remuneracao) + ' <span class="muted">/ ' + rot(P.unidadeRem, c.unidadeRem) + "</span>";
        html += '<tr class="lin" style="cursor:pointer" data-gopen="colaboradores:' + c.id + '"><td><b>' + Util.esc(c.nome) + "</b></td><td>" + Util.esc(c.funcao || "—") + "</td><td>" + rot(P.tipoContrato, c.tipoContrato) + "</td><td>" + Util.esc(ob ? ob.nome : "—") + '</td><td class="num">' + rem + "</td><td>" + pill(c.status) + "</td></tr>";
      });
      return html + "</tbody></table>";
    },
    novoColaborador: function () { this.formColaborador(null); },
    formColaborador: function (c) {
      c = c || {}; var obras = lista("obras");
      var corpo =
        '<div class="row">' + campo("Nome *", inp("g-nome", c.nome)) + campo("Função / Cargo", inp("g-func", c.funcao, "Pedreiro, Servente, Mestre de obras...")) + "</div>" +
        '<div class="row">' + campo("Tipo de contrato", sel("g-tipo", opts(P.tipoContrato, c.tipoContrato || "clt"))) + campo("CPF", inp("g-cpf", c.cpf)) + campo("Telefone", inp("g-tel", c.telefone, "(34) 90000-0000")) + "</div>" +
        '<div class="row">' + campo("Remuneração (R$)", inp("g-rem", c.remuneracao)) + campo("Base", sel("g-un", opts(P.unidadeRem, c.unidadeRem || "mensal"))) + campo("Admissão", inp("g-adm", c.admissao, "", "date")) + "</div>" +
        '<div class="row">' + campo("Obra (alocação)", sel("g-obra", optsRec(obras, "nome", c.obraId, "— nenhuma —"))) + campo("Status", sel("g-status", opts(P.colabStatus, c.status || "ativo"))) + "</div>" +
        campo("Observações", '<textarea id="g-obs" rows="2">' + Util.esc(c.obs || "") + "</textarea>");
      this._modalForm("colaboradores", c, "Colaborador", corpo, function (obj) {
        obj.nome = v("g-nome"); if (!obj.nome) { UI.toast("Informe o nome do colaborador.", "erro"); return false; }
        obj.funcao = v("g-func"); obj.tipoContrato = v("g-tipo"); obj.cpf = v("g-cpf"); obj.telefone = v("g-tel");
        obj.remuneracao = nv("g-rem"); obj.unidadeRem = v("g-un"); obj.admissao = v("g-adm"); obj.obraId = v("g-obra");
        obj.status = v("g-status"); obj.obs = v("g-obs");
        return true;
      });
    },

    // =================== RH — PONTO / FOLHA ===================
    renderPonto: function () {
      var ps = lista("ponto").slice().sort(function (a, b) { return (b.competencia || "").localeCompare(a.competencia || ""); });
      var colabs = lista("colaboradores"), obras = lista("obras");
      var aLancar = ps.filter(function (p) { return p.status !== "lancado"; }).reduce(function (s, p) { return s + Util.num(p.valor); }, 0);
      var extra = '<span class="muted" style="margin-right:12px;align-self:center">A lançar: <b>' + Util.fmtMoeda(aLancar) + "</b></span>";
      var html = this._head(svg("ponto") + "Ponto / Folha", "novo-ponto", "Novo registro", extra);
      if (!ps.length) return html + vazioBox("Nenhum registro de ponto/folha", "novo-ponto", "Registrar ponto");
      html += '<table class="tbl"><thead><tr><th>Competência</th><th>Colaborador</th><th>Obra</th><th class="num">Dias</th><th class="num">Valor</th><th>Status</th><th></th></tr></thead><tbody>';
      ps.forEach(function (p) {
        var col = colabs.filter(function (c) { return c.id === p.colaboradorId; })[0];
        var ob = obras.filter(function (o) { return o.id === p.obraId; })[0];
        var acao = p.status !== "lancado" ? '<button class="btn sm success" data-gacao="lancar-ponto" data-id="' + p.id + '">Lançar folha</button>' : "✓";
        html += '<tr><td style="cursor:pointer" data-gopen="ponto:' + p.id + '"><b>' + Util.esc(p.competencia || "—") + "</b></td><td>" + Util.esc(col ? col.nome : (p.colaboradorNome || "—")) + "</td><td>" + Util.esc(ob ? ob.nome : "—") + '</td><td class="num">' + Util.fmtNum(p.dias, 0) + '</td><td class="num">' + Util.fmtMoeda(p.valor) + "</td><td>" + pill(p.status) + '</td><td class="num">' + acao + "</td></tr>";
      });
      return html + "</tbody></table>";
    },
    novoPonto: function () { this.formPonto(null); },
    formPonto: function (p) {
      p = p || {}; var colabs = lista("colaboradores"), obras = lista("obras");
      var comp = p.competencia || new Date().toISOString().slice(0, 7);
      var corpo =
        '<div class="row">' + campo("Competência (mês)", inp("g-comp", comp, "", "month")) + campo("Colaborador *", sel("g-colab", optsRec(colabs, "nome", p.colaboradorId, "— selecionar —"))) + "</div>" +
        '<div class="row">' + campo("Obra", sel("g-obra", optsRec(obras, "nome", p.obraId, "— nenhuma —"))) + campo("Dias trabalhados", inp("g-dias", p.dias)) + campo("Faltas", inp("g-faltas", p.faltas)) + "</div>" +
        '<div class="row">' + campo("Horas extras", inp("g-he", p.horasExtras)) + campo("Valor a lançar (R$) *", inp("g-valor", p.valor)) + campo("Status", sel("g-status", opts(P.pontoStatus, p.status || "aberto"))) + "</div>" +
        campo("Observações", '<textarea id="g-obs" rows="2">' + Util.esc(p.obs || "") + "</textarea>") +
        '<p class="muted">A remuneração base fica no cadastro do Colaborador. Informe os dias e o valor do período; ao <b>Lançar folha</b>, vira uma despesa de mão de obra no Financeiro (vinculada à obra).</p>';
      this._modalForm("ponto", p, "Registro de ponto", corpo, function (obj) {
        obj.competencia = v("g-comp"); obj.colaboradorId = v("g-colab");
        if (!obj.colaboradorId) { UI.toast("Selecione o colaborador.", "erro"); return false; }
        obj.obraId = v("g-obra"); obj.dias = nv("g-dias"); obj.faltas = nv("g-faltas"); obj.horasExtras = nv("g-he");
        obj.valor = nv("g-valor"); obj.status = v("g-status"); obj.obs = v("g-obs");
        var col = lista("colaboradores").filter(function (x) { return x.id === obj.colaboradorId; })[0];
        obj.colaboradorNome = col ? col.nome : "";
        return true;
      });
    },

    // =================== FROTA & EQUIPAMENTOS ===================
    renderFrota: function () {
      var fs = lista("frota"), obras = lista("obras");
      var proprios = fs.filter(function (f) { return f.posse === "proprio"; }).length;
      var custoMes = lista("frota_mov").reduce(function (s, m) { return s + Util.num(m.valor); }, 0);
      var extra = '<span class="muted" style="margin-right:12px;align-self:center">Próprios: <b>' + proprios + "</b> · Locados: <b>" + (fs.length - proprios) + "</b> · Custo total: <b>" + Util.fmtMoeda(custoMes) + "</b></span>";
      var html = this._head(svg("frota") + "Frota &amp; Equipamentos", "nova-frota", "Novo item", extra);
      if (!fs.length) return html + vazioBox("Nenhum veículo/equipamento cadastrado", "nova-frota", "Cadastrar primeiro");
      html += '<table class="tbl"><thead><tr><th>Item</th><th>Tipo</th><th>Placa/Nº</th><th>Posse</th><th>Obra</th><th>Status</th><th></th></tr></thead><tbody>';
      fs.forEach(function (f) {
        var ob = obras.filter(function (o) { return o.id === f.obraId; })[0];
        html += '<tr><td style="cursor:pointer" data-gopen="frota:' + f.id + '"><b>' + Util.esc(f.nome) + "</b></td><td>" + rot(P.frotaTipo, f.tipo) + "</td><td>" + Util.esc(f.placa || "—") + "</td><td>" + rot(P.frotaPosse, f.posse) + "</td><td>" + Util.esc(ob ? ob.nome : "—") + "</td><td>" + pill(f.status) + '</td><td class="num"><button class="btn sm primary" data-gacao="custo-frota" data-id="' + f.id + '">+ Custo</button></td></tr>';
      });
      return html + "</tbody></table>";
    },
    novoFrota: function () { this.formFrota(null); },
    formFrota: function (f) {
      f = f || {}; var obras = lista("obras");
      var corpo =
        '<div class="row">' + campo("Nome / Identificação *", inp("g-nome", f.nome, "Ex.: Caminhão Mercedes 2018")) + campo("Tipo", sel("g-tipo", opts(P.frotaTipo, f.tipo || "veiculo"))) + "</div>" +
        '<div class="row">' + campo("Placa / Nº patrimônio", inp("g-placa", f.placa)) + campo("Marca / Modelo", inp("g-modelo", f.modelo)) + campo("Ano", inp("g-ano", f.ano)) + "</div>" +
        '<div class="row">' + campo("Posse", sel("g-posse", opts(P.frotaPosse, f.posse || "proprio"))) + campo("Valor aquisição/locação (R$)", inp("g-valor", f.valor)) + campo("Status", sel("g-status", opts(P.frotaStatus, f.status || "disponivel"))) + "</div>" +
        '<div class="row">' + campo("Obra (alocação)", sel("g-obra", optsRec(obras, "nome", f.obraId, "— nenhuma —"))) + campo("KM / Horímetro atual", inp("g-km", f.km)) + "</div>" +
        campo("Observações", '<textarea id="g-obs" rows="2">' + Util.esc(f.obs || "") + "</textarea>");
      this._modalForm("frota", f, "Veículo/Equipamento", corpo, function (obj) {
        obj.nome = v("g-nome"); if (!obj.nome) { UI.toast("Informe o nome/identificação.", "erro"); return false; }
        obj.tipo = v("g-tipo"); obj.placa = v("g-placa"); obj.modelo = v("g-modelo"); obj.ano = v("g-ano");
        obj.posse = v("g-posse"); obj.valor = nv("g-valor"); obj.status = v("g-status"); obj.obraId = v("g-obra"); obj.km = nv("g-km"); obj.obs = v("g-obs");
        return true;
      });
    },
    formCustoFrota: function (frotaId) {
      var fr = Store.obter(eid(), "frota", frotaId); if (!fr) return;
      var obras = lista("obras"), hoje = new Date().toISOString().slice(0, 10);
      var corpo =
        '<p class="muted">Custo de <b>' + Util.esc(fr.nome) + "</b> — vira uma despesa no Financeiro (categoria Equipamento).</p>" +
        '<div class="row">' + campo("Data", inp("g-data", hoje, "", "date")) + campo("Tipo de custo", sel("g-ctipo", opts(P.frotaCusto, "combustivel"))) + "</div>" +
        '<div class="row">' + campo("Valor (R$) *", inp("g-cvalor", "")) + campo("KM / Horímetro", inp("g-ckm", fr.km)) + campo("Obra", sel("g-cobra", optsRec(obras, "nome", fr.obraId, "— nenhuma —"))) + "</div>" +
        campo("Descrição", inp("g-cdesc", "", "Ex.: 200L diesel, troca de óleo"));
      UI.modal("Registrar custo — " + Util.esc(fr.nome), corpo, [
        { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
        { texto: "Lançar no Financeiro", classe: "primary", onClick: function () {
          if (Gestao._bloqueado()) return;
          var valor = nv("g-cvalor"); if (!(valor > 0)) { UI.toast("Informe o valor do custo.", "erro"); return; }
          var ct = v("g-ctipo"), data = v("g-data"), km = nv("g-ckm"), obraId = v("g-cobra"), desc = v("g-cdesc");
          Store.salvar(eid(), "frota_mov", { frotaId: fr.id, frotaNome: fr.nome, tipo: ct, valor: valor, km: km, data: data, obraId: obraId, descricao: desc });
          if (km) { fr.km = km; Store.salvar(eid(), "frota", fr); }
          Store.salvar(eid(), "financeiro", { data: data, desc: rot(P.frotaCusto, ct) + " - " + fr.nome + (desc ? " (" + desc + ")" : ""), tipo: "despesa", categoria: "equipamento", valor: valor, status: "pago", obraId: obraId, fornecedor: fr.nome });
          UI.fecharModal(); App.render(); UI.toast("Custo lançado no Financeiro.", "ok");
        } }
      ]);
    },

renderRequisicoes: function () {
      var rs = lista("requisicoes"), obras = lista("obras");
      var abertas = rs.filter(function (r) { return r.status === "aberta" || r.status === "cotando"; }).length;
      var urgentes = rs.filter(function (r) { return r.prioridade === "urgente" && r.status !== "comprada" && r.status !== "cancelada"; }).length;
      var extra = '<span class="muted" style="margin-right:12px;align-self:center">Abertas: <b>' + abertas + "</b> · Urgentes: <b>" + urgentes + "</b></span>";
      var html = this._head(svg("requisicoes") + "Requisições", "nova-requisicoes", "Nova requisição", extra);
      if (!rs.length) return html + vazioBox("Nenhuma requisição", "nova-requisicoes", "Criar primeira");
      html += '<table class="tbl"><thead><tr><th>Nº</th><th>Data</th><th>Obra</th><th>Descrição</th><th>Prioridade</th><th>Status</th><th></th></tr></thead><tbody>';
      rs.forEach(function (r) {
        var ob = obras.filter(function (o) { return o.id === r.obraId; })[0];
        var acoes = "";
        if (r.status !== "aprovada" && r.status !== "comprada" && r.status !== "cancelada") acoes += '<button class="btn sm" data-gacao="aprovar-requisicao" data-id="' + r.id + '">Aprovar</button> ';
        if (r.status !== "comprada" && r.status !== "cancelada") acoes += '<button class="btn sm primary" data-gacao="comprar-requisicao" data-id="' + r.id + '">Gerar pedido</button>';
        var corPri = r.prioridade === "urgente" ? "#dc2626" : (r.prioridade === "alta" ? "#ea580c" : "#64748b");
        html += '<tr><td style="cursor:pointer" data-gopen="requisicoes:' + r.id + '"><b>' + Util.esc(r.numero || "—") + "</b></td><td>" + Util.esc(r.data || "—") + "</td><td>" + Util.esc(ob ? ob.nome : "—") + '</td><td>' + Util.esc(r.descricao || "—") + '</td><td><b style="color:' + corPri + '">' + rot(P.reqPrioridade, r.prioridade) + "</b></td><td>" + pill(r.status) + '</td><td class="num">' + acoes + "</td></tr>";
      });
      return html + "</tbody></table>";
    },
    _proxNumeroReq: function () {
      var rs = lista("requisicoes"), ano = new Date().getFullYear(), max = 0;
      rs.forEach(function (r) {
        var m = /REQ-(\d{4})-(\d+)/.exec(r.numero || "");
        if (m && Util.num(m[1]) === ano) { var n = Util.num(m[2]); if (n > max) max = n; }
      });
      var seq = max + 1, pad = "" + seq; while (pad.length < 3) pad = "0" + pad;
      return "REQ-" + ano + "-" + pad;
    },
    novoRequisicoes: function () { this.formRequisicoes(null); },
    formRequisicoes: function (r) {
      r = r || {}; var obras = lista("obras"), hoje = new Date().toISOString().slice(0, 10);
      var numero = r.numero || this._proxNumeroReq();
      var corpo =
        '<div class="row">' + campo("Número", inp("g-numero", numero)) + campo("Data", inp("g-data", r.data || hoje, "", "date")) + campo("Obra", sel("g-obra", optsRec(obras, "nome", r.obraId, "— nenhuma —"))) + "</div>" +
        '<div class="row">' + campo("Solicitante", inp("g-solic", r.solicitante)) + campo("Prioridade", sel("g-prioridade", opts(P.reqPrioridade, r.prioridade || "normal"))) + campo("Status", sel("g-status", opts(P.reqStatus, r.status || "aberta"))) + "</div>" +
        '<div class="row">' + campo("Quantidade", inp("g-qtd", r.quantidade, "", "number")) + campo("Unidade", sel("g-unid", opts(P.reqUnidade, r.unidade || "un"))) + "</div>" +
        campo("Descrição *", '<textarea id="g-descricao" rows="2">' + Util.esc(r.descricao || "") + "</textarea>") +
        campo("Observações", '<textarea id="g-obs" rows="2">' + Util.esc(r.observacoes || "") + "</textarea>");
      this._modalForm("requisicoes", r, "Requisição de compra", corpo, function (obj) {
        obj.descricao = v("g-descricao"); if (!obj.descricao) { UI.toast("Informe a descrição.", "erro"); return false; }
        obj.numero = v("g-numero"); obj.data = v("g-data"); obj.obraId = v("g-obra"); obj.solicitante = v("g-solic");
        obj.prioridade = v("g-prioridade"); obj.status = v("g-status"); obj.quantidade = v("g-qtd"); obj.unidade = v("g-unid"); obj.observacoes = v("g-obs");
        return true;
      });
    },
    aprovarRequisicao: function (id) {
      if (this._bloqueado()) return;
      var r = Store.obter(eid(), "requisicoes", id); if (!r) return;
      r.status = "aprovada"; Store.salvar(eid(), "requisicoes", r); App.render(); UI.toast("Requisição aprovada.", "ok");
    },
    comprarRequisicao: function (id) {
      var r = Store.obter(eid(), "requisicoes", id); if (!r) return;
      var obras = lista("obras");
      var corpo =
        '<div class="row">' + campo("Descrição", inp("g-pdesc", r.descricao)) + campo("Valor (R$)", inp("g-pvalor", "", "", "number")) + "</div>" +
        '<div class="row">' + campo("Obra", sel("g-pobra", optsRec(obras, "nome", r.obraId, "— nenhuma —"))) + "</div>" +
        '<p class="muted">Cria um pedido em Compras (status Cotação) e marca a requisição como comprada.</p>';
      UI.modal("Gerar pedido — " + Util.esc(r.numero || ""), corpo, [
        { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
        { texto: "Criar pedido", classe: "primary", onClick: function () {
          if (Gestao._bloqueado()) return;
          var desc = v("g-pdesc"); if (!desc) { UI.toast("Informe a descrição.", "erro"); return; }
          var pc = "PC-" + new Date().getFullYear() + "-" + ("" + (new Date().getTime())).slice(-4);
          Store.salvar(eid(), "compras", { numero: pc, descricao: desc, obraId: v("g-pobra"), valor: nv("g-pvalor"), status: "cotacao", categoria: "material" });
          r.status = "comprada"; Store.salvar(eid(), "requisicoes", r);
          UI.fecharModal(); App.render(); UI.toast("Pedido " + pc + " criado.", "ok");
        } }
      ]);
    },

renderFiscal: function () {
      var nfs = lista("fiscal"), obras = lista("obras");
      var totEnt = nfs.filter(function (n) { return n.tipo === "entrada" && n.status === "emitida"; }).reduce(function (s, n) { return s + Util.num(n.valorTotal); }, 0);
      var totSai = nfs.filter(function (n) { return n.tipo === "saida" && n.status === "emitida"; }).reduce(function (s, n) { return s + Util.num(n.valorTotal); }, 0);
      var extra = '<span class="muted" style="margin-right:12px;align-self:center">Entradas: <b>' + Util.fmtMoeda(totEnt) + "</b> · Saídas: <b>" + Util.fmtMoeda(totSai) + "</b></span>";
      var html = this._head(svg("fiscal") + "Fiscal / NF-e", "nova-fiscal", "Nova nota", extra);
      if (!nfs.length) return html + vazioBox("Nenhuma nota fiscal", "nova-fiscal", "Cadastrar primeira");
      html += '<table class="tbl"><thead><tr><th>Nº</th><th>Tipo</th><th>Parceiro</th><th>Obra</th><th class="num">Valor</th><th>Status</th><th></th></tr></thead><tbody>';
      nfs.forEach(function (n) {
        var ob = obras.filter(function (o) { return o.id === n.obraId; })[0];
        var numTxt = n.numero ? n.numero : "—";
        if (n.serie) numTxt += "/" + n.serie;
        var btn = n.status === "emitida" ? '<button class="btn sm primary" data-gacao="lancar-fiscal" data-id="' + n.id + '">Lançar</button>' : "";
        html += '<tr><td style="cursor:pointer" data-gopen="fiscal:' + n.id + '"><b>' + Util.esc(numTxt) + "</b></td><td>" + rot(P.fiscalTipo, n.tipo) + "</td><td>" + Util.esc(n.parceiro || "—") + "</td><td>" + Util.esc(ob ? ob.nome : "—") + '</td><td class="num">' + Util.fmtMoeda(Util.num(n.valorTotal)) + "</td><td>" + pill(n.status) + '</td><td class="num">' + btn + "</td></tr>";
      });
      return html + "</tbody></table>";
    },
    novoFiscal: function () { this.formFiscal(null); },
    formFiscal: function (n) {
      n = n || {}; var obras = lista("obras");
      var corpo =
        '<div class="row">' + campo("Número", inp("g-numero", n.numero)) + campo("Série", inp("g-serie", n.serie)) + campo("Tipo", sel("g-tipo", opts(P.fiscalTipo, n.tipo || "entrada"))) + campo("Status", sel("g-status", opts(P.fiscalStatus, n.status || "emitida"))) + "</div>" +
        '<div class="row">' + campo("Natureza da operação", inp("g-natop", n.naturezaOp)) + campo("Parceiro (fornecedor/cliente)", inp("g-parceiro", n.parceiro)) + "</div>" +
        '<div class="row">' + campo("Obra", sel("g-obra", optsRec(obras, "nome", n.obraId, "— nenhuma —"))) + campo("Data de emissão", inp("g-data", n.dataEmissao, "", "date")) + "</div>" +
        '<div class="row">' + campo("Valor produtos (R$)", inp("g-vprod", n.valorProdutos)) + campo("Valor impostos (R$)", inp("g-vimp", n.valorImpostos)) + campo("Valor total (R$) *", inp("g-vtot", n.valorTotal)) + "</div>" +
        campo("Chave de acesso", inp("g-chave", n.chaveAcesso));
      this._modalForm("fiscal", n, "Nota fiscal", corpo, function (obj) {
        obj.numero = v("g-numero"); obj.serie = v("g-serie"); obj.tipo = v("g-tipo"); obj.status = v("g-status");
        obj.naturezaOp = v("g-natop"); obj.parceiro = v("g-parceiro"); obj.obraId = v("g-obra"); obj.dataEmissao = v("g-data");
        obj.valorProdutos = nv("g-vprod"); obj.valorImpostos = nv("g-vimp"); obj.valorTotal = nv("g-vtot"); obj.chaveAcesso = v("g-chave");
        if (!(obj.valorTotal > 0)) { UI.toast("Informe o valor total.", "erro"); return false; }
        return true;
      });
    },
    lancarFiscal: function (fiscalId) {
      var nf = Store.obter(eid(), "fiscal", fiscalId); if (!nf) return;
      var isEntrada = nf.tipo === "entrada";
      var tipoFin = isEntrada ? "despesa" : "receita";
      var categoria = isEntrada ? "material" : "outros";
      var numTxt = nf.numero ? nf.numero : "s/n";
      if (nf.serie) numTxt += "/" + nf.serie;
      var corpo = '<p class="muted">NF nº <b>' + Util.esc(numTxt) + "</b> · " + rot(P.fiscalTipo, nf.tipo) + " · Valor: <b>" + Util.fmtMoeda(Util.num(nf.valorTotal)) + "</b></p><p>Gerar um lançamento de <b>" + (isEntrada ? "despesa" : "receita") + "</b> no Financeiro?</p>";
      UI.modal("Lançar NF no Financeiro", corpo, [
        { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
        { texto: "Lançar no Financeiro", classe: "primary", onClick: function () {
          if (Gestao._bloqueado()) return;
          var valor = Util.num(nf.valorTotal); if (!(valor > 0)) { UI.toast("Valor inválido.", "erro"); return; }
          var hoje = new Date().toISOString().slice(0, 10);
          Store.salvar(eid(), "financeiro", { data: nf.dataEmissao || hoje, desc: "NF nº " + numTxt, tipo: tipoFin, categoria: categoria, valor: valor, status: "pago", obraId: nf.obraId || "" });
          UI.fecharModal(); App.render(); UI.toast("NF lançada no Financeiro.", "ok");
        } }
      ]);
    },

renderPatrimonio: function () {
      var ps = lista("patrimonio"), obras = lista("obras"), hojeAno = new Date().getFullYear();
      var totalAquisicao = 0, totalAtual = 0;
      var calcAtual = function (p) {
        var vaq = Util.num(p.valorAquisicao);
        if (p.estado === "baixado") return 0;
        var dep = Util.num(p.depreciacaoAnual);
        if (!(dep > 0) || !p.dataAquisicao) return vaq;
        var anoAq = parseInt(String(p.dataAquisicao).slice(0, 4), 10);
        var anos = hojeAno - anoAq; if (!(anos > 0)) return vaq;
        var atual = vaq - (vaq * (dep / 100) * anos);
        return atual < 0 ? 0 : atual;
      };
      ps.forEach(function (p) { totalAquisicao += Util.num(p.valorAquisicao); totalAtual += calcAtual(p); });
      var extra = '<span class="muted" style="margin-right:12px;align-self:center">Aquisição: <b>' + Util.fmtMoeda(totalAquisicao) + "</b> · Valor atual: <b>" + Util.fmtMoeda(totalAtual) + "</b></span>";
      var html = this._head(svg("patrimonio") + "Patrimônio", "novo-patrimonio", "Novo bem", extra);
      if (!ps.length) return html + vazioBox("Nenhum bem cadastrado", "novo-patrimonio", "Cadastrar primeiro");
      html += '<table class="tbl"><thead><tr><th>Descrição</th><th>Categoria</th><th>Nº</th><th class="num">Aquisição (R$)</th><th class="num">Valor atual</th><th>Estado</th></tr></thead><tbody>';
      ps.forEach(function (p) {
        html += '<tr><td style="cursor:pointer" data-gopen="patrimonio:' + p.id + '"><b>' + Util.esc(p.descricao) + "</b></td><td>" + rot(P.patrimonioCategoria, p.categoria) + "</td><td>" + Util.esc(p.numeroPatrimonio || "—") + '</td><td class="num">' + Util.fmtMoeda(Util.num(p.valorAquisicao)) + '</td><td class="num">' + Util.fmtMoeda(calcAtual(p)) + "</td><td>" + pill(p.estado) + "</td></tr>";
      });
      return html + "</tbody></table>";
    },
    novoPatrimonio: function () { this.formPatrimonio(null); },
    formPatrimonio: function (p) {
      p = p || {}; var obras = lista("obras"), hoje = new Date().toISOString().slice(0, 10);
      var corpo =
        '<div class="row">' + campo("Descrição *", inp("g-desc", p.descricao)) + campo("Categoria", sel("g-cat", opts(P.patrimonioCategoria, p.categoria || "movel"))) + campo("Nº Patrimônio", inp("g-num", p.numeroPatrimonio)) + "</div>" +
        '<div class="row">' + campo("Valor aquisição (R$)", inp("g-vaq", p.valorAquisicao)) + campo("Data aquisição", inp("g-data", p.dataAquisicao || hoje, "", "date")) + campo("Depreciação anual (%)", inp("g-dep", p.depreciacaoAnual)) + "</div>" +
        '<div class="row">' + campo("Estado", sel("g-estado", opts(P.patrimonioEstado, p.estado || "novo"))) + campo("Obra", sel("g-obra", optsRec(obras, "nome", p.obraId, "— nenhuma —"))) + campo("Localização", inp("g-loc", p.localizacao)) + "</div>" +
        campo("Observações", '<textarea id="g-obs" rows="2">' + Util.esc(p.obs || "") + "</textarea>");
      this._modalForm("patrimonio", p, "Bem patrimonial", corpo, function (obj) {
        obj.descricao = v("g-desc"); if (!obj.descricao) { UI.toast("Informe a descrição.", "erro"); return false; }
        obj.categoria = v("g-cat"); obj.numeroPatrimonio = v("g-num"); obj.valorAquisicao = nv("g-vaq"); obj.dataAquisicao = v("g-data"); obj.depreciacaoAnual = nv("g-dep"); obj.estado = v("g-estado"); obj.obraId = v("g-obra"); obj.localizacao = v("g-loc"); obj.obs = v("g-obs");
        return true;
      });
    },

renderCentrocusto: function () {
      var ccs = lista("centrocusto"), obras = lista("obras"), fin = lista("financeiro");
      var totOrcado = ccs.reduce(function (s, c) { return s + Util.num(c.valorOrcado); }, 0);
      var realPorObra = {};
      fin.forEach(function (f) {
        if (f.tipo === "despesa" && f.obraId) { realPorObra[f.obraId] = (realPorObra[f.obraId] || 0) + Util.num(f.valor); }
      });
      var totReal = ccs.reduce(function (s, c) { return s + (realPorObra[c.obraId] || 0); }, 0);
      var totSaldo = totOrcado - totReal;
      var corTot = totSaldo >= 0 ? "#16a34a" : "#ef4444";
      var extra = '<span class="muted" style="margin-right:12px;align-self:center">Orçado: <b>' + Util.fmtMoeda(totOrcado) + "</b> · Realizado: <b>" + Util.fmtMoeda(totReal) + '</b> · Saldo: <b style="color:' + corTot + '">' + Util.fmtMoeda(totSaldo) + "</b></span>";
      var html = this._head(svg("centrocusto") + "Centros de Custo", "novo-centrocusto", "Novo centro", extra);
      if (!ccs.length) return html + vazioBox("Nenhum centro de custo", "novo-centrocusto", "Cadastrar primeiro");
      html += '<table class="tbl"><thead><tr><th>Código</th><th>Nome</th><th>Tipo</th><th>Obra</th><th class="num">Orçado</th><th class="num">Realizado</th><th class="num">Saldo</th></tr></thead><tbody>';
      ccs.forEach(function (c) {
        var ob = obras.filter(function (o) { return o.id === c.obraId; })[0];
        var orcado = Util.num(c.valorOrcado);
        var real = realPorObra[c.obraId] || 0;
        var saldo = orcado - real;
        var corSaldo = saldo >= 0 ? "#16a34a" : "#ef4444";
        html += '<tr style="cursor:pointer" data-gopen="centrocusto:' + c.id + '"><td><b>' + Util.esc(c.codigo || "—") + "</b></td><td>" + Util.esc(c.nome) + "</td><td>" + rot(P.centrocustoTipo, c.tipo) + "</td><td>" + Util.esc(ob ? ob.nome : "—") + '</td><td class="num">' + Util.fmtMoeda(orcado) + '</td><td class="num">' + Util.fmtMoeda(real) + '</td><td class="num" style="color:' + corSaldo + ';font-weight:600">' + Util.fmtMoeda(saldo) + "</td></tr>";
      });
      return html + "</tbody></table>";
    },
    novoCentrocusto: function () { this.formCentrocusto(null); },
    formCentrocusto: function (c) {
      c = c || {}; var obras = lista("obras");
      var corpo =
        '<div class="row">' + campo("Código", inp("g-codigo", c.codigo)) + campo("Nome *", inp("g-nome", c.nome)) + "</div>" +
        '<div class="row">' + campo("Tipo", sel("g-tipo", opts(P.centrocustoTipo, c.tipo || "direto"))) + campo("Obra", sel("g-obra", optsRec(obras, "nome", c.obraId, "— nenhuma —"))) + campo("Valor orçado (R$)", inp("g-orcado", c.valorOrcado)) + "</div>" +
        campo("Observações", '<textarea id="g-obs" rows="2">' + Util.esc(c.obs || "") + "</textarea>");
      this._modalForm("centrocusto", c, "Centro de custo", corpo, function (obj) {
        obj.nome = v("g-nome"); if (!obj.nome) { UI.toast("Informe o nome.", "erro"); return false; }
        obj.codigo = v("g-codigo"); obj.tipo = v("g-tipo"); obj.obraId = v("g-obra"); obj.valorOrcado = nv("g-orcado"); obj.obs = v("g-obs");
        return true;
      });
    },

renderFolha: function () {
      var fls = lista("folha"), cols = lista("colaboradores"), obras = lista("obras");
      var totalCusto = fls.reduce(function (s, f) { return s + Util.num(f.custoTotal); }, 0);
      var abertas = fls.filter(function (f) { return f.status === "aberta"; }).length;
      var extra = '<span class="muted" style="margin-right:12px;align-self:center">Abertas: <b>' + abertas + "</b> · Custo total: <b>" + Util.fmtMoeda(totalCusto) + "</b></span>";
      var html = this._head(svg("folha") + "Folha / Encargos", "nova-folha", "Nova folha", extra);
      if (!fls.length) return html + vazioBox("Nenhuma folha lançada", "nova-folha", "Cadastrar primeira");
      html += '<table class="tbl"><thead><tr><th>Competência</th><th>Colaborador</th><th>Obra</th><th class="num">Base</th><th class="num">Custo total</th><th>Status</th><th></th></tr></thead><tbody>';
      fls.forEach(function (f) {
        var col = cols.filter(function (c) { return c.id === f.colaboradorId; })[0];
        var ob = obras.filter(function (o) { return o.id === f.obraId; })[0];
        var acao = f.status === "aberta" ? '<button class="btn sm primary" data-gacao="lancar-folha-enc" data-id="' + f.id + '">Lançar</button>' : "";
        html += '<tr><td style="cursor:pointer" data-gopen="folha:' + f.id + '"><b>' + Util.esc(f.competencia || "—") + "</b></td><td>" + Util.esc(col ? col.nome : "—") + "</td><td>" + Util.esc(ob ? ob.nome : "—") + '</td><td class="num">' + Util.fmtMoeda(Util.num(f.salarioBase)) + '</td><td class="num"><b>' + Util.fmtMoeda(Util.num(f.custoTotal)) + "</b></td><td>" + pill(f.status) + '</td><td class="num">' + acao + "</td></tr>";
      });
      return html + "</tbody></table>";
    },
    calcFolha: function (f) {
      var base = Util.num(f.salarioBase), enc = Util.num(f.encargosPct), he = Util.num(f.horasExtras), desc = Util.num(f.descontos);
      return base + base * enc / 100 + he - desc;
    },
    novoFolha: function () { this.formFolha(null); },
    formFolha: function (f) {
      f = f || {}; var cols = lista("colaboradores"), obras = lista("obras");
      var mesAtual = new Date().toISOString().slice(0, 7);
      var corpo =
        '<div class="row">' + campo("Competência *", inp("g-comp", f.competencia || mesAtual, "", "month")) + campo("Colaborador", sel("g-col", optsRec(cols, "nome", f.colaboradorId, "— nenhum —"))) + campo("Obra", sel("g-obra", optsRec(obras, "nome", f.obraId, "— nenhuma —"))) + "</div>" +
        '<div class="row">' + campo("Salário base (R$)", inp("g-base", f.salarioBase)) + campo("Encargos (%)", inp("g-enc", f.encargosPct || 68)) + "</div>" +
        '<div class="row">' + campo("Horas extras (R$)", inp("g-he", f.horasExtras)) + campo("Descontos (R$)", inp("g-desc", f.descontos)) + campo("Status", sel("g-status", opts(P.folhaStatus, f.status || "aberta"))) + "</div>" +
        '<div class="muted" style="margin-top:6px">Custo total atual: <b>' + Util.fmtMoeda(Util.num(f.custoTotal)) + "</b> (recalculado ao salvar).</div>";
      this._modalForm("folha", f, "Folha de pagamento", corpo, function (obj) {
        obj.competencia = v("g-comp"); if (!obj.competencia) { UI.toast("Informe a competência.", "erro"); return false; }
        obj.colaboradorId = v("g-col"); obj.obraId = v("g-obra");
        obj.salarioBase = nv("g-base"); obj.encargosPct = nv("g-enc"); obj.horasExtras = nv("g-he"); obj.descontos = nv("g-desc");
        obj.status = v("g-status");
        obj.custoTotal = Gestao.calcFolha(obj);
        return true;
      });
    },
    lancarFolhaEnc: function (folhaId) {
      var fl = Store.obter(eid(), "folha", folhaId); if (!fl) return;
      var cols = lista("colaboradores");
      var col = cols.filter(function (c) { return c.id === fl.colaboradorId; })[0];
      var nomeCol = col ? col.nome : "Sem colaborador";
      var custo = Gestao.calcFolha(fl);
      UI.modal("Lançar folha — " + Util.esc(fl.competencia || ""), '<p>Confirmar lançamento da folha de <b>' + Util.esc(nomeCol) + '</b> (' + Util.esc(fl.competencia || "") + ') no Financeiro?</p><p class="muted">Despesa (mão de obra): <b>' + Util.fmtMoeda(custo) + "</b></p>", [
        { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
        { texto: "Lançar no Financeiro", classe: "primary", onClick: function () {
          if (Gestao._bloqueado()) return;
          if (!(custo > 0)) { UI.toast("Custo total inválido.", "erro"); return; }
          var hoje = new Date().toISOString().slice(0, 10);
          fl.status = "lancada"; fl.custoTotal = custo;
          Store.salvar(eid(), "folha", fl);
          Store.salvar(eid(), "financeiro", { data: hoje, desc: "Folha " + (fl.competencia || "") + " - " + nomeCol, tipo: "despesa", categoria: "mao_obra", valor: custo, status: "pago", obraId: fl.obraId });
          UI.fecharModal(); App.render(); UI.toast("Folha lançada.", "ok");
        } }
      ]);
    },

renderRelatorios: function () {
      var fin = lista("financeiro"), obras = lista("obras"), contratos = lista("contratos");
      var totRec = 0, totDesp = 0;
      fin.forEach(function (l) {
        if (l.tipo === "receita") totRec += Util.num(l.valor);
        else if (l.tipo === "despesa") totDesp += Util.num(l.valor);
      });
      var resultado = totRec - totDesp;
      var html = this._head(svg("relatorios") + "Relatórios Gerenciais", "", "", "");
      html += '<div class="kpis">';
      html += '<div class="kpi"><span class="rotulo">Receitas totais</span><span class="num">' + Util.fmtMoeda(totRec) + "</span></div>";
      html += '<div class="kpi"><span class="rotulo">Despesas totais</span><span class="num">' + Util.fmtMoeda(totDesp) + "</span></div>";
      html += '<div class="kpi"><span class="rotulo">Resultado</span><span class="num" style="color:' + (resultado >= 0 ? "#16a34a" : "#dc2626") + '">' + Util.fmtMoeda(resultado) + "</span></div>";
      html += "</div>";
      html += '<div class="card"><h3>Resultado por obra</h3>';
      if (!obras.length) {
        html += vazioBox("Nenhuma obra cadastrada", "", "");
      } else {
        html += '<table class="tbl"><thead><tr><th>Obra</th><th class="num">Contratado</th><th class="num">Custo</th><th class="num">Recebido</th><th class="num">Margem %</th></tr></thead><tbody>';
        obras.forEach(function (o) {
          var contratado = 0, custo = 0, recebido = 0;
          contratos.forEach(function (c) { if (c.obraId === o.id) contratado += Util.num(c.valor); });
          fin.forEach(function (l) {
            if (l.obraId !== o.id) return;
            if (l.tipo === "despesa") custo += Util.num(l.valor);
            else if (l.tipo === "receita") recebido += Util.num(l.valor);
          });
          var margem = contratado > 0 ? (contratado - custo) / contratado * 100 : 0;
          html += "<tr><td><b>" + Util.esc(o.nome) + '</b></td><td class="num">' + Util.fmtMoeda(contratado) + '</td><td class="num">' + Util.fmtMoeda(custo) + '</td><td class="num">' + Util.fmtMoeda(recebido) + '</td><td class="num" style="color:' + (margem >= 0 ? "#16a34a" : "#dc2626") + '">' + Util.fmtPct(margem, 1) + "</td></tr>";
        });
        html += "</tbody></table>";
      }
      html += "</div>";
      html += '<div class="card"><h3>Despesas por categoria</h3>';
      var porCat = {};
      fin.forEach(function (l) {
        if (l.tipo !== "despesa") return;
        var cat = l.categoria || "outros";
        porCat[cat] = (porCat[cat] || 0) + Util.num(l.valor);
      });
      var cats = [];
      for (var k in porCat) { if (porCat.hasOwnProperty(k)) cats.push(k); }
      if (!cats.length) {
        html += vazioBox("Nenhuma despesa lançada", "", "");
      } else {
        cats.sort(function (a, b) { return porCat[b] - porCat[a]; });
        html += '<table class="tbl"><thead><tr><th>Categoria</th><th class="num">Valor</th><th class="num">%</th></tr></thead><tbody>';
        cats.forEach(function (cat) {
          var val = porCat[cat];
          var pct = totDesp > 0 ? val / totDesp * 100 : 0;
          html += "<tr><td>" + Util.esc(rot(P.finCategoria, cat)) + '</td><td class="num">' + Util.fmtMoeda(val) + '</td><td class="num">' + Util.fmtPct(pct, 1) + "</td></tr>";
        });
        html += "</tbody></table>";
      }
      html += "</div>";
      return html;
    },

    // ---------- Modal genérico de formulário (salvar/excluir) ----------
    _modalForm: function (entidade, registro, titulo, corpo, coletar) {
      var self = this, ehNovo = !registro.id;
      var botoes = [{ texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } }];
      if (!ehNovo) botoes.push({ texto: "🗑 Excluir", classe: "danger", onClick: function () {
        if (self._bloqueado()) return;
        if (confirm("Excluir este registro? Não pode ser desfeito.")) { Store.excluir(eid(), entidade, registro.id); UI.fecharModal(); App.render(); UI.toast(titulo + " excluído.", "ok"); }
      } });
      botoes.push({ texto: ehNovo ? "Salvar" : "Salvar alterações", classe: "primary", onClick: function () {
        if (self._bloqueado()) return;
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

    // Modo demonstração: abrir formulários é livre; QUALQUER gravação exige licença ativa.
    _bloqueado: function () {
      if (typeof App !== "undefined" && App._trialBloqueado && App._trialBloqueado()) {
        UI.toast("🔒 Modo demonstração — ative sua licença (🔓, no topo) para salvar.", "erro");
        return true;
      }
      return false;
    },

    // A Gestão de Obras é da versão PLUS. Demonstração (sem licença) explora à vontade; base = só orçamento.
    podeGestao: function () {
      if (typeof Licenca === "undefined") return true;
      var s = Licenca.status() || {};
      if (s.trial) return true;               // demonstração: explora a gestão (mas não salva)
      return !!s.ativo && s.tier !== "base";  // licenciado: só Plus (tier vazio = compra antiga = liberado)
    },
    _upsell: function () {
      var url = (typeof CONFIG !== "undefined" && CONFIG.licencaServer ? String(CONFIG.licencaServer).replace(/\/$/, "") : "") + "/?plano=plus_vitalicia";
      var cd = "";
      try { var fim = new Date(CONFIG.ofertaFim).getTime(), ms = fim - Date.now(); if (ms > 0) { var dd = Math.floor(ms / 86400000), hh = Math.floor((ms % 86400000) / 3600000); cd = "⏳ Termina em " + (dd > 0 ? dd + (dd === 1 ? " dia" : " dias") + " e " + hh + "h" : hh + "h") + " — garanta agora."; } } catch (e) {}
      var precoTxt = cd ? "R$ 1.997" : "R$ 2.997";
      var mods = ["Obras", "Contratos", "Medições", "Financeiro", "Fornecedores", "Compras", "Estoque", "Diário (RDO)", "Colaboradores", "Ponto/Folha", "Frota"];
      var pills = mods.map(function (m) { return '<span style="background:#eef4fb;border:1px solid #d7e6f5;color:#143454;font-size:12.5px;font-weight:600;padding:5px 11px;border-radius:8px">' + m + "</span>"; }).join("");
      var html =
        '<div style="text-align:center;margin-bottom:12px"><span style="display:inline-block;background:linear-gradient(135deg,#f59e0b,#f97316);color:#fff;font-weight:800;font-size:12px;letter-spacing:.5px;padding:6px 16px;border-radius:99px;box-shadow:0 5px 14px rgba(249,115,22,.35)">' + (cd ? "🚀 OFERTA DE LANÇAMENTO" : "⭐ VERSÃO PLUS") + '</span></div>' +
        '<p style="font-size:15.5px;color:#334155;text-align:center;margin-bottom:14px">Você já monta orçamentos com IA. Agora <b>gerencie a obra inteira</b> — do contrato à medição, com a <b>margem em tempo real</b>. É a <b>versão Plus</b>:</p>' +
        '<div style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-bottom:14px">' + pills + "</div>" +
        '<div style="background:#eef7ff;border:1px solid #d3e6fb;border-radius:12px;padding:13px 16px;text-align:center;color:#143454;font-size:14px;margin-bottom:14px">📊 <b>Custo real × contratado</b> e <b>margem de cada obra</b>, sem planilha, num lugar só.</div>' +
        '<div style="text-align:center;background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:14px 16px">' +
          (cd ? '<div style="font-size:12px;color:#c2410c;font-weight:800;letter-spacing:.4px;margin-bottom:5px">🔥 CONDIÇÃO DE LANÇAMENTO</div>' : "") +
          '<span style="color:#94a3b8;text-decoration:line-through;font-size:15px">de R$ 2.997</span> &nbsp;<span style="font-size:32px;font-weight:900;color:#16a34a">' + precoTxt + '</span> <span style="color:#64748b;font-size:13px">único, pra sempre</span>' +
          (cd ? '<div style="color:#9a3412;font-size:12.5px;margin-top:6px;font-weight:700">' + cd + "</div>" : "") +
          '<div style="color:#64748b;font-size:12px;margin-top:4px">🛡️ Garantia de 7 dias · PIX, cartão ou boleto</div>' +
        "</div>";
      var bg = UI.modal("Desbloquear a Gestão de Obras", html, [
        { texto: "Agora não", classe: "ghost", onClick: function () { UI.fecharModal(); } },
        { texto: "⭐ Garantir o Plus agora", classe: "primary", onClick: function () { try { window.open(url, "_blank"); } catch (e) {} UI.fecharModal(); } }
      ]);
      var m = bg && bg.querySelector(".modal"); if (m) m.style.maxWidth = "540px";
    },

    // ---------- Dispatcher de ações (chamado pelo app.js) ----------
    acao: function (gacao, dataset, app) {
      var id = dataset.id;
      if (gacao.indexOf("novo") !== 0 && gacao !== "custo-frota" && this._bloqueado()) return;
      switch (gacao) {
        case "upsell-plus": return this._upsell();
        case "portal-obra": return this.portalObra(id);
        case "doc-financeiro": return this.lancarDocumento();
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
        case "novo-fornecedor": return this.novoFornecedor();
        case "nova-compra": return this.novoCompra();
        case "novo-item-estoque": return this.novoItemEstoque();
        case "aprovar-compra": {
          var pc = Store.obter(eid(), "compras", id); if (!pc) return;
          pc.status = "aprovado"; Store.salvar(eid(), "compras", pc); App.render(); UI.toast("Pedido de compra aprovado.", "ok"); return;
        }
        case "receber-compra": {
          var pcr = Store.obter(eid(), "compras", id); if (!pcr) return;
          pcr.status = "recebido"; pcr.dataRecebimento = new Date().toISOString().slice(0, 10); Store.salvar(eid(), "compras", pcr);
          Store.salvar(eid(), "financeiro", { data: pcr.dataRecebimento, desc: "Compra " + (pcr.numero || "") + " — " + (pcr.descricao || ""), tipo: "despesa", categoria: pcr.categoria || "material", valor: Util.num(pcr.valor), status: "pendente", obraId: pcr.obraId, fornecedor: pcr.fornecedorNome, formaPgto: pcr.formaPgto });
          App.render(); UI.toast("Compra recebida e despesa lançada no Financeiro (pendente).", "ok"); return;
        }
        case "entrada-estoque": return this._movEstoque(id, "entrada");
        case "saida-estoque": return this._movEstoque(id, "saida");
        case "novo-rdo": return this.novoRdo();
        case "finalizar-rdo": {
          var rd = Store.obter(eid(), "rdo", id); if (!rd) return;
          rd.status = "finalizado"; Store.salvar(eid(), "rdo", rd); App.render(); UI.toast("Diário finalizado.", "ok"); return;
        }
        case "novo-colaborador": return this.novoColaborador();
        case "novo-ponto": return this.novoPonto();
        case "lancar-ponto": {
          var pt = Store.obter(eid(), "ponto", id); if (!pt) return;
          pt.status = "lancado"; pt.dataLancamento = new Date().toISOString().slice(0, 10); Store.salvar(eid(), "ponto", pt);
          Store.salvar(eid(), "financeiro", { data: pt.dataLancamento, desc: "Folha " + (pt.competencia || "") + " — " + (pt.colaboradorNome || ""), tipo: "despesa", categoria: "mao_obra", valor: Util.num(pt.valor), status: "pago", obraId: pt.obraId });
          App.render(); UI.toast("Folha lançada no Financeiro (mão de obra).", "ok"); return;
        }
        case "nova-frota": return this.novoFrota();
        case "custo-frota": return this.formCustoFrota(id);
case "nova-requisicoes": return this.novoRequisicoes();
        case "aprovar-requisicao": return this.aprovarRequisicao(id);
        case "comprar-requisicao": return this.comprarRequisicao(id);
case "nova-fiscal": return this.novoFiscal();
        case "lancar-fiscal": return this.lancarFiscal(id);
case "novo-patrimonio": return this.novoPatrimonio();
case "novo-centrocusto": return this.novoCentrocusto();
case "nova-folha": return this.novoFolha();
        case "lancar-folha-enc": return this.lancarFolhaEnc(id);
      }
    },
    // ---------- Portal do Cliente: publica o resumo da obra na nuvem ----------
    portalObra: function (id) {
      if (this._bloqueado()) return;
      var obra = Store.obter(eid(), "obras", id); if (!obra) { UI.toast("Obra não encontrada.", "erro"); return; }
      var url = (typeof CONFIG !== "undefined" && CONFIG.licencaServer ? String(CONFIG.licencaServer).replace(/\/$/, "") : "");
      var chave = (typeof Licenca !== "undefined" && Licenca.chave) ? Licenca.chave() : "";
      if (!chave) { UI.toast("Ative sua licença pra publicar no Portal do Cliente.", "erro"); return; }
      // snapshot CURADO — só o que o cliente pode ver (sem custo interno/margem)
      var meds = lista("medicoes").filter(function (m) { return m.obraId === id; })
        .sort(function (a, b) { return String(a.numero || "").localeCompare(String(b.numero || "")); });
      var acum = 0, medidoAcum = 0;
      var medicoes = meds.map(function (m) {
        acum += Util.num(m.percentual); medidoAcum += Util.num(m.valor);
        return { numero: m.numero || "", data: m.data || m.periodoFim || "", percentual: Util.num(m.percentual), valor: Util.num(m.valor), retencao: Util.num(m.retencao), acumuladoPct: Math.min(100, Math.round(acum * 10) / 10) };
      });
      var rdos = lista("rdo").filter(function (r) { return r.obraId === id && r.status !== "rascunho"; })
        .sort(function (a, b) { return String(b.data || "").localeCompare(String(a.data || "")); })
        .map(function (r) {
          return { numero: r.numero || "", data: r.data || "", climaManha: rot(P.rdoClima, r.climaManha), climaTarde: rot(P.rdoClima, r.climaTarde), condicao: rot(P.rdoCondicao, r.condicao), efetivo: Util.num(r.efetivoDireto) + Util.num(r.efetivoIndireto), atividades: r.atividades || "", ocorrencias: r.ocorrencias || "", equipamentos: r.equipamentos || "", responsavel: r.responsavel || "", autor: r.autor || "", fotos: (r.fotos || []).slice(0, RDO_MAX_FOTOS).map(function (f) { return { d: f.d, leg: f.leg || "" }; }) };
        });
      var contratado = Util.num(obra.valor);
      var pctExec = obra.pctExecutado != null ? Util.num(obra.pctExecutado) : Math.min(100, Math.round(acum * 10) / 10);
      // Curva S (planejado × realizado) + cronograma — do orçamento vinculado à obra
      var curvaS = null, cronograma = [];
      try {
        var orc = obra.orcamentoId ? Store.obterOrcamento(eid(), obra.orcamentoId) : null;
        if (orc && orc.etapas && orc.etapas.length && typeof Orcamento !== "undefined" && Orcamento.cronograma) {
          var cr = Orcamento.cronograma(orc), nM = cr.meses || 6, i;
          var labels = []; for (i = 0; i < nM; i++) labels.push("Mês " + (i + 1));
          var realizado = []; for (i = 0; i < nM; i++) realizado.push(0);
          var iniMs = obra.inicio ? new Date(obra.inicio + "T00:00:00").getTime() : Date.now();
          medicoes.slice().sort(function (a, b) { return String(a.data).localeCompare(String(b.data)); }).forEach(function (m) {
            var mi = 0; if (m.data) { var d = new Date(m.data + "T00:00:00").getTime(); mi = Math.max(0, Math.min(nM - 1, Math.floor((d - iniMs) / (30.44 * 86400000)))); }
            for (var k = mi; k < nM; k++) realizado[k] = m.acumuladoPct;
          });
          curvaS = { labels: labels, planejado: (cr.acumPct || []).slice(), realizado: realizado };
          if (typeof Cronograma !== "undefined" && Cronograma.estimar) {
            var est = Cronograma.estimar(orc), totC = 0, accW = 0;
            (est.etapas || []).forEach(function (e) { totC += Util.num(e.custo); }); totC = totC || 1;
            var addDias = function (ini, wd) { if (!ini) return ""; var d = new Date(ini + "T00:00:00"); d.setDate(d.getDate() + Math.round(Util.num(wd) * 7 / 5)); return d.toISOString().slice(0, 10); };
            cronograma = (est.etapas || []).map(function (e) {
              var w0 = accW / totC, w1 = (accW + Util.num(e.custo)) / totC; accW += Util.num(e.custo);
              var pe = pctExec / 100, p = pe <= w0 ? 0 : (pe >= w1 ? 100 : (pe - w0) / ((w1 - w0) || 1) * 100);
              return { etapa: e.nome, inicio: addDias(obra.inicio, e.inicio), fim: addDias(obra.inicio, e.fim), pct: Math.round(p) };
            });
          }
        }
      } catch (e) { curvaS = null; cronograma = []; }
      var snapshot = {
        obraId: id, nome: obra.nome || "", cliente: obra.clienteNome || "", local: obra.local || "",
        tipo: rot(P.obraTipo, obra.tipo) || "", fase: rot(P.obraFase, obra.fase) || "", status: obra.status || "",
        inicio: obra.inicio || "", termino: obra.termino || "",
        areaConstruida: Util.num(obra.areaConstruida), areaTerreno: Util.num(obra.areaTerreno),
        contratado: contratado, pctExecutado: pctExec, medidoAcum: medidoAcum, aFaturar: Math.max(0, contratado - medidoAcum),
        curvaS: curvaS, cronograma: cronograma, medicoes: medicoes, rdos: rdos
      };
      // Orçamento de bytes: fotos em base64 podem estourar o envio — degrada (corta fotos dos RDOs antigos) até caber.
      var fit = this._caberSnapshot(snapshot);
      if (!fit.ok) { UI.toast("Fotos demais nos diários desta obra. Remova algumas e publique de novo.", "erro"); return; }
      if (fit.cortou) UI.toast("Algumas fotos de diários antigos foram omitidas para caber no envio.", "erro");
      var totFotos = snapshot.rdos.reduce(function (s, r) { return s + (r.fotos ? r.fotos.length : 0); }, 0);
      var userSug = obra.portalUser || ((obra.clienteNome || obra.nome || "cliente").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "").slice(0, 16) || "cliente");
      var senhaSug = obra.portalSenha || Math.random().toString(36).slice(2, 8);
      var corpo =
        '<p style="color:#475569;font-size:14px;margin-bottom:12px">Crie um acesso pro seu cliente <b>acompanhar esta obra online</b> — andamento, medições e diário de obra (RDO) com fotos. Ele acessa pelo link com o usuário e senha abaixo. Clique em <b>Publicar</b> sempre que quiser atualizar as informações.</p>' +
        '<div class="row">' + campo("Usuário do cliente", inp("g-puser", userSug)) + campo("Senha", inp("g-psenha", senhaSug)) + "</div>" +
        '<div style="background:#eef7ff;border:1px solid #d3e6fb;border-radius:10px;padding:11px 14px;font-size:13px;color:#143454">Vai publicar: <b>' + medicoes.length + "</b> medições · <b>" + rdos.length + "</b> diários" + (totFotos ? " · <b>" + totFotos + "</b> fotos" : "") + " · andamento <b>" + Util.fmtPct(pctExec, 0) + "</b>" + (curvaS ? " · Curva S + cronograma" : "") + ".</div>" +
        '<div id="portal-result" style="margin-top:12px"></div>';
      UI.modal("📱 Portal do Cliente — " + Util.esc(obra.nome || ""), corpo, [
        { texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
        { texto: "Publicar", classe: "success", onClick: publicar }
      ]);
      function el(i) { return document.getElementById(i); }
      function publicar() {
        var user = ((el("g-puser") || {}).value || "").trim().toLowerCase().replace(/\s+/g, ""), senha = ((el("g-psenha") || {}).value || "").trim();
        if (user.length < 3) { UI.toast("Usuário muito curto (mín. 3).", "erro"); return; }
        if (senha.length < 4) { UI.toast("Senha muito curta (mín. 4).", "erro"); return; }
        el("portal-result").innerHTML = '<div class="muted">Publicando…</div>';
        fetch(url + "/api/portal/publicar", { method: "POST", headers: { "Content-Type": "application/json", "x-licenca": chave }, body: JSON.stringify({ user: user, senha: senha, empresa: (typeof Auth !== "undefined" && Auth.usuario && Auth.usuario()) ? Auth.usuario().empresa : "", obra: snapshot }) })
          .then(function (r) { return r.json(); }).then(function (j) {
            if (!j.ok) { el("portal-result").innerHTML = '<div style="color:#dc2626;font-size:14px">' + Util.esc(j.erro || "Falha ao publicar.") + "</div>"; return; }
            obra.portalUser = user; obra.portalSenha = senha; Store.salvar(eid(), "obras", obra);
            var link = url + "/portal";
            el("portal-result").innerHTML =
              '<div style="background:#f0fdf4;border:1px solid #16a34a;border-radius:10px;padding:14px 16px;font-size:14px">' +
              '<b style="color:#15803d">✓ Publicado!</b> Envie estes dados pro seu cliente:<br>' +
              '<div style="margin-top:8px;line-height:1.9"><b>Link:</b> <a href="' + link + '" target="_blank" style="color:#2e6f9e">' + link + '</a><br><b>Usuário:</b> ' + Util.esc(user) + "<br><b>Senha:</b> " + Util.esc(senha) + "</div>" +
              '<button class="btn sm primary" id="portal-copy" style="margin-top:10px">Copiar mensagem pro cliente</button></div>';
            var cp = el("portal-copy");
            if (cp) cp.onclick = function () {
              var msg = "Olá! Acompanhe a sua obra online pelo portal:\nLink: " + link + "\nUsuário: " + user + "\nSenha: " + senha;
              if (navigator.clipboard) navigator.clipboard.writeText(msg).then(function () { UI.toast("Mensagem copiada!", "ok"); }); else UI.toast("Copie manualmente os dados acima.", "ok");
            };
          }).catch(function () { el("portal-result").innerHTML = '<div style="color:#dc2626;font-size:14px">Sem conexão com o servidor. Tente de novo.</div>'; });
      }
    },

    // ---------- Lançar de documento (IA lê NF/fatura/boleto) ----------
    lancarDocumento: function () {
      if (this._bloqueado()) return;
      var self = this;
      var back = (typeof CONFIG !== "undefined" && CONFIG.iaBackend) ? String(CONFIG.iaBackend).replace(/\/$/, "") : "";
      var chave = (typeof Licenca !== "undefined" && Licenca.chave) ? Licenca.chave() : "";
      if (!chave) { UI.toast("Ative sua licença pra usar a leitura por IA.", "erro"); return; }
      var inp = document.createElement("input");
      inp.type = "file"; inp.accept = ".xml,.pdf,image/*"; inp.style.display = "none";
      inp.onchange = function () {
        var file = inp.files && inp.files[0]; if (!file) return;
        var ext = String(file.name || "").toLowerCase().split(".").pop();
        if (ext === "xml") {
          var fr = new FileReader();
          fr.onload = function () { try { var dados = self._parseNfeXml(fr.result); if (!dados) { UI.toast("Não reconheci o XML como NF-e.", "erro"); return; } self._docParaLancamento(dados, "XML da NF-e"); } catch (e) { UI.toast("Falha ao ler o XML: " + e.message, "erro"); } };
          fr.readAsText(file);
        } else if (ext === "pdf") {
          UI.toast("Lendo o PDF…", "ok");
          self._pdfTexto(file, function (texto) {
            if (!texto || texto.trim().length < 20) { UI.toast("PDF sem texto legível — tire uma foto/print e envie como imagem.", "erro"); return; }
            self._enviarDoc(back, chave, { tipo: "texto", conteudo: texto }, "PDF");
          });
        } else {
          var fr2 = new FileReader();
          fr2.onload = function () { self._enviarDoc(back, chave, { tipo: "imagem", conteudo: fr2.result }, "imagem"); };
          fr2.readAsDataURL(file);
        }
      };
      document.body.appendChild(inp); inp.click(); setTimeout(function () { inp.remove(); }, 60000);
    },
    _enviarDoc: function (back, chave, payload, origem) {
      var self = this;
      UI.toast("🤖 A IA está lendo o documento…", "ok");
      fetch(back + "/ia/documento", { method: "POST", headers: { "Content-Type": "application/json", "x-licenca": chave }, body: JSON.stringify(payload) })
        .then(function (r) { return r.json(); }).then(function (j) {
          if (!j.ok) { UI.toast(j.error || "A IA não conseguiu ler o documento.", "erro"); return; }
          self._docParaLancamento(j.dados, origem);
        }).catch(function () { UI.toast("Sem conexão com a IA. Tente de novo.", "erro"); });
    },
    _parseNfeXml: function (xml) {
      var doc = new DOMParser().parseFromString(String(xml), "text/xml");
      function sub(parent, tag) { if (!parent) return ""; var e = parent.getElementsByTagName(tag)[0]; return e ? (e.textContent || "").trim() : ""; }
      function g(tag) { return sub(doc, tag); }
      var emit = doc.getElementsByTagName("emit")[0];
      var forn = { nome: sub(emit, "xNome"), cnpj: sub(emit, "CNPJ") || sub(emit, "CPF"), cidade: sub(emit, "xMun"), uf: sub(emit, "UF") };
      if (!forn.nome) return null;
      var valor = parseFloat(String(g("vNF")).replace(",", ".")) || 0;
      var dh = g("dhEmi") || g("dEmi"); var emissao = dh ? dh.slice(0, 10) : "";
      var dup = doc.getElementsByTagName("dup")[0]; var vencimento = dup ? sub(dup, "dVenc") : "";
      var numero = g("nNF");
      var itens = [], dets = doc.getElementsByTagName("det");
      for (var i = 0; i < dets.length && i < 60; i++) { var prod = dets[i].getElementsByTagName("prod")[0]; if (prod) itens.push({ descricao: sub(prod, "xProd"), quantidade: parseFloat(sub(prod, "qCom")) || 0, unidade: sub(prod, "uCom"), valor: parseFloat(sub(prod, "vProd")) || 0 }); }
      return { tipoLancamento: "despesa", fornecedor: forn, valor: valor, emissao: emissao, vencimento: vencimento, numero: numero, descricao: "NF " + numero + " — " + forn.nome, categoria: "material", itens: itens, confianca: 1 };
    },
    _docParaLancamento: function (dados, origem) {
      var fn = dados.fornecedor || {}, ehReceita = dados.tipoLancamento === "receita", msgCad = "";
      if (fn.nome) {
        var entidade = ehReceita ? "clientes" : "fornecedores", docLimpo = String(fn.cnpj || "").replace(/\D/g, "");
        var existe = lista(entidade).filter(function (x) { return (docLimpo && x.doc && String(x.doc).replace(/\D/g, "") === docLimpo) || (x.nome || "").toLowerCase() === String(fn.nome).toLowerCase(); })[0];
        if (!existe) {
          Store.salvar(eid(), entidade, { nome: fn.nome, doc: fn.cnpj || "", cidade: fn.cidade || "", uf: fn.uf || "", tipo: docLimpo.length > 11 ? "PJ" : "PF", status: "ativo", origem: "documento-ia" });
          msgCad = (ehReceita ? "Cliente" : "Fornecedor") + " \"" + fn.nome + "\" cadastrado. ";
        }
      }
      this.formFinanceiro({
        tipo: ehReceita ? "receita" : "despesa",
        data: dados.vencimento || dados.emissao || new Date().toISOString().slice(0, 10),
        valor: dados.valor || 0, categoria: dados.categoria || "material",
        desc: dados.descricao || ("Documento — " + (fn.nome || "")), fornecedor: fn.nome || "", status: "pendente"
      });
      UI.toast("🤖 " + msgCad + "Lançamento preenchido pela IA (confiança " + Math.round((dados.confianca || 0) * 100) + "%). Confira e salve.", "ok");
    },
    _pdfTexto: function (file, cb) {
      function extrair() {
        var fr = new FileReader();
        fr.onload = function () {
          window.pdfjsLib.getDocument({ data: new Uint8Array(fr.result) }).promise.then(function (pdf) {
            var texto = "", n = Math.min(pdf.numPages, 3), chain = Promise.resolve();
            for (var p = 1; p <= n; p++) (function (pg) { chain = chain.then(function () { return pdf.getPage(pg).then(function (page) { return page.getTextContent().then(function (tc) { texto += tc.items.map(function (it) { return it.str; }).join(" ") + "\n"; }); }); }); })(p);
            chain.then(function () { cb(texto); });
          }).catch(function () { cb(""); });
        };
        fr.readAsArrayBuffer(file);
      }
      if (window.pdfjsLib) { extrair(); return; }
      var s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      s.onload = function () { try { window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"; } catch (e) {} extrair(); };
      s.onerror = function () { UI.toast("Não carregou o leitor de PDF. Envie como imagem.", "erro"); };
      document.head.appendChild(s);
    },

    // Comprime um File de imagem em dataURL JPEG ~maxW px de lado maior. cb(dataURL|null) assíncrono.
    _comprimirFoto: function (file, maxW, q, cb) {
      if (!file || !/^image\//.test(file.type || "")) { cb(null); return; }
      var fr = new FileReader();
      fr.onload = function () {
        var img = new Image();
        img.onload = function () {
          var w = img.width || 1, h = img.height || 1;
          if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
          try {
            var cv = document.createElement("canvas"); cv.width = w; cv.height = h;
            cv.getContext("2d").drawImage(img, 0, 0, w, h);
            cb(cv.toDataURL("image/jpeg", q));
          } catch (e) { cb(null); }
        };
        img.onerror = function () { cb(null); };
        img.src = fr.result;
      };
      fr.onerror = function () { cb(null); };
      fr.readAsDataURL(file);
    },
    // Garante que o snapshot serializado caiba em SNAP_MAX_BYTES, cortando fotos dos RDOs mais ANTIGOS primeiro (preserva os recentes).
    _caberSnapshot: function (snap) {
      function bytes() { return JSON.stringify(snap).length; }
      if (bytes() <= SNAP_MAX_BYTES) return { ok: true, cortou: false };
      var passo = 0, cortou = false;
      while (bytes() > SNAP_MAX_BYTES && passo < 1000) {
        passo++;
        var alvo = null;
        for (var i = (snap.rdos || []).length - 1; i >= 0; i--) { if (snap.rdos[i].fotos && snap.rdos[i].fotos.length) { alvo = snap.rdos[i]; break; } }
        if (!alvo) break;
        alvo.fotos.pop(); cortou = true;
      }
      return { ok: bytes() <= SNAP_MAX_BYTES, cortou: cortou };
    },
    abrir: function (entidade, id) {
      var r = Store.obter(eid(), entidade, id); if (!r) return;
      if (entidade === "obras") return this.formObra(r);
      if (entidade === "clientes") return this.formCliente(r);
      if (entidade === "contratos") return this.formContrato(r);
      if (entidade === "medicoes") return this.formMedicao(r);
      if (entidade === "financeiro") return this.formFinanceiro(r);
      if (entidade === "fornecedores") return this.formFornecedor(r);
      if (entidade === "compras") return this.formCompra(r);
      if (entidade === "estoque") return this.formEstoque(r);
      if (entidade === "rdo") return this.formRdo(r);
      if (entidade === "colaboradores") return this.formColaborador(r);
      if (entidade === "ponto") return this.formPonto(r);
      if (entidade === "frota") return this.formFrota(r);
if (entidade === "requisicoes") return this.formRequisicoes(r);
if (entidade === "fiscal") return this.formFiscal(r);
if (entidade === "patrimonio") return this.formPatrimonio(r);
if (entidade === "centrocusto") return this.formCentrocusto(r);
if (entidade === "folha") return this.formFolha(r);
    }
  };

  global.Gestao = Gestao;
})(window);
