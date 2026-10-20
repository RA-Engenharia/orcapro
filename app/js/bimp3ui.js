/* =====================================================================
 * bimp3ui.js — a TELA da P3 (telhado, bordas do telhado e fundação), só
 * com a prévia `?previa=modelador`.
 *
 * Os motores são o js/bimtelhado.js e o js/bimfundacao.js (puros). Aqui:
 *   · a FITA: "Cobertura" (Arquitetura) e "Fundação" (Estrutura) saem do
 *     "em breve" com a prévia (Ribbon.SOBRE_MODELADOR, gravado quando este
 *     arquivo carrega — antes do `reorganizar`); o painel "Telhado" ganha
 *     "Bordas do telhado" e "Unir telhado";
 *   · as Propriedades da FERRAMENTA (tipo, inclinação, águas, beiral; tipo de
 *     fundação e medidas; tipo de borda) e as OPS que a ferramenta manda;
 *   · o 3D (montar3d): os cliques (retângulo, contorno, extrusão; ponto,
 *     dois pontos, contorno; aresta do telhado; telhado A → telhado B), a
 *     linha de prévia e o DESENHO das peças (prismas INDEXADOS — a malha
 *     mesclada só leva malha com índice). Quem chama é o js/bim.js (ganchos
 *     "P3"); a planta e o corte 2D saem do desenho (BIM.vista2d corta as
 *     malhas — nada a fazer aqui).
 * T4 (20/10/2026): o DESENHO do telhado pela barra da ferramenta (js/bimbarraopcoes.js pinta `barraTelhado`):
 * tipo (1 água, 2 águas, várias águas), modo (retângulo, LINHA, POR CORTE), "Seguir inclinação de…" (1 água)
 * e as cotas digitáveis; prévia ao vivo (fantasma no 3D, contorno + setas na planta — js/bimplantamodelar.js),
 * Esc cancela, Enter confirma. Tudo sai como a op `telhado` de perímetro (o mesmo motor). Teste:
 * tools/test-telhado-desenho.js e tools/e2e-telhado-desenho.js.
 * As Propriedades da PEÇA vêm do registro (js/bimparam.js, categorias
 * telhado, borda e fundacao) pela paleta da P1-C (js/bimpropsui.js).
 *
 * Sem a prévia NADA daqui roda: `registrar` e `montar3d` saem na hora.
 * ===================================================================== */
