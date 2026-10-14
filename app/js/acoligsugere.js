/* =====================================================================
 * acoligsugere.js — LIGAÇÃO INTELIGENTE: entende as peças selecionadas
 * (pilar e viga, viga e viga, pilar sozinho, diagonal, barras de treliça…)
 * e SUGERE até 3 ligações ranqueadas, cada uma DIMENSIONADA (js/acoligcalc2.js)
 * — motor PURO, ES5, sem DOM, Node-testável.
 *
 *   analisar(caixas, op)   peças do modelo (BimMetal) → CONTEXTO:
 *       { ok, relacao: "viga-pilar"|"viga-viga"|"emenda-viga"|"cumeeira"|"emenda-pilar"|"base"|"contraventamento"|
 *                      "no-trelica"|"tubular"|"terca",
 *         face: "mesa"|"alma", angulo (°), topoPilar (a viga chega a menos de d do topo do pilar),
 *         mesmoTopo (viga-viga: topos alinhados → recorte), pecas: [{ id, papel, perfil (mm), aco }],
 *         no: { rigido: true|false|null, fonte, texto } (do cálculo), esforcos: [{comb, V, M, N}], estimativa, avisos }
 *     op = { resultado (o último AcoDimLivre.calcular — esforços e condição do nó), preferir: "rigida"|"flexivel" }
 *   sugerir(ctx, op)       CONTEXTO → { ok, opcoes: [até 3], regras: [as que dispararam], avisos }
 *       opção = { tipologia, nome, familia, regra: {id, texto}, confianca: "alta"|"média"|"baixa", justificativa,
 *                 pros[], contras[], custo {fabricacao, montagem, custo}, resultado (o dimensionamento), passa,
 *                 reforcos[], avisos[] (incoerência com o cálculo, estimativa), aplicar (o que a tela faz no 3D) }
 *   sugerirPecas(caixas, op) = sugerir(analisar(caixas, op), op)
 *   aplicacao(opcao, ctx)  → { macro, ordem ("viga-apoio"…), par (parâmetros do js/metalligacao.js), enrijecedores:
 *                            [{ alvo, x }], aviso } | null (a tipologia não tem desenho automático)
 *
 * REGRAS (cada sugestão diz a regra que a escolheu — REGRAS[id].texto):
 *   R-VP-RIG   nó rígido no cálculo, viga na MESA → chapa estendida (com enrijecedores se a mesa/alma do pilar não
 *              passa), viga soldada direto, talas de mesa; se nada passa, mísula
 *   R-VP-RIG-A nó rígido, viga na ALMA do pilar → momento na alma (aviso: girar o pilar); chapa de topo com enrijecedores
 *   R-VP-ROT   nó rotulado (ou sem cálculo: padrão rotulado), viga na MESA → chapa simples, cantoneira dupla, chapa de
 *              topo curta (reação alta: assento enrijecido)
 *   R-VP-ROT-A nó rotulado, viga na ALMA → chapa simples, cantoneira dupla, assento (a viga entra entre as mesas?)
 *   R-VV-REC   viga em viga com os topos alinhados → recorte da mesa + chapa simples / cantoneira dupla
 *   R-VV-LIV   secundária mais baixa → chapa simples, chapa de topo curta, cantoneira dupla (sem recorte)
 *   R-EV       emenda de viga colinear → talas parafusadas, chapas de topo, talas soldadas
 *   R-CUM      cumeeira (vigas inclinadas que se encontram) → chapas de topo
 *   R-EP       emenda de pilar → talas com contato; chapas de topo quando o perfil muda; soldada
 *   R-BASE-ENG base engastada (cálculo) → placa engastada; placa grossa (> 31,5 mm) ou não passa → nervuras; cortante
 *              acima dos chumbadores → barra de cisalhamento
 *   R-BASE-ROT base rotulada → placa rotulada; cortante alta → barra de cisalhamento
 *   R-CV       diagonal → gusset no nó (ponta perto do pilar) ou no meio do vão; barra redonda → rosca e chapa de apoio
 *   R-TRE      3 ou mais barras → nó de treliça com gusset (ou nó soldado, se tubular)
 *   R-TUB      barras tubulares → nó soldado T/Y ou K (NBR 16239)
 *   R-TER      terça na viga → clip de terça
 *   R-INC      INCOERÊNCIA: rígida num nó que o cálculo trata como rotulado (ou flexível num nó rígido) → aviso
 *              explícito em cada opção e na lista de avisos (nunca silencioso)
 * Sem cálculo: ESTIMATIVA declarada (carga uniforme que leva a viga a 50 % do momento resistente: V = 2·MRd/L,
 * M = MRd/3 na rígida; base: 25 % de A·fy/γa1 do pilar; diagonal: 50 % de Ag·fy/γa1) — marcada em toda opção.
 * Teste: node tools/test-aco-ligsugere.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function Met() { return dep("BimMetal", "./metalpeca.js"); }
  function Cat() { return dep("PerfisAco", "./perfisaco.js"); }
  function Mat() { return dep("AcoMateriais", "./acomateriais.js"); }
  function Tip() { return dep("AcoLigTipos", "./acoligtipos.js"); }
  function C2() { return dep("AcoLigCalc2", "./acoligcalc2.js"); }
  function Dim() { return dep("AcoDimensionar", "./acodimensionar.js"); }

  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function br(v, c) { if (v == null || !isFinite(v)) return "—"; c = c == null ? 1 : c; return (Math.round(v * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function mul(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function unit(a) { var l = len(a); return l > 1e-12 ? mul(a, 1 / l) : [0, 0, 0]; }
  function dist(a, b) { return len(sub(a, b)); }
  var UP = [0, 1, 0], COS_PILAR = Math.cos(15 * Math.PI / 180), G1 = 1.10;

  var REGRAS = {
    "R-VP-RIG": "Nó RÍGIDO no cálculo e viga chegando na MESA do pilar: ligação de momento — chapa de extremidade estendida (enrijecedores de continuidade quando a mesa ou a alma do pilar não resistem à força da mesa da viga), viga soldada direto ou talas de mesa; se nenhuma passa, mísula.",
    "R-VP-RIG-A": "Nó RÍGIDO com a viga na ALMA do pilar: o momento entra pela alma (fraca fora do plano) — a melhor solução é girar o pilar; se não der, chapa de topo com enrijecedores entre as mesas do pilar (verificação da alma fora do plano: não automática).",
    "R-VP-ROT": "Nó ROTULADO (cálculo ou padrão) com a viga na MESA do pilar: ligação flexível — chapa simples (a mais econômica), cantoneira dupla ou chapa de topo curta; reação alta: assento enrijecido.",
    "R-VP-ROT-A": "Nó ROTULADO com a viga na ALMA do pilar: ligação flexível entre as mesas — chapa simples ou cantoneira dupla (a viga tem de caber entre as mesas, senão recorte das mesas da viga) ou assento.",
    "R-VV-REC": "Viga em viga com os TOPOS alinhados: a mesa de cima da secundária é recortada e a alma é ligada à alma da principal (chapa simples ou cantoneira dupla).",
    "R-VV-LIV": "Viga em viga com a secundária MAIS BAIXA que a altura livre da alma da principal: sem recorte — chapa simples, chapa de topo curta ou cantoneira dupla.",
    "R-EV": "Emenda de viga COLINEAR: talas de alma e mesa parafusadas (sem solda na obra), chapas de topo ou talas soldadas.",
    "R-CUM": "Duas vigas inclinadas que se encontram nas pontas (cumeeira): chapas de topo aparafusadas.",
    "R-EP": "Emenda de PILAR (dois pilares colineares): talas com contato pleno; chapas de topo quando o perfil muda; soldada como alternativa.",
    "R-BASE-ENG": "Base ENGASTADA no cálculo: placa de base engastada; placa grossa (> 31,5 mm) ou que não passa → nervuras (enrijecedores); cortante acima do que os chumbadores aguentam → barra de cisalhamento.",
    "R-BASE-ROT": "Base ROTULADA: placa de base rotulada com 4 chumbadores; cortante alta → barra de cisalhamento; fundação existente → chumbador químico.",
    "R-CV": "Diagonal de contraventamento: gusset no nó (ponta perto do pilar) ou no meio do vão da viga; barra redonda → rosca, porca e chapa de apoio.",
    "R-TRE": "Três ou mais barras concorrentes: nó de treliça com gusset aparafusado (perfis abertos).",
    "R-TUB": "Barras de perfil tubular: nó soldado T/Y (uma diagonal) ou K com afastamento (duas), pela NBR 16239.",
    "R-TER": "Terça apoiada na viga: clip de terça.",
    "R-TAB": "Padrão da EMPRESA para esta combinação de seções (tabela guardada pelo usuário): consultado PRIMEIRO; a ligação continua dimensionada e, se não passar, as alternativas das regras vêm atrás.",
    "R-EB": "Emenda de barra tracionada (cantoneira, U ou chapa colineares): talas parafusadas na aba/alma ligada (cantoneira, U) ou dos dois lados (chapa).",
    "R-CRUZ": "Duas diagonais que se cruzam: a interrompida é emendada por talas e um parafuso no cruzamento trava as duas.",
    "R-CON": "Viga que PASSA ao lado do pilar (viga de rolamento, viga apoiada de lado): consolo soldado no pilar, com a viga sentada nele.",
    "R-INC": "Coerência com o cálculo: ligação RÍGIDA num nó que o cálculo trata como ROTULADO (ou flexível num nó rígido) muda o comportamento da estrutura — a opção vai com o aviso e a recomendação de recalcular."
  };

  /* ------------------------------------------------ peças */
  function perfilMm(mb) {
    var p = mb.perfil || {}, C = Cat(), reg = p.cat && C && C.obter ? C.obter(p.cat) : null;
    if (reg && reg.d) return { nome: reg.nome, forma: reg.forma, d: reg.d, bf: reg.bf, tw: reg.tw, tf: reg.tf, r: num(reg.r, 0), A: reg.A, Zx: reg.Zx, Wx: reg.Wx, Ix: reg.Ix, massa: reg.massa };
    if (reg && reg.forma === "L") return { nome: reg.nome, forma: "L", b: num(reg.a, 76), t: reg.t, xc: num(reg.xc, 20), A: reg.A };
    if (reg) return { nome: reg.nome, forma: reg.forma, d: num(reg.d, num(reg.D, 0)), b: num(reg.b, num(reg.B, 0)), t: num(reg.t, num(reg.tdes, 0)), A: reg.A };
    var k = 1000;
    return { nome: p.cat || p.forma || "perfil", forma: p.forma, d: num(p.d, 0) * k, bf: num(p.bf, 0) * k, tw: num(p.tw, 0) * k, tf: num(p.tf, 0) * k, r: num(p.r, 0) * k, b: num(p.b || p.a, 0) * k, t: num(p.t, 0) * k };
  }
  function tubular(pf) { return /^(HSS|TUBO|TC|TQ|TR|CHS|RHS|SHS)/i.test(String(pf.nome || "")) || /tubo|circ|ret/i.test(String(pf.forma || "")) && !(pf.d > 0 && pf.bf > 0); }
  function papelDe(c, mb) {
    var p = String((c.metal && c.metal.papel) || c.tipo || ""), pf = mb ? mb.perfil || {} : {};
    if (pf.forma === "circ" && num(pf.d, 1) < 0.04) return "diagonal";
    if (/contravent|diagonal|m[aã]o.?francesa/i.test(p)) return "diagonal";
    if (/tirante|pendural/i.test(p)) return "tirante";
    if (c.tipo === "pilar" || /^pilar/i.test(p) || (mb && Math.abs(dot(mb.X, UP)) >= COS_PILAR)) return "pilar";
    if (/ter[cç]a|travessa/i.test(p)) return "terca";
    return "viga";
  }
  function aco(id, padrao) { var M = Mat(), a = M && M.aco ? M.aco(id) : null; return a ? { id: a.id, fy: a.fy, fu: a.fu } : padrao; }
  function pontasMb(mb) { return [{ qual: "ini", P: add(mb.P0, [0, 0, 0]) }, { qual: "fim", P: add(mb.P0, mul(mb.X, mb.L)) }]; }
  function distReta(P, O, D) { var d = sub(P, O), t = dot(d, D); return len(sub(d, mul(D, t))); }
  function projT(P, mb) { return dot(sub(P, mb.P0), mb.X); }

  /* ================================================================ ANALISAR */
  function analisar(caixas, op) {
    op = op || {};
    var B = Met(), avisos = [];
    if (!B) return { ok: false, motivo: "O motor das peças (js/metalpeca.js) não carregou." };
    var pecas = [];
    arr(caixas).forEach(function (c) {
      var mb = B.membro(c); if (!mb) return;
      var pf = perfilMm(mb), pap = papelDe(c, mb);
      pecas.push({ id: String(c.id), caixa: c, mb: mb, papel: pap, perfil: pf, aco: aco((c.metal && c.metal.aco) || c.aco, { id: "ASTM A572 Gr.50", fy: 345, fu: 450 }), tubo: tubular(pf) });
    });
    if (!pecas.length) return { ok: false, motivo: "Selecione peças de aço (pilar, viga, diagonal) — chapas e parafusos não contam." };
    var ctx = { ok: true, pecas: pecas.map(function (p) { return { id: p.id, papel: p.papel, perfil: p.perfil, aco: p.aco, tubo: p.tubo }; }), avisos: avisos, face: "mesa", angulo: 90, topoPilar: false, mesmoTopo: false, no: { rigido: null, fonte: "padrão", texto: "sem cálculo: o padrão do cálculo da estrutura desenhada é ROTULADO" } };
    var pil = pecas.filter(function (p) { return p.papel === "pilar"; }), vig = pecas.filter(function (p) { return p.papel === "viga"; }), dia = pecas.filter(function (p) { return p.papel === "diagonal" || p.papel === "tirante"; }), ter = pecas.filter(function (p) { return p.papel === "terca"; });
    var tubos = pecas.filter(function (p) { return p.tubo; });
    var A = null, Bp = null;
    if (pecas.length >= 3 || (tubos.length >= 2 && pecas.length >= 2)) {
      ctx.relacao = tubos.length >= 2 ? "tubular" : "no-trelica";
      ctx.ordem = pecas.map(function (p) { return p.id; });
      var maisCarregada = dia[0] || pecas[pecas.length - 1]; A = maisCarregada;
      if (tubos.length >= 2) { var bz = tubos.slice().sort(function (a, b) { return num(b.perfil.d, num(b.perfil.b, 0)) - num(a.perfil.d, num(a.perfil.b, 0)); })[0]; ctx.banzo = bz.id; ctx.diagonais = tubos.filter(function (t) { return t !== bz; }).map(function (t) { return t.id; }); ctx.ligTubo = ctx.diagonais.length >= 2 ? "K" : "T"; ctx.angulo = angulo(bz.mb.X, tubos.filter(function (t) { return t !== bz; })[0].mb.X); }
    } else if (pecas.length === 1) {
      A = pecas[0];
      if (A.papel === "pilar") { ctx.relacao = "base"; ctx.ordem = [A.id]; }
      else return { ok: false, motivo: "Uma peça só: selecione também a peça onde ela chega (Ctrl + clique) — ou um PILAR para a placa de base." };
    } else {
      var p1 = pecas[0], p2 = pecas[1];
      var colin = Math.abs(dot(p1.mb.X, p2.mb.X)) > 0.996 && pontaMaisPerto(p1.mb, p2.mb).dPontas < 0.05 && p1.papel !== "pilar" && p2.papel !== "pilar";
      if (colin) { ctx.relacao = (p1.perfil.forma === "I" || (p1.perfil.bf > 0 && p1.perfil.tw > 0)) ? "emenda-viga" : "emenda-barra"; A = p1; Bp = p2; }
      else if (ter.length === 1 && (vig.length === 1 || pil.length === 1)) { ctx.relacao = "terca"; A = ter[0]; Bp = vig[0] || pil[0]; }
      else if (dia.length === 2 && cruzam(dia[0].mb, dia[1].mb)) { A = dia[0]; Bp = dia[1]; ctx.relacao = "cruz"; }
      else if (dia.length >= 1) { A = dia[0]; Bp = pecas.filter(function (p) { return p !== A; })[0]; ctx.relacao = "contraventamento"; }
      else if (pil.length === 1 && vig.length === 1) {
        A = vig[0]; Bp = pil[0]; ctx.relacao = "viga-pilar";
        /* a viga PASSA ao lado do pilar (nenhuma ponta encosta nele): consolo */
        var dPon = Math.min.apply(null, pontasMb(A.mb).map(function (q) { return distReta(q.P, Bp.mb.P0, Bp.mb.X); })), mvA = A.mb;
        var cAx = sub(Bp.mb.P0, mvA.P0), tA = dot(cAx, mvA.X), perpAx = distReta(Bp.mb.P0, mvA.P0, mvA.X) - 0, tamP = Math.max(num(Bp.perfil.d, 250), num(Bp.perfil.bf, 250)) / 1000;
        if (dPon > tamP / 2 + num(A.perfil.d, 300) / 1000 + 0.3 && tA > 0.1 && tA < mvA.L - 0.1 && Math.abs(dot(mvA.X, UP)) < 0.2) {
          var Pn = add(mvA.P0, mul(mvA.X, tA)), hz = sub(Pn, Bp.mb.P0); hz = sub(hz, mul(Bp.mb.X, dot(hz, Bp.mb.X)));
          if (len(hz) < tamP / 2 + 1.5) { ctx.relacao = "consolo"; ctx.consolo = { ponto: Pn, dist: len(hz) }; }
        }
      }
      else if (pil.length === 2) { A = p2; Bp = p1; ctx.relacao = Math.abs(dot(p1.mb.X, p2.mb.X)) > 0.996 ? "emenda-pilar" : "viga-pilar"; }
      else {
        var col = Math.abs(dot(p1.mb.X, p2.mb.X)) > 0.996, pn = pontaMaisPerto(p1.mb, p2.mb);
        if (col) { ctx.relacao = (p1.perfil.forma === "I" || (p1.perfil.bf > 0 && p1.perfil.tw > 0)) ? "emenda-viga" : "emenda-barra"; A = p1; Bp = p2; }
        else if (pn.dPontas < Math.max(p1.perfil.d || 200, p2.perfil.d || 200) / 1000 + 0.05) { ctx.relacao = "cumeeira"; A = p1; Bp = p2; }
        else {
          /* a secundária é a que tem a PONTA perto do eixo da outra */
          var d12 = Math.min.apply(null, pontasMb(p1.mb).map(function (q) { return distReta(q.P, p2.mb.P0, p2.mb.X); })), d21 = Math.min.apply(null, pontasMb(p2.mb).map(function (q) { return distReta(q.P, p1.mb.P0, p1.mb.X); }));
          A = d12 <= d21 ? p1 : p2; Bp = A === p1 ? p2 : p1; ctx.relacao = "viga-viga";
        }
      }
      ctx.ordem = [A.id, Bp.id];
      ctx.angulo = angulo(A.mb.X, Bp.mb.X);
    }
    ctx.principal = Bp ? Bp.id : null; ctx.secundaria = A ? A.id : null;
    /* a ponta da peça A no nó e a face do apoio */
    if (A && Bp) {
      /* a ponta de A no nó: perto do EIXO da outra peça; nas emendas (colineares, o eixo é o mesmo) e na cumeeira, perto da PONTA da outra */
      var dPt = function (P) { if (/^emenda|cumeeira/.test(ctx.relacao)) return Math.min.apply(null, pontasMb(Bp.mb).map(function (q) { return dist(P, q.P); })); return distReta(P, Bp.mb.P0, Bp.mb.X); };
      var pt = pontasMb(A.mb).sort(function (a, b) { return dPt(a.P) - dPt(b.P); })[0];
      ctx.ponta = pt.qual; ctx.no = ctx.no || {}; ctx.ponto = pt.P;
      if (ctx.relacao === "viga-pilar" || ctx.relacao === "viga-viga" || ctx.relacao === "contraventamento") {
        var rel = sub(pt.P, Bp.mb.P0); rel = sub(rel, mul(Bp.mb.X, dot(rel, Bp.mb.X)));
        var dir = len(rel) > 1e-6 ? unit(rel) : unit(sub(mul(A.mb.X, pt.qual === "ini" ? 1 : -1), mul(Bp.mb.X, dot(A.mb.X, Bp.mb.X))));
        ctx.face = Math.abs(dot(dir, Bp.mb.B)) >= Math.abs(dot(dir, Bp.mb.A)) ? "mesa" : "alma";
        if (ctx.relacao === "viga-viga") ctx.face = "alma";
        var tP = projT(pt.P, Bp.mb), topoT = Bp.mb.L;
        ctx.topoPilar = Bp.papel === "pilar" && (topoT - tP) < Math.max(num(Bp.perfil.d, 200), num(A.perfil.d, 200)) / 1000 + 0.05;
        /* quanto o pilar passa ACIMA da mesa de cima da viga (mm): a chapa estendida precisa dele para a linha de parafusos de fora */
        if (Bp.papel === "pilar") { var pTop = add(Bp.mb.P0, mul(Bp.mb.X, Bp.mb.L)), pBot = Bp.mb.P0; ctx.sobraPilarMm = Math.round((Math.max(pTop[1], pBot[1]) - (pt.P[1] + Math.abs(dot(A.mb.B, UP)) * num(A.mb.s && A.mb.s.alt, 0) / 2)) * 1000); }
        ctx.noMeio = tP > 0.15 * Bp.mb.L && tP < 0.85 * Bp.mb.L;
        /* OBLIQUIDADE em planta: o eixo da viga contra a normal da face do apoio (revisão C2) */
        var nF = ctx.face === "mesa" ? Bp.mb.B : Bp.mb.A, xh = sub(A.mb.X, mul(Bp.mb.X, dot(A.mb.X, Bp.mb.X)));
        /* N3: a inclinação vertical da peça que chega não é obliquidade em planta — projeta no plano horizontal */
        xh = sub(xh, mul(UP, dot(xh, UP))); nF = sub(nF, mul(UP, dot(nF, UP))); nF = len(nF) > 1e-6 ? unit(nF) : nF;
        /* M1: inclinação da viga em elevação (V e N no plano da chapa sem decompor) */
        ctx.inclinacao = Math.round(Math.asin(Math.min(1, Math.abs(dot(A.mb.X, UP)))) * 180 / Math.PI * 10) / 10;
        if (len(xh) > 1e-6) ctx.obliquidade = Math.round(Math.acos(Math.min(1, Math.abs(dot(unit(xh), nF)))) * 180 / Math.PI * 10) / 10;
        if (ctx.relacao === "viga-viga") {
          var topoA = topoDe(A.mb), topoB = topoDe(Bp.mb);
          ctx.mesmoTopo = Math.abs(topoA - topoB) < Math.max(num(Bp.perfil.tf, 10), 10) / 1000 + 0.02;
          var baixoA = topoA - num(A.perfil.d, 0) / 1000, livreB = topoB - (num(Bp.perfil.d, 0) - num(Bp.perfil.tf, 0) - num(Bp.perfil.r, 0)) / 1000;
          ctx.choqueBaixo = baixoA < livreB - 0.002;   /* a mesa de baixo da secundária bate na mesa de baixo da principal (revisão A2) */
          ctx.cabeSemRecorte = num(A.perfil.d, 0) <= num(Bp.perfil.d, 0) - 2 * (num(Bp.perfil.tf, 0) + num(Bp.perfil.r, 0)) - 10 && (topoB - topoA) * 1000 >= num(Bp.perfil.tf, 0) + num(Bp.perfil.r, 0) - 1;
        }
        if (ctx.relacao === "viga-pilar" && ctx.face === "alma") {
          var livre = num(Bp.perfil.d, 0) - 2 * num(Bp.perfil.tf, 0);
          ctx.cabeEntreMesas = num(A.perfil.bf, 0) <= livre - 10;
          if (!ctx.cabeEntreMesas) avisos.push("A viga (mesa de " + br(A.perfil.bf, 0) + " mm) não cabe entre as mesas do pilar (" + br(livre, 0) + " mm livres): recorte das mesas da viga ou ligação na mesa.");
        }
      }
    }
    ctx.A = A ? A.id : null; ctx.B = Bp ? Bp.id : null;
    try { Object.defineProperty(ctx, "_caixas", { value: pecas.map(function (p) { return p.caixa; }), enumerable: false }); } catch (eC) {}
    esforcosDoCalculo(ctx, pecas, op.resultado, A, Bp);
    if (!ctx.esforcos || !ctx.esforcos.length) estimar(ctx, A, Bp);
    return ctx;
  }
  /* duas barras que se cruzam no meio (contraventamento em X): a menor distância entre os eixos cai dentro das duas */
  function cruzam(m1, m2) {
    var w = sub(m1.P0, m2.P0), a = dot(m1.X, m1.X), b = dot(m1.X, m2.X), c = dot(m2.X, m2.X), d = dot(m1.X, w), e = dot(m2.X, w), D = a * c - b * b;
    if (D < 1e-9) return false;
    var s1 = (b * e - c * d) / D, s2 = (a * e - b * d) / D, P1 = add(m1.P0, mul(m1.X, s1)), P2 = add(m2.P0, mul(m2.X, s2));
    return dist(P1, P2) < 0.3 && s1 > 0.15 * m1.L && s1 < 0.85 * m1.L && s2 > 0.15 * m2.L && s2 < 0.85 * m2.L;
  }
  function topoDe(mb) { var a = mb.P0, b = add(mb.P0, mul(mb.X, mb.L)); return Math.max(a[1], b[1]) + Math.abs(dot(mb.B, UP)) * num(mb.s && mb.s.alt, 0) / 2; }   /* o eixo é o centro da seção */
  function angulo(X1, X2) { var c = Math.min(1, Math.abs(dot(X1, X2))); return Math.round(Math.acos(c) * 180 / Math.PI); }
  function pontaMaisPerto(m1, m2) { var best = Infinity; pontasMb(m1).forEach(function (a) { pontasMb(m2).forEach(function (b) { best = Math.min(best, dist(a.P, b.P)); }); }); return { dPontas: best }; }

  /* esforços da ponta pelo último cálculo da estrutura desenhada (AcoDimLivre): ELU, por combinação */
  function esforcosDoCalculo(ctx, pecas, r, A, Bp) {
    if (!r || !r.ok || !r.modelo || !A || ctx.relacao === "consolo") return;   /* consolo: a viga passa por cima — esforço estimado e declarado */
    var D = Dim(), mem = arr(r.modelo.membros).filter(function (m) { return String(m.peca) === String(A.id); })[0];
    if (!mem) { ctx.avisos.push("A peça " + A.id + " não está no último cálculo (calcule de novo depois de mudar o modelo)."); return; }
    var lado = "ini";
    if (ctx.relacao === "base") lado = (mem.a && mem.b && mem.a[1] <= mem.b[1]) ? "ini" : "fim";
    else if (ctx.ponto && mem.a && mem.b) lado = dist(ctx.ponto, mem.a) <= dist(ctx.ponto, mem.b) ? "ini" : "fim";
    var cond = (mem.pontas || {})[lado] || {};
    ctx.no = { rigido: cond.tipo === "rigida" || cond.tipo === "continua" ? true : (cond.tipo === "rotulada" ? false : null), tipo: cond.tipo || null, fonte: "cálculo", texto: "o cálculo trata a ponta " + (lado === "ini" ? "inicial" : "final") + " de " + mem.id + " como " + (cond.tipo || "?") + (cond.motivo ? " (" + cond.motivo + ")" : "") };
    if (ctx.relacao === "base") {
      var bs = arr(r.modelo.bases).filter(function (b) { return String(b.peca) === String(A.id); })[0];
      ctx.no = { rigido: bs ? bs.tipo === "engastada" || bs.tipo === "engaste" : null, tipo: bs ? bs.tipo : null, fonte: "cálculo", texto: bs ? "base " + bs.tipo + " no cálculo" : "o pilar não é base no cálculo" };
    }
    if (!D || !D.estacoesMembro) return;
    var lst = [];
    arr(r.combinacoes).forEach(function (c) {
      if (c.tipo !== "ELU") return;
      var est = D.estacoesMembro(r.analise, mem, c.id); if (!est.length) return;
      var s = lado === "ini" ? est[0] : est[est.length - 1];
      lst.push({ comb: c.id, N: s.N, V: Math.sqrt(s.Vy * s.Vy + s.Vz * s.Vz), M: Math.sqrt(s.Mz * s.Mz + s.My * s.My), Vx: s.Vy, Vz: s.Vz });
    });
    if (lst.length) { ctx.esforcos = lst; ctx.estimativa = false; ctx.origemEsforcos = "último cálculo da estrutura desenhada (" + lst.length + " combinações ELU, ponta " + lado + " de " + mem.id + ")"; ctx.membro = mem.id; }
  }
  /* ESTIMATIVA declarada (sem cálculo) */
  function estimar(ctx, A, Bp) {
    var pa = A ? A.perfil : {}, fy = A ? A.aco.fy : 345, L = A ? A.mb.L : 6, e = [], txt = "";
    if (ctx.relacao === "base") {
      var Ar = num(pa.A, 3000), Nc = 0.25 * Ar * fy / G1 / 1000, MRd = num(pa.Zx, 0) * fy / G1 / 1e6;
      e = [{ comb: "estimativa", N: -Nc, V: 0.05 * Nc, M: 0.15 * MRd }];   /* a rotulada ignora o M; a engastada (cálculo ou preferência) usa (revisão M2) */
      txt = "base: compressão de 25 % de A·fy/γa1 do pilar (" + br(Nc, 0) + " kN), cortante de 5 % e, na engastada, momento de 15 % do resistente (" + br(0.15 * MRd, 1) + " kN·m)";
    } else if (ctx.relacao === "contraventamento" || ctx.relacao === "no-trelica" || ctx.relacao === "tubular") {
      var Ad = num(pa.A, 900), Nt = 0.5 * Ad * fy / G1 / 1000; e = [{ comb: "estimativa", N: Nt, V: 0, M: 0 }, { comb: "estimativa-c", N: -0.5 * Nt, V: 0, M: 0 }];
      txt = "barra: tração de 50 % de Ag·fy/γa1 (" + br(Nt, 0) + " kN) e compressão de metade disso";
    } else if (ctx.relacao === "consolo") {
      var Zc = num(pa.Zx, 0) || 600000, MRc = Zc * fy / G1 / 1e6, Pc = 2 * (2 * MRc / Math.max(L / 2, 1));
      e = [{ comb: "estimativa", V: Pc, M: 0, N: 0 }];
      txt = "consolo: a viga apoiada passa por cima — reação de dois vãos de " + br(L / 2, 2) + " m com a viga a 50 % do momento resistente (P = " + br(Pc, 0) + " kN; ponte rolante: use o valor do fabricante)";
    } else if (ctx.relacao === "terca") {
      e = [{ comb: "estimativa", V: 5, M: 0, N: 0 }]; ctx.reacaoTerca = { normal: 5, cima: 3, paralela: 1 }; txt = "terça: reação de 5 kN para baixo e 3 kN de sucção (valores típicos)";
    } else {
      var Z = num(pa.Zx, 0) || num(pa.Wx, 0) * 1.12 || 300000, MR = Z * fy / G1 / 1e6, V = Math.min(2 * MR / Math.max(L, 0.5), 0.5 * 0.6 * fy * num(pa.d, 300) * num(pa.tw, 6) / G1 / 1000);
      e = [{ comb: "estimativa", V: V, M: MR / 3, N: 0 }];
      txt = "viga de " + br(L, 2) + " m com carga uniforme que a leva a 50 % do momento resistente (MRd = " + br(MR, 1) + " kN·m): V = 2·MRd/L = " + br(V, 1) + " kN" + (ctx.relacao === "viga-pilar" || /emenda|cumeeira/.test(ctx.relacao) ? "; M na ligação rígida = MRd/3 = " + br(MR / 3, 1) + " kN·m" : "");
    }
    ctx.esforcos = e; ctx.estimativa = true; ctx.origemEsforcos = "ESTIMATIVA (sem cálculo da estrutura): " + txt;
  }

  /* ================================================================ SUGERIR */
  function entradaCalc(ctx, extra) {
    var pp = {}; arr(ctx.pecas).forEach(function (p) { pp[p.id] = p; });
    var A = pp[ctx.A] || {}, B = pp[ctx.B] || {}, e = { viga: A.perfil, apoio: B.perfil || A.perfil, face: /^(cumeeira|emenda)/.test(ctx.relacao) ? "nenhuma" : ctx.face, acoViga: A.aco, acoApoio: B.aco || A.aco, esforcos: ctx.esforcos, estimativa: ctx.estimativa, topoPilar: !!ctx.topoPilar };
    if (ctx.relacao === "base") { e.apoio = A.perfil; e.acoApoio = A.aco; }
    if (ctx.relacao === "emenda-barra" || ctx.relacao === "cruz") {
      var bb = A.perfil || {}; e.barra = bb.forma === "L" ? { forma: "L", b: bb.b, t: bb.t, A: bb.A, xc: bb.xc, fy: A.aco.fy, fu: A.aco.fu } : { forma: bb.forma === "U" ? "U" : "chapa", b: num(bb.d, num(bb.b, 100)), t: num(bb.tw, num(bb.t, 8)), A: bb.A, xc: num(bb.xc, 15), fy: A.aco.fy, fu: A.aco.fu };
    }
    if (ctx.relacao === "contraventamento" || ctx.relacao === "no-trelica") {
      var dg = A.perfil || {}; e.diagonal = dg.forma === "L" ? { forma: "L", b: dg.b, t: dg.t, xc: dg.xc, A: dg.A, fy: A.aco.fy, fu: A.aco.fu } : { forma: "chapa", t: num(dg.tw, num(dg.t, 6)), A: dg.A, fy: num(A.aco && A.aco.fy, 250), fu: num(A.aco && A.aco.fu, 400) };
      e.alfa = ctx.angulo; if (dg.forma === "circ" || /^BR/i.test(String(dg.nome))) e.d = num(dg.d, 16);
      if (A.tubo) e.tubo = { D: num(dg.d, num(dg.b, 101.6)), t: num(dg.t, 5), A: dg.A, fy: A.aco.fy, fu: A.aco.fu };
    }
    if (ctx.relacao === "tubular") {
      var bz = pp[ctx.banzo] || A, ds = arr(ctx.diagonais).map(function (id) { return pp[id]; }).filter(Boolean);
      function tb(pf) { var rhs = num(pf.b, 0) > 0 && !(pf.forma === "circ"); return rhs ? { forma: "RHS", b0: pf.b, h0: pf.d || pf.b, t0: pf.t, b1: pf.b, h1: pf.d || pf.b, t1: pf.t } : { forma: "CHS", d0: pf.d, t0: pf.t, d1: pf.d, t1: pf.t }; }
      var b0 = tb(bz.perfil); b0.fy0 = bz.aco.fy;
      var N1 = 0; arr(ctx.esforcos).forEach(function (s) { N1 = Math.max(N1, Math.abs(num(s.N, 0))); });
      e.banzo = b0; e.diagonais = ds.map(function (d) { var x = tb(d.perfil); return { d1: x.d0 || x.b0, b1: x.b0, h1: x.h0, t1: x.t0, theta: ctx.angulo || 45, N: N1 }; });
      e.g = 2 * num(bz.perfil.t, 6) + 10;
    }
    if (ctx.relacao === "consolo") { var Pmax = 0; arr(ctx.esforcos).forEach(function (q) { Pmax = Math.max(Pmax, Math.abs(num(q.V, 0))); }); e.P = Pmax; e.lnApoio = num(A.perfil.bf, 100); e.e = Math.max(150, Math.round((ctx.consolo.dist - num(B.perfil.d, 250) / 2000) * 1000)); }
    if (ctx.relacao === "terca") { var tf = B.perfil || {}; e = { terca: { t: num(A.perfil.t, 2), fu: num(A.aco.fu, 410) }, reacao: ctx.reacaoTerca || { normal: num((ctx.esforcos[0] || {}).V, 5), cima: 3, paralela: 1 }, viga: { tf: num(tf.tf, 8) } }; }
    Object.keys(extra || {}).forEach(function (k) { e[k] = extra[k]; });
    return e;
  }
  function candidatos(ctx, op) {
    var rel = ctx.relacao, rig = ctx.no ? ctx.no.rigido : null, pref = op.preferir, L = [];
    var tab = op.tabela && op.tabela[chaveTabela(ctx)];
    if (tab && Tip() && Tip().obter(tab)) L.push(["R-TAB", [tab]]);
    var Vmax = 0; arr(ctx.esforcos).forEach(function (s) { Vmax = Math.max(Vmax, Math.abs(num(s.V, 0))); });
    var querRig = rig === true || (rig == null && pref === "rigida");
    if (rel === "viga-pilar") {
      if (querRig || pref === "rigida") {
        if (ctx.face === "mesa") L.push(["R-VP-RIG", ["chapa-ext-estendida", "soldada-direta", "talas-mesa-paraf", "chapa-ext-ajustada", "misula", "talas-mesa-sold"]]);
        else L.push(["R-VP-RIG-A", ["chapa-ext-estendida-enrij", "soldada-direta"]]);
      }
      if (!querRig || pref === "flexivel" || (rig === false && pref === "rigida")) {
        if (ctx.face === "mesa") L.push(["R-VP-ROT", ["chapa-simples", "cant-dupla-paraf", "chapa-topo-curta", "cant-assento-enrij", "cant-dupla-sold-paraf"]]);
        else L.push(["R-VP-ROT-A", ctx.cabeEntreMesas === false ? ["cant-assento", "cant-assento-enrij", "chapa-simples"] : ["chapa-simples", "cant-dupla-paraf", "cant-assento", "cant-assento-enrij"]]);
      }
    } else if (rel === "viga-viga") {
      if (ctx.mesmoTopo || !ctx.cabeSemRecorte) L.push(["R-VV-REC", ["viga-viga-recorte-chapa", "viga-viga-recorte-cant"]]);
      else L.push(["R-VV-LIV", ["chapa-simples", "viga-viga-chapa-topo", "cant-dupla-paraf"]]);
    } else if (rel === "emenda-viga") L.push(["R-EV", ["emenda-viga-talas-paraf", "emenda-viga-chapa-topo", "emenda-viga-talas-sold"]]);
    else if (rel === "cumeeira") L.push(["R-CUM", ["emenda-viga-chapa-topo", "chapa-ext-ajustada"]]);
    else if (rel === "emenda-pilar") {
      var pp = ctx.pecas, mudou = pp.length >= 2 && pp[0].perfil.nome !== pp[1].perfil.nome;
      L.push(["R-EP", mudou ? ["emenda-pilar-chapa-topo", "emenda-pilar-talas", "emenda-pilar-soldada"] : ["emenda-pilar-talas", "emenda-pilar-chapa-topo", "emenda-pilar-soldada"]]);
    } else if (rel === "base") {
      if (rig === true || pref === "rigida") L.push(["R-BASE-ENG", ["base-engastada", "base-engastada-enrij", "base-barra-cisalhamento"]]);
      else L.push(["R-BASE-ROT", op.fundacaoExistente ? ["base-chumbador-quimico", "base-rotulada", "base-barra-cisalhamento"] : ["base-rotulada", "base-barra-cisalhamento", "base-chumbador-quimico"]]);
    } else if (rel === "emenda-barra") L.push(["R-EB", ["emenda-tracao-talas"]]);
    else if (rel === "cruz") L.push(["R-CRUZ", ["contravento-cruz"]]);
    else if (rel === "consolo") L.push(["R-CON", ["consolo"]]);
    else if (rel === "contraventamento") {
      var dg = (ctx.pecas.filter(function (p) { return p.id === ctx.A; })[0] || {}).perfil || {};
      if (dg.forma === "circ" || /^BR/i.test(String(dg.nome))) L.push(["R-CV", ["contravento-barra-redonda"]]);
      else if ((ctx.pecas.filter(function (p) { return p.id === ctx.A; })[0] || {}).tubo) L.push(["R-CV", ["gusset-tubo-lingua", "gusset-contravento-no"]]);
      else L.push(["R-CV", ctx.noMeio ? ["gusset-contravento-meio", "gusset-contravento-no"] : ["gusset-contravento-no", "gusset-contravento-meio"]]);
    } else if (rel === "no-trelica") L.push(["R-TRE", ["no-trelica-gusset"]]);
    else if (rel === "tubular") L.push(["R-TUB", ctx.ligTubo === "K" ? ["tubo-k", "tubo-t-y"] : ["tubo-t-y", "tubo-k"]]);
    else if (rel === "terca") L.push(["R-TER", ["clip-terca"]]);
    return L;
  }
  function prosContras(t, r) {
    var pros = [], contras = [];
    if (t.fabricacao === 1) pros.push("fabricação simples"); if (t.fabricacao === 3) contras.push("fabricação trabalhosa (mais chapas e soldas)");
    if (t.montagem === 1) pros.push(t.meio === "soldada" ? "montagem sem parafuso" : "montagem rápida: só parafusos na obra"); if (t.montagem === 3) contras.push("solda na obra (inspeção, clima, andaime)");
    if (t.montagem === 2) contras.push("montagem mais cuidadosa (ajuste de comprimento ou muitos furos)");
    if (t.custo === 1) pros.push("custo baixo"); if (t.custo === 3) contras.push("custo alto");
    if (t.familia === "rigida") pros.push("transmite o momento (pórtico rígido)"); if (t.familia === "flexivel" && /viga/.test(t.aplicacoes.join(" "))) pros.push("não leva momento para o pilar");
    if (r && arr(r.reforcos).length) contras.push("precisa de reforço: " + r.reforcos.join("; "));
    if (t.limitacoes && t.limitacoes[0]) contras.push(t.limitacoes[0]);
    return { pros: pros, contras: contras };
  }
  function sugerir(ctx, op) {
    op = op || {};
    if (!ctx || !ctx.ok) return { ok: false, motivo: (ctx && ctx.motivo) || "Sem contexto.", opcoes: [] };
    var T = Tip(), C = C2(), out = [], regras = [], avisos = arr(ctx.avisos).slice(), vistos = {};
    var rig = ctx.no ? ctx.no.rigido : null;
    if (ctx.estimativa) avisos.push("Esforços ESTIMADOS: " + String(ctx.origemEsforcos || "").replace(/^ESTIMATIVA \(sem cálculo da estrutura\): /, "") + ". Calcule a estrutura (Cálculo › Estrutura desenhada) para dimensionar com os esforços reais.");
    if (rig === false && op.preferir === "rigida") avisos.push("INCOERÊNCIA (R-INC): o cálculo trata este nó como ROTULADO (" + ctx.no.texto + "). Uma ligação rígida muda a estrutura — recalcule com a ligação rígida antes de detalhar.");
    candidatos(ctx, op).forEach(function (grupo) {
      var rid = grupo[0]; regras.push({ id: rid, texto: REGRAS[rid] });
      grupo[1].forEach(function (tid, k) {
        if (vistos[tid]) return; vistos[tid] = 1;
        var t = T.obter(tid); if (!t) return;
        var extra = {};
        if (ctx.relacao === "contraventamento" || ctx.relacao === "no-trelica") { var N = 0; arr(ctx.esforcos).forEach(function (s) { if (Math.abs(num(s.N, 0)) > Math.abs(N)) N = num(s.N, 0); }); extra.N = N; arr(ctx.esforcos).forEach(function (s) { if (num(s.N, 0) < 0) extra.Nc = Math.max(num(extra.Nc, 0), -num(s.N, 0)); else extra.Nt = Math.max(num(extra.Nt, 0), num(s.N, 0)); }); }
        var ent = entradaCalc(ctx, extra), r = C.verificar(tid, ent);
        var o = { entrada: ent, tipologia: tid, nome: t.nome, familia: t.familia, meio: t.meio, regra: { id: rid, texto: REGRAS[rid] }, ordemRegra: k, resultado: r, passa: !!(r && r.ok), reforcos: arr(r && r.reforcos), avisos: [], custo: { fabricacao: t.fabricacao, montagem: t.montagem, custo: t.custo } };
        var pc = prosContras(t, r); o.pros = pc.pros; o.contras = pc.contras;
        /* R-INC: nunca rígida em nó rotulado sem aviso (nem flexível em nó rígido) */
        if (rig === false && t.familia === "rigida") o.avisos.push("INCOERÊNCIA (R-INC): rígida num nó que o cálculo trata como ROTULADO (" + ctx.no.texto + ") — recalcule com a ligação rígida antes de usar.");
        if (rig === true && t.familia === "flexivel" && /viga-pilar|viga-viga|emenda|cumeeira/.test(ctx.relacao)) o.avisos.push("INCOERÊNCIA (R-INC): flexível num nó que o cálculo trata como RÍGIDO (" + ctx.no.texto + ") — o momento do cálculo não teria caminho.");
        if (rig === true && ctx.relacao === "base" && t.familia === "flexivel") o.avisos.push("INCOERÊNCIA (R-INC): base rotulada num pilar que o cálculo trata como ENGASTADO.");
        if (rig === false && ctx.relacao === "base" && t.familia === "rigida") o.avisos.push("INCOERÊNCIA (R-INC): base engastada num pilar que o cálculo trata como ROTULADO — a fundação receberia momento que o cálculo não deu.");
        if (ctx.estimativa) o.avisos.push("Dimensionada com esforços ESTIMADOS.");
        if (r && arr(r.naoVerificado).length) o.avisos = o.avisos.concat(r.naoVerificado.map(function (x) { return "Não verificado: " + x; }));
        o.penal = 0;
        if (/^viga-(pilar|viga)$/.test(ctx.relacao) && ctx.inclinacao > 5) { o.passa = false; o.bloqueio = "viga inclinada (" + br(ctx.inclinacao, 1) + "° em elevação): a decomposição de V e N no plano da chapa não está verificada"; o.avisos.unshift("Não verificado: " + o.bloqueio + "."); }
        if (ctx.relacao === "tubular" && (arr(ctx.diagonais).length > 1 || arr(ctx.diagonais).indexOf(ctx.A) < 0)) { o.passa = false; o.bloqueio = "nó tubular: a força de CADA diagonal não está disponível na sugestão (a da peça escolhida não serve para as outras) — verifique com as forças de cada diagonal"; o.avisos.unshift("Não verificado: " + o.bloqueio + "."); }
        if (!o.bloqueio && /^viga-(pilar|viga)$/.test(ctx.relacao) && ctx.obliquidade > 5) { o.passa = false; o.bloqueio = "ligação oblíqua (" + br(ctx.obliquidade, 1) + "° em planta): chapa dobrada ou calço — não verificada"; o.avisos.unshift("Não verificado: " + o.bloqueio + "."); }
        if (!o.bloqueio && ctx.relacao === "viga-viga" && ctx.choqueBaixo && /recorte/.test(tid)) { o.passa = false; o.bloqueio = "a mesa de baixo da secundária bate na principal: precisa de recorte DUPLO (mesa de cima e de baixo) — não verificado"; o.avisos.unshift("Não verificado: " + o.bloqueio + "."); }
        if (!o.bloqueio && /^chapa-ext-estendida/.test(tid) && ctx.relacao === "viga-pilar" && ctx.sobraPilarMm != null && r && r.dimensoes && r.dimensoes.ext && ctx.sobraPilarMm < r.dimensoes.ext) {
          o.prolongar = { alvo: ctx.B, mm: Math.ceil((r.dimensoes.ext + 50 - Math.max(0, ctx.sobraPilarMm)) / 10) * 10 };
          o.passa = false; o.bloqueioProlongar = "o pilar acaba " + Math.max(0, ctx.sobraPilarMm) + " mm acima da viga e a chapa estendida passa " + br(r.dimensoes.ext, 0) + " mm: a linha de parafusos de cima ficaria fora do pilar";
          o.avisos.unshift("Não serve como está: " + o.bloqueioProlongar + " — prolongue o pilar (pelo menos " + br(r.dimensoes.ext + 50, 0) + " mm acima da viga) e chame de novo, ou use a chapa ajustada ou a viga soldada.");
        }
        if (t.familia === "reforco") o.penal += 40;   /* reforço (barra de cisalhamento, enrijecedor) não vem antes da ligação que ele reforça */
        if (tid === "base-engastada" && r && r.ok && r.dimensoes && r.dimensoes.t > 31.5) { o.penal = 30; o.contras.unshift("placa grossa (" + br(r.dimensoes.t, 1) + " mm > 31,5 mm): as nervuras reduzem a espessura (R-BASE-ENG)"); }
        if (/^base-/.test(tid) && r && r.verificacoes && r.verificacoes.some(function (v) { return /cisalhamento/i.test(v.nome) && /Chumbador/i.test(v.nome) && v.razao > 1; })) o.contras.unshift("a cortante passa do que os chumbadores aguentam: barra de cisalhamento (R-BASE-ROT/ENG)");
        o.confianca = !o.passa ? "baixa" : (o.avisos.some(function (a) { return /INCOER/.test(a); }) || rid === "R-VP-RIG-A") ? "baixa" : (ctx.estimativa || k > 0 || arr(r.naoVerificado).length) ? "média" : "alta";
        o.justificativa = justificar(o, t, r, ctx) + (o.bloqueio ? " MAS " + o.bloqueio + "." : o.bloqueioProlongar ? " MAS " + o.bloqueioProlongar + " (prolongue o pilar)." : "");
        o.aplicar = aplicacao(o, ctx);
        o.peso = pesoEnsaio(o, ctx);
        out.push(o);
      });
    });
    /* ranking: passa primeiro; sem incoerência; ordem da regra; custo */
    function peso(o) { return (o.passa || o.prolongar ? 0 : 1000) + (o.prolongar ? 15 : 0) + (o.avisos.some(function (a) { return /INCOER/.test(a); }) ? 500 : 0) + o.ordemRegra * 10 + o.penal + o.custo.custo + o.custo.montagem * 0.5; }
    out.sort(function (a, b) { return peso(a) - peso(b); });
    /* chapa estendida que precisou de enrijecedor: a tipologia "com enrijecedores" (é o que vai para o modelo) */
    out.forEach(function (o) { if (o.tipologia === "chapa-ext-estendida" && o.resultado && o.resultado.dimensoes && o.resultado.dimensoes.enrijecedores) { o.tipologia = "chapa-ext-estendida-enrij"; o.nome = T.obter("chapa-ext-estendida-enrij").nome; o.justificativa = o.justificativa + " A mesa/alma do pilar não resiste sozinha à força da mesa da viga: vão enrijecedores de continuidade."; o.aplicar = aplicacao(o, ctx); } });
    var top = out.slice(0, 3);
    if (!top.some(function (o) { return o.passa; }) && top.length) avisos.push("Nenhuma das opções passa com estes perfis e esforços: veja a sugestão de cada uma (perfil maior, reforço ou outra tipologia).");
    return { ok: true, chave: chaveTabela(ctx), escopo: Tip() ? Tip().ESCOPO : null, relacao: ctx.relacao, face: ctx.face, no: ctx.no, estimativa: !!ctx.estimativa, origemEsforcos: ctx.origemEsforcos, opcoes: top, todas: out.length, todasOpcoes: out, regras: regras, avisos: avisos };
  }
  /* o peso da ligação: a macro do 3D rodada em ensaio (nada vai para o modelo) — chapas, cantoneiras e parafusos */
  function pesoEnsaio(o, ctx) {
    var BL = dep("BimMetalLig", "./metalligacao.js"), cx = ctx._caixas, ap = o.aplicar; if (!BL || !cx || !ap) return null;
    var por = {}; cx.forEach(function (c) { por[String(c.id)] = c; });
    var lst = ap.ordem.map(function (id) { return por[String(id)]; }).filter(Boolean); if (lst.length !== ap.ordem.length) return null;
    try {
      var par = JSON.parse(JSON.stringify(ap.par)); par.lig = "ensaio";
      var r = BL.aplicar(ap.macro, lst, par); if (!r.ok && lst.length === 2) r = BL.aplicar(ap.macro, [lst[1], lst[0]], par);
      if (!r.ok) return null;
      var kg = 0; r.pecas.concat(r.parafusos).forEach(function (c) { kg += num(c.massa, 0); });
      return Math.round(kg * 10) / 10;
    } catch (e) { return null; }
  }
  function chaveTabela(ctx) { var pp = arr(ctx.pecas), por = {}; pp.forEach(function (p) { por[p.id] = p; }); var a = por[ctx.A], b = por[ctx.B]; return [ctx.relacao, ctx.face || "", a ? a.perfil.nome : "", b ? b.perfil.nome : ""].join("|"); }
  function justificar(o, t, r, ctx) {
    var s = REGRAS[o.regra.id].split(":")[0] + ": " + t.nome.toLowerCase();
    if (r && r.ok) s += " passa (aproveitamento " + br(r.razao * 100, 0) + " %, governa " + String(r.governante || "").toLowerCase() + ").";
    else if (r) s += " NÃO passa (" + br(num(r.razao, 0) * 100, 0) + " %, " + String(r.governante || r.motivo || "").toLowerCase() + ")" + (r.sugestao ? " — " + r.sugestao : ".");
    if (arr(r && r.reforcos).length) s += " Reforço: " + r.reforcos.join("; ") + ".";
    return s;
  }

  /* ================================================================ APLICAR (o que a tela faz no modelo) */
  function aplicacao(o, ctx) {
    var T = Tip(), t = T.obter(o.tipologia), g = t && t.geometria; if (!g) return null;
    var rr0 = o.resultado || {}, dd0 = rr0.dimensoes || {};
    if (g.reforco && !(dd0.reforcoAlma && dd0.reforcoAlma.t)) return null;   /* o painel resiste: não há reforço a desenhar */
    var r = o.resultado || {}, d = r.desenho || {}, par = {}, ordem = [ctx.A, ctx.B].filter(Boolean), enr = [];
    Object.keys(g.par || {}).forEach(function (k) { par[k] = g.par[k]; });
    if (g.macro === "chapaExtremidade") {
      if (d.t) par.t = d.t; if (d.parafuso) par.parafuso = d.parafuso; if (d.classe) par.classe = d.classe; if (d.gage) par.gage = d.gage; if (d.largura) par.largura = d.largura;
      if (par.usarExt && d.ext) par.ext = d.ext; delete par.usarExt;
      if (d.linhas) par.linhas = d.linhas;   /* as linhas do dimensionamento (a macro, sem elas, enche a alma de linhas) */
      if (par.curta && d.altura) par.altura = d.altura; delete par.curta;
    } else if (g.macro === "cantoneiraDupla") {
      if (d.cat) par.cat = d.cat; if (d.parafuso) par.parafuso = d.parafuso; if (d.linhas) par.linhas = d.linhas; if (d.comprimento) par.comprimento = d.comprimento; if (d.simples) par.simples = true;
    } else if (g.macro === "consolo") {
      ordem = [ctx.B, ctx.A]; if (d.perfil) par.perfil = d.perfil;
    } else if (g.macro === "misula") {
      ["t", "parafuso", "ext", "gage", "largura", "hm", "Lm", "tMesa"].forEach(function (k) { if (d[k] != null) par[k] = d[k]; });
    } else if (g.macro === "talasMesa") {
      ["t", "largura", "parafuso", "linhas", "gage", "passo", "comprimento", "alma"].forEach(function (k) { if (d[k] != null) par[k] = d[k]; }); if (d.soldada) par.soldada = true;
    } else if (g.macro === "assento") {
      ["cat", "comprimento", "parafuso", "parafusos", "largura", "t", "ts", "hs"].forEach(function (k) { if (d[k] != null) par[k] = d[k]; }); if (d.enrijecido) par.enrijecido = true;
    } else if (g.macro === "chapaSimples") {
      ["t", "parafuso", "linhas", "a", "altura", "largura"].forEach(function (k) { if (d[k] != null) par[k] = d[k]; });
    } else if (g.macro === "placaBase") {
      ["B", "N", "t", "parafuso", "classe", "ancoragem", "graute", "furo"].forEach(function (k) { if (d[k] != null) par[k] = d[k]; });
      if (d.nChumb) par.nChumb = d.nChumb; if (d.porLado) par.porLado = d.porLado; ordem = [ctx.A];
    } else if (g.macro === "contraventamento") { if (d.t) par.t = d.t; if (d.parafuso) par.parafuso = d.parafuso; if (d.parafusos) par.parafusos = d.parafusos; }
    else if (g.macro === "emendaCobrejunta") { ["tMesa", "tAlma", "parafuso", "colunas", "colunasAlma", "linhasAlma"].forEach(function (k) { if (d[k] != null) par[k] = d[k]; }); }
    else if (g.macro === "noTrelica") { if (d.t) par.t = d.t; if (d.parafuso) par.parafuso = d.parafuso; if (d.parafusos) par.parafusos = d.parafusos; ordem = arr(ctx.ordem); }
    else if (g.macro === "clipTerca") { if (d.cat) par.cat = d.cat; if (d.parafuso) par.parafuso = d.parafuso; if (d.parafusos) par.parafusos = d.parafusos; }
    else if (g.macro === "enrijecedor") { ordem = [ctx.B || ctx.A]; if (d.t) par.t = d.t; }
    /* reforços no pilar, na altura da viga (a tela põe na mesma ligação): enrijecedores de continuidade e chapa de reforço da alma */
    var refs = [];
    if (g.enrijecedores || dd0.enrijecedores) enr.push({ alvo: ctx.B, t: dd0.enrijecedores ? dd0.enrijecedores.t / 1000 : 0.0125 });
    if (dd0.reforcoAlma && dd0.reforcoAlma.t) refs.push({ alvo: ctx.B, t: dd0.reforcoAlma.t / 1000 });
    if (!g.macro) { ordem = []; par = {}; }
    return { macro: g.macro || null, ordem: ordem, par: par, enrijecedores: enr, reforcos: refs, prolongar: o.prolongar || null, aviso: /recorte/.test(o.tipologia) ? "O recorte da mesa vai no desenho de fabricação (o 3D não recorta)." : null };
  }

  var AcoLigSugere = {
    REGRAS: REGRAS, analisar: analisar, sugerir: sugerir, aplicacao: aplicacao, entradaCalc: entradaCalc, chaveTabela: chaveTabela, pesoEnsaio: pesoEnsaio,
    sugerirPecas: function (caixas, op) { return sugerir(analisar(caixas, op), op); },
    /* a seção do memorial das ligações aplicadas: lista [{ id, titulo, resultado }] → HTML */
    secaoMemorial: function (ligs) {
      var C = C2(); ligs = arr(ligs); if (!ligs.length || !C) return null;
      return { id: "ligacoes-dim", titulo: "Dimensionamento das ligações",
        html: "<p>Ligações escolhidas pela ligação inteligente e dimensionadas pela ABNT NBR 8800 (seção 6 e 5.7). " + esc((Tip() || {}).EDICAO ? Tip().EDICAO.aviso : "") + "</p>" + escopoHtml() + ligs.map(function (l) { return C.memorialHtml(l.resultado, (l.titulo || l.id)); }).join("") };
    }
  };
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function escopoHtml() { var E0 = Tip() && Tip().ESCOPO; if (!E0) return ""; return "<h3>Escopo da verificação das ligações</h3><p><b>Verificado:</b> " + esc(E0.verificado) + "</p><p><b>NÃO verificado:</b></p><ul>" + E0.naoVerificado.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>"; }
  AcoLigSugere.escopoHtml = escopoHtml;
  global.AcoLigSugere = AcoLigSugere;
  if (typeof module !== "undefined" && module.exports) module.exports = AcoLigSugere;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
