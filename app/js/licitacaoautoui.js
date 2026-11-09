/* =====================================================================
 * licitacaoautoui.js — FIAÇÃO do orçamento de licitação automático
 * (motor puro: js/licitacaoauto.js; contrato RA-Equipe\licitacoes\
 * contrato-orcamento-automatico-v1.md).
 *
 * Dois pontos de entrada:
 *   · App.licitacaoAutomaticaSePedido(orcId) — logo depois de importar um
 *     pacote com `orcamento_automatico: true` (js/pacote.js).
 *   · App.licitacaoAutomatica({origem:"botao"}) — botão "Orçar sozinho" do
 *     painel de licitação, com confirmação.
 *
 * O FLUXO (uma janela com as etapas e o resultado):
 *   preset -> bases exigidas -> orçar pelas bases -> BDI -> salvar ->
 *   gerar o _PRO.xlsx -> POST no devolver_para (App._licDevolverSilencioso,
 *   a MESMA rota do botão "Devolver ao CertamePRO").
 *
 * ⚠ NADA SE PERDE. O trabalho é feito numa CÓPIA do orçamento e só vira o
 *   orçamento aberto quando a gravação confirma. Rede fora do ar, token de 12 h
 *   vencido ou CertamePRO recusando: o orçamento JÁ está salvo, a janela diz o
 *   que houve, o arquivo é baixado e o botão manual "Devolver ao CertamePRO"
 *   continua lá.
 * ⚠ SÓ DESTINO CONFIÁVEL RECEBE SOZINHO: esta máquina ou o CertamePRO oficial
 *   por https. O endereço vem de um arquivo de fora (ver Licitacao.destino): com
 *   qualquer outro host o automático monta e salva, e a devolução fica com o
 *   botão manual, que mostra o endereço e pede o aval.
 * ⚠ NUNCA REPRECIFICA EM SILÊNCIO: o aviso fixo "Orçamento montado sozinho —
 *   não conferido por você" fica no painel até a pessoa marcar como conferido.
 * ===================================================================== */
