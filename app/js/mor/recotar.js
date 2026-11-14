/* =====================================================================
 * mor/recotar.js — RECOTAÇÃO E TROCA DE UF/COMPETÊNCIA (F11 do MOR, ESPEC §15 itens 1 e 2)
 *
 * Compara o preço GRAVADO em cada item com o preço ATUAL da base carregada (UF/competência vigentes):
 *   comparar(orc, ctx, opts)  → { modo:"recotar", linhas[], resumo, contexto }   (item 1: antes × depois e diferença total)
 *   recasar(orc, ctx, opts)   → { modo:"recasar", … }                            (item 2: re-casa PELO CÓDIGO na base da nova UF;
 *                                                                                 código que não existe lá fica «pendente», nunca é trocado por parecido)
 *   aplicar(orc, plano, opts) → grava — SÓ com opts.confirmado === true (o OK do usuário) e orçamento não travado.
 * Puro, ES5, sem DOM. `ctx.obter(fonte, codigo)` = o mesmo do Orçamentista (App._orcmCtx). Nada aqui lê rede nem inventa preço.
 *
 * ESTADO de cada linha:
 *   igual · mudou · ausente (código não existe na base consultada) · sem-preco (a base tem o código mas preço ≤ 0:
 *   nunca zera o item) · preservado (preço de cotação de fornecedor ou ajustado por você: não é sobrescrito) ·
 *   regime (item gravado em regime diferente do da base: não comparável) · proprio (item próprio, sem base) ·
 *   sem-codigo (item sem código).
 * `recasar` converte «ausente» em «pendente»: ao aplicar, o item ganha `mor.pendenteBase` (motivo, UF, competência),
 *   mantém preço e quantidade (quem decide o destino é o orçamentista) e o valor que ficou na base antiga é somado em
 *   `resumo.valorPendente`.
 * Modo de custo: item «só MO» compara com o custoMO da base; «MAT+EQ» com custoMAT+custoEQ; senão com o custo cheio.
 * ===================================================================== */
