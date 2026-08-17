/* =====================================================================
 * ponto.js — batidas do cartão de ponto com variação de minutos
 *
 * ⚠ POR QUE ESTE MÓDULO MUDOU DE PAPEL (17/08/2026).
 * Ele nasceu para variar os minutos do impresso, porque repetir
 * 07:00/12:00/13:00/17:00 o mês inteiro "não parecia obra". Só que o
 * documento se chamava ESPELHO DE PONTO e era assinado pelo empregado:
 * o que o módulo fazia, na prática, era deixar verossímil um registro
 * de jornada que ninguém marcou. Em reclamação trabalhista isso é prova
 * contra a construtora — e contra quem forneceu o sistema.
 * O impresso virou DEMONSTRATIVO DE FREQUÊNCIA, declara que o horário é
 * a jornada CONTRATUAL, e a variação foi desligada em toda a aplicação.
 * O que continua valendo aqui: conversão de horário, cálculo de hora
 * extra e os totais do mês — isso é conta, não invenção.
*/
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

    /* Como o minParaHhmm, mas SEM dar a volta na meia-noite: 1470 min vira
       "24:30", não "00:30". Existe por causa da hora extra — uma saída que
       passa da meia-noite mostrada como 00:30 parece que a pessoa entrou de
       madrugada, e o cartão de ponto vira prova contra a empresa. */
    minParaHhmmExtenso: function (min) {
      var t = Math.round(Number(min) || 0);
      if (t < 0) t = 0;
      var h = Math.floor(t / 60), i = t % 60;
      return (h < 10 ? "0" : "") + h + ":" + (i < 10 ? "0" : "") + i;
    },

    /* Horas digitadas pelo usuário → minutos. Aceita "2", "2,5", "2.5" e
       "2:30". Devolve 0 no que não for hora — nunca NaN em documento. */
    horasParaMin: function (h) {
      if (h == null || h === "") return 0;
      if (typeof h === "number") return isFinite(h) ? Math.round(h * 60) : 0;
      var s = String(h).trim().replace(",", ".");
      var m = /^(\d{1,2}):([0-5]\d)$/.exec(s);
      if (m) return Number(m[1]) * 60 + Number(m[2]);
      var n = parseFloat(s);
      return isFinite(n) && n > 0 ? Math.round(n * 60) : 0;
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
    /* ⚠ `opcoes.variar` está DESCONTINUADO e o produto sempre passa `false`.
     * A variação existia para o impresso "se parecer com obra" — a nota
     * histórica abaixo chega a dizer que sem ela o padrão seria "denunciado".
     * Era, na prática, um gerador de registro trabalhista verossímil de uma
     * jornada que ninguém marcou, impresso sob o nome ESPELHO DE PONTO e
     * assinado pelo empregado. O documento passou a se chamar DEMONSTRATIVO DE
     * FREQUÊNCIA e a declarar que o horário é a jornada CONTRATUAL.
     * ⚠ Não religue: o caminho `variar !== false` só continua aqui porque as
     *   suítes o exercitam. Nenhuma tela o alcança. */
    batidas: function (jornada, colaboradorId, data, opcoes) {
      var j = jornada || {}, o = opcoes || {};
      var e0 = this.hhmmParaMin(j.entrada), a0 = this.hhmmParaMin(j.almoco);
      var r0 = this.hhmmParaMin(j.retorno), s0 = this.hhmmParaMin(j.saida);
      if (e0 == null || a0 == null || r0 == null || s0 == null) return {
        entrada: j.entrada || "", almoco: j.almoco || "", retorno: j.retorno || "", saida: j.saida || ""
      };
      /* HORA EXTRA DO DIA: minutos que ESTICAM a saída. Entra depois do
         fechamento da jornada nominal, de propósito — a variação de minutos
         existe para NÃO criar hora extra por acidente, então a extra tem que
         vir de um lançamento com data, nunca do sorteio. */
      var extra = Math.max(0, Math.round(Number(o.extraMin) || 0));

      if (o.variar === false) {
        return {
          entrada: j.entrada, almoco: j.almoco, retorno: j.retorno,
          saida: extra ? this.minParaHhmmExtenso(s0 + extra) : j.saida,
          extraMin: extra
        };
      }

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

      saida += extra; // a extra estica o dia; não é absorvida pelo ajuste acima

      return {
        entrada: this.minParaHhmm(entrada),
        almoco: this.minParaHhmm(almoco),
        retorno: this.minParaHhmm(retorno),
        saida: this.minParaHhmmExtenso(saida),
        extraMin: extra
      };
    },

    /* Dia SEM jornada (sábado, domingo, feriado) em que houve hora extra.
       O cartão precisa mostrar o horário de quem foi trabalhar naquele dia —
       deixar a linha vazia com "Folga" e um total de HE no rodapé é um cartão
       que se contradiz. Aqui a jornada não é a nominal: são só as horas extras,
       começando no horário de entrada cadastrado.
       Acima de 6 horas entra 1 hora de intervalo (CLT art. 71). */
    batidasExtraAvulsa: function (jornada, colaboradorId, data, extraMin, opcoes) {
      var j = jornada || {}, o = opcoes || {};
      var extra = Math.max(0, Math.round(Number(extraMin) || 0));
      if (!extra) return null;
      var e0 = this.hhmmParaMin(j.entrada);
      if (e0 == null) e0 = 7 * 60;
      var entrada = e0;
      if (o.variar !== false) {
        var sem = this.semente(String(colaboradorId || "") + "|" + String(data || "") + "|extra");
        var amp = Math.max(1, Math.min(15, Math.round(Number(o.amplitude) || 7)));
        entrada = e0 + this._desvio(sem, 1, -amp, Math.ceil(amp / 2));
      }
      if (extra <= 360) {
        return {
          entrada: this.minParaHhmm(entrada), almoco: "", retorno: "",
          saida: this.minParaHhmmExtenso(entrada + extra), extraMin: extra, avulsa: true
        };
      }
      var metade = Math.round(extra / 2);
      var almoco = entrada + metade;
      var retorno = almoco + 60;
      return {
        entrada: this.minParaHhmm(entrada),
        almoco: this.minParaHhmm(almoco),
        retorno: this.minParaHhmm(retorno),
        saida: this.minParaHhmmExtenso(retorno + (extra - metade)),
        extraMin: extra, avulsa: true
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
