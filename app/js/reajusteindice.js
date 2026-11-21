/* =====================================================================
 * reajusteindice.js — REAJUSTE POR ÍNDICE (Banco Central, SGS) — motor puro
 *
 * O que resolve: reajustar orçamento e contrato por IPCA / INCC-M / IGP-M com a
 * série OFICIAL e o link da fonte à mostra, em vez de "fator que alguém digitou".
 * A conta do fator acumulado é explícita e conferível mês a mês na tela.
 *
 * FONTE: Banco Central do Brasil — Sistema Gerenciador de Séries Temporais (SGS).
 *   https://api.bcb.gov.br/dados/serie/bcdata.sgs.{codigo}/dados?formato=json&dataInicial=DD/MM/AAAA&dataFinal=DD/MM/AAAA
 *   Códigos conferidos com chamada real em 20/11/2026 (fixtures em tools/dados/apis/):
 *   433 = IPCA (IBGE), 192 = INCC-M (FGV), 189 = IGP-M (FGV).
 *   A API responde com `access-control-allow-origin: *`: o navegador chama direto, sem proxy.
 *
 * REGRA DA CONTA (a mais usada em contrato público, e escrita na tela para a pessoa conferir):
 *   fator = ∏ (1 + variação_mensal/100) dos meses DEPOIS do mês-base até o mês-alvo, inclusive.
 *   Ex.: base 2025-01, alvo 2025-03 → multiplica fev e mar. O índice do próprio mês-base já está
 *   no preço da proposta (data-base), por isso não entra.
 * ⚠ Mês sem dado na série NÃO é preenchido nem estimado: a conta recusa e diz qual mês falta
 *   (o INCC-M/IPCA do mês corrente costuma sair só na virada do mês seguinte).
 *
 * FREIO CONTRA BLOQUEIO: uma chamada por clique, no mínimo 3 s entre chamadas à rede, cache local
 * (12 h) em localStorage com try/catch, e nada é baixado ao abrir a tela.
 * Sem rede e sem cache: aceita a série COLADA pela pessoa (JSON do BCB ou linhas "AAAA-MM;valor").
 * ES5 de propósito. Testes: tools/test-reajusteindice.js (só fixture, nunca rede).
 * ===================================================================== */
