/* =====================================================================
 * metalparafusos.js — PARAFUSOS, PORCAS E ARRUELAS DE TODAS AS LIGAÇÕES
 * PARAFUSADAS da estrutura desenhada (motor PURO, ES5, sem DOM). 21/11/2026.
 *
 * Pedido do Rogério: "faz os parafusos e a lista de montagem agora". Quando a
 * estrutura metálica for parafusada, todo parafuso, porca e arruela existe no
 * modelo como peça paramétrica (kind "parafuso" do js/metalpeca.js — cabeça
 * sextavada, haste, rosca, arruela, porca) e sai na lista de montagem
 * (js/metalmontlista.js), que conta pelo MESMO js/metalfab.js listas() que a
 * Relação fábrica (js/metalrelacaofab.js) — as duas batem por construção.
 *
 * O QUE JÁ EXISTIA (js/metalporticosacab.js, não duplicado aqui):
 *   placa de base (chumbadores F1554), clip de terça (2 × M12 por terça) e a
 *   chapa de apoio do contravento em barra redonda.
 * O QUE ESTE MÓDULO ACRESCENTA, depois do acabamento:
 *   1. CHUMBADOR: a 2ª porca (de nivelamento, sob a placa) — Eletro Luminar,
 *      chumbador J: "fornecido com 2 porcas A563 Gr.A, arruela lisa e arruela
 *      de pressão" (js/metalfixacao.js ACESSORIOS). Feito na macro
 *      (js/metalligacao.js boltCaixas), aqui só se confere.
 *   2. CONTRAVENTO EM BARRA REDONDA: arruela + porca + contraporca na ponta
 *      roscada, na face de fora da chapa de apoio (kind parafuso com
 *      `soPorca` = 2: só porcas, a barra é a própria haste).
 *   3. NÓ DE TRELIÇA EM 2L (sistema cantoneira) — só com ligação PARAFUSADA:
 *      a chapa de nó entre as abas (espessura = folga da 2L = p.chapaNo) e,
 *      em cada barra 2L que chega no nó, 2 parafusos no gage, atravessando
 *      aba + chapa + aba (pega = 2·t + e). A barra contínua (banzo) leva 2
 *      parafusos centrados no nó.
 *   4. MÃO-FRANCESA parafusada: em cada ponta uma chapa de ligação soldada
 *      no apoio (banzo / terça) e 2 parafusos na aba da cantoneira.
 *   5. LIGAÇÃO SOLDADA (p.ligacao = "soldada"): nenhum parafuso nas ligações
 *      de aço (os do clip saem e viram cordão de solda); o chumbador fica
 *      (é da fundação). A lista mostra o cordão.
 *   EMENDA de coluna e de tesoura: a estrutura desenhada não gera emenda (o
 *   maior banzo do Pedido Gabriel tem 10,05 m, abaixo da barra de 12 m) — a
 *   contagem diz "não há" e nada é inventado.
 *
 * NÚMEROS (nenhum inventado):
 *   - diâmetro, passo, cabeça, porca, arruela: js/metalnorma.js PARAFUSOS;
 *   - comprimento: js/metalnorma.js comprimento() = pega + arruela + porca +
 *     3 fios, arredondado ao passo comercial — REGRA PRÁTICA (rotulada);
 *   - furo-padrão db + 1,5 mm (NBR 8800 6.3.6, conferido), borda mínima
 *     (Tabela 14) e espaçamento (3 db preferível): js/metalnorma.js partida();
 *   - número de parafusos (2 por barra) e espessura da chapa da mão-francesa
 *     (6,35 mm): VALOR DE PARTIDA, NÃO DIMENSIONADO — "a conferir" na lista.
 *
 * O CÁLCULO NÃO MUDA: as peças novas não levam `lig` (o leitor da estrutura
 * desenhada, js/acomodelolivre.js, só junta ligações pelo `lig`; chapa sem
 * lig é "ignorada", parafuso sem lig não entra) — teste
 * tools/test-metal-parafusos.js [6].
 *
 *   completar(t, p, g, novoId, op) → { ok, ops, pecas, contagem, soldas,
 *                                      avisos, pendencias, resumo }
 *   ligacaoDe(p) → "parafusada" | "soldada" | "padrao"
 *   conferirParafuso(c) → { ok, Lmm, Lmin, pega }
 *   lod(dist) → "detalhe" | "simples" | "oculto"   (o 3D usa)
 * Teste: node tools/test-metal-parafusos.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function BM() { return dep("BimMetal", "./metalpeca.js"); }
  function N() { return dep("BimMetalNorma", "./metalnorma.js"); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function mul(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function unit(a) { var l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function V3(o) { return Array.isArray(o) ? o.slice() : [num(o && o.x, 0), num(o && o.y, 0), num(o && o.z, 0)]; }
  function r1(v) { return Math.round(v * 10) / 10; }

  var PARTIDA = "valor de partida, não dimensionado — a conferir";
  var REGRA_L = "pega + arruela + porca + 3 fios, arredondado ao passo comercial (regra prática de montagem)";
  var FOLGA_C0 = 0.020;          /* 20 mm entre a ponta da barra da alma e o banzo (o C0 do js/metalchapano.js) */
  var T_CHAPA_MF = 0.00635;      /* chapa de ligação da mão-francesa: 1/4" — PARTIDA */
  var N_POR_BARRA = 2;           /* parafusos por barra no nó / por ponta da mão-francesa — PARTIDA */

  function ligacaoDe(p) { var l = p && p.ligacao; return l === "parafusada" || l === "soldada" ? l : "padrao"; }

  /* o mundo de um ponto local da caixa (o gerador do pórtico não gira as peças: rotY = 0) */
  function mundo(c, P) { var a = num(c.rotY, 0), co = Math.cos(a), si = Math.sin(a); return [c.cx + co * P[0] + si * P[2], c.cy + P[1], c.cz - si * P[0] + co * P[2]]; }

  /* ------------------------------------------------ geometria da barra (o sólido do js/metalpeca.js) */
  function barraGeo(c) {
    var M = BM(); if (!M || !c || !c.metal || c.metal.kind !== "perfil") return null;
    var sd; try { sd = M.solidos(c); } catch (e) { return null; }
    if (!sd || !sd.length) return null;
    var s = sd[0], P0 = s.ponto(0, 0, s.z0), P1 = s.ponto(0, 0, s.z1), L = len(sub(P1, P0)); if (!(L > 1e-6)) return null;
    var Aw = unit(sub(s.ponto(1, 0, s.z0), P0)), Bw = unit(sub(s.ponto(0, 1, s.z0), P0));
    return { s: s, P0: P0, X: unit(sub(P1, P0)), L: L, A: Aw, B: Bw, poli: arr(s.poli), perfil: c.metal.perfil, c: c };
  }
  function ptBarra(G, x, a, b) { return add(add(add(G.P0, mul(G.X, x)), mul(G.A, a)), mul(G.B, b)); }
  /* 2L costas com costas: as abas verticais em a = ±(e/2 … e/2 + t); o calcanhar no b em que a aba de fora (|a| máximo) está */
  function geo2L(G) {
    var p = G.perfil, e = num(p.e, 0), t = num(p.t, 0), bb = num(p.b, 0), amax = 0, bH = 0, nH = 0, bmin = 1e9, bmax = -1e9;
    G.poli.forEach(function (q) { if (Math.abs(q[0]) > amax + 1e-9) amax = Math.abs(q[0]); if (q[1] < bmin) bmin = q[1]; if (q[1] > bmax) bmax = q[1]; });
    G.poli.forEach(function (q) { if (Math.abs(Math.abs(q[0]) - amax) < 1e-6) { bH += q[1]; nH++; } });
    var heelTop = nH ? bH / nH > (bmin + bmax) / 2 : true;
    return { e: e, t: t, b: bb, heel: heelTop ? bmax : bmin, sg: heelTop ? -1 : 1 };
  }
  function bitola2L(b) { return b >= 0.0508 - 1e-6 ? "M16" : "M12"; }
  /* gage do calcanhar: a arruela livra a aba de fora e a borda livre fica ≥ a mínima (Tabela 14, borda laminada) */
  function gage(bAba, tAba, P) {
    var Nn = N(), gMin = tAba + P.arr.d2 / 2000 + 0.001, bord = Nn.bordaMin(P.d, "laminada").e / 1000, gMax = bAba - bord;
    if (gMax < gMin - 1e-9) return { g: (gMin + gMax) / 2, aviso: "aba de " + r1(bAba * 1000) + " mm estreita para " + P.id + " (arruela × borda) — a conferir" };
    return { g: (gMin + gMax) / 2 };
  }

  /* ------------------------------------------------ peça anexa ao elemento da barra (entra na seleção por elemento) */
  function anexar(cx, host, slot, gid) {
    cx.portico = gid;
    if (host && host.elemMetal) { cx.elemMetal = clone(host.elemMetal); cx.elemMetal.anexo = true; cx.elemMetal.slot = slot; delete cx.elemMetal.mud; }
    cx.acab = cx.metal && cx.metal.kind === "parafuso" ? { tipo: "galvanizado" } : (host && host.acab ? clone(host.acab) : cx.acab);
    return cx;
  }

  function parafuso(o, P, classe, ligM, pega) {
    var c = BM().parafuso({ origem: o.origem, eixo: o.eixo, aperto: o.aperto, id: P.id, classe: classe, arrPorca: 1, arrCabeca: o.arrCabeca ? 1 : 0, soPorca: o.soPorca });
    if (c.erro) return c;
    c.metal.ligMont = ligM; c.metal.pega = pega || null;
    return c;
  }

  function completar(t, p, g, novoId, op) {
    op = op || {};
    var out = { ok: true, ops: [], pecas: [], contagem: { noTrelica: 0, maoFrancesa: 0, porcaBarra: 0, chumbador: 0, clipTerca: 0, emenda: 0 },
                parafusos: { noTrelica: 0, maoFrancesa: 0, clipTerca: 0, chumbador: 0 }, soldas: [], avisos: [], pendencias: [], ligacao: ligacaoDe(p), resumo: "" };
    if (!g || !g.ok || !g.modelo || typeof novoId !== "function") return { ok: false, motivo: "Sem o pórtico gerado." };
    var M = BM(), Nn = N(); if (!M || !Nn) return { ok: false, motivo: "Motores da metálica (metalpeca/metalnorma) não carregaram." };
    var Mod = g.modelo, nos = Mod.nos, gid = g.porticoId, porId = {}, modo = out.ligacao;
    g.pecas.forEach(function (c) { porId[c.id] = c; });
    var cx = function (b) { return b ? porId[g.mapa[b.id]] : null; };
    var acab = g.acab && g.acab.ok ? g.acab : null, extras = acab ? acab.pecas : [];
    function criar(c, host, slot) { c.id = String(novoId()); anexar(c, host, slot, gid); out.pecas.push(c); out.ops.push({ op: "criar", id: c.id, caixa: c }); return c; }

    /* ---------------- 1. chumbadores (a 2ª porca vem da macro) e clips: só contar / soldada tira os parafusos do clip */
    extras.forEach(function (c) {
      if (!c.metal || c.metal.kind !== "parafuso") return;
      var sl = c.elemMetal && c.elemMetal.slot || "";
      if (c.metal.chumbador) { out.parafusos.chumbador++; if (!c.metal.porcaNivel) out.avisos.push("Chumbador " + c.id + " sem a porca de nivelamento."); }
      else if (/clipTerca/.test(sl)) out.parafusos.clipTerca++;
    });
    if (acab) {
      var ligsClip = {}; extras.forEach(function (c) { if (c.metal && c.metal.kind !== "parafuso" && c.elemMetal && /clipTerca/.test(c.elemMetal.slot || "")) ligsClip[c.metal.lig] = c; });
      out.contagem.clipTerca = Object.keys(ligsClip).length;
      out.contagem.chumbador = acab.contagem ? num(acab.contagem.placaBase, 0) : 0;
      if (modo === "soldada") {
        /* sem parafuso: o clip é soldado na terça — o cordão vai para a lista; os furos do clip saem da terça */
        var fora = {};
        extras.forEach(function (c) { if (c.metal && c.metal.kind === "parafuso" && !c.metal.chumbador && ligsClip[c.metal.lig]) fora[c.id] = 1; });
        acab.pecas = extras = extras.filter(function (c) { return !fora[c.id]; });
        acab.ops = acab.ops.filter(function (o) { return !(o.op === "criar" && fora[o.id]) && !(o.op === "metalFuros" && ligsClip[o.lig]); });
        g.pecas.forEach(function (c) { if (c.metalFuros) c.metalFuros = c.metalFuros.filter(function (f) { return !ligsClip[f.lig]; }); });
        Object.keys(ligsClip).forEach(function (k) {
          var ch = ligsClip[k], tt = num(ch.metal.perfil && ch.metal.perfil.t, num(ch.metal.t, 0.005)), pr = Nn.soldaMin(tt * 1000);
          var cl = { perna: pr.perna, lados: "ambos", comprimento: Math.round(num(ch.metal.L, 0.1) * 1000) / 1000, campo: true };
          ch.metal.soldaMont = cl; out.soldas.push({ ligacao: "Clip de terça soldado na terça", marca: ch.elemMetal && ch.elemMetal.tipo || "", cordao: Nn.soldaRotulo(cl), comprimento: cl.comprimento, fonte: pr.fonte });
        });
        out.parafusos.clipTerca = 0;
      }
    }

    /* ---------------- 2. porca + contraporca + arruela na ponta da barra redonda (todas as ligações de contravento) */
    extras.forEach(function (c) {
      if (!c.metal || c.metal.kind !== "chapa" || !/tirante/i.test(c.metal.papel || "")) return;
      var m = c.metal, f = arr(m.furos)[0]; if (!f) return;
      var ex = V3(m.ex), ey = V3(m.ey), ez = unit(cross(ex, ey)), O = add(V3(m.o), add(mul(ex, f.u), mul(ey, f.v)));
      var P = Nn.parafuso(nomeBarra(f.db)); if (!P) { out.pendencias.push("Barra redonda Ø " + f.db + " mm sem porca no catálogo — a conferir"); return; }
      var host = null; g.pecas.forEach(function (b) { if (!host && b.elemMetal && b.elemMetal.cat === "contravento" && b.metal && b.metal.perfil && b.metal.perfil.forma === "circ" && pertoDe(b, mundo(c, O))) host = b; });
      var pc = parafuso({ origem: mundo(c, add(O, mul(ez, m.t))), eixo: ez, aperto: 0.002, soPorca: 2 }, P, "", "cv:" + m.lig, { itens: [], soPorca: 2 });
      if (pc.erro) { out.avisos.push("Porca da barra: " + pc.erro); return; }
      criar(pc, host || c, "lig:porcaBarra"); out.contagem.porcaBarra++;
    });

    /* ---------------- 3. nós de treliça em 2L (só parafusada) */
    var LD = op.ligDim || null; out.dimensionado = !!LD;
    if (modo === "parafusada") noTrelica2L(g, Mod, nos, cx, Nn, criar, out, LD);
    else if (p.sistemaTrelica === "cantoneira") out.soldas.push({ ligacao: "Nós da treliça em 2L (chapa de nó soldada entre as abas)", marca: "TS", cordao: "filete longitudinal, 4 por barra (js/metalchapano.js — dimensionado no cálculo)", comprimento: null, fonte: "NBR 8800:2008 6.2.5 (verificação do nó com chapa)" });

    /* ---------------- 4. mão-francesa */
    var mfs = Mod.barras.filter(function (b) { return b.grupo === "maoFrancesa"; });
    if (mfs.length) {
      var ligMF = p.ligMaoFrancesa === "soldada" || modo === "soldada" ? "soldada" : "parafusada";
      /* R7 (21/11): terça de parede fina → a mão-francesa vai parafusada na terça mesmo com a ligação "soldada" (o cálculo decidiu: dq.terca) */
      mfs.forEach(function (b) { var c = cx(b), dq = LD && LD.porBarra ? LD.porBarra[b.id] : null; if (c && (ligMF === "parafusada" || (dq && dq.terca))) maoFrancesa(c, Nn, criar, out, dq); });
      if (ligMF === "soldada" && mfs.some(function (b) { var dq = LD && LD.porBarra ? LD.porBarra[b.id] : null; return dq && dq.terca; })) out.avisos.push("Mão-francesa: a terça tem parede menor que o filete mínimo (3 mm) — a ligação soldada não cabe; a chapa foi parafusada na alma da terça (cálculo).");
      else out.soldas.push({ ligacao: "Mão-francesa soldada (as duas pontas)", marca: "MF", cordao: "filete na aba, 2 lados por ponta", comprimento: null, fonte: "a dimensionar — a ligação não é verificada pelo motor" });
    }

    /* ---------------- 4b. ENRIJECEDORES DA ALMA DO U (21/11/2026): o js/metalligdim.js dimensiona o par de enrijecedores dentro do U da
       coluna onde a alma sozinha não aguenta a força ⊥ da chapa de nó — aqui eles viram peça (chapa A36 dentro do U, nas bordas da
       chapa de nó, anexa ao elemento da coluna) e entram na lista de montagem e na relação de fábrica com a massa e a solda */
    if (LD && arr(LD.enrijecedores).length) enrijecedoresU(g, Mod, cx, M, criar, out, LD.enrijecedores);
    /* ---------------- 4c. CHAPA DE LIGAÇÃO DO TUBO NA ALMA DO U (22/11/2026, js/metaltubou.js): tubo de parede menor que o filete
       mínimo chega na alma do U por uma chapa A36 soldada na alma, no plano da treliça, com parafusos passantes pelo tubo */
    if (LD && arr(LD.gussetsTuboU).length) gussetsTuboU(g, Mod, cx, M, Nn, criar, out, LD.gussetsTuboU);

    /* ---------------- 5. emendas: o gerador não corta barra (a mais longa cabe numa barra de 12 m) */
    var maior = 0; g.pecas.forEach(function (c) { if (c.metal && c.metal.kind === "perfil" && num(c.metal.L, 0) > maior) maior = num(c.metal.L, 0); });
    if (maior > 12.0001) out.pendencias.push("Há barra de " + r1(maior) + " m (acima de 12 m): a emenda dela NÃO foi gerada — detalhar à mão.");

    var nP = out.pecas.filter(function (c) { return c.metal.kind === "parafuso" && !c.metal.soPorca; }).length;
    out.resumo = "Ligação " + modo + ": " + out.contagem.noTrelica + " nós de treliça com chapa (" + out.parafusos.noTrelica + " parafusos), " + out.contagem.maoFrancesa + " pontas de mão-francesa (" + out.parafusos.maoFrancesa + " parafusos), " +
      out.contagem.porcaBarra + " pontas de barra redonda com porca e contraporca, " + out.parafusos.clipTerca + " parafusos de clip, " + out.parafusos.chumbador + " chumbadores (2 porcas cada)";
    out.novosParafusos = nP;
    return out;
  }
  /* e = { barraId, P (m, o nó), t, h, comprimento, Lg (m), soldaAlma {dw, Lw mm}, soldaAbas {dw, Lw mm} } — 2 chapas por nó, em x_nó ± Lg/2.
     Seção do U formado a frio (js/metalpeca.js): a = largura (mb.A), alma em a = −bf/2, abas em b = ±bw/2 (mb.B). A chapa ocupa
     a ∈ [−bf/2 + t, +bf/2] e b ∈ [−bw/2 + t, +bw/2 − t]; a espessura vai em −X (A × B = −X), por isso a origem fica em x + te/2. */
  function enrijecedoresU(g, Mod, cx, M, criar, out, lista) {
    var porB = {}; Mod.barras.forEach(function (b) { porB[b.id] = b; });
    out.contagem.enrijecedor = 0; out.enrijecedores = [];
    lista.forEach(function (e) {
      var host = e.barraId ? cx(porB[e.barraId]) : null, mb = host ? M.membro(host) : null;
      if (!mb || !e.P || !mb.perfil || mb.perfil.forma !== "frio") { out.avisos.push("Enrijecedor do nó " + e.no + ": a coluna (" + (e.barraId || "?") + ") não foi achada no modelo — não desenhado."); return; }
      var pf = mb.perfil, tU = num(pf.t, 0.003), bw = num(pf.bw, 0.1), bf = num(pf.bf, 0.05), te = num(e.t, 0.0063), xN = dot(sub(V3(e.P), mb.Pref), mb.X);
      [-1, 1].forEach(function (sg) {
        var x = Math.max(te / 2, Math.min(mb.L + num(mb.xOff, 0) - te / 2, xN + sg * num(e.Lg, 0.1) / 2));
        var O = add(add(add(mb.Pref, mul(mb.X, x + te / 2)), mul(mb.A, -bf / 2 + tU)), mul(mb.B, -bw / 2 + tU));
        var c = M.chapa({ origem: O, ex: mb.A, ey: mb.B, t: te, ret: { L: bf - tU, B: bw - 2 * tU }, papel: "Enrijecedor da alma do U", aco: "ASTM A36", lig: "enr:" + e.no, soldadaEm: host.id,
          nome: "Enrijecedor " + r1(te * 1000) + " mm — nó " + e.no,
          solda: { tipo: "filete", perna: num(e.soldaAlma && e.soldaAlma.dw, 3), lados: "ambos", comprimento: Math.round((2 * num(e.soldaAlma && e.soldaAlma.Lw, (bw - 2 * tU) * 1000) + 4 * num(e.soldaAbas && e.soldaAbas.Lw, (bf - tU) * 1000))) / 1000, campo: false } });
        if (c.erro) { out.avisos.push("Enrijecedor do nó " + e.no + ": " + c.erro); return; }
        c.metal.enrijecedor = { no: e.no, soldaAlma: e.soldaAlma || null, soldaAbas: e.soldaAbas || null };
        criar(c, host, "lig:enrijecedor");
        out.contagem.enrijecedor++;
      });
      out.enrijecedores.push({ no: e.no, t: te, n: 2 });
    });
    if (out.contagem.enrijecedor) out.soldas.push({ ligacao: "Enrijecedores da alma do U (par por nó com chapa)", marca: "EN", cordao: "filete nos 2 lados na alma (bw − 2t) e nas 2 abas (bf − t)", comprimento: null, fonte: "js/metalligdim.js — dimensionado no cálculo (NBR 8800:2008 6.2.5)" });
  }

  /* e = { no, barraId (U), P (m), dir (unitário, do nó para a outra ponta do tubo), t, Lg, hg (m), solda { dw, Lw mm }, parafusos { n, id, classe, passo, borda mm },
     tubo } — a chapa fica na face EXTERNA da alma (a = −bf/2), centrada no nó ao longo do U, no plano do tubo; pontas no mesmo nó do mesmo
     U dividem a mesma chapa (a maior). Parafusos: na linha do tubo, a partir de c0 + borda da face, eixo ⊥ ao plano, aperto = largura do tubo */
  function gussetsTuboU(g, Mod, cx, M, Nn, criar, out, lista) {
    var porB = {}; Mod.barras.forEach(function (b) { porB[b.id] = b; });
    out.contagem.gussetTuboU = 0; out.parafusos.tuboU = 0;
    var feitas = {};
    lista.forEach(function (e) {
      var host = e.barraId ? cx(porB[e.barraId]) : null, mb = host ? M.membro(host) : null;
      if (!mb || !e.P || !mb.perfil || mb.perfil.forma !== "frio") { out.avisos.push("Chapa do tubo no nó " + e.no + ": a coluna (" + (e.barraId || "?") + ") não foi achada no modelo — não desenhada."); return; }
      var pf = mb.perfil, bf = num(pf.bf, 0.05), te = num(e.t, 0.008), P = V3(e.P), d = unit(V3(e.dir)), rel = sub(P, mb.Pref), xN = dot(rel, mb.X), aN = dot(rel, mb.A), bN = dot(rel, mb.B);
      if (dot(d, mb.A) > -0.05) { out.avisos.push("Chapa do tubo no nó " + e.no + ": o tubo não chega pela face externa da alma do " + e.U + " — não desenhada (conferir o detalhe)."); return; }
      var ex = mb.X, ey = mul(mb.A, -1), ez = unit(cross(ex, ey)), k = e.barraId + "|" + e.no + "|" + Math.round(bN * 1000);
      if (!feitas[k]) {
        var Lg = num(e.Lg, 0.1), hg = num(e.hg, 0.1), x0 = Math.max(0, Math.min(mb.L + num(mb.xOff, 0) - Lg, xN - Lg / 2));
        var O = add(add(add(add(mb.Pref, mul(mb.X, x0)), mul(mb.A, -bf / 2)), mul(mb.B, bN)), mul(ez, -te / 2));
        var c = M.chapa({ origem: O, ex: ex, ey: ey, t: te, ret: { L: Lg, B: hg }, papel: "Chapa de ligação do tubo na alma do U", aco: "ASTM A36", lig: "tuboU:" + e.no, soldadaEm: host.id,
          nome: "Chapa " + r1(te * 1000) + " mm do tubo — nó " + e.no, solda: { tipo: "filete", perna: num(e.solda && e.solda.dw, 3), lados: "ambos", comprimento: Math.round(2 * num(e.solda && e.solda.Lw, Lg * 1000)) / 1000, campo: false } });
        if (c.erro) { out.avisos.push("Chapa do tubo no nó " + e.no + ": " + c.erro); return; }
        c.metal.tuboU = { no: e.no, tubo: e.tubo };
        criar(c, host, "lig:tuboU"); out.contagem.gussetTuboU++;
        feitas[k] = true;
      }
      var pa = e.parafusos || {}, Pp = Nn.parafuso(pa.id || "M12"); if (!Pp) return;
      var dface = aN + bf / 2, Pw = add(P, mul(d, dface / Math.max(0.2, -dot(d, mb.A)))), aperto = 0.05;
      var tuboHost = e.tuboBarraId ? cx(porB[e.tuboBarraId]) : null; if (tuboHost && tuboHost.metal && tuboHost.metal.perfil) aperto = num(tuboHost.metal.perfil.b, num(tuboHost.metal.perfil.d, 0.05));
      for (var i = 0; i < num(pa.n, 2); i++) {
        var dist = (C0_TUBOU + num(pa.borda, 20) + i * num(pa.passo, 40)) / 1000, Pb = add(Pw, mul(d, dist));
        var pc = parafuso({ origem: add(Pb, mul(ez, -aperto / 2)), eixo: ez, aperto: aperto }, Pp, pa.classe || "8.8", "tuboU:" + e.no, { itens: [{ papel: "tubo (2 paredes) + chapa no rasgo" }] });
        if (pc.erro) { out.avisos.push("Parafuso do tubo no nó " + e.no + ": " + pc.erro); continue; }
        criar(pc, tuboHost || host, "lig:tuboU"); out.parafusos.tuboU++;
      }
    });
    if (out.contagem.gussetTuboU) out.soldas.push({ ligacao: "Chapa de ligação do tubo na alma do U (tubo de parede fina, parafusos passantes)", marca: "TU", cordao: "filete nos 2 lados da chapa ao longo da alma", comprimento: null, fonte: "js/metaltubou.js — dimensionado no cálculo (NBR 8800:2008 6.2.5)" });
  }
  var C0_TUBOU = 20;   /* folga da ponta do tubo até a alma (mm) — a mesma do js/metaltubou.js */

  function nomeBarra(dbmm) {
    var Nn = N(), best = null, dd = 1e9; Nn.PARAFUSOS.forEach(function (q) { var d = Math.abs(q.d - dbmm); if (d < dd) { dd = d; best = q.id; } });
    return dd < 0.6 ? best : null;
  }
  function pertoDe(c, P) {
    var G = barraGeo(c); if (!G) return false;
    var s = dot(sub(P, G.P0), G.X); if (s < -0.2 || s > G.L + 0.2) return false;
    return len(sub(P, add(G.P0, mul(G.X, Math.max(0, Math.min(G.L, s)))))) < 0.3;
  }

  /* ===================================================== NÓ DE TRELIÇA 2L */
  function noTrelica2L(g, Mod, nos, cx, Nn, criar, out, LD) {
    var ALMA = { diagonal: 1, montante: 1 }, BANZO = { banzoSup: 1, banzoInf: 1 }, porNo = {}, ordem = [];
    var geoC = {};
    function geo(b) { if (geoC[b.id] !== undefined) return geoC[b.id]; var c = cx(b), G = c && c.metal && c.metal.perfil && c.metal.perfil.forma === "2L" ? barraGeo(c) : null; geoC[b.id] = G; return G; }
    Mod.barras.forEach(function (b) {
      if (!ALMA[b.grupo] || !geo(b)) return;
      [b.a, b.b].forEach(function (nm) { if (!porNo[nm]) { porNo[nm] = []; ordem.push(nm); } porNo[nm].push(b); });
    });
    var banzos = Mod.barras.filter(function (b) { return BANZO[b.grupo] && geo(b); });
    ordem.forEach(function (nm) {
      var P = nos[nm]; if (!P) return;
      var bars = porNo[nm].map(function (b) { return { b: b, G: geo(b), cont: false }; });
      banzos.forEach(function (b) {
        var G = geo(b), s = dot(sub(P, G.P0), G.X); if (s < -0.01 || s > G.L + 0.01) return;
        if (len(sub(P, add(G.P0, mul(G.X, s)))) > 0.01) return;
        bars.push({ b: b, G: G, cont: s > 0.05 && s < G.L - 0.05, s: s });
      });
      if (bars.length < 2) return;
      /* o plano do nó: a normal = eixo "a" da 2L (perpendicular ao plano da treliça) */
      var nP = bars[0].G.A, ref = bars.filter(function (q) { return BANZO[q.b.grupo]; })[0] || bars[0], hBanzo = ref.G.perfil ? num(ref.G.perfil.b, 0.05) : 0.05;
      var bolts = [];
      bars.forEach(function (q) {
        var dq = LD && LD.porBarra ? LD.porBarra[q.b.id] : null;   /* 21/11: o número e o diâmetro DIMENSIONADOS (js/metalligdim.js) */
        q.nP = dq ? Math.max(2, dq.n) : N_POR_BARRA; q.classe = dq ? dq.classe : "8.8";
        var G = q.G, L2 = geo2L(G), P2 = Nn.parafuso(dq ? dq.id : bitola2L(L2.b)), pt = Nn.partida(P2.d, "laminada"), passo = pt.passo / 1000, bS = Nn.bordaMin(P2.d, "serra").e / 1000;
        var gg = gage(L2.b, L2.t, P2); if (gg.aviso) out.avisos.push("Nó " + nm + ": " + gg.aviso);
        var bLoc = L2.heel + L2.sg * gg.g, xs = [];
        var sNo = dot(sub(P, G.P0), G.X);
        if (q.cont) { for (var k = 0; k < N_POR_BARRA; k++) xs.push(sNo + (k - (N_POR_BARRA - 1) / 2) * passo); }   /* o banzo que passa: 2 construtivos (a força passa no banzo) */
        else {
          var dir = sNo < G.L / 2 ? 1 : -1, sinT = Math.max(0.4, len(cross(G.X, ref.G.X))), x1 = q.b === ref.b ? bS : (hBanzo / 2 + FOLGA_C0 + bS) / sinT;
          for (var j = 0; j < q.nP; j++) xs.push(sNo + dir * (x1 + j * passo));
        }
        q.pts = xs.map(function (x) { return { x: x, Pc: ptBarra(G, x, 0, bLoc) }; });
        q.P2 = P2; q.L2 = L2; q.passo = passo;
      });
      /* parafusos de barras diferentes a menos de 3 db: a barra da alma recua meio passo (até 4 vezes) */
      for (var it = 0; it < 4; it++) {
        var mexeu = false;
        bars.forEach(function (q, iq) {
          if (q.cont) return;
          var bate = bars.some(function (r, ir) { return ir !== iq && r.pts.some(function (a) { return q.pts.some(function (b) { return len(sub(a.Pc, b.Pc)) < 3 * Math.max(q.P2.d, r.P2.d) / 1000; }); }); });
          if (!bate) return;
          var G = q.G, dir = q.pts.length > 1 ? (q.pts[1].x > q.pts[0].x ? 1 : -1) : 1, bLoc = q.L2.heel + q.L2.sg * gage(q.L2.b, q.L2.t, q.P2).g;
          q.pts = q.pts.map(function (a) { var x = a.x + dir * q.passo / 2; return { x: x, Pc: ptBarra(G, x, 0, bLoc) }; }); mexeu = true;
        });
        if (!mexeu) break;
      }
      bars.forEach(function (q) { q.pts = q.pts.filter(function (a) { return a.x > 0.005 && a.x < q.G.L - 0.005; }); });
      if (!bars.some(function (q) { return q.pts.length; })) return;
      /* a chapa de nó: no plano a = 0, espessura = folga da 2L, contorno = envoltória dos furos + borda */
      var e = bars[0].L2.e, u = unit(sub(ref.G.X, mul(nP, dot(ref.G.X, nP)))), v = unit(cross(nP, u)), O = add(P, mul(nP, dot(sub(bars[0].G.P0, P), nP)));
      var uv = [], furos = [];
      bars.forEach(function (q) { q.pts.forEach(function (a) { var d = sub(a.Pc, O); uv.push([dot(d, u), dot(d, v), q.P2]); }); });
      var bmax = 0; uv.forEach(function (q) { var bb = Nn.bordaMin(q[2].d, "serra").e / 1000; if (bb > bmax) bmax = bb; });
      var pts = []; uv.forEach(function (q) { for (var k = 0; k < 8; k++) { var an = Math.PI / 8 + k * Math.PI / 4, rr = bmax / Math.cos(Math.PI / 8); pts.push([q[0] + rr * Math.cos(an), q[1] + rr * Math.sin(an)]); } });
      var C = casca(pts), mu = Math.min.apply(null, C.map(function (q) { return q[0]; })), mv = Math.min.apply(null, C.map(function (q) { return q[1]; }));
      C = C.map(function (q) { return [q[0] - mu, q[1] - mv]; });
      uv.forEach(function (q) { furos.push({ u: q[0] - mu, v: q[1] - mv, db: q[2].d, tipo: "padrao" }); });
      var O2 = add(add(add(O, mul(u, mu)), mul(v, mv)), mul(nP, -e / 2));
      var ch = BM().chapa({ origem: O2, ex: u, ey: v, t: e, contorno: C, papel: "Chapa de nó", aco: "ASTM A36", furos: furos });
      if (ch.erro) { out.avisos.push("Nó " + nm + ": " + ch.erro); return; }
      var hostC = cx(ref.b), ligM = "no:" + nm;
      ch.metal.ligMont = ligM; criar(ch, hostC, "lig:noTrelica");
      bars.forEach(function (q) {
        var pega = { itens: [{ peca: "aba da 2L", t: q.L2.t }, { peca: "chapa de nó", t: e }, { peca: "aba da 2L", t: q.L2.t }], total: 2 * q.L2.t + e };
        q.pts.forEach(function (a) {
          var b0 = parafuso({ origem: add(a.Pc, mul(nP, -(e / 2 + q.L2.t))), eixo: nP, aperto: pega.total }, q.P2, q.classe || "8.8", ligM, pega);
          if (b0.erro) { out.avisos.push("Nó " + nm + ": " + b0.erro); return; }
          criar(b0, cx(q.b), "lig:noTrelica"); out.parafusos.noTrelica++;
        });
      });
      out.contagem.noTrelica++;
    });
    if (out.contagem.noTrelica && !LD) out.pendencias.push("Nós da treliça parafusados: " + N_POR_BARRA + " parafusos por barra e a chapa de nó da folga da 2L — " + PARTIDA + " (o cálculo do nó com chapa, js/metalchapano.js, verifica a solda; a ligação parafusada do nó tem de ser dimensionada).");
  }

  /* ===================================================== MÃO-FRANCESA */
  function maoFrancesa(c, Nn, criar, out, dq) {
    var M = BM(), mb = M.membro(c); if (!mb || !mb.perfil || mb.perfil.forma !== "L") return;
    var fs = M.faces(mb.perfil), fv = fs.filter(function (f) { return f.n === "a"; })[0]; if (!fv) return;
    var nPF = dq ? Math.max(2, dq.n) : N_POR_BARRA, P2 = Nn.parafuso(dq ? dq.id : "M12"), pt = Nn.partida(P2.d, "laminada"), passo = pt.passo / 1000, bS = Nn.bordaMin(P2.d, "serra").e / 1000;
    var tL = fv.t, larg = fv.larg, gg = gage(larg, tL, P2), bLoc = fv.y0 + gg.g;
    var aFora = fv.meio - tL / 2, tC = T_CHAPA_MF;
    [0, 1].forEach(function (ponta) {
      var xs = [], x1 = 0.06 + bS;   /* 60 mm: livra o apoio (meia altura do banzo/terça + folga) — PARTIDA */
      for (var k = 0; k < nPF; k++) xs.push(ponta ? mb.xOff + mb.L - x1 - k * passo : mb.xOff + x1 + k * passo);
      var xa = Math.min.apply(null, xs) - bS, xb = Math.max.apply(null, xs) + bS;
      if (ponta) xb = mb.xOff + mb.L; else xa = mb.xOff;
      /* R7: a ponta da TERÇA (a mais alta) com parede fina — a chapa passa da ponta da cantoneira e leva os parafusos na alma da terça
         (o plano da mão-francesa é o da alma da terça); sem solda nessa ponta */
      var naTerca = !!(dq && dq.terca) && ((ponta === 1) === (mb.X[1] >= 0)), xsT = [], PT = naTerca ? Nn.parafuso(dq.terca.id || "M12") : null;
      if (naTerca) {
        var pT = Nn.partida(PT.d, "laminada").passo / 1000, bT = Nn.bordaMin(PT.d, "serra").e / 1000, nT = Math.max(2, num(dq.terca.n, 2));
        var x0T = ponta ? mb.xOff + mb.L + bT : mb.xOff - bT;
        for (var kT = 0; kT < nT; kT++) xsT.push(ponta ? x0T + kT * pT : x0T - kT * pT);
        if (ponta) xb = Math.max.apply(null, xsT) + bT; else xa = Math.min.apply(null, xsT) - bT;
      }
      var O = M.membroPonto(mb, xa, aFora - tC, fv.y0);
      var ch = M.chapa({ origem: O, ex: mb.X, ey: mb.B, t: tC, ret: { L: xb - xa, B: larg }, papel: "Chapa da mão-francesa", aco: "ASTM A36",
        furos: xs.map(function (x) { return { u: x - xa, v: bLoc - fv.y0, db: P2.d, tipo: "padrao" }; }) });
      if (ch.erro) { out.avisos.push("Mão-francesa: " + ch.erro); return; }
      /* ex × ey tem de apontar para a cantoneira (+A): se não, a chapa nasceu do lado de dentro — espelha a origem */
      var ez = cross(mb.X, mb.B); if (dot(ez, mb.A) < 0) { ch = M.chapa({ origem: M.membroPonto(mb, xa, aFora, fv.y0), ex: mb.X, ey: mb.B, t: tC, ret: { L: xb - xa, B: larg }, papel: "Chapa da mão-francesa", aco: "ASTM A36", furos: xs.map(function (x) { return { u: x - xa, v: bLoc - fv.y0, db: P2.d, tipo: "padrao" }; }) }); }
      var ligM = "mf:" + c.id + ":" + ponta; ch.metal.ligMont = ligM;
      if (naTerca) { ch.metal.papel = "Chapa da mão-francesa (parafusada na terça)"; ch.metal.furos = (ch.metal.furos || []).concat(xsT.map(function (x) { return { u: r6(x - xa), v: r6(larg / 2), db: PT.d, d: Nn.furo(PT.d, "padrao").d, l: Nn.furo(PT.d, "padrao").d, tipo: "padrao" }; })); }
      else ch.metal.solda = { tipo: "filete", perna: Nn.soldaMin(tC * 1000).perna, lados: "ambos", comprimento: Math.round(larg * 1000) / 1000, campo: false };
      criar(ch, c, "lig:maoFrancesa");
      var pega = { itens: [{ peca: "chapa da mão-francesa", t: tC }, { peca: "aba da cantoneira", t: tL }], total: tC + tL };
      xs.forEach(function (x) {
        var b0 = parafuso({ origem: M.membroPonto(mb, x, aFora - tC, bLoc), eixo: mb.A, aperto: pega.total }, P2, dq ? dq.classe : "8.8", ligM, pega);
        if (b0.erro) { out.avisos.push("Mão-francesa: " + b0.erro); return; }
        criar(b0, c, "lig:maoFrancesa"); out.parafusos.maoFrancesa++;
      });
      if (naTerca) {
        var pegaT = { itens: [{ peca: "chapa da mão-francesa", t: tC }, { peca: "alma da terça", t: num(dq.terca.t, 2.66) / 1000 }], total: tC + num(dq.terca.t, 2.66) / 1000 };
        xsT.forEach(function (x) {
          var bT0 = parafuso({ origem: M.membroPonto(mb, x, aFora - tC, fv.y0 + larg / 2), eixo: mb.A, aperto: pegaT.total }, PT, dq.terca.classe || "8.8", ligM + ":terca", pegaT);
          if (bT0.erro) { out.avisos.push("Mão-francesa (terça): " + bT0.erro); return; }
          criar(bT0, c, "lig:maoFrancesa"); out.parafusos.maoFrancesa++; out.parafusos.mfTerca = (out.parafusos.mfTerca || 0) + 1;
        });
      }
      out.contagem.maoFrancesa++;
    });
  }

  /* envoltória convexa (monotone chain) */
  function casca(P) {
    var p = P.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; }), cr = function (o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); };
    var lo = [], hi = [];
    p.forEach(function (q) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); });
    for (var i = p.length - 1; i >= 0; i--) { var q = p[i]; while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
    lo.pop(); hi.pop(); return lo.concat(hi);
  }

  /* comprimento do parafuso conferido contra a pega (o teste e a lista usam) */
  function conferirParafuso(c) {
    var m = c && c.metal, Nn = N(); if (!m || m.kind !== "parafuso" || !Nn) return { ok: false };
    var P = Nn.parafuso(m.id); if (!P) return { ok: false };
    if (m.soPorca) return { ok: true, soPorca: m.soPorca, Lmm: 0, Lmin: 0 };
    var ap = num(m.aperto, 0) * 1000, Lmin = ap + num(m.arrPorca, 0) * P.arr.h + num(m.arrCabeca, 0) * P.arr.h + P.m + (m.porcaNivel ? P.m : 0) + (m.chumbador ? num(m.chumbador.ancoragem, 0) * 1000 : 0);
    return { ok: num(m.Lmm, 0) >= Lmin - 1e-6, Lmm: num(m.Lmm, 0), Lmin: Math.round(Lmin * 10) / 10, pega: ap, regra: REGRA_L };
  }

  /* nível de detalhe do 3D pela distância da câmera ao parafuso (m): de perto tudo; no meio só a haste e a cabeça; de longe some */
  var LOD = { detalhe: 6, simples: 25 };
  function lod(dist) { return dist <= LOD.detalhe ? "detalhe" : dist <= LOD.simples ? "simples" : "oculto"; }

  var MetalParafusos = { completar: completar, ligacaoDe: ligacaoDe, conferirParafuso: conferirParafuso, lod: lod, LOD: LOD, REGRA_L: REGRA_L, PARTIDA: PARTIDA, _i: { barraGeo: barraGeo, geo2L: geo2L, casca: casca, gage: gage } };
  global.MetalParafusos = MetalParafusos;
  if (typeof module !== "undefined" && module.exports) module.exports = MetalParafusos;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
