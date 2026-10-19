/* =====================================================================
 * hideta.js — ESTAÇÃO DE TRATAMENTO DE ÁGUA (NBR 12216:1992) — motor PURO,
 * ES5, Node-testável. Fase 4 do plano docs/hidro/PLANO-HIDROSSANITARIO.md;
 * contrato em docs/hidro/CONTRATO-TRATAMENTO.md.
 *
 * Ciclo completo: mistura rápida → floculação (tempo) → decantação (taxa de
 * aplicação superficial, velocidade longitudinal, calhas) → filtração (taxa,
 * leito, lavagem) → desinfecção. Calcula o que tem fonte (tr.nbr12216_eta,
 * valores "sem ensaios" citados numa monografia da UFU); o resto sai PENDENTE
 * declarado com a chave e o "corrigir".
 *
 * ⚠ Faixas da norma ("20 a 30 min") viram decisão registrada: sem o valor do
 *   projeto (entrada) adota-se o limite que dá a unidade MAIOR, como premissa.
 * ⚠ Profundidade de floculador e decantador NÃO tem fonte na base: sem ela a
 *   unidade sai com volume/área, mas sem dimensões (pendente) — nunca com
 *   profundidade "típica".
 * ⚠ Nenhum número de norma no código (tools/test-hid-sem-numero-magico.js).
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arquivo) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arquivo); } catch (e) {} }
    return null;
  }
  function N() { return dep("HidNormas", "./hidnormas.js"); }
  function HT() { return dep("HidTrat", "./hidtrat.js"); }
  function num(v, d) { var n = Number(v); return v !== null && v !== undefined && v !== "" && isFinite(n) ? n : d; }
  function txt(v) { return v == null ? "" : String(v); }

  var E0 = "tr.nbr12216_eta";
  var C3 = 3;   /* hid:ok casas decimais na formatação */

  function linhaETA(ctx, unidade, re, U, usadoEm) {
    var ls = ctx.linhas(E0, { unidade: unidade }, usadoEm);
    if (!ls) return null;
    for (var i = 0; i < ls.length; i++) if (re.test(U.semAcento(ls[i].parametro))) return ls[i];
    ctx.pendencia(E0 + "[" + unidade + ": " + re.source + "]", "linha não encontrada na tabela da 12216", usadoEm);
    return null;
  }

  function floculador(e, Q, ctx, R, U, ed) {
    var out = { status: "pendente", passos: [] }, l = linhaETA(ctx, "floculador", /^tempo de detencao total/, U, "floculação");
    if (!l) return out;
    var f = U.faixa(l.valor), T = num(e.floculador && e.floculador.tempo_min, null);
    R.param("tempo de detenção do floculador", txt(l.valor), "min", E0, ed);
    if (T == null) { T = f.max; R.premissa("tempo de floculação", U.fmt(T) + " min (limite superior da faixa " + txt(l.valor) + " — floculador maior)", "padrao_motor", R.fonteDe(E0)); }
    else { R.premissa("tempo de floculação", T + " min", "entrada"); R.verif("floculador", "tempo de detenção na faixa", T, f.max, "min", U.naFaixa(f, T), ["T = " + U.fmt(T) + " min; faixa " + txt(l.valor)], E0, ed); }
    var V = Q / U.S_POR_DIA * (T * U.MIN_POR_H);   /* m³/s × s */
    out.T_min = T; out.V_m3 = V;
    out.passos.push("V = Q × T = " + U.fmt(Q / U.S_POR_DIA, C3) + " m³/s × " + U.fmt(T) + " min = " + U.fmt(V, C3) + " m³");
    /* gradiente: a F1 não achou — a consulta registra a pendência com o motivo dela */
    var cg = ctx.consulta("tr.nbr12216_floculacao_gradiente_e_mistura_rapida", null, "valor", "gradiente de velocidade da floculação");
    R.verif("floculador", "gradiente de velocidade", null, null, "s⁻¹", null, ["pendente: " + (cg.ok ? "" : cg.motivo)], null, "");
    var h = num(e.floculador && e.floculador.profundidade_m, null);
    if (h == null) { R.pend("entrada.eta.floculador.profundidade_m", "profundidade útil do floculador sem fonte na base: volume calculado, dimensões não", "floculação", "informar entrada.floculador.profundidade_m (decisão do projeto)"); return out; }
    R.premissa("profundidade do floculador", h + " m", "entrada");
    var r = num(e.floculador && e.floculador.relacao_CL, 2), A = V / h, W = U.teto2(Math.sqrt(A / r)), L = U.teto2(Math.max(r * W, A / W));
    if (!(e.floculador && e.floculador.relacao_CL)) R.premissa("planta do floculador", "comprimento = 2 × largura (geometria, não norma)", "padrao_motor");
    out.h_m = h; out.relacao = r; out.largura_m = W; out.comprimento_m = L; out.volumeReal_m3 = U.r3(L * W * h); out.camaras = Math.max(1, Math.round(num(e.floculador && e.floculador.camaras, 1)));
    out.passos.push("A = V/h = " + U.fmt(A, C3) + " m² → " + U.fmt(L) + " × " + U.fmt(W) + " m");
    R.verif("floculador", "volume útil ≥ Q × T", out.volumeReal_m3, U.r3(V), "m³", out.volumeReal_m3 >= V - 1e-6, out.passos.slice(), E0, ed, "min");   /* hid:ok tolerância */
    out.status = "ok";
    return out;
  }

  function decantador(e, Q, ctx, R, U, ed) {
    var out = { status: "pendente", passos: [] }, ls = ctx.linhas(E0, { unidade: "decantador" }, "decantação");
    if (!ls) return out;
    var bom = !!(e.opcoes && e.opcoes.bomControleOperacional), taxa = null, lt = null;
    ls.forEach(function (l) {
      if (taxa != null || !/^taxa de aplicacao superficial|^estacao (de|acima)/.test(U.semAcento(l.parametro)) || !/m3\/m2/.test(U.semAcento(l.valor))) return;
      var f = U.faixa(U.semAcento(l.parametro));
      if (!f || Q > f.max) return;
      taxa = U.celula(l.valor); lt = l;
      var mC = /caso contrario\s*(\d+(?:[.,]\d+)?)/.exec(U.semAcento(l.parametro));
      if (mC && !bom) { taxa = U.numeroBR(mC[1]); R.premissa("taxa do decantador", U.fmt(taxa) + " m³/m².dia (sem 'bom controle operacional' declarado — a menor da linha)", "padrao_motor", R.fonteDe(E0)); }
    });
    if (taxa == null) { ctx.pendencia(E0 + "[decantador " + U.fmt(Q, 0) + " m3/dia]", "nenhuma faixa de taxa de aplicação cobre " + U.fmt(Q, 0) + " m³/dia", "decantação"); return out; }
    R.param("taxa de aplicação superficial (" + lt.parametro + ")", taxa, "m³/m².dia", E0, ed);
    var lN = linhaETA(ctx, "decantador", /em operacao continua/, U, "decantação"), n = 1;
    if (lN) {
      var fN = U.faixa(U.semAcento(lN.parametro).replace(/\(.*\)/, ""));
      if (fN && U.naFaixa(fN, Q)) { n = U.celula(lN.valor); R.param("número mínimo de decantadores (Q > " + U.fmt(fN.min, 0) + " m³/dia)", n, "un", E0, ed); }
    }
    var nE = num(e.decantador && e.decantador.unidades, null);
    if (nE != null) { R.verif("decantador", "número de decantadores", nE, n, "un", nE >= n, ["informado " + nE + "; mínimo " + n], E0, ed, "min"); n = nE; }
    var A = Q / taxa, Au = A / n, Qu = Q / n;
    out.n = n; out.taxa = taxa; out.A_m2 = A;
    out.passos.push("A = Q / taxa = " + U.fmt(Q) + " / " + U.fmt(taxa) + " = " + U.fmt(A, C3) + " m² (" + n + " unidade(s) de " + U.fmt(Au, C3) + " m²)");
    var lC = linhaETA(ctx, "decantador", /^vazao por metro linear de borda/, U, "decantação");
    if (lC) { var qc = U.celula(lC.valor); out.calha_m = U.r2(Qu / U.S_POR_DIA * 1000 / qc); out.passos.push("borda de calha ≥ Q/" + U.fmt(qc) + " L/(s.m) = " + U.fmt(out.calha_m) + " m por decantador"); }
    var h = num(e.decantador && e.decantador.profundidade_m, null);
    if (h == null) { R.pend("entrada.eta.decantador.profundidade_m", "profundidade útil do decantador sem fonte na base: área calculada, dimensões não", "decantação", "informar entrada.decantador.profundidade_m (decisão do projeto)"); return out; }
    R.premissa("profundidade do decantador", h + " m", "entrada");
    var lV = linhaETA(ctx, "decantador", /^velocidade longitudinal maxima/, U, "decantação"), vmax = lV ? U.celula(lV.valor) / U.CM_POR_M : null;
    /* a linha só vale na faixa de vazão que o texto dela diz ("estações até 10.000 m3/dia") */
    var fVL = lV ? U.faixa(U.semAcento(lV.parametro)) : null;
    if (lV && fVL && Q > fVL.max) {
      vmax = null;
      R.pend(E0 + "[velocidade longitudinal acima de " + U.fmt(fVL.max, 0) + " m3/dia]", "velocidade longitudinal máxima transcrita só para " + lV.parametro, "decantação", "transcrever da 12216 o limite para a vazão desta estação");
    }
    var Bv = vmax ? Qu / U.S_POR_DIA / (vmax * h) : 0;
    var r = num(e.decantador && e.decantador.relacao_CL, 2), W = U.teto2(Math.max(Bv, Math.sqrt(Au / r))), L = U.teto2(Math.max(r * W, Au / W));
    if (!(e.decantador && e.decantador.relacao_CL)) R.premissa("planta do decantador", "comprimento ≥ 2 × largura (geometria, não norma); a largura cresce se a velocidade longitudinal pedir", "padrao_motor");
    out.h_m = h; out.larguraMin_m = Bv; out.relacao = r; out.largura_m = W; out.comprimento_m = L; out.volumeReal_m3 = U.r3(L * W * h);
    out.passos.push("B ≥ Q/(v·h) = " + U.fmt(Bv, C3) + " m; B = " + U.fmt(W) + " m; L = " + U.fmt(L) + " m");
    var tx = Qu / (L * W);
    R.verif("decantador", "taxa de aplicação superficial", U.r2(tx), taxa, "m³/m².dia", tx <= taxa + 1e-9, out.passos.slice(), E0, ed);   /* hid:ok tolerância */
    if (vmax) { var vL = Qu / U.S_POR_DIA / (W * h); R.verif("decantador", "velocidade longitudinal", U.r3(vL * U.CM_POR_M), U.celula(lV.valor), "cm/s", vL <= vmax + 1e-12, ["v = Q/(B·h) = " + U.fmt(vL * U.CM_POR_M, C3) + " cm/s"], E0, ed); }   /* hid:ok tolerância */
    out.status = "ok";
    return out;
  }

  function filtros(e, Q, ctx, R, U, ed) {
    var out = { status: "pendente", passos: [] }, camada = txt(e.filtro && e.filtro.camada) || "dupla";
    if (camada !== "dupla") { ctx.consulta("tr.nbr12216_floculacao_gradiente_e_mistura_rapida", null, "valor", "taxa de filtração de leito " + camada); R.pend("tr.nbr12216_filtro_" + camada, "taxa de filtração de leito " + camada + " não transcrita", "filtração", "transcrever da 12216 ou usar camada dupla"); return out; }
    if (!(e.filtro && e.filtro.camada)) R.premissa("filtro", "rápido de camada dupla (areia + antracito) — o único com taxa transcrita", "padrao_motor");
    var l = linhaETA(ctx, "filtro", /^taxa maxima de filtracao em filtro rapido de camada dupla/, U, "filtração");
    if (!l) return out;
    var taxa = U.celula(l.valor), n = Math.max(1, Math.round(num(e.filtro && e.filtro.unidades, 2)));
    if (!(e.filtro && e.filtro.unidades)) R.premissa("número de filtros", n + " (geometria: lavar um sem parar a estação) — o RT ajusta", "padrao_motor");
    R.param("taxa máxima de filtração (camada dupla)", taxa, "m³/m².dia", E0, ed);
    var A = Q / taxa, Au = A / n;
    var lA = linhaETA(ctx, "filtro", /^areia: espessura/, U, "filtração"), lB = linhaETA(ctx, "filtro", /^antracito: espessura/, U, "filtração");
    var hA = lA ? U.celula(lA.valor) / U.CM_POR_M : null, hB = lB ? U.celula(lB.valor) / U.CM_POR_M : null;
    if (hA != null) R.param("espessura mínima da areia", hA, "m", E0, ed);
    if (hB != null) R.param("espessura mínima do antracito", hB, "m", E0, ed);
    var hL = (hA || 0) + (hB || 0);
    var W = U.teto2(Math.sqrt(Au)), L = U.teto2(Math.max(W, Au / W));
    out.n = n; out.taxa = taxa; out.A_m2 = A; out.hLeito_m = hL; out.largura_m = W; out.comprimento_m = L;
    out.passos.push("A = Q / taxa = " + U.fmt(Q) + " / " + U.fmt(taxa) + " = " + U.fmt(A, C3) + " m² → " + n + " filtros de " + U.fmt(L) + " × " + U.fmt(W) + " m (planta quadrada)");
    out.passos.push("leito = areia " + U.fmt(hA) + " m + antracito " + U.fmt(hB) + " m = " + U.fmt(hL) + " m (espessuras mínimas sem filtro-piloto)");
    var tx = Q / n / (L * W);
    R.verif("filtro", "taxa de filtração", U.r2(tx), taxa, "m³/m².dia", tx <= taxa + 1e-9, out.passos.slice(), E0, ed);   /* hid:ok tolerância */
    var lL = linhaETA(ctx, "filtro", /^velocidade ascensional minima de lavagem/, U, "lavagem");
    if (lL) { out.lavagem_Ls = U.r2(U.celula(lL.valor) / U.CM_POR_M * L * W / U.MIN_POR_H * 1000); out.passos.push("lavagem: " + txt(lL.valor) + " × " + U.fmt(L * W, C3) + " m² = " + U.fmt(out.lavagem_Ls) + " L/s por filtro"); R.param("velocidade ascensional mínima de lavagem", txt(lL.valor), "-", E0, ed); }
    out.status = "ok";
    return out;
  }

  function calcular(entrada) {
    var e = entrada || {}, H = N(), U = HT().util, R = U.novoRes("eta", e.ctx || H.contexto()), ctx = R.ctx, un = [];   /* contexto próprio (revisão J6) */
    var Q = num(e.vazao_m3_dia, null);
    if (Q == null && num(e.vazao_Ls, null) != null) Q = num(e.vazao_Ls, 0) / 1000 * U.S_POR_DIA;
    if (Q == null) { R.pend("entrada.eta.vazao", "vazão da ETA não informada", "ETA", "informar entrada.vazao_Ls ou entrada.vazao_m3_dia"); return R.fechar({ vazao_m3_dia: null, unidades: un }); }
    R.premissa("vazão de projeto", U.fmt(Q) + " m³/dia (" + U.fmt(Q / U.S_POR_DIA * 1000, C3) + " L/s)", "entrada");
    var ed = U.edicaoDe(ctx, E0, null, null);
    /* mistura rápida: sem gradiente nem tempo transcritos */
    ctx.consulta("tr.nbr12216_floculacao_gradiente_e_mistura_rapida", null, "valor", "mistura rápida");
    R.aviso("aviso", "mistura rápida pendente: gradiente e tempo de mistura sem fonte na base", [], { texto: "transcrever da NBR 12216:1992 (convênio Confea) o item da mistura rápida" });
    un.push({ id: "mistura", nome: "Mistura rápida (coagulação)", tipo: "mistura_rapida", sistema: "agua_fria", status: "pendente", dims: null });
    var fl = floculador(e, Q, ctx, R, U, ed);
    un.push(fl.status === "ok"
      ? { alvos: ["floculador"], id: "floculador", nome: "Floculador", tipo: "floculador", sistema: "agua_fria", forma: "retangular", status: "ok",
          param: { Vazao_m3_dia: Q, TDH_dia: fl.T_min / U.MIN_POR_H / U.H_POR_DIA, Volume_extra_m3: 0, Profundidade_util: fl.h_m, Relacao_CL: fl.relacao, Largura_min: 0, Compartimentos: fl.camaras },
          dims: { comprimento_m: fl.comprimento_m, largura_m: fl.largura_m, profundidade_m: fl.h_m, volume_m3: fl.volumeReal_m3 } }
      : { id: "floculador", nome: "Floculador", tipo: "floculador", sistema: "agua_fria", status: "pendente", dims: null, volume_m3: fl.V_m3 != null ? U.r3(fl.V_m3) : null });
    var dc = decantador(e, Q, ctx, R, U, ed);
    if (dc.status === "ok") {
      for (var i = 0; i < dc.n; i++) un.push({ alvos: ["decantador"], id: "decantador" + (dc.n > 1 ? "-" + (i + 1) : ""), nome: "Decantador" + (dc.n > 1 ? " " + (i + 1) : ""), tipo: "decantador", sistema: "agua_fria", forma: "retangular", status: "ok",
        param: { Vazao_m3_dia: Q / dc.n, TDH_dia: dc.h_m / dc.taxa, Volume_extra_m3: 0, Profundidade_util: dc.h_m, Relacao_CL: dc.relacao, Largura_min: dc.larguraMin_m },
        dims: { comprimento_m: dc.comprimento_m, largura_m: dc.largura_m, profundidade_m: dc.h_m, volume_m3: dc.volumeReal_m3 } });
    } else un.push({ id: "decantador", nome: "Decantador", tipo: "decantador", sistema: "agua_fria", status: "pendente", dims: null, area_m2: dc.A_m2 != null ? U.r3(dc.A_m2) : null });
    var ft = filtros(e, Q, ctx, R, U, ed);
    if (ft.status === "ok") {
      for (var j = 0; j < ft.n; j++) un.push({ alvos: ["filtro"], id: "filtro-" + (j + 1), nome: "Filtro rápido " + (j + 1), tipo: "filtro_rapido", sistema: "agua_fria", forma: "retangular", status: "ok",
        param: { Vazao_m3_dia: Q / ft.n, TDH_dia: ft.hLeito_m / ft.taxa, Volume_extra_m3: 0, Profundidade_util: ft.hLeito_m, Relacao_CL: 1, Largura_min: 0 },
        dims: { comprimento_m: ft.comprimento_m, largura_m: ft.largura_m, profundidade_m: ft.hLeito_m } });
    } else un.push({ id: "filtro", nome: "Filtros", tipo: "filtro_rapido", sistema: "agua_fria", status: "pendente", dims: null });
    R.pend("tr.nbr12216_desinfeccao", "desinfecção: tempo de contato e concentração de cloro sem fonte na base", "desinfecção", "transcrever a exigência da 12216 / Portaria de potabilidade para o tanque de contato");
    un.push({ id: "contato", nome: "Tanque de contato (desinfecção)", tipo: "desinfeccao", sistema: "agua_fria", status: "pendente", dims: null });
    return R.fechar({ vazao_m3_dia: Q, floculador: fl, decantador: dc, filtros: ft, unidades: un });
  }

  var HidETA = { VERSAO: 1, calcular: calcular };
  global.HidETA = HidETA;
  if (typeof module !== "undefined" && module.exports) module.exports = HidETA;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
