/* =====================================================================
 * acomodelo.js — O MODELO DE CÁLCULO DO GALPÃO (motor PURO, ES5, sem DOM).
 *
 * É aqui que o sistema "entende" a estrutura, para o engenheiro não
 * precisar configurar nada à mão:
 *   · onde vão as terças (pelo vão máximo da TELHA escolhida, na carga do
 *     projeto), as travessas de fechamento, as colunas de tapamento dos
 *     oitões e os vãos contraventados;
 *   · como cada ação chega em cada barra (telha → terça → viga; parede →
 *     pilar; oitão → tapamento → contraventamento → fundação);
 *   · que mesa de cada barra está travada e onde (a terça trava a mesa de
 *     cima da viga; a travessa, a mesa de fora do pilar; a mão-francesa, a
 *     de dentro/de baixo), e o comprimento de flambagem de cada eixo;
 *   · e cada DECISÃO vai para um registro com o motivo, que o memorial
 *     mostra ("terças a cada 1,95 m: vão máximo da telha TP-40 0,50 mm para
 *     0,50 kN/m² = 2,20 m").
 * Quando falta algo que a estrutura precisa (sem contraventamento, por
 * exemplo), o montador NÃO inventa: devolve o problema e as soluções
 * possíveis; o orquestrador (js/acodimensionar.js) aplica a escolhida.
 *
 * Coordenadas: X ao longo do vão (0 = eixo do pilar esquerdo), Y para
 * cima (0 = topo da base), Z ao longo do comprimento (0 = oitão da frente).
 * Unidades: m, kN. Eixos locais das barras: os do js/acoanalise.js (y =
 * altura da seção); a escolha de `vy` faz a mesa +y ser sempre a de DENTRO
 * do pilar e a de CIMA da viga.
 * Teste: node tools/test-aco-modelo.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function Sec() { return dep("AcoSecao", "./acosecao.js"); }
  function Cat() { return dep("PerfisAco", "./perfisaco.js"); }
  function Mat() { return dep("AcoMateriais", "./acomateriais.js"); }
  function Car() { return dep("AcoCargas", "./acocargas.js"); }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function br(v, c) { if (v == null || !isFinite(v)) return "—"; c = c == null ? 2 : c; return (Math.round(v * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }

  /* ------------------------------------------------------------ PARÂMETROS */
  /* #50 (15/10/2026, pedido do Rogério): base ENGASTADA por padrão ("em galpão a maioria são engastados") — a tela do galpão
     (js/metalcalcui.js) já partia de engastada e grava a escolha; este padrão vale para quem chama o motor sem dizer a base */
  var PADRAO = {
    geometria: { vao: 20, comprimento: 40, espacamento: 6, peDireito: 6, inclinacaoPct: 10, aguas: 2, base: "engastada", tipoPortico: "alma-cheia" },
    perfis: { pilar: "W 310 x 38,7 Gerdau", viga: "W 310 x 32,7 Gerdau", tapamento: "W 200 x 15,0 Gerdau", escora: "auto", terca: "auto", travessa: "auto", contravento: "auto" },
    acos: { perfil: "ASTM A572 Gr.50", frio: "NBR 6650 CF-26", barra: "ASTM A36" },
    cobertura: { telhaPeso: null, telhaVaoMax: null, telhaNome: "telha de aço trapezoidal", permanenteExtra: 0.10, empocamentoVerificado: false },
    fechamentos: {
      esquerda: { tipo: "telha" }, direita: { tipo: "telha" }, frente: { tipo: "telha" }, fundo: { tipo: "telha" }
    },
    contraventamento: "auto",          /* "auto" | "X-barra" | "X-cantoneira" | "portico" | "nenhum" */
    maoFrancesa: "auto",               /* "auto" | "sempre" | "nunca" */
    acrescimoLigacoes: 0.05,           /* peso de chapas, parafusos e enrijecedores sobre o peso dos perfis (premissa) */
    espTercaMax: 2.5, espTravessaMax: 2.0, espTapamentoMax: 6.0, comprimentoContraventado: 60
  };
  function mesclar(a, b) { var o = {}; Object.keys(a || {}).forEach(function (k) { o[k] = a[k]; }); Object.keys(b || {}).forEach(function (k) { if (b[k] != null) o[k] = (typeof b[k] === "object" && !Array.isArray(b[k]) && a && typeof a[k] === "object") ? mesclar(a[k], b[k]) : b[k]; }); return o; }

  /* propriedades de cálculo (m) a partir do nome do catálogo; devolve também as de mm para o dimensionamento */
  function secaoDe(nome) {
    var C = Cat(), S = Sec(); if (!C || !S || !nome) return null;
    var c = C.obter(nome); if (!c) return null;
    var p = S.dePerfil(c, c.forma); if (!p) return null;
    return { nome: c.nome, mm: p, A: p.A * 1e-6, Iz: p.Ix * 1e-12, Iy: p.Iy * 1e-12, J: p.J * 1e-12, massa: num(c.massa, p.massa), forma: c.forma, cat: c };
  }
  function barraRedonda(dmm) { var S = Sec(), p = S.barraRedonda(dmm); return { nome: "Barra redonda Ø " + br(dmm, 1) + " mm", mm: p, A: p.A * 1e-6, Iz: p.Ix * 1e-12, Iy: p.Iy * 1e-12, J: p.J * 1e-12, massa: p.massa, forma: "circ" }; }

  /* ------------------------------------------------------------ LAYOUT */
  function layout(par, decisoes) {
    var g = par.geometria, vao = num(g.vao, 20), Lt = num(g.comprimento, 40), H = num(g.peDireito, 6), i = num(g.inclinacaoPct, 10) / 100, aguas = num(g.aguas, 2) === 1 ? 1 : 2;
    var th = Math.atan(i), co = Math.cos(th);
    /* pórticos: o espaçamento pedido vira o mais próximo que divide o comprimento */
    var nV = Math.max(1, Math.round(Lt / num(g.espacamento, 6))), esp = Lt / nV, zs = [];
    for (var k = 0; k <= nV; k++) zs.push(r6(k * esp));
    decisoes.push({ tema: "Pórticos", decisao: (nV + 1) + " pórticos a cada " + br(esp, 2) + " m", motivo: "comprimento " + br(Lt, 2) + " m dividido no espaçamento mais próximo do pedido (" + br(num(g.espacamento, 6), 2) + " m)" });
    /* terças: vão máximo da telha na carga de projeto (quem chama manda telhaVaoMax já resolvido) */
    var sMaxTelha = num(par.cobertura.telhaVaoMax, null), sMax = Math.min(num(par.espTercaMax, 2.5), sMaxTelha || 99);
    var meio = aguas === 2 ? vao / 2 : vao, Ls = meio / co, nT = Math.max(1, Math.ceil(Ls / sMax - 1e-9)), sT = Ls / nT;
    decisoes.push({ tema: "Terças", decisao: (nT + 1) * aguas + " linhas de terça, a cada " + br(sT, 2) + " m na água (" + br(sT * co, 2) + " m em planta)",
                    motivo: sMaxTelha ? "vão máximo da " + (par.cobertura.telhaNome || "telha") + " na carga do projeto = " + br(sMaxTelha, 2) + " m" + (sMaxTelha > sMax ? " (limitado a " + br(sMax, 2) + " m)" : "") : "sem tabela de vão da telha: limite de partida " + br(sMax, 2) + " m" });
    var xsT = []; for (var j = 0; j <= nT; j++) xsT.push(r6(j * sT * co));   /* posições em planta a partir do beiral esquerdo */
    /* travessas das paredes laterais (só onde há telha: "telha" inteiro; "misto" acima da alvenaria) */
    function travessas(face) {
      var f = par.fechamentos[face] || {}, y0 = f.tipo === "misto" ? num(f.alturaAlvenaria, 3) : 0;
      if (!(f.tipo === "telha" || f.tipo === "misto")) return [];
      var h = H - y0, n = Math.max(1, Math.ceil(h / num(par.espTravessaMax, 2.0) - 1e-9)), s = h / n, ys = [];
      for (var q = (f.tipo === "misto" ? 0 : 1); q < n; q++) ys.push(r6(y0 + q * s));
      return ys;
    }
    var travE = travessas("esquerda"), travD = travessas("direita"), travF = travessas("frente"), travB = travessas("fundo");
    if (travE.length || travD.length) decisoes.push({ tema: "Travessas de fechamento", decisao: "laterais: " + (travE.length ? travE.map(function (y) { return br(y, 2); }).join("; ") + " m (esquerda)" : "sem (esquerda)") + "; " + (travD.length ? travD.map(function (y) { return br(y, 2); }).join("; ") + " m (direita)" : "sem (direita)"), motivo: "espaçamento ≤ " + br(num(par.espTravessaMax, 2), 2) + " m (vão da telha de fechamento); a travessa trava a mesa de fora do pilar" });
    /* colunas de tapamento nos oitões fechados */
    function tapamentos(face) {
      var f = par.fechamentos[face] || {}; if (!f.tipo || f.tipo === "aberto") return [];
      var n = Math.max(0, Math.ceil(vao / num(par.espTapamentoMax, 6) - 1e-9) - 1), xs = [];
      for (var q = 1; q <= n; q++) xs.push(r6(vao * q / (n + 1)));
      return xs;
    }
    var tapF = tapamentos("frente"), tapB = tapamentos("fundo");
    if (tapF.length || tapB.length) decisoes.push({ tema: "Colunas de tapamento", decisao: tapF.length + " no oitão da frente e " + tapB.length + " no do fundo", motivo: "oitão fechado: o vão das travessas do oitão fica ≤ " + br(num(par.espTapamentoMax, 6), 1) + " m; a coluna leva o vento do oitão para a base e para o contraventamento da cobertura" });
    /* vãos contraventados: os extremos e, em galpão longo, mais um no meio a cada ~60 m */
    var vaosCV = [0]; if (nV > 1) vaosCV.push(nV - 1);
    var Lcv = num(par.comprimentoContraventado, 60);
    if (Lt > Lcv && nV > 3) { var extra = Math.floor(Lt / Lcv); for (var e = 1; e <= extra; e++) { var kk = Math.round(nV * e / (extra + 1)); if (vaosCV.indexOf(kk) < 0 && kk > 0 && kk < nV - 1) vaosCV.push(kk); } }
    vaosCV.sort(function (a, b) { return a - b; });
    if (travF.length || travB.length) decisoes.push({ tema: "Travessas dos oitões", decisao: "frente: " + (travF.length ? travF.map(function (y) { return br(y, 2); }).join("; ") + " m" : "sem") + "; fundo: " + (travB.length ? travB.map(function (y) { return br(y, 2); }).join("; ") + " m" : "sem"), motivo: "seguram a telha do oitão e TRAVAM as colunas de tapamento no eixo fraco (sem elas a coluna flamba de lado)" });
    return { vao: vao, Lt: Lt, H: H, i: i, th: th, co: co, aguas: aguas, nV: nV, esp: esp, zs: zs, nT: nT, sT: sT, xsT: xsT, travE: travE, travD: travD, travF: travF, travB: travB, tapF: tapF, tapB: tapB, vaosCV: vaosCV };
  }

  function yTelhado(L, x) { if (L.aguas === 2) return L.H + L.i * Math.min(x, L.vao - x); return L.H + L.i * x; }

  /* ================================================================ MODELO */
  function galpao(parEntrada) {
    var par = mesclar(PADRAO, parEntrada || {}), decisoes = [], avisos = [], problemas = [];
    var L = layout(par, decisoes);
    var M = Mat(), aco = function (uso) { return M ? (M.aco(par.acos[uso] || M.PADRAO[uso]) || M.padrao(uso)) : { id: "?", fy: 345, fu: 450 }; };
    var E = M ? M.CONST.E * 1000 : 2e8, G = M ? M.CONST.G * 1000 : 7.7e7;   /* kN/m² */
    /* perfis */
    var sP = secaoDe(par.perfis.pilar), sV = secaoDe(par.perfis.viga), sTap = secaoDe(par.perfis.tapamento);
    if (!sP || !sV) return { ok: false, motivo: "Perfil do pilar ou da viga não encontrado no catálogo (" + par.perfis.pilar + " / " + par.perfis.viga + ")." };
    var sEsc = par.perfis.escora && par.perfis.escora !== "auto" ? secaoDe(par.perfis.escora) : null;
    if (!sEsc) sEsc = { nome: "Terça (escora)", A: 7e-4, Iz: 2e-6, Iy: 3e-7, J: 1e-9, massa: 5.5, forma: "frio", mm: null };   /* placeholder axial: a terça real é dimensionada à parte (NBR 14762) */
    var dCV = num(par.contraventoDiametro, 12.5), sCV = (par.contraventamento === "X-cantoneira" && par.perfis.contravento && par.perfis.contravento !== "auto") ? secaoDe(par.perfis.contravento) : barraRedonda(dCV);
    var nos = [], barras = [], apoios = [], idx = {}, projeto = {}, membros = [];
    function no(id, x, y, z) { if (idx[id] != null) return id; idx[id] = nos.length; nos.push({ id: id, x: r6(x), y: r6(y), z: r6(z) }); return id; }
    function barra(o) { barras.push(o); return o.id; }
    function membro(m) { membros.push(m); return m; }
    var ROT = { i: { rx: true, ry: true, rz: true }, j: { ry: true, rz: true } };
    var baseApoio = par.geometria.base === "engastada" ? { ux: true, uy: true, uz: true, ry: true, rz: true } : { ux: true, uy: true, uz: true, ry: true };
    var acoP = aco("perfil");
    var pporticos = [];
    /* ---------------------------------------------------------------- pórticos */
    L.zs.forEach(function (z, k) {
      var fr = { k: k, z: z, pilares: [], vigas: [] };
      var lados = L.aguas === 2 ? [0, 1] : [0, 1];
      lados.forEach(function (lado) {
        var x = lado ? L.vao : 0, Htop = lado && L.aguas === 1 ? L.H + L.i * L.vao : L.H;
        var trav = (lado ? L.travD : L.travE).filter(function (y) { return y < Htop - 1e-6; });
        var oit = k === 0 ? L.travF : (k === L.nV ? L.travB : []);
        var alturas = trav.concat(oit.filter(function (y) { return y < Htop - 1e-6 && trav.every(function (t2) { return Math.abs(t2 - y) > 1e-6; }); })).sort(function (a, b) { return a - b; });
        var ids = ["B" + k + (lado ? "R" : "L")];
        no(ids[0], x, 0, z);
        alturas.forEach(function (y) { var t = trav.indexOf(y); ids.push(no(t >= 0 ? "T" + k + (lado ? "R" : "L") + t : "TG" + k + (lado ? "R" : "L") + "_" + Math.round(y * 1000), x, y, z)); });
        ids.push(no("E" + k + (lado ? "R" : "L"), x, Htop, z));
        apoios.push({ no: ids[0], ux: baseApoio.ux, uy: baseApoio.uy, uz: baseApoio.uz, ry: baseApoio.ry, rz: baseApoio.rz });
        var segs = [];
        for (var q = 0; q + 1 < ids.length; q++) segs.push(barra({ id: "P" + k + (lado ? "R" : "L") + "_" + q, i: ids[q], j: ids[q + 1], secao: { A: sP.A, Iy: sP.Iy, Iz: sP.Iz, J: sP.J }, E: E, G: G, vy: [lado ? -1 : 1, 0, 0], nElem: 2 }));
        var m = membro({ id: "P" + k + (lado ? "R" : "L"), papel: "pilar", grupo: "pilar", segs: segs, nos: ids, L: Htop, secao: sP, aco: acoP, k: k, lado: lado,
                         flambagem: { Lx: Htop, Ly: trav.length ? Math.max.apply(null, [trav[0]].concat(trav.map(function (y, t) { return t ? y - trav[t - 1] : y; })).concat([Htop - trav[trav.length - 1]])) : Htop },
                         travamentos: { menos: trav.slice(), mais: [] } });   /* a travessa trava a mesa de FORA (−y) */
        m.flambagem.Lz = m.flambagem.Ly;
        fr.pilares.push(m);
      });
      /* vigas de cobertura: do beiral à cumeeira (duas águas) ou de pilar a pilar (uma água) */
      function viga(nome, x0, x1, sentido) {
        var xs = L.xsT.map(function (xp) { return x0 + sentido * xp; }).filter(function (x) { return sentido > 0 ? x <= x1 + 1e-6 : x >= x1 - 1e-6; });
        /* nós de tapamento nas vigas do oitão */
        var taps = (k === 0 ? L.tapF : k === L.nV ? L.tapB : []).filter(function (xt) { return (xt - Math.min(x0, x1)) > 1e-6 && (Math.max(x0, x1) - xt) > 1e-6; });
        xs = xs.concat(taps).sort(function (a, b) { return sentido > 0 ? a - b : b - a; }).filter(function (x, q, a) { return !q || Math.abs(x - a[q - 1]) > 1e-6; });
        var ids = xs.map(function (x, q) {
          if (q === 0) return (x0 === 0 ? "E" + k + "L" : "E" + k + "R");
          if (L.aguas === 2 && Math.abs(x - L.vao / 2) < 1e-6) return no("C" + k, x, yTelhado(L, x), z);
          if (L.aguas === 1 && Math.abs(x - L.vao) < 1e-6) return "E" + k + "R";
          return no("V" + k + nome + "_" + q, x, yTelhado(L, x), z);
        });
        var dir = [(xs[xs.length - 1] - xs[0]), yTelhado(L, xs[xs.length - 1]) - yTelhado(L, xs[0]), 0], Lm = Math.sqrt(dir[0] * dir[0] + dir[1] * dir[1]);
        var ex = [dir[0] / Lm, dir[1] / Lm, 0], vy = [-ex[1] * (sentido > 0 ? 1 : -1) * (sentido > 0 ? 1 : 1), ex[0] * (sentido > 0 ? 1 : 1), 0];
        vy = [-ex[1], ex[0], 0]; if (vy[1] < 0) vy = [ex[1], -ex[0], 0];   /* normal para CIMA = mesa de cima é +y */
        var segs = [];
        for (var q2 = 0; q2 + 1 < ids.length; q2++) segs.push(barra({ id: "V" + k + nome + "_" + q2, i: ids[q2], j: ids[q2 + 1], secao: { A: sV.A, Iy: sV.Iy, Iz: sV.Iz, J: sV.J }, E: E, G: G, vy: vy, nElem: 2 }));
        var posT = L.xsT.map(function (xp) { return xp / L.co; }).filter(function (s) { return s > 1e-6 && s < Lm - 1e-6; });
        var m = membro({ id: "V" + k + nome, papel: "viga", grupo: "viga", segs: segs, nos: ids, L: Lm, secao: sV, aco: acoP, k: k,
                         flambagem: { Lx: Lm, Ly: L.sT, Lz: L.sT }, travamentos: { mais: posT, menos: [] } });   /* a terça trava a mesa de CIMA (+y) */
        fr.vigas.push(m);
        return m;
      }
      if (L.aguas === 2) { viga("L", 0, L.vao / 2, 1); viga("R", L.vao, L.vao / 2, -1); }
      else viga("L", 0, L.vao, 1);
      pporticos.push(fr);
    });
    /* --------------------------------------------- linhas longitudinais (escoras = terças, beiral, travessas) */
    var linhasTerca = [];
    L.xsT.forEach(function (xp, q) {
      var lados = L.aguas === 2 ? [["L", xp], ["R", L.vao - xp]] : [["L", xp]];
      lados.forEach(function (ld) {
        if (L.aguas === 2 && ld[0] === "R" && Math.abs(ld[1] - L.vao / 2) < 1e-6) return;   /* cumeeira: uma linha só */
        var linha = [];
        L.zs.forEach(function (z, k) {
          var id = q === 0 ? "E" + k + ld[0] : (L.aguas === 2 && Math.abs(ld[1] - L.vao / 2) < 1e-6 ? "C" + k : (L.aguas === 1 && q === L.nT ? "E" + k + "R" : "V" + k + ld[0] + "_" + q));
          if (idx[id] == null) { /* vigas do oitão podem ter ganho nós extras: o índice q continua igual porque as terças vêm primeiro */ id = null; }
          linha.push(id);
        });
        linhasTerca.push({ x: ld[1], q: q, nos: linha, beiral: q === 0 });
      });
    });
    /* nos das vigas foram criados com índice da posição na lista ordenada (terças + tapamentos): reconstruir por coordenada */
    function noEm(x, y, z) { for (var t = 0; t < nos.length; t++) { var n = nos[t]; if (Math.abs(n.x - x) < 1e-5 && Math.abs(n.y - y) < 1e-5 && Math.abs(n.z - z) < 1e-5) return n.id; } return null; }
    linhasTerca.forEach(function (ln) { ln.nos = L.zs.map(function (z) { return noEm(ln.x, yTelhado(L, ln.x), z); }); });
    linhasTerca.forEach(function (ln, t) {
      for (var k = 0; k + 1 < L.zs.length; k++) {
        if (!ln.nos[k] || !ln.nos[k + 1]) continue;
        barra({ id: (ln.beiral ? "BE" : "ES") + t + "_" + k, i: ln.nos[k], j: ln.nos[k + 1], secao: { A: sEsc.A, Iy: sEsc.Iy, Iz: sEsc.Iz, J: sEsc.J }, E: E, G: G, vy: [0, 1, 0], libera: ROT, semPeso: true });
      }
    });
    /* travessas laterais como escoras (travam o pilar e levam a força longitudinal) */
    [["L", L.travE], ["R", L.travD]].forEach(function (par2) {
      par2[1].forEach(function (y, t) {
        for (var k = 0; k + 1 < L.zs.length; k++) {
          var a = "T" + k + par2[0] + t, b = "T" + (k + 1) + par2[0] + t;
          if (idx[a] == null || idx[b] == null) continue;
          barra({ id: "TR" + par2[0] + t + "_" + k, i: a, j: b, secao: { A: sEsc.A, Iy: sEsc.Iy, Iz: sEsc.Iz, J: sEsc.J }, E: E, G: G, vy: [0, 1, 0], libera: ROT, semPeso: true });
        }
      });
    });
    /* -------------------------------------------------------- colunas de tapamento */
    var taps = [];
    [[0, L.tapF, 1], [L.nV, L.tapB, -1]].forEach(function (t3) {
      var k = t3[0];
      t3[1].forEach(function (xt, q) {
        if (!sTap) return;
        var topo = noEm(xt, yTelhado(L, xt), L.zs[k]); if (!topo) return;
        var base = no("BT" + k + "_" + q, xt, 0, L.zs[k]);
        apoios.push({ no: base, ux: true, uy: true, uz: true, ry: true });
        var Ht = yTelhado(L, xt), gir = (k === 0 ? L.travF : L.travB).filter(function (y) { return y < Ht - 0.3; });
        var idsT = [base].concat(gir.map(function (y) { return no("TT" + k + "_" + q + "_" + Math.round(y * 1000), xt, y, L.zs[k]); })).concat([topo]), segsT = [];
        for (var s2 = 0; s2 + 1 < idsT.length; s2++) segsT.push(barra({ id: "TP" + k + "_" + q + "_" + s2, i: idsT[s2], j: idsT[s2 + 1], secao: { A: sTap.A, Iy: sTap.Iy, Iz: sTap.Iz, J: sTap.J }, E: E, G: G, vy: [0, 0, t3[2]], nElem: 2, libera: s2 + 2 === idsT.length ? { j: { ry: true, rz: true } } : undefined }));
        var marcos = [0].concat(gir).concat([Ht]), LyT = 0; for (var g2 = 1; g2 < marcos.length; g2++) LyT = Math.max(LyT, marcos[g2] - marcos[g2 - 1]);
        taps.push(membro({ id: "TP" + k + "_" + q, papel: "tapamento", grupo: "tapamento", segs: segsT, nos: idsT, L: Ht, secao: sTap, aco: acoP, k: k, x: xt,
                           flambagem: { Lx: Ht, Ly: LyT, Lz: LyT }, travamentos: { mais: [], menos: gir.slice() } }));   /* a travessa do oitão trava a mesa de fora (−y) */
      });
    });
    /* travessas dos oitões como escoras: canto → tapamentos → canto, em cada altura (travam o eixo fraco das colunas) */
    [[0, L.travF], [L.nV, L.travB]].forEach(function (t2) {
      var k = t2[0], zz = L.zs[k];
      t2[1].forEach(function (y) {
        var xs = [0].concat((k === 0 ? L.tapF : L.tapB).filter(function (xt) { return y < yTelhado(L, xt) - 0.3; })).concat([L.vao]);
        var idsL = xs.map(function (x) { return noEm(x, y, zz); });
        for (var q2 = 0; q2 + 1 < idsL.length; q2++) {
          if (!idsL[q2] || !idsL[q2 + 1]) continue;
          barra({ id: "TO" + k + "_" + Math.round(y * 1000) + "_" + q2, i: idsL[q2], j: idsL[q2 + 1], secao: { A: sEsc.A, Iy: sEsc.Iy, Iz: sEsc.Iz, J: sEsc.J }, E: E, G: G, vy: [0, 1, 0], libera: ROT, semPeso: true });
        }
      });
    });
    /* --------------------------------------------------------- CONTRAVENTAMENTO */
    var cv = par.contraventamento === "auto" ? "X-barra" : par.contraventamento;
    if (par.contraventamento === "auto") decisoes.push({ tema: "Contraventamento", decisao: "X de barra redonda (só tração) nos vãos " + L.vaosCV.map(function (v) { return (v + 1) + "º"; }).join(", ") + ", nas duas paredes e na cobertura", motivo: "estabilidade longitudinal e caminho do vento do oitão até a fundação; galpões acima de " + br(num(par.comprimentoContraventado, 60), 0) + " m ganham vão contraventado intermediário" });
    var nCV = 0;
    if (cv === "nenhum") {
      problemas.push({ tipo: "estabilidade-longitudinal", texto: "Sem contraventamento, o galpão não tem como resistir às forças longitudinais (vento no oitão, imperfeições): a estrutura fica instável na direção do comprimento.",
                       solucoes: [{ id: "X-barra", texto: "X de barra redonda nos vãos extremos (o usual, mais leve)" }, { id: "X-cantoneira", texto: "X de cantoneira nos vãos extremos" }, { id: "portico", texto: "Pórtico de travamento (viga do beiral ligada rígida aos pilares) nos vãos extremos — libera o vão para portão" }] });
    } else if (cv === "portico") {
      L.vaosCV.forEach(function (v) {
        ["L", "R"].forEach(function (s) {
          var a = "E" + v + s, b = "E" + (v + 1) + s;
          barra({ id: "PT" + v + s, i: a, j: b, secao: { A: sV.A, Iy: sV.Iy, Iz: sV.Iz, J: sV.J }, E: E, G: G, vy: [0, 1, 0], nElem: 2 });
          nCV++;
        });
      });
      decisoes.push({ tema: "Contraventamento das paredes", decisao: "pórtico de travamento nos vãos contraventados (viga do beiral com ligação rígida)", motivo: "escolha do usuário (sem X nas paredes)" });
    }
    if (cv === "X-barra" || cv === "X-cantoneira" || cv === "portico") {
      L.vaosCV.forEach(function (v) {
        /* paredes (só X) */
        if (cv !== "portico") ["L", "R"].forEach(function (s) {
          var b0 = "B" + v + s, b1 = "B" + (v + 1) + s, e0 = "E" + v + s, e1 = "E" + (v + 1) + s;
          [[b0, e1], [b1, e0]].forEach(function (pr, q) { barra({ id: "XP" + v + s + q, i: pr[0], j: pr[1], secao: { A: sCV.A, Iy: sCV.Iy, Iz: sCV.Iz, J: sCV.J }, E: E, G: G, tracao: true, papel: "contravento" }); nCV++; });
        });
        /* cobertura: X por painel entre linhas de terça escolhidas (ângulo perto de 45°) */
        var passo = Math.max(1, Math.round(L.esp / L.sT));
        var lin = linhasTerca.filter(function (ln) { return ln.q % passo === 0 || ln.q === L.nT; });
        var porLado = {};
        lin.forEach(function (ln) {
          var cume = L.aguas === 2 && Math.abs(ln.x - L.vao / 2) < 1e-6;   /* a linha da cumeeira fecha os painéis das DUAS águas */
          if (L.aguas === 1 || ln.x <= L.vao / 2 + 1e-6) (porLado.L = porLado.L || []).push(ln);
          if (L.aguas === 2 && (ln.x >= L.vao / 2 - 1e-6 || cume)) (porLado.R = porLado.R || []).push(ln);
        });
        Object.keys(porLado).forEach(function (lado) {
          var ls = porLado[lado].sort(function (a, b) { return lado === "L" ? a.x - b.x : b.x - a.x; });
          for (var q = 0; q + 1 < ls.length; q++) {
            var a0 = ls[q].nos[v], a1 = ls[q].nos[v + 1], c0 = ls[q + 1].nos[v], c1 = ls[q + 1].nos[v + 1];
            if (!a0 || !a1 || !c0 || !c1) continue;
            [[a0, c1], [a1, c0]].forEach(function (pr, t) { barra({ id: "XC" + v + lado + q + "_" + t, i: pr[0], j: pr[1], secao: { A: sCV.A, Iy: sCV.Iy, Iz: sCV.Iz, J: sCV.J }, E: E, G: G, tracao: cv !== "X-cantoneira" ? true : true, papel: "contravento" }); nCV++; });
          }
        });
      });
    }
    /* ------------------------------------------------- grupos e dados de projeto */
    var grupos = {
      pilar: { papel: "pilar", perfil: sP.nome, aco: acoP, membros: [] }, viga: { papel: "viga", perfil: sV.nome, aco: acoP, membros: [] },
      tapamento: { papel: "tapamento", perfil: sTap ? sTap.nome : null, aco: acoP, membros: [] },
      contravento: { papel: "tirante", perfil: sCV.nome, aco: aco("barra"), barras: barras.filter(function (b) { return b.papel === "contravento"; }).map(function (b) { return b.id; }) }
    };
    membros.forEach(function (m) { if (grupos[m.grupo]) grupos[m.grupo].membros.push(m.id); });
    var mods = { nos: nos, barras: barras, apoios: apoios, casos: [] };
    return { ok: !problemas.length, problemas: problemas, par: par, layout: L, modelo: mods, membros: membros, grupos: grupos, decisoes: decisoes, avisos: avisos,
             secoes: { pilar: sP, viga: sV, tapamento: sTap, escora: sEsc, contravento: sCV }, linhasTerca: linhasTerca, nContraventos: nCV };
  }

  /* ================================================================ CARGAS
   * Monta os casos de carga no modelo do galpao():
   *   G   — peso próprio dos perfis (× (1 + acréscimo de ligações)), telha +
   *         permanente extra + peso das terças nos nós das terças; fechamento
   *         lateral de telha nos pilares;
   *   Q   — sobrecarga de cobertura (NBR 6120:2019, 6.4) em projeção;
   *   W.. — vento: pressão líquida por face/zona, função `pressao(caso, face, u, v)`
   *         (kN/m², + empurra a face para DENTRO), com u, v na face:
   *           esquerda/direita: u = z; frente/fundo: u = x; cobertura: u = x, v = z.
   *         `vento.casos`: [{ id, nome, direcao }] e `vento.pressao(id, face, u, v)`.
   * cfg: { telhaPeso (kN/m² na superfície), permanenteExtra (kN/m² em projeção), tercaMassa (kg/m),
   *        travessaMassa (kg/m), fechamentoPeso (kN/m² da telha lateral), sobrecarga (kN/m²) } */
  function cargas(G, cfg, vento) {
    var L = G.layout, mod = G.modelo, par = G.par, casos = [], decisoes = G.decisoes;
    var nos = {}; mod.nos.forEach(function (n) { nos[n.id] = n; });
    /* faixas tributárias das linhas de terça (em planta) e dos pórticos */
    var lt = G.linhasTerca.slice().sort(function (a, b) { return a.x - b.x; });
    function faixaX(t) {   /* [x0, x1] em planta da linha t */
      var i0 = lt.indexOf(t), xa = i0 > 0 ? (lt[i0 - 1].x + t.x) / 2 : (L.aguas === 2 || t.x < 1e-6 ? 0 : t.x), xb = i0 < lt.length - 1 ? (lt[i0 + 1].x + t.x) / 2 : (L.aguas === 2 ? L.vao : L.vao);
      if (i0 === 0) xa = 0; if (i0 === lt.length - 1) xb = L.vao;
      return [xa, xb];
    }
    function faixaZ(k) { var za = k > 0 ? (L.zs[k - 1] + L.zs[k]) / 2 : 0, zb = k < L.zs.length - 1 ? (L.zs[k] + L.zs[k + 1]) / 2 : L.Lt; return [za, zb]; }
    var memPP = mod.barras.filter(function (b) { return !b.semPeso; }).map(function (b) { return b.id; });
    var acr = 1 + num(par.acrescimoLigacoes, 0.05);
    /* ------------------------------------------ G */
    var cG = [{ tipo: "pesoProprio", fator: acr, barras: memPP }], cG2 = [];
    var gTelha = num(cfg.telhaPeso, 0.05), gExtra = num(cfg.permanenteExtra, 0.10), mT = num(cfg.tercaMassa, 6) * 9.81 / 1000;
    lt.forEach(function (t) {
      var fx = faixaX(t), dx = fx[1] - fx[0];
      t.nos.forEach(function (nid, k) {
        if (!nid) return;
        var fz = faixaZ(k), dz = fz[1] - fz[0];
        /* terças (aço) no G; telha (na superfície → em planta ÷ cosθ) e instalações/forro no G2 */
        cG.push({ tipo: "no", no: nid, F: [0, -mT * dz, 0, 0, 0, 0] });
        cG2.push({ tipo: "no", no: nid, F: [0, -(gTelha / L.co + gExtra) * dx * dz, 0, 0, 0, 0] });
      });
    });
    /* fechamento lateral de telha: peso nos pilares (distribuído ao longo da altura com telha) */
    var gFech = num(cfg.fechamentoPeso, 0.06) + num(cfg.travessaMassa, 5) * 9.81 / 1000 / num(par.espTravessaMax, 2);
    G.membros.filter(function (m) { return m.papel === "pilar"; }).forEach(function (m) {
      var f = par.fechamentos[m.lado ? "direita" : "esquerda"] || {}; if (!(f.tipo === "telha" || f.tipo === "misto")) return;
      var fz = faixaZ(m.k), dz = fz[1] - fz[0], y0 = f.tipo === "misto" ? num(f.alturaAlvenaria, 3) : 0;
      m.segs.forEach(function (sid) {
        var b = mod.barras.filter(function (x) { return x.id === sid; })[0], ya = nos[b.i].y, yb = nos[b.j].y;
        var a = Math.max(0, Math.min(1, (y0 - ya) / (yb - ya)));
        if (a < 1) cG2.push({ tipo: "barra", barra: sid, q: [0, -gFech * dz, 0], a: a, b: 1 });
      });
    });
    casos.push({ id: "G", tipo: "G", categoria: "G-metalica", nome: "Permanente — estrutura metálica", cargas: cG });
    casos.push({ id: "G2", tipo: "G", categoria: "G-industrializado", nome: "Permanente — telhas, fechamentos e instalações", cargas: cG2 });
    /* ------------------------------------------ Q */
    var cQ = [], qk = num(cfg.sobrecarga, 0.25);
    lt.forEach(function (t) {
      var fx = faixaX(t), dx = fx[1] - fx[0];
      t.nos.forEach(function (nid, k) { if (!nid) return; var fz = faixaZ(k); cQ.push({ tipo: "no", no: nid, F: [0, -qk * dx * (fz[1] - fz[0]), 0, 0, 0, 0] }); });
    });
    casos.push({ id: "Q", tipo: "Q", categoria: "Q-cobertura", nome: "Sobrecarga de cobertura", cargas: cQ });
    /* ------------------------------------------ VENTO */
    if (vento && arr(vento.casos).length && typeof vento.pressao === "function") {
      vento.casos.forEach(function (vc) {
        var cW = [];
        /* cobertura: força normal à água, em cada nó de terça (média da pressão na área tributária, 4×4 pontos) */
        lt.forEach(function (t) {
          var fx = faixaX(t);
          t.nos.forEach(function (nid, k) {
            if (!nid) return;
            var fz = faixaZ(k), soma = 0, nAm = 0;
            for (var a = 0; a < 4; a++) for (var b = 0; b < 4; b++) {
              var x = fx[0] + (a + 0.5) / 4 * (fx[1] - fx[0]), z = fz[0] + (b + 0.5) / 4 * (fz[1] - fz[0]);
              soma += num(vento.pressao(vc.id, "cobertura", x, z), 0); nAm++;
            }
            var p = soma / nAm, area = (fx[1] - fx[0]) / L.co * (fz[1] - fz[0]);
            /* normal externa da água: esquerda (x < vão/2) = (−sinθ, cosθ); direita = (sinθ, cosθ); uma água = (−sinθ, cosθ) */
            var esq = L.aguas === 1 || t.x < L.vao / 2 - 1e-6, meio = L.aguas === 2 && Math.abs(t.x - L.vao / 2) < 1e-6;
            var s = Math.sin(L.th), c = Math.cos(L.th), n = meio ? [0, 1, 0] : (esq ? [-s, c, 0] : [s, c, 0]);
            cW.push({ tipo: "no", no: nid, F: [-p * area * n[0], -p * area * n[1], 0, 0, 0, 0] });
          });
        });
        /* atrito (NBR 6123, 6.4): força tangente à cobertura e às paredes na região além de 4h (ou 4·l1) do barlavento,
           aplicada nos nós das terças pela área em planta — o contraventamento leva às fundações */
        var at = typeof vento.atrito === "function" ? vento.atrito(vc.id) : null;
        if (at && num(at.total, 0) > 0) {
          var nosAt = [], areaAt = 0;
          lt.forEach(function (t) {
            var fx = faixaX(t);
            t.nos.forEach(function (nid, k) {
              if (!nid) return;
              var fz = faixaZ(k), s0 = at.eixo === "z" ? fz[0] : fx[0], s1 = at.eixo === "z" ? fz[1] : fx[1];
              var ov = Math.max(0, Math.min(s1, at.fim) - Math.max(s0, at.inicio)); if (ov <= 0) return;
              var ar = ov * (at.eixo === "z" ? (fx[1] - fx[0]) : (fz[1] - fz[0])); nosAt.push([nid, ar]); areaAt += ar;
            });
          });
          var sgA = /[−-]/.test(String(at.sentido)) ? -1 : 1;
          nosAt.forEach(function (q) { var Fa = num(at.total, 0) * q[1] / areaAt * sgA; cW.push({ tipo: "no", no: q[0], F: at.eixo === "z" ? [0, 0, Fa, 0, 0, 0] : [Fa, 0, 0, 0, 0, 0] }); });
        }
        /* paredes laterais: carga distribuída no pilar (global X), pela faixa do pórtico */
        G.membros.filter(function (m) { return m.papel === "pilar"; }).forEach(function (m) {
          var face = m.lado ? "direita" : "esquerda", f = par.fechamentos[face] || {};
          if (!f.tipo || f.tipo === "aberto") return;
          var fz = faixaZ(m.k), soma = 0; for (var b2 = 0; b2 < 6; b2++) soma += num(vento.pressao(vc.id, face, fz[0] + (b2 + 0.5) / 6 * (fz[1] - fz[0]), 0), 0);
          var p = soma / 6, w = p * (fz[1] - fz[0]) * (m.lado ? -1 : 1);
          m.segs.forEach(function (sid) { cW.push({ tipo: "barra", barra: sid, q: [w, 0, 0] }); });
        });
        /* oitões: nas colunas de tapamento (global Z) e meia faixa nos pilares de canto (no eixo fraco) */
        [["frente", 0, 1], ["fundo", L.nV, -1]].forEach(function (oi) {
          var f = par.fechamentos[oi[0]] || {}; if (!f.tipo || f.tipo === "aberto") return;
          var tapsK = G.membros.filter(function (m) { return m.papel === "tapamento" && m.k === oi[1]; }).sort(function (a, b) { return 0; });
          var xsCol = [0].concat((oi[1] === 0 ? L.tapF : L.tapB)).concat([L.vao]);
          xsCol.forEach(function (xc, q) {
            var xa = q ? (xsCol[q - 1] + xc) / 2 : 0, xb = q < xsCol.length - 1 ? (xc + xsCol[q + 1]) / 2 : L.vao, soma = 0;
            for (var a2 = 0; a2 < 6; a2++) soma += num(vento.pressao(vc.id, oi[0], xa + (a2 + 0.5) / 6 * (xb - xa), 0), 0);
            var w = soma / 6 * (xb - xa) * oi[2];
            if (q === 0 || q === xsCol.length - 1) {
              var pil = G.membros.filter(function (m) { return m.papel === "pilar" && m.k === oi[1] && m.lado === (q ? 1 : 0); })[0];
              if (pil) pil.segs.forEach(function (sid) { cW.push({ tipo: "barra", barra: sid, q: [0, 0, w] }); });
            } else {
              var tp = tapsK[q - 1]; if (tp) tp.segs.forEach(function (sid) { cW.push({ tipo: "barra", barra: sid, q: [0, 0, w] }); });
            }
          });
        });
        casos.push({ id: vc.id, tipo: "W", nome: vc.nome || vc.id, direcao: vc.direcao, cargas: cW });
      });
    }
    mod.casos = casos;
    return casos;
  }

  var AcoModelo = { PADRAO: PADRAO, galpao: galpao, cargas: cargas, secaoDe: secaoDe, barraRedonda: barraRedonda, layout: layout, yTelhado: yTelhado };
  global.AcoModelo = AcoModelo;
  if (typeof module !== "undefined" && module.exports) module.exports = AcoModelo;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