(function (global) {
  "use strict";
  if (typeof App === "undefined" || typeof UI === "undefined") return;

  var esc = function (s) { return Util.esc(String(s == null ? "" : s)); };
  /* teto da espera da base de preços assentar (60 s, decisão de coordenação; o da varredura pendurada segue 90 s em atualizacao.js) */
  var PRAZO_BASE_MS = 60000;

  var ETAPAS = [
    { id: "preset", rotulo: "Aplicar o preset do edital" },
    { id: "espera", rotulo: "Aguardando a base de preços" },
    { id: "bases", rotulo: "Conferir as bases de preço exigidas" },
    { id: "orcar", rotulo: "Refazer o preço pelas bases exigidas" },
    { id: "bdi", rotulo: "Conferir o BDI" },
    { id: "salvar", rotulo: "Salvar o orçamento" },
    { id: "devolver", rotulo: "Gerar o Excel e devolver ao CertamePRO" }
  ];
  var SELO = { espera: "·", rodando: "…", ok: "OK", aviso: "!", erro: "X", pulou: "—" };
  var COR = { espera: "var(--texto-fraco)", rodando: "#1d4ed8", ok: "var(--verde)", aviso: "#b45309", erro: "#b91c1c", pulou: "var(--texto-fraco)" };

  function htmlEtapas(est) {
    return '<ol class="lic-auto-etapas" style="list-style:none;margin:0;padding:0">' + ETAPAS.map(function (e) {
      var s = est[e.id] || { estado: "espera", detalhe: "" };
      return '<li data-etapa="' + e.id + '" data-estado="' + s.estado + '" style="padding:4px 0;font-size:13px">' +
        '<b style="display:inline-block;min-width:26px;color:' + COR[s.estado] + '">' + SELO[s.estado] + '</b> ' + esc(e.rotulo) +
        (s.detalhe ? '<div class="muted" style="font-size:12px;margin-left:30px">' + esc(s.detalhe) + '</div>' : '') + '</li>';
    }).join("") + '</ol>';
  }

  /* AUDITORIA: a trilha local que o app já usa para pacotes (Store.salvar numa
     entidade própria, como "pacotes_importados" em js/pacote.js) */
  App._licAutoLog = function (tipo, orc, dados) {
    try {
      var u = {}; try { u = Auth.usuario() || {}; } catch (e0) {}
      var reg = { id: Util.uid("lau"), quando: Util.agoraISO(), tipo: String(tipo || ""), usuario: u.email || u.login || "",
        orcId: orc ? orc.id : "", numero: orc ? String(orc.numero || "") : "", versao: (typeof CONFIG !== "undefined" ? CONFIG.versao : "") };
      Object.keys(dados || {}).forEach(function (k) { reg[k] = dados[k]; });
      Store.salvar(Auth.empresaId(), "licitacao_auto_log", reg);
      return reg;
    } catch (e) { return null; }
  };

  /* ctx do motor: o do Orçamentista (bases do app) + o das bases exigidas */
  App._licAutoCtx = function (orc) {
    var guardado = this._orcm, self = this, ctx;
    try { if (this._licBasesFatos) this._licBasesFatos(); } catch (e0) {}
    var exig = Licitacao.basesExigidas(orc), fontes = [];
    exig.forEach(function (e) { if (fontes.indexOf(e.catId) < 0) fontes.push(e.catId); });
    this._orcm = { modo: "orcamento", orcId: orc.id };      // _orcmFamiliaLic lê daqui
    try { ctx = this._orcmCtx({ fontes: fontes, elaborar: false }); }
    finally { this._orcm = guardado; }
    var sit = this._licCtxBases();
    Object.keys(sit).forEach(function (k) { ctx[k] = sit[k]; });
    return ctx;
  };

  App.licitacaoAutomaticaSePedido = function (orcId) {
    var orc = this.orcAtual;
    if (!orc || orc.id !== orcId || typeof LicitacaoAuto === "undefined" || !LicitacaoAuto.pedeAutomatico(orc)) return false;
    this.licitacaoAutomatica({ origem: "pacote" });
    return true;
  };

  App.licitacaoAutomatica = function (opts) {
    opts = opts || {};
    var self = this, orc = this.orcAtual;
    if (!orc || typeof Licitacao === "undefined" || typeof LicitacaoAuto === "undefined") return;
    var lic = Licitacao.cfg(orc);
    if (!lic || !lic.certamepro) { UI.toast("Este orçamento não veio de um pacote do CertamePRO.", "erro"); return; }
    if (this._trialBloqueado && this._trialBloqueado()) { this._avisoTrial(); return; }
    if (Orcamento.travadoPorAprovacao && Orcamento.travadoPorAprovacao(orc)) { UI.toast("Orçamento aprovado: o orçamento automático não roda nele. Crie uma revisão.", "erro"); return; }
    if (this._licAutoRodando) { UI.toast("O orçamento automático já está rodando.", "erro"); return; }
    if (opts.origem === "botao" && !opts.confirmado) {
      var nEdit = LicitacaoAuto.contarEditados(orc);
      UI.modal("Orçar sozinho?",
        '<p style="font-size:13px;margin-top:0">O OrçaPRO vai, <b>sem mais perguntas</b>:</p>' +
        '<ol style="font-size:13px"><li>aplicar o preset do edital;</li>' +
        '<li>refazer o <b>custo</b> dos itens do órgão pelas bases que o edital exige, na competência exigida (o que não casar com segurança <b>fica com o preço do órgão</b>);</li>' +
        '<li>conferir o BDI (só avisa se fugir da faixa do TCU);</li>' +
        '<li>salvar' + (lic.devolverPara ? ' e <b>devolver ao CertamePRO</b>' : '') + '.</li></ol>' +
        '<p style="font-size:13px" id="lic-auto-editados"><b>' + nEdit + ' item(ns) com preço já alterado por você ' + (nEdit ? 'serão preservados (não são refeitos)' : '(nenhum)') + '.</b></p>' +
        '<p class="muted" style="font-size:12.5px">Descrição, unidade e quantidade dos itens do órgão não mudam. O orçamento fica marcado como “não conferido” até você conferir.</p>',
        [
          { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
          { texto: "Orçar sozinho", classe: "primary", onClick: function () { UI.fecharModal(); opts.confirmado = true; self.licitacaoAutomatica(opts); } }
        ]);
      return;
    }
    this._licAutoRodando = true;
    var est = {}, copia = Util.clone(orc);
    if (!copia || copia === orc) { this._licAutoRodando = false; UI.toast("Não consegui preparar a cópia de segurança do orçamento. Nada foi feito.", "erro"); return; }
    var set = function (id, estado, detalhe) {
      est[id] = { estado: estado, detalhe: detalhe || "" };
      var corpo = UI.el("lic-auto-corpo"); if (corpo) corpo.innerHTML = htmlEtapas(est);
    };
    var fim = function (titulo, extraHtml, botoes) {
      self._licAutoRodando = false;
      UI.modal(titulo, '<div id="lic-auto-corpo">' + htmlEtapas(est) + '</div>' + (extraHtml || ""), botoes || [{ texto: "Fechar", classe: "primary", onClick: function () { UI.fecharModal(); } }]);
    };
    UI.modal("Orçamento automático", '<div id="lic-auto-corpo">' + htmlEtapas(est) + '</div>', []);
    var proximo = function (fn) { setTimeout(function () { try { fn(); } catch (e) { self._licAutoLog("erro", orc, { erro: String((e && e.message) || e) }); fim("O orçamento automático parou", '<p style="font-size:13px">' + esc("Erro inesperado: " + ((e && e.message) || e) + ". Nada foi gravado; o orçamento está como estava.") + "</p>"); } }, 30); };

    /* 0) ESPERAR A BASE ASSENTAR. A SINAPI troca sozinha uns 12 s depois de a aba carregar (Atualizacao.checarAuto):
       numa aba aberta pelo CertamePRO, importar antes disso fazia o automático ver a base antiga e dizer "não instalada"
       (falso). Segue NA HORA se a competência exigida de cada base já está instalada, ou se não há varredura em
       andamento; senão espera o FIM da varredura (Promise de Atualizacao.aguardarVarredura, sem polling), com teto de
       60 s (PRAZO_BASE_MS; App._licAutoEsperaMs). Não muda preço nem regra de casamento. */
    var estouroEspera = false, tetoEspera = (self._licAutoEsperaMs > 0 ? self._licAutoEsperaMs : PRAZO_BASE_MS);
    var aguardarBase = function (cb0) {
      /* ⚠ o que roda DEPOIS da espera (callback de Promise/timer) não passa pelo try/catch de `proximo`: uma exceção ali deixava o
         modal "Orçamento automático" aberto e sem botão. `cb` é o mesmo passo, com saída que mostra o erro e fecha. */
      var cb = function () {
        try { cb0(); }
        catch (eCb) {
          try { self._licAutoLog("erro", orc, { erro: String((eCb && eCb.message) || eCb) }); } catch (eL0) {}
          fim("O orçamento automático parou", '<p style="font-size:13px">' + esc("Erro inesperado: " + ((eCb && eCb.message) || eCb) + ". Nada foi gravado; o orçamento está como estava.") + "</p>");
        }
      };
      var exig0 = Licitacao.basesExigidas(copia);
      var certa = function () {
        if (!exig0.length) return true;
        try { return LicitacaoAuto.situacaoAuto(copia, self._licAutoCtx(copia)).every(function (x) { return x.ok; }); } catch (eB) { return true; }
      };
      var A = global.Atualizacao;
      if (certa()) { set("espera", "pulou", "a base de preços exigida já está instalada"); cb(); return; }
      if (!A || !A.varreduraPendente || !A.varreduraPendente()) { set("espera", "pulou", "nenhuma atualização da base em andamento"); cb(); return; }
      set("espera", "rodando", "a base de preços está sendo atualizada; espero até " + Math.round(tetoEspera / 1000) + " s");
      A.aguardarVarredura(tetoEspera).then(function (r) {
        estouroEspera = !!(r && r.estouro);
        if (estouroEspera) set("espera", "aviso", "a base ainda estava sendo atualizada depois de " + Math.round(tetoEspera / 1000) + " s; segui com o que estava instalado");
        else set("espera", "ok", "a atualização da base terminou");
        cb();
      }, function () { set("espera", "aviso", "não consegui acompanhar a atualização da base"); cb(); });
    };
    var corpo = function () {
      // 1) preset
      set("preset", "rodando");
      var es = LicitacaoAuto.escolherPreset(LicitacaoAuto.blocoDe(copia));
      var ap = LicitacaoAuto.aplicarPreset(copia, es.id, LicitacaoAuto.blocoDe(copia), es);
      if (!ap) { set("preset", "erro", "preset não aplicado"); fim("O orçamento automático parou", ""); return; }
      set("preset", (es.deduzido || ap.avisos.length) ? "aviso" : "ok", ap.preset.rotulo + (es.deduzido ? " — " + es.motivo : "") + (ap.avisos.length ? " — " + ap.avisos.join(" ") : ""));
      // 2) esperar a base assentar (o preset já está na cópia: a mesma conta do passo das bases) e conferir as bases
      aguardarBase(function () {
      set("bases", "rodando");
      var exig = Licitacao.basesExigidas(copia), ctx;
      try { ctx = self._licAutoCtx(copia); } catch (eC) { set("bases", "erro", "não montei o acesso às bases: " + ((eC && eC.message) || eC)); fim("O orçamento automático parou", '<p style="font-size:13px">Nada foi gravado.</p>'); return; }
      var sits = LicitacaoAuto.situacaoAuto(copia, ctx);
      var faltam = sits.filter(function (x) { return !x.ok; });
      if (!exig.length) set("bases", "aviso", "o pacote não traz base de preço exigida: os itens ficam com o preço do órgão");
      else if (faltam.length) set("bases", "aviso", faltam.map(function (x) { return x.motivo; }).join("; ") + (estouroEspera ? " (a base de preços ainda estava sendo atualizada: esperei " + Math.round(tetoEspera / 1000) + " s)" : "") + " — os itens dessas bases ficam com o preço do órgão");
      else if (sits.some(function (x) { return !!x.aviso; })) set("bases", "aviso", sits.map(function (x) { return Licitacao.fmtBase(x.exigida) + (x.aviso ? " (" + x.aviso + ")" : ""); }).join("; "));
      else set("bases", "ok", sits.map(function (x) { return Licitacao.fmtBase(x.exigida); }).join("; "));
      proximo(function () {
        // 3) orçar
        set("orcar", "rodando");
        var r = LicitacaoAuto.orcar(copia, ctx);
        set("orcar", r.baixa_confianca.length ? "aviso" : "ok",
          r.pela_base + " de " + r.itens + " item(ns) pelo código na base exigida; " + r.por_descricao + " por descrição (conferir); " + r.preco_do_orgao_mantido + " com o preço do órgão" +
          (r.editados_pelo_usuario ? "; " + r.editados_pelo_usuario + " editado(s) por você, não refeito(s)" : ""));
        // 4) BDI
        set("bdi", "rodando");
        var b = LicitacaoAuto.conferirBdi(copia, ap.preset.id);
        set("bdi", (b.aviso || b.avisoDivergencia) ? "aviso" : "ok", b.percentual != null ? (Util.fmtNum(b.percentual, 2) + "% (mantido, o automático não altera o BDI)" + (b.aviso ? " — " + b.aviso : " — dentro da faixa do TCU") + (b.avisoDivergencia ? " — " + b.avisoDivergencia : "")) : "");
        LicitacaoAuto.marcar(copia, r, ap.preset.id, es);
        Licitacao.cfg(copia).autoAvisos = (ap.avisos || []).concat(r.avisos || []).concat(b.aviso ? [b.aviso] : []).concat(b.avisoDivergencia ? [b.avisoDivergencia] : []);
        // 5) salvar (a cópia só vira o orçamento aberto se gravar)
        set("salvar", "rodando");
        var gravou = false, excecao = null;
        self.orcAtual = copia;
        try { gravou = self.persistir ? self.persistir({ semBackupModal: true, rotulo: "orçamento automático da licitação" }) : !!Store.salvarOrcamento(Auth.empresaId(), copia); }
        catch (eP) { excecao = eP; gravou = false; }
        if (!gravou) {
          self.orcAtual = orc;
          set("salvar", "erro", excecao ? "a gravação falhou (" + String((excecao && excecao.message) || excecao).slice(0, 120) + ")" : (self._iaPorqueNaoGravou ? self._iaPorqueNaoGravou(false, "o orçamento automático") : "o app recusou gravar"));
          self._licAutoLog("nao-gravou", orc, {});
          fim("O orçamento automático não foi gravado", '<p style="font-size:13px">O orçamento ficou <b>como estava</b>. Nada foi enviado.</p>');
          return;
        }
        set("salvar", "ok", "orçamento salvo; marcado como “não conferido por você”");
        self._licAutoLog("orcamento-automatico", copia, { preset: ap.preset.id, presetDeduzido: es.deduzido === true, origem: opts.origem || "", itens: r.itens, pelaBase: r.pela_base, precoDoOrgaoMantido: r.preco_do_orgao_mantido });
        self.render();
        // 6) devolver
        var lic2 = Licitacao.cfg(copia), d = lic2.devolverPara ? Licitacao.destino(lic2.devolverPara) : null;
        var semDev = function (estado, det, aviso) {
          set("devolver", estado, det);
          fim("Orçamento automático pronto", '<p style="font-size:13px">' + esc(aviso) + '</p>', self._licBotoesVolta(copia));
        };
        /* ⚠ ITEM SEM PREÇO DO ÓRGÃO (R$ 0,01 simbólico) vai para a carta com um preço que ninguém escolheu — o botão
           manual barra isso (Licitacao.itensSimbolicos). O automático SALVA e NÃO devolve. */
        var simb = Licitacao.itensSimbolicos ? Licitacao.itensSimbolicos(copia) : [];
        if (simb.length) {
          self._licAutoLog("devolucao-bloqueada-simbolico", copia, { itens: simb.length });
          semDev("aviso", simb.length + " itens sem preço do órgão — preencha e use Devolver ao CertamePRO", simb.length + " itens sem preço do órgão — preencha e use Devolver ao CertamePRO. O orçamento está salvo e a devolução automática não foi feita. " + Licitacao.textoSimbolicos(simb));
          return;
        }
        /* ⚠ SEM EMPRESA LICITANTE o automático não escolhe por você: o Excel iria em nome de uma empresa que ninguém indicou. Salva e não
           devolve; o botão manual pergunta qual empresa vai. */
        if (!Licitacao.temLicitante(lic2)) {
          self._licAutoLog("devolucao-bloqueada-sem-licitante", copia, {});
          semDev("aviso", "o certame não informou a empresa licitante: não devolvi", "Este certame não informou a empresa licitante. Orçamento salvo; use o botão Devolver ao CertamePRO, que pergunta qual empresa vai.");
          return;
        }
        if (!lic2.devolverPara) { semDev("pulou", "o pacote não traz endereço de devolução", "O orçamento está salvo. Este pacote não tem para onde devolver."); return; }
        if (!d.ok) { semDev("erro", d.erro, "O orçamento está salvo. " + d.erro + " Use o botão “Devolver ao CertamePRO” depois de corrigir."); return; }
        if (!d.confiavel) { semDev("aviso", "destino não reconhecido (" + d.host + "): não envio sozinho", "O orçamento está salvo. O endereço de devolução (" + d.host + ") não é este computador nem o CertamePRO oficial; use o botão “Devolver ao CertamePRO”, que mostra o endereço e pede o seu aval."); return; }
        if (!Auth.podeUsar("exportar")) { semDev("aviso", "exportar é recurso PRO", "O orçamento está salvo. Exportar é recurso PRO; faça upgrade para devolver."); return; }
        set("devolver", "rodando", "gerando o Excel e enviando a " + d.host);
self._licDevolverSilencioso(copia, d).then(function (res) {
          /* HTTP 409: o CertamePRO JÁ TEM orçamento conferido e não gravou nada. Não é erro, não repete, não baixa arquivo. */
          if (res.naoAplicado) {
            self._licAutoLog("devolucao-nao-aplicada", copia, { status: 409, arquivo: res.nome || "" });
            var motNA = res.motivoNaoAplicado || "Não aplicado: o CertamePRO não aceitou este orçamento agora; nada foi gravado lá.";
            set("devolver", "aviso", motNA);
            fim("Orçamento salvo; devolução não aplicada", '<p style="font-size:13px">' + esc(motNA) + '</p>' +
              '<p style="font-size:13px">O orçamento <b>está salvo</b> aqui. Nada foi enviado nem alterado no CertamePRO.</p>', self._licBotoesVolta(copia));
            return;
          }
          self._licAutoLog("devolucao-automatica", copia, { ok: !!res.ok, etapa: res.etapa || "", erro: res.erro || "", arquivo: res.nome || "", valor: res.lido ? res.lido.valor : null });
          if (res.ok) {
            set("devolver", "ok", "enviado: " + res.nome + " — " + self._licTextoFaltaPdf());
            var html = "";
            try { html = res.lido ? self._licHtmlDevolucao(res.nome, res.lido) : '<p style="font-size:13px">O CertamePRO recebeu <b class="mono">' + esc(res.nome) + "</b>.</p>"; } catch (eH) { html = ""; }
            fim("Orçamento automático devolvido ao CertamePRO", html + self._licBlocoFaltaPdf(), self._licBotoesVolta(copia, true));
            return;
          }
          if (res.blob) {
            try { var a = document.createElement("a"); a.href = URL.createObjectURL(res.blob); a.download = res.nome; document.body.appendChild(a); a.click(); document.body.removeChild(a); setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000); } catch (eB) {}
          }
          set("devolver", "erro", res.erro);
          fim("Orçamento salvo, mas não devolvido", '<p style="font-size:13px">' + esc(res.erro) + '</p>' +
            '<p style="font-size:13px">O orçamento <b>está salvo</b>' + (res.blob ? ' e o arquivo <b class="mono">' + esc(res.nome) + '</b> foi baixado' : '') + '. Se o token do certame venceu (vale 12 h), abra o certame de novo no CertamePRO. Quando quiser, use o botão <b>Devolver ao CertamePRO</b> deste orçamento. Nada foi perdido.</p>');
        }).catch(function (eEnv) {
          /* qualquer exceção depois do salvar: o orçamento JÁ está salvo e _licAutoRodando nunca fica preso */
          try { self._licAutoLog("erro-devolucao", copia, { erro: String((eEnv && eEnv.message) || eEnv) }); } catch (eL) {}
          try { set("devolver", "erro", String((eEnv && eEnv.message) || eEnv)); } catch (eS) {}
          fim("Orçamento salvo, mas não devolvido", '<p style="font-size:13px">' + esc("Erro inesperado ao devolver: " + ((eEnv && eEnv.message) || eEnv)) + '</p><p style="font-size:13px">O orçamento <b>está salvo</b>. Use o botão <b>Devolver ao CertamePRO</b> deste orçamento. Nada foi perdido.</p>');
        });
      });
      });
    };
    proximo(corpo);
  };

  /* "Ver itens": liga e desliga o destaque das linhas de baixa confiança */
  App.licAutoVer = function () {
    this._licAutoVer = !this._licAutoVer;
    this.render();
    if (this._licAutoVer) {
      var n = LicitacaoAuto.idsBaixaConfianca(this.orcAtual).length;
      UI.toast(n ? n + " linha(s) destacada(s) em laranja: ficaram com o preço do órgão." : "Nenhum item ficou com o preço do órgão.", n ? "aviso" : "ok");
    }
  };

  App.licAutoConferido = function () {
    var self = this, orc = this.orcAtual;
    if (!orc || !LicitacaoAuto.automatico(orc)) return;
    UI.modal("Marcar como conferido?",
      '<p style="font-size:13px;margin-top:0">Ao marcar, o aviso “Orçamento montado sozinho — não conferido por você” some, e o Excel devolvido depois leva <b>conferido pelo usuário</b> para o CertamePRO. Marque só depois de olhar os itens de baixa confiança.</p>',
      [
        { texto: "Cancelar", classe: "ghost", onClick: function () { UI.fecharModal(); } },
        { texto: "Marcar como conferido", classe: "primary", onClick: function () {
            UI.fecharModal();
            LicitacaoAuto.marcarConferido(orc);
            self._licAutoVer = false;
            var g = self.persistir({ rotulo: "orçamento automático conferido" });
            if (!self._gravou(g)) { var a = LicitacaoAuto.automatico(orc); if (a) { a.conferido_pelo_usuario = false; delete a.conferido_em; } return; }
            self._licAutoLog("conferido", orc, {});
            self.render();
            UI.toast("Marcado como conferido. Ao devolver ao CertamePRO, a marca vai junto.", "ok");
          } }
      ]);
  };
})(typeof window !== "undefined" ? window : this);
