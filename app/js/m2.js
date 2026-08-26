/* =====================================================================
 * m2.js — A METRAGEM DA OBRA, COM OS DOIS EIXOS DECLARADOS JUNTOS
 *
 * ---------------------------------------------------------------------
 * POR QUE ESTE ARQUIVO EXISTE
 * ---------------------------------------------------------------------
 *
 * O diário guarda a metragem DUAS vezes, e são números diferentes:
 *
 *   EXECUTADO  `it.qtdExecutada`      — o que o serviço andou no dia.
 *                                       Não tem dono. É o progresso da obra.
 *   ATRIBUÍDO  `it.producao[].qtd`    — quanto CADA PESSOA produziu.
 *                                       Tem dono. É o que vira dinheiro.
 *
 * Eles não batem por três motivos legítimos, todos previstos no sistema:
 *   a) `Producao.validarItem` recusa atribuir MAIS do que foi executado, mas
 *      ACEITA atribuir menos — sobra sem dono é aviso, não erro;
 *   b) o eixo do dinheiro só conta diário nos estados que pagam
 *      (`Producao.ESTADOS_QUE_PAGAM`), e o progresso quer mostrar o dia de
 *      hoje, que ainda está em aprovação;
 *   c) quem não é elegível a receber por produção não aparece no eixo do
 *      dinheiro, e o m² dele existe do mesmo jeito.
 *
 * ⚠ O DEFEITO QUE ISTO IMPEDE. Sem uma fonte só, o Painel mostra 120 m² no
 *   mês, a folha paga 100 m², nenhum erro aparece em lugar nenhum — e a
 *   primeira conclusão de quem olha é que o sistema erra a conta. Justamente
 *   no cliente que comprou "ver o progresso no painel".
 *
 * Por isso aqui os dois eixos voltam JUNTOS, no mesmo objeto, cada um com o
 * seu rótulo e o seu filtro de estado escrito. Quem desenha é obrigado a
 * dizer qual está mostrando — a mesma exigência que o Painel já faz do
 * subtítulo de cada cartão.
 *
 * ---------------------------------------------------------------------
 * DUAS REGRAS
 * ---------------------------------------------------------------------
 * 1) NÃO SOMAR UNIDADES DIFERENTES. 200 m² + 50 m não é 250 de nada. Só a
 *    unidade pedida entra na soma; o resto é devolvido em `foraDaUnidade`
 *    para a tela poder dizer, em vez de sumir com o dado. (É a regra 2 do
 *    fisico.js, repetida aqui porque o eixo do dinheiro não passa por lá.)
 * 2) NÃO PAGAR NADA. Este arquivo NÃO calcula dinheiro e NÃO grava. Ele lê,
 *    soma e devolve. Quem paga é o remunvar.js — e paga passando pela chave
 *    de origem do producao.js, que é o que impede pagar duas vezes.
 * ===================================================================== */
