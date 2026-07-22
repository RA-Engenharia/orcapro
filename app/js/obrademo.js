/* =====================================================================
 * obrademo.js — OBRA TESTE ORÇAPRO (dados de demonstração completos)
 * Cria UMA obra totalmente configurada na empresa ATUAL, alimentando
 * todos os módulos com dados coerentes e conectados (cliente → contrato
 * → orçamento SINAPI → cronograma → Last Planner → RDO/galeria →
 * medições → suprimentos → equipe/EPI/ponto/folha → frota/patrimônio →
 * financeiro/fiscal/centro de custo) pra demonstrar o sistema vivo.
 *
 * Idempotente: ids fixos "demo-ot-*" — criar de novo sobrescreve,
 * remover apaga só o que é da demo (nada do cliente é tocado).
 * Datas RELATIVAS a hoje: a demo nunca envelhece.
 * ===================================================================== */
(function (global) {
  "use strict";

  var PRE = "demo-ot-";

  function eid() { return (typeof Auth !== "undefined" && Auth.empresaId) ? Auth.empresaId() : "local"; }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function iso(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
  function dias(base, n) { var d = new Date(base.getTime()); d.setDate(d.getDate() + n); return d; }
  function segunda(d) { var x = new Date(d.getTime()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); x.setHours(0, 0, 0, 0); return x; }
  /* dia útil mais recente <= hoje-n (pula sáb/dom pra RDO/falta cair em dia de obra) */
  function diaUtil(nAtras) {
    var d = dias(new Date(), -nAtras);
    while (d.getDay() === 0 || d.getDay() === 6) d = dias(d, -1);
    return d;
  }
  /* Grava e FALHA ALTO se o armazenamento estiver cheio (Store devolve null na
   * cota estourada) — sem isso o seed sai pela metade com toast de sucesso. */
  function salvar(chave, obj) {
    var r = Store.salvar(eid(), chave, obj);
    if (r == null) throw new Error("Sem espaço no armazenamento do navegador (" + chave + ") — faça um backup/limpeza e tente de novo.");
    return r;
  }

  /* Foto de demonstração: canvas → JPEG pequeno (galeria + impresso do RDO). */
  function foto(rotulo, cor) {
    try {
      var c = document.createElement("canvas"); c.width = 480; c.height = 320;
      var g = c.getContext("2d");
      var grad = g.createLinearGradient(0, 0, 0, 320);
      grad.addColorStop(0, cor || "#8fa8bd"); grad.addColorStop(1, "#3f5a72");
      g.fillStyle = grad; g.fillRect(0, 0, 480, 320);
      g.fillStyle = "rgba(255,255,255,.25)";
      for (var i = 0; i < 6; i++) g.fillRect(30 + i * 75, 150 - (i % 3) * 18, 52, 170);   // "esqueleto" de prédio
      g.fillStyle = "#0f2740"; g.fillRect(0, 258, 480, 62);
      g.fillStyle = "#ffffff"; g.font = "bold 20px Segoe UI, sans-serif";
      g.fillText("OBRA TESTE ORÇAPRO", 16, 284);
      g.font = "13px Segoe UI, sans-serif"; g.fillText(rotulo, 16, 306);
      return c.toDataURL("image/jpeg", 0.5);
    } catch (e) { return ""; }
  }

  var ObraDemo = {
    existe: function () { return !!Store.obter(eid(), "obras", PRE + "obra"); },

    criar: function () {
      if (typeof global.LastPlanner === "undefined" || typeof global.Orcamento === "undefined") {
        throw new Error("Módulos ainda carregando — tente de novo em instantes.");
      }
      // Limpa qualquer resquício antes (inclusive órfãos de uma obra demo excluída
      // pelo módulo Obras) — criar é sempre do zero, idempotente de verdade.
      this.remover();
      var hoje = new Date();
      var iniObra = segunda(dias(hoje, -70));            // obra começou ~10 semanas atrás
      var obraId = PRE + "obra";
      var LP = global.LastPlanner;
      var semAtual = LP.chaveSemana(hoje);
      var sem = function (n) { return LP.chaveSemana(dias(new Date(semAtual + "T00:00:00"), n * 7)); };

      // ---------- 1) Cliente ----------
      salvar("clientes", {
        id: PRE + "cli", nome: "Construtora Horizonte Ltda", tipo: "PJ",
        doc: "12.345.678/0001-90", ie: "003.456.789.0012", telefone: "(34) 99123-4567",
        email: "contato@horizonteconstrutora.com.br", endereco: "Av. Brasil, 1200 — Centro",
        cidade: "Uberlândia", uf: "MG", cep: "38400-000", status: "ativo", origem: "indicacao",
        obs: "Cliente da OBRA TESTE ORÇAPRO (dados de demonstração)."
      });

      // ---------- 2) Fornecedores ----------
      salvar("fornecedores", { id: PRE + "for1", nome: "Depósito São José", categoria: "material", tipo: "PJ", doc: "98.765.432/0001-10", ie: "", telefone: "(34) 3212-4455", email: "vendas@depositosaojose.com.br", contato: "Sr. Antônio", endereco: "Rua das Indústrias, 85", cidade: "Uberlândia", uf: "MG", status: "homologado", produtos: "Cimento, areia, brita, blocos, argamassa", obs: "" });
      salvar("fornecedores", { id: PRE + "for2", nome: "Concreteira Forte", categoria: "material", tipo: "PJ", doc: "11.222.333/0001-44", ie: "", telefone: "(34) 3230-7788", email: "comercial@concreteiraforte.com.br", contato: "Fernanda", endereco: "Rod. BR-050, km 78", cidade: "Uberlândia", uf: "MG", status: "ativo", produtos: "Concreto usinado FCK 25/30/35", obs: "" });
      salvar("fornecedores", { id: PRE + "for3", nome: "LocaMáquinas Equipamentos", categoria: "locacao", tipo: "PJ", doc: "55.666.777/0001-88", ie: "", telefone: "(34) 3216-9900", email: "locacao@locamaquinas.com.br", contato: "Paulo", endereco: "Av. dos Contornos, 400", cidade: "Uberlândia", uf: "MG", status: "ativo", produtos: "Andaimes, betoneiras, escoras, geradores", obs: "" });

      // ---------- 3) Colaboradores ----------
      salvar("colaboradores", { id: PRE + "col1", nome: "José Carlos Mendes", funcao: "Mestre de obras", tipoContrato: "clt", cpf: "111.222.333-44", telefone: "(34) 99811-1111", remuneracao: 4200, unidadeRem: "mensal", admissao: iso(dias(iniObra, -30)), obraId: obraId, status: "ativo" });
      salvar("colaboradores", { id: PRE + "col2", nome: "Rosivaldo Ferreira", funcao: "Pedreiro", tipoContrato: "diarista", cpf: "222.333.444-55", telefone: "(34) 99822-2222", remuneracao: 166, unidadeRem: "diaria", admissao: iso(iniObra), obraId: obraId, status: "ativo" });
      salvar("colaboradores", { id: PRE + "col3", nome: "Marcos Paulo Lima", funcao: "Pedreiro", tipoContrato: "diarista", cpf: "333.444.555-66", telefone: "(34) 99833-3333", remuneracao: 166, unidadeRem: "diaria", admissao: iso(iniObra), obraId: obraId, status: "ativo" });
      salvar("colaboradores", { id: PRE + "col4", nome: "Ana Beatriz Souza", funcao: "Servente", tipoContrato: "diarista", cpf: "444.555.666-77", telefone: "(34) 99844-4444", remuneracao: 120, unidadeRem: "diaria", admissao: iso(dias(iniObra, 7)), obraId: obraId, status: "ativo" });
      salvar("colaboradores", { id: PRE + "col5", nome: "Eng. Carla Rodrigues", funcao: "Engenheira civil", tipoContrato: "clt", cpf: "555.666.777-88", telefone: "(34) 99855-5555", remuneracao: 8500, unidadeRem: "mensal", admissao: iso(dias(iniObra, -60)), obraId: obraId, status: "ativo" });

      // ---------- 4) Orçamento (etapas + itens SINAPI) ----------
      var orc = Orcamento.novo({ nome: "OBRA TESTE ORÇAPRO — Residência 180 m²", cliente: "Construtora Horizonte Ltda", obra: "OBRA TESTE ORÇAPRO" });
      orc.id = PRE + "orc";
      orc.cliente = { nome: "Construtora Horizonte Ltda", doc: "12.345.678/0001-90", contato: "contato@horizonteconstrutora.com.br" };
      orc.obra = { nome: "OBRA TESTE ORÇAPRO", local: "Rua dos Ipês, 250 — Jardim Karaíba, Uberlândia/MG", regime: "Empreitada" };
      // addEtapa retorna o ORC (não a etapa) — pega a última etapa criada
      var addE = function (nome) { Orcamento.addEtapa(orc, nome); return orc.etapas[orc.etapas.length - 1]; };
      /* Item de BASE: pesca a composição REAL da base SINAPI carregada (código,
       * descrição, unidade e custo VERDADEIROS — regra: nunca inventar código
       * SINAPI). Se a base não tiver o código, vira item PRÓPRIO sem código. */
      var addB = function (etapa, codigo, qtd, fbDesc, fbUn, fbCusto) {
        var b = (typeof Sinapi !== "undefined" && Sinapi.obter) ? Sinapi.obter(codigo) : null;
        var si = b
          ? { codigo: String(b.codigo), descricao: b.descricao, unidade: b.unidade || "un", custoUnitario: Util.num(b.custoUnitario), custoMO: Util.num(b.custoMO), custoMAT: Util.num(b.custoMAT), custoEQ: Util.num(b.custoEQ) }
          : { codigo: "", descricao: fbDesc, unidade: fbUn, custoUnitario: fbCusto, custoMO: 0, custoMAT: 0, custoEQ: 0 };
        Orcamento.addItem(orc, etapa.id, si, qtd);
      };
      // Item PRÓPRIO (composição da empresa, sem código — honesto por definição)
      var addP = function (etapa, desc, un, cMO, cMAT, cEQ, qtd) {
        Orcamento.addItem(orc, etapa.id, { codigo: "", descricao: desc, unidade: un, custoUnitario: cMO + cMAT + cEQ, custoMO: cMO, custoMAT: cMAT, custoEQ: cEQ }, qtd);
      };
      var e1 = addE("Serviços Preliminares");
      addB(e1, "99059", 180, "Locação convencional da obra com gabarito", "m2", 7.3);
      addP(e1, "Instalação provisória de canteiro (água/energia/tapume)", "un", 1200, 2300, 0, 1);
      var e2 = addE("Fundações");
      addB(e2, "96523", 42, "Escavação manual para sapatas", "m3", 58.4);
      addP(e2, "Concreto magro para lastro (preparo em obra)", "m3", 92, 388, 15, 6);
      addB(e2, "94965", 28, "Concreto FCK 25 MPa preparo mecânico", "m3", 608);
      var e3 = addE("Estrutura");
      addP(e3, "Concretagem de pilares e vigas FCK 30 (com bomba)", "m3", 132, 498, 30, 34);
      addB(e3, "92917", 2800, "Armação de estruturas de concreto armado", "kg", 9.2);
      addP(e3, "Forma de madeira para estrutura (3 reaproveitamentos)", "m2", 28, 34, 0, 310);
      var e4 = addE("Alvenaria e Vedações");
      addB(e4, "103355", 420, "Alvenaria de vedação em blocos cerâmicos", "m2", 62.8);
      addB(e4, "87905", 780, "Chapisco em alvenaria", "m2", 6.4);
      addB(e4, "87775", 780, "Emboço/massa única em argamassa 1:2:8", "m2", 24.2);
      var e5 = addE("Instalações");
      addP(e5, "Instalações elétricas — ponto completo (tubulação+fiação+dispositivo)", "un", 68, 74, 0, 96);
      addP(e5, "Instalações hidrossanitárias — ponto de água/esgoto completo", "un", 82, 96, 0, 54);
      var e6 = addE("Acabamentos");
      addB(e6, "87263", 180, "Revestimento cerâmico para piso", "m2", 68.5);
      addB(e6, "88489", 920, "Pintura látex acrílica, duas demãos", "m2", 16);
      if (Store.salvarOrcamento(eid(), orc) == null) throw new Error("Sem espaço no armazenamento do navegador (orçamento) — faça um backup/limpeza e tente de novo.");
      var precoVenda = Math.round(Orcamento.totais(orc).precoVenda);

      // ---------- 5) Obra (hub de tudo) ----------
      salvar("obras", {
        id: obraId, nome: "OBRA TESTE ORÇAPRO", clienteId: PRE + "cli", clienteNome: "Construtora Horizonte Ltda",
        tipo: "residencial", fase: "estrutura", status: "andamento", valor: precoVenda,
        local: "Rua dos Ipês, 250 — Jardim Karaíba, Uberlândia/MG",
        inicio: iso(iniObra), termino: iso(dias(iniObra, 240)),
        areaConstruida: 180, areaTerreno: 360, orcamentoId: PRE + "orc",
        obs: "Obra de DEMONSTRAÇÃO do OrçaPRO — todos os módulos alimentados. Remova pelo Painel quando quiser."
      });

      // ---------- 6) Contrato ----------
      salvar("contratos", {
        id: PRE + "con", numero: "CT-" + hoje.getFullYear() + "-OT1", status: "ativo",
        clienteId: PRE + "cli", clienteNome: "Construtora Horizonte Ltda", obraId: obraId,
        tipo: "empreitada_global", regime: "direta", valor: precoVenda, formaPgto: "medicao_retencao",
        dataAssinatura: iso(dias(iniObra, -7)), inicio: iso(iniObra), termino: iso(dias(iniObra, 240)),
        orcamentoId: PRE + "orc", descricao: "Execução completa de residência unifamiliar de 180 m² conforme orçamento ORÇAPRO vinculado.",
        rtContratada: "Eng. Carla Rodrigues", creaContratada: "CREA-MG 123456/D", artContratada: "BR20260000001",
        garantiaServicos: 60, tipoGarantia: "caucao", multaAtraso: 0.1, clausulasEspeciais: ""
      });

      // ---------- 7) Medições (1 paga + 1 aguardando aprovação) ----------
      var med1v = Math.round(precoVenda * 0.18);
      salvar("medicoes", {
        id: PRE + "med1", numero: "01ª", status: "paga", obraId: obraId, contratoId: PRE + "con",
        orcamentoId: null, itens: null,
        periodoInicio: iso(iniObra), periodoFim: iso(dias(iniObra, 28)),
        percentual: 18, valor: med1v, retencao: 5,
        descricao: "Serviços preliminares e fundações concluídas.",
        aprovadoPor: "Eng. Carla Rodrigues", aprovadoEm: iso(dias(iniObra, 30)), dataPgto: iso(dias(iniObra, 35))
      });
      salvar("medicoes", {
        id: PRE + "med2", numero: "02ª", status: "pendente", obraId: obraId, contratoId: PRE + "con",
        orcamentoId: null, itens: null,
        periodoInicio: iso(dias(iniObra, 29)), periodoFim: iso(diaUtil(2)),
        percentual: 14, valor: Math.round(precoVenda * 0.14), retencao: 5,
        descricao: "Estrutura do pavimento térreo e início da alvenaria."
      });

      // ---------- 8) Last Planner (2 semanas medidas + semana atual + lookahead) ----------
      var lpSeed = [
        // semana -2: 3 comprometidas, 2 feitas + 1 não cumprida c/ causa → PPC 67%
        { id: PRE + "lp1", titulo: "Concretar sapatas do bloco A", responsavel: "Equipe estrutura", frente: "Fundações", semana: sem(-2), comprometida: true, status: "feito", causa: "", concluidaEm: sem(-2), restricoes: [] },
        { id: PRE + "lp2", titulo: "Impermeabilizar baldrames", responsavel: "Rosivaldo Ferreira", frente: "Fundações", semana: sem(-2), comprometida: true, status: "feito", causa: "", concluidaEm: sem(-2), restricoes: [] },
        { id: PRE + "lp3", titulo: "Montar armadura dos pilares P1–P8", responsavel: "Equipe estrutura", frente: "Estrutura", semana: sem(-2), comprometida: true, status: "naofeito", causa: "Material", restricoes: [] },
        // semana -1: 4 comprometidas, 3 feitas + 1 clima → PPC 75%
        { id: PRE + "lp4", titulo: "Montar armadura dos pilares P1–P8 (replanejada)", responsavel: "Equipe estrutura", frente: "Estrutura", semana: sem(-1), comprometida: true, status: "feito", causa: "", concluidaEm: sem(-1), restricoes: [] },
        { id: PRE + "lp5", titulo: "Formas dos pilares do térreo", responsavel: "Marcos Paulo Lima", frente: "Estrutura", semana: sem(-1), comprometida: true, status: "feito", causa: "", concluidaEm: sem(-1), restricoes: [] },
        { id: PRE + "lp6", titulo: "Concretar pilares P1–P8", responsavel: "Equipe estrutura", frente: "Estrutura", semana: sem(-1), comprometida: true, status: "naofeito", causa: "Clima", restricoes: [] },
        { id: PRE + "lp7", titulo: "Locar alvenaria do térreo", responsavel: "José Carlos Mendes", frente: "Alvenaria", semana: sem(-1), comprometida: true, status: "feito", causa: "", concluidaEm: sem(-1), restricoes: [] },
        // semana ATUAL: em execução + 1 concluída + 1 liberada + 1 impedida
        { id: PRE + "lp8", titulo: "Concretar pilares P1–P8 (replanejada)", responsavel: "Equipe estrutura", frente: "Estrutura", semana: semAtual, comprometida: true, status: "feito", causa: "", concluidaEm: iso(diaUtil(1)), concluidaVia: "rdo", restricoes: [] },
        { id: PRE + "lp9", titulo: "Formas e escoramento das vigas do térreo", responsavel: "Marcos Paulo Lima", frente: "Estrutura", semana: semAtual, comprometida: true, status: "afazer", causa: "", restricoes: [] },
        { id: PRE + "lp10", titulo: "Alvenaria do térreo — panos 1 a 4", responsavel: "Rosivaldo Ferreira", frente: "Alvenaria", semana: semAtual, comprometida: true, status: "afazer", causa: "", restricoes: [] },
        { id: PRE + "lp11", titulo: "Chapisco das paredes externas", responsavel: "Ana Beatriz Souza", frente: "Alvenaria", semana: semAtual, comprometida: false, status: "afazer", causa: "", restricoes: [] },
        { id: PRE + "lp12", titulo: "Instalações elétricas — infra da laje", responsavel: "Equipe elétrica", frente: "Instalações", semana: semAtual, comprometida: false, status: "afazer", causa: "", restricoes: [{ id: "r-demo-1", tipo: "Material", descricao: "Eletrodutos ainda não entregues (Depósito São José)", prazo: iso(dias(hoje, 2)), removida: false }] },
        // lookahead futuro
        { id: PRE + "lp13", titulo: "Concretar laje do térreo", responsavel: "Equipe estrutura", frente: "Estrutura", semana: sem(1), comprometida: false, status: "afazer", causa: "", restricoes: [] },
        { id: PRE + "lp14", titulo: "Alvenaria do pavimento superior", responsavel: "Rosivaldo Ferreira", frente: "Alvenaria", semana: sem(2), comprometida: false, status: "afazer", causa: "", restricoes: [{ id: "r-demo-2", tipo: "Mão de obra", descricao: "Contratar 1 pedreiro adicional", prazo: iso(dias(hoje, 9)), removida: false }] },
        { id: PRE + "lp15", titulo: "Contramarcos e vergas", responsavel: "Marcos Paulo Lima", frente: "Alvenaria", semana: sem(2), comprometida: false, status: "afazer", causa: "", restricoes: [] }
      ];
      lpSeed.forEach(function (t) { t.obraId = obraId; salvar("lp_tarefas", t); });

      // ---------- 9) Tarefas gerais (1 atrasada acende o ⚠ do Painel) ----------
      salvar("tarefas", { id: PRE + "tar1", titulo: "Renovar seguro de responsabilidade civil da obra", responsavelId: PRE + "col5", obraId: obraId, prazo: iso(dias(hoje, -3)), prioridade: "alta", status: "afazer", descricao: "Apólice vence esta semana.", concluidaEm: "" });
      salvar("tarefas", { id: PRE + "tar2", titulo: "Cotar caçamba de entulho", responsavelId: PRE + "col1", obraId: obraId, prazo: iso(dias(hoje, 4)), prioridade: "normal", status: "fazendo", descricao: "", concluidaEm: "" });
      salvar("tarefas", { id: PRE + "tar3", titulo: "Agendar visita do cliente à obra", responsavelId: PRE + "col5", obraId: obraId, prazo: iso(dias(hoje, 7)), prioridade: "normal", status: "afazer", descricao: "Mostrar avanço da estrutura.", concluidaEm: "" });
      salvar("tarefas", { id: PRE + "tar4", titulo: "Enviar ART de execução ao CREA", responsavelId: PRE + "col5", obraId: obraId, prazo: iso(dias(hoje, -20)), prioridade: "urgente", status: "feita", descricao: "", concluidaEm: iso(dias(hoje, -18)) });

      // ---------- 10) RDOs (galeria vem das fotos) ----------
      var f1 = foto("Concretagem dos pilares — bloco A", "#7d94a8");
      var f2 = foto("Armação das vigas do térreo", "#9a8f7d");
      var f3 = foto("Alvenaria do térreo — pano 2", "#8aa78d");
      var rdos = [
        { n: 1, at: diaUtil(6), atv: "Montagem das formas dos pilares P1–P8. Conferência de prumo e travamento.", oc: "Sem ocorrências.", ed: 7, ei: 2, eq: "Serra circular, prumo a laser", fotos: [] },
        { n: 2, at: diaUtil(4), atv: "Armação dos pilares concluída. Início da montagem do escoramento das vigas.", oc: "Sem ocorrências.", ed: 8, ei: 2, eq: "Policorte, andaimes", fotos: f2 ? [{ d: f2, leg: "Armação das vigas do térreo" }] : [] },
        { n: 3, at: diaUtil(3), atv: "Chuva forte pela manhã — serviços externos suspensos até 10h. À tarde, preparação para concretagem.", oc: "Chuva forte das 7h às 10h — frente externa paralisada (2h30 de improdutividade).", ed: 8, ei: 2, eq: "Bomba de concreto agendada", fotos: [] },
        { n: 4, at: diaUtil(1), atv: "Concretagem dos pilares P1–P8 com concreto usinado FCK 30 (Concreteira Forte). Cura iniciada.", oc: "Sem ocorrências.", ed: 9, ei: 2, eq: "Bomba lança, vibradores", lp: PRE + "lp8", fotos: f1 ? [{ d: f1, leg: "Concretagem dos pilares — bloco A" }] : [] },
        { n: 5, at: diaUtil(0), atv: "Início da alvenaria do térreo (panos 1 e 2). Marcação da primeira fiada conferida pelo mestre.", oc: "Sem ocorrências.", ed: 8, ei: 2, eq: "Betoneira 400L, nível a laser", fotos: f3 ? [{ d: f3, leg: "Alvenaria do térreo — pano 2" }] : [] }
      ];
      rdos.forEach(function (r) {
        salvar("rdo", {
          id: PRE + "rdo" + r.n, numero: "RDO-" + ("0000" + r.n).slice(-4),
          data: iso(r.at), status: "finalizado", obraId: obraId, obraNome: "OBRA TESTE ORÇAPRO",
          climaManha: r.n === 3 ? "chuva_forte" : "ensolarado", climaTarde: r.n === 3 ? "nublado" : "ensolarado",
          condicao: r.n === 3 ? "parcial" : "praticavel",
          efetivoDireto: r.ed, efetivoIndireto: r.ei, terceiros: r.n === 4 ? "Equipe da concreteira (3)" : "",
          atividades: r.atv, ocorrencias: r.oc, equipamentos: r.eq,
          responsavel: "Eng. Carla Rodrigues", autor: "José Carlos Mendes", lpTarefaId: r.lp || "", fotos: r.fotos
        });
      });

      // ---------- 11) Suprimentos: requisição → cotação → compras ----------
      var ano = hoje.getFullYear();
      salvar("requisicoes", {
        id: PRE + "req1", numero: "REQ-" + ano + "-OT1", data: iso(diaUtil(5)), obraId: obraId,
        solicitante: "José Carlos Mendes", prioridade: "alta", status: "comprada", observacoes: "Material da alvenaria do térreo.",
        itens: [
          { codigo: "", descricao: "Bloco cerâmico 14x19x39", unidade: "un", quantidade: 4200, precoRef: 2.35, categoria: "MAT", fonte: "" },
          { codigo: "", descricao: "Argamassa de assentamento", unidade: "sc", quantidade: 90, precoRef: 14.5, categoria: "MAT", fonte: "" }
        ],
        descricao: "Bloco cerâmico 14x19x39 (+1 item)", valorEstimado: 4200 * 2.35 + 90 * 14.5,
        quantidade: 4200, unidade: "un",
        aprovadoPor: "Eng. Carla Rodrigues", aprovadoEm: iso(diaUtil(4))
      });
      salvar("cotacoes", {
        id: PRE + "cot1", numero: "COT-" + ano + "-OT1", data: iso(diaUtil(4)), obraId: obraId,
        requisicaoId: PRE + "req1", descricao: "Materiais da alvenaria do térreo", status: "concluida", cenario: "unico",
        itens: [
          { codigo: "", descricao: "Bloco cerâmico 14x19x39", unidade: "un", quantidade: 4200, precoRef: 2.35 },
          { codigo: "", descricao: "Argamassa de assentamento", unidade: "sc", quantidade: 90, precoRef: 14.5 }
        ],
        fornecedores: [
          { fornecedorId: PRE + "for1", nome: "Depósito São José", frete: 0, prazoDias: 3, condPgto: "28 dias", precos: { "0": 2.28, "1": 13.9 } },
          { fornecedorId: null, nome: "Casa do Construtor UDI", frete: 180, prazoDias: 2, condPgto: "à vista", precos: { "0": 2.41, "1": 13.5 } }
        ]
      });
      salvar("compras", {
        id: PRE + "com1", numero: "PC-" + ano + "-OT1", fornecedorId: PRE + "for1", fornecedorNome: "Depósito São José",
        obraId: obraId, descricao: "Bloco cerâmico 14x19x39 (4.200 un) + argamassa (90 sc) — alvenaria do térreo",
        valor: Math.round(4200 * 2.28 + 90 * 13.9), categoria: "material", formaPgto: "parcelado",
        data: iso(diaUtil(3)), previsaoEntrega: iso(diaUtil(1)), obs: "", status: "recebido",
        itens: [
          { codigo: "", descricao: "Bloco cerâmico 14x19x39", unidade: "un", quantidade: 4200, precoRef: 2.28 },
          { codigo: "", descricao: "Argamassa de assentamento", unidade: "sc", quantidade: 90, precoRef: 13.9 }
        ],
        requisicaoId: PRE + "req1", cotacaoId: PRE + "cot1",
        aprovadoPor: "Eng. Carla Rodrigues", aprovadoEm: iso(diaUtil(3)), dataRecebimento: iso(diaUtil(1))
      });
      salvar("compras", {
        id: PRE + "com2", numero: "PC-" + ano + "-OT2", fornecedorId: PRE + "for2", fornecedorNome: "Concreteira Forte",
        obraId: obraId, descricao: "Concreto usinado FCK 30 — laje do térreo (12 m³)", valor: 12 * 620,
        categoria: "material", formaPgto: "avista", data: iso(diaUtil(1)), previsaoEntrega: iso(dias(hoje, 6)),
        obs: "Agendar bomba.", status: "aprovado", aprovadoPor: "Eng. Carla Rodrigues", aprovadoEm: iso(diaUtil(1))
      });
      salvar("compras", {
        id: PRE + "com3", numero: "PC-" + ano + "-OT3", fornecedorId: PRE + "for3", fornecedorNome: "LocaMáquinas Equipamentos",
        obraId: obraId, descricao: "Locação de escoras metálicas (200 un × 45 dias)", valor: 3600,
        categoria: "locacao", formaPgto: "parcelado", data: iso(diaUtil(0)), previsaoEntrega: "", obs: "", status: "cotacao"
      });

      // ---------- 12) Estoque (+ movimentações coerentes) ----------
      salvar("estoque", { id: PRE + "est1", nome: "Cimento CP-II 50 kg", categoria: "cimento", unidade: "sc", saldo: 46, estoqueMin: 30, custoUnit: 32.9, obraId: obraId, localizacao: "Depósito da obra", obs: "" });
      salvar("estoque", { id: PRE + "est2", nome: "Bloco cerâmico 14x19x39", categoria: "outros", unidade: "un", saldo: 3100, estoqueMin: 500, custoUnit: 2.28, obraId: obraId, localizacao: "Pátio", obs: "" });
      salvar("estoque", { id: PRE + "est3", nome: "Vergalhão CA-50 10mm", categoria: "aco", unidade: "br", saldo: 18, estoqueMin: 40, custoUnit: 58.7, obraId: obraId, localizacao: "Baia coberta", obs: "Repor antes da laje." });
      salvar("estoque", { id: PRE + "est4", nome: "Capacete classe B", categoria: "epi", unidade: "un", saldo: 12, estoqueMin: 6, custoUnit: 25.9, obraId: obraId, localizacao: "Almoxarifado", obs: "" });
      salvar("estoque_mov", { id: PRE + "mov1", itemId: PRE + "est2", itemNome: "Bloco cerâmico 14x19x39", tipo: "entrada", qtd: 4200, custoUnit: 2.28, data: iso(diaUtil(1)), obraId: obraId });
      salvar("estoque_mov", { id: PRE + "mov2", itemId: PRE + "est2", itemNome: "Bloco cerâmico 14x19x39", tipo: "saida", qtd: 1100, custoUnit: 2.28, data: iso(diaUtil(0)), obraId: obraId });

      // ---------- 13) EPI (validade próxima acende o KPI) ----------
      salvar("epi", {
        id: PRE + "epi1", numero: "EPI-" + ano + "-OT1", data: iso(diaUtil(6)), colaboradorId: PRE + "col2",
        colaboradorNome: "Rosivaldo Ferreira", colaboradorFuncao: "Pedreiro", colaboradorCpf: "222.333.444-55",
        obraId: obraId, observacoes: "Kit de admissão na frente de alvenaria.",
        itens: [
          { epiId: "demo", nome: "Capacete classe B", ca: "31469", validade: iso(dias(hoje, 400)), quantidade: 1, valorUnit: 25.9 },
          { epiId: "demo", nome: "Luva de raspa", ca: "29895", validade: iso(dias(hoje, 45)), quantidade: 2, valorUnit: 12.5 },
          { epiId: "demo", nome: "Botina de segurança", ca: "27810", validade: iso(dias(hoje, 500)), quantidade: 1, valorUnit: 89.9 }
        ],
        valorTotal: 25.9 + 2 * 12.5 + 89.9
      });
      salvar("epi", {
        id: PRE + "epi2", numero: "EPI-" + ano + "-OT2", data: iso(diaUtil(2)), colaboradorId: PRE + "col4",
        colaboradorNome: "Ana Beatriz Souza", colaboradorFuncao: "Servente", colaboradorCpf: "444.555.666-77",
        obraId: obraId, observacoes: "",
        itens: [
          { epiId: "demo", nome: "Óculos de proteção incolor", ca: "34082", validade: iso(dias(hoje, 30)), quantidade: 1, valorUnit: 9.9 },
          { epiId: "demo", nome: "Protetor auricular plug", ca: "5674", validade: iso(dias(hoje, 200)), quantidade: 1, valorUnit: 3.5 }
        ],
        valorTotal: 9.9 + 3.5
      });

      // ---------- 14) Ponto / Faltas / Folha (encargos) ----------
      var comp = hoje.getFullYear() + "-" + pad2(hoje.getMonth() + 1); // mês de HOJE (renderPonto abre no mês corrente)
      salvar("ponto", { id: PRE + "pon1", competencia: comp, colaboradorId: PRE + "col1", colaboradorNome: "José Carlos Mendes", obraId: obraId, dias: 22, faltas: 0, horasExtras: 6, valor: 4200, status: "aberto", obs: "" });
      salvar("ponto", { id: PRE + "pon2", competencia: comp, colaboradorId: PRE + "col5", colaboradorNome: "Eng. Carla Rodrigues", obraId: obraId, dias: 22, faltas: 1, horasExtras: 0, valor: 8500, status: "aberto", obs: "" });
      salvar("faltas", { id: PRE + "fal1", colaboradorId: PRE + "col3", colaboradorNome: "Marcos Paulo Lima", data: iso(dias(new Date(semAtual + "T00:00:00"), 2)), motivo: "injustificada" }); // quarta da semana atual = falta "qua" da Folha Semanal
      salvar("faltas", { id: PRE + "fal2", colaboradorId: PRE + "col5", colaboradorNome: "Eng. Carla Rodrigues", data: iso(diaUtil(4)), motivo: "atestado" });
      salvar("faltas", { id: PRE + "fal3", colaboradorId: PRE + "col4", colaboradorNome: "Ana Beatriz Souza", data: iso(diaUtil(6)), motivo: "folga" });
      salvar("folha", { id: PRE + "fol1", competencia: comp, colaboradorId: PRE + "col1", obraId: obraId, salarioBase: 4200, encargosPct: 68, horasExtras: 180, descontos: 0, status: "lancada", custoTotal: Math.round(4200 + 4200 * 0.68 + 180) });
      salvar("folha", { id: PRE + "fol2", competencia: comp, colaboradorId: PRE + "col5", obraId: obraId, salarioBase: 8500, encargosPct: 68, horasExtras: 0, descontos: 0, status: "aberta", custoTotal: Math.round(8500 * 1.68) });

      // ---------- 15) Folha Semanal (diaristas + PIX) ----------
      var fsDias = { seg: 166, ter: 166, qua: 166, qui: 166, sex: 166 };
      salvar("fs_lancamentos", { id: PRE + "fs1", semana: semAtual, obraId: obraId, colaboradorId: PRE + "col2", nome: "Rosivaldo Ferreira", funcao: "Pedreiro", favorecido: "Rosivaldo Ferreira", chavePix: "34998222222", tipo: "diaria", dias: fsDias, faltas: [], he: 80, valor: 0, obs: "", usarValor: false });
      salvar("fs_lancamentos", { id: PRE + "fs2", semana: semAtual, obraId: obraId, colaboradorId: PRE + "col3", nome: "Marcos Paulo Lima", funcao: "Pedreiro", favorecido: "Marcos Paulo Lima", chavePix: "34998333333", tipo: "diaria", dias: { seg: 166, ter: 166, qui: 166, sex: 166 }, faltas: ["qua"], he: 0, valor: 0, obs: "Falta qua (injustificada).", usarValor: false });
      salvar("fs_lancamentos", { id: PRE + "fs3", semana: semAtual, obraId: obraId, colaboradorId: PRE + "col4", nome: "Ana Beatriz Souza", funcao: "Servente", favorecido: "Ana Beatriz Souza", chavePix: "34998444444", tipo: "diaria", dias: { seg: 120, ter: 120, qua: 120, qui: 120, sex: 120 }, faltas: [], he: 0, valor: 0, obs: "", usarValor: false });
      salvar("fs_lancamentos", { id: PRE + "fs4", semana: semAtual, obraId: obraId, colaboradorId: "", nome: "Gesso & Cia (empreita)", funcao: "Gesseiro", favorecido: "Gesso & Cia", chavePix: "gesso@pix.com.br", tipo: "empreita", dias: {}, faltas: [], he: 0, valor: 1450, obs: "Forro do escritório do canteiro.", usarValor: false });
      salvar("fs_pagamentos", { id: PRE + "fsp1", semana: semAtual, favKey: "ROSIVALDO FERREIRA|34998222222", pago: true, em: new Date().toISOString(), valor: 166 * 5 + 80, obras: [obraId] });

      // ---------- 16) Frota (+ custos com espelho no financeiro) ----------
      salvar("frota", { id: PRE + "fro1", nome: "Caminhão Mercedes Atego", tipo: "caminhao", placa: "RTZ-2B47", modelo: "Mercedes-Benz Atego 1719", ano: "2019", posse: "proprio", valor: 285000, status: "em_uso", obraId: obraId, km: 148230, obs: "" });
      salvar("frota", { id: PRE + "fro2", nome: "Betoneira 400L", tipo: "equipamento", placa: "PAT-BET01", modelo: "CSM 400L", ano: "2022", posse: "proprio", valor: 4800, status: "em_uso", obraId: obraId, km: 0, obs: "" });
      salvar("frota_mov", { id: PRE + "fmv1", frotaId: PRE + "fro1", frotaNome: "Caminhão Mercedes Atego", tipo: "combustivel", valor: 620, km: 148230, data: iso(diaUtil(2)), obraId: obraId, descricao: "Diesel S10 — 200 L" });
      salvar("frota_mov", { id: PRE + "fmv2", frotaId: PRE + "fro2", frotaNome: "Betoneira 400L", tipo: "manutencao", valor: 260, km: 0, data: iso(diaUtil(4)), obraId: obraId, descricao: "Troca de correia e revisão" });

      // ---------- 17) Patrimônio ----------
      salvar("patrimonio", { id: PRE + "pat1", descricao: "Notebook Dell Latitude (engenharia)", categoria: "informatica", numeroPatrimonio: "PAT-OT01", valorAquisicao: 6800, dataAquisicao: iso(dias(hoje, -730)), depreciacaoAnual: 20, estado: "bom", obraId: "", localizacao: "Escritório central", obs: "" });
      salvar("patrimonio", { id: PRE + "pat2", descricao: "Andaime fachadeiro 60 m²", categoria: "equipamento", numeroPatrimonio: "PAT-OT02", valorAquisicao: 14500, dataAquisicao: iso(dias(hoje, -365)), depreciacaoAnual: 10, estado: "bom", obraId: obraId, localizacao: "OBRA TESTE ORÇAPRO", obs: "" });

      // ---------- 18) Financeiro (receitas + despesas conectadas aos módulos) ----------
      var fin = [
        { id: PRE + "fin1", data: iso(dias(iniObra, 2)), tipo: "receita", desc: "Entrada do contrato CT-" + ano + "-OT1 (20%)", categoria: "obra", valor: Math.round(precoVenda * 0.2), status: "pago", fornecedor: "Construtora Horizonte Ltda", contratoId: PRE + "con" },
        { id: PRE + "fin2", data: iso(dias(iniObra, 35)), tipo: "receita", desc: "Medição 01ª — líquido (retenção 5%)", categoria: "medicao", valor: Math.round(med1v * 0.95), status: "pago", fornecedor: "Construtora Horizonte Ltda", contratoId: PRE + "con" },
        { id: PRE + "fin3", data: iso(diaUtil(1)), tipo: "despesa", desc: "PC-" + ano + "-OT1 — blocos e argamassa (Depósito São José)", categoria: "material", valor: Math.round(4200 * 2.28 + 90 * 13.9), status: "pendente", fornecedor: "Depósito São José", formaPgto: "parcelado" },
        { id: PRE + "fin4", data: iso(dias(iniObra, 20)), tipo: "despesa", desc: "Concreto usinado FCK 25 — fundações", categoria: "material", valor: 17360, status: "pago", fornecedor: "Concreteira Forte" },
        { id: PRE + "fin5", data: iso(diaUtil(1)), tipo: "despesa", desc: "Folha " + comp + " — José Carlos Mendes (encargos)", categoria: "mao_obra", valor: Math.round(4200 + 4200 * 0.68 + 180), status: "pago", fornecedor: "" },
        { id: PRE + "fin6", data: iso(diaUtil(2)), tipo: "despesa", desc: "Combustível - Caminhão Mercedes Atego", categoria: "equipamento", valor: 620, status: "pago", fornecedor: "Caminhão Mercedes Atego" },
        { id: PRE + "fin7", data: iso(diaUtil(4)), tipo: "despesa", desc: "Manutenção - Betoneira 400L", categoria: "equipamento", valor: 260, status: "pago", fornecedor: "Betoneira 400L" },
        { id: PRE + "fin8", data: iso(diaUtil(5)), tipo: "despesa", desc: "Taxas e ART da obra", categoria: "impostos", valor: 890, status: "pago", fornecedor: "CREA-MG" },
        { id: PRE + "fin9", data: iso(dias(hoje, 12)), tipo: "receita", desc: "Medição 02ª (prevista — aguardando aprovação)", categoria: "medicao", valor: Math.round(precoVenda * 0.14 * 0.95), status: "pendente", fornecedor: "Construtora Horizonte Ltda", contratoId: PRE + "con" }
      ];
      fin.forEach(function (f) { f.obraId = obraId; f.etapaId = ""; f.obs = ""; salvar("financeiro", f); });

      // ---------- 19) Fiscal (NF-e entrada + saída) ----------
      salvar("fiscal", { id: PRE + "nf1", numero: "48213", serie: "1", tipo: "entrada", status: "emitida", naturezaOp: "Venda de mercadoria", parceiro: "Depósito São José", obraId: obraId, dataEmissao: iso(diaUtil(1)), valorProdutos: 10827, valorImpostos: 1245, valorTotal: 10827, chaveAcesso: "" });
      salvar("fiscal", { id: PRE + "nf2", numero: "126", serie: "1", tipo: "saida", status: "emitida", naturezaOp: "Prestação de serviço de construção", parceiro: "Construtora Horizonte Ltda", obraId: obraId, dataEmissao: iso(dias(iniObra, 35)), valorProdutos: Math.round(med1v * 0.95), valorImpostos: Math.round(med1v * 0.95 * 0.0865), valorTotal: Math.round(med1v * 0.95), chaveAcesso: "" });

      // ---------- 20) Centro de custo ----------
      salvar("centrocusto", { id: PRE + "cc1", codigo: "CC-OT1", nome: "OBRA TESTE ORÇAPRO", tipo: "direto", obraId: obraId, valorOrcado: precoVenda, obs: "Centro de custo da obra de demonstração." });

      return { obraId: obraId, precoVenda: precoVenda };
    },

    remover: function () {
      var chaves = ["clientes", "fornecedores", "colaboradores", "obras", "contratos", "medicoes", "lp_tarefas", "tarefas", "rdo", "requisicoes", "cotacoes", "compras", "estoque", "estoque_mov", "epi", "ponto", "faltas", "folha", "fs_lancamentos", "fs_pagamentos", "frota", "frota_mov", "patrimonio", "financeiro", "fiscal", "centrocusto"];
      var n = 0, e = eid();
      chaves.forEach(function (ch) {
        Store.listar(e, ch).forEach(function (r) {
          if (r && String(r.id).indexOf(PRE) === 0) { Store.excluir(e, ch, r.id); n++; }
        });
      });
      try { if (Store.obterOrcamento(e, PRE + "orc")) { Store.excluirOrcamento(e, PRE + "orc"); n++; } } catch (err) {}
      return n;
    }
  };

  global.ObraDemo = ObraDemo;
})(typeof window !== "undefined" ? window : this);
