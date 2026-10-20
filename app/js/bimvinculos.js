/* =====================================================================
 * bimvinculos.js — VÍNCULOS: o que está amarrado acompanha (motor PURO,
 * ES5, sem DOM, Node-testável). 14/10/2026, frente S13.
 *
 * Pedido do Rogério (14/10/2026): "tenho uma parede onde elas estão
 * fechadas, tudo. Quero deixar o cômodo um pouquinho mais largo. Quando eu
 * puxar essa parede, as outras paredes que estão junto têm que acompanhar
 * [...] Ela não pode ficar sozinha e eu ter que depois estender o restante.
 * [...] Na estrutura metálica também: se eu puxar um elemento e os outros
 * estiverem amarrados nele, eles vêm junto, a viga acompanha. Vale para tudo."
 *
 * O QUE ACONTECIA: mover uma parede (arrastar, Mover, cota temporária) ou
 * esticar pela alça mexia SÓ nela. As vizinhas ficavam onde estavam: o canto
 * abria (fresta) ou a parede passava da outra (sobra), e a pessoa tinha de
 * esticar uma por uma. Na metálica, o pilar movido deixava a viga no ar.
 *
 * A REGRA (uma só, para parede e para barra)
 *   1. A topologia é LIDA NA HORA do arraste, da geometria de antes — nada
 *      novo é gravado (sem migração de dado). Ver `ligacoes`.
 *   2. Depois de transformar o elemento movido, cada elemento LIGADO a ele
 *      mantém a DIREÇÃO e reposiciona SÓ a ponta ligada: ela vai para a
 *      interseção da linha dele com o eixo NOVO do movido, com o mesmo
 *      afastamento que tinha (a parede que parava na FACE da outra continua
 *      parando na face). A ponta livre fica exatamente onde está.
 *   3. As pontas do próprio movido que estavam presas numa peça parada
 *      voltam para a linha dela (o canto fecha: sem fresta nem sobra).
 *      Exceção: a ponta que a pessoa ARRASTA pela alça — ali manda o cursor.
 *   4. Em cadeia, cada elemento é processado uma vez (sem laço). Como quem
 *      acompanha só estica ao longo da própria linha, a cadeia só segue pela
 *      emenda colinear (a junta anda na mesma reta).
 *   5. Paralelo, ângulo fechado demais, linha que não encontra o eixo novo
 *      (barra fora do plano do movimento), peça fixada ou que ficaria com
 *      comprimento zero: NÃO estica, AVISA e deixa a peça como está. Nunca
 *      gira uma peça para "dar um jeito" — a pessoa decide.
 *
 * O QUE É LIGADO A QUÊ (`ligacoes`)
 *   PAREDE × PAREDE (no plano, com as tolerâncias do BimArq.juntas e do
 *   js/bimuniao.js, para o vínculo valer exatamente onde a união é desenhada):
 *     L ... ponta sobre ponta (3 cm), ou o canto pela proximidade (a 2ª
 *           parede começou no canto da FACE da 1ª: meia espessura da outra
 *           ÷ sen θ + 1 cm);
 *     T ... ponta dentro da faixa da outra (meia espessura dela + a folga do
 *           T), longe das pontas dela;
 *     I ... emenda colinear (pontas a 3 cm, mesma reta): a junta anda junto
 *           SÓ ao longo da reta; puxada de lado, a outra é paralela e avisa;
 *     X ... cruzamento no miolo das duas: NÃO propaga (não há ponta ligada).
 *     Fora: parede curva, "Unir" desligado na parede, "Desunir geometria"
 *     no par, paredes que não se sobrepõem na altura.
 *   BARRA × BARRA (3D: perfil da Metálica e pilar/viga da aba Estrutura, de
 *   qualquer material): ponta de viga/diagonal/terça sobre o EIXO de um
 *   pilar ou de outra viga, em qualquer altura (a tolerância do cálculo da
 *   metálica, js/acomodelolivre.js: 1 cm + meia seção de cada); a ponta de
 *   diagonal que a ligação recuou até 60 cm do nó também conta.
 *   PILAR × SAPATA/BLOCO: a base sobre a fundação (o mesmo `fundacaoSob` do
 *   js/acoligfundacao.js). A sapata de UM pilar acompanha o pilar; a de mais
 *   de um, o radier e o baldrame ficam — e se a base sair de cima, avisa.
 *   DESLIGAR UNIÃO por ponta: `vinculoSolto: { a: true }` no elemento (op
 *   "vinculoPonta"; sem a marca = ligado). A ponta solta não puxa nem é
 *   puxada.
 *
 * AS CONSEQUÊNCIAS (o que muda junto e o que fica velho)
 *   · porta e janela: a do movido anda com ele (posição relativa); a da
 *     parede que esticou fica no mesmo lugar (o replay do `esticar`); se ela
 *     cair fora da parede, avisa;
 *   · ligação desenhada (placa, chapa, parafuso: caixas com `metal.lig`):
 *     se todos os membros concordam no deslocamento do nó, as peças andam
 *     junto (transformar) e os furos dos membros são reposicionados
 *     (metalFuros); senão, avisa "refazer a ligação";
 *   · a ligação DIMENSIONADA (a peça com `ligInfo`) de um membro que mudou
 *     ganha `desatualizado` (op "vinculoDesatualizar"): o memorial e as
 *     pranchas dizem DESATUALIZADO até ser refeita ou recalculada;
 *   · o cálculo da metálica guarda a `assinatura` da geometria e a confere
 *     ao mostrar (js/metalcalclivreui.js);
 *   · os quantitativos do BIM são refeitos a cada op, e o levantamento da
 *     conferência com o orçamento já morre quando o modelo muda (gestao.js,
 *     v1.1.233);
 *   · laje e piso: a laje por contorno guarda SÓ o polígono (js/bimarq.js
 *     lajeContorno), sem as paredes de onde saiu — ela NÃO acompanha.
 *     PENDÊNCIA: gravar a fonte (ids das paredes) na laje antes de ligá-la
 *     aqui; inventar o elo pela geometria seria adivinhar. (O ambiente e o
 *     forro automático já se refazem das paredes no replay.)
 *
 * Teste: node tools/test-bimvinculos.js
 * ===================================================================== */
