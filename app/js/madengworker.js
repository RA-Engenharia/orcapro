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
    "madauditor.js", "maddimensionar2.js", "madengentrada.js", "madorcamento.js"];
  var GLOBAL_DE = { "acoisopletas.js": "AcoIsopletas", "acoanalise.js": "AcoAnalise", "acocargas.js": "AcoCargas", "acovento.js": "AcoVento", "madmateriais.js": "MadMateriais", "madviga.js": "MadViga",
    "maddim7190.js": "MadDim", "madtipologias.js": "MadTipologias", "madligacoes.js": "MadLig", "madauditor.js": "MadAuditor", "maddimensionar2.js": "MadDimensionar2",
    "madengentrada.js": "MadEngEntrada", "madorcamento.js": "MadOrcamento" };
  var ETAPAS = ["preparar", "dimensionar", "ligacoes", "fonte", "auditoria", "orcamento"];
  var NOME_ETAPA = { preparar: "Montando o modelo, as cargas e o vento (NBR 6123, com vento oblíquo e abertura dominante)", dimensionar: "Dimensionando as seções no catálogo e verificando (NBR 7190, 2ª ordem)",
    ligacoes: "Ligações: pinos, chapas, placa de base e chumbadores", fonte: "Lista de peças com geometria", auditoria: "Pente-fino do projeto (peças sem apoio, esbeltez, verga, reforço)", orcamento: "Itens do orçamento, com preço e fonte" };

  function G(nome) { return global[nome] || null; }
  function copia(x) { return JSON.parse(JSON.stringify(x)); }

  /** estado da tela + opção → solicitação serializável */
  function solicitacao(est, opcao) {
    var EN = G("MadEngEntrada") || (typeof require === "function" ? require("./madengentrada.js") : null), tp = EN.toProj(est, opcao);
    var t7 = tp.t7 ? copia(tp.t7) : null;   /* copia por JSON: o terreno (função) sai, os dados ficam */
    return { proj: tp.proj, partida: tp.partida, t7: t7, terreno: { const: EN.num(est.t7 && est.t7.terrenoConst, 0), pts: (est.t7 && est.t7.terrenoPts) || "" }, extras: tp.extras,
      precos: copia(est.precos || {}), bdi: est.bdi, soDeck: est.tip === "T7", nome: est.obra.nome || "", opcao: tp.opcao.id, nomeOpcao: tp.opcao.nome };
  }

  function rodar(sol, prog) {
    var D2 = G("MadDimensionar2") || require("./maddimensionar2.js"), EN = G("MadEngEntrada") || require("./madengentrada.js"), MO = G("MadOrcamento") || require("./madorcamento.js");
    var t0 = Date.now(); function avisa(etapa, extra) { if (prog) { var p = extra || {}; p.etapa = etapa; p.ms = Date.now() - t0; prog(p); } }
    avisa("preparar");
    var proj = copia(sol.proj), terr = EN.terrenoFn({ t7: { terrenoConst: sol.terreno && sol.terreno.const, terrenoPts: sol.terreno && sol.terreno.pts } });
    var t7 = sol.t7 ? copia(sol.t7) : null;
    if (t7) t7.decks.forEach(function (d) { if (d.modo !== "retangulo") d.terreno = terr; });
    if (sol.soDeck) return rodarDeck(sol, t7, terr, avisa, t0, MO);
    var itAtual = 0;
    avisa("dimensionar", { it: 0 });
    var out = D2.projetarT1(proj, sol.partida, { t7: t7, terreno: terr, aoIterar: function (it, sec, pior) { itAtual = it + 1; avisa("dimensionar", { it: itAtual, pior: pior, sec: sec }); } });
    avisa("auditoria");
    var r = out.resultado, q = proj._pad || {}, pecas = out.fonte.pecas;
    avisa("orcamento");
    var orc = MO.orcar({ opcao: sol.opcao, nome: sol.nomeOpcao, pecas: pecas, ligacoes: out.ligacoes, secoes: out.secoes, teto: (q.params || proj.params).teto, extras: sol.extras, precos: sol.precos, bdi: sol.bdi });
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
    return res;
  }

  /** só o deck (T7): lista de peças, auditoria e orçamento. ⚠ NÃO há verificação estrutural do deck (E1 só gera a fonte de peças) — a tela avisa. */
  function rodarDeck(sol, t7, terr, avisa, t0, MO) {
    var MT = G("MadTipologias") || require("./madtipologias.js"), AUD = G("MadAuditor") || require("./madauditor.js");
    avisa("fonte"); var f = MT.T7.fonte(t7), pecas = f.pecas;
    avisa("auditoria"); var aud = AUD.auditar({ pecas: pecas, ligacoes: {}, params: null, terreno: terr }, { regras: ["peca-sem-apoio", "balanco-barrote", "pilarete-sem-travamento", "peca-abaixo-do-terreno"] });
    avisa("orcamento"); var orc = MO.orcar({ opcao: sol.opcao, nome: sol.nomeOpcao, pecas: pecas, ligacoes: {}, secoes: {}, teto: null, extras: sol.extras, precos: sol.precos, bdi: sol.bdi });
    return { ok: !aud.achados.length, soDeck: true, semSolucao: false, opcao: sol.opcao, nomeOpcao: sol.nomeOpcao, secoes: null, iteracoes: 0, pior: {}, grupos: {}, flechas: {}, reacoes: {}, lig: null, ligacoes: null,
      fonte: { pecas: pecas, volume_por_material_m3: MT.volumePorMaterial(pecas) }, t7: { areas: f.areas, apoiosDiretos: f.apoiosDiretos }, auditoria: aud, orcamento: orc, avisosAnalise: [], ms: Date.now() - t0 };
  }

  var API = { MOTORES: MOTORES, GLOBAL_DE: GLOBAL_DE, ETAPAS: ETAPAS, NOME_ETAPA: NOME_ETAPA, solicitacao: solicitacao, rodar: rodar };
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
