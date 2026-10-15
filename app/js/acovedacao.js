/* =====================================================================
 * acovedacao.js — A VEDAÇÃO COMO PEÇAS DO MODELO: telhas da cobertura
 * (por água), cumeeira, fechamento lateral e dos oitões (até a linha do
 * telhado), alvenaria do misto, rufos de empena, contra-rufos, rufo de
 * transição sobre a alvenaria, arremates de canto e calha — motor PURO,
 * ES5, sem DOM, Node-testável. 14/10/2026 (frente M3 da 1.2.145).
 *
 * Pedido do Rogério (14/10/2026): "as telhas devem já vir desenhadas no 3D e
 * na planta, pois fazem parte da estrutura. Se o galpão for selecionado com
 * fechamento lateral, tem que vir tudo."
 *
 *   galpao(g)          → { ok, pecas, quantidades, avisos, telhas }   o galpão
 *                        (js/metalgalpao.js chama no gerar)
 *   estrutura(env, fech, op) → o mesmo para a ESTRUTURA DESENHADA: as faces do
 *                        envoltório (js/acoenvoltorio.js) com o fechamento
 *                        escolhido e a cobertura do topo
 *   quantidades(lista) → a soma por papel — de peças do motor OU de caixas
 *                        (c.vedacao): o MESMO número que cada peça leva
 *   caixa(p)           → a caixa do editor (tipo "vedacao") de uma peça
 *   juntas(c)          → as juntas das telhas (largura útil do catálogo) no
 *                        mundo, para o 3D desenhar por cima da peça
 *   dadosTelha(id) / dadosParede(id) → o que o desenho usa do catálogo
 *
 * UM CÁLCULO SÓ. A área de cada peça é a do contorno que vira o desenho
 * (menos os vãos); o peso é área × o peso por m² do CATÁLOGO
 * (AcoFechamentos.peso — o MESMO número que o cálculo do galpão usa como
 * telhaPeso). A lista, o IFC, as Propriedades e o teste leem o que a peça
 * leva. A peça NÃO pesa como aço maciço do envelope desenhado (a espessura
 * desenhada é a altura da onda): c.massa é a do catálogo.
 *
 * NÃO DUPLICA CARGA. A peça é tipo "vedacao", não "metal": a estrutura
 * desenhada (js/acomodelolivre.js) só lê tipo metal/pilar/viga e a fabricação
 * (js/metalfab.js) só tipo metal — telha não vira barra, não entra no DSTV,
 * na numeração nem no peso próprio. O peso da telha continua indo para as
 * cargas pelo caminho que já existe (galpão: cargas.telhaPeso /
 * fechamentoPeso; estrutura desenhada: a área de cobertura automática do
 * envoltório).
 *
 * O QUE NÃO VEM DO CATÁLOGO (e a tela/o aviso dizem):
 *   · o transpasse longitudinal e o comprimento máximo de peça — a telha vai
 *     INTEIRA do beiral à cumeeira (sob medida), com aviso para confirmar com
 *     o fabricante; o transpasse lateral já está na LARGURA ÚTIL do catálogo
 *     (as telhas vizinhas encostam no módulo útil);
 *   · as medidas de cumeeira, rufos, contra-rufos, arremates e calha: são de
 *     PARTIDA (tabela PARTIDA, abaixo), só para o desenho — o quantitativo
 *     delas é por METRO LINEAR; a seção da calha é dimensionada no projeto
 *     de águas pluviais (NBR 10844), não aqui;
 *   · a espessura desenhada da telha: a altura da onda (+ o núcleo do
 *     sanduíche) do catálogo; sem nenhum dos dois, a espessura da chapa, com
 *     o mínimo de 3 mm de desenho (marcado em tDoCatalogo: false).
 *
 * COORDENADAS DO GALPÃO (as do js/metalgalpao.js): vão em x (0 = eixo do pilar
 * esquerdo), comprimento em z (0 = pórtico 1), y para cima a partir da base;
 * o mundo é [x0 + x, y, z0 + z]. Faces: frente = z mínimo, fundo = z máximo,
 * esquerda = x mínimo, direita = x máximo (as do motor de vento). Os vãos
 * (portões/janelas) vêm no formato do cálculo: { s0, s1, altura, base? } com
 * s = z nas laterais e s = x nos oitões (a partir do eixo).
 * Teste: node tools/test-aco-vedacao.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function Fch() { return dep("AcoFechamentos", "./acofechamentos.js"); }
  function BM() { return dep("BimMetal", "./metalpeca.js"); }
  function PL() { return dep("BimMetalPlanif", "./metalplanif.js"); }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function r4(v) { return Math.round(v * 1e4) / 1e4; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function br(v, c) { if (v == null || !isFinite(v)) return "—"; c = c == null ? 2 : c; return (Math.round(v * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function mul(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function unit(a) { var l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function area2(P) { var s = 0; for (var i = 0; i < P.length; i++) { var a = P[i], b = P[(i + 1) % P.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
  var EPS = 0.01;              /* 1 cm: vão encostado no pé/no topo, trecho que sobra */
  /* a conversão do próprio catálogo ("kN = kg x 0,00980665", js/acofechamentos.js pesoObs) */
  var KN_POR_KG = 0.00980665;

  /* ⚠ MEDIDAS DE PARTIDA (só desenho; editáveis por quem chama): não são do catálogo da telha.
     O quantitativo dos acessórios é o COMPRIMENTO; a seção da calha é do projeto de pluviais (NBR 10844). */
  var PARTIDA = {
    beiral: 0.30,            /* m, em planta, além da face de fora do fechamento lateral */
    beiralOitao: 0.20,       /* m, além da face de fora do oitão */
    alturaAlvenaria: 3.0,    /* m (o "misto" de partida do cálculo, js/metalcalcui.js) */
    cumeeiraAba: 0.25, rufoAba: 0.15, rufoQueda: 0.10, contraAba: 0.10, contraQueda: 0.08,
    cantoAba: 0.10, pingAba: 0.02, pingQueda: 0.05, calhaLargura: 0.30, calhaAltura: 0.15,
    chapaAcessorio: 0.0005,  /* 0,50 mm: chapa dos rufos e da cumeeira (de partida) */
    trechoMax: 12            /* m: os acessórios lineares saem em trechos (o modelador aceita barra de até 60 m) */
  };
  var FACES = ["esquerda", "direita", "frente", "fundo"];
  var NOME_FACE = { esquerda: "lateral esquerda", direita: "lateral direita", frente: "oitão da frente", fundo: "oitão do fundo" };

  /* ================================================================ CATÁLOGO
   * ⚠ PONTO DE TROCA DO CATÁLOGO (frente M1, ramo claude/metal-catalogo-br, 14/10/2026): quando o catálogo
   * novo de telhas entrar (telhas() com altura de onda, espessura, peso, vão máximo e fonte), só ESTAS duas
   * funções mudam — o resto do motor lê os campos daqui. Hoje: js/acofechamentos.js (gerado dos catálogos). */
  function grupoDe(t) { return String((t && (t.grupo || t.tipo)) || ""); }
  function dadosTelha(id) {
    var A = Fch(); if (!A || !id) return null;
    var t = A.telha ? A.telha(String(id)) : null; if (!t) return null;
    if (A.TIPOS_TELHA && !A.TIPOS_TELHA[t.grupo]) return null;      /* é parede, não telha */
    var p = (A.peso && A.peso(t.id)) || {}, kn = num(p.valor, null);
    var onda = num(t.alturaOnda, null), esp = num(t.espessura, null), iso = num(t.isolante, null), lu = num(t.larguraUtil, null);
    var tDado = (onda != null ? onda / 1000 : 0) + (iso != null ? iso / 1000 : 0);
    if (!(tDado > 0) && esp != null) tDado = esp / 1000;
    var g = grupoDe(t);
    return { id: t.id, nome: A.nome ? A.nome(t) : t.id, grupo: g, fabricante: t.fabricante || "", modelo: t.modelo || "",
             larguraUtil: lu, alturaOnda: onda, espessura: esp, isolante: iso, peso: kn, origemPeso: p.origem || "", textoPeso: p.texto || "",
             fonte: A.fonte ? A.fonte(t) : "", inclMin: num(t.inclMin, null),
             tDesenho: r6(Math.max(tDado || 0, 0.003)), tDoCatalogo: tDado >= 0.003,
             textura: g === "fibrocimento" || /fibrocimento/.test(t.id) ? "telha_fibrocimento" : "telha_metalica" };
  }
  function dadosParede(id) {
    var A = Fch(); if (!A || !id) return null;
    var p = A.parede ? A.parede(String(id)) : null; if (!p || (A.TIPOS_TELHA && A.TIPOS_TELHA[p.grupo])) return null;
    var e = num(p.espessura, null);
    return { id: p.id, nome: A.nome ? A.nome(p) : p.id, grupo: grupoDe(p), espessura: e != null ? r6(e / 1000) : null, peso: num(p.peso, null), fonte: A.fonte ? A.fonte(p) : "",
             textura: /ceram/.test(String(p.grupo)) ? "bloco_ceramico_furado" : (/premoldado|painel/.test(String(p.grupo)) ? "concreto_liso_claro" : "bloco_concreto") };
  }
  function telhaPadrao() { var A = Fch(); return A && A.PADRAO_TELHA ? A.PADRAO_TELHA : null; }
  function paredePadrao(tipo, bloco) { var A = Fch(), P = (A && A.PADRAO_PAREDE) || {}; if (tipo === "premoldado") return P.premoldado || null; return P[bloco] || P["vedacao-concreto"] || null; }

  /* ================================================================ GEOMETRIA PLANA
   * PAINEL VERTICAL com vãos, nas coordenadas da face (s ao longo, v para cima):
   *   def = { ua, ub, v0, topo(s) → v, quebras: [s…] (onde o topo dobra), vaos: [{ s0, s1, b, h }] }
   * → [{ C: [[s, v]…] (anti-horário), F: [[[s, v]…]] (furos) }]
   * O vão que toca o PÉ vira recorte no contorno; o que vai até o TOPO parte o painel em dois; o do meio
   * (janela) vira furo. Sem telha no vão: é isso que a área líquida mede. */
  function painelComVaos(def) {
    var ua = def.ua, ub = def.ub, v0 = def.v0, topo = def.topo, qs = arr(def.quebras);
    function topoMin(a, b) { var m = Math.min(topo(a), topo(b)); qs.forEach(function (q) { if (q > a && q < b) m = Math.min(m, topo(q)); }); return m; }
    var pe = [], meio = [];
    arr(def.vaos).forEach(function (o) {
      var s0 = Math.max(ua, num(o.s0, 0)), s1 = Math.min(ub, num(o.s1, 0)), b = num(o.b, 0), t = b + num(o.h, 0);
      if (!(s1 - s0 > EPS) || !(t > v0 + EPS)) return;
      if (b <= v0 + EPS) pe.push({ s0: s0, s1: s1, t: t }); else meio.push({ s0: s0, s1: s1, b: b, t: t });
    });
    pe.sort(function (a, b) { return a.s0 - b.s0; });
    var pu = [];
    pe.forEach(function (o) { var u = pu[pu.length - 1]; if (u && o.s0 <= u.s1 + EPS) { u.s1 = Math.max(u.s1, o.s1); u.t = Math.max(u.t, o.t); } else pu.push({ s0: o.s0, s1: o.s1, t: o.t }); });
    var cortes = pu.filter(function (o) { return o.t >= topoMin(o.s0, o.s1) - EPS; }), recortes = pu.filter(function (o) { return o.t < topoMin(o.s0, o.s1) - EPS; });
    var trechos = [], a0 = ua;
    cortes.forEach(function (c) { if (c.s0 - a0 > EPS) trechos.push([a0, c.s0]); a0 = Math.max(a0, c.s1); });
    if (ub - a0 > EPS) trechos.push([a0, ub]);
    return trechos.map(function (tr) {
      var A = tr[0], B = tr[1], C = [], cur = A;
      var ns = recortes.filter(function (o) { return o.s1 > A + EPS && o.s0 < B - EPS; }).map(function (o) { return { s0: Math.max(A, o.s0), s1: Math.min(B, o.s1), t: o.t }; });
      if (ns.length && ns[0].s0 <= A + EPS) {
        var n0 = ns.shift(); C.push([A, n0.t]);
        if (n0.s1 >= B - EPS) { C.push([B, n0.t]); cur = B; } else { C.push([n0.s1, n0.t]); C.push([n0.s1, v0]); cur = n0.s1; }
      } else C.push([A, v0]);
      ns.forEach(function (n) {
        C.push([n.s0, v0]); C.push([n.s0, n.t]);
        if (n.s1 >= B - EPS) { C.push([B, n.t]); cur = B; } else { C.push([n.s1, n.t]); C.push([n.s1, v0]); cur = n.s1; }
      });
      if (cur < B - EPS) C.push([B, v0]);
      C.push([B, topo(B)]);
      qs.filter(function (q) { return q > A + EPS && q < B - EPS; }).sort(function (x, y) { return y - x; }).forEach(function (q) { C.push([q, topo(q)]); });
      C.push([A, topo(A)]);
      var D = []; C.forEach(function (q) { var u = D[D.length - 1]; if (!u || Math.abs(u[0] - q[0]) > 1e-9 || Math.abs(u[1] - q[1]) > 1e-9) D.push([r6(q[0]), r6(q[1])]); });
      if (D.length > 1 && Math.abs(D[0][0] - D[D.length - 1][0]) < 1e-9 && Math.abs(D[0][1] - D[D.length - 1][1]) < 1e-9) D.pop();
      var F = meio.filter(function (o) { return o.s0 >= A - EPS && o.s1 <= B + EPS; }).map(function (o) {
        var s0 = Math.max(A + EPS, o.s0), s1 = Math.min(B - EPS, o.s1), t = Math.min(o.t, topoMin(s0, s1) - EPS);
        if (!(s1 - s0 > EPS) || !(t - o.b > EPS)) return null;
        return [[r6(s0), r6(o.b)], [r6(s0), r6(t)], [r6(s1), r6(t)], [r6(s1), r6(o.b)]];
      }).filter(Boolean);
      return { C: D, F: F };
    }).filter(function (p) { return p.C.length >= 3 && Math.abs(area2(p.C)) > 1e-4; });
  }
  function areaLiq(p) { var A = Math.abs(area2(p.C)); arr(p.F).forEach(function (f) { A -= Math.abs(area2(f)); }); return A; }
  /* o polígono 3D (plano) para a chapa: origem no 1º ponto, ey = a direção "para cima" da face, ex = ey × n (a chapa
     extruda de 0 a t em ex × ey = n — para FORA da face de apoio) */
  function chapaDe(C3, F3, n, eyH) {
    var ey = unit(sub(eyH, mul(n, dot(eyH, n)))), ex = unit(cross(ey, n)), O = C3[0];
    function uv(P) { var d = sub(P, O); return [r6(dot(d, ex)), r6(dot(d, ey))]; }
    return { origem: O.map(r6), ex: ex.map(r6), ey: ey.map(r6), contorno: C3.map(uv), recortes: arr(F3).map(function (f) { return f.map(uv); }) };
  }
  /* seção dobrada (linha média, m) → o centro da caixa da seção (o perfil nasce no centro da seção) */
  function centroSecao(pts, t) {
    var P = PL(), s = P && P.secao ? P.secao({ forma: "dobrada", pts: pts, t: t, ri: t }) : null;
    if (s && s.ok && s.centro) return s.centro;
    var xs = pts.map(function (q) { return q[0]; }), ys = pts.map(function (q) { return q[1]; });
    return [(Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2, (Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2];
  }
  /* ACESSÓRIO LINEAR (chapa dobrada extrudada): o eixo de A a B (mundo), a seção (a, b) com a ao longo de Z = ex × ey e
     b ao longo de ey; sai em trechos de até PARTIDA.trechoMax → [{ dobrada: { origem, ex, ey, pts, t, ri, L } }] */
  function linear(A, B, eyH, pts, t, trechoMax) {
    var d = sub(B, A), L = len(d); if (!(L > EPS)) return [];
    var ex = unit(d), ey = unit(sub(eyH, mul(ex, dot(eyH, ex)))), Z = cross(ex, ey), c = centroSecao(pts, t);
    var n = Math.max(1, Math.ceil(L / num(trechoMax, PARTIDA.trechoMax) - 1e-9)), Ls = L / n, out = [];
    for (var k = 0; k < n; k++) {
      var P0 = add(A, mul(ex, k * Ls)), O = add(add(P0, mul(Z, c[0])), mul(ey, c[1]));
      out.push({ dobrada: { origem: O.map(r6), ex: ex.map(r6), ey: ey.map(r6), pts: pts.map(function (q) { return [r6(q[0]), r6(q[1])]; }), t: t, ri: t, L: r6(Ls) } });
    }
    return out;
  }
  /* intervalos de s em que o vão NÃO corta a linha v (rufo de transição, contra-rufo do topo) */
  function livresNaLinha(ua, ub, v, vaos) {
    var cs = arr(vaos).filter(function (o) { var b = num(o.b, 0), t = b + num(o.h, 0); return b <= v + EPS && t >= v - EPS; }).map(function (o) { return [Math.max(ua, num(o.s0, 0)), Math.min(ub, num(o.s1, 0))]; }).filter(function (q) { return q[1] - q[0] > EPS; });
    cs.sort(function (a, b) { return a[0] - b[0]; });
    var out = [], a = ua; cs.forEach(function (q) { if (q[0] - a > EPS) out.push([a, q[0]]); a = Math.max(a, q[1]); }); if (ub - a > EPS) out.push([a, ub]);
    return out;
  }

  function tipoFace(f) {
    var t = String((f && f.tipo) || "aberto").toLowerCase();
    if (/misto/.test(t)) return "misto";
    if (/^telha|trapez|sanduiche/.test(t)) return "telha";
    if (/pre.?moldado|premoldado/.test(t)) return "premoldado";
    if (/alvenaria|bloco/.test(t)) return "alvenaria";
    return "aberto";
  }

  /* ================================================================ A PEÇA (do motor)
   * { chave, papel, nome, categoria ("coberturas"|"paredes"), desenho (o tipo da malha: "IFCROOF"|"IFCWALL"), ifc (a classe
   *   IFC de verdade), ifcTipo (PredefinedType), face, material, textura, acimaSempre, chapa | dobrada, area, peso (kN),
   *   massa (kg), comprimento (m), telha | parede, modulo (largura útil), nPecas, comprimentoPeca } */
  function novaPlana(meta, parte, P, n, eyH, t) {
    var C3 = parte.C.map(function (q) { return P(q[0], q[1]); }), F3 = arr(parte.F).map(function (f) { return f.map(function (q) { return P(q[0], q[1]); }); });
    var ch = chapaDe(C3, F3, n, eyH); ch.t = r6(t);
    var A = areaLiq(parte), o = {};
    Object.keys(meta).forEach(function (k) { o[k] = meta[k]; });
    o.chapa = ch; o.area = r4(A);
    var pkn = o.telha ? o.telha.peso : (o.parede ? o.parede.peso : null);
    o.peso = pkn != null ? r4(A * pkn) : null; o.massa = pkn != null ? r4(A * pkn / KN_POR_KG) : null;
    var ss = parte.C.map(function (q) { return q[0]; }), vs = parte.C.map(function (q) { return q[1]; });
    var larg = Math.max.apply(null, ss) - Math.min.apply(null, ss), alt = Math.max.apply(null, vs) - Math.min.apply(null, vs);
    if (o.telha && o.telha.larguraUtil > 0) { o.modulo = o.telha.larguraUtil; o.nPecas = Math.ceil(larg / o.telha.larguraUtil - 1e-6); o.comprimentoPeca = r4(alt); }
    return o;
  }
  function telhaResumo(t) { return t ? { id: t.id, nome: t.nome, peso: t.peso, origemPeso: t.origemPeso, textoPeso: t.textoPeso, fonte: t.fonte, larguraUtil: t.larguraUtil, alturaOnda: t.alturaOnda, espessura: t.espessura, isolante: t.isolante, tDesenho: t.tDesenho, tDoCatalogo: t.tDoCatalogo } : null; }
  function paredeResumo(p) { return p ? { id: p.id, nome: p.nome, peso: p.peso, espessura: p.espessura, fonte: p.fonte } : null; }

  /* ================================================================ GALPÃO
   * g = { vao, comprimento, peDireito, inclinacao (%), aguas (2 | 1), base, x0, z0,
   *       apoio: { telha (m: do topo da viga à face de baixo da telha, na normal — a altura da terça),
   *                lateral: { esquerda, direita } (m: do eixo do pilar à face de DENTRO do fechamento lateral),
   *                oitao: { frente, fundo } (m: do eixo do pórtico de oitão à face de dentro do fechamento) },
   *       cobertura: { telhaId } | null (sem telha),
   *       faces: { esquerda|direita|frente|fundo: { tipo: "aberto"|"telha"|"misto"|"alvenaria"|"premoldado",
   *                alturaAlvenaria, telhaId, paredeId, bloco, aberturas: [{ s0, s1, altura, base? }] } },
   *       beiral, beiralOitao, calha (bool), partida: { … } (troca medidas da tabela PARTIDA) } */
  function galpao(g) {
    g = g || {};
    var Pd = {}; Object.keys(PARTIDA).forEach(function (k) { Pd[k] = g.partida && g.partida[k] != null ? num(g.partida[k], PARTIDA[k]) : PARTIDA[k]; });
    var avisos = [], pecas = [];
    var vao = num(g.vao, 0), Lt = num(g.comprimento, 0), H = num(g.peDireito, 0), ip = num(g.inclinacao, 0), i = ip / 100, B0 = num(g.base, 0), X0 = num(g.x0, 0), Z0 = num(g.z0, 0), aguas = num(g.aguas, 2) === 1 ? 1 : 2;
    if (!(vao > 0 && Lt > 0 && H > 0) || !(i >= 0)) return { ok: false, motivo: "Geometria do galpão incompleta (vão, comprimento, pé-direito e inclinação).", pecas: [], quantidades: quantidades([]), avisos: [] };
    var th = Math.atan(i), co = Math.cos(th), si = Math.sin(th);
    var ap = g.apoio || {}, dT = Math.max(0, num(ap.telha, 0)), apL = ap.lateral || {}, apO = ap.oitao || {};
    var oL = { esquerda: Math.max(0, num(apL.esquerda, 0)), direita: Math.max(0, num(apL.direita, 0)) }, oO = { frente: Math.max(0, num(apO.frente, 0)), fundo: Math.max(0, num(apO.fundo, 0)) };
    var beiral = Math.max(0, num(g.beiral, Pd.beiral)), beiralO = Math.max(0, num(g.beiralOitao, Pd.beiralOitao));
    var semCob = !g.cobertura || g.cobertura.tipo === "sem" || g.cobertura.telhaId === null;
    var cobT = semCob ? null : dadosTelha(g.cobertura.telhaId || telhaPadrao());
    if (!semCob && !cobT) avisos.push("Cobertura: a telha " + (g.cobertura.telhaId || "?") + " não está no catálogo — a cobertura não foi desenhada.");
    var faces = {};
    FACES.forEach(function (k) {
      var f = (g.faces || {})[k] || {}, tp = tipoFace(f), o = { tipo: tp, vaos: [] };
      if (tp === "telha" || tp === "misto") { o.telha = dadosTelha(f.telhaId || (cobT && cobT.id) || telhaPadrao()); if (!o.telha) { avisos.push(NOME_FACE[k] + ": telha do fechamento fora do catálogo — a face não foi desenhada."); o.tipo = "aberto"; } }
      if (tp === "misto" || tp === "alvenaria" || tp === "premoldado") {
        o.parede = dadosParede(f.paredeId || paredePadrao(tp, f.bloco));
        if (!o.parede || !(o.parede.espessura > 0)) { avisos.push(NOME_FACE[k] + ": a parede não está no catálogo — a alvenaria não foi desenhada."); o.parede = null; if (tp !== "misto") o.tipo = "aberto"; }
      }
      o.h = tp === "misto" ? clamp(num(f.alturaAlvenaria, Pd.alturaAlvenaria), 0, H) : 0;
      o.vaos = arr(f.aberturas).map(function (a) { return a ? { s0: num(a.s0, 0), s1: num(a.s1, 0), b: num(a.base, 0), h: num(a.altura, 0) } : null; }).filter(function (a) { return a && a.s1 - a.s0 > EPS && a.h > EPS; });
      faces[k] = o;
    });
    function tFace(k) { var f = faces[k]; if (f.tipo === "aberto") return 0; return Math.max(f.telha && f.tipo !== "alvenaria" && f.tipo !== "premoldado" ? f.telha.tDesenho : 0, f.parede ? f.parede.espessura : 0); }
    function W(x, y, z) { return [X0 + x, y, Z0 + z]; }
    function m(x) { return aguas === 2 ? Math.min(x, vao - x) : x; }
    /* a FACE DE BAIXO da telha da cobertura (acima da base): a linha do telhado (topo das vigas) + a terça, na vertical */
    function yRB(x) { return H + i * m(x) + dT / co; }
    var acc = Pd.chapaAcessorio;
    function metaAcc(chave, papel, face, cat, desenho, ifcTipo, ifc) {
      return { chave: chave, papel: papel, nome: papel + (face ? " — " + (NOME_FACE[face] || face) : ""), categoria: cat, desenho: desenho, ifc: ifc || "IFCCOVERING", ifcTipo: ifcTipo, face: face || "cobertura",
               material: "rufo", textura: "", acimaSempre: desenho === "IFCROOF", partida: true };
    }
    function pushLinear(meta, A, B, eyH, pts) { linear(A, B, eyH, pts, acc, Pd.trechoMax).forEach(function (q, j) { var o = {}; Object.keys(meta).forEach(function (k) { o[k] = meta[k]; }); o.chave = meta.chave + "-" + j; o.dobrada = q.dobrada; o.comprimento = r4(q.dobrada.L); pecas.push(o); }); }

    /* ---------------------------------------------------------------- FACES (fechamento lateral e oitões) */
    var defs = {};
    FACES.forEach(function (k) {
      var f = faces[k]; if (f.tipo === "aberto") return;
      var lat = k === "esquerda" || k === "direita", d;
      if (lat) {
        var esq = k === "esquerda", xF = esq ? -oL.esquerda : vao + oL.direita, vT = yRB(xF);
        d = { ua: -oO.frente, ub: Lt + oO.fundo, topo: function () { return vT; }, quebras: [], n: [esq ? -1 : 1, 0, 0], P: function (s, v) { return W(xF, B0 + v, s); }, xF: xF };
      } else {
        var fr = k === "frente", zF = fr ? -oO.frente : Lt + oO.fundo;
        d = { ua: -(oL.esquerda + tFace("esquerda")), ub: vao + oL.direita + tFace("direita"), topo: yRB, quebras: aguas === 2 ? [vao / 2] : [], n: [0, 0, fr ? -1 : 1], P: function (s, v) { return W(s, B0 + v, zF); }, zF: zF };
      }
      defs[k] = d;
      var base = { face: k, acimaSempre: false };
      if (f.parede && (f.tipo === "misto" || f.tipo === "alvenaria" || f.tipo === "premoldado")) {
        var hA = f.tipo === "misto" ? f.h : null;
        painelComVaos({ ua: d.ua, ub: d.ub, v0: 0, topo: hA != null ? function () { return hA; } : d.topo, quebras: hA != null ? [] : d.quebras, vaos: f.vaos }).forEach(function (pt, j) {
          var pre = f.tipo === "premoldado", meta = { chave: "alv-" + k + "-" + j, papel: pre ? "Painel pré-moldado" : "Alvenaria", nome: (pre ? "Painel pré-moldado" : "Alvenaria") + " — " + NOME_FACE[k], categoria: "paredes", desenho: "IFCWALL", ifc: "IFCWALL", ifcTipo: pre ? "ELEMENTEDWALL" : "SOLIDWALL",
                      material: pre ? "concreto" : "alvenaria", textura: f.parede.textura, parede: paredeResumo(f.parede) };
          Object.keys(base).forEach(function (q) { meta[q] = base[q]; });
          pecas.push(novaPlana(meta, pt, d.P, d.n, [0, 1, 0], f.parede.espessura));
        });
      }
      if (f.telha && (f.tipo === "telha" || f.tipo === "misto")) {
        painelComVaos({ ua: d.ua, ub: d.ub, v0: f.h, topo: d.topo, quebras: d.quebras, vaos: f.vaos }).forEach(function (pt, j) {
          var meta = { chave: "fech-" + k + "-" + j, papel: "Telha de fechamento", nome: "Telha de fechamento — " + NOME_FACE[k], categoria: "paredes", desenho: "IFCWALL", ifc: "IFCCOVERING", ifcTipo: "CLADDING",
                      material: "telha", textura: f.telha.textura, telha: telhaResumo(f.telha) };
          Object.keys(base).forEach(function (q) { meta[q] = base[q]; });
          pecas.push(novaPlana(meta, pt, d.P, d.n, [0, 1, 0], f.telha.tDesenho));
        });
        /* rufo de transição (pingadeira) no topo da alvenaria do misto, fora dos vãos que passam da altura dela */
        if (f.tipo === "misto" && f.parede && f.h > EPS) {
          var out = d.n, tA = f.parede.espessura, tT = f.telha.tDesenho;
          livresNaLinha(d.ua, d.ub, f.h, f.vaos).forEach(function (q, j) {
            var A = add(d.P(q[0], f.h), mul(out, tA)), B = add(d.P(q[1], f.h), mul(out, tA));
            var ex = unit(sub(B, A)), ey = [0, 1, 0], sZ = dot(cross(ex, ey), out) >= 0 ? 1 : -1;
            pushLinear(metaAcc("ping-" + k + "-" + j, "Rufo de transição (pingadeira)", k, "paredes", "IFCWALL", "MOLDING"), A, B, ey,
                       [[-sZ * (tA - tT), acc / 2], [sZ * Pd.pingAba, acc / 2], [sZ * Pd.pingAba, acc / 2 - Pd.pingQueda]]);
          });
        }
      }
    });

    /* ---------------------------------------------------------------- COBERTURA (por água) */
    var aguasDef = [];
    if (cobT) {
      var tT = cobT.tDesenho, xeE = oL.esquerda + tFace("esquerda") + beiral, xeD = oL.direita + tFace("direita") + beiral;
      var zA = -(oO.frente + tFace("frente") + beiralO), zB = Lt + oO.fundo + tFace("fundo") + beiralO, Lz = zB - zA;
      aguasDef = aguas === 2 ? [{ lado: "esquerda", x0: -xeE, x1: vao / 2 }, { lado: "direita", x0: vao + xeD, x1: vao / 2 }] : [{ lado: "unica", x0: -xeE, x1: vao + xeD }];
      if (cobT.inclMin != null && ip + 1e-9 < cobT.inclMin) avisos.push("Cobertura: a " + cobT.nome + " pede inclinação mínima de " + br(cobT.inclMin, 1) + " % (o telhado tem " + br(ip, 1) + " %) — " + (cobT.fonte || "catálogo") + ".");
      aguasDef.forEach(function (a) {
        var sg = a.x1 > a.x0 ? 1 : -1, d = unit([sg * co, si, 0]), n = unit([-sg * si, co, 0]);
        var Pb = function (x, z) { return W(x, B0 + yRB(x), z); }, Lv = Math.abs(a.x1 - a.x0) / co;
        var C3 = [Pb(a.x0, zA), Pb(a.x0, zB), Pb(a.x1, zB), Pb(a.x1, zA)], ch = chapaDe(C3, [], n, d); ch.t = r6(tT);
        var A = Lz * Lv, o = { chave: "cob-" + a.lado, papel: "Telha de cobertura", nome: "Telha de cobertura — água " + (a.lado === "unica" ? "única" : a.lado), categoria: "coberturas", desenho: "IFCROOF", ifc: "IFCCOVERING", ifcTipo: "ROOFING",
                 face: "cobertura", material: "telha", textura: cobT.textura, acimaSempre: true, telha: telhaResumo(cobT), chapa: ch, area: r4(A),
                 peso: cobT.peso != null ? r4(A * cobT.peso) : null, massa: cobT.peso != null ? r4(A * cobT.peso / KN_POR_KG) : null };
        if (cobT.larguraUtil > 0) { o.modulo = cobT.larguraUtil; o.nPecas = Math.ceil(Lz / cobT.larguraUtil - 1e-6); o.comprimentoPeca = r4(Lv); }
        a.d = d; a.n = n; a.Lv = Lv; a.Pb = Pb;
        pecas.push(o);
      });
      if (cobT.peso == null) avisos.push("Cobertura: a " + cobT.nome + " não tem peso no catálogo — a peça fica sem peso.");
      if (!(cobT.larguraUtil > 0)) avisos.push("Cobertura: a " + cobT.nome + " não traz a largura útil no catálogo — sem o número de telhas nem as juntas no desenho.");
      avisos.push("Telha inteira do beiral à cumeeira (" + br(aguasDef[0].Lv, 2) + " m na água): o catálogo não traz o comprimento máximo de peça nem o transpasse longitudinal — confirme com o fabricante (o transpasse lateral já está na largura útil).");
      /* CUMEEIRA (duas águas): a dobra em V sobre as duas águas, na face de cima da telha */
      if (aguas === 2) {
        var yR = B0 + yRB(vao / 2) + tT / co, w = Pd.cumeeiraAba;
        pushLinear(metaAcc("cumeeira", "Cumeeira", null, "coberturas", "IFCROOF", "ROOFING"), W(vao / 2, yR, zA), W(vao / 2, yR, zB), [0, 1, 0],
                   [[w * co, -w * si + acc / 2], [0, acc / 2], [-w * co, -w * si + acc / 2]]);
      }
      /* RUFO DE EMPENA: na borda inclinada da cobertura, em cada oitão e cada água (a aba sobre a telha, a queda na borda) */
      ["frente", "fundo"].forEach(function (k) {
        var zE = k === "frente" ? zA : zB, dentro = [0, 0, k === "frente" ? 1 : -1];
        aguasDef.forEach(function (a) {
          var E0 = a.Pb(a.x0, zE), E1 = a.Pb(a.x1, zE), Z = cross(a.d, a.n), sZ = dot(Z, dentro) >= 0 ? 1 : -1;
          pushLinear(metaAcc("rufo-" + k + "-" + a.lado, "Rufo de empena", k, "coberturas", "IFCROOF", "MOLDING"), E0, E1, a.n,
                     [[sZ * Pd.rufoAba, tT + acc / 2], [-sZ * acc / 2, tT + acc / 2], [-sZ * acc / 2, tT - Pd.rufoQueda]]);
        });
      });
      /* CALHA nos beirais (duas águas: os dois; uma água: o lado baixo) */
      if (g.calha) {
        var beirais = aguas === 2 ? ["esquerda", "direita"] : ["esquerda"];
        beirais.forEach(function (lado) {
          var xe = lado === "esquerda" ? -xeE : vao + xeD, out = [lado === "esquerda" ? -1 : 1, 0, 0], yb = B0 + yRB(xe) - 0.02;
          var A = W(xe, yb, zA), B = W(xe, yb, zB), ex = unit(sub(B, A)), sZ = dot(cross(ex, [0, 1, 0]), out) >= 0 ? 1 : -1, h2 = Pd.calhaLargura / 2;
          pushLinear(metaAcc("calha-" + lado, "Calha", null, "coberturas", "IFCROOF", "GUTTER", "IFCPIPESEGMENT"), A, B, [0, 1, 0],
                     [[-sZ * h2, 0], [-sZ * h2, -Pd.calhaAltura], [sZ * h2, -Pd.calhaAltura], [sZ * h2, 0]]);
        });
        avisos.push("Calha: seção de partida (" + br(Pd.calhaLargura * 100, 0) + " × " + br(Pd.calhaAltura * 100, 0) + " cm) só para o desenho — a seção é do projeto de águas pluviais (NBR 10844).");
      }
    }

    /* ---------------------------------------------------------------- CONTRA-RUFOS (topo do fechamento, sob a cobertura) e ARREMATES DE CANTO */
    if (cobT) FACES.forEach(function (k) {
      var f = faces[k], d = defs[k]; if (!d || f.tipo === "aberto") return;
      var tF = tFace(k), out = d.n, lat = k === "esquerda" || k === "direita";
      if (lat) {
        var vT = d.topo(), A = add(d.P(d.ua, vT), mul(out, tF)), B = add(d.P(d.ub, vT), mul(out, tF)), ex = unit(sub(B, A)), sZ = dot(cross(ex, [0, 1, 0]), out) >= 0 ? 1 : -1;
        pushLinear(metaAcc("contra-" + k, "Contra-rufo", k, "paredes", "IFCWALL", "MOLDING"), A, B, [0, 1, 0], [[0, -Pd.contraAba], [0, 0], [sZ * Pd.contraQueda, 0]]);
      } else {
        /* no oitão: o contra-rufo segue a linha da cobertura (cada água), na face de fora */
        var segs = aguas === 2 ? [[d.ua, vao / 2], [d.ub, vao / 2]] : [[d.ua, d.ub]];
        segs.forEach(function (sg, j) {
          var A2 = add(d.P(sg[0], d.topo(sg[0])), mul(out, tF)), B2 = add(d.P(sg[1], d.topo(sg[1])), mul(out, tF)), ex2 = unit(sub(B2, A2));
          var nUp = unit(sub([0, 1, 0], mul(ex2, dot([0, 1, 0], ex2)))), sZ2 = dot(cross(ex2, nUp), out) >= 0 ? 1 : -1;
          pushLinear(metaAcc("contra-" + k + "-" + j, "Contra-rufo", k, "paredes", "IFCWALL", "MOLDING"), A2, B2, nUp, [[0, -Pd.contraAba], [0, 0], [sZ2 * Pd.contraQueda, 0]]);
        });
      }
    });
    /* arremate de canto: onde as DUAS faces do canto têm telha (lateral × oitão), do pé da telha ao topo */
    [["esquerda", "frente"], ["esquerda", "fundo"], ["direita", "frente"], ["direita", "fundo"]].forEach(function (cn) {
      var fl = faces[cn[0]], fo = faces[cn[1]], dl = defs[cn[0]], dO = defs[cn[1]];
      if (!dl || !dO || !fl.telha || !fo.telha || fl.tipo === "alvenaria" || fo.tipo === "alvenaria" || fl.tipo === "premoldado" || fo.tipo === "premoldado") return;
      var xO = dO.ua === undefined ? 0 : (cn[0] === "esquerda" ? dO.ua : dO.ub), zO = dO.zF + dO.n[2] * tFace(cn[1]);
      var y0 = B0 + Math.max(fl.h, fo.h), y1 = B0 + Math.min(dl.topo(), dO.topo(xO)); if (!(y1 - y0 > 0.1)) return;
      var outL = dl.n, outO = dO.n, A = W(xO, y0, zO), B = W(xO, y1, zO), Z = cross([0, 1, 0], outO), sL = dot(Z, outL) >= 0 ? 1 : -1;
      pushLinear(metaAcc("canto-" + cn[0] + "-" + cn[1], "Arremate de canto", cn[1], "paredes", "IFCWALL", "MOLDING"), A, B, outO,
                 [[-sL * Pd.cantoAba, acc / 2], [sL * acc / 2, acc / 2], [sL * acc / 2, acc / 2 - Pd.cantoAba]]);
    });

    var semNada = !pecas.length;
    return { ok: true, pecas: pecas, quantidades: quantidades(pecas), avisos: avisos, vazio: semNada, telhas: { cobertura: telhaResumo(cobT) }, partida: Pd };
  }

  /* ================================================================ ESTRUTURA DESENHADA
   * env = AcoEnvoltorio.ler(G); fech = AcoEnvoltorio.casarFechamentos(env, …) (faces[id] = { tipo, h, telha }; cobertura =
   * { tipo, telha }); op = { membros: G.membros (o topo de cada face e os planos do telhado), afastamento: { faceId: m }
   * (do eixo dos pilares à face de dentro do fechamento; padrão 0,10 m), apoio (m: do eixo das vigas do topo à face de
   * baixo da telha; padrão 0,10 m), beiral (m, padrão 0) }.
   * A face é vertical, do pé dela (hBase) ao topo das peças da linha (o envelope das vigas/terças da face, ou o hTopo).
   * A cobertura: topo PLANO → o contorno na cota; INCLINADO → um plano por água (as vigas do topo agrupadas pelo
   * sentido de subida, plano por mínimos quadrados), cada água recortada onde ela é a mais baixa (o telhado é o
   * mínimo dos planos — vale para contorno convexo). */
  function estrutura(env, fech, op) {
    op = op || {};
    var pecas = [], avisos = [];
    if (!env || !arr(env.faces).length) return { ok: false, motivo: "A estrutura não tem faces no envoltório.", pecas: [], quantidades: quantidades([]), avisos: [] };
    var EV = dep("AcoEnvoltorio", "./acoenvoltorio.js"), membros = arr(op.membros), apoio = num(op.apoio, 0.10), af = op.afastamento || {};
    var porId = {}; membros.forEach(function (mb) { porId[mb.id] = mb; });
    var fc = (fech && fech.faces) || {};
    function telhaDoFech(F, d) { return dadosTelha((d && d.telha) || (EV && F && F.grupoTelha ? EV.telhaPadrao(F.grupoTelha) : null) || telhaPadrao()); }
    env.faces.forEach(function (f, kf) {
      if (env.tipo === "plano" && kf > 0) return;
      var d = fc[f.id] || {}, F = EV ? EV.fechamentoDe(d.tipo) : null, id = F ? F.id : String(d.tipo || "aberta");
      if (!F || !F.fechada) return;
      var a = f.a, b = f.b, L = num(f.L, 0); if (!(L > EPS)) return;
      var u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], n = [num(f.normal[0], 0), 0, num(f.normal[1], 0)], o = Math.max(0, num(af[f.id], 0.10));
      var hB = num(f.hBase, 0), hT = num(f.hTopo, hB + 3);
      /* o topo da face: o envelope das peças horizontais/inclinadas da linha */
      var segs = arr(f.membros).map(function (mid) { return porId[mid]; }).filter(function (mb) { return mb && Math.abs(num(mb.X && mb.X[1], 0)) < 0.95; }).map(function (mb) {
        function sOf(P) { return (P[0] - a[0]) * u[0] + (P[2] - a[1]) * u[1]; }
        return [sOf(mb.a), mb.a[1], sOf(mb.b), mb.b[1]];
      });
      var qs = [0, L]; segs.forEach(function (s) { qs.push(s[0], s[2]); });
      qs = qs.filter(function (q) { return q >= -EPS && q <= L + EPS; }).map(function (q) { return clamp(q, 0, L); }).sort(function (x, y) { return x - y; });
      function topoAbs(s) {
        var best = null;
        segs.forEach(function (sg) { var s0 = Math.min(sg[0], sg[2]), s1 = Math.max(sg[0], sg[2]); if (s < s0 - 1e-6 || s > s1 + 1e-6) return; var t = s1 - s0 > 1e-9 ? (s - sg[0]) / (sg[2] - sg[0]) : 0, y = sg[1] + (sg[3] - sg[1]) * t; if (best == null || y > best) best = y; });
        return best == null ? hT : best;
      }
      function topo(s) { return topoAbs(s) - hB; }
      var P = function (s, v) { return [a[0] + u[0] * s + n[0] * o, hB + v, a[1] + u[1] * s + n[2] * o]; };
      var ehMisto = id === "misto", ehAlv = id === "alvenaria", ehPre = id === "pre-moldado", h = (ehMisto || ehAlv) ? clamp(num(d.h, f.altura), 0, hT - hB) : 0;
      var telha = (id === "telha-trapezoidal" || id === "telha-sanduiche" || ehMisto) ? telhaDoFech(F, d) : null;
      var parede = (ehMisto || ehAlv || ehPre) ? dadosParede(paredePadrao(ehPre ? "premoldado" : "alvenaria", "vedacao-concreto")) : null;
      var nomeF = f.nome || ("face " + (kf + 1));
      if (parede && parede.espessura > 0) {
        painelComVaos({ ua: 0, ub: L, v0: 0, topo: (ehMisto || ehAlv) ? function () { return h; } : topo, quebras: (ehMisto || ehAlv) ? [] : qs, vaos: [] }).forEach(function (pt, j) {
          pecas.push(novaPlana({ chave: "alv-" + f.id + "-" + j, papel: ehPre ? "Painel pré-moldado" : "Alvenaria", nome: (ehPre ? "Painel pré-moldado" : "Alvenaria") + " — " + nomeF, categoria: "paredes", desenho: "IFCWALL", ifc: "IFCWALL", ifcTipo: ehPre ? "ELEMENTEDWALL" : "SOLIDWALL",
                                  face: f.id, material: ehPre ? "concreto" : "alvenaria", textura: parede.textura, acimaSempre: false, parede: paredeResumo(parede) }, pt, P, n, [0, 1, 0], parede.espessura));
        });
        if (ehAlv && h < hT - hB - EPS) avisos.push(nomeF + ": alvenaria até " + br(h, 2) + " m e aberta acima (o fechamento escolhido).");
      }
      if (telha) {
        painelComVaos({ ua: 0, ub: L, v0: h, topo: topo, quebras: qs, vaos: [] }).forEach(function (pt, j) {
          pecas.push(novaPlana({ chave: "fech-" + f.id + "-" + j, papel: "Telha de fechamento", nome: "Telha de fechamento — " + nomeF, categoria: "paredes", desenho: "IFCWALL", ifc: "IFCCOVERING", ifcTipo: "CLADDING",
                                  face: f.id, material: "telha", textura: telha.textura, acimaSempre: false, telha: telhaResumo(telha) }, pt, P, n, [0, 1, 0], telha.tDesenho));
        });
      }
    });
    /* cobertura */
    var cob = EV ? EV.coberturaDe(fech && fech.cobertura && fech.cobertura.tipo) : { id: "sem" };
    if (cob.id !== "sem" && env.cobertura && arr(env.contorno).length >= 3) {
      var tC = dadosTelha((fech.cobertura && fech.cobertura.telha) || (EV ? EV.telhaPadrao(cob.grupoTelha) : null) || telhaPadrao());
      if (!tC) avisos.push("Cobertura: telha fora do catálogo — não desenhada.");
      else {
        var ct = env.contorno.map(function (q) { return [q[0], q[1]]; }), bei = Math.max(0, num(op.beiral, 0));
        if (bei > 0) ct = afastarPoligono(ct, bei);
        var planos = [];
        if (env.cobertura.tipo === "plana") planos.push({ A: 0, B: 0, C: num(env.cobertura.cota, 0) });
        else planos = planosDoTopo(arr(env.cobertura.vigas).map(function (pid) { return membros.filter(function (mb) { return String(mb.peca) === String(pid); }); }).reduce(function (s, x) { return s.concat(x); }, []));
        if (!planos.length) avisos.push("Cobertura: não deu para tirar o plano do telhado das vigas do topo — não desenhada.");
        planos.forEach(function (pl, k) {
          var reg = ct.slice();
          planos.forEach(function (q, j) { if (j !== k) reg = recortarMeioPlano(reg, pl, q); });
          if (reg.length < 3 || Math.abs(area2(reg)) < 0.01) return;
          if (area2(reg) < 0) reg.reverse();
          var nrm = unit([-pl.A, 1, -pl.B]), cosN = nrm[1], gr = Math.sqrt(pl.A * pl.A + pl.B * pl.B);
          var eyH = gr > 1e-6 ? unit([pl.A / gr, (pl.A * pl.A + pl.B * pl.B) / gr, pl.B / gr]) : [0, 0, -1];
          var C3 = reg.map(function (q) { return [q[0], pl.A * q[0] + pl.B * q[1] + pl.C + apoio / cosN, q[1]]; }), ch = chapaDe(C3, [], nrm, eyH); ch.t = r6(tC.tDesenho);
          var A = Math.abs(area2(ch.contorno)), o = { chave: "cob-" + k, papel: "Telha de cobertura", nome: "Telha de cobertura — água " + (k + 1), categoria: "coberturas", desenho: "IFCROOF", ifc: "IFCCOVERING", ifcTipo: "ROOFING",
                   face: "cobertura", material: "telha", textura: tC.textura, acimaSempre: true, telha: telhaResumo(tC), chapa: ch, area: r4(A),
                   peso: tC.peso != null ? r4(A * tC.peso) : null, massa: tC.peso != null ? r4(A * tC.peso / KN_POR_KG) : null };
          if (tC.larguraUtil > 0) { var us = ch.contorno.map(function (q) { return q[0]; }), vs = ch.contorno.map(function (q) { return q[1]; }); o.modulo = tC.larguraUtil; o.nPecas = Math.ceil((Math.max.apply(null, us) - Math.min.apply(null, us)) / tC.larguraUtil - 1e-6); o.comprimentoPeca = r4(Math.max.apply(null, vs) - Math.min.apply(null, vs)); }
          pecas.push(o);
        });
      }
    }
    return { ok: true, pecas: pecas, quantidades: quantidades(pecas), avisos: avisos, vazio: !pecas.length };
  }
  /* planos y = A·x + B·z + C pelas vigas inclinadas do topo, agrupadas pelo sentido de subida em planta (até 20°) */
  function planosDoTopo(ms) {
    var grupos = [];
    ms.forEach(function (mb) {
      var lo = mb.a[1] <= mb.b[1] ? mb.a : mb.b, hi = lo === mb.a ? mb.b : mb.a, dx = hi[0] - lo[0], dz = hi[2] - lo[2], L = Math.sqrt(dx * dx + dz * dz); if (!(L > 1e-6)) return;
      var s = [dx / L, dz / L], g = grupos.filter(function (q) { return q.s[0] * s[0] + q.s[1] * s[1] > Math.cos(20 * Math.PI / 180); })[0];
      if (!g) { g = { s: s, pts: [] }; grupos.push(g); }
      g.pts.push(mb.a, mb.b);
    });
    return grupos.map(function (g) { return planoMQ(g.pts, g.s); }).filter(Boolean);
  }
  /* mínimos quadrados de y = A x + B z + C; com os pontos todos numa linha (uma viga só), o plano sobe só no sentido dela */
  function planoMQ(P, s) {
    var n = P.length; if (n < 2) return null;
    var Sx = 0, Sz = 0, Sy = 0, Sxx = 0, Szz = 0, Sxz = 0, Sxy = 0, Szy = 0;
    P.forEach(function (p) { Sx += p[0]; Sz += p[2]; Sy += p[1]; Sxx += p[0] * p[0]; Szz += p[2] * p[2]; Sxz += p[0] * p[2]; Sxy += p[0] * p[1]; Szy += p[2] * p[1]; });
    var M = [[Sxx, Sxz, Sx], [Sxz, Szz, Sz], [Sx, Sz, n]], v = [Sxy, Szy, Sy];
    var det = function (m3) { return m3[0][0] * (m3[1][1] * m3[2][2] - m3[1][2] * m3[2][1]) - m3[0][1] * (m3[1][0] * m3[2][2] - m3[1][2] * m3[2][0]) + m3[0][2] * (m3[1][0] * m3[2][1] - m3[1][1] * m3[2][0]); };
    var D = det(M);
    if (Math.abs(D) > 1e-9 * Math.max(1, Math.abs(Sxx * Szz))) {
      var col = function (k) { return M.map(function (r, i2) { var q = r.slice(); q[k] = v[i2]; return q; }); };
      return { A: det(col(0)) / D, B: det(col(1)) / D, C: det(col(2)) / D };
    }
    /* colinear: inclinação ao longo de s, nada na transversal */
    var ts = P.map(function (p) { return p[0] * s[0] + p[2] * s[1]; }), tm = ts.reduce(function (a, b) { return a + b; }, 0) / n, ym = Sy / n, num2 = 0, den = 0;
    P.forEach(function (p, k) { num2 += (ts[k] - tm) * (p[1] - ym); den += (ts[k] - tm) * (ts[k] - tm); });
    var kk = den > 1e-12 ? num2 / den : 0;
    return { A: kk * s[0], B: kk * s[1], C: ym - kk * tm };
  }
  /* o pedaço do polígono (x, z) em que o plano p fica ABAIXO (ou igual) do plano q (Sutherland–Hodgman com uma reta) */
  function recortarMeioPlano(P, p, q) {
    function f(x, z) { return (p.A - q.A) * x + (p.B - q.B) * z + (p.C - q.C); }   /* ≤ 0: p é o mais baixo */
    var out = [];
    for (var i = 0; i < P.length; i++) {
      var a = P[i], b = P[(i + 1) % P.length], fa = f(a[0], a[1]), fb = f(b[0], b[1]);
      if (fa <= 1e-9) out.push(a);
      if ((fa < -1e-9 && fb > 1e-9) || (fa > 1e-9 && fb < -1e-9)) { var t = fa / (fa - fb); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
    }
    return out;
  }
  /* afasta o polígono (anti-horário) de d para fora, aresta por aresta (cantos em esquadro pela interseção das retas) */
  function afastarPoligono(P, d) {
    if (area2(P) < 0) P = P.slice().reverse();
    var n = P.length, L = [];
    for (var i = 0; i < n; i++) { var a = P[i], b = P[(i + 1) % n], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.sqrt(dx * dx + dz * dz) || 1, nx = dz / l, nz = -dx / l; L.push({ p: [a[0] + nx * d, a[1] + nz * d], v: [dx, dz] }); }
    var out = [];
    for (var k = 0; k < n; k++) {
      var A = L[(k - 1 + n) % n], B = L[k], den = A.v[0] * B.v[1] - A.v[1] * B.v[0];
      if (Math.abs(den) < 1e-12) { out.push(B.p); continue; }
      var t = ((B.p[0] - A.p[0]) * B.v[1] - (B.p[1] - A.p[1]) * B.v[0]) / den; out.push([A.p[0] + A.v[0] * t, A.p[1] + A.v[1] * t]);
    }
    return out;
  }

  /* ================================================================ QUANTIDADES
   * lista = peças do motor OU caixas do editor (c.vedacao). Soma por papel; telha e parede por área e peso, acessório
   * por metro linear. ⚠ É a mesma soma dos números que cada peça leva — não há segunda conta. */
  function quantidades(lista) {
    var Q = { porPapel: {}, cobertura: { area: 0, peso: 0, massa: 0, telhas: 0 }, fechamento: { area: 0, peso: 0, massa: 0, telhas: 0, porFace: {} }, paredes: { area: 0, peso: 0, massa: 0 }, lineares: {}, pecas: 0 };
    arr(lista).forEach(function (x) {
      var v = x && x.vedacao ? x.vedacao : x; if (!v || !v.papel) return;
      Q.pecas++;
      var p = Q.porPapel[v.papel] = Q.porPapel[v.papel] || { n: 0, area: 0, peso: 0, massa: 0, comprimento: 0, telhas: 0 };
      p.n++; p.area += num(v.area, 0); p.peso += num(v.peso, 0); p.massa += num(v.massa, 0); p.comprimento += num(v.comprimento, 0); p.telhas += num(v.nPecas, 0);
      if (v.papel === "Telha de cobertura") { Q.cobertura.area += num(v.area, 0); Q.cobertura.peso += num(v.peso, 0); Q.cobertura.massa += num(v.massa, 0); Q.cobertura.telhas += num(v.nPecas, 0); }
      else if (v.papel === "Telha de fechamento") {
        Q.fechamento.area += num(v.area, 0); Q.fechamento.peso += num(v.peso, 0); Q.fechamento.massa += num(v.massa, 0); Q.fechamento.telhas += num(v.nPecas, 0);
        var pf = Q.fechamento.porFace[v.face] = Q.fechamento.porFace[v.face] || { area: 0, peso: 0 }; pf.area += num(v.area, 0); pf.peso += num(v.peso, 0);
      } else if (v.papel === "Alvenaria" || v.papel === "Painel pré-moldado") { Q.paredes.area += num(v.area, 0); Q.paredes.peso += num(v.peso, 0); Q.paredes.massa += num(v.massa, 0); }
      else if (num(v.comprimento, 0) > 0) Q.lineares[v.papel] = (Q.lineares[v.papel] || 0) + num(v.comprimento, 0);
    });
    function arred(o) { Object.keys(o).forEach(function (k) { if (typeof o[k] === "number") o[k] = r4(o[k]); else if (o[k] && typeof o[k] === "object") arred(o[k]); }); }
    arred(Q);
    return Q;
  }

  /* ================================================================ A CAIXA DO EDITOR
   * tipo "vedacao" com a geometria de uma chapa (ou chapa dobrada) do js/metalpeca.js: o 3D, a planta, os cortes e o IFC
   * usam os mesmos sólidos (BimMetal.solidos). c.ifc = a classe IFC de verdade (IfcCovering, IfcWall, IfcPipeSegment);
   * c.vedacao.desenho = o tipo com que a malha entra na planta, no DXF e nos estilos (telhado ou parede). */
  function caixa(p) {
    var M = BM(); if (!M) return { erro: "O motor de peças (js/metalpeca.js) não carregou." };
    var c;
    if (p.chapa) c = M.chapa({ origem: p.chapa.origem, ex: p.chapa.ex, ey: p.chapa.ey, t: p.chapa.t, contorno: p.chapa.contorno, recortes: p.chapa.recortes, aco: "-", papel: p.papel, nome: p.nome });
    /* ⚠ os pontos da seção vão como { x, y } (o js/metalplanif.js lê as duas formas): a nuvem (Firestore) recusa LISTA DENTRO
       DE LISTA e a bim_edicoes não tem a tradução da fronteira (js/store.js, NUVEM_SEM_LISTA_EM_LISTA) — uma peça com
       [[x, y]] travaria o sincronismo do modelo da obra inteira. O teste confere a caixa toda. */
    else if (p.dobrada) c = M.perfil({ origem: p.dobrada.origem, ex: p.dobrada.ex, ey: p.dobrada.ey, perfil: { forma: "dobrada", pts: p.dobrada.pts.map(function (q) { return { x: q[0], y: q[1] }; }), t: p.dobrada.t, ri: p.dobrada.ri, rot: p.papel }, L: p.dobrada.L, papel: p.papel, nome: p.nome, aco: "Aço galvanizado (partida)" });
    else return { erro: "Peça de vedação sem geometria." };
    if (!c || c.erro) return { erro: (c && c.erro) || "A peça de vedação ficou sem geometria." };
    c.tipo = "vedacao"; c.ifc = p.ifc || "IFCCOVERING";
    var v = {};
    ["chave", "papel", "nome", "categoria", "desenho", "ifcTipo", "face", "material", "textura", "acimaSempre", "area", "peso", "massa", "comprimento", "modulo", "nPecas", "comprimentoPeca", "telha", "parede", "partida"].forEach(function (k) { if (p[k] != null) v[k] = p[k]; });
    c.vedacao = v;
    /* a massa e a área da peça são as da vedação (catálogo), não as do aço maciço do envelope desenhado */
    if (v.massa != null) { c.massa = v.massa; if (c.medidas) c.medidas.massa = v.massa; }
    if (v.area != null) { c.area = v.area; if (c.medidas) c.medidas.area = v.area; }
    if (v.comprimento != null && c.medidas) c.medidas.comprimento = v.comprimento;
    return c;
  }

  /* ================================================================ JUNTAS (o desenho da telha no 3D)
   * as juntas entre as telhas, a cada LARGURA ÚTIL do catálogo, na face de fora: [[x1,y1,z1, x2,y2,z2]…] no mundo.
   * A onda em si fica com a textura (telha metálica / fibrocimento) do estilo Realista — leve: uma linha por junta. */
  function juntas(c) {
    var v = c && c.vedacao, m = c && c.metal, M = BM();
    if (!v || !m || m.kind !== "chapa" || !(num(v.modulo, 0) > 0.05) || !M || !M.quadro) return [];
    var C = arr(m.contorno).map(function (q) { return Array.isArray(q) ? q : [q.u, q.v]; }), F = arr(m.recortes).map(function (r) { return arr(r.pts || r).map(function (q) { return Array.isArray(q) ? q : [q.u, q.v]; }); });
    if (C.length < 3) return [];
    var us = C.map(function (q) { return q[0]; }), u0 = Math.min.apply(null, us), u1 = Math.max.apply(null, us), lu = num(v.modulo, 1), Q = M.quadro(c), z = num(m.t, 0) + 0.002, out = [];
    var aneis = [C].concat(F);
    for (var k = 1; u0 + k * lu < u1 - 0.02 && k < 2000; k++) {
      var uc = u0 + k * lu, vs = [];
      aneis.forEach(function (R) { for (var i = 0; i < R.length; i++) { var a = R[i], b = R[(i + 1) % R.length]; if ((a[0] - uc) * (b[0] - uc) < 0) vs.push(a[1] + (b[1] - a[1]) * (uc - a[0]) / (b[0] - a[0])); } });
      vs.sort(function (x, y) { return x - y; });
      for (var j = 0; j + 1 < vs.length; j += 2) {
        if (vs[j + 1] - vs[j] < 0.02) continue;
        var A = add(add(add(Q.O, mul(Q.X, uc)), mul(Q.Y, vs[j])), mul(Q.Z, z)), B = add(add(add(Q.O, mul(Q.X, uc)), mul(Q.Y, vs[j + 1])), mul(Q.Z, z));
        out.push([A[0], A[1], A[2], B[0], B[1], B[2]]);
      }
    }
    return out;
  }

  var AcoVedacao = { PARTIDA: PARTIDA, FACES: FACES, KN_POR_KG: KN_POR_KG, galpao: galpao, estrutura: estrutura, quantidades: quantidades, caixa: caixa, juntas: juntas,
    dadosTelha: dadosTelha, dadosParede: dadosParede, telhaPadrao: telhaPadrao, tipoFace: tipoFace,
    _int: { painelComVaos: painelComVaos, areaLiq: areaLiq, livresNaLinha: livresNaLinha, planoMQ: planoMQ, recortarMeioPlano: recortarMeioPlano, afastarPoligono: afastarPoligono, area2: area2 } };
  global.AcoVedacao = AcoVedacao;
  if (typeof module !== "undefined" && module.exports) module.exports = AcoVedacao;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
