/* =====================================================================
 * concauditor.js — AUDITOR DA CONCEPÇÃO ESTRUTURAL EM CONCRETO (frente "concreto F1", 21/10/2026). Motor PURO, ES5.
 *
 * No molde do js/esqauditor.js: confere o modelo PRONTO — o que o "Pré-lançar estrutura" (js/conclanc.js) pôs E o que
 * foi lançado à mão — SEM confiar no lançador: a geometria é refeita aqui. Regra do dono (15/10/2026): cada achado sai
 * no formato do js/problemacard.js — o que é, "Corrigir: …" (as ops já calculadas, aplicadas num lote com Ctrl+Z) e
 * "Mostrar no 3D" (as peças). Solução sem ação vira nota, nunca botão vazio. O que a regra manda para o engenheiro
 * (balanço, transição, pilar-parede, viga-parede, vão > 8 m) sai como "ESCALAR", com o Mostrar no 3D.
 *
 *   ConcAuditor.auditar({ estado, avaliarFam }) → { problemas[], porCodigo{}, resumo }
 *
 * CÓDIGOS (os números e as fontes moram em js/concdados.js):
 *   A-01  erro   pilar no vão de porta/janela                      → Corrigir: andar o pilar ao longo da parede (as vigas seguem)
 *   A-02  erro   viga cortando a porta/janela (fundo abaixo da verga) → Corrigir: baixar a altura da viga até a verga (A CALCULAR)
 *   A-03  aviso  vão de viga > 5,5 m (forte > 6,0; escalar > 8,0)   → Corrigir: pilar intermediário fora dos vãos + viga dividida
 *   A-03L aviso  vão de laje maciça > 5,0 m                         → Corrigir: trocar por treliçada (altura da NBR 14859-1)
 *   A-04  erro   pilar sem nada embaixo (nem pilar nem viga)        → Corrigir: descer o pilar até o pavimento de baixo (há parede)
 *   A-04D erro   pilar desalinhado com o de baixo                   → Corrigir: alinhar com o de baixo (as vigas seguem)
 *   A-04T aviso  pilar nascendo em viga (transição)                 → ESCALAR
 *   A-05  erro   seção do pilar abaixo de 6118 13.2.3               → Corrigir: 14 × 26 (ou o lado mínimo)
 *   A-06  erro   viga com b < 12 cm                                 → Corrigir: b = 12 cm
 *   A-07  erro   laje maciça abaixo de 13.2.4.1                     → Corrigir: a espessura mínima
 *   A-08  aviso  pilar-parede (lado maior > 5 × menor)              → ESCALAR
 *   A-09  erro   balanço (viga com ponta solta além do apoio; laje com borda livre) → Corrigir: pilar na ponta / ESCALAR
 *   A-10  aviso  viga-parede (vão < 3 h)                            → ESCALAR
 *   A-11  erro   viga sem apoio numa ponta (nem pilar nem viga)     → Corrigir: pilar na ponta (há parede embaixo)
 *   A-14  aviso  laje apoiada direto em parede (sem viga)           → nota (carga de parede a calcular)
 *   A-16 / A-17  aviso  CAA/fck assumidos; sem sondagem (fundação não pré-dimensionada)
 *   A-22  aviso  treliçada com vão > 6,0 m (ensaio do conjunto)
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function CL() { return dep("ConcLanc", "./conclanc.js"); }
  function ARQ() { return dep("BimArq", "./bimarq.js"); }
  function EDIT() { return dep("BimEdit", "./bimedit.js"); }
  function DADOS() { return dep("ConcDados", "./concdados.js"); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function f2(v) { var x = Number(v); return isFinite(x) ? x.toFixed(2).replace(".", ",") : "—"; }
  function cm(v) { return Math.round(v * 100); }
  function piso5(m) { return Math.floor(m * 100 / 5 + 1e-6) * 5 / 100; }
  function crit(k, d) { var C = CL(); return C ? C.crit(k, d) : d; }
  function v(x, z) { return { x: x, z: z }; }
  function sub(a, b) { return v(a.x - b.x, a.z - b.z); }
  function add(a, b) { return v(a.x + b.x, a.z + b.z); }
  function mul(a, k) { return v(a.x * k, a.z * k); }
  function dot(a, b) { return a.x * b.x + a.z * b.z; }
  function len(a) { return Math.sqrt(a.x * a.x + a.z * a.z); }
  function dist(a, b) { return len(sub(a, b)); }

  var NIVEL_ROT = { "norma-lida": "norma (edição lida — conferir a vigente)", "literatura-primaria": "literatura (fonte primária)", "literatura-secundaria": "literatura (fonte secundária — conferir)", "decisao-produto": "regra do produto (sem fonte)", "geometria": "geometria do modelo" };
  function regraDe(id) { var D = DADOS(); return arr(D && D.auditor).filter(function (a) { return a.id === id; })[0] || { id: id, regra: "", fonte: "" }; }

  /* ---------------------------------------------------------------- leitura do modelo */
  function ativa(c) { return !(c && c.faseDemolida) && !(c && c.faseCriada === "Existente"); }
  function eixo(c) { var e = EDIT().eixoDaCaixa(c); return [v(e[0].x, e[0].z), v(e[1].x, e[1].z)]; }
  function pilarInfo(c) {
    var th = num(c.rotY, 0), ux = v(Math.cos(th), -Math.sin(th)), uz = v(Math.sin(th), Math.cos(th));
    var a = num(c.comprimento, 0.2), b = num(c.espessura, 0.2), yb = num(c.cy, 0) - num(c.altura, 0) / 2;
    return { c: c, id: String(c.id), p: v(num(c.cx, 0), num(c.cz, 0)), ux: ux, uz: uz, a: a, b: b, yb: yb, yt: yb + num(c.altura, 0), menor: Math.min(a, b), maior: Math.max(a, b) };
  }
  function contemPonto(P, q, folga) { var d = sub(q, P.p); return Math.abs(dot(d, P.ux)) <= P.a / 2 + folga && Math.abs(dot(d, P.uz)) <= P.b / 2 + folga; }
  function vigaInfo(c) {
    var e = eixo(c), d = sub(e[1], e[0]), L = len(d), topo = num(c.cy, 0) + num(c.altura, 0) / 2;
    return { c: c, id: String(c.id), a: e[0], b: e[1], u: L > 0 ? mul(d, 1 / L) : v(1, 0), L: L, topo: topo, h: num(c.altura, 0), larg: num(c.espessura, 0.12), yb: topo - num(c.altura, 0) };
  }
  function paredeInfo(c, vz) {
    var e = eixo(c), d = sub(e[1], e[0]), L = len(d), u = L > 0 ? mul(d, 1 / L) : v(1, 0), cen = mul(add(e[0], e[1]), 0.5), yb = num(c.cy, 0) - num(c.altura, 0) / 2;
    var nucCam = c.tipoParede && arr(c.tipoParede.camadas).filter(function (k) { return k && k.face === "nucleo"; })[0];
    return { c: c, id: String(c.id), a: e[0], b: e[1], u: u, n: v(-u.z, u.x), L: L, cen: cen, esp: num(c.espessura, 0.15), larg: nucCam && num(nucCam.e, 0) > 0.03 ? num(nucCam.e, 0) : num(c.espessura, 0.15), yb: yb, yt: yb + num(c.altura, 0),
             aberturas: arr(vz && vz.aceitos).map(function (x) { return { id: x.id, t0: x.x0, t1: x.x1, y0: num(x.y0, 0), y1: num(x.y1, 0) }; }) };
  }
  function tNa(w, p) { return dot(sub(p, w.cen), w.u); }
  function offNa(w, p) { return Math.abs(dot(sub(p, w.cen), w.n)); }
  function pontoNa(w, t) { return add(w.cen, mul(w.u, t)); }
  function lajeInfo(c) {
    var P = arr(c.contorno).length >= 3 ? c.contorno.map(function (p) { return v(num(p.x, 0), num(p.z, 0)); }) : (function () {
      var hx = num(c.comprimento, 0) / 2, hz = num(c.espessura, 0) / 2, x = num(c.cx, 0), z = num(c.cz, 0);
      return [v(x - hx, z - hz), v(x + hx, z - hz), v(x + hx, z + hz), v(x - hx, z + hz)];
    })();
    var xs = P.map(function (p) { return p.x; }), zs = P.map(function (p) { return p.z; });
    var topo = num(c.cy, 0) + num(c.altura, 0) / 2;
    return { c: c, id: String(c.id), P: P, topo: topo, h: num(c.altura, 0), dx: Math.max.apply(null, xs) - Math.min.apply(null, xs), dz: Math.max.apply(null, zs) - Math.min.apply(null, zs),
             tipo: CL().tipoLajeDe(c) };
  }

  /* ---------------------------------------------------------------- ops de correção */
  /* as vigas que chegam no centro antigo do pilar passam a chegar no novo (a mesma peça, criada de novo com o mesmo id) */
  function seguirVigas(vigas, antes, depois) {
    var BA = ARQ(), ops = [], ids = [];
    vigas.forEach(function (V) {
      var ka = dist(V.a, antes) < 0.06, kb = dist(V.b, antes) < 0.06; if (!ka && !kb) return;
      var A = ka ? depois : V.a, B = kb ? depois : V.b, d = sub(B, A), L = len(d); if (!(L > 0.05)) return;
      var c = clone(V.c);
      c.cx = r4((A.x + B.x) / 2); c.cz = r4((A.z + B.z) / 2); c.comprimento = r4(L); c.rotY = r4(Math.atan2(-d.z, d.x));
      if (c.perfil && BA) BA.recalcPeca(c); else { c.volume = r4(L * num(c.altura, 0) * num(c.espessura, 0)); c.comprimentoViga = r4(L); }
      ops.push({ op: "criar", id: c.id, caixa: BA ? BA.paraOp(c) : c }); ids.push(String(c.id));
    });
    return { ops: ops, ids: ids };
  }
  function novoPilar(id, p, w, base, topo, marca) {
    var BA = ARQ(), C = CL(), sec = C.secaoPelaParede(w.larg);
    var c = BA.pilarPerfil({ x: r4(p.x), z: r4(p.z) }, { perfil: { forma: "ret", b: r4(sec.L), h: r4(sec.b) }, material: "concreto", base: r4(base), altura: r4(topo - base), rotY: r4(Math.atan2(-w.u.z, w.u.x)) });
    if (!c) return null;
    c.id = id; c.marca = marca || "P"; c.comentarios = C.ROTULO;
    c.conc = { origem: "auditor", papel: "pilar", rotulo: C.ROTULO, secao: cm(sec.b) + " × " + cm(sec.L) };
    c.servicos = C.servicosDe("pilar", null, null, 1);   /* o pilar novo entra no orçamento como os pré-lançados (estimativa marcada) */
    return { op: "criar", id: id, caixa: BA.paraOp(c) };
  }
  /* uma posição na parede w (t) onde o pilar de comprimento Lp não pega vão, perto de alvo */
  function tLivre(w, alvo, Lp, raio, yb, yt) {
    for (var k = 0; k * 0.05 <= raio + 1e-9; k++) {
      var ts = k === 0 ? [alvo] : [alvo + k * 0.05, alvo - k * 0.05];
      for (var i = 0; i < ts.length; i++) {
        var t = ts[i]; if (t - Lp / 2 < -w.L / 2 - 0.01 || t + Lp / 2 > w.L / 2 + 0.01) continue;
        if (!w.aberturas.some(function (a) { return t + Lp / 2 > a.t0 + 0.005 && t - Lp / 2 < a.t1 - 0.005 && (yt == null || (w.yb + a.y1 > yb && w.yb + a.y0 < yt)); })) return t;
      }
    }
    return null;
  }
  /* a parede debaixo de um ponto (o pilar novo fica DENTRO dela) e que chega na cota y */
  function paredeSob(paredes, p, y) {
    return paredes.filter(function (w) { var t = tNa(w, p); return offNa(w, p) <= w.esp / 2 + 0.03 && t >= -w.L / 2 - 0.15 && t <= w.L / 2 + 0.15 && w.yb < y - 0.1 && w.yt >= y - 0.35; })[0] || null;
  }

  /* ================================================================ AUDITAR */
  function auditar(o) {
    o = o || {};
    var estado = o.estado, BE = EDIT(), C = CL(), probs = [];
    if (!estado || !BE || !C) return { problemas: [], porCodigo: {}, resumo: { pecas: 0 }, motivo: "motores não carregados" };
    var cx = arr(estado.caixas);
    var vaos = typeof o.avaliarFam === "function" ? BE.vaosDasParedes(estado, o.avaliarFam) : {};
    var paredes = cx.filter(function (c) { return c && c.tipo === "parede" && !c.faseDemolida && !c.arco; }).map(function (c) { return paredeInfo(c, vaos[c.id]); });
    var pil = cx.filter(function (c) { return C.ehConcreto(c) && c.tipo === "pilar" && ativa(c); }).map(pilarInfo);
    var vig = cx.filter(function (c) { return C.ehConcreto(c) && c.tipo === "viga" && ativa(c); }).map(vigaInfo);
    var baseMin = paredes.length ? Math.min.apply(null, paredes.map(function (w) { return w.yb; })) : 0;
    var laj = cx.filter(function (c) { return C.ehConcreto(c) && c.tipo === "laje" && ativa(c); }).map(lajeInfo).filter(function (L) { return L.topo > baseMin + 0.3; });   /* piso sobre o solo não é laje estrutural daqui */
    /* apoios que não são concreto (pilar/viga de aço ou madeira, famílias estruturais): a viga que chega neles TEM apoio
       (revisão 21/10/2026 — antes saía A-11 "viga sem apoio" falso); não são auditados como concreto */
    var EM = C.estruturaModelada ? C.estruturaModelada(estado, { avaliarFam: o.avaliarFam, categoriaFam: o.categoriaFam }).pecas : [];
    var pilAp = pil.concat(EM.filter(function (x) { return x.tipo === "pilar"; }).map(pilarInfo));
    var vigAp = vig.concat(EM.filter(function (x) { return x.tipo === "viga"; }).map(vigaInfo));
    var lajAp = laj.concat(EM.filter(function (x) { return x.tipo === "laje"; }).map(lajeInfo));
    var nPav = C.contarPavimentos ? C.contarPavimentos(estado) : 1;   /* garagem rebaixada não é outro pavimento (revisão 21/10/2026) */

    function prob(cod, gravidade, titulo, texto, pecas, solucoes, nivel) {
      var R = regraDe(cod);
      probs.push({ tipo: cod, codigo: cod, titulo: titulo, texto: texto, gravidade: gravidade, pecas: pecas, solucoes: arr(solucoes).filter(Boolean), nivel: nivel || "geometria", nivelRotulo: (NIVEL_ROT[nivel] || NIVEL_ROT.geometria) + (R.fonte ? " · " + R.fonte : "") });
    }
    function apoiosDaViga(V) {
      /* pilares que tocam o eixo da viga na altura dela; vigas que recebem a ponta */
      var s = [];
      pilAp.forEach(function (P) {
        if (P.yt < V.yb + 0.05 || P.yb > V.topo - 0.05) return;
        var d = sub(P.p, V.a), t = dot(d, V.u), off = Math.abs(dot(d, v(-V.u.z, V.u.x)));
        if (off > Math.max(P.a, P.b) / 2 + 0.02 || t < -Math.max(P.a, P.b) / 2 - 0.02 || t > V.L + Math.max(P.a, P.b) / 2 + 0.02) return;
        s.push({ t: Math.max(0, Math.min(V.L, t)), id: P.id, tipo: "pilar" });
      });
      return s.sort(function (a, b) { return a.t - b.t; });
    }
    function pontaApoiada(V, q) {
      if (pilAp.some(function (P) { return contemPonto(P, q, 0.03) && P.yt >= V.topo - V.h - 0.05 && P.yb <= V.topo - 0.05; })) return "pilar";
      var outra = vigAp.filter(function (W) {
        if (W === V || Math.abs(W.topo - V.topo) > 0.1 || Math.abs(dot(W.u, V.u)) > 0.95) return false;
        var d = sub(q, W.a), t = dot(d, W.u), off = Math.abs(dot(d, v(-W.u.z, W.u.x)));
        return off <= W.larg / 2 + 0.05 && t > -0.05 && t < W.L + 0.05;
      })[0];
      return outra ? "viga:" + outra.id : null;
    }

    /* ---- A-01 pilar no vão de porta/janela */
    pil.forEach(function (P) {
      paredes.forEach(function (w) {
        if (!w.aberturas.length || offNa(w, P.p) > w.esp / 2 + Math.max(P.a, P.b) / 2) return;
        var t = tNa(w, P.p), h = Math.abs(dot(w.u, P.ux)) * P.a / 2 + Math.abs(dot(w.u, P.uz)) * P.b / 2;
        var ab = w.aberturas.filter(function (a) { return t + h > a.t0 + 0.005 && t - h < a.t1 - 0.005 && w.yb + a.y1 > P.yb + 0.01 && w.yb + a.y0 < P.yt - 0.01; })[0];
        if (!ab) return;
        var sol = null, Lp = 2 * h, tn = tLivre(w, t, Lp, Math.max(1.5, w.L / 2), P.yb, P.yt);
        if (tn != null) {
          var novo = pontoNa(w, tn), sv = seguirVigas(vig, P.p, novo);
          sol = { id: "mover", texto: "andar o pilar " + f2(Math.abs(tn - t)) + " m ao longo da parede " + w.id + ", para fora do vão (as vigas que chegam nele seguem)", ops: [{ op: "mover", id: P.c.id, cx: r4(novo.x), cz: r4(novo.z) }].concat(sv.ops), pecas: [P.id].concat(sv.ids) };
        }
        prob("A-01", "erro", "Pilar " + (P.c.marca || P.id) + " no vão de " + ab.id, "O pilar ocupa " + f2(Math.min(t + h, ab.t1) - Math.max(t - h, ab.t0)) + " m do vão da porta/janela " + ab.id + " (parede " + w.id + "). Pilar não vai em abertura (Bacarji & Pinheiro 1996, p. 857).",
          [P.id, ab.id], [sol || { id: "nota", texto: "não há lugar livre na parede: o engenheiro reposiciona (ou a abertura muda)" }], "literatura-primaria");
      });
    });

    /* ---- A-02 viga cortando porta/janela; A-06 largura; A-10 viga-parede; A-03 vão; A-09/A-11 apoios */
    vig.forEach(function (V) {
      var nm = V.c.marca || V.id;
      paredes.forEach(function (w) {
        if (!w.aberturas.length || Math.abs(dot(w.u, V.u)) < 0.99) return;
        if (offNa(w, V.a) > w.esp / 2 + 0.05 || offNa(w, V.b) > w.esp / 2 + 0.05) return;
        if (!(w.yb < V.topo - 0.1 && w.yt >= V.topo - 0.35)) return;   /* só a parede DEBAIXO da viga (a de cima tem as janelas dela) */
        var ta = tNa(w, V.a), tb = tNa(w, V.b), t0 = Math.min(ta, tb), t1 = Math.max(ta, tb);
        w.aberturas.forEach(function (a) {
          if (!(a.t1 > t0 + 0.01 && a.t0 < t1 - 0.01)) return;
          var topoAb = w.yb + a.y1; if (V.yb >= topoAb - 0.005) return;
          var disp = V.topo - topoAb, hN = piso5(disp), sols = [];
          if (hN >= 0.2 && V.c.perfil) sols.push({ id: "h", texto: "baixar a viga para " + cm(V.larg) + " × " + cm(hN) + " (fundo na verga — A CALCULAR)", ops: [{ op: "ajustar", id: V.c.id, campos: { perfil: { forma: "ret", b: r4(V.larg), h: r4(hN) } } }], pecas: [V.id] });
          else sols.push({ id: "nota", texto: "sobra " + cm(disp) + " cm entre a verga e o teto: baixar a porta/janela ou viga invertida — o engenheiro decide" });
          prob("A-02", "erro", "Viga " + nm + " corta " + a.id, "O fundo da viga fica a " + f2(V.yb) + " m e o topo da porta/janela " + a.id + " a " + f2(topoAb) + " m (" + cm(topoAb - V.yb) + " cm dentro do vão).", [V.id, a.id], sols, "geometria");
        });
      });
      if (cm(V.larg) < crit("vigaLarguraMinimaCm", 12) && V.c.perfil)
        prob("A-06", "erro", "Viga " + nm + " com " + cm(V.larg) + " cm de largura", "A largura mínima de viga é " + crit("vigaLarguraMinimaCm", 12) + " cm (NBR 6118:2014 13.2.2; 10 cm só em caso excepcional).", [V.id],
          [{ id: "b", texto: "alargar para " + crit("vigaLarguraMinimaCm", 12) + " cm", ops: [{ op: "ajustar", id: V.c.id, campos: { perfil: { forma: "ret", b: crit("vigaLarguraMinimaCm", 12) / 100, h: r4(V.h) } } }], pecas: [V.id] }], "norma-lida");
      var ap = apoiosDaViga(V);
      var ss = [0].concat(ap.map(function (x) { return x.t; })).concat([V.L]).filter(function (t, i, a) { return i === 0 || t - a[i - 1] > 0.05; });
      var aIni = pontaApoiada(V, V.a), aFim = pontaApoiada(V, V.b);
      /* vãos entre apoios */
      var tAp = ap.map(function (x) { return x.t; });
      if (aIni && aIni.indexOf("viga") === 0) tAp.unshift(0); if (aFim && aFim.indexOf("viga") === 0) tAp.push(V.L);
      tAp = tAp.sort(function (a, b) { return a - b; }).filter(function (t, i, a) { return i === 0 || t - a[i - 1] > 0.05; });
      for (var i = 0; i + 1 < tAp.length; i++) {
        var vao = tAp[i + 1] - tAp[i];
        if (vao < 3 * V.h - 1e-6) prob("A-10", "aviso", "Viga " + nm + " é viga-parede", "Vão de " + f2(vao) + " m menor que 3 × h (" + f2(3 * V.h) + " m): viga-parede (NBR 6118:2014 14.4.2.2). ESCALAR o engenheiro.", [V.id], [{ id: "nota", texto: "ESCALAR: dimensionamento de viga-parede" }], "norma-lida");
        if (vao <= crit("vaoEconomicoMaxM", 5.5) + 1e-9) continue;
        var escala = vao > crit("vaoEscalarM", 8.0), forte = vao > crit("vaoAvisoForteM", 6.0), sols3 = [];
        if (!escala) {
          var meio = add(V.a, mul(V.u, (tAp[i] + tAp[i + 1]) / 2)), w3 = paredeSob(paredes, meio, V.topo);
          if (w3) {
            var sec = C.secaoPelaParede(w3.larg), tm = tLivre(w3, tNa(w3, meio), sec.L, vao / 2 - 0.5, w3.yb, V.topo);
            if (tm != null) {
              var pm = pontoNa(w3, tm), tCorte = dot(sub(pm, V.a), V.u), BA = ARQ();
              var idP = String(V.c.id) + "-pm", c1 = clone(V.c), c2 = clone(V.c);
              var trecho = function (c, A, B) { var d = sub(B, A), L = len(d); c.cx = r4((A.x + B.x) / 2); c.cz = r4((A.z + B.z) / 2); c.comprimento = r4(L); c.rotY = r4(Math.atan2(-d.z, d.x)); if (c.perfil && BA) BA.recalcPeca(c); return c; };
              var pc = add(V.a, mul(V.u, tCorte));
              trecho(c1, V.a, pc); c2 = trecho(c2, pc, V.b); c2.id = String(V.c.id) + "-b"; if (c2.marca) c2.marca = c2.marca + "b";
              if (c2.conc) c2.conc.origem = "auditor";   /* a peça NOVA do Corrigir é do usuário: o pré-lançamento seguinte não apaga */
              var opP = novoPilar(idP, pm, w3, w3.yb, V.topo, (V.c.marca || "V") + "-P");
              if (opP) sols3.push({ id: "pilar", texto: "pilar intermediário a " + f2(tCorte) + " m da ponta (fora das portas/janelas) e a viga dividida em duas", ops: [opP, { op: "criar", id: c1.id, caixa: BA.paraOp(c1) }, { op: "criar", id: c2.id, caixa: BA.paraOp(c2) }], pecas: [V.id, idP, c2.id] });
            }
          }
        }
        if (!sols3.length) sols3.push({ id: "nota", texto: escala ? "ESCALAR: vão acima de " + f2(crit("vaoEscalarM", 8.0)) + " m" : "sem parede embaixo para o pilar intermediário: o engenheiro concebe" });
        prob("A-03", escala ? "erro" : "aviso", "Vão de " + f2(vao) + " m na viga " + nm, "Acima de " + f2(crit("vaoEconomicoMaxM", 5.5)) + " m (vão econômico entre pilares, Bacarji & Pinheiro 1996 p. 858)" + (escala ? "; acima de 8,0 m: ESCALAR." : (forte ? "; acima de 6,0 m (aviso forte)." : ".")), [V.id], sols3, "literatura-primaria");
      }
      /* apoio das pontas */
      [[V.a, aIni, "início"], [V.b, aFim, "fim"]].forEach(function (pt) {
        if (pt[1]) return;
        var interno = ap.some(function (x) { return x.t > 0.3 && x.t < V.L - 0.3; }), outro = pt[2] === "início" ? aFim : aIni;
        var w = paredeSob(paredes, pt[0], V.topo), sols = [];
        if (w) {
          var sec = C.secaoPelaParede(w.larg), q = add(pt[0], mul(V.u, (pt[2] === "início" ? 1 : -1) * Math.max(0, sec.L / 2 - 0.0)));
          var tq = tLivre(w, tNa(w, pt[0]), sec.L, 0.6, w.yb, V.topo);
          if (tq != null) { q = pontoNa(w, tq); var opP = novoPilar(String(V.c.id) + (pt[2] === "início" ? "-pa" : "-pb"), q, w, w.yb, V.topo, (V.c.marca || "V") + "-P"); if (opP) sols.push({ id: "pilar", texto: "pilar na ponta (" + pt[2] + ") da viga, dentro da parede " + w.id, ops: [opP], pecas: [V.id, opP.id] }); }
        }
        if (!sols.length) sols.push({ id: "nota", texto: "sem parede embaixo da ponta: o engenheiro concebe o apoio" });
        if (interno || outro) prob(interno ? "A-09" : "A-11", "erro", interno ? "Viga " + nm + " em balanço (" + pt[2] + ")" : "Viga " + nm + " sem apoio no " + pt[2],
          interno ? "A ponta passa do último apoio sem pilar nem viga: balanço (6118:2014 13.2.4.1-c; Em1:2026 20.6) — ESCALAR ou apoiar a ponta." : "A ponta não chega em pilar nem em viga: a viga não para em pé (equilíbrio).", [V.id], sols, interno ? "norma-lida" : "geometria");
        else prob("A-11", "erro", "Viga " + nm + " sem apoio nas pontas", "Nenhuma das pontas chega em pilar ou em viga.", [V.id], sols, "geometria");
      });
    });
    /* as duas pontas sem apoio aparecem duas vezes pelo laço acima: fica uma */
    var vistos = {};
    probs = probs.filter(function (p) { if (p.tipo !== "A-11" || !/nas pontas/.test(p.titulo)) return true; var k = p.pecas[0]; if (vistos[k]) return false; vistos[k] = 1; return true; });

    /* ---- A-05 seção do pilar; A-08 pilar-parede; A-04 continuidade */
    pil.forEach(function (P) {
      var nm = P.c.marca || P.id, menorCm = cm(P.menor), maiorCm = cm(P.maior), area = menorCm * maiorCm;
      if (menorCm < crit("pilarLadoEspecialCm", 14) || area < crit("pilarAreaMinimaCm2", 360)) {
        var bN = Math.max(menorCm, crit("pilarLadoEspecialCm", 14)), LN = Math.max(maiorCm, Math.ceil(crit("pilarAreaMinimaCm2", 360) / bN));
        var opC = P.c.perfil ? { op: "ajustar", id: P.c.id, campos: { perfil: { forma: "ret", b: r4(P.a >= P.b ? LN / 100 : bN / 100), h: r4(P.a >= P.b ? bN / 100 : LN / 100) } } } : null;
        prob("A-05", "erro", "Pilar " + nm + " " + menorCm + " × " + maiorCm + " abaixo do mínimo", "Lado mínimo " + crit("pilarLadoMinimoCm", 19) + " cm (" + crit("pilarLadoEspecialCm", 14) + " cm com γn) e área ≥ " + crit("pilarAreaMinimaCm2", 360) + " cm² (NBR 6118:2014 13.2.3).", [P.id],
          [opC ? { id: "secao", texto: "passar para " + bN + " × " + LN + " (A CALCULAR)", ops: [opC], pecas: [P.id] } : { id: "nota", texto: "troque a seção em Propriedades (" + bN + " × " + LN + ")" }], "norma-lida");
      }
      if (maiorCm > crit("pilarParedeRazao", 5) * menorCm) prob("A-08", "aviso", "Pilar " + nm + " é pilar-parede", menorCm + " × " + maiorCm + ": lado maior > 5 × o menor (NBR 6118:2014 14.4.2.4). ESCALAR o engenheiro.", [P.id], [{ id: "nota", texto: "ESCALAR: pilar-parede (18.5)" }], "norma-lida");
      if (P.yb <= baseMin + 0.3) return;   /* no térreo: a fundação (A-17) */
      var baixo = pilAp.filter(function (Q) { return Q !== P && Math.abs(Q.yt - P.yb) < 0.12 && dist(Q.p, P.p) < Math.max(Q.maior, P.maior); });
      var alinhado = baixo.filter(function (Q) { return dist(Q.p, P.p) < 0.05; })[0];
      if (alinhado) return;
      if (baixo.length) {
        var Q = baixo[0], sv = seguirVigas(vig, P.p, Q.p);
        prob("A-04D", "erro", "Pilar " + nm + " desalinhado com " + (Q.c.marca || Q.id), "O pilar de cima está " + cm(dist(P.p, Q.p)) + " cm fora do prumo do de baixo: sem prumo = transição (Bacarji & Pinheiro 1996, p. 857).", [P.id, Q.id],
          [{ id: "alinhar", texto: "alinhar com o pilar de baixo (as vigas que chegam nele seguem)", ops: [{ op: "mover", id: P.c.id, cx: r4(Q.p.x), cz: r4(Q.p.z) }].concat(sv.ops), pecas: [P.id, Q.id].concat(sv.ids) }], "literatura-primaria");
        return;
      }
      var vb = vig.filter(function (V) { if (Math.abs(V.topo - P.yb) > 0.12) return false; var d = sub(P.p, V.a), t = dot(d, V.u); return Math.abs(dot(d, v(-V.u.z, V.u.x))) <= V.larg / 2 + P.menor / 2 && t > -0.1 && t < V.L + 0.1; })[0];
      if (vb) { prob("A-04T", "aviso", "Pilar " + nm + " nasce na viga " + (vb.c.marca || vb.id), "Pilar sem pilar embaixo, apoiado em viga: TRANSIÇÃO (Bacarji & Pinheiro 1996, p. 857) — ESCALAR o engenheiro.", [P.id, vb.id], [{ id: "nota", texto: "ESCALAR: viga de transição" }], "literatura-primaria"); return; }
      var w = paredeSob(paredes, P.p, P.yb), sols = [];
      if (w) { var opP = novoPilar(String(P.c.id) + "-baixo", P.p, w, w.yb, P.yb, P.c.marca); if (opP) sols.push({ id: "descer", texto: "descer o pilar até o pavimento de baixo (dentro da parede " + w.id + ")", ops: [opP], pecas: [P.id, opP.id] }); }
      if (!sols.length) sols.push({ id: "nota", texto: "nada embaixo para apoiar: o engenheiro concebe (transição)" });
      prob("A-04", "erro", "Pilar " + nm + " sem continuidade", "Não há pilar nem viga embaixo dele no pavimento de baixo.", [P.id], sols, "literatura-primaria");
    });

    /* ---- lajes: espessura mínima, vão, tipo, bordas */
    laj.forEach(function (L) {
      var nm = L.c.marca || L.id, lx = Math.min(L.dx, L.dz) + 0.15, cobertura = !paredes.some(function (w) { return w.yb > L.topo - 0.1 && w.yb < L.topo + 0.2 && L.P.length && (function () { var q = mul(add(w.a, w.b), 0.5); return (C._geo.dentro(q, L.P) || C._geo.distBorda(q, L.P) < 0.3); })(); });
      var hCm = cm(L.h), hMin = cobertura ? crit("lajeMinCoberturaCm", 7) : crit("lajeMinPisoCm", 8);
      function opTipo(tipo, h) {
        var rot = (tipo === "macica" ? "Laje maciça " + h + " cm" : "Laje treliçada h " + h + " cm") + " — PRÉ-DIM.", ops = [{ op: "ajustar", id: L.c.id, campos: { tipoLaje: { id: "conc-" + tipo + "-" + h, rotulo: rot, espessura: h / 100 } } }];
        if (C.ehPreLanc(L.c)) ops.push({ op: "orcar", id: L.c.id, servicos: C.servicosDe("laje", tipo, h, nPav) });
        return ops;
      }
      if (L.tipo === "macica" && lx > crit("lajeMacicaVaoMaxM", 5.0) + 1e-9) {
        var esc = lx > crit("vaoEscalarM", 8.0), alts = crit("trelicadaAlturasCm", [12, 16, 20, 25]), hT = alts.filter(function (h) { return h >= Math.max(12, lx * 100 / crit("trelicadaHPorVao", 25)) - 1e-9; })[0] || alts[alts.length - 1];
        prob("A-03L", esc ? "erro" : "aviso", "Laje maciça " + nm + " com vão de " + f2(lx) + " m", "Laje maciça econômica até " + f2(crit("lajeMacicaVaoMaxM", 5.0)) + " m (Bacarji & Pinheiro 1996, p. 858)" + (esc ? "; acima de 8,0 m: ESCALAR." : "."), [L.id],
          [esc ? { id: "nota", texto: "ESCALAR: vão acima de 8,0 m" } : { id: "trelicada", texto: "trocar por laje treliçada h " + hT + " cm (NBR 14859-1:2002; conferir na tabela do fabricante)", ops: opTipo("trelicada", hT), pecas: [L.id] }], "literatura-primaria");
      }
      if (L.tipo === "trelicada" && lx > crit("trelicadaEnsaioVaoM", 6.0) + 1e-9) prob("A-22", "aviso", "Treliçada " + nm + " com vão de " + f2(lx) + " m", "Acima de 6,0 m a NBR 14859-1:2002 (6.3.1) pede o ensaio do conjunto." + (lx > crit("vaoEscalarM", 8.0) ? " Acima de 8,0 m: ESCALAR." : ""), [L.id], [{ id: "nota", texto: "pedir ao fabricante o ensaio do conjunto / o engenheiro confere" }], "norma-lida");
      if (L.h > lx / 3) prob("A-08", "aviso", "Laje " + nm + " é placa espessa", "Espessura maior que 1/3 do vão (NBR 6118:2014 14.4.2.1). ESCALAR.", [L.id], [{ id: "nota", texto: "ESCALAR" }], "norma-lida");
      /* bordas: viga, parede (A-14), outra laje (contínua) ou livre (A-09) */
      var livres = [], soParede = [];
      for (var i = 0; i < L.P.length; i++) {
        var A = L.P[i], B = L.P[(i + 1) % L.P.length], d = sub(B, A), comp = len(d); if (comp < 0.2) continue;
        var u = mul(d, 1 / comp), m = mul(add(A, B), 0.5);
        var porViga = vigAp.some(function (V) {
          if (Math.abs(V.topo - L.topo) > 0.08 || Math.abs(dot(V.u, u)) < 0.98) return false;
          var dd = sub(m, V.a), off = Math.abs(dot(dd, v(-V.u.z, V.u.x))); if (off > V.larg / 2 + 0.25) return false;
          var t0 = dot(sub(A, V.a), V.u), t1 = dot(sub(B, V.a), V.u), lo = Math.max(0, Math.min(t0, t1)), hi = Math.min(V.L, Math.max(t0, t1));
          return hi - lo >= 0.5 * comp;
        });
        if (porViga) continue;
        var porLaje = lajAp.some(function (M) { return M !== L && Math.abs(M.topo - L.topo) < 0.08 && C._geo.distBorda(m, M.P) < 0.3; });
        if (porLaje) continue;
        var porParede = paredes.filter(function (w) { return Math.abs(dot(w.u, u)) > 0.98 && offNa(w, m) <= w.esp / 2 + 0.25 && Math.abs(tNa(w, m)) <= w.L / 2 + 0.05 && w.yt >= L.topo - L.h - 0.1 && w.yb < L.topo - 0.5; })[0];
        if (porParede) { soParede.push(porParede.id); continue; }
        livres.push(f2(comp) + " m");
      }
      /* A-23 laje fechando o vão da escada que sobe até ela (revisão 21/10/2026) */
      C._geo.escadasDe(estado).forEach(function (es) {
        if (!(es.yb < L.topo - 1.0 && es.yt >= L.topo - L.h - 0.6)) return;
        var cen = mul(es.P.reduce(function (s0, q) { return add(s0, q); }, v(0, 0)), 1 / es.P.length);
        if (!C._geo.dentro(cen, L.P)) return;
        var aberto = arr(L.c.furos).some(function (f) { var F = arr(f && f.pts).map(function (q) { return v(num(q.x, 0), num(q.z, 0)); }); return F.length >= 3 && C._geo.dentro(cen, F); });
        if (aberto) return;
        var F = C._geo.furoEscada(es, L.P), BA = ARQ(), sol = null;
        if (F && BA) {
          var nc = clone(L.c); nc.furos = arr(nc.furos).concat([{ pts: F.map(function (q) { return { x: r4(q.x), z: r4(q.z) }; }) }]);
          if (BA.recalcLaje) BA.recalcLaje(nc);
          if (arr(nc.furos).length > arr(L.c.furos).length) sol = { id: "furo", texto: "abrir o vão da escada na laje (furo pela planta da escada " + es.id + ")", ops: [{ op: "criar", id: L.c.id, caixa: BA.paraOp(nc) }], pecas: [L.id, es.id] };
        }
        prob("A-23", "erro", "Laje " + nm + " fecha a escada " + es.id, "A escada " + es.id + " sobe até a laje " + nm + " e a laje passa por cima dela, sem o vão (o furo).", [L.id, es.id],
          [sol || { id: "nota", texto: "abra o vão da escada na laje (Modificar › furo) — o furo não coube automaticamente" }], "geometria");
      });
      /* A-07 depois das bordas: com borda livre (balanço) o mínimo é o de 13.2.4.1-c (revisão 21/10/2026) */
      if (livres.length) hMin = Math.max(hMin, crit("lajeMinBalancoCm", 10));
      if (L.tipo === "macica" && hCm < hMin) prob("A-07", "erro", "Laje " + nm + " com " + hCm + " cm", "Laje maciça " + (livres.length ? "em balanço" : (cobertura ? "de cobertura" : "de piso") + " não em balanço") + ": mínimo " + hMin + " cm (NBR 6118:2014 13.2.4.1-" + (livres.length ? "c" : (cobertura ? "a" : "b")) + ").", [L.id],
        [{ id: "h", texto: "passar para " + hMin + " cm", ops: opTipo("macica", hMin), pecas: [L.id] }], "norma-lida");
      if (soParede.length) prob("A-14", "aviso", "Laje " + nm + " apoiada direto em parede", "Borda sobre a parede " + soParede.filter(function (x, i, a) { return a.indexOf(x) === i; }).join(", ") + " sem viga: a carga da laje vai para a alvenaria (Bastos, Lajes, 3.4.5) — o engenheiro decide viga ou apoio.", [L.id].concat(soParede), [{ id: "nota", texto: "rode o Pré-lançar estrutura (viga sob a parede) ou confirme a alvenaria como apoio" }], "literatura-primaria");
      if (livres.length) prob("A-09", "erro", "Laje " + nm + " com borda livre (balanço)", livres.length + " borda(s) sem viga, parede ou outra laje (" + livres.join(", ") + "): balanço — mínimo 10 cm e γn (NBR 6118:2014 13.2.4.1-c); marquise: Em1:2026 20.6. ESCALAR.", [L.id], [{ id: "nota", texto: "ESCALAR: laje em balanço (ou feche a borda com uma viga)" }], "norma-lida");
    });

    /* ---- pendências globais (só com peça pré-lançada) */
    if (cx.some(C.ehPreLanc)) {
      prob("A-16", "aviso", "CAA II e C25 assumidos", "Classe de agressividade e fck não foram escolhidos pelo engenheiro: valem CAA II e C25 (NBR 6118:2014 Tabelas 6.1 e 7.1).", [], [{ id: "nota", texto: "o engenheiro confirma a CAA e o fck" }], "norma-lida");
      if (!arr(estado.fundacoes).length) prob("A-17", "aviso", "Sem sondagem: fundação não pré-lançada", "Sem SPT a NBR 6122:2022 (4.3) não deixa escolher o tipo de fundação.", pil.filter(function (P) { return P.yb <= baseMin + 0.3; }).map(function (P) { return P.id; }), [{ id: "nota", texto: "importe a sondagem (Estrutura › Sondagem) e lance a fundação" }], "norma-lida");
    }

    var porCodigo = {}; probs.forEach(function (p) { porCodigo[p.tipo] = (porCodigo[p.tipo] || 0) + 1; });
    return { problemas: probs, porCodigo: porCodigo, resumo: { pilares: pil.length, vigas: vig.length, lajes: laj.length, erros: probs.filter(function (p) { return p.gravidade === "erro"; }).length } };
  }

  var ConcAuditor = { auditar: auditar, VERSAO: 1 };
  global.ConcAuditor = ConcAuditor;
  if (typeof module !== "undefined" && module.exports) module.exports = ConcAuditor;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
