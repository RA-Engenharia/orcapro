/* =====================================================================
 * licitacaofilaui.js — FIAÇÃO da fila do CertamePRO sem pop-up
 * (motor puro: js/licitacaofila.js; contrato C:\Users\USER\Licitacoes\docs\
 * INTEGRACAO-ORCAPRO.md, "Fila no servidor").
 *
 * O QUE A PESSOA VÊ:
 *   · link do CertamePRO (http://localhost:<porta>/#parear_certamepro=CÓDIGO):
 *     uma janela mostra a conta (e-mail mascarado), o papel e as empresas, e
 *     UM clique confirma. Nunca pareia sozinho. Já havendo outra conta
 *     pareada, a janela avisa que vai TROCAR.
 *   · menu da conta > "Fila do CertamePRO": estado do pareamento, o
 *     interruptor "Orçar a fila do CertamePRO sozinho" (DESLIGADO por padrão)
 *     e o botão de desligar este aparelho.
 *   · com o interruptor ligado: a cada consultar_a_cada_s o OrçaPRO consulta a
 *     fila, reserva UM certame, baixa o pacote, orça e devolve. Sem janela
 *     bloqueante: só avisos discretos (toast).
 *
 * ⚠ NÃO MEXE NA TELA: o orçamento do certame é lido e GRAVADO DIRETO no Store
 *   (App.licitacaoAutomatica origem "fila", opts.orc); App.orcAtual e o editor
 *   ficam como a pessoa deixou. Se ela abrir justamente aquele orçamento, ou o
 *   disco mudar no meio, a gravação aborta (Store.CAS_ATIVO) e nada se perde.
 * ⚠ Pacote de fora entra só como licitação do certame: sem `gestao`, com o
 *   bloco certamepro, e nunca por cima de orçamento que não seja o do mesmo
 *   certame (LicitacaoFila.prepararPacote).
 * ⚠ O token fica só no localStorage deste computador (LicitacaoFila); aqui ele
 *   nunca é lido nem mostrado.
 * ===================================================================== */
