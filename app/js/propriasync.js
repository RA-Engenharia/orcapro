/* =====================================================================
 * propriasync.js — as COMPOSIÇÕES PRÓPRIAS na nuvem (lógica pura, Node-testável)
 *
 * O PROBLEMA: a base PRÓPRIA é um BLOB no IndexedDB (`bases_extras`), e a
 * nuvem (`nuvem.js`) só sincroniza entidades do localStorage, mesclando
 * POR ID com `atualizadoEm`. Mandar o blob inteiro para a nuvem seria o
 * mesmo defeito que custou o dado do cliente, agora entre aparelhos: o
 * último a gravar apagaria o que o outro criou, sem erro nenhum.
 *
 * A SAÍDA: um ESPELHO — cada composição própria vira um registro da
 * entidade `composicoes_proprias` (id = código normalizado). Aí a máquina
 * de merge que já existe funciona item a item: dois aparelhos criando
 * composições diferentes ficam com as duas; excluir gera lápide e o item
 * não ressuscita; edição concorrente cai na regra do `atualizadoEm`.
 *
 * A base PRÓPRIA continua sendo a fonte da busca e do orçamento — ela é
 * RECONSTRUÍDA a partir da união (base local + espelho), nunca substituída.
 * ===================================================================== */
(function (global) {
  "use strict";

  var ENTIDADE = "composicoes_proprias";

  function chaveDe(x) { return String((x && x.codigo) != null ? x.codigo : "").trim().toLowerCase(); }
  function quando(x) { return String((x && (x.atualizadoEm || x.criadoEm)) || ""); }

  var PropriaSync = {
    ENTIDADE: ENTIDADE,

    /* Item da base -> registro do espelho. O item vai INTEIRO (com insumos):
     * meio item na nuvem é uma composição que não regrava do outro lado. */
    paraRegistro: function (item, agoraISO) {
      if (!item || item.codigo == null) return null;
      var r = {}, k;
      for (k in item) if (Object.prototype.hasOwnProperty.call(item, k)) r[k] = item[k];
      r.id = chaveDe(item);
      if (!r.id) return null;
      r.atualizadoEm = String(item.atualizadoEm || item.criadoEm || agoraISO || "");
      if (!r.criadoEm) r.criadoEm = r.atualizadoEm;
      return r;
    },

    /* Registro do espelho -> item da base (tira só o que é de controle). */
    paraItem: function (reg) {
      if (!reg || reg.codigo == null) return null;
      var it = {}, k;
      for (k in reg) if (Object.prototype.hasOwnProperty.call(reg, k)) it[k] = reg[k];
      delete it.id;
      delete it._conflitoDe;
      return it;
    },

    /* UNIÃO de base local + espelho da nuvem. Regras, nesta ordem:
     *  1. nunca REDUZ: o que só existe de um lado entra;
     *  2. no mesmo código, vence quem tem `atualizadoEm`/`criadoEm` mais novo;
     *  3. empate mantém o que já estava na base (não reescreve à toa).
     * `mortos` (lápides) tira o que foi excluído de propósito em outro
     * aparelho — mas só se a exclusão for MAIS NOVA que o item: recriar
     * depois de excluir tem de continuar valendo. */
    mesclar: function (itensBase, registros, mortos) {
      mortos = mortos || {};
      var porId = {}, ordem = [], self = this;

      function poe(x, deOndeEspelho) {
        var k = chaveDe(x);
        if (!k) return;
        var t = mortos[k];
        if (t && !(quando(x) > String(t))) return;       // excluído e não recriado depois
        var ja = porId[k];
        if (!ja) { porId[k] = { v: x, esp: deOndeEspelho }; ordem.push(k); return; }
        if (quando(x) > quando(ja.v)) porId[k] = { v: x, esp: deOndeEspelho };
      }

      (itensBase || []).forEach(function (it) { poe(it, false); });
      (registros || []).forEach(function (r) { poe(r, true); });

      return ordem.map(function (k) {
        var e = porId[k];
        return e.esp ? self.paraItem(e.v) : e.v;
      }).filter(Boolean);
    },

    /* Quais itens da base ainda NÃO estão no espelho (ou estão desatualizados).
     * É o que precisa subir — no 1º uso, o espelho está vazio e a base tem
     * tudo: sem isto, a nuvem começaria a vida sem as composições antigas. */
    faltandoNoEspelho: function (itensBase, registros) {
      var idx = {};
      (registros || []).forEach(function (r) { var k = chaveDe(r); if (k) idx[k] = r; });
      var out = [];
      (itensBase || []).forEach(function (it) {
        var k = chaveDe(it);
        if (!k) return;
        var r = idx[k];
        if (!r || quando(it) > quando(r)) out.push(it);
      });
      return out;
    }
  };

  global.PropriaSync = PropriaSync;
  if (typeof module !== "undefined" && module.exports) module.exports = PropriaSync;
})(typeof window !== "undefined" ? window : this);
