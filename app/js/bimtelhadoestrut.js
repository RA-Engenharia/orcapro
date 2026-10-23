/* =====================================================================
 * bimtelhadoestrut.js — ESTRUTURA AUTOMÁTICA DO TELHADO (metálica e de
 * madeira), motor PURO (ES5, Node-testável). Frente "cob" (19/10/2026).
 *
 * O engenheiro lança o telhado e pede "Estrutura do telhado": este motor lê o
 * telhado calculado (js/bimtelhado.js), a telha do tipo (catálogo com fonte:
 * vão máximo entre apoios) e as PAREDES do modelo, e devolve as peças como
 * ops `criar` num LOTE (um Ctrl+Z desfaz tudo; gerar de novo SUBSTITUI o lote
 * — idempotente, ids fixos).
 *
 * COMO A ESTRUTURA É ARMADA (por água do telhado, no sistema do plano dela:
 * u = o sentido que SOBE, t = ao longo do beiral):
 *   · TERÇAS, horizontais, ao longo do beiral (t), em fileiras de u: a primeira a
 *     `balanco` do beiral, a última a `balancoAlto` da borda de cima, e entre elas
 *     o MENOR número de intervalos que respeita o vão máximo da telha
 *     (distância no plano inclinado: Δu · √(1 + i²)). Fibrocimento Brasilit 6 mm: 1,69 m;
 *     sanduíche TP40/EPS 0,43 mm: 1,40 m (catálogos em BimTelhado.TELHAS).
 *   · LINHAS DE APOIO das terças (no sentido do caimento): uma em cada ponta da água, as
 *     que as PAREDES do modelo já fazem (parede paralela ao caimento) e, onde o vão passa de
 *     `vaoTerca`, linhas a mais em partes iguais. Em cada linha, uma VIGA PRINCIPAL
 *     (metálica: perfil W; madeira: peça serrada) inclinada com o telhado, sob as terças.
 *   · APOIO das vigas: onde a viga cruza uma parede cujo topo alcança a face de baixo da
 *     viga, ela APOIA na parede; onde falta, PILAR metálico (ou PONTALETE de madeira) até
 *     o topo da parede (ou até o nível, se não há parede). Cada apoio sai no relatório.
 *   · Metálica: terça em Ue (formado a frio), viga em W, pilar em W — os perfis do catálogo
 *     da Metálica (js/perfisaco.js), criados pelo MESMO motor das ferramentas (js/metalcriar.js):
 *     o cálculo da estrutura desenhada (js/acodimlivre.js) lê as peças como qualquer outra
 *     (verificarAco). Madeira: seções do catálogo do fornecedor (Nibra, 5×5 a 20×20 cm).
 *
 * ⚠ PRÉ-DIMENSIONADO — CONFIRMAR NO CÁLCULO. Os perfis, as seções e o `vaoTerca` são
 *   PARÂMETROS ADOTADOS (marcados em `premissas`), não resultado de cálculo. Nenhuma resistência
 *   é inventada aqui: a metálica liga ao cálculo que o módulo Metálica já tem (verificarAco) e a
 *   madeira fica "a confirmar no módulo Madeira". O que a ficha da telha não traz (peso da
 *   sanduíche, balanço do beiral) sai "não verificado".
 *
 * API
 *   gerar(estado, telhadoId, opc) → { ok, motivo, material, ops:[lote], pecas:[…], apoios:[…], premissas, avisos, resumo }
 *   opLote(res)                    → a op "lote" (id fixo "tec-<telhado>")
 *   opsSubstituir(opsAtuais, res)  → a lista de ops com o lote antigo trocado pelo novo
 *   quantitativo(estado, opc)      → { itens, avisos } (kg de aço, m³ de madeira, SINAPI só quando existe)
 *   entradaCalculo / verificarAco  → o cálculo da estrutura de aço desenhada (js/acodimlivre.js)
 *   estruturaDoTelhado(estado, id) → as peças dessa estrutura no estado
 * Teste: o teste da cobertura completa, em tools/ (unidade) e a e2e da mesma frente.
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function r6(v) { return Math.round(v * 1e6) / 1e6; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function virg(v, c) { return (Math.round(v * Math.pow(10, c == null ? 2 : c)) / Math.pow(10, c == null ? 2 : c)).toFixed(c == null ? 2 : c).replace(".", ","); }
  function BT() { return dep("BimTelhado", "./bimtelhado.js"); }
  function MC() { return dep("MetalCriar", "./metalcriar.js"); }
  function PA() { return dep("PerfisAco", "./perfisaco.js"); }
  function BA() { return dep("BimArq", "./bimarq.js"); }
  function BC() { return dep("BimCobertura", "./bimcobertura.js"); }

  /* ------------------------------------------------------------ seções de madeira
     O catálogo do fornecedor (Nibra, Catálogo MWF p. 5–10, madeira serrada; dados-fonte/madeira/catalogos/nibra_mwf.json,
     "Peça 5x5 … 20x20", comprimentos de 3 a 6 m) e o sarrafo de pinus autoclavado 5×5 (Catálogo Pro p. 5). As medidas vêm
     SEM unidade impressa: leio como cm (dúvida registrada no nibra_LEIA.md). Medidas BRUTAS — a seção de cálculo é decisão do RT. */
  var FONTE_MADEIRA = "Nibra — Catálogo MWF p. 5–10 (madeira serrada, medidas brutas, lidas em cm) e Catálogo Pro p. 5 (sarrafo 5×5)";
  var SECOES_MADEIRA = [
    { id: "5x5", b: 0.05, h: 0.05 }, { id: "5x10", b: 0.05, h: 0.10 }, { id: "5x15", b: 0.05, h: 0.15 }, { id: "5x30", b: 0.05, h: 0.30 },
    { id: "6x12", b: 0.06, h: 0.12 }, { id: "8x8", b: 0.08, h: 0.08 }, { id: "8x16", b: 0.08, h: 0.16 }, { id: "10x20", b: 0.10, h: 0.20 },
    { id: "15x15", b: 0.15, h: 0.15 }, { id: "20x20", b: 0.20, h: 0.20 }
  ];
  function secaoMadeira(id) { for (var i = 0; i < SECOES_MADEIRA.length; i++) if (SECOES_MADEIRA[i].id === String(id)) return SECOES_MADEIRA[i]; return null; }

  /* PARÂMETROS ADOTADOS (sem fonte de norma/catálogo: aparecem em `premissas` e a tela mostra "adotado") */
  var PADRAO = {
    aco: { perfilTerca: "Ue 150 x 60 x 20 x 3,00", perfilViga: "W250X25.3", perfilPilar: "W200X15", vaoTerca: 3.5 },
    madeira: { secaoTerca: "6x12", secaoViga: "8x16", secaoPontalete: "8x8", vaoTerca: 2.5, espPontalete: 2.0 },
    balancoBeiralComCalha: 0.20, balancoBeiralSemCalha: 0.30, balancoBeiralSemDado: 0.25, balancoAlto: 0.10,
    ext: 0.10, insetViga: 0.10, tolApoio: 0.10, distPonta: 0.75, alcanceApoio: 0.7, calcoMax: 0.05
  };

  /* ------------------------------------------------------------ geometria */
  function pl(p) { return [p.x, p.z]; }
  function dist2(a, b) { var dx = a[0] - b[0], dz = a[1] - b[1]; return Math.sqrt(dx * dx + dz * dz); }
  /* a corda do polígono Q na reta { d·p = u }: intervalos em t (tdir·p) ordenados */
  function cordasU(Q, u, d, td) {
    var ts = [], n = Q.length, i;
    for (i = 0; i < n; i++) {
      var A = Q[i], B = Q[(i + 1) % n], ua = d[0] * A[0] + d[1] * A[1], ub = d[0] * B[0] + d[1] * B[1];
      if ((ua < u) === (ub < u)) continue;
      var k = (u - ua) / (ub - ua), x = A[0] + k * (B[0] - A[0]), z = A[1] + k * (B[1] - A[1]);
      ts.push(td[0] * x + td[1] * z);
    }
    ts.sort(function (a, b) { return a - b; });
    var out = []; for (i = 0; i + 1 < ts.length; i += 2) if (ts[i + 1] - ts[i] > 1e-6) out.push([ts[i], ts[i + 1]]);
    return out;
  }
  /* a corda na reta { tdir·p = t }: intervalos em u */
  function cordasT(Q, t, d, td) {
    var us = [], n = Q.length, i;
    for (i = 0; i < n; i++) {
      var A = Q[i], B = Q[(i + 1) % n], ta = td[0] * A[0] + td[1] * A[1], tb = td[0] * B[0] + td[1] * B[1];
      if ((ta < t) === (tb < t)) continue;
      var k = (t - ta) / (tb - ta), x = A[0] + k * (B[0] - A[0]), z = A[1] + k * (B[1] - A[1]);
      us.push(d[0] * x + d[1] * z);
    }
    us.sort(function (a, b) { return a - b; });
    var out = []; for (i = 0; i + 1 < us.length; i += 2) if (us[i + 1] - us[i] > 1e-6) out.push([us[i], us[i + 1]]);
    return out;
  }
  function deUT(u, t, d, td) { return [u * d[0] + t * td[0], u * d[1] + t * td[1]]; }

  /* as paredes do modelo como retângulos */
  function paredesDe(estado) {
    var out = [];
    arr(estado && estado.caixas).forEach(function (c) {
      if (!c || c.tipo !== "parede") return;
      var th = num(c.rotY, 0), ux = Math.cos(th), uz = -Math.sin(th);
      out.push({ id: c.id, cx: num(c.cx, 0), cz: num(c.cz, 0), ux: ux, uz: uz, L: num(c.comprimento, 0), e: num(c.espessura, 0.15), topo: num(c.cy, 0) + num(c.altura, 0) / 2, base: num(c.cy, 0) - num(c.altura, 0) / 2,
               modo: c.anexarTelhado === "sim" || c.anexarTelhado === "nao" ? c.anexarTelhado : "auto" });   /* T5: "Anexar ao telhado" da parede */
    });
    return out;
  }
  /* o trecho [s0, s1] (em metros desde A) em que o segmento A→B está dentro da parede (expandida de tol), ou null */
  function trechoNaParede(A, B, w, tol) {
    var dx = B[0] - A[0], dz = B[1] - A[1], Ls = Math.sqrt(dx * dx + dz * dz); if (!(Ls > 1e-9)) return null;
    function loc(p) { var rx = p[0] - w.cx, rz = p[1] - w.cz; return [rx * w.ux + rz * w.uz, -rx * w.uz + rz * w.ux]; }
    var a = loc(A), b = loc(B), lo = 0, hi = 1, i, lim = [w.L / 2 + tol, w.e / 2 + tol];
    for (i = 0; i < 2; i++) {
      var p0 = a[i], dp = b[i] - a[i];
      if (Math.abs(dp) < 1e-12) { if (Math.abs(p0) > lim[i]) return null; continue; }
      var t1 = (-lim[i] - p0) / dp, t2 = (lim[i] - p0) / dp, ta = Math.min(t1, t2), tb = Math.max(t1, t2);
      lo = Math.max(lo, ta); hi = Math.min(hi, tb);
      if (lo > hi) return null;
    }
    return [lo * Ls, hi * Ls];
  }

  /* ------------------------------------------------------------ perfis */
  function alturaPerfilAco(cat) {
    var A = PA(), o = A && A.obter ? A.obter(cat) : null; if (!o) return null;
    var mm = o.forma === "frio" ? o.bw : (o.d != null ? o.d : (o.h != null ? o.h : null));
    return mm != null ? mm / 1000 : null;
  }
  function massaPerfilAco(cat) { var A = PA(), o = A && A.obter ? A.obter(cat) : null; return o && fin(o.massa) ? o.massa : null; }

  /* ============================================================ GERAR */
  function gerar(estado, telhadoId, opc) {
    opc = opc || {};
    var T = BT(), t = null;
    arr(estado && estado.telhados).forEach(function (x) { if (String(x.id) === String(telhadoId)) t = x; });
    if (!T) return { ok: false, motivo: "O motor do telhado (js/bimtelhado.js) não carregou." };
    if (!t) return { ok: false, motivo: "Telhado não encontrado: " + telhadoId };
    if (!t.ok) return { ok: false, motivo: "O telhado não fechou (ver os avisos dele): sem estrutura." };
    if (t.modo !== "perimetro") return { ok: false, motivo: "A estrutura automática é do telhado por perímetro." };
    /* T1: o telhado com MODELO já tem a estrutura derivada (js/bimtelhadoestrut.js modelar) — duas estruturas no mesmo telhado, não */
    if (t.modelo && !opc.mesmoComModelo) return { ok: false, motivo: "Este telhado já tem a estrutura do modelo \"" + (MODELOS[t.modelo] ? MODELOS[t.modelo].rotulo : t.modelo) + "\" (Arquitetura › Telhado › Telhado completo). Para usar esta estrutura avulsa, escolha \"Sem estrutura\" no modelo antes." };
    var tel = T.telha(t.tipoId), avisos = [], premissas = [];
    var mat = opc.material === "aco" || opc.material === "madeira" ? opc.material : (tel && tel.familia === "sanduiche" ? "aco" : "madeira");
    var vao = fin(Number(opc.vaoTelha)) ? Number(opc.vaoTelha) : (tel ? tel.vaoMaxEntreApoios : null);
    if (tel && tel.vaoMaxPorAco && fin(Number(opc.acoMm))) { var vk = tel.vaoMaxPorAco[Number(opc.acoMm).toFixed(2)]; if (fin(vk)) vao = vk; }
    if (!fin(vao) || !(vao > 0.2)) return { ok: false, motivo: "O vão máximo entre apoios desta telha NÃO está verificado (" + (tel ? tel.vaoFonte : "tipo sem dados de catálogo") + "). Informe `vaoTelha` com a fonte do fabricante." };
    if (tel) premissas.push("vão máximo da telha " + virg(vao) + " m — " + (tel.vaoFonte || "informado"));
    else premissas.push("vão máximo da telha " + virg(vao) + " m — informado pelo projetista (tipo sem dados de catálogo)");
    var P = PADRAO[mat], vaoTerca = fin(Number(opc.vaoTerca)) ? Number(opc.vaoTerca) : P.vaoTerca;
    premissas.push("vão entre as linhas de apoio das terças " + virg(vaoTerca) + " m — " + (fin(Number(opc.vaoTerca)) ? "informado" : "ADOTADO (pré-dimensionamento), a confirmar no cálculo"));
    var bal = fin(Number(opc.balanco)) ? Number(opc.balanco) : null, balNota;
    if (bal == null) {
      if (tel && tel.balanco) { bal = opc.comCalha === false ? PADRAO.balancoBeiralSemCalha : PADRAO.balancoBeiralComCalha; balNota = "dentro da faixa " + (opc.comCalha === false ? "sem calha 25–40 cm" : "com calha 10–25 cm") + " (" + tel.balancoFonte + ")"; }
      else { bal = PADRAO.balancoBeiralSemDado; balNota = "ADOTADO — o balanço máximo do beiral desta telha não está verificado"; }
    } else balNota = "informado";
    premissas.push("balanço da telha além da 1ª terça (beiral) " + virg(bal) + " m — " + balNota);
    var balAlto = fin(Number(opc.balancoAlto)) ? Number(opc.balancoAlto) : PADRAO.balancoAlto;
    var ext = fin(Number(opc.ext)) ? Number(opc.ext) : PADRAO.ext, inset = fin(Number(opc.insetViga)) ? Number(opc.insetViga) : PADRAO.insetViga;
    var Ma = mat === "aco" ? MC() : BA();
    if (!Ma) return { ok: false, motivo: mat === "aco" ? "O motor da Metálica (js/metalcriar.js) não carregou." : "O motor da estrutura (js/bimarq.js) não carregou." };
    /* perfis / seções */
    var perfT, perfV, perfP, hT, hV, secT, secV, secP;
    if (mat === "aco") {
      perfT = opc.perfilTerca || P.perfilTerca; perfV = opc.perfilViga || P.perfilViga; perfP = opc.perfilPilar || P.perfilPilar;
      hT = alturaPerfilAco(perfT); hV = alturaPerfilAco(perfV);
      if (!(hT > 0)) return { ok: false, motivo: "Perfil da terça fora do catálogo: " + perfT };
      if (!(hV > 0)) return { ok: false, motivo: "Perfil da viga fora do catálogo: " + perfV };
      if (!(alturaPerfilAco(perfP) > 0)) return { ok: false, motivo: "Perfil do pilar fora do catálogo: " + perfP };
      premissas.push("perfis ADOTADOS (pré-dimensionado — confirmar no cálculo): terça " + perfT + ", viga principal " + perfV + ", pilar " + perfP);
    } else {
      secT = opc.secaoTerca && opc.secaoTerca.b ? opc.secaoTerca : secaoMadeira(opc.secaoTerca || P.secaoTerca);
      secV = opc.secaoViga && opc.secaoViga.b ? opc.secaoViga : secaoMadeira(opc.secaoViga || P.secaoViga);
      secP = opc.secaoPontalete && opc.secaoPontalete.b ? opc.secaoPontalete : secaoMadeira(opc.secaoPontalete || P.secaoPontalete);
      if (!secT || !secV || !secP) return { ok: false, motivo: "Seção de madeira fora do catálogo (" + FONTE_MADEIRA + ")." };
      hT = secT.h; hV = secV.h;
      premissas.push("seções ADOTADAS do catálogo " + FONTE_MADEIRA + ": terça " + secT.b * 100 + "×" + secT.h * 100 + " cm, viga " + secV.b * 100 + "×" + secV.h * 100 + " cm, pontalete " + secP.b * 100 + "×" + secP.h * 100 + " cm — pré-dimensionado, a confirmar no módulo Madeira");
    }
    var paredes = paredesDe(estado), nivelBase = num(t.elevNivel, 0);
    var seq = 0, idPref = "tec-" + t.id + "-", pecas = [], apoios = [], nPil = 0;
    function novoId() { return idPref + (++seq); }
    function marca(c, papel, extra) { c.cob = { telhado: String(t.id), papel: papel, material: mat }; if (extra) Object.keys(extra).forEach(function (k) { c.cob[k] = extra[k]; }); return c; }
    var comp = { terca: 0, viga: 0, pilar: 0 };

    function criarBarraAco(a, b, ferr, cat, just, giro, papel, extra) {
      var c = Ma.barra(a, b, { ferr: ferr, cat: cat, just: just, giro: giro || 0, nivel: t.nivelId != null ? { id: t.nivelId } : null });
      if (c.erro) { avisos.push("Peça " + papel + ": " + c.erro); return null; }
      c.id = novoId(); marca(c, papel, extra);
      return c;
    }
    function criarPilarAco(x, z, y0, y1, cat, extra) {
      var c = Ma.pilar([x, y0, z], { base: y0, topo: y1, cat: cat });
      if (c.erro) { avisos.push("Pilar: " + c.erro); return null; }
      c.id = novoId(); marca(c, "pilar", extra);
      return c;
    }
    var A9 = BA();
    function criarBarraMadeira(a, b, sec, papel, justCentro, extra) {
      var c = A9.vigaPerfil([a[0], a[2]], [b[0], b[2]], { perfil: { forma: "ret", b: sec.b, h: sec.h }, material: "madeira", topo: a[1], nivelId: t.nivelId != null ? t.nivelId : null });
      if (!c) { avisos.push("Peça " + papel + " fora do alcance do motor (comprimento ou seção)."); return null; }
      if (justCentro) { c.justZ = "centro"; }
      if (Math.abs(b[1] - a[1]) > 1e-6) { c.dFim = r6(b[1] - a[1]); c.justZ = "centro"; }
      A9.recalcPeca(c);
      c.id = novoId(); marca(c, papel, extra); c.nome = papel === "terca" ? "Terça de madeira" : "Viga de apoio de madeira";
      return c;
    }
    function criarPontalete(x, z, y0, y1, sec, extra) {
      var c = A9.pilarPerfil([x, z], { perfil: { forma: "ret", b: sec.b, h: sec.h }, material: "madeira", base: y0, altura: y1 - y0, nivelId: t.nivelId != null ? t.nivelId : null });
      if (!c) { avisos.push("Pontalete fora do alcance do motor."); return null; }
      c.id = novoId(); marca(c, "pontalete", extra); c.nome = "Pontalete de madeira";
      return c;
    }

    var nAguas = 0, naoRet = false;
    arr(t.aguasCalc).forEach(function (ag) {
      var plano = ag.plano || {}, s = Math.sqrt((plano.bx || 0) * (plano.bx || 0) + (plano.bz || 0) * (plano.bz || 0));
      if (!(s > 1e-6)) { avisos.push("Água plana: a estrutura automática pede inclinação (os planos horizontais não têm sentido de terça)."); return; }
      var d = [plano.bx / s, plano.bz / s], td = [-d[1], d[0]], f = Math.sqrt(1 + s * s);
      arr(ag.pecas).forEach(function (pc) {
        var Q = arr(pc.pts).map(pl); if (Q.length < 3) return;
        nAguas++;
        var umin = Infinity, umax = -Infinity, tmin = Infinity, tmax = -Infinity;
        Q.forEach(function (q) { var u = d[0] * q[0] + d[1] * q[1], tt = td[0] * q[0] + td[1] * q[1]; if (u < umin) umin = u; if (u > umax) umax = u; if (tt < tmin) tmin = tt; if (tt > tmax) tmax = tt; });
        if (Q.length !== 4) naoRet = true;
        var yPl = function (u) { return plano.a + s * u; };
        /* a face de baixo da viga: sob as terças */
        var yViga = function (u) { return yPl(u) - hT * (mat === "aco" ? f : 1); };
        var vV = hV * (mat === "aco" ? f : 1);   /* a profundidade VERTICAL da viga (a de aço fica perpendicular ao plano) */
        /* ---- fileiras das terças */
        var u0 = umin + bal / f, u1 = umax - balAlto / f;
        if (!(u1 - u0 > 0.2)) { avisos.push("Água curta demais para terças (" + virg((umax - umin) * f) + " m de rampa)."); return; }
        var nInt = Math.max(1, Math.ceil((u1 - u0) * f / vao - 1e-9)), us = [], i;
        for (i = 0; i <= nInt; i++) us.push(u0 + (u1 - u0) * i / nInt);
        var espTerca = (u1 - u0) * f / nInt;
        /* ---- linhas de apoio (t) */
        var tl0 = tmin + inset, tl1 = tmax - inset, linhas = [tl0, tl1];
        paredes.forEach(function (w) {
          if (Math.abs(w.ux * d[1] - w.uz * d[0]) > 0.05) return;   /* só paredes paralelas ao caimento */
          var tw = td[0] * w.cx + td[1] * w.cz, uw = d[0] * w.cx + d[1] * w.cz;
          if (tw <= tl0 + 0.4 || tw >= tl1 - 0.4) return;
          if (uw + w.L / 2 < u0 || uw - w.L / 2 > u1) return;
          linhas.push(tw);
        });
        linhas.sort(function (a, b) { return a - b; });
        /* a linha da ponta que cai perto de uma parede paralela ao caimento vai para o EIXO dela (a viga apoia na parede) */
        [0, linhas.length - 1].forEach(function (ix) {
          var melhor = null;
          paredes.forEach(function (w) {
            if (Math.abs(w.ux * d[1] - w.uz * d[0]) > 0.05) return;
            var tw = td[0] * w.cx + td[1] * w.cz, uw = d[0] * w.cx + d[1] * w.cz;
            if (uw + w.L / 2 < u0 || uw - w.L / 2 > u1) return;
            var dd = Math.abs(tw - linhas[ix]); if (dd <= 0.5 && (!melhor || dd < melhor.dd)) melhor = { tw: tw, dd: dd };
          });
          if (melhor) linhas[ix] = melhor.tw;
        });
        linhas.sort(function (a, b) { return a - b; });
        var lin = [linhas[0]], semParede = 0;
        for (i = 1; i < linhas.length; i++) { if (linhas[i] - lin[lin.length - 1] > 0.3) lin.push(linhas[i]); else lin[lin.length - 1] = (lin[lin.length - 1] + linhas[i]) / 2; }
        var com = [lin[0]];
        for (i = 1; i < lin.length; i++) {
          var gap = lin[i] - lin[i - 1], nn = Math.max(1, Math.ceil(gap / vaoTerca - 1e-9));
          for (var j = 1; j < nn; j++) { com.push(lin[i - 1] + gap * j / nn); semParede++; }
          com.push(lin[i]);
        }
        if (semParede) avisos.push(semParede + " linha(s) de apoio a mais (vão entre paredes maior que " + virg(vaoTerca) + " m): vigas principais apoiadas só nas pontas — confirmar no cálculo.");
        /* ---- vigas principais */
        var vigas = [];
        com.forEach(function (tj, jj) {
          var ch = cordasT(Q, Math.max(tmin + 1e-3, Math.min(tmax - 1e-3, tj)), d, td); if (!ch.length) return;
          var ua = Math.max(u0 - ext, ch[0][0]), ub = Math.min(u1 + ext, ch[ch.length - 1][1]);
          /* a ponta da viga ALCANÇA a parede que estiver logo além dela (o contorno do telhado é a face de dentro da parede):
             termina no eixo da parede, para apoiar nela */
          function alcancar(uEnd, sinal) {
            var p0 = deUT(uEnd, tj, d, td), p1 = deUT(uEnd + sinal * PADRAO.alcanceApoio, tj, d, td), melhor = null;
            paredes.forEach(function (w) {
              var tr = trechoNaParede(p0, p1, w, PADRAO.tolApoio); if (!tr) return;
              if (!melhor || tr[0] < melhor[0]) melhor = tr;
            });
            return melhor ? uEnd + sinal * (melhor[0] + melhor[1]) / 2 : uEnd;
          }
          ua = alcancar(ua, -1); ub = alcancar(ub, 1);
          if (!(ub - ua > 0.3)) return;
          var pA = deUT(ua, tj, d, td), pB = deUT(ub, tj, d, td), yA = yViga(ua), yB = yViga(ub), c;
          if (mat === "aco") c = criarBarraAco([pA[0], yA, pA[1]], [pB[0], yB, pB[1]], "viga", perfV, "topo", 0, "viga-principal", { linha: jj });
          else {
            /* madeira: linha pelo centro da seção (a viga inclinada acompanha o telhado) */
            var yAc = yA - hV / 2, yBc = yB - hV / 2;
            c = criarBarraMadeira([pA[0], yAc, pA[1]], [pB[0], yBc, pB[1]], secV, "viga-principal", true, { linha: jj });
          }
          if (!c) return;
          comp.viga += dist2(pA, pB) * f;
          var V = { c: c, pA: pA, pB: pB, yA: yA, yB: yB, ua: ua, ub: ub, tj: tj, ap: [] };
          vigas.push(V); pecas.push(c);
        });
        /* ---- apoios das vigas: paredes, pilares/pontaletes */
        vigas.forEach(function (V) {
          var Ls = dist2(V.pA, V.pB), cv = Ls > 0 ? 1 / Ls : 0;
          function yBot(sm) { var tt = sm * cv; return (V.yA + (V.yB - V.yA) * tt) - vV; }
          var cruz = [];
          paredes.forEach(function (w) {
            var tr = trechoNaParede(V.pA, V.pB, w, PADRAO.tolApoio); if (!tr) return;
            cruz.push({ w: w, s0: Math.max(0, tr[0]), s1: Math.min(Ls, tr[1]) });
          });
          /* a parede alcança a viga NESTE ponto se o topo dela chega à face de baixo (com o calço máximo) */
          function eficazEm(cx, s) { return cx.w.topo >= yBot(s) - PADRAO.calcoMax; }
          function eficaz(cx) { return eficazEm(cx, cx.s0) && eficazEm(cx, cx.s1); }
          /* pontas: sem parede eficaz perto, entra pilar (metálico) / pontalete (madeira) */
          [0, 1].forEach(function (fim) {
            var sEnd = fim === 0 ? 0 : Ls;
            function dentroDaPonta(cx) { return fim === 0 ? cx.s0 <= PADRAO.distPonta : cx.s1 >= Ls - PADRAO.distPonta; }
            function sNaPonta(cx) { return Math.max(cx.s0, Math.min(cx.s1, sEnd)); }
            var efP = cruz.filter(function (cx) { return dentroDaPonta(cx) && eficazEm(cx, sNaPonta(cx)); }), perto = efP.length > 0;
            var rotulo = fim === 0 ? "ini" : "fim";
            if (perto) {
              var wEf = efP[0];
              var emb = wEf.w.topo - yBot(sNaPonta(wEf));
              V.ap.push({ fim: rotulo, tipo: "parede", parede: wEf.w.id, topo: r4(wEf.w.topo), embutidaM: r4(Math.max(0, emb)) });
              apoios.push({ viga: V.c.id, fim: rotulo, tipo: "parede", parede: wEf.w.id, topoParede: r4(wEf.w.topo), embutidaM: r4(Math.max(0, emb)), obs: emb > 0.02 ? "viga embutida " + virg(emb * 100, 0) + " cm na parede (chumbar/bolsa)" : (emb < -0.005 ? "calço de " + virg(-emb * 100, 0) + " cm entre o topo da parede e a viga" : "apoio sobre o topo da parede") });
              return;
            }
            var p = fim === 0 ? V.pA : V.pB, yb = fim === 0 ? V.yA : V.yB;
            var baixo = cruz.filter(function (cx) { return fim === 0 ? cx.s0 <= PADRAO.distPonta : cx.s1 >= Ls - PADRAO.distPonta; })[0];
            var yBase = baixo ? baixo.w.topo : nivelBase, yFundo = yb - vV;
            if (!(yFundo - yBase > 0.05)) { apoios.push({ viga: V.c.id, fim: rotulo, tipo: "sem-apoio", obs: "ponta da viga sem parede e sem altura para pilar (" + virg(yFundo - yBase, 2) + " m)" }); return; }
            var pc;
            if (mat === "aco") pc = criarPilarAco(p[0], p[1], yBase, yb, perfP, { viga: V.c.id });
            else pc = criarPontalete(p[0], p[1], yBase, yFundo, secP, { viga: V.c.id });
            if (pc) {
              pecas.push(pc); comp.pilar += yb - yBase; nPil++;
              V.ap.push({ fim: rotulo, tipo: mat === "aco" ? "pilar" : "pontalete", pilar: pc.id, base: r4(yBase) });
              apoios.push({ viga: V.c.id, fim: rotulo, tipo: mat === "aco" ? "pilar" : "pontalete", pilar: pc.id, base: r4(yBase), baseEm: baixo ? "topo da parede " + baixo.w.id : "nível", obs: baixo ? (mat === "aco" ? "pilar" : "pontalete") + " sobre a parede (a parede fica abaixo da viga)" : "sem parede sob a ponta: até o nível" });
            }
          });
          /* parede ao longo da viga que fica ABAIXO dela (a viga sobe com o telhado): pontaletes/pilares de espaço em espaço */
          cruz.forEach(function (cx) {
            if (eficaz(cx)) return;
            var esp = mat === "aco" ? 3.0 : (fin(Number(opc.espPontalete)) ? Number(opc.espPontalete) : P.espPontalete);
            var a0 = cx.s0, a1 = cx.s1, nP = Math.max(1, Math.ceil((a1 - a0) / esp - 1e-9)), kk;
            for (kk = 0; kk <= nP; kk++) {
              var sP = a0 + (a1 - a0) * kk / nP;
              if (sP < PADRAO.distPonta && V.ap.some(function (q) { return q.fim === "ini" && q.tipo !== "parede"; })) continue;
              if (sP > Ls - PADRAO.distPonta && V.ap.some(function (q) { return q.fim === "fim" && q.tipo !== "parede"; })) continue;
              var tt = sP * cv, xP = V.pA[0] + (V.pB[0] - V.pA[0]) * tt, zP = V.pA[1] + (V.pB[1] - V.pA[1]) * tt, ybT = V.yA + (V.yB - V.yA) * tt, yFd = ybT - vV;
              if (!(yFd - cx.w.topo > 0.05)) continue;
              var pc2 = mat === "aco" ? criarPilarAco(xP, zP, cx.w.topo, ybT, perfP, { viga: V.c.id, intermediario: true }) : criarPontalete(xP, zP, cx.w.topo, yFd, secP, { viga: V.c.id, intermediario: true });
              if (pc2) { pecas.push(pc2); comp.pilar += ybT - cx.w.topo; nPil++; apoios.push({ viga: V.c.id, fim: "meio", tipo: mat === "aco" ? "pilar" : "pontalete", pilar: pc2.id, base: r4(cx.w.topo), baseEm: "topo da parede " + cx.w.id, obs: "a parede fica abaixo da viga: " + (mat === "aco" ? "pilar" : "pontalete") + " intermediário" }); }
            }
          });
          V.c.cob.apoios = V.ap.map(function (q) { return { fim: q.fim, tipo: q.tipo }; });
        });
        /* ---- terças */
        us.forEach(function (u, iu) {
          cordasU(Q, u, d, td).forEach(function (ct) {
            /* a terça chega até as linhas de apoio das pontas (que podem estar além da borda do telhado, no eixo da parede) */
            var pA = deUT(u, Math.min(ct[0], com[0]), d, td), pB = deUT(u, Math.max(ct[1], com[com.length - 1]), d, td), yb = yViga(u), c;
            if (dist2(pA, pB) < 0.3) return;
            if (mat === "aco") {
              var Y = [-s * d[0] / f, 1 / f, -s * d[1] / f], giro = Ma.giroDe ? Ma.giroDe([pA[0], yb, pA[1]], [pB[0], yb, pB[1]], Y) : 0;
              c = criarBarraAco([pA[0], yb, pA[1]], [pB[0], yb, pB[1]], "terca", perfT, "base", giro, "terca", { fileira: iu });
            } else c = criarBarraMadeira([pA[0], yb, pA[1]], [pB[0], yb, pB[1]], secT, "terca", false, { fileira: iu });
            if (c) { pecas.push(c); comp.terca += dist2(pA, pB); }
          });
        });
        premissas.push("água " + (ag.aresta >= 0 ? (arr(t.arestasCalc)[ag.aresta] ? arr(t.arestasCalc)[ag.aresta].orig + 1 : "") : "") + ": " + (nInt + 1) + " fileira(s) de terça a " + virg(espTerca) + " m (máx. " + virg(vao) + " m), " + com.length + " linha(s) de apoio");
      });
    });
    if (!pecas.length) return { ok: false, motivo: "Nenhuma peça gerada" + (avisos.length ? ": " + avisos[0] : "."), avisos: avisos };
    if (naoRet) avisos.push("Água que não é retângulo: as terças ficam entre as bordas dela, mas confira os apoios nas pontas (a estrutura automática é pensada para água retangular).");
    if (nAguas > 1) avisos.push("Telhado de " + nAguas + " águas: cada água leva a sua estrutura; cumeeira, espigões e rincões pedem tesouras/peças próprias — conferir.");
    avisos.push("Estrutura PRÉ-DIMENSIONADA — confirmar no cálculo (" + (mat === "aco" ? "Metálica › cálculo da estrutura desenhada" : "módulo Madeira") + ").");
    /* idempotente: o lote APAGA a estrutura anterior deste telhado e cria a nova (um Ctrl+Z desfaz os dois) */
    var apagar = estruturaDoTelhado(estado, t.id).map(function (c) { return { op: "apagar", id: c.id }; });
    var lote = { op: "lote", id: "tec-" + t.id, origem: "estrutura-telhado", ops: apagar.concat(pecas.map(function (c) { return { op: "criar", id: c.id, caixa: mat === "aco" ? c : A9.paraOp(c) }; })) };
    var res = { ok: true, material: mat, telhado: t.id, lote: lote, ops: [lote], pecas: pecas, apoios: apoios, premissas: premissas, avisos: avisos };
    res.resumo = resumoDePecas(pecas, mat);
    res.resumo.vaoTelha = vao; res.resumo.fileirasPorAgua = null; res.resumo.nPilares = nPil;
    return res;
  }

  function resumoDePecas(pecas, mat) {
    var r = { n: pecas.length, terca: { n: 0, m: 0, kg: 0, m3: 0 }, viga: { n: 0, m: 0, kg: 0, m3: 0 }, pilar: { n: 0, m: 0, kg: 0, m3: 0 }, kgTotal: 0, m3Total: 0 };
    pecas.forEach(function (c) {
      var pp = c.cob && c.cob.papel, papel = pp === "terca" ? "terca" : (pp === "viga-principal" || /^forro-/.test(txt(pp)) ? "viga" : "pilar"), g = r[papel];
      var L = mat === "aco" ? num(c.metal && c.metal.L, 0) : num(c.comprimento, 0);
      if (papel === "pilar" && mat !== "aco") L = num(c.altura, 0);
      g.n++; g.m += L;
      if (mat === "aco") { var kgm = massaPerfilAco(c.metal && c.metal.perfil && c.metal.perfil.cat); if (kgm != null) { g.kg += kgm * L; r.kgTotal += kgm * L; } }
      else { g.m3 += num(c.volume, 0); r.m3Total += num(c.volume, 0); }
    });
    ["terca", "viga", "pilar"].forEach(function (k) { r[k].m = r4(r[k].m); r[k].kg = r4(r[k].kg); r[k].m3 = r6(r[k].m3); });
    r.kgTotal = r4(r.kgTotal); r.m3Total = r6(r.m3Total);
    return r;
  }

  /* o lote e a troca idempotente */
  function opLote(res) { return res && res.ok ? res.lote : null; }
  function opsSubstituir(ops, res) {
    var lote = opLote(res); if (!lote) return arr(ops).slice();
    var out = [], pos = -1;
    arr(ops).forEach(function (o) { if (o && o.op === "lote" && o.id === lote.id) { if (pos < 0) pos = out.length; return; } out.push(o); });
    if (pos < 0) pos = out.length;
    out.splice(pos, 0, lote);
    return out;
  }
  function estruturaDoTelhado(estado, id) {
    return arr(estado && estado.caixas).filter(function (c) { return c && c.cob && String(c.cob.telhado) === String(id); });
  }

  /* ============================================================ QUANTITATIVO */
  function quantitativo(estado, opc) {
    var itens = [], avisos = [], C = BC();
    var porTel = {};
    arr(estado && estado.caixas).forEach(function (c) { if (c && c.cob && c.cob.telhado != null) (porTel[c.cob.telhado] = porTel[c.cob.telhado] || []).push(c); });
    Object.keys(porTel).forEach(function (id) {
      var ps = porTel[id], mat = ps[0].cob.material, t = null;
      arr(estado.telhados).forEach(function (x) { if (String(x.id) === String(id)) t = x; });
      var r = resumoDePecas(ps, mat), sin = function (k) { return C ? C.sin(k) : null; };
      function it(nome, un, q, s, obs) { itens.push({ grupo: "Estrutura do telhado", item: nome, un: un, qtd: r4(q), sinapi: s || null, orcarAParte: !s, obs: obs || null, telhado: id }); }
      if (mat === "aco") {
        it("Terças de aço (" + r.terca.n + " peças, " + virg(r.terca.m) + " m)", "kg", r.terca.kg, sin("tramaAcoTercas"), "composição SINAPI por kg de terça; pré-dimensionado — confirmar no cálculo");
        it("Vigas principais de aço (" + r.viga.n + " peças, " + virg(r.viga.m) + " m)", "kg", r.viga.kg, null, "estrutura metálica principal: sem composição na base do sistema");
        if (r.pilar.n) it("Pilares de aço (" + r.pilar.n + " peças, " + virg(r.pilar.m) + " m)", "kg", r.pilar.kg, null, "idem");
      } else {
        var area = t ? num(t.area, 0) : 0;
        it("Trama de madeira de terças (" + r.terca.n + " peças, " + virg(r.terca.m) + " m, " + virg(r.terca.m3, 3) + " m³)", "m²", area, sin("tramaMadeiraTercas"), "composição SINAPI por m² de telhado (confirmar se cobre as vigas de apoio); pré-dimensionado");
        it("Vigas de apoio de madeira (" + r.viga.n + " peças, " + virg(r.viga.m) + " m)", "m³", r.viga.m3, null, "volume pela seção do catálogo (medidas brutas); orçar à parte");
        if (r.pilar.n) it("Pontaletes de madeira (" + r.pilar.n + " peças, " + virg(r.pilar.m) + " m)", "m²", area, sin("pontaletesMadeira"), "composição SINAPI por m² de telhado até 2 águas (edifício residencial térreo/sobrado); " + virg(r.pilar.m3, 3) + " m³ de pontaletes");
      }
    });
    /* T1: o telhado com MODELO (estrutura derivada, telhas e fixação) */
    var qm = quantitativoModelos(estado); qm.itens.forEach(function (x) { itens.push(x); }); qm.avisos.forEach(function (x) { avisos.push(x); });
    return { itens: itens, avisos: avisos };
  }

  /* ============================================================ CÁLCULO (estrutura de aço desenhada) */
  /* a entrada do js/acodimlivre.js: as peças de aço do telhado, os apoios nas paredes (viga apoiada: rótula + rolete) e as
     cargas (o peso da telha quando o catálogo traz, a sobrecarga de cobertura da NBR 6120 pelo módulo) */
  function entradaCalculo(estado, telhadoId, opc) {
    opc = opc || {}; var T = BT(), t = null, avisos = [];
    arr(estado && estado.telhados).forEach(function (x) { if (String(x.id) === String(telhadoId)) t = x; });
    var caixas = estruturaDoTelhado(estado, telhadoId).filter(function (c) { return c.tipo === "metal"; });
    if (!t || !caixas.length) return { ok: false, motivo: "Sem peças de aço desta estrutura no estado." };
    var tel = T ? T.telha(t.tipoId) : null, extras = {};
    caixas.forEach(function (c) {
      if (!c.cob || c.cob.papel !== "viga-principal") return;
      var ap = arr(c.cob.apoios), ini = ap.filter(function (q) { return q.fim === "ini"; })[0], fim = ap.filter(function (q) { return q.fim === "fim"; })[0];
      if (ini && ini.tipo === "parede") extras[c.id + ":ini"] = "fixo";
      if (fim && fim.tipo === "parede") extras[c.id + ":fim"] = "movel";
    });
    var g = tel && fin(tel.pesoKgM2) ? tel.pesoKgM2 * 9.80665 / 1000 : null;
    if (g == null) avisos.push("Peso da telha NÃO verificado (" + (tel ? tel.pesoFonte : "tipo sem dados") + "): a carga permanente da telha NÃO entrou no cálculo — informe `pesoTelhaKgM2`.");
    if (fin(Number(opc.pesoTelhaKgM2))) g = Number(opc.pesoTelhaKgM2) * 9.80665 / 1000;
    var areas = [];
    arr(t.aguasCalc).forEach(function (ag, i) {
      arr(ag.pecas).forEach(function (pc, j) {
        var area = { id: "agua" + i + "_" + j, nome: "Cobertura — água " + (i + 1), poligono: arr(pc.pts).map(function (q) { return [q.x, q.z]; }), uso: "cobertura", cobertura: true, inclinacaoPct: num(ag.inclinacao, 3) };
        if (g != null) { area.g = g; area.gCategoria = "G-industrializado"; area.gTexto = "telha " + (tel ? tel.produto : "informada"); }
        areas.push(area);
      });
    });
    return { ok: true, avisos: avisos, entrada: { caixas: caixas, apoios: { basePadrao: "rotulada", extras: extras }, cargas: { areas: areas } } };
  }
  function verificarAco(estado, telhadoId, opc) {
    var DL = dep("AcoDimLivre", "./acodimlivre.js");
    if (!DL) return { ok: false, motivo: "O cálculo da estrutura de aço desenhada (js/acodimlivre.js) não carregou." };
    var e = entradaCalculo(estado, telhadoId, opc); if (!e.ok) return e;
    var r;
    try { r = DL.calcular(e.entrada); } catch (x) { return { ok: false, motivo: "O cálculo falhou: " + x.message, avisos: e.avisos }; }
    return { ok: !!(r && r.ok), motivo: r && r.motivo, resultado: r, avisos: e.avisos, entrada: e.entrada };
  }

  /* ======================================================================
   * TELHADO PARAMÉTRICO (frente T1, 20/10/2026) — o telhado com MODELO
   *
   * O pedido do dono: "clica num ponto, puxa o retângulo e gera o telhado pela inclinação mínima do
   * fabricante, já com todo o madeiramento e todas as telhas modeladas; a parede de baixo morre na
   * inclinação; madeira e metálica; até o prego (no quantitativo)".
   *
   * Diferente do gerar() acima (que cria CAIXAS num lote), aqui a estrutura é DERIVADA do telhado: a op
   * `telhado` leva `modelo` (um id de MODELOS) e o BimTelhado.fim chama modelar() a cada replay. Muda a
   * inclinação, o beiral ou a telha → muda tudo; um Ctrl+Z desfaz o telhado inteiro; op sem `modelo` = o
   * telhado de antes. O 3D pede geometria(t) (malha MESCLADA: uma por material da estrutura e uma por
   * água para as telhas, com teto de triângulos — nada de uma malha por telha, nada de raster).
   *
   * A PILHA (de baixo para cima, em cima do PLANO do telhado — a face de baixo do js/bimtelhado.js, que
   * passa pela linha da parede na cota de apoio e é onde a parede "anexar topo" morre):
   *   tesoura (pernas) → terças → caibros → ripas → telha   (madeira, "Tesoura + terça + caibro + ripa")
   *   terças → caibros → ripas → telha                    (madeira, terças nas paredes/oitões/pontaletes)
   *   terças → telha                                      (fibrocimento/termoacústica direto na terça)
   *   tesoura metálica (banzo) → terças Ue → telha        (metálica trapezoidal ou sanduíche)
   *   A linha (tirante), o pendural, as escoras e os montantes da tesoura ficam ABAIXO do plano (dentro do
   *   triângulo da tesoura); por isso no modelo de tesoura só as paredes dos OITÕES anexam o topo — as de
   *   dentro param na cota de apoio, como na obra.
   *
   * FONTES: seções, espaçamentos, tesouras e pregos do CAIXA SINAPI, Caderno Técnico Estrutura e Trama
   * para Cobertura (10/2025) — data/telhado-madeiramento.json; telha (galga, vão, inclinação, fixação)
   * em BimTelhado.TELHAS (data/telhado-catalogo.json). O que não tem fonte sai como "valor de partida —
   * conferir" em `premissas` e no quantitativo. PRÉ-DIMENSIONADO: nada aqui é cálculo da NBR 7190/8800.
   * ====================================================================== */
  var F_TRAMA = "CAIXA — SINAPI, Caderno Técnico Estrutura e Trama para Cobertura (aferido 10/2025)";
  var SEC = {
    ripa: { b: 0.05, h: 0.015, rot: "Ripa 1,5×5 cm", fonte: F_TRAMA + ", p. 36" },
    caibro: { b: 0.05, h: 0.06, rot: "Caibro 5×6 cm", fonte: F_TRAMA + ", p. 35–36" },
    terca: { b: 0.06, h: 0.12, rot: "Terça 6×12 cm", fonte: F_TRAMA + ", p. 35–40" },
    linha: { b: 0.06, h: 0.12, rot: "Linha (tirante) 6×12 cm", fonte: F_TRAMA + ", Anexos 01–10" },
    perna: { b: 0.06, h: 0.12, rot: "Perna 6×12 cm", fonte: F_TRAMA + ", Anexos 01–05 (vãos de 3 a 7 m)" },
    perna16: { b: 0.06, h: 0.16, rot: "Perna 6×16 cm", fonte: F_TRAMA + ", Anexos 06–10 (vãos de 8 a 12 m)" },
    escora: { b: 0.06, h: 0.08, rot: "Escora 6×8 cm", fonte: F_TRAMA + ", Anexos 02–10" },
    pendural: { b: 0.06, h: 0.12, rot: "Pendural 6×12 cm", fonte: F_TRAMA + " (sem rótulo no desenho; o SINAPI conta na viga 6×12)", partida: true },
    montante: { b: 0.025, h: 0.05, pecas: 2, rot: "Montante 2 × sarrafo 2,5×5 cm", fonte: F_TRAMA + ", Anexos 05–10 (vãos de 7 a 12 m; 2 peças 2,5×5 por montante — data/telhado-madeiramento.json)" },
    pontalete: { b: 0.08, h: 0.08, rot: "Pontalete 8×8 cm", fonte: FONTE_MADEIRA, partida: true },
    espigao: { b: 0.06, h: 0.16, rot: "Espigão/rincão 6×16 cm", fonte: null, partida: true },
    testeira: { b: 0.025, h: 0.20, rot: "Testeira tábua 2,5×20 cm", fonte: null, partida: true }
  };
  /* espaçamentos (eixo a eixo) — SINAPI p. 35: ripas pela GALGA da telha; caibros 0,55; terças 1,5 a 2,0;
     tesouras/pontaletes 2,4 a 3,2 m (o gerador usa o MÁXIMO da faixa e divide o vão em partes iguais) */
  var ESPAC = {
    caibro: { m: 0.55, fonte: F_TRAMA + ", p. 35 (eixo dos caibros 0,55 m)" },
    terca: { m: 2.0, fonte: F_TRAMA + ", p. 35 (eixo das terças 1,5 a 2,0 m; o gerador usa até 2,0)" },
    apoio: { m: 3.2, fonte: F_TRAMA + ", p. 35 (eixo das tesouras/pontaletes 2,4 a 3,2 m; o gerador usa até 3,2)" },
    apoioAco: { m: 6.0, fonte: null, partida: true }
  };
  /* tesouras Howe de referência do SINAPI (Anexos 01–10): [vão m, composição, prego 18×30 kg, parafusos M12×150 un, viga 6×12 m, viga 6×16 m, caibro 6×8 m, sarrafo 2,5×5 m];
     tábua 2,5×20 = 3,0 m e 1 estribo por tesoura em todas. "cer" = cerâmica/concreto (30%), "ond" = ondulada (10%) */
  var TESOURAS_SINAPI = {
    fonte: F_TRAMA + ", p. 45–94 e Anexos 01–10 (tabela de peças por tesoura); data/telhado-madeiramento.json",
    cer: [[3, "92545", 0.825, 0, 7, 0, 0, 0], [4, "92546", 1.1, 0, 9.5, 0, 2.5, 0], [5, "92547", 1.375, 0, 11.5, 0, 3, 0], [6, "92548", 1.65, 0, 14, 0, 3.5, 0], [7, "92549", 1.925, 0, 16, 0, 6, 3.5],
          [8, "92550", 2.4, 4, 10, 9, 6, 4], [9, "92551", 2.7, 4, 11, 10, 7, 4.5], [10, "92552", 3.0, 4, 12.5, 11, 8, 5], [11, "92553", 3.575, 4, 13.5, 12, 10, 10], [12, "92554", 3.9, 4, 14.5, 13, 11.5, 11]],
    ond: [[3, "92555", 0.675, 0, 7, 0, 0, 0], [4, "92556", 0.9, 0, 9, 0, 2, 0], [5, "92557", 1.125, 0, 11, 0, 2.5, 0], [6, "92558", 1.35, 0, 13.5, 0, 3.5, 0], [7, "92559", 1.575, 0, 16, 0, 5, 2.5],
          [8, "92560", 2.0, 4, 9, 9, 6, 2.5], [9, "92561", 2.25, 4, 10.5, 10, 6.5, 2.5], [10, "92562", 2.5, 4, 11.5, 11, 7, 3], [11, "92563", 3.575, 4, 12.5, 12, 9, 6], [12, "92564", 3.9, 4, 13.5, 13, 10, 6]]
  };
  /* pregos da trama (SINAPI p. 35–36), kg por m² de telhado em projeção; a QUANTIDADE por ligação não tem fonte */
  var PREGOS = {
    ripaCaibro: { prego: "prego 15×15 (1 1/4 × 13) com cabeça", kgM2: 0.07 },
    caibroTerca: { prego: "prego 19×36 (3 1/4 × 9) com cabeça, a ~45°", kgM2: 0.05 },
    tercaApoio: { prego: "prego 22×48 (4 1/4 × 5) com cabeça, a ~45°", kgM2: 0.03 },
    fonte: F_TRAMA + ", p. 35–36 (consumo em kg/m²)"
  };
  /* ======================================================================
   * PREGOS POR LIGAÇÃO (frente "pregos", 20/10/2026) — fonte: data/telhado-madeiramento.json (ramo claude/telhado-fontes
   * 2d1be5e6), blocos pregos_usuais e pregos_por_ligacao; docs/telhado/PADROES-TELHADO.md seção 7.
   *   · Dimensões e pregos/kg: catálogo Belgo Arames / ArcelorMittal-Bekaert "Pregos polidos e galvanizados" (PE-148), p. 2–3.
   *   · Regras: ABNT NBR 7190-1:2022 (cópia de consulta NÃO licenciada à RA — exemplar próprio pendente):
   *       7.1.1 (p. impressa 48): não há ligação com um pino só → MÍNIMO 2 pregos por ligação dimensionada;
   *       7.1.9 / Tabela 13 (p. 51): prego estrutural com d ≥ 3,0 mm;
   *       7.2 (p. 56): d ≤ 1/5 da menor espessura ligada; penetração em qualquer peça ≥ a espessura da mais delgada; a ponta
   *       na peça mais distante da cabeça com ≥ 12 d (ou igual à espessura dessa peça).
   *   A norma NÃO fixa a quantidade por ligação: ela sai do cálculo (Rk = nsp·nef·Fv,Rk, 7.1.2) com os esforços — que este
   *   gerador não tem. Quantidade = o MÍNIMO da norma (2), com o aviso "dimensionar no módulo Madeira".
   * ====================================================================== */
  var F_BELGO = "Belgo Arames / ArcelorMittal-Bekaert — catálogo Pregos polidos e galvanizados (PE-148), p. 2–3";
  var F_7190 = "ABNT NBR 7190-1:2022 (cópia de consulta não licenciada; exemplar próprio pendente)";
  /* o 17×21 (2 × 11) fica de fora: o catálogo traz 17×27 com 360/kg, incoerente com ele (provável erro de impressão — o JSON diz "não usar") */
  var PREGOS_CAT = [
    { des: "14×18 (1 1/2 × 14)", L: 38, d: 2.1, porKg: 850 },
    { des: "15×15 (1 1/4 × 13)", L: 32, d: 2.45, porKg: 745 },
    { des: "18×27 (2 1/2 × 10)", L: 63, d: 3.45, porKg: 200 },
    { des: "18×30 (2 3/4 × 10)", L: 70, d: 3.45, porKg: 180 },
    { des: "19×36 (3 1/4 × 9)", L: 82, d: 3.9, porKg: 120 },
    { des: "19×39 (3 1/2 × 9)", L: 89, d: 3.9, porKg: 110 },
    { des: "22×42 (3 3/4 × 5)", L: 95, d: 5.6, porKg: 50 },
    { des: "22×48 (4 1/4 × 5)", L: 108, d: 5.6, porKg: 45 }
  ];
  var NBR_PREGO = {
    minPinos: 2, minFonte: F_7190 + ", 7.1.1 (p. impressa 48)",
    dMin: 3.0, dMinFonte: F_7190 + ", 7.1.9 e Tabela 13 (p. 51)",
    fracaoD: 5, fracaoFonte: F_7190 + ", 7.2 (p. 56): d ≤ 1/5 da menor espessura ligada",
    penD: 12, penFonte: F_7190 + ", 7.2 (p. 56): ponta na peça mais distante ≥ 12 d; penetração ≥ a espessura da peça mais delgada"
  };
  function pregoCat(des) { for (var i = 0; i < PREGOS_CAT.length; i++) if (PREGOS_CAT[i].des.indexOf(des) === 0) return PREGOS_CAT[i]; return null; }
  /* a ligação de 2 peças pregadas (a de espessura t1, do lado da cabeça, na de espessura t2), em mm, com n pregos:
     { ok, falhas:[texto], penetracao } — as regras da NBR 7190-1:2022 acima */
  function verificarPrego(pr, t1, t2, n, opc) {
    opc = opc || {};
    var f = [], tmin = Math.min(t1, t2), pen = pr.L - t1;
    if (!(n >= NBR_PREGO.minPinos)) f.push("ligação com " + n + " prego(s): a norma não admite ligação com um pino só (mínimo " + NBR_PREGO.minPinos + ", " + NBR_PREGO.minFonte + ")");
    if (pr.d > tmin / NBR_PREGO.fracaoD + 1e-9) f.push("d = " + virg(pr.d, 2) + " mm > t/5 = " + virg(tmin / NBR_PREGO.fracaoD, 2) + " mm da peça mais fina (" + NBR_PREGO.fracaoFonte + ")");
    if (!opc.naoEstrutural && pr.d < NBR_PREGO.dMin - 1e-9) f.push("d = " + virg(pr.d, 2) + " mm < 3,0 mm: não é prego estrutural (" + NBR_PREGO.dMinFonte + ")");
    if (pen < NBR_PREGO.penD * pr.d - 1e-9) f.push("penetração " + virg(pen, 0) + " mm < 12 d = " + virg(NBR_PREGO.penD * pr.d, 0) + " mm (" + NBR_PREGO.penFonte + ")");
    else if (pen < tmin - 1e-9) f.push("penetração " + virg(pen, 0) + " mm < a espessura da peça mais delgada (" + virg(tmin, 0) + " mm, 7.2)");
    if (pen > t2 + 1e-9) f.push("o prego atravessa a peça de baixo (L = " + pr.L + " mm > " + virg(t1 + t2, 0) + " mm)");
    return { ok: !f.length, falhas: f, penetracao: pen };
  }
  /* a bitola do catálogo que cumpre a norma para t1 → t2 (a de menor diâmetro e, nela, a mais curta); null se nenhuma cumpre */
  function escolherPrego(t1, t2, opc) {
    var ok = PREGOS_CAT.filter(function (pr) { return verificarPrego(pr, t1, t2, NBR_PREGO.minPinos, opc).ok; });
    ok.sort(function (a, b) { return a.d - b.d || a.L - b.L; });
    return ok[0] || null;
  }
  /* os NÓS de cada tesoura (meia, de canto ou inteira): pontos onde as peças dela se encontram (ponta de uma peça sobre outra
     peça da mesma tesoura, até 3 cm). Ligações no nó = as peças que chegam a ele (cada uma pregada no cobre-junta) */
  function nosDasTesouras(pecas, filtro) {
    var porT = {}, out = { nos: 0, ligacoes: 0 };
    pecas.forEach(function (o) { if (o.tesoura && filtro(o.tesoura) && /^(linha|perna|pendural|escora|montante)$/.test(o.p)) (porT[o.tesoura] = porT[o.tesoura] || []).push(o); });
    Object.keys(porT).forEach(function (id) {
      var ps = porT[id], vistos = [], pares = {};
      /* (revisor pregos, 20/10/2026) a ponta q encosta na PEÇA (o sólido, não o eixo): o eixo a→b é a face de baixo da seção
         (0 a h no sentido de `up`, ±w/2 de lado). Pelo eixo, o pé do pendural (no topo da linha, 12 cm acima do eixo dela) não
         achava a linha, e cada tesoura de 8 m saía com 14 ligações em vez de 23. */
      function noSeg(q, o) {
        var ab = s3(o.b, o.a), L = ln3(ab); if (!(L > 1e-9)) return ln3(s3(q, o.a)) < 0.03;
        var e = [ab[0] / L, ab[1] / L, ab[2] / L], up = arr(o.up).length === 3 ? o.up : [0, 1, 0], u = nz3(ad3(up, e, -dt3(up, e))), v = cr3(e, u), d = s3(q, o.a);
        function fora(x, a, b) { return x < a ? a - x : (x > b ? x - b : 0); }
        var ft = fora(dt3(d, e), 0, L), fs = fora(dt3(d, u), 0, num(o.h, 0)), fl = fora(dt3(d, v), -num(o.w, 0) / 2, num(o.w, 0) / 2);
        return Math.sqrt(ft * ft + fs * fs + fl * fl) < 0.03;
      }
      /* os sarrafos do montante (T3: 2 por montante, um de cada lado, pregados direto na linha e na perna, sem cobre-junta):
         2 nós por montante (pé e topo) e, em cada um, 1 ligação por sarrafo — contados à parte do nó com cobre-junta */
      ps.forEach(function (o) { if (o.p === "montante" && o.montante) (pares[o.montante] = pares[o.montante] || []).push(o); });
      Object.keys(pares).forEach(function (k) { out.nos += 2; out.ligacoes += 2 * pares[k].length; });
      var gerais = ps.filter(function (o) { return !(o.p === "montante" && o.montante); });
      gerais.forEach(function (o) { [o.a, o.b].forEach(function (q) {
        if (vistos.some(function (v) { return ln3(s3(v, q)) < 0.05; })) return;
        var nP = gerais.filter(function (x) { return noSeg(q, x); }).length;
        if (nP >= 2) { vistos.push(q); out.nos++; out.ligacoes += nP; }
      }); });
    });
    return out;
  }

  var PERFIS_TEL = { terca: "Ue 150 x 60 x 20 x 3,00", banzo: "Ue 150 x 60 x 20 x 3,00", diagonal: "Ue 100 x 50 x 17 x 2,28" };
  var MODELOS = {
    "mad-tesoura": { rotulo: "Madeira — tesoura + terça + caibro + ripa", mat: "madeira", tesoura: true, caibro: true, ripa: true, familias: ["ceramica", "concreto"],
                     dica: "Tesouras Howe do SINAPI a cada ≤ 3,2 m, terças sobre as pernas, caibros a 0,55 m, ripas pela galga da telha." },
    "mad-terca": { rotulo: "Madeira — terça + caibro + ripa (terças nas paredes/oitões/pontaletes)", mat: "madeira", tesoura: false, caibro: true, ripa: true, familias: ["ceramica", "concreto"],
                   dica: "Terças apoiadas nas paredes e oitões (que sobem até o telhado) e em pontaletes onde não há parede." },
    "mad-terca-direta": { rotulo: "Madeira — terça (fibrocimento/termoacústica direto na terça)", mat: "madeira", tesoura: false, caibro: false, ripa: false, familias: ["fibrocimento", "sanduiche", "metalica"],
                          dica: "A telha apoia direto nas terças, espaçadas pelo vão máximo do fabricante." },
    "aco-trapezoidal": { rotulo: "Metálica — terça Ue + telha trapezoidal", mat: "aco", tesoura: true, caibro: false, ripa: false, familias: ["metalica"],
                         dica: "Terças Ue pelo vão máximo da telha; tesoura metálica (banzos Ue) onde não há parede/oitão." },
    /* PADRÕES (20/10/2026): fibrocimento/termoacústica sem laje, viga ou parede embaixo para os pontaletes do "terça direta" —
       o automático vai de tesoura, que vence o vão apoiada só nas paredes */
    "mad-tesoura-terca": { rotulo: "Madeira — tesoura + terça (fibrocimento/termoacústica direto na terça)", mat: "madeira", tesoura: true, caibro: false, ripa: false, familias: ["fibrocimento", "sanduiche", "metalica"],
                           dica: "Tesouras a cada ≤ 3,2 m e terças pelo vão máximo da telha, que apoia direto nelas." },
    "mad-onduline": { rotulo: "Madeira — tesoura + terça + caibro + ripa a 46 cm (Onduline)", mat: "madeira", tesoura: true, caibro: true, ripa: true, familias: ["ecologica"],
                      dica: "Telha ecológica Onduline sobre ripas 2,5×5 a cada 46 cm (o apoio do fabricante), caibros, terças e tesouras." },
    "mad-shingle": { rotulo: "Madeira — tesoura + terça + caibro + OSB + subcobertura (shingle)", mat: "madeira", tesoura: true, caibro: true, ripa: false, osb: true, familias: ["shingle"],
                     dica: "Shingle sobre base contínua de OSB e subcobertura (Felt Paper), sobre caibros, terças e tesouras." },
    /* PADRÕES (20/10/2026): na inclinação mínima da telha metálica (6 a 8 %) a tesoura triangular fica BAIXA (8 m a 6 % → 24 cm,
       contra vão/12 = 67 cm). O automático escolhe este: viga W de alma cheia sob as terças (inclinada com o telhado), apoiada
       na parede e num pilar na cumeeira — funciona em qualquer inclinação, sem a altura de treliça */
    "aco-viga": { rotulo: "Metálica — terça Ue + viga W (alma cheia) com pilar na cumeeira (baixa inclinação)", mat: "aco", tesoura: true, viga: true, caibro: false, ripa: false, familias: ["metalica", "sanduiche"],
                  dica: "Para a inclinação mínima da telha metálica: vigas W inclinadas sob as terças, apoiadas nas paredes e em pilares na cumeeira." },
    "aco-sanduiche": { rotulo: "Metálica — terça Ue + telha termoacústica (sanduíche)", mat: "aco", tesoura: true, caibro: false, ripa: false, familias: ["sanduiche"],
                       dica: "Terças Ue pelo vão máximo da telha sanduíche; tesoura metálica onde não há parede/oitão." }
  };
  /* o modelo que combina com a telha (o assistente sugere; o usuário troca) */
  /* a tesoura triangular deste telhado fica abaixo de vão/12 (a proporção de partida do js/metalporticos.js)? {h, vao, min} ou null */
  function tesouraBaixa(t) {
    if (!t || !t.ok) return null;
    var ags = aguasInclinadas(t); if (!ags.length) return null;
    var ag0 = ags.slice().sort(function (a, b) { return num(b.area, 0) - num(a.area, 0); })[0], d = sistemaDe(ag0).d, lo = Infinity, hi = -Infinity;
    arr(t.arestasCalc).forEach(function (e) { var u = d[0] * e.parede.a.x + d[1] * e.parede.a.z; if (u < lo) lo = u; if (u > hi) hi = u; });
    var vao = hi - lo, h = num(t.cotaCumeeira, 0) - num(t.cotaApoio, 0);
    return vao > 0 && h < vao / 12 - 1e-6 ? { h: h, vao: vao, min: vao / 12 } : null;
  }
  /* o modelo AUTOMÁTICO: pela família da telha; na metálica, com o telhado na mão (t), a tesoura baixa troca por viga W */
  function modeloSugerido(tipoId, t, estado) {
    var m0 = modeloSugerido0(tipoId, t);
    /* o modelo de TERÇA (pontaletes) só se tudo nascer apoiado: com o estado na mão, gera e, se ficar pontalete sem apoio ou
       terça sem apoio, troca pelo de tesoura (madeira) — que apoia só nas paredes */
    if (t && t.ok && estado && MODELOS[m0] && !MODELOS[m0].tesoura) {
      var tt = JSON.parse(JSON.stringify(t)); tt.modelo = m0;
      var pk = null; try { pk = modelar(tt, estado, {}); } catch (e) { pk = null; }
      if (pk && pk.ok && arr(pk.avisos).some(function (a) { return /NÃO gerado|SEM apoio/.test(a); })) return MODELOS[m0].caibro ? "mad-tesoura" : "mad-tesoura-terca";
    }
    return m0;
  }
  function modeloSugerido0(tipoId, t) {
    var T = BT(), tel = T ? T.telha(tipoId) : null, f = tel ? tel.familia : null;
    if (f === "ceramica" || f === "concreto") return "mad-tesoura";
    if ((f === "sanduiche" || f === "metalica") && t && tesouraBaixa(t)) return "aco-viga";
    if (f === "sanduiche") return "aco-sanduiche";
    if (f === "metalica") return "aco-trapezoidal";
    if (f === "fibrocimento") return "mad-terca-direta";
    if (f === "ecologica") return "mad-onduline";
    if (f === "shingle") return "mad-shingle";
    return "mad-tesoura";
  }
  var TETO_TRI_AGUA = 40000;   /* teto de triângulos das TELHAS por água (o "Out of Memory" de 19/10 veio de malha demais) */

  /* ---------------------------------------------------------- vetores 3D */
  function v3(x, y, z) { return [x, y, z]; }
  function s3(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function ad3(a, b, k) { k = k == null ? 1 : k; return [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k]; }
  function cr3(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dt3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function ln3(a) { return Math.sqrt(dt3(a, a)); }
  function nz3(a) { var l = ln3(a); return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 1, 0]; }
  function rr(a) { return [r4(a[0]), r4(a[1]), r4(a[2])]; }

  /* a seção de uma peça, no plano (w = largura, v = altura a partir da face de baixo): retângulo, Ue (C com
     enrijecedores, alma em w = −b/2) ou I (W) */
  function secaoPts(pc) {
    var b = pc.w, h = pc.h;
    if (pc.forma === "ue" && pc.dims) {
      var t = pc.dims.t, D = pc.dims.D, x0 = -b / 2, x1 = b / 2;
      return [[x0, 0], [x1, 0], [x1, D], [x1 - t, D], [x1 - t, t], [x0 + t, t], [x0 + t, h - t], [x1 - t, h - t], [x1 - t, h - D], [x1, h - D], [x1, h], [x0, h]];
    }
    if (pc.forma === "w" && pc.dims) {
      var tf = pc.dims.tf, tw = pc.dims.tw;
      return [[-b / 2, 0], [b / 2, 0], [b / 2, tf], [tw / 2, tf], [tw / 2, h - tf], [b / 2, h - tf], [b / 2, h], [-b / 2, h], [-b / 2, h - tf], [-tw / 2, h - tf], [-tw / 2, tf], [-b / 2, tf]];
    }
    return [[-b / 2, 0], [b / 2, 0], [b / 2, h], [-b / 2, h]];
  }
  /* a peça extrudada (lados + tampas) em `pos` (triângulos soltos); devolve quantos triângulos */
  function extrudar(pos, pc) {
    var a = pc.a, b = pc.b, ax = nz3(s3(b, a)), up = pc.up || [0, 1, 0];
    if (Math.abs(dt3(ax, up)) > 0.999) up = Math.abs(ax[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    var w = nz3(cr3(ax, up)), v = nz3(cr3(w, ax)), S = secaoPts(pc), n = S.length, nt = 0;
    function P(base, q) { return ad3(ad3(base, w, q[0]), v, q[1]); }
    var A = S.map(function (q) { return P(a, q); }), B = S.map(function (q) { return P(b, q); });
    function tri(p, q, r) { pos.push(p[0], p[1], p[2], q[0], q[1], q[2], r[0], r[1], r[2]); nt++; }
    for (var i = 0; i < n; i++) { var j = (i + 1) % n; tri(A[i], A[j], B[j]); tri(A[i], B[j], B[i]); }
    var T = BT(), tris = n === 4 ? [[S[0], S[1], S[2]], [S[0], S[2], S[3]]] : (T ? T.triangular(S) : []);
    tris.forEach(function (tr) { tri(P(a, tr[0]), P(a, tr[2]), P(a, tr[1])); tri(P(b, tr[0]), P(b, tr[1]), P(b, tr[2])); });
    return nt;
  }

  /* ---------------------------------------------------------- telha (da tela) */
  function larguraUtilDe(tel) {
    if (!tel) return null;
    if (fin(tel.larguraUtilM)) return tel.larguraUtilM;
    if (fin(tel.larguraUtil)) return tel.larguraUtil;
    if (tel.larguraUtil && typeof tel.larguraUtil === "object") { var k = Object.keys(tel.larguraUtil); if (k.length) return Number(tel.larguraUtil[k[0]]); }
    return null;
  }
  function recobLong(tel, graus) {
    if (!tel) return 0.14;
    if (arr(tel.recobLongPorGraus).length) { for (var i = 0; i < tel.recobLongPorGraus.length; i++) if (graus < tel.recobLongPorGraus[i].ate) return tel.recobLongPorGraus[i].m; return tel.recobLongPorGraus[tel.recobLongPorGraus.length - 1].m; }
    if (arr(tel.recobrimento).length) { for (var j = 0; j < tel.recobrimento.length; j++) { var r = tel.recobrimento[j]; if (graus >= r.deGraus - 1e-9 && graus < r.ateGraus) return r.longitudinalMm / 1000; } return tel.recobrimento[tel.recobrimento.length - 1].longitudinalMm / 1000; }
    if (fin(tel.recobLongM)) return tel.recobLongM;
    return 0.10;
  }
  /* o perfil transversal da telha: altura (m) acima da face de apoio, no ponto t (m) */
  function perfilFn(tel) {
    var pf = (tel && tel.perfil) || { passo: 0.2, altura: 0.04, esp: 0.01 }, p = pf.passo, A = pf.altura, forma = tel && tel.forma || "ondulada";
    if (forma === "trapezoidal") {
      var c = fin(pf.crista) ? pf.crista : p * 0.2, sl = Math.min(A * 0.8, (p - c) / 3), fundo = p - c - 2 * sl;
      return function (t) { var x = ((t % p) + p) % p; if (x < fundo) return 0; x -= fundo; if (x < sl) return A * x / sl; x -= sl; if (x < c) return A; x -= c; return A * (1 - x / sl); };
    }
    if (forma === "romana") return function (t) { var x = ((t % p) + p) % p / p; return x < 0.55 ? 0.15 * A * Math.sin(Math.PI * x / 0.55) : A * Math.sin(Math.PI * (x - 0.55) / 0.45); };
    if (forma === "capa-canal") return function (t) { var x = ((t % p) + p) % p / p; return x < 0.5 ? A * 0.45 * (1 - Math.sin(Math.PI * x / 0.5)) : A * (0.45 + 0.55 * Math.sin(Math.PI * (x - 0.5) / 0.5)); };
    if (forma === "plana") return function () { return 0; };
    return function (t) { return A / 2 * (1 - Math.cos(2 * Math.PI * t / p)); };
  }
  function amostrasPorPasso(tel) { var f = tel && tel.forma; return f === "trapezoidal" ? 4 : (f === "plana" ? 1 : 8); }
  function pontosTrap(tel, t0, t1) {
    /* as quebras exatas do trapézio (o perfil de 4 amostras por passo cairia fora das quinas) */
    var pf = tel.perfil, p = pf.passo, A = pf.altura, c = fin(pf.crista) ? pf.crista : p * 0.2, sl = Math.min(A * 0.8, (p - c) / 3), fundo = p - c - 2 * sl;
    var qs = [0, fundo, fundo + sl, fundo + sl + c], out = [], k0 = Math.floor(t0 / p) - 1, k1 = Math.ceil(t1 / p) + 1;
    for (var k = k0; k <= k1; k++) qs.forEach(function (q) { var x = k * p + q; if (x > t0 && x < t1) out.push(x); });
    return out;
  }

  /* ============================================================ MODELAR */
  function aguasInclinadas(t) {
    return arr(t.aguasCalc).filter(function (ag) { var p = ag.plano || {}; return Math.sqrt((p.bx || 0) * (p.bx || 0) + (p.bz || 0) * (p.bz || 0)) > 1e-6; });
  }
  function sistemaDe(ag) {
    var p = ag.plano, s = Math.sqrt(p.bx * p.bx + p.bz * p.bz), d = [p.bx / s, p.bz / s];
    return { s: s, d: d, td: [-d[1], d[0]], f: Math.sqrt(1 + s * s), y: function (x, z) { return p.a + p.bx * x + p.bz * z; },
             n: nz3([-p.bx, 1, -p.bz]) };
  }
  /* as platibandas deste telhado (topo explícito ou o padrão do js/bimcobertura.js, que soma a espessura do pacote) */
  function topoPlatibanda(t, ctxCob, espPacote) {
    var C = ctxCob, menor = null, BCo = BC(), alt = BCo && BCo.PADRAO && fin(BCo.PADRAO.altura) ? BCo.PADRAO.altura : null;
    if (!C || !C.plat) return null;
    arr(C.ordPlat).forEach(function (pid) {
      var p = C.plat[pid]; if (!p || String(p.telhado) !== String(t.id)) return;
      var topo = fin(Number(p.topo)) ? Number(p.topo) : (alt != null || fin(Number(p.altura)) ? num(t.cotaCumeeira, 0) + espPacote + (fin(Number(p.altura)) ? Number(p.altura) : alt) : null);
      if (topo != null && (menor == null || topo < menor)) menor = topo;
    });
    return menor;
  }

  /* T5: o plano do telhado ao longo do EIXO da parede (21 amostras); fora do telhado no eixo, meia espessura para dentro */
  function planoNaParede(T, t, w) {
    var ys = [], nA = 20, nx = -w.uz, nzz = w.ux, o2 = w.e / 2 + 0.02;
    for (var k = 0; k <= nA; k++) {
      var u = -w.L / 2 + w.L * k / nA, x = w.cx + w.ux * u, z = w.cz + w.uz * u, y = T.alturaEm(t, x, z);
      if (y == null) { var y1 = T.alturaEm(t, x + nx * o2, z + nzz * o2), y2 = T.alturaEm(t, x - nx * o2, z - nzz * o2); y = y1 == null ? y2 : (y2 == null ? y1 : Math.max(y1, y2)); }
      if (y != null) ys.push(y);
    }
    return ys;
  }

  /* ======================================================================
   * T5 (20/10/2026) — EDITAR UMA PEÇA DA ESTRUTURA DERIVADA
   * O pedido do dono (Casa 487): "não consigo excluir nem editar uma viga/terça — a seleção pega o telhado inteiro".
   * A estrutura é DERIVADA da op `telhado` (refeita a cada replay); a edição de uma peça é uma SOBREPOSIÇÃO guardada
   * na própria op: t.sobrepor = { <id da peça>: { removida: true } | { perfil: "<perfil de aço>" } | { secao: "<seção
   * de madeira>" } | { desloc: {x,y,z} } | { ext: {a, b} } } (m). O id é ESTÁVEL pela FUNÇÃO e pela POSIÇÃO na
   * malha — papel, água, fileira, tesoura, lado e a ordem dentro desse grupo ("terca.a0.f2#0") —, não pela
   * coordenada: muda a inclinação, a terça da fileira 2 continua a "terca.a0.f2#0" e a edição continua valendo.
   * Peça removida não vai para o 3D, o quantitativo, as medidas do orçamento nem o IFC (todos leem pk.pecas);
   * perfil/seção trocados contam o novo. Peça removida que deixa a telha (ou a peça de cima) sem apoio vira
   * problema com Corrigir ("Voltar ao automático" = tirar a sobreposição).
   * ====================================================================== */
  var ROTULO_PECA = { linha: "Linha (tirante)", perna: "Perna", pendural: "Pendural", escora: "Escora", montante: "Montante (sarrafo)", terca: "Terça", caibro: "Caibro", ripa: "Ripa",
    pontalete: "Pontalete", espigao: "Espigão", rincao: "Rincão", testeira: "Testeira", "banzo-inferior": "Banzo inferior da tesoura", "viga-aco": "Viga principal",
    "pilar-aco": "Pilar", banzo: "Banzo superior da tesoura", "pendural-aco": "Montante central da tesoura", diag: "Diagonal da tesoura", "montante-aco": "Montante da tesoura" };
  function rotuloPeca(o) { return o ? (ROTULO_PECA[o.p] || String(o.p)) : ""; }
  function chaveId(o) { return o.p + (o.agua != null ? ".a" + o.agua : "") + (o.fileira != null ? ".f" + o.fileira : "") + (o.tesoura ? "." + o.tesoura : "") + (o.lado != null ? ".l" + o.lado : ""); }
  /* REVISOR T5 (20/10/2026): o id leva o CONTEXTO em que a ordem vale — o total do grupo, o modelo, o nº de águas, o nº de
     tesouras (peça de tesoura) e o nº de fileiras da água (terça). Sem isso, mudar o tamanho/o tipo/o modelo fazia a edição
     cair numa peça ERRADA (4 águas: o caibro.a1#8 ia de x 3,9 para 8,4; 14 m: a linha.tes2 ia da parede de x 5 para x 8,4).
     Mudou o contexto → a edição fica órfã COM aviso (nunca aplica em outra peça). */
  function idsPecas(pecas, ctx) {
    var cont = {}, tot = {}, tesK = {}, fil = {};
    function tk(o) { return String(o.tesoura).replace(/[0-9.-]+$/, ""); }
    pecas.forEach(function (o) {
      var k = chaveId(o); tot[k] = (tot[k] || 0) + 1;
      if (o.tesoura) (tesK[tk(o)] = tesK[tk(o)] || {})[o.tesoura] = 1;
      if (o.p === "terca" && o.agua != null) (fil[o.agua] = fil[o.agua] || {})[String(o.fileira)] = 1;
    });
    pecas.forEach(function (o) {
      var k = chaveId(o), n0 = cont[k] || 0; cont[k] = n0 + 1;
      var id = k + "#" + n0;
      if (ctx != null) {
        id += ":" + tot[k] + "|" + ctx;
        if (o.tesoura) id += ".t" + Object.keys(tesK[tk(o)]).length;
        if (o.p === "terca" && o.agua != null) id += ".f" + Object.keys(fil[o.agua]).length;
      }
      o.id = id;
    });
    return pecas;
  }
  var ID_PECA_RE = /^[A-Za-z0-9_.:#|+-]{1,90}$/;
  /* a forma da sobreposição (o sanear da op): só campos conhecidos, cada um com a sua regra; null = apagar o campo */
  function sobreposicaoValida(s) {
    if (s === null) return true;
    if (!s || typeof s !== "object" || Array.isArray(s)) return false;
    var ks = Object.keys(s); if (!ks.length) return false;
    return ks.every(function (k) {
      var v = s[k]; if (v === null) return true;
      if (k === "removida") return v === true || v === false;
      if (k === "perfil" || k === "secao") return typeof v === "string" && v.length > 0 && v.length <= 60;
      if (k === "desloc") return !!v && typeof v === "object" && ["x", "y", "z"].every(function (c) { return v[c] == null || (fin(v[c]) && Math.abs(v[c]) <= 20); }) &&
        (v.agua == null || (typeof v.agua === "object" && ["u", "v"].every(function (c) { return v.agua[c] == null || (fin(v.agua[c]) && Math.abs(v.agua[c]) <= 20); })));
      if (k === "ext") return !!v && typeof v === "object" && ["a", "b"].every(function (c) { return v[c] == null || (fin(v[c]) && v[c] >= -20 && v[c] <= 20); });
      return false;
    });
  }
  function sobreporValido(m) {
    if (m === null) return true;
    if (!m || typeof m !== "object" || Array.isArray(m)) return false;
    var ks = Object.keys(m); if (!ks.length || ks.length > 2000) return false;
    return ks.every(function (k) { return ID_PECA_RE.test(k) && sobreposicaoValida(m[k]); });
  }
  /* aplica o remendo da op sobre o mapa guardado (null apaga a entrada; campo null apaga o campo; entrada vazia some) */
  function mesclarSobrepor(atual, remendo) {
    if (remendo === null) return null;
    var out = atual && typeof atual === "object" ? clone(atual) : {};
    Object.keys(remendo || {}).forEach(function (k) {
      var v = remendo[k];
      if (v === null) { delete out[k]; return; }
      var e = out[k] || {};
      Object.keys(v).forEach(function (c) { if (v[c] === null || v[c] === false) delete e[c]; else e[c] = clone(v[c]); });
      if (e.removida) e = { removida: true };   /* removida apaga as outras edições (nada para mover numa peça que não existe) */
      if (Object.keys(e).length) out[k] = e; else delete out[k];
    });
    return Object.keys(out).length ? out : null;
  }
  function aplicarSobreposicoes(t, pecas, x) {
    idsPecas(pecas, String(t && t.modelo || "") + "." + arr(x.ags).length + "a");
    var sob = t && t.sobrepor && typeof t.sobrepor === "object" ? t.sobrepor : null, out = { pecas: pecas, removidas: [], editadas: [], problemas: [], orfas: [], avisos: [] };
    if (!sob) return out;
    var achou = {}, rem = [];
    out.pecas = pecas.filter(function (o) {
      var s = sob[o.id]; if (!s || typeof s !== "object") return true;
      achou[o.id] = 1;
      if (s.removida) { rem.push(o); return false; }
      var auto = { perfil: o.perfil || null, w: o.w, h: o.h, a: o.a.slice(), b: o.b.slice(), L: o.L }, mud = [];
      if (s.perfil && o.mat === "aco") {
        var sp = x.perfAco(s.perfil);
        if (sp) { o.perfil = sp.nome; o.w = sp.w; o.h = sp.h; o.forma = sp.forma; o.dims = sp.dims; mud.push("perfil"); }
        else out.avisos.push(rotuloPeca(o) + " " + o.id + ": o perfil \"" + s.perfil + "\" não está no catálogo (js/perfisaco.js) — ficou o automático.");
      } else if (s.secao && o.mat === "madeira") {
        var sm = secaoMadeira(s.secao);
        if (sm) { o.w = sm.b; o.h = sm.h; o.forma = "ret"; delete o.dims; delete o.perfil; o.secao = sm.id; mud.push("secao"); }
        else out.avisos.push(rotuloPeca(o) + " " + o.id + ": a seção \"" + s.secao + "\" não está no catálogo de madeira — ficou o automático.");
      }
      if (s.desloc) {
        var dv = [num(s.desloc.x, 0), num(s.desloc.y, 0), num(s.desloc.z, 0)];
        /* REVISOR T6: o arrasto NO PLANO DA ÁGUA guarda também as coordenadas na água (u ao longo da peça, v na água):
           mudou a inclinação, o deslocamento é refeito na água NOVA — o x/y/z do mundo (o de antes) deixava a terça
           12 cm fora do plano a 30 → 60 %. O x/y/z fica gravado para quem lê a op sem conhecer o `agua`.
           `deslocEf` = o deslocamento que a peça TEM de fato (o das Propriedades da peça mostra este, não o x/y/z antigo). */
        if (s.desloc.agua && PECAS_AGUA[o.p]) { var plA = planoArrasto(o, false); if (plA.tipo === "agua") dv = rr(ad3(ad3([0, 0, 0], plA.e1, num(s.desloc.agua.u, 0)), plA.e2, num(s.desloc.agua.v, 0))); }
        o.a = rr(ad3(o.a, dv)); o.b = rr(ad3(o.b, dv)); o.deslocEf = rr(dv); mud.push("desloc"); }
      if (s.ext && (num(s.ext.a, 0) || num(s.ext.b, 0))) {
        var ax = nz3(s3(o.b, o.a)), ea = num(s.ext.a, 0), eb = num(s.ext.b, 0), L0 = ln3(s3(o.b, o.a));
        if (L0 + ea + eb > 0.05) { o.a = rr(ad3(o.a, ax, -ea)); o.b = rr(ad3(o.b, ax, eb)); mud.push("ext"); }
      }
      o.L = r4(ln3(s3(o.b, o.a)));
      if (mud.length) { o.editada = mud; o.auto = auto; out.editadas.push(o.id); }
      return true;
    });
    out.orfas = Object.keys(sob).filter(function (k) { return !achou[k]; });
    if (out.orfas.length) out.avisos.push(out.orfas.length + " edição(ões) de peça sem a peça: o telhado mudou e ela não existe mais (Propriedades do telhado › Peças editadas › Voltar ao automático limpa).");
    /* a peça removida deixa alguém sem apoio? terça: o vão entre as vizinhas da mesma água passa do máximo (ou ela era a da
       ponta); caibro: o vão das ripas; ripa: a fiada de telha; tesoura, viga, pilar, pontalete: a terça de cima perde o apoio */
    function sist(ia) { var ag = x.ags && x.ags[ia]; return ag ? sistemaDe(ag) : null; }
    function mid(o) { return [(o.a[0] + o.b[0]) / 2, (o.a[2] + o.b[2]) / 2]; }
    function vaoVizinhas(o, eixoU) {
      var S = sist(o.agua); if (!S) return null;
      var dir = eixoU ? S.d : S.td, ort = eixoU ? S.td : S.d, m0 = mid(o), c0 = dir[0] * m0[0] + dir[1] * m0[1];
      var r0 = [ort[0] * o.a[0] + ort[1] * o.a[2], ort[0] * o.b[0] + ort[1] * o.b[2]].sort(function (p, q) { return p - q; });
      var abaixo = null, acima = null;
      out.pecas.forEach(function (q) {
        if (q.p !== o.p || q.agua !== o.agua) return;
        var r = [ort[0] * q.a[0] + ort[1] * q.a[2], ort[0] * q.b[0] + ort[1] * q.b[2]].sort(function (p, z) { return p - z; });
        if (Math.min(r[1], r0[1]) - Math.max(r[0], r0[0]) < 0.05) return;
        var mq = mid(q), c = dir[0] * mq[0] + dir[1] * mq[1];
        if (c < c0 - 1e-6 && (abaixo == null || c > abaixo)) abaixo = c;
        if (c > c0 + 1e-6 && (acima == null || c < acima)) acima = c;
      });
      return { ponta: abaixo == null || acima == null, vao: abaixo != null && acima != null ? (acima - abaixo) * (eixoU ? S.f : 1) : null };
    }
    rem.forEach(function (o) {
      var perde = null, M = x.M || {};
      if (o.p === "ripa") perde = "a fiada de telha dessa ripa fica sem apoio";
      else if (o.p === "terca" || o.p === "caibro") {
        var eU = o.p === "terca", lim = eU ? x.espT : x.espCb, v = vaoVizinhas(o, eU), quem = eU ? (M.caibro ? "os caibros" : "as telhas") : "as ripas";
        if (!v || v.ponta) perde = quem + " da ponta ficam sem apoio (era a " + (eU ? "terça" : "peça") + " da borda)";
        else if (lim != null && v.vao > lim + 0.01) perde = quem + " ficam com " + virg(v.vao) + " m entre apoios — passa do máximo de " + virg(lim) + " m";
      } else if (o.p !== "testeira") perde = "a peça que ela apoiava (terça ou estrutura de cima) perde esse apoio";
      out.removidas.push({ id: o.id, p: o.p, tesoura: o.tesoura || null, rotulo: rotuloPeca(o), L: o.L, perfil: o.perfil || null, w: o.w, h: o.h, a: o.a, b: o.b, semApoio: !!perde });
      if (perde) {
        var tx = rotuloPeca(o) + " " + o.id + " removida: " + perde + ". Confira o apoio ou volte a peça ao automático.";
        out.avisos.push(tx);
        out.problemas.push({ texto: tx, peca: o.id, gravidade: "alta", corrigir: { texto: "Voltar a peça ao automático", acao: { tipo: "telhadoPecaAutomatico", telhado: String(t.id), peca: o.id } } });
      }
    });
    return out;
  }
  /* a peça (do pacote) mais perto de um ponto 3D — o clique no 3D cai na malha mesclada; quem é a peça sai daqui.
     A seção vai da face de baixo (no eixo a→b) até h, no sentido "up": o centro é o eixo + up·h/2. */
  function pecaMaisPerto(t, P, opc) {
    var pk = t && t.pacote; if (!pk || !pk.ok || !P) return null;
    var melhor = null, filtro = opc && opc.p ? opc.p : null;
    arr(pk.pecas).forEach(function (o) {
      if (filtro && o.p !== filtro) return;
      var ax = s3(o.b, o.a), L2 = dt3(ax, ax); if (!(L2 > 1e-12)) return;
      var up = o.up || [0, 1, 0], a = nz3(ax);
      if (Math.abs(dt3(a, up)) > 0.999) up = Math.abs(a[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
      var w = nz3(cr3(a, up)), v = nz3(cr3(w, a)), A = ad3(o.a, v, o.h / 2);
      var k = Math.max(0, Math.min(1, dt3(s3(P, A), ax) / L2)), Q = ad3(A, ax, k), dd = ln3(s3(P, Q)) - Math.max(o.w, o.h) / 2;
      if (!melhor || dd < melhor.d) melhor = { d: dd, peca: o };
    });
    return melhor ? { id: melhor.peca.id, d: r4(Math.max(0, melhor.d)), peca: melhor.peca } : null;
  }
  /* os triângulos de UMA peça (o realce da peça escolhida no 3D) */
  function malhaPeca(o) { var pos = []; if (o) extrudar(pos, o); return pos; }
  /* as seções que a peça pode trocar: madeira = o catálogo de madeira; aço = a mesma série do perfil automático */
  function opcoesSecao(o) {
    if (!o) return [];
    if (o.mat === "aco") {
      var A = PA(), nm = o.auto && o.auto.perfil ? o.auto.perfil : o.perfil, inf = A && A.obter && nm ? A.obter(nm) : null;
      var l = inf && A.listar ? A.listar(inf.serie) : [];
      return l.map(function (n) { return { id: n, rotulo: n }; });
    }
    return SECOES_MADEIRA.map(function (s) { return { id: s.id, rotulo: virg(s.b * 100, 0) + "×" + virg(s.h * 100, 0) + " cm" }; });
  }
  /* a op que edita uma peça: { op:"telhado", id, sobrepor:{ <peca>: campos } } (campos null = voltar ao automático) */
  function opPeca(telhadoId, pecaId, campos) {
    var m = {}; m[String(pecaId)] = campos === null ? null : campos;
    return { op: "telhado", id: String(telhadoId), sobrepor: m };
  }

  /* ======================================================================
   * T6 (20/10/2026) — ARRASTAR A PEÇA COM O MOUSE (motor puro; a tela está em js/bimp3ui.js, BimTelhadoPecaArr)
   * O arrasto grava na MESMA sobreposição da T5 (desloc / ext), então vale tudo o que ela já tem: id estável, Voltar ao
   * automático, Ctrl+Z (uma op por arrasto). O plano de trabalho depende da peça:
   *   · terça, caibro, ripa, espigão, rincão, testeira = o PLANO DA ÁGUA (a normal é o `up` da peça): a peça anda ao longo
   *     da água e não sai do plano;
   *   · as outras (viga, pilar, linha, pendural…) = o plano HORIZONTAL (como as peças do editor); com Shift, o VERTICAL
   *     que contém o eixo (pilar: o plano da normal `up`).
   * Snaps: as pontas e o meio das OUTRAS peças do telhado (a peça encosta nelas) e, sem ponto notável, a grade da barra
   * (passo em m). Alt solta tudo. Dígitos durante o arrasto cravam a distância (opc.dig, m).
   * ====================================================================== */
  var PECAS_AGUA = { terca: 1, caibro: 1, ripa: 1, espigao: 1, rincao: 1, testeira: 1 };
  function eixoPeca(o) { return nz3(s3(o.b, o.a)); }
  function meioPeca(o) { return [(o.a[0] + o.b[0]) / 2, (o.a[1] + o.b[1]) / 2, (o.a[2] + o.b[2]) / 2]; }
  function planoArrasto(o, vertical) {
    var ax = eixoPeca(o), up = o.up ? nz3(o.up) : [0, 1, 0], n = null, tipo = "horizontal", e1, e2;
    if (!vertical && PECAS_AGUA[o.p]) {
      var u2 = ad3(up, ax, -dt3(up, ax));
      if (ln3(u2) > 1e-6 && Math.abs(nz3(u2)[1]) < 0.9995) { n = nz3(u2); tipo = "agua"; }
    }
    if (!n && vertical) {
      var hz = [ax[0], 0, ax[2]];
      if (ln3(hz) > 0.05) n = nz3([-hz[2], 0, hz[0]]);
      else { var uh = [up[0], 0, up[2]]; n = ln3(uh) > 0.05 ? nz3(uh) : [0, 0, 1]; }
      tipo = "vertical";
    }
    if (!n) { n = [0, 1, 0]; tipo = "horizontal"; }
    if (tipo === "horizontal") { e1 = [1, 0, 0]; e2 = [0, 0, 1]; }
    else if (tipo === "vertical") { e1 = nz3(cr3(n, [0, 1, 0])); e2 = [0, 1, 0]; }
    else { var ap = ad3(ax, n, -dt3(ax, n)); e1 = ln3(ap) > 1e-6 ? nz3(ap) : nz3(cr3(n, [0, 1, 0])); e2 = nz3(cr3(n, e1)); }
    return { n: n, tipo: tipo, ax: ax, e1: e1, e2: e2 };
  }
  /* o ponto do raio {origem, direcao} no plano (P0, n); null = paralelo ou atrás da câmera */
  function raioNoPlano(ray, P0, n) {
    if (!ray || !ray.origem || !ray.direcao) return null;
    var D = nz3(ray.direcao), den = dt3(D, n); if (Math.abs(den) < 1e-6) return null;
    var t = dt3(s3(P0, ray.origem), n) / den; if (!(t > 0)) return null;
    return ad3(ray.origem, D, t);
  }
  /* o parâmetro s do ponto da reta A + s·u mais perto do raio; null = reta paralela ao raio */
  function raioNaReta(ray, A, u) {
    if (!ray || !ray.origem || !ray.direcao) return null;
    var D = nz3(ray.direcao), w0 = s3(A, ray.origem), b = dt3(u, D), c = dt3(D, D), d = dt3(u, w0), e = dt3(D, w0), den = dt3(u, u) * c - b * b;
    if (Math.abs(den) < 1e-6) return null;
    return (b * e - c * d) / den;
  }
  function candidatosPontas(outras, id) {
    var out = [];
    arr(outras).forEach(function (q) { if (!q || q.id === id) return; out.push({ p: q.a, q: q }); out.push({ p: q.b, q: q }); out.push({ p: meioPeca(q), q: q, meio: true }); });
    return out;
  }
  /* MOVER: d0 = o deslocamento cru (m, mundo) → { d, c1, c2, dy, dist, guia, grade }.
     opc = { tol (m), passo (m; 0 = sem grade), snap (bool), livre (Alt), dig (m) } */
  function arrastoPeca(o, outras, d0, plano, opc) {
    opc = opc || {};
    var n = plano.n, d = ad3(d0, n, -dt3(d0, n)), guia = null, grade = false;
    if (fin(opc.dig) && opc.dig > 0 && ln3(d) > 1e-9) { d = ad3([0, 0, 0], nz3(d), opc.dig); guia = "valor digitado"; }
    else if (!opc.livre && opc.snap !== false) {
      var tol = fin(opc.tol) && opc.tol > 0 ? opc.tol : 0.1, melhor = null, refs = [o.a, o.b, meioPeca(o)];
      candidatosPontas(outras, o.id).forEach(function (c) {
        refs.forEach(function (R) {
          var v = s3(c.p, ad3(R, d)); v = ad3(v, n, -dt3(v, n));
          var dd = ln3(v) + (c.meio ? 0.01 : 0);   /* ponta ganha do meio no empate */
          if (dd <= tol && (!melhor || dd < melhor.dd)) melhor = { dd: dd, v: v, q: c.q, meio: c.meio };
        });
      });
      if (melhor) { d = ad3(d, melhor.v); guia = "encosta " + (melhor.meio ? "no meio" : "na ponta") + " de " + (rotuloPeca(melhor.q) || "outra peça").toLowerCase(); }
      else if (fin(opc.passo) && opc.passo > 0) {
        var p = opc.passo, c1g = Math.round(dt3(d, plano.e1) / p) * p, c2g = Math.round(dt3(d, plano.e2) / p) * p;
        d = ad3(ad3([0, 0, 0], plano.e1, c1g), plano.e2, c2g); grade = true;
      }
    }
    return { d: rr(d), c1: r4(dt3(d, plano.e1)), c2: r4(dt3(d, plano.e2)), dy: r4(d[1]), dist: r4(ln3(d)), guia: guia, grade: grade };
  }
  /* ESTICAR: a alça da ponta `ext` ("a" início | "b" fim) levada até o raio. Devolve o quanto ALONGA (+) ou encurta (−) */
  function esticarAlcaPeca(o, outras, ext, ray, opc) {
    opc = opc || {};
    var ax = eixoPeca(o), u = ext === "b" ? ax : [-ax[0], -ax[1], -ax[2]], A = ext === "b" ? o.b : o.a, guia = null, s;
    if (fin(opc.dig) && opc.dig > 0) s = (opc.sinal < 0 ? -1 : 1) * opc.dig;
    else {
      s = raioNaReta(ray, A, u); if (s == null) return null;
      if (!opc.livre && opc.snap !== false) {
        var tol = fin(opc.tol) && opc.tol > 0 ? opc.tol : 0.1, melhor = null;
        candidatosPontas(outras, o.id).forEach(function (c) {
          var v = s3(c.p, A), sc = dt3(v, u), perp = ln3(ad3(v, u, -sc));
          if (perp > Math.max(tol, 0.12) || Math.abs(sc - s) > tol) return;
          var dd = Math.abs(sc - s) + (c.meio ? 0.01 : 0);
          if (!melhor || dd < melhor.dd) melhor = { dd: dd, s: sc, q: c.q };
        });
        if (melhor) { s = melhor.s; guia = "alinha com " + (rotuloPeca(melhor.q) || "outra peça").toLowerCase(); }
        else if (fin(opc.passo) && opc.passo > 0) s = Math.round(s / opc.passo) * opc.passo;
      }
    }
    if (o.L + s < 0.06) s = 0.06 - o.L;
    if (Math.abs(s) > 20) s = s > 0 ? 20 : -20;
    return { delta: r4(s), L: r4(o.L + s), guia: guia };
  }
  /* os CAMPOS da sobreposição (para opPeca) a partir do deslocamento / alongamento — somados ao que já está gravado */
  /* plano (opcional) = o do arrasto: no PLANO DA ÁGUA grava também { agua: {u, v} } (refeito na água nova se a inclinação
     mudar — REVISOR T6). Só quando o deslocamento anterior também era na água (ou não havia): um x/y/z vindo das
     Propriedades (que pode sair do plano) continua no mundo. */
  function camposDesloc(t, pecaId, d, plano) {
    var s = (t && t.sobrepor && t.sobrepor[pecaId]) || {}, o = s.desloc || {};
    var x = Math.round((num(o.x, 0) + d[0]) * 1000) / 1000, y = Math.round((num(o.y, 0) + d[1]) * 1000) / 1000, z = Math.round((num(o.z, 0) + d[2]) * 1000) / 1000;
    if (Math.abs(x) > 20 || Math.abs(y) > 20 || Math.abs(z) > 20) return null;
    if (!(x || y || z)) return { desloc: null };
    var out = { x: x, y: y, z: z }, antesMundo = !o.agua && (num(o.x, 0) || num(o.y, 0) || num(o.z, 0));
    if (plano && plano.tipo === "agua" && !antesMundo) {
      var oa = o.agua || {}, u = Math.round((num(oa.u, 0) + dt3(d, plano.e1)) * 1000) / 1000, v = Math.round((num(oa.v, 0) + dt3(d, plano.e2)) * 1000) / 1000;
      if (Math.abs(u) > 20 || Math.abs(v) > 20) return null;
      out.agua = { u: u, v: v };
    }
    return { desloc: out };
  }
  function camposEsticar(t, pecaId, ext, delta) {
    var s = (t && t.sobrepor && t.sobrepor[pecaId]) || {}, o = s.ext || {};
    var a = num(o.a, 0), b = num(o.b, 0);
    if (ext === "a") a += delta; else b += delta;
    a = Math.round(a * 1000) / 1000; b = Math.round(b * 1000) / 1000;
    if (Math.abs(a) > 20 || Math.abs(b) > 20) return null;
    return { ext: a || b ? { a: a, b: b } : null };
  }
  /* a peça (cópia) já movida/esticada: a prévia do arrasto desenha esta (malhaPeca) */
  function pecaMovida(o, d, ea, eb) {
    var c = clone(o), ax = eixoPeca(o); d = d || [0, 0, 0];
    c.a = rr(ad3(ad3(o.a, d), ax, -(ea || 0))); c.b = rr(ad3(ad3(o.b, d), ax, eb || 0)); c.L = r4(ln3(s3(c.b, c.a)));
    return c;
  }

  function modelar(t, estado, opc) {
    opc = opc || {};
    var T = BT(), M = MODELOS[t && t.modelo];
    instalarAjuste();   /* o BimCobertura pode ter carregado depois deste arquivo */
    if (!T || !t || !t.ok) return null;
    if (!M) return { ok: false, avisos: ["Modelo de telhado desconhecido: " + txt(t.modelo) + "."] };
    if (t.modo !== "perimetro") return { ok: false, avisos: ["O modelo com estrutura é do telhado por perímetro (o de extrusão fica só com o telhado)."] };
    var tel = T.telha(t.tipoId), avisos = [], prem = [], pecas = [], H0 = num(t.cotaApoio, 0), mat = M.mat;
    var ags = aguasInclinadas(t);
    if (!ags.length) return { ok: false, avisos: ["Telhado plano: o modelo com estrutura pede inclinação."] };
    if (!tel) avisos.push("O tipo \"" + txt(t.tipoTelhado && t.tipoTelhado.rotulo) + "\" não tem dados de catálogo: galga, vão e fixação saem como VALOR DE PARTIDA — conferir. Escolha uma telha de catálogo.");
    if (tel && M.familias.indexOf(tel.familia) < 0) avisos.push("O modelo \"" + M.rotulo + "\" não é o usual para telha de " + tel.familia + " (sugerido: " + MODELOS[modeloSugerido(t.tipoId)].rotulo + ").");
    prem.push("Modelo: " + M.rotulo + " — PRÉ-DIMENSIONADO, confirmar no cálculo (" + (mat === "aco" ? "Metálica" : "módulo Madeira, NBR 7190") + ").");
    function usar(chave, sec) { prem.push(sec.rot + " — " + (sec.partida ? "VALOR DE PARTIDA — conferir" + (sec.fonte ? " (" + sec.fonte + ")" : "") : sec.fonte)); return sec; }
    function perfAco(nome) {
      var A = PA(), o = A && A.obter ? A.obter(nome) : null; if (!o) return null;
      return o.forma === "frio" ? { forma: "ue", w: o.bf / 1000, h: o.bw / 1000, dims: { t: o.t / 1000, D: (o.D || 0) / 1000 }, massa: o.massa, nome: nome }
                                : { forma: "w", w: o.bf / 1000, h: o.d / 1000, dims: { tf: o.tf / 1000, tw: o.tw / 1000 }, massa: o.massa, nome: nome };
    }
    /* ---- seções */
    var sT, sC = null, sR = null, sTes = null;
    if (mat === "aco") {
      sT = perfAco(PERFIS_TEL.terca); sTes = perfAco(PERFIS_TEL.banzo); var sDg = perfAco(PERFIS_TEL.diagonal);
      if (!sT || !sTes || !sDg) return { ok: false, avisos: ["Perfil de aço fora do catálogo (js/perfisaco.js)."] };
      prem.push("Perfis ADOTADOS — VALOR DE PARTIDA, conferir no cálculo: terça " + PERFIS_TEL.terca + ", banzos da tesoura " + PERFIS_TEL.banzo + ", montantes/diagonais " + PERFIS_TEL.diagonal + " (catálogo " + (PA() && PA().FONTE ? "js/perfisaco.js" : "de perfis") + ")");
    } else {
      sT = usar("terca", SEC.terca); if (M.caibro) sC = usar("caibro", SEC.caibro);
      /* a ripa do catálogo da telha quando ele pede uma (Onduline: apoio mínimo 5 × 2,5 cm) */
      if (M.ripa) sR = usar("ripa", tel && tel.ripaSecao ? tel.ripaSecao : SEC.ripa);
    }
    /* a altura VERTICAL de uma camada que acompanha a inclinação (a seção é perpendicular ao plano) */
    var ag0 = ags.slice().sort(function (a, b) { return num(b.area, 0) - num(a.area, 0); })[0], S0 = sistemaDe(ag0), f0 = S0.f;
    /* ---- tesoura: em que linhas, com que vão */
    var P = arr(t.arestasCalc).map(function (e) { return [e.parede.a.x, e.parede.a.z]; });
    var d0 = S0.d, td0 = S0.td;
    var tmin = Infinity, tmax = -Infinity;
    P.forEach(function (q) { var tt = td0[0] * q[0] + td0[1] * q[1]; if (tt < tmin) tmin = tt; if (tt > tmax) tmax = tt; });
    var paredes = paredesDe(estado), Tlen = tmax - tmin;
    var espApoio = mat === "aco" ? ESPAC.apoioAco : ESPAC.apoio;
    prem.push("Eixo das " + (M.tesoura ? "tesouras" : "linhas de apoio (paredes/pontaletes)") + " ≤ " + virg(espApoio.m) + " m — " + (espApoio.partida ? "VALOR DE PARTIDA — conferir" : espApoio.fonte));
    /* GRUPOS DE DIREÇÃO (4 águas, L e U — 20/10/2026): as águas paralelas (d ou −d) formam um grupo e cada grupo tem as SUAS
       linhas de apoio, perpendiculares às terças dele (a testa de 4 águas e a ala do L têm terças na outra direção). As
       posições obrigatórias de cada grupo são as pontas do contorno e os vértices INTERNOS do esqueleto (a ponta da cumeeira,
       o encontro de espigões e rincões): é ali que a meia-tesoura encontra a tesoura inteira. Entre elas, partes iguais ≤ o
       eixo de apoio. Num telhado de 2 águas não há vértice interno e as linhas são as de antes. */
    function distSegP(q, a, b) { var dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, k = L2 > 0 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dz) / L2)) : 0; return dist2(q, [a[0] + k * dx, a[1] + k * dz]); }
    function interno(q) { if (!T.dentro(q, P)) return false; for (var i = 0; i < P.length; i++) if (distSegP(q, P[i], P[(i + 1) % P.length]) < 0.05) return false; return true; }
    var vertsInt = [];
    arr(t.linhas).forEach(function (ln) { [ln.a, ln.b].forEach(function (q) { var p2 = [q.x, q.z]; if (interno(p2) && !vertsInt.some(function (v) { return dist2(v, p2) < 0.02; })) vertsInt.push(p2); }); });
    var grupos = [];
    ags.forEach(function (ag) {
      var Sg = sistemaDe(ag), g = grupos.filter(function (G) { return Math.abs(G.d[0] * Sg.d[0] + G.d[1] * Sg.d[1]) > 0.99; })[0];
      if (!g) { g = { d: ag === ag0 ? d0 : Sg.d, td: ag === ag0 ? td0 : Sg.td, aguas: [], principal: false }; grupos.push(g); }
      if (ag === ag0) { g.d = d0; g.td = td0; g.principal = true; }
      g.aguas.push(ag);
    });
    grupos.sort(function (a, b) { return (b.principal ? 1 : 0) - (a.principal ? 1 : 0); });
    grupos.forEach(function (G) {
      var a0 = Infinity, a1 = -Infinity;
      P.forEach(function (q) { var tt = G.td[0] * q[0] + G.td[1] * q[1]; if (tt < a0) a0 = tt; if (tt > a1) a1 = tt; });
      var req = [a0, a1]; vertsInt.forEach(function (v) { var tt = G.td[0] * v[0] + G.td[1] * v[1]; if (tt > a0 + 0.05 && tt < a1 - 0.05) req.push(tt); });
      req.sort(function (x, y) { return x - y; });
      var rq = []; req.forEach(function (v) { if (!rq.length || v - rq[rq.length - 1] > 0.05) rq.push(v); });
      G.tmin = a0; G.tmax = a1; G.linhas = [{ t: rq[0], ponta: true }];
      for (var i = 1; i < rq.length; i++) {
        var gap = rq[i] - rq[i - 1], nn = Math.max(1, Math.ceil(gap / espApoio.m - 1e-9));
        for (var j = 1; j <= nn; j++) G.linhas.push({ t: rq[i - 1] + gap * j / nn, ponta: i === rq.length - 1 && j === nn });
      }
    });
    var linhas = grupos[0].linhas;
    /* parede PARALELA ao caimento perto da linha: a linha vai para o eixo dela e a parede apoia (anexa o topo) */
    function paredeNaLinha(tj, G) {
      var melhor = null, dG = G ? G.d : d0, tdG = G ? G.td : td0;
      paredes.forEach(function (w) {
        if (Math.abs(w.ux * dG[1] - w.uz * dG[0]) > 0.05) return;
        var tw = tdG[0] * w.cx + tdG[1] * w.cz, dd = Math.abs(tw - tj);
        /* parede COBERTA por laje (a laje de forro em cima dela) não sobe até a terça: a linha vira de pontaletes sobre a laje */
        if (lajeSobre(w)) return;
        if (dd <= Math.max(0.35, w.e) && w.topo > H0 - 0.6 && w.base < H0 && (!melhor || dd < melhor.dd)) melhor = { w: w, tw: tw, dd: dd };
      });
      return melhor;
    }
    /* o trecho (em s, ao longo de G.d) que as paredes da linha cobrem DE VERDADE: no L a parede da ala (x = 6) vai só de z = 6 a 12,
       e a terça que cruza a linha em z = 3 não tem parede embaixo — contava apoio e ficava no ar (revisor 2, 20/10/2026) */
    function trechosParede(tw, G) {
      var out = [];
      paredes.forEach(function (w) {
        if (Math.abs(w.ux * G.d[1] - w.uz * G.d[0]) > 0.05 || lajeSobre(w) || !(w.topo > H0 - 0.6 && w.base < H0)) return;
        if (Math.abs(G.td[0] * w.cx + G.td[1] * w.cz - tw) > Math.max(0.10, w.e / 2 + 0.02)) return;
        var sc = G.d[0] * w.cx + G.d[1] * w.cz; out.push([sc - w.L / 2 - 0.08, sc + w.L / 2 + 0.08]);
      });
      return out;
    }
    var anexar = {};
    /* (revisor T1, 20/10/2026) o PONTALETE só nasce sobre apoio: laje, viga ou parede embaixo dele (o topo mais alto até a cota
       de apoio do telhado). Sem apoio, nada de peça flutuando — conta e avisa */
    var suportes = [];
    arr(estado && estado.caixas).forEach(function (c) {
      if (!c || (c.tipo !== "laje" && c.tipo !== "viga" && c.tipo !== "parede")) return;
      var topo = num(c.cy, 0) + num(c.altura, 0) / 2; if (!(topo <= H0 + 0.05 && topo >= H0 - 1.5)) return;
      var th = num(c.rotY, 0), sp = { tipo: c.tipo, id: c.id, topo: topo, cx: num(c.cx, 0), cz: num(c.cz, 0), ux: Math.cos(th), uz: -Math.sin(th), hx: num(c.comprimento, 0) / 2, hz: num(c.espessura, 0) / 2 };
      if (c.tipo === "laje" && arr(c.contorno).length >= 3) sp.poli = c.contorno.map(function (q) { return [num(q.x, 0), num(q.z, 0)]; });
      suportes.push(sp);
    });
    function apoioEm(x, z) {
      var melhor = null;
      suportes.forEach(function (sp) {
        var dentroS;
        if (sp.poli) dentroS = T.dentro([x, z], sp.poli);
        else { var rx = x - sp.cx, rz = z - sp.cz, lx = rx * sp.ux + rz * sp.uz, lz = -rx * sp.uz + rz * sp.ux; dentroS = Math.abs(lx) <= sp.hx + 0.02 && Math.abs(lz) <= sp.hz + 0.02; }
        if (dentroS && (!melhor || sp.topo > melhor.topo + 1e-6 || (Math.abs(sp.topo - melhor.topo) <= 1e-6 && sp.tipo === "laje"))) melhor = sp;   /* empate: a laje (é a que fica em cima da parede) */
      });
      return melhor;
    }
    function dentroSup(sp, x, z) {
      if (sp.poli) return T.dentro([x, z], sp.poli);
      var rx = x - sp.cx, rz = z - sp.cz, lx = rx * sp.ux + rz * sp.uz, lz = -rx * sp.uz + rz * sp.ux;
      return Math.abs(lx) <= sp.hx + 0.02 && Math.abs(lz) <= sp.hz + 0.02;
    }
    function lajeSobre(w) { return suportes.some(function (sp) { return sp.tipo === "laje" && sp.topo >= w.topo - 0.02 && dentroSup(sp, w.cx, w.cz); }); }
    var semApoio = 0;
    function pontalete(x, z, yTopo, extra) {
      var sp = apoioEm(x, z);
      if (!sp) { semApoio++; return null; }
      if (yTopo - sp.topo < 0.12) return true;   /* a terça já está na altura do apoio: apoia direto (sem peça) */
      var ex = { apoio: sp.tipo, apoioId: sp.id }; Object.keys(extra || {}).forEach(function (k) { ex[k] = extra[k]; });
      return pc("pontalete", [x, sp.topo, z], [x, yTopo, z], H3, SEC.pontalete, ex);
    }
    /* ---- os planos */
    function yEm(x, z) { var y = T.alturaEm(t, x, z); return y == null ? null : y; }
    var hTesV = M.tesoura ? (mat === "aco" ? sTes.h : (Tlen >= 0 ? SEC.perna.h : 0)) : 0;
    /* a seção da perna depende do vão da tesoura (o maior vão manda) */
    var vaoTes = 0;
    grupos.forEach(function (G) { G.linhas.forEach(function (L) { cordasT(P, Math.min(G.tmax - 1e-6, Math.max(G.tmin + 1e-6, L.t)), G.d, G.td).forEach(function (c) { vaoTes = Math.max(vaoTes, c[1] - c[0]); }); }); });
    var sViga = M.viga ? perfAco(PADRAO.aco.perfilViga) : null, sPilar = M.viga ? perfAco(PADRAO.aco.perfilPilar) : null;
    if (M.viga && (!sViga || !sPilar)) return { ok: false, avisos: ["Perfil da viga/pilar fora do catálogo (js/perfisaco.js)."] };
    /* o porquê da tesoura no lugar do modelo de terça que a telha usaria (sem apoio embaixo para os pontaletes) */
    if (M.tesoura && mat === "madeira" && tel) {
      var m00 = modeloSugerido0(t.tipoId, t);
      if (MODELOS[m00] && !MODELOS[m00].tesoura && !suportes.some(function (sp) { return sp.tipo !== "parede"; }))
        avisos.push("Modelo com tesoura no lugar de \"" + MODELOS[m00].rotulo + "\": embaixo deste telhado não há laje nem viga para os pontaletes — a tesoura vence o vão apoiada só nas paredes.");
    }
    if (M.viga) {
      prem.push("Viga W " + PADRAO.aco.perfilViga + " e pilar " + PADRAO.aco.perfilPilar + " ADOTADOS — VALOR DE PARTIDA, confirmar no cálculo da Metálica");
      var tb0 = tesouraBaixa(t);
      if (tb0) avisos.push("Viga W de alma cheia no lugar da tesoura: com " + virg(num(t.aguasCalc[0] && t.aguasCalc[0].inclinacao, 0), 1) + " % a tesoura triangular teria " + virg(tb0.h * 100, 0) + " cm de altura no vão de " + virg(tb0.vao) + " m (mínimo vão/12 = " + virg(tb0.min * 100, 0) + " cm) — as vigas apoiam nas paredes e em pilares na cumeeira.");
    }
    var sPerna = M.viga ? sViga : (mat === "aco" ? sTes : (vaoTes >= 8 - 1e-6 ? SEC.perna16 : SEC.perna));
    if (M.tesoura) {
      hTesV = sPerna.h;
      if (mat !== "aco") { usar("perna", sPerna); usar("linha", SEC.linha); usar("pendural", SEC.pendural); if (vaoTes >= 4 - 1e-6) usar("escora", SEC.escora); if (vaoTes >= 7 - 1e-6) usar("montante", SEC.montante); }
    }
    var baseT = hTesV * f0;                         /* fundo das terças acima do plano (vertical) */
    var baseC = baseT + sT.h * f0;                  /* fundo dos caibros */
    var baseR = baseC + (sC ? sC.h * f0 : 0);       /* fundo das ripas */
    var baseTel = baseR + (sR ? sR.h * f0 : 0);     /* fundo da telha */
    if (!sC) baseTel = baseC;
    /* SHINGLE: base contínua de OSB sobre os caibros (a subcobertura é uma manta, sem espessura no desenho) */
    var eOSB = 0, placas = [];
    if (M.osb) {
      var bOsb = tel && tel.base && tel.base.osb ? tel.base : { espessuraM: 0.0111, espessuraPartida: true, fonte: null, texto: "base contínua de OSB" };
      eOSB = bOsb.espessuraM;
      prem.push("Base de OSB e = " + virg(eOSB * 1000, 1) + " mm — " + (bOsb.espessuraPartida ? "VALOR DE PARTIDA — conferir (o catálogo da telha pede " + bOsb.texto + ", sem a espessura)" : bOsb.fonte));
      baseTel = baseR + eOSB * f0;
    }
    /* T3 (20/10/2026): as camadas pelo plano da PRÓPRIA água. A seção é perpendicular ao plano: a altura vertical de cada
       camada é h · √(1 + i²) da água em que ela está. Com o fator da água principal (f0) em todas, a água de inclinação
       diferente ficava com a camada descolada (ou entrando na de baixo) alguns mm — 4 águas de 30/45/35/60 %: até 8 mm. */
    function camadasDe(f) {
      var bT = hTesV * f, bC = bT + sT.h * f, bR = bC + (sC ? sC.h * f : 0), bTel = bR + (sR ? sR.h * f : 0);
      if (!sC) bTel = bC;
      if (M.osb) bTel = bR + eOSB * f;
      return { tercas: bT, caibros: bC, ripas: bR, telha: bTel };
    }
    var pfT = tel && tel.perfil ? tel.perfil : { passo: 0.2, altura: 0.04, esp: 0.01, partida: true };
    var espTel = (pfT.altura + (tel && tel.familia === "sanduiche" ? num(tel.nucleoMm, 30) / 1000 : pfT.esp)) * f0;
    var espPacote = r4(baseTel + espTel + 0.04);   /* + a cumeeira da telha (o "V" de geometria sobe até 3 cm acima do topo da telha) */
    function pc(papel, a, b, up, sec, extra) {
      var o = { p: papel, a: rr(a), b: rr(b), up: rr(up), w: sec.w != null ? sec.w : sec.b, h: sec.h, forma: sec.forma || "ret", mat: sec.forma === "ue" || sec.forma === "w" ? "aco" : "madeira" };
      if (sec.dims) o.dims = sec.dims;
      if (sec.nome) o.perfil = sec.nome;
      o.L = r4(ln3(s3(b, a)));
      if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
      pecas.push(o); return o;
    }
    var UPV = [0, 1, 0], H3 = [d0[0], 0, d0[1]];
    function upNoPlano(ax) { var Y = [0, 1, 0], a = nz3(ax); return nz3(s3(Y, [a[0] * a[1], a[1] * a[1], a[2] * a[1]])); }
    /* T3 (20/10/2026): o MONTANTE lateral da tesoura de madeira são DOIS sarrafos 2,5×5 (SINAPI, Anexos 05–10: "montantes 2 pc
       2,5x5"), um de cada lado da linha e da perna, pregados nelas — não uma peça 5×5 no eixo. Cada sarrafo vai do pé da linha
       (yPe) ao topo da perna (o plano + a altura vertical da perna nesta água), encostado na face lateral (meia largura da
       linha/perna + meia espessura do sarrafo). Hx = o sentido da tesoura (horizontal); lado = a normal ao plano dela. */
    var nMont = 0;
    function montanteSarrafos(p2, yPe, yPerna, Hx, lado, idT) {
      var sm = SEC.montante, ag = null;
      ags.forEach(function (a) { if (!ag && arr(a.pecas).some(function (pq) { return T.dentro(p2, pq.pts.map(function (q) { return [q.x, q.z]; })); })) ag = a; });
      var fP = ag ? sistemaDe(ag).f : f0, yTopo = yPerna + sPerna.h * fP, lg = nz3(lado), off = Math.max(SEC.linha.b, sPerna.w != null ? sPerna.w : sPerna.b) / 2 + sm.b / 2;
      /* revisor T3 (20/10/2026): o topo do sarrafo é RETO (horizontal), ele tem sm.h de largura no sentido da tesoura e fica a
         `off` do eixo dela; com o topo = o topo da perna NO EIXO, o canto mais baixo do topo da perna (o lado de baixo da água, e
         na tesoura de canto o lado de fora do espigão) ficava abaixo do sarrafo — ele entrava na terça que apoia ali (4 águas
         30/45/35/60 %: 8 mm; L e U: até 18 mm). O topo de CADA sarrafo = o menor topo da perna nos 4 cantos dele. */
      function topoEm(x, z) {
        var y = yEm(x, z); if (y == null) return null;
        var a = null; ags.forEach(function (q) { if (!a && arr(q.pecas).some(function (pq) { return T.dentro([x, z], pq.pts.map(function (r) { return [r.x, r.z]; })); })) a = q; });
        return y + sPerna.h * (a ? sistemaDe(a).f : fP);
      }
      var hx = Math.sqrt(Hx[0] * Hx[0] + Hx[2] * Hx[2]), Hn = hx > 1e-9 ? [Hx[0] / hx, Hx[2] / hx] : [0, 0];
      function topoDe(k) {
        var cx = p2[0] + lg[0] * off * k, cz = p2[1] + lg[2] * off * k, y = yTopo;
        [-1, 1].forEach(function (i) { [-1, 1].forEach(function (j) {
          var yc = topoEm(cx + lg[0] * sm.b / 2 * i + Hn[0] * sm.h / 2 * j, cz + lg[2] * sm.b / 2 * i + Hn[1] * sm.h / 2 * j);
          if (yc != null && yc < y) y = yc;
        }); });
        return y;
      }
      nMont++;
      [-1, 1].forEach(function (k) {
        /* a seção vai de 0 a h no sentido de Hx: recua meia altura para o sarrafo ficar centrado no ponto da escora */
        var x = p2[0] + lg[0] * off * k - Hx[0] * sm.h / 2, z = p2[1] + lg[2] * off * k - Hx[2] * sm.h / 2;
        pc("montante", [x, yPe, z], [x, topoDe(k), z], Hx, sm, { tesoura: idT, montante: idT + ":m" + nMont, lado: k });
      });
    }
    /* T5 (20/10/2026) — QUE PAREDE ANEXA O TOPO AO TELHADO. O defeito (Casa 487, print_24): o telhado da garagem encostado
       no caixote (paredes mais altas) rebaixou a lateral do caixote até o plano da telha — a parede só encostava no oitão.
       Regra: só anexa a parede que está SOB a projeção do telhado (o plano existe no eixo dela, ou meia espessura para
       dentro — o oitão sem beiral) e cujo topo NÃO passa por cima do telhado: topo > o plano mais alto ao longo dela + o
       pacote (estrutura + telha) = a parede sobe acima da telha em todo o comprimento (caixote, platibanda, oitão mais
       alto) — essa nunca é rebaixada; no máximo o telhado para nela (rufo e contrarrufo do js/bimcobertura.js). O
       interruptor da parede ("Anexar ao telhado": Automático/Sim/Não) manda: Não = nunca; Sim = o js/bimarq.js anexa. */
    function anexaOk(w) {
      if (w.modo === "nao") return false;
      var ys = planoNaParede(T, t, w);
      return ys.length > 0 && !(w.topo > Math.max.apply(null, ys) + Math.max(0.10, espPacote));
    }
    /* ---- 1) as linhas de apoio: tesoura, parede ou pontalete */
    var apoios = [];   /* { t, tipo:"tesoura"|"parede"|"pontalete", parede? } */
    var nTes = 0, tesVaos = [];
    grupos.forEach(function (G) { G.linhas.forEach(function (L) {
      var pw = paredeNaLinha(L.t, G), tj = L.t, tipo, tmin = G.tmin;
      if (M.tesoura) {
        /* modelo de tesoura: nas PONTAS com parede (oitão), a parede apoia; no meio, tesoura (a parede de dentro para na cota de apoio) */
        if (L.ponta && pw) { tipo = "parede"; tj = pw.tw; } else tipo = "tesoura";
      } else {
        if (pw) { tipo = "parede"; tj = pw.tw; } else tipo = mat === "aco" ? "tesoura" : "pontalete";
      }
      /* ponta sem parede: a tesoura/pontalete entra um pouco (meia seção) para ficar sob o telhado */
      if (L.ponta && tipo !== "parede") tj = L.t + (tj <= tmin + 1e-9 ? 1 : -1) * 0.5 * (sPerna.w || sPerna.b || 0.06);
      if (pw && tipo === "parede" && anexaOk(pw.w)) anexar[String(pw.w.id)] = 1;   /* T5: a parede que passa por cima apoia (terça chumbada), não é rebaixada */
      /* int = os trechos (em s, ao longo de G.d) em que a linha tem estrutura de verdade — a terça só conta apoio ali */
      apoios.push({ t: tj, tipo: tipo, parede: pw ? pw.w.id : null, ponta: L.ponta, G: G, int: tipo === "tesoura" ? [] : (tipo === "parede" ? trechosParede(tj, G) : [[-Infinity, Infinity]]) });
    }); });
    /* ---- 2) as tesouras (perfil do telhado ao longo da linha) */
    var tesBaixa = null, nMeias = 0, semCorda = 0;
    function sistemaDe0(ag) { var p = ag.plano || {}, s = Math.sqrt((p.bx || 0) * (p.bx || 0) + (p.bz || 0) * (p.bz || 0)); return s > 1e-6 ? { d: [p.bx / s, p.bz / s] } : null; }
    apoios.forEach(function (Ap) {
      /* no modelo de tesoura, a linha de apoio que é PAREDE (oitão) recebe só as pernas/banzo de cima, sobre a alvenaria
         (calço das terças — a parede morre no plano, embaixo delas) */
      var soPernas = Ap.tipo === "parede" && M.tesoura;
      if (Ap.tipo !== "tesoura" && !soPernas) return;
      /* a corda é pedida um fio para DENTRO do contorno: na linha exatamente sobre a aresta (o oitão no eixo da parede)
         o cordasT é semiaberto e devolvia vazio só de um lado — esse oitão ficava sem as pernas e as terças voavam
         0,17 m acima da parede (revisor T1, 20/10/2026) */
      var G = Ap.G, dG = G.d, tdG = G.td;
      var tq = Math.min(G.tmax - 1e-6, Math.max(G.tmin + 1e-6, Ap.t));
      cordasT(P, tq, dG, tdG).forEach(function (ch) {
        var c0 = ch[0], c1 = ch[1]; if (!(c1 - c0 > 0.6)) return;
        function pt2(s) { return [dG[0] * s + tdG[0] * Ap.t, dG[1] * s + tdG[1] * Ap.t]; }
        /* quebras: as pontas e onde a linha cruza a borda de uma água */
        var qs = [c0, c1];
        arr(t.aguasCalc).forEach(function (ag) { arr(ag.pecas).forEach(function (pq) {
          var Q = pq.pts; for (var i = 0; i < Q.length; i++) {
            var A = [Q[i].x, Q[i].z], B = [Q[(i + 1) % Q.length].x, Q[(i + 1) % Q.length].z];
            var ta = tdG[0] * A[0] + tdG[1] * A[1] - Ap.t, tb = tdG[0] * B[0] + tdG[1] * B[1] - Ap.t;
            if ((ta < 0) === (tb < 0) || Math.abs(ta - tb) < 1e-12) continue;
            var kk = ta / (ta - tb), X = [A[0] + kk * (B[0] - A[0]), A[1] + kk * (B[1] - A[1])], sx = dG[0] * X[0] + dG[1] * X[1];
            if (sx > c0 + 0.02 && sx < c1 - 0.02) qs.push(sx);
          }
        }); });
        qs.sort(function (a, b) { return a - b; });
        var Qall = []; qs.forEach(function (s) { if (!Qall.length || s - Qall[Qall.length - 1] > 0.02) Qall.push(s); });
        /* os trechos da corda dentro de águas DESTE grupo: a corda inteira = tesoura; o trecho que sai da parede e para num
           espigão/rincão = MEIA-TESOURA (a ponta de cima fica sobre a tesoura de canto daquela linha) */
        function noGrupo(sm) { var pm = pt2(sm); return G.aguas.some(function (ag) { return arr(ag.pecas).some(function (pq) { return T.dentro(pm, pq.pts.map(function (q) { return [q.x, q.z]; })); }); }); }
        var trechos = [], cur = null;
        for (var i8 = 0; i8 + 1 < Qall.length; i8++) {
          var dentroG = noGrupo((Qall[i8] + Qall[i8 + 1]) / 2);
          if (dentroG) { if (!cur) { cur = [i8, i8 + 1]; trechos.push(cur); } else cur[1] = i8 + 1; } else cur = null;
        }
        trechos.forEach(function (tr) {
        var Qs = Qall.slice(tr[0], tr[1] + 1), s0 = Qs[0], s1 = Qs[Qs.length - 1];
        var aParede = Math.abs(s0 - c0) < 0.03, bParede = Math.abs(s1 - c1) < 0.03, inteira = aParede && bParede;
        if (!aParede && !bParede) { semCorda++; return; }
        if (s1 - s0 < 0.3) return;
        var Y = Qs.map(function (s) { var p = pt2(s), y = yEm(p[0], p[1]); return y == null ? H0 : y; });
        /* tira quebra colinear */
        var S2 = [Qs[0]], Y2 = [Y[0]];
        for (var i2 = 1; i2 < Qs.length - 1; i2++) {
          var sl1 = (Y[i2] - Y2[Y2.length - 1]) / (Qs[i2] - S2[S2.length - 1]), sl2 = (Y[i2 + 1] - Y[i2]) / (Qs[i2 + 1] - Qs[i2]);
          if (Math.abs(sl1 - sl2) > 1e-4) { S2.push(Qs[i2]); Y2.push(Y[i2]); }
        }
        S2.push(Qs[Qs.length - 1]); Y2.push(Y[Y.length - 1]);
        Ap.int.push([s0 - 0.05, s1 + 0.05]);
        var meia = !inteira && !soPernas;
        if (meia) nMeias++;
        if (!soPernas && inteira) {
          nTes++; tesVaos.push(s1 - s0);
          /* (revisor T1, 20/10/2026) tesoura METÁLICA baixa: com 8 % num vão de 8 m o pico fica a 32 cm da linha — a treliça
             não trabalha. Altura mínima de PARTIDA = vão/12 (a proporção usual de projeto do js/metalporticos.js: treliça com
             altura ≈ vão/12 a vão/15 — não é cálculo; o cálculo da Metálica confirma) */
          if (mat === "aco" && !M.viga) {
            var hPico = Math.max.apply(null, Y2) - H0, hMin = (s1 - s0) / 12;
            if (hPico < hMin - 1e-6 && (!tesBaixa || hPico / (s1 - s0) < tesBaixa.h / tesBaixa.v)) tesBaixa = { h: hPico, v: s1 - s0, min: hMin };
          }
        }
        var idT = soPernas ? "oitao-" + r4(Ap.t) : (meia ? "mt" + nMeias : "tes" + nTes), secL = mat === "aco" ? sTes : SEC.linha, secPd = mat === "aco" ? sDg : SEC.pendural, secE = mat === "aco" ? sDg : SEC.escora, secM = mat === "aco" ? sDg : SEC.montante;
        function P3(s, y) { var p = pt2(s); return [p[0], y, p[1]]; }
        var hL = secL.h, yL = H0;
        var papP = M.viga ? "viga-aco" : (mat === "aco" ? "banzo" : "perna");
        if (!soPernas && !M.viga) pc(mat === "aco" ? "banzo-inferior" : "linha", P3(s0, yL), P3(s1, yL), UPV, secL, { tesoura: idT });
        for (var j = 0; j + 1 < S2.length; j++) {
          var A3 = P3(S2[j], Y2[j]), B3 = P3(S2[j + 1], Y2[j + 1]);
          if (Math.abs(Y2[j + 1] - Y2[j]) < 1e-6) pc(papP, A3, B3, UPV, sPerna, { tesoura: idT });
          else pc(papP, A3, B3, upNoPlano(s3(B3, A3)), sPerna, { tesoura: idT });
        }
        /* VIGA W: no pico (cumeeira) e na ponta de cima da meia, um PILAR do apoio de baixo (laje, viga, parede — ou o nível) até a viga */
        if (M.viga && !soPernas) {
          for (var m3 = 0; m3 < S2.length; m3++) {
            var pt3 = m3 === 0 || m3 === S2.length - 1;
            if (pt3 && !(meia && ((m3 === 0 && !aParede) || (m3 === S2.length - 1 && !bParede)))) continue;
            if (!pt3 && !(Y2[m3] > Y2[m3 - 1] - 1e-6 && Y2[m3] > Y2[m3 + 1] - 1e-6)) continue;
            var q3 = pt2(S2[m3]), sp3 = apoioEm(q3[0], q3[1]), yb3 = sp3 ? sp3.topo : num(t.elevNivel, 0);
            if (Y2[m3] - yb3 > 0.1) pc("pilar-aco", [q3[0], yb3, q3[1]], [q3[0], Y2[m3], q3[1]], [dG[0], 0, dG[1]], sPilar, { tesoura: idT, apoio: sp3 ? sp3.tipo : "nivel" });
          }
        }
        /* pendurais nos picos (cumeeira) — na meia-tesoura, também na ponta de cima (o encontro com a tesoura de canto) — e
           escoras/montantes nas pernas longas, só para o lado da PAREDE */
        var Hx = [dG[0], 0, dG[1]];
        for (var m2 = 0; !soPernas && !M.viga && m2 < S2.length; m2++) {
          var ponta = m2 === 0 || m2 === S2.length - 1;
          if (ponta && !(meia && ((m2 === 0 && !aParede) || (m2 === S2.length - 1 && !bParede)))) continue;
          if (!ponta && !(Y2[m2] > Y2[m2 - 1] - 1e-6 && Y2[m2] > Y2[m2 + 1] - 1e-6)) continue;
          var sp = S2[m2], yp = Y2[m2];
          if (yp - (yL + hL) < 0.08) continue;
          pc(mat === "aco" ? "pendural-aco" : "pendural", P3(sp, yL + hL), P3(sp, yp), Hx, secPd, { tesoura: idT });
          [-1, 1].forEach(function (lado) {
            if ((lado < 0 && !aParede) || (lado > 0 && !bParede)) return;
            var se = lado < 0 ? S2[0] : S2[S2.length - 1], mm = Math.abs(sp - se);
            if (mm < 2 - 1e-6) return;
            var sm = sp + (se - sp) * 0.5, pm = pt2(sm), ym = yEm(pm[0], pm[1]); if (ym == null) return;
            pc(mat === "aco" ? "diag" : "escora", P3(sp, yL + hL), P3(sm, ym), upNoPlano(s3(P3(sm, ym), P3(sp, yL + hL))), secE, { tesoura: idT });
            if (mm >= 3.5 - 1e-6 && ym - (yL + hL) > 0.08) { if (mat === "aco") pc("montante-aco", P3(sm, yL + hL), P3(sm, ym), Hx, secM, { tesoura: idT }); else montanteSarrafos(pm, yL, ym, Hx, [tdG[0], 0, tdG[1]], idT); }
          });
        }
        });
      });
    });
    /* ---- 2b) TESOURAS DE CANTO (espigão) e de rincão: meia-tesoura na diagonal, da quina da parede até o encontro com a
       cumeeira — é sobre a linha dela que as meias-tesouras das testas e das alas descarregam a ponta de cima */
    var diagonais = [], nDiag = 0;
    if (M.tesoura) arr(t.linhas).forEach(function (ln) {
      if (ln.tipo !== "espigao" && ln.tipo !== "rincao") return;
      var A = [ln.a.x, ln.a.z], B = [ln.b.x, ln.b.z], dx = B[0] - A[0], dz = B[1] - A[1], Ld = Math.sqrt(dx * dx + dz * dz); if (!(Ld > 0.3)) return;
      var ux = dx / Ld, uz = dz / Ld, ks = [0, Ld];
      for (var i = 0; i < P.length; i++) {
        var C = P[i], D = P[(i + 1) % P.length], ex = D[0] - C[0], ez = D[1] - C[1], den = ux * ez - uz * ex; if (Math.abs(den) < 1e-12) continue;
        var wx = C[0] - A[0], wz = C[1] - A[1], tt = (wx * ez - wz * ex) / den, ss = (wx * uz - wz * ux) / den;
        if (ss >= -1e-9 && ss <= 1 + 1e-9 && tt > 0 && tt < Ld) ks.push(tt);
      }
      ks.sort(function (a, b) { return a - b; });
      for (var j = 0; j + 1 < ks.length; j++) {
        var ka = ks[j], kb = ks[j + 1]; if (kb - ka < 0.6) continue;
        var mid = [A[0] + ux * (ka + kb) / 2, A[1] + uz * (ka + kb) / 2]; if (!T.dentro(mid, P)) continue;
        var pa = [A[0] + ux * ka, A[1] + uz * ka], pb = [A[0] + ux * kb, A[1] + uz * kb], ya = yEm(pa[0], pa[1]), yb = yEm(pb[0], pb[1]);
        if (ya == null || yb == null) continue;
        if (ya > yb) { var tp = pa; pa = pb; pb = tp; var ty = ya; ya = yb; yb = ty; }   /* pa = a ponta baixa (na quina da parede) */
        nDiag++;
        var idD = (ln.tipo === "espigao" ? "esp" : "rin") + nDiag, secLd = mat === "aco" ? sTes : SEC.linha, hLd = secLd.h;
        var Hd = [pb[0] - pa[0], 0, pb[1] - pa[1]]; Hd = nz3(Hd);
        var A3d = [pa[0], ya, pa[1]], B3d = [pb[0], yb, pb[1]];
        if (M.viga) {
          /* viga W no espigão/rincão, com pilar no encontro com a cumeeira */
          pc("viga-aco", A3d, B3d, upNoPlano(s3(B3d, A3d)), sPerna, { tesoura: idD });
          if (interno(pb)) { var spd = apoioEm(pb[0], pb[1]), ybd = spd ? spd.topo : num(t.elevNivel, 0); if (yb - ybd > 0.1) pc("pilar-aco", [pb[0], ybd, pb[1]], B3d, Hd, sPilar, { tesoura: idD, apoio: spd ? spd.tipo : "nivel" }); }
          diagonais.push({ a: pa, b: pb, tipo: ln.tipo });
          continue;
        }
        pc(mat === "aco" ? "banzo-inferior" : "linha", [pa[0], H0, pa[1]], [pb[0], H0, pb[1]], UPV, secLd, { tesoura: idD });
        pc(mat === "aco" ? "banzo" : "perna", A3d, B3d, upNoPlano(s3(B3d, A3d)), sPerna, { tesoura: idD });
        if (yb - (H0 + hLd) > 0.08 && interno(pb)) pc(mat === "aco" ? "pendural-aco" : "pendural", [pb[0], H0 + hLd, pb[1]], B3d, Hd, mat === "aco" ? sDg : SEC.pendural, { tesoura: idD });
        var Lh = dist2(pa, pb);
        if (Lh >= 2 - 1e-6) {
          var pmd = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2], ymd = yEm(pmd[0], pmd[1]);
          if (ymd != null) {
            pc(mat === "aco" ? "diag" : "escora", [pb[0], H0 + hLd, pb[1]], [pmd[0], ymd, pmd[1]], upNoPlano(s3([pmd[0], ymd, pmd[1]], [pb[0], H0 + hLd, pb[1]])), mat === "aco" ? sDg : SEC.escora, { tesoura: idD });
            if (Lh >= 3.5 - 1e-6 && ymd - (H0 + hLd) > 0.08) { if (mat === "aco") pc("montante-aco", [pmd[0], H0 + hLd, pmd[1]], [pmd[0], ymd, pmd[1]], Hd, sDg, { tesoura: idD }); else montanteSarrafos(pmd, H0, ymd, Hd, [-Hd[2], 0, Hd[0]], idD); }
          }
        }
        diagonais.push({ a: pa, b: pb, tipo: ln.tipo });
      }
    });
    if (M.tesoura && !nTes && !apoios.some(function (a) { return a.tipo === "parede"; })) avisos.push("Nenhuma tesoura coube neste contorno: confira o telhado.");
    if (tesBaixa) avisos.push("Tesoura metálica BAIXA: " + virg(tesBaixa.h * 100, 0) + " cm de altura num vão de " + virg(tesBaixa.v) + " m — abaixo da altura mínima recomendada de " + virg(tesBaixa.min * 100, 0) +
      " cm (vão/12, VALOR DE PARTIDA: proporção usual de projeto, confirmar no cálculo da Metálica). Suba a inclinação para ≥ " + virg(Math.ceil(2 * tesBaixa.min / tesBaixa.v * 1000) / 10, 1) + " % ou use treliça de banzos paralelos/viga de alma cheia.");
    if (semCorda) avisos.push(semCorda + " trecho(s) de linha de tesoura sem parede em nenhuma das pontas (contorno em U fechado, pátio): não gerados — confira o apoio das terças ali.");
    /* ---- 3) terças, caibros, ripas por água */
    var vaoTel = tel && fin(tel.vaoMaxEntreApoios) ? tel.vaoMaxEntreApoios : null, espT, fonteEspT;
    if (!M.caibro) {
      espT = vaoTel != null ? vaoTel : 1.5;
      fonteEspT = vaoTel != null ? "vão máximo da telha " + virg(vaoTel) + " m — " + tel.vaoFonte + (tel.vaoPartida ? " (VALOR DE PARTIDA na carga — conferir)" : "") : "VALOR DE PARTIDA 1,50 m — conferir: a telha não tem vão máximo verificado";
    } else if (tel && fin(tel.tercaMaxM)) { espT = tel.tercaMaxM; fonteEspT = tel.tercaFonte; }
    else { espT = ESPAC.terca.m; fonteEspT = ESPAC.terca.fonte; }
    prem.push("Terças a ≤ " + virg(espT) + " m no plano do telhado — " + fonteEspT);
    var espCb = tel && fin(tel.caibroM) ? tel.caibroM : ESPAC.caibro.m;
    if (sC) prem.push("Caibros a ≤ " + virg(espCb) + " m — " + (tel && fin(tel.caibroM) ? tel.caibroFonte : ESPAC.caibro.fonte));
    var galga = tel && tel.galga && fin(tel.galga.m) ? tel.galga.m : null;
    var galgaMinima = !!(tel && tel.galga && tel.galga.minima && galga != null);   /* a galga do fabricante é a MÍNIMA (não a máxima) */
    if (sR) {
      if (galga == null) { galga = 0.32; prem.push("Galga das ripas 0,32 m — VALOR DE PARTIDA — conferir (eixo de aferição do SINAPI, p. 36; o real é a galga do fabricante da telha)"); }
      else prem.push("Galga das ripas " + virg(galga, 3) + " m — " + (tel.galga.partida ? "VALOR DE PARTIDA — conferir: " : "") + tel.galga.fonte);
    }
    var nCruzRC = 0, nCruzCT = 0, nCruzTA = 0, compRipaPorAgua = [];
    var aguasInfo = [];
    ags.forEach(function (ag, ia) {
      var S = sistemaDe(ag), d = S.d, td = S.td, f = S.f, e = ag.aresta >= 0 ? arr(t.arestasCalc)[ag.aresta] : null;
      var CA = camadasDe(f), baseT = CA.tercas, baseC = CA.caibros, baseR = CA.ripas;   /* T3: as camadas DESTA água */
      arr(ag.pecas).forEach(function (pq) {
        var Q = pq.pts.map(function (q) { return [q.x, q.z]; }); if (Q.length < 3) return;
        var umin = Infinity, umax = -Infinity, tmn = Infinity, tmx = -Infinity;
        Q.forEach(function (q) { var u = d[0] * q[0] + d[1] * q[1], tt = td[0] * q[0] + td[1] * q[1]; if (u < umin) umin = u; if (u > umax) umax = u; if (tt < tmn) tmn = tt; if (tt > tmx) tmx = tt; });
        var uW = e ? d[0] * e.parede.a.x + d[1] * e.parede.a.z : umin;
        if (!(uW > umin - 1e-6)) uW = umin;
        var up = S.n;
        function P3u(u, tt, base) { var x = d[0] * u + td[0] * tt, z = d[1] * u + td[1] * tt; return [x, S.y(x, z) + base, z]; }
        /* terças: a 1ª sobre a linha da parede, a última junto da cumeeira/espigão */
        /* a última terça fica DENTRO da linha da parede de cima: na água de 1 água (ou na que sobe até um oitão) o polígono da
           água passa da parede pelo beiral e a terça ia para o balanço, sem tesoura embaixo */
        var uPmax = -Infinity; P.forEach(function (q) { var uq = d[0] * q[0] + d[1] * q[1]; if (uq > uPmax) uPmax = uq; });
        var wT = sT.w != null ? sT.w : sT.b, ua = uW + wT / 2 / f, ub = Math.min(umax, uPmax) - (wT / 2 + 0.03) / f, tercas = [];
        if (ub - ua > 0.05) {
          var nI = Math.max(1, Math.ceil((ub - ua) * f / espT - 1e-9));
          for (var i = 0; i <= nI; i++) tercas.push(ua + (ub - ua) * i / nI);
        } else tercas.push((uW + umax) / 2);
        var tercaSegs = [];
        tercas.forEach(function (u, iu) {
          cordasU(Q, u, d, td).forEach(function (c) {
            if (c[1] - c[0] < 0.2) return;
            var a = P3u(u, c[0], baseT), b = P3u(u, c[1], baseT);
            var o = mat === "aco" ? pc("terca", a, b, up, sT, { agua: ia, fileira: iu }) : pc("terca", a, b, up, sT, { agua: ia, fileira: iu });
            tercaSegs.push({ u: u, t0: c[0], t1: c[1], o: o });
          });
        });
        /* apoios das terças: cruzamentos com as linhas de apoio (tesoura/parede/pontalete) */
        if (false) tercaSegs.forEach(function (ts) {   /* (substituído pelos grupos de direção: toda água tem as linhas do seu grupo) */
          /* água de outra direção (testa de 4 águas, ala de L): pontaletes ao longo da terça a cada ≤ eixo de apoio, sem as pontas
             (que encostam no espigão/rincão) — a parede que cruza a terça apoia no lugar do pontalete */
          var Lt = ts.t1 - ts.t0, nP = Math.max(1, Math.ceil(Lt / espApoio.m - 1e-9));
          for (var kp = 1; kp < nP || (nP === 1 && kp === 1); kp++) {
            var tp0 = nP === 1 ? (ts.t0 + ts.t1) / 2 : ts.t0 + Lt * kp / nP, top = P3u(ts.u, tp0, baseT);
            if (top[1] - H0 < 0.12) break;
            var naParede = paredes.some(function (w) { return w.topo > H0 - 0.6 && w.base < H0 && trechoNaParede([top[0] - 0.01, top[2]], [top[0] + 0.01, top[2]], w, 0.05); });
            if (!naParede) pontalete(top[0], top[2], top[1], { agua: ia });
            nCruzTA++; ts.o.nAp = (ts.o.nAp || 0) + 1;
            if (nP === 1) break;
          }
        });
        tercaSegs.forEach(function (ts) {
          ts.o.sup = [];
          apoios.forEach(function (Ap) {
            /* a linha de apoio é do grupo de direção da água: só vale para águas paralelas a ela */
            var Gt = Ap.G.td; if (Math.abs(td[0] * Gt[0] + td[1] * Gt[1]) < 0.99) return;
            var tL = td[0] * (Gt[0] * Ap.t) + td[1] * (Gt[1] * Ap.t);
            if (tL < ts.t0 - 1e-6 || tL > ts.t1 + 1e-6) return;
            var top = P3u(ts.u, tL, baseT), x = top[0], z = top[2], yb = top[1] - 0.0, sL = Ap.G.d[0] * x + Ap.G.d[1] * z;
            /* a linha só apoia onde tem estrutura (a meia-tesoura acaba no espigão) */
            if (!Ap.int.some(function (iv) { return sL >= iv[0] && sL <= iv[1]; })) {
              /* linha de PAREDE fora da parede (a ala do L, do U): ali é linha de pontalete, como a linha sem parede */
              if (Ap.tipo !== "parede" || M.tesoura || mat === "aco" || !pontalete(x, z, yb, { agua: ia })) return;
            }
            /* pontalete SEMPRE pelo apoio embaixo: a terça a menos de 12 cm da cota de apoio só "apoia direto" se houver parede, viga
               ou laje ali (revisor 2: a 1 m da parede, sem laje, contava apoio no ar) */
            else if (Ap.tipo === "pontalete" && !pontalete(x, z, yb, { agua: ia })) return;   /* sem apoio embaixo: a terça fica sem esse apoio */
            nCruzTA++; ts.o.nAp = (ts.o.nAp || 0) + 1; ts.o.sup.push([x, z]);   /* em planta: a terça juntada na cumeeira soma os das duas */
          });
          ts.o.tA = ts.t0; ts.o.tB = ts.t1; ts.o.aguaS = { d: d, td: td };
        });
        /* caibros e ripas */
        var nCb = 0, compRipa = 0;
        if (sC) {
          var nC = Math.max(1, Math.ceil((tmx - tmn - sC.b) / espCb - 1e-9));
          for (var ic = 0; ic <= nC; ic++) {
            var tc = tmn + sC.b / 2 + (tmx - tmn - sC.b) * ic / nC;
            cordasT(Q, tc, d, td).forEach(function (c) {
              if (c[1] - c[0] < 0.15) return;
              pc("caibro", P3u(c[0], tc, baseC), P3u(c[1] - 0.01 / f, tc, baseC), up, SEC.caibro, { agua: ia });
              nCb++;
              tercaSegs.forEach(function (ts) { if (ts.u >= c[0] - 1e-6 && ts.u <= c[1] + 1e-6 && tc >= ts.t0 - 1e-6 && tc <= ts.t1 + 1e-6) nCruzCT++; });
            });
          }
          /* testeira na ponta dos caibros, na aresta do beiral desta água */
          if (e && e.define && num(e.beiralM, 0) > 0) {
            var ub0 = umin, cA = cordasU(Q, ub0 + 1e-4, d, td)[0];
            if (cA) {
              var yT = baseC + SEC.caibro.h * f;
              var a3 = P3u(ub0, cA[0], yT), b3 = P3u(ub0, cA[1], yT);
              var dn = [-d[0] * SEC.testeira.b / 2, -d[1] * SEC.testeira.b / 2];
              pc("testeira", [a3[0] + dn[0], a3[1] - SEC.testeira.h / 2, a3[2] + dn[1]], [b3[0] + dn[0], b3[1] - SEC.testeira.h / 2, b3[2] + dn[1]], [d[0], 0, d[1]], { b: SEC.testeira.h, h: SEC.testeira.b }, { agua: ia });
            }
          }
        }
        if (sR) {
          var r0 = umin + 0.03 / f, r1 = umax - (sR.b / 2 + 0.02) / f, nR = Math.max(1, Math.ceil((r1 - r0) * f / galga - 1e-9));
          /* a galga é a distância MÁXIMA: ripas em partes iguais da água. Galga MÍNIMA do fabricante (galgaMinima, ex.: Faulim
             "galga mínima 33 cm"): partes iguais dariam menos que o mínimo e a telha não encaixa — ripas na galga a partir do
             beiral e a última na cumeeira (a fiada de cima é a ajustada, como na obra) (revisor T1, 20/10/2026) */
          var urs = [];
          if (galgaMinima) {
            for (var ug = r0; ug < r1 - 1e-6; ug += galga / f) urs.push(ug);
            if ((r1 - urs[urs.length - 1]) * f < 0.06 && urs.length > 1) urs[urs.length - 1] = r1; else urs.push(r1);
          }
          else for (var ir = 0; ir <= nR; ir++) urs.push(r0 + (r1 - r0) * ir / nR);
          urs.forEach(function (ur) {
            cordasU(Q, ur, d, td).forEach(function (c) {
              if (c[1] - c[0] < 0.1) return;
              pc("ripa", P3u(ur, c[0], baseR), P3u(ur, c[1], baseR), up, sR, { agua: ia });
              compRipa += c[1] - c[0];
              nCruzRC += Math.max(1, Math.round((c[1] - c[0]) / espCb) + 1);
            });
          });
        }
        if (M.osb) placas.push({ agua: ia, pts: Q.map(function (q) { return [r4(q[0]), r4(q[1])]; }), base: r4(baseR), e: eOSB });
        compRipaPorAgua.push(compRipa);
        /* nTercas = as fileiras de terça MODELADAS nesta água (a fixação da telha em chapa conta por elas) */
        aguasInfo.push({ agua: ia, umin: umin, umax: umax, uW: uW, tmin: tmn, tmax: tmx, rampa: (umax - umin) * f, nCaibros: nCb, nTercas: tercas.length });
      });
    });
    /* ---- 3b) (revisor T1, 20/10/2026) a CUMEEIRA levava DUAS terças (a última de cada água, a 12 cm uma da outra) e dois
       pontaletes embaixo: a terça de cumeeira é UMA, no meio, e o pontalete também. Junta terças paralelas, sobrepostas, a
       menos de 0,30 m em planta e 0,15 m em altura; depois, pontaletes a menos de 0,30 m. */
    (function dedupe() {
      var ter = pecas.filter(function (o) { return o.p === "terca"; }), fora = [];
      function dir(o) { var v = s3(o.b, o.a), l = ln3(v); return [v[0] / l, v[1] / l, v[2] / l]; }
      for (var i = 0; i < ter.length; i++) {
        var A = ter[i]; if (fora.indexOf(A) >= 0) continue;
        for (var j = i + 1; j < ter.length; j++) {
          var B = ter[j]; if (fora.indexOf(B) >= 0) continue;
          var da = dir(A), db = dir(B), cs = dt3(da, db); if (Math.abs(cs) < 0.999) continue;
          var Ba = cs > 0 ? B.a : B.b, Bb = cs > 0 ? B.b : B.a;
          /* distância em planta e em altura da linha B à linha A, e a sobreposição ao longo do eixo */
          var w = s3(Ba, A.a), ta = dt3(w, da), pr = ad3(A.a, da, ta), off = s3(Ba, pr);
          var dPl = Math.sqrt(off[0] * off[0] + off[2] * off[2]), dY = Math.abs(off[1]);
          var tb = dt3(s3(Bb, A.a), da), lo = Math.max(0, Math.min(ta, tb)), hi = Math.min(A.L, Math.max(ta, tb));
          if (dPl > 0.30 || dY > 0.15 || hi - lo < 0.3) continue;
          var meio = [off[0] / 2, off[1] / 2, off[2] / 2], t0 = Math.min(0, ta, tb), t1 = Math.max(A.L, ta, tb);
          A.a = rr(ad3(ad3(A.a, da, t0), meio)); A.b = rr(ad3(ad3(A.a, da, 0), da, t1 - t0)); A.L = r4(t1 - t0);
          A.up = rr(nz3(ad3(A.up, B.up))); A.nAp = Math.max(A.nAp || 0, B.nAp || 0); A.cumeeira = true;
          if (A.sup || B.sup) A.sup = arr(A.sup).concat(arr(B.sup));
          fora.push(B);
        }
      }
      /* pendural/montante no MESMO ponto (a ponta da meia-tesoura encontra o pendural da tesoura inteira ou da de canto): um só */
      var ver = pecas.filter(function (o) { return /^(pendural|montante)/.test(o.p); });
      for (var v1 = 0; v1 < ver.length; v1++) {
        var V1 = ver[v1]; if (fora.indexOf(V1) >= 0) continue;
        for (var v2 = v1 + 1; v2 < ver.length; v2++) {
          var V2 = ver[v2]; if (fora.indexOf(V2) >= 0) continue;
          /* T3: os dois sarrafos do mesmo montante ficam (um de cada lado); sarrafo × sarrafo só junta com o do MESMO lado */
          if (V1.montante && V2.montante && (V1.montante === V2.montante || V1.lado !== V2.lado)) continue;
          if (Math.sqrt(Math.pow(V1.a[0] - V2.a[0], 2) + Math.pow(V1.a[2] - V2.a[2], 2)) > 0.12) continue;
          /* sarrafo no lugar de um pendural 6×12: o pendural já faz a peça — o sarrafo sai */
          if (!!V1.montante !== !!V2.montante) { fora.push(V1.montante ? V1 : V2); if (V1.montante) break; continue; }
          var yb1 = Math.min(V1.a[1], V2.a[1]), yt1 = Math.max(V1.b[1], V2.b[1]);
          if (V2.tesoura && /^tes/.test(V2.tesoura) && !/^tes/.test(String(V1.tesoura))) { V1.tesoura = V2.tesoura; V1.p = V2.p; }
          V1.a = rr([V1.a[0], yb1, V1.a[2]]); V1.b = rr([V1.a[0], yt1, V1.a[2]]); V1.L = r4(yt1 - yb1);
          fora.push(V2);
        }
      }
      var pon = pecas.filter(function (o) { return o.p === "pontalete"; });
      for (var k = 0; k < pon.length; k++) {
        var P1 = pon[k]; if (fora.indexOf(P1) >= 0) continue;
        for (var q = k + 1; q < pon.length; q++) {
          var P2 = pon[q]; if (fora.indexOf(P2) >= 0) continue;
          if (Math.sqrt(Math.pow(P1.a[0] - P2.a[0], 2) + Math.pow(P1.a[2] - P2.a[2], 2)) > 0.30) continue;
          var mx = (P1.a[0] + P2.a[0]) / 2, mz = (P1.a[2] + P2.a[2]) / 2, yb0 = Math.max(P1.a[1], P2.a[1]), yt0 = (P1.b[1] + P2.b[1]) / 2;
          P1.a = rr([mx, yb0, mz]); P1.b = rr([mx, yt0, mz]); P1.L = r4(yt0 - yb0);
          fora.push(P2);
        }
      }
      if (fora.length) for (var r = pecas.length - 1; r >= 0; r--) if (fora.indexOf(pecas[r]) >= 0) pecas.splice(r, 1);
      /* os apoios das terças contam pelas terças que ficaram (a ligação terça Ue × apoio é dinheiro) */
      nCruzTA = 0; pecas.forEach(function (o) { if (o.p === "terca") { nCruzTA += o.nAp || 0; delete o.nAp; } });
    })();
    /* ---- 4) espigão e rincão (as linhas do telhado entre águas), na altura das terças */
    arr(t.linhas).forEach(function (ln) {
      if (ln.tipo !== "espigao" && ln.tipo !== "rincao") return;
      /* T3: na altura das terças das águas que ele separa (a menor das duas — inclinações diferentes, bases diferentes) */
      var bE = null; arr(ln.aguas).forEach(function (k) { var ag = arr(t.aguasCalc)[k], p = ag && ag.plano; if (!p || Math.sqrt(p.bx * p.bx + p.bz * p.bz) < 1e-6) return; var b0 = camadasDe(sistemaDe(ag).f).tercas; if (bE == null || b0 < bE) bE = b0; });
      if (bE == null) bE = baseT;
      var a = [ln.a.x, ln.a.y + bE, ln.a.z], b = [ln.b.x, ln.b.y + bE, ln.b.z];
      if (ln3(s3(b, a)) < 0.3) return;
      pc(ln.tipo, a, b, upNoPlano(s3(b, a)), mat === "aco" ? sT : SEC.espigao, {});
    });
    if (mat !== "aco" && arr(t.linhas).some(function (l) { return l.tipo === "espigao" || l.tipo === "rincao"; })) usar("espigao", SEC.espigao);
    /* modelo de terça (sem tesoura): o espigão/rincão, que recebe as pontas das terças, desce em pontaletes a cada ≤ eixo de apoio */
    if (!M.tesoura) pecas.filter(function (o) { return o.p === "espigao" || o.p === "rincao"; }).forEach(function (o) {
      var Lp = dist2([o.a[0], o.a[2]], [o.b[0], o.b[2]]), nP = Math.max(1, Math.ceil(Lp / espApoio.m - 1e-9));
      for (var k5 = 1; k5 <= nP; k5++) {
        var f5 = nP === 1 ? 0.5 : k5 / nP; if (nP > 1 && k5 === nP) break;
        var x5 = o.a[0] + (o.b[0] - o.a[0]) * f5, z5 = o.a[2] + (o.b[2] - o.a[2]) * f5, y5 = o.a[1] + (o.b[1] - o.a[1]) * f5;
        pontalete(x5, z5, y5, { linha: o.p });
      }
    });
    /* ---- 4b) TODA terça tem apoio: os apoios dela (linhas com estrutura), as pontas sobre espigão/rincão (tesoura de canto ou
       pontaletes) e sobre parede; o vão entre apoios ≤ o eixo de apoio (+ 0,35 m) e o balanço da ponta ≤ 0,70 m (o beiral) */
    var linhasDiag = arr(t.linhas).filter(function (l) { return l.tipo === "espigao" || l.tipo === "rincao"; }).map(function (l) { return [[l.a.x, l.a.z], [l.b.x, l.b.z]]; });
    /* o balanço da terça na ponta (o beiral lateral do oitão): até 0,70 m, ou o beiral escolhido + 10 cm */
    var balMax = Math.max(0.70, arr(t.arestasCalc).reduce(function (m, e) { return Math.max(m, num(e.beiralM, num(t.beiralEf, 0))); }, 0) + 0.10);
    var tercasSemApoio = 0, piorVao = 0;
    pecas.forEach(function (o) {
      if (o.p !== "terca" || !o.sup) return;
      var pA = [o.a[0], o.a[2]], pB = [o.b[0], o.b[2]], S = o.aguaS, sup = o.sup.map(function (q) { return S.td[0] * q[0] + S.td[1] * q[1]; });
      function pontaApoiada(q) {
        if (linhasDiag.some(function (sg) { return distSegP(q, sg[0], sg[1]) < 0.15; })) return true;
        return paredes.some(function (w) { return w.topo > H0 - 0.6 && w.base < H0 && !lajeSobre(w) && trechoNaParede([q[0] - 0.01, q[1]], [q[0] + 0.01, q[1]], w, 0.08); });
      }
      var tA = S.td[0] * pA[0] + S.td[1] * pA[1], tB = S.td[0] * pB[0] + S.td[1] * pB[1], lo = Math.min(tA, tB), hi = Math.max(tA, tB);
      if (pontaApoiada(pA)) sup.push(tA); if (pontaApoiada(pB)) sup.push(tB);
      sup.sort(function (a, b) { return a - b; });
      var ok = sup.length >= (hi - lo > 0.8 ? 2 : 1);
      if (ok) {
        if (sup[0] - lo > balMax + 1e-6 || hi - sup[sup.length - 1] > balMax + 1e-6) ok = false;
        for (var i = 1; i < sup.length; i++) { var gp = sup[i] - sup[i - 1]; if (gp > piorVao) piorVao = gp; if (gp > espApoio.m + 0.35) ok = false; }
      }
      if (!ok) { tercasSemApoio++; o.semApoio = true }
      delete o.sup; delete o.tA; delete o.tB; delete o.aguaS;
    });
    if (semApoio) avisos.push(semApoio + " pontalete(s) NÃO gerado(s): não há laje, viga nem parede embaixo (cota de apoio " + virg(H0) + " m). Lance a laje/forro estrutural sob o telhado (ou use o modelo com tesoura) — essas terças estão sem esse apoio.");
    if (tercasSemApoio) avisos.push(tercasSemApoio + " terça(s) SEM apoio a cada ≤ " + virg(espApoio.m) + " m (ou com balanço na ponta maior que o beiral + 10 cm): confira e lance o apoio delas.");
    /* ---- 5) paredes que anexam o topo: as dos oitões (sempre) e, no modelo de terça, todas as de baixo */
    paredes.forEach(function (w) {
      if (w.base >= H0 - 1e-6 || w.topo < H0 - 0.6) return;
      var dentroP = T.dentro ? T.dentro([w.cx, w.cz], P) : true;
      var pertoOitao = arr(t.arestasCalc).some(function (e) {
        if (e.define) return false;
        var a = [e.parede.a.x, e.parede.a.z], b = [e.parede.b.x, e.parede.b.z], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.sqrt(dx * dx + dz * dz); if (!(L > 0)) return false;
        var par = Math.abs((dx / L) * w.uz - (dz / L) * w.ux) < 0.05, dl = Math.abs(((w.cx - a[0]) * dz - (w.cz - a[1]) * dx) / L);
        return par && dl <= Math.max(0.35, w.e);
      });
      if ((pertoOitao || (!M.tesoura && dentroP)) && anexaOk(w)) anexar[String(w.id)] = 1;
    });
    /* ---- 5b) T5 (20/10/2026): ids ESTÁVEIS das peças e as EDIÇÕES DE PEÇA (t.sobrepor) */
    var ed = aplicarSobreposicoes(t, pecas, { perfAco: perfAco, ags: ags, espT: espT, espCb: sC ? espCb : null, M: M });
    pecas = ed.pecas;
    ed.avisos.forEach(function (a) { avisos.push(a); });
    /* ---- 6) a platibanda: nada passa do topo dela */
    var maxY = -Infinity; pecas.forEach(function (o) { maxY = Math.max(maxY, o.a[1] + o.h, o.b[1] + o.h); });
    var camAg = ags.map(function (ag) { var c = camadasDe(sistemaDe(ag).f); return { tercas: r4(c.tercas), caibros: r4(c.caibros), ripas: r4(c.ripas), telha: r4(c.telha) }; });
    var espMax = espPacote; camAg.forEach(function (c, k) { espMax = Math.max(espMax, c.telha + espTel / f0 * sistemaDe(ags[k]).f + 0.04); });
    var topoTelha = num(t.cotaCumeeira, H0) + espMax; maxY = Math.max(maxY, topoTelha);
    var tp = topoPlatibanda(t, opc.ctxCob, espPacote);
    if (tp != null && maxY > tp + 1e-6) avisos.push("A cobertura (estrutura + telha) chega a " + virg(maxY) + " m e passa do topo da platibanda (" + virg(tp) + " m): suba a platibanda ou diminua a inclinação — o telhado embutido não pode aparecer.");
    /* ---- 7) quantitativo (lista de material) */
    var Q = quantDoPacote(t, M, tel, pecas, { sR: sR, sC: sC, sPerna: sPerna, nMeias: nMeias, nDiag: nDiag, espT: espT, espCb: espCb, galga: galga, nCruzRC: nCruzRC, nCruzCT: nCruzCT, nCruzTA: nCruzTA, nTes: nTes, tesVaos: tesVaos, aguasInfo: aguasInfo, sT: sT, removidas: ed.removidas });
    arr(Q.avisos).forEach(function (a) { avisos.push(a); });
    var cont = {}; pecas.forEach(function (o) { cont[o.p] = (cont[o.p] || 0) + 1; });
    /* as MEDIDAS do orçamento do modelo (BimTelhado.medidas → servicos do telhado no Orçamento do modelo) */
    var med = { ripas: 0, caibros: 0, tercas: 0, madeiraM3: 0, acoKg: 0, telhasUn: 0, pregosKg: 0, fixacoesUn: 0, tesourasUn: nTes - num(Q.tesApagadas, 0), pontaletes: 0 };
    pecas.forEach(function (o) {
      if (o.p === "ripa") med.ripas += o.L; else if (o.p === "caibro") med.caibros += o.L; else if (o.p === "terca") med.tercas += o.L; else if (o.p === "pontalete") med.pontaletes += o.L;
      /* a madeira da tesoura que vai pela composição SINAPI NÃO entra (já está na composição) */
      if (o.mat === "madeira" && !(o.tesoura && Q.tesComp && Q.tesComp[o.tesoura])) med.madeiraM3 += o.L * o.w * o.h;
    });
    med.madeiraM3 += num(Q.excessoM3, 0);   /* REVISOR T5: a seção a mais nas peças editadas das tesouras da composição */
    Q.itens.forEach(function (q) {
      if (q.informativo) return;   /* detalhamento de composição: não vira medida de orçamento */
      if (q.grupo === "Estrutura do telhado (aço)" && q.un === "kg") med.acoKg += q.qtd;
      else if (q.grupo === "Telhas" && q.un === "un") med.telhasUn += q.qtd;
      else if (q.grupo === "Fixação" && q.un === "kg") med.pregosKg += q.qtd;
      else if (q.grupo === "Fixação" && q.un === "un") med.fixacoesUn += q.qtd;
    });
    Object.keys(med).forEach(function (k) { med[k] = r4(med[k]); });
    return { ok: true, modelo: t.modelo, medidas: med, placas: placas, rotulo: M.rotulo, material: mat, pecas: pecas, contagem: cont, nTesouras: nTes, apoios: apoios.map(function (a) { return { t: r4(a.t), tipo: a.tipo, parede: a.parede }; }),
             paredes: Object.keys(anexar), camadas: { tercas: r4(baseT), caibros: r4(baseC), ripas: r4(baseR), telha: r4(baseTel) }, camadasAgua: camAg, telhaEsp: r4(espTel / f0), espessura: espPacote, cotaTopo: r4(maxY), topoPlatibanda: tp,
             espacamentos: { tercas: espT, caibros: sC ? espCb : null, galga: sR ? galga : null, apoios: espApoio.m }, aguas: aguasInfo,
             quantitativo: Q.itens, premissas: prem, avisos: avisos,
             removidas: ed.removidas, editadas: ed.editadas, problemas: ed.problemas, sobreporOrfas: ed.orfas };
  }

  /* o código da composição de TELHAMENTO que o BimCobertura.quantitativo usa para esta telha (null = sem composição) —
     a mesma regra de lá: fibrocimento (até 10° / acima de 10°) e sanduíche */
  /* TELHAMENTO pela composição SINAPI (base 06/2026 MG, data/sinapi-MG-analitico.json — os insumos foram conferidos: TODA
     composição de telhamento abaixo traz a TELHA como insumo; as de fibrocimento e de aço trazem também a fixação — parafuso
     com arruela / haste com gancho). A composição é o item orçável; as peças de telha (e a fixação, quando inclusa) viram
     detalhamento. Onduline e shingle não têm composição que inclua a telha: telha em unidade (material) + assentamento (MO).
     Revisor T1, 20/10/2026: cerâmica e shingle saíam com "Telhamento" em m² E "Telhas — peças", os dois para orçar. */
  var D_TEL = function (tipo, aguas, fim) { return "TELHAMENTO COM TELHA " + tipo + ", COM " + aguas + " ÁGUAS, INCLUSO " + (fim || "TRANSPORTE VERTICAL") + ". AF_06/2026"; };
  var TELHAMENTO_SINAPI = {
    "cer-romana-eurotop-toptelha": { ate2: ["94442", D_TEL("CERÂMICA DE ENCAIXE, TIPO ROMANA", "ATÉ 2")], mais2: ["94443", D_TEL("CERÂMICA DE ENCAIXE, TIPO ROMANA", "MAIS DE 2")], inclui: ["telha"], insumo: "7175 telha cerâmica tipo romana/americana/portuguesa/francesa, 41 cm" },
    "cer-portuguesa-faulim": { ate2: ["94195", D_TEL("CERÂMICA DE ENCAIXE, TIPO PORTUGUESA", "ATÉ 2")], mais2: ["94198", D_TEL("CERÂMICA DE ENCAIXE, TIPO PORTUGUESA", "MAIS DE 2")], inclui: ["telha"], insumo: "7175 telha cerâmica tipo romana/americana/portuguesa/francesa, 41 cm" },
    "cer-capa-canal-vogel": { ate2: ["94201", D_TEL("CERÂMICA CAPA-CANAL, TIPO COLONIAL", "ATÉ 2")], mais2: ["94204", D_TEL("CERÂMICA CAPA-CANAL, TIPO COLONIAL", "MAIS DE 2")], inclui: ["telha"], insumo: "7173 telha cerâmica colonial/canal/plan/paulista, 44 a 50 cm" },
    "con-tradicao-tegula": { ate2: ["94189", D_TEL("DE CONCRETO DE ENCAIXE", "ATÉ 2")], mais2: ["94192", D_TEL("DE CONCRETO DE ENCAIXE", "MAIS DE 2")], inclui: ["telha"], aproximado: true, insumo: "40741 telha de concreto tipo clássica, 42 cm, 10 telhas/m² (a Tegula Tradição é aproximada por ela)" },
    "kingspan-isoeste-tp40": { ate2: ["94213", D_TEL("DE AÇO/ALUMÍNIO E = 0,5 MM", "ATÉ 2", "IÇAMENTO")], mais2: null, inclui: ["telha", "fixacao"], aproximado: true, insumo: "7243 telha trapezoidal de aço zincado 0,50 mm, altura ≈ 40 mm + 11029 haste com gancho (a TP-40 0,43 mm pré-pintada é aproximada por ela)" }
  };
  /* a composição do telhamento desta telha ({codigo, descricao, aproximado, inclui, origem}) ou null (sem composição que inclua a telha) */
  function composicaoTelhamento(tel, t) {
    var C = BC(), S = C && C.SINAPI; if (!tel) return null;
    /* fibrocimento e sanduíche: o BimCobertura.quantitativo já põe o código (94210/94207 e 94216) */
    if (S && tel.familia === "fibrocimento" && S.telhaFibroAte10 && S.telhaFibroAcima10) return { codigo: S.telhaFibroAte10.cod + "/" + S.telhaFibroAcima10.cod, origem: "cobertura", inclui: ["telha", "fixacao"], insumo: "7194 telha ondulada de fibrocimento 6 mm + 4302 parafuso + 1607 arruelas" };
    if (S && tel.familia === "sanduiche" && S.telhaSanduiche) return { codigo: S.telhaSanduiche.cod + (S.telhaSanduiche.aprox ? " (aproximada)" : ""), origem: "cobertura", inclui: ["telha", "fixacao"], insumo: "40740 telha termoacústica galvalume com PU 30 mm + 11029 haste com gancho" };
    var id = null; Object.keys(TELHAMENTO_SINAPI).forEach(function (k) { if (telhaDeId(k) === tel) id = k; });
    var m = id ? TELHAMENTO_SINAPI[id] : null; if (!m) return null;
    var mais = t && num(t.nAguas, 2) > 2, esc = mais && m.mais2 ? m.mais2 : m.ate2;
    return { codigo: esc[0], descricao: esc[1], aproximado: !!m.aproximado || (mais && !m.mais2), origem: "t1", inclui: m.inclui, insumo: m.insumo,
             obs: (mais && !m.mais2 ? "a base só tem a composição até 2 águas: aproximada. " : "") + "insumos conferidos na base SINAPI 06/2026 MG: " + m.insumo };
  }
  function telhaDeId(id) { var T = BT(); return T ? T.telha(id) : null; }

  /* O item "Telhamento" do BimCobertura.quantitativo, no telhado COM MODELO, passa a dizer o que ele é: a composição SINAPI
     (com o código — a telha está nela) ou, sem composição, só o ASSENTAMENTO (mão de obra), porque a telha vai em unidade como
     material. Sem modelo, nada muda. (O ajuste é aqui porque o js/bimcobertura.js é de outra frente; a junção pode trazê-lo
     para lá — a regra mora em composicaoTelhamento.) */
  function ajustarQuantCobertura(r, estado) {
    if (!r || !arr(r.itens).length) return r;
    arr(estado && estado.telhados).forEach(function (t) {
      if (!t || !t.pacote || !t.pacote.ok) return;
      var tel = telhaDeId(t.tipoId), comp = composicaoTelhamento(tel, t);
      r.itens.forEach(function (it) {
        if (String(it.telhado) !== String(t.id) || it.modelo || it.grupo !== "Cobertura" || !/^Telhamento/.test(txt(it.item))) return;
        if (comp && comp.origem === "t1" && !it.sinapi) {
          it.sinapi = { codigo: comp.codigo, un: "M2", descricao: comp.descricao, base: "SINAPI 06/2026 (MG)", aproximado: !!comp.aproximado, obs: comp.obs };
          it.orcarAParte = false; it.obs = "composição SINAPI " + comp.codigo + " (inclui a telha: " + comp.insumo + ")" + (comp.aproximado ? " — APROXIMADA" : "");
        } else if (!comp) {
          it.item = "Assentamento da telha (mão de obra) — " + txt(t.tipoTelhado && t.tipoTelhado.rotulo);
          it.servicoMO = true; it.obs = "SERVIÇO (mão de obra): sem composição SINAPI que inclua esta telha — a telha (material) vai em \"Telhas — peças\"; nunca os dois como material";
        }
      });
    });
    if (r.itens) { r.comCodigo = r.itens.filter(function (x) { return !!x.sinapi; }).length; r.aParte = r.itens.filter(function (x) { return x.orcarAParte; }).length; }
    return r;
  }
  function instalarAjuste() {
    var C = BC(); if (!C || !C.quantitativo || C.quantitativo._t1) return;
    var orig = C.quantitativo, nova = function (estado, opc) { return ajustarQuantCobertura(orig.call(this, estado, opc), estado); };
    nova._t1 = true; C.quantitativo = nova;
  }

  /* ============================================================ QUANTITATIVO DO PACOTE */
  function quantDoPacote(t, M, tel, pecas, x) {
    var itens = [], avisos = [], AP = num(t.areaProjecao, 0), A = num(t.area, 0), mat = M.mat;
    /* extra.informativo = DETALHAMENTO de um item que já tem composição própria (a tesoura pela composição SINAPI, a telha e a
       fixação dela pelo telhamento): aparece na lista de corte/material e NUNCA soma no orçamento (revisor T1, 20/10/2026 —
       a tesoura saía pela composição E pelas peças e pregos dela: orçada duas vezes). extra.sinapi = a composição do item. */
    function it(grupo, item, un, qtd, obs, partida, extra) {
      var o = { grupo: grupo, item: item, un: un, qtd: r4(qtd), obs: obs || null, partida: !!partida };
      if (extra && extra.informativo) { o.informativo = true; o.inclusoEm = extra.inclusoEm || null; }
      if (extra && extra.sinapi) o.sinapi = extra.sinapi;
      itens.push(o);
    }
    /* as tesouras de madeira que vão pela COMPOSIÇÃO do SINAPI (vão até 12 m): id → [vão, composição, prego kg, parafusos] */
    /* a shingle (11 kg/m² + a OSB) não é nenhuma das duas famílias do SINAPI: vai pela de cerâmica/concreto, a mais pesada
       (regra RA: na incerteza, o preço mais alto) */
    var cer = !tel || tel.familia === "ceramica" || tel.familia === "concreto" || tel.familia === "shingle", tabT = cer ? TESOURAS_SINAPI.cer : TESOURAS_SINAPI.ond, tesComp = {};
    /* REVISOR T5: a tesoura com TODAS as peças apagadas (edição de peça) não existe mais — sai da composição (era cobrada
       inteira); a com parte apagada continua pela composição inteira (regra RA: na incerteza, o preço mais alto) */
    var tesViva = {}; pecas.forEach(function (o) { if (o.tesoura) tesViva[o.tesoura] = 1; });
    var tesApagada = {}; arr(x.removidas).forEach(function (r) { if (r && r.tesoura && !tesViva[r.tesoura]) tesApagada[r.tesoura] = 1; });
    if (M.tesoura && mat !== "aco") x.tesVaos.forEach(function (v, i) {
      if (tesApagada["tes" + (i + 1)]) return;
      for (var j = 0; j < tabT.length; j++) if (tabT[j][0] >= v - 1e-6) { tesComp["tes" + (i + 1)] = tabT[j]; break; }
    });
    /* a ligação da trama pela norma: a bitola que cumpre (ou, se nenhuma do catálogo cumpre, a do SINAPI com o porquê) */
    function ligacaoTrama(nome, t1, t2, nLig, desSinapi, naoEstrutural) {
      var pr = escolherPrego(t1, t2, { naoEstrutural: naoEstrutural }), cumpre = !!pr, txt0;
      if (!pr) pr = pregoCat(desSinapi);
      var v = verificarPrego(pr, t1, t2, NBR_PREGO.minPinos, { naoEstrutural: naoEstrutural }), n = nLig * NBR_PREGO.minPinos;
      txt0 = cumpre ? pr.des + " cumpre a NBR 7190-1 (d ≤ t/5, penetração " + virg(v.penetracao, 0) + " mm ≥ 12 d)" :
        "nenhuma bitola do catálogo cumpre a 7.2 nesta ligação (" + virg(t1, 0) + " mm na peça de " + virg(t2, 0) + " mm) — vale o " + pr.des + " do SINAPI como FIXAÇÃO, não como ligação dimensionada: " + v.falhas.join("; ");
      if (!cumpre) avisos.push("Pregos " + nome + ": nenhuma bitola do catálogo cumpre a NBR 7190-1 (7.2) — o " + pr.des + " do SINAPI vale como fixação, não como ligação dimensionada; dimensionar no módulo Madeira.");
      return { item: "Pregos pela NBR 7190 — " + nome + ": " + nLig + " ligações × " + NBR_PREGO.minPinos + " = " + n + " pregos " + pr.des, kg: n / pr.porKg, pr: pr, cumpre: cumpre,
               obs: "mínimo da norma (" + NBR_PREGO.minFonte + ") — dimensionar no módulo Madeira; " + txt0 + "; " + pr.porKg + " pregos/kg (" + F_BELGO + ")" };
    }
    /* os nós das tesouras: cobre-junta de tábua 2,5 cm (SINAPI, tesoura de referência) pregado na peça de 6 cm (largura da perna/linha) */
    function ligacaoTesoura(filtro) {
      var nn = nosDasTesouras(pecas, filtro), t1 = 25, t2 = SEC.perna.b * 1000, pr = escolherPrego(t1, t2) || pregoCat("18×30"), v = verificarPrego(pr, t1, t2, NBR_PREGO.minPinos);
      return { nos: nn.nos, lig: nn.ligacoes, n: nn.ligacoes * NBR_PREGO.minPinos, pr: pr, texto: pr.des + (v.ok ? " (cobre-junta 25 mm na peça de " + virg(t2, 0) + " mm: d ≤ t/5 e penetração " + virg(v.penetracao, 0) + " mm ≥ 12 d — 7.2)" : " — " + v.falhas.join("; ")) };
    }
    var por = {};
    pecas.forEach(function (o) {
      var inf = !!(o.tesoura && tesComp[o.tesoura]);
      var k = o.p + "|" + (o.perfil || (o.w + "x" + o.h)) + (inf ? "|det" : ""), g = por[k] || (por[k] = { p: o.p, n: 0, m: 0, m3: 0, kg: 0, perfil: o.perfil, w: o.w, h: o.h, mat: o.mat, inf: inf });
      g.n++; g.m += o.L; g.m3 += o.L * o.w * o.h;
    });
    var cods0 = {}; Object.keys(tesComp).forEach(function (id) { cods0[tesComp[id][1]] = 1; });
    var inclTes = "composição SINAPI de tesoura " + Object.keys(cods0).join(", ");
    var ROT = { linha: "Linha (tirante)", perna: "Perna", pendural: "Pendural", escora: "Escora", montante: "Montante (sarrafo, 2 por montante)", terca: "Terça", caibro: "Caibro", ripa: "Ripa", pontalete: "Pontalete", espigao: "Espigão", rincao: "Rincão", testeira: "Testeira",
                "banzo-inferior": "Banzo inferior da tesoura", "viga-aco": "Viga principal (alma cheia)", "pilar-aco": "Pilar da cumeeira", banzo: "Banzo superior da tesoura", "pendural-aco": "Montante central da tesoura", diag: "Diagonal da tesoura", "montante-aco": "Montante da tesoura" };
    var SECP = { linha: SEC.linha, perna: null, pendural: SEC.pendural, escora: SEC.escora, montante: SEC.montante, terca: SEC.terca, caibro: SEC.caibro, ripa: SEC.ripa, pontalete: SEC.pontalete, espigao: SEC.espigao, rincao: SEC.espigao, testeira: SEC.testeira };
    Object.keys(por).forEach(function (k) {
      var g = por[k], rot = ROT[g.p] || g.p;
      if (g.mat === "aco" || g.perfil) {
        var A9 = PA(), o = A9 && A9.obter ? A9.obter(g.perfil) : null, kg = o && fin(o.massa) ? o.massa * g.m : null;
        it("Estrutura do telhado (aço)", rot + " " + (g.perfil || "") + " — " + g.n + " peça(s), " + virg(g.m) + " m", "kg", kg == null ? 0 : kg, "perfil ADOTADO (valor de partida) — confirmar no cálculo da Metálica", true);
      } else {
        var sp = g.p === "perna" ? (g.h >= 0.16 ? SEC.perna16 : SEC.perna) : SECP[g.p], part = !sp || !!sp.partida;
        if (g.inf) it("Madeiramento", rot + " da tesoura " + virg(g.w * 100, 1).replace(",0", "") + "×" + virg(g.h * 100, 1).replace(",0", "") + " cm — " + g.n + " peça(s)", "m", g.m, "lista de corte; " + virg(g.m3, 3) + " m³ (" + (sp && sp.fonte ? sp.fonte : "seção VALOR DE PARTIDA") + ")", false, { informativo: true, inclusoEm: inclTes });
        else it("Madeiramento", rot + " " + virg(g.w * 100, 1).replace(",0", "") + "×" + virg(g.h * 100, 1).replace(",0", "") + " cm — " + g.n + " peça(s)", "m", g.m, (sp && sp.fonte ? sp.fonte : "seção VALOR DE PARTIDA — conferir") + "; " + virg(g.m3, 3) + " m³", part);
      }
    });
    /* tesouras de madeira: a tesoura de referência do SINAPI do vão imediatamente maior (pregos 18×30, parafusos, estribo, cobre-juntas) */
    if (M.tesoura && mat !== "aco" && x.nTes) {
      /* a TESOURA vai pela composição SINAPI do vão (imediatamente maior), que já inclui madeira, pregos, parafusos, estribo,
         cobre-juntas e mão de obra: UM item com código; as peças e as ligações dela são só detalhamento (não somam) */
      var kgP = 0, paraf = 0, comp = {}, nCom = 0;
      x.tesVaos.forEach(function (v, i) {
        if (tesApagada["tes" + (i + 1)]) return;   /* REVISOR T5: apagada inteira — nada a cobrar */
        var lin = tesComp["tes" + (i + 1)];
        if (!lin) { avisos.push("Tesoura de " + virg(v) + " m passa dos 12 m do SINAPI: sem composição — as peças dela entram avulsas e as ligações a dimensionar."); return; }
        kgP += lin[2]; paraf += lin[3]; nCom++; (comp[lin[1]] = comp[lin[1]] || { n: 0, vao: lin[0] }).n++;
      });
      Object.keys(comp).forEach(function (c) {
        var v = comp[c].vao, desc = "FABRICAÇÃO E INSTALAÇÃO DE TESOURA INTEIRA EM MADEIRA NÃO APARELHADA, VÃO DE " + v + " M, PARA " + (cer ? "TELHA CERÂMICA OU DE CONCRETO" : "TELHA ONDULADA DE FIBROCIMENTO, METÁLICA, PLÁSTICA OU TERMOACÚSTICA") + ", INCLUSO IÇAMENTO. AF_10/2025";
        it("Estrutura do telhado", "Tesoura inteira de madeira não aparelhada, vão de " + v + " m (Howe) — " + comp[c].n + " un", "un", comp[c].n, "composição SINAPI " + c + " (vão de referência imediatamente maior — " + TESOURAS_SINAPI.fonte + "); PRÉ-DIMENSIONADO",
           false, { sinapi: { codigo: c, un: "UN", descricao: desc, base: "SINAPI 06/2026 (MG)", aproximado: false, obs: null } });
      });
      if (nCom) {
        var det = { informativo: true, inclusoEm: inclTes };
        it("Fixação", "Prego 18×30 (2 3/4 × 10) com cabeça — nós das tesouras", "kg", kgP, TESOURAS_SINAPI.fonte, false, det);
        if (paraf) it("Fixação", "Parafuso francês M12×150 com porca e arruela — tesouras de 8 a 12 m", "un", paraf, TESOURAS_SINAPI.fonte, false, det);
        it("Fixação", "Estribo em chapa de ferro fundido 2\"×3/16\"×35 cm com parafuso — nó central da tesoura", "un", nCom, TESOURAS_SINAPI.fonte, false, det);
        it("Madeiramento", "Tábua 2,5×20 cm (cobre-juntas dos nós de apoio e cumeeira)", "m", 3 * nCom, TESOURAS_SINAPI.fonte + " (3,0 m por tesoura)", false, det);
      }
    }
    /* MEIAS-TESOURAS (testas, alas) e TESOURAS DE CANTO (espigão/rincão): o SINAPI só tem composição para a tesoura INTEIRA —
       aplicar uma fração dela seria inventar proporção. Vão PEÇA A PEÇA: a madeira já está nas linhas de Madeiramento acima
       (contada uma vez, como as terças e caibros); a contagem delas é só detalhamento; os pregos dos nós saem pela taxa do
       SINAPI (kg de prego 18×30 ÷ metros de madeira da tesoura de referência) — VALOR DE PARTIDA */
    if (M.tesoura && (x.nMeias || x.nDiag)) {
      var Lmt = 0; pecas.forEach(function (o) { if (o.tesoura && /^(mt|esp|rin)/.test(o.tesoura)) Lmt += o.L; });
      it("Estrutura do telhado", "Meias-tesouras " + x.nMeias + " un e tesouras de canto (espigão/rincão) " + x.nDiag + " un — peça a peça", "un", x.nMeias + x.nDiag, "sem composição SINAPI própria (o SINAPI só traz a tesoura inteira): a madeira delas está no Madeiramento", false, { informativo: true, inclusoEm: "peças do Madeiramento (peça a peça)" });
      if (mat !== "aco") {
        /* ORÇAMENTO pela taxa do SINAPI (kg de prego 18×30 ÷ metros de madeira da tesoura de referência de 8 m) — decisão da RA
           (20/10/2026, regra "100 % orçado, na incerteza o preço mais alto"): o mínimo da norma (2 por ligação) dá bem menos e
           não cobre perdas nem fixações auxiliares. A contagem pela NBR 7190-1 vai logo abaixo como DETALHAMENTO, sem somar. */
        var ref = tabT[5] || tabT[tabT.length - 1], taxa = ref[2] / (ref[4] + ref[5] + ref[6] + ref[7]);
        it("Fixação", "Prego 18×30 (2 3/4 × 10) com cabeça — nós das meias-tesouras e tesouras de canto (" + virg(Lmt) + " m de peça)", "kg", taxa * Lmt,
           "taxa da tesoura SINAPI " + ref[1] + " (" + virg(ref[2], 3) + " kg ÷ " + virg(ref[4] + ref[5] + ref[6] + ref[7], 1) + " m de madeira, " + TESOURAS_SINAPI.fonte + ") aplicada aos metros das meias-tesouras — proporção calculada pela RA, conferir", true);
        var lgM = ligacaoTesoura(function (id) { return /^(mt|esp|rin)/.test(id); });
        if (lgM.n) it("Fixação", "Pregos pela NBR 7190 — nós das meias-tesouras e tesouras de canto: " + lgM.nos + " nós, " + lgM.lig + " ligações × " + NBR_PREGO.minPinos + " = " + lgM.n + " pregos " + lgM.pr.des, "kg", lgM.n / lgM.pr.porKg,
           "mínimo da norma (" + NBR_PREGO.minFonte + ") — dimensionar no módulo Madeira; bitola " + lgM.texto + "; " + lgM.pr.porKg + " pregos/kg (" + F_BELGO + ")", false, { informativo: true, inclusoEm: "a taxa de pregos do SINAPI (base do orçamento das meias-tesouras)" });
      } else it("Fixação", "Ligações parafusadas dos nós das meias-tesouras e de canto", "un", x.nMeias + x.nDiag, "chapas e parafusos por nó: SEM FONTE — VALOR DE PARTIDA, dimensionar no cálculo da Metálica", true);
    }
    if (M.tesoura && mat === "aco" && x.nTes) it("Fixação", "Ligações parafusadas dos nós da tesoura metálica", "un", x.nTes, "chapas e parafusos por nó: SEM FONTE — VALOR DE PARTIDA, dimensionar no cálculo da Metálica", true);
    /* pregos da trama: o ORÇAMENTO fica pelo kg/m² do SINAPI (é a base de orçamento: inclui perdas e fixações auxiliares);
       a contagem pela NORMA (ligações do modelo × mínimo 2, bitola pela 7.2) vai como DETALHAMENTO logo abaixo de cada um */
    if (mat !== "aco") {
      var detN = { informativo: true, inclusoEm: "o kg/m² do SINAPI (base do orçamento da trama)" };
      avisos.push("Pregos: a quantidade por ligação é o MÍNIMO da NBR 7190-1:2022 (2 pregos, 7.1.1) — dimensionar no módulo Madeira com os esforços.");
      var tR = x.sR ? x.sR.h * 1000 : 0, tC = x.sC ? x.sC.h * 1000 : 0, tT = x.sT.h * 1000, tAp = M.tesoura ? x.sPerna.h * 1000 : SEC.pontalete.b * 1000;
      if (M.ripa) { var lr = ligacaoTrama("ripa × caibro", tR, tC, x.nCruzRC, "15×15", true); it("Fixação", lr.item, "kg", lr.kg, lr.obs, false, detN); }
      if (M.caibro) { var lc = ligacaoTrama("caibro × terça", tC, tT, x.nCruzCT, "19×36"); it("Fixação", lc.item, "kg", lc.kg, lc.obs, false, detN); }
      var lt = ligacaoTrama("terça × apoio", tT, tAp, x.nCruzTA, "22×48"); it("Fixação", lt.item, "kg", lt.kg, lt.obs, false, detN);
      if (M.tesoura && x.nTes) { var lgI = ligacaoTesoura(function (id) { return /^tes/.test(id); }); if (lgI.n) it("Fixação", "Pregos pela NBR 7190 — nós das tesouras inteiras: " + lgI.nos + " nós, " + lgI.lig + " ligações × " + NBR_PREGO.minPinos + " = " + lgI.n + " pregos " + lgI.pr.des, "kg", lgI.n / lgI.pr.porKg, "mínimo da norma (" + NBR_PREGO.minFonte + ") — dimensionar no módulo Madeira; bitola " + lgI.texto, false, { informativo: true, inclusoEm: "a composição SINAPI da tesoura" }); }
      if (M.ripa) it("Fixação", PREGOS.ripaCaibro.prego + " — ripa × caibro (" + x.nCruzRC + " cruzamentos)", "kg", PREGOS.ripaCaibro.kgM2 * AP, PREGOS.fonte + "; quantidade de pregos por cruzamento: SEM FONTE (o kg do SINAPI manda)");
      if (M.caibro) it("Fixação", PREGOS.caibroTerca.prego + " — caibro × terça (" + x.nCruzCT + " cruzamentos)", "kg", PREGOS.caibroTerca.kgM2 * AP, PREGOS.fonte);
      it("Fixação", PREGOS.tercaApoio.prego + " — terça × apoio (" + x.nCruzTA + " apoios)", "kg", PREGOS.tercaApoio.kgM2 * AP, PREGOS.fonte);
    } else it("Fixação", "Ligação terça Ue × apoio (cantoneira/clipe parafusado) — " + x.nCruzTA + " apoios", "un", x.nCruzTA, "peça e parafusos por ligação: SEM FONTE — VALOR DE PARTIDA, dimensionar no cálculo", true);
    /* as TELHAS e a fixação delas. Quando o TELHAMENTO tem composição SINAPI (o BimCobertura.quantitativo lista o m² com o
       código: fibrocimento, sanduíche), a composição já traz a telha e os acessórios de fixação — as peças e os parafusos daqui
       viram DETALHAMENTO (não somam; revisor T1, 20/10/2026). Sem composição, contam (orçar à parte). */
    var compTel = composicaoTelhamento(tel, t), detTel = compTel ? { informativo: true, inclusoEm: "telhamento — composição SINAPI " + compTel.codigo } : null;
    /* a fixação da telha só é detalhamento quando a composição a inclui (fibrocimento, aço); na cerâmica a amarração é à parte */
    var detFix = compTel && compTel.inclui.indexOf("fixacao") >= 0 ? detTel : null;
    var nTel = null, obsTel = null, partTel = false, lu = larguraUtilDe(tel);
    if (tel && fin(tel.pecasM2)) { nTel = tel.pecasM2 * A; obsTel = virg(tel.pecasM2, 1) + " peças/m² × " + virg(A) + " m² inclinados (" + (tel.galga && tel.galga.fonte ? "" : "") + (tel.fonteCatalogo || "") + "; sem perdas)"; }
    else if (lu) {
      nTel = 0;
      x.aguasInfo.forEach(function (ai) {
        var col = Math.ceil((ai.tmax - ai.tmin) / lu - 1e-9), rec = recobLong(tel, Math.atan(num(t.aguasCalc[ai.agua] && t.aguasCalc[ai.agua].inclinacao, 0) / 100) * 180 / Math.PI);
        var Lmax = arr(tel.comprimentos).length ? Math.max.apply(null, tel.comprimentos) : num(tel.comprimentoMaxM, 12), lin = ai.rampa <= Lmax ? 1 : Math.ceil((ai.rampa - rec) / (Lmax - rec) - 1e-9);
        nTel += col * lin;
      });
      obsTel = "colunas pela largura útil " + virg(lu) + " m × fileiras pelo comprimento da peça (" + (tel.larguraFonte || tel.fonteCatalogo || "catálogo") + ")";
    } else { partTel = true; obsTel = "telha sem rendimento/largura útil no catálogo — VALOR DE PARTIDA, conferir"; }
    /* o TELHAMENTO (m²), a cumeeira e o espigão NÃO entram aqui: o BimCobertura.quantitativo já os lista por telhado (com a
       composição SINAPI) — repetidos, a mesma área saía duas vezes na lista (revisor T1, 20/10/2026) */
    if (nTel != null) it("Telhas", (tel ? tel.produto : "Telha") + " — peças", "un", Math.ceil(nTel - 1e-9), obsTel, partTel, detTel);
    if (M.osb) {
      var bo = tel && tel.base ? tel.base : {}, sub = tel && tel.subcobertura ? tel.subcobertura : null;
      it("Madeiramento", "Base contínua de OSB e = " + virg(num(bo.espessuraM, 0.0111) * 1000, 1) + " mm (sobre os caibros)", "m²", A, (bo.texto || "base de OSB") + " (" + (bo.fonte || "catálogo") + "); espessura: VALOR DE PARTIDA — conferir", true);
      /* as chapas são a MESMA OSB da linha de m² acima: só detalhamento (orçadas as duas, a base saía duas vezes — revisor 2) */
      it("Madeiramento", "Chapas de OSB 1,22 × 2,44 m", "un", Math.ceil(A / (1.22 * 2.44) - 1e-9), "formato da chapa: VALOR DE PARTIDA — conferir com o fornecedor (sem perdas)", true, { informativo: true, inclusoEm: "Base contínua de OSB (m²), na linha acima" });
      it("Fixação", "Fixação da OSB nos caibros (prego anelado/parafuso)", "m²", A, "quantidade por chapa: SEM FONTE no catálogo da telha — VALOR DE PARTIDA, conferir com o fabricante da OSB", true);
      if (sub) it("Telhas", "Subcobertura: " + sub.texto, "m²", A, sub.fonte + "; sobreposições sem perdas calculadas — conferir", true);
    }
    var baixaJa = false;
    if (tel && fin(tel.baixaInclinacaoPct)) arr(t.aguasCalc).forEach(function (ag) { var pq = num(ag.inclinacao, 0); if (!baixaJa && pq > 0 && pq < tel.baixaInclinacaoPct - 1e-6 && pq >= num(tel.inclinacaoMinPct, 0) - 1e-6 && (baixaJa = true)) avisos.push("Inclinação " + virg(pq, 1) + "% abaixo de " + tel.baixaInclinacaoPct + "%: a " + tel.produto + " vai pelo MÉTODO PARA BAIXA INCLINAÇÃO (subcobertura sobreposta) — " + tel.inclinacaoFonte + "."); });
    if (tel && tel.fixacao) {
      var fx = tel.fixacao, nAp = 0;
      if (fin(fx.porTelha) && nTel != null) {
        /* fixação POR TELHA do catálogo (Onduline: 18 fixadores; shingle: 4 pregos) */
        it("Fixação", "Fixação da telha: " + fx.texto, "un", Math.ceil(nTel - 1e-9) * fx.porTelha, fx.porTelha + " por telha × " + Math.ceil(nTel - 1e-9) + " telhas (" + fx.fonte + ")", !!fx.partida || partTel, detFix);
      } else if (fin(fx.porTelhaPorApoio) && !M.ripa) {
        /* telha em chapa: fixações = colunas × terças MODELADAS × por telha por apoio (revisor T1: a conta pela rampa com o
           beiral dava uma terça a mais — TP-40 8×10 a 8%: 288 parafusos para 216 reais) */
        x.aguasInfo.forEach(function (ai) { var col = lu ? Math.ceil((ai.tmax - ai.tmin) / lu - 1e-9) : 0, nT = ai.nTercas > 0 ? ai.nTercas : Math.max(2, Math.ceil(ai.rampa / x.espT - 1e-9) + 1); nAp += col * nT; });
        it("Fixação", "Fixação da telha: " + fx.texto, "un", nAp * fx.porTelhaPorApoio, fx.porTelhaPorApoio + " por telha por apoio (" + fx.fonte + ")", !!fx.partida, detFix);
        if (fin(fx.costuraM)) { var cost = 0; x.aguasInfo.forEach(function (ai) { var col = lu ? Math.ceil((ai.tmax - ai.tmin) / lu - 1e-9) : 0; cost += Math.max(0, col - 1) * Math.ceil(ai.rampa / fx.costuraM); }); it("Fixação", "Parafuso de costura nas emendas laterais (a cada " + virg(fx.costuraM) + " m)", "un", cost, fx.fonte, false, detFix); }
      } else if (!fin(fx.porTelhaPorApoio) && !M.ripa) {
        x.aguasInfo.forEach(function (ai) { var col = lu ? Math.ceil((ai.tmax - ai.tmin) / lu - 1e-9) : 0, nT = ai.nTercas > 0 ? ai.nTercas : Math.max(2, Math.ceil(ai.rampa / x.espT - 1e-9) + 1); nAp += col * nT; });
        it("Fixação", "Fixação da telha: " + fx.texto, "un", nAp * 2, "2 por telha por apoio — VALOR DE PARTIDA, conferir (" + fx.fonte + ")", true, detFix);
      } else {
        var beir = 0; arr(t.arestasCalc).forEach(function (e) { if (e.define) beir += num(e.comprimento, 0); });
        it("Fixação", "Fixação/amarração das telhas: " + fx.texto, "m", beir, "metros de beiral (1ª fiada); quantidade por telha: " + (fx.partida ? "SEM FONTE — VALOR DE PARTIDA, conferir" : "ver catálogo") + " (" + fx.fonte + ")", true, detFix);
      }
    }
    if (tel && fin(tel.inclinacaoMinPct)) {
      arr(t.aguasCalc).forEach(function (ag) { if (num(ag.inclinacao, 0) > 0 && num(ag.inclinacao, 0) < tel.inclinacaoMinPct - 1e-6) avisos.push("Inclinação " + virg(ag.inclinacao, 1) + "% abaixo da mínima de " + virg(tel.inclinacaoMinPct, 1) + "% do fabricante (" + tel.inclinacaoFonte + ")."); });
    }
    if (tel && tel.balanco && !M.caibro) {
      var bm = arr(t.arestasCalc).reduce(function (m, e) { return Math.max(m, num(e.beiralM, 0)); }, 0), mx = tel.balanco.semCalha ? tel.balanco.semCalha.max : null;
      if (mx != null && bm > mx + 1e-6) avisos.push("Beiral de " + virg(bm) + " m passa do balanço máximo da telha (" + virg(mx) + " m, " + tel.balancoFonte + "): diminua o beiral.");
    }
    /* REVISOR T5: peça de tesoura da COMPOSIÇÃO com a seção trocada para MAIOR — a composição é da tesoura de referência:
       a madeira a mais (L × (seção nova − automática)) vai à parte, uma vez; seção menor não desconta (o preço mais alto) */
    var exM3 = 0, exM = 0, exN = 0;
    pecas.forEach(function (o) {
      if (!(o.tesoura && tesComp[o.tesoura] && o.auto && o.mat === "madeira" && o.editada && o.editada.indexOf("secao") >= 0)) return;
      var d = o.L * (o.w * o.h - num(o.auto.w, 0) * num(o.auto.h, 0)); if (d > 1e-9) { exM3 += d; exM += o.L; exN++; }
    });
    if (exN) it("Madeiramento", "Acréscimo de seção nas peças editadas das tesouras da composição — " + exN + " peça(s), " + virg(exM) + " m", "m3", exM3,
      "a composição SINAPI é da tesoura de referência: aqui só a madeira A MAIS das peças com a seção trocada (seção nova − automática)", true);
    return { itens: itens, avisos: avisos, tesComp: tesComp, tesApagadas: Object.keys(tesApagada).length, excessoM3: exM3 };
  }

  /* ============================================================ GEOMETRIA (para o 3D) */
  /* geometria(t) → { grupos:[{ chave, material:"madeira"|"aco"|"telha"|"telha-baixo", agua?, pos:[x,y,z…] (triângulos soltos), nTri }], nTri }
     Uma malha por material da estrutura e UMA por água para as telhas (por cima e por baixo), com teto de triângulos. */
  var CACHE_GEO = [];   /* as últimas geometrias (o 3D refaz a cena a cada edição: o telhado que não mudou não é recalculado) */
  function geometria(t, opc) {
    opc = opc || {};
    var pk = t && t.pacote, T = BT(); if (!pk || !pk.ok || !T) return { grupos: [], nTri: 0 };
    var chave = null;
    try { chave = JSON.stringify([t.tipoId, t.modelo, opc.teto || 0, t.aguasCalc, t.linhas, pk.camadas, pk.camadasAgua, pk.pecas]); } catch (eK) { chave = null; }
    if (chave) for (var ci = 0; ci < CACHE_GEO.length; ci++) if (CACHE_GEO[ci].k === chave) return CACHE_GEO[ci].g;
    var g0 = geometriaCalc(t, opc, pk, T);
    if (chave) { CACHE_GEO.unshift({ k: chave, g: g0 }); if (CACHE_GEO.length > 6) CACHE_GEO.length = 6; }
    return g0;
  }
  /* o núcleo da sanduíche: o do catálogo (tel.nucleo) ou a camada isolante do tipo (EPS/PIR/PU) */
  function nucleoTipo(tel, t) {
    var n = String(tel && tel.nucleo || "").toUpperCase();
    if (!n) arr(t && t.tipoTelhado && t.tipoTelhado.camadas).forEach(function (c) { var m = String(c && c.material || ""); if (!n && /\bPIR\b/i.test(m)) n = "PIR"; else if (!n && /\bPU\b|poliuretano/i.test(m)) n = "PU"; else if (!n && /EPS|isopor|poliestireno/i.test(m)) n = "EPS"; });
    return /PIR/.test(n) ? "PIR" : (/PU|POLIURET/.test(n) ? "PU" : "EPS");
  }
  function geometriaCalc(t, opc, pk, T) {
    var grupos = [], porMat = {}, nTot = 0, teto = fin(opc.teto) ? opc.teto : TETO_TRI_AGUA;
    arr(pk.pecas).forEach(function (o) {
      var g = porMat[o.mat] || (porMat[o.mat] = { chave: "estr-" + o.mat, material: o.mat, pos: [], nTri: 0 });
      g.nTri += extrudar(g.pos, o);
    });
    /* a base de OSB da shingle: uma placa por água (prisma no plano, triângulos soltos), na malha da madeira */
    arr(pk.placas).forEach(function (pl) {
      var ag = arr(t.aguasCalc).filter(function (x, i) { return true; }), g = porMat.madeira || (porMat.madeira = { chave: "estr-madeira", material: "madeira", pos: [], nTri: 0 });
      var Q = pl.pts, f2 = 1, yB = function (q) { return T.alturaEm(t, q[0], q[1]); };
      var sl = aguasInclinadas(t)[pl.agua]; if (sl) { var Sx = sistemaDe(sl); f2 = Sx.f; yB = function (q) { return Sx.y(q[0], q[1]); }; }
      var tris = T.triangular(Q), e = pl.e * f2;
      function V(q, top) { var y = yB(q); return [q[0], (y == null ? 0 : y) + pl.base + (top ? e : 0), q[1]]; }
      function tri(p, q, r) { g.pos.push(p[0], p[1], p[2], q[0], q[1], q[2], r[0], r[1], r[2]); g.nTri++; }
      tris.forEach(function (tr) { tri(V(tr[0], 1), V(tr[1], 1), V(tr[2], 1)); tri(V(tr[0], 0), V(tr[2], 0), V(tr[1], 0)); });
      for (var i = 0; i < Q.length; i++) { var a = Q[i], b = Q[(i + 1) % Q.length]; tri(V(a, 0), V(b, 0), V(b, 1)); tri(V(a, 0), V(b, 1), V(a, 1)); }
      void ag;
    });
    Object.keys(porMat).forEach(function (k) { grupos.push(porMat[k]); nTot += porMat[k].nTri; });
    var tel = T.telha(t.tipoId), pf = tel && tel.perfil ? tel.perfil : { passo: 0.2, altura: 0.04, esp: 0.01 }, h = perfilFn(tel);
    var sand = tel && tel.familia === "sanduiche", nucleo = sand ? num(tel.nucleoMm, 30) / 1000 : 0;
    /* T4 (20/10/2026): o NÚCLEO da sanduíche (EPS/PIR/PU do catálogo; senão a camada isolante do tipo) aparece nas bordas
       entre as duas chapas — material próprio, espessura do catálogo */
    var nucTipo = sand ? nucleoTipo(tel, t) : null;
    var faceMad = arr(t.tipoTelhado && t.tipoTelhado.camadas).some(function (c) { return /madeira/i.test(c.material || ""); });
    var cristas = [];   /* por peça de água: o topo da crista da telha num ponto (para a capa do espigão/cumeeira assentar) */
    aguasInclinadas(t).forEach(function (ag, ia) {
      var S = sistemaDe(ag), d = S.d, td = S.td, f = S.f;
      arr(ag.pecas).forEach(function (pq) {
        var Q = pq.pts.map(function (q) { return [q.x, q.z]; }); if (Q.length < 3) return;
        var umin = Infinity, umax = -Infinity, tmn = Infinity, tmx = -Infinity;
        Q.forEach(function (q) { var u = d[0] * q[0] + d[1] * q[1], tt = td[0] * q[0] + td[1] * q[1]; if (u < umin) umin = u; if (u > umax) umax = u; if (tt < tmn) tmn = tt; if (tt > tmx) tmx = tt; });
        /* as fileiras (ao longo do caimento) */
        var Lp = tel && fin(tel.galga && tel.galga.m) ? tel.galga.m : (tel && fin(tel.comprimentoPeca) ? tel.comprimentoPeca - 0.1 : null), rampa = (umax - umin) * f;
        if (!Lp) { var cm = arr(tel && tel.comprimentos).length ? Math.max.apply(null, tel.comprimentos) : num(tel && tel.comprimentoMaxM, 12); Lp = rampa <= cm ? rampa : cm - recobLong(tel, 10); }
        var nRow = Math.max(1, Math.ceil(rampa / Lp - 1e-9));
        /* teto: amostras por passo e, se ainda passar, fileiras juntas */
        var porPasso = amostrasPorPasso(tel), nCol = function (pp) { return Math.ceil((tmx - tmn) / pf.passo * pp) + 2; };
        /* T4: a telha com CORPO — além de cima e de baixo, cada fileira fecha a frente (2 por coluna), a última o topo e as
           pontas: ~6 triângulos por célula; os topos que o contorno corta (espigão, rincão) entram enquanto couber no teto */
        var est = function (pp, nr) { return nr * nCol(pp) * 6 + 2 * nCol(pp) + nr * 4; };
        /* nunca menos de 4 amostras por onda (revisor T1, 20/10/2026): com 2, as amostras caem em fase com o perfil — a capa e
           canal de um 20×30 saía PLANA (h(0) = h(½) = 0,45·A) e a romana sem a crista; o trapézio usa as 4 quinas sempre */
        var minPP = tel && tel.forma === "plana" ? 1 : 4;
        while (est(porPasso, nRow) > teto && porPasso > minPP) porPasso--;
        var junta = 1; while (est(porPasso, Math.ceil(nRow / junta)) > teto && junta < nRow) junta++;
        nRow = Math.ceil(nRow / junta);
        var gT = { chave: "telha-" + ia, material: "telha", agua: ia, pos: [], nTri: 0, nBorda: 0 }, gB = { chave: "telha-baixo-" + ia, material: faceMad ? "telha-madeira" : "telha", agua: ia, pos: [], nTri: 0 };
        /* as bordas: na telha comum, na malha de cima (mesmo material — uma malha a menos); na sanduíche, o núcleo */
        var gW = sand ? { chave: "telha-nucleo-" + ia, material: "telha-nucleo", nucleo: nucTipo, nucleoMm: nucleo * 1000, agua: ia, pos: [], nTri: 0, nBorda: 0 } : gT;
        var orcW = Math.max(0, teto - est(porPasso, nRow)), extraW = 0;
        var base = pk.camadasAgua && pk.camadasAgua[ia] ? pk.camadasAgua[ia].telha : pk.camadas.telha, esp = pf.esp,   /* T3: o fundo da telha pelo plano desta água */
         lift = (esp + 0.004) * (tel && /ceramica|concreto/.test(tel.familia) ? 3 : 1);
        function tri(g, p, q, r) { g.pos.push(p[0], p[1], p[2], q[0], q[1], q[2], r[0], r[1], r[2]); g.nTri++; }
        function parede(g, p, q, r2, s2) {
          var d1 = Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]), d2 = Math.abs(p[0] - s2[0]) + Math.abs(p[1] - s2[1]) + Math.abs(p[2] - s2[2]);
          if (d1 < 1e-9 || d2 < 1e-9) return;   /* aresta sem comprimento (ponta do espigão) ou sem altura */
          tri(g, p, q, r2); tri(g, p, r2, s2); g.nBorda += 2;
        }
        function P3(u, tt, dy) { var x = d[0] * u + td[0] * tt, z = d[1] * u + td[1] * tt; return [x, S.y(x, z) + base + dy, z]; }
        /* as COLUNAS (as ondas, retas ao longo do caimento): cada coluna é cortada pelo contorno da água NA PRÓPRIA coluna —
           o corte do espigão/rincão sai em diagonal e as ondas ficam paralelas, como a telha cortada na obra */
        var ts = [tmn];
        if (tel && tel.forma === "trapezoidal" && pf.passo) pontosTrap(tel, tmn, tmx).forEach(function (q) { ts.push(q); });
        else { var dtc = pf.passo / porPasso, k0 = Math.ceil(tmn / dtc + 1e-9); for (var kk = k0; kk * dtc < tmx - 1e-9; kk++) ts.push(kk * dtc); }
        ts.push(tmx);
        (function (Qc, Sc, dc, umn, umx, nR, base0, lift0, fc, hm) {
          var bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity, du = (umx - umn) / nR;
          Qc.forEach(function (q) { bx0 = Math.min(bx0, q[0]); bx1 = Math.max(bx1, q[0]); bz0 = Math.min(bz0, q[1]); bz1 = Math.max(bz1, q[1]); });
          cristas.push({ Q: Qc, cx: [bx0 - 1e-6, bx1 + 1e-6, bz0 - 1e-6, bz1 + 1e-6], top: function (x, z) {
            var u = dc[0] * x + dc[1] * z, best = null, rk = du > 0 ? Math.floor((u - umn) / du) : 0;
            /* só a fileira de u e a de antes (a sobreposição de até 10 cm da anterior): o mesmo resultado do laço em todas */
            for (var rr2 = Math.max(0, rk - 1); rr2 <= Math.min(nR - 1, rk + 1); rr2++) {
              var ua2 = umn + (umx - umn) * rr2 / nR, ub2 = umn + (umx - umn) * (rr2 + 1) / nR, ubx2 = rr2 + 1 < nR ? ub2 + Math.min(0.1, (ub2 - ua2) * 0.25) : ub2;
              if (u < ua2 - 1e-6 || u > ubx2 + 1e-6) continue;
              var la = rr2 > 0 ? lift0 : 0, sb = la * (ubx2 - u) / Math.max(1e-9, ubx2 - ua2);
              var y = Sc.y(x, z) + base0 + sb + (sand ? nucleo : 0) + hm * fc + pf.esp * fc;
              if (best == null || y > best) best = y;
            }
            return best;
          } });
        })(Q, S, d, umin, umax, nRow, base, lift, f, ts.reduce(function (m, tt) { return Math.max(m, h(tt)); }, 0));   /* a crista DESENHADA (as amostras da onda), não a teórica */
        var faixaU = ts.map(function (tt, i) {
          var t2 = i === 0 ? tt + 1e-4 : (i === ts.length - 1 ? tt - 1e-4 : tt), cc = cordasT(Q, t2, d, td);
          return cc.length ? [cc[0][0], cc[cc.length - 1][1]] : null;
        });
        for (var r = 0; r < nRow; r++) {
          var ua = umin + (umax - umin) * r / nRow, ub = umin + (umax - umin) * (r + 1) / nRow;
          var ubx = r + 1 < nRow ? ub + Math.min(0.1, (ub - ua) * 0.25) : ub;   /* a de cima cobre a de baixo (recobrimento) */
          var liftA = r > 0 ? lift : 0;
          var sobe = function (u) { return liftA * (ubx - u) / Math.max(1e-9, ubx - ua); };
          var topo = function (u, tt) { return P3(u, tt, sobe(u) + (sand ? nucleo : 0) + h(tt) * f + esp * f); };
          var fundo = sand ? function (u, tt) { return P3(u, tt, sobe(u)); } : function (u, tt) { return P3(u, tt, sobe(u) + h(tt) * f); };
          for (var c = 0; c + 1 < ts.length; c++) {
            var F0 = faixaU[c], F1 = faixaU[c + 1];
            if (!F0 && !F1) continue; if (!F0) F0 = F1; if (!F1) F1 = F0;
            var t0 = ts[c], t1 = ts[c + 1], l0 = Math.max(ua, F0[0]), h0 = Math.min(ubx, F0[1]), l1 = Math.max(ua, F1[0]), h1 = Math.min(ubx, F1[1]);
            var e0 = h0 > l0 + 1e-6, e1 = h1 > l1 + 1e-6;
            if (!e0 && !e1) continue;
            if (!e0) { l0 = h0 = Math.max(ua, Math.min(ubx, h0 < l0 ? (F0[1] < ua ? ua : ubx) : l0)); }
            if (!e1) { l1 = h1 = Math.max(ua, Math.min(ubx, h1 < l1 ? (F1[1] < ua ? ua : ubx) : l1)); }
            var A0 = topo(l0, t0), A1 = topo(h0, t0), B0 = topo(l1, t1), B1 = topo(h1, t1);
            tri(gT, A0, B0, B1); tri(gT, A0, B1, A1);
            var C0 = fundo(l0, t0), C1 = fundo(h0, t0), D0 = fundo(l1, t1), D1 = fundo(h1, t1);
            tri(gB, C0, D1, D0); tri(gB, C0, C1, D1);
            /* T4 — o CORPO: a frente da fileira (o degrau/beiral e o corte do contorno), o topo da última (e onde o contorno
               corta) e as pontas. Os vértices são os MESMOS da face de cima e da de baixo: a fileira fecha sem fresta */
            parede(gW, A0, B0, D0, C0);
            if (r === nRow - 1) parede(gW, A1, B1, D1, C1);
            else if ((h0 < ubx - 1e-6 || h1 < ubx - 1e-6) && extraW + 2 <= orcW) { parede(gW, A1, B1, D1, C1); extraW += 2; }
            if (c === 0) parede(gW, A0, A1, C1, C0);
            if (c + 2 === ts.length) parede(gW, B0, B1, D1, D0);
          }
        }
        if (gT.nTri) { grupos.push(gT); nTot += gT.nTri; }
        if (gB.nTri) { grupos.push(gB); nTot += gB.nTri; }
        if (gW !== gT && gW.nTri) { grupos.push(gW); nTot += gW.nTri; }
      });
    });
    /* a CUMEEIRA e o espigão da telha (peça complementar): um "V" invertido sobre a linha, na altura do topo da telha */
    var gC = { chave: "cumeeira", material: "telha", cumeeira: true, pos: [], nTri: 0 };
    var hTel = pk.camadas.telha; arr(pk.camadasAgua).forEach(function (c) { if (c && c.telha > hTel) hTel = c.telha; });
    var hTop = hTel + (pf.altura + (sand ? nucleo : pf.esp)) * 1.02;
    /* (revisor T3, 20/10/2026) com águas de inclinações DIFERENTES a telha de cada água chega ao espigão na própria cota
       (degrau de 2,6 a 4,3 cm) e o "V" de queda fixa ficava até 6,8 cm acima da telha mais baixa. A capa passa a ASSENTAR nas
       duas águas: amostrada a cada 5 cm ao longo da linha, cada aba desce até a crista da telha DAQUELE lado (+ 2 mm), o meio
       da aba nunca abaixo da telha e a aresta 3 cm acima da crista mais alta. Inclinação única: o "V" de antes, igual. */
    var incs = aguasInclinadas(t).map(function (ag) { return num(ag.inclinacao, 0); }), variaInc = incs.length && Math.max.apply(null, incs) - Math.min.apply(null, incs) > 1e-6;
    var assentos = [], ABA = 0.16, FOLGA = 0.002, SOBE = 0.03;
    function crista(x, z) { var y = null; for (var i = 0; i < cristas.length; i++) { var c = cristas[i], b = c.cx; if (x < b[0] || x > b[1] || z < b[2] || z > b[3] || !T.dentro([x, z], c.Q)) continue; var v = c.top(x, z); if (v != null && (y == null || v > y)) y = v; } return y; }
    if (variaInc) arr(t.linhas).forEach(function (ln) {
      if (ln.tipo !== "cumeeira" && ln.tipo !== "espigao") return;
      var dx = ln.b.x - ln.a.x, dz = ln.b.z - ln.a.z, L = Math.sqrt(dx * dx + dz * dz); if (!(L > 0.1)) return;
      /* amostras a cada 10 cm ao longo da linha; em cada uma, a aba de cada lado em 5 trechos (0, 2, 4, 8, 12 e 16 cm da aresta):
         cada ponto da aba fica acima da crista da telha DAQUELE lado (o degrau entre fileiras incluído), o último assenta nela */
      var nx = -dz / L, nz = dx / L, N = Math.max(2, Math.ceil(L / 0.10)), lin = [], OFS = [0, 0.02, 0.04, 0.08, 0.12, ABA], TIPO = ["", "aresta", "aba", "meio", "aba", "assento"];
      /* (revisor capa, 20/10/2026) a crista ENTRE as amostras: o degrau da fileira da telha cerâmica sobe ~5,7 cm de uma vez
         (lift) e a amostra a cada 10 cm caía antes dele — entre duas amostras a capa (reta) ficava até 4,9 cm DENTRO da telha
         (4 águas 30/45/35/60 %, romana: 171 vértices da telha furando a capa). Cada nó da capa passa a valer o MAIOR da crista
         numa grade fina (2,5 cm ao longo da linha × 1–2 cm na aba) em toda a vizinhança dele (a amostra de antes e a de depois,
         a faixa da aba de antes e a de depois): a capa reta entre dois nós nunca desce abaixo da telha dessa célula. */
      var SUB = 4, FO = [0.01, 0.02, 0.03, 0.04, 0.06, 0.08, 0.10, 0.12, 0.14, ABA], FJ = [0, 1, 3, 5, 7, 9], GR = [[], []], EX = [[], []];   /* FJ: OFS[j] em FO */
      [1, -1].forEach(function (sg, si) { for (var m = 0; m <= SUB * N; m++) { var xm = ln.a.x + dx * m / (SUB * N), zm = ln.a.z + dz * m / (SUB * N); GR[si].push(FO.map(function (o) { return crista(xm + sg * nx * o, zm + sg * nz * o); })); } });
      /* o quanto a crista passa da capa RETA (os dois triângulos do quad, como o quad() abaixo os monta) em cada célula: a parte
         plana da telha a capa já segue; o que sobra é o degrau da fileira. Cada nó sobe o maior excesso das células vizinhas */
      for (var si0 = 0; si0 < 2; si0++) {
        var ex = []; for (var kk = 0; kk <= N; kk++) ex.push(OFS.map(function () { return 0; }));
        for (var kc = 0; kc < N; kc++) for (var jc = 0; jc + 1 < OFS.length; jc++) {
          var C00 = GR[si0][SUB * kc][FJ[jc]], C01 = GR[si0][SUB * kc][FJ[jc + 1]], C10 = GR[si0][SUB * (kc + 1)][FJ[jc]], C11 = GR[si0][SUB * (kc + 1)][FJ[jc + 1]], mx = 0;
          var cnt = [C00, C01, C10, C11].filter(function (v) { return v != null; }), cmin = cnt.length ? Math.min.apply(null, cnt) : null;
          for (var m2 = SUB * kc; m2 <= SUB * (kc + 1); m2++) for (var f2 = FJ[jc]; f2 <= FJ[jc + 1]; f2++) {
            var g = GR[si0][m2][f2]; if (g == null) continue;
            var sP = (m2 - SUB * kc) / SUB, tP = (FO[f2] - FO[FJ[jc]]) / (FO[FJ[jc + 1]] - FO[FJ[jc]]), v;
            if (cnt.length < 4) v = cmin; else v = tP >= sP ? C00 + (C01 - C00) * (tP - sP) + (C11 - C00) * sP : C00 + (C10 - C00) * (sP - tP) + (C11 - C00) * tP;
            if (v == null) v = g; if (g - v > mx) mx = g - v;
          }
          if (mx > 0) [[kc, jc], [kc, jc + 1], [kc + 1, jc], [kc + 1, jc + 1]].forEach(function (q) { if (mx > ex[q[0]][q[1]]) ex[q[0]][q[1]] = mx; });
        }
        EX[si0] = ex;
      }
      function envCr(si, k, j) { var c = GR[si][SUB * k][FJ[j]]; return c == null ? null : c + EX[si][k][j]; }
      for (var k = 0; k <= N; k++) {
        var x = ln.a.x + dx * k / N, z = ln.a.z + dz * k / N, cr = [[], []], cl = -Infinity;
        [1, -1].forEach(function (sg, si) { OFS.forEach(function (o, j) { var c = envCr(si, k, j); cr[si].push(c); if (c != null && j <= 3) cl = Math.max(cl, c); }); });
        if (!isFinite(cl)) { lin.push(null); continue; }
        var ap = [x, cl + SOBE, z], lados = [];
        [1, -1].forEach(function (sg, si) {
          var cs = cr[si][OFS.length - 1], seatY = cs != null ? cs + FOLGA : cl - SOBE, pts = [ap];
          if (cr[si][0] != null) assentos.push({ x: r4(x + sg * nx * 0.001), z: r4(z + sg * nz * 0.001), y: r4(ap[1]), tipo: "cume", linha: ln.tipo });   /* a aresta, rente à linha, de cada lado */
          for (var j = 1; j < OFS.length; j++) {
            var o = OFS[j], xo = x + sg * nx * o, zo = z + sg * nz * o, c = cr[si][j];
            var y = j === OFS.length - 1 ? seatY : Math.max(ap[1] + (seatY - ap[1]) * o / ABA, c == null ? -Infinity : c + FOLGA);
            pts.push([xo, y, zo]);
            if (c != null) assentos.push({ x: r4(xo), z: r4(zo), y: r4(y), tipo: TIPO[j], linha: ln.tipo });
          }
          lados.push(pts);
        });
        lin.push({ l: lados });
      }
      function quad(p0, p1, p2, p3) { gC.pos.push(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], p2[0], p2[1], p2[2], p0[0], p0[1], p0[2], p2[0], p2[1], p2[2], p3[0], p3[1], p3[2]); gC.nTri += 2; }
      for (var k2 = 0; k2 < N; k2++) {
        var A = lin[k2], B = lin[k2 + 1]; if (!A || !B) continue;
        for (var sd = 0; sd < 2; sd++) for (var j2 = 0; j2 + 1 < OFS.length; j2++) quad(A.l[sd][j2], A.l[sd][j2 + 1], B.l[sd][j2 + 1], B.l[sd][j2]);
      }
    });
    if (!variaInc) arr(t.linhas).forEach(function (ln) {
      if (ln.tipo !== "cumeeira" && ln.tipo !== "espigao") return;
      var a = [ln.a.x, ln.a.y + hTop, ln.a.z], b = [ln.b.x, ln.b.y + hTop, ln.b.z], dx = b[0] - a[0], dz = b[2] - a[2], L = Math.sqrt(dx * dx + dz * dz); if (!(L > 0.1)) return;
      var nx = -dz / L * 0.16, nz = dx / L * 0.16, cai = 0.16 * 0.35, sobe = 0.03;
      var a0 = [a[0] + nx, a[1] - cai, a[2] + nz], a1 = [a[0], a[1] + sobe, a[2]], a2 = [a[0] - nx, a[1] - cai, a[2] - nz];
      var b0 = [b[0] + nx, b[1] - cai, b[2] + nz], b1 = [b[0], b[1] + sobe, b[2]], b2 = [b[0] - nx, b[1] - cai, b[2] - nz];
      [[a0, a1, b1, b0], [a1, a2, b2, b1]].forEach(function (q) { gC.pos.push(q[0][0], q[0][1], q[0][2], q[1][0], q[1][1], q[1][2], q[2][0], q[2][1], q[2][2], q[0][0], q[0][1], q[0][2], q[2][0], q[2][1], q[2][2], q[3][0], q[3][1], q[3][2]); gC.nTri += 2; });
    });
    if (gC.nTri) { grupos.push(gC); nTot += gC.nTri; }
    return { grupos: grupos, nTri: nTot, teto: teto, assentos: assentos };
  }

  /* o quantitativo do telhado com modelo, no formato do BimCobertura.quantitativo (lista de material) */
  function quantitativoModelos(estado) {
    var itens = [], avisos = [];
    arr(estado && estado.telhados).forEach(function (t) {
      if (!t || !t.pacote || !t.pacote.ok) return;
      arr(t.pacote.quantitativo).forEach(function (q) {
        /* detalhamento (incluso numa composição): fica na lista de corte/material, mas NÃO é orçado (orcarAParte false, sem código) */
        if (q.informativo) itens.push({ grupo: "Detalhamento (incluso na composição)", item: q.item, un: q.un, qtd: q.qtd, sinapi: null, orcarAParte: false, informativo: true, inclusoEm: q.inclusoEm,
                                        obs: "DETALHAMENTO — incluso em " + q.inclusoEm + ": não soma no orçamento. " + (q.obs || ""), telhado: t.id, partida: q.partida, modelo: t.modelo });
        else itens.push({ grupo: q.grupo, item: q.item, un: q.un, qtd: q.qtd, sinapi: q.sinapi || null, orcarAParte: !q.sinapi, obs: (q.partida ? "VALOR DE PARTIDA — conferir. " : "") + (q.obs || ""), telhado: t.id, partida: q.partida, modelo: t.modelo });
      });
      /* os avisos do pacote já estão em t.avisos (o BimTelhado.fim junta) e o BimCobertura.quantitativo lista t.avisos do
         telhado com telha de catálogo — aqui só os do tipo sem catálogo, senão cada aviso saía duas vezes (revisor T1) */
      var Tq = BT(); if (!(Tq && Tq.telha(t.tipoId))) arr(t.pacote.avisos).forEach(function (a) { avisos.push("Telhado " + t.id + ": " + a); });
    });
    return { itens: itens, avisos: avisos };
  }

  instalarAjuste();
  var BimTelhadoEstrut = {
    PADRAO: PADRAO, SECOES_MADEIRA: SECOES_MADEIRA, FONTE_MADEIRA: FONTE_MADEIRA, secaoMadeira: secaoMadeira,
    gerar: gerar, opLote: opLote, opsSubstituir: opsSubstituir, estruturaDoTelhado: estruturaDoTelhado, quantitativo: quantitativo,
    entradaCalculo: entradaCalculo, verificarAco: verificarAco, resumoDePecas: resumoDePecas,
    alturaPerfilAco: alturaPerfilAco, cordasU: cordasU, cordasT: cordasT, trechoNaParede: trechoNaParede, paredesDe: paredesDe,
    /* TELHADO PARAMÉTRICO (T1) */
    PREGOS_CAT: PREGOS_CAT, NBR_PREGO: NBR_PREGO, verificarPrego: verificarPrego, escolherPrego: escolherPrego, nosDasTesouras: nosDasTesouras,
    MODELOS: MODELOS, SEC: SEC, ESPAC: ESPAC, TESOURAS_SINAPI: TESOURAS_SINAPI, PREGOS: PREGOS, PERFIS_TEL: PERFIS_TEL, TETO_TRI_AGUA: TETO_TRI_AGUA,
    TELHAMENTO_SINAPI: TELHAMENTO_SINAPI, composicaoTelhamento: composicaoTelhamento, ajustarQuantCobertura: ajustarQuantCobertura,
    modeloSugerido: modeloSugerido, modelar: modelar, geometria: geometria,
    /* T5: editar uma peça da estrutura derivada */
    ROTULO_PECA: ROTULO_PECA, rotuloPeca: rotuloPeca, sobreporValido: sobreporValido, mesclarSobrepor: mesclarSobrepor, pecaMaisPerto: pecaMaisPerto, malhaPeca: malhaPeca,
    opcoesSecao: opcoesSecao, opPeca: opPeca,
    /* T6: arrastar a peça com o mouse */
    planoArrasto: planoArrasto, raioNoPlano: raioNoPlano, raioNaReta: raioNaReta, arrastoPeca: arrastoPeca, esticarAlcaPeca: esticarAlcaPeca, camposDesloc: camposDesloc, camposEsticar: camposEsticar, pecaMovida: pecaMovida, planoNaParede: planoNaParede, quantitativoModelos: quantitativoModelos, perfilFn: perfilFn
  };
  global.BimTelhadoEstrut = BimTelhadoEstrut;
  if (typeof module !== "undefined" && module.exports) module.exports = BimTelhadoEstrut;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
