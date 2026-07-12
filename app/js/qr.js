/* =====================================================================
 * qr.js — QR de verificação nos impressos (wrapper do qrcode-generator)
 * Gera SVG vetorial (nítido em qualquer impressão) a partir de um texto.
 * Depende de js/vendor/qrcode.min.js (Kazuhiko Arase, MIT) carregado antes.
 * Uso: QR.svg("https://…/portal?u=cliente&obra=ob_1", { tamanhoPx: 96 })
 * ===================================================================== */
(function () {
  "use strict";

  var lib = (typeof qrcode !== "undefined") ? qrcode
    : (typeof window !== "undefined" && window.qrcode) ? window.qrcode : null;

  var QR = {
    // injeta a lib no Node (teste) sem depender de global
    _setLib: function (l) { lib = l; },

    /* SVG do QR. opts: { tamanhoPx (default 96), margemModulos (quiet zone,
     * default 4 — mínimo da spec), correcao ("L"|"M"|"Q"|"H", default "M") }.
     * Devolve "" se o texto for vazio ou a lib não estiver carregada
     * (impresso sai sem QR — nunca quebra o documento). */
    svg: function (texto, opts) {
      if (!texto || !lib) return "";
      opts = opts || {};
      var tam = opts.tamanhoPx || 96;
      var margem = (opts.margemModulos == null) ? 4 : opts.margemModulos;
      var qr;
      try {
        qr = lib(0, opts.correcao || "M"); // 0 = versão automática
        qr.addData(String(texto));
        qr.make();
      } catch (e) { return ""; } // texto grande demais p/ QR → sem QR
      var n = qr.getModuleCount();
      var total = n + margem * 2;
      // um path só com todos os módulos escuros (compacto e printável)
      var d = "";
      for (var y = 0; y < n; y++) {
        for (var x = 0; x < n; x++) {
          if (qr.isDark(y, x)) d += "M" + (x + margem) + " " + (y + margem) + "h1v1h-1z";
        }
      }
      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + total + " " + total + '" width="' + tam + '" height="' + tam + '" shape-rendering="crispEdges" role="img" aria-label="QR code">' +
        '<rect width="' + total + '" height="' + total + '" fill="#fff"/>' +
        '<path d="' + d + '" fill="#000"/></svg>';
    },

    /* Bloco pronto pros impressos: QR + legenda. Devolve "" sem link. */
    blocoImpresso: function (url, legenda) {
      var svg = QR.svg(url, { tamanhoPx: 88 });
      if (!svg) return "";
      return '<div class="qr-verif" style="display:flex;align-items:center;gap:10px;margin-top:14px;padding:10px 12px;border:1px solid #d8e0ea;border-radius:8px;page-break-inside:avoid">' +
        svg +
        '<div style="font-size:10px;color:#5a6b7b;line-height:1.5"><b style="color:#14202e;font-size:11px">Verificação digital</b><br>' +
        (legenda || "Escaneie para acompanhar esta obra no Portal do Cliente.") +
        '<br><span style="word-break:break-all">' + String(url).replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</span></div></div>";
    }
  };

  if (typeof window !== "undefined") window.QR = QR;
  if (typeof module !== "undefined" && module.exports) module.exports = QR;
})();
