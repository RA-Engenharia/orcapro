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

      /* Mesma composição ou colisão? O código sequencial (PROP-ALV-001) é
         determinístico: dois aparelhos criando composições DIFERENTES geram o
         mesmo código sem saber um do outro. A assinatura separa os casos:
         conteúdo igual = a mesma composição propagando; conteúdo diferente
         com criadoEm diferente = duas criações independentes colidindo. */
      function assinatura(x) {
        try { return JSON.stringify({ d: x.descricao, u: x.unidade, i: x.insumos }); } catch (e) { return "?"; }
      }

      function poe(x, deOndeEspelho) {
        var k = chaveDe(x);
        if (!k) return;
        var t = mortos[k];
        if (t && !(quando(x) > String(t))) return;       // excluído e não recriado depois
        var ja = porId[k];
        if (!ja) { porId[k] = { v: x, esp: deOndeEspelho }; ordem.push(k); return; }
        /* Colisão de verdade exige AUTORES diferentes: a edição preserva o
           criadoPor original (app.js), então mesmo autor = mesma linhagem =
           o mais novo vence, como sempre foi. Registro antigo sem criadoPor
           também cai na regra de sempre — na dúvida, não duplica. */
        var colisao = x.criadoPor && ja.v.criadoPor &&
                      String(x.criadoPor) !== String(ja.v.criadoPor) &&
                      assinatura(x) !== assinatura(ja.v);
        if (!colisao) {
          if (quando(x) > quando(ja.v)) porId[k] = { v: x, esp: deOndeEspelho };
          return;
        }
        /* ===== COLISÃO REAL (v1.1.232) — as DUAS sobrevivem. Antes, o merge
           ficava com a mais nova e a composição do outro usuário sumia em
           silêncio — dado autoral substituído sem aviso. Agora quem foi criada
           PRIMEIRO fica com o código; a outra é renomeada para o sufixo livre
           seguinte, com `renomeadaDe` para rastreio. A regra é determinística
           (mesmas entradas → mesmo resultado), então os dois aparelhos
           convergem para o mesmo par. */
        var xPrimeiro = String(x.criadoEm || "") < String(ja.v.criadoEm || "");
        var fica = xPrimeiro ? x : ja.v, ficaEsp = xPrimeiro ? deOndeEspelho : ja.esp;
        var sai = xPrimeiro ? ja.v : x, saiEsp = xPrimeiro ? ja.esp : deOndeEspelho;
        porId[k] = { v: fica, esp: ficaEsp };
        var baseCod = String(sai.codigo), n = 2, kk;
        do { kk = (baseCod + "-" + n).toLowerCase(); n++; } while (porId[kk] || mortos[kk]);
        var clone = {}, kc;
        for (kc in sai) if (Object.prototype.hasOwnProperty.call(sai, kc)) clone[kc] = sai[kc];
        clone.codigo = baseCod + "-" + (n - 1);
        clone.renomeadaDe = baseCod;
        if (clone.id) clone.id = kk;
        porId[kk] = { v: clone, esp: saiEsp };
        ordem.push(kk);
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
