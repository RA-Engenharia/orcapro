/* =====================================================================
 * memvigia.js — VIGIA DA MEMÓRIA DA PÁGINA (19/10/2026, 1.2.158).
 *
 * ⚠ ROTEIRO DO DEFEITO. Em 19/10/2026 o Edge derrubou o OrçaPRO do Rogério 17 vezes com "Esta página está com
 * problemas — Out of Memory": a memória do JavaScript da página chegava a 4 GB (o teto do Edge por aba) em ~10–14 min
 * de uso. Os registros de queda do Edge (Crashpad) não dizem QUEM cresceu; uma cópia dos dados dele, parada, fica em
 * ~100 MB; e o Edge não deixa depurar o perfil principal. A 1.2.157 tirou a volta do SDK da nuvem com documento acima
 * de 1 MiB — e a queda continuou (20:06, 12 min depois de atualizar). O que cresce só aparece no USO REAL.
 *
 * Por isso este vigia faz duas coisas, sem mexer em dado nenhum:
 *  1. MEDE a cada INTERVALO_MS: memória usada/limite (performance.memory, do Chromium), a tela (App.view) e o
 *     tamanho das estruturas que já foram suspeitas (cena do BIM, espelho do Store, nuvem, DOM) — e manda para o
 *     servidor LOCAL (/__diag/memoria → <pasta padrão>/diag/memoria-AAAA-MM-DD.jsonl). Nada sai do PC.
 *  2. PROTEGE: passou de FRACAO_RECARREGAR do limite, grava o pendente do BIM, avisa e RECARREGA a página antes de o
 *     Edge derrubá-la (o que se perde é só o estado da tela; a queda perderia o mesmo, sem aviso). Uma vez a cada
 *     JANELA_ANTI_LACO_MS no máximo — se voltar a encher logo depois, só avisa (nunca recarrega em laço).
 * Sem performance.memory (Firefox, Safari) não faz nada.
 * ===================================================================== */
