/* =====================================================================
 * blocokexec.js — MOTOR EXECUTIVO do sistema Blocok (painel 90×90 cm de
 * núcleo EPS com duas faces de microconcreto), assentado em AMARRAÇÃO.
 *
 * Motor PURO (ES5, sem DOM, sem three.js), Node-testável. Metros.
 *   BlocokExec.paginar(parede, cfg)    → a parede peça a peça, com reforços
 *   BlocokExec.consolidar(lista, cfg)  → totais da obra (compra, insumos, aço)
 *   BlocokExec.geometria3d(res, cfg)   → caixas face/EPS/face/concreto/junta
 *   BlocokExec.montagem(res, cfg)      → sequência de montagem da parede
 *
 * POR QUE ESTE ARQUIVO EXISTE (14/10/2026)
 * O js/blocok.js pagina em GRADE: cada placa em cima da outra, juntas
 * verticais contínuas do chão ao teto. Pedido do Rogério: "as paredes são
 * feitas com amarração, onde uma peça nunca fica montada seguindo o
 * alinhamento da de baixo, é a mesma coisa que fazemos em blocos de concreto
 * e tijolos — precisa de paginação correta para evitar trincas, e também de
 * vergas, contravergas etc.". Junta vertical contínua é plano de fratura:
 * a parede trinca exatamente ali. O blocok.js segue vivo (o painel atual do
 * cliente GCon depende dele); este motor é o executivo novo.
 *
 * ---------------------------------------------------------------------
 * O QUE É NORMA, O QUE É FABRICANTE E O QUE É PARÂMETRO (nada inventado)
 * ---------------------------------------------------------------------
 * Pesquisa completa: RA Brain\Pesquisas\"Blocok - produto e montagem.md" e
 * "Paineis EPS-concreto - normas e calculo.md" (14/10/2026).
 *  · O PAINEL NÃO É ESTRUTURAL. Laudos UFMG/LAEES (out/2022) aprovam como
 *    vedação; não há ensaio de compressão nem DATec. Por isso a parede é
 *    VEDAÇÃO e a estrutura são os pilaretes, vergas e cintas de concreto
 *    armado moldados DENTRO da peça (EPS retirado, as faces viram fôrma).
 *  · Diretriz SiNAT nº 019 (maio/2026, blocos pré-fabricados de EPS
 *    revestidos): transpasse da amarração ≥ 33 % · elemento estrutural a
 *    cada ≤ 4,0 m · ligação à estrutura a cada fiada, ancorada ≥ 15 cm ·
 *    encunhamento ≥ 30 mm. Esses quatro números vêm daí (DIRETRIZ abaixo).
 *  · Peça 90×90, espessuras 10/13/15/20, faces 1,5 cm, junta ~1,5 cm:
 *    laudo UFMG + vídeos e sites da franquia. Pesos 38/45/50/62 kg: tabela
 *    de franqueado (o laudo pesou ~45 kg na de 15 cm — usamos o MAIOR, que
 *    é o lado da segurança para carga e transporte). Núcleo útil para
 *    pilar embutido 8/10/15 cm (a de 10 não aceita): franqueado de Tietê.
 *  · Apoio de verga max(30 cm; 20 % do vão) e de contraverga max(40 cm;
 *    20 % do vão): composição das fontes achadas (SUDECAP 20 % do vão,
 *    DATec 051 30 cm, SINAPI 105028 contraverga ≥ 40 cm) — PARÂMETRO RA.
 *  · Junta longe do canto do vão (peça em L): regra de chapa cimentícia
 *    (a junta no canto do vão é onde a trinca nasce) — PARÂMETRO RA.
 *  · Tudo que o fabricante ainda não publicou (argamassa de assentamento,
 *    consumo de tratamento de junta, fiadas por dia) é PARÂMETRO EDITÁVEL
 *    marcado `estimado: true` — o franqueado troca pelo número dele.
 *
 * Teste: node tools/test-blocokexec.js
 * ===================================================================== */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.BlocokExec = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var TOL = 1e-6;
  function r3(n) { return Math.round((+n || 0) * 1000) / 1000; }
  function r4(n) { return Math.round((+n || 0) * 10000) / 10000; }
  function num(v, d) { var n = +v; return isFinite(n) ? n : (d == null ? 0 : d); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ------------------------------------------------------------------
   * CATÁLOGO (por espessura nominal, cm)
   *  nucleo   = espessura do EPS (m) = esp − 2 faces
   *  peso     = kg da peça cheia 90×90 (franqueado; ver cabeçalho)
   *  concreto = largura útil do pilar/viga embutido (m); 0 = não aceita
   *  tuboMax  = maior tubo que passa dentro da peça (mm)
   * ------------------------------------------------------------------ */
  /* `concreto` = largura do concreto na faixa de reforço = o NÚCLEO INTEIRO: o EPS
     sai todo na faixa e o concreto encosta nas faces, que viram fôrma (como no
     similar Blocom: "tirando o isopor e concretando dentro da peça"). Com a
     largura do franqueado (`concretoFranqueado`, 1 cm de EPS de cada lado) a
     verga de 2 φ8 não cabia na peça de 15 com o cobrimento da NBR 6118 (revisão
     de 14/10/2026). O cobrimento conta só dentro do concreto C25 — a face C12
     não serve de cobrimento (NBR 6118 Tabela 7.1). */
  var CATALOGO = {
    10: { esp: 0.10, nucleo: 0.07, peso: 38, concreto: 0.07, concretoFranqueado: 0,    tuboMax: 60 },
    13: { esp: 0.13, nucleo: 0.10, peso: 45, concreto: 0.10, concretoFranqueado: 0.08, tuboMax: 90 },
    15: { esp: 0.15, nucleo: 0.12, peso: 50, concreto: 0.12, concretoFranqueado: 0.10, tuboMax: 120 },
    20: { esp: 0.20, nucleo: 0.17, peso: 62, concreto: 0.17, concretoFranqueado: 0.15, tuboMax: 150 }
  };
  var FONTES = {
    peca: "Laudos UFMG/LAEES out/2022 (peça 90×90, faces 1,5 cm, ~45 kg na de 15 cm) e sites/vídeos da franquia Blocok",
    peso: "Tabela de franqueado (38/45/50/62 kg) — confirmar com a fábrica",
    concreto: "Faixa de reforço com o núcleo inteiro concretado (EPS retirado, faces como fôrma); o franqueado de Tietê-SP cita pilar até 8/10/15 cm (opção conservadora)",
    diretriz: "Diretriz SiNAT nº 019 (maio/2026) — blocos pré-fabricados de EPS revestidos (vedação)"
  };
  var DIRETRIZ = {
    transpasseMin: 0.33,      // fração da peça
    espacamentoEstruturaMax: 4.0, // m entre elementos estruturais
    ancoragemLigacao: 0.15,   // m, ligação à estrutura a cada fiada
    encunhamentoMin: 0.030    // m
  };

  function cfgPadrao() {
    return {
      placa: 0.90,              // m (peça quadrada)
      junta: 0.015,             // m (vertical e horizontal)
      face: 0.015,              // m (cada face)
      transpasse: 0.50,         // fração desejada (meia peça = 50 %)
      transpasseMin: DIRETRIZ.transpasseMin,
      recorteMin: 0.15,         // m — peça mais estreita/baixa aceitável (PARÂMETRO RA)
      distJuntaCantoVao: 0.15,  // m — junta afastada do canto do vão (PARÂMETRO RA)
      serra: 0.005,             // m perdidos por corte (disco)
      pilarete: { largura: 0.20, espMax: DIRETRIZ.espacamentoEstruturaMax, portaSempre: true, janelaMin: 1.20, esperaFundacao: 0.50 },
      verga: { altura: 0.15, apoioMin: 0.30, apoioFrac: 0.20, vaoMaxVerga: 2.0 },
      contraverga: { altura: 0.15, apoioMin: 0.40, apoioFrac: 0.20 },
      cinta: { altura: 0.15, intermediarias: [] },   // alturas (m) da base da cinta intermediária
      aco: {   // ARMADURA CONSTRUTIVA — o cálculo (blocokcalc) substitui pela calculada
        pilarete: { barras: 2, bitola: 10, estriboBitola: 5.0, estriboEsp: 0.20 },
        verga: { barras: 2, bitola: 8 },
        contraverga: { barras: 2, bitola: 6.3 },
        cinta: { barras: 2, bitola: 8 },
        ancoragem: 0.30            // m acrescidos em cada ponta de barra horizontal (dobra/ancoragem)
      },
      argamassa: { perda: 0.10, nivelamento: 0.02, estimado: true },   // assentamento cheio nos 2 sentidos
      tratamento: {               // vídeo oficial (11/06/2026): selador + AC-III + tela de fibra de vidro
        faces: 2, telaLarguraM: 0.10, acIIIkgPorM: 1.0, seladorLPorM: 0.03, estimado: true
      },
      fiadasPorDia: 2,            // referência Blocom (TCC); o Blocok não publica — estimado
      /* PRODUTIVIDADE DA EQUIPE na obra inteira (várias paredes ao mesmo tempo) —
         lida pelo cronograma comparativo (js/blocokref.js) e pelo manual.
         48,20 m²/dia: quadro "Comparativo Blocok x Bloco" de site NÃO oficial (não
         diz o tamanho da equipe); 3 profissionais: MARTINS et al., BJD v. 10 n. 11,
         2024, p. 8 ("3 profissionais são o suficiente", casa de Itacaré/BA). O
         orçamento (js/blocokorc.js) segue com 45 m²/dia: é o lado do custo mais alto. */
      produtividade: { m2Dia: 48.2, equipe: 3, estimado: true,
        fonte: "48,20 m²/dia: quadro “Comparativo Blocok x Bloco” de site não oficial (sem tamanho de equipe); equipe de 3 profissionais: MARTINS et al., BJD v. 10, n. 11, 2024, p. 8" },
      encunhamento: DIRETRIZ.encunhamentoMin
    };
  }
  function mesclar(base, o) {
    if (!o || typeof o !== "object") return base;
    Object.keys(o).forEach(function (k) {
      var v = o[k];
      if (v && typeof v === "object" && !Array.isArray(v) && base[k] && typeof base[k] === "object" && !Array.isArray(base[k])) mesclar(base[k], v);
      else if (v !== undefined) base[k] = v;
    });
    return base;
  }
  function lerCfg(c) { return mesclar(cfgPadrao(), c ? clone(c) : null); }

  function espCm(e) {
    var v = num(e, 15);
    if (v < 1) v = v * 100;                 // veio em metros
    var melhor = 15, dm = Infinity;
    Object.keys(CATALOGO).forEach(function (k) { var d = Math.abs(+k - v); if (d < dm) { dm = d; melhor = +k; } });
    return melhor;
  }
  function catalogo(e) { return CATALOGO[espCm(e)]; }

  /* ------------------------------------------------------------------
   * Retângulos: interseção, subtração (A − B → até 4 pedaços) e área da
   * união (varredura por faixas — n pequeno).
   * ------------------------------------------------------------------ */
  function inter(a, b) {
    var x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y);
    var x1 = Math.min(a.x + a.w, b.x + b.w), y1 = Math.min(a.y + a.h, b.y + b.h);
    if (x1 - x0 <= TOL || y1 - y0 <= TOL) return null;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  function subtrair(a, b) {
    var i = inter(a, b); if (!i) return [a];
    var out = [];
    if (i.y - a.y > TOL) out.push({ x: a.x, y: a.y, w: a.w, h: i.y - a.y });                         // embaixo
    if (a.y + a.h - (i.y + i.h) > TOL) out.push({ x: a.x, y: i.y + i.h, w: a.w, h: a.y + a.h - (i.y + i.h) }); // em cima
    if (i.x - a.x > TOL) out.push({ x: a.x, y: i.y, w: i.x - a.x, h: i.h });                         // esquerda
    if (a.x + a.w - (i.x + i.w) > TOL) out.push({ x: i.x + i.w, y: i.y, w: a.x + a.w - (i.x + i.w), h: i.h }); // direita
    return out;
  }
  function subtrairTodos(lista, furos) {
    var cur = lista.slice();
    furos.forEach(function (f) { var nx = []; cur.forEach(function (r) { nx = nx.concat(subtrair(r, f)); }); cur = nx; });
    return cur;
  }
  function areaUniao(rs) {
    if (!rs.length) return 0;
    var xs = []; rs.forEach(function (r) { xs.push(r.x, r.x + r.w); });
    xs.sort(function (a, b) { return a - b; });
    var area = 0;
    for (var i = 0; i < xs.length - 1; i++) {
      var xa = xs[i], xb = xs[i + 1]; if (xb - xa <= TOL) continue;
      var iv = [];
      rs.forEach(function (r) { if (r.x <= xa + TOL && r.x + r.w >= xb - TOL) iv.push([r.y, r.y + r.h]); });
      iv.sort(function (a, b) { return a[0] - b[0]; });
      var tot = 0, cs = -Infinity, ce = -Infinity;
      iv.forEach(function (v) { if (v[0] > ce) { if (ce > cs) tot += ce - cs; cs = v[0]; ce = v[1]; } else if (v[1] > ce) ce = v[1]; });
      if (ce > cs) tot += ce - cs;
      area += tot * (xb - xa);
    }
    return area;
  }

  /* ------------------------------------------------------------------
   * Normaliza a parede.
   *  parede = { id, nome, comprimento (eixo a eixo), altura, espessura (cm ou m),
   *    vaos: [{ id, tipo:'porta'|'janela', x, y, w, h }]   (x a partir do eixo inicial)
   *    ini/fim: { tipo:'livre'|'canto'|'T'|'pilar', espOutro (m), passaPar: 0|1, dono: bool }
   *      canto: a parede ATRAVESSA o encontro nas fiadas de paridade passaPar e
   *             morre na face da outra nas demais (amarração alternada);
   *      T:     esta parede encosta no meio de outra — morre na face dela e liga
   *             por grampo a cada fiada (SiNAT 019) + pilarete na outra;
   *      pilar: encosta num pilar existente (estrutura convencional);
   *      livre: borda livre — leva pilarete na ponta.
   *    tees: [x...]   pontos onde outra parede encosta NESTA (pilarete aqui)
   *    topo: 'cinta' (padrão: a cinta de respaldo é o topo da parede) |
   *          'encunhamento' (parede sob estrutura existente: folga ≥ 30 mm)
   *    externa: bool }
   * ------------------------------------------------------------------ */
  function lerExtremidade(e, lado) {
    e = e || {};
    var t = String(e.tipo || "livre").toLowerCase();
    if (["livre", "canto", "t", "pilar"].indexOf(t) < 0) t = "livre";
    if (t === "t") t = "T";
    /* ponta livre não tem parede ao lado (espOutro 0: a cinta não passa da ponta);
       no canto, sem dono informado, só a ponta INICIAL soma o pilar — numa
       sequência fechada cada canto encontra um início e um fim (revisão: o canto
       entrava duas vezes no concreto e no aço). */
    var dono = e.dono != null ? e.dono !== false : (t === "canto" ? lado === "ini" : true);
    return { tipo: t, espOutro: t === "livre" ? 0 : Math.max(0, num(e.espOutro, 0.15)), passaPar: num(e.passaPar, lado === "ini" ? 0 : 1) % 2, dono: dono };
  }
  function lerParede(p, cfg) {
    p = p || {};
    var esp = espCm(p.espessura);
    var L = Math.max(0, num(p.comprimento));
    var H = Math.max(0, num(p.altura));
    var topo = p.topo === "encunhamento" ? "encunhamento" : "cinta";
    var Hutil = topo === "encunhamento" ? Math.max(0, H - Math.max(cfg.encunhamento, DIRETRIZ.encunhamentoMin)) : H;
    var vaos = (p.vaos || []).map(function (v, i) {
      var tipo = String(v.tipo || "").toLowerCase().indexOf("port") === 0 ? "porta" : "janela";
      var y = Math.max(0, num(v.y)); if (tipo === "porta") y = 0;
      return { id: v.id || ((tipo === "porta" ? "PT" : "JN") + (i + 1)), tipo: tipo, x: num(v.x), y: y, w: Math.max(0, num(v.w)), h: Math.max(0, num(v.h)) };
    }).filter(function (v) { return v.w > 0.05 && v.h > 0.05; });
    return {
      id: p.id != null ? String(p.id) : "PAR", nome: p.nome || "", comprimento: L, altura: H, Hutil: Hutil, esp: esp,
      cat: CATALOGO[esp], vaos: vaos, ini: lerExtremidade(p.ini, "ini"), fim: lerExtremidade(p.fim, "fim"),
      tees: (p.tees || []).map(function (x) { return num(x); }).filter(function (x) { return x > 0 && x < L; }),
      topo: topo, externa: !!p.externa
    };
  }

  /* extensão do corpo da parede numa fiada (amarração nos cantos) */
  function extensaoFiada(P, r) {
    function lado(e, sinal) {
      var meia = e.espOutro / 2;
      if (e.tipo === "canto") return (r % 2 === e.passaPar) ? -meia : meia;   // atravessa ou morre na face
      if (e.tipo === "T" || e.tipo === "pilar") return meia;
      return 0;
    }
    return { x0: lado(P.ini), x1: P.comprimento - lado(P.fim) };
  }

  /* ------------------------------------------------------------------
   * REFORÇOS: pilaretes, vergas, contravergas, cintas (faixas de EPS
   * retirado, concretadas com as faces como fôrma).
   * ------------------------------------------------------------------ */
  function planejarReforcos(P, cfg) {
    var avisos = [], b = cfg.pilarete.largura, L = P.comprimento, H = P.Hutil;
    var centros = [];   // {c, motivo, fixo}
    function add(c, motivo, dono) {
      for (var i = 0; i < centros.length; i++) if (Math.abs(centros[i].c - c) < b - TOL) { if (centros[i].motivo.indexOf(motivo) < 0) centros[i].motivo += " + " + motivo; return; }
      centros.push({ c: c, motivo: motivo, dono: dono !== false });
    }
    // pontas
    [["ini", 0, 1], ["fim", L, -1]].forEach(function (a) {
      var e = P[a[0]], x = a[1], s = a[2];
      if (e.tipo === "livre") add(x + s * b / 2, "borda livre");
      /* canto: o pilar começa na face EXTERNA da parede transversal e tem a
         largura inteira nesta parede — centrar no eixo cortava a largura na
         face da outra e o pilar estrutural saía com 300 cm² (< 360 cm²,
         NBR 6118 13.2.3), achado no 1º teste do cálculo. */
      else if (e.tipo === "canto") add(x - s * e.espOutro / 2 + s * b / 2, "canto", e.dono);
      else if (e.tipo === "T") { /* o pilarete fica na parede que recebe; aqui só grampos */ }
      /* pilar existente: a estrutura já está lá */
    });
    P.tees.forEach(function (x) { add(x, "encontro em T"); });
    // bordas de vão
    P.vaos.forEach(function (v) {
      var precisa = (v.tipo === "porta" && cfg.pilarete.portaSempre) || (v.w >= cfg.pilarete.janelaMin - TOL);
      if (!precisa) return;
      add(v.x - b / 2, "borda de " + (v.tipo === "porta" ? "porta " : "janela ") + v.id);
      add(v.x + v.w + b / 2, "borda de " + (v.tipo === "porta" ? "porta " : "janela ") + v.id);
    });
    function dentroDeVao(c) {
      for (var i = 0; i < P.vaos.length; i++) { var v = P.vaos[i]; if (c + b / 2 > v.x + TOL && c - b / 2 < v.x + v.w - TOL) return v; }
      return null;
    }
    // intermediários: elemento estrutural a cada ≤ espMax (SiNAT 019)
    var guarda = 0;
    while (guarda++ < 200) {
      centros.sort(function (a, b2) { return a.c - b2.c; });
      var ext = [{ c: 0 }].concat(centros, [{ c: L }]);
      var inseriu = false;
      for (var i = 0; i < ext.length - 1 && !inseriu; i++) {
        var g = ext[i + 1].c - ext[i].c;
        if (g <= cfg.pilarete.espMax + TOL) continue;
        // só conta vão entre elementos de verdade: ponta T/pilar/canto já é estrutura
        var c = ext[i].c + Math.min(cfg.pilarete.espMax, g / Math.ceil(g / cfg.pilarete.espMax));
        var v = dentroDeVao(c);
        if (v) {
          var cE = v.x - b / 2, cD = v.x + v.w + b / 2;
          c = (Math.abs(cE - ext[i].c) > b && cE > ext[i].c) ? cE : cD;
        }
        if (c <= ext[i].c + TOL || c >= ext[i + 1].c - TOL) { avisos.push("Trecho de " + r3(g) + " m sem como intercalar pilarete (vãos seguidos) — conferir no cálculo."); break; }
        add(c, "espaçamento máximo " + cfg.pilarete.espMax.toFixed(1).replace(".", ",") + " m (SiNAT 019)");
        inseriu = true;
      }
      if (!inseriu) break;
    }
    centros.sort(function (a, b2) { return a.c - b2.c; });
    var pilaretes = centros.map(function (p, i) {
      var x0 = Math.max(-P.ini.espOutro / 2, p.c - b / 2), x1 = Math.min(L + P.fim.espOutro / 2, p.c + b / 2);
      return { id: "PL" + (i + 1), tipo: "pilarete", x: r4(x0), y: 0, w: r4(x1 - x0), h: r4(H), motivo: p.motivo, dono: p.dono };
    });
    if (P.cat.concreto < 0.10 - 1e-9 && pilaretes.length) avisos.push("A peça de " + P.esp + " cm não aceita pilar embutido (núcleo de " + Math.round(P.cat.nucleo * 100) + " cm, abaixo dos 10 cm da NBR 6118). Use 13 cm ou mais, ou estrutura externa à parede.");

    // vergas e contravergas
    var vergas = [], contravergas = [], xmin = -P.ini.espOutro / 2, xmax = L + P.fim.espOutro / 2;
    P.vaos.forEach(function (v) {
      var ap = Math.max(cfg.verga.apoioMin, cfg.verga.apoioFrac * v.w);
      var y0 = v.y + v.h, hv = cfg.verga.altura;
      var item = { id: "V-" + v.id, tipo: "verga", vao: v.id, vaoW: r3(v.w), apoio: r3(ap), x: r4(Math.max(xmin, v.x - ap)), y: r4(y0), h: r4(hv) };
      item.w = r4(Math.min(xmax, v.x + v.w + ap) - item.x);
      if (y0 + hv > H - cfg.cinta.altura + TOL) { item.naCinta = true; item.nota = "Topo do vão encosta na cinta de respaldo: a verga é a própria cinta (armadura somada no cálculo)."; }
      if (v.w > cfg.verga.vaoMaxVerga + TOL) { item.viga = true; item.nota = (item.nota ? item.nota + " " : "") + "Vão de " + v.w.toFixed(2).replace(".", ",") + " m passa de " + cfg.verga.vaoMaxVerga.toFixed(2).replace(".", ",") + " m: dimensionar como VIGA."; }
      if (v.x - ap < xmin - TOL || v.x + v.w + ap > xmax + TOL) avisos.push("Verga do " + v.id + " sem apoio completo de um dos lados (vão perto da ponta) — ancorar no pilarete.");
      vergas.push(item);
      if (v.tipo === "janela" && v.y > cfg.contraverga.altura + TOL) {
        var apc = Math.max(cfg.contraverga.apoioMin, cfg.contraverga.apoioFrac * v.w);
        var cv = { id: "CV-" + v.id, tipo: "contraverga", vao: v.id, vaoW: r3(v.w), apoio: r3(apc), x: r4(Math.max(xmin, v.x - apc)), y: r4(v.y - cfg.contraverga.altura), h: r4(cfg.contraverga.altura) };
        cv.w = r4(Math.min(xmax, v.x + v.w + apc) - cv.x);
        contravergas.push(cv);
      }
    });
    // vergas que se tocam na mesma altura viram uma só (vãos vizinhos)
    function fundir(lista) {
      lista.sort(function (a, b2) { return a.y - b2.y || a.x - b2.x; });
      var out = [];
      lista.forEach(function (it) {
        var u = out.length ? out[out.length - 1] : null;
        if (u && Math.abs(u.y - it.y) < 0.02 && it.x <= u.x + u.w + TOL) {
          var fim = Math.max(u.x + u.w, it.x + it.w); u.w = r4(fim - u.x); u.vao += "+" + it.vao; u.id += "+" + it.vao; u.vaoW = Math.max(u.vaoW, it.vaoW);
          u.unida = true; if (it.viga) u.viga = true; if (it.naCinta) u.naCinta = true;
        } else out.push(it);
      });
      return out;
    }
    vergas = fundir(vergas); contravergas = fundir(contravergas);

    var cintas = [];
    if (P.topo === "cinta") cintas.push({ id: "CR", tipo: "cinta", nome: "cinta de respaldo", x: r4(xmin), y: r4(H - cfg.cinta.altura), w: r4(xmax - xmin), h: r4(cfg.cinta.altura) });
    (cfg.cinta.intermediarias || []).forEach(function (y, i) {
      y = num(y); if (y > 0.3 && y < H - cfg.cinta.altura - 0.3) cintas.push({ id: "CI" + (i + 1), tipo: "cinta", nome: "cinta intermediária", x: r4(xmin), y: r4(y), w: r4(xmax - xmin), h: r4(cfg.cinta.altura) });
    });
    // grampos de ligação (SiNAT 019: a cada fiada, ancorados ≥ 15 cm)
    var ligacoes = [];
    ["ini", "fim"].forEach(function (k) { var e = P[k]; if (e.tipo === "T" || e.tipo === "pilar") ligacoes.push({ lado: k, tipo: e.tipo, ancoragem: DIRETRIZ.ancoragemLigacao }); });
    return { pilaretes: pilaretes, vergas: vergas, contravergas: contravergas, cintas: cintas, ligacoes: ligacoes, avisos: avisos };
  }

  /* ------------------------------------------------------------------
   * FIADA — onde ficam as juntas verticais de cada trecho.
   * Programação dinâmica num passo de 5 mm: escolhe o comprimento de CADA
   * peça (inteira ou cortada) para que o trecho feche exatamente, com o
   * menor custo. Custo, do mais grave ao mais leve:
   *   · junta a menos de 33 % da peça de uma junta/borda da fiada de baixo
   *     (SiNAT 019) ................................................ 1000
   *   · junta a menos de distJuntaCantoVao do canto de um vão ........ 100
   *   · cada peça cortada ............................................... 1
   *   · transpasse abaixo da meia peça (prefere 50 %) ..... até 0,45 × 0,5
   * Por que não "1ª peça variável + resto inteiro": quando o batente de uma
   * janela cai na meia peça, nenhuma partida atende transpasse e canto ao
   * mesmo tempo — o pedreiro resolve metendo uma peça cortada NO MEIO da
   * fiada, e o motor tem de poder fazer o mesmo (achado no 1º teste,
   * parede 5,00 × 2,75 com porta e janela, 14/10/2026).
   * ------------------------------------------------------------------ */
  function juntasDe(pecas, j) {
    var js = [];
    for (var i = 0; i < pecas.length - 1; i++) js.push(pecas[i].x + pecas[i].w + j / 2);
    return js;
  }
  function paginarTrecho(a, b, ctx, cfg) {
    var P = cfg.placa, j = cfg.junta, d = 0.005;
    var len = b - a;
    if (len <= P + TOL) return { pecas: [{ x: a, w: len }], custo: len < P - 0.002 ? 1 : 0 };
    var tmin = cfg.transpasseMin * P, dc = cfg.distJuntaCantoVao;
    var kj = Math.round(j / d), kmin = Math.round(cfg.recorteMin / d), kP = Math.round(P / d);
    var N = Math.floor(len / d + TOL);
    var custo = new Array(N + 1), prev = new Array(N + 1), passo = new Array(N + 1);
    for (var i = 0; i <= N; i++) custo[i] = Infinity;
    custo[0] = 0;
    function custoJunta(c) {
      var dmin = Infinity, k;
      for (k = 0; k < ctx.baixo.length; k++) { var dd = Math.abs(c - ctx.baixo[k]); if (dd < dmin) dmin = dd; }
      var v = 0;
      if (dmin < tmin) v += 1000;
      v += (P / 2 - Math.min(dmin, P / 2)) * 0.5;
      for (k = 0; k < ctx.cantos.length; k++) if (Math.abs(c - ctx.cantos[k]) < dc - 0.002) { v += 100; break; }
      if (ctx.evitar) for (k = 0; k < ctx.evitar.length; k++) if (Math.abs(c - ctx.evitar[k]) < 0.12) { v += 400; break; }
      return v;
    }
    var melhorFim = Infinity, iFim = -1;
    for (i = 0; i <= N; i++) {
      if (custo[i] === Infinity) continue;
      var x = a + i * d, resto = b - x;
      // última peça: fecha o trecho
      if (resto <= P + TOL && resto >= Math.min(cfg.recorteMin, len) - TOL) {
        var cf = custo[i] + (resto < P - 0.002 ? 1 : 0);
        if (cf < melhorFim - 1e-9) { melhorFim = cf; iFim = i; }
      }
      // peça intermediária: inteira primeiro (desempate a favor de menos cortes)
      for (var k = kP; k >= kmin; k--) {
        if (i === 0 && ctx.primeira && Math.abs(k * d - ctx.primeira) > d / 2) continue;   // partida forçada
        var nx = i + k + kj; if (nx > N) continue;
        var c = custo[i] + (k === kP ? 0 : 1) + custoJunta(x + k * d + j / 2);
        /* OLHAR A FIADA DE CIMA: peça do MEIO (junta dos dois lados) com
           distância entre juntas D tal que P+j−2·tmin < D < 2·tmin não deixa
           nenhuma peça de cima vencer as duas juntas com 33 % para cada lado
           nem pôr junta entre elas → a fiada de cima fica sem solução. Faixa
           proibida para P = 0,90 e j = 15 mm: peça de ~31 a ~58 cm. */
        if (i > 0 && !ctx.topo) { var D = k * d + j; if (D > P + j - 2 * tmin + 0.003 && D < 2 * tmin - 0.003) c += 300; }
        if (c < custo[nx] - 1e-9) { custo[nx] = c; prev[nx] = i; passo[nx] = k; }
      }
    }
    if (iFim < 0) {   // não fecha com recorte ≥ mínimo (trecho curtíssimo): uma peça cortada só
      return { pecas: [{ x: a, w: Math.min(P, len) }], custo: 1000 };
    }
    var pecas = [{ x: a + iFim * d, w: b - (a + iFim * d) }], at = iFim;
    while (at > 0) { var p0 = prev[at], k2 = passo[at]; pecas.unshift({ x: a + p0 * d, w: k2 * d }); at = p0; }
    return { pecas: pecas, custo: melhorFim };
  }

  /* ------------------------------------------------------------------
   * PAGINAÇÃO DA PAREDE
   * ------------------------------------------------------------------ */
  /* VÁRIAS PARTIDAS — a 1ª fiada decide muito do resto. Pagina a parede com
     a partida livre e, se sobrar junta sem transpasse, tenta começar com
     meia peça, 1/3, 2/3, 1/4 e 3/4 e fica com a melhor parede inteira. */
  function paginar(parede, cfgIn) {
    var cfg0 = lerCfg(cfgIn), P0 = cfg0.placa, melhorRes = null, melhorSc = null;
    var partidas = [null, P0 / 2, P0 / 3, 2 * P0 / 3, P0 / 4, 3 * P0 / 4];
    for (var i = 0; i < partidas.length; i++) {
      var res = paginarCom(parede, cfgIn, partidas[i]);
      if (!res.ok) return res;
      var nTr = res.validacao.problemas.filter(function (q) { return q.tipo === "transpasse"; }).length;
      var sc = [nTr, res.validacao.problemas.length, res.quant.placasCompra];
      if (!melhorSc || sc[0] < melhorSc[0] || (sc[0] === melhorSc[0] && (sc[1] < melhorSc[1] || (sc[1] === melhorSc[1] && sc[2] < melhorSc[2])))) { melhorRes = res; melhorSc = sc; }
      if (melhorSc[0] === 0 && i === 0) break;
    }
    return melhorRes;
  }
  function paginarCom(parede, cfgIn, partida) {
    var cfg = lerCfg(cfgIn), P0 = cfg.placa, j = cfg.junta, Mv = P0 + j;
    var P = lerParede(parede, cfg);
    var avisos = [];
    if (P.comprimento < 0.05 || P.Hutil < 0.05) return vazio(P, cfg);
    var ref = planejarReforcos(P, cfg);
    avisos = avisos.concat(ref.avisos);

    // fiadas (alturas)
    var fiadasY = [], y = 0;
    while (y < P.Hutil - 0.005) { var h = Math.min(P0, P.Hutil - y); fiadasY.push({ y: y, h: h }); y += h + j; }
    var ult = fiadasY[fiadasY.length - 1];
    if (ult && ult.h < cfg.recorteMin - TOL && fiadasY.length > 1) {
      // última fiada fina demais: divide a sobra entre as duas últimas (as duas recortadas, iguais)
      var pen = fiadasY[fiadasY.length - 2], soma = pen.h + ult.h;
      pen.h = r4(soma / 2); ult.y = r4(pen.y + pen.h + j); ult.h = r4(soma / 2);
      avisos.push("Altura útil de " + P.Hutil.toFixed(3).replace(".", ",") + " m não fecha em fiadas inteiras: as duas últimas fiadas saem com " + Math.round(soma / 2 * 100) + " cm (para nenhuma ficar com menos de " + Math.round(cfg.recorteMin * 100) + " cm). Altura modular mais próxima: " + (Math.round(P.Hutil / Mv) * Mv - j).toFixed(3).replace(".", ",") + " m.");
    }

    /* Uma fiada inteira: trechos entre vãos, cada um pela programação
       dinâmica. Devolve as peças, as juntas (para a fiada de cima), o custo
       e as juntas que ficaram sem transpasse (com a junta de baixo culpada). */
    function resolverFiada(r, baixo, bordasBaixo, evitar) {
      var fy = fiadasY[r], ry0 = fy.y, ry1 = fy.y + fy.h, ext = extensaoFiada(P, r);
      // vãos que cortam a fiada inteira (de baixo a cima) → interrompem o trecho
      var cortaInteiro = [], parciais = [];
      P.vaos.forEach(function (v) {
        var vy0 = v.y, vy1 = v.y + v.h;
        if (vy1 <= ry0 + TOL || vy0 >= ry1 - TOL) return;          // não toca a fiada
        if (vy0 <= ry0 + TOL && vy1 >= ry1 - TOL) cortaInteiro.push(v);
        else parciais.push(v);                                     // corta só parte da altura → peça em L
      });
      var ivs = [[ext.x0, ext.x1]];
      cortaInteiro.forEach(function (v) {
        var nx = [];
        ivs.forEach(function (iv) {
          if (v.x + v.w <= iv[0] + TOL || v.x >= iv[1] - TOL) { nx.push(iv); return; }
          if (v.x - iv[0] > 0.005) nx.push([iv[0], v.x]);
          if (iv[1] - (v.x + v.w) > 0.005) nx.push([v.x + v.w, iv[1]]);
        });
        ivs = nx;
      });
      // cantos de vão que caem DENTRO desta fiada (topo/base do vão no meio da fiada)
      var cantos = [];
      parciais.forEach(function (v) { cantos.push(v.x, v.x + v.w); });
      var linha = [], lista = [], custo = 0, culpadas = [];
      ivs.forEach(function (iv, t) {
        /* borda de vão da fiada de baixo NÃO é junta: o que vale em cima de
           batente é a regra do canto de vão (distJuntaCantoVao), não o
           transpasse de 33 % — tratar como junta deixava a fiada de cima sem
           solução (teste de 400 paredes, 14/10/2026). */
        var dentro = function (x) { return x > iv[0] + 0.005 && x < iv[1] - 0.005; };
        var ctx = { baixo: baixo.filter(dentro), cantos: cantos.concat(bordasBaixo.filter(dentro)), topo: r === fiadasY.length - 1, evitar: evitar || [], primeira: (r === 0 && t === 0) ? partida : null };
        var res = paginarTrecho(iv[0], iv[1], ctx, cfg);
        custo += res.custo;
        juntasDe(res.pecas, j).forEach(function (x) {
          var m = null, dm = Infinity; ctx.baixo.forEach(function (yb) { var dd = Math.abs(x - yb); if (dd < dm) { dm = dd; m = yb; } });
          if (dm < cfg.transpasseMin * P0) culpadas.push(m);
        });
        res.pecas.forEach(function (pc) {
          var ret = { x: pc.x, y: ry0, w: pc.w, h: fy.h };
          // vão parcial dentro desta peça → recorte (L, U ou peça baixa)
          var furos = [];
          parciais.forEach(function (v) { var i2 = inter(ret, { x: v.x, y: v.y, w: v.w, h: v.h }); if (i2) furos.push(i2); });
          var areaFuros = furos.reduce(function (s, f) { return s + f.w * f.h; }, 0);
          if (areaFuros >= ret.w * ret.h - 1e-4) return;              // peça toda dentro do vão
          // peça que, tirado o vão, vira faixa retangular (sobre/sob o vão) → simplifica
          var resto = subtrairTodos([ret], furos);
          var forma = "retangular", base = ret;
          if (furos.length) {
            if (resto.length === 1) { base = resto[0]; furos = []; }
            else forma = "L";
          }
          var cortadaW = base.w < P0 - 0.002, cortadaH = base.h < P0 - 0.002;
          var tipo = furos.length ? "recorte-L" : (!cortadaW && !cortadaH ? "inteira" : (Math.abs(base.w - P0 / 2) < 0.003 && !cortadaH ? "meia" : "recorte"));
          var area = base.w * base.h - furos.reduce(function (s, f) { return s + f.w * f.h; }, 0);
          lista.push({
            fiada: r + 1, trecho: t + 1,
            x: r4(base.x), y: r4(base.y), w: r4(base.w), h: r4(base.h),
            furos: furos.map(function (f) { return { x: r4(f.x), y: r4(f.y), w: r4(f.w), h: r4(f.h) }; }),
            forma: forma, tipo: tipo, area: r4(area),
            peso: r3(P.cat.peso * area / (P0 * P0))
          });
          linha.push({ x0: base.x, x1: base.x + base.w });
        });
      });
      // juntas desta fiada viram o "baixo" da próxima; bordas de vão vão à parte
      linha.sort(function (a, b) { return a.x0 - b.x0; });
      var nb = [], nbb = [];
      for (var k = 0; k < linha.length - 1; k++) {
        var g = linha[k + 1].x0 - linha[k].x1;
        if (g < j * 1.6) nb.push(linha[k].x1 + g / 2);           // junta
        else { nbb.push(linha[k].x1, linha[k + 1].x0); }         // borda de vão
      }
      return { pecas: lista, baixo: nb, bordas: nbb, custo: custo, culpadas: culpadas,
        fiada: { n: r + 1, y: r4(ry0), h: r4(fy.h), x0: r4(ext.x0), x1: r4(ext.x1), pecas: lista.length } };
    }

    /* RETROCESSO DE UMA FIADA — quando a fiada r não fecha com 33 %, o
       pedreiro desmonta a de baixo e muda as juntas de lugar. Aqui: refaz a
       fiada r−1 empurrando para longe as juntas culpadas e tenta de novo
       (até 6 vezes); fica com a melhor combinação. Sem isto, 7 em 400
       paredes aleatórias saíam com junta sem transpasse (14/10/2026). */
    var sol = [];
    for (var r = 0; r < fiadasY.length; r++) {
      var ant = r > 0 ? sol[r - 1] : { baixo: [], bordas: [] };
      var cur = resolverFiada(r, ant.baixo, ant.bordas, []);
      if (cur.culpadas.length && r > 0) {
        var antAnt = r > 1 ? sol[r - 2] : { baixo: [], bordas: [] };
        var evitar = (sol[r - 1].evitar || []).slice(), melhorPar = { a: sol[r - 1], c: cur };
        for (var tent = 0; tent < 6 && melhorPar.c.culpadas.length; tent++) {
          evitar = evitar.concat(melhorPar.c.culpadas);
          var novaAnt = resolverFiada(r - 1, antAnt.baixo, antAnt.bordas, evitar);
          novaAnt.evitar = evitar;
          if (novaAnt.custo >= 1000 && sol[r - 1].custo < 1000) continue;     // não pode estragar a de baixo
          var novaCur = resolverFiada(r, novaAnt.baixo, novaAnt.bordas, []);
          if (novaAnt.custo + novaCur.custo < melhorPar.a.custo + melhorPar.c.custo) melhorPar = { a: novaAnt, c: novaCur };
        }
        sol[r - 1] = melhorPar.a; cur = melhorPar.c;
      }
      sol[r] = cur;
    }
    var pecas = [], fiadas = [], nId = 0;
    sol.forEach(function (s) {
      s.pecas.forEach(function (pc) { nId++; pc.n = nId; pc.cod = P.id + "-" + nId; pecas.push(pc); });
      fiadas.push(s.fiada);
    });

    // EPS retirado (reforços) por peça
    var faixas = [].concat(ref.pilaretes, ref.vergas, ref.contravergas, ref.cintas);
    pecas.forEach(function (pc) {
      var ret = { x: pc.x, y: pc.y, w: pc.w, h: pc.h }, rf = [];
      faixas.forEach(function (f) { if (inter(ret, f)) rf.push(f.id); });
      if (rf.length) pc.reforcos = rf;
    });

    var validacao = validar(pecas, fiadas, P, cfg, ref);
    avisos = avisos.concat(validacao.avisos);
    var q = quantitativos(P, cfg, pecas, fiadas, ref);
    return {
      ok: true, id: P.id, nome: P.nome, espessura: P.esp, catalogo: P.cat, comprimento: r3(P.comprimento), altura: r3(P.altura),
      alturaUtil: r3(P.Hutil), topo: P.topo, externa: P.externa, ini: P.ini, fim: P.fim, vaos: P.vaos,
      fiadas: fiadas, pecas: pecas, reforcos: ref, validacao: validacao, quant: q, avisos: avisos,
      modulacao: { moduloH: r4(P0 + j), moduloV: r4(Mv), topoFiadas: fiadas.map(function (f) { return r3(f.y + f.h); }), alturaPaginada: fiadas.length ? r3(fiadas[fiadas.length - 1].y + fiadas[fiadas.length - 1].h) : 0 },
      cfg: cfg, fontes: FONTES
    };
  }
  function vazio(P, cfg) {
    return { ok: false, id: P.id, espessura: P.esp, catalogo: P.cat, comprimento: r3(P.comprimento), altura: r3(P.altura), alturaUtil: r3(P.Hutil),
      fiadas: [], pecas: [], reforcos: { pilaretes: [], vergas: [], contravergas: [], cintas: [], ligacoes: [], avisos: [] },
      validacao: { ok: true, problemas: [], avisos: [] }, quant: quantitativos(P, cfg, [], [], { pilaretes: [], vergas: [], contravergas: [], cintas: [], ligacoes: [] }),
      avisos: ["Parede sem dimensão (comprimento ou altura zero)."], cfg: cfg, fontes: FONTES };
  }

  /* ------------------------------------------------------------------
   * VALIDAÇÃO — transpasse entre fiadas (SiNAT 019 ≥ 33 %), junta no canto
   * de vão, recorte fino, espaçamento de pilaretes.
   * ------------------------------------------------------------------ */
  function validar(pecas, fiadas, P, cfg, ref) {
    var j = cfg.junta, min = cfg.transpasseMin * cfg.placa, problemas = [], avisos = [];
    var porF = {};
    pecas.forEach(function (p) { (porF[p.fiada] = porF[p.fiada] || []).push(p); });
    function juntas(f) {
      var l = (porF[f] || []).slice().sort(function (a, b) { return a.x - b.x; }), out = [];
      for (var i = 0; i < l.length - 1; i++) { var g = l[i + 1].x - (l[i].x + l[i].w); if (g < j * 1.6) out.push(l[i].x + l[i].w + g / 2); }
      return out;
    }
    var menorTrans = Infinity;
    for (var f = 2; f <= fiadas.length; f++) {
      var ja = juntas(f - 1), jb = juntas(f);
      jb.forEach(function (x) {
        ja.forEach(function (y) {
          var d = Math.abs(x - y);
          if (d < menorTrans) menorTrans = d;
          if (d < min - 0.002) problemas.push({ tipo: "transpasse", fiada: f, x: r3(x), defasagem: r3(d), minimo: r3(min) });
        });
      });
    }
    // junta no canto de vão
    P.vaos.forEach(function (v) {
      [v.y, v.y + v.h].forEach(function (yc) {
        fiadas.forEach(function (fi) {
          if (!(yc > fi.y + 0.005 && yc < fi.y + fi.h - 0.005)) return;
          juntas(fi.n).forEach(function (x) {
            [v.x, v.x + v.w].forEach(function (xc) { if (Math.abs(x - xc) < cfg.distJuntaCantoVao - 0.002) problemas.push({ tipo: "junta-canto-vao", fiada: fi.n, vao: v.id, x: r3(x) }); });
          });
        });
      });
    });
    pecas.forEach(function (p) {
      if (p.w < cfg.recorteMin - 0.002 || p.h < cfg.recorteMin - 0.002) problemas.push({ tipo: "recorte-fino", peca: p.cod, w: p.w, h: p.h });
    });
    /* FAIXA FINA NO VÃO — peitoril ou topo de vão que cai a poucos cm de
       uma fiada deixa uma tira de peça (ex.: peitoril 1,00 m com fiada em
       0,915 m = tira de 8,5 cm sob a janela, achada no 1º teste). Tira
       assim quebra no corte e no transporte. O vão é que tem de andar até
       a fiada — igual à modulação de bloco — e o motor diz para onde. */
    P.vaos.forEach(function (v) {
      [["base", v.y], ["topo", v.y + v.h]].forEach(function (b) {
        var yE = b[1];
        if (b[0] === "base" && yE < 0.005) return;
        fiadas.forEach(function (fi) {
          var y0 = fi.y, y1 = fi.y + fi.h;
          if (!(yE > y0 + 0.005 && yE < y1 - 0.005)) return;
          var faixa = b[0] === "base" ? yE - y0 : y1 - yE;
          if (faixa >= cfg.recorteMin - 0.002) return;
          var alvo = b[0] === "base" ? y0 : y1;
          problemas.push({ tipo: "faixa-fina-vao", vao: v.id, borda: b[0], fiada: fi.n, faixa: r3(faixa), sugestao: r3(b[0] === "base" ? alvo : alvo - v.y), campo: b[0] === "base" ? "peitoril" : "altura",
            texto: (b[0] === "base" ? "Peitoril" : "Topo") + " do " + v.id + " deixa tira de " + String(Math.round(faixa * 1000) / 10).replace(".", ",") + " cm na fiada " + fi.n + ". " +
              (b[0] === "base" ? "Peitoril em " + alvo.toFixed(3).replace(".", ",") + " m fecha com a fiada." : "Altura do vão de " + (alvo - v.y).toFixed(3).replace(".", ",") + " m fecha com a fiada.") });
        });
      });
    });
    // espaçamento entre elementos estruturais
    var xs = ref.pilaretes.map(function (p) { return p.x + p.w / 2; });
    if (P.ini.tipo !== "livre") xs.push(0);
    if (P.fim.tipo !== "livre") xs.push(P.comprimento);
    xs.sort(function (a, b) { return a - b; });
    for (var i = 0; i < xs.length - 1; i++) if (xs[i + 1] - xs[i] > cfg.pilarete.espMax + 0.01) problemas.push({ tipo: "espacamento-estrutura", de: r3(xs[i]), ate: r3(xs[i + 1]), vao: r3(xs[i + 1] - xs[i]) });
    if (problemas.length) {
      var t = {}; problemas.forEach(function (p) { t[p.tipo] = (t[p.tipo] || 0) + 1; });
      var nomes = { "transpasse": "junta(s) com transpasse abaixo de 33 %", "junta-canto-vao": "junta(s) no canto de vão", "recorte-fino": "recorte(s) mais finos que o mínimo", "espacamento-estrutura": "trecho(s) com mais de 4,0 m sem elemento estrutural", "faixa-fina-vao": "tira(s) fina(s) de peça junto de vão" };
      Object.keys(t).forEach(function (k) { if (k !== "faixa-fina-vao") avisos.push(t[k] + " " + (nomes[k] || k) + "."); });
      problemas.forEach(function (p) { if (p.tipo === "faixa-fina-vao") avisos.push(p.texto); });
    }
    return { ok: problemas.length === 0, problemas: problemas, menorTranspasse: isFinite(menorTrans) ? r3(menorTrans) : null, transpasseMin: r3(min), avisos: avisos };
  }

  /* ------------------------------------------------------------------
   * APROVEITAMENTO DE RETALHO — quantas placas cheias saem do caminhão.
   * Faixas: cada placa P×P vira floor(P/h) faixas de altura h (corte
   * horizontal); cada faixa recebe larguras por first-fit decrescente.
   * Peça em L sai de uma placa inteira (o recorte do L vai para retalho).
   * ------------------------------------------------------------------ */
  function otimizarCorte(pecas, cfg) {
    cfg = lerCfg(cfg);
    var P = cfg.placa, k = cfg.serra, inteiras = 0, emL = 0;
    var porAltura = {};
    pecas.forEach(function (p) {
      if (p.tipo === "inteira") { inteiras++; return; }
      if (p.furos && p.furos.length) { emL++; return; }
      var h = Math.round(p.h * 1000) / 1000;
      (porAltura[h] = porAltura[h] || []).push(p.w);
    });
    var placasRecorte = 0, sobra = 0;
    Object.keys(porAltura).forEach(function (hk) {
      var h = +hk, ws = porAltura[hk].sort(function (a, b) { return b - a; });
      var faixasPorPlaca = Math.max(1, Math.floor((P + k) / (h + k) + TOL));
      var faixas = [];   // larguras livres
      ws.forEach(function (w) {
        for (var i = 0; i < faixas.length; i++) if (faixas[i] >= w - TOL) { faixas[i] -= (w + k); return; }
        faixas.push(P - w - k);
      });
      var nPl = Math.ceil(faixas.length / faixasPorPlaca);
      placasRecorte += nPl;
      sobra += nPl * P * P - ws.reduce(function (s, w) { return s + w * h; }, 0);
    });
    var total = inteiras + emL + placasRecorte;
    return { inteiras: inteiras, emL: emL, placasParaRecorte: placasRecorte, placasCompra: total, metodo: "faixas por altura + first-fit decrescente (corte de serra " + Math.round(k * 1000) + " mm)" };
  }

  /* ------------------------------------------------------------------
   * QUANTITATIVOS DA PAREDE
   * ------------------------------------------------------------------ */
  var MASSA = { 5: 0.154, 6.3: 0.245, 8: 0.395, 10: 0.617, 12.5: 0.963, 16: 1.578, 20: 2.466 };   // kg/m (NBR 7480)
  function quantitativos(P, cfg, pecas, fiadas, ref) {
    var P0 = cfg.placa, j = cfg.junta, espT = P.cat.esp, cw = P.cat.concreto;
    var tipos = { inteira: 0, meia: 0, recorte: 0, "recorte-L": 0 };
    var area = 0, peso = 0;
    pecas.forEach(function (p) { tipos[p.tipo] = (tipos[p.tipo] || 0) + 1; area += p.area; peso += p.peso; });
    var corte = otimizarCorte(pecas, cfg);
    // juntas: vertical (entre peças da mesma fiada) + horizontal (entre fiadas, sobre a peça de baixo)
    var jv = 0, jh = 0, porF = {};
    pecas.forEach(function (p) { (porF[p.fiada] = porF[p.fiada] || []).push(p); });
    Object.keys(porF).forEach(function (f) {
      var l = porF[f].sort(function (a, b) { return a.x - b.x; });
      for (var i = 0; i < l.length - 1; i++) { var g = l[i + 1].x - (l[i].x + l[i].w); if (g < j * 1.6) jv += Math.min(l[i].h, l[i + 1].h); }
      if (+f < fiadas.length) l.forEach(function (p) { jh += p.w; });
    });
    var argAssent = (jv + jh) * j * espT;
    var compBase = fiadas.length ? (fiadas[0].x1 - fiadas[0].x0) : 0;
    var argNivel = compBase * espT * cfg.argamassa.nivelamento;
    var argTotal = (argAssent + argNivel) * (1 + cfg.argamassa.perda);
    // tratamento de junta (por face tratada)
    var juntaFace = jv + jh, nf = cfg.tratamento.faces;
    // concreto de preenchimento: união das faixas (não somar cruzamento duas vezes)
    var vaosR = P.vaos.map(function (v) { return { x: v.x, y: v.y, w: v.w, h: v.h }; });
    var faixasDono = [].concat(ref.pilaretes.filter(function (p) { return p.dono !== false; }), ref.vergas, ref.contravergas, ref.cintas)
      .map(function (f) { return { x: f.x, y: f.y, w: f.w, h: f.h }; });
    var semVao = subtrairTodos(faixasDono, vaosR);
    var areaFaixas = areaUniao(semVao);
    var concreto = areaFaixas * cw;
    var epsRetirado = areaUniao(subtrairTodos([].concat(ref.pilaretes, ref.vergas, ref.contravergas, ref.cintas).map(function (f) { return { x: f.x, y: f.y, w: f.w, h: f.h }; }), vaosR)) * cw;
    // aço construtivo
    var A = cfg.aco, aco = [], kg = 0;
    function barra(elem, n, bit, comp, qtd) {
      var m = n * comp * qtd, k2 = m * (MASSA[bit] || 0);
      aco.push({ elemento: elem, barras: n * qtd, bitola: bit, comprimento: r3(comp), metros: r3(m), kg: r3(k2) }); kg += k2;
    }
    ref.pilaretes.filter(function (p) { return p.dono !== false; }).forEach(function (p) {
      barra("pilarete " + p.id, A.pilarete.barras, A.pilarete.bitola, p.h + cfg.pilarete.esperaFundacao, 1);
      var nEst = Math.ceil(p.h / A.pilarete.estriboEsp) + 1;
      var perim = 2 * (Math.max(0.03, cw - 0.03) + Math.max(0.03, p.w - 0.03)) + 0.10;
      barra("estribos " + p.id, nEst, A.pilarete.estriboBitola, perim, 1);
    });
    ref.vergas.forEach(function (v) { barra((v.viga ? "viga " : "verga ") + v.id, A.verga.barras, A.verga.bitola, v.w, 1); });
    ref.contravergas.forEach(function (v) { barra("contraverga " + v.id, A.contraverga.barras, A.contraverga.bitola, v.w, 1); });
    ref.cintas.forEach(function (c) { barra(c.nome + " " + c.id, A.cinta.barras, A.cinta.bitola, c.w + 2 * A.ancoragem, 1); });
    var grampos = ref.ligacoes.length * fiadas.length;
    var areaBruta = Math.max(0, (fiadas.length ? (fiadas[0].x1 - fiadas[0].x0) : P.comprimento) * P.altura);
    var areaVaos = P.vaos.reduce(function (s, v) { return s + v.w * v.h; }, 0);
    var areaLiquida = P.comprimento * P.altura - areaVaos;
    var pesoConcreto = concreto * 2500;  // kg (concreto armado 25 kN/m³, NBR 6120)
    return {
      pecas: pecas.length, porTipo: tipos, placasCompra: corte.placasCompra, corte: corte,
      areaPecas: r3(area), areaParedeEixo: r3(P.comprimento * P.altura), areaVaos: r3(areaVaos), areaLiquida: r3(areaLiquida),
      pesoPecasKg: r3(peso), concretoM3: r4(concreto), epsRetiradoM3: r4(epsRetirado), pesoConcretoKg: r3(pesoConcreto),
      pesoTotalKg: r3(peso + pesoConcreto + argTotal * 1900), cargaLinearKNm: P.comprimento > 0 ? r3((peso + pesoConcreto + argTotal * 1900) * 0.00981 / P.comprimento) : 0,
      juntaVerticalM: r3(jv), juntaHorizontalM: r3(jh), argamassaM3: r4(argTotal), argamassaEstimado: true,
      tratamento: { juntaPorFaceM: r3(juntaFace), faces: nf, telaM: r3(juntaFace * nf), acIIIkg: r3(juntaFace * nf * cfg.tratamento.acIIIkgPorM), seladorL: r3(juntaFace * nf * cfg.tratamento.seladorLPorM), estimado: true },
      aco: aco, acoKg: r3(kg), acoConstrutivo: true, grampos: grampos,
      escoramentoVergas: ref.vergas.length, encunhamentoM: P.topo === "encunhamento" ? r3(P.comprimento) : 0,
      areaBrutaFiada: r3(areaBruta)
    };
  }

  /* ------------------------------------------------------------------
   * CONSOLIDAÇÃO (obra inteira)
   * ------------------------------------------------------------------ */
  function consolidar(resultados, cfgIn) {
    var porEsp = {}, t = { paredes: 0, pecas: 0, placasCompra: 0, areaPecas: 0, areaLiquida: 0, pesoPecasKg: 0, pesoTotalKg: 0, concretoM3: 0, argamassaM3: 0, acoKg: 0, telaM: 0, acIIIkg: 0, seladorL: 0, grampos: 0, escoramentoVergas: 0, problemas: 0 };
    var aco = {};
    (resultados || []).forEach(function (r) {
      if (!r || !r.quant) return;
      var q = r.quant, k = String(r.espessura);
      t.paredes++;
      if (!porEsp[k]) porEsp[k] = { espessura: r.espessura, pecas: 0, placasCompra: 0, area: 0, peso: 0, inteira: 0, meia: 0, recorte: 0, "recorte-L": 0 };
      var e = porEsp[k];
      e.pecas += q.pecas; e.placasCompra += q.placasCompra; e.area += q.areaPecas; e.peso += q.pesoPecasKg;
      Object.keys(q.porTipo).forEach(function (tp) { e[tp] = (e[tp] || 0) + q.porTipo[tp]; });
      t.pecas += q.pecas; t.placasCompra += q.placasCompra; t.areaPecas += q.areaPecas; t.areaLiquida += q.areaLiquida;
      t.pesoPecasKg += q.pesoPecasKg; t.pesoTotalKg += q.pesoTotalKg; t.concretoM3 += q.concretoM3; t.argamassaM3 += q.argamassaM3;
      t.acoKg += q.acoKg; t.telaM += q.tratamento.telaM; t.acIIIkg += q.tratamento.acIIIkg; t.seladorL += q.tratamento.seladorL;
      t.grampos += q.grampos; t.escoramentoVergas += q.escoramentoVergas;
      t.problemas += (r.validacao && r.validacao.problemas ? r.validacao.problemas.length : 0);
      q.aco.forEach(function (a) { var kk = a.bitola; aco[kk] = aco[kk] || { bitola: a.bitola, metros: 0, kg: 0 }; aco[kk].metros += a.metros; aco[kk].kg += a.kg; });
    });
    Object.keys(t).forEach(function (k) { t[k] = (k === "paredes" || k === "pecas" || k === "placasCompra" || k === "grampos" || k === "escoramentoVergas" || k === "problemas") ? t[k] : r4(t[k]); });
    return {
      porEspessura: Object.keys(porEsp).sort(function (a, b) { return a - b; }).map(function (k) { var e = porEsp[k]; e.area = r3(e.area); e.peso = r3(e.peso); return e; }),
      aco: Object.keys(aco).sort(function (a, b) { return a - b; }).map(function (k) { return { bitola: +k, metros: r3(aco[k].metros), kg: r3(aco[k].kg) }; }),
      totais: t
    };
  }

  /* ------------------------------------------------------------------
   * GEOMETRIA 3D (coordenadas LOCAIS da parede: x ao longo do eixo a
   * partir do eixo inicial, y para cima a partir da base, z na espessura,
   * de −esp/2 a +esp/2; caixas {x,y,z,w,h,d}). Peça = face A + EPS + face B;
   * onde há reforço, o EPS sai numa largura `concreto` centrada e entra o
   * concreto. Juntas opcionais (opts.juntas).
   * ------------------------------------------------------------------ */
  function geometria3d(res, opts) {
    opts = opts || {};
    var cfg = res.cfg || cfgPadrao(), cat = res.catalogo, f = cfg.face, e = cat.esp, cw = cat.concreto;
    var z0 = -e / 2, caixas = [];
    var faixas = [].concat(res.reforcos.pilaretes, res.reforcos.vergas, res.reforcos.contravergas, res.reforcos.cintas);
    var vaosR = (res.vaos || []).map(function (v) { return { x: v.x, y: v.y, w: v.w, h: v.h }; });
    function caixa(tipo, r, z, d, ref) { caixas.push({ tipo: tipo, peca: ref || null, x: r4(r.x), y: r4(r.y), z: r4(z), w: r4(r.w), h: r4(r.h), d: r4(d) }); }
    res.pecas.forEach(function (p) {
      var partes = subtrairTodos([{ x: p.x, y: p.y, w: p.w, h: p.h }], p.furos || []);
      partes.forEach(function (rr) {
        caixa("face", rr, z0, f, p.cod);
        caixa("face", rr, e / 2 - f, f, p.cod);
        var nucleo = subtrairTodos([rr], faixas);
        nucleo.forEach(function (n) { caixa("eps", n, z0 + f, e - 2 * f, p.cod); });
        // dentro das faixas: EPS remanescente nas laterais (núcleo > largura de concreto)
        var lat = (e - 2 * f - cw) / 2;
        if (cw > 0 && lat > 0.001) faixas.forEach(function (fx) { var i2 = inter(rr, fx); if (i2) { caixa("eps", i2, z0 + f, lat, p.cod); caixa("eps", i2, e / 2 - f - lat, lat, p.cod); } });
      });
    });
    if (cw > 0) {
      var conc = subtrairTodos(faixas.map(function (fx) { return { x: fx.x, y: fx.y, w: fx.w, h: fx.h, id: fx.id }; }), vaosR);
      // sem sobreposição: cada faixa perde o que as anteriores já ocupam
      var feitos = [];
      faixas.forEach(function (fx) {
        var pedacos = subtrairTodos(subtrairTodos([{ x: fx.x, y: fx.y, w: fx.w, h: fx.h }], vaosR), feitos);
        pedacos.forEach(function (pp) { caixa("concreto", pp, -cw / 2, cw, fx.id); });
        feitos.push({ x: fx.x, y: fx.y, w: fx.w, h: fx.h });
      });
      conc = null;
    }
    if (opts.juntas) {
      var j = cfg.junta, porF = {};
      res.pecas.forEach(function (p) { (porF[p.fiada] = porF[p.fiada] || []).push(p); });
      Object.keys(porF).forEach(function (fk) {
        var l = porF[fk].sort(function (a, b) { return a.x - b.x; });
        for (var i = 0; i < l.length - 1; i++) { var g = l[i + 1].x - (l[i].x + l[i].w); if (g < j * 1.6 && g > 0.001) caixa("junta", { x: l[i].x + l[i].w, y: l[i].y, w: g, h: Math.min(l[i].h, l[i + 1].h) }, z0, e, null); }
        if (+fk < res.fiadas.length) l.forEach(function (p) { caixa("junta", { x: p.x, y: p.y + p.h, w: p.w, h: j }, z0, e, null); });
      });
    }
    return caixas;
  }

  /* ------------------------------------------------------------------
   * SEQUÊNCIA DE MONTAGEM da parede (o que o manual e o cronograma leem)
   * ------------------------------------------------------------------ */
  function montagem(res, cfgIn) {
    var cfg = res.cfg || lerCfg(cfgIn), nf = res.fiadas.length, por = Math.max(1, cfg.fiadasPorDia | 0);
    var etapas = [];
    etapas.push({ n: 1, etapa: "Marcação e 1ª fiada", texto: "Conferir nível e esquadro da fundação, marcar o eixo, os vãos e os pilaretes (" + res.reforcos.pilaretes.map(function (p) { return p.id; }).join(", ") + "). Esperas de aço dos pilaretes já na fundação. Argamassa de nivelamento e 1ª fiada com linha, nível e prumo — a franquia acompanha esta fiada." });
    var dias = Math.ceil(nf / por);
    for (var d = 0; d < dias; d++) {
      var de = d * por + 1, ate = Math.min(nf, (d + 1) * por);
      etapas.push({ n: etapas.length + 1, etapa: "Fiadas " + de + (ate > de ? " a " + ate : ""), fiadas: [de, ate],
        texto: "Assentar seguindo a numeração da prancha, com junta de " + Math.round(cfg.junta * 1000) + " mm cheia nos dois sentidos e a amarração indicada (junta nunca alinhada com a de baixo). " + (res.reforcos.ligacoes.length ? "Grampo de ligação a cada fiada, ancorado ≥ 15 cm. " : "") + "Peças com EPS retirado onde há pilarete, verga ou contraverga (marcadas na prancha)." });
    }
    if (res.reforcos.contravergas.length || res.reforcos.vergas.length) etapas.push({ n: etapas.length + 1, etapa: "Vergas e contravergas", texto: "Escorar o fundo das vergas, retirar o EPS na faixa marcada, posicionar a armadura e concretar. As faces da peça são a fôrma." });
    etapas.push({ n: etapas.length + 1, etapa: "Pilaretes e cinta", texto: "Com a parede no topo, conferir prumo, retirar o EPS das faixas dos pilaretes" + (res.reforcos.cintas.length ? " e da cinta de respaldo" : "") + ", armar e concretar em camadas, adensando." });
    if (res.topo === "encunhamento") etapas.push({ n: etapas.length + 1, etapa: "Encunhamento", texto: "Folga de pelo menos " + Math.round(Math.max(cfg.encunhamento, DIRETRIZ.encunhamentoMin) * 1000) + " mm sob a estrutura; encunhar depois de a estrutura acomodar." });
    etapas.push({ n: etapas.length + 1, etapa: "Tratamento de juntas", texto: "Só depois de concretar a laje e retirar o escoramento. Raspar a junta (0 a 1 cm), quebrar a quina, lixar 2,5 a 3 cm de cada lado, selador diluído 1:1, AC-III com aditivo, tela de fibra de vidro e segunda demão de AC-III. Depois, massa e pintura (sem chapisco nem reboco)." });
    var pr = cfg.produtividade || cfgPadrao().produtividade;
    return { etapas: etapas, diasAssentamento: dias, fiadasPorDia: por, m2Dia: pr.m2Dia, equipe: pr.equipe, fonteProdutividade: pr.fonte, estimado: true };
  }

  return {
    CATALOGO: CATALOGO, DIRETRIZ: DIRETRIZ, FONTES: FONTES, MASSA: MASSA,
    cfgPadrao: cfgPadrao, espCm: espCm, catalogo: catalogo,
    paginar: paginar, planejarReforcos: function (p, c) { var cfg = lerCfg(c); return planejarReforcos(lerParede(p, cfg), cfg); },
    otimizarCorte: otimizarCorte, consolidar: consolidar, geometria3d: geometria3d, montagem: montagem,
    _ret: { inter: inter, subtrair: subtrair, subtrairTodos: subtrairTodos, areaUniao: areaUniao }
  };
});
