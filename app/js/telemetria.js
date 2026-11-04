/* =====================================================================
 * telemetria.js — Cadastro do TESTE GRÁTIS + uso do app (trial e licenciado)
 * TRIAL: nome+telefone+e-mail (com consentimento LGPD) antes de liberar.
 * Enquanto o app roda, manda pings leves (só metadados de USO — nada do
 * conteúdo dos orçamentos): boot + heartbeat a cada 5 min + contador de
 * módulos usados. O painel de vendas agrega: quem testa/usa, online agora,
 * horas de uso, empresa que mais usa e módulos mais usados (p/ priorizar).
 * Fire-and-forget: sem internet, o app segue 100% (offline-first).
 * ===================================================================== */
(function (global) {
  "use strict";
  var KEYREG = "orcapro:trialreg", KEYMODS = "orcapro:telemetria:mods";

  var Telemetria = {
    _timer: null, _sessao: null,

    reg: function () { try { return JSON.parse(localStorage.getItem(KEYREG) || "null"); } catch (e) { return null; } },
    salvarReg: function (r) { try { localStorage.setItem(KEYREG, JSON.stringify(r)); } catch (e) {} },

    /* trial ativo */
    ehTrial: function () {
      try { var s = (typeof Licenca !== "undefined" && Licenca.status) ? Licenca.status() : null; return !!(s && s.trial && s.ativo); }
      catch (e) { return false; }
    },
    /* licença ativada (não-trial) */
    ehLicenciado: function () {
      try { var s = (typeof Licenca !== "undefined" && Licenca.status) ? Licenca.status() : null; return !!(s && s.ativo && !s.trial); }
      catch (e) { return false; }
    },
    _ativo: function () { return this.ehTrial() ? !!this.reg() : this.ehLicenciado(); },

    _mods: function () { try { return JSON.parse(localStorage.getItem(KEYMODS) || "{}"); } catch (e) { return {}; } },
    /* ⚠ PRÉVIA NÃO CONTA COMO USO. `KEYMODS` é chave GLOBAL do navegador — nem
       por tenant é —, então navegar na prévia de um cliente somaria módulos ao
       ping do próprio uso da RA. O heartbeat de 5 min já está rodando quando a
       prévia abre: esconder o botão não resolveria, a guarda tem de estar em
       quem escreve. */
    _naPrevia: function () {
      try {
        return typeof PreviewCli !== "undefined" && typeof Auth !== "undefined"
          && PreviewCli.ehPrevia(Auth.empresaId());
      } catch (e) { return false; }
    },
    contaModulo: function (v) {
      if (!v || this._naPrevia()) return;
      try { var m = this._mods(); m[v] = (m[v] || 0) + 1; localStorage.setItem(KEYMODS, JSON.stringify(m)); } catch (e) {}
    },

    /* identidade do cliente licenciado (empresa/usuário logado/papel/licença) */
    _licInfo: function () {
      var A = (typeof Auth !== "undefined") ? Auth : null;
      var u = (A && A.usuario) ? (A.usuario() || {}) : {};
      var email = "";
      try { if (typeof Licenca !== "undefined" && Licenca._ler) email = (Licenca._ler() || {}).email || ""; } catch (e) {}
      var dev = "";
      try { if (typeof Licenca !== "undefined" && Licenca.deviceId) dev = Licenca.deviceId(); } catch (e2) {}
      var foto = "";
      try { if (typeof Empresa !== "undefined" && Empresa.fotoUsuario) foto = Empresa.fotoUsuario() || ""; } catch (e3) {}
      return {
        empresa: u.empresa || "Minha Empresa",
        /* ⚠ `Auth.nome()` e a PESSOA desde a v1.2.14. Antes ele caia no nome da
           empresa quando o dono nao tinha nome cadastrado, e o painel de vendas
           listava razao social no lugar de gente — nao dava para saber QUEM
           estava usando o sistema, que e a pergunta que o painel existe para
           responder. O conserto e na origem (js/auth.js), nao aqui. */
        usuario: (A && A.nome) ? A.nome() : (u.nome || u.email || "Usuário"),
        papel: (A && A.papel) ? A.papel() : "admin",
        foto: foto,
        licencaEmail: email, deviceId: dev
      };
    },

    enviar: function (evento) {
      if (this._naPrevia()) return;
      try {
        if (!this._ativo()) return;
        if (!this._sessao) this._sessao = "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
        var base = (typeof CONFIG !== "undefined" && CONFIG.licencaServer) ? String(CONFIG.licencaServer).replace(/\/$/, "") : "";
        if (!base) return;
        var ev = evento === "boot" ? "boot" : "ping";
        var ver = (typeof CONFIG !== "undefined") ? CONFIG.versao : "";
        var body;
        if (this.ehTrial()) {
          var r = this.reg(); if (!r) return;
          var email = r.email || "";
          try { if (!email && typeof Auth !== "undefined" && Auth.usuario) email = (Auth.usuario() || {}).email || ""; } catch (e2) {}
          body = { tipo: "trial", evento: ev, sessaoId: this._sessao, nome: r.nome || "", telefone: r.telefone || "", email: email, versao: ver, modulos: this._mods() };
        } else {
          var i = this._licInfo();
          body = { tipo: "licenciado", evento: ev, sessaoId: this._sessao, empresa: i.empresa, usuario: i.usuario, papel: i.papel, licencaEmail: i.licencaEmail, deviceId: i.deviceId, versao: ver, modulos: this._mods() };
          /* ⚠ A FOTO SO VAI NO BOOT (e quando muda). Sao ~10 KB de data URI; o
             heartbeat e de 5 em 5 minutos e a frota inteira bate no mesmo
             endpoint. Mandar em todo ping seria multiplicar o trafego por umas
             cem vezes para reenviar um dado que quase nunca muda — e o servidor
             so regrava quando ele de fato mudou. */
          if (ev === "boot") body.foto = i.foto || "";
        }
        fetch(base + "/api/telemetria", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(function () {});
      } catch (e) {}
    },

    /* trocou a foto ou o nome -> reenvia UM ping de boot, para o painel nao
       ficar com a identidade velha ate o proximo dia. Mesma `sessaoId`: nao
       cria sessao nova nem infla a contagem de horas. */
    perfilMudou: function () { try { if (this._sessao) this.enviar("boot"); } catch (e) {} },

    iniciar: function () {
      var self = this;
      if (!this._ativo()) return;
      try { localStorage.setItem(KEYMODS, "{}"); } catch (e) {} // sessão nova = contador de módulos zerado
      this.enviar("boot");
      if (this._timer) clearInterval(this._timer);
      this._timer = setInterval(function () { self.enviar("ping"); }, 5 * 60 * 1000);
    },

    /* true = bloqueou (modal de cadastro na tela); false = segue o boot. Só TRIAL. */
    gate: function (aoLiberar) {
      /* ⚠ O QUE DECIDE É O STATUS DO TESTE, NÃO O `trialreg`. Antes: `if (reg com e-mail) return false` — quem apagasse os dados do
         site e escrevesse o `orcapro:trialreg` à mão (ou abrisse com `?lic=qualquercoisa`, que pula o gate) entrava sem código.
         Agora o cadastro só é pedido a quem está SEM TESTE (status.pendente: instalação nova/limpa, ou o servidor disse que não há
         teste para este aparelho). Teste com início confirmado pelo servidor, vencido ou licenciado: não prende aqui. */
      var s0 = null;
      try { s0 = (typeof Licenca !== "undefined" && Licenca.status) ? Licenca.status() : null; } catch (e0) { s0 = null; }
      if (!(s0 && s0.trial && s0.pendente)) return false;
      /* "Só consultar" nesta sessão: o app abre SÓ PARA CONSULTA (sem gravar nem exportar — App._trialBloqueado) e o cadastro volta na próxima
         abertura. Sem este retorno o boot (que chama o gate de novo ao liberar) cairia num laço. */
      if (this._soConsulta) return false;
      return this.exigirValidacao(aoLiberar);
    },
    /* abre o cadastro + os dois códigos, SEM saída além de "Já tenho a chave" (e sem ✕). Usado no boot e quando o servidor responde
       "não há teste para este aparelho" depois do boot (App._aposVeredito). */
    exigirValidacao: function (aoLiberar) {
      if (this._cadastroAberto || this._soConsulta) return true;
      var rPre = this.reg() || {};
      var nomePre = rPre.nome || "", fonePre = rPre.telefone || "", emailPre = rPre.email || "";
      try { if (!emailPre && typeof Auth !== "undefined" && Auth.usuario) emailPre = (Auth.usuario() || {}).email || ""; } catch (e) {}
      this._cadastroAberto = true;
      var self = this;
      var liberar = function () { self._cadastroAberto = false; if (typeof aoLiberar === "function") aoLiberar(); };
      /* ⚠ DESDE 03/11/2026 O TESTE NOVO SÓ COMEÇA COM NOME + TELEFONE E E-MAIL CONFIRMADOS POR CÓDIGO (o telefone: a pessoa manda
         a mensagem pelo WhatsApp). Só esta tela muda; o resto do fluxo é o de sempre. O servidor (server/teste-controle-srv.js) decide. */
      this._passoCadastro(liberar, { nome: nomePre, fone: fonePre, email: emailPre }, {});
      this._semFechar();
      return true;
    },

    /* A SAÍDA QUE NENHUMA TELA PODE FICAR SEM: abre o app só para consulta (o status continua pendente/encerrado, então nada grava nem exporta).
       Vale para o cliente pago cuja licença foi apagada por `revalidar`, o testador que o servidor não conhece, o desbloqueado, o expurgado
       e o número sem WhatsApp. Pede de novo na próxima abertura. */
    _botaoSoConsultar: function (aoLiberar) {
      var self = this;
      return { texto: "Só consultar", classe: "ghost", onClick: function () {
        self._soConsulta = true; self._cadastroAberto = false;
        try { UI.fecharModal(); } catch (e) {}
        if (typeof aoLiberar === "function") aoLiberar();
      } };
    },
    _esc: function (v) { return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); },
    _emailOk: function (v) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(v || "").trim()); },
    /* só grava `confirmadoEm` quando telefone E e-mail foram confirmados — é ele que tira o app do modo "adotar cadastro antigo" */
    _salvarCadastro: function (d, validado) {
      var r = { nome: d.nome, telefone: d.fone, email: d.email, em: new Date().toISOString() };
      if (validado) r.confirmadoEm = Date.now();
      this.salvarReg(r);
    },
    _fmtFone: function (n) {
      var d = String(n || "").replace(/\D/g, "");
      return d.length === 13 ? "+" + d.slice(0, 2) + " " + d.slice(2, 4) + " " + d.slice(4, 9) + "-" + d.slice(9) : (d ? "+" + d : "");
    },

    /* PASSO 1 — quem está testando. DESDE 03/11/2026 (revisão do Rogério) o teste novo só começa com NOME + TELEFONE
       CONFIRMADO + E-MAIL CONFIRMADO, e os dois se confirmam por código. Quem JÁ está no prazo (gate() devolve false
       acima) não passa por aqui: valida depois, em Telemetria.validarContatos, sem mexer no relógio. */
    _passoCadastro: function (aoLiberar, pre, op) {
      var self = this, esc = this._esc;
      op = op || {};
      var corpo =
        '<p class="muted" style="margin:0 0 12px">Bem-vindo ao <b>teste grátis de 7 dias</b> — sistema completo, sem cartão. Para começar, informe quem está testando e <b>confirme o seu e-mail e o seu WhatsApp</b> (leva um minuto):</p>' +
        '<div class="field"><label>Seu nome *</label><input id="tg-nome" value="' + esc(pre.nome) + '" placeholder="Nome e sobrenome" autocomplete="name"></div>' +
        '<div class="field"><label>WhatsApp / telefone *</label><input id="tg-fone" value="' + esc(pre.fone) + '" placeholder="(34) 90000-0000" inputmode="tel" autocomplete="tel"><div class="muted" style="font-size:11.5px;margin-top:3px">Use um número de celular com WhatsApp.</div></div>' +
        '<div class="field"><label>E-mail *</label><input id="tg-email" value="' + esc(pre.email) + '" placeholder="voce@empresa.com.br" autocomplete="email"></div>' +
        '<label style="display:flex;gap:9px;align-items:flex-start;cursor:pointer;font-size:12.5px;color:var(--texto-fraco);margin-top:6px"><input type="checkbox" id="tg-ok" style="margin-top:3px">Autorizo o contato da RA Engenharia sobre o meu teste e o uso dos meus dados para esse fim (LGPD).</label>' +
        '<p class="muted" style="font-size:11.5px;margin:8px 0 0">Para evitar o uso repetido do teste, guardamos também um identificador deste aparelho, em formato codificado (hash) — não é possível ler dele nenhum dado seu. Detalhes na Política de Privacidade.</p>';
      /* JÁ SOU CLIENTE (07/10/2026). Aparelho novo nasce em teste; até aqui a
         ÚNICA porta era o cadastro de teste grátis — o cliente pagante que
         baixava o app da loja (ou abria o sistema num computador novo) caía no
         formulário de teste, sem caminho para a conta dele. A chave da licença
         é também a credencial da nuvem (Nuvem._credLicenca): ativou a chave,
         o boot conecta a nuvem da empresa e traz todos os dados. */
      var botoesC = [{ texto: "Já tenho a chave", classe: "ghost", onClick: function () { UI.fecharModal(); self._cadastroAberto = false; self._jaSouCliente(aoLiberar); } }];
      if (!op.legado) botoesC.push(this._botaoSoConsultar(aoLiberar));
      /* quem está NO PRAZO pelo servidor (op.legado) pode adiar, sem ganhar dia: o relógio é do servidor */
      if (op.legado) botoesC.push({ texto: "Agora não", classe: "ghost", onClick: function () { UI.fecharModal(); } });
      botoesC.push(
        { texto: "Continuar →", classe: "primary", onClick: function () {
          var nome = (UI.el("tg-nome") || {}).value || "", fone = (UI.el("tg-fone") || {}).value || "";
          var email = (UI.el("tg-email") || {}).value || "", ok = (UI.el("tg-ok") || {}).checked;
          if (nome.replace(/\s+/g, " ").trim().length < 3) { UI.toast("Informe o seu nome.", "erro"); return; }
          if (fone.replace(/\D/g, "").length < 10) { UI.toast("Informe um telefone válido com DDD.", "erro"); return; }
          if (!self._emailOk(email)) { UI.toast("Informe um e-mail válido.", "erro"); return; }
          if (!ok) { UI.toast("Marque o consentimento pra liberar o teste.", "erro"); return; }
          UI.fecharModal();
          self._iniciarValidacao(aoLiberar, { nome: nome.trim(), fone: fone.trim(), email: email.trim() }, { falta: op.falta || ["telefone", "email"], legado: !!op.legado });
        } });
      UI.modal("🚀 Liberar meu teste grátis", corpo, botoesC);
    },

    /* confere os canais ANTES de pedir qualquer código: teste novo precisa dos dois; sem eles NÃO começa (sem provisório) */
    _iniciarValidacao: function (aoLiberar, dados, op) {
      var self = this;
      Licenca.canaisTeste(function (c) {
        if (c && c.desligado) {
          /* servidor sem o controle do teste (desligado, ou servidor antigo): volta ao fluxo de antes — grava o cadastro e libera, 7
             dias a partir de agora. Sem isto todo lead novo ficaria preso num cadastro que o servidor não sabe confirmar. */
          if (op.legado) return;
          self._salvarCadastro(dados, false);
          try { Licenca.iniciarFluxoAntigo(); } catch (eFa) {}
          self._cadastroAberto = false;
          if (typeof aoLiberar === "function") aoLiberar();
          return;
        }
        if (c && c.podeIniciar) { self._passoValidar(aoLiberar, dados, op); return; }
        if (op.legado) {
          /* quem já está no prazo nunca fica trancado por defeito do canal: pede de novo na próxima abertura */
          UI.toast("Não consegui abrir a validação do telefone e do e-mail agora. Seu teste continua; vamos pedir de novo na próxima abertura.", "erro", 9000);
          return;
        }
        self._canalFora(aoLiberar, dados, op, c);
      });
    },
    _canalFora: function (aoLiberar, dados, op, c) {
      var self = this, srv = "";
      try { srv = (typeof Licenca !== "undefined" && Licenca._servidor) ? Licenca._servidor() : ""; } catch (e) {}
      var semServidor = !c;
      UI.modal("📡 Não consegui enviar o código agora",
        '<p style="margin:0 0 10px">' + (semServidor ? 'Não consegui falar com o servidor.' : 'O envio dos códigos de confirmação está fora do ar neste momento.') + ' <b>Tente novamente em instantes.</b></p>' +
        '<p class="muted" style="margin:0">Se continuar, fale com a RA Engenharia' + (srv ? ' pelo <a href="' + srv + '/planos" target="_blank" rel="noopener">site</a>' : ' pelo site') + '. O teste só começa depois de confirmar o telefone e o e-mail.</p>', [
        { texto: "Corrigir dados", classe: "ghost", onClick: function () { UI.fecharModal(); self._passoCadastro(aoLiberar, { nome: dados.nome, fone: dados.fone, email: dados.email }, op); self._semFechar(); } },
        { texto: "Já tenho a chave", classe: "ghost", onClick: function () { UI.fecharModal(); self._cadastroAberto = false; self._jaSouCliente(aoLiberar); } },
        (op.legado ? { texto: "Agora não", classe: "ghost", onClick: function () { UI.fecharModal(); } } : self._botaoSoConsultar(aoLiberar)),
        { texto: "Tentar novamente", classe: "primary", onClick: function () { UI.fecharModal(); self._iniciarValidacao(aoLiberar, dados, op); self._semFechar(); } }
      ]);
      this._semFechar();
    },

    /* PASSO 2 — as duas confirmações lado a lado: e-mail por código digitado; telefone pelo WhatsApp (o usuário manda
       "ORCAPRO-123456" e a ponte confere o remetente real; este app só CONSULTA). op: {falta, legado, obrigatorio} */
    _passoValidar: function (aoLiberar, dados, op) {
      var self = this, esc = this._esc;
      var S = { ref: "", emailOk: op.falta.indexOf("email") < 0, telOk: op.falta.indexOf("telefone") < 0, cod: null, timer: null, ate: 0, fim: false };
      var parar = function () { S.fim = true; if (S.timer) { clearInterval(S.timer); S.timer = null; } };
      var base = function () { return { nome: dados.nome, telefone: dados.fone, email: dados.email }; };
      var ver = function (id) { return UI.el(id); };

      /* chegou um veredito do servidor (e-mail confirmado, ou telefone confirmado) */
      var resultado = function (d) {
        if (d && d.ref) S.ref = d.ref;
        if (!d || !d.ok) return;
        if (d.falta) { S.emailOk = d.falta.indexOf("email") < 0; S.telOk = d.falta.indexOf("telefone") < 0; }
        pintar();
        if (d.validado === true && d.liberado !== false) {
          parar(); self._cadastroAberto = false;
          self._salvarCadastro(dados, true);
          UI.fecharModal();
          if (d.expirado) { self._encerrado(aoLiberar); return; }
          UI.toast("Telefone e e-mail confirmados. Seu teste está liberado.", "ok");
          if (typeof aoLiberar === "function") aoLiberar();
        }
      };
      var pintar = function () {
        var e = ver("tv-email-st"), t = ver("tv-tel-st");
        if (e) e.innerHTML = S.emailOk ? '<b style="color:var(--verde,#16a34a)">✓ E-mail confirmado</b>' : '<span class="muted">Aguardando o código do e-mail</span>';
        if (t) t.innerHTML = S.telOk ? '<b style="color:var(--verde,#16a34a)">✓ Telefone confirmado</b>' : '<span class="muted">Aguardando a sua mensagem no WhatsApp…</span>';
        var eb = ver("tv-email-bloco"), tb = ver("tv-tel-bloco");
        if (eb && S.emailOk) eb.style.display = "none";
        if (tb && S.telOk) tb.style.display = "none";
      };
      var consultar = function () {
        if (S.fim || !S.cod || S.telOk) return;
        if (!ver("tv-raiz")) { parar(); return; }                  // o modal foi fechado
        if (Date.now() > S.ate) { var t0 = ver("tv-tel-st"); if (t0) t0.innerHTML = '<span style="color:#b91c1c">O código venceu.</span> Gere um código novo.'; parar(); var nb = ver("tv-novo-cod"); if (nb) nb.style.display = ""; return; }
        var o = base(); o.destino = dados.fone; o.codigo = S.cod.codigo; o.ref = S.ref;
        Licenca.acompanharTelefoneTeste(o, function (d) {
          if (S.fim) return;
          /* ⚠ A CONSULTA NÃO CALA: resposta recusada (limite, erro) e falta de resposta viram TEXTO na tela, não silêncio */
          var tSt = ver("tv-tel-st");
          if (!d) { if (tSt && !S.telOk) tSt.innerHTML = '<span style="color:#b45309">Sem resposta do servidor agora — tentando de novo…</span>'; return; }
          if (d.ok === false && !d.vencido) { if (tSt) tSt.innerHTML = '<span style="color:#b91c1c">' + esc(d.erro || "Não consegui consultar agora.") + '</span>'; return; }
          if (d.aguardando && tSt && (Date.now() - (S.cod.criadoLocal || Date.now())) > 180000) {
            tSt.innerHTML = '<span style="color:#b45309">Ainda aguardando a sua mensagem. Confira se você enviou <b>do número informado</b>, ' + esc(dados.fone) + ', toque em <b>Gerar código novo</b> se preferir recomeçar, ou fale com a RA Engenharia pelo site.</span>';
          }
          if (d && d.vencido) { var t1 = ver("tv-tel-st"); if (t1) t1.innerHTML = '<span style="color:#b91c1c">O código venceu.</span> Gere um código novo.'; parar(); var nb2 = ver("tv-novo-cod"); if (nb2) nb2.style.display = ""; return; }
          if (d && d.ok && d.codigoOk) resultado(d);
        });
      };
      var pedirTelefone = function (depois) {
        var o = base(); o.canal = "telefone"; o.destino = dados.fone;
        Licenca.pedirCodigoTeste(o, function (d) {
          if (!d) { UI.toast("Sem resposta do servidor. Tente de novo em instantes.", "erro", 8000); return; }
          if (d.expirado) { parar(); UI.fecharModal(); self._encerrado(aoLiberar); return; }
          if (!d.ok) { UI.toast(d.erro || "Não consegui gerar o código do WhatsApp agora. Tente novamente em instantes.", "erro", 9000); return; }
          S.cod = d; S.cod.criadoLocal = Date.now(); S.ate = Date.now() + (Number(d.validadeMin) || 15) * 60000;
          if (typeof depois === "function") depois();
        });
      };
      /* celular/toque/tela estreita: o BOTÃO do WhatsApp vem ANTES do QR (ler QR com o próprio celular não faz sentido) e o QR fica
         recolhido em "Mostrar QR"; no computador o QR continua à mostra */
      var ehMovel = function () { try { return (typeof window !== "undefined") && ((window.matchMedia && window.matchMedia("(pointer: coarse)").matches) || (Number(window.innerWidth) > 0 && window.innerWidth < 600)); } catch (e) { return false; } };
      var desenharTel = function () {
        var d = S.cod, box = ver("tv-tel-corpo"); if (!box || !d) return;
        var qr = (typeof QR !== "undefined" && QR.svg) ? QR.svg(d.link, { tamanhoPx: 150 }) : "";
        var botaoZap = '<a href="' + esc(d.link) + '" target="_blank" rel="noopener" class="btn primary" style="display:inline-block;padding:9px 16px;border-radius:8px;text-decoration:none">Abrir o WhatsApp</a>';
        var codigo = '<p style="margin:0 0 8px;font-size:20px;letter-spacing:1px;font-weight:700;text-align:center;font-family:var(--fonte-num,monospace)">' + esc(d.texto) + '</p>';
        var rodape = '<p class="muted" style="font-size:11.5px;margin:8px 0 0">O código vale ' + esc(d.validadeMin || 15) + ' minutos. Use um número de celular com WhatsApp.</p>';
        if (ehMovel()) {
          box.innerHTML =
            '<p style="margin:0 0 8px;font-size:13px">Toque no botão para abrir o WhatsApp e envie a mensagem, <b>do telefone que você informou</b>, ' + esc(dados.fone) + ':</p>' +
            '<div style="text-align:center;margin:0 0 8px">' + botaoZap + '</div>' + codigo +
            '<div style="text-align:center"><button type="button" class="btn ghost" id="tv-qr-toggle">Mostrar QR</button></div>' +
            '<div id="tv-qr-caixa" style="display:none;margin-top:8px;text-align:center"><div style="display:inline-block;background:#fff;padding:4px;border-radius:8px">' + qr + '</div></div>' + rodape;
          var tg = ver("tv-qr-toggle");
          if (tg) tg.onclick = function () { var cx = ver("tv-qr-caixa"); if (!cx) return; var abre = cx.style.display === "none"; cx.style.display = abre ? "" : "none"; tg.textContent = abre ? "Esconder QR" : "Mostrar QR"; };
          return;
        }
        box.innerHTML =
          '<p style="margin:0 0 6px;font-size:13px">Envie esta mensagem pelo WhatsApp, <b>do telefone que você informou</b>, para o número da RA (' + esc(self._fmtFone(d.numero)) + '):</p>' + codigo +
          '<div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;justify-content:center">' +
            (qr ? '<div style="background:#fff;padding:4px;border-radius:8px" title="Aponte a câmera do celular">' + qr + '</div>' : '') +
            '<div style="font-size:12.5px;max-width:230px">' + (qr ? 'No computador, aponte a câmera do celular para o QR ao lado. ' : '') +
              '<span style="display:block;margin-top:6px">' + botaoZap + '</span></div></div>' + rodape;
      };

      var corpo = '<div id="tv-raiz">' +
        '<div id="tv-email-bloco" style="' + (S.emailOk ? 'display:none;' : '') + 'margin:0 0 14px;padding:10px 12px;border:1px solid var(--linha,#d8e0ea);border-radius:8px">' +
          '<b>1. E-mail</b> <span class="muted" style="font-size:12px">— ' + (op.legado ? 'toque em "Enviar código" para receber um código de 6 dígitos em ' : 'enviamos um código de 6 dígitos para ') + esc(dados.email) + ' (olhe também o spam)</span>' +
          '<div class="field" style="margin-top:8px"><input id="tg-cod" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="000000" style="font-size:20px;letter-spacing:5px;text-align:center"></div>' +
          '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><button type="button" class="btn ghost" id="tv-email-reenviar">' + (op.legado ? 'Enviar código' : 'Reenviar e-mail') + '</button><button type="button" class="btn primary" id="tv-email-confirmar">Confirmar e-mail</button></div></div>' +
        '<div id="tv-tel-bloco" style="' + (S.telOk ? 'display:none;' : '') + 'margin:0 0 10px;padding:10px 12px;border:1px solid var(--linha,#d8e0ea);border-radius:8px">' +
          '<b>2. WhatsApp</b> <span class="muted" style="font-size:12px">— ' + esc(dados.fone) + '</span>' +
          '<div id="tv-tel-corpo" style="margin-top:8px"><span class="muted">Gerando o seu código…</span></div>' +
          '<button type="button" class="btn ghost" id="tv-novo-cod" style="margin-top:8px">Gerar código novo</button></div>' +
        '<div style="font-size:12.5px;display:flex;flex-direction:column;gap:2px"><div id="tv-email-st"></div><div id="tv-tel-st"></div></div></div>';

      /* SEMPRE há saída: corrigir os dados digitados e "Já tenho a chave". "Agora não" só para quem está NO PRAZO pelo servidor
         (op.legado) — adiar não ganha dia nenhum, o relógio é do servidor. Teste novo (sem relógio) não tem "Agora não". */
      var botoes = [
        { texto: "Corrigir dados", classe: "ghost", onClick: function () { parar(); UI.fecharModal(); self._passoCadastro(aoLiberar, { nome: dados.nome, fone: dados.fone, email: dados.email }, op); self._semFechar(); } },
        { texto: "Já tenho a chave", classe: "ghost", onClick: function () { parar(); UI.fecharModal(); self._cadastroAberto = false; self._jaSouCliente(aoLiberar || function () { try { if (typeof App !== "undefined" && App.render) App.render(); } catch (e) {} }); } }
      ];
      if (op.legado) botoes.push({ texto: "Agora não", classe: "ghost", onClick: function () { parar(); UI.fecharModal(); } });
      else { var bSc = this._botaoSoConsultar(aoLiberar), fSc = bSc.onClick; bSc.onClick = function () { parar(); fSc(); }; botoes.push(bSc); }
      UI.modal("✉️ Confirme o seu e-mail e o seu WhatsApp", corpo, botoes);
      this._semFechar();
      pintar();

      /* e-mail: pede o código (só se falta) */
      var pedirEmail = function (silencioso) {
        var o = base(); o.canal = "email"; o.destino = dados.email;
        Licenca.pedirCodigoTeste(o, function (d) {
          if (!d) { UI.toast("Sem resposta do servidor. Tente de novo em instantes.", "erro", 8000); return; }
          if (d.expirado) { parar(); UI.fecharModal(); self._encerrado(aoLiberar); return; }
          if (!d.ok && d.espereSeg) { if (!silencioso) UI.toast(d.erro, "erro", 8000); return; }       // o código anterior segue valendo
          if (!d.ok) { UI.toast(d.erro || "Não consegui enviar o e-mail agora. Tente novamente em instantes.", "erro", 9000); return; }
          if (!silencioso) UI.toast("Código reenviado para o seu e-mail.", "ok");
        });
      };
      if (!S.emailOk) {
        /* ⚠ QUEM ESTÁ NO PRAZO (op.legado) NÃO RECEBE E-MAIL SOZINHO A CADA ABERTURA do app: o código só é enviado quando a pessoa
           clica em "Enviar código" (com os limites do servidor). Teste novo manda 1x ao abrir, como sempre. */
        if (!op.legado) pedirEmail(true);
        var bc = ver("tv-email-confirmar"), br = ver("tv-email-reenviar");
        if (br) br.onclick = function () { pedirEmail(false); };
        if (bc) bc.onclick = function () {
          if (S.enviando) return;
          var cod = ((ver("tg-cod") || {}).value || "").replace(/\D/g, "");
          if (cod.length !== 6) { UI.toast("Digite os 6 números do código do e-mail.", "erro"); return; }
          S.enviando = true;
          var o = base(); o.canal = "email"; o.destino = dados.email; o.codigo = cod; o.ref = S.ref;
          Licenca.confirmarCodigoTeste(o, function (d) {
            S.enviando = false;
            if (!d) { UI.toast("Sem resposta do servidor. Tente de novo — o código continua valendo.", "erro", 8000); return; }
            if (d.ok) { resultado(d); return; }
            UI.toast(d.erro || "Não consegui confirmar o código.", "erro", 8000);
          });
        };
      }
      /* telefone: gera o código do WhatsApp (só se falta) e acompanha */
      if (!S.telOk) {
        var iniciarTel = function () {
          S.fim = false;
          pedirTelefone(function () { desenharTel(); if (S.timer) clearInterval(S.timer); S.timer = setInterval(consultar, 3000); });
        };
        iniciarTel();
        var nc = ver("tv-novo-cod"); if (nc) nc.onclick = iniciarTel;
      }
    },

    /* TESTE ENCERRADO (aparelho que já testou, ou prazo vencido) — a mensagem clara, com a porta de compra.
       O trabalho continua VISÍVEL; só não edita nem exporta (App._trialBloqueado). Nada do cadastro anterior é mostrado. */
    _encerrado: function (aoLiberar) {
      var srv = "";
      try { srv = (typeof Licenca !== "undefined" && Licenca._servidor) ? Licenca._servidor() : ""; } catch (e) {}
      UI.modal("⏰ Seu período de teste terminou",
        '<p style="margin:0 0 10px">O teste grátis deste computador já foi usado. Para continuar editando e exportando, ative uma licença do OrçaPRO.</p>' +
        '<p class="muted" style="margin:0">O que você já montou continua aqui para consulta. ' + (srv ? '<a href="' + srv + '/planos" target="_blank" rel="noopener">Ver planos e comprar</a> · ' : '') + 'ou fale com a RA Engenharia pelo site.</p>', [
        { texto: "Já tenho a chave", classe: "ghost", onClick: function () { UI.fecharModal(); if (typeof aoLiberar === "function") aoLiberar(); try { if (typeof App !== "undefined" && App.abrirLicenca) App.abrirLicenca(); } catch (e2) {} } },
        { texto: "Continuar só para consulta", classe: "primary", onClick: function () { UI.fecharModal(); if (typeof aoLiberar === "function") aoLiberar(); } }
      ]);
      this._semFechar();
    },

    /* QUEM JÁ ESTAVA TESTANDO: valida telefone e e-mail na próxima abertura da versão nova. O relógio NÃO para nem reinicia
       (o servidor só marca que falta validar). op: {falta, obrigatorio}. */
    validarContatos: function (op) {
      op = op || {};
      var r = this.reg() || {};
      var falta = (op.falta && op.falta.length) ? op.falta : ["telefone", "email"];
      var temFone = String(r.telefone || "").replace(/\D/g, "").length >= 10;
      /* no prazo mas SEM e-mail (ou sem telefone) no cadastro: também é legado — pede o que falta num formulário curto e
         valida do mesmo jeito, em vez de ignorar quem justamente mais precisa */
      if (!this._emailOk(r.email) || !temFone) {
        var self = this;
        this._passoCadastro(null, { nome: r.nome || "", fone: r.telefone || "", email: r.email || "" }, { legado: true, falta: falta });
        return true;
      }
      this._iniciarValidacao(null, { nome: r.nome || "", fone: r.telefone, email: r.email }, { falta: falta, legado: true });
      return true;
    },

    /* Entrada de quem já comprou: cola a chave, a licença ativa neste aparelho
       e o boot segue — a nuvem da empresa conecta sozinha (app.js, boot) e
       traz orçamentos, obras, diários e financeiro. Sem a chave à mão, o
       /recuperar da loja devolve a chave por e-mail + documento. */
    _jaSouCliente: function (aoLiberar) {
      var self = this;
      var srv = "";
      try { srv = (typeof Licenca !== "undefined" && Licenca._servidor) ? Licenca._servidor() : ""; } catch (e) {}
      var corpo =
        '<p class="muted" style="margin:0 0 12px">Cole a <b>chave de licença</b> que você recebeu por e-mail na compra. Os dados da sua empresa (orçamentos, obras, diários, medições e financeiro) vêm da nuvem para este aparelho.</p>' +
        '<div class="field"><label>Chave de licença *</label><input id="tg-chave" placeholder="Cole aqui a sua chave" autocomplete="off" spellcheck="false" style="font-family:var(--fonte-num,monospace)"></div>' +
        (srv ? '<p style="margin:6px 0 0;font-size:13px"><a href="' + srv + '/recuperar" target="_blank" rel="noopener">Não encontro a minha chave</a></p>' : '') +
        '<p class="muted" style="margin:12px 0 0;font-size:12.5px">Depois, cada pessoa da equipe entra com o próprio usuário e senha.</p>';
      UI.modal("🔑 Entrar com a minha licença", corpo, [
        { texto: "Voltar", classe: "ghost", onClick: function () { UI.fecharModal(); self.gate(aoLiberar); } },
        { texto: "Entrar e trazer meus dados →", classe: "primary", onClick: function () {
          var chave = String((UI.el("tg-chave") || {}).value || "").trim();
          if (chave.length < 8) { UI.toast("Cole a sua chave de licença.", "erro"); return; }
          if (typeof Licenca === "undefined" || !Licenca.ativarOnline) { UI.toast("Não foi possível ativar agora. Tente de novo.", "erro"); return; }
          UI.toast("Conferindo a licença…", "ok");
          Licenca.ativarOnline(chave, function (r) {
            if (!r || !r.ok) { UI.toast((r && r.erro) || "Chave inválida.", "erro"); return; }
            /* licença nova = empresa nova na nuvem: larga qualquer sessão anterior */
            try { if (typeof Nuvem !== "undefined" && Nuvem.trocouDeLicenca) Nuvem.trocouDeLicenca(); } catch (eN) {}
            UI.fecharModal();
            UI.toast(r.offline ? "Licença ativada. Os dados da nuvem chegam quando houver internet." : "Licença ativada. Trazendo os seus dados da nuvem…", "ok");
            if (typeof aoLiberar === "function") aoLiberar();
          });
        } }
      ]);
      this._semFechar();
    },

    _semFechar: function () {
      /* ⚠ v1.1.235 — ESTE MODAL NÃO PODE SER FECHADO NO ✕. O gate aborta o
         boot ANTES do render: com o modal fechado no ✕ ou no clique fora, o
         que sobra é a tela BRANCA (o index nasce com sidebar/topbar/main
         vazios) e o usuário só sai disso recarregando a página — na primeira
         impressão do produto. Ou preenche, ou o modal continua ali.
         O ✕ é removido do DOM em vez de escondido: escondê-lo deixaria o
         atalho de teclado ainda funcionando. */
      try {
        var bgT = document.querySelector(".modal-bg");
        if (bgT) {
          var xT = bgT.querySelector("[data-fechar], .modal-x");
          if (xT && xT.parentNode) xT.parentNode.removeChild(xT);
          bgT.dataset.semFecharFora = "1";
        }
      } catch (eX) {}
    }
  };

  global.Telemetria = Telemetria;
  if (typeof module !== "undefined" && module.exports) module.exports = Telemetria;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
