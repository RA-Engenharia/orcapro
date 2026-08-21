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

      /* Sufixo estável de 4 hex a partir do CONTEÚDO (FNV-1a 32 bits). Precisa
         ser puro: o mesmo conteúdo tem de dar o mesmo sufixo em qualquer
         aparelho, hoje e no mês que vem. Nada de contador, data ou aleatório —
         foi exatamente o contador que vazou 65 clones na base do cliente. */
      function sufixoDe(x) {
        var s = assinatura(x), h = 0x811c9dc5, i;
        for (i = 0; i < s.length; i++) {
          h ^= s.charCodeAt(i);
          h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
        }
        return ("0000000" + h.toString(16)).slice(-4);
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
        /* ===== COLISÃO REAL — as DUAS sobrevivem. Antes de existir este ramo,
           o merge ficava com a mais nova e a composição do outro usuário sumia
           em silêncio: dado autoral substituído sem aviso. Quem foi criada
           PRIMEIRO fica com o código; a outra é renomeada, com `renomeadaDe`
           para rastreio.

           ⚠ O SUFIXO É O HASH DO CONTEÚDO, E NÃO UM CONTADOR. ISTO É UM
             CONSERTO DE PERDA DE DADO, MEDIDO NA INSTALAÇÃO DO CLIENTE.

             A versão anterior procurava "o próximo sufixo livre" (-2, -3, -4…).
             O comentário dela afirmava que a regra era determinística e que os
             aparelhos convergiam. Não convergiam, e a diferença é esta: o clone
             renomeado entrava na base, mas o registro do ESPELHO continuava com
             o código original — então, no merge seguinte, ele colidia DE NOVO
             com o item original da base, e o contador dava mais um passo. O
             ponto fixo nunca chegava.

             Medido nos backups do cliente: 11 composições próprias em 13/08, 22
             em 16/08, 30 em 17/08, 64 em 20/08, 79 em 21/08 — das quais 65 eram
             cópias idênticas de UMA composição ("DEMOLIÇÃO DE ALVENARIA",
             PROP-00011-2 até PROP-00011-66). Reproduzido em execução: +1 clone
             por sincronização, indefinidamente. O cliente tinha 14 composições
             de verdade e 65 de lixo, e a cada dia de uso ganhava mais ~8.

             Com o hash do conteúdo, a MESMA colisão gera SEMPRE o mesmo código.
             No merge seguinte o clone já está lá, com o mesmo conteúdo, e o
             ramo abaixo reconhece isso e não cria nada. Converge no primeiro
             merge e fica parado — que é o que "determinístico" tinha de
             significar desde o começo. */
        var xPrimeiro = String(x.criadoEm || "") < String(ja.v.criadoEm || "");
        var fica = xPrimeiro ? x : ja.v, ficaEsp = xPrimeiro ? deOndeEspelho : ja.esp;
        var sai = xPrimeiro ? ja.v : x, saiEsp = xPrimeiro ? ja.esp : deOndeEspelho;
        porId[k] = { v: fica, esp: ficaEsp };
        /* Se a perdedora JÁ é um renomeado, o sufixo sai do código de origem —
           senão nasceriam códigos aninhados (PROP-1-a3f2-b7c1). */
        var baseCod = String(sai.renomeadaDe || sai.codigo);
        var kk = (baseCod + "-" + sufixoDe(sai)).toLowerCase();
        var ocupante = porId[kk];
        if (ocupante && assinatura(ocupante.v) === assinatura(sai)) return;  // já convergiu
        var t2 = mortos[kk];
        if (t2 && !(quando(sai) > String(t2))) return;    // renomeado foi excluído de propósito
        var clone = {}, kc;
        for (kc in sai) if (Object.prototype.hasOwnProperty.call(sai, kc)) clone[kc] = sai[kc];
        clone.codigo = baseCod + "-" + sufixoDe(sai);
        clone.renomeadaDe = baseCod;
        if (clone.id) clone.id = kk;
        porId[kk] = { v: clone, esp: saiEsp };
        if (!ocupante) ordem.push(kk);
      }

      (itensBase || []).forEach(function (it) { poe(it, false); });
      (registros || []).forEach(function (r) { poe(r, true); });

      return ordem.map(function (k) {
        var e = porId[k];
        return e.esp ? self.paraItem(e.v) : e.v;
      }).filter(Boolean);
    },


    /* ================= REPARO DO VAZAMENTO DE CLONES =================
     *
     * ⚠ ISTO LIMPA LIXO QUE O PRODUTO CRIOU, e por isso a definição é a mais
     *   ESTREITA possível. Só entra na conta um item que atenda às TRÊS
     *   condições ao mesmo tempo:
     *
     *     1. carrega `renomeadaDe` — ou seja, NASCEU do ramo de colisão, não
     *        da mão de ninguém;
     *     2. existe outro item, vivo, com a MESMA assinatura (descrição +
     *        unidade + insumos);
     *     3. esse outro item veio da mesma origem (mesmo `renomeadaDe`, ou é
     *        o próprio código de origem).
     *
     *   Composição que alguém digitou nunca tem `renomeadaDe`. Duas
     *   composições parecidas mas com qualquer diferença de insumo têm
     *   assinaturas diferentes e as duas ficam. Na dúvida, fica.
     *
     * ⚠ POR QUE NÃO BASTA CONSERTAR O MERGE. O conserto para de PRODUZIR
     *   clone; ele não remove os 65 que já estão gravados na máquina do
     *   cliente. E não dá para pedir que ele limpe na mão: são 65 linhas
     *   iguais numa lista de 79, e a diferença entre a boa e as ruins é um
     *   sufixo hexadecimal.
     *
     * Devolve { fica, sai } — quem remove é o chamador, porque remover exige
     * lápide e a permissão estreita do Bases.persistir. */
    clonesParaLimpar: function (itens) {
      var self = this, vivos = (itens || []).filter(Boolean);
      function assin(x) {
        try { return JSON.stringify({ d: x.descricao, u: x.unidade, i: x.insumos }); }
        catch (e) { return "?"; }
      }
      function origemDe(x) { return String(x.renomeadaDe || x.codigo || "").trim().toLowerCase(); }
      /* Ordena por criadoEm e, no empate, por código: o sobrevivente tem de ser
         o mesmo em qualquer aparelho, senão a limpeza vira outra divergência. */
      var ordenado = vivos.slice().sort(function (a, b) {
        var ta = String(a.criadoEm || ""), tb = String(b.criadoEm || "");
        if (ta !== tb) return ta < tb ? -1 : 1;
        var ca = String(a.codigo || ""), cb = String(b.codigo || "");
        return ca < cb ? -1 : (ca > cb ? 1 : 0);
      });
      var primeiro = {}, sai = [];
      ordenado.forEach(function (x) {
        var k = origemDe(x) + "|" + assin(x);
        if (!primeiro[k]) { primeiro[k] = x; return; }
        if (x.renomeadaDe) sai.push(x);      // só o que nasceu da colisão sai
      });
      var fora = {};
      sai.forEach(function (x) { fora[chaveDe(x)] = 1; });
      return { fica: vivos.filter(function (x) { return !fora[chaveDe(x)]; }), sai: sai };
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
