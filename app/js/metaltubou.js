/* =====================================================================
 * metaltubou.js — TUBO SOLDADO EM PERFIL U (alma da coluna treliçada) — 22/11/2026
 *
 * Tipologia "Tesoura com coluna treliçada" no sistema TUBO: as pontas das diagonais/montantes/travejamento em tubo que chegam no
 * U da coluna (≈ 468 pontas no Pedido Gabriel) saíam "não verificadas" (js/metalnostubo.js, foraDoEscopo). Aqui cada ponta é
 * verificada com a envoltória ELU da barra e, se reprovar, CORRIGIDA pelo motor (a correção mais leve que passa, recalculada).
 *
 * Geometria (conferida no modelo da tesoura-leve): o eixo ey do U é a normal do plano da treliça e a alma (bw) fica ⊥ ao plano —
 * o tubo, no plano, chega de topo na FACE INTERNA DA ALMA, entre as abas (23/11/2026, Estância Montalvão: a alma do U fica para FORA
 * da coluna e as abas para dentro — js/metalporticos.js giroU; antes a alma olhava para a outra coluna e o tubo chegava na face externa).
 *
 * VERIFICAÇÕES DA PONTA SOLDADA DIRETO (opção A):
 *   1. Solda de filete no contorno do tubo — ABNT NBR 8800:2008, 6.2.5 / Tabela 8: Fw,Rd = 0,60·Aw·fw/γw2 (Aw = 0,707·dw·Lw,
 *      E70XX fw = 485 MPa, γw2 = 1,35) e metal-base 0,60·AMB·fy/γa1 (no tubo e na alma, AMB = mín(dw; t)·Lw); Lw = contorno da
 *      pegada (RHS: 2·h1/sen θ + 2·b1; CHS: elipse, Ramanujan); perna mínima pela Tabela 10 (parte menos espessa,
 *      BimMetalNorma.soldaMin) e perna ≤ espessura da parede mais fina (critério do projeto, 21/11/2026 — o mesmo do
 *      js/metalligdim.js soldaChapa): parede < perna mínima → REPROVA ("fura o tubo") e vai para a correção.
 *      "Subir a perna": dw de dwMin até ⌊mín(t1; tw)⌋, a primeira que passa.
 *   2. Resistência local da alma do U (força ⊥ à alma F⊥ = N·sen θ): a NBR 8800:2008 e a NBR 16239:2013 NÃO tratam tubo
 *      soldado de topo numa chapa/alma de perfil aberto. POR ANALOGIA — CONFERIR: plastificação da face do banzo do nó T/Y
 *      de tubo retangular (EN 1993-1-8:2005, Tabela 7.11, β ≤ 0,85; kn da 7.5.2.1), com a alma do U no lugar da face do banzo
 *      (b0 = bw, t0 = tw) e γa1 = 1,10 no lugar do γM5 (como no js/metalnostubo.js):
 *        N1,Rd = kn·fy·tw²/((1 − β)·sen θ)·(2η/sen θ + 4·√(1 − β))/γa1,  β = b1/bw, η = h1/bw,
 *        kn = 1,0 (U tracionado); kn = 1,3 − 0,4·n/β ≤ 1,0 e ≥ 0 (U comprimido), n = (σ0/fy)/γa1, σ0 = Nc,U/A (só a normal).
 *      FORA da validade da Tabela 7.8 (β ≥ 0,25 e b0/t0 ≤ 35) — a alma de 300 mm com tubo de 40 a 50 mm está fora: o resultado
 *      é aproximado (linhas de plastificação de chapa engastada nas abas) e fica marcado "por analogia — conferir".
 *
 * CORREÇÃO AUTOMÁTICA (a mais leve que passa, cada uma recalculada):
 *   A  solda direto, subindo a perna (peso ≈ 0);
 *   B  solda direto + PAR DE ENRIJECEDORES na alma do U (MetalLigDim.enrijecedores — o mesmo do nó de chapa) nas bordas da
 *      pegada (Lg = h1/sen θ);
 *   C  CHAPA DE LIGAÇÃO (gusset) 8 mm soldada na alma (2 filetes, MetalLigDim.soldaChapa) entrando num rasgo da ponta do tubo,
 *      parafusos PASSANTES pelas duas paredes (MetalLigDim.parafusada, 2 planos, parede fina pela NBR 14762 — a mesma solução
 *      da escora passante); chapa: escoamento e compressão na faixa de Whitmore (Thornton, K = 0,65, L = c0); alma do U sob a
 *      chapa (MetalLigDim.almaU, AISC 360-16 K1.2 — analogia já usada) e, se precisar, + enrijecedores;
 *   D  TROCAR A PAREDE do tubo (mesma medida externa, a próxima espessura do catálogo) — muda a barra e a análise, por isso NÃO
 *      é aplicada aqui: sai como ALTERNATIVA (res.trocas, com o Δ kg da barra inteira) quando for mais leve que a correção
 *      adotada. Gancho para o auto-corrige da outra frente: MetalTuboU.trocasDeParede(res) → { membro: perfil }.
 *   Peso da comparação: aço das chapas (7850 kg/m³); parafusos e solda fora da conta (declarado).
 *
 * API:
 *   MetalTuboU.verificar(r, op) — r = resultado do AcoDimLivre.calcular; op.pontas = [{ b (membro tubo), no, ch (membros no nó) }]
 *     (o js/metalnostubo.js passa as pontas que ele não cobre); sem op.pontas, detecta sozinho.
 *     → { pontas, n, diretas, corrigidas, reprovados, naoVerificados, ligacoes (formato js/metalligdim.js, uma por grupo),
 *         enrijecedores (formato r.ligDim.modelo.enrijecedores, 3D), gussets (3D: js/metalparafusos.js gussetsTuboU), trocas,
 *         pesoChapas, resumo, premissas, pendencias }
 *   MetalTuboU.ponta(o) — uma ponta (as contas à mão e o teste): o = { tubo: { forma: "RHS"|"CHS", h, b | d, t, A, fy, fu },
 *     U: { bw, bf, t, A, fy, nome }, N, Nt, Nc (kN, barra), theta (graus, com o eixo do U), NcU (kN, compressão do U),
 *     L (m, barra — para a troca), alternativas: [ { nome, forma, h, b|d, t, A } ] }
 *   MetalTuboU.direta(o, dw) / MetalTuboU.almaTubo(o) — as verificações soltas (contas à mão).
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(n, p) { if (global[n]) return global[n]; try { if (typeof require === "function") return require(p); } catch (e) { } return null; }
  function N() { return dep("BimMetalNorma", "./metalnorma.js"); }
  function LD() { return dep("MetalLigDim", "./metalligdim.js"); }
  function Cat() { return dep("PerfisAco", "./perfisaco.js"); }
  var FW = 485, GW2 = 1.35, GA1 = 1.10, GA2 = 1.35, T_GUSSET = 8, C0 = 20, ACO_KG = 7.85e-6, CH = { fy: 250, fu: 400 };
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { if (v == null || v === "") return d; var x = +v; return isFinite(x) ? x : d; }
  function br(v, c) { if (v == null || !isFinite(v)) return "—"; c = c == null ? 2 : c; return (Math.round(v * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }
  function cima10(v) { return Math.ceil(v / 10 - 1e-9) * 10; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function norm(v) { var l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function passo(rotulo, formula, valor, extra) { return { rotulo: rotulo, formula: formula || "", valor: valor, extra: extra || "" }; }
  function verif(nome, item, passos, res, sol, unid) { return { nome: nome, item: item, passos: passos || [], resistencia: res, solicitante: sol, unidade: unid == null ? "kN" : unid, razao: res > 0 ? sol / res : (sol > 0 ? Infinity : 0) }; }
  function fecha(vs) { var rz = 0, gov = null; vs.forEach(function (v) { if (v.informativa) return; if (v.razao > rz) { rz = v.razao; gov = v.nome; } }); return { razao: rz, governante: gov, ok: rz <= 1 + 1e-9 }; }
  function dwMin(t) { var Nn = N(); return Nn && Nn.soldaMin ? Nn.soldaMin(t).perna : (t <= 6.35 ? 3 : t <= 12.5 ? 5 : t <= 19 ? 6 : 8); }
  var ANALOGIA = "POR ANALOGIA — CONFERIR: a NBR 8800:2008 e a NBR 16239:2013 não tratam tubo soldado de topo na alma de perfil aberto; EN 1993-1-8:2005 Tabela 7.11 (plastificação da face, nó T/Y de tubo retangular) com a alma do U como face (b0 = bw, t0 = tw), kn da 7.5.2.1, γa1 = 1,10 no lugar do γM5";

  /* pegada do tubo na alma: h1 no plano (ao longo do U), b1 fora do plano */
  function pegada(tb, th) {
    var s = Math.max(0.2, Math.sin(th));
    if (tb.forma === "CHS") { var a = tb.d / 2 / s, b = tb.d / 2, hh = Math.pow(a - b, 2) / Math.pow(a + b, 2); return { h1: tb.d, b1: tb.d, Lw: Math.PI * (a + b) * (1 + 3 * hh / (10 + Math.sqrt(4 - 3 * hh))), comp: tb.d / s }; }
    return { h1: tb.h, b1: tb.b, Lw: 2 * tb.h / s + 2 * tb.b, comp: tb.h / s };
  }

  /* 1. SOLDA DE FILETE NO CONTORNO (NBR 8800:2008 6.2.5) */
  function solda(o, dw) {
    var th = num(o.theta, 90) * Math.PI / 180, pg = pegada(o.tubo, th), t1 = o.tubo.t, tw = o.U.t, tmin = Math.min(t1, tw), d0 = dwMin(tmin);
    dw = dw == null ? d0 : dw;
    var Rw = 0.6 * FW * 0.707 * dw / GW2, Rt = 0.6 * num(o.tubo.fy, 250) * Math.min(dw, t1) / GA1, Ru = 0.6 * num(o.U.fy, 250) * Math.min(dw, tw) / GA1, porMm = Math.min(Rw, Rt, Ru), Rd = porMm * pg.Lw / 1000;
    var vP = verif("Perna do filete ≤ parede mais fina (dw = " + dw + " mm; mín(t tubo, t alma) = " + br(tmin, 2) + " mm)", "ABNT NBR 8800:2008, Tabela 10 (perna mínima " + d0 + " mm pela parte menos espessa) — perna maior que a parede fura o tubo: critério do projeto (21/11/2026, o mesmo da escora passante)",
      [passo("Perna mínima", "Tabela 10, parte menos espessa (" + br(tmin, 2) + " mm)", d0 + " mm"), passo("Perna adotada", "dwMin … ⌊mín(t1; tw)⌋", dw + " mm")], tmin, dw, "mm");
    if (dw <= tmin + 1e-9) vP.razao = 0;
    var vW = verif("Solda de filete no contorno do tubo (" + dw + " mm × " + br(pg.Lw, 0) + " mm)", "ABNT NBR 8800:2008, 6.2.5 e Tabela 8 (Fw,Rd = 0,60·Aw·fw/γw2; metal-base 0,60·AMB·fy/γa1) — conferir no texto",
      [passo("Contorno Lw", o.tubo.forma === "CHS" ? "perímetro da elipse d × d/sen θ" : "2·h1/sen θ + 2·b1 = 2·" + br(pg.h1, 1) + "/" + br(Math.sin(th), 4) + " + 2·" + br(pg.b1, 1), br(pg.Lw, 1) + " mm"),
       passo("Metal da solda", "0,60·fw·0,707·dw/γw2 = 0,60·485·0,707·" + dw + "/1,35", br(Rw, 1) + " N/mm"),
       passo("Metal-base", "0,60·fy·mín(dw; t)/γa1 — tubo " + br(Rt, 1) + " N/mm; alma " + br(Ru, 1) + " N/mm", br(Math.min(Rt, Ru), 1) + " N/mm"),
       passo("Fw,Rd", "mín(…)·Lw", br(Rd, 2) + " kN"), passo("Solicitante", "maior |N| da barra (envoltória ELU)", br(o.N, 2) + " kN")], Rd, o.N);
    return { dw: dw, dwMin: d0, Lw: pg.Lw, Rd: Rd, vPerna: vP, v: vW, ok: dw <= tmin + 1e-9 && vW.razao <= 1 + 1e-9 };
  }

  /* 2. ALMA DO U SOB A PONTA DO TUBO (analogia EN 1993-1-8 Tab. 7.11) */
  function almaTubo(o) {
    var th = num(o.theta, 90) * Math.PI / 180, s = Math.max(0.2, Math.sin(th)), pg = pegada(o.tubo, th), B = num(o.U.bw, 100), t = num(o.U.t, 3), fy = num(o.U.fy, 250);
    var beta = Math.min(0.99, pg.b1 / B), eta = pg.h1 / B, NcU = Math.max(0, num(o.NcU, 0)), sig0 = NcU > 0 ? NcU * 1000 / num(o.U.A, 1) : 0, n = sig0 / fy / GA1;
    var kn = NcU > 0 ? Math.max(0, Math.min(1, 1.3 - 0.4 * n / beta)) : 1;
    var Rd = kn * fy * t * t / ((1 - beta) * s) * (2 * eta / s + 4 * Math.sqrt(1 - beta)) / GA1 / 1000;
    var v = verif("Alma do " + (o.U.nome || "U") + " sob a ponta do tubo (plastificação, força da barra)", ANALOGIA + "; fora da validade da Tabela 7.8 (β = " + br(beta, 3) + (beta < 0.25 ? " < 0,25" : "") + "; bw/tw = " + br(B / t, 1) + (B / t > 35 ? " > 35" : "") + ")",
      [passo("β, η", "b1/bw; h1/bw", br(beta, 3) + "; " + br(eta, 3), "bw = " + br(B, 0) + " mm, tw = " + br(t, 2) + " mm, θ = " + br(o.theta, 1) + "°"),
       passo("kn", NcU > 0 ? "1,3 − 0,4·n/β ≤ 1,0 (≥ 0), n = (σ0/fy)/γa1 = " + br(n, 3) + ", σ0 = Nc,U/A = " + br(sig0, 1) + " MPa" : "U tracionado: 1,0", br(kn, 3)),
       passo("N1,Rd", "kn·fy·tw²/((1 − β)·sen θ)·(2η/sen θ + 4·√(1 − β))/γa1", br(Rd, 2) + " kN"), passo("Solicitante", "maior |N| da barra", br(o.N, 2) + " kN")], Rd, o.N);
    v.analogia = true;
    return { v: v, Rd: Rd, beta: beta, eta: eta, kn: kn, ok: v.razao <= 1 + 1e-9, comp: pg.comp };
  }

  function enrij(o, F, Lg) {
    var L = LD(); if (!L || !L.enrijecedores) return null;
    var e = L.enrijecedores({ F: F, U: { bw: o.U.bw, bf: o.U.bf, t: o.U.t }, fy: num(o.U.fy, 250) });
    if (!e) return null;
    e.Lg = Lg; e.peso = 2 * e.t * e.h * e.comprimento * ACO_KG;
    return e;
  }

  /* opção A (+ B): solda direto, subindo a perna; alma sozinha ou com enrijecedores */
  function direta(o) {
    var th = num(o.theta, 90) * Math.PI / 180, tmin = Math.min(o.tubo.t, o.U.t), d0 = dwMin(tmin), sw = null;
    for (var dw = d0; dw <= Math.max(d0, Math.floor(tmin + 1e-9)); dw++) { sw = solda(o, dw); if (sw.ok) break; }
    var al = almaTubo(o), vs = [sw.vPerna, sw.v, al.v], enr = null, tipo = sw.dw > d0 ? "A+" : "A";
    if (sw.ok && !al.ok) {
      enr = enrij(o, o.N * Math.sin(th), al.comp);
      if (enr) { al.v.informativa = true; al.v.nome += " — NÃO basta (razão " + br(al.v.razao, 2) + "): enrijecedores"; vs = vs.concat(enr.verificacoes); tipo = "B"; }
    }
    var f = fecha(vs);
    return { tipo: tipo, ok: sw.ok && f.ok, razao: sw.ok ? f.razao : Math.max(f.razao, sw.dwMin / tmin), governante: sw.ok ? f.governante : sw.vPerna.nome, verificacoes: vs, solda: { dw: sw.dw, Lw: Math.round(sw.Lw) },
             enrijecedores: enr, peso: enr ? enr.peso : 0, alma: al };
  }

  /* opção C: chapa de ligação (gusset) 8 mm na alma + parafusos passantes pelo tubo */
  function gusset(o) {
    var L = LD(), Nn = N(); if (!L || !L.parafusada || !Nn) return null;
    var th = num(o.theta, 90) * Math.PI / 180, s = Math.max(0.2, Math.sin(th)), t1 = o.tubo.t, tw = o.U.t, A1 = num(o.tubo.A, 0), b1 = o.tubo.forma === "CHS" ? o.tubo.d : o.tubo.b;
    var Aliq = A1 - 2 * (T_GUSSET + 2) * t1;
    var lp = L.parafusada({ N: o.N, Nt: o.Nt, planos: 2,
      partes: [{ papel: "chapa de ligação no rasgo (" + T_GUSSET + " mm)", t: T_GUSSET, fy: CH.fy, fu: CH.fu, conta: 1, ltFn: function (d) { return Nn.bordaMin(d, "serra").e; } },
               { papel: "parede do tubo", t: t1, fy: num(o.tubo.fy, 250), fu: num(o.tubo.fu, 400), conta: 2, fino: t1 < 4.75 }],
      perfil: { A: Aliq, t: t1, xc: 1e9, abas: 2, fu: num(o.tubo.fu, 400) } });
    if (!lp || !lp.n) return null;
    var lc = (lp.n - 1) * num(lp.passo, 40), e = num(lp.borda, 25), hg = cima10(C0 + lc + 2 * e), Lg0 = Math.max(100, cima10(b1 + 2 * e), cima10(hg * Math.abs(Math.cos(th)) + o.tubo.h / s));
    var sw = L.soldaChapa(o.N, Lg0, T_GUSSET, tw, num(o.U.fy, 250), 2), Lg = Math.max(Lg0, sw.Lw);
    /* a chapa: faixa de Whitmore na linha de parafusos (uma linha: bw = 2·lc·tan 30°, mínimo o diâmetro do furo + 2 bordas) */
    var bwW = Math.max(2 * lc * Math.tan(Math.PI / 6), 2 * e), vs = lp.verificacoes.concat([sw.v, sw.vPerna]);
    if (o.Nt > 0) vs.push(verif("Chapa de ligação — escoamento na faixa de Whitmore (bw = " + br(bwW, 0) + " mm)", "Whitmore / ABNT NBR 8800:2008 5.2.2", [passo("Nt,Rd", "bw·t·fy/γa1", br(bwW * T_GUSSET * CH.fy / GA1 / 1000, 2) + " kN")], bwW * T_GUSSET * CH.fy / GA1 / 1000, o.Nt));
    if (o.Nc > 0) {
      var lam = 0.65 * C0 * Math.sqrt(12) / T_GUSSET, Ne = Math.PI * Math.PI * 200000 / (lam * lam), l0 = Math.sqrt(CH.fy / Ne), chi = l0 <= 1.5 ? Math.pow(0.658, l0 * l0) : 0.877 / (l0 * l0), Rc = chi * bwW * T_GUSSET * CH.fy / GA1 / 1000;
      vs.push(verif("Chapa de ligação — compressão na faixa de Whitmore (K·L/r = " + br(lam, 1) + ")", "Thornton (K = 0,65, L = c0 = " + C0 + " mm) / ABNT NBR 8800:2008 5.3", [passo("χ", "curva da 5.3.3, Q = 1", br(chi, 3)), passo("Nc,Rd", "χ·bw·t·fy/γa1", br(Rc, 2) + " kN")], Rc, o.Nc));
    }
    var F = o.N * s, ua = L.almaU({ F: F, Lg: Lg, tp: T_GUSSET, U: { bw: o.U.bw, t: o.U.t, A: o.U.A }, fy: num(o.U.fy, 250), Nc: num(o.NcU, 0), nome: o.U.nome }), enr = null;
    vs.push(ua);
    if (ua.razao > 1 + 1e-9) { enr = enrij(o, F, Lg); if (enr) { ua.informativa = true; ua.nome += " — NÃO basta (razão " + br(ua.razao, 2) + "): enrijecedores"; vs = vs.concat(enr.verificacoes); } }
    var f = fecha(vs), peso = T_GUSSET * Lg * hg * ACO_KG + (enr ? enr.peso : 0);
    return { tipo: enr ? "C+B" : "C", ok: f.ok && lp.ok !== false, razao: f.razao, governante: f.governante, verificacoes: vs, peso: peso, enrijecedores: enr,
             gusset: { t: T_GUSSET, Lg: Lg, hg: hg, solda: { dw: sw.dw, Lw: sw.Lw, filetes: 2 }, parafusos: { n: lp.n, id: lp.id, classe: lp.classe, passo: lp.passo, borda: lp.borda } } };
  }

  /* candidatas da opção D (mesma medida externa, parede maior) */
  function alternativasDe(nome) {
    var C = Cat(); if (!C || !C.obter) return [];
    var x = C.obter(nome); if (!x || !x.serie || !/^tubo/.test(x.forma || "")) return [];
    var rx = /^(T[QRC] [\d,]+(?: x [\d,]+)?) x ([\d,]+) (.*)$/.exec(nome); if (!rx) return [];
    return arr(C.listar(x.serie)).map(function (n) { var m = /^(T[QRC] [\d,]+(?: x [\d,]+)?) x ([\d,]+) (.*)$/.exec(n); return m && m[1] === rx[1] && m[3] === rx[3] ? C.obter(n) : null; })
      .filter(function (q) { return q && num(q.t, 0) > num(x.t, 0) + 1e-9; }).sort(function (a, b) { return a.t - b.t; })
      .map(function (q) { return { nome: q.nome, forma: q.forma === "tubo-circ" ? "CHS" : "RHS", h: num(q.h, num(q.d, 0)), b: num(q.b, num(q.d, 0)), d: num(q.d, 0), t: num(q.t, 0), A: num(q.A, 0) }; });
  }

  /* UMA PONTA: A/B, C e (alternativa) D — adota a mais leve que passa entre as que não mudam a barra */
  function ponta(o) {
    var cands = [], a = direta(o); cands.push(a);
    var c = gusset(o); if (c) cands.push(c);
    var pass = cands.filter(function (x) { return x.ok; }).sort(function (x, y) { return x.peso - y.peso || (x.tipo < y.tipo ? -1 : 1); });
    var ad = pass[0] || cands.slice().sort(function (x, y) { return x.razao - y.razao; })[0];
    var out = { ok: !!pass[0], adotada: ad.tipo, razao: ad.razao, governante: ad.governante, verificacoes: ad.verificacoes, peso: ad.ok ? ad.peso : null, solda: ad.solda || null,
                enrijecedores: ad.enrijecedores || null, gusset: ad.gusset || null, direta: a.tipo === "A" && a.ok, razaoDireta: a.razao, governanteDireta: a.governante, troca: null };
    /* D: trocar a parede (alternativa, não aplicada) — a primeira espessura cuja solda direta (A/B) passa */
    var alts = arr(o.alternativas); if (!o.alternativas && o.tubo.nome) alts = alternativasDe(o.tubo.nome);
    for (var i = 0; i < alts.length; i++) {
      var q = alts[i], o2 = {}; Object.keys(o).forEach(function (k) { o2[k] = o[k]; });
      o2.tubo = { forma: q.forma, h: q.h, b: q.b, d: q.d, t: q.t, A: q.A, fy: o.tubo.fy, fu: o.tubo.fu, nome: q.nome };
      var d2 = direta(o2);
      if (d2.ok) { out.troca = { perfil: q.nome, t: q.t, tipo: d2.tipo, razao: d2.razao, dPesoBarra: (q.A - num(o.tubo.A, 0)) * num(o.L, 0) * 1000 * ACO_KG, pesoLigacao: d2.peso }; break; }
    }
    return out;
  }

  /* envoltória das combinações ÚLTIMAS (a mesma regra do js/metalchapano.js) */
  function envN(r, m) {
    var C = (r.analise && r.analise.combinacoes) || {}, Nt = 0, Nc = 0, viu = false;
    Object.keys(C).forEach(function (k) {
      if (/^caso_/.test(k) || /ELS|serv|freq|qp|rara/i.test(k)) return;
      var cb = C[k]; if (!cb || !cb.barras) return;
      arr(m.segs).forEach(function (s) { var b = cb.barras[s]; if (!b || b.inativa) return; arr(b.estacoes).forEach(function (e) { var x = num(e.N, 0); viu = true; if (x > Nt) Nt = x; if (-x > Nc) Nc = -x; }); });
    });
    if (!viu) { var p = r.membros && r.membros[m.id] && r.membros[m.id].pior, N0 = num(p && p.N, 0); if (N0 > 0) Nt = N0; else Nc = -N0; }
    return { Nt: Nt, Nc: Nc, N: Math.max(Nt, Nc) };
  }
  function tuboDe(m) {
    var s = (m.secao && m.secao.mm) || {}, f = String(s.forma || "");
    if (f === "tubo-circ") return { forma: "CHS", d: num(s.d, num(s.h, 0)), h: num(s.d, num(s.h, 0)), b: num(s.d, num(s.h, 0)), t: num(s.t, 0), A: num(s.A, 0) };
    if (/^tubo/.test(f)) return { forma: "RHS", h: num(s.h, 0), b: num(s.b, 0), t: num(s.t, 0), A: num(s.A, 0) };
    return null;
  }
  function ehBanzo(m) { return /banzo/i.test(String(m.nome || "") + " " + String(m.papelLivre || "")); }

  /* detecção sozinha (sem o js/metalnostubo.js): ponta de tubo de alma num nó sem outro tubo */
  function detectar(r) {
    var M = arr(r.modelo && r.modelo.membros), out = [];
    M.forEach(function (b) {
      if (!(b.calc && b.calc.tuboSoldado) || ehBanzo(b) || !tuboDe(b)) return;
      var ns = arr(b.nos); if (ns.length < 2) return;
      [ns[0], ns[ns.length - 1]].forEach(function (no) {
        var ch = M.filter(function (c) { return c !== b && arr(c.nos).indexOf(no) >= 0 && (ehBanzo(c) || !(c.calc && c.calc.tuboSoldado) || (arr(c.nos).indexOf(no) > 0 && arr(c.nos).indexOf(no) < arr(c.nos).length - 1)); });
        if (ch.length && !ch.some(function (c) { return tuboDe(c); })) out.push({ b: b, no: no, ch: ch });
      });
    });
    return out;
  }

  var ROT = { A: "solda direta", "A+": "solda direta com perna maior", B: "solda direta + enrijecedores na alma", C: "chapa de ligação + parafusos passantes", "C+B": "chapa de ligação + parafusos passantes + enrijecedores" };

  function verificar(r, op) {
    op = op || {};
    var out = { pontas: [], n: 0, diretas: 0, corrigidas: 0, reprovados: 0, naoVerificados: 0, ligacoes: [], enrijecedores: [], gussets: [], trocas: {}, pesoChapas: 0, porSolucao: {}, pendencias: [], resumo: "",
                premissas: "esforço da barra = envoltória ELU (maior |N|); alma do U " + ANALOGIA + "; eletrodo E70XX; chapa de ligação ASTM A36 " + T_GUSSET + " mm; peso da comparação = só o aço das chapas; " +
                  "pontas no mesmo nó verificadas uma a uma (afastamento entre as pegadas e excentricidade do nó: detalhe de fábrica)" };
    if (!r || !r.modelo) return out;
    var M = arr(r.modelo.membros), NI = r.modelo.noInfo || {}, pts = op.pontas || detectar(r), cacheEnv = {}, grupos = {};
    function P(id) { var I = NI[id]; return I && I.P; }
    function E(m) { return cacheEnv[m.id] || (cacheEnv[m.id] = envN(r, m)); }
    pts.forEach(function (q) {
      var b = q.b, tb = tuboDe(b), p0 = P(q.no);
      var U = arr(q.ch).filter(function (c) { var s = c.secao && c.secao.mm; return s && s.forma === "frio" && num(s.bw, 0) > 0 && !(num(s.D, 0) > 0) && !/^Ue/.test(String(c.secao.nome || "")); });
      var u = U.filter(function (c) { var i = arr(c.nos).indexOf(q.no); return i > 0 && i < arr(c.nos).length - 1; })[0] || U[0];
      var reg = { no: q.no, barra: b.id, perfil: b.secao && b.secao.nome, U: u ? u.id : null, UPerfil: u ? u.secao.nome : null };
      if (!u || !tb || !p0) { reg.ok = false; reg.naoVerificado = !u ? "a peça do nó não é um U (" + arr(q.ch).map(function (c) { return c.secao && c.secao.nome; }).join(", ") + ")" : "sem geometria"; out.pontas.push(reg); out.naoVerificados++; return; }
      var cn = arr(u.nos), i = cn.indexOf(q.no), pv = P(cn[i + 1] != null ? cn[i + 1] : cn[i - 1]), outra = arr(b.nos)[arr(b.nos)[0] === q.no ? arr(b.nos).length - 1 : 0], pq = P(outra);
      if (!pv || !pq) { reg.ok = false; reg.naoVerificado = "sem geometria"; out.pontas.push(reg); out.naoVerificados++; return; }
      var eu = norm(sub(pv, p0)), et = norm(sub(pq, p0)), th = Math.acos(Math.min(1, Math.abs(dot(eu, et)))) * 180 / Math.PI;
      /* RHS: o lado no plano (h1) — eixo ey do tubo ∥ normal do plano → o lado h fica fora do plano */
      var nPl = cross(eu, et), nL = Math.sqrt(dot(nPl, nPl)), t2 = { forma: tb.forma, h: tb.h, b: tb.b, d: tb.d, t: tb.t, A: tb.A, fy: num(b.aco && b.aco.fy, 250), fu: num(b.aco && b.aco.fu, 400), nome: b.secao.nome };
      if (tb.forma === "RHS" && nL > 1e-6 && b.ey && Math.abs(dot(norm(b.ey), [nPl[0] / nL, nPl[1] / nL, nPl[2] / nL])) > 0.7) { t2.h = tb.b; t2.b = tb.h; }
      var su = u.secao.mm, Eb = E(b), Eu = E(u);
      var o = { tubo: t2, U: { bw: num(su.bw, 100), bf: num(su.bf, 50), t: num(su.t, num(su.tw, 3)), A: num(su.A, 1), fy: num(u.aco && u.aco.fy, 250), nome: u.secao.nome }, N: Eb.N, Nt: Eb.Nt, Nc: Eb.Nc, theta: th, NcU: Eu.Nc, L: num(b.L, 0) };
      var gk = t2.nome + "|" + o.U.nome + "|" + Math.round(th / 5) * 5, alts = grupos["alt:" + t2.nome] || (grupos["alt:" + t2.nome] = alternativasDe(t2.nome)); o.alternativas = alts;
      var res = ponta(o);
      reg.theta = Math.round(th * 10) / 10; reg.N = Math.round(o.N * 100) / 100; reg.NcU = Math.round(o.NcU * 10) / 10; reg.ok = res.ok; reg.adotada = res.ok ? res.adotada : null; reg.razao = res.razao; reg.governante = res.governante;
      reg.direta = res.direta; reg.razaoDireta = res.razaoDireta; reg.peso = res.peso; reg.troca = res.troca; reg.solda = res.solda; reg.gusset = res.gusset; reg.enrijecedores = res.enrijecedores ? { t: res.enrijecedores.t, h: res.enrijecedores.h, comprimento: res.enrijecedores.comprimento, Lg: res.enrijecedores.Lg } : null;
      if (!res.ok) Object.defineProperty(reg, "_o", { value: o, enumerable: false });   /* a entrada da ponta reprovada: a troca do U (abaixo) refaz a conta com o U maior */
      out.pontas.push(reg); out.n++;
      if (!res.ok) out.reprovados++; else if (res.direta) out.diretas++; else out.corrigidas++;
      if (res.ok) { out.porSolucao[res.adotada] = (out.porSolucao[res.adotada] || 0) + 1; out.pesoChapas += res.peso; }
      /* 3D: enrijecedores (formato r.ligDim.modelo.enrijecedores) e chapa de ligação */
      if (res.ok && res.enrijecedores) {
        var en = res.enrijecedores;
        /* um par por nó do U (pontas no mesmo nó dividem o par: o mais espesso e a maior pegada) */
        var ek = q.no + "|" + u.id, ja = out.enrijecedores.filter(function (x) { return x.no + "|" + x.membro === ek; })[0];
        if (ja) { if (en.t / 1000 > ja.t) { ja.t = en.t / 1000; ja.soldaAlma = en.soldaAlma; ja.soldaAbas = en.soldaAbas; } ja.Lg = Math.max(ja.Lg, en.Lg / 1000); }
        else out.enrijecedores.push({ no: q.no, membro: u.id, peca: u.peca, barraId: u.calc ? u.calc.barraId : null, P: p0, t: en.t / 1000, h: en.h / 1000, comprimento: en.comprimento / 1000, Lg: en.Lg / 1000, soldaAlma: en.soldaAlma, soldaAbas: en.soldaAbas, U: u.secao.nome, origem: "tuboU" });
      }
      if (res.ok && res.gusset) out.gussets.push({ no: q.no, membro: u.id, barraId: u.calc ? u.calc.barraId : null, tuboBarraId: b.calc ? b.calc.barraId : null, P: p0, dir: et, t: res.gusset.t / 1000, Lg: res.gusset.Lg / 1000, hg: res.gusset.hg / 1000, solda: res.gusset.solda, parafusos: res.gusset.parafusos, U: u.secao.nome, tubo: t2.nome });
      /* memória: uma ligação por grupo (tubo × U × θ), a ponta de maior razão */
      var gl = grupos[gk];
      if (!gl || res.razao > gl.razao) {
        var l = { tipo: "tuboU", nome: "Tubo " + t2.nome + " soldado na alma do " + o.U.nome + " (θ ≈ " + Math.round(th) + "°)", membro: b.id, peca: b.peca, barraId: b.calc ? b.calc.barraId : null, ok: res.ok, razao: res.razao, governante: res.governante, verificacoes: res.verificacoes,
                  esforcos: { Nt: o.Nt, Nc: o.Nc, V: 0 }, foraDaContagem: true, conta: gl ? gl.conta : 0 };
        l.resumo = (res.ok ? ROT[res.adotada] : "REPROVADA — nenhuma correção passa") + (res.solda ? "; filete " + res.solda.dw + " mm no contorno (" + res.solda.Lw + " mm)" : "") +
          (res.gusset ? "; chapa " + res.gusset.t + " × " + res.gusset.Lg + " × " + res.gusset.hg + " mm, " + res.gusset.parafusos.n + " × " + res.gusset.parafusos.id + " " + res.gusset.parafusos.classe + " passantes" : "") +
          (res.enrijecedores ? "; 2 enrijecedores " + br(res.enrijecedores.t, 1) + " × " + br(res.enrijecedores.h, 0) + " mm" : "") + (res.troca ? "; alternativa: " + res.troca.perfil + " (solda direta)" : "");
        grupos[gk] = l;
      }
      grupos[gk].conta++;
    });
    Object.keys(grupos).forEach(function (k) { if (/^alt:/.test(k)) return; var l = grupos[k]; l.nome += " — " + l.conta + " ponta(s)"; out.ligacoes.push(l); });
    /* D: alternativa por BARRA (as duas pontas): trocar a parede quando o Δ da barra pesa menos que as chapas das pontas dela */
    var porBarra = {}, nNo = {};
    out.pontas.forEach(function (p) { if (p.ok && !p.direta) nNo[p.no + "|" + p.U] = (nNo[p.no + "|" + p.U] || 0) + 1; });
    /* reprovada em A/B/C com troca possível → a troca é a CORREÇÃO (obrigatória); a ponta continua reprovada neste cálculo até aplicar */
    out.pontas.forEach(function (p) { if (p.naoVerificado || (p.ok && p.direta)) return; var x = porBarra[p.barra] || (porBarra[p.barra] = { peso: 0, troca: null, pontas: 0, reprovada: false }); x.peso += num(p.peso, 0) / Math.max(1, nNo[p.no + "|" + p.U] || 1);   /* chapa/enrijecedor dividido no nó: a parte desta ponta */ x.pontas++; if (!p.ok) x.reprovada = true; if (p.troca && (!x.troca || p.troca.t > x.troca.t)) x.troca = p.troca; });
    Object.keys(porBarra).forEach(function (id) { var x = porBarra[id]; if (x.troca && (x.reprovada || x.troca.dPesoBarra < x.peso - 1e-9)) out.trocas[id] = { perfil: x.troca.perfil, obrigatoria: x.reprovada, dPesoBarra: Math.round(x.troca.dPesoBarra * 100) / 100, pesoChapasEvitado: Math.round(x.peso * 100) / 100 }; });
    out.pontas.forEach(function (p) { if (!p.ok && !p.naoVerificado && out.trocas[p.barra]) { p.correcao = "trocar a parede: " + out.trocas[p.barra].perfil; out.resolviveisPorTroca = (out.resolviveisPorTroca || 0) + 1; } });
    /* E: SUBIR O U DA COLUNA (22/11/2026) — a ponta reprova porque a ALMA DO U é mais fina que o filete mínimo ou não resiste (a troca de
       parede do tubo não resolve: o lado fino é o U). Candidatas: a MESMA família do catálogo (série do U, NBR 6650 CF), U simples com
       alma e aba ≥ às de agora e área maior, da mais leve para a mais pesada; adota, por membro U, a primeira em que TODAS as pontas
       reprovadas dele passam (com a parede trocada do tubo, se houver). Muda a barra: sai como troca (out.trocasU) e o auto-corrige
       aplica, fixa e recalcula; sem candidata que passe → out.semTrocaU (o cartão explica). */
    out.trocasU = {}; out.semTrocaU = [];
    var porU = {};
    out.pontas.forEach(function (p) { if (p.ok || p.naoVerificado || !p._o || !p.U) return; (porU[p.U] || (porU[p.U] = [])).push(p); });
    Object.keys(porU).forEach(function (uid) {
      var ps = porU[uid], o0 = ps[0]._o, cands = candidatasU(o0.U.nome), adot = null;
      /* com o U q: cada ponta passa com o tubo de agora (ou a parede já trocada) ou, se o tubo também for fino, com a menor parede
         maior do tubo (a troca combinada tubo + U) → { ok, tubos: { barra: perfil } } */
      function passaCom(q) {
        var tubos = {};
        var ok = ps.every(function (p) {
          var tr = out.trocas[p.barra], lst = [null].concat(arr(p._o.alternativas));
          if (tr) { var tt = (arr(p._o.alternativas).filter(function (b) { return b.nome === tr.perfil; })[0] || { t: 0 }).t; lst = arr(p._o.alternativas).filter(function (b) { return b.t >= tt - 1e-9; }); }
          for (var j = 0; j < lst.length; j++) {
            var alt = lst[j], o2 = {}; Object.keys(p._o).forEach(function (k) { o2[k] = p._o[k]; });
            o2.U = { bw: q.bw, bf: q.bf, t: q.t, A: q.A, fy: p._o.U.fy, nome: q.nome }; o2.alternativas = [];
            if (alt) o2.tubo = { forma: alt.forma, h: alt.h, b: alt.b, d: alt.d, t: alt.t, A: alt.A, fy: p._o.tubo.fy, fu: p._o.tubo.fu, nome: alt.nome };
            if (ponta(o2).ok) { if (alt && (!tr || alt.nome !== tr.perfil)) tubos[p.barra] = alt; return true; }
          }
          return false;
        });
        return { ok: ok, tubos: tubos };
      }
      var tubosU = null;
      for (var i = 0; i < cands.length; i++) { var pc = passaCom(cands[i]); if (pc.ok) { adot = cands[i]; tubosU = pc.tubos; break; } }
      /* a troca combinada: a parede do tubo que o U novo pede entra como troca OBRIGATÓRIA da barra */
      if (adot) Object.keys(tubosU).forEach(function (bid) { var a = tubosU[bid], p0 = ps.filter(function (p) { return p.barra === bid; })[0];
        out.trocas[bid] = { perfil: a.nome, obrigatoria: true, dPesoBarra: Math.round((a.A - num(p0._o.tubo.A, 0)) * num(p0._o.L, 0) * 1000 * ACO_KG * 100) / 100, pesoChapasEvitado: 0, comU: adot.nome }; });
      var tFino = ps.every(function (p) { return num(p._o.tubo.t, 0) < dwMin(Math.min(num(p._o.tubo.t, 0), num(p._o.U.t, 0))) - 1e-9 && !arr(p._o.alternativas).length; });
      var gv = ps[0].governante;
      if (adot) { out.trocasU[uid] = { perfil: adot.nome, de: o0.U.nome, pontas: ps.length, motivo: "alma do " + o0.U.nome + " (" + br(o0.U.t, 2) + " mm) reprova " + ps.length + " ponta(s) de tubo: " + String(gv || "").split(" (")[0] };
        ps.forEach(function (p) { if (!out.trocas[p.barra] || !p.correcao) p.correcao = (p.correcao ? p.correcao + "; " : "") + "subir o U da coluna: " + adot.nome; }); }
      else out.semTrocaU.push({ U: uid, perfil: o0.U.nome, pontas: ps.length, governante: gv, candidatas: cands.length,
        motivo: tFino ? "a parede do tubo " + ps[0].perfil + " (" + br(ps[0]._o.tubo.t, 2) + " mm) também é mais fina que o filete mínimo e não há parede maior dele no catálogo — subir o U não resolve; use um tubo de outra medida" : cands.length ? "nenhum U da família (" + cands.length + " testado(s), até " + cands[cands.length - 1].nome + ") faz as " + ps.length + " ponta(s) passarem" : "não há U maior na família do catálogo de " + o0.U.nome });
    });
    var nU = Object.keys(out.trocasU).length;
    if (nU) out.pendencias.push(nU + " trecho(s) de U da coluna sobem para a alma receber os tubos: " + Object.keys(out.trocasU).slice(0, 3).map(function (k) { return out.trocasU[k].de + " → " + out.trocasU[k].perfil; }).join("; ") + " — aplicar no modelo e recalcular (MetalTuboU.trocasDeU)");
    var kT = Object.keys(out.trocas), nT = kT.length, nOb = kT.filter(function (k) { return out.trocas[k].obrigatoria; }).length, dKg = kT.reduce(function (a, k) { return a + out.trocas[k].dPesoBarra; }, 0), evit = kT.reduce(function (a, k) { return a + out.trocas[k].pesoChapasEvitado; }, 0);
    out.pesoTrocas = Math.round(dKg * 10) / 10; out.pesoChapasEvitado = Math.round(evit * 10) / 10;
    if (nOb) out.pendencias.push(nOb + " barra(s) de tubo REPROVADAS na ponta do U só passam trocando a parede (mesma medida externa): " + kT.filter(function (k) { return out.trocas[k].obrigatoria; }).slice(0, 3).map(function (k) { return k + " → " + out.trocas[k].perfil; }).join("; ") + (nOb > 3 ? "…" : "") + " — aplicar no modelo e recalcular (MetalTuboU.trocasDeParede)");
    if (nT - nOb) out.pendencias.push((nT - nOb) + " barra(s) de tubo ficam mais leves trocando a parede em vez das chapas (+" + br(dKg, 0) + " kg de tubo contra " + br(evit, 0) + " kg de chapas, somando as obrigatórias) — muda a barra: aplicar no modelo e recalcular (MetalTuboU.trocasDeParede)");
    /* peso das chapas pelo que vai para a fábrica: um par de enrijecedores por nó do U e uma chapa de ligação por nó/U (a soma por
       ponta contava duas vezes o par dividido) */
    var gk2 = {}; out.pesoChapas = 0;
    out.enrijecedores.forEach(function (e) { out.pesoChapas += 2 * e.t * e.h * e.comprimento * 7850; });
    out.gussets.forEach(function (g) { var k = g.no + "|" + g.membro, v = g.t * g.Lg * g.hg * 7850; gk2[k] = Math.max(gk2[k] || 0, v); });
    Object.keys(gk2).forEach(function (k) { out.pesoChapas += gk2[k]; });
    out.pesoChapas = Math.round(out.pesoChapas * 10) / 10;
    out.resumo = out.n + " ponta(s) de tubo soldadas na alma do U verificadas (NBR 8800:2008 6.2.5; alma por analogia EN 1993-1-8 Tab. 7.11 — conferir): " + out.diretas + " passam direto, " + out.corrigidas + " corrigidas (" +
      Object.keys(out.porSolucao).filter(function (k) { return k !== "A"; }).map(function (k) { return out.porSolucao[k] + " " + ROT[k]; }).join(", ") + "), " + out.reprovados + " reprovada(s)" + (out.resolviveisPorTroca ? " (" + out.resolviveisPorTroca + " passam trocando a parede do tubo)" : "") + (out.naoVerificados ? ", " + out.naoVerificados + " não verificada(s)" : "") +
      "; chapas acrescentadas ≈ " + br(out.pesoChapas, 0) + " kg" + (nT ? "; " + nT + " barra(s) com alternativa de parede mais leve" : "");
    return out;
  }
  /* candidatas para subir o U: mesma série do catálogo, U simples (sem enrijecedor), alma e aba ≥, área maior; da mais leve */
  function candidatasU(nome) {
    var C = Cat(); if (!C || !C.obter) return [];
    var x = C.obter(nome); if (!x || !x.serie || !/^U /.test(String(x.nome || nome))) return [];
    var bw0 = num(x.bw, num(x.h, 0)), bf0 = num(x.bf, num(x.b, 0)), A0 = num(x.A, 0);
    return arr(C.listar(x.serie)).filter(function (n) { return /^U /.test(n) && n !== nome; }).map(function (n) { return C.obter(n); })
      .filter(function (q) { return q && q.forma === x.forma && num(q.bw, num(q.h, 0)) >= bw0 - 1e-9 && num(q.bf, num(q.b, 0)) >= bf0 - 1e-9 && num(q.A, 0) > A0 + 1e-9; })
      .map(function (q) { return { nome: q.nome, bw: num(q.bw, num(q.h, 0)), bf: num(q.bf, num(q.b, 0)), t: num(q.t, num(q.tw, 0)), A: num(q.A, 0) }; })
      .sort(function (a, b) { return a.A - b.A || a.t - b.t; });
  }
  function trocasDeU(res) { var o = {}; Object.keys((res && res.trocasU) || {}).forEach(function (k) { o[k] = res.trocasU[k].perfil; }); return o; }
  function trocasDeParede(res) { var o = {}; Object.keys((res && res.trocas) || {}).forEach(function (k) { o[k] = res.trocas[k].perfil; }); return o; }

  var MetalTuboU = { verificar: verificar, ponta: ponta, direta: direta, solda: solda, almaTubo: almaTubo, gusset: gusset, alternativasDe: alternativasDe, detectar: detectar, trocasDeParede: trocasDeParede, trocasDeU: trocasDeU, candidatasU: candidatasU, ROT: ROT, T_GUSSET: T_GUSSET };
  global.MetalTuboU = MetalTuboU;
  if (typeof module !== "undefined" && module.exports) module.exports = MetalTuboU;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
