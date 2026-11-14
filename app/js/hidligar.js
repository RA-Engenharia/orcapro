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
  function HB() { return dep("HidBocas", "./hidbocas.js"); }
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
  /* REBAIXO (13/11/2026): o corpo da caixa desce `dd` (grelha no piso): os tubos ligados nela descem junto (o arraste de js/biminstarr.js) e a peça
     grava o rebaixo (o 3D desenha o corpo e o prolongador por ele — js/biminstgeo.js corpoPeca; o orçamento conta o prolongador). → { ops } | { erro } */
  function opsRebaixo(estado, avaliarFam, pk, dd) {
    var ARR = dep("BimInstArr", "./biminstarr.js"), ra = ARR && ARR.arrastar ? ARR.arrastar(estado, avaliarFam, [pk.id], { x: 0, y: -dd, z: 0 }, { confirmar: true }) : null;
    if (!ra || !ra.ok) return { erro: ra ? ra.erro : "arraste indisponível" };
    return { ops: ra.ops.map(function (q) { if (q.op === "peca" && String(q.id) === String(pk.id)) { q.y = pk.y; q.rebaixo = r4(num(pk.rebaixo, 0) + dd); if (pk.saidaGirada) q.saidaGirada = true; } return q; }) };
  }
  /* o estado com a caixa rebaixada (só para achar as bocas: a rota não depende dela) */
  function comRebaixo(estado, pk, dd) {
    var e2 = {}; Object.keys(estado || {}).forEach(function (k) { e2[k] = estado[k]; });
    var ins = estado.instalacoes || {}; e2.instalacoes = {}; Object.keys(ins).forEach(function (k) { e2.instalacoes[k] = ins[k]; });
    var pk2 = JSON.parse(JSON.stringify(pk)); pk2.rebaixo = r4(num(pk.rebaixo, 0) + dd);
    e2.instalacoes.pecas = arr(ins.pecas).map(function (k) { return String(k.id) === String(pk.id) ? pk2 : k; });
    return { estado: e2, pk: pk2 };
  }
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
    /* BOCAS DE CATÁLOGO NO DESTINO (13/11/2026, pedido do Rogério: "o tubo chega na caixa mas não no ponto da entrada"): a caixa sifonada tem N
       entradas DN 40 do catálogo (js/hidbocas.js). A ligação termina EXATAMENTE numa entrada livre do mesmo DN — a mais alinhada com a chegada;
       ocupada → a seguinte; nenhuma → recusa com o motivo. Peça sem boca de catálogo: o centro, com aviso. */
    /* a peça de ORIGEM (ralo, caixa) sai no DN da boca de saída do catálogo — nunca o DN da ferramenta */
    var PkA0 = A.tipo === "peca" && A.id != null && HB() ? arr(estado && estado.instalacoes && estado.instalacoes.pecas).filter(function (k) { return String(k.id) === String(A.id); })[0] : null;
    var sA0 = PkA0 ? HB().bocas(estado, PkA0).filter(function (b) { return b.papel === "saida"; })[0] : null;
    if (sA0) dnA = num(sA0.dn, dnA);
    var PkB0 = B.tipo === "peca" && B.id != null ? arr(estado && estado.instalacoes && estado.instalacoes.pecas).filter(function (k) { return String(k.id) === String(B.id); })[0] : null;
    var bocasB = null, avisoBoca = null, entradasB = null;
    if (PkB0 && sisRota === "esgoto" && HB()) {
      var dnChega = dnA || 40;   // hid:ok DN de reserva do ramal de descarga (o mesmo do traçado)
      var eB = HB().entradasLivres(estado, PkB0, A, dnChega);
      if (eB.semBoca) avisoBoca = "a " + txt((I.PECAS[PkB0.peca] || {}).nome).toLowerCase() + " " + PkB0.id + " não tem boca de entrada no catálogo: ligado ao centro dela (confira a entrada na obra)";
      else if (!eB.ok && eB.dnDiferente) {
        /* DN DIFERENTE (revisão 13/11, achado 3): nenhuma caixa do catálogo tem entrada DN 50 (Amanco: todas DN 40) e a caixa não ganha redução.
           NBR 8160: o aparelho do esgoto primário descarrega por um DESCONECTOR — a caixa sifonada é um; sem entrada do DN, o ramal entra no
           TUBO DE SAÍDA da caixa por junção (a jusante do fecho dela) e o aparelho leva o SIFÃO próprio (desconector), que fica como pendência. */
        var sCx = HB().bocas(estado, PkB0).filter(function (b) { return b.papel === "saida"; })[0], tS = null;
        if (sCx) arr(estado.instalacoes && estado.instalacoes.trechos).forEach(function (t) {
          if (tS || num(t.dn, 0) < dnChega) return;
          var dP = Math.hypot(t.p1.x - sCx.x, t.p1.y - sCx.y, t.p1.z - sCx.z), dc = Math.hypot(t.p1.x - PkB0.x, t.p1.z - PkB0.z);
          if (dP <= sCx.dn / 2000 + 0.02 || (dc <= num((PkB0.hub || {}).r, 0.12) + 0.01 && Math.hypot(t.p2.x - t.p1.x, t.p2.z - t.p1.z) > 0.3)) tS = t;   // hid:ok 2 cm / 30 cm: tolerâncias de desenho
        });
        if (tS && !opts._semDesvioDn) {
          var Ls = Math.hypot(tS.p2.x - tS.p1.x, tS.p2.z - tS.p1.z), fr = Math.min(0.5, Math.max(0.2, (Ls - 0.3) / Ls));   // hid:ok o ponto da junção no tubo de saída (longe das bolsas)
          var Bm = { tipo: "meio", trecho: tS.id, x: r4(tS.p1.x + (tS.p2.x - tS.p1.x) * fr), y: r4(tS.p1.y + (tS.p2.y - tS.p1.y) * fr), z: r4(tS.p1.z + (tS.p2.z - tS.p1.z) * fr), sistema: B.sistema || "esgoto", dn: tS.dn };
          var o2 = {}; Object.keys(opts).forEach(function (k) { o2[k] = opts[k]; }); o2._semDesvioDn = true;
          var rD = ligar(estado, avaliarFam, A0, Bm, o2);
          if (rD.ok) { rD.opcoes.forEach(function (o) { o.avisos.unshift(eB.erro + ": pela NBR 8160 o ramal DN " + dnChega + " entra no tubo de saída " + tS.id + " da caixa por junção — o aparelho precisa de SIFÃO próprio DN " + dnChega + " (desconector; orce à parte)"); o.desvioDn = tS.id; }); return rD; }
          return { ok: false, erro: eB.erro + "; pelo tubo de saída " + tS.id + " também não fecha: " + rD.erro, opcoes: [] };
        }
        return { ok: false, erro: eB.erro + ". Pela NBR 8160 o ramal DN " + dnChega + " vai a uma caixa com entrada DN " + dnChega + " (nenhuma no catálogo) ou, com sifão próprio, ao ramal de esgoto: ligue primeiro a saída da caixa e clique no tubo de saída dela", opcoes: [] };
      }
      else if (!eB.ok) return { ok: false, erro: eB.erro, opcoes: [] };
      else { bocasB = eB.bocas; entradasB = bocasB.map(function (b0) { return b0.id; });
        /* a ENTRADA escolhida pela pessoa (14/11/2026: "quando a peça tem mais de uma entrada, pedir qual") — sem ela, a mais alinhada (antes) */
        if (opts.entradaId != null) { var bE = bocasB.filter(function (b0) { return String(b0.id) === String(opts.entradaId); }); if (bE.length) bocasB = bE; } }
    }
    var bocaB = null, rebB = null, LBOCA = 0.15;   // hid:ok 15 cm retos antes da boca: o comprimento da bolsa + a folga até a 1ª conexão (o mesmo toco da saída)
    /* SAÍDA DA CAIXA SIFONADA/RALO (13/11/2026): a saída sai no SENTIDO que o usuário girou a peça (rotY, passos de 45° na colocação) — um toco reto
       da boca da saída para fora, na declividade de norma, e a rota segue da ponta dele. DN da saída = o último número do DN da peça (100x100x50 → 50) */
    var tocoA = null, PkA = A.tipo === "peca" && A.id != null ? arr(estado && estado.instalacoes && estado.instalacoes.pecas).filter(function (k) { return String(k.id) === String(A.id); })[0] : null;
    /* caixa nunca girada (rotY 0, o padrão da colocação): sem toco — o traçado escolhe por onde a saída vai, como antes; o giro da pessoa manda quando existe.
       ⚠ A6 (revisão 13/11/2026): "girada" é o campo saidaGirada (gravado pelo giro e pela colocação girada) — quem girava 8 × 45° voltava a 0° e perdia a
       escolha. Projeto salvo antes do campo: rotY ≠ 0 continua valendo como girada; rotY 0 sem o campo = livre, como sempre foi. */
    /* ⚠ SEMPRE PELA BOCA DE SAÍDA (14/11/2026 — o Rogério: "a saída da caixa sifonada tem que sair da saída mesmo, não pode ficar saindo de
       outro campo; as entradas têm as entradas"). A caixa nunca girada saía do CENTRO (a rota escolhia o lado — e o tubo saía por onde ficava
       uma entrada). Agora: caixa sem giro e SEM tubo ligado → a saída gira para o lado de B (passos de 45°, o mesmo giro da colocação) e o giro
       fica gravado na peça (instAlterar); com tubo já ligado nas bocas, o giro de agora vale (girar moveria as entradas dos tubos ligados).
       opts.saidaRot (rad) = a escolha da pessoa, quando a tela perguntar o lado. */
    var altSaida = null;
    if (PkA && sisRota === "esgoto" && /^(caixa_sifonada|ralo_)/.test(String(PkA.peca))) {
      var girada0 = PkA.saidaGirada === true || Math.abs(num(PkA.rotY, 0)) > EPS, rC0 = num((I.PECAS[PkA.peca] || {}).r, 0.05);   // hid:ok raio de reserva do corpo (geometria)
      var ligada0 = arr(estado && estado.instalacoes && estado.instalacoes.trechos).some(function (t) { return [t.p1, t.p2].some(function (q) { return Math.hypot(q.x - PkA.x, q.z - PkA.z) <= rC0 + 0.06; }); });   // hid:ok 6 cm: a bolsa da boca (geometria)
      var rotN = opts.saidaRot != null ? num(opts.saidaRot, 0) : (!girada0 && !ligada0 ? Math.round(Math.atan2(-(B.z - PkA.z), B.x - PkA.x) / (Math.PI / 4)) * (Math.PI / 4) : null);   // hid:ok passos de 45° (o giro da colocação)
      if (rotN != null && (!girada0 || opts.saidaRot != null)) {
        var Pk2 = {}; Object.keys(PkA).forEach(function (k) { Pk2[k] = PkA[k]; }); Pk2.rotY = r4(rotN); Pk2.saidaGirada = true; PkA = Pk2;
        estado = JSON.parse(JSON.stringify(estado)); arr(estado.instalacoes && estado.instalacoes.pecas).forEach(function (k) { if (String(k.id) === String(PkA.id)) { k.rotY = PkA.rotY; k.saidaGirada = true; } });
        altSaida = { op: "instAlterar", id: PkA.id, rotY: PkA.rotY, saidaGirada: true };
      } else if (!girada0) { var Pk3 = {}; Object.keys(PkA).forEach(function (k) { Pk3[k] = PkA[k]; }); Pk3.saidaGirada = true; PkA = Pk3; }
    }
    if (PkA && sisRota === "esgoto" && /^(caixa_sifonada|ralo_)/.test(String(PkA.peca)) && (PkA.saidaGirada === true || Math.abs(num(PkA.rotY, 0)) > EPS)) {
      var PPa = I.PECAS[PkA.peca] || {}, dnS = num(String(PkA.dn || PPa.dn || "").split("x").pop(), 0) || 50, rot = num(PkA.rotY, 0);   // hid:ok tolerância de desenho / DN de reserva (geometria, não norma)
      var dx = Math.cos(rot), dz = -Math.sin(rot), rC = num(PPa.r, 0.05), yS = opts._yToco != null ? opts._yToco : r4(num(PkA.y, 0) - num(PPa.h, 0.1) + dnS / 2000 + 0.01);   // hid:ok 1 cm: a geratriz de baixo da saída acima do fundo do corpo (geometria)
      /* BOCAS DE CATÁLOGO (13/11/2026, js/hidbocas.js): a saída é a boca de saída da peça (DN do catálogo, no sentido do giro) */
      var bSa = HB() ? HB().bocas(estado, PkA).filter(function (b) { return b.papel === "saida"; })[0] : null;
      if (bSa) { dnS = num(bSa.dn, dnS); if (opts._yToco == null) yS = bSa.y; }
      var iS = num(I.inclinacaoMinima ? I.inclinacaoMinima("esgoto", dnS) : null, 2) / 100;   /* a declividade mínima do DN (a mesma do traçado) */
      var Lt = 0.15, q0 = bSa ? { x: bSa.x, y: yS, z: bSa.z } : { x: r4(PkA.x + dx * rC), y: yS, z: r4(PkA.z + dz * rC) }, q1 = { x: r4(q0.x + dx * Lt), y: r4(yS - iS * Lt), z: r4(q0.z + dz * Lt) };   // hid:ok 15 cm de toco reto: o comprimento da bolsa + a folga até a 1ª conexão (geometria)
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
            var Pc = { x: r4(J.x - ux * d45 + sg * nx * d45), y: 0, z: r4(J.z - uz * d45 + sg * nz * d45) };
            Pc.y = Math.ceil((J.y + iB * Math.hypot(Pc.x - J.x, Pc.z - J.z)) * 10000 - 1e-6) / 10000;   /* para CIMA no 0,1 mm: o arredondamento nunca deixa a junção abaixo da mínima */
            var b45 = bate45(estado, obs45, Pc, J, dnA || 40, Tb.id);   // hid:ok raio = DN/2000 (mm → m) e DN de reserva (geometria)
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
    if (bocasB) {
      var iBc = num(I.inclinacaoMinima ? I.inclinacaoMinima("esgoto", dnA || 40) : null, 2) / 100, r0 = r;   // hid:ok DN de reserva
      /* a ALTURA da entrada a ficha não cota (js/hidfamilias.js Entrada_prof: "o projeto grava a profundidade"): do topo do corpo para baixo, de
         1 em 1 cm, até a geratriz de cima da saída (a entrada fica sempre acima da saída: o fecho hídrico) */
      var yMinE = HB().yMinEntrada(estado, PkB0, dnA || 40);   // hid:ok DN de reserva
      function tentaBoca(b0, yb) {
        var bb = JSON.parse(JSON.stringify(b0)); bb.y = r4(yb);
        var Po = { x: r4(bb.x + bb.dir.x * LBOCA), y: r4(bb.y + iBc * LBOCA), z: r4(bb.z + bb.dir.z * LBOCA) };
        dest[sisRota] = destino({ tipo: "ponto", id: PkB0.id, x: Po.x, y: Po.y, z: Po.z, dn: dnA }, sisRota); entrada.destinos = dest;
        var rr = H.propor(entrada); return arr(rr.opcoes).length ? { r: rr, boca: bb, P: Po } : { r: rr };
      }
      /* desempenho: a mais baixa primeiro (se nem ela fecha, a boca não serve); fechou → busca binária da MAIS ALTA que fecha (1 cm) */
      for (var ib = 0; ib < bocasB.length && !bocaB; ib++) {
        var yTop = bocasB[ib].y, yLo = Math.min(yTop, yMinE), tl = tentaBoca(bocasB[ib], yLo);
        r = tl.r; if (!tl.boca) continue;
        var tt = tentaBoca(bocasB[ib], yTop), achou = tt.boca ? tt : tl;
        if (!tt.boca) { var lo = yLo, hi = yTop; while (hi - lo > 0.01) { var md = (hi + lo) / 2, tm = tentaBoca(bocasB[ib], md); if (tm.boca) { lo = md; achou = tm; } else hi = md; } }   // hid:ok 1 cm de resolução da busca (geometria)
        r = achou.r; bocaB = { boca: achou.boca, P: achou.P };
      }
      /* nenhuma altura do corpo fecha (o ramal chega mais fundo que a entrada mais baixa acima do fecho hídrico): a CAIXA DESCE com o prolongador
         (até BimInst.limiteRebaixo) e os tubos dela descem junto. A entrada NUNCA fica abaixo da saída (revisão 13/11, achado 2): sem rebaixo
         que feche, recusa com os números. */
      var limB = Math.max(0, HB().limiteRebaixo(PkB0) - num(PkB0.rebaixo, 0));
      function tentaRebaixo(dd) {
        var cr = comRebaixo(estado, PkB0, dd), e2 = HB().entradasLivres(cr.estado, cr.pk, A, dnChega); if (!e2.ok) return null;
        var yM = HB().yMinEntrada(cr.estado, cr.pk, dnChega), t2 = tentaBoca(e2.bocas[0], Math.min(e2.bocas[0].y, yM));
        return t2.boca ? { t: t2, b0: e2.bocas[0], yM: yM } : null;
      }
      if (!bocaB && bocasB.length && limB > 0.001 && tentaRebaixo(limB)) {   // hid:ok 1 mm
        var dLo = 0, dHi = limB, okR = tentaRebaixo(limB), ddB = limB;
        while (dHi - dLo > 0.005) { var dm = (dLo + dHi) / 2, tr = tentaRebaixo(dm); if (tr) { dHi = dm; okR = tr; ddB = dm; } else dLo = dm; }   // hid:ok 5 mm de resolução do rebaixo
        ddB = r4(Math.ceil(ddB * 200) / 200); okR = tentaRebaixo(ddB) || okR;   // hid:ok o rebaixo em passos de 5 mm (corte do prolongador)
        var hiE = okR.b0.y, loE = Math.min(okR.b0.y, okR.yM), ach3 = okR.t;
        while (hiE - loE > 0.01) { var mE = (hiE + loE) / 2, tE = tentaBoca(okR.b0, mE); if (tE.boca) { loE = mE; ach3 = tE; } else hiE = mE; }   // hid:ok 1 cm
        var oR = opsRebaixo(estado, avaliarFam, PkB0, ddB);
        if (oR.ops) { r = ach3.r; bocaB = { boca: ach3.boca, P: ach3.P }; rebB = { dd: ddB, ops: oR.ops }; }
      }
      if (!bocaB && bocasB.length) {
        var yM0 = HB().yMinEntrada(estado, PkB0, dnChega);
        return { ok: false, erro: "a entrada da " + txt((I.PECAS[PkB0.peca] || {}).nome).toLowerCase() + " " + PkB0.id + " não fecha: a mais baixa acima do fecho hídrico fica na cota " + yM0.toFixed(3).replace(".", ",") + " m" +
          (limB > 0.001 ? " e nem com o corpo " + Math.round(limB * 100) + " cm mais fundo (o prolongador de catálogo)" : " e esta caixa não tem prolongador com insumo no catálogo") + " o ramal chega com a declividade mínima — " +
          (r.descartadas && r.descartadas[0] ? r.descartadas[0].motivo : "sem altura") + ". Use caixa mais alta, suba o ramal ou ligue noutra caixa", opcoes: [], descartadas: r.descartadas, pendencias: r.pendencias };
      }
      if (!bocaB) return { ok: false, erro: "nenhuma entrada livre da " + txt((I.PECAS[PkB0.peca] || {}).nome).toLowerCase() + " " + PkB0.id + " fecha a rota: " + (r.descartadas && r.descartadas[0] ? r.descartadas[0].motivo : (r0.descartadas && r0.descartadas[0] ? r0.descartadas[0].motivo : "sem altura")), opcoes: [], descartadas: r.descartadas, pendencias: r.pendencias };
    }
    /* LIGAR POR CLIQUE (13/11/2026): o destino CAIXA SIFONADA / RALO / CAIXA DE INSPEÇÃO recebe o tubo em qualquer altura da captura do corpo — a
       cota do clique (logo abaixo da grelha) é só a 1ª tentativa. O esgoto chega com a declividade de norma (HidRota) e, sem altura, a entrada desce
       no corpo da peça de 2 em 2 cm até o fundo útil (a geratriz de baixo do tubo acima do fundo da peça). Nunca acima do clique. */
    var Pk = B.tipo === "peca" && B.id != null ? arr(estado && estado.instalacoes && estado.instalacoes.pecas).filter(function (k) { return String(k.id) === String(B.id); })[0] : null;
    var PP = Pk ? I.PECAS[Pk.peca] : null;
    if (sisRota === "esgoto" && PP && !bocasB && !arr(r.opcoes).length) {
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
      /* REBAIXO DA CAIXA (13/11/2026): a boca de saída é FIXA no corpo (catálogo). O destino mais baixo que a saída pede uma descida logo depois
         da caixa (par de joelhos 90°): em vez disso a CAIXA DESCE — o corpo com o prolongamento do catálogo, a grelha no piso acabado — até o
         limite do prolongamento; os tubos já ligados nela descem junto (o arraste de js/biminstarr.js) e a entrada é refeita com eles. */
      if (bSa) {
        var queda = vt.p1.y - vt.p2.y, lim = Math.max(0, HB().limiteRebaixo(PkA) - num(PkA.rebaixo, 0)), dd = r4(Math.min(queda, lim)), ARR = dep("BimInstArr", "./biminstarr.js");
        o.toco = JSON.parse(JSON.stringify(tocoA));
        if (!(dd >= 0.001)) { if (queda > 0.001) o.avisos.push("a caixa " + txt(PkA.id) + " não tem prolongamento no catálogo para descer: a saída desce " + (queda * 100).toFixed(1).replace(".", ",") + " cm logo depois dela"); return; }   // hid:ok 1 mm
        var oRa = opsRebaixo(estado, avaliarFam, PkA, dd);
        if (!oRa.ops) { o.avisos.push("a caixa " + txt(PkA.id) + " não pôde descer (" + oRa.erro + "): a saída desce logo depois dela"); return; }
        o.rebaixoOps = oRa.ops;
        o.toco.p1.y = r4(o.toco.p1.y - dd); o.toco.p2.y = r4(o.toco.p2.y - dd);
        /* o resto (o prolongador acabou) cabe no próprio toco sem passar da declividade MÁXIMA (NBR 8160, es8160.declividade_maxima)? o toco desce
           mais e some o degrau vertical (um tubo vertical de milímetros entre o toco e a rota virava cruzeta) */
        var rem = queda - dd, NNm = dep("HidNormas", "./hidnormas.js"), tMx = null; try { tMx = NNm && NNm.tabela ? NNm.tabela("es8160.declividade_maxima") : null; } catch (eM) { tMx = null; }
        var iMx = tMx && tMx.linhas && tMx.linhas[0] ? num(tMx.linhas[0].valor, 0) / 100 : 0, Lto = Math.hypot(o.toco.p2.x - o.toco.p1.x, o.toco.p2.z - o.toco.p1.z);
        if (rem > 1e-4 && iMx > 0 && Lto > 0 && ((o.toco.p1.y - o.toco.p2.y) + rem) / Lto <= iMx + 1e-9) { o.toco.p2.y = r4(o.toco.p2.y - rem); rem = 0; }
        /* ou no 1º horizontal depois dele (ele começa mais alto, na cota do toco, e fica mais inclinado — até a máxima) */
        var hz1 = rem > 1e-4 && iMx > 0 ? arr(o.ops).filter(function (x) { return x.op === "trecho" && x !== vt && Math.abs(x.p1.x - vt.p2.x) + Math.abs(x.p1.z - vt.p2.z) + Math.abs(x.p1.y - vt.p2.y) < 1e-3; })[0] : null;   // hid:ok 1 mm
        var Lh1 = hz1 ? Math.hypot(hz1.p2.x - hz1.p1.x, hz1.p2.z - hz1.p1.z) : 0;
        var mesmaDir = hz1 && Lto > 0 && Lh1 > 0 && Math.abs((hz1.p2.x - hz1.p1.x) / Lh1 - (o.toco.p2.x - o.toco.p1.x) / Lto) + Math.abs((hz1.p2.z - hz1.p1.z) / Lh1 - (o.toco.p2.z - o.toco.p1.z) / Lto) < 2e-3;   // hid:ok mesma direção (arredondamento)
        if (mesmaDir && (o.toco.p1.y - hz1.p2.y) / (Lto + Lh1) <= iMx + 1e-9) {   /* na mesma direção: UMA reta da boca até o fim dele (vira um tubo só, sem luva) */
          var iU = (o.toco.p1.y - hz1.p2.y) / (Lto + Lh1), yJ = r4(o.toco.p1.y - iU * Lto); o.toco.p2.y = yJ; hz1.p1 = { x: hz1.p1.x, y: yJ, z: hz1.p1.z }; rem = 0;
        } else if (hz1 && Lh1 > 0.05 && (hz1.p1.y + rem - hz1.p2.y) / Lh1 <= iMx + 1e-9) { hz1.p1 = { x: hz1.p1.x, y: r4(hz1.p1.y + rem), z: hz1.p1.z }; rem = 0; }   // hid:ok 5 cm
        if (rem <= 1e-4) o.ops = o.ops.filter(function (x) { return x !== vt; }); else vt.p1 = { x: vt.p1.x, y: r4(vt.p1.y - dd), z: vt.p1.z };
        o.avisos.push("o corpo da caixa " + txt(PkA.id) + " desceu " + (dd * 100).toFixed(1).replace(".", ",") + " cm com o prolongador (grelha no piso acabado; o prolongador entra no orçamento); os tubos ligados nela desceram junto");
        return;
      }
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
      if (altSaida) { ops = [JSON.parse(JSON.stringify(altSaida))].concat(ops); o.avisos = arr(o.avisos); o.avisos.push("a saída da " + txt((I.PECAS[PkA.peca] || {}).nome).toLowerCase() + " " + PkA.id + " foi virada para o lado da ligação (a peça girou " + Math.round(PkA.rotY * 180 / Math.PI) + "°)"); }
      if (bocaB) ops.push({ op: "trecho", id: par.prefixo + "boca", sistema: sis, material: (ops[ops.length - 1] || {}).material || "pvc_esgoto", dn: dnA || num(bocaB.boca.dn, 40), p1: bocaB.P, p2: { x: bocaB.boca.x, y: bocaB.boca.y, z: bocaB.boca.z } });   // hid:ok DN de reserva
      ops = unirColineares(ops, arr(estado && estado.instalacoes && estado.instalacoes.trechos).filter(function (t) { return String(t.id) !== String(B.trecho) && String(t.id) !== String(A.trecho); }));
      var av = o.avisos.slice(); if (avisoBoca) av.push(avisoBoca); if (bocaB) av.push("entra na " + bocaB.boca.id.replace("entrada", "entrada ") + " (DN " + bocaB.boca.dn + ") da caixa " + txt(PkB0.id));
      if (rebB) av.push("o corpo da caixa " + txt(PkB0.id) + " desceu " + (rebB.dd * 100).toFixed(1).replace(".", ",") + " cm com o prolongador para a entrada ficar acima do fecho hídrico; os tubos ligados nela desceram junto");
      return { estrategia: o.estrategia, nome: o.nome, ops: arr(rebB && rebB.ops).concat(arr(o.rebaixoOps)).concat(antes.concat(ops)), rebaixoB: rebB ? rebB.dd : 0, comprimento: o.comprimento, avisos: av, boca: bocaB ? bocaB.boca : null, rebaixo: o.rebaixoOps ? true : false };
    });
    if (!opcoes.length && tocoA && B.y != null && num(B.y, 0) > tocoA.p2.y - 0.005) return { ok: false, erro: "a saída da caixa " + txt(PkA.id) + " (cota " + tocoA.p2.y.toFixed(2).replace(".", ",") + " m) fica abaixo do ponto de chegada (cota " + num(B.y, 0).toFixed(2).replace(".", ",") + " m): o esgoto não sobe — ligue a caixa mais a jusante (onde o tubo está mais fundo) ou direto na caixa de inspeção", opcoes: [], descartadas: r.descartadas, pendencias: r.pendencias };   // hid:ok 5 mm: tolerância de desenho
    if (!opcoes.length) return { ok: false, erro: (r.descartadas[0] ? r.descartadas[0].motivo : (r.pendencias[0] ? r.pendencias[0].motivo : "nenhuma rota fechou")), opcoes: [], descartadas: r.descartadas, pendencias: r.pendencias };
    /* as escolhas que a tela pode oferecer (Tab): as entradas livres da caixa de destino e, na caixa de origem sem tubo, os lados da saída */
    var lados = null; if (altSaida || (PkA && opts.saidaRot != null)) lados = [0, 1, 2, 3, 4, 5, 6, 7].map(function (q) { return r4(q * Math.PI / 4); });   // hid:ok os 8 giros de 45° da colocação
    return { ok: true, opcoes: opcoes, descartadas: r.descartadas, pendencias: r.pendencias, entradasB: entradasB, saidaRot: PkA && (altSaida || opts.saidaRot != null) ? PkA.rotY : null, ladosSaida: lados };
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
