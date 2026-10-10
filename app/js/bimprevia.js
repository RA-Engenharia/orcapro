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
  /* a URL é lida na CARGA: o App._previaDaUrl limpa o `?previa=` do endereço logo depois */
  try {
    var q = (global.location && global.location.search) || "";
    if (/[?&]previa=[^&]*modelador-desligar/i.test(q)) global.localStorage.setItem(OFF, "1");
    else if (/[?&]previa=[^&]*modelador(?!-desligar)/i.test(q)) global.localStorage.removeItem(OFF);
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
    modelador: function () {
      if (!BimPrevia._aparelho()) return false;
      var M = BimPrevia._modela(); if (!M) return true;
      try { return !!M.status().liberado; } catch (e) { return true; }
    },
    disciplina: function (id) {
      if (!BimPrevia._aparelho()) return false;
      var M = BimPrevia._modela(); if (!M) return true;
      try { return !!M.tem(id); } catch (e) { return true; }
    }
  };
  global.BimPrevia = BimPrevia;
  if (typeof module !== "undefined" && module.exports) module.exports = BimPrevia;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
