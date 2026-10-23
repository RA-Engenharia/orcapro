/* =====================================================================
 * guardacorpo.js — GUARDA-CORPO PELA NBR 14718:2019 (21/10/2026). Motor PURO, ES5, Node-testável.
 *
 * O QUE É. Os números da norma (altura, vão-luz, escalabilidade, cargas da Tabela 1, deslocamentos), o dimensionamento da
 * família paramétrica `ra-guarda-corpo` (js/familiasra.js), o lançamento em segmentos (módulos de até 1,20 m, como as composições
 * da SINAPI), o preço (SINAPI 06/2026 MG) e a AUDITORIA: onde há desnível que exige guarda-corpo (borda de laje de sacada,
 * varanda, mezanino ou terraço; escada; janela com peitoril baixo) sem ele → achado com Corrigir (lança o guarda-corpo) e peças
 * para o Mostrar no 3D (js/problemacard.js).
 *
 * FONTE. ABNT NBR 14718:2019 (3ª ed., cancela a 2008). Exemplar NÃO licenciado à RA (cópia de terceiro cedida pelo Rogério,
 * 21/10/2026): só VALORES com item/tabela; nenhum trecho da norma, nenhum PDF arquivado, nenhuma identificação de quem a
 * comprou. `exemplarLicenciado: false`.
 *
 * O QUE NÃO ESTÁ AQUI (e por quê):
 *   · o DIMENSIONAMENTO do montante, da ancoragem e do vidro: a norma é de DESEMPENHO — o guarda-corpo é aprovado por ENSAIO de
 *     protótipo (Anexos A a C: carga horizontal, carga vertical, impacto de 600 J), não por cálculo. A família carrega as cargas que o
 *     ensaio do fabricante tem de cumprir; quem garante é o laudo. Vidro: NBR 7199 / NBR 14697 (não lidas). Vento em guarda-corpo
 *     externo: NBR 6123 / NBR 10821-2 (não lidas).
 *   · a REGIÃO DO PAÍS (I a V) da Tabela 1 vem da NBR 10821-2, Figura 4 — NÃO lida. Sem a região informada vale a V, a mais exigente.
 *   · o prolongamento de 0,30 m após o fim do nível superior (4.4.1.3) e o gabarito prismático dos desenhos ornamentais (4.4.2.3,
 *     Figura 9) ficam como nota: não há geometria para conferi-los no modelo.
 *
 *   GuardaCorpo.NORMA · .carga(grupo, pavimentos, regiao) · .cargaFormulas() · .barras(livre, vao, larg) · .modulos(comprimento)
 *   GuardaCorpo.sinapiDe(modo) · .precoRef(modo) · .opsGuarda(a, b, saida, o, novoId) · .conferirPeca(valores)
 *   GuardaCorpo.auditar({ estado, L, avaliarFam, ... }) → [{ codigo, gravidade, nivel, titulo, texto, pecas, solucoes }]
 * Teste: node tools/test-guardacorpo.js
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) { if (global[nome]) return global[nome]; if (typeof require === "function") { try { return require(arq); } catch (e) {} } return null; }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function num(v, d) { var n = Number(v); return v != null && v !== "" && typeof v !== "boolean" && isFinite(n) ? n : d; }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function f2(v) { return (Math.round(v * 100) / 100).toFixed(2).replace(".", ","); }
  function int0(v) { return Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " "); }

  /* ------------------------------------------------------------------ OS VALORES DA NORMA (cada um com o item) */
  var NORMA = {
    sigla: "ABNT NBR 14718:2019", titulo: "Esquadrias — Guarda-corpos para edificação — Requisitos, procedimentos e métodos de ensaio",
    edicao: "2019 (3ª edição, cancela a 2008)", nivel: "A", exemplarLicenciado: false,
    fonteObs: "Exemplar não licenciado à RA: só valores com item/tabela; sem arquivo do PDF. Conferir no exemplar licenciado antes de emitir projeto.",
    desnivelObrigatorio: { valor: 1.00, un: "m", item: "4.1", texto: "guarda-corpo em qualquer local de acesso livre a pessoas com desnível maior que 1,00 m (rampa de até 30° não exige)" },
    altura: { valor: 1.10, un: "m", item: "4.4.1.1 (Figura 4); 3.1", texto: "altura de proteção H ≥ 1,10 m acima da zona de estacionamento normal" },
    aprMureta: { apr: 0.90, murMax: 0.70, espacoMax: 0.10, un: "m", item: "4.4.1.2 (Figura 5)", texto: "sobre mureta com espaço interno ≤ 0,10 m: H ≥ 1,10 m da ZEN e APR ≥ 0,90 m acima da mureta; mureta acima de 0,70 m: sem APR, vale H ≥ 1,10 m" },
    vaoLuz: { valor: 0.11, un: "m", item: "4.4.2.1 (Figura 7)", texto: "espaçamento entre perfis verticais (vão-luz) ≤ 0,11 m" },
    escalada: { valor: 0.45, espacoHoriz: 0.11, un: "m", item: "4.4.2.2 (Figura 8)", texto: "se há apoios que permitam escalar até 0,45 m (perfis horizontais, desenho ornamental), fechamento no lado interno; espaçamento entre horizontais ≤ 0,11 m" },
    avancoPlano: { avanco: 0.05, esfera: 0.09, un: "m", item: "4.4.2.4 (Figura 10)", texto: "guarda-corpo em plano avançado: avanço ≤ 0,05 m e o vão até a borda do pavimento não passa esfera de 0,09 m" },
    esferaPiso: { valor: 0.05, un: "m", item: "4.4.2.5", texto: "barreira (mureta ou rodapé) que impeça uma esfera de 0,05 m rolando pelo piso, em toda a extensão" },
    ancoragem: { profundidade: 0.070, bordas: 0.070, un: "m", item: "4.4.3.3", texto: "fixação química ou mecânica: profundidade mínima de 70 mm no concreto e furo a pelo menos 70 mm das bordas; mureta de alvenaria não é parte estrutural (4.4.3.2)" },
    escada: { ultimoElemento: 0.05, un: "m", item: "4.4.4.2 (Figura 11)", texto: "na zona dos degraus, o último elemento horizontal fica a ≤ 0,05 m da aresta do piso; mesma limitação de vãos de 4.4.2" },
    ensaio: {
      deslocUso: { valor: 0.025, un: "m", item: "5.1.1", texto: "deslocamento horizontal sob a carga de uso ≤ 25 mm; residual ≤ 3 mm" }, deslocResidualUso: 0.003,
      cargaSegurancaFator: { valor: 1.7, item: "5.1.2", texto: "a carga de segurança equivale a 1,7 vez a carga de uso nos grupos coletivos (a Tabela 1 traz o valor de cada caso)" },
      deslocSeguranca: { valor: 0.150, un: "m", item: "5.1.2", texto: "deslocamento horizontal sob a carga de segurança ≤ 150 mm, preservando a retenção do corpo" },
      vertical: { deslocamento: 0.020, residual: 0.008, un: "m", item: "5.2", texto: "carga de segurança vertical: deformação ≤ 20 mm e residual ≤ 8 mm" },
      impacto: { valor: 600, un: "J", item: "5.3 e Anexo C", texto: "impacto de 600 J (saco de 40 kg, queda de 1 500 mm) no centro do elemento de fechamento, sem queda do elemento" }
    },
    tabela1: {
      item: "Tabela 1", un: "N/m", obs: "10 N = 1 kgf (nota da norma). Região do país I a V pela NBR 10821-2, Figura 4 (NÃO lida).",
      /* Residencial ou comercial de uso privativo e áreas técnicas: [carga de uso, carga de segurança] por região I a V */
      privativo: [
        { pav: 2, alt: 6, reg: [[400, 680], [400, 680], [400, 680], [450, 680], [500, 800]] },
        { pav: 5, alt: 15, reg: [[400, 680], [400, 680], [500, 680], [600, 800], [800, 1000]] },
        { pav: 10, alt: 30, reg: [[400, 680], [400, 680], [500, 750], [600, 950], [800, 1150]] },
        { pav: 20, alt: 60, reg: [[400, 680], [450, 680], [600, 900], [750, 1100], [900, 1400]] },
        { pav: 30, alt: 90, reg: [[400, 680], [500, 750], [650, 950], [800, 1200], [1000, 1500]] }
      ],
      coletivoMedio: { pessoas: "até 2 500 por dia", valor: [1000, 1700] },
      coletivoAlto: { pessoas: "acima de 2 500 por dia", valor: [1800, 3000] }
    },
    grupos: { 1: "Residencial ou comercial de uso privativo (varanda, mezanino, escada da unidade) e áreas técnicas", 2: "Uso coletivo de médio tráfego (até 2 500 pessoas/dia)", 3: "Uso coletivo de alto tráfego (acima de 2 500 pessoas/dia)" },
    regiaoPadrao: 5
  };
  var MODULO_MAX = 1.20;   /* m entre montantes: as composições da SINAPI (montantes espaçados de 1,20 m) */
  var MODOS = { 1: "barras verticais", 2: "travessas horizontais (com fechamento no lado interno até 0,45 m)", 3: "vidro (painel)" };

  /* ------------------------------------------------------------------ cargas da Tabela 1 */
  /* grupo 1/2/3; pavimentos = nº de pavimentos do edifício; regiao 1 a 5 (I a V). Cai no bloco de pavimentos igual ou MAIOR (nunca interpola). */
  function carga(grupo, pavimentos, regiao) {
    var T = NORMA.tabela1, g = Math.round(num(grupo, 1)), reg = Math.max(1, Math.min(5, Math.round(num(regiao, NORMA.regiaoPadrao)))), pv = Math.max(1, Math.round(num(pavimentos, 2)));
    var avisos = [];
    if (g === 2) return { uso: T.coletivoMedio.valor[0], seguranca: T.coletivoMedio.valor[1], bloco: "coletivo de médio tráfego", item: "Tabela 1", avisos: avisos };
    if (g === 3) return { uso: T.coletivoAlto.valor[0], seguranca: T.coletivoAlto.valor[1], bloco: "coletivo de alto tráfego", item: "Tabela 1", avisos: avisos };
    var blk = null;
    for (var i = 0; i < T.privativo.length && !blk; i++) if (pv <= T.privativo[i].pav) blk = T.privativo[i];
    if (!blk) { blk = T.privativo[T.privativo.length - 1]; avisos.push("Mais de 30 pavimentos: fora da Tabela 1; usado o último bloco (conferir)."); }
    var par = blk.reg[reg - 1];
    return { uso: par[0], seguranca: par[1], bloco: "uso privativo, até " + blk.pav + " pavimentos / " + blk.alt + " m", item: "Tabela 1", regiao: reg, avisos: avisos };
  }
  /* as fórmulas da família: se(Grupo_uso …; Pavimentos …; Regiao …) — gerado da MESMA tabela, nunca digitado duas vezes */
  function cargaFormulas() {
    var T = NORMA.tabela1;
    function porRegiao(blk, k) {
      var s = String(blk.reg[4][k]);
      for (var r = 3; r >= 0; r--) s = "se(Regiao <= " + (r + 1) + "; " + blk.reg[r][k] + "; " + s + ")";
      return s;
    }
    function porPav(k) {
      var s = porRegiao(T.privativo[T.privativo.length - 1], k);
      for (var i = T.privativo.length - 2; i >= 0; i--) s = "se(Pavimentos <= " + T.privativo[i].pav + "; " + porRegiao(T.privativo[i], k) + "; " + s + ")";
      return s;
    }
    return {
      uso: "se(Grupo_uso = 2; " + T.coletivoMedio.valor[0] + "; se(Grupo_uso = 3; " + T.coletivoAlto.valor[0] + "; " + porPav(0) + "))",
      seguranca: "se(Grupo_uso = 2; " + T.coletivoMedio.valor[1] + "; se(Grupo_uso = 3; " + T.coletivoAlto.valor[1] + "; " + porPav(1) + "))"
    };
  }

  /* ------------------------------------------------------------------ geometria do módulo */
  /* barras verticais entre dois montantes: n e o vão real. livre = comprimento − seção do montante (face a face), vao = vão-luz máximo, larg = barra */
  function barras(livre, vao, larg) {
    var n = Math.max(1, Math.ceil((livre - vao) / (vao + larg) - 1e-9)), gap = (livre - n * larg) / (n + 1);
    return { n: n, vao: r4(gap), passo: r4(gap + larg) };
  }
  function modulos(comprimento) {
    var n = Math.max(1, Math.ceil(comprimento / MODULO_MAX - 1e-9));
    return { n: n, comprimento: r4(comprimento / n) };
  }

  /* ------------------------------------------------------------------ preço (SINAPI 06/2026 MG, conferido em data/sinapi-MG-analitico.json) */
  var SINAPI = {
    1: { codigo: "99842", un: "m", rotulo: "guarda-corpo de aço galvanizado 1,10 m, gradil de tubos horizontais e verticais, fixado com adesivo epóxi",
      obs: "A composição não diz o vão-luz do gradil: conferir ≤ 0,11 m com o fornecedor (NBR 14718, 4.4.2.1). Gradil de tubos (1\" horizontais e 3/4\" verticais): entre os gradis de 1,10 m sem duplo corrimão, ele e o 99845 (barras chatas) têm os maiores preços da SINAPI 06/2026 MG, quase iguais — provisório; os tubos horizontais são apoio de escalada (4.4.2.2): conferir o fechamento interno com o fornecedor." },
    2: { codigo: "99842", un: "m", rotulo: "guarda-corpo de aço galvanizado 1,10 m, gradil de tubos horizontais e verticais, fixado com adesivo epóxi",
      obs: "Travessas horizontais com fechamento até 0,45 m: a SINAPI não tem composição exata; adotado o gradil de maior preço (provisório). Conferir o vão-luz com o fornecedor." },
    3: { codigo: "99846", un: "m", rotulo: "guarda-corpo panorâmico 1,10 m, montantes de alumínio e vidro laminado 8 mm, fixado com adesivo epóxi",
      obs: "Adotado o de maior preço entre os de vidro de 1,10 m (provisório). Vidro e fixação: NBR 7199 e fabricante." }
  };
  function sinapiDe(modo) { var s = SINAPI[modo] || SINAPI[1]; return { codigo: s.codigo, un: s.un, rotulo: s.rotulo, obs: s.obs, provisorio: true }; }
  function precoRef(modo, base) { var s = sinapiDe(modo), c = base && base.obter ? base.obter(s.codigo) : null; return c ? { codigo: s.codigo, custo: c.custoUnitario, un: "m", obs: s.obs } : { codigo: s.codigo, custo: null, un: "m", obs: s.obs }; }

  /* ------------------------------------------------------------------ o lançamento */
  function eixoU(r) { return [Math.cos(r), -Math.sin(r)]; }
  function eixoN(r) { return [Math.sin(r), Math.cos(r)]; }
  /* ops (família + orçamento) para o segmento a→b (planta, [x, z]). saida = a normal para o lado do VAZIO. o = { y (piso), altura, modo, grupo, pavimentos, regiao, prefixo }.
     O +Z local da família é o lado do vazio: o fechamento interno (modo 2) e o vidro ficam do lado de dentro. */
  function opsGuarda(a, b, saida, o, novoId) {
    o = o || {};
    var dx = b[0] - a[0], dz = b[1] - a[1], S = Math.sqrt(dx * dx + dz * dz), ops = [], itens = [];
    if (S < 0.05) return { ops: ops, itens: itens };
    var u = [dx / S, dz / S], r = Math.atan2(-u[1], u[0]), n = eixoN(r);
    if (saida && n[0] * saida[0] + n[1] * saida[1] < 0) { var t = a; a = b; b = t; u = [-u[0], -u[1]]; r = Math.atan2(-u[1], u[0]); }
    var M = modulos(S), modo = Math.round(num(o.modo, 1)), alt = num(o.altura, NORMA.altura.valor), sin = sinapiDe(modo);
    for (var i = 0; i < M.n; i++) {
      var id = String(novoId(o.prefixo || "gc")), p0 = [a[0] + u[0] * M.comprimento * i, a[1] + u[1] * M.comprimento * i];
      ops.push({ op: "familia", id: id, famId: "ra-guarda-corpo", tipoId: modo === 3 ? "gcv" : (modo === 2 ? "gct" : "gcb"), x: r4(p0[0]), y: r4(num(o.y, 0)), z: r4(p0[1]), rotY: r4(r),
        inst: { Comprimento: M.comprimento, Altura: alt, Grupo_uso: Math.round(num(o.grupo, 1)), Pavimentos: Math.round(num(o.pavimentos, 2)), Regiao: Math.round(num(o.regiao, NORMA.regiaoPadrao)) } });
      ops.push({ op: "orcar", id: id, servicos: [{ codigo: sin.codigo, medida: "quantidade", fator: 1, rotulo: "Guarda-corpo NBR 14718 — SINAPI " + sin.codigo + " (provisório)" }] });
      itens.push({ id: id, comprimento: M.comprimento, altura: alt, modo: modo, sinapi: sin });
    }
    return { ops: ops, itens: itens, comprimento: r4(S), modulos: M.n };
  }

  /* ------------------------------------------------------------------ conferência de uma peça (valores avaliados da família) */
  function conferirPeca(v) {
    v = v || {};
    var out = [], alt = num(v.Altura, 0), modo = Math.round(num(v.Modo, 1)), vao = num(v.Vao_real, 0), rod = num(v.Rodape, 0);
    if (alt < NORMA.altura.valor - 1e-6) out.push({ tipo: "altura", texto: "altura " + f2(alt) + " m < " + f2(NORMA.altura.valor) + " m (NBR 14718, " + NORMA.altura.item + ")", corrige: { Altura: NORMA.altura.valor } });
    if (modo !== 3 && vao > NORMA.vaoLuz.valor + 1e-6) out.push({ tipo: "vao", texto: "vão-luz " + f2(vao) + " m > " + f2(NORMA.vaoLuz.valor) + " m (NBR 14718, " + NORMA.vaoLuz.item + ")", corrige: { Vao_luz: NORMA.vaoLuz.valor } });
    if (rod < NORMA.esferaPiso.valor - 1e-6) out.push({ tipo: "rodape", texto: "sem barreira de piso: rodapé " + f2(rod) + " m < " + f2(NORMA.esferaPiso.valor) + " m (NBR 14718, " + NORMA.esferaPiso.item + ")", corrige: null });
    return out;
  }

  /* ------------------------------------------------------------------ geometria plana p/ a auditoria */
  function distSeg(p, a, b) {
    var ex = b[0] - a[0], ez = b[1] - a[1], l2 = ex * ex + ez * ez, k = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ez) / l2)) : 0;
    var qx = a[0] + ex * k, qz = a[1] + ez * k;
    return Math.sqrt((p[0] - qx) * (p[0] - qx) + (p[1] - qz) * (p[1] - qz));
  }
  function dentro(p, P) {
    var c = false;
    for (var i = 0, j = P.length - 1; i < P.length; j = i++) {
      var a = P[i], b = P[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1] + 1e-15) + a[0]) c = !c;
    }
    return c;
  }
  function distPol(p, P) { if (dentro(p, P)) return 0; var d = Infinity; for (var i = 0; i < P.length; i++) d = Math.min(d, distSeg(p, P[i], P[(i + 1) % P.length])); return d; }
  function centro(P) { var x = 0, z = 0; P.forEach(function (q) { x += q[0]; z += q[1]; }); return [x / P.length, z / P.length]; }

  /* ------------------------------------------------------------------ A AUDITORIA */
  /* o = { estado, L (EsqAuto.leitura), avaliarFam, grupo, regiao, EAm (EsqAuto, p/ ptParede/eixoN) } */
  function auditar(o) {
    o = o || {};
    var est = o.estado || {}, L = o.L, aval = o.avaliarFam, EAm = o.EAm, out = [];
    if (!L) return out;
    var ground = arr(L.pavimentos).length ? num(L.pavimentos[0].cota, 0) : 0, npav = Math.max(1, arr(L.pavimentos).length), grupo = Math.round(num(o.grupo, 1)), regiao = Math.round(num(o.regiao, NORMA.regiaoPadrao));
    var C = carga(grupo, npav, regiao), D1 = NORMA.desnivelObrigatorio.valor, H = NORMA.altura.valor;
    var usados = {}; arr(est.caixas).forEach(function (c) { if (c) usados[String(c.id)] = 1; }); arr(est.familias).forEach(function (f) { if (f) usados[String(f.id)] = 1; });
    function novoId(pref) { var k = 1, id = pref + "-" + k; while (usados[id]) id = pref + "-" + (++k); usados[id] = 1; return id; }
    var textoCarga = "Cargas de ensaio pela Tabela 1 (" + C.bloco + (C.regiao ? ", região " + ["I", "II", "III", "IV", "V"][C.regiao - 1] + (regiao === NORMA.regiaoPadrao && o.regiao == null ? " adotada por prudência: a região do país vem da NBR 10821-2, Fig. 4, não lida — informe" : "") : "") + "): uso " + int0(C.uso) + " N/m, segurança " + int0(C.seguranca) + " N/m.";
    var citeNorma = NORMA.sigla + " (exemplar não licenciado à RA: conferir no exemplar licenciado)";

    /* ---- os guarda-corpos que já existem (família RA e caixa "guarda") */
    var guardas = [];
    arr(est.familias).forEach(function (f) {
      if (!f || f.famId !== "ra-guarda-corpo") return;
      var av = null; try { av = typeof aval === "function" ? aval(f.famId, f.tipoId, f.inst || {}) : null; } catch (e) { av = null; }
      var v = av && av.valores ? av.valores : {}, comp = num(v.Comprimento, num(f.inst && f.inst.Comprimento, 1.2)), r = num(f.rotY, 0), u = eixoU(r), a = [num(f.x, 0), num(f.z, 0)];
      guardas.push({ id: String(f.id), tipo: "familia", pts: [a, [a[0] + u[0] * comp, a[1] + u[1] * comp]], altura: num(v.Altura, 0), y: num(f.y, 0), valores: v, famId: f.famId, tipoId: f.tipoId });
    });
    arr(est.caixas).forEach(function (c) {
      if (!c || c.tipo !== "guarda" || !c.guarda) return;
      var pts = arr(c.guarda.pts).map(function (p) { return [num(p.x, 0), num(p.z, 0)]; });
      if (pts.length < 2) return;
      guardas.push({ id: String(c.id), tipo: "caixa", pts: pts, altura: num(c.guarda.par && c.guarda.par.altura, 0), y: num(c.guarda.pts[0] && c.guarda.pts[0].y, 0), host: c.guarda.host || null });
    });
    function guardaPerto(p, y) {
      var melhor = null;
      guardas.forEach(function (g) {
        for (var i = 0; i + 1 < g.pts.length; i++) {
          var d = distSeg(p, g.pts[i], g.pts[i + 1]);
          if (d <= 0.30 && (y == null || g.tipo === "caixa" && g.host || Math.abs(g.y - y) <= 1.2) && (!melhor || d < melhor.d)) melhor = { g: g, d: d };
        }
      });
      return melhor ? melhor.g : null;
    }

    /* ---- as peças já lançadas: altura, vão-luz, barreira de piso */
    guardas.forEach(function (g) {
      if (g.tipo === "familia") {
        var falhas = conferirPeca(g.valores);
        if (falhas.length) {
          var inst = {}; var corr = false;
          falhas.forEach(function (q) { if (q.corrige) { Object.keys(q.corrige).forEach(function (k) { inst[k] = q.corrige[k]; }); corr = true; } });
          out.push({ codigo: "ESQ_GUARDA_ALTURA", gravidade: "erro", nivel: "A", titulo: "Guarda-corpo " + g.id + " fora da NBR 14718: " + falhas.map(function (q) { return q.texto; }).join("; "),
            texto: "O guarda-corpo precisa de H ≥ " + f2(H) + " m, vão-luz ≤ " + f2(NORMA.vaoLuz.valor) + " m e barreira de piso (esfera de " + f2(NORMA.esferaPiso.valor) + " m). Fonte: " + citeNorma + ".", pecas: [g.id],
            solucoes: corr ? [{ id: "ajustar", texto: "Ajustar para os valores da norma", ops: [{ op: "instancia", id: g.id, inst: inst }] }] : [{ id: "nota-rodape", texto: "Ponha rodapé/mureta de pelo menos " + f2(NORMA.esferaPiso.valor) + " m em toda a extensão." }] });
        }
      } else if (g.altura && g.altura < H - 1e-6) {
        out.push({ codigo: "ESQ_GUARDA_ALTURA", gravidade: "erro", nivel: "A", titulo: "Guarda-corpo " + g.id + " com " + f2(g.altura) + " m (mínimo " + f2(H) + " m)",
          texto: "Altura de proteção H ≥ " + f2(H) + " m (NBR 14718, " + NORMA.altura.item + "; a edição 2008 pedia 1,00 m). Fonte: " + citeNorma + ".", pecas: [g.id],
          solucoes: [{ id: "nota-altura", texto: "Aumente a altura do guarda-corpo para " + f2(H) + " m nas propriedades dele." }] });
      }
    });

    /* ---- lajes com acesso livre e desnível > 1,00 m: borda sem guarda-corpo (sacada, varanda, mezanino, terraço) */
    var rawPorId = {}; arr(est.caixas).forEach(function (c) { if (c) rawPorId[String(c.id)] = c; });
    var NOME_RE = /mezanin|sacada|varanda|terra[cç]o|deck|balc[aã]o|passarela|plataforma/i;
    var lajes = arr(L.lajesTodas).filter(function (l) { return l.status !== "demolido" && l.topo - ground > D1 + 1e-6; });
    function acessivel(l) {
      if (l.piso) return true;
      var c = rawPorId[l.id] || {}, nome = [c.nome, c.marca, c.comentarios].join(" ");
      if (NOME_RE.test(nome)) return true;
      return arr(L.ambientes).some(function (a) { return Math.abs(a.base - l.topo) <= 0.35 && dentro([a.cx, a.cz], l.pts); });
    }
    var acess = lajes.filter(acessivel);
    acess.forEach(function (l) {
      var P = l.pts, c = rawPorId[l.id] || {}, nomeAmb = null;
      arr(L.ambientes).forEach(function (a) { if (!nomeAmb && Math.abs(a.base - l.topo) <= 0.35 && dentro([a.cx, a.cz], P)) nomeAmb = a.nome; });
      var rotulo = nomeAmb && NOME_RE.test(nomeAmb) ? nomeAmb : (NOME_RE.test([c.nome, c.marca, c.comentarios].join(" ")) ? ([c.nome, c.marca, c.comentarios].join(" ").match(NOME_RE) || ["laje"])[0] : (nomeAmb || "Laje"));
      var livres = [], muretas = [], livresFora = [], muretasFora = [], D = l.topo - ground, sent = 0;
      /* REVISÃO (21/10/2026): laje que é PISO de ambiente(s) e passa para fora das paredes (marquise, beiral, brise): a borda fora dos
         ambientes só é "acesso livre" (4.1) se uma PORTA do ambiente dá para essa faixa (sacada no mesmo polígono da laje). Sem porta →
         aviso (pode ser marquise), nunca erro: o erro cobrava guarda-corpo (R$ 554/m) numa borda a que ninguém chega. */
      var ambsNivel = arr(L.ambientes).filter(function (a) { return Math.abs(a.base - l.topo) <= 0.35 && arr(a.pts).length >= 3 && dentro([a.cx, a.cz], P); });
      function emAmb(pt) { return ambsNivel.some(function (a) { return dentro(pt, a.pts); }); }
      var acessoFora = !ambsNivel.length || (EAm && arr(L.vaos).some(function (v) {
        if (v.tipo !== "porta" && !v.correr) return false;
        var w = L.porParede && L.porParede[v.parede]; if (!w || Math.abs(num(w.base, 0) - l.topo) > 0.35) return false;
        var d = num(w.espessura, 0.15) / 2 + 0.30, p1 = EAm.ptParede(w, v.t, d), p2 = EAm.ptParede(w, v.t, -d);
        return (emAmb(p1) && dentro(p2, P) && !emAmb(p2)) || (emAmb(p2) && dentro(p1, P) && !emAmb(p1));
      }));
      for (var i = 0; i < P.length; i++) {
        var p = P[i], q = P[(i + 1) % P.length], ex = q[0] - p[0], ez = q[1] - p[1], Le = Math.sqrt(ex * ex + ez * ez);
        if (Le < 0.2) continue;
        var u = [ex / Le, ez / Le], nrm = [-u[1], u[0]], mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
        if (dentro([mid[0] + nrm[0] * 0.05, mid[1] + nrm[1] * 0.05], P)) nrm = [-nrm[0], -nrm[1]];   /* a normal para FORA do polígono */
        var nA = Math.max(1, Math.ceil(Le / 0.1)), cur = null;
        var fecha = function (fim) {
          if (!cur) return;
          var lst = cur.k === "livre" ? (cur.fora ? livresFora : livres) : (cur.fora ? muretasFora : muretas), comp = fim - cur.ini;
          if (comp >= 0.2) lst.push({ a: [p[0] + u[0] * cur.ini, p[1] + u[1] * cur.ini], b: [p[0] + u[0] * fim, p[1] + u[1] * fim], out: nrm, h: cur.h });
          cur = null;
        };
        for (var k = 0; k < nA; k++) {
          var s0 = Le * k / nA, s1 = Le * (k + 1) / nA, sm = (s0 + s1) / 2, sp = [p[0] + u[0] * sm, p[1] + u[1] * sm], st = null;
          /* 1) outra laje acessível do mesmo nível do outro lado */
          var fora = [sp[0] + nrm[0] * 0.2, sp[1] + nrm[1] * 0.2];
          if (acess.some(function (o2) { return o2.id !== l.id && Math.abs(o2.topo - l.topo) <= 0.3 && dentro(fora, o2.pts); })) st = { k: "ok" };
          /* 2) guarda-corpo existente (a altura é conferida à parte) */
          if (!st) { var gp = guardaPerto(sp, l.topo); if (gp) st = { k: "ok" }; }
          /* 3) parede/mureta na borda */
          if (!st) {
            var h = 0;
            arr(L.paredes).forEach(function (w) {
              if (w.status === "demolido" || w.base > l.topo + 0.15 || w.topo < l.topo + 0.2) return;
              if (distPol(sp, w.pts) <= 0.12) h = Math.max(h, w.topo - l.topo);
            });
            if (h >= H - 0.01) st = { k: "ok" };
            else if (h > 0.2) st = { k: "mureta", h: h };
            else st = { k: "livre", h: 0 };
          }
          if (st.k === "ok") { fecha(s0); continue; }
          st.fora = !acessoFora && !emAmb([sp[0] - nrm[0] * 0.15, sp[1] - nrm[1] * 0.15]);   /* a borda fica fora dos ambientes e sem porta para lá */
          if (cur && (cur.k !== st.k || cur.fora !== st.fora || Math.abs(cur.h - st.h) > 0.05)) fecha(s0);
          if (!cur) cur = { k: st.k, ini: s0, h: st.h, fora: st.fora };
        }
        fecha(Le);
      }
      function comp(L2) { return L2.reduce(function (s, x) { return s + Math.sqrt(Math.pow(x.b[0] - x.a[0], 2) + Math.pow(x.b[1] - x.a[1], 2)); }, 0); }
      function opsDe(L2, alturaDe) {
        var ops = [];
        L2.forEach(function (sg) { var r = opsGuarda(sg.a, sg.b, sg.out, { y: l.topo + (sg.h || 0), altura: alturaDe(sg), modo: 1, grupo: grupo, pavimentos: npav, regiao: regiao, prefixo: "gc-" + l.id }, novoId); r.ops.forEach(function (x) { ops.push(x); }); });
        return ops;
      }
      if (livres.length) {
        var Lc = comp(livres);
        out.push({ codigo: "ESQ_GUARDA_BORDA", gravidade: "erro", nivel: NORMA.nivel, titulo: rotulo + ": " + f2(Lc) + " m de borda livre a " + f2(D) + " m do chão, sem guarda-corpo",
          texto: "Todo local de acesso livre com desnível maior que " + f2(D1) + " m exige guarda-corpo (NBR 14718, " + NORMA.desnivelObrigatorio.item + "): H ≥ " + f2(H) + " m (" + NORMA.altura.item + "), vão-luz ≤ " + f2(NORMA.vaoLuz.valor) + " m (" + NORMA.vaoLuz.item + "), barreira de piso (" + NORMA.esferaPiso.item + "). " + textoCarga + " Fonte: " + citeNorma + ".",
          pecas: [l.id], solucoes: [{ id: "lancar", texto: "Lançar guarda-corpo de " + f2(H) + " m (barras verticais, vão-luz ≤ " + f2(NORMA.vaoLuz.valor) + " m) em " + f2(Lc) + " m de borda", ops: opsDe(livres, function () { return H; }) }] });
      }
      if ((livresFora.length || muretasFora.length) && !/marquise|beiral|brise/i.test([c.nome, c.marca, c.comentarios].join(" "))) {
        var Lf = comp(livresFora) + comp(muretasFora);
        out.push({ codigo: "ESQ_GUARDA_BORDA", gravidade: "aviso", nivel: NORMA.nivel, titulo: rotulo + ": " + f2(Lf) + " m de borda de laje fora dos ambientes, a " + f2(D) + " m do chão, sem guarda-corpo (sem porta de acesso)",
          texto: "A laje passa para fora das paredes e nenhuma porta dá para essa faixa: se for marquise ou beiral sem acesso, não precisa; se for sacada, terraço ou laje de acesso livre, exige guarda-corpo (NBR 14718, " + NORMA.desnivelObrigatorio.item + "): H ≥ " + f2(H) + " m, vão-luz ≤ " + f2(NORMA.vaoLuz.valor) + " m. " + textoCarga + " Fonte: " + citeNorma + ".",
          pecas: [l.id], solucoes: [{ id: "lancar", texto: "Se tiver acesso: lançar guarda-corpo de " + f2(H) + " m em " + f2(Lf) + " m de borda", ops: opsDe(livresFora.concat(muretasFora), function (sg) { return sg.h > 0.2 ? (sg.h <= NORMA.aprMureta.murMax ? Math.max(NORMA.aprMureta.apr, H - sg.h) : H - sg.h) : H; }) },
            { id: "nota-marquise", texto: "Marquise/beiral sem acesso: ignore este aviso. Para tirar a dúvida do modelo, dê o nome \"Marquise\" à laje ou separe a sacada numa laje própria." }] });
      }
      if (muretas.length) {
        var Lm = comp(muretas), hm = Math.min.apply(null, muretas.map(function (m) { return m.h; }));
        out.push({ codigo: "ESQ_GUARDA_MURETA", gravidade: "erro", nivel: NORMA.nivel, titulo: rotulo + ": parapeito de " + f2(hm) + " m onde a queda é de " + f2(D) + " m (guarda-corpo precisa de " + f2(H) + " m)",
          texto: "Mureta/parapeito baixo (" + f2(hm) + " m) não basta: H ≥ " + f2(H) + " m acima da zona de estacionamento normal (NBR 14718, " + NORMA.altura.item + "). Sobre mureta de até " + f2(NORMA.aprMureta.murMax) + " m com espaço interno ≤ " + f2(NORMA.aprMureta.espacoMax) + " m vale também APR ≥ " + f2(NORMA.aprMureta.apr) + " m acima da mureta (" + NORMA.aprMureta.item + "). " + textoCarga + " Fonte: " + citeNorma + ".",
          pecas: [l.id], solucoes: [{ id: "complementar", texto: "Lançar guarda-corpo complementar sobre o parapeito (" + f2(Lm) + " m)", ops: opsDe(muretas, function (sg) { return sg.h <= NORMA.aprMureta.murMax ? Math.max(NORMA.aprMureta.apr, H - sg.h) : H - sg.h; }) }] });
      }
    });

    /* ---- janela com peitoril abaixo do exigido onde a queda passa de 1,00 m */
    arr(L.ambientes).forEach(function (a) {
      if (a.base - ground <= D1 + 1e-6 || !EAm) return;
      a.trechos.forEach(function (tr) {
        if (tr.vizinho != null) return;
        var w = L.porParede[tr.paredeId]; if (!w) return;
        arr(L.vaos).forEach(function (v) {
          if (v.tipo !== "janela" || v.parede !== tr.paredeId || v.t < tr.t0 - 0.02 || v.t > tr.t1 + 0.02 || v.peitoril >= H - 1e-6) return;
          var Dq = a.base - ground, outN = EAm.eixoN(w.rotY); outN = [-tr.lado * outN[0], -tr.lado * outN[1]];
          var s = tr.lado * (w.espessura / 2 + 0.04), pa = EAm.ptParede(w, v.t - v.largura / 2, s), pb = EAm.ptParede(w, v.t + v.largura / 2, s);
          if (guardaPerto(EAm.ptParede(w, v.t, s), a.base)) return;   /* já tem guarda-corpo no vão da janela */
          var gr = opsGuarda(pa, pb, outN, { y: a.base, altura: H, modo: 1, grupo: grupo, pavimentos: npav, regiao: regiao, prefixo: "gc-" + v.id }, novoId);
          var sols = [{ id: "lancar", texto: "Lançar guarda-corpo de " + f2(H) + " m no vão da janela (" + f2(v.largura) + " m)", ops: gr.ops }];
          if (H + v.altura <= a.pe - 0.1) sols.push({ id: "peitoril", texto: "Subir o peitoril para " + f2(H) + " m", ops: [{ op: "instancia", id: v.id, inst: { Peitoril: H } }] });
          out.push({ codigo: "ESQ_GUARDA_JANELA", gravidade: "erro", nivel: NORMA.nivel, titulo: "Janela " + v.id + " (" + a.nome + "): peitoril " + f2(v.peitoril) + " m com queda de " + f2(Dq) + " m",
            texto: "Parapeito de esquadria é guarda-corpo e precisa de H ≥ " + f2(H) + " m onde o desnível passa de " + f2(D1) + " m (NBR 14718, " + NORMA.desnivelObrigatorio.item + ", 4.2 e " + NORMA.altura.item + "); ele também é ensaiado como guarda-corpo (4.2). " + textoCarga + " Fonte: " + citeNorma + ".",
            pecas: [v.id, a.id], solucoes: sols });
        });
      });
    });

    /* ---- escada (e rampa) com lado livre sem guarda-corpo */
    var BA = dep("BimArq", "./bimarq.js");
    arr(est.caixas).forEach(function (c) {
      if (!c || (c.tipo !== "escada" && c.tipo !== "rampa")) return;
      var info = c.tipo === "escada" ? c.escada : c.rampa, cams = info && info.caminhos, par = info && info.par;
      if (!cams || !par || num(par.desnivel, 0) <= D1 + 1e-6) return;
      var faltam = [];
      Object.keys(cams).forEach(function (lado, ordem) {
        var tem = guardas.some(function (g) { return g.tipo === "caixa" && g.host && String(g.host.id) === String(c.id) && g.host.lado === lado; });
        var ps = arr(cams[lado]);
        if (!tem) tem = ps.some(function (p) { return guardaPerto([p.x, p.z], null); });
        /* lado encostado em parede alta: protegido */
        if (!tem && ps.length) {
          var m = ps[Math.floor(ps.length / 2)], alta = arr(L.paredes).some(function (w) { return w.status !== "demolido" && w.topo - w.base >= 1.0 && distPol([m.x, m.z], w.pts) <= 0.30; });
          if (alta) tem = true;
        }
        if (!tem) faltam.push({ lado: lado, ordem: ordem, pts: ps });
      });
      if (!faltam.length) return;
      var ops = [];
      if (BA && BA.guarda && BA.paraOp) faltam.forEach(function (f) {
        var g = BA.guarda(f.pts, { altura: H });
        if (g) { g.guarda.host = { id: String(c.id), lado: f.lado, ordem: f.ordem }; ops.push({ op: "criar", id: novoId("gc-" + c.id), caixa: BA.paraOp(g) }); }
      });
      out.push({ codigo: "ESQ_GUARDA_ESCADA", gravidade: "erro", nivel: NORMA.nivel, titulo: (c.tipo === "escada" ? "Escada" : "Rampa") + " " + c.id + ": lado " + faltam.map(function (f) { return f.lado; }).join(" e ") + " livre, sem guarda-corpo (desnível de " + f2(num(par.desnivel, 0)) + " m)",
        texto: "Escada ou rampa com desnível maior que " + f2(D1) + " m e lado livre exige guarda-corpo (NBR 14718, " + NORMA.desnivelObrigatorio.item + "; rampa de até 30° é isenta). H ≥ " + f2(H) + " m, vão-luz ≤ " + f2(NORMA.vaoLuz.valor) + " m e, na zona dos degraus, último elemento a ≤ " + f2(NORMA.escada.ultimoElemento) + " m da aresta (" + NORMA.escada.item + "). " + textoCarga + " Fonte: " + citeNorma + ".",
        pecas: [String(c.id)], solucoes: ops.length ? [{ id: "lancar", texto: "Lançar o guarda-corpo " + (faltam.length > 1 ? "dos dois lados" : "do lado " + faltam[0].lado) + " acompanhando a escada", ops: ops }] : [{ id: "nota-escada", texto: "Lance o guarda-corpo pela lateral da escada (Arquitetura › Guarda-corpo)." }] });
    });
    return out;
  }

  var GuardaCorpo = { NORMA: NORMA, MODOS: MODOS, MODULO_MAX: MODULO_MAX, carga: carga, cargaFormulas: cargaFormulas, barras: barras, modulos: modulos, sinapiDe: sinapiDe, precoRef: precoRef,
    opsGuarda: opsGuarda, conferirPeca: conferirPeca, auditar: auditar };
  global.GuardaCorpo = GuardaCorpo;
  if (typeof module !== "undefined" && module.exports) module.exports = GuardaCorpo;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
