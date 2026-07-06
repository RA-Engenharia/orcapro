/* =====================================================================
 * util.js — Núcleo único de helpers (número BR, moeda, datas, IDs, guards)
 * Sem dependências. Tudo idempotente e à prova de entrada ruim.
 * ===================================================================== */
(function (global) {
  "use strict";

  var Util = {};

  // ---- Números BR/US com detecção de formato (LOTE 2) ----
  // Aceita "1.234,56" (BR), "1,234.56" (US), "1234.56", 1234.56, "", null.
  // Regra: com os DOIS separadores, o ÚLTIMO é o decimal — mata o bug de
  // importar CSV americano com preço 1000× errado. NaN-safe, regressão em
  // tools/test-num.js (escrita ANTES desta mudança).
  Util.parseNum = function (v) {
    if (typeof v === "number") return isFinite(v) ? v : 0;
    if (v == null) return 0;
    var s = String(v).trim();
    if (!s) return 0;
    s = s.replace(/[^0-9.,\-]/g, ""); // tira moeda/espaço, preserva separadores
    if (!s) return 0;
    var temV = s.indexOf(",") > -1, temP = s.indexOf(".") > -1;
    if (temV && temP) {
      // BR "1.234,56" ou US "1,234.56": o último separador é o decimal
      if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
      else s = s.replace(/,/g, "");
    } else if (temV) {
      // só vírgulas: 1 = decimal BR ("1,5"); 2+ = milhar US ("1,234,567")
      s = (s.match(/,/g) || []).length > 1 ? s.replace(/,/g, "") : s.replace(",", ".");
    } else if (temP && (s.match(/\./g) || []).length > 1) {
      if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ""); // milhar puro "1.000.000"
      else { // malformado "1.234.56": melhor esforço — último ponto vira o decimal
        var iP = s.lastIndexOf(".");
        s = s.slice(0, iP).replace(/\./g, "") + "." + s.slice(iP + 1);
      }
    } else if (temP && /^-?\d{1,3}(\.\d{3})+$/.test(s)) {
      s = s.replace(/\./g, ""); // "1.000", "25.000"
    }
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  };

  // ---- SHA-256 puro (LOTE 3: hash de senha local) ----
  // Sem WebCrypto de propósito: crypto.subtle não existe em http://file://
  // (o app roda em servidor local sem TLS). Validado por vetores oficiais
  // em tools/test-lote3.js.
  Util.sha256hex = function (msg) {
    function rrot(x, n) { return (x >>> n) | (x << (32 - n)); }
    var K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var i, t, bytes = [];
    msg = unescape(encodeURIComponent(String(msg))); // UTF-8
    for (i = 0; i < msg.length; i++) bytes.push(msg.charCodeAt(i) & 0xff);
    var bitLen = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    var hi = Math.floor(bitLen / 0x100000000), lo = bitLen >>> 0;
    bytes.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255, (lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);
    var w = new Array(64);
    for (var p = 0; p < bytes.length; p += 64) {
      for (t = 0; t < 16; t++) w[t] = (bytes[p + 4 * t] << 24) | (bytes[p + 4 * t + 1] << 16) | (bytes[p + 4 * t + 2] << 8) | (bytes[p + 4 * t + 3]);
      for (t = 16; t < 64; t++) {
        var s0 = rrot(w[t - 15], 7) ^ rrot(w[t - 15], 18) ^ (w[t - 15] >>> 3);
        var s1 = rrot(w[t - 2], 17) ^ rrot(w[t - 2], 19) ^ (w[t - 2] >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h2 = H[7];
      for (t = 0; t < 64; t++) {
        var S1 = rrot(e, 6) ^ rrot(e, 11) ^ rrot(e, 25);
        var ch = (e & f) ^ (~e & g);
        var t1 = (h2 + S1 + ch + K[t] + w[t]) | 0;
        var S0 = rrot(a, 2) ^ rrot(a, 13) ^ rrot(a, 22);
        var mj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + mj) | 0;
        h2 = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h2) | 0;
    }
    var out = "";
    for (i = 0; i < 8; i++) out += ("00000000" + (H[i] >>> 0).toString(16)).slice(-8);
    return out;
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
