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
 *     op = { resultado (o último AcoDimLivre.calcular — esforços e condição do nó), preferir: "rigida"|"flexivel",
 *            fundacoes (estado.fundacoes do BIM: a placa de base é verificada NA fundação sob o pilar — js/acoligfundacao.js) }
 *   sugerir: op.execucao = "parafusada" → só ligações sem SOLDA NA OBRA (as "mistas" — soldadas na fábrica e
 *            parafusadas na obra — ficam; as de meio "soldada" saem, com o aviso de quantas saíram)
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
 *   R-INC      INCOERÊNCIA: rígida (ou semirrígida) num nó que o cálculo trata como rotulado (ou flexível num nó rígido) →
 *              aviso explícito em cada opção e na lista de avisos (nunca silencioso)
 *   M2 (1.2.145):
 *   R-VP-TUB / R-VP-TUB-RIG  viga em pilar TUBULAR → chapa simples soldada no tubo (circular), chapa passante; momento: anel
 *              (não dimensionado). As de perfil I saem com o motivo.
 *   R-VSP      viga CONTÍNUA sobre o pilar (o topo do pilar sob a viga) → chapa de cabeça + enrijecedores de apoio
 *   ENTRE MESAS  viga na ALMA que não cabe entre as mesas: as tipologias que põem a viga entre as mesas ficam BLOQUEADAS;
 *              a 1ª vira a chapa simples com as mesas da viga recortadas
 *   sugerir(...).fora = as tipologias do catálogo para este encontro que NÃO entraram, cada uma com o motivo
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
  /* SIMULAÇÃO S1 (14/10/2026, js/acoligfundacao.js): a placa de base ancorada na FUNDAÇÃO desenhada no BIM */
  function LF() { return dep("AcoLigFundacao", "./acoligfundacao.js"); }

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
    "R-CFG": "Tipologia PREFERIDA na configuração das ligações da obra para esta situação (js/acoligconfig.js): vem primeiro se passar; se não passar, as da regra do encontro vêm na frente.",
    "R-TAB": "Padrão da EMPRESA para esta combinação de seções (tabela guardada pelo usuário): consultado PRIMEIRO; a ligação continua dimensionada e, se não passar, as alternativas das regras vêm atrás.",
    "R-EB": "Emenda de barra tracionada (cantoneira, U ou chapa colineares): talas parafusadas na aba/alma ligada (cantoneira, U) ou dos dois lados (chapa).",
    "R-CRUZ": "Duas diagonais que se cruzam: a interrompida é emendada por talas e um parafuso no cruzamento trava as duas.",
    "R-CON": "Viga que PASSA ao lado do pilar (viga de rolamento, viga apoiada de lado): consolo soldado no pilar, com a viga sentada nele.",
    "R-INC": "Coerência com o cálculo: ligação RÍGIDA (ou semirrígida) num nó que o cálculo trata como ROTULADO (ou flexível num nó rígido) muda o comportamento da estrutura — a opção vai com o aviso e a recomendação de recalcular.",
    "R-VP-TUB": "Viga em pilar TUBULAR (nó rotulado): chapa simples soldada na parede do tubo (tubo circular: a parede é verificada pela EN 1993-1-8, Tabela 7.2) ou chapa passante (atravessa o tubo e tira o momento da parede — vale também no tubo retangular).",
    "R-VP-TUB-RIG": "Viga em pilar TUBULAR com nó RÍGIDO: anel (colar) externo em volta do tubo — NÃO dimensionado no sistema (fórmulas fora do motor); dimensionar à parte.",
    "R-ALT": "Outra tipologia do catálogo que SERVE nesta geometria (fora das mais usadas para o encontro): dimensionada e ranqueada depois das da regra; se não combina com o nó do cálculo, vai com o aviso R-INC. O \"Ligar todos os nós\" não a escolhe.",
    "R-VSP": "Viga CONTÍNUA sobre o pilar (o pilar acaba sob a viga): chapa de cabeça no topo do pilar, 4 parafusos na mesa de baixo e par de enrijecedores de apoio na viga."
  };

  /* ------------------------------------------------ peças */
  function perfilMm(mb) {
    var p = mb.perfil || {}, C = Cat(), reg = p.cat && C && C.obter ? C.obter(p.cat) : null;
    if (reg && reg.d) return { nome: reg.nome, forma: reg.forma, d: reg.d, bf: reg.bf, tw: reg.tw, tf: reg.tf, r: num(reg.r, 0), A: reg.A, Zx: reg.Zx, Wx: reg.Wx, Ix: reg.Ix, massa: reg.massa };
    if (reg && reg.forma === "L") return { nome: reg.nome, forma: "L", b: num(reg.a, 76), t: reg.t, xc: num(reg.xc, 20), A: reg.A };
    /* M2 (1.2.145): o tubo retangular traz h (a altura — antes d = 0) e os módulos (a tensão no pilar tubular) */
    if (reg) return { nome: reg.nome, forma: reg.forma, d: num(reg.d, num(reg.D, num(reg.h, 0))), h: num(reg.h, 0) || undefined, b: num(reg.b, num(reg.B, 0)), t: num(reg.t, num(reg.tdes, 0)), A: reg.A, Wx: reg.Wx, Zx: reg.Zx };
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
    var ctx = { ok: true, pecas: pecas.map(function (p) { return { id: p.id, papel: p.papel, perfil: p.perfil, aco: p.aco, tubo: p.tubo, L: p.mb && p.mb.L }; }), avisos: avisos, face: "mesa", angulo: 90, topoPilar: false, mesmoTopo: false, no: { rigido: null, fonte: "padrão", texto: "sem cálculo: o padrão do cálculo da estrutura desenhada é ROTULADO" } };
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
        /* M2 (1.2.145): a viga passa CONTÍNUA sobre o pilar — o topo do pilar fica sob a mesa de baixo da viga, dentro do vão */
        var mvA = A.mb, psP = pontasMb(Bp.mb), topP = psP[0].P[1] >= psP[1].P[1] ? psP[0].P : psP[1].P, tVs = dot(sub(topP, mvA.P0), mvA.X), PaxV = add(mvA.P0, mul(mvA.X, tVs));
        var latV = sub(topP, PaxV); latV = sub(latV, mul(UP, dot(latV, UP)));
        var meiaV = Math.abs(dot(mvA.B, UP)) * num(mvA.s && mvA.s.alt, 0) / 2, baixoV = PaxV[1] - meiaV, cimaV = PaxV[1] + meiaV, folgaP = Math.max(num(Bp.perfil.d, 200), num(Bp.perfil.bf, 200)) / 2000 + 0.05;
        if (Math.abs(dot(mvA.X, UP)) < 0.2 && tVs > folgaP && tVs < mvA.L - folgaP && len(latV) < Math.max(num(A.perfil.bf, 100), 100) / 2000 + 0.05 && topP[1] > baixoV - 0.15 && topP[1] < cimaV + 0.01) {
          ctx.relacao = "viga-sobre-pilar"; ctx.capDir = Math.abs(dot(Bp.mb.B, mvA.X)) >= Math.abs(dot(Bp.mb.A, mvA.X)) ? "d" : "bf"; ctx.vigaSobre = { t: tVs, folgaTopo: Math.round((baixoV - topP[1]) * 1000) };
        }
        /* a viga PASSA ao lado do pilar (nenhuma ponta encosta nele): consolo */
        var dPon = Math.min.apply(null, pontasMb(A.mb).map(function (q) { return distReta(q.P, Bp.mb.P0, Bp.mb.X); }));
        var cAx = sub(Bp.mb.P0, mvA.P0), tA = dot(cAx, mvA.X), perpAx = distReta(Bp.mb.P0, mvA.P0, mvA.X) - 0, tamP = Math.max(num(Bp.perfil.d, 250), num(Bp.perfil.bf, 250)) / 1000;
        if (ctx.relacao === "viga-pilar" && dPon > tamP / 2 + num(A.perfil.d, 300) / 1000 + 0.3 && tA > 0.1 && tA < mvA.L - 0.1 && Math.abs(dot(mvA.X, UP)) < 0.2) {
          var Pn = add(mvA.P0, mul(mvA.X, tA)), hz = sub(Pn, Bp.mb.P0); hz = sub(hz, mul(Bp.mb.X, dot(hz, Bp.mb.X)));
          if (len(hz) < tamP / 2 + 1.5) { ctx.relacao = "consolo"; ctx.consolo = { ponto: Pn, dist: len(hz) }; }
        }
      }
      else if (pil.length === 2) { A = p2; Bp = p1; ctx.relacao = Math.abs(dot(p1.mb.X, p2.mb.X)) > 0.996 ? "emenda-pilar" : "viga-pilar"; }
      else {
        var col = Math.abs(dot(p1.mb.X, p2.mb.X)) > 0.996, pn = pontaMaisPerto(p1.mb, p2.mb);
        if (col) { ctx.relacao = (p1.perfil.forma === "I" || (p1.perfil.bf > 0 && p1.perfil.tw > 0)) ? "emenda-viga" : "emenda-barra"; A = p1; Bp = p2; }
        /* SIMULAÇÃO S2 (14/10/2026): cumeeira = as duas no MESMO plano vertical (as direções em planta paralelas); duas vigas
           que se encontram em CANTO (planta em L) não são cumeeira — viram viga × viga */
        else if (pn.dPontas < Math.max(p1.perfil.d || 200, p2.perfil.d || 200) / 1000 + 0.05 && mesmoPlano(p1.mb.X, p2.mb.X)) { ctx.relacao = "cumeeira"; A = p1; Bp = p2; }
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
      if (ctx.relacao === "viga-pilar" && Bp.tubo) ctx.pilarTubo = true;   /* M2: pilar tubular */
      if (ctx.relacao === "viga-pilar" || ctx.relacao === "viga-viga" || ctx.relacao === "contraventamento") {
        var rel = sub(pt.P, Bp.mb.P0); rel = sub(rel, mul(Bp.mb.X, dot(rel, Bp.mb.X)));
        /* SIMULAÇÃO S2 (14/10/2026): a ponta desenhada de eixo a eixo cai NO eixo do apoio — o ruído de micrômetro das receitas
           (1,8 µm) dava a direção errada e a viga que chega na ALMA virava "mesa" + "oblíqua 90°" (achado no pórtico espacial):
           até 5 mm do eixo, vale a direção de chegada da peça */
        var dir = len(rel) > 0.005 ? unit(rel) : unit(sub(mul(A.mb.X, pt.qual === "ini" ? 1 : -1), mul(Bp.mb.X, dot(A.mb.X, Bp.mb.X))));
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
        /* M2 (1.2.145): pilar TUBULAR — circular: a viga tem de apontar para o eixo do tubo (o ângulo com a direção radial); retangular: a
           face mais perto da direção da viga (as duas são "mesa"); depois a face vira "tubo" */
        if (ctx.pilarTubo) {
          var fCirc = /circ/.test(String(Bp.perfil.forma || "")), xu = len(xh) > 1e-6 ? unit(xh) : null;
          if (fCirc && xu) { var rad = sub(Bp.mb.P0, pt.P); rad = sub(rad, mul(Bp.mb.X, dot(rad, Bp.mb.X))); rad = sub(rad, mul(UP, dot(rad, UP))); ctx.obliquidade = len(rad) > 0.005 ? Math.round(Math.acos(Math.min(1, Math.abs(dot(xu, unit(rad))))) * 180 / Math.PI * 10) / 10 : 0; }
          else if (xu) { var nB = sub(Bp.mb.B, mul(UP, dot(Bp.mb.B, UP))), nA = sub(Bp.mb.A, mul(UP, dot(Bp.mb.A, UP))); var cB = len(nB) > 1e-6 ? Math.abs(dot(xu, unit(nB))) : 0, cA = len(nA) > 1e-6 ? Math.abs(dot(xu, unit(nA))) : 0; ctx.obliquidade = Math.round(Math.acos(Math.min(1, Math.max(cB, cA))) * 180 / Math.PI * 10) / 10; }
          ctx.face = "tubo";
        }
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
    /* SIMULAÇÃO S1: a fundação sob o pé do pilar (base) — o topo dá o A2/A1, a altura e o fck dão a ancoragem */
    if (ctx.relacao === "base" && A && LF() && op.fundacoes) {
      var pe = A.mb.X[1] >= 0 ? A.mb.P0 : add(A.mb.P0, mul(A.mb.X, A.mb.L)), fs = LF().fundacaoSob(pe, op.fundacoes, {});
      if (fs.ok) { ctx.fundacao = fs.fundacao; ctx.suporte = LF().suporteLocal(fs.fundacao, pe, [num(A.mb.B[0], 1), num(A.mb.B[2], 0)]); }
      else { ctx.semFundacao = fs.motivo; avisos.push("Placa de base sem fundação no modelo (" + fs.motivo + "): fck 25 MPa e A2/A1 = 1 de padrão, e a ancoragem no concreto (cone, gancho, borda) NÃO é verificada — desenhe a sapata/bloco sob o pilar (BIM › Fundação)."); }
    }
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
  function mesmoPlano(X1, X2) {
    var h1 = [X1[0], 0, X1[2]], h2 = [X2[0], 0, X2[2]], l1 = len(h1), l2 = len(h2);
    if (l1 < 1e-6 || l2 < 1e-6) return true;
    return Math.abs(dot(h1, h2)) / (l1 * l2) > 0.996;
  }
  function angulo(X1, X2) { var c = Math.min(1, Math.abs(dot(X1, X2))); return Math.round(Math.acos(c) * 180 / Math.PI); }
  function pontaMaisPerto(m1, m2) { var best = Infinity; pontasMb(m1).forEach(function (a) { pontasMb(m2).forEach(function (b) { best = Math.min(best, dist(a.P, b.P)); }); }); return { dPontas: best }; }

  /* esforços da ponta pelo último cálculo da estrutura desenhada (AcoDimLivre): ELU, por combinação */
  /* M2 (1.2.145): a compressão máxima e o momento máximo do PILAR (todas as combinações ELU e estações dos trechos dele) — para o
     painel da alma (AISC 360-16, J10.6) e a parede do tubo (kp); e, na viga contínua sobre o pilar, os esforços do TOPO do pilar */
  function pilarDoCalculo(ctx, r, Bp) {
    var D = Dim(); if (!D || !D.estacoesMembro || !Bp) return;
    var mems = arr(r.modelo.membros).filter(function (m) { return String(m.peca) === String(Bp.id); }); if (!mems.length) return;
    var Nc = 0, Mx = 0, achou = false;
    arr(r.combinacoes).forEach(function (c) { if (c.tipo !== "ELU") return; mems.forEach(function (mem) { D.estacoesMembro(r.analise, mem, c.id).forEach(function (s) { achou = true; Nc = Math.max(Nc, -num(s.N, 0)); Mx = Math.max(Mx, Math.sqrt(num(s.Mz, 0) * num(s.Mz, 0) + num(s.My, 0) * num(s.My, 0))); }); }); });
    if (achou) { ctx.pilarN = Nc; ctx.pilarM = Mx; }
  }
  function esforcosTopoPilar(ctx, r, Bp) {
    var D = Dim(); if (!D || !D.estacoesMembro || !Bp) return;
    var mems = arr(r.modelo.membros).filter(function (m) { return String(m.peca) === String(Bp.id); }); if (!mems.length) { ctx.avisos.push("O pilar " + Bp.id + " não está no último cálculo."); return; }
    var mem = mems.slice().sort(function (a, b) { return Math.max(b.a[1], b.b[1]) - Math.max(a.a[1], a.b[1]); })[0], lado = mem.a[1] >= mem.b[1] ? "ini" : "fim", lst = [];
    arr(r.combinacoes).forEach(function (c) {
      if (c.tipo !== "ELU") return;
      var est = D.estacoesMembro(r.analise, mem, c.id); if (!est.length) return;
      var q = lado === "ini" ? est[0] : est[est.length - 1];
      lst.push({ comb: c.id, N: q.N, V: Math.sqrt(q.Vy * q.Vy + q.Vz * q.Vz), M: Math.sqrt(q.Mz * q.Mz + q.My * q.My) });
    });
    var cond = (mem.pontas || {})[lado] || {};
    ctx.no = { rigido: cond.tipo === "rigida" || cond.tipo === "continua" ? true : (cond.tipo === "rotulada" ? false : null), tipo: cond.tipo || null, fonte: "cálculo", texto: "o cálculo trata o topo do pilar " + mem.id + " como " + (cond.tipo || "?") };
    if (lst.length) { ctx.esforcos = lst; ctx.estimativa = false; ctx.origemEsforcos = "último cálculo da estrutura desenhada (" + lst.length + " combinações ELU, topo do pilar " + mem.id + ")"; ctx.membro = mem.id; }
  }
  function esforcosDoCalculo(ctx, pecas, r, A, Bp) {
    if (!r || !r.ok || !r.modelo || !A || ctx.relacao === "consolo") return;   /* consolo: a viga passa por cima — esforço estimado e declarado */
    if (ctx.relacao === "viga-sobre-pilar") { esforcosTopoPilar(ctx, r, Bp); pilarDoCalculo(ctx, r, Bp); return; }
    if (ctx.relacao === "viga-pilar" && Bp && Bp.papel === "pilar") pilarDoCalculo(ctx, r, Bp);
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
    } else if (ctx.relacao === "viga-sobre-pilar") {
      /* a viga contínua sobre o apoio com a viga a 50 % do momento resistente: R = 1,25·w·L (dois vãos iguais, w = 4·MRd/L²) = 5·MRd/L;
         e no mínimo 25 % de A·fy/γa1 do pilar; força horizontal de 5 % */
      var pb0 = Bp ? Bp.perfil : {}, Zv = num(pa.Zx, 0) || num(pa.Wx, 0) * 1.12 || 300000, MRv = Zv * fy / G1 / 1e6, Rv = Math.max(5 * MRv / Math.max(L, 1), 0.25 * num(pb0.A, 3000) * (Bp ? Bp.aco.fy : 345) / G1 / 1000);
      e = [{ comb: "estimativa", N: -Rv, V: 0.05 * Rv, M: 0 }];
      txt = "viga contínua sobre o pilar: reação de dois vãos com a viga a 50 % do momento resistente (5·MRd/L) e no mínimo 25 % de A·fy/γa1 do pilar — R = " + br(Rv, 0) + " kN; força horizontal de 5 %";
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
    if (ctx.pilarN != null) { e.pilarN = ctx.pilarN; e.pilarM = ctx.pilarM; }   /* M2: a força do pilar do cálculo */
    /* F4 (15/10/2026): o vão da viga e a altura do pilar (mm) — classificação da ligação pela rigidez (EN 1993-1-8, 5.2.2.5) */
    /* β (Tabela 5.4): o número de vigas que chegam ao pilar NAQUELE nó não vem do modelo aqui (ctx.pecas é a seleção, sempre 1 viga) —
       não se manda nVigasNo e a ligação usa β = 2, o seguro (revisão F4, 15/10/2026) */
    if (num(A.L, 0) > 0) e.Lviga = A.L * 1000; if (num(B.L, 0) > 0 && B.papel === "pilar") e.Lpilar = B.L * 1000;
    if (ctx.relacao === "viga-sobre-pilar") e.capDir = ctx.capDir;
    if (ctx.relacao === "base") { e.apoio = A.perfil; e.acoApoio = A.aco; if (ctx.fundacao) e.concreto = { fck: ctx.fundacao.fck, A2_A1: 1, suporte: LF() ? LF().objsUW(ctx.suporte) : [] }; }
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
  /* M2 (1.2.145): a tipologia serve NESTA geometria? → null (serve) | o motivo de não servir (vai em "fora") */
  function naoServe(t, ctx, op) {
    var T = Tip(), apAqui = ctx.pilarTubo ? "viga-pilar-tubo" : ctx.face === "alma" ? "viga-alma-pilar" : "viga-mesa-pilar";
    if (ctx.relacao === "viga-pilar" && t.aplicacoes.indexOf(apAqui) < 0) return ctx.pilarTubo ? "o pilar é TUBULAR: vale para pilar de perfil I (" + t.aplicacoes.map(function (a) { return T.APLICACOES[a]; }).join("; ") + ")" : t.aplicacoes.indexOf("viga-pilar-tubo") >= 0 && t.aplicacoes.length === 1 ? "vale só para pilar TUBULAR" : "vale só " + (ctx.face === "alma" ? "na MESA do pilar" : "na ALMA do pilar") + (t.faces && t.faces[ctx.face] ? " — " + t.faces[ctx.face] : "");
    if (op.execucao === "parafusada" && t.meio === "soldada" && ctx.relacao !== "base") return "tem solda na obra (execução \"tudo parafusado\")";
    if (t.familia === "reforco") return "reforço: entra junto da ligação de momento quando o cálculo pede";
    if (t.id === "chapa-simples-mesas-rec" && ctx.cabeEntreMesas !== false) return "a viga cabe entre as mesas do pilar: a chapa simples comum serve";
    if (/-enrij$/.test(t.id) && /^chapa-ext-/.test(t.id)) return "variante \"com enrijecedores\": entra no lugar da " + (/ajustada/.test(t.id) ? "ajustada" : "estendida") + " quando o pilar pede enrijecedor de continuidade";
    if (ctx.relacao === "viga-viga" && /recorte/.test(t.id) !== !!(ctx.mesmoTopo || !ctx.cabeSemRecorte)) return /recorte/.test(t.id) ? "a secundária cabe sem recorte (mais baixa que a altura livre da principal)" : "os topos estão alinhados: precisa de recorte";
    return null;
  }
  function candidatos(ctx, op) {
    var rel = ctx.relacao, rig = ctx.no ? ctx.no.rigido : null, pref = op.preferir, L = [];
    var tab = op.tabela && op.tabela[chaveTabela(ctx)];
    if (tab && Tip() && Tip().obter(tab)) L.push(["R-TAB", [tab]]);
    /* F3b (15/10/2026): a tipologia preferida da CONFIGURAÇÃO DA OBRA para a situação (viga-pilar na mesa/na alma, viga-viga, base) —
       só se ela serve nesta geometria (naoServe) */
    var LCf = dep("AcoLigConfig", "./acoligconfig.js"), sit = LCf ? LCf.situacaoDe(ctx) : null, prf = sit && op.preferidas ? op.preferidas[sit] : null, tPrf = prf && Tip() ? Tip().obter(prf) : null;
    if (tPrf && prf !== tab && !naoServe(tPrf, ctx, op)) L.push(["R-CFG", [prf]]);
    var Vmax = 0; arr(ctx.esforcos).forEach(function (s) { Vmax = Math.max(Vmax, Math.abs(num(s.V, 0))); });
    var querRig = rig === true || (rig == null && pref === "rigida");
    if (rel === "viga-pilar" && ctx.pilarTubo) {
      /* M2: pilar tubular — as tipologias de mesa/alma de perfil I não se aplicam (saem em "fora", com o motivo) */
      if (querRig || pref === "rigida") L.push(["R-VP-TUB-RIG", ["anel-tubo"]]);
      L.push(["R-VP-TUB", ["chapa-simples-tubo", "chapa-passante-tubo"]]);
    } else if (rel === "viga-pilar") {
      if (querRig || pref === "rigida") {
        /* M2: as novas no fim da lista (a ordem das antigas não muda) */
        if (ctx.face === "mesa") L.push(["R-VP-RIG", ["chapa-ext-estendida", "soldada-direta", "talas-mesa-paraf", "chapa-ext-ajustada", "misula", "talas-mesa-sold", "chapa-ext-estendida-8", "chapa-ext-estendida-4es", "cant-topo-assento-sr", "chapa-ext-estendida-4w"]]);
        else L.push(["R-VP-RIG-A", ["chapa-ext-estendida-enrij", "soldada-direta"]]);
      }
      if (!querRig || pref === "flexivel" || (rig === false && pref === "rigida")) {
        if (ctx.face === "mesa") L.push(["R-VP-ROT", ["chapa-simples", "cant-dupla-paraf", "chapa-topo-curta", "cant-assento-enrij", "cant-dupla-sold-paraf"]]);
        else L.push(["R-VP-ROT-A", ctx.cabeEntreMesas === false ? ["chapa-simples-mesas-rec", "cant-assento", "cant-assento-enrij", "chapa-simples"] : ["chapa-simples", "cant-dupla-paraf", "cant-assento", "cant-assento-enrij"]]);
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
    else if (rel === "viga-sobre-pilar") L.push(["R-VSP", ["viga-continua-cabeca"]]);
    else if (rel === "contraventamento") {
      var dg = (ctx.pecas.filter(function (p) { return p.id === ctx.A; })[0] || {}).perfil || {};
      if (dg.forma === "circ" || /^BR/i.test(String(dg.nome))) L.push(["R-CV", ["contravento-barra-redonda"]]);
      else if ((ctx.pecas.filter(function (p) { return p.id === ctx.A; })[0] || {}).tubo) L.push(["R-CV", ["gusset-tubo-lingua", "gusset-contravento-no"]]);
      else L.push(["R-CV", ctx.noMeio ? ["gusset-contravento-meio", "gusset-contravento-no"] : ["gusset-contravento-no", "gusset-contravento-meio"]]);
    } else if (rel === "no-trelica") L.push(["R-TRE", ["no-trelica-gusset"]]);
    else if (rel === "tubular") L.push(["R-TUB", ctx.ligTubo === "K" ? ["tubo-k", "tubo-t-y"] : ["tubo-t-y", "tubo-k"]]);
    else if (rel === "terca") L.push(["R-TER", ["clip-terca"]]);
    /* M2 (1.2.145): as outras que servem na geometria (viga × pilar e viga × viga), dimensionadas depois das da regra */
    if (/^viga-(pilar|viga)$/.test(rel) && Tip()) {
      var ja = {}; L.forEach(function (g) { g[1].forEach(function (id) { ja[id] = 1; }); });
      var alt = []; aplicacoesDe(ctx).forEach(function (a) { Tip().porAplicacao(a).forEach(function (t) { if (!ja[t.id] && alt.indexOf(t.id) < 0 && !naoServe(t, ctx, op)) alt.push(t.id); }); });
      if (alt.length) L.push(["R-ALT", alt]);
    }
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
    var T = Tip(), C = C2(), out = [], regras = [], avisos = arr(ctx.avisos).slice(), vistos = {}, foraSolda = [];
    var rig = ctx.no ? ctx.no.rigido : null;
    if (ctx.estimativa) avisos.push("Esforços ESTIMADOS: " + String(ctx.origemEsforcos || "").replace(/^ESTIMATIVA \(sem cálculo da estrutura\): /, "") + ". Calcule a estrutura (Cálculo › Estrutura desenhada) para dimensionar com os esforços reais.");
    if (rig === false && op.preferir === "rigida") avisos.push("INCOERÊNCIA (R-INC): o cálculo trata este nó como ROTULADO (" + ctx.no.texto + "). Uma ligação rígida muda a estrutura — recalcule com a ligação rígida antes de detalhar.");
    candidatos(ctx, op).forEach(function (grupo) {
      var rid = grupo[0]; regras.push({ id: rid, texto: REGRAS[rid] });
      grupo[1].forEach(function (tid, k) {
        if (vistos[tid]) return; vistos[tid] = 1;
        var t = T.obter(tid); if (!t) return;
        if (op.execucao === "parafusada" && t.meio === "soldada" && ctx.relacao !== "base") { foraSolda.push(t.nome); return; }   /* base: a solda é de fábrica (pilar na placa); na obra só as porcas dos chumbadores */
        var extra = {};
        /* M1 (1.2.145): o material escolhido no Catálogo BR (classe do parafuso, aço do chumbador, aço da chapa) — sem
           escolha, op.materiais não vem e a entrada é a de sempre (ASTM A325, F1554 Gr.36, ASTM A36) */
        if (op.materiais) ["parafuso", "chumbador", "aco"].forEach(function (k) { var m = op.materiais[k]; if (m && m.id && (m.fub > 0 || (m.fy > 0 && m.fu > 0))) extra[k] = m; });
        /* F3b: o eletrodo e a configuração da obra (diâmetros, passo, borda, folga, atrito) — js/acoligconfig.js */
        if (op.materiais && op.materiais.eletrodo && op.materiais.eletrodo.fw > 0) extra.eletrodo = { id: op.materiais.eletrodo.id, fw: op.materiais.eletrodo.fw };
        if (op.config) extra.config = op.config;
        if (ctx.relacao === "contraventamento" || ctx.relacao === "no-trelica") { var N = 0; arr(ctx.esforcos).forEach(function (s) { if (Math.abs(num(s.N, 0)) > Math.abs(N)) N = num(s.N, 0); }); extra.N = N; arr(ctx.esforcos).forEach(function (s) { if (num(s.N, 0) < 0) extra.Nc = Math.max(num(extra.Nc, 0), -num(s.N, 0)); else extra.Nt = Math.max(num(extra.Nt, 0), num(s.N, 0)); }); }
        var ent = entradaCalc(ctx, extra), r = C.verificar(tid, ent), avF = [], rPlaca = r, passaAj = false;
        /* SIMULAÇÃO S1: a placa verificada NA fundação do modelo (cone, gancho, borda, altura, A2/A1)
           REVISÃO S5 N1 (14/10/2026): o chumbador químico TAMBÉM (o AcoLigFundacao verifica o que cabe sem o fabricante:
           placa no topo, cobrimento lateral, graute/cota; o resto vira pendência crítica) — antes ele pulava a fundação */
        if (ctx.relacao === "base" && ctx.fundacao && LF() && r && r.dimensoes && r.dimensoes.chumbadores) {
          var esfF = arr(ctx.esforcos).map(function (s) { return { comb: s.comb, N: num(s.N, 0), Vx: num(s.Vx, num(s.V, 0)), Vz: num(s.Vz, 0), M: num(s.M, 0) }; });
          r = LF().verificar(r, ctx.fundacao, { suporte: ctx.suporte, esforcos: esfF });
          /* REVISÃO A4 (14/10/2026): a placa reprovada pela FUNDAÇÃO (gancho, cone, borda, pryout, interação no concreto)
             tenta o próximo chumbador antes de desistir (reprodução h2: 3/4" reprovava no gancho e 7/8" passava) */
          var DIAS = (Mat() && Mat().diametros ? Mat().diametros("chumbador") : []).map(function (x) { return x.d; });   /* tabela ÚNICA: js/acomateriais.js, DIAMETROS */
          for (var tent = 0; tent < 5 && r && !r.ok && /cone|gancho|borda por cisalhamento|pryout|cisalhamento no concreto/i.test(String(r.governante || "")); tent++) {
            var dAt = num(r.dimensoes && r.dimensoes.chumbadores && r.dimensoes.chumbadores.d, 19.05), prox = DIAS.filter(function (d) { return d > dAt + 0.5; })[0]; if (!prox) break;
            var ent2 = JSON.parse(JSON.stringify(ent)); ent2.dMinChumb = prox;
            var r2 = C.verificar(tid, ent2); if (!r2 || !r2.dimensoes || !r2.dimensoes.chumbadores) break;
            rPlaca = r2;
            r2 = LF().verificar(r2, ctx.fundacao, { suporte: ctx.suporte, esforcos: esfF });
            r2.notas = arr(r2.notas).concat(["Chumbador aumentado para Ø " + br(r2.dimensoes.chumbadores.d, 1) + " mm pela fundação (o de Ø " + br(dAt, 1) + " mm reprovava em: " + r.governante + ")."]);
            r = r2; ent = ent2;
          }
          avF = arr(r.avisosFundacao);
          /* REVISÃO S5 N1: a placa que reprova SÓ por causa da cota (graute fora) passa com o topo proposto? — é o que o
             "Ligar todos os nós" aplica (com a proposta do ajuste), em vez de trocar de tipologia */
          if (r && !r.ok && r.ajusteCota && isFinite(r.ajusteCota.deslocTopoNovo)) {
            var fAj = {}; Object.keys(ctx.fundacao).forEach(function (k) { fAj[k] = ctx.fundacao[k]; });
            var dMov = num(r.ajusteCota.deslocTopoNovo, 0) - num(ctx.fundacao.deslocTopo, 0);
            fAj.folgaPe = num(ctx.fundacao.folgaPe, 0) - dMov; fAj.deslocTopo = r.ajusteCota.deslocTopoNovo; fAj.cotaTopo = num(ctx.fundacao.cotaTopo, 0) + dMov;
            var rAj = LF().verificar(rPlaca, fAj, { suporte: ctx.suporte, esforcos: esfF });
            passaAj = !!(rAj && rAj.ok && !rAj.ajusteCota);
          }
        }
        var o = { entrada: ent, tipologia: tid, nome: t.nome, familia: t.familia, meio: t.meio, regra: { id: rid, texto: REGRAS[rid] }, ordemRegra: rid === "R-ALT" ? 20 + k : rid === "R-CFG" ? -10 : k, resultado: r, passa: !!(r && r.ok), reforcos: arr(r && r.reforcos), avisos: [], custo: { fabricacao: t.fabricacao, montagem: t.montagem, custo: t.custo } };
        if (passaAj) { o.passaComAjuste = true; o.avisos.push("Passa com o AJUSTE DE COTA da fundação: " + String(r.ajusteCota.texto || "").split("AJUSTE DE COTA: ")[1]); }
        if (r && arr(r.naoVerificadoCritico).length) o.avisos.push("PENDÊNCIA (bloqueia a emissão): " + r.naoVerificadoCritico.join("; ") + ". O \"Ligar todos os nós\" não escolhe esta opção — só o engenheiro, aqui.");
        var pc = prosContras(t, r); o.pros = pc.pros; o.contras = pc.contras;
        if (avF.length) o.avisos = o.avisos.concat(avF);
        if (r && r.fundacao) o.fundacao = r.fundacao;
        /* R-INC: nunca rígida em nó rotulado sem aviso (nem flexível em nó rígido) */
        if (rig === false && (t.familia === "rigida" || t.familia === "semirrigida") && ctx.relacao !== "base") o.avisos.push("INCOERÊNCIA (R-INC): " + (t.familia === "rigida" ? "rígida" : "semirrígida (leva momento)") + " num nó que o cálculo trata como ROTULADO (" + ctx.no.texto + ") — recalcule com a ligação rígida antes de usar.");
        if (rig === true && t.familia === "flexivel" && /viga-pilar|viga-viga|viga-sobre-pilar|emenda|cumeeira/.test(ctx.relacao)) o.avisos.push("INCOERÊNCIA (R-INC): flexível num nó que o cálculo trata como RÍGIDO (" + ctx.no.texto + ") — o momento do cálculo não teria caminho.");
        if (rig === true && ctx.relacao === "base" && t.familia === "flexivel") o.avisos.push("INCOERÊNCIA (R-INC): base rotulada num pilar que o cálculo trata como ENGASTADO.");
        if (rig === false && ctx.relacao === "base" && t.familia === "rigida") o.avisos.push("INCOERÊNCIA (R-INC): base engastada num pilar que o cálculo trata como ROTULADO — a fundação receberia momento que o cálculo não deu.");
        if (ctx.estimativa) o.avisos.push("Dimensionada com esforços ESTIMADOS.");
        if (r && arr(r.naoVerificado).length) o.avisos = o.avisos.concat(r.naoVerificado.map(function (x) { return "Não verificado: " + x; }));
        o.penal = 0;
        if (/^viga-(pilar|viga)$/.test(ctx.relacao) && ctx.inclinacao > 5) { o.passa = false; o.bloqueio = "viga inclinada (" + br(ctx.inclinacao, 1) + "° em elevação): a decomposição de V e N no plano da chapa não está verificada"; o.avisos.unshift("Não verificado: " + o.bloqueio + "."); }
        if (ctx.relacao === "tubular" && (arr(ctx.diagonais).length > 1 || arr(ctx.diagonais).indexOf(ctx.A) < 0)) { o.passa = false; o.bloqueio = "nó tubular: a força de CADA diagonal não está disponível na sugestão (a da peça escolhida não serve para as outras) — verifique com as forças de cada diagonal"; o.avisos.unshift("Não verificado: " + o.bloqueio + "."); }
        if (!o.bloqueio && /^viga-(pilar|viga)$/.test(ctx.relacao) && ctx.obliquidade > 5) { o.passa = false; o.bloqueio = "ligação oblíqua (" + br(ctx.obliquidade, 1) + "° em planta): chapa dobrada ou calço — não verificada"; o.avisos.unshift("Não verificado: " + o.bloqueio + "."); }
        if (!o.bloqueio && ctx.relacao === "viga-viga" && ctx.choqueBaixo && /recorte/.test(tid)) { o.passa = false; o.bloqueio = "a mesa de baixo da secundária bate na principal: precisa de recorte DUPLO (mesa de cima e de baixo) — não verificado"; o.avisos.unshift("Não verificado: " + o.bloqueio + "."); }
        /* M2 (1.2.145): os bloqueios novos DEPOIS dos de geometria (inclinação, obliquidade, recorte duplo) — o motivo de geometria é o que a tela mostra primeiro */
        /* M2 (1.2.145): NÃO DIMENSIONADA — nunca passa, nunca Aplicar (o motivo vai no cartão) */
        if (r && r.naoDimensionada) { o.passa = false; if (!o.bloqueio) o.bloqueio = "NÃO DIMENSIONADA: " + String(t.naoDimensionada || r.governante || "").replace(/^não dimensionada: /, ""); }
        /* M2: viga na ALMA que não cabe entre as mesas — o que põe a viga entre as mesas fica bloqueado */
        if (!o.bloqueio && ctx.relacao === "viga-pilar" && ctx.face === "alma" && ctx.cabeEntreMesas === false && t.entreMesas) { o.passa = false; o.bloqueio = "a viga (mesa de " + br(num((ctx.pecas.filter(function (q) { return q.id === ctx.A; })[0] || {}).perfil.bf, 0), 0) + " mm) não cabe entre as mesas do pilar: use a chapa simples com as mesas da viga recortadas, ou ligue na mesa (gire o pilar)"; o.avisos.unshift("Não aplicável: " + o.bloqueio + "."); }
        /* M2: a viga tem de ser de perfil I (ou U) nas tipologias de viga × pilar e viga × viga */
        var pfA = (ctx.pecas.filter(function (q) { return q.id === ctx.A; })[0] || {}).perfil || {};
        if (!o.bloqueio && /^viga-(pilar|viga|sobre-pilar)$/.test(ctx.relacao) && !(num(pfA.bf, 0) > 0 && num(pfA.tw, 0) > 0)) { o.passa = false; o.bloqueio = "a viga não é de perfil I (" + (pfA.nome || pfA.forma || "?") + "): as tipologias de viga × pilar são para viga de perfil I ou U"; o.avisos.unshift("Não verificado: " + o.bloqueio + "."); }
        /* M2 (revisão 15/10/2026): ALTERNATIVA (R-ALT) que não combina com o nó do cálculo (R-INC) — sem Aplicar (antes a flexível
           num nó rígido ficava com o [Aplicar] liberado na lista completa) */
        if (!o.bloqueio && rid === "R-ALT" && o.avisos.some(function (a) { return /INCOER/.test(a); })) { o.passa = false; o.bloqueio = "alternativa que não combina com o nó do cálculo (" + (ctx.no && ctx.no.texto || "R-INC") + "): recalcule a estrutura com esse vínculo antes de aplicar"; }
        if (!o.bloqueio && /^(chapa-ext-estendida|cant-topo-assento-sr)/.test(tid) && ctx.relacao === "viga-pilar" && ctx.sobraPilarMm != null && r && r.dimensoes && r.dimensoes.ext && ctx.sobraPilarMm < r.dimensoes.ext) {
          o.prolongar = { alvo: ctx.B, mm: Math.ceil((r.dimensoes.ext + 50 - Math.max(0, ctx.sobraPilarMm)) / 10) * 10 };
          o.passa = false; o.bloqueioProlongar = "o pilar acaba " + Math.max(0, ctx.sobraPilarMm) + " mm acima da viga e a chapa estendida passa " + br(r.dimensoes.ext, 0) + " mm: a linha de parafusos de cima ficaria fora do pilar";
          o.avisos.unshift("Não serve como está: " + o.bloqueioProlongar + " — prolongue o pilar (pelo menos " + br(r.dimensoes.ext + 50, 0) + " mm acima da viga) e chame de novo, ou use a chapa ajustada ou a viga soldada.");
        }
        if (t.familia === "reforco") o.penal += 40;   /* reforço (barra de cisalhamento, enrijecedor) não vem antes da ligação que ele reforça */
        /* F3b: meio "soldada" na configuração da obra — as só parafusadas vão para trás (não saem: a obra pode precisar delas) */
        if (op.meio === "soldada" && t.meio === "parafusada" && ctx.relacao !== "base") { o.penal += 25; o.contras.push("parafusada — a configuração da obra prefere ligação soldada"); }
        if (tid === "base-engastada" && r && r.ok && r.dimensoes && r.dimensoes.t > 31.5) { o.penal = 30; o.contras.unshift("placa grossa (" + br(r.dimensoes.t, 1) + " mm > 31,5 mm): as nervuras reduzem a espessura (R-BASE-ENG)"); }
        if (/^base-/.test(tid) && r && r.verificacoes && r.verificacoes.some(function (v) { return /cisalhamento/i.test(v.nome) && /Chumbador/i.test(v.nome) && v.razao > 1; })) o.contras.unshift("a cortante passa do que os chumbadores aguentam: barra de cisalhamento (R-BASE-ROT/ENG)");
        o.confianca = !o.passa ? "baixa" : (o.avisos.some(function (a) { return /INCOER/.test(a); }) || rid === "R-VP-RIG-A" || rid === "R-ALT") ? "baixa" : (ctx.estimativa || k > 0 || arr(r.naoVerificado).length) ? "média" : "alta";
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
    if (foraSolda.length) avisos.push("Execução \"tudo parafusado na obra\": " + foraSolda.length + " tipologia(s) com solda na obra fora da lista (" + foraSolda.join("; ") + ").");
    var finais = {}; out.forEach(function (o) { finais[o.tipologia] = 1; });
    var fora = foraDaLista(ctx, op, vistos, finais);
    /* M2 (1.2.145): os 3 cartões não mostram alternativa (R-ALT) incoerente com o nó do cálculo — ela fica na lista completa, com o aviso */
    var top = out.filter(function (o) { return !(o.regra.id === "R-ALT" && o.avisos.some(function (x) { return /INCOER/.test(x); })); }).slice(0, 3);
    if (!top.length) top = out.slice(0, 3);
    if (!top.some(function (o) { return o.passa; }) && top.length) avisos.push("Nenhuma das opções passa com estes perfis e esforços: veja a sugestão de cada uma (perfil maior, reforço ou outra tipologia).");
    return { ok: true, chave: chaveTabela(ctx), escopo: Tip() ? Tip().ESCOPO : null, relacao: ctx.relacao, face: ctx.face, no: ctx.no, execucao: op.execucao || null, fundacao: ctx.fundacao || null, estimativa: !!ctx.estimativa, origemEsforcos: ctx.origemEsforcos, opcoes: top, todas: out.length, todasOpcoes: out, regras: regras, avisos: avisos, fora: fora,
             criterio: "Ordem: passa (com os esforços " + (ctx.estimativa ? "ESTIMADOS" : "do cálculo") + ") → coerente com o nó do cálculo → a ordem da regra (o mais usado no Brasil para o encontro) → reforço → custo e montagem." };
  }
  /* M2 (1.2.145): as tipologias do catálogo deste encontro que NÃO entraram na lista — e por quê */
  function aplicacoesDe(ctx) {
    if (ctx.relacao === "viga-pilar") return ["viga-mesa-pilar", "viga-alma-pilar", "viga-pilar-tubo"];
    var m = { "viga-viga": ["viga-viga"], "emenda-viga": ["emenda-viga"], cumeeira: ["emenda-viga"], "emenda-pilar": ["emenda-pilar"], base: ["base"], contraventamento: ["contraventamento"], "no-trelica": ["no-trelica"], tubular: ["tubular"], terca: ["terca"], consolo: ["consolo"], "viga-sobre-pilar": ["viga-sobre-pilar"], "emenda-barra": ["emenda-barra"], cruz: ["contraventamento"] };
    return m[ctx.relacao] || [];
  }
  function foraDaLista(ctx, op, vistos, finais) {
    var T = Tip(); if (!T) return [];
    var ids = {}, out = [];
    aplicacoesDe(ctx).forEach(function (a) { T.porAplicacao(a).forEach(function (t) { ids[t.id] = t; }); });
    Object.keys(ids).forEach(function (id) {
      if (vistos[id] || (finais && finais[id])) return;
      var t = ids[id], mot = naoServe(t, ctx, op) || ((t.familia === "rigida" || t.familia === "semirrigida") ? "ligação de momento fora da regra deste encontro" : "não é a regra deste encontro (" + (REGRAS_CURTAS[ctx.relacao] || ctx.relacao) + ")");
      out.push({ tipologia: id, nome: t.nome, familia: t.familia, motivo: mot });
    });
    return out;
  }
  var REGRAS_CURTAS = { "viga-pilar": "viga × pilar", "viga-viga": "viga × viga", base: "base", "viga-sobre-pilar": "viga contínua sobre o pilar" };
  /* REVISÃO S5 N1 (14/10/2026): a escolha do "Ligar todos os nós" (o lote) — a 1ª opção que passa, com desenho
     automático, sem incoerência, SEM pendência crítica (chumbador químico: dados do fabricante) e que não é reforço
     sozinho; na base sobre a fundação do modelo, só a placa verificada NELA. Sem nenhuma: a placa que passa com o AJUSTE
     DE COTA proposto (o lote aplica e mostra o botão "Ajustar o topo das fundações"). Antes: a 1ª que passava — com o
     graute de 45 ou 100 mm a placa moldada reprovava e entrava o químico, que pulava a fundação.
     → { opcao, pendente: null | "ajuste-cota", motivo } */
  function escolherLote(sg) {
    var L0 = arr(sg && (sg.todasOpcoes || sg.opcoes)), base = sg && sg.relacao === "base", fund = !!(sg && sg.fundacao);
    function serve(x) {
      if (!x || !x.aplicar || arr(x.resultado && x.resultado.bloqueante).length || x.avisos.some(function (a) { return /INCOER/.test(a); })) return false;
      if (x.regra && x.regra.id === "R-ALT") return false;   /* M2: o lote fica com as da regra (como antes) */
      if (x.tipologia === "base-chumbador-quimico" || x.familia === "reforco" || arr(x.resultado && x.resultado.naoVerificadoCritico).length) return false;
      if (base && fund && !(x.resultado && x.resultado.fundacao)) return false;
      return true;
    }
    var o = L0.filter(function (x) { return serve(x) && x.passa; })[0];
    if (o) return { opcao: o, pendente: null };
    o = L0.filter(function (x) { return serve(x) && x.passaComAjuste; })[0];
    if (o) return { opcao: o, pendente: "ajuste-cota", motivo: "aplicada com a proposta do topo da fundação (" + String(o.resultado.ajusteCota.texto || "").split("AJUSTE DE COTA: ")[1] + ")" };
    var q = L0.filter(function (x) { return x.passa && (x.tipologia === "base-chumbador-quimico" || arr(x.resultado && x.resultado.naoVerificadoCritico).length); })[0];
    return { opcao: null, pendente: null, motivo: q ? "só " + q.nome + " passaria, com verificação que depende do fabricante — escolha do engenheiro (Ligação inteligente)" : "nenhuma opção que passa com desenho automático" };
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
    if (o.resultado && o.resultado.naoDimensionada) return null;   /* M2: não dimensionada não tem desenho */
    var rr0 = o.resultado || {}, dd0 = rr0.dimensoes || {};
    if (g.reforco && !(dd0.reforcoAlma && dd0.reforcoAlma.t)) return null;   /* o painel resiste: não há reforço a desenhar */
    var r = o.resultado || {}, d = r.desenho || {}, par = {}, ordem = [ctx.A, ctx.B].filter(Boolean), enr = [];
    Object.keys(g.par || {}).forEach(function (k) { par[k] = g.par[k]; });
    if (g.macro === "chapaExtremidade") {
      if (d.t) par.t = d.t; if (d.parafuso) par.parafuso = d.parafuso; if (d.classe) par.classe = d.classe; if (d.gage) par.gage = d.gage; if (d.largura) par.largura = d.largura;
      if (par.usarExt && d.ext) par.ext = d.ext; delete par.usarExt;
      if (d.linhas) par.linhas = d.linhas;   /* as linhas do dimensionamento (a macro, sem elas, enche a alma de linhas) */
      if (par.curta && d.altura) par.altura = d.altura; delete par.curta;
      if (par.usarZs && d.zs) par.zs = d.zs; delete par.usarZs;   /* M2: 8 parafusos por mesa — as linhas do dimensionamento */
      if (d.nervura) par.nervura = d.nervura;
    } else if (g.macro === "cantoneiraDupla") {
      if (d.cat) par.cat = d.cat; if (d.parafuso) par.parafuso = d.parafuso; if (d.linhas) par.linhas = d.linhas; if (d.comprimento) par.comprimento = d.comprimento; if (d.simples) par.simples = true;
    } else if (g.macro === "consolo") {
      ordem = [ctx.B, ctx.A]; if (d.perfil) par.perfil = d.perfil;
    } else if (g.macro === "misula") {
      ["t", "parafuso", "ext", "gage", "largura", "hm", "Lm", "tMesa"].forEach(function (k) { if (d[k] != null) par[k] = d[k]; });
    } else if (g.macro === "talasMesa") {
      ["t", "largura", "parafuso", "linhas", "gage", "passo", "comprimento", "alma"].forEach(function (k) { if (d[k] != null) par[k] = d[k]; }); if (d.soldada) par.soldada = true;
    } else if (g.macro === "assento") {
      ["cat", "comprimento", "parafuso", "parafusos", "largura", "t", "ts", "hs", "catTopo", "linhasViga", "gx", "gxPilar", "gh", "gv", "passoViga"].forEach(function (k) { if (d[k] != null) par[k] = d[k]; }); if (d.enrijecido) par.enrijecido = true;
    } else if (g.macro === "chapaSimples") {
      ["t", "parafuso", "linhas", "a", "altura", "largura"].forEach(function (k) { if (d[k] != null) par[k] = d[k]; });
    } else if (g.macro === "placaBase") {
      ["B", "N", "t", "parafuso", "classe", "ancoragem", "graute", "furo"].forEach(function (k) { if (d[k] != null) par[k] = d[k]; });
      if (d.nChumb) par.nChumb = d.nChumb; if (d.porLado) par.porLado = d.porLado; ordem = [ctx.A];
    } else if (g.macro === "contraventamento") { if (d.t) par.t = d.t; if (d.parafuso) par.parafuso = d.parafuso; if (d.parafusos) par.parafusos = d.parafusos; }
    else if (g.macro === "barraRedonda") { if (dd0.d) par.d = dd0.d; if (dd0.chapa) { if (dd0.chapa.b) par.b = dd0.chapa.b; if (dd0.chapa.t) par.t = dd0.chapa.t / 1000; } }   /* SIMULAÇÃO S2 */
    else if (g.macro === "emendaCobrejunta") { ["tMesa", "tAlma", "parafuso", "colunas", "colunasAlma", "linhasAlma"].forEach(function (k) { if (d[k] != null) par[k] = d[k]; }); }
    else if (g.macro === "noTrelica") { if (d.t) par.t = d.t; if (d.parafuso) par.parafuso = d.parafuso; if (d.parafusos) par.parafusos = d.parafusos; ordem = arr(ctx.ordem); }
    else if (g.macro === "clipTerca") { if (d.cat) par.cat = d.cat; if (d.parafuso) par.parafuso = d.parafuso; if (d.parafusos) par.parafusos = d.parafusos; }
    else if (g.macro === "enrijecedor") { ordem = [ctx.B || ctx.A]; if (d.t) par.t = d.t; }
    else if (g.macro === "chapaCabeca") { ["t", "B", "L", "parafuso", "gx", "xb", "enrij"].forEach(function (k) { if (d[k] != null) par[k] = d[k]; }); ordem = [ctx.A, ctx.B]; }
    /* reforços no pilar, na altura da viga (a tela põe na mesma ligação): enrijecedores de continuidade e chapa de reforço da alma */
    var refs = [];
    /* M2 (1.2.145): os enrijecedores e a chapa de reforço com o AÇO do cálculo (antes a macro desenhava A36 / A572 por conta própria) */
    if ((g.enrijecedores || dd0.enrijecedores) && g.macro !== "chapaCabeca") enr.push({ alvo: ctx.B, t: dd0.enrijecedores ? dd0.enrijecedores.t / 1000 : 0.0125, aco: dd0.enrijecedores && dd0.enrijecedores.aco || null });
    if (dd0.reforcoAlma && dd0.reforcoAlma.t) refs.push({ alvo: ctx.B, t: dd0.reforcoAlma.t / 1000, aco: dd0.reforcoAlma.aco || null });
    /* M2 (1.2.145): o AÇO da chapa que o cálculo usou vai para o desenho — a chapa de extremidade sobe para A572 Gr.50 quando em A36
       nada passa, e a macro desenhava A36 (a fabricação sairia com a chapa mais fraca que a calculada) */
    var acoR = (d && d.aco) || (dd0 && dd0.aco); if (acoR && !par.aco && g.macro && g.macro !== "placaBase") par.aco = acoR;
    if (!g.macro) { ordem = []; par = {}; }
    return { macro: g.macro || null, ordem: ordem, par: par, enrijecedores: enr, reforcos: refs, prolongar: o.prolongar || null, aviso: /recorte|mesas-rec/.test(o.tipologia) ? "O recorte da mesa vai no desenho de fabricação (o 3D não recorta)." : null };
  }

  var AcoLigSugere = {
    REGRAS: REGRAS, analisar: analisar, sugerir: sugerir, escolherLote: escolherLote, aplicacao: aplicacao, entradaCalc: entradaCalc, chaveTabela: chaveTabela, pesoEnsaio: pesoEnsaio,
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
