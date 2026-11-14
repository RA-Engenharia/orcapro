/* =====================================================================
 * mor/casador.js — INTENÇÃO → CÓDIGO DE BASE (ESPEC-MOTOR-ORCAMENTO.md §1)
 *
 * Pega o item pendente do catálogo (descrição + unidade + «intenção» em texto curto) e tenta
 * achar, nas bases instaladas, o código que o descreve — SEM IA e sem aproximação calada:
 *   1. `Orcamentista.decidir` (descrição idêntica / parecida) com as duas redações do item
 *      (a descrição completa e a intenção), no modo `semPendente` (só mesma unidade decide) e
 *      sem elaborar composição (isso é do compositor.js);
 *   2. busca própria pelas mesmas palavras (`ctx.buscar`, a mesma que `Bases.buscar`), para não
 *      depender dos 3 candidatos que o decidir devolve;
 *   3. REGRAS DE DESEMPATE sobre cada candidato — qualquer reprovação o tira:
 *        a) MESMA UNIDADE (obrigatória): kg não casa com m²;
 *        b) MEDIDAS: todo número da descrição (60x60, DN 100, fck 25, 14 cm) tem de estar na do candidato;
 *        c) NEGAÇÃO: «não aparelhada» ≠ «aparelhada» (e «sem» ≠ «com»);
 *        d) OBJETO: a palavra-cabeça («barbacã», «tesoura») tem de aparecer no candidato;
 *        e) INTENÇÃO: todas as palavras da intenção («vigas» ≠ «pilares») têm de aparecer;
 *        f) COBERTURA: ao menos 70% das palavras longas da descrição completa;
 *   4. só decide sozinho com semelhança ≥ limiar `auto` E sem empate; o que ficar abaixo vira
 *      PENDENTE com o motivo e até 3 SUGESTÕES para o orçamentista decidir.
 * Devolve { ok:true, codigo, fonte, confianca(0..1), motivo, via } ou
 *         { ok:false, motivo, sugestoes:[…], rejeitados:[…] }. Nunca devolve código que não esteja na base.
 * ===================================================================== */
