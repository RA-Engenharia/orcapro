/* =====================================================================
 * modela.js — o direito ao OrçaPRO MODELA (o modelador BIM vendido à parte).
 *
 * O plano BIM continua sendo compatibilização + orçamento sobre IFC. A
 * MODELAGEM (paredes, lajes, famílias, instalações, pranchas, render…) é o
 * produto "OrçaPRO Modela", vendido por DISCIPLINA e em pacote.
 *
 * REGRAS DO DONO (Rogério, 09/10/2026), nesta ordem:
 *   1. ?demo=1 (vitrine)                  → tudo liberado.
 *   2. licença VITALÍCIA do OrçaPRO       → Modela completo grátis
 *      (exp = 0 dentro da chave; o servidor também responde `vitalicia`).
 *   3. disciplina comprada e no prazo     → só ela (todas = completo).
 *   4. TESTE de 7 dias do Modela completo, contado do 1º uso do modelador e
 *      ancorado no servidor (por e-mail da licença E por aparelho — trocar
 *      de navegador ou de licença não zera).
 *   5. fora disso                         → o modelador não aparece.
 * Quem abre pelo app da Google Play (origem=play) nunca vê botão de compra.
 *
 * SEM INTERNET: vale o último status do servidor por até GRACE_MS (a mesma
 * carência da licença, js/licenca.js). Passou disso, a compra só volta a
 * valer depois de reconectar; o teste continua contado pelo início guardado.
 *
 * INTERFACE (a frente das abas por disciplina lê isto):
 *   Modela.status()      → { liberado, completo, disciplinas:[ids], motivo,
 *                            teste:{inicio,fim,ativo,encerrado,disponivel,restanteMs,dias},
 *                            vitalicia, demo, play, podeComprar, compradas:{id:ate},
 *                            revalidar }
 *   Modela.tem(id)       → true/false para civil|estrutura|hidraulica|eletrica|metalica|marcenaria
 *   Modela.iniciarTeste() / Modela.atualizar(cb) → falam com o servidor
 *   Modela.calcular(e)   → a regra PURA (os testes usam esta)
 * O js/bimprevia.js é a única porta que os módulos do modelador consultam;
 * ela pergunta aqui.
 * ===================================================================== */
