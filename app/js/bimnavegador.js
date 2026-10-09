/* =====================================================================
 * bimnavegador.js — REGISTRO DE RAMOS do Navegador de projeto (P6, Frente D
 * do plano do BIM).
 *
 * POR QUE EXISTE: o Navegador (js/gestao.js `_nivArvore`) é montado numa
 * função só, e cada fase que trazia um ramo novo editava essa função (a P2-D
 * pôs "Ambientes" com um concat no meio dela). Com P5 (Tabelas), P6 (Vistas)
 * e P8 (Folhas) mexendo ao mesmo tempo, a função virava o ponto de conflito
 * de todo junta-ramo. Agora cada módulo REGISTRA o seu ramo aqui, e a árvore
 * de base só chama `aplicar` uma vez no fim.
 *
 *   BimNavegador.registrar({
 *     id: "tabelas",            // id do nó (o mesmo id SUBSTITUI o nó da base)
 *     dentro: "vistas",         // opcional: entra nos filhos deste nó
 *     depois: "folhas",         // ou antes: "niveis" — sem os dois, vai no fim
 *     montar: function (ctx) { return nó | null }   // null = não entra agora
 *   });
 *
 * `ctx` é o que a base sabe (os nós dela já montados, quem é a tela). O
 * registro é idempotente: registrar de novo o mesmo id (no mesmo `dentro`)
 * troca o anterior. Puro, sem DOM — tools/test-bimmodelovista.js.
 *
 * ORGANIZAÇÃO ("Organização do navegador"): a escolha do usuário
 * fica neste aparelho (localStorage); quem monta o ramo das vistas lê daqui.
 * ===================================================================== */
(function (global) {
  "use strict";

  var CHAVE_ORG = "orcapro:bim:navegador:org";
  var ORGANIZACOES = {
    tipo: "Todas (por tipo de vista)",
    disciplina: "Disciplina › tipo de vista",
    nivel: "Tipo de vista › nível"
  };

  function arr(v) { return Array.isArray(v) ? v : []; }
  function acharNo(nos, id) {
    for (var i = 0; i < nos.length; i++) {
      var n = nos[i]; if (!n) continue;
      if (n.id === id) return n;
      if (n.filhos && n.filhos.length) { var f = acharNo(n.filhos, id); if (f) return f; }
    }
    return null;
  }
  function indice(lista, id) { for (var i = 0; i < lista.length; i++) if (lista[i] && lista[i].id === id) return i; return -1; }

  var BimNavegador = {
    ORGANIZACOES: ORGANIZACOES,
    _ramos: [],

    registrar: function (def) {
      if (!def || !def.id || typeof def.montar !== "function") return false;
      var dentro = def.dentro || "";
      this._ramos = this._ramos.filter(function (r) { return !(r.id === def.id && (r.dentro || "") === dentro); });
      this._ramos.push({ id: String(def.id), dentro: dentro, depois: def.depois || "", antes: def.antes || "", montar: def.montar });
      return true;
    },
    remover: function (id, dentro) {
      var n0 = this._ramos.length, d = dentro || "";
      this._ramos = this._ramos.filter(function (r) { return !(r.id === id && (r.dentro || "") === d); });
      return this._ramos.length !== n0;
    },
    ramos: function () { return this._ramos.map(function (r) { return { id: r.id, dentro: r.dentro, depois: r.depois, antes: r.antes }; }); },

    /* a árvore da base + os ramos registrados (cópia rasa: a base não muda) */
    aplicar: function (arvore, ctx) {
      var raiz = arr(arvore).slice();
      this._ramos.forEach(function (r) {
        var no = null;
        try { no = r.montar(ctx || {}); } catch (e) { no = null; }
        if (!no || !no.id) return;
        var lista = raiz;
        if (r.dentro) {
          var pai = acharNo(raiz, r.dentro);
          if (!pai) return;
          pai.filhos = arr(pai.filhos).slice();
          lista = pai.filhos;
        }
        var ix = indice(lista, no.id);
        if (ix >= 0) { lista[ix] = no; return; }
        var ref = r.depois ? indice(lista, r.depois) : -1;
        if (ref >= 0) { lista.splice(ref + 1, 0, no); return; }
        ref = r.antes ? indice(lista, r.antes) : -1;
        if (ref >= 0) { lista.splice(ref, 0, no); return; }
        lista.push(no);
      });
      return raiz;
    },

    organizacao: function () {
      var o = null;
      try { o = global.localStorage ? global.localStorage.getItem(CHAVE_ORG) : null; } catch (e) { o = null; }
      return ORGANIZACOES[o] ? o : "tipo";
    },
    definirOrganizacao: function (o) {
      if (!ORGANIZACOES[o]) return false;
      try { if (global.localStorage) global.localStorage.setItem(CHAVE_ORG, o); } catch (e) { return false; }
      return true;
    },
    acharNo: function (arvore, id) { return acharNo(arr(arvore), id); }
  };

  global.BimNavegador = BimNavegador;
  if (typeof module !== "undefined" && module.exports) module.exports = BimNavegador;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
