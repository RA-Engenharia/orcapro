/* =====================================================================
 * woodframeui.js — a FIAÇÃO FINA do Wood Frame no BIM (20/11/2026).
 * O motor é o js/woodframequadro.js; aqui só mora o botão do RAIO-X DO QUADRO.
 *
 * ONDE O USUÁRIO CLICA
 *   · TIPO DE PAREDE: no seletor "Tipo" da parede (barra de opções e Propriedades) aparecem
 *     os tipos "Wood Frame · …" (js/alvtipos.js). Espaçamento dos montantes, OSB e canto
 *     ficam em Propriedades de tipo (Editar tipo › Construção › "Wood Frame: …").
 *   · QUADRO NA PLANTA: o nível de detalhe da vista (Fino/Alto = camadas + montantes + cota
 *     do espaçamento; Médio = só as camadas; Baixo = só o contorno).
 *   · RAIO-X DO QUADRO: Vista › Exibir › "Quadro de madeira" — a casca da parede some no 3D e
 *     ficam as guias, montantes, ombreiras, vergas, cripples e bloqueadores (sem as placas).
 *     Clicar de novo volta a parede inteira.
 * O estado é só da sessão (window.WoodFrameModo); o 3D lê no rebuild (js/bim.js).
 * ===================================================================== */
(function (global) {
  "use strict";

  function B() { return global.BIM; }
  function status(msg) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(msg); else if (B() && B().hint) B().hint(msg); } catch (e) { /* sem barra de status */ } }

  var WoodFrameUI = {
    modo: function () { return global.WoodFrameModo === "quadro" ? "quadro" : "normal"; },
    definirModo: function (m) {
      global.WoodFrameModo = m === "quadro" ? "quadro" : "normal";
      try { if (global.BimRibbon && global.BimRibbon.setAtivo) global.BimRibbon.setAtivo("wf-quadro", global.WoodFrameModo === "quadro"); } catch (e) { /* fita ausente */ }
      try { if (B() && B().editarReconstruir) B().editarReconstruir(); } catch (eR) { /* sem cena */ }
      return global.WoodFrameModo;
    },
    alternar: function (ligado) {
      var novo = ligado === true ? "quadro" : (ligado === false ? "normal" : (this.modo() === "quadro" ? "normal" : "quadro"));
      this.definirModo(novo);
      status(novo === "quadro" ? "Raio-X do quadro: só a madeira (guias, montantes, ombreiras, vergas, bloqueadores); as placas somem." : "Parede inteira de novo (camadas e placas).");
      return true;
    },
    registrar: function (reg) {
      var self = this, R = global.BimRibbon;
      if (!R || !R.acrescentar) return false;
      R.acrescentar("vista", "Vista", "Exibir", [
        { id: "wf-quadro", rotulo: "Quadro de\nmadeira", icone: "camadas", tipo: "alterna", dica: "Raio-X do Wood Frame: esconde a casca e as placas das paredes de quadro de madeira e mostra só as guias, os montantes, as ombreiras, as vergas, os cripples e os bloqueadores. Clique de novo para voltar." }
      ]);
      reg["wf-quadro"] = function (e) { return self.alternar(e && e.ligado !== undefined ? !!e.ligado : undefined); };
      return true;
    }
  };

  global.WoodFrameUI = WoodFrameUI;
  if (typeof module !== "undefined" && module.exports) module.exports = WoodFrameUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
