/* =====================================================================
 * entradardo.js — DIÁRIO QUE CHEGA DE FORA (RDO por WhatsApp)
 *
 * O mestre manda áudio no WhatsApp, o n8n transcreve e estrutura, e deposita
 * o rascunho numa caixa no VPS. Este módulo é o lado do app: busca o que
 * chegou, vira diário LOCAL em RASCUNHO e dá baixa na caixa.
 *
 * TRÊS REGRAS QUE NÃO PODEM CAIR:
 *
 * 1) ENTRA COMO RASCUNHO, SEMPRE. Transcrição de canteiro erra número, e RDO
 *    é documento contratual: "8 pedreiros" virando 80 vira medição e vira
 *    custo. Quem publica é gente.
 *
 * 2) SÓ DÁ BAIXA DEPOIS DE GRAVAR. Se o app cair entre buscar e gravar, o
 *    diário some sem nunca ter existido. A caixa entrega de novo — e a
 *    idempotência do lado de lá impede o duplicado.
 *
 * 3) NUNCA INVENTA A OBRA. O áudio diz "na obra do Vila Verde"; se isso não
 *    casar com uma obra cadastrada, o diário entra SEM obra e marcado, para
 *    alguém escolher. Chutar a obra é lançar efetivo e custo no lugar errado.
 * ===================================================================== */
