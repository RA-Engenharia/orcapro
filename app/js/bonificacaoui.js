/* =====================================================================
 * bonificacaoui.js — A TELA de "Produtividade e bonificação"
 *
 * O motor está em js/bonificacao.js; aqui só há tela, gravação e a fiação
 * com o diário (RDO) e o Cronograma. Mora DENTRO do módulo `prodpremio`
 * (js/prodpremioui.js): mesmo menu, mesma permissão sob demanda. O modelo
 * antigo (medição diária por serviço) continua existindo e abre pelo menu
 * "Mais", só para a gestão e só se a configuração antiga tiver serviços.
 *
 * DADOS (nenhuma entidade nova; tudo já sincroniza):
 *   pp_config.bonificacao   obras, tipos, pessoas, metas, regras
 *   pp_fech  (ppb_<mês>)    fechamento homologado, com a cópia das metas
 *   rdo.presenca / rdo.etapasDia  o que o diário passa a registrar
 *
 * ⚠ QUEM VÊ DINHEIRO: só `Auth.podeGestaoPremio()` (admin ou usuário marcado).
 *   Quem lança o diário (`rdo`) entra no módulo, vê a nota do mês, as metas e
 *   o andamento, e NUNCA um R$, um fator ou uma tabela por pessoa. A guarda
 *   está em CADA função que grava ou mostra valor, não só no botão escondido:
 *   o dispatcher de ações é global e o `data-gacao` chega por qualquer caminho.
 * ⚠ NOME DE TRABALHADOR NÃO VAI AO CLIENTE: `presenca` nasce aqui e nunca é
 *   copiada para o Portal (RDO.paraPortal é allowlist) nem para o diário
 *   duplicado (RDO.basearEm). tools/test-cliente-nao-vaza.js prova os dois.
 * ⚠ NADA AQUI LANÇA NO FINANCEIRO. A saída é o relatório (Excel) para o
 *   pagamento. Lançar dinheiro exigiria o carimbo docTipo/docId e as portas da
 *   skill `dinheiro`: é outra entrega.
 * ===================================================================== */
