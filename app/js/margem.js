/* =====================================================================
 * margem.js — MARGEM DE LUCRO DO ORÇAMENTO (motor puro, sem DOM)
 *
 * A pergunta que este módulo responde: "quanto sobra de lucro neste preço?"
 * e a inversa: "quero R$ 120.000 de lucro — que BDI eu cobro?".
 *
 * A CONTA (fórmula TCU, Acórdão 2.622/2013, js/bdi.js):
 *   BDI = [ (1+AC+S+R+G) × (1+DF) × (1+L) ÷ (1−I) ] − 1
 *   X          = (1+AC+S+R+G) × (1+DF)
 *   preço      = CD × (1 + BDI) = CD × X × (1+L) ÷ (1−I)
 *   lucro (R$) = CD × X × L          (líquido de impostos: preço×(1−I) − CD×X)
 *
 * ⚠ O LUCRO É MEDIDO NO PREÇO REAL, NÃO SÓ NA FÓRMULA. O motor da casa trunca
 *   cada unitário em 2 casas (Orcamento.calcular), então o preço que sai na
 *   tela difere da fórmula em alguns centavos. Por isso:
 *       lucro = precoVenda_real × (1 − I) − CD × X
 *   — idêntico à fórmula quando o preço é exato, e honesto quando não é.
 *   Roteiro do defeito que isto impede: resolver o L só pela fórmula e a tela
 *   mostrar R$ 119.987 quando a pessoa pediu R$ 120.000.
 *
 * ⚠ O PERCENTUAL É GRAVADO COM 8 CASAS (como o Fechamento grava com 6). O
 *   Bdi.calcular arredonda em 2 casas — num custo de R$ 500 mil isso é um
 *   degrau de ~R$ 50 no preço, e a meta de R$ 120.000 nunca fecharia ao
 *   centavo. A busca final (_refinar) roda o Orcamento.calcular de verdade
 *   sobre o percentual até o preço real cair no alvo. Os parâmetros gravados
 *   continuam coerentes: Bdi.calcular(params) difere do percentual ≤ 0,005.
 *
 * ⚠ SÓ HÁ COMPOSIÇÃO QUANDO O ORÇAMENTO A GUARDA (Bdi.composicaoDoOrcamento).
 *   BDI digitado só como percentual: as parcelas vêm do modelo do orçamento
 *   (Bdi.paramsParaPercentual) e TUDO que sai daqui leva a marca "estimado".
 *
 * ⚠ NÃO HÁ "POR ETAPA". Mexer no custo unitário de algumas etapas para
 *   fabricar lucro falsificaria o custo (o acréscimo viraria "custo" e só a
 *   fatia L dele contaria como lucro) e quebraria a rastreabilidade das
 *   Ajustes. A única via é o BDI. Ver o retorno desta entrega.
 *
 * Módulo PURO: sem DOM, sem rede, testável no Node. Nunca devolve NaN: o
 * que não dá para calcular volta com { ok:false, motivo }.
 * ===================================================================== */
