/* =====================================================================
 * hidligar.js — LIGAR A → B (modelagem pelos conectores, 17/10/2026). Motor PURO, ES5, Node-testável.
 *
 * Pedido do Rogério: "clico numa conexão e ligo até a outra, e ele já liga, já entendendo a inclinação que precisa";
 * "clicar num tubo a uma altura e depois num tubo a outra altura gera a ligação completa".
 *
 *   HidLigar.ligar(estado, avaliarFam, A, B, opts) → { ok, erro, opcoes: [{ estrategia, nome, ops, comprimento,
 *        avisos[] }], pendencias[] }
 *
 * A e B são PONTOS DE LIGAÇÃO (os mesmos que a tela mostra com o "+"):
 *   { tipo: "conector", x, y, z, sistema, dn, famInst?, parede? }   ponto de louça/equipamento (BimInst.conectoresDoEstado)
 *   { tipo: "peca", id, x, y, z, sistema }                          caixa/ralo (a entrada/saída é a captura da peça)
 *   { tipo: "ponta", trecho, x, y, z, sistema, dn }                 ponta solta de um tubo
 *   { tipo: "meio", trecho, x, y, z, sistema, dn }                  o meio de um tubo (vira tê/junção: o tubo é DIVIDIDO)
 *   { tipo: "vertical", trecho, x, z, yBase, yTopo, sistema, dn }   tubo de queda/coluna (a cota sai da inclinação)
 * O MESMO motor do traçado automático (js/hidrota.js) faz a rota: ortogonal/45°, nunca atravessa família, esgoto com
 * a declividade mínima por DN (HidNormas) e o sentido do escoamento A → B (A a montante). Se faltar altura até B, a
 * opção é descartada com o motivo (a tela mostra). Várias estratégias (parede/piso/forro) = várias opções: a tela
 * mostra a prévia, Tab alterna, Enter confirma.
 * ⚠ NENHUM valor de norma aqui: o que é norma vem do HidRota/HidNormas.
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function BI() { return dep("BimInst", "./biminst.js"); }
  function HR() { return dep("HidRota", "./hidrota.js"); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { var n = Number(v); return isFinite(n) ? n : d; }
  function r4(v) { return Math.round(v * 10000) / 10000; }   // hid:ok arredondamento a 0,1 mm (formatação)
  function txt(v) { return v == null ? "" : String(v); }
  var EPS = 1e-6;   // hid:ok tolerância numérica de ponto flutuante (geometria, não norma)
  /* ⚠ A4 (revisão 13/11/2026): o último trecho da entrada a 45° (P → J) era empurrado DEPOIS da rota, sem passar por obstáculo — com o tubo de destino
     encostado na parede e A do lado da parede, o j45 atravessava a parede. Esta é a mesma conferência das pernas da rota: parede, pilar e outro tubo.
     Devolve o motivo da colisão, ou null se o trecho passa. */
  function bate45(estado, obs, P, J, dn, idTb) {
    var H = HR(), G = H && H._int; if (!G || !G.retSeg || !G.corta) return null;
    var r = num(dn, 50) / 2000, y0 = Math.min(P.y, J.y) - r, y1 = Math.max(P.y, J.y) + r;   // hid:ok raio = DN/2000 (mm → m) e DN de reserva (geometria)
    function faixa(b0, b1) { return y0 < b1 - EPS && y1 > b0 + EPS; }
    var m = null;
    arr(obs && obs.paredes).forEach(function (w) {
      if (m) return; var o = G.retSeg(w.p1, w.p2, num(w.espessura, 0));
      if (o && G.corta(o, P, J, r) && faixa(num(w.base, 0), num(w.base, 0) + num(w.altura, 0))) m = "atravessa a parede " + txt(w.id);
    });
    arr(obs && obs.pilares).forEach(function (q) {
      if (m || !G.retCentro) return; var o = G.retCentro(num(q.x, 0), num(q.z, 0), num(q.largura, 0), num(q.profundidade, 0), q.rotY);
      if (G.corta(o, P, J, r) && faixa(num(q.base, 0), num(q.base, 0) + num(q.altura, 0))) m = "atravessa o pilar " + txt(q.id);
    });
    arr(estado && estado.instalacoes && estado.instalacoes.trechos).forEach(function (t) {
      if (m || String(t.id) === String(idTb) || !t.p1 || !t.p2 || !G.segSeg3) return;
      if (G.segSeg3(P, J, t.p1, t.p2) < r + num(t.dn, 0) / 2000) m = "cruza o tubo " + txt(t.id);   // hid:ok raio = DN/2000 (mm → m) e DN de reserva (geometria)
    });
    return m;
  }
  var PREFIXO = "lg", SEQ = 0;   /* cada ligação com ids próprios (duas ligações no mesmo modelo não colidem) */

  /* o destino do HidRota a partir do ponto B */
  function destino(B, sis) {
    if (B.tipo === "vertical") return { tipo: sis === "esgoto" ? "tubo_queda" : "coluna", id: B.trecho, x: B.x, z: B.z, yBase: B.yBase, yTopo: B.yTopo, existente: true, ventilado: false };
    return { tipo: "ponto", id: B.trecho || B.id || "B", conector: { x: B.x, y: B.y, z: B.z, dn: num(B.dn, 0) } };
  }
  /* o tubo do meio é DIVIDIDO no ponto em que a ligação chega (a conexão — tê ou junção — fica no nó): js/biminst.js */
  function dividir(estado, idT, P) { var I = BI(); return I && I.dividirTrecho ? I.dividirTrecho(estado, idT, P) : []; }
  function ligar(estado, avaliarFam, A, B, opts) {
    opts = opts || {};
    var A0 = A ? JSON.parse(JSON.stringify(A)) : A, B0 = B ? JSON.parse(JSON.stringify(B)) : B;
    var H = HR(), I = BI(); if (!H || !I) return { ok: false, erro: "Motor do traçado não carregado.", opcoes: [] };
    if (!A || !B) return { ok: false, erro: "Clique o ponto de partida e o de chegada.", opcoes: [] };
    var sis = A.sistema || B.sistema;
    if (A.sistema && B.sistema && A.sistema !== B.sistema) return { ok: false, erro: "Sistemas diferentes (" + I.SISTEMAS[A.sistema].nome + " × " + I.SISTEMAS[B.sistema].nome + "): não se ligam.", opcoes: [] };
    if (!I.SISTEMAS[sis] || (sis !== "esgoto" && sis !== "agua_fria" && sis !== "pluvial")) return { ok: false, erro: "Ligar A → B: esgoto e água fria (o sistema " + txt(sis) + " ainda não).", opcoes: [] };
    var sisRota = sis === "pluvial" ? "esgoto" : sis;
    /* LIGAR POR CLIQUE (13/11/2026): o aparelho do ponto A pela família (js/hidkit.js) — o DN do ramal de descarga sai da norma pelo aparelho
       (lavatório DN 40, bacia DN 100…), nunca o DN da ferramenta. O ponto do aparelho sem DN próprio não herda o DN do destino (a caixa) */
    if (A.tipo === "conector" && A.famInst != null && !A.aparelho) {
      var K = dep("HidKit", "./hidkit.js"), fA = arr(estado && estado.familias).filter(function (f) { return String(f.id) === String(A.famInst); })[0];
      if (K && fA && K.tipoDaFamilia) { var tA = K.tipoDaFamilia(fA.famId, fA.tipoId); if (K.aparelhoNorma) tA = K.aparelhoNorma(tA); if (tA) { A.aparelho = tA; if (opts.dnAparelho == null) A._dnPeloAparelho = true; } }
    }
    var dnA = num(A.dn, 0) || (A._dnPeloAparelho ? 0 : num(B.dn, 0));
    /* SAÍDA DA CAIXA SIFONADA/RALO (13/11/2026): a saída sai no SENTIDO que o usuário girou a peça (rotY, passos de 45° na colocação) — um toco reto
       da boca da saída para fora, na declividade de norma, e a rota segue da ponta dele. DN da saída = o último número do DN da peça (100x100x50 → 50) */
    var tocoA = null, PkA = A.tipo === "peca" && A.id != null ? arr(estado && estado.instalacoes && estado.instalacoes.pecas).filter(function (k) { return String(k.id) === String(A.id); })[0] : null;
    /* caixa nunca girada (rotY 0, o padrão da colocação): sem toco — o traçado escolhe por onde a saída vai, como antes; o giro da pessoa manda quando existe.
       ⚠ A6 (revisão 13/11/2026): "girada" é o campo saidaGirada (gravado pelo giro e pela colocação girada) — quem girava 8 × 45° voltava a 0° e perdia a
       escolha. Projeto salvo antes do campo: rotY ≠ 0 continua valendo como girada; rotY 0 sem o campo = livre, como sempre foi. */
    if (PkA && sisRota === "esgoto" && /^(caixa_sifonada|ralo_)/.test(String(PkA.peca)) && (PkA.saidaGirada === true || Math.abs(num(PkA.rotY, 0)) > EPS)) {
      var PPa = I.PECAS[PkA.peca] || {}, dnS = num(String(PkA.dn || PPa.dn || "").split("x").pop(), 0) || 50, rot = num(PkA.rotY, 0);   // hid:ok tolerância de desenho / DN de reserva (geometria, não norma)
      var dx = Math.cos(rot), dz = -Math.sin(rot), rC = num(PPa.r, 0.05), yS = opts._yToco != null ? opts._yToco : r4(num(PkA.y, 0) - num(PPa.h, 0.1) + dnS / 2000 + 0.01);   // hid:ok 1 cm: a geratriz de baixo da saída acima do fundo do corpo (geometria)
      var iS = num(I.inclinacaoMinima ? I.inclinacaoMinima("esgoto", dnS) : null, 2) / 100;   /* a declividade mínima do DN (a mesma do traçado) */
      var Lt = 0.15, q0 = { x: r4(PkA.x + dx * rC), y: yS, z: r4(PkA.z + dz * rC) }, q1 = { x: r4(q0.x + dx * Lt), y: r4(yS - iS * Lt), z: r4(q0.z + dz * Lt) };   // hid:ok 15 cm de toco reto: o comprimento da bolsa + a folga até a 1ª conexão (geometria)
      tocoA = { op: "trecho", id: "lgcx" + (opts.seq || (++SEQ) + "-") + "toco", sistema: "esgoto", material: "pvc_esgoto", dn: dnS, p1: q0, p2: q1 };
      A = { tipo: "ponta", x: q1.x, y: q1.y, z: q1.z, sistema: "esgoto", dn: dnS }; dnA = dnS;
    }
    var con = { id: "c", sistema: sisRota, dn: dnA || num(A.dn, 0), x: A.x, y: A.y, z: A.z };
    if (A.parede) con.parede = A.parede;
    var par = { estrategias: opts.estrategias || (sisRota === "esgoto" ? ["piso", "forro"] : ["parede", "piso", "forro"]), prefixo: PREFIXO + (opts.seq || (++SEQ) + "-"), dn: {}, terreo: opts.terreo !== false };
    if (tocoA) par.quedaMin = 0.001;   /* a ponta do toco da caixa já está na cota da rota: sem a descida mínima do ponto de APARELHO (é tubo, não louça) */   // hid:ok 1 mm: só para não ser zero
    /* o id do "aparelho" é o da FAMÍLIA do ponto: a conferência tubo × louça sabe que o toco que chega nele é dela */
    var apId = A.famInst != null ? String(A.famInst) : "A";
    if (dnA > 0) par.dn[apId + ":c"] = dnA;
    /* CHEGAR NO MEIO DE UM TUBO DE ESGOTO (13/11/2026): a ligação entra por JUNÇÃO A 45° A FAVOR DO FLUXO (NBR 8160) — nunca correndo por cima do
       tubo até o ponto (o que saía antes: um trecho sobreposto e um tê). A rota vai até um ponto ao lado do tubo, recuado para montante, e o último
       trecho entra a 45° em planta no ponto clicado. O lado é o de A; o fluxo, o da declividade do tubo (p1 mais alto = montante). */
    var entra45 = null;
    if (sisRota === "esgoto" && B.tipo === "meio" && B.trecho) {
      var Tb = arr(estado && estado.instalacoes && estado.instalacoes.trechos).filter(function (t) { return String(t.id) === String(B.trecho); })[0];
      if (Tb) {
        var up = Tb.p1.y >= Tb.p2.y ? Tb.p1 : Tb.p2, dw = up === Tb.p1 ? Tb.p2 : Tb.p1, ux = dw.x - up.x, uz = dw.z - up.z, Lu = Math.hypot(ux, uz);
        if (Lu > 1e-6) {   // hid:ok tolerância de desenho / DN de reserva (geometria, não norma)
          ux /= Lu; uz /= Lu;
          var nx = -uz, nz = ux; if ((A.x - B.x) * nx + (A.z - B.z) * nz < 0) { nx = -nx; nz = -nz; }
          var obs45 = H.obstaculosDoBim(estado, avaliarFam);
          var dnB = num(Tb.dn, 100), d45 = Math.max(0.15, (dnB + dnA) / 2000 + 0.10), iB = num(I.inclinacaoMinima ? I.inclinacaoMinima("esgoto", dnA || 40) : null, 2) / 100;   // hid:ok 15 cm mínimo / meio-DN + 10 cm: a derivação sai da bolsa da junção antes do joelho 45° (geometria)
          var J = { x: r4(B.x), y: r4(B.y), z: r4(B.z) }, Ld = d45 * Math.SQRT2;
          /* o lado de A primeiro; colidiu (parede, pilar, outro tubo) → o lado oposto; os dois colidem → recusa com o motivo */
          var Pp = null, mot = [];
          [1, -1].forEach(function (sg) {
            if (Pp) return;
            var Pc = { x: r4(J.x - ux * d45 + sg * nx * d45), y: r4(J.y + iB * Ld), z: r4(J.z - uz * d45 + sg * nz * d45) }, b45 = bate45(estado, obs45, Pc, J, dnA || 40, Tb.id);   // hid:ok raio = DN/2000 (mm → m) e DN de reserva (geometria)
            if (b45) mot.push((sg > 0 ? "do lado de A " : "do outro lado ") + b45); else Pp = Pc;
          });
          if (!Pp) return { ok: false, erro: "a entrada a 45° no tubo " + txt(Tb.id) + " não cabe: " + mot.join("; ") + " — escolha outro ponto do tubo (mais longe da parede) ou ligue numa ponta/caixa", opcoes: [] };
          entra45 = { J: J, P: Pp };
          B = { tipo: "ponto", x: Pp.x, y: Pp.y, z: Pp.z, sistema: B.sistema, dn: dnA, trecho: B.trecho };
        }
      }
    }
    var dest = {}; dest[sisRota] = destino(B, sisRota);
    var piso = num(opts.piso, num(A.y, 0));
    var entrada = { aparelhos: [{ id: apId, aparelho: txt(A.aparelho), grupo: "1", conectores: [con] }], pecas: [], destinos: dest, grupos: [{ id: "1", piso: piso }], piso: piso,
                    obstaculos: H.obstaculosDoBim(estado, avaliarFam), parametros: par, opsModelo: arr(opts.opsModelo) };
    var r = H.propor(entrada);
    /* LIGAR POR CLIQUE (13/11/2026): o destino CAIXA SIFONADA / RALO / CAIXA DE INSPEÇÃO recebe o tubo em qualquer altura da captura do corpo — a
       cota do clique (logo abaixo da grelha) é só a 1ª tentativa. O esgoto chega com a declividade de norma (HidRota) e, sem altura, a entrada desce
       no corpo da peça de 2 em 2 cm até o fundo útil (a geratriz de baixo do tubo acima do fundo da peça). Nunca acima do clique. */
    var Pk = B.tipo === "peca" && B.id != null ? arr(estado && estado.instalacoes && estado.instalacoes.pecas).filter(function (k) { return String(k.id) === String(B.id); })[0] : null;
    var PP = Pk ? I.PECAS[Pk.peca] : null;
    if (sisRota === "esgoto" && PP && !arr(r.opcoes).length) {
      var yFundo = num(Pk.y, 0) - num(PP.prof, 0) + num(dnA, 40) / 2000 + 0.02, PASSO = 0.02;   // hid:ok 2 cm de folga do fundo e passo de busca (geometria, não norma)
      for (var yB = num(B.y, 0) - PASSO; yB >= yFundo && !arr(r.opcoes).length; yB -= PASSO) {
        var B2 = {}; Object.keys(B).forEach(function (q) { B2[q] = B[q]; }); B2.y = r4(yB);
        dest[sisRota] = destino(B2, sisRota); entrada.destinos = dest;
        r = H.propor(entrada);
      }
    }
    /* a saída da caixa na cota em que a rota anda: sem o toco no alto e o par de joelhos 90° descendo logo depois (nenhuma conexão a mais). A boca desce
       no corpo da caixa até a cota do 1º horizontal, se ela couber acima do fundo útil */
    if (tocoA) arr(r.opcoes).forEach(function (o) {
      var vt = arr(o.ops).filter(function (x) { return x.op === "trecho" && Math.abs(x.p1.x - A.x) + Math.abs(x.p1.z - A.z) < 1e-3 && Math.abs(x.p1.x - x.p2.x) + Math.abs(x.p1.z - x.p2.z) < 1e-3 && x.p2.y < x.p1.y - 0.001; })[0];   // hid:ok 1 mm / 0,1 mm: tolerâncias de desenho
      var yF = num(PkA.y, 0) - num((I.PECAS[PkA.peca] || {}).prof, 0.3) + num(tocoA.dn, 50) / 2000 + 0.02;   // hid:ok 2 cm acima do fundo útil (geometria)
      if (!vt) { o.toco = JSON.parse(JSON.stringify(tocoA)); return; }
      var dy = tocoA.p1.y - tocoA.p2.y, y2 = vt.p2.y;
      if (y2 + dy < yF) { o.toco = JSON.parse(JSON.stringify(tocoA)); return; }
      var tc = JSON.parse(JSON.stringify(tocoA)); tc.p1.y = r4(y2 + dy); tc.p2.y = r4(y2); o.toco = tc;
      o.ops = o.ops.filter(function (x) { return x !== vt; });
    });
    var div = B.tipo === "meio" ? null : null;
    var opcoes = r.opcoes.map(function (o) {
      var ops = o.ops.filter(function (x) { return x.op === "trecho" || x.op === "acessorio"; }).filter(function (x) { return !(x.op === "acessorio"); });
      if (sis === "pluvial") ops.forEach(function (x) { if (x.op === "trecho") { x.sistema = "pluvial"; x.material = I.SISTEMAS.pluvial.material; } });
      var antes = [];
      if (entra45) {
        ops.push({ op: "trecho", id: par.prefixo + "j45", sistema: sis, material: (ops[ops.length - 1] || {}).material || "pvc_esgoto", dn: dnA || num((ops[ops.length - 1] || {}).dn, 40), p1: entra45.P, p2: entra45.J });   // hid:ok tolerância de desenho / DN de reserva (geometria, não norma)
        antes = dividir(estado, B.trecho, entra45.J);
      } else if (B.tipo === "meio" && B.trecho) {
        /* o ponto de chegada é o do trecho dividido: a última ponta da rota toca o meio dele */
        var fim = null; ops.forEach(function (x) { if (x.op === "trecho" && Math.hypot(x.p2.x - B.x, x.p2.z - B.z) < 0.05) fim = x.p2; });   // hid:ok tolerância de desenho (5 cm) para achar a ponta da rota no meio do trecho — não é valor de norma
        antes = dividir(estado, B.trecho, fim || B);
      }
      if (A.tipo === "meio" && A.trecho) antes = antes.concat(dividir(estado, A.trecho, A));
      if (tocoA) ops = [o.toco || JSON.parse(JSON.stringify(tocoA))].concat(ops);
      ops = unirColineares(ops, arr(estado && estado.instalacoes && estado.instalacoes.trechos).filter(function (t) { return String(t.id) !== String(B.trecho) && String(t.id) !== String(A.trecho); }));
      return { estrategia: o.estrategia, nome: o.nome, ops: antes.concat(ops), comprimento: o.comprimento, avisos: o.avisos.slice() };
    });
    if (!opcoes.length && tocoA && B.y != null && num(B.y, 0) > tocoA.p2.y - 0.005) return { ok: false, erro: "a saída da caixa " + txt(PkA.id) + " (cota " + tocoA.p2.y.toFixed(2).replace(".", ",") + " m) fica abaixo do ponto de chegada (cota " + num(B.y, 0).toFixed(2).replace(".", ",") + " m): o esgoto não sobe — ligue a caixa mais a jusante (onde o tubo está mais fundo) ou direto na caixa de inspeção", opcoes: [], descartadas: r.descartadas, pendencias: r.pendencias };   // hid:ok 5 mm: tolerância de desenho
    if (!opcoes.length) return { ok: false, erro: (r.descartadas[0] ? r.descartadas[0].motivo : (r.pendencias[0] ? r.pendencias[0].motivo : "nenhuma rota fechou")), opcoes: [], descartadas: r.descartadas, pendencias: r.pendencias };
    return { ok: true, opcoes: opcoes, descartadas: r.descartadas, pendencias: r.pendencias };
  }

  /* NENHUMA LUVA À TOA (13/11/2026, regra da casa "nenhuma conexão a mais"): dois trechos novos da ligação que se encontram SÓ entre si, no mesmo DN e
     material, na mesma direção e na mesma inclinação, viram UM tubo (a luva só entra quando o comprimento passa da barra — js/biminst.js luvasBarra) */
  /* A8 (revisão 13/11/2026): `existentes` = trechos do modelo — um tubo existente (ou o ramal) que termina no nó intermediário é derivação: os dois
     novos não se fundem ali (antes só os novos contavam, e a derivação perdia o nó) */
  function unirColineares(ops, existentes) {
    var tr = ops.filter(function (x) { return x.op === "trecho"; }), mudou = true, fixo = {};
    function chave(p) { return r4(p.x) + "," + r4(p.y) + "," + r4(p.z); }
    arr(existentes).forEach(function (t) { if (t && t.p1 && t.p2 && tr.indexOf(t) < 0) { fixo[chave(t.p1)] = 1; fixo[chave(t.p2)] = 1; } });
    while (mudou) {
      mudou = false;
      var cont = {}; tr.forEach(function (t) { [t.p1, t.p2].forEach(function (p) { var k = chave(p); cont[k] = (cont[k] || 0) + 1; }); });
      for (var i = 0; i < tr.length && !mudou; i++) for (var j = 0; j < tr.length && !mudou; j++) {
        var a = tr[i], b = tr[j]; if (i === j || chave(a.p2) !== chave(b.p1) || cont[chave(a.p2)] !== 2 || fixo[chave(a.p2)] || num(a.dn, 0) !== num(b.dn, 0) || a.material !== b.material || a.sistema !== b.sistema) continue;
        var ua = { x: a.p2.x - a.p1.x, y: a.p2.y - a.p1.y, z: a.p2.z - a.p1.z }, ub = { x: b.p2.x - b.p1.x, y: b.p2.y - b.p1.y, z: b.p2.z - b.p1.z };
        var La = Math.hypot(ua.x, ua.y, ua.z), Lb = Math.hypot(ub.x, ub.y, ub.z); if (!(La > 0) || !(Lb > 0)) continue;
        if (Math.abs(ua.x / La - ub.x / Lb) + Math.abs(ua.y / La - ub.y / Lb) + Math.abs(ua.z / La - ub.z / Lb) > 2e-3) continue;   // hid:ok mesma direção e inclinação (tolerância de arredondamento)
        a.p2 = b.p2; tr.splice(j, 1); ops.splice(ops.indexOf(b), 1); mudou = true;
      }
    }
    return ops;
  }
  var HidLigar = { VERSAO: 1, bate45: bate45, unirColineares: unirColineares, ligar: ligar, destino: destino, dividir: dividir };
  global.HidLigar = HidLigar;
  if (typeof module !== "undefined" && module.exports) module.exports = HidLigar;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