(function (global) {
  "use strict";

  var DIA = 86400000;
  var TESTE_MS = 7 * DIA;
  var GRACE_MS = 7 * DIA;   // igual ao GRACE_MS do js/licenca.js
  var KEY = "orcapro:modela:v1";
  var DISCIPLINAS = [
    { id: "civil", nome: "Civil" },
    { id: "estrutura", nome: "Estrutura" },
    { id: "hidraulica", nome: "Hidráulica" },
    { id: "eletrica", nome: "Elétrica" },
    { id: "metalica", nome: "Metálica" },
    { id: "marcenaria", nome: "Marcenaria" }
  ];
  var IDS = DISCIPLINAS.map(function (d) { return d.id; });

  /* a URL é lida na CARGA (a navegação interna pode limpar o endereço depois) */
  var DEMO_URL = false;
  try { DEMO_URL = /[?&]demo=1\b/.test((global.location && global.location.search) || ""); } catch (e) {}

  function num(x) { x = Number(x); return isFinite(x) ? x : 0; }
  function nomeDe(id) { for (var i = 0; i < DISCIPLINAS.length; i++) if (DISCIPLINAS[i].id === id) return DISCIPLINAS[i].nome; return id; }

  var Modela = {
    DISCIPLINAS: DISCIPLINAS,
    IDS: IDS,
    TESTE_MS: TESTE_MS,
    GRACE_MS: GRACE_MS,
    KEY: KEY,
    nome: nomeDe,

    /* ==================================================================
     * A REGRA, PURA. Entrada:
     *   { agora, demo, play, vitaliciaLocal, chaveRef, testeLocal,
     *     cache: { em, chaveRef, vitalicia, disciplinas:{id:ate}, teste:{inicio} } }
     * ================================================================== */
    calcular: function (e) {
      e = e || {};
      var agora = num(e.agora) || Date.now();
      var c = e.cache || null;
      var chaveRef = String(e.chaveRef || "");
      /* o status do servidor só vale para a MESMA licença que o pediu, e só
         dentro da carência. Relógio voltado para trás não estende nada:
         `em` no futuro conta como velho. */
      var emC = c ? num(c.em) : 0;
      var cacheValido = !!(c && emC > 0 && emC <= agora + 60000 && agora < emC + GRACE_MS &&
        String(c.chaveRef || "") === chaveRef);
      var compradas = {}, lista = [];
      if (cacheValido && c.disciplinas) {
        IDS.forEach(function (id) {
          var ate = num(c.disciplinas[id]);
          if (ate > agora) { compradas[id] = ate; lista.push(id); }
        });
      }
      var vitalicia = !!e.vitaliciaLocal || !!(cacheValido && c.vitalicia === true);

      /* o início do teste: o MAIS ANTIGO entre o local e o do servidor. O do
         servidor vale mesmo com o cache velho — ele só pode encurtar o teste. */
      var ini = 0;
      [num(e.testeLocal), c && c.teste ? num(c.teste.inicio) : 0].forEach(function (x) { if (x > 0 && (!ini || x < ini)) ini = x; });
      var fim = ini ? ini + TESTE_MS : 0;
      var rest = ini ? Math.max(0, fim - agora) : TESTE_MS;
      var teste = {
        inicio: ini, fim: fim,
        disponivel: !ini,
        ativo: !!ini && agora < fim,
        encerrado: !!ini && agora >= fim,
        restanteMs: rest,
        dias: Math.ceil(rest / DIA)
      };

      var demo = !!e.demo, play = !!e.play;
      var out = {
        liberado: false, completo: false, disciplinas: [], motivo: "encerrado",
        teste: teste, vitalicia: vitalicia, demo: demo, play: play,
        podeComprar: !play && !demo, compradas: compradas,
        revalidar: !!(c && !cacheValido && String(c.chaveRef || "") === chaveRef && c.disciplinas &&
          Object.keys(c.disciplinas).some(function (k) { return num(c.disciplinas[k]) > agora; }))
      };
      function tudo(motivo) { out.liberado = true; out.completo = true; out.disciplinas = IDS.slice(); out.motivo = motivo; return out; }

      if (demo) return tudo("demo");
      if (vitalicia) return tudo("vitalicia");
      if (lista.length === IDS.length) return tudo("compra");
      if (teste.ativo) return tudo("teste");
      if (teste.disponivel) return tudo("teste-disponivel");
      if (lista.length) {
        out.liberado = true; out.disciplinas = lista; out.motivo = "compra";
        return out;
      }
      if (out.revalidar) out.motivo = "revalidar";
      return out;
    },

    /* ---------------- o ambiente (navegador) ---------------- */
    _ler: function () { try { return JSON.parse(global.localStorage.getItem(KEY) || "null") || {}; } catch (e) { return {}; } },
    _gravar: function (o) { this._memo = null; try { global.localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} },
    _lic: function () { return (typeof global.Licenca !== "undefined" && global.Licenca) ? global.Licenca : null; },
    _chave: function () { var L = this._lic(); try { return (L && L.chave && L.chave()) || ""; } catch (e) { return ""; } },
    /* só os 16 últimos caracteres: a chave inteira é credencial e não vai para mais um lugar do disco */
    _chaveRef: function () { var k = this._chave(); return k ? k.slice(-16) : ""; },
    _vitaliciaLocal: function () {
      var L = this._lic(); if (!L) return false;
      try {
        var st = L.status(), info = L._lerExpDe(L.chave());
        /* chave verificada pelo servidor (ativo, fora do trial) com exp 0 assinado */
        return !!(st && st.ativo && !st.trial && info && Number(info.exp) === 0);
      } catch (e) { return false; }
    },
    _demo: function () { try { return DEMO_URL || !!(global.App && global.App._demo); } catch (e) { return DEMO_URL; } },
    _play: function () {
      try { if (global.localStorage.getItem("orcapro:origem") === "play") return true; } catch (e) {}
      try { return global.document.documentElement.getAttribute("data-origem") === "play"; } catch (e2) { return false; }
    },
    _entrada: function () {
      var l = this._ler();
      return { agora: Date.now(), demo: this._demo(), play: this._play(), vitaliciaLocal: this._vitaliciaLocal(),
        chaveRef: this._chaveRef(), testeLocal: num(l.testeLocal), cache: l.srv || null };
    },
    /* ~30 módulos do modelador perguntam a cada desenho de tela: 1 s de
       memória poupa ler o disco e decodificar a chave a cada pergunta */
    _memo: null,
    status: function () {
      var t = Date.now(), m = this._memo;
      if (m && t - m.t < 1000 && t >= m.t) return m.s;
      var s = this.calcular(this._entrada());
      this._memo = { t: t, s: s };
      return s;
    },
    /* id de disciplina, ou "completo" (a vista "Todas as disciplinas" do
       seletor, js/bimdisciplinas.js): só com as seis liberadas — senão a fita
       inteira mostraria comando de disciplina não contratada. */
    tem: function (id) {
      var s = this.status(), k = String(id || "").toLowerCase();
      if (!s.liberado) return false;
      if (k === "completo") return IDS.every(function (d) { return s.disciplinas.indexOf(d) >= 0; });
      return s.disciplinas.indexOf(k) >= 0;
    },

    /* ---------------- servidor ---------------- */
    _servidor: function () { return (typeof global.CONFIG !== "undefined" && global.CONFIG && global.CONFIG.licencaServer) ? String(global.CONFIG.licencaServer).replace(/\/$/, "") : ""; },
    _device: function () { var L = this._lic(); try { return (L && L.deviceId && L.deviceId()) || ""; } catch (e) { return ""; } },
    _cab: function (json) {
      var h = {}; if (json) h["Content-Type"] = "application/json";
      var k = this._chave(); if (k) h["x-licenca"] = k;   // header, nunca na URL (não cai em log)
      return h;
    },
    /* grava a resposta do servidor. Devolve true se o direito mudou. */
    _aplicar: function (d) {
      if (!d || d.ok !== true) return false;
      this._memo = null;
      var l = this._ler(), antes = JSON.stringify(this.status());
      var dis = {};
      IDS.forEach(function (id) { var a = d.disciplinas && num(d.disciplinas[id]); if (a > 0) dis[id] = a; });
      l.srv = { em: Date.now(), chaveRef: this._chaveRef(), vitalicia: d.vitalicia === true, disciplinas: dis,
        teste: { inicio: d.teste ? num(d.teste.inicio) : 0 } };
      this._gravar(l);
      var mudou = JSON.stringify(this.status()) !== antes;
      if (mudou) this._avisar();
      return mudou;
    },
    _avisar: function () {
      try {
        if (typeof global.CustomEvent === "function" && global.dispatchEvent) global.dispatchEvent(new global.CustomEvent("orcapro:modela", { detail: this.status() }));
      } catch (e) {}
    },
    atualizar: function (cb) {
      cb = cb || function () {};
      var self = this, srv = this._servidor();
      if (!srv || typeof global.fetch === "undefined") { cb({ ok: false, offline: true }); return; }
      try {
        global.fetch(srv + "/api/modela/status?deviceId=" + encodeURIComponent(this._device()), { headers: this._cab(false), cache: "no-store" })
          .then(function (r) { return r.json(); })
          .then(function (d) {
            var mudou = self._aplicar(d);
            /* o teste começou sem internet: o servidor ainda não sabe. Ancora agora. */
            var l = self._ler();
            if (d && d.ok && !(d.teste && num(d.teste.inicio)) && num(l.testeLocal) > 0) self._ancorar();
            cb({ ok: !!(d && d.ok), mudou: mudou });
          }, function () { cb({ ok: false, offline: true }); });
      } catch (e) { cb({ ok: false, offline: true }); }
    },
    _ancorar: function (cb) {
      cb = cb || function () {};
      var self = this, srv = this._servidor();
      if (!srv || typeof global.fetch === "undefined") { cb({ ok: false, offline: true }); return; }
      try {
        global.fetch(srv + "/api/modela/teste", { method: "POST", headers: this._cab(true), body: JSON.stringify({ deviceId: this._device() }) })
          .then(function (r) { return r.json(); })
          .then(function (d) { self._aplicar(d); cb({ ok: !!(d && d.ok) }); }, function () { cb({ ok: false, offline: true }); });
      } catch (e) { cb({ ok: false, offline: true }); }
    },
    /* o 1º USO do modelador começa o teste — só se ele ainda não começou e se
       a pessoa não tem o direito por outro caminho (vitalícia, compra completa, demo) */
    iniciarTeste: function (cb) {
      var s = this.status();
      if (!s.teste.disponivel || s.demo || s.vitalicia || s.disciplinas.length === IDS.length && s.motivo === "compra") { if (cb) cb({ ok: true, ja: true }); return false; }
      var l = this._ler();
      if (!num(l.testeLocal)) { l.testeLocal = Date.now(); this._gravar(l); this._avisar(); }
      this._ancorar(cb);
      return true;
    },

    /* o endereço da compra na loja. Sem botão em origem=play (política da loja). */
    urlCompra: function (plano) {
      var srv = this._servidor(); if (!srv) return "";
      var p = String(plano || "modela_completo_mensal");
      if (!/^modela_[a-z]+_(mensal|anual)$/.test(p)) p = "modela_completo_mensal";
      var k = this._chave();
      return srv + "/modelagem?plano=" + encodeURIComponent(p) + (k ? "#lic=" + encodeURIComponent(k) : "");
    }
  };

  global.Modela = Modela;
  /* a consulta ao servidor no carregamento: sem esperar ninguém chamar. Falha calada (offline). */
  try {
    if (typeof window !== "undefined" && global.setTimeout) global.setTimeout(function () { try { Modela.atualizar(); } catch (e) {} }, 2500);
  } catch (eT) {}
  if (typeof module !== "undefined" && module.exports) module.exports = Modela;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
