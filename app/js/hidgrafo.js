/* =====================================================================
 * hidgrafo.js — o GRAFO da rede hidráulica a partir do modelo do
 * js/biminst.js (motor PURO, ES5, Node-testável). Usado pelo hidaf.js
 * (água fria) e pelo hides.js (esgoto).
 *
 * POR QUE NÃO USAR SÓ O BimInst.rede(). A rede do biminst decide CONEXÕES
 * (que peça entra em cada nó), mas não diz quem está a montante de quem
 * nem parte o trecho onde outro trecho deriva no meio dele. O cálculo
 * precisa de nós e arestas: aqui as pontas que se tocam viram o MESMO nó
 * (tolerância = BimInst.TOL, a mesma do desenho), o trecho atravessado por
 * uma derivação vira duas arestas, a peça (ralo, caixa sifonada) junta
 * todas as pontas que caem no cilindro dela num nó só, e o acessório
 * (registro, válvula) vira uma aresta própria entre as duas faces.
 *
 * ⚠ Sistemas diferentes NUNCA se ligam (mesma regra do biminst): o grafo é
 *   montado só com os sistemas pedidos.
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arquivo) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arquivo); } catch (e) {} }
    return null;
  }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function dist(a, b) { var dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z; return Math.sqrt(dx * dx + dy * dy + dz * dz); }
  function unit(a, b) { var dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, L = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1; return { x: dx / L, y: dy / L, z: dz / L }; }

  /* Decisão do RT (16/10/2026): as famílias hid-ralo e hid-caixa-sifonada entram no grafo EXATAMENTE como as peças do biminst
     (ralo_sifonado / ralo_seco / caixa_sifonada): o nó é uma peça, os conectores da família se unem nele, e o esgoto os trata
     como desconector com UHC = soma do que chega. Ralo sem "SIF" no nome do tipo = ralo seco (o lado seguro: exige passar por
     um desconector). Caixa SECA não é desconector: segue como aparelho sem UHC (pendência). */
  function pecaDaFamilia(famId, tipoId) {
    /* BIBLIOTECA DO ESCRITÓRIO (js/biminstbiblioteca.js, 17/10/2026): a família Tigre/DarivaBIM importada entra no grafo pelo
       tipo equivalente do motor — conexão = passagem (os conectores se unem num nó), caixa sifonada/CI/CG = a peça da norma */
    var HB = dep("HidBiblioteca", "./biminstbiblioteca.js");
    if (HB && HB.ehEscritorio(famId)) return HB.pecaGrafo(famId, tipoId);
    /* caixa de areia/inspeção do pluvial (NBR 10844 5.7.3): um nó só, que conta como ponto de inspeção no HidAP */
    if (famId === "hid-caixa-areia") return "caixa_areia";
    /* caixa de inspeção e caixa de gordura (famílias hid-*): peça de PASSAGEM (entrada e saída no mesmo nó),
       como a caixa sifonada — senão os dois conectores viravam dois "aparelhos" soltos (NBR 8160, 4.2.6.2) */
    if (famId === "hid-caixa-inspecao") return "caixa_inspecao";
    if (famId === "hid-caixa-gordura") return "caixa_gordura";
    /* TIL — tubo de inspeção e limpeza (NBR 7362:2025, Tabelas 15–17; TIL predial DN 100): peça de passagem na rede enterrada.
       Conta como dispositivo de inspeção só com opcoes.tilComoInspecao (onde a concessionária aceitar — opção do projetista) */
    if (famId === "hid-til") return "til";
    if (famId !== "hid-ralo" && famId !== "hid-caixa-sifonada") return null;
    var F = dep("HidFamilias", "./hidfamilias.js"), f = null, t = null, nome = "";
    try { f = F && F.porId ? F.porId(famId) : null; } catch (e) { f = null; }
    if (f) arr(f.tipos).forEach(function (x) { if (x.id === tipoId) t = x; });
    nome = t ? String(t.nome || "") : "";
    if (famId === "hid-ralo") return /sif/i.test(nome) ? "ralo_sifonado" : "ralo_seco";
    return /seca/i.test(nome) ? null : "caixa_sifonada";
  }

  /* corpo (largura da caixa, mm) e DN de saída do TIPO da família: a caixa sifonada se verifica pelo
     corpo e o tubo que sai dela nunca é menor que a saída (revisão F7 M1) */
  function dimDaFamilia(famId, tipoId) {
    var HB0 = dep("HidBiblioteca", "./biminstbiblioteca.js");
    if (HB0 && HB0.ehEscritorio(famId)) return HB0.dim(famId, tipoId);
    var F = dep("HidFamilias", "./hidfamilias.js"), f = null, t = null;
    try { f = F && F.porId ? F.porId(famId) : null; } catch (e) { f = null; }
    if (f) arr(f.tipos).forEach(function (x) { if (x.id === tipoId) t = x; });
    var v = (t && t.valores) || {}, L = Number(v.Largura), S = Number(v.DN_saida), Dm = Number(v.Diametro), Vr = Number(v.Volume_retencao_L);
    return { corpo: isFinite(L) && L > 0 ? Math.round(L * 1000) : (isFinite(Dm) && Dm > 0 ? Math.round(Dm * 1000) : null), saida: isFinite(S) && S > 0 ? S : null,
             diametro_m: isFinite(Dm) && Dm > 0 ? Dm : null, retencao_L: isFinite(Vr) && Vr > 0 ? Vr : null };
  }

  /* parâmetro t (0..1) de q no segmento a-b e a distância até a reta */
  function projecao(q, a, b) {
    var ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }, L2 = ab.x * ab.x + ab.y * ab.y + ab.z * ab.z;
    if (!(L2 > 0)) return null;
    var t = ((q.x - a.x) * ab.x + (q.y - a.y) * ab.y + (q.z - a.z) * ab.z) / L2;
    var p = { x: a.x + ab.x * t, y: a.y + ab.y * t, z: a.z + ab.z * t };
    return { t: t, d: dist(p, q), L: Math.sqrt(L2) };
  }

  function pontoEm(t, f) { return { x: t.p1.x + (t.p2.x - t.p1.x) * f, y: t.p1.y + (t.p2.y - t.p1.y) * f, z: t.p1.z + (t.p2.z - t.p1.z) * f }; }

  /* montar(rede, estado, sistemas) — rede = BimInst.rede(estado, avaliarFam) */
  function montar(R, estado, sistemas) {
    var BI = dep("BimInst", "./biminst.js"), TOL = BI ? BI.TOL : null;
    var quer = {}; arr(sistemas).forEach(function (s) { quer[s] = 1; });
    var trechos = arr(R && R.trechos).filter(function (t) { return quer[t.sistema]; });
    var famId = {}, tipoDe = {}; arr(estado && estado.familias).forEach(function (f) { famId[f.id] = f.famId; tipoDe[f.id] = f.tipoId; });

    /* 1) pontos → nós (pontas a menos de TOL são o mesmo nó) */
    var pts = [], idxT = {};
    trechos.forEach(function (t) { idxT[t.id] = [pts.length, pts.length + 1]; pts.push({ t: t, lado: 0, p: t.p1 }); pts.push({ t: t, lado: 1, p: t.p2 }); });
    var ord = pts.map(function (_, i) { return i; }).sort(function (a, b) { return pts[a].p.x - pts[b].p.x; });
    var noDe = new Array(pts.length), nos = [];
    ord.forEach(function (i, k) {
      if (noDe[i] != null) return;
      var g = nos.length; nos.push({ pts: [i] }); noDe[i] = g;
      for (var m = k + 1; m < ord.length; m++) {
        var j = ord[m]; if (pts[j].p.x - pts[i].p.x > TOL) break;
        if (noDe[j] == null && dist(pts[i].p, pts[j].p) <= TOL) { noDe[j] = g; nos[g].pts.push(j); }
      }
    });
    /* union-find: a peça junta as pontas que caem nela; o resto fica como está */
    var pai = nos.map(function (_, i) { return i; });
    function raiz(x) { while (pai[x] !== x) { pai[x] = pai[pai[x]]; x = pai[x]; } return x; }
    function une(a, b) { var ra = raiz(a), rb = raiz(b); if (ra !== rb) pai[rb] = ra; }
    function ponta(trechoId, q) {   /* o nó da ponta do trecho mais perto de q */
      var ix = idxT[trechoId]; if (!ix) return null;
      return noDe[dist(pts[ix[0]].p, q) <= dist(pts[ix[1]].p, q) ? ix[0] : ix[1]];
    }
    var pecaDe = {}, aparelhoDe = {}, faces = {}, pecaFam = {}, pecaFamDim = {}, equipNo = {};
    /* PRESSURIZAÇÃO (js/hidpressao.js, 18/10/2026): bomba e união são EQUIPAMENTO EM LINHA — os dois bocais viram uma
       ARESTA (com ganho da curva, no HidAF), nunca dois "aparelhos" soltos que consumiriam água */
    var HPZ = dep("HidPressao", "./hidpressao.js");
    arr(R && R.ligacoes).forEach(function (lg) {
      var n = ponta(lg.trecho, lg); if (n == null) return;
      var pf = lg.tipo === "aparelho" ? pecaDaFamilia(famId[lg.famInst], tipoDe[lg.famInst]) : null;
      if (pf) { pecaFam[lg.famInst] = pf; pecaFamDim[lg.famInst] = dimDaFamilia(famId[lg.famInst], tipoDe[lg.famInst]); if (pecaDe[lg.famInst] == null) pecaDe[lg.famInst] = n; else une(pecaDe[lg.famInst], n); }
      else if (lg.tipo === "peca") { if (pecaDe[lg.alvo] == null) pecaDe[lg.alvo] = n; else une(pecaDe[lg.alvo], n); }
      else if (lg.tipo === "aparelho" && HPZ && HPZ.equipamento(famId[lg.famInst])) (equipNo[lg.famInst] = equipNo[lg.famInst] || {})[String(lg.alvo).slice(String(lg.famInst).length + 1)] = n;
      else if (lg.tipo === "aparelho") aparelhoDe[n] = { conector: lg.alvo, famInst: lg.famInst, famId: famId[lg.famInst] || null, cid: String(lg.alvo).slice(String(lg.famInst).length + 1) };
      else if (lg.tipo === "acessorio") (faces[lg.famInst] = faces[lg.famInst] || []).push({ no: n, face: String(lg.alvo).slice(-1) });
    });

    /* 2) nós finais */
    var NOS = {}, ordemN = [];
    function noId(i) { return "n" + raiz(i); }
    nos.forEach(function (no, i) {
      var id = noId(i);
      if (!NOS[id]) { NOS[id] = { id: id, x: 0, y: 0, z: 0, n: 0, arestas: [], aparelho: null, peca: null }; ordemN.push(id); }
      var N0 = NOS[id];
      no.pts.forEach(function (j) { N0.x += pts[j].p.x; N0.y += pts[j].p.y; N0.z += pts[j].p.z; N0.n++; });
      if (aparelhoDe[i]) N0.aparelho = aparelhoDe[i];
    });
    ordemN.forEach(function (id) { var n = NOS[id]; n.x /= n.n; n.y /= n.n; n.z /= n.n; delete n.n; });
    Object.keys(pecaDe).forEach(function (pid) {
      var id = noId(pecaDe[pid]), pc = arr(R.pecas).filter(function (q) { return q.id === pid; })[0];
      /* PENDÊNCIAS FINAIS: a caixa de inspeção leva o tipo, a forma, o Ø/lado e a profundidade (js/hidcigeo.js) — a verificação
         da NBR 8160 (5.1.5.3) é do js/hides.js */
      var CId = pc && pc.peca === "caixa_inspecao" ? dep("HidCI", "./hidcigeo.js") : null, dCI = CId && CId.dims ? CId.dims(pc) : null;
      if (pc && dCI) { NOS[id].peca = { id: pid, peca: pc.peca, dn: pc.dn, tipoCaixa: dCI.tipoCaixa, forma: dCI.forma, diametro_m: dCI.diametro_m != null ? dCI.diametro_m : null, lado_m: dCI.lado_m != null ? dCI.lado_m : null, prof_m: dCI.prof_m, dispositivo: !!dCI.dispositivo, composicao: dCI.composicao || null,
                                                   pv: !!dCI.pv, chamine_m: dCI.pv ? dCI.chamine_m : null, chamineAltura_m: dCI.pv ? dCI.chamineAltura_m : null, balao_m: dCI.pv ? dCI.balao_m : null }; return; }   /* o PV: js/hides.js confere a 5.1.5.3 */
      NOS[id].peca = pc ? { id: pid, peca: pc.peca, dn: pc.dn } :(pecaFam[pid] ? { id: pid, peca: pecaFam[pid], dn: null, familia: true, corpo: (pecaFamDim[pid] || {}).corpo, saida: (pecaFamDim[pid] || {}).saida, diametro_m: (pecaFamDim[pid] || {}).diametro_m, retencao_L: (pecaFamDim[pid] || {}).retencao_L } : { id: pid });
    });

    /* 3) arestas: cada trecho entre as suas pontas, partido nos nós que caem no meio dele */
    var ARESTAS = {}, ordemA = [], partes = {};
    trechos.forEach(function (t) {
      var a = noId(noDe[idxT[t.id][0]]), b = noId(noDe[idxT[t.id][1]]);
      var meio = [];
      ordemN.forEach(function (id) {
        if (id === a || id === b) return;
        var pr = projecao(NOS[id], t.p1, t.p2);
        if (pr && pr.d <= TOL && pr.t * pr.L > TOL && (1 - pr.t) * pr.L > TOL) meio.push({ id: id, t: pr.t });
      });
      meio.sort(function (x, y) { return x.t - y.t; });
      var seq = [a].concat(meio.map(function (m) { return m.id; })).concat([b]);
      partes[t.id] = [];
      for (var k = 0; k + 1 < seq.length; k++) {
        var na = NOS[seq[k]], nb = NOS[seq[k + 1]], eid = seq.length > 2 ? t.id + "#" + (k + 1) : String(t.id);
        /* ⚠ a geometria da aresta é a do TRECHO (pontas reais e pontos de
           derivação projetados no eixo), não a média do nó: o nó de uma peça
           junta pontas a alturas diferentes (o tubo entra no topo da caixa e
           sai embaixo) e a média deslocava o eixo — a ventilação no meio do
           ramal deixava de ser achada e o comprimento saía errado */
        var pa = k === 0 ? t.p1 : pontoEm(t, meio[k - 1].t), pb = k + 1 === seq.length - 1 ? t.p2 : pontoEm(t, meio[k].t);
        var e = { id: eid, trecho: t.id, parte: seq.length > 2 ? k + 1 : null, tipo: "tubo", a: na.id, b: nb.id, sistema: t.sistema,
                  material: t.material, dn: t.dn, pa: pa, pb: pb, comprimento: dist(pa, pb), desnivel: pa.y - pb.y, vertical: t.vertical,
                  inclinacao: t.inclinacao, aplicacao: t.aplicacao, dir: unit(pa, pb) };
        ARESTAS[eid] = e; ordemA.push(eid); partes[t.id].push(eid);
        na.arestas.push(eid); nb.arestas.push(eid);
      }
    });
    /* 4) acessórios: aresta entre as duas faces (registro no meio do tubo) */
    arr(R && R.acessorios).forEach(function (ac) {
      if (!quer[ac.sistema]) return;
      /* ⚠ registro NORMALMENTE FECHADO (by-pass e entrada da bomba reserva do pressurizador): não conduz — senão vira anel */
      if (HPZ && HPZ.fechado(ac.id)) return;
      var fs = faces[ac.id] || []; if (fs.length !== 2) return;
      var na = NOS[noId(fs[0].no)], nb = NOS[noId(fs[1].no)]; if (!na || !nb || na === nb) return;
      var eid = "ac:" + ac.id;
      var fa = fs[0].face === "e" ? ac.a : ac.b, fb = fs[0].face === "e" ? ac.b : ac.a;
      ARESTAS[eid] = { id: eid, trecho: null, acessorio: ac.id, conexao: ac.acessorio, variante: ac.variante || null, tipo: "acessorio", a: na.id, b: nb.id, sistema: ac.sistema,
                       material: ac.material, dn: ac.dn, pa: fa, pb: fb, comprimento: dist(fa, fb), desnivel: fa.y - fb.y, vertical: ac.vertical, dir: unit(fa, fb) };
      ordemA.push(eid); na.arestas.push(eid); nb.arestas.push(eid);
    });
    /* 5) equipamento em linha: aresta "bomba" da entrada (sucção) à saída (recalque); união = passagem */
    Object.keys(equipNo).forEach(function (fi) {
      var eq = HPZ.equipamento(famId[fi]), nn = equipNo[fi]; if (!eq || nn[eq.entrada] == null || nn[eq.saida] == null) return;
      var na = NOS[noId(nn[eq.entrada])], nb = NOS[noId(nn[eq.saida])]; if (!na || !nb || na === nb) return;
      var eid = "eq:" + fi, pa = { x: na.x, y: na.y, z: na.z }, pb = { x: nb.x, y: nb.y, z: nb.z };
      ARESTAS[eid] = { id: eid, trecho: null, acessorio: fi, equipamento: { famInst: fi, famId: famId[fi], tipoId: tipoDe[fi], papel: eq.papel, entrada: na.id, saida: nb.id },
                       conexao: eq.papel === "passagem" ? "luva" : null, tipo: "bomba", a: na.id, b: nb.id, sistema: arr(sistemas)[0] || null, material: null, dn: null,
                       pa: pa, pb: pb, comprimento: 0, desnivel: pa.y - pb.y, vertical: false, dir: unit(pa, pb) };
      ordemA.push(eid); na.arestas.push(eid); nb.arestas.push(eid);
    });
    return { nos: NOS, ordemN: ordemN, arestas: ARESTAS, ordemA: ordemA, partes: partes,
             outro: function (e, noId0) { return e.a === noId0 ? e.b : e.a; } };
  }

  /* desvio entre duas direções que SAEM do nó (0° = alinhadas) — a mesma
     medida do BimInst.desvio; aqui só para escolher o par mais alinhado */
  function desvio(d1, d2) { var c = -(d1.x * d2.x + d1.y * d2.y + d1.z * d2.z); return Math.acos(Math.max(-1, Math.min(1, c))) * 180 / Math.PI; }   // hid:ok graus
  /* direção da aresta SAINDO do nó */
  function dirSaindo(e, noId0) { return e.a === noId0 ? e.dir : { x: -e.dir.x, y: -e.dir.y, z: -e.dir.z }; }

  var HidGrafo = { VERSAO: 1, montar: montar, desvio: desvio, dirSaindo: dirSaindo };
  global.HidGrafo = HidGrafo;
  if (typeof module !== "undefined" && module.exports) module.exports = HidGrafo;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
