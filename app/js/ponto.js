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
    /* ⚠ `opcoes.variar` É OPT-IN: só varia quem pedir `{ variar: true }`, e
     *   ninguém no produto pede. Quem chamar sem opção nenhuma recebe a jornada
     *   CRAVADA.
     *
     *   A inversão é de 01/09/2026 e tem motivo. Até então a chave era opt-OUT
     *   (`if (o.variar === false)`), então uma chamada nova que esquecesse a
     *   opção voltava a FABRICAR horário — em silêncio, sem teste vermelho,
     *   sem nada na tela. Pior: reaproveitar `_pontoJornada()` como objeto de
     *   opções bastava para ligar a variação, porque `jor.variar` é `undefined`
     *   e `undefined === false` é falso. Uma regra que só existe em comentário
     *   é obedecida até alguém ter pressa; agora esquecer falha para o lado
     *   seguro.
     *
     *   O QUE A VARIAÇÃO ERA. Ela existia para o impresso "se parecer com
     *   obra" — a nota histórica no topo deste arquivo chega a dizer que sem
     *   ela o padrão seria "denunciado". Ou seja: era um gerador de registro
     *   trabalhista verossímil de uma jornada que NINGUÉM marcou, impresso sob
     *   o nome ESPELHO DE PONTO e assinado pelo empregado. Em reclamatória isso
     *   é prova contra a construtora e contra quem forneceu o sistema. O
     *   documento passou a se chamar DEMONSTRATIVO DE FREQUÊNCIA e a declarar
     *   que o horário é a jornada CONTRATUAL.
     *
     *   ⚠ Não religue. Quem precisa de horário que varia precisa de horário
     *     VERDADEIRO: é para isso que existe a entidade `batidas` e a tela
     *     "Registrar batidas" — alguém digita o que a pessoa marcou. O caminho
     *     `variar === true` só continua aqui porque tools/test-ponto.js o
     *     exercita; nenhuma tela o alcança, e tools/test-batidas-reais.js
     *     reprova se alguma passar a alcançar. */
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

      if (o.variar !== true) {
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
      if (o.variar === true) {
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
    },

    /* ==================================================================
     * BATIDAS REAIS — o horário que a PESSOA marcou
     *
     * ⚠ NÃO CONFUNDIR com `batidas()` acima. Aquela DERIVA horário da
     *   jornada contratual: é jornada nominal impressa, e desde 17/08/2026
     *   sem variação nenhuma, pelo motivo escrito no topo deste arquivo.
     *   O que vem daqui para baixo é FATO: alguém transcreveu o controle de
     *   jornada de papel para o sistema. Por isso nada aqui inventa horário
     *   — quando o dado não permite afirmar, a resposta é `null` e o
     *   documento fica em branco naquele campo. Número inventado em papel
     *   assinado pelo empregado é pior que campo vazio.
     * ================================================================== */

    /* Id determinístico. Dois aparelhos offline que registrem o MESMO dia da
       MESMA pessoa produzem o MESMO id, e o merge da nuvem (união por id)
       resolve sem duplicar. Com id sorteado os dois sobreviveriam e o
       impresso escolheria um deles arbitrariamente: o horário do papel
       viraria loteria, e ninguém perceberia porque os dois "existem".
       ⚠ Só id interno entra aqui. Nunca CPF, nome ou matrícula: material de
         cliente não pode existir em js/ (três pipelines copiam a pasta, um
         deles para uma URL pública), e id derivado de chave natural colide
         entre empresas que dividem o mesmo balde na nuvem — a lápide de uma
         apagaria o registro legítimo da outra. */
    idBatida: function (colaboradorId, data) {
      var c = String(colaboradorId == null ? "" : colaboradorId);
      var d = String(data == null ? "" : data).split("-").join("");
      if (!c || d.length !== 8) return "";
      return "bat_" + c + "_" + d;
    },

    /* Índice data -> registro, de UM colaborador em UM mês.
       Object.create(null) e não {}: uma data nunca deve esbarrar em
       "constructor" ou "__proto__" herdados do Object e devolver função no
       lugar de registro. */
    indexarBatidas: function (arr, colaboradorId, mes) {
      var ix = Object.create(null);
      var L = (arr && arr.length) ? arr : [];
      var cid = String(colaboradorId == null ? "" : colaboradorId);
      var m = String(mes == null ? "" : mes);
      for (var i = 0; i < L.length; i++) {
        var b = L[i];
        if (!b || String(b.colaboradorId) !== cid) continue;
        var d = String(b.data || "");
        if (d.slice(0, 7) !== m) continue;
        ix[d] = b;
      }
      return ix;
    },

    /* Confere a coerência de uma batida. NÃO recusa: descreve.
     *
     * ⚠ Só ILEGIVEL bloqueia a gravação. Fora de ordem e intervalo curto
     *   AVISAM e gravam assim mesmo — e isso é decisão de produto, não
     *   descuido. Intervalo de 30 min existe (acordo coletivo), jornada que
     *   atravessa a meia-noite existe, e o vigia que entra 22:00 e sai 06:00
     *   existe. Recusar o fato faz a pessoa digitar um horário que fecha a
     *   conta em vez do que aconteceu — que é o defeito de 17/08/2026
     *   voltando pela porta da frente, só que digitado à mão.
     *   "Toda trava precisa de porta" (skill dinheiro §6).
     *
     * Devolve { vazia, completa, bloqueia, codigos[], avisos[] }.
     */
    conferirBatida: function (b) {
      var o = b || {}, codigos = [], avisos = [];
      var campos = [o.entrada, o.almoco, o.retorno, o.saida];
      var preenchidos = 0, ilegivel = false, i, t;
      for (i = 0; i < 4; i++) {
        t = String(campos[i] == null ? "" : campos[i]).trim();
        if (!t) continue;
        preenchidos++;
        if (this.hhmmParaMin(t) === null) ilegivel = true;
      }
      if (!preenchidos) return { vazia: true, completa: false, bloqueia: false, codigos: [], avisos: [] };
      if (ilegivel) {
        return {
          vazia: false, completa: false, bloqueia: true, codigos: ["ILEGIVEL"],
          avisos: ["Há horário que não está em HH:MM."]
        };
      }
      var e = this.hhmmParaMin(o.entrada), a = this.hhmmParaMin(o.almoco);
      var r = this.hhmmParaMin(o.retorno), s = this.hhmmParaMin(o.saida);
      var temIntervalo = (a !== null && r !== null);
      var meioPelaMetade = ((a === null) !== (r === null));
      var completa = (e !== null && s !== null && !meioPelaMetade);

      if (meioPelaMetade) {
        codigos.push("INCOMPLETA");
        avisos.push("Saída e retorno do almoço andam juntos: informe os dois ou nenhum.");
      } else if (!completa) {
        codigos.push("INCOMPLETA");
        avisos.push("Falta entrada ou saída — o dia não fecha.");
      }
      if (completa) {
        var seq = temIntervalo ? [e, a, r, s] : [e, s];
        for (i = 1; i < seq.length; i++) {
          if (seq[i] <= seq[i - 1]) {
            codigos.push("FORA_DE_ORDEM");
            avisos.push("Os horários não estão em ordem crescente.");
            break;
          }
        }
        /* CLT art. 71: jornada acima de 6h pede intervalo mínimo de 1 hora.
           Aviso, nunca trava — acordo coletivo reduz para 30 min. */
        if (temIntervalo && codigos.indexOf("FORA_DE_ORDEM") < 0 && (r - a) < 60) {
          codigos.push("INTERVALO_CURTO");
          avisos.push("Intervalo de " + (r - a) + " min — abaixo da 1 hora do art. 71 da CLT.");
        }
      }
      return {
        vazia: false, completa: completa, bloqueia: false,
        codigos: codigos, avisos: avisos
      };
    },

    /* Minutos efetivamente trabalhados segundo a batida DIGITADA.
       Devolve null quando não dá para afirmar (incompleta, ilegível ou fora
       de ordem). Aceita o dia sem intervalo registrado — meia jornada e
       serviço curto existem, e exigir almoço criaria o campo obrigatório que
       leva a pessoa a preencher qualquer coisa.
       ⚠ Não é a mesma conta de minutosTrabalhados(): aquela devolve 0 no dado
         quebrado, porque servia para CONFERIR a jornada derivada. Aqui 0 e
         "não sei" são coisas diferentes, e confundi-las poria zero hora
         trabalhada num dia em que a pessoa trabalhou. */
    minutosDaBatida: function (b) {
      var o = b || {}, c = this.conferirBatida(o);
      if (c.vazia || !c.completa || c.bloqueia) return null;
      if (c.codigos.indexOf("FORA_DE_ORDEM") >= 0) return null;
      var e = this.hhmmParaMin(o.entrada), s = this.hhmmParaMin(o.saida);
      var a = this.hhmmParaMin(o.almoco), r = this.hhmmParaMin(o.retorno);
      if (a === null || r === null) return s - e;
      return (a - e) + (s - r);
    },

    /* Diferença, em minutos, entre o que a batida mostra e a jornada nominal.
     * Positivo = trabalhou além; negativo = trabalhou menos.
     *
     * ⚠ SUGESTÃO DE TELA, e só. Isto NÃO alimenta o impresso, NÃO vira R$ e
     *   NÃO cria lançamento. Quem paga hora extra é o que foi DECLARADO na
     *   entidade horas_extras, com data e motivo, por uma pessoa. Se este
     *   número virasse lançamento sozinho, o mesmo tempo passaria a existir
     *   em dois donos — e a skill dinheiro §2 é explícita: nunca ligar
     *   lançamento por semelhança de data e valor, só por carimbo. */
    extraDaBatida: function (b, jornada) {
      var min = this.minutosDaBatida(b);
      if (min === null) return null;
      var nominal = this.minutosTrabalhados(jornada || {});
      if (!nominal) return null;
      return min - nominal;
    },

    /* Adapta o registro para a linha do impresso, sem tocar em horário.
       Devolve null quando não há o que imprimir — é o gatilho de "este dia
       não tem batida", que faz o documento cair na jornada contratual. */
    batidaParaLinha: function (b) {
      var o = b || {};
      var e = String(o.entrada || "").trim(), a = String(o.almoco || "").trim();
      var r = String(o.retorno || "").trim(), s = String(o.saida || "").trim();
      if (!e && !s) return null;
      return { entrada: e, almoco: a, retorno: r, saida: s, obs: String(o.obs || ""), real: true };
    }
  };

  if (global) global.Ponto = Ponto;
  if (typeof module !== "undefined" && module.exports) module.exports = Ponto;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