(function (global) {
  "use strict";
  function TM() { return global.BimTelhado || null; }
  function ESM() { return global.BimTelhadoEstrut || null; }
  function FM() { return global.BimFundacao || null; }
  function previa() { try { return !!(global.BimPrevia && global.BimPrevia.modelador()); } catch (e) { return false; } }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  function num(v, d) { if (v == null || v === "") return d; var x = parseFloat(String(v).replace(",", ".")); return isFinite(x) ? x : d; }
  function n2(v, c) { var x = Number(v); return isFinite(x) ? x.toFixed(c == null ? 2 : c).replace(".", ",") : "—"; }
  function ro(id, rot, v) { return { id: id, rotulo: rot, leitura: true, valor: v == null || v === "" ? "—" : v }; }
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }

  var cfg = {
    telhado: { modo: "retangulo", aguas: 4, inclinacao: 30, beiral: 0.5, tipoId: "generico-8", deslocBase: null, comprimentoExtrusao: null, modelo: "auto", beiralMexido: false,
               ref: "beiral", comp: null, larg: null, seguir: null },   /* T4: linha de referência (beiral/cumeeira), cotas digitadas e a peça seguida */
    fundacao: { tipoFundacao: "sapata", largura: 1.2, comprimento: 1.2, altura: 0.4, alturaBase: null, larguraTopo: null, comprimentoTopo: null,
                nEstacas: 2, diametro: 0.3, comprimentoEstaca: 6, espacamento: 0.9, deslocTopo: 0, taxaAco: null, fck: null, lastro: 0.05, folga: 0, terreno: 0, radierModo: "retangulo" },
    borda: { tipoBorda: "calha" }
  };
  var ROT_FUND = { sapata: "Sapata isolada", bloco: "Bloco sobre estacas", estaca: "Estaca", baldrame: "Baldrame (viga de fundação)", radier: "Radier" };

  /* a fita: com a prévia, Cobertura e Fundação deixam o "em breve" (o
     reorganizar da Gestao lê isto; por isso é na CARGA do arquivo) */
  (function () {
    var R = global.BimRibbon; if (!R) return;
    R.SOBRE_MODELADOR = R.SOBRE_MODELADOR || {};
    R.SOBRE_MODELADOR.cobertura = { emBreve: false, tipo: "alterna", rotulo: "Telhado", dica: "Telhado: na barra da ferramenta, o TIPO (1 água, 2 águas, várias águas) e o DESENHO — retângulo (dois cantos), LINHA (início e fim do beiral ou da cumeeira e o lado do caimento) ou POR CORTE (a linha do perfil e onde começa e termina); no de 1 água, \"Seguir inclinação de…\" uma peça. Também por PERÍMETRO (contorno qualquer — L, T, U), inclinação POR ARESTA (a aresta que não define vira oitão), beiral; ou por EXTRUSÃO. Espigão, rincão e cumeeira saem sozinhos; área inclinada, projeção e as linhas no quantitativo. As paredes com \"anexar topo\" sobem até ele." };
    R.SOBRE_MODELADOR.fundacao = { emBreve: false, tipo: "alterna", dica: "Fundação: sapata (reta ou chanfrada), bloco sobre 1 a 6 estacas, estaca, baldrame e radier. Volume, fôrma, lastro, escavação, reaterro e o aço pela taxa (kg/m³) no quantitativo e no Orçamento do modelo." };
  })();

  /* =====================================================================
   * T4 — O DESENHO DO TELHADO (puro, Node-testável: tools/test-telhado-desenho.js)
   * Pedido do Rogério (20/10/2026): ao clicar em Telhado, ícones na barra da ferramenta para o TIPO
   * (1 água, 2 águas, várias águas) e o MODO de desenho:
   *   · RETÂNGULO — dois cantos (o de sempre);
   *   · LINHA — o início e o fim da linha de referência (beiral ou cumeeira) e um clique para o lado
   *     do CAIMENTO (a distância dele à linha é a largura da água);
   *   · CORTE (perfil) — a linha do perfil (do beiral à cumeeira; no 3D, com a altura dos pontos a
   *     inclinação sai dela) e depois onde o telhado COMEÇA e onde TERMINA.
   * E, no de 1 água, "Seguir inclinação de…": a inclinação, o sentido do caimento e a cota de apoio
   * vêm de uma peça (viga/terça inclinada, peça de madeira, face inclinada de volume/laje).
   * Tudo vira o CONTORNO da op `telhado` de sempre (perímetro, com as arestas que não definem
   * inclinação marcadas d:false): o mesmo motor, a mesma estrutura (modelo), o mesmo quantitativo.
   * Convenção: aresta k = do ponto k ao k+1; no de 1 água a aresta 0 é o BEIRAL (o pé do caimento).
   * ===================================================================== */
  function P2(x, z) { return { x: x, z: z }; }
  function cont(lst, defs) { return lst.map(function (q, k) { var o = { x: Math.round(q.x * 1e6) / 1e6, z: Math.round(q.z * 1e6) / 1e6 }; if (defs[k] === false) o.d = false; return o; }); }
  /* as SETAS do caimento (prévia): uma por aresta que define, do meio da água para a aresta (o sentido da água) */
  function setasDoContorno(C) {
    var n = C.length, cx = 0, cz = 0, out = [];
    C.forEach(function (q) { cx += q.x / n; cz += q.z / n; });
    for (var k = 0; k < n; k++) {
      if (C[k].d === false) continue;
      var a = C[k], b = C[(k + 1) % n], mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, ex = b.x - a.x, ez = b.z - a.z, L = Math.sqrt(ex * ex + ez * ez); if (!(L > 1e-6)) continue;
      var nx = -ez / L, nz = ex / L; if ((cx - mx) * nx + (cz - mz) * nz < 0) { nx = -nx; nz = -nz; }
      var prof = Math.abs((cx - mx) * nx + (cz - mz) * nz), c0 = Math.min(prof * 0.8, 2.5), c1 = Math.min(prof * 0.15, 0.3);
      out.push({ de: P2(mx + nx * c0, mz + nz * c0), ate: P2(mx + nx * c1, mz + nz * c1), dir: P2(-nx, -nz), aresta: k });
    }
    return out;
  }
  /* LINHA: p1→p2 é a linha de referência; p3 diz o lado (e a largura, se o campo Largura estiver vazio).
     o = { aguas: 1|2|4, ref: "beiral"|"cumeeira", comprimento?, largura? } */
  function retanguloDeLinha(p1, p2, p3, o) {
    o = o || {};
    if (!p1 || !p2) return { ok: false, motivo: "Clique o início e o fim da linha do telhado." };
    var dx = p2.x - p1.x, dz = p2.z - p1.z, L = Math.sqrt(dx * dx + dz * dz);
    if (!(L > 1e-6)) return { ok: false, motivo: "A linha do telhado precisa de comprimento." };
    var ux = dx / L, uz = dz / L;
    if (fin(o.comprimento) && o.comprimento > 0) L = o.comprimento;
    if (!(L > 0.3)) return { ok: false, motivo: "Linha curta demais para o telhado (mínimo 0,30 m)." };
    var n0x = -uz, n0z = ux, s = 1, w = null;
    if (p3) { var dd = (p3.x - p1.x) * n0x + (p3.z - p1.z) * n0z; s = dd < 0 ? -1 : 1; w = Math.abs(dd); }
    if (fin(o.largura) && o.largura > 0) w = o.largura;
    if (w == null) return { ok: false, motivo: "Clique para que lado é o caimento." };
    if (!(w > 0.3)) return { ok: false, motivo: "Clique mais longe da linha: a água precisa de largura (mínimo 0,30 m)." };
    var nx = n0x * s, nz = n0z * s, ag = o.aguas === 1 || o.aguas === 2 ? o.aguas : 4, cume = o.ref === "cumeeira";
    function Q(a, b) { return P2(p1.x + ux * a + nx * b, p1.z + uz * a + nz * b); }
    var lst, defs;
    if (!cume) { lst = [Q(0, 0), Q(L, 0), Q(L, w), Q(0, w)]; defs = ag === 1 ? [true, false, false, false] : (ag === 2 ? [true, false, true, false] : [true, true, true, true]); }
    else if (ag === 1) { lst = [Q(0, w), Q(L, w), Q(L, 0), Q(0, 0)]; defs = [true, false, false, false]; }
    else if (ag === 2) { lst = [Q(0, -w), Q(L, -w), Q(L, w), Q(0, w)]; defs = [true, false, true, false]; }
    else { lst = [Q(-w, -w), Q(L + w, -w), Q(L + w, w), Q(-w, w)]; defs = [true, true, true, true]; }
    var C = cont(lst, defs);
    return { ok: true, contorno: C, setas: setasDoContorno(C), comprimento: L, largura: w, p2: Q(L, 0), lado: P2(nx, nz) };
  }
  /* CORTE (perfil): p1→p2 = a linha do perfil, do BEIRAL (p1, o pé) à CUMEEIRA (p2); com a altura dos dois
     pontos (3D) a inclinação é a da linha e o ponto mais baixo é o pé. p3/p4 = onde o telhado começa e
     termina (medidos na perpendicular à linha). 1 água: a linha é a água inteira; 2 e várias águas: a outra
     metade espelha na cumeeira. o = { aguas, inclinacao } */
  function retanguloDeCorte(p1, p2, p3, p4, o) {
    o = o || {};
    if (!p1 || !p2) return { ok: false, motivo: "Desenhe a linha do perfil: clique o beiral e a cumeeira." };
    var a = p1, b = p2, tem3d = fin(a.y) && fin(b.y) && Math.abs(b.y - a.y) > 0.01;
    if (tem3d && b.y < a.y) { a = p2; b = p1; }
    var dx = b.x - a.x, dz = b.z - a.z, L = Math.sqrt(dx * dx + dz * dz);
    if (!(L > 0.3)) return { ok: false, motivo: "Linha do perfil curta demais na planta (mínimo 0,30 m)." };
    var ux = dx / L, uz = dz / L, nx = -uz, nz = ux, incl = tem3d ? Math.abs(b.y - a.y) / L * 100 : num(o.inclinacao, 30);
    var TT = TM(), LI = TT && TT.LIM ? TT.LIM.inclinacao : [1, 300];
    if (!(incl >= LI[0] && incl <= LI[1])) return { ok: false, motivo: "Inclinação do perfil fora da faixa (" + LI[0] + " a " + LI[1] + " %): " + n2(incl, 1) + " %." };
    var ag = o.aguas === 1 || o.aguas === 2 ? o.aguas : 4, Lt = ag === 1 ? L : 2 * L;
    var base = { ok: true, inclinacao: Math.round(incl * 1e4) / 1e4, cotaApoio: tem3d ? a.y : null, perfil: [a, b], vao: Lt };
    if (!p3) return base;
    var w3 = (p3.x - a.x) * nx + (p3.z - a.z) * nz, w4 = p4 ? (p4.x - a.x) * nx + (p4.z - a.z) * nz : w3;
    if (!p4) { base.inicio = w3; return base; }
    var w0 = Math.min(w3, w4), w1 = Math.max(w3, w4);
    if (!(w1 - w0 > 0.3)) return { ok: false, motivo: "O começo e o fim do telhado estão perto demais (mínimo 0,30 m)." };
    function Q(u, w) { return P2(a.x + ux * u + nx * w, a.z + uz * u + nz * w); }
    var lst = [Q(0, w1), Q(0, w0), Q(Lt, w0), Q(Lt, w1)], defs = ag === 1 ? [true, false, false, false] : (ag === 2 ? [true, false, true, false] : [true, true, true, true]);
    var C = cont(lst, defs);
    base.contorno = C; base.setas = setasDoContorno(C); base.comprimento = w1 - w0; base.largura = Lt;
    return base;
  }
  /* SEGUIR INCLINAÇÃO DE UMA PEÇA: info = { a:{x,y,z}, b:{x,y,z} } (o eixo de uma barra/viga/peça, e `topo` =
     quanto o apoio fica acima do eixo) ou { normal:{x,y,z}, ponto:{x,y,z} } (uma face). Devolve a inclinação (%),
     o sentido do caimento (para onde a água DESCE, unitário na planta) e o ponto de apoio (x, y, z). */
  function inclinacaoDePeca(info, rotulo) {
    var TT = TM(), LI = TT && TT.LIM ? TT.LIM.inclinacao : [1, 300], s, dir, ponto;
    if (!info) return { ok: false, motivo: "Clique numa peça inclinada (viga, terça, peça de madeira ou face inclinada)." };
    if (info.a && info.b) {
      var dx = info.b.x - info.a.x, dy = info.b.y - info.a.y, dz = info.b.z - info.a.z, h = Math.sqrt(dx * dx + dz * dz);
      if (!(h > 1e-3)) return { ok: false, motivo: "Essa peça está em pé (vertical): escolha uma peça inclinada." };
      s = Math.abs(dy) / h; dir = dy > 0 ? P2(-dx / h, -dz / h) : P2(dx / h, dz / h);
      var tp = fin(info.topo) ? info.topo : 0;
      ponto = { x: (info.a.x + info.b.x) / 2, y: (info.a.y + info.b.y) / 2 + tp, z: (info.a.z + info.b.z) / 2 };
    } else if (info.normal && info.ponto) {
      var nx = info.normal.x, ny = info.normal.y, nz = info.normal.z, nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (!(nl > 1e-9)) return { ok: false, motivo: "Face sem direção." };
      nx /= nl; ny /= nl; nz /= nl; if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
      var hz = Math.sqrt(nx * nx + nz * nz);
      if (ny < 1e-3) return { ok: false, motivo: "Essa face está em pé (vertical): clique na face de CIMA da peça." };
      if (hz < 1e-4) return { ok: false, motivo: "Essa face é horizontal (sem inclinação): clique numa face inclinada." };
      s = hz / ny; dir = P2(nx / hz, nz / hz); ponto = { x: info.ponto.x, y: info.ponto.y, z: info.ponto.z };
    } else return { ok: false, motivo: "Clique numa peça inclinada (viga, terça, peça de madeira ou face inclinada)." };
    var pct = s * 100;
    if (pct < 0.5) return { ok: false, motivo: "Essa peça está na horizontal (" + n2(pct, 2) + " %): escolha uma peça inclinada." };
    if (!(pct >= LI[0] && pct <= LI[1])) return { ok: false, motivo: "A inclinação da peça (" + n2(pct, 1) + " %) está fora da faixa do telhado (" + LI[0] + " a " + LI[1] + " %)." };
    return { ok: true, inclinacao: Math.round(pct * 1e4) / 1e4, dir: dir, ponto: ponto, rotulo: rotulo || "peça" };
  }
  /* o RETÂNGULO de 1 água que segue a peça: os dois cantos medidos no sistema do caimento (u = para onde desce,
     v = ao longo do beiral); a aresta 0 é o beiral (o lado mais baixo); a cota de apoio põe o plano na peça */
  function retanguloSeguindo(p1, p2, seg) {
    if (!seg || !seg.ok) return { ok: false, motivo: "Escolha a peça a seguir." };
    if (!p1 || !p2) return { ok: false, motivo: "Clique dois cantos opostos." };
    var U = seg.dir, V = P2(-U.z, U.x);
    var u1 = p1.x * U.x + p1.z * U.z, u2 = p2.x * U.x + p2.z * U.z, v1 = p1.x * V.x + p1.z * V.z, v2 = p2.x * V.x + p2.z * V.z;
    var umn = Math.min(u1, u2), umx = Math.max(u1, u2), vmn = Math.min(v1, v2), vmx = Math.max(v1, v2);
    if (!(umx - umn > 0.3 && vmx - vmn > 0.3)) return { ok: false, motivo: "Retângulo pequeno demais para o telhado." };
    function Q(u, v) { return P2(U.x * u + V.x * v, U.z * u + V.z * v); }
    var C = cont([Q(umx, vmn), Q(umx, vmx), Q(umn, vmx), Q(umn, vmn)], [true, false, false, false]);
    var s = seg.inclinacao / 100, uP = seg.ponto.x * U.x + seg.ponto.z * U.z;
    return { ok: true, contorno: C, setas: setasDoContorno(C), inclinacao: seg.inclinacao, cotaApoio: seg.ponto.y - s * (umx - uP), comprimento: vmx - vmn, largura: umx - umn };
  }
  /* o RETÂNGULO de sempre (dois cantos) como contorno — para a prévia e para os campos digitados */
  function retanguloDoisCantos(p1, p2, o) {
    o = o || {};
    if (!p1 || !p2) return { ok: false, motivo: "Clique dois cantos opostos." };
    var sx = p2.x >= p1.x ? 1 : -1, sz = p2.z >= p1.z ? 1 : -1;
    var q2 = P2(fin(o.comprimento) && o.comprimento > 0 ? p1.x + sx * o.comprimento : p2.x, fin(o.largura) && o.largura > 0 ? p1.z + sz * o.largura : p2.z);
    var x0 = Math.min(p1.x, q2.x), x1 = Math.max(p1.x, q2.x), z0 = Math.min(p1.z, q2.z), z1 = Math.max(p1.z, q2.z);
    if (!(x1 - x0 > 0.3 && z1 - z0 > 0.3)) return { ok: false, motivo: "Retângulo pequeno demais para o telhado." };
    var T = TM(), op = T ? T.op("x", { contorno: [P2(x0, z0), P2(x1, z0), P2(x1, z1), P2(x0, z1)], aguas: o.aguas === 1 || o.aguas === 2 ? o.aguas : 4, inclinacao: 30 }) : null;
    var C = op ? op.contorno : cont([P2(x0, z0), P2(x1, z0), P2(x1, z1), P2(x0, z1)], [true, true, true, true]);
    return { ok: true, contorno: C, setas: setasDoContorno(C), p2: q2, comprimento: x1 - x0, largura: z1 - z0 };
  }
  var DESENHO = { retanguloDeLinha: retanguloDeLinha, retanguloDeCorte: retanguloDeCorte, inclinacaoDePeca: inclinacaoDePeca, retanguloSeguindo: retanguloSeguindo,
                  retanguloDoisCantos: retanguloDoisCantos, setasDoContorno: setasDoContorno };

  var BimP3UI = {
    ativo: previa,
    desenho: DESENHO,
    cfg: function (k) { return JSON.parse(JSON.stringify(k ? cfg[k] : cfg)); },
    ROT_FUND: ROT_FUND,

    /* ---------------------------------------------------------- a fita */
    registrar: function (reg, arqui, opts) {
      var pv = opts && opts.previa != null ? !!opts.previa : previa();
      var R = global.BimRibbon;
      if (!pv || !R || !TM() || !FM() || !reg) return false;
      R.acrescentar("arquitetura", "Arquitetura", "Telhado", [
        { id: "telhado-borda", rotulo: "Bordas do\ntelhado", icone: "regua", grande: true, tipo: "alterna",
          dica: "Calha, rufo, testeira e intradorso (forro do beiral): escolha em Propriedades e clique perto da aresta do telhado. O comprimento (inclinado na empena) e a área vão para o quantitativo." },
        { id: "telhado-modelo", rotulo: "Telhado\ncompleto", icone: "estrutura", grande: true, tipo: "menu",
          dica: "Modelo do telhado: madeiramento (tesoura, terça, caibro, ripa) ou estrutura metálica (terça Ue) e TODAS as telhas modeladas, derivados do telhado — muda a inclinação, muda tudo. Pregos, parafusos e fixação da telha no Quantitativo da cobertura. Vale para os telhados do modelo e para os próximos (Propriedades da ferramenta Telhado › Modelo).",
          itens: [{ id: "tel-mod-auto", rotulo: "Automático pela telha", icone: "telhado" }, { id: "tel-mod-mad-tesoura", rotulo: "Madeira — tesoura + terça + caibro + ripa", icone: "estrutura" },
                  { id: "tel-mod-mad-terca", rotulo: "Madeira — terça + caibro + ripa (paredes/pontaletes)", icone: "estrutura" }, { id: "tel-mod-mad-terca-direta", rotulo: "Madeira — terça (fibrocimento/termoacústica)", icone: "estrutura" },
                  { id: "tel-mod-mad-tesoura-terca", rotulo: "Madeira — tesoura + terça (fibrocimento/termoacústica)", icone: "estrutura" },
                  { id: "tel-mod-mad-onduline", rotulo: "Madeira — ripas a 46 cm (Onduline)", icone: "estrutura" }, { id: "tel-mod-mad-shingle", rotulo: "Madeira — OSB + subcobertura (shingle)", icone: "estrutura" },
                  { id: "tel-mod-aco-trapezoidal", rotulo: "Metálica — terça Ue + trapezoidal", icone: "estrutura" }, { id: "tel-mod-aco-sanduiche", rotulo: "Metálica — terça Ue + sanduíche", icone: "estrutura" },
                  { id: "tel-mod-aco-viga", rotulo: "Metálica — terça Ue + viga W com pilar na cumeeira (baixa inclinação)", icone: "estrutura" },
                  { id: "tel-mod-nenhum", rotulo: "Sem estrutura (só o telhado)", icone: "telhado" }] },
        { id: "telhado-unir", rotulo: "Unir\ntelhado", icone: "mais", grande: true, tipo: "alterna",
          dica: "Unir/desunir telhado: clique o telhado que ENTRA e depois o telhado em que ele encosta — a parte que fica por baixo sai e o rincão do encontro é medido. Clicar de novo o mesmo par desune." }
      ]);
      ["telhado-borda", "telhado-unir", "cobertura", "fundacao"].forEach(function (k) { if (R._EXCLUSIVOS && R._EXCLUSIVOS.indexOf(k) < 0) R._EXCLUSIVOS.push(k); });
      function armar(sub) {
        return function (e) {
          if (e && e.ligado === false) { var b = global.BIM; if (b && b.editarArmar) b.editarArmar(null); return true; }
          return arqui && arqui.armar ? arqui.armar(sub) : false;
        };
      }
      reg.cobertura = armar("telhado"); reg.fundacao = armar("fundacao");
      reg["telhado-borda"] = armar("telhado-borda"); reg["telhado-unir"] = armar("telhado-unir");
      /* T1: o modelo do telhado (os que existem + os próximos) — um lote, um Ctrl+Z */
      var self = BimP3UI;
      reg["telhado-modelo"] = function () { return true; };
      ["auto", "nenhum", "mad-tesoura", "mad-terca", "mad-terca-direta", "mad-tesoura-terca", "mad-onduline", "mad-shingle", "aco-trapezoidal", "aco-sanduiche", "aco-viga"].forEach(function (mid) {
        reg["tel-mod-" + mid] = function () {
          cfg.telhado.modelo = mid;
          var B = global.BIM, E = global.BimEdit, st = null;
          try { st = B && B.editarOps && E ? E.aplicar(B.editarOps()) : null; } catch (eS) { st = null; }
          var ops = self.opsModelo(st, mid === "nenhum" ? null : mid), rot = mid === "auto" ? "automático pela telha" : self.rotuloModelo(mid === "nenhum" ? null : mid);
          if (ops.length && B && B.editarLote && B.editarLote({ op: "lote", id: "tel-mod-" + mid, origem: "modelo-telhado", ops: ops })) {
            var av2 = [];
            try { var st2 = E.aplicar(B.editarOps()); arr(st2 && st2.telhados).forEach(function (t) { if (t && t.pacote) arr(t.pacote.avisos).forEach(function (a) { av2.push("Telhado " + t.id + ": " + a); }); }); } catch (eA) { av2 = []; }
            status("Modelo do telhado: " + rot + " (" + ops.length + " telhado(s)). Quantitativo em Cobertura completa › Quantitativo da cobertura." + (av2.length ? " AVISOS: " + av2.join(" | ") : ""));
          }
          else status("Próximos telhados nascem com o modelo: " + rot + ".");
          return true;
        };
      });
      if (global.BimCoberturaUI) global.BimCoberturaUI.registrar(reg, arqui, opts);   /* COBERTURA COMPLETA: estrutura, platibanda, calha, sanca… (js/bimcoberturaui.js) */
      return true;
    },

    /* ---------------------------------------------- Propriedades da ferramenta */
    esquema: function (sub, arqui) {
      var self = this, secs = [], T = TM(), F = FM();
      if (!T || !F) return null;
      if (arqui && arqui._secNivel && (sub === "telhado" || sub === "fundacao")) secs.push(arqui._secNivel());
      var titulo = "Ferramenta";
      if (sub === "telhado") {
        var c = cfg.telhado, t = T.tipo(c.tipoId);
        titulo = "Ferramenta: Telhado";
        secs.push({ nome: "Telhado", params: [
          { id: "b2f:te:tipoId", rotulo: "Tipo", tipo: "lista", valor: t.id, opcoes: T.TIPOS.map(function (x) { return { id: x.id, rotulo: x.rotulo }; }) },
          { id: "b2f:te:modo", rotulo: "Desenho", tipo: "lista", valor: c.modo, opcoes: [{ id: "retangulo", rotulo: "Retângulo — dois cantos" }, { id: "linha", rotulo: "Linha — início, fim e o lado do caimento" }, { id: "corte", rotulo: "Por corte — perfil, começo e fim" }, { id: "contorno", rotulo: "Perímetro — clique os cantos" }, { id: "extrusao", rotulo: "Extrusão — base e comprimento" }] },
          { id: "b2f:te:aguas", rotulo: "Águas", tipo: "lista", valor: String(c.aguas), opcoes: [{ id: "4", rotulo: "Várias águas (4 águas / espigão)" }, { id: "2", rotulo: "2 águas" }, { id: "1", rotulo: "1 água" }] },
          { id: "b2f:te:ref", rotulo: "A linha desenhada é (Linha)", tipo: "lista", valor: c.ref, opcoes: [{ id: "beiral", rotulo: "o beiral (pé da água)" }, { id: "cumeeira", rotulo: "a cumeeira (topo)" }] },
          ro("b2f:te:seguirEf", "Seguir inclinação de (1 água)", c.seguir && c.aguas === 1 ? c.seguir.rotulo + " — " + n2(c.seguir.inclinacao, 1) + " %" : "—"),
          { id: "b2f:te:modelo", rotulo: "Modelo (estrutura e telhas)", tipo: "lista", valor: c.modelo || "nenhum", opcoes: self.opcoesModelo() },
          ro("b2f:te:modeloEf", "Modelo que sai", self.rotuloModelo(self.modeloEf(c))),
          { id: "b2f:te:inclinacao", rotulo: "Inclinação", unidade: "%", tipo: "numero", passo: "1", valor: c.inclinacao },
          ro("b2f:te:incMin", "Inclinação mínima do fabricante", (function () { var tl = T.telha(c.tipoId); return tl && fin(tl.inclinacaoMinPct) ? n2(tl.inclinacaoMinPct, 1) + " %" + (c.inclinacao < tl.inclinacaoMinPct - 1e-9 ? " — ABAIXO DO MÍNIMO" : "") : (tl ? "não verificada (valor de partida)" : "— (tipo sem catálogo)"); })()),
          { id: "b2f:te:beiral", rotulo: "Beiral (projeção na parede)", unidade: "m", tipo: "numero", passo: "0.05", valor: self.beiralEf(c) },
          { id: "b2f:te:deslocBase", rotulo: "Deslocamento da base do nível (vazio = pé-direito)", unidade: "m", tipo: "numero", passo: "0.05", valor: c.deslocBase == null ? "" : c.deslocBase },
          ro("b2f:te:esp", "Espessura (soma das camadas)", n2(t.espessura * 1000, 0) + " mm")
        ] });
      } else if (sub === "fundacao") {
        var f = cfg.fundacao, tf = f.tipoFundacao;
        titulo = "Ferramenta: Fundação";
        var ps = [{ id: "b2f:fu:tipoFundacao", rotulo: "Tipo", tipo: "lista", valor: tf, opcoes: Object.keys(ROT_FUND).map(function (k) { return { id: k, rotulo: ROT_FUND[k] }; }) }];
        function nm(k, rot, un, passo) { ps.push({ id: "b2f:fu:" + k, rotulo: rot, unidade: un || "m", tipo: "numero", passo: passo || "0.05", valor: f[k] == null ? "" : f[k] }); }
        if (tf === "sapata" || tf === "bloco") { nm("largura", "Largura (B)"); nm("comprimento", "Comprimento (L)"); nm("altura", "Altura"); }
        if (tf === "sapata") { nm("alturaBase", "Altura do rodapé (vazio = reta)"); nm("larguraTopo", "Largura do topo (chanfrada)"); nm("comprimentoTopo", "Comprimento do topo (chanfrada)"); }
        if (tf === "baldrame") { nm("largura", "Largura (b)"); nm("altura", "Altura (h)"); }
        if (tf === "radier") { nm("altura", "Espessura"); ps.push({ id: "b2f:fu:radierModo", rotulo: "Desenho", tipo: "lista", valor: f.radierModo, opcoes: [{ id: "retangulo", rotulo: "Retângulo — dois cantos" }, { id: "contorno", rotulo: "Contorno — clique os cantos" }] }); }
        if (tf === "bloco") { nm("nEstacas", "Número de estacas (1 a 6)", "", "1"); nm("espacamento", "Espaçamento entre estacas"); }
        if (tf === "bloco" || tf === "estaca") { nm("diametro", "Diâmetro da estaca"); nm("comprimentoEstaca", "Comprimento da estaca"); }
        nm("deslocTopo", "Deslocamento do topo (em relação ao nível)");
        nm("taxaAco", "Taxa de aço (vazio = a informar)", "kg/m³", "5");
        if (tf !== "estaca" && tf !== "baldrame") nm("fck", "fck do concreto (vazio = a informar)", "MPa", "5");   /* SIMULAÇÃO S1: a placa de base da Metálica ancora aqui */
        if (tf !== "estaca") { nm("lastro", "Lastro (espessura)", "m", "0.01"); nm("folga", "Folga da escavação (cada lado)"); }
        nm("terreno", "Cota do terreno (em relação ao nível)");
        secs.push({ nome: ROT_FUND[tf], params: ps });
      } else if (sub === "telhado-borda") {
        titulo = "Ferramenta: Bordas do telhado";
        secs.push({ nome: "Borda", params: [
          { id: "b2f:bo:tipoBorda", rotulo: "Tipo", tipo: "lista", valor: cfg.borda.tipoBorda, opcoes: Object.keys(T.BORDAS).map(function (k) { return { id: k, rotulo: T.BORDAS[k].rotulo }; }) },
          ro("b2f:bo:onde", "Onde vai", T.BORDAS[cfg.borda.tipoBorda].onde === "beiral" ? "nas arestas que definem inclinação (beiral)" : "em qualquer aresta (beiral ou empena)")
        ] });
      } else if (sub === "telhado-unir") {
        titulo = "Ferramenta: Unir telhado";
        secs.push({ nome: "Unir", params: [ro("b2f:un:como", "Como", "clique o telhado que entra e depois aquele em que ele encosta")] });
      } else return null;
      return { titulo: titulo, icone: sub === "fundacao" ? "laje" : "telhado", semEditarTipo: true, secoes: secs,
               onMudar: function (pid, valor) { return self.mudar(sub, pid, valor, arqui); } };
    },
    mudar: function (sub, pid, valor, arqui) {
      var k = String(pid).replace(/^b2f:/, ""), T = TM();
      if (k === "nivel" && arqui && arqui.mudarFerramenta) return arqui.mudarFerramenta(sub, pid, valor);
      var m = /^(te|fu|bo):(\w+)$/.exec(k); if (!m) return this.esquema(sub, arqui);
      var alvo = m[1] === "te" ? cfg.telhado : (m[1] === "fu" ? cfg.fundacao : cfg.borda), c = m[2];
      if (c === "tipoId") {
        if (T && T.tipo(valor).id === String(valor)) {
          alvo.tipoId = String(valor);
          /* T1: ao escolher a telha, a inclinação vai para a MÍNIMA do fabricante (o usuário pode subir; abaixo dela, aviso) */
          if (m[1] === "te" && T.inclinacaoPadrao) { var im = T.inclinacaoPadrao(valor); if (fin(im)) alvo.inclinacao = im; }
        }
      }
      else if (c === "modelo") { var ME = ESM(); alvo.modelo = valor === "auto" || valor === "nenhum" || (ME && ME.MODELOS && ME.MODELOS[valor]) ? String(valor) : alvo.modelo; }
      else if (c === "modo") alvo.modo = valor === "contorno" || valor === "extrusao" || valor === "linha" || valor === "corte" ? valor : "retangulo";
      else if (c === "ref") alvo.ref = valor === "cumeeira" ? "cumeeira" : "beiral";
      else if (c === "aguas") alvo.aguas = valor === "1" || valor === 1 ? 1 : (valor === "2" || valor === 2 ? 2 : 4);
      else if (c === "tipoFundacao") { if (ROT_FUND[valor]) alvo.tipoFundacao = valor; }
      else if (c === "radierModo") alvo.radierModo = valor === "contorno" ? "contorno" : "retangulo";
      else if (c === "tipoBorda") { if (T && T.BORDAS[valor]) alvo.tipoBorda = valor; }
      else if (temCampo(alvo, c)) { alvo[c] = valor === "" || valor == null ? null : num(valor, alvo[c]); if (m[1] === "te" && c === "beiral") alvo.beiralMexido = valor !== "" && valor != null; }
      return this.esquema(sub, arqui);
    },

    /* ---------------------------------------- T1: o MODELO do telhado (js/bimtelhadoestrut.js MODELOS) */
    opcoesModelo: function () {
      var ME = ESM(), out = [{ id: "auto", rotulo: "Automático pela telha" }, { id: "nenhum", rotulo: "Sem estrutura (só o telhado)" }];
      if (ME && ME.MODELOS) Object.keys(ME.MODELOS).forEach(function (k) { out.push({ id: k, rotulo: ME.MODELOS[k].rotulo }); });
      return out;
    },
    /* o modelo que a ferramenta usa: "auto" = o sugerido para a telha de CATÁLOGO (tipo sem catálogo = sem estrutura, como antes) */
    modeloEf: function (c) {
      var ME = ESM(), T = TM(); c = c || cfg.telhado;
      if (!ME || !ME.MODELOS || !c.modelo || c.modelo === "nenhum") return null;
      if (c.modelo === "auto") return T && T.telha(c.tipoId) ? ME.modeloSugerido(c.tipoId) : null;
      return ME.MODELOS[c.modelo] ? c.modelo : null;
    },
    /* o beiral PADRÃO nasce dentro do balanço máximo da telha do catálogo (o padrão do app, ou o máximo da telha, o menor); o
       beiral que o usuário digitou vale como está — e aí o aviso de balanço continua */
    beiralEf: function (c) {
      c = c || cfg.telhado; var T = TM(), tl = T && T.telha ? T.telha(c.tipoId) : null, b = num(c.beiral, 0.5);
      if (c.beiralMexido) return b;
      var bm = tl && tl.balanco && tl.balanco.semCalha && fin(tl.balanco.semCalha.max) ? tl.balanco.semCalha.max : null;
      return bm != null && bm < b ? bm : b;
    },
    rotuloModelo: function (id) { var ME = ESM(); return id && ME && ME.MODELOS[id] ? ME.MODELOS[id].rotulo : "sem estrutura (só o telhado)"; },
    /* trocar o modelo dos telhados que existem (um lote: um Ctrl+Z desfaz) — null = sem estrutura */
    opsModelo: function (estado, modelo) {
      var ME = ESM(), ops = [];
      arr(estado && estado.telhados).forEach(function (t) {
        if (!t || t.modo === "extrusao") return;
        var m = modelo === "auto" ? (ME ? ME.modeloSugerido(t.tipoId, t, estado) : null) : (modelo && ME && ME.MODELOS[modelo] ? modelo : null);
        ops.push({ op: "telhado", id: t.id, modelo: m });
      });
      return ops;
    },

    /* --------------------------------------------- as ops (puras, testáveis) */
    novoId: function (estado, pre) {
      var usados = {};
      ["caixas", "coberturas", "familias", "volumes", "forros", "ambientes", "telhados", "bordas", "fundacoes", "separadores", "eixos"].forEach(function (k) { arr(estado && estado[k]).forEach(function (x) { if (x && x.id != null) usados[String(x.id)] = 1; }); });
      var n = 1; while (usados[pre + n]) n++;
      return pre + n;
    },
    /* o telhado novo: retângulo (p1, p2), contorno [{x,z}] ou extrusão (p1, p2 = a base; p3 = até onde vai).
       nivel = {id, elevacao, peDireito} | null; base = a cota do plano de trabalho */
    opTelhado: function (estado, dados, nivel, base, leve) {
      var T = TM(); if (!T) return { ok: false, motivo: "O motor do telhado (js/bimtelhado.js) não carregou." };
      var c = cfg.telhado, d = { inclinacao: c.inclinacao, beiral: this.beiralEf(c), tipoId: c.tipoId }, mEf = this.modeloEf(c);
      if (mEf && !(dados.p1 && dados.p2 && dados.p3)) d.modelo = mEf;   /* T1: o telhado nasce com o modelo (estrutura + telhas derivadas) */
      d.deslocBase = c.deslocBase != null ? c.deslocBase : (nivel && +nivel.peDireito > 0 ? +nivel.peDireito : 2.8);
      if (nivel && nivel.id != null) { d.nivelId = String(nivel.id); d.base = +nivel.elevacao || 0; } else d.base = +base || 0;
      /* T4: o desenho (linha, corte, seguir peça) pode trazer a inclinação e a COTA de apoio (absoluta) — a do perfil
         clicado no 3D ou a da peça seguida; o deslocamento da base sai dela */
      if (fin(dados.inclinacao)) d.inclinacao = dados.inclinacao;
      if (fin(dados.cotaApoio)) d.deslocBase = Math.round((dados.cotaApoio - d.base) * 1e6) / 1e6;
      if (dados.contorno) d.contorno = dados.contorno;
      else if (dados.p1 && dados.p2 && !dados.p3) {
        var x0 = Math.min(dados.p1.x, dados.p2.x), x1 = Math.max(dados.p1.x, dados.p2.x), z0 = Math.min(dados.p1.z, dados.p2.z), z1 = Math.max(dados.p1.z, dados.p2.z);
        if (!(x1 - x0 > 0.3 && z1 - z0 > 0.3)) return { ok: false, motivo: "Retângulo pequeno demais para o telhado." };
        d.contorno = [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }]; d.aguas = c.aguas;
      } else if (dados.p1 && dados.p2 && dados.p3) {
        /* extrusão: a base vai de p1 a p2 (o perfil de 2 águas com a inclinação); p3 diz o comprimento */
        var dx = dados.p2.x - dados.p1.x, dz = dados.p2.z - dados.p1.z, L = Math.sqrt(dx * dx + dz * dz);
        if (!(L > 0.3)) return { ok: false, motivo: "Base da extrusão curta demais." };
        var ux = dx / L, uz = dz / L, w = (dados.p3.x - dados.p1.x) * (-uz) + (dados.p3.z - dados.p1.z) * ux;
        if (!(Math.abs(w) > 0.3)) return { ok: false, motivo: "Clique mais longe da base: a extrusão precisa de comprimento." };
        var i = c.inclinacao / 100;
        d.modo = "extrusao"; d.perfil = [{ u: 0, y: 0 }, { u: L / 2, y: L / 2 * i }, { u: L, y: 0 }];
        d.origem = { x: dados.p1.x, z: dados.p1.z }; d.ang = Math.atan2(uz, ux) * 180 / Math.PI; d.inicio = Math.min(0, w); d.fim = Math.max(0, w);
      } else return { ok: false, motivo: "Clique os cantos do telhado." };
      var id = this.novoId(estado, "te"), op = T.op(id, d);
      if (!op) return { ok: false, motivo: "Telhado inválido: confira o contorno e as Propriedades." };
      var t = T.calcular(op, nivel ? [{ id: nivel.id, elevacao: +nivel.elevacao || 0 }] : []);
      if (!t.ok) return { ok: false, motivo: (t.avisos || []).join(" ") || "Não deu para montar o telhado." };
      if (leve) return { ok: true, op: op, telhado: t };   /* T4: a PRÉVIA (fantasma) — sem estrutura, sem avisos do modelo */
      /* o AUTOMÁTICO na metálica olha o telhado: tesoura triangular baixa demais → viga W (o que nasce pelo padrão nasce válido) */
      var MEa = ESM(); if (op.modelo && c.modelo === "auto" && MEa && MEa.modeloSugerido) op.modelo = MEa.modeloSugerido(c.tipoId, t, estado);
      var abaixo = (t.avisos || []).filter(function (a) { return /abaixo do mínimo/i.test(a); })[0];
      /* T1 (revisor): os avisos do MODELO (tesoura baixa, pontalete sem apoio, "fase 2: meias-tesouras de espigão") já no resumo
         do comando — o pacote sai do mesmo motor do replay, sobre o estado de agora (paredes e lajes) */
      var avM = [], MEm = ESM();
      if (op.modelo && MEm && MEm.modelar) { try { var t2 = JSON.parse(JSON.stringify(t)); t2.modelo = op.modelo; var pkM = MEm.modelar(t2, estado, {}); avM = pkM ? arr(pkM.avisos) : []; } catch (eM) { avM = []; } }
      return { ok: true, op: op, telhado: t, resumo: "Telhado (" + t.tipoTelhado.rotulo + "): " + t.nAguas + " água" + (t.nAguas > 1 ? "s" : "") + ", " + n2(t.area) + " m² inclinados (" + n2(t.areaProjecao) + " m² em projeção)" +
        (t.cumeeira > 0 ? ", cumeeira " + n2(t.cumeeira) + " m" : "") + (t.espigao > 0 ? ", espigões " + n2(t.espigao) + " m" : "") + (t.rincao > 0 ? ", rincões " + n2(t.rincao) + " m" : "") + "." +
        (op.modelo ? " Modelo: " + this.rotuloModelo(op.modelo) + " (estrutura, telhas e fixação no quantitativo da cobertura)." : "") + (abaixo ? " ATENÇÃO: " + abaixo : "") +
        (avM.length ? " AVISOS DO MODELO: " + avM.join(" | ") : ""), avisosModelo: avM };
    },
    /* T4: o telhado pelos pontos do DESENHO (o modo e o tipo da ferramenta; o = { modo?, seguir?, leve? }).
       pts = [{x, z, y?}…] — retângulo: 2; linha: 3; corte: 4 (o perfil, o começo e o fim). */
    desenhoOpcoes: function () { var c = cfg.telhado; return { aguas: c.aguas, ref: c.ref, comprimento: c.comp, largura: c.larg, inclinacao: c.inclinacao }; },
    contornoDesenho: function (pts, o) {
      o = o || {}; pts = arr(pts);
      var c = cfg.telhado, mo = o.modo || c.modo, opc = this.desenhoOpcoes(), seg = o.seguir !== undefined ? o.seguir : c.seguir;
      if (mo === "linha") return retanguloDeLinha(pts[0], pts[1], pts[2], opc);
      if (mo === "corte") return retanguloDeCorte(pts[0], pts[1], pts[2], pts[3], opc);
      if (mo === "retangulo" && c.aguas === 1 && seg && seg.ok) return retanguloSeguindo(pts[0], pts[1], seg);
      if (mo === "retangulo") return retanguloDoisCantos(pts[0], pts[1], opc);
      return { ok: false, motivo: "Modo de desenho sem contorno pronto." };
    },
    opTelhadoDesenho: function (estado, pts, nivel, base, o) {
      var r = this.contornoDesenho(pts, o);
      if (!r.ok) return { ok: false, motivo: r.motivo };
      if (!r.contorno) return { ok: false, motivo: "Faltam pontos para o telhado." };
      var out = this.opTelhado(estado, { contorno: r.contorno, inclinacao: r.inclinacao, cotaApoio: r.cotaApoio }, nivel, base, o && o.leve);
      if (out.ok) out.desenho = r;
      return out;
    },
    /* T4: "Seguir inclinação de…" — guarda a peça escolhida (null desliga). info: ver inclinacaoDePeca */
    seguir: function (info, rotulo) {
      if (info === null) { cfg.telhado.seguir = null; return { ok: true, desligado: true }; }
      var r = inclinacaoDePeca(info, rotulo);
      if (r.ok) { cfg.telhado.seguir = r; cfg.telhado.aguas = 1; if (cfg.telhado.modo !== "retangulo") cfg.telhado.modo = "retangulo"; }
      return r;
    },
    /* ------------------------------------------------ T4: a BARRA DA FERRAMENTA (js/bimbarraopcoes.js pinta isto)
       Tipo (1 água, 2 águas, várias águas), modo de desenho (retângulo, linha, corte), a linha de referência
       (beiral/cumeeira), "Seguir inclinação de…" (1 água) e as cotas digitáveis (comprimento, largura, inclinação). */
    barraTelhado: function () {
      var c = cfg.telhado, segOn = !!(c.seguir && c.aguas === 1), peg = !!(this._m3d && this._m3d.pegando && this._m3d.pegando());
      function esc(t) { return String(t == null ? "" : t).replace(/[&<>"]/g, function (ch) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]; }); }
      function svg(d) { return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + d + "</svg>"; }
      function bt(acao, on, rot, dica, d) { return '<button type="button" class="bbo-forma" data-bbo="p3" data-p3="' + acao + '" aria-pressed="' + (on ? "true" : "false") + '" title="' + esc(rot + " — " + dica) + '" aria-label="' + esc(rot) + '">' + svg(d) + "</button>"; }
      function grp(rot, h) { return '<span class="bbo-grupo bbo-desenhar" data-bbo-grupo="' + esc(rot) + '"><span class="bbo-rot">' + esc(rot) + "</span>" + h + "</span>"; }
      function campo(k, rot, v, un, dica) { return '<label class="bbo-campo" title="' + esc(dica) + '">' + esc(rot) + ' <input data-bbo="p3:' + k + '" inputmode="decimal" autocomplete="off" placeholder="livre" value="' + (v == null || v === "" ? "" : esc(String(v).replace(".", ","))) + '" style="width:3.6em"> ' + esc(un) + "</label>"; }
      var h = grp("Tipo",
        bt("aguas:1", c.aguas === 1, "1 água", "caimento para um lado só", '<path d="M3 17 L21 9"/><path d="M5 17 V20 M19 10 V20"/>') +
        bt("aguas:2", c.aguas === 2, "2 águas", "cumeeira e duas águas (oitões nas pontas)", '<path d="M3 16 L12 7 L21 16"/><path d="M5 16 V20 M19 16 V20"/>') +
        bt("aguas:4", c.aguas !== 1 && c.aguas !== 2, "Várias águas", "4 águas com espigões (e o contorno que for)", '<path d="M3 18 L8 9 H16 L21 18 Z"/><path d="M8 9 L5 18 M16 9 L19 18" stroke-dasharray="2 2"/>'));
      h += grp("Desenho",
        bt("modo:retangulo", c.modo === "retangulo", "Retângulo", "dois cantos opostos", '<rect x="4" y="6" width="16" height="12"/>') +
        bt("modo:linha", c.modo === "linha", "Linha", "início e fim da linha (beiral ou cumeeira) e depois o lado do caimento", '<path d="M4 7 H20"/><circle cx="4" cy="7" r="1.4"/><circle cx="20" cy="7" r="1.4"/><path d="M12 9 V18 M9 15 L12 18 L15 15"/>') +
        bt("modo:corte", c.modo === "corte", "Por corte", "a linha do perfil (beiral → cumeeira) e depois onde o telhado começa e termina", '<path d="M3 18 L13 8"/><path d="M13 8 V18 M3 18 H13" stroke-dasharray="2 2"/><path d="M16 6 V19 M21 6 V19"/>'));
      if (c.modo === "linha") h += grp("Linha é",
        bt("ref:beiral", c.ref !== "cumeeira", "Beiral", "a linha desenhada é o pé da água", '<path d="M3 17 H21"/><path d="M6 11 L12 6 L18 11" stroke-dasharray="2 2"/>') +
        bt("ref:cumeeira", c.ref === "cumeeira", "Cumeeira", "a linha desenhada é o topo (cumeeira)", '<path d="M3 7 H21"/><path d="M6 17 L12 8 L18 17" stroke-dasharray="2 2"/>'));
      if (c.aguas === 1 && c.modo === "retangulo") h += grp("", '<button type="button" class="bbo-liga" data-bbo="p3" data-p3="seguir" aria-pressed="' + (segOn || peg ? "true" : "false") + '" title="Seguir inclinação de… — clique numa peça já modelada (viga/terça inclinada, peça de madeira, face inclinada de volume/laje): o telhado pega a inclinação, o sentido do caimento e a cota de apoio dela. Clique de novo para desligar.">' +
        svg('<path d="M3 19 L21 9"/><circle cx="12" cy="14" r="3"/><path d="M12 9 V11 M12 17 V19"/>') + "<span>" + (peg ? "Clique na peça…" : (segOn ? "Seguindo " + esc(c.seguir.rotulo) + " (" + n2(c.seguir.inclinacao, 1) + " %)" : "Seguir inclinação de…")) + "</span></button>");
      h += grp("", campo("comp", "Compr.", c.comp, "m", c.modo === "corte" ? "Comprimento — vazio: pelos cliques" : "Comprimento da linha/retângulo — vazio: pelo clique (digite um número durante o desenho)") +
        campo("larg", "Larg.", c.larg, "m", "Largura da água (linha) ou do retângulo — vazio: pelo clique") +
        campo("incl", "Incl.", segOn ? "" : c.inclinacao, "%", segOn ? "Inclinação da peça seguida" : "Inclinação (%) — no corte pelo 3D, a da linha desenhada"));
      return h;
    },
    barraClique: function (acao) {
      var c = cfg.telhado, m = /^(\w+):?(.*)$/.exec(String(acao || "")); if (!m) return false;
      if (m[1] === "aguas") { c.aguas = m[2] === "1" ? 1 : (m[2] === "2" ? 2 : 4); if (c.modo !== "retangulo" && c.modo !== "linha" && c.modo !== "corte") c.modo = "retangulo"; }
      else if (m[1] === "modo") c.modo = m[2] === "linha" || m[2] === "corte" ? m[2] : "retangulo";
      else if (m[1] === "ref") c.ref = m[2] === "cumeeira" ? "cumeeira" : "beiral";
      else if (m[1] === "seguir") {
        var M = this._m3d;
        if (c.seguir || (M && M.pegando && M.pegando())) { c.seguir = null; if (M && M.pegarPeca) M.pegarPeca(false); status("Seguir inclinação desligado: vale a inclinação da ferramenta."); }
        else if (M && M.pegarPeca) { M.pegarPeca(true); status("Seguir inclinação: clique na peça (viga, terça, peça de madeira) ou na face inclinada."); }
      } else return false;
      if (this._m3d && this._m3d.refazerPrevia) { if (m[1] !== "seguir") this._m3d.cancelar(); this._m3d.refazerPrevia(); }
      return true;
    },
    barraCampo: function (k, valor) {
      var c = cfg.telhado, v = num(valor, NaN), vazio = valor == null || String(valor).trim() === "";
      if (k === "comp") c.comp = vazio ? null : (v > 0.05 ? v : c.comp);
      else if (k === "larg") c.larg = vazio ? null : (v > 0.05 ? v : c.larg);
      else if (k === "incl") { if (!vazio && v > 0) { c.inclinacao = v; c.seguir = null; } }
      else return false;
      /* digitou durante o desenho: o ponto pendente sai do cursor com a cota (o Enter do campo confirma) */
      var M = this._m3d;
      if (M && M.pendentes && M.pendentes() && !vazio && (k === "comp" || k === "larg") && M.avancar) M.avancar();
      else if (M && M.refazerPrevia) M.refazerPrevia();
      return true;
    },
    /* a peça do EDITOR que o usuário clicou, como `info` do inclinacaoDePeca: barra/viga/pilar com perfil (o eixo pelo
       js/metalpeca.js membro — metálica e madeira com perfil; o apoio no topo da seção) ou uma água de telhado (o plano dela).
       null = não é peça com eixo/plano conhecido (no 3D vale a face clicada). */
    pecaNaPlanta: function (estado, ponto, tol) {
      var self = this, melhor = null, dm = fin(tol) ? tol : 0.4;
      if (!ponto) return null;
      arr(estado && estado.caixas).forEach(function (c) {
        if (!c || (c.tipo !== "metal" && c.tipo !== "viga")) return;
        var ip = self.infoDaPeca(estado, c.id, ponto); if (!ip || !ip.info.a) return;
        var a = ip.info.a, b = ip.info.b, dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz;
        var s = L2 > 1e-9 ? Math.max(0, Math.min(1, ((ponto.x - a.x) * dx + (ponto.z - a.z) * dz) / L2)) : 0;
        var d = Math.sqrt(Math.pow(a.x + s * dx - ponto.x, 2) + Math.pow(a.z + s * dz - ponto.z, 2));
        if (d <= dm) { dm = d; melhor = ip; }
      });
      return melhor;
    },
    infoDaPeca: function (estado, id, ponto) {
      if (id == null || !estado) return null;
      var sid = String(id), BM = global.BimMetal, T = TM();
      var c = arr(estado.caixas).filter(function (x) { return x && String(x.id) === sid; })[0];
      if (c && BM && BM.membro) {
        var mb = null; try { mb = BM.membro(c); } catch (eM) { mb = null; }
        if (mb && mb.P0 && mb.X && fin(mb.L) && mb.L > 0) {
          var a = { x: mb.P0[0], y: mb.P0[1], z: mb.P0[2] }, b = { x: mb.P0[0] + mb.X[0] * mb.L, y: mb.P0[1] + mb.X[1] * mb.L, z: mb.P0[2] + mb.X[2] * mb.L };
          var alt = mb.s && fin(mb.s.alt) ? mb.s.alt : 0, by = mb.B && fin(mb.B[1]) ? Math.abs(mb.B[1]) : 1;
          var rot = c.tipo === "metal" ? "peça metálica " + (c.metal && c.metal.perfil && c.metal.perfil.nome ? c.metal.perfil.nome : sid) : (c.tipo === "viga" ? "viga " + sid : c.tipo + " " + sid);
          return { info: { a: a, b: b, topo: alt > 0 ? alt / 2 / Math.max(0.2, by) : 0 }, rotulo: rot };
        }
      }
      var t = arr(estado.telhados).filter(function (x) { return x && String(x.id) === sid; })[0];
      if (t && t.ok && T && ponto) {
        var ag = arr(t.aguasCalc).filter(function (g) { return g.plano && arr(g.pecas).some(function (pc) { return T.dentro([ponto.x, ponto.z], pc.pts.map(function (q) { return [q.x, q.z]; })); }); })[0];
        if (ag) return { info: { normal: { x: -ag.plano.bx, y: 1, z: -ag.plano.bz }, ponto: { x: ponto.x, y: T.yPlano(ag.plano, ponto.x, ponto.z), z: ponto.z } }, rotulo: "água do telhado " + sid };
      }
      return null;
    },
    opFundacao: function (estado, dados, nivel, base) {
      var F = FM(); if (!F) return { ok: false, motivo: "O motor da fundação (js/bimfundacao.js) não carregou." };
      var c = cfg.fundacao, d = {}, tf = c.tipoFundacao;
      Object.keys(c).forEach(function (k) { if (k !== "radierModo" && c[k] != null) d[k] = c[k]; });
      if (tf !== "sapata") { delete d.alturaBase; delete d.larguraTopo; delete d.comprimentoTopo; }
      if (tf !== "bloco") { delete d.nEstacas; delete d.espacamento; }
      if (tf !== "bloco" && tf !== "estaca") { delete d.diametro; delete d.comprimentoEstaca; }
      if (tf === "estaca") { delete d.largura; delete d.comprimento; delete d.altura; delete d.lastro; delete d.folga; }
      if (tf === "baldrame" || tf === "radier") delete d.comprimento;
      if (tf === "radier") delete d.largura;
      if (nivel && nivel.id != null) { d.nivelId = String(nivel.id); d.base = +nivel.elevacao || 0; } else d.base = +base || 0;
      if (tf === "baldrame") { if (!dados.p1 || !dados.p2) return { ok: false, motivo: "Baldrame: clique o início e o fim." }; d.x = dados.p1.x; d.z = dados.p1.z; d.x1 = dados.p2.x; d.z1 = dados.p2.z; }
      else if (tf === "radier") {
        if (dados.contorno) d.contorno = dados.contorno;
        else if (dados.p1 && dados.p2) { var x0 = Math.min(dados.p1.x, dados.p2.x), x1 = Math.max(dados.p1.x, dados.p2.x), z0 = Math.min(dados.p1.z, dados.p2.z), z1 = Math.max(dados.p1.z, dados.p2.z); d.contorno = [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }]; }
        else return { ok: false, motivo: "Radier: clique os cantos." };
      } else { if (!dados.p1) return { ok: false, motivo: "Clique onde a fundação fica." }; d.x = dados.p1.x; d.z = dados.p1.z; }
      var id = this.novoId(estado, "fu"), op = F.op(id, d);
      if (!op) return { ok: false, motivo: "Fundação inválida: confira as medidas em Propriedades." };
      var f = F.calcular(op, nivel ? [{ id: nivel.id, elevacao: +nivel.elevacao || 0 }] : []);
      if (!f.ok) return { ok: false, motivo: (f.avisos || []).join(" ") || "Não deu para montar a fundação." };
      return { ok: true, op: op, fundacao: f, resumo: ROT_FUND[tf] + ": " + n2(f.volume, 3) + " m³ de concreto" + (f.volumeEstacas > 0 && tf === "bloco" ? " + " + n2(f.volumeEstacas, 3) + " m³ de estacas (" + n2(f.comprimentoEstacas) + " m)" : "") +
        (f.escavacao > 0 ? ", escavação " + n2(f.escavacao, 3) + " m³" : "") + (f.aco != null ? ", aço " + n2(f.aco, 1) + " kg" : ", aço a informar (taxa kg/m³)") + "." };
    },
    /* a borda: a aresta do telhado mais perto do ponto (planta, até 1 m da linha do beiral) */
    opBorda: function (estado, ponto, telhadoId) {
      var T = TM(); if (!T) return { ok: false, motivo: "O motor do telhado (js/bimtelhado.js) não carregou." };
      var melhor = null, tb = cfg.borda.tipoBorda;
      arr(estado && estado.telhados).forEach(function (t) {
        if (!t || !t.ok || t.modo !== "perimetro" || (telhadoId != null && String(t.id) !== String(telhadoId))) return;
        arr(t.arestasCalc).forEach(function (e) {
          var a = [e.beiral.a.x, e.beiral.a.z], b = [e.beiral.b.x, e.beiral.b.z], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz;
          var s = L2 > 0 ? Math.max(0, Math.min(1, ((ponto.x - a[0]) * dx + (ponto.z - a[1]) * dz) / L2)) : 0;
          var dd = Math.sqrt(Math.pow(a[0] + s * dx - ponto.x, 2) + Math.pow(a[1] + s * dz - ponto.z, 2));
          if (dd <= 1.0 && (!melhor || dd < melhor.d)) melhor = { d: dd, t: t, e: e };
        });
      });
      if (!melhor) return { ok: false, motivo: "Clique perto de uma aresta de um telhado por perímetro (até 1 m da borda do beiral)." };
      if (T.BORDAS[tb].onde === "beiral" && !melhor.e.define) return { ok: false, motivo: T.BORDAS[tb].rotulo + " vai no beiral: esta aresta é empena (não define inclinação)." };
      var ja = arr(estado && estado.bordas).filter(function (b) { return b && String(b.telhado) === String(melhor.t.id) && b.tipoBorda === tb; })[0];
      if (ja) {
        var l = arr(ja.arestas).map(Number);
        if (l.indexOf(melhor.e.orig) >= 0) return { ok: false, motivo: T.BORDAS[tb].rotulo + " já está na aresta " + (melhor.e.orig + 1) + "." };
        return { ok: true, op: { op: "borda", id: ja.id, arestas: l.concat([melhor.e.orig]) }, resumo: T.BORDAS[tb].rotulo + ": + aresta " + (melhor.e.orig + 1) + " (" + n2(melhor.e.comprimento) + " m)." };
      }
      var op = T.opBorda(this.novoId(estado, "bt"), { telhado: melhor.t.id, tipoBorda: tb, arestas: [melhor.e.orig] });
      return op ? { ok: true, op: op, resumo: T.BORDAS[tb].rotulo + " na aresta " + (melhor.e.orig + 1) + " do telhado " + melhor.t.id + ": " + n2(melhor.e.comprimento) + " m." } : { ok: false, motivo: "Borda inválida." };
    },
    /* unir A a B (B já unido a A no mesmo sentido = desunir) */
    opUnir: function (estado, idA, idB) {
      var ts = arr(estado && estado.telhados), A = ts.filter(function (t) { return String(t.id) === String(idA); })[0], B = ts.filter(function (t) { return String(t.id) === String(idB); })[0];
      if (!A || !B) return { ok: false, motivo: "Clique em dois telhados criados aqui." };
      if (String(idA) === String(idB)) return { ok: false, motivo: "Escolha um telhado diferente do primeiro." };
      if (A.unir != null && String(A.unir) === String(idB)) return { ok: true, op: { op: "telhado", id: A.id, unir: null }, resumo: "Telhado " + A.id + " desunido de " + B.id + "." };
      return { ok: true, op: { op: "telhado", id: A.id, unir: String(B.id) }, resumo: "Telhado " + A.id + " unido a " + B.id + ": a parte de baixo sai e o encontro vira rincão." };
    },

    /* ======================================================= o 3D (bim.js) */
    montar3d: function (api) {
      if (!this.ativo() || !api || !api.THREE || !api.scene || !TM() || !FM()) return null;
      var self = this, THREE = api.THREE, edit = api.edit, grp = new THREE.Group(), pts = [], marcas = [], unirA = null;
      /* T4: o desenho do telhado — esperando o clique da peça a seguir, a face inclinada capturada no 1º canto (só para
         este telhado), o último cursor (Enter e as cotas digitadas usam) e o relógio da prévia */
      var segPick = false, segAuto = null, cur = null, tFant = 0, kFant = "";
      grp.name = "p3-previa"; api.scene.add(grp);
      var SUBS = { telhado: 1, fundacao: 1, "telhado-borda": 1, "telhado-unir": 1 };
      function nivel() { return edit && edit.b2 && edit.b2.nivel ? edit.b2.nivel : null; }
      function limparPrevia() { grp.children.slice().forEach(function (o) { grp.remove(o); if (o.geometry) o.geometry.dispose(); }); }
      function cancelar() { pts = []; unirA = null; segAuto = null; kFant = ""; marcas.forEach(function (m) { if (api.limparMarca) api.limparMarca(m); }); marcas = []; limparPrevia(); }
      function marca(p) { if (!api.marca) return; var m = api.marca(new THREE.Vector3(p.x, fin(p.y) ? p.y : edit.base, p.z)); api.scene.add(m); if (api.reescalar) api.reescalar(m); marcas.push(m); }
      var matLinha = new THREE.LineBasicMaterial({ color: 0x2fbf71, depthTest: false });
      function linha(lst) {
        limparPrevia(); if (lst.length < 2) return;
        var g = new THREE.BufferGeometry().setFromPoints(lst.map(function (q) { return new THREE.Vector3(q.x, edit.base + 0.02, q.z); }));
        var l = new THREE.Line(g, matLinha); l.renderOrder = 998; l.raycast = function () {}; grp.add(l);
      }
      function feito(r) {
        if (!r.ok) { api.hint(r.motivo); return true; }
        cancelar(); api.op(r.op); if (api.fechou) api.fechou();
        api.hint(r.resumo + " Clique para outro, ou Esc."); status(r.resumo);
        return true;
      }
      function perto1(e) {
        if (pts.length < 3 || !e || !isFinite(e.clientX) || !api.telaDe) return false;
        var t0 = api.telaDe(pts[0].x, edit.base, pts[0].z);
        return t0 && Math.abs(t0.x - e.clientX) <= 12 && Math.abs(t0.y - e.clientY) <= 12;
      }
      function modoPts(sub) {
        if (sub === "telhado") return cfg.telhado.modo;
        if (sub === "fundacao") { var t = cfg.fundacao.tipoFundacao; return t === "baldrame" ? "dois" : (t === "radier" ? cfg.fundacao.radierModo : "um"); }
        return "um";
      }
      /* PRECISÃO ÚNICA (14/10/2026, barra de baixo — js/bimbarrasnaps.js): o próximo ponto do contorno
         (telhado/radier por perímetro), do baldrame e da extrusão anda no Orto; o 2º canto do
         RETÂNGULO não (é a diagonal). Ponto notável do snap (canto, meio…) ganha da trava. */
      function travar(sub, q, e) {
        var mo = modoPts(sub), Bo = global.BimBarraOpcoes, base = pts[pts.length - 1];
        if (!base || !Bo || !Bo.travar || mo === "um" || (mo === "retangulo" && pts.length === 1)) return q;
        var u = null; try { var pz = global.BIM && global.BIM.precisao ? global.BIM.precisao() : null; u = pz && pz.estado ? pz.estado().ultimo : null; } catch (eU) { u = null; }
        var tipo = u && u.p && Math.abs(u.p.x - q.x) < 1e-6 && Math.abs(u.p.z - q.z) < 1e-6 ? u.tipo : null;
        var r = Bo.travar(base, q, { shift: !!(e && e.shiftKey), tipoSnap: tipo });
        return r && r.travado ? { x: r.p.x, z: r.p.z } : q;
      }
      /* ------------------------------------------------ T4: o DESENHO do telhado (retângulo, linha, corte, seguir) */
      var matFant = new THREE.MeshBasicMaterial({ color: 0x2fbf71, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
      var matSeta = new THREE.LineBasicMaterial({ color: 0xe8a33d, depthTest: false });
      function telNovo() { var m = cfg.telhado.modo; return m === "retangulo" || m === "linha" || m === "corte"; }
      function nPts() { var m = cfg.telhado.modo; return m === "linha" ? 3 : (m === "corte" ? 4 : 2); }
      function segEf() { return cfg.telhado.aguas === 1 && cfg.telhado.modo === "retangulo" ? (cfg.telhado.seguir || segAuto) : null; }
      function comCursor(c) { var L = pts.slice(); if (c && L.length < nPts()) L.push(c); return L; }
      /* a seta do caimento: o traço e as duas pontas */
      function setaPts(s, y) {
        var dx = s.ate.x - s.de.x, dz = s.ate.z - s.de.z, L = Math.sqrt(dx * dx + dz * dz); if (!(L > 1e-6)) return null;
        var ux = dx / L, uz = dz / L, h = Math.min(0.35, L * 0.35), yy = typeof y === "function" ? y : function () { return y; };
        function P(x, z) { return { x: x, y: yy(x, z), z: z }; }
        return [[P(s.de.x, s.de.z), P(s.ate.x, s.ate.z)], [P(s.ate.x - ux * h - uz * h * 0.6, s.ate.z - uz * h + ux * h * 0.6), P(s.ate.x, s.ate.z), P(s.ate.x - ux * h + uz * h * 0.6, s.ate.z - uz * h - ux * h * 0.6)]];
      }
      function addLinha(lst, mt) {
        if (!lst || lst.length < 2) return;
        var g = new THREE.BufferGeometry().setFromPoints(lst.map(function (q) { return new THREE.Vector3(q.x, fin(q.y) ? q.y : edit.base + 0.02, q.z); }));
        var l = new THREE.Line(g, mt || matLinha); l.renderOrder = 998; l.raycast = function () {}; l.frustumCulled = false; grp.add(l);
      }
      /* a PRÉVIA ao vivo: o contorno, as setas do caimento e o telhado FANTASMA (as águas calculadas pelo motor de sempre,
         translúcidas). Recalcula só quando o cursor anda 1 cm. */
      function fantasma(c) {
        var k = JSON.stringify([pts, c ? [Math.round(c.x * 100), Math.round(c.z * 100), fin(c.y) ? Math.round(c.y * 100) : null] : null, cfg.telhado.modo, cfg.telhado.aguas, cfg.telhado.ref, cfg.telhado.comp, cfg.telhado.larg, cfg.telhado.inclinacao, !!segEf()]);
        if (k === kFant) return; kFant = k;
        limparPrevia();
        var L = comCursor(c), y0 = edit.base + 0.02, r = self.contornoDesenho(L, { seguir: segEf() });
        if (cfg.telhado.modo === "corte" && L.length >= 2) addLinha([L[0], L[1]]);   /* o perfil (com a altura dos pontos no 3D) */
        if (!r.ok || !r.contorno) { if (L.length >= 2 && cfg.telhado.modo !== "corte") addLinha(L); return; }
        addLinha(r.contorno.concat([r.contorno[0]]).map(function (q) { return { x: q.x, y: y0, z: q.z }; }));
        var o = null; try { o = self.opTelhadoDesenho(edit.estado, L, nivel(), edit.base, { seguir: segEf(), leve: true }); } catch (eF) { o = null; }
        var T = TM(), t = o && o.ok ? o.telhado : null, yT = function () { return y0; };
        if (t && T) {
          var pos = [];
          arr(t.aguasCalc).forEach(function (ag) {
            arr(ag.pecas).forEach(function (pc) {
              var Q = pc.pts.map(function (q) { return [q.x, q.z]; }), tris = []; try { tris = T.triangular(Q); } catch (eT) { tris = []; }
              tris.forEach(function (tr) { tr.forEach(function (q) { pos.push(q[0], T.yPlano(ag.plano, q[0], q[1]) + 0.01, q[1]); }); });
            });
          });
          if (pos.length) {
            var g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
            var ms = new THREE.Mesh(g, matFant); ms.renderOrder = 997; ms.raycast = function () {}; ms.frustumCulled = false; grp.add(ms);
            yT = function (x, z) { var y = T.alturaEm ? T.alturaEm(t, x, z) : null; return y == null ? y0 : y + 0.05; };
          }
        }
        arr(r.setas).forEach(function (sa) { var sp = setaPts(sa, yT); if (sp) sp.forEach(function (l) { addLinha(l, matSeta); }); });
      }
      /* a peça a seguir: a do editor (barra/viga com eixo) ou a FACE clicada no 3D */
      function infoDoHit(hit, q, e) {
        var id = api.alvo ? api.alvo() : null, ip = id != null ? self.infoDaPeca(edit.estado, id, q) : null;
        if (ip) return ip;
        /* na PLANTA a viga acima do corte não tem pegada: vale a barra/viga cujo eixo passa a até 40 cm do clique */
        if (e && e._planta) { ip = self.pecaNaPlanta(edit.estado, q, 0.4); if (ip) return ip; }
        if (hit && hit.face && hit.object && hit.object.matrixWorld) {
          var nW = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
          return { info: { normal: { x: nW.x, y: nW.y, z: nW.z }, ponto: { x: hit.point.x, y: hit.point.y, z: hit.point.z } }, rotulo: "face inclinada" };
        }
        return null;
      }
      function repintarBarra() { try { if (global.BimBarraOpcoes && global.BimBarraOpcoes.pintar) global.BimBarraOpcoes.pintar(); } catch (eB) {} }
      function dicaTelhado() {
        var c = cfg.telhado, m = c.modo, n = pts.length, tp = c.aguas === 1 ? "1 água" : (c.aguas === 2 ? "2 águas" : "várias águas");
        if (segPick) return "Seguir inclinação: clique na peça (viga, terça, peça de madeira) ou na face inclinada de um volume/laje. Esc cancela.";
        if (m === "linha") return n === 0 ? "Telhado (" + tp + ") por linha: clique o INÍCIO da " + (c.ref === "cumeeira" ? "cumeeira" : "linha do beiral") + "." :
          (n === 1 ? "Agora o FIM da linha" + (c.comp ? " (comprimento " + n2(c.comp) + " m: só a direção)" : "") + ". Digite um número para cotar." : "Agora clique para que lado é o CAIMENTO" + (c.larg ? " (largura " + n2(c.larg) + " m)" : " (a distância é a largura)") + ". Enter confirma.");
        if (m === "corte") return n === 0 ? "Telhado (" + tp + ") por corte: clique o pé da água (beiral) na linha do perfil." : (n === 1 ? "Agora o topo da água (cumeeira). No 3D, com a altura dos pontos, a inclinação sai da linha." :
          (n === 2 ? "Agora onde o telhado COMEÇA." : "Agora onde o telhado TERMINA. Enter confirma."));
        if (m === "retangulo") { var sg = segEf(); return (sg ? "Seguindo " + sg.rotulo + " (" + n2(sg.inclinacao, 1) + " %): " : "Telhado (" + tp + "): ") + (n === 0 ? "clique dois cantos OPOSTOS (pela linha da parede, sem o beiral)." : "agora o canto oposto. Enter confirma."); }
        return "";
      }
      function concluirTelhado() {
        var r = self.opTelhadoDesenho(edit.estado, pts, nivel(), edit.base, { seguir: segEf() });
        if (r.ok && segAuto && !cfg.telhado.seguir) r.resumo += " (inclinação da face: " + n2(segAuto.inclinacao, 1) + " %)";
        /* as cotas digitadas valem para ESTE telhado (o próximo volta a ser pelo clique) */
        if (r.ok && (cfg.telhado.comp != null || cfg.telhado.larg != null)) { cfg.telhado.comp = null; cfg.telhado.larg = null; setTimeout(repintarBarra, 0); }
        return feito(r);
      }
      function cliqueTelhado(e, hit, p) {
        var c = cfg.telhado, q = { x: p.x, y: p.y, z: p.z };
        if (segPick) {
          var ip = infoDoHit(hit, q, e), r = self.seguir(ip ? ip.info : null, ip ? ip.rotulo : null);
          if (!r.ok) { api.hint(r.motivo); return true; }
          segPick = false; cancelar(); repintarBarra();
          var ms = "Seguindo " + r.rotulo + ": " + n2(r.inclinacao, 1) + " %, apoio na cota " + n2(r.ponto.y) + " m. Clique dois cantos do telhado de 1 água.";
          api.hint(ms); status(ms); return true;
        }
        /* no 3D, o 1º canto do retângulo de 1 água sobre uma FACE INCLINADA já captura a inclinação dela */
        if (!pts.length && c.modo === "retangulo" && c.aguas === 1 && !c.seguir && hit && hit.face && !(e && e._planta)) {
          var ia = infoDoHit(hit, q), ri = ia && ia.info && ia.info.normal ? inclinacaoDePeca(ia.info, "face inclinada") : null;
          if (ri && ri.ok) segAuto = ri;
        }
        /* o Orto/incrementos valem para a DIREÇÃO da linha (2º ponto); o lado do caimento e o começo/fim são distâncias */
        if (pts.length === 1 && c.modo !== "retangulo") { var qt = travar("telhado", q, e); if (qt !== q) q = { x: qt.x, y: q.y, z: qt.z }; }
        pts.push(q); marca(q);
        if (pts.length >= nPts()) return concluirTelhado();
        kFant = ""; fantasma(cur);
        api.hint(dicaTelhado() + (segAuto && pts.length === 1 ? " Face inclinada capturada: " + n2(segAuto.inclinacao, 1) + " %." : ""));
        return true;
      }
      /* Enter e as cotas digitadas: o próximo ponto é o do cursor (com o comprimento/largura dos campos) */
      function avancarTelhado() {
        if (!edit || !edit.on || edit.sub !== "telhado" || !telNovo() || !pts.length) return false;
        var c = cfg.telhado, alvo = cur;
        if (!alvo) { var u = pts[pts.length - 1]; alvo = { x: u.x + 1, y: u.y, z: u.z + 1 }; }
        if (c.modo === "linha" && pts.length === 1 && fin(c.comp) && c.comp > 0) {
          var a = pts[0], dx = alvo.x - a.x, dz = alvo.z - a.z, L = Math.sqrt(dx * dx + dz * dz); if (!(L > 1e-6)) { dx = 1; dz = 0; L = 1; }
          alvo = { x: a.x + dx / L * c.comp, y: alvo.y, z: a.z + dz / L * c.comp };
        }
        pts.push(alvo); marca(alvo);
        if (pts.length >= nPts()) { concluirTelhado(); return true; }
        kFant = ""; fantasma(cur); api.hint(dicaTelhado());
        return true;
      }
      var m3d = {
        contar: function (st) { return arr(st && st.telhados).length + arr(st && st.bordas).length + arr(st && st.fundacoes).length + arr(st && st.platibandas).length + arr(st && st.calhasEmbutidas).length + arr(st && st.condutores).length + arr(st && st.sancas).length; },
        dica: function (sub) {
          if (sub === "telhado" && (telNovo() || segPick)) return dicaTelhado();
          if (sub === "telhado") { var m = cfg.telhado.modo; return m === "contorno" ? "Telhado por perímetro: clique os cantos (pela linha da parede); feche no primeiro ponto ou com Enter. O beiral sai para fora." : (m === "extrusao" ? "Telhado por extrusão: clique o início e o fim da base e depois até onde ele vai." : "Telhado: clique dois cantos OPOSTOS (pela linha da parede, sem o beiral)."); }
          if (sub === "fundacao") { var tf = cfg.fundacao.tipoFundacao; return tf === "baldrame" ? "Baldrame: clique o início e o fim." : (tf === "radier" ? (cfg.fundacao.radierModo === "contorno" ? "Radier: clique os cantos; feche no primeiro ponto ou com Enter." : "Radier: clique dois cantos opostos.") : ROT_FUND[tf] + ": clique o centro."); }
          if (sub === "telhado-borda") return TM().BORDAS[cfg.borda.tipoBorda].rotulo + ": clique perto da aresta do telhado (a borda do beiral).";
          if (sub === "telhado-unir") return unirA ? "Agora clique o telhado em que o " + unirA + " encosta." : "Unir telhado: clique o telhado que ENTRA no outro.";
          return "";
        },
        aoSub: function (sub) { cancelar(); segPick = false; void sub; },
        cancelar: function () { cancelar(); segPick = false; },
        /* T4: a barra e a planta conversam com o desenho do telhado por aqui */
        pendentes: function () { return pts.length + (segPick ? 1 : 0); },
        base: function () { var u = pts[0]; return u && pts.length === 1 && edit && edit.sub === "telhado" && telNovo() && cfg.telhado.modo !== "retangulo" ? { x: u.x, z: u.z } : null; },
        avancar: avancarTelhado,
        pegarPeca: function (on) { var v = on == null ? !segPick : !!on; cancelar(); segPick = v; if (api.hint && edit && edit.sub === "telhado") api.hint(dicaTelhado()); return segPick; },
        pegando: function () { return segPick; },
        refazerPrevia: function () { kFant = ""; if (pts.length) fantasma(cur); else limparPrevia(); },
        /* a prévia na PLANTA (js/bimplantamodelar.js): o contorno, a linha do perfil e as setas, em {x, z} */
        previaPlanta: function (c) {
          if (!edit || !edit.on || edit.sub !== "telhado" || !telNovo()) return [];
          if (c) cur = { x: c.x, y: edit.base, z: c.z };
          var out = [], L = comCursor(cur), r = pts.length ? self.contornoDesenho(L, { seguir: segEf() }) : null;
          if (cfg.telhado.modo === "corte" && L.length >= 2) out.push({ pts: [L[0], L[1]], cls: "pm-elastico" });
          if (r && r.ok && r.contorno) {
            out.push({ pts: r.contorno, cls: "pm-telhado", fechar: true });
            arr(r.setas).forEach(function (sa) { var sp = setaPts(sa, 0); if (sp) sp.forEach(function (l) { out.push({ pts: l, cls: "pm-telhado-seta" }); }); });
          } else if (L.length >= 2) out.push({ pts: L, cls: "pm-elastico" });
          return out;
        },
        estado: function () { return { pts: pts.map(function (q) { return { x: q.x, y: q.y, z: q.z }; }), pegando: segPick, segAuto: segAuto, cursor: cur, previa: grp.children.length }; },
        fechar: function () {
          var sub = edit && edit.sub; if (!SUBS[sub] || pts.length < 3) return false;
          var C = pts.map(function (q) { return { x: q.x, z: q.z }; });
          if (sub === "telhado" && cfg.telhado.modo === "contorno") return feito(self.opTelhado(edit.estado, { contorno: C }, nivel(), edit.base));
          if (sub === "fundacao" && cfg.fundacao.tipoFundacao === "radier" && cfg.fundacao.radierModo === "contorno") return feito(self.opFundacao(edit.estado, { contorno: C }, nivel(), edit.base));
          return false;
        },
        mover: function (e) {
          var sub = edit && edit.on ? edit.sub : null; if (!SUBS[sub] || !pts.length || !api.planoPonto) return false;
          var p = api.planoPonto(e.clientX, e.clientY); if (!p) return false;
          if (sub === "telhado" && telNovo()) {
            var ul = null; try { var pz = global.BIM && global.BIM.precisao ? global.BIM.precisao() : null; ul = pz && pz.estado ? pz.estado().ultimo : null; } catch (eU) { ul = null; }
            var cp = ul && ul.p && fin(ul.p.x) ? { x: ul.p.x, y: fin(ul.p.y) ? ul.p.y : p.y, z: ul.p.z } : { x: p.x, y: p.y, z: p.z };
            if (cfg.telhado.modo !== "retangulo" && pts.length === 1) { var tq = travar(sub, cp, e); cp = { x: tq.x, y: cp.y, z: tq.z }; }
            cur = cp;
            var ag = Date.now(); if (ag - tFant < 30) return false; tFant = ag;
            fantasma(cur); return false;
          }
          var mo = modoPts(sub), a = pts[0];
          if (mo === "retangulo" && pts.length === 1) linha([a, { x: p.x, z: a.z }, { x: p.x, z: p.z }, { x: a.x, z: p.z }, a]);
          else linha(pts.concat([travar(sub, { x: p.x, z: p.z }, e)]));
          return false;
        },
        clique: function (sub, e, hit, p) {
          if (!SUBS[sub]) return false;
          if (!p) { api.hint("Não achei o ponto no plano de trabalho: clique no chão do nível."); return true; }
          var q = { x: p.x, z: p.z };
          if (sub === "telhado-unir") {
            var id = api.alvo ? api.alvo() : null, ehTel = id != null && arr(edit.estado && edit.estado.telhados).some(function (t) { return String(t.id) === String(id); });
            if (!ehTel) { api.hint("Clique EM CIMA de um telhado criado aqui."); return true; }
            if (!unirA) { unirA = String(id); api.hint(m3d.dica(sub)); return true; }
            var r = self.opUnir(edit.estado, unirA, id); unirA = null; return feito(r);
          }
          if (sub === "telhado-borda") return feito(self.opBorda(edit.estado, q, null));
          if (sub === "telhado" && (telNovo() || segPick)) return cliqueTelhado(e, hit, p);
          var mo = modoPts(sub);
          if (mo === "um") return feito(self.opFundacao(edit.estado, { p1: q }, nivel(), edit.base));
          if (mo === "contorno" && perto1(e)) return m3d.fechar();
          q = travar(sub, q, e);
          pts.push(q); marca(q);
          if (mo === "dois" && pts.length === 2) return feito(self.opFundacao(edit.estado, { p1: pts[0], p2: pts[1] }, nivel(), edit.base));
          if (mo === "retangulo" && pts.length === 2) return feito(sub === "telhado" ? self.opTelhado(edit.estado, { p1: pts[0], p2: pts[1] }, nivel(), edit.base) : self.opFundacao(edit.estado, { p1: pts[0], p2: pts[1] }, nivel(), edit.base));
          if (mo === "extrusao" && pts.length === 3) return feito(self.opTelhado(edit.estado, { p1: pts[0], p2: pts[1], p3: pts[2] }, nivel(), edit.base));
          api.hint(mo === "contorno" ? pts.length + " ponto(s)" + (pts.length >= 3 ? " — clique no primeiro ponto ou Enter para fechar." : " — siga clicando os cantos.") : (mo === "extrusao" ? (pts.length === 1 ? "Agora o fim da base." : "Agora até onde a extrusão vai.") : "Agora o outro ponto."));
          return true;
        },
        /* o DESENHO (chamado no editRebuild, dentro do modelo "Criados no OrçaPRO") */
        malhas: function (st, mo, addMesh) { self.desenhar(THREE, st, mo, addMesh); }
      };
      /* Enter fecha o contorno (captura: o Enter da casca repetiria o comando da fita) */
      if (typeof window !== "undefined") window.addEventListener("keydown", function (ev) {
        if (!edit || !edit.on || !SUBS[edit.sub]) return;
        var t3 = ev.target || {}; if (/^(INPUT|TEXTAREA|SELECT)$/.test(t3.tagName || "") || t3.isContentEditable) return;
        /* T4: no desenho do telhado, Enter usa o cursor como o próximo ponto; um número abre a cota na barra
           (comprimento no 2º ponto, largura no 3º da linha, a inclinação no resto) — Enter no campo confirma */
        if (edit.sub === "telhado" && telNovo() && pts.length) {
          if (ev.key === "Enter") { if (avancarTelhado()) { ev.preventDefault(); ev.stopImmediatePropagation(); } return; }
          if (!ev.ctrlKey && !ev.metaKey && !ev.altKey && /^[0-9]$/.test(ev.key)) {
            var mo2 = cfg.telhado.modo, campo = mo2 === "linha" ? (pts.length === 1 ? "comp" : "larg") : (mo2 === "retangulo" ? "comp" : "incl");
            var el = typeof document !== "undefined" ? document.querySelector('[data-bbo="p3:' + campo + '"]') : null;
            if (el) { el.focus(); el.value = ev.key; try { el.setSelectionRange(1, 1); } catch (eS) {} ev.preventDefault(); ev.stopImmediatePropagation(); }
            return;
          }
        }
        if (ev.key !== "Enter" || pts.length < 3) return;
        if (m3d.fechar()) { ev.preventDefault(); ev.stopPropagation(); }
      }, true);
      this._m3d = m3d;
      return m3d;
    },

    /* --------------------------------------------- desenho (prismas indexados) */
    _mats: null,
    _mat: function (THREE, k) {
      var M = this._mats || (this._mats = {});
      if (M[k]) return M[k];
      var cores = { ceramica: 0xa65a3a, fibrocimento: 0xb9bcbe, metalica: 0x8f9aa6, concreto: 0xa9b0b8, chapa: 0x8a8f96, intradorso: 0xe8e2d4, isolante: 0xf3efe2, reboco: 0xe4e0d8, pvc: 0xeceae4,
                    madeiraEstr: 0x9c6b3f, concretoTelha: 0x6e7275,   /* T1: madeira da estrutura do telhado e telha de concreto (T4: cinza do concreto) */
                    "nucleo-eps": 0xe6e4dc, "nucleo-pir": 0xe3cf8f, "nucleo-pu": 0xe8d27c };   /* T4: o núcleo da sanduíche — isopor branco-acinzentado; PIR/PU creme */
      if (k === "madeira") {
        /* a face de baixo "efeito madeira" da telha sanduíche: a COR da madeira (a malha mesclada do 3D pinta por cor) e, com a
           biblioteca de texturas carregada, o slug do forro lambri — com "Materiais realistas" ligado vira veio de madeira de verdade */
        var BTx = global.BimTextura, slug = "forro_madeira_lambri", lib = BTx && BTx.BIB && BTx.BIB[slug], rgb = lib && lib.media ? lib.media : [0.63, 0.44, 0.28];
        var mw = new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace), metalness: 0.05, roughness: 0.65, side: THREE.DoubleSide });
        mw.userData.corLin = mw.color.clone(); mw.userData.rgba = [rgb[0], rgb[1], rgb[2], 1];
        if (lib) { mw.userData.tex = { slug: slug, escala: lib.m, asp: lib.asp || 1, fonte: "telha", classe: "", material: slug }; mw.userData.corIfc = [rgb[0], rgb[1], rgb[2]]; }
        M[k] = mw;
        return M[k];
      }
      M[k] = new THREE.MeshStandardMaterial({ color: cores[k] || 0xa9b0b8, metalness: k === "chapa" || k === "metalica" ? 0.4 : 0.03, roughness: /^nucleo/.test(k) ? 0.95 : 0.85, side: THREE.DoubleSide });
      /* T4 — a TEXTURA da telha (biblioteca do js/bimtextura.js; com "Materiais realistas" vira mapa de verdade, tingido para a
         cor da telha): cerâmica = terracota (a foto das telhas na escala da onda modelada, ~19 peças por repetição), concreto =
         concreto cinza, fibrocimento = cimento liso claro, metálica = chapa. Sem a biblioteca, fica a cor. */
      var TX = { ceramica: { slug: "telha_ceramica", escala: 4.1 }, concretoTelha: { slug: "cimento_queimado" }, fibrocimento: { slug: "concreto_liso_claro" }, metalica: { slug: "aluminio_escovado" } }[k];
      var BT2 = global.BimTextura, lb = TX && BT2 && BT2.BIB ? BT2.BIB[TX.slug] : null;
      if (lb && (!BT2.existe || BT2.existe(TX.slug))) {
        var hx = cores[k], sr = [((hx >> 16) & 255) / 255, ((hx >> 8) & 255) / 255, (hx & 255) / 255];
        if (THREE.SRGBColorSpace) M[k].color = new THREE.Color().setRGB(sr[0], sr[1], sr[2], THREE.SRGBColorSpace);
        M[k].userData.corLin = M[k].color.clone(); M[k].userData.rgba = [sr[0], sr[1], sr[2], 1];
        M[k].userData.tex = { slug: TX.slug, escala: TX.escala || lb.m, asp: lb.asp || 1, fonte: "telha", classe: "", material: TX.slug }; M[k].userData.corIfc = sr;
      }
      return M[k];
    },
    /* polígono da planta Q [[x,z]] (anti-horário) com o fundo yb(i) e o topo yt(i) por vértice */
    _prisma: function (THREE, Q, yb, yt) {
      var V2 = function (q) { return new THREE.Vector2(q[0], q[1]); }, pos = [], tris = [];
      try { tris = THREE.ShapeUtils.triangulateShape(Q.map(V2), []); } catch (e) { tris = []; }
      function v(i, top) { pos.push(Q[i][0], top ? yt(i) : yb(i), Q[i][1]); }
      tris.forEach(function (t) { v(t[0], 0); v(t[2], 0); v(t[1], 0); v(t[0], 1); v(t[1], 1); v(t[2], 1); });
      for (var i = 0; i < Q.length; i++) { var j = (i + 1) % Q.length; v(i, 0); v(j, 0); v(j, 1); v(i, 0); v(j, 1); v(i, 1); }
      return this._geo(THREE, pos);
    },
    _faces: function (THREE, faces) {
      var pos = [];
      faces.forEach(function (f) { for (var k = 1; k + 1 < f.length; k++) [f[0], f[k], f[k + 1]].forEach(function (p) { pos.push(p[0], p[1], p[2]); }); });
      return this._geo(THREE, pos);
    },
    _geo: function (THREE, pos) {
      var g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      var idx = []; for (var q = 0; q < pos.length / 3; q++) idx.push(q);
      g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingBox(); return g;
    },
    desenhar: function (THREE, st, mo, addMesh) {
      var self = this;
      function reg(id, ifc, nome, qto, disc) {
        mo.tipos[ifc] = (mo.tipos[ifc] || 0) + 1; mo.qto[id] = qto;
        mo.elementos.push({ id: id, uid: "edit:" + id, mid: "edit", arquivo: mo.nome, tipo: ifc, nome: nome, etapa: null, codOrc: null, qto: qto, disciplina: disc || "arquitetura" });
        mo.nEl++;
      }
      arr(st.telhados).forEach(function (t) {
        if (!t || !t.ok) return;
        /* T1 — TELHADO PARAMÉTRICO: com o pacote (modelo), a estrutura e as telhas MODELADAS no lugar da placa do telhado.
           Malha mesclada: uma por material da estrutura e uma por água (por cima e por baixo) — js/bimtelhadoestrut.js geometria */
        var ESg = ESM();
        if (t.pacote && t.pacote.ok && ESg && ESg.geometria) {
          var G = null; try { G = ESg.geometria(t); } catch (eG) { G = null; }
          if (G && G.grupos.length) {
            var tlx = TM().telha(t.tipoId), fam = tlx ? tlx.familia : "";
            G.grupos.forEach(function (g) {
              var mk = g.material === "madeira" ? "madeiraEstr" : (g.material === "aco" ? "chapa" : (g.material === "telha-madeira" ? "madeira" : (g.material === "telha-nucleo" ? "nucleo-" + String(g.nucleo || "EPS").toLowerCase() : (fam === "fibrocimento" ? "fibrocimento" : (fam === "metalica" || fam === "sanduiche" ? "metalica" : (fam === "concreto" ? "concretoTelha" : "ceramica"))))));
              var mt = self._mat(THREE, mk), me = new THREE.Mesh(self._geo(THREE, g.pos), mt);
              me.userData.telhadoGrupo = g.chave;   /* T5: o clique sabe se caiu na estrutura ou na telha (BimTelhadoPecaUI) */
              addMesh(me, t.id, "IFCROOF", mt);
            });
            reg(t.id, "IFCROOF", "Telhado " + (t.tipoTelhado ? t.tipoTelhado.rotulo : "") + " — " + t.nAguas + " água(s), " + t.pacote.rotulo + " (sintético " + t.id + ")", { area: t.area, areaProjecao: t.areaProjecao, volume: t.volume, comprimento: t.cumeeira, contagem: 1 });
            return;
          }
        }
        var cam = t.tipoTelhado && t.tipoTelhado.camadas && t.tipoTelhado.camadas[0], mn = String(cam && cam.material || "").toLowerCase();
        var mat = self._mat(THREE, /fibro/.test(mn) ? "fibrocimento" : (/aço|aco|metal|eps/.test(mn) ? "metalica" : "ceramica")), esp = +t.espessura || 0.08;
        var camadas = t.tipoTelhado && arr(t.tipoTelhado.camadas).length > 1 ? t.tipoTelhado.camadas : null;
        arr(t.aguasCalc).forEach(function (ag) {
          ag.pecas.forEach(function (pc) {
            var Q = pc.pts.map(function (q) { return [q.x, q.z]; }), Y = pc.pts.map(function (q) { return q.y; }), dy = esp * ag.fator;
            if (!camadas) { addMesh(new THREE.Mesh(self._prisma(THREE, Q, function (i) { return Y[i]; }, function (i) { return Y[i] + dy; }), mat), t.id, "IFCROOF", mat); return; }
            /* tipo com camadas (sanduíche): cada camada é um prisma, DE CIMA PARA BAIXO; a de baixo "efeito madeira" leva a textura */
            var topo = dy, k;
            for (k = 0; k < camadas.length; k++) {
              var e = (+camadas[k].e || 0) * ag.fator, mk = String(camadas[k].material || "").toLowerCase(), tk = topo, bk = topo - e, km;
              km = /madeira/.test(mk) ? "madeira" : (/eps|pir|isol/.test(mk) ? "isolante" : (/aço|aco|metal/.test(mk) ? "metalica" : "ceramica"));
              var mk3 = self._mat(THREE, km), geo = self._prisma(THREE, Q, function (i) { return Y[i] + bk; }, function (i) { return Y[i] + tk; });
              addMesh(new THREE.Mesh(geo, mk3), t.id, "IFCROOF", mk3);
              topo = bk;
            }
          });
        });
        reg(t.id, "IFCROOF", "Telhado " + (t.tipoTelhado ? t.tipoTelhado.rotulo : "") + " — " + t.nAguas + " água(s) (sintético " + t.id + ")", { area: t.area, areaProjecao: t.areaProjecao, volume: t.volume, comprimento: t.cumeeira, contagem: 1 });
      });
      arr(st.bordas).forEach(function (b) {
        if (!b || !b.ok) return;
        var mat = self._mat(THREE, b.tipoBorda === "intradorso" ? "intradorso" : "chapa"), lg = +b.larguraEf || 0.1, al = +b.alturaEf || 0.1, n = 0;
        if (b.tipoBorda === "intradorso") arr(b.placas).forEach(function (pq) {
          var Q = pq.pts.map(function (q) { return [q.x, q.z]; }), y = +pq.y || 0;
          if (THREE.ShapeUtils.area(Q.map(function (q) { return new THREE.Vector2(q[0], q[1]); })) < 0) Q.reverse();
          addMesh(new THREE.Mesh(self._prisma(THREE, Q, function () { return y - lg; }, function () { return y; }), mat), b.id, b.ifc, mat); n++;
        });
        else arr(b.segs).forEach(function (sg) {
          var A = new THREE.Vector3(sg.a.x, sg.a.y - al / 2, sg.a.z), B = new THREE.Vector3(sg.b.x, sg.b.y - al / 2, sg.b.z), L = A.distanceTo(B);
          if (!(L > 1e-4)) return;
          var m = new THREE.Mesh(new THREE.BoxGeometry(L, al, lg), mat);
          m.position.copy(A).add(B).multiplyScalar(0.5);
          m.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), B.clone().sub(A).normalize());
          addMesh(m, b.id, b.ifc, mat); n++;
        });
        if (n) reg(b.id, b.ifc, ({ calha: "Calha", rufo: "Rufo", testeira: "Testeira", intradorso: "Intradorso" })[b.tipoBorda] + " (sintético " + b.id + ")", { comprimento: b.comprimento, area: b.area, contagem: 1 });
      });
      arr(st.fundacoes).forEach(function (f) {
        if (!f || !f.ok) return;
        var mat = self._mat(THREE, "concreto"), y0 = +f.cotaFundo, y1 = +f.cotaTopo;
        if (f.tipoFundacao === "estaca") {
          var c = new THREE.Mesh(new THREE.CylinderGeometry(f.diametroEf / 2, f.diametroEf / 2, y1 - y0, 24), mat);
          c.position.set(+f.x || 0, (y0 + y1) / 2, +f.z || 0); addMesh(c, f.id, f.ifc, mat);
        } else if (f.tipoFundacao === "sapata" && f.chanfrada) {
          var g = (+f.giro || 0) * Math.PI / 180, cu = Math.cos(g), su = Math.sin(g), cx = +f.x || 0, cz = +f.z || 0, yr = y0 + f.alturaBaseEf;
          var cant = function (u, w, y) { return [cx + u * cu - w * su, y, cz + u * su + w * cu]; };
          var S4 = [[-1, -1], [1, -1], [1, 1], [-1, 1]], Bh = f.largura / 2, Lh = f.comprimento / 2, bh = f.larguraTopoEf / 2, lh = f.comprimentoTopoEf / 2;
          var Bk = S4.map(function (s) { return cant(s[0] * Bh, s[1] * Lh, y0); }), Rk = S4.map(function (s) { return cant(s[0] * Bh, s[1] * Lh, yr); }), Tk = S4.map(function (s) { return cant(s[0] * bh, s[1] * lh, y1); });
          var faces = [Bk.slice(), Tk.slice().reverse()];
          for (var k = 0; k < 4; k++) { var j = (k + 1) % 4; faces.push([Bk[k], Rk[k], Rk[j], Bk[j]]); faces.push([Rk[k], Tk[k], Tk[j], Rk[j]]); }
          addMesh(new THREE.Mesh(self._faces(THREE, faces), mat), f.id, f.ifc, mat);
        } else if (arr(f.planta).length >= 3) {
          var Q = f.planta.map(function (q) { return [q.x, q.z]; });
          if (THREE.ShapeUtils.area(Q.map(function (q) { return new THREE.Vector2(q[0], q[1]); })) < 0) Q.reverse();
          addMesh(new THREE.Mesh(self._prisma(THREE, Q, function () { return y0; }, function () { return y1; }), mat), f.id, f.ifc, mat);
        }
        if (f.tipoFundacao === "bloco") arr(f.estacas).forEach(function (e) {
          var L = f.comprimentoEstacaEf, c2 = new THREE.Mesh(new THREE.CylinderGeometry(f.diametroEf / 2, f.diametroEf / 2, L, 24), mat);
          c2.position.set(e.x, y0 - L / 2, e.z); addMesh(c2, f.id, f.ifc, mat);
        });
        reg(f.id, f.ifc, (f.rotuloTipo || "Fundação") + " (sintética " + f.id + ")", { volume: f.volume, area: f.areaBase, comprimento: f.comprimentoPeca || f.comprimentoEstacas || 0, contagem: 1 }, "estrutura");
      });
      /* COBERTURA COMPLETA (js/bimcoberturaui.js): platibanda, rufos, calha embutida, condutores e sanca */
      if (global.BimCoberturaUI && global.BimCoberturaUI.desenhar) global.BimCoberturaUI.desenhar(THREE, st, mo, addMesh, self, reg);
    }
  };
  function temCampo(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  global.BimP3UI = BimP3UI;
  if (typeof module !== "undefined" && module.exports) module.exports = BimP3UI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
/* =====================================================================
 * BimTelhadoPecaUI — T5 (20/10/2026): EDITAR UMA PEÇA DA ESTRUTURA DO TELHADO
 * O pedido do dono (Casa 487, print_22/23): "não consigo excluir nem editar uma viga/terça — a seleção pega o
 * telhado inteiro". A estrutura é DERIVADA (js/bimtelhadoestrut.js modelar): no 3D ela é uma malha MESCLADA por
 * material, então quem é a peça sai do ponto clicado (BimTelhadoEstrut.pecaMaisPerto).
 *   · 1º clique no telhado = o CONJUNTO (como sempre); CLIQUE DE NOVO no mesmo telhado (ou Tab) = a PEÇA sob o
 *     cursor (a terça/caibro/ripa/tesoura/viga/pilar mais perto do ponto) — realçada em verde no 3D;
 *   · com a peça: Delete apaga só ela; Propriedades trocam o perfil/seção, deslocam e esticam; "Voltar ao
 *     automático" desfaz a edição; Tab ou Esc voltam ao conjunto;
 *   · cada edição é UMA op `telhado` com `sobrepor` (um Ctrl+Z desfaz), guardada na op e refeita a cada mudança
 *     do telhado (o id da peça é pela função e posição — muda a inclinação, a edição continua).
 *   · nas Propriedades do telhado: "Peças editadas" (as removidas não têm onde clicar) e os problemas com Corrigir.
 * ===================================================================== */
(function (global) {
  "use strict";
  function ES() { return global.BimTelhadoEstrut || null; }
  function B() { return global.BIM || null; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function n2(v, c) { c = c == null ? 2 : c; var x = Number(v); return isFinite(x) ? x.toFixed(c).replace(".", ",") : "—"; }
  function status(t) { try { if (global.BimShell && global.BimShell.status) global.BimShell.status(t); } catch (e) {} }
  /* sub = { tid, pid }; ultimo = { tid, p:[x,y,z] }; sel = a última seleção do 3D (o telhado não entra na seleção do desenho
     de precisão, que é só de caixas: a seleção vem do gancho do selAplicar) */
  var st = { sub: null, ultimo: null, app: null, info: null, sel: [] };

  function estado() { var b = B(), e = b && b.editarEstado ? b.editarEstado() : null; return e ? e.estado : null; }
  function telhado(tid) { var s = estado(); return s ? arr(s.telhados).filter(function (t) { return t && String(t.id) === String(tid); })[0] || null : null; }
  function comPacote(tid) { var t = telhado(tid); return t && t.pacote && t.pacote.ok ? t : null; }
  function tidDe(uid) { var m = /^edit:(.+)$/.exec(String(uid || "")); return m ? m[1] : null; }
  function peca(t, pid) { return t && t.pacote ? arr(t.pacote.pecas).filter(function (o) { return o.id === pid; })[0] || null : null; }
  function realcar() {
    var b = B(); if (!b || !b.realceTelhadoPeca) return;
    var t = st.sub ? comPacote(st.sub.tid) : null, o = t ? peca(t, st.sub.pid) : null;
    if (st.sub && !o) st.sub = null;
    try { b.realceTelhadoPeca(o && ES() ? ES().malhaPeca(o) : null); } catch (e) {}
  }
  function repintar() {
    if (!st.app || !st.info || !global.BimShell) return;
    try { global.BimShell.pintarProps(st.app._bimPropsPeca(st.info)); } catch (e) {}
  }
  /* a peça mais perto do ponto; o clique só aceita a que está a ≤ 60 cm (longe = o telhado inteiro); o Tab pega a mais perto */
  function escolher(tid, P, semLimite) {
    var t = comPacote(tid), E = ES(); if (!t || !E || !P) return null;
    var r = E.pecaMaisPerto(t, P); if (!r || (!semLimite && r.d > 0.6)) return null;
    st.sub = { tid: String(tid), pid: r.id };
    return r.peca;
  }
  function textoPeca(o) { return ES().rotuloPeca(o) + " " + (o.perfil || (n2(o.w * 100, 0) + "×" + n2(o.h * 100, 0) + " cm")) + ", " + n2(o.L) + " m"; }

  var BimTelhadoPecaUI = {
    estado: function () { return { sub: st.sub ? { tid: st.sub.tid, pid: st.sub.pid } : null, ultimo: st.ultimo, sel: st.sel.slice() }; },
    /* o clique no 3D (gancho no js/bim.js sel3Clique, ANTES da seleção): hits = os objetos sob o cursor */
    clique: function (uid, hits, selAtual) {
      var tid = tidDe(uid), t = tid ? comPacote(tid) : null;
      if (!t) { st.sub = null; st.ultimo = null; realcar(); return false; }
      /* o ponto: o da malha da ESTRUTURA deste telhado (a telha por cima não esconde a terça), senão o 1º do telhado */
      var hs = arr(hits).filter(function (h) { return h && h.object && h.object.userData && String(h.object.userData.expressID) === String(tid); });
      var hE = hs.filter(function (h) { return /^estr-/.test(String(h.object.userData.telhadoGrupo || "")); })[0] || hs[0];
      var P = hE ? [hE.point.x, hE.point.y, hE.point.z] : null;
      var sa = arr(selAtual).length ? arr(selAtual) : st.sel, jaSel = sa.length === 1 && sa[0] === uid;
      st.ultimo = P ? { tid: String(tid), p: P } : null;
      if (jaSel && P) {
        var o = escolher(tid, P);
        if (o) { realcar(); setTimeout(function () { status("Peça: " + textoPeca(o) + ". Delete apaga só ela; Propriedades trocam o perfil, deslocam e esticam; Tab ou Esc voltam ao telhado inteiro."); }, 0); return true; }
      }
      st.sub = null; realcar();
      setTimeout(function () { status("Telhado inteiro selecionado. Clique de novo numa peça da estrutura (ou Tab) para editar só ela."); }, 0);
      return false;
    },
    /* a seleção mudou (gancho no selAplicar): outra coisa selecionada → sai da peça */
    aoSelecionar: function (uids) {
      st.sel = arr(uids).slice();
      if (!st.sub) return;
      if (!(arr(uids).length === 1 && uids[0] === "edit:" + st.sub.tid)) { st.sub = null; realcar(); }
    },
    /* Tab: alterna conjunto ↔ peça (a do último clique); Esc: volta ao conjunto; Delete: apaga a peça */
    tecla: function (e) {
      var k = e.key; if (k !== "Tab" && k !== "Escape" && k !== "Delete" && k !== "Del") return false;
      if (e.ctrlKey || e.metaKey || e.altKey) return false;
      var tg = e.target || {}; if (/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(tg.tagName || "") || tg.isContentEditable) return false;
      if (global.document && global.document.getElementById("modal-bg")) return false;
      var sel = st.sel;
      if (k === "Tab") {
        if (!(sel.length === 1 && st.ultimo && sel[0] === "edit:" + st.ultimo.tid && comPacote(st.ultimo.tid))) return false;
        if (st.sub) { st.sub = null; status("Telhado inteiro selecionado (Tab entra na peça)."); }
        else { var o = escolher(st.ultimo.tid, st.ultimo.p, true); if (!o) return false; status("Peça: " + textoPeca(o) + ". Delete apaga só ela; Tab volta ao telhado inteiro."); }
        e.preventDefault(); e.stopImmediatePropagation(); realcar(); repintar(); return true;
      }
      if (!st.sub || !(sel.length === 1 && sel[0] === "edit:" + st.sub.tid)) return false;
      e.preventDefault(); e.stopImmediatePropagation();
      if (k === "Escape") { st.sub = null; realcar(); repintar(); status("Telhado inteiro selecionado."); return true; }
      this.apagar();
      return true;
    },
    /* a op da edição (um Ctrl+Z por edição) */
    editar: function (tid, pid, campos) {
      var b = B(), E = ES(); if (!b || !b.b2Op || !E) return false;
      var ok = b.b2Op(E.opPeca(tid, pid, campos));
      if (!ok) status("O editor recusou a edição da peça.");
      return ok;
    },
    apagar: function () {
      if (!st.sub) return false;
      var t = comPacote(st.sub.tid), o = peca(t, st.sub.pid), sub = st.sub;
      if (!o) return false;
      if (!this.editar(sub.tid, sub.pid, { removida: true })) return false;
      st.sub = null; realcar();
      var t2 = comPacote(sub.tid), pr = t2 ? arr(t2.pacote.problemas).filter(function (p) { return p.peca === sub.pid; })[0] : null;
      status(ES().rotuloPeca(o) + " apagada (só ela; Ctrl+Z desfaz)." + (pr ? " Atenção: " + pr.texto : "") + " Para trazer de volta: Propriedades do telhado › Peças editadas.");
      repintar();
      return true;
    },
    /* --------------------------------------------- Propriedades da PEÇA (gancho no _bimPropsPeca do js/gestao.js) */
    props: function (info, app) {
      if (info && /^edit:/.test(String(info.uid || ""))) { st.app = app; st.info = info; }
      if (!st.sub || !info || info.uid !== "edit:" + st.sub.tid) return null;
      var self = this, sub = st.sub, t = comPacote(sub.tid), o = peca(t, sub.pid), E = ES();
      if (!o || !E) { st.sub = null; realcar(); return null; }
      var ro = function (id, rot, v) { return { id: id, rotulo: rot, leitura: true, valor: v == null || v === "" ? "—" : v }; };
      var s = (t.sobrepor || {})[o.id] || {}, ops = E.opcoesSecao(o), aco = o.mat === "aco";
      var atual = aco ? o.perfil : (o.secao || null), autoTxt = o.auto ? (o.auto.perfil || (n2(o.auto.w * 100, 0) + "×" + n2(o.auto.h * 100, 0) + " cm")) : (o.perfil || (n2(o.w * 100, 0) + "×" + n2(o.h * 100, 0) + " cm"));
      var opc = [{ id: "", rotulo: "Automático (" + autoTxt + ")" }].concat(ops);
      var dl = s.desloc || {}, ex = s.ext || {};
      var massa = null; try { var PA = global.PerfisAco, inf = aco && PA ? PA.obter(o.perfil) : null; massa = inf && isFinite(inf.massa) ? inf.massa * o.L : null; } catch (eM) {}
      var secoes = [
        { nome: "Peça do telhado", params: [
          ro("tpe:rot", "Peça", E.rotuloPeca(o)), ro("tpe:id", "Identificador", o.id), ro("tpe:tel", "Telhado", String(sub.tid) + " — " + (t.pacote.rotulo || "")),
          ro("tpe:mat", "Material", aco ? "Aço" : "Madeira"),
          ro("tpe:ed", "Edição", o.editada && o.editada.length ? "editada (" + o.editada.join(", ") + ") — sobrevive às mudanças do telhado" : "automática (segue o telhado)") ] },
        { nome: "Editar a peça", params: [
          { id: "tpe:secao", rotulo: aco ? "Perfil" : "Seção", tipo: "lista", valor: s.perfil || s.secao || "", opcoes: opc },
          { id: "tpe:dx", rotulo: "Deslocar em X", unidade: "cm", tipo: "numero", passo: "1", valor: Math.round((dl.x || 0) * 1000) / 10 },
          { id: "tpe:dy", rotulo: "Deslocar em Y (altura)", unidade: "cm", tipo: "numero", passo: "1", valor: Math.round((dl.y || 0) * 1000) / 10 },
          { id: "tpe:dz", rotulo: "Deslocar em Z", unidade: "cm", tipo: "numero", passo: "1", valor: Math.round((dl.z || 0) * 1000) / 10 },
          { id: "tpe:ea", rotulo: "Esticar no início", unidade: "cm", tipo: "numero", passo: "1", valor: Math.round((ex.a || 0) * 1000) / 10 },
          { id: "tpe:eb", rotulo: "Esticar no fim", unidade: "cm", tipo: "numero", passo: "1", valor: Math.round((ex.b || 0) * 1000) / 10 },
          { id: "tpe:apagar", rotulo: "Apagar só esta peça", tipo: "botao", rotuloBotao: "Apagar peça (Delete)", fn: function () { self.apagar(); } } ]
          .concat(o.editada && o.editada.length ? [{ id: "tpe:auto", rotulo: "Voltar ao automático", tipo: "botao", rotuloBotao: "Voltar ao automático", fn: function () { self.editar(sub.tid, sub.pid, null); realcar(); repintar(); } }] : [])
          .concat([{ id: "tpe:conj", rotulo: "Telhado inteiro", tipo: "botao", rotuloBotao: "Voltar ao conjunto (Tab)", fn: function () { st.sub = null; realcar(); repintar(); } }]) },
        { nome: "Quantidades", params: [ ro("tpe:L", "Comprimento", n2(o.L) + " m"), aco ? ro("tpe:kg", "Massa", massa == null ? "—" : n2(massa, 1) + " kg") : ro("tpe:m3", "Volume", n2(o.L * o.w * o.h, 4) + " m³") ] }
      ];
      return {
        daPeca: true, uid: info.uid, semEditarTipo: true, titulo: E.rotuloPeca(o) + " — telhado " + sub.tid, icone: "quadrado", secoes: secoes,
        onMudar: function (pid, valor) {
          var k = String(pid), c = null, v = parseFloat(String(valor).replace(",", "."));
          if (k === "tpe:secao") { c = {}; c[aco ? "perfil" : "secao"] = valor ? String(valor) : null; }
          else if (/^tpe:d[xyz]$/.test(k) && isFinite(v)) { var d = { x: dl.x || 0, y: dl.y || 0, z: dl.z || 0 }; d[k.slice(5)] = v / 100; c = { desloc: d.x || d.y || d.z ? d : null }; }
          else if (/^tpe:e[ab]$/.test(k) && isFinite(v)) { var x2 = { a: ex.a || 0, b: ex.b || 0 }; x2[k.slice(5)] = v / 100; c = { ext: x2.a || x2.b ? x2 : null }; }
          if (c) { self.editar(sub.tid, sub.pid, c); realcar(); }
          return app._bimPropsPeca(info);
        }
      };
    },
    /* --------------------------------------------- Propriedades do TELHADO: as peças editadas e os problemas */
    secoesTelhado: function (info) {
      var tid = tidDe(info && info.uid), t = tid ? comPacote(tid) : null, self = this; if (!t || (st.sub && st.sub.tid === tid)) return [];
      var pk = t.pacote, ps = [], E = ES();
      arr(pk.problemas).forEach(function (p, i) {
        ps.push({ id: "tpe:pb" + i, rotulo: "Problema", leitura: true, valor: p.texto });
        if (p.corrigir) ps.push({ id: "tpe:pc" + i, rotulo: "Corrigir", tipo: "botao", rotuloBotao: p.corrigir.texto, fn: function () { self.editar(tid, p.peca, null); repintar(); } });
      });
      arr(pk.removidas).forEach(function (r, i) { ps.push({ id: "tpe:rm" + i, rotulo: r.rotulo + " " + r.id + " (removida)", tipo: "botao", rotuloBotao: "Voltar ao automático", fn: function () { self.editar(tid, r.id, null); repintar(); } }); });
      arr(pk.pecas).filter(function (o) { return o.editada && o.editada.length; }).forEach(function (o, i) {
        ps.push({ id: "tpe:ed" + i, rotulo: E.rotuloPeca(o) + " " + o.id + " (" + o.editada.join(", ") + ")", tipo: "botao", rotuloBotao: "Voltar ao automático", fn: function () { self.editar(tid, o.id, null); repintar(); } });
      });
      if (arr(pk.sobreporOrfas).length) ps.push({ id: "tpe:orf", rotulo: arr(pk.sobreporOrfas).length + " edição(ões) sem a peça", tipo: "botao", rotuloBotao: "Limpar", fn: function () { var m = {}; pk.sobreporOrfas.forEach(function (k) { m[k] = null; }); var b = B(); if (b && b.b2Op) b.b2Op({ op: "telhado", id: tid, sobrepor: m }); repintar(); } });
      if (!ps.length) ps.push({ id: "tpe:dica", rotulo: "Editar uma peça", leitura: true, valor: "clique de novo no telhado (ou Tab) para pegar a terça, viga, caibro, ripa ou tesoura sob o cursor" });
      return [{ nome: "Peças da estrutura", params: ps }];
    }
  };
  if (typeof global.addEventListener === "function") global.addEventListener("keydown", function (e) { try { BimTelhadoPecaUI.tecla(e); } catch (eT) {} }, true);
  global.BimTelhadoPecaUI = BimTelhadoPecaUI;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
