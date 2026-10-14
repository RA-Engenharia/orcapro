/* =====================================================================
 * unidades.js — UNIDADES DE MEDIDA (motor puro, ES5). 14/10/2026.
 *
 * Pedido do Rogério: o usuário digita a grandeza na unidade que ele usa
 * ("2 tf", "2000 kgf", "1,5 tf·m", "300 kgf/m²") e o sistema converte para a
 * unidade do cálculo; no memorial, uma aba mostra os valores em kgf / tf,
 * porque muito leitor de memorial não domina o kN.
 *
 * REGRA DE OURO: o cálculo continua 100 % em kN, kN·m, kN/m, kN/m², kN/m³ e
 * MPa. Este arquivo só converte na ENTRADA (campo) e na LEITURA (memorial);
 * nenhum motor js/aco*.js muda de unidade.
 *
 * BASE DA CONVERSÃO (exata, convenção do quilograma-força):
 *   g = 9,80665 m/s² (gravidade padrão) → 1 kgf = 9,80665 N
 *   1 tf = 1000 kgf = 9,80665 kN
 *   1 kN/m² = 1 kPa = 101,97 kgf/m²      1 MPa = 10,197 kgf/cm²
 *
 * API (global.Unidades / module.exports):
 *   GRANDEZAS                       → tabela: interna, unidades {nome: fator
 *                                     para a interna}, seletor (o que a tela
 *                                     oferece), técnicas (kgf, tf).
 *   ler(texto, grandeza, padrao)    → { ok, valor (na interna), unidade,
 *                                     numero, aviso, motivo }. Aceita "2 tf",
 *                                     "2000 kgf", "2.000 kg" (= kgf, COM aviso),
 *                                     "19,61 kN", "19610 N", "1,5 tf·m",
 *                                     "300 kgf/m²"; vírgula ou ponto decimal.
 *                                     Sem unidade no texto vale a `padrao`
 *                                     (ou a interna). Unidade de outra
 *                                     grandeza é RECUSADA ("2 tf·m" num campo
 *                                     de força), nunca convertida calada.
 *   valor(texto, grandeza, padrao)  → número na interna ou null.
 *   converter(v, grandeza, de, para)
 *   lerNumero(texto)                → número (padrão BR: "1.234,56") ou NaN.
 *   numeroBR(v, casas, op)          → "1.234,56" (op.menos: "−" ou "-").
 *   formatar(v, grandeza, unidade, op) → "2,00 tf" (v na interna).
 *   tecnica(v, grandeza)            → a unidade técnica natural para v
 *                                     (kgf abaixo de 1000 kgf, tf acima).
 *   formatarDuplo(v, grandeza)      → "19,61 kN (2,00 tf)".
 *   unidadeDe(texto)                → { grandeza, unidade, fator, aviso } do
 *                                     símbolo (aliases: "kn", "t", "kgf.m"…).
 *   NOTA_BASE                       → o texto da base, para memorial e tela.
 * ===================================================================== */
