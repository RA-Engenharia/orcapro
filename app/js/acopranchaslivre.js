/* =====================================================================
 * acopranchaslivre.js — PRANCHAS DO PROJETO EXECUTIVO DA ESTRUTURA DE AÇO
 * DESENHADA (Cálculo › Estrutura desenhada) e o DXF de cada folha. Motor
 * PURO, ES5, sem DOM. 14/10/2026 (frente S5, Metálica).
 *
 * Pedido do Rogério: "para gerar as pranchas ele pede para gerar o memorial
 * lá no primeiro (o assistente), e aquele só faz galpão pré-configurado" —
 * agora as pranchas saem do resultado da estrutura desenhada, sem o
 * assistente do galpão.
 *
 *   AcoPranchasLivre.gerar(r, opcoes) → { ok, folhas: [{ id, rotulo,
 *       numero, titulo, formato, escala, svg, ent }], avisos }
 *     r      = o resultado do AcoDimLivre.calcular (tipo "livre")
 *     opcoes = as do js/acopranchas.js (empresa, responsavel, registro,
 *              obra, proprietario, contratante, local, codigo, revisao,
 *              data, formato, logo) + ligacoes (as do
 *              MetalLigSugUI.ligacoesComCalculo: tipologia, resumo, razão,
 *              dimensões da placa de base) + fundacoes (estado.fundacoes)
 *   AcoPranchasLivre.dxf(folha) → o DXF (R2000, mm de papel 1:1) da folha:
 *       camadas do Padrão RA (EST-FORMA-CORTE, EST-COTA, EST-EIXO…) com a
 *       espessura da pena (grupo 370) e a cor do CTB (ACI do Padrão RA),
 *       texto na RomanS (estilo RA_TQS, romans.shx), o carimbo RA com as
 *       camadas do gabarito (RA-CARIMBO-*), seção cortada cheia (SOLID).
 *
 * AS FOLHAS (o jogo inteiro, sem ninguém escolher vista nem escala):
 *   01 LOCAÇÃO DOS PILARES E DOS CHUMBADORES — eixos com balões, cotas
 *      parciais e totais (mm), pilares pela seção, a marca e o eixo
 *      ("P1 · A-1"), as fundações do modelo, a placa e os chumbadores de
 *      cada base e o QUADRO DE CARGAS NA FUNDAÇÃO (envoltória ELU e os
 *      valores característicos por caso);
 *   02… PLANTA DE CADA NÍVEL — vigas, terças, contraventamentos, pilares
 *      que chegam, as marcas e o quadro das peças do nível;
 *   03… ELEVAÇÕES de cada eixo/face com pilares (vista de fora), níveis e
 *      cotas;
 *   04 DETALHES — a placa de base típica (planta e corte, chumbadores,
 *      graute) e o quadro das LIGAÇÕES APLICADAS (tipologia, parafusos,
 *      razão, situação) — o que não foi dimensionado sai em VERMELHO;
 *   05 LISTA DE MATERIAIS — peça a peça (marca, perfil, comprimento, peso)
 *      e o resumo por perfil; o total é o peso do cálculo.
 * Papel, moldura e o CARIMBO RA (intocável) vêm do js/prancha.js; penas,
 * letra e alturas do Padrão RA de detalhamento (js/padraodet.js) — os
 * mesmos do js/acopranchas.js (Desenho, estilo, carimbo reaproveitados:
 * as pranchas do galpão não mudam). Cálculo não aprovado → "NÃO EMITIR"
 * em vermelho em todas as folhas, com o motivo.
 * Teste: node tools/test-aco-pranchas-livre.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function AP() { return dep("AcoPranchas", "./acopranchas.js"); }
  function PR() { return dep("Prancha", "./prancha.js"); }
  function PD() { return dep("PadraoDet", "./padraodet.js"); }
  function EV() { return dep("AcoEnvoltorio", "./acoenvoltorio.js"); }
  function BD() { return dep("BimDxf", "./bimdxf.js"); }
  function LT() { return dep("AcoLigTipos", "./acoligtipos.js"); }
  function nomeCurto(id) { return nomeTipologia(id).replace(/\s*\([^)]*\)\s*$/, ""); }
  function nomeTipologia(id) { var T = LT(), t = null; try { t = T && T.obter ? T.obter(id) : null; } catch (e) { t = null; } return t && t.nome ? t.nome : txt(id); }
  function num(v, d) { if (v == null || v === "") return d; var x = Number(v); return isFinite(x) ? x : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function hip(x, y) { return Math.sqrt(x * x + y * y); }
  function dois(k) { return ("0" + k).slice(-2); }
  function br(v, c) {
    if (v == null || !isFinite(v)) return "-";
    c = c == null ? 2 : c;
    var s = (Math.round(v * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c), neg = s.charAt(0) === "-";
    if (neg) s = s.slice(1); if (/^0(\.0*)?$/.test(s)) neg = false;
    var p = s.split("."), ip = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return (neg ? "-" : "") + ip + (p[1] ? "," + p[1] : "");
  }
  function mm(v) { return String(Math.round(v * 1000)); }
  function perfilCurto(nome) { return txt(nome).replace(/\s+(Gerdau|ArcelorMittal|Usiminas|VMB|Tuper|AISC)\b.*$/i, "").replace(/^([A-Z]+)(\d)/, "$1 $2").replace(/X/g, " x ").replace(/\s+/g, " ").replace(/(\d)\.(\d)/g, "$1,$2").trim(); }
  function nivelTxt(y) { return (y >= 0 ? "+" : "") + br(y, 3); }
  var VERMELHO = "#c00000";
  var OV = 34;

  /* ================================================================ O DESENHO QUE GRAVA AS ENTIDADES (para o DXF)
   * O Desenho do js/acopranchas.js escreve o SVG; aqui cada primitiva também guarda a entidade (camada, pontos, texto)
   * em mm de papel — o DXF sai do MESMO desenho que a folha da tela e o PDF. */
  function novoDesenho(E, caixas) {
    var A = AP(), D = new A.Desenho(E, caixas || null), base = A.Desenho.prototype;
    D.ent = [];
    D.linha = function (x1, y1, x2, y2, cam, extra) { this.ent.push({ t: "L", c: cam, p: [x1, y1, x2, y2] }); return base.linha.call(this, x1, y1, x2, y2, cam, extra); };
    D.poli = function (l, cam, f, extra) { this.ent.push({ t: "P", c: cam, pts: l.map(function (q) { return [q[0], q[1]]; }), f: !!f }); return base.poli.call(this, l, cam, f, extra); };
    D.ret = function (x, y, w, h, cam, extra) { var X0 = w < 0 ? x + w : x, Y0 = h < 0 ? y + h : y, W = Math.abs(w), H = Math.abs(h); this.ent.push({ t: "P", c: cam, pts: [[X0, Y0], [X0 + W, Y0], [X0 + W, Y0 + H], [X0, Y0 + H]], f: true }); return base.ret.call(this, x, y, w, h, cam, extra); };
    D.circ = function (cx, cy, r, cam, extra) { this.ent.push({ t: "C", c: cam, x: cx, y: cy, r: r }); return base.circ.call(this, cx, cy, r, cam, extra); };
    D.cheio = function (l, cor, extra) { this.ent.push({ t: "S", c: cor === VERMELHO ? "MET-PEND" : "MET-CHEIO", pts: l.map(function (q) { return [q[0], q[1]]; }) }); return base.cheio.call(this, l, cor, extra); };
    D.ponto = function (cx, cy, r, cor) { this.ent.push({ t: "S", c: cor === VERMELHO ? "MET-PEND" : "MET-CHEIO", pts: [0, 1, 2, 3, 4, 5, 6, 7].map(function (k) { return [cx + r * Math.cos(k * Math.PI / 4), cy + r * Math.sin(k * Math.PI / 4)]; }) }); return base.ponto.call(this, cx, cy, r, cor); };
    D.texto = function (x, y, s, h, o) {
      o = o || {}; var s2 = txt(s); if (!s2) return 0;
      this.ent.push({ t: "T", c: o.cor === VERMELHO ? "MET-PEND" : (o.camada || (h >= E.T.titulo - 0.01 ? "MET-TITULO" : "MET-TEXTO")), x: x, y: o.meio ? y + 0.37 * h : y, s: s2, h: h, al: o.al || "E", rot: o.rot || 0 });
      return base.texto.call(this, x, y, s, h, o);
    };
    return D;
  }

  /* ================================================================ OS DADOS DO DESENHO */
  function extrair(r, op, avisos) {
    var G = r.modelo, E = EV(), env = r.envoltorio || (E ? E.ler(G, { eixos: op.eixos }) : null);
    var membros = arr(G.membros).map(function (m) {
      var mm0 = (m.secao && m.secao.mm) || {};
      return { id: m.id, peca: m.peca, nome: m.nome, papel: m.papelLivre, a: m.a, b: m.b, L: m.L, perfil: m.secao ? m.secao.nome : "", massa: num(m.secao && m.secao.massa, num(mm0.massa, 0)),
               d: num(mm0.d, 200) / 1000, bf: num(mm0.bf, num(mm0.b, 100)) / 1000, tw: num(mm0.tw, 6) / 1000, tf: num(mm0.tf, 9) / 1000, forma: mm0.forma || "", ey: m.ey || [0, 1, 0], aco: m.aco && (m.aco.id || m.aco) };
    });
    var pil = membros.filter(function (m) { return m.papel === "pilar"; }).map(function (m) { var lo = m.a[1] <= m.b[1] ? m.a : m.b, hi = lo === m.a ? m.b : m.a; return { m: m, x: lo[0], z: lo[2], base: lo[1], topo: hi[1] }; });
    var eixos = env ? arr(env.eixos) : [];
    if (!eixos.length && pil.length && E) eixos = E.eixos(G, op.eixos);
    var marca = function (x, z) { return E ? E.marcaPilar(eixos, x, z) : ""; };
    pil.forEach(function (p) { p.eixo = marca(p.x, p.z); });
    var xs = [], zs = [];
    membros.forEach(function (m) { xs.push(m.a[0], m.b[0]); zs.push(m.a[2], m.b[2]); });
    eixos.forEach(function (e) { if (e.dir === "x") xs.push(e.c); else zs.push(e.c); });
    var cx = { x0: Math.min.apply(null, xs), x1: Math.max.apply(null, xs), z0: Math.min.apply(null, zs), z1: Math.max.apply(null, zs) };
    var niveis = env ? arr(env.niveis) : [];
    /* as ligações (com o cálculo) por peça */
    var ligs = arr(op.ligacoes).filter(function (l) { return l && l.info; });
    var bases = arr(G.bases).map(function (b) {
      var p = pil.filter(function (q) { return q.m.peca === b.peca; })[0], lb = ligs.filter(function (l) { var pp = arr(l.info.pecas).map(String); return pp.length === 1 && pp[0] === String(b.peca) && /^base-/.test(String(l.info.tipologia || "")); })[0] || null;
      return { b: b, p: p, lig: lb, dim: lb && lb.resultado && lb.resultado.dimensoes ? lb.resultado.dimensoes : null };
    });
    var fund = arr(op.fundacoes).filter(function (f) { return f && f.tipoFundacao !== "estaca" && isFinite(+f.x) && isFinite(+f.z); });
    return { r: r, G: G, env: env, membros: membros, pil: pil, eixos: eixos, caixa: cx, niveis: niveis, ligs: ligs, bases: bases, fund: fund };
  }

  /* ================================================================ PLANTA (eixos, cotas, pilares) */
  function escolher(lista, ok) { for (var i = 0; i < lista.length; i++) if (ok(lista[i])) return lista[i]; return lista[lista.length - 1]; }
  function plantaEixos(D, d, X, Z, cxp) {
    var top = Z(d.caixa.z0), bot = Z(d.caixa.z1), lef = X(d.caixa.x0), rig = X(d.caixa.x1);
    d.eixos.forEach(function (e) {
      if (e.dir === "x") { var px = X(e.c), r = D.raioBalao(e.nome); D.linha(px, top - 30 + r, px, bot + 30 - r, "MET-EIXO"); D.balao(px, top - 30, e.nome); D.balao(px, bot + 30, e.nome); }
      else { var pz = Z(e.c), r2 = D.raioBalao(e.nome); D.linha(lef - 30 + r2, pz, rig + 30 - r2, pz, "MET-EIXO"); D.balao(lef - 30, pz, e.nome); D.balao(rig + 30, pz, e.nome); }
    });
    /* cotas entre eixos: em cima (x) e à esquerda (z), parciais e total */
    var ex = d.eixos.filter(function (e) { return e.dir === "x"; }).map(function (e) { return e.c; }).sort(function (a, b) { return a - b; });
    var ez = d.eixos.filter(function (e) { return e.dir === "z"; }).map(function (e) { return e.c; }).sort(function (a, b) { return a - b; });
    if (ex.length >= 2) {
      var P = ex.map(function (x) { return [X(x), top - 10]; }), parc = []; for (var i = 0; i + 1 < ex.length; i++) parc.push(mm(ex[i + 1] - ex[i]));
      D.cadeia(P, 0, parc, {}); if (ex.length > 2) D.cadeia([P[0], P[P.length - 1]], 8, [mm(ex[ex.length - 1] - ex[0])], {});
    }
    if (ez.length >= 2) {
      var Q = ez.slice().reverse().map(function (z) { return [lef - 10, Z(z)]; }), pz2 = []; for (var j = 0; j + 1 < Q.length; j++) pz2.push(mm(ez[ez.length - 1 - j] - ez[ez.length - 2 - j]));
      D.cadeia(Q, 0, pz2, {}); if (ez.length > 2) D.cadeia([Q[0], Q[Q.length - 1]], 8, [mm(ez[ez.length - 1] - ez[0])], {});
    }
  }
  function secaoPilar(D, p, X, Z, s, rotulo) {
    var m = p.m, cx = X(p.x), cy = Z(p.z), dd = Math.max(0.6, m.d * s), bb = Math.max(0.6, m.bf * s), depX = Math.abs(m.ey[0]) >= Math.abs(m.ey[2]);
    if (/^(I|H|W)/.test(m.forma) || m.forma === "I") D.secaoI(cx, cy, dd, bb, Math.max(0.25, m.tw * s), Math.max(0.25, m.tf * s), { rot: depX });
    else { var w = depX ? dd : bb, h = depX ? bb : dd; D.cheio([[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]]); }
    if (rotulo) D.texto(cx + Math.max(dd, bb) / 2 + 1.6, cy - Math.max(dd, bb) / 2 - 1.2, rotulo, D.E.T.marca * 0.8, {});
  }

  /* ================================================================ FOLHA 01 — LOCAÇÃO */
  function folhaLocacao(c) {
    var D = c.D, d = c.d, a = c.geo.area, A = AP(), T = D.E.T, titH = 18;
    var dx = Math.max(1, d.caixa.x1 - d.caixa.x0), dz = Math.max(0.5, d.caixa.z1 - d.caixa.z0);
    var esc = escolher(A.PADRAO_ACO.escalas.planta, function (e) { var s0 = 1000 / e; return dx * s0 + 2 * OV + 8 <= a.w - 150 && dz * s0 + 2 * OV + titH <= a.h * 0.52; });
    var s = 1000 / esc, x0 = a.x + 4 + OV, y0 = a.y + titH + OV;
    function X(x) { return x0 + (x - d.caixa.x0) * s; } function Z(z) { return y0 + (z - d.caixa.z0) * s; }
    A.tituloVista(D, a.x + 4, a.y + 2, "PLANTA DE LOCAÇÃO DOS PILARES E DOS CHUMBADORES", "ESC 1:" + esc);
    plantaEixos(D, d, X, Z);
    /* fundações do modelo (contorno tracejado) */
    d.fund.forEach(function (f) {
      var L = num(f.largura, 0), B = num(f.comprimento, L), g = num(f.giro, 0) * Math.PI / 180, co = Math.cos(g), si = Math.sin(g), C = [num(f.x, 0), num(f.z, 0)];
      if (!(L > 0)) return;
      var P = [[-L / 2, -B / 2], [L / 2, -B / 2], [L / 2, B / 2], [-L / 2, B / 2]].map(function (q) { return [X(C[0] + q[0] * co - q[1] * si), Z(C[1] + q[0] * si + q[1] * co)]; });
      D.poli(P, "MET-OCULTA", true);
      D.texto(P[2][0] - 0.8, P[2][1] - 0.9, txt(f.id).toUpperCase() + " " + br(L, 2) + " x " + br(B, 2), T.nota * 0.8, { al: "D", cor: null });
    });
    /* pilares, placas e chumbadores */
    d.bases.forEach(function (bs) {
      var p = bs.p; if (!p) return;
      var dim = bs.dim, ch = dim && dim.chumbadores;
      if (dim) {
        var Lp = num(dim.L, 0) / 1000 * s, Bp = num(dim.B, 0) / 1000 * s, depX = Math.abs(p.m.ey[0]) >= Math.abs(p.m.ey[2]), w = depX ? Lp : Bp, h = depX ? Bp : Lp, cx = X(p.x), cy = Z(p.z);
        D.ret(cx - w / 2, cy - h / 2, w, h, "MET-SECUNDARIO");
        if (ch) { var e = num(ch.borda, 40) / 1000 * s, nl = Math.max(2, num(ch.porLado, 2)), rr = Math.max(0.35, num(ch.d, 19) / 2000 * s);
          [-1, 1].forEach(function (lado) { for (var k = 0; k < nl; k++) { var u = lado * (Lp / 2 - e), ww = -(Bp / 2 - e) + k * (Bp - 2 * e) / (nl - 1); D.circ(depX ? cx + u : cx + ww, depX ? cy + ww : cy + u, rr, "MET-FINA"); } }); }
      }
    });
    d.pil.forEach(function (p) { secaoPilar(D, p, X, Z, s, p.m.id + "  " + p.eixo); });
    /* detalhe das bases (à direita): cada placa diferente */
    var xd = x0 + dx * s + OV + 12, yd = a.y + 4, tipos = {};
    d.bases.forEach(function (bs) { if (!bs.dim) return; var k = [bs.dim.B, bs.dim.L, bs.dim.t, (bs.dim.chumbadores || {}).n, (bs.dim.chumbadores || {}).d].join("|"); (tipos[k] = tipos[k] || { dim: bs.dim, marcas: [], lig: bs.lig }).marcas.push(bs.b.mid); });
    var ks = Object.keys(tipos);
    if (ks.length && xd < a.x + a.w - 110) {
      yd += A.tituloVista(D, xd, yd, "BASES - PLACAS E CHUMBADORES", "SEM ESCALA") + 2;
      ks.forEach(function (k, i) {
        var t = tipos[k], dm = t.dim, ch2 = dm.chumbadores || {};
        yd += D.textos(xd, yd, [{ t: "BASE TIPO " + (i + 1) + " - " + t.marcas.join(", ") }, { t: "PLACA " + br(dm.B, 0) + " x " + br(dm.L, 0) + " x " + A.espChapa(dm.t) + " mm" }, { t: (ch2.n || 4) + " CHUMBADORES " + txt(ch2.id) + " " + txt(ch2.material) + ", ANCORAGEM " + br(ch2.ancoragem, 0) + " mm" }, { t: "GRAUTE SEM RETRAÇÃO 25 mm (20 A 50 mm)" }], T.nota, { wmax: a.x + a.w - xd - 4 }) + 3;
      });
    } else if (!ks.length) {
      D.textos(xd < a.x + a.w - 110 ? xd : a.x + 4, xd < a.x + a.w - 110 ? yd : y0 + dz * s + OV + 4, [{ t: "PLACAS DE BASE SEM DIMENSIONAMENTO - use Ligação inteligente / Ligar todos os nós e gere as pranchas de novo", cor: VERMELHO }], T.nota, { wmax: 120 });
    }
    /* quadro de cargas na fundação */
    var yq = Math.max(y0 + dz * s + OV + 6, yd + 4), linhas = [], R = c.r.reacoes || {};
    Object.keys(R).forEach(function (no) {
      var q = R[no], e2 = q.envELU || {}, p = d.pil.filter(function (pp) { return pp.m.peca === q.peca; })[0];
      function mx(k) { var v = arr(e2[k]); return v.length ? Math.max(Math.abs(v[0]), Math.abs(v[1])) : 0; }
      linhas.push([no, txt(q.membro), p ? p.eixo : "", txt(q.tipo), br(arr(e2.Fy)[0], 1), br(arr(e2.Fy)[1], 1), br(mx("Fx"), 1), br(mx("Fz"), 1), br(mx("Mx"), 1), br(mx("Mz"), 1)]);
    });
    if (linhas.length) {
      yq += A.tituloVista(D, a.x + 4, yq, "QUADRO DE CARGAS NA FUNDAÇÃO - ENVOLTÓRIA ELU", "VALORES DE CÁLCULO (kN, kN.m)") + 1;
      var cols = [{ t: "APOIO", w: 16 }, { t: "PILAR", w: 14 }, { t: "EIXO", w: 16 }, { t: "BASE", w: 20 }, { t: ["Fy MÍN.", "(kN)"], w: 18 }, { t: ["Fy MÁX.", "(kN)"], w: 18 }, { t: ["Hx", "(kN)"], w: 15 }, { t: ["Hz", "(kN)"], w: 15 }, { t: ["Mx", "(kN.m)"], w: 16 }, { t: ["Mz", "(kN.m)"], w: 16 }];
      var maxL = Math.max(1, Math.floor((a.y + a.h - yq - 30) / 4.6));
      var tb = D.tabela(a.x + 4, yq, cols, linhas.slice(0, maxL), {});
      if (linhas.length > maxL) D.texto(a.x + 4, yq + tb.h + 4, "... mais " + (linhas.length - maxL) + " apoio(s): ver o memorial de cálculo (reações por caso e envoltória)", T.nota, {});
      /* característicos por caso (Fy), ao lado */
      var casos = arr(c.r.casos).map(function (q) { return q.id; }).slice(0, 8), xc = a.x + 4 + tb.w + 10;
      if (casos.length && xc + 16 + casos.length * 16 <= a.x + a.w) {
        var yc = yq - 0; var lc = Object.keys(R).slice(0, maxL).map(function (no) { var pc = R[no].porCaso || {}; return [no].concat(casos.map(function (k) { return pc[k] ? br(pc[k][1], 1) : "-"; })); });
        D.tabela(xc, yc, [{ t: "APOIO", w: 16 }].concat(casos.map(function (k) { return { t: ["Fy " + k, "(kN)"], w: 16 }; })), lc, {});
        D.texto(xc, yc - 1.6, "CARACTERÍSTICOS POR CASO (Fy)", T.nota * 0.9, {});
      }
      D.textos(a.x + 4, yq + tb.h + 9, ["CONVENÇÃO: reação da fundação na estrutura, eixos do modelo (x, z horizontais; y vertical para cima). Fy > 0 = compressão na fundação; Fy < 0 = arrancamento. H e M em módulo (o sinal por caso está no memorial)."], T.nota * 0.9, { wmax: a.w - 8 });
    }
    return { escala: ks.length ? "INDICADA" : "1:" + esc };
  }

  /* ================================================================ FOLHA 02… — PLANTA DE CADA NÍVEL */
  function folhaNivel(c, nv) {
    var D = c.D, d = c.d, a = c.geo.area, A = AP(), T = D.E.T, titH = 18;
    var dx = Math.max(1, d.caixa.x1 - d.caixa.x0), dz = Math.max(0.5, d.caixa.z1 - d.caixa.z0);
    var esc = escolher(A.PADRAO_ACO.escalas.planta, function (e) { var s0 = 1000 / e; return dx * s0 + 2 * OV + 8 <= a.w - 140 && dz * s0 + 2 * OV + titH <= a.h - 12; });
    var s = 1000 / esc, x0 = a.x + 4 + OV, y0 = a.y + titH + OV;
    function X(x) { return x0 + (x - d.caixa.x0) * s; } function Z(z) { return y0 + (z - d.caixa.z0) * s; }
    A.tituloVista(D, a.x + 4, a.y + 2, "PLANTA DO NÍVEL " + nivelTxt(nv.cota) + " m", "ESC 1:" + esc);
    plantaEixos(D, d, X, Z);
    var ms = d.membros.filter(function (m) { var y = (m.a[1] + m.b[1]) / 2; return m.papel !== "pilar" && Math.abs(y - num(nv.cotaLinha, nv.cota)) <= 0.6 && Math.abs(m.a[1] - m.b[1]) < 0.6; });
    var lista = [];
    ms.forEach(function (m) {
      var p1 = [X(m.a[0]), Z(m.a[2])], p2 = [X(m.b[0]), Z(m.b[2])], L = hip(p2[0] - p1[0], p2[1] - p1[1]); if (L < 0.2) return;
      var cam = m.papel === "diagonal" ? "MET-CONTRAVENTO" : (m.papel === "terca" ? "MET-SECUNDARIO" : "MET-PRINCIPAL");
      if (m.papel === "viga" && m.bf * s > 1.2) { var ux = (p2[0] - p1[0]) / L, uy = (p2[1] - p1[1]) / L, nx = -uy * m.bf * s / 2, ny = ux * m.bf * s / 2; D.linha(p1[0] + nx, p1[1] + ny, p2[0] + nx, p2[1] + ny, cam); D.linha(p1[0] - nx, p1[1] - ny, p2[0] - nx, p2[1] - ny, cam); }
      else D.linha(p1[0], p1[1], p2[0], p2[1], cam);
      var ang = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]) * 180 / Math.PI; if (ang > 90.01) ang -= 180; if (ang < -90.01) ang += 180;
      var mx = (p1[0] + p2[0]) / 2, my = (p1[1] + p2[1]) / 2, a0 = ang * Math.PI / 180, off = Math.max(1.2, m.bf * s / 2 + 1.0);
      D.texto(mx + Math.sin(a0) * off, my - Math.cos(a0) * off, m.id, T.marca * 0.8, { al: "C", rot: ang });
      lista.push(m);
    });
    d.pil.filter(function (p) { return p.topo >= nv.cota - 0.6 && p.base <= nv.cota + 0.05; }).forEach(function (p) { secaoPilar(D, p, X, Z, s, p.m.id); });
    /* quadro das peças do nível (à direita) */
    var xq = x0 + dx * s + OV + 10;
    if (lista.length) {
      if (xq > a.x + a.w - 100) xq = a.x + a.w - 100;
      var yq = a.y + 4 + A.tituloVista(D, xq, a.y + 4, "PEÇAS DO NÍVEL", null) + 1, maxL = Math.max(1, Math.floor((a.y + a.h - yq - 6) / 4.6));
      D.tabela(xq, yq, [{ t: "MARCA", w: 14 }, { t: "PERFIL", w: 42, al: "E" }, { t: ["COMPR.", "(mm)"], w: 20 }, { t: "PAPEL", w: 22 }], lista.slice(0, maxL).map(function (m) { return [m.id, perfilCurto(m.perfil), mm(m.L), { viga: "viga", terca: "terça", diagonal: "contravent." }[m.papel] || m.papel]; }), {});
    }
    return { escala: "1:" + esc };
  }

  /* ================================================================ FOLHA 03… — ELEVAÇÕES */
  function planosElevacao(d) {
    var out = [], E = EV();
    d.eixos.forEach(function (e) {
      var ps = d.pil.filter(function (p) { return Math.abs((e.dir === "x" ? p.x : p.z) - e.c) <= 0.3; });
      if (ps.length < 2) return;
      var face = d.env ? arr(d.env.faces).filter(function (f) { return f.eixo === e.nome; })[0] : null;
      /* vista de fora: quem olha a face de fora tem a direita em r = (nz, −nx); eixo interno: x → "vista do sul", z → "vista do oeste" */
      var n = face ? face.normal : (e.dir === "x" ? [-1, 0] : [0, 1]), rr = [n[1], -n[0]];
      var vista = face ? "vista de " + { norte: "norte", sul: "sul", leste: "leste", oeste: "oeste" }[face.orientacao] : (e.dir === "x" ? "vista do oeste" : "vista do sul");
      out.push({ nome: "EIXO " + e.nome, vista: vista, origem: e.dir === "x" ? [e.c, 0] : [0, e.c], r: rr, naLinha: function (P) { return Math.abs((e.dir === "x" ? P[0] : P[2]) - e.c) <= 0.3; } });
    });
    if (d.env) arr(d.env.faces).forEach(function (f) {
      if (f.eixo || arr(f.pilares).length < 2) return;
      var u = [f.b[0] - f.a[0], f.b[1] - f.a[1]], L = hip(u[0], u[1]); if (!(L > 0)) return; u = [u[0] / L, u[1] / L];
      out.push({ nome: f.nome.toUpperCase(), vista: "vista de fora", origem: f.a, r: [f.normal[1], -f.normal[0]], naLinha: function (P) { var t = (P[0] - f.a[0]) * u[0] + (P[2] - f.a[1]) * u[1], q = [f.a[0] + u[0] * t - P[0], f.a[1] + u[1] * t - P[2]]; return hip(q[0], q[1]) <= 0.3; } });
    });
    return out;
  }
  function desenharElevacao(D, d, pl, x0, yBase, s, smin) {
    var T = D.E.T, ms = d.membros.filter(function (m) { return pl.naLinha(m.a) && pl.naLinha(m.b); });
    function S(P) { return x0 + ((P[0] - pl.origem[0]) * pl.r[0] + (P[2] - pl.origem[1]) * pl.r[1] - smin) * s; }
    function Y(y) { return yBase - (y - d.y0) * s; }
    ms.forEach(function (m) {
      var cam = m.papel === "diagonal" ? "MET-CONTRAVENTO" : "MET-PRINCIPAL", p1 = [S(m.a), Y(m.a[1])], p2 = [S(m.b), Y(m.b[1])];
      if ((m.papel === "pilar" || m.papel === "viga") && m.d * s > 1.0) {
        var L = hip(p2[0] - p1[0], p2[1] - p1[1]); if (L < 0.2) return;
        var ux = (p2[0] - p1[0]) / L, uy = (p2[1] - p1[1]) / L, hw = (m.papel === "pilar" ? m.bf : m.d) * s / 2, nx = -uy * hw, ny = ux * hw;
        /* a viga com o topo na linha de cálculo desce a altura da seção; com a linha no EIXO do perfil (a ligação desenhada
           passou a linha ao eixo: o topo do nível fica meia altura acima) ela fica centrada */
        var yl = (m.a[1] + m.b[1]) / 2, nvT = arr(d.niveis).filter(function (q) { return Math.abs(q.cota - yl - m.d / 2) <= 0.03; })[0];
        var dy = m.papel === "viga" ? (nvT ? 0 : hw) : 0;
        D.poli([[p1[0] + nx, p1[1] + ny + dy], [p2[0] + nx, p2[1] + ny + dy], [p2[0] - nx, p2[1] - ny + dy], [p1[0] - nx, p1[1] - ny + dy]], cam, true);
      } else D.linha(p1[0], p1[1], p2[0], p2[1], cam);
      /* a diagonal leva a marca a 1/4 do comprimento a partir da ponta de baixo (as duas do X se cruzam no meio) */
      var tM = m.papel === "diagonal" ? (p1[1] >= p2[1] ? 0.25 : 0.75) : 0.5, mx = p1[0] + (p2[0] - p1[0]) * tM, my = p1[1] + (p2[1] - p1[1]) * tM;
      var offP = m.papel === "pilar" ? Math.max(1.2, m.bf * s / 2) + 2.6 : 0, offV = m.papel === "viga" ? -1.6 : -2.4;
      D.texto(mx + offP, my + (m.papel === "pilar" ? 0 : offV), m.id + (m.papel === "pilar" || m.papel === "viga" ? " " + perfilCurto(m.perfil) : ""), T.marca * 0.72, { al: m.papel === "pilar" ? "E" : "C", rot: m.papel === "pilar" ? -90 : 0 });
    });
    /* níveis e cotas */
    /* níveis: as pontas dos pilares e das vigas (a viga com a linha no eixo do perfil marca o TOPO do aço do nível) */
    var ys = [d.y0]; ms.forEach(function (m) {
      if (m.papel === "diagonal") return;
      var yl = (m.a[1] + m.b[1]) / 2, nvT = m.papel === "viga" ? arr(d.niveis).filter(function (q) { return Math.abs(q.cota - yl - m.d / 2) <= 0.03; })[0] : null;
      (nvT ? [nvT.cota] : [m.a[1], m.b[1]]).forEach(function (y) { if (!ys.some(function (q) { return Math.abs(q - y) < 0.01; })) ys.push(y); });
    });
    ys.sort(function (a, b) { return a - b; });
    var xs = ms.filter(function (m) { return m.papel === "pilar"; }).map(function (m) { return S(m.a); }).sort(function (a, b) { return a - b; }), xmin = xs.length ? xs[0] : x0, xmax = xs.length ? xs[xs.length - 1] : x0;
    ys.forEach(function (y) { D.nivel(xmin - 12, Y(y), nivelTxt(y), -1); });
    if (xs.length >= 2) { var P = xs.map(function (x) { return [x, yBase + 6]; }), v = []; for (var i = 0; i + 1 < xs.length; i++) v.push(String(Math.round((xs[i + 1] - xs[i]) / s * 1000))); D.cadeia(P, 0, v, {}); }
    if (ys.length >= 2) { var Q = ys.map(function (y) { return [xmax + 10, Y(y)]; }).reverse(), w = []; for (var j = 0; j + 1 < Q.length; j++) w.push(String(Math.round((Q[j + 1][1] - Q[j][1]) / s * 1000))); Q.reverse(); D.cadeia(ys.map(function (y) { return [xmax + 10, Y(y)]; }), 0, ys.slice(1).map(function (y, k) { return String(Math.round((y - ys[k]) * 1000)); }), {}); }
    return ms.length;
  }
  function folhaElevacoes(c, grupo) {
    var D = c.D, d = c.d, a = c.geo.area, A = AP(), titH = 16;
    /* uma escala para todas as elevações da folha: em grade de 2 colunas */
    var cols = grupo.length > 1 ? 2 : 1, rows = Math.ceil(grupo.length / cols), cw = (a.w - 8) / cols, ch = (a.h - 4) / rows;
    var ext = grupo.map(function (pl) { var ss = []; d.membros.forEach(function (m) { if (pl.naLinha(m.a) && pl.naLinha(m.b)) [m.a, m.b].forEach(function (P) { ss.push((P[0] - pl.origem[0]) * pl.r[0] + (P[2] - pl.origem[1]) * pl.r[1]); }); }); return { mn: Math.min.apply(null, ss), mx: Math.max.apply(null, ss) }; });
    var H = Math.max(0.5, d.y1 - d.y0), Wm = Math.max.apply(null, ext.map(function (e) { return e.mx - e.mn; }).concat([1]));
    var esc = escolher(A.PADRAO_ACO.escalas.elevacao, function (e) { var s0 = 1000 / e; return Wm * s0 + 50 <= cw && H * s0 + titH + 30 <= ch; });
    var s = 1000 / esc;
    grupo.forEach(function (pl, i) {
      var col = i % cols, row = Math.floor(i / cols), xx = a.x + 4 + col * cw, yy = a.y + 2 + row * ch;
      A.tituloVista(D, xx, yy, "ELEVAÇÃO - " + pl.nome, "ESC 1:" + esc + " (" + pl.vista + ")");
      desenharElevacao(D, d, pl, xx + 26, yy + titH + 10 + H * s, s, ext[i].mn);
    });
    return { escala: "1:" + esc };
  }

  /* ================================================================ FOLHA 04 — DETALHES (placa de base e ligações) */
  function folhaDetalhes(c) {
    var D = c.D, d = c.d, a = c.geo.area, A = AP(), T = D.E.T, x = a.x + 4, y = a.y + 2;
    var bt = d.bases.filter(function (b) { return b.dim; });
    if (bt.length) {
      var dm = bt[0].dim, ch = dm.chumbadores || {}, k = 1000 / 10 / 1000, B = num(dm.B, 300), L = num(dm.L, 400), t = num(dm.t, 16), dd = num(ch.d, 19.05), e = num(ch.borda, 40), nl = Math.max(2, num(ch.porLado, 2)), anc = num(ch.ancoragem, 300), p = bt[0].p;
      var de = Math.max(L, B) <= 700 ? 5 : 10, s = 1 / de;   /* 1:5 (placa até 700 mm) ou 1:10, em mm de papel por mm real */
      y += A.tituloVista(D, x, y, "PLACA DE BASE TÍPICA - " + bt.map(function (b) { return b.b.mid; }).join(", "), "ESC 1:" + de, 1) + 6;
      var px = x + 20, py = y + 4, W = L * s, Hh = B * s;
      D.ret(px, py, W, Hh, "MET-PERFIL-CORTE");
      if (p) D.secaoI(px + W / 2, py + Hh / 2, p.m.d * 1000 * s, p.m.bf * 1000 * s, Math.max(0.3, p.m.tw * 1000 * s), Math.max(0.3, p.m.tf * 1000 * s), { rot: true });
      [-1, 1].forEach(function (lado) { for (var q = 0; q < nl; q++) { var u = lado * (L / 2 - e), w = -(B / 2 - e) + q * (B - 2 * e) / (nl - 1); D.furo(px + W / 2 + u * s, py + Hh / 2 + w * s, (dd + 6) / 2 * s); } });
      D.cota(px, py + Hh, px + W, py + Hh, -8, String(Math.round(L)), {});
      D.cota(px + W, py + Hh, px + W, py, -8, String(Math.round(B)), {});
      D.cota(px, py, px + e * s, py, 6, String(Math.round(e)), {});
      /* corte: placa, graute, chumbador com gancho e o topo da fundação */
      var cx0 = px + W + 40, cy0 = py + 6, gr = 25 * s, ca = anc * s;
      D.ret(cx0, cy0, W, t * s, "MET-PERFIL-CORTE");
      D.hachura(cx0, cy0 + t * s, W, gr, 1.2, "MET-HACHURA");
      D.linha(cx0 - 12, cy0 + t * s + gr, cx0 + W + 12, cy0 + t * s + gr, "MET-CONTEXTO");
      [-1, 1].forEach(function (lado) { var xb = cx0 + W / 2 + lado * (L / 2 - e) * s; D.linha(xb, cy0 - 3, xb, cy0 + t * s + gr + ca, "MET-SECUNDARIO"); D.linha(xb, cy0 + t * s + gr + ca, xb - lado * 4 * dd * s, cy0 + t * s + gr + ca, "MET-SECUNDARIO"); });
      D.cota(cx0 + W + 4, cy0 + t * s + gr, cx0 + W + 4, cy0 + t * s + gr + ca, -6, String(Math.round(anc)), {});
      D.textos(cx0, cy0 + t * s + gr + ca + 8, ["PLACA " + br(B, 0) + " x " + br(L, 0) + " x " + A.espChapa(t) + " mm", nl * 2 + " CHUMBADORES " + txt(ch.id) + " " + txt(ch.material) + " COM GANCHO", "ANCORAGEM " + br(anc, 0) + " mm NO CONCRETO (TOPO DA FUNDAÇÃO)", "GRAUTE SEM RETRAÇÃO 25 mm (ACEITO 20 A 50 mm)", "FUROS DA PLACA Ø " + br(dd + 6, 0) + " mm (ALARGADOS) + ARRUELA DE CHAPA"], T.nota, { wmax: 120 });
      y = Math.max(py + Hh + 18, cy0 + t * s + gr + ca + 46);
    } else {
      D.textos(x, y + 6, [{ t: "PLACA DE BASE SEM DIMENSIONAMENTO - os esforços estão no quadro de cargas (folha 01) e no memorial; use Ligação inteligente / Ligar todos os nós e gere as pranchas de novo.", cor: VERMELHO }], T.nota, { wmax: a.w - 8 });
      y += 20;
    }
    /* DETALHES DAS LIGAÇÕES aplicadas: um por tipologia (a 1ª de cada; os encontros iguais listados) — chapa simples e
       barra redonda desenhadas pelas dimensões do cálculo; as outras com o detalhe por extenso (o desenho 3D da ligação
       está no modelo) */
    var porPecaD = {}; d.membros.forEach(function (m) { porPecaD[String(m.peca)] = m; });
    var tipos = [], visto = {};
    d.ligs.forEach(function (l) {
      var tp = String(l.info.tipologia || ""); if (!tp || /^base-/.test(tp)) return;
      var enc = arr(l.info.pecas).map(function (q) { var mm0 = porPecaD[String(q)]; return mm0 ? mm0.id : String(q); }).join(" x ");
      if (!visto[tp]) { visto[tp] = { tp: tp, l: l, encs: [] }; tipos.push(visto[tp]); }
      visto[tp].encs.push(enc);
    });
    if (tipos.length) {
      var cw = 150, ch = 104, cols = Math.max(1, Math.floor((a.w - 8) / (cw + 6))), y0d = y;
      tipos.forEach(function (tp, i) {
        var cx0 = x + (i % cols) * (cw + 6), cy0 = y0d + Math.floor(i / cols) * (ch + 6);
        if (cy0 + ch > a.y + a.h - 40) return;
        detLigacao(D, tp, i + 2, cx0, cy0, cw, ch, porPecaD);
      });
      y = y0d + Math.ceil(Math.min(tipos.length, cols * Math.max(1, Math.floor((a.y + a.h - 40 - y0d) / (ch + 6)))) / cols) * (ch + 6) + 4;
    }
    /* quadro das ligações aplicadas */
    var porPeca = {}; d.membros.forEach(function (m) { porPeca[String(m.peca)] = m.id; });
    var L0 = d.ligs.map(function (l) {
      var res = l.resultado || {}, enc = arr(l.info.pecas).map(function (q) { return porPeca[String(q)] || String(q); }).join(" x ");
      return [enc, { t: nomeCurto(l.info.tipologia) }, { t: txt(res.resumo || "").slice(0, 120) }, br(num(res.razao, NaN), 2), res.ok ? "ATENDE" : { t: "NÃO ATENDE", cor: VERMELHO }];
    });
    y += A.tituloVista(D, x, y, "LIGAÇÕES APLICADAS NO MODELO", "DIMENSIONADAS COM OS ESFORÇOS DESTE CÁLCULO") + 1;
    if (L0.length) {
      var maxL = Math.max(1, Math.floor((a.y + a.h - y - 10) / 4.6));
      D.tabela(x, y, [{ t: "ENCONTRO", w: 34 }, { t: "TIPOLOGIA", w: 70, al: "E" }, { t: "DETALHE (PARAFUSOS, CHAPAS, SOLDA)", w: Math.min(330, a.w - 8 - 34 - 70 - 18 - 26), al: "E" }, { t: "RAZÃO", w: 18 }, { t: "SITUAÇÃO", w: 26 }], L0.slice(0, maxL), {});
      if (L0.length > maxL) D.texto(x, a.y + a.h - 4, "... mais " + (L0.length - maxL) + " ligação(ões): ver o memorial (seção das ligações)", T.nota, {});
    } else D.textos(x, y + 2, [{ t: "NENHUMA LIGAÇÃO DIMENSIONADA NO MODELO - os encontros e os esforços nas pontas das barras estão no memorial de cálculo.", cor: VERMELHO }], T.nota, { wmax: a.w - 8 });
    return { escala: "INDICADA" };
  }

  /* um detalhe de ligação numa célula w × h (mm de papel), na escala 1:5 */
  function detLigacao(D, tp, numero, x, y, w, h, porPeca) {
    var A = AP(), T = D.E.T, l = tp.l, res = l.resultado || {}, dm = res.dimensoes || {}, dz = res.desenho || {};
    /* a escala do detalhe: a maior das do padrão (1:5, 1:10, 1:15, 1:20, 1:25) em que a altura do desenho cabe em ~55 mm */
    var mB0 = porPeca[String(arr(l.info.pecas)[0])], hReal = tp.tp === "talas-mesa-paraf" ? (mB0 ? mB0.d * 1000 : 250) + 2 * num(dm.t, 10) + 20 : (tp.tp === "chapa-simples" ? Math.max(num(dm.altura, 100) + 60, mB0 ? mB0.d * 1000 : 250) + 20 : 200);
    var eDet = escolher(A.PADRAO_ACO.escalas.detalhe, function (e) { return hReal / e <= 55; }), s = 1 / eDet;
    var titulo = nomeCurto(tp.tp).toUpperCase();
    var hT = A.tituloVista(D, x, y, titulo.length > 46 ? titulo.slice(0, 44) + "..." : titulo, "ESC 1:" + eDet, numero);
    var yy = y + hT + 2, xc = x + 8, bottom = y + h, yFimDes = yy + 50;
    var notas = [];
    if (tp.tp === "chapa-simples" && num(dm.altura, 0) > 0) {
      /* elevação: a face do apoio (corte), a chapa soldada nela, a alma da viga e os parafusos na linha a "a" do apoio */
      var mB = porPeca[String(arr(l.info.pecas)[0])], dV = Math.max(num(dm.altura, 100) + 60, mB ? mB.d * 1000 : 250), alt = num(dm.altura, 100), lar = num(dm.largura, 110), aa = num(dm.a, 75), n0 = Math.max(1, num(dm.n, 2)), passo = num(dz.passo, 0.05) * 1000;
      var xs = xc + 10, ym = yy + 6 + dV * s / 2;
      D.ret(xs - 3, yy + 2, 3, dV * s + 8, "MET-PERFIL-CORTE"); D.hachura(xs - 3, yy + 2, 3, dV * s + 8, 0.8, "MET-HACHURA");
      D.ret(xs, ym - alt * s / 2, lar * s, alt * s, "MET-PERFIL");
      var xv = xs + 12 * s, xf = Math.min(x + w - 6, xs + lar * s + 30);
      D.linha(xv, ym - dV * s / 2, xf, ym - dV * s / 2, "MET-SECUNDARIO"); D.linha(xv, ym + dV * s / 2, xf, ym + dV * s / 2, "MET-SECUNDARIO");
      D.linha(xv, ym - dV * s / 2, xv, ym + dV * s / 2, "MET-SECUNDARIO");
      D.quebra(xf, ym - dV * s / 2 - 2, xf, ym + dV * s / 2 + 2);
      for (var k = 0; k < n0; k++) D.furo(xs + aa * s, ym + (k - (n0 - 1) / 2) * passo * s, 9 * s);
      D.cota(xs, ym + alt * s / 2, xs + lar * s, ym + alt * s / 2, -6, String(Math.round(lar)), {});
      D.cota(xs + lar * s, ym + alt * s / 2, xs + lar * s, ym - alt * s / 2, -5, String(Math.round(alt)), {});
      D.solda(xs, ym - alt * s / 2 + 1.5, 300, { perna: String(num(dm.solda, 5)), lados: "ambos", ls: 9, lr: 12 });
      yFimDes = ym + dV * s / 2 + 10;
      notas = ["CHAPA " + br(lar, 0) + " x " + br(alt, 0) + " x " + A.espChapa(num(dm.t, 6.3)) + " mm SOLDADA NO APOIO (FILETE " + br(num(dm.solda, 5), 0) + " mm)", n0 + " PARAFUSOS " + txt(dm.parafuso) + " " + txt(dm.classe) + " NA ALMA DA VIGA, A " + br(aa, 0) + " mm DO APOIO"];
    } else if (tp.tp === "talas-mesa-paraf" && num(dm.comprimento, 0) > 0) {
      /* elevação: o pilar (face em corte), as talas nas duas mesas da viga (penetração total no pilar), os parafusos das
         talas (linhas ao longo da mesa) e a chapa simples na alma */
      var mV = porPeca[String(arr(l.info.pecas)[0])], dVg = mV ? mV.d * 1000 : 250, tfV = mV ? mV.tf * 1000 : 9, Lt = num(dm.comprimento, 120), tt2 = num(dm.t, 9.5), npl = Math.max(1, Math.round(num(dm.n, 4) / Math.max(1, num(dm.linhas, 2)))), pas2 = num(dz.passo, 0.05) * 1000;
      var xs2 = xc + 10, yt = yy + 8, yb = yt + dVg * s, xf2 = Math.min(x + w - 6, xs2 + Lt * s + 34);
      D.ret(xs2 - 3, yt - 8, 3, dVg * s + 16, "MET-PERFIL-CORTE"); D.hachura(xs2 - 3, yt - 8, 3, dVg * s + 16, 0.8, "MET-HACHURA");
      D.ret(xs2 + 12 * s, yt, xf2 - xs2 - 12 * s, tfV * s, "MET-SECUNDARIO"); D.ret(xs2 + 12 * s, yb - tfV * s, xf2 - xs2 - 12 * s, tfV * s, "MET-SECUNDARIO");
      D.linha(xs2 + 12 * s, yt + tfV * s, xs2 + 12 * s, yb - tfV * s, "MET-SECUNDARIO"); D.quebra(xf2, yt - 2, xf2, yb + 2);
      D.ret(xs2, yt - tt2 * s, Lt * s, tt2 * s, "MET-PERFIL"); D.ret(xs2, yb, Lt * s, tt2 * s, "MET-PERFIL");
      for (var q2 = 0; q2 < npl; q2++) { var xb = xs2 + (Lt - 25 - q2 * pas2) * s; if (xb < xs2 + 12 * s) break; D.linha(xb, yt - tt2 * s - 1.2, xb, yt + tfV * s + 1.2, "MET-FINA"); D.linha(xb, yb - tfV * s - 1.2, xb, yb + tt2 * s + 1.2, "MET-FINA"); }
      var ca = dm.chapaAlma || {}; if (num(ca.altura, 0) > 0) { var ym2 = (yt + yb) / 2; D.ret(xs2, ym2 - num(ca.altura, 100) * s / 2, num(ca.largura, 110) * s, num(ca.altura, 100) * s, "MET-PERFIL"); for (var k3 = 0; k3 < Math.max(1, num(ca.n, 2)); k3++) D.furo(xs2 + num(ca.a, 75) * s, ym2 + (k3 - (num(ca.n, 2) - 1) / 2) * 50 * s, 9 * s); }
      D.cota(xs2, yb + tt2 * s, xs2 + Lt * s, yb + tt2 * s, -5, String(Math.round(Lt)), {});
      D.solda(xs2, yt - tt2 * s / 2, 315, { perna: "", chanfro: true, lados: "ambos", cauda: "CJP", ls: 6, lr: 12 });
      yFimDes = yb + tt2 * s + 12;
      notas = ["TALAS " + br(num(dm.largura, 100), 0) + " x " + br(Lt, 0) + " x " + A.espChapa(tt2) + " mm NAS DUAS MESAS, PENETRAÇÃO TOTAL NO PILAR (CJP)", num(dm.n, 4) + " PARAFUSOS " + txt(dm.parafuso) + " POR MESA (" + num(dm.linhas, 2) + " LINHAS, GAGE " + br(num(dm.gage, 55), 0) + " mm)" + (num(ca.altura, 0) > 0 ? "; ALMA: CHAPA " + br(num(ca.largura, 110), 0) + " x " + br(num(ca.altura, 100), 0) + " x " + A.espChapa(num(ca.t, 6.3)) + " COM " + num(ca.n, 2) + " " + txt(ca.parafuso) : "")];
    } else if (tp.tp === "contravento-barra-redonda" && num(dm.d, 0) > 0) {
      /* a chapa de apoio soldada no nó, a barra no ângulo dela com arruela biselada, porca e contraporca */
      var ch2 = dm.chapa || {}, bb = num(ch2.b, 150), tt = num(ch2.t, 6.3), al = num(dm.alfa, 45) * Math.PI / 180, db = num(dm.d, 15.9);
      var x1 = xc + 8, y1 = yy + 52;
      D.ret(x1, y1, 60, 3, "MET-PERFIL-CORTE"); D.hachura(x1, y1, 60, 3, 0.8, "MET-HACHURA");
      var px0 = x1 + 22, ux = Math.cos(al), uy = -Math.sin(al), nx = -uy, ny = ux, Lc = bb * s;
      D.poli([[px0, y1], [px0 + ux * Lc, y1 + uy * Lc], [px0 + ux * Lc + nx * tt * s * 2, y1 + uy * Lc + ny * tt * s * 2], [px0 + nx * tt * s * 2, y1 + ny * tt * s * 2]], "MET-PERFIL", true);
      var bx = px0 + ux * Lc * 0.5 - nx * 4, by = y1 + uy * Lc * 0.5 - ny * 4, L2 = 24, r2 = db * s / 2 + 0.3;
      D.linha(bx - ux * 10 + nx * r2, by - uy * 10 + ny * r2, bx + ux * L2 + nx * r2, by + uy * L2 + ny * r2, "MET-SECUNDARIO");
      D.linha(bx - ux * 10 - nx * r2, by - uy * 10 - ny * r2, bx + ux * L2 - nx * r2, by + uy * L2 - ny * r2, "MET-SECUNDARIO");
      D.retRot(bx - ux * 6, by - uy * 6, ux, uy, 2.6, r2 + 1.6, "MET-SECUNDARIO");
      D.retRot(bx - ux * 9, by - uy * 9, ux, uy, 2.6, r2 + 1.6, "MET-SECUNDARIO");
      D.solda(px0 + 2, y1, 135, { perna: String(num(dm.solda, 5)), lados: "ambos", ls: 7, lr: 12 });
      yFimDes = y1 + 14;
      notas = ["BARRA REDONDA Ø " + br(db, 1) + " mm COM ROSCA, ARRUELA BISELADA, PORCA E CONTRAPORCA", "CHAPA DE APOIO " + br(bb, 0) + " x " + A.espChapa(tt) + " mm SOLDADA (FILETE " + br(num(dm.solda, 5), 0) + " mm), ÂNGULO " + br(num(dm.alfa, 45), 0) + "°"];
    } else {
      D.ret(xc, yy + 2, w - 16, 30, "MET-FINA");
      D.textos(xc + 2, yy + 4, [{ t: "DETALHE POR EXTENSO (o desenho 3D da ligação está no modelo):" }].concat(A.quebrar(txt(res.resumo || nomeTipologia(tp.tp)), T.nota, w - 22).map(function (q) { return { t: q }; })), T.nota, { wmax: w - 20 });
    }
    var yn = Math.min(bottom - 14, Math.max(yFimDes, yy + 30));
    D.textos(x + 2, yn, notas.concat(["ENCONTROS: " + tp.encs.join("; ")]).map(function (q, i2) { return { t: q, cor: i2 === notas.length && false ? VERMELHO : null }; }), T.nota * 0.85, { wmax: w - 4 });
    if (!(res.ok)) D.texto(x + w - 2, y + 4, "NÃO ATENDE", T.nota, { al: "D", cor: VERMELHO });
  }

  /* ================================================================ FOLHA 05 — LISTA DE MATERIAIS */
  function linhasMateriais(d) {
    var L = d.membros.slice().sort(function (a, b) { var o = { pilar: 0, viga: 1, terca: 2, diagonal: 3 }; return (o[a.papel] - o[b.papel]) || (a.id < b.id ? -1 : 1); });
    return L.map(function (m) { var kg = m.L * m.massa; return { m: m, kg: kg, c: [m.id, { pilar: "pilar", viga: "viga", terca: "terça", diagonal: "contravent." }[m.papel] || m.papel, perfilCurto(m.perfil), txt(m.aco).replace(/^ASTM\s*/, ""), mm(m.L), br(m.massa, 1), br(kg, 1)] }; });
  }
  function folhaMateriais(c, pagina, linhas, total) {
    var D = c.D, d = c.d, a = c.geo.area, A = AP(), x = a.x + 4, y = a.y + 2;
    y += A.tituloVista(D, x, y, "LISTA DE MATERIAIS - PERFIS" + (pagina ? " (CONTINUAÇÃO)" : ""), "PESO PELO EIXO DAS BARRAS (O DO CÁLCULO)") + 1;
    var cols = [{ t: "MARCA", w: 16 }, { t: "PAPEL", w: 24 }, { t: "PERFIL", w: 46, al: "E" }, { t: "AÇO", w: 30 }, { t: ["COMPR.", "(mm)"], w: 22 }, { t: ["MASSA", "(kg/m)"], w: 20 }, { t: ["PESO", "(kg)"], w: 22 }];
    var tb = D.tabela(x, y, cols, linhas.map(function (q) { return q.c; }), {});
    if (total) {
      var res = {}; d.membros.forEach(function (m) { var k = perfilCurto(m.perfil); (res[k] = res[k] || { n: 0, L: 0, kg: 0, massa: m.massa }); res[k].n++; res[k].L += m.L; res[k].kg += m.L * m.massa; });
      var xr = x + tb.w + 12, yr = a.y + 2, kgT = 0;
      yr += A.tituloVista(D, xr, yr, "RESUMO POR PERFIL", null) + 1;
      var lr = Object.keys(res).sort().map(function (k) { kgT += res[k].kg; return [k, String(res[k].n), br(res[k].L, 2), br(res[k].massa, 1), br(res[k].kg, 1)]; });
      lr.push({ total: ["TOTAL DOS PERFIS", "", "", "", br(kgT, 1)] });
      var t2 = D.tabela(xr, yr, [{ t: "PERFIL", w: 46, al: "E" }, { t: "PEÇAS", w: 16 }, { t: ["COMPR.", "(m)"], w: 22 }, { t: ["MASSA", "(kg/m)"], w: 20 }, { t: ["PESO", "(kg)"], w: 24 }], lr, {});
      var acr = num(c.r.cargasResumo && c.r.cargasResumo.acrescimo, 0.05);
      D.textos(xr, yr + t2.h + 6, ["Peso dos perfis = " + br(kgT, 1) + " kg (o do cálculo: " + br(c.r.peso, 1) + " kg).", "Chapas, parafusos e soldas das ligações: + " + br(acr * 100, 0) + " % no peso próprio do cálculo (premissa); quantidades no detalhamento de fabricação.", "Áreas para pintura e o quantitativo completo: Metálica > Fabricação / Listas."], c.D.E.T.nota, { wmax: Math.max(80, a.x + a.w - xr - 4) });
    }
    return { escala: "SEM ESCALA" };
  }

  /* ================================================================ NOTAS (coluna da direita) */
  function notas(c) {
    var r = c.r, d = c.d, sit = r.situacao ? r.situacao.id : (r.aprovado ? "aprovado" : "reprovado"), acos = {};
    d.membros.forEach(function (m) { if (m.aco) acos[txt(m.aco)] = true; });
    var L = ["COTAS EM MILÍMETROS E NÍVEIS EM METROS, SALVO INDICAÇÃO.", "AÇO DOS PERFIS: " + Object.keys(acos).join("; ") + ".", "NORMAS: ABNT NBR 8800, NBR 14762, NBR 6120, NBR 8681" + (r.vento ? ", NBR 6123" : "") + " (edições no memorial de cálculo).",
             "LIGAÇÕES E PLACAS DE BASE CONFORME AS FOLHAS DE DETALHE E O MEMORIAL; PARAFUSOS DE ALTA RESISTÊNCIA COM ARRUELA; SOLDA AWS A2.4 NOS DETALHES DE FABRICAÇÃO.", "CONFERIR AS COTAS NA OBRA ANTES DA FABRICAÇÃO."];
    if (r.envoltorio && r.envoltorio.situacao === "interna") L.push("ESTRUTURA DENTRO DE OUTRA EDIFICAÇÃO: SEM VENTO (DECLARADO).");
    if (arr(d.bloq).length) L.push({ t: "NÃO EMITIR: " + d.bloq.join("; ") + " (ver o memorial).", cor: VERMELHO });
    return L;
  }
  function colunaNotas(F, geo, linhas, E) {
    var col = geo.coluna, car = geo.carimbo; if (!col || geo.semColuna) return;
    var x = col.x + 3, y = col.y + 3, wmax = col.w - 6;
    F.texto(x, y + E.T.titulo * 0.76, "NOTAS", E.T.titulo, {});
    var yy = y + E.T.titulo + 3;
    linhas.forEach(function (l, i) { var it = typeof l === "object" ? l : { t: l }; yy += F.textos(x, yy, [{ t: (i + 1) + ". " + it.t, cor: it.cor }], E.T.nota * 0.9, { wmax: wmax, recuo: 3 }) + 1; });
    if (yy > car.y - 2) F.texto(x, car.y - 3, "(notas além do espaço: ver o memorial)", E.T.nota * 0.8, { cor: VERMELHO });
  }

  /* ================================================================ GERAR */
  function hoje() { var dt = new Date(); return dois(dt.getDate()) + "/" + dois(dt.getMonth() + 1) + "/" + dt.getFullYear(); }
  function gerar(r, opcoes) {
    opcoes = opcoes || {};
    var avisos = [], A = AP(), P = PR();
    if (!r || !r.ok || r.tipo !== "livre" || !r.modelo) return { ok: false, folhas: [], avisos: [(r && r.motivo) || "As pranchas saem de um cálculo da estrutura desenhada que fechou."] };
    if (!A || !A.Desenho || !P || !P.carimboRA) return { ok: false, folhas: [], avisos: ["Motores de prancha (js/acopranchas.js, js/prancha.js) não carregados."] };
    var E = A.estilo(opcoes.padrao), d = extrair(r, opcoes, avisos);
    if (!d.membros.length) return { ok: false, folhas: [], avisos: ["Resultado sem barras: não há pranchas para gerar."] };
    var ys = []; d.membros.forEach(function (m) { ys.push(m.a[1], m.b[1]); }); d.y0 = Math.min.apply(null, ys); d.y1 = Math.max.apply(null, ys);
    var sit = r.situacao ? r.situacao.id : (r.aprovado ? "aprovado" : "reprovado");
    /* REVISÃO S5 A2 (14/10/2026): emitir só com o cálculo aprovado, TODAS as ligações dimensionadas e atendendo, todas as
       bases com placa dimensionada e nenhum ajuste de cota pendente (antes: só o r.situacao — placa reprovada, ligação
       reprovada, nenhuma ligação ou graute −16 mm saíam sem "NÃO EMITIR") */
    var bloq = [];
    if (sit !== "aprovado") bloq.push(sit === "incompleto" ? "NÃO VERIFICADO: " + arr(r.naoVerificados).map(function (x) { return x.tema.toUpperCase(); }).join(", ") : "CÁLCULO REPROVADO");
    /* os encontros do modelo (nós e bases) que pedem ligação — a mesma conta do memorial */
    var MLv = dep("AcoMemorialLivre", "./acomemoriallivre.js"), encs = MLv && MLv._int && MLv._int.encontros ? MLv._int.encontros(r, d.ligs) : [];
    var encSem = encs.filter(function (e) { return !e.lig; }), encInc = encs.filter(function (e) { return e.lig && e.incoerente; });
    if (!d.ligs.length) bloq.push("LIGAÇÕES SEM DIMENSIONAMENTO");
    else {
      if (encSem.length) bloq.push(encSem.length + " ENCONTRO(S) SEM LIGAÇÃO DIMENSIONADA");
      if (d.ligs.some(function (l) { return !(l.resultado && l.resultado.ok); })) bloq.push("LIGAÇÃO QUE NÃO ATENDE");
      if (encInc.length) bloq.push("LIGAÇÃO INCOERENTE COM O CÁLCULO");
      /* REVISÃO S5 N1: verificação crítica NÃO feita (chumbador químico sem os dados do fabricante) */
      if (d.ligs.some(function (l) { return l.resultado && arr(l.resultado.naoVerificadoCritico).length; })) bloq.push("LIGAÇÃO COM VERIFICAÇÃO NÃO FEITA (CHUMBADOR QUÍMICO: DADOS DO FABRICANTE)");
      /* a mesma régua do memorial: a ligação tem de ter sido refeita com os esforços DESTE cálculo e conferir com o desenhado */
      if (d.ligs.some(function (l) { return !l.comCalculo; })) bloq.push("LIGAÇÃO NÃO REFEITA COM ESTE CÁLCULO");
      else if (d.ligs.some(function (l) { return l.confere === false; })) bloq.push("LIGAÇÃO DESENHADA DIFERENTE DO DIMENSIONADO");
    }
    if (d.bases.some(function (b) { return !b.dim; })) bloq.push("PLACA DE BASE SEM DIMENSIONAMENTO");
    else if (d.bases.some(function (b) { return b.lig && !(b.lig.resultado && b.lig.resultado.ok); })) { if (bloq.indexOf("LIGAÇÃO QUE NÃO ATENDE") < 0) bloq.push("PLACA DE BASE QUE NÃO ATENDE"); }
    if (d.ligs.some(function (l) { return l.resultado && l.resultado.ajusteCota; })) bloq.push("AJUSTE DE COTA DA FUNDAÇÃO PENDENTE");
    d.bloq = bloq;
    if (bloq.length && sit === "aprovado") avisos.push("As pranchas saem com 'NÃO EMITIR': " + bloq.join("; ") + ".");
    if (sit !== "aprovado") avisos.push("O cálculo não está aprovado (" + (sit === "incompleto" ? "incompleto: " + arr(r.naoVerificados).map(function (x) { return x.tema + " — " + x.motivo; }).join("; ") : r.falhas + " falha(s)") + "): as pranchas saem com a nota 'NÃO EMITIR'.");
    if (!d.ligs.length) avisos.push("Nenhuma ligação dimensionada no modelo: as folhas de locação e detalhes saem com a pendência em vermelho (use Ligação inteligente / Ligar todos os nós).");
    else if (d.ligs.some(function (l) { return !(l.resultado && l.resultado.ok); })) avisos.push(d.ligs.filter(function (l) { return !(l.resultado && l.resultado.ok); }).length + " ligação(ões) que NÃO atende(m) com os esforços deste cálculo: em vermelho no quadro das ligações.");
    var formato = P.FORMATOS[opcoes.formato] ? opcoes.formato : "A1", geo = P.geometria(formato, "paisagem", "RA");
    var codigo = txt(opcoes.codigo).trim() || "EST-MET", rev = (txt(opcoes.revisao).trim() || "R00").toUpperCase(), data = txt(opcoes.data).trim() || hoje();
    var defs = [{ id: "locacao", titulo: "LOCAÇÃO DOS PILARES E DOS CHUMBADORES", fn: folhaLocacao }];
    d.niveis.forEach(function (nv) { defs.push({ id: "nivel-" + nv.id, titulo: "PLANTA DO NÍVEL " + nivelTxt(nv.cota), fn: function (c) { return folhaNivel(c, nv); } }); });
    var pls = planosElevacao(d);
    for (var k = 0; k < pls.length; k += 4) (function (gr, kk) { defs.push({ id: "elevacoes" + (kk ? "-" + (kk / 4 + 1) : ""), titulo: "ELEVAÇÕES - " + gr.map(function (q) { return q.nome; }).join(", "), fn: function (c) { return folhaElevacoes(c, gr); } }); })(pls.slice(k, k + 4), k);
    if (!pls.length) avisos.push("Nenhum eixo com 2 pilares ou mais: sem folha de elevação.");
    defs.push({ id: "detalhes", titulo: "DETALHES - PLACA DE BASE E LIGAÇÕES", fn: folhaDetalhes });
    var lm = linhasMateriais(d), porPag = Math.max(10, Math.floor((geo.area.h - 30) / 4.6));
    for (var q = 0; q < lm.length; q += porPag) (function (ls, pg, ult) { defs.push({ id: "materiais" + (pg ? "-" + (pg + 1) : ""), titulo: "LISTA DE MATERIAIS" + (pg ? " (CONTINUAÇÃO)" : ""), fn: function (c) { return folhaMateriais(c, pg, ls, ult); } }); })(lm.slice(q, q + porPag), q / porPag, q + porPag >= lm.length);
    var ctx0 = { d: d, r: r, E: E, geo: geo, op: opcoes, avisos: avisos };
    var feitas = defs.map(function (def, i) {
      var D = novoDesenho(E, opcoes.depurar ? [] : null), c = {}; Object.keys(ctx0).forEach(function (kk) { c[kk] = ctx0[kk]; }); c.D = D; c.n = i + 1;
      var res = {};
      try { res = def.fn(c) || {}; } catch (e) { avisos.push("Folha " + dois(i + 1) + " (" + def.titulo + "): " + (e && e.message ? e.message : String(e))); D.texto(geo.area.x + 10, geo.area.y + 20, "ERRO AO DESENHAR ESTA FOLHA - ver avisos", E.T.titulo, { cor: VERMELHO }); }
      if (bloq.length) D.texto(geo.area.x + geo.area.w - 4, geo.area.y + geo.area.h - 4, "NÃO EMITIR - " + bloq.join(" · "), E.T.titulo, { al: "D", cor: VERMELHO });
      return { def: def, D: D, escala: res.escala || "INDICADA", rotulo: dois(i + 1) };
    });
    var emp = opcoes.empresa, empObj = emp && typeof emp === "object" ? emp : null, revNum = rev.replace(/^R/i, "") || "00";
    var pr = P.normalizar({ id: "acopranchaslivre", nome: "Estrutura metálica - projeto executivo", formato: formato, orientacao: "paisagem", origem: "metalica",
      carimbo: { modelo: "RA", empresa: empObj ? "" : txt(emp), responsavel: txt(opcoes.responsavel), registro: txt(opcoes.registro), titulo: txt(opcoes.tituloProfissional), obra: txt(opcoes.obra), proprietario: txt(opcoes.proprietario),
                 contratante: txt(opcoes.contratante), local: txt(opcoes.local), codigo: codigo, data: data, revisoes: [[revNum, txt(opcoes.descricaoRevisao) || "EMISSÃO INICIAL - PROJETO EXECUTIVO", data]] },
      folhas: feitas.map(function (f, i) { return { id: f.def.id, n: i + 1, conteudo: f.def.titulo, escala: f.escala, numero: codigo + " " + rev }; }) });
    var nt = notas(ctx0), W = geo.papel.w, H = geo.papel.h, M = geo.moldura;
    var folhas = feitas.map(function (f, i) {
      var F = novoDesenho(E), fl = pr.folhas[i];
      F.ret(M.x, M.y, M.w, M.h, "MET-MOLDURA");
      if (!geo.semColuna && geo.coluna) F.linha(geo.coluna.x, geo.coluna.y, geo.coluna.x, geo.coluna.y + geo.coluna.h, "MET-MOLDURA");
      colunaNotas(F, geo, nt, E);
      A.carimbo(F, pr, fl, geo, empObj, opcoes.logo || null, f.rotulo + "/" + dois(feitas.length));
      var numero = codigo + "-" + f.rotulo;
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + 'mm" height="' + H + 'mm" viewBox="0 0 ' + W + " " + H + '" font-family="' + A.FONTE + '" data-folha="' + f.def.id + '" data-numero="' + numero + '">' +
        "<title>" + (numero + " - " + f.def.titulo + " - " + rev).replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</title>" + '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#fff"/><g data-corpo="1">' + f.D.svg() + "</g>" + F.svg() + "</svg>";
      return { id: f.def.id, rotulo: f.rotulo, numero: numero, titulo: f.def.titulo, formato: formato, escala: f.escala, svg: svg, ent: f.D.ent.concat(F.ent), caixasTexto: opcoes.depurar ? f.D.caixas : undefined, carimbo: { pr: pr, folha: fl, geo: geo, empresa: empObj, rotulo: f.rotulo + "/" + dois(feitas.length), logo: !!opcoes.logo }, E: E };
    });
    folhas.forEach(function (f) { if (/NaN|undefined/.test(f.svg)) avisos.push("Folha " + f.numero + ": há valor inválido (NaN/undefined) no desenho."); });
    return { ok: true, folhas: folhas, avisos: avisos };
  }

  /* ================================================================ DXF DA FOLHA
   * mm de papel 1:1 ($INSUNITS 4), Y para cima (o SVG cresce para baixo: y → H − y). Camada MET-* → layer do Padrão RA
   * (PADRAO_ACO.camadas do js/acopranchas.js) com a pena (370) e a cor ACI do Padrão (o CTB do Padrão RA plota a cor na
   * pena certa); texto: estilo RA_TQS (romans.shx), a altura da maiúscula do desenho (0,72 do corpo, o mesmo tamanho que
   * a folha da tela e o PDF); o carimbo RA pelas primitivas do js/prancha.js, nas camadas RA-CARIMBO-* do gabarito. */
  var CAM_EXTRA = { "MET-MOLDURA": ["FOLHA-MOLDURA", 0.5, null, 7], "MET-PEND": ["MET-PENDENCIA", 0.25, "TRACEJADO", 1], "MET-CHEIO": ["EST-FORMA-CORTE", null, null, null], "MET-TEXTO": ["EST-TEXTO", null, null, null] };
  function camadaDxf(doc, cam, E) {
    var A = AP(), P = PD(), lay, mm0, lt = null, aci = null;
    if (CAM_EXTRA[cam]) { lay = CAM_EXTRA[cam][0]; mm0 = CAM_EXTRA[cam][1]; lt = CAM_EXTRA[cam][2]; aci = CAM_EXTRA[cam][3]; }
    else { lay = (A.PADRAO_ACO.camadas[cam]) || "EST-LINHA-FINA"; }
    var l = null; try { l = P ? P.linhaDe(P.padraoRA(), lay) : null; } catch (e) { l = null; }
    if (mm0 == null) mm0 = l ? l.mm : ((E.camadas[cam] || {}).mm || 0.18);
    if (aci == null) aci = l ? l.aci : 7;
    if (!lt && l && l.dash) lt = lay === "EST-EIXO" || lay === "EST-LIMITE" ? "TRACO-PONTO" : "TRACEJADO";
    return doc.camada(lay, mm0, lt || "CONTINUOUS", aci);
  }
  function dxf(folha) {
    var X = BD(), A = AP(), P = PR(); if (!X || !folha) return "";
    var geo = folha.carimbo.geo, H = geo.papel.h, E = folha.E, doc = X.novoDoc({ unidade: "mm" });
    doc.escala = 1;
    function Y(y) { return H - y; }
    arr(folha.ent).forEach(function (e) {
      var c = camadaDxf(doc, e.c, E);
      if (e.t === "L") doc.linha(c, e.p[0], Y(e.p[1]), e.p[2], Y(e.p[3]));
      else if (e.t === "P") doc.poli(c, e.pts.map(function (q) { return [q[0], Y(q[1])]; }), e.f);
      else if (e.t === "C") doc.circulo(c, e.x, Y(e.y), e.r);
      else if (e.t === "S") doc.hachura(c, [e.pts.map(function (q) { return [q[0], Y(q[1])]; })], null, true);
      else if (e.t === "T") {
        var w = A.largTexto(e.s, e.h), rot = -(e.rot || 0) * Math.PI / 180, x0 = e.x, y0 = e.y;
        /* "D" (direita): o DXF ancora à esquerda — recua a largura ao longo da linha do texto */
        if (e.al === "D") { x0 = e.x - w * Math.cos(rot); y0 = e.y + w * Math.sin(rot); }
        doc.texto(c, x0, Y(y0), e.h * 0.72, e.s, e.rot ? -e.rot : 0, e.al === "C");
      }
    });
    /* o carimbo RA (o mesmo da tela: js/prancha.js carimboRA), com as camadas do gabarito */
    var k = folha.carimbo, L = P.carimboRA(k.pr, k.folha, null, k.empresa || null, geo, { logos: k.logo ? 1 : 0 }), cam = P.CAMADAS_CARIMBO_RA;
    Object.keys(cam).forEach(function (nome) { doc.especificar(nome, cam[nome][1], null, cam[nome][0]); });
    function px(x) { return L.x + x; } function py(y) { return Y(L.y + y); }
    L.retangulos.forEach(function (r) { doc.poli(r.camada, [[px(r.x), py(r.y)], [px(r.x + r.w), py(r.y)], [px(r.x + r.w), py(r.y + r.h)], [px(r.x), py(r.y + r.h)]], true); });
    L.linhas.forEach(function (l) { doc.linha(l.camada, px(l.x1), py(l.y1), px(l.x2), py(l.y2)); });
    L.logos.forEach(function (b) { doc.texto("RA-CARIMBO-LOGO", px(b.x + b.w / 2), py(b.y + b.h / 2) - 1.25 * L.k, 2.5 * L.k, "[LOGO]", 0, true); });
    L.textos.forEach(function (t) { doc.texto(t.camada, px(t.x), py(t.y), t.h, t.campo === "folha" && k.rotulo ? k.rotulo : t.s, 0, t.al === "C"); });
    var s = X.escrever(doc);
    /* a letra do Padrão RA: RomanS (romans.shx), estilo RA_TQS — o mesmo texto do DXF, só o estilo trocado */
    return s.replace(/(\r?\n)RA-ARIAL(\r?\n)/g, "$1RA_TQS$2").replace(/(\r?\n)arial\.ttf(\r?\n)/g, "$1romans.shx$2");
  }

  var AcoPranchasLivre = { gerar: gerar, dxf: dxf, _int: { extrair: extrair, planosElevacao: planosElevacao, linhasMateriais: linhasMateriais, perfilCurto: perfilCurto } };
  global.AcoPranchasLivre = AcoPranchasLivre;
  if (typeof module !== "undefined" && module.exports) module.exports = AcoPranchasLivre;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
