/* =====================================================================
 * orcbases.js — ATUALIZAR PREÇOS PARA OUTRA BASE e COMPARAR BASES (motor)
 *
 * Duas ferramentas sobre o mesmo cálculo — "qual seria o preço deste item na base X":
 *   prever / aplicar   → "Atualizar preços para a base X/competência Y": prévia item a
 *                        item (antes, depois, %), aplica com um clique;
 *   comparar           → o orçamento lado a lado em duas bases instaladas (SOMENTE LEITURA).
 * O motor não sabe de onde vem a tabela: recebe `resolver(fonte, codigo)` que devolve o
 * item da base ({custoUnitario, custoMO, custoMAT, custoEQ, desonerado?}) ou null. A tela
 * liga o resolver ao `Bases.obter`.
 *
 * ⚠ NUNCA INVENTA PREÇO. Código que a base nova não tem, base sem preço coletado (zero)
 *   e item próprio ficam MARCADOS e com o preço que já tinham — nada é estimado,
 *   interpolado ou convertido por índice.
 * ⚠ SÓ A MESMA BASE ATUALIZA: item da SINAPI atualiza para a SINAPI nova; item da SEINFRA
 *   não vira preço SINAPI por ter o mesmo código numérico. Trocar de base é decisão do
 *   orçamentista, item a item — por isso a ferramenta de comparar existe.
 * ⚠ PREÇO QUE A PESSOA DECIDIU FICA: item com preço de cotação vigente (js/cotpreco.js) ou
 *   com ajuste manual do preço (js/ajustes.js) não é tocado — aparece como "mantido".
 * ⚠ MODO DE CUSTO RESPEITADO: item "só mão de obra" lê a parcela MO da base nova; "só
 *   material e equipamento" lê MAT+EQ (a mesma regra de Orcamento.reprecificarPorCodigo).
 * ⚠ APLICAR NÃO RODA AQUI SOZINHO: a tela cria a revisão automática (js/orcrevisao.js)
 *   ANTES de chamar `aplicar`, para dar volta.
 * Motor puro, ES5, Node-testável: tools/test-orcbases.js.
 * ===================================================================== */
