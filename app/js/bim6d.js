/* =====================================================================
 * bim6d.js — Motor 6D/7D do BIM (PURO, sem DOM/Store/Three): ciclo de
 * vida da edificação a partir do modelo.
 *   6D = plano de manutenção preventiva por categoria de serviço
 *        (VUP mínima da NBR 15575 + periodicidade da prática/NBR 5674).
 *   7D = custo do ciclo de vida no horizonte (default 20 anos):
 *        custo inicial da obra + manutenções ano a ano.
 *
 * TUDO aqui é ESTIMATIVA PARAMÉTRICA e sai ROTULADO como tal — VUPs são
 * as mínimas de norma e os percentuais são prática de mercado conservadora.
 * Não substitui plano de manutenção contratado (NBR 5674) nem laudo.
 *
 * Contrato viewer-agnóstico: recebe elementos [{ id, cat, tipo?, qto? }]
 * com cat = categoria de serviço do BIM4D (mesmos ids de bim4d.js/catDoTipo:
 * fundacao, estrutura, alvenaria, cobertura, revestimento, instalacoes,
 * esquadrias — e, via carimbo de etapa, impermeabilizacao, loucas, pintura).
 * Categoria fora da TABELA cai numa linha "Outros" — NUNCA quebra.
 * Node-testável. Não inventa preço: sem custo da categoria → custo null.
 * ===================================================================== */
