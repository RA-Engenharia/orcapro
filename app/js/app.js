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
          if (sd.usoPct >= 80) UI.toast("" + (typeof Icones !== "undefined" ? Icones.get("alerta", 15) : "") + " Armazenamento local em " + sd.usoPct + "% — faça " + (typeof Icones !== "undefined" ? Icones.get("salvar", 15) : "") + " Backup e remova bases não usadas em " + (typeof Icones !== "undefined" ? Icones.get("tabela", 15) : "") + " Tabelas.", "erro");
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
          else Licenca.revalidar(function (r) { if (r && r.bloqueado) { try { self.render(); UI.toast("Licença: " + (r.erro || "ativada em outra máquina."), "erro"); } catch (e) {} } });
        }
      } catch (e) {}
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
      // vitrine da GESTÃO: semeia dados de exemplo (empresa "demo") e permite deep-link
      // ?demo=1&view=<modulo> (dashboard, obras, rdos, medicoes, financeiro...) p/ site e screenshots
      try { if (typeof DemoGestao !== "undefined") DemoGestao.seed(); } catch (e) {}
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
      } else {
        this.tela = "lista";
        var r = Sinapi.resumo();
        var baseInfo = { competencia: r.competencia, uf: r.uf, total: r.total,
          personalizada: Store.temBaseSinapi(Auth.empresaId()) };
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
      var classe = { aprovar: "success", rejeitar: "danger", revisar: "", enviar: "primary", reabrir: "ghost" };
      var est = Aprovacao.estadoDe(orc), info = Aprovacao.ESTADOS[est] || {};
      var CORES = { cinza: "#64748b", ambar: "#ea580c", verde: "#16a34a", vermelho: "#dc2626" };
      var cor = CORES[info.cor] || "#64748b";
      return '<span class="g-pill" style="background:' + cor + '22;color:' + cor + ';font-weight:700;margin-right:6px">' +
        Util.esc(info.rotulo || est) + '</span>' +
        acoes.map(function (a) {
          return '<button class="btn sm ' + (classe[a] || "") + '" data-acao="orc-aprov" data-aprov="' + Util.esc(a) + '">' +
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
      var dados = {};
      if (acao === "revisar" || acao === "rejeitar") {
        var m = window.prompt("Escreva o motivo — é essa mensagem que chega a quem preencheu:", "");
        if (m === null) return;                       // desistiu
        dados.motivo = String(m || "").trim();
      }
      var r = Aprovacao.transicionar(orc, acao, eu, dados);
      if (!r || !r.ok) { UI.toast((r && r.erro) || "Ação não permitida agora.", "erro"); return; }
      Aprovacao.registrar(orc, acao, eu, dados, Util.agoraISO());
      orc.estadoAprovacao = r.estado;
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
        if (this.view && !this.viewValida(this.view)) this._navegar(this.viewPadrao());
        try { this[fn](); } catch (eA) {}
        return;
      }
      if (!this.viewValida(view)) {
        try { if (typeof UI !== "undefined" && UI.toast) UI.toast('Módulo "' + view + '" não existe — abrindo o Painel.', "erro"); } catch (eT2) {}
        view = this.viewPadrao();
      }
      this._navegar(view);
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
          if (!window.confirm("Há um cadastro aberto com informações não salvas. Sair desta tela e perder o que foi preenchido?")) return;
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
      var t = e.target.closest("[data-acao],[data-abrir],[data-del-orc],[data-aba],[data-add-item],[data-del-etapa],[data-edit-etapa],[data-del-item],[data-mover-etapa],[data-mover-item],[data-add-sub],[data-edit-sub],[data-del-sub],[data-mover-sub],[data-memoria],[data-ver-insumos],[data-base-remover],[data-atz-carregar],[data-atz-baixar],[data-conta],[data-instalar],[data-atu-base],[data-cp-add],[data-cp-del],[data-toggle-etapa],[data-view],[data-gacao],[data-gopen],[data-busca-abrir],[data-avisos-abrir],[data-ajuste],[data-ajustes-lista],[data-ajuste-restaurar],[data-coef-restaurar]");
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
          Atualizacao.atualizarSinapi(function (r) {
            if (!r.ok) { pinta("⚠ " + r.erro); UI.toast(r.erro, "erro"); return; }
            if (r.basePropria) {
              pinta("Você usa uma base PRÓPRIA importada (competência " + Atualizacao.fmtComp(r.de) + ") — a atualização oficial não mexe nela. Para voltar à SINAPI oficial, remova a base própria em " + (typeof Icones !== "undefined" ? Icones.get("importar", 15) : "") + " Importar.", true);
              return;
            }
            if (r.atualizou) {
              UI.toast("SINAPI atualizada: competência " + Atualizacao.fmtComp(r.de) + " → " + Atualizacao.fmtComp(r.para) + " (" + (r.itens || 0).toLocaleString("pt-BR") + " itens).", "ok");
              selfA.abrirTabelas(); // re-abre com a competência nova na tela
            } else {
              pinta("Sem atualização — a mais recente é a competência " + Atualizacao.fmtComp(r.para) + ", no ar desde " + Atualizacao.fmtData(r.publicadoEm) + ". Você já está nela.", true);
            }
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
      // abrir orçamento
      // excluir orçamento (ANTES do abrir: o botão fica dentro do card clicável)
      if (t.dataset.delOrc) { this.confirmarExcluirOrcamento(t.dataset.delOrc); return; }
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
          if (typeof BIM !== "undefined" && BIM.reuniao && BIM.reuniao.ativa) { try { BIM.reuniao.sair(); } catch (eR) {} } if (typeof Nuvem !== "undefined") Nuvem.sair(); Auth.logout(); this.tela = "login"; this.orcAtual = null; this.render(); break;
        case "tema": this.abrirTema(); break;
        case "minha-foto": this.abrirMinhaFoto(); break;
        case "atualizar": if (typeof AutoUpdate !== "undefined" && AutoUpdate.forcar) AutoUpdate.forcar(); break; // botão manual: puxa a versão nova limpando o cache (essencial no celular, que não tem Ctrl+Shift+R)
        /* dois eixos, dois despachos: iluminação e letra são escolhas
           independentes — trocar uma não pode zerar a outra */
        case "tema-op": this.aplicarTema(t.dataset.temaVal, null); break;
        case "tema-fonte": this.aplicarTema(document.documentElement.getAttribute("data-tema"), t.dataset.fonteVal); break;
        case "esqueci-senha": this.redefinirSenhaUI(); break;
        case "empresa": this.abrirEmpresa(); break;
        case "licenca": this.abrirLicenca(); break;
        case "backup": this.abrirBackup(); break;
        case "nuvem": this.abrirNuvem(); break;
        case "celular": this.abrirCelular(); break;
        case "backup-export": this.exportarBackup(); break;
        case "menu": { var _apT = document.querySelector(".app"); if (_apT) _apT.classList.toggle("menu-aberto"); break; }
        case "conta": { var _c = t.closest(".topbar-conta"); if (_c) _c.classList.toggle("aberto"); break; }
        case "tabelas": this.abrirTabelas(); break;
        case "escanear-pasta": this.escanearPastaUI(); break;
        case "cron-recalc": this.cronRecalc(); break;
        case "cron-reset": this.cronReset(); break;
        case "cron-ia": this.cronRefinarIA(); break;
        case "exec-recalc": this.execRecalc(); break;
        case "exec-cronograma": this.execEnviarCronograma(); break;
        case "parede-explodir": this.paredeExplodir(); break;
        case "parede-aplicar": this.paredeAplicar(); break;
        case "novo": this.novoOrcamento(); break;
        case "copiar-orc": this.copiarOrcamento(); break;
        case "importar-sinapi": this.abrirImportSinapi(); break;
        case "base-oficial": this.voltarBaseOficial(); break;
        case "atualizar": this.abrirAtualizar(); break;
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
          if (typeof OrcWizard !== "undefined" && this.orcAtual) OrcWizard.editarParametros(this, this.orcAtual);
          break;
        case "escopo": this.abrirEscopo(); break;
        case "escopo-ia": this.analisarEscopoIA(); break;
        case "escopo-casar": this.refinarEscopoCasar(); break;
        case "escopo-analisar": this.analisarEscopo(); break;
        case "escopo-confirmar": this.confirmarEscopo(); break;
        case "proposta": this.gerarProposta(); break;
        case "apresentar": {
          if (!this.orcAtual || typeof Apresentacao === "undefined") { UI.toast("Abra um orçamento primeiro.", "erro"); break; }
          // apresentação é cara ao cliente: não projeta orçamento com item zerado
          var _sp = Orcamento.itensSemPreco(this.orcAtual);
          if (_sp.length) {
            UI.toast("⛔ " + _sp.length + " item(ns) sem preço (" + _sp.slice(0, 3).map(function (i) { return i.numero; }).join(", ") + (_sp.length > 3 ? "…" : "") + "). Preencha o custo na planilha antes de apresentar.", "erro");
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
          var div = String(cand.item.unidade || "").toUpperCase().replace(/\s/g, "") !== String(cam.unidade || "").toUpperCase().replace(/\s/g, "");
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
      // folha semanal de diaristas (planilha da semana, uma obra por aba)
      if (e.target.id === "fs-file") { var ff = e.target.files && e.target.files[0]; if (ff && typeof Gestao !== "undefined") Gestao.fsImportarArquivo(ff); return; }
      // ligar/desligar base de preço
      if (e.target.matches("[data-base-toggle]")) { Bases.setAtiva(e.target.dataset.baseToggle, e.target.checked); return; }
      // editar duração de etapa no cronograma
      if (e.target.matches("[data-cron-dur]")) {
        var o = this.orcAtual; if (!o) return;
        o.cronograma = o.cronograma || {}; o.cronograma.duracoes = o.cronograma.duracoes || {};
        o.cronograma.duracoes[e.target.dataset.cronDur] = Math.max(1, parseInt(Util.num(e.target.value), 10) || 1);
        if (o.cronograma.duracoesAgente) delete o.cronograma.duracoesAgente[e.target.dataset.cronDur]; // virou edição do USUÁRIO
        if (o.cronograma.iaMotivos) delete o.cronograma.iaMotivos[e.target.dataset.cronDur]; // remove justificativa IA órfã
        this.persistir(); this.render(); return;
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
        var chave = Licenca.chave(); if (!chave) return;
        var eid = Auth.empresaId();

        /* A internet voltando é o melhor momento para tentar de novo — instalado
         * uma única vez, e não a cada chamada (senão empilharia gatilhos). */
        if (!this._nuvemGatilhoRede && global.addEventListener) {
          this._nuvemGatilhoRede = true;
          global.addEventListener("online", function () {
            self._nuvemTentativa = 0;                 // a rede mudou: recomeça rápido
            try { self._conectarNuvemLicenca(); } catch (e) {}
          });
        }

        // já conectado e escutando: nada a fazer (escutar() também é idempotente)
        if (Nuvem.ligado && Nuvem.auth && Nuvem.auth.currentUser) { this._nuvemTentativa = 0; return; }

        Nuvem.entrarPorLicenca(chave)
          .then(function () { return Nuvem.sincronizar(eid); })
          .then(function () { if (window.Blocos) Blocos.usarOverrides(eid); try { self._propriaDaNuvem(); } catch (e) {} })
          .then(function () {
            self._nuvemTentativa = 0;
            try { Nuvem.escutar(eid, function (ent) { if (ent === "pesos_bloco" && window.Blocos) Blocos.usarOverrides(eid); if (typeof PropriaSync !== "undefined" && (ent === PropriaSync.ENTIDADE || ent === "_lapides")) self._propriaDaNuvem(); if (self.tela === "lista") self.render(); }); } catch (e) {}
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
      var corpo = '<p class="muted" style="margin:0 0 12px">Este é o seu <b>primeiro acesso</b>. Defina uma senha só sua para continuar.</p>' +
        '<div class="field"><label>Nova senha *</label><input id="ts-s1" type="password" placeholder="mínimo 4 caracteres" autocomplete="new-password"></div>' +
        '<div class="field"><label>Repita a nova senha *</label><input id="ts-s2" type="password" placeholder="repita" autocomplete="new-password"></div>';
      UI.modal("" + (typeof Icones !== "undefined" ? Icones.get("cadeado", 15) : "") + " Primeiro acesso — crie sua senha", corpo, [
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
        // e-mail novo → cria conta (1º acesso)
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
      UI.toast("Senha redefinida! Entrando…", "ok");
      this.tela = "lista"; this.render();
      var self = this; this.carregarBaseSinapi().then(function () { if (self.tela === "lista") self.render(); });
    },

    // URLs do analítico da UF ativa: {local} no disco + {live} no VPS (fallback garantido).
    // O analítico de TODA UF fica hospedado em CONFIG.licencaServer/analitico/ — assim o
    // detalhamento nunca some por falta do arquivo local (instalação antiga, disco, competência).
    _analiticoUrls: function () {
      var uf = String(this._baseUf || (typeof Sinapi !== "undefined" ? Sinapi.uf : "") || "").toUpperCase();
      var local = this._analiticoArquivo || (uf ? "data/sinapi-" + uf + "-analitico.json" : null);
      var live = (uf && typeof CONFIG !== "undefined" && CONFIG.licencaServer)
        ? String(CONFIG.licencaServer).replace(/\/$/, "") + "/analitico/sinapi-" + uf + "-analitico.json"
        : null;
      return { local: local, live: live };
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
      if (self._estados) return Promise.resolve(self._estados);
      return fetch("data/estados.json")
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { self._estados = (j && Array.isArray(j.estados)) ? j.estados : []; return self._estados; })
        .catch(function () { self._estados = []; return self._estados; });
    },

    // Troca a base SINAPI ativa para outra UF (lazy). cb(true|false).
    // v1.1.121 — QUALQUER UF abre: arquivo local primeiro; se faltar/corromper,
    // busca AO VIVO no servidor (mesma rota dos analíticos, .json.gz descomprimido
    // pelo VPS). Pacote de estado único ou instalação antiga deixam de ser beco
    // sem saída — só falha de verdade sem internet E sem arquivo local.
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
        UI.toast("SINAPI " + uf + " · " + (Sinapi.competencia || "") + " — " + Sinapi.resumo().total.toLocaleString("pt-BR") + " itens.", "ok");
        if (cb) cb(true);
      };
      // Caminho LOCAL com o mesmo rigor do live: fetch manual → valida token e pacote
      // ANTES do carregarDe (a corrida de cliques rápidos comitava a UF errada — gate).
      fetch(arqLocal).then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      }).then(function (j) {
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
          var urlLive = CONFIG.licencaServer + "/analitico/sinapi-" + uf + "-" + comps[idx] + ".json";
          fetch(urlLive, { cache: "no-store" }).then(function (r) {
            if (!r.ok) throw new Error("HTTP " + r.status);
            return r.json();
          }).then(function (j) {
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
      var body =
        '<p style="margin-top:0">' + (conectado
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
              p = conectado ? Promise.resolve() : Nuvem.entrarPorLicenca(Licenca.chave());
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
        '<div class="flex" style="gap:10px;margin-top:10px"><button class="btn primary" data-acao="backup-export">' + (typeof Icones !== 'undefined' ? Icones.get('salvar', 15) : '') + ' Exportar backup</button></div>' +
        '<div class="field" style="margin-top:14px"><label>Restaurar de um backup (.json)</label><input type="file" id="bkp-file" accept=".json,application/json"></div>';
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
            ? "✅ <b>Backup automático ligado</b> — " + j.total + " cópia(s) guardadas em disco. Última: <b>"
              + Util.esc(String(j.ultimoEm || "").slice(0, 19).replace("T", " ")) + "</b>."
              + (j.melhorComposicoes ? " A melhor cópia das composições próprias tem <b>" + j.melhorComposicoes + "</b> item(ns) e nunca é apagada." : "")
            : "✅ <b>Backup automático ligado</b> — ainda sem cópia gravada (a primeira sai depois da próxima alteração).")
            + '<br><span class="mono" style="font-size:11px">' + Util.esc(j.pasta || "") + "</span>";
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
      if (!opts.urgente && (Date.now() - this._bkpUltimo) < 5 * 60 * 1000) return;
      if (this._bkpTimer) clearTimeout(this._bkpTimer);
      this._bkpTimer = setTimeout(function () { self._bkpTimer = null; self._backupEnviar(); }, 15000);
    },
    _backupEnviar: function () {
      var self = this, eid, dump;
      try { eid = Auth.empresaId(); dump = this._dumpBackup(eid); } catch (e) { return; }
      /* ⚠ e a GESTÃO conta como motivo para gravar. Antes, uma conta que só
         usasse obras e diários — sem orçamento e sem base própria — nunca
         gerava backup nenhum: o arquivo simplesmente não nascia. */
      var temGestao = !!(dump.gestao && Object.keys(dump.gestao).length);
      if (!dump.orcamentos.length && !(dump.basePropria && dump.basePropria.dados.length) && !temGestao) return;
      try {
        fetch("/__backup/salvar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(dump) })
          .then(function (r) { return r.json(); })
          .then(function (j) { if (j && j.ok) { self._bkpUltimo = Date.now(); self._bkpInfo = j; } })
          .catch(function () {});
      } catch (e) {}
    },
    exportarBackup: function () {
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
         tem de chegar aos outros — senão o próximo merge trata como "não existe" */
      var self2 = this;
      dados.forEach(function (it) { self2._propriaEspelhar(it); });
      return { novos: novos, atualizados: atualizados, total: dados.length };
    },
    importarBackup: function (file) {
      var self = this, rd = new FileReader();
      rd.onload = function () {
        try {
          var dump = JSON.parse(rd.result);
          var orcs = Util.arr(dump.orcamentos);
          var temPropria = !!(dump.basePropria && Util.arr(dump.basePropria.dados).length);
          /* backup SÓ com composições próprias é válido: é exatamente o arquivo
             que a página de socorro produz num aparelho que perdeu a base. */
          if (!orcs.length && !temPropria) { UI.toast("Backup sem orçamentos e sem composições próprias.", "erro"); return; }
          var eid = Auth.empresaId();
          orcs.forEach(function (o) { Store.salvarOrcamento(eid, o); });
          var rProp = temPropria ? self._restaurarPropria(eid, dump.basePropria) : null;
          if (dump.prefs && typeof dump.prefs === "object") {
            var atual = Store.lerPrefs(eid) || {};
            for (var k in dump.prefs) if (atual[k] == null) atual[k] = dump.prefs[k];
            Store.salvarPrefs(eid, atual);
          }
          UI.toast(orcs.length + " orçamento(s) restaurado(s)"
            + (rProp ? " · composições próprias: " + rProp.novos + " nova(s), " + rProp.atualizados + " atualizada(s), " + rProp.total + " no total" : "") + ".", "ok");
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
    },
    salvarLicenca: function () {
      var chave = (UI.el("lic-chave") || {}).value || "";
      if (!Util.naoVazio(chave)) { UI.toast("Cole a chave de licença.", "erro"); return; }
      var self = this;
      UI.toast("Ativando licença…", "ok");
      Licenca.ativarOnline(chave, function (r) {
        if (!r.ok) { UI.toast(r.erro || "Chave inválida.", "erro"); return; }
        UI.fecharModal();
        UI.toast(r.offline ? "" + (typeof Icones !== "undefined" ? Icones.get("check", 15) : "") + " Licença ativada." : "" + (typeof Icones !== "undefined" ? Icones.get("check", 15) : "") + " Licença ativada e vinculada a esta máquina!", "ok");
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
      UI.fecharModal();
      UI.toast("Dados da empresa salvos. Aparecem nos documentos.", "ok");
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
      var o = this.orcAtual; if (o && o.cronograma) { o.cronograma.duracoes = {}; o.cronograma.iaMotivos = {}; o.cronograma.duracoesAgente = {}; }
      // FASE 1.4: destrava também o nº de meses (false explícito ≠ undefined: não re-dispara a migração)
      if (o) { o.cronogramaMesesManual = false; try { Orcamento.sincronizarPrazo(o); } catch (e) {} }
      this.persistir(); UI.toast("Durações e prazo voltaram à estimativa do agente.", "ok"); this.render();
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
      if (UI.el("exec-inicio")) this._execLerParams(o); // usa os inputs ATUAIS (não os salvos/stale)
      // durações do agente dependem só do Hh (não da diária), então colaboradores não são necessários aqui
      var sim = Execucao.simular(o, {});
      o.cronograma = o.cronograma || {};
      // proveniência + limpeza de stale ficam no motor puro (testável): ver Execucao.aplicarNoCronograma
      var apl = Execucao.aplicarNoCronograma(o.cronograma, sim.etapas);
      var nEnv = apl.enviadas;
      if (sim.params.dataInicio) { o.cronograma.params = o.cronograma.params || {}; o.cronograma.params.dataInicio = (typeof sim.dataInicio.toISOString === "function") ? sim.dataInicio.toISOString().slice(0, 10) : sim.params.dataInicio; }
      try { Orcamento.sincronizarPrazo(o); } catch (e) {}
      var nPula = sim.etapas.length - nEnv;
      this.persistir(); UI.toast("Durações do agente aplicadas ao Cronograma (" + nEnv + " etapa" + (nEnv === 1 ? "" : "s") + (nPula > 0 ? "; " + nPula + " não estimável(is) não foram alteradas" : "") + ").", "ok"); this.render();
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
            // re-checa unidade do candidato agora escolhido (usuário pode ter corrigido p/ um M2)
            var div = String((cand.item.unidade || "")).toUpperCase().replace(/\s/g, "") !== String(c.unidade || "").toUpperCase().replace(/\s/g, "");
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
      UI.toast("" + (typeof Icones !== "undefined" ? Icones.get("ia", 15) : "") + " Consultando a IA do ERP (planejador)…", "ok");
      fetch(back + "/ia/cronograma", { method: "POST", headers: { "Content-Type": "application/json", "x-licenca": (typeof Licenca !== "undefined" ? Licenca.chave() : "") }, body: JSON.stringify({ etapas: etapas, equipes: (r.params.equipes || 1) }) })
        .then(function (resp) { return resp.json(); })
        .then(function (j) {
          if (!j.ok) { UI.toast("IA: " + (j.error || "não retornou"), "erro"); return; }
          o.cronograma = o.cronograma || {}; o.cronograma.duracoes = o.cronograma.duracoes || {}; o.cronograma.iaMotivos = {}; o.cronograma.duracoesAgente = o.cronograma.duracoesAgente || {};
          var n = 0;
          (j.etapas || []).forEach(function (x) { var et = etapas[x.i]; if (et && x.dias >= 1) { o.cronograma.duracoes[et.id] = Math.round(Util.num(x.dias)); o.cronograma.iaMotivos[et.id] = x.motivo || ""; o.cronograma.duracoesAgente[et.id] = "ia"; n++; } });
          self.persistir();
          UI.toast("🤖 " + n + " etapas refinadas pela IA (" + (j.provider || "") + "). Passe o mouse no " + (typeof Icones !== "undefined" ? Icones.get("ia", 15) : "") + " p/ ver o motivo; edite se quiser.", "ok");
          self.render();
        })
        .catch(function (e) { UI.toast("Sem conexão com a IA — o ERP/servidor (porta 3040) está ligado? " + e.message, "erro"); });
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
        b.classList.toggle("on", t ? t === tema : f === fonte);
        b.setAttribute("aria-pressed", (t ? t === tema : f === fonte) ? "true" : "false");
      }
    },
    // Seletor de tema: Claro (como o site) + 5 tons de escuro (cores do logo RA)
    /* =================================================================
     * MINHA FOTO DE PERFIL
     * Fica no menu da conta porque e da PESSOA, nao da empresa: o logo da
     * empresa ja tem lugar proprio em ⚙ Empresa. Sub-usuario e dono usam a
     * mesma tela; quem decide onde gravar e o Empresa.salvarFotoUsuario.
     * ================================================================= */
    abrirMinhaFoto: function () {
      var u = (typeof Auth !== "undefined" && Auth.usuario && Auth.usuario()) || {};
      var quem = u.nome || u.empresa || u.email || "";
      var atual = (typeof Empresa !== "undefined" && Empresa.fotoUsuario) ? Empresa.fotoUsuario() : "";
      var ini = (typeof Empresa !== "undefined" && Empresa.iniciais) ? Empresa.iniciais(quem) : "?";
      var escolhida = null, mexeu = false;
      UI.modal("" + (typeof Icones !== "undefined" ? Icones.get("pessoa", 15) : "") + " Minha foto de perfil",
        '<p class="muted" style="margin-top:0;font-size:13px">Aparece na barra do topo, ao lado do nome da empresa. Só você vê a sua — cada pessoa da equipe tem a dela.</p>' +
        '<div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">' +
          '<div id="mf-prev" class="perfil-prev">' + (atual ? '<img src="' + atual + '" alt="">' : '<span class="ini">' + Util.esc(ini) + '</span>') + '</div>' +
          '<div style="display:flex;flex-direction:column;gap:8px">' +
            '<input type="file" id="mf-in" accept="image/*">' +
            '<button type="button" class="btn sm" id="mf-rm"' + (atual ? '' : ' style="display:none"') + '>Voltar para as iniciais</button>' +
            '<span class="muted" style="font-size:11.5px">A imagem é reduzida para 128 px — fica leve e não atrapalha a sincronização.</span>' +
          '</div>' +
        '</div>',
        [{ texto: "Salvar", classe: "primary", onClick: function () {
            if (!mexeu) { UI.fecharModal(); return; }
            if (typeof Empresa === "undefined" || !Empresa.salvarFotoUsuario) { UI.toast("Não foi possível salvar.", "erro"); return; }
            if (Empresa.salvarFotoUsuario(escolhida) === false) { UI.toast("Não achei seu cadastro na equipe para guardar a foto.", "erro"); return; }
            UI.fecharModal(); App.render();
            UI.toast(escolhida ? "Foto atualizada." : "Voltou para as iniciais.", "ok");
          } },
         { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } }]);

      function pintar(d) {
        var pv = UI.el("mf-prev"), rm = UI.el("mf-rm");
        if (!pv) return;
        pv.innerHTML = d ? '<img src="' + d + '" alt="">' : '<span class="ini">' + Util.esc(ini) + '</span>';
        if (rm) rm.style.display = d ? "" : "none";
      }
      var inp = UI.el("mf-in");
      if (inp) inp.onchange = function () {
        var f = inp.files && inp.files[0]; if (!f) return;
        /* 128 px e o dobro do tamanho que a barra desenha (retina) — mais que
           isso e peso a toa num dado que viaja na sincronizacao. */
        Gestao._comprimirFoto(f, 128, 0.85, function (d) {
          if (!d) { UI.toast("Arquivo não é uma imagem válida.", "erro"); inp.value = ""; return; }
          escolhida = d; mexeu = true; pintar(d);
        });
      };
      var rm = UI.el("mf-rm");
      if (rm) rm.onclick = function () { escolhida = null; mexeu = true; if (inp) inp.value = ""; pintar(""); };
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

      UI.modal("Aparência",
        '<p class="muted" style="margin:0 0 6px;font-size:var(--t-peq)">A mudança é na hora e fica salva neste aparelho. Cada pessoa da equipe tem a sua.</p>' +
        '<div class="tema-grupo"><span class="tema-rot">Iluminação da tela</span>' +
          '<div class="tema-ops">' + luz.map(cardLuz).join("") + "</div></div>" +
        '<div class="tema-grupo"><span class="tema-rot">Letra</span>' +
          '<div class="tema-ops">' + fontes.map(cardFonte).join("") + "</div></div>" +
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
      var self = this;
      try {
        if (typeof Analitico === "undefined") return;
        if (Analitico.carregado || Analitico.carregando) return;
        var u = this._analiticoUrls();
        if (!u.local && !u.live) return;
        // pré-carrega já com o fallback AO VIVO embutido — se um clique em 🔍 pegar esta
        // promise compartilhada no meio do caminho, ela já sabe cair no VPS.
        setTimeout(function () {
          try {
            if (!Analitico.carregado && !Analitico.carregando) {
              Analitico.carregarArquivo(u.local || u.live, u.live).then(function () {
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
            o.art = (UI.el("ed-art") || {}).value || "";
            o.dataVistoria = (UI.el("ed-vistoria") || {}).value || "";
            c.condicoesPagamento = (UI.el("ed-pag") || {}).value || "";
            c.prazoExecucao = (UI.el("ed-prazo") || {}).value || "";
            c.validadeProposta = (UI.el("ed-val") || {}).value || "";
            c.garantia = (UI.el("ed-gar") || {}).value || "";
            c.incluso = (UI.el("ed-inc") || {}).value || "";
            c.excluso = (UI.el("ed-exc") || {}).value || "";
            self._edSalvarBase(o, function () {
              self.persistir(); UI.fecharModal(); self.render(); UI.toast("Dados salvos.", "ok");
            });
          } }
        ]);
      this._edBindBase(o);
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
          '<input id="fx-alvo" class="cell" style="width:100%;font-size:19px;padding:9px;font-weight:700" ' +
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
            var dica = "";
            if (f.tipo === "insumo") {
              dica = " — esta base pode não ter insumos (carregue uma base de insumos em " + (typeof Icones !== "undefined" ? Icones.get("tabela", 15) : "") + " Tabelas)";
            } else if (f.desonerado === true) {
              dica = " — a SINAPI que vem no app é a NÃO DESONERADA (encargos sociais sem desoneração, como a CAIXA publica nas abas CSD/ISD). Tire o filtro de oneração para vê-la";
            } else if (f.desonerado === false) {
              dica = " — nenhuma base carregada declara o regime não desonerado para este termo";
            }
            // v1.1.124 — não existe nas bases? cria DAQUI, sem sair do fluxo. O
            // atalho acompanha o filtro: buscando INSUMO → cadastra insumo próprio;
            // senão → cria composição própria (descrição aproveitada nos dois).
            var ehIns0 = f.tipo === "insumo";
            box.innerHTML = '<div class="vazio">Nenhum resultado para "' + Util.esc(q) + '"' + dica + ".</div>" +
              '<button type="button" class="btn primary" id="bs-criar-cp" style="width:100%;margin-top:8px">' + (ehIns0 ? "" + (typeof Icones !== "undefined" ? Icones.get("mais", 15) : "") + " Cadastrar insumo próprio com esta descrição" : "" + (typeof Icones !== "undefined" ? Icones.get("mais", 15) : "") + " Criar composição própria com esta descrição") + '</button>';
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
      var self = this;
      function gerar() { UI.toast("Gerando Excel (com aba de Insumos)…", "ok"); ExcelOrc.gerar(self.orcAtual); }
      // Garante o analítico do ESTADO ATIVO carregado — para a aba Insumos sair certa em QUALQUER UF
      // (com fallback AO VIVO: mesmo sem o arquivo local, a aba Insumos sai preenchida).
      var ana = (typeof Analitico !== "undefined") ? Analitico : null;
      var ufAtivo = self._baseUf || (typeof Sinapi !== "undefined" ? Sinapi.uf : null) || null;
      var urlsX = self._analiticoUrls();
      if (!ana || (!urlsX.local && !urlsX.live) || (ana.carregado && (!ufAtivo || !ana.uf || ana.uf === ufAtivo))) { gerar(); return; }
      if (ana.reset && ana.uf && ufAtivo && ana.uf !== ufAtivo) ana.reset();
      UI.toast("Carregando insumos de " + (ufAtivo || "") + " (1ª vez)…", "ok");
      ana.carregarArquivo(urlsX.local || urlsX.live, urlsX.live).then(gerar).catch(function () { gerar(); });
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
            if (!difs.length) { UI.toast("Nenhuma diferença entre o Excel e o orçamento — nada a importar.", "ok"); return; }
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
        var bgP = UI.modal("" + (typeof Icones !== "undefined" ? Icones.get("buscar", 15) : "") + " Composição própria " + String(codigo) + " — Insumos", UI.renderInsumos(aP, ufAtivo), [
          { texto: "" + (typeof Icones !== "undefined" ? Icones.get("editar", 15) : "") + " Editar composição", classe: "ghost", onClick: function () { UI.fecharModal(); self.editarComposicao(String(codigo)); } },
          { texto: "⧉ Duplicar", classe: "ghost", onClick: function () { UI.fecharModal(); self.duplicarComposicao(String(codigo)); } },
          { texto: "Fechar", classe: "primary", onClick: function () { UI.fecharModal(); } }
        ]);
        UI.modalConsulta(); // detalhamento é leitura
        var mP = bgP.querySelector(".modal"); if (mP) mP.style.maxWidth = "900px";
        return;
      }
      function abrir() {
        var a = Analitico.obter(codigo);
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
        var bg = UI.modal("" + (typeof Icones !== "undefined" ? Icones.get("buscar", 15) : "") + " Composição " + codigo + " — Insumos", UI.renderInsumos(a, ufAtivo), [
          // v1.1.124 — "quero essa, mas com MEU coeficiente": clona p/ composição própria
          { texto: "🧬 Criar minha versão", classe: "ghost", onClick: function () { self.criarVersaoPropria(String(codigo)); } },
          { texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } }
        ]);
        var m = bg && bg.querySelector(".modal"); if (m) m.style.maxWidth = "900px";
      }
      // Já carregado E é do estado ativo? abre direto.
      if (Analitico.carregado && (!ufAtivo || !Analitico.uf || Analitico.uf === ufAtivo)) { abrir(); return; }
      // URLs local + AO VIVO (VPS). O analítico da região SEMPRE existe no servidor, então
      // mesmo que o disco do cliente não tenha o arquivo, o detalhamento carrega ao vivo.
      var urls = self._analiticoUrls();
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
      Analitico.carregarArquivo(urls.local || urls.live, urls.live).then(function () { self._insumosCarregando = null; UI.loadingFim(); abrir(); }).catch(function (e) {
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
    excluirProprio: function (codigo) {
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
      var corpo = '<div class="field" style="margin-bottom:8px"><input id="mc-filtro" placeholder="Buscar por código ou descrição…" value="' + Util.esc(this._mcFiltro) + '"></div>' +
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
      if (!item && (!fonte || fonte === "SINAPI") && typeof Analitico !== "undefined" && Analitico.carregado) {
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
            if (!c.grupo) c.grupo = ComposicaoPropria.GRUPOS.indexOf(String(prop.grupo).toUpperCase()) >= 0 ? String(prop.grupo).toUpperCase() : "OUTROS";
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
      var urls = this._analiticoUrls();
      UI.loading("Carregando o detalhamento oficial p/ o agente…");
      Analitico.carregarArquivo(urls.local || urls.live, urls.live).then(function () { UI.loadingFim(); rodar(); })
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
        item.criadoPor = (typeof Auth !== "undefined" && Auth.nome) ? Auth.nome() : ""; // auditoria: quem criou
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
                afetados.forEach(function (a) { Store.salvarOrcamento(eidRp, a.orc); });
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
      afetados.forEach(function (a) { Store.salvarOrcamento(eid, a.orc); });
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
        aoFechar: function () { self.analisarEscopo(); }
      });
    },

    elaborarComposicao: function (descricao, opts) {
      var self = this, o = opts || {};
      var desc = String(descricao || "").trim();
      if (!desc) { UI.toast("Descreva o serviço para o agente elaborar.", "erro"); return; }
      var rodar = function () {
        var r = ComposicaoPropria.elaborar(desc, {
          analitico: Analitico.todos(),
          resolve: function (cod, fonte) { return self._cpResolve(cod, fonte); },
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
              codigosExistentes: self._cpCodigosExistentes(),
              unidade: o.unidade || "", grupo: o.grupo || "",
              forcarReferencia: ref.trocarPara.codigo
            });
            if (r2.ok) { r2.viaIA = true; if (ref.descricaoSugerida) r2.comp.descricao = ref.descricaoSugerida; abrir(r2); return; }
          }
          if (ref.descricaoSugerida) { r.comp.descricao = ref.descricaoSugerida; r.viaIA = true; }
          abrir(r);
        }).catch(function () { abrir(r); });   // offline/timeout: segue com o motor
        return;
      };
      var abrir = function (r) {
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
          (r.aviso || "confira os coeficientes e grave."), r.confianca === "alta" ? "ok" : "erro");
      };
      if (typeof Analitico !== "undefined" && Analitico.carregado) { rodar(); return; }
      var urls = this._analiticoUrls();
      UI.loading("Carregando a base analítica para o agente…");
      Analitico.carregarArquivo(urls.local || urls.live, urls.live)
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
      c.grupo = ComposicaoPropria.GRUPOS.indexOf(String(prop.grupo).toUpperCase()) >= 0 ? String(prop.grupo).toUpperCase() : "OUTROS";
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
      UI.toast("" + (typeof Icones !== "undefined" ? Icones.get("ia", 15) : "") + " Estruturando o escopo com a IA do ERP…", "ok");
      fetch(back + "/ia/orcamento", { method: "POST", headers: { "Content-Type": "application/json", "x-licenca": (typeof Licenca !== "undefined" ? Licenca.chave() : "") }, body: JSON.stringify({ descricao: txt }) })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j.ok || !j.resultado) { UI.toast("IA: " + (j.error || "não retornou estrutura"), "erro"); return; }
          self._escopo = Escopo.analisarItensIA(j.resultado.etapas || [], { excluirFontes: self._fontesExcluidas() });
          if (!self._escopo.length) { UI.toast("A IA não retornou itens.", "erro"); return; }
          self._escopoIA = true;
          var ok = self._escopo.filter(function (l) { return l.escolhido > -1; }).length;
          UI.toast("✅ " + self._escopo.length + " serviços estruturados (" + ok + " com sugestão). Use " + (typeof Icones !== "undefined" ? Icones.get("alvo", 15) : "") + " Refinar p/ a IA escolher o código exato.", "ok");
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
      UI.toast("" + (typeof Icones !== "undefined" ? Icones.get("alvo", 15) : "") + " Refinando os matches com a IA…", "ok");
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
      this._abrirPrint("" + (typeof Icones !== "undefined" ? Icones.get("nota", 15) : "") + " Proposta — " + this.orcAtual.numero, Proposta.gerarHTML(this.orcAtual, Auth.usuario()));
    },

    // Anexo Técnico de Orçamento p/ LAUDO pericial (não comercial)
    gerarLaudo: function () {
      if (this._trialBloqueado()) { this._avisoTrial(); return; }
      if (!Auth.podeUsar("proposta")) { UI.toast("Anexo p/ laudo é recurso PRO.", "erro"); return; }
      var val = Laudo.validar(this.orcAtual);
      if (!val.ok) { UI.toast("Faltam dados: " + val.faltando.join(", "), "erro"); return; }
      this._abrirPrint("" + (typeof Icones !== "undefined" ? Icones.get("nota", 15) : "") + " Anexo de Orçamento p/ Laudo — " + this.orcAtual.numero, Laudo.gerarHTML(this.orcAtual, Auth.usuario()));
    },

    // Relatório técnico completo: sintético + analítico detalhado
    gerarRelatorio: function () {
      if (this._trialBloqueado()) { this._avisoTrial(); return; }
      var t = Orcamento.totais(this.orcAtual);
      if (t.qtdItens < 1) { UI.toast("Adicione itens antes de gerar o relatório.", "erro"); return; }
      var self = this;
      function abrir() {
        self._abrirPrint("" + (typeof Icones !== "undefined" ? Icones.get("relatorio", 15) : "") + " Relatório de Orçamento — " + self.orcAtual.numero,
          UI.renderRelatorioCompleto(self.orcAtual, Auth.usuario()));
      }
      // Carrega o analítico da UF (1ª vez) p/ incluir a seção de composições e insumos; degrada sem travar.
      var ana = (typeof Analitico !== "undefined") ? Analitico : null;
      var ufAtivo = self._baseUf || (typeof Sinapi !== "undefined" ? Sinapi.uf : null) || null;
      var urlsR = self._analiticoUrls();
      if (!ana || (!urlsR.local && !urlsR.live) ||
          (ana.carregado && (!ufAtivo || !ana.uf || ana.uf === ufAtivo))) { abrir(); return; }
      if (ana.reset && ana.uf && ufAtivo && ana.uf !== ufAtivo) ana.reset();
      UI.toast("Carregando insumos das composições (1ª vez)…", "ok");
      ana.carregarArquivo(urlsR.local || urlsR.live, urlsR.live).then(abrir).catch(function () { abrir(); });
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
        self._lerPlanilha(f, function (matriz, erro, meta) {
          if (erro || !matriz || !matriz.length) { UI.toast("Não consegui ler a planilha: " + (erro || "vazia"), "erro"); return; }
          // planilha gerada por este app: o orçamento inteiro está na _meta
          if (meta && meta.snapshot) { self._abrirRestaurarSnapshot(meta.snapshot, f.name, matriz, meta); return; }
          var res = Importador.analisar(matriz);
          self._imp = { matriz: matriz, nome: f.name, res: res, abas: (meta && meta.abas) || null, abaIdx: (meta && meta.idx) || 0 };
          self._abrirImportPreview();
        });
      };
      document.body.appendChild(inp); inp.click(); setTimeout(function () { try { inp.remove(); } catch (e) {} }, 0);
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
              var abas = (wb.SheetNames || []).map(function (nm) {
                return { nome: String(nm), matriz: XLSX.utils.sheet_to_json(wb.Sheets[nm], { header: 1, blankrows: true, defval: "" }) };
              }).filter(function (a) { return a.matriz.length; });
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
            }).catch(function (e) { cb(null, App._msgExcelErro(e)); });
          } catch (e) { cb(null, App._msgExcelErro(e)); }
        });
      };
      fr.onerror = function () { cb(null, "falha ao ler o arquivo"); };
      fr.readAsArrayBuffer(file);
    },
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
        if (ch === '"') { if (q && txt[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
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
    _abrirPrint: function (titulo, htmlConteudo) {
      this.fecharProposta();
      // White-label: o <title> da página sai no cabeçalho/rodapé de impressão do
      // navegador — enquanto o documento está aberto, o título vira o do DOCUMENTO
      // (com o nome da empresa do cliente), não o do produto. Restaura ao fechar.
      if (this._tituloApp == null) this._tituloApp = document.title;
      var nomeEmp = (typeof Empresa !== "undefined" && Empresa.nomeDoc) ? Empresa.nomeDoc() : "";
      try { document.title = (titulo || "Documento") + (nomeEmp ? " — " + nomeEmp : ""); } catch (eT) {}
      var overlay = document.createElement("div");
      overlay.className = "proposta-overlay"; overlay.id = "proposta-print";
      overlay.innerHTML =
        '<div class="prop-toolbar no-print"><span class="ttl">' + Util.esc(titulo) + '</span>' +
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
      return !s.ativo;                    // licenciado: bloqueia se não está ativo (vencida/carência/outra máquina)
    },
    _avisoTrial: function () {
      var s = (typeof Licenca !== "undefined") ? Licenca.status() : {};
      var msg;
      if (s.expirada) msg = "Sua licença venceu. Renove para continuar salvando e exportando.";
      else if (s.outroDispositivo) msg = "Esta licença está ativada em outra máquina. Fale com o suporte para liberar.";
      else if (s.revalidar) msg = "Reconecte à internet para revalidar sua licença (alguns dias sem checar).";
      else if (s.trial && s.expirado) msg = "⏰ Seu teste grátis de 7 dias terminou. Ative uma licença (🔑) para continuar salvando e exportando — seus orçamentos estão preservados.";
      else msg = "" + (typeof Icones !== "undefined" ? Icones.get("cadeado", 15) : "") + " Ative sua licença (🔑) para salvar e exportar.";
      UI.toast(msg, "erro");
      try { this.abrirLicenca(); } catch (e) {}
    },

    persistir: function () {
      if (!this.orcAtual) return;
      if (this._trialBloqueado()) {
        if (!this._avisouSalvar) { this._avisouSalvar = true; UI.toast("" + (typeof Icones !== "undefined" ? Icones.get("cadeado", 15) : "") + " Modo demonstração — para salvar, ative sua licença (🔑).", "erro"); }
        return;
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
        return;
      }
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
        UI.toast("Não foi possível salvar — armazenamento cheio. Exporte um backup (💾) e remova a base SINAPI grande do navegador.", "erro");
        try { this.abrirBackup(); } catch (e) {}
      } else if (ok) { this._avisouQuota = false; try { this.backupAuto(); } catch (e) {} }
    }
  };

  global.App = App;
  document.addEventListener("DOMContentLoaded", function () { App.iniciar(); });
})(window);
