/* =====================================================================
 * arqmodelo.js — O MODELO BIM LIDO PARA AS PRANCHAS DE ARQUITETURA
 * (motor PURO, ES5, Node-testável). Nada é desenhado aqui: só se lê o estado do
 * BimEdit.aplicar e se devolve DADOS planos (polígonos em [x, z], metros).
 *
 *   ArqModelo.extrair({ estado, avaliarFam }, opcoes) → {
 *     lista, fase, faseado,                       as fases do projeto e a fase de "agora"
 *     paredes[], lajes[], pilares[], ambientes[], vaos[], moveis[], luminarias[],
 *     telhados[], forros[], terreno{ divisa, subregioes[], componentes[], norte },
 *     pavimentos[{ nome, cota }], caixa [x0, z0, x1, z1], esquadrias[], avisos[] }
 *
 *   Todo item leva `status`: "novo" (a CONSTRUIR), "existente" (a MANTER), "demolido" (a DEMOLIR);
 *   "temporario", "futuro" e "passado" ficam fora das pranchas. A regra de fase é a do js/bimfases.js
 *   (criada/demolida); o que não tem marca é da fase nova — um modelo sem fases é todo "a construir".
 *
 *   opcoes = { fase, pavimentos: [{ nome, cota }], dimensoesPadrao: { porta, janela } }
 *
 * REGRAS DE LEITURA (escritas porque viram número):
 *   · PAREDE = caixa tipo "parede" (reta; a curva entra pela corda, com aviso). MURO = parede cujo
 *     tipo/nome/marca/comentário diz "muro" (ou `muro: true`): sai nas fachadas e na situação, não na planta do pavimento.
 *   · LAJE só vira ÁREA CONSTRUÍDA quando é piso: o topo dela está no térreo (≤ 0,30 m) ou na base de
 *     alguma parede/ambiente do mesmo pavimento — a laje de cobertura não conta como pavimento.
 *   · AMBIENTE herda o status da LAJE que o cobre; sem laje, a marca de fase dele; sem marca, "novo".
 *   · VÃO (porta/janela): tamanho = abertura da família; sem família avaliada, 0,80 × 2,10 (porta) e
 *     1,20 × 1,00 com peitoril 1,10 (janela) — marcado `dimPadrao` para sair no quadro como "conferir".
 *   · PAVIMENTO: as bases distintas das paredes (agrupadas a 0,30 m), do mais baixo para o mais alto.
 * Teste: tools/ (índices das pranchas de arquitetura)
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) { /* ausente */ } }
    return null;
  }
  function GEO() { return dep("ArqGeo", "./arqgeo.js"); }
  function BF() { return dep("BimFases", "./bimfases.js"); }
  function FR() { return dep("FamiliasRA", "./familiasra.js"); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function num(v, d) { var x = Number(v); return v != null && v !== "" && isFinite(x) ? x : d; }
  function r4(v) { return Math.round(v * 10000) / 10000; }

  var FASES_PADRAO = ["Existente", "Construção nova"];
  var TOL_PAV = 0.3, TOL_TERREO = 0.3;
  var DIM_PADRAO = { porta: { largura: 0.8, altura: 2.1, peitoril: 0 }, janela: { largura: 1.2, altura: 1.0, peitoril: 1.1 } };

  /* a categoria da família: o registro da casa, ou o id (ra-porta-*, ra-janela-*…) */
  function categoriaFam(famId) {
    var f = null, reg = FR();
    try { f = reg && reg.obter ? reg.obter(famId) : null; } catch (e) { f = null; }
    var c = f && f.categoria ? txt(f.categoria) : "";
    if (c) return c;
    var id = txt(famId).toLowerCase();
    if (/porta/.test(id)) return "porta";
    if (/janela/.test(id)) return "janela";
    if (/luminaria|lumin/.test(id)) return "luminaria";
    return "generico";
  }
  function nomeFam(famId, av) {
    var f = null, reg = FR();
    try { f = reg && reg.obter ? reg.obter(famId) : null; } catch (e) { f = null; }
    return f && f.nome ? txt(f.nome) : (av && av.nome ? txt(av.nome) : txt(famId));
  }
  function ehMuro(c) {
    if (c && c.muro === true) return true;
    return /muro/i.test([c && c.tipoParede, c && c.nome, c && c.marca, c && c.comentarios, c && c.categoria].map(txt).join(" "));
  }

  /* o status do elemento na fase de agora (sem o motor de fases: tudo "novo") */
  function statusFn(est, op) {
    var B = BF(), lista = B ? B.lista(est) : FASES_PADRAO.slice(), fase = txt(op && op.fase).trim();
    if (!fase || lista.indexOf(fase) < 0) fase = B ? B.faseNova(lista) : lista[lista.length - 1];
    var faseado = B ? B.faseado(est) : false;
    return { lista: lista, fase: fase, faseado: faseado, de: function (el) { return B ? B.statusDe(el, fase, lista) : "novo"; } };
  }

  /* a pegada da família no plano: caixa dos sólidos em coordenadas locais, girada por rotY e levada a (x, z) */
  function pegadaFamilia(av, f) {
    var G = GEO(), u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    arr(av && av.solidos).forEach(function (s) {
      var a, b, c, d;
      if (s.forma === "caixa") { a = num(s.x, 0) - num(s.dx, 0) / 2; b = num(s.x, 0) + num(s.dx, 0) / 2; c = num(s.z, 0) - num(s.dz, 0) / 2; d = num(s.z, 0) + num(s.dz, 0) / 2; }
      else if (s.forma === "cilindro" && s.eixo === "y") { a = num(s.x, 0) - num(s.raio, 0); b = num(s.x, 0) + num(s.raio, 0); c = num(s.z, 0) - num(s.raio, 0); d = num(s.z, 0) + num(s.raio, 0); }
      else if (s.forma === "cilindro") { var h = num(s.altura, 0) / 2, r = num(s.raio, 0); if (s.eixo === "x") { a = num(s.x, 0) - h; b = num(s.x, 0) + h; c = num(s.z, 0) - r; d = num(s.z, 0) + r; } else { a = num(s.x, 0) - r; b = num(s.x, 0) + r; c = num(s.z, 0) - h; d = num(s.z, 0) + h; } }
      else return;
      if (a < u0) u0 = a; if (b > u1) u1 = b; if (c < v0) v0 = c; if (d > v1) v1 = d;
    });
    /* família de MALHA (mobiliário, cozinha, banho, paisagismo: js/familiasmob*.js, familiaspais.js) não tem sólido caixa/cilindro: a pegada é a
       caixa local da própria família (av.caixa: x0..x1 largura, z0..z1 profundidade). Sem isto o móvel não entrava na planta de layout nem na humanizada. */
    if (u0 === Infinity && av && av.caixa && isFinite(av.caixa.x0) && isFinite(av.caixa.x1) && isFinite(av.caixa.z0) && isFinite(av.caixa.z1)) { u0 = av.caixa.x0; u1 = av.caixa.x1; v0 = av.caixa.z0; v1 = av.caixa.z1; }
    if (u0 === Infinity) return null;
    var cs = Math.cos(num(f.rotY, 0)), sn = Math.sin(num(f.rotY, 0)), fx = num(f.x, 0), fz = num(f.z, 0);
    return [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].map(function (q) { return [r4(fx + q[0] * cs + q[1] * sn), r4(fz - q[0] * sn + q[1] * cs)]; });
  }

  /* a peça de AÇO (js/metalpeca.js): a linha da barra em coordenadas do mundo (metal.cria, relativa ao centro, girada por rotY), a seção do perfil
     (a = a maior medida, b = a menor) ou, na chapa, a pegada e a espessura. Serve ao corte (onde o plano cruza a barra) e à fachada (a barra em elevação). */
  function metalDe(c, st, base) {
    var m = c.metal || {}, cr = m.cria, th = num(c.rotY, 0), cs = Math.cos(th), sn = Math.sin(th);
    function W(v) { return [r4(num(c.cx, 0) + v[0] * cs + v[2] * sn), r4(num(c.cy, 0) + v[1]), r4(num(c.cz, 0) - v[0] * sn + v[2] * cs)]; }
    var pf = m.perfil || {}, a = 0.05, b = 0.05;
    if (pf.forma === "I") { a = num(pf.d, 0.15); b = num(pf.bf, 0.1); }
    else if (pf.forma === "tubo-ret") { a = num(pf.h, 0.1); b = num(pf.b, 0.1); }
    else if (pf.forma === "frio") { a = num(pf.bw, 0.1); b = num(pf.bf, 0.05); }
    else if (pf.forma === "L") { a = num(pf.a, 0.05); b = num(pf.b, 0.05); }
    else if (pf.forma === "circ") { a = b = num(pf.d, 0.025); }
    if (m.kind === "chapa" || (m.t != null && !cr) || (cr && cr.ferr === "chapa")) {
      return { id: String(c.id), chapa: true, pts: G0().retCaixa(num(c.cx, 0), num(c.cz, 0), num(c.comprimento, 0.1), num(c.espessura, 0.1), th), base: r4(base), topo: r4(base + num(c.altura, 0.006)), status: st };
    }
    var pa = cr && cr.a ? W(cr.a) : [num(c.cx, 0), base, num(c.cz, 0)], pb = cr && cr.b ? W(cr.b) : [num(c.cx, 0), base + num(c.altura, 0), num(c.cz, 0)];
    return { id: String(c.id), chapa: false, a: pa, b: pb, sa: r4(Math.max(a, b)), sb: r4(Math.min(a, b)), status: st };
  }
  function G0() { return GEO(); }
  /* a caixa local (x0..x1 largura, y0..y1 altura, z0..z1 profundidade) de UM sólido da família avaliada: o mesmo critério do Familia.avaliar (caixaDe), por peça.
     Serve à ELEVAÇÃO dos interiores (js/arqinteriores.js): cada peça do móvel (porta, gaveta, tampo, painel) vira um retângulo na vista. */
  function caixaSolido(s) {
    var b = { x0: Infinity, y0: Infinity, z0: Infinity, x1: -Infinity, y1: -Infinity, z1: -Infinity };
    function p(x, y, z) { if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y; if (z < b.z0) b.z0 = z; if (z > b.z1) b.z1 = z; }
    var x = num(s.x, 0), y = num(s.y, 0), z = num(s.z, 0);
    if (s.forma === "caixa") { p(x - num(s.dx, 0) / 2, y, z - num(s.dz, 0) / 2); p(x + num(s.dx, 0) / 2, y + num(s.dy, 0), z + num(s.dz, 0) / 2); }
    else if (s.forma === "cilindro") {
      var r = num(s.raio, 0), h = num(s.altura, 0);
      if (s.eixo === "x") { p(x, y - r, z - r); p(x + h, y + r, z + r); }
      else if (s.eixo === "z") { p(x - r, y - r, z); p(x + r, y + r, z + h); }
      else { p(x - r, y, z - r); p(x + r, y + h, z + r); }
    } else if (s.forma === "malha" && arr(s.v).length >= 3) {
      for (var i = 0; i + 2 < s.v.length; i += 3) p(x + s.v[i], y + s.v[i + 1], z + s.v[i + 2]);
    } else if (arr(s.contorno).length) {
      arr(s.contorno).forEach(function (q) {
        if (s.plano === "frente") { p(x + q[0], y + q[1], z); p(x + q[0], y + q[1], z + num(s.altura, 0)); }
        else { p(x + q[0], y, z + q[1]); p(x + q[0], y + num(s.altura, 0), z + q[1]); }
      });
    }
    return b.x0 === Infinity ? null : b;
  }
  function agruparBases(valores, tol) {
    var v = valores.slice().sort(function (a, b) { return a - b; }), out = [], g = [];
    v.forEach(function (x) { if (g.length && x - g[g.length - 1] > tol) { out.push(g.reduce(function (s, q) { return s + q; }, 0) / g.length); g = []; } g.push(x); });
    if (g.length) out.push(g.reduce(function (s, q) { return s + q; }, 0) / g.length);
    return out;
  }
  function pavDe(pavs, cota) {
    var k = 0;
    for (var i = 0; i < pavs.length; i++) if (cota >= pavs[i].cota - TOL_PAV) k = i;
    return k;
  }

  function extrair(modelo, opcoes) {
    var G = GEO(), est = (modelo && modelo.estado) || {}, aval = modelo && modelo.avaliarFam, op = opcoes || {}, avisos = [];
    var S = statusFn(est, op), out = { lista: S.lista, fase: S.fase, faseado: S.faseado, avisos: avisos };
    var VIVOS = { novo: 1, existente: 1, demolido: 1 };
    if (!S.faseado) avisos.push("O modelo não tem fases (existente / demolir / construir): tudo sai como A CONSTRUIR. Marque a fase das peças para a convenção de reforma.");

    /* ---- paredes, pilares, lajes */
    out.paredes = []; out.pilares = []; out.lajes = []; out.vigas = []; out.metais = [];
    arr(est.caixas).forEach(function (c) {
      if (!c || c.id == null) return;
      var st = S.de(c); if (!VIVOS[st]) return;
      var base = num(c.cy, 0) - num(c.altura, 0) / 2;
      if (c.tipo === "parede" && num(c.comprimento, 0) > 0 && num(c.espessura, 0) > 0) {
        if (c.arco || c.curva) avisos.push("Parede " + c.id + " é curva: desenhada pela corda.");
        out.paredes.push({ id: String(c.id), pts: G.retCaixa(num(c.cx, 0), num(c.cz, 0), c.comprimento, c.espessura, num(c.rotY, 0)), cx: num(c.cx, 0), cz: num(c.cz, 0), comprimento: c.comprimento, espessura: c.espessura,
          rotY: num(c.rotY, 0), base: r4(base), topo: r4(base + num(c.altura, 0)), altura: num(c.altura, 0), status: st, muro: ehMuro(c), marca: txt(c.marca), tipoParede: txt(c.tipoParede) });
      } else if (c.tipo === "pilar") {
        out.pilares.push({ id: String(c.id), pts: G.retCaixa(num(c.cx, 0), num(c.cz, 0), num(c.comprimento, 0.2), num(c.espessura, 0.2), num(c.rotY, 0)), base: r4(base), topo: r4(base + num(c.altura, 0)), status: st });
      } else if (c.tipo === "viga") {
        /* viga de concreto (as do "Pré-lançar") ou de madeira (estrutura do telhado, base da caixa): o corte as mostra */
        out.vigas.push({ id: String(c.id), pts: G.retCaixa(num(c.cx, 0), num(c.cz, 0), num(c.comprimento, 0.2), num(c.espessura, 0.2), num(c.rotY, 0)), base: r4(base), topo: r4(base + num(c.altura, 0)), status: st,
          madeira: txt(c.material) === "madeira" || /^tec-/.test(String(c.id)) });
      } else if (c.tipo === "metal") {
        out.metais.push(metalDe(c, st, base));
      } else if (c.tipo === "laje") {
        var pts = arr(c.contorno).length >= 3 ? c.contorno.map(function (q) { return [num(q.x, 0), num(q.z, 0)]; }) : G.retCaixa(num(c.cx, 0), num(c.cz, 0), num(c.comprimento, 0), num(c.espessura, 0), 0);
        out.lajes.push({ id: String(c.id), pts: pts, area: G.areaPol(pts), topo: r4(num(c.cy, 0) + num(c.altura, 0) / 2), espessura: num(c.altura, 0), status: st });
      }
    });

    /* ---- pavimentos */
    var pavs = arr(op.pavimentos).filter(function (p) { return p && isFinite(+p.cota); }).map(function (p) { return { nome: txt(p.nome) || "Pavimento", cota: +p.cota }; });
    if (!pavs.length) {
      var bases = agruparBases(out.paredes.filter(function (w) { return !w.muro; }).map(function (w) { return w.base; }), TOL_PAV);
      if (!bases.length) bases = [0];
      pavs = bases.map(function (b, i) { return { nome: i === 0 ? "Térreo" : "Pavimento " + (i + 1), cota: r4(b) }; });
    }
    pavs.sort(function (a, b) { return a.cota - b.cota; });
    out.pavimentos = pavs;
    out.paredes.forEach(function (w) { w.pav = pavDe(pavs, w.base); });
    out.pilares.forEach(function (w) { w.pav = pavDe(pavs, w.base); });
    /* laje: piso se o topo está no térreo ou na base de alguma parede / pavimento */
    var basesPav = pavs.map(function (p) { return p.cota; });
    out.lajes.forEach(function (l) {
      var piso = l.topo <= TOL_TERREO + 1e-9 || basesPav.some(function (b) { return Math.abs(l.topo - b) <= TOL_PAV; });
      l.piso = piso; l.pav = pavDe(pavs, l.topo);
    });

    /* ---- ambientes */
    out.ambientes = [];
    arr(est.ambientes).forEach(function (a) {
      var c = a && a.calc;
      if (!c || c.estado !== "delimitado" || arr(c.contorno).length < 3) return;
      var pts = c.contorno.map(function (q) { return [num(q.x, 0), num(q.z, 0)]; }), cen = G.centroide(pts), base = num(c.base, 0), st = null;
      if (a.faseCriada || a.faseDemolida) st = S.de(a);
      if (!st) {
        out.lajes.forEach(function (l) { if (!st && l.piso && Math.abs(l.topo - base) <= 0.35 && G.pontoEmPol(cen, l.pts)) st = l.status; });
      }
      if (!st) st = S.de(a);
      if (!VIVOS[st]) return;
      var forroCota = null;
      arr(est.forros).forEach(function (f) { if (f && f.ambienteId === a.id && isFinite(+f.cota)) forroCota = +f.cota; });
      var pe = forroCota != null ? forroCota - base : num(c.altura, num(c.topo, base) - base);
      out.ambientes.push({ id: String(a.id), nome: txt(a.nome) || "Ambiente", numero: txt(a.numero || c.numeroAuto), pts: pts, area: num(c.area, G.areaPol(pts)), perimetro: num(c.perimetro, G.perimetro(pts)), cx: cen[0], cz: cen[1],
        base: base, pe: r4(pe), piso: txt(a.acabPiso), parede: txt(a.acabParede), forro: txt(a.acabForro), rodape: txt(a.acabBase), params: a.params || {}, status: st, pav: pavDe(pavs, base), bbox: G.bbox(pts) });
    });

    /* ---- famílias: vãos, móveis, luminárias */
    out.vaos = []; out.moveis = []; out.luminarias = []; out.eletricos = [];
    var parPorId = {}; out.paredes.forEach(function (w) { parPorId[w.id] = w; });
    arr(est.familias).forEach(function (f) {
      if (!f || f.id == null) return;
      var st = S.de(f); if (!VIVOS[st]) return;
      var cat = categoriaFam(f.famId), av = null;
      try { av = typeof aval === "function" ? aval(f.famId, f.tipoId, f.inst) : null; } catch (e) { av = null; }
      if (f.host && (cat === "porta" || cat === "janela")) {
        var par = parPorId[String(f.host.id)];
        if (!par) { avisos.push("Vão " + f.id + ": a parede " + f.host.id + " não está na fase de agora."); return; }
        var ab = av && av.abertura, dp = DIM_PADRAO[cat], padrao = !(ab && ab.largura > 0);
        var larg = padrao ? dp.largura : ab.largura, alt = padrao ? dp.altura : ab.altura, peit = padrao ? dp.peitoril : num(ab.peitoril, 0);
        if (padrao) avisos.push("Vão " + f.id + " (" + f.famId + "): sem dimensão avaliada, usei " + larg + " x " + alt + " m (conferir).");
        var ins = f.inst || {}, ab2 = ins.Abre_para_fora === true || ins.Abre_para_fora === "true";
        out.vaos.push({ id: String(f.id), tipo: cat, famId: f.famId, tipoId: txt(f.tipoId), nome: nomeFam(f.famId, av), parede: String(f.host.id), x: num(f.x, 0), z: num(f.z, 0), rotY: num(f.rotY, par.rotY),
          largura: r4(larg), altura: r4(alt), peitoril: r4(peit), dimPadrao: padrao, abreFora: ab2, maoDireita: ins.Mao_direita === true || ins.Mao_direita === "true", status: st, pav: par.pav, material: txt(ins.Material_folha || ins.Material_marco || ""), marca: txt(f.marca) });
        return;
      }
      var pts = pegadaFamilia(av, f);
      if (cat === "luminaria") {
        /* INTERIORES (luminotécnico): a família, o tipo, o tipo de luz e o circuito/comando que a instância traz */
        var regL = null; try { regL = FR() && FR().obter ? FR().obter(f.famId) : null; } catch (eL) { regL = null; }
        var vl = (av && av.valores) || {}, tpL = null; arr(regL && regL.tipos).forEach(function (tq) { if (tq && tq.id === f.tipoId) tpL = tq; });
        out.luminarias.push({ id: String(f.id), x: num(f.x, 0), z: num(f.z, 0), y: num(f.y, 0), nome: txt(f.famId), status: st, pav: pavDe(pavs, num(f.y, 0)), famId: f.famId, tipoId: txt(f.tipoId), nomeFam: nomeFam(f.famId, av), nomeTipo: tpL ? txt(tpL.nome) : "",
          kind: txt(regL && regL.luz) || (/^ra-ilum-/.test(txt(f.famId)) ? txt(f.famId).replace(/^ra-ilum-/, "").replace(/-/g, "_") : (/spot/.test(txt(vl.Modelo)) ? "spot_embutir" : "plafon")), modelo: txt(vl.Modelo), rotY: num(f.rotY, 0), alt: isFinite(+vl.Altura_montagem) ? +vl.Altura_montagem : null, comando: txt(vl.Comando), circuito: txt(vl.Circuito), circuitoQuadro: txt(vl.Circuito_quadro),
          comprimento: isFinite(+vl.Comprimento) ? +vl.Comprimento : null, largura: isFinite(+vl.Largura) ? +vl.Largura : (isFinite(+vl.Lado) ? +vl.Lado : null) });
        return;
      }
      if (cat === "dispositivo_eletrico") {
        /* INTERIORES (elétrico): tomadas e interruptores do modelo, com a Altura de montagem (do piso ao centro da caixa) que a família traz */
        var vd = (av && av.valores) || {}, altD = isFinite(+vd.Altura_montagem) ? +vd.Altura_montagem : null;
        out.eletricos.push({ id: String(f.id), famId: f.famId, tipoId: txt(f.tipoId), tipo: /interruptor/.test(txt(f.famId)) ? "interruptor" : (/tomada/.test(txt(f.famId)) ? "tomada" : "dispositivo"), nome: nomeFam(f.famId, av),
          x: num(f.x, 0), z: num(f.z, 0), alt: altD, rotY: num(f.rotY, 0), modulos: num(vd.Modulos, 1), sub: txt(vd.Tipo_interruptor || (vd.Corrente_A ? "2P+T " + vd.Corrente_A + " A" : "")), comandos: txt(vd.Comandos), status: st, pav: pavDe(pavs, num(f.y, 0)), origem: "familia" });
        return;
      }
      if (cat === "pilar" || cat === "viga" || cat === "dispositivo_eletrico" || cat === "equipamento_eletrico") return;
      if (!pts) return;
      var matsM = []; arr(av && av.solidos).forEach(function (so) { var mm = txt(so && so.material); if (mm && matsM.indexOf(mm) < 0 && matsM.length < 8) matsM.push(mm); });
      /* INTERIORES: as peças do móvel (uma caixa local por sólido), os valores dos parâmetros e quais são MATERIAL (a nota de material da vista sai deles) */
      var pecasM = [], regF = null; try { regF = FR() && FR().obter ? FR().obter(f.famId) : null; } catch (eR) { regF = null; }
      arr(av && av.solidos).slice(0, 160).forEach(function (so) { var bx = caixaSolido(so); if (bx) pecasM.push({ x0: r4(bx.x0), x1: r4(bx.x1), y0: r4(bx.y0), y1: r4(bx.y1), z0: r4(bx.z0), z1: r4(bx.z1), mat: txt(so.material || so.nome) }); });
      var valM = {}; Object.keys((av && av.valores) || {}).forEach(function (kv) { var vv = av.valores[kv]; if (typeof vv === "string" || typeof vv === "number" || typeof vv === "boolean") valM[kv] = vv; });
      var parMat = arr(regF && regF.parametros).filter(function (pp) { return pp && pp.tipoDado === "material"; }).map(function (pp) { return pp.nome; });
      var temEstado = arr(regF && regF.parametros).some(function (pp) { return pp && pp.nome === "Aberto"; });
      out.moveis.push({ id: String(f.id), famId: f.famId, tipoId: txt(f.tipoId), nome: nomeFam(f.famId, av), categoria: cat, pts: pts, pecas: pecasM, valores: valM, parMat: parMat, temEstado: temEstado, inst: f.inst || {}, caixaLocal: (av && av.caixa) || null, h0: r4(num(f.y, 0) + num(av && av.caixa && av.caixa.y0, 0)), h1: r4(num(f.y, 0) + num(av && av.caixa && av.caixa.y1, 0)), mats: matsM, simbolo: (av && av.simboloPlanta) || null, x: num(f.x, 0), z: num(f.z, 0), y: num(f.y, 0), rotY: num(f.rotY, 0), status: st, pav: pavDe(pavs, num(f.y, 0)),
        solidos: arr(av && av.solidos).slice(0, 40).map(function (s) { return { forma: s.forma, x: s.x, y: s.y, z: s.z, dx: s.dx, dy: s.dy, dz: s.dz, raio: s.raio, altura: s.altura, eixo: s.eixo, material: s.material, cor: s.cor }; }) });
    });
    /* marcas P1, P2… J1, J2…: um código por TIPO de vão (família + tipo + tamanho), na ordem em que aparecem */
    var cods = { porta: [], janela: [] }, quad = {};
    out.vaos.forEach(function (v) {
      var chave = [v.famId, v.tipoId, v.largura, v.altura, v.peitoril].join("|"), L = cods[v.tipo];
      if (L.indexOf(chave) < 0) L.push(chave);
      v.cod = (v.tipo === "porta" ? "P" : "J") + (L.indexOf(chave) + 1);
      var q = quad[v.cod] || (quad[v.cod] = { cod: v.cod, tipo: v.tipo, famId: v.famId, nome: v.nome, largura: v.largura, altura: v.altura, peitoril: v.peitoril, material: v.material, dimPadrao: v.dimPadrao, qtd: { novo: 0, existente: 0, demolido: 0 }, ids: [] });
      q.qtd[v.status] = (q.qtd[v.status] || 0) + 1; q.ids.push(v.id);
    });
    out.esquadrias = Object.keys(quad).sort(function (a, b) { return a.charAt(0) === b.charAt(0) ? num(a.slice(1), 0) - num(b.slice(1), 0) : (a.charAt(0) < b.charAt(0) ? 1 : -1); }).map(function (k) { return quad[k]; });

    /* ---- telhados, forros */
    out.telhados = arr(est.telhados).filter(function (t) { return t && t.ok !== false && arr(t.contorno).length >= 3; }).map(function (t) {
      var st = S.de(t); if (!VIVOS[st]) return null;
      return { id: String(t.id), pts: t.contorno.map(function (q) { return [num(q.x, 0), num(q.z, 0)]; }), beiral: num(t.beiral, 0), inclinacao: num(t.inclinacao, 0), area: num(t.area, 0), areaProjecao: num(t.areaProjecao, 0), cumeeira: num(t.cumeeira, 0),
        pBeiral: (function () { var P = arr(t.arestasCalc).map(function (a) { return a && a.beiral && a.beiral.a ? [num(a.beiral.a.x, 0), num(a.beiral.a.z, 0)] : null; }); return P.length >= 3 && P.every(function (q) { return !!q; }) ? P : null; })(),
        espigao: num(t.espigao, 0), rincao: num(t.rincao, 0), nAguas: num(t.nAguas, 0), cotaCumeeira: num(t.cotaCumeeira, 0), cotaApoio: num(t.cotaApoio, 0), tipo: txt(t.tipoTelhado && t.tipoTelhado.rotulo), aguas: arr(t.aguasCalc), arestas: arr(t.arestasCalc), status: st };
    }).filter(function (t) { return !!t; });
    out.bordas = arr(est.bordas);
    out.forros = arr(est.forros).filter(function (f) { return f && f.ok !== false && arr(f.contorno).length >= 3; }).map(function (f) {
      var st = S.de(f); if (!VIVOS[st]) return null;
      return { id: String(f.id), pts: f.contorno.map(function (q) { return [num(q.x, 0), num(q.z, 0)]; }), cota: num(f.cota, 0), tipo: txt(f.tipoForro && f.tipoForro.rotulo), tipoId: txt(f.tipoId), area: num(f.area, 0), ambienteId: txt(f.ambienteId), inclinacao: num(f.inclinacao, 0), sanca: f.sanca || null, status: st };
    }).filter(function (f) { return !!f; });

    /* ---- FUNDAÇÕES (bloco, estacas, baldrame), CALHAS e o que a fachada e o corte precisam saber das instalações aparentes */
    out.fundacoes = arr(est.fundacoes).filter(function (f) { return f && f.ok !== false && arr(f.planta).length >= 3; }).map(function (f) {
      var st = S.de(f); if (!VIVOS[st]) return null;
      return { id: String(f.id), tipo: txt(f.tipoFundacao), pts: f.planta.map(function (q) { return [num(q.x, 0), num(q.z, 0)]; }), topo: num(f.cotaTopo, 0), base: num(f.cotaFundo, num(f.cotaTopo, 0) - num(f.altura, 0)),
        estacas: arr(f.estacas).map(function (e) { return { x: num(e.x, 0), z: num(e.z, 0) }; }), dEstaca: num(f.diametroEf, num(f.diametro, 0)), ponta: isFinite(+f.cotaPontaEstacas) ? +f.cotaPontaEstacas : null, status: st };
    }).filter(function (f) { return !!f; });
    /* a "cobertura" de uma água (js/bimedit.js cobertura) que o projeto usa como regularização com caimento da laje descoberta: o sentido da água (para onde desce) */
    out.caimentos = arr(est.coberturas).filter(function (cb) { return cb && arr(cb.planos).length === 1; }).map(function (cb) {
      var st = S.de(cb); if (!VIVOS[st]) return null;
      var p = cb.planos[0], sg = num(p.rotX, 0) > 0 ? 1 : -1, alongX = Math.abs(Math.sin(num(p.rotY, 0))) > 0.5;
      return { id: String(cb.id), x0: num(cb.x0, 0), z0: num(cb.z0, 0), x1: num(cb.x1, 0), z1: num(cb.z1, 0), dir: alongX ? [sg, 0] : [0, sg], pct: num(cb.inclinacao, 0), status: st };
    }).filter(function (q) { return !!q; });
    out.calhas = [];
    arr(est.calhasEmbutidas).forEach(function (k) {
      arr(k && k.segs).forEach(function (s) {
        if (arr(s.quad).length >= 3) out.calhas.push({ id: String(k.id), pts: s.quad.map(function (q) { return [num(q.x, 0), num(q.z, 0)]; }), base: num(s.yFundo, 0), topo: num(s.yBorda, 0), status: "novo" });
      });
    });
    /* tubos APARENTES na fachada: as descidas e o ladrão do pluvial, o ventilador primário e o alimentador de água (os que sobem fora da parede) */
    out.tubosAparentes = arr(est.instalacoes && est.instalacoes.trechos).filter(function (t) {
      return t && t.p1 && t.p2 && /^(tel-calha|AP-AT-|AF-ALIM-|VE-PRIM-|bar-caixa1-(extravasor|limpeza))/.test(String(t.id)) && Math.max(num(t.p1.y, 0), num(t.p2.y, 0)) > 0.05;
    }).map(function (t) { return { id: String(t.id), sistema: txt(t.sistema), dn: num(t.dn, 50), a: [num(t.p1.x, 0), num(t.p1.y, 0), num(t.p1.z, 0)], b: [num(t.p2.x, 0), num(t.p2.y, 0), num(t.p2.z, 0)] }; });

    /* caixas elétricas das instalações (caixa 4×2 e 4×4 da parede) que NÃO coincidem com um dispositivo já lido (a 6 cm): ponto do modelo sem a família do dispositivo */
    arr(est.instalacoes && est.instalacoes.pecas).forEach(function (pc) {
      if (!pc || pc.sistema !== "eletrica" || !/^caixa_4x[24]$/.test(txt(pc.peca))) return;
      var px = num(pc.x, NaN), pz = num(pc.z, NaN); if (!isFinite(px) || !isFinite(pz)) return;
      if (out.eletricos.some(function (e) { return Math.abs(e.x - px) < 0.06 && Math.abs(e.z - pz) < 0.06; })) return;
      var altC = isFinite(+pc.alturaPiso) && pc.alturaPiso !== null ? +pc.alturaPiso : num(pc.y, NaN);
      out.eletricos.push({ id: String(pc.id), famId: "", tipoId: "", tipo: "caixa", nome: txt(pc.peca) === "caixa_4x4" ? "Caixa 4x4" : "Caixa 4x2", x: px, z: pz, alt: isFinite(altC) ? altC : null, rotY: num(pc.rotY, 0), modulos: 1, sub: "", comandos: "", status: "novo", pav: pavDe(pavs, num(pc.y, 0)), origem: "instalacao" });
    });
    /* sancas dos forros (o recuo e a profundidade vêm do forro de drywall): o detalhe 1:10 do luminotécnico só existe quando há sanca */
    out.sancas = arr(est.sancas).filter(function (sa) { return sa && sa.ok; }).map(function (sa) { return { id: String(sa.id), forro: String(sa.forro), recuo: num(sa.recuoEf, num(sa.recuo, 0)), profundidade: num(sa.profundidade, 0), comprimento: num(sa.comprimento, 0), luz: !!sa.luz }; });

    /* ---- terreno */
    var T = est.terreno || {}, dv = arr(T.divisas).filter(function (d) { return d && d.ok !== false && arr(d.contorno).length >= 3; })[0] || null;
    out.terreno = {
      divisa: dv ? { id: String(dv.id), nome: txt(dv.nome), pts: dv.contorno.map(function (q) { return [num(q.x, 0), num(q.z, 0)]; }), area: num(dv.area, 0), perimetro: num(dv.perimetro, 0), segmentos: arr(dv.segmentos) } : null,
      subregioes: arr(T.subregioes).filter(function (s) { return s && arr(s.contorno).length >= 3; }).map(function (s) { return { id: String(s.id), nome: txt(s.nome), material: txt(s.material), pts: s.contorno.map(function (q) { return [num(q.x, 0), num(q.z, 0)]; }) }; }),
      componentes: arr(T.componentes).map(function (c) { return { id: String(c.id), tipo: txt(c.tipoComp), rotulo: txt(c.rotulo), x: num(c.x, 0), z: num(c.z, 0), altura: num(c.alturaEf || c.altura, 0) }; }),
      norte: T.implantacao && isFinite(+T.implantacao.anguloNorte) ? +T.implantacao.anguloNorte : 0
    };

    /* ---- caixa de tudo (planta) */
    var xs = [], zs = [];
    function add(P) { arr(P).forEach(function (p) { xs.push(p[0]); zs.push(p[1]); }); }
    out.paredes.forEach(function (w) { if (!w.muro) add(w.pts); }); out.lajes.forEach(function (l) { add(l.pts); }); out.telhados.forEach(function (t) { add(t.pts); });
    out.caixa = xs.length ? [Math.min.apply(null, xs), Math.min.apply(null, zs), Math.max.apply(null, xs), Math.max.apply(null, zs)] : [0, 0, 1, 1];
    return out;
  }

  var ArqModelo = { extrair: extrair, caixaSolido: caixaSolido, categoriaFam: categoriaFam, ehMuro: ehMuro, pegadaFamilia: pegadaFamilia, DIM_PADRAO: DIM_PADRAO, TOL_PAV: TOL_PAV, TOL_TERREO: TOL_TERREO };
  global.ArqModelo = ArqModelo;
  if (typeof module !== "undefined" && module.exports) module.exports = ArqModelo;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
