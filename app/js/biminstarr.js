/* =====================================================================
 * biminstarr.js — ARRASTAR O TUBO COM A REDE ACOMPANHANDO (pedido do Rogério, 18/10/2026).
 *
 * "Clicar no tubo e poder arrastar ele para o lado; todas as peças conectadas nele já vêm arrastadas,
 *  parametrizadas. Se ele tiver inclinação, já ajusta o restante, com os parâmetros corretos, para não perder nada
 *  de posicionamento do restante."
 *
 * MOTOR PURO (ES5, Node-testável):
 *   BimInstArr.arrastar(estado, avaliarFam, alvos, d, opts) → { ok, erro, ops[], avisos[], conflitos[], corrigir[],
 *        confirmar, curtos[], quebras[], trocas[], mudaram[], pontes[] }
 *     alvos = uids/ids de TRECHOS (arrasta paralelo), CONEXÕES (cx…, move o nó) e PEÇAS (caixa: anda junto);
 *     d = {x, y, z} (m) — planta/3D: y = 0; corte: o deslocamento no plano do corte;
 *     opts.ponta = "p1"|"p2" (um trecho só): arrastar a PONTA estica/encurta só aquele trecho (no eixo dele);
 *     opts.inclinacao = "manter" (padrão) | "aceitar" (só a mínima do DN) | "mudarSaida" (a saída fixa desce junto);
 *     opts.confirmar = true aplica mesmo com tubo curto ou ligação desfeita (a tela pergunta antes).
 *   Regras (o padrão dos programas BIM de mercado):
 *     · o trecho arrastado anda PARALELO a si mesmo; a ponta presa (louça, caixa não selecionada, espera que continua
 *       fora do modelo) fica — o trecho gira em torno dela; a ponta no MEIO de outro tubo DESLIZA nele;
 *     · o VIZINHO ligado na ponta: paralelo ao movimento → ESTICA/ENCURTA (mesma direção); de lado → GIRA em torno da
 *       outra ponta (a conexão é trocada: 90° → 45°, com aviso); ponta solta do outro lado → anda junto; tubo VERTICAL
 *       (descida da louça, tubo de queda) arrastado de lado → fica de pé e ganha uma PERNA horizontal (joelhos novos);
 *     · ramal que chega no MEIO do tubo arrastado anda com ele (o tê/junção vai junto) e o ramal estica;
 *     · louças e peças NÃO selecionadas não se movem;
 *     · ESGOTO/PLUVIAL: o trecho arrastado mantém a inclinação; o vizinho que esticou mantém a DELE (nunca abaixo da
 *       mínima do DN) e a jusante inteira DESCE o que for preciso (o ramal que chega só ganha queda; o tubo vertical
 *       absorve). Se a descida bate numa saída FIXA (espera que continua fora, caixa, ponto de louça), nada é
 *       aplicado: volta o CONFLITO com as opções do Corrigir (aceitar a inclinação menor dentro da mínima, descer a
 *       cota de saída, rota alternativa pelo traçado automático);
 *     · tubo que fica mais CURTO que as bolsas das conexões, ou ligação que se desfaz → pede confirmação;
 *     · todas as ops num lote (a tela grava como UMA op: um Ctrl+Z desfaz o arraste inteiro).
 *   BimInstArr.encaixe(estado, alvos, d, opts) → { d, guia, distParede } — o encaixe magnético do arraste: alinha o
 *     eixo com outro tubo paralelo, encosta na face da parede (DE/2), no eixo da parede (embutido) e nos eixos da
 *     grade; devolve também a distância à face da parede mais perto (a cota temporária).
 *
 * A TELA (só no navegador, abaixo): o arraste no 3D (js/bim.js), na planta e no corte (js/bimselecao.js) e pela alça
 * do meio do tubo (js/biminstcon.js); prévia azul, cota temporária com a distância (digitável), Corrigir e
 * confirmação; Esc cancela.
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function BI() { return dep("BimInst", "./biminst.js"); }
  function HG() { return dep("HidGeo", "./biminstgeo.js"); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { var n = Number(v); return isFinite(n) ? n : d; }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function txt(v) { return v == null ? "" : String(v); }
  function cp(p) { return { x: p.x, y: p.y, z: p.z }; }
  function r4p(p) { return { x: r4(p.x), y: r4(p.y), z: r4(p.z) }; }
  function add(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
  function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
  function mul(a, s) { return { x: a.x * s, y: a.y * s, z: a.z * s }; }
  function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function dist(a, b) { return len(sub(a, b)); }
  function hlen(a, b) { return Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.z - a.z, 2)); }
  function unit(a, b) { var v = sub(b, a), L = len(v) || 1; return mul(v, 1 / L); }
  function igual(a, b) { return dist(a, b) <= 1e-6; }
  function fmt(v, c) { return (Math.round(v * Math.pow(10, c == null ? 2 : c)) / Math.pow(10, c == null ? 2 : c)).toFixed(c == null ? 2 : c).replace(".", ","); }
  var ZERO = { x: 0, y: 0, z: 0 };
  /* parâmetro do ponto q no INTERIOR do segmento a–b (longe das pontas) a menos de tol do eixo; senão null */
  function interior(q, a, b, tol) {
    var ab = sub(b, a), L2 = dot(ab, ab); if (!(L2 > 1e-12)) return null;
    var s = dot(sub(q, a), ab) / L2, L = Math.sqrt(L2);
    if (s * L <= tol || (1 - s) * L <= tol) return null;
    return dist(add(a, mul(ab, s)), q) <= tol ? s : null;
  }
  /* campos da instância que a op "trecho" (recriar) não pode perder */
  var EXTRAS = ["juntaIni", "juntaFim", "juntaMotivo", "comentarios", "faseCriada", "faseDemolida"];
  function opTrecho(I, t, p1, p2) {
    var o = I.opDoTrecho(t); o.p1 = r4p(p1); o.p2 = r4p(p2);
    EXTRAS.forEach(function (k) { if (t[k] != null && t[k] !== "") o[k] = t[k]; });
    return o;
  }
  function opPeca(p, y) {
    var o = { op: "peca", id: p.id, peca: p.peca, sistema: p.sistema, material: p.material, dn: p.dn, x: p.x, y: r4(y), z: p.z, rotY: p.rotY || 0 };
    ["prof", "alturaPiso", "comentarios", "faseCriada", "faseDemolida"].forEach(function (k) { if (p[k] != null && p[k] !== "") o[k] = p[k]; });
    return o;
  }
  /* o que a ponta da conexão "come" do tubo (mm → m) e a bolsa do tubo: o tubo é CURTO se o que sobra livre entre as
     duas conexões não enche uma bolsa (js/biminstgeo.js; sem ele, a proporção do DN) */
  function zConexao(c, dn) {
    var H = HG(), mm = null;
    if (H && H.cotasConexao && c) { try { var k = H.cotasConexao(c.material, c.tipo, c.dn || dn, c.dn2); mm = Math.max(num(k.z, 0), num(k.zb, 0), num(k.zp, 0), num(k.zr, 0)) || num(k.pb, 0); } catch (e) { mm = null; } }
    if (!(mm > 0)) mm = 0.6 * num(dn, 50);
    return mm / 1000;
  }
  function bolsaTubo(t) {
    var H = HG(), mm = null;
    if (H && H.cotasTubo) { try { mm = num(H.cotasTubo(t.material, t.dn).pb, null); } catch (e) { mm = null; } }
    if (!(mm > 0)) mm = 0.5 * num(t.dn, 50);
    return mm / 1000;
  }

  function arrastar(estado, avaliarFam, alvos, d, opts) {
    opts = opts || {};
    var I = BI(); if (!I) return { ok: false, erro: "Motor das instalações não carregado.", ops: [], avisos: [] };
    var ins = (estado && estado.instalacoes) || { trechos: [], pecas: [] }, TS = arr(ins.trechos), PS = arr(ins.pecas), TOL = I.TOL;
    var modo = opts.inclinacao === "aceitar" || opts.inclinacao === "mudarSaida" ? opts.inclinacao : "manter";
    d = { x: num(d && d.x, 0), y: num(d && d.y, 0), z: num(d && d.z, 0) };
    function falha(e) { return { ok: false, erro: e, ops: [], avisos: [], conflitos: [], corrigir: [], curtos: [], quebras: [], trocas: [], mudaram: [], pontes: [] }; }
    if (len(d) < 1e-4) return falha("Arraste sem deslocamento.");
    var R0 = I.rede(estado, avaliarFam), porT = {}, porP = {}, M = {}, MP = {}, nos = [], avisos = [];
    TS.forEach(function (t) { porT[t.id] = t; }); PS.forEach(function (p) { porP[p.id] = p; });
    arr(alvos).forEach(function (a) {
      a = txt(a).replace(/^edit:/, "");
      if (porT[a]) M[a] = 1;
      else if (porP[a]) MP[a] = 1;
      else {
        var c = R0.conexoes.filter(function (x) { return x.id === a; })[0];
        if (c) {
          var N = { x: c.x, y: c.y, z: c.z }, Dh0 = Math.sqrt(d.x * d.x + d.z * d.z), deLado = [];
          TS.forEach(function (t) {
            if (t.sistema !== c.sistema || !(dist(t.p1, N) <= TOL || dist(t.p2, N) <= TOL)) return;
            var Lh0 = hlen(t.p1, t.p2), par;
            if (Lh0 <= TOL) par = Dh0 <= 1e-4;
            else { var ux0 = (t.p2.x - t.p1.x) / Lh0, uz0 = (t.p2.z - t.p1.z) / Lh0; par = Math.abs(d.x * uz0 - d.z * ux0) <= 0.01 * Dh0 + 1e-5; }
            if (!par) deLado.push(t.id);
          });
          if (deLado.length) deLado.forEach(function (id) { M[id] = 1; });
          else nos.push({ x: c.x, y: c.y, z: c.z, sistema: c.sistema, id: c.id });
        }
        else if (arr(ins.acessorios).some(function (x) { return x.id === a; })) avisos.push("o registro " + a + " anda com o tubo dele (arraste o tubo)");
      }
    });
    if (!Object.keys(M).length && !Object.keys(MP).length && !nos.length) return falha("Nada para arrastar: selecione um tubo, uma conexão ou uma caixa.");
    /* --- o que é FIXO na ponta de um trecho (pela rede de antes) */
    function ligEm(tid, P) { return R0.ligacoes.filter(function (l) { return l.trecho === tid && dist(l, P) <= TOL + I.TOL_CONECTOR; })[0] || null; }
    function fixoPonta(t, k) {
      var l = ligEm(t.id, t[k]);
      if (l) { if (l.tipo === "peca" && MP[l.alvo]) return null; return { tipo: l.tipo, id: l.alvo, trecho: t.id }; }
      if (R0.continuacoes.some(function (c) { return c.trecho === t.id && c.ponta === k; })) return { tipo: "continua", id: t.id, trecho: t.id };
      return null;
    }
    function hostEm(P, sis, fora) {
      for (var i = 0; i < TS.length; i++) { var h = TS[i]; if (fora[h.id] || h.sistema !== sis) continue; if (interior(P, h.p1, h.p2, TOL) != null) return h; }
      return null;
    }
    function livreEm(t, k) { return R0.pontasLivres.some(function (l) { return l.trecho === t.id && dist(l, t[k]) <= TOL; }); }
    /* --- ARRASTAR A PONTA (um trecho só): no eixo dele. Ponta solta: estica só ele; ligada: o nó anda no eixo */
    var idsM = Object.keys(M);
    if (opts.ponta === "p1" || opts.ponta === "p2") {
      if (idsM.length !== 1 || nos.length || Object.keys(MP).length) return falha("Arrastar a ponta: um tubo só.");
      var tp = porT[idsM[0]], kp = opts.ponta, fp = kp === "p1" ? "p2" : "p1", up = unit(tp[fp], tp[kp]);
      var dd = mul(up, dot(d, up));
      if (len(dd) < 1e-4) return falha("A ponta só anda no eixo do tubo.");
      var fxp = fixoPonta(tp, kp);
      if (fxp && fxp.tipo !== "continua") return falha("A ponta está ligada " + (fxp.tipo === "aparelho" ? "no aparelho" : "na " + fxp.tipo) + ": arraste o tubo, não a ponta.");
      var ocupada = !livreEm(tp, kp) && !fxp;
      if (!ocupada) {
        var nk = add(tp[kp], dd);
        if (dot(sub(nk, tp[fp]), up) < 0.01) return falha("O tubo " + tp.id + " ficaria sem comprimento.");
        idsM = []; M = {};
        nos.push({ x: tp[kp].x, y: tp[kp].y, z: tp[kp].z, sistema: tp.sistema, disp: dd, so: tp.id, ponta: kp });
      } else {
        idsM = []; M = {};
        nos.push({ x: tp[kp].x, y: tp[kp].y, z: tp[kp].z, sistema: tp.sistema, disp: dd });
      }
      d = dd;
    }
    /* --- a geometria de trabalho */
    var G = {}; TS.forEach(function (t) { G[t.id] = { t: t, p1: cp(t.p1), p2: cp(t.p2), mudou: false, transl: false }; });
    var MOV = [], pontes = [], PCH = {}, erros = [], rotacoes = [];
    function movEm(P, sis) { for (var i = 0; i < MOV.length; i++) if (MOV[i].sis === sis && dist(MOV[i].P0, P) <= TOL) return MOV[i]; return null; }
    /* trechos arrastados */
    idsM.forEach(function (id) {
      var g = G[id], t = g.t, disp = {};
      ["p1", "p2"].forEach(function (k) {
        var fx = fixoPonta(t, k), h;
        if (fx) { disp[k] = ZERO; avisos.push("a ponta de " + id + " está presa (" + (fx.tipo === "aparelho" ? "aparelho" : (fx.tipo === "continua" ? "espera que continua fora do modelo" : fx.tipo + " " + fx.id)) + "): o tubo gira em torno dela"); }
        else if ((h = hostEm(t[k], t.sistema, M))) { var uh = unit(h.p1, h.p2); disp[k] = mul(uh, dot(d, uh)); if (len(sub(d, disp[k])) > 1e-4) avisos.push("a ponta de " + id + " está no meio do tubo " + h.id + ": desliza ao longo dele"); }
        else disp[k] = d;
      });
      if (len(disp.p1) < 1e-6 && len(disp.p2) < 1e-6) { erros.push("o tubo " + id + " está preso nas duas pontas"); return; }
      g.p1 = add(t.p1, disp.p1); g.p2 = add(t.p2, disp.p2); g.mudou = true; g.transl = igual(disp.p1, disp.p2);
      if (!g.transl) rotacoes.push(id);
      ["p1", "p2"].forEach(function (k) { if (len(disp[k]) > 1e-6) MOV.push({ P0: cp(t[k]), disp: disp[k], sis: t.sistema }); });
      /* o ramal que chega no MEIO do tubo arrastado: o tê/junção anda junto */
      TS.forEach(function (v) {
        if (M[v.id] || v.sistema !== t.sistema) return;
        ["p1", "p2"].forEach(function (k) { var s = interior(v[k], t.p1, t.p2, TOL); if (s != null) MOV.push({ P0: cp(v[k]), disp: add(mul(disp.p1, 1 - s), mul(disp.p2, s)), sis: t.sistema }); });
      });
    });
    /* peças selecionadas (caixa) andam; os tubos ligados nelas acompanham */
    Object.keys(MP).forEach(function (pid) {
      var p = porP[pid]; PCH[pid] = { x: p.x + d.x, y: p.y + d.y, z: p.z + d.z };
      R0.ligacoes.forEach(function (l) {
        if (l.tipo !== "peca" || l.alvo !== pid || M[l.trecho]) return;
        var t = porT[l.trecho]; if (!t) return;
        var k = dist(t.p1, l) <= dist(t.p2, l) ? "p1" : "p2";
        MOV.push({ P0: cp(t[k]), disp: d, sis: t.sistema });
      });
    });
    /* nós (conexão selecionada; ponta ligada) */
    nos.forEach(function (n) {
      var disp = n.disp || d, h = hostEm(n, n.sistema, {});
      if (h && !n.so) { var uh = unit(h.p1, h.p2); disp = mul(uh, dot(disp, uh)); if (len(disp) < 1e-4) { erros.push("a conexão está no meio do tubo " + h.id + " e só desliza ao longo dele"); return; } }
      var preso = TS.filter(function (t) { return t.sistema === n.sistema && (dist(t.p1, n) <= TOL || dist(t.p2, n) <= TOL); }).map(function (t) { return fixoPonta(t, dist(t.p1, n) <= TOL ? "p1" : "p2"); }).filter(function (f) { return f && f.tipo !== "continua"; })[0];
      if (preso) { erros.push("a conexão está ligada " + (preso.tipo === "aparelho" ? "no aparelho" : "na " + preso.tipo + " " + preso.id) + ": não anda"); return; }
      if (n.so) { var gS = G[n.so]; gS[n.ponta] = add(gS[n.ponta], disp); gS.mudou = true; return; }
      MOV.push({ P0: { x: n.x, y: n.y, z: n.z }, disp: disp, sis: n.sistema });
    });
    if (erros.length && !MOV.length && !Object.keys(PCH).length && !idsM.some(function (id) { return G[id].mudou; }) && !TS.some(function (t) { return G[t.id].mudou; })) return falha(erros[0] + ".");
    /* --- os VIZINHOS */
    var seqP = 0;
    function idPonte(base) { var id; do { id = base + "-pt" + (++seqP); } while (porT[id] || pontes.some(function (p) { return p.id === id; })); return id; }
    TS.forEach(function (v) {
      if (M[v.id]) return;
      var g = G[v.id], m1 = movEm(v.p1, v.sistema), m2 = movEm(v.p2, v.sistema);
      if (!m1 && !m2) return;
      if (m1 && m2) {
        g.p1 = add(v.p1, m1.disp); g.p2 = add(v.p2, m2.disp); g.mudou = true; g.transl = igual(m1.disp, m2.disp);
        if (!g.transl) rotacoes.push(v.id);
        return;
      }
      var k = m1 ? "p1" : "p2", f = m1 ? "p2" : "p1", D = (m1 || m2).disp, near = v[k], far = v[f];
      var Dh = Math.sqrt(D.x * D.x + D.z * D.z), Lh = hlen(near, far);
      if (Lh <= TOL) {   /* VERTICAL */
        if (Dh <= 1e-4) {
          var ny = near.y + D.y;
          if ((ny - far.y) * (near.y - far.y) <= 0 || Math.abs(ny - far.y) < 0.01) { erros.push("o tubo vertical " + v.id + " ficaria sem comprimento"); return; }
          g[k] = { x: near.x, y: ny, z: near.z }; g.mudou = true; return;
        }
        if (livreEm(v, f)) { g.p1 = add(v.p1, D); g.p2 = add(v.p2, D); g.mudou = true; g.transl = true; return; }
        /* fica de pé; a PERNA horizontal liga o pé dele à ponta que andou (no sentido do escoamento) */
        var a0 = cp(near), a1 = add(near, D), entra = k === "p2";   /* entra = o vertical CHEGA no nó (desce da louça) */
        pontes.push({ id: idPonte(v.id), base: v, p1: entra ? a0 : a1, p2: entra ? a1 : a0, nova: true });
        avisos.push("o tubo vertical " + v.id + " ficou de pé: ganhou uma perna horizontal de " + fmt(Dh) + " m (joelhos novos)");
        return;
      }
      /* horizontal (ou inclinado): paralelo ao movimento → estica; de lado → gira em torno da outra ponta */
      var uh = { x: (near.x - far.x) / Lh, z: (near.z - far.z) / Lh }, cruz = Math.abs(D.x * uh.z - D.z * uh.x);
      if (cruz <= 0.01 * Dh + 1e-5) {
        var nn = add(near, D), dotH = (nn.x - far.x) * uh.x + (nn.z - far.z) * uh.z;
        if (dotH < 0.01) { erros.push("o tubo " + v.id + " ficaria sem comprimento (arraste maior que ele)"); return; }
        g[k] = nn; g.mudou = true; return;
      }
      if (livreEm(v, f)) { g.p1 = add(v.p1, D); g.p2 = add(v.p2, D); g.mudou = true; g.transl = true; return; }
      g[k] = add(near, D); g.mudou = true; rotacoes.push(v.id);
    });
    if (erros.length) return falha(erros[0] + ".");
    /* --- ESGOTO/PLUVIAL: inclinação de cada trecho que mudou de forma; a jusante desce */
    var conflitos = [], baixou = {};
    function grav(sis) { return !!(I.SISTEMAS[sis] && I.SISTEMAS[sis].gravidade); }
    function perto(a, b) { return dist(a, b) <= TOL; }
    function horiz(g) { return hlen(g.p1, g.p2) > TOL; }
    function pecaNo(P, sis) {
      for (var i = 0; i < PS.length; i++) {
        var q = PS[i], hb = q.hub; if (!hb || q.sistema !== sis) continue;
        if (Math.sqrt(Math.pow(P.x - hb.x, 2) + Math.pow(P.z - hb.z, 2)) <= (hb.r || 0) + TOL && P.y <= hb.yTop + TOL && P.y >= hb.yBot - TOL) return q;
      }
      return null;
    }
    function abaixar(P, dl, sis, visto, pular) {
      var key = r4(P.x) + "," + r4(P.y) + "," + r4(P.z); if (visto[key]) return true; visto[key] = 1;
      var P0 = cp(P);
      /* o que está FIXO neste nó */
      var pc = pecaNo(P0, sis);
      if (pc && !PCH[pc.id]) {
        if (P0.y - dl >= pc.hub.yBot - 1e-6 && P0.y - dl <= pc.hub.yTop + 1e-6) { avisos.push("a entrada na " + (I.PECAS[pc.peca] ? I.PECAS[pc.peca].nome.toLowerCase() : "peça") + " " + pc.id + " desceu " + fmt(dl * 100, 1) + " cm (dentro do corpo dela)"); return true; }
        if (modo !== "mudarSaida") { conflitos.push({ tipo: "peca", id: pc.id, trecho: pular, falta: r4(dl), x: r4(P0.x), y: r4(P0.y), z: r4(P0.z), texto: "a " + (I.PECAS[pc.peca] ? I.PECAS[pc.peca].nome.toLowerCase() : "peça") + " " + pc.id + " é fixa (a cota da entrada não desce " + fmt(dl * 100, 1) + " cm)" }); return false; }
        PCH[pc.id] = { x: pc.x, y: pc.y - dl, z: pc.z };
        avisos.push("a " + (I.PECAS[pc.peca] ? I.PECAS[pc.peca].nome.toLowerCase() : "peça") + " " + pc.id + " desceu " + fmt(dl * 100, 1) + " cm (cota de saída)");
        var okP = true;
        R0.ligacoes.forEach(function (l) {
          if (l.tipo !== "peca" || l.alvo !== pc.id || l.trecho === pular || !G[l.trecho]) return;
          var gg = G[l.trecho], kk = dist(gg.p1, l) <= dist(gg.p2, l) ? "p1" : "p2";
          if (kk === "p1") { var p2a = cp(gg.p2); gg.p1.y = r4(gg.p1.y - dl); gg.p2.y = r4(gg.p2.y - dl); gg.mudou = true; baixou[l.trecho] = 1; if (!abaixar(p2a, dl, sis, visto, l.trecho)) okP = false; }
          else { gg.p2.y = r4(gg.p2.y - dl); gg.mudou = true; baixou[l.trecho] = 1; }
        });
        return okP;
      }
      var lc = R0.ligacoes.filter(function (l) { return l.tipo === "aparelho" && dist(l, P0) <= TOL + I.TOL_CONECTOR; })[0];
      if (lc) { conflitos.push({ tipo: "aparelho", id: lc.alvo, trecho: pular, falta: r4(dl), x: r4(P0.x), y: r4(P0.y), z: r4(P0.z), texto: "o ponto do aparelho é fixo" }); return false; }
      var hostH = null; TS.forEach(function (h) { if (!hostH && h.sistema === sis && horiz(G[h.id]) && interior(P0, G[h.id].p1, G[h.id].p2, TOL) != null) hostH = h; });
      if (hostH) { conflitos.push({ tipo: "tubo", id: hostH.id, trecho: pular, falta: r4(dl), x: r4(P0.x), y: r4(P0.y), z: r4(P0.z), texto: "a junção no tubo " + hostH.id + " não desce sozinha" }); return false; }
      var ok = true;
      Object.keys(G).forEach(function (id) {
        var g = G[id]; if (g.t.sistema !== sis || id === pular) return;
        if (!horiz(g)) {
          var cima = g.p1.y >= g.p2.y ? "p1" : "p2";
          if (perto(g[cima], P0)) { g[cima].y = r4(g[cima].y - dl); g.mudou = true; baixou[id] = 1; }
          return;
        }
        var kc = perto(g.p1, P0) ? "p1" : (perto(g.p2, P0) ? "p2" : null); if (!kc) return;
        var cont = R0.continuacoes.filter(function (c) { return c.trecho === id; })[0];
        if (kc === "p1") {
          /* a JUSANTE absorve o que puder: só a ponta de montante desce enquanto o trecho fica na inclinação mínima do
             DN; o que faltar desce a ponta de jusante (e segue). O tubo ARRASTADO desce inteiro (mantém a dele). */
          var LhJ = hlen(g.p1, g.p2), needJ = I.declMinDn(sis, g.t.dn) / 100 * LhJ, q2 = (g.p1.y - dl) - g.p2.y;
          var dl2 = M[id] || g.transl ? dl : (q2 >= needJ - 1e-6 ? 0 : Math.ceil((needJ - q2) * 10000 - 1e-6) / 10000);
          var p2b = cp(g.p2), saiFixa = !!(cont && cont.ponta === "p2");
          if (dl2 > 0 && saiFixa && modo !== "mudarSaida") { conflitos.push({ tipo: "continua", id: id, trecho: id, falta: r4(dl2), x: r4(g.p2.x), y: r4(g.p2.y), z: r4(g.p2.z), texto: "a espera " + id + " continua fora do modelo numa cota fixa" }); ok = false; return; }
          g.p1.y = r4(g.p1.y - dl); if (dl2 > 0) g.p2.y = r4(g.p2.y - dl2); g.mudou = true; baixou[id] = 1;
          if (dl2 > 0 && saiFixa) avisos.push("a cota de saída da espera " + id + " desceu " + fmt(dl2 * 100, 1) + " cm");
          if (dl2 > 0 && !saiFixa && !abaixar(p2b, dl2, sis, visto, id)) ok = false;
        } else { g.p2.y = r4(g.p2.y - dl); g.mudou = true; baixou[id] = 1; }
      });
      return ok;
    }
    /* SUBIR A MONTANTE (arraste na vertical, no corte): o tubo que CHEGA no nó que o usuário subiu fica na inclinação
       dele subindo a ponta de cima — o tubo vertical (a descida da louça) encurta; nunca se desfaz o que o usuário pôs */
    function elevar(P, dl, sis, visto, pular) {
      var key = r4(P.x) + "," + r4(P.y) + "," + r4(P.z); if (visto[key]) return true; visto[key] = 1;
      var P0 = cp(P);
      var lc = R0.ligacoes.filter(function (l) { return (l.tipo === "aparelho" || l.tipo === "acessorio") && dist(l, P0) <= TOL + I.TOL_CONECTOR; })[0];
      if (lc) { conflitos.push({ tipo: "aparelho", id: lc.alvo, trecho: pular, falta: r4(dl), x: r4(P0.x), y: r4(P0.y), z: r4(P0.z), texto: "o ponto do aparelho é fixo (o tubo que chega nele não sobe)" }); return false; }
      var pc = pecaNo(P0, sis);
      if (pc && !PCH[pc.id]) {
        if (P0.y + dl <= pc.hub.yTop + 1e-6) return true;
        conflitos.push({ tipo: "peca", id: pc.id, trecho: pular, falta: r4(dl), x: r4(P0.x), y: r4(P0.y), z: r4(P0.z), texto: "a saída da " + (I.PECAS[pc.peca] ? I.PECAS[pc.peca].nome.toLowerCase() : "peça") + " " + pc.id + " é fixa" }); return false;
      }
      var ok = true;
      Object.keys(G).forEach(function (id) {
        var g = G[id]; if (g.t.sistema !== sis || id === pular || M[id]) return;
        if (!horiz(g)) {
          var baixo = g.p1.y <= g.p2.y ? "p1" : "p2", cima = baixo === "p1" ? "p2" : "p1";
          if (!perto(g[baixo], P0)) return;
          if (g[cima].y - (g[baixo].y + dl) < 0.02) { conflitos.push({ tipo: "tubo", id: id, trecho: pular, falta: r4(dl), x: r4(P0.x), y: r4(P0.y), z: r4(P0.z), texto: "o tubo vertical " + id + " ficaria sem comprimento" }); ok = false; return; }
          g[baixo].y = r4(g[baixo].y + dl); g.mudou = true; avisos.push("o tubo vertical " + id + " encurtou " + fmt(dl * 100, 1) + " cm (a montante subiu)");
          return;
        }
        var kc = perto(g.p2, P0) ? "p2" : (perto(g.p1, P0) ? "p1" : null); if (!kc) return;
        if (kc === "p1") { g.p1.y = r4(g.p1.y + dl); g.mudou = true; return; }   /* outro ramal que SAI do nó: ganha queda */
        var Lh = hlen(g.p1, g.p2), need = I.declMinDn(sis, g.t.dn) / 100 * Lh, q = g.p1.y - (g.p2.y + dl);
        var dl1 = q >= need - 1e-6 ? 0 : Math.ceil((need - q) * 10000 - 1e-6) / 10000, p1b = cp(g.p1);
        if (dl1 > 0 && R0.continuacoes.some(function (c) { return c.trecho === id && c.ponta === "p1"; })) { conflitos.push({ tipo: "continua", id: id, trecho: id, falta: r4(dl1), x: r4(g.p1.x), y: r4(g.p1.y), z: r4(g.p1.z), texto: "a chegada " + id + " vem de fora do modelo numa cota fixa" }); ok = false; return; }
        g.p2.y = r4(g.p2.y + dl); if (dl1 > 0) g.p1.y = r4(g.p1.y + dl1); g.mudou = true;
        if (dl1 > 0 && !elevar(p1b, dl1, sis, visto, id)) ok = false;
      });
      return ok;
    }
    var CH = Object.keys(G).filter(function (id) { return G[id].mudou && !G[id].transl; });
    pontes.forEach(function (p) { CH.push(p); });
    CH.sort(function (a, b) { var ga = typeof a === "string" ? G[a] : a, gb = typeof b === "string" ? G[b] : b; return Math.max(gb.p1.y, gb.p2.y) - Math.max(ga.p1.y, ga.p2.y); });
    CH.forEach(function (it) {
      var g = typeof it === "string" ? G[it] : it, t = typeof it === "string" ? g.t : it.base, sis = t.sistema;
      if (!grav(sis) || !horiz(g)) return;
      var Lh = hlen(g.p1, g.p2), dn = t.dn, imin = I.declMinDn(sis, dn), i0 = typeof it === "string" && horiz(G[it].t) ? (t.p1.y - t.p2.y) / hlen(t.p1, t.p2) * 100 : imin;
      var alvo = modo === "aceitar" ? imin : Math.max(i0, imin), precisa = alvo / 100 * Lh, queda = g.p1.y - g.p2.y;
      if (queda >= precisa - 1e-6) return;
      var dl = Math.ceil((precisa - queda) * 10000 - 1e-6) / 10000;
      var P2 = cp(g.p2), nC = conflitos.length, idC = typeof it === "string" ? it : null;
      /* a ponta de jusante DELE é a espera que continua fora do modelo: cota fixa */
      if (idC && R0.continuacoes.some(function (c) { return c.trecho === idC && c.ponta === "p2"; })) {
        if (modo !== "mudarSaida") { conflitos.push({ tipo: "continua", id: idC, trecho: idC, falta: r4(dl), x: r4(g.p2.x), y: r4(g.p2.y), z: r4(g.p2.z), texto: "a espera " + idC + " continua fora do modelo numa cota fixa" }); return; }
        g.p2.y = r4(g.p2.y - dl); g.mudou = true; avisos.push("a cota de saída da espera " + idC + " desceu " + fmt(dl * 100, 1) + " cm"); return;
      }
      /* o usuário SUBIU/DESCEU o nó de jusante deste tubo (arraste na vertical): ele sobe a ponta de montante */
      if (idC && !M[idC] && Math.abs(d.y) > 1e-4 && movEm(g.t.p2, sis)) {
        var P1u = cp(g.p1), nE = conflitos.length;
        if (elevar(P1u, dl, sis, {}, idC)) { g.p1.y = r4(g.p1.y + dl); g.mudou = true; }
        if (conflitos.length === nE) avisos.push("trecho " + idC + ": manteve " + fmt(alvo, 2) + "% — a ponta de montante subiu " + fmt(dl * 100, 1) + " cm");
        return;
      }
      var okA = abaixar(P2, dl, sis, {}, typeof it === "string" ? it : null);
      if (okA || modo === "mudarSaida") { g.p2.y = r4(g.p2.y - dl); g.mudou = true; }
      if (conflitos.length === nC && dl > 1e-4) avisos.push((typeof it === "string" ? "trecho " + it : "a perna nova") + ": " + (modo === "aceitar" ? "na inclinação mínima do DN " + dn + " (" + fmt(imin, 1) + "%)" : "manteve " + fmt(alvo, 2) + "%") + " — a jusante desceu " + fmt(dl * 100, 1) + " cm");
    });
    /* --- o resultado: as ops e o estado novo (para conferir na rede) */
    var ops = [], mudaram = [], tNovos = [];
    TS.forEach(function (t) {
      var g = G[t.id];
      if (g.mudou && !(igual(g.p1, t.p1) && igual(g.p2, t.p2))) { var o = opTrecho(I, t, g.p1, g.p2); ops.push(o); mudaram.push(t.id); tNovos.push(I.normTrecho(o) || t); }
      else tNovos.push(t);
    });
    pontes.forEach(function (p) {
      var b = p.base, o = { op: "trecho", id: p.id, sistema: b.sistema, material: b.material, dn: b.dn, p1: r4p(p.p1), p2: r4p(p.p2) };
      ["pn", "classe", "serie", "iso"].forEach(function (k) { if (b[k] != null && b[k] !== "") o[k] = b[k]; });
      ops.push(o); var n = I.normTrecho(o); if (n) tNovos.push(n);
    });
    var pNovos = PS.map(function (p) {
      var ch = PCH[p.id]; if (!ch) return p;
      var o = opPeca(p, ch.y); o.x = r4(ch.x); o.z = r4(ch.z); ops.push(o);
      return I.normPeca(o) || p;
    });
    var E1 = {}; Object.keys(estado || {}).forEach(function (k) { E1[k] = estado[k]; });
    E1.instalacoes = {}; Object.keys(ins).forEach(function (k) { E1.instalacoes[k] = ins[k]; });
    E1.instalacoes.trechos = tNovos; E1.instalacoes.pecas = pNovos;
    var R1 = I.rede(E1, avaliarFam);
    /* conexões trocadas (o ângulo mudou) */
    function chave(c) { return arr(c.ramos).slice().sort().join("|") + "@" + c.sistema; }
    var antes = {}; R0.conexoes.forEach(function (c) { (antes[chave(c)] = antes[chave(c)] || []).push(c.tipo); });
    var trocas = [];
    R1.conexoes.forEach(function (c) {
      var a = antes[chave(c)]; if (!a || a.indexOf(c.tipo) >= 0) return;
      if (!arr(c.ramos).some(function (id) { return mudaram.indexOf(id) >= 0; })) return;
      trocas.push({ id: c.id, de: a[0], para: c.tipo, ramos: c.ramos, x: c.x, y: c.y, z: c.z });
      avisos.push("conexão trocada: " + I.nomeConexao(a[0], c.material).toLowerCase() + " → " + I.nomeConexao(c.tipo, c.material).toLowerCase() + " (" + c.ramos.join(" × ") + ")");
    });
    /* ÂNGULO SEM CONEXÃO: no nó de dois tubos que mudou, o ângulo entre eles tem de ser o de uma conexão (reta, 22,5°,
       45°, 90°) — a rede escolhe o joelho pelo mais perto, então um 135° viraria um "joelho 90°" que não existe */
    var angulos = [], PADRAO = [180, 157.5, 135, 90], porT1 = {}, vistos = {};
    tNovos.forEach(function (t) { porT1[t.id] = t; });
    R1.conexoes.forEach(function (c) {
      var rs = arr(c.ramos); if (rs.length !== 2 || !rs.some(function (id) { return mudaram.indexOf(id) >= 0 || pontes.some(function (p) { return p.id === id; }); })) return;
      var k = rs.slice().sort().join("|"); if (vistos[k]) return; vistos[k] = 1;
      var t1 = porT1[rs[0]], t2 = porT1[rs[1]]; if (!t1 || !t2) return;
      var N = { x: c.x, y: c.y, z: c.z };
      if (interior(N, t1.p1, t1.p2, TOL) != null || interior(N, t2.p1, t2.p2, TOL) != null) return;
      function fora(t) { return dist(t.p1, N) <= dist(t.p2, N) ? unit(t.p1, t.p2) : unit(t.p2, t.p1); }
      var ang = Math.acos(Math.max(-1, Math.min(1, dot(fora(t1), fora(t2))))) * 180 / Math.PI;
      if (!PADRAO.some(function (a) { return Math.abs(ang - a) <= 2.5; })) {
        angulos.push({ ramos: rs, angulo: Math.round(ang * 10) / 10, x: c.x, y: c.y, z: c.z });
        avisos.push("ângulo de " + fmt(180 - ang, 1) + "° entre " + rs.join(" × ") + ": não existe conexão (só 22,5°, 45° e 90°)");
      }
    });
    /* ligação desfeita (ponta solta nova) e tubo curto demais para as conexões */
    var n0 = {}; R0.pontasLivres.forEach(function (l) { n0[l.trecho] = (n0[l.trecho] || 0) + 1; });
    var n1 = {}; R1.pontasLivres.forEach(function (l) { n1[l.trecho] = (n1[l.trecho] || 0) + 1; });
    var quebras = Object.keys(n1).filter(function (id) { return n1[id] > (n0[id] || 0); });
    var curtos = [];
    tNovos.forEach(function (t) {
      if (mudaram.indexOf(t.id) < 0 && !pontes.some(function (p) { return p.id === t.id; })) return;
      var L = dist(t.p1, t.p2), zp = { p1: 0, p2: 0 };
      R1.conexoes.forEach(function (c) {
        if (arr(c.ramos).indexOf(t.id) < 0) return;
        ["p1", "p2"].forEach(function (k) { if (dist(c, t[k]) <= TOL) zp[k] = Math.max(zp[k], zConexao(c, t.dn)); });
      });
      var z = zp.p1 + zp.p2;
      var livre = L - z, pb = bolsaTubo(t);
      if (livre < pb) curtos.push({ id: t.id, comprimento: r4(L), livre: r4(livre), bolsa: r4(pb) });
    });
    curtos.forEach(function (c) { avisos.push("o tubo " + c.id + " ficou CURTO: " + fmt(c.comprimento * 100, 1) + " cm, sobram " + fmt(Math.max(0, c.livre) * 100, 1) + " cm entre as conexões (a bolsa pede " + fmt(c.bolsa * 100, 1) + " cm)"); });
    quebras.forEach(function (id) { avisos.push("a ligação do tubo " + id + " se desfaz (ponta solta nova)"); });
    var res = { ok: true, erro: "", ops: ops, avisos: avisos, conflitos: conflitos, corrigir: [], confirmar: false, curtos: curtos, quebras: quebras, trocas: trocas, angulos: angulos,
                mudaram: mudaram, pontes: pontes.map(function (p) { return p.id; }), d: r4p(d), modo: modo, estado1: E1 };
    if (conflitos.length && modo !== "mudarSaida") {
      res.ok = false; res.ops = [];
      res.erro = "Não cabe: " + conflitos[0].texto + " — a jusante precisa descer " + fmt(conflitos[0].falta * 100, 1) + " cm.";
      if (!opts._semCorrigir) res.corrigir = corrigir(estado, avaliarFam, alvos, d, opts, res);
      return res;
    }
    if ((curtos.length || quebras.length || angulos.length) && !opts.confirmar) {
      res.ok = false; res.confirmar = true;
      res.erro = (curtos.length ? "O tubo " + curtos[0].id + " fica mais curto que as bolsas das conexões" : (quebras.length ? "A ligação do tubo " + quebras[0] + " se desfaz" :
        "Fica um ângulo de " + fmt(180 - angulos[0].angulo, 1) + "° entre " + angulos[0].ramos.join(" × ") + " sem conexão que o faça")) + ": confirme para aplicar mesmo assim.";
    }
    return res;
  }
  /* as opções do Corrigir quando a descida bate na saída fixa — cada uma já com as ops (a tela só aplica) */
  function corrigir(estado, avaliarFam, alvos, d, opts, res0) {
    var out = [], base = {}; Object.keys(opts || {}).forEach(function (k) { base[k] = opts[k]; }); base._semCorrigir = true; base.confirmar = true;
    function com(m) { var o = {}; Object.keys(base).forEach(function (k) { o[k] = base[k]; }); o.inclinacao = m; return o; }
    var I = BI(), c0 = res0.conflitos[0];
    var ra = arrastar(estado, avaliarFam, alvos, d, com("aceitar"));
    out.push({ id: "aceitar", rotulo: "Aceitar a inclinação menor (na mínima do DN)", ok: !!ra.ok, ops: ra.ok ? ra.ops : [], avisos: ra.avisos, erro: ra.ok ? "" : (ra.erro || "ainda não cabe") });
    var rm = arrastar(estado, avaliarFam, alvos, d, com("mudarSaida"));
    var aparelho = rm.conflitos && rm.conflitos.some(function (c) { return c.tipo === "aparelho" || c.tipo === "tubo"; });
    out.push({ id: "mudarSaida", rotulo: "Descer a cota de saída (" + fmt(c0.falta * 100, 1) + " cm)", ok: !!rm.ops.length && !aparelho, ops: !aparelho ? rm.ops : [], avisos: rm.avisos, erro: aparelho ? "a saída é ponto de aparelho ou junção num tubo: não desce" : "" });
    /* rota alternativa: o trecho que chega na saída fixa é refeito pelo traçado automático (js/hidligar.js) */
    var L = dep("HidLigar", "./hidligar.js"), rr = null, W = c0 && c0.trecho ? (res0.estado1.instalacoes.trechos.filter(function (t) { return t.id === c0.trecho; })[0]) : null;
    if (L && L.ligar && W && (c0.tipo === "peca" || c0.tipo === "continua")) {
      try {
        var semW = {}; Object.keys(res0.estado1).forEach(function (k) { semW[k] = res0.estado1[k]; });
        semW.instalacoes = {}; Object.keys(res0.estado1.instalacoes).forEach(function (k) { semW.instalacoes[k] = res0.estado1.instalacoes[k]; });
        semW.instalacoes.trechos = res0.estado1.instalacoes.trechos.filter(function (t) { return t.id !== W.id; });
        var A = { tipo: "ponta", trecho: W.id, x: W.p1.x, y: W.p1.y, z: W.p1.z, sistema: W.sistema, dn: W.dn };
        var Bp = c0.tipo === "peca" ? { tipo: "peca", id: c0.id, x: c0.x, y: c0.y, z: c0.z, sistema: W.sistema, dn: W.dn } : { tipo: "ponta", x: W.p2.x, y: W.p2.y, z: W.p2.z, sistema: W.sistema, dn: W.dn };
        rr = L.ligar(semW, avaliarFam, A, Bp, { piso: W.p1.y });
      } catch (e) { rr = null; }
    }
    if (rr && rr.ok && rr.opcoes.length) {
      var ra2 = arrastar(estado, avaliarFam, alvos, d, com("mudarSaida"));
      /* o arraste sem a descida da saída: as ops de antes do conflito, sem o trecho W (a rota o substitui) */
      var manter = arrastar(estado, avaliarFam, alvos, d, com("aceitar"));
      var baseOps = (manter.ops.length ? manter.ops : ra2.ops).filter(function (o) { return o.id !== W.id && !(o.op === "peca" && o.id === c0.id); });
      out.push({ id: "rota", rotulo: "Rota alternativa até a saída (" + rr.opcoes[0].nome + ")", ok: true, ops: baseOps.concat([{ op: "apagar", id: W.id }]).concat(rr.opcoes[0].ops), avisos: rr.opcoes[0].avisos || [] });
    } else out.push({ id: "rota", rotulo: "Rota alternativa até a saída", ok: false, ops: [], erro: rr && rr.erro ? rr.erro : "o traçado automático não achou outra rota" });
    return out;
  }

  /* ================================================================ ENCAIXE MAGNÉTICO
   * O eixo do tubo arrastado (ou o ponto, no tubo vertical/conexão) encaixa: em outro tubo PARALELO (alinhado), na
   * face da parede (tubo encostado: o eixo a DE/2 da face), no eixo da parede (embutido) e nos eixos da grade.
   * opts.tol (m), opts.ref = { a, b } (o eixo arrastado, em planta) ou { p } (ponto). Só a componente NORMAL ao eixo
   * é encaixada (a de ao longo do eixo fica como o mouse). */
  function linhasDe(estado, fora, de) {
    var L = [], ins = (estado && estado.instalacoes) || {};
    arr(ins.trechos).forEach(function (t) { if (fora[t.id] || hlen(t.p1, t.p2) <= 0.02) return; L.push({ a: { x: t.p1.x, z: t.p1.z }, b: { x: t.p2.x, z: t.p2.z }, tipo: "tubo", texto: "alinhado ao tubo " + t.id }); });
    arr(estado && estado.caixas).forEach(function (c) {
      if (c.tipo !== "parede" || !(c.comprimento > 0)) return;
      var co = Math.cos(c.rotY || 0), si = Math.sin(c.rotY || 0), ux = co, uz = -si, nx = -uz, nz = ux, h = c.comprimento / 2, e = (c.espessura || 0) / 2;
      function lin(off, tipo, texto) { L.push({ a: { x: c.cx - ux * h + nx * off, z: c.cz - uz * h + nz * off }, b: { x: c.cx + ux * h + nx * off, z: c.cz + uz * h + nz * off }, tipo: tipo, texto: texto, parede: c.id, face: Math.abs(off) - (tipo === "face" ? 0 : 0) }); }
      lin(0, "eixoParede", "no eixo da parede (embutido)");
      [1, -1].forEach(function (s) { lin(s * (e + de / 2), "face", "encostado na parede (face a " + fmt(de / 2 * 100, 1) + " cm do eixo)"); L[L.length - 1].faceOff = s * e; L[L.length - 1].cx = c; });
    });
    arr(estado && estado.eixos).forEach(function (e) { L.push({ a: { x: e.x0, z: e.z0 }, b: { x: e.x1, z: e.z1 }, tipo: "eixo", texto: "no eixo " + e.nome }); });
    return L;
  }
  function encaixe(estado, alvos, d, opts) {
    opts = opts || {};
    var tol = num(opts.tol, 0.08), fora = {}, ins = (estado && estado.instalacoes) || {}, porT = {};
    arr(ins.trechos).forEach(function (t) { porT[t.id] = t; });
    arr(alvos).forEach(function (a) { fora[txt(a).replace(/^edit:/, "")] = 1; });
    var ref = opts.ref, de = num(opts.de, 0.05);
    if (!ref) {
      var t0 = arr(alvos).map(function (a) { return porT[txt(a).replace(/^edit:/, "")]; }).filter(Boolean)[0];
      if (t0) { de = num(opts.de, 0) || (t0.dn || 50) / 1000; ref = hlen(t0.p1, t0.p2) > 0.02 ? { a: { x: t0.p1.x, z: t0.p1.z }, b: { x: t0.p2.x, z: t0.p2.z } } : { p: { x: t0.p1.x, z: t0.p1.z } }; }
    }
    var out = { d: { x: d.x, y: d.y || 0, z: d.z }, guia: null, distParede: null };
    if (!ref) return out;
    var L = linhasDe(estado, fora, de);
    function nrm(a, b) { var dx = b.x - a.x, dz = b.z - a.z, l = Math.sqrt(dx * dx + dz * dz) || 1; return { ux: dx / l, uz: dz / l, nx: -dz / l, nz: dx / l }; }
    var cands = [];
    if (ref.a) {
      var R = nrm(ref.a, ref.b), A = { x: ref.a.x + d.x, z: ref.a.z + d.z };
      L.forEach(function (l) {
        var N = nrm(l.a, l.b); if (Math.abs(R.ux * N.uz - R.uz * N.ux) > 0.01) return;   /* só paralela */
        var delta = (A.x - l.a.x) * R.nx + (A.z - l.a.z) * R.nz;
        cands.push({ l: l, delta: delta, n: { x: R.nx, z: R.nz } });
      });
    } else {
      var Q = { x: ref.p.x + d.x, z: ref.p.z + d.z };
      L.forEach(function (l) { var N = nrm(l.a, l.b); cands.push({ l: l, delta: (Q.x - l.a.x) * N.nx + (Q.z - l.a.z) * N.nz, n: { x: N.nx, z: N.nz } }); });
    }
    /* a distância à face de parede mais perto (a cota temporária), com ou sem encaixe */
    cands.forEach(function (c) { if (c.l.tipo === "face") { var df = Math.abs(c.delta) + de / 2; if (out.distParede == null || df < out.distParede) out.distParede = r4(df); } });
    var ok = cands.filter(function (c) { return Math.abs(c.delta) <= tol; }).sort(function (a, b) { return Math.abs(a.delta) - Math.abs(b.delta); });
    if (!ok.length) return out;
    var c1 = ok[0]; out.d.x = r4(d.x - c1.delta * c1.n.x); out.d.z = r4(d.z - c1.delta * c1.n.z); out.guia = { tipo: c1.l.tipo, texto: c1.l.texto, a: c1.l.a, b: c1.l.b };
    if (!ref.a) {   /* ponto: um segundo encaixe numa linha que cruza a primeira */
      var Q2 = { x: ref.p.x + out.d.x, z: ref.p.z + out.d.z }, n1 = c1.n;
      var c2 = ok.slice(1).filter(function (c) { return Math.abs(c.n.x * n1.z - c.n.z * n1.x) > 0.5; })[0];
      if (c2) { var del2 = (Q2.x - c2.l.a.x) * c2.n.x + (Q2.z - c2.l.a.z) * c2.n.z; out.d.x = r4(out.d.x - del2 * c2.n.x); out.d.z = r4(out.d.z - del2 * c2.n.z); out.guia.texto += " · " + c2.l.texto; }
    }
    if (c1.l.tipo === "face") out.distParede = r4(de / 2);
    return out;
  }

  var BimInstArr = { VERSAO: 1, arrastar: arrastar, encaixe: encaixe, _interior: interior };

  /* ================================================================ A TELA (navegador) */
  if (typeof document !== "undefined") {
    var B = function () { return global.BIM || null; };
    var status = function (t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} };
    var UI = {
      _a: null, _ultimo: null, _painel: null, _cota: null, _rot: null,
      /* este uid se arrasta? (tubo, conexão ou caixa das instalações; não o registro) */
      pode: function (uid) {
        var U = global.BimInstUI, b = B(), s = txt(uid);
        if (!U || !U.ehInst || !b || !/^edit:/.test(s) || /^edit:ac\d/.test(s)) return false;
        if (U._previaHidro && !U._previaHidro()) return false;   /* P8 (junção 18/10/2026): arrastar o tubo com a rede só com a prévia hidro */
        try { var e = b.editarEstado ? b.editarEstado() : null; if (!e || !e.estado) return false; } catch (x) { return false; }
        return !!U.ehInst(s);
      },
      _est: function () { var b = B(); try { var e = b.editarEstado(); return e ? e.estado : null; } catch (x) { return null; } },
      _aval: function () { var b = B(); return function (f, t, i) { return b.familiaAvaliar(f, t, i); }; },
      _def: function (vis) { var D = global.Bim2D; return D && D.def ? D.def(vis) : null; },
      /* o ponto do MUNDO sob o mouse na vista do arraste */
      _ponto: function (ev) {
        var a = this._a, b = B(); if (!a || !ev) return null;
        if (a.vista === "3d") { var q = b && b.pontoPlanoY ? b.pontoPlanoY(ev.clientX, ev.clientY, a.y0) : null; return q ? { x: q.x, y: a.y0, z: q.z } : null; }
        var D = global.Bim2D, c = D && D._cache ? D._cache[a.vista] : null, sv = c && (c.svg || (c.el && c.el.querySelector ? c.el.querySelector("svg") : null));
        if (!sv || !sv.getScreenCTM) return null;
        var m = sv.getScreenCTM(); if (!m) return null;
        var pt = sv.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY; var p = pt.matrixTransform(m.inverse()), def = this._def(a.vista);
        if (!def) return null;
        if (def.tipo === "planta") return { x: (def.p6 === "forro" || def.p6base === "forro") ? -p.x : p.x, y: a.y0, z: p.y };
        var K = global.BimInstCon; return K && K.doDesenho ? K.doDesenho(def, { x: p.x, y: p.y }) : null;
      },
      /* o arraste começa (o gancho da vista chama: vista = "3d" ou o id da vista 2D; P = o ponto do 3D, se houver) */
      iniciar: function (vista, uid, ev, P) {
        var b = B(), U = global.BimInstUI; if (!b || !U || !this.pode(uid)) return false;
        this.fecharPainel(); this._fecharCota();
        var sel = (b.selecao().uids || []).filter(function (u) { return /^edit:/.test(u) && !/^edit:ac\d/.test(u) && U.ehInst(u); });
        if (sel.indexOf(uid) < 0) { b.selecionar([uid], "trocar"); sel = [uid]; }
        var E = this._est(); if (!E) return false;
        var id = uid.slice(5), t = arr(E.instalacoes && E.instalacoes.trechos).filter(function (x) { return x.id === id; })[0];
        this._a = { vista: vista, uid: uid, alvos: sel.slice(), E: E, y0: 0, base: null, d: { x: 0, y: 0, z: 0 }, dig: "", res: null, ponta: null, t: t, ev: null };
        var a = this._a;
        a.y0 = P && isFinite(P.y) ? P.y : (t ? (t.p1.y + t.p2.y) / 2 : 0);
        var base = vista === "3d" ? (P ? { x: P.x, y: a.y0, z: P.z } : this._ponto(ev)) : this._ponto(ev);
        if (!base) { this._a = null; return false; }
        a.base = base;
        /* PONTA: um tubo só, pegado perto da ponta → estica/encurta só ele */
        if (t && sel.length === 1) {
          var L = dist(t.p1, t.p2), lim = Math.max(0.12, 0.15 * L), pl = vista === "3d" || this._def(vista) && this._def(vista).tipo === "planta";
          var dd = function (q) { return pl ? hlen(base, q) : dist(base, q); };
          if (!(pl && hlen(t.p1, t.p2) <= 0.02) && L > 3 * lim / 1.5) { if (dd(t.p1) <= lim) a.ponta = "p1"; else if (dd(t.p2) <= lim) a.ponta = "p2"; }
        }
        status((a.ponta ? "Esticando a ponta do tubo " + id : "Arrastando " + (sel.length > 1 ? sel.length + " peças" : (t ? "o tubo " + id : "a peça"))) + " — digite a distância e Enter; Esc cancela.");
        this._teclas(true);
        return true;
      },
      /* o deslocamento do mouse, com a trava (paralelo ao tubo), o encaixe e a distância digitada */
      _desloc: function (P, livre) {
        var a = this._a, d = sub(P, a.base), t = a.t;
        if (a.vista === "3d" || (this._def(a.vista) && this._def(a.vista).tipo === "planta")) d.y = 0;
        else if (!livre) { var h = Math.sqrt(d.x * d.x + d.z * d.z); if (h < 0.35 * Math.abs(d.y)) { d.x = 0; d.z = 0; } else if (Math.abs(d.y) < 0.35 * h) d.y = 0; }
        if (t && !a.ponta && a.vista !== "3d" && !(this._def(a.vista) && this._def(a.vista).tipo === "planta")) { /* corte: como está */ }
        else if (t && !a.ponta && hlen(t.p1, t.p2) > 0.02 && !livre) {
          var u = unit({ x: t.p1.x, y: 0, z: t.p1.z }, { x: t.p2.x, y: 0, z: t.p2.z }), ax = d.x * u.x + d.z * u.z, nx = -u.z, nz = u.x, no = d.x * nx + d.z * nz;
          if (Math.abs(ax) < 0.4 * Math.abs(no)) ax = 0; else if (Math.abs(no) < 0.4 * Math.abs(ax)) no = 0;
          d.x = ax * u.x + no * nx; d.z = ax * u.z + no * nz;
        }
        var guia = null, dp = null;
        if (!a.ponta && (d.y === 0) && !livre) {
          var px = this._pxM(); var en = encaixe(a.E, a.alvos, d, { tol: 12 * px });
          d = en.d; guia = en.guia; dp = en.distParede;
        }
        var Ld = Math.sqrt(d.x * d.x + d.y * d.y + d.z * d.z);
        if (a.dig && Ld > 1e-6) { var v = num(a.dig.replace(",", "."), NaN); if (isFinite(v) && v > 0) d = mul(d, v / Ld); }
        return { d: d, guia: guia, distParede: dp };
      },
      /* metros por pixel na vista do arraste (o encaixe é de ~12 px) */
      _pxM: function () {
        var a = this._a, b = B();
        if (a.vista === "3d") { var q1 = b.telaDe(a.base.x, a.base.y, a.base.z), q2 = b.telaDe(a.base.x + 1, a.base.y, a.base.z); var px = q1 && q2 ? Math.sqrt(Math.pow(q2.x - q1.x, 2) + Math.pow(q2.y - q1.y, 2)) : 100; return 1 / Math.max(px, 1); }
        var D = global.Bim2D, c = D && D._cache ? D._cache[a.vista] : null, sv = c && (c.svg || (c.el && c.el.querySelector ? c.el.querySelector("svg") : null)), m = sv && sv.getScreenCTM ? sv.getScreenCTM() : null;
        return m && m.a > 0 ? 1 / m.a : 0.01;
      },
      mover: function (ev) {
        var a = this._a; if (!a) return false;
        a.ev = { clientX: ev.clientX, clientY: ev.clientY, shiftKey: !!ev.shiftKey, altKey: !!ev.altKey };
        if (a.raf) return true;
        var self = this;
        a.raf = (typeof requestAnimationFrame === "function" ? requestAnimationFrame : setTimeout)(function () { a.raf = null; self._calcular(); }, 16);
        return true;
      },
      _calcular: function () {
        var a = this._a, b = B(); if (!a || !a.ev) return;
        var P = this._ponto(a.ev); if (!P) return;
        var r = this._desloc(P, a.ev.shiftKey || a.ev.altKey);
        a.d = r.d; a.guia = r.guia; a.distParede = r.distParede;
        /* a prévia sem as opções do Corrigir (elas rodam o traçado automático: só no soltar) */
        a.res = len(a.d) > 1e-4 ? arrastar(a.E, this._aval(), a.alvos, a.d, { ponta: a.ponta, _semCorrigir: true }) : null;
        try { b.editarPreviaInst(a.res && a.res.ops.length ? a.res.ops : []); } catch (e) {}
        this._rotulo(a.ev, a);
      },
      /* a cota TEMPORÁRIA ao lado do cursor: a distância movida (ou a digitada), a parede e o encaixe */
      _rotulo: function (ev, a) {
        if (!this._rot) { this._rot = document.createElement("div"); this._rot.className = "bim-inst-arr-cota"; this._rot.style.cssText = "position:fixed;z-index:60;pointer-events:none;background:#0b3b5c;color:#fff;font:600 12px/1.3 sans-serif;padding:3px 7px;border-radius:4px;box-shadow:0 1px 4px rgba(0,0,0,.35);white-space:nowrap"; document.body.appendChild(this._rot); }
        var Ld = len(a.d), t = (a.dig ? "⌨ " + a.dig + " m" : "↔ " + fmt(Ld) + " m") + (a.distParede != null ? " · parede " + fmt(a.distParede * 100, 1) + " cm" : "") + (a.guia ? " · " + a.guia.texto : "");
        if (a.res && !a.res.ok && a.res.erro) t += " · ⚠ " + a.res.erro;
        else if (a.res && a.res.trocas && a.res.trocas.length) t += " · ⚠ conexão trocada";
        this._rot.textContent = t; this._rot.style.left = (ev.clientX + 16) + "px"; this._rot.style.top = (ev.clientY + 14) + "px"; this._rot.style.display = "block";
        this._rot.setAttribute("data-dist", String(r4(Ld)));
        status("Arrastando: " + t + " (Esc cancela).");
      },
      _tirarRotulo: function () { if (this._rot) this._rot.style.display = "none"; },
      /* digitar a distância durante o arraste */
      _teclas: function (on) {
        var self = this;
        if (!this._tk) this._tk = function (e) {
          var a = self._a; if (!a) return;
          if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); self.cancelar(); return; }
          if (/^[0-9]$/.test(e.key) || e.key === "," || e.key === ".") { a.dig += e.key; }
          else if (e.key === "Backspace") a.dig = a.dig.slice(0, -1);
          else if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); self._calcular(); self.soltar(null); return; }
          else return;
          e.preventDefault(); e.stopPropagation(); self._calcular();
        };
        if (on) document.addEventListener("keydown", this._tk, true); else document.removeEventListener("keydown", this._tk, true);
      },
      cancelar: function () {
        var a = this._a, b = B(); if (!a) return false;
        this._a = null; this._teclas(false); this._tirarRotulo();
        try { b.editarPreviaInst([]); } catch (e) {}
        status("Arraste cancelado.");
        return true;
      },
      /* soltar: aplica (um lote), ou abre o Corrigir / a confirmação */
      soltar: function (ev) {
        var a = this._a, b = B(); if (!a) return false;
        if (ev && ev.clientX != null) { a.ev = { clientX: ev.clientX, clientY: ev.clientY, shiftKey: !!ev.shiftKey, altKey: !!ev.altKey }; this._calcular(); }
        this._a = null; this._teclas(false); this._tirarRotulo();
        try { b.editarPreviaInst([]); } catch (e) {}
        if (len(a.d) < 1e-4) { status("Nada foi movido."); return true; }
        var r = arrastar(a.E, this._aval(), a.alvos, a.d, { ponta: a.ponta });
        var info = { alvos: a.alvos, d: a.d, ponta: a.ponta, x: a.ev ? a.ev.clientX : 200, y: a.ev ? a.ev.clientY : 200 };
        if (r.ok) { this.aplicar(r.ops, r.avisos, info); return true; }
        if (r.conflitos && r.conflitos.length) { this.painel(r, info); return true; }
        if (r.confirmar) { this.painel(r, info); return true; }
        status("Arrastar: " + r.erro);
        return true;
      },
      aplicar: function (ops, avisos, info) {
        var b = B(); if (!ops || !ops.length) { status("Nada mudou."); return false; }
        var ok = b.editarLote({ op: "lote", id: "hid-arrastar-" + Date.now(), origem: "hidarrastar", ops: JSON.parse(JSON.stringify(ops)) });
        var t = ok ? "Arrastado " + fmt(len(info.d)) + " m: " + ops.length + " peça(s) ajustada(s)" + (avisos && avisos.length ? " — " + avisos.slice(0, 3).join("; ") : "") + " (um Ctrl+Z desfaz)." : "Não foi possível gravar o arraste.";
        status(t);
        if (ok) { try { b.selecionar(info.alvos, "trocar"); } catch (e) {} this._ultimo = info; this._mostrarCota(info); }
        return ok;
      },
      /* depois de soltar: a cota da distância fica EDITÁVEL (digite e Enter refaz o arraste com o valor exato) */
      _mostrarCota: function (info) {
        this._fecharCota();
        var self = this, w = document.createElement("div");
        w.className = "bim-inst-arr-editar"; w.style.cssText = "position:fixed;z-index:61;left:" + (info.x + 16) + "px;top:" + (info.y + 14) + "px;background:#fff;border:1px solid #0b3b5c;border-radius:4px;padding:2px 4px;font:12px sans-serif;box-shadow:0 1px 4px rgba(0,0,0,.3)";
        w.innerHTML = '↔ <input data-arr-dist type="text" inputmode="decimal" style="width:5em;font:12px sans-serif" value="' + fmt(len(info.d), 3) + '"> m';
        document.body.appendChild(w); this._cota = w;
        var inp = w.querySelector("input");
        inp.addEventListener("keydown", function (e) {
          if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); self.refazerCom(num(inp.value.replace(",", "."), NaN)); }
          else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); self._fecharCota(); }
        });
        this._tCota = setTimeout(function () { if (self._cota === w && global.document.activeElement !== inp) self._fecharCota(); }, 8000);
      },
      _fecharCota: function () { if (this._cota && this._cota.parentNode) this._cota.parentNode.removeChild(this._cota); this._cota = null; if (this._tCota) clearTimeout(this._tCota); },
      /* desfaz o último arraste e refaz com a distância digitada, na mesma direção */
      refazerCom: function (v) {
        var u = this._ultimo, b = B(); if (!u || !(v > 0)) return false;
        var L = len(u.d); if (L < 1e-6) return false;
        if (!b.desfazer()) return false;
        var E = this._est(), d = mul(u.d, v / L), r = arrastar(E, this._aval(), u.alvos, d, { ponta: u.ponta, confirmar: true });
        this._fecharCota();
        if (!r.ok) { status("Arrastar " + fmt(v, 3) + " m: " + r.erro); this.painel(r, { alvos: u.alvos, d: d, ponta: u.ponta, x: u.x, y: u.y }); return false; }
        return this.aplicar(r.ops, r.avisos, { alvos: u.alvos, d: d, ponta: u.ponta, x: u.x, y: u.y });
      },
      /* o CORRIGIR (o que é + as opções + Mostrar) e a confirmação de tubo curto / ligação desfeita */
      painel: function (r, info) {
        this.fecharPainel();
        var self = this, w = document.createElement("div"), I = BI();
        w.className = "bim-inst-arr-painel"; w.setAttribute("role", "dialog");
        w.style.cssText = "position:fixed;z-index:62;left:50%;bottom:64px;transform:translateX(-50%);max-width:560px;background:#fff;border:2px solid #b45309;border-radius:8px;padding:10px 12px;font:13px/1.35 sans-serif;color:#222;box-shadow:0 4px 18px rgba(0,0,0,.3)";
        var h = '<div style="font-weight:700;margin-bottom:4px">⚠ ' + (r.conflitos && r.conflitos.length ? "O arraste não cabe" : "Confirmar o arraste") + "</div><div data-arr-erro>" + r.erro + "</div>";
        if (r.avisos && r.avisos.length) h += '<div style="color:#555;font-size:12px;margin-top:4px">' + r.avisos.slice(0, 4).join("<br>") + "</div>";
        h += '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">';
        if (r.conflitos && r.conflitos.length) arr(r.corrigir).forEach(function (o) { h += '<button type="button" class="btn sm" data-arr-op="' + o.id + '"' + (o.ok ? "" : ' disabled title="' + txt(o.erro).replace(/"/g, "'") + '"') + ">" + o.rotulo + "</button>"; });
        else h += '<button type="button" class="btn sm" data-arr-op="confirmar">Aplicar mesmo assim</button>';
        h += '<button type="button" class="btn sm" data-arr-op="mostrar">Mostrar</button><button type="button" class="btn sm" data-arr-op="cancelar">Cancelar</button></div>';
        w.innerHTML = h; document.body.appendChild(w); this._painel = w; this._painelR = r;
        w.addEventListener("click", function (e) {
          var bt = e.target && e.target.closest ? e.target.closest("[data-arr-op]") : null; if (!bt || bt.disabled) return;
          var k = bt.getAttribute("data-arr-op"), b = B();
          if (k === "cancelar") { self.fecharPainel(); status("Arraste cancelado: nada mudou."); return; }
          if (k === "mostrar") {
            var c = r.conflitos && r.conflitos[0], alvo = c ? (c.trecho || c.id) : (r.curtos[0] ? r.curtos[0].id : r.quebras[0]);
            try { if (alvo) b.selecionar(["edit:" + alvo], "trocar"); if (alvo && b.focar) b.focar("edit:" + alvo); } catch (eM) {}
            return;
          }
          if (k === "confirmar") { self.fecharPainel(); self.aplicar(r.ops, r.avisos, info); return; }
          var o = arr(r.corrigir).filter(function (x) { return x.id === k; })[0];
          if (o && o.ok) { self.fecharPainel(); self.aplicar(o.ops, o.avisos, info); }
        });
        status("Arrastar: " + r.erro);
      },
      fecharPainel: function () { if (this._painel && this._painel.parentNode) this._painel.parentNode.removeChild(this._painel); this._painel = null; },
      /* a ALÇA do meio do tubo (js/biminstcon.js): arrasta na vista ativa com os eventos do documento */
      iniciarAlca: function (uid, ev, P) {
        var tela = document.querySelector('.bim-tela[data-ativa="1"]'), vis = tela ? tela.getAttribute("data-vista") : "3d";
        if (!vis) vis = "3d";
        if (!this.iniciar(vis, uid, ev, vis === "3d" ? P : null)) return false;
        this._a.ponta = null;
        var self = this;
        function mv(e) { self.mover(e); }
        function up(e) { document.removeEventListener("pointermove", mv, true); document.removeEventListener("pointerup", up, true); self.soltar(e); }
        document.addEventListener("pointermove", mv, true); document.addEventListener("pointerup", up, true);
        return true;
      },
      arrastando: function () { return !!this._a; }
    };
    Object.keys(UI).forEach(function (k) { BimInstArr[k] = UI[k]; });
  }

  global.BimInstArr = BimInstArr;
  if (typeof module !== "undefined" && module.exports) module.exports = BimInstArr;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
