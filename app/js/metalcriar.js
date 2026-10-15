/* =====================================================================
 * metalcriar.js — METÁLICA & MECÂNICA: CRIAR PEÇAS CLICANDO (motor PURO,
 * ES5, sem DOM, sem three.js, Node-testável). 12/10/2026.
 *
 * Pedido do Rogério: "quando for criar qualquer coisa na metálica e
 * mecânica, sem ser no assistente do galpão, quero que seja possível criar
 * na planta baixa e no 3D. Seleciono o perfil que quero utilizar, clico no
 * plano onde quero que ele fique […] se for só pelas coordenadas tem que
 * colocar onde está o eixo x, o y, a altura, dá mais trabalho."
 *
 * O QUE MORA AQUI (a tela é o js/metalcriarui.js)
 *   FERRAMENTAS ..... pilar (1 clique), viga, diagonal/contraventamento,
 *                     terça/travessa (2 cliques) e chapa (2 cantos);
 *   CATÁLOGO ........ busca por nome, série e fabricante (W, U, L, tubos,
 *                     Ue/U formados a frio, barras) — só o que o 3D desenha;
 *   GEOMETRIA ....... a peça a partir dos pontos clicados: giro da seção,
 *                     justificação (topo/centro/base e esquerda/centro/
 *                     direita) e espelhar; a peça sai com o rotY NO PLANO
 *                     (o eixo da barra é o X local), para a pegada na planta,
 *                     o mover, o girar e o espelhar valerem como nas outras
 *                     peças do editor;
 *   ENCAIXE 3D ...... os pontos notáveis do modelo (pontas, meio, centro,
 *                     cruzamento de eixos) e a escolha por PRIORIDADE (ponto
 *                     antes de construção, construção antes de "próximo") e
 *                     por distância na TELA;
 *   EDITAR .......... a peça refeita pelas Propriedades (perfil, giro,
 *                     comprimento, justificação, nível) → op `metalAjustar`
 *                     (js/metalpeca.js): desfaz/refaz como as outras;
 *   EIXOS ........... a grade de eixos de uma vez ("6; 6; 3x5") e as cotas
 *                     entre eixos paralelos (3D e planta).
 *
 * A peça guarda em `metal.cria` COMO nasceu (ferramenta, os dois pontos da
 * linha clicada em coordenadas LOCAIS — relativas ao centro, como o
 * `metal.o` —, giro, justificação, espelhar, nível): mover, girar e copiar
 * levam junto, e as Propriedades refazem a peça a partir dela.
 * Unidades: metros; ângulos em graus na tela, radianos no rotY.
 * Não é cálculo estrutural: a peça é geometria (o perfil é o escolhido).
 * Teste: node tools/test-metal-criar.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  function M() { return dep("BimMetal", "./metalpeca.js"); }
  function Aco() { return dep("PerfisAco", "./perfisaco.js"); }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : d; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function mul(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function unit(a) { var l = len(a); return l > 1e-12 ? mul(a, 1 / l) : null; }
  function V(o) { return Array.isArray(o) ? [num(o[0], 0), num(o[1], 0), num(o[2], 0)] : (o ? [num(o.x, 0), num(o.y, 0), num(o.z, 0)] : null); }
  function v3ok(p) { return Array.isArray(p) && p.length >= 3 && fin(+p[0]) && fin(+p[1]) && fin(+p[2]); }
  /* o giro do editor em volta de +Y: X local → (cos θ, 0, −sen θ) — o mesmo do js/metalpeca.js */
  function rotY(v, th) { var c = Math.cos(th), s = Math.sin(th); return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]; }
  /* ângulo NO PLANO de uma direção, na convenção do rotY: atan2(−dz, dx) */
  function angPlano(d) { return Math.atan2(-d[2], d[0]); }
  var UP = [0, 1, 0];

  /* ================================================================ FERRAMENTAS
   * `just` e `lado`: onde fica a LINHA CLICADA na seção. Viga: o topo da viga
   * na linha (a viga "pendura" do nível); terça: a base (apoia em cima da
   * viga); pilar, diagonal: o centro. */
  var FERRAMENTAS = {
    pilar:    { id: "pilar", rotulo: "Pilar", papel: "Pilar", ifc: "IFCCOLUMN", cliques: 1, perfil: "W250X32.7", just: "centro", lado: "centro", aco: "ASTM A572 Gr.50" },
    viga:     { id: "viga", rotulo: "Viga", papel: "Viga", ifc: "IFCBEAM", cliques: 2, perfil: "W250X25.3", just: "topo", lado: "centro", aco: "ASTM A572 Gr.50" },
    diagonal: { id: "diagonal", rotulo: "Diagonal / contraventamento", papel: "Contraventamento", ifc: "IFCMEMBER", cliques: 2, perfil: "L51X51X4.8", just: "centro", lado: "centro", aco: "ASTM A36" },
    terca:    { id: "terca", rotulo: "Terça / travessa", papel: "Terça", ifc: "IFCMEMBER", cliques: 2, perfil: "Ue 150 x 60 x 20 x 3,00", just: "base", lado: "centro", aco: "ASTM A36" },
    chapa:    { id: "chapa", rotulo: "Chapa", papel: "Chapa", ifc: "IFCPLATE", cliques: 2, t: 0.0125, aco: "ASTM A36" }
  };
  var JUST = { topo: 1, centro: 0, base: -1 };
  var LADO = { direita: 1, centro: 0, esquerda: -1 };

  /* ================================================================ CATÁLOGO */
  function norm(t) { var s = String(t == null ? "" : t).toUpperCase(); return typeof s.normalize === "function" ? s.normalize("NFD").replace(/[̀-ͯ]/g, "") : s; }
  function compacto(t) { return norm(t).replace(/[×*]/g, "X").replace(/,/g, ".").replace(/\s+/g, ""); }
  /* o 3D desenha a peça? (formado a frio: só Ue e U — o Z e a cantoneira dobrada ainda não) */
  function desenhavel(nome) {
    var A = Aco(); if (!A) return false;
    var p = A.paraPerfil(nome); if (!p) return false;
    if (p.forma === "frio") return p.tipoFrio === "Ue" || p.tipoFrio === "U";
    return true;
  }
  var _cacheCat = null;
  function catalogo() {
    if (_cacheCat) return _cacheCat;
    var A = Aco(), out = [];
    if (!A) return out;
    A.SERIES.forEach(function (s) {
      A.listar(s.id).forEach(function (nome) {
        if (!desenhavel(nome)) return;
        var o = A.obter(nome) || {};
        out.push({ nome: nome, serie: s.id, rotuloSerie: s.rotulo, fabricante: o.fabricante || s.fabricante || "", forma: s.forma, tipoFrio: s.tipoFrio || o.tipoFrio || "",
                   massa: fin(o.massa) ? o.massa : null, chave: compacto(nome), chaveSerie: norm(s.id + " " + s.rotulo + " " + (o.fabricante || s.fabricante || "")) });
      });
    });
    _cacheCat = out;
    return out;
  }
  /* "w250" · "gerdau w 250" · "ue 150" · "tubo 100" · "cantoneira" · "barra redonda":
     cada palavra tem de aparecer no NOME (sem espaço, x = ×) ou na série/fabricante.
     Ordem: nome que começa pelo texto, depois o resto, na ordem do catálogo. */
  var APELIDO = { TUBO: ["HSS", "TUBO", "TC", "TQ", "TR"], CANTONEIRA: ["L —", "CANTONEIRA"], BARRA: ["BARRA"], VIGA: ["W", "VS", "VE"], COLUNA: ["CS", "CVS", "CE"] };
  function buscarPerfis(texto, o) {
    o = o || {};
    var lim = o.limite || 40, L = catalogo(), q = norm(texto).trim();
    if (!q) return L.slice(0, lim);
    var palavras = q.split(/\s+/).filter(Boolean), qc = compacto(texto), inicio = [], resto = [];
    L.forEach(function (it) {
      if (o.forma && it.forma !== o.forma) return;
      var ok = palavras.every(function (w) {
        var wc = compacto(w);
        if (it.chave.indexOf(wc) >= 0 || it.chaveSerie.indexOf(w) >= 0) return true;
        var ap = APELIDO[w]; return !!(ap && ap.some(function (a) { return it.chaveSerie.indexOf(a) >= 0; }));
      }) || it.chave.indexOf(qc) >= 0;
      if (!ok) return;
      (it.chave.indexOf(qc) === 0 ? inicio : resto).push(it);
    });
    return inicio.concat(resto).slice(0, lim);
  }
  /* o nome do catálogo como ele está (aceita "w 250 x 25,3", "W250X25.3") */
  function perfilCat(nome) {
    var A = Aco(); if (!A || !nome) return null;
    var o = A.obter(nome); if (!o) return null;
    return desenhavel(o.nome) ? o.nome : null;
  }
  /* as medidas que justificam a peça: a ALTURA da seção (ao longo de ey) e a LARGURA (ex × ey) */
  function dimSecao(perfil) {
    var B = M(), s = B && B.secao ? B.secao(perfil) : null;
    if (s && s.ok) return { alt: s.alt, larg: s.larg, rotulo: s.rotulo };
    return null;
  }

  /* ================================================================ ORIENTAR
   * A peça nasce do js/metalpeca.js com rotY = 0 e os eixos no MUNDO. Aqui ela
   * passa a ter rotY = θ (o ângulo da barra no plano) e os eixos LOCAIS: o
   * mesmo sólido, mas a caixa envolvente (cx…espessura) fica alinhada à peça —
   * a pegada na planta é o retângulo da barra (não a caixa do mundo, que numa
   * diagonal pegava o clique a metros dela) e espelhar/girar valem. */
  function orientar(c, th) {
    var B = M(); if (!B || !c || !c.metal) return c;
    th = r6(num(th, 0));
    if (Math.abs(th) < 1e-9) return c;
    var m = c.metal, Cw = [c.cx, c.cy, c.cz], Ow = add(Cw, V(m.o)), pts = [];
    B.solidos(c).forEach(function (s) { s.poli.forEach(function (q) { pts.push(s.ponto(q[0], q[1], s.z0)); pts.push(s.ponto(q[0], q[1], s.z1)); }); });
    if (!pts.length) return c;
    var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    pts.forEach(function (p) { var l = rotY(sub(p, Ow), -th); for (var k = 0; k < 3; k++) { if (l[k] < mn[k]) mn[k] = l[k]; if (l[k] > mx[k]) mx[k] = l[k]; } });
    var cL = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2], C2 = add(Ow, rotY(cL, th));
    var o = clone(c), mm = o.metal;
    mm.ex = B.vet.O3(rotY(V(m.ex), -th)); mm.ey = B.vet.O3(rotY(V(m.ey), -th)); mm.o = B.vet.O3(mul(cL, -1));
    o.rotY = th; o.cx = r6(C2[0]); o.cy = r6(C2[1]); o.cz = r6(C2[2]);
    o.comprimento = r6(Math.max(0.001, mx[0] - mn[0])); o.altura = r6(Math.max(0.001, mx[1] - mn[1])); o.espessura = r6(Math.max(0.001, mx[2] - mn[2]));
    return o;
  }

  /* os eixos da seção para a barra a → b: X = a→b; Y = a "altura" da seção
     (alma vertical por padrão; numa barra vertical, +X do mundo, como o pilar
     do galpão), girada `giro` graus em volta de X */
  function eixosBarra(a, b, giro) {
    var X = unit(sub(b, a)); if (!X) return null;
    var Y0 = Math.abs(dot(X, UP)) > 0.999 ? [1, 0, 0] : unit(sub(UP, mul(X, dot(UP, X))));
    Y0 = unit(sub(Y0, mul(X, dot(Y0, X))));
    var Z0 = cross(X, Y0), f = num(giro, 0) * Math.PI / 180;
    var Y = unit(add(mul(Y0, Math.cos(f)), mul(Z0, Math.sin(f)))), Z = cross(X, Y);
    return { X: X, Y: Y, Z: Z, Y0: Y0, Z0: Z0 };
  }
  /* o giro (graus) que leva a seção padrão da barra a → b ao `Y` dado */
  function giroDe(a, b, Y) {
    var e = eixosBarra(a, b, 0); if (!e || !Y) return 0;
    var g = Math.atan2(dot(Y, e.Z0), dot(Y, e.Y0)) * 180 / Math.PI;
    return Math.round(g * 1e4) / 1e4;
  }

  /* ================================================================ BARRA
   * a, b = os pontos da LINHA CLICADA ([x,y,z]); o = { ferr, cat | perfil, giro
   * (graus), just ('topo'|'centro'|'base'), lado ('esquerda'|'centro'|'direita'),
   * espelhar, papel, ifc, aco, nivel {…} (só informação, vai em cria) }
   * → a caixa (op `criar`) ou { erro }. */
  function barra(a, b, o) {
    o = o || {};
    var B = M(), A = Aco(); if (!B || !A) return { erro: "Os motores da metálica (js/metalpeca.js, js/perfisaco.js) não carregaram." };
    a = V(a); b = V(b);
    if (!a || !b || !v3ok(a) || !v3ok(b)) return { erro: "Pontos inválidos." };
    var L = len(sub(b, a)); if (!(L > 0.01)) return { erro: "Os dois pontos são o mesmo: clique o fim da peça mais longe do início." };
    if (L > 60) return { erro: "Peça com mais de 60 m: divida em trechos." };
    var F = FERRAMENTAS[o.ferr] || FERRAMENTAS.viga;
    var perfil = o.perfil && o.perfil.forma ? clone(o.perfil) : (o.cat ? A.paraPerfil(perfilCat(o.cat) || o.cat) : null);
    if (!perfil) return { erro: "Perfil não encontrado no catálogo: " + (o.cat || "?") + "." };
    if (perfil.forma === "frio" && !(perfil.tipoFrio === "Ue" || perfil.tipoFrio === "U")) return { erro: "Perfil formado a frio " + perfil.tipoFrio + ": o 3D desenha só Ue e U." };
    var ds = dimSecao(perfil); if (!ds) return { erro: "A seção do perfil " + (perfil.cat || perfil.forma) + " não fecha." };
    var e = eixosBarra(a, b, o.giro); if (!e) return { erro: "Pontos inválidos." };
    var jy = JUST[o.just] != null ? JUST[o.just] : JUST[F.just || "centro"], jz = LADO[o.lado] != null ? LADO[o.lado] : 0;
    /* RECUO DE FABRICAÇÃO (15/10/2026, js/metalvigaspilares.js): a LINHA (a receita, o que o cálculo e os vínculos
       leem) vai de eixo a eixo dos pilares; o SÓLIDO para na face do pilar menos a folga. recuo = { a, b } em metros
       (positivo encurta, negativo estica a ponta além da linha — a viga contínua que cobre o pilar da ponta) */
    var rec = recuoDe(o.recuo), a2 = a, Ls = L;
    if (rec) { a2 = add(a, mul(e.X, rec.a)); Ls = L - rec.a - rec.b; if (!(Ls > 0.01)) return { erro: "O recuo das pontas (" + fmt(rec.a + rec.b, 3) + " m) não deixa peça: os pilares estão perto demais." }; if (Ls > 60) return { erro: "Peça com mais de 60 m: divida em trechos." }; }
    /* a linha clicada fica na face pedida: o eixo do perfil anda meia seção para dentro */
    var off = add(mul(e.Y, -jy * ds.alt / 2), mul(e.Z, -jz * ds.larg / 2));
    var O = add(a2, off), X = e.X;
    /* ESPELHAR = a barra de trás para a frente com a mesma "altura": a seção vista do outro
       lado é a seção espelhada (U, L, Ue abrem para o outro lado) — vale para qualquer perfil */
    if (o.espelhar) { O = add(O, mul(X, Ls)); X = mul(X, -1); }
    var c = B.perfil({ origem: O, ex: X, ey: e.Y, perfil: perfil, L: Ls, papel: o.papel || F.papel, ifc: o.ifc || F.ifc, aco: o.aco || F.aco, nome: o.nome });
    if (c.erro) return c;
    var vert = Math.abs(dot(e.X, UP)) > 0.999;
    var th = vert ? angPlano(e.Y) : angPlano(e.X);
    if (vert && Math.abs(e.Y[1]) > 0.999) th = 0;
    c = orientar(c, th);
    /* LIGAÇÃO AO LANÇAR (15/10/2026, js/metalligauto.js): a ponta marcada "Livre (balanço)" e a carga de serviço declarada do balanço */
    var livre = o.livre && (o.livre.a || o.livre.b) ? { a: !!o.livre.a || undefined, b: !!o.livre.b || undefined } : null;
    if (livre) { if (!livre.a) delete livre.a; if (!livre.b) delete livre.b; }
    c.metal.cria = criaDe(c, o.ferr || F.id, a, b, { giro: num(o.giro, 0), just: o.just || F.just || "centro", lado: o.lado || "centro", espelhar: !!o.espelhar, nivel: o.nivel || null, recuo: rec, vp: o.vp ? clone(o.vp) : null,
      livre: livre, servico: o.servico && typeof o.servico === "object" ? clone(o.servico) : null, balanco: o.balanco && typeof o.balanco === "object" ? clone(o.balanco) : null });
    /* as pontas que o cálculo trata como rótula (a emenda sobre o pilar): metal.calc, lido pelo js/acomodelolivre.js */
    if (o.vp && o.vp.calc) c.metal.calc = clone(o.vp.calc);
    return c;
  }
  function recuoDe(r) {
    if (!r || typeof r !== "object") return null;
    var o = { a: r6(num(r.a, 0)), b: r6(num(r.b, 0)) };
    return Math.abs(o.a) > 1e-9 || Math.abs(o.b) > 1e-9 ? o : null;
  }
  /* a receita da peça c0 levada para a peça c1 (a MESMA linha), depois de a ligação mexer no comprimento do sólido:
     `qual` = a ponta do sólido ("ini" | "fim") que andou `delta` para FORA (js/metalligacao.js ajustarPonta). O recuo
     daquela ponta diminui `delta`; a linha (de eixo a eixo) não muda. null = sem receita */
  function reancorar(c0, c1, qual, delta) {
    var w = criaMundo(c0), B = M(); if (!w || !B || !c1 || !c1.metal) return null;
    var q = B.quadro(c0), d = unit(sub(w.b, w.a)); if (!d) return null;
    var tIni = dot(sub(q.O, w.a), d), Lw = len(sub(w.b, w.a));
    var kIni = tIni <= Lw / 2 ? "a" : "b", k = qual === "fim" ? (kIni === "a" ? "b" : "a") : kIni;
    var cr = clone(w.cr), rc = { a: num(cr.recuo && cr.recuo.a, 0), b: num(cr.recuo && cr.recuo.b, 0) };
    rc[k] = r6(rc[k] - num(delta, 0)); cr.recuo = rc;
    var C = [num(c1.cx, 0), num(c1.cy, 0), num(c1.cz, 0)], th = num(c1.rotY, 0);
    cr.a = O3(rotY(sub(w.a, C), -th)); cr.b = O3(rotY(sub(w.b, C), -th));
    return cr;
  }
  /* a receita: os pontos da linha clicada em coordenadas LOCAIS (relativas ao centro, sem o rotY) */
  function criaDe(c, ferr, a, b, par) {
    var C = [c.cx, c.cy, c.cz], th = num(c.rotY, 0);
    var cr = { v: 1, ferr: ferr, a: O3(rotY(sub(a, C), -th)), b: O3(rotY(sub(b, C), -th)) };
    Object.keys(par || {}).forEach(function (k) { if (par[k] != null) cr[k] = par[k]; });
    return cr;
  }
  function O3(v) { return [r6(v[0]), r6(v[1]), r6(v[2])]; }
  /* a receita no MUNDO (a peça pode ter andado, girado, sido copiada) */
  function criaMundo(c) {
    var cr = c && c.metal && c.metal.cria; if (!cr || !Array.isArray(cr.a) || !Array.isArray(cr.b)) return null;
    var C = [num(c.cx, 0), num(c.cy, 0), num(c.cz, 0)], th = num(c.rotY, 0);
    return { a: add(C, rotY(V(cr.a), th)), b: add(C, rotY(V(cr.b), th)), cr: cr };
  }

  /* PILAR: o ponto (x, z) e as cotas da base e do topo */
  function pilar(p, o) {
    o = o || {};
    p = V(p); if (!p) return { erro: "Ponto inválido." };
    var base = num(o.base, p[1]), topo = o.topo != null ? num(o.topo, NaN) : base + num(o.altura, 3);
    if (!fin(base) || !fin(topo)) return { erro: "Base e topo do pilar precisam de cota." };
    if (!(topo - base > 0.05)) return { erro: "O topo do pilar tem de ficar acima da base (" + fmt(base) + " m)." };
    var q = {}; Object.keys(o).forEach(function (k) { q[k] = o[k]; }); q.ferr = "pilar";
    return barra([p[0], base, p[2]], [p[0], topo, p[2]], q);
  }

  /* ================================================================ CHAPA
   * Dois cantos OPOSTOS no plano de trabalho. plano = { o, u, v, n } (o do
   * js/bimplano.js; sem plano = horizontal na cota do 1º ponto). A espessura
   * vai para o lado de u × v ('acima'), para o outro ('abaixo') ou centrada.
   * o = { t (m), lado, aco, papel, nivel } */
  function chapa(p1, p2, plano, o) {
    o = o || {};
    var B = M(); if (!B) return { erro: "O motor de peças (js/metalpeca.js) não carregou." };
    p1 = V(p1); p2 = V(p2); if (!p1 || !p2) return { erro: "Pontos inválidos." };
    var pl = plano && v3ok(plano.o) && v3ok(plano.u) && v3ok(plano.v) ? plano : { o: [0, p1[1], 0], u: [1, 0, 0], v: [0, 0, -1] };
    var u = unit(V(pl.u)), v = unit(V(pl.v)); if (!u || !v) return { erro: "Plano de trabalho inválido." };
    var o0 = V(pl.o), d1 = sub(p1, o0), d2 = sub(p2, o0);
    var u1 = dot(d1, u), v1 = dot(d1, v), u2 = dot(d2, u), v2 = dot(d2, v);
    var Lm = Math.abs(u2 - u1), Bm = Math.abs(v2 - v1);
    if (!(Lm > 0.005) || !(Bm > 0.005)) return { erro: "Chapa: os dois cantos têm de formar um retângulo (mínimo 5 mm de cada lado)." };
    var t = num(o.t, FERRAMENTAS.chapa.t); if (!(t > 0.0005 && t < 0.3)) return { erro: "Espessura da chapa entre 0,5 mm e 300 mm." };
    var n = cross(u, v), sh = o.lado === "abaixo" ? -t : (o.lado === "centro" ? -t / 2 : 0);
    var org = add(add(add(o0, mul(u, Math.min(u1, u2))), mul(v, Math.min(v1, v2))), mul(n, sh));
    /* o desvio do 1º ponto em relação ao plano (o plano pode estar fora da face) */
    var dn = dot(d1, n); org = add(org, mul(n, dn));
    var c = B.chapa({ origem: org, ex: u, ey: v, t: t, ret: { L: Lm, B: Bm }, aco: o.aco || FERRAMENTAS.chapa.aco, papel: o.papel || "Chapa", nome: o.nome });
    if (c.erro) return c;
    var th = Math.abs(u[1]) < 0.999 ? angPlano(u) : angPlano(v);
    c = orientar(c, th);
    c.metal.cria = criaDe(c, "chapa", p1, p2, { t: t, lado: o.lado || "acima", nivel: o.nivel || null });
    return c;
  }

  /* ================================================================ EDITAR
   * A peça refeita com as mudanças das Propriedades → { caixa } (para a op
   * `metalAjustar`) ou { erro }. mud = { cat, giro, just, lado, espelhar,
   * comprimento, base, topo, dx/dy/dz (mover a peça), aco, t, L, B }.
   * Peça sem receita (galpão, diálogo antigo): a linha é o EIXO da barra e o
   * giro é lido da seção atual — a peça refeita sem mudança é ela mesma. */
  function linhaAtual(c) {
    var B = M(), w = criaMundo(c);
    if (w) return { a: w.a, b: w.b, giro: num(w.cr.giro, 0), just: w.cr.just || "centro", lado: w.cr.lado || "centro", espelhar: !!w.cr.espelhar, ferr: w.cr.ferr, nivel: w.cr.nivel || null, recuo: recuoDe(w.cr.recuo), vp: w.cr.vp || null,
      livre: w.cr.livre || null, servico: w.cr.servico || null, balanco: w.cr.balanco || null };
    var q = B.quadro(c), L = num(c.metal.L, 0), a = q.O, b = add(q.O, mul(q.X, L));
    return { a: a, b: b, giro: giroDe(a, b, q.Y), just: "centro", lado: "centro", espelhar: false, ferr: null, nivel: null, legado: true };
  }
  function editar(c, mud) {
    mud = mud || {};
    var B = M(); if (!B || !c || c.tipo !== "metal" || !c.metal) return { erro: "Esta peça não é uma peça metálica criada aqui." };
    var m = c.metal, novo;
    if (m.kind === "perfil") {
      var li = linhaAtual(c), a = li.a.slice(), b = li.b.slice();
      /* VÍNCULOS (js/bimvinculos.js, 14/10/2026): a peça refeita com as DUAS pontas dadas — a ligada, que acompanhou o
         elemento movido, e a outra exatamente onde estava. A direção é a mesma: giro, justificação e espelhar valem iguais */
      if (v3ok(mud.a) && v3ok(mud.b)) { a = V(mud.a); b = V(mud.b); }
      var dir = unit(sub(b, a)) || [1, 0, 0];
      /* com recuo (viga entre pilares): o comprimento digitado é o da PEÇA — a linha cresce o recuo das duas pontas */
      var recE = li.recuo ? li.recuo.a + li.recuo.b : 0;
      if (mud.comprimento != null) { var Ln = num(mud.comprimento, NaN); if (!(Ln > 0.01 && Ln <= 60)) return { erro: "Comprimento entre 1 cm e 60 m." }; b = add(a, mul(dir, Ln + recE)); }
      var vert = Math.abs(dir[1]) > 0.999;
      if (mud.base != null && vert) { var yb = num(mud.base, NaN); if (!fin(yb)) return { erro: "Cota da base inválida." }; var lo = a[1] <= b[1] ? a : b; lo[1] = yb; }
      if (mud.topo != null && vert) { var yt = num(mud.topo, NaN); if (!fin(yt)) return { erro: "Cota do topo inválida." }; var hi = a[1] <= b[1] ? b : a; hi[1] = yt; }
      if (mud.elevacao != null && !vert) { var dy = num(mud.elevacao, NaN) - Math.max(a[1], b[1]); if (!fin(dy)) return { erro: "Elevação inválida." }; a[1] += dy; b[1] += dy; }
      var d = [num(mud.dx, 0), num(mud.dy, 0), num(mud.dz, 0)]; a = add(a, d); b = add(b, d);
      if (vert && !(Math.abs(b[1] - a[1]) > 0.05)) return { erro: "O topo do pilar tem de ficar acima da base." };
      var cat = mud.cat != null ? perfilCat(mud.cat) : null;
      if (mud.cat != null && !cat) return { erro: "Perfil não encontrado no catálogo: " + mud.cat + "." };
      novo = barra(a, b, { ferr: li.ferr || (vert ? "pilar" : "viga"), cat: cat, perfil: cat ? null : m.perfil, giro: mud.giro != null ? num(mud.giro, 0) : li.giro,
        just: mud.just || li.just, lado: mud.lado || li.lado, espelhar: mud.espelhar != null ? !!mud.espelhar : li.espelhar, papel: m.papel, ifc: c.ifc, aco: mud.aco || m.aco, nivel: mud.nivel !== undefined ? mud.nivel : li.nivel,
        recuo: li.recuo, vp: li.vp, livre: mud.livre !== undefined ? mud.livre : li.livre, servico: mud.servico !== undefined ? mud.servico : li.servico, balanco: li.balanco });
      if (novo.erro) return novo;
      if (li.legado) delete novo.metal.cria.ferr;
      /* furos e cortes que a peça já tinha (máquina) continuam a partir do início */
      if (m.furos && m.furos.length) novo.metal.furos = clone(m.furos);
      if (m.cortes && Object.keys(m.cortes).length && mud.comprimento == null) novo.metal.cortes = clone(m.cortes);
      if (m.xRef) novo.metal.xRef = m.xRef;
      if (m.furos || m.cortes || m.xRef) B.recalc(novo);
    } else if (m.kind === "chapa") {
      var q = B.quadro(c), C = m.contorno || [], xs = C.map(function (p) { return p.u; }), ys = C.map(function (p) { return p.v; });
      var Lc = Math.max.apply(null, xs) - Math.min.apply(null, xs), Bc = Math.max.apply(null, ys) - Math.min.apply(null, ys);
      var ret = C.length === 4 && Math.abs(Math.abs(B.pol.area(B.pol.uv(C))) - Lc * Bc) < 1e-9;
      var Ln2 = mud.L != null ? num(mud.L, NaN) : Lc, Bn2 = mud.B != null ? num(mud.B, NaN) : Bc, tn = mud.t != null ? num(mud.t, NaN) : m.t;
      if ((mud.L != null || mud.B != null) && !ret) return { erro: "Só a chapa retangular muda de medida por aqui: use a Chapa paramétrica." };
      if (!(Ln2 > 0.005 && Bn2 > 0.005)) return { erro: "Medidas da chapa maiores que 5 mm." };
      var O2 = add(q.O, [num(mud.dx, 0), num(mud.dy, 0), num(mud.dz, 0)]);
      var cc = ret ? { ret: { L: Ln2, B: Bn2 } } : { contorno: C.map(function (p) { return [p.u, p.v]; }) };
      novo = B.chapa({ origem: O2, ex: q.X, ey: q.Y, t: tn, ret: cc.ret, contorno: cc.contorno, furos: m.furos, recortes: (m.recortes || []).map(function (r) { return r.pts; }), aco: mud.aco || m.aco, papel: m.papel, borda: m.borda });
      if (novo.erro) return novo;
      var th = Math.abs(q.X[1]) < 0.999 ? angPlano(q.X) : angPlano(q.Y);
      novo = orientar(novo, th);
      var w2 = criaMundo(c);
      if (w2) { var cr0 = clone(w2.cr); novo.metal.cria = criaDe(novo, "chapa", add(w2.a, [num(mud.dx, 0), num(mud.dy, 0), num(mud.dz, 0)]), add(w2.b, [num(mud.dx, 0), num(mud.dy, 0), num(mud.dz, 0)]), { t: tn, lado: cr0.lado, nivel: cr0.nivel }); }
    } else return { erro: "Esta peça (" + m.kind + ") não se edita por aqui." };
    return { caixa: novo };
  }
  function opAjustar(id, caixa) { return { op: "metalAjustar", id: id, caixa: caixa }; }

  /* ================================================================ ENCAIXE 3D
   * Os pontos notáveis do modelo, no MUNDO:
   *   fim ......... as pontas do eixo de cada barra (pilar: base e topo),
   *                 os cantos da chapa, as pontas dos eixos da grade;
   *   meio ........ o meio da barra;
   *   centro ...... o centro da chapa;
   *   intersecao .. o cruzamento de dois eixos da grade, na cota `o.y` (o
   *                 plano de trabalho) — o ponto de pilar da planta de locação.
   * E as LINHAS (eixo das barras, eixos da grade na cota y) para o
   * perpendicular e o "próximo". Parafuso e peça mecânica ficam de fora: são
   * centenas e ninguém liga uma barra no parafuso. */
  function pontosNotaveis(estado, o) {
    o = o || {};
    var B = M(), pts = [], linhas = [], y = num(o.y, 0), fora = {};
    arr(o.excluir).forEach(function (id) { fora[String(id)] = 1; });
    arr(estado && estado.caixas).forEach(function (c) {
      if (!c || fora[String(c.id)]) return;
      var mb = null;
      if (c.tipo === "metal" && c.metal) {
        if (c.metal.kind === "chapa" && B) {
          var q = B.quadro(c), C = arr(c.metal.contorno);
          var mid = [0, 0, 0];
          C.forEach(function (p) { var w = add(add(q.O, mul(q.X, num(p.u, 0))), mul(q.Y, num(p.v, 0))); pts.push({ p: w, tipo: "fim", id: c.id }); mid = add(mid, w); });
          if (C.length) pts.push({ p: mul(mid, 1 / C.length), tipo: "centro", id: c.id });
          return;
        }
        if (c.metal.kind !== "perfil") return;
        mb = B ? B.membro(c) : null;
      } else if ((c.tipo === "pilar" || c.tipo === "viga") && B) {
        mb = c.perfil ? B.membro(c) : null;
        if (!mb) {
          var h = num(c.altura, 0), w0;
          if (c.tipo === "pilar") { w0 = [num(c.cx, 0), num(c.cy, 0) - h / 2, num(c.cz, 0)]; mb = { id: c.id, P0: w0, X: [0, 1, 0], L: h }; }
          else {
            var co = Math.cos(num(c.rotY, 0)), si = Math.sin(num(c.rotY, 0)), Lh = num(c.comprimento, 0), yt = num(c.cy, 0) + h / 2;
            mb = { id: c.id, P0: [num(c.cx, 0) - Lh / 2 * co, yt, num(c.cz, 0) + Lh / 2 * si], X: [co, 0, -si], L: Lh };
          }
        }
      }
      if (!mb || !(mb.L > 0)) return;
      var a = mb.P0, b = add(mb.P0, mul(mb.X, mb.L));
      pts.push({ p: a, tipo: "fim", id: c.id }, { p: b, tipo: "fim", id: c.id }, { p: mul(add(a, b), 0.5), tipo: "meio", id: c.id });
      linhas.push({ a: a, b: b, id: c.id, k: "barra" });
    });
    var ex = arr(estado && estado.eixos);
    ex.forEach(function (e) {
      if (!e) return;
      var a = [num(e.x0, 0), y, num(e.z0, 0)], b = [num(e.x1, 0), y, num(e.z1, 0)];
      pts.push({ p: a, tipo: "fim", id: e.id, eixo: true }, { p: b, tipo: "fim", id: e.id, eixo: true });
      linhas.push({ a: a, b: b, id: e.id, k: "eixo" });
    });
    for (var i = 0; i < ex.length; i++) for (var j = i + 1; j < ex.length; j++) {
      var X = cruzaSeg2(ex[i], ex[j]); if (X) pts.push({ p: [X[0], y, X[1]], tipo: "intersecao", id: ex[i].id + "×" + ex[j].id, eixo: true, nomes: [ex[i].nome, ex[j].nome] });
    }
    return { pontos: pts, linhas: linhas };
  }
  /* cruzamento de dois eixos da grade (na planta), pontas incluídas; paralelos → null */
  function cruzaSeg2(e1, e2) {
    var ax = num(e1.x0, 0), az = num(e1.z0, 0), bx = num(e1.x1, 0), bz = num(e1.z1, 0), cx = num(e2.x0, 0), cz = num(e2.z0, 0), dx = num(e2.x1, 0), dz = num(e2.z1, 0);
    var d1x = bx - ax, d1z = bz - az, d2x = dx - cx, d2z = dz - cz, den = d1x * d2z - d1z * d2x;
    if (Math.abs(den) < 1e-10) return null;
    var rx = cx - ax, rz = cz - az, t = (rx * d2z - rz * d2x) / den, u = (rx * d1z - rz * d1x) / den, e = 1e-9;
    if (t < -e || t > 1 + e || u < -e || u > 1 + e) return null;
    return [r6(ax + d1x * t), r6(az + d1z * t)];
  }

  /* ⚠ A PRIORIDADE (a mesma regra do desenho de precisão, js/bimprecisao.js): ponto
     notável (fim, interseção, meio, centro) vence construção (perpendicular), que vence
     "próximo" (cair na linha), que vence a grade. Dentro da classe, o mais perto do
     cursor na TELA — com uma janela de empate (30 % da tolerância) em que vale a ordem
     fim > interseção > meio > centro: sem ela o marcador pulava entre o canto e o meio. */
  var CLASSE = { fim: 0, intersecao: 0, meio: 0, centro: 0, perpendicular: 1, proximo: 3, grade: 4 };
  var ORDEM = { fim: 0, intersecao: 1, meio: 2, centro: 3, perpendicular: 4, proximo: 7, grade: 8 };
  function escolher(cands, tol) {
    if (!cands || !cands.length) return null;
    var mc = Infinity; cands.forEach(function (c) { if (CLASSE[c.tipo] < mc) mc = CLASSE[c.tipo]; });
    var cl = cands.filter(function (c) { return CLASSE[c.tipo] === mc; }), dm = Infinity;
    cl.forEach(function (c) { if (c.d < dm) dm = c.d; });
    var jan = 0.3 * num(tol, 14);
    var el = cl.filter(function (c) { return c.d <= dm + jan + 1e-9; });
    el.sort(function (a, b) { return (ORDEM[a.tipo] - ORDEM[b.tipo]) || (a.d - b.d); });
    return el[0];
  }
  /* cursor {x, y} em px; geo = pontosNotaveis(); proj(p) → {x, y, atras}; o = { tol (px),
     tipos ({fim:true…}), ref ([x,y,z]: o 1º ponto — para o perpendicular), raio
     ({origem, direcao}: o "próximo" pela menor distância entre o raio e a linha) }
     → { p:[x,y,z], tipo, d (px), id } | null */
  function snap3d(cursor, geo, proj, o) {
    o = o || {};
    if (!cursor || !geo || typeof proj !== "function") return null;
    var tol = num(o.tol, 14), T = o.tipos || null, cands = [];
    function liga(t) { return !T || T[t] !== false; }
    function tenta(p, tipo, ex) {
      if (!liga(tipo)) return;
      var s = proj(p); if (!s || s.atras || !fin(s.x) || !fin(s.y)) return;
      var d = Math.sqrt((s.x - cursor.x) * (s.x - cursor.x) + (s.y - cursor.y) * (s.y - cursor.y)); if (d > tol) return;
      var c = { p: [r6(p[0]), r6(p[1]), r6(p[2])], tipo: tipo, d: d };
      if (ex) Object.keys(ex).forEach(function (k) { c[k] = ex[k]; });
      cands.push(c);
    }
    arr(geo.pontos).forEach(function (q) { tenta(q.p, q.tipo, { id: q.id, eixo: !!q.eixo }); });
    var ref = o.ref && v3ok(o.ref) ? o.ref : null;
    arr(geo.linhas).forEach(function (l) {
      var ab = sub(l.b, l.a), L2 = dot(ab, ab); if (L2 < 1e-12) return;
      if (ref) { var t = dot(sub(ref, l.a), ab) / L2; if (t > 1e-6 && t < 1 - 1e-6) { var f = add(l.a, mul(ab, t)); if (len(sub(f, ref)) > 1e-4) tenta(f, "perpendicular", { id: l.id }); } }
      var pp = o.raio ? pertoDoRaio(o.raio, l.a, l.b) : pertoNaTela(cursor, l.a, l.b, proj);
      if (pp) tenta(pp, "proximo", { id: l.id });
    });
    return escolher(cands, tol);
  }
  /* o ponto da linha a-b mais perto do raio (origem + s·direção) */
  function pertoDoRaio(raio, a, b) {
    var o = V(raio.origem), d = unit(V(raio.direcao)); if (!o || !d) return null;
    var u = sub(b, a), w = sub(a, o), A = dot(u, u), Bb = dot(u, d), C = dot(d, d), D = dot(u, w), E = dot(d, w), den = A * C - Bb * Bb;
    if (A < 1e-12 || Math.abs(den) < 1e-12) return null;
    var t = (Bb * E - C * D) / den; t = Math.max(0, Math.min(1, t));
    return add(a, mul(u, t));
  }
  function pertoNaTela(cur, a, b, proj) {
    var sa = proj(a), sb = proj(b); if (!sa || !sb || sa.atras || sb.atras) return null;
    var dx = sb.x - sa.x, dy = sb.y - sa.y, L2 = dx * dx + dy * dy; if (L2 < 1e-9) return null;
    var t = Math.max(0, Math.min(1, ((cur.x - sa.x) * dx + (cur.y - sa.y) * dy) / L2));
    return add(a, mul(sub(b, a), t));
  }
  /* dois encaixes concorrentes (o do 3D e o do plano de trabalho): a classe manda, depois a distância na tela.
     `classe` explícita = a do desenho de precisão (extensão, cruzamento de extensões) */
  function combinar(a, b) {
    if (!a) return b || null; if (!b) return a;
    var ca = fin(a.classe) ? a.classe : (CLASSE[a.tipo] != null ? CLASSE[a.tipo] : 9), cb = fin(b.classe) ? b.classe : (CLASSE[b.tipo] != null ? CLASSE[b.tipo] : 9);
    if (ca !== cb) return ca < cb ? a : b;
    return num(a.d, 0) <= num(b.d, 0) ? a : b;
  }

  /* ================================================================ DIGITAR
   * O 2º ponto pelo comprimento e pelo ângulo digitados, a partir do 1º, na
   * direção do cursor (ou no ângulo do plano, convenção do rotY). Plano
   * horizontal: o ângulo é na planta. */
  function pontoDigitado(a, cursor, comp, graus, plano) {
    a = V(a); if (!a || !(num(comp, 0) > 0)) return null;
    var L = num(comp, 0), pl = plano && v3ok(plano.u) && v3ok(plano.v) ? plano : { u: [1, 0, 0], v: [0, 0, -1] };
    var u = unit(V(pl.u)), v = unit(V(pl.v)), dir;
    if (graus != null && fin(num(graus, NaN))) { var g = num(graus, 0) * Math.PI / 180; dir = add(mul(u, Math.cos(g)), mul(v, Math.sin(g))); }
    else if (cursor) { var n = unit(cross(u, v)) || [0, 1, 0], d = sub(V(cursor), a); dir = unit(sub(d, mul(n, dot(d, n)))); }
    if (!dir) dir = u;
    return O3(add(a, mul(dir, L)));
  }
  /* comprimento e ângulo do traço no plano (o que a caixa ao lado do cursor mostra) */
  function medidaTraco(a, b, plano) {
    a = V(a); b = V(b); if (!a || !b) return { dist: 0, graus: 0 };
    var pl = plano && v3ok(plano.u) && v3ok(plano.v) ? plano : { u: [1, 0, 0], v: [0, 0, -1] }, d = sub(b, a);
    var g = Math.atan2(dot(d, V(pl.v)), dot(d, V(pl.u))) * 180 / Math.PI; if (g < 0) g += 360;
    return { dist: r6(len(d)), graus: Math.round(g * 100) / 100 % 360 };
  }

  /* ================================================================ EIXOS
   * "6; 6; 3x5" · "6 6 6" · "4,5;5" → [6, 6, 5, 5, 5] (m). null = texto inválido. */
  function lerEspacamentos(t) {
    var s = String(t == null ? "" : t).trim(); if (!s) return [];
    var out = [], ok = true;
    s.split(/[;\s]+/).filter(Boolean).forEach(function (p) {
      var m = /^(\d+)\s*[x×*]\s*(\d+(?:[.,]\d+)?)$/i.exec(p), n, v;
      if (m) { n = parseInt(m[1], 10); v = num(m[2], NaN); if (!(n >= 1 && n <= 200 && v > 0.05)) { ok = false; return; } for (var i = 0; i < n; i++) out.push(v); return; }
      v = num(p, NaN); if (!(v > 0.05)) { ok = false; return; } out.push(v);
    });
    return ok && out.length <= 200 ? out : null;
  }
  function letra(k) { var L = []; for (var i = 0; i < 26; i++) { var ch = String.fromCharCode(65 + i); if (ch !== "I" && ch !== "O") L.push(ch); } if (k < L.length) return L[k]; return L[Math.floor(k / L.length) - 1] + L[k % L.length]; }
  /* a grade: eixos NUMERADOS correndo em Z (x constante, da esquerda para a direita) e
     eixos com LETRA correndo em X (z constante) — a convenção da planta de estrutura
     (o mesmo do BimArq.proximoNomeEixo). o = { x0, z0, espX:[…], espZ:[…], ext (m além
     da grade), numero1 (o 1º número), letra1 (índice da 1ª letra) } */
  function gradeEixos(o) {
    o = o || {};
    var x0 = num(o.x0, 0), z0 = num(o.z0, 0), ex = num(o.ext, 1.5), ax = [0], az = [0];
    arr(o.espX).forEach(function (d) { ax.push(ax[ax.length - 1] + num(d, 0)); });
    arr(o.espZ).forEach(function (d) { az.push(az[az.length - 1] + num(d, 0)); });
    var xMax = ax[ax.length - 1], zMax = az[az.length - 1], out = [];
    if (xMax <= 0 && zMax <= 0) return [];
    var n1 = Math.max(1, Math.round(num(o.numero1, 1))), l1 = Math.max(0, Math.round(num(o.letra1, 0)));
    ax.forEach(function (x, i) { out.push({ x0: r6(x0 + x), z0: r6(z0 - ex), x1: r6(x0 + x), z1: r6(z0 + zMax + ex), nome: String(n1 + i) }); });
    az.forEach(function (z, i) { out.push({ x0: r6(x0 - ex), z0: r6(z0 + z), x1: r6(x0 + xMax + ex), z1: r6(z0 + z), nome: letra(l1 + i) }); });
    return out;
  }
  /* AS COTAS ENTRE EIXOS: os eixos paralelos em grupos; cada dois vizinhos dão uma cota
     (a, b na planta, na linha das bolinhas do lado do início), e cada grupo a cota total.
     → [{ a:[x,z], b:[x,z], valor, de, ate, total? }] */
  function cotasEixos(eixos, o) {
    o = o || {};
    var afast = num(o.afast, 1.0), grupos = [];
    arr(eixos).forEach(function (e) {
      var d = [num(e.x1, 0) - num(e.x0, 0), num(e.z1, 0) - num(e.z0, 0)], L = Math.sqrt(d[0] * d[0] + d[1] * d[1]); if (L < 0.05) return;
      var u = [d[0] / L, d[1] / L]; if (u[0] < -1e-9 || (Math.abs(u[0]) < 1e-9 && u[1] < 0)) u = [-u[0], -u[1]];
      var g = grupos.filter(function (gr) { return Math.abs(gr.u[0] * u[1] - gr.u[1] * u[0]) < 1e-3; })[0];
      if (!g) { g = { u: u, n: [-u[1], u[0]], itens: [] }; grupos.push(g); }
      g.itens.push(e);
    });
    var out = [];
    grupos.forEach(function (g) {
      if (g.itens.length < 2) return;
      var it = g.itens.map(function (e) {
        var a = [num(e.x0, 0), num(e.z0, 0)], b = [num(e.x1, 0), num(e.z1, 0)];
        var s = a[0] * g.n[0] + a[1] * g.n[1], ta = a[0] * g.u[0] + a[1] * g.u[1], tb = b[0] * g.u[0] + b[1] * g.u[1];
        return { e: e, s: s, t0: Math.min(ta, tb) };
      }).sort(function (p, q) { return p.s - q.s; });
      var tLinha = Math.min.apply(null, it.map(function (x) { return x.t0; })) - afast;
      function pt(s, t) { return [r6(g.n[0] * s + g.u[0] * t), r6(g.n[1] * s + g.u[1] * t)]; }
      for (var i = 1; i < it.length; i++) {
        var v = it[i].s - it[i - 1].s; if (v < 1e-4) continue;
        out.push({ a: pt(it[i - 1].s, tLinha), b: pt(it[i].s, tLinha), valor: r6(v), de: it[i - 1].e.nome, ate: it[i].e.nome });
      }
      if (it.length > 2) out.push({ a: pt(it[0].s, tLinha - afast * 0.8), b: pt(it[it.length - 1].s, tLinha - afast * 0.8), valor: r6(it[it.length - 1].s - it[0].s), de: it[0].e.nome, ate: it[it.length - 1].e.nome, total: true });
    });
    return out;
  }

  function fmt(v, c) { return (Math.round(num(v, 0) * Math.pow(10, c == null ? 2 : c)) / Math.pow(10, c == null ? 2 : c)).toFixed(c == null ? 2 : c).replace(".", ","); }

  /* ================================================================ NÍVEIS
   * A peça presa a nível ACOMPANHA quando a elevação muda (a mesma regra das
   * peças do modelador, P1-B): o pilar pela base e pelo topo (nível acima ou
   * um nível escolhido; altura não conectada fica com a altura), a viga e a
   * terça pela cota da linha (nível de referência + deslocamento). A
   * diagonal e a chapa não: elas nascem de pontos em qualquer cota.
   * Roda no FIM do replay (extensão do js/bimedit.js): a op gravada não
   * muda; só a peça do estado sai na altura dos níveis de agora. */
  var GEOM = { tipo: 1, ifc: 1, b2: 1, metal: 1, cx: 1, cy: 1, cz: 1, comprimento: 1, altura: 1, espessura: 1, rotY: 1, volume: 1, massa: 1, area: 1, medidas: 1 };
  function comIdentidade(c0, nova) {
    Object.keys(c0).forEach(function (k) { if (!GEOM[k] && !(k in nova)) nova[k] = c0[k]; });
    ["lig", "soldadaEm", "solda", "nome"].forEach(function (k) { if (c0.metal && c0.metal[k] != null && nova.metal[k] == null) nova.metal[k] = c0.metal[k]; });
    nova.id = c0.id;
    return nova;
  }
  function seguirNiveis(caixas, NIV) {
    if (!Array.isArray(NIV) || !NIV.length || !Array.isArray(caixas)) return 0;
    var L = NIV.filter(function (n) { return n && n.id != null && fin(Number(n.elevacao)); }).map(function (n) { return { id: String(n.id), elevacao: Number(n.elevacao) }; });
    var porId = {}; L.forEach(function (n) { porId[n.id] = n.elevacao; });
    function acima(id) { var e = porId[String(id)]; if (!fin(e)) return null; return L.filter(function (n) { return n.elevacao > e + 1e-6; }).sort(function (a, b) { return a.elevacao - b.elevacao; })[0] || null; }
    var n = 0;
    caixas.forEach(function (c, i) {
      var cr = c && c.tipo === "metal" && c.metal && c.metal.kind === "perfil" ? c.metal.cria : null;
      if (!cr || !cr.nivel || typeof cr.nivel !== "object") return;
      var nv = cr.nivel, w = criaMundo(c); if (!w) return;
      var lo = Math.min(w.a[1], w.b[1]), hi = Math.max(w.a[1], w.b[1]), mud = null;
      if (cr.ferr === "pilar") {
        if (nv.base == null || !fin(porId[String(nv.base)])) return;
        var yb = porId[String(nv.base)] + num(nv.deslBase, 0), yt = null;
        if (nv.topo === "acima") { var ac = acima(nv.base); if (ac) yt = ac.elevacao + num(nv.deslTopo, 0); }
        else if (nv.topo && nv.topo !== "altura" && fin(porId[String(nv.topo)])) yt = porId[String(nv.topo)] + num(nv.deslTopo, 0);
        if (yt == null) yt = yb + (hi - lo);
        if (Math.abs(lo - yb) > 1e-6 || Math.abs(hi - yt) > 1e-6) mud = { base: yb, topo: yt };
      } else if (cr.ferr === "viga" || cr.ferr === "terca") {
        if (Math.abs(hi - lo) > 1e-6 || nv.nivel == null) return;   /* barra inclinada: as pontas vieram de pontos do modelo */
        var ref = nv.ref === "acima" ? acima(nv.nivel) : (nv.ref === "atual" || nv.ref == null ? { elevacao: porId[String(nv.nivel)] } : (fin(porId[String(nv.ref)]) ? { elevacao: porId[String(nv.ref)] } : null));
        if (!ref || !fin(ref.elevacao)) return;
        var y = ref.elevacao + num(nv.desl, 0);
        if (Math.abs(hi - y) > 1e-6) mud = { elevacao: y };
      }
      if (!mud) return;
      var r = editar(c, mud); if (r.erro) return;
      caixas[i] = comIdentidade(c, r.caixa); n++;
    });
    return n;
  }
  /* o replay passa a pôr a peça presa a nível na altura dos níveis de agora */
  var BEd = dep("BimEdit", "./bimedit.js");
  if (BEd && BEd.estender) BEd.estender({ nome: "metalcriar", aplicar: function () { return false; }, valida: function () { return undefined; },
    fim: function (ctx, saida, NIV) { if (saida && saida.caixas) { var k = seguirNiveis(saida.caixas, NIV); if (k) saida.metalNiveis = k; } } });

  var MetalCriar = {
    FERRAMENTAS: FERRAMENTAS, JUST: JUST, LADO: LADO, CLASSE: CLASSE, ORDEM: ORDEM,
    catalogo: catalogo, buscarPerfis: buscarPerfis, perfilCat: perfilCat, desenhavel: desenhavel, dimSecao: dimSecao,
    eixosBarra: eixosBarra, giroDe: giroDe, orientar: orientar,
    barra: barra, pilar: pilar, chapa: chapa, criaMundo: criaMundo, linhaAtual: linhaAtual, editar: editar, opAjustar: opAjustar, reancorar: reancorar, recuoDe: recuoDe,
    pontosNotaveis: pontosNotaveis, cruzaSeg2: cruzaSeg2, escolher: escolher, snap3d: snap3d, pertoDoRaio: pertoDoRaio, combinar: combinar,
    pontoDigitado: pontoDigitado, medidaTraco: medidaTraco,
    lerEspacamentos: lerEspacamentos, gradeEixos: gradeEixos, cotasEixos: cotasEixos, letra: letra, fmt: fmt,
    seguirNiveis: seguirNiveis, comIdentidade: comIdentidade,
    _zerarCache: function () { _cacheCat = null; }
  };
  global.MetalCriar = MetalCriar;
  if (typeof module !== "undefined" && module.exports) module.exports = MetalCriar;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