(function (global) {
  "use strict";

  if (typeof global.Gestao === "undefined" || typeof global.Bonificacao === "undefined") return;

  var G = global.Gestao, K = G.ui, B = global.Bonificacao, M = global.Modulo, PP = global.ProdPremio;
  /* uma constante por linha, terminando em `;` — formato que o tools/test-v12-escopo.js reconhece como USO */
  var ENT_CFG = "pp_config";
  var ENT_FECH = "pp_fech";
  var ID_CFG = "pp-config";
  var MODULO = "prodpremio";

  function eid() { return (typeof Auth !== "undefined" && Auth.empresaId) ? Auth.empresaId() : "default"; }
  function esc(s) { return Util.esc(s == null ? "" : String(s)); }
  function arr(x) { return Array.isArray(x) ? x : []; }
  /* ⚠ DATA E MÊS LOCAIS, nunca `toISOString()`: das 21h à meia-noite o ISO já está em amanhã */
  function hoje() { var d = new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  function compHoje() { return hoje().slice(0, 7); }
  function moedaC(c) { return c == null ? "" : Util.fmtMoeda(c / 100); }
  function pctTxt(v) { return v == null ? "" : Util.fmtNum(v, v % 1 ? 1 : 0) + " %"; }
  function diaBr(d) { return d ? Util.fmtDia(d) : ""; }
  var MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  function mesExtenso(comp) { var m = /^(\d{4})-(\d{2})$/.exec(String(comp || "")); return m ? MESES[+m[2] - 1] + " de " + m[1] : String(comp || ""); }
  function fmtFator(f) { return f == null ? "" : String(Math.round(f * 100) / 100).replace(".", ","); }

  /* ---------------- dados e permissão ---------------- */
  function cfg() { var l = K.lista(ENT_CFG); return l.length ? l[0] : null; }
  function bonif() { var c = cfg(); return c && c.bonificacao && typeof c.bonificacao === "object" ? c.bonificacao : null; }
  function podeGestao() { return typeof Auth !== "undefined" && Auth.podeGestaoPremio ? !!Auth.podeGestaoPremio() : false; }
  function exigir(cond, msg) { if (!cond) { UI.toast(msg, "erro"); return false; } return true; }
  function exigirGestao(msg) { return exigir(podeGestao(), msg || "Só quem tem a permissão de ver valores e fechar a bonificação faz isto."); }
  function quem() {
    var u = (typeof Auth !== "undefined" && Auth.usuario && Auth.usuario()) || {};
    return (typeof Auth !== "undefined" && Auth.nome && Auth.nome()) || u.email || u.usuarioId || "";
  }
  /* grava SÓ o campo `bonificacao` do registro único: o resto da configuração antiga fica como está */
  function salvarBonif(b) {
    var c = cfg() || { id: ID_CFG };
    c.id = c.id || ID_CFG;
    c.bonificacao = b;
    return Store.salvar(eid(), ENT_CFG, c);
  }
  function fechamentos() { return K.lista(ENT_FECH); }
  function travadoMes(comp) { return B.mesHomologado(fechamentos(), comp); }
  /* ⚠ GUARDA EM FUNÇÃO: mês homologado não aceita mudança de meta nem de valor daquele mês.
     A porta é reabrir (só a gestão), com histórico. */
  function exigirAberto(comp) {
    if (travadoMes(comp)) { UI.toast(B.MSG_MES_TRAVADO, "erro"); return false; }
    return true;
  }

  G._bnAba = G._bnAba || "resumo";
  G._bnComp = G._bnComp || "";
  G._bnObra = G._bnObra || "";
  G._bnVer = G._bnVer || "";
  G._bnDraft = null;
  G._bnCal = {};

  /* ---------------- calendário e plano da obra ---------------- */
  function calDeParams(p) {
    p = p || {};
    var dias = parseInt(p.diasUteisSemana, 10), fer = [];
    dias = dias === 6 || dias === 7 ? dias : 5;
    if (p.descontarFeriados !== false && typeof Feriados !== "undefined" && Feriados.entre) {
      var y = new Date().getFullYear();
      try { fer = Feriados.entre(y - 2, y + 3, p.feriadosExtras, p.feriadosFacultativos !== false).lista.map(function (f) { return f.data; }); } catch (e) { fer = []; }
    }
    return { diasSemana: dias, feriados: fer };
  }
  /* o calendário vem dos params do PLANO da obra (diasUteisSemana, feriadosExtras); sem plano, segunda a sexta + feriados nacionais */
  function calDaObra(obraId) {
    var c = G._bnCal[obraId];
    if (c && Date.now() - c.em < 30000) return c.cal;
    var params = {};
    try {
      if (obraId && typeof App !== "undefined" && App._cronoOrcDaObra && typeof Cronograma !== "undefined" && Cronograma._params) {
        var oP = App._cronoOrcDaObra(obraId);
        if (oP) params = Cronograma._params(oP);
      }
    } catch (e) { params = {}; }
    var cal = calDeParams(params);
    G._bnCal[obraId] = { em: Date.now(), cal: cal };
    return cal;
  }
  /* ⚠ o Cronograma devolve `dataInicio`/`dataFim` como Date (não como texto): sem esta conversão a lista
     do "Trazer etapas" saía vazia, porque nenhuma data passava na conferência. Data LOCAL, não toISOString. */
  function dataIso(d) {
    if (d && typeof d.getFullYear === "function") return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
    return String(d == null ? "" : d).slice(0, 10);
  }
  /* ⚠ `dataFim` do Cronograma é o dia SEGUINTE ao último dia da tarefa (o fim é exclusivo: uma tarefa de 1 dia
     que começa numa sexta termina na segunda). Prazo em dias úteis e "fim" mostrado na tela saem do ÚLTIMO dia
     útil antes dele; contar até o próprio dataFim somaria um dia a toda meta. */
  function ultimoDia(fimExclusivo, inicio, cal) {
    var ms = Date.parse(fimExclusivo + "T12:00:00Z"), ini = Date.parse(inicio + "T12:00:00Z"), k = 0;
    if (isNaN(ms) || isNaN(ini)) return fimExclusivo;
    ms -= 86400000;
    while (ms > ini && !B.ehDiaUtil(new Date(ms).toISOString().slice(0, 10), cal) && k++ < 400) ms -= 86400000;
    return new Date(Math.max(ms, ini)).toISOString().slice(0, 10);
  }
  /* etapas e tarefas do plano de execução, com as datas do plano */
  /* ⚠ no Quiosque o nome da etapa já começa com o número ("04 Fundação..."): somar o `numero` do
     cronograma daria "4 04 Fundação". Número só entra em nome que não traz o seu. */
  function rotEtapa(it) { return (it.numero && !/^\d/.test(String(it.nome || "")) ? it.numero + " " : "") + it.nome; }
  function etapasDoPlano(obraId) {
    var out = { ok: false, erro: "", itens: [], cal: calDaObra(obraId) };
    try {
      if (typeof App === "undefined" || !App._cronoOrcDaObra || typeof Cronograma === "undefined") { out.erro = "O Cronograma não carregou neste aparelho."; return out; }
      var oP = App._cronoOrcDaObra(obraId);
      if (!oP) { out.erro = "Esta obra ainda não tem plano de execução no Cronograma."; return out; }
      var r = Cronograma.estimar(oP, null, { eap: true });
      var nos = arr(r && r.atividades).filter(function (n) { return n && (n.tipo === "etapa" || n.tipo === "subetapa"); });
      if (!nos.length) nos = arr(r && r.etapas);
      nos.forEach(function (n) {
        if (!n || n.id == null) return;
        var ini = dataIso(n.dataInicio), fim = dataIso(n.dataFim);
        var fimN = B.dataOk(ini) && B.dataOk(fim) ? ultimoDia(fim, ini, out.cal) : fim;
        out.itens.push({ noId: String(n.id), paiId: n.tipo === "subetapa" ? String(n.paiId || n.etapaId || "") : "", numero: n.numero || "", nome: n.nome || String(n.id), tipo: n.tipo === "subetapa" ? "Subetapa" : "Etapa",
          inicio: ini, fim: fimN, dias: Math.max(1, B.diasUteis(ini, fimN, out.cal)), terceiro: false });
      });
      arr(r && r.extras).forEach(function (x) {
        if (!x || x.id == null) return;
        var ini2 = dataIso(x.dataInicio), fim2 = dataIso(x.dataFim);
        /* tarefa de terceiro ou do cliente não é da equipe: vem desmarcada */
        var terc = !!x.resp && /terceir|client/i.test(String(x.resp));
        var fimX = B.dataOk(ini2) && B.dataOk(fim2) ? ultimoDia(fim2, ini2, out.cal) : fim2;
        out.itens.push({ noId: String(x.id), numero: x.numero || "", nome: x.nome || String(x.id), tipo: "Tarefa", inicio: ini2, fim: fimX,
          dias: Math.max(1, B.diasUteis(ini2, fimX, out.cal)), terceiro: terc, resp: x.resp || "" });
      });
      out.itens = out.itens.filter(function (i) { return B.dataOk(i.inicio) && B.dataOk(i.fim); });
      out.ok = true;
    } catch (e) { out.erro = "Não consegui ler o plano da obra: " + String((e && e.message) || e); }
    return out;
  }

  /* ---------------- a apuração do mês, montada com os dados vivos ---------------- */
  /* etapa com subetapas: { "obra|etapa": [ids das subetapas] }, para a meta da etapa fechar quando TODAS fecham.
     Só consulta o plano das obras que têm meta, e guarda por 30 s (o plano custa um `estimar`). */
  function folhasDaObra(obraId) {
    var c = G._bnFolhas && G._bnFolhas[obraId];
    if (c && Date.now() - c.em < 30000) return c.mapa;
    var mapa = {};
    try {
      etapasDoPlano(obraId).itens.forEach(function (it) { if (it.tipo === "Subetapa" && it.paiId) (mapa[obraId + "|" + it.paiId] = mapa[obraId + "|" + it.paiId] || []).push(it.noId); });
    } catch (e) { mapa = {}; }
    G._bnFolhas = G._bnFolhas || {}; G._bnFolhas[obraId] = { em: Date.now(), mapa: mapa };
    return mapa;
  }
  function estado(comp) {
    var b = bonif();
    if (!b) return null;
    var avancos = {};
    arr(b.obras).forEach(function (o) {
      try {
        if (typeof CronoBase !== "undefined" && typeof App !== "undefined" && App._cronoListaCrono) avancos[o] = CronoBase.avanco(App._cronoListaCrono(o), o);
      } catch (e) { avancos[o] = null; }
    });
    var colabs = K.lista("colaboradores");
    var cal = calDaObra(arr(b.obras)[0]);
    var folhas = {};
    arr(b.obras).forEach(function (o) { if (arr(b.metas).some(function (m) { return m && m.obraId === o; })) { var f = folhasDaObra(o); for (var k in f) folhas[k] = f[k]; } });
    var ap = B.apurar({ config: b, rdos: K.lista("rdo"), avancos: avancos, folhas: folhas, comp: comp, hoje: hoje(), cal: cal,
      colaboradores: colabs.map(function (c) { return { id: c.id, nome: c.nome, admissao: c.admissao }; }) });
    return { b: b, ap: ap, cal: cal, colabs: colabs, comp: comp, fech: travadoMes(comp) };
  }
  function obraNome(id) { var o = Store.obter(eid(), "obras", id); return (o && o.nome) || id; }
  function situacaoPilula(s) {
    var tom = { fora: "neutro", antecipada: "ok", no_prazo: "ok", atrasada: "erro", vencida: "erro", em_andamento: "info", sem_prazo: "alerta" }[s.estado] || "neutro";
    var txt = B.ROTULO_SITUACAO[s.estado] || s.estado;
    return M.pilula(txt, tom) + (s.aguardando ? " " + M.pilula("diário aguardando aprovação", "alerta") : "");
  }

  /* ================================================================ TELA */
  var renderAntigo = G.renderProdPremio;
  G._renderProdPremioAntigo = renderAntigo;

  G.renderProdPremio = function () {
    var gest = podeGestao(), b = bonif(), c = cfg();
    if (!G._bnComp) G._bnComp = compHoje();
    /* o modelo antigo: a ENTRADA no menu Mais é só da gestão e só se a configuração dele tiver serviços; a tela,
       uma vez pedida (G._bnVer), abre para a gestão mesmo sem serviço (é por ela que a configuração antiga se importa) */
    var temAntigo = !!(c && arr(c.servicos).length);
    if (G._bnVer === "antigo" && gest && typeof renderAntigo === "function") {
      return M.aviso({ tom: "info", titulo: "Medição diária por serviço.", texto: "Este é o modelo anterior, que continua funcionando.",
        acaoHtml: '<button class="btn sm" data-gacao="bn-voltar">Voltar para a bonificação</button>' }) + renderAntigo.call(G);
    }
    G._bnVer = "";
    var obras = b ? arr(b.obras) : [];
    if (obras.length && obras.indexOf(G._bnObra) < 0) G._bnObra = obras[0];
    var abas = [["resumo", "Resumo do mês"], ["metas", "Metas da obra"]];
    if (gest) { abas.push(["salario", "Salário e fatores"]); abas.push(["fechamento", "Fechamento"]); }
    if (!abas.some(function (a) { return a[0] === G._bnAba; })) G._bnAba = "resumo";

    var acoes = [];
    if (gest && b) acoes.push('<button class="btn" data-gacao="bn-obras">Obras da bonificação</button>');
    if (gest && temAntigo) acoes.push('<button class="btn" data-gacao="bn-antigo">Medição diária por serviço</button>');
    var html = M.cab({ iconeHtml: K.svg("prodpremio", 22), titulo: "Produtividade e bonificação",
      sub: b ? "Metas por etapa, presença e bonificação do mês" : "Bonificação por função e por metas de etapa",
      obraHtml: obras.length ? '<select id="bn-obra" data-gacao="bn-obra" aria-label="Obra">' + K.optsRec(obras.map(function (o) { return { id: o, nome: obraNome(o) }; }), "nome", G._bnObra, "Obra") + "</select>" : "",
      acoes: acoes, primariaHtml: b ? '<button class="btn primary" data-gacao="bn-abrir-diario">Abrir o diário de hoje</button>' : "" });

    if (!b) {
      return html + M.secao({ corpoHtml: gest
        ? M.vazio({ icone: "grafico", titulo: "A bonificação ainda não foi configurada",
            texto: "Escolha a obra, defina os tipos de bonificação e o salário de cada pessoa, e traga as etapas do cronograma como metas.",
            acaoHtml: '<button class="btn primary" data-gacao="bn-comecar">Começar a configurar</button>' })
        : M.vazio({ icone: "grafico", titulo: "A bonificação ainda não foi configurada", texto: "Peça a quem cuida da gestão para configurar." }) });
    }
    html += M.abas(abas.map(function (a) { return { id: a[0], rotulo: a[1], ativa: a[0] === G._bnAba, attrs: 'data-gacao="bn-aba"' }; }));
    var st = estado(G._bnComp);
    if (G._bnAba === "metas") return html + _metas(st);
    if (G._bnAba === "salario") return html + _salario(st);
    if (G._bnAba === "fechamento") return html + _fechamento(st);
    return html + _resumo(st);
  };

  function filtroMes() {
    return M.filtros([K.campo("Mês", '<input id="bn-comp" type="month" value="' + esc(G._bnComp) + '">')]);
  }

  /* ---------- RESUMO DO MÊS ---------- */
  function _resumo(st) {
    var ap = st.ap, n = ap.nota, gest = podeGestao(), itens = [];
    /* ⚠ MÊS HOMOLOGADO MOSTRA O QUE FOI CONGELADO, não a conta de hoje. Se o resumo seguisse vivo, a tela do
       Resumo e a do Fechamento diriam números diferentes para o mesmo mês pago. */
    var cong = st.fech && st.fech.estado === "homologado" ? st.fech : null;
    if (cong) {
      var mc = arr(cong.metas).filter(function (m) { return !m.fora; });
      n = { total: mc.length, atingidas: mc.filter(function (m) { return m.atingida; }).length, abertas: 0, fora: arr(cong.metas).length - mc.length, notaPct: cong.notaPct };
      ap = { nota: n, totalCent: cong.totalCent, pessoasPendentes: 0, linhas: arr(cong.linhas), semDiario: st.ap.semDiario, presenca: { aguardando: 0 }, conclusoes: { aguardando: {} }, semMeta: false };
    }
    function add(texto, gacao, rotulo, attrs) { itens.push({ texto: texto, gacao: gacao, rotulo: rotulo, attrs: attrs || "" }); }
    if (gest) {
      ap.linhas.filter(function (l) { return l.pendencias.length; }).slice(0, 4).forEach(function (l) {
        add(l.nome + ": " + l.pendencia + ".", "bn-aba", "Corrigir", 'data-aba="salario"');
      });
      if (ap.pessoasPendentes > 4) add("Mais " + (ap.pessoasPendentes - 4) + " pessoa(s) com pendência.", "bn-aba", "Ver todas", 'data-aba="salario"');
      if (!arr(st.b.pessoas).filter(function (p) { return p && p.ativo !== false; }).length) add("Nenhuma pessoa participa da bonificação ainda.", "bn-aba", "Escolher pessoas", 'data-aba="salario"');
    }
    if (ap.semMeta) add("Este mês não tem nenhuma meta com prazo nele. A bonificação de metas fica em zero.", "bn-aba", "Ver as metas", 'data-aba="metas"');
    if (ap.presenca.aguardando) add(ap.presenca.aguardando + " diário(s) com presença esperando aprovação. Só entram na conta depois de aprovados.", "bn-ir-diarios", "Abrir os diários");
    var aguard = Object.keys(ap.conclusoes.aguardando).length;
    if (aguard) add(aguard + " etapa(s) dada(s) como concluída(s) em diário que ainda não foi aprovado.", "bn-ir-diarios", "Abrir os diários");
    if (ap.semDiario.lista.length) add(ap.semDiario.lista.length + " dia(s) útil(eis) do mês sem diário.", "bn-abrir-diario", "Abrir o diário de hoje");
    var html = filtroMes();
    if (cong) {
      html = M.aviso({ tom: "ok", titulo: "Mês homologado.", texto: "Os valores abaixo são os congelados no fechamento de " + (Util.fmtData(cong.homologadoEm) || "") + ". Mudanças feitas depois não aparecem aqui até reabrir o mês." }) + html;
    } else if (itens.length) {
      html = M.aviso({ tom: "alerta", titulo: "O que falta para fechar o mês",
        textoHtml: '<ul class="bn-falta" style="margin:6px 0 0 0;padding:0;list-style:none">' + itens.map(function (i) {
          return '<li style="display:flex;gap:12px;align-items:center;justify-content:space-between;padding:4px 0"><span>' + esc(i.texto) + "</span>" +
            '<button class="btn sm" data-gacao="' + i.gacao + '" ' + i.attrs + ">" + esc(i.rotulo) + "</button></li>";
        }).join("") + "</ul>" }) + html;
    }
    var k = [
      { rotulo: "Metas atingidas", valor: n.total ? n.atingidas + " de " + n.total : "Sem metas", sub: n.abertas ? n.abertas + " ainda dentro do prazo" : (n.fora ? n.fora + " fora da conta" : ""), tom: n.total && n.atingidas === n.total ? "pos" : "info", id: "bn-k-metas" },
      { rotulo: "Nota do mês", valor: n.notaPct == null ? "Sem nota" : pctTxt(n.notaPct), sub: n.abertas ? "ainda pode subir" : (n.notaPct == null ? "mês sem meta" : "fechada"), tom: n.notaPct != null && n.notaPct >= 100 ? "pos" : "info", id: "bn-k-nota" }
    ];
    if (gest) k.push({ rotulo: "Total a pagar", valor: ap.totalCent == null ? "Pendente" : moedaC(ap.totalCent), sub: ap.pessoasPendentes ? ap.pessoasPendentes + " pessoa(s) com pendência" : "soma de quem está completo", tom: ap.pessoasPendentes ? "alerta" : "info", id: "bn-k-total" });
    k.push({ rotulo: "Dias sem diário", valor: String(ap.semDiario.lista.length), sub: ap.semDiario.semAprovado.length ? ap.semDiario.semAprovado.length + " com diário não aprovado" : "dias úteis até ontem", tom: ap.semDiario.lista.length ? "alerta" : "info", id: "bn-k-dias" });
    html += M.kpis(k);
    html += M.secao({ titulo: "Metas de " + mesExtenso(st.comp), sub: n.total ? n.atingidas + " de " + n.total + " metas atingidas. Meta aberta conta na divisão e a nota sobe quando ela for entregue." : "",
      corpoHtml: cong ? _tabelaMetasCongeladas(cong) : _tabelaMetasMes(st) });
    if (gest) {
      html += M.secao({ titulo: "Por pessoa", sub: "Valores do mês pelo que está aprovado até agora.", id: "bn-resumo-pessoas",
        corpoHtml: ap.linhas.length ? _tabelaFech(B.linhasRelatorio(ap), ap.totalCent, true) : '<p class="muted" style="margin:0">Nenhuma pessoa participa ainda.</p>' });
    }
    return html;
  }
  function _tabelaMetasCongeladas(f) {
    var it = arr(f.metas);
    if (!it.length) return '<p class="muted" style="margin:0">Nenhuma meta com prazo neste mês.</p>';
    return '<table class="tbl" id="bn-tab-metas-mes"><thead><tr><th>ETAPA</th><th>ENTREGAR ATÉ</th><th>ENTREGUE EM</th><th>SITUAÇÃO</th></tr></thead><tbody>' + it.map(function (m) {
      return "<tr><td>" + esc(m.nome) + "</td><td>" + esc(diaBr(m.limite)) + "</td><td>" + esc(diaBr(m.entregueEm)) + "</td><td>" + situacaoPilula({ estado: m.estado }) + "</td></tr>";
    }).join("") + "</tbody></table>";
  }
  function _tabelaMetasMes(st) {
    var it = st.ap.nota.itens;
    if (!it.length) return '<p class="muted" style="margin:0">Nenhuma meta com prazo neste mês.</p>';
    return '<table class="tbl" id="bn-tab-metas-mes"><thead><tr><th>ETAPA</th><th>ENTREGAR ATÉ</th><th>ENTREGUE EM</th><th>SITUAÇÃO</th></tr></thead><tbody>' + it.map(function (x) {
      return "<tr><td>" + esc(x.meta.nome) + "</td><td>" + esc(diaBr(x.sit.limite)) + "</td><td>" + esc(diaBr(x.sit.entregueEm)) + "</td><td>" + situacaoPilula(x.sit) + "</td></tr>";
    }).join("") + "</tbody></table>";
  }

  /* ---------- METAS DA OBRA ---------- */
  function _metas(st) {
    var gest = podeGestao(), obra = G._bnObra, ap = st.ap;
    var lista = arr(st.b.metas).filter(function (m) { return m && m.obraId === obra; }).sort(function (a, b) { return a.limite < b.limite ? -1 : (a.limite > b.limite ? 1 : 0); });
    var con = ap.conclusoes, n = ap.nota;
    var corpo;
    if (!lista.length) {
      corpo = M.vazio({ icone: "obra", titulo: "Esta obra ainda não tem metas", texto: gest ? "Traga as etapas do cronograma e defina o prazo de cada uma." : "A gestão define as metas a partir do cronograma.",
        acaoHtml: gest ? '<button class="btn primary" data-gacao="bn-trazer">Trazer etapas do cronograma</button>' : "" });
    } else {
      corpo = '<table class="tbl" id="bn-tab-metas"><thead><tr><th>ETAPA</th><th>INÍCIO</th><th class="num">PRAZO (DIAS)</th><th>ENTREGAR ATÉ</th><th>ENTREGUE EM</th><th>SITUAÇÃO</th>' + (gest ? "<th></th>" : "") + "</tr></thead><tbody>" + lista.map(function (m) {
        var k = m.obraId + "|" + m.noId, s = B.situacaoMeta(m, con.porNo[k] || null, hoje(), st.cal);
        if (!con.porNo[k] && con.aguardando[k]) s.aguardando = true;
        var acoes = gest ? '<td style="white-space:nowrap"><button class="btn sm" data-gacao="bn-meta-prazo" data-id="' + esc(m.id) + '">Mudar prazo</button> ' +
          '<button class="btn sm ghost" data-gacao="bn-meta-fora" data-id="' + esc(m.id) + '">' + (m.fora ? "Voltar para a conta" : "Tirar da conta") + "</button></td>" : "";
        return "<tr><td><b>" + esc(m.nome) + "</b>" + (m.ajustes && m.ajustes.length ? ' <span class="muted" title="' + esc(m.ajustes.map(function (a) { return diaBr(a.de) + " para " + diaBr(a.para) + ": " + a.motivo; }).join(" | ")) + '">(prazo mudado)</span>' : "") + "</td><td>" + esc(diaBr(m.inicio)) + '</td><td class="num">' + esc(m.dias) + "</td><td>" + esc(diaBr(m.limite)) +
          "</td><td>" + esc(diaBr(s.entregueEm)) + (s.diasUsados != null ? ' <span class="muted">em ' + s.diasUsados + (s.diasUsados === 1 ? " dia" : " dias") + "</span>" : "") + "</td><td>" + situacaoPilula(s) + "</td>" + acoes + "</tr>";
      }).join("") + "</tbody></table>";
    }
    var rodape = '<p id="bn-rodape-metas" style="margin:12px 0 0"><b>' + (n.total ? n.atingidas + " de " + n.total + " metas = " + pctTxt(n.notaPct) : "Sem metas em " + mesExtenso(st.comp)) + "</b>" +
      ' <span class="muted">em ' + esc(mesExtenso(st.comp)) + (n.abertas ? ". Metas abertas contam na divisão: a nota ainda pode subir." : ".") + "</span></p>";
    return filtroMes() + M.secao({ titulo: "Metas de " + esc(obraNome(obra)), sub: "A data limite fica gravada na meta. Mudar o cronograma não muda o prazo combinado.",
      acoesHtml: gest && lista.length ? '<button class="btn sm" data-gacao="bn-trazer">Trazer etapas do cronograma</button>' : "", corpoHtml: corpo + (lista.length ? rodape : "") });
  }

  /* ---------- SALÁRIO E FATORES ---------- */
  function novoId(pre) { return pre + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36); }
  function numTxt(x) { return x == null || x === "" ? "" : String(x).replace(".", ","); }
  function montarDraft(st) {
    var b = st.b, porPessoa = {};
    arr(b.pessoas).forEach(function (p) { if (p && p.colaboradorId != null) porPessoa[String(p.colaboradorId)] = p; });
    var comPresenca = {};
    Object.keys(st.ap.presenca.porPessoa).forEach(function (id) { var o = st.ap.presenca.porPessoa[id]; if (o.presentes || o.faltas || o.justificadas) comPresenca[id] = 1; });
    var pessoas = [];
    st.colabs.filter(function (c) { return !c.status || c.status === "ativo"; }).forEach(function (c) {
      var p = porPessoa[String(c.id)];
      var participaPadrao = !!(comPresenca[String(c.id)] || (c.obraId && arr(b.obras).indexOf(c.obraId) > -1));
      pessoas.push({ colaboradorId: String(c.id), nome: c.nome || String(c.id), carteira: p ? numTxt(p.carteira) : "", funcaoTipoId: p ? (p.funcaoTipoId || "") : "",
        adicionais: p ? arr(p.adicionais).slice() : [], metaCheia: p ? numTxt(p.metaCheia) : "", participa: p ? p.ativo !== false : participaPadrao });
    });
    /* quem está na configuração mas saiu do cadastro não some */
    arr(b.pessoas).forEach(function (p) {
      if (!p || p.colaboradorId == null) return;
      if (pessoas.some(function (x) { return x.colaboradorId === String(p.colaboradorId); })) return;
      pessoas.push({ colaboradorId: String(p.colaboradorId), nome: (p.nome || p.colaboradorId) + " (fora do cadastro ativo)", carteira: numTxt(p.carteira), funcaoTipoId: p.funcaoTipoId || "",
        adicionais: arr(p.adicionais).slice(), metaCheia: numTxt(p.metaCheia), participa: p.ativo !== false });
    });
    return { tipos: arr(b.tipos).map(function (t) { return { id: t.id, nome: t.nome || "", grupo: t.grupo === "adicional" ? "adicional" : "funcao", fator: numTxt(t.fator), fixo: numTxt(t.fixo) }; }), pessoas: pessoas };
  }
  function tiposDoDraft(d) {
    return d.tipos.map(function (t) { return { id: t.id, nome: t.nome, grupo: t.grupo, fator: t.fator === "" ? null : B.num(t.fator), fixo: t.fixo === "" ? null : B.num(t.fixo) }; });
  }
  function celulaFuncao(p, tipos) {
    var f = B.bonusFuncao({ carteira: p.carteira === "" ? null : B.num(p.carteira), funcaoTipoId: p.funcaoTipoId, adicionais: p.adicionais }, tipos);
    var ff = f.funcaoCent == null ? M.pilula("pendente", "alerta") : esc(fmtFator(f.fator)) + (f.fixoCent ? ' <span class="muted">+ fixo</span>' : "");
    var sf = f.funcaoCent == null ? M.pilula("pendente", "alerta") : esc(Util.fmtMoeda((Math.round((B.num(p.carteira) || 0) * 100) + f.funcaoCent) / 100));
    return { fator: ff, salario: sf, pend: f.pendencias.join("; ") };
  }
  /* campo de preenchimento dentro da tabela: borda visível, porque é aqui que o gestor digita */
  var CAMPO = "border:1px solid var(--linha-forte);border-radius:var(--raio-sm);padding:6px 8px;background:var(--surface);color:var(--texto);";
  function _salario(st) {
    if (!G._bnDraft) G._bnDraft = montarDraft(st);
    var d = G._bnDraft, tipos = tiposDoDraft(d);
    var tb = '<table class="tbl" id="bn-tab-tipos"><thead><tr><th>NOME</th><th>TIPO</th><th class="num">FATOR (1,20 = 20 % a mais)</th><th class="num">VALOR FIXO (R$)</th><th></th></tr></thead><tbody>' +
      d.tipos.map(function (t, i) {
        return "<tr><td><input data-bnt-nome=\"" + i + "\" value=\"" + esc(t.nome) + "\" style=\"width:100%;" + CAMPO + "\"></td>" +
          "<td><select data-bnt-grupo=\"" + i + "\"><option value=\"funcao\"" + (t.grupo === "funcao" ? " selected" : "") + ">Função</option><option value=\"adicional\"" + (t.grupo === "adicional" ? " selected" : "") + ">Adicional</option></select></td>" +
          "<td class=\"num\"><input data-bnt-fator=\"" + i + "\" inputmode=\"decimal\" value=\"" + esc(t.fator) + "\" placeholder=\"sem fator\" style=\"width:110px;text-align:right;" + CAMPO + "\"></td>" +
          "<td class=\"num\"><input data-bnt-fixo=\"" + i + "\" inputmode=\"decimal\" value=\"" + esc(t.fixo) + "\" placeholder=\"sem valor\" style=\"width:110px;text-align:right;" + CAMPO + "\"></td>" +
          "<td><button class=\"btn sm ghost\" data-gacao=\"bn-tipo-remover\" data-i=\"" + i + "\">Remover</button></td></tr>";
      }).join("") + "</tbody></table>";
    var funcs = d.tipos.filter(function (t) { return t.grupo === "funcao"; }), adics = d.tipos.filter(function (t) { return t.grupo === "adicional"; });
    var pb = '<table class="tbl" id="bn-tab-pessoas"><thead><tr><th>PARTICIPA</th><th>COLABORADOR</th><th class="num">CARTEIRA (R$)</th><th>FUNÇÃO</th><th>ADICIONAIS</th><th class="num">FATOR FINAL</th><th class="num">COM FUNÇÃO</th><th class="num">METAS, VALOR CHEIO (R$)</th></tr></thead><tbody>' +
      d.pessoas.map(function (p, i) {
        var c = celulaFuncao(p, tipos);
        return "<tr" + (p.participa ? "" : " style=\"opacity:.6\"") + "><td><input type=\"checkbox\" data-bnp-part=\"" + i + "\"" + (p.participa ? " checked" : "") + "></td>" +
          "<td style=\"white-space:nowrap\">" + esc(p.nome) + "</td>" +
          "<td class=\"num\"><input data-bnp-cart=\"" + i + "\" inputmode=\"decimal\" value=\"" + esc(p.carteira) + "\" placeholder=\"vazio\" style=\"width:96px;text-align:right;" + CAMPO + "\"></td>" +
          "<td><select data-bnp-func=\"" + i + "\"><option value=\"\">Escolher</option>" + funcs.map(function (t) { return "<option value=\"" + esc(t.id) + "\"" + (t.id === p.funcaoTipoId ? " selected" : "") + ">" + esc(t.nome || "(sem nome)") + "</option>"; }).join("") + "</select></td>" +
          "<td>" + (adics.length ? adics.map(function (t) { return "<label style=\"white-space:nowrap;margin-right:10px\"><input type=\"checkbox\" data-bnp-adic=\"" + i + "\" data-tipo=\"" + esc(t.id) + "\"" + (p.adicionais.indexOf(t.id) > -1 ? " checked" : "") + "> <span data-bn-tn=\"" + esc(t.id) + "\">" + esc(t.nome || "(sem nome)") + "</span></label>"; }).join("") : "<span class=\"muted\">nenhum</span>") + "</td>" +
          "<td class=\"num\" id=\"bn-ff-" + i + "\" title=\"" + esc(c.pend) + "\">" + c.fator + "</td><td class=\"num\" id=\"bn-sf-" + i + "\" title=\"" + esc(c.pend) + "\">" + c.salario + "</td>" +
          "<td class=\"num\"><input data-bnp-cheia=\"" + i + "\" inputmode=\"decimal\" value=\"" + esc(p.metaCheia) + "\" placeholder=\"vazio\" style=\"width:96px;text-align:right;" + CAMPO + "\"></td></tr>";
      }).join("") + "</tbody></table>";
    var todos = '<div class="flex" style="gap:12px;flex-wrap:wrap;align-items:flex-end;margin-bottom:10px">' +
      K.campo("Carteira de todos (R$)", '<input id="bn-todos-cart" inputmode="decimal" style="width:140px">') +
      '<button class="btn sm" data-gacao="bn-todos" data-campo="carteira">Aplicar a quem participa</button>' +
      K.campo("Metas, valor cheio de todos (R$)", '<input id="bn-todos-cheia" inputmode="decimal" style="width:140px">') +
      '<button class="btn sm" data-gacao="bn-todos" data-campo="cheia">Aplicar a quem participa</button></div>';
    var reduz = B.regras(st.b).reduzPorFalta;
    return M.secao({ titulo: "Tipos de bonificação", sub: "Cada tipo tem um fator ou um valor fixo, ou os dois. Fatores somam o que passa de 1: 1,20 e 1,10 viram 1,30. Fator abaixo de 1 não é aceito.",
        acoesHtml: '<button class="btn sm" data-gacao="bn-tipo-novo">Adicionar tipo</button>', corpoHtml: tb }) +
      M.secao({ titulo: "Pessoas", sub: "Os números mudam na hora. Vazio fica como pendência, nunca como zero.",
        corpoHtml: todos + pb + '<label style="display:block;margin-top:12px"><input type="checkbox" id="bn-reduz"' + (reduz ? " checked" : "") + '> Falta sem justificativa reduz a bonificação de metas na proporção dos dias</label>' +
          '<p class="muted" style="margin:6px 0 0">Falta justificada nunca reduz. Desligada, quem tem ao menos um dia presente recebe a bonificação de metas sem desconto.</p>' }) +
      '<div style="margin-top:16px"><button class="btn primary" id="bn-salvar" data-gacao="bn-salvar">Salvar</button></div>';
  }

  /* ---------- FECHAMENTO ---------- */
  function _tabelaFech(linhas, totalCent, resumido) {
    linhas = arr(linhas);
    if (!linhas.length) return M.vazio({ icone: "grafico", titulo: "Nada a fechar neste mês", texto: "Só entram pessoas marcadas como participantes, com diário aprovado." });
    return '<table class="tbl" id="bn-tab-fech"><thead><tr><th>COLABORADOR</th><th class="num">CARTEIRA</th><th>FUNÇÃO</th><th>METAS</th><th>PRESENÇA</th><th class="num">BONIFICAÇÃO DE METAS</th><th class="num">TOTAL</th>' + (resumido ? "" : "<th>PENDÊNCIA</th>") + "</tr></thead><tbody>" + linhas.map(function (l) {
      var pend = function (v) { return v == null ? M.pilula("pendente", "alerta") : moedaC(v); };
      return "<tr><td><b>" + esc(l.nome) + '</b></td><td class="num">' + pend(l.carteiraCent) + "</td><td>" + esc(l.funcao || "") + (l.funcaoCent != null ? '<br><span class="muted">mais ' + esc(moedaC(l.funcaoCent)) + "</span>" : "") + "</td><td>" + esc(l.metasTexto) + "</td><td>" + esc(l.presencaTexto) + " dias</td>" +
        '<td class="num">' + pend(l.metasCent) + '</td><td class="num"><b>' + pend(l.totalCent) + "</b></td>" + (resumido ? "" : "<td>" + esc(l.pendencia || l.aviso || "") + "</td>") + "</tr>";
    }).join("") + '<tr><td colspan="6"><b>Total</b></td><td class="num"><b>' + (totalCent == null ? M.pilula("pendente", "alerta") : moedaC(totalCent)) + "</b></td>" + (resumido ? "" : "<td></td>") + "</tr></tbody></table>";
  }
  function _historico(f) {
    var h = arr(f && f.historico);
    if (!h.length) return "";
    var rot = { homologar: "Homologado", reabrir: "Reaberto" };
    return M.secao({ titulo: "Histórico do fechamento", sub: "Nada é apagado: cada homologação e cada reabertura fica registrada.",
      corpoHtml: '<table class="tbl" id="bn-historico"><thead><tr><th>AÇÃO</th><th>POR</th><th>QUANDO</th><th class="num">PESSOAS</th><th class="num">TOTAL</th></tr></thead><tbody>' +
        h.slice().reverse().map(function (x) { return "<tr><td>" + esc(rot[x.acao] || x.acao) + "</td><td>" + esc(x.por || "") + "</td><td>" + esc(Util.fmtData(x.em) || "") + '</td><td class="num">' + esc(x.pessoas == null ? "" : x.pessoas) + '</td><td class="num">' + moedaC(x.totalCent || 0) + "</td></tr>"; }).join("") + "</tbody></table>" });
  }
  function _fechamento(st) {
    var html = filtroMes();
    if (!podeGestao()) return html + M.aviso({ tom: "alerta", titulo: "O fechamento é da gestão.", texto: "Quem lança o diário vê as metas e a nota do mês." });
    var f = Store.obter(eid(), ENT_FECH, B.idFechamento(st.comp)), ap = st.ap;
    var notaB = '<p class="muted" id="bn-nota-bruto" style="margin:10px 0 0">' + esc(NOTA_BRUTO) + "</p>";
    var botoes = '<button class="btn sm" data-gacao="bn-xlsx">Relatório para pagamento (Excel)</button> <button class="btn sm" data-gacao="bn-imprimir">Imprimir</button>';
    if (f && f.estado === "homologado") {
      html += M.aviso({ tom: "ok", titulo: "Mês homologado.", texto: "Por " + (f.homologadoPor || "") + " em " + (Util.fmtData(f.homologadoEm) || "") + ". Os valores abaixo estão congelados: mudar carteira, fator ou meta agora não altera este mês. Para alterar, reabra." });
      html += M.kpis([{ rotulo: "Nota do mês", valor: f.notaPct == null ? "Sem nota" : pctTxt(f.notaPct) }, { rotulo: "Pessoas", valor: String(arr(f.linhas).length) }, { rotulo: "Total do mês", valor: moedaC(f.totalCent), tom: "info", id: "bn-k-total-fech" }]);
      html += M.secao({ titulo: "Pagamento de " + mesExtenso(st.comp) + " (congelado)", acoesHtml: botoes + ' <button class="btn sm ghost" data-gacao="bn-reabrir">Reabrir</button>', corpoHtml: _tabelaFech(f.linhas, f.totalCent) + notaB });
      return html + _historico(f);
    }
    if (f && f.estado === "reaberto") html += M.aviso({ tom: "info", titulo: "Mês reaberto.", texto: "Reaberto por " + (f.reabertoPor || "") + " em " + (Util.fmtData(f.reabertoEm) || "") + ". Ajuste o que for preciso e homologue de novo; o histórico guarda as duas homologações." });
    if (ap.pessoasPendentes) html += M.aviso({ tom: "alerta", titulo: "Faltam dados para fechar.", texto: ap.pessoasPendentes + " pessoa(s) com pendência. Complete em Salário e fatores." });
    if (ap.semMeta) html += M.aviso({ tom: "alerta", titulo: "Mês sem meta.", texto: "A bonificação de metas está em zero. Para homologar, a gestão precisa confirmar." });
    html += M.kpis([{ rotulo: "Nota do mês", valor: ap.nota.notaPct == null ? "Sem nota" : pctTxt(ap.nota.notaPct), sub: ap.nota.abertas ? "ainda pode subir" : "" }, { rotulo: "Metas atingidas", valor: ap.nota.total ? ap.nota.atingidas + " de " + ap.nota.total : "Sem metas" },
      { rotulo: "Pessoas", valor: String(ap.linhas.length) }, { rotulo: "Total a pagar", valor: ap.totalCent == null ? "Pendente" : moedaC(ap.totalCent), tom: "info", id: "bn-k-total-fech" }]);
    html += M.secao({ titulo: "Pagamento de " + mesExtenso(st.comp) + " (ainda não homologado)", sub: "Nada é lançado no Financeiro: a saída é o relatório para o pagamento.",
      acoesHtml: botoes + ' <button class="btn sm primary" data-gacao="bn-homologar">Homologar mês</button>', corpoHtml: _tabelaFech(B.linhasRelatorio(ap), ap.totalCent) + notaB });
    return html + _historico(f);
  }

  /* ---------- EXCEL (o mesmo caminho do Blocok: ExcelOrc.ensureExcelJS) ---------- */
  var NOTA_BRUTO = "Valores brutos do combinado. Faltas na carteira, encargos e descontos ficam com a contabilidade.";
  function construirXlsx(ExcelJS, d) {
    var wb = new ExcelJS.Workbook(), NAVY = "FF0F2740", BRANCO = "FFFFFFFF", MOEDA = "R$ #,##0.00";
    var ws = wb.addWorksheet("Pagamento do mês");
    ws.addRow(["Bonificação: " + mesExtenso(d.comp) + (d.homologado ? "" : " (não homologado)")]).font = { bold: true, size: 13 };
    ws.addRow(["Rubrica: " + (d.rubrica || B.RUBRICA) + ". Nota do mês: " + (d.notaPct == null ? "sem metas" : pctTxt(d.notaPct))]);
    ws.addRow([NOTA_BRUTO]).font = { italic: true };
    ws.addRow([]);
    var cab = ws.addRow(["Colaborador", "Função", "Salário em carteira", "Bonificação de função", "Metas", "Presença (dias)", "Bonificação de metas", "Total", "Pendência"]);
    cab.eachCell(function (c) { c.font = { bold: true, color: { argb: BRANCO } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } }; });
    var v = function (c) { return c == null ? null : c / 100; };
    arr(d.linhas).forEach(function (l) {
      var r = ws.addRow([l.nome, l.funcao || "", v(l.carteiraCent), v(l.funcaoCent), l.metasTexto, l.presencaTexto, v(l.metasCent), v(l.totalCent), l.pendencia || ""]);
      [3, 4, 7, 8].forEach(function (i) { r.getCell(i).numFmt = MOEDA; });
    });
    var t = ws.addRow(["Total", "", "", "", "", "", "", v(d.totalCent), ""]);
    t.font = { bold: true }; t.getCell(8).numFmt = MOEDA;
    [30, 18, 20, 22, 12, 16, 22, 16, 40].forEach(function (w, i) { ws.getColumn(i + 1).width = w; });
    var w2 = wb.addWorksheet("Metas do mês");
    var c2 = w2.addRow(["Etapa", "Início", "Prazo (dias)", "Entregar até", "Entregue em", "Situação", "Na conta"]);
    c2.eachCell(function (c) { c.font = { bold: true, color: { argb: BRANCO } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } }; });
    arr(d.metas).forEach(function (m) { w2.addRow([m.nome, diaBr(m.inicio), m.dias, diaBr(m.limite), diaBr(m.entregueEm), B.ROTULO_SITUACAO[m.estado] || m.estado, m.fora ? "Não: " + (m.foraMotivo || "") : "Sim"]); });
    [34, 14, 12, 14, 14, 22, 30].forEach(function (w, i) { w2.getColumn(i + 1).width = w; });
    return wb;
  }
  G._bnXlsxConstruir = construirXlsx;

  /* ---------- dados do fechamento (vivo ou congelado) ---------- */
  function dadosFechamento(comp) {
    var f = Store.obter(eid(), ENT_FECH, B.idFechamento(comp));
    if (f && f.estado === "homologado") {
      return { comp: comp, homologado: true, linhas: arr(f.linhas), totalCent: f.totalCent, notaPct: f.notaPct,
        metas: arr(f.metas), rubrica: (bonif() || {}).rubrica };
    }
    var st = estado(comp), ap = st.ap;
    return { comp: comp, homologado: false, linhas: B.linhasRelatorio(ap), totalCent: ap.totalCent, notaPct: ap.nota.notaPct,
      metas: metasCopia(ap), rubrica: st.b.rubrica };
  }
  /* a cópia das metas do mês com a situação: é a PROVA que o fechamento guarda */
  function metasCopia(ap) {
    return ap.nota.itens.map(function (x) {
      var m = x.meta;
      return { id: m.id, obraId: m.obraId, noId: m.noId, nome: m.nome, inicio: m.inicio, dias: m.dias, limite: m.limite, fora: !!m.fora, foraMotivo: m.foraMotivo || "",
        ajustes: arr(m.ajustes).map(function (a) { return { de: a.de, para: a.para, motivo: a.motivo, por: a.por, em: a.em }; }),
        estado: x.sit.estado, atingida: !!x.sit.atingida, entregueEm: x.sit.entregueEm || "" };
    });
  }

  /* ================================================================ AÇÕES */
  function lerNumCampo(id) { var t = K.v(id); return t === "" ? null : B.num(t); }
  function lerDraft() {
    /* os campos já gravam no rascunho a cada tecla (wire); aqui só garante que o rascunho existe */
    return G._bnDraft;
  }

  G.registrarAcoes(MODULO, {
    "bn-aba": function (ds) { G._bnAba = ds.aba || "resumo"; if (G._bnAba !== "salario") G._bnDraft = null; App.render(); },
    "bn-obra": function (ds) { G._bnObra = ds && ds.value != null ? String(ds.value) : ""; App.render(); },
    "bn-voltar": function () { G._bnVer = ""; App.render(); },
    "bn-antigo": function () {
      if (!exigirGestao("Só quem vê valores da bonificação abre a medição por serviço.")) return;
      G._bnVer = "antigo"; App.render();
    },
    "bn-ir-diarios": function () { if (typeof App !== "undefined" && App.irPara) App.irPara("rdo"); },
    "bn-abrir-diario": function () { G._bonifAbrirDiario(); },

    "bn-comecar": function () {
      if (!exigirGestao()) return;
      var obras = K.lista("obras");
      if (!exigir(obras.length > 0, "Cadastre a obra primeiro, em Obras.")) return;
      UI.modal("Começar a configurar a bonificação",
        "<p>Escolha a obra em que a bonificação vale. Dá para acrescentar outras depois.</p>" + K.campo("Obra", '<select id="bn-nova-obra">' + K.optsRec(obras, "nome", "", "Escolher") + "</select>"),
        [{ texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
         { texto: "Começar", classe: "primary", onClick: function () {
           if (!exigirGestao()) return;
           var o = K.v("bn-nova-obra");
           if (!exigir(!!o, "Escolha a obra.")) return;
           if (bonif()) { UI.fecharModal(); App.render(); return; }
           if (!salvarBonif(B.novaConfig([o]))) { UI.toast("Não consegui gravar a configuração.", "erro"); return; }
           UI.fecharModal(); G._bnObra = o; G._bnAba = "salario"; G._bnDraft = null;
           UI.toast("Bonificação criada. Defina os fatores e o salário de cada pessoa.", "ok"); App.render();
         } }]);
    },
    "bn-obras": function () {
      if (!exigirGestao()) return;
      var b = bonif(); if (!b) return;
      var obras = K.lista("obras");
      UI.modal("Obras da bonificação",
        "<p>O fechamento é por mês e por pessoa, juntando as obras marcadas. A presença e as etapas do diário só aparecem nelas.</p>" +
        obras.map(function (o) { return '<label style="display:block;margin:6px 0"><input type="checkbox" data-bn-obra-ck="' + esc(o.id) + '"' + (arr(b.obras).indexOf(o.id) > -1 ? " checked" : "") + "> " + esc(o.nome || o.id) + "</label>"; }).join(""),
        [{ texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
         { texto: "Salvar", classe: "primary", onClick: function () {
           if (!exigirGestao()) return;
           var sel = [];
           Array.prototype.forEach.call(document.querySelectorAll("[data-bn-obra-ck]"), function (e) { if (e.checked) sel.push(e.getAttribute("data-bn-obra-ck")); });
           if (!exigir(sel.length > 0, "Deixe ao menos uma obra marcada.")) return;
           var b2 = bonif(); if (!b2) return;
           /* obra que sai da lista com meta já criada: a meta fica guardada, só deixa de contar */
           b2.obras = sel;
           if (!salvarBonif(b2)) { UI.toast("Não consegui gravar.", "erro"); return; }
           UI.fecharModal(); UI.toast("Obras da bonificação salvas.", "ok"); App.render();
         } }]);
    },

    /* ----- metas ----- */
    "bn-trazer": function () {
      if (!exigirGestao("Só a gestão traz etapas do cronograma como meta.")) return;
      var b = bonif(); if (!b) return;
      var obra = G._bnObra; if (!exigir(!!obra, "Escolha a obra.")) return;
      var pl = etapasDoPlano(obra);
      if (!pl.ok) { UI.toast(pl.erro, "erro"); return; }
      if (!pl.itens.length) { UI.toast("O plano desta obra ainda não tem etapas com data.", "aviso"); return; }
      var ja = {}; arr(b.metas).forEach(function (m) { ja[B.idMeta(m.obraId, m.noId)] = 1; });
      G._bnEtapas = pl.itens;
      /* ⚠ ETAPA JÁ ENTREGUE E SUBETAPA NASCEM DESMARCADAS. Marcadas, a fundação entregue em outubro viraria meta
         de um mês já pago, e etapa + subetapa contariam a mesma entrega duas vezes na nota. */
      var avs = {}; try { avs[obra] = CronoBase.avanco(App._cronoListaCrono(obra), obra); } catch (eAv) {}
      var entregues = B.conclusoes(K.lista("rdo").filter(function (d) { return d && d.obraId === obra; }), avs).porNo;
      var linhas = pl.itens.map(function (it, i) {
        var existe = !!ja[B.idMeta(obra, it.noId)], jaEntregue = !!entregues[obra + "|" + it.noId];
        return "<tr><td><input type=\"checkbox\" data-bn-et=\"" + i + "\"" + (existe || it.terceiro ? " disabled" : (jaEntregue || it.tipo === "Subetapa" ? "" : " checked")) + "></td><td>" + esc(rotEtapa(it)) + "</td><td>" + esc(it.tipo) + "</td><td>" + esc(diaBr(it.inicio)) + "</td><td>" + esc(diaBr(it.fim)) + "</td><td class=\"num\">" + it.dias + "</td><td>" +
          (existe ? M.pilula("já é meta", "neutro") : (it.terceiro ? M.pilula("de terceiro ou do cliente", "alerta") : (jaEntregue ? M.pilula("já entregue", "ok") : ""))) + "</td></tr>";
      }).join("");
      UI.modal("Trazer etapas do cronograma",
        "<p>Marque o que vira meta. O prazo sai das datas do plano agora e fica gravado na meta: se o cronograma mudar depois, o prazo combinado não muda.</p>" +
        '<div style="max-height:50vh;overflow:auto"><table class="tbl"><thead><tr><th></th><th>ETAPA</th><th>TIPO</th><th>INÍCIO</th><th>FIM</th><th class="num">DIAS</th><th></th></tr></thead><tbody>' + linhas + "</tbody></table></div>",
        [{ texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
         { texto: "Trazer as marcadas", classe: "primary", onClick: function () {
           if (!exigirGestao()) return;
           var b2 = bonif(); if (!b2) return;
           var esc2 = [];
           Array.prototype.forEach.call(document.querySelectorAll("[data-bn-et]"), function (e) {
             if (!e.checked || e.disabled) return;
             var it = (G._bnEtapas || [])[+e.getAttribute("data-bn-et")];
             if (it) esc2.push({ obraId: obra, noId: it.noId, nome: rotEtapa(it), inicio: it.inicio, dias: it.dias });
           });
           if (!exigir(esc2.length > 0, "Marque ao menos uma etapa.")) return;
           var r = B.trazerEtapas(b2.metas, esc2, { cal: calDaObra(obra), por: quem(), em: Util.agoraISO() });
           b2.metas = r.metas;
           if (!salvarBonif(b2)) { UI.toast("Não consegui gravar as metas.", "erro"); return; }
           UI.fecharModal();
           UI.toast(r.criadas.length + " meta(s) criada(s)." + (r.jaExistiam.length ? " " + r.jaExistiam.length + " já existia(m) e não foi(ram) mexida(s)." : "") + (r.recusadas.length ? " " + r.recusadas.length + " recusada(s) por falta de prazo." : ""), r.recusadas.length ? "aviso" : "ok");
           App.render();
         } }]);
    },
    "bn-meta-prazo": function (ds) {
      if (!exigirGestao("Só a gestão muda o prazo de uma meta.")) return;
      var b = bonif(); if (!b) return;
      var m = arr(b.metas).filter(function (x) { return x.id === ds.id; })[0]; if (!m) return;
      if (!exigirAberto(B.mesDe(m.limite))) return;
      UI.modal("Mudar o prazo de " + m.nome,
        "<p>O prazo combinado fica no histórico da meta, com o motivo e quem mudou. O \"entregar até\" é recalculado pelo calendário da obra.</p>" +
        '<div class="flex" style="gap:12px;flex-wrap:wrap">' + K.campo("Início", '<input id="bn-mp-ini" type="date" value="' + esc(m.inicio) + '">') + K.campo("Prazo (dias úteis)", '<input id="bn-mp-dias" inputmode="numeric" value="' + esc(m.dias) + '" style="width:100px">') + "</div>" +
        K.campo("Motivo *", '<textarea id="bn-mp-motivo" rows="2" placeholder="Por que o prazo mudou"></textarea>'),
        [{ texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
         { texto: "Mudar o prazo", classe: "primary", onClick: function () {
           if (!exigirGestao()) return;
           var b2 = bonif(); if (!b2) return;
           var i2 = -1; arr(b2.metas).forEach(function (x, i) { if (x.id === ds.id) i2 = i; });
           if (i2 < 0) return;
           if (!exigirAberto(B.mesDe(b2.metas[i2].limite))) return;
           var r = B.ajustarMeta(b2.metas[i2], { inicio: K.v("bn-mp-ini"), dias: K.v("bn-mp-dias"), motivo: K.v("bn-mp-motivo"), por: quem(), em: Util.agoraISO() }, calDaObra(b2.metas[i2].obraId));
           if (!r.ok) { UI.toast(r.erro, "erro"); return; }
           if (!exigirAberto(B.mesDe(r.meta.limite))) return;
           b2.metas[i2] = r.meta;
           if (!salvarBonif(b2)) { UI.toast("Não consegui gravar.", "erro"); return; }
           UI.fecharModal(); UI.toast("Prazo mudado: entregar até " + diaBr(r.meta.limite) + ".", "ok"); App.render();
         } }]);
    },
    "bn-meta-fora": function (ds) {
      if (!exigirGestao("Só a gestão tira uma meta da conta.")) return;
      var b = bonif(); if (!b) return;
      var m = arr(b.metas).filter(function (x) { return x.id === ds.id; })[0]; if (!m) return;
      if (!exigirAberto(B.mesDe(m.limite))) return;
      var vaiFora = !m.fora;
      UI.modal(vaiFora ? "Tirar da conta: " + m.nome : "Voltar para a conta: " + m.nome,
        "<p>" + (vaiFora ? "A meta deixa de contar na nota do mês (por exemplo, atraso do contratante). " : "A meta volta a contar na nota do mês. ") + "O motivo fica no histórico.</p>" + K.campo("Motivo *", '<textarea id="bn-mf-motivo" rows="2"></textarea>'),
        [{ texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
         { texto: "Confirmar", classe: "primary", onClick: function () {
           if (!exigirGestao()) return;
           var b2 = bonif(); if (!b2) return;
           var i2 = -1; arr(b2.metas).forEach(function (x, i) { if (x.id === ds.id) i2 = i; });
           if (i2 < 0) return;
           if (!exigirAberto(B.mesDe(b2.metas[i2].limite))) return;
           var r = B.foraDaConta(b2.metas[i2], vaiFora, K.v("bn-mf-motivo"), quem(), Util.agoraISO());
           if (!r.ok) { UI.toast(r.erro, "erro"); return; }
           b2.metas[i2] = r.meta;
           if (!salvarBonif(b2)) { UI.toast("Não consegui gravar.", "erro"); return; }
           UI.fecharModal(); UI.toast(vaiFora ? "Meta fora da conta." : "Meta de volta na conta.", "ok"); App.render();
         } }]);
    },

    /* ----- salário e fatores (rascunho em memória até o Salvar) ----- */
    "bn-tipo-novo": function () {
      if (!exigirGestao()) return;
      var d = lerDraft(); if (!d) return;
      d.tipos.push({ id: novoId("tp_"), nome: "", grupo: "adicional", fator: "", fixo: "" });
      App.render();
    },
    "bn-tipo-remover": function (ds) {
      if (!exigirGestao()) return;
      var d = lerDraft(); if (!d) return;
      var i = +ds.i, t = d.tipos[i]; if (!t) return;
      var uso = d.pessoas.filter(function (p) { return p.funcaoTipoId === t.id || p.adicionais.indexOf(t.id) > -1; });
      if (!exigir(!uso.length, "Este tipo está em uso por " + uso.slice(0, 3).map(function (p) { return p.nome; }).join(", ") + (uso.length > 3 ? " e mais " + (uso.length - 3) : "") + ". Troque a função ou o adicional dessas pessoas antes de remover.")) return;
      d.tipos.splice(i, 1); App.render();
    },
    "bn-todos": function (ds) {
      if (!exigirGestao()) return;
      var d = lerDraft(); if (!d) return;
      var campo = ds.campo === "cheia" ? "cheia" : "carteira", t = K.v(campo === "cheia" ? "bn-todos-cheia" : "bn-todos-cart");
      var n = t === "" ? null : B.num(t);
      if (!exigir(n != null && n >= 0, "Digite um valor válido (zero ou mais).")) return;
      var qtd = 0;
      d.pessoas.forEach(function (p) { if (p.participa) { p[campo === "cheia" ? "metaCheia" : "carteira"] = numTxt(n); qtd++; } });
      UI.toast("Valor aplicado a " + qtd + " pessoa(s) que participam.", "ok"); App.render();
    },
    "bn-salvar": function () {
      if (!exigirGestao()) return;
      var d = lerDraft(), b = bonif(); if (!d || !b) return;
      var erros = [], tipos = [], nomes = {};
      d.tipos.forEach(function (t) {
        var nome = String(t.nome || "").trim();
        if (!nome) { erros.push("Todo tipo precisa de nome."); return; }
        if (nomes[nome.toLowerCase()]) { erros.push("Tipo repetido: " + nome + "."); return; }
        nomes[nome.toLowerCase()] = 1;
        var f = t.fator === "" ? null : B.num(t.fator), x = t.fixo === "" ? null : B.num(t.fixo);
        if (t.fator !== "" && f == null) erros.push("Fator inválido em " + nome + ".");
        else if (f != null && f < 1) erros.push("O fator de " + nome + " é menor que 1: isso reduziria o salário. Use 1 ou mais.");
        else if (f != null && f > B.FATOR_MAX) erros.push("Fator " + t.fator + " parece digitado errado. 1,20 significa 20 % a mais; para valor em reais use a coluna Valor fixo.");
        if (t.fixo !== "" && x == null) erros.push("Valor fixo inválido em " + nome + ".");
        else if (x != null && x < 0) erros.push("O valor fixo de " + nome + " não pode ser negativo.");
        tipos.push({ id: t.id, nome: nome, grupo: t.grupo === "adicional" ? "adicional" : "funcao", fator: f, fixo: x });
      });
      var pessoas = [];
      d.pessoas.forEach(function (p) {
        var cart = p.carteira === "" ? null : B.num(p.carteira), cheia = p.metaCheia === "" ? null : B.num(p.metaCheia);
        if ((p.carteira !== "" && cart == null) || (cart != null && cart < 0)) { erros.push("Salário inválido para " + p.nome + "."); return; }
        if ((p.metaCheia !== "" && cheia == null) || (cheia != null && cheia < 0)) { erros.push("Valor cheio inválido para " + p.nome + "."); return; }
        var temDado = cart != null || cheia != null || p.funcaoTipoId || p.adicionais.length;
        if (!p.participa && !temDado) return;
        pessoas.push({ colaboradorId: p.colaboradorId, nome: p.nome.replace(/ \(fora do cadastro ativo\)$/, ""), carteira: cart, funcaoTipoId: p.funcaoTipoId || "", adicionais: p.adicionais.slice(),
          metaCheia: cheia, ativo: !!p.participa });
      });
      if (erros.length) { UI.toast(erros[0] + (erros.length > 1 ? " (mais " + (erros.length - 1) + " problema(s))" : ""), "erro"); return; }
      var reduz = document.getElementById("bn-reduz");
      var b2 = bonif(); if (!b2) return;
      b2.tipos = tipos; b2.pessoas = pessoas;
      b2.regras = { reduzPorFalta: reduz ? !!reduz.checked : B.regras(b2).reduzPorFalta };
      if (!salvarBonif(b2)) { UI.toast("Não consegui gravar.", "erro"); return; }
      G._bnDraft = null;
      UI.toast("Salário e fatores salvos.", "ok"); App.render();
    },

    /* ----- fechamento ----- */
    "bn-homologar": function () {
      if (!exigirGestao("Só a gestão homologa o mês.")) return;
      var comp = G._bnComp, b = bonif(); if (!b) return;
      if (!exigirAberto(comp)) return;
      var st = estado(comp), ap = st.ap;
      if (!exigir(ap.linhas.length > 0, "Não há ninguém participando para fechar neste mês.")) return;
      if (!exigir(!ap.pessoasPendentes, ap.pessoasPendentes + " pessoa(s) com pendência: " + ap.linhas.filter(function (l) { return l.pendencias.length; }).slice(0, 3).map(function (l) { return l.nome; }).join(", ") + ". Complete em Salário e fatores antes de homologar.")) return;
      UI.modal("Homologar " + mesExtenso(comp) + "?",
        "<p>Isto congela os valores do mês: <b>" + ap.linhas.length + " pessoa(s)</b>, total de <b>" + esc(moedaC(ap.totalCent)) + "</b>, nota " + esc(ap.nota.notaPct == null ? "sem metas" : pctTxt(ap.nota.notaPct)) + ". Depois, mudar prazo ou tirar meta da conta neste mês só depois de reabrir.</p>" +
        (function () {
          var at = Store.obter(eid(), ENT_FECH, B.idFechamento(comp));
          if (!at || at.estado !== "reaberto" || at.totalCent == null || ap.totalCent == null) return "";
          var dif = ap.totalCent - at.totalCent;
          return "<p><b>Mês reaberto.</b> Total homologado antes: <b>" + esc(moedaC(at.totalCent)) + "</b>. Novo total: <b>" + esc(moedaC(ap.totalCent)) + "</b>. Diferença: <b>" + (dif > 0 ? "mais " : (dif < 0 ? "menos " : "")) + esc(moedaC(Math.abs(dif))) + "</b>. Se o valor antigo já foi pago, o acerto é com a contabilidade.</p>";
        })() +
        (function () {
          var n2 = ap.nota.itens.filter(function (x) { return x.sit.aguardando; }).length;
          return n2 ? "<p><b>" + n2 + " meta(s) do mês estão com a conclusão em diário que ainda não foi aprovado.</b> Elas ficam como não atingidas neste fechamento.</p>" : "";
        })() +
        (ap.nota.abertas ? "<p><b>" + ap.nota.abertas + " meta(s) ainda dentro do prazo</b> contam como não atingidas neste fechamento.</p>" : "") +
        (ap.presenca.aguardando ? "<p><b>" + ap.presenca.aguardando + " diário(s) com presença ainda não aprovado(s)</b> ficam de fora.</p>" : "") +
        (ap.semMeta ? '<p><b>Este mês não tem nenhuma meta.</b> A bonificação de metas de todos fica em R$ 0,00.</p><label><input type="checkbox" id="bn-conf-semmeta"> Confirmo que o mês fecha sem meta</label>' : "") +
        "<p>Nada é lançado no Financeiro: a saída é o relatório para o pagamento.</p>",
        [{ texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
         { texto: "Homologar", classe: "primary", onClick: function () {
           if (!exigirGestao("Só a gestão homologa o mês.")) return;
           if (ap.semMeta && !exigir(!!(document.getElementById("bn-conf-semmeta") || {}).checked, "Marque a confirmação de que o mês fecha sem meta.")) return;
           /* relê tudo na hora do clique: outro aparelho pode ter homologado, e a conta pode ter mudado com o modal aberto */
           var atual = Store.obter(eid(), ENT_FECH, B.idFechamento(comp));
           var st2 = estado(comp), ap2 = st2.ap;
           if (ap2.pessoasPendentes) { UI.fecharModal(); UI.toast("Apareceu pendência enquanto o aviso estava aberto. Confira e tente de novo.", "erro"); App.render(); return; }
           var h = B.homologar(atual, { obraId: arr(b.obras)[0], competencia: comp, linhas: B.linhasRelatorio(ap2), metas: metasCopia(ap2), notaPct: ap2.nota.notaPct,
             totalCent: ap2.totalCent, por: quem(), em: Util.agoraISO() });
           UI.fecharModal();
           if (!h.ok) { UI.toast(h.erro, "erro"); App.render(); return; }
           /* "homologado" só aparece DEPOIS que a gravação confirmar */
           if (!Store.salvar(eid(), ENT_FECH, h.f)) { UI.toast("Não consegui gravar o fechamento: nada foi homologado.", "erro"); App.render(); return; }
           UI.toast("Mês homologado.", "ok"); App.render();
         } }]);
    },
    "bn-reabrir": function () {
      if (!exigirGestao("Só a gestão reabre o mês.")) return;
      var comp = G._bnComp, idF = B.idFechamento(comp), f = Store.obter(eid(), ENT_FECH, idF);
      if (!f) return;
      if (!exigir(f.estado === "homologado", "Este mês não está homologado.")) return;
      UI.modal("Reabrir " + mesExtenso(comp) + "?",
        "<p>O fechamento homologado soma <b>" + esc(moedaC(f.totalCent)) + "</b> (em " + esc(Util.fmtData(f.homologadoEm) || "") + "). Se esse valor já foi pago, reabrir não desfaz o pagamento. Nada é apagado: o fechamento e o histórico ficam guardados.</p>",
        [{ texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
         { texto: "Reabrir", classe: "primary", onClick: function () {
           if (!exigirGestao("Só a gestão reabre o mês.")) return;
           var rr = B.reabrir(Store.obter(eid(), ENT_FECH, idF), quem(), Util.agoraISO());
           UI.fecharModal();
           if (!rr.ok) { UI.toast(rr.erro, "erro"); App.render(); return; }
           if (!Store.salvar(eid(), ENT_FECH, rr.f)) { UI.toast("Não consegui gravar: o mês continua homologado.", "erro"); App.render(); return; }
           UI.toast("Mês reaberto.", "ok"); App.render();
         } }]);
    },
    "bn-xlsx": function () {
      if (!exigirGestao("Só a gestão gera o relatório de pagamento.")) return;
      var d = dadosFechamento(G._bnComp);
      var EX = global.ExcelOrc || global.Excel;
      if (!EX || !EX.ensureExcelJS) { UI.toast("O gerador de Excel não carregou neste aparelho.", "erro"); return; }
      EX.ensureExcelJS(function () {
        try {
          Promise.resolve(construirXlsx(global.ExcelJS, d)).then(function (wb) { return wb.xlsx.writeBuffer(); }).then(function (buf) {
            var blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
            var url = URL.createObjectURL(blob), el = document.createElement("a");
            el.href = url; el.download = "bonificacao-" + d.comp + ".xlsx"; el.click();
            setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
            UI.toast("Relatório gerado.", "ok");
          }).catch(function (e) { UI.toast("Não consegui gerar o Excel: " + String((e && e.message) || e), "erro"); });
        } catch (e) { UI.toast("Não consegui gerar o Excel: " + String((e && e.message) || e), "erro"); }
      });
    },
    "bn-imprimir": function () {
      if (!exigirGestao("Só a gestão imprime o fechamento.")) return;
      var d = dadosFechamento(G._bnComp), w = null;
      try { w = window.open("", "_blank"); } catch (e) { w = null; }
      if (!w) { UI.toast("O navegador bloqueou a janela de impressão. Libere pop-ups para este endereço.", "erro"); return; }
      var corpo = _tabelaFech(d.linhas, d.totalCent, true);
      var h = '<!DOCTYPE html><html lang="pt-BR" data-tema="light"><head><meta charset="utf-8"><title>Bonificação ' + esc(d.comp) + '</title><link rel="stylesheet" href="css/fontes.css"><link rel="stylesheet" href="css/app.css"></head><body><div class="main">' +
        "<h1>Bonificação: " + esc(mesExtenso(d.comp)) + "</h1><p>" + (d.homologado ? "Mês homologado." : "Mês ainda não homologado.") + " Nota do mês: " + esc(d.notaPct == null ? "sem metas" : pctTxt(d.notaPct)) + ".</p>" + corpo + "<p>" + esc(NOTA_BRUTO) + "</p>" +
        '</div><script>window.onload=function(){setTimeout(function(){window.print()},400)}<\/script></body></html>';
      w.document.write(h); w.document.close();
    }
  });

  /* campos que não podem ter data-gacao (digitar e escolher mês): ligam aqui, depois do DOM existir */
  var wireAntigo = G._wiresExtras ? G._wiresExtras[MODULO] : null;
  G.registrarWire(MODULO, function () {
    /* o wire do modelo antigo (mês e arquivo de importação) continua valendo na tela dele */
    if (typeof wireAntigo === "function") wireAntigo.call(G);
    var mes = document.getElementById("bn-comp");
    if (mes) mes.onchange = function () { if (!this.value) return; G._bnComp = this.value; G._bnDraft = null; App.render(); };
    var d = G._bnDraft;
    if (!d) return;
    function atualizaLinha(i) {
      var c = celulaFuncao(d.pessoas[i], tiposDoDraft(d));
      var a = document.getElementById("bn-ff-" + i), b2 = document.getElementById("bn-sf-" + i);
      if (a) { a.innerHTML = c.fator; a.title = c.pend; }
      if (b2) { b2.innerHTML = c.salario; b2.title = c.pend; }
    }
    function todasLinhas() { for (var i = 0; i < d.pessoas.length; i++) atualizaLinha(i); }
    function liga(sel, fn, ev) {
      Array.prototype.forEach.call(document.querySelectorAll(sel), function (el) { el[ev || "oninput"] = function () { fn(el); }; });
    }
    /* o nome do tipo aparece nas listas das pessoas: atualiza o texto no lugar, sem redesenhar a tela
       (redesenhar ao sair do campo engolia o clique no campo seguinte) */
    liga("[data-bnt-nome]", function (el) {
      var t = d.tipos[+el.getAttribute("data-bnt-nome")]; t.nome = el.value;
      Array.prototype.forEach.call(document.querySelectorAll("#bn-tab-pessoas option"), function (o) { if (o.value === t.id) o.text = t.nome || "(sem nome)"; });
      Array.prototype.forEach.call(document.querySelectorAll("#bn-tab-pessoas [data-bn-tn]"), function (s) { if (s.getAttribute("data-bn-tn") === t.id) s.textContent = t.nome || "(sem nome)"; });
    }, "oninput");
    liga("[data-bnt-grupo]", function (el) { d.tipos[+el.getAttribute("data-bnt-grupo")].grupo = el.value; App.render(); }, "onchange");
    liga("[data-bnt-fator]", function (el) { d.tipos[+el.getAttribute("data-bnt-fator")].fator = el.value; todasLinhas(); });
    liga("[data-bnt-fixo]", function (el) { d.tipos[+el.getAttribute("data-bnt-fixo")].fixo = el.value; todasLinhas(); });
    liga("[data-bnp-cart]", function (el) { var i = +el.getAttribute("data-bnp-cart"); d.pessoas[i].carteira = el.value; atualizaLinha(i); });
    liga("[data-bnp-cheia]", function (el) { d.pessoas[+el.getAttribute("data-bnp-cheia")].metaCheia = el.value; });
    liga("[data-bnp-func]", function (el) { var i = +el.getAttribute("data-bnp-func"); d.pessoas[i].funcaoTipoId = el.value; atualizaLinha(i); }, "onchange");
    liga("[data-bnp-part]", function (el) {
      d.pessoas[+el.getAttribute("data-bnp-part")].participa = !!el.checked;
      var tr = el.parentNode && el.parentNode.parentNode; if (tr && tr.style) tr.style.opacity = el.checked ? "" : ".6";
    }, "onchange");
    liga("[data-bnp-adic]", function (el) {
      var i = +el.getAttribute("data-bnp-adic"), t = el.getAttribute("data-tipo"), l = d.pessoas[i].adicionais, k = l.indexOf(t);
      if (el.checked && k < 0) l.push(t);
      if (!el.checked && k > -1) l.splice(k, 1);
      atualizaLinha(i);
    }, "onchange");
  });

  /* ================================================================ DIÁRIO (RDO) */
  G._bonifAbrirDiario = function () {
    if (typeof Auth !== "undefined" && Auth.podeModulo && !Auth.podeModulo("rdo")) { UI.toast("Seu usuário não tem permissão no módulo Diário (RDO).", "erro"); return; }
    var b = bonif(), obra = G._bnObra || (b && arr(b.obras)[0]) || "";
    if (typeof App !== "undefined" && App.irPara) App.irPara("rdo");
    setTimeout(function () { try { G.formRdo(obra ? { obraId: obra } : null); } catch (e) { UI.toast("Não consegui abrir o diário.", "erro"); } }, 200);
  };

  /* a obra do diário está na bonificação? */
  function obraAtiva(obraId) { var b = bonif(); return !!(b && obraId && arr(b.obras).indexOf(obraId) > -1); }
  /* ⚠ Quem não está ativo no cadastro (afastado, desligado) não aparece em "Quem trabalhou hoje". Se aparecesse,
     marcá-lo "falta" todo dia seria desconto de quem nem está na obra. Em `apurar` ele segue contando se já tem
     presença registrada em diário aprovado. */
  function pessoasAtivas(b) {
    return arr(b.pessoas).filter(function (p) {
      if (!p || p.ativo === false || p.colaboradorId == null) return false;
      var c = Store.obter(eid(), "colaboradores", p.colaboradorId);
      return !c || !c.status || c.status === "ativo";
    });
  }

  /* ⚠ ENVIAR PARA APROVAÇÃO EXIGE A PRESENÇA, mas SALVAR RASCUNHO NÃO: o encarregado
     que ainda não fechou o dia precisa conseguir guardar o que já digitou. */
  G._bonifExigePresenca = function (rdo) {
    if (!rdo || !obraAtiva(rdo.obraId)) return "";
    if (B.presencaPreenchida(rdo)) return "";
    return "Marque quem trabalhou hoje antes de enviar para aprovação. Nesta obra a presença do diário conta para a bonificação da equipe.";
  };

  /* ⚠ NO CELULAR O BOTÃO "ENVIAR" DA LISTA FICA FORA DA TELA (a tabela rola para o lado). Quem lança da
     obra salvava, achava que tinha terminado, e o rascunho nunca contava para o cronograma nem para a
     bonificação. Por isso o próprio salvar pergunta. Vai pelo mesmo `rdo-enviar` da lista, com as mesmas guardas. */
  G._bonifPosSalvarDiario = function (obj) {
    if (!obj || !obj.id || !obraAtiva(obj.obraId)) return;
    var est = obj.estado || "rascunho";
    if (est !== "rascunho" && est !== "em_revisao") return;
    UI.modal("Diário salvo",
      "<p>Mandar agora para aprovação? Enquanto for rascunho, ele não conta para o cronograma nem para a bonificação da equipe.</p>",
      [{ texto: "Depois", classe: "ghost", onClick: function () { UI.fecharModal(); } },
       { texto: "Enviar para aprovação", classe: "primary", onClick: function () { UI.fecharModal(); G.acao("rdo-enviar", { id: obj.id }, typeof App !== "undefined" ? App : null); } }]);
  };

  G._bonifBlocoRdoHtml = function (r) {
    var b = bonif();
    if (!b || !arr(b.obras).length) { G._bnRdo = null; return ""; }
    var est = {};
    arr(r && r.presenca).forEach(function (p) { if (p && p.colaboradorId != null) est[String(p.colaboradorId)] = p.estado; });
    G._bnRdo = { est: est, tocado: false, etapas: arr(r && r.etapasDia).map(function (e) { return { noId: e.noId, nome: e.nome || "", pct: e.pct == null ? "" : e.pct, concluiu: !!e.concluiu }; }) };
    return '<div id="g-bn-bloco" style="display:none">' +
      K.campo('Quem trabalhou hoje<span class="muted" style="font-weight:400;font-size:11px"> (conta para a bonificação da equipe)</span>', '<div id="g-bn-pres"></div>') +
      K.campo('Etapas trabalhadas hoje<span class="muted" style="font-weight:400;font-size:11px"> (o diário aprovado atualiza o Cronograma)</span>', '<div id="g-bn-etp"></div>') + "</div>";
  };

  G._bonifBlocoRdoLigar = function () {
    var S = G._bnRdo, bloco = document.getElementById("g-bn-bloco");
    if (!S || !bloco) return;
    var cacheEt = {};
    function obraSel() { var s = document.getElementById("g-obra"); return s ? s.value : ""; }
    function etapasOpcoes(obraId) {
      var b = bonif(); if (!b) return [];
      var out = [], vistos = {};
      arr(b.metas).filter(function (m) { return m && m.obraId === obraId && !m.fora; }).sort(function (x, y) { return x.limite < y.limite ? -1 : 1; }).forEach(function (m) {
        out.push({ noId: m.noId, nome: m.nome, grupo: "Metas da obra" }); vistos[m.noId] = 1;
      });
      if (!cacheEt[obraId]) cacheEt[obraId] = etapasDoPlano(obraId);
      arr(cacheEt[obraId].itens).forEach(function (it) { if (!vistos[it.noId]) out.push({ noId: it.noId, nome: rotEtapa(it), grupo: "Etapas e tarefas do plano" }); });
      return out;
    }
    function tocar() {
      S.tocado = true;
      var b = bonif(); if (!b) return;
      pessoasAtivas(b).forEach(function (p) { if (!S.est[String(p.colaboradorId)]) S.est[String(p.colaboradorId)] = "falta"; });
    }
    function nomeDe(p) { return p.nome || (Store.obter(eid(), "colaboradores", p.colaboradorId) || {}).nome || String(p.colaboradorId); }
    function renderPres() {
      var el = document.getElementById("g-bn-pres"), b = bonif(); if (!el || !b) return;
      var ps = pessoasAtivas(b);
      if (!ps.length) { el.innerHTML = '<span class="muted" style="font-size:12px">Nenhuma pessoa participa da bonificação. A gestão escolhe em Produtividade e bonificação, Salário e fatores.</span>'; return; }
      el.innerHTML = '<button type="button" class="btn sm" id="g-bn-todos" style="margin-bottom:8px">Todos presentes</button>' +
        '<table style="width:100%;font-size:13px;border-collapse:collapse">' + ps.map(function (p) {
          var id = String(p.colaboradorId), e = S.est[id], pres = e === "presente";
          return '<tr style="border-top:1px solid var(--linha,#e2e8f0)"><td style="padding:4px 2px"><label><input type="checkbox" data-bnp="' + esc(id) + '"' + (pres ? " checked" : "") + "> " + esc(nomeDe(p)) + "</label></td>" +
            '<td style="text-align:right">' + (pres ? "" : '<select data-bna="' + esc(id) + '"><option value="falta"' + (e !== "justificada" ? " selected" : "") + '>Falta</option><option value="justificada"' + (e === "justificada" ? " selected" : "") + ">Falta justificada</option></select>") + "</td></tr>";
        }).join("") + "</table>";
      var bt = document.getElementById("g-bn-todos");
      if (bt) bt.onclick = function () { tocar(); pessoasAtivas(b).forEach(function (p) { S.est[String(p.colaboradorId)] = "presente"; }); renderPres(); };
      Array.prototype.forEach.call(el.querySelectorAll("[data-bnp]"), function (c) {
        c.onchange = function () { tocar(); S.est[c.getAttribute("data-bnp")] = c.checked ? "presente" : "falta"; renderPres(); };
      });
      Array.prototype.forEach.call(el.querySelectorAll("[data-bna]"), function (s) {
        s.onchange = function () { tocar(); S.est[s.getAttribute("data-bna")] = s.value === "justificada" ? "justificada" : "falta"; };
      });
    }
    function renderEtapas() {
      var el = document.getElementById("g-bn-etp"); if (!el) return;
      var ops = etapasOpcoes(obraSel());
      var grupos = {};
      ops.forEach(function (o) { (grupos[o.grupo] = grupos[o.grupo] || []).push(o); });
      var optHtml = function (sel) {
        var h = '<option value="">Escolher a etapa</option>';
        Object.keys(grupos).forEach(function (g) {
          h += '<optgroup label="' + esc(g) + '">' + grupos[g].map(function (o) { return '<option value="' + esc(o.noId) + '"' + (o.noId === sel ? " selected" : "") + ">" + esc(o.nome) + "</option>"; }).join("") + "</optgroup>";
        });
        if (sel && !ops.some(function (o) { return o.noId === sel; })) h += '<option value="' + esc(sel) + '" selected>' + esc(sel) + "</option>";
        return h;
      };
      el.innerHTML = '<button type="button" class="btn sm" id="g-bn-et-add" style="margin-bottom:8px">+ Etapa</button>' + (S.etapas.length ? '<table style="width:100%;font-size:12px;border-collapse:collapse"><tr style="color:var(--texto-fraco);font-size:var(--t-micro)"><th style="text-align:left">Etapa</th><th>% acumulado</th><th>Concluiu hoje</th><th></th></tr>' +
        S.etapas.map(function (e, i) {
          return '<tr style="border-top:1px solid var(--linha,#e2e8f0)"><td style="padding:3px 2px"><select data-bne-no="' + i + '" style="width:100%">' + optHtml(e.noId) + "</select></td>" +
            '<td style="text-align:center"><input inputmode="decimal" data-bne-pct="' + i + '" value="' + esc(e.concluiu ? 100 : e.pct) + '"' + (e.concluiu ? " disabled" : "") + ' style="width:60px;text-align:center"></td>' +
            '<td style="text-align:center"><input type="checkbox" data-bne-c="' + i + '"' + (e.concluiu ? " checked" : "") + "></td>" +
            '<td><button type="button" data-bne-r="' + i + '" class="btn sm ghost" style="padding:1px 6px">x</button></td></tr>';
        }).join("") + "</table>" : '<span class="muted" style="font-size:12px">Nenhuma etapa lançada. Lance as etapas em que a equipe trabalhou hoje.</span>');
      var add = document.getElementById("g-bn-et-add");
      if (add) add.onclick = function () { S.etapas.push({ noId: "", nome: "", pct: "", concluiu: false }); renderEtapas(); };
      Array.prototype.forEach.call(el.querySelectorAll("[data-bne-no]"), function (s) {
        s.onchange = function () {
          var e = S.etapas[+s.getAttribute("data-bne-no")]; e.noId = s.value;
          e.nome = s.value ? (s.options[s.selectedIndex].text || "") : "";
        };
      });
      Array.prototype.forEach.call(el.querySelectorAll("[data-bne-pct]"), function (c) { c.oninput = function () { S.etapas[+c.getAttribute("data-bne-pct")].pct = c.value; }; });
      Array.prototype.forEach.call(el.querySelectorAll("[data-bne-c]"), function (c) {
        c.onchange = function () { var e = S.etapas[+c.getAttribute("data-bne-c")]; e.concluiu = !!c.checked; if (e.concluiu) e.pct = 100; renderEtapas(); };
      });
      Array.prototype.forEach.call(el.querySelectorAll("[data-bne-r]"), function (c) { c.onclick = function () { S.etapas.splice(+c.getAttribute("data-bne-r"), 1); renderEtapas(); }; });
    }
    function sync() {
      var vis = obraAtiva(obraSel());
      bloco.style.display = vis ? "" : "none";
      if (vis) { renderPres(); renderEtapas(); }
    }
    var so = document.getElementById("g-obra");
    if (so) so.addEventListener("change", sync);
    sync();
  };

  /* chamado no salvar do diário. Devolve uma mensagem de erro (e o salvar não segue) ou "". */
  G._bonifBlocoRdoColetar = function (obj, buf) {
    var S = G._bnRdo, b = bonif();
    if (!S || !b || !obraAtiva(obj.obraId)) return "";
    /* ⚠ DIÁRIO NOVO NASCE RASCUNHO. Sem `estado`, o diário marcado "Finalizado" no formulário lia como
       finalizado_legado, que a régua de pagamento (Producao.podePagar) trata como aprovado: presença e etapa
       contariam sem ninguém aprovar. Só diário NOVO (sem id): o antigo já gravado não é rebaixado. */
    if (!obj.estado && !obj.id) obj.estado = "rascunho";
    var ps = pessoasAtivas(b);
    if (S.tocado) {
      obj.presenca = ps.map(function (p) {
        var id = String(p.colaboradorId), e = S.est[id];
        return { colaboradorId: id, nome: p.nome || (Store.obter(eid(), "colaboradores", id) || {}).nome || id, estado: B.ESTADOS_PRESENCA[e] ? e : "falta" };
      });
    }
    var vistos = {}, etapas = [], erro = "";
    S.etapas.forEach(function (e) {
      if (erro || !e.noId) return;
      if (vistos[e.noId]) { erro = "A etapa \"" + (e.nome || e.noId) + "\" está duas vezes no diário. Junte numa linha só."; return; }
      vistos[e.noId] = 1;
      var pct = e.concluiu ? 100 : (e.pct === "" || e.pct == null ? null : B.num(e.pct));
      if (pct == null || pct < 0 || pct > 100) { erro = "Informe o percentual acumulado (de 0 a 100) da etapa \"" + (e.nome || e.noId) + "\"."; return; }
      etapas.push({ noId: String(e.noId), nome: e.nome || "", pct: pct, concluiu: !!e.concluiu });
    });
    if (erro) return erro;
    obj.etapasDia = etapas;
    /* efetivo por função a partir de quem esteve presente, SEM sobrescrever o que já foi digitado */
    if (buf && Array.isArray(buf.efe) && !buf.efe.length) {
      var porFuncao = {}, ordem = [];
      arr(obj.presenca).forEach(function (p) {
        if (p.estado !== "presente") return;
        var c = Store.obter(eid(), "colaboradores", p.colaboradorId) || {}, f = String(c.funcao || "").trim();
        if (!(f in porFuncao)) { porFuncao[f] = 0; ordem.push(f); }
        porFuncao[f]++;
      });
      ordem.forEach(function (f) { buf.efe.push({ funcao: f, qtd: porFuncao[f], horas: 8, horasExtras: 0, terceiro: false }); });
    }
    return "";
  };

  /* ================================================================ DIÁRIO APROVADO ALIMENTA O CRONOGRAMA */
  /* Depois da transição para `aprovado`. Grava pelo caminho único do Cronograma
     (App._cronoAlvoSemTela + GanttUI.aplicarAvanco + App._cronoGravarAvanco) com
     o carimbo fraco: a edição de uma pessoa feita depois SEMPRE vence a do sistema.
     ⚠ NADA AQUI DESFAZ A APROVAÇÃO DO DIÁRIO. Qualquer falha vira o toast "o diário
     foi aprovado, mas o avanço precisa ser lançado no Cronograma", com o motivo. */
  /* A ÚNICA porta do diário para o avanço. Quem conta o carimbo é o `_cronoGravarAvanco`; `test-medavanco-dois-aparelhos` trava o inventário das portas automáticas. */
  function gravarAvancoDoDiario(alvo, novoRec, baseEm, agora) {
    return App._cronoGravarAvanco(alvo, novoRec, { baseEm: baseEm, origem: "diario", carimboFraco: true, agora: agora, por: App._cronoPor ? App._cronoPor() : quem(), semToast: true });
  }

  /* diário aprovado DEVOLVIDO para revisão: o fim e o % que o próprio diário lançou saem do avanço, se nenhum outro
     diário aprovado conclui a etapa. Mesmo caminho de gravação; falhou, só avisa. Nada desfaz a revisão. */
  G._bonifDiarioRevisado = function (rr) {
    var b = bonif();
    if (!b || !rr || !obraAtiva(rr.obraId)) return { feito: false, motivo: "obra fora da bonificação" };
    if (!arr(rr.etapasDia).some(function (e) { return e && e.concluiu; })) return { feito: false, motivo: "o diário não concluía etapa" };
    var AVISO = "A revisão foi pedida, mas o fim que este diário lançou no Cronograma continua lá e precisa ser corrigido no Cronograma";
    function falha(motivo) { UI.toast(AVISO + ". " + motivo, "aviso", 9000); return { feito: false, motivo: motivo }; }
    try {
      if (typeof App === "undefined" || !App._cronoAlvoSemTela || !App._cronoGravarAvanco || typeof GanttUI === "undefined" || !GanttUI.aplicarAvanco)
        return falha("O módulo do Cronograma não carregou neste aparelho.");
      var obraId = String(rr.obraId), np = App._cronoSemPermissao ? App._cronoSemPermissao(obraId) : null;
      if (np) return falha(np);
      var alvo = App._cronoAlvoSemTela(obraId);
      if (!alvo || !alvo.avancoRec) return { feito: true, mudou: false, motivo: "a obra não tem avanço lançado" };
      var rec = alvo.avancoRec, corte = String(rec.corte || hoje()).slice(0, 10);
      var outros = K.lista("rdo").filter(function (d) { return d && d.obraId === rr.obraId && d.id !== rr.id; });
      var feito = B.opsRevisaoDiario(rec.nos, rr, outros);
      if (!feito.ops.length) return { feito: true, mudou: false, motivo: "nada a limpar" };
      feito.ops.forEach(function (op) { op.em = corte; });
      var ap = GanttUI.aplicarAvanco(rec, feito.ops);
      if (ap.erros.length) return falha(ap.erros[0] + ".");
      if (!ap.mudou) return { feito: true, mudou: false };
      var agora = new Date().toISOString();
      var res = gravarAvancoDoDiario(alvo, ap.rec, rec.atualizadoEm, agora);
      if (!res || !res.ok) return falha(String((res && res.erro) || "o Cronograma recusou a gravação") + (/nada foi gravado/i.test(String((res && res.erro) || "")) ? "" : " Nada foi gravado."));
      var ids = {}; feito.ops.forEach(function (op) { ids[op.id] = 1; });
      UI.toast("Revisão pedida. O fim lançado por este diário saiu do Cronograma (" + Object.keys(ids).length + " etapa(s)).", "ok", 7000);
      return { feito: true, mudou: true, etapas: Object.keys(ids) };
    } catch (e) { return falha("Erro inesperado: " + String((e && e.message) || e) + "."); }
  };

  G._bonifDiarioAprovado = function (rr) {
    var b = bonif();
    if (!b || !rr || !obraAtiva(rr.obraId)) return { feito: false, motivo: "obra fora da bonificação" };
    var itens = arr(rr.etapasDia).filter(function (e) { return e && e.noId != null; });
    if (!itens.length) return { feito: false, motivo: "sem etapas no diário" };
    var AVISO = "O diário foi aprovado, mas o avanço precisa ser lançado no Cronograma";
    function falha(motivo) { UI.toast(AVISO + ". " + motivo, "aviso", 9000); return { feito: false, motivo: motivo }; }
    try {
      if (typeof App === "undefined" || !App._cronoAlvoSemTela || !App._cronoGravarAvanco || typeof GanttUI === "undefined" || !GanttUI.aplicarAvanco || typeof CronoBase === "undefined")
        return falha("O módulo do Cronograma não carregou neste aparelho.");
      var obraId = String(rr.obraId);
      var np = App._cronoSemPermissao ? App._cronoSemPermissao(obraId) : null;
      if (np) return falha(np);
      var alvo = App._cronoAlvoSemTela(obraId);
      if (!alvo) return falha("Esta obra ainda não tem plano de execução no Cronograma.");
      var rec = alvo.avancoRec, baseEm = rec ? rec.atualizadoEm : null;
      var agora = new Date().toISOString();
      if (!rec) {
        rec = { id: "avanco_" + obraId, tipo: "avanco", fmt: 1, obraId: obraId, orcamentoId: String((alvo.plano && alvo.plano.orcamentoId) || (alvo.orc && alvo.orc.id) || ""),
          corte: App._cronoCorteDaTela ? App._cronoCorteDaTela(obraId) : hoje(), nos: [], por: App._cronoQuem ? App._cronoQuem() : quem(), criadoEm: agora, atualizadoEm: agora };
      }
      var corte = String(rec.corte || hoje()).slice(0, 10);
      /* ⚠ O DIÁRIO APROVADO EMPURRA O CORTE PARA A DATA DELE (só para frente, e nunca além de hoje).
         O Cronograma recusa data depois do corte; sem isto, todo diário de hoje caía no toast "lance o
         avanço no Cronograma", porque o corte gravado é o do último lançamento, e o diário aprovado nunca
         chegava ao avanço. É a mesma leitura do `CronoAvanco.cortePadrao`, que já tira o corte dos
         diários. Cópia rasa: o registro lido do disco não muda se a gravação for recusada. */
      var corteDoDiario = String(rr.data).slice(0, 10);
      if (corteDoDiario > hoje()) corteDoDiario = hoje();
      if (corteDoDiario > corte) { var recCopia = {}; for (var kc in rec) if (Object.prototype.hasOwnProperty.call(rec, kc)) recCopia[kc] = rec[kc]; recCopia.corte = corteDoDiario; rec = recCopia; corte = corteDoDiario; }
      /* a menor data de diário APROVADO de cada etapa (inclui este) */
      var menor = {}, rdos = K.lista("rdo");
      rdos.forEach(function (d) {
        if (!d || d.obraId !== rr.obraId || !B.aprovado(d) || !B.dataOk(d.data)) return;
        arr(d.etapasDia).forEach(function (e) { if (e && e.noId != null) { var k = String(e.noId), dt = String(d.data).slice(0, 10); if (!menor[k] || dt < menor[k]) menor[k] = dt; } });
      });
      /* este diário já está aprovado, mas a lista lida do disco pode ainda não o trazer */
      arr(rr.etapasDia).forEach(function (e) { if (e && e.noId != null && B.dataOk(rr.data)) { var k0 = String(e.noId), d0 = String(rr.data).slice(0, 10); if (!menor[k0] || d0 < menor[k0]) menor[k0] = d0; } });
      var dataRdo = String(rr.data).slice(0, 10), dentro = [], depoisDoCorte = [];
      itens.forEach(function (e) {
        var k = String(e.noId), ini = menor[k] || dataRdo;
        /* só sobra aqui o diário com data no futuro: o corte não passa de hoje */
        if (ini > corte || (e.concluiu && dataRdo > corte)) { depoisDoCorte.push(e.nome || k); return; }
        dentro.push({ noId: k, pct: e.pct, concluiu: !!e.concluiu, data: dataRdo, menorData: ini });
      });
      if (!dentro.length) return falha("As datas do diário passam do corte do avanço (" + diaBr(corte) + "). Lance o avanço no Cronograma.");
      var feito = B.opsDoDiario(rec.nos, dentro);
      if (!feito.ops.length) return { feito: true, mudou: false, motivo: "o avanço já estava igual ou maior" };
      feito.ops.forEach(function (op) { op.em = corte; });
      var ap = GanttUI.aplicarAvanco(rec, feito.ops);
      if (ap.erros.length) return falha(ap.erros[0] + ".");
      if (!ap.mudou) return { feito: true, mudou: false };
      /* origem diário nas entradas que este diário mexeu (o aplicarAvanco só conhece p, i, f e r) */
      var tocados = {}; feito.ops.forEach(function (op) { tocados[op.id] = 1; });
      ap.rec.nos.forEach(function (e) { if (e && tocados[e.id]) e.o = "diario"; });
      var res = gravarAvancoDoDiario(alvo, ap.rec, baseEm, agora);
      if (!res || !res.ok) return falha(String((res && res.erro) || "o Cronograma recusou a gravação") + (/nada foi gravado/i.test(String((res && res.erro) || "")) ? "" : " Nada foi gravado."));
      UI.toast("Diário aprovado e avanço lançado no Cronograma (" + Object.keys(tocados).length + " etapa(s))." + (depoisDoCorte.length ? " " + depoisDoCorte.length + " ficou(aram) de fora por passar do corte." : ""), depoisDoCorte.length ? "aviso" : "ok", 7000);
      return { feito: true, mudou: true, etapas: Object.keys(tocados), depoisDoCorte: depoisDoCorte };
    } catch (e) {
      return falha("Erro inesperado: " + String((e && e.message) || e) + ".");
    }
  };

})(typeof window !== "undefined" ? window : this);
