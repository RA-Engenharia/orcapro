/* =====================================================================
 * bimelevar.js — ELEVAR A SELEÇÃO (motor PURO, ES5, sem DOM, Node-testável).
 * 15/10/2026, frente F1 da 1.2.147 (item 41 do BACKLOG-PEDIDOS).
 *
 * Pedido do Rogério (15/10/2026): "quando eu selecionar um objeto no 3D, ter
 * a opção de subir ele na altura. Coloquei umas vigas, era para ficar no topo
 * do pilar e ficou embaixo; nas Propriedades não tem como subir. Quero subir a
 * altura que eu quiser, ou subir para um nível, com ele selecionado. Para
 * todos os elementos."
 *
 * O QUE ACONTECIA: o Mover (js/bimprecisao.js) é de PLANTA (dx, dz): nada
 * subia. A viga metálica horizontal só tinha "Cota da linha" nas
 * Propriedades, e no pilar a "Cota da base" ESTICAVA o pilar em vez de
 * levá-lo inteiro. Parede, laje, caixa e família sem nível não subiam.
 *
 * TRÊS MANEIRAS (o diálogo "Elevar" e as Propriedades usam as mesmas):
 *   delta ..... subir/descer X m (negativo desce) — `planoDelta`;
 *   nível ..... levar a BASE (ou o TOPO) de cada peça a um nível + deslocamento
 *               — `planoNivel` (cada peça anda o quanto precisa);
 *   apoio ..... alinhar o topo da viga com o topo da peça de apoio: o pilar em
 *               que a ponta da viga encosta EM PLANTA — `planoApoio`. Sem
 *               apoio, ou com apoios de topos diferentes nas duas pontas, a
 *               viga NÃO anda e a mensagem diz por quê (nunca adivinha).
 *   topo ...... "Elevação do topo" nas Propriedades: na peça VERTICAL (pilar,
 *               parede) muda a altura (o comprimento) e a base fica; na
 *               horizontal leva a peça inteira — `planoTopo`.
 *
 * A OP (uma regra só, no replay e na previsão dos vínculos — `elevarEl`):
 *   { op:"elevar", ids:[…], dy }            a peça inteira sobe dy (m)
 *   { op:"elevar", ids:[…], dy, so:"topo" } parede/pilar: só o topo (altura + dy)
 *   O pilar metálico vertical que muda o topo vai pela op `metalAjustar` que
 *   já existe (MetalCriar.editar com `topo`).
 *   Várias ops (cada peça com o seu dy) = UM lote (um Ctrl+Z desfaz tudo).
 *   A FORMA da op mora no BimEdit.opElevarValida: o sanear não perde a op numa
 *   tela que não carregou este motor.
 *
 * O QUE SOBE JUNTO DENTRO DA PEÇA: cy; basePilar e topoViga (pilar e viga com
 * perfil); escada.par.base, rampa.par.base, guarda.pts[].y (o derivar refaz a
 * peça por eles); a peça PRESA A NÍVEL sobe pelo deslocamento (deslocBase e,
 * com restrição superior, deslocSuperior) — senão o replay a devolvia ao
 * nível; a peça metálica que ACOMPANHA o nível (metal.cria.nivel) idem
 * (deslBase/deslTopo, desl). Família solta: y. Cobertura: base, cumeeira e os
 * planos. Volume livre: a receita ganha um "mover" com dy.
 * FICAM DE FORA (com a mensagem): peça fixada; porta/janela na parede (anda
 * com a parede); guarda-corpo da escada (anda com a escada); forro, telhado,
 * borda, fundação, ambiente, terreno e instalações (têm o deslocamento deles
 * nas Propriedades).
 *
 * Os VÍNCULOS (js/bimvinculos.js): a tela passa a op pelo motor — o que está
 * amarrado acompanha pela regra de lá (Alt = só a seleção), a ligação
 * dimensionada fica DESATUALIZADA, e a assinatura do cálculo muda.
 * Teste: node tools/test-bimelevar.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  function MC() { return dep("MetalCriar", "./metalcriar.js"); }
  function Vinc() { return dep("BimVinculos", "./bimvinculos.js"); }

  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function txt(v) { return v == null ? "" : String(v); }
  /* 1234.5 → "1.234,50" (m, com sinal) */
  function br(v, casas) {
    casas = casas == null ? 2 : casas;
    var s = (Math.round(num(v, 0) * Math.pow(10, casas)) / Math.pow(10, casas)).toFixed(casas), neg = s.charAt(0) === "-";
    if (neg) s = s.slice(1);
    var p = s.split(".");
    var t = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (p[1] ? "," + p[1] : "");
    return (neg && !/^0(,0*)?$/.test(t) ? "−" : "") + t;
  }
  function sinal(v) { var t = br(v); return num(v, 0) > 0 && t !== "0,00" ? "+" + t : t; }

  var MAX_DY = 200;          /* o mesmo teto do deslocamento de nível (BimArq.normRestr) */
  var TOL_APOIO = 0.01;      /* a ponta encosta no apoio: 1 cm além da pegada (mais meia largura da viga) */
  var TOL_TOPO = 0.001;      /* dois apoios "com o mesmo topo": 1 mm */
  var HORIZ = 0.02;          /* barra horizontal: inclinação abaixo de ~1° */

  /* ================================================================ NÚMERO
   * A distância digitada em METROS: "0,5" · "-0,30" · "−0,3" · "1.234,5" · "30 cm"
   * · "300 mm" · "+0,30". Outra unidade (kgf, kN…) é recusada.
   * → { ok, valor, relativo (veio com sinal explícito) } | { ok:false, erro } */
  function lerMetros(bruto) {
    var s = txt(bruto).trim().replace(/\s+/g, " ").replace(/[−–]/g, "-");
    if (!s) return { ok: false, erro: "Digite a distância em metros (ex.: 0,50 ou -0,30)." };
    var m = /^([+-]?)\s*([\d.,]+)\s*([^\d\s.,+-][^\s]*)?$/.exec(s);
    if (!m) return { ok: false, erro: "Número inválido: \"" + s + "\" (use vírgula: 0,50)." };
    var u = (m[3] || "").toLowerCase();
    if (u && u !== "m" && u !== "cm" && u !== "mm") return { ok: false, erro: "Unidade \"" + m[3] + "\" não serve aqui: a distância é em metros (m, cm ou mm)." };
    var n = m[2];
    if (n.indexOf(",") >= 0) n = n.replace(/\./g, "").replace(",", ".");
    else if ((n.match(/\./g) || []).length > 1) n = n.replace(/\./g, "");
    if (!/^\d*\.?\d+$|^\d+\.$/.test(n)) return { ok: false, erro: "Número inválido: \"" + s + "\"." };
    var v = parseFloat(n);
    if (!isFinite(v)) return { ok: false, erro: "Número inválido: \"" + s + "\"." };
    if (u === "cm") v /= 100; else if (u === "mm") v /= 1000;
    if (m[1] === "-") v = -v;
    v = r6(v);
    if (Math.abs(v) > MAX_DY) return { ok: false, erro: "Mais de " + MAX_DY + " m: confira o valor." };
    return { ok: true, valor: v, relativo: !!m[1] };
  }

  /* ================================================================ A PEÇA
   * Onde está a peça no estado AVALIADO do editor e o que se sabe da altura
   * dela: { id, k:'caixa'|'familia'|'cobertura'|'volume', el, nome, base, topo
   * (null = não se sabe), vertical, metalVertical, linear (viga/barra
   * horizontal: pontas em planta), host (anda com outra peça), motivo (não
   * sobe por aqui) } | null */
  var OUTRAS = { forros: "o forro", telhados: "o telhado", bordas: "a borda", fundacoes: "a fundação", ambientes: "o ambiente" };
  function presa(c) { return !!c && (c.nivelBase != null || c.nivelId != null) && fin(c.deslocBase); }
  function nomeDe(k, el) {
    if (!el) return "A peça";
    if (k === "caixa" && el.tipo === "metal" && el.metal) { var BM = dep("BimMetal", "./metalpeca.js"); try { if (BM && BM.nome) return BM.nome(el); } catch (e) {} return "A peça metálica"; }
    if (k === "familia") return el.nome || (el.inst && el.inst.Nome) || "A família";
    if (k === "cobertura") return "A cobertura";
    if (k === "volume") return el.nome || "O volume";
    var r = { parede: "A parede", viga: "A viga", pilar: "O pilar", laje: "A laje", escada: "A escada", guarda: "O guarda-corpo", rampa: "A rampa" }[el.tipo] || "A peça";
    return r + (el.marca ? " " + el.marca : "");
  }
  function linhaMetal(c) {
    var M = MC(); if (!M || !c || c.tipo !== "metal" || !c.metal || c.metal.kind !== "perfil") return null;
    try { var li = M.linhaAtual(c); return li && li.a && li.b ? li : null; } catch (e) { return null; }
  }
  function info(estado, id) {
    var s = String(id).replace(/^edit:/, ""), L = [["caixa", "caixas"], ["familia", "familias"], ["cobertura", "coberturas"], ["volume", "volumes"]];
    for (var i = 0; i < L.length; i++) {
      var l = arr(estado && estado[L[i][1]]);
      for (var j = 0; j < l.length; j++) if (l[j] && String(l[j].id) === s) return infoEl(L[i][0], l[j]);
    }
    var ks = Object.keys(OUTRAS);
    for (var q = 0; q < ks.length; q++) if (arr(estado && estado[ks[q]]).some(function (x) { return x && String(x.id) === s; }))
      return { id: s, k: ks[q], el: null, nome: OUTRAS[ks[q]].replace(/^./, function (c) { return c.toUpperCase(); }), base: null, topo: null, motivo: OUTRAS[ks[q]] + " sobe pelo deslocamento do nível dele (Propriedades)" };
    return null;
  }
  function infoEl(k, el) {
    var o = { id: String(el.id), k: k, el: el, nome: nomeDe(k, el), base: null, topo: null, vertical: false, metalVertical: false, linear: null, host: null, motivo: null };
    if (el.fixo) o.motivo = "está fixada (Desafixar solta a peça)";
    if (k === "caixa") {
      if (fin(num(el.cy, NaN)) && fin(num(el.altura, NaN))) { o.base = r6(num(el.cy, 0) - num(el.altura, 0) / 2); o.topo = r6(num(el.cy, 0) + num(el.altura, 0) / 2); }
      if (el.tipo === "metal") {
        var li = linhaMetal(el);
        if (li) {
          var d = [li.b[0] - li.a[0], li.b[1] - li.a[1], li.b[2] - li.a[2]], Ld = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]) || 1;
          o.metalVertical = Math.abs(d[1]) / Ld > 0.999; o.vertical = o.metalVertical;
          if (Math.abs(d[1]) / Ld < HORIZ) o.linear = { a: li.a.slice(), b: li.b.slice(), larg: num(el.espessura, 0.1) };
          else if (!o.metalVertical) o.inclinada = true;
        }
      } else if (el.tipo === "pilar" || el.tipo === "parede") o.vertical = true;
      if (el.tipo === "viga" && !el.metal) {
        var th = num(el.rotY, 0), co = Math.cos(th), si = Math.sin(th), Lh = num(el.comprimento, 0), cx = num(el.cx, 0), cz = num(el.cz, 0);
        if (Math.abs(num(el.dIni, 0) - num(el.dFim, 0)) < 1e-3) o.linear = { a: [cx - co * Lh / 2, o.topo, cz + si * Lh / 2], b: [cx + co * Lh / 2, o.topo, cz - si * Lh / 2], larg: num(el.espessura, 0.14) };
        else o.inclinada = true;
      }
      if (el.tipo === "guarda" && el.guarda && el.guarda.host && el.guarda.host.id != null) { o.host = String(el.guarda.host.id); o.motivo = o.motivo || "o guarda-corpo acompanha a escada/rampa em que está"; }
    } else if (k === "familia") {
      if (el.host && el.host.id != null) { o.host = String(el.host.id); o.motivo = o.motivo || "a porta/janela anda com a parede (a altura dela é o peitoril, nas Propriedades)"; }
      if (fin(num(el.y, NaN))) o.base = r6(num(el.y, 0));
    } else if (k === "cobertura") {
      if (fin(num(el.base, NaN))) o.base = r6(num(el.base, 0));
      if (fin(num(el.cumeeira, NaN))) o.topo = r6(num(el.cumeeira, 0));
    }
    return o;
  }

  /* ================================================================ A REGRA
   * A peça (cópia) que subiu dy. k = 'caixa'|'familia'|'cobertura'|'volume';
   * o = { so: 'topo' } (parede/pilar: só o topo). → a peça nova | { erro } */
  function elevarEl(k, el, dy, o) {
    o = o || {};
    if (!el || !fin(dy)) return { erro: "Elevação inválida." };
    var c = clone(el);
    if (k === "familia") { if (c.host) return { erro: "a porta/janela anda com a parede" }; c.y = r4(num(c.y, 0) + dy); return c; }
    if (k === "volume") { if (!c.receita) return { erro: "volume sem receita" }; c.receita = { forma: "mover", base: c.receita, dx: 0, dy: r4(dy), dz: 0 }; return c; }
    if (k === "cobertura") {
      if (presa(c)) c.deslocBase = r6(c.deslocBase + dy);
      c.base = r6(num(c.base, 0) + dy); if (c.cumeeira != null) c.cumeeira = r6(num(c.cumeeira, 0) + dy);
      arr(c.planos).forEach(function (p) { p.cy = r6(num(p.cy, 0) + dy); });
      return c;
    }
    if (k !== "caixa") return { erro: "esta peça não sobe por aqui" };
    if (o.so === "topo") {
      if (!(c.tipo === "parede" || c.tipo === "pilar") || c.tipo === "metal") return { erro: "só a parede e o pilar mudam o topo por aqui" };
      var H0 = num(c.altura, 0), H = r6(H0 + dy);
      if (!(H >= 0.1 - 1e-9)) return { erro: "o topo ficaria abaixo da base (ou a menos de 10 cm dela)" };
      if (presa(c)) {
        if (c.restricaoSuperior != null && c.restricaoSuperior !== "") c.deslocSuperior = r6(num(c.deslocSuperior, 0) + dy);
        else c.alturaNaoConectada = r6((fin(c.alturaNaoConectada) && c.alturaNaoConectada >= 0.1 ? c.alturaNaoConectada : H0) + dy);
      }
      var f = H0 > 1e-9 ? H / H0 : 1;
      c.altura = H; c.cy = r6(num(c.cy, 0) + dy / 2);
      if (fin(c.alturaEfetiva)) c.alturaEfetiva = r6(c.alturaEfetiva + dy);
      ["area", "volume", "areaForma"].forEach(function (q) { if (fin(c[q])) c[q] = r4(c[q] * f); });
      if (fin(c.comprimentoPilar)) c.comprimentoPilar = r4(H);
      return c;
    }
    c.cy = r6(num(c.cy, 0) + dy);
    if (c.basePilar != null && fin(num(c.basePilar, NaN))) c.basePilar = r6(num(c.basePilar, 0) + dy);
    if (c.topoViga != null && fin(num(c.topoViga, NaN))) c.topoViga = r6(num(c.topoViga, 0) + dy);
    if (c.escada && c.escada.par && c.escada.par.base != null) c.escada.par.base = r6(num(c.escada.par.base, 0) + dy);
    if (c.rampa && c.rampa.par && c.rampa.par.base != null) c.rampa.par.base = r6(num(c.rampa.par.base, 0) + dy);
    if (c.guarda && !c.guarda.host) arr(c.guarda.pts).forEach(function (p) { if (p && p.y != null) p.y = r6(num(p.y, 0) + dy); });
    arr(c.contorno).forEach(function (p) { if (p && typeof p === "object" && !Array.isArray(p) && p.y != null) p.y = r6(num(p.y, 0) + dy); });
    /* presa a nível: o replay a põe no nível + deslocamento — o deslocamento sobe junto */
    if (presa(c)) {
      c.deslocBase = r6(c.deslocBase + dy);
      if (c.restricaoSuperior != null && c.restricaoSuperior !== "") c.deslocSuperior = r6(num(c.deslocSuperior, 0) + dy);
    }
    /* a peça metálica que ACOMPANHA o nível (js/metalcriar.js seguirNiveis) */
    var nv = c.metal && c.metal.cria && c.metal.cria.nivel;
    if (nv && typeof nv === "object") {
      if (c.metal.cria.ferr === "pilar") {
        nv.deslBase = r6(num(nv.deslBase, 0) + dy);
        if (nv.topo && nv.topo !== "altura") nv.deslTopo = r6(num(nv.deslTopo, 0) + dy);
      } else if (nv.nivel != null) nv.desl = r6(num(nv.desl, 0) + dy);
    }
    return c;
  }

  /* ================================================================ OS PLANOS
   * Todos devolvem { ok, itens:[{id, dy, so?, info}], pulos:[{id, nome, motivo}],
   * ops:[…] (as ops cruas, sem vínculos), resumo, erro? }. ok:false = nada
   * para mover (e o erro diz por quê). */
  function selecionados(estado, ids) {
    var vistos = {}, out = [];
    arr(ids).forEach(function (id0) { var id = String(id0).replace(/^edit:/, ""); if (vistos[id]) return; vistos[id] = 1; var f = info(estado, id); out.push(f || { id: id, nome: "A peça " + id, motivo: "não é uma peça do modelo editável (IFC importado?)" }); });
    return out;
  }
  /* quem anda com outra peça que também está na seleção some sem aviso (a porta da parede selecionada) */
  function filtrar(lista) {
    var na = {}; lista.forEach(function (f) { na[f.id] = 1; });
    var ok = [], pulos = [];
    lista.forEach(function (f) {
      if (f.host && na[f.host] && !(f.el && f.el.fixo)) return;
      if (f.motivo) { pulos.push({ id: f.id, nome: f.nome, motivo: f.motivo }); return; }
      ok.push(f);
    });
    return { ok: ok, pulos: pulos };
  }
  /* os itens → as ops: uma op por (dy, so), na ordem; o metalAjustar vai como veio */
  function opsDe(itens) {
    var grupos = [], porK = {};
    itens.forEach(function (it) {
      if (it.op) { grupos.push({ op: it.op }); return; }
      var k = r6(it.dy) + "|" + (it.so || "");
      if (!porK[k]) { porK[k] = { op: { op: "elevar", ids: [], dy: r6(it.dy) } }; if (it.so) porK[k].op.so = it.so; grupos.push(porK[k]); }
      porK[k].op.ids.push(it.id);
    });
    return grupos.map(function (g) { return g.op; });
  }
  function fechar(itens, pulos, rotulo, semNada) {
    var mexe = itens.filter(function (it) { return it.op || Math.abs(it.dy) > 1e-6; }), ja = itens.length - mexe.length;
    var r = { ok: mexe.length > 0, itens: mexe, pulos: pulos, ja: ja, ops: opsDe(mexe), resumo: "" };
    var partes = [];
    if (mexe.length) partes.push(rotulo(mexe));
    if (ja) partes.push(ja + (ja === 1 ? " já estava na cota" : " já estavam na cota"));
    if (pulos.length) partes.push(pulos.length + (pulos.length === 1 ? " ficou de fora" : " ficaram de fora") + " (" + pulos.slice(0, 3).map(function (p) { return p.nome + ": " + p.motivo; }).join("; ") + (pulos.length > 3 ? "; …" : "") + ")");
    r.resumo = partes.join(" · ");
    if (!r.ok) r.erro = semNada || (pulos.length ? "Nada se moveu: " + pulos.slice(0, 3).map(function (p) { return p.nome + " — " + p.motivo; }).join("; ") + (pulos.length > 3 ? "; …" : "") + "." : (ja ? "Nada se moveu: já está na cota pedida." : "Selecione as peças que vão subir (Ctrl+clique soma)."));
    return r;
  }
  function plural(n, um, varios) { return n + " " + (n === 1 ? um : varios); }

  /* (a) subir/descer dy m */
  function planoDelta(estado, ids, dy) {
    if (!fin(dy)) return { ok: false, itens: [], pulos: [], ops: [], erro: "Distância inválida." };
    if (Math.abs(dy) > MAX_DY) return { ok: false, itens: [], pulos: [], ops: [], erro: "Mais de " + MAX_DY + " m: confira o valor." };
    var s = filtrar(selecionados(estado, ids));
    var itens = s.ok.map(function (f) { return { id: f.id, dy: r6(dy), info: f }; });
    if (Math.abs(dy) < 1e-6) return { ok: false, itens: [], pulos: s.pulos, ops: [], erro: "Digite uma distância diferente de zero." };
    return fechar(itens, s.pulos, function (m) { return plural(m.length, "peça", "peças") + (dy > 0 ? (m.length === 1 ? " subiu " : " subiram ") : (m.length === 1 ? " desceu " : " desceram ")) + br(Math.abs(dy)) + " m"; });
  }

  /* (b) levar a BASE (ou o topo) a um nível + deslocamento. niveis = [{id, nome, elevacao}] */
  function planoNivel(estado, ids, nivelId, o) {
    o = o || {};
    var ref = o.ref === "topo" ? "topo" : "base", desl = num(o.desloc, 0);
    var nv = arr(o.niveis).filter(function (n) { return n && String(n.id) === String(nivelId) && fin(Number(n.elevacao)); })[0];
    if (!nv) return { ok: false, itens: [], pulos: [], ops: [], erro: "Escolha um nível da lista." };
    var alvo = r6(Number(nv.elevacao) + desl), s = filtrar(selecionados(estado, ids)), itens = [], pulos = s.pulos;
    s.ok.forEach(function (f) {
      var y = ref === "topo" ? f.topo : f.base;
      if (!fin(y)) { pulos.push({ id: f.id, nome: f.nome, motivo: "não tem cota de " + ref + " conhecida (suba por distância)" }); return; }
      itens.push({ id: f.id, dy: r6(alvo - y), info: f });
    });
    return fechar(itens, pulos, function (m) { return plural(m.length, "peça", "peças") + " com a " + ref + " em " + (nv.nome || "nível") + (desl ? " " + sinal(desl) + " m" : "") + " (cota " + br(alvo) + " m)"; });
  }

  /* (c) alinhar o topo da viga com o topo da peça de APOIO (pilar; parede se não houver pilar).
     A ponta encosta no apoio EM PLANTA: dentro da pegada dele (comprimento × espessura, girada) com 1 cm
     de folga mais meia largura da viga. Sem ponta apoiada: o apoio que fica sob o vão. */
  function pegadaContem(c, x, z, folga) {
    var th = num(c.rotY, 0), co = Math.cos(th), si = Math.sin(th), dx = x - num(c.cx, 0), dz = z - num(c.cz, 0);
    var u = dx * co - dz * si, w = dx * si + dz * co;   /* eixos locais do editor: X → (cos θ, −sen θ), Z → (sen θ, cos θ) */
    return Math.abs(u) <= num(c.comprimento, 0) / 2 + folga && Math.abs(w) <= num(c.espessura, 0) / 2 + folga;
  }
  function apoios(estado, excluir) {
    var out = [];
    arr(estado && estado.caixas).forEach(function (c) {
      if (!c || excluir[String(c.id)]) return;
      var f = infoEl("caixa", c); if (!fin(f.topo)) return;
      if (c.tipo === "metal" ? f.metalVertical : c.tipo === "pilar") out.push({ c: c, f: f, prio: 0 });
      else if (c.tipo === "parede" && !c.arco) out.push({ c: c, f: f, prio: 1 });
    });
    return out;
  }
  function apoioNa(cands, x, z, folga) {
    var ach = cands.filter(function (a) { return pegadaContem(a.c, x, z, folga); });
    if (!ach.length) return null;
    var p = Math.min.apply(null, ach.map(function (a) { return a.prio; }));
    ach = ach.filter(function (a) { return a.prio === p; });
    /* duas peças de apoio no mesmo ponto (pilar e outro colado): o de topo mais alto é o apoio */
    ach.sort(function (a, b) { return b.f.topo - a.f.topo; });
    return ach[0];
  }
  function planoApoio(estado, ids) {
    var s = filtrar(selecionados(estado, ids)), itens = [], pulos = s.pulos, todosApoios = apoios(estado, {});
    var usados = {};
    s.ok.forEach(function (f) {
      if (!f.linear) {
        pulos.push({ id: f.id, nome: f.nome, motivo: f.vertical ? "é vertical (o alinhar é da viga que apoia nela)" : (f.inclinada ? "está inclinada (alinhe por nível ou por distância)" : "só viga ou barra horizontal se alinha ao topo do apoio") });
        return;
      }
      var cands = todosApoios.filter(function (a) { return String(a.c.id) !== f.id; }), folga = TOL_APOIO + num(f.linear.larg, 0) / 2;
      var pa = apoioNa(cands, f.linear.a[0], f.linear.a[2], folga), pb = apoioNa(cands, f.linear.b[0], f.linear.b[2], folga), achados = [pa, pb].filter(Boolean);
      if (!achados.length) {
        /* sob o vão: o apoio cujo centro em planta cai na faixa da viga */
        var ax = f.linear.a[0], az = f.linear.a[2], bx = f.linear.b[0], bz = f.linear.b[2], L2 = (bx - ax) * (bx - ax) + (bz - az) * (bz - az);
        cands.forEach(function (a) {
          if (!(L2 > 1e-9)) return;
          var t = ((num(a.c.cx, 0) - ax) * (bx - ax) + (num(a.c.cz, 0) - az) * (bz - az)) / L2; if (t <= 0 || t >= 1) return;
          var px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
          if (pegadaContem(a.c, px, pz, folga)) achados.push(a);
        });
        if (achados.length) { var p0 = Math.min.apply(null, achados.map(function (a) { return a.prio; })); achados = achados.filter(function (a) { return a.prio === p0; }); }
      }
      if (!achados.length) { pulos.push({ id: f.id, nome: f.nome, motivo: "nenhuma ponta encosta em pilar (ou parede) em planta" }); return; }
      var tops = achados.map(function (a) { return a.f.topo; }), tmin = Math.min.apply(null, tops), tmax = Math.max.apply(null, tops);
      if (tmax - tmin > TOL_TOPO) {
        pulos.push({ id: f.id, nome: f.nome, motivo: "os apoios têm topos diferentes (" + achados.map(function (a) { return a.f.nome + " " + br(a.f.topo) + " m"; }).join(" e ") + "): alinhe por nível" });
        return;
      }
      achados.forEach(function (a) { usados[String(a.c.id)] = a.f.nome; });
      itens.push({ id: f.id, dy: r6(tmax - f.topo), info: f, apoio: achados.map(function (a) { return String(a.c.id); }), topoApoio: tmax });
    });
    var r = fechar(itens, pulos, function (m) {
      var tt = {}; m.forEach(function (it) { tt[br(it.topoApoio)] = 1; });
      /* os apoios pelo nome, agrupados: "2 × Pilar W200X26.6" (dois pilares do mesmo perfil não repetem o nome) */
      var cont = {}, ordem = [];
      Object.keys(usados).forEach(function (k) { var nm = usados[k]; if (!cont[nm]) { cont[nm] = 0; ordem.push(nm); } cont[nm]++; });
      var nomes = ordem.map(function (nm) { return (cont[nm] > 1 ? cont[nm] + " × " : "") + nm; });
      return plural(m.length, "viga", "vigas") + " com o topo no topo do apoio (" + nomes.slice(0, 3).join(", ") + (nomes.length > 3 ? "…" : "") + " — " + Object.keys(tt).join(" / ") + " m)";
    }, itens.length || !pulos.length ? null : "Nada se moveu: " + pulos.slice(0, 3).map(function (p) { return p.nome + " — " + p.motivo; }).join("; ") + ".");
    r.apoios = usados;
    return r;
  }

  /* "Elevação do topo" (Propriedades): vertical muda a altura; horizontal leva a peça inteira.
     valor = o topo novo (o mesmo delta para todas: `delta` = valor − topo de cada uma, ou o delta dado). */
  function planoTopo(estado, ids, o) {
    o = o || {};
    var s = filtrar(selecionados(estado, ids)), itens = [], pulos = s.pulos, M = MC();
    s.ok.forEach(function (f) {
      if (!fin(f.topo)) { pulos.push({ id: f.id, nome: f.nome, motivo: "não tem cota de topo conhecida" }); return; }
      var dy = fin(o.delta) ? o.delta : r6(num(o.valor, NaN) - f.topo);
      if (!fin(dy)) { pulos.push({ id: f.id, nome: f.nome, motivo: "cota inválida" }); return; }
      if (Math.abs(dy) < 1e-6) { itens.push({ id: f.id, dy: 0, info: f }); return; }
      if (f.metalVertical) {
        var li = linhaMetal(f.el); if (!li || !M) { pulos.push({ id: f.id, nome: f.nome, motivo: "o motor da metálica não carregou" }); return; }
        var hi = Math.max(li.a[1], li.b[1]), mud = { topo: r6(hi + dy) }, cr = f.el.metal.cria, nv = cr && cr.nivel;
        if (nv && typeof nv === "object" && nv.topo && nv.topo !== "altura") { var nn = clone(nv); nn.deslTopo = r6(num(nv.deslTopo, 0) + dy); mud.nivel = nn; }
        var r = M.editar(f.el, mud);
        if (!r || r.erro) { pulos.push({ id: f.id, nome: f.nome, motivo: (r && r.erro) || "não deu para refazer a peça" }); return; }
        var cx = M.comIdentidade ? M.comIdentidade(f.el, r.caixa) : r.caixa; cx.id = f.el.id;
        itens.push({ id: f.id, dy: dy, info: f, op: M.opAjustar(f.el.id, cx), so: "topo" });
      } else if (f.vertical && f.el && !f.el.metal && (f.el.tipo === "parede" || f.el.tipo === "pilar")) {
        if (num(f.el.altura, 0) + dy < 0.1 - 1e-9) { pulos.push({ id: f.id, nome: f.nome, motivo: "o topo ficaria abaixo da base" }); return; }
        itens.push({ id: f.id, dy: dy, so: "topo", info: f });
      } else itens.push({ id: f.id, dy: dy, info: f });
    });
    return fechar(itens, pulos, function (m) { return plural(m.length, "peça", "peças") + " com o topo " + (fin(o.delta) ? (o.delta > 0 ? "+" : "") + br(o.delta) + " m" : "em " + br(o.valor) + " m"); });
  }

  /* ================================================================ O NÍVEL DE REFERÊNCIA
   * O nível em que a peça está: o que ela acompanha (presa ou metal.cria.nivel) ou
   * o mais alto que fica na base ou abaixo dela. → { nivel, desloc } | null */
  function nivelDe(f, niveis) {
    var L = arr(niveis).filter(function (n) { return n && n.id != null && fin(Number(n.elevacao)); });
    if (!L.length || !f || !fin(f.base)) return null;
    var el = f.el || {}, idP = null;
    if (presa(el)) idP = String(el.nivelBase != null ? el.nivelBase : el.nivelId);
    var nv = el.metal && el.metal.cria && el.metal.cria.nivel;
    if (!idP && nv && typeof nv === "object") idP = nv.base != null ? String(nv.base) : (nv.nivel != null ? String(nv.nivel) : null);
    var n = idP ? L.filter(function (x) { return String(x.id) === idP; })[0] : null;
    if (!n) n = L.filter(function (x) { return Number(x.elevacao) <= f.base + 1e-6; }).sort(function (a, b) { return Number(b.elevacao) - Number(a.elevacao); })[0] || L.slice().sort(function (a, b) { return Number(a.elevacao) - Number(b.elevacao); })[0];
    return { nivel: n, desloc: r6(f.base - Number(n.elevacao)), acompanha: !!idP };
  }

  /* ================================================================ OS CAMPOS (Propriedades)
   * O que a seção "Elevação" mostra para a seleção: { n, base, topo (null = ‹vários›),
   * nivel, desloc, vertical (alguma vertical), comNivel, itens } — `campos` é puro: a tela só desenha. */
  function campos(estado, ids, niveis) {
    var s = filtrar(selecionados(estado, ids)), ok = s.ok;
    if (!ok.length) return null;
    function comum(fn) { var v0 = fn(ok[0]); return ok.every(function (f) { var v = fn(f); return (v == null && v0 == null) || (fin(v) && fin(v0) && Math.abs(v - v0) < 1e-6) || v === v0; }) ? v0 : undefined; }
    var nvs = ok.map(function (f) { return nivelDe(f, niveis); });
    var nivelC = nvs.every(function (x) { return x && nvs[0] && String(x.nivel.id) === String(nvs[0].nivel.id); }) ? nvs[0].nivel : undefined;
    var deslC = nvs.every(function (x) { return x && nvs[0] && Math.abs(x.desloc - nvs[0].desloc) < 1e-6; }) ? nvs[0].desloc : undefined;
    return {
      n: ok.length, pulos: s.pulos, itens: ok,
      base: comum(function (f) { return f.base; }), topo: comum(function (f) { return f.topo; }),
      temTopo: ok.some(function (f) { return fin(f.topo); }), temBase: ok.every(function (f) { return fin(f.base); }),
      vertical: ok.some(function (f) { return f.vertical; }),
      comNivel: arr(niveis).length > 0 && nvs.every(Boolean), nivel: nivelC, desloc: deslC,
      menorBase: Math.min.apply(null, ok.map(function (f) { return fin(f.base) ? f.base : Infinity; })),
      menorTopo: Math.min.apply(null, ok.map(function (f) { return fin(f.topo) ? f.topo : Infinity; }))
    };
  }
  /* uma edição da seção → o plano. campo = 'base'|'topo'|'nivel'|'desloc'; bruto = o texto/o id.
     Multi-seleção com ‹vários›: "+0,30"/"-0,30" (com sinal) move todas esse tanto; um valor sem sinal
     leva a MAIS BAIXA a ele e as outras andam o mesmo tanto (o mesmo delta para todas). */
  function planoCampo(estado, ids, campo, bruto, niveis) {
    var cp = campos(estado, ids, niveis);
    if (!cp) { var s0 = filtrar(selecionados(estado, ids)); return { ok: false, itens: [], pulos: s0.pulos, ops: [], erro: s0.pulos.length ? "Esta peça não sobe por aqui: " + s0.pulos[0].motivo + "." : "Nada selecionado." }; }
    if (campo === "nivel") {
      var nv = arr(niveis).filter(function (n) { return String(n.id) === String(bruto); })[0];
      if (!nv) return { ok: false, itens: [], pulos: [], ops: [], erro: "Escolha um nível da lista." };
      /* cada peça vai para o nível novo mantendo o deslocamento que tinha do nível dela */
      var itens = [], pulos = cp.pulos.slice();
      cp.itens.forEach(function (f) { var r = nivelDe(f, niveis); if (!r) { pulos.push({ id: f.id, nome: f.nome, motivo: "sem cota de base" }); return; } itens.push({ id: f.id, dy: r6(Number(nv.elevacao) - Number(r.nivel.elevacao)), info: f }); });
      return fechar(itens, pulos, function (m) { return plural(m.length, "peça", "peças") + " no " + (nv.nome || "nível") + " (com o mesmo deslocamento)"; });
    }
    var l = lerMetros(bruto); if (!l.ok) return { ok: false, itens: [], pulos: [], ops: [], erro: l.erro };
    var atual = campo === "base" ? cp.base : (campo === "topo" ? cp.topo : cp.desloc), varios = atual === undefined;
    var delta;
    if (varios) delta = l.relativo ? l.valor : r6(l.valor - (campo === "topo" ? cp.menorTopo : (campo === "base" ? cp.menorBase : Math.min.apply(null, cp.itens.map(function (f) { var r = nivelDe(f, niveis); return r ? r.desloc : Infinity; })))));
    else delta = r6(l.valor - num(atual, 0));
    if (!fin(delta)) return { ok: false, itens: [], pulos: [], ops: [], erro: "Valor inválido." };
    if (campo === "topo") return planoTopo(estado, ids, { delta: delta });
    return planoDelta(estado, ids, delta);
  }

  /* ================================================================ COM OS VÍNCULOS
   * O plano → a op para gravar: o que está amarrado acompanha pelo js/bimvinculos.js (Alt: o = {solto:true}).
   * → { op (lote), res (o do motor dos vínculos ou null), plano } */
  function opFinal(estado, plano, o) {
    o = o || {};
    if (!plano || !plano.ok || !plano.ops.length) return { op: null, res: null, plano: plano };
    var idL = typeof o.novoId === "function" ? o.novoId("l") : "l" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    var lote = { op: "lote", id: idL, origem: "elevar", pedido: txt(o.pedido || "Elevar").slice(0, 300), ops: plano.ops.slice() };
    var V = Vinc(), res = null;
    if (V && V.propagar && !o.solto) { try { res = V.propagar(estado, lote, { novoId: o.novoId, nome: o.nome }); } catch (e) { res = null; } }
    return { op: res && res.op ? res.op : lote, res: res, plano: plano };
  }

  /* ================================================================ REPLAY
   * {op:"elevar", ids, dy, so?} — extensão do js/bimedit.js (a forma é conferida lá). */
  function aplicarOp(o, ctx) {
    if (!o || o.op !== "elevar" || !ctx || !Array.isArray(o.ids) || !fin(o.dy)) return false;
    var n = 0, mapas = [["caixa", ctx.caixas], ["familia", ctx.fams], ["cobertura", ctx.cobs], ["volume", ctx.vols]];
    o.ids.forEach(function (id0) {
      var id = String(id0);
      for (var i = 0; i < mapas.length; i++) {
        var M = mapas[i][1]; if (!M || !M[id]) continue;
        if (M[id].fixo) return;
        var novo = elevarEl(mapas[i][0], M[id], o.dy, { so: o.so });
        if (novo && !novo.erro) { M[id] = novo; n++; }
        return;
      }
      /* o id pode ter vindo como número na op e como texto no mapa (ou o contrário) */
    });
    return n > 0;
  }
  function validaOp(o) {
    if (!o || o.op !== "elevar") return undefined;
    var BE = dep("BimEdit", "./bimedit.js"); return !!(BE && BE.opElevarValida && BE.opElevarValida(o));
  }
  function registrar(BE) {
    if (!BE || typeof BE.estender !== "function") return false;
    BE.estender({ nome: "elevar", aplicar: aplicarOp, valida: validaOp });
    return true;
  }

  var BimElevar = {
    MAX_DY: MAX_DY, TOL_APOIO: TOL_APOIO,
    lerMetros: lerMetros, br: br, sinal: sinal, info: info, presa: presa, elevarEl: elevarEl, pegadaContem: pegadaContem,
    planoDelta: planoDelta, planoNivel: planoNivel, planoApoio: planoApoio, planoTopo: planoTopo, planoCampo: planoCampo,
    campos: campos, nivelDe: nivelDe, opsDe: opsDe, opFinal: opFinal,
    aplicarOp: aplicarOp, validaOp: validaOp, registrar: registrar
  };
  var BE0 = dep("BimEdit", "./bimedit.js"); if (BE0) registrar(BE0);
  global.BimElevar = BimElevar;
  if (typeof module !== "undefined" && module.exports) module.exports = BimElevar;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
