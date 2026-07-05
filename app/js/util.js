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

  // ---- Reparo de encoding (mojibake) ----
  // Conserta texto UTF-8 que foi lido/gravado como Windows-1252.
  // Ex.: "INSTALAÃ‡ÃƒO" -> "INSTALAÇÃO", "TRIFÃSICO" -> "TRIFÁSICO", "NÂº" -> "Nº".
  // É idempotente e seguro: texto já correto passa INTACTO, porque o byte seguinte
  // a um acento válido não é uma continuação UTF-8 (0x80–0xBF), então nada casa.
  var CP1252 = { 0x20AC:0x80,0x201A:0x82,0x0192:0x83,0x201E:0x84,0x2026:0x85,0x2020:0x86,
    0x2021:0x87,0x02C6:0x88,0x2030:0x89,0x0160:0x8A,0x2039:0x8B,0x0152:0x8C,0x017D:0x8E,
    0x2018:0x91,0x2019:0x92,0x201C:0x93,0x201D:0x94,0x2022:0x95,0x2013:0x96,0x2014:0x97,
    0x02DC:0x98,0x2122:0x99,0x0161:0x9A,0x203A:0x9B,0x0153:0x9C,0x017E:0x9E,0x0178:0x9F };
  Util._cp1252Byte = function (cp) {
    if (cp == null || isNaN(cp)) return null;
    if (cp <= 0xFF) return cp;                 // Latin-1 direto
    return (CP1252[cp] != null) ? CP1252[cp] : null; // caractere especial cp1252
  };
  Util.fixEnc = function (s) {
    if (typeof s !== "string" || !s) return s;
    if (s.indexOf("Ã") < 0 && s.indexOf("Â") < 0 && s.indexOf("â") < 0) return s; // rápido
    var out = "", i = 0, n = s.length;
    while (i < n) {
      var b0 = Util._cp1252Byte(s.charCodeAt(i));
      if (b0 != null && b0 >= 0xC2 && b0 <= 0xDF) {            // UTF-8 de 2 bytes (acentos)
        var b1 = Util._cp1252Byte(s.charCodeAt(i + 1));
        if (b1 != null && b1 >= 0x80 && b1 <= 0xBF) {
          out += String.fromCharCode(((b0 & 0x1F) << 6) | (b1 & 0x3F)); i += 2; continue;
        }
      } else if (b0 != null && b0 >= 0xE0 && b0 <= 0xEF) {     // 3 bytes (traços, aspas curvas)
        var c1 = Util._cp1252Byte(s.charCodeAt(i + 1)), c2 = Util._cp1252Byte(s.charCodeAt(i + 2));
        if (c1 != null && c1 >= 0x80 && c1 <= 0xBF && c2 != null && c2 >= 0x80 && c2 <= 0xBF) {
          out += String.fromCharCode(((b0 & 0x0F) << 12) | ((c1 & 0x3F) << 6) | (c2 & 0x3F)); i += 3; continue;
        }
      }
      out += s.charAt(i); i++;
    }
    return out;
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
