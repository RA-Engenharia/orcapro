/* =====================================================================
 * bimtrenamapa.js — A TRENA SOBRE O MAPA (motor puro)
 *
 * O pedido (04/10/2026): «a trena do BIM (distância, área e ângulo) precisa
 * medir também sobre a volumetria dos mapas, não só sobre as peças do
 * projeto. Hoje, medindo uma área pelo mapa, a ferramenta só aceita clique
 * onde há volumetria de projeto.»
 *
 * O ponto da trena passa a aceitar, além das peças do projeto:
 *   · os blocos do 3D fotorrealista do Google (grupo "google-3d");
 *   · a volumetria do entorno aceita no plano (grupo da planta: "entorno");
 *   · o terreno e o levantamento ("local-relevo", "local-levantamento",
 *     "local-gramado") e a imagem de satélite no chão ("local-imagem");
 *   · a imagem da planta do projeto ("planta-imagem");
 *   · e, com algum mapa na tela, o plano do chão da obra como último recurso.
 *
 * ⚠ O PROJETO TEM PRIORIDADE QUANDO ESTÁ NA FRENTE (`escolher`). A tolerância
 * (2 cm, ou 0,2% da distância) é a favor do projeto: a laje assentada no chão
 * do Google não pode perder o clique para o chão por um triz de z-fighting.
 * E o encaixe (canto, meio, aresta) de uma peça do projeto sempre vence —
 * quem mira um canto quer o canto, não o mapa atrás dele (ver bim.js mirarEm).
 *
 * ⚠ HONESTIDADE: a cota tomada no mapa DIZ que foi tomada no mapa
 * (`rotulo`), e o aviso diz a precisão — o 3D do Google erra em METROS
 * (malha fotogramétrica de satélite/avião); a volumetria do entorno é a que
 * o agente aceitou, não um levantamento. O número é certo NA ESCALA do
 * mundo: o Google entra pela matriz ECEF → motor (js/icargeo.js
 * matrizEcefMotor), que é uma rotação + translação — não muda distância.
 * ===================================================================== */
(function (global) {
  "use strict";

  var NOMES = {
    google: "o 3D do Google", entorno: "a volumetria do entorno", terreno: "o terreno",
    satelite: "a imagem de satélite", planta: "a planta do projeto", chao: "o plano do chão"
  };

  /* o nome do objeto (e dos pais, do mais perto ao mais longe) diz de que
     camada do mapa ele é; nada reconhecido = não é mapa (o raio passa) */
  function fonteDe(nomes) {
    var l = Array.isArray(nomes) ? nomes : [nomes];
    for (var i = 0; i < l.length; i++) {
      var n = String(l[i] == null ? "" : l[i]);
      if (!n) continue;
      if (n === "google-3d") return "google";
      if (n === "entorno") return "entorno";
      if (n === "local-relevo" || n === "local-levantamento" || n === "local-gramado") return "terreno";
      if (n === "local-imagem") return "satelite";
      if (n === "planta-imagem") return "planta";
    }
    return "";
  }

  /* quem fica com o clique: 'projeto', 'mapa' ou '' (nada sob o cursor) */
  function escolher(dProjeto, dMapa) {
    var temP = dProjeto != null && isFinite(+dProjeto), temM = dMapa != null && isFinite(+dMapa);
    if (temP && (!temM || +dProjeto <= +dMapa + Math.max(0.02, 0.002 * +dMapa))) return "projeto";
    if (temM) return "mapa";
    return "";
  }

  function unicas(l) { var o = [], v = {}; (l || []).forEach(function (x) { if (x && !v[x]) { v[x] = 1; o.push(x); } }); return o; }

  /* o texto da cota: o número de sempre + a marca de que veio do mapa */
  function rotulo(base, fontes) {
    var f = unicas(fontes);
    return String(base) + (f.length ? " · sobre o mapa" : "");
  }

  /* o aviso de precisão — dito uma vez, quando o ponto cai no mapa */
  function aviso(fontes) {
    var f = unicas(fontes);
    if (!f.length) return "";
    if (f.indexOf("google") >= 0) return "Medido sobre o 3D do Google: a precisão dele é de METROS (malha de foto aérea) — serve para estimar, não para executar.";
    if (f.indexOf("chao") >= 0 && f.length === 1) return "Medido sobre o plano do chão da obra (não há malha do mapa neste ponto).";
    return "Medido sobre " + f.map(function (x) { return NOMES[x] || x; }).join(" e ") + ": a precisão é a do mapa, não a do projeto.";
  }

  function nome(fonte) { return NOMES[fonte] || ""; }

  var BimTrenaMapa = { NOMES: NOMES, fonteDe: fonteDe, escolher: escolher, rotulo: rotulo, aviso: aviso, nome: nome };
  global.BimTrenaMapa = BimTrenaMapa;
  if (typeof module !== "undefined" && module.exports) module.exports = BimTrenaMapa;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
