/* =====================================================================
 * andaimemulticalc.js — CÁLCULO E SIMULAÇÃO DO ANDAIME MULTIDIRECIONAL (motor PURO, ES5, sem DOM, Node-testável).
 * Frente "Andaimes", etapa M3 (27/10/2026) + correção M3.1 (revisão adversarial nº 1) + M3.2 (cunha rótula por padrão) + M3.3 (revisão nº 2: espigão rótula por padrão, ancoragem por trecho, guarda-corpo induzido no poste vizinho, elo transversal, campos do RT por pendência; docs/andaime-multi/REVISAO-CALCULO-M2.md). Especificação: docs/andaime-multi/ESPEC-M3.md e ESPEC-M3.1.md. Hipóteses, uma por linha, com fonte e o
 * porquê de serem conservadoras: docs/andaime-multi/CALCULO-HIPOTESES-M.md. Decisões abertas: docs/andaime-multi/DUVIDAS-M3.md.
 * ⚠ CÁLCULO DE SEGURANÇA DE VIDA: passa pelo revisor adversarial antes de ir para o sistema.
 *
 *   AndaimeMultiCalc.calcular(modelo, par, opt, internos) → mesmo formato do AndaimeCalc.calcular do tubo-roll
 *       { ok, verificacoes[], reacoes[], montantes[], caminho{}, naoVerificado[], ressalvas[], avisos[], pendencias[], resumo, parametros, vento }
 *       cada verificação: { id, tipo, pecas[], titulo, formula, valores{}, texto, solicitante, resistente, uso, estado, fonte, confirmarRT[], ressalvas[], porPeca{}, corrigir[] }
 *       estados: ok (uso ≤ 0,90) · atencao (0,90–1,00) · falha (> 1,00) · nao_verificado (dado faltando: NUNCA "ok").
 *   AndaimeMultiCalc.simulacao(modelo, calc) · corrigir(...) · montarInteligente(par, opcoes, internos)
 *
 * É chamado por js/andaimecalc.js quando modelo.sistema === "multidirecional" e RECEBE dele (INTERNOS) o que foi revisado 3× no tubo-roll: solver de viga,
 * autovalor da coluna (Ncr com molas), vento (NBR 6123:2023: S1, S2(z), S3 = 1,00, Ca·φ da tela), NBR 8800 (compressão e flexão do tubo),
 * tabela da base, estados e o gerador. Nada disso é copiado.
 *
 * CAMINHO DE CARGA (multi): piso metálico (apoiado pelas garras nas TRANSVERSAIS dos dois lados) → transversal biapoiada nas duas rosetas (cunha = RÓTULA)
 * → ligação travessa–roseta → POSTE. Vento ⟂ à fachada (M3.1, ESPEC-M3.1 §1): cada ESTAÇÃO (poste interno + externo + transversais) é um pórtico plano com os dois postes ligados
 * pelas transversais (elo rígido na horizontal, rótula na rotação), apoiado no chão, nas ANCORAGENS do poste interno e nas LONGITUDINAIS das linhas interna e externa (vigas contínuas
 * entre as estações ANCORADAS no mesmo nível, molas 3EI(a+b)/(a²b²) como no tubo-roll depois da C-T1). O pórtico transversal diagonalizado NUNCA é apoio do vento (só autovalor).
 * Vento ∥ à fachada: NÃO calculado (verificação «vento_paralelo», nao_verificado, liberada só pelo RT com justificativa); diagonais: força nocional 0,3 % + compressão do tubo.
 * Topo com tela: o trecho acima do último nó é verificado como o montante_topo do tubo-roll (N do próprio trecho, sem B1), sobre os apoios elásticos reais.
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function AMu() { return dep("AndaimeMulti", "./andaimemulti.js"); }

  var I = null;   /* INTERNOS do AndaimeCalc (preenchido a cada chamada) */
  /* SÓ PARA OS TESTES: cada chave liga o caminho de código ANTIGO de uma correção, para o controle negativo ser o resultado de verdade do código antigo e não um clone editado à mão
     (revisão nº 2, anexo: «controles reais»). Nunca ligado em produção. semInduzido = A-N2 (momento do guarda-corpo no poste vizinho) · semCm = M-N4 (Cm = 1). */
  var LEGADO = { semInduzido: false, semCm: false };
  var CACHE_FEM = {}, CACHE_N = 0;   /* pórtico da estação: mesma assinatura (geometria, apoios, cargas, N) = mesmo resultado */
  function num(v, d) { return I.num(v, d); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function brf(v, c) { return I.brf(v, c); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function hyp(a, b) { return Math.sqrt(a * a + b * b); }
  function r3(v) { return Math.round(v * 1e3) / 1e3; }

  /* ================================================================ PARÂMETROS DO MULTI (além dos do tubo-roll)
   * null = SEM FONTE: a verificação fica nao_verificado e o motor diz o que informar. Os valores com fonte são SECUNDÁRIOS e vão em confirmarRT. */
  function extrasPadrao(linha) {
    var est = linha === "estribo";
    return {
      capNoKgf: null,                         /* kgf — carga vertical admissível da ligação travessa–roseta: NENHUMA fonte pública (PESQUISA-MULTI-WEB §2.4 «não achei») */
      mAdmTravessaKgfm: est ? null : 68,      /* kgf·m — M04 (projeto de terceiro, SECUNDÁRIO), é de projeto de roseta/PEMAX: não vale para o estribo (Mecanflex) */
      cargaAdmPosteKgf: est ? null : 2000,    /* kgf de SERVIÇO por poste — M04 (SECUNDÁRIO); idem */
      eCunha: 0.062,                          /* m — excentricidade da carga da cabeça da travessa = RAIO da roseta (124 mm / 2; familias-m-cotas.json, S20 secundária) */
      espigaoRigido: false,                   /* M3.3 (C-N1): PADRÃO = RÓTULA. O momento que o espigão (emenda do poste) transmite não tem fonte pública → sem fonte, o conservador: o Ncr (autovalor) e a flexão do poste calculam a emenda como RÓTULA. true só vale com espigaoJustificativa (>= 15 caracteres não brancos) do RT, no molde de cunhaContinua. */
      espigaoJustificativa: "",               /* obrigatória para espigaoRigido valer; vai para o memorial */
      espigaoTracaoRT: false, espigaoTracaoJustificativa: "",       /* M3.3 (M-N2): o RT conferiu a capacidade do pino/espigão à tração (sem fonte pública) — libera «espigao» */
      capLigAxialKgf: null,                   /* M4-C (ressalva 1 da revisão nº 2): kgf — capacidade AXIAL da ligação travessa–roseta (cunha ao esforço axial da barra). Campo PRÓPRIO: o capNoKgf é a carga VERTICAL e não vale como axial. O RT informa da tabela do fabricante do locador (nenhuma fonte pública). null = a ligação do elo transversal e da travessa longitudinal fica nao_verificado. O antigo ligacaoAxialRT (marca sem número) NÃO libera mais nada. */
      paraleloInternoRT: false, paraleloInternoJustificativa: "",   /* M3.3 (M-N2): o RT declara o diafragma do piso ou a diagonal interna que trava a linha INTERNA no plano da fachada — libera o poste interno (flambagem ∥) */
      capDiagKgf: null,                       /* kgf — carga axial admissível da diagonal/ligação: «não achei» (PESQUISA-MULTI-WEB §2.5) */
      capBaseMultiKgf: null,                  /* kgf — carga admissível da base regulável DO MULTIDIRECIONAL (tabela do fabricante do locador). M3.1 (M4): a tabela do tubo-roll NÃO vale para outro sistema; null = base nao_verificado */
      cunhaContinua: false,                   /* M3.2 (27/10, sessão principal): PADRÃO = RÓTULA. A continuidade da fiada pela cunha não tem fonte pública (PESQUISA-MULTI-WEB: momento da ligação «não achei») → sem fonte, o conservador. Rótula = cada estação vale pelas PRÓPRIAS ancoragens: o Montar inteligente ancora toda estação (10 × 6 m: 42 ancoragens, vão 0,80). true só com cunhaContinuaJustificativa do RT (tabela do fabricante da ligação), como o s3Justificativa / ventoParaleloRT. Texto antigo: M3.1 (ESPEC §1): a fiada de travessas é viga CONTÍNUA entre as estações ancoradas para o vento (como a longitudinal do tubo-roll). Sem fonte da rigidez da cunha: RISCO, o RT confirma. false = rótula em toda estação (cada estação só vale pelas próprias ancoragens) */
      cunhaContinuaJustificativa: ""          /* obrigatória (>= 15 caracteres não brancos) para cunhaContinua valer; aparece no memorial */
    };
  }
  var NUMS_EXTRA = ["capNoKgf", "capLigAxialKgf", "mAdmTravessaKgfm", "cargaAdmPosteKgf", "eCunha", "capDiagKgf", "capBaseMultiKgf"];
  function normalizarM(par, linha) {
    var P = I.normalizar(par), ex = extrasPadrao(linha);
    Object.keys(ex).forEach(function (k) { P[k] = ex[k]; if (par && par[k] !== undefined && par[k] !== "") P[k] = par[k]; });
    NUMS_EXTRA.forEach(function (k) { P[k] = P[k] == null ? null : num(P[k], null); });
    /* M3.3 (C-N1): espigão contínuo só com a justificativa do RT; sem ela volta à rótula e avisa */
    var querRig = P.espigaoRigido === true || P.espigaoRigido === "true", justE = String(P.espigaoJustificativa || "").replace(/\s+/g, "");
    P.espigaoRigido = querRig && justE.length >= 15;
    P._espigaoSemJustificativa = querRig && !P.espigaoRigido;
    /* campos de liberação do RT (M-N2): cada um só vale com a própria justificativa */
    [["espigaoTracaoRT", "espigaoTracaoJustificativa"], ["paraleloInternoRT", "paraleloInternoJustificativa"]].forEach(function (pr) {
      var quer = P[pr[0]] === true || P[pr[0]] === "true", j = String(P[pr[1]] || "").replace(/\s+/g, "");
      P[pr[0]] = quer && j.length >= 15; P["_" + pr[0] + "Sem"] = quer && !P[pr[0]]; P[pr[1]] = String(P[pr[1]] || "").trim();
    });
    /* M3.2: contínua só com a justificativa do RT; sem ela volta à rótula e avisa (nunca contínua "por padrão") */
    var querCont = P.cunhaContinua === true || P.cunhaContinua === "true", just = String(P.cunhaContinuaJustificativa || "").replace(/\s+/g, "");
    P.cunhaContinua = querCont && just.length >= 15;
    P._cunhaSemJustificativa = querCont && !P.cunhaContinua;
    return P;
  }
  /* ================================================================ PENDÊNCIAS DO RT (M4-C, ressalva 7): TODO campo do RT do multi, no formato que a tela do tubo-roll já lê (js/andaimetela.js PENDENCIAS_RT):
   * { campo, rotulo, tipo: "num" | "sel" | "marca", onde: "calc" (par.calc.<campo>) | "par" (par.<campo>), min, max, ops, unid, dica, fonte, confirma (campo booleano de confirmação), justificativa (campo do texto, tipo «marca»),
   *   verificacao (id que o campo libera), opcional (true = decisão do RT, não bloqueia nada se vazia) }. Sem lista fixa na tela: ela renderiza esta lista de forma genérica. */
  var PENDENCIAS_RT_MULTI = [
    { campo: "V0", rotulo: "V0 — velocidade básica do vento (m/s)", tipo: "num", min: 20, max: 60, unid: "m/s", onde: "calc", verificacao: "poste_multi", fonte: "NBR 6123:2023 (isopletas)", dica: "Das isopletas da NBR 6123:2023 pelo local da obra. Sem V0 o vento não entra e o poste, a ancoragem e o tombamento ficam NÃO VERIFICADOS." },
    { campo: "categoria", rotulo: "Categoria de rugosidade do terreno", tipo: "sel", ops: ["I", "II", "III", "IV", "V"], onde: "calc", verificacao: "ancoragem", fonte: "NBR 6123:2023 5.3.1", dica: "Sem informar vale a pior (I) com a pendência visível." },
    { campo: "telaSombreamento", rotulo: "Tela: fração fechada (0,30 a 1,00)", tipo: "num", min: 0.05, max: 1, unid: "", onde: "calc", verificacao: "ancoragem", fonte: "cf/ca da NBR 6123:2023", dica: "1,00 = lona. Sem informar vale 0,75 (pior caso). Só importa com tela." },
    { campo: "faceAte", rotulo: "Face onde ancorar vai até a cota (m)", tipo: "num", min: 0, max: 200, unid: "m", onde: "par", verificacao: "ancoragem", fonte: "", dica: "Até que altura existe estrutura/fachada para ancorar. Vazio = hipótese «face até o topo», que o RT confirma." },
    { campo: "sigmaSolo", rotulo: "Tensão admissível do apoio (kPa)", tipo: "num", min: 1, max: 5000, unid: "kPa", onde: "calc", confirma: "sigmaSoloConfirmado", verificacao: "apoio", fonte: "laudo do solo / da laje", dica: "Do laudo/ensaio do solo ou da laje. O RT informa e confirma." },
    { campo: "capAncoragem", rotulo: "Capacidade da ancoragem (kN)", tipo: "num", min: 0.5, max: 200, unid: "kN", onde: "calc", verificacao: "ancoragem", fonte: "ensaio do chumbador", dica: "O padrão (6,25 kN) é referência estrangeira, não norma." },
    { campo: "capNoKgf", rotulo: "Ligação travessa–roseta (cunha): carga VERTICAL admissível (kgf)", tipo: "num", min: 1, max: 10000, unid: "kgf", onde: "calc", verificacao: "no_cunha", fonte: "tabela do fabricante do locador", dica: "Sem fonte pública. Sem ela a ligação fica NÃO VERIFICADA." },
    { campo: "capLigAxialKgf", rotulo: "Ligação travessa–roseta (cunha): carga AXIAL admissível (kgf)", tipo: "num", min: 1, max: 10000, unid: "kgf", onde: "calc", verificacao: "travessa_long_multi, elo_transversal", fonte: "tabela do fabricante do locador", dica: "Esforço axial da barra na cunha (travessa longitudinal e elo transversal). NÃO é a carga vertical. Sem ela a ligação fica NÃO VERIFICADA." },
    { campo: "capDiagKgf", rotulo: "Diagonal e ligação: carga axial admissível (kgf)", tipo: "num", min: 1, max: 20000, unid: "kgf", onde: "calc", verificacao: "diagonal_multi", fonte: "tabela do fabricante do locador", dica: "Sem fonte pública. O tubo da diagonal é verificado; a ligação fica NÃO VERIFICADA sem este número." },
    { campo: "capBaseMultiKgf", rotulo: "Base regulável: carga admissível (kgf)", tipo: "num", min: 1, max: 20000, unid: "kgf", onde: "calc", verificacao: "base_multi", fonte: "tabela do fabricante do locador", dica: "A tabela do tubo-roll NÃO vale para o multidirecional." },
    { campo: "ventoParaleloRT", rotulo: "Vento paralelo à fachada conferido pelo RT", tipo: "marca", onde: "calc", justificativa: "ventoParaleloJustificativa", verificacao: "vento_paralelo", fonte: "NBR 6123:2023", dica: "O sistema não calcula o arrasto dos pórticos, o atrito na tela e as cabeceiras no plano da fachada. Marque só depois de conferir e escreva a justificativa (mínimo 15 caracteres)." },
    { campo: "espigaoTracaoRT", rotulo: "Espigão (emenda do poste): tração conferida pelo RT", tipo: "marca", onde: "calc", justificativa: "espigaoTracaoJustificativa", verificacao: "espigao", fonte: "tabela do fabricante do locador", dica: "Capacidade do pino trava/espigão à tração: sem fonte pública. Justificativa de no mínimo 15 caracteres." },
    { campo: "paraleloInternoRT", rotulo: "Poste interno: flambagem ∥ conferida pelo RT (diafragma do piso ou diagonal interna)", tipo: "marca", onde: "calc", justificativa: "paraleloInternoJustificativa", verificacao: "poste_multi", fonte: "memória do RT", dica: "A linha interna não tem diagonal no plano dela. O RT declara o diafragma do piso ou a diagonal interna que a trava. Justificativa de no mínimo 15 caracteres." },
    { campo: "cunhaContinua", rotulo: "Fiada de travessas contínua pela cunha (menos ancoragens)", tipo: "marca", onde: "calc", justificativa: "cunhaContinuaJustificativa", opcional: true, verificacao: "ancoragem", fonte: "tabela do fabricante da ligação", dica: "Padrão = cunha rótula (cada estação vale pelas próprias ancoragens). Contínua só com a tabela do fabricante da ligação e a justificativa (mínimo 15 caracteres)." },
    { campo: "espigaoRigido", rotulo: "Espigão contínuo (emenda do poste não é rótula)", tipo: "marca", onde: "calc", justificativa: "espigaoJustificativa", opcional: true, verificacao: "poste_multi", fonte: "tabela do fabricante do poste", dica: "Padrão = espigão rótula. Contínuo só com a rigidez da emenda do fabricante e a justificativa (mínimo 15 caracteres)." }
  ];
  function pendenciasRT() { return PENDENCIAS_RT_MULTI.map(function (d) { var o = {}; Object.keys(d).forEach(function (k) { o[k] = d[k]; }); return o; }); }
  /* estado de cada campo para ESTE cálculo: { ...def, valor, informado, confirmado } (informado = vale de verdade: marca com justificativa >= 15; num presente; sigmaSolo só confirmado) */
  function pendenciasRTEstado(P, modelo) {
    return pendenciasRT().map(function (d) {
      var v = d.onde === "par" ? (modelo && modelo.par ? modelo.par[d.campo] : null) : P[d.campo], inf;
      if (d.tipo === "marca") { v = P[d.campo] === true ? true : null; inf = v === true; d.justificativaTexto = P[d.justificativa] || ""; }
      else inf = v != null && v !== "";
      d.valor = (v == null || v === "") ? null : v; d.informado = inf; d.confirmado = d.confirma ? P[d.confirma] === true : true;
      if (d.confirma && inf && !d.confirmado) d.informado = false;
      return d;
    });
  }
  /* parâmetro degenerado → as verificações que dependem dele ficam nao_verificado (nunca ok) */
  var T_VENTO = ["poste", "guarda_poste", "ancoragem", "diagonal", "espigao", "estabilidade"], T_TODOS = ["piso", "alcapao", "transversal", "no_cunha", "poste", "espigao", "diagonal", "travessa_long", "ancoragem", "guarda", "guarda_poste", "base", "calco", "apoio", "estabilidade", "elo"];
  function invalidosM(P) {
    var l = [];
    I.parametrosInvalidos(P).forEach(function (x) {
      var tipos = [];
      if (x.tipos.length >= 17) tipos = T_TODOS.slice();
      else x.tipos.forEach(function (t) {
        var m = { montante: ["poste", "guarda_poste"], montante_topo: ["poste", "guarda_poste"], montante_guarda: ["guarda_poste"], contencao: ["poste"], travessa: ["travessa_long"], transversal: ["transversal", "no_cunha", "guarda"], guarda: ["guarda"],
          abracadeira: ["ancoragem"], ancoragem: ["ancoragem"], long_horizontal: ["diagonal", "travessa_long"], estabilidade: ["estabilidade"], base: ["base"], calco: ["calco"], apoio: ["apoio"], vento_paralelo: ["vento_paralelo"], prancha: [], prancha_pontual: [] }[t] || [];
        m.forEach(function (z) { if (tipos.indexOf(z) < 0) tipos.push(z); });
      });
      if (x.chave === "categoria" || x.chave === "telaSombreamento" || x.chave === "cfTela" || x.chave === "caTubo") T_VENTO.forEach(function (z) { if (tipos.indexOf(z) < 0) tipos.push(z); });
      if (tipos.length) l.push({ chave: x.chave, motivo: x.motivo, tipos: tipos });
    });
    function add(chave, motivo, tipos) { l.push({ chave: chave, motivo: motivo, tipos: tipos }); }
    if (P.eCunha != null && !(P.eCunha >= 0 && P.eCunha <= 0.2)) add("eCunha", "excentricidade da cabeça da travessa fora de 0 a 0,20 m", ["poste", "guarda_poste"]);
    if (P.capNoKgf != null && !(P.capNoKgf > 0 && P.capNoKgf <= 10000)) add("capNoKgf", "capacidade da ligação fora de 0 a 10 000 kgf", ["no_cunha"]);
    if (P.capLigAxialKgf != null && !(P.capLigAxialKgf > 0 && P.capLigAxialKgf <= 10000)) add("capLigAxialKgf", "capacidade axial da ligação fora de 0 a 10 000 kgf", ["travessa_long", "elo"]);
    if (P.mAdmTravessaKgfm != null && !(P.mAdmTravessaKgfm > 0 && P.mAdmTravessaKgfm <= 1000)) add("mAdmTravessaKgfm", "momento admissível da travessa fora de 0 a 1 000 kgf·m", ["transversal"]);
    if (P.cargaAdmPosteKgf != null && !(P.cargaAdmPosteKgf > 0 && P.cargaAdmPosteKgf <= 20000)) add("cargaAdmPosteKgf", "carga admissível do poste fora de 0 a 20 000 kgf", ["poste"]);
    if (P.capDiagKgf != null && !(P.capDiagKgf > 0 && P.capDiagKgf <= 20000)) add("capDiagKgf", "capacidade da diagonal fora de 0 a 20 000 kgf", ["diagonal"]);
    if (P.capBaseMultiKgf != null && !(P.capBaseMultiKgf > 0 && P.capBaseMultiKgf <= 20000)) add("capBaseMultiKgf", "capacidade da base fora de 0 a 20 000 kgf", ["base"]);
    return l;
  }

  /* ================================================================ PÓRTICO PLANO DA ESTAÇÃO (poste interno I + poste externo O)
   * Dois postes verticais (EI do tubo, contínuos, base articulada no chão) ligados por ELOS RÍGIDOS na horizontal nos nós `links` (as transversais: cunha = rótula, então
   * a rotação NÃO passa). Apoios rígidos só no poste interno (`rigI`: ancoragens) e molas `molasI`/`molasO` (as LONGITUDINAIS das linhas interna e externa entre as estações ancoradas, M3.1). `molasLamI`/`molasLamO` entram SÓ no
 * autovalor (contenção por flambagem: pórtico transversal diagonalizado, força nodal de 1 %) e NUNCA na solução do vento (C1 da revisão nº 1). Cargas horizontais (vento, 90 kgf/m
   * do guarda-corpo) são positivas no sentido +n. Devolve, por caso, o momento (|M|) de cada poste por nó, as reações (base e ancoragens) e `instavel` (mecanismo).
   * Com Nfun = [N_I(y), N_O(y)] (compressão, kN) devolve também λ: menor autovalor de (K − λ·Kg) — a carga crítica do conjunto é λ·N em cada poste. */
  function porteEstacao(cfg, casos, Nfun) {
    var EI = cfg.EI, h = cfg.h || 0.25, kL = cfg.kLink, topos = [cfg.topI, cfg.topO], ys = [0, cfg.topI, cfg.topO], i, j, e, p, c;
    arr(cfg.links).forEach(function (y) { ys.push(y); }); arr(cfg.rigI).forEach(function (y) { ys.push(y); }); arr(cfg.molasI).forEach(function (m) { ys.push(m.y); }); arr(cfg.molasO).forEach(function (m) { ys.push(m.y); }); arr(cfg.molasLamI).forEach(function (m) { ys.push(m.y); }); arr(cfg.molasLamO).forEach(function (m) { ys.push(m.y); });
    arr(cfg.hingesI).forEach(function (y) { ys.push(y); }); arr(cfg.hingesO).forEach(function (y) { ys.push(y); });
    casos.forEach(function (cs) {
      ["wI", "wO"].forEach(function (k) { arr(cs[k]).forEach(function (sg) { ys.push(sg.y0); ys.push(sg.y1); }); });
      ["ptI", "ptO"].forEach(function (k) { arr(cs[k]).forEach(function (q) { ys.push(q.y); }); });
    });
    var yt = Math.max(topos[0], topos[1]);
    for (var y = h; y < yt - 1e-9; y += h) ys.push(y);
    ys = ys.filter(function (v) { return v >= -1e-9 && v <= yt + 1e-9; }).sort(function (a, b) { return a - b; });
    var Y = []; ys.forEach(function (v) { if (!Y.length || v - Y[Y.length - 1] > 1e-6) Y.push(Math.max(0, v)); });
    var nodes = [Y.filter(function (v) { return v <= topos[0] + 1e-7; }), Y.filter(function (v) { return v <= topos[1] + 1e-7; })];
    var off = [0, 2 * nodes[0].length], N = 2 * (nodes[0].length + nodes[1].length);
    /* M3.3 (C-N1): ESPIGÃO = RÓTULA por padrão. No nó da emenda o deslocamento v é do nó (os dois trechos do poste continuam ligados) mas a ROTAÇÃO do trecho de cima é um grau de liberdade
       a mais (índice >= N): o momento não passa pela emenda. Sem emenda no poste, nenhum grau a mais (o resultado é o do poste contínuo). */
    var hdof = {}, NT = N;
    [arr(cfg.hingesI), arr(cfg.hingesO)].forEach(function (hl, pp) {
      nodes[pp].forEach(function (yv, q) { if (q > 0 && q < nodes[pp].length - 1 && hl.some(function (hy) { return Math.abs(hy - yv) < 1e-6; })) hdof[pp + "|" + q] = NT++; });
    });
    function idx(pp, yy) { var b = 0, bd = Infinity; for (var q = 0; q < nodes[pp].length; q++) { var dd = Math.abs(nodes[pp][q] - yy); if (dd < bd) { bd = dd; b = q; } } return b; }
    var K = [], Kg = []; for (i = 0; i < NT; i++) { K.push(new Array(NT)); Kg.push(new Array(NT)); for (j = 0; j < NT; j++) { K[i][j] = 0; Kg[i][j] = 0; } }
    var els = [];
    for (p = 0; p < 2; p++) for (e = 0; e + 1 < nodes[p].length; e++) {
      var L = nodes[p][e + 1] - nodes[p][e], k0 = EI / (L * L * L), kk = [[12, 6 * L, -12, 6 * L], [6 * L, 4 * L * L, -6 * L, 2 * L * L], [-12, -6 * L, 12, -6 * L], [6 * L, 2 * L * L, -6 * L, 4 * L * L]];
      var d = [off[p] + 2 * e, off[p] + 2 * e + 1, off[p] + 2 * e + 2, off[p] + 2 * e + 3];
      if (hdof[p + "|" + e] != null) d[1] = hdof[p + "|" + e];   /* o trecho de cima da emenda tem rotação própria */
      for (i = 0; i < 4; i++) for (j = 0; j < 4; j++) K[d[i]][d[j]] += k0 * kk[i][j];
      if (Nfun) {
        var Nm = Nfun[p]((nodes[p][e] + nodes[p][e + 1]) / 2), g0 = Nm / (30 * L), kg = [[36, 3 * L, -36, 3 * L], [3 * L, 4 * L * L, -3 * L, -L * L], [-36, -3 * L, 36, -3 * L], [3 * L, -L * L, -3 * L, 4 * L * L]];
        for (i = 0; i < 4; i++) for (j = 0; j < 4; j++) Kg[d[i]][d[j]] += g0 * kg[i][j];
      }
      els.push({ p: p, e: e, L: L, k0: k0, kk: kk, d: d, ym: (nodes[p][e] + nodes[p][e + 1]) / 2 });
    }
    arr(cfg.links).forEach(function (yy) {
      if (yy > topos[0] + 1e-7 || yy > topos[1] + 1e-7) return;
      var a = off[0] + 2 * idx(0, yy), b = off[1] + 2 * idx(1, yy);
      K[a][a] += kL; K[b][b] += kL; K[a][b] -= kL; K[b][a] -= kL;
    });
    arr(cfg.molasI).forEach(function (m) { var a = off[0] + 2 * idx(0, m.y); K[a][a] += m.k; });
    arr(cfg.molasO).forEach(function (m) { var a = off[1] + 2 * idx(1, m.y); K[a][a] += m.k; });
    var KX = null;   /* rigidez só do autovalor (contenção): não entra na solução estática */
    if (arr(cfg.molasLamI).length || arr(cfg.molasLamO).length) { KX = []; for (i = 0; i < NT; i++) { KX.push(new Array(NT)); for (j = 0; j < NT; j++) KX[i][j] = 0; } arr(cfg.molasLamI).forEach(function (m) { var a = off[0] + 2 * idx(0, m.y); KX[a][a] += m.k; }); arr(cfg.molasLamO).forEach(function (m) { var a = off[1] + 2 * idx(1, m.y); KX[a][a] += m.k; }); }
    var reg = 1e-9 * EI; for (i = 0; i < N; i++) if (i % 2 === 1 || (i >= off[1] && (i - off[1]) % 2 === 1)) K[i][i] += reg;
    for (i = N; i < NT; i++) K[i][i] += reg;
    var fixos = [off[0], off[1]].concat(arr(cfg.rigI).map(function (yy) { return off[0] + 2 * idx(0, yy); }));
    var Fs = [], Feq = [], WEL = [];
    casos.forEach(function (cs) {
      var F = new Array(NT), fe = [], wEl = []; for (i = 0; i < NT; i++) F[i] = 0;
      els.forEach(function (el) {
        var w = 0; arr(el.p === 0 ? cs.wI : cs.wO).forEach(function (sg) { if (el.ym >= sg.y0 - 1e-9 && el.ym <= sg.y1 + 1e-9) w += sg.w; });
        var f = [w * el.L / 2, w * el.L * el.L / 12, w * el.L / 2, -w * el.L * el.L / 12];
        for (i = 0; i < 4; i++) F[el.d[i]] += f[i];
        fe.push(f); wEl.push(w);
      });
      [[cs.ptI, 0], [cs.ptO, 1]].forEach(function (pr) { arr(pr[0]).forEach(function (q) { F[off[pr[1]] + 2 * idx(pr[1], q.y)] += q.P; }); });
      Fs.push(F); Feq.push(fe); WEL.push(wEl);
    });
    var Kc = K.map(function (r) { return r.slice(); }), B = [];
    for (i = 0; i < NT; i++) B.push(Fs.map(function (F) { return F[i]; }));
    fixos.forEach(function (dd) { for (j = 0; j < NT; j++) { Kc[dd][j] = 0; Kc[j][dd] = 0; } Kc[dd][dd] = 1; B[dd] = Fs.map(function () { return 0; }); });
    var U = I.resolverSistema(Kc, B);
    var res = casos.map(function (cs, ci) {
      var u = U.map(function (r) { return r[ci]; }), M = [new Array(nodes[0].length), new Array(nodes[1].length)], vmax = 0, v = [[], []];
      var Mlo = [new Array(nodes[0].length), new Array(nodes[1].length)], Mhi = [new Array(nodes[0].length), new Array(nodes[1].length)];   /* M4-C (M-N4): momento COM SINAL (convenção do solver) logo acima (Mlo) e logo abaixo (Mhi) de cada nó — para o Cm do trecho */
      for (i = 0; i < N; i++) if (i % 2 === 0) vmax = Math.max(vmax, Math.abs(u[i]));
      for (p = 0; p < 2; p++) for (i = 0; i < nodes[p].length; i++) v[p][i] = u[off[p] + 2 * i];
      var intF = new Array(NT); for (i = 0; i < NT; i++) intF[i] = 0;   /* Σ das forças de rigidez dos elementos em cada grau (para a força dos ELOS por equilíbrio do nó, sem a diferença de dois deslocamentos quase iguais) */
      els.forEach(function (el, ke) {
        var ue = el.d.map(function (dd) { return u[dd]; }), f = [];
        for (i = 0; i < 4; i++) { var s = 0; for (j = 0; j < 4; j++) s += el.k0 * el.kk[i][j] * ue[j]; intF[el.d[i]] += s; f.push(s - Feq[ci][ke][i]); }
        var Ma = -f[1], Mb = f[3], w = WEL[ci][ke];
        Mlo[el.p][el.e] = Ma; Mhi[el.p][el.e + 1] = Mb;
        M[el.p][el.e] = Math.max(M[el.p][el.e] || 0, Math.abs(Ma));
        M[el.p][el.e + 1] = Math.max(M[el.p][el.e + 1] || 0, Math.abs(Mb));
        /* o máximo de um vão com carga uniforme cai ENTRE os nós: M(t) é uma parábola (M'' = −w na convenção do solver) — o extremo entra nos dois nós do elemento (não subestima o momento) */
        if (Math.abs(w) > 1e-12) {
          var cM = -w, tx = 0.5 + (Mb - Ma) / (cM * el.L * el.L);   /* convenção do solver: carga + em +v dá M'' = −w */
          if (tx > 0 && tx < 1) { var Mx = Math.abs(Ma * (1 - tx) + Mb * tx + cM * el.L * el.L * tx * (1 - tx) / 2); M[el.p][el.e] = Math.max(M[el.p][el.e], Mx); M[el.p][el.e + 1] = Math.max(M[el.p][el.e + 1], Mx); }
        }
      });
      var Rr = fixos.map(function (dd) { var s = 0; for (var q = 0; q < NT; q++) s += K[dd][q] * u[q]; return s - Fs[ci][dd]; });
      var anc = arr(cfg.rigI).map(function (yy, ia) { return { y: yy, R: Math.abs(Rr[2 + ia]) }; });
      var somaAss = 0; Rr.forEach(function (x) { somaAss += x; });
      var Rm = { I: [], O: [] };   /* reação das molas = carga que a LONGITUDINAL da linha recebe da estação (kN, + no sentido do vento) */
      arr(cfg.molasI).forEach(function (m) { var f1 = m.k * u[off[0] + 2 * idx(0, m.y)]; somaAss -= f1; Rm.I.push({ y: m.y, R: f1 }); });   /* a mola (longitudinal) também é apoio */
      arr(cfg.molasO).forEach(function (m) { var f2 = m.k * u[off[1] + 2 * idx(1, m.y)]; somaAss -= f2; Rm.O.push({ y: m.y, R: f2 }); });
      /* M3.3 (M-N3): força AXIAL de cada elo (a transversal que leva o vento do poste externo ao interno): equilíbrio do nó do poste EXTERNO — carga aplicada − rigidez dos elementos − molas do nó. + = no sentido do vento. */
      var elos = [];
      arr(cfg.links).forEach(function (yy) {
        if (yy > topos[0] + 1e-7 || yy > topos[1] + 1e-7) return;
        var aO = off[1] + 2 * idx(1, yy), mk2 = 0; arr(cfg.molasO).forEach(function (m) { if (off[1] + 2 * idx(1, m.y) === aO) mk2 += m.k; });
        elos.push({ y: yy, F: Fs[ci][aO] - intF[aO] - mk2 * u[aO] });
      });
      return { M: M, v: v, base: [Math.abs(Rr[0]), Math.abs(Rr[1])], anc: anc, Rm: Rm, somaAssinada: somaAss, instavel: !(vmax < 100), vmax: vmax, elos: elos, Mlo: Mlo, Mhi: Mhi };
    });
    var lam = null;
    if (Nfun) {
      if (res.length && res[0].instavel) lam = 0;
      else {
        var livres = []; for (i = 0; i < NT; i++) if (fixos.indexOf(i) < 0) livres.push(i);
        var m2 = livres.length, Kr = [], Gr = [];
        for (i = 0; i < m2; i++) { Kr.push(new Array(m2)); Gr.push(new Array(m2)); for (j = 0; j < m2; j++) { Kr[i][j] = K[livres[i]][livres[j]] + (KX ? KX[livres[i]][livres[j]] : 0); Gr[i][j] = Kg[livres[i]][livres[j]]; } }
        var F2 = I.luFatorar(Kr.map(function (r) { return r.slice(); })), vv = []; for (i = 0; i < m2; i++) vv.push(1 + 0.37 * Math.sin(1.7 * i + 0.3));
        var ant = 0; lam = Infinity;
        var mul = function (A, x) { var o = new Array(m2), s0, q; for (var a = 0; a < m2; a++) { s0 = 0; for (q = 0; q < m2; q++) s0 += A[a][q] * x[q]; o[a] = s0; } return o; };
        for (var it = 0; it < 200; it++) {
          var gv = mul(Gr, vv), z = I.luResolver(F2, gv), nz = 0; for (i = 0; i < m2; i++) nz += z[i] * z[i]; nz = Math.sqrt(nz);
          if (!(nz > 1e-300)) { lam = Infinity; break; }
          for (i = 0; i < m2; i++) vv[i] = z[i] / nz;
          var kv = mul(Kr, vv), gv2 = mul(Gr, vv), a1 = 0, a2 = 0; for (i = 0; i < m2; i++) { a1 += vv[i] * kv[i]; a2 += vv[i] * gv2[i]; }
          if (!(a2 > 1e-300)) { lam = Infinity; break; }
          lam = a1 / a2; if (it > 3 && Math.abs(lam - ant) < 1e-10 * Math.abs(lam)) break; ant = lam;
        }
      }
    }
    return { Y: Y, nodes: nodes, res: res, lambda: lam };
  }

  /* ================================================================ O CÁLCULO */
  function calcular(modelo, par, opt, II) {
    I = II; opt = opt || {};
    var AM = AMu(), A = I.AN(), d88 = I.D88(), SC = I.SEC(), PA = I.PAC();
    var linhaId = modelo && modelo.linha ? modelo.linha : (modelo && modelo.par && modelo.par.linha) || "roseta", est = linhaId === "estribo";
    var P = normalizarM(par, linhaId), GRAV = I.GRAV, KGF = I.KGF_POR_KN, kgf = I.kgf, kN = I.kN, nkn = I.nkn, estadoDe = I.estadoDe, piorEstado = I.piorEstado, ORD = I.ORDEM_ESTADO;
    var out = { ok: false, sistema: "multidirecional", linha: linhaId, verificacoes: [], reacoes: [], montantes: [], caminho: { transversais: [], longitudinais: [] }, naoVerificado: [], ressalvas: [], avisos: [], resumo: "", parametros: P, vento: null, parametrosInvalidos: [], pendencias: [] };
    if (!modelo || !modelo.ok) { out.erro = "Sem modelo de andaime montado."; out.resumo = out.erro; return out; }
    if (!(P.qServ > 0)) { out.erro = "qServ deve ser maior que zero."; out.resumo = out.erro; return out; }
    out.parametrosInvalidos = invalidosM(P);
    if (par && (par.ligacaoAxialRT === true || par.ligacaoAxialRT === "true")) out.avisos.push("ligacaoAxialRT (marca sem número) não libera mais nada: informe a capacidade AXIAL da ligação travessa–roseta em capLigAxialKgf (tabela do fabricante do locador).");
    var perfil = null; try { perfil = PA && PA.obter ? PA.obter(modelo.par.tubo) : null; } catch (e0) { perfil = null; }
    var s = perfil && SC ? SC.dePerfil(perfil, perfil.forma || "tubo-circ") : null;
    if (!s || !d88 || !AM) { out.erro = "Seção do tubo (" + (modelo.par && modelo.par.tubo) + "), NBR 8800 ou o catálogo do multidirecional indisponível."; out.resumo = out.erro; return out; }
    var naoV = out.naoVerificado, ress = out.ressalvas;
    [["_espigaoSemJustificativa", "Espigão contínuo (espigaoRigido) pedido SEM justificativa do RT (mínimo 15 caracteres): calculado com o espigão como RÓTULA."], ["_espigaoTracaoRTSem", "espigaoTracaoRT sem justificativa (mínimo 15 caracteres): não vale — o espigão segue NÃO VERIFICADO."], ["_paraleloInternoRTSem", "paraleloInternoRT sem justificativa (mínimo 15 caracteres): não vale — o poste interno segue NÃO VERIFICADO."]].forEach(function (x) { if (P[x[0]]) out.avisos.push(x[1]); });
    out.parametrosInvalidos.forEach(function (x) { out.avisos.push("Parâmetro «" + x.chave + "» inválido: " + x.motivo + " — as verificações que dependem dele ficam NÃO VERIFICADAS."); });

    /* ---------- resistências do tubo (NBR 8800 — as mesmas rotinas do tubo-roll) */
    var E = 200000, G = 77000, fyOk = P.fy > 0 ? P.fy : 235, aco = { id: "tubo", fy: fyOk, fu: Math.max(P.fu, fyOk) };
    var MRd = d88.flexao(s, aco, E, G, 1, 1, "x").MRd, My = s.Wx * fyOk / 1e6, EI = E * 1e3 * s.Ix * 1e-12, wTubo = 3.70 * GRAV / 1000;   /* 3,70 kg/m: o da lista de locação (R1) */
    var cacheN = {};
    function NRdDe(KL) { var k = brf(KL, 4); if (!cacheN[k]) cacheN[k] = d88.compressao(s, aco, E, G, { Lx: KL, Ly: KL, Lz: KL }, "pilar"); return cacheN[k]; }
    var L = AM.linhaDe(linhaId), S = L.pecas, achar = AM.achar;

    /* ---------- estrutura do modelo */
    var M = modelo.medidas, niv = modelo.niveis, nL = niv.length - 1, W = M.largura, postes = modelo.postes, barras = modelo.barras;
    var barrasPorId = {}; barras.forEach(function (b) { barrasPorId[b.id] = b; });
    function posteEm(x, z) { var best = null, bd = 0.05; postes.forEach(function (q) { var dd = hyp(q.x - x, q.z - z); if (dd < bd) { bd = dd; best = q.key; } }); return best; }
    var postePorKey = {}; postes.forEach(function (q) { postePorKey[q.key] = q; });
    var temTela = !!(modelo.par && modelo.par.tela), guardaH = M.guardaReal || 1.0, semAnc = !modelo.ancoragens.length;
    var topoY = 0; barras.forEach(function (b) { topoY = Math.max(topoY, b.a[1], b.b[1]); }); modelo.pranchas.forEach(function (x) { topoY = Math.max(topoY, x.yTopo || 0); });
    var pisoLv = niv.filter(function (n) { return n.k >= 1 && n.piso; }).map(function (n) { return n.k; }).sort(function (a, b) { return b - a; });
    var fPiso = {}, modoP = String(P.pisosCarregados || "topo+50").toLowerCase();
    pisoLv.forEach(function (k, i) { fPiso[k] = modoP === "todos" ? 1 : (i === 0 ? 1 : (i === 1 && modoP !== "topo" ? 0.5 : 0)); });
    function fK(k) { return fPiso[k] || 0; }
    function nivelDe(y) { var b = 0, bd = Infinity; for (var j = 0; j <= nL; j++) { var dd = Math.abs(niv[j].y - y); if (dd < bd - 1e-9) { bd = dd; b = j; } } return b; }
    function yTopoPoste(key) { var y = 0; barras.forEach(function (b) { if (b.papel === "poste" && b.poste === key) y = Math.max(y, b.a[1], b.b[1]); }); return y; }
    var nodePost = {}, estPorId = {};
    modelo.estacoes.forEach(function (e) { nodePost[e.I] = posteEm(e.pi[0], e.pi[1]); nodePost[e.O] = posteEm(e.pe[0], e.pe[1]); estPorId[e.id] = e; });
    var celById = {}; modelo.celulas.forEach(function (c) { celById[c.id] = c; });

    /* ---------- pesos de catálogo (M02 p.6). Sem peso de fonte (estribo) → peso = 0 / tubo e a verificação NUNCA fica ok */
    var semPeso = {};
    function pesoKg(item, nome) { if (item && item.pesoKg != null) return item.pesoKg; if (nome) semPeso[nome] = true; return null; }
    function itemBarra(b) {
      if (b.papel === "poste") return achar(S.poste, "L", b.L);
      if (b.papel === "travessa" || b.papel === "transversal" || b.papel === "guarda" || b.papel === "intermediaria") return achar(S.travessa, "vao", b.L);
      if (b.papel === "diagonal" || b.papel === "diagonalTransv") { var r = null; S.diagonal.forEach(function (q) { if (q.cod && q.cod === b.codCat) r = q; }); return r; }
      if (b.papel === "ancoragem") return b.cod === "ganchoCurto" ? S.ganchoCurto : (b.cod === "ganchoLongo" ? S.ganchoLongo : null);
      return null;
    }
    function pesoBarra(b) {   /* kN */
      var it = itemBarra(b);
      if (b.papel === "ancoragem" && b.cod === "tubo") return 3.70 * b.L * GRAV / 1000;   /* tubo de amarração: 3,70 kg/m da lista de locação (R1) */
      var kg = pesoKg(it, b.papel);
      if (kg == null) kg = 3.70 * b.L;   /* sem peso: tubo da lista de locação (subestima: a verificação não fica ok) */
      return kg * GRAV / 1000;
    }
    function pesoPiso(pr) {   /* kN */
      var it = null;
      if (pr.tipo === "alcapao") { it = S.pisoAlcapao.length === 1 ? S.pisoAlcapao[0] : null; if (!it) S.pisoAlcapao.forEach(function (q) { if (Math.abs(q.medidas.L - pr.L) < 1e-6) it = q; }); }
      else it = L.motor.pisoModo === "n32" ? achar(S.piso, "L", pr.L) : (function () { var r = null; S.piso.forEach(function (q) { if (Math.abs(q.medidas.larg - pr.larg) < 1e-6 && Math.abs(q.medidas.L - pr.L) < 1e-6) r = q; }); return r; })();
      var kg = pesoKg(it, "piso"); return { item: it, kN: kg == null ? 0 : kg * GRAV / 1000 };
    }

    /* ---------- vento (entradas como no tubo-roll: o que falta vira o PIOR CASO com a pendência visível) */
    var catEf = P.categoria || "I", phiTela = P.telaSombreamento != null ? P.telaSombreamento : 0.75, s3Reduzido = P.s3Temporaria && P.s3Justificativa.length > 0, grupoEf = s3Reduzido ? 5 : 3;
    var cfTelaEf = P.cfTela != null && P.cfTela > 0 ? P.cfTela : I.cfTelaDeFi(phiTela);
    if (P.categoria == null || (temTela && P.telaSombreamento == null && P.cfTela == null)) out.pendencias.push("categoria/tela não informadas — usando o pior caso (categoria " + catEf + ", sombreamento da tela " + brf(phiTela, 2) + ", cf " + brf(cfTelaEf, 2) + "); informe para um andaime mais leve.");
    if (s3Reduzido) out.pendencias.push("S3 = 0,83 (NBR 6123:2023 Tabela 4, grupo 5) por decisão do responsável técnico — justificativa: " + P.s3Justificativa);
    else if (P.s3Temporaria) out.pendencias.push("S3 = 1,00 mantido: s3Temporaria sem justificativa do RT não vale (o 0,83 exige justificativa escrita).");
    arr(modelo.pendencias).forEach(function (t) { out.pendencias.push(t); });
    var vt = I.ventoDe(P, catEf, grupoEf); out.vento = vt;
    function qAt(z) { return vt.ok ? vt.qDe(z) : 0; }
    var solidez = (function () {   /* solidez dos tubos da fachada (postes, travessas da fiada, guarda-corpo, diagonais) sobre a área da fachada */
      var soma = 0, Dm = modelo.tubo.D, comp = 0; modelo.trechos.forEach(function (t) { comp += t.L; });
      barras.forEach(function (b) { if (/^(poste|travessa|guarda|intermediaria|diagonal)$/.test(b.papel)) soma += Dm * b.L; });
      var Af = comp * Math.max(topoY, 0.5); return clamp(Af > 0 ? soma / Af : 1, 0, 1);
    })();
    var yTelaIni = pisoLv.length ? niv[pisoLv[pisoLv.length - 1]].yPiso : 0, yTelaFim = M.alturaPiso + 2.0;
    var faixasGuarda = pisoLv.map(function (k) { return [niv[k].yPiso, niv[k].yPiso + guardaH]; });
    function cfCamada(y) {
      if (temTela && y >= yTelaIni && y <= yTelaFim) return cfTelaEf;
      for (var q = 0; q < faixasGuarda.length; q++) if (y >= faixasGuarda[q][0] && y <= faixasGuarda[q][1]) return cfTelaEf;
      return P.caTubo * solidez;
    }
    function ventoFaixa(ylo, yhi) {
      var n = Math.max(1, Math.ceil((yhi - ylo) / 0.25)), dy = (yhi - ylo) / n, f = 0, mo = 0;
      for (var i = 0; i < n; i++) { var y = ylo + (i + 0.5) * dy, w = qAt(y) * cfCamada(y) * dy; f += w; mo += w * y; }
      return { f: f, m: mo };
    }

    /* ---------- verificações: construtores (mesmo formato do tubo-roll) */
    var verifs = [];
    function nova(id, tipo, titulo, fonte) { var v = { id: id, tipo: tipo, pecas: [], titulo: titulo, formula: "", valores: {}, texto: "", solicitante: "", resistente: "", uso: null, estado: "nao_verificado", fonte: fonte, confirmarRT: [], ressalvas: [], porPeca: {}, corrigir: [] }; verifs.push(v); return v; }
    function peca(v, id, uso, estado) { if (!v.porPeca[id]) v.pecas.push(id); var o = v.porPeca[id]; if (!o) v.porPeca[id] = { uso: uso, estado: estado || estadoDe(uso) }; else { if (uso != null && (o.uso == null || uso > o.uso)) o.uso = uso; o.estado = piorEstado(o.estado, estado || estadoDe(uso)); } }
    function fecha(v) {
      var u = null, e = "ok", ids = Object.keys(v.porPeca);
      if (!ids.length) { v.estado = "nao_verificado"; return v; }
      ids.forEach(function (id) { var o = v.porPeca[id]; if (o.uso != null && (u == null || o.uso > u)) u = o.uso; e = piorEstado(e, o.estado); });
      v.uso = u; v.estado = e === "ok" && u == null ? "nao_verificado" : e;
      return v;
    }
    /* o estado de uma peça que NÃO pode ficar «ok» por falta de dado: falha continua falha; atenção continua atenção; ok vira nao_verificado */
    function semOk(uso, motivoNV) { var e = estadoDe(uso); return e === "ok" || e === "nao_verificado" ? "nao_verificado" : e; }

    /* ============ 1. CAMINHO DE CARGA DO PISO: pisos → transversais (viga biapoiada, cunha = rótula) → reação nos postes */
    var barIdx = {};   /* nivel|chaveA|chaveB → barra (travessa ou transversal entre dois postes) */
    barras.forEach(function (b) {
      if ((b.papel !== "transversal" && b.papel !== "travessa") || b.topo) return;   /* as barras do topo (M3.1) não recebem piso */
      var kA = posteEm(b.a[0], b.a[2]), kB = posteEm(b.b[0], b.b[2]); if (!kA || !kB || kA === kB) return;
      barIdx[b.nivel + "|" + (kA < kB ? kA + "|" + kB : kB + "|" + kA)] = b;
    });
    function barraEntre(k, kA, kB) { return barIdx[k + "|" + (kA < kB ? kA + "|" + kB : kB + "|" + kA)] || null; }
    var carga = {};   /* barId → { b, k, ptsG, ptsQ, segG, segQ } */
    var pisoInfo = {};   /* idPrancha → { pr, item, kg, cap, ... } */
    var semBarra = [];
    function cargaDe(b) { if (!carga[b.id]) carga[b.id] = { b: b, k: b.nivel, ptsG: [], ptsQ: [], segG: [], segQ: [] }; return carga[b.id]; }
    modelo.pranchas.forEach(function (pr) {
      var c = celById[pr.celula], k = pr.nivel; if (!c) return;
      var pp = pesoPiso(pr), q = P.qServ, Qend = q * pr.larg * pr.L / 2, Gend = pp.kN / 2;
      pisoInfo[pr.id] = { pr: pr, item: pp.item, pesoKN: pp.kN };
      [[c.nos[0], c.nos[3], pr.a], [c.nos[1], c.nos[2], pr.b]].forEach(function (ed) {
        var kA = nodePost[ed[0]], kB = nodePost[ed[1]], bar = kA && kB ? barraEntre(k, kA, kB) : null;
        if (!bar) { if (semBarra.indexOf(pr.id) < 0) semBarra.push(pr.id); return; }
        var Lb = hyp(bar.b[0] - bar.a[0], bar.b[2] - bar.a[2]) || 1, dx = (bar.b[0] - bar.a[0]) / Lb, dz = (bar.b[2] - bar.a[2]) / Lb;
        var x = clamp((ed[2][0] - bar.a[0]) * dx + (ed[2][2] - bar.a[2]) * dz, 0, Lb), cg = cargaDe(bar);
        if (pr.tipo === "alcapao") { var x0 = clamp(x - pr.larg / 2, 0, Lb), x1 = clamp(x + pr.larg / 2, 0, Lb); cg.segG.push({ x0: x0, x1: x1, w: Gend / pr.larg }); cg.segQ.push({ x0: x0, x1: x1, w: Qend / pr.larg }); }
        else { cg.ptsG.push({ x: x, P: Gend }); cg.ptsQ.push({ x: x, P: Qend }); }
      });
    });
    /* cada barra que recebe piso ou é transversal: viga biapoiada (vão = comprimento da barra = distância entre eixos dos postes) */
    var vigasT = {};
    barras.forEach(function (b) {
      if (!(carga[b.id] || b.papel === "transversal")) return;
      var cg = cargaDe(b), Lb = b.L, wb = pesoBarra(b) / Lb;
      var casos = [{ w: wb, pts: cg.ptsG, wSeg: cg.segG }, { pts: cg.ptsQ, wSeg: cg.segQ }];
      var r = I.viga({ x0: 0, x1: Lb, apoios: [0, Lb], EI: EI, h: 0.1 }, casos);
      var Mel = 0, Mserv = 0, dmax = 0; for (var i = 0; i < r[0].X.length; i++) { Mel = Math.max(Mel, Math.abs(1.25 * r[0].M[i] + 1.5 * r[1].M[i])); Mserv = Math.max(Mserv, Math.abs(r[0].M[i] + r[1].M[i])); dmax = Math.max(dmax, Math.abs(r[0].v[i] + r[1].v[i])); }
      vigasT[b.id] = { b: b, cg: cg, r: r, Md: Mel, Ms: Mserv, delta: dmax, RG: r[0].R, RQ: r[1].R, L: Lb, wb: wb };
    });

    /* ---------- reações G e Q (serviço) por nível e por poste; o Q é o qServ INTEIRO aqui e vai escalado por fK(nível) quando acumula no poste */
    var RGc = [], RQc = []; for (var jr = 0; jr <= nL; jr++) { RGc.push({}); RQc.push({}); }
    function addR(tab, j, key, v) { if (key == null) return; tab[j][key] = (tab[j][key] || 0) + v; }
    function RG(j, key) { return j < 0 ? 0 : (RGc[j][key] || 0); }
    function RQ(j, key) { return j < 0 ? 0 : fK(j) * (RQc[j][key] || 0); }
    Object.keys(vigasT).forEach(function (id) {
      var vg = vigasT[id], b = vg.b, kA = posteEm(b.a[0], b.a[2]), kB = posteEm(b.b[0], b.b[2]);
      addR(RGc, b.nivel, kA, vg.RG[0]); addR(RGc, b.nivel, kB, vg.RG[1]); addR(RQc, b.nivel, kA, vg.RQ[0]); addR(RQc, b.nivel, kB, vg.RQ[1]);
    });
    barras.forEach(function (b) {   /* demais barras: metade do peso em cada ponta, no nível mais próximo */
      if (b.papel === "poste" || b.papel === "transversal" || vigasT[b.id]) return;
      var w = pesoBarra(b), j = (b.papel === "travessa" || b.papel === "guarda" || b.papel === "intermediaria") && b.nivel != null ? b.nivel : nivelDe((b.a[1] + b.b[1]) / 2);
      addR(RGc, j, posteEm(b.a[0], b.a[2]), w / 2); addR(RGc, j, posteEm(b.b[0], b.b[2]), w / 2);
    });
    modelo.rodapes.forEach(function (x) { var kg = pesoKg(achar(S.rodape, "L", x.L), "rodape"); if (kg == null) return; var w = kg * GRAV / 1000; addR(RGc, clamp(x.nivel, 0, nL), posteEm(x.a[0], x.a[2]), w / 2); addR(RGc, clamp(x.nivel, 0, nL), posteEm(x.b[0], x.b[2]), w / 2); });
    var proprio = {}; postes.forEach(function (q) { proprio[q.key] = { barras: [], pontos: [] }; });
    barras.forEach(function (b) { if (b.papel === "poste" && b.poste && proprio[b.poste]) proprio[b.poste].barras.push({ y0: Math.min(b.a[1], b.b[1]), y1: Math.max(b.a[1], b.b[1]), w: pesoBarra(b) / b.L }); });
    modelo.conexoes.forEach(function (c) {
      if (c.tipo !== "espigao") return;
      var b0 = barrasPorId[c.barras[0]]; if (!b0 || !proprio[b0.poste]) return;
      var kg = pesoKg(S.emenda, "pino"); if (kg != null) proprio[b0.poste].pontos.push({ y: c.pos[1], w: kg * GRAV / 1000 });
    });
    function proprioAcima(key, y) { var t = 0, pp = proprio[key]; if (!pp) return 0; pp.barras.forEach(function (b) { t += Math.max(0, b.y1 - Math.max(y, b.y0)) * b.w; }); pp.pontos.forEach(function (q) { if (q.y >= y - 1e-9) t += q.w; }); return t; }
    function NProf(key, y, gG, gQ) { var N = gG * proprioAcima(key, y); for (var j = 0; j <= nL; j++) if (niv[j].y > y + 1e-9) N += gG * RG(j, key) + gQ * RQ(j, key); return N; }
    var faltaPesoG = function () { return Object.keys(semPeso).length > 0; };
    var pesoBaseKN = {}; (function () { var kb = pesoKg(S.baseRegulavel, "base"), kp = pesoKg(S.pecaBase, "pecaBase"); modelo.bases.forEach(function (bs) { pesoBaseKN[bs.poste] = ((kb || 0) + (kp || 0)) * GRAV / 1000; }); })();

    /* ============ 2. PISO METÁLICO (tabela de carga do fabricante, M02 p.18) — compara com SERVIÇO */
    (function () {
      var v = nova("piso_multi", "piso", "Piso metálico: carga admissível do fabricante por comprimento", "M02 p.18 tab. 01 (primária do PEMAX): 600 kgf/m² até 2,14 m · 450 até 2,48 · 300 até 3,14; 300 kgf em 0,5 m²; ADMISSÍVEL (compara com serviço, sem γ)");
      v.confirmarRT = ["o piso do locador = esta tabela (PEMAX, M02 p.18)", "carga concentrada: 1,5 kN em 0,5 × 0,5 m (EN 12811-1 classe 3, secundária) contra os 300 kgf em 0,5 m² do M02"];
      var va = nova("alcapao_multi", "alcapao", "Piso com alçapão e escada: carga admissível", "M02 p.6 e p.18: a tabela de carga é do piso comum; o alçapão (PI07) não tem carga na fonte");
      var gov = null, govP = null, nSem = 0, pontualKgf = 0;
      arr(P.pontuais).forEach(function (pt) { pontualKgf = Math.max(pontualKgf, pt.P * KGF); });
      Object.keys(pisoInfo).forEach(function (id) {
        var pi = pisoInfo[id], pr = pi.pr;
        if (pr.tipo === "alcapao") { peca(va, id, null, "nao_verificado"); return; }
        var cap = pi.item && pi.item.cargaKgfM2 != null ? pi.item.cargaKgfM2 : null;
        if (cap == null) { peca(v, id, null, "nao_verificado"); nSem++; return; }
        var ppKgfM2 = (pi.pesoKN * KGF) / (pr.L * pr.larg), dem = P.qServ * KGF + ppKgfM2, u = dem / cap, capP = pi.item.cargaConcentradaKgf, uP = capP > 0 ? pontualKgf / capP : null;
        var uu = Math.max(u, uP == null ? 0 : uP);
        peca(v, id, uu, est ? semOk(uu) : undefined);
        if (!gov || u > gov.u) gov = { u: u, dem: dem, cap: cap, L: pr.L, id: id, pp: ppKgfM2 };
        if (uP != null && (!govP || uP > govP.u)) govP = { u: uP, P: pontualKgf, cap: capP, id: id };
      });
      if (gov) {
        v.formula = "q_dem = qServ·101,97 + peso próprio do piso / (L·0,32) [kgf/m²] ≤ carga admissível da tabela do comprimento (M02 p.18); concentrada: P ≤ 300 kgf";
        v.valores = { q_dem_kgfm2: gov.dem, q_adm_kgfm2: gov.cap, L_m: gov.L, pesoProprio_kgfm2: gov.pp, usoDistribuida: gov.u, P_concentrada_kgf: govP ? govP.P : null, P_adm_kgf: govP ? govP.cap : null, usoConcentrada: govP ? govP.u : null };
        v.texto = "Piso " + gov.id + " (L = " + brf(gov.L, 2) + " m): qServ = " + brf(P.qServ, 2) + " kN/m² = " + brf(P.qServ * KGF, 1) + " kgf/m² + peso próprio " + brf(gov.pp, 1) + " = " + brf(gov.dem, 1) + " kgf/m² contra " + brf(gov.cap, 0) + " kgf/m² (M02 p.18): uso " + brf(gov.u, 3) + "." + (govP ? " Concentrada " + brf(govP.P, 0) + " kgf contra " + brf(govP.cap, 0) + " kgf em 0,5 m²: uso " + brf(govP.u, 3) + "." : "");
        v.solicitante = brf(gov.dem, 1) + " kgf/m²"; v.resistente = brf(gov.cap, 0) + " kgf/m²";
      }
      if (est) { v.ressalvas.push("Linha ESTRIBO: o catálogo M01 não traz carga das plataformas — não verificado. Informe a carga admissível da plataforma do locador."); out.pendencias.push("Linha estribo: carga admissível da plataforma do locador (M01 não traz carga) — informe para verificar o piso."); }
      if (nSem) { v.ressalvas.push(nSem + " piso(s) sem carga admissível na fonte — não verificado."); }
      if (Object.keys(pisoInfo).length && !gov && !nSem) { /* só alçapões */ }
      fecha(v); if (!gov && Object.keys(v.porPeca).length === 0) { verifs.splice(verifs.indexOf(v), 1); }
      if (Object.keys(va.porPeca).length) { va.texto = "Alçapão com escada (PI07): a tabela de carga do M02 p.18 vale para o piso comum; o alçapão não tem carga admissível na fonte. Informe a carga do alçapão do locador."; va.solicitante = "—"; va.resistente = "sem fonte"; va.ressalvas.push(va.texto); va.formula = "sem fonte"; fecha(va); out.pendencias.push("Carga admissível do piso com alçapão (PI07): o M02 não traz — informe a do locador."); } else verifs.splice(verifs.indexOf(va), 1);
    })();

    /* ============ 3. TRANSVERSAL — (a) NBR 8800 (flexão ELU, flecha) e (b) momento admissível de serviço do M04 */
    (function () {
      var v = nova("transversal_multi", "transversal", "Transversal (recebe os pisos): flexão e flecha", "NBR 8800:2008 5.4 (tubo circular, G.2.3); flecha L/200 (confirmarRT); (b) mAdmTravessaKgfm = 68 kgf·m (M04, projeto de terceiro, secundária); cunha = rótula (biapoiada)");
      v.confirmarRT = ["limite de flecha L/200 da transversal", "momento admissível da travessa 68 kgf·m (M04, projeto de terceiro)", "cunha = rótula (conservador)", "seção da travessa = tubo Ø48,3 × 3,0 (o catálogo não dá a parede da travessa)"];
      var gov = null;
      Object.keys(vigasT).forEach(function (id) {
        var vg = vigasT[id], b = vg.b; if (b.papel !== "transversal") return;
        var uM = vg.Md / MRd, uF = vg.delta / (vg.L / P.flechaTuboRel), uB = P.mAdmTravessaKgfm != null ? (vg.Ms * KGF) / P.mAdmTravessaKgfm : null, u = Math.max(uM, uF, uB == null ? 0 : uB);
        peca(v, id, u, est ? semOk(u) : undefined);
        if (!gov || u > gov.u) gov = { u: u, uM: uM, uF: uF, uB: uB, Md: vg.Md, Ms: vg.Ms, delta: vg.delta, L: vg.L, id: id, k: b.nivel, RG: vg.RG[0], RQ: vg.RQ[0] };
      });
      if (!gov) { verifs.splice(verifs.indexOf(v), 1); return; }
      v.formula = "viga biapoiada nas duas rosetas (cunha = rótula) com as reações dos pisos; (a) Msd = máx|1,25·M_G + 1,5·M_Q| ≤ MRd; δ(G+Q) ≤ L/" + P.flechaTuboRel + "; (b) M_serviço ≤ mAdm";
      v.valores = { vao_m: gov.L, Msd_kNm: gov.Md, MRd_kNm: MRd, Mserv_kNm: gov.Ms, Mserv_kgfm: gov.Ms * KGF, mAdm_kgfm: P.mAdmTravessaKgfm, delta_m: gov.delta, deltaLim_m: gov.L / P.flechaTuboRel, usoFlexao: gov.uM, usoFlecha: gov.uF, usoAdmissivel: gov.uB, nivel: gov.k, RG_kN: gov.RG, RQ_kN: gov.RQ };
      v.texto = "Transversal " + gov.id + " (nível " + gov.k + "), vão " + brf(gov.L, 2) + " m, reação do piso G = " + brf(gov.RG, 3) + " kN e Q = " + brf(gov.RQ, 3) + " kN por ponta: (a) Msd = " + brf(gov.Md, 3) + " kN·m ≤ MRd = " + brf(MRd, 3) + " kN·m (uso " + brf(gov.uM, 3) + "); flecha " + brf(gov.delta * 1000, 1) + " mm ≤ " + brf(gov.L / P.flechaTuboRel * 1000, 1) + " mm (uso " + brf(gov.uF, 3) + ")" +
        (gov.uB != null ? "; (b) M de serviço = " + brf(gov.Ms * KGF, 1) + " kgf·m ≤ " + brf(P.mAdmTravessaKgfm, 0) + " kgf·m (M04): uso " + brf(gov.uB, 3) : "") + ". Referência de OUTRO fabricante (Layher LW, S01 p.16, só para comparar, não governa): travessa de 0,73 m admite 29,2 kN/m e 10,1 kN no meio.";
      v.solicitante = "Msd = " + brf(gov.Md, 3) + " kN·m; δ = " + brf(gov.delta * 1000, 1) + " mm"; v.resistente = "MRd = " + brf(MRd, 3) + " kN·m; δlim = " + brf(gov.L / P.flechaTuboRel * 1000, 1) + " mm" + (P.mAdmTravessaKgfm != null ? "; Madm = " + brf(P.mAdmTravessaKgfm, 0) + " kgf·m" : "");
      if (P.mAdmTravessaKgfm == null) v.ressalvas.push(est ? "Linha estribo: sem momento admissível da travessa de fonte — só a NBR 8800 do tubo." : "mAdmTravessaKgfm não informado — só a NBR 8800 do tubo.");
      if (est) v.ressalvas.push("Linha estribo: a seção da travessa do estribo não consta do M01; calculada como o tubo Ø48,3 × 3,0 do poste (confirmarRT) e sem peso de fonte — nunca verde.");
      fecha(v);
    })();

    /* ============ 4. LIGAÇÃO TRAVESSA–ROSETA (cunha): carga vertical por ponta — SEM FONTE pública → nao_verificado */
    (function () {
      var v = nova("no_cunha", "no_cunha", "Ligação travessa–roseta (cunha): carga vertical por ponta", "capNoKgf do fabricante do locador: NENHUMA fonte pública (PESQUISA-MULTI-WEB §2.4 «não achei»); a Layher S01 p.60 só dá a ligação da diagonal de escoramento");
      v.confirmarRT = ["capNoKgf (tabela do fabricante do locador)"];
      var gov = null, capKN = P.capNoKgf != null ? kN(P.capNoKgf) : null;
      modelo.conexoes.forEach(function (c) {
        if (c.tipo !== "cunha") return;
        var b = barrasPorId[c.barras[0]]; if (!b || (b.papel !== "transversal" && b.papel !== "travessa")) return;
        var vg = vigasT[b.id], atEnd = hyp(c.pos[0] - b.a[0], c.pos[2] - b.a[2]) < 0.02 ? 0 : 1, Rg, Rq;
        if (vg) { Rg = vg.RG[atEnd]; Rq = vg.RQ[atEnd]; } else { Rg = pesoBarra(b) / 2; Rq = 0; }
        var R = Rg + Rq, u = capKN != null ? R / capKN : null;
        peca(v, c.id, u, capKN != null ? (est ? semOk(u) : undefined) : "nao_verificado");
        if (!gov || R > gov.R) gov = { R: R, u: u, id: c.id, bar: b.id, nivel: b.nivel };
      });
      if (!gov) { verifs.splice(verifs.indexOf(v), 1); return; }
      v.formula = "V = reação de serviço (G + Q) de cada ponta da travessa/transversal na roseta ≤ capNoKgf";
      v.valores = { V_kN: gov.R, V_kgf: kgf(gov.R), capNoKgf: P.capNoKgf, uso: gov.u };
      v.solicitante = nkn(gov.R); v.resistente = P.capNoKgf != null ? brf(P.capNoKgf, 0) + " kgf" : "capNoKgf não informado";
      if (capKN == null) {
        v.texto = "A maior reação vertical numa ligação é " + nkn(gov.R) + " (" + gov.bar + ", nível " + gov.nivel + "). Sem a carga admissível da ligação travessa–roseta do fabricante do locador (nenhuma fonte pública) a ligação NÃO É VERIFICADA.";
        v.ressalvas.push("Informe a carga admissível da ligação travessa–roseta da tabela do fabricante do locador (campo capNoKgf)."); out.pendencias.push("Informe a carga admissível da ligação travessa–roseta da tabela do fabricante do locador (campo capNoKgf): sem ela a ligação fica NÃO VERIFICADA e o cartão não fica verde.");
      } else v.texto = "A maior reação vertical numa ligação é " + nkn(gov.R) + " contra capNoKgf = " + brf(P.capNoKgf, 0) + " kgf (" + brf(capKN, 2) + " kN): uso " + brf(gov.u, 3) + ".";
      fecha(v);
      if (capKN == null) v.estado = "nao_verificado";
    })();

    /* ---------- reação nos pontos: cada ESTAÇÃO é um pórtico plano ⟂ à fachada (poste interno + externo, ligados por elo rígido nas transversais).
       M3.1 (ESPEC §1, resolve A1/C1/C3): o vento da estação vai ao CHÃO, às ANCORAGENS do poste interno e às LONGITUDINAIS (linhas interna e externa = vigas contínuas entre as estações
       ANCORADAS no mesmo nível, como a longitudinal do tubo-roll depois da C-T1); a linha externa entrega à interna pela TRANSVERSAL da estação (elo axial). NADA de estação isolada e NADA de
       diafragma de piso. O pórtico transversal diagonalizado (diagTransv, cabeceiras e cantos) NUNCA é apoio do vento: entra só no autovalor (contenção por flambagem). */
    var guardRails = barras.filter(function (b) { return b.papel === "guarda" || b.papel === "intermediaria"; });
    var niveisGuarda = pisoLv.slice().sort(function (a, b) { return a - b; });
    var railY = {};   /* "k|g" ou "k|i" → altura */
    guardRails.forEach(function (b) { railY[b.nivel + "|" + (b.papel === "guarda" ? "g" : "i")] = b.a[1]; });
    var wRail = { g: P.guardaKgfM * GRAV / 1000, i: P.intermKgfM * GRAV / 1000 };
    var ancPorPoste = {}; modelo.ancoragens.forEach(function (a) { (ancPorPoste[a.poste] = ancPorPoste[a.poste] || []).push(a); });
    /* a ancoragem é um gancho PERPENDICULAR ao seu trecho: um poste de canto (interno de dois trechos) só é apoio do vento ⟂ do trecho do gancho (a.trecho) */
    function ancDoPoste(key, ti) { return arr(ancPorPoste[key]).filter(function (a) { return ti == null || a.trecho == null || a.trecho === ti; }); }
    var estPorTrecho = {}; modelo.estacoes.forEach(function (e) { (estPorTrecho[e.trecho] = estPorTrecho[e.trecho] || []).push(e); });
    Object.keys(estPorTrecho).forEach(function (t) { estPorTrecho[t].sort(function (a, b) { return a.s - b.s; }); });
    var nivAnc = {};   /* r3(y) → { y, topo }: as cotas com ancoragem (níveis das fiadas e, com ancTopo, o nó +2,00 m) */
    modelo.ancoragens.forEach(function (a) { var k = r3(a.y); if (!nivAnc[k]) nivAnc[k] = { y: a.y, topo: !!a.topo }; if (!a.topo) nivAnc[k].topo = false; });
    var nivAncL = Object.keys(nivAnc).map(function (k) { return nivAnc[k]; }).sort(function (a, b) { return a.y - b.y; });
    function ancoradaEm(key, y, ti) { return ancDoPoste(key, ti).some(function (a) { return Math.abs(a.y - y) < 0.02; }); }
    function apoiosS(ti, y) { var l = []; arr(estPorTrecho[ti]).forEach(function (e) { var k = nodePost[e.I]; if (k && ancoradaEm(k, y, ti)) l.push(e.s); }); return l; }
    /* rigidez de UMA linha longitudinal (viga contínua entre as estações ancoradas do nível y, no mesmo trecho), vista pelo nó da estação e: 3EI(a+b)/(a²b²) (as duas) · 3EI/a³ (uma só) — o mesmo do tubo-roll */
    function kLongDe(e, y) {
      if (!P.cunhaContinua) return 0;
      var esq = null, dir = null;
      apoiosS(e.trecho, y).forEach(function (sx) { if (sx < e.s - 1e-6 && (esq == null || e.s - sx < esq)) esq = e.s - sx; if (sx > e.s + 1e-6 && (dir == null || sx - e.s < dir)) dir = sx - e.s; });
      if (esq != null && dir != null) return 3 * EI * (esq + dir) / (esq * esq * dir * dir);
      if (esq != null) return 3 * EI / Math.pow(esq, 3);
      if (dir != null) return 3 * EI / Math.pow(dir, 3);
      return 0;
    }
    var lancesDT = {}; barras.forEach(function (b) { if (b.papel === "diagonalTransv" && b.estacao != null) (lancesDT[b.estacao] = lancesDT[b.estacao] || []).push(b); });
    function kTrussDe(e, yj) {   /* pórtico transversal diagonalizado (2 postes + transversais + diagonais, pés articulados): 1/flexibilidade. SÓ para o autovalor (contenção) — nunca para o vento */
      var ls = arr(lancesDT[e]).slice().sort(function (a, b) { return Math.min(a.a[1], a.b[1]) - Math.min(b.a[1], b.b[1]); }); if (!ls.length) return 0;
      var cob = Math.min(ls[0].a[1], ls[0].b[1]); if (cob > niv[0].y + 0.05) return 0;
      var yTopCob = cob, Ekpa = E * 1e3, Atubo = s.A * 1e-6, Ieq = Atubo * W * W / 2, d = 0, okAte = 0;
      for (var q = 0; q < ls.length; q++) { var y0 = Math.min(ls[q].a[1], ls[q].b[1]), y1 = Math.max(ls[q].a[1], ls[q].b[1]); if (y0 > yTopCob + 0.05) break; yTopCob = Math.max(yTopCob, y1); okAte = yTopCob; }
      if (yj > okAte + 0.05) return 0;
      d = yj * yj * yj / (3 * Ekpa * Ieq);
      ls.forEach(function (b) { var y0 = Math.min(b.a[1], b.b[1]), y1 = Math.max(b.a[1], b.b[1]); if (y0 > yj + 0.05) return; var h = Math.min(y1, yj) - y0, Ld = Math.sqrt(W * W + h * h); if (h > 0.05) d += Ld * Ld * Ld / (Ekpa * Atubo * W * W); });
      return 1 / d;
    }
    var emendasPoste = {};   /* M3.3 (C-N1): cota de cada emenda (espigão) por poste — vira RÓTULA no pórtico da estação (padrão) */
    modelo.conexoes.forEach(function (c) { if (c.tipo !== "espigao") return; var b0 = barrasPorId[c.barras[0]]; if (b0 && b0.poste) (emendasPoste[b0.poste] = emendasPoste[b0.poste] || []).push(c.pos[1]); });
    var stat = {};   /* estação → { kI, kO, bTrib, fem, mapa } */
    (function () {
      modelo.estacoes.forEach(function (e) {
        var kI = nodePost[e.I], kO = nodePost[e.O]; if (!kI || !kO) return;
        var bT = 0; modelo.celulas.forEach(function (c) { if (c.trecho !== e.trecho) return; if (Math.abs(c.s1 - e.s) < 2e-3 || Math.abs(c.s0 - e.s) < 2e-3) bT += c.L / 2; });
        stat[e.id] = { e: e, kI: kI, kO: kO, bTrib: Math.max(bT, 0.2) };
      });
    })();
    function railR(trecho, key, linhaRail, kp, t) {   /* reação (kN) do trilho no poste, no plano da estação (barras da fiada daquela linha) e fora dele (cabeceiras e fiada do outro trecho) */
      var rp = 0, ro = 0;
      guardRails.forEach(function (b) {
        if (b.nivel !== kp || (b.papel === "guarda" ? "g" : "i") !== t) return;
        var ka = posteEm(b.a[0], b.a[2]), kb = posteEm(b.b[0], b.b[2]); if (ka !== key && kb !== key) return;
        var r = wRail[t] * b.L / 2;
        if (b.trecho === trecho && !b.cabeceira && b.linha === linhaRail) rp += r; else ro += r;
      });
      return { plano: rp, fora: ro, vet: Math.sqrt(rp * rp + ro * ro) };
    }
    function resolverEstacao(st) {
      var e = st.e, topI = yTopoPoste(st.kI), topO = yTopoPoste(st.kO), links = []; st.linkBar = {};
      barras.forEach(function (b) {   /* elo rígido ⟂ em toda barra que liga os dois postes da estação: transversal (níveis e topo: +1,00 e +2,00 m com tela, M3.1), guarda-corpo da cabeceira e, na estação do CANTO, a travessa do outro trecho */
        if (b.papel !== "transversal" && b.papel !== "transversalTopo" && b.papel !== "travessa" && b.papel !== "guarda" && b.papel !== "intermediaria") return;
        var ka = posteEm(b.a[0], b.a[2]), kb = posteEm(b.b[0], b.b[2]); if (!((ka === st.kI && kb === st.kO) || (ka === st.kO && kb === st.kI))) return;
        var y = b.a[1]; if (y <= Math.min(topI, topO) + 1e-6 && links.every(function (z) { return Math.abs(z - y) > 1e-6; })) { links.push(y); st.linkBar[r3(y)] = b; }
      });
      var hgI = [], hgO = [];
      if (!P.espigaoRigido) { arr(emendasPoste[st.kI]).forEach(function (y) { if (y > 1e-6 && y < topI - 1e-6) hgI.push(y); }); arr(emendasPoste[st.kO]).forEach(function (y) { if (y > 1e-6 && y < topO - 1e-6) hgO.push(y); }); }
      var rig = ancDoPoste(st.kI, e.trecho).map(function (a) { return a.y; }).filter(function (y, i, l) { return l.indexOf(y) === i; }), molI = [], molO = [], molLI = [];
      nivAncL.forEach(function (lv) {
        if (ancoradaEm(st.kI, lv.y, e.trecho) || lv.y > Math.min(topI, topO) + 1e-6) return;   /* a própria estação já é apoio rígido neste nível */
        var k = kLongDe(e, lv.y); if (!(k > 0)) return;
        if (!lv.topo) molI.push({ y: lv.y, k: k });   /* linha INTERNA: travessa em todo nível; no nó +2,00 m do topo só existe a EXTERNA (amarração da tela) */
        molO.push({ y: lv.y, k: k });
      });
      niv.forEach(function (n) { var k = kTrussDe(e.id, n.y); if (k > 0) molLI.push({ y: n.y, k: k }); });
      var segsO = [], segsI = [], nS = Math.max(1, Math.ceil(Math.max(topI, topO) / 0.25)), dS = Math.max(topI, topO) / nS;
      if (vt.ok) for (var i = 0; i < nS; i++) { var ym = (i + 0.5) * dS; if (ym < topO) segsO.push({ y0: i * dS, y1: (i + 1) * dS, w: qAt(ym) * cfCamada(ym) * st.bTrib }); if (ym < topI) segsI.push({ y0: i * dS, y1: (i + 1) * dS, w: qAt(ym) * P.caTubo * solidez * st.bTrib }); }
      var casos = [{ wO: segsO, wI: segsI }], mapa = [];
      st.Fw = 0; segsO.concat(segsI).forEach(function (sg) { st.Fw += sg.w * (sg.y1 - sg.y0); });
      niveisGuarda.forEach(function (kp) { ["g", "i"].forEach(function (t) { var y = railY[kp + "|" + t]; if (y == null) return; mapa.push({ kp: kp, t: t, lado: "O", ci: casos.length, y: Math.min(y, topO) }); casos.push({ ptO: [{ y: Math.min(y, topO), P: 1 }] }); mapa.push({ kp: kp, t: t, lado: "I", ci: casos.length, y: Math.min(y, topI) }); casos.push({ ptI: [{ y: Math.min(y, topI), P: 1 }] }); }); });
      var Nf = [function (y) { return I.num(NProf(st.kI, y, 1.25, 1.5), 0); }, function (y) { return I.num(NProf(st.kO, y, 1.25, 1.5), 0); }];
      var Ns = []; for (var yy = 0; yy <= Math.max(topI, topO) + 1e-6; yy += 0.25) Ns.push(Math.round(Nf[0](yy) * 1e5), Math.round(Nf[1](yy) * 1e5));
      var sig = JSON.stringify([EI, topI, topO, links, rig, molI, molO, molLI, casos, Ns, hgI, hgO]);
      st.FwO = 0; segsO.forEach(function (sg) { st.FwO += sg.w * (sg.y1 - sg.y0); });
      if (CACHE_FEM[sig]) { st.fem = CACHE_FEM[sig].fem; st.mapa = mapa; return; }
      var fem = porteEstacao({ EI: EI, h: 0.25, topI: topI, topO: topO, links: links, rigI: rig, molasI: molI, molasO: molO, molasLamI: molLI, hingesI: hgI, hingesO: hgO, kLink: 1e8 * EI / 0.25 }, casos, Nf);
      fem.cfgMolas = { I: molI, O: molO, lam: molLI, links: links, rig: rig, hingesI: hgI, hingesO: hgO };
      if (CACHE_N > 400) { CACHE_FEM = {}; CACHE_N = 0; }
      CACHE_FEM[sig] = { fem: fem }; CACHE_N++; st.fem = fem; st.mapa = mapa;
    }
    /* o que a estação tem de apoio além das próprias ancoragens: as molas das LONGITUDINAIS (kN/m) por nível, para o memorial e para os testes */
    Object.keys(stat).forEach(function (id) { resolverEstacao(stat[id]); });
    function maxMEm(Mtab, nodes, y0, y1) { var m0 = 0; for (var i = 0; i < nodes.length; i++) if (nodes[i] >= y0 - 1e-6 && nodes[i] <= y1 + 1e-6) m0 = Math.max(m0, Math.abs(Mtab[i])); return m0; }
    out.caminho.estacoes = Object.keys(stat).map(function (id) {
      var st = stat[id], r0 = st.fem.res[0], sRm = 0; r0.Rm.I.concat(r0.Rm.O).forEach(function (x) { sRm += x.R; });
      return { id: st.e.id, trecho: st.e.trecho, poste_interno: st.kI, poste_externo: st.kO, bTrib_m: st.bTrib, vento_aplicado_kN: st.Fw, vento_externo_kN: st.FwO, elos_kN: r0.elos.map(function (x) { return { y: x.y, F_kN: x.F }; }), espigaoRotulado: !P.espigaoRigido && (arr(st.fem.cfgMolas && st.fem.cfgMolas.hingesI).length + arr(st.fem.cfgMolas && st.fem.cfgMolas.hingesO).length) > 0, base_interno_kN: r0.base[0], base_externo_kN: r0.base[1], ancoragens: r0.anc.map(function (a) { return { y: a.y, F_kN: a.R }; }), longitudinais_kN: sRm, molas: (st.fem.cfgMolas || {}), longitudinaisPorNivel: r0.Rm.I.map(function (x) { return { y: x.y, linha: "i", R_kN: x.R }; }).concat(r0.Rm.O.map(function (x) { return { y: x.y, linha: "e", R_kN: x.R }; })), somaReacoesAssinada_kN: r0.somaAssinada, comTrelicaTransversal: Object.keys(lancesDT).indexOf(String(st.e.id)) >= 0, instavel: !!r0.instavel, lambdaPerp: st.fem.lambda };
    });
    Object.keys(vigasT).forEach(function (id) { var vg = vigasT[id]; if (vg.b.papel === "transversal") out.caminho.transversais.push({ id: id, nivel: vg.b.nivel, s: vg.b.a[0], RG_kN: vg.RG[0] + vg.RG[1], RQ_kN: vg.RQ[0] + vg.RQ[1] }); });
    /* resposta de cada poste (envoltória sobre as estações em que ele aparece) */
    var respPoste = {};   /* key → { Mw:[{nodes,M}], rail:[{nodes,M,kp,t,R,Rvet,vU}], inst, lam } */
    Object.keys(stat).forEach(function (id) {
      var st = stat[id], f = st.fem;
      var pkL = [[st.kI, 0, "i"], [st.kO, 1, "e"]];
      pkL.forEach(function (pr) {
        var key = pr[0], p = pr[1], rp = respPoste[key] = respPoste[key] || { Mw: [], rail: [], inst: false, lam: Infinity, estacoes: [] };
        rp.estacoes.push(id);
        if (f.res[0].instavel) rp.inst = true;
        if (f.lambda != null) rp.lam = Math.min(rp.lam, f.lambda);
        rp.Mw.push({ nodes: f.nodes[p], M: f.res[0].M[p] });
        st.mapa.forEach(function (mp) {
          /* A-N2 (M3.3): o caso unitário de um trilho carrega os DOIS postes (a barra do guarda-corpo desce pelos elos até o outro poste): a reação do trilho do poste de ORIGEM vai multiplicar o
             momento do caso unitário em CADA poste da estação — antes só o poste que levava o trilho recebia o próprio momento e o do vizinho era descartado (+53 % no poste interno, vão 1,14). */
          var srcP = mp.lado === "O" ? 1 : 0, src = pkL[srcP], induzido = srcP !== p;
          if (induzido && LEGADO.semInduzido) return;   /* só para o teste: reproduz o código ANTIGO (A-N2 da revisão nº 2) */
          var rr = railR(st.e.trecho, src[0], src[2], mp.kp, mp.t);
          if (rr.vet > 0) {
            var nd = f.nodes[p], ix = 0, bd = Infinity; for (var q0 = 0; q0 < nd.length; q0++) { var dd0 = Math.abs(nd[q0] - mp.y); if (dd0 < bd) { bd = dd0; ix = q0; } }
            rp.rail.push({ nodes: nd, M: f.res[mp.ci].M[p], Mlo: f.res[mp.ci].Mlo[p], Mhi: f.res[mp.ci].Mhi[p], y: mp.y, kp: mp.kp, t: mp.t, R: induzido ? 0 : rr.plano, Rvet: rr.vet, ind: induzido, vU: Math.abs(f.res[mp.ci].v[p][ix]) });   /* vU: deslocamento do poste por kN na altura do trilho (M1: flecha do sistema); o induzido não entra na flecha (R = 0) */
          }
        });
      });
    });
    /* postes que não aparecem em estação nenhuma (não deve ocorrer) */
    postes.forEach(function (q) { if (!respPoste[q.key]) respPoste[q.key] = { Mw: [], rail: [], inst: false, lam: Infinity, estacoes: [] }; });
    /* M4-C (M-N4): Cm do Anexo D da NBR 8800 (de memória: conferir no exemplar licenciado) para o trecho entre dois apoios quando o caso é SÓ de momento de extremidade (o caso unitário do guarda-corpo cuja carga está
       FORA do trecho: o balanço da raiz em cima): Cm = 0,60 − 0,40·(M1/M2), M1/M2 positivo em curvatura reversa; com os momentos de extremidade COM SINAL na convenção do solver (mesmo sinal = curvatura
       simples), M1/M2 = −(menor/maior). Limitado a [0,40; 1,00] (conservador: nunca abaixo de 0,40). Carga transversal DENTRO do trecho: Cm = 1,00. */
    function cmDe(m, y0, y1) {
      if (LEGADO.semCm) return 1;
      if (m.y > y0 + 1e-6 && m.y < y1 - 1e-6) return 1;
      function ix(y) { var b = 0, bd = Infinity; for (var q = 0; q < m.nodes.length; q++) { var dd = Math.abs(m.nodes[q] - y); if (dd < bd) { bd = dd; b = q; } } return b; }
      var Ma = m.Mlo ? m.Mlo[ix(y0)] : null, Mb = m.Mhi ? m.Mhi[ix(y1)] : null; if (Ma == null || Mb == null || !isFinite(Ma) || !isFinite(Mb)) return 1;
      var peq = Math.abs(Ma) <= Math.abs(Mb) ? Ma : Mb, gra = Math.abs(Ma) <= Math.abs(Mb) ? Mb : Ma; if (!(Math.abs(gra) > 1e-12)) return 1;
      return clamp(0.6 + 0.4 * peq / gra, 0.4, 1.0);
    }
    function dPosteTrilho(key, kp, t) {   /* M1: deslocamento do poste na altura do trilho = R_plano × v unitário do pórtico (pior estação) */
      var d = 0; arr(respPoste[key] && respPoste[key].rail).forEach(function (m) { if (m.kp === kp && m.t === t) d = Math.max(d, m.R * m.vU); }); return d;
    }

    /* ---------- flambagem no plano da fachada (∥). M3.1 (C3): SEM diafragma de piso em plano nenhum. O poste EXTERNO, num trecho com torre de diagonais, tem as travessas da linha externa como elo axial
       até a torre (apoios em todos os nós de nível); o poste INTERNO não tem diagonal no plano dele: a flambagem ∥ da linha interna NÃO é calculada (lamPar = ∞) e vai para a pendência «vento_paralelo». */
    var temDiagTrecho = {}; barras.forEach(function (b) { if (b.papel === "diagonal") temDiagTrecho[b.trecho] = true; });
    var lamPar = {}, parNaoCalc = {};
    postes.forEach(function (q) {
      var tops = yTopoPoste(q.key), trs = {}; (respPoste[q.key].estacoes || []).forEach(function (id) { trs[stat[id].e.trecho] = true; });
      var trList = Object.keys(trs), braced = trList.length > 0 && trList.every(function (t) { return temDiagTrecho[t]; });
      if (q.externo && !q.interno && braced) {
        var apoios = [0]; niv.forEach(function (n) { if (n.y < tops - 0.05) apoios.push(n.y); });
        lamPar[q.key] = I.ncrColuna({ x0: 0, x1: tops, apoios: apoios, molas: [], EI: EI, h: 0.25, N: function (y) { return NProf(q.key, y, 1.25, 1.5); } });
      } else { lamPar[q.key] = Infinity; parNaoCalc[q.key] = true; }
    });

    /* ============ 5. POSTE — NBR 8800 (autovalor, flexo-compressão) com vento + imperfeição + excentricidade da cabeça; (b) carga admissível de serviço (M04) */
    /* M2 (M3.1): o guarda-corpo (Q de pessoas, 18.9.4.2) acompanha o Q do piso com ψ0 na combinação A; ele tem verificação PRÓPRIA (guarda_poste) com γQ pleno */
    var COMBOS = [{ n: "Q principal + 0,6W + ψ0·guarda-corpo", gG: 1.25, gQ: 1.5, gW: 1.4 * 0.6, gP: 1.5 * P.psi0Q }, { n: "W principal sem Q (andaime parado)", gG: 1.25, gQ: 0, gW: 1.4, gP: 0 }];
    var COMBOS_TOPO = [{ n: "guarda-corpo (Q) + 0,6W", gW: 1.4 * 0.6, gP: 1.5 }, { n: "W principal sem Q", gW: 1.4, gP: 0 }];   /* as do montante_topo do tubo-roll (E4.3) */
    var rGir = Math.sqrt(s.Ix / s.A);   /* mm */
    var segmentosDe = function (key) {
      var yt = yTopoPoste(key), sg = [], y0 = 0;
      for (var j = 0; j <= nL; j++) { sg.push({ j: j, y0: y0, y1: niv[j].y, topo: false }); y0 = niv[j].y; }
      if (yt > niv[nL].y + 0.05) sg.push({ j: nL + 1, y0: niv[nL].y, y1: yt, topo: true });
      return sg;
    };
    function klTopo(key, sg) {   /* comprimento de flambagem do trecho acima do último nó: vão entre apoios (raiz = nó de nível; âncoras do poste), K = 1; o balanço livre acima do último apoio, K = 2,1 (NBR 8800 Tab. E.1, de memória) */
      var ap = [sg.y0]; ancDoPoste(key, null).forEach(function (a) { if (a.y > sg.y0 + 1e-6 && a.y <= sg.y1 + 1e-6) ap.push(a.y); }); ap.sort(function (a, b) { return a - b; });
      var kl = 0; for (var i = 0; i + 1 < ap.length; i++) kl = Math.max(kl, ap[i + 1] - ap[i]);
      var livre = sg.y1 - ap[ap.length - 1]; if (livre > 0.05) kl = Math.max(kl, 2.1 * livre);
      return Math.max(kl, 0.05);
    }
    var posteSec = {};   /* key|j → registro */
    var vPo = nova("poste_multi", "poste", "Poste: compressão com flambagem e flexocompressão (vento, imperfeição, excentricidade da cabeça)", "NBR 8800:2008 5.5.1.2 e Anexo E (Ne por AUTOVALOR do pórtico plano da estação; χ pela rotina de AcoDim8800); NBR 8681 (2 combinações); NBR 6123:2023; (b) cargaAdmPosteKgf = 2000 kgf de serviço (M04, secundária); B1 de memória");
    var vGP = nova("guarda_poste", "guarda_poste", "Poste sob a carga do guarda-corpo (NR-18: 90 kgf/m)", "NR-18 18.9.4.2 a) (REGRA: o travessão resiste a 90 kgf/m); o poste acima do último nó é verificado como o montante_topo do tubo-roll (N do próprio trecho, sem B1); NBR 8800 5.5.1.2");
    (function () {
      var v = vPo, gov = null, govGP = null, combos = vt.ok ? COMBOS : [COMBOS[0]], combosT = vt.ok ? COMBOS_TOPO : [COMBOS_TOPO[0]], ECUNHA = P.eCunha == null ? 0 : P.eCunha;
      v.confirmarRT = ["fy (aço do tubo do locador)", "eCunha = raio da roseta (62 mm)", "continuidade horizontal da fiada de travessas pela cunha entre as estações ancoradas (cunhaContinua; ESPEC-M3.1 §1) — sem fonte da rigidez da cunha", "cargaAdmPosteKgf (M04)", "espigão = RÓTULA (padrão; contínuo só com espigaoRigido + justificativa do RT)", "B1 (de memória)", "imperfeição 0,3 % (NBR 8800 4.9.7, de memória)", "ψ0 do guarda-corpo na combinação A (psi0Q)", "K = 2,1 do balanço (NBR 8800 Tab. E.1, de memória)"];
      vGP.confirmarRT = ["solução do guarda-corpo (escora, poste, ensaio)", "travessão e intermediário NÃO se somam (NR-18 18.9.4.2 a e b são itens separados): decisão do RT"];
      /* M3.3 (C-N1): a «atenção por emenda longe de nó» SAIU — o espigão é RÓTULA no pórtico da estação (Ncr e flexão), então o número diz a verdade e não precisa de um alerta que o portão libera. */
      postes.forEach(function (q) {
        var key = q.key, rp = respPoste[key], lamOK = Math.min(rp.lam, lamPar[key]), segs = segmentosDe(key);
        segs.forEach(function (sg) {
          var Mw = 0, Mg = 0, piorC = null, Lseg = Math.max(sg.y1 - sg.y0, 0.05), cx, Ns, uB, ug, B1g, NdG, MdGp = 0;
          rp.Mw.forEach(function (m) { Mw = Math.max(Mw, maxMEm(m.M, m.nodes, sg.y0, sg.y1)); });
          rp.rail.forEach(function (m) { Mg = Math.max(Mg, m.Rvet * maxMEm(m.M, m.nodes, sg.y0, sg.y1)); });
          if (sg.topo) {
            /* A4 (M3.1 §4): o trecho acima do último nó = montante_topo do tubo-roll: N do PRÓPRIO trecho (peso do poste acima ≈ 0, sem o N do levante de baixo), Nc,Rd do trecho (K=1 entre apoios,
               2,1 no balanço), SEM B1; momento do vento na tela e do guarda-corpo sobre os apoios ELÁSTICOS reais do pórtico (longitudinais, ancoragens, elo da transversal). A excentricidade da cabeça
               entra no levante de baixo (a reação do nível de piso é do levante que a carrega). */
            var NG0 = proprioAcima(key, sg.y0 + 1e-6), KLt = klTopo(key, sg), nrT = NRdDe(KLt), NRdT = nrT.NRd;
            combosT.forEach(function (cb) {
              var Nd = 1.25 * NG0, Mnoc = P.notional * Nd * Lseg, Md = cb.gW * Mw + cb.gP * Mg + Mnoc, r = Nd / NRdT, u = Math.min(99, r >= 0.2 ? r + 8 / 9 * (Md / MRd) : r / 2 + Md / MRd);
              if (rp.inst) u = 99;
              if (!piorC || u > piorC.u) piorC = { u: u, cb: cb.n, Nd: Nd, NG: NG0, NQ: 0, Me: 0, Mnoc: Mnoc, Mw: cb.gW * Mw, Mg: cb.gP * Mg, B1: 1, Md: Md, r: r, NRd: NRdT, nr: nrT, KL: KLt, Ne: null };
            });
            Ns = piorC.NG; uB = P.cargaAdmPosteKgf != null ? (Ns * KGF) / P.cargaAdmPosteKgf : null;
            NdG = 1.25 * piorC.NG; B1g = 1; var rg0 = NdG / NRdT, MdG0 = 1.5 * Mg + piorC.Mnoc; MdGp = 1.5 * Mg; ug = rp.inst ? 99 : Math.min(99, rg0 >= 0.2 ? rg0 + 8 / 9 * (MdG0 / MRd) : rg0 / 2 + MdG0 / MRd);
          } else {
            var yRef = sg.y0, NA = NProf(key, yRef + 1e-6, 1.25, 1.5), Ne = lamOK * NA, KLeq = rp.inst ? 1e3 : (Ne > 1e-9 && isFinite(Ne) ? Math.PI * Math.sqrt(EI / Ne) : 1e3), nr = NRdDe(Math.max(KLeq, 0.05)), NRd = nr.NRd;
            var jT = sg.j, Rtop = function (cb) { return cb.gG * RG(jT, key) + cb.gQ * RQ(jT, key); }, Rbot = function (cb) { return sg.j >= 1 ? cb.gG * RG(sg.j - 1, key) + cb.gQ * RQ(sg.j - 1, key) : 0; };
            combos.forEach(function (cb) {
              var NG = proprioAcima(key, yRef + 1e-6), NQ = 0; for (var j2 = 0; j2 <= nL; j2++) if (niv[j2].y > yRef + 1e-6) { NG += RG(j2, key); NQ += RQ(j2, key); }
              var Nd = cb.gG * NG + cb.gQ * NQ, Me = ECUNHA * Math.max(Rtop(cb), Rbot(cb)), Mnoc = P.notional * Nd * Lseg, Mww = cb.gW * Mw, Mgg = cb.gP * Mg, B1 = Nd >= Ne ? 99 : Math.max(1, 1 / (1 - Nd / Ne)), Md = B1 * (Me + Mww + Mgg + Mnoc);
              var r = Nd / NRd, u = Math.min(99, r >= 0.2 ? r + 8 / 9 * (Md / MRd) : r / 2 + Md / MRd);
              if (rp.inst) u = 99;
              if (!piorC || u > piorC.u) piorC = { u: u, cb: cb.n, Nd: Nd, NG: NG, NQ: NQ, Me: Me, Mnoc: Mnoc, Mw: Mww, Mg: Mgg, B1: B1, Md: Md, r: r, NRd: NRd, nr: nr, KL: KLeq, Ne: Ne };
            });
            Ns = piorC.NG + piorC.NQ; uB = P.cargaAdmPosteKgf != null ? (Ns * KGF) / P.cargaAdmPosteKgf : null;
            /* só o guarda-corpo (90 kgf/m): γQ pleno, com o N do trecho (1,5·Q) */
            NdG = 1.25 * piorC.NG + 1.5 * piorC.NQ;
            /* M4-C (M-N4): B1 = Cm/(1 − Nd/Ne) POR TRILHO (Cm do Anexo D quando a carga do trilho está fora do trecho); o máximo de B1·M sobre os trilhos governa */
            var MgB = 0, B1gov = 1;
            rp.rail.forEach(function (m) { var Mm = m.Rvet * maxMEm(m.M, m.nodes, sg.y0, sg.y1); if (!(Mm > 0)) return; var b1 = NdG >= Ne ? 99 : Math.max(1, cmDe(m, sg.y0, sg.y1) / (1 - NdG / Ne)); if (b1 * Mm > MgB) { MgB = b1 * Mm; B1gov = b1; } });
            B1g = B1gov; MdGp = 1.5 * MgB; var rg = NdG / NRd; ug = rp.inst ? 99 : Math.min(99, rg >= 0.2 ? rg + 8 / 9 * (MdGp / MRd) : rg / 2 + MdGp / MRd);
          }
          cx = { key: key, sg: sg, u: Math.max(piorC.u, uB == null ? 0 : uB), uNBR: piorC.u, uB: uB, c: piorC, ug: ug, Mg1: Mg, B1g: B1g, MdG: MdGp };
          posteSec[key + "|" + sg.j] = cx;
          out.montantes.push({ poste: key, levante: sg.j, topo: sg.topo, Lunb_m: piorC.KL, NcRd_kN: piorC.NRd, Ne_kN: piorC.Ne, lambdaCr: sg.topo ? null : lamOK, lambdaPerp: rp.lam, lambdaPar: lamPar[key], NG_kN: piorC.NG, NQ_kN: piorC.NQ, Nd_kN: piorC.Nd, Me_kNm: piorC.Me, Mvento_kNm: piorC.Mw, Mguarda_kNm: piorC.Mg, Mimperf_kNm: piorC.Mnoc, Md_kNm: piorC.Md, uso: cx.u, usoNBR8800: piorC.u, usoAdmissivel: uB, combinacao: piorC.cb, KL_m: piorC.KL, KLr: piorC.KL * 1000 / rGir, B1: piorC.B1 });
          if (!gov || cx.u > gov.u) gov = cx;
          if (Mg > 0 && (!govGP || ug > govGP.ug)) govGP = cx;
        });
      });
      /* por peça (barra de poste) */
      barras.forEach(function (b) {
        if (b.papel !== "poste" || !b.poste) return;
        var y0 = Math.min(b.a[1], b.b[1]), y1 = Math.max(b.a[1], b.b[1]), uu = null, ug = null;
        segmentosDe(b.poste).forEach(function (sg) { if (y1 > sg.y0 + 1e-9 && y0 < sg.y1 - 1e-9) { var c = posteSec[b.poste + "|" + sg.j]; if (c) { uu = uu == null ? c.u : Math.max(uu, c.u); if (c.c && c.Mg1 > 0) ug = ug == null ? c.ug : Math.max(ug, c.ug); } } });
        var est1 = estadoDe(uu);
        if (parNaoCalc[b.poste] && !P.paraleloInternoRT && est1 === "ok") est1 = "nao_verificado";   /* M3.1 (C3) + M3.3 (M-N2): flambagem ∥ da linha interna não calculada — o poste nunca fica «ok»/«atenção» por um caminho sem fonte; só o paraleloInternoRT do RT (com justificativa) libera */
        if (est1 === "ok" && Object.keys(semPeso).length && (semPeso.poste || semPeso.travessa || semPeso.piso)) est1 = "nao_verificado";
        if (!vt.ok && est1 !== "falha") est1 = "nao_verificado";
        peca(v, b.id, uu, est1);
        if (ug != null) peca(vGP, b.id, ug);
      });
      if (!gov) { verifs.splice(verifs.indexOf(v), 1); verifs.splice(verifs.indexOf(vGP), 1); return; }
      var sgv = gov.c;
      v.formula = "Ne = λcr·N (autovalor do pórtico plano ⟂ da estação e, no poste externo contraventado, da coluna no plano ∥; o menor) → KLeq = π√(EI/Ne) → Nc,Rd = χ·Ag·fy/γa1; Md = B1·(eCunha·R + γW·Mvento + ψ0·1,5·Mguarda + 0,003·Nd·L); Nd/Nc,Rd + 8/9·Md/MRd ≤ 1 (5.5.1.2); pior das 2 combinações da NBR 8681; acima do último nó: Nd do próprio trecho, sem B1 (montante_topo); (b) N serviço ≤ cargaAdmPosteKgf";
      v.valores = { poste: gov.key, trecho: gov.sg.topo ? "acima do último nó" : "levante " + gov.sg.j, KL_m: sgv.KL, KLr: sgv.KL * 1000 / rGir, chi: sgv.nr.chi, NcRd_kN: sgv.NRd, NSd_kN: sgv.Nd, NserG_kN: sgv.NG, NserQ_kN: sgv.NQ, Me_kNm: sgv.Me, Mvento_kNm: sgv.Mw, Mguarda_kNm: sgv.Mg, Mimperf_kNm: sgv.Mnoc, Md_kNm: sgv.Md, MRd_kNm: MRd, B1: sgv.B1, razaoN: sgv.r, usoNBR8800: gov.uNBR, usoAdmissivel: gov.uB, combinacao: sgv.cb, Ne_kN: sgv.Ne };
      v.texto = "Poste " + gov.key + " (" + v.valores.trecho + "), combinação «" + sgv.cb + "»: " + (sgv.Ne == null ? "trecho acima do último nó (N do próprio trecho, sem B1), KL = " + brf(sgv.KL, 2) + " m" : "Ne = " + nkn(sgv.Ne) + " (KLeq = " + brf(sgv.KL, 2) + " m)") + ", χ = " + brf(sgv.nr.chi, 3) + "; Nc,Rd = " + nkn(sgv.NRd) + "; G = " + brf(sgv.NG, 2) + " kN, Q = " + brf(sgv.NQ, 2) + " kN → Nd = " + brf(sgv.Nd, 2) + " kN; Md = B1·(e·R + Mvento + Mguarda + Mimperf.) = " + brf(sgv.B1, 3) + "·(" + brf(sgv.Me, 3) + " + " + brf(sgv.Mw, 3) + " + " + brf(sgv.Mg, 3) + " + " + brf(sgv.Mnoc, 3) + ") = " + brf(sgv.Md, 3) + " kN·m (MRd = " + brf(MRd, 3) + " kN·m); uso NBR 8800 = " + brf(gov.uNBR, 3) +
        (gov.uB != null ? "; (b) N de serviço " + brf(kgf(sgv.NG + sgv.NQ), 0) + " kgf ≤ " + brf(P.cargaAdmPosteKgf, 0) + " kgf (M04): uso " + brf(gov.uB, 3) : "") + ". Referência de outro fabricante (Layher, só para comparar): TG 60 admite até 6 t por montante (S04); Modex 3,5–4,0 t (S10); nenhum governa.";
      v.solicitante = brf(sgv.Nd, 2) + " kN (" + brf(kgf(sgv.Nd), 0) + " kgf), Md = " + brf(sgv.Md, 3) + " kN·m"; v.resistente = "Nc,Rd = " + brf(sgv.NRd, 2) + " kN; MRd = " + brf(MRd, 3) + " kN·m" + (P.cargaAdmPosteKgf != null ? "; " + brf(P.cargaAdmPosteKgf, 0) + " kgf (serviço)" : "");
      if (sgv.KL < 900 && sgv.KL * 1000 / rGir > 200) v.ressalvas.push("KL/r = " + brf(sgv.KL * 1000 / rGir, 0) + " > 200 no pior trecho (NBR 8800 5.3.4): o KLeq vem do autovalor λ·N — informado, não usado como critério (B2 da revisão nº 1).");
      if (!vt.ok) { v.ressalvas.push("Sem V0 o vento (a maior parcela do momento) não entra: poste NÃO VERIFICADO — " + vt.motivo); naoV.push("Poste: sem V0 o vento não entra — estado não verificado. " + vt.motivo); }
      if (P.espigaoRigido) v.ressalvas.push("O espigão (emenda) é tratado como CONTÍNUO no Ncr e na flexão do poste — conferido pelo responsável técnico: " + String(P.espigaoJustificativa).trim());
      else v.ressalvas.push("O espigão (emenda do poste) é RÓTULA no Ncr e na flexão (padrão, sem fonte da rigidez da emenda): em cada estação a rotação do poste é liberada em toda cota de emenda. O poste continua além dos nós vizinhos, então a rótula reduz o λcr mas não o zera. Contínuo só com espigaoRigido + espigaoJustificativa do RT.");
      if (P._espigaoSemJustificativa) v.ressalvas.push("Espigão contínuo pedido SEM justificativa do RT (mínimo 15 caracteres): calculado com o espigão como RÓTULA.");
      if (parNaoCalc && Object.keys(parNaoCalc).length && P.paraleloInternoRT) v.ressalvas.push("Flambagem ∥ da linha INTERNA conferida pelo responsável técnico (diafragma do piso ou diagonal interna): " + P.paraleloInternoJustificativa);
      if (Object.keys(semPeso).length) v.ressalvas.push("Peso de fonte ausente em: " + Object.keys(semPeso).join(", ") + " (linha " + linhaId + ") — usei o tubo de 3,70 kg/m onde havia barra e zero nos pisos: G subestimado, o poste não fica verde.");
      if (semAnc) v.ressalvas.push("torre sem ancoragem: o sistema ainda não calcula a torre solta (AN16 do tubo-roll) — sem ancoragem não há apoio do vento: ancore ou peça cálculo do RT. O pórtico transversal diagonalizado NÃO é apoio do vento (C1).");
      else if (Object.keys(parNaoCalc).length) v.ressalvas.push("A flambagem da linha INTERNA no plano da fachada (∥) NÃO é calculada: sem diagonal no plano interno e sem diafragma de piso de fonte (C3 da revisão nº 1) — o poste interno nunca fica «ok» por este caminho; ver «vento_paralelo».");
      v.ressalvas.push(P.cunhaContinua ? "Para o vento ⟂ a fiada de travessas é tratada como viga CONTÍNUA entre as estações ancoradas — conferido pelo responsável técnico: " + String(P.cunhaContinuaJustificativa).trim() : "Para o vento ⟂ a cunha é RÓTULA (padrão, sem fonte da rigidez da ligação): cada estação vale pelas próprias ancoragens. Com a tabela do fabricante da ligação, o RT pode marcar a fiada contínua (cunhaContinua + justificativa) e a malha de ancoragem fica menos densa.");
      if (P._cunhaSemJustificativa) v.ressalvas.push("Fiada contínua pedida SEM justificativa do RT (mínimo 15 caracteres): calculado com a cunha como RÓTULA.");
      v.ressalvas.push("Peso da tela ausente (sem fonte): desprezível no poste, entraria no 1,0·G de qualquer levantamento (B6 da revisão nº 1).");
      fecha(v); if (!vt.ok) { v.estado = "nao_verificado"; }
      if (govGP) {
        var gg = govGP;
        vGP.formula = "R = w·L/2 por trilho adjacente (cunha = rótula no trilho) a (altura do trilho) do chão; M = R·(resposta do pórtico da estação à carga unitária, sobre os apoios elásticos reais); Md = B1·1,5·M (B1 = 1 acima do último nó); Nd/Nc,Rd + 8/9·Md/MRd ≤ 1";
        vGP.valores = { poste: gg.key, trecho: gg.sg.topo ? "acima do último nó" : "levante " + gg.sg.j, Mguarda_kNm: gg.Mg1, B1: gg.B1g, MdGuarda_kNm: gg.MdG, MRd_kNm: MRd, uso: gg.ug };
        vGP.texto = "Poste " + gg.key + " (" + vGP.valores.trecho + "): guarda-corpo de 90 kgf/m (travessão) / 66 kgf/m (intermediário): M = " + brf(gg.Mg1, 3) + " kN·m característico no pórtico da estação (poste acima do último nó sobre os apoios elásticos reais: elo da transversal, longitudinais e ancoragens); Md = B1·1,5·M = " + brf(gg.MdG, 3) + " kN·m (B1 = Cm/(1 − Nd/Ne) = " + brf(gg.B1g, 3) + ") contra MRd = " + brf(MRd, 3) + " kN·m: uso " + brf(gg.ug, 2) + ". O Corrigir oferece vão menor.";
        vGP.solicitante = "Md = " + brf(gg.MdG, 3) + " kN·m"; vGP.resistente = "MRd = " + brf(MRd, 3) + " kN·m";
        if (P.guardaLaudo) { fecha(vGP); vGP.estado = piorEstado(vGP.estado === "falha" || vGP.estado === "atencao" ? "atencao" : vGP.estado, "atencao"); vGP.ressalvas.push("Solução adotada pelo RT: guarda-corpo ensaiado, laudo nº " + P.guardaLaudo + " — o cálculo continua mostrando uso " + brf(gg.ug, 2) + "; liberação só pelo laudo (atenção, nunca verde)."); }
        else fecha(vGP);
      } else verifs.splice(verifs.indexOf(vGP), 1);
    })();

    /* ============ 6. DIAGONAL (contraventamento): M3.1 (C2) — vento ∥ NÃO é calculado (ver «vento_paralelo»); a verificação é a força NOCIONAL (0,3 %) repartida nas diagonais do lance + a COMPRESSÃO DO TUBO.
       Diagonais transversais (cabeceiras e cantos): só contenção por flambagem (força nodal de 1 %), nunca apoio do vento (C1). A ligação da diagonal continua sem fonte (capDiagKgf = null). */
    var vDg = nova("diagonal_multi", "diagonal", "Diagonal (contraventamento): força nocional repartida e compressão do tubo", "NBR 8800:2008 5.3 (compressão do tubo da diagonal, L = peça, K = 1); força nocional 0,3 % e contenção nodal 1 % (NBR 8800 4.9.7, de memória); capDiagKgf = null (sem fonte)");
    var vEs = nova("espigao", "espigao", "Espigão (emenda do poste): tração de levantamento", "M02 p.17 (pino trava obrigatório em toda união de postes); NBR 8681 (1,0·G − 1,4·W); capacidade do pino/espigão: SEM FONTE (a Layher S05 Tab.17 é de outro fabricante)");
    (function () {
      var v = vDg, ve = vEs;
      v.confirmarRT = ["capDiagKgf (diagonal e ligação do fabricante do locador)", "seção da diagonal = tubo Ø48,3 × 3,0 (o catálogo não dá a parede)", "distribuição igual entre as torres", "vento ∥ à fachada conferido pelo RT (vento_paralelo)"];
      ve.confirmarRT = ["capacidade do espigão/pino trava à tração (fabricante do locador)", "tração por vento ∥ nas cordas das torres (vento_paralelo)"];
      var diags = barras.filter(function (b) { return b.papel === "diagonal"; }), diagsT = barras.filter(function (b) { return b.papel === "diagonalTransv"; });
      /* grupos de direção: trechos com a mesma direção (|u × u'| < 0,05) dividem a força nocional e as torres */
      var grupos = [];
      modelo.trechos.forEach(function (t) {
        var g = null; grupos.forEach(function (gg) { if (Math.abs(gg.u[0] * t.u[1] - gg.u[1] * t.u[0]) < 0.05) g = gg; });
        if (!g) { g = { u: t.u, trechos: [], torres: {} }; grupos.push(g); }
        g.trechos.push(t.ti);
      });
      diags.forEach(function (b) { var t = modelo.trechos[b.trecho]; if (!t) return; grupos.forEach(function (g) { if (g.trechos.indexOf(b.trecho) >= 0) g.torres[r3((b.a[0] + b.b[0]) / 2) + "|" + r3((b.a[2] + b.b[2]) / 2)] = true; }); });
      grupos.forEach(function (g) { g.n = Object.keys(g.torres).length; });
      var govD = null, govV = null;
      function estDiag(uT, capKN, u) {   /* tubo falha → falha (nunca escondida atrás da pendência da ligação); ligação sem fonte e tubo que passa → nao_verificado; atenção do tubo continua atenção */
        var estT = estadoDe(uT);
        return estT === "falha" ? "falha" : (capKN == null ? (estT === "atencao" ? "atencao" : "nao_verificado") : estadoDe(u));
      }
      diags.forEach(function (b) {
        var g = null; grupos.forEach(function (gg) { if (gg.trechos.indexOf(b.trecho) >= 0) g = gg; });
        if (!g || g.n < 1) { peca(v, b.id, null, "nao_verificado"); return; }
        var yA = Math.min(b.a[1], b.b[1]), NA = 0, NG1 = 0; postes.forEach(function (q) { NA += NProf(q.key, yA + 1e-6, 1.25, 1.5); NG1 += NProf(q.key, yA + 1e-6, 1.25, 0); });
        var Vd = Math.max(P.notional * NA, P.notional * NG1) / g.n;
        var dh = hyp(b.b[0] - b.a[0], b.b[2] - b.a[2]), Lg = b.Lgeom || hyp(dh, b.b[1] - b.a[1]), F = Vd * Lg / Math.max(dh, 0.1), nr = NRdDe(b.L), uT = F / nr.NRd, capKN = P.capDiagKgf != null ? kN(P.capDiagKgf) : null, uC = capKN != null ? F / capKN : null, u = Math.max(uT, uC == null ? 0 : uC);
        peca(v, b.id, u, estDiag(uT, capKN, u));
        if (!govD || u > govD.u) govD = { u: u, uT: uT, F: F, Vd: Vd, NRd: nr.NRd, L: b.L, id: b.id, n: g.n, tipo: "vertical" };
        if (!govV || F > govV.F) govV = { F: F, Vd: Vd, n: g.n, id: b.id, uT: uT };
      });
      diagsT.forEach(function (b) {   /* contenção nodal de 1 % dos dois postes da estação no pé do lance (NBR 8800 4.9.7, de memória): F = 0,01·(N_I + N_O)·L_geom/vão */
        var st = stat[b.estacao]; if (!st) { peca(v, b.id, null, "nao_verificado"); return; }
        var yA = Math.min(b.a[1], b.b[1]), Nn = NProf(st.kI, yA + 1e-6, 1.25, 1.5) + NProf(st.kO, yA + 1e-6, 1.25, 1.5);
        var Lg = b.Lgeom || hyp(W, b.b[1] - b.a[1]), F = P.nodalBr * Nn * Lg / Math.max(W, 0.1), nr = NRdDe(b.L), uT = F / nr.NRd, capKN = P.capDiagKgf != null ? kN(P.capDiagKgf) : null, uC = capKN != null ? F / capKN : null, u = Math.max(uT, uC == null ? 0 : uC);
        peca(v, b.id, u, estDiag(uT, capKN, u));
        if (!govD || u > govD.u) govD = { u: u, uT: uT, F: F, Vd: P.nodalBr * Nn, NRd: nr.NRd, L: b.L, id: b.id, n: 1, tipo: "transversal (contenção 1 %)" };
      });
      if (!govD) { verifs.splice(verifs.indexOf(v), 1); }
      else {
        v.formula = "vertical: Vd = 0,003·ΣN (máx. de A e B) / nTorres; F = Vd·L_geom/vão; transversal: F = 0,01·(N_I + N_O)·L_geom/largura; F ≤ Nc,Rd(L peça, K = 1) [e capDiagKgf, se informada]";
        v.valores = { F_kN: govD.F, F_kgf: kgf(govD.F), NcRd_kN: govD.NRd, L_m: govD.L, H_kN: govD.Vd, nTorres: govD.n, usoTubo: govD.uT, capDiagKgf: P.capDiagKgf, tipo: govD.tipo, vertical: govV ? { F_kN: govV.F, H_kN: govV.Vd, nTorres: govV.n, usoTubo: govV.uT, barra: govV.id } : null };
        v.texto = "Diagonal " + govD.id + " (" + govD.tipo + "): a força nocional/nodal H = " + brf(govD.Vd, 3) + " kN dá F = " + nkn(govD.F) + " contra Nc,Rd = " + nkn(govD.NRd) + " (L = " + brf(govD.L, 2) + " m, K = 1): uso do tubo " + brf(govD.uT, 3) + ". O VENTO ∥ à fachada (arrasto de todos os pórticos e atrito na tela) NÃO é calculado — ver a verificação «vento_paralelo». " + (P.capDiagKgf == null ? "A ligação da diagonal não tem carga de fonte (capDiagKgf = null): NÃO VERIFICADA enquanto o tubo passa; se o tubo falha, falha." : "");
        v.solicitante = nkn(govD.F); v.resistente = "Nc,Rd = " + nkn(govD.NRd);
        v.ressalvas.push("Vento ∥ à fachada (arrasto e atrito na tela) fora desta verificação: só a força nocional e a contenção nodal de 1 % (C2 da revisão nº 1 — a faixa fixa de 0,80 m foi removida).");
        if (P.capDiagKgf == null) out.pendencias.push("Informe a carga axial admissível da diagonal e da ligação (capDiagKgf): sem ela a diagonal fica NÃO VERIFICADA (o tubo é verificado).");
        fecha(v); if (P.capDiagKgf == null && v.estado === "ok") v.estado = "nao_verificado";
      }
      /* espigão: a tração de levantamento vem do vento ∥ nas cordas das torres, que NÃO é calculado (C2): a verificação fica nao_verificado, nunca «ok» (a falta de tração não se afirma) */
      var nEm = 0, G0 = null;
      modelo.conexoes.forEach(function (c) {
        if (c.tipo !== "espigao") return; nEm++;
        var b0 = barrasPorId[c.barras[0]]; if (!b0 || !b0.poste) return;
        var key = b0.poste, yE = c.pos[1], G1 = proprioAcima(key, yE); for (var j = 0; j <= nL; j++) if (niv[j].y > yE + 1e-9) G1 += RG(j, key);
        if (P.espigaoTracaoRT) peca(ve, c.id, 0, "ok"); else peca(ve, c.id, null, "nao_verificado");   /* M3.3 (M-N2): o campo próprio do RT (espigaoTracaoRT + justificativa) libera só o espigão */
        if (!G0 || G1 < G0.G) G0 = { G: G1, key: key, y: yE };
      });
      if (!nEm) { verifs.splice(verifs.indexOf(ve), 1); }
      else {
        ve.formula = "T = 1,4·N_corda(vento ∥ na torre) − 1,0·G_acima: o vento ∥ não é calculado (vento_paralelo) → não verificado";
        ve.valores = { G_acima_min_kN: G0 ? G0.G : null, poste: G0 ? G0.key : null, y_m: G0 ? G0.y : null, nEmendas: nEm };
        ve.texto = "O espigão (emenda do poste) só tem tração de levantamento pelo vento ∥ nas cordas das torres de diagonais, que o sistema NÃO calcula (ver «vento_paralelo»): NÃO VERIFICADO. " + (est ? "Linha estribo: a espiga NÃO tem pino trava (M01) — o RT confere a tração." : "O pino trava é obrigatório (M02 p.17, o motor já o põe); a capacidade do pino/espigão à tração não tem fonte.") + " Menor peso acima de uma emenda: " + brf(G0 ? G0.G : 0, 2) + " kN.";
        ve.solicitante = "tração não calculada"; ve.resistente = est ? "sem pino trava (M01)" : "capacidade do pino: sem fonte";
        ve.ressalvas.push("Só o vento ∥ nas torres de diagonais gera tração nas cordas; a tração por tombamento do conjunto sem ancoragem está em «tombamento».");
        if (P.espigaoTracaoRT) { ve.texto += " Conferido pelo responsável técnico (espigaoTracaoRT): " + P.espigaoTracaoJustificativa; ve.resistente = "conferido pelo RT"; ve.confirmarRT.push("capacidade do pino/espigão à tração conferida pelo RT: " + P.espigaoTracaoJustificativa); }
        else if (!est) { out.pendencias.push("Capacidade do espigão/pino trava à tração: sem fonte — informe a do fabricante do locador e registre espigaoTracaoRT + justificativa do RT."); ve.ressalvas.push("Libera-se com espigaoTracaoRT + espigaoTracaoJustificativa (RT)."); }
        fecha(ve); if (!P.espigaoTracaoRT || est) ve.estado = "nao_verificado";
      }
    })();

    /* ============ 6b. VENTO PARALELO À FACHADA (C2): igual ao tubo-roll depois da C-T1 — uma VERIFICAÇÃO nao_verificado que entra no portão; o campo ventoParaleloRT + justificativa do RT a libera */
    (function () {
      var vp0 = nova("vento_paralelo", "vento_paralelo", "Vento paralelo à fachada (arrasto dos pórticos, atrito na tela, cabeceiras) e flambagem ∥ da linha interna", "NBR 6123:2023");
      var conferido = P.ventoParaleloRT && P.ventoParaleloJustificativa.replace(/\s/g, "").length >= 15;
      vp0.solicitante = "—"; vp0.resistente = "—";
      if (conferido) {
        vp0.fonte = "conferido pelo responsável técnico: " + P.ventoParaleloJustificativa;
        vp0.formula = "não calculado pelo sistema: conferido pelo responsável técnico";
        vp0.texto = "O vento paralelo à fachada (arrasto de todos os pórticos, atrito na tela e cabeceiras), a corda tracionada das torres (espigão) e a flambagem ∥ da linha interna NÃO são calculados pelo sistema; foram conferidos pelo responsável técnico — justificativa: " + P.ventoParaleloJustificativa;
        vp0.confirmarRT.push("vento paralelo à fachada conferido pelo RT: " + P.ventoParaleloJustificativa);
        peca(vp0, "fachada", 0, "ok");
      } else {
        vp0.formula = "não calculado: arrasto de todos os pórticos, atrito na tela e arrasto das cabeceiras; corda das torres; flambagem ∥ da linha interna";
        vp0.texto = "O vento paralelo à fachada (arrasto dos postes/transversais/guarda-corpo de TODAS as estações, atrito na tela, cabeceiras) e a flambagem ∥ da linha interna não são calculados pelo sistema: o RT confere as diagonais, as travessas longitudinais, o espigão e o poste interno para esse caso.";
        vp0.ressalvas.push("Vento paralelo à fachada nas diagonais, travessas, espigões e no poste interno (∥): não calculado — o RT confere (NBR 6123:2023).");
        out.pendencias.push("Vento paralelo à fachada (arrasto, atrito na tela, corda das torres, flambagem ∥ da linha interna): não calculado — o RT confere e registra (ventoParaleloRT + justificativa).");
      }
      fecha(vp0);
      if (!conferido) naoV.push("Vento paralelo à fachada (arrasto de todos os pórticos, atrito na tela, cabeceiras), corda tracionada das torres e flambagem ∥ da linha interna: não calculados.");
    })();

    /* ============ 7. TRAVESSA LONGITUDINAL: peso próprio (vertical) + FLEXÃO HORIZONTAL do vento ⟂ (viga contínua entre as estações ancoradas, carga = reação das molas dos pórticos das estações) + força nocional axial.
       A LIGAÇÃO (cunha) à força cortante/axial não tem fonte: o estado nunca é «ok» (M3); a falha do tubo nunca se esconde. */
    var anchF = {};   /* "posteKey|r3(y)" → kN: reação das longitudinais nas estações ANCORADAS (vai para a ancoragem) */
    var vLong = nova("travessa_long_multi", "travessa_long", "Travessa longitudinal: flexão do peso próprio + flexão horizontal do vento ⟂ entre as estações ancoradas", "NBR 8800:2008 5.3 e 5.4 (tubo circular, soma vetorial das flexões vertical e horizontal, como a longitudinal do tubo-roll); NBR 6123:2023; viga contínua entre estações ancoradas (cunhaContinua, ESPEC-M3.1 §1)");
    (function () {
      var v = vLong;
      v.confirmarRT = ["continuidade horizontal da fiada pela cunha (cunhaContinua): sem fonte da rigidez da cunha", "a LIGAÇÃO (cunha) à cortante e ao axial: sem fonte (capNoKgf) — nao_verificado", "força que a fiada leva à torre = nocional do nível"];
      var kN0 = {};   /* corredor "ti|linha|r3(y)" → { Mh, falha, nAp } */
      var corredores = {};   /* ti|linha|y → [bars] */
      barras.forEach(function (b) {
        if (b.papel !== "travessa" || vigasT[b.id] || b.trecho == null) return;
        var ln = b.linha === "e" ? "e" : (b.linha === "i" ? "i" : null); if (!ln) return;
        var k = b.trecho + "|" + ln + "|" + r3(b.a[1]); (corredores[k] = corredores[k] || []).push(b);
      });
      Object.keys(corredores).forEach(function (k) {
        var pr = k.split("|"), ti = Number(pr[0]), ln = pr[1], y = Number(pr[2]);
        if (!vt.ok || !nivAnc[r3(y)] || (nivAnc[r3(y)].topo && ln === "i")) return;
        var pts = [], xs = [];
        arr(estPorTrecho[ti]).forEach(function (e) {
          var st = stat[e.id]; if (!st || st.fem.res[0].instavel) return;
          var lista = st.fem.res[0].Rm[ln === "i" ? "I" : "O"], F = 0; lista.forEach(function (m) { if (Math.abs(m.y - y) < 0.02) F += m.R; });
          xs.push(e.s); if (F !== 0) pts.push({ x: e.s, P: F });
        });
        var ap = apoiosS(ti, y).sort(function (a, b) { return a - b; });
        if (!pts.length) { kN0[k] = { Mh: 0, nAp: ap.length }; return; }
        if (ap.length < 2) { kN0[k] = { Mh: 0, falha: true, nAp: ap.length }; return; }
        var x0 = Math.min.apply(null, xs.concat(ap)), x1 = Math.max.apply(null, xs.concat(ap));
        var res = I.viga({ x0: x0, x1: x1, apoios: ap, EI: EI, h: 0.2 }, [{ pts: pts }])[0], Mh = 0; for (var q3 = 0; q3 < res.M.length; q3++) Mh = Math.max(Mh, Math.abs(res.M[q3]));
        if (res.instavel) { kN0[k] = { Mh: 0, falha: true, mecanismo: true, nAp: ap.length }; return; }
        kN0[k] = { Mh: Mh, nAp: ap.length, vao: (function () { var m3 = 0; for (var a2 = 0; a2 + 1 < ap.length; a2++) m3 = Math.max(m3, ap[a2 + 1] - ap[a2]); return m3; })() };
        /* reações da longitudinal nas estações ancoradas vão para a ancoragem do poste interno (a externa passa pela transversal da estação) */
        res.R.forEach(function (Rr, i) { var eA = null; arr(estPorTrecho[ti]).forEach(function (e) { if (eA == null && Math.abs(e.s - ap[i]) < 1e-6) eA = e; }); if (eA) { var kk = nodePost[eA.I] + "|" + ti + "|" + r3(y); anchF[kk] = (anchF[kk] || 0) + Rr; } });
      });
      var gov = null;
      function NaxDe(k) {   /* força nocional do nível (0,3 % da carga do nível): uma só fiada leva TUDO à torre (conservador) */
        var NAk = 0, NGk = 0; postes.forEach(function (q) { NAk += 1.25 * RG(k, q.key) + 1.5 * RQ(k, q.key); NGk += 1.25 * RG(k, q.key); });
        return Math.max(P.notional * NAk, P.notional * NGk);
      }
      var capLigKN = P.capLigAxialKgf != null ? kN(P.capLigAxialKgf) : null;   /* M4-C: capacidade AXIAL da ligação travessa–roseta (campo próprio; o capNoKgf é a carga vertical) */
      barras.forEach(function (b) {
        if (b.papel !== "travessa" || vigasT[b.id]) return;
        var ln = b.linha === "e" ? "e" : (b.linha === "i" ? "i" : null), ck = b.trecho + "|" + ln + "|" + r3(b.a[1]), cr = ln ? (kN0[ck] || { Mh: 0 }) : { Mh: 0 }, Nax = NaxDe(b.nivel == null ? nL : b.nivel);
        var wb = pesoBarra(b) / b.L, Mv = 1.25 * wb * b.L * b.L / 8, delta = 5 * wb * Math.pow(b.L, 4) / (384 * EI), uF = delta / (b.L / P.flechaTuboRel), nr = NRdDe(b.L), uN = Nax / nr.NRd, pior = null;
        [0.84, 1.4].forEach(function (gW) {
          var M2 = Math.sqrt(Math.pow(gW * cr.Mh, 2) + Mv * Mv), u0 = Math.min(99, uN >= 0.2 ? uN + 8 / 9 * (M2 / MRd) : uN / 2 + M2 / MRd);
          if (!pior || u0 > pior.u) pior = { u: u0, gW: gW, Mh: gW * cr.Mh, Mv: Mv };
        });
        var uLig = capLigKN != null ? Nax / capLigKN : null, u = Math.max(pior.u, uF, uLig == null ? 0 : uLig); if (cr.falha) u = 99;
        peca(v, b.id, u, capLigKN != null && !est ? undefined : semOk(u));   /* a ligação (cunha) ao axial: sem número do fabricante (capLigAxialKgf) nunca «ok» (M4-C); com o número, o uso da ligação entra no máximo */
        if (!gov || u > gov.u) gov = { u: u, uM: pior.Mv / MRd, uF: uF, uN: uN, uLig: uLig, id: b.id, L: b.L, Nax: Nax, NRd: nr.NRd, Mh: pior.Mh, Mv: pior.Mv, falha: !!cr.falha, mec: !!cr.mecanismo, nAp: cr.nAp, vao: cr.vao };
      });
      if (!gov) { verifs.splice(verifs.indexOf(v), 1); return; }
      v.formula = "viga contínua entre as estações ancoradas no nível (carga = reação das molas dos pórticos); uso = √((γW·Mh)² + Mv²)/MRd com Mv = 1,25·w·L²/8; + força nocional axial (5.5.1.2); pior das 2 combinações";
      v.valores = { vao_m: gov.L, N_kN: gov.Nax, NcRd_kN: gov.NRd, usoAxial: gov.uN, usoFlexaoVertical: gov.uM, usoFlecha: gov.uF, usoLigacaoAxial: gov.uLig, capLigAxialKgf: P.capLigAxialKgf, Mh_kNm: gov.Mh, Mv_kNm: gov.Mv, vaoEntreAncoragens_m: gov.vao || null };
      v.texto = gov.falha ? "Travessa " + gov.id + ": " + (gov.mec ? "a fiada forma um MECANISMO entre as estações ancoradas" : "menos de duas estações ancoradas seguram a fiada — o vento não tem caminho até a estrutura") + ": ancore mais estações neste nível (ESPEC-M3.1 §3)." :
        "Travessa " + gov.id + " (vão " + brf(gov.L, 2) + " m): flexão horizontal do vento Mh = " + brf(gov.Mh, 3) + " kN·m (viga contínua entre estações ancoradas) e peso próprio Mv = " + brf(gov.Mv, 3) + " kN·m somados em vetor, contra MRd = " + brf(MRd, 3) + " kN·m; axial nocional " + brf(gov.Nax, 2) + " kN contra Nc,Rd = " + nkn(gov.NRd) + ": uso " + brf(gov.u, 3) + ". " + (capLigKN != null ? "Ligação (cunha) ao esforço axial: " + nkn(gov.Nax) + " contra capLigAxialKgf = " + brf(P.capLigAxialKgf, 0) + " kgf (informado pelo RT, tabela do fabricante): uso " + brf(gov.uLig, 3) + "." : "A LIGAÇÃO (cunha) ao esforço axial NÃO é verificada (capLigAxialKgf não informado, nenhuma fonte pública): o TUBO é verificado e o estado nunca é «ok».") + " A travessa dos pisos e o guarda-corpo têm verificações próprias.";
      v.solicitante = "√(Mh² + Mv²) = " + brf(Math.sqrt(gov.Mh * gov.Mh + gov.Mv * gov.Mv), 3) + " kN·m"; v.resistente = "MRd = " + brf(MRd, 3) + " kN·m";
      if (capLigKN == null) v.ressalvas.push("A ligação (cunha) da travessa ao esforço axial não tem capacidade de fonte (capLigAxialKgf): a verificação não fica «ok» (M3 da revisão nº 1; M4-C).");
      if (!vt.ok) v.ressalvas.push("Sem V0 o vento ⟂ não entra: só o peso próprio e a nocional.");
      if (capLigKN != null) { v.ressalvas.push("Ligação (cunha) da travessa ao axial verificada contra capLigAxialKgf = " + brf(P.capLigAxialKgf, 0) + " kgf (informado pelo RT, tabela do fabricante do locador)."); if (P.cunhaContinua) v.ressalvas.push("Fiada contínua (cunhaContinua): o cortante HORIZONTAL da cunha nas estações ancoradas está coberto só pela justificativa do RT da continuidade, não por um número."); }
      else out.pendencias.push("Capacidade AXIAL da ligação travessa–roseta (capLigAxialKgf), da tabela do fabricante do locador: sem ela a ligação da travessa longitudinal fica NÃO VERIFICADA.");
      fecha(v); if (v.estado === "ok" && (capLigKN == null || est)) v.estado = "nao_verificado";
    })();

    /* ============ 7b. ELO TRANSVERSAL (M3.3, M-N3): com a cunha rótula TODO o vento do poste externo que não vai ao chão passa pelos elos (as transversais, axiais) até o poste interno e a ancoragem. A força de cada
       elo sai do equilíbrio do nó do poste externo no pórtico da estação; o TUBO é verificado (compressão de Nc,Rd com L = comprimento da barra, K = 1 — a tração é coberta, o tubo à tração resiste mais);
       a LIGAÇÃO (cunha ao axial) fica nao_verificado enquanto capLigAxialKgf (campo próprio, M4-C) for null; o capNoKgf é a carga VERTICAL da cunha e NÃO vale como axial. */
    (function () {
      var v = nova("elo_transversal", "elo", "Elo transversal (leva o vento do poste externo à ancoragem): força axial no tubo e na ligação", "NBR 8800:2008 5.3 (tubo, K = 1); vento: NBR 6123:2023; NBR 8681 (1,4·W · 0,84·W + 1,5·guarda-corpo); a ligação da cunha ao axial: SEM FONTE (capNoKgf)");
      v.confirmarRT = ["capLigAxialKgf: capacidade axial da ligação travessa–roseta (tabela do fabricante do locador)", "o elo leva só o vento e o guarda-corpo do poste externo (não leva a ancoragem do piso)"];
      var capKN = P.capLigAxialKgf != null ? kN(P.capLigAxialKgf) : null, gov = null, fim = {};
      Object.keys(stat).forEach(function (id) {
        var st = stat[id], f = st.fem; if (!f || f.res[0].instavel) return;
        f.res[0].elos.forEach(function (el, ke) {
          var Fw = Math.abs(el.F), Fr = 0;
          st.mapa.forEach(function (mp) {
            var srcP = mp.lado === "O" ? 1 : 0, rr = railR(st.e.trecho, srcP === 1 ? st.kO : st.kI, srcP === 1 ? "e" : "i", mp.kp, mp.t);
            if (rr.vet > 0) Fr = Math.max(Fr, rr.vet * Math.abs(f.res[mp.ci].elos[ke].F));
          });
          var Fd = Math.max(1.4 * Fw, 0.84 * Fw + 1.5 * Fr), b = st.linkBar[r3(el.y)]; if (!b) return;
          if (!fim[b.id] || Fd > fim[b.id].Fd) fim[b.id] = { Fd: Fd, Fw: Fw, Fr: Fr, b: b, st: id, y: el.y };
        });
      });
      Object.keys(fim).forEach(function (bid) {
        var x = fim[bid], nr = NRdDe(x.b.L), uT = x.Fd / nr.NRd, estT = estadoDe(uT), uL = capKN != null ? x.Fd / capKN : null, u = Math.max(uT, uL == null ? 0 : uL);
        var es = estT === "falha" ? "falha" : (uL == null ? (estT === "atencao" ? "atencao" : "nao_verificado") : estadoDe(u));
        peca(v, bid, u, es); x.uT = uT; x.NRd = nr.NRd; x.uL = uL;
        if (!gov || u > gov.u) gov = { u: u, x: x };
      });
      if (!gov) { verifs.splice(verifs.indexOf(v), 1); return; }
      var g = gov.x;
      v.formula = "F_elo = equilíbrio do nó do poste externo no pórtico da estação (vento, cunha = rótula); Fd = máx(1,4·F_vento ; 0,84·F_vento + 1,5·R_guarda·F_unit) ≤ Nc,Rd(L da barra, K = 1); ligação: Fd ≤ capLigAxialKgf (campo próprio do RT)";
      v.valores = { barra: g.b.id, estacao: g.st, y_m: g.y, F_vento_kN: g.Fw, F_guarda_kN: g.Fr, Fd_kN: g.Fd, NcRd_kN: g.NRd, L_m: g.b.L, usoTubo: g.uT, capLigAxialKgf: P.capLigAxialKgf, usoLigacao: g.uL };
      v.texto = "Elo " + g.b.id + " (estação " + g.st + ", a " + brf(g.y, 2) + " m): vento no elo = " + brf(g.Fw, 3) + " kN e guarda-corpo = " + brf(g.Fr, 3) + " kN → Fd = " + brf(g.Fd, 3) + " kN contra Nc,Rd = " + nkn(g.NRd) + " (L = " + brf(g.b.L, 2) + " m, K = 1): uso do tubo " + brf(g.uT, 3) + ". " +
        (capKN != null ? "Ligação: Fd contra capLigAxialKgf = " + brf(P.capLigAxialKgf, 0) + " kgf (informado pelo RT, tabela do fabricante): uso " + brf(g.uL, 3) + "." : "A LIGAÇÃO da cunha ao axial NÃO é verificada: capLigAxialKgf não informado (nenhuma fonte pública; o capNoKgf é a carga VERTICAL e não vale como axial).");
      v.solicitante = "Fd = " + brf(g.Fd, 3) + " kN"; v.resistente = "Nc,Rd = " + nkn(g.NRd);
      if (capKN == null) { v.ressalvas.push("A ligação da cunha ao esforço AXIAL do elo não tem fonte (capLigAxialKgf não informado): o tubo é verificado, a ligação não."); if (!out.pendencias.some(function (t) { return /capLigAxialKgf/.test(t); })) out.pendencias.push("Capacidade AXIAL da ligação travessa–roseta (capLigAxialKgf), da tabela do fabricante do locador: sem ela a ligação do elo transversal fica NÃO VERIFICADA."); }
      fecha(v); if ((capKN == null || est) && v.estado === "ok") v.estado = "nao_verificado";
    })();

    /* ============ 8. ANCORAGEM — força de SERVIÇO por ponto (reação do pórtico da estação) contra o chumbador e a abraçadeira */
    (function () {
      var v = nova("ancoragem", "ancoragem", "Ancoragem: força do vento por ponto de amarração (serviço)", "NBR 6123:2023 (vento: S1, S2(z), S3 = 1,00, V0); capAncoragem: HSA Irlanda (referência, não é norma BR) comparada com a força de SERVIÇO; abraçadeira fixa 800 kgf (R1, secundária); cf/ca: SEM FONTE BR");
      v.confirmarRT = ["capAncoragem (6,25 kN, HSA)", "cfTela / caTubo", "categoria e sombreamento da tela", "continuidade horizontal da fiada pela cunha entre as estações ancoradas (cunhaContinua)", "teste de arrancamento em campo: 1,5 × (≥ 3 e ≥ 5 %)", "capacidade da abraçadeira fixa à carga perpendicular (usa os 800 kgf)"];
      if (!modelo.ancoragens.length) { naoV.push("Ancoragem: o andaime não tem ancoragens (ver Estabilidade sem ancoragem)."); verifs.splice(verifs.indexOf(v), 1); return; }
      if (!vt.ok) {
        v.texto = vt.motivo; v.ressalvas.push(vt.motivo); v.solicitante = "—"; v.resistente = nkn(P.capAncoragem); modelo.ancoragens.forEach(function (a) { peca(v, a.barra, null, "nao_verificado"); });
        naoV.push("Ancoragem sob vento: " + vt.motivo); fecha(v); v.estado = "nao_verificado"; return;
      }
      var gov = null, capCl = kN(P.capFixaKgf);
      modelo.ancoragens.forEach(function (a) {
        var st0 = stat[a.estacao], F = 0, inst = false, Fdir = 0;
        if (!st0) { peca(v, a.barra, null, "nao_verificado"); return; }
        /* reação direta dos pórticos das estações cujo poste interno É este (um poste de canto é de duas estações) + reação das longitudinais nas estações ancoradas (anchF) */
        Object.keys(stat).forEach(function (id) {
          var st = stat[id]; if (st.kI !== a.poste || st.e.trecho !== a.trecho) return;
          if (st.fem.res[0].instavel) inst = true;
          st.fem.res[0].anc.forEach(function (r) { if (Math.abs(r.y - a.y) < 0.02) Fdir += r.R; });
        });
        F = Fdir + (anchF[a.poste + "|" + a.trecho + "|" + r3(a.y)] || 0);
        var capAn = P.capAncoragem, capC = (a.abracadeiras || 1) * capCl, u = inst ? 99 : Math.max(F / capAn, F / capC);
        peca(v, a.barra, u, inst ? "falha" : undefined);
        if (!gov || u > gov.u) gov = { u: u, F: F, Fdir: Fdir, Fviga: anchF[a.poste + "|" + a.trecho + "|" + r3(a.y)] || 0, id: a.id, y: a.y, topo: !!a.topo, nab: a.abracadeiras || 1, uAn: F / capAn, uCl: F / capC, estacao: a.estacao };
      });
      out.caminho.ancoragens = modelo.ancoragens.map(function (a) { var fd = 0; Object.keys(stat).forEach(function (id) { var st = stat[id]; if (st.kI !== a.poste || st.e.trecho !== a.trecho) return; st.fem.res[0].anc.forEach(function (r) { if (Math.abs(r.y - a.y) < 0.02) fd += r.R; }); }); var fv = anchF[a.poste + "|" + a.trecho + "|" + r3(a.y)] || 0; return { id: a.id, poste: a.poste, y: a.y, topo: !!a.topo, F_direta_kN: fd, F_viga_kN: fv, F_kN: fd + fv }; });
      var yTopo = temTela ? yTelaFim : topoY;
      v.formula = "F = reação de serviço (sem γ) do pórtico plano da estação no apoio da ancoragem (poste interno) + reação das longitudinais nas estações ancoradas, q(z) = 0,613·(V0·S1·S2(z)·S3)² ≤ min(capAncoragem; nº de abraçadeiras × 800 kgf)";
      v.valores = { V0: vt.V0, S1: vt.S1, S3: vt.S3, categoria: vt.categoria, q_topo_kNm2: qAt(yTopo), F_kN: gov.F, F_direta_kN: gov.Fdir, F_viga_kN: gov.Fviga, capAncoragem_kN: P.capAncoragem, capAbracadeira_kN: gov.nab * capCl, ancoragem: gov.id, cfTela: cfTelaEf, usoChumbador: gov.uAn, usoAbracadeira: gov.uCl };
      v.texto = "V0 = " + brf(vt.V0, 0) + " m/s (" + vt.fonteV0 + "); categoria " + vt.categoria + (P.categoria == null ? " (NÃO informada: pior caso)" : "") + ", classe A, S1 = " + brf(vt.S1, 2) + ", S3 = " + brf(vt.S3, 2) + ", tela cf = " + brf(cfTelaEf, 2) + (P.telaSombreamento == null ? " (sombreamento não informado: 0,75)" : "") + " (q no topo = " + brf(qAt(yTopo), 3) + " kN/m²). Ancoragem " + gov.id + (gov.topo ? " (topo)" : "") + " a " + brf(gov.y, 2) + " m: força de serviço F = " + nkn(gov.F) + " (direta do pórtico " + brf(gov.Fdir, 2) + " kN + reação das longitudinais " + brf(gov.Fviga, 2) + " kN) ≤ " + brf(P.capAncoragem, 2) + " kN (chumbador, uso " + brf(gov.uAn, 3) + ") e ≤ " + gov.nab + " × " + brf(P.capFixaKgf, 0) + " kgf (abraçadeira, uso " + brf(gov.uCl, 3) + "); uso " + brf(gov.u, 3) + ".";
      v.solicitante = nkn(gov.F); v.resistente = nkn(P.capAncoragem);
      fecha(v);
    })();

    /* ============ 9. GUARDA-CORPO — NR-18 18.9.4.2 (REGRA): 90 kgf/m horizontal, flecha ≤ 76 mm; 66 kgf/m no intermediário; 350 N pontual (NBR 6494 3.2.1); alturas 18.12.15.2 */
    (function () {
      var vt1 = nova("guarda_travessao", "guarda", "Guarda-corpo — travessão (90 kgf/m, flecha ≤ 76 mm)", "NR-18 18.9.4.2 (REGRA); NBR 8800:2008 5.4; travessa biapoiada (cunha = rótula)");
      var vt2 = nova("guarda_interm", "guarda", "Guarda-corpo — intermediário (66 kgf/m)", "NR-18 18.9.4.2 (REGRA); NBR 8800:2008 5.4");
      var vt3 = nova("guarda_pontual", "guarda", "Guarda-corpo — carga pontual de 350 N no topo", "NBR 6494:1990 3.2.1 (exemplar não licenciado — conferir); NBR 8800 (My = W·fy, sem γ)");
      var vh = nova("guarda_altura", "guarda", "Guarda-corpo — alturas acima do estrado (travessão 1,00–1,20 m; intermediário 0,50 m)", "NR-18 18.12.15.2 (REGRA: travessão superior entre 1,00 e 1,20 m e intermediário a 0,50 m abaixo do travessão superior)");
      vt3.confirmarRT = ["NBR 6494 em exemplar licenciado"]; vt1.confirmarRT = ["travessão e intermediário NÃO se somam (NR-18 18.9.4.2 a e b são itens separados): decisão do RT", "rodapé: 22 kgf/m é REGRA (18.9.4.2 c) e não é verificada pelo sistema"]; vh.confirmarRT = ["altura do intermediário: 0,50 m abaixo do travessão superior (texto da NR-18 conferido na revisão nº 1)"];
      var g1 = null, g2 = null, g3 = null, gh = null;
      guardRails.forEach(function (b) {
        var vd = b.papel === "guarda" ? vt1 : vt2, w = (b.papel === "guarda" ? P.guardaKgfM : P.intermKgfM) * GRAV / 1000, Lb = b.L;
        /* M1 (M3.1): a flecha do SISTEMA (NR-18 18.9.4.2 a) = a da barra biapoiada + a deformação dos postes na altura do trilho (apoio elástico: R·v do pórtico da estação, como o E4.3 do tubo-roll) */
        var kpb = b.nivel, tb = b.papel === "guarda" ? "g" : "i", dA = dPosteTrilho(posteEm(b.a[0], b.a[2]), kpb, tb), dB = dPosteTrilho(posteEm(b.b[0], b.b[2]), kpb, tb);
        var Md = 1.5 * w * Lb * Lb / 8, deltaB = 5 * w * Math.pow(Lb, 4) / (384 * EI), delta = deltaB + Math.max(dA, dB), uM = Md / MRd, uF = Math.min(99, delta / P.guardaFlechaMax), u = Math.min(99, Math.max(uM, uF)), Pn = P.guardaPontualN / 1000, Mp = Pn * Lb / 4, uP = Mp / My;
        peca(vd, b.id, u); if (b.papel === "guarda") peca(vt3, b.id, uP);
        var x = { u: u, uM: uM, uF: uF, L: Lb, Md: Md, delta: delta, deltaB: deltaB, dPoste: Math.max(dA, dB), w: w, uP: uP, Mp: Mp, id: b.id };
        if (b.papel === "guarda") { if (!g1 || x.u > g1.u) g1 = x; if (!g3 || x.uP > g3.uP) g3 = x; } else if (!g2 || x.u > g2.u) g2 = x;
        /* M6 (M3.1): NR-18 18.12.15.2 — travessão superior entre 1,00 e 1,20 m acima do estrado e intermediário a 0,50 m ABAIXO do travessão superior (medido do travessão, não do estrado) */
        var h = b.a[1] - niv[b.nivel].yPiso, hSup = railY[b.nivel + "|g"] != null ? railY[b.nivel + "|g"] - niv[b.nivel].yPiso : null;
        var hOk = b.papel === "guarda" ? (h >= 1.0 - 1e-6 && h <= 1.2 + 1e-6) : (hSup != null && Math.abs((hSup - h) - 0.5) <= 0.01), ua = hOk ? 0 : 99;
        peca(vh, b.id, ua, hOk ? "ok" : "falha"); if (!gh || (!hOk && gh.ok) || (hOk === gh.ok && b.papel === "guarda" && h < gh.h)) gh = { h: h, id: b.id, papel: b.papel, ok: hOk };
      });
      [[vt1, g1], [vt2, g2]].forEach(function (par2) {
        var v = par2[0], g = par2[1]; if (!g) { verifs.splice(verifs.indexOf(v), 1); return; }
        v.formula = "Msd = 1,5·q·L²/8 ≤ MRd; δ = 5·q·L⁴/(384·E·I) + R·v(poste na altura do trilho) ≤ 0,076 m (barra biapoiada entre os dois postes, cunha = rótula; apoio ELÁSTICO: M1 da revisão nº 1)";
        v.valores = { vao_m: g.L, q_kNm: g.w, q_kgfm: kgf(g.w), Msd_kNm: g.Md, MRd_kNm: MRd, delta_m: g.delta, deltaBarra_m: g.deltaB, deltaPoste_m: g.dPoste, deltaLim_m: P.guardaFlechaMax, usoFlexao: g.uM, usoFlecha: g.uF };
        v.texto = "Vão " + brf(g.L, 2) + " m, q = " + brf(g.w, 4) + " kN/m (" + brf(kgf(g.w), 0) + " kgf/m): Msd = " + brf(g.Md, 3) + " kN·m ≤ MRd = " + brf(MRd, 3) + " kN·m (uso " + brf(g.uM, 3) + "); flecha do sistema = " + brf(g.delta * 1000, 1) + " mm (barra " + brf(g.deltaB * 1000, 1) + " + poste " + brf(g.dPoste * 1000, 1) + ") ≤ 76 mm (uso " + brf(g.uF, 3) + "). Limite de flecha de 76 mm adotado também no intermediário (conservador). O Corrigir oferece o vão menor.";
        v.solicitante = "Msd = " + brf(g.Md, 3) + " kN·m; δ = " + brf(g.delta * 1000, 1) + " mm"; v.resistente = "MRd = " + brf(MRd, 3) + " kN·m; δlim = 76 mm";
        fecha(v);
      });
      if (g3) {
        vt3.formula = "M = P·L/4 (P = 350 N no meio do vão) ≤ My = W·fy (sem deformação permanente)";
        vt3.valores = { P_N: P.guardaPontualN, vao_m: g3.L, M_kNm: g3.Mp, My_kNm: My, uso: g3.uP };
        vt3.texto = "P = " + brf(P.guardaPontualN, 0) + " N, vão " + brf(g3.L, 2) + " m: M = " + brf(g3.Mp, 3) + " kN·m ≤ My = W·fy = " + brf(My, 3) + " kN·m (uso " + brf(g3.uP, 3) + ").";
        vt3.solicitante = "M = " + brf(g3.Mp, 3) + " kN·m"; vt3.resistente = "My = " + brf(My, 3) + " kN·m"; fecha(vt3);
      } else verifs.splice(verifs.indexOf(vt3), 1);
      if (gh) {
        vh.formula = "h(travessão) ∈ [1,00; 1,20] m acima do estrado; h(intermediário) = h(travessão) − 0,50 m (M6)"; vh.valores = { altura_m: gh.h, barra: gh.id };
        vh.texto = "Pior altura: " + gh.id + " (" + gh.papel + ") a " + brf(gh.h, 3) + " m do estrado " + (gh.ok ? "(dentro da regra)" : "(FORA da regra)") + "."; vh.solicitante = "h = " + brf(gh.h, 3) + " m"; vh.resistente = "1,00 a 1,20 m / 0,50 m abaixo do travessão"; fecha(vh);
      } else verifs.splice(verifs.indexOf(vh), 1);
    })();

    /* ============ 10. BASE, CALÇO, APOIO */
    var reacoes = out.reacoes;
    modelo.bases.forEach(function (bs) {
      var key = bs.poste, NG = proprioAcima(key, 0) + (pesoBaseKN[key] || 0), NQ = 0;
      for (var j = 0; j <= nL; j++) { NG += RG(j, key); NQ += RQ(j, key); }
      var Ns = NG + NQ, Nd = 1.25 * NG + 1.5 * NQ, pt = postePorKey[key];
      reacoes.push({ base: bs.id, poste: key, x: pt ? pt.x : null, z: pt ? pt.z : null, NG_kN: NG, NQ_kN: NQ, servico_kN: Ns, servico_kgf: kgf(Ns), elu_kN: Nd, elu_kgf: kgf(Nd), rosca_m: bs.rosca, tipo: bs.tipo });
    });
    (function () {
      var v = nova("base_multi", "base", "Base regulável: rosca ≤ 0,25 m (fabricante) e carga admissível da base do multidirecional", "M02 p.10 e checklist item 15 (rosca ≤ 0,25 m, primária do PEMAX); carga admissível: capBaseMultiKgf (tabela do fabricante do locador — a tabela do tubo-roll NÃO vale para outro sistema, M4 da revisão nº 1)");
      v.confirmarRT = ["capBaseMultiKgf: carga admissível da base do multidirecional (tabela do fabricante do locador)", "regulagem máxima de 0,25 m (M02)"];
      var gov = null;
      reacoes.forEach(function (r) {
        var rosca = r.rosca_m, capRef = I.capBase(rosca * 100), cap = P.capBaseMultiKgf, regMax = (S.baseRegulavel.medidas && S.baseRegulavel.medidas.regulagemMax) || 0.25;
        if (r.tipo !== "regulavel" && r.tipo !== "articulada") { peca(v, r.base, null, "nao_verificado"); return; }
        if (rosca > regMax + 1e-9) { peca(v, r.base, 99, "falha"); v.ressalvas.push("Rosca de " + brf(rosca * 100, 0) + " cm acima do curso de " + brf(regMax * 100, 0) + " cm do fabricante (M02 p.10)."); return; }
        if (cap == null) { peca(v, r.base, null, "nao_verificado"); if (!gov || r.servico_kgf > gov.N) gov = { u: null, N: r.servico_kgf, cap: null, capRef: capRef, rosca: rosca * 100, id: r.base }; return; }
        var u = r.servico_kgf / cap; peca(v, r.base, u, r.tipo === "articulada" || faltaPesoG() ? semOk(u) : undefined);
        if (!gov || gov.u == null || u > gov.u) gov = { u: u, N: r.servico_kgf, cap: cap, capRef: capRef, rosca: rosca * 100, id: r.base };
      });
      if (!gov) { fecha(v); return; }
      v.formula = "rosca ≤ regulagemMax (0,25 m) e N de serviço (G + Q) ≤ capBaseMultiKgf (tabela do fabricante); sem capBaseMultiKgf: nao_verificado";
      v.valores = { N_kgf: gov.N, N_kN: kN(gov.N), cap_kgf: gov.cap, capRefTuboRoll_kgf: gov.capRef, rosca_cm: gov.rosca, base: gov.id };
      v.texto = gov.cap == null ?
        "Base " + gov.id + ", rosca " + brf(gov.rosca, 1) + " cm (≤ 25 cm do M02): N de serviço = " + brf(gov.N, 0) + " kgf (" + brf(kN(gov.N), 2) + " kN). A carga admissível da base do MULTIDIRECIONAL não tem fonte pública: a tabela do tubo-roll" + (gov.capRef != null ? " (" + brf(gov.capRef, 0) + " kgf nesta rosca)" : "") + " NÃO vale para outro sistema e não governa — informe capBaseMultiKgf (tabela do fabricante do locador). Base NÃO VERIFICADA." :
        "Base " + gov.id + ", rosca " + brf(gov.rosca, 1) + " cm (≤ 25 cm do M02) → capBaseMultiKgf = " + brf(gov.cap, 0) + " kgf; N de serviço = " + brf(gov.N, 0) + " kgf (" + brf(kN(gov.N), 2) + " kN); uso " + brf(gov.u, 3) + ".";
      v.solicitante = brf(gov.N, 0) + " kgf"; v.resistente = gov.cap != null ? brf(gov.cap, 0) + " kgf" : "capBaseMultiKgf não informado";
      if (gov.cap == null) { v.ressalvas.push("Informe a carga admissível da base do multidirecional (capBaseMultiKgf): a tabela do tubo-roll não vale para este sistema."); out.pendencias.push("Informe a carga admissível da base regulável do multidirecional (capBaseMultiKgf), da tabela do fabricante do locador: a base fica NÃO VERIFICADA."); }
      if (est) v.ressalvas.push("Linha estribo: o curso da sapata não consta do M01 — vale o limite de 0,25 m do motor e o peso da peça base é desconhecido.");
      fecha(v);
    })();
    var calcoDe = {}; modelo.calcos.forEach(function (c) { calcoDe[c.base] = c; });
    if (modelo.calcos.length) (function () {
      var v = nova("calco", "calco", "Calço de madeira sob a placa-base: compressão", "R1 (apostila, secundária): σadm 87 kgf/cm² sob a placa 120 × 120 mm (12 528 kgf)");
      v.confirmarRT = ["espécie da madeira do calço", "não usar compensado", "placa da base do multidirecional (120 × 120 mm do tubo-roll)"];
      var area = P.placaCm * P.placaCm, cap = P.sigmaCalco * area, gov = null;
      reacoes.forEach(function (r) { if (!calcoDe[r.base]) return; var u = r.servico_kgf / cap; peca(v, calcoDe[r.base].id, u, faltaPesoG() ? semOk(u) : undefined); if (!gov || u > gov.u) gov = { u: u, N: r.servico_kgf, id: r.base }; });
      if (!gov) return;
      v.formula = "N de serviço ≤ σadm·A_placa = " + P.sigmaCalco + " kgf/cm² × (" + P.placaCm + " cm)²";
      v.valores = { N_kgf: gov.N, cap_kgf: cap, area_cm2: area, sigmaAdm_kgfcm2: P.sigmaCalco };
      v.texto = "Base " + gov.id + ": N = " + brf(gov.N, 0) + " kgf ≤ " + brf(cap, 0) + " kgf (" + P.sigmaCalco + " × " + area + " cm²); uso " + brf(gov.u, 3) + ".";
      v.solicitante = brf(gov.N, 0) + " kgf"; v.resistente = brf(cap, 0) + " kgf"; fecha(v);
    })();
    (function () {
      var v = nova("apoio", "apoio", "Apoio: pressão no solo sob o calço (ou a placa)", "Valor de sigmaSolo informado pelo RT (SEM FONTE no sistema); NBR 6494 4.5.1 (exemplar não licenciado)");
      v.confirmarRT = ["tensão admissível do solo / capacidade da laje"];
      if (String(P.apoio).toLowerCase() === "laje") { naoV.push("Apoio em laje: a laje não é verificada — o RT confere a capacidade (e o escoramento) para as reações das bases."); modelo.bases.forEach(function (b) { peca(v, b.id, null, "nao_verificado"); }); v.ressalvas.push("Apoio em laje: não verificado."); fecha(v); return; }
      var conf = P.sigmaSolo != null && P.sigmaSolo > 0 && P.sigmaSoloConfirmado, gov = null;
      reacoes.forEach(function (r) {
        var c = calcoDe[r.base], area = c ? c.L * c.larg : P.placaCm * P.placaCm / 1e4, sig = r.servico_kN / area;
        var u = P.sigmaSolo != null && P.sigmaSolo > 0 ? sig / P.sigmaSolo : null, es = u == null ? "nao_verificado" : (conf ? (faltaPesoG() ? semOk(u) : estadoDe(u)) : (u > 1.0 + 1e-9 ? "falha" : "nao_verificado"));
        peca(v, c ? c.id : r.base, u, es); peca(v, r.base, u, es);
        if (!gov || (u != null && (gov.u == null || u > gov.u)) || (gov.u == null && sig > gov.sig)) gov = { u: u, sig: sig, area: area, N: r.servico_kN, id: r.base, calco: !!c };
      });
      if (!gov) return;
      v.formula = "σ_solo = N de serviço / área do calço ≤ sigmaSolo";
      v.valores = { sigma_kPa: gov.sig, area_m2: gov.area, N_kN: gov.N, sigmaSolo_kPa: P.sigmaSolo, confirmado: conf };
      v.texto = "Base " + gov.id + ": N = " + brf(gov.N, 2) + " kN sobre " + brf(gov.area, 4) + " m² (" + (gov.calco ? "calço de pranchão" : "só a placa-base") + ") → σ = " + brf(gov.sig, 1) + " kPa" + (P.sigmaSolo != null ? " contra sigmaSolo = " + brf(P.sigmaSolo, 0) + " kPa (uso " + brf(gov.u, 3) + ")" : "") + ".";
      v.solicitante = brf(gov.sig, 1) + " kPa"; v.resistente = P.sigmaSolo != null ? brf(P.sigmaSolo, 0) + " kPa" + (conf ? "" : " (NÃO confirmado)") : "sigmaSolo não informado";
      if (!conf) { v.ressalvas.push(P.sigmaSolo == null ? "Tensão admissível do solo não informada: apoio NÃO verificado (o RT informa e confirma sigmaSolo)." : "Tensão admissível do solo informada mas NÃO confirmada pelo RT: apoio não verificado."); naoV.push("Apoio no solo: tensão admissível não " + (P.sigmaSolo == null ? "informada" : "confirmada") + " — σ calculada = " + brf(gov.sig, 1) + " kPa; o RT informa sigmaSolo e confirma (sigmaSoloConfirmado)."); }
      fecha(v); if (!conf) v.estado = v.uso != null && v.uso > 1.0 + 1e-9 ? "falha" : "nao_verificado";
    })();

    /* ============ 11. ESTABILIDADE SEM ANCORAGEM — NR-18 18.12.3 e tombamento por faixas de altura (as mesmas contas do tubo-roll) */
    if (semAnc) (function () {
      var H = topoY, fechado = !!M.fechado, b, Lface, Gfrac = 1, nota = "";
      if (fechado) {
        var best = null, bestT = 0;
        for (var d = 0; d < 180; d += 1) {
          var cs = Math.cos(d * Math.PI / 180), sn = Math.sin(d * Math.PI / 180), mn = Infinity, mx = -Infinity;
          postes.forEach(function (q) { var pr = q.x * cs + q.z * sn; mn = Math.min(mn, pr); mx = Math.max(mx, pr); });
          if (best == null || mx - mn < best) { best = mx - mn; bestT = d; }
        }
        var csP = Math.cos((bestT + 90) * Math.PI / 180), snP = Math.sin((bestT + 90) * Math.PI / 180), mn2 = Infinity, mx2 = -Infinity;
        postes.forEach(function (q) { var pr = q.x * csP + q.z * snP; mn2 = Math.min(mn2, pr); mx2 = Math.max(mx2, pr); });
        b = best; Lface = mx2 - mn2; nota = "anel fechado: base = menor largura do fecho dos postes (" + brf(b, 2) + " m), face = " + brf(Lface, 2) + " m";
        ress.push("Anel sem ancoragem: o RT confirma — tratado como corpo rígido, sem contraventamento em planta calculado."); out.avisos.push("Anel sem ancoragem: o RT confirma a estabilidade (a face a barlavento depende das travessas em flexão horizontal — com cunha = rótula, não depende: confirmar).");
      } else {
        b = W; var Lt = 0, Lmax = 0; modelo.trechos.forEach(function (t) { Lt += t.L; Lmax = Math.max(Lmax, t.L); });
        Lface = Lmax; Gfrac = Lt > 0 ? Lmax / Lt : 1; nota = "andaime aberto: base = largura do próprio andaime (" + brf(W, 2) + " m, da linha interna à externa); face = trecho de " + brf(Lmax, 2) + " m";
      }
      var v1 = nova("estab_nr18", "estabilidade", "Estabilidade sem ancoragem — altura ≤ 4 × menor base (NR-18 18.12.3)", "NR-18 18.12.3 (REGRA)");
      v1.formula = "H/b ≤ 4"; v1.valores = { H_m: H, b_m: b, razao: H / b }; v1.texto = "H = " + brf(H, 2) + " m; " + nota + " → H/b = " + brf(H / b, 2) + " ≤ 4,00; uso " + brf(H / b / 4, 3) + ".";
      v1.solicitante = "H/b = " + brf(H / b, 2); v1.resistente = "4,00"; peca(v1, "andaime", H / b / 4); fecha(v1);
      var v2 = nova("tombamento", "estabilidade", "Tombamento sem ancoragem (ELU2)", "NBR 6123:2023 (S2 por faixa de altura) e NBR 8681 (ELU2 = 1,0·G + 1,4·W)");
      v2.confirmarRT = ["cfTela / caTubo", "S3"];
      var pesoTot = M.pesoTotal;
      if (pesoTot == null) { v2.texto = "Sem o peso total de fonte (" + Object.keys(semPeso).join(", ") + ") o tombamento não é verificado."; v2.ressalvas.push(v2.texto); v2.solicitante = "—"; v2.resistente = "—"; peca(v2, "andaime", null, "nao_verificado"); fecha(v2); naoV.push("Tombamento sem ancoragem: sem o peso total de fonte."); }
      else if (vt.ok) {
        var Gk = pesoTot * GRAV / 1000 * Gfrac, vf = ventoFaixa(0, Math.max(H, temTela ? yTelaFim : topoY)), Mt = 1.4 * Lface * vf.m, Me = 1.0 * Gk * b / 2, u = Mt / Me, Fw = Lface * vf.f;
        v2.formula = "Mtomb = 1,4·L_face·Σ q(z)·cf(y)·Δy·y (faixas de 0,25 m) ≤ Mest = 1,0·G·b/2";
        v2.valores = { Fw_kN: Fw, Mtomb_kNm: Mt, Mest_kNm: Me, G_kN: Gk, b_m: b, H_m: H, Lface_m: Lface, bracoResultante_m: Fw > 0 ? vf.m / vf.f : 0 };
        v2.texto = "Vento por faixas de altura: Fw = " + brf(Fw, 2) + " kN, resultante a " + brf(Fw > 0 ? vf.m / vf.f : 0, 2) + " m do chão; Mtomb = 1,4·" + brf(Lface * vf.m, 2) + " = " + brf(Mt, 2) + " kN·m ≤ Mest = 1,0·" + brf(Gk, 2) + "·" + brf(b / 2, 3) + " = " + brf(Me, 2) + " kN·m; uso " + brf(u, 3) + " (" + nota + ").";
        v2.solicitante = brf(Mt, 2) + " kN·m"; v2.resistente = brf(Me, 2) + " kN·m"; peca(v2, "andaime", u); fecha(v2);
        if (fechado) v2.ressalvas.push("Anel sem ancoragem: o RT confirma.");
      } else { v2.texto = vt.motivo; v2.ressalvas.push(vt.motivo); v2.solicitante = "—"; v2.resistente = "—"; peca(v2, "andaime", null, "nao_verificado"); fecha(v2); naoV.push("Tombamento sem ancoragem: " + vt.motivo); }
    })();

    /* ---------- o que o motor NÃO verifica (listado sempre) */
    naoV.push("Rigidez e resistência da ligação cunha–roseta ao momento e ao corte (a cunha é tratada como rótula): sem fonte pública.");
    naoV.push("Espigão (emenda do poste) à flexão: tratado como RÓTULA no Ncr e na flexão do poste (M3.3, padrão); contínuo só com espigaoRigido + justificativa do RT; capacidade à tração e à flexão sem fonte.");
    naoV.push("Olhal da ancoragem (olhal.carga = null): não é verificado — o ensaio de arrancamento em campo (1,5 × ≥ 3 e ≥ 5 %) está em confirmarRT (B-N3 da revisão nº 2).");
    if (P.capLigAxialKgf == null) naoV.push("Ligação da cunha ao esforço AXIAL do elo transversal (o vento do poste externo passa por ela): sem fonte (capLigAxialKgf não informado); o tubo do elo é verificado em «elo_transversal» (M-N3).");
    naoV.push("Rodapé metálico: a NR-18 18.9.4.2 c) é REGRA (resistir a 22 kgf/m, texto conferido na revisão nº 1) e o sistema NÃO a verifica — o RT confere (B3).");
    naoV.push("Ancoragem sob a carga do guarda-corpo (90 kgf/m, até 2,2 kN no topo) e a força nocional: só o vento de serviço entra na força da ancoragem (B1 da revisão nº 1).");
    naoV.push("Deslizamento das bases sob o vento: a força horizontal que o pórtico leva ao chão (atrito do apoio) não tem fonte — não verificado.");
    naoV.push("Escada de acesso, alçapão e tela: sem verificação de carga (sem fonte).");
    naoV.push("Impacto, queda de material e empuxo horizontal de pessoas além do guarda-corpo: fora do escopo.");
    naoV.push("Material armazenado sobre o andaime durante a tempestade: não considerado (Q = 0 na combinação do vento) — não deixar material sobre o andaime fora do horário de trabalho.");
    if (!temTela) out.avisos.push("Andaime sem tela de fachada (tela = false): a NR-18 18.12.15 manda tela da 1ª plataforma até 2 m acima da última — o RT justifica; o vento usa a faixa cheia do guarda-corpo (18.9.4.2 d).");
    if (est) ress.push("Linha ESTRIBO: o M01 não traz pesos nem cargas — pisos, ligações e pesos ficam NÃO VERIFICADOS; os tubos usam o Ø48,3 × 3,0 do catálogo.");
    if (semBarra.length) out.avisos.push("Piso sem a transversal de apoio no modelo: " + semBarra.slice(0, 5).join(", ") + (semBarra.length > 5 ? "…" : "") + " — a carga desses pisos não foi levada ao poste.");

    out.verificacoes = verifs.filter(function (v) { return v.pecas.length || (v.valores && Object.keys(v.valores).length) || v.texto; });
    /* M5 (M3.1): parâmetro inválido NUNCA apaga uma FALHA já calculada — a peça que falha continua falhando (com o uso calculado), só o que estava ok/atenção vira nao_verificado */
    out.parametrosInvalidos.forEach(function (x) {
      out.verificacoes.forEach(function (v) {
        if (x.tipos.indexOf(v.tipo) < 0) return;
        v.ressalvas.push("Parâmetro «" + x.chave + "» inválido: " + x.motivo + (v.estado === "falha" ? " — a FALHA já calculada permanece (o parâmetro inválido não a apaga)." : "."));
        var temFalha = false;
        Object.keys(v.porPeca).forEach(function (id) { var o = v.porPeca[id]; if (o.estado === "falha") { temFalha = true; } else { o.estado = "nao_verificado"; o.uso = null; } });
        if (temFalha) { v.estado = "falha"; var um = null; Object.keys(v.porPeca).forEach(function (id) { var o = v.porPeca[id]; if (o.estado === "falha" && o.uso != null && (um == null || o.uso > um)) um = o.uso; }); v.uso = um; }
        else { v.estado = "nao_verificado"; v.uso = null; }
      });
    });
    out.ok = true;
    if (!opt.semCorrigir) {
      opt.cache = opt.cache || {};
      out.verificacoes.forEach(function (v) { if ((v.estado === "falha" || v.estado === "atencao") && v.uso != null && v.uso > 0.90 + 1e-9) v.corrigir = corrigir(modelo, par, P, v, opt.cache, II); });
    }
    out.resumo = I.resumir(out.verificacoes);
    out.pendenciasRT = pendenciasRTEstado(P, modelo);
    return out;
  }

  /* ================================================================ CORRIGIR — candidatos do multi (nunca altera sozinho; refaz o cálculo para provar) */
  var VAOS_CAT = [3.14, 2.48, 2.14, 1.64, 1.14, 0.80];
  /* candidatos de malha (ESPEC-M3.1 §6): ancH múltiplo do MAIOR vão do modelo (até 6 m, NBR 6494 4.5.2), ancV múltiplo do levante (até 6 m); só os mais densos que o atual, do menos ao mais denso */
  function malhasMulti(modelo) {
    var par = modelo.par, vmax = 0, vmin = Infinity, lev = par.levanteMax || 2.0;
    modelo.trechos.forEach(function (t) { arr(t.vaos).forEach(function (v) { vmax = Math.max(vmax, v); vmin = Math.min(vmin, v); }); });
    if (!(vmax > 0)) return [];
    var hs = [], vs = [], out = [], i, j;
    for (i = Math.floor(6 / vmax + 1e-9); i >= 1; i--) hs.push(Math.round(i * vmax * 100) / 100);
    for (j = Math.floor(6 / lev + 1e-9); j >= 1; j--) vs.push(Math.round(j * lev * 100) / 100);
    hs.forEach(function (h) { vs.forEach(function (v2) { if (h * v2 > 36 + 1e-9 || h > par.ancH + 1e-9 || v2 > par.ancV + 1e-9 || h * v2 >= par.ancH * par.ancV - 1e-9) return; out.push({ ancH: h, ancV: v2 }); }); });
    out.sort(function (a, b) { return b.ancH * b.ancV - a.ancH * a.ancV; });
    return out;
  }
  function menoresQue(lista, atual) { return lista.filter(function (x) { return x < atual - 1e-9; }); }
  function candidatos(modelo, P, v) {
    var par = modelo.par, c = [];
    function add(campos, texto) { c.push({ par: campos, texto: texto }); }
    function malhas() {   /* M3.1 (ESPEC §6): ancH = múltiplo do vão (a fiada pega a estação mais distante que cabe), ancV = múltiplo do levante (a fiada só cai em nível com transversal) */
      malhasMulti(modelo).forEach(function (x) { add({ ancH: x.ancH, ancV: x.ancV }, "malha de ancoragem de " + brf(par.ancH, 1) + " × " + brf(par.ancV, 1) + " m para " + brf(x.ancH, 2) + " × " + brf(x.ancV, 1) + " m (ancH múltiplo do vão, ancV múltiplo do levante)"); });
    }
    function vaos() {
      menoresQue(VAOS_CAT, par.vaoMax).forEach(function (x) {
        var o = { vaoMax: x }, tx = "vão máximo de " + brf(par.vaoMax, 2) + " m para " + brf(x, 2) + " m (próximo módulo do catálogo)";
        if (par.acesso === "alcapao" && x < 2.48 - 1e-9) { o.acesso = "escada"; tx += " e acesso por escada externa (o alçapão da linha roseta só existe no vão de 2,48 m)"; }
        add(o, tx);
      });
    }
    var t = v.tipo;
    if (t === "piso" || t === "alcapao") vaos();
    else if (t === "guarda" || t === "guarda_poste") { if (par.tela && !par.ancTopo && par.ancoragem !== "nenhuma") add({ ancTopo: true }, "ancoragem no topo da tela (ancTopo)"); vaos(); if (!par.guardaInterno) add({ guardaInterno: true }, "guarda-corpo também na face interna"); }
    else if (t === "poste" || t === "ancoragem" || t === "espigao") { if (par.tela && !par.ancTopo && par.ancoragem !== "nenhuma") add({ ancTopo: true }, "ancoragem no topo da tela (ancTopo)"); malhas(); vaos(); }
    else if (t === "diagonal" || t === "travessa_long") { if (t === "travessa_long") malhas(); menoresQue([5, 4, 3, 2, 1], par.diagCada).forEach(function (x) { add({ diagCada: x }, "uma torre de diagonais a cada " + x + " vão(s) (em vez de " + par.diagCada + ")"); }); }
    else if (t === "transversal" || t === "no_cunha") { menoresQue([1.64, 1.14, 0.80], par.larguraModulo).forEach(function (x) { add({ larguraModulo: x }, "largura do módulo (vão da transversal) de " + brf(par.larguraModulo, 2) + " m para " + brf(x, 2) + " m"); }); vaos(); }
    else if (t === "estabilidade") { if (par.ancoragem === "nenhuma") add({ ancoragem: "tubo" }, "ancorar o andaime na fachada (ancoragem por tubo/gancho)"); }
    return c;
  }
  function corrigir(modelo, parCalc, P, v, cache, II) {
    I = II;
    var AnM = I.AN(), res = [], cands = candidatos(modelo, P, v), melhor = null, segundo = null;
    for (var i = 0; i < cands.length && !melhor; i++) {
      var par2 = I.clone(modelo.par); Object.keys(cands[i].par).forEach(function (k) { par2[k] = cands[i].par[k]; });
      var ck = JSON.stringify(par2), c2 = cache[ck];
      if (!c2) {
        var m2 = null; try { m2 = AnM.montar(par2); } catch (e) { m2 = null; }
        if (!m2 || !m2.ok) { cache[ck] = { ok: false, verificacoes: [] }; continue; }
        c2 = cache[ck] = calcular(m2, parCalc, { semCorrigir: true }, II);
      }
      var v2 = null; c2.verificacoes.forEach(function (x) { if (x.tipo === v.tipo) v2 = v2 && v2.uso != null && (x.uso == null || x.uso <= v2.uso) ? v2 : x; });
      if (!v2 || v2.uso == null) continue;
      if (v2.uso <= 0.90 + 1e-9) melhor = { cand: cands[i], uso: v2.uso, resumo: c2.resumo };
      else if (v2.uso <= 1.0 + 1e-9 && !segundo) segundo = { cand: cands[i], uso: v2.uso, resumo: c2.resumo };
    }
    var ach = melhor || segundo;
    if (ach) res.push({ texto: "Alterar: " + ach.cand.texto + " — refeito, esta verificação passa (uso " + brf(ach.uso, 3) + ")." + (ach.resumo ? " Resultado geral: " + ach.resumo : ""), par: ach.cand.par, calc: null, usoRefeito: ach.uso, refeito: true });
    if (v.tipo === "piso") res.push({ texto: "Reduzir a carga de serviço (qServ) ou usar o piso da tabela de maior capacidade (vão menor) — decisão do RT.", par: null, calc: null });
    if (v.tipo === "apoio") res.push({ texto: "Aumentar a área do calço (área necessária = N de serviço / sigmaSolo) ou melhorar o apoio — decisão do RT.", par: null, calc: null });
    if (v.tipo === "guarda_poste" || v.tipo === "guarda") res.push({ texto: "Escora / mão-francesa do poste na altura do guarda-corpo, ou guarda-corpo ensaiado (laudo): o laudo só libera com o RT registrando o nº (estado fica em atenção, nunca verde) — o cálculo não modela.", par: null, calc: { guardaLaudo: "<nº do laudo>" }, exigeLaudo: true });
    if (!ach && v.tipo !== "piso" && v.tipo !== "apoio" && v.tipo !== "guarda_poste") res.push({ texto: "Nenhum valor dos parâmetros testados resolve só por si: reduzir a carga de serviço (qServ) ou reprojetar com o RT.", par: null, calc: null });
    return res;
  }

  /* ================================================================ SIMULAÇÃO (estado por peça para pintar o 3D) */
  function simulacao(modelo, calc) {
    var mapa = {};
    if (!modelo || !modelo.ok || !calc || !calc.ok) return mapa;
    var porId = {}; calc.verificacoes.forEach(function (v) { porId[v.id] = v; });
    function poe(id, v) {
      var o = v && v.porPeca[id]; if (!o) return false;
      var atual = mapa[id], novo = { estado: o.estado, uso: o.uso, verificacao: v.id };
      if (!atual || ORDEM_ESTADO_(novo.estado) > ORDEM_ESTADO_(atual.estado) || (novo.estado === atual.estado && (novo.uso || 0) > (atual.uso || 0))) mapa[id] = novo;
      return true;
    }
    function ORDEM_ESTADO_(e) { return { ok: 0, nao_verificado: 1, atencao: 2, falha: 3 }[e]; }
    function ids(l) { return l.map(function (i) { return porId[i]; }).filter(function (x) { return !!x; }); }
    var papelV = { poste: ["poste_multi", "guarda_poste"], travessa: ["transversal_multi", "travessa_long_multi"], transversal: ["transversal_multi"], guarda: ["guarda_travessao", "guarda_pontual", "guarda_altura"], intermediaria: ["guarda_interm", "guarda_altura"], diagonal: ["diagonal_multi"], diagonalTransv: ["diagonal_multi"], ancoragem: ["ancoragem"] };
    modelo.barras.forEach(function (b) {
      var achou = false; ids(papelV[b.papel] || []).forEach(function (v) { if (poe(b.id, v)) achou = true; });
      /* M3.3 (M-N3): o elo transversal só pinta a barra quando o TUBO está em atenção ou falha (a ligação sem fonte já aparece na cunha; não escurece todas as transversais) */
      if (porId.elo_transversal && porId.elo_transversal.porPeca[b.id] && (porId.elo_transversal.porPeca[b.id].estado === "falha" || porId.elo_transversal.porPeca[b.id].estado === "atencao")) { poe(b.id, porId.elo_transversal); achou = true; }
      if (!achou) mapa[b.id] = { estado: "nao_verificado", uso: null, verificacao: null };
    });
    var barrasPorId = {}; modelo.barras.forEach(function (b) { barrasPorId[b.id] = b; });
    modelo.conexoes.forEach(function (c) {
      var achou = false;
      if (c.tipo === "cunha") { if (poe(c.id, porId.no_cunha)) achou = true; if (!achou) { var b = barrasPorId[c.barras[0]]; var vb = b && mapa[b.id]; if (vb && b.papel !== "transversal" && b.papel !== "travessa") { /* ligação sem carga de fonte: herda a FALHA/ATENÇÃO da barra, nunca o «ok» */ mapa[c.id] = vb.estado === "falha" || vb.estado === "atencao" ? { estado: vb.estado, uso: vb.uso, verificacao: vb.verificacao } : { estado: "nao_verificado", uso: null, verificacao: null }; achou = true; } } }
      else if (c.tipo === "espigao") { if (poe(c.id, porId.espigao)) achou = true; }
      else if (c.tipo === "base") { var bs = null; c.barras.forEach(function (id) { if (mapa[id]) bs = bs; }); }
      if (!achou) mapa[c.id] = { estado: "nao_verificado", uso: null, verificacao: null };
    });
    modelo.pranchas.forEach(function (pr) { var achou = false; ids(["piso_multi", "alcapao_multi"]).forEach(function (v) { if (poe(pr.id, v)) achou = true; }); if (!achou) mapa[pr.id] = { estado: "nao_verificado", uso: null, verificacao: null }; });
    modelo.rodapes.forEach(function (r) { mapa[r.id] = { estado: "nao_verificado", uso: null, verificacao: null }; });
    modelo.bases.forEach(function (b) { var achou = false; ids(["base_multi", "apoio"]).forEach(function (v) { if (poe(b.id, v)) achou = true; }); if (!achou) mapa[b.id] = { estado: "nao_verificado", uso: null, verificacao: null }; });
    modelo.calcos.forEach(function (c) { var achou = false; ids(["calco", "apoio"]).forEach(function (v) { if (poe(c.id, v)) achou = true; }); if (!achou) mapa[c.id] = { estado: "nao_verificado", uso: null, verificacao: null }; });
    return mapa;
  }

  /* ================================================================ MONTAR INTELIGENTE (multi) — mesmo motor de correções do tubo-roll, candidatos do multi
   * Candidatos, por ordem de menor custo: ancTopo · malha de ancoragem (ancH/ancV) · vaoMax (o próximo módulo menor do catálogo) · diagCada (5→1) (ESPEC-M3.1 §6; guardaInterno só no Corrigir).
   * NUNCA mexe em qServ, tela, categoria, capNoKgf, capAncoragem, cargaAdmPosteKgf, mAdmTravessaKgfm (decisão do RT). `passou` = nenhuma falha, recalculado do ZERO;
   * pendências de dado (nao_verificado) não são falha e vêm em `pendencias`. */
  function montarInteligente(par, opcoes, II) {
    I = II; opcoes = opcoes || {};
    var An = I.AN(), calcP = opcoes.calc || {}, maxIt = opcoes.maxIter || 8, cache = {}, mudancas = [];
    var pr = An.normalizar(par || {}), parOrig = I.clone(pr);
    function avaliar(p2) {
      var k = JSON.stringify(p2); if (cache[k]) return cache[k];
      var m = null; try { m = An.montar(p2); } catch (e) { m = null; }
      if (!m || !m.ok) return (cache[k] = { ok: false, erro: m && m.erro });
      var c = calcular(m, calcP, { semCorrigir: true }, II);
      return (cache[k] = { ok: true, m: m, c: c, sc: I.pontuar(c) });
    }
    var cur = avaliar(pr), historico = [];
    if (!cur.ok) return { passou: false, erro: "o andaime não monta com estes parâmetros" + (cur.erro ? ": " + cur.erro : ""), par: pr, mudancas: [], falhas: [], pendencias: [] };
    historico.push({ rotulo: "par de entrada", n: cur.sc.n, soma: cur.sc.soma });
    function falhasDe(c, tipos) { return c.verificacoes.filter(function (v) { return v.estado === "falha" && (!tipos || tipos.indexOf(v.tipo) >= 0); }); }
    function motivoDe(c, tipos) { return falhasDe(c, tipos).sort(function (a, b) { return (b.uso || 0) - (a.uso || 0); }).slice(0, 3).map(function (v) { return v.titulo + " (uso " + brf(Math.min(v.uso == null ? 99 : v.uso, 99), 2) + ")"; }).join("; "); }
    function aplicar(p2, c0, tipos, rotulo) { Object.keys(p2).forEach(function (k) { if (JSON.stringify(p2[k]) !== JSON.stringify(pr[k])) mudancas.push({ campo: k, de: pr[k], para: p2[k], motivo: rotulo + " — " + motivoDe(c0, tipos) }); }); pr = p2; }
    function tentar(candidatosL, tipos, rotulo) {
      var bestC = null, bestS = null;
      for (var i = 0; i < candidatosL.length; i++) {
        var p2 = I.clone(pr); Object.keys(candidatosL[i]).forEach(function (k) { p2[k] = candidatosL[i][k]; });
        var e = avaliar(p2); if (!e.ok) continue;
        if (!I.melhor(e.sc, cur.sc) && !(e.sc.n === cur.sc.n && falhasDe(e.c, tipos).length < falhasDe(cur.c, tipos).length)) continue;
        if (falhasDe(e.c, tipos).length === 0) { bestC = p2; bestS = e; break; }
        if (!bestS || I.melhor(e.sc, bestS.sc)) { bestC = p2; bestS = e; }
      }
      if (!bestC) return false;
      aplicar(bestC, cur.c, tipos, rotulo); cur = bestS; historico.push({ rotulo: rotulo, n: cur.sc.n, soma: cur.sc.soma }); return true;
    }
    var T_DIAG = ["diagonal", "estabilidade"], T_TOPO = ["guarda", "guarda_poste", "poste"], T_ANC = ["ancoragem", "poste", "espigao", "travessa_long"];
    var passos = [
      function () { if (!(pr.tela && pr.ancoragem !== "nenhuma" && !pr.ancTopo) || !falhasDe(cur.c, T_TOPO).length) return false; return tentar([{ ancTopo: true }], T_TOPO, "ancoragem no topo da tela (ancTopo)"); },
      function () {
        if (pr.ancoragem === "nenhuma" || !falhasDe(cur.c, T_ANC).length) return false;
        var cs = malhasMulti(cur.m).map(function (x) { return { ancH: x.ancH, ancV: x.ancV }; });
        return tentar(cs, T_ANC, "malha de ancoragem (NBR 6494 4.5.2: ≤ 6 m e ≤ 36 m²; ancH múltiplo do vão, ancV múltiplo do levante)");
      },
      function () {
        var cs = []; VAOS_CAT.forEach(function (x) { if (x < pr.vaoMax - 1e-9) { var o = { vaoMax: x }; if (pr.acesso === "alcapao" && x < 2.48 - 1e-9) o.acesso = "escada"; cs.push(o); } });
        if (!cs.length || !falhasDe(cur.c).length) return false;
        return tentar(cs, null, "vão máximo menor (próximo módulo do catálogo; abaixo de 2,48 m o alçapão não existe e o acesso passa a escada externa)");
      },
      /* M3.3 (M-N1): diagCada só muda quando a verificação das DIAGONAIS ou da ESTABILIDADE é a causa da falha: no modelo o diagCada não muda a conta do poste (o λ∥ do externo só exige «há diagonal no trecho») nem da travessa longitudinal */
      function () { var cs = []; [4, 3, 2, 1].forEach(function (x) { if (x < pr.diagCada) cs.push({ diagCada: x }); }); if (!cs.length || !falhasDe(cur.c, T_DIAG).length) return false; return tentar(cs, T_DIAG, "uma torre de diagonais mais perto (diagCada menor)"); }
    ];
    var it = 0;
    while (it < maxIt && falhasDe(cur.c).length) {
      var mudou = false;
      for (var s2 = 0; s2 < passos.length && !mudou; s2++) mudou = passos[s2]();
      if (!mudou) break;
      it++;
    }
    /* se ainda falha, tenta o mais denso que o gerador permite (vão 0,80 m + escada, ancoragem em toda estação a cada 1,5 m, torre de diagonais em todo vão); só fica se baixar o MAIOR uso */
    if (falhasDe(cur.c).length && pr.ancoragem !== "nenhuma" && it < maxIt) {
      var den = { vaoMax: Math.min(pr.vaoMax, 0.80), ancH: Math.min(pr.ancH, 0.8), ancV: Math.min(pr.ancV, pr.levanteMax || 2.0) };
      if (falhasDe(cur.c, T_DIAG).length) den.diagCada = 1;   /* M3.3 (M-N1): a torre de diagonais em todo vão só quando as diagonais/estabilidade são a falha — caso padrão: 39 diagonais quando 9 bastam */
      if (pr.acesso === "alcapao") den.acesso = "escada";
      if (Object.keys(den).some(function (k) { return JSON.stringify(den[k]) !== JSON.stringify(pr[k]); })) {
        var pD = I.clone(pr); Object.keys(den).forEach(function (k) { pD[k] = den[k]; }); var eD = avaliar(pD);
        if (eD.ok && I.pontuar(eD.c).maior < I.pontuar(cur.c).maior - 1e-6) {
          Object.keys(den).forEach(function (k) { if (JSON.stringify(den[k]) !== JSON.stringify(pr[k])) mudancas.push({ campo: k, de: pr[k], para: den[k], motivo: "densificação máxima do gerador (vão 0,80 m, ancoragem em toda estação em todo nível, torre de diagonais em todo vão) — maior uso " + brf(I.pontuar(cur.c).maior, 2) + " → " + brf(I.pontuar(eD.c).maior, 2) }); });
          var antes = pr;
          pr = pD; cur = eD; it++; historico.push({ rotulo: "densificação máxima", n: cur.sc.n, soma: cur.sc.soma });
          /* M3.3 (M-N1): o que a densificação trocou de uma vez é desfeito UM CAMPO POR VEZ (do mais barato de manter ao mais caro: ancV, ancH, vão) enquanto o andaime continuar sem falha — fica só o necessário */
          if (!falhasDe(cur.c).length) {
            ["ancV", "ancH", "vaoMax"].forEach(function (campo) {
              if (!(campo in den) || JSON.stringify(den[campo]) === JSON.stringify(antes[campo])) return;
              var p3 = I.clone(pr); p3[campo] = antes[campo]; if (campo === "vaoMax" && antes.acesso !== pr.acesso) p3.acesso = antes.acesso;
              var e3 = avaliar(p3); if (!e3.ok || falhasDe(e3.c).length) return;
              mudancas.push({ campo: campo, de: pr[campo], para: antes[campo], motivo: "desfeito: o andaime passa sem esta densificação (M3.3, M-N1)" });
              if (campo === "vaoMax" && antes.acesso !== pr.acesso) mudancas.push({ campo: "acesso", de: pr.acesso, para: antes.acesso, motivo: "desfeito junto com o vão" });
              pr = p3; cur = e3; historico.push({ rotulo: "desfeito: " + campo, n: cur.sc.n, soma: cur.sc.soma });
            });
          }
        }
      }
    }
    /* mudanças repetidas no mesmo campo viram uma linha só (de original → para final) */
    (function () {
      var porCampo = {}, ordem = [];
      mudancas.forEach(function (m) { if (!porCampo[m.campo]) { porCampo[m.campo] = { campo: m.campo, de: m.de, para: m.para, motivo: m.motivo, passos: 1 }; ordem.push(m.campo); } else { porCampo[m.campo].para = m.para; porCampo[m.campo].passos++; } });
      mudancas = ordem.map(function (k) { return porCampo[k]; }).filter(function (m) { return JSON.stringify(m.de) !== JSON.stringify(m.para); });
    })();
    var fin = calcular(cur.m, calcP, {}, II);   /* o par final refeito do zero, COM o corrigir */
    function contaUso(v) { return v.estado !== "nao_verificado" || ((v.tipo === "poste" || v.tipo === "guarda_poste") && fin.vento && fin.vento.ok); }
    var fal = fin.verificacoes.filter(function (v) { return v.estado === "falha"; });
    var faltam = fal.map(function (v) { if (v.uso != null && v.uso >= 99 - 1e-6) return v.titulo + " (uso 99): a estação virou MECANISMO (as emendas do poste são rótulas por padrão, sem fonte da rigidez do espigão, e " + (cur.m.par && cur.m.par.tela ? "o nó de apoio fica sem rotação travada" : "sem tela o topo do poste fica só com apoio de translação") + ") — não é falta de contraventamento em planta. Caminhos: usar tela (o topo vira levante completo), o RT conferir a emenda como contínua (espigaoRigido + espigaoJustificativa) ou cálculo do RT"; return v.titulo + " (uso " + brf(Math.min(v.uso == null ? 99 : v.uso, 99), 2) + ") — já no limite do que o gerador altera (vão, malha de ancoragem, ancoragem de topo, torres de diagonais; a geometria do topo com tela e a ancoragem em nó de transversal já são do motor): o que falta é contraventamento em planta ou diagonal no plano interno (o sistema não calcula), escora/guarda-corpo ensaiado (laudo), carga ou tela menores, ou cálculo do RT"; });
    return {
      faltam: faltam, par: pr, parOriginal: parOrig, modelo: cur.m, calc: fin, mudancas: mudancas, historico: historico, iteracoes: it, passou: fal.length === 0,
      falhas: fal.map(function (v) { return { id: v.id, titulo: v.titulo, uso: v.uso, corrigir: v.corrigir }; }),
      atencao: fin.verificacoes.filter(function (v) { return v.estado === "atencao"; }).map(function (v) { return { id: v.id, titulo: v.titulo, uso: v.uso }; }),
      pendenciasTexto: (fin.pendencias || []).slice(),
      pendencias: fin.verificacoes.filter(function (v) { return v.estado === "nao_verificado"; }).map(function (v) { return { id: v.id, titulo: v.titulo, motivo: (v.ressalvas && v.ressalvas[0]) || v.texto || "" }; }),
      /* M4-C (ressalva 4): o POSTE entra no «maior uso» mesmo nao_verificado (ele fica nao_verificado só por causa do campo paraleloInternoRT, mas o número NBR 8800 dele é conta feita) — com V0 informado; sem V0 o vento não entra e o número não vale */
      maiorUso: fin.verificacoes.reduce(function (m0, v) { return v.uso != null && contaUso(v) ? Math.max(m0, Math.min(v.uso, 99)) : m0; }, 0),
      maiorUsoEm: (function () { var bv = null; fin.verificacoes.forEach(function (v) { if (v.uso != null && contaUso(v) && (!bv || v.uso > bv.uso)) bv = v; }); return bv ? bv.id : null; })()
    };
  }

  var AndaimeMultiCalc = { versao: "M4-C", _legado: LEGADO, pendenciasRT: pendenciasRT, calcular: calcular, simulacao: simulacao, corrigir: corrigir, montarInteligente: montarInteligente, extrasPadrao: extrasPadrao, porteEstacao: function (cfg, casos, Nf, II) { I = II || I; return porteEstacao(cfg, casos, Nf); } };
  global.AndaimeMultiCalc = AndaimeMultiCalc;
  if (typeof module !== "undefined" && module.exports) module.exports = AndaimeMultiCalc;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
