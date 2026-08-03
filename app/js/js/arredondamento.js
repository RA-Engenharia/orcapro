/* =====================================================================
 * arredondamento.js — Política de ARREDONDAMENTO do orçamento (motor puro)
 *
 * Em licitação pública o critério de arredondamento NÃO é detalhe estético:
 * o TCU exige TRUNCAMENTO em 2 casas (nunca arredondar para cima), e um
 * centavo a mais no preço unitário já rendeu impugnação. Por isso o modo
 * padrão do OrçaPRO é "truncar2" (Padrão do TCU).
 *
 * 5 modos (espelham o que o mercado usa):
 *   arred2        — Arredondar tudo em 2 casas decimais
 *   arred2aux     — Arredondar em 2 casas INCLUINDO as composições auxiliares
 *   arred2truncpu — Arredondar em 2 casas e TRUNCAR os preços unitários
 *   truncar2      — Truncar tudo em 2 casas decimais  [PADRÃO DO TCU] ← default
 *   nenhum        — Não arredondar (mantém toda a precisão)
 *
 * Duas entradas, porque os modos tratam VALOR e PREÇO UNITÁRIO diferente:
 *   Arred.valor(v, modo)    -> totais, subtotais, custo direto
 *   Arred.unitario(v, modo) -> preço unitário do item (o que vai na planilha)
 *
 * Puro e testável em Node (sem DOM, sem dependência do app).
 * ===================================================================== */
