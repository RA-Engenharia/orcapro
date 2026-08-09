/* =====================================================================
 * audiocota.js — QUEM PODE MANDAR ÁUDIO, E QUANTO
 *
 * O diário por WhatsApp aceita texto desde sempre. O áudio custa dinheiro
 * de verdade (transcrição por API), então ele tem dono e tem teto.
 *
 * ⚠ O CUSTO NÃO É O RISCO — O ABUSO É.
 * A transcrição sai por centavos: um diário falado de 45 segundos custa
 * uma fração de centavo. Dez obras mandando todo dia dão alguns centavos
 * por mês. Montar cobrança por consumo para administrar isso custaria
 * mais que o serviço.
 * O que pode doer é o descontrole: alguém mandando duas horas de áudio por
 * dia, um laço reenviando o mesmo arquivo, ou um número vazado sendo usado
 * por gente que não é da obra. Por isso o teto é em MINUTOS por mês, e ele
 * existe para proteger, não para cobrar.
 *
 * ⚠ E ESTOURAR O TETO NÃO PODE SER SILÊNCIO.
 * O mestre gravou o dia de trabalho. Se o áudio for descartado sem
 * resposta, ele acha que registrou. Ao estourar, o robô diz o que houve e
 * o que fazer — mandar por texto, que não tem teto.
 * ===================================================================== */
(function (global) {
  "use strict";

  function texto(s) { return String(s == null ? "" : s).trim(); }
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }

  /* -------------------------------------------------------------------
   * QUEM TEM DIREITO
   *
   * Sai do `tier` que a própria licença carrega — não de uma lista à
   * parte que alguém precisa manter em dia. Planos completos já vêm com o
   * áudio; o plano base pode contratar à parte.
   *
   * `avulso`: { ate: <timestamp> } — o adicional comprado, com validade.
   * ----------------------------------------------------------------- */
  var TIERS_COM_AUDIO = ["plus", "bim"];
  var TETO_PADRAO = 300;                 // minutos por mês, ~10× o uso normal

  function direito(d) {
    d = d || {};
    var tier = texto(d.tier).toLowerCase();
    var agora = num(d.agora) || 0;

    if (TIERS_COM_AUDIO.indexOf(tier) > -1) {
      return { ok: true, origem: "plano", tier: tier, teto: num(d.teto) || TETO_PADRAO };
    }
    var av = d.avulso;
    if (av && num(av.ate) > 0) {
      /* ⚠ adicional VENCIDO não vale. Sem esta checagem, quem contratou um
         mês teria áudio para sempre — e o custo seguiria correndo sem
         ninguém pagando. */
      if (agora && num(av.ate) < agora) {
        return { ok: false, motivo: "avulso-vencido", venceuEm: num(av.ate) };
      }
      return { ok: true, origem: "avulso", tier: tier, teto: num(av.teto) || num(d.teto) || TETO_PADRAO,
               ate: num(av.ate) };
    }
    return { ok: false, motivo: "sem-direito", tier: tier };
  }

  /* -------------------------------------------------------------------
   * QUANTO JÁ FOI USADO NO MÊS
   *
   * `uso`: { "AAAA-MM": segundos }. Guardar em SEGUNDOS e arredondar só na
   * exibição — somar minutos arredondados faz 40 áudios de 30 segundos
   * virarem 40 minutos em vez de 20.
   * ----------------------------------------------------------------- */
  function mesDe(dataISO) { return texto(dataISO).slice(0, 7); }

  function saldo(d) {
    d = d || {};
    var dir = direito(d);
    var teto = dir.ok ? dir.teto : 0;
    var mes = mesDe(d.hoje);
    var usadoSeg = num((d.uso || {})[mes]);
    var usadoMin = Math.round((usadoSeg / 60) * 10) / 10;
    var restaMin = Math.max(0, Math.round((teto - usadoMin) * 10) / 10);
    return {
      temDireito: dir.ok, origem: dir.origem || "", motivo: dir.motivo || "",
      teto: teto, usado: usadoMin, resta: restaMin, mes: mes,
      pct: teto > 0 ? Math.round((usadoMin / teto) * 1000) / 10 : 0
    };
  }

  /* -------------------------------------------------------------------
   * PODE TRANSCREVER ESTE ÁUDIO?
   *
   * `segundos`: duração do áudio que chegou.
   * ----------------------------------------------------------------- */
  function podeTranscrever(d) {
    d = d || {};
    var s = saldo(d);
    if (!s.temDireito) {
      return { ok: false, motivo: s.motivo || "sem-direito", saldo: s };
    }
    var dur = num(d.segundos);
    /* ⚠ ÁUDIO LONGO DEMAIS É RECUSADO ANTES DE GASTAR. Um diário falado
       tem 30 a 90 segundos. Dez minutos não é diário: é alguém mandando
       outra coisa, ou engano. Recusar antes evita pagar por lixo. */
    var tetoUm = num(d.tetoPorAudio) || 300;      // 5 minutos por áudio
    if (dur > tetoUm) {
      return { ok: false, motivo: "audio-longo", limite: tetoUm, duracao: dur, saldo: s };
    }
    if (s.resta <= 0) return { ok: false, motivo: "cota-esgotada", saldo: s };
    /* deixa passar o áudio que cabe no que resta; o que passar do teto é
       cortado no mês seguinte, não no meio de uma frase */
    return { ok: true, saldo: s };
  }

  /* o que dizer ao mestre — texto pronto, porque quem responde é o robô */
  function recado(res) {
    var r = res || {};
    if (r.ok) return "";
    switch (r.motivo) {
      case "sem-direito":
        return "O diário por áudio não está incluído no seu plano. Manda por texto que eu registro na hora — " +
               "ou fale com a RA Engenharia para ligar o áudio.";
      case "avulso-vencido":
        return "O adicional de áudio venceu. Manda por texto que eu registro — o texto não tem limite.";
      case "cota-esgotada":
        return "O tempo de áudio deste mês acabou (" + (r.saldo && r.saldo.teto) + " minutos). " +
               "Manda por texto que eu registro na hora, sem limite.";
      case "audio-longo":
        return "Esse áudio é longo demais para um diário (mais de " + Math.round((r.limite || 300) / 60) +
               " minutos). Grava um resumo do dia, ou manda por texto.";
      default:
        return "Não consegui usar o áudio agora. Manda por texto, por favor.";
    }
  }

  /* soma o consumo depois de transcrever. Devolve o `uso` novo — quem
     grava é o servidor, e devolver em vez de mutar deixa o cálculo
     testável sem inventar estado. */
  function somar(uso, hoje, segundos) {
    var u = {};
    Object.keys(uso || {}).forEach(function (k) { u[k] = num(uso[k]); });
    var mes = mesDe(hoje);
    if (!mes) return u;
    u[mes] = num(u[mes]) + Math.max(0, num(segundos));
    /* guarda 13 meses e joga fora o resto: é registro de consumo, não
       histórico — e arquivo que só cresce vira o problema que veio evitar */
    var meses = Object.keys(u).sort();
    while (meses.length > 13) { delete u[meses.shift()]; }
    return u;
  }

  var AudioCota = {
    TIERS_COM_AUDIO: TIERS_COM_AUDIO, TETO_PADRAO: TETO_PADRAO,
    direito: direito, saldo: saldo, podeTranscrever: podeTranscrever,
    recado: recado, somar: somar, mesDe: mesDe
  };
  global.AudioCota = AudioCota;
  if (typeof module !== "undefined" && module.exports) module.exports = AudioCota;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
