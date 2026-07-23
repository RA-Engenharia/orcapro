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
      // tema salvo (tema = claro/escuro; tom = variação do escuro: azul/preto/verde/marrom/ra)
      var tema = localStorage.getItem("orcapro:tema") || "light";
      document.documentElement.setAttribute("data-tema", tema);
      document.documentElement.setAttribute("data-tom", localStorage.getItem("orcapro:tom") || "azul");

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
      // LOTE 1: aviso preventivo de armazenamento — evita o QuotaExceeded silencioso
      try {
        var u0 = Auth.usuario();
        if (u0) {
          var sd = Store.saude(u0.empresaId);
          if (sd.usoPct >= 80) UI.toast("⚠ Armazenamento local em " + sd.usoPct + "% — faça 💾 Backup e remova bases não usadas em 🗂 Tabelas.", "erro");
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
              else if (_t > 48) { clearInterval(_iv); if (typeof UI !== "undefined") UI.toast("Abra ou gere o modelo 3D e toque em 🥽 RA/RV.", "info"); }
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
        '<button id="rv-upd" title="Buscar atualização" style="position:absolute;top:calc(env(safe-area-inset-top,0px) + 8px);right:8px;z-index:2147483000;background:rgba(15,39,64,.92);color:#dbe8f5;border:1px solid #24435f;border-radius:9px;padding:8px 11px;font-size:14px;font-family:Inter,system-ui,sans-serif;cursor:pointer;-webkit-tap-highlight-color:transparent">🔄</button>' +
        // 👥 Reunião — QUALQUER pessoa do link entra na mesma sala e vê os outros (cap 20). Escondido até o modelo carregar.
        '<button id="rv-reun" style="display:none;position:absolute;top:calc(env(safe-area-inset-top,0px) + 8px);left:8px;z-index:2147483000;background:rgba(22,115,74,.94);color:#eafff2;border:1px solid #1c7a4a;border-radius:9px;padding:8px 12px;font-size:13px;font-weight:600;font-family:Inter,system-ui,sans-serif;cursor:pointer;-webkit-tap-highlight-color:transparent">👥 Reunião</button>' +
        // 🎤 áudio walkie-talkie — só aparece dentro de uma reunião (precisa de toque p/ liberar o mic)
        '<button id="rv-audio" style="display:none;position:absolute;top:calc(env(safe-area-inset-top,0px) + 50px);left:8px;z-index:2147483000;background:rgba(15,39,64,.94);color:#dbe8f5;border:1px solid #2e6f9e;border-radius:9px;padding:8px 12px;font-size:13px;font-weight:600;font-family:Inter,system-ui,sans-serif;cursor:pointer;-webkit-tap-highlight-color:transparent">🎤 Áudio</button>' +
        '<div id="rv-load" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#dbe8f5;font-family:Inter,system-ui,sans-serif;gap:10px;text-align:center;padding:20px">' +
        '<div style="font-size:34px">☁️</div><div id="rv-load-txt" style="font-size:15px">Baixando o projeto…</div>' +
        '<div style="font-size:12px;color:#8fa3b8;max-width:320px">Depois, toque em 👣 Caminhar (ou 📱 RA no Android) no painel.</div></div></div>';
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
            onReuniaoFalha: function () { App._rvReunBadge(0); alert("A reunião caiu (sem internet?). O modelo segue normal — toque em 👥 pra reconectar."); },
            onReuniaoCheia: function () { App._rvReunBadge(0); alert("👥 Sala cheia — o limite é de 20 pessoas nesta reunião. Tente de novo quando alguém sair."); },
            onVoz: function (on) { App._rvAudioBadge(on); },
            onFala: function (falando) { var b = document.getElementById("rv-audio"); if (b && BIM.reuniao.audioAtiva) b.style.boxShadow = falando ? "0 0 0 3px rgba(22,163,74,.9)" : "none"; },
            onVozErro: function (nm) { App._rvAudioBadge(false); alert(nm === "NotAllowedError" ? "🎤 Você negou o microfone. Toque em 🎤 de novo e permita." : "🎤 Não consegui abrir o microfone: " + nm); }
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
      else { b.textContent = "👥 Reunião"; b.style.background = "rgba(22,115,74,.94)"; b.style.borderColor = "#1c7a4a"; }
      var a = document.getElementById("rv-audio"); if (a) { a.style.display = ativa ? "block" : "none"; if (!ativa) App._rvAudioBadge(false); } // áudio só faz sentido na reunião
    },
    _rvAudioBadge: function (on) {
      var a = document.getElementById("rv-audio"); if (!a) return;
      if (on) { a.textContent = "🎤 Áudio ligado"; a.style.background = "rgba(22,163,74,.94)"; a.style.borderColor = "#16a34a"; }
      else { a.textContent = "🎤 Áudio"; a.style.background = "rgba(15,39,64,.94)"; a.style.borderColor = "#2e6f9e"; a.style.boxShadow = "none"; }
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
          '<b style="font-size:15px">👥 Entrar na reunião</b>' +
          '<p style="font-size:12.5px;color:#9fb2c8;margin:8px 0 14px">Todo mundo com este link se vê dentro do modelo. Seu nome e telefone aparecem na camisa do seu avatar (até 20 pessoas).</p>' +
          '<label style="font-size:12px;color:#9fb2c8">Seu nome *</label>' +
          '<input id="rvr-nome" value="' + (self._escAttr(g.nome || "")) + '" placeholder="Como os outros te veem" style="width:100%;box-sizing:border-box;margin:4px 0 12px;padding:10px;border-radius:9px;border:1.5px solid #24435f;background:#0b1e33;color:#eaf2fb;font-size:14px">' +
          '<label style="font-size:12px;color:#9fb2c8">Você é</label>' +
          '<div style="display:flex;gap:8px;margin:4px 0 12px"><button type="button" data-sx="h" class="rvr-sx" style="flex:1;padding:9px;border-radius:9px;border:1.5px solid #24435f;background:#0b1e33;color:#eaf2fb;font-size:13px;cursor:pointer">👷 Homem</button><button type="button" data-sx="m" class="rvr-sx" style="flex:1;padding:9px;border-radius:9px;border:1.5px solid #24435f;background:#0b1e33;color:#eaf2fb;font-size:13px;cursor:pointer">👷‍♀️ Mulher</button></div>' +
          '<label style="font-size:12px;color:#9fb2c8">Telefone (aparece na camisa)</label>' +
          '<input id="rvr-tel" value="' + (self._escAttr(g.tel || "")) + '" placeholder="(00) 00000-0000" inputmode="tel" style="width:100%;box-sizing:border-box;margin:4px 0 16px;padding:10px;border-radius:9px;border:1.5px solid #24435f;background:#0b1e33;color:#eaf2fb;font-size:14px">' +
          '<div style="display:flex;gap:8px"><button type="button" id="rvr-ok" style="flex:1;padding:11px;border-radius:9px;border:0;background:#16a34a;color:#fff;font-size:14px;font-weight:700;cursor:pointer">🚀 Entrar</button><button type="button" id="rvr-cancel" style="padding:11px 14px;border-radius:9px;border:1.5px solid #24435f;background:transparent;color:#cbd8e6;font-size:14px;cursor:pointer">Cancelar</button></div>' +
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
        else { ab.textContent = "🎤 Ativando…"; BIM.reuniao.audioEntrar(); } // onVoz confirma; erro → onVozErro
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
      if (vw && vw !== "orcamentos" && typeof Gestao !== "undefined") { this.view = vw; this.tela = "gestao"; }
      // Sem deep-link (?view=/?aba=), a vitrine abre na NOVA CARA: Painel Executivo/Financeiro
      // (a OBRA TESTE alimenta os gráficos; quem quer o editor usa ?aba=planilha como antes).
      if (!vw && !/[?&]aba=/.test(qs) && typeof Gestao !== "undefined") { this.view = "dashboard"; this.tela = "gestao"; }
      this.bindGlobal();
      this.render();
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
          try { ObraDemo.remover(); } catch (e2) {}
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

    /* Navegação programática por módulo (Busca universal, sino de avisos, tour):
     * mesmo caminho do clique na sidebar — teardown do BIM incluído. Fecha modal
     * CRUD aberto (senão a view troca por baixo e o modal fica órfão por cima). */
    irPara: function (view) {
      if (!view) return;
      try { if (typeof UI !== "undefined" && UI.fecharModal && document.querySelector(".modal-bg")) UI.fecharModal(); } catch (eM) {}
      if (view !== "bim" && typeof BIM !== "undefined" && BIM.reuniao && BIM.reuniao.ativa) { try { BIM.reuniao.sair(); } catch (eR) {} }
      var ap = document.querySelector(".app"); if (ap) ap.classList.remove("menu-aberto");
      this.view = view;
      this.tela = (view === "orcamentos" ? "lista" : "gestao");
      this.orcAtual = null;
      try { if (typeof Telemetria !== "undefined") Telemetria.contaModulo(view); } catch (eTm) {}
      this.render();
    },

    onClick: function (e) {
      // celular: fecha a gaveta de módulos ao tocar fora dela (não no ☰, não num item)
      var _apM = document.querySelector(".app.menu-aberto");
      if (_apM && !(e.target.closest && (e.target.closest("#sidebar") || e.target.closest(".topbar-burger")))) { _apM.classList.remove("menu-aberto"); }
      // fecha o menu de conta ao clicar fora do botão (itens fecham após rodar sua ação)
      var _conta = document.querySelector(".topbar-conta.aberto");
      if (_conta && !(e.target.closest && e.target.closest('[data-acao="conta"]'))) { _conta.classList.remove("aberto"); }
      var t = e.target.closest("[data-acao],[data-abrir],[data-aba],[data-add-item],[data-del-etapa],[data-edit-etapa],[data-del-item],[data-memoria],[data-ver-insumos],[data-base-remover],[data-atz-carregar],[data-atz-baixar],[data-conta],[data-inclusa],[data-view],[data-gacao],[data-gopen],[data-busca-abrir],[data-avisos-abrir]");
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
      // carregar base inclusa (1 clique) — LIVE-FIRST: tenta a versão mais recente
      // regenerada no VPS (rota /bases/), cai na inclusa do pacote se offline.
      if (t.dataset.inclusa) {
        var pin = String(t.dataset.inclusa).split("|"); var selfI = this;
        UI.toast("Carregando base inclusa…", "ok");
        var nomeArq = String(pin[0]).split("/").pop();
        var liveUrl = (typeof CONFIG !== "undefined" && CONFIG.licencaServer) ? (String(CONFIG.licencaServer).replace(/\/$/, "") + "/bases/" + nomeArq) : null;
        function cair(url, ehLive) { return Bases.carregarInclusa(url, pin[1]).then(function (r) { r._live = ehLive; return r; }); }
        var pInc = liveUrl ? cair(liveUrl, true).catch(function () { return cair(pin[0], false); }) : cair(pin[0], false);
        pInc.then(function (r) {
          UI.toast(r.fonte + " carregada: " + r.total.toLocaleString("pt-BR") + " itens (" + (r.competencia || "") + "/" + (r.uf || "") + ")" + (r._live ? " — online, mais recente" : " — inclusa") + "." + (r.persistido ? "" : " ⚠ " + r.gravErro), r.persistido ? "ok" : "erro");
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
      // memória de cálculo do quantitativo "etapaId|itemId" (FASE 3, Lei 14.133)
      if (t.dataset.memoria) {
        var pm = t.dataset.memoria.split("|");
        this.abrirMemoria(pm[0], pm[1]); return;
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
        case "logout":
          // Na VITRINE (?demo=1): sair = recarregar a página LIMPA (sem ?demo=1). Sem isso,
          // (a) o seed assíncrono da OBRA TESTE poderia gravar no tenant errado após o logout
          // e (b) a flag _demo sobreviveria a um login real na mesma página (bypass de licença).
          if (this._demo) { try { location.href = location.pathname; } catch (eD) {} break; }
          if (typeof BIM !== "undefined" && BIM.reuniao && BIM.reuniao.ativa) { try { BIM.reuniao.sair(); } catch (eR) {} } if (typeof Nuvem !== "undefined") Nuvem.sair(); Auth.logout(); this.tela = "login"; this.orcAtual = null; this.render(); break;
        case "tema": this.abrirTema(); break;
        case "atualizar": if (typeof AutoUpdate !== "undefined" && AutoUpdate.forcar) AutoUpdate.forcar(); break; // botão manual: puxa a versão nova limpando o cache (essencial no celular, que não tem Ctrl+Shift+R)
        case "tema-op": this.aplicarTema(t.dataset.temaVal, t.dataset.tomVal); break;
        case "esqueci-senha": this.redefinirSenhaUI(); break;
        case "empresa": this.abrirEmpresa(); break;
        case "licenca": this.abrirLicenca(); break;
        case "backup": this.abrirBackup(); break;
        case "nuvem": this.abrirNuvem(); break;
        case "backup-export": this.exportarBackup(); break;
        case "menu": { var _apT = document.querySelector(".app"); if (_apT) _apT.classList.toggle("menu-aberto"); break; }
        case "conta": { var _c = t.closest(".topbar-conta"); if (_c) _c.classList.toggle("aberto"); break; }
        case "tabelas": this.abrirTabelas(); break;
        case "escanear-pasta": this.escanearPastaUI(); break;
        case "carregar-setop": this.carregarSetop(); break;
        case "carregar-goinfra": this.carregarGoinfra(); break;
        case "cron-recalc": this.cronRecalc(); break;
        case "cron-reset": this.cronReset(); break;
        case "cron-ia": this.cronRefinarIA(); break;
        case "exec-recalc": this.execRecalc(); break;
        case "exec-cronograma": this.execEnviarCronograma(); break;
        case "parede-explodir": this.paredeExplodir(); break;
        case "parede-aplicar": this.paredeAplicar(); break;
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
        case "reimportar-excel": this.reimportarExcel(); break;
        case "importar-planilha": this.importarPlanilha(); break;
        case "import-reanalisar": this.importRemapear(); break;
        case "import-confirmar": this.criarOrcamentoDaImportacao(); break;
        case "config-orc": this.editarDadosOrc(); break;
        case "escopo": this.abrirEscopo(); break;
        case "escopo-ia": this.analisarEscopoIA(); break;
        case "escopo-casar": this.refinarEscopoCasar(); break;
        case "escopo-analisar": this.analisarEscopo(); break;
        case "escopo-confirmar": this.confirmarEscopo(); break;
        case "proposta": this.gerarProposta(); break;
        case "apresentar": { if (this.orcAtual && typeof Apresentacao !== "undefined") Apresentacao.abrir(this.orcAtual); else UI.toast("Abra um orçamento primeiro.", "erro"); break; }
        case "laudo": this.gerarLaudo(); break;
        case "relatorio": this.gerarRelatorio(); break;
        case "proposta-imprimir": window.print(); break;
        case "proposta-fechar": this.fecharProposta(); break;
      }
    },

    onChange: function (e) {
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
            if (typeof UI !== "undefined") UI.toast("✅ Licença da empresa ativada neste aparelho! Entre com o seu usuário e senha.", "ok");
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
    _conectarNuvemLicenca: function () {
      var self = this;
      try {
        var st = (typeof Licenca !== "undefined" && Licenca.status) ? Licenca.status() : null;
        if (!st || !st.ativo || st.trial) return;                        // só cliente licenciado
        if (typeof Nuvem === "undefined" || !Nuvem.disponivel()) return; // nuvem ligada no config
        var chave = Licenca.chave(); if (!chave) return;
        var eid = Auth.empresaId();
        Nuvem.entrarPorLicenca(chave)
          .then(function () { return Nuvem.sincronizar(eid); })
          .then(function () {
            try { Nuvem.escutar(eid, function () { if (self.tela === "lista") self.render(); }); } catch (e) {}
            // aparelho secundário (o tenant já tem admin, mas aqui a sessão é anônima) → exige login
            if (Auth.precisaLoginNuvem && Auth.precisaLoginNuvem()) { Auth.logout(); self.tela = "login"; self.render(); return; }
            if (self.tela === "lista") self.render(); // equipe/dados sincronizados
          })
          .catch(function () { /* offline: segue com o cache local (offline-first) */ });
      } catch (e) {}
    },
    _trocaSenhaPrimeiroAcesso: function () {
      var self = this;
      var corpo = '<p class="muted" style="margin:0 0 12px">Este é o seu <b>primeiro acesso</b>. Defina uma senha só sua para continuar.</p>' +
        '<div class="field"><label>Nova senha *</label><input id="ts-s1" type="password" placeholder="mínimo 4 caracteres" autocomplete="new-password"></div>' +
        '<div class="field"><label>Repita a nova senha *</label><input id="ts-s2" type="password" placeholder="repita" autocomplete="new-password"></div>';
      UI.modal("🔐 Primeiro acesso — crie sua senha", corpo, [
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
      // Sincronização na nuvem — só age se CONFIG.backend.sync === true (inerte por padrão).
      // NÃO faz o login manual da nuvem quando o tenant-licença já está conectado (multi-aparelho):
      // evita trocar a conta-tenant pela conta e-mail/senha do login e partir os dados em dois.
      if (typeof Nuvem !== "undefined" && Nuvem.disponivel() && !Nuvem.ligado) {
        var eid = Auth.empresaId();
        Nuvem.entrar(email, senha)
          .then(function () { return Nuvem.sincronizar(eid); })
          .then(function () {
            Nuvem.escutar(eid, function () { if (self.tela === "lista") self.render(); });
            if (self.tela === "lista") self.render();
            UI.toast("☁ Dados sincronizados na nuvem.", "ok");
          })
          .catch(function (e) {
            // NUNCA falhar em silêncio: o usuário precisa saber que NÃO está sincronizando
            console.warn("[nuvem] " + (e && (e.code || e.message)));
            var code = e && e.code;
            if (code === "auth/wrong-password") {
              UI.toast("☁ Nuvem NÃO conectada: esta senha é diferente da usada no seu outro computador. Menu da conta → ☁ Nuvem para conectar com a senha certa.", "erro");
            } else if (code === "auth/network-request-failed") {
              UI.toast("☁ Sem internet agora — seus dados ficam locais e você pode sincronizar depois em: menu da conta → ☁ Nuvem.", "erro");
            } else {
              UI.toast("☁ Nuvem não conectada (" + (code || (e && e.message) || "erro") + "). Menu da conta → ☁ Nuvem para tentar de novo.", "erro");
            }
          });
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
    // ☁ Nuvem: conectar/sincronizar A QUALQUER HORA (não só no login) — p/ quem
    // trabalha em 2+ computadores (escritório e casa). Regra de ouro: usar o MESMO
    // e-mail e senha da nuvem em todos os aparelhos.
    abrirNuvem: function () {
      var self = this;
      if (typeof Nuvem === "undefined" || !Nuvem.disponivel()) { UI.toast("Sincronização na nuvem indisponível nesta instalação.", "erro"); return; }
      var u = (typeof Auth !== "undefined" && Auth.usuario && Auth.usuario()) || {};
      var conectado = !!(Nuvem.auth && Nuvem.auth.currentUser);
      var emailNuvem = conectado ? (Nuvem.auth.currentUser.email || "") : "";
      var body =
        '<p style="margin-top:0">' + (conectado
          ? '✅ Conectado como <b>' + Util.esc(emailNuvem) + '</b>. Seus orçamentos sincronizam sozinhos entre os aparelhos conectados com este mesmo e-mail e senha.'
          : '⚠️ <b>Nuvem não conectada</b> — seus dados estão só neste computador.') + '</p>' +
        '<p class="muted" style="font-size:12px">Trabalha no escritório e em casa? Use o <b>MESMO e-mail e a MESMA senha</b> da nuvem nos dois computadores — os orçamentos aparecem em todos (até 3 aparelhos na sua licença).</p>' +
        '<div class="row"><div style="flex:1"><label class="muted" style="font-size:11px">E-mail da nuvem</label><input id="nv-email" class="cell" style="width:100%" value="' + Util.esc(u.email || "") + '"></div></div>' +
        '<div class="row"><div style="flex:1"><label class="muted" style="font-size:11px">Senha da nuvem (a do OUTRO computador, se já usa lá)</label><input id="nv-senha" type="password" class="cell" style="width:100%" placeholder="••••••••"></div></div>';
      UI.modal("☁ Nuvem — sincronizar entre aparelhos", body, [
        { texto: conectado ? "Sincronizar agora" : "Conectar e sincronizar", classe: "primary", onClick: function () {
            var email = String((UI.el("nv-email") || {}).value || "").trim().toLowerCase();
            var senha = String((UI.el("nv-senha") || {}).value || "");
            if (!email || (!conectado && !senha)) { UI.toast("Preencha e-mail e senha da nuvem.", "erro"); return; }
            UI.toast("☁ Conectando…", "ok");
            var eid = Auth.empresaId();
            var p = conectado ? Promise.resolve() : Nuvem.entrar(email, senha);
            p.then(function () { return Nuvem.sincronizar(eid); })
              .then(function () {
                Nuvem.escutar(eid, function () { if (self.tela === "lista") self.render(); });
                UI.fecharModal(); self.render();
                UI.toast("☁ Sincronizado! Seus orçamentos agora aparecem em todos os aparelhos conectados.", "ok");
              })
              .catch(function (e) {
                var code = e && e.code;
                if (code === "auth/wrong-password") UI.toast("Senha da nuvem incorreta — use a MESMA senha do outro computador (ou redefina lá).", "erro");
                else if (code === "auth/network-request-failed") UI.toast("Sem internet agora. Tente novamente quando conectar.", "erro");
                else UI.toast("Não conectou: " + (code || (e && e.message) || "erro"), "erro");
              });
          } }
      ]);
    },

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
      // White-label dos entregáveis (créditos / marca d'água / QR)
      var elC = UI.el("emp-doc-creditos"), elQ = UI.el("emp-doc-qr"), elW = UI.el("emp-doc-wm");
      if (elC && Empresa.salvarDocsCfg) Empresa.salvarDocsCfg({ creditos: elC.checked, qr: elQ ? elQ.checked : true, marcaDagua: elW ? elW.value : "empresa" });
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
      var res = ParedeCebola.explodir(inp);
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
      UI.toast("🤖 Consultando a IA do ERP (planejador)…", "ok");
      fetch(back + "/ia/cronograma", { method: "POST", headers: { "Content-Type": "application/json", "x-licenca": (typeof Licenca !== "undefined" ? Licenca.chave() : "") }, body: JSON.stringify({ etapas: etapas, equipes: (r.params.equipes || 1) }) })
        .then(function (resp) { return resp.json(); })
        .then(function (j) {
          if (!j.ok) { UI.toast("IA: " + (j.error || "não retornou"), "erro"); return; }
          o.cronograma = o.cronograma || {}; o.cronograma.duracoes = o.cronograma.duracoes || {}; o.cronograma.iaMotivos = {}; o.cronograma.duracoesAgente = o.cronograma.duracoesAgente || {};
          var n = 0;
          (j.etapas || []).forEach(function (x) { var et = etapas[x.i]; if (et && x.dias >= 1) { o.cronograma.duracoes[et.id] = Math.round(Util.num(x.dias)); o.cronograma.iaMotivos[et.id] = x.motivo || ""; o.cronograma.duracoesAgente[et.id] = "ia"; n++; } });
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

    // GOINFRA/AGETOP-GO (rodoviárias de Goiás) — 2 regimes (com/sem desoneração) e 2 preços
    // (custo direto sem BDI = app aplica o BDI do cliente | preço com o BDI oficial 27,21%).
    // O "preço" entra como o arg regiao do carregarInclusa, que remapeia custoUnitario de precos[preco].
    carregarGoinfra: function () {
      var self = this;
      var regime = (UI.el("goinfra-regime") || {}).value || "onerada";   // padrão: SEM desoneração (o que o cliente usa)
      var preco = (UI.el("goinfra-preco") || {}).value || "direto";      // padrão: custo direto (o app aplica o BDI)
      var nome = "goinfra-GO" + (regime === "onerada" ? "-onerada" : "") + "-current.json";
      var inclusa = "data/" + nome;
      // auto-update: tenta a base AO VIVO no VPS (regenerada a cada bimestre pela GOINFRA);
      // se offline/indisponível, cai na base inclusa no pacote (offline-first).
      var live = (typeof CONFIG !== "undefined" && CONFIG.licencaServer) ? (String(CONFIG.licencaServer).replace(/\/$/, "") + "/goinfra/" + nome) : null;
      var rotReg = regime === "onerada" ? "sem desoneração" : "com desoneração";
      var rotPre = preco === "comBDI" ? "com BDI 27,21%" : "custo direto (sem BDI)";
      UI.toast("Carregando GOINFRA (" + rotReg + " · " + rotPre + ")…", "ok");
      function carregar(url, ehLive) { return Bases.carregarInclusa(url, "AGETOP", preco).then(function (r) { r._live = ehLive; return r; }); }
      var promessa = live ? carregar(live, true).catch(function () { return carregar(inclusa, false); }) : carregar(inclusa, false);
      promessa.then(function (r) {
        UI.toast("AGETOP-GO · " + rotReg + " · " + rotPre + ": " + r.total.toLocaleString("pt-BR") + " itens " + (r._live ? "(online, mais recente)" : "(inclusa)") + "." + (r.persistido ? "" : " ⚠ " + r.gravErro), r.persistido ? "ok" : "erro");
        self.abrirTabelas();
      }).catch(function (e) { UI.toast("Falhou ao carregar GOINFRA: " + e.message, "erro"); });
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

    alternarTema: function () { // atalho claro↔escuro (preserva o tom escolhido)
      this.aplicarTema(document.documentElement.getAttribute("data-tema") === "dark" ? "light" : "dark", null);
    },
    aplicarTema: function (tema, tom) {
      tema = tema === "dark" ? "dark" : "light";
      tom = tom || localStorage.getItem("orcapro:tom") || "azul";
      document.documentElement.setAttribute("data-tema", tema);
      document.documentElement.setAttribute("data-tom", tom);
      localStorage.setItem("orcapro:tema", tema);
      localStorage.setItem("orcapro:tom", tom);
      // marca a opção ativa se o modal de temas estiver aberto
      var abertos = document.querySelectorAll(".tema-op");
      if (abertos.length) abertos.forEach(function (b) { b.classList.toggle("on", b.dataset.temaVal === tema && (tema === "light" || b.dataset.tomVal === tom)); });
    },
    // Seletor de tema: Claro (como o site) + 5 tons de escuro (cores do logo RA)
    abrirTema: function () {
      var temaAtual = document.documentElement.getAttribute("data-tema") || "light";
      var tomAtual = document.documentElement.getAttribute("data-tom") || "azul";
      var ops = [
        { tema: "light", tom: "azul",   nome: "Claro",         desc: "Branco, como o site",             sw: ["#f4f7fb", "#ffffff", "#0f2740", "#16a34a"] },
        { tema: "dark",  tom: "azul",   nome: "Escuro Azul",   desc: "Navy OrçaPRO (padrão)",           sw: ["#0b1622", "#11202e", "#5a9bc9", "#22c55e"] },
        { tema: "dark",  tom: "preto",  nome: "Escuro Preto",  desc: "Neutro, foco total",              sw: ["#0a0c0f", "#121519", "#8b98a5", "#22c55e"] },
        { tema: "dark",  tom: "verde",  nome: "Escuro Verde",  desc: "O verde do logo RA",              sw: ["#081711", "#0e2118", "#4d8b2f", "#79c455"] },
        { tema: "dark",  tom: "marrom", nome: "Escuro Marrom", desc: "O terra do logo RA",              sw: ["#15100a", "#1e1710", "#877457", "#b5985a"] },
        { tema: "dark",  tom: "ra",     nome: "RA Engenharia", desc: "Misto do logo: navy + verde + dourado", sw: ["#0d1725", "#132133", "#5ea23a", "#b5985a"] }
      ];
      var cards = ops.map(function (o) {
        var on = (o.tema === temaAtual && (o.tema === "light" || o.tom === tomAtual));
        return '<button type="button" class="tema-op' + (on ? " on" : "") + '" data-acao="tema-op" data-tema-val="' + o.tema + '" data-tom-val="' + o.tom + '">' +
          '<span class="sw">' + o.sw.map(function (c) { return '<i style="background:' + c + '"></i>'; }).join("") + "</span>" +
          "<b>" + o.nome + "</b><small>" + o.desc + "</small></button>";
      }).join("");
      UI.modal("🎨 Tema do aplicativo",
        '<p class="muted" style="margin:0 0 12px">Escolha como o OrçaPRO fica na sua tela — a mudança é na hora e fica salva neste aparelho.</p>' +
        '<div class="tema-ops">' + cards + "</div>",
        [{ texto: "Fechar", classe: "primary", onClick: function () { UI.fecharModal(); } }]);
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
      this._preloadAnalitico(); // pré-carrega a base analítica em 2º plano → detalhe de insumos abre na hora
    },

    // Pré-carrega a base ANALÍTICA (~18MB) em segundo plano assim que abre o orçamento,
    // pra "ver composição detalhada" abrir instantâneo (sem o load frio no 1º clique).
    // Silencioso, sem spinner, offline-first (se falhar, o clique recarrega normalmente).
    _preloadAnalitico: function () {
      try {
        if (typeof Analitico === "undefined") return;
        if (Analitico.carregado || Analitico.carregando) return;
        var u = this._analiticoUrls();
        if (!u.local && !u.live) return;
        // pré-carrega já com o fallback AO VIVO embutido — se um clique em 🔍 pegar esta
        // promise compartilhada no meio do caminho, ela já sabe cair no VPS.
        setTimeout(function () {
          try { if (!Analitico.carregado && !Analitico.carregando) Analitico.carregarArquivo(u.local || u.live, u.live).catch(function () {}); } catch (e) {}
        }, 1200);
      } catch (e) {}
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
            o.competenciaSinapi = (UI.el("ed-comp") || {}).value || o.competenciaSinapi;
            o.uf = (UI.el("ed-uf") || {}).value || o.uf;
            o.art = (UI.el("ed-art") || {}).value || "";
            o.dataVistoria = (UI.el("ed-vistoria") || {}).value || "";
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
      // LOTE 1: etapa pode ter dezenas de itens e não há desfazer — confirmar antes.
      var self = this, orc = this.orcAtual;
      var et = orc && (orc.etapas || []).filter(function (e) { return e.id === etapaId; })[0];
      var nItens = et ? (et.itens || []).length : 0;
      UI.modal("🗑 Remover etapa",
        '<p>Remover a etapa <b>' + Util.esc((et && et.nome) || "") + '</b>' +
        (nItens ? ' com <b>' + nItens + ' item(ns)</b>' : '') + '?<br><span class="muted">Essa ação não tem desfazer.</span></p>', [
          { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
          { texto: "🗑 Remover", classe: "", onClick: function () {
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
    abrirMemoria: function (etapaId, itemId) {
      var self = this, orc = this.orcAtual; if (!orc) return;
      var etapa = (orc.etapas || []).filter(function (e) { return e.id === etapaId; })[0];
      var it = etapa && (etapa.itens || []).filter(function (x) { return x.id === itemId; })[0];
      if (!it) return;
      var body = '<p class="muted" style="margin-top:0">Registre como o quantitativo de <b>' + Util.esc(String(it.descricao || "").slice(0, 90)) + '</b> foi calculado (ex.: <i>"2 paredes × 3,20 m × 2,70 m − 1 porta 0,80×2,10"</i>). Sai na aba <b>Memória de Cálculo</b> do Excel — exigência comum em licitação (Lei 14.133).</p>' +
        '<textarea id="mem-texto" class="cell" style="width:100%;min-height:130px;resize:vertical" placeholder="Descreva o cálculo do quantitativo…">' + Util.esc(it.memoriaCalculo || "") + '</textarea>';
      UI.modal("📝 Memória de cálculo — " + (it.codigo || ""), body, [
        { texto: "Salvar", classe: "primary", onClick: function () {
            it.memoriaCalculo = String((UI.el("mem-texto") || {}).value || "").trim();
            self.persistir(); UI.fecharModal(); self.render();
            UI.toast(it.memoriaCalculo ? "Memória de cálculo salva." : "Memória de cálculo removida.", "ok");
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
          return { max: 120, fonte: (UI.el("bs-fonte") || {}).value || "", tipo: (UI.el("bs-tipo") || {}).value || "", desonerado: dv === "des" ? true : (dv === "one" ? false : null) };
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
          // LOTE 5: paginação — 15 por vez com "mostrar mais" (40+ de uma vez
          // congelava o mobile e enterrava os melhores resultados)
          var PAG = 15;
          function pintarResultados(ate) {
            ate = Math.min(res.length, ate);
            box.innerHTML = res.slice(0, ate).map(function (r) {
              var it = r.item, tg = r.tipo === "insumo" ? ' <span class="pill proprio">insumo</span>' : "";
              return '<div class="sinapi-result" data-pick="' + Util.esc(it.codigo) + '|' + Util.esc(r.fonte) + '">' +
                '<div class="desc"><div class="cod"><span class="pill ' + (r.cor || "sinapi") + '">' + Util.esc(r.label) + "</span>" + tg + " " + Util.esc(it.codigo) + " · " + Util.esc(it.unidade) + "</div>" +
                Util.esc(it.descricao) + "</div>" +
                '<div class="preco">' + Util.fmtMoeda(it.custoUnitario) + "</div></div>";
            }).join("") +
              (res.length > ate ? '<button type="button" class="btn ghost" id="bs-mais" style="width:100%;margin-top:8px">➕ Mostrar mais ' + Math.min(PAG, res.length - ate) + " (de " + (res.length - ate) + " restantes)</button>" : "");
            Array.prototype.forEach.call(box.querySelectorAll("[data-pick]"), function (row) {
              row.onclick = function () { self.escolherItemSinapi(row.dataset.pick); };
            });
            var mais = UI.el("bs-mais");
            if (mais) mais.onclick = function () { pintarResultados(ate + PAG); };
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
      UI.modal("📥 Reimportar Excel — revisar mudanças", html, [
        { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
        { texto: "✅ Aplicar selecionadas", classe: "primary", onClick: function () {
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
    verInsumos: function (codigo) {
      var self = this;
      var ufAtivo = self._baseUf || Sinapi.uf || null;
      if (!codigo || !String(codigo).trim()) {
        UI.modal("ℹ️ Sem composição detalhada", '<p>Este item foi <b>lançado manualmente</b> (sem código SINAPI), então não há composição de insumos para detalhar. O valor usado é o que você digitou.</p>', [{ texto: "Entendi", classe: "primary", onClick: function () { UI.fecharModal(); } }]);
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
        var bg = UI.modal("🔍 Composição " + codigo + " — Insumos", UI.renderInsumos(a, ufAtivo),
          [{ texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } }]);
        var m = bg && bg.querySelector(".modal"); if (m) m.style.maxWidth = "900px";
      }
      // Já carregado E é do estado ativo? abre direto.
      if (Analitico.carregado && (!ufAtivo || !Analitico.uf || Analitico.uf === ufAtivo)) { abrir(); return; }
      // URLs local + AO VIVO (VPS). O analítico da região SEMPRE existe no servidor, então
      // mesmo que o disco do cliente não tenha o arquivo, o detalhamento carrega ao vivo.
      var urls = self._analiticoUrls();
      if (!urls.local && !urls.live) { // só quando não há UF de forma alguma
        UI.toast("Sem UF ativa para o detalhamento. Escolha um estado em 🗂 Tabelas.", "erro");
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
      // LOTE 4: avisos NÃO-bloqueantes de acabamento — proposta sai, mas o usuário sabe
      try {
        if (typeof Empresa !== "undefined" && !Empresa.logo()) UI.toast("Sem logo em ⚙ Empresa — a capa sai com [LOGO]. Suba o logo p/ proposta 100% profissional.", "erro");
        var _c = this.orcAtual.comercial || {};
        if (!Util.naoVazio(_c.apresentacao)) UI.toast("Apresentação em ⚙ Dados vazia — saiu o texto padrão. Personalize p/ este cliente.", "erro");
      } catch (eAv) {}
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
      var urlsR = self._analiticoUrls();
      if (!ana || (!urlsR.local && !urlsR.live) ||
          (ana.carregado && (!ufAtivo || !ana.uf || ana.uf === ufAtivo))) { abrir(); return; }
      if (ana.reset && ana.uf && ufAtivo && ana.uf !== ufAtivo) ana.reset();
      UI.toast("Carregando insumos das composições (1ª vez)…", "ok");
      ana.carregarArquivo(urlsR.local || urlsR.live, urlsR.live).then(abrir).catch(function () { abrir(); });
    },

    // ---------- AGENTE IMPORTADOR: planilha (Excel/CSV) de qualquer formato → etapas+itens ----------
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
          var res = Importador.analisar(matriz);
          self._imp = { matriz: matriz, nome: f.name, res: res, abas: (meta && meta.abas) || null, abaIdx: (meta && meta.idx) || 0 };
          self._abrirImportPreview();
        });
      };
      document.body.appendChild(inp); inp.click(); setTimeout(function () { try { inp.remove(); } catch (e) {} }, 0);
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
        if (typeof ExcelOrc === "undefined" || !ExcelOrc.ensureExcelJS) { cb(null, "módulo Excel indisponível (precisa de internet na 1ª vez)"); return; }
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
              var idx = App._melhorAba(abas);
              cb(abas[idx].matriz, null, { abas: abas, idx: idx });
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
          "📑 Esta planilha tem <b>" + imp.abas.length + " abas</b>. Importando de " +
          '<select id="imp-aba" style="margin:0 6px;padding:2px 6px;font-size:12.5px">' + opts + "</select>" +
          '<span class="muted">— se não for a aba do orçamento, troque e clique <b>🔄 Reanalisar</b>.</span></div>';
      }
      UI.modal("📊 Importar planilha — " + Util.esc(imp.nome || ""), picker + UI.renderImportPreview(imp), [
        { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
        { texto: "🔄 Reanalisar", classe: "", onClick: function () { self.importRemapear(); } },
        { texto: "✅ Importar como orçamento", classe: "success", onClick: function () { self.criarOrcamentoDaImportacao(); } }
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
        '<button class="btn sm success" data-acao="proposta-imprimir">🖨 Imprimir / Salvar PDF</button>' +
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
      else msg = "🔒 Ative sua licença (🔑) para salvar e exportar.";
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
