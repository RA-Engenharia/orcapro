/* =====================================================================
 * alvassentamento.js — A PAREDE COMO É ASSENTADA NA OBRA (motor puro, ES5,
 * Node-testável). Metros, no referencial da parede: x ao longo do EIXO
 * (0 = ponta inicial do eixo, L = ponta final), y a partir da base, z na
 * espessura (0 = eixo).
 *
 * Pedido do Rogério (20/10/2026): parede crua, sem reboco, mostrando os
 * blocos assentados — fiadas, juntas de 1 cm, amarração nos cantos e nos
 * encontros, vãos com verga e contraverga, bloco cortado onde a modulação
 * não fecha — e o quantitativo e o orçamento disso sem contar duas vezes.
 *
 * COMO A OBRA FAZ (e o que este motor reproduz)
 *   · FIADAS de altura a + j (19 + 1 = 20 cm no bloco, 5 + 1 no tijolo
 *     maciço). A 1ª fiada assenta sobre um cordão de argamassa (a junta de
 *     baixo). A paridade da fiada (par/ímpar) decide a amarração.
 *   · AMARRAÇÃO A MEIA PEÇA: na ponta LIVRE e no requadro de vão a fiada par
 *     começa com a peça inteira e a ímpar com a MEIA (meio bloco da família;
 *     no cerâmico de vedação, que não tem meio bloco no SINAPI, o inteiro
 *     CORTADO ao meio — conta 0,5 peça).
 *   · CANTO EM L e ENCONTRO EM T (amarração direta): nas fiadas em que a
 *     parede ATRAVESSA (`passa`), ela vai até a face de fora da outra
 *     (eixo + t/2), começando com a peça de amarração L quando a família tem
 *     (14×19×34 na família 39: 14 + 1 + 19 — a junta cai no módulo de 20 da
 *     outra parede); nas outras, para na face da outra (eixo − t/2). A parede
 *     que recebe o T leva a peça de amarração T (14×19×54 / 44) centrada no
 *     encontro nas fiadas em que a outra NÃO entra, e fica interrompida nas
 *     fiadas em que entra (`interrupcoes`).
 *   · VÃO: a porta e a janela interrompem as fiadas; em cima, a VERGA, e
 *     embaixo da janela, a CONTRAVERGA, passando do vão o apoio de cada lado
 *     (js/alvenaria.js: vedação 20 cm — NBR 8545; estrutural 15/30 cm —
 *     ABCP). No concreto e no cerâmico estrutural a verga é a fiada de
 *     CANALETA grauteada; no cerâmico de vedação e no tijolo, pré-moldada.
 *   · PONTA QUE NÃO FECHA: meio bloco, compensador (9 e 4 cm) e, se nem
 *     assim, a peça CORTADA — com o aviso "fora de modulação" (o auditor lê).
 *   · TOPO: vedação para a ~3 cm do teto para o ENCUNHAMENTO (SINAPI 93200);
 *     sobra maior vira uma fiada de peças cortadas na altura. Estrutural
 *     fecha com a fiada de canaleta (cinta de respaldo).
 *
 * O QUE SAI: as peças (unidade, papel, posição, corte), as vergas, a
 * argamassa (faixas por fiada, para o 3D, e o volume), a contagem por
 * unidade (inteiras, cortadas, consumo), os avisos e o ORÇAMENTO sem dobro:
 * a composição SINAPI por m² JÁ CONTA as unidades e a argamassa (regra do
 * telhado) — as unidades ficam como DETALHAMENTO, sem preço; verga,
 * contraverga e encunhamento são composições À PARTE (por metro).
 *
 * Teste: node tools/test-alvassentamento.js
 * ===================================================================== */
