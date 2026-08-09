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
    lixeira: '<path d="M4 7h16"/><path d="M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7"/><path d="M6.5 7 7.5 20a1.5 1.5 0 0 0 1.5 1h6a1.5 1.5 0 0 0 1.5-1L17.5 7"/><path d="M10 11v6M14 11v6"/>',

    /* ---- módulo BIM: fita de comandos (v1.1.127) ----
     * Desenhados para serem reconhecíveis a 24 px na fita e a 15 px no
     * botão pequeno — por isso poucos traços e nada de detalhe fino. */
    parede: '<path d="M3 6h18v12H3z"/><path d="M3 10h18M3 14h18"/><path d="M8 6v4M14 10v4M8 14v4"/>',
    laje: '<path d="m3 8 9-4 9 4-9 4z"/><path d="M3 8v3l9 4 9-4V8"/>',
    pilar: '<path d="M8 3h8v18H8z"/><path d="M6 3h12M6 21h12"/>',
    porta: '<path d="M6 21V4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v17"/><path d="M4 21h16"/><circle cx="14" cy="12.5" r="1"/>',
    janela: '<rect x="4" y="5" width="16" height="12" rx="1"/><path d="M12 5v12M4 11h16"/><path d="M3 20h18"/>',
    telhado: '<path d="m2 12 10-7 10 7"/><path d="M5 11v9h14v-9"/><path d="M9 20v-5h6v5"/>',
    niveis: '<path d="M3 6h18M3 12h18M3 18h18"/><circle cx="7" cy="6" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="10" cy="18" r="1.4"/>',
    alvo: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
    planta: '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 10h7V3M14 21v-7h7"/>',
    bloco: '<rect x="3" y="7" width="18" height="10" rx="1"/><path d="M9 7v10M15 7v10"/><path d="M6 10.5v3M12 10.5v3M18 10.5v3"/>',
    regua: '<path d="M3 9.5 9.5 3 21 14.5 14.5 21z"/><path d="m7 8 1.6 1.6M10 11l1.6 1.6M13 14l1.6 1.6"/>',
    ajustes: '<path d="M4 6h6M14 6h6M4 12h10M18 12h2M4 18h4M12 18h8"/><circle cx="12" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/>',
    grade: '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>',
    prancha: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 16h18"/><path d="M14 16v4M7 8h6M7 11h4"/>',
    estrutura: '<path d="M4 20V6l8-3 8 3v14"/><path d="M4 12h16"/><path d="m4 6 8 6 8-6M4 20l8-8 8 8"/>',
    checklist: '<path d="M9 5h11M9 12h11M9 19h11"/><path d="m3 5 1.4 1.4L7 4M3 12l1.4 1.4L7 11M3 19l1.4 1.4L7 18"/>',
    balanca: '<path d="M12 3v18M7 21h10"/><path d="M12 6 4 9l3 5 3-5zM12 6l8 3-3 5-3-5z"/>',
    cebola: '<path d="M3 5h18v14H3z"/><path d="M3 9.7h18M3 14.3h18"/><path d="M9 5v4.7M15 9.7v4.6M9 14.3V19"/>',
    estrela: '<path d="m12 3 2.6 5.6 6 .8-4.4 4.2 1.1 6.1L12 16.8 6.7 19.7l1.1-6.1L3.4 9.4l6-.8z"/>',
    ambiente: '<path d="M4 20V8l8-5 8 5v12z"/><path d="M9 20v-6h6v6"/>',
    azulejo: '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/>',
    medir: '<path d="M2 12 12 2l10 10-10 10z"/><path d="m6 12 1.6 1.6M10 8l1.6 1.6M14 12l1.6 1.6M10 16l1.6 1.6"/>',
    area: '<path d="M4 4h16v16H4z" stroke-dasharray="3 2.5"/><path d="M8 16 16 8"/><path d="M8 12v4h4"/>',
    angulo: '<path d="M4 20h16"/><path d="M4 20 16 4"/><path d="M4 20a9 9 0 0 0 5.2-1.7" stroke-dasharray="2.5 2"/>',
    ima: '<path d="M6 4v8a6 6 0 0 0 12 0V4"/><path d="M6 4h4v8M14 4h4v8"/>',
    nota: '<path d="M4 4h16v11H9l-5 5z"/><path d="M8 8h8M8 11h5"/>',
    camera: '<path d="M4 8h3l2-2.5h6L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.6"/>',
    clash: '<path d="M4 6h9v9H4z"/><path d="M11 11h9v9h-9z"/><path d="M11 11h2v2h-2z" fill="currentColor"/>',
    corte: '<path d="M6 3v18M18 3v18" stroke-dasharray="4 3"/><path d="M3 12h18"/><path d="m9 9-3 3 3 3M15 9l3 3-3 3"/>',
    calendario: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 9.5h18"/><path d="M7 13h3v3H7z" fill="currentColor"/>',
    ciclo: '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 3v5h-5"/><circle cx="12" cy="12" r="2.6"/>',
    grafico: '<path d="M3 3v17a1 1 0 0 0 1 1h17"/><path d="m6 15 4-5 4 3 5-7"/>',
    calculadora: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8v3H8z"/><path d="M8 13h1M12 13h1M16 13h1M8 17h1M12 17h1M16 17h1"/>',
    ia: '<path d="M12 3a4 4 0 0 0-4 4v1a3 3 0 0 0 0 6v1a4 4 0 0 0 8 0v-1a3 3 0 0 0 0-6V7a4 4 0 0 0-4-4z"/><path d="M12 3v18M8 8h8M8 16h8"/>',
    insumo: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12v9M4 7.5l8 4.5 8-4.5"/>',
    casa: '<path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9"/><path d="M10 20v-6h4v6"/>',
    voo: '<path d="m2 12 20-8-8 20-2.5-8z"/><path d="m11.5 16 3.5-8"/>',
    vr: '<rect x="2" y="7" width="20" height="10" rx="3"/><path d="M9 17c1-2 1.4-3 3-3s2 1 3 3"/><circle cx="7.5" cy="11.5" r="1.3"/><circle cx="16.5" cy="11.5" r="1.3"/>',
    olho: '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    paleta: '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.2 0-1 .9-1.8 2-1.8h1.5A4.5 4.5 0 0 0 21 10c0-3.9-4-7-9-7z"/><circle cx="7.5" cy="11" r="1.2" fill="currentColor"/><circle cx="11" cy="7.5" r="1.2" fill="currentColor"/><circle cx="15.5" cy="9" r="1.2" fill="currentColor"/>',
    pincel: '<path d="M4 20s2-1 3.5-2.5C9 16 9 14 9 14l1-1 1 1s-2 0-3.5 1.5S5 19 4 20z"/><path d="m11 13 8-8a2 2 0 0 1 3 3l-8 8"/>',
    link: '<path d="M10 13a4 4 0 0 0 5.7.4l3-3a4 4 0 0 0-5.7-5.7L11.5 6"/><path d="M14 11a4 4 0 0 0-5.7-.4l-3 3a4 4 0 0 0 5.7 5.7L12.5 18"/>',
    pasta: '<path d="M3 6a1 1 0 0 1 1-1h5l2 2.5h9a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>',
    abrir: '<path d="M3 6a1 1 0 0 1 1-1h5l2 2.5h9a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M3 10h18"/>',
    salvar: '<path d="M4 4h12l4 4v12H4z"/><path d="M8 4v5h6V4M8 20v-6h8v6"/>',
    exportar: '<path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/><path d="M12 3v12"/><path d="m8 7 4-4 4 4"/>',
    importar: '<path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/><path d="M12 15V3"/><path d="m8 11 4 4 4-4"/>',
    revit: '<path d="m12 2 9 5v10l-9 5-9-5V7z"/><path d="M12 12v10M3 7l9 5 9-5"/><path d="M7.5 9.5 12 12l4.5-2.5"/>',
    quadrado: '<rect x="4" y="4" width="16" height="16" rx="2"/>',
    tema: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor"/>',
    expandir: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.5 1.5M17.6 17.6l1.5 1.5M19.1 4.9l-1.5 1.5M6.4 17.6l-1.5 1.5"/>',
    avancar: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
    copiar: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M4 16V5a1 1 0 0 1 1-1h11"/>',

    /* ---------------------------------------------------------------
     * v1.1.190 — os que faltavam para aposentar os emoji de interface.
     * Mesmo traço dos demais (24×24, stroke 1.8, cantos redondos), para a
     * barra de botões não ficar com dois desenhos diferentes convivendo.
     * --------------------------------------------------------------- */
    estoque: '<path d="M21 8v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8"/><rect x="2" y="4" width="20" height="4" rx="1"/><path d="M10 12h4"/>',
    celular: '<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M10.5 18.5h3"/>',
    pessoa: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c.6-3.9 3.7-6 7.5-6s6.9 2.1 7.5 6"/>',
    pessoas: '<circle cx="9" cy="8" r="3.2"/><path d="M2.5 20c.5-3.5 3.2-5.4 6.5-5.4s6 1.9 6.5 5.4"/><path d="M16.5 5.2a3.2 3.2 0 0 1 0 5.9"/><path d="M18 14.9c2 .7 3.2 2.5 3.5 5.1"/>',
    capacete: '<path d="M3 16a9 9 0 0 1 18 0"/><path d="M9.5 7.6V5.2a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2.4"/><rect x="2" y="16" width="20" height="3.4" rx="1.2"/>',
    cadeado: '<rect x="4" y="10.5" width="16" height="10.5" rx="2"/><path d="M8 10.5V7.2a4 4 0 0 1 8 0v3.3"/>',
    destravado: '<rect x="4" y="10.5" width="16" height="10.5" rx="2"/><path d="M8 10.5V7.2a4 4 0 0 1 7.4-2.1"/>',
    chave: '<circle cx="8" cy="15" r="4"/><path d="M11 12l8-8"/><path d="M17 6l2 2"/><path d="M14.5 8.5l2 2"/>',
    nuvem: '<path d="M7 18h10a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.2 11.1 3.5 3.5 0 0 0 7 18z"/>',
    microfone: '<rect x="9" y="2.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0"/><path d="M12 18v3.5"/>',
    sino: '<path d="M18 9a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16S18 14 18 9z"/><path d="M13.7 19.5a2 2 0 0 1-3.4 0"/>',
    lampada: '<path d="M9.2 17h5.6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.5.4.8 1 .8 1.6h5.6c0-.6.3-1.2.8-1.6A6 6 0 0 0 12 3z"/>',
    foguete: '<path d="M12 2.5c3 2 5 5.5 5 9.5l-2.5 2.5h-5L7 12c0-4 2-7.5 5-9.5z"/><circle cx="12" cy="10" r="1.8"/><path d="M9.5 17.5C8 19 7.5 21 7.5 21s2-.5 3.5-2"/><path d="M14.5 17.5c1.5 1.5 2 3.5 2 3.5s-2-.5-3.5-2"/>',
    mensagem: '<path d="M20.5 12.5a7.5 7.5 0 0 1-10.9 6.7L4 20.5l1.4-5.4A7.5 7.5 0 1 1 20.5 12.5z"/>',
    megafone: '<path d="M4 10v4a1 1 0 0 0 1 1h2.5L14 19.5v-15L7.5 9H5a1 1 0 0 0-1 1z"/><path d="M17.5 9.5a3.5 3.5 0 0 1 0 5"/>',
    livro: '<path d="M4 4.5A2 2 0 0 1 6 3h13v15.5H6a2 2 0 0 0-2 2z"/><path d="M4 20.5A2 2 0 0 1 6 18.5h13V21H6a2 2 0 0 1-2-2z"/>',
    assinar: '<path d="M3 20.5c3.5 0 3.5-3 7-3s3.5 3 7 3 4-1.5 4-1.5"/><path d="M6.5 14.5 16 5a2.1 2.1 0 0 1 3 3l-9.5 9.5-4 1z"/>',
    caminhar: '<circle cx="13" cy="4.2" r="2"/><path d="M11 21l1.5-6.5L9.5 12V8.2l3.5-1 3 3 2.5 1"/><path d="M9 21l1.5-4"/>',
    quebracabeca: '<path d="M10 3h4v2.6a1.6 1.6 0 1 0 3 1.4H21v4h-2.6a1.6 1.6 0 1 0-1.4 3V21h-4v-2.6a1.6 1.6 0 1 0-3-1.4H3v-4h2.6A1.6 1.6 0 1 0 7 9V6h3z"/>',
    proibido: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
    caminhao: '<rect x="1.5" y="6.5" width="12" height="9" rx="1"/><path d="M13.5 10h4l4 3.5v2h-8z"/><circle cx="6" cy="18" r="2"/><circle cx="17.5" cy="18" r="2"/>',
    reciclar: '<path d="M7 6.5 9.5 2.8l2.5 3.7"/><path d="M9.5 3v7.5"/><path d="M17.5 9.5 21 12l-3.5 2.5"/><path d="M20.5 12H13"/><path d="M6 17.5 3 15l3-2.5"/><path d="M3.5 15H11"/>',
    olhoFechado: '<path d="M3 12s3.5-6 9-6c1.6 0 3 .5 4.2 1.2"/><path d="M20.4 9.4c.4.9.6 1.6.6 2.6 0 0-3.5 6-9 6-1.2 0-2.3-.3-3.3-.7"/><path d="M4 4l16 16"/>'
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
