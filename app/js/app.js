/* =====================================================================
 * app.js — Orquestrador (controller). Liga estado, UI, eventos e Store.
 * Scripts "finos": a lógica de verdade vive em sinapi/bdi/orcamento.
 * ===================================================================== */
(function (global) {
  "use strict";

  var App = {
    tela: "login",       // "login" | "lista" | "editor"
    aba: "planilha",
    orcAtual: null,
    _addItemEtapaId: null,

    // ---------- Boot ----------
    iniciar: function () {
      Auth.init();
      // tema salvo
      var tema = localStorage.getItem("orcapro:tema") || "light";
      document.documentElement.setAttribute("data-tema", tema);

      // MODO DEMO (?demo=1) — orçamento genérico para vitrine/teste na página de vendas
      if (/[?&]demo=1/.test(location.search || "")) { return this._iniciarDemo(location.search || ""); }

      var self = this;
      // Carrega base SINAPI (própria da empresa, se houver; senão a padrão).
      this.carregarBaseSinapi().then(function (n) {
        console.log("[SINAPI] " + n + " itens (" + Sinapi.competencia + "/" + Sinapi.uf + ")");
        if (self.tela === "lista") self.render(); // atualiza o banner com o total real
        // auto-check de atualização (não bloqueia; só avisa se houver competência nova)
        if (typeof Atualizacao !== "undefined") {
          Atualizacao.verificar().then(function (info) {
            if (info.online && info.desatualizado) UI.toast("Nova competência SINAPI disponível: " + info.ultimaOficial + " — clique em 🔄 Atualizar.", "ok");
          }).catch(function () {});
        }
      }).catch(function (e) {
        console.warn("[SINAPI] não carregou:", e.message);
        UI.toast("Base SINAPI não carregou (rode via servidor local).", "erro");
      });

      this.bindGlobal();
      if (Auth.usuario()) { this.tela = "lista"; }
      this.render();
      // Auto-update do app: avisa se há versão nova (só no install local; no site/demo o endpoint não existe e é ignorado)
      if (typeof AutoUpdate !== "undefined") { setTimeout(function () { AutoUpdate.verificar(); }, 1800); }
      // licença: trial -> registra/ancora no servidor; licenciado -> revalida (renova carência / detecta bloqueio)
      try {
        if (typeof Licenca !== "undefined") {
          if (Licenca.status().trial) Licenca.registrarTeste();
          else Licenca.revalidar(function (r) { if (r && r.bloqueado) { try { self.render(); UI.toast("Licença: " + (r.erro || "ativada em outra máquina."), "erro"); } catch (e) {} } });
        }
      } catch (e) {}
      this.checarAtualizacao();
    },

    // ---------- Modo demonstração (vitrine) ----------
    _iniciarDemo: function (qs) {
      var aba = (qs.match(/[?&]aba=([a-z]+)/) || [])[1] || "planilha";
      Auth._usuario = { empresaId: "demo", empresa: "Construtora Modelo", email: "demo@orcapro.app", plano: "PRO" };
      try {
        if (typeof Empresa !== "undefined") Empresa.salvar({
          nome: "Construtora Modelo Ltda", cnpj: "00.000.000/0001-00", responsavel: "Eng. João da Silva",
          titulo: "Engenheiro Civil", crea: "CREA-MG 000000", registroNacional: "0000000000",
          cidade: "Uberlândia / MG", contato: "contato@construtoramodelo.com.br"
        });
      } catch (e) {}
      try { this.orcAtual = (typeof OrcDemo !== "undefined") ? OrcDemo.build() : Orcamento.novo({}); }
      catch (e) { this.orcAtual = Orcamento.novo({}); }
      this._demo = true;
      this.tela = "editor";
      this.aba = aba;
      this.bindGlobal();
      this.render();
      this.carregarBaseSinapi().then(function () {}).catch(function () {});
      var pr = (qs.match(/[?&]print=([a-z]+)/) || [])[1];
      if (pr) { var s = this; setTimeout(function () { try { if (pr === "laudo") s.gerarLaudo(); else if (pr === "proposta") s.gerarProposta(); else if (pr === "relatorio") s.gerarRelatorio(); } catch (e) {} }, 500); }
    },

    // ---------- Render dispatcher ----------
    render: function () {
      var topbar = UI.el("topbar");
      var main = UI.el("main");
      var sidebar = UI.el("sidebar");
      var app = document.querySelector(".app");
      if (this.tela === "login" || !Auth.usuario()) {
        if (app) { app.classList.add("tela-login"); app.classList.remove("com-sidebar"); }
        topbar.innerHTML = ""; topbar.style.display = "none";
        if (sidebar) sidebar.innerHTML = "";
        main.innerHTML = UI.renderLogin();
        return;
      }
      if (app) app.classList.remove("tela-login");
      topbar.style.display = "flex";
      topbar.innerHTML = UI.renderTopbar(Auth.usuario());
      var view = this.view || "orcamentos";
      var podeGestao = typeof Gestao !== "undefined" && !this._demo && Gestao.podeGestao();
      if (typeof Gestao !== "undefined" && !this._demo && !Gestao.podeGestao()) {
        // Sem Plus (base/sem licença): Gestão bloqueada p/ TODOS (dono e sub-usuário) → só Orçamento
        if (view !== "orcamentos") { view = "orcamentos"; this.view = "orcamentos"; }
      } else if (podeGestao && Auth.podeModulo && !Auth.podeModulo(view)) {
        // Plus: sub-usuário sem permissão p/ a view → vai p/ um módulo permitido (Painel é sempre liberado)
        view = Auth.podeModulo("dashboard") ? "dashboard" : "orcamentos";
        this.view = view;
      }
      // sidebar de módulos (não aparece na vitrine/demo)
      if (sidebar) {
        if (this._demo || typeof Gestao === "undefined") { sidebar.innerHTML = ""; if (app) app.classList.remove("com-sidebar"); }
        else { sidebar.innerHTML = Gestao.renderSidebar(view); if (app) app.classList.add("com-sidebar"); }
      }
      // módulos da Gestão
      if (view !== "orcamentos" && typeof Gestao !== "undefined") { main.innerHTML = Gestao.render(view); if (Gestao.afterRender) Gestao.afterRender(view); return; }
      // view = Orçamentos (fluxo original)
      if (this.tela === "editor" && this.orcAtual) {
        main.innerHTML = UI.renderEditor(this.orcAtual, this.aba);
      } else {
        this.tela = "lista";
        var r = Sinapi.resumo();
        var baseInfo = { competencia: r.competencia, uf: r.uf, total: r.total,
          personalizada: Store.temBaseSinapi(Auth.empresaId()) };
        main.innerHTML = UI.renderLista(Store.listarOrcamentos(Auth.empresaId()), baseInfo);
      }
    },

    // ---------- Eventos globais (delegação) ----------
    bindGlobal: function () {
      var self = this;
      document.body.addEventListener("click", function (e) { self.onClick(e); });
      document.body.addEventListener("change", function (e) { self.onChange(e); });
      document.body.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && self.tela === "login") self.entrar();
      });
    },

    onClick: function (e) {
      // celular: fecha a gaveta de módulos ao tocar fora dela (não no ☰, não num item)
      var _apM = document.querySelector(".app.menu-aberto");
      if (_apM && !(e.target.closest && (e.target.closest("#sidebar") || e.target.closest(".topbar-burger")))) { _apM.classList.remove("menu-aberto"); }
      // fecha o menu de conta ao clicar fora do botão (itens fecham após rodar sua ação)
      var _conta = document.querySelector(".topbar-conta.aberto");
      if (_conta && !(e.target.closest && e.target.closest('[data-acao="conta"]'))) { _conta.classList.remove("aberto"); }
      var t = e.target.closest("[data-acao],[data-abrir],[data-aba],[data-add-item],[data-del-etapa],[data-del-item],[data-ver-insumos],[data-base-remover],[data-atz-carregar],[data-atz-baixar],[data-conta],[data-inclusa],[data-view],[data-gacao],[data-gopen]");
      if (!t) return;
      // navegação por módulo (sidebar da Gestão)
      if (t.dataset.view) { var _apV = document.querySelector(".app"); if (_apV) _apV.classList.remove("menu-aberto"); this.view = t.dataset.view; this.tela = (t.dataset.view === "orcamentos" ? "lista" : "gestao"); this.orcAtual = null; this.render(); return; }
      // ações da Gestão (CRUD dos módulos)
      if (t.dataset.gacao) { if (typeof Gestao !== "undefined") Gestao.acao(t.dataset.gacao, t.dataset, this); return; }
      if (t.dataset.gopen) { if (typeof Gestao !== "undefined") { var gp = String(t.dataset.gopen).split(":"); Gestao.abrir(gp[0], gp[1]); } return; }
      // login: clicar numa conta salva preenche o e-mail
      if (t.dataset.conta) { var ce = UI.el("lg-email"); if (ce) ce.value = t.dataset.conta; var cs = UI.el("lg-senha"); if (cs) cs.focus(); return; }
      // carregar base inclusa (1 clique)
      if (t.dataset.inclusa) {
        var pin = String(t.dataset.inclusa).split("|"); var selfI = this;
        UI.toast("Carregando base inclusa…", "ok");
        Bases.carregarInclusa(pin[0], pin[1]).then(function (r) {
          UI.toast(r.fonte + " carregada: " + r.total.toLocaleString("pt-BR") + " itens (" + (r.competencia || "") + "/" + (r.uf || "") + ")." + (r.persistido ? "" : " ⚠ " + r.gravErro), r.persistido ? "ok" : "erro");
          selfI.abrirTabelas();
        }).catch(function (e) { UI.toast("Falhou: " + e.message, "erro"); });
        return;
      }

      // navegação por aba
      if (t.dataset.aba) { this.aba = t.dataset.aba; this.render(); return; }
      // abrir orçamento
      if (t.dataset.abrir) { this.abrirOrcamento(t.dataset.abrir); return; }
      // adicionar item a uma etapa -> abre busca SINAPI
      if (t.dataset.addItem) { this.abrirBuscaSinapi(t.dataset.addItem); return; }
      // renomear etapa (sem recriar)
      if (t.dataset.editEtapa) { this.renomearEtapa(t.dataset.editEtapa); return; }
      // remover etapa
      if (t.dataset.delEtapa) { this.removerEtapa(t.dataset.delEtapa); return; }
      // remover item "etapaId|itemId"
      if (t.dataset.delItem) {
        var pr = t.dataset.delItem.split("|");
        this.removerItem(pr[0], pr[1]); return;
      }
      // ver insumos (composição explodida)
      if (t.dataset.verInsumos) { this.verInsumos(t.dataset.verInsumos); return; }
      // remover base extra
      if (t.dataset.baseRemover) { Bases.remover(t.dataset.baseRemover); Bases.persistir(Auth.empresaId()); UI.toast("Base removida.", "ok"); this.abrirTabelas(); return; }
      // atualizar competência (carregar do cache / baixar da Caixa)
      if (t.dataset.atzCarregar) { this.carregarCompetencia(t.dataset.atzCarregar, true); return; }
      if (t.dataset.atzBaixar) { this.carregarCompetencia(t.dataset.atzBaixar, false); return; }

      var acao = t.dataset.acao;
      switch (acao) {
        case "entrar": this.entrar(); break;
        case "logout": if (typeof Nuvem !== "undefined") Nuvem.sair(); Auth.logout(); this.tela = "login"; this.orcAtual = null; this.render(); break;
        case "tema": this.alternarTema(); break;
        case "esqueci-senha": this.redefinirSenhaUI(); break;
        case "empresa": this.abrirEmpresa(); break;
        case "licenca": this.abrirLicenca(); break;
        case "backup": this.abrirBackup(); break;
        case "backup-export": this.exportarBackup(); break;
        case "menu": { var _apT = document.querySelector(".app"); if (_apT) _apT.classList.toggle("menu-aberto"); break; }
        case "conta": { var _c = t.closest(".topbar-conta"); if (_c) _c.classList.toggle("aberto"); break; }
        case "tabelas": this.abrirTabelas(); break;
        case "escanear-pasta": this.escanearPastaUI(); break;
        case "carregar-setop": this.carregarSetop(); break;
        case "cron-recalc": this.cronRecalc(); break;
        case "cron-reset": this.cronReset(); break;
        case "cron-ia": this.cronRefinarIA(); break;
        case "novo": this.novoOrcamento(); break;
        case "importar-sinapi": this.abrirImportSinapi(); break;
        case "atualizar": this.abrirAtualizar(); break;
        case "processar-import": this.processarImportSinapi(); break;
        case "voltar": this.tela = "lista"; this.orcAtual = null; this.render(); break;
        case "add-etapa": this.addEtapa(); break;
        case "salvar-bdi": this.salvarBdi(); break;
        case "exportar": this.exportar(); break;
        case "cenarios": this.compararCenarios(); break;
        case "aplicar-cenario": this.aplicarCenario(t.dataset.bdi); break;
        case "exportar-excel": this.exportarExcel(); break;
        case "config-orc": this.editarDadosOrc(); break;
        case "escopo": this.abrirEscopo(); break;
        case "escopo-ia": this.analisarEscopoIA(); break;
        case "escopo-casar": this.refinarEscopoCasar(); break;
        case "escopo-analisar": this.analisarEscopo(); break;
        case "escopo-confirmar": this.confirmarEscopo(); break;
        case "proposta": this.gerarProposta(); break;
        case "laudo": this.gerarLaudo(); break;
        case "relatorio": this.gerarRelatorio(); break;
        case "proposta-imprimir": window.print(); break;
        case "proposta-fechar": this.fecharProposta(); break;
      }
    },

    onChange: function (e) {
      // upload do logo da empresa (arquivo -> base64 -> preview)
      if (e.target.id === "emp-logo") {
        var file = e.target.files && e.target.files[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) { UI.toast("Logo muito grande (máx. 2 MB).", "erro"); return; }
        var self = this, rd = new FileReader();
        rd.onload = function () {
          self._logoPendente = rd.result;
          var prev = UI.el("emp-logo-prev");
          if (prev) prev.innerHTML = '<img src="' + rd.result + '" style="max-height:72px;border:1px solid var(--linha);border-radius:6px;padding:4px;background:#fff">';
        };
        rd.readAsDataURL(file);
        return;
      }
      // restaurar backup de orçamentos
      if (e.target.id === "bkp-file") { var bf = e.target.files && e.target.files[0]; if (bf) this.importarBackup(bf); return; }
      // ligar/desligar base de preço
      if (e.target.matches("[data-base-toggle]")) { Bases.setAtiva(e.target.dataset.baseToggle, e.target.checked); return; }
      // editar duração de etapa no cronograma
      if (e.target.matches("[data-cron-dur]")) {
        var o = this.orcAtual; if (!o) return;
        o.cronograma = o.cronograma || {}; o.cronograma.duracoes = o.cronograma.duracoes || {};
        o.cronograma.duracoes[e.target.dataset.cronDur] = Math.max(1, parseInt(Util.num(e.target.value), 10) || 1);
        this.persistir(); this.render(); return;
      }
      // edição inline de quantidade/custo na planilha
      if (e.target.matches("input.cell[data-edit]")) {
        var d = e.target.dataset;
        var campos = {}; campos[d.edit] = e.target.value;
        Orcamento.atualizarItem(this.orcAtual, d.eta, d.itm, campos);
        this.persistir();
        this.render();
      }
      // BDI live
      if (e.target.id === "bdi-modelo") {
        var mod = e.target.value;
        if (mod !== "custom") {
          var p = (mod === "dnit" && typeof DnitBdi !== "undefined") ? DnitBdi.params() : Bdi.paramsDoModelo(mod);
          ["AC", "S", "R", "G", "DF", "L", "I"].forEach(function (k) {
            var inp = UI.el("bdi-" + k); if (inp) inp.value = Util.fmtNum(p[k], 2);
          });
          this.recalcBdiPreview();
        }
      }
      if (e.target.id && e.target.id.indexOf("bdi-") === 0 && e.target.id !== "bdi-modelo") {
        var sel = UI.el("bdi-modelo"); if (sel) sel.value = "custom";
        this.recalcBdiPreview();
      }
      // Escopo: troca de candidato / quantidade
      if (e.target.matches("[data-esc-pick]")) {
        var i = +e.target.dataset.escPick;
        this._escopo[i].escolhido = parseInt(e.target.value, 10);
        this._refreshConfianca(i);
      }
      if (e.target.matches("[data-esc-qtd]")) {
        var j = +e.target.dataset.escQtd;
        this._escopo[j].quantidade = Util.num(e.target.value);
      }
      // Cronograma: muda nº de meses (edição do usuário TRAVA o prazo — FASE 1.4)
      if (e.target.id === "cron-meses") {
        var n = parseInt(Util.num(e.target.value), 10);
        if (n >= 1 && n <= 60) { this.orcAtual.cronogramaMeses = n; this.orcAtual.cronogramaMesesManual = true; this.persistir(); this.render(); }
      }
    },

    _refreshConfianca: function (i) {
      var l = this._escopo[i];
      var cell = document.querySelector('[data-esc-conf="' + i + '"]');
      if (!cell) return;
      if (l.escolhido > -1 && l.candidatos[l.escolhido]) {
        var c = l.candidatos[l.escolhido], n = Escopo.nivel(c.confianca);
        cell.innerHTML = '<span class="pill" style="background:var(--' + n.cor + ');color:#fff">' + n.rotulo + ' ' + c.confianca + '%</span>';
      } else {
        cell.innerHTML = '<span class="pill proprio">Pendente</span>';
      }
    },

    // ---------- Login ----------
    entrar: function () {
      var empresa = (UI.el("lg-empresa") || {}).value || "Minha Empresa";
      var email = (UI.el("lg-email") || {}).value;
      var senha = (UI.el("lg-senha") || {}).value;
      if (!Util.naoVazio(email) || !Util.naoVazio(senha)) { UI.toast("Informe e-mail e senha.", "erro"); return; }
      // conta-dono OU login de sub-usuário existente → não registrar conta nova
      var jaExiste = Auth.existeEmail(email) || (Auth.existeLoginEquipe && Auth.existeLoginEquipe(email));
      var r = Auth.login(email, senha);
      if (!r.ok) {
        if (jaExiste) {
          // conta/usuário existe → senha errada. NÃO cria conta nova (os dados estão salvos nesta).
          UI.toast("Senha incorreta para " + email + ". Tente de novo ou use “Esqueci a senha” (se for o dono da conta).", "erro");
          return;
        }
        // e-mail novo → cria conta (1º acesso)
        r = Auth.registrar(empresa, email, senha);
        if (!r.ok) { UI.toast(r.erro, "erro"); return; }
        UI.toast("Conta criada. Bem-vindo!", "ok");
      } else {
        UI.toast("Bem-vindo de volta!", "ok");
      }
      this.tela = "lista";
      this.render();
      // recarrega a base SINAPI específica desta empresa (se importou uma própria)
      var self = this;
      this.carregarBaseSinapi().then(function () { if (self.tela === "lista") self.render(); });
      // Sincronização na nuvem — só age se CONFIG.backend.sync === true (inerte por padrão).
      if (typeof Nuvem !== "undefined" && Nuvem.disponivel()) {
        var eid = Auth.empresaId();
        Nuvem.entrar(email, senha)
          .then(function () { return Nuvem.sincronizar(eid); })
          .then(function () {
            Nuvem.escutar(eid, function () { if (self.tela === "lista") self.render(); });
            if (self.tela === "lista") self.render();
            UI.toast("☁ Dados sincronizados na nuvem.", "ok");
          })
          .catch(function (e) { console.warn("[nuvem] " + (e && (e.code || e.message))); });
      }
    },

    // Esqueci a senha (redefinição local — é o próprio navegador/dados do usuário)
    redefinirSenhaUI: function () {
      var email = ((UI.el("lg-email") || {}).value || "").trim();
      if (!Util.naoVazio(email)) { UI.toast("Digite (ou clique) o e-mail da conta primeiro.", "erro"); return; }
      if (!Auth.existeEmail(email)) { UI.toast("Não há conta com esse e-mail neste navegador.", "erro"); return; }
      var nova = window.prompt("Defina uma NOVA senha para " + email + "\n(é o seu próprio navegador — seus orçamentos continuam salvos):");
      if (nova === null) return;
      if (!Util.naoVazio(nova)) { UI.toast("Senha vazia.", "erro"); return; }
      var r = Auth.redefinirSenha(email, nova);
      if (!r.ok) { UI.toast(r.erro, "erro"); return; }
      UI.toast("Senha redefinida! Entrando…", "ok");
      this.tela = "lista"; this.render();
      var self = this; this.carregarBaseSinapi().then(function () { if (self.tela === "lista") self.render(); });
    },

    // ---------- Base SINAPI (própria da empresa ou padrão) ----------
    _analiticoArquivo: null,   // caminho do analítico do estado ATIVO (data/sinapi-<UF>-analitico.json)
    _baseUf: null,             // UF da base SINAPI ativa
    _estados: null,            // manifesto data/estados.json: [{uf,arquivo,competencia,analitico}]
    _ufReq: 0,                 // token monotônico: só a troca de estado mais recente comita
    _ufPendente: null,         // UF em carregamento (evita re-disparo do mesmo alvo)

    carregarBaseSinapi: function () {
      var self = this, emp = Auth.empresaId();
      // Prime os blobs grandes (IndexedDB) ANTES de ler a base/bases extras (leitura síncrona do cache).
      var prime = (typeof Store !== "undefined" && Store.initBigStore) ? Store.initBigStore(emp) : Promise.resolve();
      return prime.then(function () {
        if (typeof Bases !== "undefined") { try { Bases.carregar(emp); } catch (e) {} }
        var base = Store.lerBaseSinapi(emp);
        if (base && base.dados && base.dados.length) {
          Sinapi.carregarDe(base);
          return Sinapi.resumo().total;
        }
        // base padrão: respeita a escolha da instalação (data/base-ativa.json), senão a do CONFIG
        return fetch("data/base-ativa.json")
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (cfg) {
            self._analiticoArquivo = (cfg && cfg.analitico) || null;
            self._baseUf = (cfg && cfg.uf) || null;
            return Sinapi.carregarArquivo(cfg && cfg.arquivo ? cfg.arquivo : undefined);
          })
          .catch(function () { return Sinapi.carregarArquivo(); });
      });
    },

    // Manifesto dos estados disponíveis no pacote (para o seletor "Brasil todo").
    _carregarEstados: function () {
      var self = this;
      if (self._estados) return Promise.resolve(self._estados);
      return fetch("data/estados.json")
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { self._estados = (j && Array.isArray(j.estados)) ? j.estados : []; return self._estados; })
        .catch(function () { self._estados = []; return self._estados; });
    },

    // Troca a base SINAPI ativa para outra UF (lazy). cb(true|false).
    trocarEstadoSinapi: function (uf, cb) {
      var self = this;
      var est = (self._estados || []).filter(function (e) { return e.uf === uf; })[0];
      if (!est || !est.arquivo) { UI.toast("Estado " + uf + " não disponível neste pacote.", "erro"); if (cb) cb(false); return; }
      var req = ++self._ufReq; // só a troca mais recente comita (evita corrida em cliques rápidos)
      UI.toast("Carregando SINAPI " + uf + "…", "ok");
      Sinapi.carregarArquivo(est.arquivo, true).then(function () { // semFallback: mantém base atual se o arquivo faltar
        if (req !== self._ufReq) return; // troca obsoleta — descarta silenciosamente
        // Defesa extra: se por algum motivo a UF carregada != a pedida, trata como erro.
        if (String(Sinapi.uf).toUpperCase() !== String(uf).toUpperCase()) {
          UI.toast("Base SINAPI de " + uf + " não confere (arquivo inesperado).", "erro");
          if (cb) cb(false); return;
        }
        self._analiticoArquivo = est.analitico || null;
        self._baseUf = uf;
        if (typeof Analitico !== "undefined" && Analitico.reset) Analitico.reset(); // descarta analítico da UF anterior
        UI.toast("SINAPI " + uf + " · " + (Sinapi.competencia || "") + " — " + Sinapi.resumo().total.toLocaleString("pt-BR") + " itens.", "ok");
        if (cb) cb(true);
      }).catch(function (e) {
        if (req !== self._ufReq) return;
        UI.toast("Falha ao carregar " + uf + ": " + (e && e.message), "erro"); if (cb) cb(false);
      });
    },

    abrirImportSinapi: function () {
      var self = this;
      UI.modal("⬆ Importar base SINAPI", UI.renderImportSinapi(Sinapi.resumo()), [
        { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
        { texto: "Importar", classe: "primary", onClick: function () { self.processarImportSinapi(); } }
      ]);
    },

    processarImportSinapi: function () {
      var self = this;
      var fileInput = UI.el("imp-file");
      var f = fileInput && fileInput.files && fileInput.files[0];
      if (f) {
        var rd = new FileReader();
        rd.onload = function () { self._fazerImport(rd.result, f.name); };
        rd.onerror = function () { UI.toast("Falha ao ler o arquivo.", "erro"); };
        rd.readAsText(f);
        return;
      }
      // nome neutro: deixa o importarTexto detectar JSON vs CSV pelo conteúdo
      this._fazerImport((UI.el("imp-text") || {}).value, "colado.txt");
    },

    _fazerImport: function (texto, nome) {
      var opts = { competencia: (UI.el("imp-comp") || {}).value, uf: (UI.el("imp-uf") || {}).value };
      var r = Sinapi.importarTexto(texto, nome, opts);
      if (!r.ok) { UI.toast("Importação falhou: " + r.erro, "erro"); return; }
      var grav = Store.salvarBaseSinapi(Auth.empresaId(), r.pacote);
      UI.fecharModal();
      this.render();
      if (grav.ok) UI.toast("Base importada: " + r.total.toLocaleString("pt-BR") + " itens (" + r.competencia + "/" + r.uf + ").", "ok");
      else UI.toast(r.total.toLocaleString("pt-BR") + " itens carregados. " + grav.erro, "erro");
    },

    // ---------- Backup dos Orçamentos (exportar/importar) ----------
    abrirBackup: function () {
      var n = Store.listarOrcamentos(Auth.empresaId()).length;
      var html = '<p>Você tem <b>' + n + '</b> orçamento(s) salvos nesta conta (' + Util.esc((Auth.usuario() || {}).email || "") + ').</p>' +
        '<p class="muted">Exporte um arquivo <b>.json</b> para guardar/transferir. Importar <b>restaura/mescla</b> os orçamentos do arquivo nesta conta — nada é apagado.</p>' +
        '<div class="flex" style="gap:10px;margin-top:10px"><button class="btn primary" data-acao="backup-export">💾 Exportar backup</button></div>' +
        '<div class="field" style="margin-top:14px"><label>Restaurar de um backup (.json)</label><input type="file" id="bkp-file" accept=".json,application/json"></div>';
      UI.modal("💾 Backup dos Orçamentos", html, [{ texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } }]);
    },
    exportarBackup: function () {
      var eid = Auth.empresaId();
      var dump = { app: "OrçaPRO", versao: CONFIG.versao, exportadoEm: Util.agoraISO(), empresa: (Auth.usuario() || {}).empresa, email: (Auth.usuario() || {}).email, orcamentos: Store.listarOrcamentos(eid), prefs: Store.lerPrefs(eid) };
      var blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url; a.download = "orcapro-backup-" + new Date().toISOString().slice(0, 10) + ".json";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
      UI.toast(dump.orcamentos.length + " orçamento(s) exportado(s).", "ok");
    },
    importarBackup: function (file) {
      var self = this, rd = new FileReader();
      rd.onload = function () {
        try {
          var dump = JSON.parse(rd.result);
          var orcs = Util.arr(dump.orcamentos);
          if (!orcs.length) { UI.toast("Backup sem orçamentos.", "erro"); return; }
          var eid = Auth.empresaId();
          orcs.forEach(function (o) { Store.salvarOrcamento(eid, o); });
          if (dump.prefs && typeof dump.prefs === "object") {
            var atual = Store.lerPrefs(eid) || {};
            for (var k in dump.prefs) if (atual[k] == null) atual[k] = dump.prefs[k];
            Store.salvarPrefs(eid, atual);
          }
          UI.toast(orcs.length + " orçamento(s) restaurado(s).", "ok");
          UI.fecharModal(); self.tela = "lista"; self.render();
        } catch (e) { UI.toast("Arquivo inválido: " + e.message, "erro"); }
      };
      rd.readAsText(file);
    },

    // ---------- Licença ----------
    abrirLicenca: function () {
      var self = this;
      UI.modal("🔑 Licença do OrçaPRO", UI.renderLicenca(Licenca.status()), [
        { texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
        { texto: "Ativar", classe: "primary", onClick: function () { self.salvarLicenca(); } }
      ]);
    },
    salvarLicenca: function () {
      var chave = (UI.el("lic-chave") || {}).value || "";
      if (!Util.naoVazio(chave)) { UI.toast("Cole a chave de licença.", "erro"); return; }
      var self = this;
      UI.toast("Ativando licença…", "ok");
      Licenca.ativarOnline(chave, function (r) {
        if (!r.ok) { UI.toast(r.erro || "Chave inválida.", "erro"); return; }
        UI.fecharModal();
        UI.toast(r.offline ? "✓ Licença ativada." : "✓ Licença ativada e vinculada a esta máquina!", "ok");
        self.render();
      });
    },

    // ---------- Atualização do sistema (auto-update: avisa e o cliente baixa, sem perder dados) ----------
    checarAtualizacao: function () {
      try {
        if (this._demo) return;
        var srv = (typeof CONFIG !== "undefined" && CONFIG.licencaServer) ? String(CONFIG.licencaServer).replace(/\/$/, "") : "";
        if (!srv || typeof fetch === "undefined") return;
        var atual = (CONFIG.versao || "1.0.0"), self = this;
        fetch(srv + "/api/versao").then(function (r) { return r.json(); }).then(function (d) {
          if (d && d.versao && self._versaoMaior(d.versao, atual)) self._avisarAtualizacao(d);
        }).catch(function () {});
      } catch (e) {}
    },
    _versaoMaior: function (a, b) {
      var pa = String(a).split("."), pb = String(b).split(".");
      for (var i = 0; i < 3; i++) { var x = parseInt(pa[i] || 0, 10), y = parseInt(pb[i] || 0, 10); if (x > y) return true; if (x < y) return false; }
      return false;
    },
    _avisarAtualizacao: function (d) {
      var nov = d.novidades ? ("<div class=\"card\" style=\"margin-top:8px\">" + Util.esc(d.novidades) + "</div>") : "";
      var html = "<p>Uma versão nova do OrçaPRO (<b>" + Util.esc(d.versao) + "</b>) está disponível! 🎉</p>" + nov +
        "<p class=\"muted\" style=\"margin-top:10px\">Pode atualizar tranquilo: <b>seus orçamentos e dados continuam salvos</b> (ficam no seu navegador).</p>";
      var botoes = [{ texto: "Agora não", classe: "ghost", onClick: function () { UI.fecharModal(); } }];
      if (d.downloadUrl) botoes.push({ texto: "⬇ Baixar atualização", classe: "primary", onClick: function () { window.open(d.downloadUrl, "_blank"); UI.fecharModal(); } });
      UI.modal("🔄 Atualização disponível", html, botoes);
    },

    // ---------- Empresa / Responsável Técnico ----------
    abrirEmpresa: function () {
      var self = this;
      this._logoPendente = undefined; // undefined=inalterado · string=novo logo
      var bg = UI.modal("⚙ Empresa / Responsável Técnico", UI.renderEmpresa(Empresa.dados(), Empresa.logo()), [
        { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
        { texto: "Salvar", classe: "primary", onClick: function () { self.salvarEmpresa(); } }
      ]);
      var m = bg && bg.querySelector(".modal"); if (m) m.style.maxWidth = "660px";
    },
    salvarEmpresa: function () {
      var dados = {};
      Empresa.campos.forEach(function (k) { var el = UI.el("emp-" + k); dados[k] = el ? el.value : ""; });
      Empresa.salvar(dados, this._logoPendente);
      UI.fecharModal();
      UI.toast("Dados da empresa salvos. Aparecem nos documentos.", "ok");
    },

    // ---------- Atualizar tabelas (backend sinapi-fetcher) ----------
    abrirAtualizar: function () {
      var bg = UI.modal("🔄 Atualizar Tabelas de Preço", '<div id="atz-body" class="muted">Verificando o backend (sinapi-fetcher :3040)…</div>',
        [{ texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } }]);
      var m = bg && bg.querySelector(".modal"); if (m) m.style.maxWidth = "640px";
      Atualizacao.verificar().then(function (info) {
        var el = UI.el("atz-body"); if (el) el.innerHTML = UI.renderAtualizar(info);
      }).catch(function (e) {
        var el = UI.el("atz-body"); if (el) el.innerHTML = '<div class="vazio card">Erro ao verificar: ' + Util.esc(e.message) + '</div>';
      });
    },
    carregarCompetencia: function (mes, jaCache) {
      var self = this, uf = (typeof Sinapi !== "undefined" ? Sinapi.uf : "MG") || "MG";
      UI.toast(jaCache ? ("Carregando " + mes + "…") : ("Baixando " + mes + " da Caixa (30–60s)…"), "ok");
      Atualizacao.baixar(mes, uf, jaCache).then(function (r) {
        var n = (typeof r === "number") ? r : r.total;
        var persistido = (typeof r === "number") ? true : r.persistido;
        var gravErro = (typeof r === "number") ? "" : r.gravErro;
        if (persistido) UI.toast("SINAPI atualizada: " + n.toLocaleString("pt-BR") + " itens (" + mes + "/" + uf + ").", "ok");
        else UI.toast(n.toLocaleString("pt-BR") + " itens carregados nesta sessão, mas não couberam no armazenamento — exporte um backup e libere espaço.", "erro");
        UI.fecharModal();
        self.render();
      }).catch(function (e) { UI.toast("Falhou: " + e.message, "erro"); });
    },

    // Cronograma — recalcular com os parâmetros / limpar edições de duração
    cronRecalc: function () {
      var o = this.orcAtual; if (!o) return;
      o.cronograma = o.cronograma || {};
      o.cronograma.params = {
        dataInicio: (UI.el("cron-inicio") || {}).value || null,
        equipes: Math.max(1, parseInt(Util.num((UI.el("cron-equipes") || {}).value), 10) || 1),
        diasUteisSemana: Math.min(7, Math.max(1, parseInt(Util.num((UI.el("cron-dias") || {}).value), 10) || 5)),
        paralelismo: Util.num((UI.el("cron-paral") || {}).value),
        custoDiaEquipe: Math.max(1, Util.num((UI.el("cron-custodia") || {}).value) || 700)
      };
      this.persistir(); this.render();
    },
    cronReset: function () {
      var o = this.orcAtual; if (o && o.cronograma) { o.cronograma.duracoes = {}; o.cronograma.iaMotivos = {}; }
      // FASE 1.4: destrava também o nº de meses (false explícito ≠ undefined: não re-dispara a migração)
      if (o) { o.cronogramaMesesManual = false; try { Orcamento.sincronizarPrazo(o); } catch (e) {} }
      this.persistir(); UI.toast("Durações e prazo voltaram à estimativa do agente.", "ok"); this.render();
    },
    // Refina as durações com a IA do ERP (planejador) — fonte de verdade = backend (chave da IA fica lá)
    cronRefinarIA: function () {
      var o = this.orcAtual; if (!o || !(o.etapas || []).length) return;
      var r = Cronograma.estimar(o), self = this;
      var etapas = o.etapas.map(function (e, i) {
        return {
          i: i, id: e.id, nome: e.nome, categoria: r.etapas[i].categoriaNome, duracaoAtual: r.etapas[i].duracao,
          itens: (e.itens || []).slice(0, 15).map(function (it) { return { descricao: it.descricao, quantidade: it.quantidade, unidade: it.unidade }; })
        };
      });
      var back = (typeof CONFIG !== "undefined" && CONFIG.iaBackend) ? CONFIG.iaBackend : "http://localhost:3041";
      UI.toast("🤖 Consultando a IA do ERP (planejador)…", "ok");
      fetch(back + "/ia/cronograma", { method: "POST", headers: { "Content-Type": "application/json", "x-licenca": (typeof Licenca !== "undefined" ? Licenca.chave() : "") }, body: JSON.stringify({ etapas: etapas, equipes: (r.params.equipes || 1) }) })
        .then(function (resp) { return resp.json(); })
        .then(function (j) {
          if (!j.ok) { UI.toast("IA: " + (j.error || "não retornou"), "erro"); return; }
          o.cronograma = o.cronograma || {}; o.cronograma.duracoes = o.cronograma.duracoes || {}; o.cronograma.iaMotivos = {};
          var n = 0;
          (j.etapas || []).forEach(function (x) { var et = etapas[x.i]; if (et && x.dias >= 1) { o.cronograma.duracoes[et.id] = Math.round(Util.num(x.dias)); o.cronograma.iaMotivos[et.id] = x.motivo || ""; n++; } });
          self.persistir();
          UI.toast("🤖 " + n + " etapas refinadas pela IA (" + (j.provider || "") + "). Passe o mouse no 🤖 p/ ver o motivo; edite se quiser.", "ok");
          self.render();
        })
        .catch(function (e) { UI.toast("Sem conexão com a IA — o ERP/servidor (porta 3040) está ligado? " + e.message, "erro"); });
    },

    // SETOP regionalizado — carrega usando o preço da região escolhida
    carregarSetop: function () {
      var self = this, reg = (UI.el("setop-regiao") || {}).value || "Triangulo";
      var regime = (UI.el("setop-regime") || {}).value || "desonerada";
      var arq = regime === "onerada" ? "data/setop-MG-onerada-current.json" : "data/setop-MG-current.json";
      UI.toast("Carregando SETOP (" + reg + ", " + regime + ")…", "ok");
      Bases.carregarInclusa(arq, "SETOP", reg).then(function (r) {
        UI.toast("SETOP-MG · " + reg + " · " + regime + ": " + r.total.toLocaleString("pt-BR") + " itens." + (r.persistido ? "" : " ⚠ " + r.gravErro), r.persistido ? "ok" : "erro");
        self.abrirTabelas();
      }).catch(function (e) { UI.toast("Falhou: " + e.message, "erro"); });
    },

    // Escanear pasta inteira (multi-base) via fetcher
    escanearPastaUI: function () {
      var self = this;
      var caminho = ((UI.el("scan-pasta") || {}).value || "").trim();
      var uf = (UI.el("scan-uf") || {}).value || "";
      var mes = (UI.el("scan-mes") || {}).value || "";
      var deson = !!((UI.el("scan-deson") || {}).checked);
      if (!caminho) { UI.toast("Informe o nome da pasta (dentro do projeto do ERP).", "erro"); return; }
      UI.toast("Escaneando '" + caminho + "' (pode levar ~30s)…", "ok");
      Atualizacao.escanearPasta(caminho, uf, mes, deson).then(function (r) {
        var resumo = r.carregadas.map(function (c) { return c.fonte + " " + c.total.toLocaleString("pt-BR"); }).join(" · ");
        UI.toast("Importado: " + resumo + " (" + r.mes + "/" + r.uf + ")" + (r.persistido ? "" : " — " + r.gravErro), "ok");
        self.abrirTabelas();
      }).catch(function (e) { UI.toast("Falhou: " + e.message + " (o backend/ERP está ligado?)", "erro"); });
    },

    // ---------- Tabelas de Preço (multi-base) ----------
    abrirTabelas: function () {
      var self = this;
      var bg = UI.modal("🗂 Tabelas de Preço (multi-base)", UI.renderTabelas(Bases.lista()), [
        { texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
        { texto: "Importar base", classe: "primary", onClick: function () { self.importarBase(); } }
      ]);
      var m = bg && bg.querySelector(".modal"); if (m) m.style.maxWidth = "740px";
    },
    importarBase: function () {
      var self = this;
      var fonte = (UI.el("tab-fonte") || {}).value || "PROPRIA";
      var uf = (UI.el("tab-uf") || {}).value || "";
      var fileInput = UI.el("tab-file");
      var f = fileInput && fileInput.files && fileInput.files[0];
      var concluir = function (texto, nome) {
        var r = Bases.importarTexto(fonte, texto, nome, { uf: uf });
        if (!r.ok) { UI.toast("Importação falhou: " + r.erro, "erro"); return; }
        var grav = Bases.persistir(Auth.empresaId());
        UI.toast(r.total.toLocaleString("pt-BR") + " itens de " + r.fonte + " importados" + (grav.ok ? "." : " — " + grav.erro), grav.ok ? "ok" : "erro");
        self.abrirTabelas();
      };
      if (f) { var rd = new FileReader(); rd.onload = function () { concluir(rd.result, f.name); }; rd.onerror = function () { UI.toast("Falha ao ler arquivo.", "erro"); }; rd.readAsText(f); }
      else { concluir((UI.el("tab-text") || {}).value, "colado.txt"); }
    },

    alternarTema: function () {
      var atual = document.documentElement.getAttribute("data-tema");
      var novo = atual === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-tema", novo);
      localStorage.setItem("orcapro:tema", novo);
    },

    // ---------- Orçamentos ----------
    novoOrcamento: function () {
      var lista = Store.listarOrcamentos(Auth.empresaId());
      var limite = Auth.limite("limiteOrcamentos");
      if (lista.length >= limite) {
        UI.toast("Plano " + CONFIG.planos[Auth.plano()].nome + " permite só " + limite + " orçamentos. Faça upgrade.", "erro");
        return;
      }
      var self = this;
      UI.modal("Novo Orçamento",
        '<div class="field"><label>Nome do orçamento</label><input id="no-nome" placeholder="Ex.: Residência Unifamiliar 180m²"></div>' +
        '<div class="row"><div class="field"><label>Cliente</label><input id="no-cliente" placeholder="Nome do cliente"></div>' +
        '<div class="field"><label>Obra / Local</label><input id="no-obra" placeholder="Ex.: Bairro Centro"></div></div>',
        [
          { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
          { texto: "Criar", classe: "primary", onClick: function () {
            var orc = Orcamento.novo({
              nome: (UI.el("no-nome") || {}).value || "Novo Orçamento",
              cliente: (UI.el("no-cliente") || {}).value || "",
              obra: (UI.el("no-obra") || {}).value || ""
            });
            Store.salvarOrcamento(Auth.empresaId(), orc);
            UI.fecharModal();
            self.orcAtual = orc; self.tela = "editor"; self.aba = "planilha";
            self.render();
            UI.toast("Orçamento criado.", "ok");
          } }
        ]);
    },

    abrirOrcamento: function (id) {
      var orc = Store.obterOrcamento(Auth.empresaId(), id);
      if (!orc) { UI.toast("Orçamento não encontrado.", "erro"); return; }
      // Conserta acentos/ç corrompidos (mojibake) de versões antigas — sem o usuário recriar nada.
      try {
        var reparos = Orcamento.repararTexto(orc);
        var fontes = 0, prazo = false;
        try { fontes = Orcamento.repararFontes(orc); } catch (e2) {} // FASE 1.2: Fonte honesta
        try { prazo = Orcamento.sincronizarPrazo(orc); } catch (e3) {} // FASE 1.4: prazo único
        if (reparos > 0 || fontes > 0 || prazo) {
          Store.salvarOrcamento(Auth.empresaId(), orc);
          if (reparos > 0) UI.toast("Corrigimos automaticamente " + reparos + " descrição(ões) com acentos.", "ok");
          if (fontes > 0) UI.toast("Fonte de " + fontes + " item(ns) corrigida (não eram SINAPI).", "ok");
        }
      } catch (e) {}
      this.orcAtual = orc; this.tela = "editor"; this.aba = "planilha";
      this.render();
    },

    editarDadosOrc: function () {
      var o = this.orcAtual, self = this;
      o.cliente = o.cliente || { nome: "", doc: "", contato: "" };
      o.obra = o.obra || { nome: "", local: "", regime: "Empreitada" };
      var c = Orcamento.garantirComercial(o);
      UI.modal("Dados do Orçamento",
        '<div class="field"><label>Nome</label><input id="ed-nome" value="' + Util.esc(o.nome) + '"></div>' +
        '<div class="row"><div class="field"><label>Cliente</label><input id="ed-cliente" value="' + Util.esc(o.cliente.nome) + '"></div>' +
        '<div class="field"><label>Obra/Local</label><input id="ed-obra" value="' + Util.esc(o.obra.nome) + '"></div></div>' +
        '<div class="row"><div class="field"><label>Competência SINAPI</label><input id="ed-comp" value="' + Util.esc(o.competenciaSinapi) + '"></div>' +
        '<div class="field"><label>UF</label><input id="ed-uf" value="' + Util.esc(o.uf) + '"></div></div>' +
        '<div class="field"><label>ART/RRT nº (opcional — aparece no Anexo p/ Laudo)</label><input id="ed-art" value="' + Util.esc(o.art || "") + '" placeholder="ex.: MG20260000000"></div>' +
        '<h3 style="margin:8px 0;border-top:1px solid var(--linha);padding-top:14px">Dados para a Proposta Comercial</h3>' +
        '<div class="field"><label>Condições de pagamento</label><textarea id="ed-pag" rows="2">' + Util.esc(c.condicoesPagamento) + '</textarea></div>' +
        '<div class="row"><div class="field"><label>Prazo de execução</label><input id="ed-prazo" value="' + Util.esc(c.prazoExecucao) + '"></div>' +
        '<div class="field"><label>Validade da proposta</label><input id="ed-val" value="' + Util.esc(c.validadeProposta) + '"></div></div>' +
        '<div class="field"><label>Garantia</label><textarea id="ed-gar" rows="2">' + Util.esc(c.garantia) + '</textarea></div>' +
        '<div class="row"><div class="field"><label>Incluso (1 por linha)</label><textarea id="ed-inc" rows="4">' + Util.esc(c.incluso) + '</textarea></div>' +
        '<div class="field"><label>Não incluso (1 por linha)</label><textarea id="ed-exc" rows="4">' + Util.esc(c.excluso) + '</textarea></div></div>',
        [
          { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
          { texto: "Salvar", classe: "primary", onClick: function () {
            o.nome = (UI.el("ed-nome") || {}).value || o.nome;
            o.cliente.nome = (UI.el("ed-cliente") || {}).value || "";
            o.obra.nome = (UI.el("ed-obra") || {}).value || "";
            o.competenciaSinapi = (UI.el("ed-comp") || {}).value || o.competenciaSinapi;
            o.uf = (UI.el("ed-uf") || {}).value || o.uf;
            o.art = (UI.el("ed-art") || {}).value || "";
            c.condicoesPagamento = (UI.el("ed-pag") || {}).value || "";
            c.prazoExecucao = (UI.el("ed-prazo") || {}).value || "";
            c.validadeProposta = (UI.el("ed-val") || {}).value || "";
            c.garantia = (UI.el("ed-gar") || {}).value || "";
            c.incluso = (UI.el("ed-inc") || {}).value || "";
            c.excluso = (UI.el("ed-exc") || {}).value || "";
            self.persistir(); UI.fecharModal(); self.render(); UI.toast("Dados salvos.", "ok");
          } }
        ]);
    },

    addEtapa: function () {
      var self = this;
      UI.modal("Nova Etapa",
        '<div class="field"><label>Nome da etapa</label><input id="et-nome" placeholder="Ex.: 2.0 Fundações"></div>',
        [
          { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
          { texto: "Adicionar", classe: "primary", onClick: function () {
            Orcamento.addEtapa(self.orcAtual, (UI.el("et-nome") || {}).value || "Nova Etapa");
            self.persistir(); UI.fecharModal(); self.render();
          } }
        ]);
    },

    renomearEtapa: function (etapaId) {
      var o = this.orcAtual; if (!o) return;
      var e = Util.arr(o.etapas).filter(function (x) { return x.id === etapaId; })[0];
      if (!e) return;
      var self = this;
      UI.modal("Renomear etapa",
        '<div class="field"><label>Nome da etapa</label><input id="et-nome" value="' + Util.esc(e.nome) + '"></div>',
        [
          { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
          { texto: "Salvar", classe: "primary", onClick: function () {
            Orcamento.renomearEtapa(o, etapaId, (UI.el("et-nome") || {}).value || e.nome);
            self.persistir(); UI.fecharModal(); self.render(); UI.toast("Etapa renomeada.", "ok");
          } }
        ]);
      setTimeout(function () { var i = UI.el("et-nome"); if (i) { i.focus(); i.select(); } }, 50);
    },

    removerEtapa: function (etapaId) {
      Orcamento.removerEtapa(this.orcAtual, etapaId);
      this.persistir(); this.render();
    },
    removerItem: function (etapaId, itemId) {
      Orcamento.removerItem(this.orcAtual, etapaId, itemId);
      this.persistir(); this.render();
    },

    // ---------- Busca SINAPI ----------
    // Preferências do seletor de banco/tipo/oneração da busca (lembra entre buscas).
    _lerBuscaPrefs: function () {
      try { return JSON.parse(localStorage.getItem("orcapro:busca:prefs") || "{}") || {}; } catch (e) { return {}; }
    },
    _salvarBuscaPrefs: function () {
      try {
        var f = (UI.el("bs-fonte") || {}).value || "";
        if (f.indexOf("__") === 0) f = ""; // não persiste ações "adicionar/gerenciar"
        localStorage.setItem("orcapro:busca:prefs", JSON.stringify({
          fonte: f, tipo: (UI.el("bs-tipo") || {}).value || "", deson: (UI.el("bs-deson") || {}).value || ""
        }));
      } catch (e) {}
    },

    abrirBuscaSinapi: function (etapaId) {
      this._addItemEtapaId = etapaId;
      var self = this;
      var corpo =
        '<div class="field"><input id="bs-q" placeholder="Buscar por código ou descrição (ex.: alvenaria bloco, concreto fck)" autofocus></div>' +
        '<div class="row" style="gap:8px;margin-bottom:4px">' +
          '<div class="field"><label>Banco de preços</label><select id="bs-fonte"><option value="">Todos os bancos ativos</option></select></div>' +
          '<div class="field"><label>Tipo</label><select id="bs-tipo"><option value="">Composições + insumos</option><option value="composicao">Só composições</option><option value="insumo">Só insumos</option></select></div>' +
          '<div class="field"><label>Oneração</label><select id="bs-deson"><option value="">Todas</option><option value="des">Desonerada</option><option value="one">Onerada</option></select></div>' +
          '<div class="field"><label>Estado (SINAPI)</label><select id="bs-uf" title="Troca a base SINAPI para orçar outro estado"><option value="">—</option></select></div>' +
        '</div>' +
        '<div class="muted mb" id="bs-base">Base: carregando…</div>' +
        '<div id="bs-results"><div class="vazio">Digite ao menos 2 letras…</div></div>';
      UI.modal("Buscar item (composição ou insumo)", corpo,
        [{ texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } }]);

      function ativarBusca() {
        var prefs = self._lerBuscaPrefs();
        var primeiraPintura = true; // só a 1ª pintura semeia do prefs; depois preserva a escolha viva
        // (re)pinta o seletor de banco + a linha de base — chamado no início e após TROCAR de estado
        function repintar() {
          var selF = UI.el("bs-fonte");
          if (selF && typeof Bases !== "undefined") {
            var atualFonte = primeiraPintura ? (prefs.fonte || "") : (selF.value || ""); // viva após 1ª pintura (inclui "Todos")
            var lista = Bases.lista();
            var carregadas = {}; lista.forEach(function (b) { carregadas[b.fonte] = b; });
            var opts = ['<option value="">Todos os bancos ativos</option>'];
            // bancos JÁ carregados → selecionáveis para filtrar a busca
            lista.filter(function (b) { return b.ativa; }).forEach(function (b) {
              opts.push('<option value="' + b.fonte + '">' + Util.esc(b.label) + (b.uf ? " · " + b.uf : "") + (b.competencia ? " · " + b.competencia : "") + " · " + (b.total || 0).toLocaleString("pt-BR") + " itens</option>");
            });
            // catálogo completo de bancos suportados que ainda NÃO estão carregados → adicionar
            var faltantes = Object.keys(Bases.META).filter(function (f) { return !carregadas[f]; });
            if (faltantes.length) {
              opts.push('<option disabled>──── adicionar outro banco ────</option>');
              faltantes.forEach(function (f) {
                opts.push('<option value="__add:' + f + '">＋ ' + Util.esc(Bases.META[f].label) + '…</option>');
              });
            }
            opts.push('<option value="__manage">🗂 Gerenciar bancos / outro estado ou competência…</option>');
            selF.innerHTML = opts.join("");
            if (atualFonte && carregadas[atualFonte]) selF.value = atualFonte; // preserva escolha (viva ou do prefs no 1º paint)
          }
          var baseEl = UI.el("bs-base");
          if (baseEl) {
            var n = (typeof Bases !== "undefined") ? Bases.lista().filter(function (b) { return b.ativa; }).length : 1;
            baseEl.innerHTML = "Base: <b>SINAPI " + Util.esc(Sinapi.competencia || "") + "/" + Util.esc(Sinapi.uf || "") + "</b> · " + Sinapi.resumo().total.toLocaleString("pt-BR") + " itens" + (n > 1 ? " · +" + (n - 1) + " banco(s) ativo(s)" : "") + ' · <span style="opacity:.75">escolha o banco e o estado nos seletores acima</span>';
          }
          primeiraPintura = false;
        }
        repintar();
        var elT0 = UI.el("bs-tipo"); if (elT0 && prefs.tipo) elT0.value = prefs.tipo;
        var elD0 = UI.el("bs-deson"); if (elD0 && prefs.deson) elD0.value = prefs.deson;
        var inp = UI.el("bs-q");
        if (!inp) return;
        function ler() {
          var dv = (UI.el("bs-deson") || {}).value || "";
          return { max: 40, fonte: (UI.el("bs-fonte") || {}).value || "", tipo: (UI.el("bs-tipo") || {}).value || "", desonerado: dv === "des" ? true : (dv === "one" ? false : null) };
        }
        var doSearch = Util.debounce(function () {
          var q = inp.value.trim();
          var box = UI.el("bs-results");
          if (!box) return;
          if (q.length < 2) { box.innerHTML = '<div class="vazio">Digite ao menos 2 letras…</div>'; return; }
          var f = ler();
          var res = (typeof Bases !== "undefined") ? Bases.buscar(q, f)
            : Sinapi.buscar(q, { max: 40, tipo: f.tipo }).map(function (it) { return { item: it, fonte: "SINAPI", label: "SINAPI", cor: "sinapi", tipo: "composicao" }; });
          if (!res.length) {
            var dica = f.tipo === "insumo" ? " — esta base pode não ter insumos (carregue uma base de insumos em 🗂 Tabelas)" : (f.desonerado === false ? " — verifique se a base ONERADA está carregada" : "");
            box.innerHTML = '<div class="vazio">Nenhum resultado para "' + Util.esc(q) + '"' + dica + ".</div>";
            return;
          }
          box.innerHTML = res.map(function (r) {
            var it = r.item, tg = r.tipo === "insumo" ? ' <span class="pill proprio">insumo</span>' : "";
            return '<div class="sinapi-result" data-pick="' + Util.esc(it.codigo) + '|' + Util.esc(r.fonte) + '">' +
              '<div class="desc"><div class="cod"><span class="pill ' + (r.cor || "sinapi") + '">' + Util.esc(r.label) + "</span>" + tg + " " + Util.esc(it.codigo) + " · " + Util.esc(it.unidade) + "</div>" +
              Util.esc(it.descricao) + "</div>" +
              '<div class="preco">' + Util.fmtMoeda(it.custoUnitario) + "</div></div>";
          }).join("");
          Array.prototype.forEach.call(box.querySelectorAll("[data-pick]"), function (row) {
            row.onclick = function () { self.escolherItemSinapi(row.dataset.pick); };
          });
        }, 220);
        inp.addEventListener("input", doSearch);
        var selFonte = UI.el("bs-fonte");
        if (selFonte) selFonte.addEventListener("change", function () {
          var v = selFonte.value || "";
          if (v === "__manage" || v.indexOf("__add:") === 0) {
            // volta a seleção para o último banco válido e abre o gerenciador de bases
            selFonte.value = (prefs.fonte && Bases.lista().some(function (b) { return b.fonte === prefs.fonte; })) ? prefs.fonte : "";
            UI.fecharModal();
            self.abrirTabelas();
            return;
          }
          self._salvarBuscaPrefs(); doSearch();
        });
        ["bs-tipo", "bs-deson"].forEach(function (id) { var el = UI.el(id); if (el) el.addEventListener("change", function () { self._salvarBuscaPrefs(); doSearch(); }); });
        // Seletor de ESTADO (SINAPI) — troca a base ativa para orçar outro estado (Brasil todo)
        var selUf = UI.el("bs-uf");
        if (selUf) {
          self._carregarEstados().then(function (ests) {
            var atual = self._baseUf || Sinapi.uf || "";
            if (!ests.length) { // pacote de estado único → mostra só a UF ativa
              selUf.innerHTML = '<option value="' + Util.esc(atual) + '">' + Util.esc(atual || "—") + "</option>";
              selUf.disabled = true; selUf.title = "Pacote de estado único — para outros estados, use 🗂 Gerenciar";
            } else {
              var temAtual = ests.some(function (e) { return e.uf === atual; });
              var o = ests.map(function (e) { return '<option value="' + Util.esc(e.uf) + '">' + Util.esc(e.uf) + (e.competencia ? " · " + Util.esc(e.competencia) : "") + "</option>"; });
              if (atual && !temAtual) o.unshift('<option value="' + Util.esc(atual) + '">' + Util.esc(atual) + " · ativa</option>");
              selUf.innerHTML = o.join("");
              selUf.value = atual;
            }
          });
          selUf.addEventListener("change", function () {
            var uf = selUf.value;
            if (!uf || uf === self._ufPendente || uf === (self._baseUf || Sinapi.uf)) return;
            self._ufPendente = uf;
            var box0 = UI.el("bs-results"); if (box0) box0.innerHTML = '<div class="vazio">Trocando para ' + Util.esc(uf) + '…</div>';
            self.trocarEstadoSinapi(uf, function (ok) {
              self._ufPendente = null;
              selUf.value = self._baseUf || Sinapi.uf || ""; // sincroniza o dropdown com a base REALMENTE carregada
              if (ok) { repintar(); doSearch(); }
            });
          });
        }
        if (inp.value.trim().length >= 2) doSearch();
        inp.focus();
      }

      // Se a base ainda não carregou, abre assim mesmo e espera (ou avisa em caso de falha)
      if (Sinapi.carregado) {
        ativarBusca();
      } else {
        var baseEl = UI.el("bs-base"); if (baseEl) baseEl.textContent = "⏳ Carregando base SINAPI…";
        var box = UI.el("bs-results"); if (box) box.innerHTML = '<div class="vazio">Carregando base SINAPI, aguarde…</div>';
        this.carregarBaseSinapi().then(function () {
          if (UI.el("bs-q")) ativarBusca();
        }).catch(function () {
          var b = UI.el("bs-results");
          if (b) b.innerHTML = '<div class="vazio">⚠️ Não foi possível carregar a base SINAPI.<br>' +
            'Abra o app pelo <b>servidor local</b> (Iniciar-OrcaPRO.bat) — não funciona abrindo o index.html direto (file://).</div>';
        });
      }
    },

    escolherItemSinapi: function (pick) {
      var parts = String(pick).split("|"), codigo = parts[0], fonte = parts[1] || "SINAPI";
      var item = (typeof Bases !== "undefined") ? Bases.obter(fonte, codigo) : Sinapi.obter(codigo);
      if (!item) { UI.toast("Item não encontrado.", "erro"); return; }
      // checa limite de itens do plano
      var totalItens = Orcamento.totais(this.orcAtual).qtdItens;
      var lim = Auth.limite("limiteItensPorOrcamento");
      if (totalItens >= lim) { UI.toast("Limite de itens do plano atingido. Faça upgrade.", "erro"); return; }
      var self = this;
      UI.fecharModal();
      UI.modal("Quantidade — " + Util.esc(item.codigo),
        '<p>' + Util.esc(item.descricao) + '</p>' +
        '<div class="row"><div class="field"><label>Quantidade (' + Util.esc(item.unidade) + ')</label>' +
        '<input id="qi-qtd" value="1" autofocus></div>' +
        '<div class="field"><label>Custo unitário</label><input id="qi-cu" value="' + Util.fmtNum(item.custoUnitario, 2) + '"></div></div>',
        [
          { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
          { texto: "Adicionar item", classe: "success", onClick: function () {
            var qtd = Util.num((UI.el("qi-qtd") || {}).value);
            var cu = Util.num((UI.el("qi-cu") || {}).value);
            var itemAjustado = Util.clone(item); itemAjustado.custoUnitario = cu; itemAjustado.baseFonte = fonte;
            Orcamento.addItem(self.orcAtual, self._addItemEtapaId, itemAjustado, qtd);
            self.persistir(); UI.fecharModal(); self.render();
            UI.toast("Item adicionado.", "ok");
          } }
        ]);
    },

    // ---------- BDI ----------
    recalcBdiPreview: function () {
      var p = {};
      ["AC", "S", "R", "G", "DF", "L", "I"].forEach(function (k) { p[k] = Util.num((UI.el("bdi-" + k) || {}).value); });
      var res = Bdi.calcular(p);
      var out = UI.el("bdi-resultado"); if (out) out.textContent = Util.fmtPct(res);
    },
    salvarBdi: function () {
      var modeloSel = (UI.el("bdi-modelo") || {}).value || "custom";
      var p = {};
      ["AC", "S", "R", "G", "DF", "L", "I"].forEach(function (k) { p[k] = Util.num((UI.el("bdi-" + k) || {}).value); });
      Orcamento.aplicarBdi(this.orcAtual, modeloSel, p);
      this.persistir(); this.render();
      UI.toast("BDI aplicado: " + Util.fmtPct(this.orcAtual.bdi.percentual), "ok");
    },

    // ---------- Export ----------
    exportar: function () {
      if (this._trialBloqueado()) { this._avisoTrial(); return; }
      if (!Auth.podeUsar("exportar")) { UI.toast("Exportar é recurso PRO. Faça upgrade.", "erro"); return; }
      var csv = Orcamento.exportarCSV(this.orcAtual);
      Util.baixar((this.orcAtual.numero || "orcamento") + ".csv", csv, "text/csv;charset=utf-8");
      UI.toast("CSV exportado.", "ok");
    },

    // Comparar cenários de preço (Agressivo / Padrão / Conservador) — muda o BDI
    compararCenarios: function () {
      var orc = this.orcAtual; if (!orc) return;
      var custo = Orcamento.totais(orc).custoDireto;
      if (custo <= 0) { UI.toast("Adicione itens com custo antes de comparar.", "erro"); return; }
      var p = Util.num(orc.bdi && orc.bdi.percentual) || 0;
      var cenarios = [
        { nome: "Agressivo", desc: "Preço menor para ganhar a obra", bdi: Math.max(8, Math.round((p - 7) * 100) / 100), cor: "#2e6f9e" },
        { nome: "Padrão", desc: "Seu BDI atual", bdi: p, cor: "#16a34a", dest: true },
        { nome: "Conservador", desc: "Margem maior, mais segurança", bdi: Math.round((p + 7) * 100) / 100, cor: "#0f2740" }
      ];
      UI.modal("📊 Comparar cenários de preço", UI.renderCenarios(custo, cenarios), [
        { texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } }
      ]);
    },
    aplicarCenario: function (bdiStr) {
      var p = Util.num(bdiStr), o = this.orcAtual; if (!o) return;
      o.bdi = o.bdi || {};
      // Deriva os params do BDI-alvo ajustando SÓ o Lucro (L) — assim params e percentual ficam
      // consistentes (a aba BDI mostra valores certos e "Aplicar BDI" não reverte o preço).
      var base = (o.bdi.params && typeof o.bdi.params === "object") ? Util.clone(o.bdi.params) : Bdi.paramsDoModelo("padrao");
      var AC = Util.num(base.AC) / 100, S = Util.num(base.S) / 100, R = Util.num(base.R) / 100,
          G = Util.num(base.G) / 100, DF = Util.num(base.DF) / 100, I = Util.num(base.I) / 100;
      if (I >= 1) I = 0.9999;
      var denom = (1 + AC + S + R + G) * (1 + DF);
      var umMaisL = denom > 0 ? ((1 + p / 100) * (1 - I)) / denom : 1; // inverte a fórmula TCU p/ achar (1+L)
      var L = (umMaisL - 1) * 100;
      if (!isFinite(L)) L = Util.num(base.L);
      base.L = Math.round(L * 100) / 100;
      Orcamento.aplicarBdi(o, "custom", base); // grava params + percentual + modeloId juntos
      this.persistir(); UI.fecharModal(); this.render();
      UI.toast("Cenário aplicado — BDI " + Util.fmtNum(o.bdi.percentual, 2) + "%.", "ok");
    },

    // Excel profissional: workbook vivo com 3 abas (Resumo/Sintética/Analítica) + fórmulas
    exportarExcel: function () {
      if (this._trialBloqueado()) { this._avisoTrial(); return; }
      if (!Auth.podeUsar("exportar")) { UI.toast("Exportar é recurso PRO. Faça upgrade.", "erro"); return; }
      if (Orcamento.totais(this.orcAtual).qtdItens < 1) { UI.toast("Adicione itens antes de exportar.", "erro"); return; }
      var self = this;
      function gerar() { UI.toast("Gerando Excel (com aba de Insumos)…", "ok"); ExcelOrc.gerar(self.orcAtual); }
      // Garante o analítico do ESTADO ATIVO carregado — para a aba Insumos sair certa em QUALQUER UF (não no MG padrão).
      var ana = (typeof Analitico !== "undefined") ? Analitico : null;
      var ufAtivo = self._baseUf || (typeof Sinapi !== "undefined" ? Sinapi.uf : null) || null;
      if (!ana || !self._analiticoArquivo || (ana.carregado && (!ufAtivo || !ana.uf || ana.uf === ufAtivo))) { gerar(); return; }
      if (ana.reset && ana.uf && ufAtivo && ana.uf !== ufAtivo) ana.reset();
      UI.toast("Carregando insumos de " + (ufAtivo || "") + " (1ª vez)…", "ok");
      ana.carregarArquivo(self._analiticoArquivo).then(gerar).catch(function () { gerar(); });
    },

    // ---------- Ver composição → insumos (base analítica, por estado) ----------
    verInsumos: function (codigo) {
      var self = this;
      var ufAtivo = self._baseUf || Sinapi.uf || null;
      function abrir() {
        var a = Analitico.obter(codigo);
        if (!a) { UI.toast("A composição " + codigo + " não possui analítico detalhado" + (ufAtivo ? " na base " + ufAtivo : "") + ".", "erro"); return; }
        var bg = UI.modal("🔍 Composição " + codigo + " — Insumos", UI.renderInsumos(a, ufAtivo),
          [{ texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } }]);
        var m = bg && bg.querySelector(".modal"); if (m) m.style.maxWidth = "900px";
      }
      // Já carregado E é do estado ativo? abre direto.
      if (Analitico.carregado && (!ufAtivo || !Analitico.uf || Analitico.uf === ufAtivo)) { abrir(); return; }
      // Sem analítico apontado para este estado → mensagem clara (não trava).
      if (!self._analiticoArquivo) {
        UI.toast("O detalhamento insumo-a-insumo não está incluído para " + (ufAtivo || "esta base") + ". O orçamento usa os preços corretos da base; para ver o analítico deste estado, gere/importe em 🗂 Tabelas.", "erro");
        return;
      }
      // Trocou de UF desde o último carregamento → descarta e recarrega o analítico certo.
      if (Analitico.reset && Analitico.uf && ufAtivo && Analitico.uf !== ufAtivo) Analitico.reset();
      if (self._insumosCarregando === codigo) return; // ignora duplo-clique durante o load frio
      self._insumosCarregando = codigo;
      UI.toast("Carregando analítico de " + (ufAtivo || "") + " (1ª vez)…", "ok");
      Analitico.carregarArquivo(self._analiticoArquivo).then(function () { self._insumosCarregando = null; abrir(); }).catch(function (e) {
        self._insumosCarregando = null;
        if (e && e.message === "cancelado") return; // troca de UF cancelou o carregamento — silencioso
        UI.toast("Não carregou o analítico: " + (e && e.message) + " — abra pelo servidor local (Iniciar-OrcaPRO.bat).", "erro");
      });
    },

    // ---------- Escopo Inteligente ----------
    abrirEscopo: function () {
      if (!Auth.podeUsar("escopoIA")) { UI.toast("Escopo Inteligente é recurso PRO.", "erro"); return; }
      if (!Sinapi.carregado) { UI.toast("Base SINAPI ainda carregando…", "erro"); return; }
      var self = this;
      this._escopo = null;
      UI.modal("✨ Escopo Inteligente", UI.renderEscopoEntrada(), [
        { texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } }
      ]);
      setTimeout(function () { var t = UI.el("esc-txt"); if (t) t.focus(); }, 50);
    },

    analisarEscopo: function () {
      var txt = (UI.el("esc-txt") || {}).value || "";
      if (!Util.naoVazio(txt)) { UI.toast("Cole o escopo primeiro.", "erro"); return; }
      this._escopo = Escopo.analisar(txt);
      if (!this._escopo.length) { UI.toast("Nenhuma linha reconhecida.", "erro"); return; }

      var self = this;
      var body = UI.renderEscopoResultado(this._escopo, this.orcAtual.etapas);
      // reabre o modal com o resultado + rodapé de confirmação
      var bg = UI.modal("✨ Escopo Inteligente — revisão", body, [
        { texto: "Voltar", classe: "ghost", onClick: function () { self.abrirEscopo(); } },
        { texto: "Adicionar selecionados", classe: "success", onClick: function () { self.confirmarEscopo(); } }
      ]);
      // largura maior p/ a tabela
      var m = bg.querySelector(".modal"); if (m) m.style.maxWidth = "920px";
    },

    confirmarEscopo: function () {
      var an = this._escopo || [], self = this;
      var etapaSel = (UI.el("esc-etapa") || {}).value;
      var porIA = etapaSel === "__por_ia__";
      var porCat = etapaSel === "__por_categoria__"; // FASE 1.3: etapas por tipo de serviço
      if (etapaSel === "__nova__") {
        Orcamento.addEtapa(this.orcAtual, "Escopo Importado");
        etapaSel = this.orcAtual.etapas[this.orcAtual.etapas.length - 1].id;
      }
      var etapaPorNome = {};
      function etapaParaLinha(l, item) {
        if (!porIA && !porCat) return etapaSel;
        var nome;
        if (porIA) nome = String(l.etapaSugerida || "Escopo").trim() || "Escopo";
        else {
          // reusa o classificador do Cronograma (14 categorias): demolição ≠ alvenaria ≠ concretagem
          var cat = (typeof Cronograma !== "undefined" && Cronograma.classificar)
            ? (Cronograma.classificar(l.textoOriginal) || (item && Cronograma.classificar(item.descricao)))
            : null;
          nome = cat ? cat.nome : "Serviços Gerais";
        }
        if (etapaPorNome[nome]) return etapaPorNome[nome];
        var existe = self.orcAtual.etapas.filter(function (e) { return String(e.nome || "").toLowerCase() === nome.toLowerCase(); })[0];
        if (existe) { etapaPorNome[nome] = existe.id; return existe.id; }
        Orcamento.addEtapa(self.orcAtual, nome);
        var nova = self.orcAtual.etapas[self.orcAtual.etapas.length - 1];
        etapaPorNome[nome] = nova.id; return nova.id;
      }
      var add = 0, pend = 0, lim = Auth.limite("limiteItensPorOrcamento");
      for (var i = 0; i < an.length; i++) {
        var l = an[i];
        if (l.escolhido < 0 || !l.candidatos[l.escolhido]) { pend++; continue; }
        if (Orcamento.totais(this.orcAtual).qtdItens >= lim) { UI.toast("Limite de itens do plano atingido.", "erro"); break; }
        var cand = l.candidatos[l.escolhido];
        var item = Util.clone(cand.item);
        item.baseFonte = cand.fonte || "SINAPI";
        Orcamento.addItem(this.orcAtual, etapaParaLinha(l, item), item, l.quantidade);
        add++;
      }
      this._escopoIA = false;
      this.persistir(); UI.fecharModal(); this.render();
      UI.toast(add + " itens adicionados" + (pend ? " · " + pend + " pendentes ignorados" : "") + ".", "ok");
    },

    // Escopo via IA: prosa livre -> IA estrutura -> casa c/ bases -> IA escolhe o código certo (/ia/casar)
    analisarEscopoIA: function () {
      var txt = (UI.el("esc-txt") || {}).value || "";
      if (!Util.naoVazio(txt)) { UI.toast("Cole a descrição da obra primeiro.", "erro"); return; }
      var self = this, back = (typeof CONFIG !== "undefined" && CONFIG.iaBackend) ? CONFIG.iaBackend : "http://localhost:3041";
      this._escBack = back;
      UI.toast("🤖 Estruturando o escopo com a IA do ERP…", "ok");
      fetch(back + "/ia/orcamento", { method: "POST", headers: { "Content-Type": "application/json", "x-licenca": (typeof Licenca !== "undefined" ? Licenca.chave() : "") }, body: JSON.stringify({ descricao: txt }) })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j.ok || !j.resultado) { UI.toast("IA: " + (j.error || "não retornou estrutura"), "erro"); return; }
          self._escopo = Escopo.analisarItensIA(j.resultado.etapas || []);
          if (!self._escopo.length) { UI.toast("A IA não retornou itens.", "erro"); return; }
          self._escopoIA = true;
          var ok = self._escopo.filter(function (l) { return l.escolhido > -1; }).length;
          UI.toast("✅ " + self._escopo.length + " serviços estruturados (" + ok + " com sugestão). Use 🎯 Refinar p/ a IA escolher o código exato.", "ok");
          self._mostrarEscopoResultado(0);
        })
        .catch(function (e) { console.error("[Escopo IA] FALHOU:", e); UI.toast("Escopo IA falhou: " + (e && e.message ? e.message : e) + " — veja o Console (F12). ERP na porta 3040?", "erro"); });
    },

    // 2º passo (opcional): IA escolhe o código EXATO. Em LOTES, só os ainda NÃO refinados,
    // e PARA ao bater o limite/min da IA grátis (o usuário clica de novo p/ continuar).
    _casarEscopoIA: function (back) {
      var an = this._escopo || [];
      var pares = an.filter(function (l) { return l.candidatos && l.candidatos.length && !l.refinadoIA; });
      var res = { refinados: 0, limite: false, restam: 0 };
      if (!pares.length) return Promise.resolve(res);
      var CHUNK = 6, lotes = [];
      for (var k = 0; k < pares.length; k += CHUNK) lotes.push(pares.slice(k, k + CHUNK));
      return lotes.reduce(function (p, lote) {
        return p.then(function () {
          if (res.limite) return; // já bateu o limite: para
          var payload = lote.map(function (l) {
            return { descricao: l.textoOriginal, unidade: l.unidade || "", candidatos: l.candidatos.slice(0, 2).map(function (c) { return { codigo: c.item.codigo, descricao: String(c.item.descricao || "").slice(0, 70), unidade: c.item.unidade, custo: c.item.custoUnitario }; }) };
          });
          return fetch(back + "/ia/casar", { method: "POST", headers: { "Content-Type": "application/json", "x-licenca": (typeof Licenca !== "undefined" ? Licenca.chave() : "") }, body: JSON.stringify({ itens: payload }) })
            .then(function (r) { return r.json().then(function (j) { return { status: r.status, j: j }; }, function () { return { status: r.status, j: {} }; }); })
            .then(function (o) {
              var j = o.j;
              if (!j.ok && /rate limit|429|too large|413/i.test(String(j.error || ""))) { res.limite = true; return; }
              if (!j.ok || !j.escolhas) return;
              j.escolhas.forEach(function (esc) {
                var l = lote[esc.i]; if (!l) return; l.refinadoIA = true;
                if (!esc.codigo) { l.escolhido = -1; return; }
                var idx = -1;
                for (var z = 0; z < l.candidatos.length; z++) { if (String(l.candidatos[z].item.codigo) === String(esc.codigo)) { idx = z; break; } }
                l.escolhido = idx; if (idx >= 0) res.refinados++;
              });
            }, function () { });
        });
      }, Promise.resolve()).then(function () {
        res.restam = an.filter(function (l) { return l.candidatos && l.candidatos.length && !l.refinadoIA; }).length;
        return res;
      });
    },
    // botão "🎯 Refinar com IA" na revisão do escopo
    refinarEscopoCasar: function () {
      var self = this, back = (typeof CONFIG !== "undefined" && CONFIG.iaBackend) ? CONFIG.iaBackend : "http://localhost:3041";
      UI.toast("🎯 Refinando os matches com a IA…", "ok");
      this._casarEscopoIA(back).then(function (r) {
        var msg = r.refinados + " serviços refinados pela IA.";
        if (r.limite) msg += " ⏳ Limite da IA grátis/min atingido — restam " + r.restam + ", clique de novo daqui ~1 min.";
        UI.toast(msg, r.limite ? "erro" : "ok");
        self._mostrarEscopoResultado(r.refinados);
      });
    },

    _mostrarEscopoResultado: function (refinados) {
      var self = this;
      var body = UI.renderEscopoResultado(this._escopo, this.orcAtual.etapas);
      var bg = UI.modal("✨ Escopo (IA) — revisão · " + this._escopo.length + " serviços" + (refinados ? " · 🎯 " + refinados + " confirmados pela IA" : ""), body, [
        { texto: "Voltar", classe: "ghost", onClick: function () { self.abrirEscopo(); } },
        { texto: "Adicionar selecionados", classe: "success", onClick: function () { self.confirmarEscopo(); } }
      ]);
      var m = bg.querySelector(".modal"); if (m) m.style.maxWidth = "940px";
    },

    // ---------- Proposta Comercial ----------
    gerarProposta: function () {
      if (this._trialBloqueado()) { this._avisoTrial(); return; }
      if (!Auth.podeUsar("proposta")) { UI.toast("Proposta Comercial é recurso PRO.", "erro"); return; }
      var val = Proposta.validar(this.orcAtual);
      if (!val.ok) {
        UI.toast("Faltam dados: " + val.faltando.join(", ") + ". Abra ⚙ Dados.", "erro");
        return;
      }
      this._abrirPrint("📄 Proposta — " + this.orcAtual.numero, Proposta.gerarHTML(this.orcAtual, Auth.usuario()));
    },

    // Anexo Técnico de Orçamento p/ LAUDO pericial (não comercial)
    gerarLaudo: function () {
      if (this._trialBloqueado()) { this._avisoTrial(); return; }
      if (!Auth.podeUsar("proposta")) { UI.toast("Anexo p/ laudo é recurso PRO.", "erro"); return; }
      var val = Laudo.validar(this.orcAtual);
      if (!val.ok) { UI.toast("Faltam dados: " + val.faltando.join(", "), "erro"); return; }
      this._abrirPrint("📑 Anexo de Orçamento p/ Laudo — " + this.orcAtual.numero, Laudo.gerarHTML(this.orcAtual, Auth.usuario()));
    },

    // Relatório técnico completo: sintético + analítico detalhado
    gerarRelatorio: function () {
      if (this._trialBloqueado()) { this._avisoTrial(); return; }
      var t = Orcamento.totais(this.orcAtual);
      if (t.qtdItens < 1) { UI.toast("Adicione itens antes de gerar o relatório.", "erro"); return; }
      var self = this;
      function abrir() {
        self._abrirPrint("🧾 Relatório de Orçamento — " + self.orcAtual.numero,
          UI.renderRelatorioCompleto(self.orcAtual, Auth.usuario()));
      }
      // Carrega o analítico da UF (1ª vez) p/ incluir a seção de composições e insumos; degrada sem travar.
      var ana = (typeof Analitico !== "undefined") ? Analitico : null;
      var ufAtivo = self._baseUf || (typeof Sinapi !== "undefined" ? Sinapi.uf : null) || null;
      if (!ana || !self._analiticoArquivo ||
          (ana.carregado && (!ufAtivo || !ana.uf || ana.uf === ufAtivo))) { abrir(); return; }
      if (ana.reset && ana.uf && ufAtivo && ana.uf !== ufAtivo) ana.reset();
      UI.toast("Carregando insumos das composições (1ª vez)…", "ok");
      ana.carregarArquivo(self._analiticoArquivo).then(abrir).catch(function () { abrir(); });
    },

    // Overlay de impressão compartilhado (proposta e relatório)
    _abrirPrint: function (titulo, htmlConteudo) {
      this.fecharProposta();
      var overlay = document.createElement("div");
      overlay.className = "proposta-overlay"; overlay.id = "proposta-print";
      overlay.innerHTML =
        '<div class="prop-toolbar no-print"><span class="ttl">' + Util.esc(titulo) + '</span>' +
        '<button class="btn sm success" data-acao="proposta-imprimir">🖨 Imprimir / Salvar PDF</button>' +
        '<button class="btn sm" data-acao="proposta-fechar">Fechar</button></div>' +
        htmlConteudo;
      document.body.appendChild(overlay);
      window.scrollTo(0, 0);
    },
    fecharProposta: function () {
      var o = document.getElementById("proposta-print");
      if (o) o.remove();
    },

    // ---------- Persistência (idempotente + debounce) ----------
    // ---- Gate de licença: MODO DEMONSTRAÇÃO explora tudo, mas NÃO salva/exporta sem licença ----
    _trialBloqueado: function () {
      if (this._demo) return false; // a vitrine da página de vendas nunca bloqueia
      if (typeof Licenca === "undefined") return false;
      var s = Licenca.status(); if (!s) return false;
      if (s.trial) return true;           // sem licença ativada = demonstração: nunca salva/exporta
      return !s.ativo;                    // licenciado: bloqueia se não está ativo (vencida/carência/outra máquina)
    },
    _avisoTrial: function () {
      var s = (typeof Licenca !== "undefined") ? Licenca.status() : {};
      var msg;
      if (s.expirada) msg = "Sua licença venceu. Renove para continuar salvando e exportando.";
      else if (s.outroDispositivo) msg = "Esta licença está ativada em outra máquina. Fale com o suporte para liberar.";
      else if (s.revalidar) msg = "Reconecte à internet para revalidar sua licença (alguns dias sem checar).";
      else msg = "🔒 Modo demonstração — ative sua licença (🔑) para salvar e exportar. Você pode explorar tudo à vontade.";
      UI.toast(msg, "erro");
      try { this.abrirLicenca(); } catch (e) {}
    },

    persistir: function () {
      if (!this.orcAtual) return;
      if (this._trialBloqueado()) {
        if (!this._avisouSalvar) { this._avisouSalvar = true; UI.toast("🔒 Modo demonstração — para salvar, ative sua licença (🔑).", "erro"); }
        return;
      }
      try { Orcamento.sincronizarPrazo(this.orcAtual); } catch (e) {} // FASE 1.4: prazo segue o agente (depois do gate de licença)
      var ok = Store.salvarOrcamento(Auth.empresaId(), this.orcAtual);
      if (!ok && !this._avisouQuota) {
        this._avisouQuota = true;
        UI.toast("Não foi possível salvar — armazenamento cheio. Exporte um backup (💾) e remova a base SINAPI grande do navegador.", "erro");
        try { this.abrirBackup(); } catch (e) {}
      } else if (ok) { this._avisouQuota = false; }
    }
  };

  global.App = App;
  document.addEventListener("DOMContentLoaded", function () { App.iniciar(); });
})(window);
