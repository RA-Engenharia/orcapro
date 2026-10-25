/* =====================================================================
 * bimcobertura.js — COBERTURA COMPLETA: PLATIBANDA, RUFO DE CAPA, CONTRA-RUFO,
 * CALHA EMBUTIDA, CONDUTORES (descidas), seção da calha pela NBR 10844 e o
 * QUANTITATIVO de tudo que está em cima da laje. Motor PURO (ES5, Node).
 *
 * Pedido do engenheiro (19/10/2026): "se tem telhado, quero que seja TUDO que
 * tem no telhado" — residência estilo caixote: platibanda em volta, calha
 * embutida atrás dela, rufo de capa no topo, contra-rufo no encontro com a
 * telha e as descidas. O telhado, as bordas de beiral (calha de beiral,
 * rufo, testeira) e o catálogo de telhas estão no js/bimtelhado.js; a
 * estrutura (terças, vigas) no js/bimtelhadoestrut.js; o forro, a sanca e as
 * luminárias no js/bimforrodrywall.js.
 *
 * AS OPS (validadas no BimEdit.sanear pela extensão registrada no fim):
 *   {op:"platibanda", id, telhado, arestas?:[k…]|null (índices do contorno; padrão todas),
 *    espessura?:m (0,15), altura?:m acima do ponto MAIS ALTO do telhado (0,30),
 *    topo?:cota absoluta, base?:cota (padrão: a cota de apoio do telhado),
 *    rufoCapa?:bool (true), contraRufo?:bool (true), abaRufo?:m de cada lado (0,04), folgaCalha?:m (0,02)}
 *   {op:"calha", id, telhado, arestas:[k…], largura?:m (0,30), altura?:m (0,12), declividadePct?:% (0,5),
 *    laminaMm?:mm, folga?:m — CALHA EMBUTIDA: fica FORA da aresta do telhado, atrás da platibanda
 *    (a calha de BEIRAL é a op `borda` calha do js/bimtelhado.js; as duas entram na lista de calhas)}
 *   {op:"condutor", id, calha:id da calha embutida OU da borda calha, pos?:0..1 ao longo da calha (0,5), dn?:mm,
 *    trecho?:id do trecho "pluvial" do js/biminst.js que É o tubo desta descida (T2: o hidro desenha e quantifica o tubo)}
 *   {op:"rufo", id, telhado, material?:"galv24"|"galv26"|"aluminio", corteRufo?:m, corteContra?:m, folga?:m — T2: rufo e
 *    contrarrufo em TODO encontro do contorno com parede mais alta que a telha, achado pela geometria a cada replay}
 *   T2 — gerarPluvial(ops, cfg): o LOTE "tel-calha-lote" que gera e dimensiona pela NBR 10844 (calha de beiral, seção da calha,
 *    descidas, trechos pluviais do hidro, rufo de encontro) com a cidade do endereço da obra. A ponta de baixo de cada descida
 *    fica como ESPERA PLUVIAL no piso: o condutor horizontal e a caixa de areia são do projeto hidrossanitário (o js/biminst.js
 *    não foi alterado; os trechos são ops "trecho" comuns dele).
 *   apagar com o id de qualquer uma também passa aqui. Sem lista dentro de lista (a nuvem recusa).
 *
 * O ESTADO (só quando há op dessas — o estado das ops antigas fica igual):
 *   platibandas, calhasEmbutidas, condutores, rufosEncontro — ver calcularPlatibanda / calcularCalha / calcularCondutor / calcularRufo.
 *
 * REGRAS (escritas porque dão o número):
 *   · A platibanda fica FORA do contorno do telhado (o contorno é a face de dentro dela) e sobe da `base` até o
 *     topo; a aresta que tem calha embutida afasta a platibanda da largura da calha + folga.
 *   · O rufo de capa tem corte = espessura + 2 × aba, escolhido entre os cortes que a SINAPI tem (chapim: só 33 cm);
 *     o que não cabe fica "orçar à parte" — nunca um código parecido.
 *   · A calha de chapa tem desenvolvimento = largura + 2 × altura, escolhido entre os da SINAPI (33, 50, 100 cm).
 *   · A seção da calha pela NBR 10844 NÃO é reescrita aqui: dimensionarCalhas() monta a entrada do js/hidap.js
 *     (HidAP.calcular, tabelas do HidNormas) — cidade fora da Tabela 5 da norma = PENDENTE, nunca um padrão.
 *   · Valor sem fonte (altura da platibanda, aba do rufo, folga) é PARÂMETRO ADOTADO e aparece como tal.
 *
 * Teste: o teste da cobertura completa, em tools/ (unidade) e a e2e da mesma frente; T2: node tools/test-telhado-t2-pluvial.js.
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
  function temChave(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
  function obj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
  function idOk(v) { return (typeof v === "string" && v.length > 0 && v.length <= 120) || fin(v); }
  function virg(v, c) { return (Math.round(v * Math.pow(10, c == null ? 2 : c)) / Math.pow(10, c == null ? 2 : c)).toFixed(c == null ? 2 : c).replace(".", ","); }
  function BT() { return dep("BimTelhado", "./bimtelhado.js"); }

  /* ------------------------------------------------------------ SINAPI
     Códigos da base do sistema (data/sinapi-MG-analitico.json e sinapi-MG-2026-06.json, 06/2026): o
     o teste da cobertura completa (tools/) confere CADA um contra a base — código que sair dela reprova o teste.
     Sem código aqui = "orçar à parte". `aprox`: a composição é a mais próxima, não a exata. */
  var SINAPI = {
    base: "SINAPI 06/2026 (MG)",
    telhaFibroAte10: { cod: "94210", un: "M2", desc: "TELHAMENTO COM TELHA ONDULADA DE FIBROCIMENTO E = 6 MM, COM RECOBRIMENTO LATERAL DE 1 1/4 DE ONDA PARA TELHADO COM INCLINAÇÃO MÁXIMA DE 10°" },
    telhaFibroAcima10: { cod: "94207", un: "M2", desc: "TELHAMENTO COM TELHA ONDULADA DE FIBROCIMENTO E = 6 MM, COM RECOBRIMENTO LATERAL DE 1/4 DE ONDA PARA TELHADO COM INCLINAÇÃO MAIOR QUE 10°" },
    telhaSanduiche: { cod: "94216", un: "M2", aprox: true, desc: "TELHAMENTO COM TELHA METÁLICA TERMOACÚSTICA E = 30 MM, COM ATÉ 2 ÁGUAS, INCLUSO IÇAMENTO", obs: "composição de telha termoacústica 30 mm: o acréscimo da face inferior efeito madeira fica à parte" },
    cumeeiraFibro: { cod: "94223", un: "M", desc: "CUMEEIRA PARA TELHA DE FIBROCIMENTO ONDULADA E = 6 MM, INCLUSO ACESSÓRIOS DE FIXAÇÃO E IÇAMENTO" },
    tramaAcoTercas: { cod: "104314", un: "KG", desc: "TRAMA DE AÇO COMPOSTA POR TERÇAS PARA TELHADOS DE ATÉ 2 ÁGUAS PARA TELHA ONDULADA DE FIBROCIMENTO, METÁLICA, PLÁSTICA OU TERMOACÚSTICA, INCLUSO TRANSPORTE VERTICAL (EM KG). EXCLUSIVE PINTURA" },
    tramaMadeiraTercas: { cod: "92543", un: "M2", desc: "TRAMA DE MADEIRA COMPOSTA POR TERÇAS PARA TELHADOS DE ATÉ 2 ÁGUAS PARA TELHA ONDULADA DE FIBROCIMENTO, METÁLICA, PLÁSTICA OU TERMOACÚSTICA, INCLUSO TRANSPORTE VERTICAL" },
    pontaletesMadeira: { cod: "100382", un: "M2", desc: "FABRICAÇÃO E INSTALAÇÃO DE PONTALETES DE MADEIRA NÃO APARELHADA PARA TELHADOS COM ATÉ 2 ÁGUAS E COM TELHA ONDULADA DE FIBROCIMENTO, ALUMÍNIO OU PLÁSTICA EM EDIFÍCIO RESIDENCIAL TÉRREO/SOBRADO, INCLUSO TRANSPORTE VERTICAL" },
    chapim33: { cod: "101979", un: "M", desc: "CHAPIM (RUFO CAPA) EM AÇO GALVANIZADO, CORTE 33" },
    rufo25: { cod: "94231", un: "M", desc: "RUFO EM CHAPA DE AÇO GALVANIZADO NÚMERO 24, CORTE DE 25 CM, INCLUSO TRANSPORTE VERTICAL" },
    rufo33: { cod: "100327", un: "M", desc: "RUFO EXTERNO/INTERNO EM CHAPA DE AÇO GALVANIZADO NÚMERO 26, CORTE DE 33 CM, INCLUSO IÇAMENTO" },
    calha33: { cod: "94227", un: "M", desc: "CALHA EM CHAPA DE AÇO GALVANIZADO NÚMERO 24, DESENVOLVIMENTO DE 33 CM, INCLUSO TRANSPORTE VERTICAL" },
    calha50: { cod: "94228", un: "M", desc: "CALHA EM CHAPA DE AÇO GALVANIZADO NÚMERO 24, DESENVOLVIMENTO DE 50 CM, INCLUSO TRANSPORTE VERTICAL" },
    calha100: { cod: "94229", un: "M", desc: "CALHA EM CHAPA DE AÇO GALVANIZADO NÚMERO 24, DESENVOLVIMENTO DE 100 CM, INCLUSO TRANSPORTE VERTICAL" },
    calhaPvc125: { cod: "100434", un: "M", desc: "CALHA DE BEIRAL, SEMICIRCULAR DE PVC, DIAMETRO 125 MM, INCLUINDO CABECEIRAS, EMENDAS, BOCAIS, SUPORTES E VEDAÇÕES, EXCLUINDO CONDUTORES, INCLUSO TRANSPORTE VERTICAL" }
  };
  var CORTES_CAPA = [{ corte: 0.33, ref: "chapim33" }];
  var CORTES_RUFO = [{ corte: 0.25, ref: "rufo25" }, { corte: 0.33, ref: "rufo33" }];
  var DESENV_CALHA = [{ dev: 0.33, ref: "calha33" }, { dev: 0.50, ref: "calha50" }, { dev: 1.00, ref: "calha100" }];
  function sin(ref) { var s = SINAPI[ref]; return s ? { codigo: s.cod, un: s.un, descricao: s.desc, base: SINAPI.base, aproximado: !!s.aprox, obs: s.obs || null } : null; }
  function escolher(tab, necessario, campo) {
    for (var i = 0; i < tab.length; i++) if (tab[i][campo] >= necessario - 1e-9) return tab[i];
    return null;
  }

  var LIM = { esp: [0.05, 1], altura: [0, 5], topo: [-100, 10000], aba: [0, 0.3], folga: [0, 0.5], calhaLarg: [0.05, 1.5], calhaAlt: [0.03, 0.6], decl: [0, 10], lamina: [10, 500], dn: [40, 400], vertices: 200 };
  var PADRAO = { espessura: 0.15, altura: 0.30, aba: 0.04, folga: 0.02, calhaLargura: 0.30, calhaAltura: 0.12, declividadePct: 0.5, dn: 100, corteContraRufo: 0.25 };

  /* ------------------------------------------------------------ geometria plana */
  function distP(a, b) { var dx = a.x - b.x, dz = a.z - b.z; return Math.sqrt(dx * dx + dz * dz); }
  /* o comprimento de um trecho de calha: com `len` (a calha na cota certa) é o da LINHA DA BORDA DA TELHA — não depende da largura da calha, então a
     posição de uma descida (fração do comprimento) não anda quando a seção muda; sem `len`, o comprimento do próprio trecho */
  function Lseg(s) { return fin(s && s.len) ? s.len : distP(s.a, s.b); }
  function areaQ(Q) { var s = 0; for (var i = 0, n = Q.length; i < n; i++) { var a = Q[i], b = Q[(i + 1) % n]; s += a.x * b.z - b.x * a.z; } return Math.abs(s) / 2; }
  function pt(p) { return { x: r6(p[0]), z: r6(p[1]) }; }

  /* o contorno da parede (anti-horário) de um telhado calculado + o mapa orig → k */
  function contornoDe(t) {
    var P = arr(t.arestasCalc).map(function (e) { return [e.parede.a.x, e.parede.a.z]; }), porOrig = {};
    arr(t.arestasCalc).forEach(function (e, k) { porOrig[e.orig] = k; });
    return { P: P, porOrig: porOrig };
  }
  /* os k das arestas pedidas (null/[] = todas); as que não existem viram aviso */
  function selecionar(t, origs, avisos) {
    var C = contornoDe(t), n = C.P.length, sel = [];
    for (var k = 0; k < n; k++) sel.push(false);
    if (!arr(origs).length) { for (var i = 0; i < n; i++) sel[i] = true; return { sel: sel, C: C }; }
    arr(origs).forEach(function (o) {
      var k = C.porOrig[Number(o)];
      if (k == null) { avisos.push("A aresta " + (Number(o) + 1) + " não existe no telhado."); return; }
      sel[k] = true;
    });
    return { sel: sel, C: C };
  }
  /* faixa entre a aresta e a aresta deslocada: quadriláteros por aresta, com esquadria nos cantos (BimTelhado.deslocar) */
  function faixas(P, sel, dIn, dOut) {
    var T = BT(); if (!T || !T.deslocar) return null;
    var n = P.length, di = [], dof = [];
    for (var k = 0; k < n; k++) { di.push(sel[k] ? dIn[k] : 0); dof.push(sel[k] ? dOut[k] : 0); }
    var I = dIn.every(function (v, k) { return !sel[k] || Math.abs(v) < 1e-12; }) ? P.map(function (p) { return [p[0], p[1]]; }) : T.deslocar(P, di);
    var O = T.deslocar(P, dof);
    if (!I || !O) return null;
    var out = [];
    for (var j = 0; j < n; j++) {
      if (!sel[j]) continue;
      var a = I[j], b = I[(j + 1) % n], c = O[(j + 1) % n], d = O[j];
      out.push({ k: j, a: pt(a), b: pt(b), quad: [pt(a), pt(b), pt(c), pt(d)] });
    }
    return out;
  }

  /* ============================================================ N23 (23/10/2026) — HERANÇA DA PAREDE DE BAIXO E COTA DA CALHA
     Pedido do Rogério: a platibanda nasce com o MESMO material (tipo/camadas/acabamento) e o MESMO alinhamento (face/eixo e
     espessura) da parede em que assenta; se a parede muda, ela acompanha (tudo é refeito a cada replay a partir das paredes);
     o telhado recua até a face de dentro dela (sem beiral onde há platibanda) e a calha fica encostada. A calha sai na cota
     certa em relação à borda da telha: a telha entra na calha, o fundo cai com a declividade da NBR 10844 até o bocal e o bocal é
     o topo do condutor vertical. Cada constante abaixo diz de onde vem — o que é só adotado diz que é adotado. */
  var AVANCO_TELHA = 0.05;     /* a telha avança ≥ 5 cm DENTRO da calha — ficha técnica de calha PVC Wavin (docs/telhado/PADROES-TELHADO.md §5.3); a Eternit (p. 36) dá balanço de 10 a 25 cm com calha para a ondulada de fibrocimento */
  var FOLGA_VERTICAL = 0.02;   /* a borda da calha fica 2 cm abaixo da face de baixo da telha: ADOTADO (já era o valor da calha embutida antes do N23) */
  var DECL_MIN_CALHA_PCT = 0.5; /* ABNT NBR 10844:1989, item 5.5.2 — mesmo valor que o HidNormas devolve em ap.calha.declividade_minima (o gerarPluvial lê de lá) */

  /* a normal EXTERNA (para fora do contorno anti-horário) da aresta A→B: (ez, −ex) */
  function geoAresta(A, B) {
    var ex = B[0] - A[0], ez = B[1] - A[1], L = Math.sqrt(ex * ex + ez * ez);
    if (!(L > 1e-9)) return null;
    return { ex: ex / L, ez: ez / L, nx: ez / L, nz: -ex / L, L: L };
  }
  /* AS PAREDES DE BAIXO de uma aresta do contorno: paralelas (≤ ~3°), com o corpo a até meia espessura + 25 cm da linha da aresta
     e cobrindo ao menos 5 cm dela. `dc` = quanto o MEIO do corpo da parede fica para FORA da linha da aresta (negativo = para dentro).
     Parede em arco (curva) entra com `curva:true`: herda tipo e espessura, mas a posição fica a da corda (a platibanda é reta). */
  function paredesDaAresta(caixas, A, B, folgaExtra) {
    var G = geoAresta(A, B), out = [];
    if (!G) return out;
    arr(caixas).forEach(function (c) {
      if (!c || c.tipo !== "parede") return;
      var th = num(c.rotY, 0), ux = Math.cos(th), uz = -Math.sin(th), Lw = num(c.comprimento, 0), t = num(c.espessura, 0), cx = num(c.cx, NaN), cz = num(c.cz, NaN);
      if (!(Lw > 0 && t > 0 && isFinite(cx) && isFinite(cz))) return;
      if (Math.abs(G.ex * uz - G.ez * ux) > 0.05) return;
      var dc = (cx - A[0]) * G.nx + (cz - A[1]) * G.nz;
      if (Math.abs(dc) > t / 2 + 0.25 + num(folgaExtra, 0)) return;   /* o contorno pode estar a uma calha de distância da parede */
      var s0 = (cx - ux * Lw / 2 - A[0]) * G.ex + (cz - uz * Lw / 2 - A[1]) * G.ez, s1 = (cx + ux * Lw / 2 - A[0]) * G.ex + (cz + uz * Lw / 2 - A[1]) * G.ez;
      var lo = Math.max(0, Math.min(s0, s1)), hi = Math.min(G.L, Math.max(s0, s1));
      if (hi - lo < 0.05) return;
      /* a normal da face "fora" da parede (w < 0 do corpo: −(sen θ, cos θ); "Inverter faces" troca) e se ela olha para fora da casa */
      var fx = -Math.sin(th), fz = -Math.cos(th); if (c.inverterFaces) { fx = -fx; fz = -fz; }
      out.push({ caixa: c, id: c.id, dc: dc, t: t, trecho: hi - lo, curva: !!c.arco, foraParaFora: (fx * G.nx + fz * G.nz) > 0 });
    });
    return out;
  }
  /* a que domina a aresta (a de maior trecho), se cobre ao menos 25 % dela */
  function paredeDominante(lista, L) {
    var m = null;
    arr(lista).forEach(function (h) { if (!m || h.trecho > m.trecho + 1e-9) m = h; });
    return m && m.trecho >= Math.max(0.25, 0.25 * L) ? m : null;
  }
  /* a largura da calha que ocupa lugar ao lado da platibanda (com `cotaAuto` a telha avança dentro dela) */
  function larguraDaCalha(c) {
    var l = fin(Number(c && c.largura)) ? Number(c.largura) : PADRAO.calhaLargura;
    return c && c.cotaAuto === true ? Math.max(0, l - AVANCO_TELHA) : l;
  }
  /* quanto o contorno do telhado tem de andar (positivo = para fora) para a face de dentro da platibanda herdada ficar
     `calha embutida` adiante dele: dc − t/2 − afastamento. `herd` = true (todas as arestas) | { origDaAresta: true }. */
  function recuosHerdados(t, caixas, ctxCob, herd) {
    var out = {}, avisos = [], sem = [];
    if (!t || !t.ok || !herd) return { recuo: out, avisos: avisos };
    var chs = calhasEmbDoTelhado(ctxCob, t.id);
    arr(t.arestasCalc).forEach(function (e) {
      if (!(herd === true || herd[e.orig])) return;
      var A = [e.parede.a.x, e.parede.a.z], B = [e.parede.b.x, e.parede.b.z], G = geoAresta(A, B); if (!G) return;
      var af = 0;
      chs.forEach(function (c) { if (arr(c.arestas).some(function (o) { return Number(o) === e.orig; })) af = Math.max(af, larguraDaCalha(c)); });
      var h = paredeDominante(paredesDaAresta(caixas, A, B, af), G.L);
      if (!h) { sem.push(e.orig + 1); return; }
      if (h.curva) return;
      var d = h.dc - h.t / 2 - af;
      if (Math.abs(d) > 1e-4) out[e.orig] = r6(d);
    });
    if (sem.length) avisos.push("Platibanda herdada: a(s) aresta(s) " + sem.join(", ") + " não tem(êm) parede embaixo — fica(m) com a espessura padrão, no contorno do telhado.");
    return { recuo: out, avisos: avisos };
  }

  /* ============================================================ PLATIBANDA */
  function calhasEmbDoTelhado(ctxCob, id) {
    var out = [];
    arr(ctxCob && ctxCob.ordCalha).forEach(function (cid) { var c = ctxCob.calha[cid]; if (c && String(c.telhado) === String(id)) out.push(c); });
    return out;
  }
  function calcularPlatibanda(f, telhados, ctxCob, caixas) {
    var p = clone(f), avisos = [], t = telhados[String(f.telhado)];
    p.tipo = "platibanda"; p.ifc = "IFCWALL"; p.ok = false; p.segs = []; p.comprimento = 0; p.area = 0; p.areaFaces = 0; p.volume = 0;
    var herdar = f.herdar === true;
    if (herdar) p.herdar = true; else delete p.herdar;
    p.espessuraEf = fin(Number(f.espessura)) ? Number(f.espessura) : PADRAO.espessura;
    p.abaRufoEf = fin(Number(f.abaRufo)) ? Number(f.abaRufo) : PADRAO.aba;
    p.rufoCapaAtivo = f.rufoCapa !== false; p.contraRufoAtivo = f.contraRufo !== false;
    if (!t) { avisos.push("O telhado desta platibanda não existe mais."); p.avisos = avisos; return p; }
    if (!t.ok || t.modo !== "perimetro") { avisos.push("A platibanda segue o contorno do telhado por perímetro que fechou."); p.avisos = avisos; return p; }
    var S = selecionar(t, f.arestas, avisos), P = S.C.P, n = P.length;
    /* N23: a platibanda HERDADA não tem folga com a calha (ela assenta na parede; a calha encosta nela) */
    var folga = fin(Number(f.folgaCalha)) ? Number(f.folgaCalha) : (herdar ? 0 : PADRAO.folga), dIn = [], dOut = [], afast = [], esps = [], heran = [], heranL = [], k, ch = calhasEmbDoTelhado(ctxCob, f.telhado), semParede = [], mistas = [], parciais = [], curvas = [];
    for (k = 0; k < n; k++) {
      var a = 0;
      ch.forEach(function (c) { arr(c.arestas).forEach(function (o) { if (S.C.porOrig[Number(o)] === k) a = Math.max(a, larguraDaCalha(c) + folga); }); });   /* REVISOR N23: também na platibanda antiga — a calha na cota certa (telha 5 cm dentro) ficava 5 cm longe dela; sem cotaAuto é a largura, como era */
      afast.push(a);
      var h = null;
      if (herdar && S.sel[k]) {
        var G = geoAresta(P[k], P[(k + 1) % n]);
        var lst = G ? paredesDaAresta(caixas, P[k], P[(k + 1) % n], a) : [];
        h = G ? paredeDominante(lst, G.L) : null;
        if (!h) semParede.push(t.arestasCalc[k].orig + 1);
        else {
          /* REVISOR N23: duas paredes diferentes (tipo ou espessura) sob a mesma aresta — a forma segue a dominante, mas cada uma é orçada pelo trecho dela;
             parede que não cobre a aresta toda e parede curva (a platibanda fica reta pela corda) também são ditas, nunca caladas */
          heranL[k] = lst;
          var cob = 0; lst.forEach(function (w) { cob += w.trecho; });
          if (lst.some(function (w) { return Math.abs(w.t - h.t) > 1e-4 || txt(w.caixa.tipoParede && w.caixa.tipoParede.rotulo) !== txt(h.caixa.tipoParede && h.caixa.tipoParede.rotulo); }))
            mistas.push({ aresta: t.arestasCalc[k].orig + 1, paredes: lst.map(function (w) { return w.id + " (" + (w.caixa.tipoParede ? w.caixa.tipoParede.rotulo : "sem tipo") + ", " + virg(w.t * 100, 0) + " cm)"; }), segue: h.id, ids: lst.map(function (w) { return w.id; }) });
          if (cob < G.L - 0.10) parciais.push({ aresta: t.arestasCalc[k].orig + 1, coberto: r4(Math.min(cob, G.L)), L: r4(G.L), ids: lst.map(function (w) { return w.id; }) });
          if (lst.some(function (w) { return w.curva; })) curvas.push({ aresta: t.arestasCalc[k].orig + 1, ids: lst.filter(function (w) { return w.curva; }).map(function (w) { return w.id; }) });
        }
      }
      if (h && !h.curva) { dIn.push(h.dc - h.t / 2); dOut.push(h.dc + h.t / 2); esps.push(h.t); }
      else { dIn.push(a); dOut.push(a + (h ? h.t : p.espessuraEf)); esps.push(h ? h.t : p.espessuraEf); }
      heran.push(h);
    }
    if (semParede.length) avisos.push("Platibanda herdada: a(s) aresta(s) " + semParede.join(", ") + " não tem(êm) parede embaixo — espessura padrão de " + virg(p.espessuraEf * 100, 0) + " cm, no contorno do telhado.");
    mistas.forEach(function (m) { avisos.push("Platibanda herdada: a aresta " + m.aresta + " tem paredes diferentes embaixo (" + m.paredes.join("; ") + ") — a platibanda segue a posição e a espessura da " + m.segue + " na aresta toda; as camadas são orçadas pelo trecho de cada parede."); });
    parciais.forEach(function (m) { avisos.push("Platibanda herdada: a parede de baixo cobre só " + virg(m.coberto) + " dos " + virg(m.L) + " m da aresta " + m.aresta + " — a platibanda corre a aresta toda (confira o trecho sem parede)."); });
    curvas.forEach(function (m) { avisos.push("Platibanda herdada: a parede " + m.ids.join(", ") + " da aresta " + m.aresta + " é curva — a platibanda fica reta, pela corda (herda o tipo e a espessura, não a curva)."); });
    if (mistas.length || parciais.length || curvas.length) p.herancaParcial = { mistas: mistas, parciais: parciais, curvas: curvas };
    var F = faixas(P, S.sel, dIn, dOut);
    if (!F || !F.length) { avisos.push("Nenhuma aresta válida para a platibanda."); p.avisos = avisos; return p; }
    var base = fin(Number(f.base)) ? Number(f.base) : num(t.cotaApoio, 0);
    var topo = fin(Number(f.topo)) ? Number(f.topo) : num(t.cotaCumeeira, base) + num(t.espessura, 0) + (fin(Number(f.altura)) ? Number(f.altura) : PADRAO.altura);
    if (!(topo > base + 0.01)) { avisos.push("O topo da platibanda (" + virg(topo) + " m) não fica acima da base (" + virg(base) + " m)."); p.avisos = avisos; return p; }
    var H = topo - base, L = 0, vol = 0, quadsA = 0, espMax = 0;
    F.forEach(function (s) {
      var Lm = (distP(s.a, s.b) + distP(s.quad[3], s.quad[2])) / 2;
      s.orig = t.arestasCalc[s.k].orig; s.afastamento = r4(afast[s.k]); s.comprimento = r6(distP(s.a, s.b)); s.comprimentoMeio = r6(Lm);
      if (herdar) { s.espessura = r6(esps[s.k]); if (s.espessura > espMax) espMax = s.espessura; }   /* REVISOR N23: campo novo só na herdada (a op antiga sai byte a byte igual) */
      L += s.comprimento; vol += areaQ(s.quad) * H; quadsA += areaQ(s.quad);
    });
    if (herdar) p.espessuraEf = espMax;   /* a mais grossa manda no corte do rufo (o preço mais alto, na dúvida) */
    p.segs = F; p.base = r6(base); p.topo = r6(topo); p.altura = r6(H); p.comprimento = r6(L);
    p.area = r4(L * H); p.areaFaces = r4(2 * L * H); p.volume = r4(vol); p.areaTopo = r4(quadsA);
    if (herdar) herancaDaParede(p, F, heran, P, H, heranL);
    /* RUFO DE CAPA: no topo, corte = espessura + 2 × aba */
    var necC = p.espessuraEf + 2 * p.abaRufoEf, LC = 0;
    F.forEach(function (s) { LC += s.comprimentoMeio; });
    var cc = escolher(CORTES_CAPA, necC, "corte");
    p.rufoCapa = p.rufoCapaAtivo ? { comprimento: r4(LC), corteNecessarioM: r4(necC), corteM: cc ? cc.corte : null, sinapi: cc ? sin(cc.ref) : null,
                                      obs: cc ? "corte " + Math.round(cc.corte * 100) + " cm (necessário " + Math.round(necC * 100) + " cm)" : "nenhum corte de chapim na SINAPI cobre " + Math.round(necC * 100) + " cm: orçar à parte" } : null;
    /* CONTRA-RUFO: no encontro com a telha, na face de dentro (a aresta com calha embutida leva o seu próprio, na face de dentro da platibanda) */
    var LK = 0; F.forEach(function (s) { LK += s.comprimento; });
    var ck = escolher(CORTES_RUFO, PADRAO.corteContraRufo, "corte");
    p.contraRufo = p.contraRufoAtivo ? { comprimento: r4(LK), corteM: ck ? ck.corte : null, corteAdotado: true, sinapi: ck ? sin(ck.ref) : null,
                                          obs: "corte " + Math.round(PADRAO.corteContraRufo * 100) + " cm ADOTADO (a conferir no detalhe do encontro com a telha)" } : null;
    p.ok = true;
    if (avisos.length) p.avisos = avisos;
    return p;
  }
  /* N23: o que a platibanda herdou da(s) parede(s) de baixo — tipo (camadas e acabamento), espessura e posição por trecho, e as
     camadas em m² por face física (para orçar como a parede), no mesmo formato do BimArq.camadasDe. */
  function herancaDaParede(p, F, heran, P, H, heranL) {
    var mapa = {}, ordem = [], ids = {}, tpDom = null, domL = 0, n = P.length;
    F.forEach(function (s) {
      var h = heran[s.k]; if (!h) return;
      ids[h.id] = 1;
      var G = geoAresta(P[s.k], P[(s.k + 1) % n]), tp = h.caixa.tipoParede;
      s.heranca = { parede: h.id, espessura: r6(h.t), deslocamentoDoEixo: r6(h.dc), curva: !!h.curva, tipo: tp ? tp.rotulo : null, linhaLoc: h.caixa.linhaLoc != null ? h.caixa.linhaLoc : null, foraParaFora: h.foraParaFora };
      if (tp && s.comprimento > domL) { domL = s.comprimento; tpDom = tp; }
      var Lin = s.comprimento, Lout = r6(distP(s.quad[3], s.quad[2])), Lmeio = s.comprimentoMeio;
      /* REVISOR N23: com mais de uma parede sob a aresta, cada uma leva a fração dela (pelo trecho que cobre) — antes a dominante levava a aresta toda
         (a metade de bloco de concreto 30 cm saía orçada como bloco cerâmico 20) */
      var ws = arr(heranL && heranL[s.k]).filter(function (w) { return w.trecho > 0; }), somaT = 0;
      if (!ws.length) ws = [h];
      ws.forEach(function (w) { somaT += w.trecho; });
      ws.forEach(function (w) {
        var fr = ws.length === 1 || !(somaT > 0) ? 1 : w.trecho / somaT, tw = w.caixa.tipoParede; ids[w.id] = 1;
        arr(tw && tw.camadas).forEach(function (kc) {
          /* a camada "fora" da parede vai na face que olha para o mesmo lado dela; a de "dentro", na outra */
          var Lf = (kc.face === "nucleo" ? Lmeio : ((kc.face === "fora") === w.foraParaFora ? Lout : Lin)) * fr;
          var chave = kc.face + "|" + kc.rotulo + "|" + txt(kc.servico), g = mapa[chave];
          if (!g) { g = mapa[chave] = { id: kc.id, rotulo: kc.rotulo, face: kc.face, servico: kc.servico, e: kc.e, material: kc.material || "", area: 0, volume: 0 }; ordem.push(chave); }
          g.area += Lf * H; g.volume += Lf * H * num(kc.e, 0);
        });
      });
    });
    p.paredesBase = Object.keys(ids);
    p.tipoParede = tpDom ? clone(tpDom) : null;
    p.camadas = ordem.map(function (c) { var g = mapa[c]; return { id: g.id, rotulo: g.rotulo, face: g.face, servico: g.servico, e: g.e, material: g.material, area: r4(g.area), volume: r6(g.volume) }; });
    p.heranca = { paredes: p.paredesBase.slice(), tipo: tpDom ? tpDom.rotulo : null, espessuras: F.map(function (s) { return s.espessura; }) };
  }

  /* ============================================================ CALHA EMBUTIDA */
  function desenvolvimentoCalha(largura, altura) { return r4(largura + 2 * altura); }
  function calcularCalha(f, telhados) {
    var c = clone(f), avisos = [], t = telhados[String(f.telhado)];
    c.tipo = "calha"; c.tipoCalha = "embutida"; c.ifc = "IFCPIPESEGMENT"; c.ifcPre = "GUTTER"; c.ok = false; c.segs = []; c.comprimento = 0;
    c.larguraEf = fin(Number(f.largura)) ? Number(f.largura) : PADRAO.calhaLargura;
    c.alturaEf = fin(Number(f.altura)) ? Number(f.altura) : PADRAO.calhaAltura;
    c.declividadeEf = fin(Number(f.declividadePct)) ? Number(f.declividadePct) : PADRAO.declividadePct;
    if (!t) { avisos.push("O telhado desta calha não existe mais."); c.avisos = avisos; return c; }
    if (!t.ok || t.modo !== "perimetro") { avisos.push("A calha embutida segue o contorno do telhado por perímetro que fechou."); c.avisos = avisos; return c; }
    var S = selecionar(t, f.arestas, avisos), P = S.C.P, n = P.length, k;
    for (k = 0; k < n; k++) {
      if (!S.sel[k]) continue;
      var e = t.arestasCalc[k];
      if (!e.define) { avisos.push("A aresta " + (e.orig + 1) + " não define inclinação (é oitão): a calha vai no beiral, onde a água sai."); S.sel[k] = false; }
    }
    /* N23: com `cotaAuto` a telha AVANÇA dentro da calha (AVANCO_TELHA): a calha vai de −avanço a largura−avanço contado da borda da telha */
    if (f.cotaAuto === true) c.cotaAuto = true; else delete c.cotaAuto;   /* o estado das ops antigas sai byte a byte igual */
    var dIn0 = c.cotaAuto ? -Math.min(AVANCO_TELHA, c.larguraEf) : 0, dOut = []; for (k = 0; k < n; k++) dOut.push(c.larguraEf + dIn0);
    var F = faixas(P, S.sel, P.map(function () { return dIn0; }), dOut);
    if (!F || !F.length) { avisos.push("Nenhuma aresta válida para a calha."); c.avisos = avisos; return c; }
    var L = 0;
    F.forEach(function (s) {
      var e = t.arestasCalc[s.k];
      s.orig = e.orig; s.comprimento = r6(distP(s.a, s.b));
      if (c.cotaAuto) s.ref = r6(Math.sqrt(Math.pow(P[s.k][0] - P[(s.k + 1) % n][0], 2) + Math.pow(P[s.k][1] - P[(s.k + 1) % n][1], 2)));   /* a aresta da telha: referência da posição das descidas */
      /* a linha do MEIO da calha (onde a descida fica) */
      s.ma = { x: r6((s.quad[0].x + s.quad[3].x) / 2), z: r6((s.quad[0].z + s.quad[3].z) / 2) }; s.mb = { x: r6((s.quad[1].x + s.quad[2].x) / 2), z: r6((s.quad[1].z + s.quad[2].z) / 2) };
      /* a borda da calha fica logo abaixo da face de baixo do telhado na linha do beiral */
      s.yBorda = r6(num(e.alturaBeiral, num(t.cotaApoio, 0)) - FOLGA_VERTICAL);
      s.yFundo = r6(s.yBorda - c.alturaEf);
      L += s.comprimento;
    });
    c.segs = F; c.comprimento = r6(L);
    c.desenvolvimento = desenvolvimentoCalha(c.larguraEf, c.alturaEf);
    var dv = escolher(DESENV_CALHA, c.desenvolvimento, "dev");
    c.sinapi = dv ? sin(dv.ref) : null;
    c.obsSinapi = dv ? "desenvolvimento " + Math.round(dv.dev * 100) + " cm (necessário " + Math.round(c.desenvolvimento * 100) + " cm)" : "nenhum desenvolvimento de calha de chapa na SINAPI cobre " + Math.round(c.desenvolvimento * 100) + " cm: orçar à parte";
    c.queda = r4(L * c.declividadeEf / 100);
    c.ok = true;
    if (avisos.length) c.avisos = avisos;
    return c;
  }

  /* a lista ÚNICA de calhas do estado: as embutidas (op calha) e as de beiral (op borda calha do js/bimtelhado.js) */
  function listarCalhas(estado) {
    var out = [];
    arr(estado && estado.calhasEmbutidas).forEach(function (c) {
      if (!c || !c.ok) return;
      out.push({ id: c.id, tipo: "embutida", telhado: c.telhado, arestas: arr(c.arestas).slice(), comprimento: c.comprimento, largura: c.larguraEf, altura: c.alturaEf,
                 declividadePct: c.declividadeEf, laminaMm: c.laminaMm != null && fin(Number(c.laminaMm)) ? Number(c.laminaMm) : null, cotaAuto: !!c.perfil,
                 segs: c.perfil ? c.perfil.subs.map(function (s) { return { a: s.a, b: s.b, len: s.len, orig: s.orig, y: s.yb, ya: s.ya, yb: s.yb }; })
                                : c.segs.map(function (s) { return { a: s.ma || s.a, b: s.mb || s.b, orig: s.orig, y: s.yFundo }; }), fonte: c });
    });
    arr(estado && estado.bordas).forEach(function (b) {
      if (!b || !b.ok || b.tipoBorda !== "calha") return;
      out.push({ id: b.id, tipo: "beiral", telhado: b.telhado, arestas: arr(b.arestas).slice(), comprimento: b.comprimento, largura: b.larguraEf, altura: b.alturaEf,
                 declividadePct: b.perfil ? b.perfil.declPct : null, laminaMm: null, cotaAuto: !!b.perfil,
                 segs: b.perfil ? b.perfil.subs.map(function (s) { return { a: s.a, b: s.b, len: s.len, orig: s.orig, y: s.yb, ya: s.ya, yb: s.yb }; })
                                : arr(b.segs).map(function (s) { return { a: { x: s.a.x, z: s.a.z }, b: { x: s.b.x, z: s.b.z }, orig: s.aresta, y: s.a.y }; }), fonte: b });
    });
    return out;
  }

  /* ============================================================ N23: O PERFIL DA CALHA (cota do fundo até o bocal)
     A borda da calha fica numa cota só (FOLGA_VERTICAL abaixo da face de baixo da telha, que entra AVANCO_TELHA na calha); o FUNDO cai com a
     declividade (≥ 0,5 %, NBR 10844 item 5.5.2) até o bocal. A profundidade é a da seção (`altura`) no ponto mais alto — o mais longe de
     qualquer bocal — e cresce `declividade × distância` até o bocal. Calha sem bocal fica sem caimento (e o motor diz). Cada trecho contínuo
     da calha (calha de beiral em duas arestas opostas são dois) tem os seus pontos altos; a calha que dá a volta mede a distância em círculo.
     segs: [{a:{x,z}, b:{x,z}, orig, yRim, ia?, ib?, oa?, ob?}] pelo MEIO da calha, em ordem; o: { altura, declPct, bocais:[0..1 do comprimento total] }.
     → { subs:[{a,b,orig,yRim,ya,yb,ia?,ib?,oa?,ob?}], bocais:[{pos,x,z,y}], semBocal:n, desnivel, comprimento, declPct } — a lista `subs` parte cada trecho nos
     bocais e nos pontos altos, de modo que o fundo é uma reta em cada sub-trecho (o 3D e o ponto do bocal leem daí). */
  function lp(P, Q, u) { return P && Q ? { x: r6(P.x + (Q.x - P.x) * u), z: r6(P.z + (Q.z - P.z) * u) } : null; }
  function perfilCalha(segs, o) {
    var cad = [], tot = 0, k, alt = num(o.altura, 0.12), dec = num(o.declPct, PADRAO.declividadePct);
    for (k = 0; k < segs.length; k++) {
      var s = segs[k], L = Lseg(s), ult = cad[cad.length - 1];
      if (!ult || distP(segs[k - 1].b, s.a) > 0.05) { ult = { itens: [], L: 0, off: tot, bocais: [] }; cad.push(ult); }
      ult.itens.push({ s: s, s0: ult.L, s1: ult.L + L, L: L }); ult.L += L; tot += L;
    }
    cad.forEach(function (c) { c.fechada = c.itens.length > 1 && distP(c.itens[0].s.a, c.itens[c.itens.length - 1].s.b) < 0.05; });
    var semBocal = 0;
    arr(o.bocais).forEach(function (fr) {
      var g = Math.max(0, Math.min(1, num(fr, 0.5))) * tot, ach = null;
      cad.forEach(function (c) { if (!ach && g >= c.off - 1e-9 && g <= c.off + c.L + 1e-9) ach = c; });
      if (ach) ach.bocais.push(Math.max(0, Math.min(ach.L, g - ach.off)));
    });
    var subs = [], bocaisOut = [], desnivel = 0;
    cad.forEach(function (c) {
      c.bocais.sort(function (x, y) { return x - y; });
      var B = c.bocais, nB = B.length;
      function dB(s) { var m = Infinity; B.forEach(function (p) { var d = Math.abs(s - p); if (c.fechada) d = Math.min(d, c.L - d); if (d < m) m = d; }); return m; }
      var altos = [];
      if (nB) {
        if (!c.fechada) { altos.push(0); altos.push(c.L); for (k = 0; k + 1 < nB; k++) altos.push((B[k] + B[k + 1]) / 2); }
        else for (k = 0; k < nB; k++) { var nx = k + 1 < nB ? B[k + 1] : B[0] + c.L; altos.push(((B[k] + nx) / 2) % c.L); }
      } else semBocal++;
      var Dz = 0; altos.forEach(function (h) { Dz = Math.max(Dz, dB(h)); });
      function prof(s) { return nB ? alt + dec / 100 * (Dz - dB(s)) : alt; }
      if (nB) desnivel = Math.max(desnivel, dec / 100 * Dz);
      var quebras = B.concat(altos);
      c.itens.forEach(function (it) {
        var pts = [it.s0, it.s1];
        quebras.forEach(function (q) { var qq = q; if (qq > it.s0 + 1e-6 && qq < it.s1 - 1e-6) pts.push(qq); });
        pts.sort(function (x, y) { return x - y; });
        for (var j = 0; j + 1 < pts.length; j++) {
          if (pts[j + 1] - pts[j] < 1e-6) continue;
          var u0 = it.L > 0 ? (pts[j] - it.s0) / it.L : 0, u1 = it.L > 0 ? (pts[j + 1] - it.s0) / it.L : 1;
          var sb = { a: lp(it.s.a, it.s.b, u0), b: lp(it.s.a, it.s.b, u1), len: r6(it.L * (u1 - u0)), orig: it.s.orig, yRim: it.s.yRim, ya: r6(it.s.yRim - prof(pts[j])), yb: r6(it.s.yRim - prof(pts[j + 1])) };
          if (it.s.ia) { sb.ia = lp(it.s.ia, it.s.ib, u0); sb.ib = lp(it.s.ia, it.s.ib, u1); sb.oa = lp(it.s.oa, it.s.ob, u0); sb.ob = lp(it.s.oa, it.s.ob, u1); }
          subs.push(sb);
        }
      });
      B.forEach(function (p) {
        var it = null; c.itens.forEach(function (x) { if (!it && p >= x.s0 - 1e-9 && p <= x.s1 + 1e-9) it = x; });
        if (!it) return;
        var u = it.L > 0 ? (p - it.s0) / it.L : 0;
        bocaisOut.push({ pos: r6((c.off + p) / (tot || 1)), x: r6(it.s.a.x + (it.s.b.x - it.s.a.x) * u), z: r6(it.s.a.z + (it.s.b.z - it.s.a.z) * u), y: r6(it.s.yRim - prof(p)) });
      });
    });
    return { subs: subs, bocais: bocaisOut, semBocal: semBocal, desnivel: r6(desnivel), comprimento: r6(tot), declPct: dec, altura: alt };
  }
  function bocaisDe(C, calhaId) {
    return arr(C && C.ordCond).map(function (id) { return C.cond[id]; }).filter(function (f) { return f && String(f.calha) === String(calhaId); })
      .map(function (f) { return fin(Number(f.pos)) ? Math.max(0, Math.min(1, Number(f.pos))) : 0.5; });
  }
  function aplicarPerfilEmbutida(c, bocais) {
    var segs = c.segs.map(function (s) { return { a: s.ma, b: s.mb, len: s.ref, orig: s.orig, yRim: s.yBorda, ia: s.quad[0], ib: s.quad[1], oa: s.quad[3], ob: s.quad[2] }; });
    c.perfil = perfilCalha(segs, { altura: c.alturaEf, declPct: c.declividadeEf, bocais: bocais });
    /* REVISOR N23: com o fundo caindo até o bocal a lateral da calha cresce o desnível ali — a chapa é cortada pela MAIOR seção (o preço mais alto,
       na dúvida): calha de 30 m com descidas nas pontas cai 7,4 cm e 150 × 100 vira desenvolvimento de 50 cm, não 35 */
    if (c.perfil && c.perfil.desnivel > 1e-6) {
      c.desenvolvimento = desenvolvimentoCalha(c.larguraEf, c.alturaEf + c.perfil.desnivel);
      var dv = escolher(DESENV_CALHA, c.desenvolvimento, "dev");
      c.sinapi = dv ? sin(dv.ref) : null;
      c.obsSinapi = (dv ? "desenvolvimento " + Math.round(dv.dev * 100) + " cm (necessário " + Math.round(c.desenvolvimento * 100) + " cm" : "nenhum desenvolvimento de calha de chapa na SINAPI cobre " + Math.round(c.desenvolvimento * 100) + " cm") +
                    " no bocal, com o caimento de " + virg(c.perfil.desnivel * 100, 1) + " cm" + (dv ? ")" : ": orçar à parte");
    }
  }
  /* calha de BEIRAL com `cotaAuto`: a calha vai de −avanço a largura−avanço contado da linha do beiral (a borda da telha), com esquadria nos
     cantos (o mesmo deslocamento do contorno que a calha embutida usa); a borda fica FOLGA_VERTICAL abaixo da telha */
  function aplicarPerfilBeiral(b, telhados, bocais) {
    var t = null; arr(telhados).forEach(function (x) { if (x && String(x.id) === String(b.telhado)) t = x; });
    if (!t || !t.ok) return;
    var larg = b.larguraEf, dI = -Math.min(AVANCO_TELHA, larg), dO = larg + dI, n = arr(t.arestasCalc).length, Pb = [], sel = [], porK = {}, k;
    arr(t.arestasCalc).forEach(function (e, kk) { Pb.push([e.beiral.a.x, e.beiral.a.z]); sel.push(false); porK[e.orig] = kk; });
    arr(b.arestas).forEach(function (o) { var kk = porK[Number(o)]; if (kk != null && t.arestasCalc[kk].define) sel[kk] = true; });
    var F = faixas(Pb, sel, Pb.map(function () { return dI; }), Pb.map(function () { return dO; })), quad = {};
    if (!F) return;
    F.forEach(function (f) { quad[f.k] = f.quad; });
    var segs = [];
    arr(b.segs).forEach(function (s) {
      k = porK[s.aresta]; var Q = quad[k]; if (!Q) return;
      var A = Pb[k], B = Pb[(k + 1) % n], dx = B[0] - A[0], dz = B[1] - A[1], L2 = dx * dx + dz * dz; if (!(L2 > 1e-12)) return;
      function u(p) { return Math.max(0, Math.min(1, ((p.x - A[0]) * dx + (p.z - A[1]) * dz) / L2)); }
      var u0 = u(s.a), u1 = u(s.b);
      function en(P0, P1, uu) { return { x: r6(P0.x + (P1.x - P0.x) * uu), z: r6(P0.z + (P1.z - P0.z) * uu) }; }
      var ia = en(Q[0], Q[1], u0), ib = en(Q[0], Q[1], u1), oa = en(Q[3], Q[2], u0), ob = en(Q[3], Q[2], u1);
      segs.push({ a: { x: r6((ia.x + oa.x) / 2), z: r6((ia.z + oa.z) / 2) }, b: { x: r6((ib.x + ob.x) / 2), z: r6((ib.z + ob.z) / 2) }, orig: s.aresta, len: r6(Math.sqrt(Math.pow(s.b.x - s.a.x, 2) + Math.pow(s.b.z - s.a.z, 2))),
                  yRim: r6(Math.min(num(s.a.y, 0), num(s.b.y, 0)) - FOLGA_VERTICAL), ia: ia, ib: ib, oa: oa, ob: ob });
    });
    if (!segs.length) return;
    b.perfil = perfilCalha(segs, { altura: b.alturaEf, declPct: fin(Number(b.declividadePct)) ? Number(b.declividadePct) : PADRAO.declividadePct, bocais: bocais });
  }

  /* ============================================================ CONDUTOR (descida) */
  function pontoNaCalha(cal, pos) {
    var segs = cal.segs, tot = 0, i;
    segs.forEach(function (s) { tot += Lseg(s); });
    if (!(tot > 0)) return null;
    var alvo = Math.max(0, Math.min(1, pos)) * tot, ac = 0;
    for (i = 0; i < segs.length; i++) {
      var s = segs[i], L = Lseg(s);
      if (ac + L >= alvo - 1e-9 || i === segs.length - 1) {
        var u = L > 0 ? Math.max(0, Math.min(1, (alvo - ac) / L)) : 0;
        var yy = fin(s.ya) && fin(s.yb) ? s.ya + (s.yb - s.ya) * u : num(s.y, 0);   /* N23: o fundo cai até o bocal */
        return { x: r6(s.a.x + (s.b.x - s.a.x) * u), z: r6(s.a.z + (s.b.z - s.a.z) * u), y: r6(yy), seg: i, dist: r6(alvo), total: r6(tot) };
      }
      ac += L;
    }
    return null;
  }
  function calcularCondutor(f, calhas, nivelBase) {
    var c = clone(f), avisos = [];
    c.tipo = "condutor"; c.ifc = "IFCPIPESEGMENT"; c.ifcPre = "RAINWATER"; c.ok = false;
    var cal = null; calhas.forEach(function (x) { if (String(x.id) === String(f.calha)) cal = x; });
    c.dnEf = fin(Number(f.dn)) ? Number(f.dn) : null;
    c.dnDesenho = c.dnEf || PADRAO.dn;
    c.posEf = fin(Number(f.pos)) ? Math.max(0, Math.min(1, Number(f.pos))) : 0.5;
    if (!cal) { avisos.push("A calha deste condutor não existe mais."); c.avisos = avisos; return c; }
    var q = pontoNaCalha(cal, c.posEf);
    if (!q) { avisos.push("A calha não tem comprimento."); c.avisos = avisos; return c; }
    c.x = q.x; c.z = q.z; c.yTopo = r6(q.y); c.yBase = r6(nivelBase);
    c.alturaM = r4(Math.max(0, c.yTopo - c.yBase));
    c.distanciaDoInicio = q.dist; c.comprimentoCalha = q.total;
    c.distanciaDaPonta = r4(Math.min(q.dist, q.total - q.dist));
    c.telhado = cal.telhado;
    if (c.dnEf == null) avisos.push("DN do condutor a dimensionar (NBR 10844: o ábaco do condutor vertical não está digitalizado — conferir pelo cálculo pluvial).");
    c.ok = true;
    if (avisos.length) c.avisos = avisos;
    return c;
  }
  /* as ops de condutor para as calhas que ainda não têm nenhum: `n` por calha, igualmente espaçados (padrão 1, no meio) */
  function opsCondutores(estado, opc) {
    opc = opc || {}; var n = Math.max(1, Math.round(num(opc.porCalha, 1))), tem = {}, out = [], seq = 0;
    arr(estado && estado.condutores).forEach(function (c) { tem[String(c.calha)] = true; });
    listarCalhas(estado).forEach(function (cal) {
      if (tem[String(cal.id)]) return;
      for (var i = 0; i < n; i++) out.push({ op: "condutor", id: "cd-" + cal.id + "-" + (++seq), calha: cal.id, pos: r4((i + 0.5) / n) });
    });
    return out;
  }

  /* a base sugerida para a platibanda: o menor topo das paredes que correm junto ao contorno do telhado (a platibanda
     continua a parede); sem parede perto, a cota de apoio do telhado. Nunca acima da cota de apoio. */
  function baseSugerida(estado, telhadoId) {
    var t = null; arr(estado && estado.telhados).forEach(function (x) { if (String(x.id) === String(telhadoId)) t = x; });
    if (!t || !t.ok) return null;
    var C = contornoDe(t), P = C.P, n = P.length, menor = null;
    arr(estado.caixas).forEach(function (c) {
      if (!c || c.tipo !== "parede") return;
      var topo = num(c.cy, 0) + num(c.altura, 0) / 2, th = num(c.rotY, 0), ux = Math.cos(th), uz = -Math.sin(th), L = num(c.comprimento, 0), cx = num(c.cx, 0), cz = num(c.cz, 0);
      for (var i = 0; i < n; i++) {
        var A = P[i], B = P[(i + 1) % n], ex = B[0] - A[0], ez = B[1] - A[1], Le = Math.sqrt(ex * ex + ez * ez); if (!(Le > 1e-6)) continue;
        ex /= Le; ez /= Le;
        if (Math.abs(ux * ez - uz * ex) > 0.05) continue;                                   /* paralela à aresta */
        if (Math.abs((cx - A[0]) * -ez + (cz - A[1]) * ex) > 0.6) continue;                 /* a menos de 60 cm dela */
        var along = (cx - A[0]) * ex + (cz - A[1]) * ez;
        if (along < -L / 2 || along > Le + L / 2) continue;
        if (menor == null || topo < menor) menor = topo;
        break;
      }
    });
    var apoio = num(t.cotaApoio, 0);
    return menor == null ? r6(apoio) : r6(Math.min(menor, apoio));
  }

  /* ============================================================ O QUE A PLANTA PRECISA */
  function resumoDoTelhado(estado, id) {
    var o = { calhas: [], rufos: [], platibandas: [], condutores: [] }, sid = String(id);
    listarCalhas(estado).forEach(function (c) {
      if (String(c.telhado) !== sid) return;
      o.calhas.push({ id: c.id, tipo: c.tipo, aresta: c.arestas.slice(), comprimento: r4(num(c.comprimento, 0)), segs: c.segs.map(function (s) { return { a: { x: s.a.x, z: s.a.z }, b: { x: s.b.x, z: s.b.z } }; }),
                      secao: { largura: c.largura, altura: c.altura }, declividadePct: c.declividadePct });
    });
    arr(estado && estado.platibandas).forEach(function (p) {
      if (!p || !p.ok || String(p.telhado) !== sid) return;
      o.platibandas.push({ id: p.id, espessura: p.espessuraEf, base: p.base, topo: p.topo, comprimento: p.comprimento, afastamento: p.segs.reduce(function (m, s) { return Math.max(m, s.afastamento || 0); }, 0),
                           segs: p.segs.map(function (s) { return { a: { x: s.a.x, z: s.a.z }, b: { x: s.b.x, z: s.b.z } }; }) });
      var meio = p.segs.map(function (s) { return { a: { x: s.quad[3].x, z: s.quad[3].z }, b: { x: s.quad[2].x, z: s.quad[2].z } }; });
      if (p.rufoCapa) o.rufos.push({ id: p.id + "-capa", tipo: "capa", comprimento: p.rufoCapa.comprimento, corteM: p.rufoCapa.corteM, segs: meio });
      if (p.contraRufo) o.rufos.push({ id: p.id + "-contra", tipo: "contra-rufo", comprimento: p.contraRufo.comprimento, corteM: p.contraRufo.corteM,
                                        segs: p.segs.map(function (s) { return { a: { x: s.a.x, z: s.a.z }, b: { x: s.b.x, z: s.b.z } }; }) });
    });
    arr(estado && estado.rufosEncontro).forEach(function (r) {
      if (!r || !r.ok || String(r.telhado) !== sid) return;
      r.encontros.forEach(function (e, i) {
        o.rufos.push({ id: r.id + "-" + i, tipo: e.rufo ? "rufo e contrarrufo" : "contrarrufo", comprimento: e.comprimento, corteM: r.corteRufoEf, segs: e.segs.map(function (s) { return { a: { x: s.fa.x, z: s.fa.z }, b: { x: s.fb.x, z: s.fb.z } }; }) });
      });
    });
    arr(estado && estado.bordas).forEach(function (b) {
      if (!b || !b.ok || String(b.telhado) !== sid || (b.tipoBorda !== "rufo" && b.tipoBorda !== "testeira")) return;
      o.rufos.push({ id: b.id, tipo: b.tipoBorda, comprimento: r4(num(b.comprimento, 0)), corteM: null, segs: arr(b.segs).map(function (s) { return { a: { x: s.a.x, z: s.a.z }, b: { x: s.b.x, z: s.b.z } }; }) });
    });
    arr(estado && estado.condutores).forEach(function (c) {
      if (!c || !c.ok || String(c.telhado) !== sid) return;
      o.condutores.push({ id: c.id, calha: c.calha, x: c.x, z: c.z, dn: c.dnEf, alturaM: c.alturaM });
    });
    return o;
  }

  /* ============================================================ NBR 10844 (reaproveita o js/hidap.js) */
  /* A área de contribuição de cada água pelo caso (b) da Tabela da NBR 10844 (telhado de uma água): A = (a + h/2)·b,
     a = projeção horizontal da inclinação, b = comprimento ao longo do beiral, h = a·i. A água que escorre para a
     calha é a da aresta dela (calhas embutidas e de beiral); telhado com uma só calha leva todas as águas. */
  function aguasDaCalha(estado, cal) {
    var t = null; arr(estado && estado.telhados).forEach(function (x) { if (String(x.id) === String(cal.telhado)) t = x; });
    if (!t || !t.ok) return [];
    var origs = {}; cal.arestas.forEach(function (o) { origs[Number(o)] = true; });
    var out = [], todas = arr(t.aguasCalc);
    todas.forEach(function (ag) {
      if (!(num(ag.inclinacao, 0) > 0)) return;
      var e = ag.aresta >= 0 ? arr(t.arestasCalc)[ag.aresta] : null;
      if (e && origs[e.orig]) out.push(ag);
    });
    return out;
  }
  function areaCasoB(ag) {
    var pl = ag.plano || {}, s = Math.sqrt((pl.bx || 0) * (pl.bx || 0) + (pl.bz || 0) * (pl.bz || 0));
    if (!(s > 1e-9)) return null;
    var ux = pl.bx / s, uz = pl.bz / s, lo = Infinity, hi = -Infinity, tl = Infinity, th = -Infinity;
    arr(ag.pecas).forEach(function (pc) { arr(pc.pts).forEach(function (q) {
      var u = q.x * ux + q.z * uz, w = -q.x * uz + q.z * ux;
      if (u < lo) lo = u; if (u > hi) hi = u; if (w < tl) tl = w; if (w > th) th = w;
    }); });
    var b = th - tl; if (!(b > 0)) return null;
    var a = num(ag.areaProjecao, 0) / b;
    return { a: r4(a), b: r4(b), h: r4(a * s) };
  }
  /* cfg = { cidade, situacao ("cobertura" padrão), periodoRetorno_anos, intensidade_mm_h + fonteIntensidade, postoReferencia + postoConfirmado,
             laminaMm (padrão: metade da altura da calha), material ("chapa_metalica"), calhas:{ idDaCalha:{ declividadePct, laminaMm } } }
     → { ok, status, intensidade, calhas:[…do HidAP], verificacoes, avisos, premissas, pendencias } */
  function entradaPluvial(estado, cfg) {
    cfg = cfg || {};
    var cals = listarCalhas(estado), areas = [], calhas = [], premissas = [], i = 0;
    cals.forEach(function (cal) {
      var ags = aguasDaCalha(estado, cal);
      if (!ags.length) return;
      var ids = [];
      ags.forEach(function (ag) {
        var c = areaCasoB(ag); if (!c) return;
        var aid = "A" + (++i); ids.push(aid);
        areas.push({ id: aid, caso: "b", a: c.a, h: c.h, b: c.b, destino: { calha: String(cal.id) } });
      });
      if (!ids.length) return;
      var propria = cfg.calhas && cfg.calhas[String(cal.id)] || {};
      var altMm = Math.round(cal.altura * 1000), larMm = Math.round(cal.largura * 1000);
      var lam = fin(Number(propria.laminaMm)) ? Number(propria.laminaMm) : (fin(Number(cfg.laminaMm)) ? Number(cfg.laminaMm) : (cal.laminaMm != null ? cal.laminaMm : altMm / 2));
      var decl = fin(Number(propria.declividadePct)) ? Number(propria.declividadePct) : (cal.declividadePct != null ? cal.declividadePct : PADRAO.declividadePct);
      var cond = arr(estado.condutores).filter(function (c) { return c.ok && String(c.calha) === String(cal.id); });
      /* REVISOR N23: `comoGerador` — a mesma regra do gerarPluvial (área de influência de cada descida pela geometria da água; coeficiente da
         Tabela 1 só com quina a ≤ 4 m). Sem ela (padrão, como era) cada saída leva a vazão TOTAL e a curva em toda ponta. */
      var sg = cfg.comoGerador && cond.length ? saidasComoGerador(estado, cal) : null;
      if (cfg.comoGerador && cond.length && !sg) premissas.push("calha " + cal.id + ": há trecho da calha com água e sem descida — cada saída verificada com a vazão TOTAL da calha (lado seguro)");
      var saidas = cond.length ? cond.map(function (c) { var g = sg && sg[c.id]; return g ? clone(g) : { curva: "canto_reto", distanciaCurva_m: r4(Math.max(0.01, c.distanciaDaPonta)), areaInfluencia_m2: null }; })
                               : [{ curva: "canto_reto", distanciaCurva_m: r4(Math.max(0.01, cal.comprimento / 2)) }];
      if (!cond.length) premissas.push("calha " + cal.id + ": sem condutor lançado — uma saída no meio, a distância da curva = metade do comprimento");
      calhas.push({ id: String(cal.id), secao: "retangular", base_mm: larMm, altura_mm: altMm, lamina_mm: lam, declividade_pct: decl, material: cfg.material || "chapa_metalica", saidas: saidas });
      if (!(fin(Number(propria.laminaMm)) || fin(Number(cfg.laminaMm)) || cal.laminaMm != null)) premissas.push("calha " + cal.id + ": lâmina d'água = metade da altura (" + virg(lam, 0) + " mm) — premissa da RA, como na calha semicircular da tabela; a fonte lida não traz borda livre para a retangular");
    });
    var p = { areas: areas, calhas: calhas };
    ["cidade", "situacao", "periodoRetorno_anos", "intensidade_mm_h", "fonteIntensidade", "postoReferencia", "postoConfirmado", "intensidadeSimplificada"].forEach(function (k) { if (cfg[k] != null) p[k] = cfg[k]; });
    if (p.periodoRetorno_anos == null && !p.situacao) p.situacao = "cobertura";
    return { pluvial: p, premissas: premissas };
  }
  function dimensionarCalhas(estado, cfg) {
    var AP = dep("HidAP", "./hidap.js"), NR = dep("HidNormas", "./hidnormas.js");
    if (!AP || !NR) return { ok: false, motivo: "O cálculo pluvial (js/hidap.js e js/hidnormas.js) não carregou." };
    var ent = entradaPluvial(estado, cfg);
    if (!ent.pluvial.calhas.length) return { ok: false, motivo: "Nenhuma calha com água de telhado ligada: lance a calha (embutida ou de beiral) em uma aresta que define inclinação." };
    var ctx = NR.contexto(), r;
    try { r = AP.calcular({ pluvial: ent.pluvial }, ctx, { trechos: [] }); } catch (e) { return { ok: false, motivo: "O cálculo pluvial falhou: " + e.message }; }
    var out = { ok: true, status: r.status, intensidade: r.intensidade, calhas: r.calhas, areas: r.areas, verificacoes: r.verificacoes, avisos: r.avisos,
             premissas: ent.premissas.concat(arr(r.premissas).map(function (x) { return x.item + ": " + x.valor; })), pendencias: ctx.pendencias ? ctx.pendencias() : [], entrada: ent.pluvial };
    arr(out.calhas).forEach(function (h) { h.intensidade_mm_h = r.intensidade ? r.intensidade.valor_mm_h : null; });
    /* REVISOR N23: `comoGerador` — a CALHA EMBUTIDA extravasa para dentro da edificação: T = 25 anos (NBR 10844 item 5.1.2 c), como o
       gerarPluvial já faz desde a revisão de 20/10/2026. Sem isso o diagnóstico aprovava (e o Corrigir propunha) a seção pela chuva de T = 5. */
    var T0 = fin(Number(cfg.periodoRetorno_anos)) ? null : periodoCobertura(cfg.situacao), T25 = periodoCobertura("sem_extravasamento");
    var informada = fin(Number(cfg.intensidade_mm_h)) && txt(cfg.fonteIntensidade).trim();
    var emb = {}; listarCalhas(estado).forEach(function (c) { if (c.tipo === "embutida") emb[String(c.id)] = true; });
    if (cfg.comoGerador && T0 != null && T25 != null && T25 !== T0 && !informada && arr(ent.pluvial.calhas).some(function (c) { return emb[c.id]; })) {
      var p25 = clone(ent.pluvial); delete p25.periodoRetorno_anos; p25.situacao = "sem_extravasamento";
      p25.calhas = p25.calhas.filter(function (c) { return emb[c.id]; });
      p25.areas = p25.areas.filter(function (a) { return a.destino && emb[a.destino.calha]; });
      var ctx25 = NR.contexto(), r25 = null;
      try { r25 = AP.calcular({ pluvial: p25 }, ctx25, { trechos: [] }); } catch (e25) { r25 = null; }
      if (r25 && r25.intensidade && r25.intensidade.valor_mm_h != null) {
        var porId = {}; arr(r25.calhas).forEach(function (h) { h.intensidade_mm_h = r25.intensidade.valor_mm_h; h.periodoRetorno_anos = T25; porId[h.id] = h; });
        out.calhas = out.calhas.map(function (h) { return porId[h.id] || h; });
        out.verificacoes = arr(out.verificacoes).filter(function (v) { return !emb[v.alvo]; }).concat(arr(r25.verificacoes).filter(function (v) { return emb[v.alvo]; }));
        out.premissas.push("calha embutida: T = " + T25 + " anos (o extravasamento cai dentro da edificação, NBR 10844 item 5.1.2 c) — I = " + r25.intensidade.valor_mm_h + " mm/h");
        if (r25.status === "reprovado" || (r25.status === "pendente" && out.status === "ok")) out.status = r25.status;
      }
    }
    return out;
  }
  /* a MENOR seção da lista (por área) que passa na capacidade da NBR 10844 para a calha `id` */
  var SECOES_CANDIDATAS = [[100, 80], [150, 80], [150, 100], [200, 100], [200, 120], [250, 120], [300, 120], [300, 150], [400, 150], [500, 200]];
  function secaoMinimaCalha(estado, id, cfg) {
    var alvo = null; listarCalhas(estado).forEach(function (c) { if (String(c.id) === String(id)) alvo = c; });
    if (!alvo) return { ok: false, motivo: "Calha não encontrada." };
    for (var i = 0; i < SECOES_CANDIDATAS.length; i++) {
      var e2 = clone({ calhasEmbutidas: estado.calhasEmbutidas, bordas: estado.bordas, telhados: estado.telhados, condutores: estado.condutores });
      var Lb = SECOES_CANDIDATAS[i][0] / 1000, Ab = SECOES_CANDIDATAS[i][1] / 1000;
      arr(e2.calhasEmbutidas).forEach(function (c) { if (String(c.id) === String(id)) { c.larguraEf = Lb; c.alturaEf = Ab; c.laminaMm = null; } });
      arr(e2.bordas).forEach(function (b) { if (String(b.id) === String(id)) { b.larguraEf = Lb; b.alturaEf = Ab; } });
      var r = dimensionarCalhas(e2, cfg);
      if (!r.ok) return r;
      var ch = r.calhas.filter(function (x) { return String(x.id) === String(id); })[0];
      if (!ch || ch.capacidade_l_min == null || ch.vazaoProjeto_l_min == null) return { ok: true, pendente: true, motivo: "Sem vazão ou capacidade (cidade fora da tabela, intensidade sem fonte ou calha sem condutor): ver pendências.", resultado: r };
      if (ch.vazaoProjeto_l_min <= ch.capacidade_l_min) return { ok: true, baseMm: SECOES_CANDIDATAS[i][0], alturaMm: SECOES_CANDIDATAS[i][1], capacidade_l_min: ch.capacidade_l_min, vazaoProjeto_l_min: ch.vazaoProjeto_l_min, resultado: r };
    }
    return { ok: true, nenhuma: true, motivo: "Nenhuma das seções candidatas (até 500 × 200 mm) passa: aumente a declividade ou ponha mais condutores.", resultado: null };
  }

  /* ============================================================ N23: DIAGNÓSTICO COM CORRIGIR (o que é + solução testada)
     Regra do Rogério (15/10/2026): todo problema mostrado vem com o que é, o botão Corrigir e o Mostrar no 3D. Aqui cada problema sai no formato
     do js/problemacard.js: { tipo, titulo, texto, gravidade, solucoes:[{id, texto, muda, ops}], pecas:[ids] }. Uma solução só existe se a conta
     dela FECHOU (a capacidade da calha é refeita pela NBR 10844 com a solução aplicada) — nunca uma sugestão sem teste.
     estado = BimEdit.aplicar(ops); cfg = o mesmo do dimensionarCalhas (cidade, intensidade com fonte, …). */
  function cfgPluvial(cfg) {
    var o = {}; ["cidade", "obra", "cliente", "situacao", "periodoRetorno_anos", "intensidade_mm_h", "fonteIntensidade", "material", "telhado", "ligarHidro", "calhaBeiral"].forEach(function (k) { if (cfg && cfg[k] != null) o[k] = cfg[k]; });
    return o;
  }
  function diagnosticarCobertura(estado, cfg) {
    var P = [], cals = listarCalhas(estado), tem = {};
    arr(estado && estado.condutores).forEach(function (d) { tem[String(d.calha)] = (tem[String(d.calha)] || 0) + 1; });
    function opDaCalha(cal, campos) {
      var o = { op: cal.tipo === "embutida" ? "calha" : "borda", id: cal.id }; Object.keys(campos).forEach(function (k) { o[k] = campos[k]; }); return o;
    }
    /* 1) platibanda que herda a parede: aresta sem parede embaixo */
    arr(estado && estado.platibandas).forEach(function (p) {
      if (!p || !p.herdar || !arr(p.avisos).some(function (a) { return /não tem\(êm\) parede embaixo/.test(a); })) return;
      var sem = []; (arr(p.avisos).join(" ").match(/aresta\(s\) ([0-9, ]+) não/) || [null, ""])[1].split(",").forEach(function (x) { var k = parseInt(x, 10); if (isFinite(k)) sem.push(k - 1); });
      var comPar = []; arr(estado.telhados).forEach(function (t) { if (String(t.id) === String(p.telhado)) arr(t.arestasCalc).forEach(function (e) { if (sem.indexOf(e.orig) < 0) comPar.push(e.orig); }); });
      var sols = [{ id: "padrao", texto: "Usar a espessura padrão (" + virg(PADRAO.espessura * 100, 0) + " cm) onde não há parede", muda: "a platibanda deixa de herdar a parede e fica com a espessura padrão em todas as arestas", ops: [{ op: "platibanda", id: p.id, herdar: false }] }];
      if (comPar.length) sols.unshift({ id: "so-onde-ha", texto: "Platibanda só onde há parede embaixo", muda: "a platibanda fica nas arestas " + comPar.map(function (k) { return k + 1; }).join(", ") + " e sai das demais", ops: [{ op: "platibanda", id: p.id, arestas: comPar }] });
      P.push({ tipo: "platibanda-sem-parede", gravidade: "aviso", titulo: "Platibanda sem parede embaixo em " + (sem.length === 1 ? "uma aresta" : sem.length + " arestas"),
               texto: "A platibanda copia o material e a posição da parede em que assenta, e nessa(s) aresta(s) não achei parede paralela e encostada ao contorno do telhado.", solucoes: sols, pecas: [p.id] });
    });
    /* REVISOR N23: herança só em parte (paredes diferentes sob a mesma aresta, parede que não cobre a aresta, parede curva): o que é + Mostrar no 3D
       (a platibanda e as paredes) + as saídas possíveis; nenhuma é aplicada sozinha porque cada uma muda o projeto */
    arr(estado && estado.platibandas).forEach(function (p) {
      var hp = p && p.ok && p.herdar && p.herancaParcial; if (!hp) return;
      var ids = [p.id], tx = [];
      hp.mistas.forEach(function (m) { tx.push("na aresta " + m.aresta + " há paredes diferentes (" + m.paredes.join("; ") + "): a platibanda segue a " + m.segue + " na aresta toda e cada parede é orçada pelo trecho dela"); ids = ids.concat(m.ids); });
      hp.parciais.forEach(function (m) { tx.push("na aresta " + m.aresta + " a parede cobre só " + virg(m.coberto) + " de " + virg(m.L) + " m e a platibanda corre a aresta toda"); ids = ids.concat(m.ids); });
      hp.curvas.forEach(function (m) { tx.push("na aresta " + m.aresta + " a parede " + m.ids.join(", ") + " é curva e a platibanda fica reta pela corda"); ids = ids.concat(m.ids); });
      var sols = [{ id: "padrao", texto: "Usar a espessura padrão (" + virg(PADRAO.espessura * 100, 0) + " cm) e não herdar a parede", muda: "a platibanda deixa de herdar a parede em todas as arestas", ops: [{ op: "platibanda", id: p.id, herdar: false }] },
                  { id: "manual", texto: "Ajustar as paredes: um tipo só por aresta, parede na aresta toda, ou o contorno do telhado acompanhando a curva", ops: [] }];
      P.push({ tipo: "platibanda-heranca-parcial", gravidade: "aviso", titulo: "Platibanda herdando a parede só em parte", texto: "A platibanda copia a parede de baixo, mas " + tx.join("; ") + ".", solucoes: sols,
               pecas: ids.filter(function (x, i) { return ids.indexOf(x) === i; }) });
    });
    cals.forEach(function (cal) {
      var base = opDaCalha(cal, {});
      /* 2) fora da cota certa */
      if (!cal.cotaAuto) P.push({ tipo: "calha-cota", gravidade: "aviso", titulo: "Calha " + cal.id + " fora da cota certa",
        texto: "A calha ainda está numa altura só, sem o caimento até a descida, e a borda da telha não entra nela. Na cota certa a telha avança " + virg(AVANCO_TELHA * 100, 0) + " cm dentro da calha, a borda da calha fica " + virg(FOLGA_VERTICAL * 100, 0) + " cm abaixo da telha e o fundo cai " + virg(DECL_MIN_CALHA_PCT, 1) + " % (NBR 10844, item 5.5.2) até a descida.",
        solucoes: [{ id: "cota", texto: "Pôr a calha na cota certa", muda: "a calha desloca " + virg(AVANCO_TELHA * 100, 0) + " cm para dentro do beiral e ganha o caimento até a(s) descida(s)", ops: [opDaCalha(cal, { cotaAuto: true })] }], pecas: [cal.id] });
      /* 3) sem descida */
      if (!tem[String(cal.id)]) {
        var cds = opsCondutores({ condutores: [], calhasEmbutidas: estado.calhasEmbutidas, bordas: estado.bordas, telhados: estado.telhados }, { porCalha: 2 }).filter(function (o) { return String(o.calha) === String(cal.id); });
        P.push({ tipo: "calha-sem-descida", gravidade: "erro", titulo: "Calha " + cal.id + " sem descida",
          texto: "Sem descida a água da calha não tem para onde ir: a calha enche e transborda. A descida (condutor vertical) é o bocal onde o fundo da calha termina.",
          solucoes: [{ id: "descidas", texto: "Lançar 2 descidas nas extremidades", muda: "2 condutores verticais ligados à calha (o DN sai do cálculo da NBR 10844)", ops: cds }], pecas: [cal.id] });
      }
      /* 4) declividade abaixo do mínimo (embutida: campo da calha; beiral com perfil: o da borda) */
      var dec = cal.declividadePct;
      if (dec != null && dec < DECL_MIN_CALHA_PCT - 1e-9) P.push({ tipo: "calha-declividade", gravidade: "erro", titulo: "Calha " + cal.id + " com declividade de " + virg(dec, 2) + " %",
        texto: "A NBR 10844 (item 5.5.2) pede declividade mínima de " + virg(DECL_MIN_CALHA_PCT, 1) + " % e uniforme: abaixo disso a água empoça no fundo.",
        solucoes: [{ id: "decl", texto: "Declividade de " + virg(DECL_MIN_CALHA_PCT, 1) + " %", muda: "a declividade da calha passa de " + virg(dec, 2) + " % para " + virg(DECL_MIN_CALHA_PCT, 1) + " %", ops: [opDaCalha(cal, { declividadePct: DECL_MIN_CALHA_PCT })] }], pecas: [cal.id] });
    });
    /* 5) capacidade: só com intensidade válida (cidade da Tabela 5 ou informada com fonte); cidade fora da tabela é pendência, não erro */
    /* REVISOR N23: a capacidade é julgada pela MESMA regra do gerador (área de influência de cada descida, quina a ≤ 4 m, T = 25 anos na
       embutida) — senão o "Recalcular pela NBR 10844" saía reprovado pelo próprio diagnóstico */
    var cfgV = {}; Object.keys(cfg || {}).forEach(function (k) { cfgV[k] = cfg[k]; }); cfgV.comoGerador = true;
    var r = cals.length ? dimensionarCalhas(estado, cfgV) : null;
    if (r && r.ok && r.intensidade && r.intensidade.valor_mm_h != null) arr(r.calhas).forEach(function (h) {
      if (h.capacidade_l_min == null || h.vazaoProjeto_l_min == null || h.vazaoProjeto_l_min <= h.capacidade_l_min) return;
      var cal = cals.filter(function (c) { return String(c.id) === String(h.id); })[0]; if (!cal) return;
      var sols = [], sm = secaoMinimaCalha(estado, h.id, cfgV);
      if (sm && sm.ok && sm.baseMm) sols.push({ id: "secao", texto: "Seção " + sm.baseMm + " × " + sm.alturaMm + " mm", muda: "a calha passa para " + sm.baseMm + " × " + sm.alturaMm + " mm: capacidade " + virg(sm.capacidade_l_min, 0) + " L/min ≥ vazão " + virg(sm.vazaoProjeto_l_min, 0) + " L/min",
                                                  ops: [opDaCalha(cal, { largura: sm.baseMm / 1000, altura: sm.alturaMm / 1000 })] });
      /* sem seção que sirva (ou a pedido): o cálculo todo refeito — seção E número de descidas — pelo mesmo motor do "Rufos, calhas e descidas" */
      var g = null; if (cfg && cfg.ops) { try { g = gerarPluvial(cfg.ops, cfgPluvial(cfg)); } catch (eG) { g = null; } }
      if (g && g.ok) {
        var nd = 0; arr(g.calhas).forEach(function (c) { nd += c.descidas.length; });
        sols.push({ id: "recalcular", texto: "Recalcular calha e descidas pela NBR 10844", muda: arr(g.calhas).length + " calha(s) e " + nd + " descida(s) refeitas: seção, número de descidas e DN pelo ábaco; cada calha passa na capacidade", ops: g.ops });
      }
      /* só fica a solução cuja conta FECHA: refaz o estado com ela aplicada e confere a capacidade desta calha (a mesma verificação que acusou o problema) */
      if (cfg && cfg.ops) {
        var BE0 = dep("BimEdit", "./bimedit.js");
        sols = sols.filter(function (s0) {
          try {
            var r2 = dimensionarCalhas(BE0.aplicar(BE0.sanear(cfg.ops.concat(s0.ops))), cfgV), c2 = arr(r2.calhas).filter(function (x) { return String(x.id) === String(h.id); })[0];
            return !!c2 && c2.capacidade_l_min != null && c2.vazaoProjeto_l_min != null && c2.vazaoProjeto_l_min <= c2.capacidade_l_min;
          } catch (eV) { return false; }
        });
      }
      if (!sols.length) sols.push({ id: "manual", texto: "Divida a calha em dois trechos com descida própria, aumente a declividade ou use uma calha maior que 500 × 200 mm", ops: [] });
      P.push({ tipo: "calha-capacidade", gravidade: "erro", titulo: "Calha " + h.id + " não comporta a chuva",
        texto: "Pela NBR 10844 a vazão de projeto da calha é " + virg(h.vazaoProjeto_l_min, 0) + " L/min e a seção atual leva só " + virg(h.capacidade_l_min, 0) + " L/min (intensidade " + virg(h.intensidade_mm_h != null ? h.intensidade_mm_h : r.intensidade.valor_mm_h, 0) + " mm/h" + (h.periodoRetorno_anos ? ", T = " + h.periodoRetorno_anos + " anos: calha embutida" : "") + "): a calha transborda.",
        solucoes: sols, pecas: [h.id] });
    });
    return { ok: true, problemas: P, calculo: r && r.ok ? { status: r.status, intensidade: r.intensidade } : null, pendencias: r && r.ok ? r.pendencias : [] };
  }

  /* ============================================================ QUANTITATIVO */
  function item(grupo, nome, un, qtd, sinapi, obs, extra) {
    var o = { grupo: grupo, item: nome, un: un, qtd: r4(qtd), sinapi: sinapi || null, orcarAParte: !sinapi, obs: obs || null };
    if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
    return o;
  }
  function quantitativo(estado, opc) {
    opc = opc || {}; var itens = [], avisos = [], T = BT();
    arr(estado && estado.telhados).forEach(function (t) {
      if (!t || !t.ok) return;
      var tel = T && T.telha ? T.telha(t.tipoId) : null, nome = "Telhamento — " + txt(t.tipoTelhado && t.tipoTelhado.rotulo);
      if (tel && tel.familia === "fibrocimento") {
        var a10 = 0, aa = 0;
        arr(t.aguasCalc).forEach(function (ag) { if (T.pctGraus(num(ag.inclinacao, 0)) <= 10 + 1e-9) a10 += ag.area; else aa += ag.area; });
        if (a10 > 0) itens.push(item("Cobertura", nome + " (até 10°, recobrimento 1 1/4 de onda)", "m²", a10, sin("telhaFibroAte10"), null, { telhado: t.id }));
        if (aa > 0) itens.push(item("Cobertura", nome + " (acima de 10°, recobrimento 1/4 de onda)", "m²", aa, sin("telhaFibroAcima10"), null, { telhado: t.id }));
        if (num(t.cumeeira, 0) > 0) itens.push(item("Cobertura", "Cumeeira da telha de fibrocimento", "m", t.cumeeira, sin("cumeeiraFibro"), null, { telhado: t.id }));
      } else if (tel && tel.familia === "sanduiche") {
        itens.push(item("Cobertura", nome, "m²", t.area, sin("telhaSanduiche"), "composição aproximada (telha termoacústica 30 mm); face inferior efeito madeira e peso da telha: " + (tel.faceInferior ? tel.faceInferior.fonte : "não verificado"), { telhado: t.id }));
        if (num(t.cumeeira, 0) > 0) itens.push(item("Cobertura", "Cumeeira da telha sanduíche", "m", t.cumeeira, null, "cumeeira de telha sanduíche: sem composição na base", { telhado: t.id }));
      } else itens.push(item("Cobertura", nome, "m²", t.area, null, "tipo sem composição SINAPI mapeada", { telhado: t.id }));
      if (num(t.espigao, 0) > 0) itens.push(item("Cobertura", "Espigão", "m", t.espigao, null, "sem composição na base", { telhado: t.id }));
      if (num(t.rincao, 0) > 0) itens.push(item("Cobertura", "Rincão", "m", t.rincao, null, "sem composição na base", { telhado: t.id }));
      if (tel) arr(t.avisos).forEach(function (a) { avisos.push("Telhado " + t.id + ": " + a); });
    });
    arr(estado && estado.platibandas).forEach(function (p) {
      if (!p || !p.ok) return;
      if (p.herdar && arr(p.camadas).length) {
        /* N23: a platibanda é a continuação da parede de baixo — as MESMAS camadas (núcleo e acabamento de cada face), em m², com o serviço de cada uma */
        p.camadas.forEach(function (k) {
          itens.push(item("Platibanda", k.rotulo + " — platibanda (" + (k.face === "nucleo" ? "núcleo" : "face " + k.face) + ", e = " + virg(num(k.e, 0) * 100, 1) + " cm)", "m²", k.area, null,
            "mesma camada da parede de baixo (" + p.paredesBase.join(", ") + ")" + (k.servico ? ": serviço \"" + k.servico + "\"" : "") + "; altura " + virg(p.altura) + " m, " + virg(p.volume, 3) + " m³ de platibanda", { platibanda: p.id, servico: k.servico || null, orcarAParte: true }));   /* REVISOR N23: sem código SINAPI é "orçar à parte" (com `servico` ou não) — antes não contava nem como com código nem à parte */
        });
      } else itens.push(item("Platibanda", "Platibanda de alvenaria, e = " + virg(p.espessuraEf * 100, 0) + " cm", "m²", p.area, null, "altura " + virg(p.altura) + " m, " + virg(p.comprimento) + " m de comprimento, " + virg(p.volume, 3) + " m³; a alvenaria e o revestimento das duas faces (" + virg(p.areaFaces) + " m²) saem da composição de parede da obra", { platibanda: p.id }));
      if (p.rufoCapa) itens.push(item("Platibanda", "Rufo de capa (chapim) — " + p.rufoCapa.obs, "m", p.rufoCapa.comprimento, p.rufoCapa.sinapi, null, { platibanda: p.id }));
      if (p.contraRufo) itens.push(item("Platibanda", "Contra-rufo — " + p.contraRufo.obs, "m", p.contraRufo.comprimento, p.contraRufo.sinapi, null, { platibanda: p.id }));
    });
    arr(estado && estado.calhasEmbutidas).forEach(function (c) {
      if (!c || !c.ok) return;
      itens.push(item("Calha e descidas", "Calha embutida de chapa galvanizada — " + c.obsSinapi, "m", c.comprimento, c.sinapi, "seção " + virg(c.larguraEf * 100, 0) + " × " + virg(c.alturaEf * 100, 0) + " cm, declividade " + virg(c.declividadeEf, 2) + "%", { calha: c.id }));
    });
    arr(estado && estado.bordas).forEach(function (b) {
      if (!b || !b.ok) return;
      if (b.tipoBorda === "calha") {
        var pvc = opc.calhaBeiral === "pvc", dev = desenvolvimentoCalha(b.larguraEf, b.alturaEf + (b.perfil ? num(b.perfil.desnivel, 0) : 0)), dv = escolher(DESENV_CALHA, dev, "dev");   /* REVISOR N23: a maior seção, no bocal */
        if (pvc) itens.push(item("Calha e descidas", "Calha de beiral semicircular de PVC DN 125 (inclui cabeceiras, emendas, bocais e suportes)", "m", b.comprimento, sin("calhaPvc125"), "calha de beiral: seção a confirmar pelo cálculo pluvial", { calha: b.id }));
        else itens.push(item("Calha e descidas", "Calha de beiral de chapa galvanizada — " + (dv ? "desenvolvimento " + Math.round(dv.dev * 100) + " cm (necessário " + Math.round(dev * 100) + " cm)" : "desenvolvimento " + Math.round(dev * 100) + " cm sem composição"), "m", b.comprimento, dv ? sin(dv.ref) : null, null, { calha: b.id }));
      } else if (b.tipoBorda === "rufo" || b.tipoBorda === "testeira" || b.tipoBorda === "intradorso") {
        var rot = { rufo: "Rufo de beiral/empena", testeira: "Testeira", intradorso: "Intradorso (forro do beiral)" }[b.tipoBorda];
        itens.push(item("Cobertura", rot, b.tipoBorda === "intradorso" ? "m²" : "m", b.tipoBorda === "intradorso" ? b.area : b.comprimento, null, "corte/composição não definidos no tipo de borda: orçar à parte", { borda: b.id }));
      }
    });
    arr(estado && estado.rufosEncontro).forEach(function (r) {
      if (!r || !r.ok || !r.encontros.length) return;
      var cc = r.corteContraInfo || {}, comSin = arr(r.pecasRufo).some(function (p) { return !!p.sinapi; }), FX = DADOS_TEL.fixacao;
      function obCorte(info) { return info && info.padronizado ? "corte padronizado " + (info.insumo ? "(insumo SINAPI " + info.insumo + ") " : "") + "— " + info.fonte : "corte sob medida (nenhum corte padronizado da bitola cobre o desenvolvimento): orçar à parte"; }
      arr(r.pecasRufo).forEach(function (p) {
        itens.push(item("Cobertura", "Rufo de encontro com parede (" + p.posicoes.join(", ") + ") — " + r.chapa + ", corte " + virg(p.corte * 100, 0) + " cm", "m", p.comprimento, p.sinapi,
                        obCorte(p.info) + "; dobras: " + p.dobras.fonte + "; " + r.obsChapa, { rufo: r.id }));
      });
      itens.push(item("Cobertura", "Contrarrufo embutido na parede — " + r.chapa + ", corte " + virg(r.corteContraEf * 100, 0) + " cm", "m", r.comprimentoContra, r.sinapiContra,
                      "desenvolvimento do contrarrufo " + PADRAO_RUFO.obs + " (" + DADOS_TEL.contrarrufo.semFonte.split(".")[0] + "); recobrimento mínimo de " + virg(num(DADOS_TEL.contrarrufo.recobrimentoM, 0) * 100, 0) + " cm sobre o rufo (" + DADOS_TEL.contrarrufo.recobrimentoFonte + "); " + obCorte(cc) + "; " + r.obsChapa, { rufo: r.id }));
      itens.push(item("Cobertura", "Chapa do rufo e do contrarrufo (massa)", "kg", r.kgRufo + r.kgContra, null, "conferência de compra: corte × massa da chapa (" + r.obsChapa + ") × " + virg(FX.rufoMPorM, 2) + " m de chapa por metro (perda de " + FX.perdaPct + "% — " + FX.fonte + ")", { rufo: r.id, somar: false }));
      /* a fixação À PARTE só dos metros sem composição (r.fixacaoAParte); tudo com composição → só conferência, como antes */
      var FA = r.fixacaoAParte, Ltot = r4(num(r.comprimentoRufo, 0) + num(r.comprimentoContra, 0));
      var aParte = FA ? FA.metros > 1e-9 : !comSin, Fq = FA && aParte ? FA : r.fixacao, Lcob = FA ? r4(Ltot - FA.metros) : 0;
      var fx = !aParte ? "incluso na composição SINAPI do rufo (só conferência, não somar) — coeficiente por metro: " + FX.fonte
                       : "coeficiente por metro: " + FX.fonte + (Lcob > 1e-9 ? "; só os " + virg(FA.metros) + " m sem composição (os " + virg(Lcob) + " m pela composição SINAPI já a incluem)" : "");
      itens.push(item("Cobertura", "Rebite de repuxo de alumínio Ø3,2 × 8 mm", "un", Fq.rebites, null, fx, { rufo: r.id, somar: aParte }));
      itens.push(item("Cobertura", "Prego de aço inox 18 × 27 (rufo sobre estrutura de madeira)", "un", Fq.pregos, null, fx, { rufo: r.id, somar: aParte }));
      itens.push(item("Cobertura", "Selante PU, cartucho 310 ml — cordão em todo o encontro com a parede (" + virg(Fq.selanteM) + " m)", "un", Fq.selanteCartuchos, null, fx, { rufo: r.id, somar: aParte }));
      itens.push(item("Cobertura", "Solda de estanho 50/50 (emendas)", "kg", Fq.soldaKg, null, fx, { rufo: r.id, somar: aParte }));
      itens.push(item("Cobertura", "Fixação do contrarrufo — " + txt(FX.bucha).toLowerCase(), "un", r.fixacao.parafusoBucha, null,
                      "insumo: " + FX.buchaFonte + "; espaçamento de " + virg(PADRAO_RUFO.espBucha * 100, 0) + " cm " + PADRAO_RUFO.obs + " (o SINAPI não dá; a Isoeste usa 500 mm no acessório dela)", { rufo: r.id }));
    });
    arr(estado && estado.condutores).forEach(function (c) {
      if (!c || !c.ok) return;
      if (c.noHidro) { itens.push(item("Calha e descidas", "Condutor vertical (descida) PVC série R DN " + c.dnEf + " — no sistema pluvial do hidro", "m", c.alturaM, null, "o tubo é o trecho " + c.trecho + " do sistema pluvial (quantitativo do hidrossanitário): aqui só conferência, não somar", { condutor: c.id, somar: false, orcarAParte: false })); return; }
      itens.push(item("Calha e descidas", "Condutor vertical (descida) de PVC série R, DN " + (c.dnEf != null ? c.dnEf : "a dimensionar"), "m", c.alturaM, null,
                      c.dnEf != null ? "ver a composição pluvial do cálculo hidrossanitário (tubo|pvc_serie_r|pluvial:prumada|" + c.dnEf + ")" : "DN pendente do cálculo pluvial", { condutor: c.id }));
    });
    var Es = dep("BimTelhadoEstrut", "./bimtelhadoestrut.js"); if (Es && Es.quantitativo) { var qe = Es.quantitativo(estado, opc); qe.itens.forEach(function (x) { itens.push(x); }); qe.avisos.forEach(function (x) { avisos.push(x); }); }
    var Fd = dep("BimForroDrywall", "./bimforrodrywall.js"); if (Fd && Fd.quantitativo) { var qf = Fd.quantitativo(estado, opc); qf.itens.forEach(function (x) { itens.push(x); }); qf.avisos.forEach(function (x) { avisos.push(x); }); }
    var totais = {};
    itens.forEach(function (x) { var k = x.item + "|" + x.un; totais[x.grupo] = (totais[x.grupo] || 0) + 1; void k; });
    return { itens: itens, avisos: avisos, base: SINAPI.base, contagemPorGrupo: totais,
             comCodigo: itens.filter(function (x) { return !!x.sinapi; }).length, aParte: itens.filter(function (x) { return x.orcarAParte; }).length };
  }

  /* ============================================================ T2 (20/10/2026): RUFO E CONTRARRUFO NO ENCONTRO COM PAREDE MAIS ALTA
     Pedido do dono: "gerar rufo, contrarrufo, calha, tudo dimensionado de acordo com a NBR 10844, de acordo com a área de
     contribuição e os parâmetros do endereço da obra".
     O ENCONTRO sai da GEOMETRIA: aresta do contorno do telhado com uma parede paralela encostada nela (o corpo da parede toca a
     linha do contorno) cujo topo fica ACIMA da face de cima da telha (oitão que passa do telhado, meia-água encostada numa parede
     mais alta, platibanda feita com parede). O trecho é medido onde a parede passa da telha — a parede de "anexar topo" não conta
     (ela para no telhado). A aresta coberta pela op platibanda fica com o contra-rufo DELA (não conta duas vezes).
     Rufo = chapa dobrada (aba sobre a telha + aba na parede); contrarrufo = chapa embutida na parede, cobrindo a aba do rufo.
     ⚠ SEM FONTE (docs/telhado/PADROES-TELHADO.md §5.1, pesquisa de 20/10/2026): dobras e desenvolvimento do rufo e do contrarrufo,
       espessura da chapa nº 24/26 (as fontes divergem) e a quantidade de fixação por metro — tudo em PADRAO_RUFO é VALOR DE
       PARTIDA — CONFERIR e sai escrito assim no quantitativo e no memorial. COM fonte: a composição SINAPI 94231 (rufo nº 24, corte
       25 cm: rebite de repuxo Ø3,2 × 8 mm, prego inox 18 × 27 na madeira, parafuso + bucha S-8 na alvenaria, cordão de selante PU
       em todo o encontro, perda de 5% por corte — SINAPI Caderno Telhamento 06/2026, p. 64–65). */
  /* PLUVIAL 2 (20/10/2026): os números do rufo e do condutor vêm de DADOS_TEL — bloco GERADO dos json com fonte (não editar à
     mão: node tools/gerar-telhado-cobertura-dados.js; o teste tools/test-telhado-pluvial2.js reprova bloco velho). */
  /* telhado-dados-inicio — GERADO por tools/gerar-telhado-cobertura-dados.js de data/telhado-condutor-nbr10844.json e data/telhado-rufos.json: NÃO editar à mão */
  var DADOS_TEL = {"versaoAbaco":"2026-10-20.1","versaoRufos":"2026-10-20.1","abaco":{"fonte":"ABNT NBR 10844:1989 - Instalacoes prediais de aguas pluviais, Figura 3 e itens 5.6.3-5.6.4, página 8 do PDF de consulta","tipoFonte":"primária (digitalizada do ábaco)","exemplarLicenciado":false,"incerteza":"estimada +-15 a 20 L/min (cerca de +-2 a 3 %) por leitura do desenho (espessura do traco ~10 L/min, calibracao dos eixos, ajuste); em regioes de curvas muito proximas (D<65 mm, L<=1,5 m) pode chegar a +-30 L/min. Nao usar abaixo do diametro interno minimo da norma (70 mm, item 5.6.3).","regra":"5.6.4.1: levantar vertical por Q ate interceptar as curvas de H e L; transportar a intersecao MAIS ALTA ate o eixo D; adotar o diametro nominal cujo diametro interno seja >= D. Equivale a Q_max(D) = min(Q_curva_H(D), Q_curva_L(D)).","diFonte":"diametro interno aproximado = dem - 2 x espessura minima (serie reforcada SR), de dados-fonte/hidro/normas/tubos-pvc.json (NBR 5688:2018, primaria, exemplarLicenciado false): DN75 = 75,5 - 2x2,0 = 71,5 mm; DN100 = 101,6 - 2x2,5 = 96,6 mm; DN150 = 150,0 - 2x3,6 = 142,8 mm; DN50 ~ 47 mm (abaixo do minimo de 70 mm); DN200 ~ 191 mm (fora do abaco, max 150 mm). Serie normal da 0,5 a 1 mm a mais de diametro interno.","versao":"2026-10-20.1","aresta_viva":{"H":[{"H":50,"pts":[[50,385],[55,405],[60,430],[65,450],[70,470],[75,495],[80,515],[85,540],[90,560],[95,585],[100,605],[105,630],[110,650],[115,670],[120,695],[125,715],[130,740],[135,760],[140,785],[145,805],[150,830]]},{"H":60,"pts":[[50,540],[55,565],[60,595],[65,620],[70,650],[75,675],[80,705],[85,735],[90,760],[95,790],[100,815],[105,845],[110,870],[115,900],[120,930],[125,955],[130,985],[135,1010],[140,1040],[145,1065],[150,1095]]},{"H":70,"pts":[[55,760],[60,795],[65,830],[70,865],[75,900],[80,935],[85,975],[90,1010],[95,1045],[100,1080],[105,1115],[110,1150],[115,1185],[120,1220],[125,1255],[130,1290],[135,1325],[140,1365],[145,1400],[150,1435]]},{"H":80,"pts":[[65,1075],[70,1120],[75,1160],[80,1205],[85,1250],[90,1290],[95,1335],[100,1375],[105,1420],[110,1460],[115,1505],[120,1545],[125,1590],[130,1635],[135,1675],[140,1720],[145,1760]]},{"H":90,"pts":[[75,1455],[80,1510],[85,1560],[90,1615],[95,1665],[100,1715],[105,1770],[110,1820],[115,1870],[120,1925],[125,1975],[130,2025],[135,2075],[140,2130],[145,2180],[150,2230]]},{"H":100,"pts":[[80,1850],[85,1915],[90,1975],[95,2035],[100,2095],[105,2155],[110,2215],[115,2280],[120,2340],[125,2400],[130,2460],[135,2520],[140,2580],[145,2640],[150,2695]]}],"L":[{"L":0.3,"pts":[[55,215],[60,265],[65,320],[70,385],[75,450],[80,530],[85,610],[90,700],[95,795],[100,900],[105,1005],[110,1120],[115,1240],[120,1365],[125,1495],[130,1635],[135,1775],[140,1920],[145,2075]]},{"L":0.6,"pts":[[50,220],[55,275],[60,335],[65,400],[70,470],[75,545],[80,630],[85,720],[90,820],[95,925],[100,1035],[105,1155],[110,1280],[115,1415],[120,1555],[125,1705],[130,1865],[135,2030],[140,2205],[145,2390],[150,2585]]},{"L":1,"pts":[[50,255],[55,320],[60,390],[65,465],[70,550],[75,640],[80,740],[85,845],[90,960],[95,1080],[100,1205],[105,1345],[110,1490],[115,1640],[120,1800],[125,1970],[130,2150]]},{"L":1.5,"pts":[[50,285],[55,360],[60,445],[65,535],[70,630],[75,735],[80,845],[85,960],[90,1090],[95,1220],[100,1365],[105,1515],[110,1675],[115,1850],[120,2030],[125,2225],[130,2430]]},{"L":2,"pts":[[50,315],[55,400],[60,495],[65,590],[70,695],[75,805],[80,925],[85,1050],[90,1190],[95,1335],[100,1490],[105,1660],[110,1840],[115,2035],[120,2240],[125,2460]]},{"L":3,"pts":[[50,360],[55,455],[60,555],[65,665],[70,780],[75,905],[80,1040],[85,1185],[90,1340],[95,1510],[100,1690],[105,1890],[110,2100],[115,2325]]},{"L":6,"pts":[[50,445],[55,550],[60,670],[65,800],[70,945],[75,1100],[80,1270],[85,1455],[90,1655],[95,1870],[100,2105]]},{"L":25,"pts":[[55,670],[60,830],[65,1005],[70,1200],[75,1410],[80,1645],[85,1895]]},{"L":null,"pts":[[55,745],[60,925],[65,1125],[70,1350],[75,1595],[80,1865]]}],"dn":[{"dn":75,"di":71.5},{"dn":100,"di":96.6},{"dn":150,"di":142.8}]},"funil":{"H":[{"H":50,"pts":[[50,440],[55,470],[60,495],[65,520],[70,550],[75,575],[80,605],[85,630],[90,655],[95,685],[100,710],[105,735],[110,765],[115,790],[120,815],[125,845],[130,870],[135,895],[140,925],[145,950],[150,975]]},{"H":60,"pts":[[50,635],[55,670],[60,705],[65,740],[70,770],[75,805],[80,840],[85,875],[90,905],[95,940],[100,975],[105,1005],[110,1040],[115,1075],[120,1110],[125,1140],[130,1175],[135,1210],[140,1245],[145,1275],[150,1310]]},{"H":70,"pts":[[60,915],[65,960],[70,1005],[75,1045],[80,1090],[85,1130],[90,1175],[95,1220],[100,1260],[105,1305],[110,1350],[115,1390],[120,1435],[125,1480],[130,1520],[135,1565],[140,1605],[145,1650],[150,1695]]},{"H":80,"pts":[[70,1295],[75,1350],[80,1405],[85,1460],[90,1515],[95,1570],[100,1620],[105,1675],[110,1730],[115,1785],[120,1840],[125,1890],[130,1945],[135,2000],[140,2055],[145,2110],[150,2160]]},{"H":90,"pts":[[80,1760],[85,1825],[90,1885],[95,1950],[100,2015],[105,2080],[110,2145],[115,2210],[120,2270],[125,2335],[130,2400],[135,2465],[140,2525],[145,2590]]},{"H":100,"pts":[[85,2215],[90,2290],[95,2365],[100,2435],[105,2510],[110,2585],[115,2660],[120,2735]]}],"L":[{"L":0.3,"pts":[[55,250],[60,310],[65,375],[70,445],[75,525],[80,610],[85,705],[90,800],[95,910],[100,1025],[105,1145],[110,1275],[115,1415],[120,1560],[125,1715],[130,1880],[135,2050],[140,2230]]},{"L":0.6,"pts":[[50,245],[55,310],[60,375],[65,450],[70,530],[75,620],[80,710],[85,815],[90,925],[95,1040],[100,1165],[105,1300],[110,1440],[115,1595],[120,1755],[125,1925],[130,2105],[135,2295]]},{"L":1,"pts":[[50,285],[55,355],[60,435],[65,520],[70,610],[75,710],[80,815],[85,930],[90,1055],[95,1185],[100,1320],[105,1470],[110,1625],[115,1790],[120,1970],[125,2155],[130,2350],[135,2555]]},{"L":1.5,"pts":[[50,320],[55,405],[60,495],[65,590],[70,690],[75,800],[80,920],[85,1045],[90,1180],[95,1320],[100,1475],[105,1635],[110,1810],[115,1995],[120,2195],[125,2405]]},{"L":2,"pts":[[50,355],[55,435],[60,530],[65,630],[70,740],[75,860],[80,990],[85,1125],[90,1275],[95,1430],[100,1595],[105,1770],[110,1955],[115,2145],[120,2350]]},{"L":3,"pts":[[55,490],[60,590],[65,705],[70,825],[75,960],[80,1105],[85,1265],[90,1435],[95,1615],[100,1810],[105,2015],[110,2235],[115,2470]]},{"L":6,"pts":[[50,460],[55,570],[60,690],[65,825],[70,975],[75,1135],[80,1315],[85,1505],[90,1715],[95,1940],[100,2185],[105,2440]]},{"L":25,"pts":[[50,555],[55,690],[60,845],[65,1015],[70,1205],[75,1420],[80,1660],[85,1930],[90,2225]]},{"L":null,"pts":[[50,590],[55,750],[60,925],[65,1125],[70,1345],[75,1595],[80,1870],[85,2180]]}],"dn":[{"dn":75,"di":71.5},{"dn":100,"di":96.6},{"dn":150,"di":142.8}]}},"chapas":{"galv24":{"gsg":24,"espessuraMm":0.64,"kgM2":5.12,"insumo":43106,"fonte":"CAIXA - SINAPI, Fichas de Especificacao Tecnica de Insumos (09/2026), ficha 43106"},"galv26":{"gsg":26,"espessuraMm":0.5,"kgM2":4,"insumo":11051,"fonte":"CAIXA - SINAPI, Fichas de Especificacao Tecnica de Insumos (09/2026), ficha 11051"},"galv22":{"gsg":22,"espessuraMm":0.8,"kgM2":6.4,"insumo":11049,"fonte":"CAIXA - SINAPI, Fichas de Especificacao Tecnica de Insumos (09/2026), ficha 11049"},"aluminio":{"espessuraMm":0.5,"larguraCm":30,"fonte":"DER-ES - Caderno de Especificacoes 0903 Rufos e Calhas (05/2025), servico 090314"}},"cortes":[{"corteCm":25,"mat":"galv24","insumo":40873,"peca":"rufo interno/externo (composicao 94231)","fonte":"CAIXA - SINAPI, Fichas de Especificacao Tecnica de Insumos (09/2026), ficha 40873"},{"corteCm":25,"mat":"galv26","insumo":1116,"peca":"rufo externo","fonte":"CAIXA - SINAPI, Fichas de Especificacao Tecnica de Insumos (09/2026), ficha 1116"},{"corteCm":28,"mat":"galv26","insumo":1115,"peca":"rufo externo","fonte":"CAIXA - SINAPI, Fichas de Especificacao Tecnica de Insumos (09/2026), ficha 1115"},{"corteCm":30,"mat":"galv26","insumo":null,"peca":"rufo externo/interno n. 26","fonte":"DER-ES - Caderno de Especificacoes 0903 Rufos e Calhas (05/2025), servico 090302"},{"corteCm":30,"mat":"aluminio","insumo":null,"peca":"rufo externo/interno de alumínio","fonte":"DER-ES - Caderno de Especificacoes 0903 Rufos e Calhas (05/2025), servico 090314"},{"corteCm":33,"mat":"galv26","insumo":1113,"peca":"rufo externo/interno (composicao 100327)","fonte":"CAIXA - SINAPI, Fichas de Especificacao Tecnica de Insumos (09/2026), ficha 1113"},{"corteCm":50,"mat":"galv26","insumo":1114,"peca":"rufo interno","fonte":"CAIXA - SINAPI, Fichas de Especificacao Tecnica de Insumos (09/2026), ficha 1114"}],"dobras":{"lateral":{"posicao":"encontro com parede/alvenaria - rufo lateral inferior","tipo":"telha metalica trapezoidal Kingspan Isoeste TP40","abaTelhaMm":270,"abaParedeMm":160,"dobrasMm":40,"desenvolvimentoMm":470,"desenvolvimentoSomado":false,"pecaMm":3000,"utilMm":2800,"fonte":"Kingspan Isoeste - Manual de Instalacao TP40 (rufos, pag. 20 a 27; cotas em mm lidas nos desenhos), p. 23"},"superior":{"posicao":"encontro superior com parede - rufo superior dentado","tipo":"Kingspan Isoeste TP40","abaTelhaMm":280,"abaParedeMm":160,"dobrasMm":20,"desenvolvimentoMm":460,"desenvolvimentoSomado":true,"pecaMm":1200,"utilMm":980,"fonte":"Kingspan Isoeste - Manual de Instalacao TP40 (rufos, pag. 20 a 27; cotas em mm lidas nos desenhos), p. 25"}},"fixacao":{"rufoMPorM":1.05,"perdaPct":5,"cartuchoPorM":0.0403226,"mPorCartucho":24.8,"pregosPorM":1.26,"rebitesPorM":1.25,"soldaKgPorM":0.045,"fonte":"CAIXA - SINAPI, Caderno Tecnico de Composicoes: Telhamento para Cobertura (06/2026), p. 63-65 (composicao 94231)","obs":"Coeficientes por m de rufo, conferidos no caderno (layout do PDF embaralha a coluna; item->coeficiente validado pela proporcao 33/25 = 1,32 entre 94231 e 100327). Considera fixacao sobre estrutura de MADEIRA; sobre alvenaria/concreto 'utilizar parafusos e buchas de nailon S-8 em substituicao aos pregos' (sem coeficiente publicado).","bucha":"BUCHA DE NYLON SEM ABA S8, COM PARAFUSO DE 4,80 X 50 MM","buchaFonte":"CAIXA - SINAPI, ficha de insumo 7583"},"contrarrufo":{"recobrimentoM":0.1,"recobrimentoFonte":"Eternit - Catalogo Tecnico Fibrocimento 2020/21 (rufo/contrarrufo das telhas de fibrocimento), p. 85 (leitura do desenho; confirmar com o catalogo)","juntaM":0.02,"juntaFonte":"CAIXA - SINAPI, Caderno Tecnico de Composicoes: Telhamento para Cobertura (06/2026), p. 119 (composicao 100435, item 8 Informacoes complementares)","semFonte":"Nenhuma fonte tecnica traz dobras/desenvolvimento do contrarrufo metalico (profundidade do rasgo, largura da aba). Orcamentos publicos citam 'rufo e contrarrufo' com corte de 15 a 60 cm (ver orcamentos_publicos_desenvolvimento_cm). O que ha de fonte:"},"semFonteRufos":["dobras e desenvolvimento do contrarrufo metalico (profundidade do rasgo e largura das abas)","dobras de rufo de oitao/empena especificas para telha ceramica/concreto (so ha rufos de acessorio de telha metalica)","rufo de encosto em laje, com dobras","rufo de cumeeira em chapa galvanizada n. 24/26 (so cumeeira lisa de telha metalica)","espacamento do parafuso+bucha S-8 em rufo de alvenaria (o SINAPI nao informa; Isoeste usa 500 mm em acessorio proprio)","espessura de rufo pre-pintado","tabela de bitolas dentro da NBR 7008 (texto nao lido); hipotese 0,70/0,55 mm nao confirmada","catalogo Brasilit (site bloqueia robo - HTTP 403); TCPO (pago); catalogos de calhas Tigre/Amanco/Wavin/Kennedy sem desenvolvimento/dobras em fonte aberta"]};
  /* telhado-dados-fim */
  /* VALOR DE PARTIDA — CONFERIR: o que data/telhado-rufos.json lista em "sem_fonte" (20/10/2026) */
  var PADRAO_RUFO = {
    abaTelha: 0.10, abaParede: 0.15,   /* dobras do rufo para telha que NÃO é metálica (cerâmica, concreto, fibrocimento…): sem fonte */
    corteContra: 0.25,                 /* desenvolvimento do contrarrufo metálico: sem fonte (orçamentos públicos: 15 a 60 cm) */
    espBucha: 0.50,                    /* espaçamento do parafuso + bucha S-8 na alvenaria: o SINAPI não dá; a Isoeste usa 500 mm no acessório dela */
    folga: 0.05,                       /* o quanto a parede passa da telha para levar rufo (detecção geométrica, não é norma) */
    obs: "valor de partida — conferir"
  };
  /* hid:fisica — densidade do alumínio (propriedade do material, kg/m³): a ficha do DER-ES dá só a espessura */
  var DENSIDADE_ALUMINIO = 2700;
  var CHAPAS = {
    galv24: { rotulo: "chapa de aço galvanizado nº 24", d: DADOS_TEL.chapas.galv24, sinapi: { 25: "rufo25" } },
    galv26: { rotulo: "chapa de aço galvanizado nº 26", d: DADOS_TEL.chapas.galv26, sinapi: { 33: "rufo33" } },
    aluminio: { rotulo: "chapa de alumínio", d: DADOS_TEL.chapas.aluminio, sinapi: {} }
  };
  function chapaDe(m) { return CHAPAS[m] && CHAPAS[m].d ? m : "galv24"; }
  function kgM2(mat) { var d = CHAPAS[chapaDe(mat)].d; return d.kgM2 != null ? d.kgM2 : d.espessuraMm / 1000 * DENSIDADE_ALUMINIO; }
  function obsChapa(mat) {
    var d = CHAPAS[chapaDe(mat)].d;
    return "e = " + virg(d.espessuraMm, 2) + " mm" + (d.kgM2 != null ? ", " + virg(d.kgM2, 2) + " kg/m²" : " (massa pela densidade do alumínio)") + " — " + d.fonte;
  }
  /* a composição SINAPI só quando bitola e corte batem com ela (94231 = nº 24 corte 25; 100327 = nº 26 corte 33) */
  function sinRufo(mat, corte) { var c = CHAPAS[chapaDe(mat)], k = Object.keys(c.sinapi).filter(function (x) { return Math.abs(Number(x) / 100 - corte) < 1e-6; })[0]; return k ? sin(c.sinapi[k]) : null; }
  /* kg por metro de rufo: corte × massa da chapa × o consumo de chapa por metro da SINAPI 94231 (inclui a perda por corte) */
  function kgPorM(mat, corte) { return corte * kgM2(mat) * DADOS_TEL.fixacao.rufoMPorM; }
  /* o MENOR corte padronizado (SINAPI / DER-ES) da bitola que cobre o desenvolvimento; nenhum → sob medida, sem código */
  function cortePara(mat, dev) {
    var cs = DADOS_TEL.cortes.filter(function (c) { return c.mat === chapaDe(mat) && c.corteCm / 100 >= dev - 1e-9; });
    if (cs.length) return { corte: cs[0].corteCm / 100, padronizado: true, insumo: cs[0].insumo, peca: cs[0].peca, fonte: cs[0].fonte };
    return { corte: Math.ceil(dev * 100 - 1e-6) / 100, padronizado: false, insumo: null, peca: null, fonte: null };
  }
  /* as dobras do rufo pela POSIÇÃO: telha metálica/sanduíche → Kingspan Isoeste TP40 (lateral: a água corre ao longo da parede;
     superior: a telha sobe até a parede); qualquer outra telha → valor de partida */
  function dobrasRufo(familia, pos) {
    var d = (familia === "metalica" || familia === "sanduiche") ? DADOS_TEL.dobras[pos === "superior" ? "superior" : "lateral"] : null;
    if (d) return { abaTelha: d.abaTelhaMm / 1000, abaParede: d.abaParedeMm / 1000, desenvolvimento: d.desenvolvimentoMm / 1000, partida: false,
                    fonte: d.fonte + " — " + d.posicao + (d.desenvolvimentoSomado ? " (desenvolvimento = soma das cotas do desenho)" : "") };
    return { abaTelha: PADRAO_RUFO.abaTelha, abaParede: PADRAO_RUFO.abaParede, desenvolvimento: PADRAO_RUFO.abaTelha + PADRAO_RUFO.abaParede, partida: true,
             fonte: "dobras " + PADRAO_RUFO.obs + " (sem fonte para telha " + (familia || "deste tipo") + "; as dobras com cota são de acessório de telha metálica)" };
  }

  function dentroP(x, z, pts) {
    var d = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var a = pts[i], b = pts[j];
      if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) d = !d;
    }
    return d;
  }
  /* a face de CIMA da telha no ponto (a face de baixo do plano + a espessura na vertical) — null fora do telhado */
  function topoTelhaEm(t, x, z) {
    var best = null;
    arr(t && t.aguasCalc).forEach(function (ag) {
      var pl = ag.plano || {};
      arr(ag.pecas).forEach(function (pc) {
        if (!dentroP(x, z, arr(pc.pts))) return;
        var y = num(pl.a, 0) + num(pl.bx, 0) * x + num(pl.bz, 0) * z;
        if (best == null || y < best.y) best = { y: y, fator: num(ag.fator, 1) };
      });
    });
    return best ? best.y + num(t.espessura, 0) * best.fator : null;
  }
  function sinalArea(P) { var s = 0; for (var i = 0, n = P.length; i < n; i++) { var a = P[i], b = P[(i + 1) % n]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
  /* os encontros de UM telhado: [{k, orig, define, parede, segs:[{a,b,fa,fb,yA,yB}], comprimento, yParede, nIn:{x,z}}] */
  function encontrosDoTelhado(estado, t, opc) {
    opc = opc || {};
    var out = [];
    if (!t || !t.ok || t.modo !== "perimetro") return out;
    var C = contornoDe(t), P = C.P, n = P.length, sg = sinalArea(P) >= 0 ? 1 : -1, folga = fin(Number(opc.folga)) ? Number(opc.folga) : PADRAO_RUFO.folga;
    var daPlat = {};
    arr(estado && estado.platibandas).forEach(function (p) { if (p && p.ok && String(p.telhado) === String(t.id)) arr(p.segs).forEach(function (s) { daPlat[s.k] = true; }); });
    var paredes = arr(estado && estado.caixas).filter(function (c) { return c && c.tipo === "parede" && !c.anexarTopo && fin(Number(c.comprimento)) && fin(Number(c.altura)); });
    for (var k = 0; k < n; k++) {
      if (daPlat[k]) continue;
      var A = P[k], B = P[(k + 1) % n], ex = B[0] - A[0], ez = B[1] - A[1], Le = Math.sqrt(ex * ex + ez * ez);
      if (!(Le > 0.05)) continue;
      ex /= Le; ez /= Le;
      var nIn = { x: -ez * sg, z: ex * sg }, nOut = { x: -nIn.x, z: -nIn.z }, e = t.arestasCalc[k];
      paredes.forEach(function (c) {
        var th = num(c.rotY, 0), ux = Math.cos(th), uz = -Math.sin(th), L = num(c.comprimento, 0), esp = num(c.espessura, 0.15), cx = num(c.cx, 0), cz = num(c.cz, 0);
        if (Math.abs(ux * ez - uz * ex) > 0.05) return;                                   /* paralela à aresta */
        var d = (cx - A[0]) * nOut.x + (cz - A[1]) * nOut.z;                              /* o eixo da parede, para fora (+) */
        if (d < -esp / 2 - 0.02 || d > esp / 2 + 0.10) return;                           /* o corpo da parede toca a linha do contorno */
        var al = (cx - A[0]) * ex + (cz - A[1]) * ez, s0 = Math.max(0, al - L / 2), s1 = Math.min(Le, al + L / 2);
        if (!(s1 - s0 > 0.05)) return;
        var yW = num(c.cy, 0) + num(c.altura, 0) / 2, off = d - esp / 2;                 /* a face da parede do lado do telhado */
        var M = Math.max(40, Math.ceil((s1 - s0) / 0.02)), fs = [], ys = [], i;
        for (i = 0; i <= M; i++) {
          var s = s0 + (s1 - s0) * i / M, sc = Math.max(0.005, Math.min(Le - 0.005, s));
          var y = topoTelhaEm(t, A[0] + ex * sc + nIn.x * 0.03, A[1] + ez * sc + nIn.z * 0.03);
          ys.push(y); fs.push(y == null ? null : yW - (y + folga));
        }
        /* os trechos onde a parede passa da telha (cruzamento interpolado entre as amostras) */
        var segs = [], ini = null, yIni = null;
        function sDe(i) { return s0 + (s1 - s0) * i / M; }
        function fecha(sA, yA, sB, yB) {
          if (!(sB - sA > 0.02)) return;
          function P2(s, o) { return { x: r6(A[0] + ex * s + nOut.x * o), z: r6(A[1] + ez * s + nOut.z * o) }; }
          segs.push({ s0: r4(sA), s1: r4(sB), a: P2(sA, 0), b: P2(sB, 0), fa: P2(sA, off), fb: P2(sB, off), yA: r6(yA), yB: r6(yB) });
        }
        for (i = 0; i <= M; i++) {
          var f = fs[i];
          if (f != null && f > 0) { if (ini == null) {
              if (i > 0 && fs[i - 1] != null) { var u = fs[i - 1] / (fs[i - 1] - f); ini = sDe(i - 1) + (sDe(i) - sDe(i - 1)) * u; yIni = ys[i - 1] + (ys[i] - ys[i - 1]) * u; }
              else { ini = sDe(i); yIni = ys[i]; } }
          } else if (ini != null) {
            var sF = sDe(i - 1), yF = ys[i - 1];
            if (f != null) { var u2 = fs[i - 1] / (fs[i - 1] - f); sF = sDe(i - 1) + (sDe(i) - sDe(i - 1)) * u2; yF = ys[i - 1] + (ys[i] - ys[i - 1]) * u2; }
            fecha(ini, yIni, sF, yF); ini = null;
          }
        }
        if (ini != null) fecha(ini, yIni, sDe(M), ys[M]);
        if (!segs.length) return;
        var Lt = 0; segs.forEach(function (s) { Lt += s.s1 - s.s0; });
        out.push({ k: k, orig: e.orig, define: !!e.define, parede: c.id, yParede: r6(yW), afastamento: r4(off), nIn: { x: r6(nIn.x), z: r6(nIn.z) }, segs: segs, comprimento: r4(Lt) });
      });
    }
    return out;
  }
  /* "superior" quando a água junto da parede sobe na direção dela (o plano cresce para fora do contorno); senão "lateral" */
  function posicaoEncontro(t, en) {
    var s = en.segs[0]; if (!s) return "lateral";
    var mx = (s.a.x + s.b.x) / 2 + en.nIn.x * 0.05, mz = (s.a.z + s.b.z) / 2 + en.nIn.z * 0.05, g = null;
    arr(t.aguasCalc).forEach(function (ag) { arr(ag.pecas).forEach(function (pc) { if (!g && dentroP(mx, mz, arr(pc.pts))) g = ag.plano || null; }); });
    if (!g) return "lateral";
    var gx = num(g.bx, 0), gz = num(g.bz, 0), m = Math.sqrt(gx * gx + gz * gz);
    if (!(m > 1e-9)) return "lateral";
    return (gx * -en.nIn.x + gz * -en.nIn.z) / m > Math.SQRT1_2 ? "superior" : "lateral";
  }
  function calcularRufo(f, telhados, estado) {
    var r = clone(f), avisos = [], t = telhados[String(f.telhado)];
    r.tipo = "rufoEncontro"; r.ifc = "IFCCOVERING"; r.ifcPre = "FLASHING"; r.ok = false; r.encontros = []; r.comprimentoRufo = 0; r.comprimentoContra = 0;
    r.materialEf = chapaDe(f.material); r.chapa = CHAPAS[r.materialEf].rotulo; r.obsChapa = obsChapa(r.materialEf);
    var ccF = cortePara(r.materialEf, fin(Number(f.corteContra)) ? Number(f.corteContra) : PADRAO_RUFO.corteContra);
    r.corteContraEf = ccF.corte; r.corteContraInfo = ccF; r.corteRufoEf = null;
    if (!t) { avisos.push("O telhado deste rufo não existe mais."); r.avisos = avisos; return r; }
    if (!t.ok || t.modo !== "perimetro") { avisos.push("O rufo de encontro segue o contorno do telhado por perímetro que fechou."); r.avisos = avisos; return r; }
    var emb = {}; arr(estado && estado.calhasEmbutidas).forEach(function (c) { if (c && c.ok && String(c.telhado) === String(t.id)) arr(c.arestas).forEach(function (o) { emb[Number(o)] = true; }); });
    var LR = 0, LC = 0, Tm = BT(), tel = Tm && Tm.telha ? Tm.telha(t.tipoId) : null, fam = tel ? tel.familia : null, kgR = 0;
    r.familiaTelha = fam;
    encontrosDoTelhado(estado, t, { folga: f.folga }).forEach(function (en) {
      en.rufo = !(en.define && emb[en.orig]);                 /* no beiral com calha embutida a calha recebe a água: só o contrarrufo */
      en.contra = true;
      /* a posição pela inclinação junto da parede: a telha SOBE até ela (superior) ou corre ao longo dela (lateral) */
      en.posicao = en.define ? "beiral" : posicaoEncontro(t, en);
      en.dobras = dobrasRufo(fam, en.posicao);
      var cr = fin(Number(f.corteRufo)) ? { corte: Number(f.corteRufo), padronizado: false, insumo: null, fonte: "corte informado na op" } : cortePara(r.materialEf, en.dobras.desenvolvimento);
      en.corteRufo = cr.corte; en.corteRufoInfo = cr; en.sinapiRufo = sinRufo(r.materialEf, cr.corte);
      /* o desenho: o contrarrufo cobre a aba do rufo com o recobrimento da fonte */
      var rec = num(DADOS_TEL.contrarrufo.recobrimentoM, 0);
      en.contraDe = r4(Math.max(0, en.dobras.abaParede - rec)); en.contraAte = r4(en.contraDe + r.corteContraEf / 2);
      if (en.rufo) { kgR += en.comprimento * kgPorM(r.materialEf, cr.corte); r.corteRufoEf = Math.max(r.corteRufoEf || 0, cr.corte); }
      if (en.define && !emb[en.orig]) avisos.push("A aresta " + (en.orig + 1) + " é beiral (a água sai por ela) e encosta na parede " + en.parede + ", mais alta que a telha: precisa de calha embutida (Cobertura completa › Calha embutida) — o rufo sozinho não leva a água.");
      if (en.rufo) LR += en.comprimento; LC += en.comprimento;
      r.encontros.push(en);
    });
    r.comprimentoRufo = r4(LR); r.comprimentoContra = r4(LC);
    if (r.corteRufoEf == null) r.corteRufoEf = cortePara(r.materialEf, PADRAO_RUFO.abaTelha + PADRAO_RUFO.abaParede).corte;
    r.kgPorMRufo = r4(LR > 0 ? kgR / LR : kgPorM(r.materialEf, r.corteRufoEf)); r.kgPorMContra = r4(kgPorM(r.materialEf, r.corteContraEf));
    r.kgRufo = r4(kgR); r.kgContra = r4(LC * r.kgPorMContra);
    /* as peças por corte (o quantitativo sai por corte: cada um tem o seu código ou é "orçar à parte") */
    var pc = {};
    r.encontros.forEach(function (e) {
      if (!e.rufo) return;
      var k = String(e.corteRufo);
      if (!pc[k]) pc[k] = { corte: e.corteRufo, comprimento: 0, sinapi: e.sinapiRufo, info: e.corteRufoInfo, dobras: e.dobras, posicoes: [] };
      pc[k].comprimento = r4(pc[k].comprimento + e.comprimento); if (pc[k].posicoes.indexOf(e.posicao) < 0) pc[k].posicoes.push(e.posicao);
    });
    r.pecasRufo = Object.keys(pc).map(function (k) { return pc[k]; }).sort(function (a, b) { return a.corte - b.corte; });
    /* fixação por metro (SINAPI 94231, sobre MADEIRA): rebite, prego inox 18 × 27, selante, solda; contrarrufo na alvenaria:
       parafuso + bucha S-8 "em substituição aos pregos" (sem coeficiente publicado → espaçamento de partida) */
    var FX = DADOS_TEL.fixacao, Lt = LR + LC;
    r.fixacao = { rebites: Math.ceil(Lt * FX.rebitesPorM), pregos: Math.ceil(LR * FX.pregosPorM), parafusoBucha: Math.ceil(LC / PADRAO_RUFO.espBucha),
                  selanteM: r4(Lt), selanteCartuchos: Math.ceil(Lt * FX.cartuchoPorM - 1e-9), soldaKg: r4(Lt * FX.soldaKgPorM), fonte: FX.fonte };
    r.sinapiRufo = r.pecasRufo.length === 1 ? r.pecasRufo[0].sinapi : null; r.sinapiContra = sinRufo(r.materialEf, r.corteContraEf);
    /* (revisor pluvial 2, 20/10/2026) a fixação À PARTE só dos metros SEM composição: a 94231 já traz rebite, prego, selante e
       solda por metro. Antes valia "algum rufo tem composição?" para TUDO: telha metálica com chapa nº 24 (rufo TP40 sob medida,
       contrarrufo pela 94231) orçava a fixação dos 20 m de contrarrufo duas vezes — e o caso inverso a deixava de fora */
    var LRs = 0; r.pecasRufo.forEach(function (p) { if (!p.sinapi) LRs += p.comprimento; });
    var LCs = r.sinapiContra ? 0 : LC, Ls = LRs + LCs;
    r.fixacaoAParte = { metros: r4(Ls), metrosRufo: r4(LRs), metrosContra: r4(LCs), rebites: Math.ceil(Ls * FX.rebitesPorM), pregos: Math.ceil(LRs * FX.pregosPorM),
                        selanteM: r4(Ls), selanteCartuchos: Math.ceil(Ls * FX.cartuchoPorM - 1e-9), soldaKg: r4(Ls * FX.soldaKgPorM) };
    r.ok = true;
    if (!r.encontros.length) avisos.push("Nenhuma parede mais alta que a telha encosta no contorno deste telhado: sem rufo de encontro.");
    if (avisos.length) r.avisos = avisos;
    return r;
  }

  /* ============================================================ T2: INTENSIDADE PELA CIDADE DA OBRA (NBR 10844, Tabela 5)
     A cidade vem da OBRA (Store 'obras': cidade/uf quando houver, senão o texto do local/endereço) e, sem ela, do CLIENTE da obra.
     Na tabela → o valor do posto para o período de retorno (coberturas: pela tabela de situações). FORA da tabela → o MAIOR valor
     da tabela para o mesmo período (a favor da segurança) + AVISO com os postos vizinhos sugeridos (nota a) — nunca valor inventado. */
  function semAcento(s) { s = txt(s); try { if (s.normalize) s = s.normalize("NFD"); } catch (e) {} return s.replace(/[̀-ͯ]/g, "").toLowerCase(); }
  function palavras(s) { return " " + semAcento(s).replace(/[^a-z0-9]+/g, " ").trim() + " "; }
  function NRm() { return dep("HidNormas", "./hidnormas.js"); }
  function localidades() { var NR = NRm(), vis = {}, out = []; if (!NR) return out; arr(NR.linhas("ap.intensidade.localidade", null)).forEach(function (l) { if (!vis[l.localidade]) { vis[l.localidade] = 1; out.push(l.localidade); } }); return out; }
  /* o posto da Tabela 5 citado num texto livre ("Rua X, 10, Centro, Belo Horizonte - MG") — o nome mais comprido que casa */
  /* REVISÃO 20/10/2026 — o posto é a CIDADE do endereço, não qualquer nome de cidade escrito nele. O defeito: "Rua Ouro Preto, 100,
     Uberlândia - MG" achava Ouro Preto/MG (211 mm/h) em vez de "fora da tabela" (o maior, 246 mm/h + aviso); "Rua Sete Lagoas, 10,
     Betim - MG" dava 182 mm/h — 26 % a menos, sem aviso. Regra: o nome do posto tem de FECHAR o texto (descontados UF, nome do
     estado, CEP, "Brasil" e números no fim). Cidade com vários postos (Rio de Janeiro, São Paulo): o do bairro citado; sem bairro,
     o de MAIOR intensidade para o período (a favor da segurança). */
  var UFS = { ac: 1, al: 1, ap: 1, am: 1, ba: 1, ce: 1, df: 1, es: 1, go: 1, ma: 1, mt: 1, ms: 1, mg: 1, pa: 1, pb: 1, pr: 1, pe: 1, pi: 1, rj: 1, rn: 1, rs: 1, ro: 1, rr: 1, sc: 1, sp: 1, se: 1, to: 1 };
  var ESTADOS = ["acre", "alagoas", "amapa", "amazonas", "bahia", "ceara", "distrito federal", "espirito santo", "goias", "maranhao", "mato grosso do sul", "mato grosso", "minas gerais", "para", "paraiba",
                 "parana", "pernambuco", "piaui", "rio de janeiro", "rio grande do norte", "rio grande do sul", "rondonia", "roraima", "santa catarina", "sao paulo", "sergipe", "tocantins", "brasil"];
  function fimDoEndereco(W, comEstado) {
    var tk = W.trim().split(" ").filter(Boolean), mudou = true;
    while (mudou && tk.length) {
      mudou = false;
      var u = tk[tk.length - 1];
      if (UFS[u] || u === "cep" || /^\d+$/.test(u)) { tk.pop(); mudou = true; continue; }
      for (var e = 0; comEstado && e < ESTADOS.length; e++) {
        var es = ESTADOS[e].split(" ");
        if (tk.length > es.length && tk.slice(tk.length - es.length).join(" ") === ESTADOS[e]) { tk.splice(tk.length - es.length, es.length); mudou = true; break; }
      }
    }
    return " " + tk.join(" ") + " ";
  }
  function postoInfo(texto, T) {
    var W = palavras(texto), Wfs = [fimDoEndereco(W, false), fimDoEndereco(W, true)], cands = [];
    if (!W.trim()) return { loc: null, varios: [] };
    var exato = localidades().filter(function (loc) { return String(loc).trim() === String(texto).trim(); })[0];
    if (exato) return { loc: exato, varios: [] };   /* o nome do posto como está na tabela (o que a tela devolve) */
    localidades().forEach(function (loc) {
      var m = String(loc).match(/^([^/(]*)(?:\/([^(]*))?(?:\((.*)\))?/) || [], nome = palavras(m[1] || loc), uf = m[2] && m[2].trim() ? palavras(m[2]) : null, bairro = m[3] ? palavras(m[3]) : null;
      if (!nome.trim() || !Wfs.some(function (Wf) { return Wf.length >= nome.length && Wf.slice(Wf.length - nome.length) === nome; })) return;   /* o posto FECHA o texto (com ou sem o nome do estado no fim) */
      var ufs = W.match(/ (ac|al|ap|am|ba|ce|df|es|go|ma|mt|ms|mg|pa|pb|pr|pe|pi|rj|rn|rs|ro|rr|sc|sp|se|to)(?= )/g);
      if (uf && ufs && ufs.length && ufs.map(function (x) { return x + " "; }).indexOf(uf) < 0) return;
      cands.push({ loc: loc, n: nome.length + (bairro && W.indexOf(bairro) >= 0 ? 1000 : 0), nome: nome });
    });
    if (!cands.length) return { loc: null, varios: [] };
    var nMax = Math.max.apply(null, cands.map(function (c) { return c.n; })), top = cands.filter(function (c) { return c.n === nMax; });
    if (top.length === 1) return { loc: top[0].loc, varios: [] };
    /* mesma cidade, vários postos, nenhum bairro citado: o de maior intensidade para o período */
    var NR = NRm(), Tq = T != null ? T : 5;
    function iDe(loc) { var l = NR ? arr(NR.linhas("ap.intensidade.localidade", { localidade: loc, periodo_anos: Tq })).filter(function (x) { return fin(Number(x.intensidade_mm_h)); })[0] : null; return l ? Number(l.intensidade_mm_h) : -1; }
    top.sort(function (a, b) { return iDe(b.loc) - iDe(a.loc); });
    return { loc: top[0].loc, varios: top.map(function (c) { return c.loc; }) };
  }
  function postoNoTexto(texto, T) { return postoInfo(texto, T).loc; }
  function cidadeDaObra(obra, cliente) {
    obra = obra || {}; cliente = cliente || {};
    var cands = [];
    if (txt(obra.cidade).trim()) cands.push({ t: txt(obra.cidade) + (obra.uf ? "/" + obra.uf : ""), o: "obra (cidade/UF)" });
    ["local", "endereco", "enderecoEntrega"].forEach(function (k) { if (txt(obra[k]).trim()) cands.push({ t: txt(obra[k]), o: "obra (" + k + ")" }); });
    /* REVISÃO 20/10/2026: o CLIENTE só quando a obra não tem endereço nenhum. Antes, obra fora da Tabela 5 (Uberlândia) com
       cliente morando em Belo Horizonte saía com os 227 mm/h de BH — a chuva do lugar errado, sem aviso. */
    if (!cands.length) {
      if (txt(cliente.cidade).trim()) cands.push({ t: txt(cliente.cidade) + (cliente.uf ? "/" + cliente.uf : ""), o: "cliente (cidade/UF)" });
      if (txt(cliente.endereco).trim()) cands.push({ t: txt(cliente.endereco), o: "cliente (endereço)" });
    }
    for (var i = 0; i < cands.length; i++) { var p = postoInfo(cands[i].t); if (p.loc) return { cidade: p.loc, naTabela: true, texto: cands[i].t, origem: cands[i].o, varios: p.varios }; }
    return cands.length ? { cidade: cands[0].t, naTabela: false, texto: cands[0].t, origem: cands[0].o } : { cidade: null, naTabela: false, texto: "", origem: null };
  }
  function periodoCobertura(situacao) {
    var NR = NRm(); if (!NR) return null;
    var c = NR.consulta("ap.periodo_retorno.situacao", { situacao: situacao || "cobertura" }, "anos");
    return c.ok ? num(c.valor, null) : null;
  }
  function intensidadeNBR(cidadeTexto, T) {
    var NR = NRm(), r = { valor_mm_h: null, periodo_anos: T, localidade: null, origem: null, aviso: null, texto: "", fonte: null };
    if (!NR || T == null) { r.aviso = "Período de retorno ou tabela de intensidades indisponível."; return r; }
    var ls = arr(NR.linhas("ap.intensidade.localidade", { periodo_anos: T })).filter(function (l) { return fin(Number(l.intensidade_mm_h)); });
    r.fonte = NR.fonte("ap.intensidade.localidade");
    var pinf = cidadeTexto ? postoInfo(cidadeTexto, T) : { loc: null, varios: [] }, posto = pinf.loc, lin = posto ? ls.filter(function (l) { return l.localidade === posto; })[0] : null;
    if (lin) {
      r.valor_mm_h = Number(lin.intensidade_mm_h); r.localidade = posto; r.origem = "tabela";
      r.texto = "I = " + r.valor_mm_h + " mm/h — NBR 10844 Tabela 5, " + posto + ", T = " + T + " anos" + (lin.periodo_observado_anos ? " (período observado " + lin.periodo_observado_anos + " anos, nota b)" : "");
      if (pinf.varios.length > 1) r.aviso = "A cidade tem " + pinf.varios.length + " postos na Tabela 5 (" + pinf.varios.join("; ") + ") e o endereço não cita o bairro: adotado o de MAIOR intensidade para T = " + T + " anos (" + posto + ", " + r.valor_mm_h + " mm/h). Escreva o posto se for outro.";
      return r;
    }
    var mx = ls.reduce(function (m, l) { return !m || Number(l.intensidade_mm_h) > Number(m.intensidade_mm_h) ? l : m; }, null);
    if (!mx) { r.aviso = "A Tabela 5 não tem intensidade para T = " + T + " anos."; return r; }
    var viz = [];
    try { var v = cidadeTexto ? NR.linhas("ap.postos_vizinhos", null).filter(function (x) { return palavras(cidadeTexto).indexOf(palavras(String(x.localidade).split("/")[0])) >= 0; })[0] : null; if (v) viz = [v.posto1, v.posto2].filter(Boolean); } catch (e) {}
    r.valor_mm_h = Number(mx.intensidade_mm_h); r.localidade = mx.localidade; r.origem = "maior_da_tabela";
    r.texto = "I = " + r.valor_mm_h + " mm/h — o MAIOR valor da Tabela 5 da NBR 10844 para T = " + T + " anos (" + mx.localidade + "), adotado a favor da segurança";
    r.aviso = (posto ? "O posto " + posto + " da Tabela 5 não tem intensidade para T = " + T + " anos" : cidadeTexto ? "A cidade da obra (" + cidadeTexto + ") não está na Tabela 5 da NBR 10844" : "A obra não tem cidade/endereço cadastrado") +
              ": adotado o MAIOR valor da tabela para T = " + T + " anos (" + r.valor_mm_h + " mm/h, " + mx.localidade + "). Confirme o posto de clima semelhante (nota a da tabela)" +
              (viz.length ? " — sugeridos: " + viz.join(", ") : "") + " ou informe a intensidade com a fonte.";
    return r;
  }

  /* ============================================================ T2: CALHAS, DESCIDAS E CONDUTORES PELA NBR 10844 — o LOTE
     gerarPluvial(opsBase, cfg) → { ok, lote:{op:"lote", id:"tel-calha-lote", ops}, intensidade, calhas:[…], rufos:[…], memorial:[texto],
                                   avisos, premissas, pendencias, verificacao (o js/hidap.js refeito com o lote aplicado) }
     cfg = { cidade?|obra?+cliente?, situacao? ("cobertura"), periodoRetorno_anos?, intensidade_mm_h?+fonteIntensidade?, calhaBeiral?:bool,
             material? ("galv24"|"galv26"|"aluminio"), rufos?:bool (true), ligarHidro?:bool (true), declividadePct?, descidasMin? (2), telhado? }
     IDEMPOTENTE: ids fixos com o prefixo "tel-calha-"/"tel-rufo-" (calha de beiral "tel-calha-b-<telhado>", descida
     "tel-calha-<calha>-cd<n>", tubo pluvial do hidro "tel-calha-ap-<calha>-<n>", rufo "tel-rufo-<telhado>"); rodar de novo
     devolve as mesmas ops; o que sobrou de uma rodada anterior (descida a mais) sai por "apagar".
     ÁREA: caso (b) da tabela da norma, A = (a + h/2)·b, sobre a PROJEÇÃO DA ÁGUA COM O BEIRAL (as águas do js/bimtelhado.js são
     cortadas no contorno do beiral) — h = a·i. Q = I·A/60 (L/min). CALHA: retangular de chapa, Manning (js/hidap.js), n do
     material e lâmina = metade da altura (premissa da RA, como antes), declividade mínima da norma. DESCIDAS: nas extremidades
     (divisor de águas entre elas), mais descidas no meio do maior vão até a calha passar. CONDUTOR: a tabela DN × vazão de
     ÁBACO da Figura 3 da NBR 10844, digitalizado (PLUVIAL 2 — antes: a tabela secundária de Botelho & Ribeiro Jr.), e o diâmetro interno mínimo da norma.
     Ligação com o hidro: cada descida vira um trecho "pluvial" vertical do js/biminst.js (op trecho, sem mexer no biminst); a
     ponta de baixo fica como ESPERA PLUVIAL no piso (o condutor horizontal / caixa de areia é do projeto hidrossanitário). */
  var PREFIXO = "tel-calha-";
  /* ============================================================ PLUVIAL 2: CONDUTOR VERTICAL PELO ÁBACO DA NBR 10844 (Figura 3)
     Item 5.6.4.1: levantar a vertical por Q até as curvas de H (lâmina na calha) e de L (comprimento do condutor) e levar a
     interseção MAIS ALTA ao eixo D — o mesmo que Q_max(D) = min(Q da curva H, Q da curva L); adotar o DN cujo diâmetro interno
     é ≥ D. As curvas são as DIGITALIZADAS do desenho (DADOS_TEL.abaco, ±2–3 %). Entre duas curvas: interpolação linear; fora do
     desenho, nada é estendido: H abaixo da 1ª curva ou L abaixo da 1ª = o ábaco não informa (null); H acima da última = a curva
     mais alta e L acima da última finita = a de 25 m; curva não desenhada no D pedido = a de valor menor desenhada ali (as três a
     favor da segurança: Q cresce com H e com L). */
  function qCurva(pts, D) {
    if (!pts.length || D < pts[0][0] - 1e-9 || D > pts[pts.length - 1][0] + 1e-9) return null;
    for (var i = 0; i + 1 < pts.length; i++) if (D <= pts[i + 1][0] + 1e-9) { var a = pts[i], b = pts[i + 1]; return a[1] + (b[1] - a[1]) * (D - a[0]) / (b[0] - a[0]); }
    return pts[pts.length - 1][1];
  }
  /* Q cresce com H e com L: a curva que não está DESENHADA neste D (o desenho para antes) é trocada pela curva de valor MENOR
     mais próxima que está desenhada — nunca pela de cima (a favor da segurança; o ábaco não é estendido) */
  function qFamilia(curvas, chave, v, D) {
    var cs = curvas.filter(function (c) { return c[chave] != null; });
    if (!cs.length || v < cs[0][chave] - 1e-9) return null;
    var ve = Math.min(v, cs[cs.length - 1][chave]), i, lo = 0;
    for (i = 0; i < cs.length; i++) if (cs[i][chave] <= ve + 1e-9) lo = i;
    var qa = qCurva(cs[lo].pts, D);
    if (qa != null && Math.abs(cs[lo][chave] - ve) < 1e-9) return qa;
    if (qa != null && lo + 1 < cs.length) {
      var qb = qCurva(cs[lo + 1].pts, D);
      if (qb != null) return qa + (qb - qa) * (ve - cs[lo][chave]) / (cs[lo + 1][chave] - cs[lo][chave]);
      return qa;
    }
    for (i = lo - 1; i >= 0; i--) { var q = qCurva(cs[i].pts, D); if (q != null) return q; }
    return null;
  }
  function painelAbaco(saida) { return DADOS_TEL.abaco[saida === "funil" ? "funil" : "aresta_viva"]; }
  /* a vazão máxima do condutor de diâmetro interno D (mm) com lâmina H (mm) e comprimento L (m) → {Q, QH, QL, limita} | null */
  function qAbaco(saida, D, H, L) {
    var P = painelAbaco(saida), QH = qFamilia(P.H, "H", H, D), QL = qFamilia(P.L, "L", L, D);
    if (QH == null || QL == null) return null;
    return { Q: Math.min(QH, QL), QH: QH, QL: QL, limita: QH <= QL ? "H" : "L" };
  }
  /* o MENOR DN (PVC série R) com Di ≥ o mínimo da norma e Q do ábaco ≥ a vazão da descida */
  function dnPeloAbaco(qLmin, H, L, opc) {
    opc = opc || {};
    var P = painelAbaco(opc.saida), dns = arr(opc.dnsMat), dmin = opc.diMin;
    for (var i = 0; i < P.dn.length; i++) {
      var x = P.dn[i];
      if (dmin != null && x.di < dmin) continue;
      if (dns.length && dns.indexOf(x.dn) < 0) continue;
      var q = qAbaco(opc.saida, x.di, H, L);
      if (q && q.Q >= qLmin - 1e-9) return { dn: x.dn, di: x.di, Q: q.Q, QH: q.QH, QL: q.QL, limita: q.limita, H: H, L: L, painel: opc.saida === "funil" ? "funil" : "aresta_viva" };
    }
    return null;
  }
  /* REVISÃO 20/10/2026 — a ÁREA DE CADA DESCIDA pela GEOMETRIA da água, não pela fração do comprimento da calha.
     O defeito que isto corrige: a divisão "Q da calha × fração do comprimento" supõe a mesma área por metro de calha. No telhado
     de 4 águas o trapézio do lado comprido tem a profundidade cheia no meio e o triângulo da ponta vai a zero; na quina
     reentrante (casa em L) o rincão despeja as duas águas vizinhas na quina. Casa em L 20 × 20 (alas de 8 m), 30 %, BH: a descida
     da quina reentrante saía com 49,7 m² (188 L/min → DN 100, que leva 226,8 L/min); pela geometria são ~83 m² (≈ 314 L/min →
     DN 100 estoura). Telhado de 4 águas 20 × 60: descida no meio do lado comprido com 138,5 m² (524 L/min → DN 150) contra
     186,5 m² (706 L/min > 691,8 L/min do DN 150). Regra física: cada ponto da água escorre no sentido da maior declividade até
     a borda da água; se a borda é o beiral, cai ali; se é um rincão, corre por ele até a ponta de baixo (a quina). A posição na
     calha vai para a descida mais próxima ao longo dela (o divisor de águas fica no meio do vão, a mesma regra de antes).
     A área de cada água continua a do caso (b) da norma; a geometria só reparte. */
  function sNaLinha(segs, p) {
    var best = null, ac = 0;
    segs.forEach(function (sg) {
      var dx = sg.b.x - sg.a.x, dz = sg.b.z - sg.a.z, L2 = dx * dx + dz * dz, L = Math.sqrt(L2);
      var u = L2 > 0 ? Math.max(0, Math.min(1, ((p.x - sg.a.x) * dx + (p.z - sg.a.z) * dz) / L2)) : 0;
      var qx = sg.a.x + dx * u, qz = sg.a.z + dz * u, d = Math.sqrt((p.x - qx) * (p.x - qx) + (p.z - qz) * (p.z - qz));
      /* REVISOR N23: a posição ao longo da calha na MESMA régua das descidas (Lseg — com a calha na cota certa é o comprimento da borda da
         telha, não o do meio da calha); na régua do meio o divisor de águas andava até (largura/2 − 5 cm) por quina */
      var Lr = Lseg(sg);
      if (!best || d < best.d - 1e-9) best = { s: ac + Lr * u, d: d };
      ac += Lr;
    });
    return best;
  }
  /* cada amostra da água (pesos iguais, grade alinhada com a declividade: colunas de largura hw na horizontal da água) vira o
     trecho [s0, s1] da calha onde ela cai — a coluna cai num pedaço do beiral; a que sai por rincão cai num ponto (s0 = s1).
     null quando não dá para amostrar (o chamador volta para a fração do comprimento). */
  function destinosDaAgua(ag, segsT) {
    var pl = ag.plano || {}, bx = num(pl.bx, 0), bz = num(pl.bz, 0), g = Math.sqrt(bx * bx + bz * bz), out = [];
    if (!(g > 1e-9) || !segsT.length) return null;
    var dx = -bx / g, dz = -bz / g, px = -dz, pz = dx, mapa = {};     /* d = morro abaixo; p = na horizontal da água */
    function poe(a, b) { var k = a.toFixed(4) + "|" + b.toFixed(4); if (mapa[k]) mapa[k][2]++; else { mapa[k] = [a, b, 1]; out.push(mapa[k]); } }   /* amostras iguais somam peso */
    function yEm(q) { return num(pl.a, 0) + bx * q.x + bz * q.z; }
    arr(ag.pecas).forEach(function (pc) {
      var pts = arr(pc.pts), n = pts.length, i, u0 = Infinity, u1 = -Infinity, w0 = Infinity, w1 = -Infinity;
      if (n < 3) return;
      for (i = 0; i < n; i++) { var uq = pts[i].x * dx + pts[i].z * dz, wq = pts[i].x * px + pts[i].z * pz; u0 = Math.min(u0, uq); u1 = Math.max(u1, uq); w0 = Math.min(w0, wq); w1 = Math.max(w1, wq); }
      if (!(u1 - u0 > 1e-6) || !(w1 - w0 > 1e-6)) return;
      var NW = 240, NU = 40, hw = (w1 - w0) / NW, hu = (u1 - u0) / NU, iu, iw;
      for (iw = 0; iw < NW; iw++) for (iu = 0; iu < NU; iu++) {
        var w = w0 + (iw + 0.5) * hw, u = u0 + (iu + 0.5) * hu, x = u * dx + w * px, z = u * dz + w * pz;
        if (!dentroP(x, z, pts)) continue;
        var tMin = Infinity, eI = -1;
        for (i = 0; i < n; i++) {
          var a = pts[i], b = pts[(i + 1) % n], ex = b.x - a.x, ez = b.z - a.z, den = dx * ez - dz * ex;
          if (Math.abs(den) < 1e-12) continue;
          var wx = a.x - x, wz = a.z - z, tt = (wx * ez - wz * ex) / den, uu = (wx * dz - wz * dx) / den;
          if (tt > 1e-9 && uu >= -1e-9 && uu <= 1 + 1e-9 && tt < tMin) { tMin = tt; eI = i; }
        }
        if (eI < 0) continue;
        var X = { x: x + dx * tMin, z: z + dz * tMin }, q = sNaLinha(segsT, X);
        if (q && q.d > 0.6) { var pa = pts[eI], pb = pts[(eI + 1) % n]; q = sNaLinha(segsT, yEm(pa) <= yEm(pb) ? pa : pb); if (q) poe(q.s, q.s); continue; }   /* rincão: corre até a ponta de baixo */
        if (!q) continue;
        var qa = sNaLinha(segsT, { x: X.x - px * hw / 2, z: X.z - pz * hw / 2 }), qb = sNaLinha(segsT, { x: X.x + px * hw / 2, z: X.z + pz * hw / 2 });
        var sa = qa ? qa.s : q.s, sb = qb ? qb.s : q.s;
        if (Math.abs(sb - sa) > hw * 2) poe(q.s, q.s); else poe(Math.min(sa, sb), Math.max(sa, sb));   /* coluna que cruza uma quina: no ponto */
      }
    });
    return out.length ? out : null;
  }
  /* REVISOR N23 (23/10/2026): os passos do gerarPluvial que repartem a água da calha entre as descidas, fora dele, para a VERIFICAÇÃO
     (dimensionarCalhas com `comoGerador`, que o diagnóstico usa) seguir exatamente a mesma regra. O defeito: o diagnóstico verificava cada
     descida com a vazão TOTAL da calha (as duas águas de uma calha de beiral em arestas opostas somadas) e o coeficiente de curva em toda
     ponta; o "Recalcular pela NBR 10844" gerava 150 × 100 mm com 4 descidas (casa 8 × 10, 2 águas, BH) e o diagnóstico logo depois dizia
     "não comporta" (538 > 279 L/min) e oferecia uma calha maior (dinheiro a mais) — ou nenhuma solução (4 águas 20 × 60: 500 × 200 "não passa").
     trechosDaCalha: a calha em TRECHOS CONTÍNUOS (a de beiral em duas arestas opostas são duas linhas), as quinas e se dá a volta. */
  function trechosDaCalha(segs) {
    var cad = [], k;
    for (k = 0; k < segs.length; k++) {
      var s = segs[k], Ls = Lseg(s), ult = cad[cad.length - 1];
      if (!ult || distP(segs[k - 1].b, s.a) > 0.05) { ult = { ini: 0, L: 0, quinas: [], origs: {}, fechada: false, segs: [] }; cad.push(ult); ult.offset = cad.length > 1 ? cad[cad.length - 2].offset + cad[cad.length - 2].L : 0; }
      else {
        var p = segs[k - 1], ux = p.b.x - p.a.x, uz = p.b.z - p.a.z, vx = s.b.x - s.a.x, vz = s.b.z - s.a.z, lu = Math.sqrt(ux * ux + uz * uz), lv = Math.sqrt(vx * vx + vz * vz);
        if (lu > 1e-6 && lv > 1e-6 && Math.abs((ux * vz - uz * vx) / (lu * lv)) > 0.17) ult.quinas.push(ult.L);
      }
      ult.L += Ls; ult.segs.push(s); if (s.orig != null) ult.origs[Number(s.orig)] = true;
      ult.ultimo = s; if (ult.primeiro == null) ult.primeiro = s;
    }
    cad.forEach(function (c) { if (c.primeiro !== c.ultimo && distP(c.ultimo.b, c.primeiro.a) < 0.05) { c.fechada = true; c.quinas.push(0); } });
    return cad;
  }
  /* as águas que escorrem para o trecho `c` (caso b, com o beiral) e de onde cada ponto delas cai na calha (c.areas, c.A, c.amostras já criados) */
  function aguasDoTrecho(c, ags, t) {
    ags.forEach(function (ag) {
      var e = arr(t.arestasCalc)[ag.aresta]; if (!e || !c.origs[e.orig]) return;
      var ar = areaCasoB(ag); if (!ar) return;
      var A = (ar.a + ar.h / 2) * ar.b;
      c.areas.push({ aresta: e.orig, a: ar.a, b: ar.b, h: ar.h, i: num(ag.inclinacao, 0), A: r4(A), beiral: num(t.beiralEf, 0) }); c.A += A;
      c.amostras.push({ A: A, ss: destinosDaAgua(ag, c.segs) });
    });
  }
  /* a fração da água do trecho que vai para cada descida (c.pos = posições no trecho, ordenadas) */
  function influenciaTrecho(c) {
    var P = c.pos, L = c.L;
    /* pela geometria (ver destinosDaAgua); só cai na fração do comprimento se alguma água não deu para amostrar */
    if (c.A > 0 && c.amostras.length && c.amostras.every(function (am) { return am.ss; })) {
      var f = P.map(function () { return 0; }), nP = P.length;
      /* o vão de cada descida: do meio do vão anterior ao meio do seguinte (na calha que dá a volta, circular) */
      var lim = P.map(function (p, i) {
        if (c.fechada) { if (nP === 1) return [p - L / 2, p + L / 2]; return [p - ((p - P[(i - 1 + nP) % nP] + L) % L) / 2, p + ((P[(i + 1) % nP] - p + L) % L) / 2]; }
        return [i === 0 ? -Infinity : (P[i - 1] + p) / 2, i === nP - 1 ? Infinity : (p + P[i + 1]) / 2];
      });
      function perto(s) { var bi = 0, bd = Infinity; P.forEach(function (p, i) { var d = Math.abs(s - p); if (c.fechada) d = Math.min(d, L - d); if (d < bd - 1e-9) { bd = d; bi = i; } }); return bi; }
      c.amostras.forEach(function (am) {
        var cnt = P.map(function () { return 0; }), pesoT = 0;
        am.ss.forEach(function (ab) {
          var a = ab[0], b = ab[1], pw = ab[2], larg = b - a, fr = P.map(function () { return 0; }), tot = 0;
          if (larg > 1e-9) lim.forEach(function (lm, i) {
            (c.fechada ? [-L, 0, L] : [0]).forEach(function (sh) { var o = Math.min(b, lm[1] + sh) - Math.max(a, lm[0] + sh); if (o > 0) { fr[i] += o / larg; tot += o / larg; } });
          });
          pesoT += pw;
          if (tot > 1e-9) fr.forEach(function (x, i) { cnt[i] += pw * x / tot; }); else cnt[perto((a + b) / 2)] += pw;
        });
        cnt.forEach(function (k, i) { f[i] += am.A * k / pesoT; });
      });
      return f.map(function (x) { return x / c.A; });
    }
    return P.map(function (s, i) {
      if (c.fechada) { if (P.length === 1) return 1; var ant = P[(i - 1 + P.length) % P.length], pro = P[(i + 1) % P.length]; return (((s - ant + L) % L) + ((pro - s + L) % L)) / 2 / L; }
      var ini = i === 0 ? 0 : (P[i - 1] + s) / 2, fim2 = i === P.length - 1 ? L : (s + P[i + 1]) / 2; return (fim2 - ini) / L;
    });
  }
  function distQuinaTrecho(c, s) { var m = null; c.quinas.forEach(function (q) { var d = Math.abs(s - q); if (c.fechada) d = Math.min(d, c.L - d); if (m == null || d < m) m = d; }); return m; }
  /* VERIFICAÇÃO com as descidas que existem, pela regra do gerador: a área de influência de cada descida (geometria da água) e a curva só
     quando há QUINA a ≤ 4 m dela (a ponta fechada da calha não é mudança de direção). → { condutorId: { areaInfluencia_m2, curva?, distanciaCurva_m? } }
     ou null quando algum trecho com água não tem descida (aí vale o lado seguro do HidAP: cada saída com a vazão total). */
  function saidasComoGerador(estado, cal) {
    var t = null; arr(estado && estado.telhados).forEach(function (x) { if (String(x.id) === String(cal.telhado)) t = x; });
    if (!t || !t.ok) return null;
    var cad = trechosDaCalha(arr(cal.segs)), ags = aguasDaCalha(estado, cal), Ltot = 0, out = {}, faltou = false;
    arr(cal.segs).forEach(function (s) { Ltot += Lseg(s); });
    var conds = arr(estado.condutores).filter(function (d) { return d && d.ok && String(d.calha) === String(cal.id); }), usados = {};
    cad.forEach(function (c) {
      c.areas = []; c.A = 0; c.amostras = []; c.ids = [];
      aguasDoTrecho(c, ags, t);
      var ps = [];
      conds.forEach(function (d) {
        var sm = num(d.posEf, 0.5) * Ltot - c.offset;
        if (usados[d.id] || sm < -1e-6 || sm > c.L + 1e-6) return;
        usados[d.id] = 1; ps.push({ id: d.id, s: Math.max(0, Math.min(c.L, sm)) });
      });
      ps.sort(function (a, b) { return a.s - b.s; });
      c.pos = ps.map(function (p) { return p.s; }); c.ids = ps.map(function (p) { return p.id; });
      if (!c.areas.length || !(c.L > 0.1)) return;
      if (!c.pos.length) { faltou = true; return; }
      var inf = influenciaTrecho(c);
      c.pos.forEach(function (s, i) {
        var o = { areaInfluencia_m2: r4(c.A * inf[i]) }, dq = distQuinaTrecho(c, s);
        if (dq != null && dq <= 4) { o.curva = "canto_reto"; o.distanciaCurva_m = r4(Math.max(0.01, dq)); }
        out[c.ids[i]] = o;
      });
    });
    return faltou || !Object.keys(out).length ? null : out;
  }
  /* REVISOR N23: com a platibanda que HERDA a parede o telhado recua até a face de dentro dela MENOS a largura da calha — a área do telhado
     depende da seção que o cálculo escolhe. Medida uma vez só (com a seção antiga), o memorial saía com a área e a vazão de antes da troca
     (casa 8 × 3: 20,59 m² e 39,46 L/min; com a calha nova são 21,80 m² e 41,78 L/min, −6 %) e o diagnóstico logo depois via outra vazão.
     Refaz sobre o próprio lote até as ops pararem de mudar (2 passadas em geral; até 3) — só quando há platibanda herdada. */
  function gerarPluvial(opsBase, cfg) {
    var r = gerarPluvial1(opsBase, cfg);
    var herd = r && r.ok && arr(r.estado && r.estado.platibandas).some(function (p) { return p && p.ok && p.herdar; });
    if (!herd) return r;
    var BE = dep("BimEdit", "./bimedit.js"), base = arr(opsBase), st0 = BE.aplicar(BE.sanear(base));
    function existe0(id) {
      var achou = false;
      ["calhasEmbutidas", "bordas", "condutores", "platibandas", "rufosEncontro", "telhados"].forEach(function (k) { arr(st0[k]).forEach(function (x) { if (x && String(x.id) === String(id)) achou = true; }); });
      arr(st0.instalacoes && st0.instalacoes.trechos).forEach(function (x) { if (x && String(x.id) === String(id)) achou = true; });
      return achou;
    }
    function semApagar(l) { return JSON.stringify(arr(l).filter(function (o) { return o.op !== "apagar"; })); }
    for (var i = 0; i < 2; i++) {
      /* a passada seguinte mede com o lote da anterior aplicado; as ops dela valem SOBRE O MODELO ORIGINAL quando só diferem nos "apagar"
         (o que a anterior apagou já não existe para a seguinte) */
      var r2 = gerarPluvial1(base.concat([clone(r.lote)]), cfg);
      if (!r2 || !r2.ok) return r;
      if (semApagar(r2.ops) === semApagar(r.ops)) { r2.ops = r.ops; r2.lote = r.lote; r2.estado = r.estado; return r2; }
      /* a seção ou as descidas mudaram: o lote novo sobre o modelo original — os "apagar" só do que existe nele */
      var cria = {}; r2.ops.forEach(function (o) { if (o.op !== "apagar") cria[String(o.id)] = true; });
      var jaApaga = {}, ops = r2.ops.filter(function (o) { if (o.op !== "apagar") return true; if (!existe0(o.id)) return false; jaApaga[String(o.id)] = true; return true; });
      r.ops.forEach(function (o) { if (o.op === "apagar" && existe0(o.id) && !cria[String(o.id)] && !jaApaga[String(o.id)]) ops.push(o); });
      r2.ops = ops; r2.lote = { op: "lote", id: r.lote.id, origem: r.lote.origem, ops: ops }; r2.estado = BE.aplicar(BE.sanear(base.concat([clone(r2.lote)])));
      r = r2;
    }
    (r.avisos = r.avisos || []).push("A seção da calha e a área do telhado (que recua até a platibanda herdada) não fecharam em 3 passadas: rode \"Rufos, calhas e descidas\" de novo.");
    return r;
  }
  function gerarPluvial1(opsBase, cfg) {
    cfg = cfg || {};
    var BE = dep("BimEdit", "./bimedit.js"), AP = dep("HidAP", "./hidap.js"), NR = NRm(), BI = dep("BimInst", "./biminst.js");
    if (!BE || !AP || !NR) return { ok: false, motivo: "Os motores (js/bimedit.js, js/hidap.js, js/hidnormas.js) não carregaram." };
    var base = arr(opsBase), avisos = [], premissas = [], memorial = [], pendencias = [], ops = [];
    function est(extra) { return BE.aplicar(BE.sanear(base.concat(extra || []))); }
    /* a mesma op (op + id) entra UMA vez no lote: os campos da segunda se juntam à primeira */
    function poe(o) {
      if (o.op !== "apagar") for (var i = 0; i < ops.length; i++) if (ops[i].op === o.op && String(ops[i].id) === String(o.id)) { Object.keys(o).forEach(function (k) { ops[i][k] = o[k]; }); return; }
      ops.push(o);
    }
    function existe(st, id) {
      var achou = false;
      ["calhasEmbutidas", "bordas", "condutores", "platibandas", "rufosEncontro", "telhados"].forEach(function (k) { arr(st[k]).forEach(function (x) { if (x && String(x.id) === String(id)) achou = true; }); });
      arr(st.instalacoes && st.instalacoes.trechos).forEach(function (x) { if (x && String(x.id) === String(id)) achou = true; });
      return achou;
    }
    var st0 = est();
    var tels = arr(st0.telhados).filter(function (t) { return t && t.ok && t.modo === "perimetro" && (cfg.telhado == null || String(t.id) === String(cfg.telhado)); });
    if (!tels.length) return { ok: false, motivo: "Nenhum telhado por perímetro no modelo (Arquitetura › Telhado)." };
    var mat = chapaDe(cfg.material);

    /* 1) intensidade pela cidade da obra */
    var T = fin(Number(cfg.periodoRetorno_anos)) ? Number(cfg.periodoRetorno_anos) : periodoCobertura(cfg.situacao);
    var cid = cfg.cidade ? { cidade: cfg.cidade, texto: cfg.cidade, origem: "informada" } : cidadeDaObra(cfg.obra, cfg.cliente), I;
    if (fin(Number(cfg.intensidade_mm_h)) && txt(cfg.fonteIntensidade).trim()) I = { valor_mm_h: Number(cfg.intensidade_mm_h), periodo_anos: T, origem: "informada", texto: "I = " + Number(cfg.intensidade_mm_h) + " mm/h — informada pelo projetista: " + cfg.fonteIntensidade };
    else I = intensidadeNBR(cid.cidade, T);
    if (I.aviso) avisos.push(I.aviso);
    var cObra = cidadeDaObra(cfg.obra, cfg.cliente);
    if (!I.aviso && I.origem === "tabela" && arr(cObra.varios).length > 1 && cObra.cidade === I.localidade)
      avisos.push("A cidade da obra tem " + cObra.varios.length + " postos na Tabela 5 (" + cObra.varios.join("; ") + ") e o endereço não cita o bairro: adotado o de MAIOR intensidade para T = " + T + " anos (" + I.localidade + ", " + I.valor_mm_h + " mm/h). Escreva o posto se for outro.");
    if (I.valor_mm_h == null) return { ok: false, motivo: I.aviso || "Sem intensidade pluviométrica.", avisos: avisos };
    memorial.push("Intensidade pluviométrica: " + I.texto + (cid.origem && I.origem !== "informada" ? " (cidade lida de: " + cid.origem + (cid.texto ? " — \"" + cid.texto + "\"" : "") + ")" : "") + ".");
    memorial.push("Período de retorno T = " + T + " anos (coberturas, NBR 10844 item 5.1.2); duração da chuva 5 min (item 5.1.3).");
    /* REVISÃO 20/10/2026 — a CALHA EMBUTIDA (atrás da platibanda) extravasa para dentro da edificação: é o caso c) do item 5.1.2
       (T = 25 anos, "coberturas e áreas onde empoçamento ou extravasamento não possa ser tolerado"). Com T = 5 a conta ficava abaixo:
       Sete Lagoas/MG 182 × 281 mm/h (−35 %), Barbacena/MG 222 × 265. A calha de beiral transborda para fora: segue T = 5.
       Período informado pelo projetista (cfg.periodoRetorno_anos) ou intensidade informada valem para todas. */
    var T25 = periodoCobertura("sem_extravasamento"), I25 = null;
    if (!fin(Number(cfg.periodoRetorno_anos)) && I.origem !== "informada" && T25 != null && T25 !== T) {
      I25 = intensidadeNBR(cid.cidade, T25);
      if (I25.valor_mm_h == null) I25 = null;
    }

    /* 2) calha de beiral pedida: nas arestas que definem inclinação e ainda não têm calha */
    var novasBordas = [];
    if (cfg.calhaBeiral) tels.forEach(function (t) {
      var tem = {}, id = PREFIXO + "b-" + t.id;
      listarCalhas(st0).forEach(function (c) { if (String(c.telhado) === String(t.id) && String(c.id) !== id) c.arestas.forEach(function (o) { tem[Number(o)] = true; }); });
      var ks = arr(t.arestasCalc).filter(function (e) { return e.define && !tem[e.orig]; }).map(function (e) { return e.orig; });
      if (ks.length) { poe({ op: "borda", id: id, telhado: String(t.id), tipoBorda: "calha", arestas: ks }); novasBordas.push(id); }
    });
    /* N23: TODAS as calhas deste cálculo vão para a cota certa ANTES de medir (a posição das descidas é uma fração do comprimento da calha, e a
       calha com `cotaAuto` tem o comprimento do meio dela — medir antes e repetir depois deslocava as descidas dos cantos) */
    var preCota = novasBordas.map(function (id) { return { op: "borda", id: id, cotaAuto: true }; });   /* só para MEDIR; a flag entra nas ops na emissão (mesma ordem de campos em toda rodada: o lote é idempotente) */
    listarCalhas(st0).forEach(function (c) {
      if (c.cotaAuto || !tels.some(function (t) { return String(t.id) === String(c.telhado); })) return;
      preCota.push(c.tipo === "embutida" ? { op: "calha", id: c.id, cotaAuto: true } : { op: "borda", id: c.id, cotaAuto: true });
    });
    var st1 = est(ops.concat(preCota));
    var cals = listarCalhas(st1).filter(function (c) { return tels.some(function (t) { return String(t.id) === String(c.telhado); }); });
    if (!cals.length) return { ok: false, motivo: "Nenhuma calha: marque \"calha de beiral\" ou lance a calha embutida da platibanda.", avisos: avisos };

    var nC = NR.consulta("ap.manning.n", { material: "chapa_metalica" }, "n"), dMin = NR.consulta("ap.calha.declividade_minima", null, "valor"), diMin = NR.consulta("ap.condutor_vertical.di_minimo_mm", null, "valor");
    var saidaCalha = cfg.saidaCalha === "funil" ? "funil" : "aresta_viva", Hmin = painelAbaco(saidaCalha).H[0].H;
    var dnsMat = BI && BI.MATERIAIS && BI.MATERIAIS.pvc_serie_r ? arr(BI.MATERIAIS.pvc_serie_r.dns) : [];
    var decl = fin(Number(cfg.declividadePct)) ? Number(cfg.declividadePct) : (dMin.ok ? num(dMin.valor, null) : null);
    if (decl == null) return { ok: false, motivo: "Sem a declividade mínima da calha (tabela da norma)." };
    if (dMin.ok && decl < num(dMin.valor, 0)) avisos.push("Declividade da calha " + virg(decl) + "% abaixo do mínimo de " + virg(num(dMin.valor, 0)) + "% da NBR 10844 (item 5.5.2).");
    premissas.push("lâmina d'água da calha retangular = metade da altura (premissa da RA: a norma não traz borda livre para a retangular)");
    premissas.push("descidas nas extremidades da calha (divisor de águas entre elas); calha com menos de 2 m: uma descida — parâmetro adotado");
    premissas.push("vazão de cada descida = I × a área de influência dela / 60: cada ponto da água escorre no sentido da maior declividade até o beiral (ou pelo rincão até a quina) e vai para a descida mais próxima ao longo da calha (divisor no meio do vão); a área de cada água é a do caso (b); calha que dá a volta (telhado de 4 águas): descidas nas quinas, com o coeficiente da Tabela 1 (canto reto)");
    premissas.push("condutor vertical pelo ÁBACO da NBR 10844, Figura 3 (" + (saidaCalha === "funil" ? "b) calha com funil de saída" : "a) calha com saída em aresta viva") + ", item 5.6.4): " + DADOS_TEL.abaco.tipoFonte + " — " + DADOS_TEL.abaco.incerteza.split(";")[0] + "; Di do PVC série R pela NBR 5688; " + (DADOS_TEL.abaco.exemplarLicenciado ? "" : "conferir no exemplar licenciado antes do memorial assinado"));
    premissas.push("o ábaco começa em H = " + Hmin + " mm: a lâmina na saída da calha (metade da altura) fica ≥ " + Hmin + " mm; H acima da última curva e L acima de 25 m usam a última curva (a favor da segurança)");

    /* o comprimento L de cada condutor (do fundo da calha ao piso), pela MESMA regra do replay: uma descida de prova por calha */
    var Lcond = {};
    (function () {
      var prova = cals.map(function (c) { return { op: "condutor", id: "__L-" + c.id, calha: String(c.id), pos: 0.5 }; }), sp = est(ops.concat(prova, preCota));
      arr(sp.condutores).forEach(function (c) { if (c && c.ok && String(c.id).indexOf("__L-") === 0) Lcond[String(c.id).slice(4)] = num(c.alturaM, null); });
    })();
    var resCal = [], manLig = {}, descMin = Math.max(1, Math.round(num(cfg.descidasMin, 2)));
    function idDesc(calId, j, i) { var b = String(calId).indexOf(PREFIXO) === 0 ? String(calId) : PREFIXO + calId; return b + "-cd" + (j + 1) + (i != null ? "-" + (i + 1) : ""); }
    var avisou25 = false;
    cals.forEach(function (cal) {
      var t = tels.filter(function (x) { return String(x.id) === String(cal.telhado); })[0];
      var Ic = cal.tipo === "embutida" && I25 ? I25 : I;
      if (Ic === I25 && !avisou25) {
        avisou25 = true;
        premissas.push("calha embutida (platibanda): T = " + T25 + " anos — o extravasamento cai dentro da edificação (NBR 10844 item 5.1.2 c); " + I25.texto);
        if (I25.aviso) avisos.push("Calha embutida (T = " + T25 + " anos): " + I25.aviso);
      }
      /* a calha em TRECHOS CONTÍNUOS (a de beiral em duas arestas opostas são duas linhas): cada trecho tem as suas águas e descidas */
      var segs = cal.segs, cad = trechosDaCalha(segs);
      /* as águas de cada trecho (caso b, com o beiral) */
      var ags = aguasDaCalha(st1, cal), Ltot0 = 0;
      segs.forEach(function (s) { Ltot0 += Lseg(s); });
      /* REVISÃO 20/10/2026: a descida lançada À MÃO (id sem o prefixo tel-calha-) é trabalho do usuário — antes ia embora por
         "apagar" a cada rodada. Agora fica onde está, entra na conta como posição fixa (só o DN é o do cálculo) e o motor só
         acrescenta descida se a calha não passar com elas. */
      var manuais = arr(st0.condutores).filter(function (m) { return m && m.ok && String(m.calha) === String(cal.id) && String(m.id).indexOf(PREFIXO) !== 0; }), usadas = {};
      if (manuais.length) avisos.push("Calha " + cal.id + ": " + manuais.length + " descida(s) lançada(s) à mão (" + manuais.map(function (m) { return m.id; }).join(", ") + ") ficaram onde estão e entraram na conta (o DN é o do cálculo); para o arranjo automático, apague-as e rode de novo.");
      cad.forEach(function (c) {
        c.areas = []; c.A = 0; c.amostras = []; c.fixos = [];
        manuais.forEach(function (m) {
          var sm = num(m.posEf, 0.5) * Ltot0 - c.offset;
          if (usadas[m.id] || sm < -1e-6 || sm > c.L + 1e-6) return;
          usadas[m.id] = 1; c.fixos.push({ id: m.id, s: Math.max(0, Math.min(c.L, sm)) });
        });
        aguasDoTrecho(c, ags, t);
        c.Q = Ic.valor_mm_h * c.A / 60;
        var fp = Math.min(0.15, c.L / 4);
        c.pos = c.fixos.length ? c.fixos.map(function (f) { return f.s; }) : c.fechada ? c.quinas.slice() : (c.L < 2 || descMin === 1 ? [fp] : [fp, c.L - fp]);
        c.pos.sort(function (a, b) { return a - b; });
      });
      cad = cad.filter(function (c) { return c.areas.length && c.L > 0.1; });
      if (!cad.length) { avisos.push("Calha " + cal.id + ": nenhuma água inclinada escorre para ela."); return; }
      var influencia = influenciaTrecho, distQuina = distQuinaTrecho;   /* REVISOR N23: as mesmas funções da verificação (dimensionarCalhas com comoGerador) */
      var Lc = Lcond[String(cal.id)];
      function dnPara(qLmin, H) { return Lc == null ? null : dnPeloAbaco(qLmin, H, Lc, { saida: saidaCalha, dnsMat: dnsMat, diMin: diMin.ok ? num(diMin.valor, null) : null }); }
      if (Lc == null) avisos.push("Calha " + cal.id + ": sem o comprimento do condutor (L) para o ábaco.");
      function maisUma(c) {
        var P = c.pos.slice(), gi = -1, gv = -1;
        for (var j = 0; j < P.length; j++) { var nx = j + 1 < P.length ? P[j + 1] : (c.fechada ? P[0] + c.L : null); if (nx == null) continue; if (nx - P[j] > gv) { gv = nx - P[j]; gi = j; } }
        P.push(gi < 0 ? c.L / 2 : (P[gi] + gv / 2) % c.L);
        c.pos = P.sort(function (a, b) { return a - b; });
      }
      var achou = null, tent = 0;
      while (!achou && tent++ < 16) {
        cad.forEach(function (c) {
          var inf = influencia(c);
          c.sds = c.pos.map(function (s, i) { var d = distQuina(c, s), o = { s: s, q: c.Q * inf[i], areaInfluencia_m2: r4(c.A * inf[i]), curva: null, distanciaCurva_m: null }; if (d != null && d <= 4) { o.curva = "canto_reto"; o.distanciaCurva_m = r4(Math.max(0.01, d)); } return o; });
        });
        var pior = null, dnRuim = null;
        {
          for (var c2 = 0; c2 < SECOES_CANDIDATAS.length && !achou; c2++) {
            var bMm = SECOES_CANDIDATAS[c2][0], aMm = SECOES_CANDIDATAS[c2][1], ia = 0;
            /* o condutor pelo ábaco com a lâmina DESTA seção: abaixo da 1ª curva de H o ábaco não informa → seção seguinte */
            if (aMm / 2 < Hmin) continue;
            var dnsC = cad.map(function (c) { return c.sds.map(function (o) { return dnPara(o.q, aMm / 2); }); });
            if (dnsC.some(function (l) { return l.some(function (x) { return !x; }); })) { dnRuim = dnsC; continue; }
            dnRuim = null;
            var ent = { situacao: "cobertura", intensidade_mm_h: Ic.valor_mm_h, fonteIntensidade: Ic.texto, areas: [], calhas: [] };
            cad.forEach(function (c, j) {
              var cid = String(cal.id) + (cad.length > 1 ? "#" + (j + 1) : "");
              c.areas.forEach(function (x) { ent.areas.push({ id: "A" + (++ia), caso: "b", a: x.a, h: x.h, b: x.b, destino: { calha: cid } }); });
              ent.calhas.push({ id: cid, secao: "retangular", base_mm: bMm, altura_mm: aMm, lamina_mm: aMm / 2, declividade_pct: decl, material: "chapa_metalica",
                                saidas: c.sds.map(function (o) { var x = { areaInfluencia_m2: o.areaInfluencia_m2 }; if (o.curva) { x.curva = o.curva; x.distanciaCurva_m = o.distanciaCurva_m; } return x; }) });
            });
            var ctx = NR.contexto(), rr = null;
            try { rr = AP.calcular({ pluvial: ent }, ctx, { trechos: [] }); } catch (eA) { rr = null; }
            var chs = rr ? arr(rr.calhas) : [], passa = chs.length === cad.length && chs.every(function (ch) { return ch.capacidade_l_min != null && ch.vazaoProjeto_l_min != null && ch.vazaoProjeto_l_min <= ch.capacidade_l_min; });
            if (passa) { achou = { bMm: bMm, aMm: aMm, hid: chs, qAP: rr.areas.reduce(function (s3, a3) { return s3 + num(a3.vazao_l_min, 0); }, 0), pend: ctx.pendencias(), ap: rr }; cad.forEach(function (c, j) { c.sds.forEach(function (o, i) { o.dn = dnsC[j][i]; }); }); }
            else if (c2 === SECOES_CANDIDATAS.length - 1 && chs.length) pior = chs;
          }
        }
        if (!achou) {
          /* mais uma descida no trecho que reprovou (ou no que tem o condutor estourado) */
          cad.forEach(function (c, j) {
            var ruim = (dnRuim && dnRuim[j] && dnRuim[j].some(function (x) { return !x; })) || (pior && pior[j] && !(pior[j].vazaoProjeto_l_min <= pior[j].capacidade_l_min));
            if (ruim) maisUma(c);
          });
        }
      }
      if (!achou) { avisos.push("Calha " + cal.id + ": nenhuma seção até 500 × 200 mm passa com até 16 descidas — aumente a declividade ou divida a calha."); return; }
      /* as ops: a seção (op calha embutida ou op borda de beiral) e as descidas com id fixo */
      var lg = achou.bMm / 1000, al = achou.aMm / 1000, Ltot = 0;
      segs.forEach(function (s) { Ltot += Lseg(s); });
      /* N23: a calha sai na COTA CERTA (cotaAuto): a telha entra nela, a borda fica abaixo da telha e o fundo cai `decl` % até cada descida */
      if (cal.tipo === "embutida") poe({ op: "calha", id: cal.id, largura: lg, altura: al, declividadePct: decl, cotaAuto: true });
      else poe({ op: "borda", id: cal.id, largura: lg, altura: al, declividadePct: decl, cotaAuto: true });
      var idsNovos = {}, descidas = [], A = 0, Q = 0, Qp = 0, cap = null, areasT = [];
      cad.forEach(function (c) { c.fixos.forEach(function (f) { f.usado = false; }); });
      cad.forEach(function (c, j) {
        A += c.A; Q += c.Q; areasT = areasT.concat(c.areas);
        var h = achou.hid[j];
        if (h.vazaoProjeto_l_min > Qp) { Qp = h.vazaoProjeto_l_min; cap = h.capacidade_l_min; }
        var kAuto = 0;
        c.sds.forEach(function (o, i) {
          var fx = c.fixos.filter(function (f) { return !f.usado && Math.abs(f.s - o.s) < 1e-6; })[0], id;
          if (fx) { fx.usado = true; id = fx.id; manLig[id] = 1; poe({ op: "condutor", id: id, dn: num(o.dn.dn, 100) }); }   /* a da mão: só o DN */
          else {
            id = idDesc(cal.id, j, cad.length > 1 || c.sds.length > 1 ? kAuto : null); kAuto++; idsNovos[id] = 1;
            poe({ op: "condutor", id: id, calha: String(cal.id), pos: r4(Math.max(0, Math.min(1, (c.offset + o.s) / Ltot))), dn: num(o.dn.dn, 100) });
          }
          descidas.push({ id: id, manual: !!fx, trecho: j + 1, pos: r4((c.offset + o.s) / Ltot), dist_m: r4(o.s), vazao_l_min: r4(o.q), area_m2: o.areaInfluencia_m2, coef: num(h.saidas && h.saidas[i] && h.saidas[i].coef, 1), dn: num(o.dn.dn, null), abaco: o.dn });
        });
      });
      arr(st0.condutores).forEach(function (c) { if (c && String(c.calha) === String(cal.id) && String(c.id).indexOf(PREFIXO) === 0 && !idsNovos[c.id]) poe({ op: "apagar", id: c.id }); });
      var maiorVao = 0;
      cad.forEach(function (c) { var P = c.pos; for (var q = 0; q + 1 < P.length; q++) maiorVao = Math.max(maiorVao, (P[q + 1] - P[q]) / 2); if (P.length === 1) maiorVao = Math.max(maiorVao, c.L); });
      /* REVISOR N23: o desenvolvimento pela MAIOR seção (no bocal, com o caimento), como no estado */
      var dev = desenvolvimentoCalha(lg, al + maiorVao * decl / 100), dv = escolher(DESENV_CALHA, dev, "dev");
      resCal.push({ id: cal.id, tipo: cal.tipo, telhado: cal.telhado, trechos: cad.length, areas: areasT, area_m2: r4(A), intensidade_mm_h: Ic.valor_mm_h, periodo_anos: Ic.periodo_anos, vazao_l_min: r4(Q), comprimento: r4(Ltot),
                    largura_mm: achou.bMm, altura_mm: achou.aMm, lamina_mm: achou.aMm / 2, declividade_pct: decl, n: nC.ok ? num(nC.valor, null) : null,
                    capacidade_l_min: r4(cap), vazaoProjeto_l_min: r4(Qp), vazaoHidAP_l_min: r4(achou.qAP), hidap: achou.hid,
                    desenvolvimento: dev, sinapi: dv ? sin(dv.ref) : null, queda_m: r4(maiorVao * decl / 100), descidas: descidas, pendencias: achou.pend });
    });
    if (!resCal.length) return { ok: false, motivo: "Nenhuma calha dimensionada.", avisos: avisos };

    /* 3) rufo e contrarrufo de encontro (só onde há encontro) */
    var resRuf = [];
    if (cfg.rufos !== false) tels.forEach(function (t) {
      var id = "tel-rufo-" + t.id, en = encontrosDoTelhado(st0, t, {});
      if (en.length) poe({ op: "rufo", id: id, telhado: String(t.id), material: mat });
      else if (existe(st0, id)) poe({ op: "apagar", id: id });
    });

    /* 4) o hidro: cada descida vira um trecho pluvial vertical (espera no piso) */
    var st2 = est(ops), ligar = cfg.ligarHidro !== false && !!BI;
    if (ligar) {
      var porCal = {};
      arr(st2.condutores).forEach(function (c) {
        var ehT = c && String(c.id).indexOf(PREFIXO) === 0;
        if (!c || !c.ok || (!ehT && !manLig[c.id])) return;
        var tid = PREFIXO + "ap-" + (ehT ? String(c.id).slice(PREFIXO.length) : "m-" + c.id);
        porCal[tid] = 1;
        if (!(c.alturaM > 0.05)) return;
        poe({ op: "trecho", id: tid, sistema: "pluvial", material: "pvc_serie_r", dn: c.dnEf || PADRAO.dn, p1: { x: c.x, y: r4(c.yTopo), z: c.z }, p2: { x: c.x, y: r4(c.yBase), z: c.z } });
        poe({ op: "condutor", id: c.id, trecho: tid });
      });
      arr(st0.instalacoes && st0.instalacoes.trechos).forEach(function (x) { if (x && String(x.id).indexOf(PREFIXO + "ap-") === 0 && !porCal[x.id]) poe({ op: "apagar", id: x.id }); });
    }
    var st3 = est(ops);
    arr(st3.rufosEncontro).forEach(function (r) { if (r && r.ok) { resRuf.push(r); arr(r.avisos).forEach(function (a) { avisos.push("Rufo " + r.id + ": " + a); }); } });

    /* 5) o memorial (a conta escrita, com a fonte) */
    resCal.forEach(function (c) {
      memorial.push("CALHA " + c.id + " (" + (c.tipo === "embutida" ? "embutida, atrás da platibanda" : "de beiral") + ", " + virg(c.comprimento) + " m" + (c.trechos > 1 ? " em " + c.trechos + " trechos" : "") + "):");
      c.areas.forEach(function (a) {
        memorial.push("  · água da aresta " + (a.aresta + 1) + " — NBR 10844, área de contribuição caso (b) superfície inclinada: A = (a + h/2)·b, com a = " + virg(a.a) + " m (projeção horizontal da água COM o beiral de " + virg(a.beiral) +
                      " m), h = a·i = " + virg(a.a) + " × " + virg(a.i, 1) + "% = " + virg(a.h, 3) + " m, b = " + virg(a.b) + " m → A = (" + virg(a.a) + " + " + virg(a.h / 2, 3) + ") × " + virg(a.b) + " = " + virg(a.A) + " m²");
      });
      if (c.periodo_anos !== T) memorial.push("  · período de retorno T = " + c.periodo_anos + " anos (extravasamento não tolerado, item 5.1.2 c): " + (c.periodo_anos === T25 && I25 ? I25.texto : "I = " + c.intensidade_mm_h + " mm/h"));
      memorial.push("  · vazão de projeto (item 5.3.1): Q = I·A/60 = " + c.intensidade_mm_h + " × " + virg(c.area_m2) + " / 60 = " + virg(c.vazao_l_min) + " L/min");
      memorial.push("  · " + c.descidas.length + " descida(s): " + c.descidas.map(function (d) { return "a " + virg(d.dist_m) + " m do início (" + virg(d.area_m2) + " m², " + virg(d.vazao_l_min) + " L/min)"; }).join("; ") +
                    "; Q de projeto na saída (maior saída × coeficiente da Tabela 1 quando há quina a menos de 4 m) = " + virg(c.vazaoProjeto_l_min) + " L/min");
      memorial.push("  · cota: a telha avança " + virg(AVANCO_TELHA * 100, 0) + " cm dentro da calha (ficha técnica Wavin; a Eternit dá 10 a 25 cm de balanço com calha), a borda da calha fica " + virg(FOLGA_VERTICAL * 100, 0) + " cm abaixo da face de baixo da telha (adotado) e o fundo cai " + virg(c.declividade_pct) + " % até cada descida (NBR 10844, item 5.5.2: mínimo " + virg(DECL_MIN_CALHA_PCT, 1) + " %); o fundo da calha na descida é o topo do condutor vertical");
      memorial.push("  · seção retangular " + c.largura_mm + " × " + c.altura_mm + " mm, lâmina " + c.lamina_mm + " mm, n = " + virg(c.n, 3) + " (chapa metálica, Tabela 2), i = " + virg(c.declividade_pct) + "% (mínimo do item 5.5.2): capacidade por Manning-Strickler (item 5.5.7) = " +
                    virg(c.capacidade_l_min) + " L/min ≥ " + virg(c.vazaoProjeto_l_min) + " L/min → ATENDE; queda " + virg(c.queda_m * 100, 1) + " cm até a descida");
      memorial.push("  · desenvolvimento " + virg(c.desenvolvimento) + " m → " + (c.sinapi ? "SINAPI " + c.sinapi.codigo + " (" + c.sinapi.descricao + ")" : "sem composição SINAPI: orçar à parte"));
      memorial.push("  · condutores verticais pelo ábaco da NBR 10844, Figura 3 " + (saidaCalha === "funil" ? "(b) funil de saída" : "(a) saída em aresta viva") + " (item 5.6.4: Q_max(D) = mín(curva H, curva L)): " +
                    c.descidas.map(function (d) { var a = d.abaco || {}; return "DN " + d.dn + " (Di " + virg(a.di, 1) + " mm, H = " + virg(a.H, 0) + " mm, L = " + virg(a.L) + " m: Q_max = " + virg(a.Q, 1) + " L/min, limita a curva " + a.limita + ", ≥ " + virg(d.vazao_l_min) + " L/min)"; }).join("; ") +
                    " — " + DADOS_TEL.abaco.tipoFonte + ", incerteza ±2–3 %; diâmetro interno mínimo " + (diMin.ok ? diMin.valor : "—") + " mm (item 5.6.3)" + (ligar ? "; tubo PVC série R no sistema pluvial do hidro, ponta de baixo = espera pluvial no piso" : ""));
      arr(c.pendencias).forEach(function (p) { if (!/abacos|ábaco/i.test(String(p.chave) + " " + p.motivo)) pendencias.push(p); });
    });
    resRuf.forEach(function (r) {
      if (!r.encontros.length) return;
      memorial.push("RUFO E CONTRARRUFO " + r.id + " (" + r.chapa + "): " + r.encontros.map(function (e) { return "aresta " + (e.orig + 1) + " × parede " + e.parede + " (" + virg(e.comprimento) + " m)"; }).join("; ") +
                    " — rufo " + virg(r.comprimentoRufo) + " m (" + arr(r.pecasRufo).map(function (p) { return "corte " + virg(p.corte * 100, 0) + " cm, " + p.posicoes.join("/") + ": dobras " + p.dobras.fonte; }).join("; ") + "; " + virg(r.kgRufo, 1) + " kg), contrarrufo " + virg(r.comprimentoContra) + " m (corte " + virg(r.corteContraEf * 100, 0) + " cm — desenvolvimento " + PADRAO_RUFO.obs + "; " + virg(r.kgContra, 1) + " kg); chapa " + r.obsChapa + "; fixação por metro: " + DADOS_TEL.fixacao.fonte + ".");
    });
    /* a conferência: o cálculo pluvial do hidro (js/hidap.js) refeito sobre o estado com o lote aplicado */
    var verificacao = resCal.map(function (c) { return { calha: c.id, vazao_l_min: c.vazaoHidAP_l_min, calhas: c.hidap }; });
    return { ok: true, lote: { op: "lote", id: PREFIXO + "lote", origem: "telhado-nbr10844", ops: ops }, ops: ops, intensidade: I, cidade: cid, periodo_anos: T,
             calhas: resCal, rufos: resRuf, memorial: memorial, avisos: avisos, premissas: premissas, pendencias: pendencias, verificacao: verificacao, estado: st3 };
  }

  /* ============================================================ A OP NO REPLAY */
  function idsDoCob(ctx) { return ctx.cob || (ctx.cob = { plat: {}, ordPlat: [], calha: {}, ordCalha: [], cond: {}, ordCond: [], rufo: {}, ordRufo: [] }); }
  function faixa(o, k, a, b) { return o[k] === undefined || o[k] === null || (fin(o[k]) && o[k] >= a && o[k] <= b); }
  function arestasOk(v) { return v === undefined || v === null || (Array.isArray(v) && v.length <= LIM.vertices && v.every(function (k) { return fin(k) && k >= 0 && Math.round(k) === k; })); }
  function validaPlatibanda(o) {
    if (!idOk(o.id)) return false;
    if (o.telhado !== undefined && !idOk(o.telhado)) return false;
    if (!faixa(o, "espessura", LIM.esp[0], LIM.esp[1]) || !faixa(o, "altura", LIM.altura[0], LIM.altura[1]) || !faixa(o, "topo", LIM.topo[0], LIM.topo[1]) || !faixa(o, "base", LIM.topo[0], LIM.topo[1]) ||
        !faixa(o, "abaRufo", LIM.aba[0], LIM.aba[1]) || !faixa(o, "folgaCalha", LIM.folga[0], LIM.folga[1])) return false;
    if (!arestasOk(o.arestas)) return false;
    if (o.rufoCapa != null && typeof o.rufoCapa !== "boolean") return false;
    if (o.contraRufo != null && typeof o.contraRufo !== "boolean") return false;
    if (o.herdar != null && typeof o.herdar !== "boolean") return false;   /* N23: herda tipo, espessura e posição da parede de baixo */
    return ["telhado", "arestas", "espessura", "altura", "topo", "base", "rufoCapa", "contraRufo", "abaRufo", "folgaCalha", "herdar"].some(function (k) { return o[k] !== undefined; });
  }
  function validaCalha(o) {
    if (!idOk(o.id)) return false;
    if (o.telhado !== undefined && !idOk(o.telhado)) return false;
    if (!faixa(o, "largura", LIM.calhaLarg[0], LIM.calhaLarg[1]) || !faixa(o, "altura", LIM.calhaAlt[0], LIM.calhaAlt[1]) || !faixa(o, "declividadePct", LIM.decl[0], LIM.decl[1]) || !faixa(o, "laminaMm", LIM.lamina[0], LIM.lamina[1])) return false;
    if (o.cotaAuto != null && typeof o.cotaAuto !== "boolean") return false;   /* N23: a telha entra na calha e o fundo cai até o bocal */
    if (o.arestas !== undefined && o.arestas !== null && !(arestasOk(o.arestas) && o.arestas.length >= 1)) return false;
    return ["telhado", "arestas", "largura", "altura", "declividadePct", "laminaMm", "cotaAuto"].some(function (k) { return o[k] !== undefined; });
  }
  function validaCondutor(o) {
    if (!idOk(o.id)) return false;
    if (o.calha !== undefined && !idOk(o.calha)) return false;
    if (!faixa(o, "pos", 0, 1) || !faixa(o, "dn", LIM.dn[0], LIM.dn[1])) return false;
    if (o.trecho !== undefined && o.trecho !== null && !idOk(o.trecho)) return false;
    return ["calha", "pos", "dn", "trecho"].some(function (k) { return o[k] !== undefined; });
  }
  /* T2: {op:"rufo", id, telhado, material?:"galv24"|"galv26"|"aluminio", corteRufo?:m, corteContra?:m, folga?:m} */
  function validaRufo(o) {
    if (!idOk(o.id)) return false;
    if (o.telhado !== undefined && !idOk(o.telhado)) return false;
    if (o.material !== undefined && o.material !== null && !CHAPAS[o.material]) return false;
    if (!faixa(o, "corteRufo", 0.1, 1) || !faixa(o, "corteContra", 0.1, 1) || !faixa(o, "folga", 0, 0.5)) return false;
    return ["telhado", "material", "corteRufo", "corteContra", "folga"].some(function (k) { return o[k] !== undefined; });
  }
  function valida(o) {
    if (!o) return undefined;
    if (o.op === "platibanda") return validaPlatibanda(o);
    if (o.op === "calha") return validaCalha(o);
    if (o.op === "condutor") return validaCondutor(o);
    if (o.op === "rufo") return validaRufo(o);
    return undefined;
  }
  var CAMPOS = { plat: ["telhado", "arestas", "espessura", "altura", "topo", "base", "rufoCapa", "contraRufo", "abaRufo", "folgaCalha", "herdar"],
                 calha: ["telhado", "arestas", "largura", "altura", "declividadePct", "laminaMm", "cotaAuto"],
                 cond: ["calha", "pos", "dn", "trecho"], rufo: ["telhado", "material", "corteRufo", "corteContra", "folga"] };
  function aplicarOp(o, ctx) {
    if (!o || !ctx) return false;
    var C = idsDoCob(ctx), id = o.id, quem = o.op === "platibanda" ? "plat" : o.op === "calha" ? "calha" : o.op === "condutor" ? "cond" : o.op === "rufo" ? "rufo" : null;
    var ordem = { plat: "ordPlat", calha: "ordCalha", cond: "ordCond", rufo: "ordRufo" };
    if (quem) {
      if (valida(o) !== true) return false;
      var M = C[quem], novo = !M[id];
      if (novo) {
        if (quem !== "cond" && o.telhado === undefined) return false;
        if (quem === "calha" && !arr(o.arestas).length) return false;
        if (quem === "cond" && o.calha === undefined) return false;
        M[id] = { id: id }; C[ordem[quem]].push(id);
      }
      CAMPOS[quem].forEach(function (k) { if (!temChave(o, k)) return; if (o[k] === null) delete M[id][k]; else M[id][k] = clone(o[k]); });
      return true;
    }
    if (o.op === "apagar") {
      var achou = false;
      ["plat", "calha", "cond", "rufo"].forEach(function (q) { if (C[q][id]) { delete C[q][id]; C[ordem[q]].splice(C[ordem[q]].indexOf(id), 1); achou = true; } });
      return achou;
    }
    return false;
  }
  function fim(ctx, saida, NIV) {
    if (!ctx || !saida) return;
    var bordaCota = arr(saida.bordas).some(function (b) { return b && b.ok && b.tipoBorda === "calha" && b.cotaAuto === true; });
    var C = ctx.cob || (bordaCota ? idsDoCob(ctx) : null); if (!C) return;   /* N23: a calha de beiral na cota certa vale mesmo sem nenhuma op de cobertura completa */
    if (!C.ordPlat.length && !C.ordCalha.length && !C.ordCond.length && !(C.ordRufo && C.ordRufo.length) && !bordaCota) return;
    var tel = {}; arr(saida.telhados).forEach(function (t) { tel[String(t.id)] = t; });
    if (C.ordCalha.length) {
      saida.calhasEmbutidas = C.ordCalha.map(function (id) { return calcularCalha(C.calha[id], tel); });
      saida.calhasEmbutidas.forEach(function (c) { if (c && c.ok && c.cotaAuto) aplicarPerfilEmbutida(c, bocaisDe(C, c.id)); });
    }
    arr(saida.bordas).forEach(function (b) { if (b && b.ok && b.tipoBorda === "calha" && b.cotaAuto === true) aplicarPerfilBeiral(b, saida.telhados, bocaisDe(C, b.id)); });
    if (C.ordPlat.length) saida.platibandas = C.ordPlat.map(function (id) { return calcularPlatibanda(C.plat[id], tel, C, saida.caixas); });
    if (C.ordCond.length) {
      var piso = Infinity; arr(NIV).forEach(function (n) { var e = num(n && n.elevacao, NaN); if (fin(e) && e < piso) piso = e; });
      var cals = listarCalhas(saida);
      saida.condutores = C.ordCond.map(function (id) {
        var f = C.cond[id], cal = null; cals.forEach(function (x) { if (String(x.id) === String(f.calha)) cal = x; });
        var t = cal ? tel[String(cal.telhado)] : null, base = isFinite(piso) ? piso : num(t && t.elevNivel, 0);
        return calcularCondutor(f, cals, base);
      });
      /* T2: a descida com o tubo no sistema pluvial do hidro (js/biminst.js) — o tubo é dele (desenho e quantitativo) */
      var trs = {}; arr(saida.instalacoes && saida.instalacoes.trechos).forEach(function (x) { if (x && x.id != null) trs[String(x.id)] = 1; });
      saida.condutores.forEach(function (c) { if (c.trecho != null) c.noHidro = !!trs[String(c.trecho)]; });
    }
    if (C.ordRufo && C.ordRufo.length) saida.rufosEncontro = C.ordRufo.map(function (id) { return calcularRufo(C.rufo[id], tel, saida); });
  }
  function registrar(BE) {
    if (!BE || typeof BE.estender !== "function") return false;
    return BE.estender({ nome: "cobertura-completa", aplicar: aplicarOp, valida: valida, fim: fim });
  }

  var BimCobertura = {
    PADRAO: PADRAO, SINAPI: SINAPI, LIM: LIM, SECOES_CANDIDATAS: SECOES_CANDIDATAS,
    calcularPlatibanda: calcularPlatibanda, calcularCalha: calcularCalha, calcularCondutor: calcularCondutor,
    listarCalhas: listarCalhas, resumoDoTelhado: resumoDoTelhado, opsCondutores: opsCondutores, baseSugerida: baseSugerida,
    desenvolvimentoCalha: desenvolvimentoCalha, entradaPluvial: entradaPluvial, dimensionarCalhas: dimensionarCalhas, secaoMinimaCalha: secaoMinimaCalha,
    quantitativo: quantitativo, sin: sin, paredesDaAresta: paredesDaAresta, paredeDominante: paredeDominante, recuosHerdados: recuosHerdados, perfilCalha: perfilCalha, diagnosticarCobertura: diagnosticarCobertura,
    AVANCO_TELHA: AVANCO_TELHA, FOLGA_VERTICAL: FOLGA_VERTICAL, DECL_MIN_CALHA_PCT: DECL_MIN_CALHA_PCT,
    PADRAO_RUFO: PADRAO_RUFO, CHAPAS: CHAPAS, PREFIXO: PREFIXO, encontrosDoTelhado: encontrosDoTelhado, calcularRufo: calcularRufo, topoTelhaEm: topoTelhaEm,
    cidadeDaObra: cidadeDaObra, postoNoTexto: postoNoTexto, intensidadeNBR: intensidadeNBR, periodoCobertura: periodoCobertura, gerarPluvial: gerarPluvial, kgPorM: kgPorM, DADOS_TEL: DADOS_TEL, qAbaco: qAbaco, dnPeloAbaco: dnPeloAbaco, cortePara: cortePara, dobrasRufo: dobrasRufo, valida: valida, aplicarOp: aplicarOp, fim: fim, registrar: registrar,
    opPlatibanda: function (id, d) {
      d = d || {}; var o = { op: "platibanda", id: id, telhado: d.telhado != null ? String(d.telhado) : d.telhado };
      ["arestas", "espessura", "altura", "topo", "base", "rufoCapa", "contraRufo", "abaRufo", "folgaCalha", "herdar"].forEach(function (k) { if (d[k] !== undefined && d[k] !== null) o[k] = d[k]; });
      return validaPlatibanda(o) ? o : null;
    },
    opCalha: function (id, d) {
      d = d || {}; var o = { op: "calha", id: id, telhado: d.telhado != null ? String(d.telhado) : d.telhado, arestas: arr(d.arestas).map(Number) };
      ["largura", "altura", "declividadePct", "laminaMm", "cotaAuto"].forEach(function (k) { if (d[k] !== undefined && d[k] !== null) o[k] = d[k]; });
      return validaCalha(o) ? o : null;
    },
    opCondutor: function (id, d) {
      d = d || {}; var o = { op: "condutor", id: id, calha: d.calha != null ? String(d.calha) : d.calha };
      ["pos", "dn"].forEach(function (k) { if (d[k] !== undefined && d[k] !== null) o[k] = d[k]; });
      return validaCondutor(o) ? o : null;
    }
  };
  registrar(dep("BimEdit", "./bimedit.js"));
  global.BimCobertura = BimCobertura;
  if (typeof module !== "undefined" && module.exports) module.exports = BimCobertura;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