(function (global) {
  "use strict";

  var ROTULO = "Estimativa paramétrica (VUP mínima NBR 15575 + periodicidade prática de mercado/NBR 5674) — não substitui plano de manutenção contratado.";

  /* TABELA por categoria (ids IDÊNTICOS aos do BIM4D.catDoTipo/NOME_CAT):
   *   vupAnos       — VUP MÍNIMA de projeto (NBR 15575-1, Anexo C) — fonte de cada nº no comentário.
   *   manutAnualPct — custo anual de conservação/pequenos reparos como % do custo
   *                   inicial da categoria (prática de mercado/NBR 5674, conservador).
   *   intervencoes  — eventos discretos {tipo, aCadaAnos, custoPctInicial(%)}.
   * Se a categoria NÃO traz intervenção "substituição", o plano injeta uma
   * automática a cada vupAnos (fim da vida útil ⇒ trocar). */
  var TABELA = {
    fundacao: { // NBR 15575: fundação ≥ 50 anos (junto da estrutura principal)
      vupAnos: 50, manutAnualPct: 0.2, // prática: quase nada além de inspeção (NBR 5674)
      intervencoes: [{ tipo: "inspeção", aCadaAnos: 10, custoPctInicial: 0.1 }]
    },
    estrutura: { // NBR 15575: estrutura principal ≥ 50 anos
      vupAnos: 50, manutAnualPct: 0.5, // prática: inspeção + reparos pontuais de concreto
      intervencoes: [
        { tipo: "inspeção", aCadaAnos: 5, custoPctInicial: 0.1 },
        { tipo: "manutenção", aCadaAnos: 10, custoPctInicial: 1 } // tratamento fissuras/carbonatação
      ]
    },
    alvenaria: { // NBR 15575: vedação vertical ≥ 40 anos
      vupAnos: 40, manutAnualPct: 1, // prática: fissuras, requadros, pontos de umidade
      intervencoes: [
        { tipo: "inspeção", aCadaAnos: 5, custoPctInicial: 0.1 },
        { tipo: "manutenção", aCadaAnos: 10, custoPctInicial: 2 }
      ]
    },
    cobertura: { // NBR 15575: cobertura ≥ 20 anos
      vupAnos: 20, manutAnualPct: 2, // prática: limpeza calhas, telhas quebradas, rufos (NBR 5674)
      intervencoes: [
        { tipo: "inspeção", aCadaAnos: 2, custoPctInicial: 0.3 },
        { tipo: "manutenção", aCadaAnos: 5, custoPctInicial: 3 }
      ] // substituição automática no ano 20 (fim da VUP)
    },
    impermeabilizacao: { // NBR 15575: impermeabilização ≥ 20 anos
      vupAnos: 20, manutAnualPct: 1,
      intervencoes: [
        { tipo: "inspeção", aCadaAnos: 3, custoPctInicial: 0.2 },
        { tipo: "reforma", aCadaAnos: 10, custoPctInicial: 20 } // reforço de mantas/juntas na meia-vida (prática)
      ]
    },
    instalacoes: { // NBR 15575: hidráulicas ≥ 20 / elétricas ≥ 25 — bim4d tem UMA categoria ⇒ adota 20 (pior caso, conservador)
      vupAnos: 20, manutAnualPct: 2.5, // prática: registros, vedações, disjuntores, chuveiros (NBR 5674)
      intervencoes: [
        { tipo: "inspeção", aCadaAnos: 2, custoPctInicial: 0.3 },
        { tipo: "manutenção", aCadaAnos: 5, custoPctInicial: 5 }
      ]
    },
    revestimento: { // NBR 15575: revestimento interno aderido ≥ 13 / fachada ≥ 20 — adota 13 (pior caso)
      vupAnos: 13, manutAnualPct: 1.5, // prática: rejuntes, peças soltas, reparos localizados
      intervencoes: [{ tipo: "inspeção", aCadaAnos: 3, custoPctInicial: 0.2 }]
    },
    esquadrias: { // NBR 15575: esquadrias externas ≥ 30 anos
      vupAnos: 30, manutAnualPct: 1, // prática: ferragens, roldanas, vedações/silicone
      intervencoes: [{ tipo: "manutenção", aCadaAnos: 5, custoPctInicial: 3 }]
    },
    loucas: { // NBR 15575: louças/metais sanitários ≥ 20 anos (aparentes)
      vupAnos: 20, manutAnualPct: 1, // prática: reparos de válvulas, sifões, vedantes
      intervencoes: [{ tipo: "manutenção", aCadaAnos: 5, custoPctInicial: 2 }]
    },
    pintura: { // NBR 15575: pintura ≥ 8 anos (repintura integral por ciclo)
      vupAnos: 8, manutAnualPct: 2, // prática: retoques e lavagem entre ciclos
      // a REPINTURA integral (100% do custo inicial da pintura) a cada ciclo de 8 anos
      // JÁ É a substituição — por isso o plano não injeta outra automática.
      intervencoes: [{ tipo: "substituição", aCadaAnos: 8, custoPctInicial: 100 }]
    }
  };

  // Categoria fora da TABELA → defaults conservadores (linha "Outros").
  var OUTROS = { vupAnos: 25, manutAnualPct: 1, intervencoes: [] };
  var CAT_OUTROS = "Outros";

  function num(x) { var n = parseFloat(x); return isNaN(n) ? 0 : n; }
  function arred2(v) { return Math.round(v * 100) / 100; }
  function temSubstituicao(intervencoes) {
    for (var i = 0; i < (intervencoes || []).length; i++) {
      if (intervencoes[i] && intervencoes[i].tipo === "substituição") return true;
    }
    return false;
  }

  // Eventos de UMA categoria no horizonte: intervenções cíclicas + substituição
  // automática ao fim da VUP (quando a tabela não define a sua própria).
  // custo = custo inicial da categoria (>0) ou null ⇒ custoEstimado null (não inventa).
  function eventosDe(regra, horizonte, custo) {
    var evs = [], i, iv, ano;
    var lista = (regra.intervencoes || []).slice();
    if (regra.vupAnos > 0 && regra.vupAnos <= horizonte && !temSubstituicao(lista)) {
      lista.push({ tipo: "substituição", aCadaAnos: regra.vupAnos, custoPctInicial: 100 });
    }
    for (i = 0; i < lista.length; i++) {
      iv = lista[i];
      if (!iv || !(iv.aCadaAnos > 0)) continue;
      for (ano = iv.aCadaAnos; ano <= horizonte; ano += iv.aCadaAnos) {
        evs.push({
          ano: ano, tipo: iv.tipo, custoPctInicial: iv.custoPctInicial,
          custoEstimado: (custo > 0) ? arred2(custo * num(iv.custoPctInicial) / 100) : null
        });
      }
    }
    evs.sort(function (a, b) { return a.ano - b.ano || String(a.tipo).localeCompare(String(b.tipo)); });
    return evs;
  }

  /* 6D — plano de manutenção preventiva.
   * elementos          = [{ id, cat, tipo?, qto? }] (cat = categoria do BIM4D)
   * custosPorCategoria = { categoria: custoInicialR$ } — pode vir vazio ⇒ plano
   *                      só com cronograma físico (custos null).
   * opts.horizonteAnos = horizonte (default 20).
   * Devolve { linhas, porAno, custoTotalManut, alertaVup, horizonteAnos, rotulo, avisos }. */
  function plano(elementos, custosPorCategoria, opts) {
    opts = opts || {};
    var horizonte = (opts.horizonteAnos > 0) ? Math.floor(opts.horizonteAnos) : 20;
    var custos = custosPorCategoria || {};
    var els = (elementos || []).filter(function (e) { return !!e; });

    // agrega elementos por categoria; desconhecida → "Outros" (nunca quebra)
    var grupos = {}; // catFinal → { nElementos, custo(soma p/ Outros), regra }
    els.forEach(function (el) {
      var cat = String(el.cat || "").trim();
      var conhecida = !!TABELA[cat];
      var chave = conhecida ? cat : CAT_OUTROS;
      var g = grupos[chave];
      if (!g) g = grupos[chave] = { nElementos: 0, custo: 0, temCusto: false, regra: conhecida ? TABELA[cat] : OUTROS, catsOrigem: {} };
      g.nElementos += 1;
      if (!conhecida && cat) g.catsOrigem[cat] = 1;
    });

    // custo inicial por linha: chave exata; na linha Outros soma o custo das
    // categorias desconhecidas que caíram nela (+ chave "Outros"/"outros" se houver)
    Object.keys(grupos).forEach(function (chave) {
      var g = grupos[chave], c = 0, achou = false;
      if (chave === CAT_OUTROS) {
        Object.keys(g.catsOrigem).forEach(function (co) {
          if (custos[co] > 0) { c += num(custos[co]); achou = true; }
        });
        if (custos[CAT_OUTROS] > 0) { c += num(custos[CAT_OUTROS]); achou = true; }
        if (custos.outros > 0) { c += num(custos.outros); achou = true; }
      } else if (custos[chave] > 0) { c = num(custos[chave]); achou = true; }
      g.custo = achou ? arred2(c) : null;
      g.temCusto = achou;
    });

    var linhas = Object.keys(grupos).map(function (chave) {
      var g = grupos[chave];
      return {
        categoria: chave,
        nElementos: g.nElementos,
        vupAnos: g.regra.vupAnos,
        manutAnualPct: g.regra.manutAnualPct,
        custoInicial: g.temCusto ? g.custo : null,
        manutAnualEstimada: g.temCusto ? arred2(g.custo * g.regra.manutAnualPct / 100) : null,
        eventos: eventosDe(g.regra, horizonte, g.temCusto ? g.custo : null)
      };
    });
    // ordena pela VUP crescente (o que vence primeiro aparece primeiro)
    linhas.sort(function (a, b) { return a.vupAnos - b.vupAnos || String(a.categoria).localeCompare(String(b.categoria)); });

    // fluxo anual: conservação contínua (manutAnualPct) + eventos discretos do ano
    var porAno = [];
    if (linhas.length) {
      var ano, total, i, j, l;
      for (ano = 1; ano <= horizonte; ano++) {
        total = 0;
        for (i = 0; i < linhas.length; i++) {
          l = linhas[i];
          if (l.manutAnualEstimada != null) total += l.manutAnualEstimada;
          for (j = 0; j < l.eventos.length; j++) {
            if (l.eventos[j].ano === ano && l.eventos[j].custoEstimado != null) total += l.eventos[j].custoEstimado;
          }
        }
        porAno.push({ ano: ano, custoTotal: arred2(total) });
      }
    }
    var custoTotalManut = arred2(porAno.reduce(function (s, a) { return s + a.custoTotal; }, 0));

    // alerta: categorias cuja VUP termina DENTRO do horizonte ⇒ substituição no plano
    var alertaVup = linhas.filter(function (l) { return l.vupAnos <= horizonte; })
      .map(function (l) { return l.categoria; });

    var avisos = [ROTULO];
    if (!Object.keys(custos).length) avisos.push("Sem custos por categoria: plano devolvido só com o cronograma físico (custos null) — vincule o orçamento para estimar R$.");
    if (alertaVup.length) avisos.push("Categoria(s) com fim de vida útil (VUP) dentro do horizonte de " + horizonte + " anos: " + alertaVup.join(", ") + " — substituição incluída no plano.");
    if (!linhas.length) avisos.push("Nenhum elemento para planejar.");

    return {
      linhas: linhas, porAno: porAno, custoTotalManut: custoTotalManut,
      alertaVup: alertaVup, horizonteAnos: horizonte, rotulo: ROTULO, avisos: avisos
    };
  }

  /* 7D — custo do ciclo de vida: custo inicial (ano 0) + manutenções ano a ano.
   * custoInicial = custo da obra (R$); porAno = saída de plano().porAno.
   * Devolve { anos:[{ano:0..H, custoAno, custoAcumulado}], custoTotal20anos,
   *           custoTotal, pctManutSobreInicial, horizonteAnos, rotulo }. */
  function cicloDeVida(custoInicial, porAno, opts) {
    opts = opts || {};
    var fluxo = porAno || [], mapa = {}, maxAno = 0, i;
    for (i = 0; i < fluxo.length; i++) {
      if (!fluxo[i]) continue;
      var a = Math.floor(num(fluxo[i].ano));
      if (a > 0) { mapa[a] = (mapa[a] || 0) + num(fluxo[i].custoTotal); if (a > maxAno) maxAno = a; }
    }
    var H = (opts.horizonteAnos > 0) ? Math.floor(opts.horizonteAnos) : (maxAno || 20);
    var inicial = num(custoInicial);
    var anos = [{ ano: 0, custoAno: arred2(inicial), custoAcumulado: arred2(inicial) }];
    var acum = inicial, totalManut = 0, ano;
    for (ano = 1; ano <= H; ano++) {
      var c = mapa[ano] || 0;
      acum += c; totalManut += c;
      anos.push({ ano: ano, custoAno: arred2(c), custoAcumulado: arred2(acum) });
    }
    return {
      anos: anos,
      custoTotal20anos: arred2(acum), // nome do contrato (horizonte default 20); vale p/ o H usado
      custoTotal: arred2(acum),
      pctManutSobreInicial: inicial > 0 ? arred2(totalManut / inicial * 100) : null,
      horizonteAnos: H, rotulo: ROTULO
    };
  }

  var BIM6D = {
    TABELA: TABELA, OUTROS: OUTROS, ROTULO: ROTULO,
    plano: plano, cicloDeVida: cicloDeVida,
    _eventosDe: eventosDe
  };
  global.BIM6D = BIM6D;
  if (typeof module !== "undefined" && module.exports) module.exports = BIM6D;
})(typeof window !== "undefined" ? window : this);