(function (global) {
  "use strict";

  var CHAVE_PREVIA = "orcapro:tela:motor:v1";
  var ESCALA = 1e8;            // casas do percentual gravado (8)
  var PARCELAS = ["AC", "S", "R", "G", "DF", "L", "I"];

  function U() { return global.Util; }
  function num(v) { var n = U().num(v); return isFinite(n) ? n : 0; }
  function fin(x) { return typeof x === "number" && isFinite(x); }
  function r2(x) { return Math.round(x * 100) / 100; }
  function r8(x) { return Math.round(x * ESCALA) / ESCALA; }

  /* a prévia `?previa=motor` (App._PREVIAS) grava esta chave; ligada neste aparelho? */
  function previa() {
    try {
      var v = (typeof localStorage !== "undefined") ? localStorage.getItem(CHAVE_PREVIA) : null;
      return !!v && JSON.parse(v).motor === true;
    } catch (e) { return false; }
  }

  /* ---------------------------------------------------------------
   * TRAVAS DE EDIÇÃO. Cada uma devolve a PORTA (o que a pessoa faz).
   * --------------------------------------------------------------- */
  function bloqueio(orc) {
    if (!orc) return { motivo: "Não há orçamento aberto.", porta: "" };
    var Orc = global.Orcamento;
    var est = String(orc.estadoAprovacao || "").trim();
    if ((Orc && Orc.travadoPorAprovacao && Orc.travadoPorAprovacao(orc)) || est === "contratado" || est === "assinado") {
      return {
        motivo: "Este orçamento está aprovado: o preço aprovado é o que chegou ao cliente e não se altera por baixo.",
        porta: "Crie uma revisão (a revisão nasce como orçamento próprio, com tudo copiado) e ajuste a margem nela.",
        acao: "revisao"
      };
    }
    if (orc.fechamento && typeof orc.fechamento === "object") {
      return {
        motivo: "Este orçamento foi fechado em um valor (Fechar em um valor…). Mudar o BDI agora desmancharia esse fechamento sem registro.",
        porta: "Use «Desfazer fechamento» ao lado do preço de venda e volte aqui.",
        acao: "desfazer-fechamento"
      };
    }
    return null;
  }

  /* ---------------------------------------------------------------
   * A BASE: as parcelas que valem para a conta (e se são estimadas)
   * --------------------------------------------------------------- */
  function paramsNumericos(p) {
    var o = {}; PARCELAS.forEach(function (k) { o[k] = num(p && p[k]); }); return o;
  }
  function fatorX(p) {   // (1+AC+S+R+G)(1+DF) com as parcelas em %
    return (1 + (p.AC + p.S + p.R + p.G) / 100) * (1 + p.DF / 100);
  }

  function _precoCom(orc, pct) {
    /* cópia RASA: o Orcamento.calcular só lê orc.bdi.percentual do BDI, e o
       original não pode ser tocado numa simulação */
    var c = {}, k;
    for (k in orc) { if (Object.prototype.hasOwnProperty.call(orc, k)) c[k] = orc[k]; }
    c.bdi = { percentual: pct };
    return global.Orcamento.calcular(c).precoVenda;
  }

  function _faixa(orc, pct) {
    var cfg = (orc && orc.config) || {};
    var publico = !!(cfg.licitacao && cfg.licitacao.ativo);
    var aviso = null;
    if (publico && global.Bdi && global.Bdi.avisoFaixa) { try { aviso = global.Bdi.avisoFaixa(pct); } catch (e) { aviso = null; } }
    return { publico: publico, aviso: aviso };
  }

  function _descreve(orc, base, cd, preco, pct) {
    var X = fatorX(base.params), I = Math.min(base.params.I, 99.99) / 100;
    var lucro = preco * (1 - I) - cd * X;
    var L = (preco * (1 - I) / (cd * X) - 1) * 100;
    return {
      L: L, bdiPct: pct, precoVenda: preco, custoDireto: cd,
      lucroReais: lucro, pctSobrePreco: preco > 0 ? lucro / preco * 100 : 0, pctSobreCusto: lucro / cd * 100
    };
  }

  /* modo de incidência do BDI e arredondamento: mudar qualquer um muda o preço que o cálculo previu */
  function _cfgOrc(orc) {
    var c = (orc && orc.config) || {};
    return { incidencia: String(c.bdiIncidencia == null ? "" : c.bdiIncidencia), arredondamento: String(c.arredondamento == null ? "" : c.arredondamento) };
  }

  function _base(orc) {
    var Orc = global.Orcamento, Bdi = global.Bdi;
    if (!orc || !Orc || !Bdi) return { ok: false, motivo: "Não há orçamento para calcular." };
    var c;
    try { c = Orc.calcular(orc); } catch (e) { return { ok: false, motivo: "Não consegui calcular o orçamento: " + (e && e.message ? e.message : e) }; }
    var cd = c.custoDireto, preco = c.precoVenda, pct = c.pct;
    if (!fin(cd) || !(cd > 0)) return { ok: false, motivo: "O custo direto do orçamento é zero: sem custo não há margem para calcular. Lance itens com preço.", cd: 0 };
    if (!fin(preco) || !fin(pct)) return { ok: false, motivo: "O preço de venda ou o BDI do orçamento não é um número válido." };
    var comp = Bdi.composicaoDoOrcamento(orc), params, estimado = !comp.detalhado, modeloBase = "", avisos = [];
    if (comp.detalhado) {
      params = paramsNumericos(orc.bdi.params);
      if (!comp.confere) avisos.push("As parcelas gravadas resultam em " + U().fmtNum(comp.calculado, 2) + "% de BDI, mas o orçamento cobra " + U().fmtNum(comp.percentual, 2) +
        "% (é o percentual que manda nos preços). O lucro abaixo é o do preço realmente cobrado.");
    } else {
      var mid = (orc.bdi && orc.bdi.modeloId) || "";
      var preset = (global.CONFIG && global.CONFIG.bdiPresets && global.CONFIG.bdiPresets[mid]) ? mid : "padrao";
      modeloBase = preset;
      params = paramsNumericos(Bdi.paramsParaPercentual(pct, Bdi.paramsDoModelo(preset)));
    }
    if (params.I >= 100) return { ok: false, motivo: "Os impostos (I) do BDI chegam a 100% ou mais: não existe preço que dê lucro. Corrija a parcela Impostos na aba BDI." };
    var X = fatorX(params);
    if (!fin(X) || !(X > 0)) return { ok: false, motivo: "As parcelas do BDI (AC, S, R, G, DF) resultam em fator zero ou negativo; corrija-as na aba BDI." };
    if (c.precoOpcional > 0) avisos.push("O preço de venda inclui " + U().fmtMoeda(c.precoOpcional) + " de etapas marcadas como adicional opcional; o BDI é um só para o orçamento inteiro, então a margem vale para tudo.");
    return { ok: true, cd: cd, preco: preco, pct: pct, params: params, X: X, I: params.I / 100, estimado: estimado, modeloBase: modeloBase, avisos: avisos, comp: comp, calc: c };
  }

  /* ---------------------------------------------------------------
   * LUCRO ATUAL
   * --------------------------------------------------------------- */
  function lucroAtual(orc) {
    var b = _base(orc);
    if (!b.ok) return { ok: false, motivo: b.motivo, estimado: false, avisos: [] };
    var d = _descreve(orc, b, b.cd, b.preco, b.pct);
    var f = _faixa(orc, b.pct);
    var avisos = b.avisos.slice();
    if (d.lucroReais < 0) avisos.push("O lucro deste preço é NEGATIVO: o BDI cobrado não cobre nem as despesas e os impostos do modelo" + (b.estimado ? " (estimado)" : "") + ".");
    var out = {
      ok: true, detalhado: !b.estimado, estimado: b.estimado, modeloBase: b.modeloBase,
      rotuloEstimado: b.estimado
        ? "estimado — composição não detalhada: este orçamento guarda só o BDI de " + U().fmtNum(b.pct, 2) + "%. As demais parcelas (AC, S, R, G, DF e Impostos) vêm do modelo «" +
          ((global.CONFIG.bdiPresets[b.modeloBase] || {}).nome || b.modeloBase) + "» e o lucro é o que fecha a conta."
        : "",
      params: b.params, X: b.X, I: b.I,
      custoDireto: b.cd, precoVenda: b.preco, bdiPct: b.pct,
      L: d.L, lucroReais: r2(d.lucroReais), pctSobrePreco: d.pctSobrePreco, pctSobreCusto: d.pctSobreCusto,
      /* a conta direta das parcelas gravadas (CD × X × L). Difere do `lucroReais` por centavos de
         truncamento e pelo BDI de 2 casas (num custo de R$ 500 mil, até ~R$ 20): a tela mostra o
         primeiro (o que o preço realmente deixa) e explica a diferença quando ela passa de R$ 0,01 */
      lucroFormula: b.estimado ? null : r2(b.cd * b.X * (b.params.L / 100)),
      confere: b.comp.confere, publico: f.publico, avisoFaixa: f.aviso,
      bloqueio: bloqueio(orc), avisos: avisos
    };
    return out;
  }

  /* ---------------------------------------------------------------
   * META — forma fechada + refino contra o orçamento real
   * alvo: { reais: n }  |  { pct: n, base: "preco" | "custo" }  (número solto = reais)
   * --------------------------------------------------------------- */
  function _lerAlvo(alvo) {
    var a = (alvo != null && typeof alvo === "object") ? alvo : { reais: alvo };
    var temR = a.reais != null && String(a.reais).trim() !== "";
    var temP = a.pct != null && String(a.pct).trim() !== "";
    if (!temR && !temP) return { ok: false, motivo: "Informe o lucro desejado, em reais ou em percentual." };
    if (temR && temP) return { ok: false, motivo: "Informe a meta em reais OU em percentual, não os dois." };
    var v = num(temR ? a.reais : a.pct), txt = String(temR ? a.reais : a.pct).replace(/[^0-9,.\-]/g, "");
    if (!txt || !fin(v)) return { ok: false, motivo: "O valor da meta não é um número válido." };
    if (v < 0) return { ok: false, motivo: "Meta de lucro negativa não é aceita: abaixo de zero é prejuízo, e isto não é um simulador de prejuízo. Informe zero ou mais." };
    if (temR) return { ok: true, tipo: "reais", valor: v };
    return { ok: true, tipo: "pct", valor: v, base: a.base === "custo" ? "custo" : "preco" };
  }

  /* refina o percentual contra o Orcamento.calcular REAL: acha o percentual (8 casas)
     cujo preço fica mais perto do preço-alvo. O preço é uma ESCADA crescente do
     percentual (trunca item a item): bisseção em inteiros de 1e-8 pp. */
  function _refinar(orc, p0, precoAlvo) {
    var f = function (i) { return _precoCom(orc, i / ESCALA); };
    var i0 = Math.round(p0 * ESCALA), passo = Math.round(1 * ESCALA), lo = i0 - passo, hi = i0 + passo, n = 0;
    var plo = f(lo), phi = f(hi);
    while (plo >= precoAlvo && n < 8) { hi = lo; phi = plo; lo -= passo * Math.pow(2, n + 1); plo = f(lo); n++; }
    n = 0;
    while (phi < precoAlvo && n < 8) { lo = hi; plo = phi; hi += passo * Math.pow(2, n + 1); phi = f(hi); n++; }
    if (!(plo < precoAlvo && phi >= precoAlvo)) {
      return { achou: false, pct: p0, preco: f(i0) };
    }
    var it = 0;
    while (hi - lo > 1 && it < 80) {
      var mid = Math.floor((lo + hi) / 2), pm = f(mid);
      if (pm >= precoAlvo) { hi = mid; phi = pm; } else { lo = mid; plo = pm; }
      it++;
    }
    return Math.abs(plo - precoAlvo) < Math.abs(phi - precoAlvo)
      ? { achou: true, pct: lo / ESCALA, preco: plo }
      : { achou: true, pct: hi / ESCALA, preco: phi };
  }

  function resolverPorLucro(orc, alvo) {
    var a = _lerAlvo(alvo);
    if (!a.ok) return { ok: false, motivo: a.motivo };
    var b = _base(orc);
    if (!b.ok) return { ok: false, motivo: b.motivo };
    var antes = lucroAtual(orc);
    var cd = b.cd, X = b.X, I = b.I, Lfrac, motivo = "";
    if (a.tipo === "reais") {
      Lfrac = a.valor / (cd * X);
    } else if (a.base === "custo") {
      Lfrac = (a.valor / 100) / X;
    } else {
      var p = a.valor / 100;
      if (p >= 1 - I) motivo = "Inalcançável: lucro de " + U().fmtNum(a.valor, 2) + "% sobre o preço de venda não cabe — com impostos de " + U().fmtNum(I * 100, 2) + "%, o máximo teórico é abaixo de " + U().fmtNum((1 - I) * 100, 2) + "% do preço.";
      else Lfrac = p / (1 - I - p);   // L(1−I) = p(1+L)
    }
    if (motivo) return { ok: false, motivo: motivo, antes: antes };
    if (!fin(Lfrac) || Lfrac < 0) return { ok: false, motivo: "Não consegui resolver a meta (resultado fora do possível).", antes: antes };

    var Lalvo = Lfrac * 100;
    var lucroAlvo = cd * X * Lfrac;
    var p0 = ((X * (1 + Lfrac)) / (1 - I) - 1) * 100;              // forma fechada, sem arredondar
    var precoAlvo = (lucroAlvo + cd * X) / (1 - I);
    var rf = _refinar(orc, p0, precoAlvo);
    var pct = r8(rf.achou ? rf.pct : p0);
    var preco = _precoCom(orc, pct);

    var params = JSON.parse(JSON.stringify(b.params));
    params.L = r8(((1 + pct / 100) * (1 - I) / X - 1) * 100);      // L coerente com o percentual gravado
    var dep = _descreve(orc, { params: params }, cd, preco, pct);
    var erro = r2(dep.lucroReais - lucroAlvo);
    var avisos = [];
    if (!rf.achou) avisos.push("Não consegui refinar o preço contra o orçamento real; o valor abaixo é o da fórmula e pode diferir em centavos.");
    else if (Math.abs(erro) > 0.01) avisos.push("O arredondamento do orçamento não deixa fechar ao centavo: a diferença para a meta é de " + U().fmtMoeda(Math.abs(erro)) + ".");
    var f = _faixa(orc, pct);
    var fAntes = _faixa(orc, b.pct);
    /* idempotência: já está na meta (±R$ 0,01) → nada a gravar */
    /* ⚠ SEM MUDANÇA = o mesmo percentual e as mesmas parcelas do que já está gravado. NÃO é "lucro a
       R$ 0,01 da meta": o preço do orçamento é uma escada (trunca item a item) e a meta pode ficar a
       dezenas de centavos do alvo mesmo na melhor escolha — comparar com o alvo faria o 2º "Aplicar"
       gravar de novo. Comparar com o RESOLVIDO é idempotente por construção (mesma entrada, mesma saída).
       Composição ESTIMADA nunca é "sem mudança": gravar a meta é o que a torna detalhada. */
    var semMudanca = !!(antes.ok && !antes.estimado && Math.abs(b.pct - pct) < 1e-7 && Math.abs(b.params.L - params.L) < 1e-6);

    return {
      ok: true, meta: a, semMudanca: semMudanca,
      origem: { percentual: b.pct, custoDireto: cd, precoVenda: b.preco, estimado: b.estimado, incidencia: _cfgOrc(orc).incidencia, arredondamento: _cfgOrc(orc).arredondamento },
      antes: antes,
      depois: {
        L: dep.L, Lalvo: Lalvo, params: params, percentual: pct, bdiPct: pct, precoVenda: preco, custoDireto: cd,
        lucroReais: r2(dep.lucroReais), pctSobrePreco: dep.pctSobrePreco, pctSobreCusto: dep.pctSobreCusto,
        lucroAlvo: r2(lucroAlvo), erroReais: erro,
        publico: f.publico, avisoFaixa: f.aviso
      },
      deltaPreco: r2(preco - b.preco),
      estimado: b.estimado, rotuloEstimado: antes.rotuloEstimado || "",
      avisoFaixaAntes: fAntes.aviso,
      avisos: avisos.concat(b.avisos)
    };
  }

  /* ---------------------------------------------------------------
   * VALIDAR / APLICAR
   * --------------------------------------------------------------- */
  function validar(orc, res) {
    if (!orc) return { ok: false, motivo: "Não há orçamento aberto." };
    var bl = bloqueio(orc);
    if (bl) return { ok: false, motivo: bl.motivo, porta: bl.porta, acao: bl.acao };
    if (!res || !res.ok || !res.depois || !res.depois.params) return { ok: false, motivo: (res && res.motivo) || "Não há uma meta calculada para aplicar." };
    var d = res.depois;
    if (!fin(d.percentual) || !fin(d.params.L)) return { ok: false, motivo: "Os valores calculados não são válidos." };
    if (global.Bdi && Math.abs(global.Bdi.calcular(d.params) - d.percentual) > 0.01)
      return { ok: false, motivo: "Os parâmetros calculados não reproduzem o BDI (incoerência interna). Nada foi gravado." };
    /* o orçamento mudou desde o cálculo? (custo, BDI) — recalcular antes de gravar */
    var b = _base(orc);
    if (!b.ok) return { ok: false, motivo: b.motivo };
    if (res.origem && (Math.abs(res.origem.percentual - b.pct) > 1e-9 || Math.abs(res.origem.custoDireto - b.cd) > 0.005))
      return { ok: false, motivo: "O orçamento mudou depois do cálculo (custo ou BDI). Calcule a meta de novo." };
    if (res.origem) {
      var cfgAgora = _cfgOrc(orc);
      if ((res.origem.precoVenda != null && Math.abs(res.origem.precoVenda - b.preco) > 0.005) ||
          (res.origem.incidencia != null && res.origem.incidencia !== cfgAgora.incidencia) ||
          (res.origem.arredondamento != null && res.origem.arredondamento !== cfgAgora.arredondamento))
        return { ok: false, motivo: "O orçamento mudou depois do cálculo — calcule de novo." };
    }
    return { ok: true };
  }

  function aplicar(orc, res) {
    var v = validar(orc, res);
    if (!v.ok) return v;
    if (res.semMudanca) return { ok: true, aplicou: false, motivo: "O orçamento já está nesta meta (mesmo BDI e mesmas parcelas). Nada foi alterado." };
    var d = res.depois, antes = JSON.parse(JSON.stringify(orc.bdi || {}));
    /* o MESMO caminho da aba BDI (Orcamento.aplicarBdi grava params + percentual + modeloId
       juntos); depois fixa o percentual refinado, que o arredondamento de 2 casas não alcança */
    /* ⚠ mantém o modeloId original (só o L mudou); sem modelo gravado, "custom" */
    var mid = (antes.modeloId && String(antes.modeloId)) || "custom";
    global.Orcamento.aplicarBdi(orc, mid, JSON.parse(JSON.stringify(d.params)));
    orc.bdi.percentual = d.percentual;
    var apos = lucroAtual(orc);
    return { ok: true, aplicou: true, bdiAntes: antes, depois: apos };
  }

  var Margem = {
    previa: previa, bloqueio: bloqueio, lucroAtual: lucroAtual,
    resolverPorLucro: resolverPorLucro, validar: validar, aplicar: aplicar,
    /* só para o teste: a escala do percentual gravado */
    _ESCALA: ESCALA
  };
  global.Margem = Margem;
  if (typeof module !== "undefined" && module.exports) module.exports = Margem;
})(typeof window !== "undefined" ? window : globalThis);
