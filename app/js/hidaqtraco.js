/* =====================================================================
 * hidaqtraco.js — ÁGUA QUENTE no "Traçar automaticamente" (FRENTE H5,
 * 21/10/2026; FRENTE H6, 21/10/2026) — motor PURO (não grava nada: devolve as ops do lote).
 *
 * DEFEITO QUE FECHA (revisor da H4, ALTO): com aquecedor no modelo, o TA
 * traçava esgoto, ventilação e água fria e deixava SEM TUBO os pontos de
 * água quente (lavatório, cubas da bancada, misturador). A H4 só passou a
 * DECLARAR a pendência; aqui o traçado sai.
 *
 * O TRAÇADO (critério de projeto da RA — docs/hidro/PADROES-PROJETO-RA.md
 * R-AQ1…R-AQ12; nenhuma norma diz o caminho, a NBR 5626:2020 diz o resto):
 *  1. ALIMENTAÇÃO DO AQUECEDOR (R-AQ1): a água fria chega pela espera do
 *     barrilete/coluna no teto (a mesma ponta "continua" das esperas de
 *     água fria dos ambientes), desce EMBUTIDA na parede ao lado do aquecedor,
 *     ganha o REGISTRO DE GAVETA (à vista e à mão — nunca atrás dele) e sai
 *     da parede até a entrada de água fria.
 *  2. SAÍDA (R-AQ2): da saída de água quente o tubo desce (ou sobe, no boiler
 *     com as ligações no topo), passa pelo REGISTRO DE GAVETA da saída (H6:
 *     NBR 13103:2020 8.3.4, recomendação — registro de bloqueio na entrada de
 *     AF e na saída de AQ do aquecedor; à vista, fora do corpo), entra na
 *     parede e sobe embutido até a cota da DISTRIBUIÇÃO, sob a laje (no
 *     entreforro), ABAIXO do barrilete de água fria com o afastamento.
 *  3. DISTRIBUIÇÃO (R-AQ3): árvore ortogonal no entreforro, do aquecedor a
 *     cada ponto (cada ponto liga no tubo mais perto já traçado), cruzando
 *     parede só na perpendicular, fora de vão de porta/janela, pilar e viga.
 *  4. DESCIDA (R-AQ4): de cada ponto, embutida na parede no eixo do ponto, com
 *     o REGISTRO DE GAVETA logo acima do ramal de água fria, volante para
 *     DENTRO do cômodo do ponto. Onde a descida cruza o ramal de água fria,
 *     troca de camada da parede — nunca tubo dentro de tubo.
 *  5. SENTIDO DO FLUXO (R-AQ5): p1 = montante (aquecedor → ponto).
 *  6. MATERIAL E DN (R-AQ6): o material padrão da água quente do biminst;
 *     sub-ramal pelo DN mínimo da tabela de água quente (aq.dn_tubulacao);
 *     a montante, o maior DN a jusante. H6: o TA CONFERE a vazão, a pressão e
 *     a velocidade (o MESMO método da NBR 5626 do dimensionamento: js/hidaq.js
 *     → js/hidaf.js) e devolve o achado com o Corrigir (aumentar o DN).
 *  7. AQUECIMENTO CENTRAL EM OUTRO PAVIMENTO (R-AQ11, H6): o ponto sem
 *     aquecedor no pavimento dele liga ao aquecedor de outro pavimento por uma
 *     COLUNA de água quente: (i) no SHAFT da coluna de água fria (ao lado dela,
 *     com o afastamento) — o caminho que já atravessa as lajes; sem coluna de
 *     água fria, (ii) embutida na parede do aquecedor, se a parede se repete
 *     nos pavimentos atendidos (o passante na laje é pedido ao estrutural).
 *     Decisão CONSERVADORA declarada: o shaft existente primeiro; nunca furar
 *     laje no meio do cômodo. Isolada; REGISTRO DE GAVETA na derivação de cada
 *     pavimento (no entreforro, com acesso).
 *  8. APARELHO A GÁS (H6): a conferência da NBR 13103:2020 (js/hidgas.js) —
 *     local, potência, volume e ventilação, exaustão, posição, registros e os
 *     pontos de gás e de força — vira pendência/aviso com o Corrigir.
 *  9. AQUECEDOR ELÉTRICO (H6, passagem e boiler): o ponto de força exclusivo
 *     com a potência, o disjuntor e o fio da FICHA (pendência a lançar, com o
 *     Corrigir que lança a tomada); boiler: a válvula de segurança é da família
 *     (manual: na entrada de água fria) e o respiro, pendência com o texto do
 *     manual.
 * O que não fecha vira PENDÊNCIA com o ponto (nunca tubo meio traçado).
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function BI() { return dep("BimInst", "./biminst.js"); }
  function HK() { return dep("HidKit", "./hidkit.js"); }
  function HR() { return dep("HidRota", "./hidrota.js"); }
  function HF() { return dep("HidFamilias", "./hidfamilias.js"); }
  function NN() { return dep("HidNormas", "./hidnormas.js"); }
  function BIC() { return dep("BimInstColocar", "./biminstcolocar.js"); }
  function HG() { return dep("HidGas", "./hidgas.js"); }
  function BEd() { return dep("BimEdit", "./bimedit.js"); }
  function HAQ() { return dep("HidAQ", "./hidaq.js"); }
  function HHi() { return dep("HidHidraulica", "./hidhidraulica.js"); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { if (v === null || v === undefined || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function txt(v) { return v == null ? "" : String(v); }
  var CASAS = 10000;   // hid:ok 4 casas do biminst
  function r4(v) { return Math.round(v * CASAS) / CASAS; }
  function f2(v) { return (Math.round(v * 100) / 100).toFixed(2).replace(".", ","); }   // hid:ok formatação
  var EPS = 1e-6;   // hid:ok tolerância numérica
  var FOLGA_LIMITE = 0.001;   // hid:ok 1 mm de sobra nas comparações de folga (o arredondamento a 4 casas mexe 0,1 mm — o mesmo do HidRota)
  function raio(dn) { return num(dn, 0) / 1000 / 2; }   /* DN em mm → raio em m */
  function d2(a, b) { var dx = a.x - b.x, dz = a.z - b.z; return Math.sqrt(dx * dx + dz * dz); }
  function d3(a, b) { var dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z; return Math.sqrt(dx * dx + dy * dy + dz * dz); }
  function P3(x, y, z) { return { x: r4(x), y: r4(y), z: r4(z) }; }
  /* aparelho do kit → linha da tabela aq.dn_tubulacao (Tabela 5 do TT/PCC/09, NBR 7198 → NBR 5626:2020) */
  var PONTO_TABELA = { lavatorio: "Lavatório", pia_cozinha: "Pia de cozinha", chuveiro: "Chuveiro", chuveiro_eletrico: "Chuveiro", banheira: "Banheira", bide: "Bidê", maquina_lavar_roupa: "Máquina de lavar roupas", ducha_higienica: "Chuveiro" };
  var OUTROS_LIQ = { esgoto: 1, ventilacao: 1, pluvial: 1, dreno: 1 };
  var MAX_PAV = 3;   // hid:ok mais que um pé-direito de diferença = outro pavimento (m)
  var COLUNA_PASSOS = 3;   // hid:ok até 3 afastamentos da coluna de água fria para achar o lugar da de água quente no shaft
  var LADOS = [[1, 0], [-1, 0], [0, 1], [0, -1]];   // hid:ok as 4 direções ortogonais da planta

  /* distância 3D entre dois segmentos (o mesmo cálculo do HidRota._int.segSeg3) */
  var COS_PARALELO = Math.SQRT1_2;   /* mais perto de paralelo que 45° = "correm juntos" */
  function paralelos(a, b, c, d) { var u = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }, v = { x: d.x - c.x, y: d.y - c.y, z: d.z - c.z }, Lu = Math.sqrt(u.x * u.x + u.y * u.y + u.z * u.z), Lv = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z); if (!(Lu > EPS) || !(Lv > EPS)) return true; return Math.abs(u.x * v.x + u.y * v.y + u.z * v.z) / (Lu * Lv) >= COS_PARALELO; }
  function segSeg(p1, q1, p2, q2) { var H = HR(); return H && H._int && H._int.segSeg3 ? H._int.segSeg3(p1, q1, p2, q2) : Infinity; }

  /* o aquecedor: equipamento com entrada de água fria e saída de água quente (o critério da H4, mais os dois pontos) —
     H6: vale para o de passagem a gás, o de passagem elétrico e os de acumulação (boiler elétrico e a gás) */
  function aquecedores(estado, avaliarFam) {
    var K = HK(), out = [];
    arr(estado && estado.familias).forEach(function (f) {
      var F = HF() && HF().porId ? HF().porId(f.famId) : null;
      if (!F || F.categoria !== "equipamento" || arr(F.sistemas).indexOf("agua_quente") < 0) return;
      var cs = K._int.conectores(avaliarFam, f), af = cs.filter(function (c) { return c.sistema === "agua_fria"; })[0], aq = cs.filter(function (c) { return c.sistema === "agua_quente"; })[0];
      var av = null; try { av = avaliarFam ? avaliarFam(f.famId, f.tipoId, f.inst || {}) : null; } catch (eA) { av = null; }
      if (af && aq) out.push({ f: f, af: af, aq: aq, nome: F.nome, valores: (av && av.valores) || {}, gas: /gas/.test(String(f.famId)), eletrico: /eletric/.test(String(f.famId)), acumulacao: /boiler|acumula/.test(String(f.famId)) });
    });
    return out;
  }

  function tracar(e) {
    e = e || {};
    var estado = e.estado || {}, avaliarFam = e.avaliarFam, par = e.parametros || {}, K = HK(), B = BI(), H = HR();
    var out = { ops: [], pendencias: [], avisos: [], decisoes: [], pontos: 0, ligados: 0, aquecedores: 0, gas: null, hidraulica: [] };
    function pend(motivo, els) { out.pendencias.push({ chave: "ta.agua_quente", texto: "Água quente: " + motivo, motivo: motivo, elementos: arr(els).map(String) }); }
    if (!K || !B || !H) { pend("motores do traçado não carregados (HidKit, BimInst, HidRota)", []); return out; }
    var Aq = aquecedores(estado, avaliarFam); out.aquecedores = Aq.length;
    if (!Aq.length) return out;
    var G = H.GEO, folga = num(par.folga, G.folga), afast = num(par.afastamento, G.afastamento), embutir = num(par.embutir, G.embutir), cobr = num(par.cobrimento, G.cobrimento), mNo = num(par.margemNo, G.margemNo);
    var Lr = B.ACESSORIO_PADRAO, sisAQ = B.SISTEMAS.agua_quente, matAQ = sisAQ.materiais.indexOf((par.material || {}).agua_quente) >= 0 ? par.material.agua_quente : sisAQ.material;
    var dnsAQ = arr((B.MATERIAIS[matAQ] || {}).dns), matAF = B.SISTEMAS.agua_fria.material, dnAFpad = (B.MATERIAIS[matAF] || {}).dn;
    function comercial(dn) { var ok = dnsAQ.filter(function (d) { return d >= dn - EPS; }); return ok.length ? ok[0] : (dnsAQ.length ? dnsAQ[dnsAQ.length - 1] : dn); }
    var aRG = K.altura ? K.altura("RG") : { ok: false }, ctx = NN() ? NN().contexto() : null;
    var escopo = {}; arr(e.escopo).forEach(function (id) { escopo[String(id)] = 1; });
    var temEscopo = arr(e.escopo).length > 0;
    var heaterIds = {}; Aq.forEach(function (A) { heaterIds[String(A.f.id)] = 1; });
    var BIr = BI(), tipoRgAF = BIr.varianteAuto ? BIr.varianteAuto("registro_gaveta", { sistema: "agua_fria", material: matAF, aplicacao: "ramal" }) : "acabamento";
    var tipoRgAQ = BIr.varianteAuto ? BIr.varianteAuto("registro_gaveta", { sistema: "agua_quente", material: matAQ, aplicacao: "ramal" }) : "acabamento";
    /* os pontos de água quente LIVRES (sem tubo) — a mesma conta da pendência da H4 (BimInst.rede.conectoresLivres) */
    var R0 = B.rede(estado, avaliarFam), famPorId = {}; arr(estado.familias).forEach(function (f) { famPorId[String(f.id)] = f; });
    var livres = arr(R0.conectoresLivres).filter(function (k) { return k.sistema === "agua_quente" && !heaterIds[String(k.famInst)] && (!temEscopo || escopo[String(k.famInst)]); });
    out.pontos = livres.length;
    if (!livres.length) { conferirAparelhos(); return out; }
    var paredes = K._int.paredes(estado), obst = H.obstaculosDoBim(estado, avaliarFam), vols = arr(obst.familias);
    var existentes = arr(estado.instalacoes && estado.instalacoes.trechos).map(function (t) { return { a: t.p1, b: t.p2, r: raio(t.dn), sistema: t.sistema, id: t.id }; });
    var novos = [], ptsCache = {};
    function ptsDe(id) { if (ptsCache[id]) return ptsCache[id]; var f = famPorId[String(id)]; ptsCache[id] = f ? K._int.conectores(avaliarFam, f).map(function (c) { return { x: c.x, y: c.y, z: c.z }; }) : []; return ptsCache[id]; }   /* {a, b, r, sistema, id} dos trechos que este traçado já pôs */

    /* ---------- conferências (a folga física entre geratrizes; o tubo não entra em louça/equipamento) */
    function conflito(a, b, r, mesmoAp) {
      var todos = existentes.concat(novos);
      for (var i = 0; i < todos.length; i++) {
        var T = todos[i];
        /* ligado por uma ponta (a junção que este traçado faz: joelho, tê, a derivação no meio da linha) não é interferência */
        var qC = d3(a, T.a) <= B.TOL ? [a, b, T.b] : d3(a, T.b) <= B.TOL ? [a, b, T.a] : d3(b, T.a) <= B.TOL ? [b, a, T.b] : d3(b, T.b) <= B.TOL ? [b, a, T.a] : null;
        if (qC) {
          /* a junção pela ponta só vale em ângulo aberto: voltando por cima do outro (mesma direção a partir do nó) é tubo dentro de tubo */
          var uC = { x: qC[1].x - qC[0].x, y: qC[1].y - qC[0].y, z: qC[1].z - qC[0].z }, vC = { x: qC[2].x - qC[0].x, y: qC[2].y - qC[0].y, z: qC[2].z - qC[0].z }, Lu = Math.sqrt(uC.x * uC.x + uC.y * uC.y + uC.z * uC.z), Lv = Math.sqrt(vC.x * vC.x + vC.y * vC.y + vC.z * vC.z);
          if (Lu > EPS && Lv > EPS && (uC.x * vC.x + uC.y * vC.y + uC.z * vC.z) / (Lu * Lv) > COS_PARALELO) return { com: T.id, sistema: T.sistema };
          continue;
        }
        if (segSeg(a, a, T.a, T.b) <= B.TOL || segSeg(b, b, T.a, T.b) <= B.TOL || segSeg(T.a, T.a, a, b) <= B.TOL || segSeg(T.b, T.b, a, b) <= B.TOL) continue;
        var req = folga;
        if (Math.min(a.x, b.x) - r - T.r - afast > Math.max(T.a.x, T.b.x) || Math.max(a.x, b.x) + r + T.r + afast < Math.min(T.a.x, T.b.x) || Math.min(a.z, b.z) - r - T.r - afast > Math.max(T.a.z, T.b.z) || Math.max(a.z, b.z) + r + T.r + afast < Math.min(T.a.z, T.b.z) || Math.min(a.y, b.y) - r - T.r - afast > Math.max(T.a.y, T.b.y) || Math.max(a.y, b.y) + r + T.r + afast < Math.min(T.a.y, T.b.y)) continue;
        /* água quente × esgoto/ventilação: o afastamento (livre), salvo as ligações do MESMO aparelho — a louça manda (como no HidRota) */
        /* a ventilação (ar) que CRUZA (não corre junto) só pede a folga física: o afastamento é de tubos em paralelo */
        if (OUTROS_LIQ[T.sistema] && !(mesmoAp && mesmoAp(T)) && !(T.sistema === "ventilacao" && !paralelos(a, b, T.a, T.b))) req = afast;
        if (segSeg(a, b, T.a, T.b) - r - T.r < req - FOLGA_LIMITE) return { com: T.id, sistema: T.sistema };
      }
      for (var j = 0; j < vols.length; j++) {
        var v = vols[j], pts = ptsDe(v.id);
        /* corte rápido: o tubo longe da caixa do volume (em planta e em cota) não entra nele */
        if (Math.max(a.y, b.y) + r < v.y0 || Math.min(a.y, b.y) - r > v.y1) continue;
        if (segSeg({ x: a.x, y: 0, z: a.z }, { x: b.x, y: 0, z: b.z }, { x: v.cx, y: 0, z: v.cz }, { x: v.cx, y: 0, z: v.cz }) > Math.sqrt(v.hl * v.hl + v.hw * v.hw) + r) continue;
        /* a LIGAÇÃO do próprio aparelho (o tubo que nasce no ponto dele e sobe/desce na vertical do ponto — a mesma regra do HidRota) */
        if (pts.length && H.ligacaoDoProprioAparelho && H.ligacaoDoProprioAparelho(v, { p1: a, p2: b }, pts, r, 0.002)) continue;   // hid:ok 2 mm de casca
        if (B.tuboEmVolume(v, a, b, r, pts, 0.002)) return { com: v.id, familia: true };   // hid:ok 2 mm de casca (a mesma do HidRota)
      }
      return null;
    }
    /* a linha do entreforro: atravessa parede só na perpendicular, fora de vão e de viga/pilar */
    function cortaParede(a, b, y, r) {
      var n = 0;
      for (var i = 0; i < paredes.length; i++) {
        var w = paredes[i]; if (y < w.base - EPS || y > w.topo + EPS) continue;
        var ux = w.p2.x - w.p1.x, uz = w.p2.z - w.p1.z, L = Math.sqrt(ux * ux + uz * uz); if (!(L > EPS)) continue; ux /= L; uz /= L;
        var loc = (function (w0, ux0, uz0) { return function (p) { var dx = p.x - w0.p1.x, dz = p.z - w0.p1.z; return { u: dx * ux0 + dz * uz0, v: -dx * uz0 + dz * ux0 }; }; })(w, ux, uz);
        var A = loc(a), Bq = loc(b), hw = w.esp / 2 + r, t0 = 0, t1 = 1, lim = [["u", -r, L + r], ["v", -hw, hw]], fora = false;
        for (var k = 0; k < 2; k++) {
          var c = lim[k][0], lo = lim[k][1], hi = lim[k][2], s0 = A[c], dd = Bq[c] - s0;
          if (Math.abs(dd) < EPS) { if (s0 <= lo || s0 >= hi) { fora = true; break; } continue; }
          var ta = (lo - s0) / dd, tb = (hi - s0) / dd; if (ta > tb) { var q = ta; ta = tb; tb = q; }
          t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 >= t1) { fora = true; break; }
        }
        if (fora) continue;
        var Ls = d2(a, b) * (t1 - t0), cosT = Math.abs((b.x - a.x) * (-uz) + (b.z - a.z) * ux) / (d2(a, b) || 1);
        if (cosT < 1 - EPS * 1000 || Ls > (w.esp + 2 * r) / Math.max(cosT, EPS) + B.TOL) return { erro: "corre dentro da parede " + w.id };   // hid:ok 1e-3 de tolerância no paralelismo
        /* o ponto da travessia fora de vão de porta/janela (o tubo passa acima da verga) */
        var tm = (t0 + t1) / 2, pm = { x: a.x + (b.x - a.x) * tm, z: a.z + (b.z - a.z) * tm };
        var vao = arr(obst.aberturas).filter(function (ab) { var lo2 = Math.min(loc(ab.p1).u, loc(ab.p2).u), hi2 = Math.max(loc(ab.p1).u, loc(ab.p2).u), up = loc(pm).u; return Math.abs(loc(ab.p1).v) <= w.esp && up >= lo2 - r - folga && up <= hi2 + r + folga && y - r < ab.y1 + folga; })[0];
        if (vao) return { erro: "passa no vão " + vao.id + " da parede " + w.id };
        n++;
      }
      var pil = arr(obst.pilares).filter(function (p) { if (y < p.base - EPS || y > p.base + p.altura + EPS) return false; var hl = num(p.largura, 0) / 2 + r + folga, hp = num(p.profundidade, 0) / 2 + r + folga; return segSeg({ x: a.x, y: 0, z: a.z }, { x: b.x, y: 0, z: b.z }, { x: p.x, y: 0, z: p.z }, { x: p.x, y: 0, z: p.z }) < Math.max(hl, hp); })[0];
      if (pil) return { erro: "esbarra no pilar " + pil.id };
      var vg = arr(obst.vigas).filter(function (v) { return y + r > v.topo - v.altura - folga && y - r < v.topo + folga && segSeg({ x: a.x, y: 0, z: a.z }, { x: b.x, y: 0, z: b.z }, { x: v.p1.x, y: 0, z: v.p1.z }, { x: v.p2.x, y: 0, z: v.p2.z }) < num(v.largura, 0) / 2 + r; })[0];
      if (vg) return { erro: "atravessa a viga " + vg.id };
      return { n: n };
    }

    /* ---------- cada ponto: o aquecedor do pavimento (ou o de outro pavimento, pela coluna), a parede, a descida */
    function pisoDe(f, c) { var P = K._int.pisoDe(estado, avaliarFam, f, c); return P && P.ok ? P.y : null; }
    var grupos = {}, ordemG = [];
    livres.forEach(function (k) {
      var f = famPorId[String(k.famInst)]; if (!f) return;
      var cs = K._int.conectores(avaliarFam, f), c = cs.filter(function (q) { return q.sistema === "agua_quente" && q.cid === String(k.id); })[0] || cs.filter(function (q) { return q.sistema === "agua_quente" && d3(q, k) <= B.TOL; })[0];
      if (!c) { pend("ponto " + k.famInst + ":" + k.id + " sem o conector na família — trace à mão", [k.famInst]); return; }
      var piso = pisoDe(f, c);
      if (piso == null) { pend("não achei o piso do aparelho " + k.famInst + " — trace à mão", [k.famInst]); return; }
      /* o aquecedor do MESMO pavimento (o piso do aquecedor = o piso do ambiente dele), o mais perto */
      var cand = Aq.filter(function (A) { var pa = pisoDe(A.f, A.af); return pa != null && Math.abs(pa - piso) <= mNo; }).sort(function (A1, A2) { return d2(A1.aq, c) - d2(A2.aq, c); });
      var central = false;
      if (!cand.length) {
        /* H6 (R-AQ11): aquecimento CENTRAL em outro pavimento — o aquecedor mais perto em planta, de qualquer pavimento */
        cand = Aq.filter(function (A) { return pisoDe(A.f, A.af) != null; }).sort(function (A1, A2) { return d2(A1.aq, c) - d2(A2.aq, c) || Math.abs(pisoDe(A1.f, A1.af) - piso) - Math.abs(pisoDe(A2.f, A2.af) - piso); });
        central = true;
        if (!cand.length) { pend("o ponto " + k.famInst + ":" + k.id + " não tem aquecedor com piso conhecido — trace à mão", [k.famInst]); return; }
      }
      var A = cand[0], gk = String(A.f.id) + (central ? "|c|" + r4(piso) : "");
      var tipoP = K.tipoDaFamilia ? K.tipoDaFamilia(f.famId, f.tipoId) : null; if (K.aparelhoNorma) tipoP = K.aparelhoNorma(tipoP);
      if (!grupos[gk]) { grupos[gk] = { A: A, piso: piso, central: central, pontos: [] }; ordemG.push(gk); }
      grupos[gk].pontos.push({ k: k, f: f, c: c, cs: cs, piso: piso, chuveiro: tipoP === "chuveiro" });
    });

    var DN_SUB = {};
    function dnSub(f) {
      var tipo = K.tipoDaFamilia(f.famId, f.tipoId); if (K.aparelhoNorma) tipo = K.aparelhoNorma(tipo);
      if (DN_SUB[tipo] != null) return DN_SUB[tipo];
      var nomeT = PONTO_TABELA[tipo], ref = null, dn = null, bit = (B.BITOLA_REF || {}).pvc_soldavel || {};
      if (ctx && nomeT) { var q = ctx.consulta("aq.dn_tubulacao", { ponto_de_utilizacao: nomeT }, "dn_ref_pol", "água quente: sub-ramal de " + tipo); if (q.ok) ref = String(q.valor); }
      if (ref) Object.keys(bit).forEach(function (de) { if (bit[de] === ref && dn == null) dn = num(de, null); });
      if (dn == null) { pend("DN mínimo do sub-ramal de água quente de " + tipo + " sem tabela (aq.dn_tubulacao): usado o DN padrão do " + matAQ + " — rode o dimensionamento", [f.id]); dn = (B.MATERIAIS[matAQ] || {}).dn; }
      DN_SUB[tipo] = comercial(dn);
      return DN_SUB[tipo];
    }

    var nOp = 0;
    function novoId(hid, parte) { nOp++; return "ta-aq-" + hid + "-" + parte + "-" + nOp; }
    var rBar = raio(dnAFpad);
    /* a cota da distribuição de um pavimento — abaixo do barrilete de água fria (o topo das esperas: teto − folga) com o afastamento (R-AQ2) */
    function cotaDistribuicao(tetos, rAQ) { var t = Math.min.apply(null, tetos); return r4(t - folga - rBar - afast - rAQ); }

    /* ================= R-AQ1/R-AQ2: as ligações do aquecedor (alimentação de água fria + saída de água quente até a distribuição) */
    function baseAquecedor(hid, A, dnAq, yD) {
      var fA = A.f, ops = [];
      /* a normal da parede atrás do aquecedor (o Z local sai da parede) e a face dela */
      var rot = num(fA.rotY, 0), nA = { x: -Math.sin(rot), z: -Math.cos(rot) };
      var vA = vols.filter(function (v) { return String(v.id) === String(fA.id); })[0], meiaL = vA ? vA.hl : 0;
      var yCorpo = vA ? (vA.y0 + vA.y1) / 2 : num(fA.y, 0);
      var wA = K._int.paredeDe(estado, { x: num(fA.x, 0) + nA.x * B.TOL, z: num(fA.z, 0) + nA.z * B.TOL }, yCorpo);
      if (!wA) { pend("o aquecedor " + fA.id + " não está encostado em parede: a alimentação e a saída dele são traçadas à mão", [fA.id]); return null; }
      var tetoA = K._int.tetoDe(estado, fA, pisoDe(fA, A.af)).y, rAQ = raio(dnAq), dL = afast + rAQ;
      /* o eixo embutido atrás do conector: a face passa pela origem do aquecedor (o fundo da família encosta nela) */
      function eixoA(c, prof) { var fr0 = -((c.x - num(fA.x, 0)) * nA.x + (c.z - num(fA.z, 0)) * nA.z); return { x: r4(c.x + nA.x * (fr0 + prof)), z: r4(c.z + nA.z * (fr0 + prof)) }; }
      /* H6: as ligações saem POR BAIXO (passagem, boiler de parede) ou POR CIMA (boiler a gás de piso, ligações no topo): o tubo sai a
         distância mínima entre nós além do corpo (fora dele e do que estiver embaixo/em cima) e entra na parede */
      var cima = vA ? Math.min(A.af.y, A.aq.y) > yCorpo : false, sg = cima ? 1 : -1;
      var yBaixo = cima ? Math.max(A.af.y, A.aq.y) : Math.min(A.af.y, A.aq.y);
      var dnAF = dnAFpad, rAF = raio(dnAF);
      var FAIXA_LIG = 0.3;   // hid:ok faixa da busca da cota das ligações junto ao aquecedor (m)
      var tgA = { x: -nA.z, z: nA.x }, ladoAF = ((A.af.x - A.aq.x) * tgA.x + (A.af.z - A.aq.z) * tgA.z) >= 0 ? 1 : -1;
      var eAF = eixoA(A.af, embutir), yEsp = r4(tetoA - folga);
      /* a descida ao lado não pode cair dentro de OUTRA parede (o aquecedor no canto) nem esbarrar no que já está na parede */
      function noutraParede(p) { var y0 = Math.min(yBaixo, yBaixo + sg * FAIXA_LIG); return paredes.some(function (w) { if (w.id === wA.id || w.topo <= y0 || w.base >= yEsp) return false; var ux = w.p2.x - w.p1.x, uz = w.p2.z - w.p1.z, L = Math.sqrt(ux * ux + uz * uz); if (!(L > EPS)) return false; var t = ((p.x - w.p1.x) * ux + (p.z - w.p1.z) * uz) / (L * L); t = Math.max(0, Math.min(1, t)); return d2(p, { x: w.p1.x + ux * t, z: w.p1.z + uz * t }) < w.esp / 2 + rAF + folga; }); }
      var eLat = null, eAQ = eixoA(A.aq, embutir), raiz = { x: r4(eAQ.x - nA.x * (embutir + dL)), z: r4(eAQ.z - nA.z * (embutir + dL)) };
      /* H6 (8.3.4): o REGISTRO da saída de água quente no tubo que sai do aquecedor (à vista, fora do corpo) — o tubo da saída anda
         mais um registro + duas margens além da cota da água fria antes de entrar na parede */
      var dQ = Lr + 2 * mNo, yLig = r4(yBaixo + sg * mNo);
      var t1 = { op: "trecho", id: novoId(hid, "af"), sistema: "agua_fria", material: matAF, dn: dnAF, p1: P3(0, yEsp, 0), p2: P3(0, yLig, 0), continua: "p1", aq: String(fA.id), aqParte: "alimentacao" };
      var t2 = { op: "trecho", id: novoId(hid, "af"), sistema: "agua_fria", material: matAF, dn: dnAF, p1: P3(0, yLig, 0), p2: P3(eAF.x, yLig, eAF.z), aq: String(fA.id), aqParte: "alimentacao" };
      var t3 = { op: "trecho", id: novoId(hid, "af"), sistema: "agua_fria", material: matAF, dn: dnAF, p1: P3(eAF.x, yLig, eAF.z), p2: P3(A.af.x, yLig, A.af.z), aq: String(fA.id), aqParte: "alimentacao" };
      var t4 = { op: "trecho", id: novoId(hid, "af"), sistema: "agua_fria", material: matAF, dn: dnAF, p1: P3(A.af.x, yLig, A.af.z), p2: P3(A.af.x, A.af.y, A.af.z), aq: String(fA.id), aqParte: "alimentacao" };
      var s1 = { op: "trecho", id: novoId(hid, "s"), sistema: "agua_quente", material: matAQ, dn: dnAq, p1: P3(A.aq.x, A.aq.y, A.aq.z), p2: P3(A.aq.x, yLig + sg * dQ, A.aq.z), aq: String(fA.id), aqParte: "saida" };
      var s2 = { op: "trecho", id: novoId(hid, "s"), sistema: "agua_quente", material: matAQ, dn: dnAq, p1: P3(A.aq.x, yLig + sg * dQ, A.aq.z), p2: P3(eAQ.x, yLig + sg * dQ, eAQ.z), aq: String(fA.id), aqParte: "saida" };
      var s3 = { op: "trecho", id: novoId(hid, "s"), sistema: "agua_quente", material: matAQ, dn: dnAq, p1: P3(eAQ.x, yLig + sg * dQ, eAQ.z), p2: P3(eAQ.x, yD, eAQ.z), aq: String(fA.id), aqParte: "saida" };
      var s4 = { op: "trecho", id: novoId(hid, "s"), sistema: "agua_quente", material: matAQ, dn: dnAq, p1: P3(eAQ.x, yD, eAQ.z), p2: P3(raiz.x, yD, raiz.z), aq: String(fA.id), aqParte: "saida", isolamento: true };   /* no entreforro: isolado (NBR 5626:2020 6.12.3) */
      var base = [t1, t2, t3, t4, s1, s2, s3, s4], cfA = null;
      /* a cota das ligações junto ao aquecedor: a mais perto do corpo que não esbarra em nada (a bancada logo embaixo) — passo de
         meio centímetro (a grade do traçado é de 5 cm; aqui o vão entre o aquecedor e o que está embaixo é de poucos cm) */
      var PASSO_LIG = 0.005, rMaxA = Math.max(rAF, raio(dnAq)), NLAT = 12;   // hid:ok passo e faixa da busca da cota (m); até 12 passos da grade para o lado
      var y0A = vA ? (cima ? Math.max(vA.y1, yBaixo) : Math.min(vA.y0, yBaixo)) : yBaixo;
      /* as camadas da parede (a mesma regra das descidas, R-AQ4): o eixo da água fria, a mais rasa com o cobrimento, a mais funda */
      var rasaA = cobr + rMaxA, fundaA = wA.esp - cobr - rMaxA, camA = [embutir, rasaA, fundaA].filter(function (x, i, l) { return x >= rasaA - EPS && x <= fundaA + EPS && l.indexOf(x) === i; });
      /* dois modos para o registro da saída de AQ (8.3.4): (1) no tubo que sai do aquecedor, à vista e à mão (precisa do vão de um registro
         além do corpo); (2) sem esse vão (a bancada logo embaixo), no toco da saída no entreforro, logo acima do aquecedor — o toco cresce o
         registro + duas margens e a raiz da distribuição vai junto */
      var modoRg = 1, Lst = Math.ceil(dQ / G.passo) * G.passo;
      for (var tent = 0; tent < 2 && !eLat; tent++) {
      if (tent === 1) { modoRg = 2; dQ = 0; raiz = { x: r4(eAQ.x - nA.x * (embutir + dL + Lst)), z: r4(eAQ.z - nA.z * (embutir + dL + Lst)) }; s4.p2.x = raiz.x; s4.p2.z = raiz.z; }
      for (var kL = 0; kL < camA.length * (NLAT * 2 + 2) && !eLat; kL++) {
        var kk = kL % (NLAT * 2 + 2), prof = camA[Math.floor(kL / (NLAT * 2 + 2))], lado = kk % 2 === 0 ? ladoAF : -ladoAF, off = meiaL + afast + rAF + Math.floor(kk / 2) * G.passo;
        var cP = eixoA({ x: num(fA.x, 0), z: num(fA.z, 0) }, prof), cand = { x: r4(cP.x + tgA.x * lado * off), z: r4(cP.z + tgA.z * lado * off) };
        if (noutraParede(cand)) continue;
        var eAFp = eixoA(A.af, prof), eAQp = eixoA(A.aq, prof);
        t1.p1.x = t1.p2.x = t2.p1.x = cand.x; t1.p1.z = t1.p2.z = t2.p1.z = cand.z;
        t2.p2.x = t3.p1.x = eAFp.x; t2.p2.z = t3.p1.z = eAFp.z; s2.p2.x = s3.p1.x = s3.p2.x = s4.p1.x = eAQp.x; s2.p2.z = s3.p1.z = s3.p2.z = s4.p1.z = eAQp.z;
        /* o começo da busca: 3 mm além do corpo e, no mínimo, um passo da grade além do conector (o boiler elétrico tem a entrada de água
           fria na ponta da válvula de segurança, no fundo da caixa: o tubo de 1,5 cm até ela sumia na rede e a entrada ficava solta) */
        var y0B = sg < 0 ? Math.min(y0A - rMaxA - FOLGA_LIMITE * 3, yBaixo - G.passo) : Math.max(y0A + rMaxA + FOLGA_LIMITE * 3, yBaixo + G.passo);   // hid:ok 3 mm além do corpo
        for (var yT = r4(y0B); sg < 0 ? yT >= y0A - FAIXA_LIG : yT <= y0A + FAIXA_LIG; yT = r4(yT + sg * PASSO_LIG)) {
          var yQ = r4(yT + sg * dQ);
          if (sg > 0 && yQ > yD - mNo) break;   /* ligações por cima: a saída passaria da distribuição (boiler alto demais para o entreforro) */
          t1.p2.y = t2.p1.y = t2.p2.y = t3.p1.y = t3.p2.y = t4.p1.y = yT;
          s1.p2.y = s2.p1.y = s2.p2.y = s3.p1.y = yQ;
          cfA = null;
          for (var i0 = 0; i0 < base.length && !cfA; i0++) cfA = conflito(base[i0].p1, base[i0].p2, raio(base[i0].dn), null);
          if (!cfA) { yLig = yT; eLat = cand; break; }
        }
      }
      }
      if (!eLat) { pend("a alimentação de água fria / a saída de água quente do aquecedor " + fA.id + " não acha caminho livre na parede (esbarra em " + (cfA ? cfA.com : "outra parede") + ") — trace à mão", [fA.id].concat(cfA ? [cfA.com] : [])); return null; }
      var yRg = aRG.ok ? r4(pisoDe(fA, A.af) + aRG.valor) : r4((yEsp + yLig) / 2);
      if (yRg - Lr / 2 - mNo < Math.min(yLig, yEsp) || yRg + Lr / 2 + mNo > Math.max(yLig, yEsp)) yRg = r4((yEsp + yLig) / 2);
      base.forEach(function (t) { novos.push({ a: t.p1, b: t.p2, r: raio(t.dn), sistema: t.sistema, id: t.id }); ops.push(t); });
      var frA = { x: -nA.x, y: 0, z: -nA.z }, gA = BIC() && BIC().giroPara ? BIC().giroPara({ x: 0, y: t1.p2.y - t1.p1.y, z: 0 }, frA) : 0;
      var rgA = { op: "acessorio", id: novoId(hid, "rg"), famId: "ra-registro-gaveta", tipoId: tipoRgAF, trecho: t1.id, novoId: t1.id + "b", x: eLat.x, y: yRg, z: eLat.z, comprimento: Lr, aq: String(fA.id), aqParte: "alimentacao" };
      if (gA) rgA.giro = gA;
      ops.push(rgA);
      /* H6 (8.3.4): o registro da SAÍDA de água quente, no meio do tubo que sai do aquecedor, volante para a frente (fora da parede) */
      var tQ = modoRg === 1 ? s1 : s4, gQ = modoRg === 1 && BIC() && BIC().giroPara ? BIC().giroPara({ x: 0, y: s1.p2.y - s1.p1.y, z: 0 }, frA) : 0;
      /* no toco do entreforro: o registro fica fora da parede, no meio do trecho livre (da face até a raiz) */
      var cQ = modoRg === 1 ? { x: s1.p1.x, y: r4((s1.p1.y + s1.p2.y) / 2), z: s1.p1.z } : { x: r4(eAQ.x - nA.x * (embutir + dL + Lst / 2)), y: yD, z: r4(eAQ.z - nA.z * (embutir + dL + Lst / 2)) };
      var rgQ = { op: "acessorio", id: novoId(hid, "rg"), famId: "ra-registro-gaveta", tipoId: tipoRgAQ, trecho: tQ.id, novoId: tQ.id + "b", x: cQ.x, y: cQ.y, z: cQ.z, comprimento: Lr, aq: String(fA.id), aqParte: "saida" };
      if (gQ) rgQ.giro = gQ;
      ops.push(rgQ);
      out.decisoes.push({ id: "aq.aquecedor", texto: "Aquecedor " + fA.id + ": água fria pela espera do barrilete a " + f2(yEsp) + " m, descendo embutida ao lado dele, registro de gaveta a " + f2(yRg) + " m (fora do corpo, à mão); saída de água quente " + (cima ? "pelo topo" : "por baixo") + " com o registro de gaveta " + (modoRg === 1 ? "à vista a " + f2(rgQ.y) + " m" : "no entreforro, logo acima do aquecedor (sem vão para ele sob o corpo)") + " (NBR 13103:2020 8.3.4, recomendação: registro na entrada de AF e na saída de AQ — texto conferido; a vigente é a 2024 = 2020 + Emenda 1, não lida — conferir) e subindo embutida até a distribuição a " + f2(yD) + " m (entreforro, abaixo do barrilete de água fria com o afastamento de " + f2(afast) + " m)." });
      return { ops: ops, raiz: raiz, yD: yD, dL: dL, nA: nA, wA: wA, s3: s3, s4: s4, eAQ: { x: s3.p1.x, z: s3.p1.z }, yQ: s3.p1.y };
    }

    /* ================= R-AQ3/R-AQ4: a árvore de um pavimento a partir de uma raiz no entreforro (pontos reais + pontos "virtuais": a
       tomada da coluna de outro pavimento, que precisa estar na árvore como uma folha sem descida) */
    function arvorePiso(hid, fA, raiz, yD, dL, pontos, virtuais) {
      var ops = [], pendG = [], lig = [];
      pontos.forEach(function (p) {
        var c = p.c, n = c.parede ? { x: num(c.parede.x, 0), z: num(c.parede.z, 0) } : null, Ln = n ? Math.sqrt(n.x * n.x + n.z * n.z) : 0;
        if (!(Ln > EPS)) { pendG.push(["o ponto " + p.k.famInst + ":" + p.k.id + " não é de parede: a água quente é traçada à mão", [p.k.famInst]]); return; }
        n.x /= Ln; n.z /= Ln;
        var dF = Math.max(0, num(c.parede.d, 0)), w = K._int.paredeDe(estado, { x: c.x + n.x * dF, z: c.z + n.z * dF }, c.y), esp = w ? w.esp : 0, r = raio(p.dn);
        if (!w) { pendG.push(["o ponto " + p.k.famInst + ":" + p.k.id + " não encosta em parede: a descida embutida não tem onde correr — trace à mão", [p.k.famInst]]); return; }
        /* as ligações do MESMO aparelho (esgoto e água fria dele): a louça manda o afastamento, só a folga física conta */
        var proprios = p.cs.map(function (q) { return { x: q.x, y: q.y, z: q.z }; });
        function mesmoAp(T) { return proprios.some(function (q) { return segSeg(q, q, T.a, T.b) <= embutir + dF + B.TOL; }); }
        var yRamal = aRG.ok ? p.piso + aRG.valor : null;
        var yRgP = yRamal != null ? r4(yRamal + 2 * raio(dnAFpad) + folga + Lr / 2) : null;   /* logo acima do ramal de água fria (eixo no RG + o raio; a geratriz de cima + a folga + meio registro) */
        if (yRgP == null || yRgP - Lr / 2 - mNo < c.y || yRgP + Lr / 2 + mNo > yD) yRgP = r4((c.y + yD) / 2);
        var rasa = cobr + r, funda = esp - cobr - r, camadas = [embutir, rasa, funda].filter(function (x, i, l) { return x >= rasa - EPS && x <= funda + EPS && l.indexOf(x) === i; });
        var achou = null;
        for (var ic = 0; ic < camadas.length && !achou; ic++) {
          var pr = dF + camadas[ic], W0 = { x: r4(c.x + n.x * pr), z: r4(c.z + n.z * pr) }, Lp = { x: r4(c.x + n.x * dF - n.x * dL), z: r4(c.z + n.z * dF - n.z * dL) };
          var segs = [
            { p1: P3(Lp.x, yD, Lp.z), p2: P3(W0.x, yD, W0.z), parte: "descida" },
            { p1: P3(W0.x, yD, W0.z), p2: P3(W0.x, c.y, W0.z), parte: "descida" },
            { p1: P3(W0.x, c.y, W0.z), p2: P3(c.x, c.y, c.z), parte: "descida" }
          ];
          var cf2 = null;
          for (var s = 0; s < segs.length && !cf2; s++) cf2 = conflito(segs[s].p1, segs[s].p2, r, mesmoAp);
          if (!cf2) achou = { segs: segs, L: Lp, W: W0, prof: camadas[ic] };
          else if (ic === camadas.length - 1) pendG.push(["a descida do ponto " + p.k.famInst + ":" + p.k.id + " não cabe na parede " + w.id + " sem esbarrar em " + cf2.com + " (nenhuma camada da parede dá a folga) — trace à mão", [p.k.famInst, cf2.com]]);
        }
        if (!achou) return;
        achou.segs.forEach(function (sg) { novos.push({ a: sg.p1, b: sg.p2, r: r, sistema: "agua_quente", id: "desc-" + p.k.famInst }); });
        lig.push({ p: p, L: achou.L, segs: achou.segs, r: r, yRg: yRgP, n: n, prof: achou.prof, parede: w.id, dn: p.dn });
      });
      arr(virtuais).forEach(function (v) { lig.push({ virtual: true, id: v.id, L: { x: v.x, z: v.z }, segs: [], r: raio(v.dn), dn: v.dn }); });
      var arvore = [{ a: { x: raiz.x, z: raiz.z }, b: { x: raiz.x, z: raiz.z }, dn: 0 }];   /* o nó da raiz (comprimento 0) */
      lig.sort(function (l1, l2) { return d2(l1.L, raiz) - d2(l2.L, raiz); });
      function grauNo(q) {
        var g0 = d2(q, raiz) <= EPS * 10 ? 1 : 0;   // hid:ok tolerância do nó
        arvore.forEach(function (sg) { if (d2(sg.a, sg.b) < EPS) return; if (d2(sg.a, q) <= EPS * 10 || d2(sg.b, q) <= EPS * 10) g0++; });   // hid:ok tolerância do nó
        lig.forEach(function (l2) { if (d2(l2.L, q) <= EPS * 10) g0++; });   // hid:ok tolerância do nó
        return g0;
      }
      lig.forEach(function (l) {
        /* o ponto virtual que cai NA raiz (a coluna sai do próprio nó) já está ligado */
        if (l.virtual && d2(l.L, raiz) <= EPS * 10) { l.ok = true; return; }   // hid:ok tolerância do nó
        var melhor = null;
        arvore.forEach(function (sg, is) {
          var cand = [sg.a, sg.b], ux = sg.b.x - sg.a.x, uz = sg.b.z - sg.a.z, LL = ux * ux + uz * uz;
          if (LL > EPS) { var tt = ((l.L.x - sg.a.x) * ux + (l.L.z - sg.a.z) * uz) / LL, Ls = Math.sqrt(LL);
            [0, 1, -1, 2, -2, 3, -3].forEach(function (nP) { var t2 = tt + nP * G.passo / Ls; if (t2 > EPS && t2 < 1 - EPS) cand.push({ x: r4(sg.a.x + ux * t2), z: r4(sg.a.z + uz * t2) }); });   // hid:ok passos da grade
          }
          cand.forEach(function (q) {
            /* REVISÃO H5 (21/10/2026): nada de CRUZETA (a de PPR não tem composição: o orçamento saía pendente na casa) — o nó que já
               tem 3 ligações (tê) não recebe a 4ª; o ramal liga um passo ao lado (outro tê) */
            if (grauNo(q) >= 3) return;   // hid:ok tê = 3 ligações (a 4ª seria cruzeta)
            var cams = Math.abs(q.x - l.L.x) < EPS || Math.abs(q.z - l.L.z) < EPS ? [[l.L, q]] : [[l.L, { x: q.x, z: l.L.z }, q], [l.L, { x: l.L.x, z: q.z }, q]];
            [2, 4, 6].forEach(function (nP) { [1, -1].forEach(function (sg2) { var o2 = sg2 * nP * G.passo;   // hid:ok passos da grade do desvio
              cams.push([l.L, { x: q.x + o2, z: l.L.z }, { x: q.x + o2, z: q.z }, q]); cams.push([l.L, { x: l.L.x, z: q.z + o2 }, { x: q.x, z: q.z + o2 }, q]); }); });
            cams.forEach(function (cm) {
              var custo = 0, ok = true, cr = 0;
              for (var m = 1; m < cm.length && ok; m++) {
                var a = P3(cm[m - 1].x, yD, cm[m - 1].z), b = P3(cm[m].x, yD, cm[m].z); if (d2(a, b) < EPS) continue;
                var cp = cortaParede(a, b, yD, l.r); if (cp.erro) { ok = false; break; }
                cr += cp.n;
                var cfL = conflito(a, b, l.r, null); if (cfL) { ok = false; break; }
                custo += d2(a, b);
              }
              custo += cr * num((H.PESOS || {}).parede, 0) + (cm.length - 2) * num((H.PESOS || {}).conexao, 0);
              if (ok && (!melhor || custo < melhor.custo - EPS)) melhor = { custo: custo, cam: cm, seg: is, q: q };
            });
          });
        });
        if (!melhor) { pendG.push([l.virtual ? "a linha de água quente do entreforro não chega à coluna " + l.id + " (parede, vão, viga ou tubo no caminho) — trace à mão" : "a linha de água quente do entreforro não chega ao ponto " + l.p.k.famInst + ":" + l.p.k.id + " (parede, vão, viga ou tubo no caminho) — trace à mão", [l.virtual ? fA.id : l.p.k.famInst]]); return; }
        var sg0 = arvore[melhor.seg], q0 = melhor.q;
        if (d2(q0, sg0.a) > EPS && d2(q0, sg0.b) > EPS) { arvore.splice(melhor.seg, 1, { a: sg0.a, b: { x: q0.x, z: q0.z } }, { a: { x: q0.x, z: q0.z }, b: sg0.b }); }
        for (var m = melhor.cam.length - 1; m >= 1; m--) {
          var a = melhor.cam[m], b = melhor.cam[m - 1]; if (d2(a, b) < EPS) continue;
          arvore.push({ a: { x: a.x, z: a.z }, b: { x: b.x, z: b.z } });
          novos.push({ a: P3(a.x, yD, a.z), b: P3(b.x, yD, b.z), r: l.r, sistema: "agua_quente", id: "linha" });
        }
        l.ok = true;
      });
      var okLig = lig.filter(function (l) { return l.ok; });
      okLig.forEach(function (l) {
        for (var is = 0; is < arvore.length; is++) {
          var sg = arvore[is], ux = sg.b.x - sg.a.x, uz = sg.b.z - sg.a.z, LL = ux * ux + uz * uz; if (!(LL > EPS)) continue;
          var tt = ((l.L.x - sg.a.x) * ux + (l.L.z - sg.a.z) * uz) / LL, q = { x: sg.a.x + ux * tt, z: sg.a.z + uz * tt };
          if (tt > EPS && tt < 1 - EPS && d2(q, l.L) <= EPS * 10) { arvore.splice(is, 1, { a: sg.a, b: { x: l.L.x, z: l.L.z } }, { a: { x: l.L.x, z: l.L.z }, b: sg.b }); break; }   // hid:ok tolerância do nó
        }
      });
      var reais = okLig.filter(function (l) { return !l.virtual; });
      /* ---------- a árvore orientada a partir da raiz: p1 = montante; DN = o maior a jusante; retas seguidas viram um trecho */
      var nos = [], arestas = [];
      function no(p) { for (var i = 0; i < nos.length; i++) if (d2(nos[i], p) <= EPS * 10) return i; nos.push({ x: p.x, z: p.z, e: [] }); return nos.length - 1; }   // hid:ok tolerância do nó (1e-5 m)
      arvore.forEach(function (sg) { if (d2(sg.a, sg.b) < EPS) { no(sg.a); return; } var ia = no(sg.a), ib = no(sg.b); arestas.push({ a: ia, b: ib }); nos[ia].e.push(arestas.length - 1); nos[ib].e.push(arestas.length - 1); });
      var iR = no(raiz), folhaDe = {};
      okLig.forEach(function (l) { folhaDe[no(l.L)] = l; });
      var pai = {}, ordem = [iR], vis = {}; vis[iR] = 1;
      for (var qi = 0; qi < ordem.length; qi++) nos[ordem[qi]].e.forEach(function (ei) { var E = arestas[ei], m = E.a === ordem[qi] ? E.b : E.a; if (vis[m]) return; vis[m] = 1; pai[m] = { de: ordem[qi], e: ei }; ordem.push(m); });
      var dnNo = {};
      for (var oi = ordem.length - 1; oi >= 0; oi--) { var ni = ordem[oi], dm = folhaDe[ni] ? folhaDe[ni].dn : 0; nos[ni].e.forEach(function (ei) { var E = arestas[ei], m = E.a === ni ? E.b : E.a; if (pai[m] && pai[m].de === ni) dm = Math.max(dm, dnNo[m] || 0); }); dnNo[ni] = dm; }
      function filhos(ni) { return nos[ni].e.map(function (ei) { var E = arestas[ei]; return E.a === ni ? E.b : E.a; }).filter(function (m) { return pai[m] && pai[m].de === ni; }); }
      function reto(a, b, c) { var ux = b.x - a.x, uz = b.z - a.z, vx = c.x - b.x, vz = c.z - b.z; return Math.abs(ux * vz - uz * vx) < EPS * 10 && ux * vx + uz * vz > 0; }   // hid:ok tolerância de alinhamento
      var dnMax = 0; okLig.forEach(function (l) { dnMax = Math.max(dnMax, l.dn); });
      var pilha = [iR];
      while (pilha.length) {
        var ini = pilha.pop();
        filhos(ini).forEach(function (m) {
          var cur = m, prev = ini;
          while (!folhaDe[cur] && filhos(cur).length === 1 && reto(nos[prev], nos[cur], nos[filhos(cur)[0]])) { prev = cur; cur = filhos(cur)[0]; }
          ops.push({ op: "trecho", id: novoId(hid, "l"), sistema: "agua_quente", material: matAQ, dn: comercial(Math.max(dnNo[m] || 0, dnNo[cur] || 0) || dnMax), p1: P3(nos[ini].x, yD, nos[ini].z), p2: P3(nos[cur].x, yD, nos[cur].z), aq: String(fA.id), aqParte: "distribuicao", isolamento: true });
          pilha.push(cur);
        });
      }
      /* as descidas (no sentido da água: do entreforro ao ponto) com o registro de gaveta, volante para dentro do cômodo */
      reais.forEach(function (l) {
        var ts = l.segs.map(function (sg) { return { op: "trecho", id: novoId(hid, "d"), sistema: "agua_quente", material: matAQ, dn: l.p.dn, p1: sg.p1, p2: sg.p2, aq: String(fA.id), aqParte: "descida", aqPonto: String(l.p.k.famInst) }; });
        ts.forEach(function (t) { ops.push(t); });
        var tv = ts[1], fr = { x: -l.n.x, y: 0, z: -l.n.z }, g = BIC() && BIC().giroPara ? BIC().giroPara({ x: 0, y: tv.p2.y - tv.p1.y, z: 0 }, fr) : 0;
        var rg = { op: "acessorio", id: novoId(hid, "rg"), famId: "ra-registro-gaveta", tipoId: tipoRgAQ, trecho: tv.id, novoId: tv.id + "b", x: tv.p1.x, y: l.yRg, z: tv.p1.z, comprimento: Lr, aq: String(fA.id), aqParte: "descida" };
        if (g) rg.giro = g;
        ops.push(rg);
        /* REVISÃO H5 (21/10/2026): a DUCHA (chuveiro não elétrico) — o REGISTRO do misturador da água quente é da própria família
           hid-chuveiro, no ponto de AQ (modelado como se executa: um registro só) — aqui só o tubo */
      });
      return { ops: ops, pend: pendG, okLig: okLig, reais: reais, virtuaisOk: okLig.filter(function (l) { return l.virtual; }).map(function (l) { return l.id; }) };
    }

    /* ================= R-AQ11: a COLUNA de água quente para os pavimentos sem aquecedor */
    /* a coluna de água fria que atravessa a faixa de cotas [y0, y1] (trechos verticais no mesmo eixo, que cobrem a faixa) */
    function colunasAF(y0, y1) {
      var porEixo = {};
      arr(estado.instalacoes && estado.instalacoes.trechos).forEach(function (t) {
        if (t.sistema !== "agua_fria" || !t.p1 || !t.p2 || d2(t.p1, t.p2) > B.TOL) return;
        var k = r4(t.p1.x) + "|" + r4(t.p1.z); (porEixo[k] = porEixo[k] || { x: t.p1.x, z: t.p1.z, iv: [], r: raio(t.dn) }).iv.push([Math.min(t.p1.y, t.p2.y), Math.max(t.p1.y, t.p2.y)]);
      });
      return Object.keys(porEixo).map(function (k) { return porEixo[k]; }).filter(function (c) {
        c.iv.sort(function (a, b) { return a[0] - b[0]; });
        var ate = null; c.iv.forEach(function (iv) { if (ate == null) { if (iv[0] <= y0 + EPS) ate = iv[1]; } else if (iv[0] <= ate + mNo) ate = Math.max(ate, iv[1]); });
        return ate != null && ate >= y1 - EPS;
      });
    }
    function paredeEm(p, y) { return paredes.filter(function (w) { if (y < w.base - EPS || y > w.topo + EPS) return false; var ux = w.p2.x - w.p1.x, uz = w.p2.z - w.p1.z, L = Math.sqrt(ux * ux + uz * uz); if (!(L > EPS)) return false; var t = ((p.x - w.p1.x) * ux + (p.z - w.p1.z) * uz) / (L * L); if (t < 0 || t > 1) return false; return d2(p, { x: w.p1.x + ux * t, z: w.p1.z + uz * t }) <= w.esp / 2 - EPS; })[0] || null; }
    function colunaCentral(hid, A, base, grsC, dnAq) {
      var fA = A.f, ops = [], pendC = [], ligados = [], virtuais = [];
      /* a cota de distribuição de cada pavimento atendido (o teto dos pontos dele) */
      grsC.forEach(function (Gr) { var rP = raio(Gr.dnMax); Gr.yD = cotaDistribuicao(Gr.pontos.map(function (p) { return K._int.tetoDe(estado, p.c, p.piso).y; }), rP); });
      var ys = grsC.map(function (Gr) { return Gr.yD; }).concat([base.yD]), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
      var Lst = Math.ceil((Lr + 2 * mNo) / G.passo) * G.passo, rC = raio(dnAq);
      function livreVert(p, ya, yb) { return !conflito(P3(p.x, ya, p.z), P3(p.x, yb, p.z), rC, null); }
      /* (i) no shaft da coluna de água fria: ao lado dela, com o afastamento, nas 4 direções e até 3 afastamentos */
      var col = null, origem = null;
      colunasAF(y0, y1).some(function (cA) {
        for (var k = 1; k <= COLUNA_PASSOS && !col; k++) LADOS.some(function (dd) {
          var s = (cA.r + afast + rC) * k, p = { x: r4(cA.x + dd[0] * s), z: r4(cA.z + dd[1] * s) };
          if (paredeEm(p, base.yD) || !livreVert(p, y0, y1)) return false;
          col = p; origem = "no shaft da coluna de água fria (" + f2(cA.x) + "; " + f2(cA.z) + "), a " + f2(s) + " m dela"; return true;
        });
        return !!col;
      });
      /* (ii) embutida na parede do aquecedor, se a parede se repete em todos os pavimentos da faixa (o eixo da subida da saída) */
      var naParede = false;
      if (!col) {
        var pE = base.eAQ, todos = grsC.every(function (Gr) { return !!paredeEm(pE, Gr.yD) && !!paredeEm(pE, (Gr.yD + Gr.piso) / 2); });
        if (todos && livreVert(pE, Math.min(y0, base.yQ), Math.max(y1, base.yQ))) { col = { x: pE.x, z: pE.z }; naParede = true; origem = "embutida na parede do aquecedor " + fA.id + " (" + base.wA.id + "), que se repete nos pavimentos atendidos — prever o passante na laje com o estrutural"; }
      }
      if (!col) { pendC.push(["os pontos de " + grsC.length + " pavimento(s) sem aquecedor (aquecimento central em " + fA.id + ") — a coluna de água quente não achou caminho: nem shaft com coluna de água fria livre ao lado, nem a parede do aquecedor repetida nos pavimentos; trace a coluna à mão", [fA.id]]); return { ops: ops, pend: pendC, ligados: 0, virtuais: [] }; }
      /* na parede: a coluna sai do próprio eixo da subida (o topo da saída para cima; o pé dela para baixo); no shaft: um ponto
         virtual da árvore do pavimento do aquecedor */
      var noTopo = naParede ? { x: col.x, z: col.z } : null;
      if (!naParede) virtuais.push({ id: "coluna-" + fA.id, x: col.x, z: col.z, dn: dnAq });
      /* os pavimentos acima e abaixo do aquecedor, do mais perto ao mais longe */
      var acima = grsC.filter(function (Gr) { return Gr.yD > base.yD; }).sort(function (a, b) { return a.yD - b.yD; }), abaixo = grsC.filter(function (Gr) { return Gr.yD < base.yD; }).sort(function (a, b) { return b.yD - a.yD; });
      [acima, abaixo].forEach(function (lista) {
        if (!lista.length) return;
        var yIni = naParede && lista === abaixo ? base.yQ : base.yD, dnL = [];
        for (var i = lista.length - 1; i >= 0; i--) dnL[i] = Math.max(lista[i].dnMax, i + 1 < lista.length ? dnL[i + 1] : 0);
        lista.forEach(function (Gr, i) {
          var t = { op: "trecho", id: novoId(hid, "c"), sistema: "agua_quente", material: matAQ, dn: comercial(dnL[i]), p1: P3(col.x, yIni, col.z), p2: P3(col.x, Gr.yD, col.z), aq: String(fA.id), aqParte: "coluna", isolamento: true };
          ops.push(t); novos.push({ a: t.p1, b: t.p2, r: raio(t.dn), sistema: "agua_quente", id: t.id });
          yIni = Gr.yD;
          /* a derivação do pavimento: um toco no entreforro com o REGISTRO DE GAVETA (o fechamento por pavimento), até a raiz da árvore */
          var cx = 0, cz = 0; Gr.pontos.forEach(function (p) { cx += p.c.x; cz += p.c.z; }); cx /= Gr.pontos.length; cz /= Gr.pontos.length;
          var dirs = naParede ? [[-base.nA.x, -base.nA.z]] : LADOS.slice().sort(function (a, b) { return d2({ x: col.x + b[0], z: col.z + b[1] }, { x: cx, z: cz }) > d2({ x: col.x + a[0], z: col.z + a[1] }, { x: cx, z: cz }) ? -1 : 1; });
          var Ltoco = naParede ? embutir + base.dL + Lst : Lst, feito = null;
          dirs.some(function (dd) {
            var q = P3(col.x + dd[0] * Ltoco, Gr.yD, col.z + dd[1] * Ltoco), a = P3(col.x, Gr.yD, col.z);
            var cp = naParede ? { n: 0 } : cortaParede(a, q, Gr.yD, raio(Gr.dnMax)); if (cp.erro) return false;
            if (conflito(a, q, raio(Gr.dnMax), null)) return false;
            feito = { a: a, q: q }; return true;
          });
          if (!feito) { pendC.push(["a derivação da coluna de água quente para o pavimento a " + f2(Gr.piso) + " m não acha caminho no entreforro — trace à mão", Gr.pontos.map(function (p) { return p.k.famInst; })]); return; }
          var toco = { op: "trecho", id: novoId(hid, "c"), sistema: "agua_quente", material: matAQ, dn: comercial(Gr.dnMax), p1: feito.a, p2: feito.q, aq: String(fA.id), aqParte: "coluna", isolamento: true };
          ops.push(toco); novos.push({ a: toco.p1, b: toco.p2, r: raio(toco.dn), sistema: "agua_quente", id: toco.id });
          var rg = { op: "acessorio", id: novoId(hid, "rg"), famId: "ra-registro-gaveta", tipoId: tipoRgAQ, trecho: toco.id, novoId: toco.id + "b", x: r4((feito.a.x + feito.q.x) / 2), y: Gr.yD, z: r4((feito.a.z + feito.q.z) / 2), comprimento: Lr, aq: String(fA.id), aqParte: "coluna" };
          ops.push(rg);
          var Ar = arvorePiso(hid, fA, { x: feito.q.x, z: feito.q.z }, Gr.yD, base.dL, Gr.pontos, []);
          Ar.ops.forEach(function (o) { ops.push(o); }); Ar.pend.forEach(function (q) { pendC.push(q); });
          Ar.reais.forEach(function (l) { ligados.push(l); });
        });
      });
      out.decisoes.push({ id: "aq.coluna", texto: "Aquecimento central: os pontos de " + grsC.length + " pavimento(s) sem aquecedor ligam ao aquecedor " + fA.id + " por uma coluna de água quente " + origem + " (decisão conservadora: o caminho que já atravessa as lajes; nunca furo no meio do cômodo), isolada, com registro de gaveta na derivação de cada pavimento (no entreforro: prever o acesso)." });
      void noTopo;
      return { ops: ops, pend: pendC, ligados: ligados.length, virtuais: virtuais, naParede: naParede };
    }

    /* ================= por aquecedor: as ligações, o pavimento dele e os pavimentos pela coluna */
    var porAq = {};
    ordemG.forEach(function (gk) { var Gr = grupos[gk], hid = String(Gr.A.f.id); (porAq[hid] = porAq[hid] || { A: Gr.A, proprio: null, centrais: [] }); if (Gr.central) porAq[hid].centrais.push(Gr); else porAq[hid].proprio = Gr; });
    Object.keys(porAq).forEach(function (hid) {
      var X = porAq[hid], A = X.A, fA = A.f;
      var todosP = (X.proprio ? X.proprio.pontos : []).concat(X.centrais.reduce(function (l, Gr) { return l.concat(Gr.pontos); }, []));
      var dnAq = 0; todosP.forEach(function (p) { p.dn = dnSub(p.f); dnAq = Math.max(dnAq, p.dn); });
      X.centrais.forEach(function (Gr) { Gr.dnMax = 0; Gr.pontos.forEach(function (p) { Gr.dnMax = Math.max(Gr.dnMax, p.dn); }); });
      var rAQ = raio(dnAq), pisoA = pisoDe(fA, A.af);
      var tetos = [K._int.tetoDe(estado, fA, pisoA).y].concat(X.proprio ? X.proprio.pontos.map(function (p) { return K._int.tetoDe(estado, p.c, p.piso).y; }) : []);
      var yD = cotaDistribuicao(tetos, rAQ);
      var b0 = baseAquecedor(hid, A, dnAq, yD); if (!b0) return;
      var ops = b0.ops.slice(), pendT = [], nLig = 0, okLigP = [];
      /* a coluna antes da árvore do próprio pavimento: a tomada dela é um ponto (virtual) da árvore */
      var CC = X.centrais.length ? colunaCentral(hid, A, b0, X.centrais, dnAq) : null;
      if (CC) { CC.pend.forEach(function (q) { pendT.push(q); }); nLig += CC.ligados; }
      /* na parede, sem ponto no próprio pavimento: a subida continua como coluna — o toco até a raiz sai do lote */
      if (CC && CC.naParede && !X.proprio) ops = ops.filter(function (o) { return o !== b0.s4; });
      if (X.proprio || (CC && CC.virtuais.length)) {
        var Ar = arvorePiso(hid, fA, b0.raiz, yD, b0.dL, X.proprio ? X.proprio.pontos : [], CC ? CC.virtuais : []);
        Ar.ops.forEach(function (o) { ops.push(o); }); Ar.pend.forEach(function (q) { pendT.push(q); });
        nLig += Ar.reais.length; okLigP = Ar.reais;
        if (CC && CC.virtuais.length && !Ar.virtuaisOk.length) { pendT.push(["a coluna de água quente do aquecedor " + fA.id + " não se liga à distribuição do pavimento dele — trace à mão", [fA.id]]); CC = null; }
      }
      if (CC) CC.ops.forEach(function (o) { ops.push(o); });
      pendT.forEach(function (q) { pend(q[0], q[1]); });
      if (!nLig) { pend("nenhum ponto de água quente ligou ao aquecedor " + fA.id + " — trace à mão", [fA.id]); return; }
      out.ligados += nLig;
      if (okLigP.length) out.decisoes.push({ id: "aq.distribuicao", texto: "Água quente do aquecedor " + fA.id + " (" + (B.MATERIAIS[matAQ] || {}).nome + "): distribuição no entreforro a " + f2(yD) + " m, a " + f2(b0.dL) + " m da face da parede; descida embutida até cada ponto (" + okLigP.map(function (l) { return l.p.k.famInst + ":" + l.p.k.id + " DN " + l.p.dn; }).join(", ") + ") com registro de gaveta logo acima do ramal de água fria, volante para dentro do cômodo. DN do sub-ramal pela tabela de água quente (aq.dn_tubulacao); a montante, o maior a jusante (o Traçar confere vazão, pressão e velocidade pelo método da NBR 5626 — js/hidaq.js)." });
      ops.forEach(function (o) { out.ops.push(o); });
      /* REVISÃO H5: DILATAÇÃO TÉRMICA — trecho reto da água quente a partir do menor trecho da tabela de liras do fabricante */
      var Tdil = null; try { Tdil = NN() && NN().tabela ? NN().tabela("aq.dilatacao_cpvc_tigre") : null; } catch (eD) { Tdil = null; }
      var Lmin = arr(Tdil && Tdil.colunas).map(function (cn) { var m = /trecho_(\d+)m/.exec(cn); return m ? Number(m[1]) : null; }).filter(function (v) { return v > 0; }).sort(function (a, b) { return a - b; })[0];
      if (Lmin) { var longos = ops.filter(function (o) { return o.op === "trecho" && o.sistema === "agua_quente" && d3(o.p1, o.p2) >= Lmin - EPS; });
        if (longos.length) out.avisos.push({ texto: "Água quente do aquecedor " + fA.id + ": " + longos.length + " trecho(s) reto(s) de " + f2(Lmin) + " m ou mais (" + longos.map(function (o) { return f2(d3(o.p1, o.p2)) + " m"; }).join(", ") + ") — preveja a compensação da dilatação térmica (lira ou junta; tabela de liras do fabricante, aq.dilatacao_cpvc_tigre).", elementos: longos.map(function (o) { return String(o.id); }) }); }
      /* ISOLAMENTO TÉRMICO (NBR 5626:2020 6.12.3, aq2020.isolamento) */
      var qI = ctx ? ctx.consulta("aq2020.isolamento", { parametro: "toda_extensao" }, "texto", "água quente: isolamento") : null;
      out.avisos.push({ texto: "Água quente do aquecedor " + fA.id + ": " + (qI && qI.ok ? qI.valor + " (NBR 5626:2020 " + qI.linha.item + ")" : "isolamento térmico da distribuição (NBR 5626:2020)") + " — a linha do entreforro corre fora do ambiente aquecido: o isolamento térmico (tubo de espuma de polietileno, insumo SINAPI) entra no levantamento por bitola.", elementos: [String(fA.id)] });
    });
    conferirAparelhos();
    conferirHidraulica();
    return out;

    /* ================= H6: a conferência do APARELHO (gás: NBR 13103; elétrico: ponto de força, válvula, respiro) */
    function conferirAparelhos() {
      var GS = HG(), lote = out.ops;
      if (GS) {
        var Rg = null; try { Rg = GS.conferir({ estado: estado, avaliarFam: avaliarFam, trechos: lote, acessorios: lote, parametros: par.gas || {} }); } catch (eG) { Rg = null; out.pendencias.push({ chave: "ta.gas13103", texto: "Aparelho a gás: a conferência da NBR 13103 falhou (" + (eG && eG.message ? eG.message : eG) + "); confira à mão", elementos: [] }); }
        if (Rg) {
          out.gas = Rg;
          Rg.achados.forEach(function (a) {
            var item = { chave: a.chave, texto: (a.gravidade === "erro" ? "PROIBIDO — " : "") + a.texto, elementos: a.elementos, gravidade: a.gravidade, regra: a.regra, norma: "NBR 13103:2020 " + a.item + " (texto conferido; a vigente é a 2024 = 2020 + Emenda 1, não lida — conferir)" };
            if (a.corrigir) item.acao = { tipo: "ops", ops: a.corrigir.ops, texto: a.corrigir.texto };
            (a.gravidade === "aviso" ? out.avisos : out.pendencias).push(item);
          });
          Rg.decisoes.forEach(function (d) { out.decisoes.push({ id: d.id, texto: d.texto }); });
        }
      }
      Aq.forEach(function (A) {
        if (!A.eletrico) return;
        var v = A.valores || {}, fA = A.f, pf = GS && GS._int ? GS._int.pontoForca : null;
        var tem = arr(estado.familias).some(function (f) { var F = HF() && HF().porId ? HF().porId(f.famId) : null; return F && F.categoria === "dispositivo_eletrico" && (String((f.inst || {}).Equipamento) === String(fA.id)); });
        if (!tem) {
          var ficha = [num(v.Potencia_W, 0) > 0 ? v.Potencia_W + " W" : "potência da ficha não informada", v.Tensao_V ? (/V/.test(String(v.Tensao_V)) ? String(v.Tensao_V) : v.Tensao_V + " V") : null, num(v.Disjuntor_A, 0) > 0 ? "disjuntor " + v.Disjuntor_A + " A" : null, num(v.Bitola_mm2, 0) > 0 ? "fio ≥ " + v.Bitola_mm2 + " mm²" : null].filter(Boolean).join(", ");
          var cx = 0; try { var av = avaliarFam(fA.famId, fA.tipoId, fA.inst || {}); cx = av && av.caixa ? (av.caixa.x1 - av.caixa.x0) / 2 : 0; } catch (eC) { cx = 0; }
          var rot = num(fA.rotY, 0), lado = { x: Math.cos(rot), z: -Math.sin(rot) }, gap = afast + G.passo, yC = num(fA.y, 0) + num(v.Altura, 0) / 2;
          var pT = { x: r4(num(fA.x, 0) - lado.x * (cx + gap)), y: r4(yC), z: r4(num(fA.z, 0) - lado.z * (cx + gap)) };
          var ac = pf ? pf({ id: String(fA.id), rot: rot, tensao: txt(v.Tensao_V) }, pT) : null;
          if (ac && ac.ops && ac.ops[0]) ac.ops[0].inst.Potencia_W = num(v.Potencia_W, 0);
          var it = { chave: "ta.eletrico_ponto", texto: A.nome + " " + fA.id + ": circuito e ponto de força EXCLUSIVOS (" + ficha + " — ficha do fabricante) — o modelo não tem; o circuito é do projeto elétrico", elementos: [String(fA.id)], gravidade: "pendencia" };
          if (ac) it.acao = { tipo: "ops", ops: ac.ops, texto: ac.texto };
          out.pendencias.push(it);
        }
        if (A.acumulacao) {
          if (v.Valvula_seguranca === false) out.pendencias.push({ chave: "ta.boiler_valvula", texto: A.nome + " " + fA.id + ": a válvula de segurança de pressão foi desligada — o manual do fabricante a exige na entrada de água fria, entre o registro e o aquecedor", elementos: [String(fA.id)], gravidade: "pendencia", acao: { tipo: "ops", ops: [{ op: "instancia", id: fA.id, inst: { Valvula_seguranca: true } }], texto: "religar a válvula de segurança da família" } });
          else out.decisoes.push({ id: "aq.boiler_valvula", texto: A.nome + " " + fA.id + ": válvula de segurança de pressão na entrada de água fria (da família; manual do fabricante), entre o registro de gaveta e o aquecedor." });
          out.pendencias.push({ chave: "ta.boiler_respiro", texto: A.nome + " " + fA.id + ": RESPIRO em instalação de baixa pressão (alimentação pela caixa d'água) — no ponto mais alto da água quente, subindo acima do nível máximo da caixa d'água conforme o manual do fabricante (Cumulus, p.3/9/10) — não está modelado; lance o tubo do respiro", elementos: [String(fA.id)], gravidade: "pendencia" });
        }
      });
    }

    /* ================= H6 (R-AQ6): VAZÃO, PRESSÃO e VELOCIDADE da água quente pelo método da NBR 5626 (js/hidaq.js → js/hidaf.js) */
    function conferirHidraulica() {
      var AQm = HAQ(), BEm = BEd(), Hh = HHi();
      if (!AQm || !BEm || !Hh || !arr(e.ops).length || !out.ops.length) {
        if (out.ops.length) out.decisoes.push({ id: "aq.hidraulica", texto: "Vazão, pressão e velocidade da água quente: conferidas pelo Dimensionar (o Traçar não recebeu o modelo completo)." });
        return;
      }
      var est2 = null; try { est2 = BEm.aplicar(arr(e.ops).concat([{ op: "lote", id: "ta-aq-conferir", ops: out.ops }])); } catch (eE) { est2 = null; }
      if (!est2) return;
      var N = NN(), pEst = N ? N.consulta("af.pressao.estatica_maxima", null, "valor") : { ok: false }, pDin = par.aqPressaoSaida_kpa != null ? num(par.aqPressaoSaida_kpa, null) : null;
      Object.keys(porAq).forEach(function (hid) {
        var A = porAq[hid].A, fA = A.f, idsAq = out.ops.filter(function (o) { return o.op === "trecho" && o.sistema === "agua_quente" && String(o.aq) === String(fA.id); }).map(function (o) { return String(o.id); });
        if (!idsAq.length) return;
        var Rr = BI().rede(est2, avaliarFam), saida = arr(BI().conectoresDoEstado(est2, avaliarFam)).filter(function (k) { return String(k.famInst) === String(fA.id) && k.sistema === "agua_quente"; })[0];
        if (!saida) return;
        /* os trechos do lote (o registro divide: o "b" é a outra metade) — travados no DN DESENHADO para a conferência */
        var trav = []; arr(est2.instalacoes && est2.instalacoes.trechos).forEach(function (t) { if (idsAq.indexOf(String(t.id)) >= 0 || idsAq.indexOf(String(t.id).replace(/b$/, "")) >= 0) trav.push(String(t.id)); });
        function rodar(carga_kpa, travar) {
          var ctx2 = N.contexto(), Hc = saida.y + Hh.kpaParaM(carga_kpa, Hh.agua(Hh.T_PADRAO_C).rho);
          var en = { modelo: { estado: est2, avaliarFam: avaliarFam }, aguaQuente: { alimentacao: { conector: String(saida.id), tipo: "pressao", carga_m: Hc } }, opcoes: { travados: travar ? trav : [] } };
          try { return AQm.calcular(en, ctx2, Rr, {}); } catch (eA) { return null; }
        }
        var carga = pDin != null ? pDin : (pEst.ok ? num(pEst.valor, null) : null);
        if (carga == null) return;
        var R1 = rodar(carga, true); if (!R1 || !R1.rede) return;
        var meus = {}; idsAq.forEach(function (id) { meus[id] = 1; });
        var vRep = arr(R1.verificacoes).filter(function (v) { return /velocidade/i.test(v.nome) && v.status === "reprovado"; });
        var pRep = arr(R1.verificacoes).filter(function (v) { return /press/i.test(v.nome) && /m[ií]nima/i.test(v.nome) && v.status === "reprovado"; });
        /* a proposta: o mesmo cálculo sem travar (o laço de DN da NBR 5626) — só os AUMENTOS nos trechos deste aquecedor */
        var R2 = rodar(carga, false), mud = [];
        /* a proposta trecho a trecho (R2.trechos: dn proposto × dnModelo) — as ops do js/hidaf.js não trazem todo trecho da cadeia (o
           boiler da casa: 7 trechos acima de 3 m/s, ops só no 1º); as ops ficam de reserva */
        function propor(id0, dn0, dnN) { var base0 = String(id0).replace(/b$/, ""); if (!meus[base0] || !(dnN > dn0)) return; var m0 = mud.filter(function (m) { return m.id === base0; })[0]; if (!m0) mud.push({ id: base0, de: dn0, para: dnN }); else m0.para = Math.max(m0.para, dnN); }
        arr(R2 && R2.trechos).forEach(function (t) { if (t && t.tipo === "tubo") propor(t.aresta != null ? t.aresta : t.id, num(t.dnModelo, 0), num(t.dn, 0)); });
        arr(R2 && R2.ops).forEach(function (o) { var t = arr(est2.instalacoes.trechos).filter(function (x) { return String(x.id) === String(o.id); })[0]; if (t && o.dn) propor(o.id, t.dn, o.dn); });
        var resumo = { aquecedor: String(fA.id), carga_kpa: carga, origemCarga: pDin != null ? "informada (parametros.aqPressaoSaida_kpa)" : "teto: pressão estática máxima da NBR 5626 (" + (pEst.ok ? pEst.fonte.doc : "") + ") — sem a pressão real da água fria na entrada do aquecedor", velocidade: vRep.length, pressao: pRep.length, mudancas: mud, conferidas: arr(R1.verificacoes).map(function (v) { return v.nome + " [" + v.status + "]"; }).filter(function (x, i, l) { return l.indexOf(x) === i; }), pontos: arr(R1.pontos).length };
        out.hidraulica.push(resumo);
        var acao = mud.length ? { tipo: "dn", mudancas: mud, texto: "aumentar o DN: " + mud.slice(0, 4).map(function (m) { return m.id + " " + m.de + " → " + m.para; }).join("; ") + (mud.length > 4 ? " e mais " + (mud.length - 4) + " trecho(s)" : "") } : null;   // hid:ok até 4 itens no texto
        if (vRep.length) out.pendencias.push({ chave: "ta.aq_velocidade", texto: "Água quente do aquecedor " + fA.id + ": velocidade acima do limite da NBR 5626 em " + vRep.length + " trecho(s) (" + vRep.slice(0, 4).map(function (v) { return v.alvo + " " + f2(v.valor) + " > " + f2(v.limite) + " m/s"; }).join("; ") + ")" + (acao ? " — Corrigir aumenta o DN" : " — sem DN comercial que resolva: divida o ramal"), elementos: vRep.map(function (v) { return String(v.alvo); }), gravidade: "erro", acao: acao });   // hid:ok até 4 itens no texto
        if (pRep.length) out.pendencias.push({ chave: "ta.aq_pressao", texto: "Água quente do aquecedor " + fA.id + ": " + pRep.length + " nó(s) da rede sem a pressão mínima da NBR 5626 com " + f2(carga) + " kPa na saída do aquecedor (" + pRep.slice(0, 4).map(function (v) { return v.alvo + " " + f2(v.valor) + " < " + f2(v.limite) + " kPa"; }).join("; ") + ")" + (acao ? " — Corrigir aumenta o DN no caminho do ponto crítico" : " — aumentar DN não resolve: eleve o reservatório ou pressurize"), elementos: pRep.map(function (v) { return String(v.alvo); }), gravidade: "erro", acao: acao });   // hid:ok até 4 itens no texto
        if (!vRep.length && !pRep.length) out.decisoes.push({ id: "aq.hidraulica", texto: "Água quente do aquecedor " + fA.id + ": velocidade e pressão conferidas pela NBR 5626 (método dos pesos, js/hidaq.js) com o DN traçado — " + (pDin != null ? f2(carga) + " kPa informados na saída do aquecedor" : "velocidade conferida; a pressão foi conferida contra o TETO de " + f2(carga) + " kPa (pressão estática máxima), não contra a pressão real") + "." });
        if (pDin == null) out.pendencias.push({ chave: "ta.aq_pressao_entrada", texto: "Água quente do aquecedor " + fA.id + ": a pressão REAL na saída do aquecedor depende da água fria na entrada dele menos a perda do aparelho (catálogo) — rode o Dimensionar (pressão do reservatório) para conferir a pressão mínima dos pontos", elementos: [String(fA.id)], gravidade: "pendencia" });
      });
    }
  }

  /* as ops de um traçado de água quente ANTERIOR (o mesmo aquecedor): o Traçar de novo as substitui (idempotente) */
  function anteriores(opsAchatadas) {
    var vivos = {}, ordem = [];
    arr(opsAchatadas).forEach(function (o) {
      if (!o || o.id == null) return;
      if (o.op === "apagar") { delete vivos[String(o.id)]; return; }
      if (o.aq != null && /^ta-aq-/.test(String(o.id))) { if (!vivos[String(o.id)]) ordem.push(String(o.id)); vivos[String(o.id)] = o; }
    });
    var ids = [];
    ordem.forEach(function (id) { var o = vivos[id]; if (!o) return; ids.push(id); if (o.op === "acessorio" && o.novoId) ids.push(String(o.novoId)); });
    return ids;
  }

  var HidAQTraco = { VERSAO: 2, tracar: tracar, aquecedores: aquecedores, anteriores: anteriores };
  global.HidAQTraco = HidAQTraco;
  if (typeof module !== "undefined" && module.exports) module.exports = HidAQTraco;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
