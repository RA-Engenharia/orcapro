/* =====================================================================
 * icones.js — Registry central de ícones SVG do OrçaPRO (sem emoji).
 * Monoline (estilo Lucide), viewBox 24, stroke currentColor: herdam a cor
 * do texto e ficam nítidos em qualquer resolução (vetor, não glifo).
 * Uso: Icones.get("cronograma")  → string <svg> inline p/ concatenar em HTML.
 *      Icones.get("obra", 16)    → tamanho custom.
 * Carrega ANTES de ui.js/gestao.js (ver index.html).
 * ===================================================================== */
(function (global) {
  "use strict";

  var P = {
    /* ---- editor de orçamento: abas ---- */
    planilha: '<path d="M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 9h18M3 15h18M9 3v18"/>',
    sintetico: '<path d="m12 2 9 4.8-9 4.8-9-4.8z"/><path d="m3 12 9 4.8 9-4.8"/><path d="m3 16.8 9 4.8 9-4.8"/>',
    cronograma: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 9.5h18"/><path d="M8 14h3M13 14h3M8 17.5h3"/>',
    execucao: '<path d="M4 21h16"/><path d="M6 21V10l6-6 6 6v11"/><path d="M10 21v-5a2 2 0 0 1 4 0v5"/>',
    paredecebola: '<path d="M3 5h18v14H3z"/><path d="M3 9.7h18M3 14.3h18"/><path d="M9 5v4.7M15 9.7v4.6M9 14.3V19"/>',
    graficos: '<path d="M3 3v17a1 1 0 0 0 1 1h17"/><path d="M8 16v-5M13 16V8M18 16v-3"/>',
    relatorios: '<path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z"/><path d="M14 2v5h5"/><path d="M9 12h6M9 16h6"/>',
    bdi: '<path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h6M14 18h6"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="12" cy="18" r="2"/>',

    /* ---- editor de orçamento: toolbar ---- */
    escopo: '<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.2 2.2M16.2 16.2l2.2 2.2M18.4 5.6l-2.2 2.2M7.8 16.2l-2.2 2.2"/><circle cx="12" cy="12" r="3.2"/>',
    relatorio: '<path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z"/><path d="M14 2v5h5"/><path d="M9 12h6M9 15.5h6M9 8.5h2"/>',
    proposta: '<path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z"/><path d="M14 2v5h5"/><path d="m9 14 2 2 4-4.5"/>',
    apresentar: '<rect x="3" y="4" width="18" height="12.5" rx="1.6"/><path d="M12 16.5V20M8.5 20h7"/><path d="m9.5 8 4 2.2-4 2.2z"/>',
    laudo: '<path d="M15 3H9a1 1 0 0 0-1 1v1.5h8V4a1 1 0 0 0-1-1z"/><path d="M16 4.5h2a2 2 0 0 1 2 2V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h6"/>',
    dados: '<circle cx="12" cy="12" r="3.1"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.98 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.98a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9A1.7 1.7 0 0 0 10.03 3.09V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9c.23.63.83 1.05 1.51 1.06H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z"/>',
    parametros: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.4"/><circle cx="9" cy="17" r="2.4"/>',
    cenarios: '<path d="M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3"/><path d="M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3"/><path d="M12 6v12M9 9l3-3 3 3M9 15l3 3 3-3"/>',
    excel: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M12 3v18"/><path d="m6.5 11.2 3 3.6M9.5 11.2l-3 3.6"/>',
    reimportar: '<path d="M12 3v10"/><path d="m8 9 4 4 4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
    voltar: '<path d="m11 5-7 7 7 7"/><path d="M4 12h16"/>',

    /* ---- painel / dashboard ---- */
    obra: '<path d="M4 21h16"/><path d="M6 21V8l6-5 6 5v13"/><path d="M9.5 21v-4h5v4"/><path d="M9.5 10.5h1.6M12.9 10.5h1.6M9.5 13.8h1.6M12.9 13.8h1.6"/>',
    periodo: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 9.5h18"/><circle cx="12" cy="15" r="2.4"/><path d="M12 13.6v1.4l1 .8"/>',
    fluxo: '<path d="M3 3v17a1 1 0 0 0 1 1h17"/><path d="m6.5 14.5 4-4.5 3.5 3 4.5-6"/><circle cx="18.5" cy="7" r="1.3"/>',
    prevreal: '<path d="M3 3v17a1 1 0 0 0 1 1h17"/><path d="M7 20v-8M11 20V6M15 20v-5M19 20V9"/>',
    categorias: '<path d="M21 12A9 9 0 1 1 12 3v9z"/><path d="M21 8.2A9.03 9.03 0 0 0 15.8 3L14.5 9.5z"/>',
    custoobra: '<path d="M3 21h18"/><path d="M5 21V7l7-4v18M19 21V11l-7-4"/><path d="M8.5 9.5h.01M8.5 13h.01M8.5 16.5h.01M15.5 13.5h.01M15.5 17h.01"/>',
    alerta: '<path d="M10.3 3.9 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4.5M12 17.2h.01"/>',
    relogio: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 1.8"/>',
    medicao: '<path d="m3 17 14-14 4 4L7 21l-4-4z"/><path d="m7.5 12.5 1.8 1.8M10.5 9.5l1.8 1.8M13.5 6.5l1.8 1.8"/>',
    dinheiro: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5h.01M18 14.5h.01"/>',

    /* ---- genéricos úteis ---- */
    buscar: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    check: '<path d="m4.5 12.5 5 5 10-11"/>',
    fechar: '<path d="M6 6l12 12M18 6 6 18"/>',
    mais: '<path d="M12 5v14M5 12h14"/>',
    baixar: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 19v1a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1"/>',
    imprimir: '<path d="M7 8V3h10v5"/><rect x="3" y="8" width="18" height="9" rx="2"/><path d="M7 14h10v7H7z"/>',
    tabela: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/>',
    camadas: '<path d="m12 2 9 4.8-9 4.8-9-4.8z"/><path d="m3 12 9 4.8 9-4.8"/>',
    editar: '<path d="M17 3.5a2.1 2.1 0 0 1 3 3L8.5 18l-4.5 1.5L5.5 15z"/><path d="m15 5.5 3 3"/>',
    lixeira: '<path d="M4 7h16"/><path d="M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7"/><path d="M6.5 7 7.5 20a1.5 1.5 0 0 0 1.5 1h6a1.5 1.5 0 0 0 1.5-1L17.5 7"/><path d="M10 11v6M14 11v6"/>'
  };

  var Icones = {
    /* HTML do ícone; size default 15 (inline com texto de botão/aba). */
    get: function (nome, size, extraStyle) {
      var d = P[nome];
      if (!d) return "";
      var s = size || 15;
      return '<svg class="ic-svg" viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-2.5px;margin-right:6px;flex:0 0 auto' + (extraStyle ? ";" + extraStyle : "") + '">' + d + "</svg>";
    },
    /* Variante sem margem (ícone sozinho, ex.: botão-ícone). */
    solo: function (nome, size) {
      return this.get(nome, size, "margin-right:0");
    },
    tem: function (nome) { return !!P[nome]; }
  };

  global.Icones = Icones;
})(typeof window !== "undefined" ? window : this);