(function (global) {
  "use strict";

  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require(arq); } catch (e) {} }
    return null;
  }
  function num(v, d) { if (v == null || v === "") return d; var n = Number(v); return isFinite(n) ? n : d; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function r3(v) { return Math.round(v * 1000) / 1000; }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function AU() { return dep("AlvUnidades", "./alvunidades.js"); }
  function AV() { return dep("Alvenaria", "./alvenaria.js"); }

  var TOL = 0.003;            /* 3 mm: a junta absorve (1 cm ± 3 mm — Blocos.JUNTA_MIN/MAX) */
  var ENCUNHAMENTO = 0.03;    /* folga do topo da vedação para o encunhamento (prática — SINAPI 93200 por metro) */
  var H_VERGA_MIN = 0.10;     /* altura mínima de verga (NBR 8545 — via prática; a canaleta tem 19) */
  var RECUO_JUNTA = 0.005;    /* a argamassa fica 5 mm para dentro da face: a junta aparece */
  var JUNTA_GROSSA = 0.025;   /* sobra até isto vira junta mais grossa (enchimento), não peça */

  /* ------------------------------------------------------------- vãos → obstáculos */
  function apoios(fam, vao) {
    var Av = AV(), estr = fam.funcao === "estrutural";
    var w = vao.x1 - vao.x0;
    var av = 0.20, ac = 0.20, fv = "NBR 8545 (20 cm de cada lado)", fc = fv;
    if (estr) { av = w <= 1.0 ? 0.15 : 0.30; ac = 0.30; fv = "ABCP — 15 cm até 1,00 m; 30 cm acima"; fc = "ABCP (30 cm de cada lado)"; }
    if (Av && Av.verga && Av.malha) {
      /* a régua do js/alvenaria.js quando ela está carregada (os mesmos números) */
      try { var rv = Av.verga(w, "39-14", { tipo: estr ? "estrutural" : "vedacao" }); if (rv && rv.ok) { av = rv.apoioCada; fv = rv.fonte; } } catch (e) {}
      try { var rc = Av.contraverga(w, "39-14", { tipo: estr ? "estrutural" : "vedacao" }); if (rc && rc.ok) { ac = rc.apoioCada; fc = rc.fonte; } } catch (e2) {}
    }
    return { verga: av, contraverga: ac, fonteVerga: fv, fonteContra: fc };
  }

  /* intervalo livre de y numa coluna [yb, yt] tirando os obstáculos que a cobrem */
  function livreEmY(yb, yt, obs) {
    var cobre = obs.map(function (o) { return [Math.max(yb, o.y0), Math.min(yt, o.y1)]; }).filter(function (p) { return p[1] > p[0] + 1e-6; });
    if (!cobre.length) return [[yb, yt]];
    cobre.sort(function (a, b) { return a[0] - b[0]; });
    var livres = [], y = yb;
    cobre.forEach(function (p) { if (p[0] > y + 1e-6) livres.push([y, p[0]]); y = Math.max(y, p[1]); });
    if (yt > y + 1e-6) livres.push([y, yt]);
    return livres;
  }

  /* ================================================= PAGINAR UMA PAREDE */
  function paginar(parede, opts) {
    opts = opts || {};
    var U = AU();
    if (!U) return { ok: false, motivo: "catálogo de unidades (js/alvunidades.js) não carregado" };
    var fam = U.familia(parede.familia);
    if (!fam) return { ok: false, motivo: "família de alvenaria desconhecida: " + parede.familia };
    var uI = U.unidade(fam.pecas.inteiro);
    var j = num(opts.junta, U.JUNTA);
    var L = num(parede.L, 0), H = num(parede.H, 0);
    if (!(L > 0.05) || !(H > 0.05)) return { ok: false, motivo: "parede sem comprimento ou altura" };
    var c = uI.c, a = uI.a, l = uI.l, hm = a + j;
    var estr = fam.funcao === "estrutural";
    function pc(papel) { var id = fam.pecas[papel]; return id ? U.unidade(id) : null; }
    var uMeio = pc("meio"), uAmL = pc("amarracao-l"), uAmT = pc("amarracao-t"), uCan = pc("canaleta-u"), uMCan = pc("meia-canaleta") || null;
    var uC9 = pc("comp9"), uC4 = pc("comp4");
    var avisos = [], pecas = [], vergas = [], argamassa = [], cortes = 0;

    /* ---------------------------------------------- fiadas */
    var fiadas = [], k = 0;
    while (true) {
      var yk = j + k * hm;
      /* vedação: a última fiada para a ENCUNHAMENTO do teto (a folga do aperto); estrutural vai até o topo */
      if (yk + a > H - (estr ? 0 : ENCUNHAMENTO) + TOL) break;
      fiadas.push({ k: k, y: yk, a: a, cheia: true });
      k++;
    }
    var topo = fiadas.length ? fiadas[fiadas.length - 1].y + a : 0;
    var sobra = H - topo, encunhamento = null;
    if (!estr) {
      if (sobra > ENCUNHAMENTO + j + 0.04) {
        var aCorte = r4(sobra - ENCUNHAMENTO - j);
        fiadas.push({ k: k, y: topo + j, a: aCorte, cheia: false });
        avisos.push("A altura de " + H.toFixed(2) + " m não fecha em fiadas de " + Math.round(hm * 100) + " cm: a última fiada vai com peças cortadas na altura (" + Math.round(aCorte * 100) + " cm) e " + Math.round(ENCUNHAMENTO * 100) + " cm de encunhamento.");
        encunhamento = { altura: ENCUNHAMENTO, comprimento: L };
      } else if (sobra > 0.005) {
        encunhamento = { altura: r4(sobra), comprimento: L };
      }
    } else if (sobra > 0.02) {
      avisos.push("Pé-direito fora da modulação vertical: sobram " + Math.round(sobra * 100) + " cm acima da última fiada (use " + (topo).toFixed(2) + " m ou bloco de meia altura).");
    }

    /* ---------------------------------------------- obstáculos: vãos, vergas, contravergas */
    var obst = [];
    arr(parede.vaos).forEach(function (v, iv) {
      var x0 = num(v.x0, 0), x1 = num(v.x1, 0), y0 = num(v.y0, 0), y1 = num(v.y1, 0);
      if (!(x1 > x0) || !(y1 > y0)) return;
      var porta = v.tipo === "porta" || y0 < 0.05;
      obst.push({ x0: x0, x1: x1, y0: y0, y1: y1, tipo: "vao" });
      var ap = apoios(fam, { x0: x0, x1: x1 });
      var modo = (fam.grupo === "concreto" || fam.grupo === "ceramico_estrutural") ? "canaleta" : ((x1 - x0) <= 1.5 ? "premoldada" : "moldada");
      /* verga: do topo do vão até a 1ª linha de fiada acima de y1 + 10 cm */
      if (y1 < H - 0.02) {
        var yv1 = null;
        for (var q = 0; q < fiadas.length; q++) { var ft = fiadas[q].y + fiadas[q].a; if (ft >= y1 + (modo === "canaleta" ? Math.min(H_VERGA_MIN, a) : H_VERGA_MIN) - 1e-6) { yv1 = ft; break; } }
        if (yv1 == null) yv1 = Math.min(H, y1 + H_VERGA_MIN);
        var vx0 = x0 - ap.verga, vx1 = x1 + ap.verga;
        var ini0 = -num(parede.ini && parede.ini.t, 0) / 2, fim0 = L + num(parede.fim && parede.fim.t, 0) / 2;
        if (vx0 < ini0 - 1e-6 || vx1 > fim0 + 1e-6) avisos.push("Vão " + (iv + 1) + ": a verga não tem os " + Math.round(ap.verga * 100) + " cm de apoio de um dos lados (encosta na ponta da parede) — grauteie o encontro ou use pilarete.");
        vx0 = Math.max(vx0, ini0); vx1 = Math.min(vx1, fim0);
        var vg = { tipo: "verga", vao: iv, x0: r4(vx0), x1: r4(vx1), y0: r4(y1), y1: r4(yv1), modo: modo, apoio: ap.verga, fonte: ap.fonteVerga, comprimento: r4(vx1 - vx0) };
        if ((x1 - x0) > 2.40) { vg.viga = true; avisos.push("Vão " + (iv + 1) + " passa de 2,40 m: não é verga, é viga — calcule."); }
        vergas.push(vg); obst.push({ x0: vg.x0, x1: vg.x1, y0: vg.y0, y1: vg.y1, tipo: "verga" });
      }
      if (!porta) {
        var yc0 = null;
        for (var q2 = fiadas.length - 1; q2 >= 0; q2--) { if (fiadas[q2].y <= y0 - H_VERGA_MIN + 1e-6) { yc0 = fiadas[q2].y; break; } }
        if (yc0 == null) yc0 = Math.max(0, y0 - H_VERGA_MIN);
        var cx0 = Math.max(x0 - ap.contraverga, -num(parede.ini && parede.ini.t, 0) / 2), cx1 = Math.min(x1 + ap.contraverga, L + num(parede.fim && parede.fim.t, 0) / 2);
        var cv = { tipo: "contraverga", vao: iv, x0: r4(cx0), x1: r4(cx1), y0: r4(yc0), y1: r4(y0), modo: modo === "canaleta" ? "canaleta" : "premoldada", apoio: ap.contraverga, fonte: ap.fonteContra, comprimento: r4(cx1 - cx0) };
        vergas.push(cv); obst.push({ x0: cv.x0, x1: cv.x1, y0: cv.y0, y1: cv.y1, tipo: "contraverga" });
      }
    });

    /* ---------------------------------------------- pontas */
    function pontaExt(p, par) {
      if (!p || !p.tipo || p.tipo === "livre") return 0;
      var t = num(p.t, l);
      var passa = (p.passa === "par" && par === 0) || (p.passa === "impar" && par === 1) || p.passa === "sempre";
      return passa ? t / 2 : -t / 2;
    }
    function pontaPassa(p, par) {
      if (!p || !p.tipo || p.tipo === "livre") return false;
      return (p.passa === "par" && par === 0) || (p.passa === "impar" && par === 1) || p.passa === "sempre";
    }

    /* ---------------------------------------------- a fiada */
    function emitir(u, papel, x, y, cc, aa, fiada, corte, consumo) {
      pecas.push({ u: u.id, papel: papel, x: r4(x), y: r4(y), c: r4(cc), a: r4(aa), l: u.l, k: fiada.k, corte: corte || null, consumo: consumo == null ? 1 : consumo });
      if (corte) cortes++;
    }
    function canalOuNao(papel, ultima) {
      if (!ultima) return null;
      if (papel === "inteiro" && uCan && uCan.c === c) return uCan;
      if (papel === "meio" && uMCan) return uMCan;
      return null;
    }
    /* AJUSTE NA JUNTA (o que o pedreiro faz no olho — o mesmo critério do Blocos.modularFiada):
       cada junta vertical da fiada abre ou fecha até 3 mm (1 cm ± 3 mm). Uma parede de 3,00 m com
       15 blocos de 19 + 14 juntas (2,99 m) fecha abrindo 0,7 mm por junta — sem cortar bloco. */
    var AJ_JUNTA = 0.003;
    function preencher(x0, x1, fiada, comeco, altura, ultima) {
      var i0 = pecas.length;
      preencher0(x0, x1, fiada, comeco, altura, ultima);
      /* O AJUSTE NA JUNTA DE VERDADE: o "cabe" aceita fechar/abrir as juntas até 3 mm cada, mas as posições
         saíam nominais — a última peça passava da ponta (parede de 3,20 com canto em L: 2 cm além do fim, em
         toda fiada; era a "tira" na borda dos prints). Distribui a diferença pelas juntas do trecho. */
      var n = pecas.length - i0; if (n < 2) return;
      var ult = pecas[pecas.length - 1], d = x1 - (ult.x + ult.c);
      if (Math.abs(d) < 1e-4 || Math.abs(d) > (n - 1) * 0.003 + 1e-6) return;
      for (var q = 1; q < n; q++) pecas[i0 + q].x = r4(pecas[i0 + q].x + d * q / (n - 1));
    }
    function preencher0(x0, x1, fiada, comeco, altura, ultima) {
      var x = x0, cortadaAltura = altura < a - 1e-4, nJ = 0;
      var Lseg = x1 - x0;
      if (Lseg < JUNTA_GROSSA) return;   /* fresta: argamassa */
      function tol() { return Math.max(TOL, (nJ + 1) * AJ_JUNTA); }
      function poe(u, papel, cc, corte, consumo) {
        var cn = canalOuNao(papel, ultima);
        /* o canto da fiada de respaldo também é canaleta (a cinta corre contínua): a de 39 cortada no comprimento da amarração */
        if (!cn && ultima && papel === "amarracao-l" && uCan) { cn = uCan; corte = "comprimento"; }
        var uu = cn || u, pp = cn ? (papel === "meio" ? "meia-canaleta" : "canaleta-u") : papel;
        emitir(uu, pp, x, fiada.y, cc, altura, fiada, cortadaAltura ? (corte ? corte + "+altura" : "altura") : corte, consumo);
        /* a canaleta da fiada de respaldo é a CINTA SUPERIOR: grauteada (SINAPI 89995, por m³) */
        if (cn) { pecas[pecas.length - 1].graute = true; pecas[pecas.length - 1].cinta = true; }
        x += cc + j; nJ++;
      }
      function cabe(cc) { var r0 = x1 - x; return Math.abs(r0 - cc) <= tol(); }
      /* 1ª peça */
      if (comeco === "amarracao-l" && uAmL && uAmL.c <= Lseg + TOL) poe(uAmL, "amarracao-l", uAmL.c);
      else if (comeco === "meio") {
        if (uMeio && uMeio.c <= Lseg + TOL) poe(uMeio, "meio", uMeio.c);
        else { var cm = r4((c - j) / 2); if (cm <= Lseg + TOL) poe(uI, "meio-cortado", cm, "comprimento", 0.5); }
      }
      /* inteiros (o último pode entrar fechando as juntas) */
      while (x + c <= x1 + TOL || cabe(c)) { poe(uI, "inteiro", c); if (x > x1 + 1e-6) break; }
      var r = x1 - x;
      if (r < JUNTA_GROSSA - 1e-6) {
        if (r > tol() + 1e-6) avisos.push("Fiada " + (fiada.k + 1) + ": sobra de " + Math.round(r * 1000) + " mm vira junta mais grossa (enchimento de argamassa).");
        return;
      }
      var meioC = r4((c - j) / 2);
      if (uMeio && cabe(uMeio.c)) { poe(uMeio, "meio", uMeio.c); return; }
      if (!uMeio && cabe(meioC)) { poe(uI, "meio-cortado", meioC, "comprimento", 0.5); return; }
      if (uMeio && r > uMeio.c + j) { poe(uMeio, "meio", uMeio.c); r = x1 - x; if (r < JUNTA_GROSSA - 1e-6) return; }
      if (uC9 && cabe(uC9.c)) { poe(uC9, "compensador", uC9.c); return; }
      if (uC9 && uC4 && Math.abs(r - (uC9.c + j + uC4.c)) <= tol()) { poe(uC9, "compensador", uC9.c); poe(uC4, "compensador", uC4.c); return; }
      if (uC4 && cabe(uC4.c)) { poe(uC4, "compensador", uC4.c); return; }
      if (uC9 && r > uC9.c + j + JUNTA_GROSSA) { poe(uC9, "compensador", uC9.c); r = x1 - x; if (r < JUNTA_GROSSA) return; }
      /* corte */
      r = x1 - x;
      var consumo = r <= meioC + TOL ? 0.5 : 1;
      poe(uI, "cortado", r, "comprimento", consumo);
      foraModulacao.push({ fiada: fiada.k + 1, x: r4(x1 - r), comprimento: r4(r) });
    }
    var foraModulacao = [];

    var ultimaK = fiadas.length ? fiadas[fiadas.length - 1].k : -1;
    fiadas.forEach(function (fiada) {
      var par = fiada.k % 2;
      /* na ponta em L/T em que esta parede NÃO atravessa, ela encosta na face da outra com uma junta vertical */
      var xa = -pontaExt(parede.ini, par) + (parede.ini && parede.ini.tipo && parede.ini.tipo !== "livre" && !pontaPassa(parede.ini, par) ? j : 0);
      var xb = L + pontaExt(parede.fim, par) - (parede.fim && parede.fim.tipo && parede.fim.tipo !== "livre" && !pontaPassa(parede.fim, par) ? j : 0);
      var yb = fiada.y, yt = fiada.y + fiada.a;
      var ultima = estr && fiada.k === ultimaK && fiada.cheia;
      /* obstáculos desta fiada: vãos/vergas + interrupções (T que entra) + peças fixas (amarração T) */
      var obF = obst.filter(function (o) { return o.y0 < yt - 1e-6 && o.y1 > yb + 1e-6; });
      arr(parede.interrupcoes).forEach(function (it) { if (it.paridade == null || it.paridade === par) obF.push({ x0: num(it.x0), x1: num(it.x1), y0: yb, y1: yt, tipo: "interrupcao" }); });
      arr(parede.fixas).forEach(function (fx) {
        if (fx.paridade != null && fx.paridade !== par) return;
        var uf = fx.papel === "amarracao-t" ? uAmT : null; if (!uf) return;
        var fx0 = num(fx.x) - uf.c / 2, fx1 = fx0 + uf.c;
        if (fx0 < xa - 1e-6 || fx1 > xb + 1e-6) return;
        /* só se a peça não cai num vão */
        if (obF.some(function (o) { return o.x0 < fx1 && o.x1 > fx0; })) return;
        emitir(uf, "amarracao-t", fx0, fiada.y, uf.c, fiada.a, fiada, null, 1);
        obF.push({ x0: fx0 - j, x1: fx1 + j, y0: yb, y1: yt, tipo: "fixa" });
      });
      /* quebras em x */
      var xs = [xa, xb];
      obF.forEach(function (o) { if (o.x0 > xa && o.x0 < xb) xs.push(o.x0); if (o.x1 > xa && o.x1 < xb) xs.push(o.x1); });
      xs.sort(function (p, q) { return p - q; });
      var ivs = [];
      for (var i = 0; i < xs.length - 1; i++) {
        var p0 = xs[i], p1 = xs[i + 1]; if (p1 - p0 < 1e-5) continue;
        var meio = (p0 + p1) / 2;
        var cob = obF.filter(function (o) { return o.x0 <= meio && o.x1 >= meio; });
        var lv = livreEmY(yb, yt, cob);
        var chave = lv.map(function (z) { return r4(z[0]) + "-" + r4(z[1]); }).join("|");
        var ultimo = ivs[ivs.length - 1];
        if (ultimo && ultimo.chave === chave && Math.abs(ultimo.x1 - p0) < 1e-5) ultimo.x1 = p1;
        else ivs.push({ x0: p0, x1: p1, livres: lv, chave: chave });
      }
      ivs.forEach(function (iv, idx) {
        iv.livres.forEach(function (z) {
          var h = z[1] - z[0];
          if (h < 0.04) return;   /* fresta de altura: argamassa/graute da verga */
          var naPontaIni = Math.abs(iv.x0 - xa) < 1e-5 && fiada.cheia !== undefined;
          var comeco;
          if (naPontaIni) comeco = pontaPassa(parede.ini, par) ? "amarracao-l" : (parede.ini && parede.ini.tipo && parede.ini.tipo !== "livre" ? "inteiro" : (par ? "meio" : "inteiro"));
          else comeco = par ? "meio" : "inteiro";
          var f2 = { k: fiada.k, y: z[0] };
          preencher(iv.x0, iv.x1, f2, comeco, h, ultima && Math.abs(h - a) < 1e-4);
          argamassa.push({ x0: r4(iv.x0), x1: r4(iv.x1), y0: r4(z[0] - j), y1: r4(z[1]), k: fiada.k });
        });
      });
    });
    /* verga e contraverga em canaleta: as peças de canaleta grauteadas na faixa delas */
    vergas.forEach(function (vg) {
      if (vg.modo !== "canaleta") return;
      fiadas.forEach(function (fiada) {
        var yb = Math.max(fiada.y, vg.y0), yt = Math.min(fiada.y + fiada.a, vg.y1);
        if (yt - yb < 0.04) return;
        var x = vg.x0, uC = uCan || uI, nV = 0;
        while (x + uC.c <= vg.x1 + TOL) { nV++; emitir(uC, "canaleta-u", x, yb, uC.c, yt - yb, fiada, yt - yb < a - 1e-4 ? "altura" : null, 1); pecas[pecas.length - 1].graute = true; pecas[pecas.length - 1].verga = vg.tipo; x += uC.c + j; }
        var r = vg.x1 - x;
        if (r >= JUNTA_GROSSA) { var uM = uMCan && Math.abs(r - uMCan.c) <= Math.max(TOL, (nV + 1) * AJ_JUNTA) ? uMCan : uC; emitir(uM, uM === uMCan ? "meia-canaleta" : "canaleta-u", x, yb, uM === uMCan ? uMCan.c : r, yt - yb, fiada, uM === uMCan ? null : "comprimento", 1); pecas[pecas.length - 1].graute = true; pecas[pecas.length - 1].verga = vg.tipo; }
        argamassa.push({ x0: r4(vg.x0), x1: r4(vg.x1), y0: r4(yb - j), y1: r4(yt), k: fiada.k });
      });
    });
    if (foraModulacao.length) avisos.push("Fora de modulação: " + foraModulacao.length + " peça(s) cortada(s) no comprimento (a parede ou o vão não é múltiplo de " + Math.round((c + j) * 100) + " cm). Ajuste a medida ou aceite o corte.");

    /* ---------------------------------------------- contagem e argamassa */
    var porUnidade = {}, porPapel = {};
    pecas.forEach(function (p) {
      var e = porUnidade[p.u] || (porUnidade[p.u] = { unidade: p.u, nome: U.unidade(p.u).nome, inteiras: 0, cortadas: 0, consumo: 0, sinapi: U.unidade(p.u).sinapi || null });
      if (p.corte) e.cortadas++; else e.inteiras++;
      e.consumo += p.consumo;
      porPapel[p.papel] = (porPapel[p.papel] || 0) + 1;
    });
    Object.keys(porUnidade).forEach(function (k2) { porUnidade[k2].consumo = r3(porUnidade[k2].consumo); });
    var volPecas = 0;
    pecas.forEach(function (p) { volPecas += p.c * p.a * p.l; });
    var volArg = 0;
    argamassa.forEach(function (f) { volArg += (f.x1 - f.x0) * (f.y1 - f.y0) * (l - 2 * RECUO_JUNTA); });
    /* o volume da argamassa = faixas − peças (a faixa é a peça + a junta) */
    var argM3 = Math.max(0, volArg - volPecas * (l - 2 * RECUO_JUNTA) / l);
    var areaBruta = L * H, areaVaos = 0;
    arr(parede.vaos).forEach(function (v) { areaVaos += Math.max(0, num(v.x1) - num(v.x0)) * Math.max(0, Math.min(H, num(v.y1)) - Math.max(0, num(v.y0))); });
    /* graute das canaletas, separado pelo serviço SINAPI: verga + cinta superior (89995) e contraverga (89994) */
    var graute = 0, grautePor = { verga: 0, contraverga: 0, cinta: 0 };
    pecas.forEach(function (p) {
      if (!p.graute) return;
      var g = U.geometria(p.u, { c: p.c, a: p.a }), canal = g && g.furos.filter(function (h) { return h.canal; })[0];
      if (!canal) return;
      var v = canal.w * canal.h * canal.d;
      graute += v; grautePor[p.cinta ? "cinta" : (p.verga === "contraverga" ? "contraverga" : "verga")] += v;
    });
    var tri = 0;
    pecas.forEach(function (p) { var g = U.geometria(p.u, { c: p.c, a: p.a }); tri += g ? g.triangulos : 12; });
    tri += argamassa.length * 12 + vergas.filter(function (v) { return v.modo !== "canaleta"; }).length * 12;

    return {
      ok: true, id: parede.id, familia: fam.id, funcao: fam.funcao, rotulo: fam.rotulo,
      L: r4(L), H: r4(H), junta: j, modulo: { h: r4(c + j), v: r4(hm) }, espessura: l,
      fiadas: fiadas.map(function (f) { return { k: f.k, y: r4(f.y), a: r4(f.a), cheia: f.cheia }; }),
      pecas: pecas, vergas: vergas, argamassa: argamassa, encunhamento: encunhamento,
      porUnidade: porUnidade, porPapel: porPapel, cortes: cortes, foraModulacao: foraModulacao,
      areaBruta: r4(areaBruta), areaVaos: r4(areaVaos), areaLiquida: r4(areaBruta - areaVaos),
      argamassaM3: r4(argM3), grauteM3: r4(graute),
      grauteM3Por: { verga: r4(grautePor.verga), contraverga: r4(grautePor.contraverga), cinta: r4(grautePor.cinta) },
      triangulos: tri, avisos: avisos
    };
  }

  /* ================================================== ORÇAMENTO SEM DOBRO
   * res = paginar(...); opts.base = { codigo: {codigo, descricao, unidade, ...} } (a base SINAPI
   * sintética, ou o analítico com `insumos`); opts.servicosParede = os serviços que a
   * parede JÁ TEM (o código que o usuário deu): se um deles é de ALVENARIA, a composição
   * por m² não entra de novo; se é de verga/contraverga, a do motor não entra de novo.
   * Devolve linhas {codigo, descricao, unidade, quantidade, status, papel} e o detalhamento
   * das unidades (sem preço) com a comparação contra o coeficiente da composição. */
  function orcamento(res, opts) {
    opts = opts || {};
    var U = AU(); if (!res || !res.ok || !U) return { ok: false, linhas: [], detalhamento: [] };
    var fam = U.familia(res.familia), base = opts.base || {}, analitico = opts.analitico || {};
    var existentes = arr(opts.servicosParede).map(function (s) { var b = base[String(s.codigo)]; return { codigo: String(s.codigo || ""), desc: (b && b.descricao) || String(s.descricao || "") }; });
    var temAlv = existentes.some(function (s) { return /^ALVENARIA/i.test(s.desc); });
    var temVerga = existentes.some(function (s) { return /^VERGA/i.test(s.desc); });
    var temContra = existentes.some(function (s) { return /^CONTRAVERGA/i.test(s.desc); });
    var temEnc = existentes.some(function (s) { return /ENCUNHAMENTO/i.test(s.desc); });
    var linhas = [], avisos = [];
    function linha(cod, qtd, papel, motivoPend) {
      var b = cod ? base[String(cod)] : null;
      if (!cod || !b) { linhas.push({ codigo: cod || "", descricao: papel, unidade: "", quantidade: r4(qtd), status: "pendente", papel: papel, motivo: motivoPend || (cod ? "código " + cod + " não está na base" : "sem composição SINAPI para esta família") }); return; }
      linhas.push({ codigo: String(cod), descricao: b.descricao, unidade: b.unidade, quantidade: r4(qtd), status: "ok", papel: papel, custoUnitario: b.custoUnitario, total: Math.round(b.custoUnitario * qtd * 100) / 100 });
    }
    var codM2 = fam.comp;
    if (opts.classe && fam.compPorClasse && fam.compPorClasse[String(opts.classe)]) codM2 = fam.compPorClasse[String(opts.classe)];
    if (temAlv) avisos.push("A parede já tem composição de alvenaria (" + existentes.filter(function (s) { return /^ALVENARIA/i.test(s.desc); }).map(function (s) { return s.codigo; }).join(", ") + "): a do assentamento NÃO entra de novo.");
    else linha(codM2, res.areaLiquida, "alvenaria (m²)", (fam.conferir || [])[0]);
    var esp = fam.espCm <= 10 ? 10 : (fam.espCm <= 15 ? 15 : 20);
    var VS = U.VERGA_SINAPI;
    var mVerga = 0, mContra = 0, porModo = {};
    res.vergas.forEach(function (v) {
      var modo = v.modo === "canaleta" ? "canaleta" : (v.tipo === "verga" ? (v.vaoLargo ? "moldada" : v.modo) : "premoldada");
      var cod = (VS[modo] || VS.premoldada)[v.tipo][esp];
      var k = v.tipo + "|" + cod;
      porModo[k] = porModo[k] || { cod: cod, tipo: v.tipo, m: 0 };
      porModo[k].m += v.comprimento;
      if (v.tipo === "verga") mVerga += v.comprimento; else mContra += v.comprimento;
    });
    /* ALVENARIA ESTRUTURAL (revisão de 21/10/2026): a composição por m² (89453/89455/89462/89464/89282/89290)
       JÁ CONTA a canaleta (insumo CANALETA no analítico, ~1/m²). A "VERGA MOLDADA IN LOCO COM UTILIZAÇÃO DE
       BLOCOS CANALETA" (105025…) traz OUTRA canaleta (de vedação, classe C) + graute + aço — somar as duas
       cobrava a canaleta duas vezes. No estrutural entram só o GRAUTE (m³: 89995 verga e cinta superior;
       89994 contraverga) e a ARMADURA (kg, pelo projeto — pendente). */
    var estrutural = fam.funcao === "estrutural";
    var GE = U.GRAUTE_SINAPI || { verga: "89995", cinta: "89995", contraverga: "89994" };
    if (estrutural) {
      var gp = res.grauteM3Por || { verga: 0, contraverga: 0, cinta: 0 };
      var gVerga = (temVerga ? 0 : gp.verga) + gp.cinta, gContra = temContra ? 0 : gp.contraverga;
      if (gVerga > 0) linha(GE.verga, gVerga, "graute de verga e cinta superior (m³)");
      if (gContra > 0) linha(GE.contraverga, gContra, "graute de contraverga (m³)");
      if (gVerga > 0 || gContra > 0) linhas.push({ codigo: "", descricao: "armadura de verga, contraverga e cinta (kg pelo projeto — SINAPI 89999/89998 por diâmetro)", unidade: "KG", quantidade: 0, status: "pendente", papel: "armadura (kg)", motivo: "a bitola e o número de barras vêm do projeto estrutural" });
    } else Object.keys(porModo).forEach(function (k) {
      var g = porModo[k];
      if (g.tipo === "verga" && temVerga) return;
      if (g.tipo === "contraverga" && temContra) return;
      linha(g.cod, g.m, g.tipo + " (m)");
    });
    if (temVerga && mVerga) avisos.push("A parede já tem verga no orçamento: a do assentamento não entra de novo.");
    if (temContra && mContra) avisos.push("A parede já tem contraverga no orçamento: a do assentamento não entra de novo.");
    if (res.encunhamento && fam.funcao === "vedacao" && !temEnc) linha(U.ENCUNHAMENTO_SINAPI, res.encunhamento.comprimento, "encunhamento (m)");
    /* detalhamento: as unidades — JÁ DENTRO da composição por m² (sem preço aqui) */
    var comp = analitico[String(codM2)];
    var detalhamento = Object.keys(res.porUnidade).map(function (k2) {
      var e = res.porUnidade[k2], coef = null;
      if (comp && e.sinapi) comp.insumos.forEach(function (it) { if (String(it.codigo) === String(e.sinapi)) coef = it.coeficiente; });
      var naVerga = res.pecas.filter(function (p) { return p.u === k2 && p.verga; }).length;
      return { unidade: e.unidade, nome: e.nome, sinapi: e.sinapi, inteiras: e.inteiras, cortadas: e.cortadas, consumo: e.consumo,
               naVerga: naVerga, coefSinapiM2: coef, previstoSinapi: coef != null ? r3(coef * res.areaLiquida) : null,
               incluidaEm: naVerga === e.inteiras + e.cortadas ? "verga/contraverga (composição por metro)" : (temAlv ? "composição de alvenaria da parede" : (codM2 || "pendente")) };
    });
    var total = 0; linhas.forEach(function (x) { if (x.total) total += x.total; });
    return { ok: true, linhas: linhas, detalhamento: detalhamento, total: Math.round(total * 100) / 100, avisos: avisos,
             argamassaM3: res.argamassaM3, grauteM3: res.grauteM3,
             regra: estrutural
               ? "estrutural: a composição por m² JÁ conta blocos, canaletas e argamassa; à parte só o graute (m³) das canaletas de verga, contraverga e cinta e a armadura (kg, pelo projeto)"
               : "a composição por m² JÁ conta blocos e argamassa de assentamento: as unidades são detalhamento, sem preço; verga, contraverga e encunhamento são composições por metro, à parte" };
  }

  /* TETO DE TRIÂNGULOS: a parede crua de 30 m × 3 m no bloco mais detalhado
   * (cerâmico 8 furos: 96 triângulos por peça) tem de caber. Com instancing
   * a memória é a da geometria de cada TIPO de peça (uma vez) + 64 bytes de
   * matriz por peça; os triângulos contam para a placa de vídeo. */
  var TETO = { triangulosParede: 400000, triangulosCena: 2500000, distanciaDetalhe: 18, pecasCena: 60000 };

  var AlvAssentamento = { paginar: paginar, orcamento: orcamento, TETO: TETO, TOL: TOL, ENCUNHAMENTO: ENCUNHAMENTO, RECUO_JUNTA: RECUO_JUNTA };
  global.AlvAssentamento = AlvAssentamento;
  if (typeof module !== "undefined" && module.exports) module.exports = AlvAssentamento;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