(function (global) {
  "use strict";
  if (typeof App === "undefined" || typeof UI === "undefined" || typeof LicitacaoFila === "undefined") return;

  var F = LicitacaoFila;
  var CHAVE_CODIGO = "orcapro:fila-certamepro:codigo-pendente";
  var PRAZO_ORCAR_MS = 15 * 60 * 1000;
  var esc = function (x) { return Util.esc(String(x == null ? "" : x)); };

  var timer = null, rodando = false, falhasSeguidas = 0, avisados = {}, pulados = {}, iniciado = false;

  function st() { try { return global.localStorage; } catch (e) { return null; } }
  function eid() { try { return Auth.empresaId(); } catch (e) { return "default"; } }
  /* ⚠ FETCH COM LIMITE DE TEMPO: sem ele, uma conexão que fica pendurada (servidor que aceita e não responde, rede que cai
     no meio) deixa o `rodando` verdadeiro para sempre — a fila para de consultar o CertamePRO até recarregar o app, e o
     setInterval de 60 s não religa enquanto `rodando` estiver preso. 60 s é bem mais que a resposta normal. */
  function buscaComLimite(u, o) {
    var ctl = null, t = null, init = o || {};
    try { if (typeof global.AbortController === "function") { ctl = new global.AbortController(); init = {}; Object.keys(o || {}).forEach(function (k) { init[k] = o[k]; }); init.signal = ctl.signal; } } catch (e) { ctl = null; init = o; }
    if (ctl) t = setTimeout(function () { try { ctl.abort(); } catch (e) {} }, 60000);
    return global.fetch(u, init).then(function (r) { if (t) clearTimeout(t); return r; }, function (e) { if (t) clearTimeout(t); throw e; });
  }
  function cliente() { return F.criar({ fetch: buscaComLimite, storage: st(), emp: eid() }); }
  /* aviso discreto: uma vez por motivo (não repete a cada consulta) */
  function avisar(chave, msg, tipo) {
    if (avisados[chave]) return;
    avisados[chave] = true;
    try { UI.toast(msg, tipo || "erro", 9000); } catch (e) {}
  }
  function msgErro(r) { return (r && r.decisao && r.decisao.aviso) || "Não consegui falar com o CertamePRO. Nada foi gravado."; }

  /* ---------------------------------------------------------------- *
   * Pareamento: prévia -> confirmação (UM clique) -> parear
   * ---------------------------------------------------------------- */
  function confirmarPareamento(codigo) {
    var c;
    try { c = cliente(); } catch (e0) { UI.toast(e0.message, "erro"); return; }
    c.previa(codigo).then(function (r) {
      if (!r.ok) { UI.toast(msgErro(r), "erro"); return; }
      var pv = r.previa, dec = F.decidirPareamento(F.estadoPublico(st(), eid()), pv), atual = F.estadoPublico(st(), eid());
      var corpo = '<p style="font-size:13px;margin-top:0">O CertamePRO vai ligar <b>este computador</b> à conta abaixo, para o OrçaPRO buscar certames da fila e devolver orçamentos. Confira antes de confirmar.</p>' +
        '<ul style="font-size:13px"><li>Conta: <b>' + esc(pv.conta || "—") + '</b>' + (pv.papel ? " (" + esc(pv.papel) + ")" : "") + '</li>' +
        '<li>Empresas: ' + (pv.empresas.length ? pv.empresas.map(function (e) { return "<b>" + esc(e.nome) + "</b>"; }).join(", ") : (pv.todasAsDoUsuario ? "todas as do usuário" : "<i>nenhuma marcada (a fila fica vazia)</i>")) + '</li></ul>' +
        (dec.perguntarTroca ? '<p style="font-size:13px;color:var(--vermelho,#b91c1c)"><b>Atenção: este OrçaPRO já está conectado à conta ' + esc(atual.conta || "—") + '.</b> Confirmar TROCA a conexão para a conta acima. Se você não pediu essa troca, cancele: um link de outra pessoa poderia ligar a sua base de preços à conta dela.</p>' : '') +
        '<p class="muted" style="font-size:12.5px">A conexão fica guardada só neste computador e pode ser desligada a qualquer hora. Nada é enviado antes de você ligar o interruptor da fila.</p>';
      UI.modal(dec.perguntarTroca ? "Trocar a conta do CertamePRO?" : "Conectar ao CertamePRO", corpo, [
        { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
        { texto: dec.perguntarTroca ? "Trocar a conexão" : "Confirmar a conexão", classe: "primary", onClick: function () {
            UI.fecharModal();
            c.parear(codigo, pv).then(function (p) {
              if (!p.ok) { UI.toast(msgErro(p), "erro"); return; }
              avisados = {}; falhasSeguidas = 0; pulados = {};
              UI.toast("Conectado ao CertamePRO. Para a fila orçar sozinha, ligue o interruptor.", "ok");
              abrir();
            });
          } }
      ]);
    });
  }

  /* ---------------------------------------------------------------- *
   * Janela do menu da conta: estado, interruptor, desligar
   * ---------------------------------------------------------------- */
  function abrir() {
    var e = F.estadoPublico(st(), eid()), cfg = F.lerConfig(st(), eid());
    var h = '<div style="font-size:13px">';
    if (e.pareado) {
      h += '<p style="margin-top:0">Conectado à conta <b>' + esc(e.conta || "—") + '</b>' + (e.papel ? " (" + esc(e.papel) + ")" : "") + '. Este computador: <span class="mono">' + esc(e.nome || F.nomeAparelho(st())) + '</span>.</p>' +
        (e.empresas.length ? '<p>Empresas: ' + e.empresas.map(function (x) { return esc(x.nome); }).join(", ") + '.</p>' : '') +
        '<label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;margin:12px 0"><input type="checkbox" id="fila-liga"' + (cfg.ligado ? " checked" : "") + ' style="margin-top:3px"> <span><b>Orçar a fila do CertamePRO sozinho</b><br><span class="muted" style="font-size:12.5px">A cada ' + esc(e.consultarACadaS) + ' s o OrçaPRO olha a fila, pega um certame, orça pelas bases do edital e devolve. Só roda com você na lista de orçamentos, sem janela aberta. O orçamento sai marcado como “não conferido”.</span></span></label>';
    } else {
      h += '<p style="margin-top:0">Este OrçaPRO ainda não está conectado ao CertamePRO. No CertamePRO, abra <b>Meu perfil &gt; Conectar o OrçaPRO</b>: ele abre esta tela com o código. Ou cole o código aqui:</p>' +
        '<p><input id="fila-codigo" autocomplete="off" spellcheck="false" placeholder="XXXXX-XXXXX" style="width:100%;max-width:240px"></p>';
    }
    h += '</div>';
    var b = [{ texto: "Fechar", classe: "ghost", onClick: function () { UI.fecharModal(); } }];
    if (e.pareado) {
      b.unshift({ texto: "Desligar este aparelho", classe: "ghost", onClick: function () {
        F.desligar(st(), eid()); parar(); UI.fecharModal();
        UI.toast("Este aparelho foi desligado do CertamePRO. O acesso foi apagado daqui (para revogar no servidor, use Meu perfil no CertamePRO).", "ok", 9000);
      } });
      b.push({ texto: "Salvar", classe: "primary", onClick: function () {
        var el = UI.el("fila-liga"), ligar = !!(el && el.checked);
        F.gravarConfig(st(), eid(), { ligado: ligar });
        UI.fecharModal();
        if (ligar) { avisados = {}; falhasSeguidas = 0; agendar(5000); UI.toast("Fila do CertamePRO ligada.", "ok"); }
        else { parar(); UI.toast("Fila do CertamePRO desligada.", "ok"); }
      } });
    } else {
      b.push({ texto: "Conferir o código", classe: "primary", onClick: function () {
        var el = UI.el("fila-codigo"), cod = el ? el.value : "";
        UI.fecharModal(); confirmarPareamento(cod);
      } });
    }
    UI.modal("Fila do CertamePRO", h, b);
  }

  /* ---------------------------------------------------------------- *
   * Consulta periódica
   * ---------------------------------------------------------------- */
  function parar() { if (timer) { clearTimeout(timer); timer = null; } }
  function agendar(ms) {
    parar();
    if (!F.lerConfig(st(), eid()).ligado || !F.lerPareamento(st(), eid())) return;
    timer = setTimeout(tick, Math.max(1000, ms));
  }

  /* só roda com sessão, módulo de orçamentos, licença que permite gravar e nenhum orçamento automático em andamento.
     A fila NÃO abre o orçamento na tela: grava direto no Store, então não precisa tirar a pessoa de onde ela está. */
  function pronto() {
    try {
      if (!Auth.usuario()) return false;
      if (typeof Auth.podeModulo === "function" && !Auth.podeModulo("orcamentos")) return false;
      if (App._licAutoRodando) return false;
      if (App._trialBloqueado && App._trialBloqueado()) return false;
      /* licença só do Modela: o orçamento não é dela (App.persistir também recusa) */
      if (typeof Gestao !== "undefined" && Gestao.soModela && Gestao.soModela()) return false;
      return true;
    } catch (e) { return false; }
  }

  /* importa o pacote (só como licitação do certame) e roda o automático com origem "fila", sem abrir nada na tela */
  function orcar(pacote, info) {
    return new Promise(function (resolve) {
      var acabou = false, sinal = { cancelado: false };
      var fim = function (r) { if (acabou) return; acabou = true; clearTimeout(tmo); resolve(r); };
      var tmo = setTimeout(function () { sinal.cancelado = true; fim({ ok: false, erro: "o orçamento automático passou de 15 minutos" }); }, PRAZO_ORCAR_MS);
      try {
        var id0 = pacote && pacote.orcamentos && pacote.orcamentos[0] ? String(pacote.orcamentos[0].id || "") : "";
        /* a pessoa está com este orçamento aberto: reimportar por cima pisaria a edição dela. Tenta depois, sem gastar tentativa */
        if (id0 && App.orcAtual && App.orcAtual.id === id0) { fim({ ok: false, status: 503, erro: "o orçamento está aberto na tela" }); return; }
        var existente = id0 ? Store.obterOrcamento(eid(), id0) : null;
        var prep = F.prepararPacote(pacote, existente);
        if (!prep.ok) { fim({ ok: false, erro: prep.erro }); return; }
        var v = Pacote.validar(prep.pacote);
        if (!v.ok) { fim({ ok: false, erro: "pacote inválido: " + v.erros.slice(0, 2).join(" ") }); return; }
        if (!info.destinoDevolver) { fim({ ok: false, status: 401, erro: "sem conexão com o CertamePRO" }); return; }
        if (!info.marca.assinatura || !info.marca.certame) { fim({ ok: false, erro: "o pacote não trouxe a assinatura ou o certame" }); return; }
        /* ⚠ SUBSTITUIR é o padrão do pacote: o orçamento antigo do MESMO certame, se foi mexido, vira cópia "(antes da reimportação)" — nada se perde */
        var res = Pacote.aplicar(prep.pacote, "fila", {});
        if (!res.ok) { fim({ ok: false, erro: "pacote não importado: " + (res.erros || []).slice(0, 2).join(" ") }); return; }
        var id = res.orcIds[0];
        var orc = Store.obterOrcamento(eid(), id);
        if (!orc) { fim({ ok: false, erro: "não consegui ler o orçamento importado" }); return; }
        App.licitacaoAutomatica({
          origem: "fila", orc: orc, sinal: sinal, marcaExtra: info.marca, destinoDevolver: info.destinoDevolver,
          aoTerminar: function (r) { fim(r || { ok: false, erro: "sem resultado" }); }
        });
      } catch (e) { fim({ ok: false, erro: String((e && e.message) || e) }); }
    });
  }

  function tick() {
    timer = null;
    if (rodando) return;
    rodando = true;
    var c;
    try { c = cliente(); } catch (e0) { rodando = false; return; }
    F.executarCiclo({ cliente: c, storage: st(), emp: eid(), pulados: pulados, pronto: pronto, orcar: orcar }).then(function (r) {
      rodando = false;
      var par = F.lerPareamento(st(), eid());
      if (r.acao === "quieto" || r.acao === "rede" || r.acao === "erro") falhasSeguidas++; else falhasSeguidas = 0;
      if (r.acao === "reparear") avisar("reparear", r.aviso || "A conexão com o CertamePRO foi revogada. Gere um novo código no CertamePRO.", "erro");
      else if (r.acao === "senha") avisar("senha", r.aviso, "erro");
      else if (r.acao === "devolvido") UI.toast("Fila do CertamePRO: orçamento devolvido (certame " + r.certame_id + "). Falta você conferir.", "ok", 9000);
      else if (r.acao === "nao-aplicado") UI.toast("Fila do CertamePRO: o certame " + r.certame_id + " já tem orçamento conferido no CertamePRO; nada foi gravado lá. Deixei de lado.", "erro", 9000);
      else if (r.acao === "recusado") UI.toast("Fila do CertamePRO: certame " + r.certame_id + " devolvido à fila sem orçamento (" + r.motivo + ").", "erro", 9000);
      else if (r.acao === "desistiu") UI.toast("Fila do CertamePRO: o certame " + r.certame_id + " falhou " + F.MAX_TENTATIVAS + " vezes e foi devolvido sem orçamento. Faça à mão.", "erro", 9000);
      var espera = F.proximaEspera({ base_s: r.base_s || (par && par.consultar_a_cada_s), decisao: { acao: r.acao, espera_s: r.espera_s }, falhasSeguidas: falhasSeguidas });
      /* ocupado (a pessoa está no meio de algo): olha de novo logo, sem gastar a cota do servidor (ainda não consultou) */
      if (r.acao === "ocupado") espera = 20;
      /* devolveu um: tem mais na fila? o piso do intervalo (30 s) já respeita o limite de 2 consultas/min do servidor */
      agendar(espera * 1000);
    }, function () { rodando = false; falhasSeguidas++; agendar(F.INTERVALO_MAX_S * 1000); });
  }

  /* ---------------------------------------------------------------- *
   * Entrada: o #fragmento do link e o temporizador
   * ---------------------------------------------------------------- */
  function iniciar() {
    if (iniciado) return; iniciado = true;
    var cod = "";
    try {
      var f = F.consumirFragmento(global.location, global.history);
      if (f.presente) {
        if (f.codigo) { try { global.sessionStorage.setItem(CHAVE_CODIGO, f.codigo); } catch (e1) {} }
        else UI.toast("O link de pareamento do CertamePRO veio com um código inválido. Gere outro no CertamePRO.", "erro");
      }
      try { cod = global.sessionStorage.getItem(CHAVE_CODIGO) || ""; } catch (e2) { cod = ""; }
    } catch (e0) {}
    if (cod) {
      var n = 0;
      (function espera() {
        var ok = false;
        try { ok = !!(Auth.usuario() && !UI.el("modal-bg")); } catch (e) {}
        /* só o administrador da conta conecta a fila (ela devolve orçamentos e base de preços da empresa): para os outros, o link é descartado */
        if (ok && !(Auth.ehAdmin && Auth.ehAdmin())) { try { global.sessionStorage.removeItem(CHAVE_CODIGO); } catch (e4) {} return; }
        if (ok) { try { global.sessionStorage.removeItem(CHAVE_CODIGO); } catch (e3) {} confirmarPareamento(cod); return; }
        if (++n > 1200) return;
        setTimeout(espera, 500);
      })();
    }
    agendar(15000);
    /* a sessão pode ainda não existir no boot (login): de minuto em minuto, se a fila está ligada e parada, religa o temporizador */
    setInterval(function () { if (!timer && !rodando) agendar(2000); }, 60000);
  }

  global.LicitacaoFilaUi = { iniciar: iniciar, abrir: abrir, confirmarPareamento: confirmarPareamento, tick: tick, pronto: pronto, orcar: orcar };
})(typeof window !== "undefined" ? window : this);
