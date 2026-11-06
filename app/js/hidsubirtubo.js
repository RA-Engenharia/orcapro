/* =====================================================================
 * hidsubirtubo.js — SUBIR / DESCER UM TRECHO DE TUBO (motor puro, Node-testável; 06/11/2026)
 *
 * PEDIDO DO ROGÉRIO: "Quando a gente pegar um tubo que está embaixo e achar que está muito baixo, clicar nele, ele subir, e ele
 * subir o restante que precisa subir junto ali."
 *
 * subirTrecho(estado, tuboId, dz, opcoes) -> { ok, erro, ops, desfazer, avisos, ids, resumo, mensagem, estado }
 *   · o TRECHO = o tubo clicado + os horizontais encadeados a ele pelos nós (tê, joelho, luva…) até uma vertical, uma ponta solta, um
 *     aparelho ou um ponto fixo. Tudo sobe `dz` (m; negativo = descer) — as pontas dos dois lados de cada tubo andam juntas, então a
 *     DECLIVIDADE de cada tubo (esgoto, pluvial, dreno) fica a mesma.
 *   · as VERTICAIS ligadas ao trecho esticam ou encolhem: a ponta no trecho acompanha, a outra fica. Se a vertical ficaria menor que
 *     o mínimo (5 cm, ou as pernas das curvas/joelhos 90° das duas pontas), o trecho do OUTRO lado dela sobe junto (a vertical só
 *     se desloca) — e assim por diante, com limite de segurança.
 *   · PONTO FIXO (aparelho, ralo, caixa de inspeção, espera de rede = ponta que "continua", registro na vertical) nunca se move: se
 *     o movimento exigir mexer nele, o pedido é RECUSADO com o motivo.
 *   · as conexões são deduzidas da geometria (BimInst.rede) — as das pontas que andam acompanham sozinhas. Registro (acessório) em
 *     linha anda junto com o tubo (instAlterar dy).
 *   · conferências: declividade mínima do DN, laje/piso (o tubo não entra na espessura), cota máxima (opcoes.tetoY) e o auditor
 *     de projetista (js/hidcriterios.js: viga, pilar, abertura) — o que o movimento PIORA recusa; o que já estava assim vira aviso.
 * Nada é gravado aqui: devolve as ops (um lote, um Ctrl+Z) e as ops inversas (`desfazer`).
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arquivo) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arquivo); } catch (e) {} }
    return null;
  }
  function BI() { return dep("BimInst", "./biminst.js"); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { if (v === null || v === undefined || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function r4(v) { return Math.round(v * 10000) / 10000; }   // hid:ok o biminst grava as cotas com 4 casas (0,1 mm)
  function cm(v) { return String(Math.round(Math.abs(v) * 1000) / 10).replace(".", ","); }   // hid:ok m → cm com 1 casa
  function d3(a, b) { var x = a.x - b.x, y = a.y - b.y, z = a.z - b.z; return Math.sqrt(x * x + y * y + z * z); }

  var PADRAO_CM = 5;                 // hid:ok valor inicial do campo da tela
  var MIN_VERTICAL = 0.05;           // hid:ok vertical mínima (m): a queda mínima genérica do traçado
  var LIMITE_TRECHOS = 400;          // hid:ok segurança: mais que isto não é "um trecho" (laço ou rede inteira)
  var LIMITE_PASSADAS = 80;          // hid:ok segurança contra laço na propagação
  var FOLGA_VIGA = 0.001;            // hid:ok folga numérica nas comparações de cota (m)
  var FORA = { eletrica: 1, ar: 1, frigorigeno: 1, bandeja: 1 };   // sistemas que não são hidrossanitários
  var DERIVADOS = ["comprimento", "comprimentoH", "desnivel", "inclinacao", "vertical", "diametro", "avisos", "aplicacaoAuto"];   // o biminst recalcula

  /* a op completa de um trecho (todos os campos gravados, sem os derivados) com os pontos dados */
  function opCompleta(t, p1, p2) {
    var o = { op: "trecho" };
    Object.keys(t).forEach(function (k) { if (DERIVADOS.indexOf(k) < 0 && t[k] !== undefined) o[k] = JSON.parse(JSON.stringify(t[k])); });
    o.p1 = { x: p1.x, y: p1.y, z: p1.z }; o.p2 = { x: p2.x, y: p2.y, z: p2.z };
    if (t.aplicacaoAuto) delete o.aplicacao;   /* a aplicação automática continua automática (o biminst a recalcula) — gravar o valor a tornaria fixa */
    return o;
  }
  function recusa(erro, avisos) { return { ok: false, erro: erro, ops: [], desfazer: [], avisos: arr(avisos), ids: [], resumo: null, mensagem: erro }; }

  /* o ponto q está no INTERIOR do segmento a–b (a mais de `tol` das pontas e a até `tol` do eixo)? */
  function noInterior(q, a, b, tol) {
    var ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, L2 = ux * ux + uy * uy + uz * uz; if (!(L2 > 0)) return false;
    var s = ((q.x - a.x) * ux + (q.y - a.y) * uy + (q.z - a.z) * uz) / L2, L = Math.sqrt(L2);
    if (s * L <= tol || (1 - s) * L <= tol) return false;
    return d3({ x: a.x + ux * s, y: a.y + uy * s, z: a.z + uz * s }, q) <= tol;
  }

  /* a perna (m) da curva/joelho 90° da conexão `c` no catálogo (a face da bolsa); 0 se não é 90° ou não há medida */
  function pernaDe(c) {
    if (!c || !/^(curva|joelho)90/.test(String(c.tipo))) return 0;   // hid:ok tipo de peça (curva/joelho 90°)
    var G = dep("HidGeo", "./biminstgeo.js"); if (!G || !G.cotasConexao) return 0;
    try { var k = G.cotasConexao(c.material, c.tipo, Math.round(num(c.dn, 0))); return k && k.z > 0 ? k.z / 1000 : 0; } catch (e) { return 0; }   // hid:ok mm → m
  }

  function subirTrecho(estado, tuboId, dz, opcoes) {
    opcoes = opcoes || {};
    var B = BI(); if (!B) return recusa("O motor das instalações não está carregado.");
    var id0 = String(tuboId == null ? "" : tuboId).replace(/^edit:/, ""), TOL = B.TOL || 0.02;   // hid:ok tolerância geométrica de nó (m)
    dz = Number(dz);
    if (!isFinite(dz) || Math.abs(dz) < 1e-6) return recusa("Informe quanto subir ou descer (em cm).");   // hid:ok zero numérico
    var ins = (estado && estado.instalacoes) || {}, trechos = arr(ins.trechos), porId = {};
    trechos.forEach(function (t) { porId[t.id] = t; });
    var t0 = porId[id0];
    if (!t0) return recusa("Tubo " + id0 + " não encontrado nas instalações.");
    if (FORA[t0.sistema]) return recusa("Subir trecho vale para os tubos do hidrossanitário (o " + id0 + " é de " + ((B.SISTEMAS[t0.sistema] || {}).nome || t0.sistema) + ").");
    if (t0.vertical) return recusa("O tubo " + id0 + " é vertical: selecione o ramal horizontal ligado a ele para subir ou descer o trecho.");
    var verbo = dz > 0 ? "subir" : "descer", avisos = [];
    var minVert = num(opcoes.minVertical, MIN_VERTICAL);

    /* ---- os NÓS: pontas que se tocam (2 cm), por sistema — trechos e faces dos registros */
    var nos = [], grade = {};
    function cel(v) { return Math.floor(v / (TOL * 2)); }
    function chaveCel(a, b, c) { return a + "," + b + "," + c; }
    function noEm(p, sis, criar) {
      var cx = cel(p.x), cy = cel(p.y), cz = cel(p.z);
      for (var i = -1; i <= 1; i++) for (var j = -1; j <= 1; j++) for (var k = -1; k <= 1; k++) {
        var l = grade[chaveCel(cx + i, cy + j, cz + k)]; if (!l) continue;
        for (var m = 0; m < l.length; m++) if (nos[l[m]].sis === sis && d3(nos[l[m]].P, p) <= TOL) return l[m];
      }
      if (!criar) return -1;
      var idx = nos.length; nos.push({ P: { x: p.x, y: p.y, z: p.z }, sis: sis, itens: [], fixo: null });
      var kc = chaveCel(cx, cy, cz); (grade[kc] = grade[kc] || []).push(idx);
      return idx;
    }
    var ext = {};   // id do trecho → [nó da p1, nó da p2]
    trechos.forEach(function (t) {
      var a = noEm(t.p1, t.sistema, true), b = noEm(t.p2, t.sistema, true);
      ext[t.id] = [a, b]; nos[a].itens.push({ tipo: "t", id: t.id, lado: 0 }); nos[b].itens.push({ tipo: "t", id: t.id, lado: 1 });
    });
    var acs = {}, extAc = {};
    arr(ins.acessorios).forEach(function (a) {
      if (!a || !a.a || !a.b) return;
      acs[a.id] = a;
      var na = noEm(a.a, a.sistema, true), nb = noEm(a.b, a.sistema, true);
      extAc[a.id] = [na, nb]; nos[na].itens.push({ tipo: "a", id: a.id }); nos[nb].itens.push({ tipo: "a", id: a.id });
      if (a.vertical) {   // registro na vertical: não anda; o tubo que chega nele estica ou encolhe
        var d = "o registro " + a.id + " (na vertical)";
        if (!nos[na].fixo) nos[na].fixo = d; if (!nos[nb].fixo) nos[nb].fixo = d;
      }
    });

    /* ---- os PONTOS FIXOS: aparelho, peça (ralo, caixa), espera de rede */
    var R = null;
    try { R = B.rede(estado, opcoes.avaliarFam); } catch (eR) { R = null; avisos.push("A rede de conexões não pôde ser lida: conferi só a geometria."); }
    function fixar(p, sis, descr) { var n = noEm(p, sis, false); if (n >= 0 && !nos[n].fixo) nos[n].fixo = descr; }
    if (R) {
      var pecaDe = {}; arr(R.pecas).forEach(function (q) { pecaDe[q.id] = q; });
      arr(R.ligacoes).forEach(function (l) {
        var tr = porId[l.trecho]; if (!tr) return;
        if (l.tipo === "peca") {
          var q = pecaDe[l.alvo], nome = q && B.PECAS[q.peca] ? B.PECAS[q.peca].nome.toLowerCase() : "peça";
          fixar(l, tr.sistema, "a " + nome + " " + l.alvo);
        } else if (l.tipo === "aparelho") {
          var fi = arr(estado && estado.familias).filter(function (f) { return String(f.id) === String(l.famInst); })[0];
          fixar(l, tr.sistema, "o ponto do aparelho " + l.famInst + (fi && fi.famId ? " (" + fi.famId + ")" : ""));
        }
      });
    }
    trechos.forEach(function (t) {
      if (t.continua === "p1" || t.continua === "ambos") { var a = ext[t.id][0]; if (!nos[a].fixo) nos[a].fixo = "a espera de rede (o tubo " + t.id + " continua fora do modelo)"; }
      if (t.continua === "p2" || t.continua === "ambos") { var b = ext[t.id][1]; if (!nos[b].fixo) nos[b].fixo = "a espera de rede (o tubo " + t.id + " continua fora do modelo)"; }
    });

    /* ---- a PROPAGAÇÃO: nós que andam, tubos horizontais e registros em linha que andam com eles */
    var moN = {}, moH = {}, moA = {}, fila = [], falha = null, nMov = 0;
    function falhar(msg) { if (!falha) falha = msg; }
    function moverNo(n, por) {
      if (falha || moN[n]) return;
      if (nos[n].fixo) { falhar("o trecho " + (por ? por + " " : "") + "chega em " + nos[n].fixo + " (ponto fixo): " + verbo + " mudaria a ligação com ele — nada foi movido"); return; }
      moN[n] = 1; fila.push(n);
    }
    function moverTubo(id) {
      if (falha || moH[id]) return;
      if (++nMov > (opcoes.limite || LIMITE_TRECHOS)) { falhar("o trecho arrasta mais de " + (opcoes.limite || LIMITE_TRECHOS) + " tubos: confira se não há um laço ou se o ramal não é a rede inteira"); return; }
      moH[id] = 1; moverNo(ext[id][0], id); moverNo(ext[id][1], id);
    }
    function moverAc(id) { if (falha || moA[id]) return; moA[id] = 1; moverNo(extAc[id][0], id); moverNo(extAc[id][1], id); }
    function perna(n, tubo) {
      if (!R) return 0;
      var c = arr(R.conexoes).filter(function (x) { return x.sistema === tubo.sistema && arr(x.ramos).indexOf(tubo.id) >= 0 && d3(x, nos[n].P) <= TOL; })[0];
      return pernaDe(c);
    }
    function minimoDe(v) { return Math.max(minVert, perna(ext[v.id][0], v) + perna(ext[v.id][1], v)); }
    var deslizes = [];   // verticais em que um ramal entra pelo MEIO: o ponto desliza por elas

    moverTubo(id0);
    for (var passada = 0; passada < LIMITE_PASSADAS && !falha; passada++) {
      var mudou = false, antes = Object.keys(moN).length + Object.keys(moH).length + Object.keys(moA).length;
      while (fila.length && !falha) {
        var n = fila.shift();
        nos[n].itens.forEach(function (it) {
          if (it.tipo === "t") { if (!porId[it.id].vertical) moverTubo(it.id); }
          else if (acs[it.id] && !acs[it.id].vertical) moverAc(it.id);
        });
      }
      if (falha) break;
      /* ramal que entra pelo MEIO de um tubo (tubo não dividido): o horizontal vai junto; na vertical, o ponto desliza */
      Object.keys(moN).forEach(function (ns) {
        var n = Number(ns), P = nos[n].P;
        trechos.forEach(function (t) {
          if (falha || t.sistema !== nos[n].sis || ext[t.id][0] === n || ext[t.id][1] === n) return;
          if (!noInterior(P, t.p1, t.p2, TOL)) return;
          if (t.vertical) { if (deslizes.indexOf(t.id + "|" + n) < 0) deslizes.push(t.id + "|" + n); }
          else moverTubo(t.id);
        });
      });
      /* nó que cai no MEIO de um tubo que anda (o ramal que sai dele acompanha) */
      Object.keys(moH).forEach(function (hid) {
        var H = porId[hid];
        for (var m = 0; m < nos.length && !falha; m++) {
          if (moN[m] || nos[m].sis !== H.sistema || ext[hid][0] === m || ext[hid][1] === m) continue;
          if (noInterior(nos[m].P, H.p1, H.p2, TOL)) moverNo(m, hid);
        }
      });
      /* verticais com UMA ponta num nó que anda: estica/encolhe; curta demais → o nó do outro lado sobe junto */
      trechos.forEach(function (v) {
        if (falha || !v.vertical) return;
        var a = ext[v.id][0], b = ext[v.id][1], ma = !!moN[a], mb = !!moN[b];
        if (ma === mb || a === b) return;
        var e = ma ? v.p1 : v.p2, f = ma ? v.p2 : v.p1, longe = ma ? b : a, s0 = e.y >= f.y ? 1 : -1;
        var Lnovo = (e.y + dz - f.y) * s0, mn = minimoDe(v);
        if (Lnovo >= mn - 1e-9) return;   // hid:ok geometria do trecho
        if (nos[longe].fixo) {
          falhar("a vertical " + v.id + " ficaria com " + cm(Math.max(Lnovo, 0)) + " cm (o mínimo é " + cm(mn) + " cm) e do outro lado dela está " + nos[longe].fixo + " (ponto fixo): " + verbo + " mudaria a ligação com ele — nada foi movido");
          return;
        }
        moverNo(longe, v.id);   // a vertical só se desloca; o trecho do outro lado sobe junto
      });
      var depois = Object.keys(moN).length + Object.keys(moH).length + Object.keys(moA).length;
      mudou = depois !== antes || fila.length > 0;
      if (!mudou) break;
      if (passada === LIMITE_PASSADAS - 1) falhar("a propagação não terminou em " + LIMITE_PASSADAS + " passos (laço?)");
    }
    if (falha) return recusa(falha.charAt(0).toUpperCase() + falha.slice(1) + ".", avisos);

    /* o ponto que desliza por uma vertical tem de continuar dentro dela */
    for (var ds = 0; ds < deslizes.length; ds++) {
      var pr = deslizes[ds].split("|"), V = porId[pr[0]], Pn = nos[Number(pr[1])].P, y1 = Math.min(V.p1.y, V.p2.y), y2 = Math.max(V.p1.y, V.p2.y), yn = Pn.y + dz;
      if (!(yn > y1 + 0.02 && yn < y2 - 0.02)) return recusa("O ramal entra pelo meio da vertical " + V.id + " e " + verbo + " " + cm(dz) + " cm tira o ponto de dentro dela — nada foi movido.", avisos);   // hid:ok geometria do trecho
    }

    /* ---- a GEOMETRIA nova */
    var novo = {}, esticadas = [], encurtadas = [], arrastadas = [], horiz = [];
    trechos.forEach(function (t) {
      var a = ext[t.id][0], b = ext[t.id][1], ma = !!moN[a], mb = !!moN[b];
      if (!moH[t.id] && !ma && !mb) return;
      var p1 = { x: t.p1.x, y: t.p1.y, z: t.p1.z }, p2 = { x: t.p2.x, y: t.p2.y, z: t.p2.z };
      if (ma) p1.y = r4(p1.y + dz);
      if (mb) p2.y = r4(p2.y + dz);
      novo[t.id] = { p1: p1, p2: p2 };
      if (!t.vertical) horiz.push(t.id);
      else if (ma && mb) arrastadas.push(t.id);
      else { var L0 = Math.abs(t.p1.y - t.p2.y), L1 = Math.abs(p1.y - p2.y); (L1 > L0 ? esticadas : encurtadas).push(t.id); }
    });
    /* os verticais de OUTRO sistema que saem do tubo que anda (a ventilação no tê do esgoto): acompanham; os horizontais só avisam */
    trechos.forEach(function (t) {
      if (novo[t.id] || t.sistema === t0.sistema) return;
      var pontas = [t.p1, t.p2], ajuste = [0, 0];
      pontas.forEach(function (P, i) {
        Object.keys(moH).forEach(function (hid) {
          var H = porId[hid]; if (H.sistema === t.sistema) return;
          if (d3(P, H.p1) <= TOL || d3(P, H.p2) <= TOL || noInterior(P, H.p1, H.p2, TOL)) ajuste[i] = dz;
        });
        Object.keys(moN).forEach(function (ns) { var nn = nos[Number(ns)]; if (nn.sis !== t.sistema && d3(P, nn.P) <= TOL) ajuste[i] = dz; });
      });
      if (!ajuste[0] && !ajuste[1]) return;
      if (!t.vertical) { avisos.push("O tubo " + t.id + " (" + ((B.SISTEMAS[t.sistema] || {}).nome || t.sistema) + ") encosta no trecho e NÃO acompanha: confira a ligação."); return; }
      if (ajuste[0] && ajuste[1]) { novo[t.id] = { p1: { x: t.p1.x, y: r4(t.p1.y + dz), z: t.p1.z }, p2: { x: t.p2.x, y: r4(t.p2.y + dz), z: t.p2.z } }; arrastadas.push(t.id); return; }
      var i1 = ajuste[0] ? 0 : 1, E = i1 === 0 ? t.p1 : t.p2, F = i1 === 0 ? t.p2 : t.p1, s0 = E.y >= F.y ? 1 : -1;
      if ((E.y + dz - F.y) * s0 < 0.02) { falhar("a vertical " + t.id + " (" + ((B.SISTEMAS[t.sistema] || {}).nome || t.sistema) + ") que sai do trecho ficaria sem comprimento"); return; }   // hid:ok geometria do trecho
      var q1 = { x: t.p1.x, y: t.p1.y, z: t.p1.z }, q2 = { x: t.p2.x, y: t.p2.y, z: t.p2.z };
      if (i1 === 0) q1.y = r4(q1.y + dz); else q2.y = r4(q2.y + dz);
      novo[t.id] = { p1: q1, p2: q2 };
      ((E.y + dz - F.y) * s0 > Math.abs(E.y - F.y) ? esticadas : encurtadas).push(t.id);
    });
    if (falha) return recusa(falha.charAt(0).toUpperCase() + falha.slice(1) + ".", avisos);

    /* ---- o ESTADO novo (para conferir e devolver) */
    var ids = Object.keys(novo), opsT = [], desfazer = [], trNovos = {};
    ids.forEach(function (id) {
      var t = porId[id], o = opCompleta(t, novo[id].p1, novo[id].p2);
      opsT.push(o); desfazer.push(opCompleta(t, t.p1, t.p2));
      trNovos[id] = B.normTrecho(o);
    });
    var invalido = ids.filter(function (id) { return !trNovos[id]; })[0];
    if (invalido) return recusa("O tubo " + invalido + " ficaria sem comprimento depois do movimento.", avisos);
    var acMov = Object.keys(moA), opsA = [];
    acMov.forEach(function (id) { opsA.push({ op: "instAlterar", id: id, dy: dz }); desfazer.push({ op: "instAlterar", id: id, dy: -dz }); });
    var ops = opsT.concat(opsA);
    var estadoNovo = {};
    Object.keys(estado || {}).forEach(function (k) { estadoNovo[k] = estado[k]; });
    var insNovo = {}; Object.keys(ins).forEach(function (k) { insNovo[k] = ins[k]; });
    insNovo.trechos = trechos.map(function (t) { return trNovos[t.id] || t; });
    if (arr(ins.acessorios).length) insNovo.acessorios = ins.acessorios.map(function (a) {
      if (!moA[a.id]) return a;
      var c = JSON.parse(JSON.stringify(a)); c.centro.y = r4(c.centro.y + dz); c.a.y = r4(c.a.y + dz); c.b.y = r4(c.b.y + dz);
      c.conectores.forEach(function (k) { k.y = r4(k.y + dz); });
      return c;
    });
    estadoNovo.instalacoes = insNovo;

    /* ---- CONFERÊNCIAS: o que o movimento PIORA recusa; o que já era assim é aviso */
    var S0 = null;
    // 1) declividade mínima do DN (o movimento preserva a de cada tubo; a conta é a prova)
    for (var ih = 0; ih < horiz.length; ih++) {
      var tt = porId[horiz[ih]], tn = trNovos[horiz[ih]], Sg = B.SISTEMAS[tt.sistema];
      if (!Sg || !Sg.gravidade) continue;
      var antes0 = B.abaixoDaMinima(tt.sistema, tt.dn, tt.inclinacao), depois0 = B.abaixoDaMinima(tt.sistema, tn.dn, tn.inclinacao);
      if (depois0 && !antes0) return recusa("A declividade do tubo " + tt.id + " cairia para " + String(tn.inclinacao).replace(".", ",") + "% (mínimo " + String(B.inclinacaoMinima(tt.sistema, tt.dn)).replace(".", ",") + "% — NBR 8160): nada foi movido.", avisos);
      if (depois0) avisos.push("O tubo " + tt.id + " já estava abaixo da declividade mínima (" + String(tt.inclinacao).replace(".", ",") + "%); o movimento não a muda.");
    }
    // 2) laje/piso e cota máxima: o tubo não entra na espessura da laje nem passa do teto
    var obst = opcoes.obstaculos || null;
    if (!obst) { var HRo = dep("HidRota", "./hidrota.js"); if (HRo && HRo.obstaculosDoBim) { try { obst = HRo.obstaculosDoBim(estado, opcoes.avaliarFam); } catch (eO) { obst = null; } } }
    var raio = function (t) { return num(t.dn, 0) / 2000; };   // hid:ok DN mm → raio em m
    for (var iv = 0; iv < ids.length; iv++) {
      var ti = porId[ids[iv]]; if (ti.vertical) continue;
      var tnv = trNovos[ids[iv]], rr = raio(ti);
      var ylo0 = Math.min(ti.p1.y, ti.p2.y) - rr, yhi0 = Math.max(ti.p1.y, ti.p2.y) + rr, ylo1 = Math.min(tnv.p1.y, tnv.p2.y) - rr, yhi1 = Math.max(tnv.p1.y, tnv.p2.y) + rr;
      if (isFinite(Number(opcoes.tetoY)) && yhi1 > Number(opcoes.tetoY) + FOLGA_VIGA && !(yhi0 > Number(opcoes.tetoY) + FOLGA_VIGA))
        return recusa("O tubo " + ti.id + " passaria da cota máxima (forro/teto) de " + String(Number(opcoes.tetoY)).replace(".", ",") + " m — o topo iria a " + String(r4(yhi1)).replace(".", ",") + " m: nada foi movido.", avisos);
      arr(obst && obst.lajes).forEach(function (l) {
        var tp = num(l.topo, NaN), esp = num(l.espessura, 0); if (!isFinite(tp) || !(esp > 0)) return;
        var x0 = Math.min(num(l.x0, 0), num(l.x1, 0)), x1 = Math.max(num(l.x0, 0), num(l.x1, 0)), z0 = Math.min(num(l.z0, 0), num(l.z1, 0)), z1 = Math.max(num(l.z0, 0), num(l.z1, 0));
        var mx = (tnv.p1.x + tnv.p2.x) / 2, mz = (tnv.p1.z + tnv.p2.z) / 2;
        if (!(mx >= x0 - 1e-6 && mx <= x1 + 1e-6 && mz >= z0 - 1e-6 && mz <= z1 + 1e-6)) return;   // hid:ok geometria do trecho
        var fundo = tp - esp, dentro0 = ylo0 < tp - FOLGA_VIGA && yhi0 > fundo + FOLGA_VIGA, dentro1 = ylo1 < tp - FOLGA_VIGA && yhi1 > fundo + FOLGA_VIGA;
        if (dentro1 && !dentro0 && !falha) falhar("o tubo " + ti.id + " entraria na laje " + l.id + " (de " + String(r4(fundo)).replace(".", ",") + " a " + String(r4(tp)).replace(".", ",") + " m) ao " + verbo + " " + cm(dz) + " cm");
      });
      if (falha) return recusa(falha.charAt(0).toUpperCase() + falha.slice(1) + ": nada foi movido.", avisos);
    }
    // 3) o auditor de projetista (viga, pilar, abertura…): o que aparece de DURO nos tubos movidos e não existia antes recusa
    var HCr = opcoes.auditor === false ? null : dep("HidCriterios", "./hidcriterios.js");
    if (HCr && HCr.auditar && HCr.doEstado) {
      try {
        var chave = function (a) { return a.regra + "|" + arr(a.ids).join(",") + "|" + (a.obstaculo || ""); };
        var E0 = HCr.doEstado(estado, opcoes.avaliarFam, { escopo: ids }), E1 = HCr.doEstado(estadoNovo, opcoes.avaliarFam, { escopo: ids });
        if (opcoes.obstaculos) { E0.obstaculos = opcoes.obstaculos; E1.obstaculos = opcoes.obstaculos; }
        var A0 = {}; arr((HCr.auditar(E0) || {}).apontamentos).forEach(function (a) { A0[chave(a)] = 1; });
        arr((HCr.auditar(E1) || {}).apontamentos).forEach(function (a) {
          if (A0[chave(a)] || falha) return;
          if (a.gravidade === "dura") falhar(String(a.texto || a.titulo).replace(/\.$/, "") + " — " + verbo + " " + cm(dz) + " cm cria esse PROIBIDO de projetista");
          else avisos.push(a.titulo + ": " + a.texto);
        });
        if (falha) return recusa(falha.charAt(0).toUpperCase() + falha.slice(1) + ": nada foi movido.", avisos);
      } catch (eA) { avisos.push("O auditor de projetista não rodou (" + (eA && eA.message ? eA.message : eA) + "): confira viga, pilar e abertura à mão."); }
    }

    /* ---- o RESUMO */
    var nTub = horiz.length + arrastadas.length;
    var partes = [(dz > 0 ? "Subiu " : "Desceu ") + nTub + (nTub === 1 ? " tubo " : " tubos ") + cm(dz) + " cm"];
    function plural(n, s, p) { return n + " " + (n === 1 ? s : p); }
    if (encurtadas.length) partes.push(plural(encurtadas.length, "vertical encurtada", "verticais encurtadas"));
    if (esticadas.length) partes.push(plural(esticadas.length, "vertical esticada", "verticais esticadas"));
    if (arrastadas.length) partes.push(plural(arrastadas.length, "vertical subiu junto", "verticais subiram junto").replace(/subiu/, dz > 0 ? "subiu" : "desceu").replace(/subiram/, dz > 0 ? "subiram" : "desceram"));
    if (acMov.length) partes.push(plural(acMov.length, "registro acompanhou", "registros acompanharam"));
    var mensagem = partes.join("; ");
    return { ok: true, erro: null, ops: ops, desfazer: desfazer, avisos: avisos, ids: ids.concat(acMov), estado: estadoNovo, mensagem: mensagem,
             resumo: { dz: dz, tubos: nTub, horizontais: horiz.slice(), esticadas: esticadas, encurtadas: encurtadas, arrastadas: arrastadas, registros: acMov, sistema: t0.sistema, trechoDe: id0 } };
  }

  /* o tubo `id` serve para "Subir trecho"? (horizontal e de sistema hidrossanitário) → { ok, motivo } */
  function podeSubir(estado, id) {
    var B = BI(), ins = (estado && estado.instalacoes) || {}, i = String(id == null ? "" : id).replace(/^edit:/, "");
    var t = arr(ins.trechos).filter(function (x) { return x.id === i; })[0];
    if (!B || !t) return { ok: false, motivo: "não é um tubo" };
    if (FORA[t.sistema]) return { ok: false, motivo: "não é do hidrossanitário" };
    if (t.vertical) return { ok: false, motivo: "é vertical" };
    return { ok: true, motivo: "" };
  }

  var HidSubirTubo = { VERSAO: 1, PADRAO_CM: PADRAO_CM, MIN_VERTICAL: MIN_VERTICAL, subirTrecho: subirTrecho, podeSubir: podeSubir };
  global.HidSubirTubo = HidSubirTubo;
  if (typeof module !== "undefined" && module.exports) module.exports = HidSubirTubo;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
