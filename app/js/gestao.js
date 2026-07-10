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

  // ---------- RBAC: presets de módulos por departamento (o admin pode ajustar por usuário) ----------
  var LIMITE_USUARIOS = 20;
  var DEPTO_MODULOS = {
    engenharia:     ["dashboard", "orcamentos", "obras", "medicoes", "rdo", "requisicoes", "insumos", "epi", "relatorios"],
    compras:        ["dashboard", "compras", "estoque", "requisicoes", "insumos", "fornecedores"],
    financeiro:     ["dashboard", "financeiro", "folhasemanal", "medicoes", "contratos", "fiscal", "centrocusto", "relatorios"],
    rh:             ["dashboard", "colaboradores", "folhasemanal", "epi", "ponto", "folha"],
    administrativo: ["dashboard", "clientes", "contratos", "fornecedores", "fiscal", "patrimonio", "frota", "epi", "modelos"],
    diretoria:      null   // null = todos os módulos atribuíveis
  };

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
    medicaoStatus: [["pendente", "Pendente"], ["aprovada", "Aprovada"], ["rejeitada", "Rejeitada"], ["paga", "Paga"]],
    finTipo: [["receita", "Receita"], ["despesa", "Despesa"]],
    finCategoria: [["obra", "Obra"], ["material", "Material"], ["mao_obra", "Mão de obra"], ["equipamento", "Equipamento"], ["administrativo", "Administrativo"], ["impostos", "Impostos"], ["medicao", "Medição"], ["outros", "Outros"]],
    finStatus: [["pago", "Pago / Recebido"], ["pendente", "Pendente"]],
    fornCategoria: [["material", "Material"], ["servico", "Serviço"], ["equipamento", "Equipamento"], ["mao_obra", "Mão de obra"], ["transporte", "Transporte"], ["locacao", "Locação"], ["outros", "Outros"]],
    fornStatus: [["ativo", "Ativo"], ["homologado", "Homologado"], ["inativo", "Inativo"]],
    compraStatus: [["cotacao", "Em cotação"], ["aprovado", "Aprovado"], ["rejeitado", "Rejeitado"], ["recebido", "Recebido"], ["cancelado", "Cancelado"]],
    estoqueCategoria: [["cimento", "Cimento/Argamassa"], ["aco", "Aço/Ferragem"], ["agregados", "Agregados"], ["hidraulica", "Hidráulica"], ["eletrica", "Elétrica"], ["madeira", "Madeira/Forma"], ["acabamento", "Acabamento"], ["epi", "EPI/Ferramentas"], ["outros", "Outros"]],
    movTipo: [["entrada", "Entrada"], ["saida", "Saída"]],
    rdoClima: [["ensolarado", "Ensolarado"], ["nublado", "Nublado"], ["chuvoso", "Chuvoso"], ["chuva_forte", "Chuva forte"]],
    rdoCondicao: [["praticavel", "Praticável"], ["parcial", "Parcialmente praticável"], ["impraticavel", "Impraticável"]],
    rdoStatus: [["rascunho", "Rascunho"], ["finalizado", "Finalizado"]],
    tipoContrato: [["clt", "CLT"], ["diarista", "Diarista"], ["empreiteiro", "Empreiteiro"], ["terceiro", "Terceirizado"], ["pj", "PJ"], ["autonomo", "Autônomo"]],
    unidadeRem: [["mensal", "Mensal"], ["diaria", "Diária"], ["hora", "Hora"]],
    colabStatus: [["ativo", "Ativo"], ["afastado", "Afastado"], ["desligado", "Desligado"]],
    pontoStatus: [["aberto", "Aberto"], ["lancado", "Lançado"]],
    faltaMotivo: [["injustificada", "Injustificada"], ["justificada", "Justificada"], ["atestado", "Atestado médico"], ["ferias", "Férias"], ["folga", "Folga/Compensação"]],
    frotaTipo: [["veiculo", "Veículo"], ["caminhao", "Caminhão"], ["maquina", "Máquina pesada"], ["equipamento", "Equipamento"], ["ferramenta", "Ferramenta"]],
    frotaPosse: [["proprio", "Próprio"], ["alugado", "Alugado/Locado"]],
    frotaStatus: [["disponivel", "Disponível"], ["em_uso", "Em uso"], ["manutencao", "Em manutenção"], ["inativo", "Inativo"]],
    frotaCusto: [["combustivel", "Combustível"], ["manutencao", "Manutenção"], ["seguro", "Seguro"], ["locacao", "Locação"], ["pneus", "Pneus"], ["outros", "Outros"]],
    reqPrioridade: [["baixa","Baixa"],["normal","Normal"],["alta","Alta"],["urgente","Urgente"]],
      reqStatus: [["aberta","Aberta"],["cotando","Cotando"],["aprovada","Aprovada"],["rejeitada","Rejeitada"],["comprada","Comprada"],["cancelada","Cancelada"]],
      reqUnidade: [["un","un"],["m","m"],["m2","m²"],["m3","m³"],["kg","kg"],["sc","saco"],["cx","caixa"],["pc","peça"],["l","litro"]],
    departamento: [["engenharia","Engenharia / Obras"],["compras","Compras / Suprimentos"],["financeiro","Financeiro"],["rh","RH / Departamento Pessoal"],["administrativo","Administrativo"],["diretoria","Diretoria"]],
    fiscalTipo: [["entrada", "Entrada"], ["saida", "Saída"]],
    fiscalStatus: [["emitida", "Emitida"], ["cancelada", "Cancelada"], ["aguardando_xml", "Aguardando XML"]],
    patrimonioCategoria: [["imovel","Imóvel"],["movel","Móvel"],["informatica","Informática"],["equipamento","Equipamento"],["outros","Outros"]],
      patrimonioEstado: [["novo","Novo"],["bom","Bom"],["regular","Regular"],["ruim","Ruim"],["baixado","Baixado"]],
    centrocustoTipo: [["direto","Direto"],["indireto","Indireto"],["administrativo","Administrativo"]],
    folhaStatus: [["aberta","Aberta"],["lancada","Lançada"]],
    tarefaStatus: [["afazer","A fazer"],["fazendo","Em andamento"],["feita","Concluída"],["cancelada","Cancelada"]],
    tarefaPrioridade: [["baixa","Baixa"],["normal","Normal"],["alta","Alta"],["urgente","Urgente"]],
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
    emitida: "#16a34a", cancelada: "#dc2626", aguardando_xml: "#f59e0b",
    rejeitada: "#dc2626", rejeitado: "#dc2626",
    novo: "#16a34a", regular: "#f59e0b", ruim: "#dc2626", baixado: "#94a3b8",
    lancada: "#16a34a",
    afazer: "#f59e0b", fazendo: "#2e6f9e", feita: "#16a34a",
  };

  function rot(lista, v) { for (var i = 0; i < lista.length; i++) if (lista[i][0] === v) return lista[i][1]; return v || "—"; }
  function opts(lista, sel) { return lista.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === sel ? " selected" : "") + '>' + o[1] + "</option>"; }).join(""); }
  function optsUf(sel) { return '<option value="">—</option>' + P.uf.map(function (u) { return "<option" + (u === sel ? " selected" : "") + ">" + u + "</option>"; }).join(""); }
  function optsRec(lista, campo, sel, vazio) { return '<option value="">' + (vazio || "—") + "</option>" + Util.arr(lista).map(function (r) { return '<option value="' + r.id + '"' + (r.id === sel ? " selected" : "") + ">" + Util.esc(r[campo] || r.nome || r.numero || r.id) + "</option>"; }).join(""); }
  function pill(status) { var c = CORStatus[status] || "#64748b"; return '<span class="g-pill" style="background:' + c + '22;color:' + c + '">' + Util.esc(rot(P.obraStatus.concat(P.clienteStatus, P.contratoStatus, P.medicaoStatus, P.finStatus, P.fornStatus, P.compraStatus, P.rdoStatus, P.colabStatus, P.pontoStatus, P.frotaStatus, P.reqStatus, P.fiscalStatus, P.patrimonioEstado, P.folhaStatus, P.tarefaStatus), status)) + "</span>"; }
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
    folhasemanal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M7 14h3M7 17h5M14 15.5h3.5"/>',
    ponto: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    frota: '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.5-1.5-1.5H18l-2-4H6L4 11H2.5C1.7 11.5 1 12.1 1 13v3c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
    requisicoes: '<path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6"/><path d="M9 16h4"/>',
    fiscal: '<path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z"/><path d="M9 9h1"/><path d="M9 13h6"/><path d="M9 17h6"/>',
    patrimonio: '<path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 9h.01"/><path d="M15 9h.01"/><path d="M9 13h.01"/><path d="M15 13h.01"/><path d="M10 21v-4h4v4"/>',
    centrocusto: '<path d="M12 2v20"/><path d="M2 5h20"/><path d="M4 5v14c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V5"/><path d="M8 10h8"/><path d="M8 14h5"/>',
    folha: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M8 4v16"/><path d="M12 14h5"/><path d="M12 17h5"/>',
    relatorios: '<path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6"/><rect x="12" y="8" width="3" height="10"/><rect x="17" y="5" width="3" height="13"/>',
    previstoreal: '<path d="M3 3v18h18"/><rect x="7" y="6" width="10" height="3" rx="1"/><rect x="7" y="13" width="13" height="3" rx="1"/><path d="M17 4.5v6"/>',
    galeria: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
    tarefas: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    lastplanner: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/><path d="m8 15 2 2 3-3"/>',
    ajuda: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    bim: '<path d="M12 2l9 5v10l-9 5-9-5V7z"/><path d="M12 12l9-5"/><path d="M12 12v10"/><path d="M12 12L3 7"/>',
    insumos: '<path d="M4 7l8-4 8 4-8 4-8-4z"/><path d="M4 7v10l8 4 8-4V7"/><path d="M12 11v10"/>',
    usuarios: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    epi: '<path d="M12 2l7 3v6c0 4.5-3 8.3-7 9-4-.7-7-4.5-7-9V5l7-3z"/><path d="M9 12l2 2 4-4"/>',
    modelos: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/>',
  };
  function svg(id, size) { size = size || 20; return '<svg class="g-ic" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICON[id] || "") + "</svg>"; }

  var Gestao = {
    P: P, rot: rot,
    modulos: [
      // Ordem = jornada da obra (a MESMA da landing): 1 orçar → 2 BIM → 3 estruturar →
      // 4 canteiro → 5 abastecer → 6 equipe/ativos → 7 dinheiro/comando. g = grupo do menu.
      { id: "dashboard", nome: "Painel", g: 0 },
      { id: "orcamentos", nome: "Orçamentos", g: 1 },
      { id: "bim", nome: "BIM 3D / 4D", g: 2 },
      { id: "clientes", nome: "Clientes", g: 3 },
      { id: "contratos", nome: "Contratos", g: 3 },
      { id: "obras", nome: "Obras", g: 3 },
      { id: "tarefas", nome: "Tarefas", g: 3 },
      { id: "lastplanner", nome: "Last Planner (PPC)", g: 4 },
      { id: "rdo", nome: "Diário (RDO)", g: 4 },
      { id: "galeria", nome: "Galeria de Fotos", g: 4 },
      { id: "medicoes", nome: "Medições", g: 4 },
      { id: "insumos", nome: "Banco de Insumos", g: 5 },
      { id: "requisicoes", nome: "Requisições", g: 5 },
      { id: "compras", nome: "Compras", g: 5 },
      { id: "fornecedores", nome: "Fornecedores", g: 5 },
      { id: "estoque", nome: "Estoque", g: 5 },
      { id: "colaboradores", nome: "Colaboradores", g: 6 },
      { id: "folhasemanal", nome: "Folha Semanal", g: 6 },
      { id: "epi", nome: "EPI", g: 6 },
      { id: "ponto", nome: "Ponto / Folha", g: 6 },
      { id: "folha", nome: "Folha / Encargos", g: 6 },
      { id: "frota", nome: "Frota", g: 6 },
      { id: "patrimonio", nome: "Patrimônio", g: 6 },
      { id: "modelos", nome: "Modelos de Doc.", g: 6 },
      { id: "financeiro", nome: "Financeiro", g: 7 },
      { id: "previstoreal", nome: "Previsto × Real", g: 7 },
      { id: "fiscal", nome: "Fiscal / NF-e", g: 7 },
      { id: "centrocusto", nome: "Centro de Custo", g: 7 },
      { id: "relatorios", nome: "Relatórios", g: 7 },
      { id: "usuarios", nome: "Usuários", g: 7 },
      { id: "ajuda", nome: "Ajuda", g: 8 }
    ],
    GRUPOS_MENU: { 1: "1 · Orçar & vender", 2: "2 · Modelo 3D (BIM)", 3: "3 · Fechar & estruturar", 4: "4 · Canteiro", 5: "5 · Abastecer a obra", 6: "6 · Equipe & ativos", 7: "7 · Dinheiro & comando" },

    // ---------- Sidebar (nav de módulos) ----------
    renderSidebar: function (viewAtiva) {
      var pode = this.podeGestao();
      var mods;
      if (!pode) mods = this.modulos.filter(function (m) { return m.id === "orcamentos"; });
      else mods = this.modulos.filter(function (m) { return (typeof Auth === "undefined" || !Auth.podeModulo) ? true : Auth.podeModulo(m.id); }); // RBAC: sub-usuário só vê seus módulos
      // Cabeçalhos de grupo seguem a jornada da obra (só quando há 2+ grupos visíveis — FREE fica limpo)
      var grupos = {}; mods.forEach(function (m) { if (m.g) grupos[m.g] = 1; });
      var comLabels = Object.keys(grupos).length > 1;
      var self = this, ultimoG = null;
      var itens = mods.map(function (m) {
        var pre = "";
        if (comLabels && m.g !== ultimoG) {
          ultimoG = m.g;
          var lbl = self.GRUPOS_MENU[m.g];
          if (lbl) pre = '<div class="sb-grp">' + lbl + "</div>";
          else if (m.g === 8) pre = '<div class="sb-sep"></div>';
        }
        return pre + '<button class="sb-item' + (m.id === viewAtiva ? " on" : "") + '" data-view="' + m.id + '"><span class="sb-ic">' + svg(m.id, 19) + "</span><span>" + m.nome + "</span></button>";
      }).join("");
      if (!pode && (typeof Auth === "undefined" || !Auth.ehAdmin || Auth.ehAdmin())) itens += '<button class="sb-item sb-upsell" data-gacao="upsell-plus"><span class="sb-ic">⭐</span><span>Desbloquear Gestão</span></button>'; // upsell só p/ o dono (não p/ sub-usuário)
      return '<div class="sb-top"><svg width="34" height="34" viewBox="0 0 100 100"><defs><linearGradient id="sbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#163a5c"/><stop offset="1" stop-color="#2e6f9e"/></linearGradient></defs><rect x="2" y="2" width="96" height="96" rx="24" fill="url(#sbg)"/><rect x="24" y="52" width="13" height="22" rx="4" fill="#fff" opacity=".55"/><rect x="44" y="38" width="13" height="36" rx="4" fill="#fff" opacity=".9"/><rect x="64" y="24" width="13" height="50" rx="4" fill="#6fd08a"/></svg></div>' +
        '<div class="sb-lbl">Módulos</div><nav class="sb-nav">' + itens + "</nav>";
    },

    // ---------- Dispatcher de view ----------
    render: function (view) {
      // RBAC: guarda em função (não só ocultar) — sub-usuário sem permissão vê aviso
      if (typeof Auth !== "undefined" && Auth.podeModulo && !Auth.podeModulo(view)) return this._semPermissao(view);
      switch (view) {
        case "dashboard": return this.renderDashboard();
        case "obras": return this.renderObras();
        case "tarefas": return this.renderTarefas();
        case "lastplanner": return this.renderLastPlanner();
        case "folhasemanal": return this.renderFolhaSemanal();
        case "clientes": return this.renderClientes();
        case "contratos": return this.renderContratos();
        case "medicoes": return this.renderMedicoes();
        case "financeiro": return this.renderFinanceiro();
        case "previstoreal": return this.renderPrevistoReal();
        case "fornecedores": return this.renderFornecedores();
        case "compras": return this.renderCompras();
        case "estoque": return this.renderEstoque();
        case "rdo": return this.renderRdo();
        case "galeria": return this.renderGaleria();
        case "bim": return this.renderBim();
        case "colaboradores": return this.renderColaboradores();
        case "epi": return this.renderEpi();
        case "ponto": return this.renderPonto();
        case "frota": return this.renderFrota();
        case "requisicoes": return this.renderRequisicoes();
        case "insumos": return this.renderBancoInsumos();
        case "fiscal": return this.renderFiscal();
        case "patrimonio": return this.renderPatrimonio();
        case "centrocusto": return this.renderCentrocusto();
        case "folha": return this.renderFolha();
        case "relatorios": return this.renderRelatorios();
        case "modelos": return this.renderModelos();
        case "usuarios": return this.renderUsuarios();
        case "ajuda": return this.renderAjuda();
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
      var medPend = med.filter(function (m) { return m.status !== "paga" && m.status !== "rejeitada"; }).length;
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
      // G3: fila de aprovações pendentes (só aparece quando há algo esperando, e só p/ quem aprova)
      var podeAp = (typeof Auth === "undefined" || !Auth.podeAprovar) ? true : Auth.podeAprovar();
      var pend = this._pendentesAprovacao();
      if (podeAp && pend.total > 0) {
        var chip = function (n, rot, view) { return n > 0 ? '<button class="btn sm" data-view="' + view + '" style="margin-right:8px">' + rot + ": <b>" + n + "</b></button>" : ""; };
        html += '<div class="card mt" style="border-left:4px solid #f59e0b"><h3 style="margin:0 0 8px">⏳ Pendentes de aprovação <span class="g-pill" style="background:#f59e0b22;color:#b45309">' + pend.total + '</span></h3>' +
          '<div class="muted" style="margin-bottom:10px;font-size:13px">Itens aguardando o seu aval. Clique para revisar e aprovar/rejeitar.</div>' +
          chip(pend.medicoes, "Medições", "medicoes") + chip(pend.compras, "Pedidos de compra", "compras") + chip(pend.requisicoes, "Requisições", "requisicoes") +
          "</div>";
      }
      // G4: tarefas atrasadas / a fazer
      var self = this, tarefas = lista("tarefas");
      var tAtras = tarefas.filter(function (t) { return self._tarefaAtrasada(t); }).length;
      var tAfazer = tarefas.filter(function (t) { return t.status === "afazer" || t.status === "fazendo"; }).length;
      if (tAfazer > 0 || tAtras > 0) {
        html += '<div class="card mt"' + (tAtras ? ' style="border-left:4px solid #dc2626"' : "") + '><h3 style="margin:0 0 8px">🗒️ Tarefas</h3>' +
          '<button class="btn sm" data-view="tarefas" style="margin-right:8px">A fazer: <b>' + tAfazer + "</b></button>" +
          (tAtras ? '<button class="btn sm" data-view="tarefas" style="color:#dc2626;margin-right:8px">⚠ Atrasadas: <b>' + tAtras + "</b></button>" : "") +
          "</div>";
      }
      // resumo por obra (orçado x contratado x custo real)
      html += '<div class="card mt"><h3 style="margin:0 0 10px">Resumo por obra</h3>';
      if (!obras.length) html += '<p class="muted">Nenhuma obra ainda. Crie a primeira em <b>Obras</b> (ou gere a partir de um orçamento).</p>';
      else {
        html += '<table class="tbl"><thead><tr><th>Obra</th><th>Status</th><th class="num">Contratado</th><th class="num">Custo real</th><th class="num" title="Custo real dividido pela área construída cadastrada na obra">Custo/m²</th><th class="num">Recebido</th><th class="num">Margem</th></tr></thead><tbody>';
        obras.forEach(function (o) {
          var ctr = contratos.filter(function (c) { return c.obraId === o.id; }).reduce(function (s, c) { return s + Util.num(c.valor); }, 0);
          var custo = fin.filter(function (f) { return f.obraId === o.id && f.tipo === "despesa"; }).reduce(function (s, f) { return s + Util.num(f.valor); }, 0);
          var rec = fin.filter(function (f) { return f.obraId === o.id && f.tipo === "receita"; }).reduce(function (s, f) { return s + Util.num(f.valor); }, 0);
          var base = ctr || Util.num(o.valor);
          var margem = base > 0 ? ((base - custo) / base * 100) : 0;
          var area = Util.num(o.areaConstruida);
          var cm2 = area > 0 ? (Util.fmtMoeda(custo / area) + "/m²") : '<span class="muted" title="Cadastre a área construída na obra">—</span>';
          html += "<tr><td><b>" + Util.esc(o.nome) + "</b></td><td>" + pill(o.status) + '</td><td class="num">' + Util.fmtMoeda(base) + '</td><td class="num">' + Util.fmtMoeda(custo) + '</td><td class="num">' + cm2 + '</td><td class="num">' + Util.fmtMoeda(rec) + '</td><td class="num" style="color:' + (margem >= 0 ? "var(--verde)" : "var(--vermelho)") + '">' + Util.fmtPct(margem, 1) + "</td></tr>";
        });
        html += "</tbody></table>";
      }
      html += "</div>";
      // G5: Análise visual (gráficos reutilizando o motor SVG do ui.js) com filtro de período
      html += this._dashAnalise();
      return html;
    },
    // ---------- G5: BI vivo no Painel ----------
    _CORCAT: { obra: "#0f2740", material: "#16a34a", mao_obra: "#2563eb", equipamento: "#f59e0b", administrativo: "#64748b", impostos: "#dc2626", medicao: "#7c3aed", outros: "#94a3b8" },
    _periodoFin: function (fin, periodo, ref) {
      if (!periodo || periodo === "tudo") return fin;
      var hoje = ref ? new Date(ref + "T00:00:00") : new Date();
      var ano = hoje.getFullYear(), mes = hoje.getMonth();
      return fin.filter(function (f) {
        if (!f.data) return false;
        var d = new Date(String(f.data) + "T00:00:00"); if (isNaN(d.getTime())) return false;
        if (periodo === "ano") return d.getFullYear() === ano;
        if (periodo === "mes") return d.getFullYear() === ano && d.getMonth() === mes;
        return true;
      });
    },
    _dashGraficosDados: function (periodo, ref) {
      var self = this, fin = this._periodoFin(lista("financeiro"), periodo, ref), obras = lista("obras");
      var porCat = {};
      fin.forEach(function (f) { if (f.tipo === "despesa") { var c = f.categoria || "outros"; porCat[c] = (porCat[c] || 0) + Util.num(f.valor); } });
      var cats = [];
      for (var k in porCat) if (porCat.hasOwnProperty(k)) cats.push({ rotulo: rot(P.finCategoria, k), valor: porCat[k], cor: self._CORCAT[k] || "#94a3b8" });
      cats.sort(function (a, b) { return b.valor - a.valor; });
      var custoObra = obras.map(function (o) {
        var c = fin.filter(function (f) { return f.obraId === o.id && f.tipo === "despesa"; }).reduce(function (s, f) { return s + Util.num(f.valor); }, 0);
        return { rotulo: o.nome, valor: c, area: Util.num(o.areaConstruida) };
      }).filter(function (x) { return x.valor > 0; }).sort(function (a, b) { return b.valor - a.valor; });
      var custoM2 = custoObra.filter(function (x) { return x.area > 0; }).map(function (x) { return { rotulo: x.rotulo, valor: x.valor / x.area }; });
      return { porCategoria: cats, custoPorObra: custoObra.map(function (x) { return { rotulo: x.rotulo, valor: x.valor }; }), custoM2: custoM2 };
    },
    _dashAnalise: function () {
      if (this._dashPer == null) this._dashPer = "tudo";
      // Só esconde o bloco inteiro se a empresa não tem NENHUMA despesa (Painel limpo p/ conta nova).
      // Se há despesas mas nenhuma NO PERÍODO filtrado, o card + o seletor CONTINUAM (senão o usuário
      // ficaria preso num período vazio, sem como voltar — bug do G5 pego na revisão).
      var temQualquerDespesa = lista("financeiro").some(function (f) { return f.tipo === "despesa"; });
      if (!temQualquerDespesa) return "";
      var per = this._dashPer, gd = this._dashGraficosDados(per);
      var opt = function (v, r) { return '<option value="' + v + '"' + (per === v ? " selected" : "") + ">" + r + "</option>"; };
      var perSel = '<select data-gacao="dash-periodo" style="max-width:160px">' + opt("tudo", "Desde sempre") + opt("ano", "Este ano") + opt("mes", "Este mês") + "</select>";
      var donut = (typeof UI !== "undefined" && UI._donut) ? UI._donut : function () { return ""; };
      var barH = (typeof UI !== "undefined" && UI._barH) ? UI._barH : function () { return ""; };
      var html = '<div class="card mt"><div class="flex between" style="align-items:center"><h3 style="margin:0">📊 Análise</h3>' + perSel + "</div>";
      if (!gd.porCategoria.length && !gd.custoPorObra.length) {
        html += '<p class="muted" style="margin:12px 0 0;font-size:14px">Sem lançamentos no período selecionado. Troque o filtro acima (ex.: <b>Desde sempre</b>).</p>';
        return html + "</div>";
      }
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;margin-top:12px">';
      if (gd.porCategoria.length) html += '<div><h4 style="margin:0 0 8px;font-size:14px">Despesas por categoria</h4>' + donut(gd.porCategoria) + "</div>";
      if (gd.custoPorObra.length) html += '<div><h4 style="margin:0 0 8px;font-size:14px">Custo real por obra</h4>' + barH(gd.custoPorObra) + "</div>";
      if (gd.custoM2.length) html += '<div><h4 style="margin:0 0 8px;font-size:14px" title="Custo real ÷ área construída">Custo por m²</h4>' + barH(gd.custoM2) + '</div>';
      else html += '<div><h4 style="margin:0 0 8px;font-size:14px">Custo por m²</h4><p class="muted" style="font-size:13px">Cadastre a área construída nas obras para ver o custo por m² comparativo.</p></div>';
      html += "</div></div>";
      return html;
    },
    dashTrocaPeriodo: function (p) { this._dashPer = p; App.render(); },

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
      var html = this._head(svg("medicoes") + "Medições", "nova-medicao", "Nova medição", '<button class="btn sm" data-gacao="export-medicoes" style="margin-right:10px;align-self:center">📥 CSV</button>');
      if (!ms.length) return html + vazioBox("Nenhuma medição registrada", "nova-medicao", "Registrar primeira medição");
      html += '<table class="tbl"><thead><tr><th>Nº</th><th>Obra</th><th>Período</th><th class="num">%</th><th class="num">Valor</th><th>Status</th><th></th></tr></thead><tbody>';
      ms.forEach(function (m) {
        var ob = obras.filter(function (o) { return o.id === m.obraId; })[0];
        var docs = '<button class="btn sm" data-gacao="boletim-medicao" data-id="' + m.id + '" title="Boletim de medição">🖨</button> <button class="btn sm" data-gacao="excel-medicao" data-id="' + m.id + '" title="Excel de medição">📊</button> ';
        var acao = docs + (m.status === "pendente" ? '<button class="btn sm success" data-gacao="aprovar-medicao" data-id="' + m.id + '">Aprovar</button> <button class="btn sm" data-gacao="rejeitar-medicao" data-id="' + m.id + '" style="color:#dc2626">Rejeitar</button>' : (m.status === "aprovada" ? '<button class="btn sm primary" data-gacao="pagar-medicao" data-id="' + m.id + '">Registrar pgto</button>' : (m.status === "rejeitada" ? '<span class="muted" title="' + Util.esc(m.motivoRejeicao || "") + '">✕ rejeitada</span>' : "✓")));
        html += '<tr><td style="cursor:pointer" data-gopen="medicoes:' + m.id + '"><b>' + Util.esc(m.numero || "—") + "</b></td><td>" + Util.esc(ob ? ob.nome : "—") + "</td><td>" + Util.esc((m.periodoInicio || "") + (m.periodoFim ? " a " + m.periodoFim : "")) + '</td><td class="num">' + Util.fmtPct(m.percentual, 1) + '</td><td class="num">' + Util.fmtMoeda(m.valor) + "</td><td>" + pill(m.status) + '</td><td class="num">' + acao + "</td></tr>";
      });
      return html + "</tbody></table>";
    },
    novoMedicao: function () { this.formMedicao(null); },
    // #18: acumulado ANTERIOR por item (medições da mesma obra + mesmo orçamento, exceto a atual)
    _pctAnterioresPorItem: function (obraId, orcamentoId, medicaoAtualId) {
      var acc = {};
      lista("medicoes").forEach(function (x) {
        if (x.obraId !== obraId || x.orcamentoId !== orcamentoId) return;
        if (medicaoAtualId && String(x.id) === String(medicaoAtualId)) return;
        Util.arr(x.itens).forEach(function (it) { acc[it.itemId] = (acc[it.itemId] || 0) + Util.num(it.pctPeriodo); });
      });
      return acc;
    },
    formMedicao: function (m) {
      var self = this;
      m = m || {}; var stAntigo = m.status || ""; var obras = lista("obras"), contratos = lista("contratos");
      var orcs = Store.listarOrcamentos(eid());
      var num = m.numero || String(lista("medicoes").length + 1).padStart(2, "0") + "ª";
      var corpo =
        '<div class="row">' + campo("Nº da medição", inp("g-num", num)) + campo("Status", sel("g-status", opts(P.medicaoStatus, m.status || "pendente"))) + "</div>" +
        '<div class="row">' + campo("Obra *", sel("g-obra", optsRec(obras, "nome", m.obraId, "— selecionar —"))) + campo("Contrato", sel("g-contrato", optsRec(contratos, "numero", m.contratoId, "— nenhum —"))) + "</div>" +
        // #18: medição vinculada ao orçamento — os itens orçados viram linhas mediveis
        '<div class="row">' + campo("Orçamento (medir por itens)", sel("g-orcmed", optsRec(orcs, "nome", m.orcamentoId, "— medição por valor (manual) —"))) + "</div>" +
        '<div id="med-itens"></div>' +
        '<div class="row">' + campo("Período (início)", inp("g-pini", m.periodoInicio, "", "date")) + campo("Período (fim)", inp("g-pfim", m.periodoFim, "", "date")) + "</div>" +
        '<div class="row">' + campo("% executado no período", inp("g-pct", m.percentual)) + campo("Valor medido (R$) *", inp("g-valor", m.valor)) + campo("Retenção (%)", inp("g-ret", m.retencao == null ? 5 : m.retencao)) + "</div>" +
        campo("Descrição dos serviços medidos", '<textarea id="g-desc" rows="2">' + Util.esc(m.descricao || "") + "</textarea>");
      this._modalForm("medicoes", m, "Medição", corpo, function (obj) {
        obj.numero = v("g-num"); obj.status = v("g-status"); obj.obraId = v("g-obra");
        if (!obj.obraId) { UI.toast("Selecione a obra da medição.", "erro"); return false; }
        if (!self._gateStatusForm(obj, stAntigo)) return false; // G3 fix: aprovar/rejeitar pelo form exige permissão + auditoria
        obj.contratoId = v("g-contrato"); obj.periodoInicio = v("g-pini"); obj.periodoFim = v("g-pfim");
        obj.retencao = nv("g-ret"); obj.descricao = v("g-desc");
        // #18: com orçamento selecionado, valor e % NASCEM dos itens (não se digita)
        var orcId = v("g-orcmed");
        if (orcId) {
          var orc = Store.obterOrcamento(eid(), orcId);
          if (!orc) { UI.toast("Orçamento não encontrado.", "erro"); return false; }
          var pcts = {};
          Array.prototype.forEach.call(document.querySelectorAll("[data-medpct]"), function (i2) {
            var p = Util.num(i2.value); if (p > 0) pcts[i2.getAttribute("data-medpct")] = p;
          });
          var ant = self._pctAnterioresPorItem(obj.obraId, orcId, obj.id);
          var res = Orcamento.medirItens(orc, pcts, ant);
          if (!res.itens.length) { UI.toast("Informe o % medido de ao menos 1 item (ou volte para medição manual).", "erro"); return false; }
          if (res.avisos.length) UI.toast("⚠ " + res.avisos.slice(0, 3).join(" · "), "erro");
          obj.orcamentoId = orcId; obj.itens = res.itens;
          obj.valor = res.total; obj.percentual = Math.round(res.pctDoOrcamento * 10) / 10;
        } else {
          obj.orcamentoId = null; obj.itens = null;
          obj.percentual = nv("g-pct"); obj.valor = nv("g-valor");
        }
        return true;
      });
      setTimeout(function () { self._ligarMedItens(m); }, 60); // pós-abertura do modal
    },
    // #18: tabela de itens mediveis dentro do modal (recalcula ao digitar %)
    _ligarMedItens: function (m) {
      var self = this;
      var selOrc = UI.el("g-orcmed"), box = UI.el("med-itens");
      if (!selOrc || !box) return;
      function pintar() {
        var orcId = selOrc.value;
        var gv = UI.el("g-valor"), gp = UI.el("g-pct");
        if (!orcId) { box.innerHTML = ""; if (gv) gv.readOnly = false; if (gp) gp.readOnly = false; return; }
        var orc = Store.obterOrcamento(eid(), orcId);
        if (!orc) { box.innerHTML = '<div class="muted">Orçamento não encontrado.</div>'; return; }
        var ant = self._pctAnterioresPorItem(v("g-obra"), orcId, m.id);
        var salvos = {};
        if (m.orcamentoId === orcId) Util.arr(m.itens).forEach(function (it) { salvos[it.itemId] = it.pctPeriodo; });
        var linhas = Orcamento.itensMediveis(orc);
        var html = '<table class="tbl" style="font-size:12px;margin:6px 0"><thead><tr><th>Item</th><th>Und</th><th class="num">Qtd contr.</th><th class="num">Preço c/BDI</th><th class="num">% ant.</th><th class="num">% período</th><th class="num">Valor</th></tr></thead><tbody>';
        linhas.forEach(function (L) {
          var a = Util.num(ant[L.itemId]);
          html += '<tr><td>' + (L.codigo ? "<b>" + Util.esc(L.codigo) + "</b> " : "") + Util.esc(String(L.descricao).slice(0, 60)) + "</td>"
            + "<td>" + Util.esc(L.unidade) + "</td>"
            + '<td class="num">' + Util.fmtNum(L.qtdContratada, 2) + "</td>"
            + '<td class="num">' + Util.fmtMoeda(L.precoUnit) + "</td>"
            + '<td class="num" style="color:' + (a >= 99.95 ? "#16a34a" : "#64748b") + '">' + Util.fmtNum(a, 1) + "%</td>"
            + '<td class="num"><input data-medpct="' + Util.esc(L.itemId) + '" value="' + Util.esc(salvos[L.itemId] != null ? String(salvos[L.itemId]).replace(".", ",") : "") + '" placeholder="0" style="width:58px;text-align:right;background:#fff9e0"></td>'
            + '<td class="num" data-medval="' + Util.esc(L.itemId) + '">—</td></tr>';
        });
        html += '</tbody><tfoot><tr><td colspan="6" style="text-align:right"><b>Total medido neste boletim</b></td><td class="num"><b data-medtot>—</b></td></tr></tfoot></table>'
          + '<div class="muted" style="font-size:11px;margin-bottom:6px">Informe o % executado NO PERÍODO por item — valor e % da medição são calculados sozinhos. Vermelho = estourou 100% acumulado.</div>';
        box.innerHTML = html;
        function recalc() {
          var tot = 0;
          linhas.forEach(function (L) {
            var i2 = box.querySelector('[data-medpct="' + L.itemId + '"]');
            var vl = box.querySelector('[data-medval="' + L.itemId + '"]');
            var p = i2 ? Util.num(i2.value) : 0;
            var val = p > 0 ? Math.round(L.qtdContratada * p / 100 * L.precoUnit * 100) / 100 : 0;
            tot += val;
            if (vl) vl.textContent = val ? Util.fmtMoeda(val) : "—";
            if (i2) i2.style.borderColor = (Util.num(ant[L.itemId]) + p > 100.0001) ? "#dc2626" : "";
          });
          var t = box.querySelector("[data-medtot]"); if (t) t.textContent = Util.fmtMoeda(tot);
          var t2 = Orcamento.totais(orc);
          if (gv) { gv.value = tot.toFixed(2).replace(".", ","); gv.readOnly = true; }
          if (gp) { gp.value = (t2.precoVenda > 0 ? (tot / t2.precoVenda * 100) : 0).toFixed(1).replace(".", ","); gp.readOnly = true; }
        }
        Array.prototype.forEach.call(box.querySelectorAll("[data-medpct]"), function (i2) { i2.oninput = recalc; });
        recalc();
      }
      selOrc.addEventListener("change", pintar);
      var gObra = UI.el("g-obra");
      if (gObra) gObra.addEventListener("change", function () {
        // obra criada a partir de orçamento já aponta o orçamento certo
        var ob = Store.obter(eid(), "obras", gObra.value);
        if (ob && ob.orcamentoId && !selOrc.value) selOrc.value = ob.orcamentoId;
        pintar();
      });
      if (selOrc.value) pintar();
    },

    // Chave ÚNICA de ordenação da sequência de medições (mesma em _medicaoCalc e no histórico do Excel).
    _medKey: function (x) { return (x.periodoFim || x.periodoInicio || "") + "|" + (x.numero || ""); },
    // Calcula anterior / atual / acumulada / saldo a partir da sequência de medições da obra.
    _medicaoCalc: function (m) {
      var self = this, obra = m.obraId ? Store.obter(eid(), "obras", m.obraId) : null;
      var contratado = obra ? Util.num(obra.valor) : 0;
      // #18: com orçamento vinculado, o contratado é o preço de venda do
      // ORÇAMENTO (fonte da verdade) — fallback no valor digitado da obra.
      if (m.orcamentoId && typeof Orcamento !== "undefined") {
        var orcV = Store.obterOrcamento ? Store.obterOrcamento(eid(), m.orcamentoId) : null;
        if (orcV) { var tv = Orcamento.totais(orcV); if (Util.num(tv.precoVenda) > 0) contratado = tv.precoVenda; }
      }
      var meds = lista("medicoes").filter(function (x) { return x.obraId === m.obraId; })
        .sort(function (a, b) { return self._medKey(a).localeCompare(self._medKey(b)); });
      var anterior = 0, atual = Util.num(m.valor), acumulado = 0, achou = false;
      for (var i = 0; i < meds.length; i++) {
        if (String(meds[i].id) === String(m.id)) { anterior = acumulado; acumulado += atual; achou = true; break; }
        acumulado += Util.num(meds[i].valor);
      }
      if (!achou) { anterior = acumulado; acumulado += atual; }
      var ret = Util.num(m.retencao), retVal = atual * ret / 100, liquido = atual - retVal;
      // sem valor de contrato → não exibir % (base inexistente); helper omite a coluna quando null
      var pctAcum = contratado > 0 ? acumulado / contratado * 100 : null;
      var pctAnt = contratado > 0 ? anterior / contratado * 100 : null;
      return { contratado: contratado, anterior: anterior, atual: atual, acumulado: acumulado, saldo: Math.max(0, contratado - acumulado), retencao: ret, retVal: retVal, liquido: liquido, pctAcum: pctAcum, pctAnt: pctAnt, obra: obra };
    },
    boletimMedicao: function (id) {
      var m = Store.obter(eid(), "medicoes", id); if (!m) return;
      var c = this._medicaoCalc(m), obra = c.obra || {}, emp = (typeof Empresa !== "undefined" && Empresa.dados) ? Empresa.dados() : {};
      var logo = (typeof Empresa !== "undefined" && Empresa.logoHTML) ? Empresa.logoHTML(50) : "";
      var brd = function (d) { return d ? String(d).split("-").reverse().join("/") : "—"; };
      var periodo = (m.periodoInicio ? brd(m.periodoInicio) : "") + (m.periodoFim ? " a " + brd(m.periodoFim) : "");
      var lin = function (rot, val, dPct, forte) { return "<tr" + (forte ? " style='background:#eef4fa;font-weight:bold'" : "") + "><td style='border:1px solid #bbb;padding:6px'>" + rot + "</td><td style='border:1px solid #bbb;padding:6px;text-align:right'>" + Util.fmtMoeda(val) + "</td><td style='border:1px solid #bbb;padding:6px;text-align:right'>" + (dPct != null ? Util.fmtPct(dPct, 1) : "") + "</td></tr>"; };
      var html = '<div style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:740px;margin:0 auto;font-size:12px">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #16a34a;padding-bottom:10px;margin-bottom:14px"><div>' + logo + '</div><div style="text-align:center;flex:1"><b style="font-size:14px">' + Util.esc(emp.nome || "") + "</b><br><span style='font-size:9px'>" + (emp.cnpj ? "CNPJ " + Util.esc(emp.cnpj) : "") + (emp.contato ? " · " + Util.esc(emp.contato) : "") + "</span></div><div style='text-align:right'><b style='font-size:13px;color:#16a34a'>BOLETIM DE MEDIÇÃO</b><br><span>Nº " + Util.esc(m.numero || "—") + "</span></div></div>"
        + "<table style='width:100%;border-collapse:collapse;font-size:12px;margin-bottom:14px'><tr><td style='border:1px solid #bbb;padding:6px;background:#f8fafc;width:22%'><b>Obra</b></td><td style='border:1px solid #bbb;padding:6px'>" + Util.esc(obra.nome || "—") + "</td><td style='border:1px solid #bbb;padding:6px;background:#f8fafc;width:16%'><b>Cliente</b></td><td style='border:1px solid #bbb;padding:6px'>" + Util.esc(obra.clienteNome || "—") + "</td></tr><tr><td style='border:1px solid #bbb;padding:6px;background:#f8fafc'><b>Período</b></td><td style='border:1px solid #bbb;padding:6px'>" + Util.esc(periodo || "—") + "</td><td style='border:1px solid #bbb;padding:6px;background:#f8fafc'><b>Local</b></td><td style='border:1px solid #bbb;padding:6px'>" + Util.esc(obra.local || "—") + "</td></tr></table>"
        + "<h3 style='border-bottom:2px solid #16a34a;padding-bottom:4px;font-size:13px'>RESUMO FINANCEIRO DA MEDIÇÃO</h3>"
        + "<table style='width:100%;border-collapse:collapse;font-size:12px'><thead><tr style='background:#0f2740;color:#fff'><th style='border:1px solid #bbb;padding:6px;text-align:left'>Descrição</th><th style='border:1px solid #bbb;padding:6px;text-align:right'>Valor (R$)</th><th style='border:1px solid #bbb;padding:6px;text-align:right'>% do contrato</th></tr></thead><tbody>"
        + lin("Valor contratado", c.contratado, c.contratado > 0 ? 100 : null)
        + lin("Medição anterior (acumulado)", c.anterior, c.pctAnt)
        + lin("Medição atual (Nº " + Util.esc(m.numero || "") + ")", c.atual, c.contratado > 0 ? c.atual / c.contratado * 100 : null)
        + lin("Acumulado até esta medição", c.acumulado, c.pctAcum, true)
        + lin("Saldo a executar", c.saldo, c.contratado > 0 ? c.saldo / c.contratado * 100 : null)
        + "</tbody></table>"
        + "<table style='width:100%;border-collapse:collapse;font-size:12px;margin-top:10px'><tbody>"
        + lin("Retenção contratual (" + Util.fmtNum(c.retencao, 1) + "%)", c.retVal, null)
        + lin("Líquido a faturar nesta medição", c.liquido, null, true)
        + "</tbody></table>"
        + (function () { // #18: itens medidos do orçamento vinculado (memória do boletim)
          var its = Util.arr(m.itens); if (!its.length) return "";
          var td = function (s, dir) { return "<td style='border:1px solid #bbb;padding:5px" + (dir ? ";text-align:right" : "") + "'>" + s + "</td>"; };
          var h = "<h3 style='border-bottom:2px solid #16a34a;padding-bottom:4px;font-size:13px;margin-top:14px'>ITENS MEDIDOS NESTE BOLETIM</h3>"
            + "<table style='width:100%;border-collapse:collapse;font-size:11px'><thead><tr style='background:#0f2740;color:#fff'><th style='border:1px solid #bbb;padding:5px;text-align:left'>Código</th><th style='border:1px solid #bbb;padding:5px;text-align:left'>Serviço</th><th style='border:1px solid #bbb;padding:5px'>Und</th><th style='border:1px solid #bbb;padding:5px;text-align:right'>Qtd contr.</th><th style='border:1px solid #bbb;padding:5px;text-align:right'>% ant.</th><th style='border:1px solid #bbb;padding:5px;text-align:right'>% período</th><th style='border:1px solid #bbb;padding:5px;text-align:right'>% acum.</th><th style='border:1px solid #bbb;padding:5px;text-align:right'>Qtd medida</th><th style='border:1px solid #bbb;padding:5px;text-align:right'>Preço unit. c/BDI</th><th style='border:1px solid #bbb;padding:5px;text-align:right'>Valor (R$)</th></tr></thead><tbody>";
          its.forEach(function (it) {
            var acum = Util.num(it.pctAnterior) + Util.num(it.pctPeriodo);
            h += "<tr>" + td(Util.esc(it.codigo || "—")) + td(Util.esc(it.descricao)) + td(Util.esc(it.unidade))
              + td(Util.fmtNum(it.qtdContratada, 2), 1) + td(Util.fmtNum(it.pctAnterior, 1) + "%", 1)
              + td("<b>" + Util.fmtNum(it.pctPeriodo, 1) + "%</b>", 1)
              + td("<span style='color:" + (acum > 100.0001 ? "#dc2626" : (acum >= 99.95 ? "#16a34a" : "#111")) + "'>" + Util.fmtNum(acum, 1) + "%</span>", 1)
              + td(Util.fmtNum(it.qtdMedida, 2), 1)
              + td(Util.fmtMoeda(it.precoUnit), 1) + td("<b>" + Util.fmtMoeda(it.valor) + "</b>", 1) + "</tr>";
          });
          h += "</tbody><tfoot><tr style='background:#eef4fa;font-weight:bold'><td colspan='9' style='border:1px solid #bbb;padding:5px;text-align:right'>TOTAL MEDIDO</td><td style='border:1px solid #bbb;padding:5px;text-align:right'>" + Util.fmtMoeda(m.valor) + "</td></tr></tfoot></table>";
          return h;
        })()
        + (m.descricao ? "<div style='margin-top:12px;padding:10px;background:#f0fdf4;border-left:4px solid #16a34a;border-radius:6px'><b>Serviços medidos:</b><br>" + Util.esc(m.descricao) + "</div>" : "")
        + "<div style='margin-top:24px;font-size:11px'>Declaramos que os serviços descritos foram executados conforme o contrato e estão aptos para faturamento.</div>"
        + "<div style='display:flex;justify-content:space-between;margin-top:44px;gap:40px'><div style='flex:1;text-align:center;border-top:1px solid #333;padding-top:4px;font-size:11px'><b>" + Util.esc(emp.nome || "CONTRATADA") + "</b><br>" + (emp.responsavel ? Util.esc(emp.responsavel) + (emp.crea ? " · CREA " + Util.esc(emp.crea) : "") : "Responsável Técnico") + "</div><div style='flex:1;text-align:center;border-top:1px solid #333;padding-top:4px;font-size:11px'><b>" + Util.esc(obra.clienteNome || "CONTRATANTE") + "</b><br>Aprovação do Cliente</div></div>"
        + "<div style='text-align:right;font-size:8px;color:#999;margin-top:12px'>Gerado pelo OrçaPRO IA em " + new Date().toLocaleDateString("pt-BR") + "</div></div>";
      if (typeof App !== "undefined" && App._abrirPrint) App._abrirPrint("Boletim de Medição Nº " + (m.numero || ""), html);
      else { var w = window.open("", "_blank"); if (w) { w.document.write(html); w.document.close(); } }
    },
    excelMedicao: function (id) {
      var self = this, m = Store.obter(eid(), "medicoes", id); if (!m) return;
      if (typeof ExcelOrc === "undefined" || !ExcelOrc.ensureExcelJS) { UI.toast("Gerador de Excel indisponível.", "erro"); return; }
      UI.toast("Gerando Excel…", "ok");
      ExcelOrc.ensureExcelJS(function () {
        try {
          var ExcelJS = window.ExcelJS, c = self._medicaoCalc(m), obra = c.obra || {}, emp = (typeof Empresa !== "undefined" && Empresa.dados) ? Empresa.dados() : {};
          var wb = new ExcelJS.Workbook(); wb.creator = "OrçaPRO IA";
          var navy = "FF0F2740", verde = "FF16A34A";
          var ws = wb.addWorksheet("Medição", { views: [{ state: "frozen", ySplit: 5 }] });
          ws.columns = [{ width: 38 }, { width: 18 }, { width: 16 }];
          ws.mergeCells("A1:C1"); ws.getCell("A1").value = (emp.nome || "Empresa") + (emp.cnpj ? "  ·  CNPJ " + emp.cnpj : "");
          ws.getCell("A1").font = { bold: true, size: 13, color: { argb: navy } };
          ws.mergeCells("A2:C2"); ws.getCell("A2").value = "BOLETIM DE MEDIÇÃO Nº " + (m.numero || "");
          ws.getCell("A2").font = { bold: true, size: 12, color: { argb: verde } };
          ws.getCell("A3").value = "Obra:"; ws.getCell("B3").value = obra.nome || "—";
          ws.getCell("A4").value = "Cliente:"; ws.getCell("B4").value = obra.clienteNome || "—";
          var hdr = ws.getRow(5); hdr.values = ["Descrição", "Valor (R$)", "% do contrato"];
          hdr.eachCell(function (cell) { cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navy } }; });
          var linhas = [
            ["Valor contratado", c.contratado, c.contratado ? 1 : ""],
            ["Medição anterior (acumulado)", c.anterior, c.contratado ? c.anterior / c.contratado : ""],
            ["Medição atual (Nº " + (m.numero || "") + ")", c.atual, c.contratado ? c.atual / c.contratado : ""],
            ["Acumulado até esta medição", c.acumulado, c.contratado ? c.acumulado / c.contratado : ""],
            ["Saldo a executar", c.saldo, c.contratado ? c.saldo / c.contratado : ""],
            ["Retenção (" + Util.fmtNum(c.retencao, 1) + "%)", c.retVal, ""],
            ["Líquido a faturar", c.liquido, ""]
          ];
          linhas.forEach(function (l, i) {
            var r = ws.getRow(6 + i); r.getCell(1).value = l[0]; r.getCell(2).value = l[1]; r.getCell(2).numFmt = "R$ #,##0.00";
            if (l[2] !== "") { r.getCell(3).value = l[2]; r.getCell(3).numFmt = "0.0%"; }
            if (i === 3 || i === 6) r.font = { bold: true };
          });
          // #18: medição VINCULADA ao orçamento -> aba com os itens medidos (padrão que o
          // contratante espera: ant/período/acum POR ITEM). Medição manual não tem m.itens.
          if (m.itens && m.itens.length) {
            var wi = wb.addWorksheet("Itens Medidos", { views: [{ state: "frozen", ySplit: 2 }] });
            wi.columns = [{ width: 16 }, { width: 11 }, { width: 44 }, { width: 7 }, { width: 12 }, { width: 13 }, { width: 9 }, { width: 10 }, { width: 10 }, { width: 12 }, { width: 14 }];
            wi.mergeCells("A1:K1");
            wi.getCell("A1").value = "ITENS MEDIDOS — Boletim Nº " + (m.numero || "") + (m.orcamentoNumero ? "  ·  Orçamento " + m.orcamentoNumero : "");
            wi.getCell("A1").font = { bold: true, size: 12, color: { argb: navy } };
            var hi = wi.getRow(2); hi.values = ["Etapa", "Código", "Descrição", "Und", "Qtd contr.", "Preço c/ BDI", "% ant.", "% período", "% acum.", "Qtd medida", "Valor (R$)"];
            hi.eachCell(function (cell) { cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: navy } }; });
            var totItens = 0;
            m.itens.forEach(function (it, i) {
              var acum = Util.num(it.pctAnterior) + Util.num(it.pctPeriodo);
              totItens += Util.num(it.valor);
              var r = wi.getRow(3 + i);
              r.values = [it.etapa || "", it.codigo || "", it.descricao || "", it.unidade || "", Util.num(it.qtdContratada), Util.num(it.precoUnit), Util.num(it.pctAnterior) / 100, Util.num(it.pctPeriodo) / 100, acum / 100, Util.num(it.qtdMedida), Util.num(it.valor)];
              r.getCell(5).numFmt = "#,##0.00"; r.getCell(6).numFmt = "R$ #,##0.00"; r.getCell(10).numFmt = "#,##0.00"; r.getCell(11).numFmt = "R$ #,##0.00";
              r.getCell(7).numFmt = "0.0%"; r.getCell(8).numFmt = "0.0%"; r.getCell(9).numFmt = "0.0%";
              if (acum > 100.0001) r.getCell(9).font = { bold: true, color: { argb: "FFB91C1C" } };        // estourou 100% acumulado
              else if (acum >= 99.95) r.getCell(9).font = { color: { argb: verde } };                      // item concluído
            });
            var rt = wi.getRow(3 + m.itens.length);
            rt.getCell(3).value = "TOTAL MEDIDO NESTE BOLETIM"; rt.getCell(3).font = { bold: true };
            rt.getCell(11).value = totItens; rt.getCell(11).numFmt = "R$ #,##0.00"; rt.getCell(11).font = { bold: true, color: { argb: verde } };
          }
          // Aba histórico de medições da obra
          var meds = lista("medicoes").filter(function (x) { return x.obraId === m.obraId; })
            .sort(function (a, b) { return self._medKey(a).localeCompare(self._medKey(b)); });
          var wh = wb.addWorksheet("Histórico", { views: [{ state: "frozen", ySplit: 1 }] });
          wh.columns = [{ width: 10 }, { width: 26 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 12 }];
          var hh = wh.getRow(1); hh.values = ["Nº", "Período", "Atual", "Acumulado", "Saldo", "%"];
          hh.eachCell(function (cell) { cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: verde } }; });
          var acc = 0;
          meds.forEach(function (mm, i) {
            acc += Util.num(mm.valor); var saldo = Math.max(0, c.contratado - acc);
            var r = wh.getRow(2 + i);
            r.values = [mm.numero || (i + 1), (mm.periodoInicio ? mm.periodoInicio.split("-").reverse().join("/") : "") + (mm.periodoFim ? " a " + mm.periodoFim.split("-").reverse().join("/") : ""), Util.num(mm.valor), acc, saldo, c.contratado ? acc / c.contratado : ""];
            r.getCell(3).numFmt = "R$ #,##0.00"; r.getCell(4).numFmt = "R$ #,##0.00"; r.getCell(5).numFmt = "R$ #,##0.00"; r.getCell(6).numFmt = "0.0%";
            if (String(mm.id) === String(m.id)) r.font = { bold: true };
          });
          wb.xlsx.writeBuffer().then(function (buf) {
            var blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
            var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "Medicao_" + (m.numero || "").replace(/[^\w]/g, "") + "_" + (obra.nome || "obra").slice(0, 20).replace(/[^\w]/g, "_") + ".xlsx";
            document.body.appendChild(a); a.click(); document.body.removeChild(a); setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
            UI.toast("Excel de medição gerado!", "ok");
          }).catch(function (e) { UI.toast("Falha ao escrever Excel: " + e.message, "erro"); });
        } catch (e) { UI.toast("Falha ao gerar Excel: " + e.message, "erro"); }
      });
    },
    // =================== DOCUMENTOS (reutilizável) ===================
    // Cabeçalho padrão dos documentos (empresa/logo/CNPJ + título). Usa template do usuário se houver.
    _docShell: function (titulo, accent, corpo, chaveTemplate) {
      var emp = (typeof Empresa !== "undefined" && Empresa.dados) ? Empresa.dados() : {};
      var logo = (typeof Empresa !== "undefined" && Empresa.logoHTML) ? Empresa.logoHTML(48) : "";
      return '<div style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:740px;margin:0 auto;font-size:12px">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid ' + accent + ';padding-bottom:10px;margin-bottom:14px"><div>' + logo + '</div><div style="text-align:center;flex:1"><b style="font-size:14px">' + Util.esc(emp.nome || "") + "</b><br><span style='font-size:9px'>" + (emp.cnpj ? "CNPJ " + Util.esc(emp.cnpj) : "") + (emp.contato ? " · " + Util.esc(emp.contato) : "") + (emp.cidade ? " · " + Util.esc(emp.cidade) : "") + "</span></div><div style='text-align:right'><b style='font-size:13px;color:" + accent + "'>" + titulo + "</b></div></div>"
        + corpo
        + "<div style='text-align:right;font-size:8px;color:#999;margin-top:14px'>Gerado pelo OrçaPRO IA em " + new Date().toLocaleDateString("pt-BR") + "</div></div>";
    },
    _abrirDoc: function (titulo, html) {
      if (typeof App !== "undefined" && App._abrirPrint) App._abrirPrint(titulo, html);
      else { var w = window.open("", "_blank"); if (w) { w.document.write("<html><head><title>" + Util.esc(titulo) + "</title></head><body>" + html + "</body></html>"); w.document.close(); } }
    },
    documentoRequisicao: function (id) {
      var r = Store.obter(eid(), "requisicoes", id); if (!r) return;
      var obra = r.obraId ? Store.obter(eid(), "obras", r.obraId) : null, itens = this._reqItens(r);
      var brd = function (d) { return d ? String(d).split("-").reverse().join("/") : "—"; };
      var rows = itens.map(function (it, i) { return "<tr><td style='border:1px solid #bbb;padding:5px;text-align:center'>" + (i + 1) + "</td><td style='border:1px solid #bbb;padding:5px'>" + (it.codigo ? "<b>" + Util.esc(it.codigo) + "</b> " : "") + Util.esc(it.descricao) + "</td><td style='border:1px solid #bbb;padding:5px;text-align:center'>" + Util.fmtNum(it.quantidade, 2) + "</td><td style='border:1px solid #bbb;padding:5px;text-align:center'>" + Util.esc(it.unidade) + "</td><td style='border:1px solid #bbb;padding:5px;text-align:center'>☐</td></tr>"; }).join("");
      var corpo = "<table style='width:100%;border-collapse:collapse;font-size:12px;margin-bottom:14px'><tr><td style='border:1px solid #bbb;padding:6px;background:#f8fafc;width:18%'><b>Nº</b></td><td style='border:1px solid #bbb;padding:6px'>" + Util.esc(r.numero || "—") + "</td><td style='border:1px solid #bbb;padding:6px;background:#f8fafc;width:16%'><b>Data</b></td><td style='border:1px solid #bbb;padding:6px'>" + brd(r.data) + "</td></tr><tr><td style='border:1px solid #bbb;padding:6px;background:#f8fafc'><b>Obra</b></td><td style='border:1px solid #bbb;padding:6px'>" + Util.esc(obra ? obra.nome : "—") + "</td><td style='border:1px solid #bbb;padding:6px;background:#f8fafc'><b>Prioridade</b></td><td style='border:1px solid #bbb;padding:6px'>" + rot(P.reqPrioridade, r.prioridade) + "</td></tr><tr><td style='border:1px solid #bbb;padding:6px;background:#f8fafc'><b>Solicitante</b></td><td style='border:1px solid #bbb;padding:6px'>" + Util.esc(r.solicitante || "—") + "</td><td style='border:1px solid #bbb;padding:6px;background:#f8fafc'><b>Status</b></td><td style='border:1px solid #bbb;padding:6px'>" + rot(P.reqStatus, r.status) + "</td></tr></table>"
        + "<table style='width:100%;border-collapse:collapse;font-size:12px'><thead><tr style='background:#0f2740;color:#fff'><th style='border:1px solid #bbb;padding:5px;width:8%'>Nº</th><th style='border:1px solid #bbb;padding:5px'>Material / Insumo</th><th style='border:1px solid #bbb;padding:5px;width:14%'>Qtd</th><th style='border:1px solid #bbb;padding:5px;width:12%'>Unid.</th><th style='border:1px solid #bbb;padding:5px;width:12%'>Entregue</th></tr></thead><tbody>" + (rows || "<tr><td colspan='5' style='border:1px solid #bbb;padding:8px;text-align:center'>Sem itens</td></tr>") + "</tbody></table>"
        + (r.observacoes ? "<p style='margin-top:10px;font-size:11px'><b>Obs.:</b> " + Util.esc(r.observacoes) + "</p>" : "")
        + "<div style='display:flex;justify-content:space-between;margin-top:44px;gap:26px'><div style='flex:1;text-align:center;border-top:1px solid #333;padding-top:4px;font-size:11px'>Solicitante</div><div style='flex:1;text-align:center;border-top:1px solid #333;padding-top:4px;font-size:11px'>Aprovado por</div><div style='flex:1;text-align:center;border-top:1px solid #333;padding-top:4px;font-size:11px'>Recebido por</div></div>";
      this._abrirDoc("Solicitação de Compra Nº " + (r.numero || ""), this._docShell("SOLICITAÇÃO DE COMPRA", "#f59e0b", corpo));
    },
    documentoCompra: function (id) {
      var c = Store.obter(eid(), "compras", id); if (!c) return;
      var forn = c.fornecedorId ? Store.obter(eid(), "fornecedores", c.fornecedorId) : null, obra = c.obraId ? Store.obter(eid(), "obras", c.obraId) : null;
      var itens = c.itens || [], brd = function (d) { return d ? String(d).split("-").reverse().join("/") : "—"; };
      var somaItens = itens.reduce(function (s, it) { return s + Util.num(it.quantidade) * Util.num(it.precoRef != null ? it.precoRef : it.valorUnit); }, 0);
      var totalDoc = (itens.length && somaItens > 0) ? somaItens : Util.num(c.valor); // soma dos subtotais quando há preços (documento fecha)
      var rows = itens.length
        ? itens.map(function (it, i) { var vu = Util.num(it.precoRef != null ? it.precoRef : it.valorUnit), sub = Util.num(it.quantidade) * vu; return "<tr><td style='border:1px solid #bbb;padding:5px;text-align:center'>" + (it.codigo || i + 1) + "</td><td style='border:1px solid #bbb;padding:5px'>" + Util.esc(it.descricao) + "</td><td style='border:1px solid #bbb;padding:5px;text-align:center'>" + Util.fmtNum(it.quantidade, 2) + "</td><td style='border:1px solid #bbb;padding:5px;text-align:center'>" + Util.esc(it.unidade) + "</td><td style='border:1px solid #bbb;padding:5px;text-align:right'>" + (vu > 0 ? Util.fmtMoeda(vu) : "—") + "</td><td style='border:1px solid #bbb;padding:5px;text-align:right'>" + (vu > 0 ? Util.fmtMoeda(sub) : "—") + "</td></tr>"; }).join("")
        : "<tr><td style='border:1px solid #bbb;padding:6px;text-align:center'>1</td><td colspan='4' style='border:1px solid #bbb;padding:6px'>" + Util.esc(c.descricao || "—") + "</td><td style='border:1px solid #bbb;padding:6px;text-align:right'>" + Util.fmtMoeda(c.valor) + "</td></tr>";
      var corpo = "<table style='width:100%;border-collapse:collapse;font-size:12px;margin-bottom:14px'><tr><td style='border:1px solid #bbb;padding:6px;background:#f8fafc;width:18%'><b>Pedido Nº</b></td><td style='border:1px solid #bbb;padding:6px'>" + Util.esc(c.numero || "—") + "</td><td style='border:1px solid #bbb;padding:6px;background:#f8fafc;width:16%'><b>Data</b></td><td style='border:1px solid #bbb;padding:6px'>" + brd(c.data) + "</td></tr><tr><td style='border:1px solid #bbb;padding:6px;background:#f8fafc'><b>Fornecedor</b></td><td style='border:1px solid #bbb;padding:6px'>" + Util.esc(forn ? forn.nome : (c.fornecedorNome || "—")) + "</td><td style='border:1px solid #bbb;padding:6px;background:#f8fafc'><b>Obra/Destino</b></td><td style='border:1px solid #bbb;padding:6px'>" + Util.esc(obra ? obra.nome : "—") + "</td></tr>" + (c.previsaoEntrega ? "<tr><td style='border:1px solid #bbb;padding:6px;background:#f8fafc'><b>Prev. entrega</b></td><td style='border:1px solid #bbb;padding:6px'>" + brd(c.previsaoEntrega) + "</td><td style='border:1px solid #bbb;padding:6px;background:#f8fafc'><b>Pagamento</b></td><td style='border:1px solid #bbb;padding:6px'>" + Util.esc(rot(P.formaPgto, c.formaPgto) || "—") + "</td></tr>" : "") + "</table>"
        + "<table style='width:100%;border-collapse:collapse;font-size:12px'><thead><tr style='background:#0f2740;color:#fff'><th style='border:1px solid #bbb;padding:5px;width:10%'>Cód.</th><th style='border:1px solid #bbb;padding:5px'>Descrição</th><th style='border:1px solid #bbb;padding:5px;width:10%'>Qtd</th><th style='border:1px solid #bbb;padding:5px;width:8%'>Un</th><th style='border:1px solid #bbb;padding:5px;width:14%'>V. unit</th><th style='border:1px solid #bbb;padding:5px;width:14%'>Subtotal</th></tr></thead><tbody>" + rows + "<tr style='background:#eef4fa;font-weight:bold'><td colspan='5' style='border:1px solid #bbb;padding:6px;text-align:right'>TOTAL GERAL</td><td style='border:1px solid #bbb;padding:6px;text-align:right'>" + Util.fmtMoeda(totalDoc) + "</td></tr></tbody></table>"
        + (c.obs ? "<p style='margin-top:10px;font-size:11px'><b>Obs.:</b> " + Util.esc(c.obs) + "</p>" : "")
        + "<div style='display:flex;justify-content:space-between;margin-top:44px;gap:30px'><div style='flex:1;text-align:center;border-top:1px solid #333;padding-top:4px;font-size:11px'>Solicitante</div><div style='flex:1;text-align:center;border-top:1px solid #333;padding-top:4px;font-size:11px'>Aprovação</div></div>";
      this._abrirDoc("Pedido de Compra Nº " + (c.numero || ""), this._docShell("PEDIDO DE COMPRA", "#7c3aed", corpo));
    },
    // Exporta uma lista (array de objetos) em CSV (BOM UTF-8, separador ;) — reutilizável por módulo.
    _exportarCSV: function (dados, nomeArquivo, colunas) {
      if (!dados || !dados.length) { UI.toast("Nada para exportar.", "erro"); return; }
      var linhas = [colunas.map(function (c) { return '"' + String(c.label).replace(/"/g, '""') + '"'; }).join(";")];
      dados.forEach(function (item) {
        linhas.push(colunas.map(function (c) {
          var val = typeof c.get === "function" ? c.get(item) : item[c.key];
          if (val == null) val = "";
          if (typeof val === "number") val = String(val).replace(".", ",");
          return '"' + String(val).replace(/"/g, '""') + '"';
        }).join(";"));
      });
      var blob = new Blob(["﻿" + linhas.join("\r\n")], { type: "text/csv;charset=utf-8;" });
      var a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = nomeArquivo + "_" + new Date().toISOString().slice(0, 10) + ".csv";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      UI.toast("CSV exportado.", "ok");
    },
    exportarModulo: function (modulo) {
      var self = this, dados, cols, nome;
      if (modulo === "financeiro") { dados = lista("financeiro"); nome = "financeiro"; cols = [{ label: "Data", key: "data" }, { label: "Descrição", key: "desc" }, { label: "Tipo", get: function (x) { return rot(P.finTipo, x.tipo); } }, { label: "Categoria", get: function (x) { return rot(P.finCategoria, x.categoria); } }, { label: "Valor", key: "valor" }, { label: "Status", get: function (x) { return rot(P.finStatus, x.status); } }]; }
      else if (modulo === "compras") { dados = lista("compras"); nome = "compras"; cols = [{ label: "Nº", key: "numero" }, { label: "Fornecedor", key: "fornecedorNome" }, { label: "Descrição", key: "descricao" }, { label: "Valor", key: "valor" }, { label: "Status", get: function (x) { return rot(P.compraStatus, x.status); } }]; }
      else if (modulo === "medicoes") { dados = lista("medicoes"); nome = "medicoes"; cols = [{ label: "Nº", key: "numero" }, { label: "Obra", get: function (x) { return (Store.obter(eid(), "obras", x.obraId) || {}).nome || ""; } }, { label: "Período", get: function (x) { return (x.periodoInicio || "") + " a " + (x.periodoFim || ""); } }, { label: "%", key: "percentual" }, { label: "Valor", key: "valor" }, { label: "Status", get: function (x) { return rot(P.medicaoStatus, x.status); } }]; }
      else return;
      this._exportarCSV(dados, nome, cols);
    },
    // =================== FINANCEIRO ===================
    renderFinanceiro: function () {
      var fs = lista("financeiro").slice().sort(function (a, b) { return (b.data || "").localeCompare(a.data || ""); });
      var obras = lista("obras");
      var rec = fs.filter(function (f) { return f.tipo === "receita"; }).reduce(function (s, f) { return s + Util.num(f.valor); }, 0);
      var desp = fs.filter(function (f) { return f.tipo === "despesa"; }).reduce(function (s, f) { return s + Util.num(f.valor); }, 0);
      var extra = '<button class="btn sm" data-gacao="doc-financeiro" style="margin-right:10px;align-self:center;background:#0f2740;color:#fff">📄 Lançar de documento (IA)</button>' +
        '<button class="btn sm" data-gacao="export-financeiro" style="margin-right:10px;align-self:center">📥 CSV</button>' +
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
    // Etapas do orçamento vinculado à obra (para apropriar custo por etapa)
    _etapasDaObra: function (obraId) {
      if (!obraId) return [];
      var obra = Store.obter(eid(), "obras", obraId); if (!obra || !obra.orcamentoId) return [];
      var orc = Store.obterOrcamento ? Store.obterOrcamento(eid(), obra.orcamentoId) : null;
      if (!orc || !orc.etapas) return [];
      return Util.arr(orc.etapas).map(function (e) { return { id: e.id, nome: (e.codigo ? e.codigo + " " : "") + (e.nome || "") }; });
    },
    _etapaOptsHtml: function (etapas, selId) {
      var o = '<option value="">— não apropriado —</option>';
      Util.arr(etapas).forEach(function (e) { o += '<option value="' + Util.esc(e.id) + '"' + (e.id === selId ? " selected" : "") + ">" + Util.esc(e.nome) + "</option>"; });
      return o;
    },
    formFinanceiro: function (f) {
      f = f || {}; var self = this, obras = lista("obras"), contratos = lista("contratos");
      var hoje = new Date().toISOString().slice(0, 10);
      var etapasIni = this._etapasDaObra(f.obraId);
      var corpo =
        '<div class="row">' + campo("Data", inp("g-data", f.data || hoje, "", "date")) + campo("Tipo", sel("g-tipo", opts(P.finTipo, f.tipo || "despesa"))) + "</div>" +
        campo("Descrição *", inp("g-desc", f.desc)) +
        '<div class="row">' + campo("Categoria", sel("g-cat", opts(P.finCategoria, f.categoria || "material"))) + campo("Valor (R$) *", inp("g-valor", f.valor)) + campo("Status", sel("g-status", opts(P.finStatus, f.status || "pago"))) + "</div>" +
        '<div class="row">' + campo("Obra", sel("g-obra", optsRec(obras, "nome", f.obraId, "— nenhuma —"))) + campo("Contrato", sel("g-contrato", optsRec(contratos, "numero", f.contratoId, "— nenhum —"))) + "</div>" +
        '<div class="row">' + campo("Etapa do orçamento", '<select id="g-etapa">' + this._etapaOptsHtml(etapasIni, f.etapaId) + "</select>") + campo("Fornecedor / Cliente", inp("g-forn", f.fornecedor)) + "</div>" +
        '<div class="row">' + campo("Forma de pagamento", sel("g-forma", '<option value="">—</option>' + opts(P.formaPgto, f.formaPgto))) + "</div>" +
        campo("Observações", '<textarea id="g-obs" rows="2">' + Util.esc(f.obs || "") + "</textarea>");
      this._modalForm("financeiro", f, "Lançamento", corpo, function (obj) {
        obj.desc = v("g-desc"); if (!obj.desc) { UI.toast("Informe a descrição.", "erro"); return false; }
        obj.data = v("g-data"); obj.tipo = v("g-tipo"); obj.categoria = v("g-cat"); obj.valor = nv("g-valor"); obj.status = v("g-status");
        obj.obraId = v("g-obra"); obj.contratoId = v("g-contrato"); obj.etapaId = v("g-etapa"); obj.fornecedor = v("g-forn"); obj.formaPgto = v("g-forma"); obj.obs = v("g-obs");
        return true;
      });
      // Ao trocar a obra, repovoa as etapas do orçamento vinculado (mantém "não apropriado" quando a obra não tem orçamento)
      var selObra = document.getElementById("g-obra"), selEt = document.getElementById("g-etapa");
      if (selObra && selEt) selObra.onchange = function () { selEt.innerHTML = self._etapaOptsHtml(self._etapasDaObra(selObra.value), ""); };
    },

    // =================== PREVISTO × REALIZADO (por etapa do orçamento) ===================
    // Motor puro e testável: para uma obra com orçamento vinculado, cruza o custo
    // direto previsto de cada etapa (Σ qtd×custoUnit) com as despesas do Financeiro
    // apropriadas àquela etapa (f.etapaId). Despesas sem etapa caem em "Não apropriado".
    _previstoRealDados: function (obraId) {
      var obra = obraId ? Store.obter(eid(), "obras", obraId) : null;
      if (!obra) return { erro: "sem-obra" };
      var orc = obra.orcamentoId && Store.obterOrcamento ? Store.obterOrcamento(eid(), obra.orcamentoId) : null;
      if (!orc || !Util.arr(orc.etapas).length) return { erro: "sem-orcamento", obra: obra };
      // previsto por etapa (custo direto, sem BDI) — a mesma base de "custo real"
      var etapas = Util.arr(orc.etapas).map(function (e) {
        var prev = 0;
        Util.arr(e.itens).forEach(function (it) { prev += Util.num(it.quantidade) * Util.num(it.custoUnitario); });
        return { id: e.id, nome: (e.codigo ? e.codigo + " " : "") + (e.nome || "Etapa"), previsto: prev, realizado: 0 };
      });
      var idx = {}; etapas.forEach(function (e) { idx[e.id] = e; });
      var naoApropriado = 0;
      lista("financeiro").forEach(function (f) {
        if (f.tipo !== "despesa" || f.obraId !== obraId) return;
        var val = Util.num(f.valor);
        if (f.etapaId && idx[f.etapaId]) idx[f.etapaId].realizado += val;
        else naoApropriado += val;
      });
      var totPrev = 0, totReal = 0;
      etapas.forEach(function (e) {
        e.saldo = e.previsto - e.realizado;
        e.pct = e.previsto > 0 ? (e.realizado / e.previsto * 100) : (e.realizado > 0 ? 999 : 0);
        e.estouro = e.realizado > e.previsto + 0.005;
        totPrev += e.previsto; totReal += e.realizado;
      });
      totReal += naoApropriado;
      return {
        obra: obra, orc: orc, etapas: etapas, naoApropriado: naoApropriado,
        totalPrevisto: totPrev, totalRealizado: totReal, saldoTotal: totPrev - totReal
      };
    },
    renderPrevistoReal: function () {
      var obras = lista("obras");
      var self = this;
      // obra selecionada persiste no módulo (default: 1ª com orçamento vinculado)
      var comOrc = obras.filter(function (o) { return o.orcamentoId; });
      if (this._prSel == null) this._prSel = (comOrc[0] && comOrc[0].id) || (obras[0] && obras[0].id) || "";
      var sel = '<select data-gacao="pr-troca-obra" style="max-width:280px">' +
        obras.map(function (o) { return '<option value="' + Util.esc(o.id) + '"' + (o.id === self._prSel ? " selected" : "") + ">" + Util.esc(o.nome) + (o.orcamentoId ? "" : " (sem orçamento)") + "</option>"; }).join("") + "</select>";
      var html = this._head(svg("previstoreal") + "Previsto × Realizado", "", "", '<span class="muted" style="align-self:center;margin-right:10px">Obra:</span>' + sel);
      if (!obras.length) return html + vazioBox("Nenhuma obra ainda", "", "Crie uma obra e vincule um orçamento");
      var d = this._previstoRealDados(this._prSel);
      if (d.erro === "sem-orcamento") return html + '<div class="card"><p class="muted">Esta obra não tem orçamento vinculado. Abra a obra em <b>Obras</b> e escolha um orçamento no campo "Vincular a um orçamento" — aí o previsto por etapa aparece aqui.</p></div>';
      if (d.erro) return html + vazioBox("Selecione uma obra", "", "");
      // cabeçalho de totais
      var corSaldo = d.saldoTotal >= 0 ? "var(--verde)" : "var(--vermelho)";
      html += '<div class="kpis kpis-g" style="margin-bottom:14px">' +
        '<div class="kpi custo"><div class="rotulo">Previsto (custo direto)</div><div class="num">' + Util.fmtMoeda(d.totalPrevisto) + "</div></div>" +
        '<div class="kpi"><div class="rotulo">Realizado (gasto real)</div><div class="num">' + Util.fmtMoeda(d.totalRealizado) + "</div></div>" +
        '<div class="kpi destaque"><div class="rotulo">Saldo</div><div class="num" style="color:' + corSaldo + '">' + Util.fmtMoeda(d.saldoTotal) + "</div></div>" +
        "</div>";
      html += '<div class="card"><table class="tbl"><thead><tr><th>Etapa</th><th class="num">Previsto</th><th class="num">Realizado</th><th style="width:34%">Consumo</th><th class="num">Saldo</th></tr></thead><tbody>';
      d.etapas.forEach(function (e) {
        var largura = Math.min(100, Math.round(e.pct));
        var cor = e.estouro ? "var(--vermelho)" : (e.pct >= 85 ? "#f59e0b" : "var(--verde)");
        var pctTxt = e.previsto > 0 ? (Math.round(e.pct) + "%") : (e.realizado > 0 ? "s/ previsto" : "—");
        var barra = '<div style="background:#eef2f7;border-radius:99px;height:16px;overflow:hidden;position:relative">' +
          '<div style="height:100%;width:' + largura + '%;background:' + cor + ';border-radius:99px;transition:width .3s"></div>' +
          '<span style="position:absolute;right:8px;top:0;font-size:11px;line-height:16px;color:#334155;font-weight:700">' + pctTxt + (e.estouro ? " ⚠" : "") + "</span></div>";
        html += "<tr><td><b>" + Util.esc(e.nome) + "</b></td>" +
          '<td class="num">' + Util.fmtMoeda(e.previsto) + '</td><td class="num">' + Util.fmtMoeda(e.realizado) + "</td>" +
          "<td>" + barra + '</td><td class="num" style="color:' + (e.saldo >= 0 ? "var(--verde)" : "var(--vermelho)") + ';font-weight:600">' + Util.fmtMoeda(e.saldo) + "</td></tr>";
      });
      if (d.naoApropriado > 0.005) {
        html += '<tr style="background:#fff7ed"><td><b>Não apropriado</b> <span class="muted" title="Despesas da obra sem etapa escolhida no lançamento">ⓘ</span></td>' +
          '<td class="num muted">—</td><td class="num">' + Util.fmtMoeda(d.naoApropriado) + '</td><td><span class="muted" style="font-size:12px">escolha a etapa ao lançar no Financeiro para apropriar</span></td><td class="num muted">—</td></tr>';
      }
      html += '</tbody><tfoot><tr class="tot"><td><b>TOTAL</b></td><td class="num"><b>' + Util.fmtMoeda(d.totalPrevisto) + '</b></td><td class="num"><b>' + Util.fmtMoeda(d.totalRealizado) + '</b></td><td></td><td class="num" style="color:' + corSaldo + '"><b>' + Util.fmtMoeda(d.saldoTotal) + "</b></td></tr></tfoot></table></div>";
      return html;
    },
    prTrocaObra: function (obraId) { this._prSel = obraId; App.render(); },

    // =================== GALERIA DE FOTOS (por obra) ===================
    // Motor puro: junta todas as fotos dos RDOs da obra num fluxo plano,
    // mais recente primeiro, cada uma com sua legenda, data e diário de origem.
    _galeriaFotos: function (obraId, filtro) {
      var f = (filtro || "").trim().toLowerCase();
      var out = [];
      lista("rdo").forEach(function (r) {
        if (r.obraId !== obraId) return;
        Util.arr(r.fotos).forEach(function (foto, i) {
          if (!foto || !foto.d) return;
          var leg = foto.leg || "";
          if (f && (leg.toLowerCase().indexOf(f) < 0) && (String(r.numero || "").toLowerCase().indexOf(f) < 0)) return;
          out.push({ d: foto.d, leg: leg, data: r.data || "", rdoNumero: r.numero || "", rdoId: r.id, idxNoRdo: i });
        });
      });
      out.sort(function (a, b) { return String(b.data).localeCompare(String(a.data)); });
      return out;
    },
    // Agrupa por mês (YYYY-MM) preservando a ordem desc.
    _galeriaPorMes: function (fotos) {
      var grupos = [], mapa = {};
      fotos.forEach(function (ft) {
        var chave = (ft.data || "0000-00").slice(0, 7);
        if (!mapa[chave]) { mapa[chave] = { chave: chave, fotos: [] }; grupos.push(mapa[chave]); }
        mapa[chave].fotos.push(ft);
      });
      return grupos;
    },
    _rotuloMes: function (yyyymm) {
      if (!/^\d{4}-\d{2}$/.test(yyyymm)) return "Sem data";
      var meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
      var p = yyyymm.split("-");
      return meses[(+p[1]) - 1] + "/" + p[0];
    },
    renderGaleria: function () {
      var obras = lista("obras"), self = this;
      if (this._galSel == null) this._galSel = (obras[0] && obras[0].id) || "";
      if (this._galFiltro == null) this._galFiltro = "";
      var sel = '<select data-gacao="galeria-troca-obra" style="max-width:280px">' +
        obras.map(function (o) { return '<option value="' + Util.esc(o.id) + '"' + (o.id === self._galSel ? " selected" : "") + ">" + Util.esc(o.nome) + "</option>"; }).join("") + "</select>";
      var totObra = this._galeriaFotos(this._galSel, "").length;
      var btnRel = totObra ? '<button class="btn sm" data-gacao="galeria-relatorio" style="margin-right:8px">🖨 Relatório fotográfico</button>' : "";
      var html = this._head(svg("galeria") + "Galeria de Fotos", "", "", btnRel + '<span class="muted" style="align-self:center;margin-right:10px">Obra:</span>' + sel);
      if (!obras.length) return html + vazioBox("Nenhuma obra ainda", "", "Crie uma obra e registre diários com fotos");
      if (!totObra) return html + '<div class="card"><p class="muted">Esta obra ainda não tem fotos. As fotos aparecem aqui automaticamente quando você anexa imagens aos <b>Diários de Obra (RDO)</b> desta obra.</p></div>';
      html += '<div class="card" style="margin-bottom:12px"><input id="gal-filtro" placeholder="🔍 Filtrar por legenda ou nº do diário" value="' + Util.esc(this._galFiltro) + '" style="width:100%;max-width:360px"></div>';
      html += '<div id="gal-grid">' + this._galeriaGridHtml(this._galSel, this._galFiltro) + "</div>";
      return html;
    },
    _galeriaGridHtml: function (obraId, filtro) {
      var self = this;
      var fotos = this._galeriaFotos(obraId, filtro);
      this._galFotos = fotos; // usado pelo lightbox p/ navegar
      if (!fotos.length) return '<div class="card"><p class="muted">Nenhuma foto com esse filtro.</p></div>';
      var idxGlobal = 0, html = "";
      this._galeriaPorMes(fotos).forEach(function (g) {
        html += '<div style="margin-bottom:6px;font-weight:700;color:#334155">' + self._rotuloMes(g.chave) + ' <span class="muted" style="font-weight:400">· ' + g.fotos.length + " foto" + (g.fotos.length > 1 ? "s" : "") + "</span></div>";
        html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;margin-bottom:18px">';
        g.fotos.forEach(function (ft) {
          var gi = idxGlobal++;
          html += '<figure style="margin:0;border:1px solid var(--linha);border-radius:10px;overflow:hidden;cursor:pointer;background:#fff" data-gacao="galeria-abrir" data-idx="' + gi + '" title="' + Util.esc(ft.leg || "Ampliar") + '">'
            + '<img src="' + ft.d + '" loading="lazy" style="width:100%;height:110px;object-fit:cover;display:block">'
            + '<figcaption style="padding:5px 7px;font-size:11px;color:#475569;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + (ft.leg ? Util.esc(ft.leg) : '<span class="muted">sem legenda</span>') + '<br><span class="muted" style="font-size:10px">' + (ft.data ? ft.data.split("-").reverse().join("/") : "") + (ft.rdoNumero ? " · " + Util.esc(ft.rdoNumero) : "") + "</span></figcaption></figure>";
        });
        html += "</div>";
      });
      return html;
    },
    galeriaTrocaObra: function (obraId) { this._galSel = obraId; this._galFiltro = ""; App.render(); },
    _galeriaWire: function () {
      var self = this, inp = document.getElementById("gal-filtro");
      if (inp && !inp._wired) {
        inp._wired = true;
        inp.oninput = function () {
          self._galFiltro = inp.value;
          var grid = document.getElementById("gal-grid");
          if (grid) grid.innerHTML = self._galeriaGridHtml(self._galSel, self._galFiltro);
        };
      }
    },
    galeriaAbrir: function (idx) {
      var fotos = this._galFotos || [];
      idx = Math.max(0, Math.min(fotos.length - 1, +idx || 0));
      this._galLbIdx = idx;
      this._galeriaLightbox();
    },
    galeriaNav: function (dir) {
      var fotos = this._galFotos || []; if (!fotos.length) return;
      this._galLbIdx = (this._galLbIdx + (dir === "prev" ? -1 : 1) + fotos.length) % fotos.length;
      this._galeriaLightbox();
    },
    galeriaFecharLb: function () {
      var ov = document.getElementById("gal-lightbox"); if (ov) ov.parentNode.removeChild(ov);
      document.onkeydown = this._galKeyPrev || null; this._galKeyPrev = null;
    },
    _galeriaLightbox: function () {
      var self = this, fotos = this._galFotos || [], ft = fotos[this._galLbIdx]; if (!ft) return;
      var ov = document.getElementById("gal-lightbox");
      if (!ov) {
        ov = document.createElement("div"); ov.id = "gal-lightbox";
        ov.style.cssText = "position:fixed;inset:0;background:rgba(8,15,26,.92);z-index:9000;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px";
        document.body.appendChild(ov);
        this._galKeyPrev = document.onkeydown;
        document.onkeydown = function (e) {
          if (e.key === "Escape") self.galeriaFecharLb();
          else if (e.key === "ArrowLeft") self.galeriaNav("prev");
          else if (e.key === "ArrowRight") self.galeriaNav("next");
        };
        ov.onclick = function (e) { if (e.target === ov) self.galeriaFecharLb(); };
      }
      var nome = "foto-" + (ft.rdoNumero || "obra") + "-" + (this._galLbIdx + 1) + ".jpg";
      var legTxt = (ft.leg ? Util.esc(ft.leg) : "Sem legenda") + '<span style="opacity:.7"> · ' + (ft.data ? ft.data.split("-").reverse().join("/") : "") + (ft.rdoNumero ? " · " + Util.esc(ft.rdoNumero) : "") + " · " + (this._galLbIdx + 1) + "/" + fotos.length + "</span>";
      ov.innerHTML =
        '<div style="position:absolute;top:14px;right:16px;display:flex;gap:10px">' +
          '<a href="' + ft.d + '" download="' + nome + '" class="btn sm" style="background:#fff;color:#0f2740" onclick="event.stopPropagation()">⬇ Baixar</a>' +
          '<button class="btn sm" data-gacao="galeria-fechar" style="background:#fff;color:#0f2740">✕ Fechar</button>' +
        "</div>" +
        '<button class="btn" data-gacao="galeria-nav" data-dir="prev" style="position:absolute;left:14px;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.15);color:#fff;font-size:20px;padding:8px 14px">‹</button>' +
        '<img src="' + ft.d + '" style="max-width:88vw;max-height:78vh;object-fit:contain;border-radius:8px;box-shadow:0 20px 60px rgba(0,0,0,.5)">' +
        '<button class="btn" data-gacao="galeria-nav" data-dir="next" style="position:absolute;right:14px;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.15);color:#fff;font-size:20px;padding:8px 14px">›</button>' +
        '<div style="color:#fff;margin-top:14px;font-size:13px;text-align:center;max-width:80vw">' + legTxt + "</div>";
    },
    galeriaRelatorio: function () {
      var obraId = this._galSel, obra = Store.obter(eid(), "obras", obraId); if (!obra) return;
      var fotos = this._galeriaFotos(obraId, "");
      if (!fotos.length) { UI.toast("Esta obra não tem fotos.", "erro"); return; }
      var brd = function (d) { return d ? String(d).split("-").reverse().join("/") : ""; };
      var corpo = '<table style="width:100%;font-size:12px;margin-bottom:12px"><tr><td><b>Obra:</b> ' + Util.esc(obra.nome || "—") + "</td><td><b>Total de fotos:</b> " + fotos.length + "</td></tr>"
        + (obra.local || obra.endereco ? '<tr><td colspan="2"><b>Local:</b> ' + Util.esc(obra.local || obra.endereco) + "</td></tr>" : "") + "</table>";
      var self = this;
      this._galeriaPorMes(fotos).forEach(function (g) {
        corpo += '<div style="font-weight:800;font-size:11px;letter-spacing:.4px;margin:14px 0 6px;border-bottom:1px solid #ddd;padding-bottom:3px">' + self._rotuloMes(g.chave).toUpperCase() + " (" + g.fotos.length + ")</div>"
          + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">';
        g.fotos.forEach(function (ft, i) {
          corpo += '<figure style="margin:0;border:1px solid #ddd;border-radius:6px;overflow:hidden;page-break-inside:avoid">'
            + '<img src="' + ft.d + '" style="width:100%;max-height:220px;object-fit:cover;display:block">'
            + '<figcaption style="padding:4px 8px;font-size:10px;color:#555">' + brd(ft.data) + (ft.rdoNumero ? " · " + Util.esc(ft.rdoNumero) : "") + (ft.leg ? " — " + Util.esc(ft.leg) : "") + "</figcaption></figure>";
        });
        corpo += "</div>";
      });
      this._abrirDoc("Relatório Fotográfico — " + (obra.nome || ""), this._docShell("RELATÓRIO FOTOGRÁFICO", "#0f2740", corpo));
    },

    // =================== BIM 3D / 4D ===================
    // Aba BIM na Gestão: monta o viewer in-app (js/bim.js → window.BIM) num canvas
    // e sobrepõe o timeline 4D (motor BIM4D). Cadeia in-app 100% minha; o bim/bim.html
    // da NF8n fica como demo standalone dela. Sem viewer carregado → aviso amigável.
    renderBim: function () {
      var self = this, obras = lista("obras");
      if (this._bimSel == null) this._bimSel = (obras.filter(function (o) { return o.orcamentoId; })[0] || obras[0] || {}).id || "";
      var sel = '<select data-gacao="bim-troca-obra" style="max-width:260px">' +
        '<option value="">— sem cronograma (sequência padrão) —</option>' +
        obras.map(function (o) { return '<option value="' + Util.esc(o.id) + '"' + (o.id === self._bimSel ? " selected" : "") + ">" + Util.esc(o.nome) + (o.orcamentoId ? "" : " (sem orçamento)") + "</option>"; }).join("") + "</select>";
      var extra = '<span class="muted" style="align-self:center;margin-right:10px">Cronograma da obra (4D):</span>' + sel;
      var html = this._head(svg("bim") + "BIM 3D / 4D", "", "", extra);
      html += '<div style="display:grid;grid-template-columns:1fr;gap:12px">';
      html += '<div class="card" style="padding:0;overflow:hidden;border-radius:14px">' +
        '<div id="bim-canvas" style="width:100%;height:min(64vh,580px);position:relative;background:#0b1a2b;display:flex;align-items:center;justify-content:center">' +
        '<div id="bim-aviso" style="color:#8fa3b8;text-align:center;font-size:14px;padding:20px"><div style="font-size:34px;margin-bottom:8px">🏗️</div>Carregando o visualizador 3D…</div>' +
        '<div id="bim-info" style="position:absolute;left:10px;top:52px;background:rgba(15,39,64,.9);color:#fff;border-radius:8px;padding:7px 11px;font-size:12px;display:none;max-width:260px;z-index:4"></div>' +
        "</div></div>";
      html += '<div class="card" id="bim-4d" style="display:none">' +
        '<div class="flex between" style="align-items:center;margin-bottom:8px"><h3 style="margin:0">🎬 Simulação 4D <span class="muted" style="font-weight:400;font-size:13px">— avanço da obra no tempo</span></h3>' +
        '<span><span id="bim-custo" class="g-pill" style="background:#2e6f9e22;color:#2e6f9e;margin-right:6px;display:none"></span><span id="bim-avanco" class="g-pill" style="background:#16a34a22;color:#16a34a">0%</span></span></div>' +
        '<div class="flex" style="gap:10px;align-items:center">' +
        '<button class="btn sm" id="bim-play">▶ Play</button>' +
        '<input type="range" id="bim-slider" min="0" max="100" value="0" style="flex:1">' +
        '<span id="bim-semana" class="muted" style="min-width:130px;text-align:right;font-size:13px">Semana 0</span></div>' +
        '<div id="bim-legenda" style="display:flex;flex-wrap:wrap;gap:10px;margin-top:12px;font-size:12px"></div>' +
        '<div id="bim-curva" style="margin-top:12px"></div>' +
        "</div>";
      html += '<div class="card" id="bim-clash" style="display:none">' +
        '<div class="flex between" style="align-items:center;margin-bottom:8px"><h3 style="margin:0">🧩 Compatibilização <span class="muted" style="font-weight:400;font-size:13px">— conflitos entre disciplinas</span></h3>' +
        '<button class="btn sm primary" id="bim-clash-run">🔍 Rodar compatibilização</button></div>' +
        '<div id="bim-clash-res"><p class="muted" style="font-size:12.5px;margin:0">Detecta interferências geométricas entre <b>Estrutura</b>, <b>Arquitetura</b> e <b>Instalações</b> (ex.: tubo atravessando viga, duto embutido em pilar). Clique em <b>Rodar</b>.</p></div>' +
        "</div>";
      html += '<div class="card" id="bim-qto" style="display:none">' +
        '<div class="flex between" style="align-items:center;margin-bottom:8px"><h3 style="margin:0">📐 Quantitativos <span class="muted" style="font-weight:400;font-size:13px">— levantamento automático do modelo</span></h3>' +
        '<button class="btn sm primary" id="bim-qto-run">📊 Levantar quantitativos</button></div>' +
        '<div id="bim-qto-res"><p class="muted" style="font-size:12.5px;margin:0">Conta e mede cada disciplina do modelo (paredes m², vigas m, portas un…) e monta um orçamento pra você casar no SINAPI. Clique em <b>Levantar</b>.</p></div>' +
        "</div>";
      html += "</div>";
      html += '<p class="muted" style="font-size:12.5px;margin-top:10px">Carregue um modelo <b>.IFC</b> (exportado do Revit/pyRevit) no visualizador — use <b>Carregar exemplo</b> pra testar. Navegue em <b>Órbita</b> ou <b>Voo</b> (WASD+mouse), duplo-clique num elemento pra ver as propriedades. Depois arraste o tempo e veja a obra se construir por etapa; as fases seguem o <b>cronograma do orçamento vinculado</b> à obra (ou a sequência padrão).</p>';
      return html;
    },
    bimTrocaObra: function (obraId) { this._bimSel = obraId; if (this._bimElementos && this._bimElementos.length) this._bimReplanejar(); },
    _bimReplanejar: function () {
      if (!this._bimElementos || !this._bimElementos.length) return;
      var crono = null, obra = this._bimSel ? Store.obter(eid(), "obras", this._bimSel) : null;
      if (obra && obra.orcamentoId && Store.obterOrcamento && typeof Cronograma !== "undefined" && Cronograma.estimar) {
        var orc = Store.obterOrcamento(eid(), obra.orcamentoId);
        if (orc) { try { crono = Cronograma.estimar(orc).etapas; } catch (e) { crono = null; } }
      }
      this._bimPlano = BIM4D.planejar(this._bimElementos, crono);
      this._bimRenderTimeline();
    },
    _bimRenderTimeline: function () {
      var p = this._bimPlano; if (!p) return;
      var sl = document.getElementById("bim-slider"); if (sl) { sl.max = String(p.semanas); sl.value = String(p.semanas); }
      var leg = document.getElementById("bim-legenda");
      if (leg) {
        var nEx = p.elementos.filter(function (e) { return e.exato; }).length, nTot = p.elementos.length;
        var selo = nEx
          ? '<span title="Elementos com etapa carimbada no Revit (property OrcaPRO_Etapa) casada com o cronograma — 4D preciso, não estimado" style="display:inline-flex;align-items:center;gap:5px;background:rgba(34,197,94,.16);color:#16a34a;font-weight:700;border-radius:99px;padding:2px 10px;margin-right:6px">🏷️ 4D exato: ' + nEx + "/" + nTot + " carimbados</span>"
          : '<span class="muted" title="Nenhum elemento carimbado — 4D estimado pela categoria do tipo IFC. Para 4D preciso, use no Revit os botões “Criar Campos OrçaPRO” + “Exportar IFC p/ OrçaPRO”." style="margin-right:6px">📐 4D estimado por tipo</span>';
        leg.innerHTML = selo + p.fases.map(function (f) {
          return '<span style="display:inline-flex;align-items:center;gap:5px"><span style="width:11px;height:11px;border-radius:3px;background:' + f.cor + ';display:inline-block"></span>' + Util.esc(f.nome) + ' <span class="muted">(' + f.qtd + ")</span></span>";
        }).join("");
      }
      var box = document.getElementById("bim-4d"); if (box) box.style.display = "";
      var bcx = document.getElementById("bim-clash"); if (bcx) bcx.style.display = "";
      var bqx = document.getElementById("bim-qto"); if (bqx) bqx.style.display = "";
      this._bimCurva = BIM4D.curva(p);
      this._bimAplicarSemana(p.semanas);
    },
    // Curva S: avanço físico (verde) × financeiro (azul) ao longo do tempo + marcador da semana atual.
    _bimCurvaSvg: function (cv, semAtual) {
      if (!cv) return "";
      var W = 320, H = 96, pl = 30, pr = 8, pt = 8, pb = 16, iw = W - pl - pr, ih = H - pt - pb, n = cv.semanas || 1;
      function X(w) { return pl + (w / n) * iw; }
      function Y(v) { return pt + ih - (Math.max(0, Math.min(100, v)) / 100) * ih; }
      function poly(arr, cor) {
        var pts = []; for (var w = 0; w < arr.length; w++) if (arr[w] != null) pts.push(X(w).toFixed(1) + "," + Y(arr[w]).toFixed(1));
        return pts.length ? '<polyline points="' + pts.join(" ") + '" fill="none" stroke="' + cor + '" stroke-width="2" stroke-linejoin="round"/>' : "";
      }
      var g = "";
      [0, 25, 50, 75, 100].forEach(function (v) { g += '<line x1="' + pl + '" y1="' + Y(v).toFixed(1) + '" x2="' + (W - pr) + '" y2="' + Y(v).toFixed(1) + '" stroke="#e2e8f0" stroke-width="1"/><text x="' + (pl - 4) + '" y="' + (Y(v) + 3).toFixed(1) + '" text-anchor="end" font-size="8" fill="#94a3b8">' + v + "</text>"; });
      var marca = semAtual != null ? '<line x1="' + X(semAtual).toFixed(1) + '" y1="' + pt + '" x2="' + X(semAtual).toFixed(1) + '" y2="' + (pt + ih) + '" stroke="#0f2740" stroke-width="1" stroke-dasharray="3 2"/>' : "";
      var legFin = cv.temCusto ? '<span style="display:inline-flex;align-items:center;gap:4px"><span style="width:14px;height:2px;background:#2e6f9e;display:inline-block"></span>Financeiro (custo)</span>' : "";
      return '<div class="muted" style="font-size:12px;margin-bottom:4px">Curva S — avanço no tempo</div>' +
        '<svg viewBox="0 0 ' + W + " " + H + '" style="width:100%;max-width:520px;height:auto;background:#fff;border:1px solid var(--linha,#e2e8f0);border-radius:8px">' +
        g + poly(cv.financeiro, "#2e6f9e") + poly(cv.fisico, "#16a34a") + marca + "</svg>" +
        '<div style="display:flex;gap:14px;margin-top:5px;font-size:11px;color:#475569"><span style="display:inline-flex;align-items:center;gap:4px"><span style="width:14px;height:2px;background:#16a34a;display:inline-block"></span>Físico (execução)</span>' + legFin + "</div>";
    },
    _bimAplicarSemana: function (sem) {
      var p = this._bimPlano; if (!p) return;
      sem = Math.max(0, Math.min(p.semanas, +sem || 0));
      var est = BIM4D.estadoEm(p, sem);
      if (window.BIM && BIM.aplicarEstado) { try { BIM.aplicarEstado(est); } catch (e) {} }
      var av = document.getElementById("bim-avanco"); if (av) av.textContent = BIM4D.avancoEm(p, sem) + "%";
      // 5D-lite: custo acumulado no tempo (só quando há orçamento vinculado com custo)
      var cst = document.getElementById("bim-custo");
      if (cst) {
        if (p.custoTotal > 0) { cst.style.display = ""; cst.textContent = Util.fmtMoeda(BIM4D.custoEm(p, sem)) + " / " + Util.fmtMoeda(p.custoTotal); }
        else cst.style.display = "none";
      }
      var lb = document.getElementById("bim-semana"); if (lb) lb.textContent = "Semana " + sem + " / " + p.semanas;
      var cv = document.getElementById("bim-curva"); if (cv && this._bimCurva) cv.innerHTML = this._bimCurvaSvg(this._bimCurva, sem);
    },
    // Compatibilização: roda o motor BIMClash sobre os elementos (com AABB) e lista os conflitos.
    _bimCompatibilizar: function () {
      var res = document.getElementById("bim-clash-res"); if (!res) return;
      if (typeof BIMClash === "undefined") { res.innerHTML = '<p class="muted">Motor de compatibilização não carregado.</p>'; return; }
      var els = (this._bimElementos || []).filter(function (e) { return e && e.aabb; });
      if (!els.length) { res.innerHTML = '<p class="muted" style="font-size:12.5px;margin:0">Carregue um modelo <b>.IFC</b> no visualizador acima primeiro.</p>'; return; }
      var r; try { r = BIMClash.detectar(els); } catch (e) { res.innerHTML = '<p class="muted">Falha ao analisar: ' + Util.esc(String(e)) + "</p>"; return; }
      this._bimClashes = r.clashes;
      var byId = {}; els.forEach(function (e) { byId[e.id] = e; });
      if (!r.total) { res.innerHTML = '<div style="padding:6px 0"><span class="g-pill" style="background:#16a34a22;color:#16a34a;font-weight:700">✓ Nenhum conflito entre disciplinas</span> <span class="muted" style="font-size:12.5px">— ' + els.length + " elementos analisados (folga 5 mm).</span></div>"; return; }
      var cor = { grave: "#dc2626", media: "#f59e0b", leve: "#64748b" }, nome = { grave: "graves", media: "médios", leve: "leves" };
      var chips = ["grave", "media", "leve"].filter(function (s) { return r.severidade[s]; }).map(function (s) {
        return '<span class="g-pill" style="background:' + cor[s] + '22;color:' + cor[s] + ';font-weight:700">' + r.severidade[s] + " " + nome[s] + "</span>";
      }).join(" ");
      var pares = Object.keys(r.porPar).sort(function (a, b) { return r.porPar[b] - r.porPar[a]; }).map(function (p) {
        return '<span class="muted" style="font-size:12px">' + Util.esc(p) + ": <b>" + r.porPar[p] + "</b></span>";
      }).join(" · ");
      var LIM = 80, linhas = this._bimClashes.slice(0, LIM).map(function (c, i) {
        var a = byId[c.aId] || {}, b = byId[c.bId] || {}, descA = a.nome || a.tipo || c.aId, descB = b.nome || b.tipo || c.bId;
        return '<tr class="lin"><td><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:' + cor[c.severidade] + '"></span></td>' +
          "<td>" + Util.esc(c.par) + '</td><td style="font-size:12px">' + Util.esc(String(descA)) + " ✕ " + Util.esc(String(descB)) + "</td>" +
          '<td class="num">' + (c.penetracao * 100).toFixed(1) + " cm</td>" +
          '<td><button class="btn sm" data-clash="' + i + '">👁 ver</button></td></tr>';
      }).join("");
      res.innerHTML =
        '<div class="flex" style="gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px"><b style="font-size:15px">' + r.total + " conflito(s)</b> " + chips + '<span style="flex:1"></span><button class="btn sm ghost" data-clash-limpar="1">✖ limpar destaque</button></div>' +
        (pares ? '<div style="margin-bottom:8px">' + pares + "</div>" : "") +
        '<div style="max-height:280px;overflow:auto"><table class="tbl"><thead><tr><th></th><th>Disciplinas</th><th>Elementos</th><th class="num">Penetração</th><th></th></tr></thead><tbody>' + linhas + "</tbody></table></div>" +
        (r.total > LIM ? '<p class="muted" style="font-size:11.5px;margin:6px 0 0">Mostrando os ' + LIM + " piores de " + r.total + " (ordenados por penetração).</p>" : "") +
        '<p class="muted" style="font-size:11px;margin:6px 0 0">🔎 Clash por envelope (AABB) — 1º nível, rápido; interferências <b>prováveis</b>, confira no 3D. Entre disciplinas diferentes, folga de 5 mm.</p>';
    },
    // Quantitativos: roda o motor BIMQto sobre os elementos (com AABB) e lista o levantamento por disciplina.
    _bimQuantificar: function () {
      var res = document.getElementById("bim-qto-res"); if (!res) return;
      if (typeof BIMQto === "undefined") { res.innerHTML = '<p class="muted">Motor de quantitativos não carregado.</p>'; return; }
      var els = this._bimElementos || [];
      if (!els.length) { res.innerHTML = '<p class="muted" style="font-size:12.5px;margin:0">Carregue um modelo <b>.IFC</b> no visualizador acima primeiro.</p>'; return; }
      var r; try { r = BIMQto.levantar(els); } catch (e) { res.innerHTML = '<p class="muted">Falha ao levantar: ' + Util.esc(String(e)) + "</p>"; return; }
      this._bimQto = r;
      if (!r.linhas.length) { res.innerHTML = '<p class="muted">Nenhum elemento reconhecido para levantamento.</p>'; return; }
      var chip = { ifc: '<span class="pill sinapi" title="Medido do modelo (BaseQuantities do IFC)">medido</span>', estimado: '<span class="pill proprio" title="Estimado pela caixa envolvente do elemento — revise">estimado</span>', misto: '<span class="pill proprio" title="Parte medido, parte estimado">misto</span>', contagem: '<span class="pill outra">contagem</span>', "sem-medida": '<span class="pill outra">s/ medida</span>' };
      var linhas = r.linhas.map(function (l) {
        var alt = (l.alternativas || []).map(function (a) { return Util.fmtNum(a.quantidade, 2) + " " + a.unidade; }).join(" · ");
        return '<tr class="lin"><td>' + Util.esc(l.categoria) + (alt ? '<br><span class="muted" style="font-size:11px">ou ' + Util.esc(alt) + "</span>" : "") + "</td>" +
          '<td class="num">' + Util.fmtNum(l.quantidade, l.medida === "contagem" ? 0 : 2) + "</td><td>" + Util.esc(l.unidade) + "</td>" +
          '<td class="num">' + l.nElementos + "</td><td>" + (chip[l.fonte] || Util.esc(l.fonte)) + "</td></tr>";
      }).join("");
      var avisos = (r.avisos || []).map(function (a) { return '<p class="muted" style="font-size:11.5px;margin:4px 0 0">⚠️ ' + Util.esc(a) + "</p>"; }).join("");
      res.innerHTML =
        '<div class="flex" style="gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px"><b style="font-size:15px">' + r.linhas.length + " serviços · " + r.resumo.nElementos + ' elementos</b><span style="flex:1"></span>' +
        '<button class="btn sm success" id="bim-qto-lancar">✅ Lançar no orçamento</button></div>' +
        '<div style="max-height:300px;overflow:auto"><table class="tbl"><thead><tr><th>Disciplina / serviço</th><th class="num">Qtd</th><th>Un</th><th class="num">Elem.</th><th>Fonte</th></tr></thead><tbody>' + linhas + "</tbody></table></div>" +
        avisos +
        '<p class="muted" style="font-size:11px;margin:6px 0 0">📐 Levantamento automático — o custo entra zerado; case no SINAPI ou informe o preço no editor. <b>"estimado"</b> = medido pela caixa do elemento (revise).</p>';
    },
    _bimVerClash: function (i) {
      var c = this._bimClashes && this._bimClashes[i]; if (!c) return;
      if (window.BIM && BIM.focarClash) { try { BIM.focarClash([c.aId, c.bId]); } catch (e) {} }
      var box = document.getElementById("bim-info");
      if (box) { box.style.display = ""; box.innerHTML = "<b>🧩 Conflito · " + Util.esc(c.par) + "</b><br><span style='opacity:.85'>Penetração " + (c.penetracao * 100).toFixed(1) + " cm · " + Util.esc(c.severidade) + "</span>"; }
    },
    _bimLimparClash: function () {
      if (window.BIM && BIM.limparClash) { try { BIM.limparClash(); } catch (e) {} }
      if (window.BIM && BIM.mostrarTudo) { try { BIM.mostrarTudo(); } catch (e) {} }
      var box = document.getElementById("bim-info"); if (box) box.style.display = "none";
    },
    _bimWire: function () {
      var self = this, canvas = document.getElementById("bim-canvas"); if (!canvas) return;
      // slider + play
      var sl = document.getElementById("bim-slider");
      if (sl) sl.oninput = function () { self._bimAplicarSemana(+sl.value); };
      var play = document.getElementById("bim-play");
      if (play) play.onclick = function () {
        if (self._bimTimer) { clearInterval(self._bimTimer); self._bimTimer = null; play.textContent = "▶ Play"; return; }
        play.textContent = "⏸ Pausar"; var s0 = document.getElementById("bim-slider"); if (s0 && +s0.value >= +s0.max) s0.value = "0";
        self._bimTimer = setInterval(function () {
          var s = document.getElementById("bim-slider"); if (!s) { clearInterval(self._bimTimer); self._bimTimer = null; return; }
          var v = +s.value + 1; if (v > +s.max) { clearInterval(self._bimTimer); self._bimTimer = null; play.textContent = "▶ Play"; return; }
          s.value = String(v); self._bimAplicarSemana(v);
        }, 700);
      };
      // compatibilização (clash): botão rodar + delegação dos cliques "ver"/"limpar"
      var crun = document.getElementById("bim-clash-run");
      if (crun) crun.onclick = function () { self._bimCompatibilizar(); };
      var cres = document.getElementById("bim-clash-res");
      if (cres) cres.onclick = function (e) {
        var b = e.target.closest("[data-clash]"); if (b) { self._bimVerClash(+b.getAttribute("data-clash")); return; }
        if (e.target.closest("[data-clash-limpar]")) self._bimLimparClash();
      };
      // quantitativos: botão levantar + delegação do "lançar no orçamento"
      var qrun = document.getElementById("bim-qto-run");
      if (qrun) qrun.onclick = function () { self._bimQuantificar(); };
      var qres = document.getElementById("bim-qto-res");
      if (qres) qres.onclick = function (e) {
        if (e.target.closest("#bim-qto-lancar")) {
          var obra = self._bimSel ? Store.obter(eid(), "obras", self._bimSel) : null;
          if (window.App && App.criarOrcamentoDoBIM) App.criarOrcamentoDoBIM(self._bimQto, obra && obra.nome);
        }
      };
      // monta o viewer (js/bim.js é módulo ES — pode não ter carregado ainda; poll curto)
      var tentativas = 0;
      function montarViewer() {
        if (window.BIM && BIM.montar) {
          var aviso = document.getElementById("bim-aviso"); if (aviso) aviso.style.display = "none";
          BIM.montar(canvas, {
            onLoaded: function (elementos) { self._bimElementos = (elementos || []).filter(function (e) { return e && e.tipo; }); self._bimReplanejar(); },
            onPick: function (info) {
              var box = document.getElementById("bim-info"); if (!box) return;
              if (!info) { box.style.display = "none"; return; }
              box.style.display = ""; box.innerHTML = "<b>" + Util.esc(info.nome || info.tipo || "Elemento") + "</b><br><span style='opacity:.85'>" + Util.esc(BIM4D.nomeCat(BIM4D.catDoTipo(info.tipo))) + " · " + Util.esc(info.tipo || "") + "</span>" + (info.etapa ? "<br><span style='display:inline-block;margin-top:4px;background:rgba(34,197,94,.18);color:#16a34a;font-weight:700;font-size:11px;padding:2px 8px;border-radius:99px'>🏷️ Etapa: " + Util.esc(info.etapa) + " · carimbo OrçaPRO</span>" : "") + (info.globalId ? "<br><span style='opacity:.6;font-size:11px'>" + Util.esc(info.globalId) + "</span>" : "");
            }
          });
          // re-home: se o modelo já estava carregado (reentrou na aba / App.render), o onLoaded não
          // refira — re-popula o timeline 4D a partir do que o viewer já tem.
          try { var jaCarregado = BIM.elementos; if (jaCarregado && jaCarregado.length) { self._bimElementos = jaCarregado.filter(function (e) { return e && e.tipo; }); self._bimReplanejar(); } } catch (e) {}
          return;
        }
        if (tentativas++ < 60) setTimeout(montarViewer, 200);
        else { var a = document.getElementById("bim-aviso"); if (a) a.innerHTML = '<div style="font-size:34px;margin-bottom:8px">🏗️</div>Não consegui iniciar o visualizador 3D. Atualize o app para a versão mais recente e tente de novo; se persistir, abra um IFC em outro navegador.'; }
      }
      montarViewer();
    },

    // =================== TAREFAS ===================
    _hojeISO: function () { return new Date().toISOString().slice(0, 10); },
    // Data de HOJE no fuso LOCAL (evita off-by-one noturno do toISOString/UTC nas comparações de prazo).
    _hojeLocal: function () { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); },
    // Atrasada = tem prazo, o prazo já passou e a tarefa não está concluída/cancelada.
    _tarefaAtrasada: function (t) {
      if (!t.prazo || t.status === "feita" || t.status === "cancelada") return false;
      return String(t.prazo) < this._hojeLocal();
    },
    _tarefasFiltradas: function (filtro, obraId) {
      var self = this, ts = lista("tarefas");
      ts = ts.filter(function (t) {
        if (obraId && t.obraId !== obraId) return false;
        if (filtro === "afazer") return t.status === "afazer" || t.status === "fazendo";
        if (filtro === "atrasadas") return self._tarefaAtrasada(t);
        if (filtro === "feitas") return t.status === "feita";
        return true; // todas
      });
      var ordP = { urgente: 0, alta: 1, normal: 2, baixa: 3 };
      ts.sort(function (a, b) {
        var aa = self._tarefaAtrasada(a) ? 0 : 1, bb = self._tarefaAtrasada(b) ? 0 : 1;
        if (aa !== bb) return aa - bb;                       // atrasadas primeiro
        var pa = String(a.prazo || "9999"), pb = String(b.prazo || "9999");
        if (pa !== pb) return pa < pb ? -1 : 1;              // prazo mais próximo primeiro
        return (ordP[a.prioridade] || 2) - (ordP[b.prioridade] || 2);
      });
      return ts;
    },
    renderTarefas: function () {
      var self = this, obras = lista("obras");
      if (this._tarFiltro == null) this._tarFiltro = "afazer";
      if (this._tarObra == null) this._tarObra = "";
      var todas = lista("tarefas");
      var nAtras = todas.filter(function (t) { return self._tarefaAtrasada(t); }).length;
      var cont = {
        todas: todas.length,
        afazer: todas.filter(function (t) { return t.status === "afazer" || t.status === "fazendo"; }).length,
        atrasadas: nAtras,
        feitas: todas.filter(function (t) { return t.status === "feita"; }).length
      };
      var chip = function (k, rot) { return '<button class="btn sm' + (self._tarFiltro === k ? " primary" : "") + '" data-gacao="tar-filtro" data-val="' + k + '">' + rot + ' <b>' + cont[k] + "</b></button>"; };
      var selObra = '<select data-gacao="tar-obra" style="max-width:220px"><option value="">Todas as obras</option>' +
        obras.map(function (o) { return '<option value="' + Util.esc(o.id) + '"' + (o.id === self._tarObra ? " selected" : "") + ">" + Util.esc(o.nome) + "</option>"; }).join("") + "</select>";
      var extra = (nAtras ? '<span class="g-pill" style="background:#dc262622;color:#dc2626;align-self:center;margin-right:10px">⚠ ' + nAtras + " atrasada" + (nAtras > 1 ? "s" : "") + "</span>" : "") + selObra;
      var html = this._head(svg("tarefas") + "Tarefas", "nova-tarefa", "Nova tarefa", extra);
      html += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:-4px 0 14px">' + chip("afazer", "A fazer") + chip("atrasadas", "Atrasadas") + chip("feitas", "Concluídas") + chip("todas", "Todas") + "</div>";
      var ts = this._tarefasFiltradas(this._tarFiltro, this._tarObra);
      if (!ts.length) return html + vazioBox(todas.length ? "Nenhuma tarefa neste filtro" : "Nenhuma tarefa ainda", "nova-tarefa", "Criar primeira tarefa");
      var cols = lista("colaboradores");
      html += '<table class="tbl"><thead><tr><th>Tarefa</th><th>Responsável</th><th>Obra</th><th>Prazo</th><th>Prioridade</th><th>Status</th><th></th></tr></thead><tbody>';
      ts.forEach(function (t) {
        var resp = cols.filter(function (c) { return c.id === t.responsavelId; })[0];
        var ob = obras.filter(function (o) { return o.id === t.obraId; })[0];
        var atras = self._tarefaAtrasada(t);
        var prazoTxt = t.prazo ? t.prazo.split("-").reverse().join("/") : "—";
        var corPrz = atras ? ' style="color:#dc2626;font-weight:700"' : "";
        var corPri = t.prioridade === "urgente" ? "#dc2626" : (t.prioridade === "alta" ? "#ea580c" : "#64748b");
        var acao = "";
        if (t.status === "afazer") acao = '<button class="btn sm" data-gacao="tar-fazer" data-id="' + t.id + '">▶ Iniciar</button> <button class="btn sm success" data-gacao="tar-concluir" data-id="' + t.id + '">✓ Concluir</button>';
        else if (t.status === "fazendo") acao = '<button class="btn sm success" data-gacao="tar-concluir" data-id="' + t.id + '">✓ Concluir</button>';
        else if (t.status === "feita") acao = '<button class="btn sm" data-gacao="tar-reabrir" data-id="' + t.id + '">↺ Reabrir</button>';
        html += '<tr><td style="cursor:pointer" data-gopen="tarefas:' + t.id + '"><b>' + Util.esc(t.titulo || "—") + "</b>" + (atras ? ' <span title="Prazo vencido">⚠</span>' : "") + "</td><td>" + Util.esc(resp ? resp.nome : "—") + "</td><td>" + Util.esc(ob ? ob.nome : "—") + "</td><td" + corPrz + ">" + prazoTxt + '</td><td><b style="color:' + corPri + '">' + rot(P.tarefaPrioridade, t.prioridade) + "</b></td><td>" + pill(t.status) + '</td><td class="num">' + acao + "</td></tr>";
      });
      return html + "</tbody></table>";
    },
    tarTrocaFiltro: function (k) { this._tarFiltro = k; App.render(); },
    tarTrocaObra: function (obraId) { this._tarObra = obraId; App.render(); },
    novoTarefa: function () { this.formTarefa(null); },
    formTarefa: function (t) {
      t = t || {}; var obras = lista("obras"), cols = lista("colaboradores");
      var corpo =
        campo("Tarefa *", inp("g-titulo", t.titulo, "Ex.: Comprar cimento para a laje")) +
        '<div class="row">' + campo("Responsável", sel("g-resp", optsRec(cols, "nome", t.responsavelId, "— ninguém —"))) + campo("Obra", sel("g-obra", optsRec(obras, "nome", t.obraId, "— nenhuma —"))) + "</div>" +
        '<div class="row">' + campo("Prazo", inp("g-prazo", t.prazo, "", "date")) + campo("Prioridade", sel("g-prio", opts(P.tarefaPrioridade, t.prioridade || "normal"))) + campo("Status", sel("g-status", opts(P.tarefaStatus, t.status || "afazer"))) + "</div>" +
        campo("Detalhes", '<textarea id="g-desc" rows="3">' + Util.esc(t.descricao || "") + "</textarea>");
      this._modalForm("tarefas", t, "Tarefa", corpo, function (obj) {
        obj.titulo = v("g-titulo"); if (!obj.titulo) { UI.toast("Informe a tarefa.", "erro"); return false; }
        obj.responsavelId = v("g-resp"); obj.obraId = v("g-obra"); obj.prazo = v("g-prazo");
        obj.prioridade = v("g-prio"); obj.status = v("g-status"); obj.descricao = v("g-desc");
        return true;
      });
    },
    _tarefaStatus: function (id, novo, msg) {
      var t = Store.obter(eid(), "tarefas", id); if (!t) return;
      t.status = novo;
      if (novo === "feita") t.concluidaEm = this._hojeISO(); else if (novo !== "feita") t.concluidaEm = "";
      Store.salvar(eid(), "tarefas", t); App.render(); UI.toast(msg, "ok");
    },

    // =================== CENTRAL DE AJUDA (G7 app-side) ===================
    _AJUDA_FAQ: [
      { p: "Como crio meu primeiro orçamento?", r: "No menu <b>Orçamentos</b>, clique em <b>Novo orçamento</b>. Descreva a obra no <b>Escopo Inteligente</b> (texto livre) ou adicione itens direto com <b>+ Item</b>, buscando no SINAPI por código ou descrição." },
      { p: "De onde vêm os preços?", r: "Da base <b>SINAPI oficial da Caixa</b>, na competência e UF que você escolher — mais SICRO, SEINFRA-CE, SETOP-MG e SUDECAP-BH. Nada é inventado: item sem correspondência fica marcado como pendente para você decidir." },
      { p: "O que é o BDI e como configuro?", r: "BDI é a taxa que cobre custos indiretos, impostos e lucro sobre o custo direto. Na aba <b>BDI & Parâmetros</b> você usa o modelo do <b>Acórdão TCU 2.622/2013</b> ou o <b>DNIT</b>, e o preço de venda recalcula na hora." },
      { p: "Posso editar a planilha no Excel e trazer de volta?", r: "Sim — esse é um diferencial exclusivo. Exporte o Excel, ajuste quantidades ou custos, e use <b>📥 Reimportar</b>: o sistema mostra cada mudança para você revisar antes de aplicar." },
      { p: "Como gero a proposta comercial?", r: "Com o orçamento pronto e um cliente vinculado, o botão <b>Gerar Proposta Comercial</b> monta o PDF com a sua marca — capa, escopo, condições comerciais e assinatura." },
      { p: "O que é o Portal do Cliente?", r: "No plano <b>Plus</b>, em <b>Obras</b> → <b>Portal do cliente</b>, você publica um resumo da obra (andamento, medições, diário com fotos) e o SEU cliente acompanha online com login próprio." },
      { p: "Como registro o Diário de Obra (RDO)?", r: "No módulo <b>Diário (RDO)</b>, crie um novo com clima, efetivo, atividades, ocorrências e fotos. Sai impresso com a identidade da sua empresa e as fotos alimentam o Portal do Cliente." },
      { p: "Como faço uma medição?", r: "No módulo <b>Medições</b>, vincule o orçamento e informe o % executado por item no período. O boletim sai no padrão do contratante (anterior, período, acumulado, saldo) e avisa se algum item passar de 100%." },
      { p: "Onde vejo o Previsto × Realizado por etapa?", r: "No módulo <b>Previsto × Real</b>: escolha a obra e veja, por etapa do orçamento, o custo previsto contra o gasto real em barras — com alerta de estouro." },
      { p: "Funciona offline?", r: "Sim. O sistema roda no seu navegador e seus dados ficam salvos no seu computador. A sincronização na nuvem é opcional (Plus, 3 aparelhos)." },
      { p: "Meus dados ficam salvos onde?", r: "No armazenamento local do seu navegador, no seu computador — nada é enviado sem você mandar. Faça backups pelo menu quando quiser. No Plus, dá para sincronizar entre PC, celular e tablet." },
      { p: "Como adiciono alguém da minha equipe?", r: "No módulo <b>Usuários</b> (só o administrador), crie o sub-usuário com login, senha e os <b>módulos liberados</b>. Marque <b>“pode aprovar”</b> se ele puder aprovar medições, compras e requisições." },
      { p: "Como atualizo a base SINAPI?", r: "A base acompanha as competências publicadas pela Caixa. Você escolhe a competência e a UF no orçamento; quando sai uma nova, é só selecioná-la." },
      { p: "Como recupero minha licença?", r: "Acesse <b>/recuperar</b> na página do OrçaPRO com o e-mail da compra, ou fale com o suporte no WhatsApp." }
    ],
    _ajudaChecklist: function () {
      var orcs = (Store.listarOrcamentos ? Store.listarOrcamentos(eid()) : []) || [];
      var temItem = orcs.some(function (o) { return Util.arr(o.etapas).some(function (e) { return Util.arr(e.itens).length; }); });
      var obras = lista("obras");
      return [
        { label: "Criar o primeiro orçamento", feito: orcs.length > 0, dica: "Menu Orçamentos → Novo orçamento", view: "orcamentos" },
        { label: "Adicionar itens (SINAPI ou Escopo Inteligente)", feito: temItem, dica: "Abra um orçamento e use + Item ou cole o escopo", view: "orcamentos" },
        { label: "Cadastrar uma obra", feito: obras.length > 0, dica: "Menu Obras → Nova obra (vincule o orçamento)", view: "obras" },
        { label: "Registrar um Diário de Obra (RDO)", feito: lista("rdo").length > 0, dica: "Menu Diário (RDO) → Novo", view: "rdo" },
        { label: "Fazer uma medição", feito: lista("medicoes").length > 0, dica: "Menu Medições → Nova medição", view: "medicoes" },
        { label: "Publicar o Portal do Cliente", feito: obras.some(function (o) { return o.portalUser; }), dica: "Em Obras, botão Portal do cliente", view: "obras" }
      ];
    },
    renderAjuda: function () {
      var self = this;
      if (this._ajudaFiltro == null) this._ajudaFiltro = "";
      var html = this._head(svg("ajuda") + "Central de Ajuda", "", "", "");
      // checklist de primeiros passos (auto-detectado dos seus dados)
      var chk = this._ajudaChecklist(), feitos = chk.filter(function (c) { return c.feito; }).length;
      var pct = Math.round(feitos / chk.length * 100);
      html += '<div class="card" style="margin-bottom:14px"><h3 style="margin:0 0 4px">🚀 Primeiros passos <span class="muted" style="font-weight:400">' + feitos + "/" + chk.length + "</span></h3>" +
        '<div style="background:#eef2f7;border-radius:99px;height:10px;overflow:hidden;margin:8px 0 12px"><div style="height:100%;width:' + pct + '%;background:var(--verde,#16a34a);border-radius:99px;transition:width .3s"></div></div>';
      html += chk.map(function (c) {
        return '<div style="display:flex;align-items:center;gap:10px;padding:5px 0">' +
          '<span style="font-size:16px">' + (c.feito ? "✅" : "⬜") + "</span>" +
          '<span style="' + (c.feito ? "color:#16a34a;text-decoration:line-through" : "") + '">' + Util.esc(c.label) + "</span>" +
          (c.feito ? "" : ' <button class="btn sm" data-view="' + c.view + '" style="margin-left:auto">Ir →</button> <span class="muted" style="font-size:12px;flex:none">' + Util.esc(c.dica) + "</span>") +
          "</div>";
      }).join("") + "</div>";
      // FAQ pesquisável
      html += '<div class="card"><h3 style="margin:0 0 8px">Perguntas frequentes</h3>' +
        '<input id="ajuda-q" placeholder="🔍 Buscar na ajuda (ex.: BDI, medição, portal)" value="' + Util.esc(this._ajudaFiltro) + '" style="width:100%;max-width:420px;margin-bottom:12px">' +
        '<div id="ajuda-faq">' + this._ajudaFaqHtml(this._ajudaFiltro) + "</div></div>";
      // suporte
      html += '<div class="card" style="margin-top:12px"><h3 style="margin:0 0 6px">Ainda precisa de ajuda?</h3>' +
        '<p class="muted" style="margin:0 0 10px;font-size:14px">Fale direto com o Eng. Rogério (CREA-MG 323736) no WhatsApp — resposta rápida em horário comercial.</p>' +
        '<a class="btn sm primary" href="https://wa.me/553492869383" target="_blank" rel="noopener">💬 Falar no WhatsApp</a>' +
        '<span class="muted" style="font-size:12px;margin-left:12px">🎬 Tutoriais em vídeo: em breve.</span></div>';
      return html;
    },
    _ajudaFaqHtml: function (filtro) {
      var f = (filtro || "").trim().toLowerCase();
      var itens = this._AJUDA_FAQ.filter(function (x) {
        if (!f) return true;
        return (x.p + " " + x.r).toLowerCase().indexOf(f) > -1;
      });
      if (!itens.length) return '<p class="muted">Nada encontrado. Tente outra palavra ou fale no WhatsApp.</p>';
      return itens.map(function (x) {
        return '<details class="feat" style="margin-bottom:6px"><summary style="cursor:pointer;font-weight:600;padding:8px 0">' + Util.esc(x.p) + "</summary><div style=\"padding:4px 0 10px;color:#475569;font-size:14px\">" + x.r + "</div></details>";
      }).join("");
    },
    _ajudaWire: function () {
      var self = this, inp = document.getElementById("ajuda-q");
      if (inp && !inp._wired) {
        inp._wired = true;
        inp.oninput = function () {
          self._ajudaFiltro = inp.value;
          var box = document.getElementById("ajuda-faq");
          if (box) box.innerHTML = self._ajudaFaqHtml(self._ajudaFiltro);
        };
      }
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
      var extra = '<button class="btn sm" data-gacao="export-compras" style="margin-right:10px;align-self:center">📥 CSV</button><span class="muted" style="margin-right:12px;align-self:center">Em aberto: <b>' + pend + "</b> · Total: <b>" + Util.fmtMoeda(total) + "</b></span>";
      var html = this._head(svg("compras") + "Compras", "nova-compra", "Novo pedido", extra);
      if (!cs.length) return html + vazioBox("Nenhum pedido de compra", "nova-compra", "Criar primeiro pedido");
      html += '<table class="tbl"><thead><tr><th>Nº</th><th>Fornecedor</th><th>Obra</th><th>Descrição</th><th class="num">Valor</th><th>Status</th><th></th></tr></thead><tbody>';
      cs.forEach(function (c) {
        var ob = obras.filter(function (o) { return o.id === c.obraId; })[0];
        var acao = '<button class="btn sm" data-gacao="doc-compra" data-id="' + c.id + '" title="Gerar Pedido de Compra">🖨</button> ' + (c.status === "cotacao" ? '<button class="btn sm primary" data-gacao="aprovar-compra" data-id="' + c.id + '">Aprovar</button> <button class="btn sm" data-gacao="rejeitar-compra" data-id="' + c.id + '" style="color:#dc2626">Rejeitar</button>'
          : (c.status === "aprovado" ? '<button class="btn sm success" data-gacao="receber-compra" data-id="' + c.id + '">Receber</button>' : (c.status === "recebido" ? "✓" : (c.status === "rejeitado" ? '<span class="muted" title="' + Util.esc(c.motivoRejeicao || "") + '">✕ rejeitado</span>' : ""))));
        html += '<tr><td style="cursor:pointer" data-gopen="compras:' + c.id + '"><b>' + Util.esc(c.numero || "—") + "</b></td><td>" + Util.esc(c.fornecedorNome || "—") + "</td><td>" + Util.esc(ob ? ob.nome : "—") + "</td><td>" + Util.esc(c.descricao || "—") + '</td><td class="num">' + Util.fmtMoeda(c.valor) + "</td><td>" + pill(c.status) + '</td><td class="num">' + acao + "</td></tr>";
      });
      return html + "</tbody></table>";
    },
    novoCompra: function () { this.formCompra(null); },
    formCompra: function (c) {
      var self = this;
      c = c || {}; var stAntigo = c.status || ""; var forn = lista("fornecedores"), obras = lista("obras");
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
        if (!self._gateStatusForm(obj, stAntigo)) return false; // G3 fix: aprovar/rejeitar pelo form exige permissão + auditoria
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
        var acao = (r.status === "rascunho" ? '<button class="btn sm success" data-gacao="finalizar-rdo" data-id="' + r.id + '">Finalizar</button> ' : "✓ ")
          + '<button class="btn sm" data-gacao="imprimir-rdo" data-id="' + r.id + '" title="Diário impresso profissional (com fotos e assinaturas)">🖨</button>';
        html += '<tr><td style="cursor:pointer" data-gopen="rdo:' + r.id + '"><b>' + Util.esc(r.numero || "—") + "</b></td><td>" + Util.esc(r.data ? r.data.split("-").reverse().join("/") : "—") + "</td><td>" + Util.esc(ob ? ob.nome : "—") + "</td><td>" + Util.esc(clima) + '</td><td class="num">' + ef + "</td><td>" + Util.esc(resumo || "—") + nf + "</td><td>" + pill(r.status) + '</td><td class="num">' + acao + "</td></tr>";
      });
      return html + "</tbody></table>";
    },
    // RDO ENTREGÁVEL (benchmark concorrência): diário impresso profissional —
    // identificação completa, clima/efetivo, atividades, ocorrências em destaque,
    // FOTOS com legenda e campo de assinaturas. É o documento que protege o
    // engenheiro em juízo e impressiona a fiscalização.
    imprimirRdo: function (id) {
      var r = Store.obter(eid(), "rdo", id); if (!r) return;
      var ob = Store.obter(eid(), "obras", r.obraId) || {};
      var cli = ob.clienteId ? (Store.obter(eid(), "clientes", ob.clienteId) || {}) : {};
      var ct = lista("contratos").filter(function (c) { return c.obraId === r.obraId; })[0] || {};
      var dt = r.data ? new Date(r.data + "T00:00:00") : null;
      var dataExt = dt ? dt.toLocaleDateString("pt-BR") + " (" + dt.toLocaleDateString("pt-BR", { weekday: "long" }) + ")" : "—";
      var efDir = Util.num(r.efetivoDireto), efInd = Util.num(r.efetivoIndireto);
      function linhaId(rot2, val) { return '<tr><td style="padding:3px 8px;color:#666;white-space:nowrap">' + rot2 + '</td><td style="padding:3px 8px;font-weight:700">' + Util.esc(val || "—") + "</td></tr>"; }
      function bloco(tit, txt, borda) {
        return '<div style="margin-top:10px;border:1px solid ' + (borda || "#ddd") + ';border-radius:6px;overflow:hidden">'
          + '<div style="background:#f1f5f9;padding:5px 10px;font-weight:800;font-size:11px;letter-spacing:.4px">' + tit + "</div>"
          + '<div style="padding:8px 10px;white-space:pre-wrap;min-height:26px">' + Util.esc(txt || "—") + "</div></div>";
      }
      var temOcorrencia = r.ocorrencias && !/^sem ocorr/i.test(String(r.ocorrencias).trim());
      var corpo =
        '<table style="width:100%;border-collapse:collapse;font-size:12px;border:1px solid #ddd;border-radius:6px">'
        + linhaId("Obra", ob.nome) + linhaId("Cliente", cli.nome || ob.clienteNome)
        + linhaId("Local", ob.endereco || ob.local) + (ct.numero ? linhaId("Contrato", ct.numero) : "")
        + linhaId("Data", dataExt) + linhaId("Responsável", r.responsavel || ob.responsavel)
        + "</table>"
        + '<div style="display:flex;gap:10px;margin-top:10px;font-size:12px">'
        + '<div style="flex:1;border:1px solid #ddd;border-radius:6px;padding:8px 10px"><b>Clima</b><br>Manhã: ' + Util.esc(rot(P.rdoClima, r.climaManha) || "—") + '<br>Tarde: ' + Util.esc(rot(P.rdoClima, r.climaTarde) || "—") + "</div>"
        + '<div style="flex:1;border:1px solid #ddd;border-radius:6px;padding:8px 10px"><b>Efetivo em obra</b><br>Direto: ' + efDir + " · Indireto: " + efInd + '<br><b>Total: ' + (efDir + efInd) + " pessoas</b></div></div>"
        + bloco("ATIVIDADES EXECUTADAS", r.atividades)
        + bloco("OCORRÊNCIAS / OBSERVAÇÕES" + (temOcorrencia ? " ⚠" : ""), r.ocorrencias, temOcorrencia ? "#f59e0b" : "#ddd")
        + (r.equipamentos ? bloco("EQUIPAMENTOS EM USO", r.equipamentos) : "");
      var fotos = (r.fotos || []).filter(function (f) { return f && f.d; });
      if (fotos.length) {
        corpo += '<div style="margin-top:10px"><div style="font-weight:800;font-size:11px;letter-spacing:.4px;margin-bottom:6px">REGISTRO FOTOGRÁFICO (' + fotos.length + ")</div>"
          + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">';
        fotos.forEach(function (f, i) {
          corpo += '<figure style="margin:0;border:1px solid #ddd;border-radius:6px;overflow:hidden;page-break-inside:avoid">'
            + '<img src="' + f.d + '" style="width:100%;max-height:230px;object-fit:cover;display:block">'
            + '<figcaption style="padding:4px 8px;font-size:10px;color:#555">Foto ' + (i + 1) + (f.leg ? " — " + Util.esc(f.leg) : "") + "</figcaption></figure>";
        });
        corpo += "</div></div>";
      }
      corpo += '<div style="display:flex;gap:30px;margin-top:34px;text-align:center;font-size:11px;page-break-inside:avoid">'
        + '<div style="flex:1"><div style="border-top:1px solid #333;padding-top:5px">' + Util.esc(r.responsavel || ob.responsavel || "Responsável pela obra") + "<br><span style='color:#777'>Responsável pela obra</span></div></div>"
        + '<div style="flex:1"><div style="border-top:1px solid #333;padding-top:5px">' + Util.esc(cli.nome || ob.clienteNome || "Fiscalização / Cliente") + "<br><span style='color:#777'>Fiscalização / Cliente</span></div></div></div>";
      this._abrirDoc("Diário de Obra " + (r.numero || ""), this._docShell("DIÁRIO DE OBRA — " + Util.esc(r.numero || ""), "#0f2740", corpo, "rdo"));
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
      var extra = '<button class="btn sm" data-gacao="colab-doc" style="margin-right:10px;align-self:center;background:#0f2740;color:#fff">📄 Cadastrar de documento (IA)</button><span class="muted" style="margin-right:12px;align-self:center">Ativos: <b>' + ativos + "</b> / " + cs.length + "</span>";
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
        '<div class="row">' + campo("Favorecido do pagamento", inp("g-fav", c.favorecido, "Quem recebe (se for outra pessoa)")) + campo("Chave PIX", inp("g-pix", c.chavePix, "CPF, celular ou e-mail")) + "</div>" +
        campo("Observações", '<textarea id="g-obs" rows="2">' + Util.esc(c.obs || "") + "</textarea>");
      this._modalForm("colaboradores", c, "Colaborador", corpo, function (obj) {
        obj.nome = v("g-nome"); if (!obj.nome) { UI.toast("Informe o nome do colaborador.", "erro"); return false; }
        obj.funcao = v("g-func"); obj.tipoContrato = v("g-tipo"); obj.cpf = v("g-cpf"); obj.telefone = v("g-tel");
        obj.remuneracao = nv("g-rem"); obj.unidadeRem = v("g-un"); obj.admissao = v("g-adm"); obj.obraId = v("g-obra");
        obj.status = v("g-status"); obj.obs = v("g-obs");
        obj.favorecido = v("g-fav"); obj.chavePix = v("g-pix");
        return true;
      });
    },

    // Cadastro de colaborador a partir de documento (RG/CTPS/ficha) lido por IA.
    cadastrarColaboradorDoc: function () {
      if (this._bloqueado()) return;
      var self = this;
      var back = (typeof CONFIG !== "undefined" && CONFIG.iaBackend) ? String(CONFIG.iaBackend).replace(/\/$/, "") : "";
      var chave = (typeof Licenca !== "undefined" && Licenca.chave) ? Licenca.chave() : "";
      if (!chave) { UI.toast("Ative sua licença pra usar a leitura por IA.", "erro"); return; }
      var inpEl = document.createElement("input");
      inpEl.type = "file"; inpEl.accept = ".pdf,image/*"; inpEl.style.display = "none";
      inpEl.onchange = function () {
        var file = inpEl.files && inpEl.files[0]; if (!file) return;
        var ext = String(file.name || "").toLowerCase().split(".").pop();
        if (ext === "pdf") {
          UI.toast("Lendo o PDF…", "ok");
          self._pdfTexto(file, function (texto) {
            if (!texto || texto.trim().length < 15) { UI.toast("PDF sem texto legível — envie uma foto do documento.", "erro"); return; }
            self._enviarDocColab(back, chave, { tipo: "texto", conteudo: texto, contexto: "colaborador" });
          });
        } else {
          var fr = new FileReader();
          fr.onload = function () { self._enviarDocColab(back, chave, { tipo: "imagem", conteudo: fr.result, contexto: "colaborador" }); };
          fr.readAsDataURL(file);
        }
      };
      document.body.appendChild(inpEl); inpEl.click(); setTimeout(function () { inpEl.remove(); }, 60000);
    },
    _enviarDocColab: function (back, chave, payload) {
      var self = this;
      UI.toast("🤖 A IA está lendo o documento…", "ok");
      fetch(back + "/ia/documento", { method: "POST", headers: { "Content-Type": "application/json", "x-licenca": chave }, body: JSON.stringify(payload) })
        .then(function (r) { return r.json(); }).then(function (j) {
          if (!j.ok) { UI.toast(j.error || "A IA não conseguiu ler o documento.", "erro"); return; }
          self._colabParaCadastro(j.dados);
        }).catch(function () { UI.toast("Sem conexão com a IA. Tente de novo.", "erro"); });
    },
    _colabParaCadastro: function (dados) {
      dados = dados || {};
      this.formColaborador({ nome: dados.nome || "", cpf: dados.cpf || "", funcao: dados.funcao || "", admissao: dados.admissao || "", telefone: dados.telefone || "", status: "ativo", origem: "documento-ia" });
      UI.toast("🤖 Dados extraídos pela IA (confiança " + Math.round((dados.confianca || 0) * 100) + "%). Confira e complete.", "ok");
    },
    // =================== EPI — CATÁLOGO + FICHAS (NR-6) ===================
    _epiItens: function (e) { return (e && e.itens) ? e.itens.map(function (i) { return { epiId: i.epiId || "", nome: i.nome || "", ca: i.ca || "", validade: i.validade || "", quantidade: Util.num(i.quantidade) || 1, valorUnit: Util.num(i.valorUnit) || 0 }; }) : []; },
    _epiValor: function (itens) { return itens.reduce(function (s, i) { return s + Util.num(i.quantidade) * Util.num(i.valorUnit); }, 0); },
    _proxNumeroEpi: function () {
      var es = lista("epi"), ano = new Date().getFullYear(), max = 0;
      es.forEach(function (e) { var m = /EPI-(\d{4})-(\d+)/.exec(e.numero || ""); if (m && Util.num(m[1]) === ano) { var n = Util.num(m[2]); if (n > max) max = n; } });
      var seq = max + 1, pad = "" + seq; while (pad.length < 3) pad = "0" + pad;
      return "EPI-" + ano + "-" + pad;
    },
    afterRenderEpi: function () {
      if (typeof Epi !== "undefined" && !Epi.carregado && !Epi.carregando) Epi.carregar("data/epi-catalogo.json").then(function () { if (typeof App !== "undefined" && App.view === "epi") App.render(); }).catch(function () {});
    },
    renderEpi: function () {
      var es = lista("epi").slice().sort(function (a, b) { return String(b.data || "").localeCompare(String(a.data || "")); });
      var hoje = new Date(); hoje.setHours(0, 0, 0, 0); // meia-noite local → contagem de dias estável (independe da hora)
      var gasto = 0, aVencer = 0;
      es.forEach(function (e) { gasto += Util.num(e.valorTotal); (e.itens || []).forEach(function (it) { if (it.validade) { var dias = Math.round((new Date(it.validade + "T00:00:00") - hoje) / 86400000); if (dias <= 60) aVencer++; } }); }); // inclui já vencidos (dias<0) — precisam renovar
      var catN = (typeof Epi !== "undefined" && Epi.carregado) ? Epi.resumo().total : null;
      var card = function (val, l, cor) { return '<div class="card" style="flex:1;text-align:center;min-width:90px"><div style="font-size:24px;font-weight:800;color:' + cor + '">' + val + '</div><div class="muted">' + l + "</div></div>"; };
      var kpis = '<div class="row" style="gap:10px;margin:4px 0 14px">'
        + card(es.length, "entregas", "#0f2740") + card(Util.fmtMoeda(gasto), "gasto com EPI", "#16a34a")
        + card(aVencer, "CA vencido/a vencer", aVencer ? "#dc2626" : "#64748b") + card(catN != null ? catN : "…", "no catálogo", "#2e6f9e") + "</div>";
      var extra = '<button class="btn sm" data-gacao="catalogo-epi" style="margin-right:10px;align-self:center;background:#0f2740;color:#fff">📖 Catálogo de EPI</button>';
      var html = this._head(svg("epi") + "EPI — Entregas &amp; Fichas", "nova-entrega-epi", "Nova entrega", extra) + kpis;
      html += '<p class="muted" style="margin:-4px 0 14px">Registre a entrega de EPI ao colaborador (com CA e validade), gere a <b>ficha de controle (NR-6)</b> para assinatura e acompanhe o gasto. O catálogo traz os EPIs de obra com valor de referência; o <b>CA é do modelo comprado</b> — use <b>🔎 Consultar CA</b> para conferir online.</p>';
      if (!es.length) return html + vazioBox("Nenhuma entrega de EPI registrada", "nova-entrega-epi", "Registrar primeira entrega");
      html += '<table class="tbl"><thead><tr><th>Nº</th><th>Data</th><th>Colaborador</th><th class="num">Itens</th><th class="num">Valor</th><th></th></tr></thead><tbody>';
      es.forEach(function (e) {
        var nI = (e.itens && e.itens.length) || 0;
        html += '<tr><td style="cursor:pointer" data-gopen="epi:' + e.id + '"><b>' + Util.esc(e.numero || "—") + "</b></td><td>" + Util.esc(e.data ? e.data.split("-").reverse().join("/") : "—") + "</td><td>" + Util.esc(e.colaboradorNome || "—") + '</td><td class="num">' + nI + '</td><td class="num">' + Util.fmtMoeda(e.valorTotal) + '</td><td class="num"><button class="btn sm" data-gacao="ficha-epi" data-id="' + e.id + '">🖨 Ficha</button></td></tr>';
      });
      return html + "</tbody></table>";
    },
    novoEntregaEpi: function () { this.formEntregaEpi(null); },
    formEntregaEpi: function (e) {
      e = e || {}; var self = this, colabs = lista("colaboradores"), obras = lista("obras"), hoje = new Date().toISOString().slice(0, 10);
      var numero = e.numero || this._proxNumeroEpi();
      var itensBuf = this._epiItens(e);
      var corpo =
        '<div class="row">' + campo("Número", inp("g-num", numero)) + campo("Data", inp("g-data", e.data || hoje, "", "date")) + campo("Obra", sel("g-obra", optsRec(obras, "nome", e.obraId, "— nenhuma —"))) + "</div>" +
        campo("Colaborador *", sel("g-colab", optsRec(colabs, "nome", e.colaboradorId, "— selecionar —"))) +
        campo("EPIs entregues *",
          '<input id="ee-q" placeholder="🔍 Buscar EPI no catálogo (capacete, luva, bota, cinturão…)" autocomplete="off" style="margin-bottom:6px">' +
          '<div class="muted" id="ee-status" style="font-size:12px;margin-bottom:6px"></div>' +
          '<div id="ee-res" style="max-height:180px;overflow:auto;margin-bottom:8px"></div>' +
          '<div id="ee-itens"></div>') +
        campo("Observações", '<textarea id="g-obs" rows="2">' + Util.esc(e.observacoes || "") + "</textarea>");
      this._modalForm("epi", e, "Entrega de EPI", corpo, function (obj) {
        obj.colaboradorId = v("g-colab"); if (!obj.colaboradorId) { UI.toast("Selecione o colaborador.", "erro"); return false; }
        if (!itensBuf.length) { UI.toast("Adicione ao menos um EPI (busque no catálogo).", "erro"); return false; }
        var c = lista("colaboradores").filter(function (x) { return x.id === obj.colaboradorId; })[0] || {};
        obj.colaboradorNome = c.nome || ""; obj.colaboradorFuncao = c.funcao || ""; obj.colaboradorCpf = c.cpf || "";
        obj.numero = v("g-num"); obj.data = v("g-data"); obj.obraId = v("g-obra"); obj.observacoes = v("g-obs");
        obj.itens = itensBuf.slice(); obj.valorTotal = self._epiValor(itensBuf);
        return true;
      });
      function renderItens() {
        var el = document.getElementById("ee-itens"); if (!el) return;
        if (!itensBuf.length) { el.innerHTML = '<div class="muted" style="font-size:12px">Nenhum EPI ainda — busque no catálogo acima.</div>'; return; }
        el.innerHTML = '<table class="tbl" style="font-size:12px"><thead><tr><th>EPI</th><th>CA</th><th>Validade</th><th class="num">Qtd</th><th class="num">Vlr un.</th><th class="num">Subtot.</th><th></th></tr></thead><tbody>'
          + itensBuf.map(function (it, i) {
            return "<tr><td>" + Util.esc(it.nome) + "</td>"
              + '<td><input data-eeca="' + i + '" value="' + Util.esc(it.ca) + '" placeholder="CA" style="width:66px"> <button type="button" class="btn sm" data-eeconsulta="' + i + '" title="Consultar CA online">🔎</button></td>'
              + '<td><input data-eeval="' + i + '" type="date" value="' + Util.esc(it.validade) + '" style="width:130px"></td>'
              + '<td class="num"><input data-eeqtd="' + i + '" value="' + Util.esc(String(it.quantidade).replace(".", ",")) + '" style="width:46px;text-align:right"></td>'
              + '<td class="num"><input data-eevu="' + i + '" value="' + Util.esc(String(it.valorUnit).replace(".", ",")) + '" style="width:60px;text-align:right"></td>'
              + '<td class="num" data-eesub="' + i + '">' + Util.fmtMoeda(Util.num(it.quantidade) * Util.num(it.valorUnit)) + "</td>"
              + '<td class="num"><button type="button" class="btn sm" data-eerm="' + i + '" style="color:#dc2626">✕</button></td></tr>';
          }).join("")
          + '</tbody><tfoot><tr><td colspan="5" style="text-align:right"><b>Total</b></td><td class="num"><b data-eetot>' + Util.fmtMoeda(self._epiValor(itensBuf)) + "</b></td><td></td></tr></tfoot></table>";
        function upd(i) { var s = el.querySelector('[data-eesub="' + i + '"]'); if (s) s.textContent = Util.fmtMoeda(Util.num(itensBuf[i].quantidade) * Util.num(itensBuf[i].valorUnit)); var t = el.querySelector("[data-eetot]"); if (t) t.textContent = Util.fmtMoeda(self._epiValor(itensBuf)); }
        Array.prototype.forEach.call(el.querySelectorAll("[data-eeca]"), function (x) { x.onchange = function () { itensBuf[+x.getAttribute("data-eeca")].ca = x.value.trim(); }; });
        Array.prototype.forEach.call(el.querySelectorAll("[data-eeval]"), function (x) { x.onchange = function () { itensBuf[+x.getAttribute("data-eeval")].validade = x.value; }; });
        Array.prototype.forEach.call(el.querySelectorAll("[data-eeqtd]"), function (x) { x.onchange = function () { var i = +x.getAttribute("data-eeqtd"); itensBuf[i].quantidade = Util.num(x.value) || 0; upd(i); }; });
        Array.prototype.forEach.call(el.querySelectorAll("[data-eevu]"), function (x) { x.onchange = function () { var i = +x.getAttribute("data-eevu"); itensBuf[i].valorUnit = Util.num(x.value) || 0; upd(i); }; });
        Array.prototype.forEach.call(el.querySelectorAll("[data-eeconsulta]"), function (b) { b.onclick = function () { window.open(Epi.consultaCaUrl(itensBuf[+b.getAttribute("data-eeconsulta")].ca), "_blank"); }; });
        Array.prototype.forEach.call(el.querySelectorAll("[data-eerm]"), function (b) { b.onclick = function () { itensBuf.splice(+b.getAttribute("data-eerm"), 1); renderItens(); }; });
      }
      this._wireCatalogoEpi("ee-q", "ee-res", "ee-status", function (epi) {
        itensBuf.push({ epiId: epi.id, nome: epi.nome, ca: epi.ca || "", validade: "", quantidade: 1, valorUnit: Util.num(epi.valorRef) || 0 });
        renderItens(); UI.toast("EPI adicionado.", "ok");
      });
      renderItens();
    },
    _wireCatalogoEpi: function (qId, resId, statusId, onPick) {
      var inp = document.getElementById(qId), box = document.getElementById(resId), st = statusId ? document.getElementById(statusId) : null;
      if (!inp || !box) return;
      function setSt(t) { if (st) st.textContent = t; }
      function pintar(listaR) {
        if (!listaR.length) { box.innerHTML = '<div class="muted" style="font-size:13px;padding:6px">Nenhum EPI encontrado.</div>'; return; }
        box.innerHTML = '<table class="tbl" style="font-size:12.5px"><tbody>' + listaR.map(function (x, i) {
          return "<tr><td><b>" + Util.esc(x.nome) + '</b> <span class="muted">· ' + Util.esc(Epi.rotuloCategoria(x.categoria)) + "</span></td><td>" + Util.fmtMoeda(x.valorRef) + "</td>"
            + (onPick ? '<td class="num"><button type="button" class="btn sm primary" data-epiadd="' + i + '">Adicionar</button></td>' : '<td class="muted" style="font-size:11px">vida útil ' + Math.round((x.vidaUtilDias || 0) / 30) + " mês</td>") + "</tr>";
        }).join("") + "</tbody></table>";
        if (onPick) Array.prototype.forEach.call(box.querySelectorAll("[data-epiadd]"), function (b) { b.onclick = function () { var x = listaR[+b.getAttribute("data-epiadd")]; if (x) onPick(x); }; });
      }
      function achar() { var res = Epi.buscar(inp.value.trim(), { max: 30 }); setSt(res.length + " EPI(s)"); pintar(res); }
      function rodar() { if (Epi.carregado) { achar(); return; } setSt("Carregando catálogo…"); Epi.carregar("data/epi-catalogo.json").then(achar).catch(function () { setSt("Não carregou o catálogo — abra pelo servidor local (Iniciar-OrcaPRO.bat)."); }); }
      inp.oninput = (typeof Util !== "undefined" && Util.debounce) ? Util.debounce(rodar, 200) : rodar;
      if (typeof Epi !== "undefined" && Epi.carregado) { setSt(Epi.resumo().total + " EPIs no catálogo. Digite para buscar."); if (!onPick) pintar(Epi.itens()); }
      else if (typeof Epi !== "undefined") Epi.carregar("data/epi-catalogo.json").then(function () { setSt(Epi.resumo().total + " EPIs no catálogo. Digite para buscar."); if (!onPick) pintar(Epi.itens()); }).catch(function () {});
    },
    abrirCatalogoEpi: function () {
      var corpo = '<div class="field"><input id="ec-q" placeholder="Buscar EPI (nome ou categoria)" autocomplete="off"></div><div class="muted mb" id="ec-status"></div><div id="ec-res" style="max-height:420px;overflow:auto"></div>';
      var bg = UI.modal("📖 Catálogo de EPI (NR-6)", corpo, [{ texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } }]);
      var m = bg && bg.querySelector(".modal"); if (m) m.style.maxWidth = "720px";
      this._wireCatalogoEpi("ec-q", "ec-res", "ec-status", null);
    },
    fichaEpi: function (id) {
      var e = Store.obter(eid(), "epi", id); if (!e) return;
      var emp = (typeof Empresa !== "undefined" && Empresa.dados) ? Empresa.dados() : {};
      var obra = e.obraId ? Store.obter(eid(), "obras", e.obraId) : null;
      var brd = function (d) { return d ? String(d).split("-").reverse().join("/") : "—"; };
      var logoE = (typeof Empresa !== "undefined" && Empresa.logoHTML) ? Empresa.logoHTML(44) : "";
      var linhas = (e.itens || []).map(function (it) {
        return "<tr><td style='text-align:center;padding:4px'>" + Util.num(it.quantidade) + "</td><td style='padding:4px'>" + Util.esc(it.nome) + "</td><td style='text-align:center;padding:4px'>" + brd(e.data) + "</td><td style='text-align:center;padding:4px'>" + Util.esc(it.ca || "N/A") + "</td><td style='padding:4px'></td></tr>";
      }).join("");
      var termo = "Declaro ter recebido gratuitamente da empresa os Equipamentos de Proteção Individual (EPI) acima discriminados, em perfeito estado de conservação e funcionamento, bem como orientação/treinamento quanto ao uso correto, guarda e conservação. Comprometo-me a: usá-los durante toda a jornada de trabalho; responsabilizar-me por sua guarda e conservação; comunicar qualquer alteração que os torne impróprios para uso; e devolvê-los quando solicitado. Estou ciente de que o uso é obrigatório e que o não uso constitui ato faltoso (art. 158 da CLT e NR-6).";
      var html = '<div style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:720px;margin:0 auto;padding:8px;font-size:12px">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #0f2740;padding-bottom:8px;margin-bottom:10px"><div>' + logoE + '</div><div style="text-align:center;flex:1"><b style="font-size:13px">' + Util.esc(emp.nome || "") + "</b><br><span style='font-size:9px'>" + (emp.cnpj ? "CNPJ " + Util.esc(emp.cnpj) : "") + (emp.endereco ? " · " + Util.esc(emp.endereco) : "") + "</span></div></div>"
        + '<h2 style="text-align:center;margin:0 0 10px;color:#0f2740;font-size:15px">FICHA DE CONTROLE E ENTREGA DE EPI</h2>'
        + "<table style='width:100%;font-size:12px;margin-bottom:8px'><tr><td><b>Nome:</b> " + Util.esc(e.colaboradorNome || "—") + "</td><td><b>CPF:</b> " + Util.esc(e.colaboradorCpf || "—") + "</td></tr><tr><td><b>Função:</b> " + Util.esc(e.colaboradorFuncao || "—") + "</td><td><b>Data:</b> " + brd(e.data) + (e.numero ? " &nbsp;·&nbsp; <b>Ficha:</b> " + Util.esc(e.numero) : "") + (obra ? " &nbsp;·&nbsp; <b>Obra:</b> " + Util.esc(obra.nome) : "") + "</td></tr></table>"
        + "<p style='font-size:11px;text-align:justify;line-height:1.5;margin:0 0 10px'>" + termo + "</p>"
        + "<table style='width:100%;border-collapse:collapse;font-size:11.5px' border='1'><thead><tr style='background:#0f2740;color:#fff'><th style='padding:5px;width:44px'>Qtd</th><th style='padding:5px'>Descrição do EPI</th><th style='padding:5px;width:80px'>Data</th><th style='padding:5px;width:70px'>CA</th><th style='padding:5px;width:150px'>Assinatura</th></tr></thead><tbody>" + linhas + "</tbody></table>"
        + (e.observacoes ? "<p style='font-size:11px;margin-top:8px'><b>Obs.:</b> " + Util.esc(e.observacoes) + "</p>" : "")
        + "<p style='font-size:11px;margin-top:12px'>Declaramos, para os devidos fins, que o colaborador recebeu treinamento para o uso correto dos EPIs.</p>"
        + '<div style="display:flex;justify-content:space-between;margin-top:40px;gap:40px"><div style="flex:1;text-align:center;border-top:1px solid #333;padding-top:4px;font-size:11px">Assinatura do Colaborador</div><div style="flex:1;text-align:center;border-top:1px solid #333;padding-top:4px;font-size:11px">Responsável pela Empresa</div></div>'
        + '<div style="text-align:right;font-size:8px;color:#999;margin-top:14px">Gerado pelo OrçaPRO IA</div></div>';
      if (typeof App !== "undefined" && App._abrirPrint) App._abrirPrint("Ficha de EPI — " + (e.colaboradorNome || ""), html);
      else { var w = window.open("", "_blank"); if (w) { w.document.write("<html><head><title>Ficha de EPI</title></head><body onload='window.print()'>" + html + "</body></html>"); w.document.close(); } }
    },
    // =================== RH — PONTO / FOLHA ===================
    _pontoMes: null,
    renderPonto: function () {
      var self = this, colabs = lista("colaboradores"), obras = lista("obras");
      var mes = this._pontoMes || new Date().toISOString().slice(0, 7);
      var mesBR = mes.split("-").reverse().join("/");
      var faltas = lista("faltas").filter(function (f) { return String(f.data || "").slice(0, 7) === mes; }).sort(function (a, b) { return String(b.data).localeCompare(String(a.data)); });
      var ativos = colabs.filter(function (c) { return c.status === "ativo"; }).length;
      var inj = faltas.filter(function (f) { return f.motivo === "injustificada"; }).length;
      var extra = '<button class="btn sm" data-gacao="falta-lote" style="margin-right:8px;align-self:center">📋 Lançar em lote</button>'
        + '<button class="btn sm" data-gacao="espelho-ponto" style="margin-right:8px;align-self:center;background:#0f2740;color:#fff">🖨 Espelho de ponto</button>'
        + '<button class="btn sm" data-gacao="config-jornada" style="margin-right:12px;align-self:center">⚙ Jornada</button>';
      var html = this._head(svg("ponto") + "Ponto / Cartão de Ponto", "nova-falta", "Registrar falta", extra);
      html += '<div class="row" style="align-items:center;gap:14px;margin:-4px 0 12px">'
        + '<div class="field" style="max-width:170px"><label>Mês de referência</label><input type="month" id="pt-mes" value="' + mes + '"></div>'
        + '<span class="muted" style="align-self:center">Ativos: <b>' + ativos + "</b> · Faltas em " + mesBR + ": <b style=\"color:#dc2626\">" + inj + "</b> injustificada(s) de <b>" + faltas.length + "</b></span></div>";
      html += '<h3 style="margin:6px 0 8px;font-size:15px">Faltas de ' + mesBR + "</h3>";
      if (!faltas.length) html += vazioBox("Nenhuma falta lançada neste mês", "nova-falta", "Registrar falta");
      else {
        html += '<table class="tbl"><thead><tr><th>Data</th><th>Colaborador</th><th>Motivo</th><th></th></tr></thead><tbody>';
        faltas.forEach(function (f) {
          var col = colabs.filter(function (c) { return c.id === f.colaboradorId; })[0];
          var cor = f.motivo === "injustificada" ? "#dc2626" : "#64748b";
          html += "<tr><td>" + Util.esc(f.data ? f.data.split("-").reverse().join("/") : "—") + "</td><td><b>" + Util.esc(col ? col.nome : (f.colaboradorNome || "—")) + '</b></td><td><span class="g-pill" style="background:' + cor + "22;color:" + cor + '">' + rot(P.faltaMotivo, f.motivo) + '</span></td><td class="num"><button class="btn sm" data-gacao="excluir-falta" data-id="' + f.id + '" style="color:#dc2626">✕</button></td></tr>';
        });
        html += "</tbody></table>";
      }
      var ps = lista("ponto").slice().sort(function (a, b) { return (b.competencia || "").localeCompare(a.competencia || ""); });
      if (ps.length) {
        html += '<h3 style="margin:20px 0 8px;font-size:15px">Registros mensais (valor lançado)</h3>';
        html += '<table class="tbl"><thead><tr><th>Competência</th><th>Colaborador</th><th class="num">Dias</th><th class="num">Valor</th><th>Status</th><th></th></tr></thead><tbody>';
        ps.forEach(function (p) {
          var col = colabs.filter(function (c) { return c.id === p.colaboradorId; })[0];
          var acao = p.status !== "lancado" ? '<button class="btn sm success" data-gacao="lancar-ponto" data-id="' + p.id + '">Lançar folha</button>' : "✓";
          html += '<tr><td style="cursor:pointer" data-gopen="ponto:' + p.id + '"><b>' + Util.esc(p.competencia || "—") + "</b></td><td>" + Util.esc(col ? col.nome : (p.colaboradorNome || "—")) + '</td><td class="num">' + Util.fmtNum(p.dias, 0) + '</td><td class="num">' + Util.fmtMoeda(p.valor) + "</td><td>" + pill(p.status) + '</td><td class="num">' + acao + "</td></tr>";
        });
        html += "</tbody></table>";
      }
      return html;
    },
    afterRenderPonto: function () {
      var self = this, el = document.getElementById("pt-mes");
      if (el) el.onchange = function () { self._pontoMes = el.value || null; if (typeof App !== "undefined") App.render(); };
    },
    novoFalta: function () { this.registrarFalta(); },
    registrarFalta: function () {
      var self = this, colabs = lista("colaboradores").filter(function (c) { return c.status !== "desligado"; });
      var hoje = new Date().toISOString().slice(0, 10);
      var corpo = '<div class="row">' + campo("Colaborador *", sel("g-colab", optsRec(colabs, "nome", "", "— selecionar —"))) + campo("Data *", inp("g-data", hoje, "", "date")) + "</div>"
        + campo("Motivo", sel("g-motivo", opts(P.faltaMotivo, "injustificada")));
      UI.modal("Registrar falta", corpo, [
        { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
        { texto: "Salvar", classe: "primary", onClick: function () {
          if (self._bloqueado()) return;
          var cid = v("g-colab"); if (!cid) { UI.toast("Selecione o colaborador.", "erro"); return; }
          var data = v("g-data"); if (!data) { UI.toast("Informe a data.", "erro"); return; }
          if (lista("faltas").filter(function (f) { return f.colaboradorId === cid && f.data === data; })[0]) { UI.toast("Já existe falta nessa data para esse colaborador.", "erro"); return; }
          var col = lista("colaboradores").filter(function (c) { return c.id === cid; })[0] || {};
          Store.salvar(eid(), "faltas", { colaboradorId: cid, colaboradorNome: col.nome || "", data: data, motivo: v("g-motivo") });
          UI.fecharModal(); self._pontoMes = data.slice(0, 7); App.render(); UI.toast("Falta registrada.", "ok");
        } }
      ]);
    },
    faltasLote: function () {
      var self = this, colabs = lista("colaboradores").filter(function (c) { return c.status !== "desligado"; });
      var hoje = new Date().toISOString().slice(0, 10);
      var checks = colabs.map(function (c) { return '<label style="display:flex;align-items:center;gap:7px;font-size:13px;padding:2px 0;cursor:pointer"><input type="checkbox" data-lote-col="' + c.id + '"> ' + Util.esc(c.nome) + ' <span class="muted">' + Util.esc(c.funcao || "") + "</span></label>"; }).join("");
      var corpo = '<div class="row">' + campo("De *", inp("g-ini", hoje, "", "date")) + campo("Até *", inp("g-fim", hoje, "", "date")) + campo("Motivo", sel("g-motivo", opts(P.faltaMotivo, "injustificada"))) + "</div>"
        + '<label style="display:flex;align-items:center;gap:7px;font-size:13px;margin:4px 0 6px"><input type="checkbox" id="g-pulafds" checked> Pular sábados e domingos</label>'
        + campo("Colaboradores *", '<div style="max-height:200px;overflow:auto;border:1px solid var(--linha,#e2e8f0);border-radius:10px;padding:10px">' + (checks || '<span class="muted">Cadastre colaboradores primeiro.</span>') + "</div>");
      UI.modal("Lançar faltas em lote", corpo, [
        { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
        { texto: "Lançar", classe: "primary", onClick: function () {
          if (self._bloqueado()) return;
          var ini = v("g-ini"), fim = v("g-fim"), motivo = v("g-motivo");
          var pulaFds = (document.getElementById("g-pulafds") || {}).checked;
          var ids = Array.prototype.map.call(document.querySelectorAll("[data-lote-col]:checked"), function (c) { return c.getAttribute("data-lote-col"); });
          if (!ids.length) { UI.toast("Selecione ao menos um colaborador.", "erro"); return; }
          if (!ini || !fim || ini > fim) { UI.toast("Informe um período válido.", "erro"); return; }
          var existentes = lista("faltas"), n = 0, dini = new Date(ini + "T12:00:00"), dfim = new Date(fim + "T12:00:00"), passo = 0;
          for (var d = new Date(dini); d <= dfim && passo < 400; d.setDate(d.getDate() + 1)) {
            passo++;
            var dow = d.getDay(); if (pulaFds && (dow === 0 || dow === 6)) continue;
            var ds = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
            ids.forEach(function (cid) {
              if (existentes.filter(function (f) { return f.colaboradorId === cid && f.data === ds; })[0]) return;
              var col = lista("colaboradores").filter(function (c) { return c.id === cid; })[0] || {};
              Store.salvar(eid(), "faltas", { colaboradorId: cid, colaboradorNome: col.nome || "", data: ds, motivo: motivo }); n++;
            });
          }
          UI.fecharModal(); self._pontoMes = ini.slice(0, 7); App.render();
          UI.toast(n + " falta(s) lançada(s)." + (ini.slice(0, 7) !== fim.slice(0, 7) ? " Abrangeu mais de um mês — troque o mês de referência para ver todas." : ""), "ok");
        } }
      ]);
    },
    excluirFalta: function (id) {
      if (this._bloqueado()) return;
      Store.excluir(eid(), "faltas", id); App.render(); UI.toast("Falta removida.", "ok");
    },
    _pontoJornada: function () {
      var p = (typeof Store !== "undefined" && typeof Auth !== "undefined") ? (Store.lerPrefs(eid()) || {}) : {};
      var j = p.pontoJornada || {};
      return { entrada: j.entrada || "07:00", almoco: j.almoco || "12:00", retorno: j.retorno || "13:00", saida: j.saida || "17:00" };
    },
    configJornada: function () {
      var self = this, j = this._pontoJornada();
      var corpo = '<p class="muted" style="margin:0 0 10px">Horários padrão da jornada — aparecem no espelho de ponto (documento para assinatura).</p>'
        + '<div class="row">' + campo("Entrada", inp("g-e", j.entrada, "", "time")) + campo("Saída p/ almoço", inp("g-a", j.almoco, "", "time")) + campo("Retorno", inp("g-r", j.retorno, "", "time")) + campo("Saída", inp("g-s", j.saida, "", "time")) + "</div>";
      UI.modal("⚙ Jornada de trabalho", corpo, [
        { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
        { texto: "Salvar", classe: "primary", onClick: function () {
          var p = Store.lerPrefs(eid()) || {};
          p.pontoJornada = { entrada: v("g-e"), almoco: v("g-a"), retorno: v("g-r"), saida: v("g-s") };
          Store.salvarPrefs(eid(), p); UI.fecharModal(); UI.toast("Jornada salva.", "ok");
        } }
      ]);
    },
    espelhoPonto: function () {
      var self = this, colabs = lista("colaboradores");
      if (!colabs.length) { UI.toast("Cadastre colaboradores primeiro.", "erro"); return; }
      var mes = this._pontoMes || new Date().toISOString().slice(0, 7);
      var corpo = '<div class="row">' + campo("Mês de referência", inp("g-mes", mes, "", "month")) + campo("Colaborador", sel("g-colab", optsRec(colabs.filter(function (c) { return c.status === "ativo"; }), "nome", "", "— Todos os ativos —"))) + "</div>"
        + '<p class="muted" style="margin:6px 0 0">O espelho usa a jornada padrão (⚙ Jornada) e marca as faltas do mês. Documento pronto para impressão e assinatura (NR/CLT).</p>';
      UI.modal("🖨 Espelho de Ponto", corpo, [
        { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
        { texto: "Gerar", classe: "primary", onClick: function () {
          var m = v("g-mes") || mes, cid = v("g-colab");
          var lista2 = cid ? colabs.filter(function (c) { return c.id === cid; }) : colabs.filter(function (c) { return c.status === "ativo"; });
          if (!lista2.length) { UI.toast("Nenhum colaborador para gerar.", "erro"); return; }
          UI.fecharModal(); self._gerarEspelho(m, lista2);
        } }
      ]);
    },
    _mesExtenso: function (mes) {
      var M = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
      var p = String(mes).split("-"); return (M[(Util.num(p[1]) || 1) - 1] || "") + " de " + (p[0] || "");
    },
    _gerarEspelho: function (mes, colabsLista) {
      var self = this, emp = (typeof Empresa !== "undefined" && Empresa.dados) ? Empresa.dados() : {};
      var logo = (typeof Empresa !== "undefined" && Empresa.logoHTML) ? Empresa.logoHTML(46) : "";
      var jor = this._pontoJornada(), diasSem = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
      var ano = Util.num(mes.split("-")[0]), mm = Util.num(mes.split("-")[1]);
      var nDias = new Date(ano, mm, 0).getDate();
      var todasFaltas = lista("faltas");
      var paginas = colabsLista.map(function (c) {
        var faltasC = {}; todasFaltas.forEach(function (f) { if (f.colaboradorId === c.id && String(f.data || "").slice(0, 7) === mes) faltasC[f.data] = f.motivo; });
        var linhas = "", nFaltas = 0, nInj = 0, nTrab = 0;
        for (var d = 1; d <= nDias; d++) {
          var ds = ano + "-" + String(mm).padStart(2, "0") + "-" + String(d).padStart(2, "0");
          var dt = new Date(ds + "T12:00:00"), dow = dt.getDay(), fimDeSemana = (dow === 0 || dow === 6);
          var falta = faltasC[ds], bg = "", obsCol = "", e = "", a = "", r = "", s = "";
          if (falta) { bg = "#fee2e2"; obsCol = rot(P.faltaMotivo, falta); nFaltas++; if (falta === "injustificada") nInj++; }
          else if (fimDeSemana) { bg = "#f3f4f6"; obsCol = dow === 0 ? "DSR — Descanso" : "Folga"; }
          else { e = jor.entrada; a = jor.almoco; r = jor.retorno; s = jor.saida; nTrab++; }
          linhas += '<tr style="background:' + bg + '"><td style="border:1px solid #999;padding:2px 4px;text-align:center;font-weight:bold">' + String(d).padStart(2, "0") + '</td><td style="border:1px solid #999;padding:2px 4px;text-align:center">' + diasSem[dow] + '</td><td style="border:1px solid #999;padding:2px 4px;text-align:center">' + e + '</td><td style="border:1px solid #999;padding:2px 4px;text-align:center">' + a + '</td><td style="border:1px solid #999;padding:2px 4px;text-align:center">' + r + '</td><td style="border:1px solid #999;padding:2px 4px;text-align:center">' + s + '</td><td style="border:1px solid #999;padding:2px 4px;font-size:8.5px">' + obsCol + "</td></tr>";
        }
        return '<div style="page-break-after:always;font-family:Arial,Helvetica,sans-serif;color:#111;font-size:10px;max-width:760px;margin:0 auto">'
          + '<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #0f2740;padding-bottom:8px;margin-bottom:8px">'
          + "<div>" + logo + '</div><div style="text-align:center;flex:1"><b style="font-size:13px">' + Util.esc(emp.nome || "") + "</b><br><span style=\"font-size:9px\">" + (emp.cnpj ? "CNPJ " + Util.esc(emp.cnpj) : "") + (emp.cidade ? " · " + Util.esc(emp.cidade) : "") + '</span></div><div style="text-align:right"><b style="font-size:12px">ESPELHO DE PONTO</b><br><span style="font-size:10px">' + self._mesExtenso(mes) + "</span></div></div>"
          + '<div style="display:flex;border:1px solid #999;margin-bottom:6px"><div style="flex:2;padding:4px;border-right:1px solid #999"><b>Colaborador:</b> ' + Util.esc(c.nome || "") + '</div><div style="flex:1;padding:4px;border-right:1px solid #999"><b>Função:</b> ' + Util.esc(c.funcao || "—") + '</div><div style="flex:1;padding:4px;border-right:1px solid #999"><b>CPF:</b> ' + Util.esc(c.cpf || "—") + '</div><div style="flex:1;padding:4px"><b>Admissão:</b> ' + (c.admissao ? c.admissao.split("-").reverse().join("/") : "—") + "</div></div>"
          + '<table style="width:100%;border-collapse:collapse;font-size:9px"><thead><tr style="background:#0f2740;color:#fff"><th style="border:1px solid #999;padding:3px;width:8%">Dia</th><th style="border:1px solid #999;padding:3px;width:8%">Sem</th><th style="border:1px solid #999;padding:3px;width:13%">Entrada</th><th style="border:1px solid #999;padding:3px;width:13%">Almoço</th><th style="border:1px solid #999;padding:3px;width:13%">Retorno</th><th style="border:1px solid #999;padding:3px;width:13%">Saída</th><th style="border:1px solid #999;padding:3px">Observação</th></tr></thead><tbody>' + linhas + "</tbody></table>"
          + '<div style="display:flex;border:1px solid #999;margin-top:8px;text-align:center;font-size:10px"><div style="flex:1;padding:5px;border-right:1px solid #999"><div style="color:#16a34a;font-weight:bold">Dias trabalhados</div><div style="font-size:15px;font-weight:bold">' + nTrab + '</div></div><div style="flex:1;padding:5px;border-right:1px solid #999"><div style="color:#dc2626;font-weight:bold">Faltas</div><div style="font-size:15px;font-weight:bold">' + nFaltas + '</div></div><div style="flex:1;padding:5px"><div style="color:#dc2626;font-weight:bold">Injustificadas</div><div style="font-size:15px;font-weight:bold">' + nInj + "</div></div></div>"
          + '<div style="display:flex;justify-content:space-between;margin-top:34px;gap:40px"><div style="flex:1;text-align:center;border-top:1px solid #333;padding-top:4px">Assinatura do Colaborador</div><div style="flex:1;text-align:center;border-top:1px solid #333;padding-top:4px">Responsável pela Empresa</div></div>'
          + '<div style="text-align:right;font-size:8px;color:#999;margin-top:10px">Documento gerado pelo OrçaPRO IA</div></div>';
      }).join("");
      if (typeof App !== "undefined" && App._abrirPrint) App._abrirPrint("Espelho de Ponto — " + this._mesExtenso(mes), paginas);
      else { var w = window.open("", "_blank"); if (w) { w.document.write("<html><head><title>Espelho de Ponto</title></head><body>" + paginas + "</body></html>"); w.document.close(); } }
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
        var acoes = '<button class="btn sm" data-gacao="doc-requisicao" data-id="' + r.id + '" title="Gerar Solicitação de Compra">🖨</button> ';
        if (r.status !== "aprovada" && r.status !== "comprada" && r.status !== "cancelada" && r.status !== "rejeitada") acoes += '<button class="btn sm" data-gacao="aprovar-requisicao" data-id="' + r.id + '">Aprovar</button> <button class="btn sm" data-gacao="rejeitar-requisicao" data-id="' + r.id + '" style="color:#dc2626">Rejeitar</button> ';
        if (r.status === "aprovada") acoes += '<button class="btn sm primary" data-gacao="comprar-requisicao" data-id="' + r.id + '">Gerar pedido</button>';
        else if (r.status !== "comprada" && r.status !== "cancelada" && r.status !== "rejeitada") acoes += '<button class="btn sm" disabled title="Aprove a requisição antes de gerar o pedido" style="opacity:.5;cursor:not-allowed">Gerar pedido</button>';
        else if (r.status === "rejeitada") acoes += '<span class="muted" title="' + Util.esc(r.motivoRejeicao || "") + '">✕ rejeitada</span>';
        var corPri = r.prioridade === "urgente" ? "#dc2626" : (r.prioridade === "alta" ? "#ea580c" : "#64748b");
        var nItens = (r.itens && r.itens.length) || 0;
        var reqInfo = (nItens > 1 ? ' <span class="g-pill" style="background:#2e6f9e22;color:#2e6f9e">' + nItens + " itens</span>" : "") + (r.valorEstimado ? ' <span class="muted">· ' + Util.fmtMoeda(r.valorEstimado) + "</span>" : "");
        html += '<tr><td style="cursor:pointer" data-gopen="requisicoes:' + r.id + '"><b>' + Util.esc(r.numero || "—") + "</b></td><td>" + Util.esc(r.data || "—") + "</td><td>" + Util.esc(ob ? ob.nome : "—") + '</td><td>' + Util.esc(r.descricao || "—") + reqInfo + '</td><td><b style="color:' + corPri + '">' + rot(P.reqPrioridade, r.prioridade) + "</b></td><td>" + pill(r.status) + '</td><td class="num">' + acoes + "</td></tr>";
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
    // =================== BANCO DE INSUMOS ===================
    // Resolve o analítico do estado ATIVO (mesma lógica do App.verInsumos).
    _analiticoAtivo: function () {
      var url = (typeof App !== "undefined") ? App._analiticoArquivo : null;
      var uf = (typeof App !== "undefined" && App._baseUf) ? App._baseUf : ((typeof Sinapi !== "undefined") ? Sinapi.uf : null);
      return { url: url, uf: uf };
    },
    renderBancoInsumos: function () {
      var r = (typeof Insumos !== "undefined") ? Insumos.resumo() : { carregado: false, total: 0 };
      var card = function (v, l, cor) { return '<div class="card" style="flex:1;text-align:center;min-width:90px"><div style="font-size:26px;font-weight:800;color:' + cor + '">' + v + '</div><div class="muted">' + l + "</div></div>"; };
      var kpis = r.carregado
        ? '<div class="row" style="gap:10px;margin:4px 0 14px">'
          + card(r.total.toLocaleString("pt-BR"), "insumos" + (r.uf ? " · " + Util.esc(r.uf) : ""), "#0f2740")
          + card(r.mat.toLocaleString("pt-BR"), "Material", "#2e6f9e")
          + card(r.mo.toLocaleString("pt-BR"), "Mão de obra", "#16a34a")
          + card(r.eq.toLocaleString("pt-BR"), "Equipamento", "#ea580c")
          + "</div>"
        : '<div class="muted" style="margin:4px 0 14px">Banco de preços do estado ativo (SINAPI analítico + bases carregadas em 🗂 Tabelas). Carrega na 1ª busca.</div>';
      return this._head(svg("insumos") + "Banco de Insumos", "", "")
        + kpis
        + '<div class="field"><input id="bi-q" placeholder="Buscar insumo por código ou descrição (ex.: cimento, vergalhão, tijolo, servente)" autocomplete="off"></div>'
        + '<div class="muted mb" id="bi-status">Digite ao menos 2 letras…</div>'
        + '<div id="bi-res"></div>'
        + '<p class="muted" style="margin-top:14px">💡 Para montar uma <b>solicitação de compra</b>, vá em <b>Requisições → Nova</b> e use a busca <b>🔍 no banco de insumos</b> para adicionar itens já com preço de referência.</p>';
    },
    afterRender: function (view) { if (view === "insumos") this._wireBancoView(); else if (view === "epi") this.afterRenderEpi(); else if (view === "ponto") this.afterRenderPonto(); else if (view === "galeria") this._galeriaWire(); else if (view === "ajuda") this._ajudaWire(); else if (view === "bim") this._bimWire(); },
    _wireBancoView: function () {
      var self = this;
      this._wireInsumoSearch("bi-q", "bi-res", function (ins) { self.novaRequisicaoComItem(ins); }, { status: "bi-status", comAcao: true });
    },
    // Busca inline reutilizável: input#qId -> resultados em #resId; ação chama onPick(insumo). Liga DEPOIS do modal/view existir no DOM.
    _wireInsumoSearch: function (qId, resId, onPick, opts) {
      opts = opts || {};
      var inp = document.getElementById(qId), box = document.getElementById(resId);
      if (!inp || !box) return;
      var statusEl = opts.status ? document.getElementById(opts.status) : null;
      var a = this._analiticoAtivo();
      function setStatus(t) { if (statusEl) statusEl.textContent = t; }
      function pintar(listaR) {
        if (!listaR.length) { box.innerHTML = '<div class="muted" style="font-size:13px;padding:6px">Nenhum insumo encontrado.</div>'; return; }
        box.innerHTML = '<table class="tbl" style="font-size:13px"><thead><tr><th>Código</th><th>Descrição</th><th>Und</th><th class="num">Preço ref.</th><th>Cat.</th><th></th></tr></thead><tbody>'
          + listaR.map(function (x, i) {
            var cor = x.categoria === "MO" ? "#16a34a" : (x.categoria === "EQ" ? "#ea580c" : "#2e6f9e");
            return '<tr><td><b>' + Util.esc(x.codigo) + "</b>" + (x.fonte && x.fonte !== "SINAPI" ? '<div class="muted" style="font-size:10px">' + Util.esc(x.fonte) + "</div>" : "") + "</td>"
              + "<td>" + Util.esc(x.descricao) + "</td><td>" + Util.esc(x.unidade) + "</td>"
              + '<td class="num">' + (x.custoUnitario > 0 ? Util.fmtMoeda(x.custoUnitario) : "—") + "</td>"
              + '<td><span class="g-pill" style="background:' + cor + "22;color:" + cor + '">' + x.categoria + "</span></td>"
              + '<td class="num"><button type="button" class="btn sm primary" data-ins="' + i + '">' + (opts.comAcao ? "＋ Requisição" : "Adicionar") + "</button></td></tr>";
          }).join("") + "</tbody></table>";
        Array.prototype.forEach.call(box.querySelectorAll("[data-ins]"), function (b) {
          b.onclick = function () { var ins = listaR[+b.getAttribute("data-ins")]; if (ins) onPick(ins); };
        });
      }
      function achar(q) { var res = Insumos.buscar(q, { max: 40 }); setStatus(res.length + " resultado(s) · preços de referência" + (Insumos.uf ? " · " + Insumos.uf : "")); pintar(res); }
      function rodar() {
        var q = inp.value.trim();
        if (q.length < 2) { box.innerHTML = ""; setStatus("Digite ao menos 2 letras…"); return; }
        if (Insumos.carregado) { achar(q); return; }
        setStatus("Carregando o banco de insumos (1ª vez, alguns segundos)…");
        Insumos.carregar(a.url, a.uf).then(function () { if (inp.value.trim() === q) achar(q); })
          .catch(function (e) { setStatus("Não carregou o banco: " + ((e && e.message) || "erro") + " — abra pelo servidor local (Iniciar-OrcaPRO.bat)."); });
      }
      inp.oninput = (typeof Util !== "undefined" && Util.debounce) ? Util.debounce(rodar, 250) : rodar;
      if (!Insumos.carregado && !Insumos.carregando) Insumos.carregar(a.url, a.uf).then(function () { setStatus(Insumos.resumo().total.toLocaleString("pt-BR") + " insumos disponíveis. Digite para buscar."); }).catch(function () {});
    },
    novaRequisicaoComItem: function (ins) {
      this._reqItemSeed = { codigo: ins.codigo, descricao: ins.descricao, unidade: ins.unidade || "un", quantidade: 1, precoRef: ins.custoUnitario || 0, categoria: ins.categoria || "MAT", fonte: ins.fonte || "" };
      this.formRequisicoes(null);
    },
    // itens de uma requisição (back-compat com o formato antigo de item único)
    _reqItens: function (r) {
      if (r.itens && r.itens.length) return r.itens.map(function (i) { return { codigo: i.codigo || "", descricao: i.descricao || "", unidade: i.unidade || "un", quantidade: Util.num(i.quantidade) || 1, precoRef: Util.num(i.precoRef) || 0, categoria: i.categoria || "MAT", fonte: i.fonte || "" }; });
      if (r.descricao) return [{ codigo: "", descricao: r.descricao, unidade: r.unidade || "un", quantidade: Util.num(r.quantidade) || 1, precoRef: 0, categoria: "MAT", fonte: "" }];
      return [];
    },
    _reqResumo: function (itens) {
      if (!itens.length) return "";
      var n = itens.length - 1;
      return (itens[0].descricao || "").slice(0, 50) + (n > 0 ? " (+" + n + (n > 1 ? " itens)" : " item)") : "");
    },
    _reqValor: function (itens) { return itens.reduce(function (s, i) { return s + Util.num(i.quantidade) * Util.num(i.precoRef); }, 0); },
    formRequisicoes: function (r) {
      r = r || {}; var self = this, stAntigo = r.status || "", obras = lista("obras"), hoje = new Date().toISOString().slice(0, 10);
      var numero = r.numero || this._proxNumeroReq();
      var itensBuf = this._reqItens(r);
      if (this._reqItemSeed) { itensBuf.push(this._reqItemSeed); this._reqItemSeed = null; }
      var corpo =
        '<div class="row">' + campo("Número", inp("g-numero", numero)) + campo("Data", inp("g-data", r.data || hoje, "", "date")) + campo("Obra", sel("g-obra", optsRec(obras, "nome", r.obraId, "— nenhuma —"))) + "</div>" +
        '<div class="row">' + campo("Solicitante", inp("g-solic", r.solicitante)) + campo("Prioridade", sel("g-prioridade", opts(P.reqPrioridade, r.prioridade || "normal"))) + campo("Status", sel("g-status", opts(P.reqStatus, r.status || "aberta"))) + "</div>" +
        campo("Itens da solicitação *",
          '<input id="ri-q" placeholder="🔍 Buscar no banco de insumos (código ou descrição)" autocomplete="off" style="margin-bottom:6px">' +
          '<div class="muted" id="ri-status" style="font-size:12px;margin-bottom:6px"></div>' +
          '<div id="ri-res" style="max-height:190px;overflow:auto;margin-bottom:8px"></div>' +
          '<button type="button" class="btn sm" id="ri-manual" style="margin-bottom:10px">➕ Item manual (fora do banco)</button>' +
          '<div id="ri-itens"></div>') +
        campo("Observações", '<textarea id="g-obs" rows="2">' + Util.esc(r.observacoes || "") + "</textarea>");
      this._modalForm("requisicoes", r, "Requisição de compra", corpo, function (obj) {
        if (!itensBuf.length) { UI.toast("Adicione ao menos um item (busque no banco ou use item manual).", "erro"); return false; }
        obj.numero = v("g-numero"); obj.data = v("g-data"); obj.obraId = v("g-obra"); obj.solicitante = v("g-solic");
        obj.prioridade = v("g-prioridade"); obj.status = v("g-status"); obj.observacoes = v("g-obs");
        if (!self._gateStatusForm(obj, stAntigo)) return false; // G3 fix: aprovar/rejeitar pelo form exige permissão + auditoria
        obj.itens = itensBuf.slice();
        obj.descricao = self._reqResumo(itensBuf);
        obj.valorEstimado = self._reqValor(itensBuf);
        obj.quantidade = itensBuf[0].quantidade; obj.unidade = itensBuf[0].unidade; // back-compat
        return true;
      });
      // wiring (UI.modal já colocou o form no DOM)
      function renderItens() {
        var el = document.getElementById("ri-itens"); if (!el) return;
        if (!itensBuf.length) { el.innerHTML = '<div class="muted" style="font-size:12px">Nenhum item ainda — busque no banco acima ou use "Item manual".</div>'; return; }
        el.innerHTML = '<table class="tbl" style="font-size:13px"><thead><tr><th>Item</th><th>Und</th><th class="num">Qtd</th><th class="num">Preço ref.</th><th class="num">Subtotal</th><th></th></tr></thead><tbody>'
          + itensBuf.map(function (it, i) {
            return "<tr><td>" + (it.codigo ? "<b>" + Util.esc(it.codigo) + "</b> " : "") + Util.esc(it.descricao) + "</td>"
              + "<td>" + Util.esc(it.unidade) + "</td>"
              + '<td class="num"><input data-riq="' + i + '" value="' + Util.esc(String(it.quantidade).replace(".", ",")) + '" style="width:64px;text-align:right"></td>'
              + '<td class="num">' + (it.precoRef > 0 ? Util.fmtMoeda(it.precoRef) : "—") + "</td>"
              + '<td class="num" data-risub="' + i + '">' + (it.precoRef > 0 ? Util.fmtMoeda(Util.num(it.quantidade) * it.precoRef) : "—") + "</td>"
              + '<td class="num"><button type="button" class="btn sm" data-rirm="' + i + '" style="color:#dc2626">✕</button></td></tr>';
          }).join("")
          + '</tbody><tfoot><tr><td colspan="4" style="text-align:right"><b>Total estimado</b></td><td class="num"><b data-ritot>' + Util.fmtMoeda(self._reqValor(itensBuf)) + "</b></td><td></td></tr></tfoot></table>";
        Array.prototype.forEach.call(el.querySelectorAll("[data-riq]"), function (input) {
          input.onchange = function () {
            var i = +input.getAttribute("data-riq"); itensBuf[i].quantidade = Util.num(input.value) || 0;
            var sub = el.querySelector('[data-risub="' + i + '"]'); if (sub) sub.textContent = itensBuf[i].precoRef > 0 ? Util.fmtMoeda(itensBuf[i].quantidade * itensBuf[i].precoRef) : "—";
            var tot = el.querySelector("[data-ritot]"); if (tot) tot.textContent = Util.fmtMoeda(self._reqValor(itensBuf));
          };
        });
        Array.prototype.forEach.call(el.querySelectorAll("[data-rirm]"), function (b) {
          b.onclick = function () { itensBuf.splice(+b.getAttribute("data-rirm"), 1); renderItens(); };
        });
      }
      this._wireInsumoSearch("ri-q", "ri-res", function (ins) {
        itensBuf.push({ codigo: ins.codigo, descricao: ins.descricao, unidade: ins.unidade || "un", quantidade: 1, precoRef: ins.custoUnitario || 0, categoria: ins.categoria || "MAT", fonte: ins.fonte || "" });
        renderItens(); UI.toast("Item adicionado.", "ok");
      }, { status: "ri-status" });
      var manual = document.getElementById("ri-manual");
      if (manual) manual.onclick = function () {
        var d = window.prompt("Descrição do item (livre):", ""); if (d == null) return; d = d.trim(); if (!d) return;
        var u = window.prompt("Unidade (un, m², kg, sc…):", "un"); if (u == null) return;
        itensBuf.push({ codigo: "", descricao: d, unidade: (u || "un").trim() || "un", quantidade: 1, precoRef: 0, categoria: "MAT", fonte: "" });
        renderItens();
      };
      renderItens();
    },
    comprarRequisicao: function (id) {
      var r = Store.obter(eid(), "requisicoes", id); if (!r) return;
      if (r.status !== "aprovada") { UI.toast("Aprove a requisição antes de gerar o pedido.", "erro"); return; }
      var obras = lista("obras");
      var nI = (r.itens && r.itens.length) || 0;
      var corpo =
        '<div class="row">' + campo("Descrição", inp("g-pdesc", r.descricao)) + campo("Valor (R$)", inp("g-pvalor", r.valorEstimado || "", "", "number")) + "</div>" +
        '<div class="row">' + campo("Obra", sel("g-pobra", optsRec(obras, "nome", r.obraId, "— nenhuma —"))) + "</div>" +
        (nI ? '<p class="muted">Leva <b>' + nI + "</b> ite" + (nI > 1 ? "ns" : "m") + " para o pedido" + (r.valorEstimado ? " (valor de referência do banco: <b>" + Util.fmtMoeda(r.valorEstimado) + "</b>, ajuste com a cotação real)." : ".") + "</p>" : "") +
        '<p class="muted">Cria um pedido em Compras (status Cotação) e marca a requisição como comprada.</p>';
      UI.modal("Gerar pedido — " + Util.esc(r.numero || ""), corpo, [
        { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
        { texto: "Criar pedido", classe: "primary", onClick: function () {
          if (Gestao._bloqueado()) return;
          var desc = v("g-pdesc"); if (!desc) { UI.toast("Informe a descrição.", "erro"); return; }
          var pc = "PC-" + new Date().getFullYear() + "-" + ("" + (new Date().getTime())).slice(-4);
          Store.salvar(eid(), "compras", { numero: pc, descricao: desc, obraId: v("g-pobra"), valor: nv("g-pvalor"), status: "cotacao", categoria: "material", itens: r.itens || [], requisicaoId: r.id });
          r.status = "comprada"; Store.salvar(eid(), "requisicoes", r);
          UI.fecharModal(); App.render(); UI.toast("Pedido " + pc + " criado.", "ok");
        } }
      ]);
    },

    // =================== MODELOS DE DOCUMENTOS (templates editáveis) ===================
    _templatesDefault: function () {
      return [
        { id: "tpl-vt-renuncia", nome: "Termo de renúncia ao Vale-Transporte", titulo: "TERMO DE OPÇÃO — RENÚNCIA AO VALE-TRANSPORTE", corpo: "Eu, {colaborador}, portador(a) do CPF nº {cpf}, ocupante do cargo de {cargo} na empresa {empresa}, CNPJ {cnpj}, declaro, para os devidos fins, que RENUNCIO ao benefício do Vale-Transporte previsto na Lei nº 7.418/85, uma vez que não utilizo transporte coletivo para deslocamento residência-trabalho-residência.\n\nDeclaro estar ciente de que esta opção poderá ser revista a qualquer momento, mediante comunicação prévia à empresa.\n\n{endereco}, {data}.\n\n\n_______________________________\n{colaborador}\nCPF: {cpf}" },
        { id: "tpl-lanche", nome: "Protocolo de fornecimento de lanche", titulo: "PROTOCOLO DE FORNECIMENTO DE LANCHE", corpo: "Eu, {colaborador}, CPF nº {cpf}, cargo {cargo}, declaro ter recebido da {empresa} o fornecimento de lanche (café da manhã / tarde) durante os dias efetivamente trabalhados no mês de {mes}.\n\n{endereco}, {data}.\n\n\n_______________________________\n{colaborador}\nCPF: {cpf}" },
        { id: "tpl-cesta", nome: "Protocolo de entrega de cesta básica", titulo: "PROTOCOLO DE ENTREGA DE CESTA BÁSICA", corpo: "Eu, {colaborador}, portador(a) do CPF nº {cpf}, ocupante do cargo de {cargo}, declaro para os devidos fins que recebi da empresa {empresa}, inscrita no CNPJ nº {cnpj}, a cesta básica referente ao mês de {mes}.\n\nDeclaro estar ciente de que o benefício é concedido por liberalidade da empresa, não possuindo natureza salarial para quaisquer efeitos legais.\n\n{endereco}, {data}.\n\n\n_______________________________\n{colaborador}\nCPF: {cpf}" },
        { id: "tpl-declaracao", nome: "Declaração de vínculo", titulo: "DECLARAÇÃO", corpo: "Declaramos, para os devidos fins, que {colaborador}, CPF {cpf}, exerce a função de {funcao} na empresa {empresa}, admitido(a) em {admissao}.\n\n{endereco}, {data}.\n\n\n_______________________________\n{responsavel}" },
        { id: "tpl-autorizacao", nome: "Autorização", titulo: "AUTORIZAÇÃO", corpo: "A empresa {empresa}, CNPJ {cnpj}, autoriza {colaborador} a ______________________________________ referente à obra {obra}.\n\n{endereco}, {data}.\n\n\n_______________________________\n{responsavel} — CREA {crea}" }
      ];
    },
    renderModelos: function () {
      var ts = lista("templates");
      var html = this._head(svg("modelos") + "Modelos de Documento", "novo-modelo", "Novo modelo");
      html += '<p class="muted" style="margin:-4px 0 12px">Crie documentos com <b>variáveis</b> entre chaves e gere preenchido em 1 clique. Disponíveis: <code>{empresa} {cnpj} {cidade} {responsavel} {crea} {data} {colaborador} {cpf} {funcao} {admissao} {obra} {cliente} {local}</code></p>';
      if (!ts.length) {
        html += '<div class="card" style="margin-bottom:12px"><b>Comece com modelos prontos</b> (Declaração, Autorização, Comunicado) e edite como quiser. <button class="btn sm primary" data-gacao="seed-modelos" style="margin-left:8px">＋ Adicionar exemplos</button></div>';
        return html + vazioBox("Nenhum modelo ainda", "novo-modelo", "Criar primeiro modelo");
      }
      html += '<table class="tbl"><thead><tr><th>Modelo</th><th>Título</th><th></th></tr></thead><tbody>';
      ts.forEach(function (t) {
        html += '<tr><td style="cursor:pointer" data-gopen="templates:' + t.id + '"><b>' + Util.esc(t.nome || "—") + "</b></td><td>" + Util.esc(t.titulo || "—") + '</td><td class="num"><button class="btn sm primary" data-gacao="gerar-modelo" data-id="' + t.id + '">🖨 Gerar</button> <button class="btn sm" data-gopen="templates:' + t.id + '">Editar</button></td></tr>';
      });
      return html + "</tbody></table>";
    },
    seedModelos: function () {
      if (this._bloqueado()) return;
      this._templatesDefault().forEach(function (t) { if (!lista("templates").filter(function (x) { return x.id === t.id; })[0]) Store.salvar(eid(), "templates", t); });
      App.render(); UI.toast("Modelos de exemplo adicionados.", "ok");
    },
    novoModelo: function () { this.formModelo(null); },
    formModelo: function (t) {
      t = t || {};
      var corpo = '<div class="row">' + campo("Nome do modelo *", inp("g-nome", t.nome, "Ex.: Declaração de vínculo")) + campo("Título do documento", inp("g-titulo", t.titulo, "Ex.: DECLARAÇÃO")) + "</div>"
        + campo("Conteúdo (use {variáveis})", '<textarea id="g-corpo" rows="10" style="font-family:monospace;font-size:12px">' + Util.esc(t.corpo || "") + "</textarea>");
      this._modalForm("templates", t, "Modelo de documento", corpo, function (obj) {
        obj.nome = v("g-nome"); if (!obj.nome) { UI.toast("Informe o nome do modelo.", "erro"); return false; }
        obj.titulo = v("g-titulo") || obj.nome.toUpperCase(); obj.corpo = (document.getElementById("g-corpo") || {}).value || "";
        return true;
      });
    },
    _mesRef: function (mes) { var M = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]; var p = String(mes || "").split("-"); return p[1] ? (M[(Util.num(p[1]) || 1) - 1] || "") + "/" + (p[0] || "") : ""; },
    _ctxVariaveis: function (colab, obra, mesRef) {
      var emp = (typeof Empresa !== "undefined" && Empresa.dados) ? Empresa.dados() : {};
      var brd = function (d) { return d ? String(d).split("-").reverse().join("/") : ""; };
      return {
        empresa: emp.nome || "", cnpj: emp.cnpj || "", cidade: emp.cidade || "", endereco: emp.endereco || emp.cidade || "", responsavel: emp.responsavel || "", crea: emp.crea || "",
        data: new Date().toLocaleDateString("pt-BR"), mes: mesRef || "",
        colaborador: colab ? (colab.nome || "") : "", cpf: colab ? (colab.cpf || "") : "", funcao: colab ? (colab.funcao || "") : "", cargo: colab ? (colab.funcao || "") : "", admissao: colab ? brd(colab.admissao) : "", ctps: colab ? (colab.ctps || "") : "",
        obra: obra ? (obra.nome || "") : "", cliente: obra ? (obra.clienteNome || "") : "", local: obra ? (obra.local || "") : ""
      };
    },
    _aplicarVariaveis: function (texto, ctx) { return String(texto || "").replace(/\{(\w+)\}/g, function (m, k) { return Object.prototype.hasOwnProperty.call(ctx, k) ? ctx[k] : m; }); },
    gerarModelo: function (id) {
      var self = this, t = Store.obter(eid(), "templates", id); if (!t) return;
      var colabs = lista("colaboradores"), obras = lista("obras"), mesAtual = new Date().toISOString().slice(0, 7);
      var corpo = '<p class="muted" style="margin:0 0 10px">Escolha o colaborador (ou <b>todos os ativos</b> — gera uma página por colaborador) e o mês.</p>'
        + '<div class="row">' + campo("Colaborador", sel("g-colab", '<option value="__todos">— TODOS os ativos (1 página cada) —</option>' + optsRec(colabs, "nome", "", "— nenhum —"))) + campo("Obra", sel("g-obra", optsRec(obras, "nome", "", "— nenhuma —"))) + campo("Mês de referência", inp("g-mes", mesAtual, "", "month")) + "</div>";
      UI.modal("Gerar: " + Util.esc(t.nome || ""), corpo, [
        { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
        { texto: "Gerar", classe: "primary", onClick: function () {
          var colVal = v("g-colab"), obra = lista("obras").filter(function (o) { return o.id === v("g-obra"); })[0], mesStr = self._mesRef(v("g-mes"));
          var alvos = colVal === "__todos" ? colabs.filter(function (c) { return c.status === "ativo"; }) : (colVal ? colabs.filter(function (c) { return c.id === colVal; }) : [null]);
          if (colVal === "__todos" && !alvos.length) { UI.toast("Nenhum colaborador ativo para gerar.", "erro"); return; }
          var paginas = alvos.map(function (colab) {
            var texto = self._aplicarVariaveis(t.corpo, self._ctxVariaveis(colab, obra, mesStr));
            var corpoHtml = "<div style='white-space:pre-wrap;line-height:1.8;font-size:13px;text-align:justify;min-height:220px'>" + Util.esc(texto) + "</div>";
            return "<div style='page-break-after:always'>" + self._docShell(Util.esc(t.titulo || t.nome || "DOCUMENTO"), "#0f2740", corpoHtml) + "</div>";
          }).join("");
          UI.fecharModal();
          self._abrirDoc((alvos.length > 1 ? alvos.length + "× " : "") + (t.nome || "Documento"), paginas);
        } }
      ]);
    },
    // =================== USUÁRIOS / EQUIPE (RBAC por departamento) ===================
    _modulosAtribuiveis: function () { return this.modulos.filter(function (m) { return m.id !== "usuarios"; }); },
    _modulosDoDepto: function (dep) {
      if (dep === "diretoria" || !DEPTO_MODULOS[dep]) return this._modulosAtribuiveis().map(function (m) { return m.id; });
      return DEPTO_MODULOS[dep].slice();
    },
    _semPermissao: function (view) {
      var m = this.modulos.filter(function (x) { return x.id === view; })[0];
      return '<div class="flex between mb"><h1 style="margin:0">🔒 Sem acesso</h1></div>'
        + '<div class="card" style="text-align:center;padding:34px">'
        + '<div style="font-size:42px;margin-bottom:8px">🔒</div>'
        + '<p style="font-size:15px">Você não tem permissão para o módulo <b>' + Util.esc(m ? m.nome : view) + "</b>.</p>"
        + '<p class="muted">Fale com o administrador da conta para liberar este módulo ao seu departamento.</p></div>';
    },
    renderUsuarios: function () {
      if (typeof Auth !== "undefined" && Auth.ehAdmin && !Auth.ehAdmin()) return this._semPermissao("usuarios");
      var us = lista("equipe").slice().sort(function (a, b) { return (a.nome || "").localeCompare(b.nome || ""); });
      var ativos = us.filter(function (u) { return u.ativo !== false; }).length;
      var extra = '<span class="muted" style="margin-right:12px;align-self:center">' + us.length + " de " + LIMITE_USUARIOS + " usuários · " + ativos + " ativos</span>";
      var podeAdd = us.length < LIMITE_USUARIOS;
      var html = this._head(svg("usuarios") + "Usuários &amp; Permissões", podeAdd ? "novo-usuario" : "", podeAdd ? "Novo usuário" : "", extra);
      html += '<p class="muted" style="margin:-4px 0 14px">Você (dono da conta) é o <b>administrador</b>. Cadastre até <b>' + LIMITE_USUARIOS + '</b> usuários e libere os módulos por <b>departamento</b> — cada um entra com o próprio login e senha e vê só o que foi liberado.</p>';
      if (!podeAdd) html += '<div class="card" style="background:#fffbeb;border-color:#fde68a;color:#92400e;margin-bottom:12px">Limite de ' + LIMITE_USUARIOS + ' usuários nesta versão. Desative ou exclua um para criar outro.</div>';
      if (!us.length) return html + vazioBox("Nenhum usuário cadastrado", "novo-usuario", "Cadastrar primeiro usuário");
      html += '<table class="tbl"><thead><tr><th>Nome</th><th>Login</th><th>Departamento</th><th class="num">Módulos</th><th>Status</th><th></th></tr></thead><tbody>';
      us.forEach(function (u) {
        var nMod = (u.modulos && u.modulos.length) || 0;
        var st = u.ativo === false ? '<span class="g-pill" style="background:#64748b22;color:#64748b">inativo</span>' : '<span class="g-pill" style="background:#16a34a22;color:#16a34a">ativo</span>';
        html += '<tr><td style="cursor:pointer" data-gopen="equipe:' + u.id + '"><b>' + Util.esc(u.nome || "—") + "</b></td><td>" + Util.esc(u.login || "—") + "</td><td>" + rot(P.departamento, u.departamento) + '</td><td class="num">' + nMod + "</td><td>" + st + '</td><td class="num"><button class="btn sm" data-gopen="equipe:' + u.id + '">Editar</button></td></tr>';
      });
      return html + "</tbody></table>";
    },
    novoUsuario: function () { this.formUsuario(null); },
    formUsuario: function (u) {
      if (typeof Auth !== "undefined" && Auth.ehAdmin && !Auth.ehAdmin()) { UI.toast("Só o administrador gerencia usuários.", "erro"); return; }
      u = u || {}; var self = this, ehNovo = !u.id;
      var atrib = this._modulosAtribuiveis();
      var modsSel = (u.modulos && u.modulos.length) ? u.modulos.slice() : this._modulosDoDepto(u.departamento || "engenharia");
      var checkboxes = '<div id="us-mods" style="display:grid;grid-template-columns:1fr 1fr;gap:4px 14px;max-height:230px;overflow:auto;border:1px solid var(--linha,#e2e8f0);border-radius:10px;padding:10px">' +
        atrib.map(function (m) {
          var on = m.id === "dashboard" || modsSel.indexOf(m.id) > -1;
          var dis = m.id === "dashboard" ? " disabled" : "";
          return '<label style="display:flex;align-items:center;gap:7px;font-size:13px;cursor:pointer"><input type="checkbox" data-mod="' + m.id + '"' + (on ? " checked" : "") + dis + "> " + Util.esc(m.nome) + (m.id === "dashboard" ? ' <span class="muted">(sempre)</span>' : "") + "</label>";
        }).join("") + "</div>";
      var corpo =
        '<div class="row">' + campo("Nome *", inp("g-nome", u.nome, "Ex.: Maria Souza")) + campo("Login (usuário) *", inp("g-login", u.login, "ex.: maria")) + "</div>" +
        '<div class="row">' + campo(ehNovo ? "Senha *" : "Nova senha (branco = manter)", '<input id="g-senha" type="text" placeholder="' + (ehNovo ? "senha de acesso" : "manter atual") + '">') + campo("Departamento", sel("g-depto", opts(P.departamento, u.departamento || "engenharia"))) + campo("Status", sel("g-ativo", '<option value="1"' + (u.ativo !== false ? " selected" : "") + '>Ativo</option><option value="0"' + (u.ativo === false ? " selected" : "") + ">Inativo</option>")) + "</div>" +
        campo('Módulos liberados <button type="button" class="btn sm" id="us-preset" style="margin-left:8px">↺ preset do departamento</button>', checkboxes) +
        campo("Aprovações", '<label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer"><input type="checkbox" id="g-aprovador"' + (u.aprovador ? " checked" : "") + '> Pode <b>aprovar / rejeitar</b> medições, pedidos de compra e requisições</label>');
      this._modalForm("equipe", u, "Usuário", corpo, function (obj) {
        obj.nome = v("g-nome"); if (!obj.nome) { UI.toast("Informe o nome.", "erro"); return false; }
        obj.login = String(v("g-login") || "").trim().toLowerCase(); if (obj.login.length < 3) { UI.toast("Login muito curto (mín. 3).", "erro"); return false; }
        // login único GLOBALMENTE (evita colisão entre empresas no mesmo navegador)
        var emUso = (typeof Auth !== "undefined" && Auth.loginEquipeEmUso)
          ? Auth.loginEquipeEmUso(obj.login, eid(), obj.id)
          : !!lista("equipe").filter(function (x) { return x.id !== obj.id && String(x.login || "").toLowerCase() === obj.login; })[0];
        if (emUso) { UI.toast('Já existe um usuário com o login "' + obj.login + '".', "erro"); return false; }
        if (ehNovo && lista("equipe").length >= LIMITE_USUARIOS) { UI.toast("Limite de " + LIMITE_USUARIOS + " usuários atingido.", "erro"); return false; }
        var senha = v("g-senha");
        if (ehNovo && !senha) { UI.toast("Defina uma senha para o 1º acesso.", "erro"); return false; }
        if (senha) obj.senhaHash = (typeof Auth !== "undefined" && Auth._hashSenha) ? Auth._hashSenha(senha) : btoa(unescape(encodeURIComponent(senha)));
        obj.departamento = v("g-depto");
        obj.ativo = v("g-ativo") !== "0";
        var mods = ["dashboard"];
        Array.prototype.forEach.call(document.querySelectorAll("#us-mods [data-mod]"), function (c) { if (c.checked && c.getAttribute("data-mod") !== "dashboard") mods.push(c.getAttribute("data-mod")); });
        obj.modulos = mods;
        obj.aprovador = !!(document.getElementById("g-aprovador") && document.getElementById("g-aprovador").checked);
        return true;
      });
      var preset = document.getElementById("us-preset");
      if (preset) preset.onclick = function () {
        var dep = (document.getElementById("g-depto") || {}).value || "engenharia";
        var ids = self._modulosDoDepto(dep);
        Array.prototype.forEach.call(document.querySelectorAll("#us-mods [data-mod]"), function (c) {
          var id = c.getAttribute("data-mod"); if (id === "dashboard") return; c.checked = ids.indexOf(id) > -1;
        });
        UI.toast("Módulos do departamento aplicados.", "ok");
      };
    },
    renderFiscal: function () {
      var nfs = lista("fiscal"), obras = lista("obras");
      var totEnt = nfs.filter(function (n) { return n.tipo === "entrada" && n.status === "emitida"; }).reduce(function (s, n) { return s + Util.num(n.valorTotal); }, 0);
      var totSai = nfs.filter(function (n) { return n.tipo === "saida" && n.status === "emitida"; }).reduce(function (s, n) { return s + Util.num(n.valorTotal); }, 0);
      var extra = '<span class="muted" style="margin-right:12px;align-self:center">Entradas: <b>' + Util.fmtMoeda(totEnt) + "</b> · Saídas: <b>" + Util.fmtMoeda(totSai) + "</b></span>" +
        '<button class="btn" data-gacao="importar-xml-lote" title="Importe vários XMLs de NF-e de uma vez — direto do arquivo, sem IA e sem internet">📥 XML em lote</button> ' +
        '<button class="btn ghost" data-gacao="consultar-chave" title="Cole a chave de acesso (44 dígitos do DANFE) — valida e identifica a nota na hora">🔎 Chave de acesso</button>';
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
        if (!(obj.valorTotal > 0) && obj.status !== "aguardando_xml") { UI.toast("Informe o valor total (ou marque como Aguardando XML).", "erro"); return false; }
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

    // ---------- Fiscal: XML em lote + consulta por chave de acesso (offline, sem IA) ----------
    importarXmlLote: function () {
      if (this._bloqueado()) return;
      var self = this;
      var inp = document.createElement("input");
      inp.type = "file"; inp.accept = ".xml"; inp.multiple = true; inp.style.display = "none";
      inp.onchange = function () {
        var files = Array.prototype.slice.call(inp.files || []);
        if (!files.length) return;
        var okN = 0, dupN = 0, atuN = 0, errN = 0, semIdN = 0, semValorN = 0, fornN = 0, valorNovas = 0, valorAtu = 0, pend = files.length;
        var fim = function () {
          if (--pend > 0) return;
          App.render();
          var li = [];
          if (okN) li.push("<li><b>" + okN + "</b> nota(s) nova(s) importada(s)" + (valorNovas > 0 ? " — " + Util.fmtMoeda(valorNovas) : "") + "</li>");
          if (atuN) li.push("<li><b>" + atuN + "</b> nota(s) que aguardava(m) XML completada(s)" + (valorAtu > 0 ? " — " + Util.fmtMoeda(valorAtu) : "") + "</li>");
          if (dupN) li.push("<li><b>" + dupN + "</b> já existia(m) — pulada(s), sem duplicar</li>");
          if (fornN) li.push("<li><b>" + fornN + "</b> parceiro(s) cadastrado(s) automaticamente</li>");
          if (semIdN) li.push("<li><b>" + semIdN + "</b> XML sem número/chave de NF-e — ignorado(s)</li>");
          if (semValorN) li.push("<li><b>" + semValorN + "</b> XML sem valor legível — a nota segue aguardando um XML completo</li>");
          if (errN) li.push("<li><b>" + errN + "</b> arquivo(s) não reconhecido(s) como NF-e</li>");
          if (!li.length) li.push("<li>Nenhum arquivo processado.</li>");
          var corpo = '<ul style="margin:0 0 10px 18px;padding:0">' + li.join("") + "</ul>" +
            ((okN || atuN) ? '<p class="muted">Use o botão <b>Lançar</b> na lista pra gerar o lançamento de cada nota no Financeiro.</p>' : "");
          UI.modal("Importação de XML concluída", corpo, [{ texto: "Fechar", classe: "primary", onClick: function () { UI.fecharModal(); } }]);
        };
        files.forEach(function (file) {
          var fr = new FileReader();
          fr.onload = function () {
            try {
              var dados = self._parseNfeXml(fr.result);
              if (!dados) { errN++; }
              else {
                var r = self._registrarNfe(dados, "xml-lote");
                if (r.fornecedorNovo) fornN++;
                if (r.atualizada) { atuN++; valorAtu += Util.num(dados.valor); }
                else if (r.invalido) semValorN++;
                else if (r.dup) dupN++;
                else if (r.nota) { okN++; valorNovas += Util.num(dados.valor); }
                else semIdN++;
              }
            } catch (e) { errN++; }
            fim();
          };
          fr.onerror = function () { errN++; fim(); };
          fr.readAsText(file);
        });
      };
      document.body.appendChild(inp); inp.click(); setTimeout(function () { inp.remove(); }, 60000);
    },
    /* CNPJ/CPF da própria empresa (⚙ Empresa), só dígitos — "" se não configurado. */
    _cnpjProprio: function () {
      try { return (typeof Empresa !== "undefined") ? String((Empresa.dados() || {}).cnpj || "").replace(/\D/g, "") : ""; }
      catch (e) { return ""; }
    },
    /* Grava uma NF-e parseada no Fiscal (+ parceiro se novo), sem abrir formulário.
     * Emitente = própria empresa → nota de SAÍDA e o parceiro é o destinatário
     * (cadastrado como cliente); senão entrada e o emitente vira fornecedor.
     * Dedupe por chave (ou nº+parceiro, sem diferenciar caixa). Nota "aguardando_xml"
     * é COMPLETADA pelo XML; sem valor legível (vNF ausente) ela NÃO vira emitida.
     * Retorna { nota, dup, atualizada, invalido, fornecedorNovo }. */
    _registrarNfe: function (dados, origem) {
      var fn = dados.fornecedor || {}, dest = dados.destinatario || {}, fornecedorNovo = false;
      var proprio = this._cnpjProprio();
      var emitDoc = String(fn.cnpj || "").replace(/\D/g, "");
      var ehSaida = !!(proprio && emitDoc && emitDoc === proprio);
      var parc = ehSaida ? dest : fn;
      var parcDoc = String(parc.cnpj || "").replace(/\D/g, "");
      if (parc.nome) {
        var entidade = ehSaida ? "clientes" : "fornecedores";
        var existe = lista(entidade).filter(function (x) { return (parcDoc && x.doc && String(x.doc).replace(/\D/g, "") === parcDoc) || (x.nome || "").toLowerCase() === String(parc.nome).toLowerCase(); })[0];
        if (!existe) {
          Store.salvar(eid(), entidade, { nome: parc.nome, doc: parc.cnpj || "", cidade: parc.cidade || "", uf: parc.uf || "", tipo: parcDoc.length > 11 ? "PJ" : "PF", status: "ativo", origem: origem || "xml-lote" });
          fornecedorNovo = true;
        }
      }
      if (!dados.numero && !dados.chave) return { nota: null, dup: false, atualizada: false, invalido: false, fornecedorNovo: fornecedorNovo };
      var chaveLimpa = String(dados.chave || "").replace(/\D/g, "");
      var jaTem = lista("fiscal").filter(function (x) {
        var xc = String(x.chaveAcesso || "").replace(/\D/g, "");
        if (chaveLimpa && xc) return xc === chaveLimpa;
        return dados.numero && String(x.numero) === String(dados.numero) && (x.parceiro || "").toLowerCase() === (parc.nome || "").toLowerCase();
      })[0];
      if (jaTem && jaTem.status === "aguardando_xml") {
        var vNovo = Util.num(dados.valor);
        if (!(vNovo > 0)) return { nota: jaTem, dup: false, atualizada: false, invalido: true, fornecedorNovo: fornecedorNovo };
        jaTem.numero = dados.numero || jaTem.numero; jaTem.serie = dados.serie || jaTem.serie;
        jaTem.naturezaOp = dados.natureza || jaTem.naturezaOp; jaTem.parceiro = parc.nome || jaTem.parceiro;
        jaTem.dataEmissao = dados.emissao || jaTem.dataEmissao; jaTem.valorTotal = vNovo;
        jaTem.chaveAcesso = dados.chave || jaTem.chaveAcesso || "";
        jaTem.status = "emitida"; jaTem.origem = origem || jaTem.origem;
        Store.salvar(eid(), "fiscal", jaTem);
        return { nota: jaTem, dup: false, atualizada: true, invalido: false, fornecedorNovo: fornecedorNovo };
      }
      if (jaTem) return { nota: jaTem, dup: true, atualizada: false, invalido: false, fornecedorNovo: fornecedorNovo };
      var nota = Store.salvar(eid(), "fiscal", {
        numero: dados.numero || "", serie: dados.serie || "", tipo: ehSaida ? "saida" : "entrada",
        status: "emitida", naturezaOp: dados.natureza || "", parceiro: parc.nome || "", obraId: "",
        dataEmissao: dados.emissao || "", valorProdutos: 0, valorImpostos: 0,
        valorTotal: Util.num(dados.valor), chaveAcesso: dados.chave || "", origem: origem || "xml-lote"
      });
      return { nota: nota, dup: false, atualizada: false, invalido: false, fornecedorNovo: fornecedorNovo };
    },
    /* Decodifica a chave de acesso de 44 dígitos (DANFE/QR-Code) — 100% offline.
     * Layout oficial: cUF(2) AAMM(4) CNPJ(14) modelo(2) série(3) nNF(9) tpEmis(1) cNF(8) DV(1). */
    decodificarChave: function (chave) {
      var d = String(chave || "").replace(/\D/g, "");
      if (d.length !== 44) return { ok: false, erro: "A chave precisa ter 44 dígitos — encontrei " + d.length + "." };
      var UFS = { "11": "RO", "12": "AC", "13": "AM", "14": "RR", "15": "PA", "16": "AP", "17": "TO", "21": "MA", "22": "PI", "23": "CE", "24": "RN", "25": "PB", "26": "PE", "27": "AL", "28": "SE", "29": "BA", "31": "MG", "32": "ES", "33": "RJ", "35": "SP", "41": "PR", "42": "SC", "43": "RS", "50": "MS", "51": "MT", "52": "GO", "53": "DF" };
      var uf = UFS[d.slice(0, 2)];
      if (!uf) return { ok: false, erro: "Código de estado inválido (" + d.slice(0, 2) + ") — confira os 2 primeiros dígitos." };
      var mm = d.slice(4, 6);
      if (+mm < 1 || +mm > 12) return { ok: false, erro: "Mês de emissão inválido (" + mm + ") — confira os dígitos 5 e 6." };
      var soma = 0, peso = 2;
      for (var i = 42; i >= 0; i--) { soma += (+d.charAt(i)) * peso; peso = peso === 9 ? 2 : peso + 1; }
      var resto = soma % 11, dv = resto < 2 ? 0 : 11 - resto;
      if (dv !== +d.charAt(43)) return { ok: false, erro: "Dígito verificador não confere — algum dígito foi digitado errado." };
      var campoDoc = d.slice(6, 20), mod = d.slice(20, 22);
      var modeloNome = mod === "55" ? "NF-e" : mod === "65" ? "NFC-e" : mod === "57" ? "CT-e" : "modelo " + mod;
      // emitente PF (produtor rural etc.): o campo de 14 dígitos vem como 000 + CPF
      var ehCpf = campoDoc.slice(0, 3) === "000";
      var docNum = ehCpf ? campoDoc.slice(3) : campoDoc;
      var docFmt = ehCpf
        ? docNum.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4")
        : docNum.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
      return {
        ok: true, chave: d, uf: uf, competencia: mm + "/20" + d.slice(2, 4),
        doc: docNum, docFmt: docFmt, docTipo: ehCpf ? "CPF" : "CNPJ",
        modelo: mod, modeloNome: modeloNome, importavel: mod === "55" || mod === "65",
        serie: String(+d.slice(22, 25)), numero: String(+d.slice(25, 34))
      };
    },
    consultarChave: function () {
      this._ultimaChave = null;
      var corpo = '<p class="muted">Cole a <b>chave de acesso</b> da nota (44 dígitos, impressos no DANFE ou no QR-Code). O OrçaPRO valida o dígito verificador e identifica estado, emissão, CNPJ do emitente, série e número — <b>sem internet</b>.</p>' +
        campo("Chave de acesso", inp("g-chave-consulta", "", "44 dígitos — pode colar com espaços ou pontos")) +
        '<div id="g-chave-res" style="margin-top:8px"></div>';
      UI.modal("Consultar chave de acesso", corpo, [
        { texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
        { texto: "Verificar", classe: "primary", onClick: function () { Gestao._verificarChave(); } }
      ]);
    },
    _verificarChave: function () {
      var res = UI.el("g-chave-res"); if (!res) return;
      var r = this.decodificarChave(v("g-chave-consulta"));
      if (!r.ok) { res.innerHTML = '<div class="card" style="border-left:4px solid var(--vermelho);padding:10px 12px">✗ ' + Util.esc(r.erro) + "</div>"; return; }
      var jaTem = lista("fiscal").filter(function (x) { return String(x.chaveAcesso || "").replace(/\D/g, "") === r.chave; })[0];
      // identifica o emitente pelo CNPJ/CPF, se já for parceiro cadastrado
      var parceiro = lista("fornecedores").concat(lista("clientes")).filter(function (x) { return String(x.doc || "").replace(/\D/g, "") === r.doc; })[0];
      var linhas = "<b>" + r.modeloNome + "</b> nº <b>" + Util.esc(r.numero) + "</b> · série " + Util.esc(r.serie) +
        "<br>Emitente: <b>" + (parceiro ? Util.esc(parceiro.nome) : r.docTipo + " " + r.docFmt) + "</b>" +
        "<br>Emissão: " + r.competencia + " · " + r.uf;
      if (jaTem) {
        res.innerHTML = '<div class="card" style="border-left:4px solid var(--verde);padding:10px 12px">✓ Chave válida — <b>nota já registrada</b> no Fiscal (' + rot(P.fiscalStatus, jaTem.status) + ").<br>" + linhas + "</div>";
        return;
      }
      if (!r.importavel) {
        res.innerHTML = '<div class="card" style="border-left:4px solid var(--verde);padding:10px 12px">✓ Chave válida.<br>' + linhas +
          '<br><span class="muted">Documento do tipo ' + Util.esc(r.modeloNome) + " não entra pela importação de XML — se precisar, registre pela <b>+ Nova nota</b>.</span></div>";
        return;
      }
      this._ultimaChave = { dec: r, parceiro: parceiro ? parceiro.nome : "" };
      res.innerHTML = '<div class="card" style="border-left:4px solid var(--verde);padding:10px 12px">✓ Chave válida.<br>' + linhas +
        '<br><button id="g-chave-reg" class="btn sm primary mt">Registrar no Fiscal — completo depois com o XML</button></div>';
      var b = UI.el("g-chave-reg"); if (b) b.onclick = function () { Gestao.registrarChavePendente(); };
    },
    registrarChavePendente: function () {
      if (this._bloqueado()) return;
      var u = this._ultimaChave; if (!u) return;
      var r = u.dec;
      var propriaEmpresa = this._cnpjProprio();
      var ehSaida = !!(propriaEmpresa && propriaEmpresa === r.doc);
      Store.salvar(eid(), "fiscal", {
        numero: r.numero, serie: r.serie, tipo: ehSaida ? "saida" : "entrada",
        status: "aguardando_xml", naturezaOp: "", parceiro: ehSaida ? "" : u.parceiro, obraId: "",
        dataEmissao: "", valorProdutos: 0, valorImpostos: 0, valorTotal: 0,
        chaveAcesso: r.chave, origem: "consulta-chave"
      });
      this._ultimaChave = null;
      UI.fecharModal(); App.render();
      UI.toast("Nota registrada como Aguardando XML — importe o XML depois pra completar os valores.", "ok");
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
      // 2+ centros na mesma obra: rateio proporcional ao orçado (sem orçado → partes iguais), senão duplicaria o realizado
      var ccPorObra = {}, orcPorObra = {};
      ccs.forEach(function (c) {
        if (!c.obraId) return;
        ccPorObra[c.obraId] = (ccPorObra[c.obraId] || 0) + 1;
        orcPorObra[c.obraId] = (orcPorObra[c.obraId] || 0) + Util.num(c.valorOrcado);
      });
      function realDoCentro(c) {
        var real = realPorObra[c.obraId] || 0; if (!real) return 0;
        var n = ccPorObra[c.obraId] || 0; if (n <= 1) return real;
        var orcObra = orcPorObra[c.obraId];
        return orcObra > 0 ? real * (Util.num(c.valorOrcado) / orcObra) : real / n;
      }
      var totReal = ccs.reduce(function (s, c) { return s + realDoCentro(c); }, 0);
      var totSaldo = totOrcado - totReal;
      var corTot = totSaldo >= 0 ? "#16a34a" : "#ef4444";
      var extra = '<span class="muted" style="margin-right:12px;align-self:center">Orçado: <b>' + Util.fmtMoeda(totOrcado) + "</b> · Realizado: <b>" + Util.fmtMoeda(totReal) + '</b> · Saldo: <b style="color:' + corTot + '">' + Util.fmtMoeda(totSaldo) + "</b></span>";
      var html = this._head(svg("centrocusto") + "Centros de Custo", "novo-centrocusto", "Novo centro", extra);
      if (!ccs.length) return html + vazioBox("Nenhum centro de custo", "novo-centrocusto", "Cadastrar primeiro");
      html += '<table class="tbl"><thead><tr><th>Código</th><th>Nome</th><th>Tipo</th><th>Obra</th><th class="num">Orçado</th><th class="num" title="Despesas da obra no Financeiro. Obra com 2+ centros: rateio proporcional ao orçado de cada centro.">Realizado</th><th class="num">Saldo</th></tr></thead><tbody>';
      ccs.forEach(function (c) {
        var ob = obras.filter(function (o) { return o.id === c.obraId; })[0];
        var orcado = Util.num(c.valorOrcado);
        var real = realDoCentro(c);
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
        var acao = '<button class="btn sm" data-gacao="recibo-folha" data-id="' + f.id + '">🖨 Recibo</button> ' + (f.status === "aberta" ? '<button class="btn sm primary" data-gacao="lancar-folha-enc" data-id="' + f.id + '">Lançar</button>' : "");
        html += '<tr><td style="cursor:pointer" data-gopen="folha:' + f.id + '"><b>' + Util.esc(f.competencia || "—") + "</b></td><td>" + Util.esc(col ? col.nome : "—") + "</td><td>" + Util.esc(ob ? ob.nome : "—") + '</td><td class="num">' + Util.fmtMoeda(Util.num(f.salarioBase)) + '</td><td class="num"><b>' + Util.fmtMoeda(Util.num(f.custoTotal)) + "</b></td><td>" + pill(f.status) + '</td><td class="num">' + acao + "</td></tr>";
      });
      return html + "</tbody></table>";
    },
    calcFolha: function (f) {
      var base = Util.num(f.salarioBase), enc = Util.num(f.encargosPct), he = Util.num(f.horasExtras), desc = Util.num(f.descontos);
      return base + base * enc / 100 + he - desc;
    },
    reciboFolha: function (id) {
      var f = Store.obter(eid(), "folha", id); if (!f) return;
      var emp = (typeof Empresa !== "undefined" && Empresa.dados) ? Empresa.dados() : {};
      var logo = (typeof Empresa !== "undefined" && Empresa.logoHTML) ? Empresa.logoHTML(46) : "";
      var col = lista("colaboradores").filter(function (c) { return c.id === f.colaboradorId; })[0] || {};
      var base = Util.num(f.salarioBase), he = Util.num(f.horasExtras), desc = Util.num(f.descontos), enc = Util.num(f.encargosPct);
      var faltas = lista("faltas").filter(function (x) { return x.colaboradorId === f.colaboradorId && String(x.data || "").slice(0, 7) === (f.competencia || "") && x.motivo === "injustificada"; }).length;
      var venc = base + he, liq = venc - desc, fgts = base * 0.08;
      var linha = function (cod, d, ref, val, isDesc) { return "<tr><td style='border:1px solid #ccc;padding:4px;text-align:center'>" + cod + "</td><td style='border:1px solid #ccc;padding:4px'>" + d + "</td><td style='border:1px solid #ccc;padding:4px;text-align:center'>" + (ref || "") + "</td><td style='border:1px solid #ccc;padding:4px;text-align:right'>" + (isDesc ? "" : Util.fmtMoeda(val)) + "</td><td style='border:1px solid #ccc;padding:4px;text-align:right'>" + (isDesc ? Util.fmtMoeda(val) : "") + "</td></tr>"; };
      var rows = linha("001", "Salário base", "30", base, false);
      if (he > 0) rows += linha("003", "Horas extras", "", he, false);
      if (desc > 0) rows += linha("101", "Descontos" + (faltas ? " (" + faltas + " falta" + (faltas > 1 ? "s" : "") + " injust.)" : ""), "", desc, true);
      var html = '<div style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:720px;margin:0 auto;font-size:12px">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #0f2740;padding-bottom:8px;margin-bottom:12px"><div>' + logo + '</div><div style="text-align:center;flex:1"><b style="font-size:13px">' + Util.esc(emp.nome || "") + "</b><br><span style='font-size:9px'>" + (emp.cnpj ? "CNPJ " + Util.esc(emp.cnpj) : "") + "</span></div><div style='text-align:right'><b>RECIBO DE PAGAMENTO</b><br><span style='font-size:10px'>Competência: " + Util.esc(f.competencia || "") + "</span></div></div>"
        + "<table style='width:100%;font-size:12px;margin-bottom:10px'><tr><td><b>Colaborador:</b> " + Util.esc(col.nome || "—") + "</td><td><b>Função:</b> " + Util.esc(col.funcao || "—") + "</td><td><b>CPF:</b> " + Util.esc(col.cpf || "—") + "</td></tr></table>"
        + "<table style='width:100%;border-collapse:collapse;font-size:11.5px'><thead><tr style='background:#0f2740;color:#fff'><th style='border:1px solid #ccc;padding:4px'>Cód</th><th style='border:1px solid #ccc;padding:4px'>Descrição</th><th style='border:1px solid #ccc;padding:4px'>Ref</th><th style='border:1px solid #ccc;padding:4px'>Vencimentos</th><th style='border:1px solid #ccc;padding:4px'>Descontos</th></tr></thead><tbody>" + rows + "</tbody></table>"
        + "<div style='display:flex;justify-content:flex-end;gap:24px;margin-top:8px;font-size:12px'><div>Total Vencimentos: <b>" + Util.fmtMoeda(venc) + "</b></div><div>Total Descontos: <b>" + Util.fmtMoeda(desc) + "</b></div></div>"
        + "<div style='text-align:right;margin-top:6px;font-size:15px'><b>VALOR LÍQUIDO: " + Util.fmtMoeda(liq) + "</b></div>"
        + "<div style='display:flex;gap:20px;margin-top:8px;font-size:10px;color:#555;border-top:1px dashed #ccc;padding-top:6px'><span>Base FGTS: " + Util.fmtMoeda(base) + "</span><span>FGTS (8%): " + Util.fmtMoeda(fgts) + "</span><span>Encargos ref.: " + Util.fmtNum(enc, 0) + "%</span></div>"
        + "<div style='display:flex;justify-content:space-between;margin-top:44px;gap:40px'><div style='flex:1;text-align:center;border-top:1px solid #333;padding-top:4px;font-size:11px'>Assinatura do Empregador</div><div style='flex:1;text-align:center;border-top:1px solid #333;padding-top:4px;font-size:11px'>Assinatura do Colaborador</div></div>"
        + "<div style='text-align:right;font-size:8px;color:#999;margin-top:12px'>Gerado pelo OrçaPRO IA</div></div>";
      if (typeof App !== "undefined" && App._abrirPrint) App._abrirPrint("Recibo — " + (col.nome || ""), html);
      else { var w = window.open("", "_blank"); if (w) { w.document.write(html); w.document.close(); } }
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

    // ---------- FOLHA SEMANAL (diaristas por obra: favorecido + PIX + fechamento) ----------
    _fsSemana: null, _fsObra: "",
    _fsTodos: function () { return Store.listar(eid(), "fs_lancamentos"); },
    _fsLancs: function () { var s = this._fsSemana, o = this._fsObra; return this._fsTodos().filter(function (l) { return l.semana === s && (!o || l.obraId === o); }); },
    _fsNomeObra: function (id) { var o = Store.obter(eid(), "obras", id); return o ? o.nome : (id || "— sem obra —"); },
    fsTroca: function (campo, val) { if (campo === "semana") this._fsSemana = val; else this._fsObra = val; App.render(); },
    renderFolhaSemanal: function () {
      var FS = window.FolhaSemanal; if (!FS) return this._head("Folha Semanal", "", "") + '<div class="card">Motor da Folha Semanal não carregado.</div>';
      var self = this;
      if (!this._fsSemana) { var ts = this._fsTodos().map(function (l) { return l.semana; }).sort(); this._fsSemana = ts.length ? ts[ts.length - 1] : FS.chaveSemana(new Date()); }
      var semanas = {}; this._fsTodos().forEach(function (l) { if (l.semana) semanas[l.semana] = 1; }); semanas[this._fsSemana] = 1; semanas[FS.chaveSemana(new Date())] = 1;
      var selSem = '<select data-gacao="fs-semana" style="max-width:210px">' + Object.keys(semanas).sort().reverse().map(function (s) { return '<option value="' + s + '"' + (s === self._fsSemana ? " selected" : "") + ">Semana " + FS.periodoDaChave(s) + "</option>"; }).join("") + "</select>";
      var obras = lista("obras");
      var selObra = '<select data-gacao="fs-obra" style="max-width:180px"><option value="">Todas as obras</option>' + obras.map(function (o) { return '<option value="' + Util.esc(o.id) + '"' + (o.id === self._fsObra ? " selected" : "") + ">" + Util.esc(o.nome) + "</option>"; }).join("") + "</select>";
      var extra = selSem + " " + selObra +
        ' <button class="btn sm" data-gacao="fs-copiar" title="Recria nesta semana a equipe da semana anterior (só diárias)">⟳ Copiar semana ant.</button>' +
        ' <button class="btn sm" data-gacao="fs-importar">📥 Importar planilha</button>' +
        ' <button class="btn sm" data-gacao="fs-print" data-val="fechamento">🖨 Fechamento</button>' +
        ' <button class="btn sm" data-gacao="fs-print" data-val="pix">🧾 Lista PIX</button>' +
        ' <button class="btn sm" data-gacao="fs-recibos">✍ Recibos</button>' +
        ' <button class="btn sm" data-gacao="fs-mes">📅 Resumo do mês</button>' +
        ' <button class="btn sm primary" data-gacao="fs-entregaveis">📄 Entregáveis (PDF·Word·Excel)</button>' +
        ' <button class="btn sm" data-gacao="fs-financeiro">💸 Lançar no Financeiro</button>';
      var html = this._head(svg("folhasemanal") + "Folha Semanal · Diaristas", "fs-nova", "Lançamento", extra);
      var lancs = this._fsLancs(), fech = FS.fechamento(lancs), pix = FS.listaPix(lancs);
      var pagos = this._fsPagos(), pagosN = 0, pagoTotal = 0;
      pix.forEach(function (p) { if (pagos[p.favKey] && pagos[p.favKey].pago) { pagosN++; pagoTotal += p.total; } });
      html += '<div class="kpis kpis-g" style="margin-bottom:14px">' +
        '<div class="card kpi destaque"><div class="rotulo">Total da semana</div><div class="num">' + Util.fmtMoeda(fech.total) + '</div></div>' +
        '<div class="card kpi"><div class="rotulo">Obras com folha</div><div class="num">' + Object.keys(fech.porObra).length + '</div></div>' +
        '<div class="card kpi"><div class="rotulo">PIX pagos</div><div class="num">' + pagosN + ' / ' + pix.length + '</div></div>' +
        '<div class="card kpi ' + (fech.total - pagoTotal > 0 ? 'custo' : 'destaque') + '"><div class="rotulo">Falta pagar</div><div class="num">' + Util.fmtMoeda(Math.max(0, fech.total - pagoTotal)) + '</div></div></div>';
      var cfl = FS.conflitos(lancs);
      if (cfl.length) {
        html += '<div class="card" style="border-left:4px solid var(--amarelo);margin-bottom:14px;padding:10px 14px"><b>⚠ Possível conflito de alocação:</b> ' +
          cfl.slice(0, 3).map(function (c) { return c.nome + " tem diária em " + c.obras.length + " obras na " + c.rotDia; }).join(" · ") +
          (cfl.length > 3 ? " · +" + (cfl.length - 3) + " caso(s)" : "") + ' <span class="muted">— confira se é proposital (meio período em cada).</span></div>';
      }
      if (!lancs.length) return html + '<div class="card" style="text-align:center;padding:34px 20px"><b>Nenhum lançamento nesta semana.</b><br><span class="muted">Clique em <b>+ Lançamento</b> pra lançar as diárias — ou <b>📥 Importar planilha</b> pra trazer a sua planilha semanal inteira (uma obra por aba, com favorecido e chave PIX): o sistema cadastra obras, colaboradores e a semana sozinho.</span></div>';
      Object.keys(fech.porObra).forEach(function (ob) {
        var g = fech.porObra[ob];
        html += '<div class="card" style="margin-bottom:14px;padding:0;overflow:auto"><div style="padding:12px 14px 8px;display:flex;justify-content:space-between;align-items:center"><b>' + Util.esc(self._fsNomeObra(ob)) + '</b><b style="color:var(--verde)">' + Util.fmtMoeda(g.total) + "</b></div>" +
          '<table class="tbl"><thead><tr><th>Operário / lançamento</th><th class="num">Seg</th><th class="num">Ter</th><th class="num">Qua</th><th class="num">Qui</th><th class="num">Sex</th><th class="num">Sáb</th><th class="num">Dom</th><th class="num">H.E.</th><th class="num">Total</th><th></th></tr></thead><tbody>';
        g.linhas.forEach(function (l) {
          var cels = FS.DIAS.map(function (d) {
            if (l.tipo !== "diaria" && !l.usarValor) return '<td class="num muted">—</td>';
            if (l.faltas && l.faltas.indexOf(d) !== -1) return '<td class="num" style="color:var(--vermelho);font-weight:700">✕</td>';
            var v = l.dias && l.dias[d]; return '<td class="num">' + (v ? Util.fmtNum(v, 0) : "") + "</td>";
          }).join("");
          var rotTipo = l.tipo && l.tipo !== "diaria" ? ' <span class="g-pill" style="background:var(--surface-3)">' + Util.esc(l.tipo) + "</span>" : "";
          html += '<tr><td><b>' + Util.esc(l.nome || "—") + "</b>" + (l.funcao ? ' <span class="muted">· ' + Util.esc(l.funcao) + "</span>" : "") + rotTipo +
            (l.favorecido || l.chavePix ? '<br><span class="muted" style="font-size:11px">' + Util.esc(l.favorecido || "") + (l.chavePix ? " · PIX " + Util.esc(l.chavePix) : "") + "</span>" : "") + "</td>" +
            cels + '<td class="num">' + (FS.num(l.he) ? Util.fmtNum(l.he, 0) : "") + '</td><td class="num"><b>' + Util.fmtMoeda(FS.totalFinal(l)) + '</b></td>' +
            '<td class="num" style="white-space:nowrap"><button class="btn sm" data-gacao="fs-edit" data-val="' + l.id + '">✎</button> <button class="btn sm danger" data-gacao="fs-del" data-val="' + l.id + '">🗑</button></td></tr>';
        });
        html += "</tbody></table></div>";
      });
      // pagamentos da semana: pago na tela + WhatsApp + assinatura
      html += '<div class="card" style="padding:0;overflow:auto"><div style="padding:12px 14px 8px"><b>💸 Pagamentos da semana (PIX)</b> <span class="muted" style="font-size:12px">— marque quem já recebeu; o recibo guarda a assinatura</span></div>' +
        '<table class="tbl"><thead><tr><th>Favorecido</th><th>Chave PIX</th><th class="num">Valor</th><th>Contato</th><th>Assinatura</th><th>Status</th></tr></thead><tbody>';
      pix.forEach(function (p) {
        var pg = pagos[p.favKey], fone = FS.foneDaChave(p.chavePix);
        var zap = fone ? '<a class="btn sm" target="_blank" rel="noopener" href="https://wa.me/' + fone + '?text=' + encodeURIComponent("Olá, " + p.favorecido + "! Seu pagamento da semana (" + FS.periodoDaChave(self._fsSemana) + ") foi enviado: " + Util.fmtMoeda(p.total) + " via PIX.") + '">💬 WhatsApp</a>' : '<span class="muted">—</span>';
        var ass = pg && pg.assinatura ? '<span style="color:var(--verde);font-weight:700">✓ assinado</span>' : '<button class="btn sm" data-gacao="fs-assinar" data-val="' + Util.esc(p.favKey) + '">✍ Colher</button>';
        var st = pg && pg.pago ? '<button class="btn sm success" data-gacao="fs-pago" data-val="' + Util.esc(p.favKey) + '">✓ Pago</button>' : '<button class="btn sm" data-gacao="fs-pago" data-val="' + Util.esc(p.favKey) + '" style="border-color:var(--amarelo)">Marcar pago</button>';
        html += '<tr><td><b>' + Util.esc(p.favorecido) + '</b><br><span class="muted" style="font-size:11px">' + p.itens.map(function (i) { return Util.esc(i.nome || ""); }).join(", ") + '</span></td><td>' + Util.esc(p.chavePix || "—") + '</td><td class="num"><b>' + Util.fmtMoeda(p.total) + "</b></td><td>" + zap + "</td><td>" + ass + "</td><td>" + st + "</td></tr>";
      });
      html += "</tbody></table></div>";
      return html;
    },
    // pagamentos: mapa favKey → registro {semana, favKey, pago, assinatura}
    _fsPagos: function () { var s = this._fsSemana, m = {}; Store.listar(eid(), "fs_pagamentos").forEach(function (p) { if (p.semana === s) m[p.favKey] = p; }); return m; },
    fsTogglePago: function (favKey) {
      var FS = window.FolhaSemanal;
      var p = this._fsPagos()[favKey] || { semana: this._fsSemana, favKey: favKey };
      p.pago = !p.pago; p.em = p.pago ? Util.agoraISO() : null;
      // snapshot p/ auditoria e KPI por obra: valor e obras cobertas por este PIX
      var grupo = FS.listaPix(this._fsLancs()).filter(function (g) { return g.favKey === favKey; })[0];
      if (grupo) { p.valor = grupo.total; p.obras = grupo.itens.map(function (i) { return i.obraId; }).filter(function (v, i, a) { return v && a.indexOf(v) === i; }); }
      Store.salvar(eid(), "fs_pagamentos", p); App.render();
    },
    fsAssinar: function (favKey) {
      var self = this;
      UI.modal("✍ Assinatura do recebedor", '<p class="muted" style="margin:0 0 8px">Peça pra pessoa assinar com o dedo (celular) ou o mouse — fica guardada no recibo desta semana.</p>' +
        '<canvas id="fs-ass" width="600" height="190" style="width:100%;border:1.5px dashed var(--linha-forte);border-radius:10px;background:#fff;touch-action:none"></canvas>',
        [{ texto: "Limpar", classe: "ghost", onClick: function () { var c = UI.el("fs-ass"), x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); } },
         { texto: "Salvar assinatura", classe: "primary", onClick: function () {
           var c = UI.el("fs-ass"); if (!c) return;
           var p = self._fsPagos()[favKey] || { semana: self._fsSemana, favKey: favKey };
           // JPEG 0.6 sobre fundo branco: ~5-10x menor que PNG — 30+ recibos/semana sem estourar a quota
           p.assinatura = c.toDataURL("image/jpeg", 0.6); p.assinadoEm = Util.agoraISO();
           Store.salvar(eid(), "fs_pagamentos", p); UI.fecharModal(); App.render(); UI.toast("Assinatura guardada.", "ok");
         } },
         { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } }]);
      var cv = UI.el("fs-ass"); if (!cv) return;
      var ctx = cv.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height); // JPEG não tem transparência — fundo branco desde o início
      ctx.lineWidth = 2.4; ctx.lineCap = "round"; ctx.strokeStyle = "#14202e";
      var des = false;
      function pos(e) { var r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * (cv.width / r.width), y: (e.clientY - r.top) * (cv.height / r.height) }; }
      cv.addEventListener("pointerdown", function (e) { des = true; var p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); e.preventDefault(); });
      cv.addEventListener("pointermove", function (e) { if (!des) return; var p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); e.preventDefault(); });
      ["pointerup", "pointerleave"].forEach(function (ev) { cv.addEventListener(ev, function () { des = false; }); });
    },
    fsCopiarSemana: function () {
      var FS = window.FolhaSemanal, self = this;
      var ant = FS.semanaVizinha(this._fsSemana, -1);
      var deLa = this._fsTodos().filter(function (l) { return l.semana === ant && l.tipo === "diaria"; });
      if (!deLa.length) { UI.toast("A semana anterior (" + FS.periodoDaChave(ant) + ") não tem diárias pra copiar.", "erro"); return; }
      if (!confirm("Copiar " + deLa.length + " diárias da semana " + FS.periodoDaChave(ant) + " pra esta semana? (Vêm com os mesmos valores de diária, sem faltas, sem hora extra — empreitas e fretes não são copiados.)")) return;
      var jaTem = {}; this._fsLancs().forEach(function (l) { jaTem[(l.obraId || "") + "|" + (l.nome || "").toUpperCase()] = 1; });
      var n = 0;
      deLa.forEach(function (l) {
        if (jaTem[(l.obraId || "") + "|" + (l.nome || "").toUpperCase()]) return;
        Store.salvar(eid(), "fs_lancamentos", { semana: self._fsSemana, obraId: l.obraId, colaboradorId: l.colaboradorId || "", nome: l.nome, funcao: l.funcao || "", favorecido: l.favorecido || "", chavePix: l.chavePix || "", tipo: "diaria", dias: Util.clone(l.dias || {}), faltas: [], he: 0, obs: "" });
        n++;
      });
      App.render(); UI.toast("⟳ " + n + " diárias copiadas da semana anterior. Ajuste faltas e exceções.", "ok");
    },
    fsResumoMes: function () {
      var FS = window.FolhaSemanal, self = this, mes = this._fsSemana.slice(0, 7);
      var rm = FS.resumoMensal(this._fsTodos(), mes);
      if (!rm.total) { UI.toast("Nenhuma folha no mês " + mes + ".", "erro"); return; }
      var rotMes = mes.split("-").reverse().join("/");
      var corpo = '<p style="margin:0 0 10px">Competência <b>' + rotMes + "</b> · " + rm.semanas.length + " semana(s): " + rm.semanas.map(function (s) { return FS.periodoDaChave(s); }).join(" · ") + "</p>";
      corpo += '<h3 style="margin:10px 0 6px;font-size:13px;border-left:4px solid #16a34a;padding-left:8px">Por obra</h3><table style="width:100%;border-collapse:collapse;font-size:11px">';
      Object.keys(rm.porObra).sort(function (a, b) { return rm.porObra[b] - rm.porObra[a]; }).forEach(function (ob) {
        corpo += '<tr><td style="padding:5px;border:1px solid #ccc">' + Util.esc(self._fsNomeObra(ob)) + '</td><td style="padding:5px;border:1px solid #ccc;text-align:right"><b>' + Util.fmtMoeda(rm.porObra[ob]) + "</b></td></tr>";
      });
      corpo += '<tr style="background:#0f2740;color:#fff"><td style="padding:6px;border:1px solid #0f2740"><b>TOTAL DO MÊS</b></td><td style="padding:6px;border:1px solid #0f2740;text-align:right"><b>' + Util.fmtMoeda(rm.total) + "</b></td></tr></table>";
      corpo += '<h3 style="margin:14px 0 6px;font-size:13px;border-left:4px solid #2e6f9e;padding-left:8px">Por favorecido</h3><table style="width:100%;border-collapse:collapse;font-size:11px">';
      Object.keys(rm.porPessoa).sort(function (a, b) { return rm.porPessoa[b] - rm.porPessoa[a]; }).forEach(function (q) {
        corpo += '<tr><td style="padding:5px;border:1px solid #ccc">' + Util.esc(q) + '</td><td style="padding:5px;border:1px solid #ccc;text-align:right">' + Util.fmtMoeda(rm.porPessoa[q]) + "</td></tr>";
      });
      corpo += "</table>";
      App._abrirPrint("Resumo Mensal da Folha — " + rotMes, this._docShell("RESUMO MENSAL — FOLHA DE DIARISTAS", "#2e6f9e", corpo, "fs_mes"));
    },
    fsRecibos: function () {
      var FS = window.FolhaSemanal, self = this, lancs = this._fsLancs();
      if (!lancs.length) { UI.toast("Sem lançamentos nesta semana.", "erro"); return; }
      var pix = FS.listaPix(lancs), pagos = this._fsPagos(), periodo = FS.periodoDaChave(this._fsSemana);
      var emp = (typeof Empresa !== "undefined" && Empresa.dados) ? Empresa.dados() : {};
      var corpo = "";
      pix.forEach(function (p, i) {
        var pg = pagos[p.favKey];
        var ref = p.itens.map(function (it) { return (it.nome || "") + " (" + self._fsNomeObra(it.obraId) + ")"; }).join(", ");
        corpo += '<div style="border:1px solid #999;border-radius:8px;padding:12px 14px;margin-bottom:12px;page-break-inside:avoid">' +
          '<div style="display:flex;justify-content:space-between"><b>RECIBO DE PAGAMENTO — SEMANA ' + periodo + '</b><b>' + Util.fmtMoeda(p.total) + "</b></div>" +
          '<p style="margin:8px 0;font-size:11px">Recebi de <b>' + Util.esc(emp.nome || "________________") + "</b> a importância de <b>" + Util.fmtMoeda(p.total) + "</b> referente aos serviços prestados por " + Util.esc(ref) + ", pagos via PIX (" + Util.esc(p.chavePix || "—") + ").</p>" +
          (pg && pg.assinatura ? '<img src="' + pg.assinatura + '" style="height:60px;display:block;margin:4px 0 0">' : '<div style="height:46px"></div>') +
          '<div style="border-top:1px solid #333;width:320px;text-align:center;font-size:10px;padding-top:3px">' + Util.esc(p.favorecido) + (pg && pg.assinadoEm ? " · assinado em " + pg.assinadoEm.slice(0, 10).split("-").reverse().join("/") : "") + "</div></div>";
      });
      App._abrirPrint("Recibos da Semana — " + periodo, this._docShell("RECIBOS DE PAGAMENTO — " + periodo, "#16a34a", corpo, "fs_recibos"));
    },
    fsCsv: function () {
      var FS = window.FolhaSemanal, self = this, lancs = this._fsLancs();
      if (!lancs.length) { UI.toast("Sem lançamentos nesta semana.", "erro"); return; }
      var linhas = [["Obra", "Nome", "Função", "Tipo", "Favorecido", "Chave PIX", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom", "Hora extra", "Total"].join(";")];
      lancs.forEach(function (l) {
        var dias = FS.DIAS.map(function (d) { return (l.faltas && l.faltas.indexOf(d) !== -1) ? "x" : String((l.dias && l.dias[d]) || "").replace(".", ","); });
        linhas.push([self._fsNomeObra(l.obraId), l.nome || "", l.funcao || "", l.tipo || "", l.favorecido || "", l.chavePix || ""].map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(";") + ";" + dias.join(";") + ";" + String(FS.num(l.he) || "").replace(".", ",") + ";" + String(FS.totalFinal(l)).replace(".", ","));
      });
      var blob = new Blob(["﻿" + linhas.join("\r\n")], { type: "text/csv;charset=utf-8" });
      var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "folha-semanal-" + this._fsSemana + ".csv"; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
      UI.toast("⬇ CSV da semana baixado (abre direto no Excel).", "ok");
    },
    // ---------- Central de Entregáveis (PDF · Word · Excel PRO · CSV) ----------
    fsEntregaveis: function () {
      var FS = window.FolhaSemanal, self = this;
      var obras = lista("obras");
      var favs = FS.listaPix(this._fsTodos());
      var corpo =
        '<div class="row">' +
        campo("Gerar um bloco para cada", sel("g-rel-grp", opts([["fav", "Favorecido (pessoa que recebe)"], ["obra", "Obra"]], "fav"))) +
        campo("Favorecido", '<select id="g-rel-fav"><option value="">Todos</option>' + favs.map(function (f) { return '<option value="' + Util.esc(f.favKey) + '">' + Util.esc(f.favorecido) + "</option>"; }).join("") + "</select>") +
        campo("Obra", '<select id="g-rel-obra"><option value="">Todas</option>' + obras.map(function (o) { return '<option value="' + Util.esc(o.id) + '">' + Util.esc(o.nome) + "</option>"; }).join("") + "</select>") + "</div>" +
        '<div class="row">' + campo("Período", sel("g-rel-per", opts([["semana", "Semana atual"], ["mes", "Semanas do mês (01, 02, 03…)"], ["intervalo", "Intervalo de datas"]], "mes"))) +
        campo("Mês", '<input id="g-rel-mes" type="month" value="' + this._fsSemana.slice(0, 7) + '">') + "</div>" +
        '<div id="g-rel-sems" class="flex" style="flex-wrap:wrap;gap:10px;margin:2px 0 8px"></div>' +
        '<div id="g-rel-int" class="row" style="display:none">' + campo("De", '<input id="g-rel-de" type="date">') + campo("Até", '<input id="g-rel-ate" type="date">') + "</div>" +
        '<div class="flex" style="flex-wrap:wrap;gap:14px;margin:6px 0 2px">' +
        '<label style="cursor:pointer"><input type="checkbox" id="g-rel-med" checked> Medição (anterior · atual · acumulado)</label>' +
        '<label style="cursor:pointer"><input type="checkbox" id="g-rel-tipo" checked> Por tipo (MO · material · frete…)</label>' +
        '<label style="cursor:pointer"><input type="checkbox" id="g-rel-graf" checked> Gráficos de barras</label>' +
        '<label style="cursor:pointer"><input type="checkbox" id="g-rel-pag" checked> Status de pagamento</label>' +
        '<label style="cursor:pointer"><input type="checkbox" id="g-rel-det"> Detalhar lançamentos</label></div>' +
        '<p class="muted" style="font-size:12px;margin:8px 0 0">PDF abre pronto pra salvar · Word (.doc) baixa editável · <b>Excel completo</b> sai com 5 abas, fórmulas vivas e link de WhatsApp por favorecido.</p>';
      UI.modal("📄 Entregáveis da Folha", corpo, [
        { texto: "📄 PDF", classe: "primary", onClick: function () { self.fsRelGerar("pdf"); } },
        { texto: "📝 Word", classe: "primary", onClick: function () { self.fsRelGerar("word"); } },
        { texto: "📊 Excel completo", classe: "success", onClick: function () { self.fsRelGerar("excel"); } },
        { texto: "⬇ CSV", classe: "ghost", onClick: function () { self.fsCsv(); } },
        { texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } }
      ]);
      function desenhaSems() {
        var box = UI.el("g-rel-sems"); if (!box) return;
        var sems = FS.semanasDoMes((UI.el("g-rel-mes") || {}).value || self._fsSemana.slice(0, 7));
        box.innerHTML = sems.map(function (s) { return '<label style="cursor:pointer;border:1px solid var(--linha);border-radius:8px;padding:5px 10px"><input type="checkbox" class="g-rel-sem" value="' + s.chave + '" checked> <b>' + s.rotulo + "</b> <span class='muted' style='font-size:11px'>" + s.periodo + "</span></label>"; }).join("") || '<span class="muted">Mês sem semanas iniciadas nele.</span>';
      }
      var per = UI.el("g-rel-per"), mesI = UI.el("g-rel-mes");
      function alterna() {
        var v = per.value;
        UI.el("g-rel-int").style.display = v === "intervalo" ? "" : "none";
        mesI.parentElement.style.display = v === "mes" ? "" : "none";
        UI.el("g-rel-sems").style.display = v === "mes" ? "" : "none";
      }
      if (per) { per.onchange = alterna; mesI.onchange = desenhaSems; desenhaSems(); alterna(); }
    },
    _fsRelParams: function () {
      var FS = window.FolhaSemanal, v = function (id) { var e = UI.el(id); return e ? e.value : ""; };
      var p = { grp: v("g-rel-grp") || "fav", favKey: v("g-rel-fav"), obraId: v("g-rel-obra"), per: v("g-rel-per") || "semana", semanas: [], rot: "" };
      ["med", "tipo", "graf", "pag", "det"].forEach(function (k) { var e = UI.el("g-rel-" + k); p[k] = e ? !!e.checked : false; });
      if (p.per === "semana") { p.semanas = [this._fsSemana]; p.rot = "Semana " + FS.periodoDaChave(this._fsSemana); }
      else if (p.per === "mes") {
        var marc = []; (document.querySelectorAll(".g-rel-sem") || []).forEach(function (c) { if (c.checked) marc.push(c.value); });
        p.semanas = marc; var mes = v("g-rel-mes");
        p.rot = "Mês " + mes.split("-").reverse().join("/") + " · " + marc.length + " semana(s)";
      } else {
        var de = v("g-rel-de"), ate = v("g-rel-ate");
        if (!de || !ate) { UI.toast("Informe as datas De e Até.", "erro"); return null; }
        var s = FS.chaveSemana(new Date(de + "T12:00:00")), fim = FS.chaveSemana(new Date(ate + "T12:00:00")), guard = 0;
        while (s <= fim && guard++ < 120) { p.semanas.push(s); s = FS.semanaVizinha(s, 1); }
        if (s <= fim) UI.toast("⚠ Intervalo muito longo: limitei a 120 semanas (~2 anos e 4 meses). O relatório sai até " + FS.periodoDaChave(p.semanas[p.semanas.length - 1]) + ".", "erro");
        p.rot = "De " + de.split("-").reverse().join("/") + " até " + ate.split("-").reverse().join("/");
      }
      if (!p.semanas.length) { UI.toast("Escolha pelo menos uma semana.", "erro"); return null; }
      return p;
    },
    _fsFavKeyDe: function (l) { var FS = window.FolhaSemanal; var fav = (l.favorecido || l.nome || "—"); return String(fav).toUpperCase().replace(/\s+/g, " ").trim() + "|" + String(l.chavePix || "").trim(); },
    _fsRelDados: function (p) {
      var FS = window.FolhaSemanal, self = this;
      var todos = this._fsTodos().filter(function (l) {
        if (p.obraId && l.obraId !== p.obraId) return false;
        if (p.favKey && self._fsFavKeyDe(l) !== p.favKey) return false;
        return true;
      });
      var setSem = {}; p.semanas.forEach(function (s) { setSem[s] = 1; });
      var doPer = todos.filter(function (l) { return setSem[l.semana]; });
      var chaveDe = p.grp === "obra" ? function (l) { return l.obraId || "—"; } : function (l) { return self._fsFavKeyDe(l); };
      var nomeDe = p.grp === "obra" ? function (k) { return self._fsNomeObra(k); } : function (k) { return k.split("|")[0]; };
      var med = FS.medicao(todos, p.semanas, chaveDe);
      var pagos = {}; Store.listar(eid(), "fs_pagamentos").forEach(function (pg) { if (setSem[pg.semana] && pg.pago) pagos[pg.favKey] = (pagos[pg.favKey] || 0) + (pg.valor || 0); });
      var grupos = {};
      doPer.forEach(function (l) {
        var k = chaveDe(l);
        if (!grupos[k]) grupos[k] = { chave: k, nome: nomeDe(k), lancs: [], porSemana: {}, chavePix: l.chavePix || "" };
        grupos[k].lancs.push(l);
        grupos[k].porSemana[l.semana] = (grupos[k].porSemana[l.semana] || 0) + FS.totalFinal(l);
        if (!grupos[k].chavePix && l.chavePix) grupos[k].chavePix = l.chavePix;
      });
      return { todos: todos, doPer: doPer, grupos: grupos, med: med, pagos: pagos };
    },
    _fsBarra: function (val, max, cor) { // barra de gráfico via TABELA (imprime no PDF e abre no Word)
      var pct = max > 0 ? Math.max(2, Math.round(val / max * 100)) : 0;
      return '<table style="border-collapse:collapse;width:100%"><tr><td style="background:' + cor + ';width:' + pct + '%;font-size:4px">&nbsp;</td><td style="background:#e8edf3;font-size:4px">&nbsp;</td></tr></table>';
    },
    _fsRelHtml: function (p) {
      var FS = window.FolhaSemanal, self = this, d = this._fsRelDados(p);
      var chaves = Object.keys(d.grupos);
      if (!chaves.length) return null;
      chaves.sort(function (a, b) { return d.grupos[b].porSemana && d.grupos[a].porSemana ? 0 : 0; });
      var corpo = '<p style="margin:0 0 12px">Período: <b>' + Util.esc(p.rot) + "</b>" + (p.obraId ? " · Obra: <b>" + Util.esc(this._fsNomeObra(p.obraId)) + "</b>" : "") + "</p>";
      var kpi = function (rot, val, cor) { return '<td style="border:1px solid #ccc;padding:7px 10px;text-align:center"><div style="font-size:9px;color:#555;text-transform:uppercase">' + rot + '</div><b style="font-size:13px;color:' + (cor || "#0f2740") + '">' + Util.fmtMoeda(val) + "</b></td>"; };
      chaves.forEach(function (k, idx) {
        var g = d.grupos[k], m = d.med[k] || { anterior: 0, atual: 0, acumulado: 0 };
        var pagoV = p.grp === "fav" ? (d.pagos[k] || 0) : g.lancs.reduce(function (s, l) { var fk = self._fsFavKeyDe(l); return s; }, 0);
        corpo += '<div style="' + (idx ? "page-break-before:always;" : "") + 'padding-top:4px">' +
          '<h2 style="font-size:15px;margin:0 0 2px;border-left:5px solid #16a34a;padding-left:9px">' + Util.esc(g.nome) + "</h2>" +
          (p.grp === "fav" && g.chavePix ? '<div style="font-size:10px;color:#555;margin:0 0 8px;padding-left:14px">Chave PIX: ' + Util.esc(g.chavePix) + "</div>" : '<div style="height:8px"></div>');
        if (p.med) {
          corpo += '<table style="border-collapse:collapse;width:100%;margin:6px 0 12px"><tr>' + kpi("Anterior (acumulado até o período)", m.anterior) + kpi("Atual (este período)", m.atual, "#16a34a") + kpi("Acumulado total", m.acumulado) + (p.pag && p.grp === "fav" ? kpi("Pago no período", pagoV, "#2e6f9e") + kpi("Em aberto", Math.max(0, m.atual - pagoV), m.atual - pagoV > 0 ? "#dc2626" : "#16a34a") : "") + "</tr></table>";
        }
        // por semana
        corpo += '<h3 style="font-size:11.5px;margin:8px 0 4px">Valores por semana</h3><table style="border-collapse:collapse;width:100%;font-size:10.5px">';
        var maxSem = 0; p.semanas.forEach(function (s) { maxSem = Math.max(maxSem, g.porSemana[s] || 0); });
        p.semanas.forEach(function (s) {
          var v2 = g.porSemana[s] || 0;
          corpo += '<tr><td style="border:1px solid #ccc;padding:4px 8px;width:170px">Semana ' + FS.periodoDaChave(s) + '</td><td style="border:1px solid #ccc;padding:4px 8px;text-align:right;width:90px"><b>' + Util.fmtMoeda(v2) + "</b></td>" + (p.graf ? '<td style="border:1px solid #ccc;padding:3px 6px">' + self._fsBarra(v2, maxSem, "#16a34a") + "</td>" : "") + "</tr>";
        });
        corpo += "</table>";
        if (p.tipo) {
          var pt = FS.porTipo(g.lancs), tks = Object.keys(pt), maxT = 0;
          tks.forEach(function (t) { maxT = Math.max(maxT, pt[t]); });
          corpo += '<h3 style="font-size:11.5px;margin:10px 0 4px">Composição por tipo</h3><table style="border-collapse:collapse;width:100%;font-size:10.5px">';
          tks.sort(function (a, b) { return pt[b] - pt[a]; }).forEach(function (t) {
            corpo += '<tr><td style="border:1px solid #ccc;padding:4px 8px;width:170px">' + Util.esc(FS.ROT_TIPO[t] || t) + '</td><td style="border:1px solid #ccc;padding:4px 8px;text-align:right;width:90px"><b>' + Util.fmtMoeda(pt[t]) + "</b></td>" + (p.graf ? '<td style="border:1px solid #ccc;padding:3px 6px">' + self._fsBarra(pt[t], maxT, "#2e6f9e") + "</td>" : "") + "</tr>";
          });
          corpo += "</table>";
        }
        if (p.det) {
          corpo += '<h3 style="font-size:11.5px;margin:10px 0 4px">Lançamentos do período</h3><table style="border-collapse:collapse;width:100%;font-size:10px"><tr style="background:#f0f4f8"><th style="border:1px solid #ccc;padding:4px">Semana</th><th style="border:1px solid #ccc;padding:4px">Obra</th><th style="border:1px solid #ccc;padding:4px">Nome</th><th style="border:1px solid #ccc;padding:4px">Tipo</th><th style="border:1px solid #ccc;padding:4px;text-align:right">Total</th></tr>';
          g.lancs.forEach(function (l) { corpo += '<tr><td style="border:1px solid #ccc;padding:4px">' + FS.periodoDaChave(l.semana) + '</td><td style="border:1px solid #ccc;padding:4px">' + Util.esc(self._fsNomeObra(l.obraId)) + '</td><td style="border:1px solid #ccc;padding:4px">' + Util.esc(l.nome || "") + '</td><td style="border:1px solid #ccc;padding:4px">' + Util.esc(FS.ROT_TIPO[l.tipo] || l.tipo || "") + '</td><td style="border:1px solid #ccc;padding:4px;text-align:right">' + Util.fmtMoeda(FS.totalFinal(l)) + "</td></tr>"; });
          corpo += "</table>";
        }
        // assinaturas em TABELA (o Word não entende flex — tabela fica lado a lado nos dois)
        corpo += '<table style="width:100%;border-collapse:collapse;margin-top:30px"><tr><td style="width:46%;border-top:1px solid #333;text-align:center;padding-top:3px;font-size:9px">' + Util.esc(g.nome) + '</td><td style="width:8%"></td><td style="width:46%;border-top:1px solid #333;text-align:center;padding-top:3px;font-size:9px">Responsável</td></tr></table></div>';
      });
      return corpo;
    },
    fsRelGerar: function (fmt) {
      var p = this._fsRelParams(); if (!p) return;
      if (fmt === "excel") return this.fsExcelPro(p);
      var titulo = p.grp === "obra" ? "RELATÓRIO DE FOLHA POR OBRA" : "RELATÓRIO DE FOLHA POR FAVORECIDO";
      var corpo = this._fsRelHtml(p);
      if (!corpo) { UI.toast("Nenhum lançamento no período/filtro escolhido.", "erro"); return; }
      var html = this._docShell(titulo, "#16a34a", corpo, "fs_rel");
      if (fmt === "word") {
        var doc = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>Folha</title><!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]--></head><body>' + html + "</body></html>";
        var blob = new Blob(["﻿", doc], { type: "application/msword" });
        var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "folha-" + (p.grp === "obra" ? "obras" : "favorecidos") + ".doc"; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
        UI.toast("📝 Word (.doc) baixado — abre e edita normal.", "ok"); return;
      }
      App._abrirPrint(titulo, html);
    },
    fsExcelPro: function (p) {
      var FS = window.FolhaSemanal, self = this;
      if (typeof ExcelOrc === "undefined" || !ExcelOrc.ensureExcelJS) { UI.toast("Módulo Excel indisponível (precisa de internet na 1ª vez).", "erro"); return; }
      var d = this._fsRelDados(p);
      if (!d.doPer.length) { UI.toast("Nenhum lançamento no período/filtro.", "erro"); return; }
      UI.toast("Gerando o Excel completo…", "ok");
      ExcelOrc.ensureExcelJS(function () {
        var wb = new ExcelJS.Workbook(); wb.creator = "OrçaPRO IA";
        var NAVY = "FF0F2740", VERDE = "FF16A34A", MOEDA = '"R$" #,##0.00';
        function cab(ws, headers, widths) {
          ws.addRow(headers); var r = ws.getRow(1);
          r.eachCell(function (c) { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } }; c.font = { color: { argb: "FFFFFFFF" }, bold: true, size: 10 }; c.alignment = { vertical: "middle" }; });
          r.height = 20; widths.forEach(function (w, i) { ws.getColumn(i + 1).width = w; });
          ws.views = [{ state: "frozen", ySplit: 1 }];
        }
        var emp = (typeof Empresa !== "undefined" && Empresa.dados) ? Empresa.dados() : {};
        // --- Aba Lancamentos (base de tudo: fórmulas vivas) ---
        var wl = wb.addWorksheet("Lancamentos");
        cab(wl, ["Obra", "Nome", "Função", "Tipo", "Favorecido", "Chave PIX", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom", "H.Extra", "Total", "Semana"], [22, 22, 14, 12, 26, 20, 8, 8, 8, 8, 8, 8, 8, 9, 13, 14]);
        d.doPer.forEach(function (l, i) {
          var rn = i + 2, fav = String(l.favorecido || l.nome || "").replace(/\s+/g, " ").trim(); // igual ao listaPix → SUMIF casa
          var dias = FS.DIAS.map(function (dd) { return (l.faltas && l.faltas.indexOf(dd) !== -1) ? "x" : ((l.dias && l.dias[dd]) || null); });
          var row = [self._fsNomeObra(l.obraId), l.nome || "", l.funcao || "", FS.ROT_TIPO[l.tipo] || l.tipo || "", fav, l.chavePix || ""].concat(dias).concat([FS.num(l.he) || null,
            (l.tipo === "diaria" && !l.usarValor) ? { formula: "SUM(G" + rn + ":M" + rn + ")+IF(N" + rn + '="",0,N' + rn + ")" } : FS.totalFinal(l),
            FS.periodoDaChave(l.semana)]);
          wl.addRow(row);
        });
        for (var c2 = 7; c2 <= 15; c2++) wl.getColumn(c2).numFmt = MOEDA;
        // --- Aba Pagamentos (SUMIF vivo + link WhatsApp) ---
        var pix = FS.listaPix(d.doPer), pagos = self._fsPagos();
        var wp = wb.addWorksheet("Pagamentos");
        cab(wp, ["Favorecido", "Chave PIX", "Valor (fórmula)", "Status", "Avisar", "Assinado"], [28, 22, 16, 11, 22, 10]);
        pix.forEach(function (g, i) {
          var rn = i + 2, pg = pagos[g.favKey], fone = FS.foneDaChave(g.chavePix);
          var row = wp.addRow([g.favorecido, g.chavePix || "", { formula: 'SUMIFS(Lancamentos!O:O,Lancamentos!E:E,A' + rn + ",Lancamentos!F:F,B" + rn + ")" }, (pg && pg.pago) ? "PAGO" : "ABERTO", "", (pg && pg.assinatura) ? "SIM" : "—"]);
          if (fone) { var cel = row.getCell(5); cel.value = { text: "💬 WhatsApp", hyperlink: "https://wa.me/" + fone + "?text=" + encodeURIComponent("Olá, " + g.favorecido + "! Seu pagamento (" + p.rot + ") foi enviado via PIX.") }; cel.font = { color: { argb: "FF2E6F9E" }, underline: true }; }
          if (pg && pg.pago) row.getCell(4).font = { color: { argb: VERDE }, bold: true };
        });
        wp.getColumn(3).numFmt = MOEDA;
        // --- Aba PorObra (SUMIFS por tipo) ---
        var wo = wb.addWorksheet("PorObra");
        var tipos = Object.keys(FS.ROT_TIPO);
        cab(wo, ["Obra"].concat(tipos.map(function (t) { return FS.ROT_TIPO[t]; })).concat(["Total"]), [24].concat(tipos.map(function () { return 16; })).concat([15]));
        var obrasSet = {}; d.doPer.forEach(function (l) { obrasSet[self._fsNomeObra(l.obraId)] = 1; });
        Object.keys(obrasSet).forEach(function (nomeOb, i) {
          var rn = i + 2;
          wo.addRow([nomeOb].concat(tipos.map(function (t) { return { formula: 'SUMIFS(Lancamentos!$O:$O,Lancamentos!$A:$A,$A' + rn + ',Lancamentos!$D:$D,"' + (FS.ROT_TIPO[t] || t).replace(/"/g, "") + '")' }; })).concat([{ formula: "SUM(B" + rn + ":" + String.fromCharCode(66 + tipos.length - 1) + rn + ")" }]));
        });
        for (var c3 = 2; c3 <= tipos.length + 2; c3++) wo.getColumn(c3).numFmt = MOEDA;
        // --- Aba Resumo (KPIs com fórmula) ---
        var wr = wb.addWorksheet("Resumo", { views: [{}] });
        wr.getColumn(1).width = 34; wr.getColumn(2).width = 20;
        wr.addRow(["FOLHA SEMANAL — RESUMO"]).getCell(1).font = { bold: true, size: 14, color: { argb: NAVY } };
        wr.addRow(["Empresa", emp.nome || ""]); wr.addRow(["Período", p.rot]); wr.addRow([]);
        [["Total do período", "SUM(Lancamentos!O:O)"], ["Pago", 'SUMIF(Pagamentos!D:D,"PAGO",Pagamentos!C:C)'], ["Em aberto", "B5-B6"]].forEach(function (par) {
          var r3 = wr.addRow([par[0], { formula: par[1] }]); r3.getCell(1).font = { bold: true }; r3.getCell(2).numFmt = MOEDA;
        });
        wr.addRow([]); wr.addRow(["Por tipo"]).getCell(1).font = { bold: true };
        tipos.forEach(function (t) { var r4 = wr.addRow([FS.ROT_TIPO[t], { formula: 'SUMIF(Lancamentos!D:D,"' + (FS.ROT_TIPO[t] || t).replace(/"/g, "") + '",Lancamentos!O:O)' }]); r4.getCell(2).numFmt = MOEDA; });
        // --- Aba Parametros ---
        var wpar = wb.addWorksheet("Parametros");
        wpar.getColumn(1).width = 26; wpar.getColumn(2).width = 46;
        [["Gerado por", "OrçaPRO IA — Folha Semanal"], ["Empresa", emp.nome || ""], ["Período", p.rot], ["Semanas", p.semanas.join(", ")], ["Escopo obra", p.obraId ? self._fsNomeObra(p.obraId) : "Todas"], ["Escopo favorecido", p.favKey ? p.favKey.split("|")[0] : "Todos"], ["Observação", "Os valores em Pagamentos/PorObra/Resumo são FÓRMULAS: edite a aba Lancamentos e tudo recalcula."]].forEach(function (par) { var r5 = wpar.addRow(par); r5.getCell(1).font = { bold: true }; });
        wb.xlsx.writeBuffer().then(function (buf) {
          var blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
          var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "folha-completa-" + (p.semanas[0] || "periodo") + ".xlsx"; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
          UI.toast("📊 Excel completo baixado: 5 abas, fórmulas vivas e links de WhatsApp.", "ok");
        }).catch(function (e) { UI.toast("Falha ao gerar o Excel: " + ((e && e.message) || e), "erro"); });
      });
    },
    fsForm: function (id) {
      var FS = window.FolhaSemanal, self = this;
      var l = id ? Store.obter(eid(), "fs_lancamentos", id) : null; l = l || {};
      var obras = lista("obras"), cols = lista("colaboradores");
      var diasIn = FS.DIAS.map(function (d) { var v = l.faltas && l.faltas.indexOf(d) !== -1 ? "x" : (l.dias && l.dias[d]) || ""; return campo(FS.ROT[d].slice(0, 3), inp("g-fs-" + d, v, "R$ ou x")); }).join("");
      var corpo = '<div class="row">' + campo("Obra *", sel("g-fs-obra", optsRec(obras, "nome", l.obraId, "— escolha —"))) +
        campo("Colaborador", sel("g-fs-colab", optsRec(cols, "nome", l.colaboradorId, "— avulso / manual —"))) +
        campo("Tipo", sel("g-fs-tipo", opts([["diaria", "Diária (dia a dia)"], ["empreita", "Empreita"], ["frete", "Frete"], ["reembolso", "Reembolso"], ["fornecedor", "Fornecedor"], ["outro", "Outro"]], l.tipo || "diaria"))) + "</div>" +
        '<div class="row">' + campo("Nome no lançamento *", inp("g-fs-nome", l.nome, "Ex.: Rosivaldo Pedreiro")) + campo("Favorecido (quem recebe)", inp("g-fs-fav", l.favorecido)) + campo("Chave PIX", inp("g-fs-pix", l.chavePix)) + "</div>" +
        '<div class="row">' + diasIn + "</div>" +
        '<div class="row">' + campo("Hora extra (R$)", inp("g-fs-he", l.he)) + campo("Valor fechado (empreita/frete…)", inp("g-fs-valor", l.valor)) + campo("Observação", inp("g-fs-obs", l.obs)) + "</div>" +
        '<p class="muted" style="font-size:12px;margin:4px 0 0">Nos dias: digite o valor da diária (ex.: <b>166</b>) ou <b>x</b> pra falta. Escolhendo um colaborador, favorecido e PIX vêm do cadastro.</p>';
      this._modalForm("fs_lancamentos", l, "Lançamento da folha", corpo, function (obj) {
        obj.obraId = v("g-fs-obra"); if (!obj.obraId) { UI.toast("Escolha a obra.", "erro"); return false; }
        obj.colaboradorId = v("g-fs-colab");
        var col = obj.colaboradorId ? Store.obter(eid(), "colaboradores", obj.colaboradorId) : null;
        obj.nome = v("g-fs-nome") || (col ? col.nome : ""); if (!obj.nome) { UI.toast("Informe o nome.", "erro"); return false; }
        obj.tipo = v("g-fs-tipo");
        obj.favorecido = v("g-fs-fav") || (col ? col.favorecido || "" : "");
        obj.chavePix = v("g-fs-pix") || (col ? col.chavePix || "" : "");
        obj.funcao = obj.funcao || (col ? col.funcao || "" : "");
        obj.semana = self._fsSemana || FS.chaveSemana(new Date());
        obj.dias = {}; obj.faltas = [];
        FS.DIAS.forEach(function (d) { var x = v("g-fs-" + d); if (FS.ehFalta(x)) obj.faltas.push(d); else { var n = FS.num(x); if (n > 0) obj.dias[d] = n; } });
        obj.he = FS.num(v("g-fs-he")); obj.valor = FS.num(v("g-fs-valor")); obj.obs = v("g-fs-obs");
        obj.usarValor = false;
        if (obj.tipo === "diaria" && !Object.keys(obj.dias).length && obj.valor > 0) obj.usarValor = true;
        return true;
      });
      // escolheu o colaborador → puxa nome/favorecido/PIX e preenche a DIÁRIA PADRÃO do cadastro
      var selC = UI.el("g-fs-colab");
      if (selC) selC.onchange = function () {
        var c = Store.obter(eid(), "colaboradores", this.value); if (!c) return;
        var el;
        if ((el = UI.el("g-fs-nome")) && !el.value) el.value = c.nome || "";
        if ((el = UI.el("g-fs-fav")) && !el.value) el.value = c.favorecido || "";
        if ((el = UI.el("g-fs-pix")) && !el.value) el.value = c.chavePix || "";
        var diaria = (c.unidadeRem === "diaria") ? FS.num(c.remuneracao) : 0;
        if (diaria > 0) FS.DIAS.forEach(function (d) { var i = UI.el("g-fs-" + d); if (i && !i.value && d !== "dom") i.value = String(diaria); });
      };
    },
    fsExcluir: function (id) { if (!confirm("Excluir este lançamento da folha?")) return; Store.excluir(eid(), "fs_lancamentos", id); App.render(); UI.toast("Lançamento excluído.", "ok"); },
    fsImportar: function () {
      UI.modal("📥 Importar planilha semanal", '<p class="muted">Selecione o Excel da sua folha semanal — <b>uma obra por aba</b>, operário com FAVORECIDO e CHAVE PIX, valores por dia (x = falta), empreitas/fretes e fechamento. O sistema <b>cadastra as obras e os colaboradores que faltarem</b> e lança a semana inteira. Nada é inventado: total divergente vem com aviso.</p><div class="field"><input type="file" id="fs-file" accept=".xlsx,.xls,.csv"></div>', [{ texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } }]);
    },
    fsImportarArquivo: function (file) {
      var self = this, FS = window.FolhaSemanal;
      UI.toast("Lendo a planilha…", "ok");
      App._lerPlanilha(file, function (matriz, erro, meta) {
        if (erro || (!matriz && !(meta && meta.abas))) { UI.toast("Falha ao ler a planilha: " + (erro || "vazia"), "erro"); return; }
        var abas = (meta && meta.abas && meta.abas.length) ? meta.abas : [{ nome: file.name.replace(/\.[^.]+$/, ""), dados: matriz || [] }];
        var r = FS.parsePlanilha(abas);
        if (!r.lancamentos.length) { UI.toast("Não reconheci lançamentos nessa planilha (o formato esperado tem OPERÁRIO + dias da semana).", "erro"); return; }
        var obras = lista("obras"), porNome = {}; obras.forEach(function (o) { porNome[Util.normalizar ? Util.normalizar(o.nome) : o.nome.toUpperCase()] = o.id; });
        var chaveN = function (s) { return Util.normalizar ? Util.normalizar(s || "") : String(s || "").toUpperCase(); };
        var novasObras = 0;
        r.obras.forEach(function (n) { if (!porNome[chaveN(n)]) { var o = { nome: n, status: "andamento" }; Store.salvar(eid(), "obras", o); porNome[chaveN(n)] = o.id; novasObras++; } });
        var cols = lista("colaboradores"), porNomeC = {}; cols.forEach(function (c) { porNomeC[chaveN(c.nome)] = c.id; });
        var novosC = 0;
        r.lancamentos.forEach(function (l) {
          if (l.tipo !== "diaria" || !l.nome) return;
          if (!porNomeC[chaveN(l.nome)]) {
            var diaria = 0; FS.DIAS.forEach(function (d) { var n = FS.num(l.dias && l.dias[d]); if (n > diaria) diaria = n; });
            var c = { nome: l.nome, funcao: l.funcao || "", tipoContrato: "diarista", favorecido: l.favorecido || "", chavePix: l.chavePix || "", status: "ativo", remuneracao: diaria || "", unidadeRem: diaria ? "diaria" : "mensal" };
            Store.salvar(eid(), "colaboradores", c); porNomeC[chaveN(l.nome)] = c.id; novosC++;
          }
        });
        var ckDe = function (l) { return l.semana + "|" + l.obraId + "|" + chaveN(l.nome) + "|" + (l.tipo || "") + "|" + Math.round(FS.totalFinal(l) * 100); };
        var atuais = self._fsTodos(), jaTem = {}; atuais.forEach(function (l) { jaTem[ckDe(l)] = 1; });
        var novos = 0, semana = null;
        r.lancamentos.forEach(function (l) {
          l.obraId = porNome[chaveN(l.obra)] || ""; delete l.obra;
          l.colaboradorId = porNomeC[chaveN(l.nome)] || "";
          semana = semana || l.semana;
          var ck = ckDe(l);
          if (jaTem[ck]) return; jaTem[ck] = 1;
          Store.salvar(eid(), "fs_lancamentos", l); novos++;
        });
        if (semana) self._fsSemana = semana;
        self._fsObra = "";
        UI.fecharModal(); if (typeof App !== "undefined") { App.view = "folhasemanal"; App.render(); }
        UI.toast("✅ " + novos + " lançamentos · " + novasObras + " obras novas · " + novosC + " colaboradores novos" + (r.avisos.length ? " · ⚠ " + r.avisos.length + " total(is) divergente(s) — mantive o da planilha" : ""), "ok");
      });
    },
    fsPrint: function (qual) {
      var FS = window.FolhaSemanal, self = this, lancs = this._fsLancs();
      if (!lancs.length) { UI.toast("Sem lançamentos nesta semana.", "erro"); return; }
      var periodo = FS.periodoDaChave(this._fsSemana), corpo = "";
      if (qual === "pix") {
        var pix = FS.listaPix(lancs), tot = 0;
        corpo = '<p style="margin:0 0 10px">Semana <b>' + periodo + "</b> · pagamentos agrupados por favorecido</p><table style=\"width:100%;border-collapse:collapse;font-size:11px\"><tr style=\"background:#f0f4f8\"><th style=\"text-align:left;padding:6px;border:1px solid #ccc\">Favorecido</th><th style=\"text-align:left;padding:6px;border:1px solid #ccc\">Chave PIX</th><th style=\"text-align:left;padding:6px;border:1px solid #ccc\">Referente a</th><th style=\"text-align:right;padding:6px;border:1px solid #ccc\">Valor</th><th style=\"padding:6px;border:1px solid #ccc\">Pago ✓</th></tr>";
        pix.forEach(function (p) {
          tot += p.total;
          var ref = p.itens.map(function (i) { return (i.nome || "") + " (" + self._fsNomeObra(i.obraId) + ")"; }).join(", ");
          corpo += '<tr><td style="padding:6px;border:1px solid #ccc"><b>' + Util.esc(p.favorecido) + '</b></td><td style="padding:6px;border:1px solid #ccc">' + Util.esc(p.chavePix || "—") + '</td><td style="padding:6px;border:1px solid #ccc">' + Util.esc(ref) + '</td><td style="padding:6px;border:1px solid #ccc;text-align:right"><b>' + Util.fmtMoeda(p.total) + '</b></td><td style="padding:6px;border:1px solid #ccc;text-align:center">☐</td></tr>';
        });
        corpo += '<tr style="background:#0f2740;color:#fff"><td colspan="3" style="padding:7px;border:1px solid #0f2740"><b>TOTAL DA SEMANA</b></td><td style="padding:7px;border:1px solid #0f2740;text-align:right"><b>' + Util.fmtMoeda(tot) + '</b></td><td style="border:1px solid #0f2740"></td></tr></table>';
        App._abrirPrint("Lista de Pagamento PIX — " + periodo, this._docShell("LISTA DE PAGAMENTO — PIX", "#16a34a", corpo, "fs_pix"));
        return;
      }
      var fech = FS.fechamento(lancs);
      corpo = '<p style="margin:0 0 10px">Período: <b>' + periodo + "</b></p>";
      Object.keys(fech.porObra).forEach(function (ob) {
        var g = fech.porObra[ob];
        corpo += '<h3 style="margin:14px 0 6px;font-size:13px;border-left:4px solid #16a34a;padding-left:8px">' + Util.esc(self._fsNomeObra(ob)) + "</h3>" +
          '<table style="width:100%;border-collapse:collapse;font-size:10.5px"><tr style="background:#f0f4f8"><th style="text-align:left;padding:5px;border:1px solid #ccc">Operário</th><th style="padding:5px;border:1px solid #ccc">Seg</th><th style="padding:5px;border:1px solid #ccc">Ter</th><th style="padding:5px;border:1px solid #ccc">Qua</th><th style="padding:5px;border:1px solid #ccc">Qui</th><th style="padding:5px;border:1px solid #ccc">Sex</th><th style="padding:5px;border:1px solid #ccc">Sáb</th><th style="padding:5px;border:1px solid #ccc">Dom</th><th style="padding:5px;border:1px solid #ccc">H.E.</th><th style="padding:5px;border:1px solid #ccc;text-align:right">Total</th></tr>';
        g.linhas.forEach(function (l) {
          var cels = FS.DIAS.map(function (d) {
            if (l.tipo !== "diaria" && !l.usarValor) return '<td style="padding:5px;border:1px solid #ccc;text-align:center">—</td>';
            if (l.faltas && l.faltas.indexOf(d) !== -1) return '<td style="padding:5px;border:1px solid #ccc;text-align:center;color:#dc2626">✕</td>';
            var vv = l.dias && l.dias[d];
            return '<td style="padding:5px;border:1px solid #ccc;text-align:center">' + (vv ? Util.fmtNum(vv, 0) : "") + "</td>";
          }).join("");
          corpo += '<tr><td style="padding:5px;border:1px solid #ccc"><b>' + Util.esc(l.nome) + "</b>" + (l.funcao ? " · " + Util.esc(l.funcao) : "") + (l.tipo !== "diaria" ? " · " + Util.esc(l.tipo).toUpperCase() : "") +
            (l.favorecido ? '<br><span style="font-size:9px;color:#555">Favorecido: ' + Util.esc(l.favorecido) + (l.chavePix ? " · PIX: " + Util.esc(l.chavePix) : "") + "</span>" : "") + "</td>" + cels +
            '<td style="padding:5px;border:1px solid #ccc;text-align:center">' + (FS.num(l.he) ? Util.fmtNum(l.he, 0) : "") + '</td><td style="padding:5px;border:1px solid #ccc;text-align:right"><b>' + Util.fmtMoeda(FS.totalFinal(l)) + "</b></td></tr>";
        });
        corpo += '<tr style="background:#0f2740;color:#fff"><td colspan="9" style="padding:6px;border:1px solid #0f2740"><b>FECHAMENTO DE FOLHA — ' + Util.esc(self._fsNomeObra(ob)) + '</b></td><td style="padding:6px;border:1px solid #0f2740;text-align:right"><b>' + Util.fmtMoeda(g.total) + "</b></td></tr></table>";
      });
      corpo += '<p style="margin:14px 0 4px;text-align:right;font-size:13px">TOTAL GERAL DA SEMANA: <b style="color:#16a34a">' + Util.fmtMoeda(fech.total) + "</b></p>" +
        '<div style="display:flex;gap:40px;margin-top:44px"><div style="flex:1;border-top:1px solid #333;text-align:center;padding-top:4px;font-size:10px">Responsável pela obra</div><div style="flex:1;border-top:1px solid #333;text-align:center;padding-top:4px;font-size:10px">Financeiro</div></div>';
      App._abrirPrint("Fechamento de Folha Semanal — " + periodo, this._docShell("FECHAMENTO DE FOLHA SEMANAL", "#16a34a", corpo, "fs_fechamento"));
    },
    fsFinanceiro: function () {
      var FS = window.FolhaSemanal, self = this, lancs = this._fsLancs();
      if (!lancs.length) { UI.toast("Sem lançamentos nesta semana.", "erro"); return; }
      var fech = FS.fechamento(lancs), periodo = FS.periodoDaChave(this._fsSemana);
      if (!confirm("Lançar a folha desta semana (" + periodo + ") como despesa de Mão de obra no Financeiro, uma por obra? Se já existir o lançamento da semana, ele é atualizado (não duplica).")) return;
      var fin = lista("financeiro"), n = 0;
      Object.keys(fech.porObra).forEach(function (ob) {
        if (!ob || ob === "—") return;
        var marca = "[Folha semanal " + self._fsSemana + "]";
        var desc = marca + " Diaristas — " + periodo;
        var exist = null; fin.forEach(function (f) { if (f.obraId === ob && (f.desc || "").indexOf(marca) === 0) exist = f; });
        var obj = exist || { tipo: "despesa", categoria: "mao_obra", obraId: ob, status: "pago", data: self._fsSemana };
        obj.desc = desc; obj.valor = fech.porObra[ob].total;
        Store.salvar(eid(), "financeiro", obj); n++;
      });
      UI.toast("💸 " + n + " despesa(s) de mão de obra lançada(s) no Financeiro — custo real na obra certa.", "ok");
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

    // ---------- G3: workflow de aprovação (papel de aprovador + auditoria + rejeição) ----------
    _quemAprova: function () { return (typeof Auth !== "undefined" && Auth.nome) ? Auth.nome() : ""; },
    _podeAprovarGuard: function () {
      if (typeof Auth !== "undefined" && Auth.podeAprovar && !Auth.podeAprovar()) {
        UI.toast("Você não tem permissão para aprovar/rejeitar. Peça a um aprovador da equipe.", "erro");
        return false;
      }
      return true;
    },
    // Aprova um registro: grava status + trilha aprovadoPor/aprovadoEm.
    _aprovar: function (entidade, id, statusOk, msg) {
      if (!this._podeAprovarGuard()) return;
      var reg = Store.obter(eid(), entidade, id); if (!reg) return;
      reg.status = statusOk;
      reg.aprovadoPor = this._quemAprova();
      reg.aprovadoEm = new Date().toISOString().slice(0, 10);
      reg.motivoRejeicao = ""; reg.rejeitadoPor = ""; reg.rejeitadoEm = ""; // limpa rejeição anterior (reaprovação)
      Store.salvar(eid(), entidade, reg);
      App.render(); UI.toast(msg || "Aprovado.", "ok");
    },
    // Rejeita com motivo obrigatório + trilha rejeitadoPor/rejeitadoEm.
    _rejeitar: function (entidade, id, statusRej) {
      if (!this._podeAprovarGuard()) return;
      var reg = Store.obter(eid(), entidade, id); if (!reg) return;
      var motivo = window.prompt("Motivo da rejeição (obrigatório):", "");
      if (motivo == null) return;
      motivo = String(motivo).trim();
      if (!motivo) { UI.toast("Informe o motivo da rejeição.", "erro"); return; }
      reg.status = statusRej;
      reg.rejeitadoPor = this._quemAprova();
      reg.rejeitadoEm = new Date().toISOString().slice(0, 10);
      reg.motivoRejeicao = motivo;
      Store.salvar(eid(), entidade, reg);
      App.render(); UI.toast("Registro rejeitado.", "ok");
    },
    _APROV_OK: { aprovada: 1, aprovado: 1 },
    _APROV_REJ: { rejeitada: 1, rejeitado: 1 },
    // Estados terminais pós-aprovação: avançar PELO FORM direto p/ eles também exige aprovador,
    // senão um sub-usuário sem a flag pula a fila (pendente -> paga/recebido/comprada) sem aprovação.
    _APROV_TERM: { paga: 1, recebido: 1, comprada: 1 },
    // G3 (fix): quando o STATUS é mudado PELO FORMULÁRIO de detalhe para aprovar/rejeitar/dar baixa,
    // aplica o MESMO gate + auditoria dos botões. Retorna false p/ ABORTAR o save.
    _gateStatusForm: function (obj, statusAntigo) {
      var novo = obj.status;
      if (novo === statusAntigo) return true;                 // status não mudou → nada a validar
      var ehOk = this._APROV_OK[novo], ehRej = this._APROV_REJ[novo], ehTerm = this._APROV_TERM[novo];
      if (!ehOk && !ehRej && !ehTerm) return true;            // não é estado controlado por aprovação
      if (typeof Auth !== "undefined" && Auth.podeAprovar && !Auth.podeAprovar()) {
        UI.toast("Você não tem permissão para aprovar, rejeitar ou dar baixa. Peça a um aprovador da equipe.", "erro");
        return false;
      }
      if (ehOk) {
        obj.aprovadoPor = this._quemAprova(); obj.aprovadoEm = this._hojeISO();
        obj.motivoRejeicao = ""; obj.rejeitadoPor = ""; obj.rejeitadoEm = ""; // reaprovar limpa rejeição
      } else if (ehRej) {
        var motivo = window.prompt("Motivo da rejeição (obrigatório):", obj.motivoRejeicao || "");
        if (motivo == null) return false;
        motivo = String(motivo).trim();
        if (!motivo) { UI.toast("Informe o motivo da rejeição.", "erro"); return false; }
        obj.rejeitadoPor = this._quemAprova(); obj.rejeitadoEm = this._hojeISO(); obj.motivoRejeicao = motivo;
        obj.aprovadoPor = ""; obj.aprovadoEm = "";
      }
      // ehTerm (paga/recebido/comprada): passou o gate de permissão; sem carimbo extra (é baixa, não aprovação)
      return true;
    },
    // Fila do que aguarda aprovação (para o card no Painel).
    _pendentesAprovacao: function () {
      var med = lista("medicoes").filter(function (m) { return m.status === "pendente"; });
      var com = lista("compras").filter(function (c) { return c.status === "cotacao"; });
      var req = lista("requisicoes").filter(function (r) { return r.status === "aberta" || r.status === "cotando"; });
      return { medicoes: med.length, compras: com.length, requisicoes: req.length, total: med.length + com.length + req.length };
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

    // ================= LAST PLANNER (PPC) — planejamento enxuto (Lean Construction) =================
    _lpTarefas: function () { var o = this._lpObra; return Store.listar(eid(), "lp_tarefas").filter(function (t) { return !o || t.obraId === o; }); },
    _lpObter: function (id) { return Store.obter(eid(), "lp_tarefas", id); },
    _lpSalvar: function (t, msg) { Store.salvar(eid(), "lp_tarefas", t); App.render(); if (msg) UI.toast(msg, "ok"); },
    _lpKpi: function (t, val, sub, cor) { return '<div class="card" style="padding:12px 14px"><div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.4px">' + t + '</div><div style="font-size:26px;font-weight:800;color:' + cor + ';line-height:1.1;margin:2px 0">' + val + '</div><div class="muted" style="font-size:11.5px">' + sub + '</div></div>'; },
    renderLastPlanner: function () {
      var self = this, LP = window.LastPlanner, obras = lista("obras");
      if (typeof LP === "undefined") return this._head("Last Planner · PPC", "", "") + vazioBox("Módulo Last Planner não carregado.", "", "");
      if (this._lpObra == null) this._lpObra = obras.length ? obras[0].id : "";
      var look = LP.semanas(new Date(), 6);
      var hb = new Date(); hb.setDate(hb.getDate() - 35);
      var hist = LP.semanas(hb, 6);
      var ts = this._lpTarefas();
      var res = LP.resumo(ts, look);
      var selObra = '<select data-gacao="lp-obra" style="max-width:230px">' + (obras.length ? "" : '<option value="">— sem obra —</option>') + obras.map(function (o) { return '<option value="' + Util.esc(o.id) + '"' + (o.id === self._lpObra ? " selected" : "") + ">" + Util.esc(o.nome) + "</option>"; }).join("") + "</select>";
      var extra = selObra + ' <button class="btn sm" data-gacao="lp-imprimir" data-val="semana">🖨 Plano semanal</button> <button class="btn sm" data-gacao="lp-imprimir" data-val="ppc">📊 Relatório PPC</button>';
      var html = this._head(svg("lastplanner") + "Last Planner · PPC", "lp-nova", "Nova Tarefa", extra);
      if (!obras.length) return html + vazioBox("Cadastre uma obra primeiro — o Last Planner planeja a semana de uma obra.", "nova-obra", "Nova obra");

      // KPIs
      var ppcSem = res.ppcSemana == null ? "—" : Math.round(res.ppcSemana * 100) + "%";
      var ppcMed = res.ppcMedio == null ? "—" : Math.round(res.ppcMedio * 100) + "%";
      var corPpc = res.ppcSemana == null ? "var(--aco)" : (res.ppcSemana >= .8 ? "var(--verde)" : (res.ppcSemana < .5 ? "#dc2626" : "#ea580c"));
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:16px">' +
        this._lpKpi("PPC da semana", ppcSem, res.feitas + "/" + res.comprometidas + " tarefas", corPpc) +
        this._lpKpi("PPC médio (6 sem)", ppcMed, "meta ≥ 80%", "var(--texto)") +
        this._lpKpi("Restrições abertas", String(res.restricoesAbertas), "a remover no médio prazo", res.restricoesAbertas ? "#ea580c" : "var(--verde)") +
        this._lpKpi("No lookahead", String(res.naLista), res.comprometiveis + " prontas p/ comprometer", "var(--texto)") + '</div>';

      // Plano da Semana
      var estaSem = look[0];
      var comp = LP.daSemana(ts, estaSem.chave).filter(function (t) { return t.comprometida; });
      html += '<div class="card" style="margin-bottom:16px"><h3 style="margin:0 0 8px">🗓 Plano da Semana <span class="muted" style="font-weight:400;font-size:13px">· ' + estaSem.periodo + '</span></h3>';
      if (!comp.length) html += '<p class="muted" style="font-size:13px;margin:0">Nenhuma tarefa comprometida nesta semana. Comprometa tarefas <b>livres</b> (sem restrição) no lookahead abaixo.</p>';
      else {
        html += '<table class="tbl"><thead><tr><th>Tarefa</th><th>Responsável</th><th>Status</th><th></th></tr></thead><tbody>';
        comp.forEach(function (t) {
          var st = t.status === "feito" ? '<span class="g-pill" style="background:#16a34a22;color:#16a34a">✓ Feito</span>' : (t.status === "naofeito" ? '<span class="g-pill" style="background:#dc262622;color:#dc2626">✗ Não feito' + (t.causa ? " · " + Util.esc(t.causa) : "") + '</span>' : '<span class="g-pill" style="background:#64748b22;color:#64748b">a fazer</span>');
          var ac = '<button class="btn sm success" data-gacao="lp-feito" data-id="' + t.id + '" title="Concluída">✓</button> <button class="btn sm" data-gacao="lp-naofeito" data-id="' + t.id + '" title="Não cumprida">✗</button> <button class="btn sm" data-gacao="lp-descomprometer" data-id="' + t.id + '" title="Tirar do plano">↩</button>';
          html += '<tr><td><b>' + Util.esc(t.titulo) + '</b></td><td>' + Util.esc(t.responsavel || "—") + '</td><td>' + st + '</td><td class="num">' + ac + '</td></tr>';
        });
        html += '</tbody></table>';
      }
      html += '</div>';

      // Lookahead 6 semanas
      html += '<div class="card" style="margin-bottom:16px"><h3 style="margin:0 0 4px">📋 Lookahead 6 semanas</h3><p class="muted" style="font-size:12.5px;margin:0 0 10px">Médio prazo — clique numa tarefa pra <b>gerir restrições</b>. Só tarefa livre (sem restrição aberta) vira comprometida.</p><div style="display:grid;grid-template-columns:repeat(6,minmax(150px,1fr));gap:8px;overflow-x:auto">';
      look.forEach(function (s, i) {
        html += '<div style="background:#f7fafd;border:1px solid var(--linha);border-radius:10px;padding:8px"><div style="text-align:center;font-size:12px;font-weight:700;color:var(--navy)">' + s.rotulo + '</div><div style="text-align:center;font-size:11px;color:#64748b;margin-bottom:6px">' + s.periodo + '</div>';
        LP.daSemana(ts, s.chave).forEach(function (t) {
          var ra = LP.restricoesAbertas(t);
          var bg = t.comprometida ? "#dbeafe" : (ra ? "#fff7ed" : "#dcfce7"), bd = t.comprometida ? "#93c5fd" : (ra ? "#fdba74" : "#86efac");
          var tag = t.comprometida ? "✓ no plano" : (ra ? "🔒 " + ra + " restr." : "✔ livre");
          html += '<div data-gacao="lp-abrir" data-id="' + t.id + '" style="cursor:pointer;background:' + bg + ';border:1px solid ' + bd + ';border-radius:7px;padding:6px 8px;margin-bottom:5px;font-size:12px"><b>' + Util.esc(t.titulo) + '</b><div style="font-size:10.5px;color:#475569;margin-top:2px">' + Util.esc(t.responsavel || "—") + ' · ' + tag + '</div></div>';
        });
        html += '<button class="btn sm" data-gacao="lp-nova-sem" data-val="' + i + '" style="width:100%;font-size:11.5px">+ Tarefa</button></div>';
      });
      html += '</div></div>';

      // Gráfico PPC + Causas
      html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start">';
      var h = LP.historicoPPC(ts, hist);
      html += '<div class="card"><h3 style="margin:0 0 10px">📈 PPC — últimas 6 semanas</h3><div style="display:flex;align-items:flex-end;gap:8px;height:130px">';
      h.forEach(function (x) {
        var pct = x.ppc == null ? 0 : Math.round(x.ppc * 100), cor = x.ppc == null ? "#e2e8f0" : (x.ppc >= .8 ? "#16a34a" : (x.ppc >= .5 ? "#f59e0b" : "#dc2626"));
        html += '<div style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;text-align:center;height:100%"><div style="font-size:10.5px;font-weight:700;color:#475569;margin-bottom:3px">' + (x.ppc == null ? "—" : pct + "%") + '</div><div style="background:' + cor + ';height:' + Math.max(2, pct) + '%;border-radius:4px 4px 0 0;min-height:2px"></div><div style="font-size:9.5px;color:#94a3b8;margin-top:4px">' + x.periodo.split("–")[0] + '</div></div>';
      });
      html += '</div></div>';
      var ca = LP.causasAgregadas(ts);
      html += '<div class="card"><h3 style="margin:0 0 10px">⚠ Causas de não-cumprimento</h3>';
      if (!ca.total) html += '<p class="muted" style="font-size:13px;margin:0">Sem causas registradas ainda.</p>';
      else {
        html += '<table class="tbl" style="font-size:13px"><tbody>';
        ca.linhas.forEach(function (l) { var pct = Math.round(l.pct * 100); html += '<tr><td>' + Util.esc(l.causa) + '</td><td style="width:42%"><div style="background:#eef2f7;border-radius:99px;height:14px;overflow:hidden"><div style="background:#ea580c;height:100%;width:' + pct + '%"></div></div></td><td class="num" style="width:64px"><b>' + l.n + '</b> · ' + pct + '%</td></tr>'; });
        html += '</tbody></table>';
      }
      html += '</div></div>';
      return html;
    },
    lpTrocaObra: function (id) { this._lpObra = id; App.render(); },
    lpNova: function (semIdx) {
      var self = this, LP = window.LastPlanner, obras = lista("obras");
      if (!this._lpObra && obras.length) this._lpObra = obras[0].id;
      if (!this._lpObra) { UI.toast("Cadastre uma obra primeiro.", "erro"); return; }
      var look = LP.semanas(new Date(), 6);
      var semOpts = look.map(function (s, i) { return '<option value="' + s.chave + '"' + (i === (semIdx || 0) ? " selected" : "") + ">" + s.rotulo + " (" + s.periodo + ")</option>"; }).join("");
      var corpo = campo("Tarefa *", inp("g-lp-titulo", "", "Ex.: Concretar laje do 2º pavimento")) +
        '<div class="row">' + campo("Responsável", inp("g-lp-resp", "", "Ex.: Equipe estrutura")) + campo("Frente / local", inp("g-lp-frente", "", "Ex.: Bloco A")) + '</div>' +
        campo("Semana (lookahead)", sel("g-lp-sem", semOpts));
      this._modalForm("lp_tarefas", {}, "Nova tarefa (Last Planner)", corpo, function (obj) {
        obj.titulo = v("g-lp-titulo"); if (!obj.titulo) { UI.toast("Informe a tarefa.", "erro"); return false; }
        obj.responsavel = v("g-lp-resp"); obj.frente = v("g-lp-frente"); obj.semana = v("g-lp-sem"); obj.obraId = self._lpObra;
        obj.comprometida = false; obj.status = "afazer"; obj.causa = ""; obj.restricoes = obj.restricoes || [];
        return true;
      });
    },
    lpComprometer: function (id) {
      var t = this._lpObter(id); if (!t) return;
      if (!window.LastPlanner.podeComprometer(t)) { UI.toast("Remova as restrições antes de comprometer.", "erro"); return; }
      t.comprometida = true; if (t.status !== "feito" && t.status !== "naofeito") t.status = "afazer";
      this._lpSalvar(t, "Tarefa comprometida no plano da semana.");
    },
    lpDescomprometer: function (id) { var t = this._lpObter(id); if (!t) return; t.comprometida = false; this._lpSalvar(t, "Tarefa tirada do plano."); },
    lpFeito: function (id) { var t = this._lpObter(id); if (!t) return; t.status = "feito"; t.causa = ""; this._lpSalvar(t, "✓ Concluída."); },
    lpNaoFeito: function (id) {
      var self = this, t = this._lpObter(id); if (!t) return;
      var opts = window.LastPlanner.CAUSAS.map(function (c) { return '<option value="' + Util.esc(c) + '"' + (t.causa === c ? " selected" : "") + ">" + Util.esc(c) + "</option>"; }).join("");
      UI.modal("Não cumprida — por quê?", campo("Causa (pra melhoria contínua)", sel("g-lp-causa", opts)), [
        { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
        { texto: "Registrar", classe: "primary", onClick: function () { t.status = "naofeito"; t.causa = v("g-lp-causa"); UI.fecharModal(); self._lpSalvar(t, "Causa registrada."); } }
      ]);
    },
    _lpRestrHtml: function (t) {
      var r = t.restricoes || [];
      if (!r.length) return '<p class="muted" style="font-size:12.5px;margin:6px 0">Sem restrições — tarefa livre pra comprometer.</p>';
      return '<table class="tbl" style="font-size:12.5px;margin:6px 0"><tbody>' + r.map(function (x, i) {
        var st = x.removida ? '<span class="g-pill" style="background:#16a34a22;color:#16a34a">removida</span>' : '<span class="g-pill" style="background:#ea580c22;color:#ea580c">pendente</span>';
        var ac = x.removida ? '' : '<button class="btn sm success" data-gacao="lp-rem-restr" data-id="' + t.id + '" data-val="' + i + '">✓ Remover</button>';
        return '<tr><td><b>' + Util.esc(x.tipo || "") + '</b> · ' + Util.esc(x.descricao || "") + (x.prazo ? ' <span class="muted">(' + x.prazo.split("-").reverse().join("/") + ')</span>' : "") + '</td><td>' + st + '</td><td class="num">' + ac + '</td></tr>';
      }).join("") + '</tbody></table>';
    },
    lpAbrir: function (id) {
      var self = this, LP = window.LastPlanner, t = this._lpObter(id); if (!t) return;
      t.restricoes = t.restricoes || [];
      UI.fecharModal();
      var corpo = '<p style="margin:0 0 6px"><b>' + Util.esc(t.titulo) + '</b> <span class="muted">· ' + Util.esc(t.responsavel || "—") + (t.frente ? " · " + Util.esc(t.frente) : "") + '</span></p>' + this._lpRestrHtml(t);
      var tipoOpts = LP.RESTRICOES.map(function (r) { return '<option>' + r + '</option>'; }).join("");
      corpo += '<div class="row" style="margin-top:6px;align-items:end"><div class="field" style="flex:1;margin:0"><label style="font-size:11px">Restrição</label>' + sel("g-lp-rtipo", tipoOpts) + '</div><div class="field" style="flex:1.5;margin:0"><label style="font-size:11px">Descrição</label>' + inp("g-lp-rdesc", "", "Ex.: aço não entregue") + '</div><div class="field" style="flex:.9;margin:0"><label style="font-size:11px">Prazo</label>' + inp("g-lp-rprazo", "", "", "date") + '</div></div>';
      var botoes = [
        { texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); App.render(); } },
        { texto: "+ Restrição", classe: "", onClick: function () { self._lpAddRestr(t.id); } },
        { texto: "🗑 Excluir", classe: "", onClick: function () { if (confirm("Excluir esta tarefa do Last Planner?")) { Store.excluir(eid(), "lp_tarefas", t.id); UI.fecharModal(); App.render(); } } }
      ];
      if (LP.podeComprometer(t) && !t.comprometida) botoes.push({ texto: "✅ Comprometer", classe: "success", onClick: function () { UI.fecharModal(); self.lpComprometer(t.id); } });
      UI.modal("Restrições · " + Util.esc(t.titulo), corpo, botoes);
    },
    _lpAddRestr: function (id) {
      var t = this._lpObter(id); if (!t) return;
      var tipo = v("g-lp-rtipo"), desc = v("g-lp-rdesc"), prazo = v("g-lp-rprazo");
      if (!desc) { UI.toast("Descreva a restrição.", "erro"); return; }
      t.restricoes = t.restricoes || [];
      t.restricoes.push({ id: "r" + Date.now(), tipo: tipo, descricao: desc, prazo: prazo, removida: false });
      Store.salvar(eid(), "lp_tarefas", t); this.lpAbrir(id);
    },
    lpRemRestr: function (id, idx) {
      var t = this._lpObter(id); if (!t || !t.restricoes || !t.restricoes[idx]) return;
      t.restricoes[idx].removida = true; Store.salvar(eid(), "lp_tarefas", t); this.lpAbrir(id);
    },
    _lpImprimir: function (tipo) {
      var LP = window.LastPlanner, obras = lista("obras");
      var obra = obras.filter(function (o) { return o.id === this._lpObra; }, this)[0] || { nome: "" };
      var ts = this._lpTarefas(), look = LP.semanas(new Date(), 6), estaSem = look[0], corpo;
      if (tipo === "ppc") {
        var hb = new Date(); hb.setDate(hb.getDate() - 35);
        var hist = LP.historicoPPC(ts, LP.semanas(hb, 6)), ca = LP.causasAgregadas(ts), med = LP.ppcMedio(hist);
        corpo = '<p><b>Obra:</b> ' + Util.esc(obra.nome) + ' &nbsp; <b>PPC médio (6 sem):</b> ' + (med == null ? "—" : Math.round(med * 100) + "%") + '</p>';
        corpo += '<h3>PPC por semana</h3><table class="prop-tbl"><thead><tr><th>Semana</th><th class="r">Comprometidas</th><th class="r">Feitas</th><th class="r">PPC</th></tr></thead><tbody>' +
          hist.map(function (x) { return '<tr><td>' + x.periodo + '</td><td class="r">' + x.comprometidas + '</td><td class="r">' + x.feitas + '</td><td class="r">' + (x.ppc == null ? "—" : Math.round(x.ppc * 100) + "%") + '</td></tr>'; }).join("") + '</tbody></table>';
        corpo += '<h3>Causas de não-cumprimento (Pareto)</h3>' + (ca.total ? '<table class="prop-tbl"><thead><tr><th>Causa</th><th class="r">Ocorrências</th><th class="r">%</th></tr></thead><tbody>' + ca.linhas.map(function (l) { return '<tr><td>' + Util.esc(l.causa) + '</td><td class="r">' + l.n + '</td><td class="r">' + Math.round(l.pct * 100) + '%</td></tr>'; }).join("") + '</tbody></table>' : '<p>Sem causas registradas.</p>');
        this._abrirDoc("Relatório PPC — " + (obra.nome || ""), this._docShell("RELATÓRIO PPC · LAST PLANNER", "#0f2740", corpo));
      } else {
        var comp = LP.daSemana(ts, estaSem.chave).filter(function (t) { return t.comprometida; });
        corpo = '<p><b>Obra:</b> ' + Util.esc(obra.nome) + ' &nbsp; <b>Semana:</b> ' + estaSem.periodo + '</p>';
        corpo += '<table class="prop-tbl"><thead><tr><th>Tarefa</th><th>Responsável</th><th>Frente</th><th class="r">Feito?</th></tr></thead><tbody>' +
          (comp.length ? comp.map(function (t) { return '<tr><td>' + Util.esc(t.titulo) + '</td><td>' + Util.esc(t.responsavel || "—") + '</td><td>' + Util.esc(t.frente || "—") + '</td><td class="r">☐</td></tr>'; }).join("") : '<tr><td colspan="4">Nenhuma tarefa comprometida.</td></tr>') + '</tbody></table>';
        corpo += '<p style="margin-top:16px;font-size:12px;color:#555">Reunião semanal (Last Planner) — marque ✓ o que foi feito; para o que não foi, anote a causa. O PPC da semana = feitas ÷ comprometidas.</p>';
        this._abrirDoc("Plano Semanal — " + (obra.nome || ""), this._docShell("PLANO DA SEMANA · LAST PLANNER", "#0f2740", corpo));
      }
    },

    // ---------- Dispatcher de ações (chamado pelo app.js) ----------
    acao: function (gacao, dataset, app) {
      var id = dataset.id;
      if (gacao.indexOf("novo") !== 0 && gacao !== "custo-frota" && gacao !== "consultar-chave" && gacao !== "pr-troca-obra" && gacao !== "dash-periodo" && gacao !== "tar-filtro" && gacao !== "tar-obra" && gacao !== "bim-troca-obra" && gacao !== "lp-obra" && gacao !== "fs-semana" && gacao !== "fs-obra" && gacao.indexOf("galeria") !== 0 && this._bloqueado()) return;
      switch (gacao) {
        case "pr-troca-obra": return this.prTrocaObra(dataset.value);
        case "bim-troca-obra": return this.bimTrocaObra(dataset.value);
        case "dash-periodo": return this.dashTrocaPeriodo(dataset.value);
        case "nova-tarefa": return this.novoTarefa();
        case "tar-filtro": return this.tarTrocaFiltro(dataset.val);
        case "tar-obra": return this.tarTrocaObra(dataset.value);
        case "tar-fazer": return this._tarefaStatus(id, "fazendo", "Tarefa em andamento.");
        case "tar-concluir": return this._tarefaStatus(id, "feita", "Tarefa concluída.");
        case "tar-reabrir": return this._tarefaStatus(id, "afazer", "Tarefa reaberta.");
        case "lp-obra": return this.lpTrocaObra(dataset.value);
        case "lp-nova": return this.lpNova(0);
        case "lp-nova-sem": return this.lpNova(parseInt(dataset.val, 10) || 0);
        case "lp-abrir": return this.lpAbrir(id);
        case "lp-comprometer": return this.lpComprometer(id);
        case "lp-descomprometer": return this.lpDescomprometer(id);
        case "lp-feito": return this.lpFeito(id);
        case "lp-naofeito": return this.lpNaoFeito(id);
        case "lp-rem-restr": return this.lpRemRestr(id, parseInt(dataset.val, 10));
        case "lp-imprimir": return this._lpImprimir(dataset.val);
        case "fs-semana": return this.fsTroca("semana", dataset.value);
        case "fs-obra": return this.fsTroca("obra", dataset.value);
        case "fs-nova": return this.fsForm(null);
        case "fs-edit": return this.fsForm(dataset.val);
        case "fs-del": return this.fsExcluir(dataset.val);
        case "fs-importar": return this.fsImportar();
        case "fs-print": return this.fsPrint(dataset.val);
        case "fs-financeiro": return this.fsFinanceiro();
        case "fs-copiar": return this.fsCopiarSemana();
        case "fs-mes": return this.fsResumoMes();
        case "fs-recibos": return this.fsRecibos();
        case "fs-csv": return this.fsCsv();
        case "fs-pago": return this.fsTogglePago(dataset.val);
        case "fs-assinar": return this.fsAssinar(dataset.val);
        case "fs-entregaveis": return this.fsEntregaveis();
        case "fs-rel": return this.fsRelGerar(dataset.val);
        case "galeria-troca-obra": return this.galeriaTrocaObra(dataset.value);
        case "galeria-abrir": return this.galeriaAbrir(dataset.idx);
        case "galeria-nav": return this.galeriaNav(dataset.dir);
        case "galeria-fechar": return this.galeriaFecharLb();
        case "galeria-relatorio": return this.galeriaRelatorio();
        case "upsell-plus": return this._upsell();
        case "portal-obra": return this.portalObra(id);
        case "doc-financeiro": return this.lancarDocumento();
        case "nova-obra": return this.novoObra();
        case "nova-cliente": return this.novoCliente();
        case "novo-contrato": return this.novoContrato();
        case "nova-medicao": return this.novoMedicao();
        case "novo-lancamento": return this.novoLancamento();
        case "aprovar-medicao": return this._aprovar("medicoes", id, "aprovada", "Medição aprovada.");
        case "rejeitar-medicao": return this._rejeitar("medicoes", id, "rejeitada");
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
        case "aprovar-compra": return this._aprovar("compras", id, "aprovado", "Pedido de compra aprovado.");
        case "rejeitar-compra": return this._rejeitar("compras", id, "rejeitado");
        case "receber-compra": {
          var pcr = Store.obter(eid(), "compras", id); if (!pcr) return;
          pcr.status = "recebido"; pcr.dataRecebimento = new Date().toISOString().slice(0, 10); Store.salvar(eid(), "compras", pcr);
          Store.salvar(eid(), "financeiro", { data: pcr.dataRecebimento, desc: "Compra " + (pcr.numero || "") + " — " + (pcr.descricao || ""), tipo: "despesa", categoria: pcr.categoria || "material", valor: Util.num(pcr.valor), status: "pendente", obraId: pcr.obraId, fornecedor: pcr.fornecedorNome, formaPgto: pcr.formaPgto });
          App.render(); UI.toast("Compra recebida e despesa lançada no Financeiro (pendente).", "ok"); return;
        }
        case "entrada-estoque": return this._movEstoque(id, "entrada");
        case "saida-estoque": return this._movEstoque(id, "saida");
        case "novo-rdo": return this.novoRdo();
        case "novo-usuario": return this.novoUsuario();
        case "nova-entrega-epi": return this.novoEntregaEpi();
        case "catalogo-epi": return this.abrirCatalogoEpi();
        case "ficha-epi": return this.fichaEpi(id);
        case "nova-falta": return this.registrarFalta();
        case "falta-lote": return this.faltasLote();
        case "espelho-ponto": return this.espelhoPonto();
        case "config-jornada": return this.configJornada();
        case "excluir-falta": return this.excluirFalta(id);
        case "recibo-folha": return this.reciboFolha(id);
        case "boletim-medicao": return this.boletimMedicao(id);
        case "excel-medicao": return this.excelMedicao(id);
        case "doc-requisicao": return this.documentoRequisicao(id);
        case "doc-compra": return this.documentoCompra(id);
        case "export-financeiro": return this.exportarModulo("financeiro");
        case "export-compras": return this.exportarModulo("compras");
        case "export-medicoes": return this.exportarModulo("medicoes");
        case "colab-doc": return this.cadastrarColaboradorDoc();
        case "novo-modelo": return this.novoModelo();
        case "seed-modelos": return this.seedModelos();
        case "gerar-modelo": return this.gerarModelo(id);
        case "finalizar-rdo": {
          var rd = Store.obter(eid(), "rdo", id); if (!rd) return;
          rd.status = "finalizado"; Store.salvar(eid(), "rdo", rd); App.render(); UI.toast("Diário finalizado.", "ok"); return;
        }
        case "imprimir-rdo": return this.imprimirRdo(id);
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
        case "aprovar-requisicao": return this._aprovar("requisicoes", id, "aprovada", "Requisição aprovada.");
        case "rejeitar-requisicao": return this._rejeitar("requisicoes", id, "rejeitada");
        case "comprar-requisicao": return this.comprarRequisicao(id);
case "nova-fiscal": return this.novoFiscal();
        case "lancar-fiscal": return this.lancarFiscal(id);
        case "importar-xml-lote": return this.importarXmlLote();
        case "consultar-chave": return this.consultarChave();
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
      var numero = g("nNF"), serie = g("serie"), natureza = g("natOp");
      var chave = "";
      var infNfe = doc.getElementsByTagName("infNFe")[0];
      if (infNfe && infNfe.getAttribute && infNfe.getAttribute("Id")) chave = String(infNfe.getAttribute("Id")).replace(/^NFe/i, "");
      if (!chave) chave = g("chNFe");
      var itens = [], dets = doc.getElementsByTagName("det");
      for (var i = 0; i < dets.length && i < 60; i++) { var prod = dets[i].getElementsByTagName("prod")[0]; if (prod) itens.push({ descricao: sub(prod, "xProd"), quantidade: parseFloat(sub(prod, "qCom")) || 0, unidade: sub(prod, "uCom"), valor: parseFloat(sub(prod, "vProd")) || 0 }); }
      var destEl = doc.getElementsByTagName("dest")[0];
      var dest = { nome: sub(destEl, "xNome"), cnpj: sub(destEl, "CNPJ") || sub(destEl, "CPF"), cidade: sub(destEl, "xMun"), uf: sub(destEl, "UF") };
      return { tipoLancamento: "despesa", fornecedor: forn, destinatario: dest, valor: valor, emissao: emissao, vencimento: vencimento, numero: numero, serie: serie, chave: chave, natureza: natureza, descricao: "NF " + numero + " — " + forn.nome, categoria: "material", itens: itens, confianca: 1 };
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
      // NF identificada (número/chave): registra também na entidade fiscal, sem duplicar
      if (dados.numero || dados.chave) {
        var chaveLimpa = String(dados.chave || "").replace(/\D/g, "");
        var jaTem = lista("fiscal").filter(function (x) {
          var xc = String(x.chaveAcesso || "").replace(/\D/g, "");
          if (chaveLimpa && xc) return xc === chaveLimpa;
          return dados.numero && String(x.numero) === String(dados.numero) && (x.parceiro || "") === (fn.nome || "");
        })[0];
        if (!jaTem) {
          Store.salvar(eid(), "fiscal", {
            numero: dados.numero || "", serie: dados.serie || "", tipo: ehReceita ? "saida" : "entrada",
            status: "emitida", naturezaOp: dados.natureza || "", parceiro: fn.nome || "", obraId: "",
            dataEmissao: dados.emissao || "", valorProdutos: 0, valorImpostos: 0,
            valorTotal: dados.valor || 0, chaveAcesso: dados.chave || "", origem: origem || "documento-ia"
          });
          msgCad += "NF registrada no Fiscal. ";
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
      if (entidade === "tarefas") return this.formTarefa(r);
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
if (entidade === "equipe") return this.formUsuario(r);
if (entidade === "epi") return this.formEntregaEpi(r);
if (entidade === "templates") return this.formModelo(r);
    }
  };

  global.Gestao = Gestao;
})(window);