(function (global) {
  "use strict";

  /* Trunca/arredonda em CENTAVOS INTEIROS, a partir da representação decimal.
   *
   * Por que não `Math.floor(x*100 + 1e-9)/100`: esse epsilon é ABSOLUTO, e o
   * erro de representação do double cresce com a grandeza — a partir de uns
   * R$ 262.144 o ruído já é maior que 1e-9 e o truncamento comia 1 centavo
   * (1.234.567,89 virava 1.234.567,88). Num orçamento de milhão isso fazia o
   * total da tela divergir do total recalculado no Excel — em licitação,
   * impugnação na certa.
   *
   * toFixed(6) devolve a decimal já limpa do ruído de float (o erro real é da
   * ordem de 1e-9 mesmo em valores de bilhão) SEM mexer na 3ª casa de um valor
   * legítimo; daí trabalhamos com inteiros de centavo, que o double representa
   * exatamente até 2^53 (≈ R$ 90 trilhões). */
  function _partes(x) {
    // toPrecision(15) = a MESMA regra do Excel: ele computa em IEEE754 mas normaliza
    // o resultado em 15 dígitos significativos. Usar isto (em vez de um toFixed fixo)
    // faz o app e a planilha viva chegarem SEMPRE ao mesmo centavo — inclusive nos
    // valores em que o ruído do último bit ficaria no meio do caminho.
    var s = x.toPrecision(15);
    if (s.indexOf("e") >= 0 || s.indexOf("E") >= 0) s = Number(s).toFixed(6); // fora da faixa fixa
    var i = s.indexOf(".");
    if (i < 0) return { centavos: Number(s) * 100, resto: 0 };
    var dec = (s.slice(i + 1) + "0000");        // casas decimais (com folga)
    return {
      centavos: Number(s.slice(0, i)) * 100 + Number(dec.slice(0, 2)),
      resto: Number(dec.slice(2, 6))            // 4 dígitos após o centavo (0000..9999)
    };
  }
  function trunc2(v) {
    var n = Number(v);
    if (!isFinite(n)) return 0;
    var neg = n < 0, p = _partes(Math.abs(n));
    var t = p.centavos / 100;
    return neg ? -t : t;
  }
  function round2(v) {
    var n = Number(v);
    if (!isFinite(n)) return 0;
    var neg = n < 0, p = _partes(Math.abs(n));
    var c = p.centavos + (p.resto >= 5000 ? 1 : 0); // meio centavo sobe (regra comercial)
    var r = c / 100;
    return neg ? -r : r;
  }
  function cru(v) { var n = Number(v); return isFinite(n) ? n : 0; }

  var MODOS = [
    { id: "arred2",        rotulo: "Arredondar tudo em 2 casas decimais",                          selo: "" },
    { id: "arred2aux",     rotulo: "Arredondar em 2 casas decimais incluindo as composições auxiliares", selo: "" },
    { id: "arred2truncpu", rotulo: "Arredondar em 2 casas decimais e truncar os preços unitários", selo: "" },
    { id: "truncar2",      rotulo: "Truncar tudo em 2 casas decimais",                             selo: "Padrão do TCU" },
    { id: "nenhum",        rotulo: "Não arredondar",                                               selo: "" }
  ];

  var PADRAO = "truncar2"; // Padrão do TCU — default do produto

  var Arred = {
    MODOS: MODOS,
    PADRAO: PADRAO,

    /* modo válido? senão devolve o padrão TCU (nunca quebra o cálculo) */
    normalizar: function (modo) {
      for (var i = 0; i < MODOS.length; i++) { if (MODOS[i].id === modo) return modo; }
      return PADRAO;
    },
    rotulo: function (modo) {
      var m = this.normalizar(modo);
      for (var i = 0; i < MODOS.length; i++) { if (MODOS[i].id === m) return MODOS[i].rotulo; }
      return m;
    },
    ehPadraoTcu: function (modo) { return this.normalizar(modo) === "truncar2"; },

    /* VALOR (totais, subtotais, custo direto, BDI em dinheiro) */
    valor: function (v, modo) {
      switch (this.normalizar(modo)) {
        case "nenhum": return cru(v);
        case "truncar2": return trunc2(v);
        default: return round2(v); // arred2, arred2aux, arred2truncpu
      }
    },

    /* PREÇO UNITÁRIO (o que vai na coluna da planilha e é medido) */
    unitario: function (v, modo) {
      switch (this.normalizar(modo)) {
        case "nenhum": return cru(v);
        case "truncar2": return trunc2(v);
        case "arred2truncpu": return trunc2(v); // arredonda o resto, trunca o PU
        default: return round2(v); // arred2, arred2aux
      }
    },

    /* Composição AUXILIAR (sub-composição do analítico): só o modo arred2aux
     * arredonda nesse nível; nos demais a auxiliar mantém a precisão da base
     * (arredondar cedo demais distorce o coeficiente). truncar2 trunca tudo. */
    auxiliar: function (v, modo) {
      var m = this.normalizar(modo);
      if (m === "arred2aux") return round2(v);
      if (m === "truncar2") return trunc2(v);
      if (m === "nenhum") return cru(v);
      return cru(v); // arred2 / arred2truncpu: auxiliar sem arredondar
    },

    /* ---- Incidência do BDI (Passo 2 do assistente) ----
     * "unitario" (TCU recomenda): BDI entra no preço unitário de CADA
     *   composição; o total do item = qtd × PU-com-BDI (já arredondado).
     * "final": o orçamento soma o custo direto e só então aplica o BDI.
     * O resultado difere em centavos — e em licitação isso importa. */
    INCIDENCIAS: [
      { id: "unitario", rotulo: "Incidir sobre o preço unitário da composição", selo: "TCU recomenda" },
      { id: "final",    rotulo: "Incidir sobre o preço final do orçamento",     selo: "" }
    ],
    INCIDENCIA_PADRAO: "unitario",
    normalizarIncidencia: function (inc) { return inc === "final" ? "final" : "unitario"; },

    /* Preço unitário COM BDI, já arredondado conforme o modo. */
    puComBdi: function (custoUnitario, bdiPct, modo, incidencia) {
      var cu = cru(custoUnitario), pct = cru(bdiPct);
      if (this.normalizarIncidencia(incidencia) === "final") return this.unitario(cu, modo);
      return this.unitario(cu * (1 + pct / 100), modo);
    },

    /* Total de um item respeitando modo + incidência. */
    totalItem: function (quantidade, custoUnitario, bdiPct, modo, incidencia) {
      var q = cru(quantidade);
      var pu = this.puComBdi(custoUnitario, bdiPct, modo, incidencia);
      return this.valor(q * pu, modo);
    },

    /* Custo direto de um item (sem BDI), arredondado conforme o modo. */
    custoItem: function (quantidade, custoUnitario, modo) {
      return this.valor(cru(quantidade) * this.unitario(custoUnitario, modo), modo);
    }
  };

  if (global) global.Arred = Arred;
  if (typeof module !== "undefined" && module.exports) module.exports = Arred;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
