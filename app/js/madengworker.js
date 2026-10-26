/* =====================================================================
 * madengworker.js — o CÁLCULO da tela "Estruturas de madeira" num Web Worker (processo paralelo do navegador).
 * Roda o projeto completo de UMA opção (A, B ou C): maddimensionar2 (laço de crescimento da seção, 2ª ordem, vento oblíquo) → madligacoes →
 * madtipologias (fonte de peças, T1 + T7) → madauditor (pente-fino) → madorcamento (itens com preço e fonte).
 * Um dimensionamento de T1 leva de 30 s a 1 min: na página a tela ficaria parada, por isso o Worker.
 *
 * DOIS JEITOS DE RODAR, O MESMO CÓDIGO (o molde do js/madcalcworker.js):
 *   · como Worker (new Worker("js/madengworker.js")): importScripts dos motores; recebe
 *       { tipo: "calcular", id, sol }  (sol = MadEngWorker.solicitacao(estado, opcao): números e textos, SEM função)
 *     e devolve { tipo: "progresso", etapa, it, pior } durante o cálculo e { tipo: "fim", texto } (o RESULTADO em JSON) — ou { tipo: "erro" }.
 *   · na página / no Node (tools/): MadEngWorker.rodar(sol, aoProgredir) com os motores já carregados (a tela os injeta quando o navegador
 *     recusa o Worker e avisa que fica parada).
 * ⚠ O resultado volta como TEXTO JSON: Infinity vira null (η de uma ligação sem solução) — a tela lê null como "sem solução no limite".
 * ⚠ O terreno do deck é uma FUNÇÃO nos motores; função não atravessa o postMessage: vai como { const, pts } e é refeito aqui.
 * ===================================================================== */
