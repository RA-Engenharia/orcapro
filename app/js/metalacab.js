/* =====================================================================
 * metalacab.js — METÁLICA: ACABAMENTO E COR POR PEÇA (motor PURO, ES5,
 * sem DOM, sem three.js, Node-testável).
 *
 * Pedido do Rogério (27/10/2026): "nos elementos de estrutura metálica, um
 * parâmetro para eu selecionar a cor e o acabamento".
 *
 * O dado fica em `caixa.acab` (no topo da peça, como a `marca`: o
 * metalAjustar das Propriedades não o apaga):
 *   { tipo: "pintura" | "galvanizado" | "duplex" | "bruto" | "inox",
 *     ral: "7016" (código RAL Classic) ou "",
 *     cor: "#293133" (hex; o do RAL ou o digitado em "Outra"),
 *     sistema: "epoxi" | "alquidico" | null (null = herda o do projeto, js/metalorc.js),
 *     brilho: "fosco" | "acetinado" }
 *   - galvanizado: a cor é FIXA (cinza zincado); duplex: a cor é a da pintura;
 *   - inox só quando o aço da peça for inox;
 *   - peça SEM `acab` não muda em nada: vale o do projeto (galvanização /
 *     pintura / grau de preparo de js/metalorc.js e js/metalpintura.js).
 *
 * Op do replay (extensão do BimEdit):  metalAcabamento { ids:[…], acab: {…} | null }
 *   — uma op só para a seleção inteira: um Ctrl+Z desfaz o lote.
 *
 * ⚠ As cores RAL abaixo são o valor de TELA de referência (RAL Classic é
 *   um leque físico de tinta, não de monitor): conferir com o leque na hora
 *   de especificar a tinta. O código RAL vai para a lista, o romaneio e o IFC.
 * Teste: node tools/test-metal-acabamento.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  function txt(v) { return v == null ? "" : String(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }

  var ACABAMENTOS = [
    { id: "pintura", nome: "Pintura" },
    { id: "galvanizado", nome: "Galvanizado a fogo" },
    { id: "duplex", nome: "Galvanizado + pintura (duplex)" },
    { id: "bruto", nome: "Sem proteção (bruto)" },
    { id: "inox", nome: "Inox (escovado/polido)" }
  ];
  var ZINCADO = "#a3a7aa", BRUTO = "#6b7076", INOX = "#c6cacf", RAL_PADRAO = "7035";
  var SISTEMAS = [{ id: "", nome: "Herdar do projeto" }, { id: "epoxi", nome: "Epóxi (fundo + acabamento)" }, { id: "alquidico", nome: "Alquídico (zarcão + esmalte)" }];
  var BRILHOS = [{ id: "fosco", nome: "Fosco" }, { id: "acetinado", nome: "Acetinado" }];
  /* as RAL Classic mais usadas na serralheria e na estrutura metálica */
  var RAL = [
    { ral: "7035", nome: "Cinza claro", hex: "#cbd0cc" }, { ral: "7040", nome: "Cinza janela", hex: "#9da3a6" }, { ral: "7037", nome: "Cinza poeira", hex: "#7d7f7d" },
    { ral: "7011", nome: "Cinza ferro", hex: "#434b4d" }, { ral: "7016", nome: "Cinza antracite", hex: "#293133" }, { ral: "7021", nome: "Cinza preto", hex: "#2f3234" },
    { ral: "7024", nome: "Cinza grafite", hex: "#474a51" }, { ral: "9005", nome: "Preto profundo", hex: "#0e0e10" }, { ral: "9006", nome: "Alumínio branco", hex: "#a5a5a5" },
    { ral: "9007", nome: "Alumínio cinza", hex: "#8f8f8f" }, { ral: "9010", nome: "Branco puro", hex: "#f1ece1" }, { ral: "9003", nome: "Branco sinal", hex: "#f4f4f4" },
    { ral: "9002", nome: "Branco acinzentado", hex: "#d7d5cb" }, { ral: "1015", nome: "Marfim claro", hex: "#e6d2b5" }, { ral: "1021", nome: "Amarelo colza", hex: "#f3da0b" },
    { ral: "2004", nome: "Laranja puro", hex: "#f44611" }, { ral: "3000", nome: "Vermelho fogo", hex: "#af2b1e" }, { ral: "3020", nome: "Vermelho tráfego", hex: "#cc0605" },
    { ral: "5010", nome: "Azul genciana", hex: "#0e294b" }, { ral: "5015", nome: "Azul celeste", hex: "#2271b3" }, { ral: "6005", nome: "Verde musgo", hex: "#2f4538" },
    { ral: "6018", nome: "Verde amarelado", hex: "#57a639" }, { ral: "8017", nome: "Marrom chocolate", hex: "#442f29" }
  ];
  var RAL_POR = {}; RAL.forEach(function (r) { RAL_POR[r.ral] = r; });

  function ehHex(v) { return /^#[0-9a-fA-F]{6}$/.test(txt(v).trim()); }
  function ehInox(aco) { return /inox|aisi\s*3[0-9]{2}|s30[0-9]{3}/i.test(txt(aco)); }
  function tipoValido(t) { for (var i = 0; i < ACABAMENTOS.length; i++) if (ACABAMENTOS[i].id === t) return true; return false; }
  function tipoNome(t) { for (var i = 0; i < ACABAMENTOS.length; i++) if (ACABAMENTOS[i].id === t) return ACABAMENTOS[i].nome; return ""; }

  /* o acabamento normalizado (ou null se inválido). `aco` = o aço da peça (inox só para aço inox) */
  function normalizar(a, aco) {
    if (!a || typeof a !== "object" || !tipoValido(txt(a.tipo))) return null;
    var tipo = txt(a.tipo);
    if (tipo === "inox" && !ehInox(aco)) return null;
    var o = { tipo: tipo, ral: "", cor: "", sistema: null, brilho: "fosco" };
    if (tipo === "pintura" || tipo === "duplex") {
      var ral = txt(a.ral).replace(/^RAL\s*/i, "").trim();
      if (ral && RAL_POR[ral]) { o.ral = ral; o.cor = RAL_POR[ral].hex; }
      else if (ehHex(a.cor)) o.cor = txt(a.cor).trim().toLowerCase();
      else { o.ral = RAL_PADRAO; o.cor = RAL_POR[RAL_PADRAO].hex; }
      o.sistema = a.sistema === "epoxi" || a.sistema === "alquidico" ? a.sistema : null;
      o.brilho = a.brilho === "acetinado" ? "acetinado" : "fosco";
    } else if (tipo === "galvanizado") o.cor = ZINCADO;
    else if (tipo === "inox") o.cor = INOX;
    else o.cor = BRUTO;
    return o;
  }
  /* o texto da cor: "RAL 7016 Cinza antracite", "#aabbcc", "Cinza zincado"… */
  function corRotulo(a) {
    if (!a) return "";
    if (a.tipo === "galvanizado") return "Cinza zincado";
    if (a.tipo === "inox") return "Inox natural";
    if (a.tipo === "bruto") return "Aço natural";
    if (a.ral && RAL_POR[a.ral]) return "RAL " + a.ral + " " + RAL_POR[a.ral].nome;
    return a.cor || "";
  }
  /* o código curto da cor para lista/romaneio: "RAL 7016" (ou o hex, ou o nome do acabamento sem cor) */
  function corCodigo(a) {
    if (!a) return "";
    if (a.tipo === "pintura" || a.tipo === "duplex") return a.ral ? "RAL " + a.ral : txt(a.cor);
    return corRotulo(a);
  }
  function rotulo(a) {
    if (!a) return "";
    return tipoNome(a.tipo) + (a.tipo === "pintura" || a.tipo === "duplex" ? " — " + corRotulo(a) : "");
  }
  /* a identidade do acabamento (assinatura de marca, cache de material) */
  function chave(a) { return a ? [a.tipo, a.ral || a.cor, a.sistema || "", a.brilho].join("/") : ""; }

  /* o material do 3D: { cor: 0xRRGGBB (sRGB), rug, met } */
  function pbr(a) {
    if (!a) return null;
    var cor = parseInt(txt(a.cor).slice(1), 16);
    if (a.tipo === "galvanizado") return { cor: parseInt(ZINCADO.slice(1), 16), rug: 0.58, met: 0.8 };
    if (a.tipo === "inox") return { cor: parseInt(INOX.slice(1), 16), rug: 0.38, met: 1 };
    if (a.tipo === "bruto") return { cor: parseInt(BRUTO.slice(1), 16), rug: 0.7, met: 0.5 };
    return { cor: cor, rug: a.brilho === "acetinado" ? 0.38 : 0.7, met: 0.05 };
  }

  /* O acabamento EFETIVO de uma peça: o próprio, ou o do projeto.
   * proj = { galv: bool, duplex: bool, sistema: "auto"|"epoxi"|"alquidico"|"nenhuma" } (as opções de js/metalorc.js orcar) */
  function efetivo(c, proj) {
    proj = proj || {};
    var a = c && c.acab ? normalizar(c.acab, acoDe(c)) : null;
    if (a) {
      var sis = a.sistema || (proj.sistema && proj.sistema !== "nenhuma" ? proj.sistema : "auto");
      return { tipo: a.tipo, sistema: a.tipo === "pintura" || a.tipo === "duplex" ? sis : "", proprio: true, acab: a };
    }
    var ps = proj.sistema || "auto";
    if (proj.galv) return { tipo: proj.duplex ? "duplex" : "galvanizado", sistema: proj.duplex ? ps : "", proprio: false, acab: null };
    return { tipo: ps === "nenhuma" ? "bruto" : "pintura", sistema: ps === "nenhuma" ? "" : ps, proprio: false, acab: null };
  }
  /* pilar e viga de aço do MODELADOR (a mesma regra do js/metalfab.js): também levam acabamento */
  function ehAcoArq(c) { return !!(c && (c.tipo === "viga" || c.tipo === "pilar") && c.perfil && (c.material === "aco" || /^(I|U|L|tubo-ret|tubo-circ)$/.test(c.perfil.forma))); }
  function ehPecaMetal(c) { return !!(c && ((c.tipo === "metal" && c.metal) || ehAcoArq(c))); }
  function acoDe(c) { return c && c.tipo === "metal" ? (c.metal && c.metal.aco) : (c && c.aco) || "ASTM A572 Gr.50"; }
  function temAcabProprio(estado) { return arr(estado && estado.caixas).some(function (c) { return ehPecaMetal(c) && !!c.acab && !!normalizar(c.acab, acoDe(c)); }); }

  /* ================================================================ OP DO REPLAY */
  var extensao = {
    nome: "metalAcab",
    valida: function (o) {
      if (!o || o.op !== "metalAcabamento") return undefined;
      return Array.isArray(o.ids) && o.ids.length > 0 && (o.acab === null || (!!o.acab && typeof o.acab === "object" && tipoValido(txt(o.acab.tipo))));
    },
    aplicar: function (o, ctx) {
      if (!o || o.op !== "metalAcabamento" || !ctx) return false;
      var feitas = 0;
      o.ids.forEach(function (id) {
        var c = ctx.caixas[id]; if (!ehPecaMetal(c)) return;
        if (o.acab === null) { if (c.acab) { delete c.acab; feitas++; } else feitas++; return; }
        var n = normalizar(o.acab, acoDe(c)); if (!n) return;   /* inox em aço carbono: recusado nessa peça */
        c.acab = n; feitas++;
      });
      return feitas > 0;
    }
  };
  var BE = dep("BimEdit", "./bimedit.js"); if (BE && BE.estender) BE.estender(extensao);

  function opAcabamento(ids, acab) { return { op: "metalAcabamento", ids: arr(ids).map(String), acab: acab === null ? null : acab }; }

  var BimMetalAcab = {
    ACABAMENTOS: ACABAMENTOS, RAL: RAL, SISTEMAS: SISTEMAS, BRILHOS: BRILHOS, ZINCADO: ZINCADO,
    normalizar: normalizar, corRotulo: corRotulo, corCodigo: corCodigo, rotulo: rotulo, tipoNome: tipoNome, chave: chave, pbr: pbr,
    efetivo: efetivo, temAcabProprio: temAcabProprio, ehInox: ehInox, ehPecaMetal: ehPecaMetal, ehAcoArq: ehAcoArq, acoDe: acoDe, opAcabamento: opAcabamento, extensao: extensao
  };
  global.BimMetalAcab = BimMetalAcab;
  if (typeof module !== "undefined" && module.exports) module.exports = BimMetalAcab;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
