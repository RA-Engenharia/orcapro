/* =====================================================================
 * hidaqtraco.js — ÁGUA QUENTE no "Traçar automaticamente" (FRENTE H5,
 * 21/10/2026) — motor PURO (não grava nada: devolve as ops do lote).
 *
 * DEFEITO QUE FECHA (revisor da H4, ALTO): com aquecedor no modelo, o TA
 * traçava esgoto, ventilação e água fria e deixava SEM TUBO os pontos de
 * água quente (lavatório, cubas da bancada, misturador). A H4 só passou a
 * DECLARAR a pendência; aqui o traçado sai.
 *
 * O TRAÇADO (critério de projeto da RA — docs/hidro/PADROES-PROJETO-RA.md
 * R-AQ1…R-AQ6; nenhuma norma diz o caminho, a NBR 5626:2020 diz o resto):
 *  1. ALIMENTAÇÃO DO AQUECEDOR (R-AQ1): a água fria chega pela espera do
 *     barrilete/coluna no teto (a mesma ponta "continua" das esperas de
 *     água fria dos ambientes), desce EMBUTIDA na parede atrás do aquecedor,
 *     ganha o REGISTRO DE GAVETA logo abaixo do corpo do aparelho (à vista e
 *     à mão — nunca atrás dele) e sai da parede até a entrada de água fria.
 *  2. SAÍDA (R-AQ2): da saída de água quente o tubo desce, entra na parede e
 *     sobe embutido até a cota da DISTRIBUIÇÃO, sob a laje (no entreforro),
 *     ABAIXO do barrilete de água fria com o afastamento água fria × água
 *     quente (HidRota.GEO.afastamento — o mesmo "livre" da água × esgoto) e
 *     afastada da face da parede (o mesmo afastamento + o raio).
 *  3. DISTRIBUIÇÃO (R-AQ3): árvore ortogonal no entreforro, do aquecedor a
 *     cada ponto (cada ponto liga no tubo mais perto já traçado), cruzando
 *     parede só na perpendicular, fora de vão de porta/janela, pilar e viga.
 *  4. DESCIDA (R-AQ4): de cada ponto, embutida na parede no eixo do ponto (a
 *     mesma regra da água fria: HidRota.GEO.embutir), com o REGISTRO DE
 *     GAVETA logo acima do ramal de água fria (a altura do RG da tabela de
 *     alturas + meio registro + a folga), volante para DENTRO do cômodo do
 *     ponto (o mesmo critério do registro da água fria, PADROES R-C9). Onde a
 *     descida cruza o ramal de água fria, ela passa numa camada da parede com
 *     a folga entre geratrizes (HidRota.GEO.folga); se o eixo do ponto não
 *     dá a folga, troca de camada (mais rasa, depois mais funda, dentro da
 *     parede com o cobrimento) — nunca tubo dentro de tubo.
 *  5. SENTIDO DO FLUXO (R-AQ5): p1 = montante (aquecedor → ponto), como na
 *     água fria (FRENTE B, D-04).
 *  6. MATERIAL E DN (R-AQ6): o material padrão da água quente do biminst
 *     (SISTEMAS.agua_quente.material — PPR, NBR 15813); sub-ramal pelo DN
 *     mínimo da tabela de água quente (aq.dn_tubulacao, NBR 5626 parte água
 *     quente) convertido pela correspondência polegada → DE do biminst; os
 *     trechos a montante = o maior DN a jusante (a MESMA premissa da água
 *     fria do HidRota: o dimensionamento — js/hidaq.js, método dos pesos e
 *     pressão mínima do aquecedor de passagem — acerta depois).
 * Prédio: cada ponto vai ao aquecedor do MESMO pavimento (aquecedor por
 * unidade → ramal por unidade). Sem aquecedor no pavimento (aquecimento
 * central em outro andar) = pendência: a coluna de água quente é traçada à
 * mão (o TA não inventa a prumada).
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
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { if (v === null || v === undefined || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
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

  /* distância 3D entre dois segmentos (o mesmo cálculo do HidRota._int.segSeg3) */
  var COS_PARALELO = Math.SQRT1_2;   /* mais perto de paralelo que 45° = "correm juntos" */
  function paralelos(a, b, c, d) { var u = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }, v = { x: d.x - c.x, y: d.y - c.y, z: d.z - c.z }, Lu = Math.sqrt(u.x * u.x + u.y * u.y + u.z * u.z), Lv = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z); if (!(Lu > EPS) || !(Lv > EPS)) return true; return Math.abs(u.x * v.x + u.y * v.y + u.z * v.z) / (Lu * Lv) >= COS_PARALELO; }
  function segSeg(p1, q1, p2, q2) { var H = HR(); return H && H._int && H._int.segSeg3 ? H._int.segSeg3(p1, q1, p2, q2) : Infinity; }

  /* o aquecedor: equipamento com entrada de água fria e saída de água quente (o critério da H4, mais os dois pontos) */
  function aquecedores(estado, avaliarFam) {
    var K = HK(), out = [];
    arr(estado && estado.familias).forEach(function (f) {
      var F = HF() && HF().porId ? HF().porId(f.famId) : null;
      if (!F || F.categoria !== "equipamento" || arr(F.sistemas).indexOf("agua_quente") < 0) return;
      var cs = K._int.conectores(avaliarFam, f), af = cs.filter(function (c) { return c.sistema === "agua_fria"; })[0], aq = cs.filter(function (c) { return c.sistema === "agua_quente"; })[0];
      if (af && aq) out.push({ f: f, af: af, aq: aq, nome: F.nome });
    });
    return out;
  }

  function tracar(e) {
    e = e || {};
    var estado = e.estado || {}, avaliarFam = e.avaliarFam, par = e.parametros || {}, K = HK(), B = BI(), H = HR();
    var out = { ops: [], pendencias: [], avisos: [], decisoes: [], pontos: 0, ligados: 0, aquecedores: 0 };
    function pend(motivo, els) { out.pendencias.push({ chave: "ta.agua_quente", texto: "Água quente: " + motivo, motivo: motivo, elementos: arr(els).map(String) }); }
    if (!K || !B || !H) { pend("motores do traçado não carregados (HidKit, BimInst, HidRota)", []); return out; }
    var Aq = aquecedores(estado, avaliarFam); out.aquecedores = Aq.length;
    if (!Aq.length) return out;
    /* REVISÃO H5 (21/10/2026): o LOCAL do aquecedor A GÁS. A NBR 13103 (aparelhos a gás: local, ventilação permanente, chaminé/duto
       de exaustão) NÃO está transcrita na biblioteca (dados-fonte/hidro/normas/aguaquente.json, pendente aq.solar_NBR15569_e_gas_NBR13103):
       o motor não inventa a regra, mas não se cala — aquecedor a gás no MESMO cômodo de bacia/chuveiro/banheira/bidê (o banheiro: o
       aparelho se vê dele sem atravessar parede) = pendência; e todo aquecedor a gás leva o aviso da ventilação e do duto */
    var parsA = K._int.paredes(estado), GAS = /gas/;
    Aq.forEach(function (A) {
      if (!GAS.test(String(A.f.famId))) return;
      var rot = num(A.f.rotY, 0), yA = num(A.f.y, 0), pA = { x: num(A.f.x, 0) + Math.sin(rot) * B.TOL, y: 0, z: num(A.f.z, 0) + Math.cos(rot) * B.TOL };   /* um nada para FORA da parede em que ele encosta (o Z local sai dela) */
      var noBanho = arr(estado.familias).filter(function (f) {
        if (!/^hid-(bacia|chuveiro|banheira|bide)/.test(String(f.famId))) return false;
        var q = { x: num(f.x, 0), y: 0, z: num(f.z, 0) };
        if (Math.abs(num(f.y, 0) - yA) > 3) return false;   // hid:ok outro pavimento (mais de um pé-direito de diferença)
        return !parsA.some(function (w) { if (yA < w.base - EPS || yA > w.topo + EPS) return false; return segSeg(pA, q, { x: w.p1.x, y: 0, z: w.p1.z }, { x: w.p2.x, y: 0, z: w.p2.z }) < w.esp / 2 - EPS; });
      });
      if (noBanho.length) out.pendencias.push({ chave: "ta.aquecedor_local", texto: "Aquecedor a gás " + A.f.id + " no mesmo cômodo de " + noBanho.map(function (f) { return f.id; }).join(", ") + " (banheiro): a NBR 13103 restringe aparelho a gás no banheiro (texto da norma fora da biblioteca — confira com ela e com o Corpo de Bombeiros); mude o aquecedor para área ventilada (área de serviço, varanda técnica) com chaminé/duto de exaustão", motivo: "aquecedor a gás no banheiro", elementos: [String(A.f.id)].concat(noBanho.map(function (f) { return String(f.id); })) });
      out.avisos.push({ texto: "Aquecedor a gás " + A.f.id + ": ventilação permanente do ambiente e chaminé/duto de exaustão dos gases conforme a NBR 13103 e o manual do fabricante (a rede de gás e a chaminé não são traçadas pelo Traçar automaticamente).", elementos: [String(A.f.id)] });
    });
    var G = H.GEO, folga = num(par.folga, G.folga), afast = num(par.afastamento, G.afastamento), embutir = num(par.embutir, G.embutir), cobr = num(par.cobrimento, G.cobrimento), mNo = num(par.margemNo, G.margemNo);
    var Lr = B.ACESSORIO_PADRAO, sisAQ = B.SISTEMAS.agua_quente, matAQ = sisAQ.materiais.indexOf((par.material || {}).agua_quente) >= 0 ? par.material.agua_quente : sisAQ.material;
    var dnsAQ = arr((B.MATERIAIS[matAQ] || {}).dns), matAF = B.SISTEMAS.agua_fria.material, dnAFpad = (B.MATERIAIS[matAF] || {}).dn;
    function comercial(dn) { var ok = dnsAQ.filter(function (d) { return d >= dn - EPS; }); return ok.length ? ok[0] : (dnsAQ.length ? dnsAQ[dnsAQ.length - 1] : dn); }
    var aRG = K.altura ? K.altura("RG") : { ok: false }, ctx = NN() ? NN().contexto() : null;
    var escopo = {}; arr(e.escopo).forEach(function (id) { escopo[String(id)] = 1; });
    var temEscopo = arr(e.escopo).length > 0;
    var heaterIds = {}; Aq.forEach(function (A) { heaterIds[String(A.f.id)] = 1; });
    /* os pontos de água quente LIVRES (sem tubo) — a mesma conta da pendência da H4 (BimInst.rede.conectoresLivres) */
    var R0 = B.rede(estado, avaliarFam), famPorId = {}; arr(estado.familias).forEach(function (f) { famPorId[String(f.id)] = f; });
    var livres = arr(R0.conectoresLivres).filter(function (k) { return k.sistema === "agua_quente" && !heaterIds[String(k.famInst)] && (!temEscopo || escopo[String(k.famInst)]); });
    out.pontos = livres.length;
    if (!livres.length) return out;
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
        if (B.tuboEmVolume(v, a, b, r, pts, 0.002)) return { com: v.id, familia: true };   // hid:ok 2 mm de casca (a mesma do HidRota)   // hid:ok 2 mm de casca (a mesma do HidRota)
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

    /* ---------- cada ponto: o aquecedor do pavimento, a parede, a descida */
    function pisoDe(f, c) { var P = K._int.pisoDe(estado, avaliarFam, f, c); return P && P.ok ? P.y : null; }
    var grupos = {};
    livres.forEach(function (k) {
      var f = famPorId[String(k.famInst)]; if (!f) return;
      var cs = K._int.conectores(avaliarFam, f), c = cs.filter(function (q) { return q.sistema === "agua_quente" && q.cid === String(k.id); })[0] || cs.filter(function (q) { return q.sistema === "agua_quente" && d3(q, k) <= B.TOL; })[0];
      if (!c) { pend("ponto " + k.famInst + ":" + k.id + " sem o conector na família — trace à mão", [k.famInst]); return; }
      var piso = pisoDe(f, c);
      if (piso == null) { pend("não achei o piso do aparelho " + k.famInst + " — trace à mão", [k.famInst]); return; }
      /* o aquecedor do MESMO pavimento (o piso do aquecedor = o piso do ambiente dele), o mais perto */
      var cand = Aq.filter(function (A) { var pa = pisoDe(A.f, A.af); return pa != null && Math.abs(pa - piso) <= mNo; }).sort(function (A1, A2) { return d2(A1.aq, c) - d2(A2.aq, c); });
      if (!cand.length) { pend("o ponto " + k.famInst + ":" + k.id + " não tem aquecedor no mesmo pavimento (aquecimento central?) — a coluna de água quente é traçada à mão", [k.famInst]); return; }
      var A = cand[0], gk = String(A.f.id);
      var tipoP = K.tipoDaFamilia ? K.tipoDaFamilia(f.famId, f.tipoId) : null; if (K.aparelhoNorma) tipoP = K.aparelhoNorma(tipoP);
      (grupos[gk] = grupos[gk] || { A: A, piso: piso, pontos: [] }).pontos.push({ k: k, f: f, c: c, cs: cs, piso: piso, chuveiro: tipoP === "chuveiro" });
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

    Object.keys(grupos).forEach(function (hid) {
      var Gr = grupos[hid], A = Gr.A, fA = A.f, ops = [], pendG = [];
      /* a normal da parede atrás do aquecedor (o Z local sai da parede) e a face dela */
      var rot = num(fA.rotY, 0), nA = { x: -Math.sin(rot), z: -Math.cos(rot) };
      var wA = K._int.paredeDe(estado, { x: num(fA.x, 0) + nA.x * B.TOL, z: num(fA.z, 0) + nA.z * B.TOL }, num(fA.y, 0));
      if (!wA) { pend("o aquecedor " + fA.id + " não está encostado em parede: a alimentação e a saída dele são traçadas à mão", [fA.id]); return; }
      var tetoA = K._int.tetoDe(estado, fA, Gr.piso).y;
      var dnAq = 0; Gr.pontos.forEach(function (p) { p.dn = dnSub(p.f); dnAq = Math.max(dnAq, p.dn); });
      var rAQ = raio(dnAq), rBar = raio(dnAFpad);
      /* R-AQ2: a cota da distribuição — abaixo do barrilete de água fria (o topo das esperas: teto − folga) com o afastamento */
      var tetoMin = tetoA; Gr.pontos.forEach(function (p) { tetoMin = Math.min(tetoMin, K._int.tetoDe(estado, p.c, p.piso).y); });
      var yD = r4(tetoMin - folga - rBar - afast - rAQ), dL = afast + rAQ;
      /* o eixo embutido atrás do conector: a face passa pela origem do aquecedor (o fundo da família encosta nela) */
      function eixoA(c, prof) { var fr0 = -((c.x - num(fA.x, 0)) * nA.x + (c.z - num(fA.z, 0)) * nA.z); return { x: r4(c.x + nA.x * (fr0 + prof)), z: r4(c.z + nA.z * (fr0 + prof)) }; }
      /* as ligações do aquecedor saem por baixo dele: o tubo desce a distância mínima entre nós (fica fora do corpo e acima do
         que estiver embaixo — a bancada, o tanque) e entra na parede */
      var yBaixo = Math.min(A.af.y, A.aq.y), yLig = r4(yBaixo - mNo);
      var dnAF = dnAFpad, rAF = raio(dnAF);
      /* R-AQ1: alimentação de água fria do aquecedor — a espera do barrilete no teto AO LADO do aquecedor (do lado da entrada de
         água fria: meia largura do corpo + o afastamento + o raio), desce embutida com o REGISTRO DE GAVETA na altura do RG da tabela
         (à vista e à mão, fora do corpo), corre embutida logo abaixo dele até o eixo da entrada e sai da parede até ela */
      var FAIXA_LIG = 0.3;   // hid:ok faixa da busca da cota das ligações sob o aquecedor (m)
      var tgA = { x: -nA.z, z: nA.x }, ladoAF = ((A.af.x - A.aq.x) * tgA.x + (A.af.z - A.aq.z) * tgA.z) >= 0 ? 1 : -1;
      var vA = vols.filter(function (v) { return String(v.id) === String(fA.id); })[0], meiaL = vA ? vA.hl : 0;
      var eAF = eixoA(A.af, embutir), cA = eixoA({ x: num(fA.x, 0), z: num(fA.z, 0) }, embutir), yEsp = r4(tetoA - folga);
      /* a descida ao lado não pode cair dentro de OUTRA parede (o aquecedor no canto) nem esbarrar no que já está na parede (a
         descida da água fria da cuba): os dois lados, afastando um passo da grade do traçado por vez */
      function noutraParede(p) { return paredes.some(function (w) { if (w.id === wA.id || w.topo <= yBaixo - FAIXA_LIG || w.base >= yEsp) return false; var ux = w.p2.x - w.p1.x, uz = w.p2.z - w.p1.z, L = Math.sqrt(ux * ux + uz * uz); if (!(L > EPS)) return false; var t = ((p.x - w.p1.x) * ux + (p.z - w.p1.z) * uz) / (L * L); t = Math.max(0, Math.min(1, t)); return d2(p, { x: w.p1.x + ux * t, z: w.p1.z + uz * t }) < w.esp / 2 + rAF + folga; }); }
      var eLat = null, eAQ = eixoA(A.aq, embutir), raiz = { x: r4(eAQ.x - nA.x * (embutir + dL)), z: r4(eAQ.z - nA.z * (embutir + dL)) };
      var t1 = { op: "trecho", id: novoId(hid, "af"), sistema: "agua_fria", material: matAF, dn: dnAF, p1: P3(0, yEsp, 0), p2: P3(0, yLig, 0), continua: "p1", aq: String(fA.id), aqParte: "alimentacao" };
      var t2 = { op: "trecho", id: novoId(hid, "af"), sistema: "agua_fria", material: matAF, dn: dnAF, p1: P3(0, yLig, 0), p2: P3(eAF.x, yLig, eAF.z), aq: String(fA.id), aqParte: "alimentacao" };
      var t3 = { op: "trecho", id: novoId(hid, "af"), sistema: "agua_fria", material: matAF, dn: dnAF, p1: P3(eAF.x, yLig, eAF.z), p2: P3(A.af.x, yLig, A.af.z), aq: String(fA.id), aqParte: "alimentacao" };
      var t4 = { op: "trecho", id: novoId(hid, "af"), sistema: "agua_fria", material: matAF, dn: dnAF, p1: P3(A.af.x, yLig, A.af.z), p2: P3(A.af.x, A.af.y, A.af.z), aq: String(fA.id), aqParte: "alimentacao" };
      /* R-AQ2: saída (desce, entra na parede, sobe embutida até a distribuição, sai para o entreforro) */
      var s1 = { op: "trecho", id: novoId(hid, "s"), sistema: "agua_quente", material: matAQ, dn: dnAq, p1: P3(A.aq.x, A.aq.y, A.aq.z), p2: P3(A.aq.x, yLig, A.aq.z), aq: String(fA.id), aqParte: "saida" };
      var s2 = { op: "trecho", id: novoId(hid, "s"), sistema: "agua_quente", material: matAQ, dn: dnAq, p1: P3(A.aq.x, yLig, A.aq.z), p2: P3(eAQ.x, yLig, eAQ.z), aq: String(fA.id), aqParte: "saida" };
      var s3 = { op: "trecho", id: novoId(hid, "s"), sistema: "agua_quente", material: matAQ, dn: dnAq, p1: P3(eAQ.x, yLig, eAQ.z), p2: P3(eAQ.x, yD, eAQ.z), aq: String(fA.id), aqParte: "saida" };
      var s4 = { op: "trecho", id: novoId(hid, "s"), sistema: "agua_quente", material: matAQ, dn: dnAq, p1: P3(eAQ.x, yD, eAQ.z), p2: P3(raiz.x, yD, raiz.z), aq: String(fA.id), aqParte: "saida", isolamento: true };   /* no entreforro: isolado (NBR 5626:2020 6.12.3) */
      var base = [t1, t2, t3, t4, s1, s2, s3, s4], cfA = null;
      /* a cota das ligações sob o aquecedor: a mais alta, abaixo do corpo, que não esbarra em nada (a bancada logo embaixo) — passo
         de meio centímetro (a grade do traçado é de 5 cm; aqui o vão entre o aquecedor e o que está embaixo é de poucos cm) */
      var PASSO_LIG = 0.005, y0A = vA ? Math.min(vA.y0, yBaixo) : yBaixo, rMaxA = Math.max(rAF, raio(dnAq)), NLAT = 12;   // hid:ok passo e faixa da busca da cota (m); até 12 passos da grade para o lado
      /* as camadas da parede (a mesma regra das descidas, R-AQ4): o eixo da água fria, a mais rasa com o cobrimento, a mais funda */
      var rasaA = cobr + rMaxA, fundaA = wA.esp - cobr - rMaxA, camA = [embutir, rasaA, fundaA].filter(function (x, i, l) { return x >= rasaA - EPS && x <= fundaA + EPS && l.indexOf(x) === i; });
      for (var kL = 0; kL < camA.length * (NLAT * 2 + 2) && !eLat; kL++) {
        var kk = kL % (NLAT * 2 + 2), prof = camA[Math.floor(kL / (NLAT * 2 + 2))], lado = kk % 2 === 0 ? ladoAF : -ladoAF, off = meiaL + afast + rAF + Math.floor(kk / 2) * G.passo;
        var cP = eixoA({ x: num(fA.x, 0), z: num(fA.z, 0) }, prof), cand = { x: r4(cP.x + tgA.x * lado * off), z: r4(cP.z + tgA.z * lado * off) };
        if (noutraParede(cand)) continue;
        var eAFp = eixoA(A.af, prof), eAQp = eixoA(A.aq, prof);
        t1.p1.x = t1.p2.x = t2.p1.x = cand.x; t1.p1.z = t1.p2.z = t2.p1.z = cand.z;
        t2.p2.x = t3.p1.x = eAFp.x; t2.p2.z = t3.p1.z = eAFp.z; s2.p2.x = s3.p1.x = s3.p2.x = s4.p1.x = eAQp.x; s2.p2.z = s3.p1.z = s3.p2.z = s4.p1.z = eAQp.z;
        for (var yT = r4(y0A - rMaxA - FOLGA_LIMITE * 3); yT >= y0A - FAIXA_LIG; yT = r4(yT - PASSO_LIG)) {   // hid:ok 3 mm abaixo do corpo
          t1.p2.y = t2.p1.y = t2.p2.y = t3.p1.y = t3.p2.y = t4.p1.y = s1.p2.y = s2.p1.y = s2.p2.y = s3.p1.y = yT;
          cfA = null;
          for (var i0 = 0; i0 < base.length && !cfA; i0++) cfA = conflito(base[i0].p1, base[i0].p2, raio(base[i0].dn), null);
          if (!cfA) { yLig = yT; eLat = cand; break; }
        }
      }
      if (!eLat) { pend("a alimentação de água fria / a saída de água quente do aquecedor " + fA.id + " não acha caminho livre na parede (esbarra em " + (cfA ? cfA.com : "outra parede") + ") — trace à mão", [fA.id].concat(cfA ? [cfA.com] : [])); return; }
      var yRg = aRG.ok ? r4(Gr.piso + aRG.valor) : r4((yEsp + yLig) / 2);
      if (yRg - Lr / 2 - mNo < yLig || yRg + Lr / 2 + mNo > yEsp) yRg = r4((yEsp + yLig) / 2);
      base.forEach(function (t) { novos.push({ a: t.p1, b: t.p2, r: raio(t.dn), sistema: t.sistema, id: t.id }); });
      base.forEach(function (t) { ops.push(t); });
      var BIr = BI(), tipoRgAF = BIr.varianteAuto ? BIr.varianteAuto("registro_gaveta", { sistema: "agua_fria", material: matAF, aplicacao: "ramal" }) : "acabamento";
      var frA = { x: -nA.x, y: 0, z: -nA.z }, gA = BIC() && BIC().giroPara ? BIC().giroPara({ x: 0, y: t1.p2.y - t1.p1.y, z: 0 }, frA) : 0;
      var rgA = { op: "acessorio", id: novoId(hid, "rg"), famId: "ra-registro-gaveta", tipoId: tipoRgAF, trecho: t1.id, novoId: t1.id + "b", x: eLat.x, y: yRg, z: eLat.z, comprimento: Lr, aq: String(fA.id), aqParte: "alimentacao" };
      if (gA) rgA.giro = gA;
      ops.push(rgA);
      out.decisoes.push({ id: "aq.aquecedor", texto: "Aquecedor " + fA.id + ": água fria pela espera do barrilete a " + f2(yEsp) + " m, descendo embutida ao lado dele, registro de gaveta a " + f2(yRg) + " m (fora do corpo, à mão) e saída de água quente subindo embutida até a distribuição a " + f2(yD) + " m (entreforro, abaixo do barrilete de água fria com o afastamento de " + f2(afast) + " m)." });

      /* ---------- R-AQ4: a descida de cada ponto (camada da parede com folga) e o nó dela no entreforro */
      var lig = [];
      Gr.pontos.forEach(function (p) {
        var c = p.c, n = c.parede ? { x: num(c.parede.x, 0), z: num(c.parede.z, 0) } : null, Ln = n ? Math.sqrt(n.x * n.x + n.z * n.z) : 0;
        if (!(Ln > EPS)) { pendG.push(["o ponto " + p.k.famInst + ":" + p.k.id + " não é de parede: a água quente é traçada à mão", [p.k.famInst]]); return; }
        n.x /= Ln; n.z /= Ln;
        var dF = Math.max(0, num(c.parede.d, 0)), w = K._int.paredeDe(estado, { x: c.x + n.x * dF, z: c.z + n.z * dF }, c.y), esp = w ? w.esp : 0, r = raio(p.dn);
        if (!w) { pendG.push(["o ponto " + p.k.famInst + ":" + p.k.id + " não encosta em parede: a descida embutida não tem onde correr — trace à mão", [p.k.famInst]]); return; }
        /* as ligações do MESMO aparelho (esgoto e água fria dele): a louça manda o afastamento, só a folga física conta */
        var proprios = p.cs.map(function (q) { return { x: q.x, y: q.y, z: q.z }; });
        /* o tubo do próprio aparelho: nasce no ponto dele ou corre no eixo embutido atrás do ponto (o toco + a descida do esgoto) */
        function mesmoAp(T) { return proprios.some(function (q) { return segSeg(q, q, T.a, T.b) <= embutir + dF + B.TOL; }); }
        var yRamal = aRG.ok ? p.piso + aRG.valor : null;
        var yRgP = yRamal != null ? r4(yRamal + 2 * raio(dnAFpad) + folga + Lr / 2) : null;   /* logo acima do ramal de água fria (eixo no RG + o raio; a geratriz de cima + a folga + meio registro) */
        if (yRgP == null || yRgP - Lr / 2 - mNo < c.y || yRgP + Lr / 2 + mNo > yD) yRgP = r4((c.y + yD) / 2);
        /* as camadas: o eixo da água fria (embutir), a mais rasa com o cobrimento, a mais funda que a parede deixa */
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
        lig.push({ p: p, L: achou.L, segs: achou.segs, r: r, yRg: yRgP, n: n, prof: achou.prof, parede: w.id });
      });

      /* ---------- R-AQ3: a árvore no entreforro (Prim ortogonal: cada ponto no tubo mais perto já traçado) */
      var arvore = [{ a: { x: raiz.x, z: raiz.z }, b: { x: raiz.x, z: raiz.z }, dn: 0 }];   /* o nó da raiz (comprimento 0) */
      var semLinha = [];
      lig.sort(function (l1, l2) { return d2(l1.L, raiz) - d2(l2.L, raiz); });
      /* as ligações num nó do entreforro: os tubos da linha que chegam nele, a descida do ponto que nasce nele e a subida da saída na raiz */
      function grauNo(q) {
        var g0 = d2(q, raiz) <= EPS * 10 ? 1 : 0;   // hid:ok tolerância do nó
        arvore.forEach(function (sg) { if (d2(sg.a, sg.b) < EPS) return; if (d2(sg.a, q) <= EPS * 10 || d2(sg.b, q) <= EPS * 10) g0++; });   // hid:ok tolerância do nó
        lig.forEach(function (l2) { if (d2(l2.L, q) <= EPS * 10) g0++; });   // hid:ok tolerância do nó
        return g0;
      }
      lig.forEach(function (l) {
        var melhor = null;
        arvore.forEach(function (sg, is) {
          /* o ponto do segmento mais perto (pé da perpendicular, ou as pontas) */
          var cand = [sg.a, sg.b], ux = sg.b.x - sg.a.x, uz = sg.b.z - sg.a.z, LL = ux * ux + uz * uz;
          if (LL > EPS) { var tt = ((l.L.x - sg.a.x) * ux + (l.L.z - sg.a.z) * uz) / LL, Ls = Math.sqrt(LL);
            /* o pé da perpendicular e, ao lado dele, alguns passos da grade ao longo do tubo (o pé pode cair num nó que já tem tê) */
            [0, 1, -1, 2, -2, 3, -3].forEach(function (nP) { var t2 = tt + nP * G.passo / Ls; if (t2 > EPS && t2 < 1 - EPS) cand.push({ x: r4(sg.a.x + ux * t2), z: r4(sg.a.z + uz * t2) }); });   // hid:ok passos da grade
          }
          cand.forEach(function (q) {
            /* REVISÃO H5 (21/10/2026): nada de CRUZETA (a de PPR não tem composição: o orçamento saía pendente na casa) — o nó que já
               tem 3 ligações (tê) não recebe a 4ª; o ramal liga um passo ao lado (outro tê) */
            if (grauNo(q) >= 3) return;   // hid:ok tê = 3 ligações (a 4ª seria cruzeta)
            var cams = Math.abs(q.x - l.L.x) < EPS || Math.abs(q.z - l.L.z) < EPS ? [[l.L, q]] : [[l.L, { x: q.x, z: l.L.z }, q], [l.L, { x: l.L.x, z: q.z }, q]];
            /* os desvios em "Z": chegar ao nó pelo lado (o reto passaria por cima de um tubo que já sai dele), alguns passos da grade */
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
        if (!melhor) { semLinha.push(l); pendG.push(["a linha de água quente do entreforro não chega ao ponto " + l.p.k.famInst + ":" + l.p.k.id + " (parede, vão, viga ou tubo no caminho) — trace à mão", [l.p.k.famInst]]); return; }
        /* divide o segmento onde a nova liga (tê) e acrescenta o caminho */
        var sg0 = arvore[melhor.seg], q0 = melhor.q;
        if (d2(q0, sg0.a) > EPS && d2(q0, sg0.b) > EPS) { arvore.splice(melhor.seg, 1, { a: sg0.a, b: { x: q0.x, z: q0.z } }, { a: { x: q0.x, z: q0.z }, b: sg0.b }); }
        for (var m = melhor.cam.length - 1; m >= 1; m--) {
          var a = melhor.cam[m], b = melhor.cam[m - 1]; if (d2(a, b) < EPS) continue;
          var sgN = { a: { x: a.x, z: a.z }, b: { x: b.x, z: b.z } }; arvore.push(sgN);
          novos.push({ a: P3(a.x, yD, a.z), b: P3(b.x, yD, b.z), r: l.r, sistema: "agua_quente", id: "linha" });
        }
        l.ok = true;
      });
      var okLig = lig.filter(function (l) { return l.ok; });
      /* o nó de cada ponto que caiu NO MEIO de um tubo da linha (pontos alinhados na mesma parede): o tubo se divide ali (tê) */
      okLig.forEach(function (l) {
        for (var is = 0; is < arvore.length; is++) {
          var sg = arvore[is], ux = sg.b.x - sg.a.x, uz = sg.b.z - sg.a.z, LL = ux * ux + uz * uz; if (!(LL > EPS)) continue;
          var tt = ((l.L.x - sg.a.x) * ux + (l.L.z - sg.a.z) * uz) / LL, q = { x: sg.a.x + ux * tt, z: sg.a.z + uz * tt };
          if (tt > EPS && tt < 1 - EPS && d2(q, l.L) <= EPS * 10) { arvore.splice(is, 1, { a: sg.a, b: { x: l.L.x, z: l.L.z } }, { a: { x: l.L.x, z: l.L.z }, b: sg.b }); break; }   // hid:ok tolerância do nó
        }
      });
      pendG.forEach(function (q) { pend(q[0], q[1]); });
      if (!okLig.length) { pend("nenhum ponto de água quente ligou ao aquecedor " + fA.id + " — trace à mão", [fA.id]); return; }

      /* ---------- a árvore orientada a partir da raiz: p1 = montante; DN = o maior a jusante; retas seguidas viram um trecho */
      var nos = [], arestas = [];
      function no(p) { for (var i = 0; i < nos.length; i++) if (d2(nos[i], p) <= EPS * 10) return i; nos.push({ x: p.x, z: p.z, e: [] }); return nos.length - 1; }   // hid:ok tolerância do nó (1e-5 m)
      arvore.forEach(function (sg) { if (d2(sg.a, sg.b) < EPS) { no(sg.a); return; } var ia = no(sg.a), ib = no(sg.b); arestas.push({ a: ia, b: ib }); nos[ia].e.push(arestas.length - 1); nos[ib].e.push(arestas.length - 1); });
      var iR = no(raiz), folhaDe = {};
      okLig.forEach(function (l) { folhaDe[no(l.L)] = l; });
      var pai = {}, ordem = [iR], vis = {}; vis[iR] = 1;
      for (var qi = 0; qi < ordem.length; qi++) nos[ordem[qi]].e.forEach(function (ei) { var E = arestas[ei], m = E.a === ordem[qi] ? E.b : E.a; if (vis[m]) return; vis[m] = 1; pai[m] = { de: ordem[qi], e: ei }; ordem.push(m); });
      var dnNo = {};
      for (var oi = ordem.length - 1; oi >= 0; oi--) { var ni = ordem[oi], dm = folhaDe[ni] ? folhaDe[ni].p.dn : 0; nos[ni].e.forEach(function (ei) { var E = arestas[ei], m = E.a === ni ? E.b : E.a; if (pai[m] && pai[m].de === ni) dm = Math.max(dm, dnNo[m] || 0); }); dnNo[ni] = dm; }
      /* cadeias: do nó de partida segue enquanto o nó do meio tem grau 2, é reto e não é folha */
      function filhos(ni) { return nos[ni].e.map(function (ei) { var E = arestas[ei]; return E.a === ni ? E.b : E.a; }).filter(function (m) { return pai[m] && pai[m].de === ni; }); }
      function reto(a, b, c) { var ux = b.x - a.x, uz = b.z - a.z, vx = c.x - b.x, vz = c.z - b.z; return Math.abs(ux * vz - uz * vx) < EPS * 10 && ux * vx + uz * vz > 0; }   // hid:ok tolerância de alinhamento
      var pilha = [iR];
      while (pilha.length) {
        var ini = pilha.pop();
        filhos(ini).forEach(function (m) {
          var cur = m, prev = ini;
          while (!folhaDe[cur] && filhos(cur).length === 1 && reto(nos[prev], nos[cur], nos[filhos(cur)[0]])) { prev = cur; cur = filhos(cur)[0]; }
          ops.push({ op: "trecho", id: novoId(hid, "l"), sistema: "agua_quente", material: matAQ, dn: comercial(Math.max(dnNo[m] || 0, dnNo[cur] || 0) || dnAq), p1: P3(nos[ini].x, yD, nos[ini].z), p2: P3(nos[cur].x, yD, nos[cur].z), aq: String(fA.id), aqParte: "distribuicao", isolamento: true });
          pilha.push(cur);
        });
      }
      /* as descidas (no sentido da água: do entreforro ao ponto) com o registro de gaveta, volante para dentro do cômodo */
      var tipoRgAQ = BIr.varianteAuto ? BIr.varianteAuto("registro_gaveta", { sistema: "agua_quente", material: matAQ, aplicacao: "ramal" }) : "acabamento";
      okLig.forEach(function (l) {
        var ts = l.segs.map(function (sg) { return { op: "trecho", id: novoId(hid, "d"), sistema: "agua_quente", material: matAQ, dn: l.p.dn, p1: sg.p1, p2: sg.p2, aq: String(fA.id), aqParte: "descida", aqPonto: String(l.p.k.famInst) }; });
        ts.forEach(function (t) { ops.push(t); });
        var tv = ts[1], fr = { x: -l.n.x, y: 0, z: -l.n.z }, g = BIC() && BIC().giroPara ? BIC().giroPara({ x: 0, y: tv.p2.y - tv.p1.y, z: 0 }, fr) : 0;
        var rg = { op: "acessorio", id: novoId(hid, "rg"), famId: "ra-registro-gaveta", tipoId: tipoRgAQ, trecho: tv.id, novoId: tv.id + "b", x: tv.p1.x, y: l.yRg, z: tv.p1.z, comprimento: Lr, aq: String(fA.id), aqParte: "descida" };
        if (g) rg.giro = g;
        ops.push(rg);
        /* REVISÃO H5 (21/10/2026): a DUCHA (chuveiro não elétrico) — o REGISTRO do misturador da água quente (canopla e volante
           DocolBase, na altura RP) é da própria família hid-chuveiro, no ponto de AQ (modelado como se executa: um registro só); o
           orçamento dele vai na ficha da família (tools/gerar-hid-pecas.js, composição SINAPI do registro de pressão) — aqui só o tubo */
        out.ligados++;
      });
      out.decisoes.push({ id: "aq.distribuicao", texto: "Água quente do aquecedor " + fA.id + " (" + (B.MATERIAIS[matAQ] || {}).nome + "): distribuição no entreforro a " + f2(yD) + " m, a " + f2(dL) + " m da face da parede; descida embutida até cada ponto (" + okLig.map(function (l) { return l.p.k.famInst + ":" + l.p.k.id + " DN " + l.p.dn; }).join(", ") + ") com registro de gaveta logo acima do ramal de água fria, volante para dentro do cômodo. DN do sub-ramal pela tabela de água quente (aq.dn_tubulacao); a montante, o maior a jusante (rode o dimensionamento — método dos pesos e pressão mínima do aquecedor)." });
      ops.forEach(function (o) { out.ops.push(o); });
      /* REVISÃO H5: DILATAÇÃO TÉRMICA — trecho reto da água quente a partir do menor trecho da tabela de liras do fabricante
         (aq.dilatacao_cpvc_tigre, colunas lira_L_trecho_<n>m) = aviso para prever lira/compensação (PPR: o manual do fabricante) */
      var Tdil = null; try { Tdil = NN() && NN().tabela ? NN().tabela("aq.dilatacao_cpvc_tigre") : null; } catch (eD) { Tdil = null; }
      var Lmin = arr(Tdil && Tdil.colunas).map(function (cn) { var m = /trecho_(\d+)m/.exec(cn); return m ? Number(m[1]) : null; }).filter(function (v) { return v > 0; }).sort(function (a, b) { return a - b; })[0];
      if (Lmin) { var longos = ops.filter(function (o) { return o.op === "trecho" && o.sistema === "agua_quente" && d3(o.p1, o.p2) >= Lmin - EPS; });
        if (longos.length) out.avisos.push({ texto: "Água quente do aquecedor " + fA.id + ": " + longos.length + " trecho(s) reto(s) de " + f2(Lmin) + " m ou mais (" + longos.map(function (o) { return f2(d3(o.p1, o.p2)) + " m"; }).join(", ") + ") — preveja a compensação da dilatação térmica (lira ou junta; tabela de liras do fabricante, aq.dilatacao_cpvc_tigre).", elementos: longos.map(function (o) { return String(o.id); }) }); }
      /* ISOLAMENTO TÉRMICO (NBR 5626:2020 6.12.3, aq2020.isolamento): a distribuição corre no entreforro, fora do ambiente aquecido —
         o traçado avisa; o isolamento (insumo SINAPI "isolamento térmico de tubulação") entra no orçamento pelo levantamento manual */
      var qI = ctx ? ctx.consulta("aq2020.isolamento", { parametro: "toda_extensao" }, "texto", "água quente: isolamento") : null;
      if (okLig.length) out.avisos.push({ texto: "Água quente do aquecedor " + fA.id + ": " + (qI && qI.ok ? qI.valor + " (NBR 5626:2020 " + qI.linha.item + ")" : "isolamento térmico da distribuição (NBR 5626:2020)") + " — a linha do entreforro corre fora do ambiente aquecido: o isolamento térmico (tubo de espuma de polietileno, insumo SINAPI) entra no levantamento por bitola.", elementos: [String(fA.id)] });
    });
    return out;
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

  var HidAQTraco = { VERSAO: 1, tracar: tracar, aquecedores: aquecedores, anteriores: anteriores };
  global.HidAQTraco = HidAQTraco;
  if (typeof module !== "undefined" && module.exports) module.exports = HidAQTraco;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