(function (global) {
  "use strict";
  var CHAVE_RECARGA = "orcapro:memvigia:recarga";
  function msgSegura(m) {
    return String(m || "").replace(/[^\s@]+@[^\s@]+/g, "<email>").replace(/[A-Za-z0-9_\-]{20,}/g, "<id>").slice(0, 80);
  }
  var V = {
    INTERVALO_MS: 20000,
    FRACAO_RECARREGAR: 0.45,
    ESPERA_RECARREGAR_MS: 2500,
    SALTO_PERFIL_MB: 400,
    JANELA_ANTI_LACO_MS: 10 * 60 * 1000,
    _t: null, _seq: 0, _recarregando: false, _avisouLaco: false, _inicio: 0, _perfil: null, _ultimoUsado: 0, _perfisEnviados: 0,

    medir: function () {
      var pm = global.performance && global.performance.memory;
      if (!pm || !pm.jsHeapSizeLimit) return null;
      return { usadoMB: Math.round(pm.usedJSHeapSize / 1048576), totalMB: Math.round(pm.totalJSHeapSize / 1048576), limiteMB: Math.round(pm.jsHeapSizeLimit / 1048576) };
    },
    /* contadores BARATOS (nada que percorra a cena ou serialize lista grande) */
    /* ⚠ nuvemUltMsgs (20/10/2026): o `code` sozinho não separa as recusas — o Firestore diz invalid-argument para lista
       dentro de lista E para documento grande demais, e só o texto diz qual. Vão os 80 primeiros caracteres da mensagem
       (a do SDK fala de campo e documento, nunca do valor), com e-mail e identificador longo trocados por marcas — o
       registro é diagnóstico, não pode levar dado de cliente. */
    contadores: function () {
      var c = {}, d = global.document;
      try { c.tela = global.App ? String(global.App.view || "") : ""; } catch (e) {}
      try { if (d) { c.dom = d.getElementsByTagName("*").length; c.canvas = d.getElementsByTagName("canvas").length; c.iframes = d.getElementsByTagName("iframe").length; } } catch (e) {}
      try { var B = global.BIM; if (B) { c.bimOps = B.editarOps ? B.editarOps().length : -1; c.bimModelos = (B.modelos || []).length; } } catch (e) {}
      try { var G = global.Gestao; if (G) { c.bimSel = String(G._bimSel || ""); c.bimElementos = (G._bimElementos || []).length; } } catch (e) {}
      /* a saúde do DESENHO do 3D (23/10/2026, "o 3D some do nada"): perdas de contexto WebGL, quadros com erro e o
         aviso que está na vista — o próximo relato chega com prova (js/bim.js, "O 3D NUNCA FICA PRESO VAZIO") */
      try { var B3 = global.BIM; if (B3 && B3.saude3d) { var s3 = B3.saude3d(); if (s3) { c.bim3dPerdas = s3.perdas; c.bim3dErros = s3.erros; c.bim3dAviso = s3.aviso ? String(s3.aviso.cod || s3.aviso.tipo || "") : ""; } } } catch (e) {}
      try {
        var esp = global.Store && global.Store._d && global.Store._d.esp;
        if (esp) { var n = 0, ch = 0; for (var k in esp) if (Object.prototype.hasOwnProperty.call(esp, k)) { n++; ch += (esp[k] && esp[k].raw) ? esp[k].raw.length : 0; } c.storeChaves = n; c.storeMB = Math.round(ch / 1048576); }
      } catch (e) {}
      try { var N = global.Nuvem; if (N) { c.nuvemLigada = !!N.ligado; c.nuvemFalhas = (N._falhas || []).length; c.nuvemOuvintes = (N._un || []).length; c.nuvemUltFalhas = (N._falhas || []).slice(-4).map(function (f) { return String(f.entidade || "") + ":" + String(f.codigo || "").slice(0, 40) + (typeof f.tam === "number" ? ":" + f.tam : ""); }); c.nuvemUltMsgs = (N._falhas || []).slice(-4).map(function (f) { return msgSegura(f.msg); }); var fe = N._filaEsc || {}, fa = 0; for (var kf in fe) if (Object.prototype.hasOwnProperty.call(fe, kf) && fe[kf]) fa += fe[kf].ativos || 0; c.nuvemNoAr = fa; } } catch (e) {}
      /* ⚠ O QUE ESPERA CONFIRMAÇÃO, DE QUE TAMANHO, HÁ QUANTO TEMPO, E O QUE O SDK DISSE (23/10/2026). Com só o
         nuvemNoAr e as falhas, "o servidor nunca confirma" e "confirma em 2 minutos" pareciam a mesma coisa. A vigia de
         saúde acusa: nuvemPendIdadeS alto (o mais velho sem confirmação), nuvemPendMaior (entidade:tamanho da carga em
         caracteres do JSON) e nuvemSdk (código:mensagem do Firestore — o motivo real quando ele repete calado). */
      try {
        var Nd = global.Nuvem;
        if (Nd && typeof Nd.diag === "function") {
          var dg = Nd.diag() || {};
          c.nuvemPend = dg.pendentes || 0;
          c.nuvemPendIdadeS = dg.idadeS || 0;
          c.nuvemPendMaior = dg.maior ? String(dg.maior.ent || "") + ":" + (+dg.maior.tam || 0) : "";
          c.nuvemSdk = (dg.sdk || []).map(function (x) { return String((x && x.cod) || "").slice(0, 30) + ":" + msgSegura(x && x.msg); });
        }
      } catch (e) {}
      /* FLUIDEZ (25/10/2026): a TROCA DE VISTA do BIM (do clique ao 2º quadro, as últimas 40: js/gestao.js _bimVxMedir),
         as vistas 2D abertas/feitas de antemão, o segundo plano e o TAMANHO DO CACHE — o vigia de saúde
         (RA-Central\scripts\saude-orcapro) acusa a regressão (troca lenta, cache acima do teto) sem ninguém medir à mão */
      try {
        var Gv = global.Gestao, tr = Gv && Gv._bimTrocas && Gv._bimTrocas.resumo ? Gv._bimTrocas.resumo() : null;
        if (tr) { c.vistaTrocaN = tr.n; c.vistaTrocaMed = tr.mediana; c.vistaTrocaMax = tr.maior; c.vistaTrocaUlt = tr.ultimo; }
        if (Gv && typeof Gv._bimCacheTotalB === "number") c.bimcacheMB = Math.round(Gv._bimCacheTotalB / 1048576);
        var P2 = global.Bim2D;
        if (P2 && P2._cache) { c.d2Abertas = Object.keys(P2._cache).length; c.d2Antes = Object.keys(P2._pre || {}).length; if (P2._fila) { c.d2Fundo = P2._fila.feitas; c.d2FundoUltMs = Math.round(P2._fila.ultMs || 0); } }
      } catch (e) {}
      try { if (this._armaz) { c.armazMB = this._armaz.usoMB; if (this._armaz.idbMB != null) c.armazIdbMB = this._armaz.idbMB; } this._lerArmaz(); } catch (e) {}
      try { var A = global.Analitico; if (A) { c.analitico = !!A.carregado; c.analiticoComp = String(A.competencia || ""); } } catch (e) {}
      try { if (global.Carregar && global.Carregar._grupos) c.grupos = Object.keys(global.Carregar._grupos).join(","); } catch (e) {}
      return c;
    },
    /* o armazenamento do site (navigator.storage: IndexedDB + cache do service worker + localStorage), no máximo a cada
       5 min — a resposta é assíncrona e entra na leitura SEGUINTE (os contadores são síncronos) */
    _armaz: null, _armazEm: 0,
    _lerArmaz: function () {
      var nav = global.navigator, self = this, t = this.agora();
      if (!nav || !nav.storage || typeof nav.storage.estimate !== "function" || (this._armazEm && t - this._armazEm < 300000)) return;
      this._armazEm = t;
      try {
        nav.storage.estimate().then(function (e) {
          var d = e && e.usageDetails;
          self._armaz = { usoMB: Math.round(((e && e.usage) || 0) / 1048576), idbMB: d && d.indexedDB != null ? Math.round(d.indexedDB / 1048576) : null };
        })["catch"](function () {});
      } catch (e) {}
    },
    enviar: function (a) {
      try {
        var loc = global.location;
        if (!loc || !/^(localhost|127\.0\.0\.1)$/.test(loc.hostname) || typeof global.fetch !== "function") return;
        global.fetch("/__diag/memoria", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(a), keepalive: true })["catch"](function () {});
      } catch (e) {}
    },
    /* ⚠ O PICO É SÍNCRONO (medido em 19/10/2026 21:19→21:21 no uso real): 506 MB → 2,97 GB em <100 s, sem mudar
       tela, operações nem DOM, e o intervalo de 20 s não rodou nesse meio (a página estava ocupada) — por isso a
       recarga de 6 s não chegou a tempo e a página caiu. O Profiler do navegador (precisa do cabeçalho
       `Document-Policy: js-profiling`, que o server/static.js manda no HTML) amostra a pilha o tempo todo; no
       primeiro tick depois do salto, ele é parado e as funções que mais apareceram vão para o diag/. */
    _iniciarPerfil: function () {
      var P = global.Profiler, self = this;
      if (typeof P !== "function" || this._perfil) return false;
      try {
        this._perfil = new P({ sampleInterval: 50, maxBufferSize: 12000 });
        if (this._perfil.addEventListener) this._perfil.addEventListener("samplebufferfull", function () { var pf = self._perfil; self._perfil = null; try { pf.stop()["catch"](function () {}); } catch (e) {} self._iniciarPerfil(); });
        return true;
      } catch (e) { this._perfil = null; return false; }
    },
    /* resume um rastro do Profiler: as funções no topo da pilha (próprio) e em qualquer ponto dela (total) */
    resumirRastro: function (tr) {
      var fr = (tr && tr.frames) || [], st = (tr && tr.stacks) || [], sa = (tr && tr.samples) || [], rs = (tr && tr.resources) || [];
      var nome = function (i) { var f = fr[i] || {}; var r = f.resourceId != null ? String(rs[f.resourceId] || "").replace(/^.*\/\/[^/]+\//, "").replace(/\?.*$/, "") : ""; return (f.name || "(anônima)") + (r ? " " + r + ":" + (f.line || 0) : ""); };
      var proprio = {}, total = {}, n = 0;
      sa.forEach(function (x) {
        if (x.stackId == null) return; n++;
        var s0 = st[x.stackId]; if (!s0) return;
        var top = nome(s0.frameId); proprio[top] = (proprio[top] || 0) + 1;
        var visto = {}, s1 = s0, g = 0;
        while (s1 && g++ < 200) { var k = nome(s1.frameId); if (!visto[k]) { visto[k] = 1; total[k] = (total[k] || 0) + 1; } s1 = s1.parentId != null ? st[s1.parentId] : null; }
      });
      var topo = function (o) { return Object.keys(o).map(function (k) { return [k, o[k]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 25); };
      return { amostras: n, proprio: topo(proprio), total: topo(total) };
    },
    _mandarPerfil: function (motivo, m) {
      var self = this, pf = this._perfil;
      if (!pf || this._perfisEnviados >= 3) return;
      this._perfil = null; this._perfisEnviados++;
      try {
        pf.stop().then(function (tr) {
          self.enviar({ tipo: "perfil", em: new Date(self.agora()).toISOString(), motivo: motivo, m: m, c: self.contadores(), r: self.resumirRastro(tr), versao: global.CONFIG && global.CONFIG.versao });
          self._iniciarPerfil();
        })["catch"](function () { self._iniciarPerfil(); });
      } catch (e) { this._iniciarPerfil(); }
    },
    _lerRecarga: function () { try { return +(global.sessionStorage.getItem(CHAVE_RECARGA) || 0); } catch (e) { return 0; } },
    _gravarRecarga: function (t) { try { global.sessionStorage.setItem(CHAVE_RECARGA, String(t)); } catch (e) {} },
    agora: function () { return Date.now(); },
    tick: function () {
      var m = this.medir(); if (!m) return null;
      var a = { em: new Date(this.agora()).toISOString(), seq: ++this._seq, segDesdeAbrir: Math.round((this.agora() - this._inicio) / 1000), m: m, c: this.contadores() };
      try { a.versao = global.CONFIG && global.CONFIG.versao; } catch (e) {}
      var fr = m.limiteMB ? m.usadoMB / m.limiteMB : 0, salto = this._ultimoUsado ? m.usadoMB - this._ultimoUsado : 0;
      this._ultimoUsado = m.usadoMB;
      if (salto >= this.SALTO_PERFIL_MB || fr >= this.FRACAO_RECARREGAR) this._mandarPerfil(salto >= this.SALTO_PERFIL_MB ? "salto de " + salto + " MB" : "memória alta", m);
      if (fr >= this.FRACAO_RECARREGAR) a.alerta = this.proteger(m) || "alto";
      this.enviar(a);
      return a;
    },
    /* devolve o que fez: "recarregando" | "so-aviso" | null */
    proteger: function (m) {
      if (this._recarregando) return "recarregando";
      var ult = this._lerRecarga(), t = this.agora();
      var toast = function (msg) { try { if (global.UI && global.UI.toast) global.UI.toast(msg, "aviso", 9000); } catch (e) {} };
      if (ult && t - ult < this.JANELA_ANTI_LACO_MS) {
        if (!this._avisouLaco) { this._avisouLaco = true; toast("A memória desta página está alta de novo (" + m.usadoMB + " MB). Salve o que estiver fazendo e recarregue (F5) quando puder."); }
        return "so-aviso";
      }
      this._recarregando = true;
      this._gravarRecarga(t);
      try { if (global.Gestao && global.Gestao._bimEdFlush) global.Gestao._bimEdFlush(); } catch (e) {}
      toast("A memória desta página chegou a " + m.usadoMB + " MB. O OrçaPRO vai salvar e recarregar em " + Math.round(this.ESPERA_RECARREGAR_MS / 1000) + " s para não cair. Seus dados ficam.");
      var self = this;
      (global.setTimeout || setTimeout)(function () { try { if (global.Gestao && global.Gestao._bimEdFlush) global.Gestao._bimEdFlush(); } catch (e) {} self.recarregar(); }, this.ESPERA_RECARREGAR_MS);
      return "recarregando";
    },
    recarregar: function () { try { global.location.reload(); } catch (e) {} },
    iniciar: function () {
      if (this._t || !this.medir()) return false;
      var self = this; this._inicio = this.agora(); this._iniciarPerfil();
      this._t = (global.setInterval || setInterval)(function () { try { self.tick(); } catch (e) {} }, this.INTERVALO_MS);
      return true;
    }
  };
  global.MemVigia = V;
  if (global.document && global.setTimeout) global.setTimeout(function () { V.iniciar(); }, 5000);
})(typeof window !== "undefined" ? window : this);
