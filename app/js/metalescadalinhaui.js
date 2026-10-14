/* =====================================================================
 * metalescadalinhaui.js — a TELA da ESCADA PUXADA POR LINHA (aba Metálica
 * & Mecânica › Acessos › "Escada por linha"; só com a prévia do modelador).
 * 14/10/2026 — frente S6.
 *
 * Quem calcula é o js/metalescadalinha.js (motor puro). Aqui:
 *   · o modo "escadaLinha" das peças prontas (js/metalprontasui.js): o 1º
 *     clique (TOPO ou PÉ, no 3D ou na planta), a linha puxada com a prévia
 *     ao vivo — VERMELHO "não chegou: faltam X m" enquanto o comprimento não
 *     vence a altura pela norma; VERDE com o resumo ao alcançar — e o 2º
 *     clique cria. O encaixe e o Orto são os da barra de baixo (estado único,
 *     js/bimbarraopcoes.js); Backspace desfaz o 1º ponto; Esc cancela.
 *   · a ALTURA: digitada no diálogo ou lida do modelo (o piso/laje de
 *     chegada no caminho; senão o nível da obra);
 *   · a ABERTURA no piso/laje de chegada (furo, recorte da borda ou o piso
 *     industrial refeito com a abertura) e o GUARDA-CORPO em volta dela —
 *     escada + abertura + guarda-corpo num LOTE só (um Ctrl+Z desfaz tudo);
 *   · a FIXAÇÃO "automática" resolvida pelo modelo: concreto embaixo/em cima
 *     → ancorada (com a espessura e o fck da laje), aço → parafusada (com a
 *     espessura do apoio), nada no topo → apoiada (pés de apoio).
 * Cores: tokens do css/app.css (tema claro e escuro).
 * ===================================================================== */
