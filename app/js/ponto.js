/* =====================================================================
 * ponto.js — batidas do cartão de ponto com variação de minutos
 *
 * POR QUE EXISTE: o espelho de ponto repetia 07:00 / 12:00 / 13:00 / 17:00
 * em TODOS os dias e para TODOS os colaboradores. Ninguém bate ponto no
 * minuto cravado — na obra a variação de alguns minutos é o normal, e um
 * cartão com a hora exata o mês inteiro não se parece com registro de
 * jornada nenhum.
 *
 * DUAS REGRAS QUE NÃO PODEM CAIR:
 *
 * 1) ESTÁVEL. O mesmo colaborador, no mesmo dia, tem SEMPRE a mesma batida.
 *    O sorteio vem de um número derivado do id + da data (não de
 *    Math.random), senão reimprimir o cartão geraria horários diferentes do
 *    que já foi assinado — e aí o documento não vale nada.
 *
 * 2) O INTERVALO NUNCA ENCOLHE. A CLT (art. 71) exige no mínimo 1 hora de
 *    intervalo em jornada acima de 6 horas. A variação pode alongar o
 *    almoço, nunca deixá-lo abaixo do que a jornada cadastrada define nem
 *    abaixo de 60 minutos. Um cartão que mostra 55 min de almoço é prova
 *    contra a empresa, não a favor.
 *
 * A jornada trabalhada também não vira hora extra por acidente: a saída é
 * recalculada para manter o total do dia dentro de poucos minutos do
 * nominal.
 * ===================================================================== */
(function (global) {
  "use strict";

  var Ponto = {

    /* minutos desde a meia-noite; devolve null se não for "HH:MM" */
    hhmmParaMin: function (hhmm) {
      var m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || "").trim());
      if (!m) return null;
      var h = Number(m[1]), i = Number(m[2]);
      if (h < 0 || h > 23 || i < 0 || i > 59) return null;
      return h * 60 + i;
    },

    minParaHhmm: function (min) {
      var t = Math.round(Number(min) || 0);
      while (t < 0) t += 1440;
      t = t % 1440;
      var h = Math.floor(t / 60), i = t % 60;
      return (h < 10 ? "0" : "") + h + ":" + (i < 10 ? "0" : "") + i;
    },

    /* Semente estável: mesma chave → mesmo número. É o hash djb2, que basta
       aqui — não queremos criptografia, queremos repetibilidade. */
    semente: function (chave) {
      var s = String(chave == null ? "" : chave), h = 5381;
      for (var i = 0; i < s.length; i++) {
        h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
      }
      return h >>> 0;
    },

    /* Sorteio determinístico no intervalo [min, max], inclusive. O `passo`
       separa os quatro horários do mesmo dia: sem ele, entrada e saída
       variariam sempre juntas, o que denunciaria o padrão. */
    _desvio: function (sem, passo, min, max) {
      var x = (sem + passo * 2654435761) >>> 0;
      x = (x ^ (x >>> 13)) >>> 0;
      x = (x * 1274126177) >>> 0;
      /* ⚠ o >>> 0 no fim NÃO é enfeite: em JavaScript o operador ^ devolve
         inteiro COM SINAL, e sem essa conversão x fica negativo, o resto da
         divisão sai negativo e o sorteio estoura a faixa combinada — a
         entrada ia parar às 06:42 quando o limite era 06:53. */
      x = (x ^ (x >>> 16)) >>> 0;
      var faixa = (max - min + 1);
      return min + (x % faixa);
    },

    /* ------------------------------------------------------------------
     * batidas(jornada, colaboradorId, data, opcoes)
     *
     * jornada: { entrada, almoco, retorno, saida } em "HH:MM"
     * devolve  { entrada, almoco, retorno, saida } com a variação aplicada.
     *
     * Se qualquer horário da jornada estiver ilegível, devolve a jornada
     * como veio — é melhor um cartão sem variação do que um cartão com
     * horário inventado em cima de dado quebrado.
     * ------------------------------------------------------------------ */
    batidas: function (jornada, colaboradorId, data, opcoes) {
      var j = jornada || {}, o = opcoes || {};
      var e0 = this.hhmmParaMin(j.entrada), a0 = this.hhmmParaMin(j.almoco);
      var r0 = this.hhmmParaMin(j.retorno), s0 = this.hhmmParaMin(j.saida);
      if (e0 == null || a0 == null || r0 == null || s0 == null) return {
        entrada: j.entrada || "", almoco: j.almoco || "", retorno: j.retorno || "", saida: j.saida || ""
      };
      if (o.variar === false) return { entrada: j.entrada, almoco: j.almoco, retorno: j.retorno, saida: j.saida };

      /* amplitude em minutos — configurável, mas com teto: passar de ~15 min
         deixa de ser variação de ponto e vira outra jornada. */
      var amp = Math.max(1, Math.min(15, Math.round(Number(o.amplitude) || 7)));
      var sem = this.semente(String(colaboradorId || "") + "|" + String(data || ""));

      /* Entrada: quase todo mundo chega um pouco antes; poucos, um pouco
         depois. Por isso a faixa é assimétrica para o lado do adiantado. */
      var dE = this._desvio(sem, 1, -amp, Math.ceil(amp / 2));
      var entrada = e0 + dE;

      /* Saída para o almoço: varia livre nos dois sentidos. */
      var dA = this._desvio(sem, 2, -amp, amp);
      var almoco = a0 + dA;

      /* Retorno: o intervalo pode ALONGAR, nunca encurtar. */
      var intervaloNominal = r0 - a0;
      var intervaloMin = Math.max(60, intervaloNominal);          /* CLT art. 71 */
      var dR = this._desvio(sem, 3, 0, amp);                      /* só para frente */
      var retorno = almoco + Math.max(intervaloMin, intervaloNominal + dR);

      /* Saída: fecha o dia mantendo o total trabalhado igual ao nominal,
         com no máximo alguns minutos de folga. Assim a variação não cria
         hora extra nem desconto que ninguém combinou. */
      var trabalhoNominal = (a0 - e0) + (s0 - r0);
      var dS = this._desvio(sem, 4, -Math.ceil(amp / 2), Math.ceil(amp / 2));
      var trabalhado = (almoco - entrada);
      var saida = retorno + (trabalhoNominal - trabalhado) + dS;

      /* Ordem cronológica é inegociável: nenhuma batida pode ficar antes da
         anterior, mesmo com jornada cadastrada estranha. */
      if (almoco <= entrada) almoco = entrada + 1;
      if (retorno < almoco + intervaloMin) retorno = almoco + intervaloMin;
      if (saida <= retorno) saida = retorno + 1;

      return {
        entrada: this.minParaHhmm(entrada),
        almoco: this.minParaHhmm(almoco),
        retorno: this.minParaHhmm(retorno),
        saida: this.minParaHhmm(saida)
      };
    },

    /* Minutos efetivamente trabalhados no dia, a partir das batidas já
       variadas — para conferir que a variação não inventou jornada. */
    minutosTrabalhados: function (b) {
      var e = this.hhmmParaMin(b.entrada), a = this.hhmmParaMin(b.almoco);
      var r = this.hhmmParaMin(b.retorno), s = this.hhmmParaMin(b.saida);
      if (e == null || a == null || r == null || s == null) return 0;
      return (a - e) + (s - r);
    }
  };

  if (global) global.Ponto = Ponto;
  if (typeof module !== "undefined" && module.exports) module.exports = Ponto;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
