/* =====================================================================
 * mor/coerencia.js — CONFERÊNCIA DE COERÊNCIA (F11 do MOR, ESPEC §15 item 5)
 *
 * Lê as regras de js/mor/catalogo-dados/coerencia.js (dado) e devolve AVISOS: «tem alvenaria e não tem chapisco/reboco»,
 * «tem telha e não tem estrutura», «tem piso e não tem contrapiso», «tem tomada e não tem eletroduto».
 * Só avisa: não lança nada. Puro, ES5, sem DOM.
 *   verificar(orc, regras?) → { avisos:[{id, aviso, gatilhos:[{etapaId,itemId,descricao}]}], ok:[ids das regras satisfeitas],
 *                               naoAplicadas:[ids sem gatilho] }
 * Um item casa por `mor.regra` («etapaId.chave») OU pela descrição normalizada (regex do dado). O par basta existir no
 * orçamento (mesmo com quantidade pendente: o serviço já está no escopo). Regex inválida no dado é ignorada, nunca quebra.
 * ===================================================================== */
(function (global) {
  "use strict";

  function arr(v) { return Object.prototype.toString.call(v) === "[object Array]" ? v : []; }
  function norm(s) {
    var t = String(s == null ? "" : s).toLowerCase();
    try { t = t.normalize("NFD").replace(/[̀-ͯ]/g, ""); } catch (e) { /* sem normalize: segue */ }
    return t.replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
  }
  function regras() {
    var D = global.MorDados;
    if (!D || !D.coerencia) { try { if (typeof require === "function") require("./catalogo-dados/coerencia.js"); } catch (e) { /* sem dado */ } D = global.MorDados; }
    return arr(D && D.coerencia);
  }
  function re(src) { try { return src ? new RegExp(src) : null; } catch (e) { return null; } }

  function casa(it, cond) {
    if (!cond) return false;
    var reg = it && it.mor && it.mor.regra ? String(it.mor.regra) : "";
    if (reg && arr(cond.chaves).indexOf(reg) >= 0) return true;
    var r = re(cond.texto);
    return !!(r && r.test(norm(it && it.descricao)));
  }

  function verificar(orc, lista) {
    var out = { avisos: [], ok: [], naoAplicadas: [] }, itens = [];
    arr(orc && orc.etapas).forEach(function (e) { arr(e && e.itens).forEach(function (it) { if (it) itens.push({ e: e, it: it }); }); });
    arr(lista || regras()).forEach(function (r) {
      if (!r || !r.id) return;
      var gat = itens.filter(function (x) { return casa(x.it, r.se); });
      if (!gat.length) { out.naoAplicadas.push(r.id); return; }
      var par = itens.some(function (x) { return casa(x.it, r.exige); });
      if (par) { out.ok.push(r.id); return; }
      out.avisos.push({ id: r.id, aviso: r.aviso, gatilhos: gat.map(function (x) { return { etapaId: x.e.id, itemId: x.it.id, descricao: x.it.descricao || "" }; }) });
    });
    return out;
  }

  var Coerencia = { regras: regras, verificar: verificar, _norm: norm };
  if (typeof module !== "undefined" && module.exports) module.exports = Coerencia;
  global.MorCoerencia = Coerencia;
})(typeof window !== "undefined" ? window : globalThis);
