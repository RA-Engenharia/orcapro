/* =====================================================================
 * vaoinverter.js — INVERTER E ESPELHAR PORTA/JANELA (20/10/2026) — motor puro
 *
 * Pedido do engenheiro: "ao clicar na porta na planta baixa, inverter a posição dela, do lado da abertura: tanto
 * inverter para o lado de dentro/fora quanto o espelhamento (a folha está para a direita e passa para a esquerda)."
 *
 * DOIS PARÂMETROS DE INSTÂNCIA, os mesmos em toda porta e janela hospedada da biblioteca RA (js/familiasra.js):
 *   · Abre_para_fora  (sim/não) — DENTRO/FORA: de que face da parede a folha abre (ou fica a folha de fora no correr);
 *   · Mao_direita     (sim/não) — MÃO: dobradiça à direita (ou folha de correr que corre para o outro lado). Espelha em X
 *                       local a folha, a maçaneta, as partes móveis (eixo e sentido) e o arco da planta.
 * Instância antiga, sem o parâmetro gravado, vale o padrão da família: para dentro, dobradiça à esquerda (= como era).
 *
 * O QUE ESTE MÓDULO FAZ (sem DOM):
 *   acoes(fam, av, inst) → quais inversões a peça aceita: [{ id: "fora"|"mao", param, valor (atual), rotulo, dica }]
 *     "mao" só se a GEOMETRIA da família espelha (alguma fórmula usa Sinal_mao) — cópia antiga de obra não espelha e
 *     não ganha a seta; porta de 2 folhas não tem mão.
 *   op(id, acao) → { op:"instancia", id, inst:{ [param]: !valor } } — UMA op: um Ctrl+Z desfaz.
 * ===================================================================== */
(function (global) {
  "use strict";

  function arr(a) { return Array.isArray(a) ? a : []; }
  function simnao(v) { return v === true || v === 1 || v === "1" || String(v).toLowerCase() === "true" || String(v).toLowerCase() === "sim"; }
  function tem(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
  function usa(fam, nome) {
    var txt = ""; try { txt = JSON.stringify(arr(fam && fam.solidos)); } catch (e) { txt = ""; }
    return txt.indexOf(nome) >= 0;
  }
  function valorAtual(param, av, inst) {
    if (tem(inst, param)) return simnao(inst[param]);
    return !!(av && av.valores && simnao(av.valores[param]));
  }

  var ROTULOS = {
    porta: { fora: "Inverter dentro/fora", mao: "Espelhar (mão)" },
    janela: { fora: "Inverter dentro/fora", mao: "Espelhar (mão)" }
  };

  function acoes(fam, av, inst) {
    var out = [], cat = fam && fam.categoria;
    if (cat !== "porta" && cat !== "janela") return out;
    var val = (av && av.valores) || {};
    if (tem(val, "Abre_para_fora")) {
      out.push({ id: "fora", param: "Abre_para_fora", valor: valorAtual("Abre_para_fora", av, inst), rotulo: ROTULOS[cat].fora,
        dica: "Inverter para o outro lado da parede (dentro ⇄ fora)" });
    }
    if (tem(val, "Mao_direita") && usa(fam, "Sinal_mao")) {
      out.push({ id: "mao", param: "Mao_direita", valor: valorAtual("Mao_direita", av, inst), rotulo: ROTULOS[cat].mao,
        dica: "Espelhar: a dobradiça (ou o lado em que a folha corre) passa para o outro lado" });
    }
    return out;
  }

  function op(idInst, acao) {
    if (!acao || !acao.param) return null;
    var o = {}; o[acao.param] = !acao.valor;   /* sempre o contrário do ATUAL (instância ou padrão da família) */
    return { op: "instancia", id: idInst, inst: o };
  }

  var VaoInverter = { acoes: acoes, op: op, simnao: simnao };
  global.VaoInverter = VaoInverter;
  if (typeof module !== "undefined" && module.exports) module.exports = VaoInverter;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
