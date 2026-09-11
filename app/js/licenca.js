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
    sincronizarDevice: function () {
      try {
        if (typeof fetch === "undefined" || typeof localStorage === "undefined") return;
        var cur = null; try { cur = localStorage.getItem("orcapro:deviceid"); } catch (e) {}
        fetch("/__device" + (cur ? "?seed=" + encodeURIComponent(cur) : ""))
          .then(function (r) { return r.json(); })
          .then(function (j) {
            if (!j || !j.ok || !j.id) return;
            try { if (localStorage.getItem("orcapro:deviceid") !== j.id && !cur) localStorage.setItem("orcapro:deviceid", j.id); } catch (e2) {}
          })["catch"](function () {});
      } catch (e3) {}
    },

    // ID do dispositivo (gerado 1x e guardado) — base da trava anti-compartilhamento
    deviceId: function () {
      try {
        var k = "orcapro:deviceid", d = localStorage.getItem(k);
        if (!d) { d = (global.crypto && crypto.randomUUID) ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2, 12)); localStorage.setItem(k, d); }
        return d;
      } catch (e) { return "nodev"; }
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
    TIERS: ["base", "plus", "bim"],
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
        l.tipoLicenca = "equipe"; l.usuariosMax = 0; delete l.equipe;
        l.dispositivosMax = n(d.dispositivosMax);
        var up = (d.upgrade && typeof d.upgrade === "object") ? d.upgrade : null;
        l.upgrade = up ? { nome: String(up.nome || ""), valor: Number(up.valor) || 0, periodo: String(up.periodo || "") } : null;
        var zap = String(d.whatsapp || "").replace(/\D/g, "");
        if (zap) l.whatsappRA = zap;
      } else if (t === "titular") {
        var e = d.equipe || {}, mx = n(e.max) || 0, ind = n(e.independentes) || 0;
        l.tipoLicenca = "titular";
        l.equipe = { max: mx, independentes: ind, empresa: n(e.empresa), dispositivos: n(e.dispositivos) || 3 };
        l.usuariosMax = (n(d.usuariosMax) != null) ? n(d.usuariosMax) : Math.max(0, mx - ind);
        delete l.dispositivosMax; delete l.upgrade;
      } else {
        delete l.tipoLicenca; delete l.usuariosMax; delete l.equipe; delete l.dispositivosMax; delete l.upgrade;
      }
      l.equipeEm = agora();
      return antes !== foto();
    },
    /* os campos do tipo de licença que o status() expõe — em TODOS os
       retornos de chave verificada, inclusive carência vencida, para a
       licença independente nunca cair no fluxo do cliente padrão */
    _com: function (o, l) {
      var t = (l && (l.tipoLicenca === "equipe" || l.tipoLicenca === "titular")) ? l.tipoLicenca : "";
      o.tipoLicenca = t;
      o.usuariosMax = t === "equipe" ? 0 : ((t === "titular" && typeof l.usuariosMax === "number") ? l.usuariosMax : null);
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
    _ativarLocal: function (chave, v, verificado) {
      var l = this._ler() || {}, nova = String(chave).trim();
      /* chave NOVA: o que o servidor disse sobre a anterior (tipo de licença,
         vagas, aparelhos) não vale para esta. O tierServidor segue a regra dele. */
      if (l.chave && l.chave !== nova) { delete l.tipoLicenca; delete l.usuariosMax; delete l.equipe; delete l.dispositivosMax; delete l.upgrade; delete l.equipeEm; delete l.usoInformadoEm; delete l.renovadaAte; }
      l.chave = nova; l.email = v.email; l.expira = v.expira;
      /* o que o SERVIDOR disse — guardado para o status() poder subir o tier
         da chave. Nunca desce: ver _maiorTier. */
      if (v.tier) l.tierServidor = this._maiorTier(l.tierServidor, v.tier);
      l.ativadoEm = agora(); l.deviceId = this.deviceId();
      l.verificado = !!verificado; if (verificado) l.validadoEm = agora();
      this._aplicarEquipe(l, v);
      this._aplicarRenovacao(l, v);
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
            self._gravar(l); cb({ ok: true, tier: l.tierServidor || "", mudouEquipe: mudou, mudouRenovacao: mudouRen, tipoLicenca: l.tipoLicenca || "" });
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
    // Ping de teste + ancora o início do trial no servidor (por dispositivo)
    registrarTeste: function () {
      try {
        var self = this, srv = this._servidor(); if (!srv || typeof fetch === "undefined") return;
        fetch(srv + "/api/teste", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceId: this.deviceId() }) })
          .then(function (r) { return r.json(); })
          .then(function (d) {
            try {
              if (d && d.trialInicio) { var l = self._ler() || {}; if (!l.trialServidor || d.trialInicio < l.trialServidor) { l.trialServidor = d.trialInicio; self._gravar(l); } }
              localStorage.setItem("orcapro:teste_pingado", "1");
            } catch (e) {}
          }).catch(function () {});
      } catch (e) {}
    },

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
            if (d.equipe) m.equipe = { max: Number(d.equipe.max) || 0, independentes: Number(d.equipe.independentes) || 0, empresa: Number(d.equipe.empresa) || 0, dispositivos: Number(d.equipe.dispositivos) || 3 };
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
            m.equipe = { max: Number(d.equipe.max) || 0, independentes: Number(d.equipe.independentes) || 0, empresa: Number(d.equipe.empresa) || 0, dispositivos: Number(d.equipe.dispositivos) || 3 };
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
      if (!ini) { ini = agora(); l.trialInicio = ini; this._gravar(l); }
      var fim = ini + TRIAL_MS;
      var rest = fim - agora();
      return this._com({ ativo: rest > 0, trial: true, expira: fim, expirado: rest <= 0, restanteMs: Math.max(0, rest), rotulo: rotuloTempo(rest) }, {});
    }
  };

  global.Licenca = Licenca;
  // âncora da identidade no disco — roda no carregamento, sem depender de ninguém chamar
  try { if (typeof window !== "undefined") Licenca.sincronizarDevice(); } catch (eSd) {}
  if (typeof module !== "undefined" && module.exports) { module.exports = Licenca; }
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