(function (global) {
  "use strict";

  function texto(s) { return String(s == null ? "" : s).trim(); }

  /* Compara nomes de obra como gente compara: sem acento, sem caixa, sem
     espaço sobrando. "vila verde" acha "Residencial Vila Verde — 8 casas". */
  function normal(s) {
    return texto(s).normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  }

  /* Acha a obra pelo que o áudio disse. Devolve null quando não tem certeza —
     e "não tem certeza" inclui o caso de DUAS obras servirem: escolher uma
     delas no cara ou coroa lançaria o efetivo na obra errada. */
  function acharObra(dito, obras) {
    var alvo = normal(dito);
    if (!alvo) return null;
    var lista = obras || [];
    var exatas = lista.filter(function (o) { return normal(o.nome) === alvo; });
    if (exatas.length === 1) return exatas[0];
    if (exatas.length > 1) return null;                    // homônimas: quem decide é gente
    var contem = lista.filter(function (o) {
      var n = normal(o.nome);
      return n && (n.indexOf(alvo) !== -1 || alvo.indexOf(n) !== -1);
    });
    return contem.length === 1 ? contem[0] : null;         // ambíguo também é não
  }

  /* Transforma o item da caixa num registro de diário do app.
     `ctx`: { obras, hoje, idNovo, autorId } */
  function paraDiario(item, ctx) {
    var c = ctx || {}, it = item || {}, r = it.rdo || {};
    var obra = r.obraId
      ? (c.obras || []).filter(function (o) { return o.id === r.obraId; })[0] || null
      : acharObra(r.obraNome, c.obras);

    var d = {
      id: typeof c.idNovo === "function" ? c.idNovo() : undefined,
      obraId: obra ? obra.id : "",
      data: /^\d{4}-\d{2}-\d{2}$/.test(texto(r.data)) ? texto(r.data) : (c.hoje || ""),
      /* RASCUNHO, sempre. Ver regra 1 no topo.
         Os DOIS campos, como faz `RDO.novoBaseadoEm` (js/rdo.js): a lista lê
         `estado` e o <select> da tela lê `status`. Quando os dois discordaram,
         as duas telas contaram histórias opostas sobre o mesmo diário e não
         havia como tirá-lo do ar — está escrito em RDO.estadoDe. */
      estado: "rascunho",
      status: "rascunho",
      origem: "whatsapp",
      origemId: it.id || "",
      origemDe: texto(it.de),
      origemEm: it.criadoEm || 0,
      autorId: c.autorId || "",
      efetivoDireto: Number(r.efetivoDireto) > 0 ? Number(r.efetivoDireto) : 0,
      efetivoIndireto: Number(r.efetivoIndireto) > 0 ? Number(r.efetivoIndireto) : 0,
      atividades: texto(r.atividades),
      impedimentos: texto(r.impedimentos),
      condicao: texto(r.condicao),
      obs: texto(r.obs)
    };

    /* A TRANSCRIÇÃO INTEIRA FICA JUNTO, sempre. É a única forma de conferir o
       que a IA entendeu contra o que o mestre falou — sem ela, um número
       errado não tem como ser rastreado até a origem. */
    var cabeca = "— Diário recebido por WhatsApp" + (d.origemDe ? " de " + d.origemDe : "") + " —";
    var trans = texto(it.transcricao);
    d.obs = [d.obs, cabeca, trans ? "Transcrição do áudio: " + trans : ""].filter(Boolean).join("\n");

    /* O que precisa de gente antes de publicar. Vai no registro e na tela. */
    d.pendencias = [];
    if (!d.obraId) d.pendencias.push(texto(r.obraNome)
      ? 'não achei a obra "' + texto(r.obraNome) + '" no cadastro — escolha a obra'
      : "o áudio não disse a obra — escolha a obra");
    if (!d.efetivoDireto && !d.efetivoIndireto) d.pendencias.push("sem efetivo informado");
    if (!d.atividades) d.pendencias.push("sem descrição do serviço do dia");
    return d;
  }

  /* Converte a caixa inteira. Devolve o que gravar e o que dizer ao usuário. */
  function preparar(itens, ctx) {
    var diarios = (itens || []).map(function (i) { return paraDiario(i, ctx); });
    return {
      diarios: diarios,
      ids: (itens || []).map(function (i) { return i && i.id; }).filter(Boolean),
      comPendencia: diarios.filter(function (d) { return d.pendencias.length; }).length
    };
  }

  /* ---------------------------------------------------------------------
   * A SINCRONIZAÇÃO
   *
   * Recebe tudo de fora (`d`) para poder ser testada sem rede e sem app:
   *   d.url      base da loja            d.licenca  chave v2 do cliente
   *   d.buscar   fetch                   d.gravar   grava um diário e devolve true
   *   d.obras    obras cadastradas       d.hoje     "AAAA-MM-DD"
   *   d.idNovo   gerador de id           d.autorId  quem está logado
   *
   * A ORDEM É A REGRA: grava primeiro, dá baixa depois — e só dos que
   * gravaram. Se o app cair no meio, a caixa entrega de novo e ninguém perde
   * o diário; o item repetido morre na idempotência do lado de lá.
   * ------------------------------------------------------------------- */
  function sincronizar(d) {
    d = d || {};
    var base = String(d.url || "").replace(/\/$/, "");
    var lic = String(d.licenca || "");
    var buscar = d.buscar;
    if (!base || !lic || typeof buscar !== "function") {
      return Promise.resolve({ criados: 0, comPendencia: 0, erro: "sem servidor ou sem licença" });
    }
    return buscar(base + "/api/entrada/rdo?licenca=" + encodeURIComponent(lic))
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var itens = (j && j.itens) || [];
        if (!itens.length) return { criados: 0, comPendencia: 0, vazio: true };

        var gravados = [], pend = 0;
        itens.forEach(function (it) {
          var diario = paraDiario(it, d);
          var ok = false;
          /* uma falha de gravação NÃO pode derrubar as outras nem virar baixa:
             o item fica na caixa e volta na próxima */
          try { ok = d.gravar(diario) !== false; } catch (e) { ok = false; }
          if (ok) { gravados.push(it.id); if (diario.pendencias.length) pend++; }
        });
        if (!gravados.length) return { criados: 0, comPendencia: 0 };

        return buscar(base + "/api/entrada/baixa", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ licenca: lic, ids: gravados })
        }).then(function () {
          return { criados: gravados.length, comPendencia: pend };
        }).catch(function () {
          /* a baixa falhou mas os diários EXISTEM. Não é erro para o usuário:
             a caixa vai reentregar e a idempotência do servidor impede o
             duplicado. Dizer "falhou" aqui assustaria à toa. */
          return { criados: gravados.length, comPendencia: pend, baixaPendente: true };
        });
      })
      .catch(function (e) {
        return { criados: 0, comPendencia: 0, erro: (e && e.message) || "falha de rede" };
      });
  }

  var EntradaRDO = { normal: normal, acharObra: acharObra, paraDiario: paraDiario,
    preparar: preparar, sincronizar: sincronizar };
  global.EntradaRDO = EntradaRDO;
  if (typeof module !== "undefined" && module.exports) module.exports = EntradaRDO;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