(function (global) {
  "use strict";

  var M2 = {};

  function r2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
  function txt(x) { return String(x == null ? "" : x).trim(); }
  function arr(x) { return Array.isArray(x) ? x : []; }

  /* "M²", "m2", "m²" → "m2". Unidade digitada de três jeitos é a regra, não
     a exceção — e comparar cru deixaria metade da obra fora da soma. */
  function un(u) {
    var s = txt(u).toLowerCase().replace(/\s+/g, "");
    if (global.Util && global.Util.unidadeChave) {
      try { return String(global.Util.unidadeChave(s) || s).toLowerCase(); } catch (e) {}
    }
    return s.replace("²", "2").replace("³", "3");
  }
  M2.un = un;

  M2.UNIDADE_PADRAO = "m2";

  M2.EIXOS = {
    executado: {
      id: "executado",
      rotulo: "executado nos diários",
      explica: "o quanto o serviço andou — inclui o que ainda está em aprovação"
    },
    atribuido: {
      id: "atribuido",
      rotulo: "atribuído a pessoas",
      explica: "o quanto cada pessoa produziu — só de diário aprovado, é o que vira pagamento"
    }
  };

  /* Rótulo obrigatório para quem desenha. Eixo desconhecido devolve "" em vez
     de um rótulo bonito e errado. */
  M2.rotulo = function (eixo) {
    var e = M2.EIXOS[txt(eixo)];
    return e ? e.rotulo : "";
  };

  /* ===================================================================
   * daObra(rdos, opcoes)
   *
   * opcoes: { obraId, de, ate, unidade, estadosExecutado, jaMedido }
   *
   * `estadosExecutado` default: TODOS. É de propósito — o progresso do dia
   * precisa aparecer antes de o encarregado aprovar, senão o cartão do
   * Painel fica parado e quem lança não vê retorno nenhum do que lançou.
   * =================================================================== */
  M2.daObra = function (rdos, opcoes) {
    var o = opcoes || {};
    var alvo = un(o.unidade || M2.UNIDADE_PADRAO);
    var lista = arr(rdos);
    var obraId = txt(o.obraId);

    /* ---------- eixo EXECUTADO ---------- */
    var exec = { total: 0, porServico: [], porData: [], estados: o.estadosExecutado || null };
    var foraDaUnidade = [];
    var porData = {};

    lista.forEach(function (r) {
      if (!r) return;
      if (obraId && txt(r.obraId) !== obraId) return;
      var d = txt(r.data);
      if (o.de && d && d < o.de) return;
      if (o.ate && d && d > o.ate) return;
      if (exec.estados && exec.estados.length) {
        var e = txt(r.estado) || txt(r.status);
        if (exec.estados.indexOf(e) < 0) return;
      }
      arr(r.atividadesItens).forEach(function (it) {
        if (!it) return;
        var q = Number(it.qtdExecutada) || 0;
        if (!q) return;
        if (un(it.unidade) !== alvo) {
          if (foraDaUnidade.indexOf(txt(it.unidade)) < 0 && txt(it.unidade)) foraDaUnidade.push(txt(it.unidade));
          return;
        }
        exec.total = r2(exec.total + q);
        if (d) porData[d] = r2((porData[d] || 0) + q);
      });
    });

    /* por serviço reusa o motor que já existe — não há motivo para uma
       segunda contagem do mesmo dado com regras ligeiramente diferentes */
    if (global.Fisico && global.Fisico.porServico) {
      try {
        var linhas = global.Fisico.porServico(lista, obraId || null, {
          de: o.de, ate: o.ate, estados: exec.estados
        });
        exec.porServico = linhas.filter(function (L) { return un(L.unidade) === alvo && L.executado > 0; })
          .map(function (L) {
            return { chave: L.chave, descricao: L.descricao, etapa: L.etapa, unidade: L.unidade, qtd: r2(L.executado) };
          }).sort(function (a, b) { return b.qtd - a.qtd; });
      } catch (e) { exec.porServico = []; }
    }
    exec.porData = Object.keys(porData).sort().map(function (d) { return { data: d, qtd: porData[d] }; });

    /* ---------- eixo ATRIBUÍDO ---------- */
    var atr = { total: 0, porPessoa: [], estados: null, pendentes: 0, linhas: [] };
    if (global.Producao && global.Producao.acumular) {
      atr.estados = global.Producao.ESTADOS_QUE_PAGAM || null;
      var ac = global.Producao.acumular(lista, {
        obraId: obraId || undefined, de: o.de, ate: o.ate, jaMedido: o.jaMedido
      }) || {};
      var linhasP = arr(ac.linhas).filter(function (l) { return un(l.unidade) === alvo; });
      atr.linhas = linhasP;
      var porP = {};
      linhasP.forEach(function (l) {
        var k = txt(l.colaboradorId);
        if (!porP[k]) porP[k] = { colaboradorId: k, nome: l.nome || "", qtd: 0 };
        porP[k].qtd = r2(porP[k].qtd + (Number(l.qtd) || 0));
        atr.total = r2(atr.total + (Number(l.qtd) || 0));
      });
      atr.porPessoa = Object.keys(porP).map(function (k) { return porP[k]; })
        .sort(function (a, b) { return b.qtd - a.qtd; });
      atr.pendentes = arr(ac.pendentes).length;
    }

    /* ---------- a diferença, dita em voz alta ---------- */
    var semDono = r2(exec.total - atr.total);
    var aviso = "";
    if (semDono > 0.005 && exec.total > 0) {
      aviso = "De " + exec.total + " " + alvo + " executados, " + atr.total + " estão atribuídos a alguém. "
        + "A diferença (" + semDono + ") ou está em diário ainda não aprovado, ou foi lançada sem dono.";
    } else if (semDono < -0.005) {
      /* ⚠ Não deveria acontecer: `Producao.validarItem` recusa atribuir mais
         do que o executado. Se acontecer, é dado vindo de fora (importação,
         merge da nuvem) e a tela precisa gritar, não arredondar. */
      aviso = "Atribuído (" + atr.total + ") MAIOR que o executado (" + exec.total + "). Confira os diários — isso não deveria acontecer.";
    }

    return {
      unidade: alvo,
      obraId: obraId,
      de: txt(o.de), ate: txt(o.ate),
      executado: exec,
      atribuido: atr,
      semDono: semDono,
      divergem: Math.abs(semDono) > 0.005,
      foraDaUnidade: foraDaUnidade,
      aviso: aviso
    };
  };

  /* Uma linha por obra — para o Painel, que agrega o portfólio.
     `obras` entra por injeção (o motor não lê o Store). */
  M2.porObra = function (rdos, obras, opcoes) {
    var o = opcoes || {};
    var nomes = {};
    arr(obras).forEach(function (ob) { if (ob && ob.id) nomes[txt(ob.id)] = ob.nome || ob.titulo || ""; });
    var ids = [];
    arr(rdos).forEach(function (r) {
      var k = txt(r && r.obraId);
      if (k && ids.indexOf(k) < 0) ids.push(k);
    });
    return ids.map(function (id) {
      var m = M2.daObra(rdos, { obraId: id, de: o.de, ate: o.ate, unidade: o.unidade, estadosExecutado: o.estadosExecutado });
      return {
        obraId: id, nome: nomes[id] || "(obra removida)",
        executado: m.executado.total, atribuido: m.atribuido.total, semDono: m.semDono
      };
    }).sort(function (a, b) { return b.executado - a.executado; });
  };

  global.M2 = M2;
  if (typeof module !== "undefined" && module.exports) module.exports = M2;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
