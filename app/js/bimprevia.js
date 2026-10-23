/* =====================================================================
 * bimprevia.js — o MODELADOR BIM (fases B2–B8 do PLANO-BIM-MODELADOR.md).
 * Foi prévia (`?previa=modelador`) de 08 a 09/10/2026; desde a publicação de
 * 09/10/2026 é PADRÃO PARA TODOS (decisão do Rogério: "sobe aberta para
 * todos", até a cobrança da Modelagem entrar na versão seguinte).
 *
 * Desligar NESTE aparelho: `?previa=modelador-desligar` grava a chave OFF;
 * `?previa=modelador` religa. A chave antiga da prévia
 * (`orcapro:tela:bim-modelador:v1`) só desliga quando grava
 * {"modelador":false} (é assim que as e2e testam o modelador desligado).
 * Todo comando novo do modelador pergunta AQUI se aparece — um lugar só para
 * ligar e desligar.
 *
 * DESDE A COBRANÇA DO ORÇAPRO MODELA (09/10/2026): "o modelador aparece?" =
 * o Modela libera alguma disciplina (compra, vitalícia, teste de 7 dias ou
 * ?demo=1 — a regra mora em js/modela.js) E este aparelho não desligou.
 * `disciplina(id)` responde por disciplina (civil, estrutura, hidraulica,
 * eletrica, metalica, marcenaria) para as abas do modelador.
 * Sem o js/modela.js carregado vale o comportamento de antes (aparece).
 * ===================================================================== */
(function (global) {
  "use strict";
  var CHAVE = "orcapro:tela:bim-modelador:v1";
  var OFF = "orcapro:tela:bim-modelador:off";
  /* HIDROSSANITÁRIO e CLIMATIZAÇÃO: liberado para todos em 18/10/2026 pelo Rogério; preço depois.
     (Antes, 17/10, só valia com a prévia `?previa=hidro`.) `BimPrevia.hidro()` é verdadeiro sempre que o modelador está ligado.
     A única saída é `?previa=hidro-desligar`: grava a chave de desligado neste aparelho e o BIM volta a ficar como no master
     (o grupo "hidro" do index.html nem é baixado); `?previa=hidro` apaga essa chave. */
  var HIDRO_OFF = "orcapro:tela:bim-hidro:off";
  /* a URL é lida na CARGA: o App._previaDaUrl limpa o `?previa=` do endereço logo depois */
  try {
    var q = (global.location && global.location.search) || "";
    if (/[?&]previa=[^&]*modelador-desligar/i.test(q)) global.localStorage.setItem(OFF, "1");
    else if (/[?&]previa=[^&]*modelador(?!-desligar)/i.test(q)) global.localStorage.removeItem(OFF);
    if (/[?&]previa=[^&]*hidro-desligar/i.test(q)) global.localStorage.setItem(HIDRO_OFF, "1");
    else if (/[?&]previa=[^&]*hidro(?!-desligar)/i.test(q)) global.localStorage.removeItem(HIDRO_OFF);
  } catch (e) {}
  var BimPrevia = {
    CHAVE: CHAVE,
    OFF: OFF,
    /* armazenamento bloqueado (aba anônima) não pode esconder o modelador: sem como ler a escolha, vale o padrão */
    /* o aparelho desligou? OFF = "1", ou a chave antiga dizendo {"modelador":false} de propósito (as e2e desligam assim) */
    _aparelho: function () {
      try {
        if (global.localStorage.getItem(OFF) === "1") return false;
        var o = JSON.parse(global.localStorage.getItem(CHAVE) || "null");
        return !(o && o.modelador === false);
      } catch (e) { return true; }
    },
    _modela: function () { return (global.Modela && typeof global.Modela.status === "function") ? global.Modela : null; },
    /* ⚠ O MÓDULO MARMORARIA TAMBÉM ABRE O MODELADOR (20/10/2026): quem comprou só ele (sem nenhuma disciplina do Modela,
       com o teste de 7 dias já encerrado) tem `status().liberado` falso — sem esta linha o marmorista pagaria e o BIM
       abriria sem a fita de modelar. A área dele é a enxuta (js/bimdisciplinas.js, disciplina "marmoraria"). */
    _marm: function () { try { var MM = global.MarmModulo; return !!(MM && MM.liberado && MM.liberado()); } catch (e) { return false; } },
    modelador: function () {
      if (!BimPrevia._aparelho()) return false;
      var M = BimPrevia._modela(); if (!M) return true;
      /* teste de 1 hora vencido (js/testemodulo.js): o modelador CONTINUA aparecendo — o trabalho fica visível e
         cada comando pede a compra (BimCmd.executar → TesteModulo.guardaComando) */
      try { var sM = M.status(); return !!sM.liberado || !!sM.visivel1h || BimPrevia._marm(); } catch (e) { return true; }
    },
    HIDRO_OFF: HIDRO_OFF,
    /* o hidrossanitário/climatização aparece? = modelador ligado E este aparelho não o desligou (`?previa=hidro-desligar`).
       Armazenamento bloqueado: sem como ler a escolha, vale o padrão (aparece). */
    hidro: function () {
      if (!BimPrevia.modelador()) return false;
      try { return global.localStorage.getItem(HIDRO_OFF) !== "1"; } catch (e) { return true; }
    },
    disciplina: function (id) {
      if (!BimPrevia._aparelho()) return false;
      if (id === "marmoraria" && global.MarmModulo) return BimPrevia._marm();
      var M = BimPrevia._modela(); if (!M) return true;
      try { return !!M.tem(id); } catch (e) { return true; }
    }
  };
  global.BimPrevia = BimPrevia;
  if (typeof module !== "undefined" && module.exports) module.exports = BimPrevia;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
