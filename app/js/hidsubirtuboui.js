/* =====================================================================
 * hidsubirtuboui.js — SUBIR / DESCER UM TRECHO DE TUBO na tela (fiação FINA do js/hidsubirtubo.js; 06/11/2026).
 *
 * Pedido do Rogério: "Quando a gente pegar um tubo que está embaixo e achar que está muito baixo, clicar nele, ele subir, e ele subir o
 * restante que precisa subir junto ali."
 *  · Propriedades de um tubo horizontal de qualquer sistema hidro: "Subir / descer trecho" com o campo em cm (5 por padrão) e ▲ ▼;
 *  · botão direito no tubo: "Subir trecho…" / "Descer trecho…" (pergunta quantos cm);
 *  · ANTES de aplicar, a MESMA prévia do Traçar automaticamente (js/hidkitui.js): os tubos do trecho aparecem translúcidos, o cartão diz
 *    o que muda e os avisos; Enter aplica num lote (UM Ctrl+Z desfaz), Esc cancela. Recusa (ponto fixo, laje, viga…) aparece no status.
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(n) { return global[n] || null; }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function status(t) { try { if (global.BimShell && BimShell.status) BimShell.status(t); } catch (e) {} }

  var U = {
    VERSAO: 1, cm: 5, ultimo: null, perguntarCm: null,   // hid:ok o padrão do campo (HidSubirTubo.PADRAO_CM)
    /* só com a prévia hidro — o mesmo critério do menu do Traçar automaticamente */
    _ativo: function () { var P = global.BimPrevia; if (!P || typeof P.hidro !== "function") return true; try { return !!P.hidro(); } catch (e) { return true; } },
    _idDe: function (uid) { return String(uid == null ? "" : uid).replace(/^edit:/, ""); },
    /* o tubo serve? → { c, id } ou null */
    _alvo: function (uid) {
      var K = dep("HidKitUI"), HS = dep("HidSubirTubo"); if (!K || !K._ctx || !HS || !U._ativo()) return null;
      var c = K._ctx(); if (!c) return null;
      var id = U._idDe(uid); return HS.podeSubir(c.estado, id).ok ? { c: c, id: id } : null;
    },
    /* abre a PRÉVIA do movimento (sem gravar nada): devolve o plano, ou null com o motivo no status. sinal: +1 sobe, -1 desce */
    planejar: function (uid, cmv, sinal) {
      var K = dep("HidKitUI"), HS = dep("HidSubirTubo"), a = U._alvo(uid);
      if (!a || !K || !K._planoCorrigir) { status("Subir trecho: selecione um tubo horizontal do hidrossanitário."); return null; }
      var v = Number(String(cmv).replace(",", ".")); if (!isFinite(v) || !(v > 0)) { status("Subir trecho: informe quantos cm (maior que zero)."); return null; }
      var dz = (sinal < 0 ? -1 : 1) * v / 100;   // hid:ok cm → m
      var r = HS.subirTrecho(a.c.estado, a.id, dz, { avaliarFam: a.c.avaliarFam });
      U.ultimo = r;
      if (!r.ok) { status((sinal < 0 ? "Descer" : "Subir") + " trecho: " + r.erro); return null; }
      if (K._plano) K.cancelarTracado();   // uma prévia por vez
      var P = K._planoCorrigir(a.c, { ops: r.ops, textos: [r.mensagem], mudados: r.ids, apagados: [], restam: [] }, (sinal < 0 ? "Descer" : "Subir") + " trecho — " + a.id);
      P.prefixo = "hidsubirtubo";
      arr(r.avisos).forEach(function (t) { P.avisos.push({ texto: t, elementos: r.ids }); });
      K._plano = P; K._planoUids = [];
      K._previa(P.ops); K._cardMostrar(P);
      status("Prévia: " + r.mensagem + ". Enter aplica, Esc cancela; um Ctrl+Z desfaz.");
      return P;
    },
    subir: function (uid, cmv) { return U.planejar(uid, cmv == null ? U.cm : cmv, +1); },
    descer: function (uid, cmv) { return U.planejar(uid, cmv == null ? U.cm : cmv, -1); },
    /* a seção das Propriedades do tubo (js/bimpropsui.js) */
    secaoPaleta: function (ids) {
      if (arr(ids).length !== 1) return null;
      var a = U._alvo(ids[0]); if (!a) return null;
      var id = a.id;
      return { nome: "Subir / descer trecho", params: [
        { id: "hid:subir-cm", rotulo: "Distância", unidade: "cm", tipo: "numero", passo: "1", valor: U.cm, aoMudar: function (v) { if (isFinite(v) && v > 0) U.cm = v; } },
        { id: "hid:subir-ok", rotulo: "Trecho conectado", tipo: "botao", rotuloBotao: "▲ Subir trecho", fn: function () { U.subir(id); } },
        { id: "hid:descer-ok", rotulo: "", tipo: "botao", rotuloBotao: "▼ Descer trecho", fn: function () { U.descer(id); } }] };
    },
    /* pergunta quantos cm (a e2e troca por uma função) */
    _pedir: function (verbo) {
      if (typeof U.perguntarCm === "function") return U.perguntarCm(verbo, U.cm);
      try { return global.prompt ? global.prompt(verbo + " o trecho quantos cm?", String(U.cm)) : null; } catch (e) { return null; }
    },
    /* o botão direito no tubo */
    itensMenu: function (o) {
      o = o || {}; if (!o.uid || !U._alvo(o.uid)) return [];
      var uid = o.uid;
      function pedir(sinal) { var v = U._pedir(sinal < 0 ? "Descer" : "Subir"); if (v == null || v === "") return; var n = Number(String(v).replace(",", ".")); if (isFinite(n) && n > 0) U.cm = n; U.planejar(uid, v, sinal); }
      return [{ id: "hid-subir-trecho", rotulo: "Subir trecho…", fn: function () { pedir(+1); } }, { id: "hid-descer-trecho", rotulo: "Descer trecho…", fn: function () { pedir(-1); } }];
    }
  };
  global.HidSubirTuboUI = U;
  if (typeof module !== "undefined" && module.exports) module.exports = U;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