(function (global) {
  "use strict";

  var TOL_L = 0.03;        /* L e emenda: pontas a 3 cm (o TOL do BimArq.juntas) */
  var TOL_UNIAO = 0.01;    /* 1 cm além da meia espessura (js/bimuniao.js) */
  var TOL_B = 0.01;        /* barras: 1 cm além das meias seções (js/acomodelolivre.js) */
  var SEN_MIN = 0.17;      /* ~10°: abaixo disso a ponta iria longe (o mesmo limite do encontroL) */
  var RECUO_DIAG = 0.6;    /* a ponta de diagonal recuada pela ligação (js/acomodelolivre.js, SIMULAÇÃO S2) */
  var GAP_MAX = 0.005;     /* barra: a linha pode se afastar do eixo novo no máximo 5 mm a mais do que já estava */
  var PERTO_LIG = 0.75;    /* a ligação desenhada mora na ponta do membro se o centro dela está a até 75 cm */
  var TOL_DELTA = 0.002;   /* membros de uma ligação "concordam" no deslocamento do nó a 2 mm */

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  function Prec() { return dep("BimPrecisao", "./bimprecisao.js"); }
  function Arq() { return dep("BimArq", "./bimarq.js"); }
  function Cri() { return dep("MetalCriar", "./metalcriar.js"); }
  function Met() { return dep("BimMetal", "./metalpeca.js"); }
  function Fund() { return dep("AcoLigFundacao", "./acoligfundacao.js"); }
  function Edi() { return dep("BimEdit", "./bimedit.js"); }
  function Elev() { return dep("BimElevar", "./bimelevar.js"); }

  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function mul(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function unit(a) { var l = len(a); return l > 1e-12 ? mul(a, 1 / l) : null; }
  function dist(a, b) { return len(sub(a, b)); }
  function sen(u, v) { return len(cross(u, v)); }
  function outra(k) { return k === "a" ? "b" : "a"; }
  function br(v, c) { c = c == null ? 2 : c; return (Math.round(v * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }

  /* ================================================================ PEÇAS LINEARES
   * A linha de cada peça, no mundo: { id, el, k, dim, a, b, u (a→b), L, h,
   * y0, y1, papel }. Parede: o EIXO da caixa no PLANO (y = 0 nas contas — a
   * união das paredes é de planta). Barra: a linha de cálculo 3D (a que o
   * engenheiro clicou, MetalCriar.linhaAtual; pilar/viga da Estrutura como o
   * js/acomodelolivre.js lê). */
  function pecaDe(c) {
    if (!c || c.id == null) return null;
    var p = null;
    if (c.tipo === "parede") {
      if (c.arco) return null;   /* parede curva: fica de fora (o arco não tem "a linha" para a interseção) */
      var L = num(c.comprimento, 0), t = num(c.espessura, 0), th = num(c.rotY, 0), co = Math.cos(th), si = Math.sin(th);
      if (!(L > 0.01) || !(t > 0)) return null;
      var cx = num(c.cx, 0), cz = num(c.cz, 0), H = num(c.altura, 0);
      p = { k: "parede", dim: 2, a: [cx - co * L / 2, 0, cz + si * L / 2], b: [cx + co * L / 2, 0, cz - si * L / 2], h: t,
            y0: num(c.cy, 0) - H / 2, y1: num(c.cy, 0) + H / 2 };
    } else if ((c.tipo === "pilar" || c.tipo === "viga") && !c.metal) {
      var th2 = num(c.rotY, 0), co2 = Math.cos(th2), si2 = Math.sin(th2);
      if (c.tipo === "pilar") {
        var Hp = num(c.altura, 0), y0 = c.basePilar != null ? num(c.basePilar, 0) : num(c.cy, 0) - Hp / 2, inc = c.estilo === "inclinado";
        var a0 = [num(c.cx, 0), y0, num(c.cz, 0)];
        p = { k: "pilarE", dim: 3, a: a0, b: [a0[0] + (inc ? num(c.topoDx, 0) : 0), y0 + Hp, a0[2] + (inc ? num(c.topoDz, 0) : 0)],
              h: Math.max(num(c.comprimento, 0.2), num(c.espessura, 0.2)), papel: "Pilar" };
      } else {
        var Lh = num(c.comprimento, 0), topo = c.topoViga != null ? num(c.topoViga, 0) : num(c.cy, 0) + num(c.altura, 0) / 2;
        p = { k: "vigaE", dim: 3, a: [num(c.cx, 0) - co2 * Lh / 2, topo + num(c.dIni, 0), num(c.cz, 0) + si2 * Lh / 2],
              b: [num(c.cx, 0) + co2 * Lh / 2, topo + num(c.dFim, 0), num(c.cz, 0) - si2 * Lh / 2],
              h: Math.max(num(c.altura, 0.4), num(c.espessura, 0.14)), papel: "Viga" };
      }
    } else if (c.tipo === "metal" && c.metal && c.metal.kind === "perfil" && !c.metal.lig) {
      var MC = Cri(), BM = Met(); if (!MC || !BM) return null;
      var li; try { li = MC.linhaAtual(c); } catch (e) { return null; }
      if (!li || !li.a || !li.b) return null;
      var ds = {}; try { ds = BM.secao(c.metal.perfil) || {}; } catch (e2) { ds = {}; }
      p = { k: "barra", dim: 3, a: [num(li.a[0], 0), num(li.a[1], 0), num(li.a[2], 0)], b: [num(li.b[0], 0), num(li.b[1], 0), num(li.b[2], 0)],
            h: Math.max(num(ds.alt, 0.2), num(ds.larg, 0.1)), papel: String(c.metal.papel || "") };
    }
    if (!p) return null;
    p.id = String(c.id); p.el = c;
    var d = sub(p.b, p.a); p.L = len(d); p.u = p.L > 1e-9 ? mul(d, 1 / p.L) : null;
    if (!p.u || !(p.L > 0.01)) return null;
    if (p.y0 == null) { p.y0 = Math.min(p.a[1], p.b[1]); p.y1 = Math.max(p.a[1], p.b[1]); }
    return p;
  }
  /* a direção de SAÍDA na ponta k (do corpo para a ponta) */
  function saida(p, k) { return k === "b" ? p.u : mul(p.u, -1); }
  function solto(el, k) { return !!(el && el.vinculoSolto && el.vinculoSolto[k]); }
  function ehDiagonal(p) { return p.k === "barra" && /contravent|diagonal|tirante/i.test(p.papel || ""); }
  function ehPilar(p) { return p.k === "pilarE" || (p.dim === 3 && (/pilar/i.test(p.papel || "") || Math.abs(p.u[1]) > Math.cos(15 * Math.PI / 180))); }
  function desunidas(A, B) {
    var BA = Arq(); if (!BA || !BA.geoUniao) return false;
    try { return BA.geoUniao(A.el, B.el).unida === false; } catch (e) { return false; }
  }
  /* projeção de E na reta de A: s ao longo (a partir de A.a) e w (afastamento) */
  function local(A, E) { var v = sub(E, A.a), s = dot(v, A.u); return { s: s, w: len(sub(v, mul(A.u, s))) }; }
  /* as duas retas P + s·d e Q + t·e: os pontos mais próximos (p na 1ª, q na 2ª) e o afastamento.
     null se quase paralelas (sen < senMin, padrão ~10°) */
  function interLinhas(P, d, Q, e, senMin) {
    var b = dot(d, e), den = 1 - b * b;
    if (den < Math.pow(senMin == null ? SEN_MIN : senMin, 2)) return null;
    var r = sub(P, Q), dd = dot(d, r), ee = dot(e, r);
    var s = (b * ee - dd) / den, t = (ee - b * dd) / den;
    var p = add(P, mul(d, s)), q = add(Q, mul(e, t));
    return { p: p, q: q, s: s, t: t, gap: dist(p, q) };
  }

  /* ================================================================ LIGAÇÕES
   * Lista dirigida: { b, kb, a, ka, tipo } = "a ponta kb da peça b está presa
   * na peça a" (tipo L, T, I, no, meio; ka = a ponta de a, quando é ponta com
   * ponta). Cada par em L/I aparece nas duas direções. */
  function ligacoes(pecas) {
    var out = [], temL = {};
    function push(b, kb, a, ka, tipo, ex) { var o = { b: b.id, kb: kb, a: a.id, ka: ka, tipo: tipo }; if (ex) Object.keys(ex).forEach(function (k) { o[k] = ex[k]; }); out.push(o); }
    var W = pecas.filter(function (p) { return p.k === "parede"; }), B3 = pecas.filter(function (p) { return p.dim === 3; });
    var i, j;
    /* ---- PAREDES: L e emenda (ponta com ponta). Mais de duas paredes no mesmo canto: todas se ligam */
    for (i = 0; i < W.length; i++) for (j = i + 1; j < W.length; j++) {
      var A = W[i], B = W[j];
      if (!uneParede(A) || !uneParede(B) || !sobrepoeY(A, B) || desunidas(A, B)) continue;
      ["a", "b"].forEach(function (ka) {
        ["a", "b"].forEach(function (kb) {
          if (solto(A.el, ka) || solto(B.el, kb)) return;
          var EA = A[ka], EB = B[kb], dA = saida(A, ka), dB = saida(B, kb), cr = sen(dA, dB);
          if (dist(EA, EB) <= TOL_L) {
            if (cr < 0.02) { if (dot(dA, dB) < 0) { push(B, kb, A, ka, "I"); push(A, ka, B, kb, "I"); temL[B.id + kb] = temL[A.id + ka] = 1; } return; }
            push(B, kb, A, ka, "L"); push(A, ka, B, kb, "L"); temL[B.id + kb] = temL[A.id + ka] = 1; return;
          }
          /* o canto pela PROXIMIDADE (js/bimuniao.js encontroL): as duas pontas a menos de meia espessura da
             OUTRA ÷ sen θ + 1 cm do encontro dos eixos — a 2ª parede começou no canto da face da 1ª */
          if (cr < SEN_MIN) return;
          var X = interLinhas(EA, dA, EB, dB); if (!X) return;
          if (Math.abs(X.s) <= B.h / 2 / cr + TOL_UNIAO && Math.abs(X.t) <= A.h / 2 / cr + TOL_UNIAO) {
            push(B, kb, A, ka, "L"); push(A, ka, B, kb, "L"); temL[B.id + kb] = temL[A.id + ka] = 1;
          }
        });
      });
    }
    /* ---- PAREDES: T (a ponta morre dentro da outra, longe das pontas dela) — a regra do BimArq.juntas */
    W.forEach(function (B) {
      if (!uneParede(B)) return;
      ["a", "b"].forEach(function (kb) {
        if (temL[B.id + kb] || solto(B.el, kb)) return;
        var EB = B[kb], Eo = B[outra(kb)];
        for (var q = 0; q < W.length; q++) {
          var A = W[q]; if (A === B || !uneParede(A) || !sobrepoeY(A, B) || desunidas(A, B)) continue;
          if (sen(A.u, B.u) < 0.2) continue;   /* quase paralelas: não é T */
          var lc = local(A, EB), folga = Math.max(0.03, B.h / 2 + TOL_UNIAO);
          if (lc.w > A.h / 2 + folga || lc.s < -TOL_L || lc.s > A.L + TOL_L) continue;
          if (local(A, Eo).w <= A.h / 2) continue;   /* a outra ponta não sai de A: não é T */
          push(B, kb, A, null, "T");
          break;
        }
      });
    });
    /* ---- BARRAS (3D): ponta sobre o eixo de outra barra, em qualquer altura */
    B3.forEach(function (B) {
      ["a", "b"].forEach(function (kb) {
        if (solto(B.el, kb)) return;
        var EB = B[kb], dB = saida(B, kb);
        B3.forEach(function (A) {
          if (A === B) return;
          var tol = TOL_B + 0.5 * (A.h + B.h), lc = local(A, EB), par = sen(A.u, B.u) < 0.02;
          var sc = Math.max(0, Math.min(A.L, lc.s)), dc = dist(EB, add(A.a, mul(A.u, sc)));
          var ka = dist(EB, A.a) <= tol ? "a" : (dist(EB, A.b) <= tol ? "b" : null);
          if (ka && solto(A.el, ka)) return;
          if (dc <= tol) {
            if (par) { if (ka && dot(saida(A, ka), dB) < 0) push(B, kb, A, ka, "I"); return; }
            push(B, kb, A, ka, ka ? "no" : "meio");
            return;
          }
          /* a ponta de DIAGONAL que a ligação desenhada recuou: até 60 cm do nó, NA LINHA da diagonal */
          if (par || !ehDiagonal(B)) return;
          var X = interLinhas(EB, dB, A.a, A.u, 0.2); if (!X) return;
          if (X.s > 0 && X.s <= RECUO_DIAG && X.gap <= tol && X.t >= -tol && X.t <= A.L + tol) {
            var ka2 = dist(X.q, A.a) <= tol ? "a" : (dist(X.q, A.b) <= tol ? "b" : null);
            if (ka2 && solto(A.el, ka2)) return;
            push(B, kb, A, ka2, ka2 ? "no" : "meio", { recuo: r4(X.s) });
          }
        });
      });
    });
    return out;
  }
  /* "Unir" desligado na parede: ela não se une com ninguém (BimArq.juntas filtra c.unir !== false) */
  function uneParede(p) { return !!p && !!p.el && p.el.unir !== false; }
  /* as duas paredes se sobrepõem na altura (5 cm, como o BimArq.juntas) */
  function sobrepoeY(A, B) { return Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0) > 0.05; }

  /* ================================================================ A PONTA NOVA
   * A ponta kb da peça B (geometria de ANTES) presa na peça A, que passou de
   * A0 para A1. B mantém a direção: a ponta vai para a interseção da linha de
   * B com o eixo novo de A, com o mesmo afastamento (λ, ao longo de B) que
   * tinha do eixo antigo. → { p } ou { erro, motivo } */
  function novaPonta(B, kb, tipo, ka, A0, A1) {
    var E = B[kb], Q = B[outra(kb)], dB = unit(sub(E, Q)), p;
    if (!dB) return { erro: "curta", motivo: "a peça não tem comprimento" };
    if (tipo === "I") {
      /* emenda colinear: a junta anda junto SÓ se o movido continua na mesma reta */
      if (!ka) return { erro: "paralela", motivo: "é paralela à peça movida" };
      var P1 = A1[ka], w1 = len(sub(sub(P1, Q), mul(dB, dot(sub(P1, Q), dB))));
      if (w1 > 1e-3 || sen(A1.u, dB) > 1e-3) return { erro: "paralela", motivo: "é paralela à peça movida (emenda na mesma reta) — puxada de lado, ela não tem como acompanhar sem girar" };
      p = add(P1, mul(dB, dot(sub(E, A0[ka]), dB)));
    } else {
      var X0 = interLinhas(Q, dB, A0.a, A0.u), X1 = interLinhas(Q, dB, A1.a, A1.u);
      if (!X0 || !X1) return { erro: "paralela", motivo: "ficaria paralela (ou quase) à peça movida" };
      if (B.dim === 3 && X1.gap > X0.gap + GAP_MAX) return { erro: "inviavel", motivo: "a linha dela não encontra o eixo novo (o movimento sai do plano dela) — acompanhar exigiria girá-la" };
      p = add(X1.p, mul(dB, dot(sub(E, X0.p), dB)));
      if (tipo === "T" || tipo === "meio") {
        var m = (B.dim === 3 ? TOL_B + 0.5 * B.h : TOL_L + B.h / 2);
        if (X1.t < -m || X1.t > A1.L + m) return { erro: "fora", motivo: "ficaria fora do comprimento da peça movida" };
      }
    }
    if (dot(sub(p, Q), dB) < 0.05) return { erro: "curta", motivo: "ficaria com comprimento zero ou do avesso" };
    return { p: p };
  }
  /* a ponta kb do MOVIDO (A0 → A1) levada de volta à linha da peça parada C: o movido mantém a direção nova */
  function pontaPresa(A0, A1, kb, C) {
    var E0 = A0[kb], Q1 = A1[outra(kb)], dA = unit(sub(A1[kb], Q1)); if (!dA) return null;
    var dA0 = saida(A0, kb);
    var X0 = interLinhas(E0, dA0, C.a, C.u), X1 = interLinhas(Q1, dA, C.a, C.u);
    if (!X0 || !X1) return null;
    if (A0.dim === 3 && X1.gap > X0.gap + GAP_MAX) return null;
    var p = add(X1.p, mul(dA, dot(sub(E0, X0.p), dA0)));
    if (dot(sub(p, Q1), dA) < 0.05) return null;
    return p;
  }

  /* ================================================================ PILHA (união de canto, 20/10/2026)
   * Paredes EMPILHADAS na mesma linha (mureta, viga, parede alta: base e topo diferentes, MESMO eixo) são UMA frente
   * para o canto. Roteiro do defeito (print do caixote, 1.2.163): a frente em 3 peças foi girada/arrastada; só a peça
   * clicada andou ou as laterais não acompanharam, e os cantos ficaram abertos. Aqui: quem tem o eixo coincidente
   * (pontas a 2 cm, em qualquer ordem) anda junto. → [{ id, inv }] (inv: a ponta "a" de uma é a "b" da outra). */
  var TOL_PILHA = 0.02;
  function pilhaDe(estado, id) {
    var caixas = arr(estado && estado.caixas), alvo = null, out = [];
    caixas.forEach(function (c) { if (c && String(c.id) === String(id)) alvo = pecaDe(c); });
    if (!alvo || alvo.k !== "parede") return out;
    caixas.forEach(function (c) {
      if (!c || String(c.id) === String(id) || c.fixo) return;
      var q = pecaDe(c); if (!q || q.k !== "parede") return;
      if (dist(q.a, alvo.a) <= TOL_PILHA && dist(q.b, alvo.b) <= TOL_PILHA) out.push({ id: q.id, inv: false });
      else if (dist(q.a, alvo.b) <= TOL_PILHA && dist(q.b, alvo.a) <= TOL_PILHA) out.push({ id: q.id, inv: true });
    });
    return out;
  }

  /* ================================================================ PREPARAR
   * A topologia de ANTES, uma vez por arraste (a prévia chama `propagar` a
   * cada movimento do mouse e não refaz o n² das ligações). */
  function preparar(estado) {
    var caixas = arr(estado && estado.caixas), porId = {}, pecas = {}, lista = [];
    caixas.forEach(function (c) { if (c && c.id != null) porId[String(c.id)] = c; });
    caixas.forEach(function (c) { var p = pecaDe(c); if (p) { pecas[p.id] = p; lista.push(p); } });
    return { estado: estado, porId: porId, pecas: pecas, lista: lista, L: ligacoes(lista), metalLig: ligacoesDesenhadas(caixas) };
  }
  /* as ligações DESENHADAS: lig → { pecas:[ids], membros:{id:1}, info:id da peça com ligInfo, c (centro) } */
  function ligacoesDesenhadas(caixas) {
    var G = {};
    function g(k) { return G[k] || (G[k] = { lig: k, pecas: [], membros: {}, info: [], soma: [0, 0, 0] }); }
    caixas.forEach(function (c) {
      if (!c || c.id == null) return;
      var m = c.metal;
      if (m && m.lig != null) {
        var L = g(String(m.lig)); L.pecas.push(String(c.id));
        L.soma = add(L.soma, [num(c.cx, 0), num(c.cy, 0), num(c.cz, 0)]);
        if (m.soldadaEm != null) L.membros[String(m.soldadaEm)] = 1;
        if (c.ligInfo) L.info.push(String(c.id));
      }
      arr(c.metalFuros).forEach(function (f) {
        if (!f || f.lig == null) return;
        var L2 = g(String(f.lig)); L2.membros[String(c.id)] = 1;
        /* onde o furo está no mundo: é o lugar da ligação quando ela só tem furos (sem chapa desenhada) */
        var BM = Met(), w = null; try { var mb = BM && BM.membro(c); w = mb ? BM.furoMundo(mb, f) : null; } catch (e) { w = null; }
        if (w && w.P) { L2.fsoma = add(L2.fsoma || [0, 0, 0], w.P); L2.nf = (L2.nf || 0) + 1; }
      });
    });
    Object.keys(G).forEach(function (k) {
      var L = G[k]; L.c = L.pecas.length ? mul(L.soma, 1 / L.pecas.length) : (L.nf ? mul(L.fsoma, 1 / L.nf) : null);
      delete L.soma; delete L.fsoma; delete L.nf;
    });
    return G;
  }

  /* ================================================================ PROPAGAR
   * estado = o estado AVALIADO do editor (caixas, familias, fundacoes…); op =
   * a op que a pessoa fez: transformar (mover, sem cópia), mover (a cota
   * temporária), esticar (a alça) ou metalAjustar. o = { solto (mover
   * sozinho: devolve a op como veio), prep (de `preparar`), previa (só as
   * linhas, sem refazer as barras), novoId(prefixo), nome(el), em (data) }.
   * → { op (a op para gravar: a mesma, ou um LOTE — um Ctrl+Z desfaz tudo),
   *     principal, ajustes:[ops], acompanharam:[ids], avisos:[texto],
   *     pendentes:[{id, ponta, motivo}], linhas:{id:{a,b}} (a linha nova de
   *     cada peça que muda), caixas:{id: caixa prevista}, presas, resumo } */
  function propagar(estado, op, o) {
    o = o || {};
    var res = { ok: true, op: op, principal: op, ajustes: [], acompanharam: [], avisos: [], pendentes: [], linhas: {}, caixas: {}, presas: 0, ligacoes: [], fundacoes: [], resumo: "" };
    if (!op || o.solto) return fechar(res);
    var P = Prec(); if (!P) { res.avisos.push("Vínculos: o motor de precisão (js/bimprecisao.js) não carregou — só a peça movida andou."); return fechar(res); }
    var prep = o.prep && o.prep.estado === estado ? o.prep : preparar(estado);
    var porId = prep.porId, pecas = prep.pecas, L = prep.L;
    var nomeDe = typeof o.nome === "function" ? o.nome : nomePadrao;
    /* ---- 1. o elemento movido, já transformado */
    var novos = {}, arrastada = {}, ordemNovos = [], Tmov = {}, extras = [];
    function novo(id, c, T) { if (!c) return; c.id = porId[id].id; novos[id] = c; ordemNovos.push(id); if (T) Tmov[id] = T; }
    /* a PILHA (paredes empilhadas na mesma linha) anda junto: a mesma transformação, uma op a mais no lote */
    function pilhaAnda(idsFonte, T) {
      var ja = {}; idsFonte.forEach(function (x) { ja[String(x)] = 1; });
      var mais = [];
      idsFonte.forEach(function (x) { pilhaDe(estado, x).forEach(function (m) { if (!ja[m.id] && !novos[m.id]) { ja[m.id] = 1; mais.push(m.id); } }); });
      mais.forEach(function (id) { var c = porId[id]; if (c && !c.fixo) novo(id, P.transformarEl("caixa", c, T), T.tipo === "mover" ? [T.dx, 0, T.dz] : null); });
      var feitos = mais.filter(function (id) { return !!novos[id]; });
      if (feitos.length) { extras.push({ op: "transformar", ids: feitos, T: T, copia: false }); res.empilhadas = (res.empilhadas || []).concat(feitos); }
    }
    if (op.op === "transformar" && !op.copia && op.T && (op.T.tipo === "mover" || op.T.tipo === "girar") && P.validaT(op.T) && Array.isArray(op.ids)) {
      op.ids.forEach(function (id0) { var id = String(id0), c = porId[id]; if (c && !c.fixo) novo(id, P.transformarEl("caixa", c, op.T), op.T.tipo === "mover" ? [op.T.dx, 0, op.T.dz] : null); });
      pilhaAnda(op.ids.map(String).filter(function (id) { return !!novos[id]; }), op.T);
    } else if (op.op === "mover" && porId[String(op.id)] && fin(op.cx) && fin(op.cz)) {
      var cm = porId[String(op.id)]; if (!cm.fixo && cm.cx != null) { var Tm = { tipo: "mover", dx: op.cx - num(cm.cx, 0), dz: op.cz - num(cm.cz, 0) }; novo(String(op.id), P.transformarEl("caixa", cm, Tm), [Tm.dx, 0, Tm.dz]); pilhaAnda([String(op.id)], Tm); }
    } else if (op.op === "esticar" && porId[String(op.id)] && (op.ponta === "a" || op.ponta === "b")) {
      var ce = porId[String(op.id)];
      if (!ce.fixo) {
        novo(String(op.id), P.esticarCaixa(ce, op.ponta, { x: op.x, z: op.z })); arrastada[String(op.id)] = op.ponta;
        pilhaDe(estado, op.id).forEach(function (m) {
          var cp = porId[m.id], kp = m.inv ? outra(op.ponta) : op.ponta; if (!cp || cp.fixo) return;
          var cn = P.esticarCaixa(cp, kp, { x: op.x, z: op.z }); if (!cn) return;
          novo(m.id, cn); arrastada[m.id] = kp; (res.empilhadas = res.empilhadas || []).push(m.id);
          extras.push({ op: "esticar", id: cp.id, ponta: kp, x: op.x, z: op.z });
        });
      }
    } else if (op.op === "metalAjustar" && porId[String(op.id)] && op.caixa) {
      novo(String(op.id), clone(op.caixa));
    } else if (op.op === "elevar" || (op.op === "lote" && op.origem === "elevar" && Array.isArray(op.ops))) {
      /* ELEVAR (js/bimelevar.js, 15/10/2026): a peça sobe/desce (ou só o topo) — VÁRIAS fontes de uma vez (cada peça com o
         seu dy), para as selecionadas que se tocam não "acompanharem" umas às outras. A regra da subida é a do replay
         (BimElevar.elevarEl); o pilar metálico que mudou o topo vem como metalAjustar dentro do lote. */
      var EL = Elev();
      (op.op === "lote" ? op.ops : [op]).forEach(function (s) {
        if (!s) return;
        if (s.op === "elevar" && EL && Array.isArray(s.ids) && fin(s.dy)) s.ids.forEach(function (id0) {
          var id = String(id0), c = porId[id]; if (!c || c.fixo || novos[id]) return;
          var n = EL.elevarEl("caixa", c, s.dy, { so: s.so }); if (n && !n.erro) novo(id, n, s.so === "topo" ? null : [0, s.dy, 0]);
        });
        else if (s.op === "metalAjustar" && porId[String(s.id)] && s.caixa && !novos[String(s.id)]) novo(String(s.id), clone(s.caixa));
      });
    } else return fechar(res);
    if (!ordemNovos.length) return fechar(res);

    var linha = {};   /* id → peça com a linha NOVA (o movido e quem acompanhou) */
    ordemNovos.forEach(function (id) { var p = pecaDe(novos[id]); if (p) linha[id] = p; });

    /* ---- 2. propagação em largura: cada fonte uma vez */
    var pontas = {};  /* id → { a: [x,y,z], b: [...] } — só as pontas que mudam */
    var fila = ordemNovos.slice(), feito = {}, avisado = {};
    function pendente(id, ponta, motivo) {
      var k = id + ":" + ponta; if (avisado[k]) return; avisado[k] = 1;
      res.pendentes.push({ id: id, ponta: ponta, motivo: motivo });
      res.avisos.push(nomeDe(porId[id]) + " não acompanhou: " + motivo + ". Ficou como estava.");
    }
    function setPonta(id, k, p) { (pontas[id] = pontas[id] || {})[k] = p; }
    function linhaCom(id, base) {
      var B = base || pecas[id], q = pontas[id] || {};
      var a = q.a || B.a, b = q.b || B.b, d = sub(b, a), Lb = len(d);
      var n = {}; Object.keys(B).forEach(function (k) { n[k] = B[k]; });
      n.a = a; n.b = b; n.L = Lb; n.u = Lb > 1e-9 ? mul(d, 1 / Lb) : B.u;
      return n;
    }
    while (fila.length) {
      var aid = fila.shift(); if (feito[aid]) continue; feito[aid] = 1;
      var A0 = pecas[aid], A1 = linha[aid]; if (!A0 || !A1) continue;
      /* (a) quem está preso NELE acompanha */
      L.forEach(function (lk) {
        if (lk.a !== aid || novos[lk.b]) return;
        var B = pecas[lk.b]; if (!B) return;
        if (pontas[lk.b] && pontas[lk.b][lk.kb]) return;   /* a ponta já foi levada por outra fonte */
        var r = novaPonta(B, lk.kb, lk.tipo, lk.ka, A0, A1);
        if (r.erro) { pendente(lk.b, lk.kb, r.motivo); return; }
        if (dist(r.p, B[lk.kb]) < 1e-4) return;   /* a ponta já está no lugar: nada muda */
        if (B.el.fixo) { pendente(lk.b, lk.kb, "está fixada (Desafixar solta a peça)"); return; }
        if (B.k === "pilarE") { pendente(lk.b, lk.kb, "o pilar da aba Estrutura não estica por aqui (mude a base ou o topo nas Propriedades)"); return; }
        setPonta(lk.b, lk.kb, r.p);
        linha[lk.b] = linhaCom(lk.b);
        fila.push(lk.b);
      });
      /* (b) as pontas DO MOVIDO que estavam presas numa peça parada voltam para a linha dela */
      if (!novos[aid]) continue;
      L.forEach(function (lk) {
        if (lk.b !== aid || lk.tipo === "I" || novos[lk.a] || arrastada[aid] === lk.kb) return;
        if (pontas[aid] && pontas[aid][lk.kb]) return;
        var C0 = pecas[lk.a], C1 = linha[lk.a] || C0; if (!C0) return;
        /* a peça parada C só serve de trilho se a linha dela não mudou (ela só esticou, ou nem isso) */
        if (sen(C1.u, C0.u) > 1e-6 || local(C0, C1.a).w > 1e-6) return;
        var r2 = pontaPresa(A0, A1, lk.kb, C0);
        if (!r2 || dist(r2, A1[lk.kb]) < 1e-3) return;
        setPonta(aid, lk.kb, r2);
        linha[aid] = linhaCom(aid, A1);
        res.presas++;
      });
    }

    extras.forEach(function (x) { res.ajustes.push(x); });   /* a pilha primeiro: o lote reproduz a ordem */
    /* ---- 3. as linhas novas e (fora da prévia) as ops de ajuste: o movido primeiro, depois quem acompanhou */
    var ordem = ordemNovos.concat(Object.keys(pontas).filter(function (id) { return !novos[id]; }));
    var MC = Cri();
    ordem.forEach(function (id) {
      var q = pontas[id], base = novos[id] || porId[id], pc = novos[id] ? pecaDe(novos[id]) : pecas[id];
      if (pc) res.linhas[id] = { a: (q && q.a) || pc.a, b: (q && q.b) || pc.b, k: pc.k, h: pc.h };
      if (!novos[id]) res.acompanharam.push(id);
      if (!q) { res.caixas[id] = base; return; }
      if (o.previa && pc && pc.k === "barra") { res.caixas[id] = base; return; }   /* a prévia desenha a linha; a barra só é refeita ao soltar */
      var ops = opsPontas(base, pc, q, MC, P);
      if (!ops) {
        pendente(id, q.a ? "a" : "b", "não foi possível refazer a peça com a ponta nova");
        var ix = res.acompanharam.indexOf(id); if (ix >= 0) res.acompanharam.splice(ix, 1);
        delete res.linhas[id];
        return;
      }
      ops.forEach(function (x) { res.ajustes.push(x.op); });
      res.caixas[id] = ops.length ? ops[ops.length - 1].caixa : base;
    });

    /* ---- 4. sapata e bloco sob o pilar movido */
    fundacoesDoPilar(res, estado, prep, novos, Tmov, ordemNovos, nomeDe);
    /* ---- 5. porta e janela */
    aberturas(res, estado, porId, novos, pontas, nomeDe);
    /* ---- 6. as ligações desenhadas (fora da prévia) */
    if (!o.previa) ligacoesQueAcompanham(res, prep, novos, Tmov, pontas, nomeDe, o);

    /* ---- 7. o lote */
    if (res.ajustes.length) {
      var idL = typeof o.novoId === "function" ? o.novoId("l") : "l" + Date.now().toString(36);
      /* a op que JÁ é um lote (o Elevar) fica plana: o sanear joga fora o lote dentro de lote */
      if (op.op === "lote") res.op = { op: "lote", id: op.id || idL, origem: op.origem || "vinculos", pedido: ((op.pedido || "Elevar") + " (com os vínculos)").slice(0, 300), ops: op.ops.concat(res.ajustes) };
      else res.op = { op: "lote", id: idL, origem: "vinculos", pedido: "Mover com os vínculos", ops: [op].concat(res.ajustes) };
    }
    return fechar(res);
  }

  /* as ops que levam as pontas da peça `base` (caixa atual) às posições q = {a?, b?} */
  function opsPontas(base, pc, q, MC, P) {
    var out = [], c = base;
    if (!pc) return null;
    if (pc.k === "parede" || pc.k === "vigaE") {
      ["a", "b"].forEach(function (k) {
        if (!q[k] || !c) return;
        var n = P.esticarCaixa(c, k, { x: q[k][0], z: q[k][2] }); if (!n) { c = null; return; }
        n.id = base.id; c = n;
        out.push({ op: { op: "esticar", id: base.id, ponta: k, x: r4(q[k][0]), z: r4(q[k][2]) }, caixa: n });
      });
      return c ? out : null;
    }
    if (pc.k === "barra") {
      if (!MC || typeof MC.editar !== "function") return null;
      var a = q.a || pc.a, b = q.b || pc.b, r = MC.editar(c, { a: [r6(a[0]), r6(a[1]), r6(a[2])], b: [r6(b[0]), r6(b[1]), r6(b[2])] });
      if (!r || r.erro || !r.caixa) return null;
      r.caixa.id = base.id;
      return [{ op: { op: "metalAjustar", id: base.id, caixa: r.caixa }, caixa: r.caixa }];
    }
    return null;
  }

  /* ---- SAPATA/BLOCO: a de um pilar só anda com ele; a dividida, o radier e o baldrame ficam (e avisa se a base sair) */
  function fundacoesDoPilar(res, estado, prep, novos, Tmov, ordemNovos, nomeDe) {
    var F = Fund(), fs = arr(estado && estado.fundacoes); if (!F || !F.fundacaoSob || !fs.length) return;
    var pilares = prep.lista.filter(ehPilar), movidas = {};
    ordemNovos.forEach(function (id) {
      var p0 = prep.pecas[id], l1 = res.linhas[id]; if (!p0 || !ehPilar(p0) || !l1) return;
      var b0 = p0.a[1] <= p0.b[1] ? p0.a : p0.b, b1 = p0.a[1] <= p0.b[1] ? l1.a : l1.b;
      var d = sub(b1, b0); if (Math.abs(d[0]) + Math.abs(d[2]) < 1e-4) return;
      var s0 = null; try { s0 = F.fundacaoSob(b0, fs); } catch (e) { s0 = null; }
      if (!s0 || !s0.ok || !s0.fundacao) return;
      var fid = s0.fundacao.id, f = fs.filter(function (x) { return String(x.id) === fid; })[0]; if (!f) return;
      if (movidas[fid]) return;
      var nomeF = (s0.fundacao.rotulo || "A fundação") + " " + fid;
      /* quem MAIS está apoiado nela (e não anda junto, com o mesmo deslocamento) */
      var outros = pilares.filter(function (q) {
        if (q.id === id) return false;
        var bq = q.a[1] <= q.b[1] ? q.a : q.b, sq = null; try { sq = F.fundacaoSob(bq, [f]); } catch (e2) { sq = null; }
        if (!sq || !sq.ok) return false;
        var Tq = Tmov[q.id]; return !(Tq && Math.abs(Tq[0] - d[0]) < 1e-4 && Math.abs(Tq[2] - d[2]) < 1e-4);
      });
      if ((f.tipoFundacao === "sapata" || f.tipoFundacao === "bloco") && !outros.length) {
        movidas[fid] = 1;
        res.ajustes.push({ op: "mover", id: f.id, dx: r6(d[0]), dz: r6(d[2]) });
        res.fundacoes.push(fid);
        return;
      }
      var s1 = null; try { s1 = F.fundacaoSob(b1, [f]); } catch (e3) { s1 = null; }
      if (s1 && s1.ok) return;   /* a base continua em cima: nada a dizer */
      res.avisos.push(nomeF + " ficou onde estava (" + (outros.length ? "ela apoia também " + outros.map(function (q) { return nomeDe(q.el); }).join(", ") : "radier e baldrame não andam com o pilar") + "), e a base de " + nomeDe(prep.porId[id]) + " saiu de cima dela — confira a fundação.");
    });
  }

  /* ---- PORTA E JANELA: a do movido anda junto; a da parede que esticou fica no mesmo lugar do mundo (o replay do
     `esticar`) — avisa se ela saiu da parede */
  function aberturas(res, estado, porId, novos, pontas, nomeDe) {
    var BEd = Edi(); if (!BEd) return;
    arr(estado && estado.familias).forEach(function (f) {
      if (!f || !f.host) return;
      var hid = String(f.host.id); if (!pontas[hid]) return;   /* a parede só transladou: a porta vai junto, no mesmo t */
      var h0 = porId[hid], h1 = res.caixas[hid]; if (!h0 || !h1 || h1.tipo !== "parede") return;
      var pos = BEd.posicaoHospedada(novos[hid] || h0, num(f.host.t, 0)), t1 = BEd.tNaParede(h1, pos);
      var larg = num(f.inst && f.inst.largura, num(f.largura, 0));
      if (Math.abs(t1) + larg / 2 > num(h1.comprimento, 0) / 2 + 1e-3) res.avisos.push((f.nome || "A porta/janela") + " ficou fora de " + nomeDe(h0).replace(/^A /, "a ") + " (a parede encurtou) — confira o vão.");
    });
  }

  /* ---- LIGAÇÕES DESENHADAS: as peças andam com o nó (se os membros concordam), os furos dos membros se ajustam, a
     dimensionada fica DESATUALIZADA */
  function ligacoesQueAcompanham(res, prep, novos, Tmov, pontas, nomeDe, o) {
    var BM = Met(), G = prep.metalLig || {}, ks = Object.keys(G); if (!ks.length) return;
    var mudou = {}; Object.keys(res.linhas).forEach(function (id) { mudou[id] = 1; });
    var marcar = [], porId = prep.porId;
    ks.forEach(function (k) {
      var Lg = G[k], membros = Object.keys(Lg.membros); if (!Lg.c) return;
      if (!membros.some(function (m) { return mudou[m]; })) return;
      if (Lg.pecas.some(function (id) { return novos[id]; })) return;   /* a pessoa moveu a ligação junto (na seleção) */
      /* o deslocamento do nó visto por cada membro */
      var deltas = [], livres = [], ok = true;
      membros.forEach(function (m) {
        var p0 = prep.pecas[m]; if (!p0) return;
        var l1 = res.linhas[m];
        var ka = dist(Lg.c, p0.a) <= PERTO_LIG ? "a" : null, kb = dist(Lg.c, p0.b) <= PERTO_LIG ? "b" : null;
        var kk = ka && kb ? (dist(Lg.c, p0.a) <= dist(Lg.c, p0.b) ? "a" : "b") : (ka || kb);
        if (!l1) { livres.push({ p: p0, ponta: kk }); return; }   /* membro parado */
        if (Tmov[m] && !(pontas[m] && kk && pontas[m][kk])) { deltas.push(Tmov[m]); return; }
        if (kk) deltas.push(sub(l1[kk], p0[kk]));
        else if (Tmov[m]) deltas.push(Tmov[m]);
        else deltas.push([0, 0, 0]);   /* ligação no miolo de um membro que só esticou: fica no lugar */
      });
      if (!deltas.length) return;
      var d = deltas[0];
      deltas.forEach(function (x) { if (dist(x, d) > TOL_DELTA) ok = false; });
      /* membro parado: o nó só pode deslizar AO LONGO dele, e no miolo (nunca sair da ponta dele) */
      livres.forEach(function (lv) {
        var perp = len(sub(d, mul(lv.p.u, dot(d, lv.p.u))));
        if (perp > TOL_DELTA || (lv.ponta && len(d) > TOL_DELTA)) ok = false;
      });
      var nomeL = "A ligação " + k + (Lg.info.length && porId[Lg.info[0]] && porId[Lg.info[0]].ligInfo && porId[Lg.info[0]].ligInfo.nome ? " (" + porId[Lg.info[0]].ligInfo.nome + ")" : "");
      var anda = len(d) > 1e-4;
      if (anda && !(ok && Math.abs(d[1]) <= 1e-3)) {
        res.avisos.push(nomeL + " não acompanhou (" + (ok ? "o nó subiu ou desceu" : "os membros não andam juntos") + "): refaça a ligação (Metálica › Ligação).");
      } else {
        if (anda && Lg.pecas.length) { res.ajustes.push({ op: "transformar", ids: Lg.pecas.slice(), T: { tipo: "mover", dx: r6(d[0]), dz: r6(d[2]) }, copia: false }); res.ligacoes.push(k); }
        /* os furos dos membros medem x a partir da REFERÊNCIA do membro (Pref, js/metalpeca.js membro): quando a
           ponta de INÍCIO estica, a referência anda — e os furos da ligação da OUTRA ponta (que ficou) andariam junto.
           ⚠ Vale também com o nó parado (d = 0): é o caso da ligação na ponta que não foi tocada. */
        if (BM && BM.membro) membros.forEach(function (m) {
          var c0 = porId[m], c1 = res.caixas[m] || c0; if (!c0 || !c1 || c1 === c0) return;
          var fur = arr(c0.metalFuros).filter(function (f) { return String(f.lig) === k; }); if (!fur.length) return;
          var M0 = null, M1 = null; try { M0 = BM.membro(c0); M1 = BM.membro(c1); } catch (eM) { M0 = M1 = null; }
          if (!M0 || !M1) return;
          var r = dot(sub(M1.Pref, M0.Pref), M0.X), s = dot(d, M0.X), dx = s - r;
          if (Math.abs(dx) < 1e-5) return;
          res.ajustes.push({ op: "metalFuros", id: c0.id, lig: k, furos: fur.map(function (f) { var g = clone(f); g.x = r6(num(f.x, 0) + dx); delete g.lig; return g; }) });
        });
      }
      Lg.info.forEach(function (pid) { if (marcar.indexOf(pid) < 0) marcar.push(pid); });
    });
    if (marcar.length) {
      res.ajustes.push({ op: "vinculoDesatualizar", ids: marcar, motivo: "um membro mudou de lugar ou de comprimento (vínculos)", em: o.em || new Date().toISOString() });
      res.avisos.push(marcar.length + " ligação(ões) dimensionada(s) ficou(aram) DESATUALIZADA(S) — recalcule a estrutura e refaça a ligação.");
    }
  }

  function nomePadrao(el) {
    if (!el) return "A peça";
    if (el.tipo === "metal" && el.metal) { var BM = Met(); try { return BM ? BM.nome(el) : "A barra"; } catch (e) { return "A barra"; } }
    var r = { parede: "A parede", viga: "A viga", pilar: "O pilar", laje: "A laje" }[el.tipo] || "A peça";
    return r + (el.marca ? " " + el.marca : (el.nome ? " " + el.nome : ""));
  }
  function fechar(res) {
    var n = res.acompanharam.length + res.fundacoes.length;
    var emp = res.empilhadas && res.empilhadas.length ? res.empilhadas.length + (res.empilhadas.length === 1 ? " parede empilhada junto" : " paredes empilhadas juntas") : "";
    res.resumo = n === 0 ? (res.avisos.length ? "Nenhuma peça acompanhou" : "") : (n === 1 ? "1 peça acompanhou" : n + " peças acompanharam");
    /* a parte do movimento AO LONGO da peça que o canto segurou: sem dizer, a pessoa não entende por que ela não deslizou */
    if (emp) res.resumo += (res.resumo ? " · " : "") + emp;
    if (res.presas) res.resumo += (res.resumo ? " · " : "") + res.presas + (res.presas === 1 ? " ponta presa no canto (Alt: solta)" : " pontas presas nos cantos (Alt: solta)");
    if (res.avisos.length) res.resumo += (res.resumo ? " · " : "") + res.avisos.length + (res.avisos.length === 1 ? " aviso" : " avisos");
    return res;
  }

  /* ================================================================ ASSINATURA
   * A geometria que o cálculo da metálica lê (linhas das barras e das peças de
   * aço da Estrutura, e as fundações), em milímetros. O cálculo guarda a de
   * quando rodou; se a de agora for outra, o resultado está DESATUALIZADO. */
  function assinatura(estado, o) {
    var it = [], comParedes = !!(o && o.paredes);
    function mm(v) { return Math.round(num(v, 0) * 1000); }
    arr(estado && estado.caixas).forEach(function (c) {
      var p = pecaDe(c); if (!p || (p.dim !== 3 && !(comParedes && p.k === "parede"))) return;
      it.push(p.id + ":" + [p.a, p.b].map(function (q) { return q.map(mm).join(","); }).join(";") + (p.k === "parede" ? ":" + [p.h, p.y0, p.y1].map(mm).join(",") : ""));
    });
    /* {paredes:true}: as paredes (eixo, espessura, base, topo) e as portas/janelas nelas — para quem pagina parede
       (PENDÊNCIA das frentes S12, Blocok: js/blocokexecui.js abrir() mostra o UI.res de antes quando a janela estava
       fechada — guardar esta assinatura no resultado e recalcular/avisar ao abrir se ela mudou) */
    if (comParedes) arr(estado && estado.familias).forEach(function (f) { if (f && f.host) it.push("V" + f.id + ":" + f.host.id + "," + mm(f.host.t) + "," + String(f.tipoId || "")); });
    arr(estado && estado.fundacoes).forEach(function (f) {
      if (!f || f.id == null) return;
      it.push("F" + f.id + ":" + [f.x, f.z, f.x1, f.z1, f.cotaTopo, f.cotaFundo, f.largura, f.comprimento, f.giro].map(function (v) { return v == null ? "" : Math.round(Number(v) * 1000); }).join(","));
    });
    it.sort();
    /* djb2 — curto para guardar, e a lista inteira não precisa ir para lugar nenhum */
    var s = it.join("|"), h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return it.length + ":" + (h >>> 0).toString(36);
  }

  /* ================================================================ OPS DESTE MOTOR (replay)
   * {op:"vinculoPonta", id, ponta:"a"|"b", solto:bool} → caixa.vinculoSolto = {a?, b?}
   *   (sem a marca = ligado; nada muda nos dados de quem nunca usou)
   * {op:"vinculoDesatualizar", ids:[...], motivo, em} → caixa.desatualizado = {motivo, em}
   *   (a ligação dimensionada cujo membro mudou; a ligação refeita nasce sem a marca) */
  function aplicarOp(o, ctx) {
    if (!o || !ctx || !ctx.caixas) return false;
    if (o.op === "vinculoPonta") {
      var c = ctx.caixas[o.id]; if (!c || (o.ponta !== "a" && o.ponta !== "b")) return false;
      var v = c.vinculoSolto && typeof c.vinculoSolto === "object" ? clone(c.vinculoSolto) : {};
      if (o.solto) v[o.ponta] = true; else delete v[o.ponta];
      if (Object.keys(v).length) c.vinculoSolto = v; else delete c.vinculoSolto;
      return true;
    }
    if (o.op === "vinculoDesatualizar") {
      var n = 0;
      arr(o.ids).forEach(function (id) { var c2 = ctx.caixas[id]; if (!c2) return; c2.desatualizado = { motivo: String(o.motivo || "o modelo mudou"), em: String(o.em || "") }; n++; });
      return n > 0;
    }
    return false;
  }
  /* a FORMA das ops mora no BimEdit.opVinculoValida (o sanear não perde a op numa tela sem este motor): uma regra só */
  function validaOp(o) {
    if (!o || (o.op !== "vinculoPonta" && o.op !== "vinculoDesatualizar")) return undefined;
    var BE = Edi(); return !!(BE && BE.opVinculoValida && BE.opVinculoValida(o));
  }
  /* "Desligar união" numa ponta (ou ligar de novo) → { op } | { erro } */
  function opPonta(estado, id, ponta, soltoV) {
    var c = arr(estado && estado.caixas).filter(function (x) { return x && String(x.id) === String(id); })[0];
    if (!c || !pecaDe(c)) return { erro: "Desligar união: clique numa parede ou barra criada no OrçaPRO." };
    if (ponta !== "a" && ponta !== "b") return { erro: "Ponta inválida." };
    if (solto(c, ponta) === !!soltoV) return { erro: soltoV ? "Essa ponta já está desligada." : "Essa ponta já está ligada." };
    return { op: { op: "vinculoPonta", id: c.id, ponta: ponta, solto: !!soltoV } };
  }
  /* quem está preso na peça `id` (para a tela dizer "3 peças presas" e marcar as pontas) */
  function presasEm(prep, id) {
    var out = [];
    (prep && prep.L || []).forEach(function (lk) { if (lk.a === String(id)) out.push({ id: lk.b, ponta: lk.kb, tipo: lk.tipo }); });
    return out;
  }
  function registrar(BE) {
    if (!BE || typeof BE.estender !== "function") return false;
    BE.estender({ nome: "vinculos", aplicar: aplicarOp, valida: validaOp });
    return true;
  }

  var BimVinculos = {
    TOL_L: TOL_L, TOL_B: TOL_B, SEN_MIN: SEN_MIN, RECUO_DIAG: RECUO_DIAG,
    pecaDe: pecaDe, ligacoes: function (estadoOuPecas) {
      var l = Array.isArray(estadoOuPecas) ? estadoOuPecas : arr(estadoOuPecas && estadoOuPecas.caixas).map(pecaDe).filter(Boolean);
      return ligacoes(l);
    },
    pilhaDe: pilhaDe, TOL_PILHA: TOL_PILHA,
    preparar: preparar, propagar: propagar, novaPonta: novaPonta, interLinhas: interLinhas, presasEm: presasEm,
    assinatura: assinatura, ligacoesDesenhadas: ligacoesDesenhadas,
    aplicarOp: aplicarOp, validaOp: validaOp, opPonta: opPonta, solto: solto, registrar: registrar
  };
  var BE0 = dep("BimEdit", "./bimedit.js"); if (BE0) registrar(BE0);
  global.BimVinculos = BimVinculos;
  if (typeof module !== "undefined" && module.exports) module.exports = BimVinculos;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
