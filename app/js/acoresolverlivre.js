/* =====================================================================
 * acoresolverlivre.js — SOLUÇÕES PARA A ESTRUTURA QUE VIRA MECANISMO
 * (motor PURO, ES5, sem DOM, Node-testável). 15/10/2026.
 *
 * Pedido do Rogério (15/10/2026, print do "Calcular a estrutura desenhada"):
 * "A análise não fechou (ELU2: Estrutura instável (mecanismo) no nó …)" com
 * barra redonda numa diagonal sozinha — "a gente sempre precisa dessas
 * soluções, para o usuário conseguir entender e já resolver; fala o
 * problema e coloca o botão de corrigir o problema, mostrar no 3D".
 *
 * Por que acontece: a barra redonda só trabalha à TRAÇÃO (sai do modelo
 * quando comprimida). Num plano com UMA diagonal só, a combinação que
 * empurra no sentido que a comprime deixa o plano sem travamento — a
 * análise acusa mecanismo. O X (a diagonal do outro sentido) traciona
 * nessa combinação; uma cantoneira/tubo trabalha nos dois sentidos.
 *
 *   diagonaisSemPar(G)            as barras redondas em diagonal sem a do
 *                                 outro sentido: a diagonal oposta (pontas
 *                                 cruzadas do mesmo painel) e o plano
 *   solucoesMecanismo(G, motivo)  as soluções LOCALIZADAS (completar o X,
 *                                 trocar por cantoneira/tubo, engastar as
 *                                 bases, ligações rígidas) com o que muda
 *   aplicarNaEntrada(ent, sol)    a entrada do cálculo numa CÓPIA com a
 *                                 solução (nada é gravado)
 *   testar(ent, sol)              refaz o cálculo inteiro na cópia
 *   escolher(testes)              a mais LEVE que fecha (menor acréscimo
 *                                 de aço; empate → menos mudança)
 *   resolver(ent, solucoes, op)   testa todas (com limite de tempo) e
 *                                 PROPÕE — nunca aplica
 *   opsModelo(sol, caixas, novoId) o lote do editor (um Ctrl+Z) para as
 *                                 soluções que mexem nas peças
 * Regras: a solução proposta é RE-CALCULADA (nunca presumida); ∞/NaN não
 * vira "fecha"; perfil só do catálogo (barra redonda igual à que está;
 * cantoneira/tubo dos catálogos nacionais já carregados); esbeltez da
 * diagonal comprimida pela regra do próprio cálculo (L/r ≤ 200, a mesma
 * do js/acodimlivre.js — NBR 8800, 5.3.4.1).
 * Teste: node tools/test-metal-mecanismo-resolver.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function Cat() { return dep("PerfisAco", "./perfisaco.js"); }
  function Mod() { return dep("AcoModelo", "./acomodelo.js"); }
  function Cri() { return dep("MetalCriar", "./metalcriar.js"); }
  function DL() { return dep("AcoDimLivre", "./acodimlivre.js"); }

  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function br(v, c) { if (v == null || !isFinite(v)) return "—"; c = c == null ? 2 : c; return (Math.round(v * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }
  function copia(o) { return JSON.parse(JSON.stringify(o)); }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function soma(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function mul(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cruz(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function dist(a, b) { return len(sub(a, b)); }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function pt(p) { return [r6(p[0]), r6(p[1]), r6(p[2])]; }
  /* distância do ponto ao segmento a–b */
  function distSeg(p, a, b) { var d = sub(b, a), L2 = dot(d, d); if (!(L2 > 0)) return dist(p, a); var t = Math.max(0, Math.min(1, dot(sub(p, a), d) / L2)); return dist(p, soma(a, mul(d, t))); }

  var TOL_NO = 0.03, TOL_PAR = 0.05, TOL_PLANO = 0.05, LAMBDA_COMP = 200;
  /* catálogos de onde sai a cantoneira/tubo que substitui a barra redonda (nacionais, já no js/perfisaco.js) */
  var SERIES_COMP = ["GERDAU-L", "AM-L", "VMB-TC", "VMB-TQ"];
  var TESTAVEIS = { "completar-x": 1, "completar-x-todos": 1, "trocar-diagonais": 1, "engastar-bases": 1, "ligacoes-rigidas": 1 };

  /* o ponto cai na estrutura? (num nó ou ao longo de uma peça que não seja diagonal) */
  function naEstrutura(G, P) {
    var ks = Object.keys(G.noInfo || {});
    for (var i = 0; i < ks.length; i++) { var I = G.noInfo[ks[i]]; if (I && I.P && dist(I.P, P) <= TOL_NO) return true; }
    return arr(G.membros).some(function (m) { return m.papelLivre !== "diagonal" && m.a && m.b && distSeg(P, m.a, m.b) <= TOL_NO; });
  }
  function temDiagonal(G, C, D) {
    return arr(G.membros).some(function (m) { return m.papelLivre === "diagonal" && m.a && m.b && ((dist(m.a, C) <= TOL_PAR && dist(m.b, D) <= TOL_PAR) || (dist(m.a, D) <= TOL_PAR && dist(m.b, C) <= TOL_PAR)); });
  }
  /* liga A e C por uma peça (as duas pontas ao longo da mesma peça) */
  function aresta(G, A, C) { return arr(G.membros).some(function (m) { return m.papelLivre !== "diagonal" && m.a && m.b && distSeg(A, m.a, m.b) <= TOL_NO && distSeg(C, m.a, m.b) <= TOL_NO; }); }
  /* as pontas cruzadas do painel da diagonal A–B: painel alinhado aos eixos (troca de UMA coordenada) ou, num plano
     inclinado, os dois nós da estrutura que fecham o retângulo com A e B e têm peça nas arestas */
  function oposta(G, A, B) {
    var d = sub(B, A), ax = [0, 1, 2].filter(function (k) { return Math.abs(d[k]) > 0.02; });
    if (ax.length === 2) {
      var i = ax[0], C = A.slice(), D = B.slice(); C[i] = B[i]; D[i] = A[i];
      if (naEstrutura(G, C) && naEstrutura(G, D)) return { C: pt(C), D: pt(D) };
      return null;
    }
    if (ax.length !== 3) return null;
    var M0 = mul(soma(A, B), 0.5), R = dist(A, B) / 2, ks = Object.keys(G.noInfo || {}), melhor = null;
    ks.forEach(function (k) {
      var C = G.noInfo[k].P; if (!C || dist(C, A) <= TOL_NO || dist(C, B) <= TOL_NO || Math.abs(dist(C, M0) - R) > TOL_PAR) return;
      var D = sub(mul(M0, 2), C); if (!naEstrutura(G, D)) return;
      var nA = (aresta(G, A, C) ? 1 : 0) + (aresta(G, C, B) ? 1 : 0) + (aresta(G, B, D) ? 1 : 0) + (aresta(G, D, A) ? 1 : 0);
      if (nA >= 3 && (!melhor || nA > melhor.n)) melhor = { C: pt(C), D: pt(D), n: nA };
    });
    return melhor ? { C: melhor.C, D: melhor.D } : null;
  }
  function nomePlano(n, P) {
    var a = [Math.abs(n[0]), Math.abs(n[1]), Math.abs(n[2])];
    if (a[1] > 0.99) return "plano horizontal y = " + br(P[1], 2) + " m";
    if (a[0] > 0.99) return "plano x = " + br(P[0], 2) + " m";
    if (a[2] > 0.99) return "plano z = " + br(P[2], 2) + " m";
    return "plano inclinado por (" + br(P[0], 2) + "; " + br(P[1], 2) + "; " + br(P[2], 2) + ")";
  }

  /* ================================================================ DIAGONAIS SEM PAR */
  function diagonaisSemPar(G) {
    var out = [];
    arr(G && G.membros).forEach(function (m) {
      if (m.papelLivre !== "diagonal" || m.papel !== "tirante" || !m.a || !m.b) return;
      var o = oposta(G, m.a, m.b); if (!o || temDiagonal(G, o.C, o.D)) return;
      var n = cruz(sub(m.b, m.a), sub(o.C, m.a)), Ln = len(n); if (!(Ln > 1e-9)) return;
      n = mul(n, 1 / Ln);
      out.push({ membro: m.id, peca: String(m.peca), perfil: m.secao && m.secao.nome, a: pt(m.a), b: pt(m.b), C: o.C, D: o.D, L: dist(o.C, o.D), normal: n, plano: nomePlano(n, m.a) });
    });
    return out;
  }
  /* onde a análise acusou o mecanismo: o nó (ou o sub-nó "V9_1#1" = trecho V9_1 da peça V9) → pontos e membros */
  function localDoNo(G, motivo) {
    var noM = (/nó ([^,\s)]+)/.exec(String(motivo || "")) || [])[1] || null, o = { no: noM, pontos: [], membros: [] };
    if (!noM || !G) return o;
    var I = G.noInfo && G.noInfo[noM];
    if (I && I.P) { o.pontos.push(I.P); o.membros = arr(G.membros).filter(function (m) { return arr(m.nos).indexOf(noM) >= 0; }); return o; }
    var seg = String(noM).split("#")[0], B = arr(G.modelo && G.modelo.barras).filter(function (b) { return b.id === seg; })[0];
    if (B) { [B.i, B.j].forEach(function (id) { var J = G.noInfo && G.noInfo[id]; if (J && J.P) o.pontos.push(J.P); }); }
    o.membros = arr(G.membros).filter(function (m) { return arr(m.segs).indexOf(seg) >= 0 || arr(m.nos).indexOf(seg) >= 0 || noM.indexOf(m.id + "_") === 0; });
    if (!o.pontos.length) o.membros.forEach(function (m) { if (m.a) o.pontos.push(m.a); if (m.b) o.pontos.push(m.b); });
    return o;
  }
  function noPlano(d, P) { return Math.abs(dot(d.normal, sub(P, d.a))) <= TOL_PLANO; }

  /* a cantoneira/tubo mais leve do catálogo nacional que atende L/r ≤ 200 na diagonal mais longa (a regra do cálculo) */
  function perfilComprimido(Lmax) {
    var C = Cat(), Mo = Mod(), MC = Cri(), D = DL(); if (!C || !Mo || !D || !D.esbeltezMembro) return null;
    var melhor = null;
    SERIES_COMP.forEach(function (s) {
      C.listar(s).forEach(function (nome) {
        if (MC && MC.desenhavel && !MC.desenhavel(nome)) return;
        var reg = C.obter(nome), sec = reg ? Mo.secaoDe(reg.nome) : null; if (!reg || !sec || !(num(reg.massa, 0) > 0)) return;
        var e = D.esbeltezMembro({ secao: sec, L: Lmax, flambagem: { Lx: Lmax, Ly: Lmax } });
        if (!e || !isFinite(e.lam) || e.lam > LAMBDA_COMP) return;
        if (!melhor || reg.massa < melhor.massa - 1e-9) melhor = { nome: reg.nome, massa: num(reg.massa, 0), lam: e.lam, forma: reg.forma };
      });
    });
    return melhor;
  }
  function massaDe(nome) { var C = Cat(), c = C && C.obter(nome); return c ? num(c.massa, NaN) : NaN; }

  /* ================================================================ AS SOLUÇÕES */
  function solucoesMecanismo(G, motivo, op) {
    op = op || {};
    var sol = [], L = localDoNo(G, motivo), todas = diagonaisSemPar(G);
    var locais = todas.filter(function (d) { return L.pontos.some(function (P) { return noPlano(d, P); }); });
    if (!locais.length) locais = todas;
    function planos(ds) { var p = []; ds.forEach(function (d) { if (p.indexOf(d.plano) < 0) p.push(d.plano); }); return p; }
    function completar(ds, id, rot) {
      var novas = ds.map(function (d) { return { a: d.C, b: d.D, cat: d.perfil, de: d.peca, membro: d.membro, L: d.L }; });
      var kg = novas.reduce(function (t, q) { return t + q.L * massaDe(q.cat); }, 0);
      sol.push({ id: id, texto: "Completar o X" + rot + ": criar a diagonal do outro sentido (" + (ds[0].perfil || "o mesmo perfil") + ", pontas cruzadas) em " + ds.length + " painel(is) — " + planos(ds).join("; ") + ". Em cada combinação uma das duas fica tracionada e o plano fica travado.",
                 muda: "cria " + novas.length + " diagonal(is): " + ds.map(function (d) { return "par de " + d.membro; }).join(", "), novas: novas, pecas: ds.map(function (d) { return d.peca; }), massa: kg, mudancas: novas.length });
    }
    if (locais.length) {
      completar(locais, "completar-x", locais.length < todas.length ? " no plano do problema" : "");
      if (locais.length < todas.length) completar(todas, "completar-x-todos", " em todos os planos com diagonal sozinha");
      var Lmax = locais.reduce(function (t, d) { return Math.max(t, dist(d.a, d.b)); }, 0), pc = perfilComprimido(Lmax);
      if (pc) {
        var kgT = locais.reduce(function (t, d) { var Ld = dist(d.a, d.b); return t + Ld * (pc.massa - num(massaDe(d.perfil), 0)); }, 0);
        sol.push({ id: "trocar-diagonais", texto: "Trocar a barra redonda das " + locais.length + " diagonal(is) sozinha(s) por " + pc.nome + " (" + (pc.forma === "L" ? "cantoneira" : "tubo") + ": trabalha à tração E à compressão; L/r = " + br(pc.lam, 0) + " ≤ 200) — o plano fica travado com uma diagonal só.",
                  muda: "troca o perfil de " + locais.map(function (d) { return d.membro; }).join(", ") + ": " + (locais[0].perfil || "") + " → " + pc.nome, trocas: locais.map(function (d) { return { peca: d.peca, membro: d.membro, de: d.perfil, para: pc.nome }; }), pecas: locais.map(function (d) { return d.peca; }), massa: kgT, mudancas: locais.length });
      }
    }
    var basesRot = arr(G && G.bases).filter(function (b) { return b.tipo !== "engastada"; }).length;
    if (basesRot) sol.push({ id: "engastar-bases", texto: "Engastar as bases dos pilares (" + basesRot + " base(s) rotulada(s) passam a engastadas: a fundação passa a receber MOMENTO — informe o fck da fundação para a placa de base)", efeito: EFEITO["engastar-bases"], muda: basesRot + " base(s) rotulada(s) → engastada(s)", massa: 0, mudancas: basesRot, estado: { basePadrao: "engastada" } });
    var temRig = arr(G && G.membros).some(function (m) { return (m.pontas.ini || {}).tipo === "rigida" || (m.pontas.fim || {}).tipo === "rigida"; });
    var nVig = arr(G && G.membros).filter(function (m) { return m.papelLivre === "viga" && ((m.pontas.ini || {}).tipo === "rotulada" || (m.pontas.fim || {}).tipo === "rotulada"); }).length;
    if (!temRig && nVig && !op.semRigidas) sol.push({ id: "ligacoes-rigidas", texto: "Ligações viga × pilar RÍGIDAS (chapa de topo — pórtico): as vigas passam a travar os pilares pelo momento", efeito: EFEITO["ligacoes-rigidas"], muda: "ligações viga × pilar sem desenho: rotuladas → rígidas (" + nVig + " viga(s))", massa: 0, mudancas: nVig, estado: { vigaPilar: "rigida" } });
    return { solucoes: sol, no: L.no, pecas: L.membros.map(function (m) { return String(m.peca); }).concat(locais.map(function (d) { return d.peca; })).filter(function (x, i, a) { return a.indexOf(x) === i; }), semPar: todas };
  }

  /* as soluções de apoio/ligação que vêm sem dados (as do js/acomodelolivre.js, estabilidade) valem o mesmo que as daqui */
  var ESTADO_POR_ID = { "engastar-bases": { basePadrao: "engastada" }, "ligacoes-rigidas": { vigaPilar: "rigida" } };
  function estadoDe(sol) { return sol ? (sol.estado || (!sol.novas && !sol.trocas ? ESTADO_POR_ID[sol.id] : null) || null) : null; }

  /* ================================================================ NUMA CÓPIA */
  function aplicarNaEntrada(entrada, sol) {
    var MC = Cri(), e = copia(entrada || {}); e.otimizar = false;
    if (!sol) return { erro: "Sem solução." };
    var est = estadoDe(sol);
    if (est) {
      e.apoios = e.apoios || {}; e.ligacoes = e.ligacoes || {};
      if (est.basePadrao) e.apoios.basePadrao = est.basePadrao;
      if (est.vigaPilar) { e.ligacoes.vigaPilar = est.vigaPilar; e.ligacoes.vigaPilarX = est.vigaPilar; e.ligacoes.vigaPilarY = est.vigaPilar; }   /* 1.2.149: X/Y mandam sobre o vigaPilar antigo (#51) */
      return { entrada: e };
    }
    if (!arr(sol.novas).length && !arr(sol.trocas).length) return { erro: "a solução não diz o que mudar" };
    if (!MC) return { erro: "O motor das peças (js/metalcriar.js) não carregou." };
    var cx = arr(e.caixas), k = 0, erros = [];
    arr(sol.novas).forEach(function (q) {
      var c = MC.barra(q.a, q.b, { ferr: "diagonal", cat: q.cat });
      if (!c || c.erro) { erros.push((c && c.erro) || "diagonal não criada"); return; }
      c.id = "resolver-" + (++k); cx.push(c);
      if (arr(e.ids).length) e.ids.push(c.id);
    });
    arr(sol.trocas).forEach(function (t) {
      for (var i = 0; i < cx.length; i++) {
        if (String(cx[i].id) !== String(t.peca)) continue;
        var cat = MC.perfilCat(t.para), r = cat ? MC.editar(cx[i], { cat: cat }) : { erro: t.para + " não é desenhável" };
        if (!r || r.erro || !r.caixa) { erros.push((r && r.erro) || "troca recusada"); return; }
        var nc = r.caixa; nc.id = cx[i].id; cx[i] = nc; return;
      }
      erros.push("peça " + t.peca + " não está no modelo");
    });
    e.caixas = cx;
    return erros.length ? { erro: erros.join("; "), entrada: e } : { entrada: e };
  }
  /* as barras com alguma razão NaN/∞ (a da barra, as das verificações, as de serviço) */
  function razoesRuins(r) {
    var o = [], fin = function (v) { return typeof v === "number" && isFinite(v); };
    Object.keys((r && r.membros) || {}).forEach(function (k) { var v = r.membros[k] || {}; if (!fin(v.razao) || arr(v.verificacoes).some(function (q) { return q && q.razao != null && !fin(q.razao); })) o.push(k); });
    arr(r && r.servico).forEach(function (sv) { if (sv && !fin(sv.razao) && o.indexOf(sv.membro) < 0) o.push(String(sv.membro)); });
    return o;
  }
  function testar(entrada, sol, op) {
    /* sem dados (as da estabilidade): apoio/ligação não acrescenta aço (0 kg) — o resto sem massa conhecida não vira "fecha" */
    var D = DL(), t0 = Date.now(), kg = sol.massa != null ? num(sol.massa, NaN) : (estadoDe(sol) ? 0 : NaN);
    var o = { id: sol.id, texto: sol.texto, muda: sol.muda || sol.texto, massa: kg, mudancas: num(sol.mudancas, 1), fecha: false, local: !!LOCAIS[sol.id], efeito: sol.efeito || EFEITO[sol.id] || null };
    if (!TESTAVEIS[sol.id]) { o.motivo = "solução sem teste automático"; o.naoTestada = true; return o; }
    var ap = aplicarNaEntrada(entrada, sol);
    if (ap.erro) { o.motivo = "não deu para montar a solução: " + ap.erro; return o; }
    var r; try { r = D.calcular(ap.entrada, op && op.calc); } catch (e) { r = { ok: false, motivo: "erro no cálculo: " + (e && e.message) }; }
    o.tempoMs = Date.now() - t0;
    o.fecha = !!(r && r.ok === true && isFinite(num(r.peso, NaN)) && isFinite(kg));
    o.aprovado = !!(r && r.aprovado); o.falhas = r ? r.falhas : null; o.peso = r ? r.peso : null; o.situacao = r && r.situacao ? r.situacao.id : null;
    /* REVISÃO (15/10/2026): fechou mas alguma razão de verificação é NaN/∞ → CÁLCULO INCONSISTENTE — nunca "1 falha, ajuste
       os perfis depois" e nunca proposta */
    if (o.fecha) { var ruins = razoesRuins(r); if (ruins.length) { o.fecha = false; o.inconsistente = true; o.aprovado = false; o.motivo = "cálculo inconsistente — não use (razão sem número em " + ruins.slice(0, 4).join(", ") + (ruins.length > 4 ? "…" : "") + ")"; } }
    if (!o.fecha && !o.motivo) o.motivo = String((r && (r.motivo || (arr(r.problemas)[0] || {}).texto)) || "o cálculo não fechou").slice(0, 400);
    return o;
  }
  /* a mais LEVE que fecha (menor acréscimo de aço), empate (±0,05 kg) → a de menos mudança; nenhuma fecha → nenhuma */
  /* CRITÉRIO (decisão da gerência, 15/10/2026 — "menos kg" sozinho subestima a fundação; desde a 1.2.148 a placa engastada
     sem fck fica A CONFIRMAR):
     (1) LOCAIS primeiro, onde está o problema (completar o X, trocar a barra redonda): entre elas, a de menor acréscimo de
         aço (empate ±0,05 kg → menos mudança);
     (2) GLOBAIS só se nenhuma local fecha: ligações rígidas antes de engastar as bases (engastar muda a fundação);
     (3) a que não fecha nunca é proposta; o quadro mostra todas as que fecham, cada uma com "Aplicar esta". */
  var LOCAIS = { "completar-x": 1, "completar-x-todos": 1, "trocar-diagonais": 1 }, ORDEM_GLOBAL = { "ligacoes-rigidas": 1, "engastar-bases": 2 };
  var EFEITO = { "engastar-bases": "a fundação passa a receber momento; informe o fck da fundação (sem ele a placa de base engastada fica A CONFIRMAR)",
                 "ligacoes-rigidas": "os nós viga × pilar passam a transmitir momento (chapa de topo a detalhar); as bases não mudam" };
  function local(t) { return !!LOCAIS[t.id]; }
  function nomeSol(t) { return String(t.texto || t.id).split(" — ")[0].split(": ")[0].split(" (")[0]; }
  function escolher(testes) {
    var ok = arr(testes).filter(function (t) { return t.fecha; });
    if (!ok.length) {
      var feitos = arr(testes).filter(function (t) { return !t.naoTestada; });
      return { proposta: null, porque: !feitos.length ? "Nenhuma solução pôde ser testada." : "Nenhuma das " + feitos.length + " soluções testadas fecha a análise: " + feitos.map(function (t) { return nomeSol(t) + " — " + (t.motivo || "não fechou"); }).join(" | ") };
    }
    ok.sort(function (a, b) {
      var la = local(a), lb = local(b); if (la !== lb) return la ? -1 : 1;
      if (la) { var d = num(a.massa, 0) - num(b.massa, 0); if (Math.abs(d) > 0.05) return d; return num(a.mudancas, 0) - num(b.mudancas, 0); }
      return (ORDEM_GLOBAL[a.id] || 9) - (ORDEM_GLOBAL[b.id] || 9);
    });
    var p = ok[0], nLoc = ok.filter(local).length, seg = ok[1];
    var porque = local(p) ? "Solução LOCAL, onde está o problema: das " + nLoc + " locais que fecham, a de menor acréscimo de aço (" + br(num(p.massa, 0), 1) + " kg)." + (ok.length > nLoc ? " As globais que também fecham (" + ok.filter(function (t) { return !local(t); }).map(nomeSol).join("; ") + ") mexem na estrutura inteira ou na fundação — ficam como alternativa." : "")
                          : "Nenhuma solução local fecha: proposta a global de menor impacto (" + (p.id === "ligacoes-rigidas" ? "ligações rígidas antes de engastar, que muda a fundação" : nomeSol(p)) + "). Efeito: " + (EFEITO[p.id] || p.muda || "") + ".";
    if (seg) porque += " A seguinte: " + nomeSol(seg) + (local(seg) ? " (" + br(num(seg.massa, 0), 1) + " kg)" : "") + ".";
    return { proposta: p.id, porque: porque, local: local(p), efeito: EFEITO[p.id] || null };
  }
  function resolver(entrada, solucoes, op) {
    op = op || {}; var lim = num(op.limiteMs, 30000), t0 = Date.now(), testes = [];
    arr(solucoes).forEach(function (s) {
      if (Date.now() - t0 > lim) { testes.push({ id: s.id, texto: s.texto, muda: s.muda, massa: s.massa, fecha: false, naoTestada: true, motivo: "não testada: passou do limite de tempo" }); return; }
      testes.push(testar(entrada, s, op));
    });
    var e = escolher(testes); e.testes = testes; e.tempoMs = Date.now() - t0;
    return e;
  }

  /* ================================================================ NO MODELO (um lote, um Ctrl+Z) */
  function opsModelo(sol, caixas, novoId) {
    var MC = Cri(); if (!MC || !sol) return { lote: null, n: 0, erros: ["motor das peças não carregou"] };
    var por = {}; arr(caixas).forEach(function (c) { if (c) por[String(c.id)] = c; });
    var ops = [], erros = [], nid = function () { return String(typeof novoId === "function" ? novoId() : "r" + Date.now() + Math.round(Math.random() * 1e6)); };
    arr(sol.novas).forEach(function (q) { var c = MC.barra(q.a, q.b, { ferr: "diagonal", cat: q.cat }); if (c && !c.erro) ops.push({ op: "criar", id: nid(), caixa: c }); else erros.push((c && c.erro) || "diagonal"); });
    arr(sol.trocas).forEach(function (t) {
      var c = por[String(t.peca)]; if (!c) { erros.push("peça " + t.peca + " não está mais no modelo"); return; }
      var cat = MC.perfilCat(t.para), r = cat ? MC.editar(c, { cat: cat }) : null;
      if (!r || r.erro || !r.caixa) { erros.push(t.membro + ": " + ((r && r.erro) || "perfil " + t.para + " não desenhável")); return; }
      ops.push(MC.opAjustar(String(t.peca), r.caixa));
    });
    if (!ops.length) return { lote: null, n: 0, erros: erros };
    return { lote: { op: "lote", id: nid(), origem: "metal-calc-livre-resolver", pedido: sol.texto, ops: ops }, n: ops.length, erros: erros };
  }

  var AcoResolverLivre = { diagonaisSemPar: diagonaisSemPar, localDoNo: localDoNo, solucoesMecanismo: solucoesMecanismo, perfilComprimido: perfilComprimido, aplicarNaEntrada: aplicarNaEntrada, testar: testar, escolher: escolher, resolver: resolver, opsModelo: opsModelo, estadoDe: estadoDe, EFEITO: EFEITO, LOCAIS: LOCAIS, TESTAVEIS: TESTAVEIS, LAMBDA_COMP: LAMBDA_COMP };
  global.AcoResolverLivre = AcoResolverLivre;
  if (typeof module !== "undefined" && module.exports) module.exports = AcoResolverLivre;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
