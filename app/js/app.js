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
    /* ACCORDION DA PLANILHA (v1.1.135) — etapas recolhidas por orçamento.
       Mora AQUI, em memória, e nunca dentro de `orc`: Store.salvarOrcamento
       grava o objeto inteiro, e um `etapa.recolhida` vazaria para o backup, o
       merge da nuvem e o round-trip do Excel — virava diff fantasma entre
       máquinas por causa de um clique de tela. O estado é escrito na string do
       HTML no render, então sobrevive ao re-render sem passe posterior. */
    _etapasRecolhidas: {},
    /* índice de etapas na lateral: OCULTO por padrão (rouba largura da planilha),
       ligado por botão. A escolha é de TELA, então mora no localStorage. */
    _idxAberto: (function () { try { return localStorage.getItem("orcapro:idxEtapas") === "1"; } catch (e) { return false; } })(),
    /* modo compacto da planilha: linha mais baixa p/ caber mais item na tela.
       Preferência de TELA, igual ao índice — localStorage, não o orçamento. */
    _plCompacta: (function () { try { return localStorage.getItem("orcapro:plCompacta") === "1"; } catch (e) { return false; } })(),
    etapaRecolhida: function (orcId, etapaId) {
      var m = this._etapasRecolhidas[orcId];
      return !!(m && m[etapaId]);
    },
    toggleEtapa: function (etapaId) {
      var orc = this.orcAtual; if (!orc) return;
      var m = this._etapasRecolhidas[orc.id] || (this._etapasRecolhidas[orc.id] = {});
      if (m[etapaId]) delete m[etapaId]; else m[etapaId] = true;
      this._aplicarRecolhidas(); // passe local: não re-renderiza (não perde foco nem rolagem)
    },
    /* usada por quem INSERE item numa etapa: item novo em etapa recolhida
       nasceria invisível e o usuário jura que o lançamento não pegou. */
    expandirEtapa: function (etapaId, subId) {
      var orc = this.orcAtual; if (!orc || !etapaId) return;
      var m = this._etapasRecolhidas[orc.id];
      if (!m) return;
      // abre a SUB e o PAI: item lançado numa sub etapa com o pai recolhido
      // nasceria invisível — que é exatamente o bug que esta função evita.
      if (m[etapaId]) delete m[etapaId];
      if (subId && m[subId]) delete m[subId];
    },
    _aplicarRecolhidas: function () {
      var self = this, orc = this.orcAtual; if (!orc) return;
      var linhas = document.querySelectorAll("[data-etapa-linhas]");
      Array.prototype.forEach.call(linhas, function (tr) {
        /* CADEIA "<subId> <etapaId>": o item de uma sub etapa some quando a SUB
           ou a ETAPA está recolhida. Sem o some() aqui, recolher a etapa deixava
           os itens das sub etapas na tela, órfãos do próprio cabeçalho. */
        var rec = String(tr.getAttribute("data-etapa-linhas") || "").split(" ").some(function (id) {
          return id && self.etapaRecolhida(orc.id, id);
        });
        /* esconder por CSS, jamais remover do DOM: _refreshAvisosInsumo mexe
           nessas linhas e a numeração/subtotal vêm de Orcamento.calcular. */
        if (rec) tr.classList.add("oculta"); else tr.classList.remove("oculta");
      });
      Array.prototype.forEach.call(document.querySelectorAll("[data-chevron-etapa]"), function (el) {
        var rec = self.etapaRecolhida(orc.id, el.getAttribute("data-chevron-etapa"));
        el.textContent = rec ? "\u25B8" : "\u25BE";
        var td = el.parentNode;
        if (td && td.parentNode) {
          // a MESMA linha pode ser etapa ou sub etapa — o rótulo tem que perguntar,
          // não presumir (senão o tooltip da sub etapa vira "esta etapa" no 1º toggle)
          var ehSub = td.parentNode.className.indexOf("sub") > -1;
          Array.prototype.forEach.call(td.parentNode.querySelectorAll("[data-toggle-etapa]"), function (c) {
            c.title = (rec ? "Expandir" : "Recolher") + (ehSub ? " esta sub etapa" : " esta etapa");
          });
        }
      });
      /* O BOTÃO GLOBAL TEM DE CONTAR A VERDADE. Como o toggle de uma etapa não
         re-renderiza (de propósito: não perde foco nem rolagem), o rótulo
         congelava — e em orçamento grande o usuário clicava em "Recolher
         todas" e a planilha inteira ABRIA. */
      var btnTudo = document.querySelector('[data-acao="etapas-recolher-todas"]');
      if (btnTudo) {
        var tudoRec = (orc.etapas || []).length > 0 && !(orc.etapas || []).some(function (e) { return !self.etapaRecolhida(orc.id, e.id); });
        btnTudo.textContent = tudoRec ? "\u25BE Expandir todas" : "\u25B8 Recolher todas";
      }
    },

    // ---------- Boot ----------
    iniciar: function () {
      Auth.init();
      /* aparencia salva: dois eixos independentes — iluminacao (claro/escuro)
         e letra (Plex/Source). `aplicarTema` faz a migracao de quem ainda
         tem o `orcapro:tom` antigo gravado no aparelho. */
      this.aplicarTema(localStorage.getItem("orcapro:tema") || "light", null);
      /* terceiro eixo da aparência: o movimento da cena de Obras (ver
         aplicarMovimento). Aqui, e não depois, pelo mesmo motivo do tema: a
         demo sai do iniciar logo abaixo e precisa dele aplicado também. */
      this.aplicarMovimento(null);

      // MODO DEMO (?demo=1) — orçamento genérico para vitrine/teste na página de vendas
      if (/[?&]demo=1/.test(location.search || "")) { return this._iniciarDemo(location.search || ""); }

      // VISOR RA/RV NA NUVEM (#rv?t=<token>) — QUALQUER pessoa abre o link do QR e vê o modelo
      // compartilhado, SEM login/gestão. Curto-circuito antes de todo o app.
      var _rvt = ((location.hash || "") + (location.search || "")).match(/[?&]t=([a-f0-9]{12,40})/);
      if (_rvt && /(^|[#&/])rv\b/i.test(location.hash || location.search || "")) { return this._abrirRVCloud(_rvt[1]); }

      // USO SOLO/LOCAL: entra direto (sem a barreira de login). O login segue acessível via "Sair"
      // p/ quem usa RBAC/multiempresa ou quer conta com e-mail. Só age quando não há RBAC configurado.
      if (typeof Auth.autoEntrar === "function") { try { Auth.autoEntrar(); } catch (eAe) {} }

      // Link de acesso enviado pelo admin (?lic=<chave>&u=<login>): ativa a licença neste
      // aparelho (celular/tablet) e deixa o login sugerido — a pessoa só digita a senha.
      // Roda ANTES do gate do trial: com ?lic em ativação, o cadastro de teste não bloqueia.
      try { this._processarLinkAcesso(); } catch (eLk) {}

      // TESTE GRÁTIS: cadastro obrigatório (nome+telefone+consentimento) antes de liberar,
      // e telemetria de uso (boot + heartbeat 5min + módulos usados).
      try {
        if (typeof Telemetria !== "undefined" && !this._ativandoPorLink) {
          var _app = this;
          if (Telemetria.gate(function () { Telemetria.iniciar(); _app.iniciar(); })) return;
          Telemetria.iniciar();
        }
      } catch (eTg) {}

      // Modo nuvem multi-aparelho: conecta na conta-tenant da licença (dados + usuários
      // compartilhados) e, se este aparelho for secundário, pede login. Async/offline-first.
      try { this._conectarNuvemLicenca(); } catch (eCn) {}
      /* fila de fotos: sobe o que ficou pendente quando houve obra sem sinal.
         Instala o gatilho de rede uma vez e anda sozinha. */
      try { if (typeof Fotos !== "undefined" && Fotos.iniciar) Fotos.iniciar(); } catch (eFt) {}
      try { if (typeof Gestao !== "undefined" && Gestao._ligarRetornoDeFoto) Gestao._ligarRetornoDeFoto(); } catch (eFr) {}

      var self = this;
      // Carrega base SINAPI (própria da empresa, se houver; senão a padrão).
      this.carregarBaseSinapi().then(function (n) {
        console.log("[SINAPI] " + n + " itens (" + Sinapi.competencia + "/" + Sinapi.uf + ")");
        if (self.tela === "lista") self.render(); // atualiza o banner com o total real
        // v1.1.122 — checagem automática das BASES no servidor OrçaPRO (1×/dia,
        // silenciosa): saiu SINAPI nova → baixa e aplica sozinha, só informa depois.
        // (O check antigo via ERP local ficou obsoleto: o servidor cobre a frota toda.)
        if (typeof Atualizacao !== "undefined" && Atualizacao.checarAuto) {
          setTimeout(function () { try { Atualizacao.checarAuto(); } catch (eAu) {} }, 9000);
        }
        /* v1.1.185 — AUTO-RECUPERAÇÃO DO PORTAL DO CLIENTE.
         * Obra já publicada cujo retrato foi gerado por versão anterior se
         * republica sozinha, uma vez. Sem isto, todo recurso novo do Portal
         * nasce invisível: a 1.1.184 subiu e ficou sem aparecer em 12 das 13
         * obras publicadas — inclusive as de outros escritórios licenciados,
         * cujas obras nem estão nesta máquina para alguém consertar.
         *
         * 14 s (depois do update de bases, aos 9 s) porque o envio carrega
         * fotos: quem acabou de abrir o programa tem de conseguir trabalhar
         * primeiro. Falha aqui é silenciosa por definição — tenta de novo na
         * próxima abertura, e desiste depois de 3 (PortalSync). */
        if (typeof Gestao !== "undefined" && Gestao._recuperarPortais) {
          setTimeout(function () {
            try {
              Gestao._recuperarPortais(function (res) {
                if (!res || (!res.ok && !res.falhou)) return;
                try {
                  var msg = (typeof PortalSync !== "undefined") ? PortalSync.recado(res) : "";
                  if (msg) UI.toast(String(msg).replace(/<[^>]+>/g, ""), res.falhou ? "erro" : "ok");
                } catch (e2) {}
              });
            } catch (ePs) {}
          }, 14000);
        }
      }).catch(function (e) {
        console.warn("[SINAPI] não carregou:", e.message);
        UI.toast("Base SINAPI não carregou (rode via servidor local).", "erro");
      });

      this.bindGlobal();
      if (Auth.usuario()) { this.tela = "lista"; }
      // LOTE 1: aviso preventivo de armazenamento — evita o QuotaExceeded silencioso
      try {
        var u0 = Auth.usuario();
        if (u0) {
          var sd = Store.saude(u0.empresaId);
          /* ⚠ O AVISO DIZIA "remova bases não usadas em Tabelas" — e as bases
             não ocupam um byte deste limite: elas vivem no IndexedDB. O
             cliente seguia o conselho, não liberava nada, e concluía que o
             sistema estava quebrado. Agora o aviso diz QUEM está ocupando. */
          if (sd.usoPct >= 80) {
            var maior = (sd.maiores || [])[0];
            UI.toast("" + (typeof Icones !== "undefined" ? Icones.get("alerta", 15) : "")
              + " Armazenamento local em " + sd.usoPct + "%"
              + (maior ? " — o maior é \"" + maior.chave + "\" com " + maior.kb + " KB" : "")
              + ". Faça " + (typeof Icones !== "undefined" ? Icones.get("salvar", 15) : "")
              + " Backup agora. (As bases SINAPI não contam neste limite.)", "erro");
          }
        }
      } catch (eSd) {}
      // LOTE 5: CTA de upgrade quando o teste grátis está acabando (últimos 2 dias)
      try {
        if (typeof Licenca !== "undefined") {
          var sl = Licenca.status();
          if (sl && sl.trial && sl.ativo && (sl.restanteMs || 0) < 2 * 86400000) {
            UI.toast("⏳ Seu teste grátis termina em " + (sl.rotulo || "breve") + ". Garanta sua licença (🔑) e não perca o ritmo — seus orçamentos continuam aqui.", "erro");
          }
        }
      } catch (eTr) {}
      this.render();
      /* PACOTE DE ORÇAMENTO por link (app/?importar=<url>): o app baixa, mostra o que
         vem e pede confirmação — depois do render para o toast/modal terem tela.
         Espera a sessão sozinho se a pessoa ainda estiver no login (js/pacote.js). */
      try { if (typeof Pacote !== "undefined" && Pacote.processarParam) Pacote.processarParam(); } catch (ePk) {}
      // Rota #rv (QR da RA/RV no celular): abre o BIM e entra no imersivo Caminhar assim que
      // o modelo estiver carregado. Honesto: precisa do módulo Gestão e de um modelo carregado
      // NESTE aparelho (o compartilhamento em nuvem p/ qualquer lugar é a próxima fase).
      try {
        if (/(^|[#&])rv\b/i.test(location.hash || "")) {
          if (typeof Gestao !== "undefined" && Gestao.podeGestao && Gestao.podeGestao()) {
            this.view = "bim"; this.render();
            var _t = 0, _iv = setInterval(function () {
              _t++;
              if (window.BIM && BIM.imersivo && BIM.visiveis && BIM.visiveis() > 0) { clearInterval(_iv); BIM.imersivo("caminhar"); }
              else if (_t > 48) { clearInterval(_iv); if (typeof UI !== "undefined") UI.toast("Abra ou gere o modelo 3D e toque em " + (typeof Icones !== "undefined" ? Icones.get("vr", 15) : "") + " RA/RV.", "info"); }
            }, 250);
          } else if (typeof UI !== "undefined") { UI.toast("A RA/RV fica no módulo BIM (plano com Gestão de Obras).", "erro"); }
        }
      } catch (eRv) {}
      // Auto-update do app: avisa se há versão nova (só no install local; no site/demo o endpoint não existe e é ignorado)
      if (typeof AutoUpdate !== "undefined") { setTimeout(function () { AutoUpdate.verificar(); }, 1800); }
      // licença: trial -> registra/ancora no servidor; licenciado -> revalida (renova carência / detecta bloqueio)
      try {
        if (typeof Licenca !== "undefined") {
          if (Licenca.status().trial) Licenca.registrarTeste();
          else Licenca.revalidar(function (r) { if (r && r.bloqueado) { try { self.render(); UI.toast("Licença: " + (r.erro || "ativada em outra máquina."), "erro"); } catch (e) {} } else if (r && (r.mudouEquipe || r.mudouRenovacao)) { try { self.render(); } catch (e2) {} } });
        }
      } catch (e) {}
      /* aviso de parcela vencida (js/cobranca.js): pergunta ao servidor ao abrir
         e de 5 em 5 minutos. Sem licença verificada ele nem começa. */
      try { if (typeof Cobranca !== "undefined") Cobranca.iniciar(); } catch (eCob) {}
      this.checarAtualizacao();
    },

    // ---------- Modo demonstração (vitrine) ----------
    // Visor RA/RV público (link da nuvem): monta só o viewer BIM em tela cheia, baixa o modelo
    // compartilhado do VPS (mesmo domínio) e entra no imersivo Caminhar. Sem login/gestão.
    _abrirRVCloud: function (token) {
      document.title = "RA/RV — OrçaPRO";
      // a SALA da reunião é derivada do próprio token do link: TODOS que abrem o mesmo link/QR caem
      // na mesma sala e se veem (avatares). O token vem de crypto (18 hex) → sala não-adivinhável.
      var sala = "nuvem-" + String(token).slice(0, 18);
      document.body.innerHTML =
        '<div id="rvfull" style="position:fixed;inset:0;background:#0b1a2b">' +
        '<div id="bim-canvas" style="width:100%;height:100%;position:relative"></div>' +
        // 🔄 buscar atualização — no celular não tem Ctrl+Shift+R; puxa a versão nova limpando o cache (preserva o token do link)
        '<button id="rv-upd" title="Buscar atualização" style="position:absolute;top:calc(env(safe-area-inset-top,0px) + 8px);right:8px;z-index:2147483000;background:rgba(15,39,64,.92);color:#dbe8f5;border:1px solid #24435f;border-radius:9px;padding:8px 11px;font-size:14px;font-family:Inter,system-ui,sans-serif;cursor:pointer;-webkit-tap-highlight-color:transparent">' + (typeof Icones !== 'undefined' ? Icones.get('ciclo', 15) : '') + '</button>' +
        // 👥 Reunião — QUALQUER pessoa do link entra na mesma sala e vê os outros (cap 20). Escondido até o modelo carregar.
        '<button id="rv-reun" style="display:none;position:absolute;top:calc(env(safe-area-inset-top,0px) + 8px);left:8px;z-index:2147483000;background:rgba(22,115,74,.94);color:#eafff2;border:1px solid #1c7a4a;border-radius:9px;padding:8px 12px;font-size:13px;font-weight:600;font-family:Inter,system-ui,sans-serif;cursor:pointer;-webkit-tap-highlight-color:transparent">' + (typeof Icones !== 'undefined' ? Icones.get('pessoas', 15) : '') + ' Reunião</button>' +
        // 🎤 áudio walkie-talkie — só aparece dentro de uma reunião (precisa de toque p/ liberar o mic)
        '<button id="rv-audio" style="display:none;position:absolute;top:calc(env(safe-area-inset-top,0px) + 50px);left:8px;z-index:2147483000;background:rgba(15,39,64,.94);color:#dbe8f5;border:1px solid #2e6f9e;border-radius:9px;padding:8px 12px;font-size:13px;font-weight:600;font-family:Inter,system-ui,sans-serif;cursor:pointer;-webkit-tap-highlight-color:transparent">' + (typeof Icones !== 'undefined' ? Icones.get('microfone', 15) : '') + ' Áudio</button>' +
        '<div id="rv-load" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#dbe8f5;font-family:Inter,system-ui,sans-serif;gap:10px;text-align:center;padding:20px">' +
        '<div style="font-size:34px">' + (typeof Icones !== 'undefined' ? Icones.get('nuvem', 15) : '') + '</div><div id="rv-load-txt" style="font-size:15px">Baixando o projeto…</div>' +
        '<div style="font-size:12px;color:#8fa3b8;max-width:320px">Depois, toque em ' + (typeof Icones !== 'undefined' ? Icones.get('caminhar', 15) : '') + ' Caminhar (ou ' + (typeof Icones !== 'undefined' ? Icones.get('celular', 15) : '') + ' RA no Android) no painel.</div></div></div>';
      (function () { var b = document.getElementById("rv-upd"); if (b) b.onclick = function () { if (typeof AutoUpdate !== "undefined" && AutoUpdate.forcar) AutoUpdate.forcar(); }; })();
      var origin = location.origin;
      function txt(t) { var e = document.getElementById("rv-load-txt"); if (e) e.textContent = t; }
      function erro(t) { var l = document.getElementById("rv-load"); if (l) { l.querySelector("#rv-load-txt").textContent = t; l.querySelector("div").textContent = "❌"; } }
      this._rvReuniao(sala); // prepara o botão/formulário da reunião (fica escondido até liberar)
      var t0 = 0, espera = setInterval(function () {
        t0++;
        if (window.BIM && BIM.montar) {
          clearInterval(espera);
          // opts.onReuniao mantém o contador no botão; onReuniaoFalha avisa quando cai a conexão
          try { BIM.montar(document.getElementById("bim-canvas"), {
            onReuniao: function (n) { App._rvReunBadge(n); },
            onReuniaoFalha: function () { App._rvReunBadge(0); alert("A reunião caiu (sem internet?). O modelo segue normal — toque em " + (typeof Icones !== "undefined" ? Icones.get("pessoas", 15) : "") + " pra reconectar."); },
            onReuniaoCheia: function () { App._rvReunBadge(0); alert("" + (typeof Icones !== "undefined" ? Icones.get("pessoas", 15) : "") + " Sala cheia — o limite é de 20 pessoas nesta reunião. Tente de novo quando alguém sair."); },
            onVoz: function (on) { App._rvAudioBadge(on); },
            onFala: function (falando) { var b = document.getElementById("rv-audio"); if (b && BIM.reuniao.audioAtiva) b.style.boxShadow = falando ? "0 0 0 3px rgba(22,163,74,.9)" : "none"; },
            onVozErro: function (nm) { App._rvAudioBadge(false); alert(nm === "NotAllowedError" ? "" + (typeof Icones !== "undefined" ? Icones.get("microfone", 15) : "") + " Você negou o microfone. Toque em " + (typeof Icones !== "undefined" ? Icones.get("microfone", 15) : "") + " de novo e permita." : "" + (typeof Icones !== "undefined" ? Icones.get("microfone", 15) : "") + " Não consegui abrir o microfone: " + nm); }
          }); }
          catch (e) { erro("Falha ao iniciar o visualizador."); return; }
          fetch(origin + "/rv/t/" + token).then(function (r) { return r.json(); }).then(function (man) {
            if (!man.ok) throw new Error(man.erro || "link inválido");
            var arqs = man.arquivos || [], i = 0;
            (function prox() {
              if (i >= arqs.length) {
                var l = document.getElementById("rv-load"); if (l) l.remove();
                var rb = document.getElementById("rv-reun"); if (rb) rb.style.display = "block"; // libera a reunião
                // abre o seletor de modo (📷 Câmera + Projeto / 👣 Caminhar) — a câmera precisa de um
                // TOQUE do usuário pra pedir permissão, então não entramos sozinhos no modo câmera.
                setTimeout(function () { try { BIM.abrirXR(); } catch (e) {} }, 800);
                return;
              }
              var a = arqs[i]; txt("Baixando " + (a.nome || "modelo") + " (" + (i + 1) + "/" + arqs.length + ")…");
              fetch(origin + "/rv/f/" + a.id).then(function (r) { if (!r.ok) throw new Error("modelo indisponível"); return r.arrayBuffer(); })
                .then(function (ab) { try { BIM.abrirBytes(ab, a.nome, a.disc); } catch (e) {} i++; setTimeout(prox, 1800); })
                .catch(function (e) { erro("Não deu pra baixar o modelo: " + (e && e.message || e)); });
            })();
          }).catch(function (e) { erro("Link expirado ou inválido. Peça um novo QR."); });
        } else if (t0 > 80) { clearInterval(espera); erro("O visualizador não carregou. Recarregue a página."); }
      }, 100);
    },
    // Botão/fluxo de reunião no visor da nuvem: o convidado informa nome/sexo/telefone (sem login) e
    // entra na sala do link. Avatar humano com capacete + camisa (nome+telefone; sem logo → iniciais).
    _rvReunBadge: function (n) {
      var b = document.getElementById("rv-reun"); if (!b) return;
      var ativa = (typeof BIM !== "undefined" && BIM.reuniao && BIM.reuniao.ativa);
      if (ativa) { b.textContent = "👥 " + (n || 1) + " — sair"; b.style.background = "rgba(15,39,64,.94)"; b.style.borderColor = "#2e6f9e"; }
      else { b.textContent = "" + (typeof Icones !== "undefined" ? Icones.get("pessoas", 15) : "") + " Reunião"; b.style.background = "rgba(22,115,74,.94)"; b.style.borderColor = "#1c7a4a"; }
      var a = document.getElementById("rv-audio"); if (a) { a.style.display = ativa ? "block" : "none"; if (!ativa) App._rvAudioBadge(false); } // áudio só faz sentido na reunião
    },
    _rvAudioBadge: function (on) {
      var a = document.getElementById("rv-audio"); if (!a) return;
      if (on) { a.textContent = "" + (typeof Icones !== "undefined" ? Icones.get("microfone", 15) : "") + " Áudio ligado"; a.style.background = "rgba(22,163,74,.94)"; a.style.borderColor = "#16a34a"; }
      else { a.textContent = "" + (typeof Icones !== "undefined" ? Icones.get("microfone", 15) : "") + " Áudio"; a.style.background = "rgba(15,39,64,.94)"; a.style.borderColor = "#2e6f9e"; a.style.boxShadow = "none"; }
    },
    _rvReuniao: function (sala) {
      var self = this;
      // identidade do convidado persistida (não retypar a cada visita)
      var g = {}; try { g = JSON.parse(localStorage.getItem("orcapro:rv:guest") || "{}"); } catch (e) {}
      // cor do uniforme derivada do nome (cada convidado fica com um tom distinto)
      function corDoNome(nome) { var h = 0, s = String(nome || "eng"); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; var hue = h % 360; return "hsl(" + hue + ",42%,38%)"; }
      function hslParaHex(hsl) { // three lê hex/nome; converte o hsl p/ #rrggbb
        var m = /hsl\((\d+),(\d+)%?,(\d+)%?\)/.exec(hsl); if (!m) return "#2e6f9e";
        var H = +m[1] / 360, Sx = +m[2] / 100, L = +m[3] / 100;
        function f(n) { var k = (n + H * 12) % 12; var a = Sx * Math.min(L, 1 - L); var c = L - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1))); return Math.round(c * 255); }
        function h2(v) { var s = v.toString(16); return s.length < 2 ? "0" + s : s; }
        return "#" + h2(f(0)) + h2(f(8)) + h2(f(4));
      }
      function abrirForm() {
        var ov = document.getElementById("rv-reun-ov"); if (ov) ov.remove();
        ov = document.createElement("div"); ov.id = "rv-reun-ov";
        ov.style.cssText = "position:fixed;inset:0;z-index:2147483600;background:rgba(4,12,22,.86);display:flex;align-items:center;justify-content:center;padding:16px;font-family:Inter,system-ui,sans-serif";
        ov.innerHTML =
          '<div style="background:#0f2740;border:1px solid #24435f;border-radius:16px;max-width:360px;width:100%;padding:20px;color:#dbe8f5">' +
          '<b style="font-size:15px">' + (typeof Icones !== 'undefined' ? Icones.get('pessoas', 15) : '') + ' Entrar na reunião</b>' +
          '<p style="font-size:12.5px;color:#9fb2c8;margin:8px 0 14px">Todo mundo com este link se vê dentro do modelo. Seu nome e telefone aparecem na camisa do seu avatar (até 20 pessoas).</p>' +
          '<label style="font-size:12px;color:#9fb2c8">Seu nome *</label>' +
          '<input id="rvr-nome" value="' + (self._escAttr(g.nome || "")) + '" placeholder="Como os outros te veem" style="width:100%;box-sizing:border-box;margin:4px 0 12px;padding:10px;border-radius:9px;border:1.5px solid #24435f;background:#0b1e33;color:#eaf2fb;font-size:14px">' +
          '<label style="font-size:12px;color:#9fb2c8">Você é</label>' +
          '<div style="display:flex;gap:8px;margin:4px 0 12px"><button type="button" data-sx="h" class="rvr-sx" style="flex:1;padding:9px;border-radius:9px;border:1.5px solid #24435f;background:#0b1e33;color:#eaf2fb;font-size:13px;cursor:pointer">' + (typeof Icones !== 'undefined' ? Icones.get('capacete', 15) : '') + ' Homem</button><button type="button" data-sx="m" class="rvr-sx" style="flex:1;padding:9px;border-radius:9px;border:1.5px solid #24435f;background:#0b1e33;color:#eaf2fb;font-size:13px;cursor:pointer">👷‍♀️ Mulher</button></div>' +
          '<label style="font-size:12px;color:#9fb2c8">Telefone (aparece na camisa)</label>' +
          '<input id="rvr-tel" value="' + (self._escAttr(g.tel || "")) + '" placeholder="(00) 00000-0000" inputmode="tel" style="width:100%;box-sizing:border-box;margin:4px 0 16px;padding:10px;border-radius:9px;border:1.5px solid #24435f;background:#0b1e33;color:#eaf2fb;font-size:14px">' +
          '<div style="display:flex;gap:8px"><button type="button" id="rvr-ok" style="flex:1;padding:11px;border-radius:9px;border:0;background:#16a34a;color:#fff;font-size:14px;font-weight:700;cursor:pointer">' + (typeof Icones !== 'undefined' ? Icones.get('foguete', 15) : '') + ' Entrar</button><button type="button" id="rvr-cancel" style="padding:11px 14px;border-radius:9px;border:1.5px solid #24435f;background:transparent;color:#cbd8e6;font-size:14px;cursor:pointer">Cancelar</button></div>' +
          '</div>';
        document.body.appendChild(ov);
        var sexo = g.sexo === "m" ? "m" : "h";
        function pintaSexo() { var bs = ov.querySelectorAll(".rvr-sx"); for (var i = 0; i < bs.length; i++) { var on = bs[i].getAttribute("data-sx") === sexo; bs[i].style.background = on ? "#16a34a" : "#0b1e33"; bs[i].style.borderColor = on ? "#16a34a" : "#24435f"; } }
        pintaSexo();
        ov.addEventListener("click", function (e) {
          if (e.target === ov || e.target.id === "rvr-cancel") { ov.remove(); return; }
          var sb = e.target.closest ? e.target.closest(".rvr-sx") : null;
          if (sb) { sexo = sb.getAttribute("data-sx"); pintaSexo(); return; }
          if (e.target.id === "rvr-ok") {
            var nome = (document.getElementById("rvr-nome").value || "").trim();
            var tel = (document.getElementById("rvr-tel").value || "").trim();
            if (nome.length < 2) { alert("Diga seu nome pra reunião."); return; }
            try { localStorage.setItem("orcapro:rv:guest", JSON.stringify({ nome: nome, tel: tel, sexo: sexo })); } catch (_) {}
            g = { nome: nome, tel: tel, sexo: sexo }; // sincroniza o closure p/ reabrir o form já preenchido na mesma sessão
            var c1 = hslParaHex(corDoNome(nome));
            var ok = false;
            try { ok = BIM.reuniao.entrar({ sala: sala, nome: nome, tel: tel, sexo: sexo, c1: c1, c2: "#f59e0b", esc: "normal", logo: "" }); } catch (_) {}
            if (ok) { ov.remove(); self._rvReunBadge(1); }
            else alert("Não consegui conectar na reunião (sem internet?). O modelo segue normal.");
          }
        });
      }
      var btn = document.getElementById("rv-reun");
      if (btn) btn.onclick = function () {
        if (typeof BIM === "undefined" || !BIM.reuniao) return;
        if (BIM.reuniao.ativa) { if (confirm("Sair da reunião?")) { BIM.reuniao.sair(); self._rvReunBadge(0); } }
        else abrirForm();
      };
      var ab = document.getElementById("rv-audio");
      if (ab) ab.onclick = function () { // o TOQUE aqui libera o mic (getUserMedia + AudioContext exigem gesto)
        if (typeof BIM === "undefined" || !BIM.reuniao || !BIM.reuniao.ativa) return;
        if (BIM.reuniao.audioAtiva) { BIM.reuniao.audioSair(); self._rvAudioBadge(false); }
        else { ab.textContent = "" + (typeof Icones !== "undefined" ? Icones.get("microfone", 15) : "") + " Ativando…"; BIM.reuniao.audioEntrar(); } // onVoz confirma; erro → onVozErro
      };
    },
    _escAttr: function (s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); },
    _iniciarDemo: function (qs) {
      var aba = (qs.match(/[?&]aba=([a-z]+)/) || [])[1] || "planilha";
      /* ⚠ NOME DO CLIENTE NA DEMONSTRAÇÃO. O Painel de Apresentação passa
       * ?empresa= e ?obra= para o relatório sair com o nome da empresa DELE em
       * vez de "Construtora Modelo" — é daí que vem a familiaridade que faz o
       * cliente se ver usando o produto. Sem os parâmetros, tudo continua como
       * era: a vitrine pública do site não muda.
       * ⚠ `decodeURIComponent` pode explodir com "%" solto na URL; um nome de
       *   empresa mal escapado não pode derrubar a demonstração inteira. */
      function _qsTxt(chave) {
        var m = qs.match(new RegExp("[?&]" + chave + "=([^&]+)"));
        if (!m) return "";
        try { return decodeURIComponent(m[1].replace(/\+/g, " ")).trim().slice(0, 60); }
        catch (e) { return ""; }
      }
      var _emp = _qsTxt("empresa"), _obraNome = _qsTxt("obra");
      Auth._usuario = { empresaId: "demo", empresa: _emp || "Construtora Modelo", email: "demo@orcapro.app", plano: "PRO" };
      try {
        if (typeof Empresa !== "undefined") Empresa.salvar({
          nome: _emp || "Construtora Modelo Ltda", cnpj: "00.000.000/0001-00", responsavel: "Eng. João da Silva",
          titulo: "Engenheiro Civil", crea: "CREA-MG 000000", registroNacional: "0000000000",
          cidade: "Uberlândia / MG", contato: "contato@construtoramodelo.com.br"
        });
      } catch (e) {}
      try { this.orcAtual = (typeof OrcDemo !== "undefined") ? OrcDemo.build() : Orcamento.novo({}); }
      catch (e) { this.orcAtual = Orcamento.novo({}); }
      this._demo = true;
      this.tela = "editor";
      this.aba = aba;
      // vitrine da GESTÃO: semeia dados de exemplo (empresa "demo") e permite deep-link
      // ?demo=1&view=<modulo> (dashboard, obras, rdos, medicoes, financeiro...) p/ site e screenshots
      try { if (typeof DemoGestao !== "undefined") DemoGestao.seed({ obra: _obraNome }); } catch (e) {}
      var vw = (qs.match(/[?&]view=([a-z]+)/) || [])[1];
      // ?view= inválido é o caminho mais provável de um visitante cair em tela
      // branca: ignora a view (cai no Painel logo abaixo) e, se for uma AÇÃO
      // disfarçada (?view=tabelas), dispara a ação depois do render.
      var vwAcao = (vw && !this.viewValida(vw) && this.VIEW_ACOES[vw]) ? vw : null;
      if (vw && !this.viewValida(vw)) vw = null;
      if (vw && vw !== "orcamentos" && typeof Gestao !== "undefined") { this.view = vw; this.tela = "gestao"; }
      // Sem deep-link (?view=/?aba=), a vitrine abre na NOVA CARA: Painel Executivo/Financeiro
      // (a OBRA TESTE alimenta os gráficos; quem quer o editor usa ?aba=planilha como antes).
      if (!vw && !/[?&]aba=/.test(qs) && typeof Gestao !== "undefined") { this.view = "dashboard"; this.tela = "gestao"; }
      this.bindGlobal();
      this.render();
      if (vwAcao) { var sAc = this; setTimeout(function () { try { sAc.irPara(vwAcao); } catch (eAc) {} }, 0); }
      // OBRA TESTE ORÇAPRO completa na vitrine: semeia DEPOIS da base SINAPI carregar
      // (os itens do orçamento pescam código/preço reais da base). Empresa "demo" é
      // isolada por empresaId — nunca toca dados reais. Silencioso: vitrine não toasta erro.
      var sDemo = this;
      this.carregarBaseSinapi().then(function () {
        // Guard de TENANT: a sessão pode ter mudado enquanto a base baixava (ex.: visitante
        // saiu/logou de verdade). Só semeia se ainda estamos na vitrine, na empresa "demo".
        if (!sDemo._demo || (typeof Auth === "undefined") || Auth.empresaId() !== "demo") return;
        try {
          if (typeof ObraDemo !== "undefined" && typeof LastPlanner !== "undefined" && typeof Orcamento !== "undefined") {
            ObraDemo.criar();
          }
        } catch (eOD) {
          // rollback: cota estourada no meio deixaria a OBRA TESTE pela metade (KPIs incoerentes)
          /* rollback de uma criação que falhou: aqui nada pôde ter sido
             editado pelo usuário, então limpa tudo mesmo */
          try { ObraDemo.remover({ apagarMexidos: true }); } catch (e2) {}
        }
        // re-render só se não atropela o visitante (modal aberto / digitando num campo)
        var ae = document.activeElement;
        if (!document.querySelector(".modal-bg") && !(ae && /INPUT|SELECT|TEXTAREA/.test(ae.tagName))) sDemo.render();
      }).catch(function () {});
      var pr = (qs.match(/[?&]print=([a-z]+)/) || [])[1];
      if (pr) { var s = this; setTimeout(function () { try { if (pr === "laudo") s.gerarLaudo(); else if (pr === "proposta") s.gerarProposta(); else if (pr === "relatorio") s.gerarRelatorio(); } catch (e) {} }, 500); }
    },

    // ---------- Render dispatcher ----------
    render: function () {
      /* contador de renders: o CronoExecUI.preparar reaproveita o cálculo do
         cronograma DENTRO do mesmo render e o refaz no seguinte (algo mudou) */
      this._rtok = (this._rtok || 0) + 1;
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
      /* ⚠ A TARJA DA PRÉVIA acompanha o render, para não sumir ao navegar
         entre módulos. Sem ela o risco não é técnico e sim humano: alguém tira
         print da prévia e manda ao cliente como se fosse a base dele.

         ⚠ E ELA É IRMÃ DA TOPBAR, NÃO FILHA — o comentário antigo dizia
         "dentro da topbar", mas o `insertBefore` sempre a pendurou ao LADO
         (`topbar.nextSibling`). Como `topbar.innerHTML = …` só limpa o que
         está dentro, cada render empilhava mais uma tarja: abrir três telas
         deixava três faixas cobrindo o sistema, e quem estava conferindo a
         versão do cliente não conseguia mais ver a tela. Comentário e código
         discordavam, e quem manda é o código — então: tira as que existem
         antes de pôr a nova, sempre, inclusive ao SAIR da prévia (senão a
         última faixa fica órfã na tela até o F5). */
      var faixaPrev = (typeof PreviewCli !== "undefined") ? PreviewCli.faixaHtml() : "";
      topbar.innerHTML = UI.renderTopbar(Auth.usuario());
      var velhas = document.querySelectorAll(".previa-faixa");
      for (var iF = 0; iF < velhas.length; iF++) {
        if (velhas[iF].parentNode) velhas[iF].parentNode.removeChild(velhas[iF]);
      }
      if (faixaPrev) {
        var wrap = document.createElement("div");
        wrap.innerHTML = faixaPrev;
        topbar.parentNode.insertBefore(wrap.firstChild, topbar.nextSibling);
      }
      /* a tarja é fixa no rodapé: sem esta folga ela cobre a última linha da
         tabela, e conferir a versão do cliente é justamente ler as tabelas */
      if (main) main.style.paddingBottom = faixaPrev ? "56px" : "";
      // Tour guiado de primeira entrada (1x por sessão; o Tour se auto-guarda via
      // localStorage). Re-valida o login DENTRO do timeout: se o usuário deslogou
      // nos 900ms, não roda sobre a tela de login nem queima a flag (gate v1.1.63).
      if (!this._tourTentado) {
        this._tourTentado = true;
        var selfT = this;
        setTimeout(function () {
          try {
            if (selfT.tela === "login" || !Auth.usuario()) return;
            if (typeof Tour !== "undefined") Tour.iniciar();
          } catch (eT) {}
        }, 900);
      }
      var podeGestao = typeof Gestao !== "undefined" && (this._demo || Gestao.podeGestao()); // demo: vitrine explora a Gestão com dados fake
      // Tela inicial = Painel de Gestão (visão executiva). Vitrine/demo continua no editor
      // de orçamento; sem Gestão (plano base) cai em Orçamentos como sempre.
      var view = this.view || (podeGestao && !this._demo && (!Auth.podeModulo || Auth.podeModulo("dashboard")) ? "dashboard" : "orcamentos");
      // Rede de segurança: quem seta App.view direto (deep-link ?view=xxx, console,
      // harness de screenshot) não passa por irPara. View desconhecida deixava o
      // #main VAZIO — normaliza aqui p/ o padrão seguro antes de qualquer render.
      if (!this.viewValida(view)) { view = this.viewPadrao(); this.view = view; }
      if (typeof Gestao !== "undefined" && !this._demo && !Gestao.podeGestao()) {
        // Sem Plus (base/sem licença): Gestão bloqueada p/ TODOS (dono e sub-usuário) → só Orçamento
        if (view !== "orcamentos") { view = "orcamentos"; this.view = "orcamentos"; }
        /* v1.1.233 — o RBAC continua valendo SEM o Plus. Este ramo jogava todo
           sub-usuário em Orçamentos mesmo quem não tem o módulo: a licença
           vencer não pode ABRIR porta que a permissão fecha. Sem módulo nenhum
           acessível, a tela honesta é o login. */
        if (Auth.podeModulo && !Auth.podeModulo("orcamentos")) {
          /* ⚠ O DONO NÃO PODE SER DESLOGADO AQUI — vira porta trancada com ele
           * do lado de fora. Quando quem esconde o Orçamentos é o PERFIL DE
           * IMPLANTAÇÃO (uma carpintaria que orça pela tabela própria) e a
           * licença cai do Plus, este ramo deslogava o DONO da conta com uma
           * mensagem mandando ele "falar com o administrador" — que é ele
           * mesmo. E o laço se fecha: ao entrar de novo, o mesmo caminho
           * desloga outra vez. Ele fica sem sistema E sem como renovar.
           * Para o sub-usuário a regra antiga continua certa: sem módulo
           * nenhum acessível, a tela honesta é o login.
           * ⚠ A condição é estreita de propósito — no perfil "completo"
           *   `Perfis.permite("orcamentos")` é true, então nada muda para
           *   quem já usa o sistema hoje. */
          var perfilEscondeu = typeof Perfis !== "undefined" && Perfis.permite && !Perfis.permite("orcamentos");
          var ehDono = !Auth.ehAdmin || Auth.ehAdmin();
          if (perfilEscondeu && ehDono) {
            try {
              UI.toast("A licença atual não dá acesso à Gestão, e o perfil desta empresa não usa o módulo Orçamentos. Renove para voltar a usar o sistema.", "erro");
              if (typeof Gestao !== "undefined" && Gestao._upsell) Gestao._upsell();
            } catch (eU) {}
          } else {
            try { UI.toast("Seu usuário não tem acesso ao módulo Orçamentos, e a licença atual não dá acesso à Gestão. Fale com o administrador da conta.", "erro"); } catch (eT) {}
            Auth.logout(); this.tela = "login"; this.orcAtual = null;
          }
        }
      } else if (podeGestao && Auth.podeModulo && !Auth.podeModulo(view)) {
        // Plus: sub-usuário sem permissão p/ a view → vai p/ um módulo permitido (Painel é sempre liberado)
        view = Auth.podeModulo("dashboard") ? "dashboard" : "orcamentos";
        this.view = view;
      }
      // sidebar de módulos (na vitrine/demo TAMBÉM: o possível cliente explora a Gestão com dados de exemplo)
      if (sidebar) {
        if (typeof Gestao === "undefined") { sidebar.innerHTML = ""; if (app) app.classList.remove("com-sidebar"); }
        else {
          sidebar.innerHTML = Gestao.renderSidebar(view);
          if (app) app.classList.add("com-sidebar");
          /* modo foco: a classe manda no grid das colunas e tem de ser
             reaplicada a CADA render — o render reescreve a barra, e sem
             isto a preferência sumia ao trocar de módulo (que é justamente
             quando o cliente quer a tela maior). */
          if (Gestao._aplicarFoco) Gestao._aplicarFoco();
        }
      }
      // módulos da Gestão
      if (view !== "orcamentos" && typeof Gestao !== "undefined") {
        // Último recurso: módulo no menu SEM case no dispatcher devolve "" e a tela
        // fica branca. afterRender só roda se o módulo renderizou de verdade.
        var htmlG = Gestao.render(view), okG = !!(htmlG && String(htmlG).trim());
        main.innerHTML = okG ? htmlG : this._viewVazia(view);
        if (okG && Gestao.afterRender) Gestao.afterRender(view);
        return;
      }
      // view = Orçamentos (fluxo original)
      if (this.tela === "editor" && this.orcAtual) {
        main.innerHTML = UI.renderEditor(this.orcAtual, this.aba);
        /* ⚠ RELIGADO A CADA RENDER, como o filtro da lista. A aba reescreve o
           HTML inteiro; o listener do render anterior morreu junto com o
           elemento, e o que nao e religado vira campo que nao responde. */
        if (this.aba === "insumos") this._ligarFiltroInsumos();
      } else {
        this.tela = "lista";
        var r = Sinapi.resumo();
        /* ⚠ AS UFs QUE DÁ PARA ESCOLHER na barra: saem do manifesto de estados
           (data/estados.json), o mesmo do assistente. Sem isso a barra fixava
           uma UF e o usuário tinha de ir a Tabelas só para trocar — e, pior,
           a barra dava a impressão de que TODO orçamento era daquela UF. Cada
           orçamento guarda a sua; esta barra é só a base para os PRÓXIMOS. */
        var _ufs = (this._estados || []).map(function (e) { return String(e.uf).toUpperCase(); })
          .filter(function (u, i, a) { return u && a.indexOf(u) === i; }).sort();
        if (!this._estados && !this._carregandoEstadosLista && this._carregarEstados) {
          this._carregandoEstadosLista = true;
          var selfL = this;
          this._carregarEstados().then(function () { selfL.render(); }, function () {});
        }
        var baseInfo = { competencia: r.competencia, uf: r.uf, total: r.total,
          personalizada: Store.temBaseSinapi(Auth.empresaId()), ufs: _ufs };
        main.innerHTML = UI.renderLista(Store.listarOrcamentos(Auth.empresaId()), baseInfo);
        this._ligarFiltroLista();
      }
    },

    /* ============ FILTRO DA CARTEIRA (fase 1 do plano) ============
     * Estado de TELA: mora aqui, nunca no orçamento. Sobrevive à navegação
     * dentro da sessão; some ao recarregar, que é o que o usuário espera de
     * um filtro (e evita a pergunta "cadê meus orçamentos?" na abertura). */
    /* ===== FASE 4: as AÇÕES do ciclo dentro do orçamento =====
     * A tela não decide regra nenhuma: desenha o que o motor autoriza para
     * ESTA pessoa, e o motor é o mesmo de medição/requisição/compras.
     * Wiring próprio (e não o `_aprovar` da Gestão) porque orçamento não é
     * entidade genérica do Store: mora em salvarOrcamento/obterOrcamento. */
    /* =====================================================================
     * O CICLO COMERCIAL NA BARRA DO EDITOR
     *
     * ⚠ ISTO NÃO É A APROVAÇÃO INTERNA. `_aprovBotoesOrc` (logo abaixo) é o
     *   aval do gestor sobre o preço; aqui é o que aconteceu com o CLIENTE.
     *   Enquanto só existia o primeiro, o painel media conversão pelo aval do
     *   chefe — ver a nota em `Orcamento.indicadoresCarteira`.
     * ===================================================================== */
    _propComercialBotoes: function (orc) {
      if (typeof Proposta === "undefined" || !Proposta.estadoComercial || !orc || !orc.id) return "";
      var est = Proposta.estadoComercial(orc);
      var v = Proposta.validade(orc, Util.agoraISO());
      var selo = "";
      if (est === "aceita") selo = '<span class="g-pill" style="background:#16a34a22;color:#16a34a;font-weight:700">Cliente aceitou</span>';
      else if (est === "recusada") selo = '<span class="g-pill" style="background:#dc262622;color:#dc2626;font-weight:700">Cliente recusou</span>';
      else if (est === "enviada") {
        selo = '<span class="g-pill" style="background:' + (v.vencida ? "#dc262622;color:#dc2626" : "#0f274022;color:#0f2740") + ';font-weight:700">'
          + "Enviada " + Util.esc(Proposta.dataBR(orc.propostaEm))
          + (v.temData ? (v.vencida ? " · vencida" : (v.faltam != null && v.faltam <= 3 ? " · vence em " + v.faltam + "d" : "")) : "") + "</span>";
      }
      /* o canal em que a proposta realmente vai: abre a conversa com o texto
         pronto (valor, validade, prazo). O PDF quem anexa é a pessoa. */
      var zap = "";
      var cli = null;
      try { cli = orc.clienteId ? Store.obter(Auth.empresaId(), "clientes", orc.clienteId) : null; } catch (eC) {}
      var fone = Proposta.telefoneCliente(orc, cli);
      if (fone) {
        var dias = Proposta.diasDesdeEnvio(orc, Util.agoraISO());
        var cobrar = (est === "enviada" && dias != null && dias >= 5);
        zap = '<button class="btn sm" data-acao="proposta-whatsapp" title="'
          + (cobrar ? "Enviada há " + dias + " dias sem resposta — abre a conversa com uma cobrança educada"
                    : "Abre a conversa no WhatsApp com o texto pronto (o PDF você anexa)") + '">'
          + (typeof Icones !== "undefined" ? Icones.get("celular", 15) : "")
          + (cobrar ? "Cobrar (" + dias + "d)" : "WhatsApp") + "</button>";
      }
      var btn = (est === "rascunho")
        ? '<button class="btn sm" data-acao="proposta-enviada" title="Registra que a proposta foi ao cliente. É esta data que vale a validade e o funil de conversão.">'
          + (typeof Icones !== "undefined" ? Icones.get("enviar", 15) : "") + "Marcar como enviada</button>"
        : '<button class="btn sm" data-acao="proposta-resposta" title="O que o cliente respondeu">'
          + (typeof Icones !== "undefined" ? Icones.get("check", 15) : "") + (est === "enviada" ? "Resposta do cliente" : "Alterar resposta") + "</button>";
      return selo + zap + btn;
    },

    /* abre a conversa com o cliente — texto de envio ou de cobrança */
    abrirPropostaWhatsApp: function () {
      var o = this.orcAtual; if (!o) return;
      var cli = null;
      try { cli = o.clienteId ? Store.obter(Auth.empresaId(), "clientes", o.clienteId) : null; } catch (e) {}
      var fone = Proposta.telefoneCliente(o, cli);
      if (!fone) { UI.toast("Este cliente não tem telefone: preencha em Gestão › Clientes ou no contato do orçamento.", "erro"); return; }
      var emp = (typeof Empresa !== "undefined" && Empresa.dados) ? Empresa.dados() : {};
      var enviada = Proposta.enviada(o);
      var dias = Proposta.diasDesdeEnvio(o, Util.agoraISO());
      var cobrar = enviada && dias != null && dias >= 5 && Proposta.estadoComercial(o) === "enviada";
      var texto = cobrar ? Proposta.textoFollowUp(o, Util.agoraISO()) : Proposta.textoWhatsApp(o, emp, Util.agoraISO());
      var self = this;
      UI.modal(cobrar ? "Cobrar a resposta no WhatsApp" : "Enviar pelo WhatsApp",
        '<p class="muted" style="margin:0 0 8px">Abre a conversa com este texto. <b>O PDF você anexa na conversa</b> — '
        + "o WhatsApp não aceita anexo por link.</p>"
        + '<div class="field"><label>Para</label><input value="+' + Util.esc(fone) + '" readonly></div>'
        + '<div class="field"><label>Mensagem (dá para editar antes de abrir)</label><textarea id="pw-txt" rows="8">' + Util.esc(texto) + "</textarea></div>"
        + (!enviada ? '<label style="display:flex;gap:8px;align-items:center;font-size:12.5px;cursor:pointer">'
            + '<input type="checkbox" id="pw-marcar" checked> Marcar a proposta como <b>enviada hoje</b> (é o que faz a validade e o funil contarem)</label>' : ""),
        [{ texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
         { texto: "Abrir WhatsApp", classe: "primary", onClick: function () {
             var msg = (UI.el("pw-txt") || {}).value || texto;
             var marcar = !enviada && !!(UI.el("pw-marcar") || {}).checked;
             var url = Proposta.linkWhatsApp(fone, msg);
             UI.fecharModal();
             if (marcar) {
               Proposta.registrarEnvio(o, { canal: "whatsapp", quando: Util.agoraISO(), por: (Empresa.nomeUsuario && Empresa.nomeUsuario()) || "" });
               self.persistir(); self.render();
               UI.toast("Proposta marcada como enviada hoje.", "ok");
             }
             try { window.open(url, "_blank", "noopener"); } catch (e2) { location.href = url; }
         } }]);
    },

    /* ---- o padrão comercial da empresa (js prefs), aplicado a qualquer orçamento ---- */
    _COMERCIAL_PADRAO: ["condicoesPagamento", "prazoExecucao", "validadeProposta", "validadeDias", "garantia", "incluso", "excluso",
      "premissas", "metodologia", "respContratada", "respContratante"],
    /* os 4 textos que a proposta imprimia FIXOS (Fase 4): o campo do modal
       Dados de cada um. Um mapa só para o modal, o salvar e o usar padrão. */
    _TEXTOS_PROPOSTA_ED: { premissas: "ed-prem", metodologia: "ed-met", respContratada: "ed-respcda", respContratante: "ed-respcte" },
    _comercialPadrao: function () {
      try { return (Store.lerPrefs(Auth.empresaId()) || {}).comercialPadrao || null; } catch (e) { return null; }
    },
    salvarComercialPadrao: function () {
      var d = {};
      var campos = { condicoesPagamento: "ed-pag", prazoExecucao: "ed-prazo", validadeProposta: "ed-val",
        garantia: "ed-gar", incluso: "ed-inc", excluso: "ed-exc",
        premissas: "ed-prem", metodologia: "ed-met", respContratada: "ed-respcda", respContratante: "ed-respcte" };
      for (var k in campos) if (Object.prototype.hasOwnProperty.call(campos, k)) d[k] = (UI.el(campos[k]) || {}).value || "";
      /* ⚠ os 4 textos novos se guardam NORMALIZADOS: o padrão do sistema
         escrito de volta no campo vira "" (vazio = o texto de sempre). Sem
         isto, "Salvar como padrão" com o placeholder copiado espalharia para
         todo orçamento novo um texto que imprime em LISTA onde o de sempre
         imprime em parágrafo. */
      for (var kT in this._TEXTOS_PROPOSTA_ED) {
        if (Object.prototype.hasOwnProperty.call(this._TEXTOS_PROPOSTA_ED, kT)) d[kT] = Orcamento.normalizarTextoComercial(kT, d[kT]);
      }
      d.validadeDias = Util.num((UI.el("ed-valdias") || {}).value);
      try {
        var p = Store.lerPrefs(Auth.empresaId()) || {};
        p.comercialPadrao = d; p.comercialPadraoEm = Util.agoraISO();
        Store.salvarPrefs(Auth.empresaId(), p);
      } catch (e) { UI.toast("Não consegui guardar: " + (e.message || e), "erro"); return; }
      UI.toast("Padrão da empresa guardado. Ele aparece como opção nos próximos orçamentos.", "ok");
      /* a porta nasce na hora (revisão 4B): o [Usar o padrão da empresa] só era
         desenhado se já houvesse padrão AO ABRIR o modal — quem acabava de
         guardar o primeiro não o via até fechar e reabrir o Dados */
      this._comercialPadraoPorta();
    },
    _comercialUsarPadraoBotao: function () {
      return '<button class="btn sm ghost" data-acao="comercial-usar-padrao" type="button" title="Preenche os campos acima com o padrão guardado">Usar o padrão da empresa</button>';
    },
    _comercialPadraoPorta: function () {
      try {
        if (typeof document === "undefined" || !document.querySelector) return false;
        if (document.querySelector('[data-acao="comercial-usar-padrao"]')) return false;
        var s = document.querySelector('[data-acao="comercial-salvar-padrao"]');
        if (!s || !s.insertAdjacentHTML) return false;
        s.insertAdjacentHTML("afterend", this._comercialUsarPadraoBotao());
        return true;
      } catch (eP) { return false; }
    },
    usarComercialPadrao: function () {
      var d = this._comercialPadrao();
      if (!d) { UI.toast("Nenhum padrão guardado ainda.", "erro"); return; }
      var campos = { condicoesPagamento: "ed-pag", prazoExecucao: "ed-prazo", validadeProposta: "ed-val",
        garantia: "ed-gar", incluso: "ed-inc", excluso: "ed-exc",
        premissas: "ed-prem", metodologia: "ed-met", respContratada: "ed-respcda", respContratante: "ed-respcte" };
      for (var k in campos) {
        if (!Object.prototype.hasOwnProperty.call(campos, k)) continue;
        var el = UI.el(campos[k]);
        if (el && d[k] != null) el.value = d[k];
      }
      var dv = UI.el("ed-valdias");
      if (dv && d.validadeDias != null) dv.value = d.validadeDias;
      /* ⚠ NÃO GRAVA: preenche o formulário e deixa a pessoa conferir e salvar.
         Escrever direto no orçamento faria "usar o padrão" apagar em silêncio
         um texto que alguém ajustou para ESTE cliente. */
      UI.toast("Campos preenchidos com o padrão. Confira e clique em Salvar.", "ok");
    },

    /* registra o ENVIO ao cliente */
    abrirPropostaEnviada: function () {
      var o = this.orcAtual; if (!o) return;
      var self = this;
      var hoje = Util.agoraISO().slice(0, 10);
      UI.modal("Proposta enviada ao cliente",
        '<p class="muted" style="margin:0 0 10px">A data de envio é a âncora de duas coisas: a <b>validade</b> impressa no documento '
        + "e a <b>conversão</b> do painel. Sem ela, o sistema não sabe o que está com o cliente.</p>"
        + '<div class="row"><div class="field"><label>Quando</label><input type="date" id="pe-data" value="' + hoje + '"></div>'
        + '<div class="field"><label>Por onde</label><select id="pe-canal">'
        + Proposta.CANAIS.map(function (c) { return '<option value="' + Util.esc(c.id) + '">' + Util.esc(c.nome) + "</option>"; }).join("")
        + "</select></div></div>",
        [{ texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
         { texto: "Registrar envio", classe: "primary", onClick: function () {
             var d = (UI.el("pe-data") || {}).value || hoje;
             Proposta.registrarEnvio(o, { canal: (UI.el("pe-canal") || {}).value || "outro",
               quando: d + "T12:00:00.000Z", por: (Empresa && Empresa.nomeUsuario && Empresa.nomeUsuario()) || "" });
             self.persistir(); UI.fecharModal(); self.render();
             var v = Proposta.validade(o, Util.agoraISO());
             UI.toast("Envio registrado." + (v.temData ? " Esta proposta vale até " + v.ateBR + "." : ""), "ok");
         } }]);
    },

    /* registra a RESPOSTA do cliente */
    abrirPropostaResposta: function () {
      var o = this.orcAtual; if (!o) return;
      if (!Proposta.enviada(o)) { UI.toast("Registre primeiro o envio ao cliente.", "erro"); return; }
      var self = this;
      var atual = (o.propostaResposta || {}).estado || "sem_resposta";
      var hoje = Util.agoraISO().slice(0, 10);
      UI.modal("O que o cliente respondeu?",
        Proposta.RESPOSTAS.map(function (r) {
          return '<label style="display:flex;gap:9px;align-items:center;padding:9px;border:1px solid var(--linha);border-radius:5px;margin-bottom:7px;cursor:pointer">'
            + '<input type="radio" name="prr" value="' + Util.esc(r.id) + '"' + (r.id === atual ? " checked" : "") + ">"
            + "<b style=\"color:" + r.cor + '">' + Util.esc(r.nome) + "</b></label>";
        }).join("")
        + '<div class="row"><div class="field"><label>Quando</label><input type="date" id="pr-data" value="' + hoje + '"></div></div>'
        + '<div class="field"><label>Motivo / observação (o "por que não" é o que ensina a próxima proposta)</label>'
        + '<textarea id="pr-motivo" rows="2">' + Util.esc((o.propostaResposta || {}).motivo || "") + "</textarea></div>",
        [{ texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
         { texto: "Salvar", classe: "primary", onClick: function () {
             var sel = document.querySelector('input[name="prr"]:checked');
             var d = (UI.el("pr-data") || {}).value || hoje;
             var r = Proposta.registrarResposta(o, { estado: sel ? sel.value : "",
               quando: d + "T12:00:00.000Z", motivo: (UI.el("pr-motivo") || {}).value || "",
               por: (Empresa && Empresa.nomeUsuario && Empresa.nomeUsuario()) || "" });
             if (!r) { UI.toast("Escolha uma resposta.", "erro"); return; }
             self.persistir(); UI.fecharModal(); self.render(); UI.toast("Resposta registrada.", "ok");
         } }]);
    },

    _aprovBotoesOrc: function (orc) {
      if (typeof Aprovacao === "undefined" || !orc || !orc.id) return "";
      var eu = (Auth.usuario && Auth.usuario()) || {};
      var ctx = {};
      try {
        ctx = {
          semOutroAprovador: Aprovacao.semOutroAprovador ? Aprovacao.semOutroAprovador(eu, Store.listar(Auth.empresaId(), "equipe") || []) : false,
          exigirOutroAprovador: false
        };
      } catch (e) {}
      var acoes = Aprovacao.acoesDisponiveis(orc, eu, ctx) || [];
      if (!acoes.length) return "";
      /* ⚠ O VERDE SAIU DAQUI, E NAO FOI ENFEITE. Estes botoes dividem a
       *   segunda linha da barra do editor com "Gerar Proposta", que e
       *   `.btn.success` — verde. Com "Aprovar" tambem verde, a linha tinha
       *   DOIS botoes gritando a mesma cor para duas coisas diferentes: um e
       *   o aval interno sobre o preco, o outro entrega o documento ao
       *   cliente. Cor repetida nao hierarquiza, confunde.
       *   O destaque desta familia passou a ser PESO (`acao-forte`), e so o
       *   primeiro da fila o recebe. "Rejeitar" fica em `danger` porque e
       *   destrutivo — vermelho aqui e aviso, nao hierarquia.
       *
       * ⚠ A ORDEM DE `acoes` VEM DE `for..in` sobre TRANSICOES: e ordem de
       *   insercao do objeto, nao prioridade. Por isso o forte e escolhido
       *   por uma preferencia EXPLICITA e nao por `acoes[0]` — trocar a ordem
       *   das chaves no motor nao pode mudar qual botao a tela destaca. */
      var classe = { aprovar: "", rejeitar: "danger", revisar: "", enviar: "", reabrir: "" };
      var PREF_FORTE = ["aprovar", "enviar", "reabrir", "revisar", "rejeitar"];
      var forte = "";
      for (var iF = 0; iF < PREF_FORTE.length; iF++) {
        if (acoes.indexOf(PREF_FORTE[iF]) >= 0) { forte = PREF_FORTE[iF]; break; }
      }
      var est = Aprovacao.estadoDe(orc), info = Aprovacao.ESTADOS[est] || {};
      var CORES = { cinza: "#64748b", ambar: "#ea580c", verde: "#16a34a", vermelho: "#dc2626" };
      var cor = CORES[info.cor] || "#64748b";
      return '<span class="g-pill" style="background:' + cor + '22;color:' + cor + ';font-weight:700;margin-right:6px">' +
        Util.esc(info.rotulo || est) + '</span>' +
        acoes.map(function (a) {
          return '<button class="btn sm ' + (classe[a] || "") + (a === forte ? " acao-forte" : "") + '" data-acao="orc-aprov" data-aprov="' + Util.esc(a) + '">' +
            Util.esc((Aprovacao.ROTULO_ACAO && Aprovacao.ROTULO_ACAO[a]) || a) + '</button> ';
        }).join("");
    },
    /* Executa a ação. Motivo obrigatório em revisar/rejeitar é regra do motor —
     * pedimos aqui e deixamos ELE recusar se vier vazio. */
    orcAprovar: function (acao) {
      var orc = this.orcAtual;
      if (!orc || typeof Aprovacao === "undefined") return;
      if (this._trialBloqueado()) { this._avisoTrial(); return; }
      var eu = (Auth.usuario && Auth.usuario()) || {};
      /* v1.1.233 — o CONTEXTO de aprovação viaja junto, como na Gestão. Sem
         ele, a política "exigir outro aprovador" configurada nas preferências
         simplesmente não chegava ao clique do ORÇAMENTO: o motor a lia como
         desligada e quem preencheu aprovava o próprio documento — a regra
         valia numa porta e não na outra. */
      var dados = {};
      try {
        var eidAp = Auth.empresaId();
        var prefsAp = Store.lerPrefs ? Store.lerPrefs(eidAp) : null;
        dados.exigirOutroAprovador = !!(prefsAp && prefsAp.exigirOutroAprovador);
        if (Aprovacao.semOutroAprovador) dados.semOutroAprovador = Aprovacao.semOutroAprovador(eu, Store.listar(eidAp, "equipe"));
      } catch (eCtx) {}
      if (acao === "revisar" || acao === "rejeitar") {
        var m = window.prompt("Escreva o motivo — é essa mensagem que chega a quem preencheu:", "");
        if (m === null) return;                       // desistiu
        dados.motivo = String(m || "").trim();
      }
      var r = Aprovacao.transicionar(orc, acao, eu, dados);
      if (!r || !r.ok) { UI.toast((r && r.erro) || "Ação não permitida agora.", "erro"); return; }
      /* ⚠ ANTES de mudar o estado (o orçamento ainda está destravado): a
         proposta sela com o prazo gravado igual ao desta tela. Sem isto, no
         modo executivo, o aprovado ficava com o vão velho no disco — a versão
         anterior do app imprimia outra entrega para a MESMA proposta, e a
         trava do aprovado impedia o salvar que alinharia (ver _materializarSeExec). */
      this._materializarSeExec(orc);
      Aprovacao.registrar(orc, acao, eu, dados, Util.agoraISO());
      orc.estadoAprovacao = r.estado;
      /* ⚠ mudou o estado de aprovação: o desfazer da IA não atravessa (um
         clique depois reverteria o que acabou de ser aprovado ou devolvido) */
      if (typeof IAEdit !== "undefined") IAEdit.limparDesfazer(orc);
      orc.atualizadoEm = Util.agoraISO();
      /* grava DIRETO: o persistir() recusa aprovado, e é justamente aprovar
         que precisa gravar o aprovado. */
      Store.salvarOrcamento(Auth.empresaId(), orc);
      this._avisouTravado = null;
      this.render();
      var rot = (Aprovacao.ESTADOS[r.estado] || {}).rotulo || r.estado;
      UI.toast(orc.numero + " → " + rot + (acao === "aprovar" ? ". A partir de agora só muda por revisão." : "."), "ok");
    },
    /* O agente lê a descrição, faz a conta e PROPÕE. Nunca lança sozinho:
     * quem confere é o orçamentista, e é por isso que a conta aparece
     * escrita — número sem conta não justifica metragem em auditoria. */
    qiCalcular: function () {
      var el = UI.el("qi-desc"), box = UI.el("qi-memo");
      if (!el || !box) return;
      var r = Orcamento.lerDescricaoQuantitativo(el.value);
      if (!r.ok) {
        box.innerHTML = '<span style="color:#dc2626">' + Util.esc(r.erro) + '</span>';
        return;
      }
      var unItem = (this._qiItem && this._qiItem.unidade) || "";
      var bate = !unItem || Orcamento.unidadeCompativel(unItem, r.unidade);
      var q = UI.el("qi-qtd");
      /* ⚠ UNIDADE QUE NÃO CASA NÃO PREENCHE. m³ lançado onde o item é m²
         passa despercebido e multiplica preço — avisa em vez de lançar. */
      if (!bate) {
        box.innerHTML = '<span style="color:#ea580c"><b>Confira:</b> a conta deu ' +
          Util.esc(Util.fmtNum(r.qtd, 2)) + " " + Util.esc(Util.unidadeExibir(r.unidade)) +
          ', mas este item é em <b>' + Util.esc(Util.unidadeExibir(unItem)) + '</b>. Não preenchi a quantidade — ajuste a descrição ou digite à mão.</span>';
        return;
      }
      if (q) q.value = Util.fmtNum(r.qtd, 2);
      this._qiMemoria = r.texto;
      box.innerHTML = '<b style="color:#16a34a">' + Util.esc(Util.fmtNum(r.qtd, 2)) + " " +
        Util.esc(Util.unidadeExibir(r.unidade)) + '</b> — ' + Util.esc(r.texto).replace(/\n/g, "<br>") +
        '<br><span style="font-size:11px">Confira antes de lançar; a conta vai junto como memória de cálculo.</span>';
    },
    /* Cria a revisão de um aprovado e abre ELA. O original fica onde está —
     * é isso que separa revisão de edição por baixo. */
    criarRevisao: function (orc) {
      if (this._trialBloqueado()) { this._avisoTrial(); return; }
      var nova = Orcamento.novaRevisao(orc, Util.agoraISO());
      if (!nova) { UI.toast("Não consegui montar a revisão deste orçamento.", "erro"); return; }
      var eid = Auth.empresaId();
      try {
        var lim = Auth.limite("limiteOrcamentos"), qtd = Store.listarOrcamentos(eid).length;
        if (lim && qtd >= lim) { UI.toast("Limite de " + lim + " orçamento(s) do seu plano atingido — a revisão é um orçamento novo.", "erro"); return; }
      } catch (eL) {}
      this._materializarSeExec(nova);   // a revisão nasce com o gravado igual ao prazo que ela mostra
      Store.salvarOrcamento(eid, nova);
      this._avisouTravado = null;
      this.abrirOrcamento(nova.id);
      UI.toast("Revisão " + nova.numero + " criada a partir do aprovado " + (orc.numero || "") +
        " — edite à vontade aqui; o aprovado continua intacto.", "ok");
    },
    /* EXPORTAR A CARTEIRA como está na tela (fase 5, último item).
     * ⚠ O ARQUIVO DIZ QUE ESTÁ FILTRADO. Lista exportada que omite o recorte
     * vira "a carteira inteira" numa reunião — e a decisão sai de um número
     * que não é o que a pessoa pensa que é. */
    exportarCarteira: function () {
      var self = this;
      var f = this._filtroOrc || {};
      var r = Orcamento.filtrarLista(Store.listarOrcamentos(Auth.empresaId()), f, Util.agoraISO());
      if (!r.lista.length) { UI.toast("Nada para exportar neste filtro.", "erro"); return; }
      var recorte = [];
      if (f.busca) recorte.push('busca "' + f.busca + '"');
      if (f.cliente) recorte.push("cliente: " + f.cliente);
      if (f.tipo) recorte.push("tipo: " + f.tipo);
      if (f.estado) recorte.push("estado: " + (((typeof Aprovacao !== "undefined" && Aprovacao.ESTADOS[f.estado]) || {}).rotulo || f.estado));
      if (f.faixa) recorte.push("valor: " + (Orcamento.FAIXAS.filter(function (x) { return x.id === f.faixa; })[0] || {}).rotulo);
      if (f.prazo) recorte.push("prazo: " + (f.prazo === "vencidos" ? "vencidos" : "a vencer"));
      if (typeof ExcelOrc === "undefined" || !ExcelOrc.ensureExcelJS) { UI.toast("Módulo Excel indisponível.", "erro"); return; }
      UI.toast("Gerando a planilha da carteira…", "ok");
      ExcelOrc.ensureExcelJS(function () {
        try {
          var wb = new ExcelJS.Workbook();
          var ws = wb.addWorksheet("Carteira");
          ws.addRow(["CARTEIRA DE ORÇAMENTOS — " + ((typeof Empresa !== "undefined" && Empresa.nomeDoc) ? Empresa.nomeDoc() : "")]);
          ws.addRow([recorte.length ? "RECORTE APLICADO: " + recorte.join(" · ") + "  (" + r.lista.length + " de " + r.total + ")"
                                    : "Carteira completa — " + r.total + " orçamento(s)"]);
          ws.addRow(["Gerado em " + new Date().toLocaleString("pt-BR")]);
          ws.addRow([]);
          var cab = ["Número", "Orçamento", "Cliente", "Obra", "Tipo", "Estado", "Etapas", "Itens",
                     "BDI %", "Preço de venda", "Prazo", "Dias p/ prazo", "Elaboração (dias)", "Atualizado em"];
          ws.addRow(cab);
          ws.getRow(1).font = { bold: true, size: 13 };
          ws.getRow(5).font = { bold: true };
          r.lista.forEach(function (m) {
            var o = m.orc, el = Orcamento.tempoElaboracao(o);
            var est = ((typeof Aprovacao !== "undefined" && Aprovacao.ESTADOS[m.estado]) || {}).rotulo || m.estado;
            ws.addRow([
              o.numero || "", o.nome || "", (o.cliente || {}).nome || "", (o.obra || {}).nome || "",
              (o.config || {}).categoria || "", est, m.tot.qtdEtapas, m.tot.qtdItens,
              Util.num(m.tot.bdiPercentual), Util.num(m.tot.precoVenda),
              m.prazo.controla ? m.prazo.data : "", m.prazo.controla ? m.prazo.dias : "",
              el.diasTrabalhados != null ? el.diasTrabalhados : (el.dias != null ? el.dias : ""),
              String(o.atualizadoEm || "").slice(0, 10).split("-").reverse().join("/")
            ]);
          });
          ws.addRow([]);
          ws.addRow(["", "", "", "", "", "", "", "", "TOTAL", Util.num(r.kpis.carteira)]).font = { bold: true };
          ws.getColumn(10).numFmt = '"R$" #,##0.00';
          ws.getColumn(9).numFmt = '0.00"%"';
          [14, 40, 26, 24, 20, 20, 8, 8, 9, 16, 12, 12, 14, 13].forEach(function (w, i) { ws.getColumn(i + 1).width = w; });
          ws.views = [{ state: "frozen", ySplit: 5 }];
          wb.xlsx.writeBuffer().then(function (buf) {
            var blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
            var a = document.createElement("a"); a.href = URL.createObjectURL(blob);
            a.download = "carteira-orcamentos" + (recorte.length ? "-filtrada" : "") + ".xlsx";
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
            UI.toast(r.lista.length + " orçamento(s) exportado(s)" + (recorte.length ? " — o arquivo registra o filtro aplicado." : "."), "ok");
          }).catch(function (e) { UI.toast("Falha ao escrever a planilha: " + (e && e.message), "erro"); });
        } catch (e) { UI.toast("Falha ao gerar a planilha: " + (e && e.message), "erro"); }
      });
    },
    _filtroOrc: null,
    /* Busca e recorte da aba Insumos & ABC. Mesmo desenho do filtro da lista:
       debounce curto e o foco DEVOLVIDO ao campo depois do redesenho — sem
       isso a pessoa digita a segunda letra em lugar nenhum. */
    _ligarFiltroInsumos: function () {
      var self = this;
      var b = UI.el("ins-busca");
      if (b) {
        var timer = null;
        b.addEventListener("input", function () {
          if (timer) clearTimeout(timer);
          var v = b.value;
          timer = setTimeout(function () {
            self._insumosOrcFiltro = self._insumosOrcFiltro || { busca: "", cat: "TODAS" };
            self._insumosOrcFiltro.busca = v;
            self.render();
            var novo = UI.el("ins-busca");
            if (novo) { novo.focus(); try { novo.setSelectionRange(novo.value.length, novo.value.length); } catch (e) {} }
          }, 250);
        });
      }
      var c = UI.el("ins-cat");
      /* ⚠ <select> fala por CHANGE, nunca por click — a base inteira ja
         tropecou nisso: o clique que ABRE a lista era tratado como acao, a
         tela redesenhava e o seletor sumia debaixo do dedo. */
      if (c) c.addEventListener("change", function () {
        self._insumosOrcFiltro = self._insumosOrcFiltro || { busca: "", cat: "TODAS" };
        self._insumosOrcFiltro.cat = c.value;
        self.render();
      });
    },

    /* A base analitica so e baixada quando a pessoa PEDE (sao ~17 MB): quem
       esta no celular do canteiro nao paga a franquia por ter passado pela
       aba. Reusa o mesmo caminho do detalhamento de composicao, que ja sabe
       resolver arquivo local, servidor ao vivo e troca de UF. */
    _insumosCarregarBase: function () {
      var self = this;
      if (typeof Analitico === "undefined") { UI.toast("Base analítica indisponível nesta instalação.", "erro"); return; }
      var ufAtivo = String((typeof Sinapi !== "undefined" && Sinapi.uf) || "").toUpperCase();
      var urls = this._prepararAnalitico();
      if (!urls.local && !urls.live) {
        UI.toast("Sem UF ativa. Escolha um estado em Tabelas de Preço e volte aqui.", "erro");
        return;
      }
      if (Analitico.reset && Analitico.uf && ufAtivo && Analitico.uf !== ufAtivo) Analitico.reset();
      UI.loading("Carregando a base analítica de " + (ufAtivo || "") + " (só na 1ª vez)…");
      Analitico.carregarArquivo(urls.alts).then(function () {
        UI.loadingFim(); self.render();
      }).catch(function (e) {
        UI.loadingFim();
        if (e && e.message === "cancelado") return;
        /* ⚠ mensagem com o que fazer, nao so o que falhou */
        UI.toast("Não consegui carregar a base analítica. Confira a internet ou baixe a base do estado em Tabelas de Preço.", "erro");
      });
    },

    /* O CSV sai do RECORTE que esta na tela, e o nome do arquivo diz qual —
       exportar filtrado e receber tudo (ou o contrario) e a pior forma de
       errar: o arquivo tem a cara de um recorte e o conteudo de outro. */
    _insumosCsv: function () {
      if (typeof InsumosOrc === "undefined" || !this.orcAtual) return;
      if (typeof Analitico === "undefined" || !Analitico.carregado) { UI.toast("Carregue a base analítica primeiro.", "erro"); return; }
      var linhas = Orcamento.linhas(this.orcAtual);
      var res = InsumosOrc.consolidar(linhas, function (c) { return Analitico.obter(c); });
      var f = this._insumosOrcFiltro || { busca: "", cat: "TODAS" };
      var lista = InsumosOrc.filtrar(res.insumos, f.busca, f.cat);
      var sep = ";";
      var out = ["Classe ABC", "Codigo", "Insumo", "Unidade", "Quantidade", "Custo unitario", "Custo total", "% do custo", "Categoria"].join(sep) + "\n";
      lista.forEach(function (x) {
        out += [x.classe, x.codigo, '"' + String(x.descricao).replace(/"/g, '""') + '"', x.unidade,
          Util.fmtNum(x.quantidade, 4), Util.fmtNum(x.custoUnitario, 2), Util.fmtNum(x.custoTotal, 2),
          Util.fmtNum(x.pct, 2), x.categoria].join(sep) + "\n";
      });
      /* ⚠ o que NAO abriu vai no mesmo arquivo, embaixo: quem levar este CSV
         para a cotacao precisa saber que parte da obra nao esta nele. */
      if (res.naoDetalhado.length) {
        out += "\n" + ["SEM COMPOSICAO — nao entram na lista de compras"].join(sep) + "\n";
        out += ["", "Codigo", "Servico", "", "", "", "Custo total", "", "Motivo"].join(sep) + "\n";
        res.naoDetalhado.forEach(function (x) {
          out += ["", x.codigo, '"' + String(x.descricao).replace(/"/g, '""') + '"', "", "", "",
            Util.fmtNum(x.custoTotal, 2), "", x.motivo].join(sep) + "\n";
        });
        out += "\nCobertura" + sep + Util.fmtNum(res.cobertura, 1) + "%\n";
      }
      var nome = "insumos-" + String(this.orcAtual.numero || this.orcAtual.id || "orcamento")
        + (f.cat && f.cat !== "TODAS" ? "-" + f.cat.toLowerCase() : "")
        + (f.busca ? "-filtrado" : "") + ".csv";
      Util.baixar(nome, "\ufeff" + out, "text/csv;charset=utf-8");
      UI.toast(lista.length + " insumo(s) exportado(s).", "ok");
    },

    _ligarFiltroLista: function () {
      var self = this;
      var liga = function (id, campo, evento) {
        var el = UI.el(id); if (!el) return;
        el.addEventListener(evento || "change", function () {
          self._filtroOrc = self._filtroOrc || {};
          self._filtroOrc[campo] = el.value;
          self.render();
          /* devolve o foco e o cursor ao campo de busca: o render refaz a
             tela inteira, e sem isto o usuário perde o campo a cada letra */
          if (campo === "busca") {
            var novo = UI.el(id);
            if (novo) { novo.focus(); try { novo.setSelectionRange(novo.value.length, novo.value.length); } catch (e) {} }
          }
        });
      };
      var busca = UI.el("fo-busca");
      if (busca) {
        var timer = null;
        busca.addEventListener("input", function () {
          if (timer) clearTimeout(timer);
          var v = busca.value;
          timer = setTimeout(function () {
            self._filtroOrc = self._filtroOrc || {};
            self._filtroOrc.busca = v;
            self.render();
            var novo = UI.el("fo-busca");
            if (novo) { novo.focus(); try { novo.setSelectionRange(novo.value.length, novo.value.length); } catch (e) {} }
          }, 250);
        });
      }
      /* seletor de UF da barra da base: troca a base ativa (dos PRÓXIMOS
         orçamentos) e recarrega. Reusa a rotina que o assistente já usa. */
      var selUf = UI.el("lst-uf");
      if (selUf) {
        selUf.addEventListener("change", function () {
          var uf = selUf.value;
          if (self.trocarEstadoSinapi) self.trocarEstadoSinapi(uf, function () { self.render(); });
        });
      }
      liga("fo-cliente", "cliente");
      liga("fo-tipo", "tipo");
      liga("fo-faixa", "faixa");
      liga("fo-estado", "estado");
      liga("fo-prazo", "prazo");
      liga("fo-ordem", "ordem");
    },

    // ---------- Eventos globais (delegação) ----------
    bindGlobal: function () {
      var self = this;
      document.body.addEventListener("click", function (e) { self.onClick(e); });
      document.body.addEventListener("change", function (e) { self.onChange(e); });
      document.body.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && self.tela === "login") self.entrar();
        // Busca universal: Ctrl+K / Cmd+K de qualquer tela logada — modificadores
        // EXATOS (não sequestra Ctrl+Shift+K/AltGr+K) e nunca por cima de
        // apresentação fullscreen ou tour (gate v1.1.63)
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && String(e.key).toLowerCase() === "k") {
          if (self.tela === "login" || typeof BuscaUI === "undefined") return;
          if (document.fullscreenElement || document.getElementById("tour-overlay")) return;
          e.preventDefault(); BuscaUI.abrir();
        }
      });
    },

    /* Ações que PARECEM view mas são MODAL — nunca existiram como módulo. Quem
     * chamava App.irPara("tabelas") caía num render vazio (Tabelas de Preço abre
     * por App.abrirTabelas()). Mapear p/ o método real em vez de só recusar. */
    VIEW_ACOES: { tabelas: "abrirTabelas" },

    /* Fonte ÚNICA de views válidas: os módulos da sidebar (Gestao.modulos) + o
     * Orçamentos. Sem a Gestão carregada, só o Orçamentos existe. */
    viewsValidas: function () {
      var vs = ["orcamentos"];
      if (typeof Gestao !== "undefined" && Gestao.modulos) {
        Gestao.modulos.forEach(function (m) { if (m && m.id && vs.indexOf(m.id) < 0) vs.push(m.id); });
      }
      return vs;
    },
    viewValida: function (view) { return !!view && this.viewsValidas().indexOf(String(view)) > -1; },

    /* Destino seguro quando a view pedida não existe: Painel (se a Gestão está
     * liberada e permitida ao usuário), senão a lista de Orçamentos. */
    viewPadrao: function () {
      var podeG = typeof Gestao !== "undefined" && (this._demo || Gestao.podeGestao());
      if (podeG && (typeof Auth === "undefined" || !Auth.podeModulo || Auth.podeModulo("dashboard"))) return "dashboard";
      return "orcamentos";
    },

    /* Navegação programática por módulo (Busca universal, sino de avisos, tour).
     * View desconhecida NUNCA passa daqui: vira ação (se for uma) ou cai no padrão
     * com aviso. Antes seguia adiante e o #main ficava VAZIO — o usuário lê tela
     * branca como "sistema quebrado" (achado ao gravar a Central de Treinamento). */
    irPara: function (view) {
      if (!view) return;
      view = String(view);
      var fn = this.VIEW_ACOES[view];
      if (fn && typeof this[fn] === "function") {
        // modal abre POR CIMA da tela atual: só navega se o estado já estiver
        // quebrado (senão perderia o orçamento aberto no editor)
        if (this.view && !this.viewValida(this.view)) { if (this._navegar(this.viewPadrao()) === false) return false; }
        try { this[fn](); } catch (eA) {}
        return true;
      }
      if (!this.viewValida(view)) {
        try { if (typeof UI !== "undefined" && UI.toast) UI.toast('Módulo "' + view + '" não existe — abrindo o Painel.', "erro"); } catch (eT2) {}
        view = this.viewPadrao();
      }
      return this._navegar(view);
    },

    /* Troca de view de fato — mesmo caminho do clique na sidebar, teardown do BIM
     * incluído. Fecha modal CRUD aberto (senão a view troca por baixo e o modal
     * fica órfão por cima). Só recebe view JÁ validada por irPara. */
    _navegar: function (view) {
      /* O CLIQUE ACIDENTAL NÃO PODE CUSTAR O FORMULÁRIO.
         Reproduzido: duplo-clique rápido mirando a sidebar com um cadastro
         aberto — o 1º clique fechava o modal (perdendo tudo digitado) e o
         2º navegava. Se há trabalho não salvo no modal, a navegação PARA e
         pergunta; recusou, fica onde está, com o formulário intacto. */
      try {
        if (typeof UI !== "undefined" && UI.temTrabalhoNaoSalvo && UI.temTrabalhoNaoSalvo()) {
          /* v1.1.232 — devolve FALSE: quem chamou precisa saber que o usuario
             RECUSOU sair. A busca universal encadeava irPara()+novoOrcamento()
             e a acao rodava mesmo com a navegacao cancelada — destruindo o
             modal cheio de dados que o confirm tinha acabado de proteger. */
          if (!window.confirm("Há um cadastro aberto com informações não salvas. Sair desta tela e perder o que foi preenchido?")) return false;
        }
        if (UI.fecharModal && document.querySelector(".modal-bg")) UI.fecharModal();
      } catch (eM) {}
      if (view !== "bim" && typeof BIM !== "undefined" && BIM.reuniao && BIM.reuniao.ativa) { try { BIM.reuniao.sair(); } catch (eR) {} }
      var ap = document.querySelector(".app"); if (ap) ap.classList.remove("menu-aberto");
      this.view = view;
      this.tela = (view === "orcamentos" ? "lista" : "gestao");
      this.orcAtual = null;
      try { if (typeof Telemetria !== "undefined") Telemetria.contaModulo(view); } catch (eTm) {}
      this.render();
      return true;
    },

    /* Aviso com saída, usado quando um módulo não produz conteúdo. Melhor isto do
     * que a tela branca — o usuário sempre tem pra onde ir. */
    _viewVazia: function (view) {
      var nome = view;
      try {
        var m = ((typeof Gestao !== "undefined" && Gestao.modulos) || []).filter(function (x) { return x.id === view; })[0];
        if (m) nome = m.nome;
      } catch (eV) {}
      var esc = (typeof Util !== "undefined" && Util.esc) ? Util.esc : function (s) { return String(s); };
      return '<div class="flex between mb"><h1 style="margin:0">Módulo indisponível</h1></div>'
        + '<div class="card" style="text-align:center;padding:34px">'
        + '<p style="font-size:15px">Não foi possível abrir <b>' + esc(nome) + "</b> agora.</p>"
        + '<p class="muted">Se continuar assim, avise o suporte do OrçaPRO.</p>'
        + '<button class="btn primary" data-view="dashboard" style="margin-top:14px">Ir para o Painel</button></div>';
    },

    onClick: function (e) {
      // celular: fecha a gaveta de módulos ao tocar fora dela (não no ☰, não num item)
      var _apM = document.querySelector(".app.menu-aberto");
      if (_apM && !(e.target.closest && (e.target.closest("#sidebar") || e.target.closest(".topbar-burger")))) { _apM.classList.remove("menu-aberto"); }
      // fecha o menu de conta ao clicar fora do botão (itens fecham após rodar sua ação)
      var _conta = document.querySelector(".topbar-conta.aberto");
      if (_conta && !(e.target.closest && e.target.closest('[data-acao="conta"]'))) { _conta.classList.remove("aberto"); }
      /* <select> fala por CHANGE, nunca por click. Sem esta saída, o clique que ABRE a
       * lista era tratado como ação (com value undefined): a tela re-renderizava e o
       * seletor sumia embaixo do dedo — no celular e no tablet ficava impossível
       * escolher a obra, e no computador "às vezes" (dependia da tela). Valia para
       * lp-obra, tar-obra, pr-troca-obra, fs-semana e galeria-troca-obra. */
      if (e.target.closest && e.target.closest("select, option")) return;
      var t = e.target.closest("[data-acao],[data-abrir],[data-del-orc],[data-aba],[data-add-item],[data-del-etapa],[data-edit-etapa],[data-del-item],[data-mover-etapa],[data-mover-item],[data-add-sub],[data-edit-sub],[data-del-sub],[data-mover-sub],[data-memoria],[data-ver-insumos],[data-base-remover],[data-atz-carregar],[data-atz-baixar],[data-conta],[data-instalar],[data-atu-base],[data-cp-add],[data-cp-del],[data-toggle-etapa],[data-opc-etapa],[data-etapa-foco],[data-view],[data-gacao],[data-gopen],[data-busca-abrir],[data-avisos-abrir],[data-ajuste],[data-ajustes-lista],[data-ajuste-restaurar],[data-coef-restaurar]");
      if (!t) return;
      // topbar: busca universal e central de avisos
      if (t.hasAttribute && t.hasAttribute("data-busca-abrir")) { if (typeof BuscaUI !== "undefined") BuscaUI.abrir(); return; }
      if (t.hasAttribute && t.hasAttribute("data-avisos-abrir")) { if (typeof AvisosUI !== "undefined") AvisosUI.abrir(); return; }
      // navegação por módulo (sidebar da Gestão)
      if (t.dataset.view) { this.irPara(t.dataset.view); return; }
      // ações da Gestão (CRUD dos módulos)
      if (t.dataset.gacao) { if (typeof Gestao !== "undefined") Gestao.acao(t.dataset.gacao, t.dataset, this); return; }
      if (t.dataset.gopen) { if (typeof Gestao !== "undefined") { var gp = String(t.dataset.gopen).split(":"); Gestao.abrir(gp[0], gp[1]); } return; }
      // login: clicar numa conta salva preenche o e-mail
      if (t.dataset.conta) { var ce = UI.el("lg-email"); if (ce) ce.value = t.dataset.conta; var cs = UI.el("lg-senha"); if (cs) cs.focus(); return; }
      // v1.1.123 — criador de composição: adicionar/remover insumo no passo 2
      if (t.dataset.cpAdd && this._cp) {
        var pAdd = String(t.dataset.cpAdd).split("|");
        var itAdd = Bases.obter(pAdd[1], pAdd[0]);
        if (itAdd) {
          var ja = this._cp.comp.insumos.some(function (i) { return String(i.codigo) === String(itAdd.codigo); });
          if (ja) { UI.toast("Este insumo já está na composição — ajuste o coeficiente dele.", "erro"); return; }
          /* A MÃO DE OBRA DO SINAPI ENTRA COMO COMPOSIÇÃO AUXILIAR (88316
             servente, 88309 pedreiro, "... COM ENCARGOS COMPLEMENTARES") e
             não traz campo categoria — o fallback antigo carimbava
             'COMPOSICAO AUXILIAR', string que o catDe não reconhece e joga
             em MAT. Resultado medido: composição 100 % de mão de obra
             gravada com custoMO=0 e custoMAT=24,88 — MO virando Material
             na base, na curva e em todo relatório que deriva dela.
             A mesma convenção que o analítico já usa (RE_MO) decide aqui. */
          var catAdd = itAdd.categoria;
          if (!catAdd && String(itAdd.tipoItem) !== "insumo") {
            catAdd = / COM ENCARGOS COMPLEMENTARES| COM ENCARGOS SOCIAIS|\(HORISTA\)|\(MENSALISTA\)/
              .test(String(itAdd.descricao || "").toUpperCase()) ? "MAO DE OBRA" : "COMPOSICAO AUXILIAR";
          }
          this._cp.comp.insumos.push({
            codigo: itAdd.codigo, descricao: itAdd.descricao, unidade: itAdd.unidade,
            coeficiente: 1, custoUnitario: Util.num(itAdd.custoUnitario),
            categoria: catAdd || (String(itAdd.tipoItem) === "insumo" ? "MATERIAL" : "COMPOSICAO AUXILIAR"),
            tipo: itAdd.tipoItem || "insumo",
            fonte: pAdd[1] // rastreia a base de origem — o resolve nunca confunde códigos homônimos
          });
          this._cpRender();
          UI.toast(itAdd.codigo + " adicionado — ajuste o coeficiente na tabela.", "ok");
        }
        return;
      }
      if (t.dataset.cpDel != null && this._cp) {
        this._cp.comp.insumos.splice(parseInt(t.dataset.cpDel, 10), 1);
        this._cpRender();
        return;
      }
      // v1.1.122 — Central de Atualização: 1 botão por banco confere o servidor.
      // Há base nova → aplica na hora; não há → informa a mais recente e a data.
      if (t.dataset.atuBase) {
        if (t.disabled) return; // reentrância: clique duplo disparava dois fluxos (gate)
        var fonteAtu = String(t.dataset.atuBase).toUpperCase(), selfA = this;
        var btnAtu = t;
        btnAtu.disabled = true;
        var stEl = function () { return document.getElementById("atu-st-" + fonteAtu); };
        var pinta = function (msg, ok) { var el = stEl(); if (el) { el.textContent = msg; el.style.color = ok ? "var(--verde)" : ""; } if (msg.indexOf("…") < 0) btnAtu.disabled = false; };
        pinta("Consultando o servidor…");
        if (fonteAtu === "SINAPI") {
          /* ⚠ O BOTÃO PERGUNTA ÀS MESMAS FONTES QUE A VARREDURA DIÁRIA, na
           *   mesma ordem (servidor → espelho). Enquanto ele só sabia
           *   perguntar ao VPS, respondia "sem atualização, você já está na
           *   mais recente" na mesma janela em que a varredura da madrugada
           *   já teria trazido a competência nova pelo espelho — duas
           *   respostas diferentes para a mesma pergunta, e a errada era a
           *   que a pessoa via ao clicar. */
          var _fimSinapi = function (r, fonte) {
            UI.toast("SINAPI atualizada" + (fonte ? " pelo " + fonte : "") + ": competência " + Atualizacao.fmtComp(r.de) + " → " + Atualizacao.fmtComp(r.para) + " (" + (r.itens || 0).toLocaleString("pt-BR") + " itens).", "ok");
            selfA.abrirTabelas(); // re-abre com a competência nova na tela
          };
          Atualizacao.atualizarSinapi(function (r) {
            if (r.ok && r.basePropria) {
              pinta("Você usa uma base PRÓPRIA importada (competência " + Atualizacao.fmtComp(r.de) + ") — a atualização oficial não mexe nela. Para voltar à SINAPI oficial, remova a base própria em " + (typeof Icones !== "undefined" ? Icones.get("importar", 15) : "") + " Importar.", true);
              return;
            }
            if (r.ok && r.atualizou) { _fimSinapi(r, "servidor"); return; }
            /* servidor sem novidade OU fora do ar → o espelho do app, que é o
               canal que a RA publica junto com o código */
            var doServidor = r.ok ? r : null;
            pinta("Servidor " + (r.ok ? "sem novidade" : "fora do ar") + " — conferindo o espelho do app…");
            Atualizacao.atualizarPeloEspelho(function (e) {
              if (e.ok && e.atualizou) { _fimSinapi(e, "espelho do app"); return; }
              var atraso = Atualizacao.mesesAtras(Sinapi.competencia);
              /* ⚠ MESMA RÉGUA DO `UI._avisoAtraso`, e pelo mesmo motivo: a CAIXA
                 publica a competência M lá pelo dia 11 do mês M+2, então a
                 distância NORMAL até o mês corrente oscila entre 1 e 2. Com o
                 limiar em dois, o botão dizia "a coleta parou em algum lugar"
                 para quem estava na competência mais nova que existe — foi o
                 que apareceu na tela do usuário. Três meses é um ciclo inteiro
                 perdido; aí a frase se sustenta. */
              var rabo = (atraso != null && atraso >= 3)
                /* ⚠ sem glifo no texto: esta base troca emoji de interface por
                   ícone (tools/test-sem-emoji.js), e aqui a frase é a segunda
                   metade de outra — o aviso está nas palavras, não no símbolo. */
                ? " Ela é de " + atraso + " meses atrás e a SINAPI sai todo mês: a coleta parou em algum lugar, não é você que está em dia."
                : "";
              if (e.ok && e.semUf) {
                pinta("O espelho está na competência " + Atualizacao.fmtComp(e.para) + " mas ainda não tem o seu estado. A sua continua a " + Atualizacao.fmtComp(e.de) + "." + rabo);
                return;
              }
              if (!e.ok && !doServidor) { pinta("⚠ " + e.erro); UI.toast(e.erro, "erro"); return; }
              if (!e.ok) { pinta("⚠ " + e.erro); return; }
              /* ⚠ A MAIOR DAS DUAS, não a do servidor. Enquanto a linha usava
                 `doServidor.para` na frente, o botão anunciava a competência do
                 VPS (06/2026) mesmo com o espelho conhecendo a 07/2026 — e com
                 a 07/2026 já carregada na tela logo acima. A pessoa lia dois
                 números diferentes para a mesma pergunta na mesma janela. */
              var _sv = Atualizacao._normComp((doServidor && doServidor.para) || "");
              var _es = Atualizacao._normComp(e.para || "");
              pinta("Sem atualização — a mais recente que o servidor e o espelho conhecem é a competência "
                + Atualizacao.fmtComp(_es > _sv ? _es : (_sv || _es))
                /* ⚠ a data de publicação é DO SERVIDOR, e só vale se a
                   competência anunciada for a dele: colar "no ar desde
                   24/07/2026" (que é da 06/2026) numa frase sobre a 07/2026
                   inventa uma data para um mês que não é o dela. */
                + ((doServidor && doServidor.publicadoEm && _sv && _sv >= _es) ? ", no ar desde " + Atualizacao.fmtData(doServidor.publicadoEm) : "")
                + ". Você já está nela." + rabo, !rabo);
            });
          });
          return;
        }
        /* EXTRAS: status do servidor → compara → reinstala se houver nova.
         * Quem sabe a chave do servidor, o arquivo e a variante é o CATÁLOGO —
         * o mapa que existia aqui era a quarta cópia dessa informação, e a
         * GOINFRA ainda precisava de um desvio próprio por causa dela. */
        var eAtu = (typeof BasesCat !== "undefined") ? BasesCat.get(fonteAtu === "GOINFRA" ? "AGETOP" : fonteAtu) : null;
        if (!eAtu || !eAtu.chaveStatus) { pinta("Este banco não tem atualização online."); return; }
        Atualizacao.statusServidor().then(function (st) {
          var srv = st && st[eAtu.chaveStatus];
          if (!srv || !srv.competencia) { pinta("O servidor não informou este banco agora — tente mais tarde."); return; }
          var inst = (Bases.lista() || []).filter(function (b) { return String(b.fonte).toUpperCase() === eAtu.id; })[0];
          if (!inst) {
            pinta("Base não instalada. A mais recente no servidor é a competência " + Atualizacao.fmtComp(srv.competencia) + ", no ar desde " + Atualizacao.fmtData(srv.publicadoEm) + " — instale nos botões " + (typeof Icones !== "undefined" ? Icones.get("estoque", 15) : "") + " abaixo.");
            return;
          }
          /* ⚠ cmpVersao, e NÃO String(a) <= String(b). A comparação de string
             concluía besteira em competência que não é data — a SEINFRA
             publica "028.1". Aqui, null = "não sei comparar", e não saber
             NUNCA pode virar "tem versão nova". */
          var cmp = BasesCat.cmpVersao(srv.competencia, inst.competencia);
          if (cmp === null) {
            pinta("Este banco numera a tabela em vez de datar a competência (aqui: " + (inst.competencia || "—") + "); não dá para comparar automaticamente. O servidor está em " + Atualizacao.fmtComp(srv.competencia) + " — reinstale abaixo se quiser trocar.");
            return;
          }
          if (cmp <= 0) {
            pinta("Sem atualização — a mais recente é a competência " + Atualizacao.fmtComp(srv.competencia) + ", no ar desde " + Atualizacao.fmtData(srv.publicadoEm) + ". Você já está nela.", true);
            return;
          }
          pinta("Baixando a competência " + Atualizacao.fmtComp(srv.competencia) + "…");
          /* reinstala com a MESMA variante que já estava carregada: atualizar
             competência não pode trocar a região do SETOP nem o regime da
             GOINFRA pelas costas do usuário */
          var deComp = inst.competencia;
          Bases.instalar(eAtu.id, inst.sel || null, { pesoMb: eAtu.pesoMb }).then(function (r) {
            UI.toast(eAtu.nome + " atualizada: competência " + Atualizacao.fmtComp(deComp) + " → " + Atualizacao.fmtComp(r.competencia || srv.competencia) + " (" + (r.total || 0).toLocaleString("pt-BR") + " itens).", "ok");
            selfA.abrirTabelas();
          }).catch(function (e) { pinta("" + (typeof Icones !== "undefined" ? Icones.get("alerta", 15) : "") + " Falhou ao baixar: " + ((e && e.message) || "erro")); });
        }).catch(function () { pinta("" + (typeof Icones !== "undefined" ? Icones.get("alerta", 15) : "") + " Sem conexão com o servidor OrçaPRO agora — a base atual foi mantida."); });
        return;
      }
      /* INSTALAR UM BANCO — o único caminho, dirigido pelo catálogo.
       * Substituiu os três que existiam (data-inclusa com o caminho escrito na
       * mão, carregar-setop e carregar-goinfra, cada um com seu default). A
       * variante sai dos selects que a própria linha desenhou a partir dos
       * eixos do catálogo, então tela e handler não têm como divergir. */
      if (t.dataset.instalar) {
        if (!this._podeBases()) { this._recusaBases("Instalar uma tabela de preço"); return; }
        if (t.disabled) return;                       // clique duplo disparava dois downloads
        var catId = String(t.dataset.instalar).toUpperCase(), selfI = this, btnI = t;
        var eI = (typeof BasesCat !== "undefined") ? BasesCat.get(catId) : null;
        if (!eI) { UI.toast("Banco fora do catálogo: " + catId, "erro"); return; }
        var selI = {};
        (eI.eixos || []).forEach(function (ex) {
          var el = UI.el("tabi-" + eI.id + "-" + ex.id);
          selI[ex.id] = (el && el.value) || ex.padrao;
        });
        var rotuloI = btnI.textContent;
        btnI.disabled = true; btnI.textContent = "Instalando…";
        Bases.instalar(catId, selI, { pesoMb: eI.pesoMb }).then(function (r) {
          UI.toast(eI.nome + " instalada: " + r.total.toLocaleString("pt-BR") + " itens (" +
            ((typeof BasesCat !== "undefined" && BasesCat.fmtVersao(r.competencia)) || r.competencia || "") +
            (r.uf ? " · " + r.uf : "") + ")" +
            (r.live ? " — do servidor, mais recente" : " — a que veio no app") + "." +
            (r.persistido ? "" : " ⚠ " + r.gravErro), r.persistido ? "ok" : "erro");
          selfI.abrirTabelas();                       // re-render com a linha já instalada
        }).catch(function (err) {
          btnI.disabled = false; btnI.textContent = rotuloI;
          UI.toast("Não consegui instalar " + eI.nome + ": " + err.message, "erro");
        });
        return;
      }

      // navegação por aba
      if (t.dataset.aba) { this.aba = t.dataset.aba; this.render(); return; }
      /* ⚠ `!== undefined`, e nao truthy: o botao "Todas as etapas" carrega
         data-etapa-foco="" de proposito, e string vazia e falsy — com um
         `if (t.dataset.etapaFoco)` o proprio botao de limpar o filtro nao
         funcionaria. */
      if (t.dataset.etapaFoco !== undefined) { this._etapaFoco = t.dataset.etapaFoco || ""; this.render(); return; }
      if (t.dataset.acao === "idx-toggle") {
        this._idxAberto = !this._idxAberto;
        try { localStorage.setItem("orcapro:idxEtapas", this._idxAberto ? "1" : "0"); } catch (e) {}
        this.render(); return;
      }
      if (t.dataset.acao === "pl-compacta") {
        this._plCompacta = !this._plCompacta;
        try { localStorage.setItem("orcapro:plCompacta", this._plCompacta ? "1" : "0"); } catch (e) {}
        this.render(); return;
      }
      // abrir orçamento
      // excluir orçamento (ANTES do abrir: o botão fica dentro do card clicável)
      if (t.dataset.delOrc) { this.confirmarExcluirOrcamento(t.dataset.delOrc); return; }
      if (t.dataset.opcEtapa) {
        var _oe = this.orcAtual; if (!_oe) return;
        var _et = (_oe.etapas || []).filter(function (x) { return x.id === t.dataset.opcEtapa; })[0];
        if (!_et) return;
        var virou = !_et.opcional;
        Orcamento.marcarEtapaOpcional(_oe, t.dataset.opcEtapa, virou);
        this.persistir(); this.render();
        UI.toast(virou
          ? '"' + (_et.nome || "Etapa") + '" vira ADICIONAL na proposta: sai fora do valor total, num bloco de opcionais. Na planilha e no Excel ela continua somando.'
          : '"' + (_et.nome || "Etapa") + '" voltou para o valor fechado da proposta.', "ok");
        return;
      }
      if (t.dataset.abrir) { this.abrirOrcamento(t.dataset.abrir); return; }
      // adicionar item -> abre busca SINAPI. "etapaId" ou "etapaId|subEtapaId"
      if (t.dataset.addItem) {
        var ai = String(t.dataset.addItem).split("|");
        this.abrirBuscaSinapi(ai[0], "", ai[1] || "");
        return;
      }
      // sub etapas (1.1) — criar / renomear / remover / reordenar
      if (t.dataset.addSub) { this.addSubEtapa(t.dataset.addSub); return; }
      if (t.dataset.editSub) { var es = String(t.dataset.editSub).split("|"); this.renomearSubEtapa(es[0], es[1]); return; }
      if (t.dataset.delSub) { var ds = String(t.dataset.delSub).split("|"); this.removerSubEtapa(ds[0], ds[1]); return; }
      if (t.dataset.moverSub) {
        if (t.disabled) return;
        var ms = String(t.dataset.moverSub).split("|");
        Orcamento.moverSubEtapa(this.orcAtual, ms[0], ms[1], parseInt(ms[2], 10));
        this.persistir(); this.render(); return;
      }
      // renomear etapa (sem recriar)
      if (t.dataset.editEtapa) { this.renomearEtapa(t.dataset.editEtapa); return; }
      // remover etapa
      if (t.dataset.delEtapa) { this.removerEtapa(t.dataset.delEtapa); return; }
      // recolher/expandir a etapa (accordion) — só marcação, nada de persistir
      if (t.dataset.toggleEtapa) { this.toggleEtapa(t.dataset.toggleEtapa); return; }
      // reordenar etapa "etapaId|dir" (dir -1 sobe / 1 desce)
      if (t.dataset.moverEtapa) {
        if (t.disabled) return;
        var me = String(t.dataset.moverEtapa).split("|");
        Orcamento.moverEtapa(this.orcAtual, me[0], parseInt(me[1], 10));
        this.persistir(); this.render(); return;
      }
      // reordenar item "etapaId|itemId|dir"
      if (t.dataset.moverItem) {
        if (t.disabled) return;
        var mi = String(t.dataset.moverItem).split("|");
        Orcamento.moverItem(this.orcAtual, mi[0], mi[1], parseInt(mi[2], 10));
        this.persistir(); this.render(); return;
      }
      // remover item "etapaId|itemId"
      if (t.dataset.delItem) {
        var pr = t.dataset.delItem.split("|");
        this.removerItem(pr[0], pr[1]); return;
      }
      // memória de cálculo do quantitativo "etapaId|itemId" (FASE 3, Lei 14.133)
      if (t.dataset.memoria) {
        var pm = t.dataset.memoria.split("|");
        this.abrirMemoria(pm[0], pm[1]); return;
      }
      // selo "alterado por você": abre o comparativo com o preço da base
      if (t.dataset.ajuste) {
        var pa = String(t.dataset.ajuste).split("|");
        this.abrirAjuste(pa[0], pa[1]); return;
      }
      if (t.dataset.ajustesLista) { this.abrirAjustesLista(); return; }
      if (t.dataset.ajusteRestaurar) {
        var pr = String(t.dataset.ajusteRestaurar).split("|");
        this._restaurarAjuste(pr[0], pr[1], pr.slice(2).join("|")); return;
      }
      /* restaurar coeficiente pelo selo, sem sair do detalhamento */
      if (t.dataset.coefRestaurar) {
        var cx = UI._ajusteCtx;
        if (cx) {
          var baseC = Ajustes.delta(cx.item, "coef:" + t.dataset.coefRestaurar,
            Ajustes.valorAtual(cx.item, "coef:" + t.dataset.coefRestaurar));
          if (baseC) this._ajustarCoeficiente(t.dataset.coefRestaurar, baseC.base);
        }
        return;
      }
      // ver insumos (composição explodida)
      if (t.dataset.verInsumos) { this.verInsumos(t.dataset.verInsumos, t.dataset.viItem); return; }
      // remover base extra — a PROPRIA guarda composições AUTORAIS (não há como
      // reimportar), então exige confirmação explícita antes de apagar
      if (t.dataset.baseRemover) {
        if (!this._podeBases()) { this._recusaBases("Remover uma tabela de preço"); return; }
        var fonteRem = String(t.dataset.baseRemover).toUpperCase(), selfRem = this;
        if (fonteRem === "PROPRIA") {
          var bRem = Bases.extras().filter(function (x) { return x.fonte === "PROPRIA"; })[0];
          var nRem = bRem && bRem.itens ? bRem.itens.length : 0;
          UI.modal("" + (typeof Icones !== "undefined" ? Icones.get("alerta", 15) : "") + " Apagar a base própria?", '<p style="font-size:13px">A base própria tem <b>' + nRem + ' composição(ões) criada(s) por você</b>. Diferente das bases importadas, elas <b>não existem em nenhum arquivo</b> para reimportar — apagar é definitivo.</p>', [
            { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
            { texto: "Apagar mesmo assim", classe: "danger", onClick: function () { Bases.remover("PROPRIA"); Bases.persistir(Auth.empresaId(), { permitirRemocao: true }); UI.fecharModal(); UI.toast("Base própria removida.", "ok"); selfRem.abrirTabelas(); } }
          ]);
          return;
        }
        Bases.remover(fonteRem); Bases.persistir(Auth.empresaId(), { permitirRemocao: true }); UI.toast("Base removida.", "ok"); this.abrirTabelas(); return;
      }
      // atualizar competência (carregar do cache / baixar da Caixa)
      if (t.dataset.atzCarregar) { this.carregarCompetencia(t.dataset.atzCarregar, true); return; }
      if (t.dataset.atzBaixar) { this.carregarCompetencia(t.dataset.atzBaixar, false); return; }

      var acao = t.dataset.acao;
      switch (acao) {
        case "etapas-recolher-todas": return this.recolherTodasEtapas();
        // v1.1.134 — ciclo completo de composições próprias
        case "minhas-composicoes": this.minhasComposicoes(); break;
        case "mc-ver": this.verInsumos(t.dataset.cod); break;
        case "mc-editar": this.editarComposicao(t.dataset.cod); break;
        case "mc-editar-insumo": this.editarInsumoProprio(t.dataset.cod); break;
        case "mc-duplicar": this.duplicarComposicao(t.dataset.cod); break;
        case "mc-excluir": this.excluirProprio(t.dataset.cod); break;
        case "mc-limpar-clones": this.limparClonesProprias(); break;
        case "cp-memoria": this.cpMemoria(t.dataset.i); break;
        case "cp-novo-insumo": this._cpNovoInsumoInline(); break;
        case "cp-salvar-insumo": this._cpSalvarInsumoInline(); break;
        case "cp-voltar-busca": this._cpBuscar(this._cp && this._cp.busca); break;
        case "entrar": this.entrar(); break;
        case "logout":
          // Na VITRINE (?demo=1): sair = recarregar a página LIMPA (sem ?demo=1). Sem isso,
          // (a) o seed assíncrono da OBRA TESTE poderia gravar no tenant errado após o logout
          // e (b) a flag _demo sobreviveria a um login real na mesma página (bypass de licença).
          if (this._demo) { try { location.href = location.pathname; } catch (eD) {} break; }
          if (typeof BIM !== "undefined" && BIM.reuniao && BIM.reuniao.ativa) { try { BIM.reuniao.sair(); } catch (eR) {} }
          /* v1.1.232 — o logout desarma TUDO que reconecta sozinho. O gatilho
             de 'online' e o timer de retentativa ficavam vivos e religavam a
             nuvem SEM usuário logado: Auth.empresaId() sem sessão cai no
             namespace 'default', e a escuta ficava presa lá — os dados da
             empresa paravam de sincronizar até recarregar a página, sem erro. */
          try { clearTimeout(this._nuvemTimer); this._nuvemTimer = null; } catch (eNt) {}
          if (typeof Nuvem !== "undefined") Nuvem.sair(); Auth.logout(); this.tela = "login"; this.orcAtual = null; this.render(); break;
        case "tema": this.abrirTema(); break;
        case "minha-foto": this.abrirMinhaFoto(); break;
        case "atualizar": if (typeof AutoUpdate !== "undefined" && AutoUpdate.forcar) AutoUpdate.forcar(); break; // botão manual: puxa a versão nova limpando o cache (essencial no celular, que não tem Ctrl+Shift+R)
        /* dois eixos, dois despachos: iluminação e letra são escolhas
           independentes — trocar uma não pode zerar a outra */
        case "tema-op": this.aplicarTema(t.dataset.temaVal, null); break;
        case "tema-fonte": this.aplicarTema(document.documentElement.getAttribute("data-tema"), t.dataset.fonteVal); break;
        case "tema-mov": this.aplicarMovimento(t.dataset.movVal); break;
        case "esqueci-senha": this.redefinirSenhaUI(); break;
        case "empresa": this.abrirEmpresa(); break;
        case "licenca": this.abrirLicenca(); break;
        case "backup": this.abrirBackup(); break;
        case "nuvem": this.abrirNuvem(); break;
        case "celular": this.abrirCelular(); break;
        case "backup-export": this.exportarBackup(); break;
        case "menu": { var _apT = document.querySelector(".app"); if (_apT) _apT.classList.toggle("menu-aberto"); break; }
        case "conta": { var _c = t.closest(".topbar-conta"); if (_c) _c.classList.toggle("aberto"); break; }
        case "instalar-app": this.instalarApp(); break;
        case "tabelas": this.abrirTabelas(); break;
        case "escanear-pasta": this.escanearPastaUI(); break;
        case "cron-recalc": this.cronRecalc(); break;
        case "cron-reset": this.cronReset(); break;
        /* ⚠ o [Refinar com IA] da aba Cronograma é ATALHO do Editar com IA (chip
           Cronograma + pedido pronto): a resposta passa pelo diff antes de
           gravar. O cronRefinarIA antigo gravava direto e ficou sem porta. */
        case "cron-ia": this.iaEditarAbrir({ alvo: "cronograma", pronto: "refinar" }); break;
        case "ia-editar": this.iaEditarAbrir({}); break;
        case "ia-desfazer": this.iaDesfazer(); break;
        case "cron-pdf": this.cronPDF(); break;
        case "cron-msproject": this.cronMSProject(); break;
        // cronograma executivo (Fase 2): estado de TELA (nunca do orçamento) e os handlers que gravam pelo _cronoAlvo
        case "crono-sub": this._cronoEstado("_cronoSub", t.dataset.sub); break;
        case "crono-det": this._cronoEstado("_cronoDet", t.dataset.det); break;
        case "crono-ir-ff": this.aba = "cronograma"; this._cronoEstado("_cronoSub", "fisico"); break;
        case "crono-abrir": this._cronoAbrirEtapa(t.dataset.etapa, t.dataset.valor); break;
        case "crono-ff": this._cronoFFEstado(t.dataset.camada, t.dataset.modo); break;
        case "crono-exec": this.cronExecAlternar(t.dataset.ligar === "1"); break;
        case "crono-params": this.cronParamsAvancados(); break;
        case "crono-detalhar": this.cronDetalharEtapa(t.dataset.etapa); break;
        // porta do aviso "aprovado com o gravado velho": a revisão é o caminho que existe (o aprovado não se regrava)
        case "crono-revisao": if (this.orcAtual) this.criarRevisao(this.orcAtual); break;
        /* planejamento da obra (Fase 3). ⚠ Estas ações são as MESMAS no
           orçamento e na ficha da obra (o painel do CronoExecUI emite os mesmos
           data-acao nos dois lugares): uma função por ação, aqui. */
        case "crono-plano-iniciar": this.cronoIniciarPlano(t.dataset.obra); break;
        case "crono-obra-criar": this.cronoCriarObra(); break;
        case "crono-obra-passar": this.cronoPassarObra(t.dataset.obra); break;
        case "crono-obra-sel": this._cronoEstado("_cronoObraSel", t.dataset.obra || null); break;
        case "crono-editar": this._cronoEstado("_cronoEditaPlano", t.dataset.modo === "plano"); break;
        case "crono-congelar": this.cronoCongelar(t.dataset.obra, t.dataset.reprogramar === "1"); break;
        case "crono-historico": this.cronoHistorico(t.dataset.obra); break;
        case "crono-planejamento": this.cronoAbrirPlanejamento(t.dataset.obra); break;
        case "crono-abrir-orc": this.cronoAbrirOrcamento(t.dataset.orc); break;
        case "exec-recalc": this.execRecalc(); break;
        case "exec-cronograma": this.execEnviarCronograma(); break;
        case "parede-explodir": this.paredeExplodir(); break;
        case "parede-aplicar": this.paredeAplicar(); break;
        case "novo": this.novoOrcamento(); break;
        case "copiar-orc": this.copiarOrcamento(); break;
        case "importar-sinapi": this.abrirImportSinapi(); break;
        case "base-oficial": this.voltarBaseOficial(); break;
        case "atualizar": this.abrirAtualizar(); break;
        /* prévia de versão de cliente — ver js/previewcli.js */
        case "previa-sair": if (typeof PreviewCli !== "undefined") PreviewCli.sair(); break;
        case "previa-abrir": this.abrirPrevia(); break;
        case "processar-import": this.processarImportSinapi(); break;
        case "voltar": this.tela = "lista"; this.orcAtual = null; this.render(); break;
        case "add-etapa": this.addEtapa(); break;
        case "salvar-bdi": this.salvarBdi(); break;
        case "exportar": this.exportar(); break;
        case "cenarios": this.compararCenarios(); break;
        case "criar-composicao": this.criarComposicao(); break;
        case "cp-agente": this.cpAgente(); break;
        case "cp-passo1": this._cp.passo = 1; this._cpRender(); break;
        case "cp-passo2": this._cpColeta1(); this._cp.passo = 2; this._cpRender(); break;
        case "cp-salvar": this.cpSalvar(); break;
        case "aplicar-cenario": this.aplicarCenario(t.dataset.bdi); break;
        case "exportar-excel": this.exportarExcel(); break;
        case "insumos-carregar-base": this._insumosCarregarBase(); break;
        case "insumos-csv": this._insumosCsv(); break;
        case "reimportar-excel": this.reimportarExcel(); break;
        case "importar-planilha": this.importarPlanilha(); break;
        case "recuperar-planilha": this.recuperarPlanilha(); break;
        case "orc-aprov": this.orcAprovar(t.dataset.aprov); break;
        case "esc-elaborar": this.escopoElaborar(t.dataset.i); break;
        case "escopo-sugerir": this.escopoSugerir(); break;
        case "escopo-aux-nenhum": this.escopoAuxNenhum(); break;
        case "escopo-aux-add": this.escopoAuxAdd(); break;
        case "escopo-planilha": this.escopoPlanilha(); break;
        case "escopo-documento": this.escopoDocumento(); break;
        case "qi-calcular": this.qiCalcular(); break;
        // memorial de cálculo: agente, IA de reforço e calculadora
        case "fechar-valor": this.fecharValor(); break;
        case "fechar-desfazer": this.fecharDesfazer(); break;
        case "mem-agente": this.memAgente(false); break;
        case "mem-agente-ia": this.memAgente(true); break;
        case "mem-calc": this.memCalcular(); break;
        case "fo-exportar": this.exportarCarteira(); break;
        case "fo-limpar": this._filtroOrc = null; this.render(); break;
        case "import-reanalisar": this.importRemapear(); break;
        case "import-confirmar": this.criarOrcamentoDaImportacao(); break;
        case "config-orc": this.editarDadosOrc(); break;
        case "parametros-orc":
          /* v1.1.234 — APROVADO NÃO MUDA NEM POR AQUI. O wizard grava com
             Store.salvarOrcamento direto, por fora do persistir() que recusa
             aprovado: trocar o BDI em ⚙ Parâmetros alterava o preço de um
             orçamento que o cliente já aceitou — a trava valia numa porta e
             não na outra. Quem precisa mexer cria revisão. */
          if (this.orcAtual && Orcamento.travadoPorAprovacao && Orcamento.travadoPorAprovacao(this.orcAtual)) {
            UI.toast("Este orçamento está " + ((Aprovacao.ESTADOS[this.orcAtual.estadoAprovacao] || {}).rotulo || "aprovado") + " — os parâmetros não mudam mais. Para alterar, crie uma revisão.", "erro");
            break;
          }
          if (typeof OrcWizard !== "undefined" && this.orcAtual) OrcWizard.editarParametros(this, this.orcAtual);
          break;
        case "escopo": this.abrirEscopo(); break;
        case "escopo-ia": this.analisarEscopoIA(); break;
        case "escopo-casar": this.refinarEscopoCasar(); break;
        case "escopo-analisar": this.analisarEscopo(); break;
        case "escopo-confirmar": this.confirmarEscopo(); break;
        case "proposta": this.gerarProposta(); break;
        case "proposta-enviada": this.abrirPropostaEnviada(); break;
        case "proposta-resposta": this.abrirPropostaResposta(); break;
        case "proposta-whatsapp": this.abrirPropostaWhatsApp(); break;
        case "comercial-salvar-padrao": this.salvarComercialPadrao(); break;
        case "comercial-usar-padrao": this.usarComercialPadrao(); break;
        case "apresentar": {
          if (!this.orcAtual || typeof Apresentacao === "undefined") { UI.toast("Abra um orçamento primeiro.", "erro"); break; }
          // apresentação é cara ao cliente: não projeta orçamento com item zerado
          var _sp = Orcamento.itensSemPreco(this.orcAtual);
          if (_sp.length) {
            UI.toast("⛔ " + _sp.length + " item(ns) sem preço (" + _sp.slice(0, 3).map(function (i) { return i.numero; }).join(", ") + (_sp.length > 3 ? "…" : "") + "). Preencha o custo na planilha antes de apresentar.", "erro");
            break;
          }
          // v1.1.232 — quantidade pendente vale o mesmo que preço zerado aqui:
          // projetar um total que não contém um dos serviços listados é pior
          // que não apresentar
          var _sq = Orcamento.itensSemQuantidade ? Orcamento.itensSemQuantidade(this.orcAtual) : [];
          if (_sq.length) {
            UI.toast("⚠ " + _sq.length + " item(ns) sem quantidade. Clique em Calcular na linha para levantar a metragem antes de apresentar.", "erro");
            break;
          }
          Apresentacao.abrir(this.orcAtual); break;
        }
        case "laudo": this.gerarLaudo(); break;
        case "relatorio": this.gerarRelatorio(); break;
        case "proposta-imprimir": window.print(); break;
        case "proposta-fechar": this.fecharProposta(); break;
      }
    },

    onChange: function (e) {
      /* Editar com IA: o checkbox do diff (só o NÚMERO da mudança — as ops
         ficam em memória) e o chip de alvo do pedido (troca só os exemplos;
         redesenhar o modal perderia o que foi digitado) */
      if (e.target && e.target.getAttribute && e.target.getAttribute("data-ia-idx") != null) {
        this._iaAlternarTela(parseInt(e.target.getAttribute("data-ia-idx"), 10), !!e.target.checked);
        return;
      }
      if (e.target && e.target.getAttribute && e.target.getAttribute("data-ia-alvo-chip") != null) {
        var exIA = UI.el("ia-exemplos");
        if (exIA) exIA.innerHTML = this._iaExemplosHtml(e.target.value);
        return;
      }
      /* Mover um item entre os grupos da etapa (solto ↔ sub etapa). É <select>,
         então fala por CHANGE — o onClick retorna cedo em "select, option". */
      if (e.target && e.target.getAttribute && e.target.getAttribute("data-item-sub")) {
        var ps = String(e.target.getAttribute("data-item-sub")).split("|");
        var destino = e.target.value || "";
        Orcamento.moverItemParaSub(this.orcAtual, ps[0], ps[1], destino);
        this.expandirEtapa(ps[0], destino);
        this.persistir(); this.render();
        UI.toast(destino ? "Item movido para a sub etapa." : "Item solto na etapa.", "ok");
        return;
      }
      // Parede-Cebola: trocar o candidato SINAPI de uma camada no preview → atualiza escolhido,
      // re-checa unidade (ok/revisar) e re-renderiza (badge, confiança e contador do botão ao vivo).
      if (e.target && e.target.getAttribute && e.target.getAttribute("data-pc-cand") != null && this._pcPreview) {
        var seq = parseInt(e.target.getAttribute("data-pc-cand"), 10), idx = parseInt(e.target.value, 10);
        var cam = (this._pcPreview.resultado.camadas || []).filter(function (c) { return c.seq === seq; })[0];
        if (cam && cam.candidatos[idx]) {
          cam.escolhido = idx;
          var cand = cam.candidatos[idx];
          // mesma régua do motor (v1.1.233): unidadeChave normaliza ²→2 — o compare cru derrubava m² × M2
          var div = Util.unidadeChave(cand.item.unidade) !== Util.unidadeChave(cam.unidade);
          cam.unidadeDivergente = div; cam.status = cam.qtdZero ? cam.status : (div ? "revisar" : "ok"); cam.confianca = Util.num(cand.confianca);
          // recomputa os contadores p/ o botão/pills não ficarem stale
          var r = this._pcPreview.resultado, nOk = 0, nRev = 0, nPend = 0;
          r.camadas.forEach(function (c) { if (c.qtdZero) return; if (c.status === "ok") nOk++; else if (c.status === "revisar") nRev++; else nPend++; });
          r.nOk = nOk; r.nRevisar = nRev; r.nPendentes = nPend;
          this.render();
        }
        return;
      }
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
      if (e.target.id === "bkp-perfil") { var pf = e.target.files && e.target.files[0]; if (pf) this.recuperarPerfilDeBackup(pf); return; }
      // folha semanal de diaristas (planilha da semana, uma obra por aba)
      if (e.target.id === "fs-file") { var ff = e.target.files && e.target.files[0]; if (ff && typeof Gestao !== "undefined") Gestao.fsImportarArquivo(ff); return; }
      // ligar/desligar base de preço
      if (e.target.matches("[data-base-toggle]")) { Bases.setAtiva(e.target.dataset.baseToggle, e.target.checked); return; }
      /* editar uma SUBETAPA (duração, "Depende de", equipes) no cronograma
         executivo. A decisão (validação, o que apagar, o que nunca gravar) é
         pura em CronoExecUI.editarFolha — testada executando em
         tools/test-cronoexecui.js; aqui só o alvo único, a trava e o salvar.
         ⚠ inválido não grava: o recado diz e o render devolve o valor anterior. */
      if (e.target.matches("[data-crono-sub-dur]") || e.target.matches("[data-crono-sub-pred]") || e.target.matches("[data-crono-sub-eq]")) {
        var alvoS = this._cronoAlvo(); if (!alvoS || typeof Cronograma === "undefined" || typeof CronoExecUI === "undefined") return;
        if (alvoS.travado) { this._cronoTravado(alvoS); return; }
        var dsS = e.target.dataset;
        var campoS = dsS.cronoSubDur != null ? "dur" : (dsS.cronoSubPred != null ? "pred" : "eq");
        var idS = dsS.cronoSubDur != null ? dsS.cronoSubDur : (dsS.cronoSubPred != null ? dsS.cronoSubPred : dsS.cronoSubEq);
        // o prazo desta tela ANTES de mexer: é o "antes" do recado (ver _cronoMaterializar)
        var antesS = null; try { antesS = Cronograma.estimar(alvoS.orc); } catch (eA) { antesS = null; }
        var resS = CronoExecUI.editarFolha(alvoS.cron, Cronograma.eap(alvoS.orc), campoS, idS, e.target.value);
        if (!resS.ok) { UI.toast(resS.msg, "erro"); this.render(); return; }
        if (resS.mudou) alvoS.salvar({ cronoAntes: antesS });
        if (resS.msg) UI.toast(resS.msg, "info");   // gravou, mas algo que a pessoa precisa saber (ex.: duração digitada manda sobre equipes)
        this.render(); return;
      }
      /* data de corte do previsto × realizado: estado de TELA por obra (nunca
         gravado — é o dia que se quer olhar, não um dado da obra). Vazio volta
         ao padrão (último diário publicado). Vale no orçamento e na ficha. */
      if (e.target.matches("[data-crono-corte]")) {
        var obC = e.target.getAttribute("data-crono-corte"), vC = String(e.target.value || "").trim();
        if (!obC) return;
        this._cronoCorte = (this._cronoCorte && typeof this._cronoCorte === "object") ? this._cronoCorte : {};
        if (/^\d{4}-\d{2}-\d{2}$/.test(vC)) this._cronoCorte[obC] = vC; else delete this._cronoCorte[obC];
        this._cronoRepintar(); return;
      }
      // editar duração de etapa no cronograma
      // ⚠ grava pelo ALVO ÚNICO (_cronoAlvo), nunca direto em orcAtual.cronograma: ver o comentário de _cronoAlvo
      if (e.target.matches("[data-cron-dur]")) {
        var alvoD = this._cronoAlvo(); if (!alvoD) return;
        if (alvoD.travado) { this._cronoTravado(alvoD); return; }
        /* ⚠ modo executivo: a etapa com subetapas dura o VÃO delas — o número
           digitado aqui seria regravado no próximo salvar (a pessoa veria 10 e
           o PDF sairia com 14). A tela já deixa só leitura; isto é a trava na
           função, para o campo que escapar (teclado, versão velha da tela). */
        /* ⚠ a trava vale só onde o VÃO manda (nó com fonte "subetapas", a mesma
           conta do motor): a etapa cujas subetapas são todas marco não tem vão,
           o motor usa o que se digita nela — travá-la era trava sem porta com
           recado falso ("é o vão das subetapas (4 dias)"). */
        var bloqD = null;
        if (typeof CronoExecUI !== "undefined" && typeof Cronograma !== "undefined" && alvoD.cron.exec && alvoD.cron.exec.rede === true) {
          try { bloqD = CronoExecUI.motivoEtapaTravada(alvoD.cron, Cronograma.estimar(alvoD.orc, null, { eap: true }).atividades, e.target.dataset.cronDur); } catch (eB) { bloqD = null; }
        }
        if (bloqD) { UI.toast(bloqD, "erro"); this.render(); return; }
        var cD = alvoD.cron;
        /* ⚠ mapa que voltou da sincronização como LISTA ([]): a chave posta
           nele some no JSON do salvar — a duração digitada não chegava ao disco
           (a mesma régua do obj() do Refinar com IA) */
        function objD(m) { return (m && typeof m === "object" && !Array.isArray(m)) ? m : {}; }
        cD.duracoes = objD(cD.duracoes);
        var idDur = e.target.dataset.cronDur, durDig = parseInt(Util.num(e.target.value), 10);
        // "0" digitado pela PESSOA = marco (entrega, vistoria). Vai para `marcos`,
        // nunca para `duracoes`: lá o 0 já significa "não estimável" e o motor o ignora.
        cD.marcos = objD(cD.marcos);
        if (String(e.target.value).trim() === "0") { cD.marcos[idDur] = true; delete cD.duracoes[idDur]; }
        else { delete cD.marcos[idDur]; cD.duracoes[idDur] = Math.max(1, durDig || 1); }
        if (cD.duracoesAgente) delete cD.duracoesAgente[idDur]; // virou edição do USUÁRIO
        if (cD.iaMotivos) delete cD.iaMotivos[idDur]; // remove justificativa IA órfã
        alvoD.salvar(); this.render(); return;
      }
      // editar "Depende de" no cronograma (rede de precedência do Gantt / caminho crítico)
      if (e.target.matches("[data-cron-pred]")) {
        var alvoP = this._cronoAlvo(); if (!alvoP || typeof Cronograma === "undefined") return;
        if (alvoP.travado) { this._cronoTravado(alvoP); return; }
        var cP = alvoP.cron;
        var idPred = e.target.dataset.cronPred;
        var ordemIds = (alvoP.orc.etapas || []).map(function (et) { return et.id; });
        var pr = Cronograma.parsePreds(e.target.value, ordemIds, idPred);
        if (pr.invalidos.length) UI.toast("“" + pr.invalidos.join(", ") + "” não é etapa válida em “Depende de” — use o nº da linha (1 a " + ordemIds.length + "), sem apontar para a própria etapa. Espera: 1+7 · avanço: 1-3.", "erro");
        if (pr.preds !== null) {
          cP.predecessoras = cP.predecessoras || {};
          cP.predecessoras[idPred] = pr.preds;
          // lag por elo vive em mapa próprio (a lista de ids fica legível para a versão anterior do app)
          cP.lags = cP.lags || {};
          if (Object.keys(pr.lags).length) cP.lags[idPred] = pr.lags; else delete cP.lags[idPred];
        } else if (!pr.invalidos.length && cP.predecessoras) {
          delete cP.predecessoras[idPred]; // vazio = volta ao padrão (depende da anterior)
          if (cP.lags) delete cP.lags[idPred];
        }
        // ⚠ só inválidos: não grava nada — erro de digitação não muda o cronograma em silêncio; o render devolve o valor anterior
        alvoP.salvar(); this.render(); return;
      }
      // preço de insumo NÃO COLETADO informado pelo usuário (detalhamento) —
      // salva por empresa e re-renderiza o modal para a soma/aviso atualizarem
      // v1.1.123 — coeficiente/preço editados no criador: atualiza a prévia
      // IN-PLACE (re-render total destruía o botão sob o mouse e engolia o clique)
      if (e.target.matches("input[data-cp-coef]") && this._cp) {
        var idxCoef = parseInt(e.target.dataset.cpCoef, 10);
        if (this._cp.comp.insumos[idxCoef]) {
          this._cp.comp.insumos[idxCoef].coeficiente = Util.num(e.target.value);
          this._cpAtualizarPrevia(idxCoef);
        }
        return;
      }
      // preço informado p/ insumo sem coleta (criador, passo 2): vale na composição
      // E fica salvo p/ a empresa (mesma cotação do modal de detalhamento)
      if (e.target.matches("input[data-cp-preco]") && this._cp) {
        var idxPre = parseInt(e.target.dataset.cpPreco, 10);
        var insPre = this._cp.comp.insumos[idxPre];
        if (insPre) {
          var vPre = Util.num(e.target.value);
          insPre.custoUnitario = vPre;
          if (vPre > 0 && insPre.codigo && Store.salvarPrecoInsumo) {
            Store.salvarPrecoInsumo(Auth.empresaId(), String(insPre.codigo), vPre);
            UI.toast("Cotação de " + insPre.codigo + " salva (" + Util.fmtMoeda(vPre) + ") — vale em toda composição que usa este insumo.", "ok");
          }
          this._cpAtualizarPrevia(idxPre);
        }
        return;
      }
      /* coeficiente ajustado dentro da composição de um item do orçamento */
      if (e.target.matches("input[data-coef-aj]")) {
        this._ajustarCoeficiente(e.target.dataset.coefAj, e.target.value);
        return;
      }
      if (e.target.matches("input[data-preco-insumo]")) {
        var codIns = e.target.dataset.precoInsumo;
        var precoIns = Util.num(e.target.value);
        Store.salvarPrecoInsumo(Auth.empresaId(), codIns, precoIns);
        UI.toast(precoIns > 0
          ? "Preço de " + codIns + " salvo (" + Util.fmtMoeda(precoIns) + ") — vale em toda composição que usa este insumo."
          : "Preço de " + codIns + " removido — o insumo voltou a pendente.", precoIns > 0 ? "ok" : "erro");
        // re-render do modal aberto (mantém a composição na tela)
        var compAberta = (document.querySelector("#modal-bg header h2") || {}).textContent || "";
        // "Composição própria PROP-XXXX" também: pula o adjetivo p/ capturar o código
        var mCod = compAberta.match(/Composição(?:\s+própria)?\s+(\S+)/);
        if (mCod && typeof Analitico !== "undefined" && Analitico.obter) {
          var aRe = Analitico.obter(mCod[1]);
          if (aRe) {
            var corpoRe = document.querySelector("#modal-bg .modal .body");
            if (corpoRe) corpoRe.innerHTML = UI.renderInsumos(aRe, this._baseUf || Sinapi.uf || null);
          }
        }
        // os avisos "insumo sem preço" da planilha ATRÁS do modal atualizam na
        // hora (senão o usuário fecha o modal e o aviso obsoleto fica na tela)
        if (UI._refreshAvisosInsumo) UI._refreshAvisosInsumo();
        return;
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
      /* ⚠ NÃO passa pelo _cronoAlvo, de propósito: `cronogramaMeses` é o nº de
         colunas do DESEMBOLSO DA PROPOSTA (campo do orçamento, não de
         orc.cronograma). Quando o alvo virar o plano de execução da obra
         (orçamento aprovado), o desembolso impresso na proposta aprovada não
         pode andar junto — ele continua travado com o aprovado. */
      if (e.target.id === "cron-meses") {
        var n = parseInt(Util.num(e.target.value), 10);
        if (n >= 1 && n <= 60) { this.orcAtual.cronogramaMeses = n; this.orcAtual.cronogramaMesesManual = true; this.persistir(); this.render(); }
      }
      // selects da Gestão que disparam ação ao mudar (ex.: trocar obra no Previsto×Realizado)
      if (e.target.matches && e.target.matches("[data-gacao]") && e.target.tagName === "SELECT") {
        if (typeof Gestao !== "undefined") Gestao.acao(e.target.dataset.gacao, { value: e.target.value }, this);
      }
    },

    _refreshConfianca: function (i) {
      var l = this._escopo[i];
      var cell = document.querySelector('[data-esc-conf="' + i + '"]');
      if (!cell) return;
      if (l.escolhido > -1 && l.candidatos[l.escolhido]) {
        var c = l.candidatos[l.escolhido], n = Escopo.nivel(c.confianca);
        // LOTE 3: cast numérico defensivo (confianca vem do scoring, mas innerHTML não perdoa)
        cell.innerHTML = '<span class="pill" style="background:var(--' + n.cor + ');color:#fff">' + n.rotulo + ' ' + (Util.num(c.confianca) || 0) + '%</span>';
      } else {
        cell.innerHTML = '<span class="pill proprio">Pendente</span>';
      }
    },

    // ---------- Login ----------
    // Link de acesso do funcionário (?lic=<chave>&u=<login>): ativa a licença da empresa
    // neste aparelho e sugere o login — quem recebeu só digita a própria senha.
    _processarLinkAcesso: function () {
      var self = this;
      try {
        var q = new URLSearchParams(location.search || "");
        var lic = String(q.get("lic") || "").trim(), u = String(q.get("u") || "").trim();
        if (!lic && !u) return;
        if (u) { try { localStorage.setItem("orcapro:login-sugerido", u); } catch (e) {} }
        try { history.replaceState(null, "", location.pathname); } catch (e) {} // chave fora da barra/histórico
        if (!lic || typeof Licenca === "undefined") return;
        var st = Licenca.status();
        if (Licenca.chave() === lic && st && st.ativo && !st.trial) return; // já ativada com esta chave
        /* ⚠⚠ TROCAR A LICENÇA DE UM APARELHO JÁ LICENCIADO NÃO PODE SER SILENCIOSO.
         *
         * Isto causou o incidente de 27/08/2026, e o estrago passou longe de
         * "ativou errado". A conta da nuvem é derivada da CHAVE (js/nuvem.js,
         * `_credLicenca`): trocar a chave muda o aparelho de EMPRESA na nuvem.
         * Como o `empresaId` local não muda junto, o aparelho leva a base que
         * já tinha para o tenant novo e traz a de lá para cá — as duas empresas
         * passam a ver obras, usuários, foto do dono e conta uma da outra.
         *
         * E o link que faz isso é gerado pelo PRÓPRIO app com a chave de quem
         * gera: ao cadastrar um usuário (js/gestao.js) e no QR de "usar no
         * celular". Basta esse link ser aberto no aparelho de outra empresa —
         * WhatsApp, e-mail, sessão remota — e a troca acontecia sem uma palavra,
         * com a chave apagada da barra de endereço na linha acima.
         *
         * Aparelho SEM licença ativa continua ativando direto: ali não há o que
         * misturar, e é o caso legítimo do funcionário que acabou de receber o
         * link. Aparelho JÁ licenciado agora pergunta, dizendo o que está em jogo. */
        if (st && st.ativo && !st.trial && Licenca.chave() && Licenca.chave() !== lic) {
          var deQuem = st.email ? " (" + st.email + ")" : "";
          var texto = "Este aparelho já está licenciado" + deQuem + ".\n\n"
            + "O link que você abriu pertence a OUTRA licença. Trocar agora muda a empresa deste "
            + "aparelho na nuvem: os dados daqui passam a se misturar com os da outra empresa — "
            + "obras, usuários e configurações dos dois lados.\n\n"
            + "Só continue se este aparelho realmente mudou de empresa.\n\nTrocar a licença?";
          var segue = false;
          try { segue = window.confirm(texto); } catch (eC) { segue = false; }
          if (!segue) {
            if (typeof UI !== "undefined") UI.toast("Licença deste aparelho mantida. Nada foi alterado.", "ok");
            return;
          }
        }
        this._ativandoPorLink = true; // segura o gate do trial enquanto a ativação roda
        Licenca.ativarOnline(lic, function (r) {
          self._ativandoPorLink = false;
          if (r && r.ok) {
            if (typeof UI !== "undefined") UI.toast("" + (typeof Icones !== "undefined" ? Icones.get("check", 15) : "") + " Licença da empresa ativada neste aparelho! Entre com o seu usuário e senha.", "ok");
            try { if (typeof Telemetria !== "undefined") Telemetria.iniciar(); } catch (e2) {}
            try { self._conectarNuvemLicenca(); } catch (e) {}
            self.render();
          } else if (typeof UI !== "undefined") {
            UI.toast("Não deu pra ativar por este link: " + ((r && r.erro) || "erro de conexão") + ". Tente com internet ou fale com o administrador.", "erro");
            self.render(); // volta ao fluxo normal (trial) sem travar
          }
        });
      } catch (e) {}
    },
    /* ---------- SINCRONIZAÇÃO AUTOMÁTICA ----------
     * Ninguém deve precisar achar um menu e clicar num botão para os dados irem
     * de um aparelho ao outro. O cliente entra com o e-mail e a senha dele e
     * pronto — é assim que sistema se comporta.
     *
     * O que existia aqui tentava UMA vez, no boot, e desistia calado:
     *     .catch(function () {})
     * Se a internet estivesse lenta naquele segundo — ou o Firebase demorasse a
     * responder — o cliente passava a sessão inteira sem sincronizar e SEM SABER.
     * Depois chegava no suporte como "sumiram meus dados" ou "o celular não traz
     * nada". Não sumia nada: só nunca tinha subido.
     *
     * Agora insiste sozinho: repete com espera crescente e volta a tentar assim
     * que a internet retorna. A única coisa que o impede é o desligamento pedido
     * pelo usuário — esse não é burocracia, é revogação de consentimento (LGPD),
     * e religar continua a um clique.
     */
    _nuvemTentativa: 0,
    _nuvemTimer: null,
    _nuvemGatilhoRede: false,

    _conectarNuvemLicenca: function () {
      var self = this;
      try {
        clearTimeout(this._nuvemTimer);

        var st = (typeof Licenca !== "undefined" && Licenca.status) ? Licenca.status() : null;
        if (!st || !st.ativo || st.trial) return;                        // sem licença não há conta de nuvem
        if (typeof Nuvem === "undefined" || !Nuvem.disponivel()) return;
        if (Nuvem.desligadaPeloUsuario && Nuvem.desligadaPeloUsuario()) return;
        /* v1.1.232 — SEM USUÁRIO LOGADO, NÃO CONECTA. A licença é do aparelho
           e sobrevive ao logout; o gatilho de 'online' disparava isto na tela
           de login e o empresaId() sem sessão caía em 'default' — a nuvem
           inteira sincronizava no namespace errado. */
        if (typeof Auth !== "undefined" && Auth.usuario && !Auth.usuario()) return;
        var chave = Licenca.chave(); if (!chave) return;
        var eid = Auth.empresaId();
        /* escuta presa noutro tenant (login trocado sem recarregar): re-escuta */
        if (typeof Nuvem !== "undefined" && Nuvem._escutando && Nuvem._escutando !== eid && Nuvem._un && Nuvem._un.length) {
          try { Nuvem._un.forEach(function (u) { u(); }); Nuvem._un = []; Nuvem._escutando = null; } catch (eUn) {}
        }

        /* A internet voltando é o melhor momento para tentar de novo — instalado
         * uma única vez, e não a cada chamada (senão empilharia gatilhos). */
        if (!this._nuvemGatilhoRede && global.addEventListener) {
          this._nuvemGatilhoRede = true;
          global.addEventListener("online", function () {
            self._nuvemTentativa = 0;                 // a rede mudou: recomeça rápido
            try { self._conectarNuvemLicenca(); } catch (e) {}
          });
        }

        /* ⚠ "já conectado" SÓ VALE SE A SESSÃO FOR DESTA CHAVE. Depois de um
           bloqueio (ou de trocar a licença do aparelho), o `currentUser` continua
           apontando para o tenant ERRADO, e sair aqui pulava a reautenticação: o
           cliente ativava a licença certa, como o próprio aviso mandava, e seguia
           bloqueado pelo resto da sessão sem nada dizer que faltava reabrir. */
        if (Nuvem.ligado && Nuvem.auth && Nuvem.auth.currentUser) {
          if (Nuvem.sessaoConfereComChave && Nuvem.sessaoConfereComChave(chave)) { this._nuvemTentativa = 0; return; }
          try { Nuvem.trocouDeLicenca(); } catch (eT) {}   // sessão de outra licença: refaz
        }

        Nuvem.entrarPorLicenca(chave)
          .then(function () { return Nuvem.sincronizar(eid); })
          .then(function () { if (window.Blocos) Blocos.usarOverrides(eid); try { self._propriaDaNuvem(); } catch (e) {} })
          .then(function () {
            self._nuvemTentativa = 0;
            try { Nuvem.escutar(eid, function (ent) {
              if (ent === "pesos_bloco" && window.Blocos) Blocos.usarOverrides(eid);
              if (typeof PropriaSync !== "undefined" && (ent === PropriaSync.ENTIDADE || ent === "_lapides")) self._propriaDaNuvem();
              /* v1.1.232 — o EDITOR reage à exclusão vinda do outro aparelho.
                 Antes só a lista re-renderizava: quem estivesse com o orçamento
                 excluído ABERTO continuava editando um fantasma, e o próximo
                 persistir() o regravava — ressuscitando em todos os aparelhos
                 o que o outro usuário tinha acabado de apagar. */
              if ((ent === "orcamentos" || ent === "_lapides") && self.orcAtual && self.tela === "editor") {
                var aindaExiste = !!Store.obterOrcamento(eid, self.orcAtual.id);
                if (!aindaExiste) {
                  var numExc = self.orcAtual.numero || "";
                  self.orcAtual = null; self.tela = "lista"; self.render();
                  UI.toast("O orçamento " + numExc + " foi excluído em outro aparelho — o editor foi fechado. Se precisar dele de volta, restaure do backup.", "erro");
                  return;
                }
              }
              if (self.tela === "lista") self.render();
            }); } catch (e) {}
            // aparelho secundário (o tenant já tem admin, mas aqui a sessão é anônima) → exige login
            if (Auth.precisaLoginNuvem && Auth.precisaLoginNuvem()) { Auth.logout(); self.tela = "login"; self.render(); return; }
            if (self.tela === "lista") self.render(); // equipe/dados sincronizados
          })
          .catch(function () {
            /* Offline-first: o trabalho continua no aparelho. Mas a tentativa não
             * morre aqui — reagenda com espera crescente até 5 min. Sem teto de
             * tentativas: o cliente pode ficar o dia todo sem sinal na obra e,
             * quando o sinal voltar, tem de subir sozinho. */
            self._nuvemTentativa++;
            var esperas = [3000, 8000, 20000, 60000, 300000];
            var ms = esperas[Math.min(self._nuvemTentativa - 1, esperas.length - 1)];
            self._nuvemTimer = setTimeout(function () { try { self._conectarNuvemLicenca(); } catch (e) {} }, ms);
          });
      } catch (e) {}
    },
    _trocaSenhaPrimeiroAcesso: function () {
      var self = this;
      /* Dois motivos chegam aqui, e o texto tem de dizer qual. Chamar de
         "primeiro acesso" quem já usa o sistema há meses faz a pessoa achar que
         é engano e procurar suporte — ou pior, desconfiar do update. */
      var motivo = (typeof Auth.motivoTrocaSenha === "function") ? Auth.motivoTrocaSenha() : "primeiro";
      var seg = motivo === "seguranca";
      var titulo = seg ? "Crie uma nova senha" : "Primeiro acesso — crie sua senha";
      var texto = seg
        ? 'Melhoramos a proteção das senhas do sistema. Para concluir, <b>defina uma senha nova</b> — a anterior deixa de valer.'
        : 'Este é o seu <b>primeiro acesso</b>. Defina uma senha só sua para continuar.';
      var corpo = '<p class="muted" style="margin:0 0 12px">' + texto + '</p>' +
        '<div class="field"><label>Nova senha *</label><input id="ts-s1" type="password" placeholder="mínimo 4 caracteres" autocomplete="new-password"></div>' +
        '<div class="field"><label>Repita a nova senha *</label><input id="ts-s2" type="password" placeholder="repita" autocomplete="new-password"></div>';
      UI.modal("" + (typeof Icones !== "undefined" ? Icones.get("cadeado", 15) : "") + " " + titulo, corpo, [
        { texto: "Salvar e continuar", classe: "primary", onClick: function () {
          var s1 = (UI.el("ts-s1") || {}).value || "", s2 = (UI.el("ts-s2") || {}).value || "";
          if (s1.length < 4) { UI.toast("A senha precisa de ao menos 4 caracteres.", "erro"); return; }
          if (s1 !== s2) { UI.toast("As senhas não conferem.", "erro"); return; }
          var r = Auth.trocarMinhaSenha(s1);
          if (!r.ok) { UI.toast(r.erro || "Não foi possível trocar a senha.", "erro"); return; }
          UI.fecharModal(); UI.toast("Senha definida! Bom trabalho.", "ok"); self.render();
        } }
      ]);
    },
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
        /* ⚠ APARELHO QUE JÁ É DE UMA EMPRESA NÃO CRIA DONO NOVO.
           `existeEmail`/`existeLoginEquipe` só enxergam contas registradas
           LOCALMENTE (`orcapro:usuarios`). No aparelho do funcionário essa
           lista é vazia, então um login de equipe que falhasse caía aqui e o
           app RESPONDIA CRIANDO UMA CONTA DE DONO — papel admin — para quem
           acabou de errar a senha. O "criar no 1º acesso" existe para quem
           abre o app pela primeira vez no próprio aparelho, não para quem
           bateu na porta de uma empresa que já mora aqui.
           Achado na auditoria de permissão de 15/08/2026, mesma família da
           v1.1.240. */
        var _temEmpresa = false;
        try {
          _temEmpresa = !!((Auth._temEquipeLocal && Auth._temEquipeLocal()) ||
                           (Auth.contaMestre && Auth.contaMestre()));
        } catch (eE) {}
        if (_temEmpresa) {
          UI.toast("Usuário ou senha inválidos. Se você é da equipe, confira com o administrador da conta.", "erro");
          return;
        }
        // e-mail novo, aparelho sem empresa → cria conta (1º acesso de verdade)
        r = Auth.registrar(empresa, email, senha);
        if (!r.ok) { UI.toast(r.erro, "erro"); return; }
        UI.toast("Conta criada. Bem-vindo!", "ok");
      } else {
        UI.toast("Bem-vindo de volta!", "ok");
      }
      this.tela = "lista";
      this.render();
      // 1º acesso de sub-usuário: obriga a definir a própria senha antes de operar
      if (typeof Auth.precisaTrocarSenha === "function" && Auth.precisaTrocarSenha()) { this._trocaSenhaPrimeiroAcesso(); }
      // recarrega a base SINAPI específica desta empresa (se importou uma própria)
      var self = this;
      this.carregarBaseSinapi().then(function () { if (self.tela === "lista") self.render(); });
      /* SINCRONIZAÇÃO APÓS O LOGIN — sem senha nenhuma a mais.
       *
       * O cliente licenciado sincroniza pela LICENÇA: a conta da nuvem é derivada
       * da chave, então qualquer aparelho com a mesma licença chega na mesma
       * conta sozinho. Ele digita o e-mail e a senha DELE, do sistema, e acabou.
       *
       * O que havia aqui era o oposto: tentava entrar na nuvem com a senha do
       * sistema como se fosse senha de nuvem e, quando não batia, mandava um
       * aviso do tipo "vá no menu da conta e conecte com a senha certa" — uma
       * senha que a maioria nem sabia que existia. Era fábrica de chamado. Pior:
       * se batesse, entrava numa conta Firebase DIFERENTE da conta da licença e
       * os dados do cliente ficavam divididos entre duas contas.
       *
       * Agora, com licença ativa, o login apenas chama o mesmo caminho do boot —
       * que já tenta de novo sozinho quando falha e quando a internet volta. */
      var _licL = null;
      try { _licL = (typeof Licenca !== "undefined" && Licenca.status) ? Licenca.status() : null; } catch (eL) {}
      var _licenciadoL = !!(_licL && _licL.ativo && !_licL.trial && Licenca.chave && Licenca.chave());

      if (typeof Nuvem !== "undefined" && Nuvem.disponivel() &&
          !(Nuvem.desligadaPeloUsuario && Nuvem.desligadaPeloUsuario())) {
        if (_licenciadoL) {
          this._nuvemTentativa = 0;                    // login é um bom momento p/ recomeçar rápido
          try { this._conectarNuvemLicenca(); } catch (eC) {}
        } else if (!Nuvem.ligado) {
          /* Sem licença não existe conta derivada. Sobra o caminho antigo por
             e-mail/senha, mantido para quem já o usava — e ele continua avisando
             quando falha, porque aí não há retentativa automática que resolva. */
          var eid = Auth.empresaId();
          Nuvem.entrar(email, senha)
            .then(function () { return Nuvem.sincronizar(eid); })
            .then(function () { if (window.Blocos) Blocos.usarOverrides(eid); try { self._propriaDaNuvem(); } catch (e) {} })
            .then(function () {
              Nuvem.escutar(eid, function (ent) { if (ent === "pesos_bloco" && window.Blocos) Blocos.usarOverrides(eid); if (typeof PropriaSync !== "undefined" && (ent === PropriaSync.ENTIDADE || ent === "_lapides")) self._propriaDaNuvem(); if (self.tela === "lista") self.render(); });
              if (self.tela === "lista") self.render();
              UI.toast("" + (typeof Icones !== "undefined" ? Icones.get("nuvem", 15) : "") + " Dados sincronizados na nuvem.", "ok");
            })
            .catch(function (e) {
              console.warn("[nuvem] " + (e && (e.code || e.message)));
              var code = e && e.code;
              if (code === "auth/network-request-failed") {
                UI.toast("" + (typeof Icones !== "undefined" ? Icones.get("nuvem", 15) : "") + " Sem internet agora — seus dados ficam neste aparelho e sobem quando a conexão voltar.", "erro");
              } else if (code !== "auth/wrong-password") {
                UI.toast("" + (typeof Icones !== "undefined" ? Icones.get("nuvem", 15) : "") + " Nuvem não conectada (" + (code || (e && e.message) || "erro") + ").", "erro");
              }
            });
        }
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
      /* ⚠ NÃO entra direto. Redefinir senha não é autenticar — era exatamente
         por entrar direto que qualquer um virava admin digitando o e-mail do
         dono. Redefiniu, entra pelo login com a senha nova. */
      UI.toast("Senha redefinida. Entre com a senha nova.", "ok");
      this.tela = "login"; this.render();
    },

    // URLs do analítico da UF ativa: {local} no disco + {live} no VPS (fallback garantido).
    // O analítico de TODA UF fica hospedado em CONFIG.licencaServer/analitico/ — assim o
    // detalhamento nunca some por falta do arquivo local (instalação antiga, disco, competência).
    /* ===== O ANALÍTICO TEM COMPETÊNCIA — e o nome dele passou a dizer qual =====
     *
     * Era UM por UF, `sinapi-<UF>-analitico.json`, sobrescrito a cada
     * atualização. Como a atualização NÃO apaga o sintético anterior, a
     * instalação acumulava PREÇO de vários meses e UM analítico só — o do mês
     * instalado. Reabrir orçamento antigo (que troca a base de preço para a
     * competência que o documento declara) usava preço de um mês com insumo de
     * outro, calado. E o analítico é a fonte oficial de custo de ~2.000 insumos
     * por UF: reparte MO/MAT/EQ e alimenta composição própria.
     *
     * Agora o nome carrega a competência. O antigo continua valendo como o
     * analítico do mês EMBARCADO — e só dele: instalação que ainda não recebeu
     * pacote completo tem só o nome velho (o zip de ATUALIZAÇÃO não leva data/). */
    /* ===== REGIME NO NOME, espelhando o sintético =====
     * O irmão sintético já grava `sinapi-<UF>-<COMP>-desonerada.json` (sufixo
     * só no regime NÃO padrão, para o arquivo sem sufixo continuar sendo o
     * onerado que o pacote distribui). O analítico segue a mesma regra:
     *   onerado    sinapi-PA-2026-06-analitico.json
     *   desonerado sinapi-PA-2026-06-desonerada-analitico.json
     * `deso` ausente/false = o de sempre — nenhum caminho antigo muda. */
    _nomeAnalitico: function (uf, comp, deso) {
      uf = String(uf || "").toUpperCase();
      /* ⚠ NORMALIZA. A base própria importada guarda o que a pessoa digitou no
         campo de competência, sem validação — e "06/2026" viraria
         `sinapi-MG-06/2026-analitico.json`: uma BARRA no meio do nome do
         arquivo. Local dá 404 numa pasta que não existe, e o servidor recusa
         com 400 (ele corta a rota no último `/`). Não perde dado, mas gasta
         quatro requisições à toa e faz o arquivo local perder a preferência. */
      comp = this._normComp(comp);
      if (!uf) return null;
      var reg = deso ? "-desonerada" : "";
      return comp ? ("sinapi-" + uf + "-" + comp + reg + "-analitico.json")
        : ("sinapi-" + uf + reg + "-analitico.json");
    },

    /* ===== O ESPELHO PÚBLICO — a última alternativa, nos dois regimes =====
     *
     * O analítico é dado OFICIAL e ESTÁTICO: os mesmos arquivos que o app web
     * serve em `data/` servem a instalação. Quando o VPS ainda não recebeu uma
     * competência (ou um regime inteiro, como aconteceu com o desonerado, que
     * nunca existiu lá), a instalação ficava sem detalhamento nenhum, esperando
     * alguém lembrar de subir arquivo — o mesmo tipo de passo manual que já
     * congelou o `latest.json` por 14 versões.
     *
     * Entra SEMPRE POR ÚLTIMO: local primeiro (instantâneo), servidor depois
     * (é ele que tem a competência nova), e só então o espelho. Ou seja, não
     * troca nada que já funciona — só cobre o buraco.
     *
     * ⚠ NÃO ATRAVESSA REGIME: o nome é montado com o mesmo `deso` do resto da
     *   lista. Um espelho que servisse o outro regime desfaria a trava inteira.
     * ⚠ NÃO é fonte de PREÇO. Só do desdobramento em insumos: preço continua
     *   vindo da base que a pessoa instalou. */
    _espelhoAnalitico: function (uf, comp, deso) {
      var base = "";
      try { base = String((typeof CONFIG !== "undefined" && CONFIG.appWebUrl) || "").replace(/\/$/, ""); } catch (e) {}
      if (!base || !uf) return null;
      return base + "/data/" + this._nomeAnalitico(uf, comp, deso);
    },

    /* ===== QUAL REGIME O DETALHAMENTO DEVE TER =====
     *
     * O do ORÇAMENTO ABERTO, quando há um: é o documento que declara em que
     * regime os preços foram tomados (Lei 14.133 exige dizer). Sem orçamento
     * aberto, o da base SINAPI principal — que é sempre a não desonerada.
     *
     * ⚠ ORÇAMENTO MISTO fica no regime da base principal DE PROPÓSITO: não
     *   existe UM analítico certo para ele, e escolher um faria metade dos
     *   itens abrirem com encargo trocado. Quem protege esse caso é a guarda
     *   item a item do `verInsumos`, que recusa o que não bate. */
    _regimeAnalitico: function () {
      try {
        if (this.orcAtual && typeof Orcamento !== "undefined" && Orcamento.regimeDosItens) {
          var r = Orcamento.regimeDosItens(this.orcAtual);
          if (r === true) return true;
          if (r === false) return false;
          /* "misto" e null caem no padrão: é a base que todo mundo tem */
        }
      } catch (e) {}
      return false;
    },
    /* ===== TROCOU O REGIME? DESCARTA O ANALÍTICO ANTES DE PEDIR O PRÓXIMO =====
     *
     * Duas telas (composição própria e o detalhamento em lote) só carregam
     * quando `!carregado`, e conferem apenas a UF. Abrir um orçamento
     * desonerado depois de um onerado deixaria `carregado: true` e a mesma UF
     * — elas pulariam a carga e serviriam o analítico do regime anterior, que
     * é o defeito exato que esta versão conserta.
     *
     * Quem VAI CARREGAR chama isto; `_analiticoUrls` continua pura, para quem
     * só quer ler os caminhos (o Portal, por exemplo) não jogar fora 18 MB já
     * carregados de graça. */
    /* ⚠ `ufOpt`/`compOpt` REPASSADOS: sem eles este helper zerava o regime
       certo mas pedia o analítico do AMBIENTE, e voltava o defeito de exportar
       um orçamento de MG com os insumos de PA. Regime e UF são duas perguntas
       diferentes, e as duas têm de valer. */
    _prepararAnalitico: function (ufOpt, compOpt, regimeForcado) {
      try {
        /* regimeForcado (boolean) = o regime do ITEM que o usuário clicou, que
           vence o regime dominante do orçamento. É o que faz o detalhamento
           abrir nos DOIS regimes num orçamento misto: cada clique carrega o
           analítico daquele item, não o do regime da maioria. */
        var deso = (regimeForcado === true || regimeForcado === false)
          ? regimeForcado : this._regimeAnalitico();
        if (typeof Analitico !== "undefined" && Analitico.regimeAlvo !== deso) {
          if (Analitico.carregado || Analitico.carregando) Analitico.reset();
          Analitico.regimeAlvo = deso;
        }
      } catch (e) {}
      return this._analiticoUrls(ufOpt, compOpt, regimeForcado);
    },
    /* `ufOpt`/`compOpt` (v1.2.31): pedir o analítico de OUTRA base que não a do
     * ambiente. Quem exporta o Excel de um orçamento de MG com o ambiente em PA
     * precisa do analítico de MG — o ambiente pode divergir de propósito ("troquei
     * de estado para consultar outro preço", diz a própria tela do editor).
     * Sem argumento, é o de sempre: a base ativa. */
    _analiticoUrls: function (ufOpt, compOpt, regimeForcado) {
      var ufAmb = String(this._baseUf || (typeof Sinapi !== "undefined" ? Sinapi.uf : "") || "").toUpperCase();
      var uf = String(ufOpt || ufAmb || "").toUpperCase();
      var comp = "";
      if (compOpt) comp = String(compOpt).trim();
      else if (uf === ufAmb) { try { comp = String((typeof Sinapi !== "undefined" && Sinapi.competencia) || "").trim(); } catch (e) {} }
      /* o arquivo que o boot escolheu é da UF do AMBIENTE; para outra UF ele
         seria o estado errado com nome de plano B */
      var arqBoot = (uf === ufAmb) ? this._analiticoArquivo : null;
      var srv = (typeof CONFIG !== "undefined" && CONFIG.licencaServer) ? String(CONFIG.licencaServer).replace(/\/$/, "") : "";
      /* ⚠⚠ A COMPETÊNCIA VEM PRIMEIRO — e `_analiticoArquivo` DEPOIS, não antes.
       *
       * Este campo é fixado em CINCO lugares do boot, quase todos com o nome
       * antigo (`data/sinapi-<UF>-analitico.json`). Como a linha começava com
       * `this._analiticoArquivo || ...`, ele vencia sempre e o nome por
       * competência nunca era usado: a mudança toda ficava inerte, do mesmo
       * jeito que o campo `prefs.empresa` que ninguém gravava.
       *
       * Agora ele entra como ALTERNATIVA, depois do nome com competência e
       * antes do nome antigo — preservando inteiro o que o boot decidiu
       * (inclusive o desvio para o servidor quando a base é mais nova que a
       * embarcada), só que como plano B. */
      /* ===== REGIME: LISTA SEPARADA, SEM PONTE ENTRE OS DOIS =====
       *
       * ⚠ A LISTA DE ALTERNATIVAS NÃO PODE ATRAVESSAR REGIME. Toda a engenharia
       *   abaixo existe para nunca ficar sem detalhamento — e é exatamente ela
       *   que, no desonerado, entregaria o analítico ONERADO como "plano B".
       *   Ficar sem o desdobramento é um aborrecimento; mostrar o do regime
       *   errado é um número errado na memória de cálculo, e ninguém vê.
       *
       * Por isso o desonerado sai por aqui, com a sua própria lista curta:
       * competência primeiro, nome sem competência depois, local antes da rede.
       * `_analiticoArquivo` NÃO entra — ele é o caminho que o boot escolheu
       * para a base principal, que é sempre a não desonerada. */
      var deso = (regimeForcado === true || regimeForcado === false) ? regimeForcado : this._regimeAnalitico();
      if (deso) {
        var dLocal = uf ? ("data/" + this._nomeAnalitico(uf, comp, true)) : null;
        var dLive = (uf && srv) ? (srv + "/analitico/" + this._nomeAnalitico(uf, comp, true)) : null;
        var dAlt = [];
        if (dLocal) dAlt.push(dLocal);
        if (uf) dAlt.push("data/" + this._nomeAnalitico(uf, "", true));
        if (dLive) dAlt.push(dLive);
        if (uf && srv) dAlt.push(srv + "/analitico/" + this._nomeAnalitico(uf, "", true));
        var dEsp = this._espelhoAnalitico(uf, "", true);
        if (dEsp) dAlt.push(dEsp);
        return { local: dLocal, live: dLive, alts: dAlt, desonerado: true,
          localAlt: dAlt[0] || null, liveAlt: dAlt[dAlt.length - 1] || null };
      }
      var local = uf ? ("data/" + this._nomeAnalitico(uf, comp)) : null;
      var live = (uf && srv) ? (srv + "/analitico/" + this._nomeAnalitico(uf, comp)) : null;
      var alt = [];
      /* ⚠ O ARQUIVO LOCAL DE NOME ANTIGO VEM ANTES DO SERVIDOR — mas só quando
       * ele é do mês certo.
       *
       * Hoje os 38 clientes têm SO o nome antigo em disco (o zip de atualização
       * não leva `data/`). Sem esta linha, todos eles passariam a buscar o
       * analítico no VPS a cada carga — 18 MB por UF, de graça, trocando um
       * arquivo local instantâneo por rede. O nome antigo pertence à competência
       * EMBARCADA (a do manifesto): quando é dela que se trata, ele é o mesmo
       * arquivo, com outro nome, e vale primeiro.
       *
       * Quando a competência carregada NÃO é a embarcada, ele fica para depois do
       * servidor — ali o servidor tem o mês certo e o local não. */
      var embarcada = "";
      try {
        var estE = (this._estados || []).filter(function (e) { return String(e.uf).toUpperCase() === uf; })[0];
        embarcada = String((estE && estE.competencia) || "").trim();
      } catch (eE) {}
      var legadoLocal = uf ? ("data/" + this._nomeAnalitico(uf, "")) : null;
      var mesmoMes = !!(comp && embarcada && comp === embarcada);
      /* ORDEM FINAL, e ela é a coisa toda:
       *   1. local com a competência   (certo e rápido)
       *   2. local de nome ANTIGO, se for do mesmo mês   (o mesmo arquivo, rápido)
       *   3. o que o boot decidiu       (preserva o desvio para o servidor)
       *   4. servidor com a competência (certo, mas pela rede)
       *   5. local de nome antigo, mês diferente  (último recurso; o aviso cobre)
       *   6. servidor de nome antigo    (último recurso)
       * `alts` é a lista INTEIRA, na ordem — quem carrega passa ela direto. */
      if (local) alt.push(local);
      if (mesmoMes) {
        /* mês igual ao do pacote: o arquivo local de nome antigo É o certo —
           mesmo conteúdo, outro nome. Vem antes da rede. */
        if (legadoLocal) alt.push(legadoLocal);
        if (arqBoot) alt.push(arqBoot);
      }
      if (live) alt.push(live);
      if (!mesmoMes) {
        /* mês diferente: o de nome antigo é de OUTRA competência. Fica depois do
           servidor, que tem o mês certo — e só vale como último recurso, com o
           `_avisarAnaliticoDeOutroMes` dizendo ao usuário o que aconteceu.
           `_analiticoArquivo` desce junto: na maioria dos caminhos do boot ele
           É o nome antigo, e deixá-lo antes faria o mês errado vencer o certo. */
        if (arqBoot) alt.push(arqBoot);
        if (legadoLocal) alt.push(legadoLocal);
      }
      if (uf && srv) alt.push(srv + "/analitico/" + this._nomeAnalitico(uf, ""));
      var esp = this._espelhoAnalitico(uf, "", false);
      if (esp) alt.push(esp);
      /* `local`/`live` continuam existindo porque os chamadores testam
         `if (!urls.local && !urls.live) return;` antes de carregar. */
      return { local: local, live: live, alts: alt, desonerado: false, localAlt: alt[0] || null, liveAlt: alt[alt.length - 1] || null };
    },

    // ---------- Base SINAPI (própria da empresa ou padrão) ----------
    _analiticoArquivo: null,   // caminho do analítico do estado ATIVO (data/sinapi-<UF>-analitico.json)
    _baseUf: null,             // UF da base SINAPI ativa
    _estados: null,            // manifesto data/estados.json: [{uf,arquivo,competencia,analitico}]
    /* ⚠ MAPA SEPARADO, e não entradas a mais em `_estados`.
     * `_estados` alimenta o SELETOR DE UF (js/orcwizard.js): uma entrada por
     * item da lista. Acrescentar uma linha por competência faria "MG" aparecer
     * duas vezes no seletor de estado — regressão à vista num lugar que não
     * tem nada a ver com competência. As competências vivem aqui. */
    _compsPorUf: null,         // { MG: ["2026-06","2026-05"], ... } — mais nova primeiro
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
          // FIX (bug do detalhamento): com base PERSISTIDA este caminho retornava cedo e
          // _analiticoArquivo/_baseUf ficavam null — o "🔍 insumos" dava "não incluído p/ a UF"
          // até o cliente trocar de estado (que aí setava o ponteiro). Aponta o analítico
          // da UF ativa já no boot, pelo manifesto (fallback: padrão de nome do pacote).
          self._baseUf = String(self._baseUf || base.uf || Sinapi.uf || "").toUpperCase() || null;
          // v1.1.122: base persistida pela ATUALIZAÇÃO OFICIAL numa competência mais
          // nova que a do pacote local → o detalhamento vem do VPS (o analítico local
          // é da competência embarcada; senão unitário novo + insumos velhos não fecham)
          if (base._origem === "atualizacao-oficial" && self._baseUf &&
              String(base.mes || "") > String(CONFIG.sinapi.competenciaPadrao || "")) {
            self._analiticoArquivo = CONFIG.licencaServer + "/analitico/sinapi-" + self._baseUf + "-analitico.json";
          }
          if (!self._analiticoArquivo && self._baseUf) {
            var ufA = self._baseUf;
            var reqA = self._ufReq; // token: se o cliente trocar de estado no meio tempo, NÃO regrava
            var setar = function () {
              if (self._analiticoArquivo || self._ufReq !== reqA || self._baseUf !== ufA) return;
              return true;
            };
            self._carregarEstados().then(function (ests) {
              if (!setar()) return;
              var est = (ests || []).filter(function (e) { return String(e.uf).toUpperCase() === ufA; })[0];
              self._analiticoArquivo = (est && est.analitico) || ("data/sinapi-" + ufA + "-analitico.json");
            }).catch(function () {
              if (setar()) self._analiticoArquivo = "data/sinapi-" + ufA + "-analitico.json";
            });
          }
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
      /* ⚠ GUARDA A PROMESSA, não só o resultado. São CINCO lugares que chamam
       * isto, e mais de um pode chamar no mesmo instante (boot + assistente).
       * Guardando só `_estados`, a segunda chamada saia cedo assim que a
       * PRIMEIRA gravasse a lista — antes de a descoberta de competências
       * terminar — e recebia `_compsPorUf` ainda nulo. O seletor abriria com a
       * competência do pacote e só, sem erro nenhum: exatamente o tipo de falha
       * calada que este recurso veio consertar. */
      if (self._promEstados) return self._promEstados;
      if (self._estados && self._compsPorUf) return Promise.resolve(self._estados);
      self._promEstados = fetch("data/estados.json")
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { self._estados = (j && Array.isArray(j.estados)) ? j.estados : []; })
        .catch(function () { self._estados = []; })
        .then(function () { return self._descobrirCompetencias(); })
        .then(function () { return self._estados; });
      return self._promEstados;
    },
    _promEstados: null,        // ver a nota em `_carregarEstados`

    /* ===== TODAS AS COMPETÊNCIAS QUE ESTÃO NO DISCO =====
     *
     * O `estados.json` é escrito no empacotamento e lista UMA competência por
     * UF: a do pacote. A atualização NÃO apaga a anterior — e não pode apagar,
     * porque orçamento reabre na base que ele declara (`competenciaSinapi`);
     * repricificar sozinho é impugnação em licitação e medição errada.
     *
     * Só que, sem esta descoberta, os arquivos das competências anteriores
     * ficavam no disco SEM NINGUÉM SABER: ~79 MB por competência, invisíveis,
     * e reabrir um orçamento antigo caía em "não deu para carregar a base".
     * O motor já sabia carregar (`trocarBaseSinapi` deriva o arquivo da
     * competência pedida) — faltava DESCOBRIR.
     *
     * Sem servidor local (PWA) o fetch falha e fica só o manifesto, como
     * sempre foi. Nunca é erro: é informação a mais quando dá para ter. */
    _descobrirCompetencias: function () {
      var self = this;
      var mapa = {};
      function juntar(uf, comp) {
        uf = String(uf || "").toUpperCase(); comp = String(comp || "").trim();
        if (!uf || !comp) return;
        if (!mapa[uf]) mapa[uf] = [];
        if (mapa[uf].indexOf(comp) < 0) mapa[uf].push(comp);
      }
      /* a do manifesto é a EMBARCADA: o analítico de nome antigo pertence a ela */
      var embarcada = {};
      (self._estados || []).forEach(function (e) {
        juntar(e.uf, e.competencia);
        if (e.uf && e.competencia) embarcada[String(e.uf).toUpperCase()] = String(e.competencia).trim();
      });
      var temAnalitico = {}, legado = {};
      function marcar(uf, comp) { temAnalitico[String(uf).toUpperCase() + "|" + String(comp).trim()] = 1; }
      /* ⚠ O ESPELHO TAMBÉM CONTA, E É ELE QUE ATENDE QUEM NÃO TEM SERVIDOR.
       *   `__bases` é a listagem do servidor LOCAL: só existe no app
       *   instalado, e só enxerga o que está no disco daquela máquina. Quem
       *   usa o PWA nunca teve competência nenhuma para escolher, e o app
       *   instalado só oferecia o que o instalador deixou.
       *
       *   O espelho publica o ACERVO no `bases-status.json` — cada
       *   competência com as UFs que têm PREÇO e as que têm ANALÍTICO,
       *   separadas de propósito. As duas listas entram pelas mesmas portas
       *   (`juntar` e `marcar`), então a regra de baixo continua valendo sem
       *   exceção: competência sem o analítico dela não é oferecida. */
      var doEspelho = function () {
        var b = "";
        try { b = String((CONFIG && CONFIG.appWebUrl) || "").replace(/\/$/, ""); } catch (e) {}
        if (!b) return Promise.resolve();
        return fetch(b + "/data/bases-status.json", { cache: "no-store" })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (j) {
            if (!j || !Array.isArray(j.acervo)) return;
            j.acervo.forEach(function (a) {
              (a.ufs || []).forEach(function (uf) { juntar(uf, a.competencia); });
              (a.analitico || []).forEach(function (uf) { marcar(uf, a.competencia); });
            });
          })
          .catch(function () { /* sem rede: fica o que o disco tem */ });
      };
      return fetch("__bases", { cache: "no-store" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          if (!j) return;
          if (Array.isArray(j.bases)) j.bases.forEach(function (b) { juntar(b.uf, b.competencia); });
          if (Array.isArray(j.analiticos)) j.analiticos.forEach(function (a) { marcar(a.uf, a.competencia); });
          if (Array.isArray(j.analiticoLegado)) j.analiticoLegado.forEach(function (uf) { legado[String(uf).toUpperCase()] = 1; });
        })
        .catch(function () { /* PWA/sem servidor: fica o manifesto */ })
        .then(doEspelho)
        .then(function () {
          /* ⚠⚠ SÓ FICA A COMPETÊNCIA QUE DÁ PARA HONRAR.
           *
           * Ter o preço de um mês não basta: o ANALÍTICO daquele mês tem de
           * existir também. Ele é a fonte oficial de custo de ~2.000 insumos por
           * UF, reparte MO/MAT/EQ e alimenta composição própria. Oferecer uma
           * competência sem o analítico dela entregaria PREÇO de um mês com
           * INSUMO de outro, calado, num documento que vai para licitação.
           *
           * O analítico de nome ANTIGO (sem competência) conta — mas só para a
           * competência EMBARCADA, que é de quem ele é. */
          Object.keys(mapa).forEach(function (uf) {
            mapa[uf] = mapa[uf].filter(function (c) {
              if (temAnalitico[uf + "|" + c]) return true;
              return !!(legado[uf] && embarcada[uf] === c);
            });
            mapa[uf].sort(function (a, b) { return a < b ? 1 : (a > b ? -1 : 0); });   // mais nova primeiro
            if (!mapa[uf].length) delete mapa[uf];
          });
          self._compsPorUf = mapa;
          return mapa;
        });
    },

    /* Competências disponíveis para uma UF (mais nova primeiro). */
    competenciasDaUf: function (uf) {
      var m = this._compsPorUf || {};
      return (m[String(uf || "").toUpperCase()] || []).slice();
    },

    /* ===== O ANALÍTICO PODE SER DE OUTRO MÊS — E ISSO PRECISA APARECER =====
     *
     * Há UM analítico por UF (`sinapi-<UF>-analitico.json`), sem competência no
     * nome, sobrescrito a cada atualização — e o do VPS também. Quando a base
     * de PREÇO carregada é de outra competência (reabrir orçamento antigo, que
     * troca a base para a que o documento declara), o detalhamento continua o
     * do mês embarcado. Não é detalhe: o analítico é a fonte oficial de custo de
     * ~2.000 insumos por UF, reparte MO/MAT/EQ e alimenta composição própria.
     *
     * Isso JÁ acontecia, calado. O comentário do `aplicar()` sempre nomeou o
     * risco — "senão o insumo é de um mês e o custo unitário é de outro" — mas a
     * guarda de lá só cobre um sentido: base MAIS NOVA que o pacote. A base mais
     * VELHA cai no arquivo local do mês errado.
     *
     * Consertar de verdade pede analítico POR COMPETÊNCIA (arquivo e rota com a
     * competência no nome). Até lá, o mínimo honesto é dizer. Falhar calado num
     * número que vai para licitação é o pior dos mundos. */
    _avisarAnaliticoDeOutroMes: function () {
      var self = this;
      try {
        if (typeof Analitico === "undefined" || typeof Sinapi === "undefined") return;
        /* ⚠ SEM RELÓGIO. A primeira versão agendava a checagem 1,2 s depois de
         * `Analitico.reset()` e desistia se o analítico ainda não tivesse
         * carregado — e ele é preguiçoso (~1 MB comprimido, ~18 MB de parse,
         * começando depois de a tela abrir). Nunca dava tempo, e não havia
         * segunda chance: o único aviso que protege o caso "só existe o
         * analítico de nome antigo" jamais chegava ao usuário.
         * Agora quem chama é o próprio `Analitico.carregarDe`, no instante em
         * que há o que comparar. */
        if (!Analitico.carregado || !Analitico.competencia || !Sinapi.competencia) return;
        if (this._normComp(Analitico.competencia) === this._normComp(Sinapi.competencia)) return;
        var chave = this._normComp(Sinapi.competencia) + "|" + this._normComp(Analitico.competencia) + "|" + (self._baseUf || "");
        if (self._avisoAnaliticoFeito === chave) return;   // uma vez por combinação
        self._avisoAnaliticoFeito = chave;
        if (typeof UI === "undefined" || !UI.toast) return;
        var fmt = function (c) { return (typeof BasesCat !== "undefined" && BasesCat.fmtVersao) ? BasesCat.fmtVersao(c) : c; };
        UI.toast("" + (typeof Icones !== "undefined" ? Icones.get("alerta", 15) : "") +
          " Atenção: os PREÇOS são da competência " + fmt(Sinapi.competencia) +
          ", mas o DETALHAMENTO de insumos instalado é de " + fmt(Analitico.competencia) +
          ". O que vem do detalhamento (insumo sem preço no sintético, divisão MO/MAT/EQ) sai do outro mês.", "aviso");
      } catch (e) {}
    },
    /* "06/2026" e "2026-06" são a MESMA competência. O app normaliza isso em
       três outros lugares; aqui vira um só, usável por quem precisar. */
    _normComp: function (c) {
      c = String(c || "").trim();
      var m = /^(\d{2})\/(\d{4})$/.exec(c);
      return m ? (m[2] + "-" + m[1]) : c;
    },
    _avisoAnaliticoFeito: null,

    // Troca a base SINAPI ativa para outra UF (lazy). cb(true|false).
    // v1.1.121 — QUALQUER UF abre: arquivo local primeiro; se faltar/corromper,
    // busca AO VIVO no servidor (mesma rota dos analíticos, .json.gz descomprimido
    // pelo VPS). Pacote de estado único ou instalação antiga deixam de ser beco
    // sem saída — só falha de verdade sem internet E sem arquivo local.
    /* ⚠ O ACERVO É GRAVADO COMPRIMIDO, ENTÃO LER TEM DE SABER DESCOMPRIMIR.
     *   Um sintético cru tem 3,1 MB; em `.gz` tem 264 KB. Cinco competências
     *   ×27 UFs só cabem no espelho comprimidas — e o navegador descomprime
     *   sozinho com `DecompressionStream`, sem biblioteca.
     *   Mesmo padrão que o analítico já usava (`Analitico._fetchUma`): tenta
     *   o `.gz`, cai no `.json` puro se o navegador não souber ou o arquivo
     *   não existir. A instalação antiga, que tem o `.json` cru no disco,
     *   continua funcionando sem saber que isto existe. */
    _fetchBase: function (url) {
      var temDS = (typeof DecompressionStream !== "undefined") && (typeof Response !== "undefined");
      var puro = function () {
        return fetch(url, { cache: "no-store" }).then(function (r) {
          if (!r.ok) throw new Error("HTTP " + r.status);
          return r.json();
        });
      };
      if (!temDS || /\.gz$/.test(url)) return puro();
      return fetch(url + ".gz", { cache: "no-store" }).then(function (r) {
        if (!r.ok || !r.body) throw new Error("sem .gz");
        return new Response(r.body.pipeThrough(new DecompressionStream("gzip"))).json();
      }).catch(puro);
    },

    trocarEstadoSinapi: function (uf, cb) { return this.trocarBaseSinapi(uf, "", cb); },

    /* TROCA DE BASE POR UF **E** COMPETÊNCIA.
     *
     * Nasceu como trocarEstadoSinapi(uf) — só a UF mudava, e a competência vinha
     * de carona do manifesto. Quando o assistente passou a deixar o usuário
     * ESCOLHER a competência (v1.1.141), isso virou um problema de licitação: a
     * escolha só trocava o rótulo do documento e os preços continuavam os da base
     * carregada. Agora a competência pedida também carrega a base dela — e, se
     * essa base não existir, o chamador recebe false e NÃO pode gravar o rótulo.
     * compPedida vazia = "a do manifesto", que é o comportamento de sempre. */
    trocarBaseSinapi: function (uf, compPedida, cb) {
      var self = this;
      uf = String(uf || "").toUpperCase();
      compPedida = String(compPedida || "").trim();
      var est = (self._estados || []).filter(function (e) { return e.uf === uf; })[0];
      var comp = compPedida || (est && est.competencia) || (self._estados && self._estados[0] && self._estados[0].competencia) || CONFIG.sinapi.competenciaPadrao;
      // com competência pedida o nome do arquivo é derivado dela, não do manifesto
      var arqLocal = (!compPedida && est && est.arquivo) || ("data/sinapi-" + uf + "-" + comp + ".json");
      var req = ++self._ufReq; // só a troca mais recente comita (evita corrida em cliques rápidos)
      UI.toast("Carregando SINAPI " + uf + (compPedida ? " · " + compPedida : "") + "…", "ok");
      // Só um pacote VÁLIDO chega ao Sinapi.carregarDe — achados do gate: (a) JSON 200
      // de proxy/erro clobberava a base atual antes da checagem de UF; (b) pacote sem
      // 'uf' assumia MG e passava batido quando a UF pedida era MG. Validar ANTES.
      // mesma normalização do auto-update: "2026-06" e "06/2026" são a MESMA competência
      var normC = function (c) {
        c = String(c || "").trim();
        try { if (global.Atualizacao && Atualizacao._normComp) return Atualizacao._normComp(c); } catch (e) {}
        var m = c.match(/^(\d{2})[\/\-](\d{4})$/); // MM/AAAA -> AAAA-MM
        return m ? (m[2] + "-" + m[1]) : c;
      };
      // a competência do pacote mora em "mes" (é assim que o Sinapi.carregarDe lê,
      // sinapi.js:22); "competencia" só existe como apelido em pacote importado
      var compDoPacote = function (j) { return (j && (j.mes || j.competencia)) || ""; };
      var pacoteValido = function (j) {
        if (!(j && Array.isArray(j.dados) && j.dados.length > 0 && String(j.uf || "").toUpperCase() === uf)) return false;
        // competência PEDIDA: o pacote tem que ser dela. Sem isto, um arquivo de
        // outra data-base com a UF certa passaria e o documento mentiria o rótulo.
        if (compPedida && normC(compDoPacote(j)) !== normC(compPedida)) return false;
        return true;
      };
      var aplicar = function () {
        if (req !== self._ufReq) return; // troca obsoleta — descarta silenciosamente
        // Defesa extra: se por algum motivo a UF carregada != a pedida, trata como erro.
        if (String(Sinapi.uf).toUpperCase() !== uf) {
          UI.toast("Base SINAPI de " + uf + " não confere (arquivo inesperado).", "erro");
          if (cb) cb(false); return;
        }
        if (compPedida && normC(Sinapi.competencia) !== normC(compPedida)) {
          UI.toast("A base carregada é " + (Sinapi.competencia || "?") + ", não " + compPedida + ".", "erro");
          if (cb) cb(false); return;
        }
        /* O analítico do PACOTE é da competência embarcada no build. Se a base que
           acabou de subir é de outra data-base, o detalhamento tem que vir do
           servidor — senão o insumo é de um mês e o custo unitário é de outro.
           Mesma guarda que carregarBaseSinapi e a Central de Atualização já fazem. */
        var _compEmb = normC((est && est.competencia) || CONFIG.sinapi.competenciaPadrao || "");
        var _compViva = normC(Sinapi.competencia);
        self._analiticoArquivo = (_compViva && _compEmb && _compViva > _compEmb)
          ? (String(CONFIG.licencaServer).replace(/\/$/, "") + "/analitico/sinapi-" + uf + "-analitico.json")
          : ((est && est.analitico) || ("data/sinapi-" + uf + "-analitico.json"));
        self._baseUf = uf;
        if (typeof Analitico !== "undefined" && Analitico.reset) Analitico.reset(); // descarta analítico da UF anterior
        self._avisarAnaliticoDeOutroMes();
        UI.toast("SINAPI " + uf + " · " + (Sinapi.competencia || "") + " — " + Sinapi.resumo().total.toLocaleString("pt-BR") + " itens.", "ok");
        if (cb) cb(true);
      };
      // Caminho LOCAL com o mesmo rigor do live: fetch manual → valida token e pacote
      // ANTES do carregarDe (a corrida de cliques rápidos comitava a UF errada — gate).
      self._fetchBase(arqLocal).then(function (j) {
        if (req !== self._ufReq) return;
        if (!pacoteValido(j)) throw new Error("pacote local inválido");
        Sinapi.carregarDe(j);
        aplicar();
      }).catch(function (eLocal) {
        if (req !== self._ufReq) return;
        // Local falhou → base AO VIVO do servidor. Tenta a competência local e, se o
        // servidor não a tiver (404 após o giro mensal / instalação antiga), tenta a
        // competência padrão do config — que sobe atualizado em todo update da frota.
        // Com competência PEDIDA não há segunda tentativa: cair para outra data-base
        // seria carregar preço de um mês e rotular de outro.
        var comps = [comp];
        if (!compPedida && CONFIG.sinapi.competenciaPadrao && CONFIG.sinapi.competenciaPadrao !== comp) comps.push(CONFIG.sinapi.competenciaPadrao);
        UI.toast("Base local de " + uf + " indisponível — baixando ao vivo…", "ok");
        var tentar = function (idx) {
          if (idx >= comps.length) {
            UI.toast("Falha ao carregar " + uf + ": sem arquivo local e o servidor não tem essa base agora. A base atual foi mantida.", "erro");
            if (cb) cb(false); return;
          }
          /* ⚠ DUAS FONTES POR COMPETÊNCIA: o servidor e o ESPELHO do app.
           *   Enquanto era só o servidor, reabrir um orçamento numa
           *   competência que a máquina não tinha dependia de o VPS ainda
           *   servi-la — e ele guarda só a corrente. O espelho publica o
           *   acervo inteiro junto com o código, então é ele quem atende
           *   orçamento de licitação preso a data-base antiga. Fica em
           *   segundo lugar porque o servidor, quando responde, é mais perto
           *   de quem instalou. */
          var _esp = "";
          try { _esp = String((CONFIG && CONFIG.appWebUrl) || "").replace(/\/$/, ""); } catch (eE) {}
          var fontes = [CONFIG.licencaServer + "/analitico/sinapi-" + uf + "-" + comps[idx] + ".json"];
          if (_esp) fontes.push(_esp + "/data/sinapi-" + uf + "-" + comps[idx] + ".json");
          var tentarFonte = function (k) {
            if (k >= fontes.length) return Promise.reject(new Error("HTTP 404"));
            return self._fetchBase(fontes[k]).catch(function () { return tentarFonte(k + 1); });
          };
          tentarFonte(0).then(function (j) {
            if (req !== self._ufReq) return;
            if (!pacoteValido(j)) throw new Error("pacote do servidor inválido");
            Sinapi.carregarDe(j);
            aplicar();
          }).catch(function (eLive) {
            if (req !== self._ufReq) return;
            // 404/pacote inválido → tenta a próxima competência; erro de REDE → mensagem honesta
            var m = String((eLive && eLive.message) || "");
            if (m.indexOf("HTTP") === 0 || m.indexOf("pacote") === 0) { tentar(idx + 1); return; }
            UI.toast("Falha ao carregar " + uf + ": sem arquivo local e sem conexão com o servidor (" + (m || (eLocal && eLocal.message)) + "). A base atual foi mantida.", "erro");
            if (cb) cb(false);
          });
        };
        tentar(0);
      });
    },

    abrirImportSinapi: function () {
      var self = this;
      UI.modal("" + (typeof Icones !== "undefined" ? Icones.get("importar", 15) : "") + " Importar base SINAPI", UI.renderImportSinapi(Sinapi.resumo(), self._temBasePropria()), [
        { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
        { texto: "Importar", classe: "primary", onClick: function () { self.processarImportSinapi(); } }
      ]);
    },

    /* Mesma pergunta que a atualização faz (Atualizacao._basePropriaDoCliente):
       base gravada que NÃO veio da atualização oficial é do cliente. */
    _temBasePropria: function () {
      try {
        var b = Store.lerBaseSinapi(Auth.empresaId());
        return !!(b && b.dados && b.dados.length && b._origem !== "atualizacao-oficial");
      } catch (e) { return false; }
    },

    /* Volta para a SINAPI que veio no pacote. Some SÓ a tabela de preços
       importada (`sinapi_base`); as composições próprias moram em
       `bases_extras` e não são tocadas — a confirmação diz isso porque a
       diferença entre as duas é justamente o que NÃO dá para reimportar. */
    voltarBaseOficial: function () {
      var self = this, b = null;
      try { b = Store.lerBaseSinapi(Auth.empresaId()); } catch (e) {}
      var n = (b && b.dados && b.dados.length) || 0;
      var comp = (b && (b.mes || b.competencia)) || "—";
      UI.modal("" + (typeof Icones !== "undefined" ? Icones.get("voltar", 15) : "") + " Voltar para a SINAPI oficial?",
        '<p style="font-size:13px;margin-top:0">Sai a base importada de <b>' + Util.esc(String(comp)) +
        '</b> (' + n.toLocaleString("pt-BR") + ' itens) e volta a valer a SINAPI que veio no pacote.</p>' +
        '<p style="font-size:13px">Se essa planilha tinha <b>preços negociados</b>, guarde o arquivo antes: ' +
        'o sistema não tem como reconstruí-la.</p>' +
        '<p class="muted" style="font-size:12px">Não são afetados: composições próprias, orçamentos, obras e o resto dos seus dados.</p>', [
          { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
          { texto: "Voltar para a oficial", classe: "danger", onClick: function () {
            try { Store.apagarBaseSinapi(Auth.empresaId()); } catch (e) {}
            UI.fecharModal();
            /* sem a persistida, o boot lê a do pacote */
            self.carregarBaseSinapi().then(function () {
              UI.toast("De volta à SINAPI oficial. Rode “Verificar atualização” para pegar a competência nova.", "ok");
              self.render();
            }).catch(function () { location.reload(); });
          } }
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

    /* ---------- 📱 Usar no celular / tablet ----------
     * Celular e tablet não instalam .exe: o app é instalado PELA WEB (PWA) e ganha
     * ícone próprio na tela inicial. O caminho curto é o QR — o cliente aponta a
     * câmera e o aparelho abre já com a licença ativada, sem digitar a chave (que
     * é longa e no teclado do celular é receita de erro).
     *
     * A GUARDA DA NUVEM não é decoração: o app do celular roda em OUTRO domínio,
     * e o navegador guarda os dados por domínio. Sem sincronização ligada aqui, o
     * cliente escaneia, o app abre — e está VAZIO. Ele conclui que "não funciona"
     * e liga reclamando. Por isso o QR só sai depois de a nuvem estar de pé. */
    URL_PWA: "https://ra-engenharia.github.io/orcapro/app/",

    abrirCelular: function () {
      var self = this;
      var lic = null;
      try { lic = (typeof Licenca !== "undefined" && Licenca.status) ? Licenca.status() : null; } catch (e) {}
      var licenciado = !!(lic && lic.ativo && !lic.trial && Licenca.chave && Licenca.chave());

      /* 1) A sincronização precisa estar de pé — mas isso é problema MEU, não do
       *    cliente. Se ela ainda não subiu, eu ligo aqui mesmo e sigo com o QR.
       *    Só existe um caso em que vale barrar: quando o próprio usuário
       *    DESLIGOU a sincronização. Aí o celular abriria vazio por decisão dele,
       *    e mandá-lo instalar sem avisar seria pegadinha. */
      var desligou = false, semNuvem = false;
      try {
        if (typeof Nuvem === "undefined" || !Nuvem.disponivel()) semNuvem = true;
        else if (Nuvem.desligadaPeloUsuario && Nuvem.desligadaPeloUsuario()) desligou = true;
        else if (!(Nuvem.auth && Nuvem.auth.currentUser)) {
          try { this._conectarNuvemLicenca(); } catch (e) {}   // liga sozinho; o QR não espera
        }
      } catch (e) {}

      if (desligou || semNuvem) {
        UI.modal("" + (typeof Icones !== "undefined" ? Icones.get("celular", 15) : "") + " Usar no celular ou tablet",
          '<p style="margin-top:0">⚠️ <b>' + (desligou
            ? "A sincronização está desligada — por você."
            : "Esta instalação está sem sincronização na nuvem.") + '</b></p>' +
          '<p class="muted" style="font-size:13px">O celular é <b>outro aparelho</b>: ele não enxerga o que está gravado aqui. Quem leva as suas obras, orçamentos e medições até lá é a sincronização — e sem ela o aplicativo abriria vazio no celular.</p>' +
          (desligou ? '<p class="muted" style="font-size:13px">Religar é um clique, no mesmo lugar onde você desligou.</p>' : ""),
          desligou
            ? [{ texto: "Religar a sincronização", classe: "primary", onClick: function () { UI.fecharModal(); self.abrirNuvem(); } }]
            : []);
        return;
      }

      // 2) A licença viaja no link só para o cliente não digitar a chave no celular.
      //    O app do celular a apaga da barra de endereço assim que lê (replaceState).
      var url = this.URL_PWA;
      if (licenciado) { try { url += "?lic=" + encodeURIComponent(Licenca.chave()); } catch (e) {} }

      var svg = "";
      try { if (typeof QR !== "undefined") svg = QR.svg(url, { tamanhoPx: 208, correcao: "M" }); } catch (e) {}

      var corpo =
        '<p style="margin-top:0">Aponte a câmera do celular para o código. O aplicativo abre no navegador' +
        (licenciado ? ' <b>já com a sua licença ativada</b>' : "") + ' — e depois você o instala na tela inicial, com ícone próprio.</p>' +
        '<div style="display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap">' +
          '<div style="flex:0 0 auto;padding:10px;background:#fff;border:1px solid #d8e0ea;border-radius:10px">' +
            (svg || '<div class="muted" style="width:208px;height:208px;display:flex;align-items:center;justify-content:center;text-align:center;font-size:12px">Não consegui gerar o código.<br>Use o endereço abaixo.</div>') +
          '</div>' +
          '<div style="flex:1;min-width:230px">' +
            '<div style="font-weight:700;margin-bottom:6px">Depois de abrir, instale:</div>' +
            '<div class="muted" style="font-size:13px;line-height:1.7">' +
              '<b>Android (Chrome):</b> toque nos ⋮ do navegador → <b>Instalar aplicativo</b><br>' +
              '<b>iPhone / iPad (Safari):</b> toque no ' + (typeof Icones !== 'undefined' ? Icones.get('importar', 15) : '') + ' compartilhar → <b>Adicionar à Tela de Início</b>' +
            '</div>' +
            '<div class="muted" style="font-size:12px;margin-top:12px;padding-top:10px;border-top:1px solid var(--linha,#d8e0ea)">' +
              'Você vai entrar com o <b>mesmo e-mail e senha</b> que usa aqui.' +
              (licenciado ? '' : '<br>' + (typeof Icones !== 'undefined' ? Icones.get('alerta', 15) : '') + ' Sem licença ativa, o celular abre em modo de teste e <b>não traz os seus dados</b>.') +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="field" style="margin-top:14px"><label>Ou envie este endereço para o aparelho</label>' +
          '<input id="cel-url" class="cell" style="width:100%;font-size:12px" readonly value="' + Util.esc(url) + '"></div>' +
        (licenciado ? '<p class="muted" style="font-size:11px;margin:6px 0 0">' + (typeof Icones !== 'undefined' ? Icones.get('cadeado', 15) : '') + ' Este endereço contém a sua chave de licença: mande só para aparelhos seus ou da sua equipe.</p>' : "");

      UI.modal("" + (typeof Icones !== "undefined" ? Icones.get("celular", 15) : "") + " Usar no celular ou tablet", corpo, [
        { texto: "Copiar endereço", classe: "ghost", onClick: function () {
          var i = UI.el("cel-url"); if (!i) return;
          i.select(); i.setSelectionRange(0, 99999);
          var ok = false;
          try { ok = document.execCommand("copy"); } catch (e) {}
          if (!ok && navigator.clipboard) { try { navigator.clipboard.writeText(i.value); ok = true; } catch (e) {} }
          UI.toast(ok ? "Endereço copiado." : "Não consegui copiar — selecione o texto e copie à mão.", ok ? "ok" : "erro");
        } }
      ]);
    },

    // ---------- Backup dos Orçamentos (exportar/importar) ----------
    // ☁ Nuvem: conectar/sincronizar A QUALQUER HORA (não só no login) — p/ quem
    // trabalha em 2+ computadores (escritório e casa). Regra de ouro: usar o MESMO
    // e-mail e senha da nuvem em todos os aparelhos.
    abrirNuvem: function () {
      var self = this;
      if (typeof Nuvem === "undefined" || !Nuvem.disponivel()) { UI.toast("Sincronização na nuvem indisponível nesta instalação.", "erro"); return; }
      var u = (typeof Auth !== "undefined" && Auth.usuario && Auth.usuario()) || {};
      var conectado = !!(Nuvem.auth && Nuvem.auth.currentUser);
      var emailNuvem = conectado ? (Nuvem.auth.currentUser.email || "") : "";
      var desligada = !!(Nuvem.desligadaPeloUsuario && Nuvem.desligadaPeloUsuario());
      /* CLIENTE LICENCIADO SINCRONIZA PELA LICENÇA, não por e-mail/senha da nuvem.
         Religar pelo formulário criaria/entraria em OUTRA conta Firebase e os dados
         do aparelho ficariam em dois lugares — o cliente veria "sumiram orçamentos".
         Então, quando há licença ativa, religar refaz exatamente o caminho do boot. */
      var _lic = null;
      try { _lic = (typeof Licenca !== "undefined" && Licenca.status) ? Licenca.status() : null; } catch (e) {}
      var porLicenca = !!(_lic && _lic.ativo && !_lic.trial && Licenca.chave && Licenca.chave());
      /* ⚠ BLOQUEADO NÃO É CONECTADO. O aparelho barrado por ser de outra empresa
         fica com `currentUser` preenchido, e esta tela dizia, em verde, "Conectado
         — seus orçamentos sincronizam sozinhos". A única notícia do bloqueio era UM
         aviso no meio dos outros da abertura: quem piscasse abria este modal, lia
         que estava tudo certo e ia dormir com os dados parados. Aqui a verdade vem
         primeiro, e com o que fazer. */
      var _bloq = null;
      try { var _st = (Nuvem.estado && Nuvem.estado()) || {}; if (_st.bloqueadoOutraEmpresa) _bloq = _st; } catch (eB) {}
      var body =
        (_bloq
          ? '<p style="margin-top:0;background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.45);border-radius:8px;padding:10px 12px">'
            + '<b>' + (typeof Icones !== 'undefined' ? Icones.get('cadeado', 15) : '') + ' Sincronização bloqueada</b><br>'
            + 'Esta licença já está registrada para <b>' + Util.esc(_bloq.donoDoBalde || 'outra empresa') + '</b>. '
            + 'Para não misturar os dados das duas, o sistema parou de enviar e de receber. '
            + '<b>Nada foi apagado</b> — tudo que é seu continua neste aparelho.<br>'
            + 'Para voltar a sincronizar, ative aqui a <b>licença da sua empresa</b> (Configurações › Licença). '
            + 'Não precisa fechar o sistema.</p>'
          : '') +
        '<p style="margin-top:0">' + (_bloq ? '<b>Não está sincronizando</b> — veja o aviso acima.' : '') + (_bloq ? '' : conectado
          ? '' + (typeof Icones !== 'undefined' ? Icones.get('check', 15) : '') + ' Conectado como <b>' + Util.esc(emailNuvem) + '</b>. Seus orçamentos sincronizam sozinhos entre os aparelhos conectados com este mesmo e-mail e senha.'
          : (desligada
            ? '⏸ <b>Sincronização desligada por você</b> — os dados ficam só neste aparelho e nada é enviado. Conecte abaixo quando quiser religar.'
            : '⚠️ <b>Nuvem não conectada</b> — seus dados estão só neste computador.')) + '</p>' +
        (porLicenca
          /* Sem número de aparelhos no texto: o limite mora no servidor
             (licencaDispositivos) e já foi 1, 3 e 30. Um número escrito aqui vira
             mentira na virada seguinte — e assusta quem quer pôr celular e tablet.
             Quem estourar recebe a recusa do servidor, com o limite real dele. */
          ? '<p class="muted" style="font-size:12px">Nesta instalação a sincronização usa a <b>sua licença</b> — computador, celular e tablet com a mesma chave enxergam os mesmos dados, sem senha extra.</p>'
          : '<p class="muted" style="font-size:12px">Trabalha no escritório e em casa? Use o <b>MESMO e-mail e a MESMA senha</b> da nuvem nos dois computadores — os orçamentos aparecem em todos.</p>' +
            '<div class="row"><div style="flex:1"><label class="muted" style="font-size:11px">E-mail da nuvem</label><input id="nv-email" class="cell" style="width:100%" value="' + Util.esc(u.email || "") + '"></div></div>' +
            '<div class="row"><div style="flex:1"><label class="muted" style="font-size:11px">Senha da nuvem (a do OUTRO computador, se já usa lá)</label><input id="nv-senha" type="password" class="cell" style="width:100%" placeholder="••••••••"></div></div>');
      var botoes = [];
      /* Desligar a sincronização é direito do titular (revogação de consentimento) e
         precisa valer também nas próximas aberturas — daí o desligamento permanente. */
      /* O botão aparece sempre que a sincronização NÃO está desligada — inclusive
         quando o Firebase ainda não autenticou (offline, proxy): senão o cliente
         que quer parar de enviar dependeria de a nuvem estar no ar para conseguir. */
      if (!desligada) {
        botoes.push({ texto: "Desligar sincronização", classe: "ghost", onClick: function () {
          if (!window.confirm("Desligar a sincronização na nuvem?\n\nOs dados deste aparelho continuam aqui, e nada mais será enviado — nem quando o programa for reaberto.\n\nO que já foi enviado permanece na nuvem; para apagá-lo, peça pelo canal do titular na Política de Privacidade.")) return;
          try { Nuvem.sair(true); } catch (e) {}
          UI.fecharModal(); self.render();
          UI.toast("Sincronização desligada. Este aparelho não envia mais nada para a nuvem.", "ok");
        } });
      }
      botoes.push(
        { texto: conectado ? "Sincronizar agora" : "Conectar e sincronizar", classe: "primary", onClick: function () {
            var eid = Auth.empresaId(), p;
            if (porLicenca) {
              /* MESMO caminho do boot. Entrar por e-mail/senha aqui criaria OUTRA conta
                 Firebase, e os dados do cliente ficariam divididos entre duas contas —
                 na tela dele, "sumiram orçamentos". */
              /* mesma régua do boot: conectado NA CHAVE CERTA é que dispensa reautenticar */
              var chaveAtual = Licenca.chave();
              var mesmaConta = conectado && Nuvem.sessaoConfereComChave && Nuvem.sessaoConfereComChave(chaveAtual);
              if (conectado && !mesmaConta) { try { Nuvem.trocouDeLicenca(); } catch (eT) {} }
              p = mesmaConta ? Promise.resolve() : Nuvem.entrarPorLicenca(chaveAtual);
            } else {
              var email = String((UI.el("nv-email") || {}).value || "").trim().toLowerCase();
              var senha = String((UI.el("nv-senha") || {}).value || "");
              if (!email || (!conectado && !senha)) { UI.toast("Preencha e-mail e senha da nuvem.", "erro"); return; }
              p = conectado ? Promise.resolve() : Nuvem.entrar(email, senha);
            }
            UI.toast("" + (typeof Icones !== "undefined" ? Icones.get("nuvem", 15) : "") + " Conectando…", "ok");
            p.then(function () { return Nuvem.sincronizar(eid); })
              .then(function (okSync) {
                if (window.Blocos) Blocos.usarOverrides(eid);
                try { self._propriaDaNuvem(); } catch (e) {}
                return okSync;
              })
              .then(function (okSync) {
                Nuvem.escutar(eid, function (ent) { if (ent === "pesos_bloco" && window.Blocos) Blocos.usarOverrides(eid); if (typeof PropriaSync !== "undefined" && (ent === PropriaSync.ENTIDADE || ent === "_lapides")) self._propriaDaNuvem(); if (self.tela === "lista") self.render(); });
                // a marca só cai DEPOIS de a reconexão dar certo: se falhar, o
                // desligamento continua valendo e o boot seguinte não reconecta sozinho
                if (Nuvem.marcarDesligada) Nuvem.marcarDesligada(false);
                UI.fecharModal(); self.render();
                /* ANUNCIAR SUCESSO SÓ COM SUCESSO. Este toast já saía sem uma
                   única leitura ou escrita ter dado certo: `conectado` era lido
                   de auth.currentUser, que a sessão salva mantém preenchido
                   mesmo com a sincronização parada. Cliente lia "Sincronizado!"
                   e ia dormir com os dados só na máquina dele. */
                var st = (Nuvem.estado && Nuvem.estado()) || {};
                if (okSync === false || st.cotaEstourada || st.semPermissao) {
                  UI.toast(st.cotaEstourada
                    ? "" + (typeof Icones !== "undefined" ? Icones.get("nuvem", 15) : "") + " A nuvem recusou as gravações agora (limite do serviço). Seu trabalho está salvo neste aparelho e sobe sozinho mais tarde."
                    : "" + (typeof Icones !== "undefined" ? Icones.get("nuvem", 15) : "") + " NÃO consegui sincronizar. Seu trabalho está salvo neste aparelho — vou tentando sozinho.", "erro");
                } else {
                  UI.toast("" + (typeof Icones !== "undefined" ? Icones.get("nuvem", 15) : "") + " Sincronizado! Seus orçamentos agora aparecem em todos os aparelhos conectados.", "ok");
                }
              })
              .catch(function (e) {
                var code = e && e.code;
                if (code === "auth/wrong-password") UI.toast("Senha da nuvem incorreta — use a MESMA senha do outro computador (ou redefina lá).", "erro");
                else if (code === "auth/network-request-failed") UI.toast("Sem internet agora. Tente novamente quando conectar.", "erro");
                else UI.toast("Não conectou: " + (code || (e && e.message) || "erro"), "erro");
              });
          } });
      UI.modal("" + (typeof Icones !== "undefined" ? Icones.get("nuvem", 15) : "") + " Nuvem — sincronizar entre aparelhos", body, botoes);
    },

    abrirBackup: function () {
      /* ⚠ GUARDA NA FUNÇÃO, não só no menu. O backup leva a empresa
         INTEIRA num arquivo: orçamentos, financeiro, folha, contratos,
         fiscal e a própria tabela `equipe`. O botão só aparece no menu do
         admin (js/ui.js:258) e o Ctrl+K exclui sub-usuário, mas esconder
         controle nunca foi guarda — a ação é alcançável pelo despacho
         (js/app.js:1106 e :1109). Achado na auditoria de permissão de
         15/08/2026, mesma família da v1.1.240. */
      if (typeof Auth !== "undefined" && Auth.ehAdmin && !Auth.ehAdmin()) {
        try { UI.toast("O backup leva os dados de toda a empresa. Apenas o administrador da conta pode gerar.", "erro"); } catch (eB) {}
        return;
      }
      var eid = Auth.empresaId();
      var n = Store.listarOrcamentos(eid).length;
      var prop = this._propriasDoDisco(eid);
      var nProp = (prop && prop.dados.length) || 0;
      var html = '<p>Você tem <b>' + n + '</b> orçamento(s) salvos nesta conta (' + Util.esc((Auth.usuario() || {}).email || "") + ')'
        + (nProp ? ' e <b>' + nProp + '</b> composição(ões)/insumo(s) <b>próprios</b>' : '') + '.</p>' +
        '<p class="muted">Exporte um arquivo <b>.json</b> para guardar/transferir. Importar <b>restaura/mescla</b> o conteúdo do arquivo nesta conta — nada é apagado.</p>' +
        /* o estado do backup automático fica ESCRITO: backup que ninguém vê é
           backup em que ninguém confia — e o cliente só descobre que não tinha
           no dia em que precisa. */
        '<div id="bkp-auto" class="muted" style="margin:10px 0;padding:9px 12px;border-radius:8px;background:rgba(59,130,246,.08);border:1px solid rgba(59,130,246,.25)">⏳ verificando o backup automático…</div>' +
        '<div id="bkp-nuvem" style="margin:0 0 10px"></div>' +
        '<div class="flex" style="gap:10px;margin-top:10px"><button class="btn primary" data-acao="backup-export">' + (typeof Icones !== 'undefined' ? Icones.get('salvar', 15) : '') + ' Exportar backup</button></div>' +
        '<div class="field" style="margin-top:14px"><label>Restaurar de um backup (.json)</label><input type="file" id="bkp-file" accept=".json,application/json">' +
        '<div class="muted" style="font-size:12px;margin-top:4px">Aceita também um <b>pacote de orçamento</b> (<span class="mono">.orcapro.json</span>) gerado fora do sistema: ele entra já cadastrado, com cliente e obra.</div></div>' +
        /* ⚠ PORTA SEPARADA PARA O PERFIL, e ela precisa existir por um motivo
           exato: o "Restaurar" acima mescla com "o mais novo vence", e o
           registro do perfil que está na conta AGORA é sempre mais novo que o
           do arquivo. Quem perdeu o perfil importa o próprio backup, o perfil
           é descartado em silêncio, e a conclusão é que o backup não presta.
           Aqui a recuperação é explícita, mexe só no perfil, e ignora o
           carimbo de propósito. */
        '<details style="margin-top:6px"><summary class="muted" style="cursor:pointer;font-size:12.5px">Perdeu a versão enxugada do seu sistema?</summary>' +
          '<p class="muted" style="font-size:12px;margin:8px 0 6px">Se o seu OrçaPRO voltou a mostrar <b>todos</b> os módulos e a opção de voltar sumiu, ' +
          'escolha aqui um backup de <b>antes</b> disso ter acontecido. Isto mexe <b>somente</b> no perfil de implantação — ' +
          'nenhum orçamento, diário ou lançamento é tocado.</p>' +
          '<input type="file" id="bkp-perfil" accept=".json,application/json">' +
        '</details>';
      UI.modal("" + (typeof Icones !== "undefined" ? Icones.get("salvar", 15) : "") + " Backup dos Orçamentos", html, [{ texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } }]);
      try {
        fetch("/__backup/status").then(function (r) {
          /* 404 aqui NÃO é "sem servidor": é servidor ANTIGO. A troca de versão
             substitui os arquivos, mas o Node já está carregado — ele segue
             servindo o código velho até o app ser fechado e aberto. Dizer
             "indisponível" nesse caso manda o dono procurar defeito onde não
             tem: o certo é dizer o que resolve. */
          if (r.status === 404) return { __servidorAntigo: true };
          return r.json();
        }).then(function (j) {
          var box = UI.el("bkp-auto"); if (!box) return;
          if (j && j.__servidorAntigo) {
            box.innerHTML = "⚠ <b>Falta concluir a atualização.</b> O programa já foi atualizado, mas a parte que grava o backup só entra quando você <b>fecha e abre o OrçaPRO</b>. Faça isso quando puder — leva 10 segundos e o backup automático começa sozinho.";
            return;
          }
          if (!j || !j.ok) { box.innerHTML = "⚠ <b>Backup automático desligado</b> — o app foi aberto sem o servidor local. Exporte o backup à mão, por enquanto."; return; }
          box.innerHTML = (j.total
            ? "✅ <b>Backup automático ligado</b> — " + j.total + " cópia(s) guardadas " + (j.destino === "nuvem" ? "na pasta do " + Util.esc(j.nuvem || "") : "em disco") + ". Última: <b>"
              + Util.esc(String(j.ultimoEm || "").slice(0, 19).replace("T", " ")) + "</b>."
              + (j.melhorComposicoes ? " A melhor cópia das composições próprias tem <b>" + j.melhorComposicoes + "</b> item(ns) e nunca é apagada." : "")
            : "✅ <b>Backup automático ligado</b> — ainda sem cópia gravada (a primeira sai depois da próxima alteração).")
            + '<br><span class="mono" style="font-size:11px">' + Util.esc(j.pasta || "") + "</span>";
          try { App._bkpNuvem(j); } catch (eN) {}
        }).catch(function () {
          var box = UI.el("bkp-auto"); if (!box) return;
          /* sem resposta nenhuma: ou é o app do celular/navegador (não existe
             servidor local), ou o servidor caiu. As duas coisas se resolvem de
             jeitos diferentes — perguntar ao /__update/check separa uma da outra. */
          fetch("/__update/check").then(function (r2) {
            box.innerHTML = r2.ok
              ? "⚠ <b>Falta concluir a atualização</b> — feche e abra o OrçaPRO para o backup automático entrar no ar."
              : "ℹ️ <b>Backup automático é do computador.</b> Aqui no navegador/celular, use o <b>Exportar backup</b> abaixo.";
          }).catch(function () {
            box.innerHTML = "ℹ️ <b>Backup automático é do computador.</b> Você abriu o app pelo navegador/celular — aqui, use o <b>Exportar backup</b> abaixo.";
          });
        });
      } catch (e) {}
    },
    /* ==================================================================
     * BACKUP NA PASTA DA NUVEM (pedido do Rogério, 11/09/2026). O cliente
     * escolhe uma nuvem que JÁ está no computador e o backup automático passa
     * a ser gravado nela; o app da nuvem leva para a conta dele. Quem acha as
     * nuvens e grava a escolha é o servidor local (server/static.js): daqui
     * só vai o id da nuvem, nunca um caminho.
     * ================================================================== */
    _bkpNuvem: function (st) {
      var box = UI.el("bkp-nuvem"); if (!box) return;
      var self = this;
      var caixa = function (tom, html) {
        var c = tom === "ok" ? "22,163,74" : (tom === "alerta" ? "217,119,6" : "59,130,246");
        return '<div style="padding:9px 12px;border-radius:8px;background:rgba(' + c + ',.08);border:1px solid rgba(' + c + ',.3)">' + html + '</div>';
      };
      fetch("/__backup/pastas").then(function (r) { return r.ok ? r.json() : null; }).then(function (p) {
        if (!p || !p.ok) { box.innerHTML = ""; return; }
        var ic = (typeof Icones !== "undefined" ? Icones.get("nuvem", 15) : "") + " ";
        var h;
        if (st && st.destino === "nuvem") {
          h = caixa("ok", ic + "<b>Os backups estão indo para o " + Util.esc(st.nuvem || "") + "</b>, que leva as cópias para a sua conta." +
            '<br><span class="mono" style="font-size:11px">' + Util.esc(st.pasta || "") + "</span>" +
            '<div style="margin-top:8px"><button class="btn sm ghost" data-bkp-nuvem="padrao">Voltar para a pasta do computador</button></div>');
        } else if (st && st.falhaNuvem) {
          h = caixa("alerta", "⚠ <b>A pasta do " + Util.esc(st.nuvem || "") + " não está acessível agora</b> (o programa da nuvem está desligado ou a pasta mudou de lugar). " +
            "Os backups estão sendo gravados na pasta do computador até ela voltar." +
            '<div style="margin-top:8px"><button class="btn sm ghost" data-bkp-nuvem="padrao">Deixar só na pasta do computador</button></div>');
        } else if (p.candidatas && p.candidatas.length) {
          h = caixa("", ic + "<b>Guarde os backups também na sua nuvem.</b> Escolha a nuvem que já está neste computador: as cópias automáticas passam a ser gravadas na pasta dela, e ela leva para a sua conta. " +
            "O arquivo tem os dados da empresa (orçamentos, obras, financeiro e equipe) e fica só na sua conta." +
            '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">' + p.candidatas.map(function (c) {
              return '<button class="btn sm primary" data-bkp-nuvem="' + Util.esc(c.id) + '" title="' + Util.esc(c.destino || "") + '">Guardar no ' + Util.esc(c.nome) + "</button>";
            }).join("") + "</div>");
        } else {
          h = caixa("", ic + "<b>Nenhuma nuvem encontrada neste computador.</b> Para guardar os backups na sua conta, instale o OneDrive, o Google Drive para computador ou o Dropbox, entre com a sua conta e abra esta tela de novo.");
        }
        box.innerHTML = h;
        Array.prototype.forEach.call(box.querySelectorAll("[data-bkp-nuvem]"), function (b) {
          b.onclick = function () {
            b.disabled = true;
            fetch("/__backup/pasta", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: b.getAttribute("data-bkp-nuvem") }) })
              .then(function (r) { return r.json(); }).then(function (j) {
                if (!j || !j.ok) { b.disabled = false; UI.toast((j && j.erro) || "Não deu para mudar a pasta do backup.", "erro"); return; }
                UI.toast(j.destino === "nuvem" ? "Pronto: os backups agora vão para o " + j.nuvem + "." : "Os backups voltaram para a pasta do computador.", "ok");
                self.abrirBackup();
              })["catch"](function () { b.disabled = false; UI.toast("Sem resposta do programa. Feche e abra o OrçaPRO e tente de novo.", "erro"); });
          };
        });
      })["catch"](function () { box.innerHTML = ""; });
    },
    /* A base PRÓPRIA (composições e insumos criados pelo cliente) é o ÚNICO
     * dado autoral que vivia só no IndexedDB deste aparelho — fora do backup,
     * fora da nuvem. Foi o que um cliente perdeu. Agora viaja no backup. As
     * outras bases ficam de fora de propósito: são grandes e reimportáveis. */
    _propriasDoDisco: function (eid) {
      try {
        var payload = Store.lerBasesExtras(eid) || [];
        for (var i = 0; i < payload.length; i++) {
          if (String(payload[i].fonte).toUpperCase() === "PROPRIA") {
            return { fonte: "PROPRIA", uf: payload[i].uf || "", mes: payload[i].mes || "", dados: Util.arr(payload[i].dados) };
          }
        }
      } catch (e) {}
      return null;
    },
    /* ⚠ O BACKUP NÃO GUARDAVA A GESTÃO — e foi descoberto do pior jeito
       (09/08/2026): sumiram diários e não havia de onde restaurar. Ele levava
       orçamentos, preferências e a base de preços; obras, diários, medições,
       financeiro, folha, EPI, ponto, frota e patrimônio ficavam de fora.
       Backup que não guarda o que a pessoa mais teme perder não é backup.

       A lista vem do que SINCRONIZA (`Nuvem.ENTIDADES`), e não de uma lista
       própria aqui: lista paralela é lista que alguém esquece de atualizar ao
       criar o módulo seguinte — e o esquecimento só aparece no dia do socorro.
       Fora dela ficam só `orcamentos` e `prefs`, que já viajam em campo
       próprio, e as lápides, que registram exclusão e não conteúdo. */
    _ENT_FORA_DO_BACKUP: ["orcamentos", "prefs", "_lapides"],
    _dumpGestao: function (eid) {
      var g = {}, fora = this._ENT_FORA_DO_BACKUP;
      var ents = (typeof Nuvem !== "undefined" && Nuvem.ENTIDADES) ? Nuvem.ENTIDADES : [];
      ents.forEach(function (ent) {
        if (fora.indexOf(ent) > -1) return;
        try {
          var v = Store.listar(eid, ent);
          if (v && v.length) g[ent] = v;
        } catch (e) { /* entidade que ainda não existe não impede o backup do resto */ }
      });
      return g;
    },
    _dumpBackup: function (eid) {
      return { app: "OrçaPRO", versao: CONFIG.versao, exportadoEm: Util.agoraISO(),
        empresa: (Auth.usuario() || {}).empresa, email: (Auth.usuario() || {}).email,
        orcamentos: Store.listarOrcamentos(eid), prefs: Store.lerPrefs(eid), basePropria: this._propriasDoDisco(eid),
        gestao: this._dumpGestao(eid) };
    },

    /* ==================================================================
     * BACKUP AUTOMÁTICO EM ARQUIVO — sem depender de o cliente lembrar.
     * O dado mora no navegador; o servidor local (que já serve o app) tem
     * disco. Aqui o app manda a cópia para lá sozinho, e ela sobrevive a
     * limpar cache, trocar de navegador e reinstalar.
     * Falha em silêncio de propósito: o app aberto direto do arquivo, ou
     * sem o servidor, não pode encher a tela de erro por causa disso —
     * o estado real aparece em 💾 Backup, escrito.
     * ================================================================== */
    _bkpTimer: null, _bkpUltimo: 0, _bkpInfo: null,
    backupAuto: function (opts) {
      opts = opts || {};
      var self = this;
      /* composição própria é dado AUTORAL e insubstituível: fura a espera de
         5 min (só o agrupamento de 15 s continua, p/ não gerar 1 arquivo por tecla) */
      if (this._bkpSemServidor) return;   // ver _backupEnviar
      /* gravação da GESTÃO (js/store.js) espaça 30 min: diário e financeiro
         gravam o dia todo, e a cada 5 min as 30 cópias cobririam só 2,5 h */
      var esperaMin = opts.gestao ? 30 : 5;
      if (!opts.urgente && (Date.now() - this._bkpUltimo) < esperaMin * 60 * 1000) return;
      if (this._bkpTimer) clearTimeout(this._bkpTimer);
      this._bkpTimer = setTimeout(function () { self._bkpTimer = null; self._backupEnviar(); }, 15000);
    },
    _hostLocal: function () {
      var h = (typeof location !== "undefined" && location.hostname) ? String(location.hostname).toLowerCase() : "";
      return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "::1";
    },
    _backupEnviar: function () {
      var self = this, eid, dump;
      try { eid = Auth.empresaId(); } catch (e) { return; }
      /* ⚠ PRÉVIA NÃO GRAVA BACKUP. A pasta guarda 30 arquivos em rotação e já
         costuma estar cheia: cada gravação de dado de exemplo mataria um
         backup REAL, começando pelo mais antigo. E o modal de Backup passaria
         a mostrar como "última cópia" um arquivo de dado falso. */
      if (typeof PreviewCli !== "undefined" && PreviewCli.ehPrevia(eid)) return;
      /* ⚠ SEM SERVIDOR LOCAL, NÃO MONTA O DUMP. Toda gravação da Gestão pede
         backup (js/store.js), e no celular e no PWA não existe o servidor que
         grava. O _bkpUltimo só andava no SUCESSO, então cada 15 s de edição
         montava o JSON da empresa inteira para um envio que nunca chega. Um
         404/405 diz "aqui não há servidor": para de tentar nesta sessão. */
      if (this._bkpSemServidor) return;
      /* ⚠ SÓ DO localhost. É a única origem que o servidor de backup aceita
         (fora dela responde 403). Sem esta guarda o primeiro backup de cada
         sessão do PWA mandava a empresa inteira por POST ao github.io, e na
         rede local (http://192.168...) ela atravessava o Wi-Fi a cada 5 min
         para ser recusada (revisão, 11/09/2026). */
      if (!this._hostLocal()) { this._bkpSemServidor = true; return; }
      try { dump = this._dumpBackup(eid); } catch (e) { return; }
      /* ⚠ e a GESTÃO conta como motivo para gravar. Antes, uma conta que só
         usasse obras e diários — sem orçamento e sem base própria — nunca
         gerava backup nenhum: o arquivo simplesmente não nascia. */
      var temGestao = !!(dump.gestao && Object.keys(dump.gestao).length);
      if (!dump.orcamentos.length && !(dump.basePropria && dump.basePropria.dados.length) && !temGestao) return;
      try {
        fetch("/__backup/salvar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(dump) })
          .then(function (r) {
            if (r.status === 404 || r.status === 405 || r.status === 403) { self._bkpSemServidor = true; return null; }
            return r.json();
          })
          /* recusa ou falha de rede também marcam a hora: tenta de novo em 5 min,
             sem martelar (um servidor reiniciando depois do update não desliga o
             backup da sessão — só o 404/405 desliga) */
          .then(function (j) { self._bkpUltimo = Date.now(); if (j && j.ok) self._bkpInfo = j; })
          .catch(function () { self._bkpUltimo = Date.now(); });
      } catch (e) {}
    },
    exportarBackup: function () {
      /* ⚠ GUARDA NA FUNÇÃO, não só no menu. O backup leva a empresa
         INTEIRA num arquivo: orçamentos, financeiro, folha, contratos,
         fiscal e a própria tabela `equipe`. O botão só aparece no menu do
         admin (js/ui.js:258) e o Ctrl+K exclui sub-usuário, mas esconder
         controle nunca foi guarda — a ação é alcançável pelo despacho
         (js/app.js:1106 e :1109). Achado na auditoria de permissão de
         15/08/2026, mesma família da v1.1.240. */
      if (typeof Auth !== "undefined" && Auth.ehAdmin && !Auth.ehAdmin()) {
        try { UI.toast("O backup leva os dados de toda a empresa. Apenas o administrador da conta pode gerar.", "erro"); } catch (eB) {}
        return;
      }
      var eid = Auth.empresaId();
      var dump = this._dumpBackup(eid);
      var blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url; a.download = "orcapro-backup-" + new Date().toISOString().slice(0, 10) + ".json";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
      var nProp = (dump.basePropria && dump.basePropria.dados.length) || 0;
      UI.toast(dump.orcamentos.length + " orçamento(s)" + (nProp ? " e " + nProp + " composição(ões) própria(s)" : "") + " exportado(s).", "ok");
    },

    /* Restaura a base PRÓPRIA do backup SOMANDO ao que já existe.
     * Nunca reduz: o backup é remédio para perda de dado, seria absurdo ele
     * mesmo apagar o que o cliente criou depois. Em código repetido, vence a
     * gravação mais recente (criadoEm é reescrito a cada save). */
    _restaurarPropria: function (eid, doBackup) {
      var vindo = (doBackup && Util.arr(doBackup.dados)) || [];
      if (!vindo.length) return { novos: 0, atualizados: 0, total: 0 };
      var atual = this._propriasDoDisco(eid) || { fonte: "PROPRIA", uf: "", mes: "", dados: [] };
      var porCodigo = {}, ordem = [];
      atual.dados.forEach(function (it) { if (it && it.codigo != null) { porCodigo[String(it.codigo).toLowerCase()] = it; ordem.push(String(it.codigo).toLowerCase()); } });
      var novos = 0, atualizados = 0;
      vindo.forEach(function (it) {
        if (!it || it.codigo == null) return;
        var k = String(it.codigo).toLowerCase(), ja = porCodigo[k];
        if (!ja) { porCodigo[k] = it; ordem.push(k); novos++; return; }
        if (String(it.criadoEm || "") > String(ja.criadoEm || "")) { porCodigo[k] = it; atualizados++; }
      });
      var dados = ordem.map(function (k) { return porCodigo[k]; });
      Bases.registrar("PROPRIA", { dados: dados, uf: atual.uf || doBackup.uf || "", mes: atual.mes || doBackup.mes || "" });
      Bases.persistir(eid);
      try { this.backupAuto({ urgente: true }); } catch (e) {}
      /* o que foi restaurado também vai para o espelho: recuperar num aparelho
         tem de chegar aos outros — senão o próximo merge trata como "não existe".
         ⚠ EM LOTE desde a v1.2: era um-a-um e, como o `dados` aqui é a base
         PRÓPRIA INTEIRA (não só o que entrou), uma base de 5.000 composições
         fazia 5.000 leituras + 5.000 regravações do espelho completo — dentro
         do MESMO importarBackup que já congelava a aba por causa da Gestão. */
      this._propriaEspelharVarios(dados);
      return { novos: novos, atualizados: atualizados, total: dados.length };
    },
    /* ==================================================================
     * RECUPERAR O PERFIL DE IMPLANTAÇÃO DE UM BACKUP
     *
     * ⚠ POR QUE ISTO EXISTE. Até 31/08/2026, ir para "Completo" gravava por
     *   cima do único registro que sabia qual era o perfil do cliente — e na
     *   máquina dele o catálogo dos perfis não existe (fica fora do pacote de
     *   propósito). O resultado, medido: a lista caía para uma opção, o bloco
     *   inteiro sumia de ⚙ Empresa, e nem pelo console dava para desfazer.
     *   A porta foi fechada em `js/perfis.js`; esta função é para quem já
     *   passou por ela antes do conserto e ficou sem caminho de volta.
     *
     * ⚠ SÓ O PERFIL. Nada de orçamento, diário ou lançamento é tocado — é o
     *   que a tela promete, e é o que faz esta porta ser segura de oferecer a
     *   alguém já assustado com o sistema mudado.
     * ================================================================== */
    recuperarPerfilDeBackup: function (file) {
      if (typeof Perfis === "undefined" || !Perfis.doBackup) {
        UI.toast("Esta versão do OrçaPRO ainda não sabe recuperar perfil. Feche e abra o programa para concluir a atualização.", "erro");
        return;
      }
      if (typeof Auth !== "undefined" && Auth.ehAdmin && !Auth.ehAdmin()) {
        UI.toast("Só o administrador da conta pode recuperar o perfil de implantação.", "erro");
        return;
      }
      var self = this, rd = new FileReader();
      rd.onerror = function () { UI.toast("Não consegui ler o arquivo.", "erro"); };
      rd.onload = function () {
        var dump;
        try { dump = JSON.parse(rd.result); }
        catch (e) { UI.toast("Esse arquivo não é um backup do OrçaPRO (não é .json válido).", "erro"); return; }
        var achado = null;
        try { achado = Perfis.doBackup(dump); } catch (e2) { achado = null; }
        if (!achado) {
          UI.toast("Esse backup não tem perfil de implantação gravado — ele foi feito com o sistema completo.", "aviso");
          return;
        }
        /* ⚠ O ID SOZINHO NÃO SERVE, e meio conserto é pior que nenhum: sem a
           lista de módulos a conta apontaria para um perfil que a máquina não
           sabe expandir, e a barra continuaria mostrando tudo — com a tela
           dizendo que deu certo. */
        if (achado.soPrefs) {
          UI.modal("Backup antigo demais", '<p>Este backup sabe que o perfil era <b>' + Util.esc(achado.perfil) +
            "</b>, mas foi gerado por uma versão que não guardava a lista de módulos junto.</p>" +
            '<p class="muted">Escolha um backup mais recente, de antes de o sistema ter voltado ao completo. ' +
            "Se não houver nenhum, fale com o suporte: a lista pode ser reenviada.</p>",
            [{ texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } }]);
          return;
        }
        var atualId = "";
        try { atualId = Perfis.idAtual(); } catch (e3) {}
        if (atualId === achado.perfil) {
          UI.toast("Esta conta já está com esse perfil (" + (achado.nome || achado.perfil) + ").", "ok");
          return;
        }
        /* ⚠ A MESMA CONTA DA TELA DE PERFIL. Este bloco recalculava por fora e
           ignorava o reboque de dependências: dizia "9 módulos" onde a barra
           mostrava 10, sobre o mesmo perfil. */
        var qtd = achado.modulos ? Perfis.contar(achado.modulos) : 0;
        var quando = "";
        try { quando = achado.em ? new Date(achado.em).toLocaleString("pt-BR") : ""; } catch (e4) {}
        UI.modal("Recuperar o perfil do sistema",
          "<p>Este backup" + (quando ? " (de <b>" + Util.esc(quando) + "</b>)" : "") + " guarda o perfil:</p>" +
          '<div class="card" style="padding:10px 12px"><b>' + Util.esc(achado.nome || achado.perfil) + "</b>" +
          (qtd ? ' <span class="muted">— ' + qtd + " módulos</span>" : "") + "</div>" +
          '<p class="muted" style="margin-top:10px">Aplicar isto mexe <b>somente</b> no que aparece na barra lateral. ' +
          "Nenhum orçamento, diário ou lançamento é alterado, e voltar para “Completo” continua disponível depois.</p>",
          [{ texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
           { texto: "Recuperar este perfil", classe: "primary", onClick: function () {
              var r = Perfis.restaurar(achado);
              UI.fecharModal();
              if (!r.ok) { UI.toast(r.erro || "Não consegui recuperar o perfil.", "erro"); return; }
              /* ⚠ o registro sobe com carimbo NOVO: é o que faz o conserto
                 chegar aos outros aparelhos da conta em vez de ser desfeito
                 pelo merge na próxima sincronização */
              try { if (typeof Nuvem !== "undefined" && Nuvem.sincronizar) Nuvem.sincronizar(); } catch (e5) {}
              UI.toast("Perfil “" + (r.perfil && r.perfil.nome || achado.perfil) + "” recuperado. A barra volta ao normal agora.", "ok");
              try { self.render(); } catch (e6) {}
           } }]);
      };
      rd.readAsText(file);
    },

    importarBackup: function (file) {
      /* PACOTE DE ORÇAMENTO (tipo "pacote-orcamento"): lido primeiro, porque
         ele NÃO precisa da guarda de admin abaixo — só traz orçamento, cliente e
         obra, e o leitor reprova qualquer outra entidade (js/pacote.js). O backup
         completo continua exigindo administrador, como sempre. */
      if (typeof Pacote !== "undefined" && file) {
        var selfP = this, rdP = new FileReader();
        rdP.onload = function () {
          var dumpP = null;
          try { dumpP = JSON.parse(rdP.result); } catch (eP) { dumpP = null; }
          if (dumpP && Pacote.ehModelo && Pacote.ehModelo(dumpP)) { Pacote.importarModelo(dumpP); return; }
          if (dumpP && Pacote.ehPacote(dumpP)) {
            if (!(Auth.usuario() && Auth.podeModulo && Auth.podeModulo("orcamentos"))) { UI.toast("Você não tem acesso a Orçamentos.", "erro"); return; }
            Pacote.confirmarEAplicar(dumpP, "arquivo: " + (file.name || ""));
            return;
          }
          selfP._importarBackupCompleto(file);
        };
        rdP.readAsText(file);
        return;
      }
      this._importarBackupCompleto(file);
    },
    _importarBackupCompleto: function (file) {
      /* ⚠ O PAR ESTAVA ASSIMÉTRICO. `abrirBackup` e `exportarBackup` ganharam a
         guarda de administrador na auditoria de 15/08 (js/app.js:2101 e :2244),
         mas a IMPORTAÇÃO ficou de fora — e ela é o lado que ESCREVE. Um arquivo
         .json escolhido pelo usuário reescreve `equipe` (modulos, aprovador,
         ativo, senhaHash) e `conta` (e-mail e senha do administrador): quem
         importa se promove a admin e troca a senha do dono. Ler exigia ser
         admin; gravar não exigia nada. */
      if (typeof Auth !== "undefined" && Auth.ehAdmin && !Auth.ehAdmin()) {
        UI.toast("Só o administrador da conta pode importar backup.", "erro");
        return;
      }
      var self = this, rd = new FileReader();
      rd.onload = function () {
        try {
          var dump = JSON.parse(rd.result);
          var orcs = Util.arr(dump.orcamentos);
          var temPropria = !!(dump.basePropria && Util.arr(dump.basePropria.dados).length);
          var temGestao = !!(dump.gestao && Object.keys(dump.gestao).length);
          /* backup SÓ com composições próprias é válido: é exatamente o arquivo
             que a página de socorro produz num aparelho que perdeu a base.
             E backup SÓ com Gestão também: a conta que usa obras/diários sem
             orçamento nenhum era rejeitada aqui com o próprio arquivo na mão. */
          if (!orcs.length && !temPropria && !temGestao) { UI.toast("Backup sem orçamentos, sem composições próprias e sem dados da Gestão.", "erro"); return; }
          var eid = Auth.empresaId();
          /* ===== v1.1.236 — O MAIS NOVO VENCE, TAMBÉM AQUI =====
             O modal promete, com estas palavras: "Importar restaura/mescla o
             conteúdo do arquivo nesta conta — nada é apagado." As outras duas
             metades desta mesma função honravam isso (a Gestão logo abaixo, a
             base própria por criadoEm). A dos ORÇAMENTOS não tinha guarda
             nenhuma e `Store.salvarOrcamento` substitui o registro inteiro
             pelo id: importar o backup de segunda para recuperar um orçamento
             apagado por engano levava junto a semana de trabalho de OUTRO
             orçamento — que voltava de 51 itens para 1, sem aviso, com o toast
             dizendo "1 orçamento(s) restaurado(s)".
             E o carimbo do arquivo é preservado, senão o retrocesso venceria o
             merge da nuvem e viajaria para os outros aparelhos. */
          var _idxOrc = {};
          try { Store.listarOrcamentos(eid).forEach(function (x) { if (x && x.id) _idxOrc[x.id] = String(x.atualizadoEm || ""); }); } catch (eI) {}
          var nOrc = 0, orcMantidos = 0;
          orcs.forEach(function (o) {
            if (!o || !o.id) return;
            if (_idxOrc[o.id] != null && _idxOrc[o.id] >= String(o.atualizadoEm || "")) { orcMantidos++; return; }
            Store.salvarOrcamento(eid, o, true);
            nOrc++;
          });
          var rProp = temPropria ? self._restaurarPropria(eid, dump.basePropria) : null;
          /* ===== v1.1.232 — A GESTÃO VOLTA. O _dumpBackup grava `gestao` com
             TODAS as entidades desde 09/08, mas a restauração nunca a leu: o
             cliente que trocasse de máquina importava o arquivo — que CONTINHA
             os diários, medições, financeiro e folha — via "N orçamento(s)
             restaurado(s)" e encontrava a Gestão vazia. O dado estava no
             arquivo; o app não o devolvia. Exatamente o buraco que o backup
             prometeu fechar.
             MESCLA por id, nunca substitui: Store.salvar já une pelo id, e o
             que existe no aparelho e não está no arquivo continua onde está.
             O registro do arquivo entra com o próprio atualizadoEm — se o
             aparelho tem versão mais nova, a nuvem resolve no próximo merge. */
          /* ===== v1.2 — A MESMA MESCLA, EM UMA GRAVAÇÃO POR MÓDULO =====
             ⚠ ANTES ERA O(N²) E CONGELAVA A ABA NO PIOR MOMENTO. O laço
             chamava `Store.obter` (getItem + JSON.parse do array inteiro) E
             `Store.salvar` (outro parse + JSON.stringify + setItem do array
             inteiro, que cresce a cada volta) para CADA registro do arquivo.
             Backup de 3 anos (12.000 registros): 24.000 JSON.parse, 12.000
             JSON.stringify, ~1,28 GB gravados e ~9,5 s de tela parada sem
             barra de progresso — quem acabou de trocar de máquina conclui que
             o backup não funcionou e fecha a aba no meio.
             Agora é 1 leitura para o índice + 1 gravação por módulo, via
             `Store.salvarVarios` (o espelho do `excluirVarios`, que já fazia
             isso do lado do excluir).
             A SEMÂNTICA NÃO MUDA — é a mesma de sempre, só que a comparação
             usa um índice em memória em vez de reler o disco por registro. */
          var nGest = 0, entsGest = 0;
          var nPulados = 0;   // usuários do backup que ficaram de fora por falta de vaga
          if (temGestao) {
            Object.keys(dump.gestao).forEach(function (ent) {
              var lista = Util.arr(dump.gestao[ent]);
              if (!lista.length) return;
              entsGest++;
              try {
                var idx = Object.create(null);   // { id: atualizadoEm } — UMA leitura da entidade
                Store.listar(eid, ent).forEach(function (x) {
                  if (x && x.id != null) idx[String(x.id)] = String(x.atualizadoEm || "");
                });
                var vagasEquipe = (ent === "equipe" && typeof Gestao !== "undefined" && Gestao._vagasBackup) ? Gestao._vagasBackup() : null, puladosB = Object.create(null);   // null = sem trava; cada id pulado conta uma vez
                var entram = [];
                lista.forEach(function (reg) {
                  if (!reg || !reg.id) return;
                  var k = String(reg.id);
                  /* o mais novo vence — restaurar backup velho por cima de
                     trabalho recente seria trocar um dado bom por um velho */
                  if (idx[k] != null && idx[k] >= String(reg.atualizadoEm || "")) return;
                  /* usuário NOVO do backup ocupa vaga (licença independente e titular
                     com cota); o que já existe e o cliente padrão nunca são barrados */
                  if (vagasEquipe !== null && idx[k] == null) {
                    if (vagasEquipe <= 0) { if (!puladosB[k]) { puladosB[k] = 1; nPulados++; } return; }
                    vagasEquipe--;
                  }
                  /* o índice é atualizado aqui porque o laço antigo relia o
                     disco: um arquivo com DOIS registros do mesmo id comparava
                     o segundo com o primeiro que acabara de entrar. Sem esta
                     linha o arquivo duplicado mudaria de resultado. */
                  idx[k] = String(reg.atualizadoEm || Util.agoraISO());
                  entram.push(reg);
                });
                /* ⚠ O 4º argumento é o que faz o comentário lá em cima ser
                   verdade. Sem ele o registro de 01/08 entrava carimbado com
                   a hora de AGORA e vencia, no merge seguinte, a versão de
                   20/08 que estava na nuvem — em todos os aparelhos.
                   E o retorno é contado, não ignorado: com o armazenamento
                   cheio `salvarVarios` devolve 0 e avisa UMA vez, em vez de
                   um toast por registro com o resumo mentindo "N restaurado(s)". */
                /* ⚠ E A EXCLUSÃO PRECISA SER DESFEITA JUNTO. Restaurar backup
                   para trazer de volta o que foi apagado por engano é a razão
                   nº 1 de alguém restaurar backup — e a lápide local sobrevive
                   à restauração (`_lapides` está fora do backup, de propósito).
                   Sem esta linha o registro volta ao disco, a tela diz
                   "1 restaurado(s)", e o PRIMEIRO SYNC o apaga de novo em todos
                   os aparelhos, porque o carimbo do arquivo é mais antigo que o
                   da exclusão. Ver `Store.desenterrar`. */
                try {
                  Store.desenterrar(eid, ent, entram.map(function (x) { return x.id; }));
                } catch (eD) {}
                nGest += Store.salvarVarios(eid, ent, entram, true);
              } catch (eG) {}
            });
          }
          if (nPulados) { try { var cotaT = (typeof Gestao !== "undefined" && Gestao._cotaUsuarios) ? Gestao._cotaUsuarios() : {}; UI.toast(nPulados + " usuário(s) do backup ficaram de fora: " + (cotaT.tipo === "equipe" && !cotaT.max ? "a licença independente não cadastra usuários." : (cotaT.tipo === "equipe" ? "os usuários da empresa que o seu plano permite já estão cadastrados." : "todas as vagas da sua equipe estão em uso.")), "erro"); } catch (eTp) {} }
          if (dump.prefs && typeof dump.prefs === "object") {
            var atual = Store.lerPrefs(eid) || {};
            for (var k in dump.prefs) if (atual[k] == null) atual[k] = dump.prefs[k];
            Store.salvarPrefs(eid, atual);
          }
          UI.toast(nOrc + " orçamento(s) restaurado(s)" + (nPulados ? " · " + nPulados + " usuário(s) do backup ficaram de fora por falta de vaga" : "")
            + (orcMantidos ? " (" + orcMantidos + " já estava(m) mais novo(s) aqui e foi(ram) mantido(s))" : "")
            + (rProp ? " · composições próprias: " + rProp.novos + " nova(s), " + rProp.atualizados + " atualizada(s), " + rProp.total + " no total" : "")
            + (temGestao ? " · Gestão: " + nGest + " registro(s) em " + entsGest + " módulo(s)" : "") + ".", "ok");
          /* ⚠ O PERFIL DO ARQUIVO FOI DESCARTADO E NINGUÉM DIZIA. A regra do
             "mais novo vence" acima é certa para dado de obra, mas o registro
             do perfil que está na conta AGORA é sempre mais novo que o do
             backup — então quem importa o próprio backup justamente para
             recuperar o sistema enxugado recebe "restaurado(s)" e continua
             com os 34 módulos. Ficava parecendo backup que não presta.
             Aqui o descarte é DITO, com o caminho que resolve. */
          try {
            var doArq = (typeof Perfis !== "undefined" && Perfis.doBackup) ? Perfis.doBackup(dump) : null;
            if (doArq && doArq.perfil && doArq.perfil !== "completo" && doArq.perfil !== Perfis.idAtual()) {
              setTimeout(function () {
                UI.toast("Este backup guarda o perfil “" + (doArq.nome || doArq.perfil) + "”, que NÃO foi aplicado — "
                  + "restaurar mantém o mais recente. Para trazê-lo de volta, use “Perdeu a versão enxugada do seu sistema?” no Backup.", "aviso");
              }, 2600);
            }
          } catch (ePf) {}
          UI.fecharModal(); self.tela = "lista"; self.render();
        } catch (e) { UI.toast("Arquivo inválido: " + e.message, "erro"); }
      };
      rd.readAsText(file);
    },

    // ---------- Licença ----------
    abrirLicenca: function () {
      var self = this;
      UI.modal("" + (typeof Icones !== "undefined" ? Icones.get("chave", 15) : "") + " Licença do OrçaPRO", UI.renderLicenca(Licenca.status()), [
        { texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
        { texto: "Ativar", classe: "primary", onClick: function () { self.salvarLicenca(); } }
      ]);
      /* RENOVAÇÃO AUTOMÁTICA NO CARTÃO (js/assinatura.js): preenche o espaço
         que o renderLicenca reservou, depois de perguntar ao servidor quanto
         custa e se esta licença pode assinar. Sem o módulo (pacote antigo) ou
         sem internet, o espaço fica vazio e a tela é a de sempre — este bloco
         nunca pode impedir a pessoa de colar a chave dela. */
      try { if (typeof Assinatura !== "undefined") Assinatura.montar("assin-box"); } catch (eAs) {}
    },
    salvarLicenca: function () {
      var chave = (UI.el("lic-chave") || {}).value || "";
      if (!Util.naoVazio(chave)) { UI.toast("Cole a chave de licença.", "erro"); return; }
      var self = this;
      UI.toast("Ativando licença…", "ok");
      Licenca.ativarOnline(chave, function (r) {
        if (!r.ok) { UI.toast(r.erro || "Chave inválida.", "erro"); return; }
        UI.fecharModal();
        /* ⚠ licença nova = EMPRESA nova na nuvem (a conta é derivada da chave).
           Sem largar a sessão antiga, o aparelho continuaria falando com o tenant
           da licença velha até alguem fechar o app. */
        try { if (typeof Nuvem !== "undefined" && Nuvem.trocouDeLicenca) Nuvem.trocouDeLicenca(); } catch (eN) {}
        try { self._nuvemTentativa = 0; self._conectarNuvemLicenca(); } catch (eC) {}
        UI.toast(r.offline ? "" + (typeof Icones !== "undefined" ? Icones.get("check", 15) : "") + " Licença ativada." : "" + (typeof Icones !== "undefined" ? Icones.get("check", 15) : "") + " Licença ativada e vinculada a esta máquina!", "ok");
        self.render();
      });
    },

    // ---------- Atualização do sistema (auto-update: avisa e o cliente baixa, sem perder dados) ----------
    /* ⚠ DUAS FONTES, VALE A MAIOR — e isso não é excesso de zelo.
     *   Esta checagem perguntava só ao VPS (`/api/versao`), que é alimentado
     *   à mão. Ele ficou parado na 1.2.37 enquanto a frota já ia na 1.2.45:
     *   quem estivesse numa versão anterior à 37 recebia o convite para
     *   baixar um pacote OITO versões atrasado, com link para um Release
     *   velho. O manifesto da frota (`CONFIG.manifestoUrl`) é a mesma
     *   verdade que o servidor local usa para se atualizar sozinho, e é
     *   publicado junto com o código — não tem como ficar para trás.
     *
     *   As duas respostas são comparadas e vence a MAIOR versão; falha de
     *   uma não derruba a outra (`Promise.all` com catch por fonte). Se as
     *   duas falharem, fica quieto, como já ficava. */
    checarAtualizacao: function () {
      try {
        if (this._demo) return;
        if (typeof fetch === "undefined" || typeof CONFIG === "undefined") return;
        var self = this, atual = (CONFIG.versao || "1.0.0");
        var srv = CONFIG.licencaServer ? String(CONFIG.licencaServer).replace(/\/$/, "") : "";
        var man = CONFIG.manifestoUrl || "";
        var pega = function (url, mapear) {
          if (!url) return Promise.resolve(null);
          return fetch(url, { cache: "no-store" })
            .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
            .then(mapear).catch(function () { return null; });
        };
        Promise.all([
          pega(srv ? (srv + "/api/versao") : "", function (d) {
            return (d && d.versao) ? { versao: d.versao, downloadUrl: d.downloadUrl || "", novidades: d.novidades || "" } : null;
          }),
          /* o manifesto da frota fala "versao"/"zip"/"notas" — o mesmo dado,
             outro vocabulário, porque quem o consome de verdade é o servidor
             local, não esta tela */
          pega(man, function (d) {
            return (d && d.versao) ? { versao: d.versao, downloadUrl: d.instalador || d.zip || "", novidades: d.notas || "" } : null;
          })
        ]).then(function (rs) {
          var melhor = null;
          rs.forEach(function (d) {
            if (!d || !d.versao) return;
            if (!melhor || self._versaoMaior(d.versao, melhor.versao)) melhor = d;
          });
          if (melhor && self._versaoMaior(melhor.versao, atual)) self._avisarAtualizacao(melhor);
        }).catch(function () {});
      } catch (e) {}
    },
    _versaoMaior: function (a, b) {
      var pa = String(a).split("."), pb = String(b).split(".");
      for (var i = 0; i < 3; i++) { var x = parseInt(pa[i] || 0, 10), y = parseInt(pb[i] || 0, 10); if (x > y) return true; if (x < y) return false; }
      return false;
    },
    _avisarAtualizacao: function (d) {
      /* ⚠ o MOTIVO da atualização não entra aqui — ver a nota em js/autoupdate.js.
         `d.novidades` continua chegando do servidor (quem acompanha release usa),
         só não é mostrado a quem está orçando. */
      var html = "<p>Uma versão nova do OrçaPRO (<b>" + Util.esc(d.versao) + "</b>) está disponível! 🎉</p>" +
        "<p class=\"muted\" style=\"margin-top:10px\">Pode atualizar tranquilo: <b>seus orçamentos e dados continuam salvos</b> (ficam no seu navegador).</p>";
      var botoes = [{ texto: "Agora não", classe: "ghost", onClick: function () { UI.fecharModal(); } }];
      if (d.downloadUrl) botoes.push({ texto: "" + (typeof Icones !== "undefined" ? Icones.get("baixar", 15) : "") + " Baixar atualização", classe: "primary", onClick: function () { window.open(d.downloadUrl, "_blank"); UI.fecharModal(); } });
      UI.modal("" + (typeof Icones !== "undefined" ? Icones.get("ciclo", 15) : "") + " Atualização disponível", html, botoes);
    },

    // ---------- Empresa / Responsável Técnico ----------
    abrirEmpresa: function () {
      var self = this;
      this._logoPendente = undefined; // undefined=inalterado · string=novo logo
      var bg = UI.modal("" + (typeof Icones !== "undefined" ? Icones.get("ajustes", 15) : "") + " Empresa / Responsável Técnico", UI.renderEmpresa(Empresa.dados(), Empresa.logo()), [
        { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
        { texto: "Salvar", classe: "primary", onClick: function () { self.salvarEmpresa(); } }
      ]);
      var m = bg && bg.querySelector(".modal"); if (m) m.style.maxWidth = "660px";
    },
    salvarEmpresa: function () {
      var dados = {};
      Empresa.campos.forEach(function (k) { var el = UI.el("emp-" + k); dados[k] = el ? el.value : ""; });
      Empresa.salvar(dados, this._logoPendente);
      // White-label dos entregáveis (créditos / marca d'água / QR)
      var elC = UI.el("emp-doc-creditos"), elQ = UI.el("emp-doc-qr"), elW = UI.el("emp-doc-wm");
      if (elC && Empresa.salvarDocsCfg) Empresa.salvarDocsCfg({ creditos: elC.checked, qr: elQ ? elQ.checked : true, marcaDagua: elW ? elW.value : "empresa" });

      /* ---------- PERFIL DE IMPLANTAÇÃO ----------
       * ⚠ SÓ O DONO. `abrirEmpresa` e o `case "empresa"` do dispatcher não
       *   checam `ehAdmin()` — a proteção do menu é visual. Guarda em função
       *   aqui, porque o perfil muda o que a empresa INTEIRA enxerga.
       * ⚠ `Perfis.aplicar` grava e não redesenha: sem o `render()` abaixo o
       *   dono trocaria o perfil, veria o toast e a barra continuaria igual. */
      var perfilMudou = false;
      if (typeof Perfis !== "undefined" && (typeof Auth === "undefined" || !Auth.ehAdmin || Auth.ehAdmin())) {
        var escolhido = document.querySelector('input[name="emp-perfil"]:checked');
        var novoPerfil = escolhido ? escolhido.value : null;
        if (novoPerfil && novoPerfil !== Perfis.idAtual()) {
          var rp = Perfis.aplicar(novoPerfil);
          if (rp.ok) { perfilMudou = true; }
          else { UI.toast("Não foi possível aplicar o perfil: " + rp.erro, "erro"); }
        }
        /* ⚠ SEMEAR GRAVA NÚMERO DE UMA EMPRESA REAL. A semente do perfil de
           cliente traz preço de mão de obra, política de remuneração e o padrão
           de privacidade do Portal. Isso pertence à conta daquele cliente e a
           mais ninguém: na vitrine não se semeia nada, e o que se semeia é
           sempre o perfil DESTA conta — nunca um id vindo de outro lugar. */
        var semear = this._demo ? null : UI.el("emp-perfil-semear");
        if (semear && semear.checked) {
          var rs = Perfis.semear(Perfis.idAtual());
          if (rs.ok && rs.semeadas && rs.semeadas.length) {
            UI.toast("Parâmetros de fábrica preenchidos (" + rs.semeadas.length + ").", "ok");
          } else if (rs.ok) {
            UI.toast("Os parâmetros já estavam preenchidos — nada foi sobrescrito.", "ok");
          }
        }
      }

      UI.fecharModal();
      UI.toast("Dados da empresa salvos. Aparecem nos documentos.", "ok");
      if (perfilMudou) { UI.toast("Perfil aplicado — a barra de módulos mudou.", "ok"); this.render(); }
    },

    /* ===================================================================
     * ABRIR A VERSÃO DE UM CLIENTE (prévia)
     *
     * ⚠ SÓ EXISTE ONDE O CATÁLOGO PRIVADO ESTÁ (venda/perfis-clientes.js).
     *   `PreviewCli.disponiveis()` devolve lista vazia sem ele, e aí nem o
     *   item de menu nasce. Ver o cabeçalho de js/previewcli.js.
     * =================================================================== */
    abrirPrevia: function () {
      if (typeof PreviewCli === "undefined") return;
      var disp = PreviewCli.disponiveis();
      if (!disp.length) { UI.toast("Nenhuma versão de cliente disponível nesta máquina.", "erro"); return; }
      var self = this;
      var corpo = "<p>Abre o sistema como o cliente o vê, com <b>dados de exemplo</b>. "
        + "Nada aqui toca a sua conta, a do cliente ou a nuvem — e sair é recarregar a página.</p>"
        + '<div style="display:grid;gap:6px;margin-top:10px">'
        + disp.map(function (p2) {
          return '<label class="opt-linha" style="font-size:13px"><input type="radio" name="prev-perfil" value="'
            + Util.esc(p2.id) + '"' + (p2 === disp[0] ? " checked" : "") + "> <span><b>"
            + Util.esc(p2.nome) + "</b><br><span class=\"muted\" style=\"font-size:11.5px\">"
            + Util.esc(p2.desc || "") + "</span></span></label>";
        }).join("") + "</div>"
        + '<label class="flex" style="gap:8px;align-items:center;margin-top:10px"><input type="checkbox" id="prev-zerar"> '
        + '<span class="muted">Começar do zero (apaga o que foi mexido na prévia anterior)</span></label>';
      UI.modal("Ver a versão de um cliente", corpo, [
        { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
        { texto: "Abrir", classe: "primary", onClick: function () {
          var sel = document.querySelector('input[name="prev-perfil"]:checked');
          if (!sel) return;
          var zerar = UI.el("prev-zerar");
          if (zerar && zerar.checked) PreviewCli.limpar(sel.value);
          var r = PreviewCli.entrar(sel.value);
          if (!r.ok) { UI.toast(r.erro || "Não consegui abrir a prévia.", "erro"); return; }
          UI.fecharModal();
          /* volta para o Painel: a tela em que estava pode não existir no perfil
             do cliente, e render numa view oculta dá tela vazia sem explicação */
          self.view = "dashboard";
          self.tela = "gestao";
          self.render();
          UI.toast("Vendo a versão de " + (r.perfil.nome || "cliente") + ".", "ok");
        } }
      ]);
    },

    // ---------- Atualizar tabelas (backend sinapi-fetcher) ----------
    abrirAtualizar: function () {
      var bg = UI.modal("" + (typeof Icones !== "undefined" ? Icones.get("ciclo", 15) : "") + " Atualizar Tabelas de Preço", '<div id="atz-body" class="muted">Verificando o backend (sinapi-fetcher :3040)…</div>',
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

    /* ⚠ ALVO ÚNICO de toda gravação no cronograma: duração, "Depende de",
       Recalcular, Limpar edições, Execução → Enviar ao cronograma e Refinar
       com IA passam TODOS por aqui, e nenhum deles toca `orcAtual.cronograma`
       direto. Motivo (espec v2, 3.2): com o orçamento APROVADO e obra
       vinculada, as edições vão para o PLANO DE EXECUÇÃO da obra, e a
       proposta aprovada fica intacta. Se cada handler escolhesse o próprio
       destino, bastaria um esquecido para a obra em andamento ser replanejada
       por baixo do contrato (ou para o plano da obra nunca receber a edição).
       A decisão é pura (CronoExecUI.decidirAlvo, testada executando):
       - aprovado + obra ligada a ESTE orçamento + plano → tipo "plano";
       - aprovado + obra sem plano → "orc" travado (a faixa oferece [Iniciar
         plano de execução da obra]; até lá, a trava de hoje com a revisão);
       - obra numa revisão ANTERIOR, várias obras sem escolha, sem obra, sem
         Gestão → "orc" como antes (a faixa diz a porta);
       - não aprovado → "orc"; com plano, a pessoa pode escolher editá-lo
         (estado de tela `_cronoEditaPlano`).
       {tipo, orc (o que o motor calcula — no plano, o clone de
       CronoBase.orcComPlano, com o cronograma DO PLANO por referência), cron
       (o objeto que se grava — sempre existe), travado, salvar(opts) → true se
       gravou, decisao, obra, plano, inicioObra}. */
    _cronoAlvo: function () {
      var o = this.orcAtual; if (!o) return null;
      if (!o.cronograma || typeof o.cronograma !== "object" || Array.isArray(o.cronograma)) o.cronograma = {};
      var self = this;
      var travado = !!(typeof Orcamento !== "undefined" && Orcamento.travadoPorAprovacao && Orcamento.travadoPorAprovacao(o));
      var dec = this._cronoDecisao(o, travado);
      var alvo = {
        tipo: "orc", orc: o, cron: o.cronograma, travado: travado,
        salvar: function (opts) { return self.persistir(opts); },
        decisao: dec, obra: dec ? dec.obra : null, plano: dec ? dec.plano : null
      };
      if (!dec || dec.tipo !== "plano" || !dec.plano || typeof CronoBase === "undefined") return alvo;
      var pl = dec.plano, oP = CronoBase.orcComPlano(o, pl);
      if (!oP) return alvo;   // plano sem cronograma: fica a trava de hoje
      /* ⚠ A OBRA É O CENTRO: o plano conta do início DA OBRA. Quem mais lê o
         plano (painel, linha de base, Last Planner) calcula com o override
         {dataInicio: obra.inicio}; sem alinhar aqui, esta aba desenharia o
         plano com a data da proposta e o painel com a da obra — duas datas
         para a mesma subetapa. O campo Início do cartão fica só leitura
         (mudar é no cadastro da obra). O plano é relido do Store a cada
         chamada, então isto só vai ao disco junto com a edição seguinte. */
      var ini = this._cronoInicioObra(dec.obra);
      if (ini) {
        var cr = oP.cronograma;
        if (!cr.params || typeof cr.params !== "object" || Array.isArray(cr.params)) cr.params = {};
        cr.params.dataInicio = ini;
      }
      return {
        tipo: "plano", orc: oP, cron: oP.cronograma, travado: false, decisao: dec, obra: dec.obra, plano: pl, inicioObra: ini,
        salvar: function (opts) { return self._cronoSalvarPlano(oP, pl, dec.obra, opts); }
      };
    },
    /* a obra do orçamento aberto e o que fazer com ela — lê o Store e chama a
       decisão pura. Sem ui.js/CronoExecUI (teste que monta só o app.js, cache
       velho): null, e o alvo é o orçamento como antes. */
    _cronoDecisao: function (o, travado) {
      if (typeof UI === "undefined" || typeof UI._cronoObraInfo !== "function" || typeof CronoExecUI === "undefined" || !CronoExecUI.decidirAlvo) return null;
      var info = null;
      try { info = UI._cronoObraInfo(o); } catch (eI) { info = null; }
      if (!info) return null;
      var lista = [], nivel0 = false;
      (info.obras || []).forEach(function (a) { if (a && a.nivel === 0) nivel0 = true; });
      // o planejamento das obras só é lido quando há obra ligada a ESTE orçamento (é a única que pode ter plano aqui)
      if (info.podeGestao && nivel0 && typeof CronoBase !== "undefined") {
        try { lista = Store.listar(Auth.empresaId(), CronoBase.ENTIDADE) || []; } catch (eL) { lista = []; }
      }
      var sel = (this._cronoObraSel && typeof this._cronoObraSel === "object") ? this._cronoObraSel[o.id] : null;
      var ed = !!(this._cronoEditaPlano && typeof this._cronoEditaPlano === "object" && this._cronoEditaPlano[o.id] === true);
      var dec = CronoExecUI.decidirAlvo({ info: info, travado: travado, escolha: sel, editaPlano: ed, lista: lista,
        CronoBase: typeof CronoBase !== "undefined" ? CronoBase : null });
      dec.info = info;
      return dec;
    },
    _cronoInicioObra: function (obra) {
      var s = obra && obra.inicio, m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s == null ? "" : s).slice(0, 10));
      if (!m) return null;
      var d = new Date(+m[1], +m[2] - 1, +m[3]);
      return (d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3]) ? m[0] : null;
    },
    _cronoPor: function () {
      var u = null;
      try { u = (typeof Auth !== "undefined" && Auth.usuario) ? Auth.usuario() : null; } catch (eU) { u = null; }
      return String((u && (u.nome || u.email)) || "").slice(0, 60);
    },
    /* o orçamento que os DOCUMENTOS da aba (PDF, MS Project) imprimem: o que
       está na tela — no plano de execução, o plano (senão o engenheiro
       editaria o plano e imprimiria a proposta) */
    _cronoOrcDoc: function () {
      var a = null;
      try { a = this._cronoAlvo(); } catch (eA) { a = null; }
      return (a && a.tipo === "plano" && a.orc) ? a.orc : this.orcAtual;
    },
    /* grava o PLANO DE EXECUÇÃO da obra (o `salvar` do alvo "plano").
       ⚠ Nunca pelo persistir: ele grava o ORÇAMENTO (e no aprovado abre o
       modal da revisão). Aqui: a mesma trava de licença do persistir; o modo
       executivo materializado NO PLANO (a regra do salvar do orçamento, para o
       gravado bater com a tela); o teto do plano e o da entidade
       (CronoBase.salvarPlano — recusa com os números e sem gravar nada); e o
       carimbo que o motor pôs (manterCarimbo). true só se gravou. */
    _cronoSalvarPlano: function (oP, pl, obra, opts) {
      var nome = String((obra && obra.nome) || "sem nome");
      if (this._trialBloqueado()) {
        var sSus = (typeof Licenca !== "undefined" && Licenca.status) ? (Licenca.status() || {}) : {};
        if (sSus.suspensa && this._avisoTrial) this._avisoTrial();
        else UI.toast("Modo demonstração — para salvar, ative sua licença (🔑). O plano de execução da obra " + nome + " não foi gravado.", "erro");
        return false;
      }
      if (typeof CronoBase === "undefined" || typeof Store.salvarVarios !== "function") {
        UI.toast("Módulo do planejamento da obra não carregado (cronobase.js) — o plano de execução não foi gravado. Recarregue o app.", "erro");
        return false;
      }
      /* ⚠ o desfazer da IA no PLANO segue a regra do orçamento: a primeira
         gravação que NÃO é da própria tela da IA apaga o retrato — edição de
         gente depois da IA viraria um desfazer que reverte o que ninguém lembra */
      if (!(opts && opts.daIA) && typeof IAEdit !== "undefined") IAEdit.limparDesfazer(pl);
      var m = null;
      try { m = Cronograma.materializar(oP); } catch (eM) { m = null; }
      var eid = Auth.empresaId(), lista = null;
      try { lista = Store.listar(eid, CronoBase.ENTIDADE) || []; } catch (eL) { lista = null; }
      /* ⚠ lista ilegível NÃO vira []: a porta do espaço mediria a entidade
         vazia e deixaria passar o que não cabe */
      if (lista === null) { UI.toast("Não consegui ler o planejamento das obras deste aparelho — o plano de execução da obra " + nome + " não foi gravado. Recarregue o app.", "erro"); return false; }
      var antes = opts && opts.cronoAntes;
      /* ⚠ O PRAZO DE ANTES SAI DO PLANO GRAVADO quando a tela não o mediu
         (revisão 3, navegador): a duração da Fundação ia de 20 para 30 no
         plano, o prazo de 60 para 70 dias úteis, e nenhum recado — só o
         Recalcular do modo executivo passava o "antes". O gravado é o que está
         na lista lida ANTES de gravar, com o MESMO início da obra que a tela
         usa (senão o recado acusaria mudança que é só o alinhamento da data). */
      if (!antes) {
        try {
          var velho = CronoBase.plano(lista, pl.obraId), oV = velho ? CronoBase.orcComPlano(oP, velho) : null;
          if (oV) {
            oV.cronograma = JSON.parse(JSON.stringify(oV.cronograma));
            var iniV = this._cronoInicioObra(obra);
            if (iniV) { if (!oV.cronograma.params || typeof oV.cronograma.params !== "object" || Array.isArray(oV.cronograma.params)) oV.cronograma.params = {}; oV.cronograma.params.dataInicio = iniV; }
            antes = Cronograma.estimar(oV);
          }
        } catch (eV) { antes = null; }
      }
      var r = CronoBase.salvarPlano(lista, pl, { agora: Util.agoraISO(), por: this._cronoPor() });
      if (!r.ok) { UI.toast("O plano de execução da obra " + nome + " NÃO foi gravado: " + r.erro, "erro"); return false; }
      if (!Store.salvarVarios(eid, CronoBase.ENTIDADE, r.gravar, true)) {
        UI.toast("O plano de execução da obra " + nome + " NÃO foi gravado — o armazenamento deste aparelho recusou (cheio?). Nada mudou.", "erro");
        return false;
      }
      if (r.msg) UI.toast(r.msg, "info");
      if (antes && antes.dataFim && typeof antes.dataFim.getTime === "function") {
        var dep = null;
        try { dep = Cronograma.estimar(oP); } catch (eD) { dep = null; }
        var br = function (d) { return ("0" + d.getDate()).slice(-2) + "/" + ("0" + (d.getMonth() + 1)).slice(-2) + "/" + d.getFullYear(); };
        var aprov = false;
        try { aprov = !!(typeof Orcamento !== "undefined" && Orcamento.travadoPorAprovacao && Orcamento.travadoPorAprovacao(this.orcAtual)); } catch (eA) { aprov = false; }
        if (dep && dep.dataFim && (dep.totalDias !== antes.totalDias || dep.dataFim.getTime() !== antes.dataFim.getTime()))
          UI.toast("Plano de execução da obra " + nome + ": o prazo passou de " + antes.totalDias + " para " + dep.totalDias + " dias úteis (término " + br(antes.dataFim) + " → " + br(dep.dataFim) + "). " + (aprov ? "A proposta aprovada não muda." : "A proposta não muda."), "info");
      }
      void m;
      try { if (this.backupAuto) this.backupAuto(); } catch (eB) {}
      return true;
    },
    /* Orçamento aprovado: o handler NÃO mexe no objeto em memória. Antes a
       edição entrava na tela e o persistir recusava — do 2º clique em diante
       (o modal só aparece uma vez por abertura) a tabela mostrava durações que
       não estavam gravadas em lugar nenhum. Aqui o persistir mostra o modal da
       revisão na 1ª vez; nas seguintes, um recado; e o render devolve o valor
       gravado ao campo. */
    _cronoTravado: function (alvo) {
      var o = alvo && alvo.orc, jaAvisou = !!(o && this._avisouTravado === o.id), self = this;
      /* ⚠ a porta que o recado cita tem de EXISTIR na tela: [Iniciar plano de
         execução da obra] só aparece com a obra ligada a este orçamento, sem
         plano e com o módulo Obras (a mesma condição da faixa) */
      var dcT = alvo && alvo.decisao, obT = dcT && dcT.obra, podeIni = !!(obT && dcT.nivel === 0 && !dcT.plano && !dcT.planoAlheio && dcT.info && dcT.info.podeEditarObra);
      /* ⚠ 1ª EDIÇÃO NO APROVADO COM OBRA (revisão 3 da Fase 3, lente UX). O
         persistir abria o modal genérico "Criar revisão e editar nela" — que
         não cita o plano — e só a 2ª tentativa dizia [Iniciar plano]. Seguindo
         o botão verde, a pessoa criava uma revisão de PREÇO para replanejar
         PRAZO, e a revisão não recebia a obra (passar é recusado com boletim
         sobre o aprovado): o planejamento da obra continuava lendo o original
         — a crítica produto #1 voltando por esta porta. Com a obra ligada e
         sem plano, o modal é este: o plano da obra como caminho principal, a
         revisão como a porta para mudar a PROPOSTA, e o que acontece com a
         obra em cada uma. Uma vez por abertura (a mesma marca do persistir). */
      if (podeIni && !jaAvisou && o) {
        this._avisouTravado = o.id;
        var medsT = [];
        try { medsT = Store.listar(Auth.empresaId(), "medicoes") || []; } catch (eM) { medsT = []; }
        var blT = (typeof CronoExecUI !== "undefined" && CronoExecUI.bloqueioPassarObra) ? CronoExecUI.bloqueioPassarObra(obT, medsT, null, null) : null;
        var nomeT = String(obT.nome || ""), numT = String(o.numero || "");
        UI.modal("Orçamento aprovado — replanejar a obra ou mudar a proposta?",
          '<p style="font-size:13px">O <b>' + Util.esc(numT) + '</b> está <b>aprovado</b>: o cronograma dele é o que foi ao cliente e não muda. <b>Nada foi gravado.</b></p>' +
          '<p style="font-size:13px">Para <b>replanejar a obra ' + Util.esc(nomeT) + '</b> (chuva, atraso, outra sequência), inicie o <b>plano de execução da obra</b>: ele nasce como cópia deste cronograma, as edições desta aba passam a ir para ele e o previsto × realizado da obra compara com ele. A proposta aprovada fica intacta. Depois de iniciar, faça de novo a edição que você tentou.</p>' +
          '<p class="muted" style="font-size:12.5px">A <b>revisão</b> é para mudar a PROPOSTA (preço, quantidades, prazo contratado): nasce um orçamento novo, e a obra só passa para ele pela porta [Passar a obra para esta revisão]' +
          (blT ? ' — que será recusada enquanto a obra tiver os ' + blT.n + ' boletim(ns) de medição feitos sobre este orçamento.' : '.') + '</p>',
          [
            { texto: "Voltar sem gravar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
            { texto: "Criar revisão (muda a proposta)", classe: "", onClick: function () { UI.fecharModal(); self.criarRevisao(o); } },
            { texto: "Iniciar plano de execução da obra", classe: "primary", onClick: function () { UI.fecharModal(); self.cronoIniciarPlano(obT.id); } }
          ]);
        this.render();
        return;
      }
      this.persistir();
      if (jaAvisou) UI.toast("Orçamento " + (o && o.numero ? o.numero + " " : "") + "aprovado — o cronograma dele não muda e nada foi gravado. " +
        (podeIni ? "Para replanejar a obra " + String(obT.nome || "") + ", use [Iniciar plano de execução da obra] na linha de cima; para mudar a proposta, crie uma revisão."
          : (obT && dcT.nivel > 0 ? "A obra " + String(obT.nome || "") + " está ligada a uma revisão anterior — o plano dela se edita a partir do orçamento ligado a ela (linha de cima)." : "Para replanejar, crie uma revisão.")), "erro");
      this.render();
    },
    /* Formulário de parâmetros → objeto com SÓ os campos cujo input EXISTE.
       `el(id)` devolve o elemento ou null (em produção, UI.el). Input presente
       e vazio → null (é assim que o início volta a ser "hoje"; nos números, o
       motor usa o padrão) — EXCETO o paralelismo, em que vazio sempre foi 0
       (ver a linha dele). A lista de feriados locais vazia continua [] —
       lista vazia é o valor digitado, e todo leitor a trata como null.
       ⚠ Ler `(UI.el("cron-x") || {}).value` transformava input AUSENTE em
       valor: paralelismo virava 0 (o padrão é 0,15), o início voltava para
       hoje e o feriado local sumia — bastava o Recalcular estar numa tela sem
       o formulário inteiro para a data impressa na proposta mudar calada. */
    _cronDoForm: function (el) {
      var f = {}, x;
      function pega(id) { var e = el(id); return e || null; }
      function vazio(e) { return String(e.value == null ? "" : e.value).trim() === ""; }
      x = pega("cron-inicio"); if (x) f.dataInicio = vazio(x) ? null : x.value;
      x = pega("cron-equipes"); if (x) f.equipes = vazio(x) ? null : Math.max(1, parseInt(Util.num(x.value), 10) || 1);
      x = pega("cron-dias"); if (x) f.diasUteisSemana = vazio(x) ? null : Math.min(7, Math.max(1, parseInt(Util.num(x.value), 10) || 5));
      /* ⚠ PARALELISMO VAZIO = 0, não null. Nos outros números o vazio sempre
         virou o padrão do motor (equipes `|| 1`, dias `|| 5`, custo `|| 700`),
         então null dá o mesmo número de antes. No paralelismo o vazio valia 0
         (`Util.num("")`) e null viraria o padrão 0,15: mesma ação da pessoa
         (apagar o campo e Recalcular) e a entrega impressa na proposta andava
         22 dias úteis para trás (197 → 175, 24/06/2027 → 24/05/2027). */
      x = pega("cron-paral"); if (x) f.paralelismo = vazio(x) ? 0 : Util.num(x.value);
      x = pega("cron-custodia"); if (x) f.custoDiaEquipe = vazio(x) ? null : Math.max(1, Util.num(x.value) || 700);
      x = pega("cron-feriados"); if (x) f.descontarFeriados = !!x.checked;
      /* pontos facultativos: o controle que faltava (sub-aba Parâmetros). Antes
         não havia input, e o Recalcular antigo apagava a chave a cada clique. */
      x = pega("cron-facult"); if (x) f.feriadosFacultativos = !!x.checked;
      /* ⚠ o que não é AAAA-MM-DD NÃO é gravado como feriado: o motor devolve
         o texto em `invalidos` e a tela mostra em vermelho. Aceitar um
         "24/06" silenciosamente deslocaria a entrega da obra por causa de um
         formato de data — e ninguém procuraria o erro aí. */
      x = pega("cron-feriados-extras");
      if (x) f.feriadosExtras = String(x.value || "")
        .split(/[;,\n]+/).map(function (s) { return s.trim(); }).filter(function (s) { return s; })
        .map(function (s) { return { data: s, nome: "Feriado local" }; });
      return f;
    },
    /* MODO EXECUTIVO materializado no salvar (espec 1.2): grava em
       `duracoes` a duração das etapas com subetapas (o vão da rede interna,
       marca "subetapas") ou apaga essas marcas quando o modo está desligado.
       É o que faz o PDF, a proposta, o desembolso e a versão ANTIGA do app
       darem a mesma data que a aba. Duração digitada que foi substituída
       volta como aviso com os dois números. ⚠ Nunca derruba o salvar: se o
       motor falhar, grava o resto como antes. */
    _cronoMaterializar: function (o, antesTela) {
      if (!o || typeof Cronograma === "undefined" || !Cronograma.materializar) return null;
      var m = null, antesVA = null, cr = o.cronograma;
      /* ⚠ DOIS "ANTES" (revisão da Fase 2, 11/09/2026). Com o cálculo ao vivo
         (adendo A1) o prazo DESTA tela já é o do vão novo antes de salvar: o
         `estimar(o)` que ficava aqui dava o mesmo número do "depois", e o
         recado saía "o prazo total continua 134 dias úteis" logo depois de a
         pessoa ver o prazo subir de 124 para 134 (medido no navegador; o
         Recalcular com 2 equipes, 124 → 70, dizia "continua 70").
         - `antesVA`: o que o aparelho com a VERSÃO ANTERIOR mostra (lê o
           gravado) — é o prazo que ESTE salvar muda;
         - `antesTela`: o prazo desta tela antes da edição — só o handler que
           mexeu sabe (mede antes de mexer) e passa pelo persistir.
         Custa dois estimar, e só no modo executivo (o único em que o salvar
         regrava duração de etapa). */
      if (cr && cr.exec && cr.exec.rede === true && Cronograma.estimarVersaoAnterior) { try { antesVA = Cronograma.estimarVersaoAnterior(o); } catch (eA) { antesVA = null; } }
      try { m = Cronograma.materializar(o); } catch (e) { return null; }
      var nomes = {};
      (o.etapas || []).forEach(function (et, i) { nomes[et.id] = (i + 1) + ". " + String(et.nome || "").slice(0, 40); });
      function br(d) { return ("0" + d.getDate()).slice(-2) + "/" + ("0" + (d.getMonth() + 1)).slice(-2) + "/" + d.getFullYear(); }
      function igual(a, b) { return !!a && !!b && a.totalDias === b.totalDias && !!a.dataFim && !!b.dataFim && a.dataFim.getTime() === b.dataFim.getTime(); }
      /* ⚠ SUBETAPAS MUDARAM → PRAZO MUDA: o vão materializado envelhece quando
         o orçamento é gravado sem passar por aqui (reprecificação em lote, EAP
         do BIM, assistente, importação de pacote). O salvar seguinte — de
         QUALQUER campo, até o nome do cliente — o regrava, e a entrega da
         proposta andava de 85 para 186 dias úteis sem recado nenhum. */
      if (m && m.mudancas && m.mudancas.length) {
        var depois = null;
        try { depois = Cronograma.estimar(o); } catch (eD) { depois = null; }
        var ps = m.mudancas.slice(0, 3).map(function (a) { return (nomes[a.etapaId] || "etapa") + ": " + a.antes + " → " + a.depois + " dia(s)"; });
        if (m.mudancas.length > 3) ps.push("e mais " + (m.mudancas.length - 3));
        var etTxt = m.mudancas.length + " etapa(s) com subetapas (" + ps.join("; ") + ")", t;
        if (antesTela && depois && antesTela.dataFim && depois.dataFim && !igual(antesTela, depois))
          t = "Modo executivo: o prazo passou de " + antesTela.totalDias + " para " + depois.totalDias + " dias úteis (término " + br(antesTela.dataFim) + " → " + br(depois.dataFim) + "), porque mudou a duração de " + etTxt + ".";
        else if (antesTela && depois && depois.dataFim)
          t = "Modo executivo: mudou a duração de " + etTxt + ", mas o prazo total continua " + depois.totalDias + " dias úteis (término " + br(depois.dataFim) + ").";
        else t = "Modo executivo: a duração gravada de " + etTxt + " foi atualizada para o vão das subetapas.";
        // o que este salvar muda de verdade: o prazo dos aparelhos com a versão anterior
        if (antesVA && depois && antesVA.dataFim && depois.dataFim && !igual(antesVA, depois))
          t += " Aparelhos com versão anterior do app viam " + antesVA.totalDias + " dias úteis (término " + br(antesVA.dataFim) + ") e passam a ver " + depois.totalDias + " (término " + br(depois.dataFim) + "), o mesmo desta tela.";
        else if (depois && depois.dataFim) t += " Aparelhos com versão anterior do app veem o mesmo prazo desta tela.";
        UI.toast(t + " Confira o cronograma antes de enviar a proposta.", "info");
      }
      if (m && m.avisos && m.avisos.length) {
        /* ⚠ de ONDE vinha o número: "digitada" para a duração da IA ou do Hh da
           Execução fazia a pessoa achar que perdia um número dela — e ela perdia
           uma duração rastreável (I7) sem saber */
        var ORIG = { ia: "sugerida pela IA", exec: "do Hh SINAPI (aba Execução)" };
        var partes = m.avisos.slice(0, 3).map(function (a) {
          return (nomes[a.etapaId] || "etapa") + ": " + a.digitado + " (" + (ORIG[a.agente] || "digitada") + ") → " + a.vao + " dia(s)";
        });
        if (m.avisos.length > 3) partes.push("e mais " + (m.avisos.length - 3));
        UI.toast("Modo executivo: " + m.avisos.length + " etapa(s) com subetapas passaram a durar o vão das subetapas — " +
          partes.join("; ") + ". A duração de antes fica guardada e volta se o modo executivo for desligado; para mudar o prazo delas agora, edite as subetapas.", "info");
      }
      return m;
    },
    /* ⚠ GRAVADORES DIRETOS (os que gravam o orçamento sem o App.persistir:
       aprovar, criar revisão, copiar, reprecificação em lote, restaurar do
       Excel, EAP e vínculo do BIM). Com o cálculo ao vivo (A1) a versão nova
       já mostra o vão certo; isto mantém o GRAVADO igual a ela, para o
       aparelho com a versão anterior. Medido (revisão da Fase 2): um item do
       BIM mudou a armação dos pilares, o orçamento foi aprovado pelo caminho
       direto, e a MESMA proposta aprovada passou a ter 217 dias úteis nesta
       versão e 124 na anterior — com a trava do aprovado impedindo qualquer
       salvar de alinhar depois.
       Silencioso de propósito (esta tela não muda de prazo). Aprovado não é
       tocado; motor que falha não impede o gravador. Mesma ordem do persistir:
       trava → materializar → sincronizarPrazo. Devolve o `materializar` ou null.
       NÃO chamar em dado RECEBIDO (restaurar backup, importar pacote): eles
       gravam com o carimbo de origem, e mudar conteúdo sob o mesmo carimbo faz
       o merge da nuvem divergir entre aparelhos. */
    _materializarSeExec: function (o) {
      if (!o || typeof Cronograma === "undefined" || !Cronograma.materializarSeExec) return null;
      try { if (typeof Orcamento !== "undefined" && Orcamento.travadoPorAprovacao && Orcamento.travadoPorAprovacao(o)) return null; } catch (eT) { return null; }
      var m = null;
      try { m = Cronograma.materializarSeExec(o); } catch (e) { return null; }
      if (m && m.mudou) { try { Orcamento.sincronizarPrazo(o); } catch (eS) {} }
      return m;
    },
    // grava cada orçamento afetado por uma troca de preço em lote (composição própria, insumo)
    _salvarOrcsAfetados: function (eid, afetados) {
      var self = this;
      (afetados || []).forEach(function (a) { self._materializarSeExec(a.orc); Store.salvarOrcamento(eid, a.orc); });
    },

    /* ================================================================
       PLANEJAMENTO DA OBRA (Fase 3) — as ações da faixa e do painel.
       ⚠ Fiação fina: a DECISÃO de cada ação é pura (CronoExecUI.decidirAlvo,
       bloqueioPassarObra, diffQuantidades, congelarDoForm; CronoBase;
       CronoPlan) e testada executando; aqui só Store, RBAC, modal e recado.
       As mesmas funções servem a aba do orçamento e a ficha da obra (o
       painel emite os mesmos data-acao nos dois lugares).
       ================================================================ */
    /* RBAC em FUNÇÃO (botão escondido não é guarda): Gestão (Plus), módulo
       Obras e a obra liberada para este usuário. null = pode; senão o recado. */
    /* ⚠ quem VÊ o dinheiro do planejamento da obra: a regra do painel da obra
       (Gestao._cronoDinheiro — Medições OU Financeiro). Uma regra só: o
       Histórico de bases e o diálogo de congelar/reprogramar vazavam o valor de
       venda que a própria ficha escondia (revisão 3, lentes dinheiro e
       código). Sem a Gestão carregada não dá para conferir: não mostra. */
    _cronoVeDinheiro: function () {
      try { return (typeof Gestao !== "undefined" && typeof Gestao._cronoDinheiro === "function") ? !!Gestao._cronoDinheiro() : false; } catch (e) { return false; }
    },
    _cronoSemPermissao: function (obraId) {
      if (typeof Gestao === "undefined" || !Gestao.podeGestao || !Gestao.podeGestao()) return "O planejamento da obra é da Gestão de Obras (plano Plus).";
      if (typeof Auth !== "undefined" && Auth.podeModulo && !Auth.podeModulo("obras")) return "Seu usuário não tem permissão no módulo Obras — peça ao administrador.";
      if (obraId && typeof Auth !== "undefined" && Auth.podeObra && !Auth.podeObra(obraId)) return "Esta obra não está liberada para o seu usuário.";
      return null;
    },
    _cronoBrD: function (s) { s = String(s || ""); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4) : s; },
    /* obra + orçamento ligado a ela + planejamento, FRESCOS do Store (quem
       grava relê: o modal pode ter ficado aberto enquanto outro aparelho
       sincronizava). `lista` null = ilegível (e aí ninguém grava). */
    _cronoObraCtx: function (obraId) {
      var eid = Auth.empresaId(), obra = null, lista = null, CB = (typeof CronoBase !== "undefined") ? CronoBase : null;
      try { obra = Store.obter(eid, "obras", obraId); } catch (eO) { obra = null; }
      if (!obra) return { erro: "Obra não encontrada neste aparelho — atualize a tela." };
      var orc = null;
      try { orc = obra.orcamentoId ? Store.obterOrcamento(eid, obra.orcamentoId) : null; } catch (eC) { orc = null; }
      if (CB) { try { lista = Store.listar(eid, CB.ENTIDADE) || []; } catch (eL) { lista = null; } }
      return { eid: eid, obra: obra, orc: orc, lista: lista,
        plano: (CB && lista) ? CB.plano(lista, obra.id) : null, ativa: (CB && lista) ? CB.ativa(lista, obra.id) : null };
    },
    /* depois de gravar: a ficha da obra (outra tela) redesenha pelo caminho
       dela quando está aberta; senão o render geral */
    _cronoRepintar: function () {
      if (this.tela === "gestao" && typeof Gestao !== "undefined" && Gestao._ovFicha && typeof Gestao._ovFichaMontar === "function") { try { Gestao._ovFichaMontar(false); return; } catch (eF) {} }
      this.render();
    },
    /* A MONTAGEM ÚNICA do previsto × realizado de uma obra: o chip da faixa, a
       sub-aba do orçamento e — por esta mesma função — a ficha e o módulo da
       obra. ⚠ Uma segunda montagem divergiria na data de corte, no plano, nos
       diários ou nas medições (memória "conserto que para no segundo
       consumidor"). Diários e medições vão CRUS: o painel filtra pela obra e
       pelo RDO.podeIrAoPortal (a regra do Portal, sem cópia).
       `opts.comGantt`: devolve também `r` (o plano atual com a árvore, na
       MESMA âncora e no MESMO plano do painel) para o Gantt com a base.
       Devolve {painel, r?, plano, bases, ativa, obra, podeMedicoes, podeEditar}. */
    _cronoPainelDados: function (obra, orc, opts) {
      opts = opts || {};
      if (!obra || typeof CronoPlan === "undefined" || !CronoPlan.montarPainel) return null;
      var eid = Auth.empresaId(), CB = (typeof CronoBase !== "undefined") ? CronoBase : null, lista = [];
      if (CB) { try { lista = Store.listar(eid, CB.ENTIDADE) || []; } catch (eL) { lista = []; } }
      var plano = CB ? CB.plano(lista, obra.id) : null;
      var bases = lista.filter(function (x) { return !!x && x.tipo === "base" && String(x.obraId) === String(obra.id); });
      function ler(ent) { try { return Store.listar(eid, ent) || []; } catch (e) { return []; } }
      var ativ = [];
      try { if (typeof Gestao !== "undefined" && typeof Gestao._atividadesDaObra === "function") ativ = Gestao._atividadesDaObra(obra.id) || []; } catch (eA) { ativ = []; }
      var corte = (this._cronoCorte && typeof this._cronoCorte === "object") ? this._cronoCorte[obra.id] : null;
      /* a lista de orçamentos: a cadeia de revisões (base de outro orçamento
         não vale — CronoPlan.baseVale) e o aviso de revisão mais nova */
      var orcsP = [];
      try { orcsP = Store.listarOrcamentos(eid) || []; } catch (eO) { orcsP = []; }
      var p = CronoPlan.montarPainel({ orc: orc, obra: obra, plano: plano, bases: bases, rdos: ler("rdo"), medicoes: ler("medicoes"),
        atividadesDaObra: ativ, hoje: new Date(), dataCorte: corte || null, orcamentos: orcsP });
      var out = { painel: p, plano: plano, bases: bases, ativa: CB ? CB.ativa(lista, obra.id) : null, obra: obra,
        podeMedicoes: !(typeof Auth !== "undefined" && Auth.podeModulo && !Auth.podeModulo("medicoes")),
        podeEditar: !this._cronoSemPermissao(obra.id) };
      if (opts.comGantt && p && (p.estado === "ok" || p.estado === "sem-diarios") && p.ancora && p.ancora.data && orc) {
        try {
          var oA = orc;
          if (plano && CB) {
            oA = CB.orcComPlano(orc, plano);
            // ⚠ cópia: o orcComPlano entrega o cronograma DO PLANO por referência, e desenhar não grava
            if (oA) oA.cronograma = JSON.parse(JSON.stringify(oA.cronograma)); else oA = orc;
          }
          var V = Orcamento.valoresEAP(orc), calc = null;
          try { calc = Orcamento.calcular(orc); } catch (eC) { calc = null; }
          var ctx = { eap: true };
          if (calc) ctx.calc = calc;
          if (V && V.ok === true) ctx.valores = V;
          out.r = Cronograma.estimar(oA, { dataInicio: p.ancora.data }, ctx);
        } catch (eR) { out.r = null; }
      }
      return out;
    },
    /* [Iniciar plano de execução da obra] — copia o cronograma do orçamento
       APROVADO para a obra (CronoBase.iniciarPlano confere que a obra é deste
       orçamento). O plano nasce contando do início DA OBRA. */
    cronoIniciarPlano: function (obraId) {
      var o = this.orcAtual; if (!o || !obraId) return;
      if (this._trialBloqueado()) { this._avisoTrial(); return; }
      var np = this._cronoSemPermissao(obraId); if (np) { UI.toast(np + " Nada foi criado.", "erro"); return; }
      if (typeof CronoBase === "undefined") { UI.toast("Módulo do planejamento da obra não carregado (cronobase.js) — nada foi criado. Recarregue o app.", "erro"); return; }
      var c = this._cronoObraCtx(obraId), self = this;
      if (c.erro) { UI.toast(c.erro, "erro"); return; }
      var nome = String(c.obra.nome || "");
      if (c.lista === null) { UI.toast("Não consegui ler o planejamento das obras deste aparelho — nada foi criado. Recarregue o app.", "erro"); return; }
      if (c.plano) {
        /* ⚠ PLANO DE OUTRO ORÇAMENTO (revisão 3, lente sync): a obra religada
           pelo cadastro a um orçamento de fora da cadeia ficava com o plano
           copiado do antigo, e "Iniciar" dizia "já tem plano — é ele que esta
           aba edita" (não era: as etapas não são as mesmas). A porta é
           reiniciar, com a confirmação que diz o que se perde. */
        var orcsI = [];
        try { orcsI = Store.listarOrcamentos(c.eid) || []; } catch (eO) { orcsI = []; }
        var cadI = (typeof CronoExecUI !== "undefined" && CronoExecUI.cadeiaIds) ? CronoExecUI.cadeiaIds(o, orcsI) : [String(o.id)];
        var alheio = !!c.plano.orcamentoId && cadI.indexOf(String(c.plano.orcamentoId)) < 0;
        if (!alheio) { UI.toast("A obra " + nome + " já tem plano de execução — nada foi criado. É ele que esta aba edita.", "info"); this.render(); return; }
        var plA = c.plano, marca = String(plA.atualizadoEm || "");
        UI.modal("Reiniciar o plano de execução da obra " + nome,
          '<p style="font-size:13px">O plano de execução desta obra foi iniciado a partir do orçamento <b>' + Util.esc(plA.orcNumero || plA.orcamentoId) + '</b>' +
          (plA.atualizadoEm ? ' (gravado em ' + Util.esc(this._cronoBrD(String(plA.atualizadoEm).slice(0, 10))) + (plA.por ? ' por ' + Util.esc(plA.por) : '') + ')' : '') +
          ', que não é o <b>' + Util.esc(o.numero || "") + '</b> nem uma revisão dele — as etapas não são as mesmas.</p>' +
          '<p style="font-size:13px">Reiniciar copia o cronograma do <b>' + Util.esc(o.numero || "") + '</b> para o plano da obra e <b>apaga as edições feitas no plano atual</b> (durações, dependências, subetapas, modo executivo). As linhas de base já congeladas não mudam — depois de reiniciar, reprograme (nova base) para o previsto × realizado comparar com este orçamento.</p>',
          [{ texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
            { texto: "Reiniciar o plano a partir do " + (o.numero || "orçamento"), classe: "primary", onClick: function () { UI.fecharModal(); self._cronoIniciarPlanoAplicar(obraId, marca); } }]);
        return;
      }
      this._cronoIniciarPlanoAplicar(obraId, null);
    },
    /* grava o plano copiado do orçamento aberto. `marcaSubstituir` (o
       atualizadoEm do plano que o diálogo mostrou) = reiniciar um plano
       existente; ⚠ relido aqui: se o plano mudou com o diálogo aberto (outro
       aparelho editou ou reiniciou), nada é gravado. */
    _cronoIniciarPlanoAplicar: function (obraId, marcaSubstituir) {
      var o = this.orcAtual; if (!o || !obraId) return false;
      if (this._trialBloqueado()) { this._avisoTrial(); return false; }
      var np = this._cronoSemPermissao(obraId); if (np) { UI.toast(np + " Nada foi criado.", "erro"); return false; }
      if (typeof CronoBase === "undefined") { UI.toast("Módulo do planejamento da obra não carregado (cronobase.js) — nada foi criado. Recarregue o app.", "erro"); return false; }
      var c = this._cronoObraCtx(obraId), self = this;
      if (c.erro) { UI.toast(c.erro, "erro"); return false; }
      var nome = String(c.obra.nome || ""), substituir = marcaSubstituir != null;
      if (c.lista === null) { UI.toast("Não consegui ler o planejamento das obras deste aparelho — nada foi criado. Recarregue o app.", "erro"); return false; }
      if (substituir) {
        if (!c.plano || String(c.plano.atualizadoEm || "") !== String(marcaSubstituir)) {
          UI.toast("O plano de execução da obra " + nome + " mudou enquanto você conferia (outro aparelho ou outra tela) — nada foi gravado. Confira de novo.", "erro"); this.render(); return false;
        }
      } else if (c.plano) { UI.toast("A obra " + nome + " já tem plano de execução — nada foi criado. É ele que esta aba edita.", "info"); this.render(); return false; }
      var rec = CronoBase.iniciarPlano(o, c.obra, Util.agoraISO(), this._cronoPor());
      if (!rec || rec.erro) { UI.toast("O plano de execução não foi criado: " + ((rec && rec.erro) || "motor do planejamento indisponível."), "erro"); return; }
      var ini = this._cronoInicioObra(c.obra), cr = rec.cronograma;
      if (!cr.params || typeof cr.params !== "object" || Array.isArray(cr.params)) cr.params = {};
      var pIni = cr.params.dataInicio ? String(cr.params.dataInicio).slice(0, 10) : "";
      if (ini) cr.params.dataInicio = ini;   // a obra é o centro (ver _cronoAlvo)
      var r = CronoBase.salvarPlano(c.lista, rec, { agora: Util.agoraISO(), por: this._cronoPor(), novo: true, substituir: substituir });
      if (!r.ok) { UI.toast("O plano de execução não foi criado: " + r.erro, "erro"); return false; }
      if (!Store.salvarVarios(c.eid, CronoBase.ENTIDADE, r.gravar, true)) { UI.toast("O plano de execução NÃO foi criado — o armazenamento deste aparelho recusou (cheio?). Nada mudou.", "erro"); return false; }
      UI.toast("Plano de execução da obra " + nome + (substituir ? " reiniciado" : " iniciado") + " a partir do " + (o.numero || "orçamento") + ": as edições desta aba vão para ele" +
        (substituir ? ". As linhas de base congeladas não mudaram: reprograme (nova base) para a obra passar a ser comparada com este orçamento." : ", e a proposta aprovada fica intacta.") +
        (ini ? " O plano conta do início da obra (" + self._cronoBrD(ini) + ")" + (pIni && pIni !== ini ? "; a proposta dizia " + self._cronoBrD(pIni) : "") + "."
          : " A obra ainda não tem data de início: informe no cadastro da obra (Gestão → Obras) — é dela que a linha de base conta.") + (r.msg ? " " + r.msg : ""), "ok");
      this.render();
      return true;
    },
    /* [Criar obra deste orçamento] — Gestao.obraDeOrcamento com o início do
       cronograma e o término que o motor dá, pré-preenchidos (nada é gravado
       sem a pessoa salvar o cadastro). */
    cronoCriarObra: function () {
      var o = this.orcAtual; if (!o) return;
      if (typeof Gestao === "undefined" || typeof Gestao.obraDeOrcamento !== "function") { UI.toast("A Gestão de Obras não está carregada — recarregue o app.", "erro"); return; }
      var np = this._cronoSemPermissao(null); if (np) { UI.toast(np, "erro"); return; }
      var info = null;
      try { info = (typeof UI._cronoObraInfo === "function") ? UI._cronoObraInfo(o) : null; } catch (eI) { info = null; }
      /* ⚠ NUNCA com obra na cadeia de revisões — nem a que este usuário não
         vê. O acumulado já medido é por obra: uma segunda obra mediria de novo,
         do zero, os itens já medidos na primeira (faturamento em dobro). A
         conferência é AQUI, no clique, e não só no botão escondido. */
      if (!info || (info.obras || []).length || info.ocultas) {
        UI.toast(info ? "Este orçamento já tem obra ligada (nele ou numa revisão anterior) — outra obra dividiria diários e medições e mediria de novo o que já foi medido. Nada foi criado: use a obra que existe (linha de cima)."
          : "Não consegui conferir se este orçamento já tem obra — nada foi criado. Recarregue o app.", "erro");
        this.render(); return;
      }
      /* ⚠ E NEM COM OBRA EM OUTRA REVISÃO DA FAMÍLIA (mais nova ou irmã —
         revisão 3, lente dinheiro): com a obra passada para a R1, abrir a R0
         oferecia [Criar obra] e o clique criava a segunda obra, que mediria
         do zero os itens já medidos na primeira (`_pctAnterioresPorItem` é por
         obra). A trava é no clique, não só no botão escondido. */
      if ((info.outras || []).length || info.ocultasOutras) {
        var oq = (info.outras || [])[0];
        UI.toast("Este orçamento tem obra ligada a outra revisão dele" + (oq ? " (a obra " + String(oq.obra.nome || "") + ", na " + String(oq.orcNumero || oq.orcId) + ")" : "") +
          " — outra obra dividiria diários e medições e mediria de novo o que já foi medido. Nada foi criado: abra o orçamento ligado à obra (linha de cima).", "erro");
        this.render(); return;
      }
      Gestao.obraDeOrcamento(o, this._cronoDatasObra(o));
    },
    /* início = o do cronograma do orçamento (params.dataInicio, como a pessoa
       escreveu); término = o fim que o motor calcula. ⚠ Só com início
       gravado: sem ele o motor conta de HOJE, e hoje não é data da obra —
       pré-preencher isso seria inventar o início. */
    _cronoDatasObra: function (o) {
      var p = o && o.cronograma && o.cronograma.params, di = p && p.dataInicio ? String(p.dataInicio).slice(0, 10) : "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(di) || typeof Cronograma === "undefined") return {};
      var r = null;
      try { r = Cronograma.estimar(o); } catch (eR) { r = null; }
      var out = { inicio: di };
      if (r && r.dataFim && typeof r.dataFim.getTime === "function" && !isNaN(r.dataFim.getTime())) out.termino = Cronograma._ch(r.dataFim);
      return out;
    },
    /* [Passar a obra para esta revisão] — a obra está ligada a uma revisão
       ANTERIOR deste orçamento. Mostra o antes → depois das quantidades (ids
       iguais: a revisão clona o orçamento) e pede confirmação.
       ⚠ DINHEIRO: o acumulado já medido de cada item é contado por obra E POR
       ORÇAMENTO (Gestao._pctAnterioresPorItem). Com boletim feito sobre o
       orçamento de agora, o próximo boletim sobre a revisão começaria do zero
       nos itens já medidos — medição em dobro. Então: RECUSA com os números e
       a porta que existe (abrir o orçamento ligado à obra). */
    cronoPassarObra: function (obraId) {
      var o = this.orcAtual, self = this; if (!o || !obraId) return;
      if (this._trialBloqueado()) { this._avisoTrial(); return; }
      var np = this._cronoSemPermissao(obraId); if (np) { UI.toast(np + " A obra não mudou.", "erro"); return; }
      var info = null, a = null;
      try { info = (typeof UI._cronoObraInfo === "function") ? UI._cronoObraInfo(o) : null; } catch (eI) { info = null; }
      ((info && info.obras) || []).forEach(function (x) { if (x && x.obra && x.obra.id === obraId) a = x; });
      if (!a || !(a.nivel > 0)) { UI.toast("Essa obra não está ligada a uma revisão anterior deste orçamento — nada mudou.", "erro"); this.render(); return; }
      var c = this._cronoObraCtx(obraId);
      if (c.erro) { UI.toast(c.erro, "erro"); return; }
      var meds = null;
      try { meds = Store.listar(c.eid, "medicoes") || []; } catch (eM) { meds = null; }
      if (meds === null) { UI.toast("Não consegui ler as medições deste aparelho — a obra não mudou.", "erro"); return; }
      var numeros = {};
      try { (Store.listarOrcamentos(c.eid) || []).forEach(function (x) { if (x && x.id) numeros[x.id] = x.numero || x.id; }); } catch (eN) {}
      var deNum = numeros[c.obra.orcamentoId] || a.orcNumero || "";
      var bl = CronoExecUI.bloqueioPassarObra(c.obra, meds, o.id, numeros);
      if (bl) {
        var bts = [{ texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } }];
        if (c.orc) bts.push({ texto: "Abrir o orçamento ligado à obra", classe: "primary", onClick: function () { UI.fecharModal(); self.cronoAbrirOrcamento(c.obra.orcamentoId); } });
        /* ⚠ título e texto de botão são TEXTO: o UI.modal os escreve por
           _rotuloHtml/_rotulo, que já escapam — o Util.esc aqui dobrava, e
           "D'Ávila & Filhos" aparecia como "D&#39;Ávila &amp; Filhos" (revisão 3) */
        UI.modal("A obra continua ligada ao " + deNum, '<p style="font-size:13px;margin:0">' + Util.esc(this._cronoVeDinheiro() ? bl.msg : bl.msg.replace(/ \(R\$[^)]*\)/, "")) + '</p>', bts);
        return;
      }
      // o prazo do cronograma que o Portal do cliente desenha (Cronograma.estimar do orçamento ligado), antes → depois
      var prz = null;
      try { if (c.orc && typeof Cronograma !== "undefined") prz = { de: Cronograma.estimar(c.orc).totalDias, para: Cronograma.estimar(o).totalDias }; } catch (eP) { prz = null; }
      UI.modal("Passar a obra " + String(c.obra.nome || "") + " para a revisão " + (o.numero || ""),
        CronoExecUI.passarObraHtml({ obra: c.obra, de: c.orc, deNumero: deNum, para: o, diff: c.orc ? CronoExecUI.diffQuantidades(c.orc, o) : null, temPlano: !!c.plano, prazo: prz }), [
          { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
          { texto: "Passar a obra para " + (o.numero || "esta revisão"), classe: "primary", onClick: function () { UI.fecharModal(); self._cronoPassarObraAplicar(obraId, c.obra.orcamentoId, o.id); } }
        ]);
    },
    _cronoPassarObraAplicar: function (obraId, deId, paraId) {
      if (this._trialBloqueado()) { this._avisoTrial(); return false; }
      var np = this._cronoSemPermissao(obraId); if (np) { UI.toast(np + " A obra não mudou.", "erro"); return false; }
      var c = this._cronoObraCtx(obraId);
      if (c.erro) { UI.toast(c.erro, "erro"); return false; }
      /* ⚠ RELÊ antes de gravar: outro aparelho pode ter trocado a obra de
         orçamento enquanto o modal estava aberto */
      if (String(c.obra.orcamentoId || "") !== String(deId || "")) { UI.toast("A obra mudou de orçamento enquanto você conferia (outro aparelho ou outra tela) — nada foi gravado. Confira de novo.", "erro"); this._cronoRepintar(); return false; }
      var meds = null;
      try { meds = Store.listar(c.eid, "medicoes") || []; } catch (eM) { meds = null; }
      // a trava de novo, com o que está no disco AGORA (um boletim pode ter chegado pela nuvem)
      var bl = meds === null ? { msg: "Não consegui ler as medições deste aparelho — nada foi gravado." } : CronoExecUI.bloqueioPassarObra(c.obra, meds, paraId, null);
      if (bl) { UI.toast(bl.msg, "erro"); return false; }
      var para = null;
      try { para = Store.obterOrcamento(c.eid, paraId); } catch (eP) { para = null; }
      if (!para) { UI.toast("A revisão não está gravada neste aparelho — a obra não mudou.", "erro"); return false; }
      var obra = c.obra, deNum = String((c.orc && c.orc.numero) || "");
      /* ⚠ AÇÃO REGISTRADA na própria obra: quem passou, quando, de onde para
         onde (as 10 últimas). Não há trilha de auditoria central no app; o
         registro vai no cadastro da obra e sincroniza com ele. */
      var hist = Array.isArray(obra.vinculoOrcamento) ? obra.vinculoOrcamento.slice(-9) : [];
      hist.push({ de: String(deId || ""), deNumero: deNum, para: String(paraId), paraNumero: String(para.numero || ""), em: Util.agoraISO(), por: this._cronoPor() });
      obra.vinculoOrcamento = hist;
      obra.orcamentoId = paraId;
      if (!Store.salvar(c.eid, "obras", obra)) { UI.toast("A obra NÃO foi passada — o armazenamento deste aparelho recusou a gravação (cheio?). Nada mudou.", "erro"); return false; }
      var extra = "";
      if (c.plano && typeof CronoBase !== "undefined" && c.lista) {
        var pl = c.plano;
        pl.orcamentoId = String(paraId); pl.orcNumero = String(para.numero || "").slice(0, 40);
        var rp = CronoBase.salvarPlano(c.lista, pl, { agora: Util.agoraISO(), por: this._cronoPor() });
        if (rp.ok && Store.salvarVarios(c.eid, CronoBase.ENTIDADE, rp.gravar, true)) extra = " O plano de execução da obra passou junto.";
        else extra = " Atenção: o plano de execução da obra continua marcado com a revisão anterior (" + ((rp && rp.erro) || "o armazenamento recusou") + "); ele segue valendo (as etapas têm os mesmos ids), e o painel avisa.";
      }
      UI.toast("A obra " + String(obra.nome || "") + " passou do " + (deNum || "orçamento anterior") + " para o " + String(para.numero || "") +
        ". Os diários continuam valendo (os itens têm o mesmo id); o que foi lançado em item que saiu na revisão fica fora do avanço sobre o orçamento." + extra +
        " O Portal do cliente passa a mostrar o cronograma e a curva planejada do " + String(para.numero || "orçamento novo") + " na próxima publicação.", "ok");
      this._cronoRepintar();
      return true;
    },
    /* [Congelar linha de base] / [Reprogramar (nova base)] — a MESMA função:
       a versão é a próxima que existe (1 sem base; ativa + 1 com base), e a
       partir da v2 o motivo é obrigatório. `reprogramar` só nomeia o botão. */
    cronoCongelar: function (obraId, reprogramar) {
      var self = this; if (!obraId) return;
      void reprogramar;
      if (this._trialBloqueado()) { this._avisoTrial(); return; }
      var np = this._cronoSemPermissao(obraId); if (np) { UI.toast(np + " Nada foi congelado.", "erro"); return; }
      if (typeof CronoBase === "undefined" || typeof CronoPlan === "undefined" || !CronoPlan.congelarBase) { UI.toast("Módulo do planejamento da obra não carregado (cronobase.js / cronoplan.js) — nada foi congelado. Recarregue o app.", "erro"); return; }
      var c = this._cronoObraCtx(obraId);
      if (c.erro) { UI.toast(c.erro, "erro"); return; }
      if (!c.orc) { UI.toast("A obra " + String(c.obra.nome || "") + " não tem orçamento vinculado — vincule o orçamento da obra antes de congelar a linha de base.", "erro"); return; }
      if (c.lista === null) { UI.toast("Não consegui ler o planejamento das obras deste aparelho — nada foi congelado. Recarregue o app.", "erro"); return; }
      var prox = CronoBase.proximaVersao(c.lista, obraId), ini = this._cronoInicioObra(c.obra) || "", opc = [];
      (c.orc.etapas || []).forEach(function (e, i) { if (e && e.opcional) opc.push({ id: e.id, numero: String(i + 1), nome: e.nome || "" }); });
      // o "o que muda" do diálogo: a base que sairia com o início da obra e as opcionais desmarcadas (o padrão)
      var sim = ini ? this._cronoCongelarCalc(c, { dataInicio: ini, opcionaisIncluidos: [], motivo: prox > 1 ? "simulação" : "" }, prox) : null;
      var crP = c.plano ? c.plano.cronograma : c.orc.cronograma;
      var pIni = crP && crP.params && crP.params.dataInicio ? String(crP.params.dataInicio).slice(0, 10) : "";
      UI.modal(prox > 1 ? "Reprogramar a obra — linha de base v" + prox : "Congelar a linha de base da obra",
        CronoExecUI.congelarForm({ obra: c.obra, inicio: ini, inicioPlano: pIni, versao: prox, ativa: c.ativa, opcionais: opc, sim: sim,
          fontePlano: c.plano ? "plano" : "orcamento", orcNumero: c.orc.numero || "", termino: c.obra.termino || "", semDinheiro: !this._cronoVeDinheiro() }), [
          { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
          { texto: prox > 1 ? "Gravar a linha de base v" + prox : "Congelar a v1", classe: "primary", onClick: function () {
            var f = CronoExecUI.congelarDoForm(function (id) { return UI.el(id); }, opc.map(function (x) { return x.id; }), prox);
            if (f.erro) { UI.toast(f.erro, "erro"); return; }   // o modal fica aberto com o que foi digitado
            if (self._cronoCongelarAplicar(obraId, f, prox)) UI.fecharModal();
          } }
        ]);
    },
    /* a base que `f` produziria (ou {erro}) — o MESMO cálculo do diálogo e do
       gravar: plano da obra (quando existe) sobre o orçamento ligado, âncora
       no início pedido, valor de venda obrigatório (nunca custo) */
    _cronoCongelarCalc: function (c, f, versao) {
      var V = null, calc = null, oA = c.orc;
      try { V = Orcamento.valoresEAP(c.orc); } catch (eV) { V = { ok: false, motivo: String((eV && eV.message) || eV) }; }
      if (!V || V.ok === false || !V.porId) return { erro: "sem o valor de venda de cada etapa e subetapa não dá para congelar (" + ((V && V.motivo) || "valores indisponíveis") + ") — a linha de base pesa por preço de venda, nunca por custo." };
      try { calc = Orcamento.calcular(c.orc); } catch (eC) { calc = null; }
      if (c.plano) {
        oA = CronoBase.orcComPlano(c.orc, c.plano);
        if (!oA) return { erro: "o plano de execução da obra está sem cronograma — inicie o plano de novo a partir do orçamento." };
        oA.cronograma = JSON.parse(JSON.stringify(oA.cronograma));   // congelar lê; o plano vivo não é tocado
      }
      var ctx = { eap: true, valores: V };
      if (calc) ctx.calc = calc;
      var r = Cronograma.estimar(oA, { dataInicio: f.dataInicio }, ctx);
      return CronoPlan.congelarBase(r, { obraId: c.obra.id, versao: versao, orcamentoId: c.orc.id, orcNumero: c.orc.numero || "", motivo: f.motivo, por: this._cronoPor() },
        { valores: V, dataInicio: f.dataInicio, opcionaisIncluidos: f.opcionaisIncluidos || [], agora: Util.agoraISO() });
    },
    /* grava a base do diálogo. true = fecha o modal. */
    _cronoCongelarAplicar: function (obraId, f, versaoMostrada) {
      if (this._trialBloqueado()) { this._avisoTrial(); return false; }
      var np = this._cronoSemPermissao(obraId); if (np) { UI.toast(np + " Nada foi congelado.", "erro"); return false; }
      var c = this._cronoObraCtx(obraId), self = this;
      if (c.erro || !c.orc || c.lista === null) { UI.toast((c.erro || "A obra não tem orçamento vinculado, ou o planejamento das obras não pôde ser lido") + " — nada foi congelado.", "erro"); return false; }
      var prox = CronoBase.proximaVersao(c.lista, obraId), nome = String(c.obra.nome || "");
      // outro aparelho congelou enquanto o diálogo estava aberto: o "o que muda" que a pessoa leu não vale mais
      if (versaoMostrada != null && prox !== versaoMostrada) { UI.toast("Enquanto o diálogo estava aberto, outra linha de base foi gravada nesta obra (a próxima agora é a v" + prox + ") — nada foi gravado. Abra de novo para ver o que muda.", "erro"); this._cronoRepintar(); return true; }
      if (prox > 1 && !String(f.motivo || "").trim()) { UI.toast("Informe o motivo da reprogramação — a v" + prox + " substitui a v" + (prox - 1) + " na comparação da obra. Nada foi gravado.", "erro"); return false; }
      var base = this._cronoCongelarCalc(c, f, prox);
      if (!base || base.erro) { UI.toast("A linha de base não foi congelada: " + ((base && base.erro) || "o cálculo falhou."), "erro"); return false; }
      var res = CronoBase.novaBase(c.lista, obraId, base, { agora: Util.agoraISO() });
      if (!res.ok) { UI.toast("A linha de base não foi gravada: " + res.erro, "erro"); return false; }
      /* ⚠ A OBRA É O CENTRO: a base congela do início DA OBRA. Data digitada
         diferente da do cadastro → o cadastro passa a ter ela, ANTES da base
         (se falhar, nada foi gravado; o contrário deixaria uma base contando
         de uma data que a obra não tem). */
      var iniAntes = this._cronoInicioObra(c.obra), mudouIni = iniAntes !== f.dataInicio;
      /* o TÉRMINO do cadastro só muda quando a pessoa marcou no diálogo
         (revisão 3, lente UX: a base e o cadastro davam dois prazos) */
      var termAntes = /^\d{4}-\d{2}-\d{2}$/.test(String(c.obra.termino || "")) ? String(c.obra.termino) : "", termNovo = String(res.base.dataFim || "");
      var mudouTerm = !!f.atualizarTermino && /^\d{4}-\d{2}-\d{2}$/.test(termNovo) && termNovo !== termAntes;
      if (mudouIni || mudouTerm) {
        c.obra.inicio = f.dataInicio;
        if (mudouTerm) c.obra.termino = termNovo;
        if (!Store.salvar(c.eid, "obras", c.obra)) { UI.toast("Nada foi gravado: o armazenamento deste aparelho recusou gravar o cadastro da obra (cheio?).", "erro"); return false; }
      }
      if (!Store.salvarVarios(c.eid, CronoBase.ENTIDADE, res.gravar, true)) {
        UI.toast("A linha de base NÃO foi gravada — o armazenamento deste aparelho recusou (cheio?)." + (mudouIni ? " O início da obra já ficou gravado como " + this._cronoBrD(f.dataInicio) + "." : "") +
          (mudouTerm ? " O término da obra já ficou gravado como " + this._cronoBrD(termNovo) + "." : ""), "erro");
        return false;
      }
      var b = res.base, fora = (b.opcionaisFora || []).length;
      // ⚠ o valor de venda só para quem vê dinheiro (a regra do painel da obra — ver _cronoVeDinheiro)
      UI.toast("Linha de base v" + b.versao + " da obra " + nome + " congelada: " + b.totalDias + " dias úteis, de " + self._cronoBrD(b.cal && b.cal.dataInicio) + " a " + self._cronoBrD(b.dataFim) + (this._cronoVeDinheiro() ? ", " + Util.fmtMoeda(b.valor) : "") +
        (fora ? " (" + fora + " etapa(s) opcional(is) fora do avanço)" : "") + "." +
        (mudouIni ? " O início da obra passou a ser " + self._cronoBrD(f.dataInicio) + (iniAntes ? " (era " + self._cronoBrD(iniAntes) + ")" : "") + "." : "") +
        (mudouTerm ? " O término da obra passou a ser " + self._cronoBrD(termNovo) + (termAntes ? " (era " + self._cronoBrD(termAntes) + ")" : "") + "." : "") + (res.msg ? " " + res.msg : ""), "ok");
      this._cronoRepintar();
      return true;
    },
    cronoHistorico: function (obraId) {
      if (!obraId) return;
      var np = this._cronoSemPermissao(obraId); if (np) { UI.toast(np, "erro"); return; }
      if (typeof CronoBase === "undefined") { UI.toast("Módulo do planejamento da obra não carregado (cronobase.js) — recarregue o app.", "erro"); return; }
      var c = this._cronoObraCtx(obraId);
      if (c.erro) { UI.toast(c.erro, "erro"); return; }
      if (c.lista === null) { UI.toast("Não consegui ler o planejamento das obras deste aparelho — recarregue o app.", "erro"); return; }
      // título é texto (o UI.modal escapa); o valor de venda só para quem vê dinheiro
      UI.modal("Histórico da linha de base — " + String(c.obra.nome || ""),
        CronoExecUI.historicoBases(CronoBase.bases(c.lista, obraId), c.ativa ? c.ativa.id : null, CronoBase.ocupacao(c.lista), { semDinheiro: !this._cronoVeDinheiro() }),
        [{ texto: "Fechar", classe: "primary", onClick: function () { UI.fecharModal(); } }]);
    },
    /* [Abrir planejamento da obra]: o módulo "Cronograma da obra" (cronobra),
       que a etapa da ficha registra — guardado com typeof, na ordem: a função
       dela, a view registrada, e por último o cadastro da obra (que existe
       hoje). Nunca um clique mudo. A obra escolhida fica em _cronobraObra. */
    cronoAbrirPlanejamento: function (obraId) {
      if (!obraId) return;
      var np = this._cronoSemPermissao(obraId); if (np) { UI.toast(np, "erro"); return; }
      this._cronobraObra = obraId;
      if (typeof Gestao !== "undefined" && typeof Gestao.abrirCronobra === "function") { Gestao.abrirCronobra(obraId); return; }
      if (typeof this.viewValida === "function" && this.viewValida("cronobra")) { this.irPara("cronobra"); return; }
      if (typeof Gestao !== "undefined" && typeof Gestao.abrir === "function") {
        UI.toast("O cronograma da obra ainda não está disponível nesta versão — abrindo o cadastro da obra.", "info");
        Gestao.abrir("obras", obraId);
      }
    },
    /* [Abrir cronograma no orçamento] (ficha da obra) / [Abrir o orçamento ligado à obra] */
    cronoAbrirOrcamento: function (orcId) {
      if (!orcId) return;
      /* ⚠ vindo de uma tela da Gestão (ficha, módulo), só o abrirOrcamento
         marcava o editor por baixo e o render seguia desenhando a Gestão — um
         clique mudo. O irPara vem antes (a receita do Gestao.cronobraAbrirOrc). */
      if (this.tela === "gestao" && typeof this.irPara === "function" && this.irPara("orcamentos") === false) return;
      this.abrirOrcamento(orcId);
      if (this.orcAtual && this.orcAtual.id === orcId) { this.aba = "cronograma"; this.render(); }
    },

    // Cronograma — recalcular com os parâmetros / limpar edições de duração
    cronRecalc: function () {
      var alvo = this._cronoAlvo(); if (!alvo || typeof Cronograma === "undefined") return;
      if (alvo.travado) { this._cronoTravado(alvo); return; }
      /* ⚠ MESCLA, nunca substitui: chave que não veio do formulário conserva o
         valor gravado (feriadosFacultativos não tem input e sumia a cada
         Recalcular). Ver _cronDoForm e Cronograma.mesclarParams. */
      // modo executivo: o prazo de ANTES desta tela, para o recado (equipes mudam o vão das subetapas)
      var antesR = null;
      if (alvo.cron.exec && alvo.cron.exec.rede === true) { try { antesR = Cronograma.estimar(alvo.orc); } catch (eA) { antesR = null; } }
      alvo.cron.params = Cronograma.mesclarParams(alvo.cron.params, this._cronDoForm(function (id) { return UI.el(id); }));
      alvo.salvar({ cronoAntes: antesR }); this.render();
    },
    cronReset: function () {
      var alvo = this._cronoAlvo(); if (!alvo || typeof Cronograma === "undefined") return;
      if (alvo.travado) { this._cronoTravado(alvo); return; }
      var c = alvo.cron, k, nDur = 0, nDep = 0, nMarco = 0, folhas = {}, nSub = 0;
      var ag = (c.duracoesAgente && typeof c.duracoesAgente === "object") ? c.duracoesAgente : {};
      // o que conta como EDIÇÃO: materialização "subetapas" não é edição de ninguém (volta sozinha)
      for (k in (c.duracoes || {})) if (Object.prototype.hasOwnProperty.call(c.duracoes, k) && ag[k] !== "subetapas") nDur++;
      for (k in (c.predecessoras || {})) if (Object.prototype.hasOwnProperty.call(c.predecessoras, k)) nDep++;
      for (k in (c.marcos || {})) if (Object.prototype.hasOwnProperty.call(c.marcos, k) && c.marcos[k] === true) nMarco++;
      var sub = (c.sub && typeof c.sub === "object") ? c.sub : {};
      ["duracoes", "marcos", "predecessoras", "lags", "tipos", "equipes", "agente", "iaMotivos"].forEach(function (m) {
        var mp = sub[m]; if (!mp || typeof mp !== "object") return;
        for (var id in mp) if (Object.prototype.hasOwnProperty.call(mp, id) && !folhas[id]) { folhas[id] = true; nSub++; }
      });
      /* ⚠ Limpar edições zera etapa E subetapa (sub.*) e REMATERIALIZA; mantém
         params e exec (são parâmetros, não edições). Antes limpava só 6 mapas
         de etapa: com o modo executivo a rede das subetapas continuava e o
         recado "voltaram à estimativa do agente" mentia. */
      // o prazo antes e depois: limpar edições muda a entrega, e o recado diz quanto
      var rAntes = null; try { rAntes = Cronograma.estimar(alvo.orc); } catch (eA) { rAntes = null; }
      var res = Cronograma.limparEdicoes(alvo.orc);
      // FASE 1.4: destrava também o nº de meses (false explícito ≠ undefined: não re-dispara a migração).
      // Só no orçamento: o nº de meses é do desembolso da PROPOSTA, não do plano da obra.
      var o = alvo.orc;
      if (alvo.tipo === "orc" && o) { o.cronogramaMesesManual = false; try { Orcamento.sincronizarPrazo(o); } catch (e) {} }
      if (alvo.salvar({ cronoAntes: rAntes })) {
        var nada = !nDur && !nDep && !nMarco && !nSub;
        var mat = res && res.materializacao, nMat = mat && mat.gravadas ? mat.gravadas.length : 0;
        var rDep = null; try { rDep = Cronograma.estimar(alvo.orc); } catch (eD) { rDep = null; }
        var fmt = function (d) { return d && d.toLocaleDateString ? d.toLocaleDateString("pt-BR") : "—"; };
        var prazoR = (rAntes && rDep) ? (rAntes.totalDias !== rDep.totalDias
          ? " O prazo passou de " + rAntes.totalDias + " para " + rDep.totalDias + " dias úteis (término " + fmt(rAntes.dataFim) + " → " + fmt(rDep.dataFim) + ")."
          : " O prazo continua " + rDep.totalDias + " dias úteis (término " + fmt(rDep.dataFim) + ").") : "";
        UI.toast((nada ? "Não havia duração, dependência nem marco editados" :
          "Limpas: " + nDur + " duração(ões), " + nDep + " dependência(s), " + nMarco + " marco(s) e " + nSub + " subetapa(s) editada(s)") +
          " — o cronograma segue a estimativa do agente e o prazo (meses) voltou a acompanhar o cronograma." +
          (c.exec && c.exec.rede === true ? " O modo executivo continua ligado: " + nMat + " etapa(s) com subetapas duram o vão das subetapas." : "") + prazoR, "ok");
      }
      this.render();
    },

    /* ---- cronograma executivo (Fase 2): estado de TELA da aba ----
       ⚠ Sub-aba, detalhe, etapas recolhidas e camada do físico-financeiro
       são da TELA, por orçamento aberto — nunca do orçamento: gravar a cada
       clique de visualização mudaria o atualizadoEm, sincronizaria à toa e,
       no orçamento aprovado, esbarraria na trava. */
    _cronoEstado: function (mapa, valor) {
      var o = this.orcAtual; if (!o) return;
      this[mapa] = (this[mapa] && typeof this[mapa] === "object") ? this[mapa] : {};
      this[mapa][o.id] = valor;
      this.render();
    },
    _cronoAbrirEtapa: function (etapaId, valor) {
      var o = this.orcAtual; if (!o || !etapaId) return;
      this._cronoAbertas = (this._cronoAbertas && typeof this._cronoAbertas === "object") ? this._cronoAbertas : {};
      var m = this._cronoAbertas[o.id] = this._cronoAbertas[o.id] || {};
      if (etapaId === "*") {
        if (valor === "1") this._cronoAbertas[o.id] = {};
        else (o.etapas || []).forEach(function (et) { m[et.id] = false; });
      } else if (m[etapaId] === false) delete m[etapaId];
      else m[etapaId] = false;
      this.render();
    },
    _cronoFFEstado: function (camada, modo) {
      var o = this.orcAtual; if (!o) return;
      this._cronoFF = (this._cronoFF && typeof this._cronoFF === "object") ? this._cronoFF : {};
      var f = this._cronoFF[o.id] = this._cronoFF[o.id] || {};
      if (camada) f.camada = camada;
      if (modo) f.modo = modo;
      this.render();
    },

    /* Interruptor "Detalhar o prazo pelas subetapas": primeiro o ANTES →
       DEPOIS (Cronograma.simularExec, que não toca no orçamento), com a
       parcela de arredondamento e o aviso do prazo escrito na proposta; só
       grava se a pessoa confirmar. ⚠ Ligar muda a data de entrega que a
       proposta imprime — mudar calado seria o pior dos recados. */
    cronExecAlternar: function (ligar) {
      var alvo = this._cronoAlvo(); if (!alvo || typeof Cronograma === "undefined" || !Cronograma.simularExec || typeof CronoExecUI === "undefined") return;
      if (alvo.travado) { this._cronoTravado(alvo); return; }
      var sim;
      try { sim = Cronograma.simularExec(alvo.orc, !!ligar); }
      catch (e) { UI.toast("Não consegui simular o modo executivo (" + ((e && e.message) || e) + ") — nada foi alterado.", "erro"); return; }
      var nomes = {}, self = this;
      (alvo.orc.etapas || []).forEach(function (et, i) { nomes[et.id] = (i + 1) + ". " + String(et.nome || "").slice(0, 50); });
      UI.modal((ligar ? "Ligar" : "Desligar") + " o cronograma executivo — " + sim.antes.totalDias + " → " + sim.depois.totalDias + " dias úteis",
        CronoExecUI.textoSimulacao(sim, nomes), [
          { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
          { texto: ligar ? "Ligar e gravar" : "Desligar e gravar", classe: "primary", onClick: function () { UI.fecharModal(); self._cronExecAplicar(!!ligar, sim); } }
        ]);
    },
    /* grava o interruptor: exec.rede → materializar (recado dos números
       digitados que viram o vão) → nº de meses da proposta → persistir.
       ⚠ salvar recusado (licença, Store): desfaz em memória — a tela não pode
       mostrar um modo que não ficou gravado em lugar nenhum. */
    _cronExecAplicar: function (ligar, sim) {
      var alvo = this._cronoAlvo(); if (!alvo) return;
      if (alvo.travado) { this._cronoTravado(alvo); return; }
      var cronAntes = JSON.stringify(alvo.cron), mesesAntes = alvo.orc.cronogramaMeses;
      var ex = {}, k, velho = alvo.cron.exec;
      if (velho && typeof velho === "object" && !Array.isArray(velho)) for (k in velho) if (Object.prototype.hasOwnProperty.call(velho, k)) ex[k] = velho[k];
      ex.rede = !!ligar;
      alvo.cron.exec = ex;
      /* no PLANO a materialização é do salvar dele (_cronoSalvarPlano); o
         _cronoMaterializar fala de "aparelhos com versão anterior", que nem
         enxergam o plano da obra — seria recado que mente */
      if (alvo.tipo === "orc") this._cronoMaterializar(alvo.orc);
      if (alvo.tipo === "orc") { try { Orcamento.sincronizarPrazo(alvo.orc); } catch (eS) {} }
      if (!alvo.salvar()) {
        var volta = JSON.parse(cronAntes);
        for (k in alvo.cron) if (Object.prototype.hasOwnProperty.call(alvo.cron, k)) delete alvo.cron[k];
        for (k in volta) if (Object.prototype.hasOwnProperty.call(volta, k)) alvo.cron[k] = volta[k];
        if (alvo.tipo === "orc") alvo.orc.cronogramaMeses = mesesAntes;
        UI.toast("O modo executivo NÃO foi " + (ligar ? "ligado" : "desligado") + ": o orçamento não foi gravado (veja o aviso). O cronograma continua como estava.", "erro");
        this.render(); return;
      }
      var rN = null;
      try { rN = Cronograma.estimar(alvo.orc); } catch (eR) { rN = null; }
      var a = sim && sim.antes, br = function (d) { return d && d.toLocaleDateString ? d.toLocaleDateString("pt-BR") : "—"; };
      /* ⚠ "PDF, proposta e desembolso já usam este prazo" era afirmado SEM
         CONDIÇÃO — e com o nº de meses travado pela pessoa o desembolso ficava
         em 2 colunas somando 5 meses na última, e o texto "Prazo de execução"
         da proposta (que o modal avisa que não é editado) continuava o de antes. */
      var ress = [];
      if (alvo.tipo === "orc") {
        try {
          var sug = Orcamento.mesesSugeridos ? Orcamento.mesesSugeridos(alvo.orc) : null, mes = Util.num(alvo.orc.cronogramaMeses);
          if (alvo.orc.cronogramaMesesManual && sug && mes && sug > mes)
            ress.push("o desembolso da proposta continua em " + mes + " mes(es), travado por você — o cronograma pede " + sug + " e o que passa do último mês soma nele (Relatórios → Prazo (meses))");
        } catch (eM) {}
      }
      var pt = sim && sim.prazoTexto;
      if (pt && pt.msg && (pt.difere || pt.ambiguo)) ress.push("o texto “Prazo de execução” da proposta continua dizendo “" + pt.texto + "” — ajuste nos dados comerciais");
      UI.toast("Cronograma executivo " + (ligar ? "ligado" : "desligado") + (rN && a ? ": o prazo " + (a.totalDias === rN.totalDias ? "continua " + rN.totalDias + " dias úteis (término " + br(rN.dataFim) + ")"
        : "passou de " + a.totalDias + " para " + rN.totalDias + " dias úteis (término " + br(a.dataFim) + " → " + br(rN.dataFim) + ")") : "") +
        (ress.length ? ". O PDF e o Gantt da proposta já usam este prazo; mas " + ress.join("; e ") + "." : ". PDF, proposta e desembolso já usam este prazo."), "ok");
      this.render();
    },
    /* Parâmetros avançados (sub-aba Parâmetros): os campos de params que
       estão NA TELA (hoje, o de pontos facultativos) pelo mesmo
       Cronograma.mesclarParams do Recalcular, e os de `exec` (paralelismo
       entre subetapas, tolerância, detalhe padrão) — nunca o `rede`. */
    cronParamsAvancados: function () {
      var alvoA = this._cronoAlvo(); if (!alvoA || typeof Cronograma === "undefined" || typeof CronoExecUI === "undefined") return;
      if (alvoA.travado) { this._cronoTravado(alvoA); return; }
      var el = function (id) { return UI.el(id); };
      var antesTxt = JSON.stringify({ p: alvoA.cron.params || null, e: alvoA.cron.exec || null });
      var antesP = JSON.parse(antesTxt), rA = null;
      try { rA = Cronograma.estimar(alvoA.orc); } catch (eA) { rA = null; }
      alvoA.cron.params = Cronograma.mesclarParams(alvoA.cron.params, this._cronDoForm(el));
      alvoA.cron.exec = CronoExecUI.mesclarExec(alvoA.cron.exec, CronoExecUI.execDoForm(el));
      if (JSON.stringify({ p: alvoA.cron.params || null, e: alvoA.cron.exec || null }) === antesTxt) { UI.toast("Nada mudou nos parâmetros do cronograma.", "info"); this.render(); return; }
      // rA = o prazo desta tela antes: sem ele o recado do modo executivo dizia "continua" junto do "passou de A para B" daqui
      if (!alvoA.salvar({ cronoAntes: rA })) {
        if (antesP.p) alvoA.cron.params = antesP.p; else delete alvoA.cron.params;
        if (antesP.e) alvoA.cron.exec = antesP.e; else delete alvoA.cron.exec;
        UI.toast("Os parâmetros NÃO foram gravados (veja o aviso) — o cronograma continua como estava.", "erro");
        this.render(); return;
      }
      var rD = null;
      try { rD = Cronograma.estimar(alvoA.orc); } catch (eD) { rD = null; }
      UI.toast("Parâmetros do cronograma gravados" + (rA && rD ? (rA.totalDias === rD.totalDias ? " — o prazo continua " + rD.totalDias + " dias úteis."
        : " — o prazo passou de " + rA.totalDias + " para " + rD.totalDias + " dias úteis.") : "."), "ok");
      this.render();
    },
    /* porta "Detalhar em subetapas" da etapa sem subetapas: o cronograma
       detalha até onde a planilha detalha — leva à Planilha, na etapa, com o
       diálogo de criar subetapa aberto (o mesmo do botão da planilha). */
    cronDetalharEtapa: function (etapaId) {
      var o = this.orcAtual; if (!o || !etapaId) return;
      this.aba = "planilha";
      if (this.expandirEtapa) { try { this.expandirEtapa(etapaId); } catch (eX) {} }
      this.render();
      this.addSubEtapa(etapaId);
    },

    /* Cronograma em papel (A4 paisagem) e em MS Project. Os dois saem do MESMO
       `Cronograma.estimar` que desenha a aba — nada é recalculado aqui, senão
       o PDF do cliente e a tela do engenheiro divergiriam sem ninguém ver. */
    cronPDF: function () {
      var o = this._cronoOrcDoc(); if (!o) return;   // no plano de execução: o plano (é o que está na tela)
      if (this._trialBloqueado()) { this._avisoTrial(); return; }
      if (typeof Cronograma === "undefined" || typeof CronoPDF === "undefined") { UI.toast("Módulo de cronograma indisponível.", "erro"); return; }
      if (!(o.etapas || []).length) { UI.toast("Adicione etapas para gerar o cronograma.", "erro"); return; }
      var D = this._cronoDocs(o);
      // o Gantt do documento é o MESMO desenho da tela (UI._gantt por etapa, CronoExecUI.gantt com subetapas)
      this._abrirPrint((o._planoDaObra ? "Plano de execução da obra — " : "Cronograma da Obra — ") + o.numero,
        CronoPDF.gerarHTML(o, D.r, { ganttSVG: D.ganttSVG, detalhe: D.detalhe, usuario: Auth.usuario(), realizado: this._avancoRealDe(o) }),
        "cronograma");
      /* o papel diz só "valor por subetapa indisponível" (vai ao cliente); o
         MOTIVO e o que fazer são do engenheiro — ficam aqui, na tela */
      if (D.detalhe !== "etapa" && typeof Orcamento !== "undefined" && Orcamento.valoresEAP) {
        try { var VEp = Orcamento.valoresEAP(o); if (VEp && VEp.ok === false) UI.toast("O PDF saiu sem as colunas de valor e peso por subetapa: " + (VEp.motivo || "o valor de venda por subetapa não fechou") + ".", "info"); } catch (eV) {}
      }
    },

    /* O que os DOCUMENTOS da aba (PDF, MS Project) recebem: o detalhe que está
       na tela (opts.detalhe EXPLÍCITO — proposta e demais chamadores não
       passam e continuam por etapa), o resultado do motor com a árvore EAP e
       o Gantt. ⚠ Datas não dependem da árvore (I4): `r.etapas` é o mesmo de
       `Cronograma.estimar(o)`. No PDF o Gantt vai no máximo até a subetapa —
       serviço num A4 é borrão; os serviços ficam na tabela.
       Qualquer falha na árvore cai no documento por etapa, como antes. */
    _cronoDocs: function (o) {
      var det = "etapa", r = null, svg = null;
      if (typeof CronoExecUI !== "undefined") {
        try {
          det = CronoExecUI.estado(this, o).detalhe;
          if (det !== "etapa") {
            r = CronoExecUI.preparar(o, {}).r;
            if (!r || !r.atividades || (r.exec && r.exec.erro)) { r = null; det = "etapa"; }
            /* ⚠ nada abaixo da etapa nesse detalhe (orçamento sem subetapa, no
               detalhe subetapa — o padrão da tela): o documento é o POR ETAPA de
               sempre, byte a byte o de hoje. Medido em 11/09/2026: passando
               "subetapa" a um orçamento sem subetapa, o PDF e o XML saíam
               diferentes do de hoje sem ter nada a mais para mostrar. */
            else if (!CronoExecUI.temFilhos(r, det)) det = "etapa";
            else if (CronoExecUI.temFilhos(r, det === "servico" ? "subetapa" : det))
              svg = CronoExecUI.gantt(r, { detalhe: det === "servico" ? "subetapa" : det, papel: true, semLegenda: true });
          }
        } catch (e) { r = null; svg = null; det = "etapa"; }
      }
      if (!r) r = Cronograma.estimar(o);
      if (svg == null) svg = UI._gantt(r, { semLegenda: true });
      return { r: r, detalhe: det, ganttSVG: svg };
    },

    /* Avanço FÍSICO da obra vinculada a este orçamento, para o cronograma
       impresso poder confrontar previsto × realizado.
       ⚠ A FONTE É A MESMA DO PAINEL (`Fisico.pacote` sobre os diários
       publicáveis). Somar rascunho e diário parado na aprovação daria ao
       cliente um percentual maior do que o que está diante dele na tela — e
       duas respostas para "quanto andou" na mesma empresa é pior que uma
       resposta faltando. Sem obra vinculada ou sem diário, devolve null e a
       seção simplesmente não aparece. */
    _avancoRealDe: function (orc) {
      if (!orc || typeof Fisico === "undefined" || !Fisico.pacote) return null;
      try {
        var E = Auth.empresaId();
        var obras = Store.listar(E, "obras") || [];
        var obra = null;
        for (var i = 0; i < obras.length; i++) if (obras[i].orcamentoId === orc.id) { obra = obras[i]; break; }
        if (!obra) return null;
        /* ⚠ O FILTRO É O `RDO.podeIrAoPortal`, e não uma comparação de status
           escrita aqui: essa regra já mudou uma vez (diário segurado na
           aprovação) e uma cópia dela apodreceria calada, deixando entrar no
           percentual do cliente um diário que o Portal não mostra. */
        var podeIr = (typeof RDO !== "undefined" && RDO.podeIrAoPortal) ? RDO.podeIrAoPortal : null;
        if (!podeIr) return null;
        var rdos = (Store.listar(E, "rdo") || []).filter(function (d) {
          return d.obraId === obra.id && podeIr(d);
        });
        if (!rdos.length) return null;
        var precos = [];
        (orc.etapas || []).forEach(function (et) {
          (et.itens || []).forEach(function (it) {
            precos.push({ origem: "orcamento", refId: it.id || "", codigo: it.codigo || "",
              descricao: it.descricao || "", unidade: it.unidade || "",
              valorUnitario: Util.num(it.precoUnitario != null ? it.precoUnitario : it.custoUnitario) });
          });
        });
        var pk = Fisico.pacote(rdos, obra.id, { precos: precos });
        return (pk && pk.serieMes) ? pk.serieMes : null;
      } catch (e) { return null; }
    },

    /* ⚠ o recado do MS Project diz o que FOI no arquivo: com o detalhe, "5
       etapas" escondia as subetapas e os serviços — e o que ficou fora
       (serviço sem quantidade não tem data; tarefa cujas partes não cobrem o
       prazo vai sem elas; elo circular entre subetapas). Números de
       MSProject.detalhar, o mesmo plano que gerou o arquivo. */
    _cronMSPResumo: function (r, det) {
      var oQue = r.etapas.length + " etapas", fora = [];
      if (det !== "etapa" && typeof MSProject !== "undefined" && MSProject.detalhar) {
        try {
          var pl = MSProject.detalhar(r, det), ct = pl && pl.ok ? pl.contagens : null;
          if (ct && ct.folhas) {
            oQue = ct.etapas + " etapas, " + ct.folhas + " subetapa(s)" + (det === "servico" ? " e " + ct.servicos + " serviço(s)" : "");
            if (ct.semBase) fora.push(ct.semBase + " serviço(s) sem quantidade não entraram (não têm data no cronograma)");
            if (pl.recolhidas.length) fora.push(pl.recolhidas.length + " tarefa(s) foram sem as partes de baixo, porque elas não cobrem o prazo da tarefa (ex.: subetapas todas marco) — o motivo está na nota da tarefa");
            if (ct.elosCortados) fora.push(ct.elosCortados + " dependência(s) circular(es) entre subetapas ficaram fora (o Project recusaria a rede)");
          }
        } catch (eP) { fora = []; }
      }
      return { oQue: oQue, fora: fora, depois: fora.length ? '<p class="muted" style="margin:0 0 10px;font-size:12.5px">' + Util.esc(fora.join(" · ")) + '.</p>' : '' };
    },
    cronMSProject: function () {
      var o = this._cronoOrcDoc(); if (!o) return;   // no plano de execução: o plano
      if (this._trialBloqueado()) { this._avisoTrial(); return; }
      if (typeof Cronograma === "undefined" || typeof MSProject === "undefined") { UI.toast("Módulo de cronograma indisponível.", "erro"); return; }
      if (!(o.etapas || []).length) { UI.toast("Adicione etapas para exportar o cronograma.", "erro"); return; }
      var Dx = this._cronoDocs(o), r = Dx.r;
      // sem opts.detalhe o XML é o de sempre; com ele, tarefas-resumo e subetapas (passo dos documentos)
      var xml = MSProject.gerarXML(o, r, { detalhe: Dx.detalhe });
      if (!xml) { UI.toast("Nada a exportar: o cronograma está vazio.", "erro"); return; }
      var nomeArq = MSProject.nomeArquivo(o);
      Util.baixar(nomeArq, xml, "application/xml;charset=utf-8");
      var RS = this._cronMSPResumo(r, Dx.detalhe);
      /* ⚠ TOAST NÃO SERVE AQUI, e isso foi medido no uso real: o Windows não
         associa `.xml` ao Project (o MSPDI é XML puro, e a associação padrão é
         o navegador ou o bloco de notas). Quem dá duplo clique — que é o que
         qualquer pessoa faz — vê o código cru e conclui que a exportação
         quebrou. O aviso de 2,6 s some antes de a pessoa achar o arquivo, e o
         passo que mais falta nem é óbvio: no seletor do Project o filtro vem em
         "Projetos", e o .xml simplesmente NÃO APARECE na lista até trocar para
         "Todos os arquivos". Por isso o passo a passo fica na tela até fechar. */
      UI.modal("Cronograma exportado para o MS Project",
        '<p style="margin:0 0 10px"><b>' + Util.esc(nomeArq) + '</b> — ' + Util.esc(RS.oQue) + ', com as dependências, os lags e os feriados.</p>' + RS.depois +
        '<div style="background:var(--surface-2,#eef2f7);border-left:4px solid var(--aco,#0d6ebd);border-radius:6px;padding:10px 14px;margin-bottom:10px">' +
        '<b>Duplo clique não abre no Project</b> — o Windows manda arquivo <code>.xml</code> para o navegador. O caminho é:</div>' +
        '<ol style="margin:0 0 10px 18px;line-height:1.9">' +
        '<li>Abra o <b>MS Project</b> (vazio)</li>' +
        '<li><b>Arquivo → Abrir → Procurar</b></li>' +
        '<li>No seletor, troque o tipo para <b>“Todos os arquivos (*.*)”</b> — sem isso o arquivo não aparece na lista</li>' +
        '<li>Escolha <b>' + Util.esc(nomeArq) + '</b></li>' +
        '<li>No assistente que abre: <b>“Como novo projeto”</b> → <b>Concluir</b></li>' +
        '</ol>' +
        '<p class="muted" style="font-size:12px;margin:0">Funciona igual no <b>ProjectLibre</b> e no <b>GanttProject</b>, que são gratuitos. ' +
        'Para ver o cronograma sem instalar nada, use o botão <b>Imprimir / PDF</b> ao lado.</p>',
        [{ texto: "Entendi", classe: "primary", onClick: function () { UI.fecharModal(); } }]);
    },

    // lê os inputs do form da aba Execução e grava em o.execucao.params (sem render)
    _execLerParams: function (o) {
      o.execucao = o.execucao || {};
      o.execucao.params = {
        dataInicio: (UI.el("exec-inicio") || {}).value || null,
        dataEntrega: (UI.el("exec-entrega") || {}).value || null,
        jornadaH: Math.min(12, Math.max(1, parseInt(Util.num((UI.el("exec-jornada") || {}).value), 10) || 8)),
        diasUteisSemana: Math.min(7, Math.max(1, parseInt(Util.num((UI.el("exec-dias") || {}).value), 10) || 5)),
        encargosPct: UI.el("exec-encargos") ? Math.min(150, Math.max(0, Util.num((UI.el("exec-encargos") || {}).value))) : undefined
      };
    },
    // Agente de execução — recalcular equipe/prazo/custo com os parâmetros
    execRecalc: function () {
      var o = this.orcAtual; if (!o) return;
      this._execLerParams(o);
      this.persistir(); this.render();
    },
    // Manda as durações dimensionadas pelo agente para o Cronograma (uma fonte de verdade)
    execEnviarCronograma: function () {
      var o = this.orcAtual; if (!o || typeof Execucao === "undefined") return;
      var alvo = this._cronoAlvo(); if (!alvo) return;
      if (alvo.travado) { this._cronoTravado(alvo); return; }
      /* ⚠ PLANO DE EXECUÇÃO (Fase 3): o orçamento é o APROVADO — os inputs da
         aba Execução não se gravam nele (o persistir recusa), então não entram
         em memória: valem os parâmetros gravados. E o início do plano é o da
         obra (não o da Execução, que é o da proposta): ver o dataInicio abaixo. */
      var noPlanoE = alvo.tipo === "plano";
      if (!noPlanoE && UI.el("exec-inicio")) this._execLerParams(o); // usa os inputs ATUAIS (não os salvos/stale)
      // durações do agente dependem só do Hh (não da diária), então colaboradores não são necessários aqui
      var sim = Execucao.simular(noPlanoE ? alvo.orc : o, {});
      /* ⚠ MODO EXECUTIVO: a etapa com subetapas não recebe a duração do Hh (ela
         vem das subetapas e o persistir a regravaria) — o motor a devolve em
         `puladas` e grava as SUBETAPAS. Sem passar `rede`, o toast anunciava
         "N etapas aplicadas" e o número não chegava à tela.
         `=== true`, como o motor lê (Cronograma.estimar/materializar): um "true"
         em texto não pode ligar a Execução num modo e o motor em outro. */
      var rede = !!(alvo.cron.exec && alvo.cron.exec.rede === true);
      // proveniência + limpeza de stale ficam no motor puro (testável): ver Execucao.aplicarNoCronograma
      var apl = Execucao.aplicarNoCronograma(alvo.cron, sim.etapas, { rede: rede });
      /* data local "AAAA-MM-DD" (Cronograma._ch), nunca toISOString: em UTC-3,
         depois das 21h, o ISO já é o dia seguinte */
      if (sim.params.dataInicio && !noPlanoE) {
        alvo.cron.params = alvo.cron.params || {};
        alvo.cron.params.dataInicio = (sim.dataInicio && typeof sim.dataInicio.getFullYear === "function" && typeof Cronograma !== "undefined") ? Cronograma._ch(sim.dataInicio) : sim.params.dataInicio;
      }
      // nº de meses = desembolso da PROPOSTA: só acompanha quando o alvo é o próprio orçamento
      if (alvo.tipo === "orc") { try { Orcamento.sincronizarPrazo(o); } catch (e) {} }
      if (alvo.salvar()) UI.toast(this._execMsgEnvio(apl, rede, (sim.etapas || []).length), "ok");
      this.render();
    },
    /* Recado do "Enviar ao cronograma" com os números VERDADEIROS do motor
       (Execucao.aplicarNoCronograma). No modo de hoje o texto é o de antes. */
    _execMsgEnvio: function (apl, rede, nEtapas) {
      apl = apl || {};
      var nEnv = apl.enviadas || 0;
      if (!rede) {
        var nPula = nEtapas - nEnv;
        return "Durações do agente aplicadas ao Cronograma (" + nEnv + " etapa" + (nEnv === 1 ? "" : "s") + (nPula > 0 ? "; " + nPula + " não estimável(is) não foram alteradas" : "") + ").";
      }
      var nComSub = 0, nSemBaseEt = 0;
      (apl.detalhe || []).forEach(function (d) {
        if (d.tipo !== "etapa") return;
        if (/subetapas/.test(d.motivo || "")) nComSub++; else nSemBaseEt++;
      });
      var p = [nEnv + " etapa(s) sem subetapas e " + (apl.folhasEnviadas || 0) + " subetapa(s) receberam a duração do Hh"];
      if (nComSub) p.push(nComSub + " etapa(s) com subetapas não recebem duração direta (no modo executivo ela vem das subetapas)");
      if (apl.folhasPreservadas) p.push(apl.folhasPreservadas + " subetapa(s) mantida(s) porque você ou a IA definiram a duração");
      var semBase = nSemBaseEt + (apl.folhasPuladas || 0);
      if (semBase) p.push(semBase + " sem base de mão de obra (não alteradas)");
      return "Execução → Cronograma: " + p.join("; ") + ".";
    },
    // ---- Parede-Cebola (Fase B): explode parede em camadas de serviço ----
    _paredeLerInputs: function () {
      var v = function (id) { return (UI.el(id) || {}).value; };
      return {
        nome: v("pc-nome") || "Parede",
        area: Util.num(v("pc-area")) || null,
        comprimento: Util.num(v("pc-comp")) || null,
        altura: Util.num(v("pc-alt")) || null,
        descontos: Util.num(v("pc-vaos")) || 0,
        faces: parseInt(v("pc-faces"), 10) || 2,
        receita: v("pc-receita") || "interna_pintura",
        incluiAlvenaria: (UI.el("pc-alv") || {}).checked !== false
      };
    },
    paredeExplodir: function () {
      var o = this.orcAtual; if (!o || typeof ParedeCebola === "undefined") return;
      var inp = this._paredeLerInputs();
      if (!(Util.num(inp.area) > 0) && !(Util.num(inp.comprimento) > 0 && Util.num(inp.altura) > 0)) {
        UI.toast("Informe a área (m²) ou comprimento × altura da parede.", "erro"); return;
      }
      var res = ParedeCebola.explodir(inp, { excluirFontes: this._fontesExcluidas() });
      this._pcPreview = { orcId: o.id, inputs: inp, resultado: res };  // transiente (não persistido/sincronizado)
      this.render();
      if (!(Util.num(res.parede.areaLiquida) > 0)) UI.toast("Área líquida = 0 (vãos ≥ área da parede). Revise a área ou os vãos — nada a aplicar.", "erro");
      else if (res.nPendentes || res.nRevisar) UI.toast(res.nOk + " camada(s) casaram; " + (res.nPendentes ? res.nPendentes + " sem código" : "") + (res.nPendentes && res.nRevisar ? " e " : "") + (res.nRevisar ? res.nRevisar + " p/ revisar" : "") + " — confira antes de aplicar.", "info");
    },
    paredeAplicar: function () {
      var o = this.orcAtual; if (!o || !this._pcPreview || this._pcPreview.orcId !== o.id || typeof ParedeCebola === "undefined") return;
      var res = this._pcPreview.resultado;
      // aplica overrides de candidato escolhidos nos selects (revisão do usuário)
      res.camadas.forEach(function (c) {
        var sel = document.querySelector('[data-pc-cand="' + c.seq + '"]');
        if (sel) {
          var idx = parseInt(sel.value, 10);
          if (!isNaN(idx) && c.candidatos[idx]) {
            c.escolhido = idx;
            var cand = c.candidatos[idx];
            /* re-checa unidade do candidato agora escolhido — pela MESMA régua
               do motor (v1.1.233). O compare cru repetia aqui o bug que o
               paredecebola.js já tinha corrigido: "m²".toUpperCase() é "M²",
               que não é "M2" — camada de base SICRO/SETOP mostrada como
               "casou" era derrubada para "revisar" NA HORA DE APLICAR e sumia
               do orçamento em silêncio. unidadeChave normaliza ²→2. */
            var div = Util.unidadeChave(cand.item.unidade) !== Util.unidadeChave(c.unidade);
            c.unidadeDivergente = div; c.status = div ? "revisar" : "ok";
          }
        }
      });
      // nenhuma camada aplicável (tudo pendente/revisar/qtd-0) → NÃO cria etapa vazia
      var nAplicaveis = res.camadas.filter(function (c) { return c.status === "ok" && Util.num(c.quantidade) > 0; }).length;
      if (!nAplicaveis) { UI.toast("Nenhuma camada aplicável (sem código casado ou quantidade 0) — resolva as pendências ou revise a área antes.", "erro"); return; }
      // etapa alvo: nova ("Parede — <nome>") ou existente — só cria a nova quando há o que aplicar
      var etSel = (UI.el("pc-etapa") || {}).value || "__nova__", etapaId = etSel;
      if (etSel === "__nova__") {
        Orcamento.addEtapa(o, "Parede — " + (res.parede.nome || "s/ nome"));
        etapaId = o.etapas[o.etapas.length - 1].id;
      }
      var out = ParedeCebola.aplicarNoOrcamento(o, etapaId, res.camadas);
      this.expandirEtapa(etapaId); // camadas novas não podem nascer escondidas numa etapa recolhida
      this._pcPreview = null;  // limpa o preview após aplicar
      this.aba = "planilha";  // leva o usuário pro orçamento pra ver as camadas
      this.persistir(); this.render();
      UI.toast(out.adicionadas + " camada(s) adicionada(s) ao orçamento" + (out.puladas ? " · " + out.puladas + " pulada(s) (sem código/unidade divergente)" : "") + ".", out.adicionadas ? "ok" : "info");
    },
    /* Refina as durações com a IA do ERP (planejador) — fonte de verdade =
       backend (a chave da IA fica lá). Nesta fase só as TRAVAS (espec 1.10);
       o diff com checkbox vem na Fase 4 (IAEdit).
       ⚠ O que cada trava impede — não simplificar sem ler:
       - CARIMBO (orcId + reqId + ids capturados no pedido) e casamento por ID:
         a resposta volta pelo índice `i` do pedido; se a pessoa reordenou ou
         apagou etapa durante a espera, o índice cai na etapa ERRADA. E se
         trocou de orçamento, a duração ia parar em outro orçamento.
       - AbortController de 60 s: sem ele a tela ficava esperando para sempre
         e o 2º clique disparava outra chamada paga.
       - faixa 1..999 dias, `i` fora da faixa ou repetido descartado: o
         servidor não confere o que o modelo escreve.
       - NÃO zera iaMotivos: zerar deixava etapa marcada "ia" sem motivo.
       - NÃO sobrescreve duração do USUÁRIO (sem marca de agente): a IA não
         desfaz decisão humana — vem em "puladas" e o recado diz.
       - modo executivo: etapa com subetapas recusada (a duração vem delas; o
         persistir regravaria e o "N refinadas" mentia).
       - aprovado: nem consulta; e se aprovou durante a espera, não aplica —
         nunca "N refinadas" com o salvar recusado. */
    cronRefinarIA: function () {
      var o = this.orcAtual; if (!o || !(o.etapas || []).length || typeof Cronograma === "undefined") return;
      var alvo = this._cronoAlvo(); if (!alvo) return;
      if (alvo.travado) { this._cronoTravado(alvo); return; }
      if (this._cronIA) { UI.toast("A IA ainda está respondendo ao pedido anterior — aguarde (no máximo 60 s).", "info"); return; }
      var r = Cronograma.estimar(alvo.orc), self = this;
      var etapas = alvo.orc.etapas.map(function (e, i) {
        return {
          i: i, id: e.id, nome: e.nome, categoria: r.etapas[i].categoriaNome, duracaoAtual: r.etapas[i].duracao,
          itens: (e.itens || []).slice(0, 15).map(function (it) { return { descricao: it.descricao, quantidade: it.quantidade, unidade: it.unidade }; })
        };
      });
      var pedido = { orcId: o.id, reqId: (this._cronIAReq = (this._cronIAReq || 0) + 1), ids: etapas.map(function (x) { return x.id; }) };
      var ctrl = null;
      try { if (typeof AbortController !== "undefined") ctrl = new AbortController(); } catch (eA) { ctrl = null; }
      this._cronIA = pedido;
      function vivo() { return self._cronIA === pedido; } // só o pedido CORRENTE aplica (o abortado já foi avisado)
      var timer = setTimeout(function () {
        if (!vivo()) return;
        self._cronIA = null;
        try { if (ctrl) ctrl.abort(); } catch (eAb) {}
        UI.toast("A IA não respondeu em 60 s — nada foi alterado no cronograma. Tente de novo.", "erro");
      }, 60000);
      function fim() { self._cronIA = null; try { clearTimeout(timer); } catch (eT) {} }
      var back = (typeof CONFIG !== "undefined" && CONFIG.iaBackend) ? CONFIG.iaBackend : "http://localhost:3041";
      UI.toast("" + (typeof Icones !== "undefined" ? Icones.get("ia", 15) : "") + " Consultando a IA do ERP (planejador)…", "ok");
      fetch(back + "/ia/cronograma", { method: "POST", headers: { "Content-Type": "application/json", "x-licenca": (typeof Licenca !== "undefined" ? Licenca.chave() : "") }, body: JSON.stringify({ etapas: etapas, equipes: (r.params.equipes || 1) }), signal: ctrl ? ctrl.signal : undefined })
        .then(function (resp) { return resp.json(); })
        .then(function (j) {
          if (!vivo()) return;
          fim();
          if (!j || !j.ok) { UI.toast("IA: " + ((j && j.error) || "não retornou") + " — nada foi alterado no cronograma.", "erro"); return; }
          if (!self.orcAtual || self.orcAtual.id !== pedido.orcId) {
            UI.toast("A resposta da IA chegou depois que você saiu do orçamento — nada foi gravado. Abra o orçamento e peça de novo.", "info");
            return;
          }
          var alvo2 = self._cronoAlvo();
          if (!alvo2 || alvo2.travado) { if (alvo2) self._cronoTravado(alvo2); return; } // aprovado durante a espera
          var comFolhas = {};
          try { Cronograma.eap(alvo2.orc).forEach(function (n) { if (n.tipo === "etapa" && n.papel === "resumo") comFolhas[n.id] = true; }); } catch (eE) {}
          var res = self._cronIAAplicar(alvo2.cron, pedido, j, {
            etapaIds: (alvo2.orc.etapas || []).map(function (e) { return e.id; }),
            comFolhas: comFolhas, rede: !!(alvo2.cron.exec && alvo2.cron.exec.rede === true)
          });
          var salvou = res.aplicadas.length ? alvo2.salvar() : true;
          if (salvou) UI.toast(self._cronIAMsg(res, alvo2.orc, j.provider), res.aplicadas.length ? "ok" : "info");
          else UI.toast("A IA sugeriu " + res.aplicadas.length + " duração(ões), mas o orçamento NÃO foi gravado — veja o aviso.", "erro");
          self.render();
        })
        ["catch"](function (e) {
          if (!vivo()) return;
          fim();
          UI.toast("Sem conexão com a IA: " + ((e && e.message) || "falha de rede") + " — confira a internet e se a licença está ativa. Nada foi alterado.", "erro");
        });
    },
    /* A DECISÃO do Refinar com IA, pura (sem tela, sem rede): testada
       executando em tools/test-crono-fiacao.js.
       cron = o objeto que se grava (alvo.cron); pedido = {ids:[etapaIds na
       ordem enviada]}; resposta = {etapas:[{i, dias, motivo, id?}]};
       opts = {etapaIds (etapas que existem AGORA), comFolhas {id:true}, rede}.
       Muta `cron` só nas aplicadas. Devolve {aplicadas:[{etapaId, dias, antes}],
       puladas:[{etapaId, motivo:"usuario"|"subetapas"|"marco", dias?, sugerido}],
       descartadas:[{i, motivo}]}. */
    _cronIAAplicar: function (cron, pedido, resposta, opts) {
      opts = opts || {};
      var out = { aplicadas: [], puladas: [], descartadas: [] };
      var ids = (pedido && Array.isArray(pedido.ids)) ? pedido.ids : [], existe = {}, vistos = {};
      var comF = opts.comFolhas || {}, rede = opts.rede === true;
      (opts.etapaIds || []).forEach(function (id) { existe[id] = true; });
      function obj(m) { return (m && typeof m === "object" && !Array.isArray(m)) ? m : {}; }
      function n(v) { var x = Number(v); return isFinite(x) ? x : 0; }
      function tem(m, k) { return Object.prototype.hasOwnProperty.call(m, k); }
      cron.duracoes = obj(cron.duracoes); cron.duracoesAgente = obj(cron.duracoesAgente);
      // ⚠ o mapa de motivos é PRESERVADO: só quem voltou nesta resposta ganha motivo novo
      cron.iaMotivos = obj(cron.iaMotivos);
      var marcos = obj(cron.marcos);
      var lista = (resposta && Array.isArray(resposta.etapas)) ? resposta.etapas : [];
      lista.forEach(function (x) {
        var i = (x && (typeof x.i === "number" || /^\d+$/.test(String(x && x.i)))) ? Number(x.i) : NaN;
        if (!(i >= 0 && i < ids.length && i % 1 === 0)) { out.descartadas.push({ i: x ? x.i : null, motivo: "i fora da faixa do pedido" }); return; }
        if (vistos[i]) { out.descartadas.push({ i: i, motivo: "etapa repetida na resposta" }); return; }
        vistos[i] = true;
        var id = ids[i]; // ⚠ o id CAPTURADO no pedido, nunca a posição de agora
        if (x.id != null && String(x.id) !== String(id)) { out.descartadas.push({ i: i, motivo: "id não confere com o pedido" }); return; }
        var bruto = typeof x.dias === "number" ? x.dias : (typeof x.dias === "string" && x.dias.trim() !== "" ? Number(x.dias.replace(",", ".")) : NaN);
        if (!(isFinite(bruto) && bruto >= 1 && bruto <= 999)) { out.descartadas.push({ i: i, motivo: "duração fora de 1 a 999 dias" }); return; }
        var dias = Math.round(bruto);
        if (!existe[id]) { out.descartadas.push({ i: i, motivo: "etapa não existe mais" }); return; }
        var ag = tem(cron.duracoesAgente, id) ? cron.duracoesAgente[id] : null;
        if (rede && (comF[id] || ag === "subetapas")) { out.puladas.push({ etapaId: id, motivo: "subetapas", sugerido: dias }); return; }
        if (marcos[id] === true) { out.puladas.push({ etapaId: id, motivo: "marco", sugerido: dias }); return; }
        var atual = tem(cron.duracoes, id) ? cron.duracoes[id] : null;
        if (n(atual) > 0 && !ag) { out.puladas.push({ etapaId: id, motivo: "usuario", dias: n(atual), sugerido: dias }); return; }
        cron.duracoes[id] = dias; cron.duracoesAgente[id] = "ia";
        cron.iaMotivos[id] = String(x.motivo == null ? "" : x.motivo).replace(/\s+/g, " ").trim().slice(0, 120);
        // `agenteAntes`: o recado diz quando a IA trocou um número RASTREÁVEL (Hh SINAPI, "exec") por um palpite
        out.aplicadas.push({ etapaId: id, dias: dias, antes: atual, agenteAntes: ag });
      });
      return out;
    },
    // recado do Refinar com IA: cada número que o motor decidiu, nada a mais
    _cronIAMsg: function (res, orc, provider) {
      var nomes = {};
      ((orc && orc.etapas) || []).forEach(function (e, i) { nomes[e.id] = (i + 1) + ". " + String(e.nome || "").slice(0, 30); });
      var us = [], sub = 0, marco = 0;
      res.puladas.forEach(function (p) {
        if (p.motivo === "usuario") us.push(p); else if (p.motivo === "subetapas") sub++; else marco++;
      });
      var nA = res.aplicadas.length, t = [];
      t.push(nA ? nA + " etapa(s) refinada(s) pela IA" + (provider ? " (" + provider + ")" : "") + " — passe o mouse no ícone da IA para ver o motivo"
        : "A IA não mudou nenhuma duração");
      /* ⚠ a duração da Execução vem do Hh do analítico SINAPI (I7: fonte
         rastreável); a da IA é sugestão. Trocar uma pela outra calado fazia os
         40 d do Hh virarem 8 d sem ninguém ver o antes. */
      var ex = res.aplicadas.filter(function (a) { return a.agenteAntes === "exec"; });
      if (ex.length) t.push((ex.length === 1 ? "1 delas trocou" : ex.length + " delas trocaram") + " a duração calculada pelo Hh SINAPI (aba Execução) pela da IA (" +
        ex.slice(0, 3).map(function (a) { return (nomes[a.etapaId] || "etapa") + ": Hh " + a.antes + " d → IA " + a.dias + " d"; }).join("; ") +
        (ex.length > 3 ? "; e mais " + (ex.length - 3) : "") + ") — para voltar ao Hh, reenvie pela aba Execução");
      if (us.length) t.push(us.length + " mantida(s) porque você definiu a duração (" +
        us.slice(0, 3).map(function (p) { return (nomes[p.etapaId] || "etapa") + ": você " + p.dias + " d, IA " + p.sugerido + " d"; }).join("; ") +
        (us.length > 3 ? "; e mais " + (us.length - 3) : "") + ") — para aceitar a sugestão, apague a sua duração e peça de novo");
      if (sub) t.push(sub + " etapa(s) com subetapas fora: no modo executivo a duração delas vem das subetapas");
      if (marco) t.push(marco + " marco(s) mantido(s)");
      if (res.descartadas.length) t.push(res.descartadas.length + " resposta(s) descartada(s) (fora de 1 a 999 dias, repetida ou etapa inexistente)");
      return t.join(". ") + ".";
    },

    /* =====================================================================
     * EDITAR COM IA (espec v2, 4.3 — Fase 4B): a TELA sobre o motor IAEdit.
     *
     * O padrão da casa (I9): a IA PROPÕE → o IAEdit VALIDA num universo
     * fechado → esta tela mostra o diff com checkbox → a PESSOA aplica →
     * desfazer de 1 nível. Aqui mora a fiação; toda decisão que dá para
     * testar sem tela é função pura (_iaErroRecado, _iaDecidir,
     * _iaConferirDisco, _iaPedidoHtml, _iaDiffHtml, _iaEfeitoHtml,
     * _iaPalavras, _iaAlternar), EXECUTADA em tools/test-ia-fiacao.js.
     *
     * ⚠ TEXTO DA IA É TEXTO DE TERCEIRO. Rótulo, "hoje", "proposto", motivo,
     *   perguntas, premissas e os motivos de recusa/descarte passam SEMPRE por
     *   Util.esc: o modelo lê descrições importadas de planilha alheia, e uma
     *   descrição com instrução embutida vira HTML no diff no dia em que alguém
     *   esquecer. Checkbox só com data-ia-idx NUMÉRICO; as ops ficam em memória
     *   (App._iaEd); nenhum texto em atributo de evento (memória "XSS por aspas
     *   em onclick": escapar HTML NÃO protege string JS dentro de onclick).
     * ⚠ UM ESTADO SÓ (App._iaEd). O carimbo {orcId, reqId, atualizadoEm,
     *   snapshot} nasce no Enviar e é o que liga a resposta ao pedido. Resposta
     *   de outro reqId, de outro orçamento ou que chega depois de fechar o
     *   pedido é descartada DIZENDO — nunca aplicada no que estiver aberto.
     * ⚠ O `cronRefinarIA` antigo (logo acima) ficou SEM PORTA na tela: o
     *   [Refinar com IA] (data-acao "cron-ia") abre este modal com o pedido
     *   pronto. Não religar: ele grava sem diff, com o validador próprio.
     * ===================================================================== */
    _iaEd: null,
    _iaSeq: 0,
    _IA_PRAZO_MS: 60000,
    _IA_ALVOS: [["planilha", "Planilha"], ["cronograma", "Cronograma"], ["documentos", "Textos da proposta"]],
    /* exemplos por alvo. ⚠ O da planilha traz a MEDIDA ESCRITA: a IA não usa
       número que a pessoa não escreveu (nem o da descrição do serviço — é o
       vetor da injeção), e sem medida no pedido ela pergunta */
    _IA_EXEMPLOS: {
      planilha: ["No serviço 2.3, a alvenaria é uma parede de 12 m por 2,8 m.",
        "Crie a subetapa Térreo na etapa 3 e mova para ela os serviços de reboco.",
        "Renomeie a etapa 4 para Instalações hidrossanitárias."],
      cronograma: ["Refine a duração de cada etapa pelo porte dos serviços.",
        "A pintura só começa depois que a alvenaria terminar.",
        "Marque a entrega da obra como marco."],
      documentos: ["Reescreva a apresentação num tom mais direto, sem mudar o que ela promete.",
        "Nas premissas, diga que água e energia do canteiro são do contratante.",
        "Organize o que não está incluso em itens curtos."]
    },
    _IA_REGRA: {
      planilha: "A medida precisa estar escrita no pedido: a IA não usa número que você não escreveu (nem o da descrição do serviço) e, sem ele, pergunta.",
      cronograma: "O que você definiu à mão vem desmarcado no diff. Subetapa só se edita com o cronograma executivo ligado.",
      documentos: "Número, %, R$ ou data só entram se já estiverem no texto ou escritos no seu pedido; o que faltar sai como [preencher: …]. Pagamento, prazo e validade ficam com você, no modal Dados."
    },
    _IA_ROTULO_OP: { alterar_quantidade: "Quantidade", criar_etapa: "Nova etapa", renomear_etapa: "Nome de etapa",
      criar_subetapa: "Nova subetapa", renomear_subetapa: "Nome de subetapa", mover_item_para_subetapa: "Mover serviço",
      definir_duracao: "Duração", definir_dependencia: "Depende de", marcar_marco: "Marco", definir_equipes: "Equipes",
      alterar_texto: "Texto da proposta", alterar_memoria_calculo: "Memória de cálculo" },

    /* ---------------- decisões PURAS (testadas executando) ---------------- */

    /* o chip que o modal abre marcado: o assunto da aba em que a pessoa está */
    _iaChipPadrao: function (aba) {
      return (aba === "cronograma" || aba === "execucao") ? "cronograma" : "planilha";
    },
    /* o texto enviado é o pedido pronto de Refinar? (espaços das pontas e
       repetidos não contam — a pessoa pode ter clicado no fim do texto) */
    _iaEhPedidoRefinar: function (p) {
      return typeof IAEdit !== "undefined" && !!IAEdit.PEDIDO_REFINAR &&
        String(p == null ? "" : p).replace(/\s+/g, " ").trim() === IAEdit.PEDIDO_REFINAR;
    },

    /* O recado de cada falha da rota. ⚠ Recado é interface: diz o que
       aconteceu, o que fazer, e que NADA foi alterado. O 404 NÃO é
       "indisponível": é o servidor de IA antigo, sem a rota /ia/editar — um
       "indisponível" educado seria lido como estado normal por meses (memória
       "erro educado esconde defeito"). `corpo.error` vem do NOSSO servidor
       (nunca o texto do provedor) e vai só em texto puro (toast/textContent). */
    _iaErroRecado: function (status, corpo) {
      var err = "";
      try { err = String((corpo && (corpo.error || corpo.erro)) || "").replace(/\s+/g, " ").trim().slice(0, 200); } catch (eE) { err = ""; }
      var entre = err ? " (" + err + ")" : "", nada = " Nada foi alterado.";
      if (status === "offline") return "Sem conexão com o servidor de IA — confira a internet e tente de novo." + nada;
      if (status === "prazo") return "A IA não respondeu em 60 s — o pedido foi cancelado. Tente de novo, pedindo menos coisa por vez." + nada;
      if (status === 403) return "A edição por IA é do plano licenciado — o servidor de IA não aceitou a licença deste aparelho" + entre + ". Confira a licença em 🔑." + nada;
      if (status === 404) return "O servidor de IA ainda não tem a edição — peça a atualização do servidor à RA Engenharia." + nada;
      if (status === 413) return "Pedido grande demais para a IA" + entre + " — escolha as etapas em “Etapas deste pedido” ou peça menos coisa por vez." + nada;
      if (status === 429) {
        var s = Number(corpo && corpo.tenteEm);
        var quando = (isFinite(s) && s > 0) ? (s >= 90 ? "em " + Math.ceil(s / 60) + " min" : "em " + Math.ceil(s) + " s") : "daqui a 1 min";
        return "Limite de pedidos à IA atingido — tente de novo " + quando + "." + nada;
      }
      if (status === 502) return "A IA respondeu fora do combinado" + entre + " — tente de novo, pedindo menos coisa por vez." + nada;
      if (status === 503) return "O servidor de IA não está pronto para a edição" + entre + " — avise o suporte da RA Engenharia." + nada;
      if (status === 504) return "A IA passou do prazo no servidor — tente de novo, pedindo menos coisa por vez." + nada;
      return "O servidor de IA respondeu com erro " + (typeof status === "number" ? status : "desconhecido") + entre + " — tente de novo; se repetir, avise o suporte." + nada;
    },

    /* o que fazer com a resposta: {tipo:"diff", ops, descartadas, perguntas,
       premissas} | {tipo:"antigo"} (servidor sem /ia/editar e pedido pronto
       de Refinar: cai na rota velha) | {tipo:"erro", recado} */
    _iaDecidir: function (status, j, ctx) {
      ctx = ctx || {};
      function lista(v) { return Array.isArray(v) ? v : []; }
      if (status === 200 && j && j.ok && j.resultado && typeof j.resultado === "object") {
        if (ctx.reqId && j.reqId && j.reqId !== ctx.reqId) {
          return { tipo: "erro", recado: "A resposta da IA não é deste pedido (carimbo diferente) — descartada. Peça de novo. Nada foi alterado." };
        }
        var r = j.resultado;
        return { tipo: "diff", ops: lista(r.ops), descartadas: lista(r.descartadas), descartadasAlem: Number(r.descartadasAlem) || 0,
          perguntas: lista(r.perguntas).slice(0, 3).map(function (x) { return String(x == null ? "" : x).slice(0, 300); }),
          premissas: lista(r.premissas).slice(0, 5).map(function (x) { return String(x == null ? "" : x).slice(0, 300); }) };
      }
      /* ⚠ SÓ O PEDIDO PRONTO, E INTACTO, cai na rota antiga (revisão 4B). A rota
         /ia/cronograma não recebe o pedido — ela só refina durações. Quem abria
         pelo atalho e REESCREVIA o pedido ("a pintura só começa depois da
         alvenaria") recebia, numa 2ª chamada paga, durações que não pediu. O
         `pronto` diz de onde o modal abriu; o TEXTO enviado diz o que se pede. */
      if (status === 404 && ctx.pronto === "refinar" && ctx.alvo === "cronograma" && this._iaEhPedidoRefinar(ctx.pedido)) return { tipo: "antigo" };
      if (status === 200) return { tipo: "erro", recado: this._iaErroRecado(502, (j && j.ok === false) ? j : { error: "a resposta veio sem resultado" }) };
      return { tipo: "erro", recado: this._iaErroRecado(status, j) };
    },

    /* ⚠ RELÊ O DISCO ANTES DE APLICAR (crítica ia-seguranca, item 1). A nuvem
       grava o merge no Store mas NÃO troca o orcAtual aberto: validar contra a
       memória não enxerga a edição feita no outro aparelho, e o persistir em
       seguida a mandaria para _conflitoDe (acima de ~50 KB ela se perde). O
       pedido guarda o atualizadoEm; mudou no disco, não aplica.
       car = carimbo; disco = {existe, atualizadoEm} | null (ilegível);
       memoria = atualizadoEm do objeto aberto (distingue "salvou aqui"). */
    _iaConferirDisco: function (car, disco, memoria) {
      var plano = car && car.cronTipo === "plano", nada = " Nada foi aplicado.";
      if (!car) return { ok: false, recado: "Sem o carimbo do pedido — peça de novo." + nada };
      if (disco === null || disco === undefined) return { ok: false, recado: "Não consegui ler " + (plano ? "o plano de execução da obra" : "este orçamento") + " no armazenamento deste aparelho — recarregue o app e peça de novo." + nada };
      if (!disco.existe) return { ok: false, recado: (plano ? "O plano de execução da obra não está mais neste aparelho" : "Este orçamento não está mais neste aparelho (apagado em outro?)") + " — reabra e peça de novo." + nada };
      if (String(disco.atualizadoEm || "") === String(car.atualizadoEm || "")) return { ok: true };
      if (plano) return { ok: false, recado: "O plano de execução da obra mudou enquanto a IA respondia (neste ou em outro aparelho) — reabra o cronograma e peça de novo." + nada };
      if (memoria != null && String(memoria) === String(disco.atualizadoEm || "")) {
        return { ok: false, recado: "Você salvou outra alteração neste orçamento enquanto a IA respondia — peça de novo, para a IA partir do que está na tela." + nada };
      }
      return { ok: false, recado: "Este orçamento mudou em outro aparelho enquanto a IA respondia — reabra e peça de novo." + nada };
    },

    /* dd/mm (ou dd/mm/aaaa) de "AAAA-MM-DD" ou de um ISO com hora. ⚠ ISO com
       hora é UTC: a data que vale é a LOCAL (22h em Brasília já é amanhã no ISO) */
    _iaDia: function (s, comAno) {
      var t = String(s == null ? "" : s), m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
      if (!m) return "—";
      if (t.length > 10) {
        var d = new Date(t);
        if (!isNaN(d.getTime())) return ("0" + d.getDate()).slice(-2) + "/" + ("0" + (d.getMonth() + 1)).slice(-2) + (comAno ? "/" + d.getFullYear() : "");
      }
      return m[3] + "/" + m[2] + (comAno ? "/" + m[1] : "");
    },

    /* TEXTO LONGO, palavra a palavra: o que sai (em "Hoje") e o que entra (em
       "Proposto") marcados. LCS sobre os pedaços (palavra ou espaço); cada
       pedaço sai por Util.esc. ⚠ Teto da tabela: acima de 250 mil células a
       marcação some e fica o texto inteiro — nunca a aba travada no diff. */
    _iaPalavras: function (de, para) {
      var esc = Util.esc;
      function tok(s) { return String(s == null ? "" : s).split(/(\s+)/).filter(function (x) { return x !== ""; }); }
      function branco(x) { return /^\s+$/.test(x); }
      var A = tok(de), B = tok(para), n = A.length, m = B.length, i, j;
      if (n * m > 250000) return { de: esc(de), para: esc(para), marcado: false, mudancas: null };
      var L = new Array(n + 1);
      for (i = 0; i <= n; i++) { L[i] = new Array(m + 1); L[i][m] = 0; }
      for (j = 0; j <= m; j++) L[n][j] = 0;
      for (i = n - 1; i >= 0; i--) {
        for (j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : (L[i + 1][j] >= L[i][j + 1] ? L[i + 1][j] : L[i][j + 1]);
      }
      var SAI = '<del style="background:#fee2e2;color:#991b1b">', ENTRA = '<mark style="background:#dcfce7;color:#166534">';
      var oa = "", ob = "", mud = 0;
      function tira(x) { if (branco(x)) oa += esc(x); else { oa += SAI + esc(x) + "</del>"; mud++; } }
      function poe(x) { if (branco(x)) ob += esc(x); else { ob += ENTRA + esc(x) + "</mark>"; mud++; } }
      i = 0; j = 0;
      while (i < n && j < m) {
        if (A[i] === B[j]) { oa += esc(A[i]); ob += esc(B[j]); i++; j++; }
        else if (L[i + 1][j] >= L[i][j + 1]) { tira(A[i]); i++; }
        else { poe(B[j]); j++; }
      }
      while (i < n) { tira(A[i]); i++; }
      while (j < m) { poe(B[j]); j++; }
      return { de: oa, para: ob, marcado: true, mudancas: mud };
    },

    /* o antes → depois do conjunto MARCADO. ⚠ OS TRÊS TOTAIS (revisão 4A): o
       da proposta (sem opcionais), o dos opcionais, e o total com opcionais —
       que é o "VALOR TOTAL DA PROPOSTA" da proposta CLÁSSICA. Mostrar um só
       fazia "R$ X → R$ X" enquanto a clássica subia 42%. O que muda leva
       "(muda)" escrito (cor não é a única pista). */
    _iaEfeitoHtml: function (ef, nMarc, nTotal) {
      var esc = Util.esc, self = this;
      var h = '<div class="muted" style="font-size:12px;margin-bottom:4px">' + esc(nMarc + " de " + nTotal + " mudança(s) marcada(s) — o efeito abaixo é só o das marcadas") + '</div>';
      if (!ef || !ef.antes || !ef.depois) return h + '<p class="muted" style="margin:0">Não consegui calcular o efeito antes → depois — confira os totais e o prazo na planilha depois de aplicar.</p>';
      var a = ef.antes, b = ef.depois;
      function din(v) { return v == null ? "—" : Util.fmtMoeda(v); }
      function pz(v) { return v == null ? "—" : v + " dias úteis"; }
      function dia(v) { return v == null ? "—" : self._iaDia(v, true); }
      var linhas = [
        ["Total da proposta (sem opcionais)", din(a.totalProposta), din(b.totalProposta), a.totalProposta !== b.totalProposta],
        ["Opcionais (adicionais)", din(a.totalOpcional), din(b.totalOpcional), a.totalOpcional !== b.totalOpcional],
        ["Total com opcionais (o que a proposta clássica imprime)", din(a.totalComOpcionais), din(b.totalComOpcionais), a.totalComOpcionais !== b.totalComOpcionais],
        ["Prazo", pz(a.prazoDiasUteis), pz(b.prazoDiasUteis), a.prazoDiasUteis !== b.prazoDiasUteis],
        ["Término", dia(a.termino), dia(b.termino), a.termino !== b.termino]
      ];
      h += '<table style="width:100%;font-size:12.5px;border-collapse:collapse"><tr><th style="text-align:left">Efeito</th><th style="text-align:right">Hoje</th><th></th><th style="text-align:right">Com as marcadas</th></tr>';
      linhas.forEach(function (l) {
        h += '<tr' + (l[3] ? ' data-ia-muda="1"' : '') + '><td>' + esc(l[0]) + '</td><td style="text-align:right">' + esc(l[1]) + '</td><td style="text-align:center">→</td>' +
          '<td style="text-align:right;' + (l[3] ? 'font-weight:700;color:#b45309' : '') + '">' + esc(l[2]) + (l[3] ? " (muda)" : "") + '</td></tr>';
      });
      h += '</table>';
      if (ef.desfazerBytes > ef.tetoDesfazer) {
        h += '<p style="color:#b91c1c;font-size:12.5px;margin:6px 0 0">' + (typeof Icones !== "undefined" ? Icones.get("alerta", 15) : "") + esc("Esta edição passa do teto do desfazer (" + Math.ceil(ef.desfazerBytes / 1024) + " KB; o teto é " +
          Math.ceil(ef.tetoDesfazer / 1024) + " KB): aplicada assim, ela NÃO terá o botão Desfazer. Desmarque algumas para ter o desfazer.") + '</p>';
      }
      var nao = Util.arr(ef.naoAplicadas);
      if (nao.length) {
        h += '<p style="color:#b45309;font-size:12px;margin:6px 0 0">' + esc(nao.length + " das marcadas não entraria(m): ") +
          nao.slice(0, 5).map(function (x) { return esc(x.rotulo) + " — " + esc(x.motivo); }).join("; ") + '</p>';
      }
      return h;
    },

    _iaExemplosHtml: function (alvo) {
      var esc = Util.esc, ex = this._IA_EXEMPLOS[alvo] || this._IA_EXEMPLOS.planilha, rg = this._IA_REGRA[alvo] || this._IA_REGRA.planilha;
      return '<div class="muted" style="font-size:12px"><b>Exemplos</b><ul style="margin:4px 0 4px 18px">' +
        ex.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + '</ul><div style="color:#b45309">' + esc(rg) + '</div></div>';
    },

    /* o modal do PEDIDO: aviso fixo de privacidade, chips de alvo (rádio — a
       troca não redesenha e não perde o que foi digitado), o pedido, os
       exemplos do alvo e a escolha de etapas (a porta do "escolha as etapas":
       recado que manda escolher precisa de onde escolher) */
    _iaPedidoHtml: function (st, orc) {
      var esc = Util.esc, alvo = st.alvo || "planilha", teto = (typeof IAEdit !== "undefined" && IAEdit.TETOS) ? IAEdit.TETOS.pedidoCaracteres : 1500;
      var aviso = (typeof IAEdit !== "undefined" && IAEdit.AVISO_PRIVACIDADE) || "O pedido e os textos selecionados vão ao provedor de IA.";
      var h = '<div data-modal-largo="1">';
      h += '<p style="font-size:12.5px;margin:0 0 10px;padding:7px 10px;border-radius:6px;border:1px solid var(--linha)">🔒 ' + esc(aviso) + '</p>';
      h += '<div class="muted" style="font-size:12px;margin-bottom:4px">O que a IA pode mudar neste pedido</div><div class="flex" role="radiogroup" style="gap:8px;flex-wrap:wrap;margin-bottom:10px">';
      this._IA_ALVOS.forEach(function (x) {
        h += '<label style="display:inline-flex;gap:6px;align-items:center;border:1px solid var(--linha);border-radius:999px;padding:4px 12px;cursor:pointer">' +
          '<input type="radio" name="ia-alvo" id="ia-alvo-' + x[0] + '" value="' + x[0] + '" data-ia-alvo-chip="1"' + (x[0] === alvo ? " checked" : "") + '> ' + esc(x[1]) + '</label>';
      });
      h += '</div>';
      h += '<div class="field"><label for="ia-pedido">O que mudar</label><textarea id="ia-pedido" rows="5" maxlength="' + Number(teto) + '" placeholder="' +
        esc("Ex.: renomeie a etapa 3 para Revestimentos. Medida vai escrita (parede de 12 por 2,8).") + '">' + esc(st.pedido || "") + '</textarea></div>';
      h += '<label style="display:flex;gap:6px;align-items:center;font-size:12.5px;margin:-4px 0 8px"><input type="checkbox" id="ia-memoria"' + (st.memoria ? " checked" : "") +
        '> incluir as memórias de cálculo (só em Textos da proposta — a IA reescreve a redação, nunca a conta)</label>';
      h += '<div id="ia-exemplos">' + this._iaExemplosHtml(alvo) + '</div>';
      var es = (orc && orc.etapas) || [];
      if (es.length) {
        h += '<details style="margin-top:8px"' + (st.etapasIdx && Object.keys(st.etapasIdx).length ? " open" : "") + '><summary style="cursor:pointer;font-size:12.5px">' +
          'Etapas deste pedido (opcional — sem marcar nenhuma, vão as citadas no pedido, ou todas)</summary><div style="max-height:180px;overflow:auto;margin-top:6px;font-size:12.5px">';
        es.forEach(function (e, i) {
          h += '<label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="ia-etapa-' + i + '"' + (st.etapasIdx && st.etapasIdx[i] ? " checked" : "") + '> ' +
            (i + 1) + ". " + esc(e && e.nome) + '</label>';
        });
        h += '</div></details>';
      }
      h += '<p id="ia-status" role="status" aria-live="polite" style="margin:8px 0 0;font-weight:600">' + esc(st.recado || "") + '</p>';
      return h + '</div>';
    },

    /* uma linha do diff: checkbox (só o número), rótulo, Hoje → Proposto
       (texto longo: Hoje em cima, Proposto embaixo, palavras marcadas), a
       memória da conta, o motivo da IA e por que veio desmarcada */
    _iaOpHtml: function (a, st) {
      var esc = Util.esc, idx = Math.floor(Number(a && a.idx));
      if (!isFinite(idx) || idx < 0) return "";
      var de = String(a.deTexto == null ? "" : a.deTexto), pa = String(a.paraTexto == null ? "" : a.paraTexto);
      var longo = a.grupo === "documentos" || de.length > 60 || pa.length > 60 || /\n/.test(de + pa);
      var h = '<div class="ia-op" style="border:1px solid var(--linha);border-radius:6px;padding:8px 10px;margin-bottom:6px">' +
        '<label style="display:flex;gap:8px;align-items:flex-start;cursor:pointer"><input type="checkbox" id="ia-chk-' + idx + '" data-ia-idx="' + idx + '"' +
        (st.marcados && st.marcados[idx] ? " checked" : "") + ' style="margin-top:3px"><b>' + esc(a.rotulo) + '</b></label>';
      if (longo) {
        var p = this._iaPalavras(de, pa);
        h += '<div style="font-size:12.5px;margin:6px 0 0 24px"><div class="muted">Hoje</div><div style="white-space:pre-wrap;border-left:3px solid #94a3b8;padding-left:8px">' + p.de + '</div>' +
          '<div class="muted" style="margin-top:6px">Proposto</div><div style="white-space:pre-wrap;border-left:3px solid #16a34a;padding-left:8px">' + p.para + '</div></div>';
      } else {
        h += '<div style="font-size:12.5px;margin:4px 0 0 24px"><span class="muted">Hoje:</span> ' + esc(de) + ' <span aria-hidden="true">→</span> <span class="muted">Proposto:</span> <b>' + esc(pa) + '</b></div>';
      }
      if (a.memoria) h += '<div class="muted" style="font-size:12px;margin:4px 0 0 24px;white-space:pre-wrap">Conta: ' + esc(a.memoria) + '</div>';
      if (a.motivo) h += '<div class="muted" style="font-size:12px;margin:4px 0 0 24px">Motivo da IA: ' + esc(a.motivo) + '</div>';
      if (a.motivoDesmarcada) h += '<div style="font-size:12px;margin:4px 0 0 24px;color:#b45309">Veio desmarcada: ' + esc(a.motivoDesmarcada) + '</div>';
      if (a.nota) h += '<div style="font-size:12px;margin:4px 0 0 24px;color:#1d4ed8">' + esc(a.nota) + '</div>';
      if (a.dependeDe && a.dependeDe.length) h += '<div class="muted" style="font-size:12px;margin:4px 0 0 24px">Depende de uma criação desta lista — desmarcar a criação desmarca esta.</div>';
      return h + '</div>';
    },

    /* o DIFF inteiro, agrupado por alvo: perguntas da IA no topo; aceitas com
       checkbox; recusadas pelo app e descartadas pelo servidor com o motivo;
       o efeito antes → depois embaixo (redesenhado a cada checkbox) */
    _iaDiffHtml: function (st) {
      var esc = Util.esc, self = this, res = st.res || { aceitas: [], recusadas: [], avisos: [] }, dec = st.dec || {};
      var ROT = this._IA_ROTULO_OP;
      function nomeOp(x) { var k = String(x == null ? "" : x); return Object.prototype.hasOwnProperty.call(ROT, k) ? ROT[k] : (k || "?"); }
      var perg = Util.arr(dec.perguntas), prem = Util.arr(dec.premissas), aceitas = Util.arr(res.aceitas);
      var h = '<div data-modal-largo="1">';
      if (perg.length) {
        h += '<div style="border:1px solid #f59e0b;border-radius:6px;padding:8px 10px;margin-bottom:10px"><b>A IA perguntou</b> <span class="muted" style="font-size:12px">— responda num pedido novo ([Voltar ao pedido]); o que está abaixo não depende da resposta</span>' +
          '<ul style="margin:6px 0 0 18px">' + perg.map(function (q) { return "<li>" + esc(q) + "</li>"; }).join("") + '</ul></div>';
      }
      if (prem.length) h += '<div class="muted" style="font-size:12.5px;margin-bottom:8px"><b>A IA assumiu:</b> ' + prem.map(function (p) { return esc(p); }).join(" · ") + '</div>';
      if (dec.rotaAntiga) h += '<p class="muted" style="font-size:12.5px;margin:0 0 6px">O servidor de IA ainda é o antigo: o pedido de refinar foi pela rota antiga, e as durações passaram pela mesma conferência.</p>';
      Util.arr(res.avisos).forEach(function (a) { h += '<p style="font-size:12.5px;margin:0 0 6px;color:#1d4ed8">' + esc(a) + '</p>'; });
      h += '<p id="ia-recado" role="alert" style="color:#b91c1c;font-weight:600;margin:0 0 6px">' + esc(st.recado || "") + '</p>';
      if (!aceitas.length) h += '<p style="margin:8px 0"><b>Nenhuma mudança aproveitável nesta resposta.</b> <span class="muted">Os motivos estão abaixo — ajuste o pedido e peça de novo.</span></p>';
      var grupos = { planilha: [], cronograma: [], documentos: [] };
      aceitas.forEach(function (a) { if (!grupos[a.grupo]) grupos[a.grupo] = []; grupos[a.grupo].push(a); });
      var ROTG = { planilha: "Planilha", cronograma: st.carimbo && st.carimbo.cronTipo === "plano" ? "Cronograma — plano de execução da obra" : "Cronograma", documentos: "Textos da proposta" };
      Object.keys(grupos).forEach(function (g) {
        var l = grupos[g];
        if (!l.length) return;
        h += '<h3 style="margin:12px 0 6px;font-size:14px">' + esc(ROTG[g] || g) + ' <span class="muted" style="font-weight:400">(' + l.length + ')</span></h3>';
        l.forEach(function (a) { h += self._iaOpHtml(a, st); });
      });
      var rec = Util.arr(res.recusadas);
      if (rec.length) {
        h += '<details style="margin-top:10px"' + (aceitas.length ? '' : ' open') + '><summary style="cursor:pointer">' + rec.length + ' mudança(s) recusada(s) pelo app — não entram</summary><ul style="margin:6px 0 0 18px;font-size:12.5px">' +
          rec.map(function (r) { return '<li><b>' + esc(nomeOp(r.op && r.op.op)) + '</b> — ' + esc(r.motivo) + '</li>'; }).join("") + '</ul></details>';
      }
      var desc = Util.arr(dec.descartadas);
      if (desc.length || dec.descartadasAlem) {
        h += '<details style="margin-top:6px"' + (aceitas.length ? '' : ' open') + '><summary style="cursor:pointer">' + (desc.length + (Number(dec.descartadasAlem) || 0)) + ' mudança(s) descartada(s) pelo servidor de IA</summary><ul style="margin:6px 0 0 18px;font-size:12.5px">' +
          desc.map(function (d) { return '<li><b>' + esc(nomeOp(d && d.op)) + '</b> — ' + esc(d && d.motivo) + '</li>'; }).join("") +
          (dec.descartadasAlem ? '<li>' + esc("e mais " + dec.descartadasAlem) + '</li>' : '') + '</ul></details>';
      }
      var antigas = Util.arr(dec.antigoDescartadas);
      if (antigas.length) {
        h += '<details style="margin-top:6px" open><summary style="cursor:pointer">' + antigas.length + ' resposta(s) da rota antiga descartada(s)</summary><ul style="margin:6px 0 0 18px;font-size:12.5px">' +
          antigas.map(function (d) { return '<li>' + esc(d && d.motivo) + '</li>'; }).join("") + '</ul></details>';
      }
      var nMarc = 0;
      aceitas.forEach(function (a) { if (st.marcados && st.marcados[a.idx]) nMarc++; });
      h += '<div id="ia-efeito" style="margin-top:12px;border-top:1px solid var(--linha);padding-top:8px">' + this._iaEfeitoHtml(st.efeito, nMarc, aceitas.length) + '</div>';
      return h + '</div>';
    },

    /* marca/desmarca UMA mudança. O fecho vem do motor: desmarcar a criação
       desmarca quem depende dela (a subetapa nova, o serviço movido para ela),
       e marcar o filho sem o pai não pega. Devolve o que a tela redesenha. */
    _iaAlternar: function (idx, marcado) {
      var st = this._iaEd, o = this.orcAtual;
      if (!st || st.fase !== "diff" || !st.res || !o) return null;
      idx = Math.floor(Number(idx));
      if (!isFinite(idx)) return null;
      var lista = [];
      Object.keys(st.marcados || {}).forEach(function (k) { if (st.marcados[k] && Number(k) !== idx) lista.push(Number(k)); });
      if (marcado) lista.push(idx);
      var fc = IAEdit.fechoDesmarcar(st.res.aceitas, lista);
      st.marcados = {};
      fc.marcados.forEach(function (i) { st.marcados[i] = true; });
      st.efeito = this._iaEfeitoAgora(st, o);
      return { marcados: fc.marcados, desmarcadosPorPai: fc.desmarcadosPorPai, efeito: st.efeito, pegou: !marcado || !!st.marcados[idx] };
    },
    _iaEfeitoAgora: function (st, o) {
      var marcadas = Util.arr(st.res && st.res.aceitas).filter(function (a) { return st.marcados && st.marcados[a.idx]; });
      try { return IAEdit.efeito(o, marcadas, st.efOpts || {}); } catch (eF) { return null; }
    },
    _iaListaMotivos: function (lista) {
      var l = Util.arr(lista);
      if (!l.length) return "";
      return l.slice(0, 3).map(function (x) { return String((x && x.rotulo) || "mudança") + ": " + String((x && x.motivo) || ""); }).join("; ") + (l.length > 3 ? "; e mais " + (l.length - 3) : "");
    },
    _iaDesfazerRotulo: function (ed) {
      var por = String((ed && ed.por) || "").trim();
      return "edição da IA por " + (por ? por.slice(0, 40) : "alguém") + " em " + this._iaDia(ed && ed.em);
    },

    /* ---------------- a fiação (tela, rede, armazenamento) ---------------- */

    /* ⚠ a MESMA regra do Escopo Inteligente por IA (Auth.podeUsar
       "escopoIA"): conferida ao abrir E ao enviar — botão escondido não é guarda */
    _iaPode: function () {
      if (typeof Auth !== "undefined" && Auth.podeUsar && !Auth.podeUsar("escopoIA")) {
        UI.toast("Editar com IA é recurso PRO (a mesma regra do Escopo Inteligente por IA). Faça upgrade para usar.", "erro");
        return false;
      }
      return true;
    },
    /* opts = {alvo?, pronto? ("refinar" = o pedido pronto do atalho da aba Cronograma)} */
    iaEditarAbrir: function (opts) {
      opts = opts || {};
      var o = this.orcAtual;
      if (!o) return;
      if (typeof IAEdit === "undefined") { UI.toast("A edição por IA não carregou neste aparelho (js/iaedit.js) — recarregue o app com Ctrl+Shift+R.", "erro"); return; }
      if (!this._iaPode()) return;
      if (this._iaEd && this._iaEd.fase === "enviando") { UI.toast("A IA ainda está respondendo ao pedido anterior — aguarde (no máximo 60 s).", "info"); return; }
      var refinar = opts.pronto === "refinar";
      this._iaEd = { fase: "pedido", orcId: o.id, alvo: refinar ? "cronograma" : (opts.alvo || this._iaChipPadrao(this.aba)),
        pronto: refinar ? "refinar" : "", pedido: refinar ? IAEdit.PEDIDO_REFINAR : String(opts.pedido || ""), recado: "", memoria: false, etapasIdx: {} };
      this._iaModalPedido();
    },
    _iaModalPedido: function () {
      var self = this, st = this._iaEd;
      if (!st) return;
      UI.modal("Editar com IA", this._iaPedidoHtml(st, this.orcAtual), [
        { texto: "Cancelar", classe: "ghost", onClick: function () { self._iaCancelar(); } },
        { texto: "Enviar à IA", classe: "primary", onClick: function () { self.iaEditarEnviar(); } }
      ]);
    },
    _iaCancelar: function () {
      var st = this._iaEd;
      if (st) {
        if (st.timer) { try { clearTimeout(st.timer); } catch (eT) {} st.timer = null; }
        if (st.fase === "enviando" && st.ctrl) { try { st.ctrl.abort(); } catch (eA) {} }
        st.fase = "cancelado";
      }
      this._iaEd = null;
      UI.fecharModal();
    },
    _iaVoltarPedido: function () {
      var st = this._iaEd;
      if (!st) return;
      st.fase = "pedido"; st.recado = "";
      this._iaModalPedido();
    },
    _iaStatus: function (msg) { var el = UI.el("ia-status"); if (el) el.textContent = String(msg == null ? "" : msg); },
    _iaRecadoDiff: function (msg) { var el = UI.el("ia-recado"); if (el) el.textContent = String(msg == null ? "" : msg); if (this._iaEd) this._iaEd.recado = String(msg == null ? "" : msg); },
    /* o que está no formulário do pedido (por id — sem seletor de CSS) */
    _iaLerFormulario: function (orc) {
      var f = { alvo: null, pedido: "", memoria: false, etapaIds: [], etapasIdx: {} };
      this._IA_ALVOS.forEach(function (x) { var el = UI.el("ia-alvo-" + x[0]); if (el && el.checked) f.alvo = x[0]; });
      f.pedido = String((UI.el("ia-pedido") || {}).value || "");
      f.memoria = !!(UI.el("ia-memoria") || {}).checked;
      ((orc && orc.etapas) || []).forEach(function (e, i) {
        var el = UI.el("ia-etapa-" + i);
        if (el && el.checked && e && e.id != null) { f.etapaIds.push(e.id); f.etapasIdx[i] = true; }
      });
      return f;
    },
    /* monta o corpo e o CARIMBO. Alvo cronograma com o orçamento aprovado e
       obra (ou o plano escolhido): o que se edita é o PLANO DE EXECUÇÃO da obra
       (_cronoAlvo) — o contexto sai do plano e o carimbo guarda o registro. */
    _iaPreparar: function (o, f) {
      var alvo = f.alvo || "planilha", cronAlvo = null, plano = null, obra = null, carimboEm = o.atualizadoEm || null, cronTipo = "orc";
      if (alvo === "cronograma") {
        var a = null;
        try { a = this._cronoAlvo(); } catch (eA) { a = null; }
        if (a && a.tipo === "plano" && a.plano) { cronAlvo = a.cron; plano = a.plano; obra = a.obra || null; cronTipo = "plano"; carimboEm = a.plano.atualizadoEm || null; }
      }
      var reqId = "ia" + (this._iaSeq = (this._iaSeq || 0) + 1) + "-" + Date.now().toString(36);
      var ctx = IAEdit.contexto(o, (alvo === "documentos" && f.memoria) ? "memoria" : alvo, f.pedido,
        { etapaIds: f.etapaIds && f.etapaIds.length ? f.etapaIds : null, reqId: reqId, cronAlvo: cronAlvo });
      if (!ctx || !ctx.ok) {
        var e = String((ctx && ctx.erro) || "não consegui montar o pedido");
        if (/escolha as etapas/.test(e)) e += " — marque as etapas em “Etapas deste pedido”, logo abaixo, ou cite-as no texto (ex.: etapas 2 a 4)";
        return { ok: false, erro: e.charAt(0).toUpperCase() + e.slice(1) + ". Nada foi enviado." };
      }
      return { ok: true, ctx: ctx, carimbo: { orcId: o.id, reqId: reqId, atualizadoEm: carimboEm, snapshot: ctx.snapshot, alvo: alvo, cronTipo: cronTipo,
        planoId: plano ? plano.id : null, obraNome: obra ? String(obra.nome || "") : "" } };
    },
    _iaPost: function (caminho, corpo, ctrl) {
      var back = (typeof CONFIG !== "undefined" && CONFIG.iaBackend) ? CONFIG.iaBackend : "http://localhost:3041";
      return fetch(back + caminho, { method: "POST", headers: { "Content-Type": "application/json", "x-licenca": (typeof Licenca !== "undefined" ? Licenca.chave() : "") },
        body: JSON.stringify(corpo), signal: ctrl ? ctrl.signal : undefined })
        .then(function (r) {
          var s = (r && typeof r.status === "number") ? r.status : 200;
          return r.json().then(function (j) { return { status: s, j: j }; }, function () { return { status: s, j: {} }; });
        });
    },
    /* espera com prazo: AbortController de 60 s e o `vivo` do carimbo (só a
       resposta do pedido CORRENTE segue; a abortada já foi avisada) */
    _iaEsperar: function (st, caminho, corpo, aoChegar) {
      var self = this, reqId = st.carimbo.reqId, ctrl = null;
      try { if (typeof AbortController !== "undefined") ctrl = new AbortController(); } catch (eC) { ctrl = null; }
      st.ctrl = ctrl; st.fase = "enviando";
      function vivo() { return self._iaEd === st && st.fase === "enviando" && st.carimbo && st.carimbo.reqId === reqId; }
      function fim() { if (st.timer) { try { clearTimeout(st.timer); } catch (eT) {} st.timer = null; } if (st.fase === "enviando") st.fase = "pedido"; }
      st.timer = setTimeout(function () {
        if (!vivo()) return;
        fim();
        try { if (ctrl) ctrl.abort(); } catch (eAb) {}
        self._iaFalha(st, self._iaErroRecado("prazo"));
      }, this._IA_PRAZO_MS);
      this._iaPost(caminho, corpo, ctrl).then(function (x) {
        if (!vivo()) return;
        fim();
        try { aoChegar(x); } catch (eX) { self._iaFalha(st, "Não consegui montar a conferência da resposta (" + String((eX && eX.message) || eX).slice(0, 120) + ") — nada foi alterado."); }
      }, function () {
        if (!vivo()) return;
        fim();
        self._iaFalha(st, self._iaErroRecado("offline"));
      });
    },
    iaEditarEnviar: function () {
      var st = this._iaEd, o = this.orcAtual, self = this;
      if (!st || !o || st.orcId !== o.id || typeof IAEdit === "undefined") return;
      /* ⚠ TRAVA DE CLIQUE DUPLO: cada Enviar é uma chamada PAGA ao provedor, e
         sem resposta visível a pessoa clica de novo */
      if (st.fase === "enviando") { this._iaStatus("A IA ainda está respondendo a este pedido — aguarde (no máximo 60 s)."); return; }
      if (!this._iaPode()) return;
      var f = this._iaLerFormulario(o);
      if (f.alvo) st.alvo = f.alvo;
      f.alvo = st.alvo;
      st.pedido = f.pedido; st.memoria = f.memoria; st.etapasIdx = f.etapasIdx;
      var prep = this._iaPreparar(o, f);
      if (!prep.ok) { st.recado = prep.erro; this._iaStatus(prep.erro); return; }
      st.carimbo = prep.carimbo; st.recado = "";
      var pedidoEnviado = f.pedido;   // o texto que FOI (o da caixa pode mudar enquanto a IA responde)
      this._iaStatus("Enviando à IA… (até 60 s)");
      this._iaEsperar(st, "/ia/editar", prep.ctx.corpo, function (x) {
        var dec = self._iaDecidir(x.status, x.j, { reqId: st.carimbo.reqId, pronto: st.pronto, alvo: st.alvo, pedido: pedidoEnviado });
        if (dec.tipo === "antigo") { self._iaRotaAntiga(st); return; }
        if (dec.tipo === "erro") { self._iaFalha(st, dec.recado); return; }
        self._iaMostrarDiff(st, dec);
      });
    },
    _iaFalha: function (st, recado) {
      if (st.fase === "enviando") st.fase = "pedido";
      st.recado = recado;
      /* ⚠ UM LUGAR SÓ PARA O RECADO (revisão 4B): com o modal do pedido aberto
         ele vai na linha de status, que fica. O toast repetido empilhava sobre
         o rodapé do modal — medido na foto: 7 toasts cobrindo o [Enviar à IA]
         e a própria linha de status depois de erros seguidos. Toast só quando
         não há modal do pedido para dizer. */
      if (this._iaEd === st && UI.el("ia-pedido")) { this._iaStatus(recado); return; }
      UI.toast(recado, "erro");
    },
    /* a mesma regra no DIFF: o recado vai na linha dele (role=alert); toast só
       se o diff não estiver na tela */
    _iaAvisoDiff: function (msg) {
      var naTela = !!UI.el("ia-recado");
      this._iaRecadoDiff(msg);
      if (!naTela) UI.toast(msg, "erro");
    },
    _iaDescartar: function (st, msg) {
      if (this._iaEd === st) this._iaEd = null;
      UI.toast(msg, "info");
    },
    /* 404 no /ia/editar com o pedido pronto de Refinar: o servidor ainda é o
       antigo. O pedido cai na rota velha /ia/cronograma (o mesmo corpo que o
       Refinar de antes mandava), e a resposta vira ops definir_duracao
       (IAEdit.deCronogramaAntigo, casadas pelo id CAPTURADO aqui) que passam
       pelo MESMO validar e pelo MESMO diff — duas portas com validadores
       diferentes era o defeito (crítica ia-seguranca, item 11). */
    _iaRotaAntiga: function (st) {
      var self = this, o = this.orcAtual, a = null, r = null;
      if (!o || o.id !== st.orcId) { this._iaDescartar(st, "A resposta da IA chegou depois que você saiu do orçamento — nada foi alterado."); return; }
      try { a = this._cronoAlvo(); } catch (eA) { a = null; }
      if (!a || (a.tipo === "plano") !== (st.carimbo.cronTipo === "plano")) { this._iaFalha(st, "O cronograma desta aba mudou enquanto a IA respondia — peça de novo. Nada foi alterado."); return; }
      try { r = Cronograma.estimar(a.orc); } catch (eR) { r = null; }
      if (!r) { this._iaFalha(st, "Não consegui calcular o cronograma para o pedido pela rota antiga — nada foi alterado."); return; }
      var etapas = (a.orc.etapas || []).map(function (e, i) {
        var re = r.etapas[i] || {};
        return { i: i, id: e.id, nome: e.nome, categoria: re.categoriaNome, duracaoAtual: re.duracao,
          itens: (e.itens || []).slice(0, 15).map(function (it) { return { descricao: it.descricao, quantidade: it.quantidade, unidade: it.unidade }; }) };
      });
      var etapaIds = etapas.map(function (x) { return x.id; });
      st.carimbo.reqId = st.carimbo.reqId + "-antigo";
      this._iaStatus("O servidor de IA ainda é o antigo — mandando o pedido de refinar pela rota antiga… (até 60 s)");
      this._iaEsperar(st, "/ia/cronograma", { etapas: etapas, equipes: (r.params && r.params.equipes) || 1 }, function (x) {
        if (x.status !== 200) { self._iaFalha(st, self._iaErroRecado(x.status, x.j)); return; }
        if (!x.j || x.j.ok === false || !Array.isArray(x.j.etapas)) {
          self._iaFalha(st, "A IA (rota antiga) não devolveu durações" + (x.j && x.j.error ? " (" + String(x.j.error).slice(0, 200) + ")" : "") + " — nada foi alterado.");
          return;
        }
        var conv = IAEdit.deCronogramaAntigo(x.j, { etapaIds: etapaIds, snapshot: st.carimbo.snapshot });
        if (conv.erro) { self._iaFalha(st, "A IA (rota antiga): " + conv.erro + " — nada foi alterado."); return; }
        self._iaMostrarDiff(st, { tipo: "diff", ops: conv.ops, descartadas: [], antigoDescartadas: conv.descartadas, perguntas: [], premissas: [], rotaAntiga: true });
      });
    },
    /* a obra do orçamento tem diário? (o renomear_etapa ganha o recado do
       Portal, que ainda casa etapa pelo nome até a próxima publicação) */
    _iaObraComDiario: function (o) {
      try {
        var info = (typeof UI !== "undefined" && UI._cronoObraInfo) ? UI._cronoObraInfo(o) : null, ids = {}, tem = false;
        Util.arr(info && info.obras).forEach(function (x) { var ob = x && (x.obra || x); if (ob && ob.id) { ids[ob.id] = true; tem = true; } });
        if (!tem) return false;
        return Util.arr(Store.listar(Auth.empresaId(), "rdo")).some(function (r) { return r && ids[r.obraId]; });
      } catch (eO) { return false; }
    },
    _iaValidar: function (st, o, ops) {
      var opts = {};
      if (st.carimbo.cronTipo === "plano") {
        var a = null;
        try { a = this._cronoAlvo(); } catch (eA) { a = null; }
        if (!a || a.tipo !== "plano" || !a.plano || a.plano.id !== st.carimbo.planoId) {
          return { erro: "O cronograma que a IA recebeu era o plano de execução da obra, e esta aba não está mais nele — peça de novo. Nada foi alterado." };
        }
        opts.cronAlvo = a.cron;
      }
      opts.obraComDiario = this._iaObraComDiario(o);
      return { res: IAEdit.validar(o, ops, st.carimbo.snapshot, opts), efOpts: { cronAlvo: opts.cronAlvo || null } };
    },
    _iaMostrarDiff: function (st, dec) {
      var o = this.orcAtual;
      if (!o || o.id !== st.orcId) { this._iaDescartar(st, "A resposta da IA chegou depois que você saiu do orçamento — nada foi alterado. Abra o orçamento e peça de novo."); return; }
      if (!UI.el("ia-pedido")) { this._iaDescartar(st, "A resposta da IA chegou depois que você fechou o pedido — nada foi alterado. Peça de novo se quiser."); return; }
      var v = this._iaValidar(st, o, dec.ops);
      if (v.erro) { this._iaFalha(st, v.erro); return; }
      st.dec = dec; st.ops = dec.ops; st.res = v.res; st.efOpts = v.efOpts; st.recado = "";
      var marc = [];
      v.res.aceitas.forEach(function (a) { if (a.marcadaPorPadrao) marc.push(a.idx); });
      var fc = IAEdit.fechoDesmarcar(v.res.aceitas, marc);
      st.marcados = {};
      fc.marcados.forEach(function (i) { st.marcados[i] = true; });
      st.efeito = this._iaEfeitoAgora(st, o);
      st.fase = "diff";
      this._iaModalDiff(st);
    },
    _iaModalDiff: function (st) {
      var self = this, o = this.orcAtual;
      var travado = st.carimbo.cronTipo !== "plano" && !!(o && Orcamento.travadoPorAprovacao && Orcamento.travadoPorAprovacao(o));
      var bts = [{ texto: "Cancelar", classe: "ghost", onClick: function () { self._iaCancelar(); } },
        { texto: "Voltar ao pedido", classe: "ghost", onClick: function () { self._iaVoltarPedido(); } }];
      if (Util.arr(st.res && st.res.aceitas).length) {
        bts.push(travado
          ? { texto: "Criar revisão e aplicar nela", classe: "success", onClick: function () { self.iaEditarRevisao(); } }
          : { texto: "Aplicar selecionadas", classe: "primary", onClick: function () { self.iaEditarAplicar(); } });
      }
      UI.modal("Editar com IA — confira antes de aplicar", this._iaDiffHtml(st), bts);
    },
    /* change do checkbox (data-ia-idx): o motor decide o fecho e o efeito; a
       tela só acerta as caixas e redesenha o efeito */
    _iaAlternarTela: function (idx, marcado) {
      var r = this._iaAlternar(idx, marcado), st = this._iaEd;
      if (!r || !st) return;
      Util.arr(st.res.aceitas).forEach(function (a) { var el = UI.el("ia-chk-" + a.idx); if (el) el.checked = !!st.marcados[a.idx]; });
      var ef = UI.el("ia-efeito");
      if (ef) ef.innerHTML = this._iaEfeitoHtml(st.efeito, r.marcados.length, st.res.aceitas.length);
      this._iaRecadoDiff(r.pegou ? "" : "Essa mudança depende de uma criação desmarcada — marque a criação primeiro.");
    },
    _iaLerDisco: function (car) {
      var eid = null;
      try { eid = Auth.empresaId(); } catch (eE) { return null; }
      if (car.cronTipo === "plano") {
        var l = null;
        try { l = Store.listar(eid, (typeof CronoBase !== "undefined" && CronoBase.ENTIDADE) || "crono_obra"); } catch (eL) { return null; }
        if (!Array.isArray(l)) return null;
        for (var i = 0; i < l.length; i++) if (l[i] && l[i].id === car.planoId) return { existe: true, atualizadoEm: l[i].atualizadoEm || null, iaEm: (l[i].iaEdicao && l[i].iaEdicao.em) || null };
        return { existe: false };
      }
      var d = null;
      try { d = Store.obterOrcamento(eid, car.orcId); } catch (eO) { return null; }
      /* iaEm = o carimbo do retrato do desfazer GRAVADO (o desfazer confere) */
      return d ? { existe: true, atualizadoEm: d.atualizadoEm || null, iaEm: (d.iaEdicao && d.iaEdicao.em) || null } : { existe: false };
    },
    _iaCarimbo: function (st) {
      return { em: Util.agoraISO(), por: this._cronoPor(), pedido: (st.carimbo && st.carimbo.snapshot && st.carimbo.snapshot.pedido) || st.pedido, alvo: st.alvo };
    },
    /* por que o salvar recusou, dito sem inventar: o persistir recusa por modo
       demonstração/licença suspensa ou por armazenamento; o do plano tem mais
       motivos (módulo, lista ilegível, teto), e cada um já saiu no aviso dele.
       A porta do armazenamento é a do aviso do Store (js/store.js, gravar) —
       não "apague a base SINAPI": ela mora no IndexedDB e não ocupa o que
       está cheio. */
    _iaPorqueNaoGravou: function (ehPlano) {
      var trial = false, adm = true;
      try { trial = !!this._trialBloqueado(); } catch (eT) { trial = false; }
      try { adm = !(typeof Auth !== "undefined" && Auth.ehAdmin && !Auth.ehAdmin()); } catch (eA) { adm = true; }
      if (trial) return "este aparelho está em modo demonstração ou com a licença suspensa — ative a licença em 🔑";
      if (ehPlano) return "o motivo está no aviso ao pé da tela";
      return adm ? "o armazenamento deste aparelho recusou (cheio?) — faça 💾 Backup e veja o que ocupa espaço em 🗂 Tabelas › Saúde do armazenamento"
        : "o armazenamento deste aparelho recusou (cheio?) — avise o administrador da conta";
    },
    /* volta um objeto ao retrato JSON, NO LUGAR (as referências continuam) */
    _iaRestaurar: function (obj, json) {
      if (!obj || !json) return;
      var v = JSON.parse(json), k;
      for (k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) delete obj[k];
      for (k in v) if (Object.prototype.hasOwnProperty.call(v, k)) obj[k] = v[k];
    },
    iaEditarAplicar: function () {
      var st = this._iaEd, o = this.orcAtual, m;
      if (!st || st.fase !== "diff" || !st.res) return;
      if (!o || o.id !== st.orcId) { UI.fecharModal(); this._iaDescartar(st, "Você saiu do orçamento que fez o pedido — nada foi aplicado."); return; }
      var marcadas = st.res.aceitas.filter(function (a) { return st.marcados && st.marcados[a.idx]; });
      if (!marcadas.length) { this._iaRecadoDiff("Nenhuma mudança marcada — marque as que quer aplicar."); return; }
      var cd = this._iaConferirDisco(st.carimbo, this._iaLerDisco(st.carimbo), o.atualizadoEm);
      if (!cd.ok) { this._iaAvisoDiff(cd.recado); return; }
      var ehPlano = st.carimbo.cronTipo === "plano", alvoP = null, opts = {};
      if (!ehPlano && Orcamento.travadoPorAprovacao && Orcamento.travadoPorAprovacao(o)) {
        /* aprovado ENQUANTO o diff estava aberto: o botão que vale agora é o da revisão */
        st.recado = "Este orçamento foi aprovado enquanto você conferia — o aprovado não muda; use [Criar revisão e aplicar nela].";
        this._iaModalDiff(st);
        return;
      }
      if (ehPlano) {
        try { alvoP = this._cronoAlvo(); } catch (eA) { alvoP = null; }
        if (!alvoP || alvoP.tipo !== "plano" || !alvoP.plano || alvoP.plano.id !== st.carimbo.planoId) {
          m = "O cronograma desta aba não é mais o plano de execução que a IA recebeu — peça de novo. Nada foi aplicado.";
          this._iaAvisoDiff(m); return;
        }
        /* ⚠ destinoDesfazer = o REGISTRO do plano: sem ele o IAEdit guardaria o
           desfazer (com o e-mail de quem pediu) no orçamento aprovado — e o
           motor recusa com {erro}, que é mostrado */
        opts = { cronAlvo: alvoP.cron, destinoDesfazer: alvoP.plano };
      }
      var bkO = JSON.stringify(o), bkP = alvoP ? JSON.stringify(alvoP.plano) : null, res;
      try { res = IAEdit.aplicar(o, marcadas, this._iaCarimbo(st), opts); }
      catch (eX) {
        this._iaRestaurar(o, bkO); if (alvoP) this._iaRestaurar(alvoP.plano, bkP);
        res = { erro: "falhou ao aplicar (" + String((eX && eX.message) || eX).slice(0, 120) + ")" };
      }
      if (res.erro) {
        /* o erro do motor já diz "nada foi aplicado" — não repetir */
        m = /nada foi/i.test(res.erro) ? res.erro.charAt(0).toUpperCase() + res.erro.slice(1) + "." : "Nada foi aplicado: " + res.erro + ".";
        this._iaAvisoDiff(m); return;
      }
      if (!res.n) { m = "Nada foi aplicado — " + (this._iaListaMotivos(res.naoAplicadas) || "nenhuma das marcadas passou na conferência final") + "."; this._iaAvisoDiff(m); return; }
      /* ⚠ semBackupModal (revisão 4B): na PRIMEIRA recusa o persistir abre o
         modal de backup para o administrador — por cima do diff, que sumia com
         a resposta já paga, e o _iaEd ficava em "diff" sem tela nenhuma
         (medido na e2e). Aqui o diff fica, com o recado dizendo o que fazer; o
         aviso do persistir (toast) continua. */
      var salvou = ehPlano ? alvoP.salvar({ daIA: true }) : this.persistir({ daIA: true, semBackupModal: true });
      if (!salvou) {
        /* ⚠ NADA GRAVADO = NADA MUDADO NA TELA: a memória volta ao retrato, senão
           a planilha mostraria a edição que o disco não tem */
        this._iaRestaurar(o, bkO); if (alvoP) this._iaRestaurar(alvoP.plano, bkP);
        m = "A IA aplicaria " + res.n + " mudança(s), mas NADA foi gravado: " + this._iaPorqueNaoGravou(ehPlano) + ". " +
          (ehPlano ? "O plano de execução" : "O orçamento") + " ficou como estava, e as mudanças continuam aqui — resolva e clique de novo em Aplicar.";
        st.recado = m;
        /* ⚠ nunca "diff" sem tela: se outro modal tomou o lugar (o do modo
           demonstração, um aviso do plano), o diff volta com o recado */
        if (UI.el("ia-recado")) this._iaRecadoDiff(m); else this._iaModalDiff(st);
        return;
      }
      try { this.backupAuto({ urgente: true }); } catch (eB) {}
      this._iaEd = null;
      UI.fecharModal();
      this.render();
      this._iaResultado(res, ehPlano ? (st.carimbo.obraNome || "desta obra") : "", false);
    },
    /* o recado do que foi feito: o NÚMERO aplicado, o que não entrou, e onde
       fica a volta (ou que não há volta) */
    _iaResultado: function (res, plano, soModal) {
      var nao = Util.arr(res.naoAplicadas);
      if (!soModal) {
        var msg = res.n + " mudança(s) da IA aplicada(s)" + (plano ? " no plano de execução da obra " + plano : "") + ".";
        if (nao.length) msg += " " + nao.length + " não entrou(aram) — veja a lista.";
        var sd = String(res.semDesfazer || "");
        msg += sd ? " " + sd.charAt(0).toUpperCase() + sd.slice(1) : " Para voltar: Desfazer edição da IA, na barra do orçamento.";
        UI.toast(msg, (nao.length || res.semDesfazer) ? "info" : "ok");
      }
      if (!nao.length && !res.semDesfazer) return;
      UI.modal("Editar com IA — aplicado com ressalvas",
        '<p style="margin-top:0">' + Util.esc(res.n + " mudança(s) aplicada(s).") + '</p>' +
        (res.semDesfazer ? '<p style="color:#b91c1c">' + Util.esc(res.semDesfazer) + '</p>' : '') +
        (nao.length ? '<p><b>Não entraram:</b></p><ul style="margin:6px 0 0 18px;font-size:12.5px">' +
          nao.map(function (x) { return "<li><b>" + Util.esc((x && x.rotulo) || "mudança") + "</b> — " + Util.esc(x && x.motivo) + "</li>"; }).join("") + "</ul>" : ""),
        [{ texto: "Entendi", classe: "primary", onClick: function () { UI.fecharModal(); } }]);
    },
    /* ⚠ APROVADO → [Criar revisão e aplicar nela] (crítica ia-seguranca, item
       15). O criarRevisao de sempre abre a revisão e troca o orcAtual — o
       carimbo descartaria a resposta como "você saiu do orçamento" — e pode
       recusar pelo limite do plano, levando junto o diff (já pago). Aqui: o
       limite ANTES; a revisão por Orcamento.novaRevisao; as ops REVALIDADAS
       contra ela; aplica; grava; e SÓ ENTÃO abre. Recusou em qualquer ponto:
       nada foi criado e o diff continua aberto com o recado. */
    iaEditarRevisao: function () {
      var st = this._iaEd, o = this.orcAtual, m;
      if (!st || st.fase !== "diff" || !st.res) return;
      if (!o || o.id !== st.orcId) { UI.fecharModal(); this._iaDescartar(st, "Você saiu do orçamento que fez o pedido — nada foi aplicado."); return; }
      var marcIdx = [];
      Object.keys(st.marcados || {}).forEach(function (k) { if (st.marcados[k]) marcIdx.push(Number(k)); });
      if (!marcIdx.length) { this._iaRecadoDiff("Nenhuma mudança marcada — marque as que quer levar para a revisão."); return; }
      var cd = this._iaConferirDisco(st.carimbo, this._iaLerDisco(st.carimbo), o.atualizadoEm);
      if (!cd.ok) { this._iaAvisoDiff(cd.recado); return; }
      if (this._trialBloqueado()) { this._avisoTrial(); return; }
      var eid = Auth.empresaId();
      try {
        var lim = Auth.limite("limiteOrcamentos"), qtd = Store.listarOrcamentos(eid).length;
        if (lim && qtd >= lim) {
          m = "Limite de " + lim + " orçamento(s) do seu plano atingido — a revisão é um orçamento novo. Nada foi criado; as mudanças continuam aqui.";
          this._iaAvisoDiff(m); return;
        }
      } catch (eL) {}
      var rev = Orcamento.novaRevisao(o, Util.agoraISO());
      if (!rev) { m = "Não consegui montar a revisão deste orçamento — nada foi criado."; this._iaAvisoDiff(m); return; }
      /* ⚠ REVALIDA CONTRA A REVISÃO: o retrato é do aprovado, e o validar recusa
         retrato de outro orçamento. A revisão preserva os ids de etapa e de
         serviço (novaRevisao), então o MESMO retrato com o id dela confere cada
         ponto contra o documento que vai ser gravado. */
      var S2 = JSON.parse(JSON.stringify(st.carimbo.snapshot));
      S2.orcId = rev.id;
      var res2 = IAEdit.validar(rev, st.ops, S2, {});
      var fc = IAEdit.fechoDesmarcar(res2.aceitas, marcIdx), ok2 = {};
      fc.marcados.forEach(function (i) { ok2[i] = true; });
      var aceitas2 = res2.aceitas.filter(function (a) { return ok2[a.idx]; });
      var perdidas = marcIdx.filter(function (i) { return !ok2[i]; }).map(function (i) {
        var rc = res2.recusadas.filter(function (x) { return x.idx === i; })[0], ac = st.res.aceitas.filter(function (x) { return x.idx === i; })[0];
        return { rotulo: ac ? ac.rotulo : "mudança " + (i + 1), motivo: rc ? rc.motivo : "depende de uma criação que não passou na revisão" };
      });
      if (!aceitas2.length) {
        m = "Na revisão, nenhuma das mudanças marcadas passou de novo pela conferência — nada foi criado. " + this._iaListaMotivos(perdidas);
        this._iaAvisoDiff(m); return;
      }
      var res3 = IAEdit.aplicar(rev, aceitas2, this._iaCarimbo(st), {});
      if (res3.erro || !res3.n) {
        m = "Nada foi aplicado na revisão (" + (res3.erro || this._iaListaMotivos(res3.naoAplicadas) || "nenhuma passou") + ") — nada foi criado.";
        this._iaAvisoDiff(m); return;
      }
      try { this._materializarSeExec(rev); } catch (eM) {}   // a revisão nasce com o gravado igual ao prazo que ela mostra (como no criarRevisao)
      if (!Store.salvarOrcamento(eid, rev)) {
        m = "A revisão NÃO foi gravada — o armazenamento deste aparelho recusou (cheio?). Nada foi criado; o aprovado continua intacto.";
        this._iaAvisoDiff(m); return;
      }
      this._avisouTravado = null;
      this._iaEd = null;
      UI.fecharModal();
      this.abrirOrcamento(rev.id);
      try { this.backupAuto({ urgente: true }); } catch (eB) {}
      res3.naoAplicadas = perdidas.concat(Util.arr(res3.naoAplicadas));
      UI.toast("Revisão " + rev.numero + " criada a partir do aprovado " + (o.numero || "") + ", com " + res3.n + " mudança(s) da IA — o aprovado continua intacto. Para voltar: Desfazer edição da IA.", "ok");
      this._iaResultado(res3, "", true);
    },

    /* ---------------- desfazer (1 nível) ---------------- */

    /* o desfazer do ORÇAMENTO ainda vale? ed = o retrato em memória; disco =
       _iaLerDisco (null = ilegível); memoriaEm = atualizadoEm do aberto. Vale
       só se o gravado é o MESMO que está na tela e carrega o MESMO retrato.
       Cada recusa diz o que aconteceu e onde está a versão certa. */
    _iaDesfazerVale: function (ed, disco, memoriaEm) {
      var nada = " Nada foi desfeito.";
      if (disco === null || disco === undefined) return { ok: false, recado: "Não consegui ler este orçamento no armazenamento deste aparelho — recarregue o app." + nada };
      if (!disco.existe) return { ok: false, recado: "Este orçamento não está mais neste aparelho (apagado em outro?) — volte à lista de orçamentos." + nada };
      if (String(disco.atualizadoEm || "") !== String(memoriaEm || "")) {
        return { ok: false, recado: "Este orçamento mudou em outro aparelho depois da edição da IA — o desfazer não vale mais (voltaria por cima do que foi feito lá). Reabra o orçamento para ver a versão atual." + nada };
      }
      if (!disco.iaEm || !ed || String(disco.iaEm) !== String(ed.em || "")) {
        return { ok: false, recado: "A edição da IA já não está no orçamento gravado (houve edição depois dela) — o desfazer não vale mais. Reabra o orçamento." + nada };
      }
      return { ok: true };
    },

    /* onde está o desfazer que vale para o orçamento aberto: no ORÇAMENTO
       (destravado), ou no PLANO da obra (aprovado com obra, ou plano escolhido) */
    _iaDesfazerInfo: function (orc) {
      if (!orc) return null;
      var trav = !!(typeof Orcamento !== "undefined" && Orcamento.travadoPorAprovacao && Orcamento.travadoPorAprovacao(orc));
      /* no aprovado o desfazer do ORÇAMENTO recusa sempre ("o aprovado não se
         desfaz") — botão que sempre recusa é porta falsa; não aparece */
      if (!trav && orc.iaEdicao && Array.isArray(orc.iaEdicao.inversos)) {
        /* ⚠ O DESFAZER CONFERE O DISCO (revisão 4B, achado alto). A nuvem grava
           o merge no Store e NÃO troca o orcAtual aberto. Sem esta conferência
           o desfazer revertia a memória velha e a gravava por cima do que a
           colega fez no outro aparelho — cujo persistir humano já tinha
           apagado o retrato lá (medido: a garantia dela voltou a "Conforme a
           lei", e o toast disse "desfeita"). Mesma régua do Aplicar. */
        var v = this._iaDesfazerVale(orc.iaEdicao, this._iaLerDisco({ orcId: orc.id }), orc.atualizadoEm);
        return { ed: orc.iaEdicao, destino: "orcamento", vale: v.ok, recado: v.recado || "" };
      }
      var ep = !!(this._cronoEditaPlano && typeof this._cronoEditaPlano === "object" && this._cronoEditaPlano[orc.id] === true);
      if ((!trav && !ep) || orc !== this.orcAtual) return null;
      var a = null;
      try { a = this._cronoAlvo(); } catch (eA) { a = null; }
      /* no PLANO a conferência já está feita: o _cronoAlvo relê o registro do
         plano do Store a cada chamada, então o retrato lido aqui É o do disco
         (a gravação humana do plano no outro aparelho o apagou lá) */
      if (a && a.tipo === "plano" && a.plano && a.plano.iaEdicao && Array.isArray(a.plano.iaEdicao.inversos)) return { ed: a.plano.iaEdicao, destino: "plano", obra: a.obra || null, vale: true };
      return null;
    },
    _iaDesfazerBotao: function (orc) {
      var info = null;
      try { info = this._iaDesfazerInfo(orc); } catch (eI) { info = null; }
      if (!info || info.vale === false) return "";   // porta que o disco já fechou não aparece
      var rot = this._iaDesfazerRotulo(info.ed) + (info.destino === "plano" ? " (plano de execução da obra)" : "");
      return '<button class="btn sm" data-acao="ia-desfazer" title="' + Util.esc("Desfazer a " + rot + " — volta o que ainda está como a IA deixou; o que você mexeu depois fica") + '">' +
        '↶ Desfazer edição da IA <span class="muted" style="font-size:11px;font-weight:400">· ' + Util.esc(rot.replace(/^edição da IA /, "")) + '</span></button>';
    },
    iaDesfazer: function () {
      var o = this.orcAtual, self = this;
      if (!o || typeof IAEdit === "undefined") return;
      var info = this._iaDesfazerInfo(o);
      if (!info) { UI.toast("Não há edição da IA para desfazer neste orçamento — o desfazer some na sua primeira edição depois da IA, na aprovação e ao gerar a proposta.", "info"); return; }
      if (info.vale === false) { this.render(); UI.toast(info.recado, "erro"); return; }
      var rot = this._iaDesfazerRotulo(info.ed), vistos = {}, itens = [];
      info.ed.inversos.forEach(function (inv) { var r = String((inv && inv.r) || ""); if (r && !vistos[r]) { vistos[r] = 1; itens.push(r); } });
      UI.modal("Desfazer edição da IA",
        '<p style="margin-top:0">' + Util.esc(rot.charAt(0).toUpperCase() + rot.slice(1) + (info.destino === "plano" ? ", no plano de execução da obra" : "") + ".") + '</p>' +
        '<p class="muted" style="font-size:12.5px">Volta só o que ainda está como a IA deixou. O que você mexeu depois fica como está, e o recado do fim diz o quê.</p>' +
        (itens.length ? '<ul style="margin:6px 0 0 18px;font-size:12.5px">' + itens.slice(0, 15).map(function (r) { return "<li>" + Util.esc(r) + "</li>"; }).join("") +
          (itens.length > 15 ? "<li>" + Util.esc("e mais " + (itens.length - 15)) + "</li>" : "") + "</ul>" : ""),
        [{ texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
         { texto: "Desfazer", classe: "danger", onClick: function () { self._iaDesfazerAgora(); } }]);
    },
    _iaDesfazerAgora: function () {
      var o = this.orcAtual;
      if (!o || typeof IAEdit === "undefined") return;
      var info = this._iaDesfazerInfo(o);
      if (!info) { UI.fecharModal(); UI.toast("A edição da IA já não está disponível para desfazer — nada mudou.", "info"); return; }
      /* ⚠ a conferência do disco vale NA HORA de gravar (a nuvem pode ter
         chegado entre o botão e a confirmação) */
      if (info.vale === false) { UI.fecharModal(); this.render(); UI.toast(info.recado, "erro"); return; }
      var por = this._cronoPor(), r, bk, a = null;
      if (info.destino === "plano") {
        try { a = this._cronoAlvo(); } catch (eA) { a = null; }
        if (!a || a.tipo !== "plano" || !a.plano) { UI.fecharModal(); UI.toast("O plano de execução da obra não está aberto nesta aba — nada foi desfeito.", "erro"); return; }
        bk = JSON.stringify(a.plano);
        r = IAEdit.desfazer(a.orc, { cronAlvo: a.cron, destinoDesfazer: a.plano, por: por });
      } else {
        bk = JSON.stringify(o);
        r = IAEdit.desfazer(o, { por: por });
      }
      if (r.erro) { UI.fecharModal(); UI.toast("Nada foi desfeito: " + r.erro + ".", "erro"); return; }
      /* ⚠ fecha a confirmação ANTES de gravar: se o armazenamento recusar, o
         persistir abre o modal de backup (administrador) — fechar depois o
         derrubava junto, levando a porta que o aviso manda usar */
      UI.fecharModal();
      var salvou = a ? a.salvar({ daIA: true }) : this.persistir({ daIA: true });
      if (!salvou) {
        this._iaRestaurar(a ? a.plano : o, bk);
        this.render();
        UI.toast("O desfazer NÃO foi gravado (veja o aviso) — " + (a ? "o plano de execução" : "o orçamento") + " ficou como estava, e o botão Desfazer continua.", "erro");
        return;
      }
      UI.fecharModal(); this.render();
      var nao = Util.arr(r.naoRevertidas);
      if (!nao.length) { UI.toast("Edição da IA desfeita: " + r.revertidas + " mudança(s) revertida(s).", "ok"); return; }
      UI.toast((r.revertidas ? r.revertidas + " mudança(s) revertida(s); " : "Nada voltou: ") + nao.length + " mudança(s) ficou(aram) como está(ão), porque foram mexidas depois da IA — veja a lista.", r.revertidas ? "info" : "erro");
      UI.modal("Edição da IA desfeita — com ressalvas",
        '<p style="margin-top:0">' + Util.esc(r.revertidas + " mudança(s) voltaram. Estas ficaram como estão:") + '</p><ul style="margin:6px 0 0 18px;font-size:12.5px">' +
        nao.map(function (x) { return "<li><b>" + Util.esc((x && x.rotulo) || "mudança") + "</b> — " + Util.esc(x && x.motivo) + "</li>"; }).join("") + "</ul>",
        [{ texto: "Entendi", classe: "primary", onClick: function () { UI.fecharModal(); } }]);
    },
    /* ⚠ GERAR A PROPOSTA APAGA O DESFAZER (crítica ia-seguranca, item 13): o
       documento foi ao cliente com o que está na tela; um clique depois
       reverteria o que o cliente leu.
       ⚠ E NÃO GRAVA O ORÇAMENTO ABERTO (revisão 4B). A 1ª versão gravava o
       orcAtual inteiro só para tirar o retrato — e com a memória velha (a
       nuvem grava no Store e não troca o aberto), IMPRIMIR a proposta apagava
       a garantia que a colega tinha acabado de mudar no outro aparelho
       (medido). Agora o retrato sai do REGISTRO DO DISCO, e só quando ele é o
       mesmo que está na tela (mesmo atualizadoEm, mesmo retrato); senão sai
       só da memória — e a conferência do desfazer já recusa aquele disco. O
       aprovado não é gravado (e nele o desfazer do orçamento nem aparece).
       ⚠ E REDESENHA: sem isso o [Desfazer edição da IA] ficava na barra até o
       próximo render, e o clique nele dizia "não há edição" (porta falsa). */
    _iaLimparNaProposta: function () {
      var o = this.orcAtual;
      if (!o || !o.iaEdicao || typeof IAEdit === "undefined") return;
      var ed = o.iaEdicao;
      IAEdit.limparDesfazer(o);
      if (!(Orcamento.travadoPorAprovacao && Orcamento.travadoPorAprovacao(o))) {
        var eid = null, d = null;
        try { eid = Auth.empresaId(); d = Store.obterOrcamento(eid, o.id); } catch (eD) { d = null; }
        if (d && d.iaEdicao && d.iaEdicao.em === ed.em && String(d.atualizadoEm || "") === String(o.atualizadoEm || "")) {
          IAEdit.limparDesfazer(d);
          var g = null;
          try { g = Store.salvarOrcamento(eid, d); } catch (eS) { g = null; }
          if (g) o.atualizadoEm = d.atualizadoEm;   // memória e disco seguem com o mesmo carimbo
        }
      }
      try { this.render(); } catch (eR) {}
    },

    /* ⚠ carregarSetop e carregarGoinfra foram REMOVIDOS na v1.1.204.
     * Eram dois dos quatro caminhos de instalação, cada um com o seu default
     * escrito no `||` do handler e outro no `<option>` da tela — a origem do
     * "dois defaults para o mesmo dado" que trocava o preço da GOINFRA por
     * omissão. Agora existe UM caminho: `Bases.instalar(catId, sel)`, com a
     * variante saindo dos eixos do catálogo (js/basescat.js). Quem procurar
     * por esses nomes vindo de um commit antigo: é o handler `data-instalar`
     * em App.onClick. */

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
    /* =================================================================
     * INSTALAR COMO APP
     *
     * ⚠ O iOS NUNCA dispara `beforeinstallprompt`. Safari não tem API de
     *   instalação: quem instala é o usuário, pelo menu Compartilhar. Um
     *   botão que só funcionasse com o evento seria um botão morto em todo
     *   iPhone e iPad — que é metade da obra. Por isso aqui há DOIS caminhos:
     *   com o evento guardado, dispara o instalador do navegador; sem ele,
     *   ensina o caminho da mão, com o passo a passo do aparelho certo.
     * ================================================================= */
    instalarApp: function () {
      var pronto = global.OPR_INSTALL && global.OPR_INSTALL.prompt;
      if (pronto) {
        try {
          global.OPR_INSTALL.prompt();
          global.OPR_INSTALL = null;
          return;
        } catch (e) { /* cai no passo a passo abaixo */ }
      }
      /* ⚠ TRÊS CAMINHOS, NÃO DOIS — e o do Mac faltava.
         A primeira versão só separava "iOS" de "o resto", e um Mac de verdade
         caía no ramo que manda procurar "os três pontinhos": menu que NÃO
         EXISTE no Safari do macOS, onde a instalação é `Arquivo → Adicionar
         ao Dock` (Safari 17+, Sonoma). O usuário tentou instalar no Mac e não
         conseguiu — a instrução estava errada, não o app.
         A checagem de `Macintosh` com toque continua valendo para o iPad, que
         desde o iPadOS 13 se apresenta como Macintosh no user agent; é por
         isso que a ordem dos testes importa. */
      var ua = String(navigator.userAgent || "");
      var ehIPadDisfarcado = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
      var ehIOS = /iPad|iPhone|iPod/.test(ua) || ehIPadDisfarcado;
      var ehSafari = /Safari/.test(ua) && !/Chrome|Chromium|Edg|OPR|Brave/.test(ua);
      var ehMac = /Macintosh|Mac OS X/.test(ua) && !ehIPadDisfarcado;
      var passos;
      if (ehIOS) {
        passos = '<ol style="margin:0;padding-left:20px;line-height:1.9">' +
          "<li>Toque no botão <b>Compartilhar</b> (o quadrado com a seta para cima), na barra do Safari.</li>" +
          "<li>Role a lista e toque em <b>Adicionar à Tela de Início</b>.</li>" +
          "<li>Confirme em <b>Adicionar</b>.</li></ol>" +
          '<p class="muted" style="font-size:12.5px;margin:10px 0 0">Precisa ser pelo <b>Safari</b> — Chrome e Firefox no iPhone não têm essa opção, é limitação do sistema, não do OrçaPRO.</p>';
      } else if (ehMac && ehSafari) {
        passos = '<ol style="margin:0;padding-left:20px;line-height:1.9">' +
          "<li>No menu de cima, abra <b>Arquivo</b>.</li>" +
          "<li>Clique em <b>Adicionar ao Dock…</b>.</li>" +
          "<li>Confirme em <b>Adicionar</b>.</li></ol>" +
          '<p class="muted" style="font-size:12.5px;margin:10px 0 0">Essa opção existe no <b>Safari 17 ou mais novo</b> (macOS Sonoma em diante). Em Mac mais antigo, use o <b>Chrome</b> ou o <b>Edge</b>: eles instalam pelo ícone que aparece na barra de endereço.<br><b>O instalador .exe é do Windows e não roda no Mac</b> — no Mac o OrçaPRO é instalado assim, pelo próprio navegador.</p>';
      } else if (ehMac) {
        passos = '<ol style="margin:0;padding-left:20px;line-height:1.9">' +
          "<li>Procure o ícone de <b>instalar</b> na barra de endereço (um monitor com uma seta), à direita.</li>" +
          "<li>Ou abra o menu do navegador e clique em <b>Instalar OrçaPRO IA…</b>.</li>" +
          "<li>Confirme.</li></ol>" +
          '<p class="muted" style="font-size:12.5px;margin:10px 0 0"><b>O instalador .exe é do Windows e não roda no Mac</b> — no Mac o OrçaPRO é instalado assim, pelo próprio navegador.</p>';
      } else {
        passos = '<ol style="margin:0;padding-left:20px;line-height:1.9">' +
          "<li>Abra o menu do navegador (os três pontinhos).</li>" +
          "<li>Toque em <b>Instalar aplicativo</b> ou <b>Adicionar à tela inicial</b>.</li>" +
          "<li>Confirme.</li></ol>" +
          '<p class="muted" style="font-size:12.5px;margin:10px 0 0">Se a opção não aparecer, o navegador pode não suportar — o OrçaPRO continua funcionando normalmente pelo endereço de sempre.</p>';
      }
      UI.modal("" + (typeof Icones !== "undefined" ? Icones.get("baixar", 15) : "") + " Instalar o OrçaPRO como aplicativo",
        '<p style="margin:0 0 12px">Instalado, ele ganha <b>ícone na tela inicial</b>, abre em <b>tela cheia</b> (sem a barra do navegador) e <b>funciona offline</b> — o que na obra, com internet ruim, é a diferença entre trabalhar e esperar.</p>' + passos,
        [{ texto: "Entendi", classe: "primary", onClick: function () { UI.fecharModal(); } }]);
    },

    /* ⚠ A base de preço é patrimônio da EMPRESA, não do usuário: instalar,
       importar, sobrescrever ou remover atinge todo mundo e sincroniza. O menu
       da engrenagem (js/ui.js:255) imprime "Tabelas de preço" para QUALQUER
       sessão — só empresa/nuvem/celular/backup eram gateados ali. Um
       encarregado com acesso só ao Diário apagava o acervo em dois cliques.
       Guarda em FUNÇÃO, como manda a doutrina da casa (js/app.js:2101). */
    _podeBases: function () {
      if (typeof Auth === "undefined" || !Auth.ehAdmin) return true;
      return Auth.ehAdmin();
    },
    _recusaBases: function (oQue) {
      try { UI.toast(oQue + " altera a base de preço da empresa inteira. Só o administrador da conta pode fazer isso.", "erro"); } catch (e) {}
      return false;
    },

    abrirTabelas: function () {
      /* primeira abertura da sessão ainda não tem o anúncio do servidor (as UFs
         do SICRO e da SINAPI desonerada saem de lá). Dispara a consulta e
         redesenha quando ela chega — sem travar a abertura, que tem de ser
         instantânea mesmo offline. */
      if (typeof Atualizacao !== "undefined" && Atualizacao.statusServidor && !Atualizacao._ultimoStatus) {
        var selfT0 = this;
        Atualizacao.statusServidor().then(function () {
          /* ⚠ só redesenha se a tela AINDA for a de Tabelas. No meio segundo da
             consulta o usuário pode ter fechado, ou aberto outro modal — e
             UI.modal() arranca o que estiver aberto SEM perguntar (ui.js:64),
             levando junto o que ele tivesse digitado. A pergunta é feita ao
             DOM (existe botão de instalar na tela?), não a uma flag que
             alguém precise lembrar de desligar em todo caminho de saída. */
          if (document.querySelector("#modal-bg [data-instalar]")) selfT0.abrirTabelas();
        }).catch(function () {});
      }
      var self = this;
      var bg = UI.modal("" + (typeof Icones !== "undefined" ? Icones.get("tabela", 15) : "") + " Tabelas de Preço (multi-base)", UI.renderTabelas(Bases.lista()), [
        { texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
        { texto: "Importar base", classe: "primary", onClick: function () { self.importarBase(); } }
      ]);
      var m = bg && bg.querySelector(".modal"); if (m) m.style.maxWidth = "740px";
    },
    importarBase: function () {
      if (!this._podeBases()) { this._recusaBases("Importar uma tabela de preço"); return; }
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
      // Planilha OFICIAL da base (Excel .xlsx/.xls): reusa o importador (detecta as colunas
      // código/descrição/unidade/custo) → base plana. Assim o usuário carrega EMOP/CPOS/FDE/ORSE…
      // com o arquivo verdadeiro do órgão — nada inventado.
      if (f && /\.(xlsx|xls)$/i.test(f.name)) {
        UI.toast("Lendo a planilha da base…", "ok");
        self._lerPlanilha(f, function (matriz, erro) {
          if (erro || !matriz || !matriz.length) { UI.toast("Não consegui ler a planilha: " + (erro || "vazia"), "erro"); return; }
          var dados = self._baseItensDaMatriz(matriz, fonte);
          if (!dados.length) { UI.toast("Nenhum item de preço reconhecido (preciso de código/descrição + custo).", "erro"); return; }
          Bases.registrar(fonte, { dados: dados, uf: uf });
          var grav = Bases.persistir(Auth.empresaId());
          UI.toast(dados.length.toLocaleString("pt-BR") + " itens de " + String(fonte).toUpperCase() + " importados da planilha" + (grav.ok ? "." : " — " + grav.erro), grav.ok ? "ok" : "erro");
          self.abrirTabelas();
        });
        return;
      }
      if (f) { var rd = new FileReader(); rd.onload = function () { concluir(rd.result, f.name); }; rd.onerror = function () { UI.toast("Falha ao ler arquivo.", "erro"); }; rd.readAsText(f); }
      else { concluir((UI.el("tab-text") || {}).value, "colado.txt"); }
    },
    // Converte a matriz de uma planilha em itens de BASE (lista plana com custo unitário),
    // reusando o DETECTOR DE COLUNAS do importador — mas lê o código CRU (bases usam formatos
    // próprios: EMOP "C-100", ORSE "01.001.0001", CPOS "39.05.010" — não o padrão SINAPI, então
    // não passo pelo filtro ehCodSinapi). Não inventa preço: item sem custo entra com 0.
    _baseItensDaMatriz: function (matriz, fonte) {
      if (typeof Importador === "undefined" || !Importador._detectarColunas) return [];
      var linhas = (matriz || []).filter(function (r) { return r && r.some(function (c) { return String(c == null ? "" : c).trim() !== ""; }); });
      if (!linhas.length) return [];
      var nCols = 0; linhas.forEach(function (r) { if (r.length > nCols) nCols = r.length; });
      var hIdx = Importador._acharCabecalho(linhas, nCols);
      var cols = Importador._detectarColunas(linhas, hIdx, nCols);
      if (cols.descricao == null && cols.codigo == null) return [];
      var start = hIdx >= 0 ? hIdx + 1 : 0, itens = [], f = String(fonte || "PROPRIA").toUpperCase();
      var col = function (row, c) { return c != null ? String(Importador._txt(row[c])).trim() : ""; };
      for (var i = start; i < linhas.length; i++) {
        var row = linhas[i];
        var cod = col(row, cols.codigo), desc = col(row, cols.descricao);
        if (!cod && !desc) continue;
        var custo = cols.custoUnit != null ? Importador._num(row[cols.custoUnit]) : (cols.custoTotal != null ? Importador._num(row[cols.custoTotal]) : 0);
        if (!(custo > 0) && !cod) continue; // linha sem custo e sem código = provável total/rodapé
        itens.push({ codigo: cod, descricao: desc, unidade: col(row, cols.unidade) || "un", custoUnitario: custo > 0 ? Math.round(custo * 100) / 100 : 0, origem: f, tipoItem: "composicao" });
      }
      return itens;
    },

    /* =================================================================
     * APARÊNCIA — v1.1.188
     *
     * Antes eram SEIS temas: claro + cinco tons de escuro (azul, preto,
     * verde, marrom e "RA Engenharia"). Cada tom redeclarava um punhado de
     * cores por conta própria, e o resultado é que cor semântica sumia em
     * uns e não em outros — o verde de "aprovado" desaparecia no tom verde,
     * o texto fraco morria no preto. Cinco variantes de fundo é escolha de
     * papel de parede; nenhuma delas resolvia o que importa, que é o
     * sistema inteiro ser legível.
     *
     * Agora são DOIS eixos independentes e ortogonais:
     *   · claro ↔ escuro   (data-tema)  — como a tela ilumina
     *   · Plex ↔ Source    (data-fonte) — como a tela lê
     *
     * Os dois têm contraste MEDIDO, não estimado: tools/test-contraste.js
     * reprova qualquer par abaixo da régua WCAG. Foi ele que pegou o aço da
     * marca em 3,06:1 sobre o escuro e o ocre em 4,24:1 sobre o branco.
     * ================================================================= */
    alternarTema: function () { // atalho claro↔escuro (preserva a fonte escolhida)
      this.aplicarTema(document.documentElement.getAttribute("data-tema") === "dark" ? "light" : "dark", null);
    },
    /* ⚠ MIGRAÇÃO: quem já usava tem `orcapro:tom` gravado com azul/preto/
     * verde/marrom/ra. Esses tons não existem mais. Deixar o atributo velho
     * no <html> não quebra nada (nenhuma regra casa com ele), mas o valor
     * precisa parar de ser lido — senão a preferência de fonte nunca pega.
     * O modo claro/escuro da pessoa é PRESERVADO: aquilo ela escolheu de
     * verdade, e mexer nisso seria trocar a tela dela sem pedir. */
    _fonteSalva: function () {
      var f = "";
      try { f = localStorage.getItem("orcapro:fonte") || ""; } catch (e) {}
      return (f === "source") ? "source" : "plex";   // Plex é o padrão
    },
    aplicarTema: function (tema, fonte) {
      tema = tema === "dark" ? "dark" : "light";
      fonte = (fonte === "source" || fonte === "plex") ? fonte : this._fonteSalva();
      var raiz = document.documentElement;
      raiz.setAttribute("data-tema", tema);
      raiz.setAttribute("data-fonte", fonte);
      raiz.removeAttribute("data-tom");             // o eixo antigo sai de cena
      try {
        localStorage.setItem("orcapro:tema", tema);
        localStorage.setItem("orcapro:fonte", fonte);
        localStorage.removeItem("orcapro:tom");
      } catch (e) {}
      // marca a opção ativa se a tela de aparência estiver aberta
      var ops = document.querySelectorAll(".tema-op");
      for (var i = 0; i < ops.length; i++) {
        var b = ops[i], t = b.getAttribute("data-tema-val"), f = b.getAttribute("data-fonte-val");
        /* ⚠ o botão de MOVIMENTO também é .tema-op e não tem nenhum dos dois
           atributos: sem esta linha, trocar o tema o desmarcava ("f === fonte"
           com f nulo dá falso). Ele é de aplicarMovimento. */
        if (!t && !f) continue;
        b.classList.toggle("on", t ? t === tema : f === fonte);
        b.setAttribute("aria-pressed", (t ? t === tema : f === fonte) ? "true" : "false");
      }
    },
    /* =================================================================
     * MOVIMENTO DA TELA DE OBRAS — o terceiro eixo da aparência
     *
     * A cena de Obras (foto em tela cheia, zoom lento, troca deslizando —
     * css/app.css "Cena da lista de Obras") segue a preferência do SISTEMA:
     * com as animações do Windows desligadas, o Chrome e o Edge pedem "menos
     * movimento" às páginas e a foto fica parada. Medido em 11/09/2026: a
     * própria máquina da RA está assim, e quem pediu o efeito não o via.
     * "Sempre ligado" é a escolha da pessoa passando na frente da do sistema
     * — só na cena de Obras; o resto do app continua seguindo o Windows.
     * O padrão é seguir o sistema: quem desligou animação por enjoo não é
     * surpreendido por uma foto se mexendo.
     * ================================================================= */
    _movimentoSalvo: function () {
      var v = "";
      try { v = localStorage.getItem("orcapro:movimento") || ""; } catch (e) {}
      return v === "sempre" ? "sempre" : "sistema";
    },
    aplicarMovimento: function (v) {
      v = (v === "sempre" || v === "sistema") ? v : this._movimentoSalvo();
      document.documentElement.setAttribute("data-movimento", v);
      try { localStorage.setItem("orcapro:movimento", v); } catch (e) {}
      var ops = document.querySelectorAll(".tema-op[data-mov-val]");
      for (var i = 0; i < ops.length; i++) {
        var on = ops[i].getAttribute("data-mov-val") === v;
        ops[i].classList.toggle("on", on);
        ops[i].setAttribute("aria-pressed", on ? "true" : "false");
      }
    },
    // Seletor de tema: Claro (como o site) + 5 tons de escuro (cores do logo RA)
    /* =================================================================
     * MEU PERFIL — quem eu sou, com foto e nome
     *
     * Fica no menu da conta porque e da PESSOA, nao da empresa: o logo e a
     * razao social ja tem lugar proprio em ⚙ Empresa. Sub-usuario e dono usam
     * a mesma tela; quem decide ONDE gravar e o Empresa.salvarNomeUsuario /
     * salvarFotoUsuario (equipe[] para sub-usuario, prefs para o dono).
     *
     * ⚠ O NOME ENTROU AQUI, JUNTO DA FOTO, e nao no cadastro da empresa. A
     * conta mestre nunca teve campo para a pessoa: quem assinava as aprovacoes
     * era a razao social. Botar o nome no ⚙ Empresa resolveria o sintoma e
     * criaria outro — o nome da pessoa viajaria junto com CNPJ e inscricao
     * estadual, que sao da empresa e mudam por outro motivo. Foto e nome sao
     * o mesmo dado ("quem e voce") e agora moram no mesmo lugar.
     * ================================================================= */
    abrirMinhaFoto: function () {
      var u = (typeof Auth !== "undefined" && Auth.usuario && Auth.usuario()) || {};
      var temEmp = typeof Empresa !== "undefined";
      var nomeAtual = (temEmp && Empresa.nomeUsuario) ? Empresa.nomeUsuario() : "";
      /* ⚠ O NOME E DE QUEM CADASTROU A PESSOA, nao da propria pessoa.
         `equipe[]` e area do admin (`podeModulo("usuarios")` fecha para o
         sub-usuario). Deixar o campo editavel aqui permitia ao encarregado
         digitar o nome do gerente e assinar as aprovacoes com ele — o
         contrario do que esta versao veio fazer. A FOTO segue dele: ela nao
         identifica ninguem num documento. */
      var podeNome = !u.usuarioId && (!u.papel || u.papel === "admin");
      var empresa = u.empresa || "";
      var atual = (temEmp && Empresa.fotoUsuario) ? Empresa.fotoUsuario() : "";
      var escolhida = atual, mexeu = false;
      function iniciaisDe(n) {
        var base = String(n || "").trim() || empresa || u.email || "";
        return (temEmp && Empresa.iniciais) ? Empresa.iniciais(base) : "?";
      }
      UI.modal("" + (typeof Icones !== "undefined" ? Icones.get("pessoa", 15) : "") + " Meu perfil",
        '<p class="muted" style="margin-top:0;font-size:13px">Aparecem na barra do topo e em tudo que você aprova. São seus: cada pessoa da equipe tem os dela.</p>' +
        '<div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap">' +
          '<div id="mf-prev" class="perfil-prev">' + (atual ? '<img src="' + atual + '" alt="">' : '<span class="ini">' + Util.esc(iniciaisDe(nomeAtual)) + '</span>') + '</div>' +
          '<div style="display:flex;flex-direction:column;gap:8px;flex:1;min-width:230px">' +
            '<label style="font-size:12px;font-weight:600">Seu nome</label>' +
            '<input type="text" id="mf-nome" maxlength="60" placeholder="Ex.: Rogério Souza" value="' + Util.esc(nomeAtual) + '"' + (podeNome ? '' : ' disabled') + '>' +
            /* ⚠ dizer PARA QUE serve o campo. Sem esta linha o usuario acha que
               e apelido de tela e deixa em branco — e a aprovacao continua
               saindo com a razao social, que foi o problema que trouxe ele aqui. */
            '<span class="muted" style="font-size:11.5px">' + (podeNome
              ? 'É este nome que assina suas aprovações. Em branco, aparece <b>' + Util.esc(empresa || "sua empresa") + '</b> no seu lugar.'
              : 'Este é o nome com que você foi cadastrado e é ele que assina suas aprovações. Para mudar, peça ao administrador da conta.') + '</span>' +
            '<label style="font-size:12px;font-weight:600;margin-top:6px">Sua foto</label>' +
            '<input type="file" id="mf-in" accept="image/*">' +
            '<button type="button" class="btn sm" id="mf-rm"' + (atual ? '' : ' style="display:none"') + '>Voltar para as iniciais</button>' +
            /* ⚠ O AVISO MORA AQUI, e nao so na politica de privacidade.
               O .txt viaja no pacote e no site, mas o app nunca o abre: o
               titular do dado escolhe a foto NESTA tela e em lugar nenhum
               dela dizia que o rosto dele sai da maquina. Coerencia entre
               dois documentos que o cliente nao le nao e aviso. */
            '<span class="muted" style="font-size:11.5px">A imagem é reduzida para 128 px — fica leve e não atrapalha a sincronização.<br>Ela também aparece para o suporte da ' + Util.esc((typeof CONFIG !== "undefined" && CONFIG.marca && CONFIG.marca.fabricante) || "fornecedora") + ', para identificar quem está usando o sistema. Voltando às iniciais, ela é apagada lá também.</span>' +
          '</div>' +
        '</div>',
        [{ texto: "Salvar", classe: "primary", onClick: function () {
            var nEl = UI.el("mf-nome");
            var nv = nEl ? String(nEl.value || "").trim() : nomeAtual;
            var mudouNome = nv !== nomeAtual;
            if (!mexeu && !mudouNome) { UI.fecharModal(); return; }
            if (typeof Empresa === "undefined" || !Empresa.salvarFotoUsuario) { UI.toast("Não foi possível salvar.", "erro"); return; }
            /* ⚠ o nome PRIMEIRO. Os dois gravam no mesmo registro da equipe;
               se a foto falhasse por falta de cadastro, sair daqui sem gravar
               nada e melhor que gravar metade. */
            if (mudouNome) {
              var rn = Empresa.salvarNomeUsuario(nv);
              if (rn === "somente-admin") { UI.toast("Seu nome é definido por quem administra a conta. Peça a ele para alterar.", "erro"); return; }
              if (rn === false) { UI.toast("Não achei seu cadastro para guardar o nome.", "erro"); return; }
            }
            if (mexeu && Empresa.salvarFotoUsuario(escolhida) === false) { UI.toast("Não achei seu cadastro na equipe para guardar a foto.", "erro"); return; }
            UI.fecharModal(); App.render();
            UI.toast(mudouNome ? (nv ? "Perfil atualizado." : "Nome removido.") : (escolhida ? "Foto atualizada." : "Voltou para as iniciais."), "ok");
          } },
         { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } }]);

      function pintar() {
        var pv = UI.el("mf-prev"), rm = UI.el("mf-rm"), nEl = UI.el("mf-nome");
        if (!pv) return;
        pv.innerHTML = escolhida ? '<img src="' + escolhida + '" alt="">'
          : '<span class="ini">' + Util.esc(iniciaisDe(nEl ? nEl.value : nomeAtual)) + '</span>';
        if (rm) rm.style.display = escolhida ? "" : "none";
      }
      var nEl = UI.el("mf-nome");
      /* as iniciais seguem o que esta sendo digitado: quem nao tem foto ve na
         hora que o circulo da barra vai virar as letras dele */
      if (nEl) { nEl.oninput = function () { if (!escolhida) pintar(); }; try { nEl.focus(); } catch (e) {} }
      var inp = UI.el("mf-in");
      if (inp) inp.onchange = function () {
        var f = inp.files && inp.files[0]; if (!f) return;
        /* 128 px e o dobro do tamanho que a barra desenha (retina) — mais que
           isso e peso a toa num dado que viaja na sincronizacao. */
        Gestao._comprimirFoto(f, 128, 0.85, function (d) {
          if (!d) { UI.toast("Arquivo não é uma imagem válida.", "erro"); inp.value = ""; return; }
          escolhida = d; mexeu = true; pintar();
        });
      };
      var rm = UI.el("mf-rm");
      if (rm) rm.onclick = function () { escolhida = null; mexeu = true; if (inp) inp.value = ""; pintar(); };
    },

    abrirTema: function () {
      var temaAtual = document.documentElement.getAttribute("data-tema") || "light";
      var fonteAtual = this._fonteSalva();

      /* dois grupos, porque são duas perguntas diferentes: como a tela
         ilumina, e como a tela lê. Misturar as duas num cardápio de seis
         combinações é o que fazia ninguém achar o que queria. */
      var luz = [
        { v: "light", nome: "Claro", desc: "Para o escritório e para a luz do dia",
          sw: ["#f4f7fb", "#ffffff", "#0f2740", "#15803d"] },
        { v: "dark", nome: "Escuro", desc: "Para trabalhar à noite e cansar menos a vista",
          sw: ["#0b1622", "#11202e", "#7fb4da", "#4cae6d"] }
      ];
      var fontes = [
        /* ⚠ ASPAS SIMPLES no nome da família.
         * Com aspas duplas o `style="font-family:"IBM Plex Mono"…"` fecha o
         * atributo no meio — e as duas amostras caíam na fonte herdada, ou
         * seja, a tela que existe para MOSTRAR a diferença mostrava a mesma
         * coisa duas vezes. */
        { v: "plex", nome: "IBM Plex", desc: "Número de largura fixa: na planilha, a vírgula fica embaixo da vírgula",
          amostra: "1.234,56", fam: "'IBM Plex Mono', monospace" },
        { v: "source", nome: "Source Sans", desc: "Traço mais macio e arredondado, letra um pouco mais aberta",
          amostra: "1.234,56", fam: "'Source Sans 3', sans-serif" }
      ];

      function cardLuz(o) {
        var on = o.v === temaAtual;
        return '<button type="button" class="tema-op' + (on ? " on" : "") + '" data-acao="tema-op"' +
          ' data-tema-val="' + o.v + '" aria-pressed="' + (on ? "true" : "false") + '">' +
          '<span class="sw">' + o.sw.map(function (c) { return '<i style="background:' + c + '"></i>'; }).join("") + "</span>" +
          "<b>" + o.nome + "</b><small>" + o.desc + "</small></button>";
      }
      function cardFonte(o) {
        var on = o.v === fonteAtual;
        return '<button type="button" class="tema-op' + (on ? " on" : "") + '" data-acao="tema-fonte"' +
          ' data-fonte-val="' + o.v + '" aria-pressed="' + (on ? "true" : "false") + '">' +
          '<span class="sw-txt" style="font-family:' + o.fam + '">' + o.amostra + "</span>" +
          "<b>" + o.nome + "</b><small>" + o.desc + "</small></button>";
      }

      /* o movimento da cena de Obras. A frase da opção "Seguir o Windows" diz
         o que ESTE aparelho está pedindo agora — sem ela a pessoa escolhe sem
         saber por que a foto está parada. */
      var movAtual = this._movimentoSalvo();
      var sistemaReduz = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
      var movs = [
        { v: "sistema", nome: "Seguir o Windows",
          desc: sistemaReduz ? "Neste aparelho as animações do Windows estão desligadas: a foto fica parada"
                             : "As animações do Windows estão ligadas neste aparelho: a foto se move" },
        { v: "sempre", nome: "Sempre ligado",
          desc: "Zoom lento na foto e troca deslizando, mesmo com as animações do Windows desligadas" }
      ];
      function cardMov(o) {
        var on = o.v === movAtual;
        return '<button type="button" class="tema-op' + (on ? " on" : "") + '" data-acao="tema-mov"' +
          ' data-mov-val="' + o.v + '" aria-pressed="' + (on ? "true" : "false") + '">' +
          "<b>" + o.nome + "</b><small>" + o.desc + "</small></button>";
      }

      UI.modal("Aparência",
        '<p class="muted" style="margin:0 0 6px;font-size:var(--t-peq)">A mudança é na hora e fica salva neste aparelho. Cada pessoa da equipe tem a sua.</p>' +
        '<div class="tema-grupo"><span class="tema-rot">Iluminação da tela</span>' +
          '<div class="tema-ops">' + luz.map(cardLuz).join("") + "</div></div>" +
        '<div class="tema-grupo"><span class="tema-rot">Letra</span>' +
          '<div class="tema-ops">' + fontes.map(cardFonte).join("") + "</div></div>" +
        '<div class="tema-grupo"><span class="tema-rot">Movimento da tela de Obras</span>' +
          '<div class="tema-ops">' + movs.map(cardMov).join("") + "</div></div>" +
        '<p class="muted" style="margin:14px 0 0;font-size:var(--t-micro)">As quatro combinações são conferidas por medição de contraste a cada versão — nenhum texto, número ou botão fica apagado por causa da cor em nenhuma delas.</p>',
        [{ texto: "Fechar", classe: "primary", onClick: function () { UI.fecharModal(); } }]);
    },

    // ---------- Orçamentos ----------
    /* ------------------------------------------------------------------
     * CRIAR A PARTIR DE UM ORÇAMENTO QUE JÁ EXISTE
     * Duas obras parecidas têm quase a mesma planilha; refazer do zero é o
     * que empurra o orçamentista de volta para o Excel.
     * ------------------------------------------------------------------ */
    copiarOrcamento: function () {
      var self = this, eid = Auth.empresaId();
      var lista = Store.listarOrcamentos(eid).slice().sort(function (a, b) {
        return String(b.atualizadoEm || "").localeCompare(String(a.atualizadoEm || ""));
      });
      if (!lista.length) { UI.toast("Você ainda não tem orçamento para copiar.", "aviso"); return; }
      var limite = Auth.limite("limiteOrcamentos");
      if (lista.length >= limite) {
        UI.toast("Plano " + CONFIG.planos[Auth.plano()].nome + " permite só " + limite + " orçamentos. Faça upgrade.", "erro");
        return;
      }
      function resumo(o) {
        var nE = (o.etapas || []).length, nI = 0;
        (o.etapas || []).forEach(function (e) {
          nI += (e.itens || []).length;
          (e.subetapas || []).forEach(function (se) { nI += (se.itens || []).length; });
        });
        return nE + " etapa" + (nE === 1 ? "" : "s") + " · " + nI + " item" + (nI === 1 ? "" : "ns");
      }
      var opts = lista.map(function (o) {
        return '<option value="' + Util.esc(o.id) + '">' + Util.esc(o.nome || "(sem nome)")
          + " — " + Util.esc(o.numero || "") + " (" + resumo(o) + ")</option>";
      }).join("");
      var corpo = '<div class="field"><label>Copiar de qual orçamento?</label><select id="co-orig">' + opts + "</select></div>"
        + '<div id="co-res" class="muted" style="font-size:12px;margin:-4px 0 10px"></div>'
        + '<div class="field"><label>Nome do novo orçamento</label><input id="co-nome" placeholder="Ex.: Residência — Rua B"></div>'
        + '<div class="row"><div class="field"><label>Cliente</label><input id="co-cli" placeholder="deixe em branco para preencher depois"></div>'
        + '<div class="field"><label>Obra / Local</label><input id="co-obra" placeholder="Ex.: Bairro Centro"></div></div>'
        + '<label style="display:flex;gap:8px;align-items:flex-start;cursor:pointer;margin-top:4px">'
        + '<input type="checkbox" id="co-semqtd" style="margin-top:3px">'
        + '<span><b>Trazer só os serviços, sem as quantidades</b><br><span class="muted" style="font-size:12px">'
        + "Marque quando a obra nova tem outra metragem: a lista de serviços vem pronta e você lança as quantidades.</span></span></label>"
        + '<p class="muted" style="font-size:12px;margin:10px 0 0">Vêm junto: etapas, sub etapas, itens, BDI e os parâmetros de cálculo '
        + "(encargos, arredondamento, base e competência). <b>Não vem</b> aprovação, assinatura nem o número — o novo nasce aberto e com número próprio.</p>";
      UI.modal("Copiar de um orçamento existente", corpo, [
        { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
        { texto: "Criar cópia", classe: "primary", onClick: function () {
          var origem = lista.filter(function (o) { return o.id === (UI.el("co-orig") || {}).value; })[0];
          if (!origem) { UI.toast("Escolha o orçamento de origem.", "erro"); return; }
          /* ⚠ ler do STORE, não da lista da tela: a lista pode ser um resumo
             sem as etapas, e copiar dela geraria uma planilha vazia. */
          var completo = Store.lerOrcamento ? (Store.lerOrcamento(eid, origem.id) || origem) : origem;
          var novo = Orcamento.copiarDe(completo, {
            nome: (UI.el("co-nome") || {}).value || "",
            cliente: (UI.el("co-cli") || {}).value || "",
            obra: (UI.el("co-obra") || {}).value || "",
            semQuantidades: !!((UI.el("co-semqtd") || {}).checked)
          });
          self._materializarSeExec(novo);   // sem quantidades o vão muda: o gravado acompanha
          Store.salvarOrcamento(eid, novo);
          UI.fecharModal();
          self.orcAtual = novo; self.tela = "editor"; self.aba = "planilha";
          self.render();
          UI.toast("Cópia criada a partir de " + (completo.numero || completo.nome || "orçamento") + ".", "ok");
        } }
      ]);
      setTimeout(function () {
        var sel = UI.el("co-orig"), box = UI.el("co-res");
        function pinta() {
          var o = lista.filter(function (x2) { return x2.id === sel.value; })[0];
          if (o && box) box.textContent = resumo(o) + " · atualizado em " + String(o.atualizadoEm || "").slice(0, 10).split("-").reverse().join("/");
        }
        if (sel) { sel.onchange = pinta; pinta(); }
      }, 60);
    },

    novoOrcamento: function () {
      var lista = Store.listarOrcamentos(Auth.empresaId());
      var limite = Auth.limite("limiteOrcamentos");
      if (lista.length >= limite) {
        UI.toast("Plano " + CONFIG.planos[Auth.plano()].nome + " permite só " + limite + " orçamentos. Faça upgrade.", "erro");
        return;
      }
      var self = this;
      // Assistente de 3 passos (dados → cálculo → bases). Parametrizar DEPOIS,
      // com itens já lançados, é o que produz divergência de centavo em licitação.
      if (typeof OrcWizard !== "undefined") { OrcWizard.abrir(this); return; }
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

    /* Excluir orçamento com CONFIRMAÇÃO explícita — mostra o que vai sumir
     * (nome, nº, itens, valor) e alerta que medições/vínculos ficam órfãos.
     * Ação destrutiva nunca roda em 1 clique. */
    confirmarExcluirOrcamento: function (id) {
      var self = this;
      var orc = Store.obterOrcamento(Auth.empresaId(), id);
      if (!orc) { UI.toast("Orçamento não encontrado.", "erro"); return; }
      var t = Orcamento.totais(orc);
      // vínculos que ficam órfãos (aviso honesto antes de apagar)
      var vinculos = [];
      try {
        var obras = Store.listar(Auth.empresaId(), "obras").filter(function (o) { return o.orcamentoId === id; });
        var meds = Store.listar(Auth.empresaId(), "medicoes").filter(function (m) { return m.orcamentoId === id; });
        if (obras.length) vinculos.push(obras.length + " obra(s) vinculada(s)");
        if (meds.length) vinculos.push(meds.length + " medição(ões) por itens");
      } catch (e) {}
      UI.modal("" + (typeof Icones !== "undefined" ? Icones.get("lixeira", 15) : "") + " Excluir orçamento?",
        '<div style="padding:10px 12px;border-radius:10px;background:rgba(220,38,38,.08);border:1px solid rgba(220,38,38,.25);margin-bottom:12px">' +
          '<b>' + Util.esc(orc.nome) + '</b><br>' +
          '<span class="muted">' + Util.esc(orc.numero) + ' · ' + t.qtdEtapas + ' etapa(s) · ' + t.qtdItens + ' item(ns) · ' + Util.fmtMoeda(t.precoVenda) + '</span>' +
        '</div>' +
        '<p style="margin:0 0 6px">Esta ação <b>não pode ser desfeita</b>. O orçamento sai deste aparelho e da nuvem sincronizada.</p>' +
        (vinculos.length
          ? '<p style="margin:0;color:#b45309;font-size:12.5px">' + (typeof Icones !== 'undefined' ? Icones.get('alerta', 15) : '') + ' Existem ' + vinculos.join(" e ") + ' apontando para este orçamento — os registros continuam, mas perdem o vínculo (previsto×real e medição por itens param de calcular).</p>'
          : '<p class="muted" style="margin:0;font-size:12.5px">Nenhuma obra ou medição vinculada a ele.</p>'),
        [
          { texto: "Cancelar", classe: "primary", onClick: function () { UI.fecharModal(); } },
          { texto: "" + (typeof Icones !== "undefined" ? Icones.get("lixeira", 15) : "") + " Excluir definitivamente", classe: "danger", onClick: function () {
            Store.excluirOrcamento(Auth.empresaId(), orc.id);
            if (self.orcAtual && self.orcAtual.id === orc.id) { self.orcAtual = null; self.tela = "lista"; }
            UI.fecharModal();
            self.render();
            UI.toast("Orçamento “" + orc.nome + "” excluído.", "ok");
          } }
        ]);
    },

    abrirOrcamento: function (id) {
      var orc = Store.obterOrcamento(Auth.empresaId(), id);
      if (!orc) { UI.toast("Orçamento não encontrado.", "erro"); return; }
      // Conserta acentos/ç corrompidos (mojibake) de versões antigas — sem o usuário recriar nada.
      try {
        var reparos = Orcamento.repararTexto(orc);
        /* ORDEM CANÔNICA das sub etapas na carga. O orçamento pode ter passado por
         * uma máquina na versão ANTERIOR (que preserva subetapas/subEtapaId mas não
         * conhece a regra de contiguidade) ou pelo round-trip do Excel — e aí os
         * itens de um grupo chegam intercalados. Sem este reparo o Excel emite o
         * banner da sub etapa DUAS vezes e as linhas saem fora de ordem. */
        try { Orcamento.normalizarSubEtapas(orc); } catch (eNs) {}
        var fontes = 0, prazo = false;
        try { fontes = Orcamento.repararFontes(orc); } catch (e2) {} // FASE 1.2: Fonte honesta
        try { prazo = Orcamento.sincronizarPrazo(orc); } catch (e3) {} // FASE 1.4: prazo único
        // NÃO renumeramos as etapas ao só ABRIR: isso sobrescreveria silenciosamente códigos
        // de edital/EAP importados ("02.10.01") e marcaria o orçamento como "modificado". A
        // renumeração sequencial acontece só nas ações estruturais (add/mover/remover etapa),
        // e o número hierárquico dos itens (2.1) é derivado da POSIÇÃO no render — sempre correto.
        // Orçamento anterior à parametrização: avisa UMA vez que agora ele calcula
        // pelo padrão do TCU (o total pode diferir em centavos do que foi impresso).
        var cfgMig = Orcamento.garantirConfig(orc), migrou = false;
        if (cfgMig.migradoTcu && !cfgMig.migradoAvisadoEm) {
          cfgMig.migradoAvisadoEm = Util.agoraISO(); migrou = true;
          UI.toast("Este orçamento passou a calcular pelo padrão do TCU (truncar 2 casas, BDI no preço unitário). O total pode variar centavos do que já foi impresso — dá para mudar o critério no botão Parâmetros do orçamento.", "ok");
        }
        if (reparos > 0 || fontes > 0 || prazo || migrou) {
          Store.salvarOrcamento(Auth.empresaId(), orc);
          if (reparos > 0) UI.toast("Corrigimos automaticamente " + reparos + " descrição(ões) com acentos.", "ok");
          if (fontes > 0) UI.toast("Fonte de " + fontes + " item(ns) corrigida (não eram SINAPI).", "ok");
        }
      } catch (e) {}
      this.orcAtual = orc; this.tela = "editor"; this.aba = "planilha";
      this.render();
      this._preloadAnalitico(); // pré-carrega a base analítica em 2º plano → detalhe de insumos abre na hora
    },

    // Pré-carrega a base ANALÍTICA (~18MB) em segundo plano assim que abre o orçamento,
    // pra "ver composição detalhada" abrir instantâneo (sem o load frio no 1º clique).
    // Silencioso, sem spinner, offline-first (se falhar, o clique recarrega normalmente).
    _preloadAnalitico: function () {
      var self = this, orc = this.orcAtual;
      try {
        if (typeof Analitico === "undefined") return;
        /* pré-carrega a base DO ORÇAMENTO: os itens dele estão em orc.uf, e é
           deles que o 🔍 e a aba Insumos do Excel precisam. Se já há um analítico
           de OUTRA UF na memória (ambiente trocado para consultar preço), ele
           sai — senão o detalhamento mostraria insumo de outro estado. */
        var ufOrcP = String((orc && orc.uf) || "").toUpperCase(), ufAnaP = String(Analitico.uf || "").toUpperCase();
        if (Analitico.carregado && ufOrcP && ufAnaP && ufAnaP !== ufOrcP && Analitico.reset) Analitico.reset();
        /* preparar antes do atalho: o regime do orçamento que abriu decide o
           analítico, senão o do orçamento anterior fica na memória */
        var u = ufOrcP ? this._prepararAnalitico(ufOrcP, this._normComp((orc && orc.competenciaSinapi) || "")) : this._prepararAnalitico();
        if (Analitico.carregado || Analitico.carregando) return;
        if (!u.local && !u.live) return;
        // pré-carrega já com o fallback AO VIVO embutido — se um clique em 🔍 pegar esta
        // promise compartilhada no meio do caminho, ela já sabe cair no VPS.
        setTimeout(function () {
          try {
            if (!Analitico.carregado && !Analitico.carregando) {
              Analitico.carregarArquivo(u.alts).then(function () {
                // v1.1.123 — com o analítico na mão, os avisos "insumo sem preço"
                // aparecem já na PRIMEIRA abertura da planilha (antes só apareciam
                // depois de algum 🔍 Insumos + re-render). Não re-renderiza se o
                // usuário está digitando em algum campo.
                try {
                  var ae = document.activeElement;
                  var digitando = ae && /INPUT|TEXTAREA|SELECT/.test(ae.tagName || "");
                  if (self.tela === "editor" && self.aba === "planilha" && !digitando) self.render();
                } catch (e2) {}
              }).catch(function () {});
            }
          } catch (e) {}
        }, 1200);
      } catch (e) {}
    },

    /* ==================================================================
     * A BASE DECLARADA NÃO É CAMPO DE TEXTO LIVRE.
     *
     * ⚠ Aqui havia dois <input> soltos gravando direto em `orc.uf` e
     * `orc.competenciaSinapi` — os dois valores que saem no cabeçalho da
     * planilha, do laudo e da proposta. Dava para digitar "SP" num orçamento
     * inteiro precificado em MG e o documento passava a declarar uma
     * data-base que não é a dos preços. Em licitação isso é impugnação, e era
     * o caminho mais curto para chegar lá: um campo de texto, sem guarda
     * nenhuma, ao lado do nome do cliente.
     *
     * A régua é o que o orçamento JÁ TEM DENTRO:
     *  - com itens lançados, os preços vieram de uma base específica e o
     *    rótulo tem de continuar sendo o dela → só leitura;
     *  - sem itens, não há o que rotular errado → dá para escolher, mas de
     *    uma lista REAL (o manifesto de estados), e a gravação só acontece
     *    depois que a base sobe. É a mesma guarda do assistente ao criar.
     * ================================================================== */
    _edItens: function (o) {
      var n = 0;
      Util.arr(o.etapas).forEach(function (e) { n += Util.arr(e.itens).length; });
      return n;
    },
    _edBaseCampos: function (o) {
      var comp = (typeof BasesCat !== "undefined") ? (BasesCat.fmtVersao(o.competenciaSinapi) || "—") : (o.competenciaSinapi || "—");
      var temItens = this._edItens(o) > 0;
      var carregada = (this._baseUf || (typeof Sinapi !== "undefined" ? Sinapi.uf : "") || "").toUpperCase();
      var compCarregada = (typeof Sinapi !== "undefined" && Sinapi.competencia) || "";
      var diverge = !!(carregada && String(o.uf || "").toUpperCase() !== carregada);

      if (temItens) {
        return '<div class="field"><label>Base de preços declarada por este orçamento</label>' +
          '<div class="ed-base-fixa"><b>SINAPI · ' + Util.esc(o.uf || "—") + ' · ' + Util.esc(comp) + "</b>" +
          '<small>Os ' + this._edItens(o) + ' itens já lançados foram precificados com ela. O documento tem de declarar a base dos preços que ele imprime — por isso não se troca por aqui.</small>' +
          (diverge ? '<small class="ed-base-alerta">' + (typeof Icones !== "undefined" ? Icones.get("alerta", 15) : "") +
            " A base carregada agora é " + Util.esc(carregada) + (compCarregada ? " · " + Util.esc(BasesCat.fmtVersao(compCarregada)) : "") +
            ". Isso é normal se você trocou de estado para consultar outro preço — os itens deste orçamento continuam com o preço de " + Util.esc(o.uf) + ".</small>" : "") +
          "</div></div>";
      }
      /* orçamento vazio: escolher é seguro, mas de uma lista real */
      return '<div class="field"><label>Base de preços deste orçamento</label>' +
        '<select id="ed-uf"><option value="' + Util.esc(o.uf || "") + '">' + Util.esc(o.uf || "—") + "</option></select>" +
        '<small>Ainda não há item lançado, então dá para trocar. Ao salvar, a base do estado escolhido é carregada — e o orçamento só passa a declará-la se ela subir.</small></div>';
    },
    /* Preenche o select com os estados que EXISTEM (manifesto). */
    _edBindBase: function (o) {
      var sel = UI.el("ed-uf"); if (!sel || !this._carregarEstados) return;
      var atual = String(o.uf || "").toUpperCase();
      this._carregarEstados().then(function (ests) {
        if (!UI.el("ed-uf")) return;
        if (!ests || !ests.length) return;
        sel.innerHTML = ests.map(function (e) {
          return '<option value="' + Util.esc(e.uf) + '"' + (e.uf === atual ? " selected" : "") + ">" + Util.esc(e.uf) +
            (e.competencia ? " · " + Util.esc(BasesCat.fmtVersao(e.competencia)) : "") + "</option>";
        }).join("");
        sel.value = atual;
      }).catch(function () {});
    },
    /* Troca a base ANTES de gravar o rótulo — e só grava se ela subir.
       Mesma regra do assistente: rótulo sem lastro é o defeito, não a feature. */
    _edSalvarBase: function (o, pronto) {
      var sel = UI.el("ed-uf");
      var pedida = sel ? String(sel.value || "").toUpperCase() : "";
      var atual = String(o.uf || "").toUpperCase();
      if (!pedida || pedida === atual || !this.trocarBaseSinapi) return pronto();
      var self = this;
      UI.toast("Carregando a base de " + pedida + "…", "ok");
      this.trocarBaseSinapi(pedida, "", function (ok) {
        var real = (self._baseUf || (typeof Sinapi !== "undefined" ? Sinapi.uf : "") || "").toUpperCase();
        if (ok && real === pedida) {
          o.uf = pedida;
          if (typeof Sinapi !== "undefined" && Sinapi.competencia) o.competenciaSinapi = Sinapi.competencia;
        } else {
          UI.toast("Não consegui carregar a base de " + pedida + " — o orçamento continua em " + (o.uf || "—") + ".", "erro");
        }
        pronto();
      });
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
        this._edBaseCampos(o) +
        '<div class="field"><label>ART/RRT nº (obrigatório p/ o Anexo de Laudo)</label><input id="ed-art" value="' + Util.esc(o.art || "") + '" placeholder="ex.: MG20260000000"></div>' +
        '<div class="field"><label>Data da vistoria (obrigatória p/ o Anexo de Laudo)</label><input id="ed-vistoria" value="' + Util.esc(o.dataVistoria || "") + '" placeholder="ex.: 05/07/2026"></div>' +
        '<h3 style="margin:8px 0;border-top:1px solid var(--linha);padding-top:14px">Dados para a Proposta Comercial</h3>' +
        '<div class="field"><label>Condições de pagamento</label><textarea id="ed-pag" rows="2">' + Util.esc(c.condicoesPagamento) + '</textarea></div>' +
        '<div class="row"><div class="field"><label>Prazo de execução</label><input id="ed-prazo" value="' + Util.esc(c.prazoExecucao) + '"></div>' +
        '<div class="field"><label>Validade (dias)</label><input id="ed-valdias" type="number" min="0" step="1" value="' + Util.esc(c.validadeDias == null ? 15 : c.validadeDias) + '" title="O número é o que permite calcular e imprimir a data de vencimento. Zero = sem data (só a frase abaixo)."></div></div>' +
        '<div class="field"><label>Frase da validade (impressa quando não houver dias)</label><input id="ed-val" value="' + Util.esc(c.validadeProposta) + '"></div>' +
        '<div class="field"><label>Garantia</label><textarea id="ed-gar" rows="2">' + Util.esc(c.garantia) + '</textarea></div>' +
        '<div class="row"><div class="field"><label>Incluso (1 por linha)</label><textarea id="ed-inc" rows="4">' + Util.esc(c.incluso) + '</textarea></div>' +
        '<div class="field"><label>Não incluso (1 por linha)</label><textarea id="ed-exc" rows="4">' + Util.esc(c.excluso) + '</textarea></div></div>' +
        /* os 4 textos que a proposta imprimia FIXOS (Fase 4) — todo campo que a
           IA edita é editável à mão. ⚠ VAZIO = o texto de sempre, e o
           placeholder mostra qual é; salvar o próprio padrão volta a vazio
           (Orcamento.normalizarTextoComercial), senão abrir e salvar este modal
           trocaria o parágrafo por lista na proposta de todo orçamento antigo. */
        '<div class="row">' + this._edTextoPadrao("ed-prem", "Premissas (1 por linha — vazio = o texto padrão)", c, "premissas") +
          this._edTextoPadrao("ed-met", "Metodologia (vazio = o texto padrão)", c, "metodologia") + '</div>' +
        '<div class="row">' + this._edTextoPadrao("ed-respcda", "Responsabilidades da contratada (1 por linha)", c, "respContratada") +
          this._edTextoPadrao("ed-respcte", "Responsabilidades do contratante (1 por linha)", c, "respContratante") + '</div>' +
        '<div class="field"><label>Link da planilha desta proposta (URL do Excel — vira o botão "Abrir planilha" no PDF)</label><input id="ed-planilha" value="' + Util.esc(c.linkPlanilha || "") + '" placeholder="https://…/proposta.xlsx"></div>' +
        /* ⚠ ISTO NÃO É ENFEITE: pagamento, garantia, incluso e não incluso são
           os MESMOS textos em toda proposta da empresa, e eram reescritos (ou
           esquecidos) a cada orçamento. Guardar uma vez e aplicar é o que faz
           a cláusula ser igual no documento de todo mundo. */
        '<div class="flex" style="gap:8px;margin-top:4px">'
        + '<button class="btn sm ghost" data-acao="comercial-salvar-padrao" type="button" title="Guarda pagamento, prazo, validade, garantia, incluso, não incluso, premissas, metodologia e as responsabilidades como o padrão da sua empresa">Salvar como padrão da empresa</button>'
        + (App._comercialPadrao() ? App._comercialUsarPadraoBotao() : "")
        + "</div>",
        [
          { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
          { texto: "Salvar", classe: "primary", onClick: function () {
            o.nome = (UI.el("ed-nome") || {}).value || o.nome;
            o.cliente.nome = (UI.el("ed-cliente") || {}).value || "";
            o.obra.nome = (UI.el("ed-obra") || {}).value || "";
            o.art = (UI.el("ed-art") || {}).value || "";
            o.dataVistoria = (UI.el("ed-vistoria") || {}).value || "";
            c.condicoesPagamento = (UI.el("ed-pag") || {}).value || "";
            c.prazoExecucao = (UI.el("ed-prazo") || {}).value || "";
            c.validadeProposta = (UI.el("ed-val") || {}).value || "";
            c.validadeDias = Util.num((UI.el("ed-valdias") || {}).value);
            c.garantia = (UI.el("ed-gar") || {}).value || "";
            c.incluso = (UI.el("ed-inc") || {}).value || "";
            c.excluso = (UI.el("ed-exc") || {}).value || "";
            c.linkPlanilha = String((UI.el("ed-planilha") || {}).value || "").trim();
            /* ⚠ NORMALIZADO: o texto padrão deixado no campo volta a "" (vazio =
               o de sempre). E campo que não está na tela não é tocado — um
               modal de versão antiga não apaga o que a IA ou a pessoa gravou. */
            for (var kT in self._TEXTOS_PROPOSTA_ED) {
              if (!Object.prototype.hasOwnProperty.call(self._TEXTOS_PROPOSTA_ED, kT)) continue;
              var elT = UI.el(self._TEXTOS_PROPOSTA_ED[kT]);
              if (elT) c[kT] = Orcamento.normalizarTextoComercial(kT, elT.value);
            }
            self._edSalvarBase(o, function () {
              self.persistir(); UI.fecharModal(); self.render(); UI.toast("Dados salvos.", "ok");
            });
          } }
        ]);
      this._edBindBase(o);
    },

    /* um textarea de texto da proposta com o padrão do sistema no placeholder
       (as quebras de linha como &#10;, que o placeholder mostra em linhas) */
    _edTextoPadrao: function (id, rotulo, c, campo) {
      var pad = (Orcamento.TEXTOS_PADRAO_PROPOSTA && Orcamento.TEXTOS_PADRAO_PROPOSTA[campo]) || "";
      return '<div class="field"><label for="' + id + '">' + Util.esc(rotulo) + '</label><textarea id="' + id + '" rows="4" placeholder="' +
        Util.esc(pad).replace(/\n/g, "&#10;") + '">' + Util.esc(c[campo] || "") + '</textarea></div>';
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
      // o cursor já entra no campo (o assistente abre este modal sozinho ao criar o orçamento)
      var _n = UI.el("et-nome"); if (_n) _n.focus();
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

    /* SUB ETAPAS (1.1) — o pedido é organizar a etapa em blocos: "Serviços
       Preliminares" vira 1, "Canteiro de Obras" vira 1.1, e as composições do
       canteiro viram 1.1.1, 1.1.2… */
    addSubEtapa: function (etapaId) {
      var self = this, orc = this.orcAtual; if (!orc) return;
      var e = Util.arr(orc.etapas).filter(function (x) { return x.id === etapaId; })[0];
      if (!e) return;
      // itens que hoje estão SOLTOS na etapa (os que já estão em outra sub etapa não contam)
      var subs = Orcamento.subEtapas(e), val = {};
      subs.forEach(function (sx) { val[sx.id] = true; });
      var nSoltos = Util.arr(e.itens).filter(function (it) { return !(it.subEtapaId && val[it.subEtapaId]); }).length;
      var numEt = String(Util.arr(orc.etapas).indexOf(e) + 1);
      /* A PREVISÃO TEM QUE SEGUIR A CAIXA. Com "mover" marcada (o padrão) os itens
         soltos deixam de ocupar o 2º nível e a sub etapa nasce 1.1 — anunciar 1.4
         só porque a etapa tem 3 itens soltos hoje é prometer um número que não sai. */
      var nSubsComItem = 0;
      subs.forEach(function (sx) {
        if (Util.arr(e.itens).filter(function (it) { return it.subEtapaId === sx.id; }).length) nSubsComItem++;
      });
      var numMove = numEt + "." + (nSubsComItem + 1);
      var numFica = numEt + "." + (nSoltos + nSubsComItem + 1);
      var numIni = nSoltos ? numMove : numFica; // a caixa nasce marcada
      var corpo = '<p class="muted" style="margin-top:0">A etapa <b>' + numEt + ' ' + Util.esc(e.nome) +
          '</b> passa a ter blocos: a sub etapa vira <b><span id="sub-prev">' + numIni +
          '</span></b> e as composições dela numeram <b><span id="sub-prev2">' + numIni + '</span>.1</b>, <b>.2</b>…</p>' +
        '<div class="field"><label>Nome da sub etapa</label><input id="sub-nome" placeholder="Ex.: Canteiro de Obras" autofocus></div>' +
        (nSoltos ? '<label style="display:flex;gap:8px;align-items:flex-start;font-size:13px;cursor:pointer">' +
            '<input type="checkbox" id="sub-mover" checked style="margin-top:3px">' +
            '<span>Mover para dentro dela <b>' + nSoltos + ' item(ns)</b> que já estão nesta etapa.' +
            '<br><span class="muted">Desmarcado, eles continuam soltos e a sub etapa entra depois deles.</span></span></label>' : "");
      UI.modal("Nova sub etapa de " + e.nome, corpo, [
        { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
        { texto: "Criar sub etapa", classe: "primary", onClick: function () {
            var nome = String((UI.el("sub-nome") || {}).value || "").trim();
            var mover = !!((UI.el("sub-mover") || {}).checked);
            var s = Orcamento.addSubEtapa(orc, etapaId, nome, mover);
            if (!s) { UI.fecharModal(); return; }
            if (self.expandirEtapa) self.expandirEtapa(etapaId, s.id);
            self.persistir(); UI.fecharModal(); self.render();
            UI.toast("Sub etapa criada." + (mover && nSoltos ? " " + nSoltos + " item(ns) foram para dentro dela." : ""), "ok");
          } }
      ]);
      setTimeout(function () {
        var i = UI.el("sub-nome"); if (i) i.focus();
        var chk = UI.el("sub-mover");
        if (chk) chk.onchange = function () {
          var n = chk.checked ? numMove : numFica;
          var a = UI.el("sub-prev"), b = UI.el("sub-prev2");
          if (a) a.textContent = n; if (b) b.textContent = n;
        };
      }, 50);
    },
    renomearSubEtapa: function (etapaId, subId) {
      var self = this, orc = this.orcAtual; if (!orc) return;
      var e = Util.arr(orc.etapas).filter(function (x) { return x.id === etapaId; })[0];
      var s = e && Orcamento.subEtapas(e).filter(function (x) { return x.id === subId; })[0];
      if (!s) return;
      UI.modal("Renomear sub etapa",
        '<div class="field"><label>Nome da sub etapa</label><input id="sub-nome" value="' + Util.esc(s.nome) + '"></div>', [
          { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
          { texto: "Salvar", classe: "primary", onClick: function () {
              Orcamento.renomearSubEtapa(orc, etapaId, subId, (UI.el("sub-nome") || {}).value || s.nome);
              self.persistir(); UI.fecharModal(); self.render(); UI.toast("Sub etapa renomeada.", "ok");
            } }
        ]);
      setTimeout(function () { var i = UI.el("sub-nome"); if (i) { i.focus(); i.select(); } }, 50);
    },
    removerSubEtapa: function (etapaId, subId) {
      var self = this, orc = this.orcAtual; if (!orc) return;
      var e = Util.arr(orc.etapas).filter(function (x) { return x.id === etapaId; })[0];
      var s = e && Orcamento.subEtapas(e).filter(function (x) { return x.id === subId; })[0];
      if (!s) return;
      var n = Util.arr(e.itens).filter(function (it) { return it.subEtapaId === subId; }).length;
      UI.modal("Remover sub etapa",
        '<p>Remover a sub etapa <b>' + Util.esc(s.nome) + '</b>?</p>' +
        (n ? '<p class="muted">Os <b>' + n + ' item(ns)</b> dela <b>não são apagados</b> — voltam a ficar soltos na etapa e são renumerados.</p>'
           : '<p class="muted">Ela está vazia.</p>'), [
          { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
          { texto: "Remover sub etapa", classe: "", onClick: function () {
              UI.fecharModal();
              Orcamento.removerSubEtapa(orc, etapaId, subId);
              self.persistir(); self.render();
              UI.toast(n ? n + " item(ns) voltaram para a etapa." : "Sub etapa removida.", "ok");
            } }
        ]);
    },

    recolherTodasEtapas: function () {
      var orc = this.orcAtual; if (!orc) return;
      var m = this._etapasRecolhidas[orc.id] || (this._etapasRecolhidas[orc.id] = {});
      /* O mapa guarda id de ETAPA e de SUB ETAPA no mesmo lugar (o toggle é o
         mesmo). Varrer só orc.etapas fazia "Expandir todas" deixar os itens das
         sub etapas escondidos: o m[subId] continuava lá. */
      var ids = [];
      (orc.etapas || []).forEach(function (e) {
        ids.push(e.id);
        Orcamento.subEtapas(e).forEach(function (sx) { ids.push(sx.id); });
      });
      var algumAberto = ids.some(function (id) { return !m[id]; });
      ids.forEach(function (id) { if (algumAberto) m[id] = true; else delete m[id]; });
      this.render(); // o rótulo do botão muda junto
    },
    removerEtapa: function (etapaId) {
      // LOTE 1: etapa pode ter dezenas de itens e não há desfazer — confirmar antes.
      var self = this, orc = this.orcAtual;
      var et = orc && (orc.etapas || []).filter(function (e) { return e.id === etapaId; })[0];
      var nItens = et ? (et.itens || []).length : 0;
      var nSubs = et ? Orcamento.subEtapas(et).length : 0;
      UI.modal("" + (typeof Icones !== "undefined" ? Icones.get("lixeira", 15) : "") + " Remover etapa",
        '<p>Remover a etapa <b>' + Util.esc((et && et.nome) || "") + '</b>' +
        (nSubs ? ' com <b>' + nSubs + ' sub etapa(s)</b>' + (nItens ? ' e' : '') : '') +
        (nItens ? ' com <b>' + nItens + ' item(ns)</b>' : '') + '?<br><span class="muted">Essa ação não tem desfazer.</span></p>', [
          { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
          { texto: "" + (typeof Icones !== "undefined" ? Icones.get("lixeira", 15) : "") + " Remover", classe: "", onClick: function () {
              UI.fecharModal();
              Orcamento.removerEtapa(orc, etapaId);
              self.persistir(); self.render();
            } }
        ]);
    },
    removerItem: function (etapaId, itemId) {
      Orcamento.removerItem(this.orcAtual, etapaId, itemId);
      this.persistir(); this.render();
    },
    // FASE 3: memória de cálculo do quantitativo (Lei 14.133) — o Excel (aba
    // "Memória de Cálculo", lote 5) já exporta item.memoriaCalculo; aqui é onde digita.
    /* =================================================================
     * FECHAR O ORÇAMENTO EM UM VALOR (v1.1.227)
     *
     * "Deu R$ 130 mil e eu preciso fechar em R$ 150 mil." A tela responde
     * três perguntas, nesta ordem — que é a ordem da cabeça de quem decide:
     *   1. quanto falta (ou sobra) para o valor que eu quero?
     *   2. de onde esse dinheiro sai — do meu lucro ou do custo?
     *   3. o que exatamente vai acontecer se eu confirmar?
     *
     * ⚠ NADA É APLICADO SEM SIMULAR ANTES. A simulação roda a cada tecla e
     * mostra o efeito real, com os avisos. É a diferença entre uma ferramenta
     * de decisão e uma roleta.
     * ================================================================= */
    fecharValor: function () {
      var self = this, orc = this.orcAtual;
      if (!orc) return;
      if (typeof Fechamento === "undefined") { UI.toast("Módulo de fechamento indisponível.", "erro"); return; }
      var t = Orcamento.totais(orc);
      if (!(Util.num(t.precoVenda) > 0)) { UI.toast("Lance itens no orçamento antes de fechar em um valor.", "erro"); return; }

      /* SELEÇÃO MÚLTIPLA (v1.1.229): dá para combinar — "metade no BDI, metade
         na mão de obra". Marcando mais de um, aparece a divisão em % ao lado,
         já preenchida na PROPORÇÃO DO PESO de cada base no orçamento. Meio a
         meio seria a divisão errada por padrão: pedir que uma parcela de 5% do
         custo carregue metade da diferença é o mesmo exagero que o modo único
         já avisa. */
      this._fx = { modos: ["bdi"], pesos: {} };
      var opc = "";
      Fechamento.ORDEM_MODOS.forEach(function (id, i) {
        var M = Fechamento.MODOS[id];
        /* display:flex explícito: `.ow-check` é inline por padrão e as cinco
           opções escorriam uma na linha da outra, com o rótulo de uma colado
           na explicação da anterior — ilegível justamente na tela em que a
           escolha é a decisão mais importante. */
        opc += '<div style="border-top:1px solid var(--borda);padding:8px 0">' +
          '<label class="ow-check" style="display:flex;align-items:flex-start;gap:8px;margin:0">' +
          '<input type="checkbox" class="fx-modo" value="' + id + '"' + (i === 0 ? " checked" : "") + '>' +
          "<span style=\"flex:1\"><b>" + Util.esc(M.rotulo) + "</b>" + (i === 0 ? ' <span style="font-size:10px;color:#16a34a;font-weight:700">RECOMENDADO</span>' : "") +
          '<br><span class="muted" style="font-size:11px">' + Util.esc(M.resumo) + "</span>" +
          '<br><span class="muted" style="font-size:11px;font-style:italic">' + Util.esc(M.quando) + "</span></span>" +
          '<span class="fx-peso-box" data-para="' + id + '" style="display:none;white-space:nowrap">' +
            '<input class="cell fx-peso" data-modo="' + id + '" style="width:62px;text-align:right;padding:4px" inputmode="decimal"> %' +
          "</span></label></div>";
      });

      var body =
        '<div class="muted" style="font-size:12px;margin-top:0">O orçamento está hoje em ' +
          "<b>" + Util.fmtMoeda(t.precoVenda) + "</b> " +
          '<span style="font-size:11px">(custo ' + Util.fmtMoeda(t.custoDireto) + " + BDI " + Util.fmtPct(t.bdiPercentual) + ")</span></div>" +

        '<div style="margin-top:12px">' +
          '<label style="font-weight:600;font-size:12px;display:block">Quanto você quer que o orçamento dê?</label>' +
          /* ⚠ o `!important` no INLINE é o único jeito de este campo não
             ENCOLHER no celular. A trava anti-zoom do iOS (css/app.css)
             precisou de `!important` para vencer os font-size inline da grade
             do diário — e, de quebra, passou a rebaixar este campo de 19px
             para 17px. Ele é grande de propósito: é o "Quanto você quer que o
             orçamento dê?", o número que a pessoa está olhando. */
          '<input id="fx-alvo" class="cell" style="width:100%;font-size:19px !important;padding:9px;font-weight:700" ' +
            'inputmode="decimal" placeholder="Ex.: 150.000,00" autocomplete="off">' +
        "</div>" +

        '<div id="fx-efeito" style="margin-top:10px"></div>' +

        '<div style="margin-top:12px">' +
          '<label style="font-weight:600;font-size:12px;display:block;margin-bottom:2px">De onde sai a diferença?</label>' +
          '<div class="muted" style="font-size:11px;margin-bottom:4px">Esta escolha é o que separa um orçamento que se defende de um que não se explica.</div>' +
          opc +
        "</div>" +

        '<div id="fx-avisos" style="margin-top:8px"></div>';

      UI.modal("" + (typeof Icones !== "undefined" ? Icones.get("dinheiro", 15) : "") + " Fechar o orçamento em um valor", body, [
        { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
        { texto: "Aplicar", classe: "primary", onClick: function () { self.fecharAplicar(); } }
      ]);

      var campo = UI.el("fx-alvo");
      if (campo) {
        campo.oninput = function () { self.fecharSimular(); };
        campo.focus();
      }
      var chks = document.querySelectorAll(".fx-modo");
      for (var i = 0; i < chks.length; i++) {
        chks[i].onchange = function () { self._fxSincronizar(true); };
      }
      var pesos = document.querySelectorAll(".fx-peso");
      for (var j = 0; j < pesos.length; j++) {
        // mexeu num % à mão: para de sugerir e respeita o que ele digitou
        pesos[j].oninput = function () { self._fx.manual = true; self.fecharSimular(); };
      }
      this._fxSincronizar(true);
    },

    /* Mostra/esconde os campos de % e repõe a sugestão proporcional. */
    _fxSincronizar: function (recalcular) {
      var self = this, orc = this.orcAtual;
      var marcados = [];
      document.querySelectorAll(".fx-modo").forEach(function (c) { if (c.checked) marcados.push(c.value); });
      this._fx.modos = marcados;

      // com um critério só, % não faz sentido: ele leva 100%
      var varios = marcados.length > 1;
      document.querySelectorAll(".fx-peso-box").forEach(function (b) {
        b.style.display = (varios && marcados.indexOf(b.dataset.para) >= 0) ? "" : "none";
      });

      if (varios && recalcular && !this._fx.manual) {
        var sug = Fechamento.pesosSugeridos(orc, marcados);
        sug.forEach(function (s) {
          var el = document.querySelector('.fx-peso[data-modo="' + s.modo + '"]');
          if (el) el.value = Util.fmtNum(s.pct, 1);
        });
      }
      this.fecharSimular();
    },

    /* Os critérios como o motor espera: [{modo, pct}]. */
    _fxCriterios: function () {
      var out = [];
      var marcados = (this._fx && this._fx.modos) || [];
      if (marcados.length === 1) return [{ modo: marcados[0], pct: 100 }];
      marcados.forEach(function (id) {
        var el = document.querySelector('.fx-peso[data-modo="' + id + '"]');
        out.push({ modo: id, pct: el ? Util.num(el.value) : 0 });
      });
      return out;
    },

    _fxAlvo: function () {
      var el = UI.el("fx-alvo");
      return el ? Util.num(el.value) : 0;
    },

    /* Simula a cada tecla. O usuário vê o efeito ANTES de decidir. */
    fecharSimular: function () {
      var orc = this.orcAtual, box = UI.el("fx-efeito"), cxAv = UI.el("fx-avisos");
      if (!orc || !box) return;
      var alvo = this._fxAlvo(), crit = this._fxCriterios();
      if (!crit.length) {
        box.innerHTML = '<div style="padding:8px;border-radius:6px;background:rgba(220,38,38,.08);color:#dc2626;font-size:12px">Marque ao menos uma forma de distribuir a diferença.</div>';
        if (cxAv) cxAv.innerHTML = ""; this._fx.sim = null; return;
      }
      if (!(alvo > 0)) { box.innerHTML = ""; if (cxAv) cxAv.innerHTML = ""; this._fx.sim = null; return; }

      var somaPct = 0; crit.forEach(function (c) { somaPct += Util.num(c.pct); });
      if (crit.length > 1 && Math.abs(somaPct - 100) > 0.5) {
        /* Não normalizo em silêncio: se ele digitou 60 + 30, precisa VER que
           faltam 10 — normalizar por baixo dos panos entrega uma divisão que
           ele não pediu e não tem como conferir. */
        box.innerHTML = '<div style="padding:8px;border-radius:6px;background:rgba(234,88,12,.10);color:#ea580c;font-size:12px">' +
          "As porcentagens somam <b>" + Util.fmtNum(somaPct, 1) + "%</b> — ajuste para fechar 100%.</div>";
        if (cxAv) cxAv.innerHTML = ""; this._fx.sim = null; return;
      }

      var s = (crit.length > 1) ? Fechamento.simularMulti(orc, alvo, crit) : Fechamento.simular(orc, alvo, crit[0].modo);
      this._fx.sim = s;
      if (!s.ok) {
        box.innerHTML = '<div style="padding:8px;border-radius:6px;background:rgba(220,38,38,.08);color:#dc2626;font-size:12px">' + Util.esc(s.erro) + "</div>";
        if (cxAv) cxAv.innerHTML = "";
        return;
      }

      var sobe = s.delta > 0;
      var cor = sobe ? "#16a34a" : "#ea580c";
      var h = '<div style="padding:9px 11px;border-radius:8px;background:' + (sobe ? "rgba(22,163,74,.08)" : "rgba(234,88,12,.08)") + '">' +
        '<span style="font-size:13px">' + (sobe ? "Acréscimo" : "Desconto") + ' de <b style="color:' + cor + ';font-size:16px">' +
        Util.fmtMoeda(Math.abs(s.delta)) + "</b> " +
        '<span class="muted" style="font-size:11px">(' + Util.fmtNum(Math.abs(s.delta) / s.atual * 100, 2) + "% sobre o valor atual)</span></span>";

      if (s.multi) {
        /* A cascata mostrada linha a linha: o usuário precisa ver QUANTO vai
           para cada critério, e que o BDI entra por último — ele é o que
           absorve sem distorcer custo. */
        h += '<div style="margin-top:6px;font-size:12px">';
        (s.partes || []).forEach(function (p) {
          var M = Fechamento.MODOS[p.modo] || {};
          h += '<div style="display:flex;justify-content:space-between;gap:8px;padding:2px 0">' +
            "<span>" + Util.esc(M.rotulo || p.modo) + ' <span class="muted">' + Util.fmtNum(p.pct, 1) + "%</span></span>" +
            "<b>" + Util.fmtMoeda(p.valor) + "</b>" +
            (p.bdiNovo != null ? ' <span class="muted">(BDI → ' + Util.fmtPct(p.bdiNovo) + ")</span>"
                               : (p.itens ? ' <span class="muted">(' + p.itens + " itens)</span>" : "")) +
            "</div>";
        });
        h += '<div class="muted" style="font-size:11px;margin-top:4px">Os custos são ajustados primeiro e o BDI fecha por último — é o único que não distorce custo nenhum.</div>';
        h += "</div>";
      } else if (s.modo === "bdi") {
        h += '<div style="margin-top:5px;font-size:12px">BDI vai de <b>' + Util.fmtPct(s.bdiAtual) +
             "</b> para <b>" + Util.fmtPct(s.bdiNovo) + "</b>. " +
             '<span class="muted">Nenhum custo é alterado.</span></div>';
      } else {
        h += '<div style="margin-top:5px;font-size:12px">' + s.itensAfetados + " item(ns) terão o custo ajustado" +
             (s.fator ? " (fator <b>" + Util.fmtNum(s.fator, 4) + "</b>)" : "") + ". " +
             '<span class="muted">O BDI não muda.</span></div>';
      }
      h += "</div>";
      box.innerHTML = h;

      if (cxAv) {
        var av = "";
        (s.bloqueios || []).forEach(function (b) {
          av += '<div style="padding:8px 10px;border-radius:6px;background:rgba(220,38,38,.10);border:1px solid rgba(220,38,38,.35);font-size:12px;margin-bottom:5px">' +
                "⛔ <b>Não dá para aplicar:</b> " + Util.esc(b) + "</div>";
        });
        (s.avisos || []).forEach(function (a) {
          av += '<div style="padding:8px 10px;border-radius:6px;background:rgba(234,88,12,.08);border:1px solid rgba(234,88,12,.28);font-size:12px;margin-bottom:5px">' +
                "⚠ " + Util.esc(a) + "</div>";
        });
        cxAv.innerHTML = av;
      }
    },

    fecharAplicar: function () {
      var self = this, orc = this.orcAtual;
      if (!orc) return;
      var alvo = this._fxAlvo(), crit = this._fxCriterios();
      if (!crit.length) { UI.toast("Marque ao menos uma forma de distribuir a diferença.", "erro"); return; }
      if (!(alvo > 0)) { UI.toast("Informe o valor final desejado.", "erro"); return; }
      var somaPct = 0; crit.forEach(function (c) { somaPct += Util.num(c.pct); });
      if (crit.length > 1 && Math.abs(somaPct - 100) > 0.5) {
        UI.toast("As porcentagens somam " + Util.fmtNum(somaPct, 1) + "% — ajuste para fechar 100%.", "erro"); return;
      }

      var multi = crit.length > 1;
      var s = multi ? Fechamento.simularMulti(orc, alvo, crit) : Fechamento.simular(orc, alvo, crit[0].modo);
      if (!s.ok) { UI.toast(s.erro, "erro"); return; }
      if (s.bloqueios && s.bloqueios.length) { UI.toast(s.bloqueios[0], "erro"); return; }

      var aplicar = function () {
        var opts = { por: (typeof Auth !== "undefined" && Auth.usuario && Auth.usuario()) ? (Auth.usuario().email || "") : "" };
        var r = multi ? Fechamento.aplicarMulti(orc, alvo, crit, opts)
                      : Fechamento.aplicar(orc, alvo, crit[0].modo, opts);
        if (!r.ok) { UI.toast(r.erro, "erro"); return; }
        self.persistir(); UI.fecharModal(); self.render();
        var msg = "Orçamento fechado em " + Util.fmtMoeda(r.atingido);
        if (r.sobra && Math.abs(r.sobra) >= 0.01) msg += " (o mais perto possível de " + Util.fmtMoeda(alvo) + ")";
        if (r.itensAfetados) msg += " — " + r.itensAfetados + " item(ns) ajustado(s), com justificativa registrada.";
        else msg += " — BDI ajustado, nenhum custo alterado.";
        UI.toast(msg, "ok");
      };

      /* Mexer no custo de item que veio de base oficial pede uma confirmação
         explícita: é o que vira divergência a justificar numa análise. */
      var mexeCusto = crit.some(function (c) { return Fechamento.MODOS[c.modo].mexeEmCusto; });
      var nItens = multi ? (s.partes || []).reduce(function (a, p) { return a + (p.itens || 0); }, 0) : s.itensAfetados;
      if (mexeCusto) {
        UI.modal("" + (typeof Icones !== "undefined" ? Icones.get("alerta", 15) : "") + " Confirmar o ajuste nos custos",
          '<p style="font-size:13px;margin-top:0">Isto vai alterar o <b>custo unitário de ' + nItens +
          " item(ns)</b> para o orçamento fechar em <b>" + Util.fmtMoeda(alvo) + "</b>.</p>" +
          '<p style="font-size:12px" class="muted">Cada item alterado fica marcado na planilha com o selo de ajuste e guarda a justificativa — ' +
          "ela sai na aba de justificativas do Excel. Dá para desfazer tudo depois, num clique.</p>",
          [
            { texto: "Voltar", classe: "ghost", onClick: function () { self.fecharValor(); } },
            { texto: "Confirmar e aplicar", classe: "primary", onClick: aplicar }
          ]);
      } else {
        aplicar();
      }
    },

    fecharDesfazer: function () {
      var self = this, orc = this.orcAtual;
      if (!orc || typeof Fechamento === "undefined") return;
      var f = orc.fechamento;
      if (!f) { UI.toast("Este orçamento não tem fechamento para desfazer.", "erro"); return; }
      UI.modal("Desfazer o fechamento",
        '<p style="font-size:13px;margin-top:0">Os preços voltam exatamente ao que eram antes do fechamento em <b>' +
        Util.fmtMoeda(f.alvo) + "</b>.</p>",
        [
          { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
          { texto: "Desfazer", classe: "primary", onClick: function () {
              var r = Fechamento.desfazer(orc);
              if (!r.ok) { UI.toast(r.erro, "erro"); return; }
              self.persistir(); UI.fecharModal(); self.render();
              UI.toast("Fechamento desfeito — o orçamento voltou a " + Util.fmtMoeda(r.voltouPara) + ".", "ok");
            } }
        ]);
    },

    /* =================================================================
     * MEMORIAL DE CÁLCULO — agente + calculadoras + subir a quantidade
     *
     * Era um <textarea> e um Salvar. Virou o lugar onde a quantidade NASCE:
     * o orçamentista lança a composição sem quantidade, descreve o serviço em
     * português, o agente monta a conta, ele confere e SOBE.
     *
     * ⚠ O agente PROPÕE, não lança. O botão de subir é um segundo clique, e
     * fica desligado até existir conta. Número que entra em orçamento sem
     * alguém olhar é como se perde obra.
     *
     * ⚠ A quantidade e a memória sobem JUNTAS. Número sem a conta ao lado é
     * o que ninguém consegue defender na hora da fiscalização (Lei 14.133).
     * ================================================================= */
    abrirMemoria: function (etapaId, itemId) {
      var self = this, orc = this.orcAtual; if (!orc) return;
      var etapa = (orc.etapas || []).filter(function (e) { return e.id === etapaId; })[0];
      var it = etapa && (etapa.itens || []).filter(function (x) { return x.id === itemId; })[0];
      if (!it) return;
      this._mem = { etapaId: etapaId, itemId: itemId, r: null };
      var un = Util.unidadeExibir(it.unidade);
      var pend = it.qtdPendente || !(Util.num(it.quantidade) > 0);

      var opForma = "";
      for (var k in Orcamento.FORMAS_MEMORIA) {
        if (!Orcamento.FORMAS_MEMORIA.hasOwnProperty(k)) continue;
        var F = Orcamento.FORMAS_MEMORIA[k];
        opForma += '<option value="' + k + '">' + Util.esc(F.rotulo) + " (" + Util.unidadeExibir(F.unidade) + ")</option>";
      }

      var body =
        '<div class="muted" style="margin-top:0;font-size:12px">' +
          "<b>" + Util.esc(String(it.descricao || "").slice(0, 100)) + "</b><br>" +
          "Item em <b>" + Util.esc(un) + "</b>" +
          (pend ? ' · <span style="color:#ea580c;font-weight:600">quantidade pendente</span>'
                : " · quantidade atual <b>" + Util.esc(Util.fmtNum(it.quantidade, 2)) + "</b>") +
        "</div>" +

        // ---- 1. o agente ----
        '<div style="margin-top:12px;padding:10px;border:1px solid var(--borda);border-radius:8px">' +
          '<label style="font-weight:600;font-size:12px">Descreva o serviço e as medidas</label>' +
          '<div class="muted" style="font-size:11px;margin:2px 0 6px">' +
            'Ex.: <i>"4 paredes de 3,20 m por 2,70 descontando 2 portas e 1 janela"</i> · ' +
            '<i>"contrapiso 45 m² com 5 cm"</i> · <i>"escavação de vala 25 m por 0,60 por 1,20, 3 valas"</i>' +
          "</div>" +
          '<textarea id="mem-desc" class="cell" style="width:100%;min-height:52px;resize:vertical" ' +
            'placeholder="Descreva com as medidas…"></textarea>' +
          '<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">' +
            '<button class="btn primary" data-acao="mem-agente" type="button">Gerar memorial</button>' +
            '<button class="btn ghost" data-acao="mem-agente-ia" type="button" title="Usa a IA para frases que o cálculo local não entendeu">Tentar com IA</button>' +
          "</div>" +
          '<div id="mem-saida" style="margin-top:8px;font-size:12px"></div>' +
        "</div>" +

        // ---- 2. as calculadoras ----
        '<details style="margin-top:10px"><summary style="cursor:pointer;font-size:12px;font-weight:600">Calculadora (escolher a forma da conta)</summary>' +
          '<div style="padding:10px 0 0">' +
            '<select id="mem-forma" class="cell" style="width:100%">' +
              '<option value="">— escolha a forma do cálculo —</option>' + opForma +
            "</select>" +
            '<div id="mem-campos" style="margin-top:8px"></div>' +
          "</div>" +
        "</details>" +

        // ---- 3. o texto final ----
        '<label style="font-weight:600;font-size:12px;display:block;margin-top:12px">Memória de cálculo</label>' +
        '<div class="muted" style="font-size:11px;margin-bottom:4px">Sai na coluna da Analítica e na aba <b>Memória de Cálculo</b> do Excel, e no laudo. Pode editar à mão.</div>' +
        '<textarea id="mem-texto" class="cell" style="width:100%;min-height:110px;resize:vertical" ' +
          'placeholder="Descreva o cálculo do quantitativo…">' + Util.esc(it.memoriaCalculo || "") + "</textarea>";

      UI.modal("" + (typeof Icones !== "undefined" ? Icones.get("nota", 15) : "") + " Memória de cálculo — " + (it.codigo || ""), body, [
        { texto: "Salvar só o texto", classe: "ghost", onClick: function () {
            it.memoriaCalculo = String((UI.el("mem-texto") || {}).value || "").trim();
            self.persistir(); UI.fecharModal(); self.render();
            UI.toast(it.memoriaCalculo ? "Memória de cálculo salva." : "Memória de cálculo removida.", "ok");
          } },
        { texto: "Usar a quantidade no orçamento", classe: "primary", onClick: function () { self.memSubir(); } }
      ]);
      // liga a troca de forma da calculadora (o modal já está no DOM)
      var sel = UI.el("mem-forma");
      if (sel) sel.onchange = function () { self.memForma(); };
    },

    /* Roda o agente local na descrição e mostra a conta. */
    memAgente: function (comIA) {
      var self = this, el = UI.el("mem-desc"), box = UI.el("mem-saida");
      if (!el || !box) return;
      var texto = String(el.value || "").trim();
      if (!texto) { box.innerHTML = '<span style="color:#dc2626">Escreva a descrição com as medidas.</span>'; return; }
      var r = Orcamento.lerDescricaoQuantitativo(texto);
      if (r.ok) { this._memMostrar(r); return; }
      if (!comIA) {
        box.innerHTML = '<span style="color:#dc2626">' + Util.esc(r.erro) + "</span>" +
          '<div class="muted" style="font-size:11px;margin-top:4px">Use a calculadora abaixo, ou clique em <b>Tentar com IA</b>.</div>';
        return;
      }
      this._memIA(texto, box);
    },

    /* Reforço de IA: só para a frase que o cálculo local NÃO entendeu.
     * ⚠ A IA não devolve quantidade pronta — ela devolve a FORMA e os
     * PARÂMETROS, e quem calcula continua sendo o motor local. Número vindo
     * direto do modelo não é conferível e não pode virar metragem de obra. */
    _memIA: function (texto, box) {
      var self = this;
      var back = (typeof CONFIG !== "undefined" && CONFIG.iaBackend) || "";
      if (!back) { box.innerHTML = '<span style="color:#dc2626">IA não configurada neste aparelho.</span>'; return; }
      /* ⚠ v1.1.236 — A RESPOSTA TEM DONO. A consulta demora até 12 s e o modal
         continua interativo: quem se cansa fecha, abre a Memória de OUTRO item
         e faz a conta dele. Quando a resposta antiga chegava, `_memMostrar`
         escrevia por cima — os ids dos campos são os mesmos em qualquer modal
         de memória. O item B ficava com a metragem de A e com a memória de
         cálculo de A como justificativa (a peça que a Lei 14.133 exige), e
         `aplicarMemoriaQuantidade` só barra quando a unidade difere — dois
         serviços em m² passavam direto. Guardar o objeto `_mem` do disparo e
         comparar por identidade resolve: `abrirMemoria` cria um novo a cada
         abertura, então "é outro objeto" significa "é outro item". */
      var alvo = this._mem;
      box.innerHTML = '<span class="muted">Consultando a IA…</span>';
      var ctrl = null;
      try { ctrl = new AbortController(); setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, 12000); } catch (e) {}
      var formas = [];
      for (var k in Orcamento.FORMAS_MEMORIA) {
        if (!Orcamento.FORMAS_MEMORIA.hasOwnProperty(k)) continue;
        formas.push({ forma: k, unidade: Orcamento.FORMAS_MEMORIA[k].unidade,
                      campos: Orcamento.FORMAS_MEMORIA[k].campos.map(function (c) { return c.id; }) });
      }
      fetch(back + "/ia/quantitativo", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-licenca": (typeof Licenca !== "undefined" ? Licenca.chave() : "") },
        body: JSON.stringify({ descricao: texto, formas: formas }),
        signal: ctrl ? ctrl.signal : undefined
      }).then(function (resp) { return resp.json(); }).then(function (j) {
        if (self._mem !== alvo) return;   // o usuário já está em outro item: descarta calado
        var pr = j && j.ok && j.resultado;
        if (!pr || !pr.forma || !Orcamento.FORMAS_MEMORIA[pr.forma]) {
          box.innerHTML = '<span style="color:#dc2626">A IA não conseguiu montar a conta. Use a calculadora abaixo.</span>';
          return;
        }
        var r = Orcamento.calcularMemoria(pr.forma, pr.dados || {});
        if (!r.ok) { box.innerHTML = '<span style="color:#dc2626">' + Util.esc(r.erro) + "</span>"; return; }
        r.forma = pr.forma; r.confianca = pr.confianca || "media"; r.viaIA = true;
        if (pr.premissas && pr.premissas.length) r.comoLi = pr.premissas.slice(0, 4);
        self._memMostrar(r);
      }).catch(function () {
        if (self._mem !== alvo) return;
        box.innerHTML = '<span style="color:#dc2626">Sem conexão com a IA. Use a calculadora abaixo — ela funciona offline.</span>';
      });
    },

    /* Desenha os campos da forma escolhida na calculadora. */
    memForma: function () {
      var sel = UI.el("mem-forma"), box = UI.el("mem-campos");
      if (!sel || !box) return;
      var F = Orcamento.FORMAS_MEMORIA[sel.value];
      if (!F) { box.innerHTML = ""; return; }
      var h = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px">';
      F.campos.forEach(function (c) {
        h += '<div><label style="font-size:11px;display:block">' + Util.esc(c.rotulo) + "</label>" +
             '<input class="cell" style="width:100%;box-sizing:border-box" id="memc-' + Util.esc(c.id) + '" ' +
             'inputmode="decimal" value="' + (c.padrao != null ? c.padrao : "") + '"></div>';
      });
      h += "</div>" +
        '<button class="btn" data-acao="mem-calc" type="button" style="margin-top:8px">Calcular</button>';
      box.innerHTML = h;
    },

    /* Roda a calculadora com o que está nos campos. */
    memCalcular: function () {
      var sel = UI.el("mem-forma"), box = UI.el("mem-saida");
      if (!sel || !box) return;
      var F = Orcamento.FORMAS_MEMORIA[sel.value];
      if (!F) return;
      var d = {};
      F.campos.forEach(function (c) { var e = UI.el("memc-" + c.id); d[c.id] = e ? e.value : ""; });
      var r = Orcamento.calcularMemoria(sel.value, d);
      if (!r.ok) { box.innerHTML = '<span style="color:#dc2626">' + Util.esc(r.erro) + "</span>"; return; }
      r.forma = sel.value; r.confianca = "alta";
      this._memMostrar(r);
    },

    /* Mostra a conta, guarda o resultado e joga o texto no campo do memorial. */
    _memMostrar: function (r) {
      var box = UI.el("mem-saida"); if (!box) return;
      this._mem = this._mem || {};
      this._mem.r = r;
      var it = this._memItem();
      var bate = !it || !it.unidade || Orcamento.unidadeCompativel(it.unidade, r.unidade);
      var h = '<div style="padding:8px;border-radius:6px;background:' + (bate ? "rgba(22,163,74,.08)" : "rgba(234,88,12,.10)") + '">' +
        '<b style="color:' + (bate ? "#16a34a" : "#ea580c") + ';font-size:15px">' +
        Util.esc(Util.fmtNum(r.qtd, 2)) + " " + Util.esc(Util.unidadeExibir(r.unidade)) + "</b>" +
        (r.viaIA ? ' <span class="muted" style="font-size:10px">· via IA, conta feita localmente</span>' : "") +
        '<div style="margin-top:4px;white-space:pre-wrap;font-family:ui-monospace,monospace;font-size:11px">' +
        Util.esc(r.texto) + "</div>";
      if (r.comoLi && r.comoLi.length) {
        h += '<div class="muted" style="font-size:11px;margin-top:6px">Como eu li: ' +
             Util.esc(r.comoLi.join(" · ")) + "</div>";
      }
      if (!bate) {
        h += '<div style="margin-top:6px;color:#ea580c;font-size:11px"><b>Confira:</b> este item é em <b>' +
             Util.esc(Util.unidadeExibir(it.unidade)) + "</b>. Não dá para subir uma quantidade em " +
             Util.esc(Util.unidadeExibir(r.unidade)) + " — ajuste a descrição ou a unidade do item.</div>";
      }
      h += "</div>";
      box.innerHTML = h;
      var t = UI.el("mem-texto");
      if (t) t.value = r.texto;
      /* ⚠ ROLAR ATÉ A CONTA. Medido no navegador: o modal não cabe inteiro na
         tela, e a conta nascia ABAIXO da dobra — o usuário clicava em "Gerar
         memorial", nada parecia acontecer, e ele clicava de novo. O resultado
         precisa aparecer sozinho, senão o recurso parece quebrado. */
      try { box.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (e) {}
    },

    _memItem: function () {
      var m = this._mem, orc = this.orcAtual;
      if (!m || !orc) return null;
      var et = (orc.etapas || []).filter(function (e) { return e.id === m.etapaId; })[0];
      return et && (et.itens || []).filter(function (x) { return x.id === m.itemId; })[0];
    },

    /* Sobe a quantidade calculada (e a memória junto) para o item. */
    memSubir: function () {
      var m = this._mem, orc = this.orcAtual;
      if (!m || !orc) return;
      var it = this._memItem();
      if (!it) { UI.toast("Item não encontrado.", "erro"); return; }
      // o usuário pode ter editado o texto à mão — o que vale é o que está na tela
      var textoTela = String((UI.el("mem-texto") || {}).value || "").trim();
      if (!m.r || !m.r.ok) {
        UI.toast("Gere a conta primeiro — sem ela não há quantidade para subir.", "erro");
        return;
      }
      var r = { ok: true, qtd: m.r.qtd, unidade: m.r.unidade, texto: textoTela || m.r.texto };
      var res = Orcamento.aplicarMemoriaQuantidade(orc, m.etapaId, m.itemId, r);
      if (!res.ok) { UI.toast(res.erro, "erro"); return; }
      this.persistir(); UI.fecharModal(); this.render();
      UI.toast("Quantidade " + Util.fmtNum(res.qtd, 2) + " " + Util.unidadeExibir(it.unidade) +
               " lançada com a memória de cálculo.", "ok");
    },

    /* =================================================================
     * ALTERAÇÕES SOBRE O PREÇO DA BASE
     *
     * A tela responde a três perguntas, nesta ordem — que é a ordem em que
     * elas aparecem na cabeça de quem revisa um orçamento:
     *   1. de quanto era?   2. quanto mudou, em R$ e em %?   3. dá pra voltar?
     *
     * O campo de justificativa não é enfeite: preço acima da referência
     * oficial precisa de motivo escrito quando o orçamento vai para um órgão
     * público (Lei 14.133/2021). Escrever na hora da alteração é a única
     * chance real de o motivo existir — três meses depois ninguém lembra.
     * ================================================================= */
    abrirAjuste: function (etapaId, itemId) {
      var self = this, orc = this.orcAtual; if (!orc) return;
      var etapa = (orc.etapas || []).filter(function (e) { return e.id === etapaId; })[0];
      var it = etapa && (etapa.itens || []).filter(function (x) { return x.id === itemId; })[0];
      if (!it || typeof Ajustes === "undefined") return;
      var ds = Ajustes.doItem(it);
      if (!ds.length) return;
      var q = Util.num(it.quantidade);

      var body = '<p class="muted" style="margin-top:0"><b>' + Util.esc(it.codigo || "") + '</b> · ' +
        Util.esc(String(it.descricao || "").slice(0, 95)) + '</p>';

      ds.forEach(function (d) {
        var casas = d.coeficiente ? 4 : 2;
        var cls = d.semBase ? "novo" : (d.dif > 0 ? "sobe" : "desce");
        body += '<div class="cmp-ajuste">' +
          '<div class="cmp-linha"><span class="cmp-rot">' + Util.esc(Ajustes.rotulo(d.campo)) + '</span></div>' +
          '<div class="cmp-nums">' +
            '<div class="cmp-cel"><span class="cmp-lbl">Na base</span><b>' + Ajustes.fmtN(d.base, casas) + '</b>' +
              (d.fonte ? '<span class="cmp-sub">' + Util.esc(d.fonte + (d.competencia ? " " + d.competencia : "") + (d.uf ? "/" + d.uf : "")) + '</span>' : '') + '</div>' +
            '<div class="cmp-seta">→</div>' +
            '<div class="cmp-cel"><span class="cmp-lbl">Seu valor</span><b>' + Ajustes.fmtN(d.atual, casas) + '</b></div>' +
            '<div class="cmp-cel ' + cls + '"><span class="cmp-lbl">Diferença</span><b>' +
              (d.dif > 0 ? "+" : "") + Ajustes.fmtN(d.dif, casas) + '</b>' +
              '<span class="cmp-sub">' + (d.semBase ? "sem preço na base" : Ajustes.fmtPct(d.pct)) + '</span></div>' +
          '</div>';
        /* o que a diferença representa no orçamento — a pergunta seguinte de
           quem revisa é sempre "e isso dá quanto no total?" */
        if (!d.coeficiente && q > 0) {
          body += '<div class="cmp-impacto">Nos <b>' + Util.fmtNum(q, 2) + ' ' + Util.esc(Util.unidadeExibir(it.unidade)) +
            '</b> deste item: <b>' + (d.dif > 0 ? "+" : "−") + Util.fmtMoeda(Math.abs(d.dif * q)).replace("R$", "R$ ") +
            '</b> em relação ao preço da base.</div>';
        }
        if (d.baseMudou) {
          body += '<div class="cmp-alerta">A base mudou depois da sua alteração: era ' +
            Ajustes.fmtN(d.baseMudou.de, casas) + ' e passou a ' + Ajustes.fmtN(d.baseMudou.para, casas) +
            '. A comparação acima já usa o valor atual.</div>';
        }
        body += '<div class="cmp-meta">' + (d.por ? "Por " + Util.esc(d.por) + " · " : "") +
          (d.em ? Util.fmtData(d.em) : "") + '</div>' +
          '<button class="btn sm" data-ajuste-restaurar="' + etapaId + '|' + itemId + '|' + Util.esc(d.campo) + '">' +
          (typeof Icones !== "undefined" ? Icones.get("voltar", 15) : "") + ' Restaurar ' + Ajustes.fmtN(d.base, casas) + '</button>' +
          '</div>';
      });

      var dPreco = ds.filter(function (d) { return d.campo === "custoUnitario"; })[0];
      body += '<label class="cmp-just"><span>Justificativa <span class="muted">(sai no relatório de alterações e na exportação)</span></span>' +
        '<textarea id="aj-motivo" class="cell" style="width:100%;min-height:64px;resize:vertical" placeholder="Ex.: cotação local com 3 fornecedores em 08/2026; insumo indisponível na região.">' +
        Util.esc((dPreco && dPreco.motivo) || (ds[0] && ds[0].motivo) || "") + '</textarea></label>';
      if (dPreco && dPreco.dif > 0) {
        body += '<div class="cmp-alerta">Preço <b>acima</b> da referência oficial. Em orçamento para órgão público, ' +
          'a justificativa é exigida (Lei 14.133/2021) — escreva agora enquanto o motivo está fresco.</div>';
      }

      UI.modal("Valor alterado por você", body, [
        { texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
        { texto: "Salvar justificativa", classe: "primary", onClick: function () {
            var m = String((UI.el("aj-motivo") || {}).value || "").trim();
            (it.ajustes ? Object.keys(it.ajustes) : []).forEach(function (k) { it.ajustes[k].motivo = m; });
            self.persistir(); UI.fecharModal(); self.render();
            UI.toast(m ? "Justificativa salva." : "Justificativa removida.", "ok");
          } }
      ]);
    },

    /* -----------------------------------------------------------------
     * COEFICIENTE AJUSTADO — grava o desvio e reprecifica o item.
     *
     * O preço NÃO é recomposto do zero (Σ coef × preço), e sim por DIFERENÇA
     * sobre o preço oficial. Motivo em `ajustes.js`: a SINAPI não coleta o
     * preço de todo insumo em toda UF, então a soma dos insumos costuma ficar
     * abaixo do oficial. Recompor derrubaria o item em silêncio — o usuário
     * mexeria num coeficiente e veria o preço cair 30% sem entender.
     * ----------------------------------------------------------------- */
    _ajustarCoeficiente: function (codigoInsumo, valor) {
      var ctx = UI._ajusteCtx;
      if (!ctx || !ctx.item || typeof Ajustes === "undefined") return;
      var it = ctx.item, cod = String(codigoInsumo), novo = Util.num(valor);
      var ana = (typeof Analitico !== "undefined" && Analitico.obter) ? Analitico.obter(ctx.codigo) : null;
      var ins = ana && Util.arr(ana.insumos).filter(function (i) { return String(i.codigo) === cod; })[0];
      if (!ins) return;
      if (novo < 0) { UI.toast("Coeficiente não pode ser negativo — valor anterior mantido.", "erro"); this.verInsumos(ctx.codigo, ctx.etapaId + "|" + ctx.itemId); return; }
      var atualAntes = (it.coeficientes && cod in it.coeficientes) ? Util.num(it.coeficientes[cod]) : Util.num(ins.coeficiente);

      Orcamento._registrarAjuste(this.orcAtual, it, "coef:" + cod, atualAntes, novo);
      if (Ajustes.tem(it, "coef:" + cod)) {
        if (!it.coeficientes) it.coeficientes = {};
        it.coeficientes[cod] = novo;
      } else if (it.coeficientes) {             /* voltou ao da base: some o override */
        delete it.coeficientes[cod];
        if (!Object.keys(it.coeficientes).length) delete it.coeficientes;
      }
      this._aplicarDeltaCoef(it, ins, atualAntes, novo);
      this.persistir();
      UI.toast("Coeficiente de " + cod + " ajustado — o custo unitário do item foi recalculado.", "ok");
      this.verInsumos(ctx.codigo, ctx.etapaId + "|" + ctx.itemId);   /* redesenha o modal */
      this.render();
    },

    /* -----------------------------------------------------------------
     * Aplica ao preço SÓ o incremento desta mexida:
     *     preço += (coefNovo − coefAnterior) × preço do insumo
     *
     * Por que incremental e não "recompor do oficial": quem já tinha corrigido
     * o preço à mão (cotação local, 25 → 26) perderia essa correção assim que
     * encostasse num coeficiente — o preço voltaria para a conta oficial sem
     * avisar. Incremental respeita as duas coisas: a correção manual continua
     * de pé e o ajuste de produtividade entra por cima dela.
     *
     * Também é o que faz o restaurar fechar a conta: voltar o coeficiente ao
     * valor da base desconta exatamente o que ele tinha somado.
     * ----------------------------------------------------------------- */
    _aplicarDeltaCoef: function (it, insumo, coefAntes, coefDepois) {
      var precoIns = Util.num(insumo.custoUnitario);
      /* insumo sem preço coletado na UF não move o total — não há o que
         multiplicar. O coeficiente fica registrado assim mesmo: quando o
         preço for informado, ele já vale. */
      if (!precoIns) return;
      var novoPreco = Math.round((Util.num(it.custoUnitario) + (Util.num(coefDepois) - Util.num(coefAntes)) * precoIns) * 100) / 100;
      if (novoPreco < 0) novoPreco = 0;
      Orcamento._registrarAjuste(this.orcAtual, it, "custoUnitario", it.custoUnitario, novoPreco);
      it.custoUnitario = novoPreco;
    },

    /* restaurar UM campo: devolve o valor da base e recalcula tudo */
    _restaurarAjuste: function (etapaId, itemId, campo) {
      var orc = this.orcAtual; if (!orc || typeof Ajustes === "undefined") return;
      var etapa = (orc.etapas || []).filter(function (e) { return e.id === etapaId; })[0];
      var it = etapa && (etapa.itens || []).filter(function (x) { return x.id === itemId; })[0];
      if (!it) return;
      var base = Ajustes.restaurar(it, campo);
      if (base === null) return;
      if (campo === "custoUnitario") it.custoUnitario = base;
      else if (String(campo).indexOf("coef:") === 0) {
        /* desconta do preço exatamente o que este coeficiente tinha somado */
        var cod = String(campo).slice(5);
        var atual = (it.coeficientes && cod in it.coeficientes) ? Util.num(it.coeficientes[cod]) : base;
        var anaR = (typeof Analitico !== "undefined" && Analitico.obter) ? Analitico.obter(String(it.codigo)) : null;
        var insR = anaR && Util.arr(anaR.insumos).filter(function (i) { return String(i.codigo) === cod; })[0];
        if (insR) this._aplicarDeltaCoef(it, insR, atual, base);
        if (it.coeficientes) { delete it.coeficientes[cod]; if (!Object.keys(it.coeficientes).length) delete it.coeficientes; }
      }
      this.persistir(); UI.fecharModal(); this.render();
      UI.toast("Valor da base restaurado.", "ok");
    },

    abrirAjustesLista: function () {
      var self = this, orc = this.orcAtual; if (!orc || typeof Ajustes === "undefined") return;
      var r = Ajustes.resumo(orc);
      if (!r.n) { UI.toast("Nenhum valor alterado neste orçamento.", "ok"); return; }
      var body = '<p class="muted" style="margin-top:0">Tudo que foi alterado em cima do preço da base, do maior impacto para o menor. ' +
        'O que <b>não</b> aparece aqui está exatamente como a base entrega.</p>' +
        '<table class="tbl" style="font-size:12.5px"><thead><tr>' +
        '<th>Código</th><th>Descrição</th><th class="num">Na base</th><th class="num">Seu valor</th>' +
        '<th class="num">%</th><th class="num">Impacto</th><th>Justificativa</th><th></th></tr></thead><tbody>';
      r.itens.forEach(function (i) {
        var d = i.preco;
        var coefs = i.deltas.filter(function (x) { return x.coeficiente; }).length;
        body += '<tr><td><b>' + Util.esc(i.codigo) + '</b></td>' +
          '<td>' + Util.esc(String(i.descricao).slice(0, 46)) + (coefs ? ' <span class="pill">' + coefs + ' coef.</span>' : '') + '</td>' +
          (d ? '<td class="num">' + Ajustes.fmtN(d.base, 2) + '</td>' +
               '<td class="num"><b>' + Ajustes.fmtN(d.atual, 2) + '</b></td>' +
               '<td class="num ' + (d.dif > 0 ? "aj-sobe" : "aj-desce") + '">' + (d.semBase ? "novo" : Ajustes.fmtPct(d.pct)) + '</td>' +
               '<td class="num ' + (i.impacto > 0 ? "aj-sobe" : "aj-desce") + '">' + (i.impacto > 0 ? "+" : "−") + Util.fmtMoeda(Math.abs(i.impacto)) + '</td>'
             : '<td class="num muted">—</td><td class="num muted">—</td><td class="num muted">—</td><td class="num muted">—</td>') +
          '<td class="muted" style="font-size:11.5px">' + Util.esc(String((d && d.motivo) || (i.deltas[0] && i.deltas[0].motivo) || "").slice(0, 40)) +
            (!((d && d.motivo) || (i.deltas[0] && i.deltas[0].motivo)) && d && d.dif > 0 ? '<span class="aj-sobe">sem justificativa</span>' : '') + '</td>' +
          '<td><button class="btn sm ghost" data-ajuste="' + i.etapaId + '|' + i.itemId + '">ver</button></td></tr>';
      });
      body += '</tbody></table>';
      var semJust = r.itens.filter(function (i) {
        return i.preco && i.preco.dif > 0 && !i.preco.motivo;
      }).length;
      if (semJust) {
        body += '<div class="cmp-alerta">' + semJust + ' item(ns) <b>acima</b> da base sem justificativa escrita. ' +
          'Em licitação isso é o primeiro ponto questionado.</div>';
      }
      UI.modal("Alterações sobre o preço da base (" + r.n + ")", body, [
        { texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
        { texto: "Restaurar TODOS os preços da base", classe: "ghost danger", onClick: function () {
            if (!window.confirm("Restaurar os " + r.n + " itens para o preço da base?\n\n" +
              "As suas alterações E as justificativas escritas serão perdidas. Não há como desfazer.")) return;
            r.itens.forEach(function (i) {
              var et = (orc.etapas || []).filter(function (e) { return e.id === i.etapaId; })[0];
              var it = et && (et.itens || []).filter(function (x) { return x.id === i.itemId; })[0];
              if (!it) return;
              Ajustes.restaurarTudo(it).forEach(function (c) {
                if (c.campo === "custoUnitario") it.custoUnitario = c.base;
              });
              if (it.coeficientes) delete it.coeficientes;
            });
            self.persistir(); UI.fecharModal(); self.render();
            UI.toast("Todos os preços voltaram para a base.", "ok");
          } }
      ]);
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

    /* termoInicial: reabre a busca com o que já estava digitado — é o que
       sustenta o "Adicionar e continuar" (lançar vários itens da mesma busca
       sem redigitar). Chamada sem o 2º argumento continua idêntica. */
    abrirBuscaSinapi: function (etapaId, termoInicial, subEtapaId) {
      this._addItemEtapaId = etapaId;
      // destino opcional: "+ Item" clicado na linha de uma SUB etapa lança lá dentro
      this._addItemSubId = subEtapaId || "";
      var self = this;
      var corpo =
        '<div class="field"><input id="bs-q" value="' + Util.esc(termoInicial || "") + '" placeholder="Buscar por código ou descrição (ex.: alvenaria bloco, concreto fck)" autofocus></div>' +
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
      UI.modalConsulta(); // busca é consulta: fechar depois de digitar não pode pedir confirmação

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
            // tabelas DESMARCADAS no passo 3 deste orçamento saem do seletor (denylist —
            // banco instalado depois aparece sozinho; é por orçamento, não global).
            var excluidasSel = {};
            try {
              var cfgB = self.orcAtual && Orcamento.garantirConfig(self.orcAtual);
              Util.arr(cfgB && cfgB.basesExcluidas).forEach(function (f) { excluidasSel[String(f).toUpperCase()] = 1; });
            } catch (e) {}
            var temExclusao = false; for (var kE in excluidasSel) { temExclusao = true; break; }
            var opts = ['<option value="">Todos os bancos' + (temExclusao ? " deste orçamento" : " ativos") + '</option>'];
            // bancos JÁ carregados → selecionáveis para filtrar a busca
            lista.filter(function (b) { return b.ativa && !excluidasSel[String(b.fonte).toUpperCase()]; }).forEach(function (b) {
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
            opts.push('<option value="__manage">' + (typeof Icones !== 'undefined' ? Icones.get('tabela', 15) : '') + ' Gerenciar bancos / outro estado ou competência…</option>');
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
          // DENYLIST do passo 3: só o que o usuário DESMARCOU sai da busca deste
          // orçamento. Tabela instalada depois aparece sozinha — allowlist escondia
          // banco novo e a UI prometia o contrário.
          var excluidas = self._fontesExcluidas();
          return { max: 120, fonte: (UI.el("bs-fonte") || {}).value || "", excluirFontes: excluidas,
            tipo: (UI.el("bs-tipo") || {}).value || "", desonerado: dv === "des" ? true : (dv === "one" ? false : null) };
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
            /* ⚠ A DICA DE REGIME TAMBÉM ESTAVA INVERTIDA, pelo mesmo motivo do
               flag: ela avisava "verifique se a base ONERADA está carregada"
               justamente quando o usuário filtrava por ONERADA — e ficava muda
               no caso que realmente não tem resultado. Desde a v1.1.204 a
               SINAPI que vem no app é a das abas CSD/ISD, que a própria
               planilha declara SEM DESONERAÇÃO: filtrar "Desonerada" não
               devolve SINAPI porque nós não distribuímos esse regime, e a tela
               tem de dizer isso em vez de deixar o usuário procurando. */
            var dica = "", temDesonerada = false;
            if (f.tipo === "insumo") {
              dica = " — esta base pode não ter insumos (carregue uma base de insumos em " + (typeof Icones !== "undefined" ? Icones.get("tabela", 15) : "") + " Tabelas)";
            } else if (f.desonerado === true) {
              /* ⚠ ANTES ISTO MANDAVA "tire o filtro de oneração". Era o pior
                 conselho possível: quem precisa de desonerado e tira o filtro
                 orça no regime errado sem perceber — e a tela sabia que a base
                 desonerada existe no servidor, sabia a UF pedida e sabe
                 instalá-la em um clique. Agora ela oferece o caminho certo. */
              dica = " — a SINAPI que vem no pacote é a NÃO DESONERADA (abas CSD/ISD da CAIXA). A desonerada (CCD/ICD) existe, mas é baixada à parte, por estado";
              temDesonerada = true;
            } else if (f.desonerado === false) {
              dica = " — nenhuma base carregada declara o regime não desonerado para este termo";
            }
            // v1.1.124 — não existe nas bases? cria DAQUI, sem sair do fluxo. O
            // atalho acompanha o filtro: buscando INSUMO → cadastra insumo próprio;
            // senão → cria composição própria (descrição aproveitada nos dois).
            var ehIns0 = f.tipo === "insumo";
            box.innerHTML = '<div class="vazio">Nenhum resultado para "' + Util.esc(q) + '"' + dica + ".</div>" +
              (temDesonerada ? '<button type="button" class="btn primary" id="bs-instalar-des" style="width:100%;margin-top:8px">' +
                (typeof Icones !== "undefined" ? Icones.get("estoque", 15) : "") + ' Instalar a SINAPI desonerada deste estado (3 MB)</button>' : "") +
              '<button type="button" class="btn primary" id="bs-criar-cp" style="width:100%;margin-top:8px">' + (ehIns0 ? "" + (typeof Icones !== "undefined" ? Icones.get("mais", 15) : "") + " Cadastrar insumo próprio com esta descrição" : "" + (typeof Icones !== "undefined" ? Icones.get("mais", 15) : "") + " Criar composição própria com esta descrição") + '</button>';
            var _bIns = box.querySelector("#bs-instalar-des");
            if (_bIns) {
              _bIns.onclick = function () {
                /* a instalação mora em Tabelas, com o seletor de estado: mandar
                   para lá é honesto — a base é por UF e quem escolhe é o usuário */
                UI.fecharModal();
                self.abrirTabelas();
                UI.toast("Procure a linha “SINAPI desonerada”, escolha o estado e clique em Instalar.", "ok");
              };
            }
            var _ehIns0 = (typeof ehIns0 !== "undefined") ? ehIns0 : false;
            if (!_ehIns0) {
              /* o agente e a resposta melhor quando a base nao tem o servico:
                 monta a estrutura a partir da oficial mais parecida */
              var _bx = box.querySelector("#bs-criar-cp");
              if (_bx) { var _b = document.createElement("button"); _b.type = "button";
                _b.className = "btn success"; _b.style.cssText = "width:100%;margin-top:6px";
                _b.title = "Monta a composicao a partir da composicao oficial mais parecida — insumos e coeficientes reais, nunca inventados";
                _b.innerHTML = (typeof Icones !== "undefined" ? Icones.get("escopo", 15) : "") + " Elaborar com o agente";
                _b.onclick = function () { self.elaborarComposicao(q, { etapa: self._addItemEtapaId || null, sub: self._addItemSubId || "" }); };
                _bx.parentNode.insertBefore(_b, _bx.nextSibling); } }
            var bCp0 = UI.el("bs-criar-cp");
            if (bCp0) bCp0.onclick = function () { if (ehIns0) self.criarInsumoDaBusca(q); else self.criarComposicaoDaBusca(q); };
            return;
          }
          // LOTE 5: paginação — 15 por vez com "mostrar mais" (40+ de uma vez
          // congelava o mobile e enterrava os melhores resultados)
          var PAG = 15;
          function pintarResultados(ate) {
            ate = Math.min(res.length, ate);
            var ehInsR = f.tipo === "insumo"; // atalho acompanha o filtro (insumo × composição)
            var html2 = res.slice(0, ate).map(function (r) {
              var it = r.item, tg = r.tipo === "insumo" ? ' <span class="pill proprio">insumo</span>' : "";
              return '<div class="sinapi-result" data-pick="' + Util.esc(it.codigo) + '|' + Util.esc(r.fonte) + '">' +
                /* a busca varre TODAS as bases ao mesmo tempo — sem normalizar,
                   a mesma unidade aparece "M2" na linha da SINAPI e "m²" na do
                   SICRO, uma embaixo da outra. Aqui é tela, não documento: a
                   grafia fiel da licitação é decidida na planilha (unidadeDe). */
                '<div class="desc"><div class="cod"><span class="pill ' + (r.cor || "sinapi") + '">' + Util.esc(r.label) + "</span>" + tg + " " + Util.esc(it.codigo) + " · " + Util.esc(Util.unidadeExibir(it.unidade)) + "</div>" +
                Util.esc(it.descricao) + "</div>" +
                '<div class="preco">' + Util.fmtMoeda(it.custoUnitario) + "</div></div>";
            }).join("");
            html2 += (res.length > ate ? '<button type="button" class="btn ghost" id="bs-mais" style="width:100%;margin-top:8px">' + (typeof Icones !== 'undefined' ? Icones.get('mais', 15) : '') + ' Mostrar mais ' + Math.min(PAG, res.length - ate) + " (de " + (res.length - ate) + " restantes)</button>" : "") +
              // v1.1.124 — achou resultados mas nenhum serve? cria DAQUI, sem sair da busca
              '<button type="button" class="btn ghost" id="bs-criar-cp" style="width:100%;margin-top:6px;font-size:12px">Nenhum serve? ' + (ehInsR ? "" + (typeof Icones !== "undefined" ? Icones.get("mais", 15) : "") + " Cadastrar insumo próprio" : "" + (typeof Icones !== "undefined" ? Icones.get("mais", 15) : "") + " Criar composição própria") + ' com esta descrição</button>';
            box.innerHTML = html2;
            Array.prototype.forEach.call(box.querySelectorAll("[data-pick]"), function (row) {
              row.onclick = function () { self.escolherItemSinapi(row.dataset.pick); };
            });
            var mais = UI.el("bs-mais");
            if (mais) mais.onclick = function () { pintarResultados(ate + PAG); };
            var _ehIns = (typeof ehInsR !== "undefined") ? ehInsR : false;
            if (!_ehIns) {
              /* o agente e a resposta melhor quando a base nao tem o servico:
                 monta a estrutura a partir da oficial mais parecida */
              var _bx = box.querySelector("#bs-criar-cp");
              if (_bx) { var _b = document.createElement("button"); _b.type = "button";
                _b.className = "btn success"; _b.style.cssText = "width:100%;margin-top:6px";
                _b.title = "Monta a composicao a partir da composicao oficial mais parecida — insumos e coeficientes reais, nunca inventados";
                _b.innerHTML = (typeof Icones !== "undefined" ? Icones.get("escopo", 15) : "") + " Elaborar com o agente";
                _b.onclick = function () { self.elaborarComposicao(q, { etapa: self._addItemEtapaId || null, sub: self._addItemSubId || "" }); };
                _bx.parentNode.insertBefore(_b, _bx.nextSibling); } }
            var bCp = UI.el("bs-criar-cp");
            if (bCp) bCp.onclick = function () { if (ehInsR) self.criarInsumoDaBusca(q); else self.criarComposicaoDaBusca(q); };
          }
          pintarResultados(PAG);
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
            // v1.1.121: pacote de estado único deixou de travar o seletor — as 27 UFs
            // sempre aparecem; sem arquivo local, a troca baixa a base AO VIVO do servidor.
            var UFS27 = ["AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO"];
            var lista = ests.length ? ests : UFS27.map(function (u) { return { uf: u }; });
            var temAtual = lista.some(function (e) { return e.uf === atual; });
            var o = lista.map(function (e) { return '<option value="' + Util.esc(e.uf) + '">' + Util.esc(e.uf) + (e.competencia ? " · " + Util.esc(e.competencia) : "") + "</option>"; });
            if (atual && !temAtual) o.unshift('<option value="' + Util.esc(atual) + '">' + Util.esc(atual) + " · ativa</option>");
            selUf.innerHTML = o.join("");
            selUf.value = atual;
            if (!ests.length) selUf.title = "Sem manifesto local — estados carregam ao vivo do servidor OrçaPRO";
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
        if (termoInicial) inp.select(); // digitar troca a busca inteira; End/→ refina
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
          if (b) b.innerHTML = '<div class="vazio">' + (typeof Icones !== 'undefined' ? Icones.get('alerta', 15) : '') + ' Não foi possível carregar a base SINAPI.<br>' +
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
      /* capturado ANTES do fecharModal: ele faz m.remove() e leva junto o
         #bs-q e todo o closure da busca. */
      var termoBusca = String((UI.el("bs-q") || {}).value || "");
      var etapaAlvo = this._addItemEtapaId, subAlvo = this._addItemSubId || "";
      UI.fecharModal();
      /* uma função só para os dois botões: duplicar o corpo abriria espaço para
         a regra de preço zerado divergir entre "adicionar" e "adicionar e
         continuar" — que é exatamente o tipo de diferença que ninguém percebe. */
      self._qiItem = item; self._qiMemoria = null;
      function lancar(continuar) {
        var qtd = Util.num((UI.el("qi-qtd") || {}).value);
        var cu = Util.num((UI.el("qi-cu") || {}).value);
        var cfgZ = Orcamento.garantirConfig(self.orcAtual);
        if (cu <= 0 && !cfgZ.permitirZerado) {
          UI.toast("Este item está com preço zerado. Informe o custo unitário ou libere em Parâmetros → “Permitir insumos com preço zerado”.", "erro");
          return;
        }
        var itemAjustado = Util.clone(item); itemAjustado.custoUnitario = cu; itemAjustado.baseFonte = fonte;
        // a conta escrita viaja com o item: e ela que justifica a metragem
        if (self._qiMemoria) itemAjustado.memoriaCalculo = self._qiMemoria;
        /* modo escolhido: aplica DEPOIS do custo digitado, para o cheio ficar
           guardado em custoBase — é ele que permite voltar para "Completa". */
        var modoEl = document.querySelector('input[name="qi-modo"]:checked');
        var modo = modoEl ? modoEl.value : "total";
        if (modo !== "total") {
          var rm = Orcamento.aplicarModoCusto(itemAjustado, modo);
          if (!rm.ok) { UI.toast(rm.erro, "erro"); return; }
        }
        Orcamento.addItem(self.orcAtual, etapaAlvo, itemAjustado, qtd, subAlvo);
        /* item novo em etapa (ou sub etapa) recolhida nasceria invisível — o
           usuário reporta como "não lançou". */
        if (self.expandirEtapa) self.expandirEtapa(etapaAlvo, subAlvo);
        self.persistir(); UI.fecharModal(); self.render();
        if (continuar) {
          UI.toast("Item adicionado — continue lançando.", "ok");
          self.abrirBuscaSinapi(etapaAlvo, termoBusca, subAlvo);
        } else {
          UI.toast("Item adicionado.", "ok");
        }
      }
      UI.modal("Quantidade — " + Util.esc(item.codigo),
        '<p>' + Util.esc(item.descricao) + '</p>' +
        /* COMPOSIÇÃO POR CATEGORIA: a escolha é aqui, na hora de lançar. Só
           aparece quando a base publica a separação — oferecer a opção e
           depois recusar seria pior que não oferecer. */
        (function () {
          var p = Orcamento.parcelasDe(item);
          if (!p.temBreakdown) return "";
          var op = function (id, val) {
            var m = Orcamento.MODOS_CUSTO[id];
            return '<label style="display:block;cursor:pointer;padding:2px 0;font-size:12.5px" title="' + Util.esc(m.ajuda) + '">' +
              '<input type="radio" name="qi-modo" value="' + id + '"' + (id === "total" ? " checked" : "") + '> ' +
              Util.esc(m.rotulo) + ' <b>' + Util.fmtMoeda(val) + '</b>/' + Util.esc(Util.unidadeExibir(item.unidade)) + '</label>';
          };
          return '<div class="field"><label>O que entra deste serviço</label>' +
            op("total", p.total) + op("mo", p.mo) + op("matEq", p.matEq) +
            '<span class="muted" style="font-size:11px">O item guarda as três parcelas — dá para trocar depois sem refazer nada.</span></div>';
        })() +
        /* MEMORIAL: descrever em português e deixar o sistema fazer a conta.
           Fica ANTES da quantidade porque é assim que o orçamentista pensa —
           ele sabe as medidas, não o total. */
        '<div class="field"><label>Como você chegou nessa quantidade? <span class="muted" style="font-weight:400">(opcional)</span></label>' +
          '<div class="flex" style="gap:6px">' +
            '<input id="qi-desc" style="flex:1" placeholder="Ex.: alvenaria de 100 m por 2,20 de altura" autocomplete="off">' +
            '<button type="button" class="btn sm primary" data-acao="qi-calcular">Calcular</button></div>' +
          '<div id="qi-memo" class="muted" style="font-size:11.5px;margin-top:4px"></div></div>' +
        '<div class="row"><div class="field"><label>Quantidade (' + Util.esc(Util.unidadeExibir(item.unidade)) + ')</label>' +
        '<input id="qi-qtd" value="1" autofocus></div>' +
        '<div class="field"><label>Custo unitário</label><input id="qi-cu" value="' + Util.fmtNum(item.custoUnitario, 2) + '"></div></div>',
        [
          { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
          // Parâmetro do orçamento: item com preço zerado só entra se o usuário
          // liberou no assistente (senão vira "buraco" invisível na planilha).
          { texto: "+ Adicionar e lançar outro", classe: "", onClick: function () { lancar(true); } },
          { texto: "Adicionar item", classe: "success", onClick: function () { lancar(false); } }
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
      // LOTE 4: aviso não-bloqueante da faixa TCU 2.622/2013 (default: edificações)
      try {
        var avisoFx = Bdi.avisoFaixa && Bdi.avisoFaixa(this.orcAtual.bdi.percentual);
        if (avisoFx) UI.toast("⚠ " + avisoFx, "erro");
      } catch (eFx) {}
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
      UI.modal("" + (typeof Icones !== "undefined" ? Icones.get("graficos", 15) : "") + " Comparar cenários de preço", UI.renderCenarios(custo, cenarios), [
        { texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } }
      ]);
      UI.modalConsulta(); // comparação é leitura
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
      base.L = Math.round(L * 10000) / 10000; // 4 casas: com 2, cenário de 20 % gravava 20,01 %
      Orcamento.aplicarBdi(o, "custom", base); // grava params + percentual + modeloId juntos
      this.persistir(); UI.fecharModal(); this.render();
      UI.toast("Cenário aplicado — BDI " + Util.fmtNum(o.bdi.percentual, 2) + "%.", "ok");
    },

    // Excel profissional: workbook vivo com 3 abas (Resumo/Sintética/Analítica) + fórmulas
    exportarExcel: function () {
      if (this._trialBloqueado()) { this._avisoTrial(); return; }
      if (!Auth.podeUsar("exportar")) { UI.toast("Exportar é recurso PRO. Faça upgrade.", "erro"); return; }
      if (Orcamento.totais(this.orcAtual).qtdItens < 1) { UI.toast("Adicione itens antes de exportar.", "erro"); return; }
      var orc = this.orcAtual;
      this._analiticoDoOrc(orc, function () { UI.toast("Gerando Excel (com aba de Insumos)…", "ok"); ExcelOrc.gerar(orc); });
    },

    /* ⚠ O analítico é o DO ORÇAMENTO (orc.uf / orc.competenciaSinapi), não o
     * do ambiente. Até a 1.2.30 o Excel e o Relatório comparavam com `_baseUf`:
     * um ORC de MG saiu com a aba Insumos "06/2026/PA" — o app estava em PA
     * para consultar preço, e a exportação usou o analítico que estava na
     * memória. Insumos e quebra MO/MAT/EQ de outro estado, entregues ao
     * cliente com cara de certo. Chama `pronto()` SEMPRE (com ou sem a base —
     * quem gera degrada sem a aba); fallback AO VIVO continua pelo VPS. */
    _analiticoDoOrc: function (orc, pronto) {
      var self = this;
      var ana = (typeof Analitico !== "undefined") ? Analitico : null;
      var ufAmb = String(self._baseUf || (typeof Sinapi !== "undefined" ? Sinapi.uf : "") || "").toUpperCase();
      var ufOrc = String((orc && orc.uf) || ufAmb || "").toUpperCase();
      var compOrc = self._normComp((orc && orc.competenciaSinapi) || (ufOrc === ufAmb && typeof Sinapi !== "undefined" ? Sinapi.competencia : ""));
      var urlsX = self._prepararAnalitico(ufOrc, compOrc);
      if (!ana || !ufOrc || (!urlsX.local && !urlsX.live)) { pronto(); return; }
      var ufAna = String(ana.uf || "").toUpperCase(), compAna = self._normComp(ana.competencia);
      var chaveTent = ufOrc + "|" + compOrc;
      /* competência diferente com a MESMA UF: tenta uma vez o arquivo do mês do
         orçamento; se só existir o de nome antigo (caso comum nas instalações
         atualizadas por zip), não fica recarregando 18 MB a cada exportação —
         o `_avisarAnaliticoDeOutroMes` já contou ao usuário o que saiu. */
      var mesmaUf = ana.carregado && ufAna === ufOrc;
      var mesmoMes = !compOrc || !compAna || compAna === compOrc;
      if (mesmaUf && (mesmoMes || self._anaTentouComp === chaveTent)) { pronto(); return; }
      self._anaTentouComp = chaveTent;
      if (ana.reset && (ana.carregado || ana.carregando)) ana.reset();
      UI.toast("Carregando insumos de " + ufOrc + (compOrc ? " · " + (typeof BasesCat !== "undefined" && BasesCat.fmtVersao ? BasesCat.fmtVersao(compOrc) : compOrc) : "") + "…", "ok");
      ana.carregarArquivo(urlsX.alts).then(pronto).catch(function () { pronto(); });
    },

    // ---------- FASE 4: reimportar Excel editado (round-trip via aba _meta) ----------
    reimportarExcel: function () {
      var self = this, orc = this.orcAtual; if (!orc) return;
      if (this._trialBloqueado()) { this._avisoTrial(); return; }
      if (!Auth.podeUsar("exportar")) { UI.toast("Reimportar Excel é recurso PRO. Faça upgrade.", "erro"); return; }
      var inp = document.createElement("input");
      inp.type = "file"; inp.accept = ".xlsx";
      inp.onchange = function () {
        var f = inp.files && inp.files[0]; if (!f) return;
        ExcelOrc.ensureExcelJS(function () {
          UI.loading("Lendo o Excel…");
          f.arrayBuffer().then(function (ab) {
            var wb = new window.ExcelJS.Workbook();
            return wb.xlsx.load(ab).then(function () { return wb; });
          }).then(function (wb) {
            UI.loadingFim();
            var meta = Roundtrip.lerMeta(wb);
            if (meta.erro === "sem-meta") { UI.toast("Este arquivo não é um Excel do OrçaPRO — ou foi gerado por versão antiga, sem suporte à reimportação (reexporte e tente de novo).", "erro"); return; }
            if (meta.erro) { UI.toast("Não consegui ler os dados de reimportação: " + (meta.detalhe || meta.erro), "erro"); return; }
            var val = Roundtrip.validar(meta.cab, orc);
            if (val.erro === "schema-novo") { UI.toast("Este Excel foi gerado por uma versão mais NOVA do OrçaPRO — atualize o app (🔄) para reimportar.", "erro"); return; }
            if (val.erro === "outro-orcamento") { UI.toast("Este Excel é do orçamento " + (val.numero || "diferente") + " — abra o orçamento correspondente e reimporte lá.", "erro"); return; }
            var eds = Roundtrip.extrairEdicoes(wb, meta.orc);
            if (eds.erro) { UI.toast("Reimportação bloqueada: " + (eds.detalhe || eds.erro), "erro"); return; }
            var difs = Roundtrip.diff(orc, eds);
            /* v1.1.232 — edição RECUSADA (Qtd/Custo zerados no Excel) aparece,
               não some. "Nenhuma diferença" com diferença descartada era
               mensagem falsa: o app e a planilha entregue ficavam divergentes
               e o cliente confiando que estavam iguais. */
            var rec = difs.recusadas || [];
            if (!difs.length) {
              if (rec.length) {
                UI.toast("⚠ " + rec.length + " edição(ões) do Excel NÃO aplicada(s): " +
                  rec.slice(0, 3).map(function (r) { return r.codigo + " (" + r.campo + " " + r.motivo.split(" — ")[0] + ")"; }).join("; ") +
                  (rec.length > 3 ? "…" : "") + ". Zero não entra — ajuste no app.", "erro");
              } else {
                UI.toast("Nenhuma diferença entre o Excel e o orçamento — nada a importar.", "ok");
              }
              return;
            }
            self._modalRoundtrip(difs);
          }).catch(function (e) { UI.loadingFim(); UI.toast("Falha ao ler o arquivo: " + e.message, "erro"); });
        });
      };
      inp.click();
    },
    _modalRoundtrip: function (difs) {
      var self = this;
      var rot = { quantidade: "Qtd", custoUnitario: "Custo unit." };
      var html = '<p class="muted" style="font-size:13px">O Excel tem <b>' + difs.length + '</b> mudança(s) em relação ao orçamento aberto. Desmarque o que NÃO quiser aplicar:</p>'
        + '<table class="tbl" style="font-size:12.5px"><thead><tr><th></th><th>Item</th><th>Campo</th><th class="num">No app</th><th class="num">No Excel</th></tr></thead><tbody>'
        + difs.map(function (d, i) {
          return '<tr><td><input type="checkbox" data-rt="' + i + '" checked></td>'
            + '<td>' + (d.codigo ? "<b>" + Util.esc(d.codigo) + "</b> " : "") + Util.esc(String(d.descricao).slice(0, 45)) + '</td>'
            + '<td>' + rot[d.campo] + '</td>'
            + '<td class="num">' + Util.fmtNum(d.de, 2) + '</td>'
            + '<td class="num"><b>' + Util.fmtNum(d.para, 2) + '</b></td></tr>';
        }).join("") + '</tbody></table>';
      UI.modal("Reimportar Excel — revisar mudanças", html, [
        { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
        { texto: "" + (typeof Icones !== "undefined" ? Icones.get("check", 15) : "") + " Aplicar selecionadas", classe: "primary", onClick: function () {
          var aceitas = [];
          Array.prototype.forEach.call(document.querySelectorAll("[data-rt]"), function (c) {
            if (c.checked) aceitas.push(difs[+c.getAttribute("data-rt")]);
          });
          UI.fecharModal();
          if (!aceitas.length) { UI.toast("Nada selecionado — nada aplicado.", "ok"); return; }
          var n = Roundtrip.aplicar(self.orcAtual, aceitas);
          self.persistir(); self.render();
          UI.toast("✅ " + n + " mudança(s) do Excel aplicadas ao orçamento.", "ok");
        } }
      ]);
    },

    // ---------- Ver composição → insumos (base analítica, por estado) ----------
    verInsumos: function (codigo, refItem) {
      var self = this;
      var ufAtivo = self._baseUf || Sinapi.uf || null;
      /* CONTEXTO DE AJUSTE: coeficiente só é editável quando o modal foi aberto
         a partir de um ITEM do orçamento — é lá que o ajuste mora. Abrindo pela
         aba de bases, o detalhamento é somente leitura: mexer ali mudaria a
         referência de todos os orçamentos (regra 1 do ajustes.js). */
      UI._ajusteCtx = null;
      if (refItem && this.orcAtual) {
        var pv = String(refItem).split("|");
        var etv = (this.orcAtual.etapas || []).filter(function (e) { return e.id === pv[0]; })[0];
        var itv = etv && (etv.itens || []).filter(function (x) { return x.id === pv[1]; })[0];
        if (itv && String(itv.codigo) === String(codigo)) {
          UI._ajusteCtx = { etapaId: pv[0], itemId: pv[1], item: itv, codigo: String(codigo) };
        }
      }
      if (!codigo || !String(codigo).trim()) {
        UI.modal("ℹ️ Sem composição detalhada", '<p>Este item foi <b>lançado manualmente</b> (sem código SINAPI), então não há composição de insumos para detalhar. O valor usado é o que você digitou.</p>', [{ texto: "Entendi", classe: "primary", onClick: function () { UI.fecharModal(); } }]);
        return;
      }
      // v1.1.123 — composição PRÓPRIA criada no app: detalhamento vem da própria
      // estrutura salva. NUNCA sombreia um código oficial: se o código existir na
      // base SINAPI ativa, o detalhamento oficial tem prioridade (colisão de código).
      var bp = (typeof Bases !== "undefined") ? Bases.obter("PROPRIA", String(codigo)) : null;
      var ehOficial = (typeof Sinapi !== "undefined" && Sinapi.obter) ? !!Sinapi.obter(String(codigo)) : false;
      if (bp && bp.insumos && bp.insumos.length && !ehOficial) {
        var normCat = (typeof ComposicaoPropria !== "undefined" && ComposicaoPropria.catDe)
          ? ComposicaoPropria.catDe
          : function (c) { return String(c || "MAT").toUpperCase(); };
        var aP = {
          codigo: bp.codigo, descricao: bp.descricao, unidade: bp.unidade,
          grupo: bp.grupo || "Composição própria", custoUnitario: Util.num(bp.custoUnitario),
          custoMO: Util.num(bp.custoMO), custoMAT: Util.num(bp.custoMAT), custoEQ: Util.num(bp.custoEQ),
          insumos: bp.insumos.map(function (i) {
            return { tipo: "INSUMO", codigo: i.codigo, descricao: i.descricao, unidade: i.unidade,
              coeficiente: Util.num(i.coeficiente), custoUnitario: Util.num(i.custoUnitario),
              custoTotal: Util.num(i.coeficiente) * Util.num(i.custoUnitario), categoria: normCat(i.categoria) };
          })
        };
        var bgP = UI.modal("" + (typeof Icones !== "undefined" ? Icones.get("buscar", 15) : "") + " Analítico do item — composição própria " + String(codigo), UI.renderInsumos(aP, ufAtivo), [
          { texto: "" + (typeof Icones !== "undefined" ? Icones.get("editar", 15) : "") + " Editar composição", classe: "ghost", onClick: function () { UI.fecharModal(); self.editarComposicao(String(codigo)); } },
          { texto: "⧉ Duplicar", classe: "ghost", onClick: function () { UI.fecharModal(); self.duplicarComposicao(String(codigo)); } },
          { texto: "Fechar", classe: "primary", onClick: function () { UI.fecharModal(); } }
        ]);
        UI.modalConsulta(); // detalhamento é leitura
        var mP = bgP.querySelector(".modal"); if (mP) mP.style.maxWidth = "900px";
        return;
      }
      /* ===== O REGIME DESTE ITEM =====
       * Primeiro o que o próprio item gravou ao ser lançado; sem marca, o do
       * orçamento aberto. `null` = ninguém declarou, e aí não há o que
       * conferir — não se recusa por suspeita. */
      var _regItem = null;
      try {
        var _itvR = UI._ajusteCtx && UI._ajusteCtx.item;
        if (_itvR && typeof _itvR.desonerado === "boolean") _regItem = _itvR.desonerado;
        else if (self.orcAtual && typeof Orcamento !== "undefined" && Orcamento.regimeDosItens) {
          var _rr = Orcamento.regimeDosItens(self.orcAtual);
          if (_rr === true || _rr === false) _regItem = _rr;
          /* "misto" ou nenhum item marcado: não dá para afirmar o regime DESTE
             item, e recusar por suspeita esconderia um detalhamento correto */
        }
      } catch (eR) {}
      function nomeReg(b) { return b ? "desonerado" : "não desonerado"; }
      function abrir() {
        var a = Analitico.obter(codigo);
        /* ===== NÃO ABRE COM O REGIME TROCADO =====
         *
         * O analítico é de UM regime. Mostrar o desdobramento onerado de um
         * item desonerado troca o encargo social no meio da memória de
         * cálculo: no PA a composição 104658 sai 189,69 num regime e 187,05
         * no outro, e o que o cliente vê na planilha é o segundo. A tela
         * some com o número certo e mostra o errado, sem um aviso.
         *
         * Preferimos ficar sem o desdobramento e dizer por quê. */
        if (a && _regItem !== null && Analitico.desonerado !== null && Analitico.desonerado !== _regItem) {
          UI.modal("Detalhamento de outro regime", '<p style="margin:0 0 8px">Este item é <b>' + nomeReg(_regItem) +
            '</b>, e o detalhamento carregado para ' + Util.esc(String(ufAtivo || "esta UF")) + ' é <b>' + nomeReg(Analitico.desonerado) + '</b>.</p>' +
            '<p style="margin:0 0 8px">Não vou abrir a composição com os encargos do outro regime: os preços de mão de obra mudam, e o total dos insumos não fecharia com o valor da sua planilha.</p>' +
            '<p class="muted" style="font-size:12.5px;margin:0">O <b>preço do item continua correto</b> — é só o desdobramento em insumos que não está disponível neste regime.</p>',
            [{ texto: "Entendi", classe: "primary", onClick: function () { UI.fecharModal(); } }]);
          return;
        }
        /* mesma conversa quando o analítico do regime pedido nem chegou:
           dizer "não existe composição" seria culpar o item por um arquivo
           que ainda não foi publicado. */
        if (!a && _regItem === true && !Analitico.carregado) {
          UI.modal("Detalhamento desonerado indisponível", '<p style="margin:0 0 8px">Este orçamento está no regime <b>desonerado</b>, e o detalhamento (composição &rarr; insumos) desse regime ainda não foi publicado para ' + Util.esc(String(ufAtivo || "esta UF")) + '.</p>' +
            '<p class="muted" style="font-size:12.5px;margin:0">O preço do item vem da base desonerada e está correto. Abrir o detalhamento do regime não desonerado mostraria encargos diferentes dos que estão na sua planilha, então ele não é oferecido aqui.</p>',
            [{ texto: "Entendi", classe: "primary", onClick: function () { UI.fecharModal(); } }]);
          return;
        }
        if (!a) {
          UI.modal("ℹ️ Sem composição detalhada", '<p style="margin:0 0 8px">O item <b>' + Util.esc(String(codigo)) + '</b> não tem composição de insumos para abrir. Isso acontece quando:</p>' +
            '<ul style="margin:0;padding-left:18px;font-size:13.5px;line-height:1.7">' +
            '<li>é um <b>insumo</b> (material/mão de obra/equipamento) — não é uma composição, então não se desdobra;</li>' +
            '<li>foi <b>lançado manualmente</b> ou por preço próprio (sem código SINAPI);</li>' +
            '<li>o código não está na base <b>analítica</b>' + (ufAtivo ? ' de ' + Util.esc(ufAtivo) : '') + ' (existe no preço, mas sem o detalhamento).</li></ul>' +
            '<p class="muted" style="font-size:12.5px;margin:10px 0 0">O orçamento usa o <b>preço correto</b> da base — só o desmembramento em insumos é que não está disponível para este item.</p>',
            [{ texto: "Entendi", classe: "primary", onClick: function () { UI.fecharModal(); } }]);
          return;
        }
        var bg = UI.modal("" + (typeof Icones !== "undefined" ? Icones.get("buscar", 15) : "") + " Analítico do item — composição " + codigo, UI.renderInsumos(a, ufAtivo), [
          // v1.1.124 — "quero essa, mas com MEU coeficiente": clona p/ composição própria
          { texto: "🧬 Criar minha versão", classe: "ghost", onClick: function () { self.criarVersaoPropria(String(codigo)); } },
          { texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } }
        ]);
        var m = bg && bg.querySelector(".modal"); if (m) m.style.maxWidth = "900px";
      }
      /* ⚠ O REGIME É CONFERIDO ANTES DO ATALHO "já carregado", e é o do ITEM
         CLICADO (_regItem), não o do orçamento. Num orçamento MISTO cada linha
         abre no seu regime: clicar um item desonerado carrega o analítico
         desonerado mesmo que a maioria seja onerada. Quando o regime do item
         difere do que está na memória, `_prepararAnalitico` faz o reset, e o
         atalho abaixo (que checa `carregado`) não dispara — recarrega o certo. */
      var urls = self._prepararAnalitico(null, null, _regItem);
      // Já carregado E é do estado ativo? abre direto.
      if (Analitico.carregado && (!ufAtivo || !Analitico.uf || Analitico.uf === ufAtivo)) { abrir(); return; }
      // URLs local + AO VIVO (VPS). O analítico da região SEMPRE existe no servidor, então
      // mesmo que o disco do cliente não tenha o arquivo, o detalhamento carrega ao vivo.
      if (!urls.local && !urls.live) { // só quando não há UF de forma alguma
        UI.toast("Sem UF ativa para o detalhamento. Escolha um estado em " + (typeof Icones !== "undefined" ? Icones.get("tabela", 15) : "") + " Tabelas.", "erro");
        return;
      }
      // Trocou de UF desde o último carregamento → descarta e recarrega o analítico certo.
      if (Analitico.reset && Analitico.uf && ufAtivo && Analitico.uf !== ufAtivo) Analitico.reset();
      if (self._insumosCarregando === codigo) return; // ignora duplo-clique durante o load frio
      self._insumosCarregando = codigo;
      // LOTE 5: overlay com spinner — o load frio de 17MB parecia travamento
      UI.loading("Carregando a base analítica de " + (ufAtivo || "") + " (só na 1ª vez)…");
      Analitico.carregarArquivo(urls.alts).then(function () { self._insumosCarregando = null; UI.loadingFim(); abrir(); }).catch(function (e) {
        self._insumosCarregando = null; UI.loadingFim();
        if (e && e.message === "cancelado") return; // troca de UF cancelou o carregamento — silencioso
        // Chegou aqui = local E ao vivo falharam (offline sem o arquivo no disco)
        UI.toast("Não foi possível carregar o detalhamento agora" + (ufAtivo ? " de " + ufAtivo : "") + ". Verifique a internet e tente de novo — o orçamento usa os preços corretos normalmente.", "erro");
      });
    },

    /* ================================================================
     * v1.1.123 — CRIADOR DE COMPOSIÇÃO PRÓPRIA (2 passos + agente)
     * Motor: js/composicaopropria.js (validação dura, custo por método,
     * análogas na base analítica REAL). Grava na base PROPRIA do multi-base
     * COM a estrutura de insumos — vira buscável e detalhável no orçamento.
     * ================================================================ */
    _cp: null,
    _cpCodigosExistentes: function () {
      var payload = Store.lerBasesExtras(Auth.empresaId()) || [];
      var propria = null;
      for (var i = 0; i < payload.length; i++) { if (String(payload[i].fonte).toUpperCase() === "PROPRIA") propria = payload[i]; }
      return (propria && propria.dados ? propria.dados : []).map(function (d) { return d.codigo; });
    },
    criarComposicao: function (semRender) {
      /* abrir o criador — por qualquer porta — invalida o reforço de IA que
         ainda estiver voando: a resposta dele não pode cair por cima do que o
         usuário começou a montar depois (ver a nota em elaborarComposicao) */
      this._elabReq = (this._elabReq || 0) + 1;
      var cods = this._cpCodigosExistentes();
      this._cp = {
        passo: 1,
        comp: {
          codigo: ComposicaoPropria.gerarCodigo(cods), codigoSec: "", descricao: "", grupo: "",
          unidade: "", uf: String(this._baseUf || Sinapi.uf || ""), modeloRef: "SINAPI",
          metodo: "truncar2", maoDeObra: false, observacao: "", insumos: []
        },
        referencia: null
      };
      if (!semRender) this._cpRender(); // fluxos que mutam o _cp antes do 1º paint passam true
    },
    /* v1.1.123 — reabre uma composição própria existente no criador (errou o
     * coeficiente? corrige e regrava — o código original é sobrescrito). */
    editarComposicao: function (codigo) {
      /* Composição própria é acervo de ORÇAMENTO — quem tem o módulo cuida
         dela. Chegava por ⚙ → Tabelas → "ver itens", que a engrenagem mostra
         para qualquer sessão: sub-usuário sem Orçamentos lia código, descrição
         e CUSTO UNITÁRIO de cada composição autoral, e ainda editava e excluía. */
      if (typeof Auth !== "undefined" && Auth.podeModulo && !Auth.podeModulo("orcamentos")) {
        try { UI.toast("Seu usuário não tem permissão no módulo Orçamentos.", "erro"); } catch (e) {}
        return;
      }
      var bp = Bases.obter("PROPRIA", String(codigo));
      if (!bp) { UI.toast("Composição " + codigo + " não encontrada na base própria.", "erro"); return; }
      var copia; try { copia = JSON.parse(JSON.stringify(bp)); } catch (e) { copia = bp; }
      this._cp = {
        passo: 2,
        editando: String(codigo), // isenta o próprio código da checagem de duplicidade
        comp: {
          codigo: copia.codigo, codigoSec: copia.codigoSecundario || "", descricao: copia.descricao || "",
          grupo: copia.grupo || "", unidade: copia.unidade || "", uf: String(this._baseUf || Sinapi.uf || ""),
          modeloRef: copia.modeloRef || "SINAPI", metodo: copia.metodo || "truncar2",
          maoDeObra: !!copia.maoDeObra, observacao: copia.observacao || "", insumos: copia.insumos || []
        },
        referencia: null
      };
      this._cpRender();
    },
    /* ⧉ DUPLICAR (item 9 do cliente): usar uma composição existente como
     * base para outra. ATENÇÃO à armadilha que fazia isto ser impossível
     * pela edição: _propriaGravar com código novo REMOVE o antigo (é
     * rename, não cópia). Aqui o criador abre como COMPOSIÇÃO NOVA
     * (editando = null), com código PROP novo — o original fica intacto. */
    duplicarComposicao: function (codigo) {
      /* Composição própria é acervo de ORÇAMENTO — quem tem o módulo cuida
         dela. Chegava por ⚙ → Tabelas → "ver itens", que a engrenagem mostra
         para qualquer sessão: sub-usuário sem Orçamentos lia código, descrição
         e CUSTO UNITÁRIO de cada composição autoral, e ainda editava e excluía. */
      if (typeof Auth !== "undefined" && Auth.podeModulo && !Auth.podeModulo("orcamentos")) {
        try { UI.toast("Seu usuário não tem permissão no módulo Orçamentos.", "erro"); } catch (e) {}
        return;
      }
      var bp = Bases.obter("PROPRIA", String(codigo));
      if (!bp) { UI.toast("Composição " + codigo + " não encontrada na base própria.", "erro"); return; }
      var copia; try { copia = JSON.parse(JSON.stringify(bp)); } catch (e) { copia = bp; }
      this.criarComposicao(true);            // zera o estado e gera código PROP novo
      var c = this._cp.comp;
      c.descricao = String(copia.descricao || "") + " (cópia)";
      c.codigoSec = copia.codigoSecundario || ""; /* a cópia não perde a referência externa */
      c.grupo = copia.grupo || "";
      c.unidade = copia.unidade || "";
      c.modeloRef = copia.modeloRef || "SINAPI";
      c.metodo = copia.metodo || "truncar2";
      c.maoDeObra = !!copia.maoDeObra;
      c.observacao = copia.observacao || "";
      c.insumos = copia.insumos || [];
      this._cp.passo = 2;
      this._cpRender();
      UI.toast("Cópia de " + codigo + " aberta como " + c.codigo + " — ajuste e grave. O original não muda.", "ok");
    },
    /* remove UM código da base PROPRIA (o único caminho que existia era
     * apagar a base inteira no Tabelas). Devolve quantos saíram. */
    _propriaRemoverCodigo: function (codigo) {
      var payload = Store.lerBasesExtras(Auth.empresaId()) || [];
      var atual = null;
      for (var i = 0; i < payload.length; i++) { if (String(payload[i].fonte).toUpperCase() === "PROPRIA") atual = payload[i]; }
      if (!atual) return 0;
      var antes = (atual.dados || []).length;
      var dados = (atual.dados || []).filter(function (d) {
        return String(d.codigo).toLowerCase() !== String(codigo).toLowerCase();
      });
      if (dados.length === antes) return 0;
      Bases.registrar("PROPRIA", { dados: dados, uf: atual.uf, mes: atual.mes });
      Bases.persistir(Auth.empresaId());
      try { this.backupAuto({ urgente: true }); } catch (e) {}
      this._propriaEspelhoExcluir(codigo);
      return antes - dados.length;
    },
    /* ============ LIMPAR OS CLONES QUE A SINCRONIZAÇÃO DEIXOU ============
     *
     * ⚠ EXISTE PORQUE O PRODUTO ESTRAGOU DADO DE CLIENTE. O ramo de colisão do
     *   PropriaSync renomeava a perdedora para "o próximo sufixo livre" (-2,
     *   -3, -4…). O clone entrava na base, mas o registro do ESPELHO continuava
     *   com o código original — então colidia de novo no merge seguinte e o
     *   contador andava mais um. Nunca chegava a ponto fixo.
     *
     *   Medido nos backups da instalação: 11 composições próprias em 13/08, 22
     *   em 16/08, 30 em 17/08, 64 em 20/08, 79 em 21/08 — e 65 delas eram
     *   cópias idênticas de UMA ("DEMOLIÇÃO DE ALVENARIA", PROP-00011-2 até
     *   PROP-00011-66). Catorze composições de verdade e 65 de lixo, +8 por dia.
     *
     *   O conserto do merge (sufixo = hash do conteúdo) para de PRODUZIR clone.
     *   Não remove o que já está gravado — e não dá para pedir que o usuário
     *   limpe na mão: são 64 linhas iguais numa lista de 79, distinguidas por
     *   um sufixo hexadecimal.
     *
     * ⚠ NÃO RODA SOZINHO, e isso é deliberado. Encolher a base do usuário sem
     *   ele mandar é exatamente o que o alarme anti-perda existe para impedir.
     *   Aqui: pergunta, faz backup ANTES, e passa pelo canal de lápide — senão
     *   o item volta da nuvem na sincronização seguinte. */
    limparClonesProprias: function () {
      if (typeof Auth !== "undefined" && Auth.podeModulo && !Auth.podeModulo("orcamentos")) {
        try { UI.toast("Seu usuário não tem permissão no módulo Orçamentos.", "erro"); } catch (e) {}
        return;
      }
      if (typeof PropriaSync === "undefined" || !PropriaSync.clonesParaLimpar) return;
      var self = this, eid = Auth.empresaId();
      var payload = Store.lerBasesExtras(eid) || [], atual = null;
      for (var i = 0; i < payload.length; i++) {
        if (String(payload[i].fonte).toUpperCase() === "PROPRIA") atual = payload[i];
      }
      if (!atual) return;
      var r = PropriaSync.clonesParaLimpar(atual.dados || []);
      if (!r.sai.length) { UI.toast("Nenhuma cópia para limpar.", "ok"); return; }
      var exemplos = r.sai.slice(0, 3).map(function (x) { return x.codigo; }).join(", ");
      if (!window.confirm(
        "Limpar " + r.sai.length + " cópia(s) repetida(s)?\n\n" +
        "Elas foram criadas por um defeito da sincronização, não por você: são " +
        "idênticas (mesma descrição, unidade e insumos) a composições que ficam. " +
        "Ex.: " + exemplos + (r.sai.length > 3 ? "…" : "") + "\n\n" +
        "Seu banco vai de " + (atual.dados || []).length + " para " + r.fica.length + " itens.\n" +
        "Um backup é gravado antes. Itens já lançados em orçamentos não mudam (são cópia).")) return;
      /* backup ANTES: é a única coisa que torna isto reversível */
      try { this.backupAuto({ urgente: true }); } catch (e) {}
      Bases.registrar("PROPRIA", { dados: r.fica, uf: atual.uf, mes: atual.mes });
      /* permitirRemocao porque a queda é grande e intencional; sem isto o
         alarme anti-perda recusa a gravação — com razão, ele não sabe que a
         ordem veio do dono. */
      Bases.persistir(eid, { permitirRemocao: true });
      /* lápide em cada uma, senão a nuvem devolve tudo no próximo merge */
      r.sai.forEach(function (x) { try { self._propriaEspelhoExcluir(x.codigo); } catch (e) {} });
      UI.toast(r.sai.length + " cópia(s) removida(s). Banco com " + r.fica.length + " itens.", "ok");
      this.minhasComposicoes(this._mcFiltro || "");
    },
    excluirProprio: function (codigo) {
      /* Composição própria é acervo de ORÇAMENTO — quem tem o módulo cuida
         dela. Chegava por ⚙ → Tabelas → "ver itens", que a engrenagem mostra
         para qualquer sessão: sub-usuário sem Orçamentos lia código, descrição
         e CUSTO UNITÁRIO de cada composição autoral, e ainda editava e excluía. */
      if (typeof Auth !== "undefined" && Auth.podeModulo && !Auth.podeModulo("orcamentos")) {
        try { UI.toast("Seu usuário não tem permissão no módulo Orçamentos.", "erro"); } catch (e) {}
        return;
      }
      var self = this;
      if (this._trialBloqueado()) { this._avisoTrial(); return; }
      /* a pergunta tem de contar TUDO o que quebra: excluir um item usado
         como INSUMO de outra composição própria deixa a outra impossível
         de regravar (o resolve com fonte explícita nunca cai em fallback)
         — sem aviso, a causa fica invisível semanas depois. */
      var refs = [];
      try {
        var payloadX = Store.lerBasesExtras(Auth.empresaId()) || [];
        payloadX.forEach(function (b) {
          if (String(b.fonte).toUpperCase() !== "PROPRIA") return;
          (b.dados || []).forEach(function (d) {
            if (String(d.codigo) === String(codigo)) return;
            var usa = (d.insumos || []).some(function (i) { return String(i.codigo) === String(codigo); });
            if (usa) refs.push(d.codigo);
          });
        });
      } catch (eRf) {}
      var avisoRef = refs.length
        ? "\n\n⚠ ATENÇÃO: este item é INSUMO de " + refs.length + " composição(ões) própria(s) (" +
          refs.slice(0, 5).join(", ") + (refs.length > 5 ? "…" : "") + "). Elas não poderão ser " +
          "regravadas sem substituir essa linha."
        : "";
      /* o item some da BASE, não dos orçamentos: item já lançado é snapshot
         e continua lá — dizer isso na pergunta evita o susto ao contrário */
      if (!window.confirm("Excluir " + codigo + " do seu banco?\n\nItens JÁ LANÇADOS em orçamentos não mudam (são cópia). " +
        "O código some das buscas e não poderá ser reprecificado depois." + avisoRef)) return;
      var n = this._propriaRemoverCodigo(String(codigo));
      UI.toast(n ? codigo + " excluído do banco próprio." : codigo + " não encontrado.", n ? "ok" : "erro");
      if (n) this.minhasComposicoes(this._mcFiltro || "");
    },
    /* 📋 MINHAS COMPOSIÇÕES E INSUMOS (item 10): a lista de gestão que não
     * existia — só a linha agregada no Tabelas, cujo único botão apagava a
     * base INTEIRA. Busca + ver/editar/duplicar/excluir POR ITEM. */
    minhasComposicoes: function (filtro) {
      /* Composição própria é acervo de ORÇAMENTO — quem tem o módulo cuida
         dela. Chegava por ⚙ → Tabelas → "ver itens", que a engrenagem mostra
         para qualquer sessão: sub-usuário sem Orçamentos lia código, descrição
         e CUSTO UNITÁRIO de cada composição autoral, e ainda editava e excluía. */
      if (typeof Auth !== "undefined" && Auth.podeModulo && !Auth.podeModulo("orcamentos")) {
        try { UI.toast("Seu usuário não tem permissão no módulo Orçamentos.", "erro"); } catch (e) {}
        return;
      }
      var self = this;
      this._mcFiltro = String(filtro || "");
      var bPro = (typeof Bases !== "undefined" && Bases.extras) ? Bases.extras().filter(function (b) { return b.fonte === "PROPRIA"; })[0] : null;
      var itens = (bPro && bPro.itens ? bPro.itens : []).slice();
      itens.sort(function (a, b) { return String(a.descricao).localeCompare(String(b.descricao), "pt-BR"); });
      var f = this._mcFiltro.toLowerCase();
      var vis = f ? itens.filter(function (d) {
        return (String(d.codigo) + " " + String(d.descricao)).toLowerCase().indexOf(f) >= 0;
      }) : itens;
      var linhas = vis.map(function (d) {
        var ehComp = String(d.tipoItem) !== "insumo";
        return '<tr><td><span class="pill proprio">' + Util.esc(d.codigo) + '</span></td>' +
          '<td style="max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + Util.esc(d.descricao) + '">' + Util.esc(d.descricao) + '</td>' +
          '<td>' + (ehComp ? "Composição" : "Insumo") + '</td>' +
          '<td>' + Util.esc(Util.unidadeExibir(d.unidade)) + '</td>' +
          '<td class="num">' + Util.fmtMoeda(d.custoUnitario) + '</td>' +
          '<td class="right" style="white-space:nowrap">' +
            (ehComp ? '<button class="btn sm ghost" data-acao="mc-ver" data-cod="' + Util.esc(d.codigo) + '" title="ver insumos">' + (typeof Icones !== 'undefined' ? Icones.get('buscar', 15) : '') + '</button> ' +
                      '<button class="btn sm ghost" data-acao="mc-editar" data-cod="' + Util.esc(d.codigo) + '" title="editar">' + (typeof Icones !== 'undefined' ? Icones.get('editar', 15) : '') + '</button> ' +
                      '<button class="btn sm ghost" data-acao="mc-duplicar" data-cod="' + Util.esc(d.codigo) + '" title="duplicar">⧉</button> '
                    /* O INSUMO PRÓPRIO TAMBÉM SE EDITA. Só a composição tinha lápis:
                       quem cadastrou o insumo com a unidade ou o preço errado (é o
                       caso mais comum — salário no lugar de hora) só tinha a lixeira,
                       e excluir quebra as composições que usam esse código. */
                    : '<button class="btn sm ghost" data-acao="mc-editar-insumo" data-cod="' + Util.esc(d.codigo) + '" title="editar insumo">' + (typeof Icones !== 'undefined' ? Icones.get('editar', 15) : '') + '</button> ') +
            '<button class="btn sm danger" data-acao="mc-excluir" data-cod="' + Util.esc(d.codigo) + '" title="excluir do banco">' + (typeof Icones !== 'undefined' ? Icones.get('lixeira', 15) : '') + '</button>' +
          '</td></tr>';
      }).join("");
      /* ⚠ O AVISO VEM ANTES DA LISTA porque é ele que explica por que a lista
         tem 79 linhas iguais. Sem isso o usuário lê a repetição como erro dele
         e sai excluindo à mão — 64 confirmações, uma a uma. */
      var clones = [];
      try {
        if (typeof PropriaSync !== "undefined" && PropriaSync.clonesParaLimpar) {
          clones = PropriaSync.clonesParaLimpar(itens).sai || [];
        }
      } catch (eCl) { clones = []; }
      var aviso = clones.length
        ? '<div class="aviso" style="margin:0 0 10px;padding:8px 10px;border-left:3px solid var(--warn,#c90);font-size:12px">' +
          '<b>' + clones.length + ' cópia(s) repetida(s) no seu banco.</b> Foram criadas por um defeito ' +
          'da sincronização entre aparelhos — já corrigido —, não por você. São idênticas a ' +
          'composições que ficam. ' +
          '<button class="btn sm" data-acao="mc-limpar-clones" style="margin-left:6px">Limpar ' +
          clones.length + '</button></div>'
        : '';
      var corpo = aviso +
        '<div class="field" style="margin-bottom:8px"><input id="mc-filtro" placeholder="Buscar por código ou descrição…" value="' + Util.esc(this._mcFiltro) + '"></div>' +
        '<p class="muted" style="font-size:11.5px;margin:0 0 8px">' + itens.length + ' item(ns) no seu banco' +
        (f ? " · " + vis.length + " no filtro" : "") +
        ' · para <b>lançar</b> num orçamento, use a busca da planilha (pílula <span class="pill proprio">Própria</span>).</p>' +
        (linhas ? '<div style="max-height:420px;overflow:auto"><table class="tbl" style="width:100%;font-size:12px">' +
          '<thead><tr><th>Código</th><th>Descrição</th><th>Tipo</th><th>Un</th><th class="num">Custo</th><th></th></tr></thead>' +
          '<tbody>' + linhas + '</tbody></table></div>'
        : '<p class="muted">Nenhum item' + (f ? " neste filtro" : " ainda — crie composições na busca do orçamento ou no botão abaixo") + '.</p>');
      UI.modal("" + (typeof Icones !== "undefined" ? Icones.get("checklist", 15) : "") + " Minhas composições e insumos", corpo, [
        { texto: "" + (typeof Icones !== "undefined" ? Icones.get("mais", 15) : "") + " Nova composição", classe: "success", onClick: function () { self.criarComposicao(); } },
        { texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } }
      ]);
      UI.modalConsulta(); // lista de gestão: digitar no filtro não pode virar pergunta de "perder"
      var inp = UI.el("mc-filtro");
      if (inp) {
        var timer = null;
        inp.addEventListener("input", function () {
          if (timer) clearTimeout(timer);
          var v = inp.value;
          timer = setTimeout(function () {
            self.minhasComposicoes(v);
            var i2 = UI.el("mc-filtro");
            if (i2) { i2.focus(); try { i2.setSelectionRange(i2.value.length, i2.value.length); } catch (e) {} }
          }, 300);
        });
      }
    },
    _cpRender: function () {
      var self = this;
      var bg = UI.modal((this._cp && this._cp.editando ? "Editar composição própria" : "Criar composição própria"), UI.renderCriadorComposicao(this._cp), [
        { texto: "Cancelar", classe: "ghost", onClick: function () {
          /* Cancelar com trabalho dentro também pergunta — o criador
             re-renderiza o corpo a cada insumo e um clique aqui jogava
             fora a composição inteira sem aviso */
          if (UI.temTrabalhoNaoSalvo() &&
              !window.confirm("Descartar esta composição e perder o que foi montado?")) return;
          self._cp = null; UI.fecharModal();
        } }
      ]);
      /* o corpo deste modal é reconstruído a cada mudança (o _tocado do DOM
         morre junto) — então o "sujo" aqui é decidido pelo ESTADO: há
         descrição digitada ou insumo adicionado e ainda não gravado */
      /* baseline no 1º render: "sujo" = o estado MUDOU desde a abertura.
         Sem isso, EDITAR uma composição perguntava "descartar?" mesmo sem
         o usuário ter tocado em nada (o estado já nascia preenchido). O
         que for digitado e ainda não coletado é coberto pelo _tocado do
         DOM (a guarda combina os dois). */
      if (this._cp && this._cp.base == null) this._cp.base = JSON.stringify(this._cp.comp);
      UI.modalSujo(function () {
        var st2 = self._cp;
        return !!(st2 && st2.comp && JSON.stringify(st2.comp) !== st2.base);
      });
      var m = bg.querySelector(".modal"); if (m) m.style.maxWidth = "940px";
      // busca de insumos do passo 2 (debounce) — o texto sobrevive ao re-render
      // (adicionar 5 insumos da mesma pesquisa sem digitá-la 5 vezes)
      var inp = UI.el("cp-busca");
      if (inp) {
        var timer = null;
        inp.addEventListener("input", function () {
          self._cp.busca = inp.value;
          /* com o form de insumo inline ABERTO no box, o debounce reescrevia
             o box inteiro e destruía o formulário meio-digitado sem pergunta.
             O guard fica AQUI e não no _cpBuscar — lá quebraria o próprio
             botão "voltar à busca", que chama _cpBuscar com o form no DOM. */
          if (UI.el("cpi-desc")) return;
          if (timer) clearTimeout(timer);
          timer = setTimeout(function () { self._cpBuscar(inp.value); }, 250);
        });
        if (this._cp.busca) { inp.value = this._cp.busca; this._cpBuscar(this._cp.busca); }
      }
    },
    /* Recalcula a prévia do passo 2 SEM re-render (a linha e os KPIs mudam
     * in-place; re-render total destruía o botão sob o mouse e engolia o clique). */
    _cpAtualizarPrevia: function (idx) {
      var c = this._cp && this._cp.comp; if (!c) return;
      var i = c.insumos[idx];
      if (i) {
        var tdTot = document.querySelector('[data-cp-tot="' + idx + '"]');
        if (tdTot) tdTot.textContent = Util.fmtMoeda((Number(i.coeficiente) || 0) * (Number(i.custoUnitario) || 0));
      }
      var custo = ComposicaoPropria.custo(c.insumos, c.metodo);
      var poe = function (id, v) { var el = UI.el(id); if (el) el.textContent = Util.fmtMoeda(v); };
      poe("cp-kpi-mo", custo.mo); poe("cp-kpi-mat", custo.mat); poe("cp-kpi-eq", custo.eq); poe("cp-kpi-total", custo.total);
    },
    _cpBuscar: function (q) {
      var box = UI.el("cp-busca-res"); if (!box) return;
      if (!q || String(q).trim().length < 2) { box.innerHTML = ""; return; }
      /* ⚠ SEM denylist de propósito: o que sai daqui vira INGREDIENTE de uma
         composição gravada na base da EMPRESA (visível a todos os orçamentos),
         não item deste orçamento. Filtrar faria o conteúdo de um ativo
         compartilhado depender de qual orçamento estava aberto por acaso.
         Guardado em tools/test-escopo-denylist.js [8]. */
      var res = Bases.buscar(String(q).trim(), { max: 8 });
      box.innerHTML = res.length ? res.map(function (r) {
        return '<div style="display:flex;align-items:center;gap:8px;padding:6px 4px;border-bottom:1px dashed var(--linha);font-size:12px">' +
          '<span class="pill ' + Util.esc(r.cor || "sinapi") + '">' + Util.esc(r.item.codigo) + '</span>' +
          '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + Util.esc(r.item.descricao) + '">' + Util.esc(r.item.descricao) + '</span>' +
          '<span class="muted">' + Util.esc(r.item.unidade || "") + ' · ' + Util.fmtMoeda(r.item.custoUnitario) + '</span>' +
          '<button class="btn sm primary" data-cp-add="' + Util.esc(r.item.codigo) + '|' + Util.esc(r.fonte) + '">+ coef.</button></div>';
      }).join("") : '<div class="muted" style="font-size:12px;padding:6px 4px">Nada encontrado nas bases ativas.</div>';
      /* o ciclo "sair do orçamento → banco de insumos → voltar → reabrir a
         composição" morre AQUI: cadastro inline dentro do próprio criador.
         NUNCA um segundo UI.modal — abrir outro modal destrói o criador. */
      box.innerHTML += '<div style="padding:6px 4px;border-top:1px dashed var(--linha)">' +
        '<button class="btn sm" data-acao="cp-novo-insumo">' + (typeof Icones !== 'undefined' ? Icones.get('mais', 15) : '') + ' Não achei — cadastrar insumo próprio</button></div>';
    },
    /* formulário INLINE no box de resultados do passo 2 (item 8 do cliente) */
    _cpNovoInsumoInline: function () {
      var box = UI.el("cp-busca-res"); if (!box || !this._cp) return;
      var campos = (typeof Gestao !== "undefined" && Gestao._insumoProprioCampos)
        ? Gestao._insumoProprioCampos("cpi", false)
        : '<div class="field"><label>Descrição *</label><input id="cpi-desc"></div><div class="row"><div class="field" style="max-width:110px"><label>Unidade *</label><input id="cpi-und" value="un"></div><div class="field"><label>Preço (R$)</label><input id="cpi-preco"></div></div><select id="cpi-cat" style="display:none"><option value="MAT" selected>MAT</option></select>';
      box.innerHTML = '<div style="padding:8px;border:1px solid var(--linha);border-radius:8px;background:rgba(46,111,158,.06)">' +
        '<div style="font-weight:700;font-size:12.5px;margin-bottom:6px">' + (typeof Icones !== 'undefined' ? Icones.get('mais', 15) : '') + ' Cadastrar insumo próprio — entra no seu banco e JÁ nesta composição (coeficiente 1, ajuste na tabela)</div>' +
        campos +
        '<div style="display:flex;gap:8px;margin-top:8px">' +
        '<button class="btn sm success" data-acao="cp-salvar-insumo">Salvar e adicionar</button>' +
        '<button class="btn sm ghost" data-acao="cp-voltar-busca">' + (typeof Icones !== 'undefined' ? Icones.get('voltar', 15) : '') + ' voltar à busca</button></div></div>';
      var d = UI.el("cpi-desc");
      if (d) { d.value = String(this._cp.busca || "").trim(); d.focus(); }
    },
    _cpSalvarInsumoInline: function () {
      if (!this._cp) return;
      var d = (typeof Gestao !== "undefined" && Gestao._insumoProprioColeta) ? Gestao._insumoProprioColeta("cpi")
        : { descricao: (UI.el("cpi-desc") || {}).value || "", unidade: (UI.el("cpi-und") || {}).value || "un",
            categoria: (UI.el("cpi-cat") || {}).value || "MAT", preco: Util.num((UI.el("cpi-preco") || {}).value) };
      var item = this.salvarInsumoProprio(d);
      if (!item) return; // inválido — o form fica na tela com o toast do motivo
      var ja = false;
      this._cp.comp.insumos.forEach(function (i) {
        if (String(i.codigo) !== String(item.codigo)) return;
        ja = true;
        /* o dedupe atualizava SÓ o banco: a linha aberta ficava com o preço
           velho — e é a linha que grava (ComposicaoPropria.custo lê da
           linha). Quem recadastra justamente para corrigir o preço via o
           toast dizer "atualizado" e a composição gravar o antigo. */
        i.custoUnitario = Util.num(item.custoUnitario);
        i.descricao = item.descricao; i.unidade = item.unidade; i.categoria = item.categoria;
      });
      if (!ja) {
        this._cp.comp.insumos.push({
          codigo: item.codigo, descricao: item.descricao, unidade: item.unidade,
          coeficiente: 1, custoUnitario: Util.num(item.custoUnitario),
          categoria: item.categoria, tipo: "insumo", fonte: "PROPRIA"
        });
      }
      this._cpRender();
      UI.toast(item.codigo + (ja ? " já estava na composição — preço atualizado no banco." : " adicionado à composição — ajuste o coeficiente."), "ok");
    },
    _cpColeta1: function () {
      var c = this._cp.comp, v = function (id) { var el = UI.el(id); return el ? el.value : ""; };
      c.codigo = String(v("cp-codigo")).trim() || c.codigo;
      c.codigoSec = String(v("cp-codigosec")).trim();
      c.descricao = String(v("cp-descricao")).trim();
      c.grupo = v("cp-grupo");
      c.unidade = String(v("cp-unidade")).trim();
      var rm = document.querySelector('input[name="cp-modelo"]:checked'); if (rm) c.modeloRef = rm.value;
      var rc = document.querySelector('input[name="cp-metodo"]:checked'); if (rc) c.metodo = rc.value;
      var mo = UI.el("cp-mo"); if (mo) c.maoDeObra = !!mo.checked;
      c.observacao = String(v("cp-obs"));
    },
    /* resolve p/ validação e preços atualizados: procura o código nas bases reais.
     * Com a FONTE conhecida (insumo adicionado pela busca ou vindo de referência
     * SINAPI), procura SÓ nela — códigos numéricos homônimos em bases diferentes
     * nunca se confundem. Cotação do usuário (Store.precosInsumos) cobre insumo
     * sem preço coletado na região. */
    _cpResolve: function (codigo, fonte) {
      var item = null;
      if (fonte === "SINAPI") {
        item = (typeof Sinapi !== "undefined" && Sinapi.obter) ? Sinapi.obter(String(codigo)) : null;
      } else if (fonte && typeof Bases !== "undefined" && Bases.obter) {
        item = Bases.obter(String(fonte), String(codigo));
      }
      // fonte EXPLÍCITA e não achou nela → NUNCA cai no fallback amplo (código
      // homônimo de outra base precificaria errado); resta só a cotação do usuário
      if (!item && !fonte) {
        if (typeof Bases !== "undefined" && Bases.obterComFonte) {
          var r = Bases.obterComFonte(String(codigo));
          if (r && r.item) item = r.item;
        }
        if (!item) item = (typeof Sinapi !== "undefined" && Sinapi.obter) ? Sinapi.obter(String(codigo)) : null;
      }
      // v1.1.202 — ÚLTIMO RECURSO OFICIAL: o insumo pode ser REAL e mesmo assim
      // não estar no sintético da UF. A aba ISD da Referência só lista insumo
      // COM coleta de preço no estado; sem coleta, a CAIXA precifica pelo valor
      // de SÃO PAULO e o item aparece só no ANALÍTICO (precoAtribuidoSP). Eram
      // ~2.000 códigos por UF (20%–49% das composições) recusados como
      // "código não existe nas bases ativas" — ex.: 40547/39443/39435 na 96114
      // do DF. Aqui o analítico responde: o código existe e o preço é o oficial.
      if (!item && (!fonte || Orcamento.ehSinapi(fonte)) && typeof Analitico !== "undefined" && Analitico.carregado) {
        item = Analitico.insumo ? Analitico.insumo(String(codigo)) : null;
        if (!item) { // sub-composição oficial fora do CSD da UF (mesma causa)
          var sub = Analitico.obter(String(codigo));
          if (sub) item = { codigo: String(sub.codigo), descricao: sub.descricao || "", unidade: sub.unidade || "", custoUnitario: Number(sub.custoUnitario) || 0, categoria: "", tipoItem: "composicao", fonte: "SINAPI" };
        }
      }
      // sem preço na base? a cotação que o usuário já informou vale (mesma da planilha)
      if (!item || !(Number(item.custoUnitario) > 0)) {
        try {
          var meus = Store.precosInsumos ? Store.precosInsumos(Auth.empresaId()) : {};
          var cot = meus[String(codigo)];
          if (cot && Number(cot.preco) > 0) {
            var base = item || { codigo: String(codigo), descricao: "(cotação própria)", unidade: "" };
            return { codigo: base.codigo, descricao: base.descricao, unidade: base.unidade, custoUnitario: Number(cot.preco), categoria: base.categoria || "", tipoItem: base.tipoItem || "insumo" };
          }
        } catch (eCot) {}
      }
      return item || null;
    },
    /* Preço OFICIAL do código na base de preços do estado — e só nela.
     *
     * ⚠ NÃO É O `_cpResolve`. Aquele cai no analítico de propósito, para o
     *   insumo sem coleta na UF não ser recusado como inexistente. Aqui a
     *   pergunta é outra: "a base de preços deste estado precifica isto?".
     *   Se o analítico respondesse, toda composição do analítico pareceria
     *   precificada e o diagnóstico "oficial" viraria mentira — exatamente o
     *   que ele existe para evitar. */
    _cpPrecoOficial: function (codigo) {
      var cod = String(codigo || "");
      if (!cod) return 0;
      /* ⚠ SEM FALLBACK AMPLO, e isto é a MESMA regra que `_cpResolve` declara
         duas telas acima: "fonte EXPLÍCITA e não achou nela → NUNCA cai no
         fallback amplo (código homônimo de outra base precificaria errado)".
         Eu tinha escrito o fallback aqui, contradizendo o vizinho.

         A referência que chega neste ponto vem SEMPRE do analítico SINAPI —
         é assim que `elaborar` monta. Perguntar a SETOP ou à ORSE se elas têm
         um item com o mesmo NÚMERO é perguntar outra coisa: os códigos não são
         o mesmo espaço de nomes, e um acerto ali afirmaria "a base já
         precifica" sobre um serviço que pode não ter nada a ver. */
      var it = null;
      try {
        it = (typeof Sinapi !== "undefined" && Sinapi.obter) ? Sinapi.obter(cod) : null;
      } catch (e) { return 0; }
      return it ? (Util.num(it.custoUnitario) || 0) : 0;
    },
    /* ==================================================================
     * A DENYLIST DESTE ORÇAMENTO — leitor único.
     *
     * Estava em linha, dentro da busca de itens. Virou função porque agora
     * TRÊS lugares precisam dela, e os três têm a mesma regra: só filtra
     * quem LANÇA ITEM COM PREÇO na planilha deste orçamento (busca de itens,
     * Escopo Inteligente e Parede-Cebola).
     *
     * ⚠ NÃO chame isto do criador de composição própria, do agente EAP do
     * BIM, do banco de insumos nem da requisição de compra. Nesses quatro o
     * resultado não é item deste orçamento — é ingrediente de um ativo da
     * EMPRESA, ou compra amarrada à obra — e em três deles nem existe
     * orçamento corrente para ler (App._navegar zera orcAtual em toda view
     * de Gestão). Filtrar ali seria pegar emprestada a config de outro
     * orçamento, que é justamente o vazamento que o passo 3 promete não
     * existir. Há teste guardando isso: tools/test-escopo-denylist.js [8].
     *
     * null (e não []) quando não há orçamento ou a lista está vazia — é o que
     * Bases.buscar espera para "sem denylist". */
    _fontesExcluidas: function () {
      try {
        var c = this.orcAtual && Orcamento.garantirConfig(this.orcAtual);
        return (c && Util.arr(c.basesExcluidas).length) ? c.basesExcluidas : null;
      } catch (e) { return null; }
    },
    /* O código da composição própria colide com alguma base OFICIAL? → fonte */
    _cpExisteOficial: function (codigo) {
      var cod = String(codigo || "").trim();
      if (!cod) return null;
      if (typeof Sinapi !== "undefined" && Sinapi.obter && Sinapi.obter(cod)) return "SINAPI";
      if (typeof Bases !== "undefined" && Bases.extras) {
        var ex = Bases.extras();
        for (var i = 0; i < ex.length; i++) {
          if (ex[i].fonte === "PROPRIA") continue;
          if (Bases.obter(ex[i].fonte, cod)) return ex[i].fonte;
        }
      }
      return null;
    },
    /* AGENTE ESPECIALISTA: descrição → análogas REAIS → estrutura proposta */
    cpAgente: function () {
      var self = this;
      this._cpColeta1();
      var desc = this._cp.comp.descricao;
      if (String(desc).trim().length < 10) { UI.toast("Descreva o serviço primeiro (campo Descrição) — o agente busca a referência oficial pela sua descrição.", "erro"); return; }
      var rodar = function () {
        var cands = ComposicaoPropria.analogas(desc, Analitico.todos(), 5);
        if (!cands.length) { UI.toast("Não achei composição parecida no detalhamento oficial — monte a estrutura manualmente no passo 2.", "erro"); return; }
        var linhas = cands.map(function (cd, i) {
          return '<label style="display:flex;gap:10px;align-items:flex-start;padding:9px 11px;margin-bottom:6px;border-radius:9px;box-shadow:inset 0 0 0 1px var(--linha);cursor:pointer;font-size:12.5px">' +
            '<input type="radio" name="cp-ref" value="' + i + '"' + (i === 0 ? " checked" : "") + ' style="margin-top:3px">' +
            '<span><span class="pill sinapi">' + Util.esc(cd.codigo) + '</span> <b>' + Util.esc(cd.descricao) + '</b><br>' +
            '<span class="muted">' + Util.esc(cd.unidade) + ' · ' + cd.nInsumos + ' insumo(s) · custo ref. ' + Util.fmtMoeda(cd.custoUnitario) + ' · aderência ' + Math.round(cd.score * 100) + '%</span></span></label>';
        }).join("");
        UI.modal("Agente especialista — referência oficial", '<p class="muted" style="font-size:12px">O agente achou estas composições oficiais parecidas com a sua descrição. Escolha a base da estrutura — os <b>coeficientes vêm da referência real</b> (nada inventado) e você revisa tudo no passo 2.</p>' + linhas, [
          { texto: "Voltar", classe: "ghost", onClick: function () { self._cpRender(); } },
          { texto: "Usar esta referência", classe: "success", onClick: function () {
            var sel = document.querySelector('input[name="cp-ref"]:checked');
            var ref = cands[sel ? parseInt(sel.value, 10) : 0];
            var prop = ComposicaoPropria.daReferencia(ref._comp, { resolve: function (cod, fonte) { return self._cpResolve(cod, fonte); } });
            var c = self._cp.comp;
            if (!c.unidade) c.unidade = String(prop.unidade || "").toLowerCase();
            if (!c.grupo) c.grupo = ComposicaoPropria.grupoDoCriador(prop.grupo);
            c.maoDeObra = prop.maoDeObra;
            c.insumos = prop.insumos;
            c.observacao = (c.observacao ? c.observacao + " · " : "") + prop.observacao + (prop.grupo && c.grupo === "OUTROS" ? " Grupo oficial: " + prop.grupo + "." : "");
            self._cp.referencia = ref._comp;
            self._cp.passo = 2;
            self._cpRender();
            UI.toast("Estrutura montada pela referência " + ref.codigo + " — revise coeficientes e preços antes de gravar.", "ok");
          } }
        ]);
      };
      if (typeof Analitico !== "undefined" && Analitico.carregado) { rodar(); return; }
      // detalhamento ainda não carregado: mesmo lazy-load do verInsumos
      // (padrão da casa: UI.loading(msg) + UI.loadingFim() — UI.loading não retorna nada)
      var urls = this._prepararAnalitico();
      UI.loading("Carregando o detalhamento oficial p/ o agente…");
      Analitico.carregarArquivo(urls.alts).then(function () { UI.loadingFim(); rodar(); })
        .catch(function () { UI.loadingFim(); UI.toast("Não consegui carregar o detalhamento agora — tente de novo com internet.", "erro"); });
    },
    cpSalvar: function () {
      var self = this, st = this._cp;
      if (!st) return;
      var codsExist = this._cpCodigosExistentes();
      if (st.editando) {
        // regravação da mesma composição: o próprio código não conta como duplicado
        codsExist = codsExist.filter(function (c) { return String(c).toLowerCase() !== String(st.editando).toLowerCase(); });
      }
      var ctx = {
        codigosExistentes: codsExist,
        resolve: function (cod, fonte) { return self._cpResolve(cod, fonte); },
        existeOficial: function (cod) { return self._cpExisteOficial(cod); },
        referencia: st.referencia
      };
      var r = ComposicaoPropria.validar(st.comp, ctx);
      var box = UI.el("cp-valida");
      if (!r.ok) {
        if (box) box.innerHTML = '<div style="padding:9px 12px;border-radius:8px;background:rgba(220,38,38,.10);border:1px solid rgba(220,38,38,.3);font-size:12px"><b>' + (typeof Icones !== 'undefined' ? Icones.get('proibido', 15) : '') + ' Corrija antes de gravar (sem margem para erro):</b><br>· ' + r.erros.map(Util.esc).join("<br>· ") + '</div>';
        return;
      }
      var gravar = function () {
        var c = st.comp;
        var item = {
          codigo: c.codigo, codigoSecundario: c.codigoSec || "", descricao: c.descricao,
          unidade: c.unidade, custoUnitario: r.custo.total, custoMO: r.custo.mo,
          custoMAT: r.custo.mat, custoEQ: r.custo.eq, tipoItem: "composicao",
          origem: "PROPRIA", grupo: c.grupo, metodo: c.metodo, modeloRef: c.modeloRef || "SINAPI", maoDeObra: !!c.maoDeObra,
          observacao: c.observacao, referenciaCodigo: (st.referencia && st.referencia.codigo) || "",
          criadoEm: Util.agoraISO(), insumos: c.insumos
        };
        /* ⚠ EDICAO PRESERVA O `criadoPor` ORIGINAL — e nao e detalhe de
           auditoria, e o que impede o clone. `js/propriasync.js:97` decide
           "colisao de verdade" por AUTORES DIFERENTES + conteudo diferente;
           o comentario de la afirma, por escrito, que "a edicao preserva o
           criadoPor original (app.js)". Regravar aqui com `Auth.nome()`
           quebrava essa promessa e o estrago apareceu quando o nome do dono
           deixou de ser a razao social: o mesmo dono passava a ter DOIS
           nomes ao longo do tempo, o merge lia isso como duas pessoas, e o
           aparelho que ainda tinha o registro velho VENCIA o desempate (por
           `criadoEm` mais antigo) — a correcao ia para um codigo exilado e
           os orcamentos seguiam apontando para o preco velho. E a mesma
           familia dos 65 clones de DEMOLICAO DE ALVENARIA que o
           propriasync.js foi escrito para acabar.
           O irmao em `_insumoProprioSalvar` ja fazia certo; aqui estava o
           fora-de-padrao. */
        var _origAutor = "";
        if (st.editando) {
          try {
            var _bx = Store.lerBasesExtras(Auth.empresaId()) || [];
            for (var _i = 0; _i < _bx.length; _i++) {
              if (String(_bx[_i].fonte).toUpperCase() !== "PROPRIA") continue;
              var _dd = _bx[_i].dados || [];
              for (var _j = 0; _j < _dd.length; _j++) {
                if (String(_dd[_j].codigo).toLowerCase() === String(st.editando).toLowerCase()) { _origAutor = _dd[_j].criadoPor || ""; break; }
              }
            }
          } catch (_e) {}
        }
        item.criadoPor = _origAutor || ((typeof Auth !== "undefined" && Auth.nome) ? Auth.nome() : ""); // auditoria: quem criou
        self._propriaGravar(item, st.editando, c.uf);
        /* EDIÇÃO PROPAGA PARA A PLANILHA — com o usuário no comando.
           Sem isto, o item lançado ficava com o preço velho para sempre
           (só excluindo e re-adicionando), enquanto o detalhamento já
           mostrava o novo. A varredura cobre TODOS os orçamentos da
           empresa; o código antigo também casa (edição pode renomear). */
        if (st.editando && !self._trialBloqueado()) { /* trial bloqueado nao grava orcamento por NENHUM caminho */
          try {
            var eidRp = Auth.empresaId();
            var afetados = [], listaRp = Store.listarOrcamentos(eidRp);
            listaRp.forEach(function (o) {
              var alvo = (self.orcAtual && self.orcAtual.id === o.id) ? self.orcAtual : o;
              var n = Orcamento.reprecificarPorCodigo(alvo, st.editando, item);
              if (n > 0) afetados.push({ orc: alvo, n: n, mesmoAberto: alvo === self.orcAtual });
            });
            if (afetados.length) {
              var totRp = afetados.reduce(function (s, a) { return s + a.n; }, 0);
              if (window.confirm("Esta composição está lançada em " + totRp + " item(ns) de " +
                  afetados.length + " orçamento(s). Atualizar o preço desses itens agora?\n\n" +
                  "OK = atualiza para " + Util.fmtMoeda(item.custoUnitario) + "/" + item.unidade +
                  " · Cancelar = mantém como está")) {
                self._salvarOrcsAfetados(eidRp, afetados);   // ⚠ materializa o modo executivo antes (ver _materializarSeExec)
                UI.toast(totRp + " item(ns) reprecificado(s) em " + afetados.length + " orçamento(s).", "ok");
                if (afetados.some(function (a) { return a.mesmoAberto; })) self.render();
              } else {
                /* recusou: recarrega os orçamentos do disco para desfazer a
                   mutação em memória (a varredura mexeu nos objetos) */
                var limpo = Store.listarOrcamentos(eidRp);
                if (self.orcAtual) {
                  for (var iRp = 0; iRp < limpo.length; iRp++) {
                    if (limpo[iRp].id === self.orcAtual.id) self.orcAtual = limpo[iRp];
                  }
                }
              }
            }
          } catch (eRp) {}
        }
        // veio da busca do editor ("não achei o serviço") → a composição recém-
        // criada JÁ entra na etapa de onde o orçamentista partiu, quantidade 1.
        // Respeita o limite de itens do plano (mesma régua do escolherItemSinapi).
        var addOk = false, limEstourado = false;
        if (st.addNaEtapa && self.orcAtual && (self.orcAtual.etapas || []).some(function (e) { return e.id === st.addNaEtapa; })) {
          self.expandirEtapa(st.addNaEtapa, st.addNaSub || ""); // senão o item nasce escondido numa etapa (ou sub etapa) recolhida
          var limCp = Auth.limite("limiteItensPorOrcamento");
          if (Orcamento.totais(self.orcAtual).qtdItens >= limCp) {
            limEstourado = true;
          } else {
            /* ⚠ ENTRA SEM QUANTIDADE, de propósito (v1.1.226).
               Aqui era `1` cravado, e o toast pedia "ajuste" — um metro
               quadrado que ninguém digitou somando no total até alguém
               reparar. Agora entra PENDENTE: não soma, aparece marcado na
               planilha e o botão da memória vira "Calcular". É o fluxo de
               montar a composição primeiro e levantar a metragem depois. */
            Orcamento.addItem(self.orcAtual, st.addNaEtapa, {
              codigo: item.codigo, descricao: item.descricao, unidade: item.unidade,
              custoUnitario: item.custoUnitario, custoMO: item.custoMO, custoMAT: item.custoMAT,
              custoEQ: item.custoEQ, baseFonte: "PROPRIA"
            }, 0, st.addNaSub || "");
            self.persistir();
            addOk = true;
          }
        }
        self._cp = null;
        UI.fecharModal();
        if (addOk) self.render();
        UI.toast("Composição " + item.codigo + " gravada na base própria (" + Util.fmtMoeda(item.custoUnitario) + "/" + item.unidade + ")" + (addOk ? " e adicionada à planilha. Clique em Calcular na linha dela para levantar a quantidade." : (limEstourado ? ". Não entrou na planilha: limite de itens do plano atingido — faça upgrade." : " — já aparece na busca de itens.")), "ok");
      };
      if (r.avisos.length) {
        // avisos não bloqueiam, mas exigem decisão EXPLÍCITA (sem margem p/ erro escondido)
        /* UI.modal zera a guarda ao abrir — re-registrada logo abaixo, senão
           o ✕ deste aviso descartava a composição inteira sem pergunta */
        UI.modal("" + (typeof Icones !== "undefined" ? Icones.get("alerta", 15) : "") + " Avisos de parâmetro", '<p style="font-size:13px">O checklist passou sem erros, mas o agente encontrou <b>' + r.avisos.length + ' aviso(s)</b> que merecem conferência:</p><div style="padding:9px 12px;border-radius:8px;background:rgba(234,88,12,.08);border:1px solid rgba(234,88,12,.3);font-size:12px">· ' + r.avisos.map(Util.esc).join("<br>· ") + '</div>', [
          { texto: "Voltar e revisar", classe: "ghost", onClick: function () { self._cpRender(); } },
          { texto: "Conferi — gravar assim", classe: "success", onClick: gravar }
        ]);
        UI.modalSujo(function () { return !!(self._cp && self._cp.comp); });
        return;
      }
      gravar();
    },
    /* Grava/substitui UM item (composição OU insumo próprio) na base PROPRIA,
     * preservando os demais e os metadados uf/mes da 1ª gravação. */
    _propriaGravar: function (item, substituirCodigo, ufNova) {
      var payload = Store.lerBasesExtras(Auth.empresaId()) || [];
      var atual = null;
      for (var i = 0; i < payload.length; i++) { if (String(payload[i].fonte).toUpperCase() === "PROPRIA") atual = payload[i]; }
      var dados = (atual && atual.dados ? atual.dados : []).filter(function (d) {
        var mesmo = String(d.codigo) === String(item.codigo);
        var antigo = substituirCodigo && String(d.codigo).toLowerCase() === String(substituirCodigo).toLowerCase();
        return !mesmo && !antigo; // regravação substitui; edição com código novo remove o antigo
      });
      dados.push(item);
      Bases.registrar("PROPRIA", { dados: dados, uf: (atual && atual.uf) || ufNova || String(this._baseUf || Sinapi.uf || ""), mes: (atual && atual.mes) || new Date().toISOString().slice(0, 7) });
      Bases.persistir(Auth.empresaId());
      try { this.backupAuto({ urgente: true }); } catch (e) {} // dado autoral: cópia em arquivo sem esperar
      /* edição com código novo é RENAME: o código antigo tem de morrer no
         espelho também, senão a versão velha volta da nuvem como item extra */
      if (substituirCodigo && String(substituirCodigo).toLowerCase() !== String(item.codigo).toLowerCase()) {
        this._propriaEspelhoExcluir(substituirCodigo);
      }
      this._propriaEspelhar(item);
      return item;
    },
    /* O MESMO _propriaGravar, para VÁRIOS itens de uma vez (importação).
     * ⚠ Um por um seria N leituras e N gravações da base inteira, N backups
     *   urgentes e N espelhos — e, se o décimo falhasse, os nove primeiros já
     *   estariam no disco sem o orçamento que os usa. Em lote é uma gravação
     *   só. Mesma regra de substituição: mesmo código (sem caixa) substitui;
     *   o resto da base fica como estava. */
    _propriaGravarVarios: function (itens) {
      itens = Util.arr(itens);
      if (!itens.length) return 0;
      var eid = Auth.empresaId(), payload = Store.lerBasesExtras(eid) || [], atual = null;
      for (var i = 0; i < payload.length; i++) { if (String(payload[i].fonte).toUpperCase() === "PROPRIA") atual = payload[i]; }
      var novos = {};
      itens.forEach(function (it) { novos[String(it.codigo).trim().toLowerCase()] = 1; });
      var dados = (atual && atual.dados ? atual.dados : []).filter(function (d) { return !novos[String(d.codigo).trim().toLowerCase()]; });
      itens.forEach(function (it) { dados.push(it); });
      Bases.registrar("PROPRIA", { dados: dados, uf: (atual && atual.uf) || String(this._baseUf || Sinapi.uf || ""), mes: (atual && atual.mes) || new Date().toISOString().slice(0, 7) });
      Bases.persistir(eid);
      try { this.backupAuto({ urgente: true }); } catch (e) {} // dado autoral: cópia em arquivo sem esperar
      this._propriaEspelharVarios(itens);
      return itens.length;
    },

    /* ==================================================================
     * ESPELHO DAS COMPOSIÇÕES PRÓPRIAS (entidade `composicoes_proprias`)
     * A base PRÓPRIA é um blob no IndexedDB e a nuvem só sincroniza
     * entidades do localStorage, por id. O espelho é o que permite o merge
     * ITEM A ITEM entre aparelhos — ver js/propriasync.js.
     * ================================================================== */
    _propriaEspelhar: function (item) {
      try {
        if (typeof PropriaSync === "undefined") return;
        var reg = PropriaSync.paraRegistro(item, Util.agoraISO());
        if (reg) Store.salvar(Auth.empresaId(), PropriaSync.ENTIDADE, reg);
      } catch (e) {}
    },
    /* O MESMO espelho, em UMA gravação — ver a nota do `Store.salvarVarios`.
     * ⚠ POR QUE ESTE LAÇO PODE IR EM LOTE E A MAIORIA DOS OUTROS NÃO: aqui
     *   nada LÊ o que acabou de ser gravado. `PropriaSync.paraRegistro` é
     *   função pura do item (js/propriasync.js:32) — não toca no Store, e o
     *   `id` sai de `chaveDe(item)`, que é determinístico, em vez de depender
     *   de o `salvar` atribuir um. Ninguém usa o retorno. Os laços que NÃO
     *   podem ser migrados são os que releem dentro da volta: o número da
     *   ficha de EPI, por exemplo, é lido do que acabou de entrar — em lote
     *   ingênuo sairiam 5 fichas com o mesmo número.
     * Carimbo: continua sendo "agora" (3 argumentos, sem `manterCarimbo`),
     * porque o espelho serve ao merge da nuvem e tem de anunciar a gravação
     * recente — é o comportamento que já valia. */
    _propriaEspelharVarios: function (itens) {
      try {
        if (typeof PropriaSync === "undefined") return 0;
        var agora = Util.agoraISO(), regs = [];
        Util.arr(itens).forEach(function (it) {
          var reg = PropriaSync.paraRegistro(it, agora);
          if (reg) regs.push(reg);
        });
        if (!regs.length) return 0;
        return Store.salvarVarios(Auth.empresaId(), PropriaSync.ENTIDADE, regs);
      } catch (e) { return 0; }
    },
    _propriaEspelhoExcluir: function (codigo) {
      try {
        if (typeof PropriaSync === "undefined") return;
        // lápide: sem ela, o merge da nuvem devolve o item excluído
        Store.excluir(Auth.empresaId(), PropriaSync.ENTIDADE, String(codigo).trim().toLowerCase());
      } catch (e) {}
    },

    /* Traz o que veio da nuvem para a base PRÓPRIA e manda para a nuvem o que
     * só existe aqui. União nos dois sentidos: nunca reduz, e no mesmo código
     * vence o `atualizadoEm` mais novo. Chamado depois de sincronizar e a cada
     * mudança recebida na entidade. */
    _propriaDaNuvem: function () {
      try {
        if (typeof PropriaSync === "undefined" || typeof Bases === "undefined") return null;
        var eid = Auth.empresaId();
        var atual = this._propriasDoDisco(eid) || { fonte: "PROPRIA", uf: "", mes: "", dados: [] };
        var regs = Store.listar(eid, PropriaSync.ENTIDADE) || [];
        var mortos = {};
        try { mortos = Store.lapidesDe(eid, PropriaSync.ENTIDADE) || {}; } catch (e) {}
        var dados = PropriaSync.mesclar(atual.dados, regs, mortos);

        // 1) o que a nuvem trouxe entra na base local
        var mudou = dados.length !== atual.dados.length;
        if (!mudou) {
          try { mudou = JSON.stringify(dados) !== JSON.stringify(atual.dados); } catch (e) { mudou = true; }
        }
        if (mudou) {
          /* EXCLUSÃO FEITA EM OUTRO APARELHO — o teste de dois aparelhos reais
           * mostrou o que ninguém tinha visto: o item saía do espelho, a lápide
           * chegava, e a base local NÃO mudava. Motivo: apagar a última
           * composição zera a base, e o alarme anti-perda RECUSA a gravação
           * (com razão — ele não sabe que a ordem veio do dono, de outro
           * aparelho). Sem isto, o item ficava aqui e ainda subia de volta:
           * ressuscitava para todo mundo.
           * A permissão é ESTREITA de propósito: só quando TODO item que saiu
           * tem lápide. Qualquer sumiço sem lápide continua barrado. */
          var vivos = {};
          dados.forEach(function (it) { vivos[String(it.codigo || "").trim().toLowerCase()] = 1; });
          var sairam = atual.dados.filter(function (it) { return !vivos[String(it.codigo || "").trim().toLowerCase()]; });
          var todosComLapide = sairam.length > 0 && sairam.every(function (it) { return !!mortos[String(it.codigo || "").trim().toLowerCase()]; });
          Bases.registrar("PROPRIA", { dados: dados, uf: atual.uf, mes: atual.mes });
          Bases.persistir(eid, todosComLapide ? { permitirRemocao: true } : undefined);
        }

        // 2) o que só existe aqui sobe (1º uso: o espelho nasce vazio e a base
        //    já tem tudo — sem isto a nuvem começaria sem as composições antigas)
        var faltando = PropriaSync.faltandoNoEspelho(dados, regs);
        var self = this;
        faltando.forEach(function (it) { self._propriaEspelhar(it); });

        return { total: dados.length, subiram: faltando.length, mudou: mudou };
      } catch (e) { return null; }
    },
    /* v1.1.124 — INSUMO PRÓPRIO (p/ requisições/compras e busca): item simples
     * na base PROPRIA com tipoItem "insumo". Retorna o item ou null (inválido).
     * dados.codigoEditando (v1.1.208) = REGRAVAÇÃO do insumo que já existe:
     * mantém o código, não deduplica contra si mesmo e não recria. */
    salvarInsumoProprio: function (dados) {
      if (this._trialBloqueado()) { this._avisoTrial(); return null; } /* trial não persiste por NENHUM caminho */
      dados = dados || {};
      var desc = String(dados.descricao || "").trim();
      var und = String(dados.unidade || "").trim() || "un";
      var preco = Util.num(dados.preco);
      if (desc.length < 3) { UI.toast("Descreva o insumo (mínimo 3 letras).", "erro"); return null; }
      var cat = ["MO", "MAT", "EQ"].indexOf(String(dados.categoria || "").toUpperCase()) >= 0 ? String(dados.categoria).toUpperCase() : "MAT";
      var editando = String(dados.codigoEditando || "").trim();
      // DEDUPE: mesmo insumo (descrição+unidade, sem caixa/acento) ATUALIZA o
      // existente em vez de criar PROP novo a cada cadastro repetido
      var norm = function (s) { s = String(s == null ? "" : s).toLowerCase(); try { s = s.normalize("NFD").replace(/[̀-ͯ]/g, ""); } catch (e) {} return s.replace(/\s+/g, " ").trim(); };
      var jaExiste = null, alvoEdicao = null;
      try {
        var bPro = (typeof Bases !== "undefined" && Bases.extras) ? Bases.extras().filter(function (b) { return b.fonte === "PROPRIA"; })[0] : null;
        (bPro && bPro.itens ? bPro.itens : []).forEach(function (d) {
          if (editando && String(d.codigo) === editando) { alvoEdicao = d; return; } // ele mesmo nunca é "duplicado"
          if (String(d.tipoItem) === "insumo" && norm(d.descricao) === norm(desc) && norm(d.unidade) === norm(und)) jaExiste = d;
        });
      } catch (eDx) {}
      if (editando && !alvoEdicao) { UI.toast("Insumo " + editando + " não está mais no seu banco.", "erro"); return null; }
      /* editar até virar a CÓPIA de outro insumo seria fusão silenciosa: o
         dedupe gravaria por cima do outro código e um dos dois sumiria. */
      if (editando && jaExiste) {
        UI.toast("Já existe o insumo " + jaExiste.codigo + " com essa descrição e unidade — ajuste a descrição ou edite aquele.", "erro");
        return null;
      }
      var item = {
        /* O CÓDIGO DA COMPOSIÇÃO ABERTA AINDA NÃO FOI GRAVADO — e reservar
           só o que está persistido fazia o insumo inline ROUBAR o código
           dela: a composição nascia PROP-0002, o insumo era gravado como
           PROP-0002, e o "Validar e gravar" travava com "código já existe"
           acusando o usuário de algo que o próprio app fez. O código em
           voo entra na lista de reservados. */
        codigo: (alvoEdicao || jaExiste) ? (alvoEdicao || jaExiste).codigo : ComposicaoPropria.gerarCodigo(
          this._cpCodigosExistentes().concat(
            this._cp && this._cp.comp && this._cp.comp.codigo ? [String(this._cp.comp.codigo)] : [])),
        descricao: desc, unidade: und, custoUnitario: preco,
        // breakdown por categoria — senão o item some da curva MO/MAT/EQ do orçamento
        custoMO: cat === "MO" ? preco : 0, custoMAT: cat === "MAT" ? preco : 0, custoEQ: cat === "EQ" ? preco : 0,
        tipoItem: "insumo", origem: "PROPRIA", categoria: cat,
        criadoEm: (alvoEdicao && alvoEdicao.criadoEm) || (jaExiste && jaExiste.criadoEm) || Util.agoraISO(),
        /* O ESPELHO DA NUVEM ORDENA POR ESTA DATA. Sem ela, regravar preservando
           o criadoEm antigo mandava para a nuvem um registro com data velha — e
           o merge devolvia a versão anterior do outro aparelho, desfazendo a
           correção sem erro nenhum. */
        atualizadoEm: Util.agoraISO(),
        criadoPor: (alvoEdicao && alvoEdicao.criadoPor) || ((typeof Auth !== "undefined" && Auth.nome) ? Auth.nome() : "") // auditoria
      };
      this._propriaGravar(item, null, null);
      UI.toast("Insumo " + item.codigo + (alvoEdicao ? " regravado" : (jaExiste ? " ATUALIZADO no seu banco" : " salvo no seu banco")) + (preco > 0 ? " (" + Util.fmtMoeda(preco) + "/" + und + ")" : "") + " — aparece nas buscas de requisição e de orçamento.", "ok");
      /* v1.1.210 — o insumo próprio nunca conferiu unidade: aceitava qualquer
         texto calado, e o dedo escorregado só aparecia meses depois, dentro de
         uma composição. AVISA DEPOIS DE GRAVAR, de propósito — o insumo já está
         salvo e o aviso é para conferir, não para barrar (mesma régua da
         composição própria, que também não bloqueia por vocabulário). */
      if (typeof ComposicaoPropria !== "undefined" && ComposicaoPropria.unidadeValida && !ComposicaoPropria.unidadeValida(und)) {
        UI.toast("Unidade \"" + und + "\" está fora do catálogo — confira se é isso mesmo (un, m², m³, kg, h, cx, vb, cj…). O insumo foi salvo assim mesmo.", "erro");
      }
      return item;
    },
    /* ------------------------------------------------------------------
     * EDITAR UM INSUMO PRÓPRIO (v1.1.208)
     * O cliente que cadastra "ENCARREGADO · un · R$ 5.500,00" descobre o erro
     * depois — e até aqui a lista só oferecia a lixeira. Excluir não servia:
     * o código sai das buscas e as composições que o usam ficam sem preço.
     * Agora corrige no lugar, com a mesma pergunta de propagação que a
     * composição já faz (nada muda em orçamento sem o usuário mandar).
     * ------------------------------------------------------------------ */
    editarInsumoProprio: function (codigo, aoConcluir) {
      /* Composição própria é acervo de ORÇAMENTO — quem tem o módulo cuida
         dela. Chegava por ⚙ → Tabelas → "ver itens", que a engrenagem mostra
         para qualquer sessão: sub-usuário sem Orçamentos lia código, descrição
         e CUSTO UNITÁRIO de cada composição autoral, e ainda editava e excluía. */
      if (typeof Auth !== "undefined" && Auth.podeModulo && !Auth.podeModulo("orcamentos")) {
        try { UI.toast("Seu usuário não tem permissão no módulo Orçamentos.", "erro"); } catch (e) {}
        return;
      }
      var self = this;
      var ins = Bases.obter("PROPRIA", String(codigo));
      if (!ins) { UI.toast("Insumo " + codigo + " não encontrado na base própria.", "erro"); return; }
      if (String(ins.tipoItem) !== "insumo") { this.editarComposicao(codigo); return; } // composição tem editor próprio
      var campos = (typeof Gestao !== "undefined" && Gestao._insumoProprioCampos)
        ? Gestao._insumoProprioCampos("eip", false)
        : '<div class="field"><label>Descrição *</label><input id="eip-desc"></div><div class="row"><div class="field" style="max-width:110px"><label>Unidade *</label><input id="eip-und"></div><div class="field"><label>Preço (R$)</label><input id="eip-preco"></div></div><select id="eip-cat"><option value="MAT">MAT</option><option value="MO">MO</option><option value="EQ">EQ</option></select>';
      UI.modal("Editar insumo " + Util.esc(ins.codigo),
        '<p class="muted" style="font-size:12px">O código <b>' + Util.esc(ins.codigo) + '</b> não muda — quem já usa este insumo continua apontando para ele.</p>' + campos, [
        { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
        { texto: "Salvar alterações", classe: "success", onClick: function () {
          var d = (typeof Gestao !== "undefined" && Gestao._insumoProprioColeta) ? Gestao._insumoProprioColeta("eip")
            : { descricao: (UI.el("eip-desc") || {}).value || "", unidade: (UI.el("eip-und") || {}).value || "un", categoria: (UI.el("eip-cat") || {}).value || "MAT", preco: Util.num((UI.el("eip-preco") || {}).value) };
          d.codigoEditando = ins.codigo;
          var novo = self.salvarInsumoProprio(d);
          if (!novo) return; // inválido — o modal fica aberto com o que foi digitado
          UI.fecharModal();
          self._propriaPropagarInsumo(ins, novo);
          /* quem chamou decide para onde voltar: da lista do orçamento, ela
             mesma; do Banco de Insumos da Gestão, a busca se repinta (abrir
             a lista do orçamento ali seria um modal do módulo errado) */
          if (typeof aoConcluir === "function") { try { aoConcluir(novo); } catch (eCb) {} }
          else self.minhasComposicoes(self._mcFiltro || "");
        } }
      ]);
      // o helper de campos nasce vazio (é o mesmo do cadastro) — preencher é aqui
      var dsc = UI.el("eip-desc"); if (dsc) { dsc.value = ins.descricao || ""; dsc.focus(); }
      var und = UI.el("eip-und"); if (und) und.value = ins.unidade || "un";
      var pre = UI.el("eip-preco"); if (pre) pre.value = Util.num(ins.custoUnitario) ? String(Util.num(ins.custoUnitario).toFixed(2)).replace(".", ",") : "";
      var cat = UI.el("eip-cat");
      if (cat) cat.value = ["MO", "MAT", "EQ"].indexOf(String(ins.categoria || "").toUpperCase()) >= 0 ? String(ins.categoria).toUpperCase() : "MAT";
    },
    /* Depois de regravar um insumo próprio: quem depende dele fica mentindo
     * (a composição soma o preço velho, a planilha idem). Levanta os dois
     * usos, pergunta UMA vez e só então propaga. */
    _propriaPropagarInsumo: function (antigo, novo) {
      var self = this;
      var mudouPreco = Util.num(antigo.custoUnitario) !== Util.num(novo.custoUnitario);
      var mudouRotulo = String(antigo.descricao || "") !== String(novo.descricao || "") ||
                        String(antigo.unidade || "") !== String(novo.unidade || "") ||
                        String(antigo.categoria || "") !== String(novo.categoria || "");
      if (!mudouPreco && !mudouRotulo) return;
      // 1) composições próprias que têm este insumo na estrutura
      var comps = [];
      try {
        var bPro = (typeof Bases !== "undefined" && Bases.extras) ? Bases.extras().filter(function (b) { return b.fonte === "PROPRIA"; })[0] : null;
        (bPro && bPro.itens ? bPro.itens : []).forEach(function (d) {
          if (String(d.codigo) === String(novo.codigo)) return;
          if ((d.insumos || []).some(function (i) { return String(i.codigo) === String(novo.codigo); })) comps.push(d);
        });
      } catch (eC) {}
      /* 2) as composições REFEITAS em memória — antes de perguntar, porque é o
         preço novo DELAS que a planilha precisa levar (um orçamento pode usar
         só a composição, sem nunca ter lançado o insumo solto). Nada vai para
         o disco enquanto o usuário não disser sim. */
      var atualizadas = [];
      comps.forEach(function (c) {
        var copia; try { copia = JSON.parse(JSON.stringify(c)); } catch (e) { return; }
        (copia.insumos || []).forEach(function (i) {
          if (String(i.codigo) !== String(novo.codigo)) return;
          i.descricao = novo.descricao; i.unidade = novo.unidade;
          i.custoUnitario = Util.num(novo.custoUnitario); i.categoria = novo.categoria;
        });
        var r = ComposicaoPropria.custo(copia.insumos, copia.metodo);
        copia.custoUnitario = r.total; copia.custoMO = r.mo; copia.custoMAT = r.mat; copia.custoEQ = r.eq;
        copia.atualizadoEm = Util.agoraISO(); // idem: sem data nova o espelho devolve a versão velha
        atualizadas.push(copia);
      });
      // 3) itens de orçamento: o código do insumo E o de cada composição refeita
      var eid = Auth.empresaId(), afetados = [], totItens = 0;
      if (!this._trialBloqueado()) { /* trial não grava orçamento por NENHUM caminho */
        try {
          Store.listarOrcamentos(eid).forEach(function (o) {
            var alvo = (self.orcAtual && self.orcAtual.id === o.id) ? self.orcAtual : o;
            var n = Orcamento.reprecificarPorCodigo(alvo, novo.codigo, novo);
            atualizadas.forEach(function (c) { n += Orcamento.reprecificarPorCodigo(alvo, c.codigo, c); });
            if (n > 0) { afetados.push({ orc: alvo, n: n, mesmoAberto: alvo === self.orcAtual }); totItens += n; }
          });
        } catch (eO) {}
      }
      if (!atualizadas.length && !afetados.length) return;
      var pergunta = "O insumo " + novo.codigo + " mudou" +
        (mudouPreco ? " de " + Util.fmtMoeda(antigo.custoUnitario) + " para " + Util.fmtMoeda(novo.custoUnitario) : "") + ".\n\n" +
        "Ele é usado em:\n" +
        (atualizadas.length ? "· " + atualizadas.length + " composição(ões) própria(s) (" + atualizadas.slice(0, 5).map(function (c) { return c.codigo; }).join(", ") + (atualizadas.length > 5 ? "…" : "") + ")\n" : "") +
        (afetados.length ? "· " + totItens + " item(ns) de " + afetados.length + " orçamento(s)\n" : "") +
        "\nOK = atualiza tudo agora · Cancelar = só o insumo muda (o resto fica com o valor antigo)";
      if (!window.confirm(pergunta)) {
        /* recusou: os orçamentos foram mexidos EM MEMÓRIA pela varredura —
           recarrega do disco, senão o "não" viraria "sim" no próximo salvar.
           As composições nem chegaram ao disco (só a cópia em memória). */
        if (afetados.length) {
          try {
            var limpo = Store.listarOrcamentos(eid);
            if (self.orcAtual) {
              for (var i = 0; i < limpo.length; i++) { if (limpo[i].id === self.orcAtual.id) self.orcAtual = limpo[i]; }
            }
          } catch (eR) {}
        }
        if (atualizadas.length) UI.toast(atualizadas.length + " composição(ões) continuam com o preço antigo deste insumo — reabra e regrave quando quiser atualizar.", "erro");
        return;
      }
      atualizadas.forEach(function (c) { self._propriaGravar(c, null, null); });
      this._salvarOrcsAfetados(eid, afetados);   // ⚠ materializa o modo executivo antes (ver _materializarSeExec)
      if (afetados.some(function (a) { return a.mesmoAberto; })) this.render();
      UI.toast("Atualizado: " + (atualizadas.length ? atualizadas.length + " composição(ões)" : "") + (atualizadas.length && totItens ? " e " : "") +
        (totItens ? totItens + " item(ns) de orçamento" : "") + ".", "ok");
    },
    /* ==================================================================
     * ELABORAR COMPOSIÇÃO — o agente, chamável de qualquer lugar (v1.1.220)
     *
     * Recebe uma descrição e devolve a composição montada em cima de uma
     * composição OFICIAL análoga: insumos e coeficientes reais, código
     * legível, custo calculado. Abre no criador para o usuário conferir —
     * nunca grava sozinho.
     *
     * `opts.etapa`/`opts.sub`: quando vem do editor, a composição já entra
     * na etapa de origem ao gravar. `opts.aoFechar`: quem chamou volta para
     * onde estava (o Escopo, por exemplo).
     * ================================================================== */
    /* Justificar o coeficiente: calculadora OU texto livre (v1.1.223).
     * ⚠ A calculadora escreve a conta; quem prefere escrever, escreve. O que
     * não pode é o coeficiente ficar sem explicação — é a primeira pergunta
     * de qualquer auditoria e a que a composição própria não sabia responder. */
    cpMemoria: function (i) {
      var self = this, idx = +i;
      var ins = (this._cp && this._cp.comp && this._cp.comp.insumos || [])[idx];
      if (!ins) return;
      var formas = Object.keys(ComposicaoPropria.FORMAS_COEF);
      var campos = formas.map(function (k) {
        var F = ComposicaoPropria.FORMAS_COEF[k];
        return '<div class="cpm-forma" data-f="' + k + '" style="display:none">' +
          F.campos.map(function (c) {
            return '<div class="field" style="margin:4px 0"><label style="font-size:11px">' + Util.esc(c.rotulo) + '</label>' +
              '<input id="cpm-' + k + '-' + c.id + '" value="' + (c.padrao != null ? c.padrao : "") + '"></div>';
          }).join("") + '</div>';
      }).join("");
      UI.modal("Por que este coeficiente? — " + Util.esc(String(ins.descricao || ins.codigo).slice(0, 50)),
        '<p class="muted" style="font-size:12.5px">Coeficiente atual: <b>' + Util.fmtNum(ins.coeficiente, 4) + '</b> ' +
        Util.esc(Util.unidadeExibir(ins.unidade)) + ' por unidade do serviço.</p>' +
        '<div class="field"><label>Calcular por</label><select id="cpm-forma">' +
          '<option value="">— escrever à mão —</option>' +
          formas.map(function (k) { return '<option value="' + k + '">' + Util.esc(ComposicaoPropria.FORMAS_COEF[k].rotulo) + '</option>'; }).join("") +
        '</select></div>' + campos +
        '<div class="field"><label>Justificativa (sai no detalhamento e no laudo)</label>' +
          '<textarea id="cpm-txt" rows="3">' + Util.esc(ins.memoria || "") + '</textarea></div>' +
        '<div id="cpm-res" class="muted" style="font-size:12px"></div>',
        [
          { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
          { texto: "Calcular", classe: "primary", onClick: function () {
            var f = (UI.el("cpm-forma") || {}).value;
            if (!f) { UI.toast("Escolha uma forma de cálculo ou escreva à mão.", "erro"); return; }
            var d = {};
            ComposicaoPropria.FORMAS_COEF[f].campos.forEach(function (c) { d[c.id] = (UI.el("cpm-" + f + "-" + c.id) || {}).value; });
            var r = ComposicaoPropria.calcularCoeficiente(f, d);
            if (!r.ok) { UI.el("cpm-res").innerHTML = '<span style="color:#dc2626">' + Util.esc(r.erro) + '</span>'; return; }
            UI.el("cpm-txt").value = r.texto;
            UI.el("cpm-res").innerHTML = '<b style="color:#16a34a">Coeficiente: ' + Util.fmtNum(r.coeficiente, 4) + '</b>' +
              ' — confira e grave; o coeficiente da linha será atualizado.';
            UI.el("cpm-res").setAttribute("data-coef", String(r.coeficiente));
          } },
          { texto: "Gravar justificativa", classe: "success", onClick: function () {
            var txt = String((UI.el("cpm-txt") || {}).value || "").trim();
            var novoCoef = (UI.el("cpm-res") || {}).getAttribute ? (UI.el("cpm-res").getAttribute("data-coef") || "") : "";
            ins.memoria = txt;
            if (novoCoef) ins.coeficiente = Number(novoCoef);
            UI.fecharModal();
            self._cpRender();
            UI.toast(txt ? "Justificativa gravada." : "Justificativa apagada.", "ok");
          } }
        ]);
      var sel = UI.el("cpm-forma");
      if (sel) sel.addEventListener("change", function () {
        Array.prototype.forEach.call(document.querySelectorAll(".cpm-forma"), function (d) {
          d.style.display = d.getAttribute("data-f") === sel.value ? "" : "none";
        });
      });
    },

    /* Botão da linha PENDENTE do Escopo: manda a descrição original ao agente
     * e, ao voltar, o escopo continua de onde estava. */
    escopoElaborar: function (i) {
      var l = (this._escopo || [])[+i];
      if (!l) return;
      var self = this;
      this.elaborarComposicao(l.textoOriginal, {
        unidade: l.unidade || "",
        aoFechar: function () { self.analisarEscopo(); },
        /* A linha pendente não precisava de composição própria: a oficial
           existe e tem preço. Aplicar aqui é escolher o candidato — o mesmo
           que o usuário faria no select, sem passar pelo clone.
         *
         * ⚠ CONFIANÇA 100 ERA MENTIRA, E CARA. A primeira versão gravava
         *   `confianca: 100` com motivo "escolhida por você", copiando a
         *   convenção do "código informado" — só que ali quem digitou o código
         *   foi a pessoa, e aqui quem escolheu foi a BUSCA POR SEMELHANÇA. Em
         *   85% das perguntas em texto livre o código ofertado não era o
         *   pedido, e o erro chega a 5× no preço. Carimbar isso como escolha
         *   humana com nota máxima transformava um palpite em fato.
         *
         * ⚠ E `refinadoIA = true` SELAVA A LINHA: a IA nunca mais reveria uma
         *   decisão que ela poderia corrigir. Confirmar num modal não é o mesmo
         *   que conferir a composição — o aceite mantém a linha revisável. */
        aoUsarOficial: function (rota, r) {
          var item = self._cpResolve(String(rota.codigo), "SINAPI");
          if (!item) return false;   // sem item não há o que aplicar → abre o detalhe
          var conf = { alta: 75, media: 50 }[(r && r.confianca) || ""] || 30;
          l.candidatos = [{ item: item, fonte: "SINAPI", confianca: conf,
                            motivo: "sugestão do agente por semelhança, aceita por você"
                                    + " — confira antes de fechar o orçamento" }]
                         .concat(l.candidatos || []);
          l.escolhido = 0;
          /* a IA respeita isto; `refinadoIA` continua querendo dizer outra
             coisa ("a IA ja passou"), e nao se confundem mais */
          l.decididoPeloUsuario = true;
          /* reabre a revisão do Escopo já com a linha resolvida — o mesmo
             caminho que a IA usa ao voltar, para não existir um segundo
             jeito de desenhar a mesma tela */
          self._mostrarEscopoResultado(0);
          return true;
        }
      });
    },

    /* A tela dos três diagnósticos (ver a intercepção em `rodar`). Ela nunca
     * bloqueia: "Criar minha versão mesmo assim" está sempre ali, porque há
     * caso legítimo de querer o próprio coeficiente. O que muda é qual é o
     * caminho em destaque — e, nos dois casos abaixo, não é o clone. */
    _cpOferecerRota: function (r, desc, o, abrir) {
      var self = this, rota = r.rota;
      var seguir = function () {
        UI.fecharModal();
        o.rotaJaDecidida = true;   // a segunda passada não repergunta
        abrir(r);
      };
      var botoes = [{ texto: "Criar minha versão mesmo assim", classe: "ghost", onClick: seguir }];
      var titulo, corpo;
      var ic = function (n) { return (typeof Icones !== "undefined" ? Icones.get(n, 15) : ""); };

      /* ⚠ O CÓDIGO OFERECIDO VEIO DE BUSCA POR SEMELHANÇA, E A TELA TEM DE
         DIZER ISSO. A primeira versão deste modal afirmava "a base do estado já
         traz 89464" como se fosse A resposta, sem mostrar confiança nem
         alternativas. Medido: em 47% da própria amostra do commit o código
         ofertado NÃO era o que foi pedido; com texto livre — que é a população
         real deste botão — 85%. O erro chega a 5× no preço.

         É a mesma armadilha do caso das 50 paredes de mármore: score alto não
         sabe que errou de alvo. A confiança e as alternativas passam a aparecer
         SEMPRE, e quando ela não é alta o aviso vem antes do preço. */
      var nivel = r.confianca === "alta" ? "alta" : (r.confianca === "media" ? "média" : "baixa");
      var seguro = r.confianca === "alta";
      var cabecaAviso = seguro ? "" :
        '<div style="border-left:3px solid var(--erro,#c0392b);padding:8px 10px;margin:0 0 10px;font-size:13px">' +
        '<b>Semelhança ' + nivel + '.</b> Este código é o mais parecido que o agente achou com o que você ' +
        'escreveu — não é uma correspondência confirmada. Confira a descrição antes de aceitar.' +
        (r.aviso ? '<div class="muted" style="margin-top:5px;font-size:12.5px">' + Util.esc(r.aviso) + '</div>' : '') +
        '</div>';
      var listaAlt = (r.alternativas || []).length
        ? '<p class="muted" style="font-size:12.5px;margin:10px 0 0">O agente também achou: ' +
          r.alternativas.slice(0, 3).map(function (a) {
            return '<b>' + Util.esc(a.codigo) + '</b> ' + Util.esc(String(a.descricao).slice(0, 52));
          }).join(' · ') + '</p>'
        : '';

      if (rota.tipo === "oficial") {
        titulo = (seguro ? ic("check") : ic("alerta")) +
                 (seguro ? " Esta composição já existe na base, com preço"
                         : " O mais parecido que achei já existe na base, com preço");
        corpo = cabecaAviso +
          '<p style="margin:0 0 10px;font-size:13.5px">Você pediu <b>' + Util.esc(desc) + '</b>. ' +
          'A base do estado traz, como ' + (seguro ? 'correspondência' : 'candidato mais próximo') + ':</p>' +
          '<div style="border:1px solid var(--borda);border-radius:8px;padding:10px 12px;margin-bottom:10px">' +
          '<div style="font-size:13.5px"><b>' + Util.esc(rota.codigo) + '</b> — ' +
          Util.esc(String(rota.descricao).slice(0, 120)) + '</div>' +
          '<div style="font-size:15px;margin-top:4px"><b>' + Util.fmtMoeda(rota.preco) + '</b> / ' +
          Util.esc(rota.unidade || "un") + '</div></div>' +
          '<p class="muted" style="font-size:12.5px;margin:0">Usar a oficial vale mais que copiá-la: ' +
          'ela se atualiza sozinha na próxima competência, e o código é o que a auditoria reconhece. ' +
          'A cópia congela o preço de hoje num código próprio.</p>' + listaAlt;
        if (typeof o.aoUsarOficial === "function") {
          botoes.push({ texto: ic("check") + " Usar a " + rota.codigo, classe: "primary", onClick: function () {
            UI.fecharModal();
            var feito = o.aoUsarOficial(rota, r);
            if (feito === false) { self.verInsumos(String(rota.codigo)); return; }
            UI.toast("Composição oficial " + rota.codigo + " aplicada (" +
                     Util.fmtMoeda(rota.preco) + "/" + (rota.unidade || "un") + ").", "ok");
            /* ⚠ o `aoFechar` do Escopo REANALISA a linha, o que apagaria o
               candidato recém-aplicado. Quem aplicou é dono do que vem
               depois — por isso a continuação é do callback, não daqui. */
          } });
        } else {
          /* ⚠ O CAMINHO RECOMENDADO SAÍA SEM ITEM NA PLANILHA — e é assim que se
             volta a clonar. O botão em destaque levava a `verInsumos()`, que é
             leitura: ele oferece "Criar minha versão" e "Fechar", e nada mais.
             Quem seguia o conselho da tela ("use a oficial, não copie") tinha
             de reabrir a busca e redigitar o serviço; quem não tivesse
             paciência voltava para o clone que este modal existe para evitar.

             `escolherItemSinapi` é o mesmo caminho da busca de itens: abre a
             quantidade e lança na etapa de destino, que já está em
             `_addItemEtapaId` desde que a busca foi aberta. Ver a composição
             continua a um clique, agora como opção secundária. */
          var podeLancar = !!(self.orcAtual && self._addItemEtapaId
                              && typeof self.escolherItemSinapi === "function");
          botoes.push({ texto: ic("buscar") + " Ver os insumos", classe: "ghost", onClick: function () {
            UI.fecharModal(); self.verInsumos(String(rota.codigo));
          } });
          if (podeLancar) {
            botoes.push({ texto: ic("check") + " Lançar a " + rota.codigo + " no orçamento",
                          classe: "primary", onClick: function () {
              UI.fecharModal();
              self.escolherItemSinapi(String(rota.codigo) + "|SINAPI");
            } });
          }
        }
      } else {
        var n = rota.faltam.length;
        titulo = ic("alerta") + " A base tem esta composição — falta preço de " + n + " insumo" + (n > 1 ? "s" : "");
        corpo = cabecaAviso +
          '<p style="margin:0 0 10px;font-size:13.5px">A composição <b>' + Util.esc(rota.codigo) + '</b> — ' +
          Util.esc(String(rota.descricao).slice(0, 110)) + ' — existe na base analítica com os ' +
          '<b>coeficientes oficiais</b>. O que a CAIXA não publica é o custo, porque ' +
          (n > 1 ? 'estes insumos não têm' : 'este insumo não tem') + ' coleta de preço neste estado:</p>' +
          '<ul style="margin:0 0 10px;padding-left:18px;font-size:13px;line-height:1.65">' +
          rota.faltam.slice(0, 6).map(function (i) {
            return '<li><b>' + Util.esc(i.codigo) + '</b> ' + Util.esc(String(i.descricao).slice(0, 70)) +
                   (i.coeficiente ? ' <span class="muted">(' + Util.fmtNum(i.coeficiente, 4) + ' ' +
                                    Util.esc(i.unidade || "") + ' por ' + Util.esc(rota.unidade || "un") + ')</span>' : '') +
                   '</li>';
          }).join("") +
          (n > 6 ? '<li class="muted">…e mais ' + (n - 6) + '</li>' : '') +
          '</ul>' +
          '<p class="muted" style="font-size:12.5px;margin:0">Informar a sua cotação devolve a composição ' +
          '<b>inteira</b>, com a produtividade medida em campo que ninguém reproduz montando à mão — ' +
          'e o preço passa a valer em toda composição que use o mesmo insumo.</p>' +
          /* ⚠ SEM ESTA FRASE O USUÁRIO COTA E FICA SEM ITEM. A composição não
             está na base de preços do estado — é por isso que ela caiu nesta
             rota —, então cotar o insumo não a faz aparecer na busca. O preço
             passa a existir quando o agente remonta a composição com os
             coeficientes oficiais e os insumos agora precificados, e isso é
             literalmente o botão "Criar minha versão" ao lado. São dois passos,
             e omitir o segundo deixa a pessoa no meio do caminho. */
          '<p style="font-size:12.5px;margin:10px 0 0;border-left:3px solid var(--borda);padding-left:9px">' +
          '<b>São dois passos:</b> informe o preço na tela que abre e depois volte aqui em ' +
          '<b>Criar minha versão</b> — é ela que remonta a composição com os coeficientes ' +
          'oficiais e o preço que você acabou de dar. Cotar sozinho não faz o item aparecer ' +
          'na busca, porque a base do estado continua sem publicar esta composição.</p>' +
          listaAlt;
        botoes.push({ texto: ic("editar") + " Cotar os insumos", classe: "primary", onClick: function () {
          UI.fecharModal(); self.verInsumos(String(rota.codigo));
        } });
      }
      UI.modal(titulo, corpo, botoes);
    },

    elaborarComposicao: function (descricao, opts) {
      var self = this, o = opts || {};
      var desc = String(descricao || "").trim();
      if (!desc) { UI.toast("Descreva o serviço para o agente elaborar.", "erro"); return; }
      var rodar = function () {
        var r = ComposicaoPropria.elaborar(desc, {
          analitico: Analitico.todos(),
          resolve: function (cod, fonte) { return self._cpResolve(cod, fonte); },
          precoOficial: function (cod) { return self._cpPrecoOficial(cod); },
          codigosExistentes: self._cpCodigosExistentes(),
          unidade: o.unidade || "", grupo: o.grupo || ""
        });
        if (!r.ok) {
          /* ⚠ RECUSA COM SAÍDA. O agente não montar é resultado legítimo —
             mas deixar o usuário sem próximo passo, não. */
          UI.modal((typeof Icones !== "undefined" ? Icones.get("alerta", 15) : "") + " Não consegui elaborar esta composição",
            '<p style="font-size:13px">' + Util.esc(r.erro) + '</p>' +
            ((r.alternativas || []).length
              ? '<p class="muted" style="font-size:12.5px">O mais próximo que achei foi: ' +
                r.alternativas.map(function (a) { return "<b>" + Util.esc(a.codigo) + "</b> " + Util.esc(String(a.descricao).slice(0, 60)); }).join(" · ") + '</p>'
              : "") +
            '<p class="muted" style="font-size:12px">O agente monta a partir de composição oficial parecida — ele não inventa insumo nem coeficiente. Sem base próxima, o caminho é montar à mão.</p>',
            [
              { texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); if (o.aoFechar) o.aoFechar(); } },
              { texto: "Montar à mão", classe: "primary", onClick: function () {
                UI.fecharModal(); self.criarComposicao(true);
                self._cp.comp.descricao = desc;
                if (o.etapa) { self._cp.addNaEtapa = o.etapa; self._cp.addNaSub = o.sub || ""; }
                self._cpRender();
              } }
            ]);
          return;
        }
        /* ⚠ TRÊS DIAGNÓSTICOS, TRÊS CONSERTOS — e a tela tratava os três como
           um só, sempre caindo no criador de composição própria.

           Medido em 23/08/2026 sobre 262 descrições reais do SINAPI MA: em
           208 (79%) a referência copiada JÁ TINHA PREÇO na base do estado. O
           usuário ganhava um PROP-xxxx congelado na competência de hoje no
           lugar de um código oficial que se atualiza sozinho — e foi assim
           que o banco do cliente juntou 65 clones.

           Nos outros casos a composição existe no analítico, com coeficiente
           oficial, e o que falta é preço de insumo neste estado: 2.050
           composições, 1.272 delas (62%) esperando UM único insumo. Cotar
           devolve a composição inteira; remontar joga fora a produtividade
           medida em campo.

           Montar a sua continua a um clique — mas deixa de ser o padrão para
           quem não precisa dela. */
        /* ⚠ A ROTA NÃO PODE SER OFERECIDA AQUI — e estar aqui matou o desempate.
           Medido: em 158 dos 208 casos "oficial" da amostra (76%) existe EMPATE
           TÉCNICO entre as análogas (score − alt0.score < 0,12), que é
           exatamente a condição criada na v1.1.221 para chamar a IA. Com o
           `return` antes deste bloco, o desempate nunca rodava e o primeiro
           colocado do ranking virava o código oferecido em destaque, calado.

           A doutrina é "IA só no resíduo, escolhendo entre códigos que o motor
           local achou". Decidir o resíduo por rank e não avisar é o oposto.

           A oferta passou para dentro de `abrir()`, que é o ponto por onde
           TODOS os caminhos passam — com IA, sem IA, com referência trocada. */
        /* REFORÇO DE IA (v1.1.221) — opcional por definição.
           Só entra quando há EMPATE TÉCNICO entre análogas: se a primeira
           ganha folgado, perguntar é gastar rede para confirmar o óbvio.
           Falha, timeout ou offline seguem para o resultado do motor sem
           reclamar — o agente nunca dependeu de rede e não vai passar a
           depender agora. */
        var alt0 = (r.alternativas || [])[0];
        var empate = alt0 && (r.referencia.score - alt0.score) < 0.12;
        var back = (typeof CONFIG !== "undefined" && CONFIG.iaBackend) ? CONFIG.iaBackend : "";
        if (!empate || !back || o.semIA) { abrir(r); return; }
        /* ⚠ v1.1.236 — o reforço demora até 6 s SEM overlay e SEM modal: para
           quem clicou, a tela simplesmente não mudou. É natural clicar
           "Elaborar" na linha seguinte (ou "Montar à mão"), começar a ajustar
           coeficientes — e então a resposta antiga chegava, `abrir()` chamava
           `criarComposicao(true)`, que zera `_cp` e reabre o modal SEM passar
           pela guarda de trabalho não salvo. O formulário em edição era
           destruído sem pergunta, com um toast que ainda parecia confirmação
           de sucesso. Carimbo de requisição: só a última pedida abre. */
        var elabId = (self._elabReq = (self._elabReq || 0) + 1);
        var abrirSeMinha = function (rr) { if (elabId === self._elabReq) abrir(rr); };
        var ctrl = null;
        try { ctrl = new AbortController(); setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, 6000); } catch (e) {}
        fetch(back + "/ia/composicao", {
          method: "POST", signal: ctrl ? ctrl.signal : undefined,
          headers: { "Content-Type": "application/json", "x-licenca": (typeof Licenca !== "undefined" ? Licenca.chave() : "") },
          body: JSON.stringify({
            descricao: desc,
            candidatas: [r.referencia].concat(r.alternativas || []).map(function (a) {
              return { codigo: a.codigo, descricao: a.descricao, unidade: a.unidade };
            })
          })
        }).then(function (resp) { return resp.json(); }).then(function (j) {
          var ref = ComposicaoPropria.aplicarReforcoIA(r, (j && j.resultado) || j);
          if (ref.trocarPara) {
            /* refaz pelo MOTOR com a referência que a IA escolheu: a estrutura
               continua vindo da base, só o alvo mudou */
            var r2 = ComposicaoPropria.elaborar(desc, {
              analitico: Analitico.todos(),
              resolve: function (cod, fonte) { return self._cpResolve(cod, fonte); },
              precoOficial: function (cod) { return self._cpPrecoOficial(cod); },
              codigosExistentes: self._cpCodigosExistentes(),
              unidade: o.unidade || "", grupo: o.grupo || "",
              forcarReferencia: ref.trocarPara.codigo
            });
            if (r2.ok) { r2.viaIA = true; if (ref.descricaoSugerida) r2.comp.descricao = ref.descricaoSugerida; abrirSeMinha(r2); return; }
          }
          if (ref.descricaoSugerida) { r.comp.descricao = ref.descricaoSugerida; r.viaIA = true; }
          abrirSeMinha(r);
        }).catch(function () { abrirSeMinha(r); });   // offline/timeout: segue com o motor
        return;
      };
      var abrir = function (r) {
        /* ⚠ A OFERTA DE ROTA MORA AQUI, e não lá em cima. Este é o ponto por
           onde TODOS os caminhos passam: sem empate, com empate resolvido pela
           IA, e com a referência trocada pela IA. Oferecendo antes do
           desempate, o código em destaque era só o primeiro do ranking. */
        /* so "oficial" e "cotar" abrem tela: nos dois o caminho certo NAO e o
           criador. "calculada" monta a partir da referencia mesmo — o aviso
           de elaborar() ja diz que o preco e soma de insumos, e ele aparece
           no toast. "propria" e o caso do criador, sem desvio. */
        if (r.rota && (r.rota.tipo === "oficial" || r.rota.tipo === "cotar")
            && !o.rotaJaDecidida) {
          self._cpOferecerRota(r, desc, o, abrir);
          return;
        }
        /* abre no criador, no passo 2, com a estrutura montada — é lá que o
           usuário confere coeficiente por coeficiente antes de gravar */
        self.criarComposicao(true);
        var c = self._cp.comp;
        c.codigo = r.comp.codigo; c.descricao = r.comp.descricao; c.unidade = r.comp.unidade;
        c.grupo = r.comp.grupo; c.maoDeObra = r.comp.maoDeObra; c.metodo = r.comp.metodo;
        c.observacao = r.comp.observacao; c.insumos = r.comp.insumos;
        self._cp.referencia = { codigo: r.referencia.codigo, descricao: r.referencia.descricao };
        self._cp.passo = 2;
        if (o.etapa) { self._cp.addNaEtapa = o.etapa; self._cp.addNaSub = o.sub || ""; }
        self._cpRender();
        UI.toast("Composição " + c.codigo + " elaborada a partir da " + r.referencia.codigo +
          " (" + Util.fmtMoeda(r.custo.total) + "/" + c.unidade + ") — " +
          (r.aviso || "confira os coeficientes e grave."),
          /* ⚠ ROTA "calculada" NUNCA SAI EM VERDE. Ela quer dizer que a base
             NAO publica o preco fechado desta composicao naquela UF e o custo
             e a soma dos insumos — informacao que muda como a peca e
             defendida. Sair com toast de sucesso era enterrar o aviso no
             lugar onde ninguem para para ler. */
          (r.confianca === "alta" && !(r.rota && r.rota.tipo === "calculada")) ? "ok" : "erro");
      };
      if (typeof Analitico !== "undefined" && Analitico.carregado) { rodar(); return; }
      var urls = this._prepararAnalitico();
      UI.loading("Carregando a base analítica para o agente…");
      Analitico.carregarArquivo(urls.alts)
        .then(function () { UI.loadingFim(); rodar(); })
        .catch(function () { UI.loadingFim(); UI.toast("Não consegui carregar o detalhamento — o agente precisa dele para não inventar coeficiente.", "erro"); });
    },

    /* v1.1.124 — busca do editor sem resultado bom → cria a composição JÁ com a
     * descrição digitada e, ao gravar, o item entra na etapa de origem. */
    criarComposicaoDaBusca: function (q) {
      var etapa = this._addItemEtapaId || null, sub = this._addItemSubId || "";
      this.criarComposicao(true);
      this._cp.comp.descricao = String(q || "").trim();
      this._cp.addNaEtapa = etapa;
      // destino da sub etapa: sem isto o item nasce SOLTO e empurra o grupo de 1.1 p/ 1.2
      this._cp.addNaSub = sub;
      this._cpRender();
    },
    /* v1.1.124 — busca do editor filtrada em "Só insumos" sem resultado: o atalho
     * certo é cadastrar um INSUMO próprio (não uma composição). Modal leve com os
     * campos do Gestao; ao salvar, o insumo entra na etapa (respeitando o limite). */
    criarInsumoDaBusca: function (q) {
      var self = this, etapa = this._addItemEtapaId || null, subDest = this._addItemSubId || "";
      var campos = (typeof Gestao !== "undefined" && Gestao._insumoProprioCampos)
        ? Gestao._insumoProprioCampos("bsi", false)
        : '<div class="field"><label>Descrição *</label><input id="bsi-desc"></div><div class="row"><div class="field" style="max-width:110px"><label>Unidade *</label><input id="bsi-und" value="un"></div><div class="field"><label>Preço (R$)</label><input id="bsi-preco"></div></div><select id="bsi-cat" style="display:none"><option value="MAT" selected>MAT</option></select>';
      UI.modal("Cadastrar insumo próprio", '<p class="muted" style="font-size:12px">Material/serviço que não está nas bases oficiais. Ganha código <b>PROP</b>, entra nas buscas e, se houver preço, já entra na planilha.</p>' + campos, [
        { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
        { texto: "Salvar" + (etapa ? " e adicionar à planilha" : ""), classe: "success", onClick: function () {
          var d = (typeof Gestao !== "undefined" && Gestao._insumoProprioColeta) ? Gestao._insumoProprioColeta("bsi")
            : { descricao: (UI.el("bsi-desc") || {}).value || "", unidade: (UI.el("bsi-und") || {}).value || "un", categoria: "MAT", preco: Util.num((UI.el("bsi-preco") || {}).value) };
          var item = self.salvarInsumoProprio(d);
          if (!item) return; // inválido — modal fica aberto
          if (etapa && self.orcAtual && (self.orcAtual.etapas || []).some(function (e) { return e.id === etapa; })) {
            self.expandirEtapa(etapa, subDest); // idem: item novo não pode nascer invisível
            if (Orcamento.totais(self.orcAtual).qtdItens >= Auth.limite("limiteItensPorOrcamento")) {
              UI.toast("Insumo salvo, mas não entrou na planilha: limite de itens do plano atingido.", "erro");
            } else {
              // 5º argumento = destino: "+ Item" clicado na linha de uma sub etapa tem
              // que lançar DENTRO dela. Sem isso o item nascia solto e empurrava o
              // grupo inteiro de 1.1 para 1.2 na planilha entregue.
              Orcamento.addItem(self.orcAtual, etapa, { codigo: item.codigo, descricao: item.descricao, unidade: item.unidade, custoUnitario: item.custoUnitario, custoMO: item.custoMO, custoMAT: item.custoMAT, custoEQ: item.custoEQ, baseFonte: "PROPRIA" }, 1, subDest);
              self.persistir(); self.render();
            }
          }
          UI.fecharModal();
        } }
      ]);
      var dsc = UI.el("bsi-desc"); if (dsc) { dsc.value = String(q || "").trim(); dsc.focus(); }
    },
    /* v1.1.124 — "quero ESTA composição, mas do meu jeito": clona a estrutura
     * oficial aberta no detalhamento p/ uma própria (coeficientes editáveis). */
    criarVersaoPropria: function (codigo) {
      var self = this;
      var ref = (typeof Analitico !== "undefined") ? Analitico.obter(String(codigo)) : null;
      if (!ref) { UI.toast("Detalhamento de " + codigo + " não está carregado — abra o " + (typeof Icones !== "undefined" ? Icones.get("buscar", 15) : "") + " Insumos primeiro.", "erro"); return; }
      this.criarComposicao(true);
      var prop = ComposicaoPropria.daReferencia(ref, { resolve: function (cod, fonte) { return self._cpResolve(cod, fonte); } });
      var c = this._cp.comp;
      c.descricao = String(ref.descricao || "");
      c.unidade = String(prop.unidade || "").toLowerCase();
      c.grupo = ComposicaoPropria.grupoDoCriador(prop.grupo);
      c.maoDeObra = prop.maoDeObra;
      c.insumos = prop.insumos;
      c.observacao = prop.observacao;
      this._cp.referencia = ref;
      this._cp.passo = 2;
      this._cpRender();
      UI.toast("Estrutura da " + ref.codigo + " copiada — ajuste os coeficientes e grave como SUA composição (código próprio).", "ok");
    },

    // ---------- Escopo Inteligente ----------
    abrirEscopo: function () {
      if (!Auth.podeUsar("escopoIA")) { UI.toast("Escopo Inteligente é recurso PRO.", "erro"); return; }
      if (!Sinapi.carregado) { UI.toast("Base SINAPI ainda carregando…", "erro"); return; }
      var self = this;
      this._escopo = null;
      UI.modal("" + (typeof Icones !== "undefined" ? Icones.get("escopo", 15) : "") + " Escopo Inteligente", UI.renderEscopoEntrada(), [
        { texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } }
      ]);
      setTimeout(function () { var t = UI.el("esc-txt"); if (t) t.focus(); }, 50);
    },

    /* Mostra os auxiliares que a boa técnica exige. Vêm MARCADOS (é o pedido:
     * com pouca informação, trazer o serviço inteiro), mas com o "porquê" à
     * vista e com desmarcar em massa — apagar tem de ser barato. */
    escopoSugerir: function () {
      var box = UI.el("esc-aux"), txt = (UI.el("esc-txt") || {}).value || "";
      if (!box) return;
      var nivel = (UI.el("esc-nivel") || {}).value || "padrao";
      var aux = Escopo.auxiliaresPara(txt, nivel);
      if (!aux.length) {
        box.innerHTML = '<div class="muted" style="font-size:12px;margin-bottom:6px">' +
          (nivel === "enxuto" ? "Nível enxuto: nenhum complemento é sugerido."
            : "Nenhum complemento a sugerir para o que está escrito.") + '</div>';
        return;
      }
      this._escAux = aux;
      box.innerHTML = '<div class="card" style="padding:9px 12px;margin-bottom:8px">' +
        '<div class="flex between" style="margin-bottom:6px"><b style="font-size:12.5px">A boa técnica também pede:</b>' +
          '<button type="button" class="btn sm ghost" data-acao="escopo-aux-nenhum">Desmarcar todos</button></div>' +
        aux.map(function (a, i) {
          return '<label style="display:block;cursor:pointer;padding:3px 0;font-size:12.5px">' +
            '<input type="checkbox" class="esc-aux-ck" data-i="' + i + '" checked> <b>' + Util.esc(a.termo) + '</b>' +
            ' <span class="muted">— ' + Util.esc(a.porque) + '</span></label>';
        }).join("") +
        '<button type="button" class="btn sm success" data-acao="escopo-aux-add" style="margin-top:6px">Somar ao escopo</button></div>';
    },
    escopoAuxNenhum: function () {
      Array.prototype.forEach.call(document.querySelectorAll(".esc-aux-ck"), function (c) { c.checked = false; });
    },
    /* Soma ao TEXTO, não ao orçamento: o usuário ainda vai analisar e revisar.
     * Nada entra na planilha sem passar pela revisão de sempre. */
    escopoAuxAdd: function () {
      var t = UI.el("esc-txt"); if (!t || !this._escAux) return;
      var escolhidos = [];
      Array.prototype.forEach.call(document.querySelectorAll(".esc-aux-ck"), function (c) {
        if (c.checked) { var a = App._escAux[+c.getAttribute("data-i")]; if (a) escolhidos.push(a.termo); }
      });
      if (!escolhidos.length) { UI.toast("Nenhum complemento marcado.", "erro"); return; }
      t.value = String(t.value || "").replace(/\s*$/, "") + "\n" + escolhidos.join("\n");
      UI.el("esc-aux").innerHTML = "";
      this._escAux = null;
      UI.toast(escolhidos.length + " complemento(s) somado(s) ao escopo — revise antes de analisar.", "ok");
      t.focus();
    },
    /* PLANTA (DXF) e MEMORIAL (PDF) viram escopo (v1.1.222).
     *
     * ⚠ NÃO ACEITA .dwg, de propósito. DWG é binário fechado da Autodesk e
     * não se lê no navegador. Aceitar a extensão e falhar depois seria
     * prometer o que o produto não cumpre — pior que não oferecer. O aviso
     * diz como exportar em DXF, que é um comando no AutoCAD.
     *
     * ⚠ LÊ O QUE ESTÁ ESCRITO, não mede o desenho: área calculada de traço
     * aberto sai errada em silêncio; a etiqueta é o que o projetista assinou. */
    escopoDocumento: function () {
      var self = this;
      var inp = document.createElement("input");
      inp.type = "file"; inp.accept = ".dxf,.pdf,.dwg"; inp.style.display = "none";
      inp.onchange = function () {
        var f = inp.files && inp.files[0]; if (!f) return;
        var nome = String(f.name || "").toLowerCase();
        if (/\.dwg$/.test(nome)) {
          UI.modal((typeof Icones !== "undefined" ? Icones.get("alerta", 15) : "") + " DWG não dá para ler aqui",
            '<p style="font-size:13px">O <b>DWG</b> é um formato fechado da Autodesk — nenhum navegador lê sem o AutoCAD instalado. ' +
            'Prometer que lê e falhar depois seria pior do que dizer isto agora.</p>' +
            '<p class="muted" style="font-size:12.5px">No AutoCAD: <b>Salvar como → DXF</b>. ' +
            'O DXF sai do mesmo desenho, com as mesmas etiquetas de ambiente — e esse eu leio.</p>',
            [{ texto: "Entendi", classe: "primary", onClick: function () { UI.fecharModal(); } }]);
          return;
        }
        var aplicar = function (r, rotulo) {
          if (!r.ok) { UI.toast(r.erro, "erro"); return; }
          var t = UI.el("esc-txt"); if (!t) return;
          var antes = String(t.value || "").trim();
          t.value = (antes ? antes + "\n" : "") + r.texto;
          UI.toast(r.ambientes.length + " ambiente(s) do " + rotulo + " · " +
            Util.fmtNum(r.total, 2) + " m² no total — escolha o serviço de cada um e analise.", "ok");
          t.focus();
        };
        if (/\.dxf$/.test(nome)) {
          var fr = new FileReader();
          fr.onload = function () {
            try {
              var p = DXF.parse(String(fr.result));
              aplicar(Escopo.daPlantaDXF(p), "desenho");
            } catch (e) { UI.toast("Não consegui ler o DXF: " + ((e && e.message) || e), "erro"); }
          };
          fr.onerror = function () { UI.toast("Falha ao ler o arquivo.", "erro"); };
          fr.readAsText(f);
          return;
        }
        if (typeof Gestao === "undefined" || !Gestao._pdfTexto) { UI.toast("Leitor de PDF indisponível.", "erro"); return; }
        UI.toast("Lendo o PDF…", "ok");
        Gestao._pdfTexto(f, function (texto) {
          if (!texto) { UI.toast("Não consegui extrair texto deste PDF — se for uma imagem escaneada, não há texto para ler.", "erro"); return; }
          aplicar(Escopo.deTextos(String(texto).split(/\r?\n/)), "documento");
        });
      };
      document.body.appendChild(inp); inp.click(); setTimeout(function () { try { inp.remove(); } catch (e) {} }, 0);
    },

    /* Planilha do arquiteto vira texto de escopo. Reusa o leitor que já existe
     * (.xlsx, .xls e .csv) — nada de leitor novo. */
    escopoPlanilha: function () {
      var self = this;
      var inp = document.createElement("input");
      inp.type = "file"; inp.accept = ".xlsx,.xls,.csv"; inp.style.display = "none";
      inp.onchange = function () {
        var f = inp.files && inp.files[0]; if (!f) return;
        UI.toast("Lendo a planilha…", "ok");
        self._lerPlanilha(f, function (matriz, erro) {
          if (erro || !matriz) { UI.toast("Não consegui ler: " + (erro || "vazia"), "erro"); return; }
          var r = Escopo.daMatriz(matriz);
          if (!r.ok) { UI.toast(r.erro, "erro"); return; }
          var t = UI.el("esc-txt"); if (!t) return;
          var antes = String(t.value || "").trim();
          t.value = (antes ? antes + "\n" : "") + r.texto;
          UI.toast(r.linhas.length + " serviço(s) trazido(s) da planilha" +
            (r.ignoradas ? " (" + r.ignoradas + " linha(s) de total/cabeçalho ignorada(s))" : "") +
            " — revise antes de analisar.", "ok");
          t.focus();
        });
      };
      document.body.appendChild(inp); inp.click(); setTimeout(function () { try { inp.remove(); } catch (e) {} }, 0);
    },
    analisarEscopo: function () {
      var txt = (UI.el("esc-txt") || {}).value || "";
      if (!Util.naoVazio(txt)) { UI.toast("Cole o escopo primeiro.", "erro"); return; }
      this._escopo = Escopo.analisar(txt, { excluirFontes: this._fontesExcluidas() });
      if (!this._escopo.length) { UI.toast("Nenhuma linha reconhecida.", "erro"); return; }

      var self = this;
      var body = UI.renderEscopoResultado(this._escopo, this.orcAtual.etapas);
      // reabre o modal com o resultado + rodapé de confirmação
      var bg = UI.modal("" + (typeof Icones !== "undefined" ? Icones.get("escopo", 15) : "") + " Escopo Inteligente — revisão", body, [
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
        var etapaDaLinha = etapaParaLinha(l, item);
        Orcamento.addItem(this.orcAtual, etapaDaLinha, item, l.quantidade);
        this.expandirEtapa(etapaDaLinha); // lote do Escopo: item invisível vira "não lançou"
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
      /* ⚠ v1.1.236 — A RESPOSTA VOLTA PARA O ORÇAMENTO QUE A PEDIU, e para
         nenhum outro. A chamada leva de 15 a 45 s mostrando só um toast: o app
         inteiro continua navegável. Quem acha que travou fecha o modal, volta
         para a lista e abre OUTRO orçamento — e o `.then` montava o modal de
         revisão com as etapas de quem estivesse aberto na hora. Um clique em
         "Adicionar selecionados" e o escopo inteiro da obra A entrava no
         orçamento B, com preços e etapas criadas lá. Voltando para a LISTA era
         pior de outro jeito: `orcAtual` nulo estourava TypeError e o catch
         culpava a rede ("veja o Console, ERP na porta 3040?") — e a porta 3040 e do
         trabalho da IA perdido.
         Carimbo duplo: o id do orçamento e um contador de requisição — o
         contador também descarta a resposta velha quando o usuário manda
         analisar duas vezes seguidas no MESMO orçamento. */
      var reqId = (this._escReq = (this._escReq || 0) + 1);
      var orcId = this.orcAtual ? this.orcAtual.id : "";
      var meuTurno = function () {
        return reqId === self._escReq && self.orcAtual && self.orcAtual.id === orcId;
      };
      UI.toast("" + (typeof Icones !== "undefined" ? Icones.get("ia", 15) : "") + " Estruturando o escopo com a IA do ERP…", "ok");
      fetch(back + "/ia/orcamento", { method: "POST", headers: { "Content-Type": "application/json", "x-licenca": (typeof Licenca !== "undefined" ? Licenca.chave() : "") }, body: JSON.stringify({ descricao: txt }) })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!meuTurno()) { UI.toast("O escopo estruturado pela IA foi descartado: você saiu do orçamento que o pediu.", "erro"); return; }
          if (!j.ok || !j.resultado) { UI.toast("IA: " + (j.error || "não retornou estrutura"), "erro"); return; }
          self._escopo = Escopo.analisarItensIA(j.resultado.etapas || [], { excluirFontes: self._fontesExcluidas() });
          if (!self._escopo.length) { UI.toast("A IA não retornou itens.", "erro"); return; }
          self._escopoIA = true;
          var ok = self._escopo.filter(function (l) { return l.escolhido > -1; }).length;
          UI.toast("✅ " + self._escopo.length + " serviços estruturados (" + ok + " com sugestão). Use " + (typeof Icones !== "undefined" ? Icones.get("alvo", 15) : "") + " Refinar p/ a IA escolher o código exato.", "ok");
          self._mostrarEscopoResultado(0);
        })
        .catch(function (e) { console.error("[Escopo IA] FALHOU:", e); UI.toast("Escopo IA falhou: " + (e && e.message ? e.message : e) + " — confira a internet e a licença. Detalhe no Console (F12).", "erro"); });
    },

    // 2º passo (opcional): IA escolhe o código EXATO. Em LOTES, só os ainda NÃO refinados,
    // e PARA ao bater o limite/min da IA grátis (o usuário clica de novo p/ continuar).
    _casarEscopoIA: function (back) {
      var an = this._escopo || [];
      /* ⚠ A IA NAO PODE DESFAZER O QUE A PESSOA CONFIRMOU. Tirar
         `refinadoIA = true` do aceite do modal foi conserto certo pelo motivo
         errado: aquela flag significa "a IA ja passou por aqui", e usa-la para
         selar uma escolha humana misturava duas coisas. So que sem NENHUMA
         marca, a linha voltava para o lote e a IA trocava o codigo que o
         usuario acabara de aprovar num modal. Duas marcas, dois sentidos. */
      var pares = an.filter(function (l) {
        return l.candidatos && l.candidatos.length && !l.refinadoIA
               && !l.decididoPeloUsuario;
      });
      var res = { refinados: 0, limite: false, restam: 0 };
      if (!pares.length) return Promise.resolve(res);
      var CHUNK = 6, lotes = [];
      for (var k = 0; k < pares.length; k += CHUNK) lotes.push(pares.slice(k, k + CHUNK));
      return lotes.reduce(function (p, lote) {
        return p.then(function () {
          if (res.limite) return; // já bateu o limite: para
          /* ⚠ SEM CUSTO no payload (crítica ia-seguranca, item 17): o provedor
             é externo e escolher o código não precisa do preço. O servidor já
             descarta o custo, mas até lá ele saía do aparelho. */
          var payload = lote.map(function (l) {
            return { descricao: l.textoOriginal, unidade: l.unidade || "", candidatos: l.candidatos.slice(0, 2).map(function (c) { return { codigo: c.item.codigo, descricao: String(c.item.descricao || "").slice(0, 70), unidade: c.item.unidade }; }) };
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
        res.restam = an.filter(function (l) { return l.candidatos && l.candidatos.length && !l.refinadoIA && !l.decididoPeloUsuario; }).length;
        return res;
      });
    },
    // botão "🎯 Refinar com IA" na revisão do escopo
    refinarEscopoCasar: function () {
      var self = this, back = (typeof CONFIG !== "undefined" && CONFIG.iaBackend) ? CONFIG.iaBackend : "http://localhost:3041";
      /* mesma trava do analisarEscopoIA, e aqui ela pesa ainda mais: o refino
         roda em LOTES e pode levar minutos, sobrando tempo de sobra para o
         usuário sair do orçamento */
      var reqId = (this._escReq = (this._escReq || 0) + 1);
      var orcId = this.orcAtual ? this.orcAtual.id : "";
      UI.toast("" + (typeof Icones !== "undefined" ? Icones.get("alvo", 15) : "") + " Refinando os matches com a IA…", "ok");
      this._casarEscopoIA(back).then(function (r) {
        if (reqId !== self._escReq || !self.orcAtual || self.orcAtual.id !== orcId) {
          UI.toast("O refino da IA foi descartado: você saiu do orçamento que o pediu.", "erro"); return;
        }
        var msg = r.refinados + " serviços refinados pela IA.";
        if (r.limite) msg += " ⏳ Limite da IA grátis/min atingido — restam " + r.restam + ", clique de novo daqui ~1 min.";
        UI.toast(msg, r.limite ? "erro" : "ok");
        self._mostrarEscopoResultado(r.refinados);
      });
    },

    _mostrarEscopoResultado: function (refinados) {
      var self = this;
      var body = UI.renderEscopoResultado(this._escopo, this.orcAtual.etapas);
      var bg = UI.modal("" + (typeof Icones !== "undefined" ? Icones.get("escopo", 15) : "") + " Escopo (IA) — revisão · " + this._escopo.length + " serviços" + (refinados ? " · 🎯 " + refinados + " confirmados pela IA" : ""), body, [
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
        UI.toast("Faltam dados: " + val.faltando.join(", ") + ". Abra " + (typeof Icones !== "undefined" ? Icones.get("ajustes", 15) : "") + " Dados.", "erro");
        return;
      }
      // LOTE 4: avisos NÃO-bloqueantes de acabamento — proposta sai, mas o usuário sabe
      try {
        if (typeof Empresa !== "undefined" && !Empresa.logo()) UI.toast("Sem logo em " + (typeof Icones !== "undefined" ? Icones.get("ajustes", 15) : "") + " Empresa — a capa sai com [LOGO]. Suba o logo p/ proposta 100% profissional.", "erro");
        var _c = this.orcAtual.comercial || {};
        if (!Util.naoVazio(_c.apresentacao)) UI.toast("Apresentação em " + (typeof Icones !== "undefined" ? Icones.get("ajustes", 15) : "") + " Dados vazia — saiu o texto padrão. Personalize p/ este cliente.", "erro");
      } catch (eAv) {}
      /* =====================================================================
       * COM QUAL DESENHO? — os Modelos de Proposta chegam ao orçamento
       *
       * ⚠ O MODELO NÃO SE IMPÕE, e a regra é a mesma da carpintaria: quem
       *   nunca abriu "Modelos de Proposta" não tem modelo nenhum e continua
       *   recebendo o documento de sempre. Trocar o desenho da proposta de
       *   alguém sem que a pessoa tenha pedido é surpresa que ela descobre
       *   com o cliente na frente.
       *
       * ⚠ E O CAMINHO ANTIGO CONTINUA SENDO O PRIMEIRO DA LISTA: "Documento
       *   padrão do sistema" vem antes dos modelos, marcado quando não há
       *   sugestão. Um recurso novo que empurra o antigo para o rodapé é o
       *   jeito de quebrar quem já estava satisfeito.
       * =================================================================== */
      var self = this;
      var modelos = [];
      try {
        if (typeof PropTpl !== "undefined" && typeof Store !== "undefined") {
          modelos = Store.listar(Auth.empresaId(), "prop_modelos") || [];
        }
      } catch (eMd) { modelos = []; }
      if (!modelos.length) { this._propostaClassica(); return; }

      var cliId = "";
      try { cliId = Proposta.clienteIdDoOrcamento(this.orcAtual); } catch (eC) {}
      var sug = null;
      try { sug = (typeof Gestao !== "undefined" && Gestao.propModeloPara) ? Gestao.propModeloPara(cliId) : null; } catch (eS) {}
      var sugId = sug ? sug.id : "";

      UI.modal("Com qual desenho?",
        '<p class="muted">O conteúdo e os preços são os mesmos; muda o layout do papel.</p>'
        + '<label style="display:flex;gap:9px;align-items:flex-start;padding:9px;border:1px solid var(--linha);border-radius:5px;margin-bottom:7px;cursor:pointer">'
        + '<input type="radio" name="opl" value=""' + (sugId ? "" : " checked") + ' style="margin-top:3px">'
        + "<span><b>Documento padrão do sistema</b><br><span class=\"muted\" style=\"font-size:12.5px\">Capa, apresentação, escopo, metodologia, condições e assinatura.</span></span></label>"
        + modelos.map(function (mm) {
            var m2 = PropTpl.modelo(mm);
            return '<label style="display:flex;gap:9px;align-items:flex-start;padding:9px;border:1px solid var(--linha);border-radius:5px;margin-bottom:7px;cursor:pointer">'
              + '<input type="radio" name="opl" value="' + Util.esc(mm.id) + '"' + (mm.id === sugId ? " checked" : "") + ' style="margin-top:3px">'
              + "<span><b>" + Util.esc(m2.nome) + "</b>"
              + (mm.id === sugId ? ' <span class="g-pill" style="background:#16a34a22;color:#16a34a;font-weight:700;font-size:10.5px">sugerido</span>' : "")
              + '<br><span class="muted" style="font-size:12.5px">' + Util.esc(m2.descricao || (m2.paginas.length + " páginas")) + "</span></span></label>";
          }).join(""),
        [
          { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
          { texto: "Gerar", classe: "primary", onClick: function () {
              var sel = document.querySelector('input[name="opl"]:checked');
              var escolhido = sel ? sel.value : "";
              UI.fecharModal();
              if (!escolhido) { self._propostaClassica(); return; }
              self._propostaPorModelo(escolhido);
          } }
        ]);
    },

    /* o documento de sempre — o caminho que existia antes dos modelos */
    _propostaClassica: function () {
      this._iaLimparNaProposta();   // o documento vai ao cliente: o desfazer da IA não atravessa
      this._abrirPrint("Proposta — " + this.orcAtual.numero, Proposta.gerarHTML(this.orcAtual, Auth.usuario()), "nota");
    },

    /* o documento desenhado pelo modelo que o usuário montou */
    _propostaPorModelo: function (modeloId) {
      var orc = this.orcAtual;
      var raw = null;
      try { raw = Store.obter(Auth.empresaId(), "prop_modelos", modeloId); } catch (e) {}
      if (!raw) { UI.toast("Modelo não encontrado.", "erro"); return; }
      this._iaLimparNaProposta();   // o documento vai ao cliente: o desfazer da IA não atravessa
      var m = PropTpl.modelo(raw);
      var temEmp = typeof Empresa !== "undefined";
      var c = orc.comercial || {};
      var hoje = Util.agoraISO().slice(0, 10);

      Gestao._propModImagens(m, function (imgs) {
        var dados = {
          empresa: temEmp && Empresa.dados ? Empresa.dados() : {},
          logoHTML: temEmp && Empresa.logoHTML ? Empresa.logoHTML(120) : "",
          cliente: (orc.cliente && orc.cliente.nome) || "",
          obra: orc.nome || "",
          numero: orc.numero || "",
          data: hoje,
          /* a validade agora tem DATA (js/proposta.js): o texto sai pronto,
             ancorado no envio quando ele existe */
          validade: (function () { var v = Proposta.validade(orc, Util.agoraISO()); return { texto: v.texto, ate: v.ateBR || "", vencida: !!v.vencida }; })(),
          /* calculado por Orcamento.cronograma; o motor só desenha.
             A página de cronograma pode pedir outra régua (6 semanas em vez
             de 1 mês) — quem calcula é aqui, porque o motor não faz conta. */
          cronograma: Proposta.cronogramaParaModelo(orc, (function () {
            var pg = (m.paginas || []).filter(function (x) { return x.tipo === "cronograma"; })[0];
            var n = pg ? Util.num(pg.periodos) : 0;
            return n > 0 ? n : null;
          })()),
          blocos: Proposta.blocosParaModelo(orc),
          comercial: Proposta.comercialParaModelo(orc),
          /* links que o modelo pode transformar em botão (ver bloco Contato) */
          links: { planilha: String(c.linkPlanilha || "").trim() },
          imagens: imgs,
          tituloDoc: "Proposta — " + (orc.numero || orc.nome || "")
        };
        /* ⚠ o auditor é o DO ORÇAMENTO: ele sabe quais números são custo e
           quais são os preços que o papel deve mostrar. Sem ele, o motor cai
           na varredura grossa de palavras e um custo passa como número. */
        Gestao.propModImprimir(m, dados, function (html) { return Proposta.auditar(html, orc); });
      });
    },

    // Anexo Técnico de Orçamento p/ LAUDO pericial (não comercial)
    gerarLaudo: function () {
      if (this._trialBloqueado()) { this._avisoTrial(); return; }
      if (!Auth.podeUsar("proposta")) { UI.toast("Anexo p/ laudo é recurso PRO.", "erro"); return; }
      var val = Laudo.validar(this.orcAtual);
      if (!val.ok) { UI.toast("Faltam dados: " + val.faltando.join(", "), "erro"); return; }
      this._abrirPrint("Anexo de Orçamento p/ Laudo — " + this.orcAtual.numero, Laudo.gerarHTML(this.orcAtual, Auth.usuario()), "nota");
    },

    // Relatório técnico completo: sintético + analítico detalhado
    gerarRelatorio: function () {
      if (this._trialBloqueado()) { this._avisoTrial(); return; }
      var t = Orcamento.totais(this.orcAtual);
      if (t.qtdItens < 1) { UI.toast("Adicione itens antes de gerar o relatório.", "erro"); return; }
      var self = this;
      function abrir() {
        self._abrirPrint("Relatório de Orçamento — " + self.orcAtual.numero,
          UI.renderRelatorioCompleto(self.orcAtual, Auth.usuario()), "relatorio");
      }
      /* Carrega o analítico DO ORÇAMENTO (1ª vez) p/ incluir a seção de
         composições e insumos; degrada sem travar. Até a 1.2.30 usava a UF do
         ambiente — mesmo defeito do Excel: relatório de MG com insumos de PA
         porque o app estava consultando outro estado. */
      this._analiticoDoOrc(this.orcAtual, abrir);
    },

    // ---------- AGENTE IMPORTADOR: planilha (Excel/CSV) de qualquer formato → etapas+itens ----------
    /* RECUPERAR ≠ IMPORTAR (v1.1.212). Duas ações que pareciam uma só:
     * importar é ler planilha de TERCEIRO por heurística; recuperar é devolver
     * o que ESTE sistema gravou, sem adivinhar nada. Quem perdeu um orçamento
     * procura "recuperar" e passava reto pelo botão que resolvia o problema.
     * Aqui a promessa é estreita de propósito: arquivo sem a marca do sistema
     * é recusado COM SAÍDA, não empurrado para a heurística por baixo. */
    recuperarPlanilha: function () {
      var self = this;
      var inp = document.createElement("input");
      inp.type = "file"; inp.accept = ".xlsx"; inp.style.display = "none";
      inp.onchange = function () {
        var f = inp.files && inp.files[0]; if (!f) return;
        if (f.size > 25 * 1024 * 1024) { UI.toast("Planilha muito grande (máx. 25 MB).", "erro"); return; }
        UI.toast("Procurando o orçamento dentro da planilha…", "ok");
        self._lerPlanilha(f, function (matriz, erro, meta) {
          if (erro) { UI.toast("Não consegui ler a planilha: " + erro, "erro"); return; }
          if (meta && meta.snapshot) { self._abrirRestaurarSnapshot(meta.snapshot, f.name, matriz, meta); return; }
          /* sem a marca: dizer POR QUE e oferecer o outro caminho, em vez de
             um "não deu" seco que deixa o usuário sem próximo passo */
          UI.modal((typeof Icones !== "undefined" ? Icones.get("alerta", 15) : "") + " Esta planilha não foi gerada por este sistema",
            '<p style="font-size:13px">O arquivo <b>' + Util.esc(f.name) + '</b> não tem a marca que o OrçaPRO grava ao exportar — ' +
            'então não há um orçamento pronto dentro dele para recuperar.</p>' +
            '<p class="muted" style="font-size:12.5px">Isso acontece quando o Excel foi <b>refeito ou salvo por outro programa</b> ' +
            '(Google Sheets, LibreOffice, "salvar como" de outro formato), ou quando a planilha é de outra origem. ' +
            'Nesse caso dá para ler os itens por leitura assistida — mas aí é leitura de planilha comum: ' +
            'as etapas e os códigos são detectados, e o que não casar você revisa antes de entrar.</p>',
            [
              { texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
              { texto: "Ler como planilha comum", classe: "primary", onClick: function () {
                UI.fecharModal();
                if (!matriz || !matriz.length) { UI.toast("A planilha está vazia.", "erro"); return; }
                var res = Importador.analisar(matriz);
                self._imp = { matriz: matriz, nome: f.name, res: res, abas: (meta && meta.abas) || null, abaIdx: (meta && meta.idx) || 0 };
                self._abrirImportPreview();
              } }
            ]);
          UI.modalConsulta();
        });
      };
      document.body.appendChild(inp); inp.click(); setTimeout(function () { try { inp.remove(); } catch (e) {} }, 0);
    },
    importarPlanilha: function () {
      var self = this;
      var inp = document.createElement("input");
      inp.type = "file"; inp.accept = ".xlsx,.xls,.csv"; inp.style.display = "none";
      inp.onchange = function () {
        var f = inp.files && inp.files[0]; if (!f) return;
        if (f.size > 25 * 1024 * 1024) { UI.toast("Planilha muito grande (máx. 25 MB). Reduza ou divida o arquivo.", "erro"); return; }
        UI.toast("Lendo a planilha…", "ok");
        self._lerPlanilha(f, function (matriz, erro, meta) { self._aoLerPlanilha(f, matriz, erro, meta); });
      };
      document.body.appendChild(inp); inp.click(); setTimeout(function () { try { inp.remove(); } catch (e) {} }, 0);
    },
    /* O que fazer com a planilha lida. Separado do <input> para a e2e
       (tools/e2e-import-planilha-completa.js) entrar pela MESMA porta que o clique —
       montar a tela na mão provaria a tela, não o caminho até ela. */
    _aoLerPlanilha: function (f, matriz, erro, meta) {
      var self = this;
      if (erro || !matriz || !matriz.length) { UI.toast("Não consegui ler a planilha: " + (erro || "vazia"), "erro"); return; }
      // planilha gerada por este app: o orçamento inteiro está na _meta
      if (meta && meta.snapshot) { self._abrirRestaurarSnapshot(meta.snapshot, f.name, matriz, meta); return; }
      /* ⚠ PLANILHA ORÇAMENTÁRIA COMPLETA ANTES DA HEURÍSTICA DE GRADE. A
         heurística lê UMA aba e devolve item solto: a composição própria
         vira preço fixo sem estrutura, o banco de cada item se perde, o BDI
         e o regime de encargos ficam para trás e o arredondamento vira o
         truncamento do app — o total sai centavos abaixo do que o cliente
         já recebeu. O arquivo diz tudo isso por escrito; é só ler. */
      if (self._tentarPlanilhaCompleta((meta && meta.abas) || [{ nome: f.name, matriz: matriz }], f.name, matriz, meta)) return;
      var res = Importador.analisar(matriz);
      self._imp = { matriz: matriz, nome: f.name, res: res, abas: (meta && meta.abas) || null, abaIdx: (meta && meta.idx) || 0 };
      self._abrirImportPreview();
    },
    /* ==================================================================
     * RESTAURAR O ORÇAMENTO DA PRÓPRIA PLANILHA (v1.1.211)
     *
     * O caso que originou isto: o cliente montou o orçamento no app, exportou
     * o Excel, perdeu o orçamento — e o botão "Importar planilha" devolvia
     * outra coisa. Não porque o dado tivesse sumido: ele estava INTEIRO na aba
     * `_meta` do arquivo que o cliente tinha na mão. O importador só nunca
     * olhou para lá; tratava o Excel do próprio app como planilha de terceiro
     * e refazia tudo por heurística de grade.
     *
     * O que a heurística perdia, medido no arquivo dele: as 5 sub etapas, o
     * BDI de 27,03%, o cronograma, a memória de cálculo de 2 itens, o preço
     * ajustado à mão de 1 item, a ART, a vistoria, o cliente e a obra. E a
     * composição própria virava item solto.
     *
     * Aqui não há adivinhação nenhuma: é o snapshot que o app gravou.
     * ================================================================== */
    _abrirRestaurarSnapshot: function (snap, nomeArq, matriz, meta) {
      var self = this, cab = snap.cab || {}, orc = snap.orc || {};
      var val = Roundtrip.validar(cab, null);
      if (val.erro === "schema-novo") {
        UI.toast("Esta planilha veio de uma versão MAIS NOVA do OrçaPRO (schema " + cab.schemaVersao + "). Atualize o app antes de restaurar — importar assim corromperia o orçamento.", "erro");
        return;
      }
      var nEt = Util.arr(orc.etapas).length, nSub = 0, nIt = 0, custo = 0, nMem = 0, nAju = 0;
      Util.arr(orc.etapas).forEach(function (e) {
        nSub += Util.arr(e.subetapas).length;
        Util.arr(e.itens).forEach(function (it) {
          nIt++; custo += Util.num(it.quantidade) * Util.num(it.custoUnitario);
          if (it.memoriaCalculo) nMem++;
          if (it.ajustes) nAju++;
        });
      });
      var jaExiste = null;
      try {
        Store.listarOrcamentos(Auth.empresaId()).forEach(function (o) { if (o.id === orc.id) jaExiste = o; });
      } catch (eL) {}
      var bdiP = (orc.bdi && Util.num(orc.bdi.percentual)) || 0;
      var linha = function (r, v) { return '<tr><td class="muted" style="padding:2px 10px 2px 0;white-space:nowrap">' + r + '</td><td style="padding:2px 0"><b>' + v + '</b></td></tr>'; };
      var corpo =
        '<p style="font-size:13px;margin:0 0 10px">Esta planilha foi <b>gerada por este sistema</b> e carrega o orçamento inteiro dentro dela. ' +
        'Dá para trazer tudo de volta exatamente como estava — sem redigitar e sem adivinhação.</p>' +
        '<div class="card" style="padding:10px 12px;margin-bottom:10px"><table style="font-size:12.5px;border-collapse:collapse">' +
          linha("Orçamento", Util.esc(String(orc.nome || "").trim() || "(sem nome)") + " · " + Util.esc(orc.numero || "")) +
          linha("Cliente", Util.esc(String((orc.cliente && orc.cliente.nome) || "—").trim())) +
          linha("Obra", Util.esc(String((orc.obra && orc.obra.nome) || "—").trim())) +
          linha("Estrutura", nEt + " etapa(s) · " + nSub + " sub etapa(s) · " + nIt + " item(ns)") +
          linha("Custo", Util.fmtMoeda(custo) + (bdiP ? " · com BDI de " + Util.fmtNum(bdiP, 2) + "% = " + Util.fmtMoeda(custo * (1 + bdiP / 100)) : "")) +
          (nMem || nAju ? linha("Também volta", (nMem ? nMem + " memória(s) de cálculo" : "") + (nMem && nAju ? " · " : "") + (nAju ? nAju + " preço(s) ajustado(s) à mão" : "")) : "") +
          linha("Exportado em", Util.esc(String(cab.geradoEm || "").slice(0, 10).split("-").reverse().join("/"))) +
        '</table></div>' +
        (jaExiste
          ? '<div style="padding:9px 12px;border-radius:8px;background:rgba(234,88,12,.09);border:1px solid rgba(234,88,12,.32);font-size:12.5px">' +
            (typeof Icones !== "undefined" ? Icones.get("alerta", 15) : "⚠") + ' <b>Este orçamento ainda existe aqui</b> (' + Util.esc(jaExiste.numero || jaExiste.id) + '). ' +
            'Restaurar por cima <b>substitui</b> o que está no app pelo que está na planilha. Se quiser comparar antes, use <b>Reimportar</b> com o orçamento aberto.</div>'
          : '<p class="muted" style="font-size:12px;margin:0">O orçamento não está mais no app — vai entrar como novo, com o mesmo número.</p>');
      var botoes = [
        { texto: "Ler como planilha comum", classe: "ghost", onClick: function () {
          /* saída honesta: se o usuário quer MESMO a leitura por heurística
             (ex.: quer só os itens, sem a estrutura), o caminho antigo segue lá */
          var res = Importador.analisar(matriz);
          self._imp = { matriz: matriz, nome: nomeArq, res: res, abas: (meta && meta.abas) || null, abaIdx: (meta && meta.idx) || 0 };
          self._abrirImportPreview();
        } },
        { texto: (typeof Icones !== "undefined" ? Icones.get("reimportar", 15) : "") + (jaExiste ? " Substituir pelo da planilha" : " Restaurar este orçamento"), classe: "success", onClick: function () {
          self._restaurarSnapshot(snap, !!jaExiste);
        } }
      ];
      UI.modal((typeof Icones !== "undefined" ? Icones.get("reimportar", 15) : "") + " Orçamento encontrado dentro da planilha", corpo, botoes);
      UI.modalConsulta(); // só leitura até o usuário decidir — não é formulário
    },
    /* Grava o snapshot como orçamento de verdade. Sem remontar nada: o objeto
     * é o que o app gravou na exportação, e passa pelo MESMO caminho de
     * persistência dos outros (migração e validação inclusas). */
    _restaurarSnapshot: function (snap, substituindo) {
      var self0 = this;
      if (this._trialBloqueado()) { this._avisoTrial(); return; }
      var orc;
      try { orc = JSON.parse(JSON.stringify(snap.orc)); } catch (e) { UI.toast("Não consegui ler o orçamento de dentro da planilha.", "erro"); return; }
      var eid = Auth.empresaId();
      /* limite do plano: só conta como NOVO quando não é substituição */
      if (!substituindo) {
        try {
          var qtd = Store.listarOrcamentos(eid).length, lim = Auth.limite("limiteOrcamentos");
          if (lim && qtd >= lim) {
            UI.toast("Limite de " + lim + " orçamento(s) do seu plano atingido — faça upgrade ou apague um antes de restaurar.", "erro");
            return;
          }
        } catch (eLim) {}
      }
      var limIt = Auth.limite("limiteItensPorOrcamento");
      var nIt = Util.arr(orc.etapas).reduce(function (s, e) { return s + Util.arr(e.itens).length; }, 0);
      if (limIt && nIt > limIt) {
        UI.toast("A planilha tem " + nIt + " itens e o seu plano permite " + limIt + " por orçamento. Restauração cancelada para não entregar um orçamento pela metade.", "erro");
        return;
      }
      orc.atualizadoEm = Util.agoraISO();
      orc.restauradoEm = Util.agoraISO();       // rastro: este orçamento voltou de um Excel
      this._materializarSeExec(orc);             // gravação NOVA deste aparelho (não é dado recebido da nuvem)
      try {
        Store.salvarOrcamento(eid, orc);
      } catch (eS) { UI.toast("Falhou ao gravar o orçamento restaurado: " + ((eS && eS.message) || eS), "erro"); return; }
      /* ===== AS COMPOSIÇÕES PRÓPRIAS VOLTAM ANTES DO ORÇAMENTO =====
         O item lançado é snapshot e sozinho já mostra o preço certo — mas sem a
         estrutura ele é um preço fixo: não abre no detalhamento e não dá para
         reprecificar. Regravar a própria PRIMEIRO faz o orçamento nascer já com
         a autoria dele de volta. Nunca sobrescreve o que o usuário tem de
         diferente sem perguntar: código que já existe com outro conteúdo é
         decisão dele, não do arquivo. */
      var nPro = 0, nCon = 0;
      try {
        var pros = snap.proprias;
        if (pros && pros.length && typeof Roundtrip !== "undefined" && Roundtrip.propriasFaltando) {
          var falt = Roundtrip.propriasFaltando(pros, function (cod) { return Bases.obter("PROPRIA", cod); });
          var ausentes = falt.filter(function (f) { return f.motivo === "ausente"; });
          var conflitos = falt.filter(function (f) { return f.motivo === "diferente"; });
          ausentes.forEach(function (f) { self0._propriaGravar(f.item, null, null); nPro++; });
          if (conflitos.length) {
            nCon = conflitos.length;
            var lista = conflitos.slice(0, 5).map(function (f) { return f.item.codigo; }).join(", ");
            if (window.confirm("A planilha traz " + conflitos.length + " composição(ões) própria(s) que JÁ EXISTEM no seu banco com conteúdo diferente (" +
                lista + (conflitos.length > 5 ? "…" : "") + ").\n\nOK = usar a versão da planilha (sobrescreve a sua)\nCancelar = manter a sua (o orçamento não muda: o item já carrega o preço da época)")) {
              conflitos.forEach(function (f) { self0._propriaGravar(f.item, null, null); nPro++; });
              nCon = 0;
            }
          }
        }
      } catch (ePr) {}
      UI.fecharModal();
      /* ABRE PELO CAMINHO OFICIAL, não setando orcAtual na mão. O abrirOrcamento
         conserta acento corrompido, RENORMALIZA AS SUB ETAPAS (o próprio código
         de lá avisa que o round-trip do Excel entrega os itens de um grupo
         intercalados), repara a fonte de cada item e sincroniza o prazo. Um
         orçamento que acabou de voltar de um arquivo é justamente quem mais
         precisa dessa passagem. */
      this.abrirOrcamento(orc.id);
      UI.toast("Orçamento " + (orc.numero || "") + " " + (substituindo ? "substituído" : "restaurado") + " da planilha — " +
        Util.arr(orc.etapas).length + " etapa(s) e " + nIt + " item(ns), com BDI, cronograma e memórias de cálculo." +
        (nPro ? " " + nPro + " composição(ões) própria(s) voltaram para o seu banco." : ""), "ok");
      if (nCon) UI.toast(nCon + " composição(ões) própria(s) da planilha foram IGNORADAS — você preferiu manter as suas. Os itens do orçamento seguem com o preço da época.", "erro");
      try { this.backupAuto({ urgente: true }); } catch (eB) {} // dado recuperado: cópia em arquivo na hora
    },
    /* ==================================================================
     * PLANILHA ORÇAMENTÁRIA COMPLETA (motor: js/planilhacompleta.js)
     *
     * Vira orçamento NOVO com tudo que o arquivo diz: etapas e sub etapas,
     * banco de cada item, BDI, UF, competência, regime de encargos, divisão
     * MO/MAT/EQ e o arredondamento dele. As composições e os insumos
     * PRÓPRIOS aparecem numa lista para a pessoa marcar o que vai para o
     * banco dela — e o que já está lá é identificado e PERGUNTADO: gravar
     * por cima ou salvar uma cópia com prefixo (2-, 3-…).
     * ================================================================== */
    _tentarPlanilhaCompleta: function (abas, nomeArq, matriz, meta) {
      if (typeof PlanilhaCompleta === "undefined") return false;
      var det = null;
      try { det = PlanilhaCompleta.detectar(abas); } catch (eD) { return false; }
      if (!det || !det.ok) return false;
      var plano = null;
      try { plano = PlanilhaCompleta.analisar(abas, { arquivo: nomeArq }); }
      catch (eA) { plano = { ok: false, erro: String((eA && eA.message) || eA) }; }
      if (!plano || !plano.ok) {
        /* recado honesto e saída que existe: a leitura comum continua lá */
        UI.toast("Reconheci uma " + PlanilhaCompleta.NOME.toLowerCase() + ", mas não consegui lê-la inteira (" +
          ((plano && plano.erro) || "erro desconhecido") + "). Abrindo pela leitura de planilha comum.", "erro");
        return false;
      }
      this._pc = { plano: plano, nome: nomeArq, abas: abas, matriz: matriz, meta: meta };
      this._abrirImportPlanilhaCompleta();
      return true;
    },
    /* A base PROPRIA como está NO DISCO — a mesma fonte que o _propriaGravar lê. */
    _pcProprias: function () {
      var payload = Store.lerBasesExtras(Auth.empresaId()) || [], atual = null;
      for (var i = 0; i < payload.length; i++) { if (String(payload[i].fonte).toUpperCase() === "PROPRIA") atual = payload[i]; }
      return (atual && atual.dados) ? atual.dados : [];
    },
    _abrirImportPlanilhaCompleta: function () {
      var self = this, pc = this._pc;
      if (!pc) return;
      var plano = pc.plano, cab = plano.cabecalho || {}, ct = plano.contagem || {};
      PlanilhaCompleta.classificar(plano, { todos: this._pcProprias() });
      /* a prévia do total sai do MESMO motor que vai gravar — conferir contra
         o arquivo antes de decidir, e não depois de o orçamento existir */
      var conf = null;
      try { conf = PlanilhaCompleta.conferirTotais(PlanilhaCompleta.montarOrcamento(plano, {}), plano); } catch (eC) {}
      var esc = Util.esc, ic = function (n) { return typeof Icones !== "undefined" ? Icones.get(n, 15) : ""; };
      var linha = function (r, v) { return '<tr><td class="muted" style="padding:2px 10px 2px 0;white-space:nowrap;vertical-align:top">' + r + '</td><td style="padding:2px 0"><b>' + v + '</b></td></tr>'; };
      var fontes = Object.keys(ct.porFonte || {}).map(function (f) { return ct.porFonte[f] + " " + (f === "PROPRIA" ? "próprio(s)" : esc(f)); }).join(" · ");
      var bancos = (cab.bancos || []).map(function (b) {
        return esc(b.nome) + (b.competencia ? " " + b.competencia.split("-").reverse().join("/") : "") + (b.uf ? " · " + b.uf : (b.estado ? " · " + esc(b.estado) : ""));
      }).join("<br>") || "—";
      var enc = cab.desonerado === true ? "Desonerado" : (cab.desonerado === false ? "Não desonerado" : "não declarado no arquivo");
      var tot = "—";
      if (conf && conf.conferivel) {
        tot = Util.fmtMoeda(plano.totais.geral) + " no arquivo · " + Util.fmtMoeda(conf.precoVenda) + " recalculado aqui " +
          (conf.bate ? '<span style="color:#15803d">' + ic("check") + " confere centavo a centavo</span>"
                     : '<span style="color:#b45309">' + ic("alerta") + " diferença de " + Util.fmtMoeda(conf.difVenda) + " — confira antes de enviar ao cliente</span>");
      } else if (conf) {
        tot = Util.fmtMoeda(conf.precoVenda) + ' recalculado aqui <span class="muted">(o arquivo não traz o total geral para conferir)</span>';
      }
      var abasLidas = [plano.abas.sintetico, plano.abas.divisao].concat(plano.abas.composicoes || []).filter(Boolean);
      var props = plano.proprias || [];
      var nPend = props.filter(function (p) { return !p.padrao; }).length;
      var th = function (t) { return '<th style="text-align:left;padding:5px 6px;border-bottom:1px solid var(--borda,#e5e7eb);white-space:nowrap">' + t + '</th>'; };
      var linhasP = props.map(function (p) {
        var pend = !p.padrao;
        var sel = '<select data-pc-acao="' + esc(p.chave) + '" data-pc-status="' + esc(p.status) + '" style="font-size:12px;min-width:240px;max-width:320px">' +
          (pend ? '<option value="">— escolha —</option>' : "") +
          p.opcoes.map(function (a) { return '<option value="' + a + '"' + (a === p.padrao ? " selected" : "") + ">" + esc(PlanilhaCompleta.rotuloAcao(p, a)) + "</option>"; }).join("") +
          "</select>";
        var onde = p.usadaEm.length ? "item " + p.usadaEm.slice(0, 3).join(", ") + (p.usadaEm.length > 3 ? "…" : "")
          : (p.usadaEmComposicao.length ? "usado dentro de " + p.usadaEmComposicao.length + " composição(ões)" : "");
        var ex = p.existente ? '<br><span class="muted">no seu banco: ' + esc(p.existente.codigo) + " · " + Util.fmtMoeda(p.existente.custoUnitario) + "</span>" : "";
        var td = function (h, st) { return '<td style="padding:5px 6px;border-bottom:1px solid var(--borda,#f1f5f9);vertical-align:top' + (st ? ";" + st : "") + '">' + h + "</td>"; };
        return "<tr" + (pend ? ' style="background:rgba(234,88,12,.08)"' : "") + ">" +
          td(sel) +
          td(p.tipo === "composicao" ? (p.semEstrutura ? "Composição<br><span class=\"muted\">sem estrutura</span>" : "Composição<br><span class=\"muted\">" + p.insumos.length + " insumo(s)</span>") : "Insumo") +
          td(esc(p.codigoOrigem), "white-space:nowrap") +
          td(esc(p.descricao) + (onde ? '<br><span class="muted" style="font-size:11px">' + esc(onde) + "</span>" : "") +
             (p.avisos.length ? '<br><span style="font-size:11px;color:#b45309">' + ic("alerta") + " " + p.avisos.map(esc).join(" ") + "</span>" : "")) +
          td(esc(p.unidade)) +
          td(Util.fmtMoeda(p.custo.total), "white-space:nowrap;text-align:right") +
          td(esc(PlanilhaCompleta.rotuloStatus(p)) + ex, "font-size:11.5px") +
          "</tr>";
      }).join("");
      var blocoProprias = !props.length
        ? '<p class="muted" style="font-size:12.5px;margin:12px 0 0">O arquivo não tem composição nem insumo próprio — só itens de banco oficial.</p>'
        : '<h3 style="font-size:14px;margin:14px 0 4px">Itens próprios do arquivo — ' + ct.composicoesProprias + " composição(ões) · " + ct.insumosProprios + " insumo(s)</h3>" +
          '<p class="muted" style="font-size:12px;margin:0 0 6px">Escolha o que vai para o <b>seu banco</b> (Minhas composições). O que não for salvo entra só neste orçamento, com o preço da planilha. ' +
          "Composição salva leva junto os insumos próprios que ela usa.</p>" +
          '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">' +
            '<button type="button" class="btn sm ghost" data-pc-todas="salvar">Salvar todas as novas</button>' +
            '<button type="button" class="btn sm ghost" data-pc-todas="naoSalvar">Não salvar nenhuma nova</button></div>' +
          (nPend ? '<div style="padding:8px 12px;border-radius:8px;background:rgba(234,88,12,.09);border:1px solid rgba(234,88,12,.32);font-size:12.5px;margin-bottom:6px">' +
            ic("alerta") + " <b>" + nPend + " já existe(m) no seu banco</b> com outro conteúdo ou com a mesma descrição. Em cada uma, escolha: " +
            "<b>gravar por cima</b> (a sua passa a ser a do arquivo) ou <b>salvar como cópia</b> com prefixo (2-, 3-…).</div>" : "") +
          '<div style="overflow:auto;max-height:46vh;border:1px solid var(--borda,#e5e7eb);border-radius:8px">' +
          '<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr>' +
            th("O que fazer") + th("Tipo") + th("Código no arquivo") + th("Descrição") + th("Und") + th("Custo") + th("Situação") +
          "</tr></thead><tbody>" + linhasP + "</tbody></table></div>";
      var avs = plano.avisos || [];
      var corpo =
        '<p style="font-size:13px;margin:0 0 10px">Esta é uma <b>' + esc(PlanilhaCompleta.NOME.toLowerCase()) + '</b> — sintético, analítico e composições. ' +
        "Ela entra como <b>orçamento novo</b>, com a estrutura, os bancos, o BDI e o arredondamento do arquivo.</p>" +
        '<div class="card" style="padding:10px 12px;margin-bottom:10px"><table style="font-size:12.5px;border-collapse:collapse">' +
          linha("Obra", esc(cab.obra || "—")) +
          linha("Banco de preços", bancos) +
          linha("BDI", cab.bdi != null ? Util.fmtNum(cab.bdi, 2) + "%" : "não informado no arquivo — fica o padrão do app") +
          linha("Encargos", enc) +
          linha("Estrutura", ct.etapas + " etapa(s) · " + ct.subetapas + " sub etapa(s) · " + ct.itens + " item(ns) (" + fontes + ")") +
          linha("Total", tot) +
          linha("Arredondamento", "arredondar em 2 casas — o do arquivo (o padrão do app é truncar)") +
          linha("Abas lidas", esc(abasLidas.join(", "))) +
        "</table></div>" +
        '<div class="row" style="gap:10px;flex-wrap:wrap">' +
          '<div class="field" style="flex:2;min-width:220px"><label>Nome do orçamento</label><input id="pc-nome" value="' + esc(cab.obra || String(pc.nome || "").replace(/\.(xlsx|xls|csv)$/i, "")) + '"></div>' +
          '<div class="field" style="flex:1;min-width:180px"><label>Cliente</label><input id="pc-cliente" placeholder="o arquivo não separa o cliente"></div>' +
          '<div class="field" style="flex:2;min-width:220px"><label>Obra</label><input id="pc-obra" value="' + esc(cab.obra || "") + '"></div>' +
        "</div>" +
        (avs.length ? '<div style="padding:8px 12px;border-radius:8px;background:rgba(37,99,235,.07);border:1px solid rgba(37,99,235,.25);font-size:12px;margin-top:8px">' +
          ic("nota") + " " + avs.map(esc).join("<br>") + "</div>" : "") +
        blocoProprias +
        '<div id="pc-valida" style="margin-top:8px"></div>';
      var bg = UI.modal(ic("graficos") + " " + esc(PlanilhaCompleta.NOME) + " — " + esc(pc.nome || ""), corpo, [
        { texto: "Cancelar", classe: "ghost", onClick: function () { self._pc = null; UI.fecharModal(); } },
        { texto: "Ler como planilha comum", classe: "ghost", onClick: function () {
          /* saída honesta: quem quer só os itens, pela heurística de grade */
          var o = self._pc; self._pc = null; if (!o) return;
          self._imp = { matriz: o.matriz, nome: o.nome, res: Importador.analisar(o.matriz), abas: (o.meta && o.meta.abas) || null, abaIdx: (o.meta && o.meta.idx) || 0 };
          self._abrirImportPreview();
        } },
        { texto: ic("check") + " Importar orçamento", classe: "success", onClick: function () { self.criarOrcamentoDaPlanilhaCompleta(); } }
      ]);
      if (bg && bg.querySelectorAll) {
        Array.prototype.forEach.call(bg.querySelectorAll("[data-pc-todas]"), function (b) {
          b.addEventListener("click", function () {
            var alvo = b.getAttribute("data-pc-todas");
            Array.prototype.forEach.call(bg.querySelectorAll('select[data-pc-status="nova"]'), function (s) { s.value = alvo; });
          });
        });
      }
    },
    criarOrcamentoDaPlanilhaCompleta: function () {
      var self = this, pc = this._pc;
      if (!pc) return;
      if (this._trialBloqueado()) { this._avisoTrial(); return; }
      var eid = Auth.empresaId(), plano = pc.plano;
      try {
        var qtd = Store.listarOrcamentos(eid).length, lim = Auth.limite("limiteOrcamentos");
        if (lim && qtd >= lim) { UI.toast("Limite de " + lim + " orçamento(s) do seu plano atingido — faça upgrade ou apague um antes de importar.", "erro"); return; }
      } catch (eL) {}
      var limIt = Auth.limite("limiteItensPorOrcamento");
      if (limIt && plano.contagem.itens > limIt) {
        UI.toast("A planilha tem " + plano.contagem.itens + " itens e o seu plano permite " + limIt + " por orçamento. Importação cancelada para não entregar um orçamento pela metade.", "erro");
        return;
      }
      var decisoes = {};
      Array.prototype.forEach.call(document.querySelectorAll("[data-pc-acao]"), function (s) { decisoes[s.getAttribute("data-pc-acao")] = s.value; });
      var v = function (id) { var e = UI.el(id); return e ? String(e.value || "").trim() : ""; };
      /* ⚠ RECLASSIFICA CONTRA O DISCO NA HORA DE GRAVAR. Entre abrir a lista e
         confirmar, a nuvem pode ter trazido de outro aparelho a mesma
         composição — gravar "nova" por cima dela seria sobrescrever sem ter
         perguntado. Se mudou, a decisão antiga deixa de valer e a lista volta. */
      var antes = {};
      Util.arr(plano.proprias).forEach(function (p) { antes[p.chave] = p.status; });
      PlanilhaCompleta.classificar(plano, { todos: this._pcProprias() });
      var mudou = Util.arr(plano.proprias).some(function (p) { return antes[p.chave] !== p.status; });
      if (mudou) {
        UI.toast("O seu banco de composições mudou enquanto a lista estava aberta (sincronização). Revise a lista de novo antes de importar.", "erro");
        this._abrirImportPlanilhaCompleta();
        return;
      }
      var autor = (typeof Auth !== "undefined" && Auth.nome) ? Auth.nome() : "";
      var g = PlanilhaCompleta.planejarGravacao(plano, decisoes, { agora: Util.agoraISO(), autor: autor, arquivo: pc.nome });
      if (!g.ok) {
        var box = UI.el("pc-valida");
        if (box) box.innerHTML = '<div style="padding:9px 12px;border-radius:8px;background:rgba(220,38,38,.10);border:1px solid rgba(220,38,38,.3);font-size:12.5px">' +
          (typeof Icones !== "undefined" ? Icones.get("proibido", 15) : "") + " " + Util.esc(g.erro) + "</div>";
        UI.toast(g.erro, "erro");
        return;
      }
      var orc = PlanilhaCompleta.montarOrcamento(plano, { codigoPorChave: g.codigoPorChave, nome: v("pc-nome"), cliente: v("pc-cliente"), obra: v("pc-obra"), arquivo: pc.nome });
      /* ⚠ AS PRÓPRIAS ENTRAM ANTES DO ORÇAMENTO — o item nasce apontando para
         um código que já existe, e o detalhamento dele abre na hora. Se o
         orçamento falhar depois, as próprias ficam (reimportar as encontra
         como "já salva, igual", sem duplicar). */
      if (g.gravar.length) {
        try { this._propriaGravarVarios(g.gravar); }
        catch (eP) { UI.toast("Falhou ao gravar os itens próprios no seu banco (" + ((eP && eP.message) || eP) + "). Nada foi importado.", "erro"); return; }
      }
      try { Store.salvarOrcamento(eid, orc); }
      catch (eS) {
        UI.toast("Os itens próprios foram gravados, mas o orçamento falhou ao salvar (" + ((eS && eS.message) || eS) + "). Importe de novo: o que já foi gravado aparece como \"já salva, igual\".", "erro");
        return;
      }
      var conf = null;
      try { conf = PlanilhaCompleta.conferirTotais(orc, plano); } catch (eC) {}
      this._pc = null;
      UI.fecharModal();
      this.abrirOrcamento(orc.id);
      var r = g.resumo, nGrav = r.novas + r.sobrescritas + r.copias;
      var totTxt = (conf && conf.conferivel)
        ? (conf.bate ? " O total confere com o arquivo: " + Util.fmtMoeda(conf.precoVenda) + "."
                     : " ATENÇÃO: o total ficou " + Util.fmtMoeda(conf.precoVenda) + ", diferente do arquivo em " + Util.fmtMoeda(conf.difVenda) + ".")
        : "";
      UI.toast("Orçamento importado da planilha completa: " + orc.etapas.length + " etapa(s) e " + plano.contagem.itens + " item(ns)." + totTxt +
        (nGrav ? " No seu banco: " + [r.novas ? r.novas + " nova(s)" : "", r.sobrescritas ? r.sobrescritas + " gravada(s) por cima" : "", r.copias ? r.copias + " cópia(s)" : ""].filter(Boolean).join(", ") + "." : ""),
        (conf && conf.conferivel && !conf.bate) ? "erro" : "ok");
      if (g.avisos.length) UI.toast(g.avisos.join(" "), "erro");
      try { this.backupAuto({ urgente: true }); } catch (eB) {}
    },
    _lerPlanilha: function (file, cb) {
      var nome = String(file.name || "").toLowerCase(), fr = new FileReader();
      if (/\.csv$/.test(nome)) { fr.onload = function () { try { cb(App._parseCSV(String(fr.result))); } catch (e) { cb(null, String(e && e.message || e)); } }; fr.onerror = function () { cb(null, "falha ao ler o arquivo"); }; fr.readAsText(file); return; }
      // .xls antigo (binário BIFF, pré-2007): o ExcelJS NÃO lê (só .xlsx/OOXML). Usa o SheetJS
      // (vendorizado, offline) só pra este caso → mesma estrutura {abas, idx} do .xlsx, então o
      // seletor de aba / _melhorAba / preview funcionam idênticos. (comum em obra/SINAPI.)
      if (/\.xls$/.test(nome)) {
        if (typeof ExcelOrc === "undefined" || !ExcelOrc.ensureSheetJS) { cb(null, "Leitor de .xls indisponível. Salve como .xlsx ou .csv e importe."); return; }
        fr.onload = function () {
          ExcelOrc.ensureSheetJS(function () {
            try {
              if (!global.XLSX) { cb(null, "Não consegui carregar o leitor de .xls. Salve como .xlsx ou .csv."); return; }
              var wb = XLSX.read(new Uint8Array(fr.result), { type: "array" });
              var abas = App._abasDoSheetJS(wb); // área real das células, não a dimensão gravada (ver a nota lá)
              if (!abas.length) { cb(null, "planilha .xls sem abas legíveis"); return; }
              var idx = App._melhorAba(abas);
              cb(abas[idx].matriz, null, { abas: abas, idx: idx });
            } catch (e) { cb(null, App._msgExcelErro(e)); }
          });
        };
        fr.onerror = function () { cb(null, "falha ao ler o arquivo"); };
        fr.readAsArrayBuffer(file);
        return;
      }
      fr.onload = function () {
        if (typeof ExcelOrc === "undefined" || !ExcelOrc.ensureExcelJS) { cb(null, "módulo Excel indisponível (arquivo js/vendor/exceljs.min.js)"); return; }
        ExcelOrc.ensureExcelJS(function () {
          try {
            var wb = new ExcelJS.Workbook();
            wb.xlsx.load(fr.result).then(function () {
              function matDe(w) { var m = []; w.eachRow({ includeEmpty: true }, function (row) { var r = []; row.eachCell({ includeEmpty: true }, function (cell) { r.push(cell.value); }); m.push(r); }); return m; }
              // Planilha profissional traz VÁRIAS abas (Resumo, Sintética, Analítica, Composições…).
              // A MAIOR não é o orçamento: "Composições Unitárias" (85 linhas de insumos) > "Analítica"
              // (63). Elege a aba que o Importador melhor reconhece como ORÇAMENTO e guarda as demais
              // pro usuário trocar no preview (seletor de aba).
              var abas = [];
              (wb.worksheets || []).forEach(function (w) { var m = matDe(w); if (m.length) abas.push({ nome: String(w.name || ("Aba " + (abas.length + 1))), matriz: m }); });
              if (!abas.length) { cb(null, "planilha sem abas legíveis"); return; }
              /* ⚠ ESTA PLANILHA PODE SER NOSSA. O Excel que o app exporta leva a
                 aba _meta com o orçamento INTEIRO em JSON — etapas, sub etapas,
                 BDI, cronograma, memória de cálculo, preço ajustado à mão. Ler
                 isso por heurística de grade, como se fosse planilha de terceiro,
                 é jogar fora o que está escrito e adivinhar de novo: foi assim
                 que a reimportação devolveu composição "bugada" e sub etapa
                 sumida para um cliente que tinha o arquivo certo na mão. */
              var snap = null;
              try {
                if (typeof Roundtrip !== "undefined" && Roundtrip.lerMeta) {
                  var m0 = Roundtrip.lerMeta(wb);
                  if (m0 && !m0.erro && m0.orc) snap = m0;
                }
              } catch (eSn) {}
              var idx = App._melhorAba(abas);
              cb(abas[idx].matriz, null, { abas: abas, idx: idx, snapshot: snap });
            }).catch(function (e) { App._lerComSheetJS(fr.result, e, cb); }); // ver a nota em _lerComSheetJS
          } catch (e) { cb(null, App._msgExcelErro(e)); }
        });
      };
      fr.onerror = function () { cb(null, "falha ao ler o arquivo"); };
      fr.readAsArrayBuffer(file);
    },
    /* ⚠ O EXCELJS RECUSA ARQUIVO QUE O EXCEL ABRE. A planilha completa de outro programa
       grava a mesma mescla de células duas vezes, e o ExcelJS aborta a leitura
       inteira ("Cannot merge already merged cells") — medido com o
       js/vendor/exceljs.min.js do próprio app. O cliente via "Falha ao ler a
       planilha" num arquivo que abre normal no Excel. O SheetJS, que já viaja
       no app para o .xls, lê o mesmo arquivo. Só se os DOIS falharem o erro
       chega à pessoa — e é o do ExcelJS, que é o leitor principal. */
    _lerComSheetJS: function (buf, erroExcelJS, cb) {
      if (typeof ExcelOrc === "undefined" || !ExcelOrc.ensureSheetJS) { cb(null, App._msgExcelErro(erroExcelJS)); return; }
      ExcelOrc.ensureSheetJS(function () {
        try {
          if (!global.XLSX) { cb(null, App._msgExcelErro(erroExcelJS)); return; }
          var abas = App._abasDoSheetJS(XLSX.read(new Uint8Array(buf), { type: "array" }));
          if (!abas.length) { cb(null, App._msgExcelErro(erroExcelJS)); return; }
          var idx = App._melhorAba(abas);
          cb(abas[idx].matriz, null, { abas: abas, idx: idx, leitor: "sheetjs" });
        } catch (e2) { cb(null, App._msgExcelErro(erroExcelJS)); }
      });
    },
    /* ⚠ A dimensão gravada no arquivo mente — a área real sai das células
       (ver Importador.abasDoSheetJS, onde a regra é testada em Node). */
    _abasDoSheetJS: function (wb) { return Importador.abasDoSheetJS(XLSX, wb); },
    // Traduz o erro cru do ExcelJS numa mensagem acionável (arquivo não-xlsx/corrompido/protegido).
    _msgExcelErro: function (e) {
      var raw = String((e && e.message) || e || "");
      if (/sheets|zip|central directory|end of central|invalid|corrupt|undefined|not a valid|signature/i.test(raw))
        return "Não consegui ler este arquivo como Excel (.xlsx). Confirme que é um .xlsx válido — não protegido por senha e não corrompido. Dica: abra no Excel e use Salvar como .xlsx (ou .csv), depois importe.";
      return "Falha ao ler a planilha: " + raw;
    },
    // Multi-aba: elege a aba que MAIS parece um ORÇAMENTO (não a maior). Roda o próprio
    // Importador em cada aba e pontua: confiança manda; estrutura de etapas REAIS desempata
    // forte (aba de composição/insumo é plana → cai no fallback "Serviços" e perde); itens é
    // desempate leve. Empate/erro → índice 0. O usuário ainda pode trocar a aba no preview.
    _melhorAba: function (abas) {
      var best = 0, bestScore = -1;
      for (var i = 0; i < abas.length; i++) {
        var sc = -1;
        try {
          var r = Importador.analisar(abas[i].matriz);
          var itens = 0, reais = 0;
          Util.arr(r.etapas).forEach(function (e) {
            itens += Util.arr(e.itens).length;
            if ((e.codigo && /\d/.test(e.codigo)) || (e.nome && e.nome !== "Serviços")) reais++;
          });
          sc = (r.confianca || 0) * 1000 + reais * 100 + Math.min(itens, 99);
        } catch (e) {}
        if (sc > bestScore) { bestScore = sc; best = i; }
      }
      return best;
    },
    // CSV (detecta ; ou , como separador). Varredura char-a-char sobre o TEXTO INTEIRO,
    // mantendo o estado de aspas ATRAVÉS das quebras de linha — descrição multi-linha entre
    // aspas (o que o Excel gera) é CSV válido e NÃO pode rasgar o registro.
    _parseCSV: function (txt) {
      txt = String(txt).replace(/\r\n?/g, "\n");
      if (!txt.trim()) return [];
      // separador pela 1ª linha não-vazia, IGNORANDO conteúdo entre aspas (vírgula dentro de
      // aspas não conta) — senão um cabeçalho com campo citado contendo vírgula erra o delimitador.
      var linhasTxt = txt.split("\n"), prim = "";
      for (var pi = 0; pi < linhasTxt.length; pi++) { if (linhasTxt[pi].trim()) { prim = linhasTxt[pi].replace(/"[^"]*"/g, ""); break; } }
      var delim = (prim.split(";").length > prim.split(",").length) ? ";" : ",";
      var linhas = [], linha = [], cur = "", q = false;
      for (var i = 0; i < txt.length; i++) {
        var ch = txt[i];
        if (ch === '"') {
          if (q && txt[i + 1] === '"') { cur += '"'; i++; }
          /* v1.1.234 — aspa de POLEGADA não abre citação. `TUBO PVC 3/4"` numa
             planilha de hidráulica ligava o modo-citação no MEIO do campo e o
             parser engolia delimitadores e quebras de linha até achar outra
             aspa — itens inteiros sumiam da importação, calados. Aspa só abre
             citação no INÍCIO do campo (regra do RFC 4180); no meio, é texto. */
          else if (!q && cur !== "") { cur += '"'; }
          else q = !q;
        }
        else if (ch === delim && !q) { linha.push(cur); cur = ""; }
        else if (ch === "\n" && !q) { linha.push(cur); linhas.push(linha); linha = []; cur = ""; }
        else cur += ch;
      }
      if (cur !== "" || linha.length) { linha.push(cur); linhas.push(linha); }
      return linhas.filter(function (r) { return r.some(function (c) { return String(c).trim() !== ""; }); });
    },
    _abrirImportPreview: function () {
      var self = this, imp = self._imp, picker = "";
      if (imp.abas && imp.abas.length > 1) {
        var opts = imp.abas.map(function (a, i) { return '<option value="' + i + '"' + (i === imp.abaIdx ? " selected" : "") + ">" + Util.esc(a.nome) + "</option>"; }).join("");
        picker = '<div class="card" style="background:#eff6ff;border-color:#bfdbfe;padding:8px 12px;margin-bottom:10px;font-size:12.5px;color:#1e3a5f">' +
          "" + (typeof Icones !== "undefined" ? Icones.get("nota", 15) : "") + " Esta planilha tem <b>" + imp.abas.length + " abas</b>. Importando de " +
          '<select id="imp-aba" style="margin:0 6px;padding:2px 6px;font-size:12.5px">' + opts + "</select>" +
          '<span class="muted">— se não for a aba do orçamento, troque e clique <b>' + (typeof Icones !== 'undefined' ? Icones.get('ciclo', 15) : '') + ' Reanalisar</b>.</span></div>';
      }
      UI.modal("" + (typeof Icones !== "undefined" ? Icones.get("graficos", 15) : "") + " Importar planilha — " + Util.esc(imp.nome || ""), picker + UI.renderImportPreview(imp), [
        { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
        { texto: "" + (typeof Icones !== "undefined" ? Icones.get("ciclo", 15) : "") + " Reanalisar", classe: "", onClick: function () { self.importRemapear(); } },
        { texto: "" + (typeof Icones !== "undefined" ? Icones.get("check", 15) : "") + " Importar como orçamento", classe: "success", onClick: function () { self.criarOrcamentoDaImportacao(); } }
      ]);
    },
    importRemapear: function () {
      if (!this._imp) return;
      var imp = this._imp;
      // Troca de aba (planilha multi-aba): reanalisa a aba escolhida DO ZERO (auto-detecção limpa —
      // o mapeamento de colunas anterior era da outra aba e não vale mais).
      var selAba = document.getElementById("imp-aba");
      if (selAba && imp.abas) {
        var ai = parseInt(selAba.value, 10); if (isNaN(ai)) ai = imp.abaIdx;
        if (imp.abas[ai] && ai !== imp.abaIdx) {
          imp.abaIdx = ai; imp.matriz = imp.abas[ai].matriz; imp.res = Importador.analisar(imp.matriz);
          var body0 = document.getElementById("imp-body"); if (body0) body0.innerHTML = UI.renderImportPreview(imp, true);
          return;
        }
      }
      var roles = ["codigo", "descricao", "unidade", "quantidade", "custoUnit", "custoTotal"], cols = {};
      roles.forEach(function (r) { var s = document.getElementById("imp-col-" + r); cols[r] = (s && s.value !== "") ? parseInt(s.value, 10) : null; });
      var hr = document.getElementById("imp-header"), headerRow = (hr && hr.value !== "") ? parseInt(hr.value, 10) : imp.res.headerRow;
      imp.res = Importador.analisar(imp.matriz, { colunas: cols, headerRow: headerRow });
      var body = document.getElementById("imp-body"); if (body) body.innerHTML = UI.renderImportPreview(imp, true);
    },
    criarOrcamentoDaImportacao: function () {
      if (this._trialBloqueado()) { this._avisoTrial(); return; }
      var res = this._imp && this._imp.res;
      if (!res || !res.etapas.length) { UI.toast("Nada pra importar — ajuste o mapeamento das colunas e clique Reanalisar.", "erro"); return; }
      var nomeBase = String(this._imp.nome || "Orçamento importado").replace(/\.(xlsx|xls|csv)$/i, "");
      var orc = Orcamento.novo({ nome: nomeBase });
      var temSinapi = (typeof Sinapi !== "undefined" && Sinapi.obter), casados = 0, proprios = 0, semCusto = 0;
      res.etapas.forEach(function (et) {
        Orcamento.addEtapa(orc, et.nome || "Etapa");
        var etapaId = orc.etapas[orc.etapas.length - 1].id;
        Util.arr(et.itens).forEach(function (it) {
          var base = (temSinapi && it.codigo) ? Sinapi.obter(it.codigo) : null, sinapiItem;
          if (base) {
            casados++;
            var baseUnit = Util.num(base.custoUnitario);
            var usarUnit = it.custoUnitario > 0 ? it.custoUnitario : baseUnit;
            // se o preço da planilha diverge da base, RATEIA MO/MAT/EQ pelo fator → a composição
            // (MO+MAT+EQ) fica coerente com o custo direto (senão o relatório SINAPI desbate).
            var fator = (baseUnit > 0 && usarUnit > 0) ? usarUnit / baseUnit : 1;
            sinapiItem = { codigo: base.codigo, baseFonte: base.baseFonte || null,
              descricao: it.descricao || base.descricao, unidade: it.unidade || base.unidade,
              custoUnitario: usarUnit,
              custoMO: Util.num(base.custoMO) * fator, custoMAT: Util.num(base.custoMAT) * fator, custoEQ: Util.num(base.custoEQ) * fator };
          } else {
            proprios++;
            sinapiItem = { codigo: it.codigo || "", descricao: it.descricao, unidade: it.unidade || "un", custoUnitario: Util.num(it.custoUnitario) };
          }
          if (!(sinapiItem.custoUnitario > 0)) semCusto++;
          Orcamento.addItem(orc, etapaId, sinapiItem, it.quantidade);
        });
      });
      Store.salvarOrcamento(Auth.empresaId(), orc);
      UI.fecharModal();
      this.orcAtual = orc; this.tela = "editor"; this.aba = "planilha"; this.render();
      UI.toast("Importado: " + orc.etapas.length + " etapas · " + (casados + proprios) + " itens (" + casados + " casados no SINAPI" + (semCusto ? " · " + semCusto + " sem custo p/ revisar" : "") + ").", "ok");
    },

    // Lança um orçamento a partir do levantamento de quantitativos do BIM (js/bimqto.js).
    // NÃO inventa preço: custo entra zerado — o usuário casa no SINAPI / precifica no editor.
    criarOrcamentoDoBIM: function (levantamento, nomeObra) {
      if (this._trialBloqueado()) { this._avisoTrial(); return; }
      var seed = (typeof BIMQto !== "undefined" && BIMQto.paraOrcamento) ? BIMQto.paraOrcamento(levantamento) : null;
      if (!seed || !seed.itens.length) { UI.toast("Nada pra lançar — o modelo não gerou quantitativos.", "erro"); return; }
      var orc = Orcamento.novo({ nome: nomeObra ? ("Levantamento BIM — " + nomeObra) : "Levantamento BIM (modelo IFC)" });
      Orcamento.addEtapa(orc, seed.nome);
      var etapaId = orc.etapas[orc.etapas.length - 1].id;
      seed.itens.forEach(function (it) {
        Orcamento.addItem(orc, etapaId, { codigo: "", descricao: it.descricao, unidade: it.unidade || "un", custoUnitario: 0 }, it.quantidade);
      });
      Store.salvarOrcamento(Auth.empresaId(), orc);
      this.orcAtual = orc; this.tela = "editor"; this.aba = "planilha"; this.render();
      var estim = (levantamento && levantamento.resumo && levantamento.resumo.nEstimados) || 0;
      UI.toast("Lançado do BIM: " + seed.itens.length + " serviços quantificados" + (estim ? " (algumas quantidades estimadas — revise)" : "") + ". Agora case no SINAPI / informe os preços.", "ok");
    },

    // Overlay de impressão compartilhado (proposta e relatório)
    /* `icone` é o NOME do ícone (ex.: "relatorio"), nunca o markup dele.
     *
     * ⚠ TÍTULO É TEXTO PURO, E ISSO NÃO É PREFERÊNCIA — É O QUE SAI IMPRESSO.
     *   Três chamadas daqui (proposta, laudo, relatório) montavam o título
     *   concatenando `Icones.get(...)`, que devolve um <svg> inteiro. O
     *   resultado ia para DOIS lugares ruins de uma vez:
     *     1. `document.title`, que o navegador estampa no cabeçalho de toda
     *        página impressa — o PDF do cliente saía com uma linha de código;
     *     2. a barra da janela, onde o `Util.esc()` (correto, e que fica) o
     *        exibia como texto cru.
     *   Agora o ícone entra por fora, e o título que chega aqui é limpo de
     *   qualquer marcação antes de ir para o `document.title`. A limpeza é
     *   defensiva de propósito: são mais de 20 pontos de chamada, e basta um
     *   deles repetir o erro para o cliente receber um PDF sujo de novo. */
    _abrirPrint: function (titulo, htmlConteudo, icone) {
      this.fecharProposta();
      var limpo = String(titulo == null ? "" : titulo).replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
      // White-label: o <title> da página sai no cabeçalho/rodapé de impressão do
      // navegador — enquanto o documento está aberto, o título vira o do DOCUMENTO
      // (com o nome da empresa do cliente), não o do produto. Restaura ao fechar.
      if (this._tituloApp == null) this._tituloApp = document.title;
      var nomeEmp = (typeof Empresa !== "undefined" && Empresa.nomeDoc) ? Empresa.nomeDoc() : "";
      try { document.title = (limpo || "Documento") + (nomeEmp ? " — " + nomeEmp : ""); } catch (eT) {}
      var ic = (icone && typeof Icones !== "undefined") ? Icones.get(icone, 15) : "";
      var overlay = document.createElement("div");
      overlay.className = "proposta-overlay"; overlay.id = "proposta-print";
      overlay.innerHTML =
        '<div class="prop-toolbar no-print"><span class="ttl">' + ic + Util.esc(limpo) + '</span>' +
        '<button class="btn sm success" data-acao="proposta-imprimir">' + (typeof Icones !== 'undefined' ? Icones.get('imprimir', 15) : '') + ' Imprimir / Salvar PDF</button>' +
        '<button class="btn sm" data-acao="proposta-fechar">Fechar</button></div>' +
        htmlConteudo;
      document.body.appendChild(overlay);
      window.scrollTo(0, 0);
    },
    fecharProposta: function () {
      var o = document.getElementById("proposta-print");
      if (o) o.remove();
      if (this._tituloApp != null) { try { document.title = this._tituloApp; } catch (eT) {} this._tituloApp = null; }
    },

    // ---------- Persistência (idempotente + debounce) ----------
    // ---- Gate de licença: MODO DEMONSTRAÇÃO explora tudo, mas NÃO salva/exporta sem licença ----
    _trialBloqueado: function () {
      if (this._demo) return false; // a vitrine da página de vendas nunca bloqueia
      if (typeof Licenca === "undefined") return false;
      var s = Licenca.status(); if (!s) return false;
      // LOTE 5: trial de 7 dias é COMPLETO (salva/exporta) enquanto ativo;
      // bloqueia só quando expira. Antes: s.trial bloqueava sempre — ninguém
      // experimentava o entregável antes de pagar.
      if (s.trial) return !s.ativo;
      /* suspensa por parcela vencida (js/cobranca.js): a licença segue VÁLIDA
         (ver o ⚠ em Licenca.status), mas nada grava nem exporta */
      if (s.suspensa) return true;
      return !s.ativo;                    // licenciado: bloqueia se não está ativo (vencida/carência/outra máquina)
    },
    _avisoTrial: function () {
      var s = (typeof Licenca !== "undefined") ? Licenca.status() : {};
      var msg;
      /* SUSPENSA POR COBRANÇA: o caminho é pagar, não a tela de chave — mandar
         para "ative sua licença" faria a pessoa colar a chave de novo e achar
         que o sistema quebrou. Mostra o aviso com os links de pagamento. */
      if (s.suspensa) {
        UI.toast("Licença suspensa por falta de pagamento. Seus dados estão preservados; o acesso volta quando o pagamento compensar.", "erro");
        try { if (typeof Cobranca === "undefined" || !Cobranca.mostrarAgora()) this.abrirLicenca(); } catch (eS) {}
        return;
      }
      if (s.expirada) msg = "Sua licença venceu. Renove para continuar salvando e exportando.";
      else if (s.outroDispositivo) msg = "Esta licença está ativada em outra máquina. Fale com o suporte para liberar.";
      else if (s.revalidar) msg = "Reconecte à internet para revalidar sua licença (alguns dias sem checar).";
      else if (s.trial && s.expirado) msg = "⏰ Seu teste grátis de 7 dias terminou. Ative uma licença (🔑) para continuar salvando e exportando — seus orçamentos estão preservados.";
      else msg = "" + (typeof Icones !== "undefined" ? Icones.get("cadeado", 15) : "") + " Ative sua licença (🔑) para salvar e exportar.";
      UI.toast(msg, "erro");
      try { this.abrirLicenca(); } catch (e) {}
    },

    /* Devolve true se GRAVOU (e false quando a licença, a trava do aprovado ou
       o armazenamento recusaram) — para quem chama não anunciar "aplicado" de
       uma edição que não foi a lugar nenhum. */
    /* opts.cronoAntes (opcional): o resultado de Cronograma.estimar desta tela
       ANTES da edição — o handler do cronograma mede e passa, para o recado do
       modo executivo dizer o antes → depois verdadeiro (ver _cronoMaterializar). */
    persistir: function (opts) {
      if (!this.orcAtual) return false;
      /* ⚠ o clone do PLANO DE EXECUÇÃO da obra (CronoBase.orcComPlano, marca
         `_planoDaObra`) NUNCA vira orçamento: gravá-lo poria o plano da obra
         dentro da proposta aprovada. Nenhum caminho deve trazê-lo até aqui —
         esta é a última porta, e ela recusa dizendo o que aconteceu. */
      if (this.orcAtual._planoDaObra) { UI.toast("Isto é o plano de execução da obra, não o orçamento — nada foi gravado no orçamento. Recarregue a tela.", "erro"); return false; }
      if (this._trialBloqueado()) {
        /* ⚠ quem está SUSPENSO não está em "modo demonstração": esse texto
           mandaria um cliente pagante ativar uma licença que ele já tem */
        var sSus = (typeof Licenca !== "undefined") ? Licenca.status() : {};
        if (!this._avisouSalvar) {
          this._avisouSalvar = true;
          if (sSus && sSus.suspensa) this._avisoTrial();
          else UI.toast("" + (typeof Icones !== "undefined" ? Icones.get("cadeado", 15) : "") + " Modo demonstração — para salvar, ative sua licença (🔑).", "erro");
        }
        return false;
      }
      /* ⚠ APROVADO NÃO GRAVA (fase 4). O aprovado é o preço que foi ao cliente
         e virou contrato: editar por baixo faz o documento entregue e a tela
         divergirem sem nada registrando a troca. Recusar em silêncio seria
         pior ainda — o usuário digitaria a tarde inteira achando que salvou.
         Então avisa UMA vez por abertura e oferece o caminho que existe. */
      if (Orcamento.travadoPorAprovacao && Orcamento.travadoPorAprovacao(this.orcAtual)) {
        if (this._avisouTravado !== this.orcAtual.id) {
          this._avisouTravado = this.orcAtual.id;
          var self0 = this, alvo = this.orcAtual;
          UI.modal((typeof Icones !== "undefined" ? Icones.get("cadeado", 15) : "") + " Orçamento aprovado — alteração não gravada",
            '<p style="font-size:13px">O <b>' + Util.esc(alvo.numero || "") + '</b> está <b>aprovado</b>. ' +
            'O que foi aprovado é o preço que chegou ao cliente — mudá-lo por baixo faria o documento entregue e o que está aqui virarem coisas diferentes, sem registro nenhum da troca.</p>' +
            '<p class="muted" style="font-size:12.5px">O caminho é a <b>revisão</b>: nasce como orçamento próprio (<b>' +
            Util.esc(String(alvo.numero || "").replace(/-R\d+$/, "")) + '-R…</b>), já com todo o conteúdo copiado, e o aprovado fica intacto para consulta.</p>',
            [
              { texto: "Voltar sem gravar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
              { texto: (typeof Icones !== "undefined" ? Icones.get("mais", 15) : "") + " Criar revisão e editar nela", classe: "success",
                onClick: function () { UI.fecharModal(); self0.criarRevisao(alvo); } }
            ]);
        }
        return false;
      }
      /* ⚠ O DESFAZER DA IA VALE ATÉ A PRIMEIRA EDIÇÃO HUMANA (crítica
         ia-seguranca, item 13): um retrato que atravessa edição de gente,
         aparelho e semanas vira um clique que reverte o que ninguém lembra. Só
         a tela da IA salva com {daIA:true}. Depois das travas: o aprovado não
         é tocado nem em memória. */
      if (!(opts && opts.daIA) && typeof IAEdit !== "undefined") IAEdit.limparDesfazer(this.orcAtual);
      /* ⚠ ORDEM: materializar DEPOIS das duas travas (o aprovado não é tocado
         nem em memória) e ANTES do sincronizarPrazo — o nº de meses do
         desembolso tem de sair da duração que vai ser gravada, não da de antes. */
      this._cronoMaterializar(this.orcAtual, opts && opts.cronoAntes);
      try { Orcamento.sincronizarPrazo(this.orcAtual); } catch (e) {} // FASE 1.4: prazo segue o agente (depois do gate de licença)
      /* FASE 3 — ESFORÇO, NÃO CALENDÁRIO. `criadoEm → atualizadoEm` conta fim
         de semana e orçamento parado como se fosse trabalho. Marcar o DIA a
         cada salvamento do usuário mede o que ele realmente tocou.
         Fica AQUI, no salvar do orçamento aberto, e não no Store: restauração
         de planilha e reprecificação em lote gravam por lá e não são dia de
         elaboração de ninguém. */
      try { Orcamento.marcarDiaEdicao(this.orcAtual, Util.agoraISO()); } catch (e) {}
      var ok = Store.salvarOrcamento(Auth.empresaId(), this.orcAtual);
      if (!ok && !this._avisouQuota) {
        this._avisouQuota = true;
        /* ⚠ o backup agora é só do administrador (leva a empresa inteira).
           Mandar o sub-usuário "exportar um backup" e em seguida recusar
           seria dar uma ordem e negá-la na mesma tela — para ele, a saída é
           avisar quem pode. */
        var _adm = !(typeof Auth !== "undefined" && Auth.ehAdmin && !Auth.ehAdmin());
        UI.toast(_adm
          ? "Não foi possível salvar — armazenamento cheio. Exporte um backup (💾) e remova a base SINAPI grande do navegador."
          : "Não foi possível salvar — armazenamento deste aparelho cheio. Avise o administrador da conta.", "erro");
        /* {semBackupModal}: a tela da IA mantém o diff aberto e diz o recado lá
           (o modal de backup por cima levava junto a resposta já paga) */
        if (_adm && !(opts && opts.semBackupModal)) { try { this.abrirBackup(); } catch (e) {} }
      } else if (ok) { this._avisouQuota = false; try { this.backupAuto(); } catch (e) {} }
      return !!ok;
    }
  };

  global.App = App;
  document.addEventListener("DOMContentLoaded", function () {
    App.iniciar();
    /* ⚠ CONFIGURA O PLUGIN DO REVIT SOZINHO, uma vez por abertura.
       O plugin roda em IronPython, fora do navegador: nao tem localStorage e
       portanto nao sabe a licenca nem o endereco do backend de IA. Sem isso o
       servidor devolve 403 e o desempate do orcamento fica de fora.

       Ficar so no clique de "Exportar p/ Revit" obrigava o usuario a lembrar
       de um passo que ele nao tem por que conhecer. Abrir o OrcaPRO ja basta.

       Best-effort e adiado: nao pode atrasar a tela nem derrubar o boot. */
    setTimeout(function () {
      try { if (typeof Revit !== "undefined" && Revit.exportarIA) Revit.exportarIA(); } catch (e) {}
    }, 2500);
  });
})(window);
