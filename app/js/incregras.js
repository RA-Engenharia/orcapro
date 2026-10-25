/* =====================================================================
 * incregras.js — REGRAS DE INCÊNDIO (Minas Gerais) e de ACESSIBILIDADE, com o NÍVEL da fonte (21/10/2026). Motor PURO, ES5, Node-testável.
 *
 * De onde vêm os números: js/incdados.js (GERADO por tools/gerar-incdados.js a partir da pesquisa de 20/10/2026 — PDFs oficiais do CBMMG
 * e os exemplares da RA da NBR 9050:2020 / NBR 16537:2024). Este arquivo NÃO redigita tabela: lê a linha da tabela pelo nome do parâmetro
 * e, quando a fonte só dá texto ("1 pessoa por 7,0 m2"), o número sai do TEXTO — mudou a pesquisa, muda a regra.
 *
 * Em MG vale a IT do CBMMG (Decreto 47.998/2020 art. 5 §1: na falta da IT, a NBR). A NBR 9077 da biblioteca (1993/2001) está CANCELADA e
 * NÃO é usada; a vigente (2025) não foi lida (pendência). A NBR 10898 adotada pela IT 13 (Portaria 71/2023) é a de 2013, sem texto: os
 * valores de lux/autonomia vêm da 2023 em CÓPIA NÃO LICENCIADA (só valor e item; exemplarLicenciado:false) e saem marcados "conferir".
 *
 * NÍVEIS: A = lido no texto oficial (IT do CBMMG, decreto, NBR da biblioteca) · N = NBR 10898:2023 em cópia não licenciada (só valor e
 *         item; MG adota a 2013 — conferir) · C = critério RA (editável) · X = sem fonte (pendência, nunca "ok").
 *
 *   IncRegras.classificar(dados, modelo) → { divisao, grupo, altura, area, populacao, qfi, risco, nivel, pscip, isentaA1, exige{…}, pendencias[], premissas[] }
 *   IncRegras.populacao(divisao, ambiente) · capacidade(divisao) · larguraMinima(divisao) · portaVao(N) · distanciaMaxima(o) · saidas(divisao, H)
 *   IncRegras.extintor(risco, classe) · placaAreaMinima(L) · medida(divisao, H, nome) · ACS (os números da NBR 9050 / 16537)
 * Teste: node tools/test-inc-acs.js
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function DD() { return dep("IncDados", "./incdados.js"); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { var n = Number(v); return v != null && v !== "" && typeof v !== "boolean" && isFinite(n) ? n : d; }
  function txt(v) { return v == null ? "" : String(v); }
  function numBR(s) { var m = /(\d+(?:[.,]\d+)?)/.exec(txt(s)); return m ? Number(m[1].replace(".", "").replace(",", ".")) : NaN; }
  function numBRexato(s) { var t = txt(s).trim().replace(/\./g, "").replace(",", "."); var n = Number(t); return isFinite(n) ? n : NaN; }
  function f2(v) { return (Math.round(v * 100) / 100).toFixed(2).replace(".", ","); }

  var NIVEIS = {
    A: "lido no texto oficial (IT do CBMMG, decreto ou NBR da biblioteca)",
    N: "NBR 10898:2023 em cópia NÃO licenciada à RA (só valor e item; MG adota a edição 2013 pela Portaria 71/2023 — conferir)",
    C: "critério RA (editável)",
    X: "sem fonte — pendência (nunca vira \"atende\")"
  };
  function rotuloNivel(n) { return NIVEIS[String(n || "X").charAt(0)] || NIVEIS.X; }

  /* ---------------------------------------------------------------- acesso às tabelas da pesquisa */
  function tab(chave) { var D = DD(); var t = D && ((D.incendio.tabelas || {})[chave] || (D.hidro.tabelas || {})[chave] || (D.acessibilidade.tabelas || {})[chave]); if (!t) throw new Error("IncRegras: tabela " + chave + " ausente em js/incdados.js"); return t; }
  function fonteTxt(t, item) { var f = t.fonte || {}; return (f.doc || "") + (item ? ", " + item : (f.tabela ? ", " + f.tabela : "")) + (f.pagina ? " (" + f.pagina + ")" : ""); }
  function siglaDoc(t) { var d = txt((t.fonte || {}).doc); var m = /CBMMG (IT \d+)/.exec(d); if (m) return "CBMMG " + m[1]; m = /NBR (\d+(?::\d+)?)/.exec(d); if (m) return "NBR " + m[1]; return d.split(" - ")[0]; }
  /* a linha [parametro, valor, condicao, item] de uma tabela de parâmetros */
  function param(chave, nome) {
    var t = tab(chave), c = t.colunas || [], ip = c.indexOf("parametro"), iv = c.indexOf("valor"), ii = c.indexOf("item"), ic = c.indexOf("condicao");
    for (var i = 0; i < t.dados.length; i++) { var d = t.dados[i]; if (d[ip < 0 ? 0 : ip] === nome) return { valor: d[iv < 0 ? 1 : iv], item: ii >= 0 ? d[ii] : "", condicao: ic >= 0 ? d[ic] : "", fonte: siglaDoc(t) + (ii >= 0 && d[ii] ? " " + d[ii] : ""), t: t }; }
    throw new Error("IncRegras: parâmetro " + nome + " ausente em " + chave);
  }
  function V(chave, nome, nivel) { var p = param(chave, nome), v = typeof p.valor === "number" ? p.valor : numBR(p.valor); return { valor: v, texto: p.valor, item: p.item, fonte: p.fonte, nivel: nivel || "A" }; }

  /* ---------------------------------------------------------------- DIVISÕES (Decreto 47.998/2020, Anexo) */
  function divisoes() {
    return tab("in.it01.classificacao_ocupacao").dados.map(function (d) { return { divisao: d[1], grupo: d[1].charAt(0), grupoNome: d[0], descricao: d[2], exemplos: d[3] }; });
  }
  function divisaoValida(div) { return divisoes().some(function (d) { return d.divisao === div; }); }
  function grupoDe(div) { return txt(div).charAt(0).toUpperCase(); }
  /* expande "A-1, A-2" · "E-1 a E-4" · "-" (todo o grupo) · "D" · "C, D, E, F, G-3" em teste de pertinência */
  function casaDivisao(espec, div, grupo) {
    var s = txt(espec).trim(); if (!s || s === "-" || /^qualquer$/i.test(s)) return true;
    return s.split(/\s*,\s*/).some(function (p) {
      var m = /^([A-M])-(\d+)\s+a\s+([A-M])-(\d+)$/.exec(p);
      if (m) { var n = Number(txt(div).split("-")[1]); return grupoDe(div) === m[1] && n >= Number(m[2]) && n <= Number(m[4]); }
      if (/^[A-M]$/.test(p)) return grupoDe(div) === p;
      return p === div;
    });
  }

  /* ---------------------------------------------------------------- CARGA DE INCÊNDIO (IT 09 Tabela A.1) e RISCO (IT 16 Tabela 3) */
  function atividades(div) {
    var D = DD(); return arr(D && D.carga.A1).map(function (r, i) { return { i: i, descricao: r[0], divisao: r[1], qfi: r[2], pagina: r[3], metodo: r[4] }; }).filter(function (r) { return !div || r.divisao === div; });
  }
  function risco(qfi) {
    var t = tab("in.it16.classe_de_risco_carga_incendio"), q = num(qfi, NaN);
    if (!isFinite(q)) return null;
    for (var i = 0; i < t.dados.length; i++) { var d = t.dados[i]; if (q > d[1] - 1e-9 && (d[2] == null || q <= d[2] + 1e-9)) { if (i === 0 || q > d[1]) return { risco: d[0].toLowerCase().replace("é", "e"), rotulo: d[0], qfi: q, fonte: siglaDoc(t) + ", Tabela 3" }; } }
    return { risco: "baixo", rotulo: "Baixo", qfi: q, fonte: siglaDoc(t) + ", Tabela 3" };
  }
  /* EXTINTOR: capacidade mínima e distância máxima a percorrer (IT 16 Tabelas 4 a 6). classe "A" | "B" | "C" | "D" | "K" */
  function extintor(rk, classe) {
    classe = (classe || "A").toUpperCase();
    if (classe === "C" || classe === "D" || classe === "K") {
      var t6 = tab("in.it16.classes_C_D_K_distancia"), l6 = t6.dados.filter(function (d) { return d[0] === classe; })[0];
      return { classe: classe, distancia: l6[1], capacidade: null, fonte: siglaDoc(t6) + ", Tabela 6", obs: l6[2], nivel: "A" };
    }
    var t = tab(classe === "B" ? "in.it16.classe_B_unidade_e_distancia" : "in.it16.classe_A_unidade_e_distancia");
    var rot = { baixo: "Baixo", medio: "Médio", alto: "Alto" }[rk || "baixo"] || "Baixo";
    var L = t.dados.filter(function (d) { return d[0] === rot; });
    /* risco alto tem duas alternativas: a de MENOR distância com a capacidade menor e a outra (o motor usa a primeira — lado seguro) */
    return { classe: classe, risco: rot, capacidade: L[0][1], distancia: L[0][2], alternativas: L.map(function (d) { return { capacidade: d[1], distancia: d[2] }; }), fonte: siglaDoc(t) + ", Tabela " + (classe === "B" ? 5 : 4), nivel: "A" };
  }
  function capacidadeMinimaABC() { var t = tab("in.it16.capacidade_extintora_minima"); return t.dados.filter(function (d) { return d[0] === "portatil" && d[1] === "Pó ABC"; })[0][2]; }

  /* ---------------------------------------------------------------- NÍVEL DE RISCO (IT 01 Anexo C) e TIPO DE PSCIP (IT 01 5.4) */
  function nivelRisco(o) {
    var t = tab("in.it01.nivel_de_risco"), lim = t.dados.map(function (d) { return d[0]; }), motivos = [], nv = "I";
    var a1 = numBRexato((/<=\s*([\d.,]+)\s*m2/.exec(lim[0]) || [])[1]), a2 = numBRexato((/<=\s*([\d.,]+)\s*m2/.exec(lim[1]) || [])[1]), h3 = numBRexato((/superior a\s*([\d.,]+)\s*m/.exec(lim[4]) || [])[1]), pop3 = numBRexato((/superior a\s*([\d.,]+)\s*pessoas/.exec(lim[5]) || [])[1]);
    function sobe(n, m) { var ord = { I: 1, II: 2, III: 3 }; if (ord[n] > ord[nv]) nv = n; motivos.push(m); }
    if (o.area > a1 + 1e-9 && o.area <= a2 + 1e-9) sobe("II", "área " + f2(o.area) + " m² entre " + a1 + " e " + a2 + " m²");
    if (o.area > a2 + 1e-9) sobe("III", "área " + f2(o.area) + " m² > " + a2 + " m²");
    if (o.altura > h3 + 1e-9) sobe("III", "altura " + f2(o.altura) + " m > " + h3 + " m");
    if (o.populacao > pop3 + 1e-9) sobe("III", "lotação " + Math.round(o.populacao) + " > " + pop3 + " pessoas");
    if (o.subsoloComUso) sobe("III", "subsolo com uso distinto de estacionamento");
    if (o.patrimonio) sobe("III", "patrimônio histórico cultural");
    if (!motivos.length) motivos.push("área " + f2(o.area) + " m² ≤ " + a1 + " m²");
    return { nivel: nv, motivos: motivos, fonte: siglaDoc(t) + " Anexo C, Tabela C.1 (v10.5)", naoAvaliado: "líquido inflamável > 1.000 L, GLP > 190 kg e CNAE da Tabela C.2 (não transcrita): informe se houver" };
  }
  function pscip(o, nv) {
    var t = tab("in.it01.tipos_pscip"), g = t.dados[0][2], motivos = [];
    var h = numBRexato((/altura >\s*([\d.,]+)\s*m/.exec(g) || [])[1]), ar = numBRexato((/área total >\s*([\d.,]+)\s*m2 se exclusivamente residencial/.exec(g) || [])[1]), ad = numBRexato((/área total >\s*([\d.,]+)\s*m2 nas demais/.exec(g) || [])[1]), pf = numBRexato((/população >\s*([\d.,]+)\s*pessoas/.exec(g) || [])[1]);
    if (o.altura > h + 1e-9) motivos.push("altura > " + h + " m");
    if (o.residencial && o.area > ar + 1e-9) motivos.push("área residencial > " + f2(ar) + " m²");
    if (!o.residencial && o.divisao !== "M-8" && o.area > ad + 1e-9) motivos.push("área > " + ad + " m²");
    if (o.hidraulico) motivos.push("há projeto de sistema hidráulico (hidrantes/chuveiros)");
    if (o.grupo === "F" && o.populacao > pf + 1e-9) motivos.push("Grupo F com população > " + pf);
    var fonte = siglaDoc(t) + " 5.2 a 5.4 e Anexo D";
    if (motivos.length) return { tipo: "PT", nome: t.dados[0][0], documento: t.dados[0][5], motivos: motivos, fonte: fonte };
    if (nv.nivel === "III") return { tipo: "PTS", nome: t.dados[1][0], documento: t.dados[1][5], motivos: nv.motivos, fonte: fonte };
    if (nv.nivel === "II") return { tipo: "PTD", nome: t.dados[2][0], documento: t.dados[2][5], motivos: nv.motivos, fonte: fonte, provisorio: t.dados[4][5] };
    return { tipo: "I", nome: t.dados[3][0], documento: t.dados[3][5], motivos: nv.motivos, fonte: fonte, obs: t.dados[3][6] };
  }

  /* ---------------------------------------------------------------- MEDIDA EXIGIDA (IT 01 Anexo A): "X", "X(5)", "-" */
  function faixaH(H) { return H <= 12 + 1e-9 ? 0 : H <= 30 + 1e-9 ? 1 : H <= 54 + 1e-9 ? 2 : 3; }
  function medida(div, H, nome) {
    var t = tab("in.it01.exigencias_demais_medidas");
    if (div === "A-1") return { exige: false, celula: "isenta", nota: "residência unifamiliar (A-1) isenta de medidas — IT 01 A.4.1", fonte: "CBMMG IT 01 A.4.1" };
    var linha = t.dados.filter(function (d) { return arr(d.divisoes).indexOf(div) >= 0; })[0];
    if (!linha) {
      var nt = arr(t.naoTranscritas).filter(function (x) { return casaDivisao(txt(x.grupo).split(" (")[0].replace(/\s+e\s+/g, ", "), div); })[0];
      return { exige: true, pendente: true, celula: "?", nota: "tabela " + (nt ? nt.tabela : "do Anexo A") + " da IT 01 não transcrita para " + div + ": exigida pelo lado seguro (IT 01 D.3.1: extintores, iluminação, sinalização e saídas valem em todo nível) — conferir", fonte: "CBMMG IT 01 Anexo A (não transcrita)" };
    }
    var cel = arr((linha.medidas || {})[nome])[faixaH(H)];
    if (cel == null) return { exige: false, celula: "-", nota: "medida não listada na " + linha.tabelaIT01, fonte: "CBMMG IT 01 Anexo A, " + linha.tabelaIT01 };
    var chaves = txt(cel).match(/\(\d+\)/g) || [], notas = chaves.map(function (k) { return k + " " + txt((linha.notas || {})[k]); });
    var fonte = "CBMMG IT 01 Anexo A, " + linha.tabelaIT01 + " (v10.5)";
    if (!/^X/.test(txt(cel))) return { exige: false, celula: cel, nota: notas.join(" · "), fonte: fonte };
    /* a NOTA da célula ("Exigido quando a área total for superior a 930 m2", "população superior a 200") resolvida com a área / população;
       o que a nota condiciona e não dá para ler (C-3 com F-5, salões de festa…) fica EXIGIDA e marcada "conferir" */
    var ctx = arguments[3] || {}; ctx = { area: ctx.area, populacao: ctx.populacao, ate2005: ctx.ate2005, divisao: div };
    var res = chaves.map(function (k) { return resolverNota(txt((linha.notas || {})[k]), ctx); }).filter(function (r) { return r !== "neutra"; });
    if (res.length && res.every(function (r) { return r === false; })) return { exige: false, celula: cel, nota: notas.join(" · "), resolvida: true, fonte: fonte };
    return { exige: true, celula: cel, nota: notas.join(" · "), conferir: res.length > 0 && !res.some(function (r) { return r === true; }), fonte: fonte };
  }
  /* true = a condição da nota vale · false = não vale · null = não sei ler (fica exigida) */
  function resolverNota(s, ctx) {
    var t = txt(s), m, A = num(ctx.area, NaN), P = num(ctx.populacao, NaN);
    /* nota que diz COMO (substituição, onde pôr o detector), não SE: não condiciona a exigência */
    if (/^\s*(Pode ser substitu|Detectores também|Acionadores manuais|Isentos os motéis|Armazenamento no salão)/i.test(t)) return "neutra";
    if ((m = /^\s*Somente\s+([A-M]-\d+)/i.exec(t))) return ctx.divisao === m[1].toUpperCase() ? null : false;
    if (/Somente|sal[õo]es|audit[óo]rios|condom/i.test(t)) return null;
    if ((m = /(?:área total(?: do Grupo [A-Z])?(?: for)?\s*(?:superior a|>)\s*)([\d.]+(?:,\d+)?)\s*m2/i.exec(t)) && isFinite(A)) {
      var lim = numBRexato(m[1]); if (ctx.ate2005 && (m = /até 01\/07\/2005[^>]*>\s*([\d.]+)/.exec(t))) lim = numBRexato(m[1]);
      return A > lim + 1e-9;
    }
    if ((m = /popula[çc][ãa]o\s*(?:superior a|>)\s*([\d.]+)/i.exec(t)) && isFinite(P)) return P > numBRexato(m[1]) + 1e-9;
    return null;
  }

  /* ---------------------------------------------------------------- POPULAÇÃO e UNIDADE DE PASSAGEM (IT 08 Tabela 4, 5.4) */
  function linhaPopulacao(div) {
    var t = tab("in.it08.populacao_e_unidade_passagem"), g = grupoDe(div);
    return t.dados.filter(function (d) { return d[0] === g && casaDivisao(d[1], div, g); })[0] || null;
  }
  /* a regra de população lida do texto: { tipo: "area", m2: 7 } | { tipo: "dormitorio", porDorm: 2 } | { tipo: "rt" } (o RT informa) */
  function regraPopulacao(div) {
    var l = linhaPopulacao(div); if (!l) return { tipo: "rt", texto: "divisão fora da Tabela 4", fonte: "CBMMG IT 08 Tabela 4" };
    var s = txt(l[2]), m, out;
    if ((m = /(\d+(?:,\d+)?)\s*pessoas?\s+por\s+dormit/i.exec(s))) out = { tipo: "dormitorio", porDorm: numBRexato(m[1]) };
    else if ((m = /^\s*2 pessoas por m2/i.exec(s))) out = { tipo: "area", m2: 0.5 };
    else if ((m = /1\s*pessoa\s+por\s+m2/i.exec(s))) out = { tipo: "area", m2: 1 };
    else if ((m = /1\s*pessoa\s+por\s+(\d+(?:,\d+)?)\s*m2/i.exec(s))) out = { tipo: "area", m2: numBRexato(m[1]) };
    else if (/vagas/i.test(s)) out = { tipo: "vagas", vagasPorPessoa: numBRexato((/por\s+(\d+)\s+vagas/i.exec(s) || [])[1]) };
    else out = { tipo: "rt" };
    out.texto = s; out.fonte = "CBMMG IT 08 Tabela 4 (" + l[0] + (l[1] !== "-" ? " " + l[1] : "") + ")"; out.notas = l[6];
    return out;
  }
  /* população de um ambiente. a = { tipoId (EsqRegras), area, nome }. Exclui sanitário, escada e circulação (IT 08 nota E, 5.3.4) */
  var SEM_POP = { banheiro: 1, lavabo: 1, circulacao: 1, escada: 1, tecnico: 1, poco: 1 };
  function populacao(div, a) {
    var R = regraPopulacao(div);
    if (SEM_POP[a.tipoId]) return { p: 0, regra: "não conta (sanitário, escada ou circulação — IT 08 nota E/5.3.4)", fonte: R.fonte };
    if (R.tipo === "area") return { p: a.area / R.m2, regra: "1 pessoa por " + f2(R.m2) + " m²", fonte: R.fonte };
    if (R.tipo === "dormitorio") return { p: (a.tipoId === "dormitorio" || a.tipoId === "suite") ? R.porDorm : 0, regra: R.porDorm + " pessoas por dormitório", fonte: R.fonte };
    return { p: null, regra: "população informada pelo RT (" + R.texto + ")", fonte: R.fonte, pendente: true };
  }
  function capacidade(div) {
    var l = linhaPopulacao(div); if (!l) return null;
    function n(v) { return typeof v === "number" ? v : null; }
    return { acessos: n(l[3]), escadas: n(l[4]), portas: n(l[5]), fonte: "CBMMG IT 08 Tabela 4 (C)" };
  }
  function UP() { return { valor: 0.55, fonte: "CBMMG IT 08 5.4.1 (unidade de passagem 0,55 m; N = P/C)", nivel: "A" }; }
  function larguraMinima(div) {
    var g = /^H-(2|3)$/.test(div);
    var p = V("in.it08.larguras_e_portas", g ? "largura_minima_H2_H3_escadas_acessos_descarga" : "largura_minima_saidas");
    return p;
  }
  function larguraRestrita() { return V("in.it08.larguras_e_portas", "corredor_acesso_restrito"); }
  /* N = P/C arredondado para cima (IT 08 5.4.1); largura = N × 0,55, nunca menos que a mínima */
  function unidades(P, C) { return C > 0 ? Math.ceil(P / C - 1e-9) : null; }
  function portaVao(N) {
    var nomes = ["porta_vao_N<=1", "porta_vao_1<N<=2", "porta_vao_2<N<=3", "porta_vao_3<N<=4"], k = Math.max(1, Math.min(4, N || 1)) - 1;
    var p = V("in.it08.larguras_e_portas", nomes[k]);
    if (N > 4) { p = { valor: N * UP().valor, fonte: "CBMMG IT 08 5.4.1 (N × 0,55; acima de 4 UP pela conta)", nivel: "A", item: "5.4.1" }; }
    return p;
  }
  function duasFolhasAcima() { return V("in.it08.larguras_e_portas", "porta_duas_folhas_acima_de"); }
  function distanciaEntreSaidas() { return V("in.it08.larguras_e_portas", "distancia_minima_entre_saidas"); }

  /* ---------------------------------------------------------------- DISTÂNCIA MÁXIMA (IT 08 Tabela 5) */
  /* o = { tipo: "X"|"Y"|"Z", divisao, terreo: bool, varias: bool (mais de uma saída), chuveiros: bool, deteccao: bool } */
  function distanciaMaxima(o) {
    var t = tab("in.it08.distancias_maximas_caminhamento"), tp = o.tipo || "X";
    var col = (o.chuveiros ? "com_chuv_" : "sem_chuv_") + (o.varias ? "mais_de_uma_" : "saida_unica_") + (o.deteccao ? "com_det" : "sem_det"), ic = t.colunas.indexOf(col);
    var linhas = t.dados.filter(function (d) { return d[0] === tp && (/^t[ée]rreo/i.test(d[2]) === !!o.terreo) && casaDivisao(d[1], o.divisao || "", grupoDe(o.divisao)); });
    var l = linhas[0];
    if (!l || ic < 0) return null;
    return { valor: l[ic], tipo: tp, linha: l[2], coluna: col.replace(/_/g, " "), fonte: siglaDoc(t) + " Tabela 5", nivel: "A",
      regras: arr(t.regras) };
  }
  /* tipo da edificação pela Tabela 3 (X / Y / Z): o RT informa TRRF e compartimentação vertical; térrea é no mínimo Y */
  function tipoEdificacao(dados, terrea) {
    var trrf = !!(dados && dados.trrf), comp = !!(dados && dados.compartimentacaoVertical);
    /* nota b da Tabela 3: na térrea a compartimentação vertical "não é aplicável" — conta como presente (por isso "no mínimo Y"); com o
       TRRF a térrea é Z (revisão 21/10/2026: antes ficava Y e a Tabela 5 dava 20 m a menos — erro falso de caminhamento) */
    if (terrea) comp = true;
    var t = trrf && comp ? "Z" : (trrf || comp) ? "Y" : "X";
    return { tipo: t, fonte: "CBMMG IT 08 Tabela 3" + (terrea ? " (térrea: compartimentação vertical não aplicável, nota b — no mínimo Y; com TRRF, Z)" : ""), informado: !!(dados && (dados.trrf != null || dados.compartimentacaoVertical != null)) };
  }

  /* ---------------------------------------------------------------- NÚMERO DE SAÍDAS e TIPO DE ESCADA (IT 08 Tabela 6) */
  function saidas(div, H) {
    var t = tab("in.it08.numero_saidas_tipo_escada"), g = grupoDe(div);
    var l = t.dados.filter(function (d) { return d.divisao === div; })[0] || t.dados.filter(function (d) { return d.divisao === g; })[0];
    if (!l) return { pendente: true, motivo: div === "A-1" ? "A-1 isenta" : "divisão " + div + " fora da Tabela 6", fonte: siglaDoc(t) + " Tabela 6" };
    if (H > 30 + 1e-9) return { pendente: true, motivo: "Tabela 6 transcrita só até 30 m de altura", fonte: siglaDoc(t) + " Tabela 6" };
    var c = H <= 12 + 1e-9 ? l["H<=12"] : l["12<H<=30"];
    if (!c || typeof c[0] !== "number") return { pendente: true, motivo: "célula \"" + (c ? c.join(" ") : "?") + "\" da Tabela 6 (norma específica)", fonte: siglaDoc(t) + " Tabela 6" };
    var notaF = txt((t.notas || {}).F), semMin = /F-6|H-2|H-3/.test(div) ? false : true;
    return { n: c[0], escada: c[1], fonte: siglaDoc(t) + " Tabela 6", notaF: notaF, dispensavelAte36: semMin, nivel: "A" };
  }

  /* ---------------------------------------------------------------- ILUMINAÇÃO (IT 13 + NBR 10898:2023 não licenciada) */
  var ILUM = {
    distancia: function () { return V("in.it13.iluminacao_emergencia", "distancia_maxima_pontos_aclaramento"); },
    tensao: function () { return V("in.it13.iluminacao_emergencia", "tensao_maxima_luminaria_baixa"); },
    alturaTensao: { valor: 2.5, fonte: "CBMMG IT 13 5.5 (luminária a menos de 2,5 m: até 30 V)", nivel: "A" },
    /* NBR 10898:2023 — cópia NÃO licenciada à RA: só os valores, com o item. MG adota a edição de 2013 (IT 13, Portaria 71/2023): conferir. */
    nbr10898: {
      norma: "ABNT NBR 10898:2023", exemplarLicenciado: false, adotadaEmMG: "NBR 10898:2013 (Portaria 71/2023) — texto não disponível",
      autonomiaMin_h: { valor: 2, item: "4.9", nivel: "N" },
      iluminanciaPlano_lx: { valor: 3, item: "5.1.2 (aclaramento)", nivel: "N" },
      iluminanciaEscadaDesnivel_lx: { valor: 5, item: "5.1.2.1 (escadas, mudança de nível, primeiros socorros, equipamentos de combate)", nivel: "N" },
      balizamentoMax_m: { valor: 15, item: "14.18", nivel: "N" },
      fluxoBlocoMin_lm: { valor: 300, item: "6.1.2.4 (menor só com estudo luminotécnico, Anexo A)", nivel: "N" },
      comutacaoMax_s: { valor: 2, item: "6.2 b)", nivel: "N" },
      portaDeSaida: { item: "5.1.2 a) (luminária junto de cada porta de saída)", nivel: "N" }
    },
    isencao: function () { var t = tab("in.it01.isencoes_gerais"), d = t.dados.filter(function (x) { return x[0] === "iluminacao_isencao"; })[0]; var s = d[1];
      return { area: numBRexato((/<=\s*([\d.,]+)\s*m2/.exec(s) || [])[1]), pessoas: numBRexato((/<\s*([\d.,]+)\s*pessoas/.exec(s) || [])[1]), texto: s, fonte: "CBMMG IT 01 " + d[2] }; }
  };
  /* ---------------------------------------------------------------- SINALIZAÇÃO (IT 15) */
  function sinal(tipo, frag) { var t = tab("in.it15.posicionamento"); var d = t.dados.filter(function (x) { return x[0] === tipo && (!frag || txt(x[1]).indexOf(frag) >= 0); })[0]; if (!d) throw new Error("IT 15 sem " + tipo); return { valor: d[2], texto: d[1], item: d[3], fonte: "CBMMG IT 15 " + d[3], nivel: "A" }; }
  var SIN = {
    baseSaida: function () { return sinal("saída (porta)"); },
    orientacao: function () { return sinal("orientação das rotas"); },
    limiteVisivel: function () { return sinal("orientação", "mudança de direção"); },
    altura: function () { return sinal("orientação", "altura da base"); },
    equipamento: function () { return sinal("equipamentos (extintor/hidrante/alarme)"); },
    isencao: function () { return sinal("isenção da sinalização de orientação"); },
    piso: function () { return sinal("equipamentos em garagem, fabricação, depósito, movimentação de mercadorias, grande varejo"); }
  };
  /* IT 15 Anexo A: área mínima da placa A ≥ L² / 2000 (L = distância de leitura, mínimo 4 m) — conferida contra a Tabela 1 (círculo, triângulo e quadrado) */
  function placaLmin() { var t = tab("in.it15.dimensoes_placas"); return t.dados[0][0]; }
  function placaAreaMinima(L) { var Lm = Math.max(placaLmin(), num(L, 0)); return { area: Lm * Lm / 2000, L: Lm, fonte: "CBMMG IT 15 Anexo A (A ≥ L²/2000, L mínimo " + placaLmin() + " m)", nivel: "A" }; }

  /* ---------------------------------------------------------------- EXTINTOR: posição (IT 16) */
  var EXT = {
    alca: function () { return V("in.it16.parametros_de_lancamento", "alca_altura_maxima"); },
    base: function () { return V("in.it16.parametros_de_lancamento", "base_altura_minima_parede"); },
    entrada: function () { return V("in.it16.parametros_de_lancamento", "entrada_distancia_maxima"); },
    riscoEspecial: function () { return V("in.it16.parametros_de_lancamento", "risco_especial_unidade_geral_ate"); }
  };

  /* ---------------------------------------------------------------- ESCADAS, RAMPAS, GUARDAS (IT 08) */
  var ESC = {
    espelho: function () { var p = param("in.it08.escadas_rampas_guardas", "degrau_altura_h"), m = /([\d,]+)\s*a\s*([\d,]+)\s*cm.*?([\d,]+)\s*cm/.exec(p.valor); return { min: numBRexato(m[1]) / 100, max: numBRexato(m[2]) / 100, tol: numBRexato(m[3]) / 100, fonte: p.fonte, nivel: "A" }; },
    blondel: function () { var p = param("in.it08.escadas_rampas_guardas", "blondel"), m = /([\d,]+)\s*cm\s*<=.*<=\s*([\d,]+)\s*cm/.exec(p.valor); return { min: numBRexato(m[1]) / 100, max: numBRexato(m[2]) / 100, fonte: p.fonte, nivel: "A" }; },
    lancoMax: function () { var p = param("in.it08.escadas_rampas_guardas", "lanco_maximo_altura"); return { valor: numBR(p.valor), fonte: p.fonte, nivel: "A" }; },
    guarda: function () { var p = param("in.it08.escadas_rampas_guardas", "guarda_corpo_altura"), m = (txt(p.valor).match(/\d+,\d+(?=\s*m\b)/g) || []).map(numBRexato); return { geral: m[0], escadaInterna: m[1], externa: m[2], fonte: p.fonte, nivel: "A" }; },
    guardaDesnivel: function () { var p = param("in.it08.escadas_rampas_guardas", "guarda_exigida_desnivel"); return { valor: numBR(p.valor) / 100, fonte: p.fonte, nivel: "A" }; },
    corrimao: function () { var p = param("in.it08.escadas_rampas_guardas", "corrimao_altura"), m = /([\d,]+)\s*a\s*([\d,]+)\s*m/.exec(p.valor); return { min: numBRexato(m[1]), max: numBRexato(m[2]), fonte: p.fonte, nivel: "A" }; },
    rampaInterna: function () { var p = param("in.it08.escadas_rampas_guardas", "rampa_declividade_interna"); return { texto: p.valor, fonte: p.fonte, nivel: "A" }; },
    rampaPatamar: function () { var p = param("in.it08.escadas_rampas_guardas", "rampa_patamar"); return { valor: numBR(p.valor), fonte: p.fonte, nivel: "A" }; }
  };
  /* declividade máxima da rampa de saída pelo grupo (IT 08 5.6.3.2): "10% em A, B, E, F, H; 12,5% descendo em D e G (10% subindo); 12,5% em C, I, J" */
  function rampaMaxima(div, externa) {
    if (externa) return { valor: 10, fonte: param("in.it08.escadas_rampas_guardas", "rampa_declividade_externa").fonte, nivel: "A" };
    var s = ESC.rampaInterna().texto, g = grupoDe(div), m10 = /10%\s*em\s*([A-M ,]+);/.exec(s), m125 = /12,5%\s*em\s*([A-M ,]+)$/.exec(s);
    var em10 = m10 ? m10[1].split(/\s*,\s*/) : [], em125 = m125 ? m125[1].split(/\s*,\s*/) : [];
    var v = em125.indexOf(g) >= 0 ? 12.5 : 10;   /* D e G: 10 % subindo (o lado seguro sem saber o sentido) */
    if (em10.indexOf(g) < 0 && em125.indexOf(g) < 0 && !/D e G/.test(s)) v = 10;
    return { valor: v, fonte: ESC.rampaInterna().fonte, nivel: "A" };
  }

  /* ---------------------------------------------------------------- CLASSIFICAR A EDIFICAÇÃO */
  /* dados (Dados da edificação, a tela): { divisao, atividade (índice da IT 09), qfi, altura, area, populacao, trrf, compartimentacaoVertical,
       chuveiros, deteccao, brigada, hidraulico, subsoloComUso, patrimonio, ate2005, acessivel } — o que faltar vira PENDÊNCIA
     modelo: { altura, area, terrea, pavimentos, populacao, populacaoPend } (medidos no modelo) */
  function classificar(dados, modelo) {
    dados = dados || {}; modelo = modelo || {};
    var pend = [], prem = [], div = txt(dados.divisao).trim().toUpperCase();
    if (!div || !divisaoValida(div)) { pend.push({ codigo: "INC_OCUPACAO_AUSENTE", texto: "Divisão de ocupação não informada (Decreto 47.998/2020, Anexo): sem ela não há tabela de exigências.", fonte: "CBMMG IT 01 E.2; Decreto 47.998/2020 Anexo" }); div = ""; }
    var H = num(dados.altura, NaN), hF = "informada";
    if (!isFinite(H)) { H = num(modelo.altura, NaN); hF = "medida no modelo (piso do último pavimento − saída no nível de descarga, IT 01 E.4)"; }
    if (!isFinite(H)) { H = 0; hF = "sem pavimento: 0 (térrea) — conferir"; pend.push({ codigo: "INC_ALTURA_AREA_AUSENTE", texto: "Altura da edificação não informada nem medida.", fonte: "CBMMG IT 01 E.4" }); }
    var A = num(dados.area, NaN), aF = "informada";
    if (!isFinite(A)) { A = num(modelo.area, NaN); aF = modelo.areaParedes != null ? "medida no modelo: ambientes + projeção das paredes (estimativa da área construída, IT 01 E.5 — conferir)" : "soma das áreas dos ambientes do modelo (IT 01 E.5 pede a área total construída + uso coletivo — conferir)"; }
    if (!isFinite(A) || A <= 0) { A = 0; pend.push({ codigo: "INC_ALTURA_AREA_AUSENTE", texto: "Área total não informada nem medida.", fonte: "CBMMG IT 01 E.5" }); }
    prem.push({ item: "altura", valor: H, origem: hF }); prem.push({ item: "área total", valor: A, origem: aF });
    var P = num(dados.populacao, NaN), pF = "informada pelo RT";
    if (!isFinite(P)) { P = num(modelo.populacao, NaN); pF = "IT 08 Tabela 4 pelos ambientes do modelo"; }
    if (isFinite(P)) prem.push({ item: "população", valor: Math.ceil(P - 1e-9), origem: pF });
    /* carga de incêndio: a atividade escolhida (IT 09 A.1) ou o qfi informado */
    var qfi = num(dados.qfi, NaN), qF = "informada", cargaAss = null;
    if (!isFinite(qfi) && dados.atividade != null) { var at = atividades()[num(dados.atividade, -1)]; if (at && at.qfi != null) { qfi = at.qfi; qF = "IT 09 Tabela A.1: " + at.descricao + " (" + at.divisao + ", PDF p." + at.pagina + ")"; } }
    if (!isFinite(qfi) && div && div !== "A-1") { var ats = atividades(div).filter(function (r) { return r.qfi != null; }); if (ats.length) { var mx = ats.reduce(function (m, r) { return r.qfi > m.qfi ? r : m; }, ats[0]); qfi = mx.qfi; cargaAss = { i: mx.i, descricao: mx.descricao, qfi: mx.qfi }; qF = "sem atividade escolhida: a MAIOR carga da divisão " + div + " na IT 09 A.1 (" + mx.descricao + ") — lado seguro, escolha a atividade"; pend.push({ codigo: "INC_CARGA_ASSUMIDA", texto: "Atividade (IT 09) não escolhida: usada a maior carga de incêndio da divisão " + div + " (" + qfi + " MJ/m², " + mx.descricao + ").", fonte: "CBMMG IT 09 Tabela A.1" }); } }
    var rk = isFinite(qfi) ? risco(qfi) : null;
    if (!rk) { rk = { risco: "alto", rotulo: "Alto", qfi: null, fonte: "sem carga de incêndio: risco ALTO (lado seguro)" }; if (div && div !== "A-1") pend.push({ codigo: "INC_CARGA_AUSENTE", texto: "Carga de incêndio não determinada: risco alto assumido.", fonte: "CBMMG IT 09; IT 16 Tabela 3" }); }
    var g = grupoDe(div), nv = nivelRisco({ area: A, altura: H, populacao: isFinite(P) ? P : 0, subsoloComUso: !!dados.subsoloComUso, patrimonio: !!dados.patrimonio });
    var ps = pscip({ altura: H, area: A, residencial: g === "A", hidraulico: !!dados.hidraulico, grupo: g, populacao: isFinite(P) ? P : 0, divisao: div }, nv);
    var isentaA1 = div === "A-1";
    var ex = {};
    ["Saídas de Emergência", "Iluminação de Emergência", "Sinalização de Emergência", "Extintores"].forEach(function (k) { ex[k] = div ? medida(div, H, k, { area: A, populacao: isFinite(P) ? P : NaN, ate2005: !!dados.ate2005 }) : { exige: true, pendente: true, celula: "?", nota: "sem a divisão: exigida pelo lado seguro", fonte: "CBMMG IT 01 D.3.1" }; });
    /* isenção da iluminação (IT 01 A.4.5): térrea ≤ 200 m² E < 50 pessoas */
    var ise = ILUM.isencao(), ilumIsenta = !!modelo.terrea && A <= ise.area + 1e-9 && isFinite(P) && P < ise.pessoas;
    return { divisao: div, grupo: g, descricao: div ? (divisoes().filter(function (d) { return d.divisao === div; })[0] || {}).descricao : "", altura: H, area: A, populacao: isFinite(P) ? P : null,
      qfi: isFinite(qfi) ? qfi : null, qfiFonte: qF, cargaAssumida: cargaAss, risco: rk, nivel: nv, pscip: ps, isentaA1: isentaA1, terrea: !!modelo.terrea,
      exige: { saidas: ex["Saídas de Emergência"], iluminacao: ex["Iluminação de Emergência"], sinalizacao: ex["Sinalização de Emergência"], extintores: ex["Extintores"] },
      iluminacaoIsenta: ilumIsenta ? { texto: ise.texto, fonte: ise.fonte } : null,
      tipo: tipoEdificacao(dados, !!modelo.terrea), chuveiros: !!dados.chuveiros, deteccao: !!dados.deteccao, pendencias: pend, premissas: prem };
  }

  /* ---------------------------------------------------------------- ACESSIBILIDADE (NBR 9050:2020 e NBR 16537:2024 — exemplares da RA) */
  function acsParam(chave, nome) {
    var t = tab(chave), d = t.dados.filter(function (x) { return x[0] === nome; })[0]; if (!d) throw new Error("acessibilidade sem " + nome);
    /* o item é a coluna "item" — mas há linha com uma célula a mais (a condição antes do item): vale a célula que PARECE item (6.11.2.2, Tabela 4) */
    var ii = arr(t.colunas).indexOf("item"), cands = [ii >= 0 ? d[ii] : null, d[d.length - 1], d[2]].filter(function (x) { return x != null && /^\s*(\d+\.\d|Tabela|Figura)/.test(txt(x)); });
    var item = cands.length ? cands[0] : txt(ii >= 0 ? d[ii] : d[d.length - 1]), cond = d.length > 3 && d[2] !== item ? d[2] : "", v = typeof d[1] === "number" ? d[1] : numBR(d[1]);
    return { valor: v, texto: d[1], condicao: cond, item: item, fonte: "NBR " + (/16537/.test(chave) ? "16537:2024 " : "9050:2020 ") + item, nivel: "A" };
  }
  var ACS = {
    vaoLivre: function () { return acsParam("ac9050.portas", "vao_livre_minimo_largura"); },
    espacoMacaneta: function () { var p = acsParam("ac9050.portas", "espaco_ao_lado_da_macaneta_abrindo_contra_o_usuario"); var m = /a favor:\s*([\d,]+)\s*m/.exec(txt(p.condicao)); if (!m) throw new Error("NBR 9050 6.11.2.2: espaço 'a favor' não lido"); p.aFavor = numBRexato(m[1]); return p; },
    giro: function () { var p = acsParam("ac9050.modulo_e_manobra", "manobra_rotacao_360"); p.valor = numBR(p.texto); return p; },
    corredor: function (comp, publico) {
      if (publico) return acsParam("ac9050.rota_corredores_desniveis", "corredor_uso_publico");
      if (comp <= 4 + 1e-9) return acsParam("ac9050.rota_corredores_desniveis", "corredor_uso_comum_ate_4_m");
      if (comp <= 10 + 1e-9) return acsParam("ac9050.rota_corredores_desniveis", "corredor_uso_comum_ate_10_m");
      return acsParam("ac9050.rota_corredores_desniveis", "corredor_uso_comum_acima_de_10_m");
    },
    desnivelLivre: function () { var p = acsParam("ac9050.rota_corredores_desniveis", "desnivel_ate_5_mm"); p.valor = 0.005; return p; },
    desnivelChanfro: function () { var p = acsParam("ac9050.rota_corredores_desniveis", "desnivel_5_a_20_mm"); p.valor = 0.020; return p; },
    /* NBR 9050 Tabela 4: [i máx %, desnível máx por segmento m, nº máx de segmentos | null] — lido do texto da linha */
    rampaTabela4: function () {
      var t = tab("ac9050.rampas"), out = [];
      t.dados.forEach(function (d) {
        var m = /^tabela4_.*?<=\s*([\d,]+)%$/.exec(d[0]); if (!m) return;
        var h = numBR(d[1]), seg = /m[aá]ximo\s+(\d+)\s+segmentos/.exec(d[2]);
        out.push({ iMax: numBRexato(m[1]), hMax: h, segMax: seg ? Number(seg[1]) : null });
      });
      return { faixas: out, fonte: "NBR 9050:2020 6.6.2.1, Tabela 4", nivel: "A" };
    },
    rampaLargura: function () { var p = acsParam("ac9050.rampas", "largura_livre"); p.valor = numBR((/m[ií]nimo admiss[ií]vel\s*([\d,]+)/.exec(p.texto) || [])[1]); return p; },
    rampaPatamar: function () { var p = acsParam("ac9050.rampas", "patamares"); p.valor = numBR((/comprimento >=\s*([\d,]+)/.exec(p.texto) || [])[1]); return p; },
    rampaCorrimao: function () { var p = acsParam("ac9050.rampas", "corrimao"), m = /([\d,]+)\s*m e\s*([\d,]+)\s*m/.exec(p.texto); p.alto = numBRexato(m[1]); p.baixo = numBRexato(m[2]); return p; },
    escadaPiso: function () { var p = acsParam("ac9050.escadas_e_corrimaos", "degrau_piso_p"), m = /([\d,]+)\s*a\s*([\d,]+)/.exec(p.texto); p.min = numBRexato(m[1]); p.max = numBRexato(m[2]); return p; },
    escadaEspelho: function () { var p = acsParam("ac9050.escadas_e_corrimaos", "degrau_espelho_e"), m = /([\d,]+)\s*a\s*([\d,]+)/.exec(p.texto); p.min = numBRexato(m[1]); p.max = numBRexato(m[2]); return p; },
    escadaFormula: function () { var p = acsParam("ac9050.escadas_e_corrimaos", "formula"), m = /([\d,]+)\s*m\s*<=.*<=\s*([\d,]+)\s*m/.exec(p.texto); p.min = numBRexato(m[1]); p.max = numBRexato(m[2]); return p; },
    escadaPatamar: function () { var p = acsParam("ac9050.escadas_e_corrimaos", "patamar"); p.desnivel = numBR((/a cada\s*([\d,]+)\s*m/.exec(p.texto) || [])[1]); p.valor = numBR((/comprimento >=\s*([\d,]+)/.exec(p.texto) || [])[1]); return p; },
    escadaLargura: function () { var p = acsParam("ac9050.escadas_e_corrimaos", "largura_escada"); p.valor = numBR((/m[ií]nimo\s*([\d,]+)\s*m/.exec(txt(p.texto)) || [])[1]); if (!(p.valor > 0)) throw new Error("NBR 9050 6.8.3: largura mínima não lida"); return p; },
    escadaCorrimao: function () { var p = acsParam("ac9050.escadas_e_corrimaos", "corrimao_alturas"), m = /([\d,]+)\s*m e\s*([\d,]+)\s*m/.exec(p.texto); p.alto = numBRexato(m[1]); p.baixo = numBRexato(m[2]); return p; },
    sanitarioQuantidade: function () { return acsParam("ac9050.sanitario_complemento", "quantidade"); },
    sanitarioPorta: function () { return acsParam("ac9050.sanitario_complemento", "porta"); },
    sanitarioDimensao: function () { return acsParam("ac9050.sanitario_complemento", "dimensao_do_ambiente"); },
    transferencia: function () { var t = acsParam("ac9050.modulo_e_manobra", "modulo_referencia_MR"); var m = /([\d,]+)\s*x\s*([\d,]+)/.exec(t.texto); t.a = numBRexato(m[1]); t.b = numBRexato(m[2]); return t; },
    alertaTatil: function () { var t = tab("ac16537.aplicacao_e_larguras"), d = t.dados.filter(function (x) { return x[0] === "alerta_escada_fixa"; })[0]; return { texto: d[1], item: d[2], fonte: "NBR 16537:2024 " + d[2], nivel: "A" }; },
    lei: function (art) { var t = tab("ac.legislacao_obrigatoriedade"); return t.dados.filter(function (x) { return x[1] === art || txt(x[0]) + " " + x[1] === art; }); }
  };
  /* acessibilidade é obrigatória? uso público/coletivo (Lei 13.146 art. 56; Decreto 5.296 art. 8 e 11); multifamiliar: áreas comuns (Dec. 9.451) */
  function acsObrigatoria(div) {
    var g = grupoDe(div);
    if (!div) return { obrigatoria: null, motivo: "sem a divisão de ocupação: obrigatoriedade não definida (pendência)" };
    if (div === "A-1") return { obrigatoria: false, motivo: "residência unifamiliar (A-1): a lei não obriga — vale como recomendação ou se o cliente pedir projeto acessível" };
    if (div === "A-2") return { obrigatoria: "comum", motivo: "multifamiliar: áreas de uso comum acessíveis e unidades adaptáveis (Lei 13.146 art. 58; Decreto 9.451/2018 arts. 3 a 8)" };
    return { obrigatoria: true, motivo: "edificação de uso público ou coletivo (" + div + "): Lei 13.146/2015 art. 56; Decreto 5.296/2004 arts. 8 e 11; Lei 10.098/2000 art. 11", grupo: g };
  }

  var IncRegras = {
    NIVEIS: NIVEIS, rotuloNivel: rotuloNivel, divisoes: divisoes, divisaoValida: divisaoValida, grupoDe: grupoDe, casaDivisao: casaDivisao,
    atividades: atividades, risco: risco, extintor: extintor, capacidadeMinimaABC: capacidadeMinimaABC, nivelRisco: nivelRisco, pscip: pscip,
    medida: medida, regraPopulacao: regraPopulacao, populacao: populacao, capacidade: capacidade, UP: UP, larguraMinima: larguraMinima,
    larguraRestrita: larguraRestrita, unidades: unidades, portaVao: portaVao, duasFolhasAcima: duasFolhasAcima, distanciaEntreSaidas: distanciaEntreSaidas,
    distanciaMaxima: distanciaMaxima, tipoEdificacao: tipoEdificacao, saidas: saidas, ILUM: ILUM, SIN: SIN, placaAreaMinima: placaAreaMinima,
    EXT: EXT, ESC: ESC, rampaMaxima: rampaMaxima, classificar: classificar, ACS: ACS, acsObrigatoria: acsObrigatoria, param: param, tab: tab
  };
  global.IncRegras = IncRegras;
  if (typeof module !== "undefined" && module.exports) module.exports = IncRegras;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