(function (global) {
  "use strict";

  var NO_WORKER = typeof global.importScripts === "function" && typeof global.document === "undefined";
  var MOTORES = ["acoisopletas.js", "acoanalise.js", "acocargas.js", "acovento.js", "madmateriais.js", "madviga.js", "maddim7190.js", "madtipologias.js", "madligacoes.js",
    "madauditor.js", "maddeck.js", "maddimensionar2.js", "madengentrada.js", "madorcamento.js"];
  var GLOBAL_DE = { "acoisopletas.js": "AcoIsopletas", "acoanalise.js": "AcoAnalise", "acocargas.js": "AcoCargas", "acovento.js": "AcoVento", "madmateriais.js": "MadMateriais", "madviga.js": "MadViga",
    "maddim7190.js": "MadDim", "madtipologias.js": "MadTipologias", "madligacoes.js": "MadLig", "madauditor.js": "MadAuditor", "maddeck.js": "MadDeck", "maddimensionar2.js": "MadDimensionar2",
    "madengentrada.js": "MadEngEntrada", "madorcamento.js": "MadOrcamento" };
  var ETAPAS = ["preparar", "deck", "dimensionar", "ligacoes", "fonte", "auditoria", "orcamento"];
  var NOME_ETAPA = { preparar: "Montando o modelo, as cargas e o vento (NBR 6123, com vento oblíquo e abertura dominante)", dimensionar: "Dimensionando as seções no catálogo e verificando (NBR 7190, 2ª ordem)",
    deck: "Deck: tábuas, barrotes, vigas, pilaretes, estabilidade lateral, guarda-corpo e escada (NBR 7190-1, 6120, 14718)", ligacoes: "Ligações: pinos, chapas, placa de base e chumbadores", fonte: "Lista de peças com geometria", auditoria: "Pente-fino do projeto (peças sem apoio, esbeltez, verga, reforço)", orcamento: "Itens do orçamento, com preço e fonte" };

  function G(nome) { return global[nome] || null; }
  function copia(x) { return JSON.parse(JSON.stringify(x)); }

  /** estado da tela + opção → solicitação serializável */
  function solicitacao(est, opcao) {
    var EN = G("MadEngEntrada") || (typeof require === "function" ? require("./madengentrada.js") : null), tp = EN.toProj(est, opcao);
    var t7 = tp.t7 ? copia(tp.t7) : null;   /* copia por JSON: o terreno (função) sai, os dados ficam */
    return { proj: tp.proj, partida: tp.partida, t7: t7, terreno: { const: EN.num(est.t7 && est.t7.terrenoConst, 0), pts: (est.t7 && est.t7.terrenoPts) || "" }, extras: tp.extras,
      precos: copia(est.precos || {}), bdi: est.bdi, soDeck: est.tip === "T7", deck: est.deck ? copia(est.deck) : null, t2: !!tp.t2, sistema: tp.sistema || null, nome: est.obra.nome || "", opcao: tp.opcao.id, nomeOpcao: tp.opcao.nome };
  }

  function rodar(sol, prog) {
    var D2 = G("MadDimensionar2") || require("./maddimensionar2.js"), EN = G("MadEngEntrada") || require("./madengentrada.js"), MO = G("MadOrcamento") || require("./madorcamento.js");
    var t0 = Date.now(); function avisa(etapa, extra) { if (prog) { var p = extra || {}; p.etapa = etapa; p.ms = Date.now() - t0; prog(p); } }
    avisa("preparar");
    var proj = copia(sol.proj), terr = EN.terrenoFn({ t7: { terrenoConst: sol.terreno && sol.terreno.const, terrenoPts: sol.terreno && sol.terreno.pts } });
    var t7 = sol.t7 ? copia(sol.t7) : null;
    if (t7) t7.decks.forEach(function (d) { if (d.modo !== "retangulo") d.terreno = terr; });
    if (sol.soDeck) return rodarDeck(sol, t7, terr, avisa, t0, MO);
    if (sol.t2) return rodarT2(sol, proj, avisa, t0, D2, MO);
    var itAtual = 0, dk = null;
    if (t7) { avisa("deck"); dk = projetarDeck(sol, t7, terr); t7 = dk.resultado.params; }          /* o deck CALCULADO (seções crescidas) é o que vai à fonte, ao orçamento e às pranchas */
    avisa("dimensionar", { it: 0 });
    var out = D2.projetarT1(proj, sol.partida, { t7: t7, terreno: terr, aoIterar: function (it, sec, pior) { itAtual = it + 1; avisa("dimensionar", { it: itAtual, pior: pior, sec: sec }); } });
    avisa("auditoria");
    var r = out.resultado, q = proj._pad || {}, pecas = out.fonte.pecas;
    avisa("orcamento");
    var orc = MO.orcar({ opcao: sol.opcao, nome: sol.nomeOpcao, pecas: pecas, ligacoes: out.ligacoes, secoes: out.secoes, teto: (q.params || proj.params).teto, extras: sol.extras, precos: sol.precos, bdi: sol.bdi, deck: dk ? (G("MadDeck") || require("./maddeck.js")).paraOrcamento(dk.resultado, dk.ligacoes) : null });
    var vento = q._vento || proj._vento || {};
    var res = {
      ok: !out.semSolucao && (!out.ligacoes || out.ligacoes.ok !== false) && !(out.auditoria && out.auditoria.achados.length), semSolucao: !!out.semSolucao, opcao: sol.opcao, nomeOpcao: sol.nomeOpcao,
      secoes: out.secoes, iteracoes: out.historico.length, pior: D2.piorPorGrupo(r), grupos: r.grupos, flechas: r.flechas, contraflechaV: r.contraflechaV || null, flechasMm: r.flechasMm || null, fragil: r.fragil || null, reacoes: r.reacoes, lig: r.lig, fitaNmax: r.fitaNmax, DZ: r.DZ,
      nTercas: r.nTercas, combinacoes: r.combinacoes, avisos: r.avisos || [], avisosAnalise: r.avisosAnalise || [], v0: vento.v0 != null ? vento.v0 : (vento.entrada && vento.entrada.v0) || null,
      ligacoes: out.ligacoes, fonte: out.fonte, t7: out.t7 ? { areas: out.t7.areas, apoiosDiretos: out.t7.apoiosDiretos } : null, auditoria: out.auditoria || { achados: [], porRegra: {}, ok: true },
      orcamento: orc, ms: Date.now() - t0
    };
    /* memória de cálculo para o memorial (E3): vento passo a passo, cargas e premissas — campos NOVOS, nada do que já existia muda */
    res.memoria = { vento: vento.ok ? { memoria: vento.memoria, avisos: vento.avisos, v0: vento.v0, s1: vento.s1, s2: vento.s2, s3: vento.s3, vk: vento.vk, q: vento.q, cpi: vento.cpi, excentricidade: vento.excentricidade,
        casos: (vento.casos || []).map(function (c) { return { id: c.id, nome: c.nome, direcao: c.direcao, cpi: c.cpi, cpiMotivo: c.cpiMotivo, q: c.q }; }), geometria: vento.geometria, norma: vento.norma, edicao: vento.edicao } : null,
      cargas: q.cargas || null, pesoMLC: q.pesoMLC, classe: q.classe, umidade: q.umidade, limVao: q.limVao, limBalanco: q.limBalanco, vento_entrada: proj.vento ? { local: proj.vento.local, s1: proj.vento.s1, categoria: proj.vento.categoria, grupoS3: proj.vento.grupoS3 } : null };
    if (res.v0 == null && vento.v0 != null) res.v0 = vento.v0;
    if (dk) anexarDeck(res, dk);
    return res;
  }

  /** T7 CALCULADO (E4 r6): MadDeck.projetar sobre o deck da entrada; opções do deck (região do guarda-corpo, umidade, estabilidade…) vêm de sol.deck */
  function projetarDeck(sol, t7, terr) {
    var DK = G("MadDeck") || require("./maddeck.js"), o = sol.deck || {}, pr = { params: t7, umidade: o.umidade || 4, classe: (sol.proj && sol.proj.classe) || o.classe || "mlc:GL24h" };
    if (sol.proj && sol.proj.vento) pr.vento = copia(sol.proj.vento);          /* E4 r8: o vento do deck sai da NBR 6123 (V0, S1, S2 na cota, S3 da obra), não de pressão fixa */
    ["guardaCorpo", "cargas", "lateral", "tabua", "limites", "limVao", "limBalanco"].forEach(function (k) { if (o[k] != null) pr[k] = copia(o[k]); });
    /* campos da tela chegam como texto: vira número (vazio = não informado) */
    function nz(v) { if (v == null || String(v).trim() === "") return null; var x = Number(String(v).replace(",", ".")); return isFinite(x) ? x : null; }
    if (pr.guardaCorpo) { var gc = {}; if (pr.guardaCorpo.regiao) gc.regiao = String(pr.guardaCorpo.regiao).toUpperCase(); if (nz(pr.guardaCorpo.h) != null) gc.h = nz(pr.guardaCorpo.h); Object.keys(pr.guardaCorpo).forEach(function (k) { if (k !== "regiao" && k !== "h") gc[k] = pr.guardaCorpo[k]; }); pr.guardaCorpo = gc; }
    if (pr.cargas) { var cg = {}; Object.keys(pr.cargas).forEach(function (k) { var x = nz(pr.cargas[k]); if (x != null) cg[k] = x; }); pr.cargas = cg; }
    if (pr.lateral) { var la = {}; Object.keys(pr.lateral).forEach(function (k) { if (k === "topoTravado") la[k] = !!pr.lateral[k]; else if (typeof pr.lateral[k] === "object") la[k] = pr.lateral[k]; else { var x = nz(pr.lateral[k]); if (x != null) la[k] = x; } }); pr.lateral = la; }
    /* estabilidade escolhida na tela: base engastada / amarração à edificação / mãos-francesas (vazio = como o deck foi desenhado) */
    if (o.estab && t7 && t7.decks) t7.decks.forEach(function (d) { var rect = d.modo === "retangulo"; if (o.estab === "base") { if (rect) d.pilar.engastado = true; else d.pilarEngastado = true; } else if (o.estab === "amarracao") { d.amarracaoEdificacao = true; if (rect) { d.pilar.engastado = false; delete d.pilar.contraventamento; delete d.pilar.cv; } else d.pilarEngastado = false; } else if (o.estab === "mf") { if (rect) { d.pilar.engastado = false; delete d.pilar.contraventamento; delete d.pilar.cv; } else d.pilarEngastado = false; d.amarracaoEdificacao = false; } });
    return DK.projetar(pr, { terreno: terr });
  }
  /** junta o deck ao resultado da opção: grupos, achados, ligações reprovadas e avisos entram onde a situação (MadEngSaidas.situacao) já lê */
  function anexarDeck(res, dk) {
    var R = dk.resultado, etaMax = 0;
    Object.keys(R.pior).forEach(function (k) { if (R.pior[k] > etaMax) etaMax = R.pior[k]; });
    res.deck = { umidade: R.q.umidade, classe: R.q.classe, etaMax: etaMax, pior: R.pior, semSolucao: !!dk.semSolucao, secoes: dk.secoes, ligacoes: dk.ligacoes, avisos: dk.avisos, memorial: (G("MadDeck") || require("./maddeck.js")).memorial(R),
      guardaCorpo: R.guardaCorpo ? { dados: R.guardaCorpo.dados, fixacao: R.guardaCorpo.fixacao, montante: R.guardaCorpo.montante, deslocamento: R.guardaCorpo.deslocamento, corrimao: R.guardaCorpo.corrimao, reguas: R.guardaCorpo.reguas } : null,
      reacoes: R.reacoes, premissas: R.premissas, hPilareteMax: R.hPiletreMax, q: { guardaCorpo: R.q.guardaCorpo, lateral: R.q.lateral, cargas: R.q.cargas, tabua: R.q.tabua, pesoMLC: R.q.pesoMLC }, trechosGC: R.params.guardaCorpo, escadaParams: R.params.escada ? { longarinas: R.params.escada.longarinas || null, degraus: R.params.escada.degraus, material: R.params.escada.material || null, vao: R.params.escada.vao || null, largura: R.params.escada.largura || null, degrau: R.params.escada.degrau || null } : null,
      escada: R.escada, decks: Object.keys(R.decks).reduce(function (o, id) { var d = R.decks[id]; o[id] = { H: d.H, estabilidade: d.estabilidade, pior: d.pior, tabua: d.tabua, pilaretes: d.pilaretes.map(function (p) { return { id: p.id, tipo: p.tipo, L0: p.L0, eta: p.eta, apoio: p.apoio, h: p.h, NG: p.NG, NQ: p.NQ, N1: p.N1, N2: p.N2, M2: p.M2, Hd: p.Hd, peso: p.peso, circ: p.circ, b: p.b, classe: p.classe, beta: p.beta }; }), maoFrancesa: d.maoFrancesa || null, contraventamento: d.contraventamento ? JSON.parse(JSON.stringify(d.contraventamento)) : null, muretas: (d.muretas || []).map(function (m) { return { id: m.id, L: m.L, eta: m.eta, reacao_kN_por_m: m.reacao_kN_por_m }; }), amarracao: d.amarracao || null, escadaCargas: d.escada || [], alturaDeck: d.alturaDeck,
          vigas: d.vigas.map(function (v) { return { id: v.id, L: v.L, b: v.b, h: v.h, eta: isFinite(v.eta) ? v.eta : 99, apoios: v.apoios, borda: !!v.borda }; }), barrotes: d.barrotes.length ? { n: d.barrotes.length, b: d.barrotes[0].b, h: d.barrotes[0].h, etaMax: d.pior.barrote.eta, balancoMax: Math.max.apply(null, d.barrotes.map(function (x) { return x.balanco || 0; })) } : null }; return o; }, {}) };
    (dk.avisos || []).forEach(function (a) { if (res.avisos.indexOf(a) < 0) res.avisos.push(a); });
    if (dk.auditoria) dk.auditoria.achados.forEach(function (a) { if (res.auditoria.achados.some(function (x) { return x.regra === a.regra && x.peca === a.peca; })) return; res.auditoria.achados.push(a); res.auditoria.porRegra[a.regra] = (res.auditoria.porRegra[a.regra] || 0) + 1; });
    if (dk.ligacoes) dk.ligacoes.verificacoes.forEach(function (v) { if (!v.ok) res.auditoria.achados.push({ regra: "ligacao-deck", peca: v.nome, mensagem: "Ligação do deck '" + v.nome + "' reprova (η = " + (isFinite(v.eta) ? v.eta.toFixed(2).replace(".", ",") : "sem solução") + ").", correcao: "Aumentar a seção, a chapa de apoio ou o número de parafusos e recalcular.", gravidade: "critica" }); });
    res.ok = res.ok && !res.auditoria.achados.length;
  }

  /** T2 (casa/pavilhão de duas águas, E4): projetarT2 (laço de crescimento + base pela ligação + ligações dos nós + auditor) + membros com posição (para pranchas/IFC) + orçamento (orcarT2) */
  function rodarT2(sol, proj, avisa, t0, D2, MO) {
    var MT = G("MadTipologias") || require("./madtipologias.js"), itAtual = 0;
    avisa("dimensionar", { it: 0 });
    var out = D2.projetarT2(proj, sol.partida, { auditor: true, voltasBase: 2, aoIterar: function (it, sec, pior) { itAtual = it + 1; avisa("dimensionar", { it: itAtual, pior: pior, sec: sec }); } });
    avisa("auditoria");
    var r = out.resultado, q = proj._pad2 || {}, F = MT.T2.fonte(q.params, out.secoes, { classe: q.classe }), I = F.info;
    var membros = F.membros.map(function (m) { return { id: m.id, g: m.g, agua: m.agua || null, tes: m.tes == null ? null : m.tes, rf: m.rf == null ? null : m.rf, p0: m.p0, p1: m.p1, nos: m.nos || [], face: m.face || null, oitao: !!m.oitao }; });
    avisa("orcamento");
    var orc = MO.orcarT2({ opcao: sol.opcao, nome: sol.nomeOpcao, pecas: out.fonte.pecas, params: q.params, secoes: out.secoes, ligacoes: out.ligacoes, ligacoesT2: out.ligacoesT2, extras: sol.extras, precos: sol.precos, bdi: sol.bdi });
    var vento = q._vento || proj._vento || {};
    var avisos = (r.avisos || []).slice();
    if (out.ligacoesT2 && out.ligacoesT2.avisos) out.ligacoesT2.avisos.forEach(function (a) { avisos.push(a); });
    avisos.push("T2: vergas de vidro e caibros secundários não são modelados; a torção por excentricidade do vento (6.6) é modelada (M13); o vento oblíquo NÃO é montado (a Tabela 5 não traz coeficientes oblíquos para duas águas).");
    var res = {
      ok: !out.semSolucao && (!out.ligacoes || out.ligacoes.ok !== false) && (!out.ligacoesT2 || out.ligacoesT2.ok !== false) && !(out.auditoria && out.auditoria.achados.length), semSolucao: !!out.semSolucao, tipologia: "T2", sistema: sol.sistema,
      opcao: sol.opcao, nomeOpcao: sol.nomeOpcao, secoes: out.secoes, iteracoes: out.historico.length, pior: out.pior || D2.piorPorGrupo(r), grupos: r.grupos, flechas: r.flechas, flechasMm: r.flechasMm || null, reacoes: r.reacoes, reacoesAssento: r.reacoesAssento || null,
      combinacoes: r.combinacoes, avisos: avisos, avisosAnalise: r.avisosAnalise || [], v0: vento.v0 != null ? vento.v0 : (vento.entrada && vento.entrada.v0) || null, cargasTotais: r.cargasTotais || null, QCOB: r.QCOB || null,
      ligacoes: out.ligacoes, ligacoesT2: out.ligacoesT2, rigidezBase: out.rigidezBase, fonte: out.fonte, auditoria: out.auditoria || { achados: [], porRegra: {}, ok: true }, orcamento: orc, t7: null,
      t2: { params: q.params, membros: membros, contrav: r.contrav || null, info: { xs: I.xs, nCol: I.nCol, nH: I.nH, dz: I.dz, lp: I.lp, sc: I.sc, Hp: I.Hp, zsOit: I.zsOit, eE: I.eE, eD: I.eD, tipF: I.tipF, tipB: I.tipB, a: I.a, b: I.b, incl: I.incl, xfr: I.xfr } }, ms: Date.now() - t0 };
    res.memoria = { vento: vento.ok ? { memoria: vento.memoria, avisos: vento.avisos, v0: vento.v0, s1: vento.s1, s2: vento.s2, s3: vento.s3, vk: vento.vk, q: vento.q, cpi: vento.cpi, excentricidade: vento.excentricidade,
        casos: (vento.casos || []).map(function (c) { return { id: c.id, nome: c.nome, direcao: c.direcao, cpi: c.cpi, cpiMotivo: c.cpiMotivo, q: c.q }; }), geometria: vento.geometria, norma: vento.norma, edicao: vento.edicao } : null,
      cargas: { telha: q.params && q.params.telha && q.params.telha.peso }, pesoMLC: q.pesoMLC, classe: q.classe, umidade: q.umidade, limVao: q.limVao, limBalanco: q.limBalanco, vento_entrada: proj.vento ? { local: proj.vento.local, s1: proj.vento.s1, categoria: proj.vento.categoria, grupoS3: proj.vento.grupoS3 } : null };
    return res;
  }

  /** só o deck (T7): projeto CALCULADO (tábuas, barrotes, vigas, pilaretes, estabilidade, guarda-corpo, escada) + ligações + auditoria + orçamento sobre as seções calculadas */
  function rodarDeck(sol, t7, terr, avisa, t0, MO) {
    var MT = G("MadTipologias") || require("./madtipologias.js");
    avisa("deck"); var dk = projetarDeck(sol, t7, terr), R = dk.resultado, pecas = dk.fonte.pecas, f = R.fonte;
    avisa("auditoria"); var aud = dk.auditoria || { achados: [], porRegra: {}, ok: true };
    avisa("orcamento"); var orc = MO.orcar({ opcao: sol.opcao, nome: sol.nomeOpcao, pecas: pecas, ligacoes: {}, secoes: {}, teto: null, extras: sol.extras, precos: sol.precos, bdi: sol.bdi, deck: (G("MadDeck") || require("./maddeck.js")).paraOrcamento(R, dk.ligacoes) });
    var res = { ok: !aud.achados.length && !dk.semSolucao && (!dk.ligacoes || dk.ligacoes.ok !== false), soDeck: true, semSolucao: !!dk.semSolucao, opcao: sol.opcao, nomeOpcao: sol.nomeOpcao, secoes: null, iteracoes: dk.historico.length, pior: dk.pior || {}, grupos: {}, flechas: {}, reacoes: {}, lig: null, ligacoes: null,
      fonte: { pecas: pecas, volume_por_material_m3: MT.volumePorMaterial(pecas) }, t7: { areas: f.areas, apoiosDiretos: f.apoiosDiretos }, auditoria: { achados: aud.achados.slice(), porRegra: aud.porRegra, ok: aud.ok }, orcamento: orc, avisos: [], avisosAnalise: [], ms: Date.now() - t0 };
    anexarDeck(res, dk); res.ligacoesDeck = dk.ligacoes; return res;
  }

  var API = { MOTORES: MOTORES, GLOBAL_DE: GLOBAL_DE, ETAPAS: ETAPAS, NOME_ETAPA: NOME_ETAPA, solicitacao: solicitacao, rodar: rodar, _projetarDeck: projetarDeck, _anexarDeck: anexarDeck };
  if (!NO_WORKER) {
    global.MadEngWorker = API;
    if (typeof module !== "undefined" && module.exports) module.exports = API;
    return;
  }

  /* ============================================================ WORKER */
  var carregados = null, faltam = [], ver = "";
  try { var mv = /[?&]v=([^&]+)/.exec(String(global.location && global.location.search || "")); if (mv) ver = "?v=" + mv[1]; } catch (e) {}
  function carregar() {
    if (carregados) return; carregados = [];
    MOTORES.forEach(function (arq) { try { global.importScripts(arq + ver); carregados.push(arq); } catch (e) { faltam.push(arq); } });
  }
  global.MadEngWorker = API;   /* o rodar() acima lê os motores pelo global do Worker */
  global.onmessage = function (ev) {
    var m = ev.data || {}, t0 = Date.now();
    try {
      carregar();
      if (m.tipo === "calcular") {
        global.postMessage({ tipo: "motores", id: m.id, carregados: carregados, faltam: faltam });
        if (faltam.length) { global.postMessage({ tipo: "erro", id: m.id, mensagem: "Não carregou: " + faltam.join(", ") }); return; }
        var r = rodar(m.sol, function (p) { p.tipo = "progresso"; p.id = m.id; global.postMessage(p); });
        global.postMessage({ tipo: "fim", id: m.id, ms: Date.now() - t0, texto: JSON.stringify(r) });
      }
    } catch (e) {
      global.postMessage({ tipo: "erro", id: m.id, mensagem: e && e.message ? e.message : String(e), pilha: e && e.stack ? String(e.stack).slice(0, 1200) : "" });
    }
  };
})(typeof window !== "undefined" ? window : (typeof self !== "undefined" ? self : (typeof global !== "undefined" ? global : this)));
