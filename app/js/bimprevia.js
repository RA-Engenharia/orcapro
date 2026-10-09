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
 * ligar e desligar (e, na próxima versão, para a licença da Modelagem).
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
    modelador: function () {
      try {
        if (global.localStorage.getItem(OFF) === "1") return false;
        /* a chave antiga só desliga quando diz false de propósito (as e2e desligam assim) */
        var o = JSON.parse(global.localStorage.getItem(CHAVE) || "null");
        return !(o && o.modelador === false);
      } catch (e) { return true; }
    }
  };
  global.BimPrevia = BimPrevia;
  if (typeof module !== "undefined" && module.exports) module.exports = BimPrevia;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