(function (global) {
  "use strict";

  var MODO = "escadaLinha";
  function E() { return global.MetalEscadaLinha || null; }
  function MP() { return global.MetalProntas || null; }
  function PU() { return global.MetalProntasUI || null; }
  function B() { return global.BIM || null; }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : d; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function br(v, c) { c = c == null ? 2 : c; return (Math.round(num(v, 0) * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }
  function r4(v) { return Math.round(v * 1e4) / 1e4; }
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }
  function toast(t, k, ms) { try { if (global.UI && global.UI.toast) global.UI.toast(t, k || "info", ms || 6000); } catch (e) {} }

  /* a escada da ferramenta: NR-12, com patamares, grade, rodapé, fixação automática nas duas pontas */
  var PRESET = { norma: "nr12", forma: "patamares", desnivel: 3.0, largura: 0.8, degrau: "grade", gradeH: 0.030, gradeT: 0.005, gradeA: 0.030, rodape: true, hRodape: 0.20,
    guarda: "dois", montante: "HSS73X5.2", corrimao: "HSS48.3X3.7", espac: 1.0, usoGuarda: "industrial", usoPiso: "escada-sem-publico", longarina: "C200X17.1",
    fixPe: "auto", fixTopo: "auto", sentidoLinha: "desce", alturaDoModelo: true, abrirPiso: true };

  /* ------------------------------------------------------------ o modelo */
  function caixas() { var U = PU(); return U ? U.caixas() : []; }
  var _els = { st: null, els: [] };
  function els() { var U = PU(), st = U ? U.estado() : null; if (_els.st !== st) { _els.st = st; _els.els = E() ? E().elementos(caixas()) : []; } return _els.els; }
  function niveis() { try { var A = global.BimArqUI; return A && A.niveis ? A.niveis().map(function (n) { return +n.elevacao || 0; }) : []; } catch (e) { return []; } }

  /* ------------------------------------------------------------ o painel do estado (vermelho / verde) */
  function painel(txt, cls) {
    if (typeof document === "undefined") return null;
    var el = document.querySelector('[data-mel="painel"]');
    if (!txt) { if (el) el.remove(); return null; }
    if (!el) {
      if (!document.getElementById("mel-css")) { var s = document.createElement("style"); s.id = "mel-css"; s.textContent = ".mel-painel{position:fixed;left:50%;bottom:64px;transform:translateX(-50%);z-index:60;max-width:min(720px,92vw);padding:8px 14px;border-radius:8px;font-size:13px;line-height:1.35;background:var(--surface);color:var(--texto);border:2px solid var(--linha);box-shadow:0 4px 18px rgba(0,0,0,.18);pointer-events:none}.mel-painel.falta{border-color:var(--vermelho);color:var(--vermelho)}.mel-painel.ok{border-color:var(--verde);color:var(--verde)}.mel-painel small{display:block;color:var(--texto-fraco);font-size:11.5px;margin-top:2px}"; document.head.appendChild(s); }
      el = document.createElement("div"); el.className = "mel-painel"; el.setAttribute("data-mel", "painel"); el.setAttribute("role", "status"); document.body.appendChild(el);
    }
    el.className = "mel-painel " + (cls || "");
    el.setAttribute("data-mel-estado", cls || "");
    el.textContent = "";
    var b = document.createElement("b"); b.textContent = txt.t; el.appendChild(b);
    if (txt.s) { var sm = document.createElement("small"); sm.textContent = txt.s; el.appendChild(sm); }
    return el;
  }

  var MetalEscadaLinhaUI = {
    MODO: MODO, PRESET: PRESET, ultimo: null, ultimaPrevia: null,
    pronto: function () { return !!(E() && MP() && PU() && PU().registrarModo); },
    /* abre o diálogo da escada (o das peças prontas) com o botão "Puxar a linha" */
    abrir: function (par) {
      var U = PU(); if (!U) return false;
      var alvo = U.prontaSelecionada();
      if (alvo && alvo.tipo === "escada" && alvo.info && alvo.info.par) return U.dialogo("escada", { alvo: alvo });
      return U.dialogo("escada", { par: par || PRESET, modosExtra: [MODO] });
    },
    /* arma direto (sem o diálogo) — e2e e atalhos */
    armar: function (par) { var U = PU(); if (!U) return false; var p = clone(MP().padrao("escada")); Object.keys(par || PRESET).forEach(function (k) { p[k] = clone((par || PRESET)[k]); }); p.y0 = U.cota(); return U.posicionar("escada", p, {}, MODO); },

    /* ------------------------------------------------------------ a conta da linha (prévia e criação) */
    calcular: function (s, p) {
      var M = E(); if (!M || !s.pts.length) return null;
      var P1 = s.pts[0], par = s.par, sentido = par.sentidoLinha === "sobe" ? "sobe" : "desce";
      var alt = M.alturas({ P1: P1, P2: p, sentido: sentido, H: par.alturaDoModelo === false ? num(par.desnivel, 0) : 0, base: P1[1], niveis: niveis(), els: els() });
      if (!alt.ok && par.alturaDoModelo !== false && num(par.desnivel, 0) > 0) alt = M.alturas({ P1: P1, P2: p, sentido: sentido, H: num(par.desnivel, 0), base: P1[1], niveis: niveis(), els: els() });
      if (!alt.ok) return { ok: false, motivo: alt.motivo };
      var base = clone(par); delete base.sentidoLinha;
      var g = M.linha({ P1: P1, P2: p, sentido: sentido, yPe: alt.yPe, yTopo: alt.yTopo, norma: par.norma, largura: par.largura, lanceMax: par.lanceMax, patamarComp: par.patamarComp, par: base });
      if (g.ok) g.alt = alt;
      if (g.ok && alt.chegada && par.abrirPiso !== false && par.patamarTopoAuto !== false) { var gp = this.comPatamarTopo(s, p, g, alt, base, sentido); if (gp) return gp; }
      return g;
    },
    /* REVISÃO S6 (Rogério, 14/10): "sempre tem que ter um PATAMAR" — a escada que sai (ou chega) pela FACE onde o piso termina
       (a projeção fica fora dele) ganha o patamar de topo no nível do piso acabado, com o comprimento da norma (lpDe: ≥ a
       largura e ≥ 0,80 m na NR-12 — NR-12, Anexo III, 12 e) dá a largura útil ≥ 0,60 m; os 0,80 m são da ABNT NBR ISO 14122-3,
       conferir); a projeção SOBRE o piso não leva patamar (o piso é o patamar) — lá a criação abre o vão */
    comPatamarTopo: function (s, p, g, alt, base, sentido) {
      var M = E(), el = alt.chegada, par = s.par, P1 = s.pts[0]; if (!M || !el || !el.poly || !g.par) return null;
      var pl = global.PerfisAco && PerfisAco.completo ? PerfisAco.completo(g.par.longarina || "C200X17.1") : null;
      var ab = M.abertura({ geo: g, el: el, largura: g.par.largura, bLong: pl && pl.bf ? pl.bf / 1000 : 0.06, folga: 0.10 });
      if (!ab || !ab.ok || ab.precisa) return null;
      var Lpt = M.lpDe(g.ajuste ? g.ajuste.norma : par.norma, num(g.par.largura, 0.8), par.patamarComp);
      var dx = p[0] - P1[0], dz = p[2] - P1[2], L = Math.sqrt(dx * dx + dz * dz); if (L < 0.05) return null;
      var u = [dx / L, dz / L], ts = M.cruzaBorda(el.poly, [P1[0], P1[2]], u), g2 = null, lp = Lpt;
      var op = { sentido: sentido, yPe: alt.yPe, yTopo: alt.yTopo, norma: par.norma, largura: par.largura, lanceMax: par.lanceMax, patamarComp: par.patamarComp, par: base };
      var I = M._int || {};
      if (sentido === "desce") {
        var tb = null; ts.forEach(function (t) { if (Math.abs(t) <= 0.60 && (tb == null || Math.abs(t) < Math.abs(tb))) tb = t; }); if (tb == null) return null;   /* clique longe da borda: não é a saída pela face */
        op.P1 = [P1[0] + u[0] * (tb + Lpt), P1[1], P1[2] + u[1] * (tb + Lpt)]; op.P2 = p;
        g2 = M.linha(op);
      } else {
        if (I.dentro && I.dentro(el.poly, P1[0], P1[2])) return null;   /* o pé embaixo do piso: a escada sobe por dentro (vão), não pela face */
        var tE = null; ts.forEach(function (t) { if (t > 0.05 && (tE == null || t < tE)) tE = t; }); if (tE == null) return null;
        op.P1 = P1; op.P2 = [P1[0] + u[0] * Math.max(0.06, tE - Lpt), p[1], P1[2] + u[1] * Math.max(0.06, tE - Lpt)];
        g2 = M.linha(op); if (g2.ok && g2.ajuste && g2.alcancou) lp = r4(tE - g2.ajuste.projecao);
      }
      if (!g2 || !g2.ok) return g2;
      g2.alt = alt; g2.patamarTopo = { L: lp, Lmin: Lpt };
      if (g2.par) { g2.par.patamarTopo = r4(lp); g2.par.patamarTopoFix = "auto"; }
      g2.texto = (g2.texto || "") + (g2.alcancou ? " + patamar de topo de " + br(lp) + " m no nível do piso (mín. " + br(Lpt) + " m)" : " (já contando o patamar de topo de " + br(Lpt) + " m)");
      return g2;
    },
    /* a fixação "auto" e o concreto/aço das pontas pelo modelo (pé e topo da escada) */
    /* PISO INDUSTRIAL: o que está embaixo de cada canto (pilarete até ele) e o concreto para a placa de base dos pilaretes */
    resolverPiso: function (par) {
      var M = E(); if (!M || !par || par.estrutura === "nenhuma") return par;
      var q = clone(par), x0 = num(q.x0, 0), y0 = num(q.y0, 0), z0 = num(q.z0, 0), th = num(q.giro, 0) * Math.PI / 180, c = Math.cos(th), sn = Math.sin(th);
      var loc = [], txt = String(q.contorno || "").trim();
      if (txt) txt.split(";").forEach(function (t) { var v = t.trim().split(/\s+/); if (v.length >= 2) { var a = num(v[0], NaN), b = num(v[1], NaN); if (isFinite(a) && isFinite(b)) loc.push([a, b]); } });
      if (loc.length < 3) loc = [[0, 0], [num(q.Lx, 2), 0], [num(q.Lx, 2), num(q.Lz, 1)], [0, num(q.Lz, 1)]];
      var es = els(), apoios = [], conc = null, nv = niveis().filter(function (v) { return v < y0 - 0.3; }), cota = nv.length ? Math.max.apply(null, nv) : 0;
      loc.forEach(function (l) {
        var wx = x0 + l[0] * c + l[1] * sn, wz = z0 - l[0] * sn + l[1] * c, ab = M.elementoAbaixo(es, wx, wz, y0);
        if (ab) { apoios.push({ x: l[0], z: l[1], tipo: "pilarete", y: ab.topo, ref: ab.id }); if (!conc && ab.material === "concreto") conc = ab; }
      });
      /* o lado do contorno que fica sobre uma VIGA DE AÇO EXISTENTE (topo no fundo do piso, alinhada): apoia nela, sem viga nova */
      var tP = q.material === "grade" ? num(q.gradeH, 0.03) : num(q.t, 0.00635), ws = loc.map(function (l) { return [x0 + l[0] * c + l[1] * sn, z0 - l[0] * sn + l[1] * c]; }), exist = [];
      ws.forEach(function (a, i) {
        var b = ws[(i + 1) % ws.length], Lb = Math.hypot(b[0] - a[0], b[1] - a[1]); if (Lb < 0.2) return;
        var v = es.filter(function (el) { if (el.tipo !== "viga" || !el.seg || /do piso$/.test(el.caixa && el.caixa.metal ? el.caixa.metal.papel || "" : "") || Math.abs(el.topo - (y0 - tP)) > 0.05) return false;
          var s0 = el.seg[0], s1 = el.seg[1], dx = s1[0] - s0[0], dz = s1[1] - s0[1], Ls = Math.hypot(dx, dz); if (Ls < 0.2) return false;
          var dist = function (q2) { return Math.abs((q2[0] - s0[0]) * dz - (q2[1] - s0[1]) * dx) / Ls; }, tt = function (q2) { return ((q2[0] - s0[0]) * dx + (q2[1] - s0[1]) * dz) / (Ls * Ls); };
          return dist(a) < 0.06 && dist(b) < 0.06 && tt(a) > -0.02 && tt(a) < 1.02 && tt(b) > -0.02 && tt(b) < 1.02; })[0];
        if (v) exist.push({ lado: i, a: loc[i], b: loc[(i + 1) % loc.length], ref: v.id });
      });
      q.bordasExistentes = exist;
      q.apoios = apoios; if (!(num(q.cotaApoio, 0) > 0)) q.cotaApoio = r4(cota);
      if (conc && !(num(q.concEsp, 0) > 0)) { q.concEsp = conc.esp; if (conc.fck && !(num(q.concFck, 0) > 0)) q.concFck = conc.fck; }
      if (conc) q.concPoly = conc.poly;   /* REVISÃO S6 (C2): o contorno da laje embaixo vai para a ancoragem dos pilaretes */
      return q;
    },
    /* na CRIAÇÃO, o piso passa pelo MESMO motor da Estrutura desenhada (vigas, pilaretes, X, 2ª ordem): a viga ou o
       pilarete que não passa sobe para o perfil seguinte (no máximo 5 rodadas) — o que nasce é o que o cálculo aprova */
    refinarPiso: function (par) {
      var M = MP(), A = global.MetalAcessos; if (!M || !A || !A.avaliar || !global.AcoDimLivre || !par || par.estrutura === "nenhuma") return par;
      var q = clone(par), log = [];
      for (var it = 0; it < 5; it++) {
        var k = 0, r = M.gerar("piso", q, function () { return "rf" + (++k); }, {}); if (!r.ok) return par;
        var av = A.avaliar(r), d = av && av.dimensionamento; if (!d || !av.estrutura) return q;
        if (av.estrutura.aprovado) { if (log.length) q.refinado = log; return q; }
        var falhas = d.verificacoes.filter(function (v) { return v.ok === false; }).map(function (v) { return v.nome || ""; }), mudou = false;
        if (falhas.some(function (n) { return /Viga de borda/.test(n); })) { q.minBorda = num(q.minBorda, 0) + 1; mudou = true; }
        if (falhas.some(function (n) { return /Viga intermediária/.test(n); })) { q.minInter = num(q.minInter, 0) + 1; mudou = true; }
        if (falhas.some(function (n) { return /Pilarete/.test(n); })) { q.minPil = num(q.minPil, 0) + 1; mudou = true; }
        if (!mudou) return q;
        log.push("rodada " + (it + 1) + ": " + falhas.length + " verificação(ões) da Estrutura desenhada não passavam — perfis acima");
      }
      return q;
    },
    resolverPar: function (tipo, par, fase) {
      if (tipo === "piso") { var pq = this.resolverPiso(par); return fase === "criar" ? this.refinarPiso(pq) : pq; }
      /* REVISÃO S6 (baixo): guarda-corpo "soldado" sobre LAJE de concreto não existe — vira chapa chumbada (dimensionada; a borda
         da laje fica crítica) com a espessura e o fck da laje desenhada */
      if (tipo === "guardacorpo" && par && par.fixacao !== "chapa" && E()) {
        var lj = E().elementoEm(els(), num(par.x0, 0), num(par.z0, 0), num(par.y0, 0), { tolH: 0.02, tolV: 0.06, tipos: ["laje"] });
        if (lj) { var qg = clone(par); qg.fixacao = "chapa"; qg.suporte = "concreto"; if (!(num(qg.concEsp, 0) > 0)) qg.concEsp = lj.esp; if (lj.fck && !(num(qg.concFck, 0) > 0)) qg.concFck = lj.fck; return qg; }
        var ac = E().elementoEm(els(), num(par.x0, 0), num(par.z0, 0), num(par.y0, 0), { tolH: 0.05, tolV: 0.10 });
        if (ac && ac.material === "aco") { var qa = clone(par); qa.suporte = "aco"; return qa; }
        return par;
      }
      if (tipo !== "escada" || !par || (!par.fixPe && !par.fixTopo)) return par;
      var M = E(); if (!M) return par;
      var q = clone(par), tp = M.topoDe(q); if (!tp) return par;
      var es = els(), c = tp.dir, pe = tp.pe, topo = tp.topo, offT = num(q.patamarTopo, 0) > 0.2 && q.patamarTopoFix ? num(q.patamarTopo, 0) : 0;
      if (offT) topo = [topo[0] + c[0] * offT, topo[1], topo[2] + c[1] * offT];   /* com patamar de topo, quem liga é a borda dele */
      /* REVISÃO S6 (Rogério, 14/10): a PEÇA ESTRUTURAL MAIS PRÓXIMA (até 0,30 m no pé e 0,50 m no topo, no nível); sem peça, os
         apoios (pés de apoio/pilaretes) */
      var apoio = M.elementoEm(es, pe[0], pe[2], pe[1], { tolH: 0.05, tolV: 0.06 }); if (!apoio && M.maisProxima) { var mpP = M.maisProxima(es, pe[0], pe[2], pe[1], { tolH: 0.30, tolV: 0.06 }); apoio = mpP ? mpP.el : null; }
      var chegada = M.elementoEm(es, topo[0] + c[0] * 0.15, topo[2] + c[1] * 0.15, topo[1], { tolH: 0.30, tolV: 0.06 }); if (!chegada && M.maisProxima) { var mpT = M.maisProxima(es, topo[0] + c[0] * 0.15, topo[2] + c[1] * 0.15, topo[1], { tolH: 0.50, tolV: 0.10 }); chegada = mpT ? mpT.el : null; }
      var au = M.fixacaoAuto({ apoioPe: apoio, chegada: chegada });
      if (q.fixPe === "auto") q.fixPe = au.pe;
      if (q.fixTopo === "auto") q.fixTopo = q.fixPe === "apoiada" && au.topo === "apoiada" ? "ancorada" : au.topo;
      if (offT && q.patamarTopoFix === "auto") q.patamarTopoFix = au.topo;
      q.pecaTopo = chegada ? { id: chegada.id, tipo: chegada.tipo, material: chegada.material } : null;
      /* REVISÃO S6 (C2): o contorno E os FUROS da laje vão para o cálculo da ancoragem; a abertura que a própria escada vai
         abrir (par._aberturaTopo, posta pela criação) entra antes — o furo novo ou o contorno recortado */
      var info = function (el) { return el ? { id: el.id, tipo: el.tipo, esp: el.esp, fck: el.fck, poly: el.poly, furos: el.furos || [], topo: el.topo, rotulo: (el.tipo === "laje" ? "Laje " : "Piso ") + el.id } : null; };
      if (apoio && apoio.material === "concreto") q.concPe = info(apoio); else delete q.concPe;
      if (chegada && chegada.material === "concreto") q.concTopo = info(chegada); else delete q.concTopo;
      var abT = par._aberturaTopo;
      if (abT && q.concTopo && abT.el === q.concTopo.id) { if (abT.contorno) q.concTopo.poly = abT.contorno; if (abT.furo) q.concTopo.furos = q.concTopo.furos.concat([abT.furo]); }
      /* REVISÃO S6 (M2): topo PARAFUSADO só onde há VIGA de aço embaixo da chapa (grade não recebe parafuso) */
      if (q.fixTopo === "parafusada" && chegada && chegada.material === "aco") {
        var temViga = abT && abT.vigaNaBorda ? true : es.some(function (v) { if (v.tipo !== "viga" || !v.seg) return false; if (Math.abs(v.topo - (topo[1] - (chegada.tipo === "piso" ? chegada.esp : 0))) > 0.06 && Math.abs(v.topo - topo[1]) > 0.06) return false; var s0 = v.seg[0], s1 = v.seg[1], dx = s1[0] - s0[0], dz = s1[1] - s0[1], Ls = Math.sqrt(dx * dx + dz * dz); if (Ls < 0.1) return false; var t = ((topo[0] - s0[0]) * dx + (topo[2] - s0[1]) * dz) / (Ls * Ls), dd = Math.abs((topo[0] - s0[0]) * dz - (topo[2] - s0[1]) * dx) / Ls; return t > -0.02 && t < 1.02 && dd < 0.12; });
        q.supTopoSemViga = !temViga;
      } else delete q.supTopoSemViga;
      var tSup = function (el) { if (!el || el.material !== "aco") return 0; if (el.tipo === "viga" && el.perfil && global.PerfisAco && PerfisAco.completo) { var sc = PerfisAco.completo(el.perfil); if (sc && sc.tf) return sc.tf; } return el.tipo === "piso" && el.esp < 0.025 ? r4(el.esp * 1000) : 0; };
      q.supPeT = tSup(apoio); q.supTopoT = tSup(chegada);
      q.fixAuto = { pe: par.fixPe === "auto" ? au.motivoPe : null, topo: par.fixTopo === "auto" ? au.motivoTopo : null };
      return q;
    },

    /* ------------------------------------------------------------ o modo das peças prontas */
    modo: function () {
      var self = this;
      return {
        rotulo: "Puxar a linha (altura a vencer)", orto: true,
        dica: function (s) {
          var t = s.pts.length ? "Escada por linha: puxe até a escada caber (vermelho = não chegou; verde = cabe) e clique. Backspace volta o 1º ponto, Esc cancela."
            : (s.par.sentidoLinha === "sobe" ? "Escada por linha: clique o PÉ da escada (ela sobe na direção que você puxar)." : "Escada por linha: clique o TOPO — a borda do piso/laje de cima (a escada desce na direção que você puxar).");
          return t + " Encaixe e Orto da barra de baixo; no 3D ou na planta.";
        },
        ponto: function (s, p, U) {
          if (!s.pts.length) { s.pts.push(p.slice()); _els.st = null; U._dica(); if (U._3d) U._3d.redesenhar(); return true; }
          var g = self.calcular(s, p);
          if (!g || !g.ok) { var m = (g && g.motivo) || "não deu para calcular a escada"; status("Escada por linha: " + m); toast(m, "aviso", 8000); return true; }
          if (!g.alcancou) { status("Escada por linha: " + g.texto); painel({ t: g.texto, s: "Puxe mais a linha — a escada só nasce quando vence a altura pela norma." }, "falta"); return true; }
          var r = self.criar(s, g);
          if (r && r.ok) { U._pos = null; painel(null); var b = B(); try { if (b && b.editarArmar) b.editarArmar(null); } catch (e) {} }
          return true;
        },
        previa: function (s, p, U) {
          if (!s.pts.length) { painel({ t: s.par.sentidoLinha === "sobe" ? "Clique o PÉ da escada" : "Clique o TOPO da escada (borda do piso de cima)", s: "Norma: " + String(s.par.norma || "nr12").toUpperCase().replace("NR12", "NR-12") }, ""); return null; }
          var g = self.calcular(s, p); self.ultimaPrevia = g ? { ok: g.ok, alcancou: !!g.alcancou, texto: g.texto || g.motivo, L: g.L, Lmin: g.ajuste ? g.ajuste.Lmin : null, falta: g.ajuste ? g.ajuste.falta : null, H: g.ajuste ? g.ajuste.H : null, fonte: g.alt ? g.alt.fonte : null, chegada: g.alt && g.alt.chegada ? g.alt.chegada.id : null } : null;
          if (!g || !g.ok) { painel({ t: (g && g.motivo) || "—" }, "falta"); return null; }
          if (!g.par) { painel({ t: g.texto }, "falta"); return null; }
          var nao = self.semAbertura(s, g);
          if (nao) { self.ultimaPrevia.alcancou = false; self.ultimaPrevia.recusa = nao; painel({ t: "A escada não nasce aqui", s: nao }, "falta"); }
          else painel({ t: g.texto, s: "Altura " + br(g.ajuste.H) + " m — " + (g.alt.fonte || "") + (g.ajuste.patamares ? " · patamar a cada " + br(E().hMaxDe(g.ajuste.norma, s.par.lanceMax)) + " m de altura (" + g.ajuste.ref.split(";")[0] + ")" : "") + (g.alt.chegada && s.par.abrirPiso !== false ? " · chega no " + (g.alt.chegada.tipo === "laje" ? "laje " : "piso ") + g.alt.chegada.id : "") }, g.alcancou ? "ok" : "falta");
          var q = clone(g.par); q.fixPe = ""; q.fixTopo = ""; q.ligacoes = false;   /* a prévia fica leve: a fixação entra na criação */
          var k = 0, r = MP().gerar("escada", q, function () { return "pl" + (++k); }, {});
          if (!r.ok) return null;
          if (!g.alcancou || nao) r.corPrevia = "--vermelho";
          return r;
        },
        pintar: function (s, p, r, api) {
          if (!s.pts.length || !p) return;
          var a = s.pts[0], g = self.ultimaPrevia, ok = g && g.alcancou;
          var l = api.linhas([a[0], a[1] + 0.02, a[2], p[0], p[1] + 0.02, p[2]], api.cor(ok ? "--verde" : "--vermelho", ok ? "#15803d" : "#c0392b"), 1);
          if (l) api.grp.add(l);
          /* a marca do comprimento MÍNIMO na linha (onde a escada passa a caber) */
          if (g && g.Lmin && g.L > 0.05) {
            var dx = (p[0] - a[0]) / g.L, dz = (p[2] - a[2]) / g.L, m = [a[0] + dx * g.Lmin, a[1] + 0.02, a[2] + dz * g.Lmin], w = [-dz * 0.25, dx * 0.25];
            var t = api.linhas([m[0] - w[0], m[1], m[2] - w[1], m[0] + w[0], m[1], m[2] + w[1]], api.cor("--verde", "#15803d"), 1); if (t) api.grp.add(t);
          }
        },
        voltar: function (s) { s.pts = []; self.ultimaPrevia = null; },
        cancelar: function () { painel(null); self.ultimaPrevia = null; }
      };
    },

    /* REVISÃO S6 rodada 3 (A2): a passagem que a tela NÃO abre (cruza a borda do piso industrial, ou a abertura não fecha) —
       o motivo, para a prévia ficar vermelha e a criação recusar; null = pode criar */
    semAbertura: function (s, g) {
      var L = E(), el = g && g.alt ? g.alt.chegada : null; if (!L || !g || !g.alcancou || !el || s.par.abrirPiso === false) return null;
      var pl = global.PerfisAco && PerfisAco.completo ? PerfisAco.completo(g.par.longarina || "C200X17.1") : null;
      var ab = L.abertura({ geo: g, el: el, largura: g.par.largura, bLong: pl && pl.bf ? pl.bf / 1000 : 0.06, folga: 0.10 });
      if (ab && !ab.ok) return ab.motivo;
      if (ab && ab.precisa && el.tipo !== "laje" && !(el.tipo === "piso" && el.prontaId)) return "a escada passa pelo " + el.tipo + " " + el.id + ", que a tela não sabe abrir: abra a passagem à mão antes (ou desligue \"abrir o piso\")";
      return null;
    },
    /* ------------------------------------------------------------ criar: escada + abertura + guarda-corpo num lote só */
    criar: function (s, g) {
      var U = PU(), M = MP(), L = E(), b = B(); if (!U || !M || !L || !b || !b.editarLote) return null;
      var par = clone(g.par); delete par.sentidoLinha;
      var extras = [], avisos = [], ab = null, el = g.alt ? g.alt.chegada : null, opsAb = [], gcAb = null;
      /* REVISÃO S6 (C2): a ABERTURA primeiro — o cálculo da fixação do topo enxerga o furo/recorte que a escada abre */
      if (el && s.par.abrirPiso !== false) {
        var pl = global.PerfisAco && PerfisAco.completo ? PerfisAco.completo(par.longarina || "C200X17.1") : null;
        ab = L.abertura({ geo: g, el: el, largura: par.largura, bLong: pl && pl.bf ? pl.bf / 1000 : 0.06, folga: 0.10 });
        if (ab && ab.ok && ab.precisa) {
          var feito = this.abrir_(el, ab, opsAb);
          if (feito.ok) {
            extras.push(feito.texto);
            if (feito.critico) { par.criticosExtra = [feito.critico]; avisos.push(feito.critico.replace(/^não verificado: /, "").replace(/ \(CRÍTICO\)$/, "")); }
            par._aberturaTopo = { el: el.id, furo: ab.modo === "furo" ? ab.poly : null, contorno: ab.modo === "recorte" ? ab.contornoNovo : null, vigaNaBorda: el.tipo === "piso" };
            gcAb = this.guardaAbertura(el, ab); if (gcAb && gcAb.ok) extras.push("guarda-corpo em " + ab.guarda.length + " lado(s) da abertura" + (gcAb.n > 1 ? " (" + gcAb.n + " trechos)" : ""));
            if (el.tipo === "laje") avisos.push("a laje " + el.id + " ganhou " + (ab.modo === "furo" ? "um furo" : "um recorte") + " de " + br(ab.comprimento) + " × " + br(ab.largura) + " m — verifique a laje com a abertura (armadura de borda do furo) no projeto de concreto");
          } else { this.recusa = feito.motivo; status("Escada por linha: " + feito.motivo); toast("A escada NÃO foi criada: " + feito.motivo, "aviso", 12000); painel({ t: "A escada não foi criada", s: feito.motivo }, "falta"); return { ok: false, motivo: feito.motivo }; }
        } else if (ab && !ab.ok) { this.recusa = ab.motivo; status("Escada por linha: " + ab.motivo); toast("A escada NÃO foi criada: " + ab.motivo, "aviso", 12000); painel({ t: "A escada não foi criada", s: ab.motivo }, "falta"); return { ok: false, motivo: ab.motivo }; }
      }
      /* REVISÃO S6 rodada 3 (A2): sem a passagem aberta a escada atravessaria o piso/laje — ela só nasce com a abertura feita */
      this.recusa = null;
      var r = U.preparar("escada", par, {}, null);
      if (!r || !r.ok) { toast("Escada por linha: " + ((r && r.motivo) || "falhou"), "aviso", 9000); return r; }
      var ops = r.op.ops.slice().concat(opsAb).concat(gcAb && gcAb.ok ? gcAb.op.ops : []);
      var lote = { op: "lote", id: String(U.novoId()), origem: "metal-escada-linha", pedido: "Escada por linha" + (extras.length ? " + abertura" : ""), ops: ops };
      if (!b.editarLote(lote)) { toast("O editor recusou a escada.", "erro"); return { ok: false }; }
      var fx = r.medidas && r.medidas.fixacao ? r.medidas.fixacao : null;
      this.ultimo = { prontaId: r.prontaId, par: r.par, resumo: r.resumo, abertura: ab && ab.precisa ? { modo: ab.modo, el: ab.el, tipo: ab.tipo, comprimento: ab.comprimento, largura: ab.largura, poly: ab.poly, guarda: (ab.guarda || []).length } : null, fixacao: fx, avisos: avisos, extras: extras, H: g.ajuste.H, n: g.ajuste.n, p: g.ajuste.p, Lmin: g.ajuste.Lmin, L: g.L, fixAuto: r.par.fixAuto || null };
      var t = "Escada criada — " + r.resumo + (extras.length ? " " + extras.join("; ") + "." : "") + (avisos.length ? " Atenção: " + avisos.join("; ") : "") + " Ctrl+Z desfaz tudo.";
      status(t); toast(t, avisos.length ? "aviso" : "ok", 12000);
      try { U.enquadrar(r); } catch (e) {}
      return r;
    },
    /* a abertura no elemento: laje do modelador (furo ou recorte) ou piso industrial (refeito com a abertura) */
    abrir_: function (el, ab, ops) {
      var U = PU(), M = MP();
      if (el.tipo === "laje" && el.caixa) {
        if (ab.modo === "furo") { ops.push({ op: "furo", id: el.id, furo: ab.poly.map(function (q) { return { x: q[0], z: q[1] }; }) }); return { ok: true, texto: "furo de " + br(ab.comprimento) + " × " + br(ab.largura) + " m na laje " + el.id }; }
        var nc = clone(el.caixa); nc.contorno = ab.contornoNovo.map(function (q) { return { x: q[0], z: q[1] }; }); delete nc.area; delete nc.volume;
        ops.push({ op: "apagar", id: el.id }, { op: "criar", id: el.id, caixa: nc });
        return { ok: true, texto: "recorte de " + br(ab.comprimento) + " × " + br(ab.largura) + " m na borda da laje " + el.id };
      }
      if (el.tipo === "piso" && el.prontaId) {
        var pr = U.pronta(el.prontaId);
        if (pr && pr.tipo === "piso" && pr.info && pr.info.par) {
          var pp = M.parParaRefazer(pr), th = num(pp.giro, 0) * Math.PI / 180, c = Math.cos(th), sn = Math.sin(th);
          var aLocal = function (q) { var dx = q[0] - pp.x0, dz = q[1] - pp.z0; return [r4(dx * c - dz * sn), r4(dx * sn + dz * c)]; };
          var locAb = ab.poly.map(aLocal);
          /* REVISÃO S6 (Rogério, 14/10): no RECORTE, a sobra de piso menor que 0,50 m entre o vão e o lado do piso vai junto (o
             vão vai até o lado): o pedaço de viga de borda de 0,3 m virava "peça solta" na Estrutura desenhada; o guarda-corpo
             que ficaria sobre a sobra retirada sai */
          if (ab.modo === "recorte" && !String(pp.contorno || "").trim() && num(pp.Lx, 0) > 0 && num(pp.Lz, 0) > 0) {
            var xs = locAb.map(function (q) { return q[0]; }), zs = locAb.map(function (q) { return q[1]; }), bx = [Math.min.apply(null, xs), Math.max.apply(null, xs), Math.min.apply(null, zs), Math.max.apply(null, zs)], LX = num(pp.Lx, 0), LZ = num(pp.Lz, 0), mudou = false;
            if (bx[0] > 1e-3 && bx[0] < 0.5) { bx[0] = -0.2; mudou = true; } if (bx[1] < LX - 1e-3 && bx[1] > LX - 0.5) { bx[1] = LX + 0.2; mudou = true; }
            if (bx[2] > 1e-3 && bx[2] < 0.5) { bx[2] = -0.2; mudou = true; } if (bx[3] < LZ - 1e-3 && bx[3] > LZ - 0.5) { bx[3] = LZ + 0.2; mudou = true; }
            if (mudou) {
              locAb = [[bx[0], bx[2]], [bx[1], bx[2]], [bx[1], bx[3]], [bx[0], bx[3]]].map(function (q) { return [r4(q[0]), r4(q[1])]; });
              ab.guarda = (ab.guarda || []).filter(function (sg) { var m = aLocal([(sg[0][0] + sg[1][0]) / 2, (sg[0][1] + sg[1][1]) / 2]); return !(m[0] > bx[0] + 0.02 && m[0] < bx[1] - 0.02 && m[1] > bx[2] + 0.02 && m[1] < bx[3] - 0.02); });
              ab.ampliado = true;
            }
          }
          pp.aberturas = (Array.isArray(pp.aberturas) ? pp.aberturas : []).concat([locAb]);
          pp.passagens = (Array.isArray(pp.passagens) ? pp.passagens : []).concat([locAb]);
          /* REVISÃO S6 (Rogério, 14/10): o piso refeito com o vão passa pelo MESMO refino da criação (a viga que não passa sobe de
             perfil) — sem isso o vão novo deixava a viga de borda reprovada e o piso saía com o CRÍTICO à toa */
          try { var ppR = this.refinarPiso(this.resolverPiso(pp)); if (ppR) pp = ppR; } catch (eR) {}
          var r2 = U.preparar("piso", pp, {}, pr);
          if (!r2 || !r2.ok) return { ok: false, motivo: "o piso " + el.prontaId + " não refez com a abertura: " + ((r2 && r2.motivo) || "") };
          r2.op.ops.forEach(function (o) { ops.push(o); });
          /* REVISÃO S6 (Rogério, 14/10): o piso refeito com o vão passa pela Estrutura desenhada; não fechando, a escada leva o
             item CRÍTICO (o vão e o guarda-corpo ficam feitos — o que falta é a estrutura do piso em volta) */
          var critP = null, AA = global.MetalAcessos;
          if (AA && AA.avaliar) { try { var avP = AA.avaliar(r2), dP = avP && avP.dimensionamento; if (!dP) critP = "não verificado: o piso industrial " + el.prontaId + " refeito com o vão da escada — a Estrutura desenhada não avaliou (CRÍTICO)"; else if (dP.status === "reprovado") { var fP = dP.verificacoes.filter(function (v) { return v.ok === false; })[0]; critP = "não verificado: o piso industrial " + el.prontaId + " refeito com o vão da escada NÃO FECHA na Estrutura desenhada (" + (fP ? String(fP.nome).replace(/^Estrutura desenhada — /, "") : "reprovado") + ") — reforce o vigamento em volta do vão ou desenhe os apoios embaixo (CRÍTICO)"; } } catch (eA) { critP = "não verificado: o piso industrial " + el.prontaId + " refeito com o vão — a avaliação falhou (CRÍTICO)"; } }
          return { ok: true, critico: critP, texto: (ab.modo === "recorte" ? "recorte de " : "abertura de ") + br(ab.comprimento) + " × " + br(ab.largura) + " m no piso industrial (refeito, com " + (ab.modo === "recorte" ? "as vigas de borda no contorno novo" : "o vigamento da abertura") + ")" };
        }
      }
      return { ok: false, motivo: "a escada chega no " + el.tipo + " " + el.id + " que não é laje por contorno nem piso industrial: abra a passagem à mão antes (ou desligue \"abrir o piso\")" };
    },
    /* GUARDA-CORPO em volta da abertura (os lados que não são a entrada), em cadeias contínuas */
    guardaAbertura: function (el, ab) {
      var U = PU(); if (!ab.guarda || !ab.guarda.length) return null;
      /* REVISÃO S6 (Rogério, 14/10): uma peça de guarda-corpo por CADEIA contínua (no recorte os dois lados ficam soltos) */
      var cadeias = [], cur = null;
      ab.guarda.forEach(function (g) { var u = cur ? cur[cur.length - 1] : null; if (u && Math.hypot(g[0][0] - u[0], g[0][1] - u[1]) < 1e-3) cur.push(g[1]); else { cur = [g[0], g[1]]; cadeias.push(cur); } });
      var self = this, rs = cadeias.map(function (c) { return self.guardaCadeia(el, c); }).filter(function (r) { return r && r.ok; });
      if (!rs.length) return null;
      return { ok: true, n: rs.length, op: { ops: rs.reduce(function (o, r) { return o.concat(r.op.ops); }, []) } };
    },
    guardaCadeia: function (el, pts) {
      var U = PU();
      var a = pts[0], par = { caminho: pts.map(function (q) { return br(q[0] - a[0], 3) + " " + br(q[1] - a[1], 3); }).join("; "), x0: a[0], y0: el.topo, z0: a[1], giro: 0, norma: "nr12", usoGuarda: "industrial", fixacao: el.material === "concreto" ? "chapa" : "solda" };
      return U.preparar("guardacorpo", par, {}, null);
    },

    /* MEMORIAL da Estrutura desenhada: a seção da FIXAÇÃO DAS ESCADAS do modelo (pé e topo de cada uma, os pés de apoio e os
       pilaretes dos patamares), refeita com os esforços da própria escada — chamado pelo js/metalcalclivreui.js */
    fixacoesDoModelo: function () {
      var U = PU(), M = MP(), L = E(), A = global.AcoAcessos; if (!U || !M || !L) return [];
      var out = [];
      U.prontas().forEach(function (pr) {
        if (pr.tipo !== "escada" || !pr.info || !pr.info.par || (!pr.info.par.fixPe && !pr.info.par.fixTopo)) return;
        var k = 0, r = M.gerar("escada", M.parParaRefazer(pr), function () { return "mf" + (++k); }, {}); if (!r.ok) return;
        var its = (r.medidas.dim && r.medidas.dim.itens || []).filter(function (it) { return it.tipo === "fixacao" || it.tipo === "pilarete"; });
        its.forEach(function (it) {
          var d = A ? A.dimensionar({ itens: [it] }) : null; if (!d) return;
          var calc = d.verificacoes.filter(function (v) { return !v.info; });
          out.push({ escada: pr.id, desnivel: r.par.desnivel, ponta: it.tipo === "pilarete" ? "patamar" : it.ponta, modo: it.tipo === "pilarete" ? "pilarete" : it.modo, nome: it.nome || it.rotulo || (it.ponta === "topo" ? "Topo" : "Pé"), razao: d.razao, status: d.status, verificacoes: calc, naoVerificados: d.naoVerificados, R: it.R || null, resumo: it.tipo === "fixacao" ? L.fixacao(it).resumo : (it.perfil + " — N = " + br(it.N, 2) + " kN, h = " + br(it.h, 2) + " m") });
        });
      });
      return out;
    },
    secaoMemorial: function (html) {
      var fx = this.fixacoesDoModelo(); if (!fx.length || typeof html !== "string") return html;
      var e = function (t) { return String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); };
      var rot = { pe: "pé", topo: "topo", patamar: "patamar" }, ROT = (E() && E().ROT) || {};
      var linhas = fx.map(function (f) { return "<tr><td>" + e(f.escada) + " (" + br(f.desnivel) + " m)</td><td>" + e(rot[f.ponta] || f.ponta) + "</td><td>" + e(ROT[f.modo] || f.modo) + "</td><td>" + e(f.resumo) + "</td><td>" + (f.R ? br(f.R.V, 2) + " / " + br(f.R.H, 2) : "—") + "</td><td>" + br(f.razao, 2) + "</td><td>" + (f.status === "aprovado" ? '<span class="ok">atende</span>' : '<span class="falha">' + (f.status === "incompleto" ? "INCOMPLETO" : "NÃO atende") + "</span>") + "</td></tr>"; }).join("");
      var det = fx.map(function (f) { return "<p><b>" + e(f.nome) + "</b> (" + e(f.escada) + ")</p><table class=\"t compacta\"><thead><tr><th>Verificação</th><th>Norma / item</th><th>Razão</th></tr></thead><tbody>" + f.verificacoes.map(function (v) { return "<tr><td>" + e(v.nome) + "</td><td>" + e(v.item) + "</td><td>" + br(v.razao, 2) + (v.ok === false ? ' <span class="falha">não passa</span>' : "") + "</td></tr>"; }).join("") + "</tbody></table>" + (f.naoVerificados.length ? "<ul>" + f.naoVerificados.map(function (t) { return "<li>" + e(t) + "</li>"; }).join("") + "</ul>" : ""); }).join("");
      var sec = '<section class="sec" id="sec-fixacao-escadas"><h2><span class="num">E</span>Fixação das escadas (pé, topo, pés de apoio e pilaretes dos patamares)</h2>' +
        "<p>A fixação de cada escada do modelo, dimensionada com os esforços DA PRÓPRIA ESCADA: peso próprio + sobrecarga de escadas (NBR 6120:2019, Tabela 10) e a força do guarda-corpo (Tabela 12), γ da NBR 8800, Tabela 1. Reações pela envoltória das duas hipóteses de apoio da longarina (pé fixo ou topo fixo); numa ponta APOIADA, V = W/2 e a horizontal vai toda para a outra ponta. A estrutura desenhada recebe a escada pelas longarinas (cartão Escadas).</p>" +
        '<table class="t compacta"><thead><tr><th>Escada</th><th>Ponta</th><th>Fixação</th><th>Arranjo</th><th>V / H por longarina (kN)</th><th>Razão</th><th>Situação</th></tr></thead><tbody>' + linhas + "</tbody></table>" + det + "</section>";
      var i = html.indexOf('<section class="sec" id="sec-pesos"');
      return i >= 0 ? html.slice(0, i) + sec + html.slice(i) : html.replace(/<\/body>/i, sec + "</body>");
    },

    registrar: function () { if (!this.pronto()) return false; PU().registrarModo(MODO, this.modo()); return true; }
  };

  global.MetalEscadaLinhaUI = MetalEscadaLinhaUI;
  try { if (MetalEscadaLinhaUI.pronto()) MetalEscadaLinhaUI.registrar(); } catch (e) {}
  if (typeof module !== "undefined" && module.exports) module.exports = MetalEscadaLinhaUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
