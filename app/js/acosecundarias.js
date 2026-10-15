/* =====================================================================
 * acosecundarias.js — TERÇAS e TRAVESSAS DE FECHAMENTO do galpão (motor
 * PURO, ES5, sem DOM, Node-testável). Perfis formados a frio (Ue do
 * catálogo — NBR 6355) verificados pelo js/acodim14762.js (NBR 14762:2010,
 * método da resistência direta, faixas finitas do js/acofsm.js).
 *
 *   AcoSecundarias.dimensionar({ G, cargas, sobrecarga, vento, opcoes })
 *     G          resultado do AcoModelo.galpao (layout: vão, comprimento,
 *                pórticos, linhas de terça e de travessa, colunas de tapamento)
 *     cargas     { telhaPeso (kN/m² na superfície), permanenteExtra (kN/m²),
 *                  fechamentoPeso (kN/m², padrão = telhaPeso) }
 *     sobrecarga kN/m² em planta (NBR 6120:2019, 6.4 — do AcoCargas)
 *     vento      adaptador { casos, pressao(id, face, u, v) } (o mesmo do
 *                AcoModelo.cargas); sem vento → só gravidade
 *   → { tercas, travessas: { lateral, oitao }, pesoTotal, avisos, decisoes }
 *
 * O QUE O MOTOR DECIDE (e conta no memorial)
 *   · terça biapoiada entre pórticos (ligação por clip, sem continuidade);
 *   · linhas de CORRENTES (terças) e de TIRANTES (travessas): 0, 1 ou 2 por
 *     vão — fica o arranjo com o perfil mais leve (empate: menos linhas);
 *   · o perfil Ue MAIS LEVE do catálogo que passa em tudo:
 *       ELU gravidade  1,25·G + 1,35·G2 + 1,5·Q (+ 0,84·W pressão)
 *                      e 1,25·G + 1,35·G2 + 1,4·W + 1,2·Q   (mesa comprimida
 *                      presa na telha: sem FLT)
 *       ELU sucção     1,0·(G + G2) + 1,4·W (mesa livre comprimida: FLT entre
 *                      correntes e distorcional — opção `succao` do 14762)
 *       ELS            terças L/180 (rara, G + Q) e L/120 (sucção, só o
 *                      vento, característico); travessas L/120 ⊥ ao
 *                      fechamento (vento) e L/180 no plano (peso, entre
 *                      tirantes) — NBR 8800:2008 Tabela C.1 (a 2024 passou a
 *                      L/250 com outra combinação: conferir)
 *   · My (componente na água / peso do fechamento) com os DOIS sinais — a
 *     orientação do Ue muda qual borda comprime (a favor da segurança).
 * Unidades: m, kN, kN/m, kN·m; mm só na seção.
 * Teste: node tools/test-aco-secundarias.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function Cat() { return dep("PerfisAco", "./perfisaco.js"); }
  function D14() { return dep("AcoDim14762", "./acodim14762.js"); }
  function Mat() { return dep("AcoMateriais", "./acomateriais.js"); }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function br(v, c) { if (v == null || !isFinite(v)) return "—"; c = c == null ? 2 : c; return (Math.round(v * Math.pow(10, c)) / Math.pow(10, c)).toFixed(c).replace(".", ","); }
  var E = 200000;   /* MPa */
  var GAMA = { G: 1.25, G2: 1.35, Q: 1.5, W: 1.4, psiQ: 0.8, psiW: 0.6 };
  var LIM = { tercaGrav: 180, tercaSuc: 120, travPerp: 120, travPlano: 180 };

  /* catálogo: Ue (NBR 6355) por massa, sem os de chapa grossa (≥ 6 mm) */
  function candidatos() {
    var C = Cat(); if (!C) return [];
    return C.listar("UE").map(function (n) { var c = C.obter(n); return c ? { nome: n, bw: c.bw, bf: c.bf, D: c.D, t: c.t, ri: num(c.ri, c.t), massa: c.massa, Wx: c.Wx, Ix: c.Ix, Iy: c.Iy } : null; })
      .filter(function (c) { return c && c.t < 6 && c.bw <= 300 && c.Wx > 0; })
      .sort(function (a, b) { return a.massa - b.massa || a.bw - b.bw; });
  }

  /* pressões do vento numa faixa: média em amostras (4 × 4) de cada vão; devolve a maior pressão e a maior sucção */
  function ventoFaixa(vento, face, u0, u1, v0, v1) {
    var o = { pre: 0, suc: 0, casoPre: null, casoSuc: null };
    if (!vento || typeof vento.pressao !== "function") return o;
    arr(vento.casos).forEach(function (c) {
      var s = 0, n = 0;
      for (var a = 0; a < 4; a++) for (var b = 0; b < 4; b++) { s += num(vento.pressao(c.id, face, u0 + (a + 0.5) / 4 * (u1 - u0), v0 + (b + 0.5) / 4 * (v1 - v0)), 0); n++; }
      /* F6 (revisor, 15/10/2026): a estrutura secundária usa o q da CLASSE A também FORA das faixas de borda (NBR 6123:2023,
         6.1.3) — o caso vem com o q da classe da edificação (4–11 % abaixo); escala qLocal/q do caso, nunca para baixo */
      var fq = OPC.qClasseA && vento.qLocal > 0 && c.q > 0 ? Math.max(1, vento.qLocal / c.q) : 1;
      var p = s / n * fq;
      if (p > o.pre) { o.pre = p; o.casoPre = c.id; }
      if (p < o.suc) { o.suc = p; o.casoSuc = c.id; }
    });
    return o;
  }

  /* cpe MÉDIO das zonas de borda e de canto (NBR 6123:2023, 6.1.2 e 6.1.3; Tabela 4, nota c — paredes: faixa 0,2·b ou h,
   * o menor, nas pontas de cada face; Tabelas 5 e 6 com as figuras — cobertura: y = h ou 0,15·b, o menor, junto ao oitão,
   * aos beirais e à cumeeira). Vale para a ESTRUTURA SECUNDÁRIA: o memorial já dizia isso, mas as terças e as travessas
   * só liam o cpe da zona (achado do revisor, 15/10/2026). As zonas, o cpe médio e p = q(classe A)·(cpe médio − cpi mais
   * desfavorável) vêm prontos do js/acovento.js (R.zonas.locais), envoltória das quatro direções e das duas águas.
   * A barra cuja faixa de influência TOCA a zona leva o cpe médio no VÃO INTEIRO (a zona pode cobrir só parte do vão — a
   * favor da segurança); na largura, só a parte da faixa de influência que cai dentro da zona; vale o pior entre o cpe
   * médio e o da zona. OPC.cpeMedio = false só para o controle negativo dos testes. */
  var OPC = { cpeMedio: true, qClasseA: true };
  function localFaixa(vento, face, u0, u1, v0, v1, base) {
    var lc = vento && vento.locais; if (!OPC.cpeMedio || !lc) return null;
    var tol = 1e-6, itens = [];
    function sobre(a0, a1, b0, b1) { return Math.min(a1, b1) - Math.max(a0, b0); }
    if (face === "cobertura") {
      var rs = arr(lc.cobertura).filter(function (r) { return isFinite(r.p) && sobre(u0, u1, r.x0, r.x1) > tol && sobre(v0, v1, r.z0, r.z1) > tol; });
      if (!rs.length) return null;
      var cortes = [u0, u1]; rs.forEach(function (r) { [r.x0, r.x1].forEach(function (x) { if (x > u0 && x < u1) cortes.push(x); }); });
      cortes.sort(function (a, b) { return a - b; });
      var soma = 0, larg = u1 - u0;
      for (var i = 1; i < cortes.length; i++) {
        var s = cortes[i - 1], t = cortes[i], m = (s + t) / 2, pS = base, rS = null; if (t - s < tol) continue;
        rs.forEach(function (r) { if (m >= r.x0 - tol && m <= r.x1 + tol && r.p < pS) { pS = r.p; rS = r; } });
        soma += pS * (t - s);
        if (rS) { var it = itens.filter(function (q) { return q.zona === rS.zona; })[0]; if (it) it.largura += t - s; else itens.push({ zona: rS.zona, cpe: rS.cpe, cpi: rS.cpi, coef: rS.coef, p: rS.p, largura: t - s }); }
      }
      return itens.length ? { w: larg > 0 ? soma / larg : base, itens: itens } : null;
    }
    var fs = arr((lc.paredes || {})[face]).filter(function (f) { return isFinite(f.p) && sobre(u0, u1, f.s0, f.s1) > tol; }), pior = null;
    fs.forEach(function (f) { if (f.p < base && (!pior || f.p < pior.p)) pior = f; });
    return pior ? { w: pior.p, itens: [{ zona: pior.zona, cpe: pior.cpe, cpi: pior.cpi, coef: pior.coef, p: pior.p, largura: null }] } : null;
  }
  function fz(v, c) { var s = br(v, c); return v < 0 ? "−" + s.replace("-", "") : s; }
  var ZONA_TXT = { oitao: "faixa do oitão", beiral1: "beiral junto ao oitão", beiral2: "beiral, trecho central", cumeeira: "cumeeira",
                   He: "faixa do oitão (metade alta)", Le: "faixa do oitão (metade baixa)", H1: "beiral alto junto ao oitão", L1: "beiral baixo junto ao oitão",
                   H2: "beiral alto, trecho central", L2: "beiral baixo, trecho central", "cpe médio": "faixa de borda da parede" };
  /* o registro do memorial: em qual faixa cada barra está e o cpe usado (decisão + objeto no resultado) */
  function registroBorda(vento, regs, sucZona, suc, nome, rot, decisoes) {
    var lc = vento && vento.locais;
    if (!lc) return { aplicado: false, motivo: vento && vento.casos ? "o vento não trouxe as zonas de borda (cpe médio)" : "sem vento" };
    var fonte = "NBR 6123:2023, 6.1.2 e 6.1.3 — Tabela 4 (nota c: faixa 0,2·b ou h, o menor) e Tabelas 5/6 com as figuras (y = h ou 0,15·b, o menor)";
    var linhas = regs.map(function (r) {
      var zs = Object.keys(r.zonas).map(function (k) { return r.zonas[k]; }).sort(function (a, b) { return a.p - b.p; });
      if (!zs.length) return { barra: rot(r), borda: false, texto: nome + " " + rot(r) + ": fora das faixas de borda — cpe da zona (sucção " + fz(r.sucZona, 3) + " kN/m²)" };
      return { barra: rot(r), borda: true, vaos: r.vaos.slice(), zonas: zs, suc: r.suc, sucZona: r.sucZona,
               texto: nome + " " + rot(r) + ": " + zs.map(function (z) { return (ZONA_TXT[z.zona] || z.zona) + " (cpe médio " + fz(z.cpe, 2) + ", cpi " + fz(z.cpi, 2) + " → p = " + fz(z.p, 3) + " kN/m²)"; }).join("; ") +
                      " nos vãos " + r.vaos.join(", ") + " — sucção usada " + fz(r.suc, 3) + " kN/m² (zona: " + fz(r.sucZona, 3) + ")" };
    });
    var nB = linhas.filter(function (l) { return l.borda; }).length;
    decisoes.push({ tema: (nome === "terça" ? "Terças" : "Travessas") + " — cpe médio das zonas de borda",
      decisao: nB + " de " + linhas.length + " " + (nome === "terça" ? "linha(s) de terça" : "barra(s)") + " em faixa de borda/canto; sucção de cálculo " + fz(suc, 3) + " kN/m² (só com o cpe da zona seria " + fz(sucZona, 3) + ")" + (linhas.length ? ". " + linhas.map(function (l) { return l.texto; }).join(". ") : ""),
      motivo: fonte + "; q da classe A, cpi mais desfavorável; a barra que toca a faixa leva o cpe médio no vão inteiro (a favor da segurança) e vale o pior entre o médio e o da zona" });
    return { aplicado: true, fonte: fonte, sucZona: sucZona, suc: suc, governa: suc < sucZona - 1e-9, linhas: linhas };
  }

  /* dimensiona UMA família de barra biapoiada (terça ou travessa)
   * d = { tipo, L (m, vão), s (m, faixa de influência), gSup (kN/m², permanente na superfície, G2), gPlano (kN/m² em planta, G2),
   *       q (kN/m² em planta, sobrecarga), wPre, wSuc (kN/m², ⊥ à superfície), th (rad: inclinação; travessa: π/2 → peso todo no plano) } */
  function dimensionarBarra(d, aco) {
    var D = D14(), cands = candidatos(), L = d.L, Lmm = L * 1000, cs = Math.cos(d.th), sn = Math.sin(d.th), trav = d.tipo === "travessa";
    var opcoesLinhas = L <= 4.5 ? [0, 1, 2] : [1, 2];
    var melhores = [];
    opcoesLinhas.forEach(function (nc) {
      var a = L / (nc + 1), amm = a * 1000;
      for (var k = 0; k < cands.length; k++) {
        var c = cands[k], gP = c.massa * 9.81 / 1000;                                        /* kN/m (G — aço) */
        /* cargas por metro: componentes ⊥ (n) e na direção do plano/água (t) */
        var g2 = d.gSup * d.s + d.gPlano * d.s * cs, qv = d.q * d.s * cs;                    /* verticais por metro */
        var Gn, Gt, Qn, Qt;
        if (trav) { Gn = 0; Gt = gP + g2; Qn = 0; Qt = 0; }                                  /* travessa: peso no plano do fechamento */
        else { Gn = gP * cs; Gt = gP * sn; Qn = qv * cs; Qt = qv * sn; }
        var G2n = trav ? 0 : g2 * cs, G2t = trav ? 0 : g2 * sn;
        var Wp = d.wPre * d.s, Ws = d.wSuc * d.s;                                            /* ⊥, + para dentro/para baixo */
        var combs = [];
        if (trav) {
          combs.push({ nome: "1,40·W (pressão) + 1,25·G + 1,35·G2", n: GAMA.W * Wp, t: GAMA.G * gP + GAMA.G2 * g2, suc: false });
          if (Ws < 0) combs.push({ nome: "1,40·W (sucção) + 1,00·(G + G2)", n: GAMA.W * Ws, t: gP + g2, suc: true });
        } else {
          combs.push({ nome: "1,25·G + 1,35·G2 + 1,50·Q" + (Wp > 0 ? " + 0,84·W" : ""), n: GAMA.G * Gn + GAMA.G2 * G2n + GAMA.Q * Qn + (Wp > 0 ? GAMA.W * GAMA.psiW * Wp : 0), t: GAMA.G * Gt + GAMA.G2 * G2t + GAMA.Q * Qt, suc: false });
          if (Wp > 0) combs.push({ nome: "1,25·G + 1,35·G2 + 1,40·W + 1,20·Q", n: GAMA.G * Gn + GAMA.G2 * G2n + GAMA.W * Wp + GAMA.Q * GAMA.psiQ * Qn, t: GAMA.G * Gt + GAMA.G2 * G2t + GAMA.Q * GAMA.psiQ * Qt, suc: false });
          if (Ws < 0) combs.push({ nome: "1,00·(G + G2) + 1,40·W (sucção)", n: Gn + G2n + GAMA.W * Ws, t: Gt + G2t, suc: true });
          /* carga concentrada de 1 kN no meio do vão, no lugar da sobrecarga distribuída (NBR 6120:2019, 6.4): entra como
             a distribuída equivalente no MOMENTO (P·L/4 = qeq·L²/8 → qeq = 2P/L) */
          if (d.P > 0) { var qeq = 2 * d.P / L; combs.push({ nome: "1,25·G + 1,35·G2 + 1,50·P (1 kN no meio do vão)", n: GAMA.G * Gn + GAMA.G2 * G2n + GAMA.Q * qeq * cs, t: GAMA.G * Gt + GAMA.G2 * G2t + GAMA.Q * qeq * sn, suc: false, concentrada: true }); }
        }
        /* pré-filtro barato: Wx·fy/1,10 tem de vencer o maior Mx */
        var MxMax = 0; combs.forEach(function (cb) { MxMax = Math.max(MxMax, Math.abs(cb.n) * L * L / 8); });
        if (c.Wx * aco.fy / 1.10 / 1e6 < MxMax) continue;
        /* ELS antes (barato): flechas */
        var I = c.Ix, Iy = c.Iy;
        function flecha(qkNm, Lm, Imm) { return 5 * qkNm * Math.pow(Lm * 1000, 4) / (384 * E * Imm); }   /* mm (q em kN/m = N/mm) */
        var els = [];
        if (trav) {
          els.push({ nome: "Flecha ⊥ ao fechamento (vento característico): L/" + LIM.travPerp, valor: flecha(Math.max(Wp, -Ws), L, I), limite: Lmm / LIM.travPerp });
          els.push({ nome: "Flecha no plano do fechamento (peso, entre tirantes): L/" + LIM.travPlano, valor: flecha(gP + g2, a, Iy), limite: amm / LIM.travPlano });
        } else {
          els.push({ nome: "Flecha na gravidade (rara: G + G2 + Q): L/" + LIM.tercaGrav, valor: flecha(Gn + G2n + Qn, L, I), limite: Lmm / LIM.tercaGrav });
          if (Ws < 0) els.push({ nome: "Flecha na sucção (só o vento, característico): L/" + LIM.tercaSuc, valor: flecha(-Ws, L, I), limite: Lmm / LIM.tercaSuc });
        }
        if (els.some(function (e) { return e.valor > e.limite; })) continue;
        /* ELU pela NBR 14762 (as duas orientações do Ue: My com os dois sinais) */
        var sec = { tipo: "Ue", bw: c.bw, bf: c.bf, D: c.D, t: c.t, ri: c.ri }, pior = null, todas = [];
        for (var q = 0; q < combs.length; q++) {
          var cb = combs[q], Mx = cb.n * L * L / 8, My = cb.t * a * a / 8, Vy = Math.abs(cb.n) * L / 2, Vx = Math.abs(cb.t) * a / 2;
          [1, -1].forEach(function (sg) {
            var v = D.verificar(sec, aco, { N: 0, Mx: Mx, My: sg * My, Vx: Vx, Vy: Vy }, { Lx: Lmm, Ly: amm, Lt: cb.suc ? amm : Lmm, Cb: 1.0 },
              { terca: { mesaFixadaNaTelha: true, succao: cb.suc, Lcorrentes: amm } });
            if (!v || !v.verificacoes) return;
            var rz = num(v.aproveitamento, num(v.razao, Infinity));
            todas.push({ comb: cb.nome + (sg < 0 ? " (My −)" : ""), razao: rz, resultado: v, Mx: Mx, My: sg * My, Vy: Vy });
            if (!pior || rz > pior.razao) pior = { comb: cb.nome + (sg < 0 ? " (My −)" : ""), razao: rz, resultado: v, Mx: Mx, My: sg * My, Vy: Vy };
          });
          if (pior && pior.razao > 1) break;
        }
        if (!pior || pior.razao > 1) continue;
        melhores.push({ nc: nc, a: a, cand: c, pior: pior, combs: combs, els: els, cargas: { Gn: Gn, Gt: Gt, G2n: G2n, G2t: G2t, Qn: Qn, Qt: Qt, Wp: Wp, Ws: Ws } });
        break;
      }
    });
    if (!melhores.length) return { ok: false, tipo: d.tipo, motivo: "nenhum Ue do catálogo passa com até 2 linhas de " + (trav ? "tirantes" : "correntes") + " no vão de " + br(L, 2) + " m", sugestao: trav ? "Mais colunas de tapamento (vão menor) ou perfil laminado (U/W)." : "Pórticos mais próximos ou terça treliçada/laminada." };
    melhores.sort(function (x, y) { return x.cand.massa - y.cand.massa || x.nc - y.nc; });
    var m = melhores[0], v = m.pior.resultado;
    var verificacoes = v.verificacoes.map(function (q) { return { nome: q.nome, item: q.item, passos: arr(q.passos), resistencia: q.resistencia, unidade: q.unidade, solicitante: q.solicitante, razao: q.razao }; });
    m.els.forEach(function (e) { verificacoes.push({ nome: e.nome, item: "NBR 8800:2008, Tabela C.1 (NBR 14762:2010, Tabela A.1)", passos: [{ rotulo: "Flecha", formula: "5·q·L⁴/(384·E·I)", valor: br(e.valor, 1) + " mm" }], resistencia: e.limite, unidade: "mm", solicitante: e.valor, razao: e.valor / e.limite }); });
    /* CORRENTE (terças) / TIRANTE (travessas): a reação de apoio lateral de cada barra (1,25·q·a — barra contínua sobre as
       linhas) acumula ao longo da linha até a cumeeira (terças da água) ou até o beiral (travessas da parede); barra
       redonda com rosca: mín(Ag·fy/γa1; 0,75·Ab·fu/γa2) — NBR 8800, 5.2 e 6.3.3.1 */
    var linha = null;
    if (m.nc > 0) {
      var qPl = 0; m.combs.forEach(function (cb) { qPl = Math.max(qPl, Math.abs(cb.t)); });
      var nAc = Math.max(1, Math.round(num(d.nLinhaTirante, 1))), F1 = 1.25 * qPl * m.a, Ft = nAc * F1;
      var Mt = Mat(), ab = (Mt && Mt.aco(Mt.PADRAO.barra)) || { id: "ASTM A36", fy: 250, fu: 400 };
      [9.5, 12.5, 16, 19, 22].some(function (dm) {
        var Ab = Math.PI * dm * dm / 4, Rd = Math.min(Ab * ab.fy / 1.10, 0.75 * Ab * ab.fu / 1.35) / 1000;
        linha = { nome: trav ? "tirante" : "corrente", d: dm, F: Ft, Rd: Rd, razao: Ft / Rd, aco: ab.id, linhas: m.nc, entre: m.a,
                  texto: (trav ? "Tirantes" : "Correntes") + " Ø " + String(dm).replace(".", ",") + " mm (" + ab.id + "), " + m.nc + " linha(s) por vão; força acumulada " + br(Ft, 2) + " kN ≤ " + br(Rd, 2) + " kN" };
        return Rd >= Ft;
      });
      verificacoes.push({ nome: (trav ? "Tirante" : "Corrente") + " Ø " + String(linha.d).replace(".", ",") + " mm (força acumulada na linha)", item: "NBR 8800:2008, 5.2 e 6.3.3.1 (barra redonda com rosca)",
        passos: [{ rotulo: "Reação de cada barra na linha", formula: "1,25·q∥·a (q∥ de cálculo = " + br(qPl, 3) + " kN/m; a = " + br(m.a, 2) + " m)", valor: br(F1, 2) + " kN" },
                 { rotulo: "Acumulada (" + nAc + " barras " + (trav ? "da parede" : "da água") + ")", formula: "n·F1", valor: br(Ft, 2) + " kN" },
                 { rotulo: "Resistente", formula: "mín(Ag·fy/γa1; 0,75·Ab·fu/γa2)", valor: br(linha.Rd, 2) + " kN" }], resistencia: linha.Rd, unidade: "kN", solicitante: Ft, razao: linha.razao });
    }
    var rzMax = 0, gov = null; verificacoes.forEach(function (q) { if (q.razao > rzMax) { rzMax = q.razao; gov = q.nome; } });
    return {
      ok: rzMax <= 1 + 1e-9, tipo: d.tipo, perfil: m.cand.nome, secao: { tipo: "Ue", bw: m.cand.bw, bf: m.cand.bf, D: m.cand.D, t: m.cand.t, ri: m.cand.ri, fy: aco.fy, fu: aco.fu },
      aco: aco.id, massa: m.cand.massa, vao: L, faixa: d.s, linhas: m.nc, entreLinhas: m.a,
      razao: rzMax, governante: gov, combinacaoGovernante: m.pior.comb,
      esforcos: { Mx: m.pior.Mx, My: m.pior.My, Vy: m.pior.Vy },
      cargas: m.cargas, combinacoes: m.combs.map(function (c) { return { nome: c.nome, qPerp: c.n, qPlano: c.t, succao: c.suc }; }),
      verificacoes: verificacoes, avisos: arr(v.avisos),
      alternativas: melhores.map(function (x) { return { perfil: x.cand.nome, massa: x.cand.massa, linhas: x.nc }; }),
      linhaTirante: linha
    };
  }

  function dimensionar(p) {
    var G = p.G, L = G.layout, par = G.par, cg = p.cargas || {}, avisos = [], decisoes = [];
    var Mt = Mat(), aco = (Mt && Mt.aco(Mt.PADRAO.frio)) || { id: "NBR 6650 CF-26", fy: 260, fu: 410 };
    var gT = num(cg.telhaPeso, 0.05), gX = num(cg.permanenteExtra, 0.10), gF = num(cg.fechamentoPeso, gT), q = num(p.sobrecarga, 0.25);
    /* TERÇAS: a faixa mais larga e a pior pressão/sucção de qualquer vão de qualquer linha */
    var lt = arr(G.linhasTerca).slice().sort(function (a, b) { return a.x - b.x; }), faixaMax = 0, wPre = 0, wSuc = 0, wSucZona = 0, bordaT = [];   /* a lista do modelo vem intercalada (0, 20, 2, 18…): vizinhos em planta pela ordem de x */
    lt.forEach(function (t, i0) {
      var xa = i0 > 0 ? (lt[i0 - 1].x + t.x) / 2 : 0, xb = i0 < lt.length - 1 ? (lt[i0 + 1].x + t.x) / 2 : L.vao;
      var larg = Math.abs(xb - xa) / L.co; if (larg > faixaMax) faixaMax = larg;
      var reg = { x: t.x, vaos: [], zonas: {}, sucZona: 0, suc: 0 };
      for (var k = 0; k < L.zs.length - 1; k++) {
        var w = ventoFaixa(p.vento, "cobertura", xa, xb, L.zs[k], L.zs[k + 1]); if (w.pre > wPre) wPre = w.pre; if (w.suc < wSucZona) wSucZona = w.suc;
        var lo = localFaixa(p.vento, "cobertura", xa, xb, L.zs[k], L.zs[k + 1], w.suc), sk = lo ? Math.min(w.suc, lo.w) : w.suc;
        if (sk < wSuc) wSuc = sk; if (w.suc < reg.sucZona) reg.sucZona = w.suc; if (sk < reg.suc) reg.suc = sk;
        if (lo) { reg.vaos.push(k + 1); lo.itens.forEach(function (it) { var z = reg.zonas[it.zona]; if (!z || it.p < z.p) reg.zonas[it.zona] = it; }); }
      }
      bordaT.push(reg);
    });
    var nPorAgua = L.aguas === 2 ? Math.ceil(lt.length / 2) : lt.length;
    var tercas = dimensionarBarra({ tipo: "terca", L: L.esp, s: faixaMax, gSup: gT, gPlano: gX, q: q, P: num(p.concentrada, 1.0), wPre: wPre, wSuc: wSuc, th: L.th, nLinhaTirante: nPorAgua }, aco);
    if (tercas.ok) {
      tercas.nLinhas = lt.length; tercas.comprimentoTotal = lt.length * L.Lt; tercas.pesoTotal = tercas.comprimentoTotal * tercas.massa;
      decisoes.push({ tema: "Terças", decisao: tercas.perfil + " biapoiadas entre pórticos (" + br(L.esp, 2) + " m), " + tercas.linhas + " linha(s) de correntes por vão", motivo: "o Ue mais leve do catálogo que passa na NBR 14762 (gravidade e sucção) e nas flechas; faixa de " + br(faixaMax, 2) + " m" });
    } else avisos.push("Terças: " + tercas.motivo + ". " + tercas.sugestao);
    tercas.cpeMedio = registroBorda(p.vento, bordaT, wSucZona, wSuc, "terça", function (r) { return "x = " + br(r.x, 2) + " m"; }, decisoes);
    /* TRAVESSAS: laterais (vão = espaçamento dos pórticos) e oitões (vão = entre colunas de tapamento) */
    var travessas = {}, fe = par.fechamentos || {};
    function precisaTrav(f) { var t = String((fe[f] || {}).tipo || "telha").toLowerCase(); return /telha|misto/.test(t) && alturasFace(f).length > 0; }
    /* as alturas das travessas de CADA face (o modelo tem uma lista por face; na mista, só acima da alvenaria) —
       antes a frente valia pelas duas e, com a frente aberta, as do fundo sumiam do peso (as pranchas acharam) */
    function alturasFace(f) {
      var lista = f === "esquerda" ? L.travE : f === "direita" ? L.travD : f === "frente" ? L.travF : L.travB, fc = fe[f] || {};
      var am = /misto/.test(String(fc.tipo || "")) ? num(fc.alturaAlvenaria, 0) : -1;
      return (lista || []).filter(function (h) { return h >= am - 1e-6; });   /* a do TOPO da alvenaria conta: ela segura a borda de baixo da telha */
    }
    function faixaTrav(alturas, H) { var hs = [0].concat(alturas).concat([H]), m = 0; for (var i = 1; i < hs.length - 1; i++) m = Math.max(m, (hs[i + 1] - hs[i - 1]) / 2); return m || 2; }
    var lados = ["esquerda", "direita"].filter(precisaTrav);
    if (lados.length) {
      var wpL = 0, wsL = 0, wsLz = 0, faixaL = 0, nAltL = 0, bordaL = [];
      lados.forEach(function (f) {
        for (var k = 0; k < L.zs.length - 1; k++) {
          var w = ventoFaixa(p.vento, f, L.zs[k], L.zs[k + 1], 0, 0); wpL = Math.max(wpL, w.pre); wsLz = Math.min(wsLz, w.suc);
          var lo = localFaixa(p.vento, f, L.zs[k], L.zs[k + 1], 0, 0, w.suc), sk = lo ? Math.min(w.suc, lo.w) : w.suc; wsL = Math.min(wsL, sk);
          var reg = { f: f, vao: k + 1, vaos: lo ? [k + 1] : [], zonas: {}, sucZona: w.suc, suc: sk }; if (lo) reg.zonas[lo.itens[0].zona] = lo.itens[0]; bordaL.push(reg);
        }
        faixaL = Math.max(faixaL, faixaTrav(alturasFace(f), L.H)); nAltL = Math.max(nAltL, alturasFace(f).length);
      });
      var tl = dimensionarBarra({ tipo: "travessa", L: L.esp, s: faixaL, gSup: gF, gPlano: 0, q: 0, wPre: wpL, wSuc: wsL, th: Math.PI / 2, nLinhaTirante: nAltL }, aco);
      if (tl.ok) { var nL = 0; lados.forEach(function (f) { nL += alturasFace(f).length; }); tl.nLinhas = nL; tl.comprimentoTotal = nL * L.Lt; tl.pesoTotal = tl.comprimentoTotal * tl.massa; tl.faces = lados; }
      else avisos.push("Travessas laterais: " + tl.motivo + ". " + tl.sugestao);
      tl.cpeMedio = registroBorda(p.vento, bordaL, wsLz, wsL, "travessa lateral", function (r) { return "(" + r.f + ", vão " + r.vao + ")"; }, decisoes);
      travessas.lateral = tl;
    }
    var oits = ["frente", "fundo"].filter(precisaTrav);
    if (oits.length) {
      var vaoMax = 0, wpO = 0, wsO = 0, wsOz = 0, faixaO = 0, nAltO = 0, bordaO = [];
      oits.forEach(function (f) {
        var xs = [0].concat((f === "frente" ? L.tapF : L.tapB) || []).concat([L.vao]);   /* as colunas de tapamento DESTA face */
        for (var i2 = 1; i2 < xs.length; i2++) {
          vaoMax = Math.max(vaoMax, xs[i2] - xs[i2 - 1]); var w = ventoFaixa(p.vento, f, xs[i2 - 1], xs[i2], 0, 0); wpO = Math.max(wpO, w.pre); wsOz = Math.min(wsOz, w.suc);
          var lo = localFaixa(p.vento, f, xs[i2 - 1], xs[i2], 0, 0, w.suc), sk = lo ? Math.min(w.suc, lo.w) : w.suc; wsO = Math.min(wsO, sk);
          var reg = { f: f, vao: i2, vaos: lo ? [i2] : [], zonas: {}, sucZona: w.suc, suc: sk }; if (lo) reg.zonas[lo.itens[0].zona] = lo.itens[0]; bordaO.push(reg);
        }
        faixaO = Math.max(faixaO, faixaTrav(alturasFace(f), L.H)); nAltO = Math.max(nAltO, alturasFace(f).length);
      });
      var to = dimensionarBarra({ tipo: "travessa", L: vaoMax, s: faixaO, gSup: gF, gPlano: 0, q: 0, wPre: wpO, wSuc: wsO, th: Math.PI / 2, nLinhaTirante: nAltO }, aco);
      if (to.ok) { var nO = 0; oits.forEach(function (f) { nO += alturasFace(f).length; }); to.nLinhas = nO; to.comprimentoTotal = nO * L.vao; to.pesoTotal = to.comprimentoTotal * to.massa; to.faces = oits; }
      else avisos.push("Travessas dos oitões: " + to.motivo + ". " + to.sugestao);
      to.cpeMedio = registroBorda(p.vento, bordaO, wsOz, wsO, "travessa do oitão", function (r) { return "(" + r.f + ", vão " + r.vao + ")"; }, decisoes);
      travessas.oitao = to;
    }
    ["lateral", "oitao"].forEach(function (k) {
      var t = travessas[k]; if (t && t.ok) decisoes.push({ tema: "Travessas " + (k === "lateral" ? "laterais" : "dos oitões"), decisao: t.perfil + " (vão " + br(t.vao, 2) + " m), " + t.linhas + " linha(s) de tirantes por vão", motivo: "o Ue mais leve que passa no vento (pressão e sucção) e no peso do fechamento" });
    });
    var pesoTotal = 0; [tercas, travessas.lateral, travessas.oitao].forEach(function (x) { if (x && x.ok) pesoTotal += x.pesoTotal || 0; });
    return { ok: !!(tercas && tercas.ok) && ["lateral", "oitao"].every(function (k) { return !travessas[k] || travessas[k].ok; }), tercas: tercas, travessas: travessas, pesoTotal: pesoTotal, avisos: avisos, decisoes: decisoes, aco: aco.id };
  }

  var AcoSecundarias = { dimensionar: dimensionar, dimensionarBarra: dimensionarBarra, candidatos: candidatos, ventoFaixa: ventoFaixa, localFaixa: localFaixa, OPC: OPC, LIM: LIM, GAMA: GAMA };
  global.AcoSecundarias = AcoSecundarias;
  if (typeof module !== "undefined" && module.exports) module.exports = AcoSecundarias;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
