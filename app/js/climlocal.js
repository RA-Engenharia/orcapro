/* =====================================================================
 * climlocal.js — ONDE FICA cada unidade (climatização, frente C1).
 * Motor PURO, ES5, Node-testável. Contrato: docs/hidro/CONTRATO-CLIMA.md.
 *
 *  · evaporadora(): a parede (hi-wall, piso-teto, janela) ou o forro
 *    (cassete, duto) do ambiente — parede com comprimento para a unidade
 *    do catálogo, o JATO sem bater na cama/sofá informados, e, entre as que
 *    servem, a parede EXTERNA (linha curta) ou a mais perto da condensadora;
 *  · candidatosFachada(): um candidato no lado de fora de cada parede
 *    externa (no piso do pavimento: térreo = base no piso, acima = suporte);
 *  · condensadora(): pontua os candidatos (os do usuário — cobertura, área
 *    técnica — e os da fachada) pelo nº de evaporadoras FORA dos limites do
 *    fabricante, depois pelo comprimento total, pelo acesso e pelo ruído;
 *  · rota(): o traçado PRELIMINAR ortogonal (a C2 traça embutido com A*);
 *  · suporte(): a carga de cada mão-francesa pela NBR 16655-1 (apud ABRAVA),
 *    números lidos do texto da fonte.
 *
 * ⚠ Afastamentos mínimos da condensadora (parede, teto, frente) NÃO foram
 *   extraídos dos manuais: a verificação sai PENDENTE, não "ok".
 * ⚠ Afastamento da evaporadora ao teto também pendente: o topo da unidade
 *   vai encostado no teto e o resultado diz isso.
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arquivo) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arquivo); } catch (e) {} }
    return null;
  }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v) { var n = Number(v); return v !== null && v !== "" && v !== undefined && isFinite(n) ? n : null; }
  function r3(v) { return Math.round(v * 1000) / 1000; }
  function fmt(v, c) { return v == null || !isFinite(v) ? "—" : v.toFixed(c == null ? 1 : c).replace(".", ","); }
  var EPS = 1e-6;   /* clim:ok tolerância geométrica (m) */
  function mm(v) { var n = num(v); return n == null ? null : n / 1000; }

  function dimEvap(conj) { var d = (conj && conj.evaporadora && conj.evaporadora.dim) || {}; return { larg: mm(d.largura_mm), alt: mm(d.altura_mm), prof: mm(d.profundidade_mm) }; }
  function dimCond(conj) { var d = (conj && conj.condensadora && conj.condensadora.dim) || {}; return { larg: mm(d.largura_mm), alt: mm(d.altura_mm), prof: mm(d.profundidade_mm) }; }
  function meio(p) { return { x: (p.p0.x + p.p1.x) / 2, z: (p.p0.z + p.p1.z) / 2 }; }
  function tangente(p) { var dx = p.p1.x - p.p0.x, dz = p.p1.z - p.p0.z, L = Math.sqrt(dx * dx + dz * dz) || 1; return { x: dx / L, z: dz / L }; }
  function rotYDe(v) { return Math.atan2(v.x, v.z); }   /* rotY: o +Z local da família aponta para a frente (o jato) */

  /* o jato sai da parede para dentro (−normal); atinge o ponto se ele está À FRENTE e dentro da largura da unidade.
     m = onde a unidade está na parede (padrão: o meio) */
  function jatoAtinge(p, larg, alvo, m) {
    m = m || meio(p);
    var t = tangente(p), n = p.normal, dx = alvo.x - m.x, dz = alvo.z - m.z;
    var frente = -(dx * n.x + dz * n.z), lado = Math.abs(dx * t.x + dz * t.z);
    return frente > 0 && lado <= (larg || 0) / 2;
  }

  /* ----------------------------------------------------- EVAPORADORA */
  function evaporadora(amb, tipo, conj, alvo) {
    var d = dimEvap(conj), passos = [], pend = [], obst = arr(amb.camas).concat(arr(amb.sofas));
    var cota = num(amb.cota_m) || 0, pd = num(amb.peDireito_m);
    if (tipo === "cassete" || tipo === "duto") {
      var f = amb.forro || {};
      if (!f.existe) return { ok: false, motivo: "sem forro para " + tipo, passos: passos, pendencias: pend };
      var c = amb.centro || { x: 0, z: 0 }, y = num(f.cota_m) != null ? f.cota_m : cota + (pd || 0);
      if (d.alt == null) pend.push("altura da unidade " + tipo + " (catálogo)");
      var pos = { x: c.x, y: r3(y + (d.alt || 0) / 2), z: c.z };
      /* duto: a unidade vai junto à parede mais perto da condensadora (retorno no forro); o insuflamento sai no centro */
      if (tipo === "duto" && alvo) {
        var best = null; arr(amb.paredes).forEach(function (p) { var m = meio(p), dd = Math.abs(m.x - alvo.x) + Math.abs(m.z - alvo.z); if (!best || dd < best.d) best = { p: p, d: dd }; });
        if (best) { var m0 = meio(best.p); pos.x = r3(m0.x - best.p.normal.x * (d.prof || 0) / 2); pos.z = r3(m0.z - best.p.normal.z * (d.prof || 0) / 2); passos.push("unidade dutada no plenum junto à parede " + best.p.id + " (lado da condensadora)"); }
      } else passos.push((tipo === "cassete" ? "cassete" : "unidade") + " no centro do forro do ambiente");
      return { ok: true, x: pos.x, y: pos.y, z: pos.z, rotY: 0, montagem: tipo === "cassete" ? "forro" : "plenum", insuflamento: { x: c.x, y: y, z: c.z }, jatoLivre: true, passos: passos, pendencias: pend };
    }
    /* parede: hi-wall, piso-teto, janela */
    var cands = arr(amb.paredes).filter(function (p) { return (tipo !== "janela" || p.externa) && (d.larg == null || num(p.comprimento_m) >= d.larg); });
    if (!cands.length) return { ok: false, motivo: tipo === "janela" ? "nenhuma parede externa" : "nenhuma parede com comprimento para a unidade" + (d.larg != null ? " (" + fmt(d.larg, 2) + " m)" : ""), passos: passos, pendencias: pend };
    if (d.larg == null) pend.push("largura da evaporadora (catálogo)");
    /* em cada parede, três lugares: o meio e as duas pontas (a unidade inteira dentro da parede) — o
       primeiro com o jato livre vale (quarto com a cama no meio: a unidade vai para o canto) */
    var av = cands.map(function (p) {
      var t = tangente(p), L = num(p.comprimento_m) || 0, folga = Math.max(0, (L - (d.larg || 0)) / 2), m0 = meio(p), lugares = [m0];
      if (folga > 0) { lugares.push({ x: m0.x - t.x * folga, z: m0.z - t.z * folga }); lugares.push({ x: m0.x + t.x * folga, z: m0.z + t.z * folga }); }
      var m = lugares.filter(function (q) { return !obst.some(function (o) { return jatoAtinge(p, d.larg, o, q); }); })[0], livre = !!m;
      m = m || m0;
      return { p: p, m: m, livre: livre, dist: alvo ? Math.abs(m.x - alvo.x) + Math.abs(m.z - alvo.z) : null };
    });
    av.sort(function (a, b) {
      if (a.livre !== b.livre) return a.livre ? -1 : 1;
      if (a.dist != null && b.dist != null && a.dist !== b.dist) return a.dist - b.dist;
      if (a.p.externa !== b.p.externa) return a.p.externa ? -1 : 1;
      return (num(b.p.comprimento_m) || 0) - (num(a.p.comprimento_m) || 0);
    });
    var e = av[0], m = e.m, dentro = { x: -e.p.normal.x, z: -e.p.normal.z }, prof = d.prof || 0;
    var yE;
    if (tipo === "janela") { yE = cota + (pd || 0) / 2; passos.push("aparelho de janela a meia altura da parede (preliminar: confirmar a altura do vão)"); }
    else { yE = cota + (pd || 0) - (d.alt || 0) / 2; pend.push("afastamento da evaporadora ao teto (manual de instalação não extraído) — topo encostado no teto"); }
    passos.push("parede " + e.p.id + (e.p.externa ? " (externa)" : "") + (e.livre ? "; jato sem atingir cama/sofá" : "; ⚠ o jato atinge cama/sofá em todas as paredes possíveis"));
    return { ok: true, x: r3(m.x + dentro.x * prof / 2), y: r3(yE), z: r3(m.z + dentro.z * prof / 2), rotY: rotYDe(dentro), parede: e.p.id, montagem: "parede", jatoLivre: e.livre, passos: passos, pendencias: pend };
  }

  /* --------------------------------------- CANDIDATOS NA FACHADA */
  /* afastamento_m: o da face da unidade à parede (NBR 16655-1 4.4.7.2: 200 mm na falta do fabricante) — vem do orquestrador */
  function candidatosFachada(ambs, conj, cotaTerreo, afastamento_m) {
    var d = dimCond(conj), out = [], base = num(cotaTerreo), af = num(afastamento_m) || 0;
    arr(ambs).forEach(function (a) {
      arr(a.paredes).forEach(function (p) {
        if (!p.externa) return;
        var m = meio(p), off = (num(p.espessura_m) || 0) + af + (d.prof || 0) / 2, cota = num(a.cota_m) || 0;
        var terreo = base != null && cota <= base;
        out.push({ id: "fach-" + a.id + "-" + p.id, tipo: terreo ? "piso_externo" : "fachada", ambiente: a.id, parede: p.id, afastamento_m: af,
                   x: r3(m.x + p.normal.x * off), y: r3(cota + (d.alt || 0) / 2), z: r3(m.z + p.normal.z * off), rotY: rotYDe(p.normal),
                   acesso: terreo, gerado: true });
      });
    });
    return out;
  }

  /* ----------------------------------------------------------- ROTA
   * ortogonal: sai da evaporadora na altura dela, corre em X, depois em Z
   * e desce/sobe na vertical até a condensadora. aplicacao do trecho:
   * vertical = parede; horizontal = forro (se há) ou parede. */
  function rota(a, b, forro) {
    var pts = [{ x: a.x, y: a.y, z: a.z }, { x: b.x, y: a.y, z: a.z }, { x: b.x, y: a.y, z: b.z }, { x: b.x, y: b.y, z: b.z }];
    var lim = [pts[0]]; pts.slice(1).forEach(function (p) { var q = lim[lim.length - 1]; if (Math.abs(p.x - q.x) + Math.abs(p.y - q.y) + Math.abs(p.z - q.z) > EPS) lim.push(p); });
    var segs = [], L = 0;
    for (var i = 1; i < lim.length; i++) {
      var p1 = lim[i - 1], p2 = lim[i], c = Math.abs(p2.x - p1.x) + Math.abs(p2.y - p1.y) + Math.abs(p2.z - p1.z), vert = Math.abs(p2.y - p1.y) > EPS;
      segs.push({ p1: p1, p2: p2, comprimento_m: c, aplicacao: vert ? "parede" : (forro ? "forro" : "parede") }); L += c;
    }
    return { pontos: lim, segmentos: segs, comprimento_m: L, conexoes: Math.max(0, segs.length - 1), desnivel_m: b.y - a.y };
  }

  /* ---------------------------------------------------- CONDENSADORA
   * evaps = [{ id, pos:{x,y,z}, conj, forro }]; candidatos = [{id, tipo, x, y, z, acesso, distanciaVizinho_m}] */
  function condensadora(evaps, candidatos, ctx) {
    var E = dep("ClimEquip", "./climequip.js"), rank = [];
    arr(candidatos).forEach(function (c) {
      var tot = 0, fora = 0, linhas = [];
      arr(evaps).forEach(function (e) {
        var r = rota(e.pos, c, e.forro), v = e.conj && E ? E.verificarLinha(e.conj, r, e.id) : null;
        var nFora = v ? v.verificacoes.filter(function (x) { return x.status === "reprovado"; }).length : 0;
        if (nFora) fora++;
        tot += r.comprimento_m; linhas.push({ evap: e.id, rota: r, verificacao: v });
      });
      rank.push({ candidato: c, evapsForaDoLimite: fora, comprimentoTotal_m: r3(tot), linhas: linhas });
    });
    rank.sort(function (a, b) {
      if (a.evapsForaDoLimite !== b.evapsForaDoLimite) return a.evapsForaDoLimite - b.evapsForaDoLimite;
      if (Math.abs(a.comprimentoTotal_m - b.comprimentoTotal_m) > EPS) return a.comprimentoTotal_m - b.comprimentoTotal_m;
      if (!!a.candidato.acesso !== !!b.candidato.acesso) return a.candidato.acesso ? -1 : 1;
      return (num(b.candidato.distanciaVizinho_m) || 0) - (num(a.candidato.distanciaVizinho_m) || 0);
    });
    if (ctx && rank.length) ctx.pendencia("catalogo.clim.afastamentos_condensadora", "afastamentos da condensadora à FRENTE, ao topo e entre unidades não extraídos dos manuais (a NBR 16655-1 4.4.7.2 só dá a parede: 200 mm)", "posição da condensadora");
    return { escolhido: rank[0] || null, ranking: rank };
  }

  /* ---------------------------------------------------- SUPORTE (16655-1) */
  function suporte(conj, ctx) {
    var C = dep("ClimCarga", "./climcarga.js"), peso = conj && conj.condensadora ? num(conj.condensadora.peso_kg) : null, uso = "suporte da condensadora";
    /* ⚠ revisão 17/10/2026: a NBR 16655-1:2018 foi lida no texto (4.4.3/4.4.4, primária) e substitui a apresentação
       da ABRAVA. O texto: "dimensionar o PAR de suportes para 6 × o peso" (4.4.4) e "CADA mão-francesa deve suportar
       o peso conforme 4.4.4" (4.4.3). Lado seguro (decisão C1): cada mão-francesa ≥ 6 × peso; a leitura do par sai
       no passo. Sem a 16655-1 carregada, volta à ABRAVA (secundária). */
    var cF = ctx.consulta("cl.nbr16655_1.requisitos", { parametro: "suporte_fator_peso" }, "valor", uso), cM = ctx.consulta("cl.nbr16655_1.requisitos", { parametro: "suporte_peso_minimo" }, "valor", uso);
    var fator, pmin, c, ref;
    if (cF.ok && cM.ok) { fator = num(cF.valor); pmin = num(cM.valor); c = cF; ref = "NBR 16655-1:2018 4.4.3/4.4.4, lida no texto"; }
    else {
      var l = C ? C.linhaPorRotulo(ctx, "cl.nbr16655_resumo", null, "item", /^suporte da unidade externa$/i, uso) : null;
      if (!l) return { status: "pendente", passos: ["NBR 16655-1: requisito do suporte não lido"] };
      fator = C.numeroAntesDe(l.conteudo, /vezes/); pmin = C.numeroAntesDe(l.conteudo, /kg/);
      if (fator == null || pmin == null) { ctx.pendencia("cl.nbr16655_resumo[suporte]", "fator ou peso mínimo não legível no texto da fonte", uso); return { status: "pendente", passos: [] }; }
      c = ctx.consulta("cl.nbr16655_resumo", null, "conteudo", uso); ref = "NBR 16655-1, apud ABRAVA 2018 — fonte secundária";
    }
    /* ⚠ revisão 17/10/2026 A3 (decisão do RT): peso AUSENTE no catálogo → PENDENTE. Os 40 kg da norma são
       PISO, não substituto do peso — a Daikin de 24.000 tem 46 kg (276 kg por mão-francesa, não 240). */
    if (peso == null) {
      var cod = conj && conj.condensadora ? conj.condensadora.codigo : "?";
      ctx.pendencia("catalogo.clim.peso_condensadora[" + cod + "]", "falta o peso da condensadora " + cod + " no catálogo: a carga do suporte não pode ser calculada", uso);
      return { status: "pendente", fator: fator, pesoMinimo_kg: pmin, peso_kg: null, cargaPorMaoFrancesa_kg: null, cargaMinima_kg: fator * pmin, fonte: c.ok ? c.fonte : null,
               passos: ["falta o peso da condensadora " + cod + " no catálogo — suporte PENDENTE", "mínimo da norma (não é a verificação): cada mão-francesa ≥ " + fator + " × " + pmin + " = " + fmt(fator * pmin, 1) + " kg"] };
    }
    var base = Math.max(peso, pmin), carga = fator * base;
    return { status: "ok", fator: fator, pesoMinimo_kg: pmin, peso_kg: peso, cargaPorMaoFrancesa_kg: carga, fonte: c.ok ? c.fonte : null,
             passos: ["peso " + fmt(peso, 1) + " kg; mínimo " + pmin + " kg",
                      "cada mão-francesa ≥ " + fator + " × " + fmt(base, 1) + " = " + fmt(carga, 1) + " kg (" + ref + "; lado seguro — a leitura do 4.4.4, o PAR para " + fator + " × o peso, daria metade por mão-francesa)"] };
  }

  var ClimLocal = { VERSAO: 1, evaporadora: evaporadora, candidatosFachada: candidatosFachada, condensadora: condensadora, rota: rota, suporte: suporte, jatoAtinge: jatoAtinge };
  global.ClimLocal = ClimLocal;
  if (typeof module !== "undefined" && module.exports) module.exports = ClimLocal;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
