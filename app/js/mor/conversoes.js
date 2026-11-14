/* =====================================================================
 * mor/conversoes.js — CONVERSÃO DE UNIDADE, SÓ COM FATOR QUE TEM FONTE
 *
 * Substitui o `/ia/insumo-equivalente` (a IA chutava "1 UN = 0,02 KG"). Aqui NÃO existe
 * fator chutado: ou o fator está ESCRITO na descrição do item da base, ou é GEOMETRIA
 * exata de uma medida que o orçamentista informou. Todo fator devolvido carrega a sua
 * `fonte` e o `trecho` da descrição de onde saiu — e `conferir()` refaz a extração e
 * reprova um fator cujo número não esteja no texto (é o controle contra fator inventado).
 *
 * Duas famílias de fator:
 *   1. ESCRITO NA BASE (`extrair(descricao)`):
 *        "REBITE ... (1KG = 1025 UNIDADES)"          → 1 kg  = 1025 un
 *        "FITA ... ROLO DE 30M" / "ROLO 1000 M"      → 1 un  = 30 m
 *        "EMBALAGEM DE *400* GR" / "EMBALAGEM 2 LITROS" / "EMBALAGEM COM 250 G"
 *                                                    → 1 un  = 0,4 kg / 2 l / 0,25 kg
 *        "SACO DE 50 KG" / "LATA DE 18 L" / "GALAO DE 3,6 L"
 *        "CAIXA COM 2,5 M2" / "CX 1,44 M2" / "2,0 M2/CX"   → 1 cx = 2,5 m²
 *   2. GEOMETRIA EXATA (não depende da base, depende de medida informada):
 *        M² ↔ M³ pela espessura (m³ = m² × e);
 *        peça ↔ M² pelas dimensões escritas na descrição ("PLACAS DE 30 X 30 CM" → 0,09 m²).
 * Unidade incompatível (kg ↔ m², un ↔ m³ …) sem fator da lista acima NÃO converte:
 * devolve { ok:false, motivo }.
 *
 * Fator = "1 `de` equivale a `fator` `para`". Puro, ES5, sem DOM.
 * ===================================================================== */
