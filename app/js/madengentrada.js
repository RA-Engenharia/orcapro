/* =====================================================================
 * madengentrada.js — ENTRADA da tela "Estruturas de madeira" → entrada dos motores (motor PURO, ES5, sem DOM, Node-testável).
 * A tela guarda um ESTADO simples (números e textos que a pessoa digitou, salvo na obra); este arquivo traduz o estado numa opção
 * (A, B ou C) para o maddimensionar2 / madtipologias:
 *   estado → toProj(estado, opcao) = { proj (maddimensionar2), partida (seções iniciais), t7 (madtipologias.T7), terreno, extras, ... }
 * Também: leitura das listas digitadas (retângulos, pontos), contorno ortogonal → retângulos, validação do que falta, o EXEMPLO Casa Mar
 * (a regressão do módulo — mesmos números do tools/lib-casamar.js) e a migração versionada do estado salvo.
 * Convenção de coordenadas: a da obra (X, Y na planta; Z cota). O pilar 1 fica em (p1x, p1y).
 * ===================================================================== */
(function (global) {
  "use strict";

  var VERSAO = 1;
  function num(v, d) { if (v == null || v === "") return d; var n = Number(String(v).replace(/\s/g, "").replace(",", ".")); return isFinite(n) ? n : d; }
  function r(x, n) { var p = Math.pow(10, n == null ? 4 : n); return Math.round(x * p) / p; }
  function copia(x) { return JSON.parse(JSON.stringify(x)); }
  function mescla(base, o) { var q = copia(base), k; for (k in (o || {})) q[k] = (q[k] && typeof q[k] === "object" && !Array.isArray(q[k]) && o[k] && typeof o[k] === "object") ? mescla(q[k], o[k]) : o[k]; return q; }

  /* ------------------------------------------------------------ listas digitadas */
  /** "x0 x1 y0 y1" por linha (separador: espaço ou ;  decimal: ponto ou vírgula) → [[n…]] */
  function lerLista(txt, colunas) {
    var out = [];
    String(txt == null ? "" : txt).split(/\n+/).forEach(function (ln) {
      ln = ln.replace(/#.*$/, "").trim(); if (!ln) return;
      var c = ln.replace(/,/g, ".").split(/[\s;]+/).map(Number);
      if (c.some(function (v) { return !isFinite(v); })) return;
      if (colunas && c.length < colunas) return;
      out.push(c);
    });
    return out;
  }
  /** contorno ORTOGONAL (lados a 0°/90°) → retângulos [x0,x1,y0,y1] por faixas horizontais. Contorno inclinado: devolve erro objetivo. */
  function contornoParaRetangulos(pts) {
    if (!pts || pts.length < 4) return { ok: false, erro: "O contorno precisa de ao menos 4 pontos." };
    var n = pts.length, i;
    for (i = 0; i < n; i++) {
      var a = pts[i], b = pts[(i + 1) % n];
      if (Math.abs(a[0] - b[0]) > 1e-6 && Math.abs(a[1] - b[1]) > 1e-6) return { ok: false, erro: "O lado " + (i + 1) + " é inclinado. O deck aceita contorno com lados a 0° e 90° (retângulo ou em L/T/U); divida o deck em retângulos para um contorno inclinado." };
    }
    var ys = pts.map(function (p) { return r(p[1], 4); }).filter(function (v, k, a2) { return a2.indexOf(v) === k; }).sort(function (a, b) { return a - b; }), rects = [];
    for (i = 0; i + 1 < ys.length; i++) {
      var ym = (ys[i] + ys[i + 1]) / 2, xs = [];
      for (var k = 0; k < n; k++) { var p0 = pts[k], p1 = pts[(k + 1) % n]; if (Math.abs(p0[0] - p1[0]) < 1e-6 && ym > Math.min(p0[1], p1[1]) && ym < Math.max(p0[1], p1[1])) xs.push(p0[0]); }
      xs.sort(function (a, b) { return a - b; });
      for (k = 0; k + 1 < xs.length; k += 2) rects.push([r(xs[k], 4), r(xs[k + 1], 4), ys[i], ys[i + 1]]);
    }
    /* junta faixas vizinhas com o mesmo x */
    var junto = [];
    rects.forEach(function (q) { var t = junto.filter(function (u) { return Math.abs(u[0] - q[0]) < 1e-6 && Math.abs(u[1] - q[1]) < 1e-6 && Math.abs(u[3] - q[2]) < 1e-6; })[0]; if (t) t[3] = q[3]; else junto.push(q.slice()); });
    return { ok: true, rects: junto };
  }
  /** função de cota do terreno: constante ou vizinho mais próximo dos pontos "x y cota" */
  function terrenoFn(est) {
    var pts = lerLista(est.t7 && est.t7.terrenoPts, 3), c = num(est.t7 && est.t7.terrenoConst, 0);
    if (!pts.length) return function () { return c; };
    return function (x, y) { var best = c, dmin = 1e9; pts.forEach(function (q) { var d = Math.sqrt(Math.pow(q[0] - x, 2) + Math.pow(q[1] - y, 2)); if (d < dmin) { dmin = d; best = q[2]; } }); return best; };
  }

  /* ------------------------------------------------------------ estado padrão */
  var OPCAO_PADRAO = function (id, nome, forma) {
    return { id: id, nome: nome, classe: "mlc:GL24h", pilar: forma === "circular" ? { forma: "circular", d: 0.32 } : forma === "duplo" ? { forma: "duplo", b: 0.14, h: 0.44 } : { forma: "quadrado", b: 0.28, h: 0.28 },
      T: { b: 0.12, h: 0.36 }, V: { b: 0.26 }, VG: { b: 0.16, h: 0.36 }, limites: { T: { hMax: 0.36, bMax: 0.24 }, V: { bMax: 0.28 }, VG: { hMax: 0.48 } },
      t2: { sistema: "", pilarB: 0.28 },
      base: forma === "duplo" ? "garfo" : "oculta", krBaseManual: "", deckVigaB: "", deckPilarete: forma === "circular" ? { forma: "circ", d: 0.16 } : { forma: "ret", b: 0.14 },
      materiais: { casa: "MLC GL24h aplainada", deck: "MLC GL24h tratada (autoclave)", pilaresDeck: "Eucalipto roliço autoclavado", telha: "Telha termoacústica PIR 30 mm", forro: "Lambri de pinus tratado 25 mm" } };
  };
  function estadoPadrao() {
    var op = [OPCAO_PADRAO("A", "Pilar quadrado, base em cruz oculta", "quadrado"), OPCAO_PADRAO("B", "Pilar duplo, base em garfo aparente", "duplo"), OPCAO_PADRAO("C", "Pilar circular, base em cruz", "circular")];
    op[1].t2.pilarB = 0.32; op[2].t2.sistema = "outro";
    return {
      v: VERSAO,
      obra: { nome: "", local: "", lat: null, lon: null, v0: null, s1tipo: "plano", s1: 1.0, categoria: "II", grupoS3: 2, umidade: 3, usoCat: 4,
        faces: { frente: { fechada: true, vedacao: "misto" }, fundo: { fechada: true, vedacao: "misto" }, esquerda: { fechada: true, vedacao: "misto" }, direita: { fechada: true, vedacao: "misto" } }, ventoH: null, ventoHCumeeira: null },
      tip: "T1",
      t1: { p1x: 0, p1y: 0, vao: 6, comp: 6, cotaPiso: 0, peDireito: 2.4, altDisp: 0.7, incl: 4.8, beiral: { esq: 1.0, dir: 1.0, frente: 1.0, fundo: 1.0 }, afast: { esq: 0.18, dir: 0.18, frente: 0.2, fundo: 0.2 },
        vAltVar: true, hPonta: 0.30, hPontaMax: null, lambri: 0.025, sTerca: 0.95, hParedeTopo: null, telhaPeso: 0.12, lambriPeso: 6.0 },
      t2: { vao: 8, comp: 12, peDireito: 3.0, incl: 30, cotaPiso: 0, beiral: { esq: 0.8, dir: 0.8, frente: 0.8, fundo: 0.8 }, sistema: "tesoura", sTes: 4.0, sCaibro: 1.0, vMaxCumeeira: 4.0, sTercaMax: 1.4,
        telhaPeso: 0.55, telhaDescricao: "telha cerâmica com ripas", assento: "deslizante", vergasVidro: false },
      t7: { ativo: false, terrenoConst: 0, terrenoPts: "", decks: [], escada: null, escadaMat: "", guardaCorpo: "" },
      deck: { guardaCorpo: { regiao: "", h: "1.10" }, cargas: { sobrecarga: "2.5" }, lateral: { vento: "", topoTravado: false }, estab: "" },
      opcoes: op,
      ativa: "A",
      extras: { porta138: 0, porta108: 0, portao: 0, ripado: 0, condutoresM: 8, diariasMunck: 4, prazoSemanas: 8 },
      precos: {}, bdi: 0.2624, passo: { largura: 0.02, altura: 0.04 }, limVao: 300, limBalanco: 150
    };
  }
  function deckSuperiorPadrao() { return { id: "DS", nome: "Deck superior", modo: "mascara", contorno: "", rects: "", recortes: "", linhasExtras: "", cota: 3.0, tabua: 0.021, barrote: { b: 0.06, h: 0.16, passo: 0.50 }, viga: { b: 0.12, h: 0.24, espacamento: 2.0 } }; }
  /** E4 r11 (R34): pilar ALTO (> 3 m) do deck retangular = CONTRAVENTAMENTO EM X entre pilares (padrão: diagonais de MLC; opção: tirantes inox com esticador; "nenhum" é aceito mas o auditor BLOQUEIA). Pilar baixo: sem contraventamento no deck retangular. */
  function contravDeck(d) {
    var hP = num(d.cota, 0) - num(d.tabua, 0.021) - num(d.barrote && d.barrote.h, 0.2) - num(d.vigaH, 0.48) - num(d.zBase, 0), t = d.contrav || "auto";
    if (t === "auto") t = hP > 3.0 ? "madeira" : "nenhum";
    if (t === "nenhum") return {};
    return t === "tirante" ? { contraventamento: { tipo: "tirante" }, cv: { d: 0.016 } } : { contraventamento: { tipo: "madeira" }, cv: { b: 0.12, h: 0.20 } };
  }
  function ext2(a, b) { Object.keys(b || {}).forEach(function (k) { a[k] = b[k]; }); return a; }
  function deckRetanguloPadrao() { return { id: "DI", nome: "Deck inferior", modo: "retangulo", x0: 0, x1: 4, y0: 0, y1: 3, cota: 1.5, tabua: 0.021, vigasYs: "0.15 2.85", vigaB: 0.20, vigaH: 0.48, barrote: { b: 0.06, h: 0.20, passo: 0.50, inicio: 0.15 }, pilares: "", pilarD: 0.30, zBase: 0 }; }

  /** migração versionada do estado salvo: nunca apaga o que a pessoa digitou */
  function migrar(salvo) {
    var p = estadoPadrao();
    if (!salvo || typeof salvo !== "object") return p;
    var e = mescla(p, salvo);
    if (!Array.isArray(salvo.opcoes) || !salvo.opcoes.length) e.opcoes = p.opcoes;
    else e.opcoes = salvo.opcoes.map(function (o, i) { return mescla(p.opcoes[i] || p.opcoes[0], o); });
    if (!e.opcoes.some(function (o) { return o.id === e.ativa; })) e.ativa = e.opcoes[0].id;
    e.v = VERSAO; return e;
  }

  /* ------------------------------------------------------------ estado → motores */
  function opcaoDe(est, id) { var o = est.opcoes.filter(function (x) { return x.id === (id || est.ativa); })[0]; return o || est.opcoes[0]; }

  function t1Params(est) {
    var t = est.t1, X0 = num(t.p1x, 0), Y0 = num(t.p1y, 0), vao = num(t.vao, 0), comp = num(t.comp, 0), be = t.beiral, af = t.afast;
    var PX = [r(X0, 4), r(X0 + vao, 4)], PY = [r(Y0, 4), r(Y0 + comp, 4)], baseZ = num(t.cotaPiso, 0), vidroTopo = r(baseZ + num(t.peDireito, 2.4), 4);
    return {
      nome: est.obra.nome || "Estrutura de madeira", origem: { x: PX[0], y: PY[0] }, pilares: { x: PX, y: PY },
      teto: { x0: r(PX[0] - num(be.esq, 0), 3), x1: r(PX[1] + num(be.dir, 0), 3), y0: r(PY[0] - num(be.frente, 0), 3), y1: r(PY[1] + num(be.fundo, 0), 3) },
      parede: { x0: r(PX[0] - num(af.esq, 0), 3), x1: r(PX[1] + num(af.dir, 0), 3), y0: r(PY[0] - num(af.frente, 0), 3), y1: r(PY[1] + num(af.fundo, 0), 3) },
      baseZ: baseZ, vidroTopo: vidroTopo, zTelhaRef: r(vidroTopo + num(t.altDisp, 0.7), 4), yRef: PY[1],
      cobertura: { incl: r(num(t.incl, 4.8) / 100, 5), lambri: num(t.lambri, 0.025), sTercaMax: num(t.sTerca, 0.95), hMinV: 0.30, hPonta: t.vAltVar === false ? 99 : num(t.hPonta, 0.30), hPontaMax: t.vAltVar === false ? 99 : (t.hPontaMax != null && t.hPontaMax !== "" ? Math.max(num(t.hPontaMax, 0.30), num(t.hPonta, 0.30)) : num(t.hPonta, 0.30)), escOff: 0.55, nEsc: 2 },
      hParedeTopo: t.hParedeTopo != null && t.hParedeTopo !== "" ? num(t.hParedeTopo, 1.9) : r(Math.round((num(t.peDireito, 2.4) / 2 + 0.74) * 10) / 10, 1)
    };
  }
  function ventoEntrada(est, params) {
    var ob = est.obra, P = params.parede, incl = params.cobertura.incl, ladoZ = function (y) { return params.zTelhaRef + incl * (params.yRef - y) - params.baseZ; };
    var h = ob.ventoH != null && ob.ventoH !== "" ? num(ob.ventoH, 3) : r(Math.max(ladoZ(params.pilares.y[1]), 2.4), 1);
    var hc = ob.ventoHCumeeira != null && ob.ventoHCumeeira !== "" ? num(ob.ventoHCumeeira, h + 0.4) : r(h + 0.4, 1);
    return { local: { lat: num(ob.lat, null), lon: num(ob.lon, null), descricao: ob.local || "" }, s1: { tipo: ob.s1tipo === "plano" ? "plano" : ob.s1tipo, valor: num(ob.s1, 1) }, categoria: ob.categoria, grupoS3: num(ob.grupoS3, 2),
      geometria: { a: r(P.x1 - P.x0, 3), b: r(P.y1 - P.y0, 3), h: h, hCumeeira: hc, inclinacaoGraus: Math.atan(incl) * 180 / Math.PI, cobertura: "uma-agua", ladoAlto: "esquerda", nervuras: "retangulares" },
      faces: copia(ob.faces) };
  }
  function secoesPartida(o) {
    var P = o.pilar.forma === "circular" ? { forma: "circular", d: num(o.pilar.d, 0.3) } : o.pilar.forma === "duplo" ? { forma: "duplo", b: num(o.pilar.b, 0.14), h: num(o.pilar.h, 0.44) }
      : { forma: "quadrado", b: num(o.pilar.b, 0.28), h: num(o.pilar.b, 0.28) };
    if (o.pilar.forma === "retangular") P = { forma: "retangular", b: num(o.pilar.b, 0.2), h: num(o.pilar.h, 0.3) };
    return { T: { b: num(o.T.b, 0.12), h: num(o.T.h, 0.36) }, V: { b: num(o.V.b, 0.26) }, VG: { b: num(o.VG.b, 0.16), h: num(o.VG.h, 0.36) }, P: P };
  }
  function t7Params(est, o) {
    var t7 = est.t7; if (!t7 || !t7.ativo) return null;
    var terr = terrenoFn(est), erros = [], decks = [];
    (t7.decks || []).forEach(function (d) {
      if (d.modo === "retangulo") {
        var pil = lerLista(d.pilares, 2);
        if (!pil.length) erros.push(d.nome + ": informe os pilares (um por linha: x y).");
        decks.push({ id: d.id, nome: d.nome, modo: "retangulo", x0: num(d.x0, 0), x1: num(d.x1, 0), y0: num(d.y0, 0), y1: num(d.y1, 0), cota: num(d.cota, 0), tabua: num(d.tabua, 0.021),
          vigas: { ys: lerLista(d.vigasYs, 1).reduce(function (a, l) { return a.concat(l); }, []), b: num(d.vigaB, 0.2), h: num(d.vigaH, 0.48) }, barrote: { b: num(d.barrote.b, 0.06), h: num(d.barrote.h, 0.2), passo: num(d.barrote.passo, 0.5), inicio: num(d.barrote.inicio, 0.15) },
          pilares: pil.map(function (q) { return [q[0], q[1]]; }), pilar: ext2({ d: num(d.pilarD, 0.3), zBase: num(d.zBase, 0), engastado: true,
            material: "Eucalipto roliço autoclavado CCA, categoria de uso 5 (água salgada — NBR 16143)", especificacao: "eucalipto roliço autoclavado Ø" + Math.round(num(d.pilarD, 0.3) * 100) + " cm, categoria 5 (água salgada), topo com chapéu de proteção" }, contravDeck(d)) });
      } else {
        var rects = lerLista(d.rects, 4).map(function (q) { return [q[0], q[1], q[2], q[3]]; });
        if (!rects.length && String(d.contorno || "").trim()) {
          var cr = contornoParaRetangulos(lerLista(d.contorno, 2)); if (!cr.ok) erros.push(d.nome + ": " + cr.erro); else rects = cr.rects;
        }
        if (!rects.length) erros.push(d.nome + ": informe o contorno (pontos x y) ou os retângulos (x0 x1 y0 y1).");
        var rec = lerLista(d.recortes, 4).map(function (q) { return [q[0], q[1], q[2], q[3]]; });
        decks.push({ id: d.id, nome: d.nome, modo: "mascara", rects: rects, recortes: rec, linhasExtras: lerLista(d.linhasExtras, 1).reduce(function (a, l) { return a.concat(l); }, []),
          areaRecortes: rec.reduce(function (s, q) { return s + (q[1] - q[0]) * (q[3] - q[2]); }, 0), cota: num(d.cota, 0), tabua: num(d.tabua, 0.021), terreno: terr, muretaSeAbaixoDoTerreno: !!terr && !d.semMureta,      /* E4 r10 (R35): com terreno informado, viga com a face inferior a menos de 15 cm do terreno vai para mureta da fundação */
          barrote: { b: num(d.barrote.b, 0.06), h: num(d.barrote.h, 0.16), passo: num(d.barrote.passo, 0.5) }, viga: { b: num(o.deckVigaB, 0) > 0 ? num(o.deckVigaB, 0) : num(d.viga.b, 0.12), h: num(d.viga.h, 0.24), espacamento: num(d.viga.espacamento, 2) },
          pilarete: o.deckPilarete.forma === "circ" ? { forma: "circ", d: num(o.deckPilarete.d, 0.16) } : { forma: "ret", b: num(o.deckPilarete.b, 0.14) }, baseTipo: o.base === "garfo" ? "garfo" : "oculta" });
      }
    });
    var p = { decks: decks, guardaCorpo: [], erros: erros };
    /* E4 r8: a escada tem campo PRÓPRIO — "madeira" (longarinas), "outro" (concreto/alvenaria: só os degraus de cumaru entram) ou "nenhuma"; sem a escolha (estado antigo) deduz como antes */
    var matE = t7.escadaMat || (t7.escada ? (lerLista(t7.escada.xs, 1).length ? "madeira" : "outro") : "nenhuma");
    if (t7.escada && matE !== "nenhuma") {
      var e = t7.escada, xs = lerLista(e.xs, 1).reduce(function (a, l) { return a.concat(l); }, []);
      if (matE === "madeira" && !xs.length) erros.push("Escada de madeira: informe o X das longarinas (ou escolha \"outro material\" / \"nenhuma\").");
      p.escada = { longarinas: matE !== "madeira" || !xs.length ? null : { xs: xs, y0: num(e.y0, 0), y1: num(e.y1, 0), z0: num(e.z0, 0), z1: num(e.z1, 0), b: num(e.b, 0.06), h: num(e.h, 0.28) }, degraus: Math.round(num(e.degraus, 0)), material: matE, vao: { y0: num(e.y0, 0), y1: num(e.y1, 0), z0: num(e.z0, 0), z1: num(e.z1, 0) } };
    }
    /* E4 r12: o trecho de guarda-corpo é do DECK que o texto nomeia ("deck inferior frente; 6,54" → DI). Sem o deck, o motor (maddeck.gcDoDeck) aplicava TODOS os trechos a TODOS os decks: o pilar do deck inferior levava o guarda-corpo de 13,12 m do deck superior (η 0,54 e 8×M12 em vez de 0,43 e 6×M12). Texto que não nomeia deck algum continua valendo para todos (a favor da segurança) */
    function semAcento(x) { return String(x || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim(); }
    String(t7.guardaCorpo || "").split(/\n+/).forEach(function (ln) {
      var m = /^(.*?)[;|]\s*([\d.,]+)\s*$/.exec(ln.trim()); if (!m) return;
      var onde = m[1].trim(), g = { onde: onde, L: num(m[2], 0) }, no = semAcento(onde), alvo = decks.filter(function (d) { var nm = semAcento(d.nome); return nm && no.indexOf(nm) === 0; });
      if (alvo.length === 1) g.deck = alvo[0].id;
      p.guardaCorpo.push(g);
    });
    return p;
  }

  /* ------------------------------------------------------------ T2 (casa/pavilhão de duas águas): o estado da tela → entrada do maddimensionar2.projetarT2 */
  function sistemaT2(est, o) {
    var base = est.t2.sistema === "cumeeira" ? "cumeeira" : "tesoura", s = o && o.t2 && o.t2.sistema;
    if (s === "outro") return base === "tesoura" ? "cumeeira" : "tesoura";
    return s === "tesoura" || s === "cumeeira" ? s : base;
  }
  function t2Params(est, o) {
    var t = est.t2, be = t.beiral || {}, sis = sistemaT2(est, o);
    return { nome: est.obra.nome || "Casa de duas águas", a: num(t.comp, 12), b: num(t.vao, 8), peDireito: num(t.peDireito, 3), baseZ: num(t.cotaPiso, 0), incl: r(num(t.incl, 30) / 100, 5),
      beiral: { frente: num(be.frente, 0.8), fundo: num(be.fundo, 0.8), esq: num(be.esq, 0.8), dir: num(be.dir, 0.8) }, sistema: sis, vMaxPilar: num(t.vMaxCumeeira, 4),
      telha: { peso: num(t.telhaPeso, 0.55), descricao: t.telhaDescricao || "telha com ripas" }, cobertura: { sTercaMax: num(t.sTercaMax, 1.4) }, tesoura: { sTes: num(t.sTes, 4) },
      cumeeira: { sCaibro: num(t.sCaibro, 1), pilaresIntermediarios: null, assento: t.assento === "fixo" ? "fixo" : "deslizante", tirante: false }, vergas: null };
  }
  function secoesPartidaT2(est, o, sis) {
    var b = Math.max(0.16, num(o.t2 && o.t2.pilarB, 0.2)), P = { forma: "quadrado", b: b, h: b };
    function c(x) { return JSON.parse(JSON.stringify(x)); }
    if (sis === "tesoura") return { P: c(P), PO: c(P), PC: c(P), FR: { b: 0.12, h: 0.24 }, BS: { b: 0.10, h: 0.20 }, BI: { b: 0.10, h: 0.20 }, PD: { b: 0.08, h: 0.12 }, DG: { b: 0.08, h: 0.12 }, T: { b: 0.08, h: 0.20 }, CM: { b: 0.10, h: 0.24 } };
    return { P: c(P), PO: c(P), PC: c(P), FR: { b: 0.12, h: 0.24 }, CM: { b: 0.12, h: 0.30 }, CB: { b: 0.06, h: 0.20 }, TI: { d: 0.016 } };
  }
  function toProjT2(est, id) {
    var o = opcaoDe(est, id), ob = est.obra, sis = sistemaT2(est, o), params = t2Params(est, o);
    var proj = { params: params, vento: { local: { lat: num(ob.lat, null), lon: num(ob.lon, null), descricao: ob.local || "" }, s1: { tipo: ob.s1tipo === "plano" ? "plano" : ob.s1tipo, valor: num(ob.s1, 1) }, categoria: ob.categoria, grupoS3: num(ob.grupoS3, 2), faces: copia(ob.faces) },
      classe: o.classe, umidade: num(ob.umidade, 3), limVao: est.limVao, limBalanco: est.limBalanco, krBase: num(o.krBaseManual, 0) > 0 ? num(o.krBaseManual, 0) : undefined, opcao: o.id, pesoMLC: 5.0 };
    var oT2 = copia(o); oT2.nome = "Pilar " + Math.round(num(o.t2 && o.t2.pilarB, 0.28) * 100) + " cm, " + (sis === "tesoura" ? "tesouras" : "cumeeira portante") + ", " + String(o.classe || "").replace("mlc:", "");
    return { proj: proj, partida: secoesPartidaT2(est, o, sis), t7: null, opcao: oT2, extras: copia(est.extras), nome: ob.nome, t2: true, sistema: sis };
  }

  /** a opção `id` do estado → tudo que o worker e as saídas precisam (serializável: o terreno vai como função só dentro do t7, que o worker refaz) */
  function toProj(est, id) {
    if (est.tip === "T2") return toProjT2(est, id);
    var o = opcaoDe(est, id), params = t1Params(est);
    var proj = { params: params, vento: ventoEntrada(est, params), classe: o.classe, umidade: num(est.obra.umidade, 3), limVao: est.limVao, limBalanco: est.limBalanco, krBase: num(o.krBaseManual, 0) > 0 ? num(o.krBaseManual, 0) : undefined,
      limites: copia(o.limites), passo: copia(est.passo), cargas: { telha: num(est.t1.telhaPeso, 0.12), lambriPeso: num(est.t1.lambriPeso, 6), outros: 0.03 }, opcao: o.id, pesoMLC: 5.0 };
    return { proj: proj, partida: secoesPartida(o), t7: t7Params(est, o), opcao: o, extras: copia(est.extras), nome: est.obra.nome };
  }

  /** o que falta para calcular (mensagens objetivas, na ordem dos passos) */
  function validar(est) {
    var f = [], t = est.t1, ob = est.obra;
    var so7 = est.tip === "T7";
    if (est.tip === "T2") {
      var u = est.t2;
      if (ob.lat == null || ob.lon == null) f.push({ passo: 1, texto: "Informe a cidade da obra (ou as coordenadas) para achar o V0." });
      if (!(num(u.vao, 0) > 1) || !(num(u.comp, 0) > 1)) f.push({ passo: 2, texto: "Informe o vão (largura) e o comprimento da casa." });
      else if (num(u.comp, 0) < num(u.vao, 0)) f.push({ passo: 2, texto: "A cumeeira corre pela maior dimensão: o comprimento deve ser maior ou igual ao vão (gire a planta)." });
      if (!(num(u.incl, 0) >= 5)) f.push({ passo: 2, texto: "Inclinação mínima de 5 % para telha." });
      if (!(num(u.peDireito, 0) > 1)) f.push({ passo: 2, texto: "Informe o pé-direito." });
      if (!(num(u.telhaPeso, 0) > 0)) f.push({ passo: 2, texto: "Informe o peso da telha (kN/m²)." });
      if (!est.opcoes.some(function (o) { return o.id === est.ativa; })) f.push({ passo: 3, texto: "Escolha a opção." });
      return { ok: f.length === 0, falta: f };
    }
    if (!so7 && (ob.lat == null || ob.lon == null)) f.push({ passo: 1, texto: "Informe a cidade da obra (ou as coordenadas) para achar o V0." });
    if (so7 && (ob.lat == null || ob.lon == null) && !(num(est.deck && est.deck.lateral && est.deck.lateral.vento, 0) > 0)) f.push({ passo: 1, texto: "Informe a cidade da obra (ou as coordenadas): o vento do deck (NBR 6123) sai do V0 do local." });
    if (!so7 && (!(num(t.vao, 0) > 1) || !(num(t.comp, 0) > 1))) f.push({ passo: 2, texto: "Informe o vão e o comprimento da cobertura." });
    if (!so7 && !(num(t.incl, 0) >= 0)) f.push({ passo: 2, texto: "A inclinação não pode ser negativa." });
    if (!so7 && !(num(t.peDireito, 0) > 1)) f.push({ passo: 2, texto: "Informe o pé-direito." });
    if (est.tip === "T7" && !(est.t7 && est.t7.decks && est.t7.decks.length)) f.push({ passo: 2, texto: "Acrescente ao menos um deck." });
    var op = est.opcoes.filter(function (o) { return o.id === est.ativa; })[0];
    if (!op) f.push({ passo: 3, texto: "Escolha a opção." });
    try { var tp = toProj(est, est.ativa); (tp.t7 && tp.t7.erros || []).forEach(function (m) { f.push({ passo: 2, texto: m }); }); } catch (e) { f.push({ passo: 2, texto: "Parâmetros da cobertura: " + e.message }); }
    return { ok: f.length === 0, falta: f };
  }

  /* ------------------------------------------------------------ exemplo: Casa Mar (regressão do módulo) */
  var CASAMAR_TERRENO = "117.0 92.0 5.495234000000001\n117.0 93.0 5.495234000000001\n117.0 94.0 5.495234000000001\n117.0 95.0 5.495234000000001\n117.0 96.0 5.495234000000001\n117.0 97.0 5.495234000000001\n117.0 98.0 5.59103110428218\n117.0 99.0 5.669624854369466\n117.0 100.0 5.748218604456751\n117.0 101.0 5.895051463490136\n117.0 102.0 6.147968348130082\n117.0 103.0 6.50370752561731\n117.0 104.0 7.020382383594717\n117.0 105.0 7.555002033992034\n117.0 106.0 8.12328498464894\n117.0 107.0 8.505780134260066\n117.0 108.0 8.630186213120135\n117.0 109.0 8.719907371775099\n117.0 110.0 8.855843774438245\n117.0 111.0 8.999280251358467\n117.0 112.0 9.160981029829449\n118.0 92.0 5.495234000000001\n118.0 93.0 5.495234000000001\n118.0 94.0 5.495234000000001\n118.0 95.0 5.495234000000001\n118.0 96.0 5.495234000000001\n118.0 97.0 5.558426156324078\n118.0 98.0 5.712757750873379\n118.0 99.0 5.8365027862856715\n118.0 100.0 5.915096536372957\n118.0 101.0 6.060570224150058\n118.0 102.0 6.313487108790005\n118.0 103.0 6.495234000000001\n118.0 104.0 6.781750139065652\n118.0 105.0 7.324238894776245\n118.0 106.0 7.8392135547094215\n118.0 107.0 8.241092744999948\n118.0 108.0 8.160147820643248\n118.0 109.0 8.647560380418327\n118.0 110.0 8.721593668756928\n118.0 111.0 8.836603619230837\n118.0 112.0 8.952433845964434\n119.0 92.0 5.495234000000001\n119.0 93.0 5.495234000000001\n119.0 94.0 5.495234000000001\n119.0 95.0 5.495234000000001\n119.0 96.0 5.601009123039098\n119.0 97.0 5.779707687815723\n119.0 98.0 5.872452300705881\n119.0 99.0 5.985607471157828\n119.0 100.0 6.081974468289163\n119.0 101.0 6.226088984809981\n119.0 102.0 6.479005869449928\n119.0 103.0 6.495234000000001\n119.0 104.0 6.542172862309344\n119.0 105.0 7.088193776465098\n119.0 106.0 7.423647108780038\n119.0 107.0 7.710927520116412\n119.0 108.0 7.673035428218864\n119.0 109.0 7.462620904874504\n119.0 110.0 8.502336257645966\n119.0 111.0 8.651254766051776\n119.0 112.0 8.82914321764087\n120.0 92.0 5.443591205560949\n120.0 93.0 5.495234000000001\n120.0 94.0 5.495234000000001\n120.0 95.0 5.619563657933861\n120.0 96.0 5.824554416523425\n120.0 97.0 6.01659144161513\n120.0 98.0 6.0864102772690485\n120.0 99.0 6.149382264116662\n120.0 100.0 6.248852400205369\n120.0 101.0 6.391607745469904\n120.0 102.0 6.495234000000001\n120.0 103.0 6.495234000000001\n120.0 104.0 6.495234000000001\n120.0 105.0 6.767032656159177\n120.0 106.0 7.027228248445783\n120.0 107.0 7.287033995808028\n120.0 108.0 7.610434904273617\n120.0 109.0 7.99147324647026\n120.0 110.0 8.263399476517664\n120.0 111.0 8.509902854625928\n120.0 112.0 8.676620615089968\n121.0 92.0 5.348514510766438\n121.0 93.0 5.47328409644182\n121.0 94.0 5.521310300533808\n121.0 95.0 5.843108951418186\n121.0 96.0 6.04809971000775\n121.0 97.0 6.2512706127180815\n121.0 98.0 6.323622549392081\n121.0 99.0 6.366620149206331\n121.0 100.0 6.4219837921910905\n121.0 101.0 6.495234000000001\n121.0 102.0 6.517797425754452\n121.0 103.0 6.552761567822424\n121.0 104.0 6.605942283194491\n121.0 105.0 6.743537347361215\n121.0 106.0 6.988549324186319\n121.0 107.0 7.233561301011421\n121.0 108.0 7.375234000000001\n121.0 109.0 7.604959845111511\n121.0 110.0 7.874527283604571\n121.0 111.0 8.182475890826288\n121.0 112.0 8.523975862365031\n122.0 92.0 5.3413991046541645\n122.0 93.0 5.408584983775856\n122.0 94.0 5.495234000000001\n122.0 95.0 5.8179628406135135\n122.0 96.0 6.167056279649516\n122.0 97.0 6.474827313060365\n122.0 98.0 6.495234000000001\n122.0 99.0 6.495234000000001\n122.0 100.0 6.558014837417883\n122.0 101.0 6.6068654916962375\n122.0 102.0 6.637561851290631\n122.0 103.0 6.670304174774208\n122.0 104.0 6.739375328285646\n122.0 105.0 6.790783293223506\n122.0 106.0 7.006236458972259\n122.0 107.0 7.251248435797361\n122.0 108.0 7.375234000000001\n122.0 109.0 7.375234000000001\n122.0 110.0 7.457257046467734\n122.0 111.0 7.864945827519082\n122.0 112.0 8.331657373048202\n123.0 92.0 5.346717742093755\n123.0 93.0 5.413903621215446\n123.0 94.0 5.481089500337137\n123.0 95.0 5.608072385329032\n123.0 96.0 5.9873504436395235\n123.0 97.0 6.433894418125217\n123.0 98.0 6.495234000000001\n123.0 99.0 6.554153070984177\n123.0 100.0 6.652663814332692\n123.0 101.0 6.726202149929082\n123.0 102.0 6.758662155023026\n123.0 103.0 6.790051138793525\n123.0 104.0 6.850642360203864\n123.0 105.0 6.925989088748866\n123.0 106.0 7.0239235937582\n123.0 107.0 7.268935570583302\n123.0 108.0 7.375234000000001\n123.0 109.0 7.395374982218022\n123.0 110.0 7.505463786112311\n123.0 111.0 7.831341595527992\n123.0 112.0 8.259757860872012\n124.0 92.0 5.352036379533345\n124.0 93.0 5.4192222586550365\n124.0 94.0 5.486408137776727\n124.0 95.0 5.495234000000001\n124.0 96.0 5.806077147959515\n124.0 97.0 6.332998331228542\n124.0 98.0 6.5150810847068295\n124.0 99.0 6.637498203019221\n124.0 100.0 6.747312791247502\n124.0 101.0 6.827179205784756\n124.0 102.0 6.880153639254628\n124.0 103.0 6.909326442546531\n124.0 104.0 6.961909392122083\n124.0 105.0 7.037256120667085\n124.0 106.0 7.110180069658167\n124.0 107.0 7.2866227053692425\n124.0 108.0 7.375234000000001\n124.0 109.0 7.456461350207546\n124.0 110.0 7.562436744680571\n124.0 111.0 7.827051232236715\n124.0 112.0 8.202876071477021\n125.0 92.0 5.357355016972936\n125.0 93.0 5.424540896094627\n125.0 94.0 5.491726775216318\n125.0 95.0 5.495234000000001\n125.0 96.0 5.7117373410024355\n125.0 97.0 6.258046945101241\n125.0 98.0 6.598426216741874\n125.0 99.0 6.720843335054266\n125.0 100.0 6.841961768162312\n125.0 101.0 6.928156261640429\n125.0 102.0 7.00162952534433\n125.0 103.0 7.028519493148107\n125.0 104.0 7.073176424040303\n125.0 105.0 7.148523152585304\n125.0 106.0 7.223869881130307\n125.0 107.0 7.304309840155184\n125.0 108.0 7.4115723237240445\n125.0 109.0 7.499688041053027\n125.0 110.0 7.546112535233883\n125.0 111.0 7.7842920492854395\n125.0 112.0 8.097305539976842\n126.0 92.0 5.362673654412527\n126.0 93.0 5.429859533534217\n126.0 94.0 5.495234000000001\n126.0 95.0 5.495234000000001\n126.0 96.0 5.713525610688012\n126.0 97.0 6.2538739026071175\n126.0 98.0 6.623525805841176\n126.0 99.0 6.80418846708931\n126.0 100.0 6.926605585401702\n126.0 101.0 7.029133317496103\n126.0 102.0 7.123105411434032\n126.0 103.0 7.147712543749683\n126.0 104.0 7.1844434559585215\n126.0 105.0 7.259790184503524\n126.0 106.0 7.335136913048527\n126.0 107.0 7.375234000000001\n126.0 108.0 7.375234000000001\n126.0 109.0 7.397765106179178\n126.0 110.0 7.454592906916109\n126.0 111.0 7.786961745759557\n126.0 112.0 8.070300876520943\n127.0 92.0 5.367992291852117\n127.0 93.0 5.435178170973808\n127.0 94.0 5.495234000000001\n127.0 95.0 5.495234000000001\n127.0 96.0 5.763170632724864\n127.0 97.0 6.316423171825971\n127.0 98.0 6.666508178825071\n127.0 99.0 6.883321612569678\n127.0 100.0 7.0099507174367455\n127.0 101.0 7.130110373351776\n127.0 102.0 7.244581297523733\n127.0 103.0 7.268071383750842\n127.0 104.0 7.2957104878767405\n127.0 105.0 7.357130467415246\n127.0 106.0 7.375234000000001\n127.0 107.0 7.375234000000001\n127.0 108.0 7.375234000000001\n127.0 109.0 7.400397123588198\n127.0 110.0 7.44905766370726\n127.0 111.0 7.721696282672115\n127.0 112.0 8.019172942694464\n128.0 92.0 5.396564981963428\n128.0 93.0 5.440496808413398\n128.0 94.0 5.495234000000001\n128.0 95.0 5.495234000000001\n128.0 96.0 5.863404450705954\n128.0 97.0 6.320800656012485\n128.0 98.0 6.668622286120838\n128.0 99.0 6.973356830461259\n128.0 100.0 7.011077043403997\n128.0 101.0 7.0600062201182\n128.0 102.0 7.361018996863037\n128.0 103.0 7.389997693294939\n128.0 104.0 7.410895578799643\n128.0 105.0 7.446695610598162\n128.0 106.0 7.448248613618208\n128.0 107.0 7.444307959646237\n128.0 108.0 7.433462124038283\n128.0 109.0 7.4619925224956924\n128.0 110.0 7.495234000000001\n128.0 111.0 7.522625993559924\n128.0 112.0 7.817101579661636\n129.0 92.0 5.428682883184617\n129.0 93.0 5.447380607453653\n129.0 94.0 5.495234000000001\n129.0 95.0 5.602959119990983\n129.0 96.0 6.021677236587551\n129.0 97.0 6.4260017427299765\n129.0 98.0 6.567054959151076\n129.0 99.0 6.784138570698222\n129.0 100.0 6.91179445692496\n129.0 101.0 6.968260210193483\n129.0 102.0 7.257449683529874\n129.0 103.0 7.4587511657913454\n129.0 104.0 7.49464743505389\n129.0 105.0 7.757271013641855\n129.0 106.0 7.853024017916419\n129.0 107.0 7.9009464004290395\n129.0 108.0 7.674398782855786\n129.0 109.0 7.700472034230093\n129.0 110.0 7.506277961942872\n129.0 111.0 7.495234000000001\n129.0 112.0 7.537242175351193\n130.0 92.0 5.460800784405807\n130.0 93.0 5.479498508674842\n130.0 94.0 5.5383987808984765\n130.0 95.0 5.863237370447535\n130.0 96.0 6.238872561951207\n130.0 97.0 6.695035019267076\n130.0 98.0 6.944818226762186\n130.0 99.0 6.888197650737254\n130.0 100.0 6.831577074712323\n130.0 101.0 6.9422579264150395\n130.0 102.0 7.123155727126064\n130.0 103.0 7.550529071913296\n130.0 104.0 7.75766122114977\n130.0 105.0 8.326014138445514\n130.0 106.0 8.370299084783111\n130.0 107.0 8.518811632728287\n130.0 108.0 8.520305000893094\n130.0 109.0 8.330712720253512\n130.0 110.0 8.087853575358013\n130.0 111.0 7.944253327583965\n130.0 112.0 7.703320410079165\n131.0 92.0 5.4929186856269965\n131.0 93.0 5.495234000000001\n131.0 94.0 5.6073720614809845\n131.0 95.0 5.97065573993325\n131.0 96.0 6.323015730506565\n131.0 97.0 6.842189211107301\n131.0 98.0 7.322581494373296\n131.0 99.0 7.369363184037547\n131.0 100.0 7.584862768693923\n131.0 101.0 8.016498083360473\n131.0 102.0 8.113220276829688\n131.0 103.0 8.60939666766281\n131.0 104.0 8.823581032793184\n131.0 105.0 8.848809206371254\n131.0 106.0 8.865244567532036\n131.0 107.0 9.041826774112877\n131.0 108.0 9.048967216548093\n131.0 109.0 8.797992068948941\n131.0 110.0 8.655827626193208\n131.0 111.0 8.464017828883321\n131.0 112.0 8.212203219317754\n132.0 92.0 5.495234000000001\n132.0 93.0 5.495234000000001\n132.0 94.0 5.536036480883836\n132.0 95.0 5.913655232322759\n132.0 96.0 6.31935517801043\n132.0 97.0 6.931628390026493\n132.0 98.0 7.7328283721490525\n132.0 99.0 8.055743967986913\n132.0 100.0 8.349935985255412\n132.0 101.0 8.615285889951513\n132.0 102.0 8.79342939790807\n132.0 103.0 9.030456250953959\n132.0 104.0 9.280983456218985\n132.0 105.0 9.360945391362005\n132.0 106.0 9.502015561204626\n132.0 107.0 9.583749436444549\n132.0 108.0 9.57450509117074\n132.0 109.0 9.349066606631272\n132.0 110.0 9.20412588897525\n132.0 111.0 8.985221294320949\n132.0 112.0 8.69034108434174\n133.0 92.0 5.495234000000001\n133.0 93.0 5.495234000000001\n133.0 94.0 5.674703374499776\n133.0 95.0 6.055502138677843\n133.0 96.0 6.462371663416358\n133.0 97.0 7.341535843947137\n133.0 98.0 8.305237181425273\n133.0 99.0 8.495234000000002\n133.0 100.0 8.515701885873932\n133.0 101.0 9.003283106694099\n133.0 102.0 9.250512918716407\n133.0 103.0 9.450004697229677\n133.0 104.0 9.716672540212546\n133.0 105.0 9.90068985954051\n133.0 106.0 10.040542238446688\n133.0 107.0 10.190108821850421\n133.0 108.0 10.107457682617978\n133.0 109.0 9.896884772863846\n133.0 110.0 9.72082464049213\n133.0 111.0 9.447353287014883\n133.0 112.0 9.11713369273734\n134.0 92.0 5.543565942734216\n134.0 93.0 5.751790297418783\n134.0 94.0 5.947708447275829\n134.0 95.0 6.262996194539656\n134.0 96.0 6.89682777746239\n134.0 97.0 7.8711439796200455\n134.0 98.0 8.495234000000002\n134.0 99.0 8.577312357607122\n134.0 100.0 8.814080620930968\n134.0 101.0 9.392917087550899\n134.0 102.0 9.661207151764879\n134.0 103.0 9.868772201019278\n134.0 104.0 10.144411150408725\n134.0 105.0 10.37125239715566\n134.0 106.0 10.574358936770807\n134.0 107.0 10.726788243672962\n134.0 108.0 10.65296295462787\n134.0 109.0 10.403079005068433\n134.0 110.0 10.159366619026956\n134.0 111.0 9.971391253206841\n134.0 112.0 9.612419422198451";
  function exemploCasaMar() {
    var e = estadoPadrao();
    e.obra = mescla(e.obra, { nome: "Casa Mar", local: "Balneário Camboriú/SC", lat: -26.99, lon: -48.635, s1tipo: "talude", s1: 1.15, categoria: "I", grupoS3: 2, umidade: 3, usoCat: 4, ventoH: 3.3, ventoHCumeeira: 3.7 });
    e.t1 = mescla(e.t1, { p1x: 118.947, p1y: 99.443, vao: 7.826, comp: 7.797, cotaPiso: 8.70, peDireito: 2.35, altDisp: 0.80, hPontaMax: 0.60, incl: 4.8, beiral: { esq: 1.36, dir: 2.344, frente: 1.363, fundo: 1.222 },
      afast: { esq: 0.18, dir: 0.269, frente: 0.238, fundo: 0.202 }, hParedeTopo: 1.9 });
    var ds = deckSuperiorPadrao();
    ds.rects = "123.03 124.03 97.639 112.042\n122.03 123.03 97.639 112.042\n120.03 121.03 95.789 111.909\n124.03 125.03 97.639 112.042\n125.03 126.03 97.639 112.042\n127.03 128.03 97.639 112.042\n128.03 129.03 97.639 112.042\n129.03 130.03 97.639 105.042\n130.03 131.03 97.639 105.042\n131.03 132.03 97.639 104.042\n132.03 133.03 97.639 104.042\n133.03 134.03 97.639 104.042\n126.03 127.03 97.639 112.042\n118.03 119.03 95.789 108.909\n121.03 122.03 95.789 111.909\n119.03 120.03 95.789 111.909";
    ds.recortes = "118.767 127.042 99.205 107.442\n122.0 124.6 107.442 109.30"; ds.linhasExtras = "118.687 127.122"; ds.cota = 8.481;
    var di = deckRetanguloPadrao(); di.x0 = 117.084; di.x1 = 123.622; di.y0 = 92.139; di.y1 = 95.794; di.cota = 6.602; di.vigasYs = "92.29 95.29";
    di.pilares = "117.245 92.286\n123.316 92.286\n117.245 95.286\n123.316 95.286";   /* R31 (R05.2): o 5º pilar (ao lado da escada de concreto) saiu */
    /* r13 (R05.6): cotaBaseDI = cota da BASE dos pilares do deck inferior. 0 = como o modelo da arquitetura (pilares de 5,86 m, X, Ø26, 6 × M12). O terreno do modelo ali vale 5,35–5,50 m: se o RT confirmar que o solo/rocha está a ~5,40 m, a alternativa é
       cotaBaseDI = 5.40 (pilares curtos de ~0,5 m sobre a rocha, sem X e sem vento a 7,7 m) — ver CASAMAR-R05.md, R05.6. ESTE valor segue 0 até o RT confirmar o terreno. */
    var cotaBaseDI = 0; di.zBase = cotaBaseDI;
    di.vigaH = 0.52; di.pilarD = 0.26; ds.viga.b = 0.16;   /* R29 (R05.2): viga inferior 20×52; R34 (r11): pilar de 6 m com contraventamento em X (parte de Ø26, o laço cresce até fechar); viga superior 16×24 (opções A/B) */
    e.t7 = { ativo: true, terrenoConst: 5.5, terrenoPts: CASAMAR_TERRENO, decks: [ds, di],
      escadaMat: "outro", escada: { xs: "", y0: 94.30, y1: 97.35, z0: 6.502, z1: 8.381, b: 0.06, h: 0.28, degraus: 9 },   /* R05.1: escada de concreto — sem longarinas de madeira */
      guardaCorpo: "deck inferior frente; 6.54\ndeck inferior lado esquerdo; 3.66\ndeck inferior lado direito; 2.60\ndeck superior frente (x 118–122); 4.0\ndeck superior frente (x 122–134); 10.97\ndeck superior lado esquerdo; 13.12" };
    e.deck = { guardaCorpo: { regiao: "", h: "1.10" }, cargas: { sobrecarga: "2.5" }, lateral: { vento: "", topoTravado: false }, estab: "" };          /* R32 (r8): o vento do deck NÃO é mais pressão fixa — o motor calcula q pela NBR 6123 (V0, S1, S2 na cota do topo do guarda-corpo/pilarete, categoria e S3 desta obra), Ca = 1,0 a validar pelo RT */
    e.extras = { porta138: 1, porta108: 2, portao: 1, ripado: 10.92, condutoresM: 8, diariasMunck: 4, prazoSemanas: 8, areaAndaime: 160, horasEngenheiro: 70 };
    e.opcoes[1].deckPilarete = { forma: "ret", b: 0.14 }; e.opcoes[2].deckVigaB = 0.14;      /* R28: a viga do deck superior da opção C é 14×24 — agora um CAMPO da opção (tela e lib iguais) */
    return e;
  }

  var MadEngEntrada = { VERSAO: VERSAO, estadoPadrao: estadoPadrao, migrar: migrar, toProj: toProj, validar: validar, lerLista: lerLista, contornoParaRetangulos: contornoParaRetangulos, terrenoFn: terrenoFn,
    exemploCasaMar: exemploCasaMar, deckSuperiorPadrao: deckSuperiorPadrao, deckRetanguloPadrao: deckRetanguloPadrao, opcaoPadrao: OPCAO_PADRAO, opcaoDe: opcaoDe, t1Params: t1Params, t2Params: t2Params, sistemaT2: sistemaT2, copia: copia, num: num, r: r };
  if (typeof module !== "undefined" && module.exports) module.exports = MadEngEntrada;
  else global.MadEngEntrada = MadEngEntrada;
})(typeof window !== "undefined" ? window : (typeof self !== "undefined" ? self : this));