(function (global) {
  "use strict";

  var OR = function () { return global.Orcamentista || (typeof require === "function" ? require("../orcamentista.js") : null); };

  function numerosCanon(txt, O) {
    var out = [];
    (O.numerosDe(txt) || []).forEach(function (n) {
      var v = parseFloat(String(n).replace(",", "."));
      if (v === v && out.indexOf(v) < 0) out.push(v);
    });
    return out;
  }
  /* AF_03/2024 (carimbo da CAIXA) não é medida */
  function semCarimbo(s) { return String(s || "").replace(/\bAF_\S*/gi, " "); }
  function negacao(txt, norm) { return /(^| )(nao|sem)( |$)/.test(" " + norm(txt) + " "); }

  var Casador = {
    /* SÓ unidade + medidas (as regras a e b): é o que a memória e o «código do documento» têm de cumprir. { ok, regra, motivo } */
    medidasEUnidade: function (item, cand, ctx) {
      var O = OR(), uk = ctx.unidadeChave || function (u) { return String(u || "").toLowerCase(); };
      var desc = String(item.descricao || item.desc || ""), un = item.unidade || item.un || "";
      if (!un || !cand.unidade) return { ok: false, regra: "unidade", motivo: "sem unidade para conferir (" + (un || "?") + " × " + (cand.unidade || "?") + ")" };
      if (uk(un) !== uk(cand.unidade)) return { ok: false, regra: "unidade", motivo: "unidade " + cand.unidade + " ≠ " + un };
      var nA = numerosCanon(semCarimbo(desc), O), nB = numerosCanon(semCarimbo(cand.descricao), O);
      var falta = nA.filter(function (v) { return nB.indexOf(v) < 0; });
      if (falta.length) return { ok: false, regra: "medida", motivo: "a medida " + falta.join(", ") + " não aparece na descrição do código (" + String(cand.descricao).slice(0, 50) + ")" };
      return { ok: true };
    },

    /* Regras (a–d) para UM candidato. Devolve { ok, motivo }. */
    regras: function (item, cand, ctx) {
      var O = OR(), norm = ctx.normalizar || function (s) { return String(s || "").toLowerCase(); }, uk = ctx.unidadeChave || function (u) { return String(u || "").toLowerCase(); };
      var desc = String(item.descricao || item.desc || ""), un = item.unidade || item.un || "";
      if (un && cand.unidade && uk(un) !== uk(cand.unidade)) return { ok: false, regra: "unidade", motivo: "unidade " + cand.unidade + " ≠ " + un };
      /* descrição IDÊNTICA à da base (mesma unidade): nada a desempatar — a intenção é uma redação solta e não pode vetar */
      if (norm(desc).replace(/\s+/g, " ") === norm(cand.descricao).replace(/\s+/g, " ")) return { ok: true, identica: true };
      var nA = numerosCanon(semCarimbo(desc), O), nB = numerosCanon(semCarimbo(cand.descricao), O);
      var falta = nA.filter(function (v) { return nB.indexOf(v) < 0; });
      if (falta.length) return { ok: false, regra: "medida", motivo: "a medida " + falta.join(", ") + " não aparece na descrição do candidato" };
      if (negacao(desc, norm) !== negacao(cand.descricao, norm)) return { ok: false, regra: "negacao", motivo: "negação diverge (não/sem × com)" };
      var ta = O.tokens(desc, norm).filter(function (t) { return t.length >= 4 && !/\d/.test(t); }), cab = ta[0];
      if (cab) {
        var tb = O.tokens(cand.descricao, norm), raiz = cab.slice(0, Math.min(5, cab.length));
        var tem = tb.some(function (x) { return x === cab || x.indexOf(raiz) === 0 || (x.length >= 4 && cab.indexOf(x.slice(0, Math.min(5, x.length))) === 0); });
        if (!tem) return { ok: false, regra: "objeto", motivo: "o objeto «" + cab + "» não aparece no candidato" };
      }
      /* e) AS PALAVRAS DA INTENÇÃO são todas obrigatórias («concretagem de VIGAS fck 25» não casa com
         «concretagem de PILARES fck 25»: as palavras de objeto batem quase todas, e foi o que o teste mediu). */
      var cobre = function (tb, t) { var r = t.slice(0, Math.min(5, t.length)); return tb.some(function (x) { return x === t || x.indexOf(r) === 0 || (x.length >= 4 && t.indexOf(x.slice(0, Math.min(5, x.length))) === 0); }); };
      var tbAll = O.tokens(cand.descricao, norm);
      if (item.intencao) {
        var perdidas = O.tokens(item.intencao, norm).filter(function (t) { return t.length >= 4 && !/\d/.test(t) && !cobre(tbAll, t); });
        if (perdidas.length) return { ok: false, regra: "intencao", motivo: "a intenção pede «" + perdidas.join(", ") + "» e o candidato não tem" };
      }
      /* f) COBERTURA da descrição completa: ao menos 70% das palavras de 5+ letras */
      var dsig = O.tokens(desc, norm).filter(function (t) { return t.length >= 5 && !/\d/.test(t); });
      if (dsig.length >= 3) {
        var tem2 = dsig.filter(function (t) { return cobre(tbAll, t); }).length / dsig.length;
        if (tem2 < 0.7) return { ok: false, regra: "cobertura", motivo: "o candidato cobre só " + Math.round(tem2 * 100) + "% das palavras da descrição" };
      }
      return { ok: true };
    },

    /* Candidatos brutos: decidir (2 redações) + busca própria. [{fonte,item,sim,via}] */
    _candidatos: function (item, ctx) {
      var O = OR(), norm = ctx.normalizar || function (s) { return String(s || "").toLowerCase(); };
      var desc = String(item.descricao || item.desc || ""), intencao = String(item.intencao || ""), un = item.unidade || item.un || "";
      var vistos = {}, out = [];
      var add = function (fonte, it, via) {
        var k = fonte + ":" + it.codigo; if (vistos[k]) return; vistos[k] = 1;
        var s1 = O.similaridade(desc, it.descricao, un, it.unidade, ctx), s2 = intencao ? O.similaridade(intencao, it.descricao, un, it.unidade, ctx) : 0;
        out.push({ fonte: fonte, item: it, sim: Math.max(s1, s2), via: via });
      };
      /* 1. o decidir do Orçamentista, sem composição própria (isso é do compositor) */
      var cx = {}, z;
      for (z in ctx) if (Object.prototype.hasOwnProperty.call(ctx, z)) cx[z] = ctx[z];
      cx.semPendente = true; cx.elaborar = null; cx._idxDesc = ctx._idxDesc; cx._compCache = null;
      [desc, intencao].forEach(function (d, k) {
        if (!d) return;
        var L = O.decidir({ descricao: d, unidade: un, quantidade: 1, codigo: "" }, 0, k, cx);
        (L.candidatos || []).forEach(function (c) { if (c.item && c.item.codigo) add(c.fonte, c.item, c.via || "descricao"); });
      });
      ctx._idxDesc = cx._idxDesc;
      /* 2. busca própria, pelas mesmas palavras e pelos mesmos caminhos do decidir */
      if (typeof ctx.buscar === "function") {
        [desc, intencao].forEach(function (d) {
          if (!d) return;
          var termos = O.termosDeBusca(d, norm), pal = termos.filter(function (t) { return !/\d/.test(t); }), nums = termos.filter(function (t) { return /\d/.test(t); });
          var q = [];
          if (pal.length >= 3) q.push(pal.slice(0, 3).join(" "));
          if (pal.length >= 2) { q.push(pal.slice(0, 2).join(" ")); q.push(pal[0] + " " + pal[pal.length - 1]); }
          if (pal.length >= 3) q.push(pal[1] + " " + pal[2]);
          if (pal.length && nums.length) q.push(pal[0] + " " + nums[0]);
          if (pal.length) q.push(pal[0]);
          var seen = {};
          q.forEach(function (t) {
            if (!t || seen[t]) return; seen[t] = 1;
            (ctx.buscar(t, { fontes: ctx.fontes, max: t.indexOf(" ") < 0 ? 200 : 120 }) || []).forEach(function (r) { add(r.fonte, r.item, "busca"); });
          });
        });
      }
      return out;
    },

    /* item = { descricao|desc, unidade|un, intencao? }. opts: { limiar (0..1), folga (empate) }. */
    casar: function (item, ctx, opts) {
      opts = opts || {};
      var O = OR(), lim = (ctx && ctx.limiares) || O.LIMIARES, auto = opts.limiar != null ? opts.limiar : lim.auto, folga = opts.folga != null ? opts.folga : 0.02;
      var desc = String(item.descricao || item.desc || "").trim();
      if (!desc) return { ok: false, motivo: "item sem descrição", sugestoes: [], rejeitados: [] };
      if (!ctx || typeof ctx.buscar !== "function") return { ok: false, motivo: "sem base de busca no contexto", sugestoes: [], rejeitados: [] };
      var cands = this._candidatos(item, ctx), self = this, bons = [], rej = [], quase = [];
      cands.forEach(function (c) {
        if (!(Number(c.item.custoUnitario) > 0)) { rej.push({ codigo: c.item.codigo, fonte: c.fonte, regra: "preco", motivo: "sem preço na base" }); return; }
        var r = self.regras(item, c.item, ctx);
        if (!r.ok) {
          rej.push({ codigo: c.item.codigo, fonte: c.fonte, regra: r.regra, motivo: r.motivo, sim: c.sim });
          /* reprovado só pelas regras "macias" (palavras da intenção / cobertura) e parecido: vira SUGESTÃO para o orçamentista, nunca decisão */
          if ((r.regra === "intencao" || r.regra === "cobertura") && c.sim >= 0.5) quase.push(c);
          return;
        }
        bons.push(c);
      });
      bons.sort(function (a, b) { return (b.sim - a.sim) || (String(a.item.codigo) < String(b.item.codigo) ? -1 : 1); });
      var sug = bons.slice(0, 3).map(function (c) { return { codigo: String(c.item.codigo), fonte: c.fonte, descricao: c.item.descricao, unidade: c.item.unidade, custoUnitario: c.item.custoUnitario, confianca: Math.round(c.sim * 100) / 100 }; });
      var sugQ = quase.sort(function (a, b) { return b.sim - a.sim; }).slice(0, 3).map(function (c) { return { codigo: String(c.item.codigo), fonte: c.fonte, descricao: c.item.descricao, unidade: c.item.unidade, custoUnitario: c.item.custoUnitario, confianca: Math.round(c.sim * 100) / 100, aviso: "reprovado nas regras de palavras — confira" }; });
      if (!bons.length) return { ok: false, motivo: cands.length ? "nenhum candidato passou nas regras (unidade, medidas, negação, objeto, intenção)" : "a busca não achou nada nas bases", sugestoes: sugQ, rejeitados: rej.slice(0, 8) };
      var top = bons[0];
      if (top.sim < auto) return { ok: false, motivo: "melhor candidato fraco (" + Math.round(top.sim * 100) + "% < " + Math.round(auto * 100) + "%): " + top.item.codigo, sugestoes: sug, rejeitados: rej.slice(0, 8) };
      var empate = bons.filter(function (c) { return c !== top && top.sim - c.sim <= folga && String(c.item.codigo) !== String(top.item.codigo); });
      if (empate.length) return { ok: false, motivo: "empate entre " + (empate.length + 1) + " candidatos (" + [top].concat(empate).slice(0, 3).map(function (c) { return c.item.codigo; }).join(", ") + ") — decisão do orçamentista", sugestoes: sug, rejeitados: rej.slice(0, 8) };
      return {
        ok: true, codigo: String(top.item.codigo), fonte: top.fonte, confianca: Math.round(top.sim * 100) / 100, via: top.via,
        descricaoBase: top.item.descricao, unidadeBase: top.item.unidade, custoUnitario: Number(top.item.custoUnitario),
        motivo: "casou com " + top.fonte + " " + top.item.codigo + " (semelhança " + Math.round(top.sim * 100) + "%, mesma unidade, medidas e objeto conferidos)",
        sugestoes: sug.slice(1), rejeitados: rej.slice(0, 8)
      };
    }
  };

  if (typeof module !== "undefined" && module.exports) module.exports = Casador;
  global.MorCasador = Casador;
})(typeof window !== "undefined" ? window : globalThis);
