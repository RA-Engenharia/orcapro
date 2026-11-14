/* =====================================================================
 * mor/compositor.js — COMPOSIÇÃO PRÓPRIA POR FAMÍLIA (ESPEC-MOTOR-ORCAMENTO.md §5)
 *
 * Quando a base NÃO tem o serviço, em vez de pedir à IA que "invente" a composição:
 *   1. reconhece a FAMÍLIA do serviço (familias.js) e os parâmetros que a descrição traz;
 *   2. acha, no analítico REAL, composições da mesma família (mesmo serviço, parâmetro
 *      diferente) — `ComposicaoPropria.analogas` ordena pela semelhança de texto, a
 *      família ordena pela distância do parâmetro;
 *   3. aplica as regras tabeladas da família, insumo por insumo (a conta fica escrita);
 *   4. o insumo que TROCA (bloco de outra medida, concreto de outro fck, cerâmica de outro
 *      formato) é buscado nas bases por `Orcamentista.candidatosInsumo/pontuarInsumo` — se a
 *      base não o tem, o serviço fica PENDENTE com "falta o insumo X" (nada é inventado);
 *   5. grava como PROP-AUTO-xxxx com `origem:{familia, referencia:{fonte,codigo,competencia},
 *      regras:[…]}` e só devolve ok se `ComposicaoPropria.validar` aprovar.
 * Sem família, sem referência da mesma família ou com unidade diferente → NÃO compõe: devolve
 * { ok:false, motivo, faltou:[…] }. Quem chama decide o que fazer (continua pendente).
 *
 * ctx (o mesmo do Orçamentista, mais o analítico): { analitico:[composições], resolve(cod,fonte),
 *   buscar(txt,{fontes,max,tipo}), obter, normalizar, unidadeChave, fontes, fontesInsumo,
 *   codigosExistentes:[], competencia }
 * Puro: não grava nada — devolve a composição para quem chama gravar.
 * ===================================================================== */