(function (global) {
  "use strict";

  function txt(v) { return v == null ? "" : String(v); }
  function arr(v) { return Object.prototype.toString.call(v) === "[object Array]" ? v : []; }
  function num(v) { v = Number(v); return isFinite(v) ? v : 0; }
  function r2(v) { return Math.round(num(v) * 100) / 100; }
  function cod(s) { var c = txt(s).replace(/^\s+|\s+$/g, ""); return (c === "—" || c === "-") ? "" : c; }

  var OrcBases = {};

  /* a base do item: baseFonte, senão origem ("SINAPI", "SINAPI_DES", "SEINFRA"…). PROPRIO = própria. */
  OrcBases.fonteDe = function (it) {
    var f = txt(it && (it.baseFonte || it.origem)).toUpperCase();
    return f;
  };

  /* SINAPI e SINAPI_DES: o mesmo espaço de códigos */
  OrcBases.familia = function (f) { f = txt(f).toUpperCase(); return f === "SINAPI_DES" ? "SINAPI" : f; };

  /* o preço que a base daria a ESTE item, respeitando o modo de custo; null = não há preço */
  OrcBases.precoNaBase = function (it, bi) {
    if (!bi) return null;
    var cheio = num(bi.custoUnitario), mo = num(bi.custoMO), mat = num(bi.custoMAT), eq = num(bi.custoEQ), u;
    if (it && it.modoCusto === "mo") u = mo;
    else if (it && it.modoCusto === "matEq") u = mat + eq;
    else u = cheio;
    if (!(u > 0)) return null;
    return { unit: u, cheio: cheio, mo: mo, mat: mat, eq: eq };
  };

  function eachItem(orc, fn) {
    arr(orc && orc.etapas).forEach(function (e) { arr(e && e.itens).forEach(function (it) { fn(e, it); }); });
  }

  var MOTIVOS = {
    atualizar: "Atualiza", igual: "Já está igual", sem_correspondencia: "Sem correspondência na base",
    cotacao: "Mantido: preço de cotação", ajustado: "Mantido: preço alterado por você", outra_base: "Mantido: é de outra base", proprio: "Mantido: item próprio",
    sem_codigo: "Mantido: item sem código"
  };
  OrcBases.MOTIVOS = MOTIVOS;

  function classificar(it, alvo, resolver) {
    var f = OrcBases.fonteDe(it), c = cod(it.codigo);
    if (f === "PROPRIO" || f === "PROPRIA" || it.origem === "PROPRIO") return { estado: "proprio" };
    if (!c) return { estado: "sem_codigo" };
    if (f !== txt(alvo.fonte).toUpperCase()) return { estado: "outra_base" };
    if (global.CotPreco && CotPreco.vigente(it)) return { estado: "cotacao" };
    if (it.ajustes && it.ajustes.custoUnitario) return { estado: "ajustado" };
    var bi = resolver(alvo.fonte, c), p = OrcBases.precoNaBase(it, bi);
    if (!p) return { estado: "sem_correspondencia" };
    if (Math.abs(p.unit - num(it.custoUnitario)) < 0.005) return { estado: "igual", base: bi, preco: p };
    return { estado: "atualizar", base: bi, preco: p };
  }

  function totaisDe(orc) { var t = Orcamento.totais(orc); return { custoDireto: r2(t.custoDireto), total: r2(t.precoVenda) }; }
  function clonar(o) { return JSON.parse(JSON.stringify(o)); }

  /* PRÉVIA: uma linha por item, com a situação, o preço de antes e o de depois.
     alvo = { fonte, competencia?, uf?, label? } */
  OrcBases.prever = function (orc, alvo, resolver) {
    var linhas = [], cont = { atualizar: 0, igual: 0, sem_correspondencia: 0, mantidos: 0 };
    eachItem(orc, function (e, it) {
      var r = classificar(it, alvo, resolver), q = num(it.quantidade), antes = num(it.custoUnitario);
      var depois = r.estado === "atualizar" ? r.preco.unit : antes;
      var L = {
        etapaId: e.id, etapa: txt(e.nome), itemId: it.id, codigo: txt(it.codigo), descricao: txt(it.descricao), unidade: txt(it.unidade), quantidade: q,
        estado: r.estado, motivo: MOTIVOS[r.estado], antes: antes, depois: depois,
        dif: r2((depois - antes) * q), pct: antes > 0 && r.estado === "atualizar" ? ((depois - antes) / antes) * 100 : null
      };
      linhas.push(L);
      if (r.estado === "atualizar") cont.atualizar++;
      else if (r.estado === "igual") cont.igual++;
      else if (r.estado === "sem_correspondencia") cont.sem_correspondencia++;
      else cont.mantidos++;
    });
    /* totais exatos pela mesma conta do orçamento, num clone com os preços novos aplicados */
    var antesT = totaisDe(orc), clone = clonar(orc);
    OrcBases._aplicarEm(clone, alvo, resolver);
    var depoisT = totaisDe(clone);
    return {
      alvo: alvo, linhas: linhas, contagem: cont, antes: antesT, depois: depoisT,
      dif: r2(depoisT.total - antesT.total), difCusto: r2(depoisT.custoDireto - antesT.custoDireto),
      pct: antesT.total > 0 ? ((depoisT.total - antesT.total) / antesT.total) * 100 : null
    };
  };

  OrcBases._aplicarEm = function (orc, alvo, resolver) {
    var n = 0;
    eachItem(orc, function (e, it) {
      var r = classificar(it, alvo, resolver);
      if (r.estado !== "atualizar") return;
      var bi = r.base, p = r.preco;
      it.custoUnitario = p.unit;
      it.custoMO = p.mo; it.custoMAT = p.mat; it.custoEQ = p.eq;
      if (it.modoCusto === "mo" || it.modoCusto === "matEq") it.custoBase = p.cheio;
      else if (it.custoBase != null) it.custoBase = p.cheio;
      if (typeof bi.desonerado === "boolean") it.desonerado = bi.desonerado;
      n++;
    });
    return n;
  };

  /* APLICA no orçamento (a revisão de segurança é da tela). Devolve { ok, n }. */
  OrcBases.aplicar = function (orc, alvo, resolver) {
    if (global.Orcamento && Orcamento.travadoPorAprovacao && Orcamento.travadoPorAprovacao(orc))
      return { ok: false, n: 0, motivo: "Orçamento aprovado não muda o preço. Crie uma revisão." };
    var n = OrcBases._aplicarEm(orc, alvo, resolver);
    if (n && txt(alvo.fonte).toUpperCase() === "SINAPI" && alvo.competencia) orc.competenciaSinapi = txt(alvo.competencia);
    if (n && txt(alvo.fonte).toUpperCase() === "SINAPI" && alvo.uf) orc.uf = txt(alvo.uf);
    return { ok: true, n: n };
  };

  /* COMPARAR (somente leitura): o orçamento nas bases A e B.
     Item sem código, próprio, de outra base ou ausente da base fica "sem preço" NAQUELA base — nada vira zero nem estimativa.
     Os totais de cada lado somam só o que a base cobre; a diferença só conta os itens que as DUAS cobrem. */
  OrcBases.comparar = function (orc, a, b, resolver) {
    var linhas = [], tA = 0, tB = 0, cA = 0, cB = 0, difComum = 0, nComum = 0, semA = 0, semB = 0, ambosSem = 0;
    var pctBdi = num(orc && orc.bdi && orc.bdi.percentual);
    eachItem(orc, function (e, it) {
      var c = cod(it.codigo), q = num(it.quantidade);
      /* ⚠ O CÓDIGO SÓ VALE NA BASE DE ORIGEM DO ITEM (SINAPI e SINAPI desonerada são a mesma tabela de códigos):
         o 100 da SEINFRA não é o 100 da SINAPI, e comparar por número seria "achar" preço errado */
      var fi = OrcBases.familia(OrcBases.fonteDe(it));
      var pa = (c && fi === OrcBases.familia(a.fonte)) ? OrcBases.precoNaBase(it, resolver(a.fonte, c)) : null;
      var pb = (c && fi === OrcBases.familia(b.fonte)) ? OrcBases.precoNaBase(it, resolver(b.fonte, c)) : null;
      var ua = pa ? pa.unit : null, ub = pb ? pb.unit : null;
      if (ua != null) { tA += ua * q; cA++; } else semA++;
      if (ub != null) { tB += ub * q; cB++; } else semB++;
      if (ua != null && ub != null) { difComum += (ub - ua) * q; nComum++; }
      if (ua == null && ub == null) ambosSem++;
      linhas.push({
        etapa: txt(e.nome), itemId: it.id, codigo: txt(it.codigo), descricao: txt(it.descricao), unidade: txt(it.unidade), quantidade: q,
        atual: num(it.custoUnitario), a: ua, b: ub,
        dif: (ua != null && ub != null) ? r2(ub - ua) : null,
        pct: (ua != null && ub != null && ua > 0) ? ((ub - ua) / ua) * 100 : null,
        difTotal: (ua != null && ub != null) ? r2((ub - ua) * q) : null
      });
    });
    function bdi(v) { return r2(v * (1 + pctBdi / 100)); }
    return {
      a: a, b: b, linhas: linhas, pctBdi: pctBdi,
      totalA: r2(tA), totalB: r2(tB), comBdiA: bdi(tA), comBdiB: bdi(tB),
      coberturaA: cA, coberturaB: cB, semA: semA, semB: semB, ambosSem: ambosSem, nComum: nComum,
      difComum: r2(difComum), difComumComBdi: bdi(difComum)
    };
  };

  global.OrcBases = OrcBases;
  if (typeof module !== "undefined" && module.exports) module.exports = OrcBases;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
