/* =====================================================================
 * mor/roteiro.js — O ROTEIRO ESTENDIDO DO ORÇAMENTO GUIADO (F7 do MOR, ESPEC §8)
 *
 * Atrás de `?previa=motor`, o roteiro de 4 passos do OrcGuia (Base · Itens · BDI · Proposta) vira o de 6:
 *   ① Tipo de obra → ② Parâmetros/Documento → ③ Etapas & prévias → ④ Conferência → ⑤ BDI e condições → ⑥ Proposta
 * Os passos ⑤ e ⑥ são EXATAMENTE os do OrcGuia (mesma regra, mesmas pendências); a base de preço que falta entra
 * como pendência do passo ③ (sem base não há prévia com preço). Nada aqui grava ou soma preço: só LÊ e diz o que falta.
 *   passos(orc, ctx)  — mesma forma de OrcGuia.passos: [{id,rotulo,num,estado,resumo,pendencias,atual}]
 * Puro, ES5. Estados: ok · aviso · falta.
 * ===================================================================== */
(function (global) {
  "use strict";

  var C = global.MorCatalogo || (typeof require === "function" ? require("./catalogo.js") : null);
  var P = global.MorPorque || (typeof require === "function" ? require("./porque.js") : null);
  var G = function () { return global.OrcGuia || (typeof require === "function" ? (function () { try { return require("../orcguia.js"); } catch (e) { return null; } })() : null); };

  function arr(v) { return Object.prototype.toString.call(v) === "[object Array]" ? v : []; }
  function num(v) { v = Number(v); return isFinite(v) ? v : 0; }

  var ROTULOS = ["Tipo de obra", "Parâmetros / Documento", "Etapas & prévias", "Conferência", "BDI e condições", "Proposta"];

  function passos(orc, ctx) {
    var base = G().passos(orc, ctx || {});               /* [base, itens, bdi, proposta] — as regras de sempre */
    var pBase = base[0], pItens = base[1], pBdi = base[2], pProp = base[3];
    var mor = (orc && orc.mor) || {}, t = (ctx && ctx.totais) || {}, nItens = num(t.qtdItens);

    /* ① tipo de obra */
    var tp = mor.tipologia ? C.tipologia(mor.tipologia) : null;
    var p1 = tp ? { estado: "ok", resumo: tp.rotulo + " — " + tp.etapas.length + " etapas padrão.", pendencias: [] }
      : { estado: "falta", resumo: "Escolha o tipo de obra: as etapas padrão e os Serviços Preliminares já nascem.", pendencias: [{ texto: "Falta o tipo de obra.", alvo: "tipo" }] };

    /* ② parâmetros / documento */
    var area = num(mor.params && mor.params.area), doc = mor.documento || null, pend2 = [];
    if (!(area > 0)) pend2.push({ texto: "Falta a área da obra (sem ela não há quantidade por regra).", alvo: "parametros" });
    var p2 = { estado: pend2.length ? "falta" : "ok", pendencias: pend2 };
    if (doc && arr(doc.naoEntendidas).length) { p2.pendencias.push({ texto: arr(doc.naoEntendidas).length + " frase(s) do documento não foram entendidas — ensine ou ignore.", alvo: "parametros" }); if (p2.estado === "ok") p2.estado = "aviso"; }
    p2.resumo = area > 0 ? ("Área " + String(area).replace(".", ",") + " m²" + (doc ? " · lido de documento (" + (doc.origem || "texto") + ")" : "") + (p2.pendencias.length && area > 0 ? " · " + p2.pendencias[0].texto : "")) : pend2[0].texto;

    /* ③ etapas e prévias */
    var etapasDoTipo = tp ? tp.etapas.length : 0, comItem = 0;
    arr(orc && orc.etapas).forEach(function (e) { if (arr(e.itens).length && C.etapaPorNome(e.nome)) comItem++; });
    var pend3 = [];
    if (pBase.estado === "falta") pBase.pendencias.forEach(function (x) { pend3.push(x); });
    if (nItens < 1) pend3.push({ texto: "Nenhuma etapa tem item ainda: abra «Itens guiados» em cada etapa.", alvo: "etapas" });
    var p3 = { estado: pend3.length ? "falta" : "ok", pendencias: pend3, resumo: pend3.length ? pend3[0].texto : (comItem + " de " + etapasDoTipo + " etapas com itens · " + nItens + " item(ns).") };
    if (!pend3.length && pItens.estado === "falta") { p3.estado = "falta"; p3.pendencias = pItens.pendencias; p3.resumo = pItens.resumo; }

    /* ④ conferência */
    var aConferir = P.contar(orc), semPreco = arr(ctx && ctx.semPreco).length, pend4 = [];
    if (semPreco) pend4.push({ texto: semPreco + (semPreco === 1 ? " item sem preço." : " itens sem preço."), alvo: "preco" });
    if (aConferir) pend4.push({ texto: aConferir + (aConferir === 1 ? " linha do motor ainda espera o seu OK." : " linhas do motor ainda esperam o seu OK."), alvo: "conferencia" });
    var p4 = { estado: semPreco ? "falta" : (aConferir ? "aviso" : "ok"), pendencias: pend4, resumo: pend4.length ? pend4.map(function (p) { return p.texto.replace(/\.$/, ""); }).join("; ") + "." : (nItens ? "Tudo conferido." : "Nada a conferir ainda.") };
    if (!nItens) { p4.estado = "falta"; p4.resumo = "Nada a conferir ainda: gere os itens primeiro."; p4.pendencias = []; }

    var lista = [p1, p2, p3, p4, pBdi, pProp], atual = -1;
    lista.forEach(function (p, i) { if (atual < 0 && p.estado === "falta") atual = i; });
    if (atual < 0) atual = lista.length - 1;
    return lista.map(function (p, i) {
      var ids = ["tipo", "parametros", "etapas", "conferencia", "bdi", "proposta"];
      return { id: ids[i], rotulo: ROTULOS[i], num: i + 1, estado: p.estado, resumo: p.resumo, pendencias: p.pendencias, atual: i === atual };
    });
  }

  var Roteiro = { ROTULOS: ROTULOS, passos: passos };
  if (typeof module !== "undefined" && module.exports) module.exports = Roteiro;
  global.MorRoteiro = Roteiro;
})(typeof window !== "undefined" ? window : globalThis);
