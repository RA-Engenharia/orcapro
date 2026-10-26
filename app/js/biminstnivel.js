/* =====================================================================
 * biminstnivel.js (BimInstNivel) — NÍVEL DE DETALHE das instalações:
 * Baixo / Médio / Alto (motor puro, Node-testável; sem three.js nem DOM).
 *
 * Pedido do Rogério (17/10/2026): o controle de nível de detalhe da barra
 * da vista, com o menu Baixo / Médio / Alto — "as pranchas ficam bem
 * bonitinhas na planta baixa e ela fica fácil de modelar". É o padrão de
 * mercado em instalações:
 *   BAIXO  tubo em LINHA ÚNICA (pena e cor/tipo de linha do sistema);
 *          conexão vira SÍMBOLO unifilar (joelho = o vértice; tê/junção =
 *          traço no ramal; redução = triângulo; luva = nada); registro e
 *          válvula = símbolo de válvula; ralo/caixa = contorno; louça e
 *          equipamento = contorno simplificado.
 *   MÉDIO  tubo em linha única; no 3D a conexão, o acessório, a louça e o
 *          equipamento no modelo completo, MENOS detalhado (lod "longe" do
 *          js/biminstgeo.js, nível 1 do LOD das louças do js/hidlouca.js); na
 *          PLANTA e no CORTE, linha única com o símbolo da conexão na cor de
 *          contorno do sistema (paridade com a referência, 18/10/2026).
 *   ALTO   tudo em 3D: tubo com o diâmetro externo real e a bolsa
 *          (js/biminstgeo.js) e a louça no detalhe pela distância.
 *
 * O NÍVEL É DA VISTA: planta, corte e 3D de instalações nascem em Alto, o isométrico de prancha em Baixo (padraoVista). A vista 2D
 * guarda o dela (js/bimmodelovista.js, campo nivelDetalhe, também no modelo
 * de vista); a 3D guarda por id de vista (js/biminstui.js).
 *
 * ⚠ O QUANTITATIVO NÃO DEPENDE DO NÍVEL: o nível só muda a REPRESENTAÇÃO.
 *   O trecho, a conexão deduzida e a peça continuam os mesmos (id, nome,
 *   SINAPI, comprimento) — o teste confere isso. Trocar Alto → Baixo não pode
 *   tirar um joelho do orçamento.
 *
 * SAÍDA DO UNIFILAR: segmentos 3D no MUNDO (metros, Y para cima)
 *   { a:[x,y,z], b:[x,y,z], id, papel:"tubo"|"simbolo"|"contorno", sistema,
 *     simbolo, ifc, k (chave de estilo) }
 *   A tela 3D (js/biminstui.js) faz de cada segmento um prisma fino
 *   (malhaLinhas) e a vista 2D (js/bim.js vista2d) projeta os mesmos
 *   segmentos no plano do desenho — o símbolo é o MESMO nos dois.
 * Teste: node tools/test-biminstnivel.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function arr(v) { return Array.isArray(v) ? v : []; }
  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) { /* ausente */ } }
    return null;
  }
  function BI() { return dep("BimInst", "./biminst.js"); }

  var NIVEIS = { baixo: "Baixo", medio: "Médio", alto: "Alto" };
  var ORDEM = ["baixo", "medio", "alto"];
  var DICAS = {
    baixo: "Tubo em linha única; conexão, registro e louça em símbolo",
    medio: "Tubo em linha única; conexão, registro e louça no modelo",
    alto: "Tudo em 3D: tubo com diâmetro real e bolsa"
  };
  /* o padrão de cada TIPO de vista (o que nasce quando a vista não diz) */
  /* planta, corte e elevação nascem em ALTO (paridade, 18/10/2026): é o nível dos modelos de vista de instalações do padrão
     (Fino na referência) e o da apresentação de prancha; o Médio passou a ser a linha única com símbolos, como lá */
  var PADRAO_VISTA = { "3d": "alto", planta: "alto", forro: "medio", estrutural: "medio", corte: "alto", elevacao: "alto",
                       isometrico: "baixo", desenho: "alto", chamada: "alto" };

  /* hid:fisica-inicio — GEOMETRIA DE DESENHO (mm de papel e pena). Não é valor de norma: é a convenção da prancha
     hidrossanitária da RA (as mesmas penas e cores do js/hidpranchas.js K2). pena = número da tabela de penas RA
     (data/penas-ra.json: 3 = 0,18 · 4 = 0,25 · 5 = 0,35 · 6 = 0,50 mm a 1:50). */
  var ESTILO_SIS = {
    agua_fria:   { cor: "#1E6FD9", mm: 0.35, pena: 5, padrao: "continua" },
    agua_quente: { cor: "#D93025", mm: 0.35, pena: 5, padrao: "continua" },
    esgoto:      { cor: "#7B4A2A", mm: 0.50, pena: 6, padrao: "continua" },
    ventilacao:  { cor: "#B08A6E", mm: 0.25, pena: 4, padrao: "oculta" },
    pluvial:     { cor: "#2E9E44", mm: 0.35, pena: 5, padrao: "continua" },
    incendio:    { cor: "#C62828", mm: 0.35, pena: 5, padrao: "continua" },
    industrial:  { cor: "#6D4C41", mm: 0.35, pena: 5, padrao: "continua" },
    dreno:       { cor: "#5DADE2", mm: 0.25, pena: 4, padrao: "oculta" },
    eletrica:    { cor: "#F2B600", mm: 0.25, pena: 4, padrao: "continua" }
  };
  var PENA_SIMBOLO = { mm: 0.25, pena: 4 }, PENA_CONTORNO = { mm: 0.18, pena: 3, cor: "#3c4046" };
  /* tamanho do símbolo no PAPEL (mm) — multiplicado pela escala dá o tamanho no mundo */
  var SIMBOLO_MM = 2.5, ESCALA_PADRAO = 50, LADOS_CIRCULO = 20;
  /* hid:fisica-fim */

  function norm(n, padrao) { return NIVEIS[n] ? n : (NIVEIS[padrao] ? padrao : "medio"); }
  function padraoVista(tipo) { return PADRAO_VISTA[tipo] || "medio"; }
  /* o nível EFETIVO de uma vista: o modelo de vista LIGADO que controla o campo vence; depois o da vista; depois o
     padrão do tipo. Espelha o efetivo() do js/bimmodelovista.js (que é quem manda nas vistas 2D). */
  function daVista(vista, modelo, tipo) {
    var p = padraoVista(tipo || (vista && vista.tipo));
    if (modelo && modelo.campos && modelo.campos.nivelDetalhe && modelo.valores && NIVEIS[modelo.valores.nivelDetalhe]) return modelo.valores.nivelDetalhe;
    if (vista && NIVEIS[vista.nivelDetalhe]) return vista.nivelDetalhe;
    return p;
  }

  /* --------------------------------------------------- símbolo de cada conexão */
  function simboloConexao(tipo) {
    var t = String(tipo || "").toLowerCase();
    if (/reduc|bucha/.test(t) && !/^te/.test(t)) return "reducao";
    if (/^te|juncao|cruzeta|derivac/.test(t)) return "ramal";
    if (/luva|uniao|emenda/.test(t)) return "nenhum";
    if (/tampao|cap$|plug/.test(t)) return "tampao";
    return "vertice";   /* joelho, curva e o que não se sabe: as linhas se encontram no vértice */
  }
  function simboloAcessorio(tipo) {
    var t = String(tipo || "");
    return t === "registro_gaveta" || t === "registro_esfera" || t === "registro_pressao" || t === "valvula_retencao" ? t : "valvula";
  }

  /* ---------------------------------------------- a REPRESENTAÇÃO de uma peça
     el = { classe: tubo | duto | conexao | acessorio | peca | aparelho | equipamento, tipo }
     → { modo: "linha" | "simbolo" | "contorno" | "solido", lod?, simbolo?, louca? }
     lod do sólido: "perto" (o js/biminstgeo.js no detalhe), "longe" (menos lados) — e, nas famílias, famLod
     (0 = o detalhe pela distância, 1 = fixo no nível 1 do LOD das louças). */
  function representacao(el, nivel) {
    var n = norm(nivel), c = el && el.classe;
    if (c === "tubo") return n === "alto" ? { modo: "solido", lod: "perto" } : { modo: "linha" };
    /* duto e eletrocalha: a seção retangular é a forma — linha única só no Baixo (no Médio já é o duto) */
    if (c === "duto") return n === "baixo" ? { modo: "linha" } : { modo: "solido", lod: n === "alto" ? "perto" : "longe" };
    if (c === "conexao") return n === "baixo" ? { modo: "simbolo", simbolo: simboloConexao(el.tipo) } : { modo: "solido", lod: n === "alto" ? "perto" : "longe" };
    if (c === "acessorio") return n === "baixo" ? { modo: "simbolo", simbolo: simboloAcessorio(el.tipo) } : { modo: "solido", lod: n === "alto" ? "perto" : "longe" };
    if (c === "peca") return n === "baixo" ? { modo: "contorno" } : { modo: "solido", lod: n === "alto" ? "perto" : "longe" };
    if (c === "aparelho" || c === "equipamento") return n === "baixo" ? { modo: "contorno", louca: c === "aparelho" } : { modo: "solido", famLod: n === "alto" ? null : 1 };
    return { modo: "solido", lod: "perto" };   /* o que o nível não conhece fica como é */
  }
  /* a família do catálogo que o nível alcança (categoria do js/familia.js) → classe; null = não é instalação */
  var CAT_CLASSE = { loucas: "aparelho", equipamento: "equipamento", acessorio_tubo: "acessorio", conexao_tubo: "conexao", conexao_duto: "conexao",
                     conexao_eletroduto: "conexao", dispositivo_eletrico: "equipamento", luminaria: "equipamento", equipamento_eletrico: "equipamento" };
  function classeDaCategoria(cat) { return CAT_CLASSE[cat] || null; }

  function estiloSistema(sis) {
    var e = ESTILO_SIS[sis], I = BI(), S = I && I.SISTEMAS ? I.SISTEMAS[sis] : null;
    if (e) return { cor: e.cor, mm: e.mm, pena: e.pena, padrao: e.padrao, contorno: e.contorno || null };
    return { cor: S && S.cor ? S.cor : "#404040", mm: 0.25, pena: 4, padrao: "continua", contorno: null };
  }
  /* a chave de estilo de um segmento (a vista 2D agrupa por ela; o 3D escolhe o material) */
  function estiloSeg(s) {
    if (s.papel === "contorno") return { cor: PENA_CONTORNO.cor, mm: PENA_CONTORNO.mm, pena: PENA_CONTORNO.pena, padrao: "continua", k: "contorno" };
    var e = estiloSistema(s.sistema);
    /* MÉDIO na planta/corte (paridade, 18/10/2026): a linha única e o símbolo na cor de CONTORNO do sistema do padrão */
    if (s.contorno && e.contorno && (s.papel === "simbolo" || s.papel === "tubo")) return s.papel === "simbolo" ? { cor: e.contorno, mm: PENA_SIMBOLO.mm, pena: PENA_SIMBOLO.pena, padrao: "continua", k: "simboloC:" + s.sistema }
      : { cor: e.contorno, mm: PENA_SIMBOLO.mm, pena: PENA_SIMBOLO.pena, padrao: e.padrao, k: "tuboC:" + s.sistema };   /* fina, como a linha única da referência */
    if (s.papel === "simbolo") return { cor: e.cor, mm: PENA_SIMBOLO.mm, pena: PENA_SIMBOLO.pena, padrao: "continua", k: "simbolo:" + s.sistema };
    /* a forma da conexão (Médio/Alto) e o tubo em linha dupla (Alto): contorno fino na cor do sistema */
    /* apresentação de prancha (Médio/Alto): a bolsa, o anel e a grade da caixa em traço PRETO fino, como o contorno */
    if (s.papel === "forma") return { cor: "#000000", mm: PENA_CONTORNO.mm, pena: 2, padrao: "continua", k: "p4forma" };
    if (s.papel === "grade") return { cor: "#000000", mm: PENA_CONTORNO.mm, pena: 2, padrao: "continua", k: "p4grade" };
    return { cor: e.cor, mm: e.mm, pena: e.pena, padrao: e.padrao, k: "tubo:" + s.sistema };
  }

  /* --------------------------------------------------------- vetores */
  function P(v) { return Array.isArray(v) ? [+v[0], +v[1], +v[2]] : [+v.x, +v.y, +v.z]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function add(a, b, s) { s = s == null ? 1 : s; return [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s]; }
  function len(a) { return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]); }
  function unit(a) { var L = len(a); return L > 1e-12 ? [a[0] / L, a[1] / L, a[2] / L] : [1, 0, 0]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  /* a LATERAL do símbolo: horizontal e perpendicular ao eixo (o símbolo deita no plano da planta); eixo vertical →
     X do mundo (o símbolo fica de pé, legível no corte) */
  function lateral(u) {
    if (Math.abs(u[1]) > 0.99) return [1, 0, 0];
    return unit(cross([0, 1, 0], u));
  }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function seg(out, a, b, base) {
    var o = { a: [r6(a[0]), r6(a[1]), r6(a[2])], b: [r6(b[0]), r6(b[1]), r6(b[2])] };
    for (var k in base) if (Object.prototype.hasOwnProperty.call(base, k)) o[k] = base[k];
    out.push(o);
  }
  /* círculo no plano de normal nrm (contorno de ralo/caixa e marca da prumada) */
  function circulo(out, c, r, nrm, base, lados) {
    lados = lados || LADOS_CIRCULO;
    var e1 = Math.abs(nrm[1]) > 0.99 ? [1, 0, 0] : unit(cross([0, 1, 0], nrm)), e2 = cross(nrm, e1), ant = null;
    for (var i = 0; i <= lados; i++) {
      var t = 2 * Math.PI * i / lados, p = add(add(c, e1, r * Math.cos(t)), e2, r * Math.sin(t));
      if (ant) seg(out, ant, p, base);
      ant = p;
    }
  }

  function tamanho(o) { o = o || {}; return o.tamanho > 0 ? +o.tamanho : SIMBOLO_MM * (o.escala > 0 ? +o.escala : ESCALA_PADRAO) / 1000; }

  /* ----------------------------------------- SÍMBOLOS unifilares (mundo, m) */
  /* tê / junção / cruzeta: um TRAÇO atravessado em cada ramal, perto do nó (a marca do ramal). O tronco é o par de
     trechos mais opostos; os outros são os ramais. */
  function simRamal(out, no, dirs, s, base) {
    var par = null, melhor = 2;
    for (var i = 0; i < dirs.length; i++) for (var j = i + 1; j < dirs.length; j++) { var d = dot(dirs[i], dirs[j]); if (d < melhor) { melhor = d; par = [i, j]; } }
    var ramais = dirs.filter(function (d, i) { return !par || dirs.length < 3 || (i !== par[0] && i !== par[1]); });
    if (!ramais.length && dirs.length) ramais = [dirs[dirs.length - 1]];
    ramais.forEach(function (u) {
      var w = lateral(u), m = add(no, u, 0.35 * s);
      seg(out, add(m, w, 0.22 * s), add(m, w, -0.22 * s), base);
    });
  }
  /* redução: triângulo com a BASE do lado do DN maior e a ponta para o menor (u aponta para o menor) */
  function simReducao(out, no, u, s, base) {
    var w = lateral(u), b0 = add(no, u, -0.25 * s), pt = add(no, u, 0.25 * s);
    var b1 = add(b0, w, 0.22 * s), b2 = add(b0, w, -0.22 * s);
    seg(out, b1, b2, base); seg(out, b2, pt, base); seg(out, pt, b1, base);
  }
  function simTampao(out, no, u, s, base) { var w = lateral(u); seg(out, add(no, w, 0.25 * s), add(no, w, -0.25 * s), base); }
  /* válvula: as duas pontas de triângulo que se tocam no centro ("gravata"); o registro de gaveta leva a haste com
     o volante em T, o de pressão a haste com o volante redondo, o de esfera a esfera no meio, a retenção o traço
     que preenche um dos triângulos (o lado do fluxo). */
  function simValvula(out, c, u, h, s, tipo, base) {
    var w = lateral(u), hw = Math.max(0.6 * h, 0.16 * s);
    var a1 = add(add(c, u, -h), w, hw), a2 = add(add(c, u, -h), w, -hw), b1 = add(add(c, u, h), w, hw), b2 = add(add(c, u, h), w, -hw);
    seg(out, a1, a2, base); seg(out, b1, b2, base); seg(out, a1, b2, base); seg(out, a2, b1, base);
    var v = w, topo = add(c, v, hw + 0.25 * s);   /* a haste sai para o lado, no plano do símbolo (legível em planta) */
    if (tipo === "registro_gaveta" || tipo === "registro_pressao") {
      seg(out, c, topo, base);
      if (tipo === "registro_gaveta") seg(out, add(topo, u, -0.18 * s), add(topo, u, 0.18 * s), base);
      else circulo(out, add(topo, v, 0.08 * s), 0.08 * s, cross(u, v), base, 12);
    } else if (tipo === "registro_esfera") circulo(out, c, 0.1 * s, cross(u, w), base, 12);
    else if (tipo === "valvula_retencao") { seg(out, add(c, u, -h), c, base); seg(out, add(add(c, u, -h * 0.5), w, hw * 0.5), add(add(c, u, -h * 0.5), w, -hw * 0.5), base); }
  }

  /* ---------------------------------------------- UNIFILAR de uma rede (BimInst.rede)
     R = { trechos, conexoes, acessorios, pecas } · o = { escala, tamanho, pecas (tabela PECAS) }
     → { segs, contagem: { tubos, simbolos, contornos, solidos }, nivel } */
  function unifilar(R, nivel, o) {
    var n = norm(nivel), out = [], s = tamanho(o), I = BI(), PECAS = (o && o.pecas) || (I && I.PECAS) || {}, MAT = (I && I.MATERIAIS) || {};
    var cont = { tubos: 0, simbolos: 0, contornos: 0, solidos: 0 };
    R = R || {};
    var porId = {}; arr(R.trechos).forEach(function (t) { porId[t.id] = t; });
    arr(R.trechos).forEach(function (t) {
      var M = MAT[t.material] || {}, rep = representacao({ classe: M.secao === "retangular" ? "duto" : "tubo" }, n);
      if (rep.modo !== "linha") { cont.solidos++; return; }
      var a = P(t.p1), b = P(t.p2); if (!(len(sub(b, a)) > 1e-6)) return;
      var base = { id: t.id, papel: "tubo", sistema: t.sistema, ifc: "IFCPIPESEGMENT" };
      seg(out, a, b, base); cont.tubos++;
      /* PRUMADA: o tubo vertical, visto de cima, vira um ponto — a marca é o círculo em volta, na ponta de cima */
      if (Math.abs(unit(sub(b, a))[1]) > 0.99) {
        var top = a[1] > b[1] ? a : b;
        circulo(out, top, 0.4 * s, [0, 1, 0], { id: t.id, papel: "simbolo", sistema: t.sistema, simbolo: "prumada", ifc: "IFCPIPESEGMENT" }, 16);
      }
    });
    if (n === "baixo") {
      arr(R.conexoes).forEach(function (c) {
        var sb = simboloConexao(c.tipo), no = P(c), base = { id: c.id, papel: "simbolo", sistema: c.sistema, simbolo: sb, ifc: "IFCPIPEFITTING" };
        var dirs = arr(c.ramos).map(function (id) {
          var t = porId[id]; if (!t) return null;
          var a = P(t.p1), b = P(t.p2), far = len(sub(a, no)) < len(sub(b, no)) ? b : a;
          return { u: unit(sub(far, no)), dn: +t.dn || 0, meio: len(sub(a, no)) > 1e-4 && len(sub(b, no)) > 1e-4 };
        }).filter(Boolean);
        /* o trecho que PASSA pelo nó (tê no meio do tubo) conta como dois ramos opostos */
        var us = []; dirs.forEach(function (d) { us.push(d.u); if (d.meio) us.push([-d.u[0], -d.u[1], -d.u[2]]); });
        var n0 = out.length;
        if (sb === "ramal" && us.length) simRamal(out, no, us, s, base);
        else if (sb === "nenhum" && o && o.corContorno && /luva|uniao/.test(String(c.tipo || "")) && us.length) {
          /* MÉDIO (paridade): a luva é o par de traços atravessados, como na referência */
          var wl = lateral(us[0]); [-0.12, 0.12].forEach(function (f) { var m = add(no, us[0], f * s); seg(out, add(m, wl, 0.2 * s), add(m, wl, -0.2 * s), base); });
        }
        else if (sb === "reducao" && dirs.length) {
          var menor = dirs.slice().sort(function (x, y) { return x.dn - y.dn; })[0], u = menor.u;
          if (dirs.length === 1 && c.dn2 && Math.abs((+menor.dn || 0) - (+c.dn || 0)) < 0.5) u = [-u[0], -u[1], -u[2]];   /* no aparelho: o tubo é o MAIOR → a ponta vai para o aparelho */
          simReducao(out, no, u, s, base);
        } else if (sb === "tampao" && dirs.length) simTampao(out, no, dirs[0].u, s, base);
        if (out.length > n0) cont.simbolos++;
      });
      arr(R.acessorios).forEach(function (a) {
        var cen = P(a.centro), u = unit(P(a.dir || [1, 0, 0])), h = Math.max((+a.comprimento || 0) / 2, 0.2 * s);
        simValvula(out, cen, u, h, s, simboloAcessorio(a.acessorio), { id: a.id, papel: "simbolo", sistema: a.sistema, simbolo: simboloAcessorio(a.acessorio), ifc: "IFCVALVE" });
        cont.simbolos++;
      });
      arr(R.pecas).forEach(function (k) {
        var Pc = PECAS[k.peca] || {}, base = { id: k.id, papel: "contorno", sistema: k.sistema, simbolo: k.peca, ifc: Pc.ifc || "IFCFLOWTERMINAL" }, c0 = P(k);
        if (Pc.forma === "caixa") {
          var co = Math.cos(k.rotY || 0), si = Math.sin(k.rotY || 0), hx = (Pc.w || 0.1) / 2, hz = (Pc.d || 0.05) / 2;
          var q = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(function (p) { return [c0[0] + p[0] * co + p[1] * si, c0[1], c0[2] - p[0] * si + p[1] * co]; });
          for (var i = 0; i < 4; i++) seg(out, q[i], q[(i + 1) % 4], base);
        } else {
          var r = Pc.r || 0.05;
          circulo(out, c0, r, [0, 1, 0], base);
          if (/^caixa_sifonada/.test(k.peca)) circulo(out, c0, r * 0.55, [0, 1, 0], base);
          else if (/^ralo_/.test(k.peca)) { seg(out, [c0[0] - r * 0.7, c0[1], c0[2]], [c0[0] + r * 0.7, c0[1], c0[2]], base); seg(out, [c0[0], c0[1], c0[2] - r * 0.7], [c0[0], c0[1], c0[2] + r * 0.7], base); }
        }
        cont.contornos++;
      });
    } else {
      cont.solidos += arr(R.conexoes).length + arr(R.acessorios).length + arr(R.pecas).length;
    }
    if (o && o.corContorno) out.forEach(function (x) { if (x.papel !== "contorno") x.contorno = true; });
    out.forEach(function (x) { x.k = estiloSeg(x).k; });
    return { nivel: n, segs: out, contagem: cont, tamanho: s };
  }

  /* --------------------------- CONTORNO simplificado de uma família (louça, equipamento)
     caixa = a caixa LOCAL da família (js/familia.js caixaDe: x0..x1, y0..y1, z0..z1) · inst = { x, y, z, rotY }
     → segmentos: as 12 arestas da caixa e, na louça, a elipse da bacia/cuba no topo (é como a louça se lê em
     planta). Rotação = a do js/bim.js famMalhas (Euler Y): x' = x·cos + z·sin, z' = −x·sin + z·cos. */
  function contornoFamilia(caixa, inst, o) {
    o = o || {};
    var out = [], b = caixa || {}; if (![b.x0, b.x1, b.y0, b.y1, b.z0, b.z1].every(function (v) { return isFinite(v); })) return out;
    var co = Math.cos(inst.rotY || 0), si = Math.sin(inst.rotY || 0);
    function W(x, y, z) { return [inst.x + x * co + z * si, inst.y + y, inst.z - x * si + z * co]; }
    var base = { id: o.id, papel: "contorno", sistema: o.sistema || null, simbolo: o.louca ? "louca" : "equipamento", ifc: o.ifc || "IFCFLOWTERMINAL", k: "contorno" };
    var X = [b.x0, b.x1], Y = [b.y0, b.y1], Z = [b.z0, b.z1];
    [0, 1].forEach(function (iy) { [[0, 0, 1, 0], [1, 0, 1, 1], [1, 1, 0, 1], [0, 1, 0, 0]].forEach(function (e) { seg(out, W(X[e[0]], Y[iy], Z[e[1]]), W(X[e[2]], Y[iy], Z[e[3]]), base); }); });
    [[0, 0], [1, 0], [1, 1], [0, 1]].forEach(function (e) { seg(out, W(X[e[0]], Y[0], Z[e[1]]), W(X[e[0]], Y[1], Z[e[1]]), base); });
    if (o.louca) {
      var cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, rx = (b.x1 - b.x0) * 0.36, rz = (b.z1 - b.z0) * 0.36, ant = null;
      for (var i = 0; i <= 24; i++) { var t = 2 * Math.PI * i / 24, p = W(cx + rx * Math.cos(t), b.y1, cz + rz * Math.sin(t)); if (ant) seg(out, ant, p, base); ant = p; }
    }
    return out;
  }

  /* --------------------------- a MALHA das linhas no 3D: cada segmento vira um prisma fino de seção em losango
     (4 faces, 8 triângulos, sem tampa) com a largura da pena — visto de cima, a largura é 2·raio. Listas puras no
     formato do js/biminstgeo.js { pos, nrm, idx } (faces planas: 4 vértices por face). */
  function malhaLinhas(segs, raio) {
    var pos = [], nrm = [], idx = [];
    arr(segs).forEach(function (s) {
      var a = P(s.a), b = P(s.b), d = sub(b, a); if (!(len(d) > 1e-7)) return;
      var u = unit(d), w = lateral(u), v = cross(u, w), r = typeof raio === "function" ? raio(s) : raio;
      var cs = [add([0, 0, 0], w, r), add([0, 0, 0], v, r), add([0, 0, 0], w, -r), add([0, 0, 0], v, -r)];
      for (var f = 0; f < 4; f++) {
        var c1 = cs[f], c2 = cs[(f + 1) % 4], nf = unit(add(c1, c2)), i0 = pos.length / 3;
        [add(a, c1), add(b, c1), add(b, c2), add(a, c2)].forEach(function (p) { pos.push(p[0], p[1], p[2]); nrm.push(nf[0], nf[1], nf[2]); });
        idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
      }
    });
    return { pos: pos, nrm: nrm, idx: idx, tri: idx.length / 3 };
  }
  /* o raio do prisma: meia pena na escala da vista (0,35 mm a 1:50 = 17,5 mm de largura) */
  function raioPena(mm, escala) { return (+mm || 0.25) * (escala > 0 ? escala : ESCALA_PADRAO) / 1000 / 2; }

  /* --------------------------- recorte de um segmento numa faixa de uma função linear f(p) ∈ [lo, hi]
     (a planta pega o que está entre o fundo da vista e o topo; o corte, o que está na frente do plano) */
  function recortar(a, b, f, lo, hi) {
    var fa = f(a), fb = f(b), t0 = 0, t1 = 1, df = fb - fa;
    if (Math.abs(df) < 1e-12) return fa >= lo - 1e-9 && fa <= hi + 1e-9 ? [a, b] : null;
    var ta = (lo - fa) / df, tb = (hi - fa) / df, tmin = Math.min(ta, tb), tmax = Math.max(ta, tb);
    t0 = Math.max(0, tmin); t1 = Math.min(1, tmax);
    if (t1 < t0 - 1e-9) return null;
    function lerp(t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
    return [lerp(t0), lerp(t1)];
  }

  /* --------------------------- A FORMA DA PEÇA EM PLANTA/CORTE (Médio e Alto), em vetor.
     Pedido do Rogério (17/10/2026): na planta, "conexão tem de aparecer como conexão" — no Médio e no Alto, o contorno
     da peça (cada perna com o diâmetro externo da conexão e o comprimento até a boca da bolsa, a linha do fundo da
     bolsa), nas penas do sistema; no Alto também o tubo em LINHA DUPLA com o DE real, aparado na boca da bolsa.
     Por que vetor e não as arestas da malha: a superfície do tubo e da conexão é LISA (24 lados no esgoto) — a extração
     de arestas da vista 2D não vê a silhueta de um cilindro, e o tubo de esgoto sumia da planta no Alto.
     R = BimInst.rede · vista = a direção do olhar (planta: [0,−1,0]) · o = { cotasCx(material, tipo, dn) → { od, z, pb }
     (mm, js/biminstgeo.js), cotasTubo(material, dn) → { de } } → { segs (papel "forma" e "tubo2") } */
  function dentroPerna(p, pe, no) {   /* p dentro do retângulo da perna (no plano da vista)? */
    var d = sub(p, no), s = dot(d, pe.u), q = dot(d, pe.l);
    return s > -pe.wb + 1e-6 && s < pe.L - 1e-6 && Math.abs(q) < pe.w - 1e-6;
  }
  function recortaFora(a, b, pernas, no, eu) {   /* o pedaço do segmento FORA das outras pernas */
    var cortes = [0, 1];
    pernas.forEach(function (pe, j) {
      if (j === eu || !pe.l) return;
      var d = sub(b, a), p0 = sub(a, no), lim = [[-dot(d, pe.u), dot(p0, pe.u) + pe.wb], [dot(d, pe.u), pe.L - dot(p0, pe.u)], [-dot(d, pe.l), dot(p0, pe.l) + pe.w], [dot(d, pe.l), pe.w - dot(p0, pe.l)]];
      var t0 = 0, t1 = 1, ok = true;
      lim.forEach(function (x) { if (!ok) return; var pp = x[0], qq = x[1]; if (Math.abs(pp) < 1e-12) { if (qq <= 1e-9) ok = false; return; } var r = qq / pp; if (pp < 0) { if (r > t0) t0 = r; } else if (r < t1) t1 = r; });
      if (ok && t1 > t0 + 1e-9) cortes.push(t0, t1);
    });
    var ts = [0], dentro = [];
    cortes.forEach(function (t) { if (t > 0 && t < 1) ts.push(t); }); ts.push(1); ts.sort(function (x, y) { return x - y; });
    var out = [];
    for (var i = 0; i + 1 < ts.length; i++) {
      if (ts[i + 1] - ts[i] < 1e-6) continue;
      var m = (ts[i] + ts[i + 1]) / 2, pm = add(a, sub(b, a), m), fora = true;
      pernas.forEach(function (pe, j) { if (j !== eu && pe.l && dentroPerna(pm, pe, no)) fora = false; });
      if (fora) out.push([add(a, sub(b, a), ts[i]), add(a, sub(b, a), ts[i + 1])]);
    }
    void dentro;
    return out;
  }
  /* o polígono do retângulo de uma perna/tubo no plano da vista e o do círculo (pontos 3D no mundo) */
  function retPoly(A, B, l, w) { return [add(A, l, w), add(B, l, w), add(B, l, -w), add(A, l, -w)]; }
  function circPoly(c, r, nrm, lados) {
    lados = lados || 24;
    var e1 = Math.abs(nrm[1]) > 0.99 ? [1, 0, 0] : unit(cross([0, 1, 0], nrm)), e2 = cross(nrm, e1), out = [];
    for (var i = 0; i < lados; i++) { var t = 2 * Math.PI * i / lados; out.push(add(add(c, e1, r * Math.cos(t)), e2, r * Math.sin(t))); }
    return out;
  }
  /* SIGLA da caixa/ralo no rótulo da planta ("CS 150x185x75mm") */
  var SIGLA_PECA = [[/^caixa_sifonada/, "CS"], [/^ralo_sifonado/, "RS"], [/^ralo_seco/, "RSE"], [/gordura/, "CG"], [/inspec/, "CI"], [/^ralo/, "RL"]];
  function siglaPeca(peca) { for (var i = 0; i < SIGLA_PECA.length; i++) if (SIGLA_PECA[i][0].test(String(peca || ""))) return SIGLA_PECA[i][1]; return null; }
  function rotuloPeca(k) { var sg = siglaPeca(k && k.peca); if (!sg) return null; var dn = String(k.dn || "").replace(/\s/g, ""); return sg + (dn && dn !== "-" && dn !== "*" ? " " + dn + "mm" : ""); }
  /* a APRESENTAÇÃO DE PRANCHA de esgoto e água (pedido do Rogério, 17/10/2026, com a planta de referência dele:
     "geralmente, na planta baixa, quando a gente vai plotar, a visualização da rede de esgoto é essa"):
       TUBO       preenchido na COR DO SISTEMA, contorno preto fino, na largura do DE real, entrando na bolsa;
       CONEXÃO    BRANCA com contorno preto, na forma real em planta: cada perna com o DE externo e o z da ficha
                  (a bolsa mais larga que o tubo); no Alto também o fundo da bolsa e o anel;
       PRUMADA    o círculo do DE na cor do sistema, por cima da conexão (a junção na prumada fica branca em volta);
       CAIXA/RALO quadrado branco com a GRADE e a sigla + tamanho (o rótulo vermelho sai na tela, js/bim2dui.js).
     A COR do sistema vem de ESTILO_SIS — o padrão de apresentação (js/biminstpadrao.js aplicar()) escreve nele.
     R = BimInst.rede · vista = direção do olhar · o = { cotasCx(material, tipo, dn) → { od, z, pb } (mm),
     cotasTubo(material, dn) → { de } } → { segs (linhas pretas: bolsa, anel, grade), polys (preenchidos) }
     Por que vetor e não as arestas da malha: a superfície do tubo e da conexão é LISA — a extração de arestas não
     vê a silhueta do cilindro, e o tubo de esgoto sumia da planta. */
  function formas(R, nivel, vista, o) {
    var n = norm(nivel), out = [], polys = [], V = unit(vista || [0, -1, 0]), I = BI(), MAT = (I && I.MATERIAIS) || {}, PECAS = (I && I.PECAS) || {};
    o = o || {}; R = R || {};
    if (n === "baixo") return { segs: out, polys: polys };
    var cx = typeof o.cotasCx === "function" ? o.cotasCx : function () { return null; }, ct = typeof o.cotasTubo === "function" ? o.cotasTubo : function () { return null; };
    var porId = {}, apara = {};
    function poly(pts, base) { var p = { pts: pts }; for (var k in base) if (Object.prototype.hasOwnProperty.call(base, k)) p[k] = base[k]; polys.push(p); }
    arr(R.trechos).forEach(function (t) { porId[t.id] = t; });
    arr(R.conexoes).forEach(function (c) {
      var no = P(c), pernas = [];
      arr(c.ramos).forEach(function (id) {
        var t = porId[id]; if (!t || (MAT[t.material] || {}).secao) return;
        var a = P(t.p1), b = P(t.p2), da = len(sub(a, no)), db = len(sub(b, no));
        if (da > 1e-3 && db > 1e-3) { pernas.push({ u: unit(sub(b, no)), dn: +t.dn || 0, trecho: null, fy: b[1] }); pernas.push({ u: unit(sub(a, no)), dn: +t.dn || 0, trecho: null, fy: a[1] }); return; }
        pernas.push({ u: unit(sub(da < db ? b : a, no)), dn: +t.dn || 0, trecho: t.id, lado: da < db ? 0 : 1, fy: (da < db ? b : a)[1] });
      });
      if (!pernas.length) return;
      var base = { id: c.id, papel: "forma", sistema: c.sistema, simbolo: c.tipo, ifc: "IFCPIPEFITTING" };
      var baseP = { id: c.id, papel: "peca", sistema: c.sistema, simbolo: c.tipo, ifc: "IFCPIPEFITTING" };
      /* AS PERNAS COM A COTA DE CADA UMA (pedido do Rogério, 17/10/2026: a junção saía "quadrado com losango"): no esgoto,
         a peça é PONTA e BOLSA — a perna de jusante é a PONTA (zp, entra na bolsa do tubo seguinte), a de montante e o
         ramal são BOLSA (zb, zr); a junção tem o corpo longo (L = 255 no DN 100) e o ramal a 45°. Sem a cota da ficha,
         a proporção do DE externo (aConferir na geometria 3D). */
      var planas = pernas.filter(function (pe) { pe.l = len(cross(V, pe.u)) > 1e-3 ? unit(cross(V, pe.u)) : null; return !!pe.l; });
      var par = null, melhor = 2;
      for (var ia = 0; ia < planas.length; ia++) for (var ib = ia + 1; ib < planas.length; ib++) { var dd = dot(planas[ia].u, planas[ib].u); if (dd < melhor) { melhor = dd; par = [planas[ia], planas[ib]]; } }
      var corrida = par && melhor < -0.985 ? par : null, ramais = planas.filter(function (pe) { return !corrida || (pe !== corrida[0] && pe !== corrida[1]); });
      /* jusante: a perna cujo tubo DESCE (ponta mais baixa); empate → a oposta ao ramal */
      var jus = null;
      if (corrida) {
        var c0 = corrida[0], c1 = corrida[1];
        jus = Math.abs(c0.fy - c1.fy) > 1e-4 ? (c0.fy < c1.fy ? c0 : c1) : (ramais[0] ? (dot(c0.u, ramais[0].u) < dot(c1.u, ramais[0].u) ? c0 : c1) : c1);
      } else if (planas.length === 2 && Math.abs(planas[0].fy - planas[1].fy) > 1e-4) jus = planas[0].fy < planas[1].fy ? planas[0] : planas[1];
      pernas.forEach(function (pe) {
        var k = null; try { k = cx(c.material, c.tipo, pe.dn); } catch (e) { k = null; }
        k = k || {};
        var od = k.od > 0 ? k.od : pe.dn * 1.3, zBase = k.z > 0 ? k.z : 0, ehRamal = corrida && ramais.indexOf(pe) >= 0;
        var z = ehRamal ? (k.zr || zBase) : (pe === jus ? (k.zp || zBase) : (k.zb || zBase));
        if (!(z > 0) && k.L > 0 && corrida && !ehRamal) z = k.L / 2;
        if (!(z > 0)) z = Math.max(pe.dn * 1.2, od * 0.9);
        pe.w = od / 2000; pe.L = z / 1000; pe.pb = k.pb > 0 && k.pb < z ? k.pb / 1000 : 0; pe.wb = pe.w;
        pe.ponta = pe === jus && k.ponta > 0 && k.ponta < z ? k.ponta / 1000 : 0;
        if (pe.trecho) { var ka = pe.trecho + ":" + pe.lado, ap = apara[ka]; if (!ap || pe.L > ap.L) apara[ka] = { L: pe.L, pb: pe.ponta ? 0 : pe.pb }; }
      });
      /* a perna no sentido do olhar (a que sobe/desce na planta): o anel da bolsa */
      pernas.forEach(function (pe) { if (!pe.l) poly(circPoly(no, pe.w, V, 24), baseP); });
      /* o CORPO: corrida (tê, junção, luva, redução) = um polígono reto de boca a boca; joelho = UM contorno (perna, canto
         de dentro, arco de fora, perna) — sem as linhas de uma perna cruzando a outra */
      if (corrida) {
        var a0 = corrida[0], a1 = corrida[1], Ba = add(no, a0.u, a0.L), Bb = add(no, a1.u, a1.L);
        poly([add(Ba, a0.l, a0.w), add(Ba, a0.l, -a0.w), add(Bb, a0.l, -a1.w), add(Bb, a0.l, a1.w)], baseP);
      } else if (planas.length === 2) {
        var p0 = planas[0], p1 = planas[1], s2 = dot(cross(p0.u, p1.u), V) > 0 ? 1 : -1;
        var n0 = [p0.l[0] * s2, p0.l[1] * s2, p0.l[2] * s2];   /* o lado da perna 0 que olha para a perna 1 */
        if (dot(n0, p1.u) < 0) n0 = [-n0[0], -n0[1], -n0[2]];
        var n1 = dot(p1.l, p0.u) > 0 ? p1.l : [-p1.l[0], -p1.l[1], -p1.l[2]];
        /* canto de dentro: a interseção dos lados que se olham */
        var A0 = add(no, n0, p0.w), A1 = add(no, n1, p1.w), dA = sub(A1, A0), den = dot(cross(p0.u, p1.u), V);
        var tI = Math.abs(den) > 1e-9 ? dot(cross(dA, p1.u), V) / den : 0, I0 = add(A0, p0.u, tI);
        var arco = [], o0 = [-n0[0], -n0[1], -n0[2]], o1 = [-n1[0], -n1[1], -n1[2]], ang = Math.acos(Math.max(-1, Math.min(1, dot(o0, o1))));
        for (var ka2 = 0; ka2 <= 8; ka2++) {   /* o arco de fora, de −n0 a −n1 em volta do vértice */
          var f = ka2 / 8, sA = Math.sin((1 - f) * ang), sB = Math.sin(f * ang), sT = Math.sin(ang) || 1;
          var dirA = ang > 1e-6 ? add([o0[0] * sA / sT, o0[1] * sA / sT, o0[2] * sA / sT], o1, sB / sT) : o0;
          arco.push(add(no, unit(dirA), (p0.w + p1.w) / 2));
        }
        var B0 = add(no, p0.u, p0.L), B1 = add(no, p1.u, p1.L);
        poly([add(B0, n0, p0.w), I0, add(B1, n1, p1.w), add(B1, o1, p1.w)].concat(arco.slice().reverse()).concat([add(B0, o0, p0.w)]), baseP);
      } else planas.forEach(function (pe) { poly(retPoly(add(no, pe.u, -pe.wb), add(no, pe.u, pe.L), pe.l, pe.w), baseP); });
      /* o RAMAL (tê, junção, cruzeta): sai da LATERAL do corpo — a boca de trás encosta na linha do corpo (um pouco para
         dentro: o branco cobre o contorno do corpo naquele trecho e a peça lê como UM "Y"/"T") */
      if (corrida) ramais.forEach(function (pe) {
        var wc = corrida[0].w, sn = len(cross(pe.u, corrida[0].u)) || 1, cs = Math.abs(dot(pe.u, corrida[0].u));
        var sAg = (wc + pe.w * cs) / sn, sOb = (wc - pe.w * cs) / sn, ent = 0.002;
        var lado = dot(pe.l, corrida[0].u) > 0 ? 1 : -1;   /* o lado do ramal que fica no ângulo agudo (do lado de corrida[0]) */
        /* o ramal tem de SAIR do corpo: na junção de redução a ficha não dá o zr do ramal — no mínimo 1,2 DE externo
           para fora da lateral (a bolsa do ramal visível), e o tubo do ramal é aparado no mesmo ponto */
        var Lr = Math.max(pe.L, Math.max(sAg, sOb) + 2.4 * pe.w);
        if (Lr > pe.L && pe.trecho) { var kr = pe.trecho + ":" + pe.lado; apara[kr] = { L: Lr, pb: pe.pb }; }
        pe.L = Lr;
        var Br = add(no, pe.u, pe.L);
        var pAg = add(add(no, pe.u, Math.max(0, sAg - ent)), pe.l, lado * pe.w), pOb = add(add(no, pe.u, Math.max(0, sOb - ent)), pe.l, -lado * pe.w);
        poly([pAg, add(Br, pe.l, lado * pe.w), add(Br, pe.l, -lado * pe.w), pOb], baseP);
      });
      pernas.forEach(function (pe, i) {
        if (!pe.l || n !== "alto") return;
        /* ALTO: o fundo da bolsa e o anel (a linha logo atrás da boca); na ponta, a linha onde ela começa */
        var corta = function (p, q) { recortaFora(p, q, pernas, no, i).forEach(function (r) { seg(out, r[0], r[1], base); }); };
        if (pe.ponta) { var Fp = add(no, pe.u, pe.L - pe.ponta); corta(add(Fp, pe.l, pe.w), add(Fp, pe.l, -pe.w)); return; }
        if (pe.pb > 0 && pe.L - pe.pb > pe.w * 0.5) { var Fb = add(no, pe.u, pe.L - pe.pb); corta(add(Fb, pe.l, pe.w), add(Fb, pe.l, -pe.w)); }
        var An = add(no, pe.u, pe.L - Math.min(0.006, pe.pb * 0.25 || 0.004)); corta(add(An, pe.l, pe.w * 0.92), add(An, pe.l, -pe.w * 0.92));
      });
    });
    var prums = [];
    arr(R.trechos).forEach(function (t) {
      if ((MAT[t.material] || {}).secao) return;   /* duto e eletrocalha: a forma vem da malha (caixa) */
      var k = null; try { k = ct(t.material, t.dn); } catch (e) { k = null; }
      var w = (k && k.de > 0 ? k.de : (+t.dn || 20)) / 2000, a = P(t.p1), b = P(t.p2), d = sub(b, a), L = len(d); if (!(L > 1e-6)) return;
      var u = unit(d), l = cross(V, u), base = { id: t.id, papel: "tubo", sistema: t.sistema, ifc: "IFCPIPESEGMENT" };
      if (len(l) < 1e-3) {   /* o tubo no sentido do olhar: o círculo do DE e a CRUZ da prumada (a marca da referência) */
        var cP = dot(a, V) < dot(b, V) ? a : b, e1 = Math.abs(V[1]) > 0.99 ? [1, 0, 0] : unit(cross([0, 1, 0], V)), e2 = cross(V, e1), bc = { id: t.id, papel: "forma", sistema: t.sistema, simbolo: "prumada", ifc: "IFCPIPESEGMENT" };
        base.papel = "prumada"; prums.push({ pts: circPoly(cP, w, V, 24), base: base });
        if (n === "alto") { seg(out, add(cP, e1, -1.45 * w), add(cP, e1, 1.45 * w), bc); seg(out, add(cP, e2, -1.45 * w), add(cP, e2, 1.45 * w), bc); }
        return;
      }
      l = unit(l);
      /* o tubo ENTRA na bolsa (vai até o fundo dela): a conexão branca, desenhada por cima, mostra a boca */
      var e1 = apara[t.id + ":0"], e2 = apara[t.id + ":1"], t1 = e1 ? Math.max(0, e1.L - e1.pb) : 0, t2 = e2 ? Math.max(0, e2.L - e2.pb) : 0;
      if (t1 + t2 >= L - 1e-4) return;
      poly(retPoly(add(a, u, t1), add(b, u, -t2), l, w), base);
      /* O VOLUME DO TUBO (paridade, 18/10/2026): a referência desenha o tubo SOMBREADO — borda escura, miolo claro, como um
         cilindro visto de cima (o print 9 do Rogério também). Duas faixas mais claras pelo eixo, sem contorno, por cima do
         tubo; a cor da borda continua a do sistema (o tubo na cor do padrão). */
      [[0.62, "tuboM"], [0.28, "tuboN"]].forEach(function (fx) { var bb = {}; for (var kb in base) if (Object.prototype.hasOwnProperty.call(base, kb)) bb[kb] = base[kb]; bb.papel = fx[1]; bb.semContorno = true; poly(retPoly(add(a, u, t1), add(b, u, -t2), l, w * fx[0]), bb); });
    });
    prums.forEach(function (q) { poly(q.pts, q.base); });   /* a prumada por cima da conexão */
    arr(R.pecas).forEach(function (k) {
      var Pc = PECAS[k.peca] || {}; if (!siglaPeca(k.peca)) return;
      var c0 = P(k), hx, hz;
      if (Pc.forma === "caixa") { hx = (Pc.w || 0.1) / 2; hz = (Pc.d || 0.1) / 2; } else { hx = hz = Pc.r || 0.05; }
      var co = Math.cos(k.rotY || 0), si = Math.sin(k.rotY || 0);
      var W = function (x, z) { return [c0[0] + x * co + z * si, c0[1], c0[2] - x * si + z * co]; };
      var base = { id: k.id, papel: "caixa", sistema: k.sistema, simbolo: k.peca, ifc: Pc.ifc || "IFCFLOWTERMINAL", rotulo: rotuloPeca(k) };
      var gi = 0.72, gb = { id: k.id, papel: "grade", sistema: k.sistema, ifc: base.ifc };
      /* o RALO é REDONDO (porta-grelha e grelha redondos, como a peça e a referência); a caixa sifonada, quadrada */
      if (Pc.forma !== "caixa" && !/^caixa_sifonada/.test(k.peca)) {
        poly(circPoly(c0, hx, [0, 1, 0], 28), base);
        var ci = circPoly(c0, hx * gi, [0, 1, 0], 24); for (var ec = 0; ec < ci.length; ec++) seg(out, ci[ec], ci[(ec + 1) % ci.length], gb);
        for (var gr = 1; gr < 5; gr++) { var fr = -gi + 2 * gi * gr / 5, hz2 = Math.sqrt(Math.max(0, gi * gi - fr * fr)); seg(out, W(hx * fr, -hz * hz2), W(hx * fr, hz * hz2), gb); }
        return;
      }
      poly([W(-hx, -hz), W(hx, -hz), W(hx, hz), W(-hx, hz)], base);
      /* a GRADE: o quadrado de dentro e a malha de barras (a grelha vista de cima) */
      var q = [W(-hx * gi, -hz * gi), W(hx * gi, -hz * gi), W(hx * gi, hz * gi), W(-hx * gi, hz * gi)];
      for (var e = 0; e < 4; e++) seg(out, q[e], q[(e + 1) % 4], gb);
      for (var g = 1; g < 5; g++) { var f = -gi + 2 * gi * g / 5; seg(out, W(hx * f, -hz * gi), W(hx * f, hz * gi), gb); seg(out, W(-hx * gi, hz * f), W(hx * gi, hz * f), gb); }
    });
    out.forEach(function (x) { x.k = estiloSeg(x).k; });
    polys.forEach(function (x) { var e = estiloPoly(x); x.k = e.k; x.preenchCor = e.preenchCor; });
    return { segs: out, polys: polys, nivel: n };
  }
  /* o estilo de um polígono da apresentação: a ORDEM vai na chave (p1 tubo, p2 conexão/caixa, p3 prumada) — o
     js/desenho2d.js desenha os cortes de instalação nessa ordem, e o branco da conexão cobre a ponta do tubo */
  /* o brilho da faixa do tubo sombreado: o canal multiplicado (o verde continua verde puro, como na referência) */
  function brilho(hex, f) {
    var h = String(hex || "#808080").replace("#", ""); if (h.length === 3) h = h.replace(/(.)/g, "$1$1");
    return "#" + [0, 2, 4].map(function (i) { var v = Math.min(255, Math.round(parseInt(h.substr(i, 2), 16) * f + (f > 1 ? 10 * (f - 1) : 0))); return ("0" + v.toString(16)).slice(-2); }).join("");
  }
  /* a CONEXÃO em cinza muito claro (a peça branca sombreada da referência e do print 9; o branco puro some no papel) */
  var COR_CONEXAO = "#ececec";
  function estiloPoly(x) {
    var cor = estiloSistema(x.sistema).cor;
    if (x.papel === "tubo") return { k: "p1tubo:" + x.sistema, preenchCor: cor };
    if (x.papel === "tuboM") return { k: "p1tuboM:" + x.sistema, preenchCor: brilho(cor, 1.3) };
    if (x.papel === "tuboN") return { k: "p1tuboN:" + x.sistema, preenchCor: brilho(cor, 1.55) };
    if (x.papel === "prumada") return { k: "p3prum:" + x.sistema, preenchCor: brilho(cor, 1.3) };
    return { k: "p2peca", preenchCor: COR_CONEXAO };
  }

  /* --------------------------- RÓTULOS SEM SOBREPOSIÇÃO (regra das pranchas da RA: texto nunca em cima de texto,
     nem atravessando o tubo). rotulos = [{ t, x, y, rot (graus), seg: [x1,y1,x2,y2] | null }] no plano do desenho;
     obst = [{ seg: [x1,y1,x2,y2], peso }] (tubo = peso alto; parede/resto = baixo); o = { h (altura do texto), larg
     (largura por caractere, em alturas) }. Cada rótulo vai para a posição candidata de MENOR custo, ao longo do próprio
     trecho e dos dois lados, afastando-se em anéis; caixa de rótulo já posto é PROIBIDA (nunca texto sobre texto).
     Devolve [{ ...rótulo, x, y = o CENTRO da caixa, rot, cruza (pesos cruzados), semLugar }]. */
  function caixaRot(c, u, hw, hh) {
    var n = [-u[1], u[0]];
    return [[c[0] - u[0] * hw - n[0] * hh, c[1] - u[1] * hw - n[1] * hh], [c[0] + u[0] * hw - n[0] * hh, c[1] + u[1] * hw - n[1] * hh],
            [c[0] + u[0] * hw + n[0] * hh, c[1] + u[1] * hw + n[1] * hh], [c[0] - u[0] * hw + n[0] * hh, c[1] - u[1] * hw + n[1] * hh]];
  }
  function sepEixo(P, Q) {   /* SAT de dois quadriláteros convexos: há eixo separador? */
    var polys = [P, Q];
    for (var pi = 0; pi < 2; pi++) {
      var p = polys[pi];
      for (var i = 0; i < 4; i++) {
        var a = p[i], b = p[(i + 1) % 4], ax = -(b[1] - a[1]), ay = b[0] - a[0];
        var m1 = Infinity, M1 = -Infinity, m2 = Infinity, M2 = -Infinity, j, v;
        for (j = 0; j < 4; j++) { v = P[j][0] * ax + P[j][1] * ay; if (v < m1) m1 = v; if (v > M1) M1 = v; }
        for (j = 0; j < 4; j++) { v = Q[j][0] * ax + Q[j][1] * ay; if (v < m2) m2 = v; if (v > M2) M2 = v; }
        if (M1 < m2 || M2 < m1) return true;
      }
    }
    return false;
  }
  function segCruzaCaixa(s, c, u, hw, hh) {   /* Liang-Barsky no referencial da caixa */
    var n = [-u[1], u[0]];
    function loc(x, y) { var dx = x - c[0], dy = y - c[1]; return [dx * u[0] + dy * u[1], dx * n[0] + dy * n[1]]; }
    var p = loc(s[0], s[1]), q = loc(s[2], s[3]), t0 = 0, t1 = 1, d = [q[0] - p[0], q[1] - p[1]];
    var lim = [[-d[0], p[0] + hw], [d[0], hw - p[0]], [-d[1], p[1] + hh], [d[1], hh - p[1]]];
    for (var i = 0; i < 4; i++) {
      var pp = lim[i][0], qq = lim[i][1];
      if (Math.abs(pp) < 1e-12) { if (qq < 0) return false; continue; }
      var r = qq / pp;
      if (pp < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
    }
    return t0 <= t1;
  }
  /* FLUIDEZ (25/10/2026): os obstáculos numa GRADE, para achar os de perto de cada rótulo sem passar por todos.
     ⚠ ROTEIRO: o rotular filtrava a lista INTEIRA de obstáculos por rótulo e testava cada candidato contra todos os de
     perto — 300 ms da 1ª planta do projeto exemplo (2.688 linhas de instalação). A grade só escolhe QUEM testar; o teste
     é o mesmo, nos mesmos números e na mesma ordem (tools/test-hid-rotular-indice.js compara com o caminho antigo).
     Segmento com coordenada não finita ou que cobre muitas células fica na lista "sempre" (o teste antigo o aceitava). */
  var GRADE_MIN_OBST = 200;
  function indiceObst(obst, passo) {
    var cel = {}, sempre = [], bb = new Array(obst.length);
    for (var i = 0; i < obst.length; i++) {
      var q = obst[i].seg;
      var x0 = Math.min(q[0], q[2]), x1 = Math.max(q[0], q[2]), y0 = Math.min(q[1], q[3]), y1 = Math.max(q[1], q[3]);
      var fin = isFinite(x0) && isFinite(x1) && isFinite(y0) && isFinite(y1);
      bb[i] = [x0, x1, y0, y1, fin];
      if (!(isFinite(x0) && isFinite(x1) && isFinite(y0) && isFinite(y1))) { sempre.push(i); continue; }
      var gx0 = Math.floor(x0 / passo), gx1 = Math.floor(x1 / passo), gy0 = Math.floor(y0 / passo), gy1 = Math.floor(y1 / passo);
      if ((gx1 - gx0 + 1) * (gy1 - gy0 + 1) > 64) { sempre.push(i); continue; }
      for (var gx = gx0; gx <= gx1; gx++) for (var gy = gy0; gy <= gy1; gy++) { var k = gx + "," + gy; (cel[k] || (cel[k] = [])).push(i); }
    }
    return { cel: cel, sempre: sempre, bb: bb, passo: passo, marca: new Float64Array(obst.length), vez: 0 };
  }
  /* os obstáculos cuja caixa encosta no quadrado (cx0 ± R, cy0 ± R) — o MESMO teste do filtro antigo — na ordem da lista */
  function pertoDe(ix, obst, cx0, cy0, R) {
    var p = ix.passo, gx0 = Math.floor((cx0 - R) / p), gx1 = Math.floor((cx0 + R) / p), gy0 = Math.floor((cy0 - R) / p), gy1 = Math.floor((cy0 + R) / p), idx = [], i, j;
    var tudo = !(isFinite(gx0) && isFinite(gx1) && isFinite(gy0) && isFinite(gy1)) || (gx1 - gx0 + 1) * (gy1 - gy0 + 1) > 4096;
    if (tudo) { for (i = 0; i < obst.length; i++) idx.push(i); }
    else {
      var v = ++ix.vez;
      for (j = 0; j < ix.sempre.length; j++) { i = ix.sempre[j]; if (ix.marca[i] !== v) { ix.marca[i] = v; idx.push(i); } }
      for (var gx = gx0; gx <= gx1; gx++) for (var gy = gy0; gy <= gy1; gy++) {
        var l = ix.cel[gx + "," + gy]; if (!l) continue;
        for (j = 0; j < l.length; j++) { i = l[j]; if (ix.marca[i] !== v) { ix.marca[i] = v; idx.push(i); } }
      }
      idx.sort(function (a, b) { return a - b; });
    }
    var out = [], bbs = [];
    for (var k = 0; k < idx.length; k++) {
      var b = ix.bb[idx[k]];
      if (!(b[1] < cx0 - R || b[0] > cx0 + R || b[3] < cy0 - R || b[2] > cy0 + R)) { out.push(obst[idx[k]]); bbs.push(b); }
    }
    return { l: out, bb: bbs };
  }
  function rotular(rotulos, obst, o) {
    o = o || {};
    var h = o.h > 0 ? o.h : 0.1, lc = o.larg > 0 ? o.larg : 0.58, postos = [], out = [];
    var OB = arr(obst), IX = null, usarGrade = o.semGrade !== true && OB.length > GRADE_MIN_OBST;
    /* FLUIDEZ: os rótulos JÁ POSTOS também numa grade. Duas caixas cujas caixas alinhadas aos eixos não se tocam têm um
       eixo separador (teorema do eixo separador) — o sepEixo diria "separadas"; só as que se tocam são testadas.
       Caixa com coordenada não finita: testa contra todos, como antes. */
    var PG = usarGrade ? { cel: {}, sempre: [], bb: [], passo: Math.max(6 * h, 1e-3), marca: [], vez: 0 } : null;
    function aabbDe(bx) {
      var x0 = Math.min(bx[0][0], bx[1][0], bx[2][0], bx[3][0]), x1 = Math.max(bx[0][0], bx[1][0], bx[2][0], bx[3][0]);
      var y0 = Math.min(bx[0][1], bx[1][1], bx[2][1], bx[3][1]), y1 = Math.max(bx[0][1], bx[1][1], bx[2][1], bx[3][1]);
      return [x0 - 1e-6, x1 + 1e-6, y0 - 1e-6, y1 + 1e-6, isFinite(x0) && isFinite(x1) && isFinite(y0) && isFinite(y1)];
    }
    function postoGuardar(bx) {
      var k = postos.length; postos.push(bx);
      if (!PG) return;
      var b = aabbDe(bx); PG.bb[k] = b;
      if (!b[4]) { PG.sempre.push(k); return; }
      var p = PG.passo, gx0 = Math.floor(b[0] / p), gx1 = Math.floor(b[1] / p), gy0 = Math.floor(b[2] / p), gy1 = Math.floor(b[3] / p);
      if ((gx1 - gx0 + 1) * (gy1 - gy0 + 1) > 256) { PG.sempre.push(k); return; }
      for (var gx = gx0; gx <= gx1; gx++) for (var gy = gy0; gy <= gy1; gy++) { var ck = gx + "," + gy; (PG.cel[ck] || (PG.cel[ck] = [])).push(k); }
    }
    function postoLivre(bx) {
      var j;
      if (!PG) { for (j = 0; j < postos.length; j++) if (!sepEixo(bx, postos[j])) return false; return true; }
      var b = aabbDe(bx);
      if (!b[4]) { for (j = 0; j < postos.length; j++) if (!sepEixo(bx, postos[j])) return false; return true; }
      var p = PG.passo, gx0 = Math.floor(b[0] / p), gx1 = Math.floor(b[1] / p), gy0 = Math.floor(b[2] / p), gy1 = Math.floor(b[3] / p), v = ++PG.vez;
      var testar = function (k) {
        if (PG.marca[k] === v) return true; PG.marca[k] = v;
        var q = PG.bb[k]; if (q[4] && (q[1] < b[0] || q[0] > b[1] || q[3] < b[2] || q[2] > b[3])) return true;
        return sepEixo(bx, postos[k]);
      };
      for (j = 0; j < PG.sempre.length; j++) if (!testar(PG.sempre[j])) return false;
      for (var gx = gx0; gx <= gx1; gx++) for (var gy = gy0; gy <= gy1; gy++) {
        var l = PG.cel[gx + "," + gy]; if (!l) continue;
        for (j = 0; j < l.length; j++) if (!testar(l[j])) return false;
      }
      return true;
    }
    var lista = arr(rotulos).map(function (r, i) {
      var s = r.seg, L = s ? Math.sqrt((s[2] - s[0]) * (s[2] - s[0]) + (s[3] - s[1]) * (s[3] - s[1])) : 0;
      return { r: r, i: i, L: L };
    });
    lista.sort(function (a, b) { return b.L - a.L; });   /* o trecho mais longo escolhe primeiro (tem mais lugar) */
    lista.forEach(function (it) {
      var r = it.r, ang = (+r.rot || 0) * Math.PI / 180, u = [Math.cos(ang), Math.sin(ang)], n = [-u[1], u[0]];
      var hw = String(r.t).length * h * lc / 2 + h * 0.15, hh = h * 0.62;
      var s = r.seg || [r.x, r.y, r.x, r.y], A = [s[0], s[1]], B = [s[2], s[3]];
      /* os obstáculos perto (o resto não pode cruzar a caixa) */
      var R = Math.max(it.L, 0) / 2 + 6 * h + hw, cx0 = (A[0] + B[0]) / 2, cy0 = (A[1] + B[1]) / 2;
      var perto, pertoBB = null;
      if (usarGrade) {
        if (!IX) IX = indiceObst(OB, Math.max(6 * h, 1e-3));
        var pd = pertoDe(IX, OB, cx0, cy0, R); perto = pd.l; pertoBB = pd.bb;
      } else perto = OB.filter(function (ob) {
        var q = ob.seg; return !(Math.max(q[0], q[2]) < cx0 - R || Math.min(q[0], q[2]) > cx0 + R || Math.max(q[1], q[3]) < cy0 - R || Math.min(q[1], q[3]) > cy0 + R);
      });
      var melhor = null, fr = it.L > 4 * hw ? [0.5, 0.35, 0.65, 0.2, 0.8] : [0.5];
      /* PEÇA (caixa, ralo): o rótulo vai AO LADO dela, em volta (direita, esquerda, acima, abaixo, diagonais), do mais perto
         para fora — antes só acima/abaixo, e na planta pequena ia parar em cima da parede (18/10/2026) */
      var DIRS = r.peca ? [[1, 0], [-1, 0], [0, -1], [0, 1], [1, -1], [-1, -1], [1, 1], [-1, 1]] : null, rp = +r.raio || 0;
      for (var anel = 0; anel < 8; anel++) {
        var d = hh + h * (0.25 + 0.9 * anel);
        var cands = [];
        if (DIRS) DIRS.forEach(function (dd) { var nn = Math.sqrt(dd[0] * dd[0] + dd[1] * dd[1]); cands.push([A[0] + dd[0] / nn * (Math.abs(dd[0]) / nn * (hw + rp) + Math.abs(dd[1]) / nn * (hh + rp) + h * (0.25 + 0.9 * anel)), A[1] + dd[1] / nn * (Math.abs(dd[0]) / nn * (hw + rp) + Math.abs(dd[1]) / nn * (hh + rp) + h * (0.25 + 0.9 * anel)), 0.5, 1]); });
        else for (var fi0 = 0; fi0 < fr.length; fi0++) for (var lado0 = -1; lado0 <= 1; lado0 += 2) cands.push([A[0] + (B[0] - A[0]) * fr[fi0] + n[0] * lado0 * d, A[1] + (B[1] - A[1]) * fr[fi0] + n[1] * lado0 * d, fr[fi0], lado0]);
        for (var ci = 0; ci < cands.length; ci++) {
          var c = [cands[ci][0], cands[ci][1]], fi = 0, lado = cands[ci][3]; fr = fr.length ? fr : [0.5]; var frc = cands[ci][2];
          var bx = caixaRot(c, u, hw, hh), livre = true;
          if (PG) livre = postoLivre(bx);
          else for (var j = 0; j < postos.length && livre; j++) if (!sepEixo(bx, postos[j])) livre = false;
          if (!livre) continue;
          /* ⚠ cruzar TUBO (peso ≥ 10) é sempre pior que cruzar o desenho em volta: a louça tem dezenas de arestas e,
             somadas sem teto, empurravam o rótulo para cima do próprio tubo (banheiro de exemplo, 17/10/2026) */
          var cr = 0, crT = 0;
          if (pertoBB) {
            /* FLUIDEZ: segmento cuja caixa nem encosta na caixa (alinhada aos eixos) do rótulo não pode cruzá-lo — pula o
               Liang-Barsky. Com coordenada não finita a comparação é falsa e o teste de sempre roda (mesmo resultado). */
            var ex0 = Math.min(bx[0][0], bx[1][0], bx[2][0], bx[3][0]) - 1e-6, ex1 = Math.max(bx[0][0], bx[1][0], bx[2][0], bx[3][0]) + 1e-6;
            var ey0 = Math.min(bx[0][1], bx[1][1], bx[2][1], bx[3][1]) - 1e-6, ey1 = Math.max(bx[0][1], bx[1][1], bx[2][1], bx[3][1]) + 1e-6;
            for (var pj = 0; pj < perto.length; pj++) {
              var bq = pertoBB[pj];
              /* ⚠ só pula com a caixa do segmento toda FINITA: com Infinity a conta antiga dá NaN e conta como cruzando */
              if (bq[4] && (bq[1] < ex0 || bq[0] > ex1 || bq[3] < ey0 || bq[2] > ey1)) continue;
              var ob = perto[pj]; if (segCruzaCaixa(ob.seg, c, u, hw, hh)) { if ((ob.peso || 1) >= 10) crT++; else cr++; }
            }
          } else perto.forEach(function (ob) { if (segCruzaCaixa(ob.seg, c, u, hw, hh)) { if ((ob.peso || 1) >= 10) crT++; else cr++; } });
          /* parede e desenho em volta: cruzar pesa mais (12) — o rótulo prefere se afastar a ficar em cima da parede */
          var custo = crT * 1000 + Math.min(cr, 30) * 12 + anel * 40 + Math.abs(frc - 0.5) * 2 + (lado > 0 ? 0.1 : 0) + ci * 0.01;
          cr = crT * 10 + cr;
          if (!melhor || custo < melhor.custo) melhor = { custo: custo, c: c, bx: bx, cr: cr };
        }
        if (melhor && melhor.cr === 0) break;   /* achou lugar limpo: não se afasta mais */
        if (melhor && melhor.cr < 10 && anel >= 3) break;   /* sem tubo cruzando e já longe: fica */
      }
      var o2 = {}; for (var k in r) if (Object.prototype.hasOwnProperty.call(r, k)) o2[k] = r[k];
      if (!melhor) { o2.semLugar = true; out[it.i] = o2; return; }
      postoGuardar(melhor.bx);
      o2.x = melhor.c[0]; o2.y = melhor.c[1]; o2.cruza = melhor.cr; o2.caixa = melhor.bx;
      /* LINHA DE CHAMADA: o rótulo que não coube junto do que ele marca (foi para longe) leva o traço até a peça/trecho */
      var ax = (A[0] + B[0]) / 2, ay = (A[1] + B[1]) / 2, vx = melhor.c[0] - ax, vy = melhor.c[1] - ay, dv = Math.sqrt(vx * vx + vy * vy);
      var perto = r.peca ? (hw + rp + h * 1.3) : (hh + h * 1.3);
      if (dv > perto && dv > 1e-9) { var cut = Math.min(dv * 0.92, Math.abs(vx / dv) * hw + Math.abs(vy / dv) * hh); o2.chamada = [ax + vx / dv * (r.peca ? rp : 0), ay + vy / dv * (r.peca ? rp : 0), melhor.c[0] - vx / dv * cut, melhor.c[1] - vy / dv * cut]; }
      out[it.i] = o2;
    });
    return out;
  }

  var BimInstNivel = {
    NIVEIS: NIVEIS, ORDEM: ORDEM, DICAS: DICAS, PADRAO_VISTA: PADRAO_VISTA, ESTILO_SIS: ESTILO_SIS, PENA_SIMBOLO: PENA_SIMBOLO, PENA_CONTORNO: PENA_CONTORNO,
    SIMBOLO_MM: SIMBOLO_MM, ESCALA_PADRAO: ESCALA_PADRAO,
    norm: norm, padraoVista: padraoVista, daVista: daVista, representacao: representacao, classeDaCategoria: classeDaCategoria,
    simboloConexao: simboloConexao, simboloAcessorio: simboloAcessorio, estiloSistema: estiloSistema, estiloSeg: estiloSeg,
    unifilar: unifilar, contornoFamilia: contornoFamilia, malhaLinhas: malhaLinhas, raioPena: raioPena, recortar: recortar, tamanho: tamanho,
    formas: formas, estiloPoly: estiloPoly, brilho: brilho, COR_CONEXAO: COR_CONEXAO, siglaPeca: siglaPeca, rotuloPeca: rotuloPeca, rotular: rotular, _sepEixo: sepEixo, _segCruzaCaixa: segCruzaCaixa, caixaRot: caixaRot
  };
  global.BimInstNivel = BimInstNivel;
  if (typeof module !== "undefined" && module.exports) module.exports = BimInstNivel;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