(function (global) {
  "use strict";
  var G = 9.80665;                       /* m/s² — gravidade padrão (CGPM 1901) */
  var KGF = G / 1000;                    /* 1 kgf em kN */

  /* fator = quanto vale 1 <unidade> na unidade interna da grandeza */
  var GRANDEZAS = {
    forca: { nome: "força", interna: "kN",
      unidades: { "kN": 1, "N": 0.001, "kgf": KGF, "tf": G },
      seletor: ["kN", "kgf", "tf"], tecnicas: ["kgf", "tf"] },
    momento: { nome: "momento", interna: "kN·m",
      unidades: { "kN·m": 1, "kN·cm": 0.01, "N·m": 0.001, "N·mm": 1e-6, "kgf·m": KGF, "kgf·cm": KGF / 100, "tf·m": G, "tf·cm": G / 100 },
      seletor: ["kN·m", "kgf·m", "tf·m"], tecnicas: ["kgf·m", "tf·m"] },
    linear: { nome: "força por comprimento", interna: "kN/m",
      unidades: { "kN/m": 1, "N/m": 0.001, "N/mm": 1, "kgf/m": KGF, "kgf/mm": G, "tf/m": G },
      seletor: ["kN/m", "kgf/m", "tf/m"], tecnicas: ["kgf/m", "tf/m"] },
    superficie: { nome: "força por área (carga, pressão)", interna: "kN/m²",
      unidades: { "kN/m²": 1, "kPa": 1, "N/m²": 0.001, "Pa": 0.001, "kgf/m²": KGF, "tf/m²": G },
      seletor: ["kN/m²", "kgf/m²", "tf/m²"], tecnicas: ["kgf/m²", "tf/m²"] },
    tensao: { nome: "tensão", interna: "MPa",
      unidades: { "MPa": 1, "N/mm²": 1, "kN/cm²": 10, "GPa": 1000, "kgf/cm²": G / 100, "kgf/mm²": G, "tf/cm²": G * 10 },
      seletor: ["MPa", "kN/cm²", "kgf/cm²"], tecnicas: ["kgf/cm²", "kgf/cm²"] },
    peso: { nome: "peso específico", interna: "kN/m³",
      unidades: { "kN/m³": 1, "N/m³": 0.001, "kgf/m³": KGF, "tf/m³": G },
      seletor: ["kN/m³", "kgf/m³", "tf/m³"], tecnicas: ["kgf/m³", "tf/m³"] },
    momentoLinear: { nome: "momento por comprimento", interna: "kN·m/m",
      unidades: { "kN·m/m": 1, "kgf·m/m": KGF, "tf·m/m": G },
      seletor: ["kN·m/m", "kgf·m/m", "tf·m/m"], tecnicas: ["kgf·m/m", "tf·m/m"] }
  };

  var NOTA_BASE = "Conversão pela convenção do quilograma-força: g = 9,80665 m/s² (gravidade padrão), 1 kgf = 9,80665 N, 1 tf = 1000 kgf = 9,80665 kN; 1 kN/m² = 1 kPa = 101,97 kgf/m²; 1 MPa = 10,197 kgf/cm². O cálculo foi feito em kN, kN·m, kN/m² e MPa (SI); a conversão é só de leitura.";

  /* ------------------------------------------------------------ símbolos */
  /* chave normalizada (minúsculas, · como produto, ² ³ como expoente) → unidade canônica (+ aviso) */
  var ALIAS = {};
  function normSimbolo(s) {
    return String(s == null ? "" : s).replace(/ /g, " ").trim()
      .replace(/\s*([·*×.⋅∙])\s*/g, "·").replace(/\s+/g, "·")
      .replace(/\^?2(?![\d])/g, "²").replace(/\^?3(?![\d])/g, "³")
      .replace(/·?\/·?/g, "/").toLowerCase();
  }
  function alias(nomes, unidade, aviso) { nomes.forEach(function (n) { ALIAS[normSimbolo(n)] = { unidade: unidade, aviso: aviso || null }; }); }
  (function () {
    Object.keys(GRANDEZAS).forEach(function (g) { Object.keys(GRANDEZAS[g].unidades).forEach(function (u) { alias([u], u); }); });
    var AV_KG = "“kg” foi lido como quilograma-força (kgf): 1 kgf = 9,80665 N.";
    var AV_T = "“t” foi lido como tonelada-força (tf): 1 tf = 9,80665 kN.";
    alias(["kgf", "kgf·", "kg-f", "kilograma-força", "quilograma-força", "quilogramas-força"], "kgf");
    alias(["kg", "quilo", "quilos", "kilo", "kilos", "quilograma", "quilogramas"], "kgf", AV_KG);
    alias(["tf", "t-f", "tonelada-força", "toneladas-força"], "tf");
    alias(["t", "ton", "tonelada", "toneladas"], "tf", AV_T);
    alias(["kn", "kilonewton", "quilonewton", "quilonewtons", "kilonewtons"], "kN");
    alias(["n", "newton", "newtons"], "N");
    alias(["knm", "kn·m", "kn-m", "kn m"], "kN·m");
    alias(["kncm", "kn·cm"], "kN·cm");
    alias(["kgfm", "kgf·m", "kgf-m", "kgf m"], "kgf·m");
    alias(["kgm", "kg·m", "kg-m", "kg m"], "kgf·m", AV_KG);
    alias(["kgfcm", "kgf·cm"], "kgf·cm");
    alias(["kgcm", "kg·cm"], "kgf·cm", AV_KG);
    alias(["tfm", "tf·m", "tf-m", "tf m"], "tf·m");
    alias(["tm", "t·m", "t-m", "t m"], "tf·m", AV_T);
    alias(["kg/m"], "kgf/m", AV_KG); alias(["t/m"], "tf/m", AV_T);
    alias(["kg/m²", "kg/m2"], "kgf/m²", AV_KG); alias(["t/m²", "t/m2"], "tf/m²", AV_T);
    alias(["kg/cm²", "kg/cm2"], "kgf/cm²", AV_KG); alias(["kg/mm²"], "kgf/mm²", AV_KG);
    alias(["kg/m³", "kg/m3"], "kgf/m³", AV_KG); alias(["t/m³", "t/m3"], "tf/m³", AV_T);
    alias(["kg·m/m"], "kgf·m/m", AV_KG); alias(["t·m/m"], "tf·m/m", AV_T);
    alias(["kpa"], "kPa"); alias(["mpa"], "MPa"); alias(["gpa"], "GPa"); alias(["pa"], "Pa");
    alias(["mpa", "n/mm²", "n/mm2"], "MPa");
  })();
  /* a grandeza de cada unidade canônica (uma unidade pertence a uma grandeza; N/mm é linear e N/mm² é tensão) */
  var GRANDEZA_DE = {};
  Object.keys(GRANDEZAS).forEach(function (g) { Object.keys(GRANDEZAS[g].unidades).forEach(function (u) { if (!GRANDEZA_DE[u]) GRANDEZA_DE[u] = g; }); });
  GRANDEZA_DE["kPa"] = "superficie";

  function unidadeDe(texto) {
    var k = normSimbolo(texto); if (!k) return null;
    var a = ALIAS[k]; if (!a) return null;
    var g = GRANDEZA_DE[a.unidade]; if (!g) return null;
    return { grandeza: g, unidade: a.unidade, fator: GRANDEZAS[g].unidades[a.unidade], aviso: a.aviso };
  }

  /* ------------------------------------------------------------ números (padrão BR) */
  /* "1.234,56" · "1234,56" · "19.61" · "2.000" (= 2000: grupo de 3 depois do ponto é milhar, como no BR) · "−3" */
  function lerNumero(texto) {
    var s = String(texto == null ? "" : texto).replace(/[\s ]/g, "").replace(/[−–]/g, "-");
    if (!/^[+-]?(\d[\d.,]*|[.,]\d+)$/.test(s)) return NaN;
    var sinal = 1; if (s.charAt(0) === "-") { sinal = -1; s = s.slice(1); } else if (s.charAt(0) === "+") s = s.slice(1);
    var temV = s.indexOf(",") >= 0, temP = s.indexOf(".") >= 0, n;
    if (temV && temP) {
      var dec = s.lastIndexOf(",") > s.lastIndexOf(".") ? "," : ".", mil = dec === "," ? "." : ",";
      var partes = s.split(dec); if (partes.length !== 2) return NaN;
      if (!new RegExp("^\\d{1,3}(\\" + mil + "\\d{3})*$").test(partes[0])) return NaN;
      n = Number(partes[0].split(mil).join("") + "." + partes[1]);
    } else if (temV) {
      if (s.split(",").length !== 2) return NaN;
      n = Number(s.replace(",", "."));
    } else if (temP) {
      if (/^\d{1,3}(\.\d{3})+$/.test(s)) n = Number(s.replace(/\./g, ""));
      else if (s.split(".").length === 2) n = Number(s);
      else return NaN;
    } else n = Number(s);
    return isFinite(n) ? sinal * n : NaN;
  }
  function numeroBR(v, casas, op) {
    op = op || {}; if (v == null || !isFinite(v)) return "—";
    var c = casas == null ? 2 : casas, s = Math.abs(v).toFixed(c).split("."), i = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, op.semMilhar ? "" : ".");
    var f = c ? s[1] : ""; if (op.aparar && f) { f = f.replace(/0+$/, ""); }
    var neg = v < 0 && Number(s.join(".")) !== 0;
    return (neg ? (op.menos || "−") : "") + i + (f ? "," + f : "");
  }

  /* ------------------------------------------------------------ ler um texto com unidade */
  function grandezaOk(g) { return !!GRANDEZAS[g]; }
  function ler(texto, grandeza, padrao) {
    if (!grandezaOk(grandeza)) return { ok: false, motivo: "Grandeza desconhecida: " + grandeza };
    var Gd = GRANDEZAS[grandeza], s = String(texto == null ? "" : texto).replace(/ /g, " ").trim();
    if (!s) return { ok: false, vazio: true, motivo: "Vazio." };
    var m = /^([+\-−–]?\s*(?:\d[\d.,]*|[.,]\d+))\s*(.*)$/.exec(s);
    if (!m) return { ok: false, motivo: "“" + s + "” não é um número." };
    var n = lerNumero(m[1]); if (!isFinite(n)) return { ok: false, motivo: "“" + m[1].trim() + "” não é um número válido." };
    var simb = m[2].trim(), u, aviso = null;
    if (!simb) {
      u = padrao && Gd.unidades[padrao] != null ? padrao : Gd.interna;
    } else {
      var d = unidadeDe(simb);
      if (!d) return { ok: false, motivo: "Unidade “" + simb + "” não reconhecida (use " + Gd.seletor.join(", ") + ")." };
      if (d.grandeza !== grandeza || Gd.unidades[d.unidade] == null) {
        var gOutra = GRANDEZAS[d.grandeza];
        return { ok: false, recusada: true, motivo: "“" + d.unidade + "” é unidade de " + (gOutra ? gOutra.nome : d.grandeza) + "; este campo é de " + Gd.nome + " (" + Gd.seletor.join(", ") + ")." };
      }
      u = d.unidade; aviso = d.aviso;
    }
    return { ok: true, valor: n * Gd.unidades[u], unidade: u, numero: n, aviso: aviso, interna: Gd.interna };
  }
  function valor(texto, grandeza, padrao) { var r = ler(texto, grandeza, padrao); return r.ok ? r.valor : null; }
  function converter(v, grandeza, de, para) {
    var Gd = GRANDEZAS[grandeza]; if (!Gd || !isFinite(v)) return NaN;
    var fd = Gd.unidades[de || Gd.interna], fp = Gd.unidades[para || Gd.interna];
    if (fd == null || fp == null) return NaN;
    return v * fd / fp;
  }

  /* ------------------------------------------------------------ formatar */
  /* casas automáticas: família kgf (e N, Pa) — ≥100 → 0, ≥10 → 1, senão 2; kN, tf, MPa — ≥10 000 → 0, ≥1000 → 1, senão 2 */
  function casasAuto(unidade, x) {
    var a = Math.abs(x);
    if (/^(kgf|N|Pa)/.test(unidade) && !/^N\/mm²/.test(unidade)) return a >= 100 ? 0 : a >= 10 ? 1 : 2;
    return a >= 10000 ? 0 : a >= 1000 ? 1 : (a >= 0.1 || a === 0) ? 2 : a >= 0.01 ? 3 : 4;
  }
  function tecnica(v, grandeza) {
    var Gd = GRANDEZAS[grandeza]; if (!Gd) return null;
    var t = Gd.tecnicas, emKgf = Math.abs(converter(v, grandeza, Gd.interna, t[0]));
    return emKgf >= 999.995 ? t[1] : t[0];   /* 999,995 kgf já se escreve "1.000 kgf": aí é 1,00 tf */
  }
  function formatar(v, grandeza, unidade, op) {
    op = op || {}; var Gd = GRANDEZAS[grandeza]; if (!Gd || v == null || !isFinite(v)) return "—";
    var u = unidade === "tecnica" ? tecnica(v, grandeza) : (unidade || Gd.interna);
    var x = converter(v, grandeza, Gd.interna, u); if (!isFinite(x)) return "—";
    var c = op.casas != null ? op.casas : casasAuto(u, x);
    return numeroBR(x, c, op) + (op.semUnidade ? "" : " " + u);
  }
  function formatarDuplo(v, grandeza, op) {
    op = op || {}; var Gd = GRANDEZAS[grandeza]; if (!Gd || v == null || !isFinite(v)) return "—";
    return formatar(v, grandeza, Gd.interna, { casas: op.casas != null ? op.casas : 2, menos: op.menos }) + " (" + formatar(v, grandeza, "tecnica", { menos: op.menos }) + ")";
  }

  var Unidades = {
    G: G, GRANDEZAS: GRANDEZAS, NOTA_BASE: NOTA_BASE, GRANDEZA_DE: GRANDEZA_DE,
    ler: ler, valor: valor, converter: converter, lerNumero: lerNumero, numeroBR: numeroBR,
    formatar: formatar, formatarDuplo: formatarDuplo, tecnica: tecnica, casasAuto: casasAuto,
    unidadeDe: unidadeDe, normSimbolo: normSimbolo
  };
  global.Unidades = Unidades;
  if (typeof module !== "undefined" && module.exports) module.exports = Unidades;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
