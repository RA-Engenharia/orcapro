/* =====================================================================
 * dinheiro.js — ARITMÉTICA DE DINHEIRO EM CENTAVOS INTEIROS
 *
 * POR QUE ISTO EXISTE (15/08/2026):
 * O módulo financeiro grava float cru. `js/gestao.js` não usa `Arred` em
 * lugar nenhum — zero ocorrências — e o resultado já está no disco do
 * cliente: há lançamento gravado como 45.933,231499999994. Enquanto o número
 * só era somado e exibido com `fmtMoeda` (que arredonda na hora de pintar), o
 * erro ficava escondido. Agendamento de pagamento, boleto e nota fiscal
 * acabam com esse esconderijo: o valor sai do app e vira dinheiro de verdade,
 * conferido por um terceiro que não perdoa um centavo.
 *
 * ⚠ POR QUE CENTAVOS INTEIROS, E NÃO `Arred`.
 *   `Arred` resolve o problema do ORÇAMENTO: truncar em 2 casas na hora de
 *   apresentar o preço (padrão TCU). Ele opera sobre float e devolve float —
 *   0.1 + 0.2 continua sendo 0.30000000000000004 antes de qualquer truncagem.
 *   Para uma planilha isso é aceitável: o erro é truncado na saída.
 *   Para um boleto NÃO é: `5226.50 / 4` tem de dar quatro parcelas que somam
 *   EXATAMENTE 5226,50, e a soma tem de fechar com o documento pelo resto da
 *   vida daquele título. A única forma de garantir isso é sair do float:
 *   inteiro de centavos, divisão com resto explícito, resto distribuído.
 *
 * ⚠ ISTO NÃO SUBSTITUI `Arred` E NÃO ENTRA NO ORÇAMENTO. São dois domínios
 *   com regras diferentes de propósito: o orçamento TRUNCA (o erro é de um
 *   lado só, é a regra do TCU e está coberta por teste); o financeiro
 *   ARREDONDA meio-para-cima no fim e distribui resto, porque o total tem de
 *   fechar com o documento. Misturar os dois faria a planilha divergir da
 *   cobrança — que é exatamente o defeito que a v1.1.236 acabou de corrigir
 *   em outro lugar.
 *
 * A INVARIANTE, em uma frase: a soma das partes É o todo. Sempre. Não por
 * sorte de arredondamento — por construção.
 *
 * Precedente da casa: `NFItens.parcelas` (js/nfitens.js:248) já enuncia essa
 * invariante e joga o resíduo na última parcela; `NFItens.ratear` (:283) joga
 * na maior fatia; `Fechamento._resolverResiduo` (js/fechamento.js:653) trata
 * resíduo como problema de TROCO. Este módulo generaliza os três e passa a
 * ser a fonte única — os três continuam funcionando e podem migrar depois.
 *
 * Módulo PURO: sem DOM, sem Store, sem rede. Testável no Node.
 * ===================================================================== */
