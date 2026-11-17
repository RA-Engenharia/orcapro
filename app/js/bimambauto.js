/* =====================================================================
 * bimambauto.js — GERAR AMBIENTES (motor PURO, ES5, Node-testável).
 *
 * Pedido do Rogério (16/11/2026): "Gerar ambientes" — por nível ou no projeto todo — acha TODA região
 * fechada por paredes/pilares/separadores (cômodo, corredor, área externa) e coloca um ambiente em
 * cada, com NOME SUGERIDO por heurística; ele só renomeia. Não duplica onde já tem ambiente (rodar de
 * novo não empilha) e o lote vai numa op só (um Ctrl+Z desfaz).
 *
 * COMO FUNCIONA (a geometria é a do próprio ambiente, js/bimambiente.js):
 *   · BimAmbiente.regioes(estado, nível, cota) devolve as faces LIVRES do mesmo arranjo que o calcular
 *     usa (paredes reais, pilares, separadores; sem o miolo das paredes). Aqui cada face vira candidata.
 *   · o PONTO do ambiente é o ponto mais afastado das bordas (não a média: no L e no U a média cai fora);
 *   · região que já tem ambiente (o ponto de algum ambiente do mesmo nível cai nela) é pulada;
 *   · conferência final: o calcular roda com os novos e só ficam os que saíram "delimitado" (um ambiente
 *     que o motor não reconhece como região própria não vai para o projeto).
 *
 * NOME POR PISTAS (regras na ordem; a primeira que casa vale; nada casou → "Ambiente N"):
 *   1 bacia / chuveiro / box / lavatório …... Banheiro (com chuveiro ou box) · WC (sem chuveiro)
 *   2 bancada, armário, geladeira, fogão ..... Cozinha ("Sala e cozinha" se também há sofá/mesa de jantar)
 *   3 tanque, máquina de lavar ................ Lavanderia
 *   4 cama .................................... Quarto · Suíte (a única porta do banheiro abre nele)
 *   5 guarda-roupa / closet sem cama ......... Closet
 *   6 sofá, rack, mesa de jantar ............. Sala · escrivaninha: Escritório
 *   7 estreita e longa ligando portas ........ Circulação
 * ÁREA EXTERNA (identificada à parte; ocupacao = coberta | descoberta; departamento = "Áreas externas"):
 *   é externa a região cujo contorno é feito de parede BAIXA (muro, mureta, guarda-corpo: altura < 1,60 m)
 *   em 50% ou mais da volta, OU a região a céu aberto (sem laje nem cobertura em cima) num modelo em que o
 *   resto da casa tem teto. Coberta = laje ou cobertura acima do ponto. O que não é fechado por parede ou
 *   separador (varanda só com pilares) não é região fechada: o usuário fecha com um separador de ambiente.
 *
 * LIMITES DECLARADOS: o nome é SUGESTÃO por pista de peça/forma, não é o programa de necessidades; sem peça
 * dentro e sem forma de corredor, vale "Ambiente N". Região menor que 0,5 m² (prumada, caixa de pilares)
 * não vira ambiente.
 *
 * Teste: node tools/test-bimambauto.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  function AM() { return dep("BimAmbiente", "./bimambiente.js"); }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function sem(s) { return txt(s).normalize ? txt(s).normalize("NFD").replace(/[̀-ͯ]/g, "") : txt(s); }

  var PADRAO = {
    areaMinima: 0.5,          /* m² — menor que isto é prumada/caixa de pilar, não ambiente */
    muroAlturaMax: 1.6,       /* m — parede mais baixa que isto é muro/mureta/guarda-corpo */
    muroFracao: 0.5,          /* fração da volta em parede baixa para a região ser externa */
    corredorLargMax: 1.6,     /* m — folga livre (2 × distância ao contorno) de um corredor */
    corredorAlongamento: 2.2, /* comprimento ÷ largura mínimo */
    corredorCompMin: 2.0,     /* m */
    coberturaMin: 1.8,        /* m — laje/cobertura mais baixa que isto acima do piso não cobre */
    deptoExterno: "Áreas externas"
  };

  /* ------------------------------------------------------------- geometria 2D */
  function dentro(p, P) {
    var d = false;
    for (var i = 0, j = P.length - 1; i < P.length; j = i++)
      if ((P[i][1] > p[1]) !== (P[j][1] > p[1]) && p[0] < (P[j][0] - P[i][0]) * (p[1] - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) d = !d;
    return d;
  }
  function distSeg(p, a, b) {
    var ex = b[0] - a[0], ez = b[1] - a[1], l2 = ex * ex + ez * ez, k = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ez) / l2)) : 0;
    var x = a[0] + ex * k - p[0], z = a[1] + ez * k - p[1]; return Math.sqrt(x * x + z * z);
  }
  function distContorno(p, P) { var m = Infinity; for (var i = 0; i < P.length; i++) m = Math.min(m, distSeg(p, P[i], P[(i + 1) % P.length])); return m; }
  function naRegiao(p, g) { if (!dentro(p, g.pts)) return false; for (var i = 0; i < g.furos.length; i++) if (dentro(p, g.furos[i])) return false; return true; }
  function folga(p, g) { var m = distContorno(p, g.pts); g.furos.forEach(function (f) { m = Math.min(m, distContorno(p, f)); }); return m; }
  /* o ponto interno mais afastado das bordas (grade grossa + refino) → { p:[x,z], folga, folgaMax }.
     `pecas` ([[x,z]] móveis e louças soltos na região): o ponto procurado é o mais CENTRAL que ainda deixa a etiqueta (nome + área)
     fora de cima do móvel — entre os pontos com folga de parede de pelo menos 70% da máxima, o mais longe de qualquer peça
     (raio 0,45 m); folga = a da parede no ponto (a largura de um corredor sai dela), folgaMax = a melhor possível. */
  function pontoInterno(g, pecas) {
    var x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    g.pts.forEach(function (q) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); });
    var best = null, nx = Math.max(6, Math.min(70, Math.ceil((x1 - x0) / 0.12))), nz = Math.max(6, Math.min(70, Math.ceil((z1 - z0) / 0.12)));
    function varre(ax0, ax1, az0, az1, n1, n2) {
      for (var i = 0; i <= n1; i++) for (var k = 0; k <= n2; k++) {
        var p = [ax0 + (ax1 - ax0) * i / n1, az0 + (az1 - az0) * k / n2];
        if (!naRegiao(p, g)) continue;
        var f = folga(p, g); if (!best || f > best.folga + 1e-9) best = { p: p, folga: f };
      }
    }
    varre(x0, x1, z0, z1, nx, nz);
    for (var r = 0; r < 3 && best; r++) {
      var h = Math.max((x1 - x0) / nx, (z1 - z0) / nz) / Math.pow(3, r);
      varre(best.p[0] - h, best.p[0] + h, best.p[1] - h, best.p[1] + h, 10, 10);
    }
    if (best) best.folgaMax = best.folga;
    if (best && pecas && pecas.length) {
      var fmax = best.folga, pior = null;
      function livreDePeca(p) { var m = Infinity; pecas.forEach(function (q) { var d = Math.sqrt((p[0] - q[0]) * (p[0] - q[0]) + (p[1] - q[1]) * (p[1] - q[1])) - 0.45; if (d < m) m = d; }); return m; }
      var cand = null;
      for (var i = 0; i <= nx; i++) for (var k = 0; k <= nz; k++) {
        var p = [x0 + (x1 - x0) * i / nx, z0 + (z1 - z0) * k / nz];
        if (!naRegiao(p, g)) continue;
        var f = folga(p, g); if (f < 0.7 * fmax) continue;
        var lp = livreDePeca(p), sc = Math.min(lp, 0.6) + 0.02 * f;   /* acima de 0,6 m livre já basta: aí vale a folga de parede */
        if (!cand || sc > cand.sc + 1e-9) cand = { p: p, folga: f, sc: sc };
      }
      if (cand) { best = { p: cand.p, folga: best.folga, folgaMax: fmax }; }
    }
    return best;
  }
  function retangulo(c) {
    var th = num(c.rotY, 0), L = num(c.comprimento, 0) / 2, E = num(c.espessura, 0) / 2, cx = num(c.cx, 0), cz = num(c.cz, 0);
    var u = [Math.cos(th), -Math.sin(th)], n = [Math.sin(th), Math.cos(th)];
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(function (k) { return [cx + u[0] * L * k[0] + n[0] * E * k[1], cz + u[1] * L * k[0] + n[1] * E * k[1]]; });
  }

  /* ------------------------------------------------------------- o que cobre */
  /* as coberturas do modelo acima da cota yc: lajes (contorno ou retângulo) e coberturas (retângulo) */
  function coberturas(estado, yc, P) {
    var out = [];
    arr(estado && estado.caixas).forEach(function (c) {
      if (!c || c.tipo !== "laje") return;
      var H = num(c.altura, 0); if (!(H > 0)) return;
      var yb = num(c.cy, 0) - H / 2; if (yb < yc + P.coberturaMin) return;
      var pts = Array.isArray(c.contorno) && c.contorno.length >= 3 ? c.contorno.map(function (q) { return [num(q.x, 0), num(q.z, 0)]; }) : (num(c.comprimento, 0) > 0 && num(c.espessura, 0) > 0 ? retangulo(c) : null);
      if (pts) out.push(pts);
    });
    arr(estado && estado.coberturas).forEach(function (c) {
      if (!c || !fin(+c.x0) || !fin(+c.z0) || !fin(+c.x1) || !fin(+c.z1)) return;
      var topo = fin(+c.cumeeira) ? +c.cumeeira : (fin(+c.base) ? +c.base : null); if (topo == null || topo < yc + P.coberturaMin) return;
      out.push([[+c.x0, +c.z0], [+c.x1, +c.z0], [+c.x1, +c.z1], [+c.x0, +c.z1]]);
    });
    return out;
  }

  /* ------------------------------------------------------------- pistas das peças */
  /* o papel de cada família, pelo famId (e pelo texto do tipo/nome quando a peça for importada) */
  var PAPEIS = [
    ["bacia", /^ra-bacia|vaso\s*sanit|bacia\s*sanit/],
    ["chuveiro", /^ra-(chuveiro|banho-box|banho-hidromassagem)|chuveiro|\bbox\b|banheira/],
    ["lavatorio", /^ra-(lavatorio|banho-bancada)|lavat[oó]rio|cuba\s*de\s*banh/],
    ["cozinha", /^ra-coz-(inferior|superior|ilha|geladeira|torre-quente|nicho-geladeira)|fog[aã]o|cooktop|geladeira|\bpia\b/],
    ["lavanderia", /^ra-(tanque|cat-tanque|coz-lavadora)|tanque|lavadora|m[aá]quina\s*de\s*lavar/],
    ["cama", /^ra-mob-cama|\bcama\b/],
    ["closet", /^ra-mob-(closet|guarda-roupa)|guarda-roupa|closet/],
    ["sala", /^ra-mob-(sofa|rack-tv|mesa-jantar|mesa-centro)|sof[aá]|mesa\s*de\s*jantar/],
    ["jantar", /^ra-mob-mesa-jantar|mesa\s*de\s*jantar/],
    ["escritorio", /^ra-mob-escrivaninha|escrivaninha/],
    ["lazer", /^ra-lazer-(churrasqueira|mesa-gourmet)|churrasqueira/]
  ];
  function papelDe(f) {
    var t = sem(txt(f.famId) + " " + txt(f.tipoId) + " " + txt(f.nome)).toLowerCase(), out = {};
    PAPEIS.forEach(function (p) { if (p[1].test(t)) out[p[0]] = 1; });
    return out;
  }
  function ehPorta(f) { return /^ra-porta|\bporta\b/.test(sem(txt(f.famId) + " " + txt(f.tipoId)).toLowerCase()); }

  /* o nome pela regra (pistas = contagem por papel dentro da região) */
  function nomeDasPistas(pi, ctx) {
    if (pi.bacia || pi.chuveiro || (pi.lavatorio && !pi.cozinha)) return { base: pi.chuveiro ? "Banheiro" : "WC", papel: "banho", regra: "louças" + (pi.chuveiro ? " com chuveiro" : " sem chuveiro") };
    if (pi.cozinha) return { base: (pi.sala || pi.jantar) ? "Sala e cozinha" : "Cozinha", papel: "cozinha", regra: "bancada/geladeira/fogão" };
    if (pi.lavanderia) return { base: "Lavanderia", papel: "lavanderia", regra: "tanque/máquina" };
    if (pi.cama) return { base: "Quarto", papel: "quarto", regra: "cama" };
    if (pi.closet) return { base: "Closet", papel: "closet", regra: "guarda-roupa" };
    if (pi.sala || pi.jantar) return { base: "Sala", papel: "sala", regra: "sofá/rack/mesa" };
    if (pi.escritorio) return { base: "Escritório", papel: "escritorio", regra: "escrivaninha" };
    if (ctx && ctx.corredor) return { base: "Circulação", papel: "circulacao", regra: "estreita e longa ligando portas" };
    return null;
  }

  /* ------------------------------------------------------------- detectar */
  function niveisPlano(opts) {
    var ns = arr(opts && opts.niveis).filter(function (n) { return n && n.id != null && n.elevacao != null && n.elevacao !== "" && fin(Number(n.elevacao)); })
      .map(function (n) { return { id: String(n.id), nome: txt(n.nome) || String(n.id), elevacao: Number(n.elevacao) }; });
    if (opts && opts.nivelId != null && opts.nivelId !== "") ns = ns.filter(function (n) { return n.id === String(opts.nivelId); });
    return ns;
  }
  function chaveNivel(a) { return a && a.nivelId != null && a.nivelId !== "" ? String(a.nivelId) : ""; }

  /* o plano tem PISO? Há parede que NASCE nele (base a até 35 cm do plano) ou que sobe pelo menos 1,80 m acima dele. Sem isso, só o
     topo de empena/platibanda de um pavimento de baixo corta o plano (o nível "Cobertura") e as regiões não são cômodos. */
  function planoTemPiso(estado, yc) {
    var A = dep("BimArq", "./bimarq.js"), tem = false;
    arr(estado && estado.caixas).forEach(function (c) {
      if (tem || !c || c.tipo !== "parede" || c.delimitaAmbiente === false || !A) return;
      var f = A.frameDe(c); if (!f) return;
      var topo = f.y1; arr(c.topo).forEach(function (sg) { topo = Math.max(topo, num(sg.a, 0) + Math.abs(num(sg.b, 0)) * f.L); });
      if (!(f.y0 <= yc + 1e-4 && topo > yc + 1e-4)) return;
      if (Math.abs(f.y0 - yc) <= 0.35 || topo - yc >= 1.8) tem = true;
    });
    return tem;
  }

  /* as regiões de um plano, já com tipo, pistas e nome-base; `existentes` marca as que já têm ambiente */
  function regioesDoNivel(estado, nivel, P) {
    var M = AM(), R = M.regioes(estado, nivel.id, nivel.yc, false), cob = coberturas(estado, nivel.yc, P);
    var fams = arr(estado && estado.familias).filter(function (f) { return f && fin(num(f.x, NaN)) && fin(num(f.z, NaN)) && num(f.y, 0) > nivel.yc - 0.3 && num(f.y, 0) < nivel.yc + 2.5; });
    var paredes = {};
    arr(estado && estado.caixas).forEach(function (c) { if (c && c.tipo === "parede" && c.id != null) paredes[String(c.id)] = c; });
    var regs = [];
    R.regioes.forEach(function (g, i) {
      if (!(g.area >= P.areaMinima)) return;
      var soltas = fams.filter(function (f) { return !f.host && naRegiao([+f.x, +f.z], g); }).map(function (f) { return [+f.x, +f.z]; });
      var pt = pontoInterno(g, soltas); if (!pt) return;
      /* a volta: quanto é parede baixa, parede alta, separador (aberto, não conta) */
      var baixa = 0, total = 0;
      g.pts.forEach(function (a, k) {
        var b = g.pts[(k + 1) % g.pts.length], tg = g.tags[k] || {}, l = Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]));
        if (tg.tipo !== "parede") return;   /* separador e pilar: nem parede alta nem baixa */
        var c = paredes[String(tg.id)]; if (!c) return;
        total += l; if (num(c.altura, 9) < P.muroAlturaMax) baixa += l;
      });
      var pistas = {}, nPecas = 0;
      fams.forEach(function (f) {
        if (!naRegiao([+f.x, +f.z], g)) return;
        var p = papelDe(f); Object.keys(p).forEach(function (k) { pistas[k] = (pistas[k] || 0) + 1; }); nPecas++;
      });
      var coberta = cob.some(function (poly) { return dentro(pt.p, poly); });
      regs.push({ idx: i, nivelId: nivel.id, nivelNome: nivel.nome, yc: nivel.yc, g: g, area: g.area, ponto: { x: r6(pt.p[0]), z: r6(pt.p[1]) },
                  folga: pt.folga, baixaFrac: total > 0 ? baixa / total : 0, coberta: coberta, pistas: pistas, nPecas: nPecas, portas: [] });
    });
    /* as portas: quais regiões cada porta toca (a parede é espessa: o ponto da porta fica a meia espessura da face) */
    fams.filter(ehPorta).forEach(function (f) {
      var par = f.host && paredes[String(f.host.id)], tol = (par ? num(par.espessura, 0.15) / 2 : 0.1) + 0.12, p = [+f.x, +f.z];
      regs.forEach(function (r) { if (distContorno(p, r.g.pts) <= tol) r.portas.push(String(f.id)); });
    });
    regs.temPorta = fams.some(ehPorta);
    return regs;
  }

  /* classificação: externa (coberta/descoberta), corredor e nome-base */
  /* o modelo tem teto? (no projeto todo: o terraço de cobertura é descoberto porque a casa de baixo tem laje) */
  function modeloTemTeto(regs, P) {
    var areaTot = 0, areaCob = 0;
    regs.forEach(function (r) { if (r.baixaFrac >= P.muroFracao) return; areaTot += r.area; if (r.coberta) areaCob += r.area; });
    return areaTot > 0 && areaCob / areaTot >= 0.4;
  }
  function classificar(regs, P, casaTemTeto) {
    regs.forEach(function (r) {
      /* a céu aberto só conta sem pista de cômodo (louça, cama, bancada…): um quarto sem laje modelada não vira "área externa" */
      r.externo = r.baixaFrac >= P.muroFracao || (casaTemTeto && !r.coberta && !Object.keys(r.pistas).length);
      r.cobertura = r.coberta ? "coberta" : "descoberta";
      var larg = 2 * r.folga, comp = larg > 0 ? r.area / larg : 0;
      r.larg = larg; r.comp = comp;
      r.corredor = !r.externo && larg <= P.corredorLargMax && comp >= P.corredorAlongamento * larg && comp >= P.corredorCompMin && (!regs.temPorta || r.portas.length >= 2);
      if (r.externo) {
        var lz = r.pistas.lazer ? "Área gourmet" : (r.coberta ? "Área externa coberta" : "Área externa descoberta");
        r.sugestao = { base: lz, papel: "externa", regra: r.baixaFrac >= P.muroFracao ? "cercada por parede baixa" : "a céu aberto" };
      } else r.sugestao = nomeDasPistas(r.pistas, r);
    });
    /* Suíte: o quarto cuja porta é a ÚNICA do banheiro */
    if (regs.temPorta) regs.forEach(function (q) {
      if (!q.sugestao || q.sugestao.papel !== "quarto") return;
      var suite = regs.some(function (b) {
        return b !== q && b.sugestao && b.sugestao.papel === "banho" && b.sugestao.base === "Banheiro" && b.portas.length === 1 && q.portas.indexOf(b.portas[0]) >= 0;
      });
      if (suite) { q.sugestao = { base: "Suíte", papel: "quarto", regra: "cama + banheiro que abre só nele" }; }
    });
    return regs;
  }

  /* o ambiente que já existe na região: o ponto dele cai nela (o menor cabe primeiro) */
  function jaTem(estado, regs, nivelId, yc) {
    arr(estado && estado.ambientes).forEach(function (a) {
      if (!a || !a.ponto) return;
      var mesmo = chaveNivel(a) === nivelId || (chaveNivel(a) === "" && Math.abs(num(a.deslocBase, 0) - yc) < 1e-6);   /* ambiente antigo, sem nível, no mesmo piso */
      if (!mesmo) return;
      var p = [num(a.ponto.x, NaN), num(a.ponto.z, NaN)]; if (!fin(p[0]) || !fin(p[1])) return;
      var h = null;
      regs.forEach(function (r) { if (naRegiao(p, r.g) && (!h || r.area < h.area)) h = r; });
      if (h) { h.existente = a.id; }
    });
  }

  function detectar(estado, opts) {
    opts = opts || {}; var P = {}; Object.keys(PADRAO).forEach(function (k) { P[k] = opts[k] != null ? opts[k] : PADRAO[k]; });
    var M = AM(); if (!M || !M.regioes) return { ok: false, motivo: "O motor do ambiente não carregou.", regioes: [] };
    /* separador de projeto antigo (sem nível) vale no piso zero: ali o plano usa a chave "" (a mesma do ambiente antigo) */
    var sepLegado = arr(estado && estado.separadores).some(function (sp) { return sp && (sp.nivelId == null || sp.nivelId === ""); });
    var planos = niveisPlano(opts).map(function (n) { return { id: sepLegado && Math.abs(n.elevacao) < 1e-6 ? "" : n.id, nome: n.nome, yc: n.elevacao }; });
    if (!planos.length && !arr(opts.niveis).length) planos = [{ id: "", nome: "", yc: num(opts.base, 0) }];
    var todas = [];
    var semPiso = [], porPlano = [];
    planos = planos.filter(function (n) { if (planoTemPiso(estado, n.yc)) return true; semPiso.push(n.nome || n.id); return false; });
    planos.forEach(function (n) { var regs = regioesDoNivel(estado, n, P); porPlano.push({ n: n, regs: regs }); regs.forEach(function (r) { todas.push(r); }); });
    var teto = modeloTemTeto(todas, P);
    todas.length = 0;
    porPlano.forEach(function (pp) { classificar(pp.regs, P, teto); jaTem(estado, pp.regs, pp.n.id, pp.n.yc); pp.regs.forEach(function (r) { todas.push(r); }); });
    return { ok: true, regioes: todas, planos: planos, semPiso: semPiso, P: P };
  }

  /* ------------------------------------------------------------- nomes únicos */
  function raizNome(s) { return sem(s).toLowerCase().replace(/\s+\d+$/, "").trim(); }
  function distribuirNomes(estado, novas) {
    var usados = {};   /* raiz → maior sufixo já usado */
    arr(estado && estado.ambientes).forEach(function (a) {
      var n = txt(a && a.nome).trim(); if (!n) return;
      var m = /^(.*?)(?:\s+(\d+))?$/.exec(n), k = raizNome(n), suf = m && m[2] ? +m[2] : 1;
      usados[k] = Math.max(usados[k] || 0, suf);
    });
    var cont = {}; novas.forEach(function (r) { var b = r.sugestao ? r.sugestao.base : null; if (b) cont[raizNome(b)] = (cont[raizNome(b)] || 0) + 1; });
    var sufixo = {}, semNome = 0;
    arr(estado && estado.ambientes).forEach(function (a) { var m = /^Ambiente\s+(\d+)$/i.exec(txt(a && a.nome).trim()); if (m) semNome = Math.max(semNome, +m[1]); });
    /* a ordem de leitura: de cima para baixo, da esquerda para a direita (determinística) */
    novas.slice().sort(function (a, b) { return (a.nivelId < b.nivelId ? -1 : a.nivelId > b.nivelId ? 1 : 0) || (a.ponto.z - b.ponto.z) || (a.ponto.x - b.ponto.x); }).forEach(function (r) {
      if (!r.sugestao) { semNome++; r.nome = "Ambiente " + semNome; r.pista = "sem pista"; return; }
      var k = raizNome(r.sugestao.base), ja = usados[k] || 0;
      if (!ja && cont[k] === 1) { r.nome = r.sugestao.base; usados[k] = 1; }
      else { var s = Math.max(sufixo[k] || 0, ja) + 1; sufixo[k] = s; r.nome = r.sugestao.base + " " + s; usados[k] = s; }
      r.pista = r.sugestao.regra;
    });
  }

  /* ------------------------------------------------------------- gerar (as ops) */
  /* → { ok, ops:[{op:"ambiente",…}], resumo, regioes } — não grava nada; a tela aplica as ops num lote */
  function gerar(estado, opts) {
    opts = opts || {};
    var M = AM(), D = detectar(estado, opts); if (!D.ok) return D;
    var novas = D.regioes.filter(function (r) { return !r.existente; });
    var res = { detectadas: D.regioes.length, jaTinham: D.regioes.length - novas.length, novas: 0, descartadas: 0, externas: 0, circulacao: 0, porNome: {}, nomes: [] };
    if (!novas.length) return { ok: true, ops: [], resumo: res, regioes: D.regioes, avisos: [] };
    distribuirNomes(estado, novas);
    /* ids sem colidir (o estado vai ganhando os novos) */
    var tmp = {}; Object.keys(estado || {}).forEach(function (k) { tmp[k] = estado[k]; }); tmp.ambientes = arr(estado && estado.ambientes).slice();
    var ops = [], cand = [];
    novas.forEach(function (r) {
      var campos = { nome: r.nome };
      if (r.externo) { campos.departamento = D.P.deptoExterno; campos.ocupacao = r.cobertura; }
      if (!r.nivelId && Math.abs(r.yc) > 1e-9 && Math.abs(r.yc) <= 100) campos.deslocBase = r6(r.yc);
      var o = M.opAmbiente(tmp, r.ponto, r.nivelId, campos);
      if (!o.ok) { res.descartadas++; return; }
      tmp.ambientes.push({ id: o.op.id }); cand.push({ r: r, op: o.op });
    });
    /* conferência: o calcular com os novos — fica o que for região própria (delimitado) */
    var niveisObra = arr(opts.niveis).map(function (n) { return { id: n.id, nome: n.nome, elevacao: n.elevacao }; });
    var st = { caixas: estado.caixas, separadores: estado.separadores, ambienteRegra: estado.ambienteRegra,
               ambientes: arr(estado.ambientes).map(function (a) { var o = { id: a.id, ponto: a.ponto }; ["nivelId", "deslocBase", "deslocLimite", "limiteSuperior", "numero"].forEach(function (k) { if (a[k] != null) o[k] = a[k]; }); return o; })
                 .concat(cand.map(function (c) { var o = { id: c.op.id, ponto: c.op.ponto }; if (c.op.nivelId != null) o.nivelId = c.op.nivelId; if (c.op.deslocBase != null) o.deslocBase = c.op.deslocBase; return o; })) };
    var cc = M.calcular(st, { niveis: niveisObra }).porId, avisos = [];
    cand.forEach(function (c) {
      var k = cc[c.op.id];
      if (!k || k.estado !== "delimitado") { res.descartadas++; avisos.push("Região em (" + c.op.ponto.x + "; " + c.op.ponto.z + ") não virou ambiente: " + (k ? k.estado : "sem cálculo") + "."); return; }
      ops.push(c.op); res.novas++;
      if (c.r.externo) res.externas++;
      if (c.r.sugestao && c.r.sugestao.papel === "circulacao") res.circulacao++;
      res.porNome[c.r.nome] = (res.porNome[c.r.nome] || 0) + 1;
      res.nomes.push({ id: c.op.id, nome: c.r.nome, area: k.areaFace, pista: c.r.pista, externo: !!c.r.externo, nivelId: c.r.nivelId });
    });
    return { ok: true, ops: ops, resumo: res, regioes: D.regioes, avisos: avisos };
  }

  var BimAmbAuto = { PADRAO: PADRAO, detectar: detectar, gerar: gerar, papelDe: papelDe, pontoInterno: pontoInterno };
  global.BimAmbAuto = BimAmbAuto;
  if (typeof module !== "undefined" && module.exports) module.exports = BimAmbAuto;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
