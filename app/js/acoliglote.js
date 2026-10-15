/* =====================================================================
 * acoliglote.js — DIMENSIONAR TODAS AS LIGAÇÕES DE UMA VEZ, combinação por
 * combinação, e AGRUPAR NÓS IGUAIS EM "TIPOS" (motor PURO, ES5, sem DOM,
 * Node-testável). 15/10/2026 — frente F3b.
 *
 * O QUE MUDA EM RELAÇÃO À SUGESTÃO NÓ A NÓ
 *   O js/acoligcalc2.js dimensiona com a ENVOLTÓRIA: o maior V e o maior M,
 *   que podem vir de combinações DIFERENTES (é a favor da segurança, mas não
 *   diz qual combinação manda). Aqui:
 *   1. o arranjo é o da envoltória (o mesmo de sempre — nada fica menor);
 *   2. esse arranjo é VERIFICADO em cada combinação sozinha, com N, V e M da
 *      MESMA combinação juntos (arranjo fixado por `forcar`: parafuso,
 *      espessura, linhas, solda, cantoneira, enrijecedor);
 *   3. a combinação que GOVERNA é a de maior razão; o resultado diz as duas
 *      razões (por combinação × envoltória).
 *   Guardas (revisão adversarial de 15/10/2026):
 *   · se numa combinação o motor NÃO mantém o arranjo da envoltória (outra
 *     dimensão sai diferente), aquela combinação é "não comparável" e o nó
 *     fica "VERIFICAR" — nunca "passa" com combinação que não foi verificada
 *     no arranjo adotado;
 *   · razão não finita (∞/NaN) é reprovação, nunca "ok";
 *   · bloqueio ou "não verificado" crítico do motor → "BLOQUEADA";
 *   · esforço estimado ou ligação a confirmar → "A CONFIRMAR", nunca "passa".
 *
 * TIPOS (nós iguais): mesma tipologia, mesma relação e face, mesmos perfis e
 * aços das peças, mesmos materiais e configuração → um Tipo. O Tipo é
 * dimensionado com as combinações de TODOS os seus nós juntas (o arranjo
 * cobre o PIOR nó, nunca o primeiro) e o resultado se repete nos outros. A
 * combinação que governa diz o nó e a combinação.
 *
 * API
 *   AcoLigLote.porCombinacao(tipologia, entrada)
 *       → { ok, passa, situacao, resultado (o arranjo adotado, verificado na combinação que governa), envoltoria,
 *           combinacoes: [{ comb, no, razao, ok, governante, comparavel }], governa: { comb, no }, razaoMax, razaoEnvoltoria, motivo }
 *   AcoLigLote.chaveTipo(item)               a assinatura de "nó igual"
 *   AcoLigLote.dimensionarTodas(itens, op)   itens = [{ no, tipologia, entrada, relacao, face, nome } | { no, semOpcao: motivo }]
 *       → { ok, tipos: [{ id: "Tipo 1", chave, nos: [], tipologia, nome, relacao, face, calculo (porCombinacao), situacao }], semLigacao: [...], quadro }
 *   AcoLigLote.quadro(tipos)                 [{ tipo, nos, tipologia, razaoMax, combinacao, situacao }]
 *   AcoLigLote.itemDaSugestao(no, sg, Sug)   o item de um nó a partir da sugestão (AcoLigSugere.escolherLote)
 * Teste: node tools/test-aco-liglote.js
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function C2() { return dep("AcoLigCalc2", "./acoligcalc2.js"); }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function br(v, c) { if (v == null || !isFinite(v)) return "—"; c = c == null ? 2 : c; return (Math.round(v * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }
  function finito(v) { return typeof v === "number" && isFinite(v); }

  /* o arranjo da envoltória → o `forcar` do js/acoligcalc2.js (o motor aceita pf, t, linhas, a, cat, ts) */
  function forcarDe(dim) {
    var f = {}; dim = dim || {};
    if (/^M\d/.test(String(dim.parafuso || ""))) f.pf = String(dim.parafuso);
    var t = num(dim.t, num(dim.tp, NaN)); if (t > 0) f.t = t;
    var ln = num(dim.linhas, num(dim.n, NaN)); if (ln > 0) f.linhas = ln;
    var a = num(dim.solda, num(dim.a, NaN)); if (a > 0) f.a = a;
    var cat = dim.cat || dim.cantoneira; if (cat && typeof cat === "string") f.cat = cat;
    var ts = num(dim.ts, NaN); if (ts > 0) f.ts = ts;
    return f;
  }
  function assinatura(r) { return JSON.stringify((r && r.dimensoes) || null); }
  function bloqueada(r) { return !!(r && (arr(r.bloqueante).length || arr(r.naoVerificadoCritico).length || r.naoDimensionada)); }

  function porCombinacao(tid, entrada) {
    var C = C2(); if (!C) return { ok: false, motivo: "motor de ligações (js/acoligcalc2.js) não carregou" };
    entrada = entrada || {};
    var esf = arr(entrada.esforcos);
    if (!esf.length) return { ok: false, passa: false, situacao: "SEM ESFORÇOS", motivo: "nenhuma combinação de esforços para dimensionar" };
    var env = C.verificar(tid, clone(entrada));
    if (!env || env.motivo && !env.verificacoes) return { ok: false, passa: false, situacao: "ERRO", motivo: (env && env.motivo) || "sem resultado", envoltoria: env };
    var fx = forcarDe(env.dimensoes), assEnv = assinatura(env), lst = [];
    Object.keys(entrada.forcar || {}).forEach(function (k) { fx[k] = entrada.forcar[k]; });   /* o que o engenheiro fixou manda */
    esf.forEach(function (s) {
      var e2 = clone(entrada); e2.esforcos = [clone(s)]; e2.forcar = clone(fx);
      var r = C.verificar(tid, e2), raz = r ? r.razao : NaN;
      var comparavel = !!(r && r.verificacoes) && assinatura(r) === assEnv;
      lst.push({ comb: s.comb != null ? String(s.comb) : "?", no: s.no != null ? String(s.no) : null, N: num(s.N, 0), V: num(s.V, 0), M: num(s.M, 0),
                 razao: finito(raz) ? raz : Infinity, naoFinita: !finito(raz), ok: !!(r && r.ok) && finito(raz) && raz <= 1 + 1e-9, governante: r ? (r.governante || r.motivo || "") : "sem resultado", comparavel: comparavel, _r: r });
    });
    /* só as combinações em que o arranjo ADOTADO se manteve contam (as outras foram dimensionadas com outro arranjo) */
    var comp = lst.filter(function (x) { return x.comparavel; }), naoComp = lst.filter(function (x) { return !x.comparavel; }), naoFin = lst.filter(function (x) { return x.naoFinita; });
    var razEnv = finito(env.razao) ? env.razao : Infinity;
    var gov = comp.slice().sort(function (a, b) { return b.razao - a.razao; })[0] || null;
    /* a envoltória (maior V, maior M, maior N de qualquer combinação) cobre cada combinação: a combinação comparável que ALCANÇA a razão
       da envoltória é a que governa. Se nenhuma comparável alcança, a que governa NÃO é determinada (fica dito) e vale a envoltória. */
    var determinada = !!gov && (naoComp.length === 0 || gov.razao >= razEnv - 1e-6);
    var situacao, motivo = "";
    if (bloqueada(env)) { situacao = "BLOQUEADA"; motivo = String(env.governante || "não verificado"); }
    else if (naoFin.length || !finito(env.razao)) { situacao = "NÃO PASSA"; motivo = "razão não finita" + (naoFin.length ? " na(s) combinação(ões) " + naoFin.map(function (x) { return x.comb; }).join(", ") : " na envoltória"); }
    else if (!env.ok) { situacao = "NÃO PASSA"; motivo = String(env.governante || ""); }
    else if (comp.some(function (x) { return !x.ok; })) { situacao = "NÃO PASSA"; motivo = "reprova na combinação " + comp.filter(function (x) { return !x.ok; })[0].comb; }
    else if (env.estimativa || entrada.estimativa || entrada.aConfirmar) { situacao = "A CONFIRMAR"; motivo = env.estimativa || entrada.estimativa ? "esforços ESTIMADOS (sem cálculo da estrutura)" : String(entrada.aConfirmar); }
    else if (!determinada) { situacao = "PASSA (ENVOLTÓRIA)"; motivo = "o motor desta tipologia refaz o arranjo em " + naoComp.length + " combinação(ões) (" + naoComp.map(function (x) { return (x.no ? x.no + "/" : "") + x.comb; }).join(", ") + "): a combinação que governa não é determinada; o arranjo cobre a envoltória de todas (" + br(razEnv * 100, 0) + " %)"; }
    else { situacao = "PASSA"; }
    if (!determinada) gov = null;
    var resultado = gov && gov._r && gov.comparavel ? clone(gov._r) : clone(env);
    if (resultado) { resultado.combinacaoQueGoverna = gov ? { comb: gov.comb, no: gov.no } : null; resultado.razaoEnvoltoria = razEnv; resultado.situacaoLote = situacao; }
    if (resultado && !(situacao === "PASSA" || situacao === "PASSA (ENVOLTÓRIA)")) resultado.ok = false;
    return { ok: true, passa: situacao === "PASSA" || situacao === "PASSA (ENVOLTÓRIA)", governaDeterminada: !!gov, situacao: situacao, motivo: motivo, resultado: resultado, envoltoria: env, arranjo: fx,
             combinacoes: lst.map(function (x) { return { comb: x.comb, no: x.no, N: x.N, V: x.V, M: x.M, razao: x.razao, ok: x.ok, governante: x.governante, comparavel: x.comparavel }; }),
             governa: gov ? { comb: gov.comb, no: gov.no, governante: gov.governante } : null, razaoMax: gov ? gov.razao : razEnv, razaoEnvoltoria: razEnv };
  }

  function sigPerfil(p) { p = p || {}; return [p.nome || "", p.forma || "", num(p.d, 0), num(p.bf, 0), num(p.tw, 0), num(p.tf, 0), num(p.b, 0), num(p.t, 0)].join(","); }
  function sigAco(a) { a = a || {}; return [a.id || "", num(a.fy, 0), num(a.fu, 0)].join(","); }
  function chaveTipo(it) {
    var e = (it && it.entrada) || {};
    return [it.tipologia, it.relacao || "", it.face || e.face || "", sigPerfil(e.viga), sigPerfil(e.apoio || e.pilar), sigPerfil(e.diagonal), sigAco(e.acoViga), sigAco(e.acoApoio),
            JSON.stringify(e.parafuso || null), JSON.stringify(e.eletrodo || null), JSON.stringify(e.aco || null), JSON.stringify(e.chumbador || null), JSON.stringify(e.config || null),
            e.topoPilar ? "topo" : "", e.corte || "", JSON.stringify(e.concreto || null), num(e.alfa, 0)].join("|");
  }

  function dimensionarTodas(itens, op) {
    op = op || {};
    var grupos = [], porChave = {}, sem = [];
    arr(itens).forEach(function (it) {
      if (!it || it.semOpcao || !it.tipologia || !it.entrada) { sem.push({ no: it && it.no, motivo: (it && it.semOpcao) || "sem ligação escolhida" }); return; }
      var k = chaveTipo(it);
      if (!porChave[k]) { porChave[k] = { chave: k, itens: [] }; grupos.push(porChave[k]); }
      porChave[k].itens.push(it);
    });
    var tipos = grupos.map(function (g, i) {
      var base = clone(g.itens[0].entrada), esf = [], estim = false, acf = null;
      g.itens.forEach(function (it) {
        if (it.entrada.estimativa) estim = true; if (it.entrada.aConfirmar) acf = it.entrada.aConfirmar;
        arr(it.entrada.esforcos).forEach(function (s) { var q = clone(s); q.no = String(it.no); esf.push(q); });
      });
      base.esforcos = esf; if (estim) base.estimativa = true; if (acf) base.aConfirmar = acf;
      var calc = porCombinacao(g.itens[0].tipologia, base);
      return { id: "Tipo " + (i + 1), chave: g.chave, nos: g.itens.map(function (it) { return String(it.no); }), tipologia: g.itens[0].tipologia, nome: g.itens[0].nome || g.itens[0].tipologia,
               relacao: g.itens[0].relacao || "", face: g.itens[0].face || "", calculo: calc, situacao: calc.situacao };
    });
    return { ok: true, tipos: tipos, semLigacao: sem, quadro: quadro(tipos, sem), nNos: arr(itens).length };
  }

  function quadro(tipos, sem) {
    var L = arr(tipos).map(function (t) {
      var c = t.calculo || {}, g = c.governa || {};
      return { tipo: t.id, nos: t.nos.slice(), tipologia: t.nome, razaoMax: c.razaoMax, razaoEnvoltoria: c.razaoEnvoltoria,
               combinacao: g.comb ? (t.nos.length > 1 && g.no ? "nó " + g.no + " · " : "") + g.comb : (c.ok ? "não determinada (envoltória)" : "—"), situacao: t.situacao, motivo: c.motivo || "" };
    });
    arr(sem).forEach(function (s) { L.push({ tipo: "—", nos: [String(s.no)], tipologia: "sem ligação", razaoMax: NaN, razaoEnvoltoria: NaN, combinacao: "—", situacao: "SEM LIGAÇÃO", motivo: s.motivo }); });
    return L;
  }

  /* o item de um nó a partir da sugestão (sg = AcoLigSugere.sugerir) — a mesma escolha do "Ligar todos os nós" */
  function itemDaSugestao(no, sg, Sug) {
    Sug = Sug || dep("AcoLigSugere", "./acoligsugere.js");
    if (!sg || !sg.ok || !Sug || !Sug.escolherLote) return { no: no, semOpcao: (sg && sg.motivo) || "sem sugestão" };
    var esc = Sug.escolherLote(sg);
    if (!esc.opcao) return { no: no, semOpcao: esc.motivo || "nenhuma opção que passa" };
    return { no: no, tipologia: esc.opcao.tipologia, nome: esc.opcao.nome, entrada: clone(esc.opcao.entrada), relacao: sg.relacao, face: sg.face };
  }

  function quadroHtml(q) {
    function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
    return "<table><thead><tr><th>Tipo</th><th>Nós</th><th>Tipologia</th><th>Razão máx.</th><th>Combinação que governa</th><th>Situação</th></tr></thead><tbody>" +
      arr(q).map(function (r) { return "<tr><td>" + esc(r.tipo) + "</td><td>" + esc(r.nos.join(", ")) + "</td><td>" + esc(r.tipologia) + "</td><td>" + (finito(r.razaoMax) ? br(r.razaoMax * 100, 0) + " %" : "—") + "</td><td>" + esc(r.combinacao) + "</td><td><b>" + esc(r.situacao) + "</b>" + (r.motivo ? " — " + esc(r.motivo) : "") + "</td></tr>"; }).join("") + "</tbody></table>";
  }

  /* RELATÓRIO POR TIPO (F3b, item 3 — versão HTML): a) detalhe (o esquema da tipologia, sem escala), b) descrição dos
     elementos (perfis e o arranjo), c) verificações (item da norma, fórmula, solicitante, resistente, razão) na combinação que
     governa, d) quantitativo (o que o arranjo diz: chapa, parafusos, solda — × nós do Tipo; o que ele não diz fica "não
     levantado", nunca inventado) + o quadro-resumo geral. */
  function quantitativo(r, nNos) {
    var d = (r && r.dimensoes) || {}, L = [], rho = 7850;
    var M = dep("AcoMateriais", "./acomateriais.js"); if (M && M.CONST && M.CONST.rho) rho = M.CONST.rho;
    var t = num(d.t, NaN), lg = num(d.largura, NaN), al = num(d.altura, NaN), nCh = num(d.chapas, 1);
    if (t > 0 && lg > 0 && al > 0) { var kg = t * lg * al * 1e-9 * rho * nCh; L.push({ item: "Chapa " + br(t, 1) + " × " + br(lg, 0) + " × " + br(al, 0) + " mm", qtd: nCh * nNos, unid: "pç", peso: kg * nNos }); }
    else L.push({ item: "Chapas", qtd: null, unid: "", peso: null, nota: "não levantado pelo arranjo — sai do modelo depois de aplicar (Memorial das ligações)" });
    var np = num(d.n, NaN);
    if (/^M\d/.test(String(d.parafuso || "")) && np > 0) L.push({ item: "Parafuso " + d.parafuso + (d.classe ? " " + d.classe : "") + " + porca + arruela", qtd: np * nNos, unid: "cj", peso: null });
    else if (d.parafuso) L.push({ item: "Parafusos " + d.parafuso, qtd: null, unid: "", peso: null, nota: "quantidade não levantada pelo arranjo" });
    var a = num(d.solda, num(d.a, NaN)), lw = num(d.Lw, NaN);
    if (a > 0 && lw > 0) L.push({ item: "Solda de filete " + br(a, 0) + " mm", qtd: lw * nNos / 1000, unid: "m", peso: null });
    else if (d.soldaMesa || d.soldaAlma || a > 0) L.push({ item: "Solda" + (d.soldaMesa ? " (mesas: " + d.soldaMesa + ")" : ""), qtd: null, unid: "", peso: null, nota: "comprimento não levantado pelo arranjo" });
    return L;
  }
  function relatorio(d) {
    var T = dep("AcoLigTipos", "./acoligtipos.js");
    return arr(d && d.tipos).map(function (tp) {
      var c = tp.calculo || {}, r = c.resultado || {}, e0 = {};
      return { tipo: tp.id, nos: tp.nos.slice(), tipologia: tp.tipologia, nome: tp.nome, situacao: tp.situacao, motivo: c.motivo || "", governa: c.governa,
               detalhe: { svg: T && T.svg ? T.svg(tp.tipologia) : "", nota: "esquema da tipologia, sem escala — o desenho cotado sai da ligação aplicada no modelo" },
               descricao: { relacao: tp.relacao, face: tp.face, arranjo: clone(r.dimensoes || {}), resumo: r.resumo || "" },
               verificacoes: arr(r.verificacoes).map(function (v) { return { nome: v.nome, item: v.item, formula: arr(v.passos).map(function (q) { return q.rotulo + (q.formula ? " " + q.formula : "") + (q.valor != null && q.valor !== "" ? " = " + q.valor : ""); }).join("; "), solicitante: v.solicitante, resistente: v.resistencia, unidade: v.unidade, razao: v.razao }; }),
               naoVerificado: arr(r.naoVerificado).slice(), quantitativo: quantitativo(r, tp.nos.length), _e: e0 };
    });
  }
  function relatorioHtml(d) {
    function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
    var h = "<h2>Ligações — resumo geral</h2>" + quadroHtml(d && d.quadro);
    relatorio(d).forEach(function (x) {
      h += "<h3>" + esc(x.tipo) + " — " + esc(x.nome) + " (nós " + esc(x.nos.join(", ")) + ") — " + esc(x.situacao) + "</h3>" + (x.motivo ? "<p>" + esc(x.motivo) + "</p>" : "") +
        "<h4>a) Detalhe</h4>" + (x.detalhe.svg || "") + "<p>" + esc(x.detalhe.nota) + "</p>" +
        "<h4>b) Descrição</h4><p>" + esc(x.descricao.relacao) + (x.descricao.face ? " · face " + esc(x.descricao.face) : "") + " — " + esc(x.descricao.resumo) + "</p><ul>" + Object.keys(x.descricao.arranjo).filter(function (k) { var v = x.descricao.arranjo[k]; return v != null && typeof v !== "object"; }).map(function (k) { return "<li>" + esc(k) + ": " + esc(x.descricao.arranjo[k]) + "</li>"; }).join("") + "</ul>" +
        "<h4>c) Verificações" + (x.governa && x.governa.comb ? " (combinação que governa: " + esc((x.governa.no ? x.governa.no + " · " : "") + x.governa.comb) + ")" : " (envoltória)") + "</h4><table><thead><tr><th>Verificação</th><th>Item</th><th>Fórmula</th><th>Solicitante</th><th>Resistente</th><th>Razão</th></tr></thead><tbody>" +
        x.verificacoes.map(function (v) { return "<tr><td>" + esc(v.nome) + "</td><td>" + esc(v.item) + "</td><td>" + esc(v.formula) + "</td><td>" + br(v.solicitante, 2) + " " + esc(v.unidade) + "</td><td>" + br(v.resistente, 2) + " " + esc(v.unidade) + "</td><td>" + (finito(v.razao) ? br(v.razao, 3) : "∞ (NÃO PASSA)") + "</td></tr>"; }).join("") + "</tbody></table>" +
        (x.naoVerificado.length ? "<p><b>Não verificado:</b></p><ul>" + x.naoVerificado.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ul>" : "") +
        "<h4>d) Quantitativo (" + x.nos.length + " nó(s))</h4><ul>" + x.quantitativo.map(function (q) { return "<li>" + esc(q.item) + ": " + (q.qtd != null ? br(q.qtd, q.unid === "m" ? 2 : 0) + " " + esc(q.unid) : "—") + (q.peso != null ? " (" + br(q.peso, 1) + " kg)" : "") + (q.nota ? " — " + esc(q.nota) : "") + "</li>"; }).join("") + "</ul>";
    });
    return h;
  }

  var AcoLigLote = { porCombinacao: porCombinacao, chaveTipo: chaveTipo, dimensionarTodas: dimensionarTodas, quadro: quadro, quadroHtml: quadroHtml, itemDaSugestao: itemDaSugestao, forcarDe: forcarDe,
                     relatorio: relatorio, relatorioHtml: relatorioHtml, quantitativo: quantitativo };
  global.AcoLigLote = AcoLigLote;
  if (typeof module !== "undefined" && module.exports) module.exports = AcoLigLote;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
