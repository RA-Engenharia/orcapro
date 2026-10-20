/* =====================================================================
 * arqdesenho.js — PRIMITIVAS DE DESENHO DAS PRANCHAS DE ARQUITETURA
 * (motor PURO, ES5, sem DOM). Mesmo desenho da casa (js/acopranchas.js Desenho: letra, cota em
 * cadeia, tabela, carimbo RA do js/prancha.js) mais o que a arquitetura precisa: planta com
 * paredes em poché, vãos, mobiliário, cotas externas/internas, rótulos de ambiente que procuram
 * lugar livre, marcas de corte, norte, escala gráfica e a CONFERÊNCIA DE SOBREPOSIÇÃO.
 *
 * Tudo em mm de papel (y para baixo). O mapa leva metros da cena (x, z) ao papel:
 *   var M = ArqDesenho.mapa(caixa [x0, z0, x1, z1], ox, oy, k)   k = mm de papel por metro (1:50 → 20)
 *   M.P(x, z) → [X, Y] · M.L(m) → mm
 *
 * CONFERÊNCIA (regra da RA, memória "pranchas sem sobreposição"): `conferir(D, janela)` lista
 *   · texto × texto            (caixas orientadas, folga 0,15 mm)
 *   · texto × linha de desenho (parede, vão, cota, mobiliário, divisa, telhado, corte, nível…) — hachura,
 *                              paginação, tabela e a linha-guia do próprio rótulo não contam
 *   · texto fora da janela     (texto cortado pela moldura)
 * Teste: tools/ (pranchas de arquitetura)
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) { /* ausente */ } }
    return null;
  }
  function AP() { return dep("AcoPranchas", "./acopranchas.js"); }
  function GEO() { return dep("ArqGeo", "./arqgeo.js"); }
  function D2() { return dep("Desenho2D", "./desenho2d.js"); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function num(v, d) { var x = Number(v); return v != null && v !== "" && isFinite(x) ? x : d; }
  function n(v) { return (typeof v === "number" && isFinite(v)) ? String(Math.round(v * 1000) / 1000) : "NaN"; }
  function esc(s) { return txt(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function hip(x, y) { return Math.sqrt(x * x + y * y); }

  /* CONVENÇÃO DE REFORMA: a mesma tabela do Desenho2D (o teste confere); a cópia só vale sem ele */
  var CONV_RESERVA = {
    novo:      { rotulo: "A CONSTRUIR", cor: "#d00000", fill: "#f6c9c9", hachura: "#d00000", tracejado: null },
    demolido:  { rotulo: "A DEMOLIR", cor: "#f0a800", fill: "#fff2b8", hachura: null, tracejado: [1.5, 1] },
    existente: { rotulo: "EXISTENTE A MANTER", cor: "#1a1a1a", fill: "#bdbdbd", hachura: null, tracejado: null }
  };
  function conv() { var d = D2(); return (d && d.CONV_REFORMA) || CONV_RESERVA; }

  /* penas e geometria de desenho (mm de papel) — não são valores de norma */
  var K = {
    pena: { corte: 0.5, vista: 0.25, fina: 0.18, cota: 0.13, hachura: 0.09, divisa: 0.35, tabela: 0.25, titulo: 0.35, moldura: 0.5, telhado: 0.25, cumeeira: 0.5 },
    hLetra: { rotulo: 2.8, rotuloMenor: 2.2, vao: 2.2, nota: 2.5 },
    passoHachura: 1.6, offCota1: 11, offCota2: 20, margemCotas: 28,
    cinzaLouca: "#7a7a7a", cinzaMovel: "#8c8c8c", pocheEscuro: "#1f1f1f", pocheCinza: "#bdbdbd",
    tracoEixo: "9.6 1.6 0.4 1.6", tracoOculta: "3 1.5"
  };

  /* ------------------------------------------------------------ ESTILO (camadas ARQ-* sobre o estilo da casa) */
  function estilo(padrao) {
    var A = AP(), E = A.estilo(padrao), C = conv();
    function cam(nome, mm, cor, dash) { E.camadas[nome] = { mm: mm, dash: dash || null, cor: cor || "#000" }; }
    cam("ARQ-PAREDE", K.pena.corte, "#000"); cam("ARQ-PAREDE-EXISTENTE", K.pena.corte, C.existente.cor);
    cam("ARQ-PAREDE-NOVO", K.pena.corte, C.novo.cor); cam("ARQ-PAREDE-DEMOLIDO", 0.35, C.demolido.cor, C.demolido.tracejado.join(" "));
    cam("ARQ-VAO", K.pena.vista, "#000"); cam("ARQ-VAO-EXISTENTE", K.pena.vista, C.existente.cor); cam("ARQ-VAO-NOVO", K.pena.vista, C.novo.cor); cam("ARQ-VAO-DEMOLIDO", K.pena.vista, C.demolido.cor, C.demolido.tracejado.join(" "));
    cam("ARQ-ARCO", K.pena.cota, "#444"); cam("ARQ-ARCO-NOVO", K.pena.cota, C.novo.cor); cam("ARQ-ARCO-DEMOLIDO", K.pena.cota, C.demolido.cor, C.demolido.tracejado.join(" "));
    cam("ARQ-MOVEL", K.pena.fina, K.cinzaMovel); cam("ARQ-LOUCA", K.pena.fina, K.cinzaLouca);
    cam("ARQ-HACHURA", K.pena.hachura, "#9a9a9a"); cam("ARQ-HACHURA-NOVO", K.pena.hachura, C.novo.hachura); cam("ARQ-HACHURA-EXISTENTE", K.pena.hachura, "#666");
    cam("ARQ-DIVISA", K.pena.divisa, "#000", K.tracoEixo); cam("ARQ-EIXO", K.pena.cota, "#000", K.tracoEixo); cam("ARQ-OCULTA", K.pena.fina, "#555", K.tracoOculta);
    cam("ARQ-TELHADO", K.pena.telhado, "#000"); cam("ARQ-CUMEEIRA", K.pena.cumeeira, "#000"); cam("ARQ-ESPIGAO", 0.35, "#000"); cam("ARQ-BEIRAL", K.pena.fina, "#000", K.tracoOculta);
    cam("ARQ-CORTE", 0.35, "#000", K.tracoEixo); cam("ARQ-NIVEL", K.pena.fina, "#000"); cam("ARQ-CONTEXTO", K.pena.cota, "#8a8a8a");
    cam("ARQ-PISO", K.pena.hachura, "#555"); cam("ARQ-PISO-RECORTE", 0.13, "#c00000"); cam("ARQ-LIDER", K.pena.cota, "#000"); cam("ARQ-SIMBOLO", K.pena.fina, "#000");
    cam("ARQ-FORRO", 0.35, "#000"); cam("ARQ-FORRO-DET", K.pena.fina, "#444"); cam("ARQ-LUMINARIA", K.pena.fina, "#000"); cam("ARQ-SANCA", K.pena.fina, "#444", K.tracoOculta);
    cam("ARQ-HACHURA-PERM", K.pena.hachura, "#3c7a2a"); cam("ARQ-TERRENO", 0.35, "#5a4a3a"); cam("ARQ-MURO", 0.35, "#000"); cam("ARQ-PERMEAVEL", K.pena.fina, "#3c7a2a");
    cam("ARQ-HUM", 0.18, "#555"); cam("ARQ-HUM-PISO", 0.09, "#c9c2b2"); cam("ARQ-HUM-MADEIRA", 0.09, "#9c7446"); cam("ARQ-HUM-AGUA", 0.09, "#3f9fd1"); cam("ARQ-TABELA", K.pena.tabela, "#000"); cam("ARQ-MOLDURA", K.pena.moldura, "#000");
    E.camadas["MET-MOLDURA"] = E.camadas["ARQ-MOLDURA"]; E.camadas["MET-TABELA"] = E.camadas["ARQ-TABELA"];
    return E;
  }

  /* ------------------------------------------------------------ O DESENHO (AcoPranchas.Desenho + marcas para a conferência) */
  var CAM_SEM_OBSTACULO = /^(ARQ-HACHURA|ARQ-PISO|ARQ-TABELA|MET-TABELA|ARQ-MOLDURA|MET-MOLDURA|ARQ-LIDER|ARQ-HUM|MET-TITULO)/;
  function novo(E, depurar) {
    var A = AP(), caixas = depurar === false ? null : [], D = new A.Desenho(E, caixas);
    D.sgc = []; D._cam = null; D.K = K; D.fundoCam = {};
    var oLinha = D.linha, oTraco = D.traco, oEst = D.estilo;
    D.traco = function (lista, fechado) {
      var n0 = this.sg.length; oTraco.call(this, lista, fechado);
      for (var i = n0; i < this.sg.length; i++) this.sgc[i] = this._cam || "ARQ-SIMBOLO";
    };
    D.linha = function (x1, y1, x2, y2, cam, extra) {
      var n0 = this.sg.length; this._cam = cam; oLinha.call(this, x1, y1, x2, y2, cam, extra); this._cam = null;
      for (var i = n0; i < this.sg.length; i++) this.sgc[i] = cam || "ARQ-SIMBOLO";
    };
    [["poli", 1], ["ret", 4], ["circ", 3], ["cheio", -1]].forEach(function (par) {
      var o = D[par[0]];
      D[par[0]] = function () {
        var cam = par[1] >= 0 ? arguments[par[1]] : "ARQ-SIMBOLO"; this._cam = cam;
        var r = o.apply(this, arguments); this._cam = null; return r;
      };
    });
    D.estilo = function (cam, extra) { return oEst.call(this, cam, extra) + ' data-cam="' + esc(cam || "") + '"'; };
    /* "livre" olha só os traços que são obstáculo de verdade: hachura, paginação e a mancha de grama não impedem o texto */
    ["livre", "livreQ"].forEach(function (nome) {
      var o = D[nome];
      D[nome] = function () {
        if (this._obstN !== this.sg.length) {
          var keep = [], i; for (i = 0; i < this.sg.length; i++) if (!CAM_SEM_OBSTACULO.test(this.sgc[i] || "")) keep.push(this.sg[i]);
          this._obst = keep; this._obstN = this.sg.length;
        }
        var todos = this.sg; this.sg = this._obst;
        try { return o.apply(this, arguments); } finally { this.sg = todos; }
      };
    });
    return D;
  }
  /* atributos de contorno por camada, com fator (a passada larga do poché) */
  function atr(D, cam, fator) {
    var c = D.E.camadas[cam] || D.E.camadas["ARQ-SIMBOLO"] || {};
    return ' stroke="' + (c.cor || "#000") + '" stroke-width="' + n((c.mm || 0.18) * (fator || 1)) + '"' + (c.dash ? ' stroke-dasharray="' + c.dash + '"' : "") + ' stroke-linejoin="miter" data-cam="' + esc(cam) + '"';
  }
  function pts(L) { return L.map(function (p) { return n(p[0]) + "," + n(p[1]); }).join(" "); }
  /* polígono preenchido SEM registrar contorno (fundo de cor) */
  function fundoPol(D, L, fill, cam) { D.add('<polygon points="' + pts(L) + '" fill="' + fill + '" stroke="none"' + (cam ? ' data-cam="' + esc(cam) + '"' : "") + "/>"); }

  /* ------------------------------------------------------------ MAPA metros → papel */
  function mapa(caixa, ox, oy, k) {
    var x0 = caixa[0], z0 = caixa[1];
    return {
      k: k, ox: ox, oy: oy, caixa: caixa,
      P: function (x, z) { return [ox + (x - x0) * k, oy + (z - z0) * k]; },
      Pp: function (p) { return [ox + (p[0] - x0) * k, oy + (p[1] - z0) * k]; },
      L: function (m) { return m * k; },
      larg: (caixa[2] - caixa[0]) * k, alt: (caixa[3] - caixa[1]) * k
    };
  }
  function polyPapel(M, ptsM) { return ptsM.map(function (p) { return M.Pp(p); }); }

  /* ------------------------------------------------------------ TEXTO: números e blocos */
  function br(v, c) {
    if (v == null || !isFinite(v)) return "-";
    return (Math.round(v * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ",");
  }
  function cm1(vm) { var v = Math.round(vm * 1000) / 10; return Math.abs(v - Math.round(v)) < 1e-6 ? String(Math.round(v)) : br(v, 1); }
  function nivelTxt(z) { return (z > 0.0005 ? "+" : (z < -0.0005 ? "-" : "±")) + br(Math.abs(z), 2); }
  function largTexto(s, h) { return AP().largTexto(s, h); }
  /* bloco de linhas de texto centrado no lugar livre mais perto de pref (D.procura): devolve o centro ou null */
  function rotuloBloco(D, pref, linhas, area, o) {
    o = o || {};
    var hs = o.alturas || [], hLin = o.h || 2.4, entre = 1.3, tent = [];
    var jogos = arr(o.jogos).length ? o.jogos : [linhas];
    for (var j = 0; j < jogos.length; j++) {
      var L = jogos[j].filter(function (x) { return !!(x && (x.t || typeof x === "string")); }).map(function (x) { return typeof x === "string" ? { t: x } : x; });
      if (!L.length) continue;
      [1, 0.9, 0.8].forEach(function (f) {
        var h = hLin * f, w = 0; L.forEach(function (x) { w = Math.max(w, largTexto(x.t, x.h ? x.h * f : h)); });
        var H = L.length * h * entre + 0.6;
        var c = D.procura([pref[0], pref[1]], w + 1.2, H, area, { folga: 0.5, passo: 0.8 });
        if (c && !tent.length) tent = [c, L, h, H];
      });
      if (tent.length) break;
    }
    if (!tent.length) return null;
    var c2 = tent[0], L2 = tent[1], h2 = tent[2], H2 = tent[3], y = c2[1] - H2 / 2 + 0.3;
    if (o.fundo) {
      var wb = 0; L2.forEach(function (x) { wb = Math.max(wb, largTexto(x.t, x.h ? x.h * (h2 / hLin) : h2)); });
      D.add('<rect x="' + n(c2[0] - wb / 2 - 0.8) + '" y="' + n(c2[1] - H2 / 2) + '" width="' + n(wb + 1.6) + '" height="' + n(H2) + '" fill="#fff" stroke="none" data-cam="ARQ-HUM"/>');
    }
    L2.forEach(function (x) {
      var hh = x.h ? x.h * (h2 / hLin) : h2;
      D.texto(c2[0], y + hh * 0.76 + 0.1, x.t, hh, { al: "C", cor: x.cor, peso: x.peso });
      y += h2 * entre;
    });
    return c2;
  }

  /* ------------------------------------------------------------ PAREDES, VÃOS, MOBILIÁRIO */
  function ordemFase(s) { return s === "existente" ? 0 : (s === "demolido" ? 1 : 2); }
  /* modo: "existente" (levantamento: existente e a demolir como estão), "demolir" (convenção de reforma),
     "layout" (proposta: poché preto), "fantasma" (planta de apoio em cinza fino), "humanizada" */
  function estiloParede(modo, status) {
    var C = conv();
    if (modo === "demolir") {
      if (status === "novo") return { cam: "ARQ-PAREDE-NOVO", fill: C.novo.fill, hach: "ARQ-HACHURA-NOVO", fator: 2 };
      if (status === "demolido") return { cam: "ARQ-PAREDE-DEMOLIDO", fill: C.demolido.fill, hach: null, fator: 2 };
      return { cam: "ARQ-PAREDE-EXISTENTE", fill: C.existente.fill, hach: null, fator: 2 };
    }
    if (modo === "fantasma") return { cam: "ARQ-CONTEXTO", fill: "#ececec", hach: null, fator: 1 };
    if (modo === "humanizada") return { cam: "ARQ-HUM", fill: "#3a3a3a", hach: null, fator: 1 };
    return { cam: "ARQ-PAREDE", fill: K.pocheEscuro, hach: null, fator: 2 };
  }
  /* as paredes em poché: contorno largo + miolo (a passada 2 apaga a metade de dentro do contorno e as emendas) */
  function paredesPlanta(D, M, paredes, modo) {
    var grupos = {};
    paredes.forEach(function (w) { (grupos[w.status] = grupos[w.status] || []).push(w); });
    Object.keys(grupos).sort(function (a, b) { return ordemFase(a) - ordemFase(b); }).forEach(function (st) {
      var es = estiloParede(modo, st), G = GEO(), L = grupos[st];
      L.forEach(function (w) {
        var P = polyPapel(M, w.pts);
        D._cam = es.cam; D.traco(P, true); D._cam = null;
        D.add('<polygon points="' + pts(P) + '" fill="' + es.fill + '"' + atr(D, es.cam, es.fator) + ' data-w="' + esc(w.id) + '"/>');
      });
      if (es.fator > 1) L.forEach(function (w) { fundoPol(D, polyPapel(M, w.pts), es.fill); });
      if (es.hach) L.forEach(function (w) {
        var P = polyPapel(M, w.pts);
        G.hachuraLinhas(P, K.passoHachura, 45).forEach(function (s) { D.linha(s[0], s[1], s[2], s[3], es.hach); });
      });
    });
  }
  function pilaresPlanta(D, M, pilares, modo) {
    var C = conv();
    pilares.forEach(function (p) {
      var P = polyPapel(M, p.pts), cam = modo === "demolir" ? (p.status === "novo" ? "ARQ-PAREDE-NOVO" : (p.status === "demolido" ? "ARQ-PAREDE-DEMOLIDO" : "ARQ-PAREDE-EXISTENTE")) : "ARQ-PAREDE";
      var fill = modo === "demolir" ? (p.status === "novo" ? C.novo.fill : (p.status === "demolido" ? C.demolido.fill : C.existente.fill)) : K.pocheEscuro;
      D._cam = cam; D.traco(P, true); D._cam = null;
      D.add('<polygon points="' + pts(P) + '" fill="' + fill + '"' + atr(D, cam, 1) + "/>");
    });
  }
  function camVao(modo, status, base) {
    if (modo !== "demolir") return base;
    return base + (status === "novo" ? "-NOVO" : (status === "demolido" ? "-DEMOLIDO" : "-EXISTENTE"));
  }
  /* o vão: abre a parede (fundo branco), batentes, folha e arco (porta de giro), duas folhas (correr) ou três traços (janela) */
  function vaosPlanta(D, M, vaos, paredesPorId, modo) {
    vaos.forEach(function (v) {
      var w = paredesPorId[v.parede]; if (!w) return;
      var th = num(v.rotY, w.rotY), cs = Math.cos(th), sn = Math.sin(th), u = [cs, -sn], nv = [sn, cs], h = v.largura / 2, e2 = w.espessura / 2 + 0.003;
      function Q(a, b) { return M.P(v.x + u[0] * a + nv[0] * b, v.z + u[1] * a + nv[1] * b); }
      var gap = [Q(-h, -e2), Q(h, -e2), Q(h, e2), Q(-h, e2)];
      fundoPol(D, gap, "#fff");
      var camB = camVao(modo, v.status, "ARQ-VAO"), camA = v.status === "novo" && modo === "demolir" ? "ARQ-ARCO-NOVO" : (v.status === "demolido" && modo === "demolir" ? "ARQ-ARCO-DEMOLIDO" : "ARQ-ARCO");
      D.linha(Q(-h, -e2)[0], Q(-h, -e2)[1], Q(-h, e2)[0], Q(-h, e2)[1], camB); D.linha(Q(h, -e2)[0], Q(h, -e2)[1], Q(h, e2)[0], Q(h, e2)[1], camB);
      var corre = /correr/i.test(v.famId);
      if (v.tipo === "janela") {
        [-e2 / 3, e2 / 3].forEach(function (b) { var a1 = Q(-h, b), a2 = Q(h, b); D.linha(a1[0], a1[1], a2[0], a2[1], camB); });
        var m1 = Q(-h, -e2), m2 = Q(h, -e2); D.linha(m1[0], m1[1], m2[0], m2[1], camB); var m3 = Q(-h, e2), m4 = Q(h, e2); D.linha(m3[0], m3[1], m4[0], m4[1], camB);
      } else if (corre) {
        var q1 = Q(-h, -e2 / 3), q2 = Q(0, -e2 / 3), q3 = Q(0, e2 / 3), q4 = Q(h, e2 / 3);
        D.linha(q1[0], q1[1], q2[0], q2[1], camB); D.linha(q3[0], q3[1], q4[0], q4[1], camB);
        var s1 = Q(-h, e2), s2 = Q(h, e2); D.linha(s1[0], s1[1], s2[0], s2[1], camB);
      } else {
        var lado = v.abreFora ? -1 : 1, H = Q(-h, 0), tip = Q(-h, lado * v.largura), fim = Q(h, 0);
        D.linha(H[0], H[1], tip[0], tip[1], camB);   /* a folha aberta a 90° */
        var arc = [];
        for (var i = 0; i <= 14; i++) { var t = i / 14 * Math.PI / 2, pa = Q(-h + v.largura * Math.sin(t), lado * v.largura * Math.cos(t)); arc.push(pa); }
        D.poli(arc, camA, false);
        void fim;
      }
    });
  }
  /* mobiliário e louças: a pegada de cada sólido, em traço fino cinza */
  function moveisPlanta(D, M, moveis, o) {
    o = o || {};
    moveis.forEach(function (m) {
      var cam = m.categoria === "loucas" ? "ARQ-LOUCA" : "ARQ-MOVEL", cs = Math.cos(m.rotY), sn = Math.sin(m.rotY);
      function W(u, v) { return M.P(m.x + u * cs + v * sn, m.z - u * sn + v * cs); }
      var nSol = 0;
      arr(m.solidos).forEach(function (s) {
        if (s.forma === "caixa" && s.dx > 0 && s.dz > 0 && (s.y == null || s.y < 1.2)) {
          var a = [W(s.x - s.dx / 2, s.z - s.dz / 2), W(s.x + s.dx / 2, s.z - s.dz / 2), W(s.x + s.dx / 2, s.z + s.dz / 2), W(s.x - s.dx / 2, s.z + s.dz / 2)];
          if (o.cheio) fundoPol(D, a, o.cheio(m, s) || "#eee");
          D.poli(a, cam, true); nSol++;
        } else if (s.forma === "cilindro" && s.eixo === "y") {
          var c = W(s.x, s.z); if (o.cheio) D.add('<circle cx="' + n(c[0]) + '" cy="' + n(c[1]) + '" r="' + n(s.raio * M.k) + '" fill="' + (o.cheio(m, s) || "#eee") + '" stroke="none"/>');
          D.circ(c[0], c[1], s.raio * M.k, cam); nSol++;
        }
      });
      if (!nSol) D.poli(polyPapel(M, m.pts), cam, true);
    });
  }

  /* ------------------------------------------------------------ COTAS */
  function unicos(vs, tol) {
    var v = vs.slice().sort(function (a, b) { return a - b; }), out = [];
    v.forEach(function (x) { if (!out.length || x - out[out.length - 1] > tol) out.push(x); });
    return out;
  }
  function ortogonal(w) { var a = Math.abs(Math.sin(w.rotY)); return a < 0.02 || a > 0.98; }
  /* tira os pontos que ficariam a menos de 2,6 mm do anterior no papel (a cota de uma parede de 15 cm em 1:100 não tem lugar para o número) */
  function podar(P, k) {
    var out = [P[0]], min = 2.6 / k;
    for (var i = 1; i < P.length; i++) { if (P[i] - out[out.length - 1] >= min || i === P.length - 1) { if (P[i] - out[out.length - 1] < min && out.length > 1) out.pop(); out.push(P[i]); } }
    return out;
  }
  /* cotas externas: cadeia de fora a fora (faces das paredes que chegam à divisa da planta + vãos das paredes de fora) e o total */
  function cotasExternas(D, M, paredes, vaos, o) {
    o = o || {};
    var G = GEO(), W = paredes.filter(ortogonal); if (!W.length) return 0;
    var xs = [], zs = [];
    W.forEach(function (w) { w.pts.forEach(function (p) { xs.push(p[0]); zs.push(p[1]); }); });
    var bx0 = Math.min.apply(null, xs), bx1 = Math.max.apply(null, xs), bz0 = Math.min.apply(null, zs), bz1 = Math.max.apply(null, zs), tol = 0.04, qtd = 0;
    function horiz(w) { return Math.abs(Math.sin(w.rotY)) < 0.02; }
    var lados = [
      { id: "topo", eixo: "x", z: bz0, dir: 1 }, { id: "base", eixo: "x", z: bz1, dir: -1 },
      { id: "esq", eixo: "z", x: bx0, dir: -1 }, { id: "dir", eixo: "z", x: bx1, dir: 1 }
    ];
    lados.forEach(function (ld) {
      var P = [], tot;
      if (ld.eixo === "x") {
        W.forEach(function (w) {
          var b = G.bbox(w.pts);
          if (horiz(w)) { if (Math.abs((ld.id === "topo" ? b[1] : b[3]) - ld.z) < tol) P.push(b[0], b[2]); }
          else if ((ld.id === "topo" && b[1] <= ld.z + tol) || (ld.id === "base" && b[3] >= ld.z - tol)) P.push(b[0], b[2]);
        });
        arr(vaos).forEach(function (v) {
          var w = paredes.filter(function (q) { return q.id === v.parede; })[0]; if (!w || !horiz(w)) return;
          var b = G.bbox(w.pts); if (Math.abs((ld.id === "topo" ? b[1] : b[3]) - ld.z) > tol) return;
          P.push(v.x - v.largura / 2, v.x + v.largura / 2);
        });
        P = unicos(P, tol); if (P.length < 2) return;
        P = podar(P, M.k); tot = [P[0], P[P.length - 1]];
        var pp = P.map(function (x) { return M.P(x, ld.z); }), vals = [];
        for (var i = 0; i + 1 < P.length; i++) vals.push(cm1(P[i + 1] - P[i]));
        D.cadeia(pp, ld.dir * K.offCota1, vals, { offs: [ld.dir * (K.offCota1 + 7)], desde: pp.map(function () { return 0.6; }) }); qtd++;
        D.cota(M.P(tot[0], ld.z)[0], M.P(tot[0], ld.z)[1], M.P(tot[1], ld.z)[0], M.P(tot[1], ld.z)[1], ld.dir * K.offCota2, cm1(tot[1] - tot[0]), { desde: [0.6, 0.6] }); qtd++;
      } else {
        W.forEach(function (w) {
          var b = G.bbox(w.pts);
          if (!horiz(w)) { if (Math.abs((ld.id === "esq" ? b[0] : b[2]) - ld.x) < tol) P.push(b[1], b[3]); }
          else if ((ld.id === "esq" && b[0] <= ld.x + tol) || (ld.id === "dir" && b[2] >= ld.x - tol)) P.push(b[1], b[3]);
        });
        arr(vaos).forEach(function (v) {
          var w = paredes.filter(function (q) { return q.id === v.parede; })[0]; if (!w || horiz(w)) return;
          var b = G.bbox(w.pts); if (Math.abs((ld.id === "esq" ? b[0] : b[2]) - ld.x) > tol) return;
          P.push(v.z - v.largura / 2, v.z + v.largura / 2);
        });
        P = unicos(P, tol); if (P.length < 2) return;
        P = podar(P, M.k); P.reverse();   /* de baixo para cima: o número da cota vertical é lido de baixo para cima */
        tot = [P[0], P[P.length - 1]];
        var qq = P.map(function (z) { return M.P(ld.x, z); }), vs = [], sgn = ld.id === "esq" ? 1 : -1;   /* n = à esquerda do sentido (para cima): + = esquerda do papel */
        for (var j = 0; j + 1 < P.length; j++) vs.push(cm1(P[j] - P[j + 1]));
        D.cadeia(qq, sgn * K.offCota1, vs, { offs: [sgn * (K.offCota1 + 7)], desde: qq.map(function () { return 0.6; }) }); qtd++;
        D.cota(M.P(ld.x, tot[0])[0], M.P(ld.x, tot[0])[1], M.P(ld.x, tot[1])[0], M.P(ld.x, tot[1])[1], sgn * K.offCota2, cm1(tot[0] - tot[1]), { desde: [0.6, 0.6] }); qtd++;
      }
    });
    return qtd;
  }
  /* cotas internas: largura e profundidade (face a face) de cada ambiente retangular, em linhas curtas no canto — só se houver lugar livre */
  function cotasInternas(D, M, ambientes) {
    var G = GEO(), q = 0;
    ambientes.forEach(function (a) {
      var b = a.bbox || G.bbox(a.pts); if (!b) return;
      var P0 = M.P(b[0], b[1]), P1 = M.P(b[2], b[3]), w = b[2] - b[0], d = b[3] - b[1];
      var retangular = Math.abs(G.areaPol(a.pts) - w * d) < 0.05;
      if (!retangular) return;
      /* horizontal: perto da base do ambiente */
      var poss = [P1[1] - 3.2, P1[1] - 6.5, P0[1] + 3.2, P0[1] + 6.5];
      for (var i = 0; i < poss.length; i++) {
        if (D.livre([P0[0] + 0.5, poss[i] - 3, P1[0] - 0.5, poss[i] + 1], 0.2)) { D.cota(P0[0], poss[i], P1[0], poss[i], 0, cm1(w), { desde: [false, false], semExt: true }); q++; break; }
      }
      var possx = [P0[0] + 3.2, P0[0] + 6.5, P1[0] - 3.2, P1[0] - 6.5];
      for (var j = 0; j < possx.length; j++) {
        if (D.livre([possx[j] - 3, P0[1] + 0.5, possx[j] + 1, P1[1] - 0.5], 0.2)) { D.cota(possx[j], P1[1], possx[j], P0[1], 0, cm1(d), { desde: [false, false], semExt: true }); q++; break; }
      }
    });
    return q;
  }
  /* rótulos de ambiente: nome, área, piso, pé-direito — no lugar livre mais perto do centro */
  function rotulosAmbientes(D, M, ambientes, o) {
    o = o || {};
    var semLugar = [];
    ambientes.forEach(function (a) {
      var c = M.P(a.cx, a.cz), b = a.bbox || GEO().bbox(a.pts), P0 = M.P(b[0], b[1]), P1 = M.P(b[2], b[3]);
      var area = [P0[0] + 0.5, P0[1] + 0.5, P1[0] - 0.5, P1[1] - 0.5];
      var nome = { t: txt(a.nome).toUpperCase(), h: 2.8, peso: 0.05 }, ar = { t: "A = " + br(a.area, 2) + " m²" }, piso = { t: "Piso: " + a.piso }, pe = { t: "PD = " + br(a.pe, 2) + " m" };
      var jogos = [];
      if (o.completo) jogos.push([nome, ar, a.piso ? piso : null, pe]);
      jogos.push([nome, ar], [nome]);
      var cc = rotuloBloco(D, c, null, area, { jogos: jogos.map(function (j) { return j.filter(function (x) { return !!x; }); }), h: 2.4 });
      if (!cc) semLugar.push(a.nome);
    });
    return semLugar;
  }
  /* etiquetas P1 / J1 junto de cada vão, do lado de fora da parede se houver lugar livre */
  function etiquetasVaos(D, M, vaos, paredesPorId) {
    var h = K.hLetra.vao, semLugar = [];
    vaos.forEach(function (v) {
      var w = paredesPorId[v.parede]; if (!w) return;
      var th = num(v.rotY, w.rotY), nv = [Math.sin(th), Math.cos(th)], d = w.espessura / 2 + (h * 0.9 + 1.3) / M.k, wt = largTexto(v.cod, h);
      var cands = [1, -1, 2, -2].map(function (s) { return M.P(v.x + nv[0] * d * (Math.abs(s) === 2 ? 1.9 : 1) * (s > 0 ? 1 : -1), v.z + nv[1] * d * (Math.abs(s) === 2 ? 1.9 : 1) * (s > 0 ? 1 : -1)); });
      var ok = false;
      for (var i = 0; i < cands.length && !ok; i++) {
        var c = cands[i];
        if (D.livre([c[0] - wt / 2, c[1] - h * 0.5, c[0] + wt / 2, c[1] + h * 0.5], 0.25)) { D.texto(c[0], c[1], v.cod, h, { al: "C", meio: true }); ok = true; }
      }
      if (!ok) semLugar.push(v.cod);
    });
    return semLugar;
  }

  /* ------------------------------------------------------------ NORTE, ESCALA GRÁFICA, MARCAS DE CORTE */
  function norte(D, cx, cy, anguloNorte, r) {
    r = r || 7;
    var a = (anguloNorte || 0) * Math.PI / 180, ux = -Math.sin(a), uy = -Math.cos(a), nx = -uy, ny = ux;
    D.circ(cx, cy, r, "ARQ-SIMBOLO");
    D.cheio([[cx + ux * r * 1.35, cy + uy * r * 1.35], [cx + nx * r * 0.38, cy + ny * r * 0.38], [cx - nx * r * 0.38, cy - ny * r * 0.38]], "#000");
    D.linha(cx - ux * r, cy - uy * r, cx + ux * r * 0.2, cy + uy * r * 0.2, "ARQ-SIMBOLO");
    D.texto(cx + ux * r * 1.35 + ux * 1.0, cy + uy * r * 1.35 + uy * 1.0 + (uy < -0.5 ? -0.8 : 0.9), "N", 3.4, { al: "C", meio: true });
  }
  function escalaGrafica(D, x, y, k, metros) {
    /* barra de `metros` m em 5 trechos, alternando preto e branco */
    var seg = metros / 5, h = 1.6;
    for (var i = 0; i < 5; i++) {
      var x0 = x + i * seg * k;
      D.ret(x0, y, seg * k, h, "ARQ-SIMBOLO");
      if (i % 2 === 0) D.add('<rect x="' + n(x0) + '" y="' + n(y) + '" width="' + n(seg * k) + '" height="' + n(h) + '" fill="#000" stroke="none"/>');
      D.texto(x0, y - 0.9, br(i * seg, seg % 1 ? 1 : 0), 2.1, { al: "C" });
    }
    D.texto(x + metros * k, y - 0.9, br(metros, 0) + " m", 2.1, { al: "C" });
  }
  /* marca de corte: linha traço-ponto através da planta, espessura nas pontas, letra e seta do lado que se olha */
  /* a linha do corte de a até b (já estendida), as setas e a letra em cada ponta; a letra procura lugar livre ao longo da linha prolongada */
  function marcaCorte(D, a, b, letra, olhar) {
    var dx = b[0] - a[0], dy = b[1] - a[1], L = hip(dx, dy), ux = dx / L, uy = dy / L, nx = -uy * olhar, ny = ux * olhar;
    D.linha(a[0], a[1], b[0], b[1], "ARQ-CORTE");
    [a, b].forEach(function (p, i) {
      D.linha(p[0], p[1], p[0] + nx * 6, p[1] + ny * 6, "ARQ-PAREDE");
      D.seta(p[0] + nx * 6, p[1] + ny * 6, -nx, -ny, 2.0);
      var h = 3.4, w = largTexto(letra, h), ok = false, ds = [10, 13.5, 17, 21];
      for (var k = 0; k < ds.length && !ok; k++) {
        var cx = p[0] + nx * ds[k], cy = p[1] + ny * ds[k] + 1.1, bx = [cx - w / 2 - 0.4, cy - h * 0.8, cx + w / 2 + 0.4, cy + h * 0.2];
        if (D.livre(bx, 0.3)) { D.texto(cx, cy, letra, h, { al: "C" }); ok = true; }
      }
      if (!ok) D.texto(p[0] + nx * 10, p[1] + ny * 10 + 1.1, letra, h, { al: "C" });
      void i;
    });
  }
  /* a linha de corte de uma folha: a primeira coordenada candidata em que a linha (com as pontas) não cruza nenhum texto já escrito */
  function escolherLinhaCorte(D, M, ct, ext) {
    var cands = arr(ct.cands).length ? ct.cands : [ct.coord], pick = cands[0];
    for (var i = 0; i < cands.length; i++) {
      var c0 = cands[i], a = ct.eixo === "x" ? M.P(ct.u0 - ext, c0) : M.P(c0, ct.u0 - ext), b = ct.eixo === "x" ? M.P(ct.u1 + ext, c0) : M.P(c0, ct.u1 + ext);
      var ux = (b[0] - a[0]), uy = (b[1] - a[1]), L = hip(ux, uy), nx = uy / L, ny = -ux / L;
      /* as pontas inclinadas de 6 mm e o ponto da letra também não podem cair em texto */
      if (!D.cortaTexto(a[0], a[1], b[0], b[1]) && !D.cortaTexto(a[0], a[1], a[0] + nx * 22, a[1] + ny * 22) && !D.cortaTexto(b[0], b[1], b[0] + nx * 22, b[1] + ny * 22)) { pick = c0; break; }
    }
    return pick;
  }

  /* ------------------------------------------------------------ COLUNA DE NOTAS, MOLDURA, CARIMBO */
  function colunaNotas(D, g, blocos) {
    var col = g.coluna, car = g.carimbo, x0 = col.x + 4, wmax = col.w - 7, yMax = car.y - 3, yMin = col.y + 4, T = D.E.T, A = AP();
    var tent = [T.nota, T.nota * 0.92, T.nota * 0.84, T.nota * 0.76, T.nota * 0.68].filter(function (hh) { return hh >= T.minimo - 1e-9; }), esc0 = null, coube = true;
    if (tent[tent.length - 1] > T.minimo + 1e-9) tent.push(T.minimo);
    function itemTxt(it) { return (it && typeof it === "object") ? it.t : it; }
    function medir(h, hq) {
      var tot = 0;
      blocos.forEach(function (b) {
        tot += hq * 0.76 + hq * 0.55 + 1.5;
        if (b.legenda) tot += b.legenda.length * (Math.max(h, 3.2) * 1.5);
        arr(b.itens).forEach(function (it, i) {
          var pre = b.numerar ? (i + 1) + "- " : "- ", rec = largTexto(pre, h);
          tot += A.quebrar(itemTxt(it), h, wmax - rec).length * h * 1.42 + 0.7;
        });
        tot += 3.5;
      });
      return tot;
    }
    for (var i = 0; i < tent.length; i++) { var hq = Math.min(T.quadro, tent[i] * 3); if (medir(tent[i], hq) <= yMax - yMin) { esc0 = [tent[i], hq]; break; } }
    if (!esc0) { esc0 = [tent[tent.length - 1], Math.min(T.quadro, tent[tent.length - 1] * 3)]; coube = false; }
    var h = esc0[0], hq0 = esc0[1], y = yMax - medir(h, hq0);
    D.linha(col.x, col.y, col.x, car.y, "ARQ-MOLDURA");
    blocos.forEach(function (b) {
      D.texto(x0, y + hq0 * 0.76, b.titulo, hq0, { peso: 0.28 });
      y += hq0 * 0.76 + hq0 * 0.55 + 1.5;
      /* LEGENDA com amostra (cor, traço) à esquerda do texto: b.legenda = [{ t, fill, cor, tracejado, hachura }] */
      arr(b.legenda).forEach(function (l) {
        var hh = Math.max(h, 3.2) * 1.5, sw = 9, sh = Math.min(3.6, hh - 0.8), ys = y + (hh - sh) / 2;
        if (l.fill) D.add('<rect x="' + n(x0) + '" y="' + n(ys) + '" width="' + n(sw) + '" height="' + n(sh) + '" fill="' + l.fill + '" stroke="none"/>');
        if (l.hachura) GEO().hachuraLinhas([[x0, ys], [x0 + sw, ys], [x0 + sw, ys + sh], [x0, ys + sh]], 1.2, 45).forEach(function (s) { D.linha(s[0], s[1], s[2], s[3], "ARQ-HACHURA-NOVO"); });
        if (l.cam) { D.add('<rect x="' + n(x0) + '" y="' + n(ys) + '" width="' + n(sw) + '" height="' + n(sh) + '" fill="none"' + atr(D, l.cam, 1.4) + "/>"); }
        D.texto(x0 + sw + 2.2, ys + sh / 2, l.t, h, { meio: true });
        y += hh;
      });
      arr(b.itens).forEach(function (it, i) {
        var o = (it && typeof it === "object") ? it : { t: txt(it) }, pre = b.numerar ? (i + 1) + "- " : "- ", rec = largTexto(pre, h);
        var ls = A.quebrar(o.t, h, wmax - rec);
        D.texto(x0, y + h * 0.76, pre, h, { cor: o.cor });
        ls.forEach(function (s) { D.texto(x0 + rec, y + h * 0.76, s, h, { cor: o.cor }); y += h * 1.42; });
        y += 0.7;
      });
      y += 3.5;
    });
    return coube;
  }

  /* ------------------------------------------------------------ CONFERÊNCIA DE SOBREPOSIÇÃO */
  function quadCorta(G, sg, q) {
    var a = [sg[0], sg[1]], b = [sg[2], sg[3]];
    if (G.pontoEmPol(a, q) || G.pontoEmPol(b, q)) return true;
    for (var i = 0; i < 4; i++) if (G.interSegSeg(a, b, q[i], q[(i + 1) % 4])) return true;
    return false;
  }
  function bb(q) { var xs = q.map(function (p) { return p[0]; }), ys = q.map(function (p) { return p[1]; }); return [Math.min.apply(null, xs), Math.min.apply(null, ys), Math.max.apply(null, xs), Math.max.apply(null, ys)]; }
  /* encolhe a caixa do texto 0,1 mm: o contorno do ofício de letra não é matéria do desenho */
  function encolher(q, f) {
    var c = [(q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4];
    return q.map(function (p) { var dx = p[0] - c[0], dy = p[1] - c[1], L = hip(dx, dy) || 1; return [p[0] - dx / L * f, p[1] - dy / L * f]; });
  }
  function conferir(D, janela, ignorar) {
    var G = GEO(), A = AP(), out = { textoTexto: [], textoLinha: [], foraJanela: [], n: { textos: arr(D.caixas).length, segmentos: D.sg.length } };
    var cx = arr(D.caixas), ig = ignorar || null;
    out.textoTexto = A.sobreposicoes(cx, 0.15).map(function (p) { return p[0] + " × " + p[1]; });
    var obst = [];
    D.sg.forEach(function (s, i) { var cam = D.sgc[i] || "ARQ-SIMBOLO"; if (!CAM_SEM_OBSTACULO.test(cam)) obst.push({ s: s, cam: cam }); });
    cx.forEach(function (t) {
      var q = encolher(t.p, 0.12), b = bb(q);
      for (var i = 0; i < obst.length; i++) {
        var o = obst[i], s = o.s;
        if (Math.max(s[0], s[2]) < b[0] || Math.min(s[0], s[2]) > b[2] || Math.max(s[1], s[3]) < b[1] || Math.min(s[1], s[3]) > b[3]) continue;
        if (quadCorta(G, s, q)) { if (!ig || !ig(t, o)) { out.textoLinha.push(t.s + " × " + o.cam); (out.detalhe = out.detalhe || []).push({ t: t.s, cam: o.cam, seg: o.s, box: b }); } break; }
      }
      if (janela && (b[0] < janela[0] - 0.01 || b[1] < janela[1] - 0.01 || b[2] > janela[2] + 0.01 || b[3] > janela[3] + 0.01)) out.foraJanela.push(t.s);
    });
    out.total = out.textoTexto.length + out.textoLinha.length + out.foraJanela.length;
    return out;
  }

  var ArqDesenho = { K: K, estilo: estilo, novo: novo, atr: atr, pts: pts, fundoPol: fundoPol, mapa: mapa, polyPapel: polyPapel, br: br, cm1: cm1, nivelTxt: nivelTxt, esc: esc, n: n,
    rotuloBloco: rotuloBloco, paredesPlanta: paredesPlanta, pilaresPlanta: pilaresPlanta, vaosPlanta: vaosPlanta, moveisPlanta: moveisPlanta, cotasExternas: cotasExternas, cotasInternas: cotasInternas,
    rotulosAmbientes: rotulosAmbientes, etiquetasVaos: etiquetasVaos, norte: norte, escalaGrafica: escalaGrafica, marcaCorte: marcaCorte, escolherLinhaCorte: escolherLinhaCorte, colunaNotas: colunaNotas, conferir: conferir,
    estiloParede: estiloParede, conv: conv, CONV_RESERVA: CONV_RESERVA, CAM_SEM_OBSTACULO: CAM_SEM_OBSTACULO, largTexto: largTexto };
  global.ArqDesenho = ArqDesenho;
  if (typeof module !== "undefined" && module.exports) module.exports = ArqDesenho;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
