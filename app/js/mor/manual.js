/* =====================================================================
 * mor/manual.js — O MANUAL ACELERADO (motor puro, Node-testável)
 *
 * Pedido do Rogério (13/11/2026): ao criar o orçamento e escolher o tipo de obra, já
 * nascem as etapas padrão + Serviços Preliminares; ao adicionar uma etapa que existe
 * no catálogo, abre-se um painel com as perguntas dela (padrões marcados) e a prévia
 * dos itens — que só entram quando a pessoa confirma.
 *
 * Este arquivo é a regra; a tela (js/mor/ui.js) só chama. O que ele grava no orçamento:
 *   orc.mor = { v:1, tipologia, params:{area,pavimentos,peDireito,padrao,banheiros,quartos,perimetro},
 *               respostas:{ "cob.tipo":"fibrocimento", ... } }
 *   item.mor = { regra, formula, premissas, origem:"catalogo", confianca, codigos, intencao }
 *
 * ⚠ NADA ENTRA SEM AÇÃO: a prévia não grava; `inserir` só insere as chaves marcadas.
 * ⚠ IDEMPOTENTE: confirmar duas vezes não duplica — item da mesma `regra` já existente
 *   na etapa é pulado (e contado).
 * ⚠ PREÇO NUNCA É INVENTADO: o item leva o preço da base instalada (obter(código));
 *   sem código, ou com código ausente da base, o preço é zero — e preço zero só entra
 *   com "Permitir insumos com preço zerado" (regra do orçamento, js/app.js); fora disso
 *   o item fica de fora e é CONTADO no resumo, nunca some calado.
 * ⚠ Não altera BDI, Orcamento.calcular nem preço de base.
 * ===================================================================== */
