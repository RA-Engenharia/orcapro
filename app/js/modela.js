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
 *      (23/10/2026, confirmada 2×) VITALÍCIA = TUDO: as disciplinas, os
 *      módulos à parte (Blocok, Marmoraria) e QUALQUER módulo novo —
 *      `tem(id)` responde true para todo id. A licença interna da RA chega
 *      igual pelo servidor (`tudo: true`). Ninguém oferece compra a ela.
 *      ⚠ A LICENÇA DE EQUIPE de titular vitalício (exp 0 também) NÃO tem
 *      `tudo`: só o Modela completo, como antes de 23/10/2026 (`equipe`).
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
  /* MÓDULOS À PARTE (decisão do Rogério, 14/10/2026: "módulo pago à parte").
     Não entram no "completo" — compra própria, o teste de 7 dias, a vitrine
     (?demo=1) e, desde 23/10/2026, a VITALÍCIA (vitalícia = tudo). O cliente que já tinha o Blocok (licença
     GCon) segue liberado pela trava antiga do js/bim.js (BLOCOK_HASHES). */
  /* MARMORARIA (20/10/2026): bancadas de pedra + executivo + tabela de preços + proposta do marmorista (js/marmmodulo.js).
     Mesma regra do Blocok; a licença interna da RA chega pelo servidor (modela.internos) ou pela trava da máquina. */
  /* PRANCHA VIVA (21/10/2026): a prancha ligada ao 3D (js/pranchavivamodulo.js) — a mesma regra do Blocok e da Marmoraria. */
  var EXTRAS = [{ id: "blocok", nome: "Blocok — paredes prontas" }, { id: "marmoraria", nome: "Marmoraria — bancadas, executivo e orçamento" }, { id: "pranchaviva", nome: "Prancha Viva — a prancha que abre o 3D no ponto tocado" }];
  var IDS_EXTRAS = EXTRAS.map(function (d) { return d.id; });

  /* a URL é lida na CARGA (a navegação interna pode limpar o endereço depois) */
  var DEMO_URL = false;
  try { DEMO_URL = /[?&]demo=1\b/.test((global.location && global.location.search) || ""); } catch (e) {}

  function num(x) { x = Number(x); return isFinite(x) ? x : 0; }
  function nomeDe(id) { for (var i = 0; i < DISCIPLINAS.length; i++) if (DISCIPLINAS[i].id === id) return DISCIPLINAS[i].nome; return id; }

  var Modela = {
    DISCIPLINAS: DISCIPLINAS,
    IDS: IDS,
    EXTRAS: EXTRAS,
    IDS_EXTRAS: IDS_EXTRAS,
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
      var extras = {};
      IDS_EXTRAS.forEach(function (id) { extras[id] = !!(cacheValido && c.disciplinas && num(c.disciplinas[id]) > agora); });
      var vitalicia = !!e.vitaliciaLocal || !!(cacheValido && c.vitalicia === true);
      /* ⚠ LICENÇA DE EQUIPE (a independente que o titular emite, server/licencas-filhas.js): a chave nasce com exp 0
         quando o titular é vitalício, mas o "tudo" é só do titular (decisão do Rogério, 23/10/2026). Ela fica com o
         de antes: o Modela completo pela vitalícia, módulo à parte só comprado. Sabe-se pela ativação
         (Licenca.status().tipoLicenca === "equipe") ou pelo servidor (`filha: true` no /api/modela/status). */
      var equipe = !!e.equipeLocal || !!(cacheValido && c.filha === true);
      /* VITALÍCIA = TUDO (23/10/2026); a licença interna da RA vem do servidor com `tudo` */
      var tudoLic = (vitalicia && !equipe) || !!(cacheValido && c.tudo === true);
      if (tudoLic) IDS_EXTRAS.forEach(function (id) { extras[id] = true; });

      /* o início do teste: o MAIS ANTIGO entre o local e o do servidor. O do
         servidor vale mesmo com o cache velho — ele só pode encurtar o teste. */
      var ini = 0;
      [num(e.testeLocal), c && c.teste ? num(c.teste.inicio) : 0].forEach(function (x) { if (x > 0 && (!ini || x < ini)) ini = x; });
      var fim = ini ? ini + TESTE_MS : 0;
      var rest = ini ? Math.max(0, fim - agora) : TESTE_MS;
      /* TESTE DE 1 HORA POR MÓDULO (js/testemodulo.js, 21/10/2026): para licença PAGA, a hora por disciplina
         SUBSTITUI o teste de 7 dias — o de 7 dias nunca começa (`disponivel` falso). Quem já começou os 7 dias
         mantém até o fim (o `ativo` abaixo não muda). Sem o regime (flag do servidor desligada, demo, teste
         grátis sem chave) `t1` é null e tudo segue como antes. */
      var t1 = e.teste1h && e.teste1h.regime ? e.teste1h : null;
      var teste = {
        inicio: ini, fim: fim,
        disponivel: !ini && !(t1 && t1.substitui),
        ativo: !!ini && agora < fim,
        encerrado: !!ini && agora >= fim,
        restanteMs: rest,
        dias: Math.ceil(rest / DIA)
      };

      var demo = !!e.demo, play = !!e.play;
      IDS_EXTRAS.forEach(function (id) { if (demo || teste.ativo) extras[id] = true; });
      /* o teste de 1 hora: estado "teste" libera; "vencido"/"pausado" fica VISÍVEL (pede a compra), não libera */
      var est1 = t1 ? (t1.estados || {}) : {}, em1 = {}, venc1 = {};
      if (t1) IDS_EXTRAS.forEach(function (id) {
        if (extras[id]) return;
        if (est1[id] === "teste") { extras[id] = true; em1[id] = 1; }
        else if (est1[id] === "vencido" || est1[id] === "pausado") venc1[id] = est1[id];
      });
      var out = {
        liberado: false, completo: false, disciplinas: [], motivo: "encerrado", extras: extras,
        teste: teste, vitalicia: vitalicia, tudo: tudoLic, equipe: equipe, demo: demo, play: play,
        podeComprar: !play && !demo && !tudoLic, compradas: compradas, teste1h: em1, vencidos1h: venc1, visivel1h: false,
        revalidar: !!(c && !cacheValido && String(c.chaveRef || "") === chaveRef && c.disciplinas &&
          Object.keys(c.disciplinas).some(function (k) { return num(c.disciplinas[k]) > agora; }))
      };
      function tudo(motivo) { out.liberado = true; out.completo = true; out.disciplinas = IDS.slice(); out.motivo = motivo; return out; }

      if (demo) return tudo("demo");
      if (vitalicia) return tudo("vitalicia");
      if (tudoLic) return tudo("interno");
      if (lista.length === IDS.length) return tudo("compra");
      if (teste.ativo) return tudo("teste");
      if (teste.disponivel) return tudo("teste-disponivel");
      if (t1) {
        IDS.forEach(function (id) {
          if (compradas[id]) return;
          if (est1[id] === "teste") em1[id] = 1;
          else if (est1[id] === "vencido" || est1[id] === "pausado") venc1[id] = est1[id];
        });
        var lib = IDS.filter(function (id) { return !!compradas[id] || !!em1[id]; });
        out.visivel1h = Object.keys(venc1).length > 0;
        if (lib.length) {
          out.liberado = true; out.disciplinas = lib; out.completo = lib.length === IDS.length;
          out.motivo = IDS.some(function (id) { return !!em1[id]; }) ? "teste-1h" : "compra";
          return out;
        }
        if (out.visivel1h) { out.motivo = "teste-1h-encerrado"; return out; }
      }
      if (lista.length) {
        out.liberado = true; out.disciplinas = lista; out.motivo = "compra";
        return out;
      }
      if (out.revalidar) out.motivo = "revalidar";
      return out;
    },

    /* ---------------- o ambiente (navegador) ---------------- */
    _ler: function () { try { return JSON.parse(global.localStorage.getItem(KEY) || "null") || {}; } catch (e) { return {}; } },
    _gravar: function (o) { this._memo = null; this._memoBase = null; try { global.localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} },
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
    /* a ativação disse que esta chave é licença de EQUIPE (js/licenca.js _aplicarEquipe) */
    _equipeLocal: function () {
      var L = this._lic(); if (!L) return false;
      try { var st = L.status(); return !!(st && st.tipoLicenca === "equipe"); } catch (e) { return false; }
    },
    _demo: function () { try { return DEMO_URL || !!(global.App && global.App._demo); } catch (e) { return DEMO_URL; } },
    _play: function () {
      try { if (global.localStorage.getItem("orcapro:origem") === "play") return true; } catch (e) {}
      try { return global.document.documentElement.getAttribute("data-origem") === "play"; } catch (e2) { return false; }
    },
    _entrada: function (semEstados) {
      var l = this._ler();
      var e = { agora: Date.now(), demo: this._demo(), play: this._play(), vitaliciaLocal: this._vitaliciaLocal(), equipeLocal: this._equipeLocal(),
        chaveRef: this._chaveRef(), testeLocal: num(l.testeLocal), cache: l.srv || null };
      /* o teste de 1 hora por módulo (js/testemodulo.js). `semEstados`: o direito SEM a hora de teste
         (statusBase) — é o que o próprio TesteModulo pergunta para saber o que já é comprado, sem laço */
      var TM = global.TesteModulo;
      try {
        if (TM && TM.regimeInfo) {
          var ri = TM.regimeInfo();
          if (ri && ri.regime) e.teste1h = { regime: true, substitui: ri.substitui !== false, estados: semEstados ? {} : TM.estadosModela() };
        }
      } catch (eT) {}
      return e;
    },
    /* o direito sem a hora de teste (compra, vitalícia, cortesia, demo, os 7 dias já começados) */
    _memoBase: null,
    statusBase: function () {
      var t = Date.now(), m = this._memoBase;
      if (m && t - m.t < 1000 && t >= m.t) return m.s;
      var s = this.calcular(this._entrada(true));
      this._memoBase = { t: t, s: s };
      return s;
    },
    /* a oferta da disciplina/módulo trancado (o js/bimshell.js chama ao escolher uma disciplina trancada) */
    oferta: function (id) {
      var k = String(id || "").toLowerCase(), TM = global.TesteModulo, idT = TM && TM.idDisciplina ? TM.idDisciplina(k) : "";
      try { if (idT && TM.status().regime && global.TesteModuloUI) return TesteModuloUI.oferta(idT); } catch (e) {}
      try { if (global.ModelaUI && ModelaUI.abrirAviso) return ModelaUI.abrirAviso(k); } catch (e2) {}
      return false;
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
      if (s.tudo) return true;   // vitalícia/interna = tudo, inclusive o módulo que ainda não existe nesta lista
      if (IDS_EXTRAS.indexOf(k) >= 0) return !!(s.extras && s.extras[k]);   // módulo à parte: não precisa do Modela liberado
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
      this._memo = null; this._memoBase = null;
      var l = this._ler(), antes = JSON.stringify(this.status());
      var dis = {};
      IDS.concat(IDS_EXTRAS).forEach(function (id) { var a = d.disciplinas && num(d.disciplinas[id]); if (a > 0) dis[id] = a; });
      l.srv = { em: Date.now(), chaveRef: this._chaveRef(), vitalicia: d.vitalicia === true, tudo: d.tudo === true, filha: d.filha === true, disciplinas: dis,
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
      if (!s.teste.disponivel || s.demo || s.vitalicia || s.tudo || s.disciplinas.length === IDS.length && s.motivo === "compra") { if (cb) cb({ ok: true, ja: true }); return false; }
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
  /* ⚠ JANELA DESTACADA NÃO CONSULTA O SERVIDOR NO CARREGAMENTO — a mesma regra
     das guardas `!this._janela` do js/app.js (nuvem, backup, telemetria,
     atualização): a janela principal já consulta, e o status mora no
     localStorage, que as duas janelas dividem. Sem esta guarda, a janela do
     ⧉ (e a do 3D da Simulação 4D) chamava /api/modela/status 2,5 s depois de
     abrir; tools/e2e-janela-destacada.js [3] pegava quando a janela demorava
     mais que ~1,6 s para ficar pronta (3 de 4 rodadas na árvore da 1.2.136,
     0 de 3 na da 1.2.134, com o mesmo modela.js). Mesmo reconhecimento de rota
     do App.iniciar (Janelas.lerRota / lerRotaBim). */
  function ehJanelaDestacada() {
    try {
      var J = global.Janelas, h = (global.location && global.location.hash) || "";
      return !!(J && ((J.lerRota && J.lerRota(h)) || (J.lerRotaBim && J.lerRotaBim(h))));
    } catch (e) { return false; }
  }
  /* a consulta ao servidor no carregamento: sem esperar ninguém chamar. Falha calada (offline). */
  try {
    if (typeof window !== "undefined" && global.setTimeout) global.setTimeout(function () { try { if (ehJanelaDestacada()) return; Modela.atualizar(); } catch (e) {} }, 2500);
  } catch (eT) {}
  if (typeof module !== "undefined" && module.exports) module.exports = Modela;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
