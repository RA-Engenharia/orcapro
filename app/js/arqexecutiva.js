/* =====================================================================
 * arqexecutiva.js — A FOLHA EXECUTIVA DE CORTES DAS PRANCHAS DE ARQUITETURA (motor PURO, ES5, sem DOM, Node-testável).
 *
 * UMA folha (A1; A0 se não couber) com tudo o que o executivo de cortes pede, TIRADO DO MODELO (nada é digitado, nada é inventado):
 *   1  dois CORTES (AA e BB) em 1:50 com terreno hachurado, símbolos de nível (piso, forro, platibanda, cobertura), cotas verticais encadeadas (piso, peitoril, verga, forro, laje,
 *      platibanda, cumeeira), laje / viga / pilar de concreto cortados em VERMELHO cheio, chamadas com linha (cobertura com material e % lidos do telhado, rufo, calha, pingadeira,
 *      viga de amarração, platibanda, forro, calçada de proteção, caixa d'água com a capacidade), nome e área dos ambientes cortados e as etiquetas P01 / J01 das esquadrias;
 *   2  CORTE PERSPECTIVADO e CORTE 3D: a imagem vem da própria cena 3D do BIM (opcoes.foto3d = BIM.fotoIso, câmera ortográfica com a caixa de corte no plano do corte). Sem o 3D aberto
 *      (Node, teste) o quadro leva a VISTA DISPONÍVEL MAIS PRÓXIMA (elevação do corte com o mobiliário; seção extrudada em oblíqua) e a pendência fica escrita na folha e nos avisos;
 *   3  DETALHE ampliado 1:25 recortado de um dos cortes (platibanda, senão calha, senão beiral), com a chamada de detalhe (círculo número / folha) no corte de origem;
 *   4  QUADROS: áreas e ambientes (nível, área, perímetro), janelas, portas e gradis (código, ambiente, qtd, largura, altura, peitoril, área, descrição), rufo, calha, pingadeira (m),
 *      forro (material, área) e materiais do telhado (m²) — as mesmas quantidades do modelo e do orçamento (js/bimcobertura.js);
 *   5  LEGENDA de indicações (nível, corte, esquadria, paginação) e o carimbo RA (ArqPranchas.montarFolha).
 * REGRA: elemento que o modelo NÃO tem não é chamado, não é quantificado e não ganha quadro (o teste faz a Casa 487 pura e exige zero chamada de extra).
 * LAYOUT: cada desenho é um BLOCO (js/arqdiagrama.js) já na escala dele; os cortes e as vistas ocupam o alto da folha, o resto (detalhe, legenda, quadros) é empacotado embaixo; a conferência
 * de sobreposição (texto × texto, texto × linha, bloco × bloco) tem de dar 0. O arquivo CAD único (js/arqcad.js) lê a escala de cada bloco (1:50, 1:25) e sai igual ao PDF.
 *   ArqExecutiva.fatos(c)                    o que o modelo tem (cobertura, rufo, calha, pingadeira, viga de amarração, forro, calçada, caixa d'água) — c = contexto de js/arqpranchas.js
 *   ArqExecutiva.quantitativos(c)            as tabelas (ambientes, janelas, portas, rufo, calha, pingadeira, forro, telhado) com as quantidades
 *   ArqExecutiva.montar(c, F, geo, op)       desenha a folha no Desenho novo e devolve { ok, D, colocados, escalas, fatos, quantitativos, chamadas, avisos }
 * Teste: tools/test-arq-executiva.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) { /* ausente */ } }
    return null;
  }
  function DS() { return dep("ArqDesenho", "./arqdesenho.js"); }
  function CT() { return dep("ArqCortes", "./arqcortes.js"); }
  function GEO() { return dep("ArqGeo", "./arqgeo.js"); }
  function QD() { return dep("ArqQuadros", "./arqquadros.js"); }
  function DG() { return dep("ArqDiagrama", "./arqdiagrama.js"); }
  function ES() { return dep("ArqEstilo", "./arqestilo.js"); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function num(v, d) { var x = Number(v); return v != null && v !== "" && isFinite(x) ? x : d; }
  function r2(v) { return Math.round(v * 100) / 100; }
  function r3(v) { return Math.round(v * 1000) / 1000; }
  function maius(s) { return txt(s).toUpperCase(); }
  var VIVO = { existente: 1, novo: 1 };
  var VERMELHO_PEND = "#c00000";

  /* ================================================================ O QUE O MODELO TEM */
  function pavNome(d, pav) { var p = arr(d.pavimentos)[pav == null ? 0 : pav]; return p ? txt(p.nome) : ""; }
  function distSeg(p, a, b) {
    var dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)) : 0;
    return Math.sqrt(Math.pow(p[0] - (a[0] + t * dx), 2) + Math.pow(p[1] - (a[1] + t * dz), 2));
  }
  /* o ambiente de um vão: só os do MESMO PAVIMENTO e cuja borda passa a até 0,6 m. Uma esquadria entre dois ambientes fica com o que a FOLHA abre para (a família traz Abre_para_fora; o eixo Z
     da família aponta para fora da parede); sem esse dado, com o de maior área. Sem ambiente perto = área externa. */
  function distAmbiente(p, a) {
    var G = GEO(), P = a.pts, dd = G.pontoEmPol(p, P) ? 0 : Infinity;
    for (var i = 0; i < P.length; i++) dd = Math.min(dd, distSeg(p, P[i], P[(i + 1) % P.length]));
    return dd;
  }
  function ambienteDoVao(v, ambs) {
    var G = GEO(), p = [v.x, v.z], lista = ambs.filter(function (a) { return a.pav == null || v.pav == null || a.pav === v.pav; }), perto = lista.filter(function (a) { return distAmbiente(p, a) <= 0.6 + 1e-9; });
    if (!perto.length) return "ÁREA EXTERNA";
    if (perto.length === 1) return txt(perto[0].nome);
    if (v.tipo === "porta" && v.abreForaDef) {
      var th = num(v.rotY, 0), nz = [Math.sin(th), Math.cos(th)], sg = v.abreFora ? 1 : -1, probe = [v.x + sg * nz[0] * 0.5, v.z + sg * nz[1] * 0.5], lado = perto.filter(function (a) { return G.pontoEmPol(probe, a.pts); });
      if (lado.length === 1) return txt(lado[0].nome);
    }
    var maior = perto.slice().sort(function (a, b) { return num(b.area, 0) - num(a.area, 0); })[0];
    return txt(maior.nome);
  }
  function ambientesVivos(c) { return arr((c.depois || c.dados).ambientes).filter(function (a) { return a.status !== "demolido"; }); }

  /* os fatos que decidem se uma chamada / um quadro existe */
  function fatos(c) {
    var d = c.dados, cob = d.cobertura || { platibandas: [], bordas: [], calhasEmbutidas: [], rufosEncontro: [] }, V = function (x) { return VIVO[x.status]; };
    var plat = arr(cob.platibandas).filter(V), calhaB = arr(cob.bordas).filter(function (b) { return V(b) && b.tipoBorda === "calha"; }), rufoB = arr(cob.bordas).filter(function (b) { return V(b) && b.tipoBorda === "rufo"; });
    var testeira = arr(cob.bordas).filter(function (b) { return V(b) && b.tipoBorda === "testeira"; }), calhaE = arr(cob.calhasEmbutidas).filter(V), rufoE = arr(cob.rufosEncontro).filter(V);
    var vigas = arr(d.vigas).filter(function (v) { return V(v) && !v.madeira; }), topoParede = 0;
    arr(d.paredes).forEach(function (w) { if (!w.muro && V(w)) topoParede = Math.max(topoParede, w.topo); });
    var amarracao = vigas.filter(function (v) { return Math.abs(v.topo - topoParede) <= 0.25; });
    var caixas = arr(d.moveis).filter(function (m) { return V(m) && m.famId === "hid-caixa-dagua"; });
    var calcadas = arr(d.terreno && d.terreno.subregioes).filter(function (s) { return /cal[cç]ada|passeio/i.test(txt(s.nome) + " " + txt(s.material)); });
    var vaosV = arr(d.vaos).filter(V), pinga = vaosV.filter(function (v) { return v.pingadeira; });
    var tels = arr(d.telhados).filter(V), forros = arr(d.forros).filter(V);
    return { telhado: tels.length > 0, platibanda: plat.length > 0, rufoCapa: plat.some(function (p) { return !!p.rufoCapa; }), rufoBeiral: rufoB.length > 0, rufoEncontro: rufoE.length > 0, testeira: testeira.length > 0,
      calhaBeiral: calhaB.length > 0, calhaEmbutida: calhaE.length > 0, pingadeira: pinga.length > 0, vigaAmarracao: amarracao.length > 0, viga: vigas.length > 0, forro: forros.length > 0,
      calcada: calcadas.length > 0, caixaDagua: caixas.length > 0, topoParede: topoParede };
  }

  /* ================================================================ OS QUANTITATIVOS */
  function quantitativos(c) {
    var d = c.dados, cob = d.cobertura || { platibandas: [], bordas: [], calhasEmbutidas: [], rufosEncontro: [] }, V = function (x) { return VIVO[x.status]; }, ambs = ambientesVivos(c), D = DS();
    var out = { ambientes: [], janelas: [], portas: [], rufo: { itens: [], total: 0 }, calha: { itens: [], total: 0 }, pingadeira: { itens: [], total: 0 }, forro: { itens: [], area: 0 }, telhado: { itens: [], area: 0 } };
    /* áreas e ambientes: o nível é o do pavimento do ambiente (nome + cota); área e perímetro são os do modelo */
    ambs.forEach(function (a) {
      var pv = arr(d.pavimentos)[a.pav == null ? 0 : a.pav];
      out.ambientes.push({ id: a.id, nome: txt(a.nome), nivel: pv ? txt(pv.nome) + " (" + D.nivelTxt(pv.cota) + ")" : "-", area: r2(a.area), perimetro: r2(a.perimetro) });
    });
    /* esquadrias: um item por (código, ambiente); a quantidade é o número de vãos do modelo (fase existente ou nova) */
    var g = {};
    arr(d.vaos).filter(V).forEach(function (v) {
      var amb = ambienteDoVao(v, ambs), k = v.cod + "|" + amb, o = g[k] || (g[k] = { cod: v.cod, tipo: v.tipo, ambiente: amb, qtd: 0, largura: v.largura, altura: v.altura, peitoril: v.peitoril, area: 0, descricao: txt(v.nome) + (v.material ? " - " + txt(v.material) : "") });
      o.qtd += 1; o.area = r2(o.area + v.largura * v.altura);
    });
    Object.keys(g).sort().forEach(function (k) { (g[k].tipo === "porta" ? out.portas : out.janelas).push(g[k]); });
    /* rufo (m): rufo de capa da platibanda, rufo de beiral e de encontro, contra-rufo; calha (m): de beiral e embutida; tudo com o comprimento que o modelo calculou */
    function soma(L) { var t = 0; L.forEach(function (x) { t += x.comprimento; }); return r2(t); }
    function com(nome, mat) { return nome + (txt(mat) ? " - " + txt(mat) : ""); }   /* o material só entra quando o MODELO o traz; senão fica o nome da peça */
    var plN = arr(cob.platibandas).filter(function (p) { return V(p) && p.status !== "existente"; });   /* como o orçamento: a platibanda existente não orça construção */
    var capa = plN.filter(function (p) { return p.rufoCapa; }).map(function (p) { return { comprimento: p.rufoCapa.comprimento, descricao: p.rufoCapa.descricao }; });
    if (capa.length) out.rufo.itens.push({ peca: "Rufo de capa (chapim)", comprimento: soma(capa), descricao: capa[0].descricao || "Rufo de capa da platibanda" });
    var rb = arr(cob.bordas).filter(function (b) { return V(b) && b.tipoBorda === "rufo"; });
    if (rb.length) out.rufo.itens.push({ peca: "Rufo de beiral / empena", comprimento: soma(rb), descricao: "Rufo de beiral / empena" });
    var re = arr(cob.rufosEncontro).filter(V);
    if (re.length) out.rufo.itens.push({ peca: "Rufo de encontro com parede", comprimento: soma(re.map(function (r) { return { comprimento: r.comprimentoPecas > 0 ? r.comprimentoPecas : r.comprimentoRufo }; })), descricao: com("Rufo de encontro com parede", re[0].material) });
    var contraP = plN.filter(function (p) { return p.contraRufo; }), contra = contraP.map(function (p) { return { comprimento: p.contraRufo.comprimento }; }).concat(re.map(function (r) { return { comprimento: r.comprimentoContra }; }));
    if (contra.length) out.rufo.itens.push({ peca: "Contra-rufo", comprimento: soma(contra), descricao: com("Contra-rufo", contraP.length ? contraP[0].contraRufo.descricao : (re[0] && re[0].material)) });
    var te = arr(cob.bordas).filter(function (b) { return V(b) && b.tipoBorda === "testeira"; });
    if (te.length) out.rufo.itens.push({ peca: "Testeira", comprimento: soma(te), descricao: "Testeira do beiral" });
    out.rufo.total = r2(out.rufo.itens.reduce(function (t, x) { return t + x.comprimento; }, 0));
    var cb = arr(cob.bordas).filter(function (b) { return V(b) && b.tipoBorda === "calha"; }), ce = arr(cob.calhasEmbutidas).filter(V);
    function dim(q) { return q.largura > 0 && q.altura > 0 ? " (" + Math.round(q.largura * 100) + " x " + Math.round(q.altura * 100) + " cm)" : ""; }
    if (cb.length) out.calha.itens.push({ peca: "Calha de beiral", comprimento: soma(cb), descricao: "Calha de beiral" + dim(cb[0]) });
    if (ce.length) out.calha.itens.push({ peca: "Calha embutida", comprimento: soma(ce), descricao: com("Calha embutida atrás da platibanda", ce[0].material) + dim(ce[0]) });
    out.calha.total = r2(out.calha.itens.reduce(function (t, x) { return t + x.comprimento; }, 0));
    var pg = arr(d.vaos).filter(V).filter(function (v) { return v.pingadeira; });
    if (pg.length) {
      var mats = []; pg.forEach(function (v) { var m = txt(v.pingadeira.material); if (m && mats.indexOf(m) < 0) mats.push(m); });
      out.pingadeira.itens.push({ peca: "Pingadeira de peitoril", comprimento: soma(pg.map(function (v) { return { comprimento: v.pingadeira.comprimento }; })), descricao: "Pingadeira" + (mats.length ? " em " + mats.join(" / ").toLowerCase() : "") + " (peça da família da janela)", qtd: pg.length });
      out.pingadeira.total = out.pingadeira.itens[0].comprimento;
    }
    /* forro: um item por (material, nível) */
    var fg = {};
    arr(d.forros).filter(V).forEach(function (f) { var k = txt(f.tipo) + "|" + f.cota, o = fg[k] || (fg[k] = { material: txt(f.tipo) || "informe", nivel: r2(f.cota), area: 0 }); o.area = r2(o.area + f.area); });
    Object.keys(fg).sort().forEach(function (k) { out.forro.itens.push(fg[k]); out.forro.area = r2(out.forro.area + fg[k].area); });
    arr(d.telhados).filter(V).forEach(function (t) { out.telhado.itens.push({ id: t.id, area: r2(t.area), descricao: (txt(t.material) || txt(t.tipo) || "informe") + (txt(t.tipo) && txt(t.material) ? " - " + txt(t.tipo) : "") + ", inclinação " + Math.round(t.inclinacao) + " %" }); out.telhado.area = r2(out.telhado.area + t.area); });
    return out;
  }

  /* ================================================================ AS CHAMADAS DE UM CORTE (só o que o modelo tem e o plano atravessa) */
  function umaPorLado(L, chave) {   /* no máximo as duas ocorrências extremas (esquerda e direita) */
    if (L.length <= 2) return L;
    var s = L.slice().sort(function (a, b) { return chave(a) - chave(b); });
    return [s[0], s[s.length - 1]];
  }
  function chamadasDe(c, mc, fa) {
    var L = [], d = DS(), D0 = c.dados;
    function add(kind, u, y, linhas, pref) { L.push({ kind: kind, u: u, y: y, linhas: linhas.filter(function (s) { return !!s; }), pref: pref || null }); }
    /* cobertura: a água mais alta (a que o corte mostra por cima); material e inclinação vêm do telhado do modelo */
    if (mc.telhado.length) {
      var t = mc.telhado.slice().sort(function (a, b) { return a.u0 - b.u0; })[0], pct = Math.round(num(t.pct, 0)), tq = 0.3;   /* a água da ponta (a lateral alcança), no terço perto do beiral */
      add("cobertura", t.u0 + (t.u1 - t.u0) * tq, t.ya + (t.yb - t.ya) * tq, ["COBERTURA EM " + maius(t.material || t.tipo || "TELHADO"), "INCLINAÇÃO ADOTADA: " + pct + "%"]);
    }
    var pls = mc.pecas.filter(function (p) { return p.plat; });
    umaPorLado(pls, function (p) { return p.u0; }).forEach(function (p) {
      add("platibanda", (p.u0 + p.u1) / 2, p.y1 - 0.25, ["PLATIBANDA" + (txt(p.material) ? " EM " + maius(p.material) : "")]);
      if (p.rufoCapa) add("rufo-capa", (p.u0 + p.u1) / 2, p.y1, [txt(p.rufoCapa.descricao) ? maius(p.rufoCapa.descricao) : "RUFO DE CAPA" + (p.rufoCapa.corteM ? ", CORTE " + Math.round(p.rufoCapa.corteM * 100) + " CM" : "")]);
    });
    umaPorLado(mc.cob.calhas, function (q) { return q.u; }).forEach(function (q) { add("calha", q.u, q.y, ["CALHA DE BEIRAL" + (q.largura > 0 ? " (" + Math.round(q.largura * 100) + " X " + Math.round(q.altura * 100) + " CM)" : "")]); });
    umaPorLado(mc.cob.rufos, function (q) { return q.u; }).forEach(function (q) { add("rufo", q.u, q.y, [q.tipo === "testeira" ? "TESTEIRA" : "RUFO DE BEIRAL"]); });
    mc.pecas.filter(function (p) { return p.calhaEmb; }).slice(0, 2).forEach(function (p) { add("calha", (p.u0 + p.u1) / 2, (p.y0 + p.y1) / 2, ["CALHA EMBUTIDA"]); });
    umaPorLado(mc.pecas.filter(function (p) { return p.viga && p.cls === "conc"; }), function (p) { return p.u0; }).forEach(function (p) {
      var am = Math.abs(p.y1 - fa.topoParede) <= 0.25;
      add(am ? "viga-amarracao" : "viga", (p.u0 + p.u1) / 2, (p.y0 + p.y1) / 2, [am ? "VIGA DE AMARRAÇÃO EM CONCRETO" : "VIGA EM CONCRETO"]);
    });
    mc.pecas.filter(function (p) { return p.caixaDagua; }).slice(0, 1).forEach(function (p) {
      add("caixa-dagua", (p.u0 + p.u1) / 2, p.y1 - 0.12, ["CAIXA D'ÁGUA", p.capacidadeL ? "CAPACIDADE: " + Math.round(p.capacidadeL) + " L" : ""], "livre");
    });
    if (mc.forros.length) { var f = mc.forros.slice().sort(function (a, b) { return a.u0 - b.u0; })[0]; add("forro", f.u0 + Math.min(0.3, (f.u1 - f.u0) / 2), f.y, [maius(f.tipo || "FORRO")]); }
    /* pingadeira: a primeira janela CORTADA cuja família traz a peça */
    var cp = null;
    mc.paredes.forEach(function (p) { p.aberturas.forEach(function (a) { if (cp || a.tipo !== "janela") return; var v = null; arr(D0.vaos).forEach(function (q) { if (!v && q.cod === a.cod && q.pingadeira) v = q; }); if (v) cp = { a: a, v: v }; }); });
    if (cp) add("pingadeira", (cp.a.u0 + cp.a.u1) / 2, cp.a.y0, ["PINGADEIRA" + (cp.v.pingadeira.material ? " EM " + maius(cp.v.pingadeira.material) : "")]);
    if (mc.calcada.length) add("calcada", (mc.calcada[0].u0 + mc.calcada[0].u1) / 2, 0, ["CALÇADA DE PROTEÇÃO", maius(mc.calcada[0].material)]);
    void d;
    return L;
  }

  /* ------------------------------------------------------------ as chamadas NAS LATERAIS: coluna à esquerda e à direita do corte, na altura do elemento; a linha tem um trecho inclinado
     de no máximo 15 mm e um patamar horizontal; nenhuma linha cruza outra e nenhuma passa de `maxLen` (40 mm). O que não cabe na lateral dentro desse limite (a caixa d'água no
     meio da cobertura) vai para o lugar livre mais perto do ponto, com a linha curta. */
  function seg2(a1, a2, b1, b2) {
    function o(p, q, r) { return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); }
    var d1 = o(b1, b2, a1), d2 = o(b1, b2, a2), d3 = o(a1, a2, b1), d4 = o(a1, a2, b2);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  }
  function cruzaPol(P, Q) {
    for (var i = 0; i + 1 < P.length; i++) for (var j = 0; j + 1 < Q.length; j++) if (seg2(P[i], P[i + 1], Q[j], Q[j + 1])) return true;
    return false;
  }
  function comprPol(P) { var t = 0; for (var i = 0; i + 1 < P.length; i++) t += Math.sqrt(Math.pow(P[i + 1][0] - P[i][0], 2) + Math.pow(P[i + 1][1] - P[i][1], 2)); return t; }
  /* itens: [{ ax, ay, linhas, kind, pref }] em mm de papel; g: { xL, xR (borda do texto de cada coluna; null = sem coluna), xMeio, ocupadoR, maxShift, maxLen, area } */
  function colocarChamadas(D, itens, g) {
    var d = DS(), hT = D.E.T.nota, lh = hT * 1.35, lid = [], sem = [], livres = [];
    itens.forEach(function (it) { var w = 0; it.linhas.forEach(function (s) { w = Math.max(w, d.largTexto(s, hT)); }); it.w = w + 1.5; it.h = it.linhas.length * lh; it.colocada = false; });
    function texto(it, x, yc, al) {
      var top = yc - it.h / 2;
      it.linhas.forEach(function (s, i) { D.texto(x, top + hT * 0.8 + i * lh, s, hT, { al: al }); });
      it.caixa = al === "D" ? [x - it.w, top, x, top + it.h] : [x, top, x + it.w, top + it.h]; it.colocada = true;
    }
    function linha(it, P) {
      for (var i = 0; i + 1 < P.length; i++) D.linha(P[i][0], P[i][1], P[i + 1][0], P[i + 1][1], "ARQ-LIDER");
      D.ponto(P[0][0], P[0][1], 0.5); it.linha = P; lid.push(P);
    }
    function livreDeCruzamento(P) { return lid.every(function (q) { return !cruzaPol(P, q); }); }
    var lado = { L: [], R: [] };
    itens.forEach(function (it) {
      var l = it.pref === "livre" ? null : (it.ax < g.xMeio ? "L" : "R");
      if ((l === "L" && g.xL == null) || (l === "R" && g.xR == null)) l = null;
      if (l) lado[l].push(it); else livres.push(it);
    });
    ["L", "R"].forEach(function (l) {
      var ocup = (l === "R" ? arr(g.ocupadoR) : []).slice();
      lado[l].sort(function (a, b) { return a.ay - b.ay; }).forEach(function (it) {
        var ky = null;
        for (var s = 0; s <= g.maxShift + 1e-9 && ky == null; s += 1.5) {
          [s, -s].forEach(function (sh) {
            if (ky != null) return;
            var y0 = it.ay + sh - it.h / 2 - 1.2, y1 = it.ay + sh + it.h / 2 + 1.2;
            if (ocup.every(function (o) { return y1 <= o[0] || y0 >= o[1]; })) ky = it.ay + sh;
          });
        }
        if (ky == null) { livres.push(it); return; }
        var xa = l === "L" ? g.xL + 1.5 : g.xR - 1.5, dir = l === "L" ? 1 : -1, run = Math.abs(it.ax - xa);
        var P;
        if (run <= 9) P = [[it.ax, it.ay], [xa, ky]];
        else { var Kx = xa + dir * Math.max(6, run - 15); P = [[it.ax, it.ay], [Kx, ky], [xa, ky]]; }
        if (comprPol(P) > g.maxLen || !livreDeCruzamento(P)) { livres.push(it); return; }
        ocup.push([ky - it.h / 2 - 1.2, ky + it.h / 2 + 1.2]);
        texto(it, l === "L" ? g.xL : g.xR, ky, l === "L" ? "D" : "E"); linha(it, P);
      });
    });
    livres.forEach(function (it) {
      var w = it.w, h = it.h, C = [[10, -13], [-10 - w, -13], [10, 11], [-10 - w, 11], [-w / 2, -17], [-w / 2, 15], [14, -5], [-14 - w, -5], [18, -22], [-18 - w, -22], [-w / 2, -26]], ok = false;
      [8, 16, 24].forEach(function (dx) { [-24, -18, -12, -6, 0, 6, 12, 18, 24].forEach(function (dy) { C.push([dx, dy], [-dx - w, dy]); }); });
      for (var i = 0; i < C.length && !ok; i++) {
        var x0 = it.ax + C[i][0], yc = it.ay + C[i][1], b = [x0, yc - h / 2, x0 + w, yc + h / 2];
        if (b[0] < g.area[0] || b[2] > g.area[2] || b[1] < g.area[1] || b[3] > g.area[3] || !D.livre(b, 0.8)) continue;
        var P = C[i][1] < -8 ? [[it.ax, it.ay], [Math.max(b[0], Math.min(it.ax, b[2])), b[3]]] : (C[i][1] > 8 ? [[it.ax, it.ay], [Math.max(b[0], Math.min(it.ax, b[2])), b[1]]] : [[it.ax, it.ay], [C[i][0] > 0 ? b[0] : b[2], yc]]);
        if (comprPol(P) > g.maxLen || !livreDeCruzamento(P)) continue;
        texto(it, x0 + 0.6, yc, "E"); linha(it, P); ok = true;
      }
      if (!ok) sem.push(it.kind);
    });
    return { leaders: lid.map(function (P) { return { pts: P, comp: comprPol(P) }; }), sem: sem };
  }

  /* ================================================================ SÍMBOLOS */
  function tagEsquadria(D, cx, cy, cod, h) {
    var r = Math.max(2.6, DS().largTexto(cod, h) / 2 + 0.9);
    D.circ(cx, cy, r, "ARQ-SIMBOLO");
    D.texto(cx, cy, cod, h, { al: "C", meio: true });
  }
  function simboloDetalhe(D, cx, cy, numero, folha) {   /* círculo dividido: o número do detalhe em cima, a folha embaixo */
    var h = 2.2, w = Math.max(DS().largTexto(folha, h * 0.8), DS().largTexto(String(numero), h)), r = Math.max(5, w / 2 + 2.6);
    D.circ(cx, cy, r, "ARQ-SIMBOLO");
    D.linha(cx - r, cy, cx + r, cy, "ARQ-SIMBOLO");
    D.texto(cx, cy - r * 0.5, String(numero), h * 1.15, { al: "C", meio: true });
    D.texto(cx, cy + r * 0.5, folha, h * 0.8, { al: "C", meio: true });
    return r;
  }

  /* ================================================================ UM CORTE */
  function cotasVerticais(c, ct, mc, F, k) {
    var D = c.D, d = DS(), X0 = F.U(ct.u0) - 9, ys = [0], ref = null;
    mc.paredes.forEach(function (p) { if (p.muro) return; p.aberturas.forEach(function (a) { if (!ref || (a.tipo === "janela" && ref.tipo !== "janela")) ref = a; }); });
    if (ref) { ys.push(ref.y0, ref.y1); }   /* peitoril e verga da abertura cortada */
    mc.forros.forEach(function (f) { ys.push(f.y); });
    mc.lajes.forEach(function (l) { if (l.y1 > 0.05) ys.push(l.y1); });
    mc.paredes.forEach(function (p) { if (!p.muro) ys.push(p.yt); });
    mc.pecas.forEach(function (p) { if (p.plat) ys.push(p.y1); });
    mc.telhado.forEach(function (t) { ys.push(Math.max(t.ya, t.yb)); });
    var vs = ys.sort(function (a, b) { return a - b; }).filter(function (y, i, A) { return i === 0 || y - A[i - 1] > 0.02; }), keep = [vs[0]];
    for (var i = 1; i < vs.length; i++) if ((vs[i] - keep[keep.length - 1]) * k >= 5.5 || i === vs.length - 1) keep.push(vs[i]);
    vs = keep;
    if (vs.length >= 2) {
      var P = vs.map(function (y) { return [X0, F.Y(y)]; }), vals = []; for (var j = 0; j + 1 < vs.length; j++) vals.push(d.cotaTxt(vs[j + 1] - vs[j]));
      D.cadeia(P, 0, vals, { offs: [4.5], desde: P.map(function () { return false; }), semExt: true });
      D.cota(X0 - d.S.entreCadeias(D.escCota), F.Y(vs[0]), X0 - d.S.entreCadeias(D.escCota), F.Y(vs[vs.length - 1]), 0, d.cotaTxt(vs[vs.length - 1] - vs[0]), { desde: [false, false], semExt: true });
    }
    return vs;
  }
  /* os símbolos de nível (triângulo + texto) ENCOSTADOS no corte, à direita, em coluna, cada um com a linha de referência curta (8 mm): piso do pavimento, cobertura, platibanda, forro e
     topo da parede; o que ficaria a menos de 7 mm do anterior sai (a cota encadeada já o traz). Devolve os intervalos de papel que a coluna ocupa. */
  function niveisExec(c, ct, mc, F, k, xFace) {
    var D = c.D, d = DS(), cand = [], ocup = [], usados = [];
    arr(c.dados.pavimentos).forEach(function (pv, i) { if (pv.cota >= mc.yMin - 0.05 && pv.cota <= mc.yMax + 0.05) cand.push({ y: pv.cota, p: 0, t: "PISO " + maius(pv.nome || ("PAVIMENTO " + (i + 1))) + " " + d.nivelTxt(pv.cota) }); });
    var cum = Math.max.apply(null, [-9].concat(mc.telhado.map(function (t) { return Math.max(t.ya, t.yb); })));
    if (cum > -9) cand.push({ y: cum, p: 1, t: (CT().cumeeiraReal(c) ? "COBERTURA (CUMEEIRA) " : "COBERTURA ") + d.nivelTxt(cum) });
    mc.pecas.forEach(function (p) { if (p.plat && !cand.some(function (q) { return q.p === 2 && Math.abs(q.y - p.y1) < 0.01; })) cand.push({ y: p.y1, p: 2, t: "PLATIBANDA " + d.nivelTxt(p.y1) }); });
    mc.forros.forEach(function (f) { if (!cand.some(function (q) { return q.p === 3 && Math.abs(q.y - f.y) < 0.01; })) cand.push({ y: f.y, p: 3, t: "FORRO " + d.nivelTxt(f.y) }); });
    var topo = Math.max.apply(null, [0].concat(mc.paredes.filter(function (p) { return !p.muro; }).map(function (p) { return p.yt; })));
    if (topo > 0.1) cand.push({ y: topo, p: 4, t: "TOPO DA PAREDE " + d.nivelTxt(topo) });
    cand.sort(function (a, b) { return a.p - b.p; }).forEach(function (n) {
      if (usados.every(function (u) { return Math.abs(u.y - n.y) * k >= 7; })) usados.push(n);
    });
    usados.forEach(function (n) {
      var yy = F.Y(n.y);
      D.linha(xFace, yy, xFace + 8, yy, "ARQ-EIXO"); D.nivel(xFace + 8, yy, n.t, 1); ocup.push([yy - 7, yy + 0.8]);
    });
    return { ocup: ocup, niveis: usados.map(function (n) { return n.t; }) };
  }
  function etiquetasEsquadrias(c, mc, F, k, jaTem, pos) {
    var D = c.D, d0 = DS(), n = 0;
    function poe(a) {
      if (!a.cod) return;
      var hpx = (a.y1 - a.y0) * k, cy = F.Y(a.y1) + hpx * (a.tipo === "janela" ? 0.27 : 0.4), cx = F.U((a.u0 + a.u1) / 2);
      if ((a.u1 - a.u0) * k < 7 || hpx < 9) return;
      if (a.tipo === "janela" && /correr/i.test(txt(a.nome)) && a.vista) cx = F.U(a.u0 + (a.u1 - a.u0) * 0.25);   /* a janela de correr tem a divisão das folhas no centro: a etiqueta vai para o centro da folha da esquerda */
      var rt = Math.max(2.6, d0.largTexto(a.cod, 2.0) / 2 + 0.9);
      if (!D.livre([cx - rt, cy - rt, cx + rt, cy + rt], 0.2)) return;   /* a etiqueta só entra onde o círculo não cobre linha nem texto (parede do fundo de um corte que não atravessa nada) */
      tagEsquadria(D, cx, cy, a.cod, 2.0); n++; jaTem.push(a.cod);
      if (pos) pos.push({ cod: a.cod, u: a.vista && a.tipo === "janela" && /correr/i.test(txt(a.nome)) ? a.u0 + (a.u1 - a.u0) * 0.25 : (a.u0 + a.u1) / 2, y: a.y1 - (a.y1 - a.y0) * (a.tipo === "janela" ? 0.27 : 0.4) });   /* onde a etiqueta caiu, em metros do corte: o teste confere com o que foi desenhado ali */
    }
    mc.paredes.forEach(function (p) { if (!p.muro) p.aberturas.forEach(poe); });
    arr(mc.vista).forEach(function (v, i) { if (!v.muro) v.aberturas.forEach(function (a) { if (!CT().escondida(mc.vista, i, a)) { var b = {}; Object.keys(a).forEach(function (kk) { b[kk] = a[kk]; }); b.vista = true; poe(b); } }); });
    return n;
  }
  function rotulosAmbientes(c, mc, F, k) {
    var D = c.D, d = DS(), sem = [];
    mc.ambientes.forEach(function (a) {
      var yb = a.base + 0.15, yt = a.base + Math.max(a.pe, 2.2), P0 = [F.U(a.u0) + 1.2, F.Y(yt)], P1 = [F.U(a.u1) - 1.2, F.Y(yb)];
      if (P1[0] - P0[0] < 6) return;
      var cen = [(P0[0] + P1[0]) / 2, (P0[1] + P1[1]) / 2], ar = a.area > 0 ? d.br(a.area, 2) + " m²" : "";
      var jogos = [[{ t: maius(a.nome), h: d.K.hLetra.rotulo }, { t: ar + (ar ? " - " : "") + "PD " + d.br(a.pe, 2) + " m" }], [{ t: maius(a.nome), h: 2.4 }, { t: ar }], [{ t: maius(a.nome), h: 2.4 }]];
      if (!d.rotuloBloco(D, cen, null, [P0[0], P0[1], P1[0], P1[1]], { jogos: jogos })) sem.push(a.nome);
    });
    void k;
    return sem;
  }
  /* desenha UM corte como bloco: título, cotas, níveis encostados, etiquetas, rótulos e as chamadas nas laterais. o = { esc, numero, ex, detalhe: {win, numero, folha} } */
  function desenharBlocoCorte(c, ct, mc, o, fa) {
    var D = c.D, d = DS(), CTm = CT(), k = 1000 / o.esc, x = 12, y = 12, hT = d.titulo(D, x, y, "CORTE " + ct.letra + ct.letra, "ESC 1:" + o.esc, o.numero), hTxt = D.E.T.nota;
    d.escalaCota(D, o.esc);
    var mg = 0.25, ex2 = { conc: o.ex.conc, parede: o.ex.parede, margem: mg, vistaSolida: true, log: o.log || [] }, ch = chamadasDe(c, mc, fa), maxW = 0;
    ch.forEach(function (q) { q.linhas.forEach(function (s) { maxW = Math.max(maxW, d.largTexto(s, hTxt)); }); });
    var colW = Math.min(64, maxW + 3), xL = x + colW, X = xL + 3 + 27, yTop = y + hT + 24, alt = (mc.yMax - mc.yMin) * k, Yb = yTop + alt;
    var F = CTm.desenharCorte(c, ct, mc, X, Yb, k, ex2), xFace = F.U(ct.u1 + mg);
    cotasVerticais(c, ct, mc, F, k);
    var tags = [], tagsPos = []; etiquetasEsquadrias(c, mc, F, k, tags, tagsPos);
    var nv = niveisExec(c, ct, mc, F, k, xFace);
    if (o.detalhe && o.detalhe.win) {   /* a CHAMADA DE DETALHE: o retângulo tracejado do recorte e, acima dele, o círculo número / folha */
      var w = o.detalhe.win, xa = F.U(w.u0), xb = F.U(w.u1), ya0 = F.Y(w.y1), yb0 = F.Y(w.y0), xm = (xa + xb) / 2;
      D.ret(xa, ya0, xb - xa, yb0 - ya0, "ARQ-EIXO");
      var rr = simboloDetalhe(D, xm, ya0 - 11, o.detalhe.numero, o.detalhe.folha);
      D.linha(xm, ya0 - 11 + rr, xm, ya0, "ARQ-SIMBOLO");
    }
    var sem = rotulosAmbientes(c, mc, F, k);
    var itens = ch.map(function (q) { return { ax: F.U(q.u), ay: F.Y(q.y), linhas: q.linhas, kind: q.kind, pref: q.pref }; });
    var res = colocarChamadas(D, itens, { xL: xL, xR: xFace + 12, xMeio: F.U((ct.u0 + ct.u1) / 2), ocupadoR: nv.ocup, maxShift: 24, maxLen: 40, area: [x, y + hT + 2, xFace + 76, Yb + 4] });
    return { F: F, sem: sem, aberturas: ex2.log, tagsPos: tagsPos, chamadas: itens.map(function (it) { return { kind: it.kind, linhas: it.linhas, caixa: it.caixa, colocada: it.colocada }; }), leaders: res.leaders, semChamada: res.sem, tags: tags, k: k, niveis: nv.niveis };
  }

  /* ================================================================ O DETALHE 1:25 (recorte de um corte) */
  function dentro(w, ct) {   /* a janela do detalhe nunca passa do trecho do corte (a coluna dos níveis fica fora): desliza para dentro, sem mudar a largura */
    var larg = w.u1 - w.u0, u0 = Math.max(ct.u0, Math.min(w.u0, ct.u1 - larg));
    w.u0 = u0; w.u1 = u0 + larg; return w;
  }
  function escolherJanela(mcs, cts) {
    for (var i = 0; i < mcs.length; i++) {
      var mc = mcs[i], pl = mc.pecas.filter(function (p) { return p.plat; })[0];
      if (pl) { var uc = (pl.u0 + pl.u1) / 2; return dentro({ idx: i, nome: "PLATIBANDA", u0: uc - 0.95, u1: uc + 0.95, y0: pl.y1 - 1.9, y1: pl.y1, alvo: "platibanda" }, cts[i]); }
    }
    for (var j = 0; j < mcs.length; j++) {
      var ca = mcs[j].cob.calhas[0];
      if (ca) return dentro({ idx: j, nome: "CALHA", u0: ca.u - 0.95, u1: ca.u + 0.95, y0: ca.y - 1.5, y1: ca.y + 0.8, alvo: "calha" }, cts[j]);
    }
    for (var m = 0; m < mcs.length; m++) {
      var ps = mcs[m].paredes.filter(function (p) { return !p.muro; }), te = mcs[m].telhado.slice();
      if (ps.length && te.length) {
        var baixa = te.slice().sort(function (a, b) { return Math.min(a.ya, a.yb) - Math.min(b.ya, b.yb); })[0], ub = Math.abs(baixa.ya) < Math.abs(baixa.yb) ? baixa.u0 : baixa.u1, yb = Math.min(baixa.ya, baixa.yb);
        return dentro({ idx: m, nome: "BEIRAL", u0: ub - 0.95, u1: ub + 0.95, y0: yb - 1.5, y1: yb + 1.0, alvo: "beiral" }, cts[m]);
      }
    }
    return null;
  }
  function recortar(mc, w) {
    var o = { paredes: [], lajes: [], telhado: [], forros: [], ambientes: [], pecas: [], vista: [], rua: null, lote: null, frente: 0, perfil: null, calcada: [], cob: { calhas: [], rufos: [] }, yMin: w.y0, yMax: w.y1, prof: 1, niveis: {} };
    function iv(a0, a1) { var u0 = Math.max(a0, w.u0), u1 = Math.min(a1, w.u1); return u1 - u0 > 0.01 ? [u0, u1] : null; }
    function yv(b0, b1) { var y0 = Math.max(b0, w.y0), y1 = Math.min(b1, w.y1); return y1 - y0 > 0.01 ? [y0, y1] : null; }
    function copia(p, ex) { var q = {}; Object.keys(p).forEach(function (kk) { q[kk] = p[kk]; }); Object.keys(ex).forEach(function (kk) { q[kk] = ex[kk]; }); return q; }
    mc.paredes.forEach(function (p) {
      var u = iv(p.u0, p.u1), y = yv(p.yb, p.yt); if (!u || !y) return;
      var ab = []; p.aberturas.forEach(function (a) { var au = iv(a.u0, a.u1), ay = yv(a.y0, a.y1); if (au && ay) ab.push(copia(a, { u0: au[0], u1: au[1], y0: ay[0], y1: ay[1] })); });
      o.paredes.push(copia(p, { u0: u[0], u1: u[1], yb: y[0], yt: y[1], aberturas: ab }));
    });
    mc.lajes.forEach(function (l) { var u = iv(l.u0, l.u1), y = yv(l.y0, l.y1); if (u && y) o.lajes.push(copia(l, { u0: u[0], u1: u[1], y0: y[0], y1: y[1] })); });
    mc.pecas.forEach(function (p) { if (p.poli) return; var u = iv(p.u0, p.u1), y = yv(p.y0, p.y1); if (u && y) o.pecas.push(copia(p, { u0: u[0], u1: u[1], y0: y[0], y1: y[1] })); });
    mc.telhado.forEach(function (t) {
      var u = iv(t.u0, t.u1); if (!u) return;
      function Yt(uu) { return t.u1 === t.u0 ? t.ya : t.ya + (t.yb - t.ya) * (uu - t.u0) / (t.u1 - t.u0); }
      var ya = Yt(u[0]), yb = Yt(u[1]), lo = w.y0 + t.esp, hi = w.y1;
      /* a água sai da janela por cima ou por baixo: encurta o trecho até a borda (a face de cima é uma reta) */
      function noY(yy) { return (yy - ya) / ((yb - ya) || 1e-9); }
      var ta = 0, tb = 1;
      [lo, hi].forEach(function (lim, q) {
        if (Math.abs(yb - ya) < 1e-9) return;
        var tt = noY(lim);
        if (q === 0) { if (ya < lo && yb < lo) { ta = 1; tb = 0; } else if (ya < lo) ta = Math.max(ta, tt); else if (yb < lo) tb = Math.min(tb, tt); }
        else { if (ya > hi && yb > hi) { ta = 1; tb = 0; } else if (ya > hi) ta = Math.max(ta, tt); else if (yb > hi) tb = Math.min(tb, tt); }
      });
      if (ta >= tb - 1e-6) { if (Math.abs(yb - ya) < 1e-9 && ya >= lo && ya <= hi) { ta = 0; tb = 1; } else return; }
      var ua = u[0] + (u[1] - u[0]) * ta, ub = u[0] + (u[1] - u[0]) * tb; ya = Yt(ua); yb = Yt(ub); u = [ua, ub];
      o.telhado.push(copia(t, { u0: u[0], u1: u[1], ya: ya, yb: yb }));
    });
    mc.forros.forEach(function (f) { var u = iv(f.u0, f.u1); if (u && f.y >= w.y0 && f.y <= w.y1) o.forros.push(copia(f, { u0: u[0], u1: u[1] })); });
    mc.cob.calhas.forEach(function (q) { if (q.u >= w.u0 && q.u <= w.u1 && q.y >= w.y0 && q.y <= w.y1) o.cob.calhas.push(q); });
    mc.cob.rufos.forEach(function (q) { if (q.u >= w.u0 && q.u <= w.u1 && q.y >= w.y0 && q.y <= w.y1) o.cob.rufos.push(q); });
    return o;
  }
  function desenharBlocoDetalhe(c, ct, mc, win, o, fa) {
    var D = c.D, d = DS(), CTm = CT(), k = 40, x = 12, y = 12, mc2 = recortar(mc, win);
    var nome = "DETALHE " + win.nome + (win.alvo === "platibanda" && mc2.cob.calhas.length ? " / CALHA" : "");
    var hT = d.titulo(D, x, y, nome, "ESC 1:25", o.numero), hTxt = D.E.T.nota;
    d.escalaCota(D, 25);
    var wmm = (win.u1 - win.u0) * k, hmm = (win.y1 - win.y0) * k, ctD = { u0: win.u0, u1: win.u1, eixo: ct.eixo, coord: ct.coord, letra: ct.letra, semRua: true };
    var ch = chamadasDe(c, mc2, fa), maxW = 0;
    ch.forEach(function (q) { q.linhas.forEach(function (s) { maxW = Math.max(maxW, d.largTexto(s, hTxt)); }); });
    var colW = Math.min(60, maxW + 3), xL = x + colW, X = xL + 6, yTop = y + hT + 4, Yb = yTop + hmm;
    var F = CTm.desenharCorte(c, ctD, mc2, X, Yb, k, { conc: o.ex.conc, parede: o.ex.parede, semSolo: true });
    D.ret(X, yTop, wmm, hmm, "ARQ-QUADRO");
    /* as chamadas do detalhe: as duas colunas coladas no recorte (metade de cada lado), linha curta */
    var itens = ch.map(function (q) { return { ax: F.U(q.u), ay: F.Y(q.y), linhas: q.linhas, kind: q.kind, pref: null }; });
    var res = colocarChamadas(D, itens, { xL: xL, xR: X + wmm + 6, xMeio: X + wmm / 2, ocupadoR: [], maxShift: 22, maxLen: 44, area: [x, yTop - 2, X + wmm + 80, Yb + 2] });
    return { chamadas: itens.map(function (it) { return { kind: it.kind, linhas: it.linhas, colocada: it.colocada }; }), nome: nome, F: F, leaders: res.leaders };
  }

  /* ================================================================ AS VISTAS 3D (a foto da cena do BIM, ou a vista vetorial mais próxima) */
  function caixaDoCorte(c, ct, F) { return F.caixaModelo(c.dados, true); }   /* só a edificação: o corte 3D e o perspectivado não mostram vegetação, muro nem terreno de fora */
  /* a câmera: az/elev em graus; a caixa b é recortada no plano do corte (AA olha para −z, BB para +x): o que fica ATRÁS do plano é o que se vê */
  function argsCorte(F, b, ct, az, elevGraus) {
    var bb = { x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1, z0: b.z0, z1: b.z1 };
    if (ct.eixo === "x") bb.z1 = ct.coord; else bb.x0 = ct.coord;
    var a = F.argsIso(bb, az);
    if (elevGraus != null) {   /* a elevação própria: o argsIso do arqpranchas usa a isométrica; aqui refaz a câmera com o ângulo pedido */
      var A = az * Math.PI / 180, E = elevGraus * Math.PI / 180, cE = Math.cos(E), sE = Math.sin(E), sA = Math.sin(A), cA = Math.cos(A);
      var V = [cE * sA, sE, cE * cA], R = [cA, 0, -sA], U = [-sE * sA, cE, -sE * cA], us = [], vs = [];
      [bb.x0, bb.x1].forEach(function (x) { [bb.y0, bb.y1].forEach(function (y) { [bb.z0, bb.z1].forEach(function (z) { us.push(R[0] * x + R[1] * y + R[2] * z); vs.push(-(U[0] * x + U[1] * y + U[2] * z)); }); }); });
      var u0 = Math.min.apply(null, us), u1 = Math.max.apply(null, us), v0 = Math.min.apply(null, vs), v1 = Math.max.apply(null, vs), mg = Math.max(u1 - u0, v1 - v0) * F.K_FOTO.margem;
      u0 -= mg; u1 += mg; v0 -= mg; v1 += mg;
      var T = [(bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2, (bb.z0 + bb.z1) / 2];
      a = { R: R, U: U, V: V, T: T, uT: R[0] * T[0] + R[1] * T[1] + R[2] * T[2], vT: -(U[0] * T[0] + U[1] * T[1] + U[2] * T[2]), u0: u0, u1: u1, v0: v0, v1: v1, largura: F.K_FOTO.largPx, min: [bb.x0, bb.y0, bb.z0], max: [bb.x1, bb.y1, bb.z1], instalacoes: false, razao: (u1 - u0) / (v1 - v0) };
    }
    return a;
  }
  /* o MOBILIÁRIO do modelo na elevação do corte (vista disponível mais próxima do corte perspectivado): cada peça da família (o contorno de cada sólido, girado pela rotação do móvel)
     que está além do plano, dentro dos ambientes cortados, do mais longe para o mais perto; o que uma parede do fundo (a vista) esconde não é desenhado. */
  function moveisAlemDoPlano(c, ct, mc, F) {
    var D = c.D, d = DS(), G = GEO(), lista = [], desenhados = 0;
    arr(c.dados.moveis).forEach(function (m) {
      if (!VIVO[m.status] || !(m.h1 > m.h0) || m.famId === "hid-caixa-dagua" || m.famId === "ra-pais-deck") return;
      var bb = G.bbox(m.pts); if (!bb) return;
      var prof, u0, u1;
      if (ct.eixo === "x") { if (bb[3] > ct.coord + 0.02) return; prof = ct.coord - bb[3]; u0 = bb[0]; u1 = bb[2]; } else { if (bb[0] < ct.coord - 0.02) return; prof = bb[0] - ct.coord; u0 = bb[1]; u1 = bb[3]; }
      var amb = null; mc.ambientes.forEach(function (a) { if (!amb && u1 > a.u0 && u0 < a.u1) amb = a; });
      if (!amb) return;
      var tapado = arr(mc.vista).some(function (v) { return !v.muro && v.prof < prof - 0.02 && v.u1 > u0 + 0.05 && v.u0 < u1 - 0.05 && v.yt >= m.h1 - 0.01; });
      if (tapado) return;
      var th = num(m.rotY, 0), cs = Math.cos(th), sn = Math.sin(th);
      arr(m.pecas).forEach(function (pc) {
        var us = [], zs = [];
        [[pc.x0, pc.z0], [pc.x1, pc.z0], [pc.x1, pc.z1], [pc.x0, pc.z1]].forEach(function (q) { var wx = m.x + cs * q[0] + sn * q[1], wz = m.z - sn * q[0] + cs * q[1]; us.push(ct.eixo === "x" ? wx : wz); zs.push(ct.eixo === "x" ? ct.coord - wz : wx - ct.coord); });
        var a0 = Math.max(Math.min.apply(null, us), amb.u0 + 0.03), a1 = Math.min(Math.max.apply(null, us), amb.u1 - 0.03);
        if (a1 - a0 < 0.02) return;
        lista.push({ u0: a0, u1: a1, y0: m.y + pc.y0, y1: m.y + pc.y1, prof: Math.min.apply(null, zs), nome: m.nome });
      });
    });
    lista.sort(function (a, b) { return b.prof - a.prof; }).forEach(function (q) {
      var P = [[F.U(q.u0), F.Y(q.y1)], [F.U(q.u1), F.Y(q.y1)], [F.U(q.u1), F.Y(q.y0)], [F.U(q.u0), F.Y(q.y0)]];
      d.fundoPol(D, P, "#e9e1d3"); D._cam = "ARQ-MOVEL"; D.traco(P, true); D._cam = null; desenhados++;
    });
    return desenhados;
  }
  /* o CORTE 3D vetorial SÓLIDO (sem o 3D do BIM): a seção extrudada em perspectiva oblíqua, com faces cheias — a face cortada (vermelha na laje, na viga e no pilar de concreto; cinza na parede),
     o topo claro e a lateral em cinza médio (a cor muda com a orientação), o telhado na cor do material. Do mais baixo para o mais alto: as extrusões primeiro, as faces cortadas por cima. */
  function secaoSolida(c, ct, mc, F, k, prof, ex) {
    var D = c.D, d = DS(), ox = prof * k * 0.5 * Math.cos(Math.PI / 4), oy = -prof * k * 0.5 * Math.sin(Math.PI / 4), pri = [];
    function rect(u0, y0, u1, y1, fr, tp, lt, muro) { pri.push({ y0: y0, F: [[F.U(u0), F.Y(y1)], [F.U(u1), F.Y(y1)], [F.U(u1), F.Y(y0)], [F.U(u0), F.Y(y0)]], fr: fr, tp: tp, lt: lt, muro: muro }); }
    mc.paredes.forEach(function (p) { rect(p.u0, p.yb, p.u1, p.yt, p.muro ? "#e3e3e3" : ex.parede, "#f6f6f6", "#b4b4b4"); });
    mc.lajes.forEach(function (l) { rect(l.u0, l.y0, l.u1, l.y1, ex.conc, "#f08a7e", "#a3170a"); });
    mc.pecas.forEach(function (p) {
      if (p.poli) return;
      if (p.cls === "conc") rect(p.u0, p.y0, p.u1, p.y1, ex.conc, "#f08a7e", "#a3170a");
      else if (p.cls === "agua") rect(p.u0, p.y0, p.u1, p.y1, "#9cc4e4", "#d6e8f6", "#6f9fc4");
      else rect(p.u0, p.y0, p.u1, p.y1, ex.parede, "#f6f6f6", "#b4b4b4");
    });
    mc.telhado.forEach(function (t) {
      var A = [F.U(t.u0), F.Y(t.ya)], B = [F.U(t.u1), F.Y(t.yb)], C = [F.U(t.u1), F.Y(t.yb - t.esp)], E = [F.U(t.u0), F.Y(t.ya - t.esp)];
      pri.push({ y0: Math.min(t.ya, t.yb) - t.esp, F: [A, B, C, E], fr: "#c9a982", tp: "#e6d3b8", lt: "#a98b66", telha: true });
    });
    pri.sort(function (a, b) { return a.y0 - b.y0; });
    function B(p) { return [p[0] + ox, p[1] + oy]; }
    pri.forEach(function (q) {   /* topo (a aresta de cima da face cortada levada para trás) e lateral direita, cheios */
      var P = q.F, top = [P[0], P[1], B(P[1]), B(P[0])], lado = [P[1], B(P[1]), B(P[2]), P[2]];
      d.fundoPol(D, top, q.tp); D._cam = "ARQ-FINA"; D.traco(top, true); D._cam = null;
      d.fundoPol(D, lado, q.lt); D._cam = "ARQ-FINA"; D.traco(lado, true); D._cam = null;
    });
    pri.forEach(function (q) { d.fundoPol(D, q.F, q.fr); D._cam = "ARQ-PAREDE"; D.traco(q.F, true); D._cam = null; });
  }

  /* ================================================================ A LEGENDA */
  function desenharLegenda(c, x, y) {
    var D = c.D, d = DS(), T = D.E.T, h = T.nota, lh = h * 1.5, w = 150;
    D.texto(x, y + T.tabelaCab * 0.8, "LEGENDA INDICAÇÕES:", T.tabelaCab, { peso: 0.2 });
    var y0 = y + T.tabelaCab * 1.6 + 5, c1 = x + 4, c2 = x + w / 2 + 6;
    function rot(xx, yy, s) { D.texto(xx, yy, s, h * 0.85, { al: "C" }); }
    /* INDICAÇÃO DE NÍVEL: o triângulo com o texto do nível acabado */
    D.texto(c1 + 20, y0, "INDICAÇÃO DE NÍVEL", h, { al: "C" });
    D.nivel(c1 + 6, y0 + 12, "0,00", 1); rot(c1 + 20, y0 + 19, "NÍVEL ACABADO");
    /* INDICAÇÃO CORTE: o círculo com a letra repetida, as setas do sentido e o número da folha */
    D.texto(c2 + 22, y0, "INDICAÇÃO CORTE", h, { al: "C" });
    var cx = c2 + 22, cy = y0 + 12;
    D.circ(cx, cy, 4.2, "ARQ-SIMBOLO"); D.texto(cx, cy, "XX", h * 1.1, { al: "C", meio: true });
    D.cheio([[cx - 6.4, cy - 2.4], [cx - 6.4, cy + 2.4], [cx - 9.4, cy]], "#000"); D.cheio([[cx + 6.4, cy - 2.4], [cx + 6.4, cy + 2.4], [cx + 9.4, cy]], "#000");
    rot(cx, y0 + 21.5, "NÚMERO DO CORTE / DA FOLHA");
    /* INDICAÇÃO ESQUADRIA: o círculo com o código da porta ou janela */
    var y1 = y0 + 30;
    D.texto(c1 + 20, y1, "INDICAÇÃO ESQUADRIA", h, { al: "C" });
    tagEsquadria(D, c1 + 20, y1 + 10, "XXX", 2.0); rot(c1 + 20, y1 + 18, "NOME PORTA / JANELA");
    /* INDICAÇÃO PAGINAÇÃO: o losango */
    D.texto(c2 + 22, y1, "INDICAÇÃO PAGINAÇÃO", h, { al: "C" });
    var dx = c2 + 22, dy = y1 + 10;
    D.poli([[dx, dy - 4.4], [dx + 4.4, dy], [dx, dy + 4.4], [dx - 4.4, dy]], "ARQ-SIMBOLO", true); D.texto(dx, dy, "XX", h * 1.1, { al: "C", meio: true });
    rot(dx, y1 + 18, "NÚMERO DA PAGINAÇÃO");
    void lh; void d;
    return { w: w, h: y1 + 22 - y };
  }

  /* ================================================================ OS QUADROS */
  function c2(v) { return DS().br(v, 2); }
  /* ZQ = fator de tamanho dos quadros (1 = o padrão; 1,3 estourava o A1 e jogava os cortes para 1:75) */
  var ZQ = 1;
  function tg(D, x, y, w, titulo, def, linhas) { var T = D.E.T; return QD().tabela(D, x, y, w * ZQ, titulo, def, linhas, { fs: T.tabela * ZQ, fsc: T.tabelaCab * 0.85 * ZQ }); }
  function tabelas(c, Q) {
    var Qd = QD(), fa = fatos(c), out = [];
    function T(id, fn) { out.push({ id: id, fn: fn }); }
    T("quadro-ambientes", function (D, x, y) {
      var tot = 0, L = Q.ambientes.map(function (a) { tot += a.area; return [txt(a.nome).toUpperCase(), txt(a.nivel), c2(a.area), c2(a.perimetro)]; });
      if (!L.length) L = [[{ t: "sem ambiente no modelo", cor: VERMELHO_PEND }, "", "", ""]];
      else L.push({ total: ["TOTAL", "", c2(tot), ""] });
      return tg(D, x, y, 120, "TABELA DE ÁREAS E AMBIENTES", [{ t: "AMBIENTE", f: 3, al: "E" }, { t: "NÍVEL", f: 3.4, al: "E" }, { t: ["ÁREA", "(m²)"], f: 1.3 }, { t: ["PERÍMETRO", "(m)"], f: 1.6 }], L);
    });
    function esq(id, titulo, lista, comArea) {
      T(id, function (D, x, y) {
        var L = lista.map(function (q) { return comArea ? [q.cod, txt(q.ambiente).toUpperCase(), String(q.qtd), c2(q.largura), c2(q.altura), c2(q.peitoril), c2(q.area), txt(q.descricao)] : [q.cod, txt(q.ambiente).toUpperCase(), String(q.qtd), c2(q.largura), c2(q.altura), txt(q.descricao)]; });
        var cols = comArea ? [{ t: "COD.", f: 0.9 }, { t: "AMBIENTE", f: 2.6, al: "E" }, { t: "QTD.", f: 0.9 }, { t: ["LARGURA", "(m)"], f: 1.2 }, { t: ["ALTURA", "(m)"], f: 1.2 }, { t: ["PEITORIL", "(m)"], f: 1.2 }, { t: ["ÁREA", "(m²)"], f: 1.1 }, { t: "DESCRIÇÃO", f: 4.6, al: "E" }]
          : [{ t: "COD.", f: 0.9 }, { t: "AMBIENTE", f: 2.6, al: "E" }, { t: "QTD.", f: 0.9 }, { t: ["LARGURA", "(m)"], f: 1.2 }, { t: ["ALTURA", "(m)"], f: 1.2 }, { t: "DESCRIÇÃO", f: 4.6, al: "E" }];
        return tg(D, x, y, comArea ? 170 : 150, titulo, cols, L);
      });
    }
    if (Q.janelas.length) esq("quadro-janelas", "QUANTITATIVO DE JANELAS", Q.janelas, true);
    if (Q.portas.length) esq("quadro-portas", "QUANTITATIVO DE PORTAS E GRADIS", Q.portas, false);
    function pecas(id, titulo, B, total) {
      T(id, function (D, x, y) {
        var L = B.itens.map(function (q) { return [txt(q.peca), c2(q.comprimento), txt(q.descricao)]; });
        if (B.itens.length > 1) L.push({ total: ["TOTAL", c2(total), ""] });
        return tg(D, x, y, 200, titulo, [{ t: "PEÇA", f: 2.2, al: "E" }, { t: ["COMPRIMENTO", "(m)"], f: 1.5 }, { t: "DESCRIÇÃO", f: 7.6, al: "E" }], L);
      });
    }
    if (Q.rufo.itens.length) pecas("quadro-rufo", "QUANTITATIVO RUFO", Q.rufo, Q.rufo.total);
    if (Q.calha.itens.length) pecas("quadro-calha", "QUANTITATIVO CALHA", Q.calha, Q.calha.total);
    if (Q.pingadeira.itens.length) pecas("quadro-pingadeira", "QUANTITATIVO PINGADEIRA", Q.pingadeira, Q.pingadeira.total);
    if (Q.forro.itens.length) T("quadro-forro", function (D, x, y) {
      var L = Q.forro.itens.map(function (q) { return [txt(q.material).toUpperCase(), DS().nivelTxt(q.nivel), c2(q.area)]; });
      if (Q.forro.itens.length > 1) L.push({ total: ["TOTAL", "", c2(Q.forro.area)] });
      return tg(D, x, y, 120, "QUANTITATIVO FORRO", [{ t: "MATERIAL", f: 3.6, al: "E" }, { t: "NÍVEL (m)", f: 1.3 }, { t: ["ÁREA", "(m²)"], f: 1.2 }], L);
    });
    if (Q.telhado.itens.length) T("quadro-telhado", function (D, x, y) {
      var L = Q.telhado.itens.map(function (q) { return [c2(q.area), txt(q.descricao)]; });
      return tg(D, x, y, 120, "QUANTITATIVO MATERIAIS TELHADO", [{ t: ["ÁREA", "(m²)"], f: 1.2 }, { t: "DESCRIÇÃO", f: 5, al: "E" }], L);
    });
    void fa;
    return out;
  }

  /* ================================================================ A FOLHA */
  var ESCALAS = [50, 75, 100];
  function novoD(c) { return DS().novo(c.E, true); }
  function foto3dFrame(c, F, tipo, ct, wmm, hmm) {
    /* devolve { foto } quando o 3D responde; senão null (o chamador desenha a vista vetorial e registra a pendência) */
    /* AA (plano z = coord, olha para −z, a câmera fica no lado +z) e BB (plano x = coord, olha para +x, a câmera fica no lado −x): o PERSPECTIVADO olha quase de frente para a face cortada, na altura dos olhos
       (5° de elevação, 8° de giro para dar profundidade); o CORTE 3D olha para a face cortada de cima e de lado (28° de elevação, 32° de giro) */
    var b = caixaDoCorte(c, ct, F), eixoX = ct.eixo === "x", persp = tipo === "persp";
    var az = eixoX ? (persp ? 8 : 32) : (persp ? 262 : 302), ar = argsCorte(F, b, ct, az, persp ? 5 : 28);
    var foto = F.fotoDe("exec-" + tipo + "-" + ct.letra, ar);
    return foto ? { foto: foto, razao: ar.razao } : null;
  }
  function desenharImagem(D, x, y, w, h, foto) {
    var wi = w, hi = w * foto.h / foto.w; if (hi > h) { hi = h; wi = h * foto.w / foto.h; }
    D.add('<image data-im="' + foto.key + '" x="' + r3(x + (w - wi) / 2) + '" y="' + r3(y + (h - hi) / 2) + '" width="' + r3(wi) + '" height="' + r3(hi) + '" preserveAspectRatio="none" href="' + foto.href + '"/>');
    D.ret(x + (w - wi) / 2, y + (h - hi) / 2, wi, hi, "ARQ-FINA");
  }

  /* monta a folha para a geometria `geo`; devolve { ok:false, motivo } se não couber */
  function montar(c, F, geo, op) {
    var d = DS(), G = DG(), CTm = CT(), E = c.E, A = geo.area, ES0 = ES(), avisos = [], op0 = op || {};
    var ex = { conc: ES0.CORES.construir, parede: "#e4e4e4" };
    var fa = fatos(c), Q = quantitativos(c), cts0 = arr(c.cortes).slice(0, 2);
    if (!cts0.length) return { ok: false, motivo: "o modelo não tem corte escolhido." };
    var cts = cts0.map(function (ct) { var o = {}; Object.keys(ct).forEach(function (kk) { o[kk] = ct[kk]; }); o.u0 = (ct.pu0 != null ? ct.pu0 : ct.u0) - 0.45; o.u1 = (ct.pu1 != null ? ct.pu1 : ct.u1) + 0.45; o.semRua = true; o.exec = true; return o; });
    var mcs = cts.map(function (ct) { c.D = novoD(c); return CTm.modeloCorte(c, ct); });
    var jan = escolherJanela(mcs, cts), tabs = tabelas(c, Q), GAP = 10, folhaNum = txt(op0.numeroFolha) || "ARQ-00";
    var numDet = 5, resultados = null, ultimoMotivo = "";
    ESCALAS.forEach(function (esc) {
      if (resultados) return;
      var blocos = {}, escalas = {}, info = { chamadas: [], tags: [], sem: [] };
      function bloco(id, escala, fn) {
        var Dn = novoD(c), ant = c.D; c.D = Dn;
        var b; try { b = G.capturar(Dn, fn); } finally { c.D = ant; }
        if (!b.box) return null;
        b.id = id; b.w = b.box[2] - b.box[0]; b.h = b.box[3] - b.box[1]; blocos[id] = b; if (escala) escalas[id] = "1:" + escala;
        return b;
      }
      var cortesBl = cts.map(function (ct, i) {
        return bloco("corte-" + ct.letra + ct.letra, esc, function () {
          var r = desenharBlocoCorte(c, ct, mcs[i], { esc: esc, numero: i + 1, ex: ex, detalhe: jan && jan.idx === i ? { win: jan, numero: numDet, folha: folhaNum } : null }, fa);
          info.chamadas = info.chamadas.concat(r.chamadas.filter(function (q) { return q.colocada; }).map(function (q) { return { corte: ct.letra, kind: q.kind, linhas: q.linhas, caixa: q.caixa }; })); info.tagsPos = (info.tagsPos || []).concat(r.tagsPos.map(function (q) { q.corte = ct.letra; return q; })); info.aberturas = (info.aberturas || []).concat(r.aberturas.map(function (q) { q.corte = ct.letra; return q; })); info.leaders = (info.leaders || []).concat(r.leaders.map(function (l) { return { corte: ct.letra, comp: l.comp, pts: l.pts }; })); (r.semChamada || []).forEach(function (kd) { info.sem.push("chamada " + kd + " (corte " + ct.letra + ")"); }); info.tags = info.tags.concat(r.tags.map(function (t) { return { corte: ct.letra, cod: t }; })); info.sem = info.sem.concat(r.sem);
          return r;
        });
      });
      if (cortesBl.some(function (b) { return !b; })) { ultimoMotivo = "corte sem desenho."; return; }
      var wC = 0; cortesBl.forEach(function (b) { wC = Math.max(wC, b.w); });
      var hC = cortesBl.map(function (b) { return b.h; });
      function dy_(h) { var t = 0; h.forEach(function (v) { t += v + GAP; }); return t; }
      var xV = wC + GAP, wV = A.w - xV - 2;
      if (wV < 110) { ultimoMotivo = "os cortes em 1:" + esc + " não deixam largura para as vistas 3D."; return; }
      /* as duas vistas 3D (o recorte do mesmo plano do corte): foto do BIM, ou a vista vetorial mais próxima */
      var viewsBl = [], pend3d = false;
      [["persp", "CORTE PERSPECTIVADO", 3], ["tres", "CORTE 3D", 4]].forEach(function (V, i) {
        var ix = Math.min(i, cts.length - 1), ct = cts[ix], mc = mcs[ix], hv = Math.max(70, Math.round(1.42 * hC[Math.min(i, hC.length - 1)])), b;
        b = bloco("vista-" + V[0], null, function () {
          var Dv = c.D, x = 12, y = 12, hT = d.titulo(Dv, x, y, V[1] + " " + ct.letra + ct.letra, "SEM ESCALA", V[2]), caixaH = Math.max(40, hv - hT - 6), caixaW = wV - 8, fr = F.temFoto ? foto3dFrame(c, F, V[0], ct, caixaW, caixaH) : null;
          if (fr) { desenharImagem(Dv, x, y + hT + 3, caixaW, caixaH, fr.foto); return { foto: true }; }
          pend3d = true;
          /* vista disponível mais próxima, na maior escala padrão em que cabe no quadro: o corte com o mobiliário e a parede do fundo / a seção SÓLIDA extrudada */
          var mgv = 0.35, prof = ct.eixo === "x" ? Math.max(0.5, ct.coord - c.dados.caixa[1]) : Math.max(0.5, c.dados.caixa[2] - ct.coord), ext = V[0] === "tres" ? prof * 0.5 * 0.7071 : 0;
          var wm = (ct.u1 - ct.u0) + 2 * mgv + ext, hm = (mc.yMax - mc.yMin) + ext, kk = 0;
          kk = Math.min(40, (caixaW - 8) / wm, (caixaH - 14) / hm);   /* vista sem escala (SEM ESCALA no título): enche o quadro em vez de parar numa escala padrão */
          if (!(kk > 1)) kk = 1000 / 250;
          var X = x + 4 + mgv * kk, Yb = y + hT + 4 + (ext + (mc.yMax - mc.yMin)) * kk, ctv = { u0: ct.u0, u1: ct.u1, eixo: ct.eixo, coord: ct.coord, letra: ct.letra, semRua: true };
          if (V[0] === "persp") {
            var logV = []; var Fi = CTm.desenharCorte(c, ctv, mc, X, Yb, kk, { conc: ex.conc, parede: ex.parede, vistaFill: "#f1ece2", vistaSolida: true, margem: mgv, log: logV }); logV.forEach(function (q) { q.corte = ct.letra + "-persp"; (info.aberturas = info.aberturas || []).push(q); });
            info.moveis = moveisAlemDoPlano(c, ctv, mc, Fi);
          } else {
            var Fj = { U: function (u) { return X + (u - ctv.u0) * kk; }, Y: function (yy) { return Yb - (yy - mc.yMin) * kk; } };
            secaoSolida(c, ctv, mc, Fj, kk, prof, ex);
          }
          Dv.texto(x, Yb + 7, "VISTA MAIS PRÓXIMA (3D DO BIM FECHADO): " + (V[0] === "persp" ? "CORTE COM O MOBILIÁRIO E A PAREDE DO FUNDO" : "SEÇÃO SÓLIDA EXTRUDADA EM OBLÍQUA") + " - A IMAGEM DA CENA SAI COM O BIM ABERTO", 1.9, { al: "E" });
          return { foto: false, esc: Math.round(1000 / kk) };
        });
        if (b) viewsBl.push(b);
      });
      if (pend3d) avisos.push("Corte perspectivado e corte 3D: o 3D do BIM não estava aberto (BIM.fotoIso), por isso os quadros mostram a vista disponível mais próxima (elevação do corte com o mobiliário e a seção extrudada); com o BIM aberto as duas imagens saem da própria cena 3D, com a caixa de corte no plano do corte.");
      /* os blocos da faixa de baixo: detalhe, legenda e os quadros */
      var baixo = [], ordem = 0;
      if (jan) {
        var bd = bloco("detalhe-1", 25, function () { var r = desenharBlocoDetalhe(c, cts[jan.idx], mcs[jan.idx], jan, { numero: numDet, ex: { conc: ex.conc, parede: ex.parede, semSolo: true } }, fa); info.chamadasDetalhe = r.chamadas.filter(function (q) { return q.colocada; }).map(function (q) { return { kind: q.kind, linhas: q.linhas }; }); info.leadersDetalhe = r.leaders; info.detalheNome = r.nome; return r; });
        if (bd) baixo.push({ id: bd.id, w: bd.w, h: bd.h, grupo: "detalhe", ordem: ordem++ });
      } else avisos.push("Detalhe ampliado 1:25: o modelo não tem platibanda, calha nem beiral que o corte atravesse: sem detalhe.");
      var bl = bloco("legenda", null, function () { return desenharLegenda(c, 12, 12); }); if (bl) baixo.push({ id: bl.id, w: bl.w, h: bl.h, grupo: "legenda", ordem: ordem++ });
      tabs.forEach(function (t) { var bt = bloco(t.id, null, function () { return t.fn(c.D, 12, 12); }); if (bt) baixo.push({ id: bt.id, w: bt.w, h: bt.h, grupo: "quadros", ordem: ordem++ }); });
      /* duas regiões livres: embaixo dos cortes (detalhe e legenda) e embaixo das vistas 3D (os quadros); o que não cabe na primeira vai para a segunda */
      if (global.__EXDBG) console.log("esc", esc, "wC", wC, "hC", hC, "xV", xV, "wV", wV, baixo.map(function (b) { return b.id + ":" + Math.round(b.w) + "x" + Math.round(b.h); }).join(" "), "A", A.w, A.h);
      var hv0 = viewsBl[0] ? viewsBl[0].h : 0, hv1 = viewsBl[1] ? viewsBl[1].h : 0, yEndViews = 2 + hv0 + GAP + hv1 + GAP, yLeft = dy_(hC) , xR = xV;
      var regL = { w: wC + 4, h: A.h - yLeft }, regR = { w: A.w - xR, h: A.h - yEndViews };
      var listaL = baixo.filter(function (b) { return b.grupo === "detalhe" || b.grupo === "legenda"; }), resto = baixo.filter(function (b) { return !(b.grupo === "detalhe" || b.grupo === "legenda"); }), gR = [], pL = null;
      if (listaL.length && regL.h > 30) {
        pL = G.empacotar(listaL, regL, { gap: GAP, margem: 2 });
        if (pL.naoCabe.length || pL.folhas.length !== 1) { resto = listaL.concat(resto); listaL = []; pL = null; }
      } else { resto = listaL.concat(resto); listaL = []; }
      /* os quadros vão para a região com MAIS espaço livre (a de baixo dos cortes ou a de baixo das vistas 3D), um a um; se não cabe numa, tenta a outra: a folha fica equilibrada */
      function usada(L) { var t = 0; L.forEach(function (b) { t += (b.w + GAP) * (b.h + GAP); }); return t; }
      var pRtent = null;
      resto.slice().sort(function (a, b) { return b.h * b.w - a.h * a.w; }).forEach(function (b) {
        var livreL = regL.w * regL.h - usada(listaL), livreR = regR.w * regR.h - usada(gR), ordemReg = livreL >= livreR ? ["L", "R"] : ["R", "L"], pos = false;
        ordemReg.forEach(function (rg) {
          if (pos) return;
          if (rg === "L" && regL.h > 30) { var tl = G.empacotar(listaL.concat([b]), regL, { gap: GAP, margem: 2 }); if (!tl.naoCabe.length && tl.folhas.length === 1) { listaL.push(b); pL = tl; pos = true; } }
          else if (rg === "R") { var tr = G.empacotar(gR.concat([b]), regR, { gap: GAP, margem: 2 }); if (!tr.naoCabe.length && tr.folhas.length === 1) { gR.push(b); pRtent = tr; pos = true; } }
        });
        if (!pos) gR.push(b);
      });
      var pR = G.empacotar(gR, regR, { gap: GAP, margem: 2 });
      if (pR.naoCabe.length || pR.folhas.length > 1) { ultimoMotivo = "os quadros não cabem na faixa livre em 1:" + esc + "."; return; }
      var itens = [], dy = 0;
      cortesBl.forEach(function (b) { itens.push({ id: b.id, x: 2, y: dy + 2, w: b.w, h: b.h, fixo: true }); dy += b.h + GAP; });
      viewsBl.forEach(function (b, i) { itens.push({ id: b.id, x: xV, y: i === 0 ? 2 : hv0 + GAP + 2, w: b.w, h: b.h, fixo: true }); });
      /* o que sobra de altura na região é repartido entre as filas (as posições verticais crescem na mesma proporção: quem estava empilhado continua sem encostar): a folha não termina com uma faixa vazia */
      function esticar(itensR, altura) {
        var fundo = 0; itensR.forEach(function (q) { fundo = Math.max(fundo, q.y + q.h); });
        var f = fundo > 0 ? Math.min(1.9, (altura - 4) / fundo) : 1; if (!(f > 1)) f = 1;
        return itensR.map(function (q) { return { id: q.id, x: q.x, y: q.y * f, w: q.w, h: q.h }; });
      }
      if (pL) esticar(pL.folhas[0].itens, regL.h).forEach(function (q) { itens.push({ id: q.id, x: q.x, y: q.y + yLeft, w: q.w, h: q.h, fixo: false }); });
      if (pR.folhas[0]) esticar(pR.folhas[0].itens, regR.h).forEach(function (q) { itens.push({ id: q.id, x: q.x + xR, y: q.y + yEndViews, w: q.w, h: q.h, fixo: false }); });
      resultados = { esc: esc, blocos: blocos, escalas: escalas, itens: itens, info: info, pend3d: pend3d };
    });
    if (!resultados) return { ok: false, motivo: ultimoMotivo || "não coube." };
    /* compõe: um Desenho novo com todos os blocos nas posições; a conferência de sobreposição (texto, linha, bloco) roda sobre ele */
    var D = novoD(c), cp = G.compor(D, { itens: resultados.itens }, resultados.blocos, A, { escalas: resultados.escalas, numerar: false });
    var cb = G.conferir(cp.colocados, A, 6), conf = d.conferir(D, [A.x - 1, A.y - 1, A.x + A.w + 1, A.y + A.h + 1]);
    var ocupacao = 0; cp.colocados.forEach(function (q) { ocupacao += q.w * q.h; }); ocupacao = ocupacao / (A.w * A.h);
    return { ok: true, D: D, colocados: cp.colocados, escalas: resultados.escalas, escCorte: resultados.esc, fatos: fa, quantitativos: Q, chamadas: resultados.info.chamadas, chamadasDetalhe: resultados.info.chamadasDetalhe || [], leaders: resultados.info.leaders || [], leadersDetalhe: resultados.info.leadersDetalhe || [], ocupacao: ocupacao, moveisVista: resultados.info.moveis || 0, aberturas: resultados.info.aberturas || [], tagsPos: resultados.info.tagsPos || [], tags: resultados.info.tags,
      detalhe: jan ? { nome: resultados.info.detalheNome, alvo: jan.alvo, corte: cts[jan.idx].letra, numero: numDet } : null, pend3d: resultados.pend3d, avisos: avisos.filter(function (q, i, L) { return L.indexOf(q) === i; }).concat(resultados.info.sem.length ? ["Cortes: sem lugar livre para o rótulo de " + resultados.info.sem.join(", ") + "."] : []),
      conferencia: conf, desenho: D, blocos: cb, cortes: cts, tabelasIds: tabs.map(function (t) { return t.id; }) };
  }

  var ArqExecutiva = { fatos: fatos, quantitativos: quantitativos, chamadasDe: chamadasDe, montar: montar, escolherJanela: escolherJanela, ambienteDoVao: ambienteDoVao, recortar: recortar, colocarChamadas: colocarChamadas, ESCALAS: ESCALAS };
  global.ArqExecutiva = ArqExecutiva;
  if (typeof module !== "undefined" && module.exports) module.exports = ArqExecutiva;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