(function (global) {
  "use strict";

  /* O maior valor seguro: 2^53-1 centavos ≈ R$ 90 trilhões. Acima disso o
     inteiro deixa de ser exato em JS e o silêncio seria pior que o erro. */
  var TETO = 9007199254740991;

  function ehNum(v) { return typeof v === "number" && isFinite(v); }

  /* -------------------------------------------------------------------
   * REAIS -> CENTAVOS
   *
   * ⚠ `Math.round(v * 100)` ERRA, e erra justamente onde dói. Em IEEE-754,
   *   1.005 é guardado como 1.00499999999999989..., então `1.005 * 100` dá
   *   100.49999999999999 e o round devolve 100 — R$ 1,00 no lugar de R$ 1,01.
   *   O mesmo acontece com 8.165, 2.675, 1.015, 1.045, 0.615 — valores COMUNS
   *   em nota fiscal, não casos de laboratório.
   *
   * ⚠ E `toFixed(2)` NÃO RESOLVE, ao contrário do que parece. Ele também
   *   enxerga o valor binário: `(1.005).toFixed(2)` devolve "1.00". Escrevi
   *   este módulo apoiado nele e o teste reprovou seis dos catorze valores —
   *   por isso a nota fica aqui, para ninguém "simplificar" de volta.
   *
   *   O que funciona é `String(n)`: o JS imprime a MENOR string decimal que
   *   volta exatamente ao mesmo double, e para 1.005 ela é "1.005" — o que a
   *   pessoa digitou. A partir daí a decisão é decimal, não binária: olha o
   *   3º dígito da fração e arredonda meio-para-cima (regra do boleto).
   *   Basta o 3º dígito: se ele é 4, o resto vale menos de meio centavo
   *   qualquer que seja; se é 5 ou mais, vale pelo menos meio.
   * ------------------------------------------------------------------- */
  function paraCentavos(v) {
    if (v == null || v === "") return 0;
    var n;
    if (ehNum(v)) n = v;
    else if (global.Util && global.Util.num) n = global.Util.num(v);  // grafia BR: "1.234,56"
    else n = Number(String(v).replace(/\./g, "").replace(",", "."));
    if (!isFinite(n)) return 0;

    var neg = n < 0, abs = Math.abs(n);
    if (abs > TETO / 100) return neg ? -TETO : TETO;   // satura em vez de devolver lixo calado

    var s = String(abs);
    /* notação científica (1e-7, 1e+21): não dá para fatiar a string; cai no
       caminho de casas fixas, que aqui é seguro porque o valor é minúsculo
       ou já foi saturado acima */
    if (s.indexOf("e") > -1 || s.indexOf("E") > -1) s = abs.toFixed(20);

    var ponto = s.indexOf(".");
    var inteiro = ponto < 0 ? s : s.slice(0, ponto);
    var frac = ponto < 0 ? "" : s.slice(ponto + 1);
    var f3 = (frac + "000").slice(0, 3);
    var c = Number(inteiro) * 100 + Number(f3.slice(0, 2));
    if (Number(f3.charAt(2)) >= 5) c += 1;
    return neg ? -c : c;
  }

  /* CENTAVOS -> REAIS. Só na borda: exibir, exportar, mandar para fora. */
  function paraReais(c) {
    var n = ehNum(c) ? Math.round(c) : 0;
    return n / 100;
  }

  /* -------------------------------------------------------------------
   * DIVISÃO COM RESTO EXPLÍCITO — o coração do módulo.
   *
   * R$ 100,00 em 3 não é R$ 33,33: são duas de R$ 33,33 e uma de R$ 33,34.
   * Quem decide QUEM leva o centavo a mais é uma decisão de negócio, não de
   * arredondamento — por isso `modo` é parâmetro e não convenção escondida.
   *
   *   "ultima"   — o resto vai para a última parcela (padrão do mercado em
   *                carnê e boleto: a primeira é "redonda")
   *   "primeira" — o resto vai para a primeira (quem cobra recebe mais cedo)
   *   "espalhar" — um centavo por parcela, da primeira em diante, até acabar
   *                o resto (a divisão mais justa; usada em rateio por obra)
   * ------------------------------------------------------------------- */
  function dividir(totalCent, n, modo) {
    var total = ehNum(totalCent) ? Math.round(totalCent) : 0;
    var q = Math.max(1, Math.round(Number(n) || 1));
    var neg = total < 0, abs = Math.abs(total);
    var base = Math.floor(abs / q), resto = abs - base * q;
    var out = [], i;
    for (i = 0; i < q; i++) out.push(base);
    if (resto > 0) {
      if (modo === "primeira") out[0] += resto;
      else if (modo === "espalhar") { for (i = 0; i < resto; i++) out[i] += 1; }
      else out[q - 1] += resto;   // "ultima" (padrão)
    }
    if (neg) for (i = 0; i < q; i++) out[i] = -out[i];
    return out;
  }

  /* RATEIO PROPORCIONAL a pesos (valor por obra, por item, por centro de
   * custo). O resto de centavos vai para a MAIOR fatia — é onde ele
   * representa a menor distorção percentual, mesma escolha do
   * `NFItens.ratear`. Peso zero recebe zero e não some da lista: quem chamou
   * espera um array do mesmo tamanho que os pesos. */
  function ratear(totalCent, pesos) {
    var total = ehNum(totalCent) ? Math.round(totalCent) : 0;
    var ps = (pesos || []).map(function (p) { var x = Number(p); return isFinite(x) && x > 0 ? x : 0; });
    var soma = ps.reduce(function (s, p) { return s + p; }, 0);
    if (!ps.length) return [];
    if (!(soma > 0)) return ps.map(function () { return 0; });

    var neg = total < 0, abs = Math.abs(total);
    var out = ps.map(function (p) { return Math.floor(abs * p / soma); });
    var dado = out.reduce(function (s, v) { return s + v; }, 0);
    var resto = abs - dado;
    /* ordem de preferência para o resto: maior peso primeiro. Empate resolve
       pelo índice, para o resultado ser determinístico (dois aparelhos têm de
       chegar ao mesmo número — o merge da nuvem não perdoa divergência). */
    var ordem = ps.map(function (p, i) { return { p: p, i: i }; })
      .sort(function (a, b) { return b.p !== a.p ? b.p - a.p : a.i - b.i; });
    for (var k = 0; k < resto; k++) out[ordem[k % ordem.length].i] += 1;
    if (neg) out = out.map(function (v) { return -v; });
    return out;
  }

  /* PERCENTUAL sobre um valor (retenção, multa, imposto, desconto).
   * Devolve centavos inteiros, arredondando meio-para-cima — a regra do
   * boleto. `pct` é o número que o usuário digita: 5 significa 5%. */
  function percentual(baseCent, pct) {
    var b = ehNum(baseCent) ? Math.round(baseCent) : 0;
    var p = Number(pct); if (!isFinite(p)) return 0;
    var v = b * p / 100;
    /* meio-para-cima em valor absoluto, para -0,5 e +0,5 se comportarem igual */
    return (v < 0 ? -1 : 1) * Math.round(Math.abs(v));
  }

  /* O par que sempre anda junto: quanto foi retido e quanto sobra líquido.
     Separado porque a soma dos dois TEM de ser a base — e é o tipo de conta
     que, feita solta em dois lugares, diverge em um centavo. */
  function comRetencao(baseCent, pct) {
    var ret = percentual(baseCent, pct);
    var b = ehNum(baseCent) ? Math.round(baseCent) : 0;
    return { base: b, retido: ret, liquido: b - ret };
  }

  /* -------------------------------------------------------------------
   * MORA: multa fixa + juros pro rata die.
   *
   * Convenção brasileira e a que os contratos da casa usam: multa é um
   * percentual ÚNICO sobre o principal, aplicado uma vez assim que vence;
   * juros são ao MÊS, proporcionais aos dias corridos de atraso (÷30).
   * Ambos incidem sobre o principal, não um sobre o outro — juros sobre
   * multa é anatocismo e não se cobra.
   *
   * Devolve as partes separadas de propósito: boleto, recibo e nota precisam
   * discriminar, e quem só quer o total soma `.total`.
   * ------------------------------------------------------------------- */
  function mora(principalCent, diasAtraso, multaPct, jurosMesPct) {
    var p = ehNum(principalCent) ? Math.round(principalCent) : 0;
    var d = Math.floor(Number(diasAtraso) || 0);
    if (p <= 0 || d <= 0) return { principal: p, multa: 0, juros: 0, total: p, dias: Math.max(0, d) };
    var multa = percentual(p, Number(multaPct) || 0);
    var jm = Number(jurosMesPct) || 0;
    var juros = jm ? Math.round(p * (jm / 100) * (d / 30)) : 0;
    return { principal: p, multa: multa, juros: juros, total: p + multa + juros, dias: d };
  }

  /* Soma que não mente: aceita centavos inteiros e devolve inteiro. Existe
     para que ninguém escreva `a + b` com float no meio do caminho. */
  function somar(lista) {
    return (lista || []).reduce(function (s, v) {
      return s + (ehNum(v) ? Math.round(v) : 0);
    }, 0);
  }

  /* Formatação BR a partir de CENTAVOS — a borda de saída. Delega ao
     Util.fmtMoeda quando ele existe, para a moeda ficar igual no app inteiro. */
  function fmt(c) {
    var r = paraReais(c);
    if (global.Util && global.Util.fmtMoeda) return global.Util.fmtMoeda(r);
    return "R$ " + r.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  var Dinheiro = {
    TETO: TETO,
    paraCentavos: paraCentavos, c: paraCentavos,
    paraReais: paraReais, r: paraReais,
    dividir: dividir,
    ratear: ratear,
    percentual: percentual,
    comRetencao: comRetencao,
    mora: mora,
    somar: somar,
    fmt: fmt
  };

  global.Dinheiro = Dinheiro;
  if (typeof module !== "undefined" && module.exports) module.exports = Dinheiro;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