(function (global) {
  "use strict";

  var C = global.MorConversoes || (typeof require === "function" ? require("./conversoes.js") : null);
  var F = global.MorFamilias || (typeof require === "function" ? require("./familias.js") : null);
  var CP = function () { return global.ComposicaoPropria || (typeof require === "function" ? require("../composicaopropria.js") : null); };
  var OR = function () { return global.Orcamentista || (typeof require === "function" ? require("../orcamentista.js") : null); };

  var r2 = function (x) { return Math.round(x * 100) / 100; };

  /* PROP-AUTO-0001, 0002… (nunca repete; convive com PROP-0001 e PROP-ALV-001). */
  function gerarCodigoAuto(existentes) {
    var max = 0;
    (existentes || []).forEach(function (c) {
      var m = String(c || "").match(/^PROP-AUTO-(\d{1,6})$/i);
      if (m) { var n = parseInt(m[1], 10); if (n > max) max = n; }
    });
    var s = String(max + 1);
    while (s.length < 4) s = "0" + s;
    return "PROP-AUTO-" + s;
  }

  /* Procura o insumo que a regra pede trocar. Devolve { ok, item, fonte, alternativas } | { ok:false, motivo }. */
  function acharInsumo(troca, refIns, ctx) {
    var orc = OR(), cx = {}, k;
    for (k in ctx) if (Object.prototype.hasOwnProperty.call(ctx, k)) cx[k] = ctx[k];
    var soInsumo = String(refIns.tipo || "").toUpperCase() !== "COMPOSICAO";
    cx.buscar = function (q, o) {
      var o2 = {}, z; for (z in (o || {})) o2[z] = o[z];
      if (soInsumo) o2.tipo = "insumo";
      return ctx.buscar(q, o2);
    };
    var cands = orc.candidatosInsumo(troca.descBusca, cx) || [];
    /* busca EXATA por todas as palavras da descrição pedida: o `candidatosInsumo` corta cada consulta em 80 achados e,
       em famílias grandes (concreto usinado, bloco cerâmico), o item certo fica de fora do corte. */
    try {
      var norm = ctx.normalizar || function (x) { return String(x || "").toLowerCase(); };
      var exata = orc.tokens(troca.descBusca, norm).join(" "), vistos = {};
      cands.forEach(function (r) { vistos[(r.fonte || "SINAPI") + ":" + r.item.codigo] = 1; });
      (cx.buscar(exata, { fontes: ctx.fontesInsumo || ctx.fontes, max: 200 }) || []).forEach(function (r) {
        var key = (r.fonte || "SINAPI") + ":" + r.item.codigo; if (vistos[key]) return; vistos[key] = 1; cands.push(r);
      });
    } catch (eEx) { /* a busca exata é reforço; sem ela segue com o que o Orçamentista achou */ }
    var bons = cands.filter(function (r) { return r && r.item && Number(r.item.custoUnitario) > 0 && troca.aceita(r.item); });
    if (!bons.length) return { ok: false, motivo: "falta na base o insumo «" + troca.rotulo + "» (busca: " + troca.descBusca.slice(0, 90) + ")", candidatosVistos: cands.length };
    bons = bons.map(function (r) { return { r: r, s: orc.pontuarInsumo(troca.descBusca, refIns.unidade, r.item, cx) }; });
    bons.sort(function (a, b) { return (b.s - a.s) || (String(a.r.item.codigo) < String(b.r.item.codigo) ? -1 : 1); });
    return { ok: true, item: bons[0].r.item, fonte: bons[0].r.fonte || "SINAPI", alternativas: bons.slice(1, 4).map(function (b) { return b.r.item.codigo; }) };
  }

  var Comp = {
    gerarCodigoAuto: gerarCodigoAuto,

    /* Referências da família no analítico, da melhor para a pior.
       Devolve { refs:[{comp,params,codigo}], oficial:codigo|null }. */
    referencias: function (descricao, unidade, fam, pAlvo, ctx, opts) {
      opts = opts || {};
      var uk = C.chaveUn(unidade), chaveAlvo = fam.chave(descricao), cands = [], oficial = null;
      (ctx.analitico || []).forEach(function (c) {
        if (!c || !c.insumos || !c.insumos.length) return;
        if (opts.excluirCodigo && String(c.codigo) === String(opts.excluirCodigo)) return;
        if (C.chaveUn(c.unidade) !== uk) return;
        var p = fam.reconhece(c.descricao); if (!p) return;
        if (fam.chave(c.descricao) !== chaveAlvo) return;
        if (fam.distancia(p, pAlvo) === 0) { if (!oficial) oficial = String(c.codigo); return; }
        cands.push({ comp: c, params: p, codigo: String(c.codigo), d: fam.distancia(p, pAlvo) });
      });
      if (!cands.length) return { refs: [], oficial: oficial };
      /* `analogas` ordena por semelhança de texto; a distância do parâmetro manda, o texto desempata */
      var score = {};
      try {
        CP().analogas(descricao, cands.map(function (x) { return x.comp; }), cands.length, { semFiltro: true }).forEach(function (a) { score[String(a.codigo)] = a.score; });
      } catch (e) { /* sem score: segue só pela distância */ }
      cands.sort(function (a, b) { return (a.d - b.d) || ((score[b.codigo] || 0) - (score[a.codigo] || 0)) || (a.codigo < b.codigo ? -1 : 1); });
      return { refs: cands, oficial: oficial };
    },

    /* Compõe. opts: { referencia:"código" (força), excluirCodigo, moPorDemao, grupo }. */
    compor: function (descricao, unidade, ctx, opts) {
      opts = opts || {};
      var desc = String(descricao || "").trim(), cp = CP(), faltou = [];
      var fail = function (motivo, extra) {
        var r = { ok: false, motivo: motivo, faltou: faltou.slice(), familia: null, regras: [] };
        var k; for (k in (extra || {})) r[k] = extra[k];
        return r;
      };
      if (desc.length < 10) return fail("descrição curta demais para reconhecer a família");
      if (!unidade) return fail("sem unidade — o coeficiente é POR unidade do serviço");
      if (!ctx || !ctx.analitico || !ctx.analitico.length) { faltou.push("base analítica carregada"); return fail("sem base analítica: é dela que saem os coeficientes"); }
      var det = F.detectar(desc, unidade);
      if (!det) {
        faltou.push("família tabelada para este serviço (hoje: " + F.nomes().join("; ") + ")");
        return fail("nenhuma família tabelada reconhece este serviço (ou a unidade não é a da família)");
      }
      var fam = det.familia, pAlvo = det.params;
      var R = this.referencias(desc, unidade, fam, pAlvo, ctx, opts);
      if (R.oficial) return fail("a base já tem este serviço (" + R.oficial + ") — use o código oficial, não crie composição", { familia: fam.id, rota: "oficial", codigoOficial: R.oficial });
      var refs = R.refs;
      if (opts.referencia) {
        var forc = refs.filter(function (x) { return x.codigo === String(opts.referencia); })[0];
        if (!forc) return fail("a referência " + opts.referencia + " não é da mesma família/unidade do serviço", { familia: fam.id });
        refs = [forc].concat(refs.filter(function (x) { return x !== forc; }));
      }
      if (!refs.length) {
        faltou.push("composição SINAPI da família «" + fam.nome + "» com o mesmo serviço e outro parâmetro");
        return fail("a família foi reconhecida, mas a base não tem composição irmã (mesmo serviço, parâmetro diferente, mesma unidade)", { familia: fam.id });
      }
      var v = fam.variante(refs, pAlvo, opts);
      v.faltou.forEach(function (f) { faltou.push(f); });
      if (faltou.length) return fail("a família não consegue aplicar a regra", { familia: fam.id });

      var ref = refs[0], prop = cp.daReferencia(ref.comp, { resolve: ctx.resolve }), regras = v.regras.slice(), avisos = [], insumos = [];
      v.insumos.forEach(function (pl, idx) {
        var base = prop.insumos[idx] || {};
        var ins = {
          codigo: String(pl.ref.codigo), descricao: pl.ref.descricao, unidade: pl.ref.unidade,
          coeficiente: pl.coef, custoUnitario: Number(base.custoUnitario) > 0 ? Number(base.custoUnitario) : Number(pl.ref.custoUnitario) || 0,
          categoria: pl.ref.categoria || pl.ref.tipoInsumo || "", tipo: pl.ref.tipo || "insumo", fonte: "SINAPI", memoria: pl.regra
        };
        if (pl.troca) {
          var a = acharInsumo(pl.troca, pl.ref, ctx);
          if (!a.ok) { faltou.push(a.motivo); return; }
          ins.codigo = String(a.item.codigo); ins.descricao = a.item.descricao; ins.unidade = a.item.unidade || ins.unidade;
          ins.custoUnitario = Number(a.item.custoUnitario); ins.fonte = a.fonte || "SINAPI";
          ins.memoria = pl.regra + " — insumo da referência " + pl.ref.codigo + " substituído por " + a.item.codigo + (a.alternativas.length ? " (outras opções: " + a.alternativas.join(", ") + ")" : "");
          regras.push("insumo " + pl.ref.codigo + " → " + a.item.codigo + " (" + pl.troca.rotulo + ")");
          var nota = pl.troca.nota ? pl.troca.nota(a.item) : "";
          if (nota) { avisos.push(nota); ins.memoria += " — " + nota; regras.push(nota); }
        }
        insumos.push(ins);
      });
      if (faltou.length) return fail("falta insumo na base para aplicar a regra", { familia: fam.id });

      var origemRef = { fonte: "SINAPI", codigo: ref.codigo, competencia: ctx.competencia || "" };
      var grupo = cp.grupoDoCriador(opts.grupo || ref.comp.grupo || "");
      var comp = {
        codigo: gerarCodigoAuto(ctx.codigosExistentes || []),
        codigoSec: "",
        descricao: desc,
        grupo: grupo,
        unidade: String(unidade).toLowerCase(),
        modeloRef: "SINAPI",
        metodo: "truncar2",
        maoDeObra: insumos.some(function (i) { return cp.catDe(i.categoria) === "MO"; }),
        observacao: "Composição gerada pelo Motor (família «" + fam.nome + "») a partir da SINAPI " + ref.codigo + " — " + String(ref.comp.descricao).slice(0, 80) + ". " + v.premissas.join(" "),
        insumos: insumos,
        origem: { familia: fam.id, referencia: origemRef, regras: regras.concat(v.premissas) }
      };
      var val = cp.validar(comp, {
        codigosExistentes: ctx.codigosExistentes || [],
        resolve: ctx.resolve || null,
        referencia: { codigo: ref.codigo, insumos: ref.comp.insumos }
      });
      if (!val.ok) { val.erros.forEach(function (e) { faltou.push(e); }); return fail("a validação da composição reprovou: " + val.erros.join(" | "), { familia: fam.id, erros: val.erros }); }
      (val.avisos || []).forEach(function (a) { avisos.push(a); });
      var igualEsp = pAlvo.esp !== undefined && ref.params.esp !== undefined ? pAlvo.esp === ref.params.esp : true;
      /* A4: onde o custo total gerado chegou a passar de 15% da SINAPI no ensaio, a composição sai marcada «conferir», com o erro escrito */
      var ec = F.erroCusto(fam.id, ref.params, pAlvo), conferir = ec.erro > F.LIMITE_CONFERIR;
      if (conferir) {
        var aviso = "CONFERIR: nos ensaios sobre a SINAPI MG 2026-06 o custo total desta família divergiu até " + String(ec.erro).replace(".", ",") + "% da composição oficial (" + ec.nota + "). Confira insumo por insumo antes de usar.";
        comp.origem.regras.push(aviso); comp.origem.conferir = true; comp.origem.erroCustoMedido = ec.erro; comp.observacao += " " + aviso; v.premissas.push(aviso);
      } else comp.origem.erroCustoMedido = ec.erro;
      /* confiança: "alta" só onde o teste mediu ERRO ZERO contra a SINAPI (troca de classe de concreto);
         o resto é "media" — o engenheiro confere a premissa. */
      var conf = (fam.id === "concreto-fck" && !conferir) ? "alta" : "media";
      if (!igualEsp) conf = "media";
      return {
        ok: true, comp: comp, custo: val.custo, familia: fam.id, referencia: origemRef,
        refDescricao: ref.comp.descricao, refPreco: ref.comp.custoUnitario,
        regras: comp.origem.regras, premissas: v.premissas, confianca: conf, conferir: conferir, erroCustoMedido: ec.erro, avisos: avisos, faltou: [], params: pAlvo
      };
    }
  };

  if (typeof module !== "undefined" && module.exports) module.exports = Comp;
  global.MorCompositor = Comp;
})(typeof window !== "undefined" ? window : globalThis);
