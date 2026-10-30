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
  function ES() { return dep("ArqEstilo", "./arqestilo.js"); }
  function BP() { return dep("BimPlanta", "./bimplanta.js"); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function num(v, d) { var x = Number(v); return v != null && v !== "" && isFinite(x) ? x : d; }
  function n(v) { return (typeof v === "number" && isFinite(v)) ? String(Math.round(v * 1000) / 1000) : "NaN"; }
  function esc(s) { return txt(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function hip(x, y) { return Math.sqrt(x * x + y * y); }

  /* O ESTILO (penas, cores, textos, cotas) vem de js/arqestilo.js = chave `arquitetura_interiores` do Padrão RA (v2.13). Aqui não há número de estilo solto:
     o que a chave não cobre (terreno, telhado, humanizada) fica com a pena da casa, dito em cada linha. */
  var S = ES();
  if (!S) throw new Error("js/arqestilo.js não carregou (vem antes de js/arqdesenho.js)");
  /* CONVENÇÃO DE REFORMA DAS PRANCHAS: demolir amarelo e construir vermelho, parede cortada com preenchimento chapado (padrão, chave `cores`) */
  function conv() { return S.CONVENCAO; }

  var PN = S.PENAS;
  var K = {
    pena: { corte: PN.parede_cortada, vista: PN.folha_de_esquadria, fina: PN.marcenaria_em_vista, cota: PN.linha_de_cota, hachura: PN.hachura, titulo: PN.sublinhado_titulo, moldura: PN.moldura_da_folha,
            movel: PN.mobiliario_em_planta, leader: PN.leader_de_nota, luminaria: PN.simbolo_luminotecnico,
            /* sem papel no padrão de interiores: pena da casa */
            divisa: 0.35, tabela: 0.25, telhado: 0.25, cumeeira: 0.5 },
    hLetra: { rotulo: S.TEXTOS.legenda, rotuloMenor: 2.2, vao: S.TEXTOS.legenda, nota: S.TEXTOS.nota_de_material },
    passoHachura: 1.6, margemCotas: 44 /* R01: 28 → 44 mm: cabem as cadeias até as divisas (recuos e lote inteiro) */,
    cinzaLouca: S.CORES.preto, cinzaMovel: S.CORES.preto, pocheEscuro: "#8a8a8a" /* R01: o manual de referência (pág. GRAFICAÇÃO): parede cinza escuro RGB 138 com contorno preto 0,35 */, pocheCinza: "#bdbdbd",
    tracoEixo: "9.6 1.6 0.4 1.6", tracoOculta: S.TRACEJADO
  };

  /* ------------------------------------------------------------ ESTILO (camadas ARQ-* sobre o estilo da casa) */
  function estilo(padrao) {
    var A = AP(), E = A.estilo(padrao), C = conv(), PRETO = S.CORES.preto, cEx = C.existente.cor;
    function cam(nome, mm, cor, dash) { E.camadas[nome] = { mm: mm, dash: dash || null, cor: cor || PRETO }; }
    /* parede cortada: contorno 0,30 preto por cima do preenchimento (cor da convenção) */
    cam("ARQ-PAREDE", K.pena.corte, PRETO); cam("ARQ-PAREDE-EXISTENTE", K.pena.corte, cEx);
    cam("ARQ-PAREDE-NOVO", K.pena.corte, PRETO); cam("ARQ-PAREDE-DEMOLIDO", K.pena.corte, PRETO);
    /* esquadria: batente 0,30 (bancada_e_batente), folha 0,09, arco de giro em cabelo; novo em vermelho, demolido tracejado, existente na cor do existente */
    cam("ARQ-BATENTE", PN.bancada_e_batente, PRETO); cam("ARQ-BATENTE-EXISTENTE", PN.bancada_e_batente, cEx); cam("ARQ-BATENTE-NOVO", PN.bancada_e_batente, C.novo.cor); cam("ARQ-BATENTE-DEMOLIDO", PN.bancada_e_batente, PRETO, S.TRACEJADO);
    cam("ARQ-VAO", K.pena.vista, PRETO); cam("ARQ-VAO-EXISTENTE", K.pena.vista, cEx); cam("ARQ-VAO-NOVO", K.pena.vista, C.novo.cor); cam("ARQ-VAO-DEMOLIDO", K.pena.vista, PRETO, S.TRACEJADO);
    cam("ARQ-ARCO", K.pena.cota, PRETO); cam("ARQ-ARCO-NOVO", K.pena.cota, C.novo.cor); cam("ARQ-ARCO-DEMOLIDO", K.pena.cota, PRETO, S.TRACEJADO);
    cam("ARQ-MOVEL", K.pena.movel, K.cinzaMovel); cam("ARQ-LOUCA", K.pena.movel, K.cinzaLouca);
    cam("ARQ-HACHURA", K.pena.hachura, "#9a9a9a"); cam("ARQ-HACHURA-NOVO", K.pena.hachura, C.novo.cor); cam("ARQ-HACHURA-EXISTENTE", K.pena.hachura, "#666");
    cam("ARQ-DIVISA", K.pena.divisa, PRETO, K.tracoEixo); cam("ARQ-EIXO", K.pena.cota, PRETO, K.tracoEixo); cam("ARQ-OCULTA", K.pena.cota, PRETO, K.tracoOculta);
    cam("ARQ-TELHADO", K.pena.telhado, PRETO); cam("ARQ-CUMEEIRA", K.pena.cumeeira, PRETO); cam("ARQ-ESPIGAO", 0.35, PRETO); cam("ARQ-BEIRAL", K.pena.cota, PRETO, K.tracoOculta);
    cam("ARQ-CORTE", 0.35, PRETO, K.tracoEixo); cam("ARQ-NIVEL", K.pena.fina, PRETO); cam("ARQ-CONTEXTO", K.pena.cota, "#8a8a8a"); cam("ARQ-FINA", K.pena.fina, PRETO);
    cam("ARQ-PISO", K.pena.hachura, "#555"); cam("ARQ-PISO-RECORTE", 0.13, "#c00000"); cam("ARQ-LIDER", K.pena.leader, PRETO); cam("ARQ-SIMBOLO", K.pena.fina, PRETO);
    cam("ARQ-FORRO", 0.35, PRETO); cam("ARQ-FORRO-DET", K.pena.fina, "#444"); cam("ARQ-LUMINARIA", K.pena.luminaria, S.CORES.luminotecnico); cam("ARQ-SANCA", K.pena.cota, PRETO, K.tracoOculta);
    cam("ARQ-HACHURA-PERM", K.pena.hachura, "#3c7a2a"); cam("ARQ-TERRENO", 0.35, "#5a4a3a"); cam("ARQ-MURO", 0.35, PRETO); cam("ARQ-PERMEAVEL", K.pena.fina, "#3c7a2a");
    cam("ARQ-HUM", 0.18, "#555"); cam("ARQ-HUM-PISO", 0.09, "#c9c2b2"); cam("ARQ-HUM-MADEIRA", 0.09, "#9c7446"); cam("ARQ-HUM-AGUA", 0.09, "#3f9fd1"); cam("ARQ-TABELA", K.pena.tabela, PRETO); cam("ARQ-MOLDURA", K.pena.moldura, PRETO);
    cam("ARQ-QUADRO", PN.moldura_interna, PRETO); cam("ARQ-QUADRO-DIV", PN.linha_de_cota, PRETO);
    E.camadas["MET-MOLDURA"] = E.camadas["ARQ-MOLDURA"]; E.camadas["MET-TABELA"] = E.camadas["ARQ-TABELA"];
    /* o que o desenho herda do estilo da casa e o padrão de interiores define: a cota (linha e marca em cabelo), o sublinhado do título, o traço fino */
    E.camadas["MET-COTA"] = { mm: K.pena.cota, dash: null, cor: PRETO }; E.camadas["MET-TITULO"] = { mm: K.pena.titulo, dash: null, cor: PRETO }; E.camadas["MET-FINA"] = { mm: K.pena.fina, dash: null, cor: PRETO };
    return E;
  }

  /* ------------------------------------------------------------ O DESENHO (AcoPranchas.Desenho + marcas para a conferência) */
  var CAM_SEM_OBSTACULO = /^(ARQ-HACHURA|ARQ-PISO|ARQ-TABELA|MET-TABELA|ARQ-MOLDURA|MET-MOLDURA|ARQ-LIDER|ARQ-HUM|MET-TITULO|ARQ-QUADRO)/;
  function novo(E, depurar) {
    var A = AP(), caixas = depurar === false ? null : [], D = new A.Desenho(E, caixas);
    D.sgc = []; D._cam = null; D.K = K; D.fundoCam = {};
    S.aplicar(D);   /* texto em Verdana, cota com ponto + cruz, nota de material (js/arqestilo.js) */
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
    /* ⚠ 25/10/2026: o estilo de base (js/acopranchas.js) JÁ põe data-cam nas camadas MET-* (as cotas da arquitetura usam MET-COTA):
       somar o nosso repetia o atributo e o SVG da folha ficava INVÁLIDO ("Attribute data-cam redefined") — o navegador parava de
       desenhar a folha na primeira cota (projeto exemplo, ARQ-02). Só põe quando a base não pôs. */
    D.estilo = function (cam, extra) { var s = oEst.call(this, cam, extra); return / data-cam="/.test(s) ? s : s + ' data-cam="' + esc(cam || "") + '"'; };
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

  /* ------------------------------------------------------------ TÍTULO DE DESENHO ("01 PLANTA BAIXA" / ESCALA 1/50) — ver ArqEstilo.titulo.
     escala: "ESC 1:50" | "1:50" | "SEM ESCALA"; numero: o do desenho na folha (01, 02…). Devolve a altura que o título ocupa. */
  function titulo(D, x, y, nome, escala, numero) { return S.titulo(D, x, y, numero == null ? "01" : numero, nome, escala); }

  /* ------------------------------------------------------------ TEXTO: números e blocos */
  function br(v, c) {
    if (v == null || !isFinite(v)) return "-";
    return (Math.round(v * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ",");
  }
  /* o número de uma COTA (metros): o formato do padrão (".79", "1.52"), trocável em ArqEstilo.formatoNumero; `cm1` é o nome antigo (centímetros) e hoje dá o mesmo */
  function cotaTxt(vm) { return S.numeroCota(vm); }
  function nivelTxt(z) { return (z > 0.0005 ? "+" : (z < -0.0005 ? "-" : "±")) + br(Math.abs(z), 2); }
  function largTexto(s, h) { return S.largTexto(s, h); }
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
      if (status === "novo") return { cam: "ARQ-PAREDE-NOVO", fill: C.novo.fill, hach: null, fator: 2 };
      if (status === "demolido") return { cam: "ARQ-PAREDE-DEMOLIDO", fill: C.demolido.fill, hach: null, fator: 2 };
      return { cam: "ARQ-PAREDE-EXISTENTE", fill: C.existente.fill, hach: null, fator: 2 };
    }
    if (modo === "fantasma") return { cam: "ARQ-CONTEXTO", fill: "#ececec", hach: null, fator: 1 };
    if (modo === "humanizada") return { cam: "ARQ-HUM", fill: "#3a3a3a", hach: null, fator: 1 };
    return { cam: "ARQ-PAREDE", fill: K.pocheEscuro, hach: null, fator: 2 };
  }
  /* ENCONTROS FECHADOS (R01, 29/10/2026 — pedido do Rogério na Casa 487: "os encontros das paredes precisam estar fechadinhos").
     Cada parede chega aqui como um retângulo eixo ± meia espessura; no canto em L as duas terminam no cruzamento dos EIXOS e
     sobra o DENTE do canto de fora (meia × meia espessura); no T que ficou 1–7 cm curto sobra uma fresta. Aqui cada ponta é
     estendida (nunca encolhida) até onde a outra parede a cobre: L → até a face de fora da outra; T → até o eixo da outra
     (fica dentro dela). Só estende quando o cruzamento dos eixos está a no máximo meia espessura da outra + 5 cm da ponta
     (a mesma régua do BimUniao.encontroL). Não mexe em paralelas (< 10°). Devolve cópias com `pts` novos. */
  function emendarParedes(paredes) {
    var G = GEO(), L = arr(paredes), TOL = 0.05;
    function eixo(w) { var c = Math.cos(num(w.rotY, 0)), s = -Math.sin(num(w.rotY, 0)); return { c: [num(w.cx, 0), num(w.cz, 0)], u: [c, s], h: num(w.comprimento, 0) / 2, t: num(w.espessura, 0) }; }
    var E = L.map(eixo), ext = L.map(function () { return [0, 0]; });
    L.forEach(function (w, i) {
      var a = E[i];
      if (!(a.h > 0)) return;
      [-1, 1].forEach(function (sg, k) {
        var P = [a.c[0] + sg * a.u[0] * a.h, a.c[1] + sg * a.u[1] * a.h], melhor = 0;
        E.forEach(function (b, j) {
          if (j === i || !(b.h > 0)) return;
          var cr = a.u[0] * b.u[1] - a.u[1] * b.u[0], s = Math.abs(cr);
          if (s < 0.17) return;
          var rx = b.c[0] - P[0], ry = b.c[1] - P[1];
          var lam = (rx * b.u[1] - ry * b.u[0]) / cr * sg;        /* da ponta de `a` até o cruzamento, para fora (+) ou para dentro (−) */
          var mu = (rx * a.u[1] - ry * a.u[0]) / cr;               /* posição do cruzamento ao longo de `b`, a partir do centro dela */
          var X = [P[0] + sg * a.u[0] * lam, P[1] + sg * a.u[1] * lam], m = (X[0] - b.c[0]) * b.u[0] + (X[1] - b.c[1]) * b.u[1];
          void mu;
          if (Math.abs(lam) > b.t / 2 / s + TOL) return;           /* a ponta não chega a encostar na faixa da outra */
          if (Math.abs(m) > b.h + a.t / 2 / s + TOL) return;      /* o cruzamento cai fora do comprimento da outra */
          var canto = Math.abs(m) >= b.h - a.t / 2 / s - TOL;      /* o cruzamento está na ponta da outra: canto em L */
          var alvo = lam + (canto ? b.t / 2 / s : 0);
          if (alvo > melhor) melhor = alvo;
        });
        ext[i][k] = melhor;
      });
    });
    return L.map(function (w, i) {
      var e0 = ext[i][0], e1 = ext[i][1];
      if (!(e0 > 1e-4 || e1 > 1e-4)) return w;
      var a = E[i], o = {}; Object.keys(w).forEach(function (k) { o[k] = w[k]; });
      var comp = 2 * a.h + e0 + e1, dc = (e1 - e0) / 2;
      o.pts = G.retCaixa(a.c[0] + a.u[0] * dc, a.c[1] + a.u[1] * dc, comp, a.t, num(w.rotY, 0));
      o.emendada = true;
      return o;
    });
  }
  /* as paredes em poché: contorno largo + miolo (a passada 2 apaga a metade de dentro do contorno e as emendas) */
  function paredesPlanta(D, M, paredes, modo) {
    var grupos = {};
    paredes = emendarParedes(paredes);
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
  /* "MURO H=2,90 m" ao longo de cada muro de divisa (o manual: "MURO H=1,50m"), do lado de fora do eixo quando houver lugar livre */
  function rotulosMuros(D, M, muros) {
    var fmt = function (v) { return (Math.round(v * 100) / 100).toFixed(2).replace(".", ","); };
    arr(muros).forEach(function (w) {
      if (!(w.comprimento > 2)) return;
      var c = Math.cos(num(w.rotY, 0)), s = -Math.sin(num(w.rotY, 0)), h = w.comprimento / 2;
      var a = M.P(w.cx - c * h, w.cz - s * h), b = M.P(w.cx + c * h, w.cz + s * h), m = M.P(w.cx, w.cz);
      var ang = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
      if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
      var rad = ang * Math.PI / 180, nx = -Math.sin(rad), ny = Math.cos(rad), tx = "MURO H=" + fmt(w.altura) + " m", ok = false;
      var wt = largTexto(tx, 1.8);
      [0.5, 0.3, 0.7, 0.15, 0.85].forEach(function (f) {
        [1, -1].forEach(function (sg) {
          if (ok) return;
          var off = (w.espessura * M.k) / 2 + 1.6, px = a[0] + (b[0] - a[0]) * f + nx * off * sg, py = a[1] + (b[1] - a[1]) * f + ny * off * sg;
          var cr = D.caixaTexto ? null : null; void cr;
          var hx = Math.abs(Math.cos(rad)) * wt / 2 + Math.abs(Math.sin(rad)) * 1.4, hy = Math.abs(Math.sin(rad)) * wt / 2 + Math.abs(Math.cos(rad)) * 1.4;
          if (D.livre([px - hx, py - hy, px + hx, py + hy], 0.3)) { D.texto(px, py, tx, 1.8, { al: "C", rot: ang, meio: true }); ok = true; }
        });
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
      var camJ = camVao(modo, v.status, "ARQ-BATENTE");   /* o batente em pena de bancada/batente; a folha e as linhas da janela em pena de esquadria */
      D.linha(Q(-h, -e2)[0], Q(-h, -e2)[1], Q(-h, e2)[0], Q(-h, e2)[1], camJ); D.linha(Q(h, -e2)[0], Q(h, -e2)[1], Q(h, e2)[0], Q(h, e2)[1], camJ);
      var corre = /correr/i.test(v.famId);
      if (v.tipo === "janela") {
        [-e2 / 3, e2 / 3].forEach(function (b) { var a1 = Q(-h, b), a2 = Q(h, b); D.linha(a1[0], a1[1], a2[0], a2[1], camB); });
        var m1 = Q(-h, -e2), m2 = Q(h, -e2); D.linha(m1[0], m1[1], m2[0], m2[1], camB); var m3 = Q(-h, e2), m4 = Q(h, e2); D.linha(m3[0], m3[1], m4[0], m4[1], camB);
      } else if (corre) {
        var q1 = Q(-h, -e2 / 3), q2 = Q(0, -e2 / 3), q3 = Q(0, e2 / 3), q4 = Q(h, e2 / 3);
        D.linha(q1[0], q1[1], q2[0], q2[1], camB); D.linha(q3[0], q3[1], q4[0], q4[1], camB);
        var s1 = Q(-h, e2), s2 = Q(h, e2); D.linha(s1[0], s1[1], s2[0], s2[1], camB);
      } else {
        /* o lado e a mão da família (js/familiasra.js, o mesmo do 3D e do js/simboloporta.js): Abre_para_fora → a folha abre
           para +z local (a normal nv); Mao_direita → a dobradiça em +x local. Até 25/10/2026 o arco saía do lado −z e sempre
           com a dobradiça em −x: na prancha as portas dos quartos abriam para a circulação e a de entrada para a rua, ao
           contrário do modelo */
        var lado = v.abreFora ? 1 : -1, sH = v.maoDireita ? 1 : -1, H = Q(sH * h, 0), tip = Q(sH * h, lado * v.largura);
        D.linha(H[0], H[1], tip[0], tip[1], camB);   /* a folha aberta a 90° */
        var arc = [];
        for (var i = 0; i <= 14; i++) { var t = i / 14 * Math.PI / 2, pa = Q(sH * (h - v.largura * Math.sin(t)), lado * v.largura * Math.cos(t)); arc.push(pa); }
        D.poli(arc, camA, false);
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
      if (!nSol && m.simbolo && (arr(m.simbolo.copa).length || m.simbolo.faixa)) {
        /* planta de paisagismo: o símbolo de copa (círculos de projeção) ou a faixa de forração no lugar da caixa que envolve a peça inteira */
        arr(m.simbolo.copa).forEach(function (cp) { var q = W(cp.x, cp.z); D.circ(q[0], q[1], Math.max(0.8, cp.r * M.k), cam); });
        arr(m.simbolo.tronco).forEach(function (tr) { var q = W(tr.x, tr.z); D.circ(q[0], q[1], Math.max(0.3, tr.r * M.k), cam); });
        if (m.simbolo.faixa) { var fa = m.simbolo.faixa, hw = (fa.larg || 1) / 2, hp = (fa.prof || 1) / 2; D.poli([W(fa.x - hw, fa.z - hp), W(fa.x + hw, fa.z - hp), W(fa.x + hw, fa.z + hp), W(fa.x - hw, fa.z + hp)], cam, true); }
        nSol++;
      }
      if (!nSol) D.poli(polyPapel(M, m.pts), cam, true);
    });
  }

  /* ------------------------------------------------------------ COTAS (padrão `cota`: marca em ponto + cruz, texto a 1,04 mm da linha, número ".79") */
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
  /* o denominador da escala do mapa (1:50 → 50): dele vêm a altura do texto e o afastamento entre cadeias */
  function escDe(M) { return Math.round(1000 / M.k); }
  function escalaCota(D, den) { D.escCota = den > 0 ? den : 50; return D.escCota; }
  function tabelaParedes(paredes) { var m = {}; paredes.forEach(function (w) { m[w.id] = w; }); return m; }
  /* COTAS EXTERNAS DA PRANCHA = a regra do BIM (js/bimplanta.js ladosPlanta), só da EDIFICAÇÃO: por lado, os cantos de fora + as faces das paredes
     internas que chegam à fachada, e o total por fora; muro, divisa e parede solta no terreno ficam de fora (paredesDaEdificacao, com os ambientes
     em o.ambientes). A CADEIA DE VÃOS da fachada (as esquadrias da parede de fora) fica mais perto da parede; só a mais próxima leva linha de chamada
     (curta); as outras flutuam, só com as marcas (como no caderno de referência). Parede fora de esquadro não entra (como no BIM). */
  function cotasExternas(D, M, paredes, vaos, o) {
    o = o || {};
    var G = GEO(), B = BP(), W = paredes.filter(ortogonal);
    if (!W.length || !B || !B.ladosPlanta) return 0;
    var den = escalaCota(D, escDe(M)), a1 = S.afastamento1(), entre = S.entreCadeias(den), pid = tabelaParedes(paredes), qtd = 0, tol = 0.05;
    var aabb = W.map(function (w) { var b = G.bbox(w.pts); return { minx: b[0], minz: b[1], maxx: b[2], maxz: b[3], w: w }; }), lista = aabb;
    var amb = arr(o.ambientes).filter(function (a) { return a && arr(a.pts).length >= 3; }).map(function (a) { return { pts: a.pts.map(function (p) { return { x: p[0], z: p[1] }; }) }; });
    if (amb.length && B.paredesDaEdificacao) { var ed = B.paredesDaEdificacao(aabb, amb, 0.3); if (ed.paredes.length) lista = ed.paredes; }
    var LD = B.ladosPlanta(lista, {}), SG = { topo: 1, base: -1, esq: 1, dir: -1 };
    ["topo", "base", "esq", "dir"].forEach(function (lado) {
      var C = LD[lado]; if (!C || !C.ticks || C.ticks.length < 2) return;
      var face = LD.faces[lado], horiz = lado === "topo" || lado === "base", sg = SG[lado], U = C.ticks.slice(), u0 = U[0], u1 = U[U.length - 1], vs = [], cadeias = [];
      arr(vaos).forEach(function (v) {
        var w = pid[v.parede]; if (!w || (Math.abs(Math.sin(w.rotY)) < 0.02) !== horiz) return;
        var b = G.bbox(w.pts), coord = horiz ? (lado === "topo" ? b[1] : b[3]) : (lado === "esq" ? b[0] : b[2]), c = horiz ? v.x : v.z;
        if (Math.abs(coord - face) > tol) return;
        vs.push(c - v.largura / 2, c + v.largura / 2);
      });
      var uv = unicos([u0, u1].concat(vs.filter(function (x) { return x > u0 + 0.02 && x < u1 - 0.02; })), 0.04);
      if (vs.length && uv.length > 2) cadeias.push(uv);
      if (U.length > 2) cadeias.push(U);
      cadeias.push([u0, u1]);
      var of = a1 * sg;
      cadeias.forEach(function (P0, i) {
        var P = podar(P0, M.k); if (P.length < 2) return;
        var pp, vals = [];
        if (horiz) { pp = P.map(function (u) { return M.P(u, face); }); for (var a = 0; a + 1 < P.length; a++) vals.push(cotaTxt(P[a + 1] - P[a])); }
        else { P = P.slice().reverse(); pp = P.map(function (u) { return M.P(face, u); }); for (var b2 = 0; b2 + 1 < P.length; b2++) vals.push(cotaTxt(P[b2] - P[b2 + 1])); }   /* de baixo para cima: o número da cota vertical se lê de baixo para cima */
        var r = D.cadeia(pp, of, vals, { offs: [of + sg * 4.5, of + sg * 7], semExt: i > 0, desde: pp.map(function () { return S.COTA.linha_de_chamada.do_objeto_mm; }) });
        of = (typeof r === "number" ? r : of) + sg * entre; qtd++;
      });
      (D._cotaLado = D._cotaLado || {})[lado] = { of: of, face: face };   /* onde a próxima cadeia (as das divisas) começa */
    });
    return qtd;
  }
  /* R01 — COTAS ATÉ AS DIVISAS (manual p.9: "cotas de todos os ambientes, passando de uma extremidade a outra do terreno"): depois das cadeias da edificação,
     uma cadeia do lote à edificação e de volta ao lote (os recuos) e outra com o lote inteiro, em cada lado. lote e edif = [x0, z0, x1, z1]. */
  function cotasDivisas(D, M, lote, edif) {
    var L = D._cotaLado; if (!L || !lote || !edif) return 0;
    var den = escalaCota(D, escDe(M)), entre = S.entreCadeias(den), qtd = 0;
    [["topo", 1, true], ["base", -1, true], ["esq", 1, false], ["dir", -1, false]].forEach(function (q) {
      var lado = q[0], sg = q[1], horiz = q[2], I = L[lado]; if (!I) return;
      var a0 = horiz ? 0 : 1, a1 = horiz ? 2 : 3, ps = [lote[a0], edif[a0], edif[a1], lote[a1]].sort(function (x, y) { return x - y; }), of = S.afastamento1() * sg, faceL0;
      /* a cadeia fica FORA do lote (a divisa/muro é a referência), como no manual */
      var faceL = lado === "topo" ? lote[1] : (lado === "base" ? lote[3] : (lado === "esq" ? lote[0] : lote[2])), cx = M.caixa;
      /* só quando a divisa/muro faz parte do quadro da planta (a margem de cotas fica junto dela); sem muro a cadeia cairia longe do desenho */
      /* se a edificação encosta na divisa, as cadeias do lote continuam DEPOIS das dela (não se cruzam) */
      if (Math.abs(faceL - I.face) < 1.0) of = I.of;
      if (Math.abs(faceL - (lado === "topo" ? cx[1] : (lado === "base" ? cx[3] : (lado === "esq" ? cx[0] : cx[2])))) > 0.3) return;
      if (lote[a0] < (horiz ? cx[0] : cx[1]) - 0.3 || lote[a1] > (horiz ? cx[2] : cx[3]) + 0.3) return;   /* o lote inteiro tem de caber no quadro da planta */
      var cads = [unicos(ps, 0.04), [lote[a0], lote[a1]]];
      cads.forEach(function (P0, i) {
        var P = podar(P0, M.k); if (P.length < 2) return;
        var fp = horiz ? M.P(0, faceL)[1] : M.P(faceL, 0)[0], disp = lado === "topo" ? fp - (M.oy - K.margemCotas) : (lado === "base" ? (M.oy + M.alt + K.margemCotas) - fp : (lado === "esq" ? fp - (M.ox - K.margemCotas) : (M.ox + M.larg + K.margemCotas) - fp));
        if (Math.abs(of) + 9 > disp) return;   /* sem lugar na margem da folha: a cadeia não entra (nada sai da moldura nem passa por cima do título) */
        var pp, vals = [];
        if (horiz) { pp = P.map(function (u) { return M.P(u, faceL); }); for (var a = 0; a + 1 < P.length; a++) vals.push(cotaTxt(P[a + 1] - P[a])); }
        else { P = P.slice().reverse(); pp = P.map(function (u) { return M.P(faceL, u); }); for (var b2 = 0; b2 + 1 < P.length; b2++) vals.push(cotaTxt(P[b2] - P[b2 + 1])); }
        var r = D.cadeia(pp, of, vals, { offs: [of + sg * 4.5, of + sg * 7], semExt: i > 0, desde: pp.map(function () { return S.COTA.linha_de_chamada.do_objeto_mm; }) });
        of = (typeof r === "number" ? r : of) + sg * entre; qtd++;
      });
    });
    return qtd;
  }
  /* R01 — símbolo de NÍVEL do piso em cada ambiente (manual p.9: ▼ +0,50) e X do PÉ-DIREITO DUPLO (manual p.10: "marcação de X quando há pé-direito duplo") */
  function niveisAmbientes(D, M, ambientes, o) {
    o = o || {}; var sem = [], G = GEO();
    arr(ambientes).forEach(function (a) {
      if (!a || arr(a.pts).length < 3) return;
      var P = a.pts.map(function (p) { return M.P(p[0], p[1]); }), bb = G.bbox(P), cen = G.centroide(P);
      if (num(a.pe, 0) >= (o.peDuplo || 3.6)) {
        var m = 1.2; D.linha(bb[0] + m, bb[1] + m, bb[2] - m, bb[3] - m, "ARQ-FINA"); D.linha(bb[2] - m, bb[1] + m, bb[0] + m, bb[3] - m, "ARQ-FINA");
      }
      var t = nivelTxt(num(a.base, 0)), w = largTexto(t, 2.2) + 4, pos = [[0, 7], [0, -7], [10, 0], [-10, 0], [0, 12], [0, -12]], ok = false;
      for (var i = 0; i < pos.length && !ok; i++) {
        var x = cen[0] + pos[i][0], y = cen[1] + pos[i][1];
        if (!G.pontoEmPol([x, y], P)) continue;
        if (D.livre([x - 4, y - 5, x + w + 8, y + 3], 0.3)) { D.nivel(x, y, t, 1); ok = true; }
      }
      /* R02 — último recurso (diagramar como o manual): o nível entra mesmo sem vão livre, sobre fundo branco, no ponto mais perto do centro que
         esteja DENTRO do ambiente e não pise em outro texto; só não entra se nem assim houver lugar (ambiente minúsculo) */
      if (!ok && o.forcar !== false) {
        var best = null, bd = 1e9;
        for (var gx = -14; gx <= 14 && !ok; gx += 2) for (var gy = -14; gy <= 14; gy += 2) {
          var x2 = cen[0] + gx, y2 = cen[1] + gy, cx2 = [x2 - 4, y2 - 5, x2 + w + 8, y2 + 3];
          if (!G.pontoEmPol([x2, y2], P) || !G.pontoEmPol([x2 + w + 6, y2], P) || !G.pontoEmPol([x2, y2 - 4], P)) continue;
          if (arr(D.tb).some(function (tb) { return cruzaCaixa(tb, cx2, 0.1); })) continue;
          var dd = gx * gx + gy * gy; if (dd < bd) { bd = dd; best = [x2, y2, cx2]; }
        }
        if (best) { mascara(D, best[2]); D.nivel(best[0], best[1], t, 1); ok = true; }
      }
      if (!ok) sem.push(a.nome);
    });
    return sem;
  }
  /* R02 — MÁSCARA: retângulo branco por trás de um texto que ficou sobre traço de desenho (o manual faz isso). Registra a caixa para o conferir() não contar como defeito. */
  function mascara(D, b) {
    D.add('<rect x="' + n(b[0]) + '" y="' + n(b[1]) + '" width="' + n(b[2] - b[0]) + '" height="' + n(b[3] - b[1]) + '" fill="#fff" stroke="none"/>');
    (D.mascaras = D.mascaras || []).push(b);
  }
  /* R02 — rótulo de uma linha no lugar livre mais perto de `pt` (e dentro de `poli`, se vier); sem lugar livre entra sobre FUNDO BRANCO onde não pise em outro texto.
     devolve true/false (false = nem assim coube). */
  function rotuloLivre(D, pt, texto, h, poli) {
    var G = GEO(), w = largTexto(texto, h), tentativas = [], gx, gy;
    for (gx = -30; gx <= 30; gx += 3) for (gy = -30; gy <= 30; gy += 3) tentativas.push([gx, gy, gx * gx + gy * gy]);
    tentativas.sort(function (a, b) { return a[2] - b[2]; });
    function caixa(t) { var x = pt[0] + t[0], y = pt[1] + t[1]; return [x - w / 2 - 0.4, y - h * 0.9, x + w / 2 + 0.4, y + h * 0.3]; }
    function dentro(b) { return !poli || (G.pontoEmPol([b[0], b[1]], poli) && G.pontoEmPol([b[2], b[1]], poli) && G.pontoEmPol([b[0], b[3]], poli) && G.pontoEmPol([b[2], b[3]], poli)); }
    var i, b;
    for (i = 0; i < tentativas.length; i++) { b = caixa(tentativas[i]); if (dentro(b) && D.livre(b, 0.2)) { D.texto(pt[0] + tentativas[i][0], pt[1] + tentativas[i][1], texto, h, { al: "C" }); return true; } }
    for (i = 0; i < tentativas.length; i++) {
      b = caixa(tentativas[i]); if (!dentro(b) || arr(D.tb).some(function (tb) { return cruzaCaixa(tb, b, 0.1); })) continue;
      mascara(D, b);
      D.texto(pt[0] + tentativas[i][0], pt[1] + tentativas[i][1], texto, h, { al: "C" }); return true;
    }
    return false;
  }
  /* duas caixas [x0, y0, x1, y1] se tocam (folga g) */
  function cruzaCaixa(a, b, g) { return a[0] < b[2] + g && a[2] > b[0] - g && a[1] < b[3] + g && a[3] > b[1] - g; }
  /* COTAS INTERNAS: em todo ambiente, DENTRO, o vão livre face a face (o do BIM: BimPlanta.cotasInternas mede de verdade e desvia de móvel e louça; vale
     para o ortogonal em L/T). A linha é flutuante (só as marcas); se o número não couber no lugar escolhido, a linha anda dentro do ambiente retangular
     até achar lugar livre. o.moveis = o que está no chão (obstáculo); o.semLugar (lista) recebe os ambientes que ficaram sem cota e o.cruza os que só acharam lugar com a linha por cima de móvel. */
  function cotasInternas(D, M, ambientes, o) {
    o = o || {};
    var G = GEO(), B = BP(), q = 0;
    if (!B || !B.cotasInternas) return 0;
    var den = escalaCota(D, escDe(M)), h = S.alturaCota(den), sobe = S.COTA.texto_acima_da_linha_mm, k = M.k, lado = S.COTA.texto_ao_lado_vertical_mm;
    var margem = Math.max(0.25, (h * 0.76 + sobe + 0.8) / k);
    var obst = arr(o.moveis).map(function (m) { var b = G.bbox(m.pts); return b ? { minx: b[0], minz: b[1], maxx: b[2], maxz: b[3] } : null; }).filter(function (x) { return !!x; });
    arr(ambientes).forEach(function (a) {
      var pts = arr(a.pts); if (pts.length < 3) return;
      var R = B.cotasInternas([{ nome: a.nome, pts: pts.map(function (p) { return { x: p[0], z: p[1] }; }) }], { obstaculos: obst, margem: margem });
      var bb = a.bbox || G.bbox(pts), retang = !!bb && Math.abs(G.areaPol(pts) - (bb[2] - bb[0]) * (bb[3] - bb[1])) < 0.05, feitas = 0;
      var feitasAmb = [];   /* decide as duas cotas do ambiente ANTES de desenhar (uma não conta como obstáculo da outra: cruzam-se no vão) */
      /* R02: ambiente aberto/sem parede dos quatro lados (garagem coberta): o BIM não acha face a face; se o contorno é quase um retângulo, a cota é a do próprio contorno (largura e altura) */
      var lista = R.cotas;
      if (!arr(lista).length && o.forcar !== false && bb && Math.abs(G.areaPol(pts) - (bb[2] - bb[0]) * (bb[3] - bb[1])) < 0.12 * (bb[2] - bb[0]) * (bb[3] - bb[1])) {
        var cxm = (bb[0] + bb[2]) / 2, czm = (bb[1] + bb[3]) / 2;
        lista = [{ tipo: "larg", a: bb[0], b: bb[2], fixo: czm, v: bb[2] - bb[0] }, { tipo: "alt", a: bb[1], b: bb[3], fixo: cxm, v: bb[3] - bb[1] }];
      }
      lista.forEach(function (c) {
        var val = cotaTxt(c.v), tw = S.largTexto(val, h), horiz = c.tipo === "larg", lo = horiz ? bb[1] : bb[0], hi = horiz ? bb[3] : bb[2], melhor = null, segundo = null;
        if (tw + 1.0 > c.v * k) return;
        /* a linha do BIM primeiro; depois, no ambiente retangular, as paralelas de 5 em 5 cm, da mais perto para a mais longe */
        var desl = [0]; if (retang) { for (var j = 1; j <= 60; j++) desl.push(0.05 * j, -0.05 * j); }
        for (var i = 0; i < desl.length && !melhor; i++) {
          var f = c.fixo + desl[i]; if (f < lo + margem - 1e-6 || f > hi - margem + 1e-6) continue;
          var A0 = horiz ? M.P(c.a, f) : M.P(f, c.b), A1 = horiz ? M.P(c.b, f) : M.P(f, c.a), mid = [(A0[0] + A1[0]) / 2, (A0[1] + A1[1]) / 2], box, tira;
          if (horiz) { box = [mid[0] - tw / 2 - 0.3, A0[1] - sobe - h * 0.76 - 0.2, mid[0] + tw / 2 + 0.3, A0[1] + 0.5]; tira = [A0[0] + 0.6, A0[1] - 0.3, A1[0] - 0.6, A0[1] + 0.3]; }
          else { box = [A0[0] - lado - h * 0.76 - 0.2, mid[1] - tw / 2 - 0.3, A0[0] + 0.5, mid[1] + tw / 2 + 0.3]; tira = [A0[0] - 0.3, A1[1] + 0.6, A0[0] + 0.3, A0[1] - 0.6]; }
          if (!D.livre(box, 0.2)) continue;
          /* a linha da cota nunca atravessa um texto já escrito (rótulo, marcador, número de outra cota): com `segundo` ela só cruza traço de móvel */
          if (arr(D.tb).some(function (tb) { return cruzaCaixa(tb, tira, 0.1); })) continue;
          /* a outra cota do mesmo ambiente (ainda não desenhada): nem o número de uma sobre a linha da outra */
          var choca = feitasAmb.some(function (f) { return cruzaCaixa(f.tira, box, 0.2) || cruzaCaixa(tira, f.box, 0.2); });
          if (choca) continue;
          var cand = { A0: A0, A1: A1, box: box, tira: tira };
          if (D.livre(tira, 0.05)) melhor = cand; else if (!segundo) segundo = cand;   /* segundo: o número livre, mas a linha cruza móvel */
        }
        /* R02 — último recurso: o número entra sobre FUNDO BRANCO por cima de linha de móvel (como o manual faz), desde que não pise em outro texto
           e a linha esteja DENTRO do ambiente (vale também para ambiente em L/T, onde só a linha do BIM era tentada) */
        if (!melhor && !segundo && o.forcar !== false) {
          var dl2 = [0]; for (var j2 = 1; j2 <= 80; j2++) dl2.push(0.05 * j2, -0.05 * j2);
          for (var i2 = 0; i2 < dl2.length && !segundo; i2++) {
            var f2 = c.fixo + dl2[i2];
            var B0 = horiz ? [c.a, f2] : [f2, c.b], B1 = horiz ? [c.b, f2] : [f2, c.a];
            if (!G.pontoEmPol([(B0[0] + B1[0]) / 2, (B0[1] + B1[1]) / 2], pts) || !G.pontoEmPol([B0[0] * 0.75 + B1[0] * 0.25, B0[1] * 0.75 + B1[1] * 0.25], pts) || !G.pontoEmPol([B0[0] * 0.25 + B1[0] * 0.75, B0[1] * 0.25 + B1[1] * 0.75], pts)) continue;
            var A0b = M.P(B0[0], B0[1]), A1b = M.P(B1[0], B1[1]), mid2 = [(A0b[0] + A1b[0]) / 2, (A0b[1] + A1b[1]) / 2], box2, tira2;
            if (horiz) { box2 = [mid2[0] - tw / 2 - 0.3, A0b[1] - sobe - h * 0.76 - 0.2, mid2[0] + tw / 2 + 0.3, A0b[1] + 0.5]; tira2 = [A0b[0] + 0.6, A0b[1] - 0.3, A1b[0] - 0.6, A0b[1] + 0.3]; }
            else { box2 = [A0b[0] - lado - h * 0.76 - 0.2, mid2[1] - tw / 2 - 0.3, A0b[0] + 0.5, mid2[1] + tw / 2 + 0.3]; tira2 = [A0b[0] - 0.3, A1b[1] + 0.6, A0b[0] + 0.3, A0b[1] - 0.6]; }
            if (arr(D.tb).some(function (tb) { return cruzaCaixa(tb, box2, 0.1) || cruzaCaixa(tb, tira2, 0.1); })) continue;
            if (feitasAmb.some(function (f) { return cruzaCaixa(f.tira, box2, 0.2) || cruzaCaixa(tira2, f.box, 0.2); })) continue;
            segundo = { A0: A0b, A1: A1b, box: box2, tira: tira2, mascara: true };
          }
        }
        var esc1 = melhor || segundo;
        if (!esc1) return;
        feitasAmb.push({ c: esc1, val: val, cruza: !melhor, box: esc1.box, tira: esc1.tira });
      });
      feitasAmb.forEach(function (f) {
        if (f.c.mascara) mascara(D, f.box);
        D.cota(f.c.A0[0], f.c.A0[1], f.c.A1[0], f.c.A1[1], 0, f.val, { desde: [false, false], semExt: true }); q++; feitas++;
        if (f.cruza && o.cruza && o.cruza.indexOf(a.nome) < 0) o.cruza.push(a.nome);
      });
      if (!feitas && o.semLugar) o.semLugar.push(a.nome);
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
      var nome = { t: txt(a.nome).toUpperCase(), h: K.hLetra.rotulo }, ar = { t: "A = " + br(a.area, 2) + " m²" }, piso = { t: "Piso: " + a.piso }, pe = { t: "PD = " + br(a.pe, 2) + " m" };
      var jogos = [];
      if (o.completo) jogos.push([nome, ar, a.piso ? piso : null, pe]);
      jogos.push([nome, ar], [nome]);
      var cc = rotuloBloco(D, c, null, area, { jogos: jogos.map(function (j) { return j.filter(function (x) { return !!x; }); }), h: 2.4 });
      /* R02: sem lugar livre para o bloco inteiro, o NOME entra sobre máscara dentro do ambiente (a área e o piso estão no quadro de acabamentos) */
      if (!cc && o.forcar !== false) cc = rotuloLivre(D, c, txt(a.nome).toUpperCase(), 2.4, arr(a.pts).map(function (p) { return M.Pp(p); }));
      if (!cc) semLugar.push(a.nome);
    });
    return semLugar;
  }
  /* etiquetas P1 / J1 junto de cada vão, do lado de fora da parede se houver lugar livre */
  function etiquetasVaos(D, M, vaos, paredesPorId, o) {
    var h = K.hLetra.vao, semLugar = [], med = !!(o && o.medidas);
    vaos.forEach(function (v) {
      var w = paredesPorId[v.parede]; if (!w) return;
      /* R01 (planta de esquadrias, manual p.18): a sigla leva a medida do vão ao lado, "J3  1,50 x 1,20 / 1,10" (largura x altura / peitoril) */
      var cod0 = v.cod; if (med) { var f2 = function (z) { return (Math.round(z * 100) / 100).toFixed(2).replace(".", ","); }; var v2 = {}; Object.keys(v).forEach(function (kk) { v2[kk] = v[kk]; }); v2.cod = v.cod + " " + f2(v.largura) + "x" + f2(v.altura) + (v.tipo === "janela" ? "/" + f2(v.peitoril) : ""); v = v2; } void cod0;
      var th = num(v.rotY, w.rotY), nv = [Math.sin(th), Math.cos(th)], d = w.espessura / 2 + (h * 0.9 + 1.3) / M.k, wt = largTexto(v.cod, h);
      var cands = [1, -1, 2, -2].concat(med ? [3, -3, 4, -4] : []).map(function (s) { var fk = Math.abs(s) === 2 ? 1.9 : (Math.abs(s) === 3 ? 3.0 : (Math.abs(s) === 4 ? 4.2 : 1)); return M.P(v.x + nv[0] * d * fk * (s > 0 ? 1 : -1), v.z + nv[1] * d * fk * (s > 0 ? 1 : -1)); });
      var ok = false;
      for (var i = 0; i < cands.length && !ok; i++) {
        var c = cands[i];
        if (D.livre([c[0] - wt / 2, c[1] - h * 0.5, c[0] + wt / 2, c[1] + h * 0.5], 0.25)) { D.texto(c[0], c[1], v.cod, h, { al: "C", meio: true }); ok = true; }
      }
      /* R02 — último recurso: a sigla entra sobre fundo branco no ponto mais perto do vão (do lado de fora, depois dentro) que não pise em outro texto */
      if (!ok && !(o && o.forcar === false)) {
        var ord = [1, -1, 1.5, -1.5, 2.2, -2.2, 3, -3], tan = [0, 1, -1, 2, -2], oj = [];
        ord.forEach(function (q) { tan.forEach(function (tt) { oj.push([q, tt]); }); });
        for (var j = 0; j < oj.length && !ok; j++) {
          var c2 = M.P(v.x + nv[0] * d * oj[j][0] + Math.cos(th) * wt / M.k * 0.55 * oj[j][1], v.z + nv[1] * d * oj[j][0] - Math.sin(th) * wt / M.k * 0.55 * oj[j][1]), bx2 = [c2[0] - wt / 2, c2[1] - h * 0.5, c2[0] + wt / 2, c2[1] + h * 0.5];
          if (arr(D.tb).some(function (tb) { return cruzaCaixa(tb, bx2, 0.1); })) continue;
          mascara(D, [bx2[0] - 0.2, bx2[1] - 0.1, bx2[2] + 0.2, bx2[3] + 0.1]);
          D.texto(c2[0], c2[1], v.cod, h, { al: "C", meio: true }); ok = true;
        }
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
    /* R02 — SÍMBOLO DO MANUAL (p.11): na ponta da linha, um CÍRCULO com a letra repetida (AA / BB) e a SETA CHEIA do lado que se olha;
       o prolongamento da linha liga a ponta ao círculo. O círculo procura lugar livre ao longo do prolongamento. */
    [a, b].forEach(function (p, i) {
      var sx = i === 0 ? -ux : ux, sy = i === 0 ? -uy : uy;   /* sentido para fora da planta, ao longo da linha */
      D.linha(p[0], p[1], p[0] + nx * 4, p[1] + ny * 4, "ARQ-PAREDE");   /* o traço grosso da ponta (lado que se olha) */
      var h = 2.6, w = largTexto(letra + letra, h), r = Math.max(3.4, w / 2 + 0.9), ok = false, ds = [r + 6, r + 10, r + 14, r + 18], cx = 0, cy = 0, q;
      for (q = 0; q < ds.length && !ok; q++) {
        cx = p[0] + sx * ds[q]; cy = p[1] + sy * ds[q];
        if (D.livre([cx - r - 0.5, cy - r - 0.5, cx + r + 0.5, cy + r + 0.5], 0.3)) ok = true;
      }
      if (!ok) { cx = p[0] + sx * ds[0]; cy = p[1] + sy * ds[0]; }
      D.linha(p[0], p[1], cx - sx * r, cy - sy * r, "ARQ-CORTE");
      D.add('<circle cx="' + n(cx) + '" cy="' + n(cy) + '" r="' + n(r) + '" fill="#fff" stroke="none"/>');
      D.circ(cx, cy, r, "ARQ-SIMBOLO");
      D.texto(cx, cy + h * 0.36, letra + letra, h, { al: "C" });
      /* a seta cheia encostada no círculo, apontando para o lado que se olha */
      var bx = cx + nx * (r + 0.2), by = cy + ny * (r + 0.2), tx = cx + nx * (r + 3.6), ty = cy + ny * (r + 3.6), hw = 1.5;
      D.add('<polygon points="' + [tx, ty].map(function (v) { return n(v); }).join(",") + " " + [bx - ny * hw, by + nx * hw].map(function (v) { return n(v); }).join(",") + " " + [bx + ny * hw, by - nx * hw].map(function (v) { return n(v); }).join(",") + '" fill="#000" stroke="none" data-cam="ARQ-SIMBOLO"/>');
    });
  }
  /* a linha de corte de uma folha: a primeira coordenada candidata em que a linha (com as pontas) não cruza nenhum texto já escrito */
  function escolherLinhaCorte(D, M, ct, ext) {
    var cands = arr(ct.cands).length ? ct.cands : [ct.coord], pick = cands[0];
    for (var i = 0; i < cands.length; i++) {
      var q0 = ct.pu0 != null ? ct.pu0 : ct.u0, q1 = ct.pu1 != null ? ct.pu1 : ct.u1, c0 = cands[i], a = ct.eixo === "x" ? M.P(q0 - ext, c0) : M.P(c0, q0 - ext), b = ct.eixo === "x" ? M.P(q1 + ext, c0) : M.P(c0, q1 + ext);
      var ux = (b[0] - a[0]), uy = (b[1] - a[1]), L = hip(ux, uy), nx = uy / L, ny = -ux / L;
      /* as pontas inclinadas de 6 mm e o ponto da letra também não podem cair em texto */
      if (!D.cortaTexto(a[0], a[1], b[0], b[1]) && !D.cortaTexto(a[0], a[1], a[0] + nx * 22, a[1] + ny * 22) && !D.cortaTexto(b[0], b[1], b[0] + nx * 22, b[1] + ny * 22)) { pick = c0; break; }
    }
    return pick;
  }

  /* ------------------------------------------------------------ COLUNA DE NOTAS, MOLDURA, CARIMBO */
  /* a coluna de notas (padrão `fonte` + `legendas`): Verdana em MAIÚSCULAS (títulos, legendas e notas); `quadro` é o QUADRO DE LEGENDAS do demolir/construir
     (b.quadro = { itens: [{ t, fill }] }), que traz o título espaçado, as amostras e a OBS. */
  function colunaNotas(D, g, blocos) {
    var col = g.coluna, car = g.carimbo, x0 = col.x + 4, wmax = col.w - 7, yMax = car.y - 3, yMin = col.y + 4, T = D.E.T, hBase = S.TEXTOS.legenda;
    var tent = [hBase, hBase * 0.92, hBase * 0.84, hBase * 0.76, hBase * 0.68].filter(function (hh) { return hh >= T.minimo - 1e-9; }), esc0 = null, coube = true;
    if (tent[tent.length - 1] > T.minimo + 1e-9) tent.push(T.minimo);
    var hq = S.TEXTOS.legenda_titulo, Lg = S.LEGENDAS.demolir_construir;
    function itemTxt(it) { return S.maiusc((it && typeof it === "object") ? it.t : it); }
    function medir(h) {
      var tot = 0;
      blocos.forEach(function (b) {
        if (b.quadro) { tot += Lg.linha_titulo + arr(b.quadro.itens).length * Lg.linha + Lg.obs_abaixo + hBase * 0.76 + 0.8 + 3.5; return; }
        tot += hq * 0.76 + hq * 0.55 + 1.5;
        arr(b.itens).forEach(function (it, i) {
          var pre = b.numerar ? (i + 1) + "- " : "- ", rec = S.largTexto(pre, h);
          tot += S.quebrar(itemTxt(it), h, wmax - rec).length * h * 1.42 + 0.7;
        });
        tot += 3.5;
      });
      return tot;
    }
    for (var i = 0; i < tent.length; i++) { if (medir(tent[i]) <= yMax - yMin) { esc0 = tent[i]; break; } }
    if (!esc0) { esc0 = tent[tent.length - 1]; coube = false; }
    var h = esc0, y = yMax - medir(h);
    D.linha(col.x, col.y, col.x, car.y, "ARQ-MOLDURA");
    blocos.forEach(function (b) {
      if (b.quadro) {
        var r = S.quadroLegendas(D, x0, y, Math.min(Lg.largura, wmax), b.quadro.itens, {});
        y += r.h + 3.5; return;
      }
      D.texto(x0, y + hq * 0.76, S.maiusc(b.titulo), hq);
      y += hq * 0.76 + hq * 0.55 + 1.5;
      arr(b.itens).forEach(function (it, i) {
        var o = (it && typeof it === "object") ? it : { t: txt(it) }, pre = b.numerar ? (i + 1) + "- " : "- ", rec = S.largTexto(pre, h);
        var ls = S.quebrar(S.maiusc(o.t), h, wmax - rec);
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
      if (arr(D.mascaras).some(function (m) { var cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2; return cx >= m[0] - 0.6 && cx <= m[2] + 0.6 && cy >= m[1] - 0.6 && cy <= m[3] + 0.6; })) { if (janela && (b[0] < janela[0] - 0.01 || b[1] < janela[1] - 0.01 || b[2] > janela[2] + 0.01 || b[3] > janela[3] + 0.01)) out.foraJanela.push(t.s); return; }   /* R02: texto sobre máscara branca de propósito */
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

  var ArqDesenho = { K: K, estilo: estilo, novo: novo, atr: atr, pts: pts, fundoPol: fundoPol, mapa: mapa, polyPapel: polyPapel, br: br, cotaTxt: cotaTxt, cm1: cotaTxt, escalaCota: escalaCota, titulo: titulo, nivelTxt: nivelTxt, esc: esc, n: n,
    rotuloBloco: rotuloBloco, paredesPlanta: paredesPlanta, cotasDivisas: cotasDivisas, niveisAmbientes: niveisAmbientes, rotuloLivre: rotuloLivre, mascara: mascara, emendarParedes: emendarParedes, rotulosMuros: rotulosMuros, pilaresPlanta: pilaresPlanta, vaosPlanta: vaosPlanta, moveisPlanta: moveisPlanta, cotasExternas: cotasExternas, cotasInternas: cotasInternas,
    rotulosAmbientes: rotulosAmbientes, etiquetasVaos: etiquetasVaos, norte: norte, escalaGrafica: escalaGrafica, marcaCorte: marcaCorte, escolherLinhaCorte: escolherLinhaCorte, colunaNotas: colunaNotas, conferir: conferir,
    estiloParede: estiloParede, conv: conv, S: S, CAM_SEM_OBSTACULO: CAM_SEM_OBSTACULO, largTexto: largTexto };
  global.ArqDesenho = ArqDesenho;
  if (typeof module !== "undefined" && module.exports) module.exports = ArqDesenho;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
