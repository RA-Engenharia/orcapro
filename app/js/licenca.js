/* =====================================================================
 * licenca.js — Licenciamento do OrçaPRO (trial + ativação por chave)
 * A licença é ASSINADA NO SERVIDOR (HMAC, segredo só no VPS). O app NÃO
 * guarda segredo nenhum: ele lê e-mail/validade da chave e DELEGA a
 * verificação ao servidor (/api/ativar), que controla a assinatura e a
 * trava de máquina. Por isso a chave não pode ser forjada no cliente.
 * ===================================================================== */
(function (global) {
  "use strict";

  // LOTE 5: teste grátis COMPLETO de 7 dias (salvar/exportar liberados na
  // janela; o início é ancorado NO SERVIDOR por dispositivo — trocar de
  // navegador não zera). Antes: "demonstração" que nunca salvava — ninguém
  // experimentava o entregável antes de pagar. Concorrência dá 7-30 dias.
  var TRIAL_MS = 7 * 24 * 3600 * 1000;
  var GRACE_MS = 7 * 24 * 3600 * 1000; // carência offline: até 7 dias sem reconectar; depois exige revalidação online
  var KEY = "orcapro:licenca";

  function agora() { return new Date().getTime(); }
  function rotuloTempo(ms) {
    if (ms <= 0) return "encerrado";
    var d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000), m = Math.floor((ms % 3600000) / 60000);
    if (d > 0) return d + "d " + h + "h";
    return h > 0 ? (h + "h" + (m < 10 ? "0" : "") + m) : (m + "min");
  }

  var Licenca = {
    _ler: function () { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return null; } },
    _gravar: function (o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} },
    chave: function () { var l = this._ler() || {}; return l.chave || ""; },

    /* ===== v1.1.233 — a identidade da máquina ancora no DISCO =====
       Só no localStorage, limpar os dados do site zerava o deviceId e o
       servidor abria outro trial de 7 dias — infinito, com dois cliques. O
       servidor local (que já serve o app) guarda o id num arquivo: na 1ª vez
       ele ADOTA o id que o navegador já tem (instalação ativada continua
       sendo o mesmo dispositivo); depois, storage limpo é RESTAURADO do
       disco. No PWA (sem servidor local) o fetch falha calado e fica o
       comportamento de sempre — o cerco fecha onde há onde ancorar. */
    /* ⚠ VISOR, VITRINE E PLACA NÃO CRIAM IDENTIDADE. Quem abre o link do QR de uma obra (#rv, #placa) ou a vitrine (?demo=1) não é
       testador nem cliente: criar deviceId, cookie e IndexedDB nele seria gravar no aparelho de um visitante um identificador que a
       política não prevê para esse uso. (Os mesmos três curto-circuitos do App.iniciar.) */
    _modoVisor: function () {
      try {
        if (typeof location === "undefined") return false;
        var q = String(location.search || ""), h = String(location.hash || "");
        if (/[?&]demo=1/.test(q)) return true;
        if (/^#placa=[a-z2-9]{6,16}/.test(h)) return true;
        if (/[?&]t=[a-f0-9]{12,40}/.test(h + q) && /(^|[#&/])rv\b/i.test(h || q)) return true;
      } catch (e) {}
      return false;
    },
    sincronizarDevice: function () {
      try {
        if (this._modoVisor()) return;
        if (typeof fetch === "undefined" || typeof localStorage === "undefined") return;
        var cur = null; try { cur = localStorage.getItem("orcapro:deviceid"); } catch (e) {}
        fetch("/__device" + (cur ? "?seed=" + encodeURIComponent(cur) : ""))
          .then(function (r) { return r.json(); })
          .then(function (j) {
            if (!j || !j.ok || !j.id) return;
            try { if (localStorage.getItem("orcapro:deviceid") !== j.id && !cur) localStorage.setItem("orcapro:deviceid", j.id); } catch (e2) {}
          })["catch"](function () {});
      } catch (e3) {}
      try { this._idbDevSync(); } catch (e4) {}
    },

    /* ===== 03/11/2026 — A IDENTIDADE DO APARELHO EM TRÊS LUGARES =====
       Só no localStorage, qualquer limpeza parcial (cookies, extensão, "limpar
       dados do site" que poupa o resto) gerava outro id e, com ele, outro teste
       de 7 dias. Agora o id vive no localStorage, num cookie e no IndexedDB, e
       cada um restaura os outros. NÃO é identidade de hardware (o navegador não
       dá acesso a isso): quem baixa o programa de novo é pego pelo hash do
       hardware (/__hw, ver server/hwid.js); no celular/PWA este é o melhor sinal.
       ⚠ "nodev" e id vazio NUNCA contam como identidade — o servidor os ignora
         (server/teste-controle-srv.js idValido), senão um aparelho sem
         armazenamento travaria todos os outros. */
    _cookieDev: function () {
      try {
        if (typeof document === "undefined") return "";
        var m = String(document.cookie || "").match(/(?:^|;\s*)orcapro_dev=([\w-]{8,64})/);
        return m ? m[1] : "";
      } catch (e) { return ""; }
    },
    _gravarCookieDev: function (d) {
      try { if (typeof document !== "undefined" && d && d !== "nodev") document.cookie = "orcapro_dev=" + d + "; max-age=315360000; path=/; SameSite=Lax"; } catch (e) {}
    },
    // ID do dispositivo (gerado 1x e guardado) — base da trava anti-compartilhamento
    deviceId: function () {
      var k = "orcapro:deviceid", d = "", lsOk = true;
      if (this._modoVisor()) return "nodev";          // visor/vitrine/placa: nada é criado nem gravado (ver _modoVisor)
      try { d = localStorage.getItem(k) || ""; } catch (e) { lsOk = false; }
      if (!d) d = this._cookieDev();
      if (!d && this._devMem) d = this._devMem;
      if (!d) {
        if (!lsOk) return "nodev";
        d = (global.crypto && crypto.randomUUID) ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2, 12));
        try { localStorage.setItem(k, d); } catch (e2) { return "nodev"; }
        this._devNovo = true;
      } else if (lsOk) {
        try { if (localStorage.getItem(k) !== d) localStorage.setItem(k, d); } catch (e3) {}
      }
      this._gravarCookieDev(d);
      return d;
    },
    /* o terceiro lugar: IndexedDB (sobrevive a "limpar cookies"). Nunca lança. */
    _idbDev: function (cb) {
      try {
        if (typeof indexedDB === "undefined") { cb(""); return; }
        var rq = indexedDB.open("orcapro-ident", 1);
        rq.onupgradeneeded = function () { try { rq.result.createObjectStore("k"); } catch (e) {} };
        rq.onerror = function () { cb(""); };
        rq.onsuccess = function () {
          try {
            var g = rq.result.transaction("k", "readonly").objectStore("k").get("deviceid");
            g.onsuccess = function () { cb(typeof g.result === "string" ? g.result : ""); };
            g.onerror = function () { cb(""); };
          } catch (e) { cb(""); }
        };
      } catch (e2) { cb(""); }
    },
    _idbGravarDev: function (id) {
      try {
        if (typeof indexedDB === "undefined" || !id || id === "nodev") return;
        var rq = indexedDB.open("orcapro-ident", 1);
        rq.onupgradeneeded = function () { try { rq.result.createObjectStore("k"); } catch (e) {} };
        rq.onsuccess = function () { try { rq.result.transaction("k", "readwrite").objectStore("k").put(id, "deviceid"); } catch (e) {} };
      } catch (e2) {}
    },
    _idbDevSync: function () {
      var self = this;
      this._idbDev(function (guardado) {
        try {
          var atual = self.deviceId();
          if (guardado && guardado !== atual) {
            /* o id foi SORTEADO agora (nada no localStorage nem no cookie) e o IndexedDB guarda o de verdade:
               adota o antigo — mas nunca se uma licença já está presa ao id de agora */
            var l = self._ler() || {};
            if ((self._devNovo || atual === "nodev") && !(l.verificado && l.deviceId === atual)) {
              try { localStorage.setItem("orcapro:deviceid", guardado); } catch (e) { self._devMem = guardado; }
              self._gravarCookieDev(guardado); self._devNovo = false;
            } else self._idbGravarDev(atual);
          } else if (!guardado && atual !== "nodev") self._idbGravarDev(atual);
        } catch (e2) {}
      });
    },
    /* sinal FRACO: impressão digital do navegador. Aparelhos iguais no mesmo
       escritório dão a mesma — por isso o servidor só marca "suspeito" no painel
       e NUNCA bloqueia por ela. 16 hex (dois FNV-1a de 32 bits com sementes diferentes). */
    _fnv: function (str, seed) {
      var h = seed >>> 0, i;
      for (i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; }
      return ("00000000" + h.toString(16)).slice(-8);
    },
    _fp: function () {
      try {
        var nv = (typeof navigator !== "undefined") ? navigator : {}, sc = (typeof screen !== "undefined") ? screen : {};
        var txt = [nv.userAgent, nv.language, nv.platform, sc.width + "x" + sc.height + "x" + sc.colorDepth, new Date().getTimezoneOffset(), nv.hardwareConcurrency, nv.deviceMemory].join("|");
        return this._fnv(txt, 2166136261) + this._fnv(txt, 5381);
      } catch (e) { return ""; }
    },
    /* o ID DE HARDWARE, em hash, que o servidor LOCAL calcula (/__hw → server/hwid.js).
       No PWA/celular a rota não existe: volta null e fica o resto. 4 s de teto. */
    _hw: function (cb) {
      var self = this;
      if (this._hwCache !== undefined) { cb(this._hwCache); return; }
      try {
        if (typeof fetch === "undefined") { cb(null); return; }
        var feito = false, fim = function (v) { if (feito) return; feito = true; self._hwCache = v; cb(v); };
        /* até 8 s: o 1º cálculo do ID de hardware (PowerShell/reg) leva ~0,5 s numa máquina boa e bem mais numa ocupada — o veredito
           do teste ESPERA o hash (registrarTeste só pergunta ao servidor depois), senão o 1º contato iria sem a placa */
        var tm = setTimeout(function () { fim(null); }, 8000); if (tm && tm.unref) tm.unref();
        fetch("/__hw").then(function (r) { return r.ok ? r.json() : null; })
          .then(function (j) { fim(j && j.ok ? { hw: j.hw || "", hwm: j.hwm || "" } : null); })["catch"](function () { fim(null); });
      } catch (e) { cb(null); }
    },
    _servidor: function () { return (typeof CONFIG !== "undefined" && CONFIG.licencaServer) ? String(CONFIG.licencaServer).replace(/\/$/, "") : ""; },
    _ehV2: function (chave) { return String(chave || "").indexOf("v2.") === 0; },
    // Lê email/exp do payload da chave (v2 ou v1) SEM verificar assinatura — só p/ exibir/checar validade
    _lerExpDe: function (chave) {
      try {
        var c = String(chave || "").trim(), s;
        if (c.indexOf("v2.") === 0) {
          var parts = c.split("."); if (parts.length !== 3) return null;
          s = parts[1].replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "=";
        } else {
          var i = c.lastIndexOf("-"); if (i < 0) return null;
          s = c.slice(0, i);
        }
        var payload = (typeof atob !== "undefined") ? atob(s) : Buffer.from(s, "base64").toString();
        var seg = payload.split("|");
        return { email: seg[0], exp: parseInt(seg[1], 10) || 0, tier: seg[2] || "" };
      } catch (e) { return null; }
    },
    /* ==================================================================
     * ESCADA DE PLANOS — e por que o tier do SERVIDOR pode subir o da chave.
     *
     * O tier viaja assinado dentro da chave (base|plus|bim). Isso resolve o
     * caso normal, mas trava um caso real: cliente que comprou o Plus e
     * ganhou o BIM numa promoção. Reemitir a chave obrigaria ele a reativar
     * tudo, e queimaria o slot de dispositivo.
     *
     * Então o servidor pode CONCEDER mais do que a chave diz, por um campo
     * no registro de ativação daquela chave (tierOverride). E a regra aqui é
     * de mão única: fica sempre o MAIOR entre o que a chave diz e o que o
     * servidor concedeu. Concessão nunca vira revogação — se o servidor
     * responder algo menor (registro incompleto, resposta velha em cache), o
     * cliente não perde o que pagou.
     * ================================================================== */
    /* ⚠ "modela" NÃO está na escada, e é de propósito. É o OrçaPRO MODELA
       vendido sozinho (09/10/2026: "para quem quer comprar só o BIM; o
       sistema vai liberar SÓ a modelagem") — outro produto, não "um degrau
       acima do base". Por estar fora: chave "modela" sem concessão fica
       "modela" (o _maiorTier devolve o tier desconhecido como veio), e uma
       concessão plus/bim por cima a SOBE para o OrçaPRO (o da escada vence).
       Quem decide o que a licença "modela" abre é `soModela()`, abaixo — e
       todo guarda que liberava por `tier !== "base"` tem de perguntar a ele. */
    TIERS: ["base", "plus", "bim"],
    TIER_MODELA: "modela",
    _maiorTier: function (a, b) {
      var T = this.TIERS;
      var ia = T.indexOf(String(a || "").toLowerCase());
      var ib = T.indexOf(String(b || "").toLowerCase());
      if (ia < 0 && ib < 0) return String(a || b || "");   // tier desconhecido: devolve como veio
      return (ib > ia) ? T[ib] : (ia >= 0 ? T[ia] : T[ib]);
    },
    /* ==================================================================
     * TIPO DE LICENÇA (licenças de equipe) — e por que NÃO é mão única.
     *
     * A restrição da licença independente vem do servidor e tem de valer; o
     * upgrade para o pacote completo (MESMA chave, mesmo banco na nuvem) tem
     * de poder retirá-la. Então:
     *   - resposta COM equipeV (servidor que conhece o contrato) manda, para
     *     restringir ou para liberar;
     *   - resposta SEM equipeV (servidor antigo, cache, recusa temporária)
     *     não muda nada: nem inventa restrição para o cliente padrão, nem
     *     libera a licença independente.
     * Copiar a regra do tier (_maiorTier) aqui travaria o promovido para sempre.
     * ================================================================== */
    _aplicarEquipe: function (l, d) {
      if (!d || Number(d.equipeV) !== 1) return false;
      var t = d.tipoLicenca == null ? "" : String(d.tipoLicenca);
      if (t && t !== "equipe" && t !== "titular") return false;          // tipo que este app não conhece: não decide
      var n = function (x) { x = parseInt(x, 10); return (x >= 0 && x <= 999) ? x : null; };
      var foto = function () { return JSON.stringify([l.tipoLicenca || "", l.usuariosMax, l.equipe || null, l.dispositivosMax || null, l.upgrade || null]); };
      var antes = foto();
      if (t === "equipe") {
        /* usuariosMax: usuários da própria empresa que esta licença independente
           cadastra (o titular libera no servidor). 0 = uso individual, e número
           torto também vira 0: restringir por engano se desfaz na próxima
           abertura com internet; liberar por engano, não */
        l.tipoLicenca = "equipe"; l.usuariosMax = n(d.usuariosMax) || 0; delete l.equipe;
        l.dispositivosMax = n(d.dispositivosMax);
        var up = (d.upgrade && typeof d.upgrade === "object") ? d.upgrade : null;
        l.upgrade = up ? { nome: String(up.nome || ""), valor: Number(up.valor) || 0, periodo: String(up.periodo || "") } : null;
        var zap = String(d.whatsapp || "").replace(/\D/g, "");
        if (zap) l.whatsappRA = zap;
      } else if (t === "titular") {
        var e = d.equipe || {}, mx = n(e.max) || 0, ind = n(e.independentes) || 0;
        l.tipoLicenca = "titular";
        l.equipe = this._equipeDe(e);
        l.usuariosMax = (n(d.usuariosMax) != null) ? n(d.usuariosMax) : Math.max(0, mx - ind);
        delete l.dispositivosMax; delete l.upgrade;
      } else {
        delete l.tipoLicenca; delete l.usuariosMax; delete l.equipe; delete l.dispositivosMax; delete l.upgrade;
      }
      l.equipeEm = agora();
      return antes !== foto();
    },
    /* a equipe do titular como o servidor mandou, num lugar só: três caminhos
       (ativar/revalidar, informarUso e atualizarEquipe) regravam este objeto,
       e um campo esquecido em um deles some na próxima abertura de Usuários */
    _equipeDe: function (e) {
      e = e || {};
      var n = function (x) { x = parseInt(x, 10); return (x >= 0 && x <= 999) ? x : null; };
      var mx = n(e.max) || 0, o = { max: mx, independentes: n(e.independentes) || 0, empresa: n(e.empresa), dispositivos: n(e.dispositivos) || 3 };
      if (n(e.indepMax) != null && n(e.indepMax) < mx) o.indepMax = n(e.indepMax);
      if (n(e.usuariosPorIndependente)) o.usuariosPorIndependente = n(e.usuariosPorIndependente);
      return o;
    },
    /* os campos do tipo de licença que o status() expõe — em TODOS os
       retornos de chave verificada, inclusive carência vencida, para a
       licença independente nunca cair no fluxo do cliente padrão */
    _com: function (o, l) {
      var t = (l && (l.tipoLicenca === "equipe" || l.tipoLicenca === "titular")) ? l.tipoLicenca : "";
      o.tipoLicenca = t;
      o.usuariosMax = t === "equipe" ? (Number(l.usuariosMax) || 0) : ((t === "titular" && typeof l.usuariosMax === "number") ? l.usuariosMax : null);
      o.equipe = t === "titular" ? (l.equipe || null) : null;
      o.dispositivosMax = t === "equipe" ? (l.dispositivosMax || null) : null;
      o.upgrade = t === "equipe" ? (l.upgrade || null) : null;
      o.whatsappRA = (l && l.whatsappRA) || "";
      return o;
    },
    /* ==================================================================
     * RENOVAÇÃO NA MESMA CHAVE. A validade gravada DENTRO da chave é a da
     * compra; o servidor pode estendê-la sem trocar a chave (a conta da nuvem
     * deriva dela, e chave nova seria banco novo). Resposta com renovV
     * (servidor que conhece a regra) grava ou limpa a validade estendida;
     * resposta sem a marca não mexe. O status() usa a maior das duas.
     * ================================================================== */
    _aplicarRenovacao: function (l, d) {
      if (!d || Number(d.renovV) !== 1) return false;
      var antes = Number(l.renovadaAte) || 0, ren = Number(d.expiraRenovada) || 0;
      if (ren > 0) l.renovadaAte = ren; else delete l.renovadaAte;
      return (Number(l.renovadaAte) || 0) !== antes;
    },
    _expEfetiva: function (l, info) {
      var e = (info && info.exp) || 0;
      return (e > 0 && Number(l.renovadaAte) > e) ? Number(l.renovadaAte) : e;
    },
    /* ===== MÓDULOS LIBERADOS POR CHAVE (ex.: o CPLPRO da prefeitura) =====
       O servidor (server/modulos-extras.js) manda `modulos` no /api/ativar. Guardado em `modulosServidor`.
       ⚠ AO CONTRÁRIO DO TIER, ESTE PODE DESCER: o servidor mandou a lista sem o módulo, ele sai (revogar tem de
         funcionar). Campo AUSENTE na resposta = servidor antigo que não conhece o contrato: mantém o último.
       ⚠ Offline, vale o último dentro da MESMA carência da licença (GRACE_MS); passada a carência sem revalidar,
         o módulo some junto com a licença. Nunca é gravado em nuvem: é fato desta licença neste aparelho. */
    _aplicarModulos: function (l, d) {
      if (!d || !Array.isArray(d.modulos)) return false;
      var antes = JSON.stringify(l.modulosServidor || null), novo = [];
      d.modulos.forEach(function (m) { m = String(m || "").trim().toLowerCase(); if (m && novo.indexOf(m) < 0) novo.push(m); });
      l.modulosServidor = novo;
      return JSON.stringify(novo) !== antes;
    },
    modulosExtras: function () {
      try {
        var l = this._ler() || {};
        if (!l.chave || !l.verificado || !Array.isArray(l.modulosServidor) || !l.modulosServidor.length) return [];
        var info = this._lerExpDe(l.chave), expEf = this._expEfetiva(l, info);
        if (expEf && expEf < agora()) return [];                         // licença vencida: o extra vence junto
        if (l.deviceId && l.deviceId !== this.deviceId()) return [];     // outra máquina
        if (!(agora() < (l.validadoEm || 0) + GRACE_MS)) return [];      // carência vencida: só volta revalidando
        if (this._suspensaPorCobranca(l.chave)) return [];
        return l.modulosServidor.slice();
      } catch (e) { return []; }
    },
    _ativarLocal: function (chave, v, verificado) {
      var l = this._ler() || {}, nova = String(chave).trim();
      /* chave NOVA: o que o servidor disse sobre a anterior (tipo de licença,
         vagas, aparelhos) não vale para esta. O tierServidor segue a regra dele. */
      if (l.chave && l.chave !== nova) { delete l.tipoLicenca; delete l.usuariosMax; delete l.equipe; delete l.dispositivosMax; delete l.upgrade; delete l.equipeEm; delete l.usoInformadoEm; delete l.renovadaAte; delete l.modulosServidor; }
      l.chave = nova; l.email = v.email; l.expira = v.expira;
      /* o que o SERVIDOR disse — guardado para o status() poder subir o tier
         da chave. Nunca desce: ver _maiorTier. */
      if (v.tier) l.tierServidor = this._maiorTier(l.tierServidor, v.tier);
      l.ativadoEm = agora(); l.deviceId = this.deviceId();
      l.verificado = !!verificado; if (verificado) l.validadoEm = agora();
      this._aplicarEquipe(l, v);
      this._aplicarRenovacao(l, v);
      this._aplicarModulos(l, v);
      this._gravar(l);
    },
    // Ativação ONLINE obrigatória p/ licenças v2: o servidor assina + trava o dispositivo (sem furo offline).
    ativarOnline: function (chave, cb) {
      var self = this, c = String(chave || "").trim();
      if (!this._ehV2(c)) { cb({ ok: false, erro: "Chave inválida." }); return; }
      var srv = this._servidor();
      if (!srv || typeof fetch === "undefined") { cb({ ok: false, erro: "Ative com a internet ligada — a licença é validada no servidor." }); return; }
      fetch(srv + "/api/ativar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chave: c, deviceId: this.deviceId() }) })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d && d.ok) { self._ativarLocal(c, d, true); cb({ ok: true, email: d.email, expira: d.expira, tier: d.tier || "", tipoLicenca: d.tipoLicenca || "" }); }
          else cb({ ok: false, erro: (d && d.erro) || "Não foi possível ativar." });
        }, function () { cb({ ok: false, erro: "Sem conexão com o servidor de licença. Tente novamente com a internet." }); });
    },
    // Revalida com o servidor: renova a carência e detecta bloqueio/troca de máquina.
    revalidar: function (cb) {
      cb = cb || function () {};
      var self = this, l = this._ler() || {};
      if (!l.chave || !l.verificado) { cb({ ok: true, skip: true }); return; }
      var srv = this._servidor(); if (!srv || typeof fetch === "undefined") { cb({ ok: true, offline: true }); return; }
      fetch(srv + "/api/ativar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chave: l.chave, deviceId: this.deviceId() }) })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d && d.ok) {
            l.validadoEm = agora(); l.email = d.email; l.expira = d.expira;
            // a revalidação é o caminho por onde uma concessão nova CHEGA a
            // quem já estava ativado — sem reativar, sem chave nova
            if (d.tier) l.tierServidor = self._maiorTier(l.tierServidor, d.tier);
            // e é também por aqui que a licença independente chega, e que o upgrade a libera
            var mudou = self._aplicarEquipe(l, d);
            var mudouRen = self._aplicarRenovacao(l, d);   // a renovação chega por aqui, na mesma chave
            var mudouMod = self._aplicarModulos(l, d);     // módulos por chave: chega E sai por aqui (revogar funciona)
            self._gravar(l); cb({ ok: true, tier: l.tierServidor || "", mudouEquipe: mudou, mudouRenovacao: mudouRen, mudouModulos: mudouMod, tipoLicenca: l.tipoLicenca || "" });
          }
          else if (d && d.bloqueado) { try { localStorage.removeItem(KEY); } catch (e) {} cb({ ok: false, bloqueado: true, erro: d.erro }); }
          else {
            /* RECUSA (não bloqueio). A renovação vale nos dois sentidos: servidor
               que conhece a regra (renovV) grava ou limpa; e "vencida" dita pelo
               servidor para uma chave cuja validade ASSINADA já passou limpa a
               renovação guardada aqui (renovação desfeita no servidor, ou
               renovadaAte editado à mão no navegador). O resto fica como sempre:
               a carência cobre recusa temporária. */
            var mudouR = false;
            if (d && Number(d.renovV) === 1) mudouR = self._aplicarRenovacao(l, d);
            else if (d && /expirad/i.test(String(d.erro || "")) && l.renovadaAte) {
              var infoR = self._lerExpDe(l.chave);
              if (infoR && infoR.exp > 0 && infoR.exp < agora()) { delete l.renovadaAte; mudouR = true; }
            }
            if (mudouR) self._gravar(l);
            cb({ ok: true, mudouRenovacao: mudouR });
          }
        }, function () { cb({ ok: true, offline: true }); });
    },
    /* ===== 03/11/2026 — O VEREDITO DO TESTE VEM DO SERVIDOR =====
       Antes: o servidor só devolvia o início por deviceId e nunca recusava nada;
       quem reinstalava e trocava o telefone ganhava 7 dias novos. Agora o
       servidor (server/teste-controle-srv.js) liga telefone, e-mail, aparelho e
       hardware ao MESMO teste e devolve {trialInicio, trialFim, expirado, motivo}.
       O app OBEDECE e guarda o ÚLTIMO veredito (orcapro:testectl): ficar offline
       não devolve teste novo, e servidor fora do ar não trava quem está no prazo
       (sem resposta = vale o último veredito, ou o relógio local de sempre).
       Nada disso toca licença paga: o status() só olha o veredito no ramo do teste. */
    _veredito: function () {
      try { var v = JSON.parse(localStorage.getItem("orcapro:testectl") || "null"); return (v && typeof v === "object") ? v : null; } catch (e) { return null; }
    },
    _gravarVeredito: function (v) { try { localStorage.setItem("orcapro:testectl", JSON.stringify(v)); } catch (e) {} },
    /* true se mudou o que o app sabe. Resposta sem veredito (servidor com defeito, semVeredito) NÃO muda nada. */
    _aplicarVeredito: function (d) {
      if (!d || d.semVeredito || d.pago || d.desligado) return false;
      var encerrado = d.expirado === true && Number(d.trialInicio) > 0;
      if (d.ok !== true && !encerrado) return false;
      var antes = this._veredito(), v = antes || {}, mudou = false;
      if (Number(d.trialInicio) > 0) {
        var ini = Number(d.trialInicio);
        v = { inicio: ini, fim: Number(d.trialFim) > ini ? Number(d.trialFim) : ini + TRIAL_MS, expirado: d.expirado === true, motivo: String(d.motivo || ""),
          confirmado: d.confirmado === true, validado: d.validado !== false, falta: (d.falta && d.falta.length !== undefined) ? d.falta : [],
          precisaConfirmar: d.precisaConfirmar === true, diasUsados: Number(d.diasUsados) || 0, em: agora() };
        /* o relógio antigo (trialServidor) só desce — nunca dá dia a quem já tinha */
        try { var l = this._ler() || {}; if (!l.trialServidor || ini < l.trialServidor) { l.trialServidor = ini; this._gravar(l); } } catch (e) {}
        mudou = !antes || antes.inicio !== v.inicio || antes.fim !== v.fim || antes.expirado !== v.expirado || antes.motivo !== v.motivo ||
          antes.validado !== v.validado || antes.precisaConfirmar !== v.precisaConfirmar;
      } else if (d.precisaConfirmar === true) {
        /* ⚠ O SERVIDOR ALCANÇÁVEL DIZ QUE NÃO HÁ TESTE para este aparelho: o veredito local (inclusive um "encerrado" antigo) é
           APAGADO. Foi o que faltava quando o admin desbloqueia: o servidor passa a pedir confirmação e o app continuava
           preso ao encerrado de antes. Também derruba um veredito forjado à mão no navegador. */
        mudou = !antes || antes.precisaConfirmar !== true || Number(antes.inicio) > 0;
        v = { precisaConfirmar: true, falta: d.falta || ["telefone", "email"], em: agora() };
      }
      else return false;
      this._gravarVeredito(v);
      return mudou;
    },
    _regTeste: function () { try { return JSON.parse(localStorage.getItem("orcapro:trialreg") || "null"); } catch (e) { return null; } },
    _idsTeste: function (cb) {
      var self = this, dev = this.deviceId();
      this._hw(function (h) {
        var o = { ctl: 2, fp: self._fp() };
        if (dev && dev !== "nodev") o.deviceId = dev;
        if (h) { if (h.hw) o.hw = h.hw; if (h.hwm) o.hwm = h.hwm; }
        try { if (typeof CONFIG !== "undefined" && CONFIG.versao) o.v = CONFIG.versao; } catch (e) {}
        cb(o);
      });
    },
    /* POST com teto de 15 s; qualquer falha devolve null (nunca lança, nunca trava) */
    _postTeste: function (rota, corpo, cb) {
      var srv = this._servidor();
      if (!srv || typeof fetch === "undefined") { cb(null); return; }
      var feito = false, tm = null, fim = function (d) { if (feito) return; feito = true; try { clearTimeout(tm); } catch (e) {} cb(d); };
      tm = setTimeout(function () { fim(null); }, 15000); if (tm && tm.unref) tm.unref();
      try {
        fetch(srv + rota, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) })
          .then(function (r) {
            /* servidor ANTIGO (sem o controle do teste): a rota nova responde 404 text/plain — isso é "desligado", não "sem resposta" */
            return r.json().then(function (d) { return d; }, function () { return r && r.status === 404 ? { ok: true, desligado: true } : null; });
          }).then(function (d) { fim(d || null); }, function () { fim(null); });
      } catch (e2) { fim(null); }
    },
    // Ping de teste: ancora o início no servidor e traz o veredito. cb(resposta|null, mudou) — opcional.
    registrarTeste: function (cb) {
      cb = cb || function () {};
      try {
        var self = this;
        if (!this._servidor() || typeof fetch === "undefined") { cb(null, false); return; }
        this._idsTeste(function (o) {
          var reg = self._regTeste() || {}, l = self._ler() || {};
          if (reg.telefone) o.telefone = String(reg.telefone);
          if (reg.email) o.email = String(reg.email);
          if (reg.nome) o.nome = String(reg.nome);
          /* o telefone/e-mail aqui são só DIGITADOS: o servidor os guarda como "não confirmados" e NUNCA liga o aparelho a
             nenhum registro por causa deles (só o código prova) */
          if (l.chave) o.chave = l.chave;
          self._postTeste("/api/teste", o, function (d) {
            var mudou = self._aplicarVeredito(d);
            try { if (d && d.ok) localStorage.setItem("orcapro:teste_pingado", "1"); } catch (e) {}
            cb(d, mudou);
          });
        });
      } catch (e) { cb(null, false); }
    },
    /* quais canais de código existem agora ({email, telefone}); null = servidor não respondeu → só e-mail */
    canaisTeste: function (cb) {
      this._postTeste("/api/teste/canais", { ctl: 2 }, function (d) {
        if (d && d.desligado) { cb({ desligado: true }); return; }       // controle desligado no servidor (ou servidor antigo): fluxo antigo
        cb(d && d.ok && d.canais ? d.canais : null);
      });
    },
    /* o: {canal: "email"|"telefone", destino, nome, telefone, email}. cb(resposta|null). Resposta de "teste encerrado" já vira veredito. */
    pedirCodigoTeste: function (o, cb) {
      var self = this;
      this._idsTeste(function (ids) {
        ids.canal = o.canal === "telefone" ? "telefone" : "email"; ids.destino = o.destino;
        ids.nome = o.nome || ""; ids.telefone = o.telefone || ""; ids.email = o.email || "";
        self._postTeste("/api/teste/codigo", ids, function (d) { try { self._aplicarVeredito(d); } catch (e) {} cb(d); });
      });
    },
    /* o + {codigo}. Confirmado = o servidor já devolve o veredito (teste novo, ou o antigo herdado). */
    confirmarCodigoTeste: function (o, cb) {
      var self = this;
      this._idsTeste(function (ids) {
        ids.canal = o.canal === "telefone" ? "telefone" : "email"; ids.destino = o.destino; ids.codigo = o.codigo;
        ids.nome = o.nome || ""; ids.telefone = o.telefone || ""; ids.email = o.email || ""; ids.ref = o.ref || "";
        self._postTeste("/api/teste/confirmar", ids, function (d) { try { self._aplicarVeredito(d); } catch (e) {} cb(d); });
      });
    },
    /* O TELEFONE se confirma pelo WhatsApp (a pessoa manda "ORCAPRO-123456"; a ponte confere o remetente real).
       Esta consulta pergunta ao servidor se a ponte já confirmou; ele aplica a confirmação ao teste e devolve o veredito.
       o: {destino, codigo, nome, telefone, email, ref}. cb({aguardando}|{vencido}|veredito|null). Nunca confirma sozinho. */
    acompanharTelefoneTeste: function (o, cb) {
      var self = this;
      this._idsTeste(function (ids) {
        ids.canal = "telefone"; ids.destino = o.destino; ids.codigo = o.codigo; ids.ref = o.ref || "";
        ids.nome = o.nome || ""; ids.telefone = o.telefone || ""; ids.email = o.email || "";
        self._postTeste("/api/teste/telefone/estado", ids, function (d) { try { self._aplicarVeredito(d); } catch (e) {} cb(d); });
      });
    },
    /* SERVIDOR SEM O CONTROLE (desligado, ou servidor antigo): volta ao fluxo de antes — 7 dias a partir de agora, sem códigos.
       O servidor antigo, ao responder /api/teste, ainda pode devolver um início mais antigo, que prevalece. */
    iniciarFluxoAntigo: function () {
      var t = agora();
      this._gravarVeredito({ inicio: t, fim: t + TRIAL_MS, expirado: false, motivo: "ok", confirmado: false, validado: true, falta: [], precisaConfirmar: false, diasUsados: 0, em: t, antigo: true });
    },
    /* o teste deste aparelho acabou? (para a tela não prender quem já está encerrado) */
    /* instalação sem teste ainda (falta confirmar telefone e e-mail)? */
    testePendente: function () { try { var s = this.status(); return !!(s && s.trial && s.pendente); } catch (e) { return false; } },
    testeEncerrado: function () { try { var s = this.status(); return !!(s && s.trial && s.expirado); } catch (e) { return false; } },

    /* O titular com cota emite, de dentro do app, uma licença independente
       (server/licencas-filhas.js). A chave INTEIRA volta só nesta resposta: é a
       credencial da nuvem da pessoa, e não é guardada aqui (nem Store, nem
       backup, nem log). */
    emitirIndependente: function (nome, email, usuariosEmpresa, cb) {
      var self = this, srv = this._servidor(), l = this._ler() || {};
      if (!srv || !l.chave || typeof fetch === "undefined") { cb({ ok: false, erro: "Emitir licença independente precisa de internet." }); return; }
      var corpo = { chave: l.chave, nome: nome, email: email };
      if (typeof usuariosEmpresa === "number" && usuariosEmpresa >= 0) corpo.usuariosEmpresa = usuariosEmpresa;
      fetch(srv + "/api/licenca/filha", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d && d.ok) {
            var m = self._ler() || {};
            if (m.tipoLicenca === "titular" && m.equipe) {
              if (typeof d.emitidas === "number") m.equipe.independentes = d.emitidas;
              if (typeof d.max === "number") m.equipe.max = d.max;
              if (typeof d.empresa === "number") m.equipe.empresa = d.empresa;
              if (typeof d.indepMax === "number" && d.indepMax < (m.equipe.max || 0)) m.equipe.indepMax = d.indepMax;
              m.usuariosMax = Math.max(0, (m.equipe.max || 0) - (m.equipe.independentes || 0));
              self._gravar(m);
            }
          }
          cb(d || { ok: false, erro: "Resposta vazia do servidor de licença." });
        }, function () { cb({ ok: false, erro: "Sem conexão com o servidor de licença. Tente de novo com a internet." }); });
    },
    /* O titular informa quantos usuários da empresa existem, para o servidor
       não emitir licença independente além das vagas. Só manda quando o número
       mudou; sem internet, fica para a próxima vez que a tela abrir. */
    informarUso: function (usuariosEmpresa) {
      try {
        var self = this, l = this._ler() || {}, srv = this._servidor();
        if (l.tipoLicenca !== "titular" || !l.chave || !srv || typeof fetch === "undefined") return;
        var n = parseInt(usuariosEmpresa, 10); if (!(n >= 0 && n <= 999)) return;
        if (l.equipe && l.equipe.empresa === n && l.usoInformadoEm) return;
        fetch(srv + "/api/licenca/uso", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chave: l.chave, usuariosEmpresa: n }) })
          .then(function (r) { return r.json(); })
          .then(function (d) {
            if (!d || !d.ok || d.ignorado) return;
            var m = self._ler() || {}; if (m.tipoLicenca !== "titular") return;
            if (d.equipe) m.equipe = self._equipeDe(d.equipe);
            if (typeof d.usuariosMax === "number") m.usuariosMax = d.usuariosMax;
            m.usoInformadoEm = agora(); self._gravar(m);
          })["catch"](function () {});
      } catch (e) {}
    },

    /* Titular: confere a contagem com o servidor NA HORA (sem o atalho do
       informarUso), antes de abrir o formulário de usuário. Uma licença
       independente emitida pela página web não chega sozinha ao app.
       cb(equipe) com a resposta, cb(null) offline ou em erro: aí vale o que
       está gravado, sem travar quem está sem internet. */
    atualizarEquipe: function (usuariosEmpresa, cb) {
      cb = cb || function () {};
      try {
        var self = this, l = this._ler() || {}, srv = this._servidor(), n = parseInt(usuariosEmpresa, 10);
        if (l.tipoLicenca !== "titular" || !l.chave || !srv || typeof fetch === "undefined" || !(n >= 0 && n <= 999)) { cb(null); return; }
        var feito = false, fim = function (x) { if (!feito) { feito = true; cb(x); } };
        setTimeout(function () { fim(null); }, 6000);   // rede lenta não prende o botão
        fetch(srv + "/api/licenca/uso", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chave: l.chave, usuariosEmpresa: n }) })
          .then(function (r) { return r.json(); })
          .then(function (d) {
            if (!d || !d.ok || d.ignorado || !d.equipe) { fim(null); return; }
            var m = self._ler() || {}; if (m.tipoLicenca !== "titular") { fim(null); return; }
            m.equipe = self._equipeDe(d.equipe);
            if (typeof d.usuariosMax === "number") m.usuariosMax = d.usuariosMax;
            m.usoInformadoEm = agora(); self._gravar(m);
            fim(m.equipe);
          }, function () { fim(null); });
      } catch (e) { cb(null); }
    },
    /* a lista das licenças independentes do titular, com a chave MASCARADA */
    listarIndependentes: function (cb) {
      var srv = this._servidor(), l = this._ler() || {};
      if (!srv || !l.chave || typeof fetch === "undefined") { cb({ ok: false, erro: "A lista precisa de internet." }); return; }
      fetch(srv + "/api/licenca/filhas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chave: l.chave }) })
        .then(function (r) { return r.json(); })
        .then(function (d) { cb(d || { ok: false, erro: "Resposta vazia do servidor de licença." }); }, function () { cb({ ok: false, erro: "Sem conexão com o servidor de licença." }); });
    },

    /* SUSPENSÃO POR COBRANÇA. Quem grava a marca é js/cobranca.js, com a
       resposta do servidor (server/vps/cobranca-srv.js decide). Vale só para a
       MESMA chave que a recebeu: trocar de licença não herda a suspensão de
       outra. Ilegível = não suspensa (nunca trava por defeito). */
    _suspensaPorCobranca: function (chave) {
      try {
        var c = JSON.parse(localStorage.getItem("orcapro:cobranca") || "null");
        return !!(c && c.suspensa === true && c.chaveRef && c.chaveRef === String(chave || "").slice(-16));
      } catch (e) { return false; }
    },

    /* O tier da licença VERIFICADA deste aparelho (a chave + a concessão do
       servidor), mesmo vencida — "" sem chave verificada (teste). */
    tierDaLicenca: function () {
      var l = this._ler() || {};
      if (!l.chave || !l.verificado) return "";
      var info = this._lerExpDe(l.chave);
      return String(this._maiorTier((info && info.tier) || "", l.tierServidor || "")).toLowerCase();
    },
    /* A licença deste aparelho é do OrçaPRO Modela SOZINHO? Então o app abre
       só o BIM com o modelador; os outros módulos aparecem trancados com
       "Faz parte do OrçaPRO". Vale também com a chave VENCIDA (o que muda aí
       é só salvar/exportar, pelo App._trialBloqueado) — senão o cliente do
       Modela, ao vencer, cairia no Orçamento como se fosse do plano base.
       Teste de 7 dias (sem chave verificada) não é "só modela": libera tudo. */
    soModela: function () {
      return this.tierDaLicenca() === this.TIER_MODELA;
    },

    status: function () {
      var l = this._ler() || {};
      if (l.chave) {
        var info = this._lerExpDe(l.chave);
        var expEf = this._expEfetiva(l, info);   // a da chave, ou a renovada pelo servidor
        var expirada = !!(expEf && expEf < agora());
        if (l.verificado) {
          // v2: ativada e verificada pelo servidor; respeita validade + dispositivo + carência offline
          if (expirada) return this._com({ ativo: false, trial: false, expirada: true, expira: expEf, email: (l.email || (info && info.email)) }, l);
          if (l.deviceId && l.deviceId !== this.deviceId()) return this._com({ ativo: false, trial: false, outroDispositivo: true }, l);
          var dias = expEf ? Math.ceil((expEf - agora()) / 86400000) : null;
          if (agora() < (l.validadoEm || 0) + GRACE_MS) {
            var stA = this._com({ ativo: true, trial: false, email: l.email, expira: l.expira, diasRestantes: dias,
              /* o maior entre o que a chave carrega e o que o servidor concedeu */
              tier: this._maiorTier((info && info.tier) || "", l.tierServidor || "") }, l);
            /* ⚠ SUSPENSA CONTINUA `ativo: true`, DE PROPÓSITO. `ativo:false` faria
               o podeGestao() trocar a Gestão e o BIM do cliente pela tela de VENDA
               do Plus, e desligaria a nuvem — o cliente acharia que perdeu os
               dados. Suspensa é só "não grava nem exporta", e quem barra é o
               App._trialBloqueado, que olha esta marca. */
            if (this._suspensaPorCobranca(l.chave)) stA.suspensa = true;
            return stA;
          }
          return this._com({ ativo: false, trial: false, revalidar: true, email: l.email, diasRestantes: dias }, l); // carência vencida: reconectar
        }
        // chave presente mas sem ativação verificada pelo servidor -> não concede (cai p/ trial)
      }
      // trial: usa o início ancorado no servidor, se houver
      var ini = l.trialServidor || l.trialInicio;
      var fim = ini ? ini + TRIAL_MS : 0;
      /* O VEREDITO DO SERVIDOR (server/teste-controle-srv.js) MANDA: o início e o fim são os dele (o mais antigo
         entre telefone, e-mail, aparelho e hardware; mais os dias que a RA liberou), e "encerrado" fica
         encerrado enquanto o servidor não disser o contrário — ficar offline não devolve teste. */
      var v = this._veredito(), encerradoPeloServidor = false, motivo = "", validar = false, faltaVal = [];
      if (v && Number(v.inicio) > 0) {
        ini = Number(v.inicio);
        fim = Number(v.fim) > ini ? Number(v.fim) : ini + TRIAL_MS;
        encerradoPeloServidor = v.expirado === true;
        motivo = String(v.motivo || "");
        /* no prazo mas sem os DOIS códigos (telefone e e-mail) confirmados: o app PEDE a validação; o relógio não para nem reinicia */
        validar = v.validado === false;
        faltaVal = v.falta || [];
      } else if ((v && v.precisaConfirmar === true) || !ini) {
        /* ⚠ SEM VEREDITO DE INÍCIO DO SERVIDOR NÃO HÁ TESTE. Antes, status() inventava um relógio local de 7 dias para qualquer
           instalação nova/limpa — era o que a burla `?lic=qualquercoisa` (que pula o cadastro) e o `trialreg` escrito à mão
           aproveitavam. Agora o teste novo só existe com início CONFIRMADO pelo servidor (os dois códigos). Quem já testava
           antes tem a âncora velha (trialServidor/trialInicio) e segue pelo relógio dele até o servidor responder: servidor
           fora do ar não trava quem está no prazo. Servidor ALCANÇÁVEL dizendo "não há teste" (precisaConfirmar) vale mais
           que a âncora velha. */
        return this._com({ ativo: false, trial: true, expirado: false, pendente: true, expira: 0, restanteMs: 0, rotulo: "aguardando confirmação",
          testeMotivo: "confirmar", testeValidar: false, testeFalta: (v && v.falta) || ["telefone", "email"] }, {});
      }
      var rest = fim - agora();
      var vencido = encerradoPeloServidor || rest <= 0;
      return this._com({ ativo: !vencido, trial: true, expira: fim, expirado: vencido, restanteMs: vencido ? 0 : Math.max(0, rest), rotulo: rotuloTempo(vencido ? 0 : rest),
        testeMotivo: motivo, testeValidar: validar && !vencido, testeFalta: faltaVal }, {});
    }
  };

  global.Licenca = Licenca;
  // âncora da identidade no disco — roda no carregamento, sem depender de ninguém chamar
  try { if (typeof window !== "undefined") Licenca.sincronizarDevice(); } catch (eSd) {}
  if (typeof module !== "undefined" && module.exports) { module.exports = Licenca; }
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
