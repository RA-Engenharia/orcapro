/* =====================================================================
 * util.js — Núcleo único de helpers (número BR, moeda, datas, IDs, guards)
 * Sem dependências. Tudo idempotente e à prova de entrada ruim.
 * ===================================================================== */
(function (global) {
  "use strict";

  var Util = {};

  // ---- Números BR ----
  // Aceita "1.234,56", "1234.56", 1234.56, "", null -> número (NaN-safe)
  Util.parseNum = function (v) {
    if (typeof v === "number") return isFinite(v) ? v : 0;
    if (v == null) return 0;
    var s = String(v).trim();
    if (!s) return 0;
    // Remove separador de milhar BR e troca vírgula decimal por ponto
    if (s.indexOf(",") > -1) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
      // só pontos agrupando milhares (ex.: "1.000", "25.000", "1.000.000") -> remove milhar
      s = s.replace(/\./g, "");
    }
    s = s.replace(/[^0-9.\-]/g, "");
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  };

  Util.fmtNum = function (n, casas) {
    casas = (casas == null) ? 2 : casas;
    n = Util.parseNum(n);
    return n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
  };

  Util.fmtMoeda = function (n) {
    n = Util.parseNum(n);
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };

  Util.fmtPct = function (n, casas) {
    casas = (casas == null) ? 2 : casas;
    return Util.fmtNum(n, casas) + "%";
  };

  // ---- Datas ----
  Util.agoraISO = function () { return new Date().toISOString(); };
  Util.fmtData = function (iso) {
    if (!iso) return "—";
    try {
      var d = new Date(iso);
      return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    } catch (e) { return "—"; }
  };

  // ---- IDs ----
  Util.uid = function (prefixo) {
    var r = Math.random().toString(36).slice(2, 8);
    var t = Date.now().toString(36);
    return (prefixo || "id") + "_" + t + r;
  };

  // ---- Clonagem profunda segura ----
  Util.clone = function (obj) {
    try { return JSON.parse(JSON.stringify(obj)); }
    catch (e) { return obj; }
  };

  // ---- Guards ----
  Util.naoVazio = function (v) { return v != null && String(v).trim() !== ""; };
  Util.arr = function (v) { return Array.isArray(v) ? v : []; };
  Util.num = Util.parseNum;

  // ---- Normalização de texto p/ busca (remove acento, caixa baixa) ----
  Util.normalizar = function (s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  };

  // ---- Debounce ----
  Util.debounce = function (fn, ms) {
    var t;
    return function () {
      var ctx = this, args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, ms || 250);
    };
  };

  // ---- Escapar HTML (evita injeção em descrições SINAPI/usuário) ----
  Util.esc = function (s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  };

  // ---- Download de arquivo (export) ----
  Util.baixar = function (nome, conteudo, mime) {
    var blob = new Blob([conteudo], { type: mime || "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = nome;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  };

  global.Util = Util;
})(window);
