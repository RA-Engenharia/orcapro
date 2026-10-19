/* =====================================================================
 * hidete.js — ESTAÇÃO DE TRATAMENTO DE ESGOTO (NBR 12209:2011) — motor
 * PURO, ES5, Node-testável. Fase 4 do plano docs/hidro/PLANO-HIDROSSANITARIO.md;
 * contrato em docs/hidro/CONTRATO-TRATAMENTO.md.
 *
 * Saída = LISTA DE UNIDADES com dimensões (as que têm fonte) e as que não
 * têm, declaradas como PENDENTES com a chave e o "corrigir":
 *   vazões média / máxima / mínima → tratamento preliminar (grade,
 *   desarenador) → UASB (TDH pela temperatura, velocidade ascendente, altura)
 *   → pós-tratamento → desinfecção.
 *
 * ⚠ A base só tem da 12209 a tabela do UASB (via slides da UFPR). Grade,
 *   desarenador, lodos ativados, decantador secundário, desinfecção e a
 *   profundidade do UASB NÃO têm fonte: saem pendentes — nunca com "valor
 *   típico". Os coeficientes K1/K2 vêm do manual de uma concessionária
 *   (Sanepar, programa.consumo_residencial_concessionaria) e o resultado diz
 *   isso; K3 (vazão mínima) não tem fonte na base.
 * ⚠ A altura do UASB SAI das duas exigências que têm fonte: volume = Qméd ×
 *   TDH e área ≥ Q / velocidade ascendente (média e máxima) → H = V / A. A
 *   verificação da profundidade fica pendente (sem faixa transcrita).
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
  function arr(a) { return Array.isArray(a) ? a : []; }

  var U0 = "tr.nbr12209_uasb";
  var C3 = 3;   /* hid:ok casas decimais na formatação */

  /* coeficiente K1 / K2: entrada (decisão do RT) → tabela da concessionária → pendente */
  function coeficiente(e, nome, re, ctx, R, U) {
    var v = num(e[nome], null);
    if (v != null) { R.premissa(nome, v, "entrada"); return v; }
    var ls = ctx.linhas("programa.consumo_residencial_concessionaria", null, "vazão máxima (" + nome + ")");
    if (ls) for (var i = 0; i < ls.length; i++) if (re.test(U.semAcento(ls[i].parametro))) {
      v = num(ls[i].valor, null);
      R.param(nome + " — " + ls[i].parametro, v, "-", "programa.consumo_residencial_concessionaria", "manual de concessionária (" + txt(N().fonte("programa.consumo_residencial_concessionaria").doc) + ") — conferir com a concessionária do local");
      return v;
    }
    ctx.pendencia("ete." + nome, nome + " sem fonte na base", "vazões da ETE");
    return null;
  }

  function vazoes(e, ctx, R, U) {
    var out = { status: "pendente", passos: [] }, P = num(e.populacao, null);
    if (P == null) { R.pend("entrada.populacao", "população atendida não informada", "vazões da ETE", "informar entrada.populacao (habitantes)"); return out; }
    out.P = P;
    R.premissa("população atendida", P + " hab", "entrada");
    var q = num(e.contribuicao_L_hab_dia, null);
    if (q != null) R.premissa("contribuição de esgoto por habitante", q + " L/hab.dia", "entrada");
    else {
      /* sem a contribuição do projeto: a Tabela 1 da 17076 pela ocupação (com aviso: é a tabela de PEQUENO porte) */
      var c = HT().calcular({ ocupacao: e.ocupacao, uso: e.uso || "residencial", padrao: e.padrao, populacao: P, ctx: N().contexto() }).contribuicao;
      if (c.status !== "ok") { R.pend("entrada.contribuicao_L_hab_dia", "contribuição de esgoto por habitante não informada nem achada pela ocupação", "vazões da ETE", "informar entrada.contribuicao_L_hab_dia (da concessionária ou medição)"); return out; }
      q = c.q;
      if (!e.ocupacao && !e.padrao) R.premissa("padrão da ocupação", c.ocupacao + " (não informado — maior contribuição, lado seguro)", "padrao_motor");
      ctx.consulta("tr.contribuicao_17076", { ocupacao: c.ocupacao }, "q_l_unidade_dia", "vazões da ETE");
      R.param("contribuição por habitante (" + c.ocupacao + ")", q, "L/hab.dia", "tr.contribuicao_17076", c.edicao);
      R.aviso("aviso", "contribuição por habitante da Tabela 1 da 17076 (" + U.fmt(q) + " L/hab.dia — tabela de PEQUENO porte) usada na ETE", [], { texto: "informar entrada.contribuicao_L_hab_dia (consumo per capita × coeficiente de retorno da concessionária)" });
    }
    out.q = q;
    var k1 = coeficiente(e, "k1", /\bk1\b/, ctx, R, U), k2 = coeficiente(e, "k2", /\bk2\b/, ctx, R, U), k3 = num(e.k3, null);
    var Qi = num(e.infiltracao_Ls, null);
    if (Qi == null) { R.pend("entrada.ete.infiltracao_Ls", "vazão de infiltração na rede não informada (sem taxa na base)", "vazões da ETE", "informar entrada.infiltracao_Ls (taxa de infiltração × extensão da rede; 0 só com a decisão do RT)"); Qi = 0; out.semInfiltracao = true; }
    else R.premissa("vazão de infiltração", Qi + " L/s", "entrada");
    var Qd = P * q / U.S_POR_DIA;
    out.Qmed_Ls = Qd + Qi;
    out.passos.push("Qméd = P·q/86400 + Qinf = " + P + " × " + U.fmt(q) + " / 86400 + " + U.fmt(Qi, C3) + " = " + U.fmt(out.Qmed_Ls, C3) + " L/s" + (out.semInfiltracao ? " (SEM infiltração — pendente)" : ""));
    if (k1 != null && k2 != null) {
      out.Qmax_Ls = k1 * k2 * Qd + Qi;
      out.passos.push("Qmáx = K1·K2·P·q/86400 + Qinf = " + U.fmt(k1) + " × " + U.fmt(k2) + " × " + U.fmt(Qd, C3) + " + " + U.fmt(Qi, C3) + " = " + U.fmt(out.Qmax_Ls, C3) + " L/s");
    }
    if (k3 != null) { R.premissa("k3", k3, "entrada"); out.Qmin_Ls = k3 * Qd + Qi; out.passos.push("Qmín = K3·P·q/86400 + Qinf = " + U.fmt(out.Qmin_Ls, C3) + " L/s"); }
    else R.pend("ete.k3", "coeficiente da vazão mínima (K3) sem fonte na base", "vazão mínima da ETE", "informar entrada.k3 (concessionária do local)");
    var dbo = num(e.dbo_g_hab_dia, null);
    if (dbo != null) { R.premissa("DBO per capita", dbo + " g/hab.dia", "entrada"); out.cargaDBO_kg_dia = P * dbo / 1000; out.passos.push("carga orgânica = P × DBO = " + P + " × " + U.fmt(dbo) + " g = " + U.fmt(out.cargaDBO_kg_dia) + " kg DBO/dia"); }
    else R.pend("entrada.ete.dbo_g_hab_dia", "DBO per capita não informada (sem tabela na base): carga orgânica não calculada", "carga orgânica", "informar entrada.dbo_g_hab_dia (literatura/concessionária)");
    out.status = out.Qmax_Ls != null ? "ok" : "pendente";
    return out;
  }

  function uasb(e, vz, ctx, R, U) {
    var out = { status: "pendente", passos: [] };
    if (vz.Qmed_Ls == null) return out;
    var ls = ctx.linhas(U0, null, "UASB");
    if (!ls) return out;
    var T = num(e.temperatura_C, null);
    if (T == null) { R.pend("entrada.ete.temperatura_C", "temperatura média do esgoto no mês mais frio não informada — sem ela não há TDH do UASB", "UASB", "informar entrada.temperatura_C (°C)"); return out; }
    /* TDH: a faixa de temperatura com o maior mínimo ≤ T (entre faixas, a mais fria — TDH maior, lado seguro) */
    var esc = null;
    ls.forEach(function (l) {
      if (!/^tdh para vazao media/.test(U.semAcento(l.parametro))) return;
      var f = U.faixa(l.condicao); if (!f) return;
      var cabe = f.incMin ? T >= f.min : T > f.min;
      if (cabe && (!esc || f.min > esc.f.min)) esc = { f: f, l: l };
    });
    if (!esc) { ctx.pendencia(U0 + "[" + T + " °C]", "TDH do UASB não tabelado para " + T + " °C (a tabela começa em " + "18 a 21 °C" + ")", "UASB"); return out; }
    var TDH_h = U.celula(esc.l.valor), vMed = null, vMax = null, lMed = null, lMax = null;
    ls.forEach(function (l) {
      var p = U.semAcento(l.parametro), c = U.semAcento(l.condicao);
      if (!/^velocidade ascendente no compartimento/.test(p)) return;
      if (/media/.test(c)) { vMed = U.celula(l.valor); lMed = l; }
      if (/maxima/.test(c)) { vMax = U.celula(l.valor); lMax = l; }
    });
    var ed = U.edicaoDe(ctx, U0, null, null) || "NBR 12209:2011 (via fonte secundária)";
    R.param("TDH do UASB (" + esc.l.condicao + ")", TDH_h, "h", U0, ed);
    if (vMed != null) R.param("velocidade ascendente máxima — vazão média", vMed, "m/h", U0, ed);
    if (vMax != null) R.param("velocidade ascendente máxima — vazão máxima", vMax, "m/h", U0, ed);
    var n = Math.max(1, Math.round(num(e.uasb && e.uasb.modulos, 1)));
    var QmH = vz.Qmed_Ls / 1000 * U.S_POR_H, QxH = vz.Qmax_Ls != null ? vz.Qmax_Ls / 1000 * U.S_POR_H : null;
    var V = QmH * TDH_h, A = Math.max(vMed ? QmH / vMed : 0, vMax && QxH != null ? QxH / vMax : 0);
    if (!(A > 0)) { ctx.pendencia(U0 + "[velocidade]", "velocidade ascendente não tabelada", "UASB"); return out; }
    var Hrt = num(e.uasb && e.uasb.altura_m, null);
    if (Hrt != null) {
      /* altura escolhida pelo RT: a área sai do volume e as velocidades ascendentes PODEM reprovar (com o corrigir) */
      R.premissa("altura útil do UASB", Hrt + " m (entrada)", "entrada");
      var Amin = A; A = V / Hrt;
      if (A < Amin - 1e-9) R.aviso("aviso", "altura do UASB de " + U.fmt(Hrt) + " m deixa a área (" + U.fmt(A, C3) + " m²) abaixo da exigida pela velocidade ascendente (" + U.fmt(Amin, C3) + " m²)", ["uasb"],   /* hid:ok tolerância */
                                   { texto: "reduzir a altura para ≤ " + U.fmt(V / Amin) + " m (ou retirar entrada.uasb.altura_m)" });
    }
    var H = V / A, Vu = V / n, Au = A / n;
    var W = U.teto2(Math.sqrt(Au)), L = U.teto2(Math.max(W, Au / W)), Hr = H;
    out.n = n; out.TDH_h = TDH_h; out.V_m3 = V; out.A_m2 = A; out.H_m = Hr; out.largura_m = W; out.comprimento_m = L;
    out.passos.push("V = Qméd × TDH = " + U.fmt(QmH, C3) + " m³/h × " + U.fmt(TDH_h) + " h = " + U.fmt(V, C3) + " m³");
    out.passos.push("A ≥ máx(Qméd/" + U.fmt(vMed) + "; Qmáx/" + U.fmt(vMax) + ") = máx(" + U.fmt(QmH / vMed, C3) + "; " + (QxH != null ? U.fmt(QxH / vMax, C3) : "—") + ") = " + U.fmt(A, C3) + " m²");
    out.passos.push("H = V/A = " + U.fmt(H, C3) + " m; " + n + " módulo(s) de " + U.fmt(L) + " × " + U.fmt(W) + " m em planta (quadrada: padrão do motor)");
    R.premissa("planta do UASB", "quadrada, " + n + " módulo(s) (geometria, não norma) — o RT ajusta em entrada.uasb", "padrao_motor");
    var Ar = L * W * n, vmR = QmH / Ar;
    R.verif("uasb", "TDH na vazão média ≥ mínimo", U.r2(L * W * n * Hr / QmH), TDH_h, "h", L * W * n * Hr / QmH >= TDH_h - 1e-6, out.passos.slice(), U0, ed, "min");   /* hid:ok tolerância */
    if (vMed != null) R.verif("uasb", "velocidade ascendente (vazão média)", U.r3(vmR), vMed, "m/h", vmR <= vMed + 1e-9, ["v = " + U.fmt(QmH, C3) + " / " + U.fmt(Ar, C3) + " = " + U.fmt(vmR, C3) + " m/h"], U0, ed);   /* hid:ok tolerância */
    if (vMax != null && QxH != null) { var vxR = QxH / Ar; R.verif("uasb", "velocidade ascendente (vazão máxima)", U.r3(vxR), vMax, "m/h", vxR <= vMax + 1e-9, ["v = " + U.fmt(QxH, C3) + " / " + U.fmt(Ar, C3) + " = " + U.fmt(vxR, C3) + " m/h"], U0, ed); }   /* hid:ok tolerância */
    /* profundidade: a F1 não achou a faixa — consulta a chave para a pendência levar o MOTIVO da F1 */
    var cp = ctx.consulta("tr.nbr12209_uasb_profundidade_e_picos", null, "valor", "profundidade do UASB");
    R.verif("uasb", "profundidade útil do UASB na faixa da norma", U.r2(Hr), null, "m", null, ["H = " + U.fmt(Hr) + " m; pendente: " + (cp.ok ? "" : cp.motivo)], null, "");
    if (vz.cargaDBO_kg_dia != null) out.passos.push("carga orgânica volumétrica = " + U.fmt(vz.cargaDBO_kg_dia) + " kg DBO/dia ÷ " + U.fmt(V, C3) + " m³ = " + U.fmt(vz.cargaDBO_kg_dia / V, C3) + " kg DBO/m³.dia (só informativo: o limite citado é de literatura)");
    out.status = "ok";
    return out;
  }

  function calcular(entrada) {
    var e = entrada || {}, H = N(), U = HT().util, R = U.novoRes("ete", e.ctx || H.contexto()), ctx = R.ctx;   /* contexto próprio (revisão J6) */
    var vz = vazoes(e, ctx, R, U);
    var un = [];
    /* preliminar: nenhum valor da 12209 transcrito */
    R.pend("tr.nbr12209_preliminar", "grade e desarenador: nenhuma tabela da 12209 transcrita (espaçamento, velocidade, taxa de escoamento superficial)", "tratamento preliminar",
           "transcrever da NBR 12209:2011 (convênio Confea) as tabelas da grade e do desarenador");
    un.push({ id: "preliminar", nome: "Tratamento preliminar (grade + desarenador + medidor)", tipo: "preliminar", sistema: "esgoto", status: "pendente", dims: null });
    var ua = uasb(e, vz, ctx, R, U);
    if (ua.status === "ok") {
      for (var i = 0; i < ua.n; i++) un.push({ alvos: ["uasb"], id: "uasb" + (ua.n > 1 ? "-" + (i + 1) : ""), nome: "Reator UASB" + (ua.n > 1 ? " " + (i + 1) : ""), tipo: "uasb", sistema: "esgoto", forma: "retangular", status: "ok",
        param: { Vazao_m3_dia: vz.Qmed_Ls / 1000 * U.S_POR_DIA / ua.n, TDH_dia: ua.TDH_h / U.H_POR_DIA, Volume_extra_m3: 0, Profundidade_util: ua.H_m, Relacao_CL: 1, Largura_min: 0 },
        dims: { comprimento_m: ua.comprimento_m, largura_m: ua.largura_m, profundidade_m: U.r3(ua.H_m), volume_m3: U.r3(ua.V_m3 / ua.n) } });
    } else un.push({ id: "uasb", nome: "Reator UASB", tipo: "uasb", sistema: "esgoto", status: "pendente", dims: null });
    var pos = txt(e.posTratamento || "lodos_ativados");
    ctx.consulta("tr.nbr12209_lodos_ativados_e_decantador_secundario", null, "valor", "pós-tratamento (" + pos + ")");
    R.aviso("aviso", "pós-tratamento (" + pos + ") pendente: sem taxa de aplicação, idade do lodo e A/M transcritas da 12209", [], { texto: "transcrever da NBR 12209:2011 a tabela do pós-tratamento escolhido, ou o RT adota o filtro anaeróbio do HidTrat como pós-tratamento" });
    un.push({ id: "pos", nome: "Pós-tratamento (" + pos.replace(/_/g, " ") + ")", tipo: "pos_tratamento", sistema: "esgoto", status: "pendente", dims: null });
    R.pend("tr.nbr12209_desinfeccao", "desinfecção: tempo de contato e dosagem sem fonte na base", "desinfecção", "transcrever a exigência da 12209 / do órgão ambiental para a desinfecção");
    un.push({ id: "desinfeccao", nome: "Desinfecção", tipo: "desinfeccao", sistema: "esgoto", status: "pendente", dims: null });
    return R.fechar({ vazoes: vz, uasb: ua, unidades: un });
  }

  var HidETE = { VERSAO: 1, calcular: calcular };
  global.HidETE = HidETE;
  if (typeof module !== "undefined" && module.exports) module.exports = HidETE;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