(function (global) {
  "use strict";

  var C = global.MorCatalogo || (typeof require === "function" ? require("./catalogo.js") : null);
  var M = global.Mor || (typeof require === "function" ? require("./motor.js") : null);
  var CAMPOS_OBRA = ["area", "pavimentos", "peDireito", "padrao", "banheiros", "quartos", "perimetro"];

  function tem(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function vazio(v) { return v === undefined || v === null || v === ""; }
  function arr(v) { return Object.prototype.toString.call(v) === "[object Array]" ? v : []; }

  var MorManual = {
    CAMPOS_OBRA: CAMPOS_OBRA,

    /* garante orc.mor e devolve */
    garantir: function (orc) {
      if (!orc.mor || typeof orc.mor !== "object") orc.mor = { v: 1, tipologia: "", params: {}, respostas: {} };
      if (!orc.mor.params || typeof orc.mor.params !== "object") orc.mor.params = {};
      if (!orc.mor.respostas || typeof orc.mor.respostas !== "object") orc.mor.respostas = {};
      return orc.mor;
    },

    /* Cria as etapas da tipologia (em ordem) que ainda não existem no orçamento.
       NÃO insere nenhum item. Devolve { criadas:[nome], jaExistiam:[nome], erro }. */
    nascer: function (orc, tipologiaId, Orc) {
      var t = C.tipologia(tipologiaId);
      if (!t) return { criadas: [], jaExistiam: [], erro: "Tipo de obra «" + tipologiaId + "» não existe no catálogo." };
      var mor = this.garantir(orc), criadas = [], ja = [];
      mor.tipologia = t.id;
      var existentes = {};
      arr(orc.etapas).forEach(function (e) { existentes[C.semAcento(e.nome)] = true; });
      t.etapas.forEach(function (nome) {
        if (existentes[C.semAcento(nome)]) { ja.push(nome); return; }
        Orc.addEtapa(orc, nome); existentes[C.semAcento(nome)] = true; criadas.push(nome);
      });
      return { criadas: criadas, jaExistiam: ja, erro: "" };
    },

    /* parâmetros da obra no formato de entrada do motor (tipo = geometria da tipologia) */
    entradaObra: function (orc, sobre) {
      var mor = this.garantir(orc), t = C.tipologia(mor.tipologia), e = { tipo: t ? t.base : "residencial" }, k;
      CAMPOS_OBRA.forEach(function (c) { if (!vazio(mor.params[c])) e[c] = mor.params[c]; });
      if (sobre) for (k in sobre) if (tem(sobre, k) && !vazio(sobre[k])) e[k] = sobre[k];
      return e;
    },
    definirParams: function (orc, obj) {
      var mor = this.garantir(orc);
      CAMPOS_OBRA.forEach(function (c) { if (obj && tem(obj, c)) { if (vazio(obj[c])) delete mor.params[c]; else mor.params[c] = obj[c]; } });
      return mor.params;
    },
    /* resposta = a pessoa escolheu; vazio/null apaga (volta ao padrão) */
    definirResposta: function (orc, id, valor) {
      var mor = this.garantir(orc);
      if (vazio(valor)) delete mor.respostas[id]; else mor.respostas[id] = valor;
    },

    /* a etapa do catálogo que corresponde a uma etapa do orçamento (pelo nome) */
    etapaDoCatalogo: function (nomeEtapa) { return C.etapaPorNome(nomeEtapa); },

    /* Prévia (não grava). `respostas`/`obra` opcionais sobrepõem o salvo (o que está
       na tela e ainda não foi confirmado). */
    previa: function (orc, etapaCatId, respostas, obra, padroes) {
      var mor = this.garantir(orc), r = {}, k;
      /* F6: o padrão da EMPRESA (resposta mais usada) entra por baixo de tudo; o que a pessoa respondeu vale mais */
      if (padroes) for (k in padroes) if (tem(padroes, k)) r[k] = padroes[k];
      for (k in mor.respostas) if (tem(mor.respostas, k)) r[k] = mor.respostas[k];
      if (respostas) for (k in respostas) if (tem(respostas, k)) { if (vazio(respostas[k])) delete r[k]; else r[k] = respostas[k]; }
      var pv = M.previaEtapa(etapaCatId, this.entradaObra(orc, obra), r);
      if (padroes && pv.perguntas) pv.perguntas.forEach(function (q) {
        if (tem(padroes, q.id) && !tem(mor.respostas, q.id) && !(respostas && tem(respostas, q.id) && !vazio(respostas[q.id])) && String(q.valor) === String(padroes[q.id])) q.daMemoria = true;
      });
      return pv;
    },

    /* Insere as linhas MARCADAS (chaves) da prévia na etapa do orçamento.
       deps = { Orcamento, obter(código)→item da base | null, permitirZerado, limiteItens }
       Devolve { inseridos, jaExistiam, semPreco:[desc], pendentes, recusado:"" }. */
    inserir: function (orc, etapaOrcId, previa, marcadas, deps) {
      var O = deps.Orcamento, res = { inseridos: 0, jaExistiam: 0, semPreco: [], pendentes: 0, recusado: "" };
      var etapa = null;
      arr(orc.etapas).forEach(function (e) { if (e.id === etapaOrcId) etapa = e; });
      if (!etapa) { res.recusado = "A etapa não existe mais neste orçamento."; return res; }
      if (O.travadoPorAprovacao && O.travadoPorAprovacao(orc)) { res.recusado = "Este orçamento está aprovado — crie uma revisão para acrescentar itens."; return res; }
      var jaTem = {};
      arr(etapa.itens).forEach(function (it) { if (it.mor && it.mor.regra) jaTem[it.mor.regra] = true; });
      var marc = {}; arr(marcadas).forEach(function (c) { marc[c] = true; });
      var total = deps.totalItens || 0;
      arr(previa && previa.itens).forEach(function (l) {
        var chave = l.mor.regra;
        if (!marc[chave]) return;
        if (jaTem[chave]) { res.jaExistiam++; return; }
        if (l.estado === "erro") { res.pendentes++; return; }
        if (deps.limiteItens && total >= deps.limiteItens) { res.recusado = "Limite de itens do plano atingido."; return; }
        var base = l.codigo ? deps.obter(l.codigo, l.fonte) : null;   /* pela (fonte, código): o mesmo número existe em bases diferentes */
        var cu = base ? Number(base.custoUnitario) || 0 : 0;
        if (!(cu > 0) && !deps.permitirZerado) { res.semPreco.push(l.descricao); return; }
        var origem = base ? JSON.parse(JSON.stringify(base)) : { codigo: "", descricao: l.descricao, unidade: l.unidade, custoUnitario: 0 };
        if (base && l.fonte && !origem.baseFonte) origem.baseFonte = l.fonte;
        origem.memoriaCalculo = "Motor de Orçamento por Regras — " + l.formula + (l.mor.formula ? " [" + l.mor.formula + "]" : "");
        var antes = {}; arr(etapa.itens).forEach(function (it) { antes[it.id] = true; });
        O.addItem(orc, etapa.id, origem, l.quantidade);
        var novo = null;
        arr(etapa.itens).forEach(function (it) { if (!antes[it.id]) novo = it; });
        if (novo) {
          novo.mor = {
            regra: l.mor.regra, formula: l.mor.formula, premissas: l.mor.premissas.slice(), origem: l.mor.origem || "catalogo",
            qtdOrigem: l.mor.qtdOrigem || "estimado", porque: l.mor.porque || "",
            confianca: base && l.estado === "ok" ? l.mor.confianca : "pendente", codigos: l.mor.codigos.slice(), intencao: l.mor.intencao,
            vars: l.mor.vars || {}, elementoOrigem: l.mor.elementoOrigem || "", conferido: false
          };
          if (l.mor.casamento) novo.mor.casamento = { confianca: l.mor.casamento.confianca, motivo: l.mor.casamento.motivo };
          if (l.codigo && !base) novo.mor.motivo = "o código " + l.codigo + " não está na base instalada neste orçamento";
        }
        jaTem[chave] = true; total++; res.inseridos++;
        if (!base || l.estado !== "ok") res.pendentes++;
      });
      return res;
    }
  };

  if (typeof module !== "undefined" && module.exports) module.exports = MorManual;
  global.MorManual = MorManual;
})(typeof window !== "undefined" ? window : globalThis);