(function (global) {
  "use strict";

  var r6 = function (x) { return Math.round(x * 1e6) / 1e6; };

  function semAcento(s) {
    var t = String(s == null ? "" : s);
    try { t = t.normalize("NFD").replace(/[̀-ͯ]/g, ""); } catch (e) {}
    return t.toUpperCase().replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
  }
  /* "11,5" / "11.5" / "1.234,5" → número */
  function numBR(s) {
    var t = String(s == null ? "" : s).replace(/\*/g, "").replace(/\s/g, "");
    if (!t) return NaN;
    if (t.indexOf(",") > -1) t = t.replace(/\./g, "").replace(",", ".");
    return parseFloat(t);
  }

  /* Unidade → chave canônica. Só as unidades que o motor sabe converter. */
  var CHAVE = {
    "M2": "m2", "M²": "m2", "M3": "m3", "M³": "m3", "UN": "un", "UND": "un", "UNID": "un", "UNIDADE": "un", "UNIDADES": "un", "PC": "un", "PECA": "un", "PECAS": "un", "PÇ": "un",
    "KG": "kg", "G": "g", "GR": "g", "L": "l", "LT": "l", "LITRO": "l", "LITROS": "l", "ML": "ml", "M": "m", "MT": "m", "CM": "cm", "MM": "mm",
    "CX": "cx", "CAIXA": "cx", "SC": "sc", "SACO": "sc", "LATA": "lata", "GALAO": "gl", "GL": "gl", "ROLO": "rolo", "T": "t", "CJ": "cj", "JG": "jg", "H": "h"
  };
  function chaveUn(u) {
    var k = semAcento(u).replace(/\s+/g, "");
    return CHAVE[k] || k.toLowerCase();
  }

  /* Escalas exatas entre unidades da MESMA grandeza (não são "fator da base": g↔kg, ml↔l, cm↔m). */
  var ESCALA = { "g>kg": 0.001, "kg>g": 1000, "ml>l": 0.001, "l>ml": 1000, "cm>m": 0.01, "m>cm": 100, "mm>m": 0.001, "m>mm": 1000, "t>kg": 1000, "kg>t": 0.001 };

  var NUM = "(\\d+(?:[.,]\\d+)?)";
  var UNID_RE = "(KG|G|GR|L|LT|LITROS?|ML|M2|M3|M|UN|UND|UNIDADES?|PECAS?|PCS?)";

  /* Cada padrão devolve { de, para, fator, regra }. O trecho vem do próprio casamento. */
  var PADROES = [
    { id: "igualdade", re: new RegExp(NUM + "\\s*" + UNID_RE + "\\s*=\\s*" + NUM + "\\s*" + UNID_RE + "\\b", "g"),
      f: function (m) { var a = numBR(m[1]), b = numBR(m[3]); if (!(a > 0 && b > 0)) return null; return { de: chaveUn(m[2]), para: chaveUn(m[4]), fator: r6(b / a), regra: "igualdade escrita na descrição" }; } },
    { id: "rolo", re: new RegExp("\\bROLO(?:\\s+(?:DE|COM))?\\s+\\*?" + NUM + "\\*?\\s*M\\b", "g"),
      f: function (m) { var n = numBR(m[1]); if (!(n > 0)) return null; return { de: "un", para: "m", fator: n, regra: "comprimento do rolo escrito na descrição", exige: ["un"] }; } },
    { id: "embalagem", re: new RegExp("\\bEMBALAGEM(?:\\s+(?:DE|COM))?\\s+\\*?" + NUM + "\\*?\\s*(KG|G|GR|LITROS?|L|ML)\\b", "g"),
      f: function (m) { var n = numBR(m[1]); if (!(n > 0)) return null; return { de: "un", para: chaveUn(m[2]), fator: n, regra: "conteúdo da embalagem escrito na descrição", exige: ["un"] }; } },
    { id: "saco-lata", re: new RegExp("\\b(SACO|SACA|SC|LATA|GALAO|GL|BALDE)(?:\\s+(?:DE|COM))?\\s+\\*?" + NUM + "\\*?\\s*(KG|G|LITROS?|L|ML)\\b", "g"),
      f: function (m) { var n = numBR(m[2]); if (!(n > 0)) return null; return { de: "un", para: chaveUn(m[3]), fator: n, regra: "conteúdo do " + m[1].toLowerCase() + " escrito na descrição", exige: ["un", "sc", "lata", "gl"] }; } },
    { id: "caixa-m2", re: new RegExp("\\b(?:CAIXA|CX)(?:\\s+(?:COM|DE))?\\s*[:=]?\\s*\\*?" + NUM + "\\*?\\s*M2\\b", "g"),
      f: function (m) { var n = numBR(m[1]); if (!(n > 0)) return null; return { de: "cx", para: "m2", fator: n, regra: "rendimento da caixa escrito na descrição", exige: ["un", "cx"] }; } },
    { id: "m2-por-caixa", re: new RegExp("\\*?" + NUM + "\\*?\\s*M2\\s*/\\s*(?:CAIXA|CX)\\b", "g"),
      f: function (m) { var n = numBR(m[1]); if (!(n > 0)) return null; return { de: "cx", para: "m2", fator: n, regra: "rendimento da caixa escrito na descrição", exige: ["un", "cx"] }; } }
  ];

  /* A TABELA, EM DADOS (cada linha com a sua fonte). Não há fator numérico solto: as escalas são definição de
     unidade; o resto é PADRÃO que lê o fator da descrição do item da base, ou geometria de medida informada. */
  function montarTabela() {
    var t = [];
    Object.keys(ESCALA).forEach(function (k) { var p = k.split(">"); t.push({ tipo: "escala", de: p[0], para: p[1], fator: ESCALA[k], fonte: "definição de unidade (mesma grandeza)" }); });
    PADROES.forEach(function (p) { t.push({ tipo: "descricao", padrao: p.id, fonte: "texto da descrição do item da base (o fator é o que está escrito)", exemplo: p.exemplo }); });
    t.push({ tipo: "geometria", de: "m2", para: "m3", fonte: "geometria: m³ = m² × espessura (informada)" });
    t.push({ tipo: "geometria", de: "un", para: "m2", fonte: "geometria: área da peça = A × B das dimensões da descrição" });
    return t;
  }
  var EXEMPLOS = { igualdade: "(1KG = 1025 UNIDADES)", rolo: "ROLO DE 30 M", embalagem: "EMBALAGEM DE *400* GR", "saco-lata": "SACO DE 50 KG · LATA DE 18 LITROS", "caixa-m2": "CAIXA COM 2,5 M2", "m2-por-caixa": "2,0 M2/CX" };
  PADROES.forEach(function (p) { p.exemplo = EXEMPLOS[p.id] || ""; });

  /* números do trecho, sem os dígitos colados em letra (M2, M3, CM2) */
  function numerosDoTrecho(tr) {
    var out = [], re = /\d+(?:[.,]\d+)?/g, m;
    while ((m = re.exec(tr))) {
      var ant = m.index > 0 ? tr.charAt(m.index - 1) : " ";
      if (/[A-Z]/.test(ant)) continue;
      var v = numBR(m[0]); if (v === v) out.push(v);
    }
    return out;
  }

  var Conv = {
    tabela: montarTabela,
    chaveUn: chaveUn, numBR: numBR, semAcento: semAcento,

    /* Fatores ESCRITOS na descrição. Devolve [{ de, para, fator, fonte:"descricao", regra, trecho }]. */
    extrair: function (descricao) {
      var d = semAcento(descricao).replace(/²/g, "2").replace(/³/g, "3"), out = [], vistos = {};
      PADROES.forEach(function (p) {
        p.re.lastIndex = 0;
        var m;
        while ((m = p.re.exec(d))) {
          var f = p.f(m);
          if (!f) continue;
          var k = f.de + ">" + f.para + "=" + f.fator;
          if (vistos[k]) continue; vistos[k] = 1;
          f.fonte = "descricao"; f.padrao = p.id; f.trecho = m[0];
          out.push(f);
        }
      });
      return out;
    },

    /* GEOMETRIA 1: m³ por m² = espessura (m). Só com espessura INFORMADA (cm). */
    porEspessura: function (espCm) {
      var e = Number(espCm);
      if (!(e > 0)) return { ok: false, motivo: "espessura não informada" };
      return { ok: true, de: "m2", para: "m3", fator: r6(e / 100), fonte: "geometria", regra: "m³ = m² × espessura (" + e + " cm informada)", trecho: "espessura " + e + " cm" };
    },

    /* GEOMETRIA 2: área de UMA peça, das dimensões escritas na descrição ("30 X 30 CM", "0,60 X 0,60 M").
       Se houver mais de um par, usa o que vem depois de "PLACAS DE"/"DIMENSOES"/"FORMATO"; senão, o primeiro. */
    areaDaPeca: function (descricao) {
      var d = semAcento(descricao).replace(/²/g, "2");
      var re = new RegExp("\\*?" + NUM + "\\*?\\s*X\\s*\\*?" + NUM + "\\*?\\s*(CM|M)\\b", "g"), m, ach = [];
      while ((m = re.exec(d))) {
        var a = numBR(m[1]), b = numBR(m[2]);
        if (a > 0 && b > 0) ach.push({ a: a, b: b, un: m[3], trecho: m[0], pos: m.index });
      }
      if (!ach.length) return { ok: false, motivo: "sem dimensões da peça (A X B CM) na descrição" };
      var esc = ach[0], i;
      for (i = 0; i < ach.length; i++) {
        var antes = d.slice(Math.max(0, ach[i].pos - 14), ach[i].pos);
        if (/(PLACAS? DE|DIMENSOES( DE)?|FORMATO( DE)?) ?$/.test(antes)) { esc = ach[i]; break; }
      }
      var k = esc.un === "CM" ? 0.0001 : 1;
      return { ok: true, de: "un", para: "m2", fator: r6(esc.a * esc.b * k), fonte: "geometria", regra: "área da peça = A × B das dimensões da descrição", trecho: esc.trecho };
    },

    /* O fator só vale se a descrição de origem o reproduz (anti-invenção). */
    conferir: function (fator, descricao) {
      if (!fator || typeof fator !== "object") return { ok: false, motivo: "fator ausente" };
      if (!fator.fonte) return { ok: false, motivo: "fator sem fonte" };
      if (!(Number(fator.fator) > 0)) return { ok: false, motivo: "fator não positivo" };
      if (fator.fonte === "geometria") {
        if (fator.para === "m3" && fator.de === "m2") {
          var m = /espessura (\d+(?:\.\d+)?) cm/.exec(String(fator.trecho || ""));
          return m && Math.abs(Number(m[1]) / 100 - fator.fator) < 1e-6 ? { ok: true } : { ok: false, motivo: "fator geométrico não bate com a espessura informada" };
        }
        if (fator.de === "un" && fator.para === "m2") {
          var g = Conv.areaDaPeca(descricao);
          return g.ok && Math.abs(g.fator - fator.fator) < 1e-6 ? { ok: true } : { ok: false, motivo: "área da peça não bate com as dimensões da descrição" };
        }
        return { ok: false, motivo: "fator geométrico desconhecido" };
      }
      if (fator.fonte !== "descricao") return { ok: false, motivo: "fonte «" + fator.fonte + "» não é aceita (só descricao ou geometria)" };
      /* (1) o trecho citado TEM de estar na descrição; (2) o número do fator TEM de sair dos números do trecho
         (conferência independente do extrator: um extrator quebrado não se auto-aprova) */
      var dN = semAcento(descricao).replace(/²/g, "2").replace(/³/g, "3"), tr = String(fator.trecho || "");
      if (!tr || dN.indexOf(tr) < 0) return { ok: false, motivo: "o trecho «" + tr + "» NÃO está na descrição — fator sem origem" };
      var ns = numerosDoTrecho(tr), esperado = ns.length >= 2 ? ns[ns.length - 1] / ns[0] : (ns.length === 1 ? ns[0] : NaN);
      if (!(Math.abs(esperado - fator.fator) < 1e-6)) return { ok: false, motivo: "o fator " + fator.fator + " não sai dos números do trecho «" + tr + "» (daria " + r6(esperado) + ") — inventado?" };
      var achou = Conv.extrair(descricao).some(function (x) { return x.de === fator.de && x.para === fator.para && Math.abs(x.fator - fator.fator) < 1e-6; });
      return achou ? { ok: true } : { ok: false, motivo: "o fator " + fator.fator + " (" + fator.de + "→" + fator.para + ") NÃO está escrito na descrição — inventado?" };
    },

    /* Converte `qtd` de `de` para `para` usando `fatores` (lista de fatores JÁ conferidos).
       Ordem: mesma unidade → escala da mesma grandeza → fator direto → fator inverso.
       Sem caminho = recusa com o motivo (unidade incompatível). */
    converter: function (qtd, de, para, fatores) {
      var a = chaveUn(de), b = chaveUn(para), q = Number(qtd);
      if (!(q === q)) return { ok: false, motivo: "quantidade inválida" };
      if (a === b) return { ok: true, valor: q, fator: 1, fonte: "identidade", regra: "mesma unidade" };
      var esc = ESCALA[a + ">" + b];
      if (esc) return { ok: true, valor: r6(q * esc), fator: esc, fonte: "escala", regra: "mesma grandeza (" + a + "→" + b + ")" };
      var i, f;
      fatores = fatores || [];
      for (i = 0; i < fatores.length; i++) {
        f = fatores[i];
        if (f.de === a && f.para === b) return { ok: true, valor: r6(q * f.fator), fator: f.fator, fonte: f.fonte, regra: f.regra, trecho: f.trecho };
        if (f.de === b && f.para === a) return { ok: true, valor: r6(q / f.fator), fator: r6(1 / f.fator), fonte: f.fonte, regra: f.regra + " (inverso)", trecho: f.trecho };
      }
      /* encadeia UMA vez (ex.: g → kg → un pelo "1 KG = 1025 UN") */
      for (i = 0; i < fatores.length; i++) {
        f = fatores[i];
        var e1 = ESCALA[a + ">" + f.de];
        if (e1 && f.para === b) return { ok: true, valor: r6(q * e1 * f.fator), fator: r6(e1 * f.fator), fonte: f.fonte, regra: f.regra + " (com escala " + a + "→" + f.de + ")", trecho: f.trecho };
        var e2 = ESCALA[f.para + ">" + b];
        if (f.de === a && e2) return { ok: true, valor: r6(q * f.fator * e2), fator: r6(f.fator * e2), fonte: f.fonte, regra: f.regra + " (com escala " + f.para + "→" + b + ")", trecho: f.trecho };
      }
      return { ok: false, motivo: "unidade incompatível: não há fator escrito na base nem geometria que leve " + a + " a " + b };
    },

    /* Atalho para o compositor/casador: tudo o que a descrição do item permite, já conferido. */
    fatoresDe: function (descricao, opts) {
      opts = opts || {};
      /* fator "1 UN = n ..." só vale se o item da base é POR UNIDADE (rolo, embalagem, caixa): "LATA DE 18 LITROS"
         na descrição de um transporte em L×KM não faz o item ser vendido em lata. */
      var uItem = opts.unidade ? chaveUn(opts.unidade) : null;
      var fs = Conv.extrair(descricao).filter(function (f) {
        if (f.exige && uItem && f.exige.indexOf(uItem) < 0) return false;
        return Conv.conferir(f, descricao).ok;
      });
      if (opts.espessuraCm) { var e = Conv.porEspessura(opts.espessuraCm); if (e.ok) fs.push(e); }
      if (opts.peca) { var p = Conv.areaDaPeca(descricao); if (p.ok) fs.push(p); }
      return fs;
    }
  };

  if (typeof module !== "undefined" && module.exports) module.exports = Conv;
  global.MorConversoes = Conv;
})(typeof window !== "undefined" ? window : globalThis);
