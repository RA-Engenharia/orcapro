/* =====================================================================
 * escala.js — EIXO EM NÚMERO QUE GENTE LÊ
 *
 * Os gráficos do Painel dividiam o intervalo em terços exatos:
 *   gv = min + (max - min) * g / 3
 * Com dados reais isso produz "R$ 0,00 / 89,4 mil / 179 mil / 268 mil" —
 * números que ninguém consegue usar para estimar de relance. É o detalhe
 * que faz um painel parecer planilha exportada em vez de software.
 *
 * Aqui o eixo passa a andar em passos que a cabeça reconhece: 1, 2, 2,5 e 5
 * vezes uma potência de dez. O mesmo dado vira "0 / 100 mil / 200 mil /
 * 300 mil", e a leitura fica imediata.
 *
 * ⚠ DUAS REGRAS QUE NÃO SÃO ESTÉTICA, SÃO HONESTIDADE:
 *
 * 1) O ZERO SEMPRE ENTRA quando os dados o cruzam, e o eixo de barra começa
 *    em zero SEMPRE. Eixo que começa em 240 mil transforma uma variação de
 *    3% num gráfico que parece o dobro — é a forma mais comum de mentir com
 *    gráfico honesto.
 * 2) O eixo ARREDONDA PARA FORA, nunca para dentro. Se o topo do dado é
 *    268 mil, o eixo vai a 300 mil. Cortar em 250 mil deixaria a linha
 *    saindo pela borda de cima.
 * ===================================================================== */
(function (global) {
  "use strict";

  /* ⚠ RÉPLICA FIEL DE `Util.parseNum` (js/util.js). Este módulo é puro — o
     gate o roda em Node, onde `Util` não existe — então a regra vem copiada.
     ⚠ E CÓPIA APODRECE CALADA: as duas versões curtas que existiam neste
     projeto erram em direções OPOSTAS, e as duas já moveram dinheiro:
     `replace(/\./g,"")` lê "1234.56" como 123456 (×100); tratar o ponto só
     quando há vírgula lê "1.850.000" como 1,85 (÷1.000.000).
     A paridade com o `Util.parseNum` real é cobrada em tools/test-numbr.js. */
  function num(v) {
    if (typeof v === "number") return isFinite(v) ? v : 0;
    if (v == null) return 0;
    var s = String(v).trim();
    if (!s) return 0;
    s = s.replace(/[^0-9.,\-]/g, "");
    if (!s) return 0;
    var temV = s.indexOf(",") > -1, temP = s.indexOf(".") > -1;
    if (temV && temP) {
      if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
      else s = s.replace(/,/g, "");
    } else if (temV) {
      s = (s.match(/,/g) || []).length > 1 ? s.replace(/,/g, "") : s.replace(",", ".");
    } else if (temP && (s.match(/\./g) || []).length > 1) {
      if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
      else { var iP = s.lastIndexOf("."); s = s.slice(0, iP).replace(/\./g, "") + "." + s.slice(iP + 1); }
    } else if (temP && /^-?\d{1,3}(\.\d{3})+$/.test(s) && !/^-?0\./.test(s)) {
      s = s.replace(/\./g, "");
    }
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }

  /* o passo "bonito" imediatamente ACIMA de um valor bruto */
  function passoBonito(bruto) {
    if (!(bruto > 0)) return 1;
    var pot = Math.pow(10, Math.floor(Math.log(bruto) / Math.LN10));
    var r = bruto / pot;
    var mult = r <= 1 ? 1 : (r <= 2 ? 2 : (r <= 2.5 ? 2.5 : (r <= 5 ? 5 : 10)));
    return mult * pot;
  }

  /* --------------------------------------------------------------------
   * `min`/`max` do dado, `divisoes` = quantas faixas se deseja (aprox.).
   * Devolve { min, max, passo, marcas[] } já arredondado para fora.
   * ------------------------------------------------------------------ */
  function calcular(min, max, divisoes) {
    var d = Math.max(1, Math.round(num(divisoes) || 4));
    var lo = num(min), hi = num(max);
    if (lo > hi) { var t = lo; lo = hi; hi = t; }

    /* barra e área sempre contra o zero; linha só quando o dado o cruza */
    if (lo > 0) lo = 0;
    if (hi < 0) hi = 0;
    /* tudo zerado: um eixo mínimo, para o gráfico não virar uma linha só */
    if (lo === 0 && hi === 0) return { min: 0, max: 1, passo: 1, marcas: [0, 1] };

    /* ⚠ NÃO basta arredondar (hi-lo)/d para cima.
       Com 0–268 mil e 5 faixas, o bruto é 53,6 mil — que sobe direto para
       100 mil na escada, e o eixo sai com 3 faixas em vez de 5. Aqui eu
       testo os passos bonitos VIZINHOS e fico com o que chega mais perto do
       que foi pedido: a escala continua redonda e a densidade obedece. */
    var bruto = (hi - lo) / d;
    var base = passoBonito(bruto);
    var passo = base, melhor = Infinity;
    [base / 4, base / 2.5, base / 2, base, base * 2].forEach(function (cand) {
      if (!(cand > 0)) return;
      var lo2 = Math.floor(lo / cand) * cand, hi2 = Math.ceil(hi / cand) * cand;
      var faixas = Math.round((hi2 - lo2) / cand);
      if (faixas < 2 || faixas > 12) return;      // eixo ilegível dos dois lados
      var erro = Math.abs(faixas - d);
      if (erro < melhor) { melhor = erro; passo = cand; }
    });
    var eixoLo = Math.floor(lo / passo) * passo;
    var eixoHi = Math.ceil(hi / passo) * passo;
    /* o arredondamento pode ter engolido uma faixa; devolve para não
       espremer a série contra o topo */
    if (eixoHi === eixoLo) eixoHi = eixoLo + passo;

    var marcas = [], v = eixoLo;
    /* trava: com passo minúsculo e intervalo grande isto viraria laço longo */
    for (var i = 0; i <= 200 && v <= eixoHi + passo * 1e-9; i++) {
      /* o acumulado de ponto flutuante faz 0.1+0.2 virar 0.30000000000000004
         e o rótulo sai com 17 casas */
      marcas.push(Math.round(v / passo) * passo);
      v += passo;
    }
    return { min: eixoLo, max: eixoHi, passo: passo, marcas: marcas };
  }

  var Escala = { calcular: calcular, passoBonito: passoBonito };
  global.Escala = Escala;
  if (typeof module !== "undefined" && module.exports) module.exports = Escala;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
