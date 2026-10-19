/* =====================================================================
 * hidpiscina.js — PISCINA: RECONHECER e DIMENSIONAR (motor PURO, ES5, Node-testável). Frente PISCINA, 18/10/2026.
 *
 * Pedido do Rogério: "O volume da piscina está definido no projeto arquitetônico, na planta baixa. O sistema vai ser capaz
 * de identificar se essa piscina vai ser com hidromassagem: a gente coloca a quantidade e ele já distribui em torno da
 * piscina… gerar todo o projeto parametrizado, já lançado com bomba, vácuo, tudo o que precisa."
 *
 *   HidPiscina.reconhecer(estado, opcoes)  → { piscinas: [geo…], candidatos: [geo…], avisos }
 *       de onde vem a piscina, nesta ordem: a op hidPiscina (confirmada pelo usuário; a geometria pode apontar para um
 *       volume do modelo, que manda — o arquiteto muda a piscina e o projeto acompanha); um VOLUME do modelo chamado
 *       "piscina" (extrusão para baixo = o tanque); a FERRAMENTA de uma subtração (o volume escavado); uma caixa/laje
 *       chamada "piscina"; um elemento de IFC com "piscina/pool" no nome (caixa envolvente — avisado). Sem nada disso, o
 *       usuário desenha o contorno e informa as profundidades (a op hidPiscina com contorno).
 *   HidPiscina.geometria(p)                → contorno anti-horário, lados (normal para fora), área, perímetro, eixo
 *       principal, profundidade em cada ponto (fundo plano inclinado da rasa para a funda), volume e profundidade média.
 *   HidPiscina.dimensionar(geo, params)    → vazão de recirculação, filtro, motobomba na curva (com NPSH), dispositivos
 *       (retornos, coadeiras, ralos de fundo, aspirações), linhas (DN pela velocidade), hidromassagem, aquecimento, dreno,
 *       casa de máquinas — cada número com a fonte (HidNormas: pisc.*), as decisões declaradas e as pendências.
 *   HidPiscina.linhaDn(sistema, Q, conjunto) / HidPiscina.perdaLinha(…) / HidPiscina.pontoOperacao(curva, Hest, K)
 *       (o js/hidpiscinarede.js usa para conferir a sucção e o recalque depois que os tubos estão traçados).
 *
 * ⚠ NENHUM número de norma ou de manual aqui (tools/test-hid-sem-numero-magico.js): a NBR 10339 e as regras de
 *   fabricante vêm de dados-fonte/hidro/normas/piscina.json pelo HidNormas; os equipamentos (filtro, bomba com curva,
 *   dispositivos) de dados-fonte/hidro/catalogos/piscina-*.json pelo js/hidpiscinadados.js (GERADO). Faltou → pendência
 *   com a chave, e a verificação sai "pendente" (nunca "atende").
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function NN() { return dep("HidNormas", "./hidnormas.js"); }
  function HH() { return dep("HidHidraulica", "./hidhidraulica.js"); }
  function DADOS() { return dep("HidPiscinaDados", "./hidpiscinadados.js") || { itens: [], regras: [], catalogos: [] }; }
  function BI() { return dep("BimInst", "./biminst.js"); }
  function BV() { return dep("BimVolume", "./bimvolume.js"); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { if (v === null || v === undefined || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function txt(v) { return v == null ? "" : String(v); }
  function copia(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  var CASAS = 10000;   // hid:ok 4 casas (0,1 mm) como o biminst
  function r4(v) { return Math.round(v * CASAS) / CASAS; }
  function rN(v, c) { var m = Math.pow(10, c); return Math.round(v * m) / m; }   // hid:ok arredondamento em base 10
  function f2(v) { return v == null || !isFinite(v) ? "—" : (Math.round(v * 100) / 100).toFixed(2).replace(".", ","); }
  function f1(v) { return v == null || !isFinite(v) ? "—" : (Math.round(v * 10) / 10).toFixed(1).replace(".", ","); }   // hid:ok uma casa
  var EPS = 1e-9;   // hid:ok tolerância numérica
  var M3H = 3600;   /* m³/h ↔ m³/s (lista branca: 3600) */

  /* ⚠ CRITÉRIOS DE PROJETO DO OrçaPRO (não são norma nem manual) — declarados no memorial e trocáveis em params.geo:
     só o que a NBR 10339 e o fabricante deixam ao projetista. */
  var GEO = {
    bordaLivre: 0.15,        // hid:ok nível da água abaixo do topo da borda quando o modelo não diz (a norma limita a 0,20 m: pisc.tanque)
    tempAguaSemAquec: 25,    // hid:ok °C da água para a viscosidade quando não há aquecimento (só muda a perda de carga na 3ª casa)
    folgaTaxaFiltro: 1,      // hid:ok a vazão de operação pode ir até a taxa máxima × este fator (1 = exatamente a da norma)
    fracaoSuperficie: 0.5,   // hid:ok fração da vazão pela superfície (coadeiras) na operação normal; o resto pelo fundo
    ramoDrenoTotal: 1,       // hid:ok cada ramo de ralo de fundo dimensionado para a vazão TOTAL do fundo (um ralo obstruído)
    margemAmt: 0             // hid:ok margem sobre a altura manométrica (0 = nenhuma; o fabricante e o RT definem)
  };
  function geo(par, k) { var g = par && par.geo; return g && g[k] != null && isFinite(Number(g[k])) ? Number(g[k]) : GEO[k]; }

  /* ================================================ GEOMETRIA DO TANQUE */
  function area2(P) { var s = 0; for (var i = 0; i < P.length; i++) { var a = P[i], b = P[(i + 1) % P.length]; s += a.x * b.z - b.x * a.z; } return s / 2; }
  function d2(a, b) { var dx = a.x - b.x, dz = a.z - b.z; return Math.sqrt(dx * dx + dz * dz); }
  function limpar(P) {
    var out = [];
    arr(P).forEach(function (p) { var q = { x: r4(num(p.x, 0)), z: r4(num(p.z, 0)) }, u = out[out.length - 1]; if (!u || d2(u, q) > EPS) out.push(q); });
    if (out.length > 2 && d2(out[0], out[out.length - 1]) <= EPS) out.pop();
    return out;
  }
  function centroide(P) {
    var A = area2(P), cx = 0, cz = 0;
    if (Math.abs(A) < EPS) { P.forEach(function (p) { cx += p.x; cz += p.z; }); return { x: cx / P.length, z: cz / P.length }; }
    for (var i = 0; i < P.length; i++) { var a = P[i], b = P[(i + 1) % P.length], k = a.x * b.z - b.x * a.z; cx += (a.x + b.x) * k; cz += (a.z + b.z) * k; }
    var seis = 6;   // hid:ok fórmula do centroide de polígono: Σ(...)/(6A)
    return { x: cx / (seis * A), z: cz / (seis * A) };
  }
  /* eixo principal = direção do lado que dá o retângulo envolvente de MENOR área (retângulo girado mínimo) */
  function eixoPrincipal(P) {
    var melhor = null;
    for (var i = 0; i < P.length; i++) {
      var a = P[i], b = P[(i + 1) % P.length], L = d2(a, b); if (L < EPS) continue;
      var u = { x: (b.x - a.x) / L, z: (b.z - a.z) / L }, v = { x: -u.z, z: u.x }, s0 = Infinity, s1 = -Infinity, t0 = Infinity, t1 = -Infinity;
      P.forEach(function (p) { var s = p.x * u.x + p.z * u.z, t = p.x * v.x + p.z * v.z; if (s < s0) s0 = s; if (s > s1) s1 = s; if (t < t0) t0 = t; if (t > t1) t1 = t; });
      var ar = (s1 - s0) * (t1 - t0);
      if (!melhor || ar < melhor.ar - EPS) melhor = { ar: ar, u: u, v: v, s0: s0, s1: s1, t0: t0, t1: t1 };
    }
    if (!melhor) return null;
    /* o eixo PRINCIPAL é o comprido: se a outra direção é mais longa, troca */
    if (melhor.t1 - melhor.t0 > melhor.s1 - melhor.s0 + EPS) melhor = { ar: melhor.ar, u: melhor.v, v: { x: -melhor.v.z, z: melhor.v.x }, s0: melhor.t0, s1: melhor.t1, t0: -melhor.s1, t1: -melhor.s0 };
    return { u: melhor.u, v: melhor.v, s0: melhor.s0, s1: melhor.s1, t0: melhor.t0, t1: melhor.t1, comprimento: melhor.s1 - melhor.s0, largura: melhor.t1 - melhor.t0 };
  }
  /* a geometria completa a partir de { contorno, yBorda, bordaLivre, profRasa, profFunda, fundoInvertido } */
  function geometria(p) {
    p = p || {};
    var P = limpar(p.contorno), out = { ok: false, erros: [] };
    if (P.length < 3) { out.erros.push("contorno com menos de 3 pontos"); return out; }   // hid:ok polígono mínimo (triângulo)
    if (area2(P) < 0) P.reverse();   /* anti-horário em (x, z): a normal para FORA de cada lado é (dz, −dx) */
    var A = area2(P); if (!(A > EPS)) { out.erros.push("contorno sem área"); return out; }
    var E = eixoPrincipal(P), lados = [], per = 0;
    for (var i = 0; i < P.length; i++) {
      var a = P[i], b = P[(i + 1) % P.length], L = d2(a, b); if (L < EPS) continue;
      var dir = { x: (b.x - a.x) / L, z: (b.z - a.z) / L };
      lados.push({ i: lados.length, a: a, b: b, L: r4(L), dir: dir, n: { x: dir.z, z: -dir.x }, meio: { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 } });
      per += L;
    }
    var yB = num(p.yBorda, null), bl = num(p.bordaLivre, null);
    var rasa = num(p.profRasa, null), funda = num(p.profFunda, null);
    if (rasa == null && funda != null) rasa = funda;
    if (funda == null && rasa != null) funda = rasa;
    if (yB == null) out.erros.push("sem a cota da borda (topo do tanque)");
    if (rasa == null || !(rasa > 0)) out.erros.push("sem a profundidade da água (rasa/funda)");
    var C = centroide(P), inv = !!p.fundoInvertido;
    /* profundidade da ÁGUA num ponto: plano inclinado ao longo do eixo principal, da rasa (s0) para a funda (s1) */
    function prof(q) {
      if (rasa == null) return null;
      var s = q.x * E.u.x + q.z * E.u.z, t = E.comprimento > EPS ? (s - E.s0) / E.comprimento : 0;
      if (inv) t = 1 - t;
      t = Math.max(0, Math.min(1, t));
      return rasa + (funda - rasa) * t;
    }
    var pMedia = prof(C);   /* fundo plano inclinado: ∫prof dA = A × prof(centroide) — exato */
    out.ok = !out.erros.length;
    out.contorno = P; out.lados = lados; out.area = r4(A); out.perimetro = r4(per); out.centroide = { x: r4(C.x), z: r4(C.z) }; out.eixo = E;
    out.yBorda = yB; out.bordaLivre = bl; out.profRasa = rasa; out.profFunda = funda; out.fundoInvertido = inv;
    out.yAgua = yB != null ? r4(yB - (bl != null ? bl : GEO.bordaLivre)) : null;
    out.bordaLivreAdotada = bl == null;
    out.profMedia = pMedia != null ? r4(pMedia) : null;
    out.volume = pMedia != null ? r4(A * pMedia) : null;
    out.prof = prof;
    /* o ponto mais fundo (o meio da ponta funda) e o raso */
    var sF = inv ? E.s0 : E.s1, sR = inv ? E.s1 : E.s0, tm = (E.t0 + E.t1) / 2;
    out.pontoFundo = { x: r4(sF * E.u.x + tm * E.v.x), z: r4(sF * E.u.z + tm * E.v.z) };
    out.pontoRaso = { x: r4(sR * E.u.x + tm * E.v.x), z: r4(sR * E.u.z + tm * E.v.z) };
    return out;
  }
  function dentro(P, q) {
    var c = false;
    for (var i = 0, j = P.length - 1; i < P.length; j = i++) {
      var a = P[i], b = P[j];
      if ((a.z > q.z) !== (b.z > q.z) && q.x < (b.x - a.x) * (q.z - a.z) / (b.z - a.z) + a.x) c = !c;
    }
    return c;
  }

  /* ================================================ RECONHECER */
  var NOME_PISCINA = /piscin|pool|spa\b|ofur/i;
  function prismaHorizontal(receita) {
    var V = BV(); if (!V || !V.prismaDe) return null;
    var pr = null; try { pr = V.prismaDe(receita); } catch (e) { pr = null; }
    if (!pr || !pr.plano || !pr.plano.n) return null;
    var n = pr.plano.n; if (Math.abs(Math.abs(n[1]) - 1) > 1e-6) return null;   // hid:ok plano horizontal (normal vertical)
    var pts = pr.contorno.map(function (ab) { var q = V.doPlano(pr.plano, ab); return { x: q[0], z: q[2] }; });
    var y0 = pr.plano.o[1], y1 = y0 + n[1] * pr.altura;
    return { contorno: pts, yTopo: Math.max(y0, y1), yFundo: Math.min(y0, y1) };
  }
  function deCaixa(c) {
    var cs = Math.cos(num(c.rotY, 0)), sn = Math.sin(num(c.rotY, 0)), h = num(c.comprimento, 0) / 2, w = num(c.espessura, 0) / 2;
    if (!(h > 0) || !(w > 0)) return null;
    var pts = [[-h, -w], [h, -w], [h, w], [-h, w]].map(function (q) { return { x: c.cx + q[0] * cs + q[1] * sn, z: c.cz - q[0] * sn + q[1] * cs }; });
    return { contorno: pts, yTopo: c.cy + num(c.altura, 0) / 2, yFundo: c.cy - num(c.altura, 0) / 2 };
  }
  function candidatosDoModelo(estado, opcoes) {
    var out = [];
    arr(estado && estado.volumes).forEach(function (v) {
      var nomeOk = NOME_PISCINA.test(txt(v.nome)) || NOME_PISCINA.test(txt(v.material));
      if (nomeOk) { var pr = prismaHorizontal(v.receita); if (pr) out.push({ origem: "volume", ref: { tipo: "volume", id: v.id }, nome: v.nome || "Piscina", prisma: pr, confianca: "alta", motivo: "volume \"" + (v.nome || v.id) + "\" (extrusão horizontal)" }); }
      /* o volume ESCAVADO: a ferramenta de uma subtração (receita bool) */
      var r = v.receita;
      if (r && r.forma === "bool" && r.tipo === "subtracao") {
        var pb = prismaHorizontal(r.b);
        if (pb) out.push({ origem: "subtracao", ref: { tipo: "volume", id: v.id }, nome: (v.nome || "Volume") + " (recorte)", prisma: pb, confianca: nomeOk ? "alta" : "media", motivo: "recorte (subtração) em \"" + (v.nome || v.id) + "\" — confirme se é a piscina", subtracao: true });
      }
    });
    arr(estado && estado.caixas).forEach(function (c) {
      if (!c || !NOME_PISCINA.test(txt(c.nome) + " " + txt(c.descricao) + " " + txt(c.tipoNome))) return;
      var pr = deCaixa(c); if (pr) out.push({ origem: "caixa", ref: { tipo: "caixa", id: c.id }, nome: c.nome || "Piscina", prisma: pr, confianca: "alta", motivo: c.tipo + " \"" + (c.nome || c.id) + "\"" });
    });
    /* IFC importado: a tela passa { uid, nome, min:[x,y,z], max:[x,y,z] } dos elementos com nome de piscina */
    arr(opcoes && opcoes.elementosIfc).forEach(function (e) {
      if (!e || !NOME_PISCINA.test(txt(e.nome)) || !Array.isArray(e.min) || !Array.isArray(e.max)) return;
      var x0 = num(e.min[0], 0), x1 = num(e.max[0], 0), z0 = num(e.min[2], 0), z1 = num(e.max[2], 0);
      if (!(x1 - x0 > EPS) || !(z1 - z0 > EPS)) return;
      out.push({ origem: "ifc", ref: { tipo: "ifc", id: e.uid }, nome: e.nome, prisma: { contorno: [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }], yTopo: num(e.max[1], 0), yFundo: num(e.min[1], 0) },
                confianca: "media", motivo: "elemento IFC \"" + e.nome + "\" — contorno pela CAIXA ENVOLVENTE (forma curva/irregular: desenhe o contorno)" });
    });
    return out;
  }
  /* geometria de uma op hidPiscina: a referência ao modelo manda (o arquiteto muda, o projeto acompanha) */
  function daOp(op, estado, opcoes) {
    var base = { contorno: op.contorno, yBorda: op.yBorda, bordaLivre: op.bordaLivre, profRasa: op.profRasa, profFunda: op.profFunda, fundoInvertido: !!(op.params && op.params.fundoInvertido) }, origem = "desenhado";
    if (op.ref) {
      var cand = candidatosDoModelo(estado, opcoes).filter(function (c) { return c.ref.tipo === op.ref.tipo && String(c.ref.id) === String(op.ref.id); })[0];
      if (cand) {
        origem = cand.origem;
        base.contorno = cand.prisma.contorno;
        if (base.yBorda == null) base.yBorda = r4(cand.prisma.yTopo);
        var alt = cand.prisma.yTopo - cand.prisma.yFundo, bl = base.bordaLivre != null ? base.bordaLivre : GEO.bordaLivre;
        if (base.profRasa == null) base.profRasa = r4(alt - bl);
        if (base.profFunda == null) base.profFunda = r4(alt - bl);
      } else if (!base.contorno) return { ok: false, erros: ["a piscina aponta para " + op.ref.tipo + " " + op.ref.id + ", que não está mais no modelo"], id: op.id };
    }
    var g = geometria(base);
    g.id = op.id; g.nome = op.nome || "Piscina"; g.origem = origem; g.ref = op.ref || null; g.params = copia(op.params || {}); g.cm = op.cm ? copia(op.cm) : null;
    return g;
  }
  function reconhecer(estado, opcoes) {
    var ps = arr(estado && estado.hidPiscinas).map(function (op) { return daOp(op, estado, opcoes); });
    var usados = {}; arr(estado && estado.hidPiscinas).forEach(function (op) { if (op.ref) usados[op.ref.tipo + ":" + op.ref.id] = 1; });
    var cands = candidatosDoModelo(estado, opcoes).filter(function (c) { return !usados[c.ref.tipo + ":" + c.ref.id]; }).map(function (c) {
      var alt = c.prisma.yTopo - c.prisma.yFundo, g = geometria({ contorno: c.prisma.contorno, yBorda: c.prisma.yTopo, profRasa: alt - GEO.bordaLivre, profFunda: alt - GEO.bordaLivre });
      g.origem = c.origem; g.ref = c.ref; g.nome = c.nome; g.confianca = c.confianca; g.motivo = c.motivo; g.alturaTanque = r4(alt);
      return g;
    });
    return { piscinas: ps, candidatos: cands };
  }

  /* ================================================ NORMAS / CATÁLOGO */
  function linhasCtx(ctx, chave, usadoEm) { var l = ctx.linhas(chave, null, usadoEm); return l || null; }
  function param(ctx, chave, nome, usadoEm) {
    var l = linhasCtx(ctx, chave, usadoEm); if (!l) return null;
    var r = l.filter(function (x) { return x.parametro === nome; })[0];
    if (!r || r.valor == null || !isFinite(Number(r.valor))) { ctx.pendencia(chave + "." + nome, "sem o valor \"" + nome + "\" em " + chave, usadoEm); return null; }
    return Number(r.valor);
  }
  /* a fonte de uma tabela: NORMA:edição, página, seção/tabela. A tabela de FABRICANTE (secundária) cita o documento dele — antes saía
     "ABNT NBR 10339:2018" porque a tabela pisc.fab.* mora no arquivo da norma */
  function fonteTxt(chave) { var N = NN(), f = N && N.fonte(chave); if (!f) return chave; var sec = f.tipo === "secundaria"; return (!sec && f.norma ? f.norma + (f.edicao ? ":" + f.edicao : "") : (f.doc || f.norma)) + (f.pagina ? ", " + f.pagina : "") + (f.tabela ? ", " + f.tabela : "") + (sec ? " (fonte secundária)" : ""); }
  function catalogo(tipo) { return arr(DADOS().itens).filter(function (i) { return !tipo || i.tipo === tipo; }); }
  function fonteItem(it) { return it ? (it.documento || it.fabricante) + ", " + it.pagina : ""; }
  function regraFab(ctx, chave, usadoEm) {   /* tabela pisc.fab.* (secundária) — linha única { valor, … } */
    var l = linhasCtx(ctx, chave, usadoEm); if (!l || !l.length) return null;
    return l[0];
  }

  /* ================================================ HIDRÁULICA (DN, perdas, curva) */
  function diDe(ctx, dn, usadoEm) {
    var l = linhasCtx(ctx, "materiais.diametro_interno", usadoEm); if (!l) return null;
    var r = l.filter(function (x) { return x.material === "pvc_soldavel" && Number(x.dn) === Number(dn); })[0];
    return r ? Number(r.di_mm) / 1000 : null;
  }
  function dnsPvc() { var B = BI(); return B && B.MATERIAIS && B.MATERIAIS.pvc_soldavel ? B.MATERIAIS.pvc_soldavel.dns.slice() : []; }
  /* o MENOR DN de PVC soldável com v ≤ v_max (conjunto "succao" | "recalque") para Q (m³/h) */
  function linhaDn(ctx, Q, conjunto, usadoEm, dnMin) {
    var vt = linhasCtx(ctx, "pisc.velocidade_maxima", usadoEm), vmax = null;
    if (vt) { var r = vt.filter(function (x) { return x.conjunto === conjunto; })[0]; vmax = r ? Number(r.v_max_m_s) : null; }
    var out = { conjunto: conjunto, Q: Q, vmax: vmax, dn: null, di: null, v: null, ok: null };
    if (vmax == null || !(Q > 0)) { out.ok = null; return out; }
    var dns = dnsPvc();
    for (var i = 0; i < dns.length; i++) {
      if (dnMin != null && dns[i] < dnMin) continue;
      var di = diDe(ctx, dns[i], usadoEm); if (!di) continue;
      var v = (Q / M3H) / (Math.PI * di * di / 4);   // hid:ok área do círculo πD²/4
      if (v <= vmax + EPS) { out.dn = dns[i]; out.di = di; out.v = r4(v); out.ok = true; return out; }
    }
    out.ok = false; return out;
  }
  /* bitola de rosca da conexão do produto ("1 1/2") → DE do PVC soldável (ABNT NBR 5648: a tabela BITOLA_REF do BimInst, invertida) */
  function deConexao(pol) {
    /* o catálogo às vezes traz a bitola em número (1,5 = 1 1/2"): é a mesma notação em polegada, não valor de norma */
    var NUM_POL = { "0.5": "1/2", "0.75": "3/4", "1": "1", "1.25": "1 1/4", "1.5": "1 1/2", "2": "2", "2.5": "2 1/2", "3": "3", "4": "4" };
    if (typeof pol === "number") pol = NUM_POL[String(pol)] || String(pol);
    var B = BI(), br = B && B.BITOLA_REF && B.BITOLA_REF.pvc_soldavel, k = String(pol == null ? "" : pol).replace(/["”]/g, "").trim(), out = null;
    if (br) Object.keys(br).forEach(function (de) { if (br[de] === k) out = Number(de); });
    return out;
  }
  function velocidade(Q, di) { return (Q / M3H) / (Math.PI * di * di / 4); }   // hid:ok área do círculo πD²/4
  /* DE do PVC soldável → DN nominal da tabela de comprimentos equivalentes (NBR 5648: dn × de) */
  function dnNominal(ctx, de, usadoEm) {
    var l = linhasCtx(ctx, "tubo.nbr5648.dimensoes", usadoEm); if (!l) return null;
    var r = l.filter(function (x) { return Number(x.de) === Number(de); })[0];
    return r ? Number(r.dn) : null;
  }
  function leq(ctx, de, pecas, usadoEm) {   /* pecas: { joelho_90: n, te90_passagem_direta: n, … } → m */
    var dnN = dnNominal(ctx, de, usadoEm), l = linhasCtx(ctx, "af.comprimento_equivalente_conexoes", usadoEm); if (!l || dnN == null) return null;
    var r = l.filter(function (x) { return Number(x.dn_mm) === dnN; })[0]; if (!r) return null;
    var s = 0, falta = [];
    Object.keys(pecas || {}).forEach(function (k) { var n = num(pecas[k], 0); if (!n) return; if (r[k] == null) falta.push(k); else s += n * Number(r[k]); });
    if (falta.length) ctx.pendencia("af.comprimento_equivalente_conexoes", "sem comprimento equivalente de " + falta.join(", ") + " para DN " + dnN, usadoEm);
    return s;
  }
  function rugosidade(ctx, usadoEm) {
    var l = linhasCtx(ctx, "materiais.rugosidade", usadoEm); if (!l) return null;
    var r = l.filter(function (x) { return x.material === "pvc_soldavel"; })[0];
    return r ? Number(r.epsilon_mm) / 1000 : null;
  }
  /* perda de carga de uma linha (Darcy-Weisbach) — trecho reto + comprimentos equivalentes */
  function perdaLinha(ctx, Q, de, L, pecas, T, usadoEm) {
    var H = HH(), di = diDe(ctx, de, usadoEm), eps = rugosidade(ctx, usadoEm), Le = leq(ctx, de, pecas, usadoEm);
    if (!H || !di || eps == null) return { ok: false, motivo: "sem DI/rugosidade do PVC soldável DN " + de };
    var ag = H.agua(num(T, GEO.tempAguaSemAquec)), Lt = num(L, 0) + num(Le, 0);
    var r = H.darcy(Q / M3H, di, Lt, eps, ag.nu);
    return { ok: true, hf: r4(r.hf), J: r.J, v: r4(velocidade(Q, di)), L: r4(num(L, 0)), Leq: r4(num(Le, 0)), di: di, re: r.Re, f: r.f };
  }
  /* curva da bomba: pontos [{q_m3h, h_mca}] → H(Q) por interpolação linear (fora da faixa: null) */
  function hDaCurva(curva, Q) {
    var c = arr(curva).filter(function (p) { return isFinite(num(p.q_m3h, NaN)) && isFinite(num(p.h_mca, NaN)); }).sort(function (a, b) { return a.q_m3h - b.q_m3h; });
    if (c.length < 2) return null;
    if (Q < c[0].q_m3h - EPS || Q > c[c.length - 1].q_m3h + EPS) return null;
    for (var i = 1; i < c.length; i++) if (Q <= c[i].q_m3h + EPS) { var a = c[i - 1], b = c[i], t = (Q - a.q_m3h) / ((b.q_m3h - a.q_m3h) || 1); return a.h_mca + (b.h_mca - a.h_mca) * t; }
    return null;
  }
  /* ponto de operação: H_bomba(Q) = Hest + K·Q² (curva do sistema quadrática pelo ponto de projeto) — bisseção na faixa da curva */
  function pontoOperacao(curva, Hest, K) {
    var c = arr(curva).filter(function (p) { return isFinite(num(p.q_m3h, NaN)); }).sort(function (a, b) { return a.q_m3h - b.q_m3h; });
    if (c.length < 2) return null;
    function g(Q) { var h = hDaCurva(c, Q); return h == null ? null : h - (Hest + K * Q * Q); }
    var a = c[0].q_m3h, b = c[c.length - 1].q_m3h, ga = g(a), gb = g(b);
    if (ga == null || gb == null) return null;
    if (ga < 0) return { Q: a, H: hDaCurva(c, a), foraDaCurva: "abaixo" };   /* nem com vazão mínima a bomba vence o sistema */
    if (gb > 0) return { Q: b, H: hDaCurva(c, b), foraDaCurva: "acima" };    /* passa do fim da curva publicada */
    var ITER = 60;   // hid:ok iterações da bisseção (precisão muito abaixo de 1 L/h)
    for (var k = 0; k < ITER; k++) { var m = (a + b) / 2, gm = g(m); if (gm > 0) a = m; else b = m; }
    var Q = (a + b) / 2;
    return { Q: r4(Q), H: r4(hDaCurva(c, Q)) };
  }

  /* ================================================ DIMENSIONAR */
  function tipologia(ctx, uso, usadoEm) {
    var l = linhasCtx(ctx, "pisc.tipologia_coluna", usadoEm); if (!l) return null;
    return l.filter(function (x) { return x.uso === uso; })[0] || null;
  }
  function tempoMax(ctx, coluna, prof, usadoEm) {
    var l = linhasCtx(ctx, "pisc.tempo_filtracao", usadoEm); if (!l) return null;
    var r = l.filter(function (x) { return x.coluna === coluna && prof > num(x.prof_de_m, 0) - EPS && (x.prof_ate_m == null || prof <= Number(x.prof_ate_m) + EPS); });
    /* "Até 0,60" inclui o 0,60: a 1ª faixa que casa */
    r.sort(function (a, b) { return num(a.prof_de_m, 0) - num(b.prof_de_m, 0); });
    return r[0] || null;
  }

  /* dispositivo do catálogo: a menor vazão máxima que atende q (a vazão máxima do fabricante já respeita 0,5 m/s na grelha
     do ralo: catálogo Sodramar, 'velocidade de 0,5 m/s') — preferindo o tipo de construção e, se pedido, o texto (ex.: antiaprisionamento) */
  function escolherDisp(tipo, q, cons, re, nome, chaveNorma, R, verif) {
    var l = catalogo(tipo).filter(function (i) { return num(i.norm.vazao_max_m3h, 0) > 0 && (!re || re.test(i.descricao)); });
    var daObra = l.filter(function (i) { return new RegExp(cons, "i").test(i.descricao); });
    if (daObra.length) l = daObra;
    var ok = l.filter(function (i) { return num(i.norm.vazao_max_m3h, 0) >= q - EPS; }).sort(function (a, b) { return num(a.norm.vazao_max_m3h, 0) - num(b.norm.vazao_max_m3h, 0) || num(a.norm.massa_kg, 0) - num(b.norm.massa_kg, 0); });
    var it = ok[0] || l.sort(function (a, b) { return num(b.norm.vazao_max_m3h, 0) - num(a.norm.vazao_max_m3h, 0); })[0] || null;
    if (!it) return null;
    var vm = num(it.norm.vazao_max_m3h, 0);
    verif("pisc.disp." + tipo, nome + " — " + it.fabricante + " " + it.codigo, f2(q), "≤ " + f2(vm) + " (vazão máxima do produto)", "m³/h", q <= vm + EPS, fonteItem(it) + "; " + fonteTxt(chaveNorma));
    return { id: it.id, fabricante: it.fabricante, codigo: it.codigo, descricao: it.descricao, norm: it.norm, fonte: fonteItem(it), q: r4(q) };
  }
  function dimensionar(g, params) {
    var par = params || {}, N = NN(), ctx = N.contexto();
    var R = { ok: false, piscina: null, params: copia(par), verificacoes: [], decisoes: [], pendencias: [], avisos: [], memoria: [], normas: [], linhas: {}, dispositivos: {}, equipamentos: {} };
    function decide(id, texto) { R.decisoes.push({ id: id, texto: texto }); }
    function aviso(texto, acao) { R.avisos.push({ texto: texto, acao: acao || null }); }
    function verif(id, nome, valor, limite, unidade, ok, fonte, obs) { R.verificacoes.push({ id: id, nome: nome, valor: valor, limite: limite, unidade: unidade || "", ok: ok, status: ok === true ? "atende" : (ok === false ? "nao_atende" : "pendente"), fonte: fonte || "", obs: obs || "" }); }
    function mem(rot, formula, valor, unidade, fonte) { R.memoria.push({ rotulo: rot, formula: formula, valor: valor, unidade: unidade || "", fonte: fonte || "" }); }
    if (!g || !g.ok) { R.pendencias.push({ chave: "pisc.geometria", motivo: "geometria da piscina incompleta: " + arr(g && g.erros).join("; ") }); return R; }
    R.piscina = { id: g.id, nome: g.nome, area: g.area, perimetro: g.perimetro, volume: g.volume, profMedia: g.profMedia, profRasa: g.profRasa, profFunda: g.profFunda, yBorda: g.yBorda, yAgua: g.yAgua, comprimento: r4(g.eixo.comprimento), largura: r4(g.eixo.largura), origem: g.origem };
    var uso = par.uso || "residencial_privativa";
    mem("Área da superfície da água", "A (contorno do modelo)", f2(g.area), "m²", g.origem === "desenhado" ? "contorno desenhado" : "modelo (" + g.origem + ")");
    mem("Profundidade média", "fundo plano inclinado: prof(centroide) = " + f2(g.profRasa) + " → " + f2(g.profFunda) + " m", f2(g.profMedia), "m", "geometria");
    mem("Volume", "V = A × p_média", f2(g.volume), "m³", "geometria");
    if (g.bordaLivreAdotada) decide("pisc.borda_livre", "Nível da água " + f2(GEO.bordaLivre) + " m abaixo do topo da borda (critério do projetista, o modelo não informa; a NBR 10339 limita a distância a " + f2(param(ctx, "pisc.tanque", "borda_agua_max_m", "borda livre")) + " m).");
    var bmax = param(ctx, "pisc.tanque", "borda_agua_max_m", "borda livre"), bl = g.bordaLivre != null ? g.bordaLivre : GEO.bordaLivre;
    verif("pisc.borda_livre", "Distância entre a superfície da água e o topo da borda", f2(bl), bmax != null ? "≤ " + f2(bmax) : "—", "m", bmax == null ? null : bl <= bmax + EPS, fonteTxt("pisc.tanque"));

    /* 1) TIPOLOGIA e TEMPO DE FILTRAÇÃO → vazão de recirculação */
    var tip = tipologia(ctx, uso, "tipologia");
    if (!tip) { R.pendencias.push({ chave: "pisc.tipologia_coluna", motivo: "uso \"" + uso + "\" sem tipologia na tabela" }); }
    var col = tip ? tip.coluna_t4 : null, alta = !!par.altaOcupacao;
    if (alta && uso !== "residencial_privativa") col = "alta_ocupacao";
    var linT = col ? tempoMax(ctx, col, g.profMedia, "vazão de recirculação") : null, tMax = linT ? Number(linT.t_max_h) : null;
    if (alta && uso === "residencial_privativa") {
      var ren = N.valor("pisc.renovacao_residencial_alta_ocupacao"); ctx.consulta("pisc.renovacao_residencial_alta_ocupacao", null, "valor", "alta ocupação residencial");
      if (ren != null) { var t3 = 24 / ren; if (tMax == null || t3 < tMax) tMax = t3; decide("pisc.alta_ocupacao", "Residencial privativa com ocupação acima de 1 usuário/2 m²/12 h: renovação mínima de " + ren + " vezes por dia (Tabela 4, nota a) → tempo máximo " + f1(t3) + " h."); }   // hid:ok 24 h do dia
    }
    if (uso === "terapeutica") decide("pisc.terapeutica", "Piscina terapêutica tratada como de hospedaria (a NBR 10339 põe hospitais nessa tipologia, 4.2.1 c): tempo de filtração da coluna 'Pública/Coletiva/Hospedaria' e temperatura de hidroterapia.");
    var Q = tMax ? r4(g.volume / tMax) : null;
    R.vazao = { Q_m3h: Q, t_max_h: tMax, coluna: col, uso: uso, fonte: fonteTxt("pisc.tempo_filtracao") };
    if (Q == null) { R.pendencias.push({ chave: "pisc.tempo_filtracao", motivo: "sem o tempo máximo de filtração: a vazão de recirculação não foi calculada" }); }
    else mem("Vazão de recirculação (projeto)", "Q = V / t_máx = " + f2(g.volume) + " / " + f1(tMax), f2(Q), "m³/h", fonteTxt("pisc.tempo_filtracao") + " — coluna " + col + ", profundidade média " + f2(g.profMedia) + " m");

    /* 2) FILTRO pela taxa de filtração (25 a 50 m³/h/m²) */
    var txMin = param(ctx, "pisc.filtro_areia", "taxa_filtracao_min", "filtro"), txMax = param(ctx, "pisc.filtro_areia", "taxa_filtracao_max", "filtro");
    var filtros = catalogo("filtro").filter(function (f) { return num(f.norm.area_filtrante_m2, 0) > 0 || num(f.norm.vazao_m3h, 0) > 0; });
    var filtro = null;
    if (Q && txMax) {
      var cands = filtros.map(function (f) {
        var A = num(f.norm.area_filtrante_m2, null), qn = num(f.norm.vazao_m3h, null);
        if (A == null && qn != null) A = null;   /* sem área impressa: não se deduz da vazão (a taxa do fabricante não é a da norma) */
        return { it: f, A: A, qn: qn };
      }).filter(function (c) { return c.A != null && Q / c.A <= txMax + EPS; });
      if (par.filtro) cands = cands.filter(function (c) { return c.it.id === par.filtro; }).concat(cands.filter(function (c) { return c.it.id !== par.filtro; }));
      cands.sort(function (a, b) { return (par.filtro ? 0 : 0) || a.A - b.A; });
      if (par.filtro) { var esc = cands.filter(function (c) { return c.it.id === par.filtro; })[0]; if (esc) cands = [esc].concat(cands.filter(function (c) { return c !== esc; })); }
      var c0 = cands[0]; R._candsFiltro = cands;
      if (c0) {
        filtro = { id: c0.it.id, item: c0.it, area: c0.A, vazaoNominal: c0.qn, taxa: r4(Q / c0.A) };
        var okT = filtro.taxa <= txMax + EPS && filtro.taxa >= txMin - EPS;
        verif("pisc.filtro.taxa", "Taxa de filtração na vazão de projeto (" + c0.it.fabricante + " " + c0.it.codigo + ")", f1(filtro.taxa), f1(txMin) + " a " + f1(txMax), "m³/h/m²", okT, fonteTxt("pisc.filtro_areia") + "; filtro: " + fonteItem(c0.it));
        if (filtro.taxa < txMin - EPS) aviso("O menor filtro do catálogo que atende fica com taxa " + f1(filtro.taxa) + " m³/h/m² (abaixo de " + f1(txMin) + "): filtro grande demais para a vazão — confira com o fabricante ou aumente a vazão.", { tipo: "parametro", campo: "filtro" });
        mem("Área filtrante mínima", "A_mín = Q / taxa_máx = " + f2(Q) + " / " + f1(txMax), f2(Q / txMax), "m²", fonteTxt("pisc.filtro_areia"));
        mem("Filtro adotado", c0.it.fabricante + " " + c0.it.codigo + " — área " + f2(c0.A) + " m²", f1(filtro.taxa), "m³/h/m²", fonteItem(c0.it));
      } else if (filtros.length) R.pendencias.push({ chave: "pisc.catalogo.filtro", motivo: "nenhum filtro do catálogo (com área filtrante impressa) atende " + f2(Q) + " m³/h na taxa máxima de " + f1(txMax) + " m³/h/m²" });
      else R.pendencias.push({ chave: "pisc.catalogo.filtro", motivo: "catálogo de filtros de piscina não carregado (dados-fonte/hidro/catalogos/piscina-*.json)" });
    }
    R.equipamentos.filtro = filtro ? { id: filtro.id, fabricante: filtro.item.fabricante, codigo: filtro.item.codigo, descricao: filtro.item.descricao, area: filtro.area, taxa: filtro.taxa, vazaoNominal: filtro.vazaoNominal, norm: filtro.item.norm, fonte: fonteItem(filtro.item) } : null;

    /* 3) DISPOSITIVOS (quantidade) */
    var ret = { n: null }, vNoz = param(ctx, "pisc.bocal_retorno", "velocidade_saida_min", "retornos"), aPor = param(ctx, "pisc.bocal_retorno", "area_por_bocal_m2", "retornos"),
        vPor = param(ctx, "pisc.bocal_retorno", "volume_por_bocal_m3", "retornos"), nMin = param(ctx, "pisc.bocal_retorno", "minimo", "retornos");
    if (aPor && vPor && nMin != null) {
      var nA = Math.ceil(g.area / aPor - EPS), nV = Math.ceil(g.volume / vPor - EPS);
      ret.n = Math.max(nMin, nA, nV);
      decide("pisc.retornos", "Bocais de retorno: " + ret.n + " (1 a cada " + f1(aPor) + " m² dá " + nA + "; 1 a cada " + f1(vPor) + " m³ dá " + nV + "; mínimo " + nMin + ") — a norma diz 'ou': adotado o MAIOR (lado seguro).");
      mem("Bocais de retorno", "n = máx(" + nMin + "; ⌈A/" + f1(aPor) + "⌉ = " + nA + "; ⌈V/" + f1(vPor) + "⌉ = " + nV + ")", ret.n, "un", fonteTxt("pisc.bocal_retorno"));
    }
    var nCo = null, aCo = tip ? num(tip.area_por_coadeira_m2, null) : null, succ = par.succao || "dois_drenos";
    if (aCo) {
      nCo = Math.max(1, Math.ceil(g.area / aCo - EPS));
      if (succ === "coadeiras") { var cmin = param(ctx, "pisc.succao_seguranca", "coadeiras_min_so_coadeira", "sucção só por coadeira"); if (cmin && nCo < cmin) nCo = cmin; }
      mem("Coadeiras (skimmers)", "n = ⌈A / " + f1(aCo) + "⌉" + (succ === "coadeiras" ? " (sucção só pela superfície: no mínimo 2)" : ""), nCo, "un", fonteTxt("pisc.coadeira") + " e " + fonteTxt("pisc.tipologia_coluna"));
    }
    var nDr = null, dDr = param(ctx, "pisc.succao_seguranca", "distancia_drenos_min_m", "ralos de fundo");
    if (succ === "dois_drenos") { nDr = param(ctx, "pisc.succao_seguranca", "drenos_min_opcao_a", "ralos de fundo"); decide("pisc.succao", "Sucção segura pela opção a) da NBR 10339 5.4.4.8.2: " + nDr + " ralos de fundo com grelha antiaprisionamento, interligados, a no mínimo " + f2(dDr) + " m de centro a centro, equilibrados (mesmo DN e comprimento de ramo)."); }
    else if (succ === "coadeiras") { nDr = 0; decide("pisc.succao", "Sucção só pela superfície (opção b): " + nCo + " coadeiras, sem ralo de fundo de sucção."); }
    else if (succ === "grelha_nao_bloqueavel") { nDr = 1; decide("pisc.succao", "Sucção por UM ralo de fundo com grelha NÃO BLOQUEÁVEL (opção d): grelha de no mínimo " + f2(param(ctx, "pisc.succao_seguranca", "grelha_nao_bloqueavel_lado1_m", "grelha")) + " × " + f2(param(ctx, "pisc.succao_seguranca", "grelha_nao_bloqueavel_lado2_m", "grelha")) + " m."); }
    else if (succ === "tanque_intermediario") { nDr = 1; decide("pisc.succao", "Sucção por um ralo de fundo com TANQUE INTERMEDIÁRIO de sucção indireta (opção c) — o tanque fica a projetar (pendência)."); R.pendencias.push({ chave: "pisc.tanque_intermediario", motivo: "o tanque intermediário de sucção indireta (Figura 14) não é dimensionado pelo OrçaPRO: projetar à parte" }); }
    if (g.eixo.comprimento < num(dDr, 0) && nDr >= 2) R.pendencias.push({ chave: "pisc.succao_seguranca", motivo: "a piscina tem " + f2(g.eixo.comprimento) + " m no eixo maior: não cabem 2 ralos a " + f2(dDr) + " m — use a opção b), c) ou d) da NBR 10339 5.4.4.8.2" });
    var nAsp = num(par.aspiracoes, null);
    var alc = regraFab(ctx, "pisc.fab.mangueira_aspiracao", "aspiração");
    if (nAsp == null) {
      if (alc && num(alc.valor, 0) > 0) {
        /* alcance = comprimento da mangueira do fabricante; uma aspiração por "círculo" do alcance sobre o eixo maior */
        nAsp = Math.max(1, Math.ceil(g.eixo.comprimento / (2 * num(alc.valor, 1)) - EPS));
        decide("pisc.aspiracao", "Aspirações: " + nAsp + " — o alcance de cada uma é a mangueira de " + f1(num(alc.valor, 0)) + " m (" + fonteTxt("pisc.fab.mangueira_aspiracao") + "); a distribuição confere o ponto mais longe.");
      } else { nAsp = 1; R.pendencias.push({ chave: "pisc.fab.mangueira_aspiracao", motivo: "sem o comprimento de mangueira do aspirador (fabricante): 1 aspiração lançada; confira se o aspirador alcança todo o tanque (NBR 10339 5.4.4.12.3 c)" }); }
    }
    R.dispositivos = { retornos: ret.n, coadeiras: nCo, ralosFundo: nDr, aspiracoes: nAsp, distanciaRalos: dDr, succao: succ };
    /* os PRODUTOS dos dispositivos: o menor do catálogo cuja vazão máxima atende (tipo de construção: alvenaria por padrão) */
    if (Q) {
      var cons = par.construcao || "alvenaria", fr0 = param(ctx, "pisc.coadeira", "fracao_vazao_tubulacao_min", "coadeiras") || 1;
      var qS = Q * fr0, qF = Q * geo(par, "ramoDrenoTotal"), qR = ret.n ? Q / ret.n : null;
      R.equipamentos.coadeira = escolherDisp("skimmer", qS, cons, null, "Coadeira", "pisc.coadeira", R, verif);
      if (nDr) R.equipamentos.ralo = escolherDisp("ralo_fundo", qF, cons, /aprisionamento/i, "Ralo de fundo (um obstruído: a vazão toda do fundo)", "pisc.ralo_fundo", R, verif);
      R.equipamentos.aspiracao = escolherDisp("aspiracao", Q, cons, null, "Dispositivo de aspiração (o aspirador puxa a vazão toda)", "pisc.bocal_aspiracao", R, verif);
      if (qR) R.equipamentos.retorno = escolherDisp("retorno", qR, cons, null, "Dispositivo de retorno (Q / n)", "pisc.bocal_retorno", R, verif);
      if (nDr && !R.equipamentos.ralo) R.pendencias.push({ chave: "pisc.catalogo.ralo", motivo: "nenhum ralo de fundo com grelha ANTIAPRISIONAMENTO no catálogo atende " + f2(qF) + " m³/h a 0,5 m/s nas aberturas — use mais ralos ou grelha maior" });
    }

    /* 4) LINHAS — DN pela velocidade máxima (Tabela 3) */
    if (Q) {
      var fr = param(ctx, "pisc.coadeira", "fracao_vazao_tubulacao_min", "coadeiras") || 1;
      /* DN mínimo = o da CONEXÃO do produto ligado à linha (o fabricante não admite reduzir: manual PF Dancor p.4, bocais para
         tubo de 50 mm): a linha principal pelo filtro, o ramal pelo dispositivo */
      var dnEq = filtro ? deConexao(filtro.item.norm.conexao_pol) : null;
      function dnDisp(k) { var e = R.equipamentos[k]; return e ? deConexao(e.norm.conexao_pol) : null; }
      if (dnEq) decide("pisc.dn_minimo", "Linhas principais com no mínimo o DN da conexão do filtro (" + filtro.item.codigo + ": " + filtro.item.norm.conexao_pol + "\" = DE " + dnEq + "): o DN pela velocidade da norma é o MÍNIMO; menor que o bocal do equipamento, nunca.");
      R.linhas.succaoGeral = linhaDn(ctx, Q, "succao", "sucção geral (barrilete)", dnEq);
      R.linhas.coadeira = linhaDn(ctx, Q * fr, "succao", "linha de cada coadeira", dnDisp("coadeira") || dnEq);
      decide("pisc.linha_coadeira", "Cada linha de coadeira conduz " + Math.round(fr * 100) + " % da vazão de projeto (NBR 10339 5.4.4.11 d: a tubulação das coadeiras conduz pelo menos isso) — lado seguro: vale para CADA coadeira.");
      if (nDr) {
        R.linhas.fundo = linhaDn(ctx, Q * geo(par, "ramoDrenoTotal"), "succao", "ralos de fundo", dnDisp("ralo") || dnEq);
        decide("pisc.linha_fundo", "Ramo de cada ralo de fundo e linha do fundo dimensionados para a vazão TOTAL (" + f2(Q) + " m³/h): com um ralo obstruído o outro leva tudo (critério do projetista, lado seguro).");
      }
      R.linhas.aspiracao = linhaDn(ctx, Q, "succao", "aspiração", dnDisp("aspiracao") || dnEq);
      R.linhas.recalque = linhaDn(ctx, Q, "recalque", "recalque (bomba → filtro → retornos)", dnEq);
      if (ret.n) R.linhas.retornoRamal = linhaDn(ctx, Q / ret.n, "recalque", "ramal de cada retorno", dnDisp("retorno") || dnEq);
      Object.keys(R.linhas).forEach(function (k) {
        var L = R.linhas[k]; if (!L) return;
        verif("pisc.v." + k, "Velocidade — " + ({ succaoGeral: "sucção geral", coadeira: "linha de coadeira", fundo: "linha do fundo", aspiracao: "aspiração", recalque: "recalque", retornoRamal: "ramal de retorno" })[k] + (L.dn ? " (DN " + L.dn + ")" : ""), L.v != null ? f2(L.v) : "—", L.vmax != null ? "≤ " + f1(L.vmax) : "—", "m/s", L.ok, fonteTxt("pisc.velocidade_maxima"));
      });
    }

    /* 5) bocal de retorno: velocidade de saída ≥ 3 m/s (orifício do catálogo) */
    var bocal = catalogo("retorno")[0] || null;
    if (bocal && ret.n && Q) {
      var dOri = num(bocal.norm.orificio_mm, null);
      if (dOri) { var vs = velocidade(Q / ret.n, dOri / 1000); verif("pisc.retorno.v_saida", "Velocidade na saída do bocal de retorno (" + bocal.codigo + ", orifício " + dOri + " mm)", f2(vs), vNoz != null ? "≥ " + f1(vNoz) : "—", "m/s", vNoz == null ? null : vs >= vNoz - EPS, fonteTxt("pisc.bocal_retorno") + "; bocal: " + fonteItem(bocal)); }
      else verif("pisc.retorno.v_saida", "Velocidade na saída do bocal de retorno", "—", vNoz != null ? "≥ " + f1(vNoz) : "—", "m/s", null, fonteTxt("pisc.bocal_retorno"), "o catálogo do bocal não imprime o diâmetro do orifício: regular a vazão no próprio bocal (5.4.4.12.2 c) e conferir na obra");
    } else if (ret.n) verif("pisc.retorno.v_saida", "Velocidade na saída do bocal de retorno", "—", vNoz != null ? "≥ " + f1(vNoz) : "—", "m/s", null, fonteTxt("pisc.bocal_retorno"), "sem bocal de retorno no catálogo");
    R.equipamentos.bocalRetorno = bocal ? { id: bocal.id, fabricante: bocal.fabricante, codigo: bocal.codigo, norm: bocal.norm, fonte: fonteItem(bocal) } : null;

    /* 6) HIDROMASSAGEM — vazão por bocal do fabricante (a MÍNIMA: abaixo dela o jato não funciona), bomba dedicada */
    var hid = par.hidro || {};
    if (hid.ativo && num(hid.bocais, 0) > 0) {
      var nb = Math.round(num(hid.bocais, 0)), consH = par.construcao || "alvenaria";
      var bhs = catalogo("hidro_bocal").filter(function (i) { return num(i.norm.vazao_por_bocal_m3h, 0) > 0 && !/blower/i.test(i.descricao); });
      var bh = bhs.filter(function (i) { return new RegExp(consH, "i").test(i.descricao); })[0] || bhs[0] || null;
      var qMin = param(ctx, "pisc.fab.hidro_bocal", "vazao_min_m3h", "hidromassagem"), qMax = param(ctx, "pisc.fab.hidro_bocal", "vazao_max_m3h", "hidromassagem"), pMax = param(ctx, "pisc.fab.hidro_bocal", "profundidade_max_m", "hidromassagem");
      var qb = num(hid.vazaoBocal, qMin);
      var Qh = qb != null ? r4(nb * qb) : null;
      R.hidro = { bocais: nb, q_bocal: qb, q_min: qMin, q_max: qMax, prof_max: pMax, Q_m3h: Qh, bocal: bh ? { id: bh.id, fabricante: bh.fabricante, codigo: bh.codigo, descricao: bh.descricao, norm: bh.norm, fonte: fonteItem(bh) } : null, pressao_mca: bh ? num(bh.norm.pressao_mca, null) : null };
      if (Qh == null) R.pendencias.push({ chave: "pisc.fab.hidro_bocal", motivo: "sem a vazão por bocal de hidromassagem (fabricante): bomba de hidro não dimensionada" });
      else {
        mem("Vazão da hidromassagem", "Q_h = n × q_bocal = " + nb + " × " + f2(qb) + " (vazão mínima por dispositivo do fabricante)", f2(Qh), "m³/h", fonteTxt("pisc.fab.hidro_bocal"));
        if (bh) verif("pisc.hidro.bocal", "Vazão por bocal (" + bh.fabricante + " " + bh.codigo + ")", f2(qb), "≤ " + f2(num(bh.norm.vazao_por_bocal_m3h, 0)) + " (máxima do produto)", "m³/h", qb <= num(bh.norm.vazao_por_bocal_m3h, 0) + EPS, fonteItem(bh));
        var dnH = deConexao((catalogo("hidro_bomba")[0] || { norm: {} }).norm.conexao_pol) || null;
        R.linhas.hidroSuccao = linhaDn(ctx, Qh, "succao", "sucção da hidro", dnH);
        R.linhas.hidroRecalque = linhaDn(ctx, Qh, "recalque", "recalque da hidro", dnH);
        R.linhas.hidroRamal = linhaDn(ctx, qb, "recalque", "ramal de cada bocal de hidro");
        ["hidroSuccao", "hidroRecalque", "hidroRamal"].forEach(function (k) { var L = R.linhas[k]; verif("pisc.v." + k, "Velocidade — " + ({ hidroSuccao: "sucção da hidro", hidroRecalque: "recalque da hidro", hidroRamal: "ramal de bocal de hidro" })[k] + (L.dn ? " (DN " + L.dn + ")" : ""), L.v != null ? f2(L.v) : "—", L.vmax != null ? "≤ " + f1(L.vmax) : "—", "m/s", L.ok, fonteTxt("pisc.velocidade_maxima")); });
      }
      decide("pisc.hidro", "Hidromassagem com " + nb + " bocais em circuito PRÓPRIO (2 sucções de parede interligadas, bomba dedicada e linha de distribuição com um tê por bocal), independente da filtração; acionamento pelo botão pneumático na borda; uma válvula de ar independente por bocal (" + fonteTxt("pisc.fab.hidro_bocal") + ").");
    }

    /* 7) AQUECIMENTO */
    var aq = par.aquecimento || {}, tAg = null;
    if (aq.tipo && aq.tipo !== "nenhum") {
      var atv = aq.atividade || (uso === "terapeutica" ? "bebes_hidroterapia" : "recreacao"), lt = linhasCtx(ctx, "pisc.temperatura_agua", "aquecimento"), ft = lt ? lt.filter(function (x) { return x.atividade === atv; })[0] : null;
      tAg = num(aq.temperatura, ft ? (Number(ft.t_min_c) + Number(ft.t_max_c)) / 2 : null);
      R.aquecimento = { tipo: aq.tipo, atividade: atv, tAgua: tAg, faixa: ft ? [Number(ft.t_min_c), Number(ft.t_max_c)] : null, capa: !!aq.capa };
      if (ft) verif("pisc.temp", "Temperatura de projeto da água (" + ft.nome + ")", f1(tAg), f1(ft.t_min_c) + " a " + f1(ft.t_max_c), "°C", tAg >= Number(ft.t_min_c) - EPS && tAg <= Number(ft.t_max_c) + EPS, fonteTxt("pisc.temperatura_agua"));
      if (aq.tipo === "solar") {
        var ls = linhasCtx(ctx, "pisc.fab.solar_area", "aquecimento solar") || [], tMed = num(aq.tMediaAnual, null), rs = null, dT = null;
        ls = ls.slice().sort(function (a, b) { return Number(a.diferencial_c) - Number(b.diferencial_c); });
        if (tMed != null && tAg != null) { dT = tAg - tMed; rs = ls.filter(function (x) { return Number(x.diferencial_c) >= dT - EPS; })[0] || null; if (!rs) R.pendencias.push({ chave: "pisc.fab.solar_area", motivo: "diferencial de " + f1(dT) + " °C acima da tabela do fabricante (até +" + f1(Number((ls[ls.length - 1] || {}).diferencial_c)) + " °C): dimensionar à parte (NBR 15569) ou usar capa térmica" }); }
        else { var clima = aq.clima || "medio"; rs = ls.filter(function (x) { return x.clima === clima; })[0] || null; if (rs) R.pendencias.push({ chave: "pisc.solar.t_media", motivo: "temperatura média anual do local não informada: usado o clima \"" + clima + "\" do fabricante (média " + f1(Number(rs.t_media_anual_c)) + " °C) — informe a média do local para o diferencial real" }); }
        var cols = catalogo("coletor_solar_piscina").filter(function (c) { return num(c.norm.area_m2, 0) > 0; }).sort(function (a, b) { return num(b.norm.area_m2, 0) - num(a.norm.area_m2, 0); });
        var col = cols[0] || null;
        if (rs) {
          var fat = Number(rs.fator), Acol = r4(g.area * fat), aPl = col ? num(col.norm.area_m2, null) : null, nPl = aPl ? Math.ceil(Acol / aPl - EPS) : null;
          R.aquecimento.solar = { fator: fat, diferencial: dT != null ? r4(dT) : Number(rs.diferencial_c), linha: rs, areaColetores: Acol, placa: col ? { id: col.id, fabricante: col.fabricante, codigo: col.codigo, norm: col.norm, fonte: fonteItem(col) } : null, nPlacas: nPl };
          mem("Área de coletores (solar)", "A_col = fator × A = " + f2(fat) + " × " + f2(g.area) + " (diferencial " + (dT != null ? f1(dT) : "+" + rs.diferencial_c) + " °C → linha +" + rs.diferencial_c + " °C)", f2(Acol), "m²", fonteTxt("pisc.fab.solar_area"));
          if (nPl) mem("Placas coletoras", "n = ⌈A_col / " + f2(aPl) + "⌉ (" + col.fabricante + " " + col.codigo + ")", nPl, "un", fonteItem(col));
          else R.pendencias.push({ chave: "pisc.catalogo.coletor", motivo: "sem placa coletora de piscina com área no catálogo: número de placas a definir" });
          var qm2 = N.valor("pisc.fab.solar_vazao"); ctx.consulta("pisc.fab.solar_vazao", null, "valor", "circuito solar");
          if (nPl && qm2 != null) {
            var Qs = r4(qm2 * nPl * aPl); R.aquecimento.solar.Q_m3h = Qs;
            R.linhas.solar = linhaDn(ctx, Qs, "recalque", "circuito solar", dnEq);
            mem("Vazão do circuito solar", "Q_s = " + f2(qm2) + " × n × A_placa = " + f2(qm2) + " × " + nPl + " × " + f2(aPl), f2(Qs), "m³/h", fonteTxt("pisc.fab.solar_vazao"));
            var be = N.valor("pisc.fab.aquecedor_bomba"); ctx.consulta("pisc.fab.aquecedor_bomba", null, "valor", "bomba do aquecimento");
            if (be === "sim") decide("pisc.aquec.bomba", "Circuito solar com BOMBA EXCLUSIVA (o fabricante recomenda motobomba própria para o aquecedor: " + fonteTxt("pisc.fab.aquecedor_bomba") + "), escolhida na curva com o desnível até as placas e as perdas do circuito traçado.");
          } else R.pendencias.push({ chave: "pisc.fab.solar_vazao", motivo: "sem a vazão por m² de coletor: a vazão do circuito solar fica a definir com o fabricante" });
        }
      } else if (aq.tipo === "bomba_calor") {
        var bcs = catalogo("bomba_calor").filter(function (b) { return num(b.norm.volume_piscina_m3, 0) > 0; }).sort(function (a, b) { return num(a.norm.volume_piscina_m3, 0) - num(b.norm.volume_piscina_m3, 0) || num(b.norm.largura_mm, 0) - num(a.norm.largura_mm, 0); });
        var bc = bcs.filter(function (b) { return num(b.norm.volume_piscina_m3, 0) >= g.volume - EPS; })[0] || null;
        if (bc) { R.aquecimento.bombaCalor = { id: bc.id, fabricante: bc.fabricante, codigo: bc.codigo, norm: bc.norm, fonte: fonteItem(bc) }; mem("Bomba de calor (seleção pelo volume do fabricante)", bc.fabricante + " " + bc.codigo + " — até " + f1(bc.norm.volume_piscina_m3) + " m³", f1(num(bc.norm.capacidade_kw, null)), "kW", fonteItem(bc)); }
        else R.pendencias.push({ chave: "pisc.catalogo.bomba_calor", motivo: "nenhuma bomba de calor do catálogo com volume de piscina ≥ " + f1(g.volume) + " m³ (ou catálogo sem a tabela de seleção)" });
      } else R.pendencias.push({ chave: "pisc.aquecimento." + aq.tipo, motivo: "aquecimento por " + aq.tipo + ": sem catálogo/regra de seleção — dimensionar com o fabricante" });
      R.pendencias.push({ chave: "pisc.perda_termica", motivo: "potência pela PERDA TÉRMICA (evaporação, convecção, radiação): o método achado é de fonte acadêmica (Novaes, USP 2019, eq. 15-16, que cita a NBR 15569) e o exemplo dela não fecha no recálculo — o dimensionamento fica pela regra/seleção do FABRICANTE até a NBR 15569 ser lida" });
    }

    /* 8) BOMBA DE RECIRCULAÇÃO — altura manométrica estimada (a rede traçada refaz com os comprimentos reais) */
    R.equipamentos.bomba = null;
    if (Q) {
      var pf = num(par.perdaFiltroSujo_mca, null), fFab = filtro ? num(filtro.item.norm.perda_sujo_mca, null) : null, pLimpo = param(ctx, "pisc.filtro_areia", "perda_inicial_max", "filtro");
      if (pf == null) pf = fFab;
      if (pf == null) {
        var fs = regraFab(ctx, "pisc.fab.filtro_sujo", "filtro sujo");
        if (fs && num(fs.valor_mca, null) != null) { pf = num(fs.valor_mca, null); decide("pisc.filtro_sujo", "Perda do filtro SUJO = " + f1(pf) + " mca (retrolavagem quando a diferença entre os manômetros chega a " + f1(num(fs.valor, null)) + " kgf/cm² — " + fonteTxt("pisc.fab.filtro_sujo") + "); a NBR 10339 manda a bomba atender com o filtro sujo (5.4.4.1.4 e)."); }
      }
      if (pf == null) { pf = pLimpo; R.pendencias.push({ chave: "pisc.filtro.perda_sujo", motivo: "perda de carga do filtro SUJO (na iminência da lavagem) não publicada pelo fabricante: usada a perda inicial máxima da NBR 10339 (" + f1(pLimpo) + " mca) — a bomba fica PENDENTE de conferência (5.4.4.1.4 e)" }); }
      var parE = copia(par); parE.dnSuccao = parE.dnSuccao || (R.linhas.succaoGeral || {}).dn; parE.dnRecalque = parE.dnRecalque || (R.linhas.recalque || {}).dn;
      R.estimativa = estimativaAmt(ctx, g, parE, Q, pf, tAg);
      R.amt = R.estimativa.amt;
      var bomba = escolherBomba(ctx, Q, R.estimativa, filtro, txMax, par, "bomba de recirculação");
      /* ⚠ FILTRO × BOMBA JUNTOS: o ponto de operação tem de cair entre Q e taxa_máx × área — com o menor filtro a janela pode ser
         estreita demais (FM 36: 5,0 a 5,1 m³/h) e nenhuma bomba da curva cai nela; sobe para o filtro seguinte até achar o par */
      if (!bomba && filtro && arr(R._candsFiltro).length > 1) {
        var ci0 = R._candsFiltro.map(function (c) { return c.it.id; }).indexOf(filtro.id);
        for (var ci = ci0 + 1; ci < R._candsFiltro.length && !bomba; ci++) {
          var cf = R._candsFiltro[ci], fx = { id: cf.it.id, item: cf.it, area: cf.A, vazaoNominal: cf.qn, taxa: r4(Q / cf.A) };
          if (fx.taxa < txMin - EPS) break;   /* filtro grande demais: a taxa cai abaixo do mínimo da norma */
          bomba = escolherBomba(ctx, Q, R.estimativa, fx, txMax, par, "bomba de recirculação");
          if (bomba) {
            decide("pisc.filtro_bomba", "Filtro " + filtro.item.codigo + " trocado pelo " + cf.it.codigo + ": com o menor, nenhuma motobomba do catálogo opera entre a vazão de projeto e a taxa máxima de filtração; com este a bomba " + bomba.codigo + " cai na faixa.");
            filtro = fx;
            R.equipamentos.filtro = { id: fx.id, fabricante: cf.it.fabricante, codigo: cf.it.codigo, descricao: cf.it.descricao, area: cf.A, taxa: fx.taxa, vazaoNominal: cf.qn, norm: cf.it.norm, fonte: fonteItem(cf.it) };
            R.verificacoes = R.verificacoes.filter(function (v) { return v.id !== "pisc.filtro.taxa"; });
            verif("pisc.filtro.taxa", "Taxa de filtração na vazão de projeto (" + cf.it.fabricante + " " + cf.it.codigo + ")", f1(fx.taxa), f1(txMin) + " a " + f1(txMax), "m³/h/m²", fx.taxa <= txMax + EPS && fx.taxa >= txMin - EPS, fonteTxt("pisc.filtro_areia") + "; filtro: " + fonteItem(cf.it));
            R.memoria = R.memoria.filter(function (m) { return m.rotulo !== "Filtro adotado"; });
            mem("Filtro adotado", cf.it.fabricante + " " + cf.it.codigo + " — área " + f2(cf.A) + " m²", f1(fx.taxa), "m³/h/m²", fonteItem(cf.it));
          }
        }
      }
      R.equipamentos.bomba = bomba;
      if (bomba && bomba.op) {
        mem("Altura manométrica no projeto (estimada)", "H = H_est + Σh_f (sucção + recalque + filtro sujo + seletora + retorno)", f2(R.estimativa.amt), "mca", "Darcy-Weisbach; " + fonteTxt("af.comprimento_equivalente_conexoes"));
        mem("Ponto de operação (" + bomba.fabricante + " " + bomba.codigo + ")", "curva da bomba × curva do sistema", f2(bomba.op.Q) + " m³/h × " + f2(bomba.op.H) + " mca", "", bomba.fonte);
        verif("pisc.bomba.vazao", "Vazão de operação ≥ vazão de projeto (" + bomba.codigo + ")", f2(bomba.op.Q), "≥ " + f2(Q), "m³/h", bomba.op.Q >= Q - EPS && !bomba.op.foraDaCurva, bomba.fonte + "; " + fonteTxt("pisc.tempo_filtracao"));
        if (filtro) verif("pisc.filtro.taxa_op", "Taxa de filtração na vazão de OPERAÇÃO", f1(bomba.op.Q / filtro.area), "≤ " + f1(txMax), "m³/h/m²", bomba.op.Q / filtro.area <= txMax + EPS, fonteTxt("pisc.filtro_areia"));
        /* TEMPO DE FILTRAÇÃO × TIPOLOGIA (Tabela 4): o tempo para passar o volume todo pelo filtro na vazão de operação */
        if (R.vazao && R.vazao.t_max_h) {
          var tRec = g.volume / bomba.op.Q;
          verif("pisc.tempo_filtracao", "Tempo de filtração na vazão de operação (" + (tip ? tip.nome : uso) + ", profundidade média " + f2(g.profMedia) + " m)", f1(tRec), "≤ " + f1(R.vazao.t_max_h), "h", tRec <= R.vazao.t_max_h + EPS, fonteTxt("pisc.tempo_filtracao"));
        }
        /* a BOMBA com o FILTRO SUJO (5.4.4.1.4): a perda do filtro que entrou na altura manométrica */
        verif("pisc.bomba.filtro_sujo", "Altura manométrica com o filtro SUJO (na iminência da lavagem)", f1(pf), "incluída", "mca", pf != null ? true : null, fonteTxt("pisc.selecao_bomba") + (fFab == null ? "; valor: " + fonteTxt("pisc.fab.filtro_sujo") : ""));
        var pIni = filtro ? num(filtro.item.norm.perda_limpo_mca, null) : null;
        verif("pisc.filtro.perda_inicial", "Perda de carga inicial do filtro (limpo, sem seletora e registros)", pIni != null ? f1(pIni) : "—", "< " + f1(pLimpo), "mca", pIni != null ? pIni < pLimpo : null, fonteTxt("pisc.filtro_areia"), pIni == null ? "o catálogo do filtro não publica a perda com o filtro limpo: pedir ao fabricante (NOTA 2 de 5.4.4.4)" : "");
      } else if (!catalogo("motobomba").length) R.pendencias.push({ chave: "pisc.catalogo.motobomba", motivo: "catálogo de motobombas de piscina (com curva) não carregado" });
      else R.pendencias.push({ chave: "pisc.bomba", motivo: "nenhuma motobomba do catálogo atende " + f2(Q) + " m³/h a " + f2(R.estimativa.amt) + " mca dentro da taxa máxima do filtro" });
      /* NPSH com a casa de máquinas na posição estimada (a rede confere com a real) */
      R.npsh = npsh(ctx, par, R.estimativa, bomba, tAg);
      if (R.npsh) verif("pisc.npsh", "NPSH disponível × requerido" + (bomba ? " (" + bomba.codigo + ")" : ""), f2(R.npsh.disp), R.npsh.req != null ? "> " + f2(R.npsh.req) : "NPSHr do fabricante", "m", R.npsh.ok, "física (HidHidraulica: pressão atmosférica ISO 2533, pressão de vapor CRC/IAPWS)" + (bomba ? "; bomba: " + bomba.fonte : ""), R.npsh.obs);
      if (R.npsh && R.npsh.alturaSuccao) verif("pisc.autoescorva", "Bomba acima do nível da água × autoescorva do fabricante", f2(R.npsh.alturaSuccao.valor), R.npsh.alturaSuccao.limite != null ? "≤ " + f2(R.npsh.alturaSuccao.limite) : "fabricante", "m", R.npsh.alturaSuccao.ok, R.npsh.alturaSuccao.fonte);
      /* hidromassagem: bomba dedicada */
      if (R.hidro && R.hidro.Q_m3h) {
        var Hh = estimativaHidro(ctx, g, par, R.hidro, tAg);
        R.hidro.estimativa = Hh;
        var bh2 = escolherBomba(ctx, R.hidro.Q_m3h, Hh, null, null, { bomba: par.bombaHidro, tipos: ["hidro_bomba"] }, "bomba da hidromassagem");
        R.equipamentos.bombaHidro = bh2;
        if (bh2 && bh2.op) verif("pisc.hidro.bomba", "Bomba da hidro: vazão de operação ≥ n × q (" + bh2.codigo + ")", f2(bh2.op.Q), "≥ " + f2(R.hidro.Q_m3h), "m³/h", bh2.op.Q >= R.hidro.Q_m3h - EPS && !bh2.op.foraDaCurva, bh2.fonte);
        else R.pendencias.push({ chave: "pisc.hidro.bomba", motivo: "nenhuma bomba do catálogo atende a hidromassagem (" + f2(R.hidro.Q_m3h) + " m³/h a " + f2(Hh.amt) + " mca)" });
        if (R.hidro.pressao_mca == null) R.pendencias.push({ chave: "pisc.fab.hidro_pressao", motivo: "pressão de trabalho no bocal de hidromassagem não publicada: a bomba da hidro foi escolhida pelas perdas do circuito + a carga cinética no bocal — confirme a pressão com o fabricante" });
      }
      /* esvaziamento pela própria bomba (válvula seletora em "drenar") */
      if (bomba && bomba.op) { var tEsv = g.volume / bomba.op.Q; R.dreno = { tempo_h: r4(tEsv), Q_m3h: bomba.op.Q, dn: R.linhas.recalque ? R.linhas.recalque.dn : null }; mem("Esvaziamento (seletora em 'drenar')", "t = V / Q_op = " + f2(g.volume) + " / " + f2(bomba.op.Q), f1(tEsv), "h", "cálculo"); }
      var sep = param(ctx, "pisc.esgoto_separacao", "minimo_m", "descarte"), fd = param(ctx, "pisc.esgoto_separacao", "fator_diametro", "descarte");
      if (sep != null && fd != null && R.linhas.recalque && R.linhas.recalque.dn) { var gap = Math.max(sep, fd * R.linhas.recalque.dn / 1000); R.dreno = R.dreno || {}; R.dreno.separacao_m = r4(gap); mem("Separação livre do descarte (ar)", "máx(" + f2(sep) + "; " + fd + " × DN)", f2(gap), "m", fonteTxt("pisc.esgoto_separacao")); }
    }

    /* 9) CASA DE MÁQUINAS e exigências pela tipologia */
    if (tip) {
      var cmr = tip.cm_restricoes === "sim", lcm = linhasCtx(ctx, "pisc.casa_maquinas", "casa de máquinas") || [];
      R.casaMaquinas = { acessoMin: cmr ? param(ctx, "pisc.casa_maquinas", "acesso_min_m", "casa de máquinas") : null, peDireitoRec: cmr ? param(ctx, "pisc.casa_maquinas", "pe_direito_rec_m", "casa de máquinas") : null,
                         requisitos: lcm.map(function (x) { return x.texto; }), fonte: fonteTxt("pisc.casa_maquinas") };
      R.exigencias = { tratamentoObrigatorio: tip.tratamento_obrigatorio === "sim", bombaReserva: tip.bomba_reserva === "sim", medidorVazao: tip.medidor_vazao === "sim" };
      if (R.exigencias.bombaReserva) decide("pisc.bomba_reserva", "Tipologia " + tip.nome + ": bomba de recirculação RESERVA instalada (NBR 10339 5.4.4.6.2 d).");
      if (R.exigencias.medidorVazao) decide("pisc.medidor", "Medidor de vazão na tubulação de retorno (NBR 10339 5.4.4.15).");
      if (R.exigencias.tratamentoObrigatorio && (!par.tratamento || par.tratamento === "manual")) R.pendencias.push({ chave: "pisc.tratamento", motivo: "piscina " + tip.nome.toLowerCase() + ": equipamento de tratamento químico e desinfecção instalado no sistema é obrigatório (NBR 10339 5.4.4.3.1) — escolha clorador, gerador de cloro, ozônio ou UV" });
    }
    var em = param(ctx, "pisc.emergencia", "distancia_min_borda_m", "parada de emergência");
    if (em != null) decide("pisc.emergencia", "Botão de parada de emergência do sistema de circulação a no mínimo " + f1(em) + " m da borda, visível e de fácil acesso (NBR 10339 5.4.4.13).");

    ctx.pendencias().forEach(function (p) { R.pendencias.push({ chave: p.chave, motivo: p.motivo }); });
    /* uma pendência por chave (a explicada pelo motor vence a genérica "tabela não carregada") */
    var vistas = {}; R.pendencias = R.pendencias.filter(function (p) { var k = String(p.chave).split("[")[0]; if (vistas[k]) return false; vistas[k] = 1; return true; });
    R.normas = ctx.normas();
    R.ok = Q != null;
    R.status = R.verificacoes.some(function (v) { return v.status === "nao_atende"; }) ? "nao_atende" : (R.pendencias.length || R.verificacoes.some(function (v) { return v.status === "pendente"; }) ? "pendente" : "atende");
    return R;
  }

  /* ---------------- altura manométrica ESTIMADA (antes do traçado): comprimentos pela geometria + casa de máquinas */
  function cmEstimada(g, par) {
    if (g.cm) return { x: g.cm.x, z: g.cm.z };
    /* sem posição: a menor distância ao contorno + o afastamento (a rede escolhe o lugar e refaz) */
    return { x: g.pontoFundo.x, z: g.pontoFundo.z };
  }
  function estimativaAmt(ctx, g, par, Q, perdaFiltro, tAg) {
    var cm = cmEstimada(g, par), lin = arr(par.linhasReais);
    /* comprimentos: a rede traçada informa (par.linhasReais = [{ papel, Q, dn, L, pecas }]); sem ela, o perímetro/2 + a distância ao CM */
    var hs = 0, hr = 0, det = [], Ls = num(par.Lsuccao, null), Lr = num(par.Lrecalque, null);
    var dnS = (par.dnSuccao) || (linhaDn(ctx, Q, "succao", "estimativa")).dn, dnR = (par.dnRecalque) || (linhaDn(ctx, Q, "recalque", "estimativa")).dn;
    if (lin.length) {
      lin.forEach(function (l) {
        var p = perdaLinha(ctx, l.Q, l.dn, l.L, l.pecas, tAg, "perda " + l.papel);
        if (!p.ok) return;
        if (l.conjunto === "succao") hs = Math.max(hs, p.hf); else hr += p.hf;   /* sucções em PARALELO: a pior; recalque em SÉRIE: soma */
        det.push({ papel: l.papel, Q: l.Q, dn: l.dn, L: p.L, Leq: p.Leq, v: p.v, hf: p.hf });
      });
    } else {
      var dCm = Math.abs(cm.x - g.centroide.x) + Math.abs(cm.z - g.centroide.z);
      if (Ls == null) Ls = dCm + g.eixo.comprimento / 2;
      if (Lr == null) Lr = dCm + g.perimetro / 2;
      var ps = perdaLinha(ctx, Q, dnS, Ls, { joelho_90: 4, te90_passagem_direta: 1, registro_gaveta_aberto: 1 }, tAg, "perda sucção (estimada)");   // hid:ok peças típicas da linha estimada (a rede traçada conta as reais)
      var pr = perdaLinha(ctx, Q, dnR, Lr, { joelho_90: 6, te90_passagem_direta: 2, registro_gaveta_aberto: 1, retencao_leve: 0 }, tAg, "perda recalque (estimada)");   // hid:ok idem
      if (ps.ok) { hs = ps.hf; det.push({ papel: "sucção (estimada)", Q: Q, dn: dnS, L: ps.L, Leq: ps.Leq, v: ps.v, hf: ps.hf }); }
      if (pr.ok) { hr = pr.hf; det.push({ papel: "recalque (estimado)", Q: Q, dn: dnR, L: pr.L, Leq: pr.Leq, v: pr.v, hf: pr.hf }); }
    }
    var H = HH(), dnBocal = null;
    /* saída no bocal: carga cinética na velocidade mínima da norma (o bocal "joga" a água a ≥ 3 m/s) */
    var vNoz = param(ctx, "pisc.bocal_retorno", "velocidade_saida_min", "retornos"), hBocal = vNoz != null && H ? H.cargaCinetica(vNoz) : 0;
    var hSel = num(par.perdaSeletora_mca, null), hAq = num(par.perdaAquecedor_mca, null);
    if (hSel == null) { hSel = 0; ctx.pendencia("pisc.seletora.perda", "perda de carga da válvula seletora não publicada (o filtro é medido sem ela: NBR 10339 5.4.4.4.2 NOTA 1) — não somada", "altura manométrica"); }
    var yCm = num(par.yBomba, null), yAg = g.yAgua;
    /* desnível estático: o circuito é FECHADO (sai e volta à piscina) — só o que fica acima do nível da água (aquecimento solar no telhado) entra */
    var hEst = num(par.hEstatico, 0);
    var amt = hs + hr + num(perdaFiltro, 0) + hSel + num(hAq, 0) + hBocal + hEst;
    amt = amt * (1 + geo(par, "margemAmt"));
    return { amt: r4(amt), hs: r4(hs), hr: r4(hr), filtro: num(perdaFiltro, 0), seletora: hSel, aquecedor: num(hAq, 0), bocal: r4(hBocal), estatica: hEst, detalhe: det, Ls: Ls, Lr: Lr, dnS: dnS, dnR: dnR, yBomba: yCm, yAgua: yAg, K: Q > 0 ? (amt - hEst) / (Q * Q) : 0 };
  }
  function estimativaHidro(ctx, g, par, hidro, tAg) {
    var lin = arr(par.linhasHidro), hs = 0, hr = 0, det = [];
    if (lin.length) lin.forEach(function (l) { var p = perdaLinha(ctx, l.Q, l.dn, l.L, l.pecas, tAg, "perda " + l.papel); if (!p.ok) return; if (l.conjunto === "succao") hs = Math.max(hs, p.hf); else hr += p.hf; det.push({ papel: l.papel, Q: l.Q, dn: l.dn, L: p.L, Leq: p.Leq, v: p.v, hf: p.hf }); });
    else {
      var L = g.perimetro / 2, dS = linhaDn(ctx, hidro.Q_m3h, "succao", "hidro").dn, dR = linhaDn(ctx, hidro.Q_m3h, "recalque", "hidro").dn;
      var ps = perdaLinha(ctx, hidro.Q_m3h, dS, L, { joelho_90: 4, registro_gaveta_aberto: 1 }, tAg, "hidro sucção (estimada)"), pr = perdaLinha(ctx, hidro.Q_m3h, dR, L, { joelho_90: 6, te90_passagem_direta: hidro.bocais }, tAg, "hidro recalque (estimado)");   // hid:ok peças típicas da estimativa
      if (ps.ok) { hs = ps.hf; det.push({ papel: "sucção da hidro (estimada)", Q: hidro.Q_m3h, dn: dS, L: ps.L, Leq: ps.Leq, v: ps.v, hf: ps.hf }); }
      if (pr.ok) { hr = pr.hf; det.push({ papel: "recalque da hidro (estimado)", Q: hidro.Q_m3h, dn: dR, L: pr.L, Leq: pr.Leq, v: pr.v, hf: pr.hf }); }
    }
    /* no bocal: a pressão do fabricante (se publicada) ou, no mínimo, a carga cinética do ramal (v²/2g) */
    var H = HH(), vR = 0; det.forEach(function (d) { if (/recalque/.test(d.papel)) vR = Math.max(vR, d.v); });
    var pb = num(hidro.pressao_mca, null); if (pb == null) pb = H ? H.cargaCinetica(vR) : 0;
    var amt = hs + hr + pb;
    return { amt: r4(amt), hs: r4(hs), hr: r4(hr), bocal: pb, detalhe: det, K: hidro.Q_m3h > 0 ? amt / (hidro.Q_m3h * hidro.Q_m3h) : 0 };
  }
  function escolherBomba(ctx, Q, est, filtro, txMax, par, usadoEm) {
    var tipos = (par && par.tipos) || ["motobomba"], esc = par && (par.bomba || par.bombaRecirculacao);
    var lista = [];
    tipos.forEach(function (t) { catalogo(t).forEach(function (b) { if (arr(b.norm.curva).length >= 2) lista.push(b); }); });
    var ops = lista.map(function (b) {
      var op = pontoOperacao(b.norm.curva, est.estatica || 0, est.K);
      return { b: b, op: op };
    }).filter(function (x) {
      if (!x.op || x.op.foraDaCurva === "abaixo") return false;
      if (x.op.Q < Q - EPS) return false;
      if (filtro && txMax && x.op.Q / filtro.area > txMax + EPS) return false;
      /* bomba ACIMA da água (casa na superfície): só a que tem a autoescorva publicada e que vence o desnível */
      if (est.yBomba != null && est.yAgua != null && est.yBomba > est.yAgua + EPS) {
        var la = limAutoescorva(ctx, { fabricante: x.b.fabricante, codigo: x.b.codigo, norm: x.b.norm, fonte: fonteItem(x.b) });
        if (la.lim == null || est.yBomba - est.yAgua > la.lim + EPS) return false;
      }
      return true;
    });
    /* a MENOR que atende (potência; empate: menor vazão de operação) — a escolhida à mão vem na frente se atende */
    ops.sort(function (a, b) { return num(a.b.norm.potencia_cv, 0) - num(b.b.norm.potencia_cv, 0) || a.op.Q - b.op.Q; });
    if (esc) { var e = ops.filter(function (x) { return x.b.id === esc; })[0]; if (e) ops = [e].concat(ops.filter(function (x) { return x !== e; })); }
    var x0 = ops[0]; if (!x0) return null;
    return { id: x0.b.id, fabricante: x0.b.fabricante, codigo: x0.b.codigo, descricao: x0.b.descricao, norm: x0.b.norm, op: x0.op, fonte: fonteItem(x0.b), alternativas: ops.length - 1 };
  }
  /* altura máxima da autoescorvante acima da água: a da ficha do item ou a da LINHA do fabricante (pisc.fab.autoescorva) */
  function limAutoescorva(ctx, bomba) {
    if (!bomba) return { lim: null, fonte: "" };
    var lim = bomba.norm ? num(bomba.norm.altura_succao_max_m, null) : null, fl = bomba.fonte || "";
    if (lim == null) {
      var la = ctx.linhas("pisc.fab.autoescorva", null, "autoescorva") || [], cod = String(bomba.codigo || "").toUpperCase(), best = null;
      la.forEach(function (x) { if (String(x.fabricante) === String(bomba.fabricante) && cod.indexOf(String(x.prefixo).toUpperCase()) === 0 && (!best || String(x.prefixo).length > String(best.prefixo).length)) best = x; });
      if (best) { lim = num(best.altura_max_m, null); fl = fonteTxt("pisc.fab.autoescorva") + " — linha " + best.prefixo; }
    }
    return { lim: lim, fonte: fl };
  }
  /* NPSH disponível = (Patm − pv)/γ ± desnível − h_f sucção. Bomba ABAIXO do nível da água = afogada (+). */
  function npsh(ctx, par, est, bomba, tAg) {
    var H = HH(); if (!H) return null;
    var alt = num(par.altitude_m, null), T = num(tAg, GEO.tempAguaSemAquec), ag = H.agua(T), patm = H.pressaoAtmosferica(alt == null ? 0 : alt);
    var g9 = H.G, rho = ag.rho, hAtm = patm * 1000 / (rho * g9), hV = ag.pv_kpa * 1000 / (rho * g9);   /* kPa → Pa */
    var yB = est.yBomba, yA = est.yAgua, z = (yB != null && yA != null) ? yA - yB : null;
    var obs = [];
    if (alt == null) obs.push("altitude do local não informada: pressão atmosférica ao nível do mar (o NPSH real é MENOR em altitude) — informe a altitude");
    if (z == null) obs.push("cota da bomba ainda não definida (a casa de máquinas não foi lançada): desnível não somado");
    var disp = hAtm - hV + num(z, 0) - num(est.hs, 0);
    var req = bomba && bomba.norm ? num(bomba.norm.npshr_m, null) : null;
    if (req == null) obs.push("NPSH requerido não publicado em tabela pelo fabricante: conferir na curva (pendente)");
    var ok = req != null && alt != null && z != null ? disp > req + EPS : null;
    var out = { disp: r4(disp), req: req, ok: ok, hAtm: r4(hAtm), hVapor: r4(hV), desnivel: z == null ? null : r4(z), hfSuccao: r4(num(est.hs, 0)), afogada: z != null ? z > 0 : null, obs: obs.join("; ") };
    /* bomba ACIMA da água: a autoescorvante tem limite de altura de sucção (fabricante) */
    if (z != null && z < 0) {
      var LA = limAutoescorva(ctx, bomba), lim = LA.lim, fl = LA.fonte;
      /* a altura GEOMÉTRICA da bomba acima da água é o que o fabricante limita (a perda da sucção entra no NPSH) */
      out.alturaSuccao = { valor: r4(-z), limite: lim, ok: lim == null ? null : -z <= lim + EPS, fonte: fl };
    }
    return out;
  }

  var HidPiscina = {
    VERSAO: 1, GEO: GEO,
    geometria: geometria, reconhecer: reconhecer, candidatosDoModelo: candidatosDoModelo, daOp: daOp, dentro: dentro, area2: area2, centroide: centroide, eixoPrincipal: eixoPrincipal,
    dimensionar: dimensionar, linhaDn: linhaDn, deConexao: deConexao, perdaLinha: perdaLinha, hDaCurva: hDaCurva, pontoOperacao: pontoOperacao, escolherBomba: escolherBomba, npsh: npsh,
    estimativaAmt: estimativaAmt, catalogo: catalogo, fonteItem: fonteItem, fonteTxt: fonteTxt,
    _int: { velocidade: velocidade, diDe: diDe, leq: leq, tempoMax: tempoMax, tipologia: tipologia, param: param }
  };
  global.HidPiscina = HidPiscina;
  if (typeof module !== "undefined" && module.exports) module.exports = HidPiscina;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