(function (global) {
  "use strict";

  function arr(v) { return Object.prototype.toString.call(v) === "[object Array]" ? v : []; }
  function num(v) { v = Number(v); return isFinite(v) ? v : 0; }
  function r2(x) { return Math.round(num(x) * 100) / 100; }
  function up(s) { return String(s == null ? "" : s).toUpperCase(); }

  var IGUAL = 0.005;   /* menos de meio centavo = o mesmo preço */

  function fonteDe(it) { return String(it.baseFonte || it.origem || "").trim(); }
  function propria(f) { var u = up(f); return !u || u === "PROPRIO" || u === "PROPRIA"; }
  function semCodigo(c) { var s = String(c == null ? "" : c).trim(); return !s || s === "—" || s === "-"; }

  /* o preço da base que corresponde ao modo de custo do item */
  function precoDaBase(it, b) {
    if (it.modoCusto === "mo") return num(b.custoMO);
    if (it.modoCusto === "matEq") return num(b.custoMAT) + num(b.custoEQ);
    return num(b.custoUnitario);
  }

  function preservado(it) {
    if (it.cotacao && typeof it.cotacao === "object") return "preço de cotação (" + String(it.cotacao.fornecedor || "fornecedor") + ") — não é sobrescrito";
    if (it.ajustes && it.ajustes.custoUnitario) return "preço ajustado por você — não é sobrescrito";
    return "";
  }

  function mesmaUf(a, b) { return up(a) === up(b); }

  function analisar(orc, ctx, opts, modo) {
    opts = opts || {};
    var linhas = [], R = { nItens: 0, nMudaram: 0, nIguais: 0, nAusentes: 0, nPendentes: 0, nPreservados: 0, nSemPreco: 0, nIgnorados: 0, totalAntes: 0, totalDepois: 0, diferenca: 0, valorPendente: 0, pct: 0 };
    var ufBase = opts.uf !== undefined ? String(opts.uf || "") : String((ctx && ctx.uf) || ""), compBase = opts.competencia !== undefined ? String(opts.competencia || "") : String((ctx && ctx.competencia) || "");
    var contexto = {
      ufOrc: String((orc && orc.uf) || ""), compOrc: String((orc && orc.competenciaSinapi) || ""), ufBase: ufBase, compBase: compBase,
      troca: !!((ufBase && orc && orc.uf && !mesmaUf(ufBase, orc.uf)) || (compBase && orc && orc.competenciaSinapi && compBase !== orc.competenciaSinapi))
    };
    if (!orc || !ctx || typeof ctx.obter !== "function") return { modo: modo, ok: false, motivo: "sem orçamento ou sem base carregada", linhas: [], resumo: R, contexto: contexto };
    arr(orc.etapas).forEach(function (e) {
      arr(e && e.itens).forEach(function (it) {
        if (!it) return;
        R.nItens++;
        var q = num(it.quantidade), antes = num(it.custoUnitario), fonte = fonteDe(it);
        var L = { etapaId: e.id, etapa: e.nome || "", itemId: it.id, codigo: String(it.codigo == null ? "" : it.codigo), fonte: fonte, descricao: it.descricao || "", unidade: it.unidade || "", quantidade: q, antes: antes, depois: antes, diferenca: 0, estado: "", motivo: "" };
        var base = null, pres;
        if (semCodigo(it.codigo)) { L.estado = "sem-codigo"; L.motivo = "item sem código: não há o que consultar na base"; R.nIgnorados++; }
        else if (propria(fonte)) { L.estado = "proprio"; L.motivo = "item próprio: não tem base de preço"; R.nIgnorados++; }
        else if ((pres = preservado(it))) { L.estado = "preservado"; L.motivo = pres; R.nPreservados++; }
        else {
          try { base = ctx.obter(fonte, it.codigo); } catch (eo) { base = null; }
          if (!base) {
            if (modo === "recasar") { L.estado = "pendente"; L.motivo = "o código " + L.codigo + " não existe na base " + (ufBase || "nova") + (compBase ? " " + compBase : "") + " — fica pendente (nada é trocado por parecido)"; R.nPendentes++; R.valorPendente += antes * q; }
            else { L.estado = "ausente"; L.motivo = "o código " + L.codigo + " não está na base carregada"; R.nAusentes++; }
          } else if (typeof it.desonerado === "boolean" && typeof opts.desonerado === "boolean" && it.desonerado !== opts.desonerado) {
            L.estado = "regime"; L.motivo = "item gravado " + (it.desonerado ? "desonerado" : "não desonerado") + " e a base é " + (opts.desonerado ? "desonerada" : "não desonerada") + " — não comparável"; R.nIgnorados++;
          } else {
            var dep = precoDaBase(it, base);
            if (!(dep > 0)) { L.estado = "sem-preco"; L.motivo = "a base tem o código, mas sem preço — o item não é zerado"; R.nSemPreco++; }
            else {
              L.depois = dep; L.base = { custoUnitario: num(base.custoUnitario), custoMO: num(base.custoMO), custoMAT: num(base.custoMAT), custoEQ: num(base.custoEQ) };
              if (Math.abs(dep - antes) < IGUAL) { L.estado = "igual"; R.nIguais++; }
              else {
                L.estado = "mudou"; L.diferenca = r2((dep - antes) * q); R.nMudaram++;
                R.totalAntes += antes * q; R.totalDepois += dep * q; R.diferenca += L.diferenca;
              }
            }
          }
        }
        linhas.push(L);
      });
    });
    R.totalAntes = r2(R.totalAntes); R.totalDepois = r2(R.totalDepois); R.diferenca = r2(R.diferenca); R.valorPendente = r2(R.valorPendente);
    R.pct = R.totalAntes > 0 ? r2((R.diferenca / R.totalAntes) * 100) : 0;
    return { modo: modo, ok: true, linhas: linhas, resumo: R, contexto: contexto };
  }

  function achar(orc, etapaId, itemId) {
    var r = null;
    arr(orc && orc.etapas).forEach(function (e) { if (e && e.id === etapaId) arr(e.itens).forEach(function (i) { if (i && i.id === itemId) r = i; }); });
    return r;
  }

  var Recotar = {
    IGUAL: IGUAL,
    precoDaBase: precoDaBase,
    comparar: function (orc, ctx, opts) { return analisar(orc, ctx, opts, "recotar"); },
    recasar: function (orc, ctx, opts) { return analisar(orc, ctx, opts, "recasar"); },

    /* Grava o plano. NADA muda sem opts.confirmado === true. opts: { confirmado, travado, ids:[itemId], quem, agora,
       atualizarOrcamento (grava orc.uf / orc.competenciaSinapi do contexto, só no recasar) }.
       Devolve { ok, aplicados, pendentes, motivo }. Idempotente: aplicar de novo não muda mais nada. */
    aplicar: function (orc, plano, opts) {
      opts = opts || {};
      if (opts.confirmado !== true) return { ok: false, aplicados: 0, pendentes: 0, motivo: "falta o OK do usuário — nada foi alterado" };
      if (opts.travado) return { ok: false, aplicados: 0, pendentes: 0, motivo: "orçamento aprovado não muda o preço: crie uma revisão" };
      if (!plano || !plano.ok) return { ok: false, aplicados: 0, pendentes: 0, motivo: "plano inválido" };
      var so = null, em = opts.agora || new Date().toISOString(), nA = 0, nP = 0;
      if (opts.ids) { so = {}; arr(opts.ids).forEach(function (i) { so[i] = 1; }); }
      var ctxo = plano.contexto || {};
      plano.linhas.forEach(function (L) {
        if (so && !so[L.itemId]) return;
        var it = achar(orc, L.etapaId, L.itemId); if (!it) return;
        if (L.estado === "mudou") {
          /* o preço de ANTES fica no carimbo: desfazer à mão é possível e a trilha é visível */
          it.custoUnitario = L.depois;
          if (L.base) { it.custoMO = L.base.custoMO; it.custoMAT = L.base.custoMAT; it.custoEQ = L.base.custoEQ; if (it.custoBase != null) it.custoBase = L.base.custoUnitario; }
          it.mor = it.mor || {};
          it.mor.recotado = { antes: L.antes, depois: L.depois, em: em, por: opts.quem || "", uf: ctxo.ufBase || "", competencia: ctxo.compBase || "" };
          if (it.mor.pendenteBase) delete it.mor.pendenteBase;
          nA++;
        } else if (L.estado === "pendente") {
          it.mor = it.mor || {};
          it.mor.pendenteBase = { motivo: L.motivo, uf: ctxo.ufBase || "", competencia: ctxo.compBase || "", em: em };
          nP++;
        } else if (L.estado === "igual" && it.mor && it.mor.pendenteBase) { delete it.mor.pendenteBase; }
      });
      if (plano.modo === "recasar" && opts.atualizarOrcamento === true && orc) {
        if (ctxo.ufBase) orc.uf = ctxo.ufBase;
        if (ctxo.compBase) orc.competenciaSinapi = ctxo.compBase;
      }
      return { ok: true, aplicados: nA, pendentes: nP, motivo: "" };
    }
  };

  if (typeof module !== "undefined" && module.exports) module.exports = Recotar;
  global.MorRecotar = Recotar;
})(typeof window !== "undefined" ? window : globalThis);