(function (global) {
  "use strict";

  var TTL_MS = 12 * 3600 * 1000;
  var INTERVALO_MIN_MS = 3000;
  var CH = "orcapro:bcb:sgs:";

  var SERIES = {
    ipca: { id: "ipca", codigo: 433, nome: "IPCA", orgao: "IBGE", descricao: "Índice Nacional de Preços ao Consumidor Amplo (variação mensal %)" },
    incc: { id: "incc", codigo: 192, nome: "INCC-M", orgao: "FGV", descricao: "Índice Nacional de Custo da Construção — Mercado (variação mensal %)" },
    igpm: { id: "igpm", codigo: 189, nome: "IGP-M", orgao: "FGV", descricao: "Índice Geral de Preços — Mercado (variação mensal %)" }
  };

  function s(v) { return v == null ? "" : String(v); }
  function dd(n) { return (n < 10 ? "0" : "") + n; }
  function arr(v) { return Object.prototype.toString.call(v) === "[object Array]" ? v : []; }

  /* "2025-03" válido? */
  function mesOk(m) { return /^\d{4}-(0[1-9]|1[0-2])$/.test(s(m)); }
  function mesAdd(m, n) {
    var a = parseInt(m.slice(0, 4), 10), b = parseInt(m.slice(5, 7), 10) - 1 + n;
    a += Math.floor(b / 12); b = ((b % 12) + 12) % 12;
    return a + "-" + dd(b + 1);
  }
  function mesesEntre(base, alvo) { /* (base, alvo] */
    var out = [], m = mesAdd(base, 1), guarda = 0;
    while (m <= alvo && guarda++ < 600) { out.push(m); m = mesAdd(m, 1); }
    return out;
  }

  function urlSerie(codigo, mesIni, mesFim) {
    var ini = "01/" + mesIni.slice(5, 7) + "/" + mesIni.slice(0, 4);
    var fim = "28/" + mesFim.slice(5, 7) + "/" + mesFim.slice(0, 4);
    return "https://api.bcb.gov.br/dados/serie/bcdata.sgs." + codigo + "/dados?formato=json&dataInicial=" + ini + "&dataFinal=" + fim;
  }

  /* [{data:"01/02/2025", valor:"1.31"}] → [{mes:"2025-02", valor:1.31}] ordenado, sem repetir mês.
     Aceita também texto colado "2025-02;1,31" (uma por linha). Valor inválido é descartado e contado. */
  function lerSerie(entrada) {
    var out = [], vistos = {}, descartados = 0, lista = null;
    if (typeof entrada === "string") {
      var t = entrada.replace(/^\s+|\s+$/g, "");
      if (t.charAt(0) === "[") { try { lista = JSON.parse(t); } catch (e) { lista = null; } }
      else {
        lista = [];
        t.split(/\r?\n/).forEach(function (ln) {
          var p = ln.split(/[;\t]/); if (p.length < 2) return;
          var d = p[0].replace(/^\s+|\s+$/g, "");
          var m1 = /^(\d{4})-(\d{2})/.exec(d), m2 = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d), m3 = /^(\d{2})\/(\d{4})$/.exec(d);
          var mes = m1 ? m1[1] + "-" + m1[2] : (m2 ? m2[3] + "-" + m2[2] : (m3 ? m3[2] + "-" + m3[1] : ""));
          lista.push({ mes: mes, valor: p[1] });
        });
      }
    } else lista = entrada;
    arr(lista).forEach(function (x) {
      if (!x) { descartados++; return; }
      var mes = x.mes || "";
      if (!mes && x.data) { var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s(x.data)); if (m) mes = m[3] + "-" + m[2]; }
      var raw = s(x.valor).replace(/\s/g, "");
      /* vírgula decimal (texto colado) ou ponto (API) — sem milhar em variação mensal */
      var v = raw.indexOf(",") >= 0 ? parseFloat(raw.replace(/\./g, "").replace(",", ".")) : parseFloat(raw);
      if (!mesOk(mes) || !isFinite(v)) { descartados++; return; }
      if (vistos[mes]) return;
      vistos[mes] = 1; out.push({ mes: mes, valor: v });
    });
    out.sort(function (a, b) { return a.mes < b.mes ? -1 : (a.mes > b.mes ? 1 : 0); });
    return { pontos: out, descartados: descartados };
  }

  /* O cálculo. Devolve {ok, fator, pct, meses:[{mes,valor,acumulado}], regra} ou {ok:false, erro}. */
  function fatorAcumulado(pontos, mesBase, mesAlvo) {
    if (!mesOk(mesBase) || !mesOk(mesAlvo)) return { ok: false, erro: "Informe o mês-base e o mês-alvo (AAAA-MM)." };
    if (mesAlvo <= mesBase) return { ok: false, erro: "O mês-alvo precisa ser DEPOIS do mês-base (o mês-base já está no preço)." };
    var porMes = {}; arr(pontos).forEach(function (p) { porMes[p.mes] = p.valor; });
    var meses = mesesEntre(mesBase, mesAlvo), falta = [], acum = 1, linhas = [];
    meses.forEach(function (m) {
      if (porMes[m] === undefined) { falta.push(m); return; }
      acum *= 1 + porMes[m] / 100;
      linhas.push({ mes: m, valor: porMes[m], acumulado: acum });
    });
    if (falta.length) {
      var ult = ""; arr(pontos).forEach(function (p) { if (p.mes > ult) ult = p.mes; });
      return { ok: false, faltam: falta, erro: "A série não tem " + (falta.length === 1 ? "o mês " : "os meses ") + falta.slice(0, 6).join(", ") + (falta.length > 6 ? "…" : "") +
        (ult ? " (último mês divulgado na série: " + ult + ")" : "") + ". Escolha um mês-alvo já divulgado — o sistema não estima índice." };
    }
    return { ok: true, fator: acum, pct: (acum - 1) * 100, meses: linhas, mesBase: mesBase, mesAlvo: mesAlvo,
      regra: "Fator = produto de (1 + variação mensal) dos meses de " + meses[0] + " a " + meses[meses.length - 1] + " (o mês-base " + mesBase + " fica de fora: já está no preço)." };
  }

  /* ---- cache local (localStorage, sempre em try/catch) ---- */
  function arm() { try { return global.localStorage || null; } catch (e) { return null; } }
  function cacheLer(codigo, ctx) {
    var a = (ctx && ctx.storage) || arm(); if (!a) return null;
    try { var o = JSON.parse(a.getItem(CH + codigo) || "null"); return o && arr(o.pontos).length ? o : null; } catch (e) { return null; }
  }
  function cacheGravar(codigo, o, ctx) {
    var a = (ctx && ctx.storage) || arm(); if (!a) return;
    try { a.setItem(CH + codigo, JSON.stringify(o)); } catch (e) {}
  }

  var _ultimaChamada = 0, _emVoo = {};

  /* Baixa (ou lê do cache) a série cobrindo [mesIni, mesFim]. Promise → {pontos, fonte:{url,baixadoEm,deCache}}.
     ctx: { fetch, storage, agora } — injetáveis para teste. Uma chamada por vez por série. */
  function obterSerie(serieId, mesIni, mesFim, ctx) {
    ctx = ctx || {};
    var def = SERIES[serieId];
    var P = ctx.Promise || global.Promise;
    if (!def) return P.reject(new Error("Índice desconhecido."));
    var agora = ctx.agora != null ? ctx.agora : new Date().getTime();
    var url = urlSerie(def.codigo, mesIni, mesFim);
    var c = cacheLer(def.codigo, ctx);
    var cobre = function (o) {
      if (!o) return false;
      var pts = o.pontos, ini = o.mesIni || "", fim = o.mesFim || "";
      return ini && fim && ini <= mesIni && fim >= mesFim && pts.length > 0;
    };
    if (c && cobre(c) && agora - c.baixadoEm < TTL_MS) {
      return P.resolve({ pontos: c.pontos, fonte: { url: c.url, baixadoEm: c.baixadoEm, deCache: true } });
    }
    var f = ctx.fetch || (global.fetch ? function (u, o) { return global.fetch(u, o); } : null);
    function recorrer(motivo) {
      /* sem rede: o cache VELHO ainda vale, dito como velho — melhor que nada, e a tela mostra a data */
      if (c && cobre(c)) return { pontos: c.pontos, fonte: { url: c.url, baixadoEm: c.baixadoEm, deCache: true, velho: true, motivo: motivo } };
      var e = new Error("Não consegui baixar a série do Banco Central (" + motivo + "). Verifique a internet ou cole a série na caixa abaixo.");
      e.semRede = true; throw e;
    }
    if (!f) return P.resolve().then(function () { return recorrer("navegador sem fetch"); });
    if (_emVoo[def.codigo]) return _emVoo[def.codigo];
    if (!ctx.semFreio && agora - _ultimaChamada < INTERVALO_MIN_MS && _ultimaChamada) {
      return P.resolve().then(function () { return recorrer("aguarde alguns segundos entre consultas"); });
    }
    _ultimaChamada = agora;
    _emVoo[def.codigo] = P.resolve().then(function () { return f(url); }).then(function (r) {
      if (!r || !r.ok) throw new Error("HTTP " + (r && r.status));
      return r.json();
    }).then(function (j) {
      var l = lerSerie(j);
      if (!l.pontos.length) throw new Error("resposta sem dados");
      cacheGravar(def.codigo, { baixadoEm: agora, url: url, mesIni: mesIni, mesFim: mesFim, pontos: l.pontos }, ctx);
      delete _emVoo[def.codigo];
      return { pontos: l.pontos, fonte: { url: url, baixadoEm: agora, deCache: false } };
    }).then(null, function (e) {
      delete _emVoo[def.codigo];
      return recorrer(e && e.message ? e.message : "falha de rede");
    });
    return _emVoo[def.codigo];
  }

  /* Aplica o fator ao CUSTO UNITÁRIO dos itens do orçamento, pelo caminho oficial do mutador
     (Orcamento.atualizarItem: parcelas MO/MAT/EQ acompanham e o desvio da base é registrado).
     Guarda o antes em orc.reajusteIndice para DESFAZER. Itens sem custo, pendentes de quantidade ou
     opcionais ficam como estão. Não persiste: quem chama persiste. */
  function planoOrcamento(orc, fator, Orc) {
    var itens = [], antes = 0, depois = 0;
    arr(orc && orc.etapas).forEach(function (e) {
      arr(e.itens).forEach(function (it) {
        var cu = Number(it.custoUnitario) || 0;
        if (!(cu > 0) || it.qtdPendente || it.opcional) return;
        var novo = Math.round(cu * fator * 100) / 100;
        itens.push({ etapaId: e.id, itemId: it.id, antes: cu, depois: novo });
      });
    });
    itens.forEach(function (x) { antes += x.antes; depois += x.depois; });
    return { itens: itens, somaUnitariosAntes: antes, somaUnitariosDepois: depois };
  }
  function aplicarOrcamento(orc, calculo, serieId, fonte, Orc) {
    Orc = Orc || global.Orcamento;
    if (!orc || !calculo || !calculo.ok) return { ok: false, erro: "Calcule o fator antes de aplicar." };
    if (orc.reajusteIndice) return { ok: false, erro: "Este orçamento já foi reajustado por índice. Desfaça o reajuste anterior antes de aplicar outro." };
    var lic = orc.licitacao || null;
    if (lic && (lic.descontoLinear || lic.descontoItens)) return { ok: false, erro: "Há desconto de licitação aplicado. Desfaça-o antes de reajustar por índice." };
    if (orc.fechamento) return { ok: false, erro: "Este orçamento tem um \"Fechar valor\" ativo. Desfaça o fechamento antes de reajustar." };
    var plano = planoOrcamento(orc, calculo.fator, Orc);
    if (!plano.itens.length) return { ok: false, erro: "Nenhum item com custo unitário para reajustar." };
    var totAntes = Orc.totais(orc).precoVenda;
    var guarda = plano.itens.map(function (x) { return { e: x.etapaId, i: x.itemId, a: x.antes }; });
    plano.itens.forEach(function (x) { Orc.atualizarItem(orc, x.etapaId, x.itemId, { custoUnitario: x.depois }); });
    var totDepois = Orc.totais(orc).precoVenda;
    orc.reajusteIndice = {
      aplicadoEm: new Date().toISOString(), indice: serieId, codigoSgs: SERIES[serieId].codigo, mesBase: calculo.mesBase, mesAlvo: calculo.mesAlvo,
      fator: calculo.fator, fonte: fonte && fonte.url ? fonte.url : "", itens: guarda, totalAntes: totAntes, totalDepois: totDepois
    };
    return { ok: true, itens: plano.itens.length, totalAntes: totAntes, totalDepois: totDepois };
  }
  function desfazerOrcamento(orc, Orc) {
    Orc = Orc || global.Orcamento;
    var r = orc && orc.reajusteIndice;
    if (!r) return { ok: false, erro: "Não há reajuste por índice para desfazer." };
    arr(r.itens).forEach(function (x) { Orc.atualizarItem(orc, x.e, x.i, { custoUnitario: x.a }); });
    var n = arr(r.itens).length;
    delete orc.reajusteIndice;
    return { ok: true, itens: n };
  }

  /* Contrato: NÃO mexe no valor. Devolve o valor do aditivo de reajuste (sobre o VIGENTE) e o texto do
     motivo com a série e o link — o aditivo nasce PENDENTE no fluxo normal de aprovação. */
  function aditivoDeContrato(valorVigente, calculo, serieId, fonte) {
    if (!calculo || !calculo.ok) return { ok: false, erro: "Calcule o fator antes." };
    var v = Number(valorVigente) || 0;
    if (!(v > 0)) return { ok: false, erro: "O contrato não tem valor vigente para reajustar." };
    var valor = Math.round(v * (calculo.fator - 1) * 100) / 100;
    var d = SERIES[serieId];
    var motivo = "Reajuste por " + d.nome + " (" + d.orgao + "), série " + d.codigo + " do SGS/Banco Central: " + calculo.pct.toFixed(4).replace(".", ",") + "% acumulado de " +
      calculo.meses[0].mes + " a " + calculo.mesAlvo + " (data-base " + calculo.mesBase + "), sobre o valor vigente de R$ " + v.toFixed(2).replace(".", ",") + ". " + calculo.regra +
      (fonte && fonte.url ? " Fonte: " + fonte.url : "");
    return { ok: true, valor: valor, motivo: motivo, fundamento: "Lei 14.133/2021, art. 135 (reajuste em sentido estrito) — conferir cláusula de reajuste do contrato" };
  }

  global.ReajusteIndice = {
    SERIES: SERIES, TTL_MS: TTL_MS, INTERVALO_MIN_MS: INTERVALO_MIN_MS,
    mesOk: mesOk, mesAdd: mesAdd, urlSerie: urlSerie, lerSerie: lerSerie, fatorAcumulado: fatorAcumulado,
    obterSerie: obterSerie, planoOrcamento: planoOrcamento, aplicarOrcamento: aplicarOrcamento, desfazerOrcamento: desfazerOrcamento,
    aditivoDeContrato: aditivoDeContrato,
    _reset: function () { _ultimaChamada = 0; _emVoo = {}; }
  };
  if (typeof module !== "undefined" && module.exports) module.exports = global.ReajusteIndice;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
