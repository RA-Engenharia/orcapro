/* =====================================================================
 * marmoraria.js — BANCADA DE PEDRA PARAMÉTRICA + CUBA + TORNEIRA (motor puro, Node-testável)
 *
 * Pedido do Rogério (20/10/2026): "mais famílias de pia, cuba e bancada para banheiro e cozinha,
 * paramétricas; colocar a pia já com a bancada de mármore/granito; trocar o tipo de pedra, o
 * comprimento, a altura da saia; cuba de sobrepor → a bancada ganha o FURO; cuba por baixo → o CORTE
 * com acabamento polido; e gerar o projeto executivo de marmoraria". Ampliação do mesmo dia: o
 * CONJUNTO bancada + cuba + torneira nasce completo; nas Propriedades troca-se a pedra (tipo e
 * acabamento), a cuba e a torneira (fabricante → linha → modelo → acabamento); a furação segue a
 * torneira (mesa: Ø e posição da ficha; parede: sem furo e o ponto de água vai para a parede).
 *
 * COMO FUNCIONA. É uma família do js/familia.js com `geometria: "marmoraria"`: os parâmetros, os tipos
 * e as Propriedades são os de qualquer família; a geometria, os pontos de ligação do hidro (conectores),
 * o quantitativo e os serviços saem DESTE arquivo pelo gancho `completar`.
 *   montar(valores) → a BANCADA RESOLVIDA (peças, cubas posicionadas, recortes e furos em mm a partir
 *                     das bordas, conectores, avisos) — é dela que saem o 3D, o hidro, a prancha e o orçamento;
 *   malha(def)      → a cena (js/mobgeo.js): a pedra RECORTADA de verdade (furo/corte/rebaixo), saia,
 *                     rodabanca, apoio, cuba, torneira, válvula, sifão e flexíveis;
 *   quantitativo(def) / orcamento(def) / planoChapa(defs).
 * SISTEMA LOCAL (o da família encostada): origem no PISO, no MEIO do comprimento; o FUNDO da bancada
 * (parede) em Z = 0 e a frente em +Z; Y para cima. Na planta da prancha: x da borda ESQUERDA, z da
 * borda FRONTAL (é como a marmoraria cota).
 *
 * ⚠ REGRAS (cada uma existe por um defeito que ela impede):
 *  1. Recorte/furo pelo GABARITO DO FABRICANTE quando o catálogo o traz (tools/test-marmoraria.js confere
 *     ± 1 mm). Sem gabarito: regra declarada (externo − 2 × aba; bojo + folga) e o item sai "a conferir".
 *  2. Ponto de esgoto, de água fria e quente: CONECTORES da família, na face da parede (Z = 0), sobre o
 *     eixo de CADA cuba — o kit do hidro (js/hidkit.js, kits "bancada_*", porCuba) faz as esperas; o sifão
 *     e os flexíveis do 3D terminam EXATAMENTE nesses pontos (nenhuma ponta solta).
 *  3. Altura de ponto com fonte: Deca p.116 (água 220 mm abaixo da face do tampo, 200 mm entre pontos;
 *     metais de parede 170 a 220 mm acima do tampo — adotado 220), Deca p.115 tabela 3 (esgoto abaixo do
 *     tampo, o maior da classe), Tigre p.40 (pia de parede 1,10 m). Altura do tampo: alturas-instalacao.json.
 *  4. Orçamento sem dobro: as bancadas SINAPI (86889…) NÃO têm cuba, válvula, sifão nem abertura — entram
 *     à parte; a cuba e a torneira pelo preço do catálogo (o maior lido) + a mão de obra da composição
 *     SINAPI equivalente. Nunca código SINAPI inventado; sem match → composição própria PROP-MOB-902x.
 *  5. Nada de marca no nome das partes; nenhuma citação de outro software (a suíte de nomes proibidos confere).
 * ES5, IIFE, sem DOM.
 * ===================================================================== */
(function (global) {
  "use strict";
  function dep(nome, arq) {
    if (global[nome]) return global[nome];
    if (typeof require === "function") { try { return require("./" + arq); } catch (e) { return null; } }
    return null;
  }
  function D() { return dep("MarmorariaDados", "marmorariadados.js") || { cubas: [], torneiras: [], pedras: [], chapas: [], precosMarmoraria: [], sinapi: {}, acessorios: [] }; }
  function Mob() { return dep("Mob", "mobgeo.js"); }
  function HL() { return dep("HidLouca", "hidlouca.js"); }
  function MC() { return dep("Marcenaria", "marcenaria.js"); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function num(v, d) { var n = typeof v === "number" ? v : parseFloat(txt(v).replace(",", ".")); return isFinite(n) ? n : d; }
  function r1(v) { return Math.round(v * 10) / 10; }
  function r2(v) { return Math.round(v * 100) / 100; }
  function r4(v) { return Math.round(v * 10000) / 10000; }
  function mm(v) { return Math.round(v * 1000); }
  function norm(s) { s = txt(s).toLowerCase(); return s.normalize ? s.normalize("NFD").replace(/[̀-ͯ]/g, "") : s; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  var TAU = Math.PI * 2;

  /* ------------------------------------------------------------ FONTES E REGRAS DE DESENHO
     Cada número aqui tem a fonte ao lado, ou é FOLGA DE DESENHO (padrão RA, a conferir com a marmoraria). */
  var FONTE_DECA = "Deca — Linha de Produtos (AECweb), p.115-116 (sugestão de medidas de instalação de cubas)";
  var FONTE_TIGRE = "Tigre — Manual Técnico Instalações Hidráulicas Prediais 2025, p.40 (alturas dos pontos)";
  var REGRA = {
    aguaAbaixoTampo: 0.22,        /* Deca p.116: ponto de água 220 mm abaixo da face superior do tampo (cuba de sobrepor/embutir/semi-encaixe) */
    entrePontosAgua: 0.20,        /* Deca p.116: afastamento entre os pontos de água 200 mm */
    metalParedeAcimaTampo: 0.22,  /* Deca p.116: metais de parede 170 a 220 mm acima do tampo — adotado o maior */
    piaParede: 1.10,              /* Tigre p.40: PIA – pia, 110 cm do piso acabado (torneira de parede) */
    /* Deca p.115, tabela 3: ponto de esgoto abaixo da face superior do tampo, o MAIOR de cada classe (o sifão alcança qualquer
       ponto mais alto encurtando o tubo; ponto mais alto que a saída do sifão não se alcança) */
    esgoto: { sobrepor: 0.46, embutir: 0.35, undermount: 0.35, semi_encaixe: 0.345, apoio: 0.35, esculpida: 0.35 },
    /* pia/tanque de inox: o sifão sanfonado desce 6 cm abaixo do fundo da cuba até a parede (o mesmo desenho do js/hidlouca.js e da família hid-pia-cozinha) */
    esgotoAbaixoFundo: 0.06,
    alturaBanho: 0.85, alturaCozinha: 0.90  /* dados-fonte/hidro/kits/alturas-instalacao.json (Deca p.116, faixa 850 a 900) */
  };
  var DES = {   /* FOLGAS DE DESENHO (padrão RA, a conferir com a marmoraria — não são norma) */
    recuoMin: 0.05,        /* da borda frontal da pedra à borda do recorte */
    margemLateral: 0.05,   /* do recorte à ponta da bancada */
    folgaFuro: 0.015,      /* do furo de torneira à borda do recorte e ao fundo */
    furoValvulaApoio: 0.045, /* furo da válvula da cuba de apoio (Ø) quando a ficha não dá */
    furoTorneiraPadrao: 0.035, /* Ø do furo de torneira quando a ficha da torneira não dá (a conferir) */
    entreFurosMisturador: 0.20, /* misturador de 3 furos: entre os furos das águas (Deca p.116: 200 mm entre pontos) */
    kerf: 4, refilo: 20,   /* plano de chapa: disco e refilo da borda bruta (mm) */
    juntaRodabanca: 0      /* rodabanca encostada sobre o tampo */
  };
  var BORDAS = ["Reta", "Meia-cana", "Boleado", "Chanfro"];
  var SUPERFICIES = ["Polido", "Levigado", "Escovado"];
  var APOIOS = ["Mão-francesa", "Gabinete", "Alvenaria"];
  var SAIA_LADOS = ["Frente", "Frente e laterais", "Frente e esquerda", "Frente e direita"];
  var RB_LADOS = ["Fundo", "Fundo e laterais", "Fundo e esquerda", "Fundo e direita", "Nenhum"];

  /* ------------------------------------------------------------ CATÁLOGO */
  function rotuloCuba(c) {
    var I = { sobrepor: "sobrepor", embutir: "embutir", undermount: "por baixo", semi_encaixe: "semi-encaixe", apoio: "apoio", esculpida: "esculpida na pedra", tanque: "tanque" };
    return [c.fabricante, c.linha, txt(c.codigo) || ""].filter(Boolean).join(" ") + " — " + I[c.instalacao] + " " + Math.round(num(c.externo.L, 0) / 10) + "×" + Math.round(num(c.externo.P, 0) / 10) + " cm" + (c.n_cubas > 1 ? " dupla" : "");
  }
  function rotuloTorneira(t) {
    var A = { cromado: "cromado", preto_fosco: "preto fosco", gold: "gold", rose_gold: "rose gold", inox_escovado: "inox escovado" };
    return [t.fabricante, t.linha, txt(t.codigo)].filter(Boolean).join(" ") + " — " + (t.instalacao === "parede" ? "parede" : "mesa") + (t.bica ? " bica " + t.bica : "") + ", " + (A[t.acabamento] || t.acabamento);
  }
  var _rotC = null, _rotT = null;
  function indices() {
    if (_rotC) return;
    _rotC = {}; _rotT = {};
    arr(D().cubas).forEach(function (c) { _rotC[rotuloCuba(c)] = c; _rotC[c.id] = c; });
    arr(D().torneiras).forEach(function (t) { _rotT[rotuloTorneira(t)] = t; _rotT[t.id] = t; });
  }
  function cuba(idOuRotulo) { indices(); return _rotC[txt(idOuRotulo)] || null; }
  function torneira(idOuRotulo) { indices(); return _rotT[txt(idOuRotulo)] || null; }
  /* PEDRAS DO MARMORISTA (js/marmprecos.js, módulo Marmoraria): as que ele cadastrou na tabela de preços entram no
     catálogo desta sessão — a lista de Pedra das Propriedades, o 3D (cor informada) e o plano de chapa (chapa dele). */
  var EXTRAS_PEDRA = [];
  function todasPedras() { return arr(D().pedras).concat(EXTRAS_PEDRA); }
  function pedra(idOuNome) {
    var k = norm(idOuNome), P = todasPedras();
    for (var i = 0; i < P.length; i++) if (P[i].id === idOuNome || norm(P[i].nome) === k) return P[i];
    return null;
  }
  function pedrasExtras(lista) {
    var novo = arr(lista).filter(function (p) { return p && p.id && p.nome; });
    if (JSON.stringify(novo) === JSON.stringify(EXTRAS_PEDRA)) return false;
    EXTRAS_PEDRA = JSON.parse(JSON.stringify(novo)); LISTA = null; registrar();
    return true;
  }
  function ordenar(a, b) { return (a.fabricante + a.linha + a.modelo < b.fabricante + b.linha + b.modelo) ? -1 : 1; }
  function cubasDe(ambiente) {
    var amb = ambiente === "cozinha" ? { cozinha: 1, lavanderia: 1 } : { banheiro: 1 };
    return arr(D().cubas).filter(function (c) { return !!amb[c.ambiente]; }).sort(ordenar);
  }
  function torneirasDe(ambiente) { return arr(D().torneiras).filter(function (t) { return t.ambiente === (ambiente === "cozinha" ? "cozinha" : "banheiro"); }).sort(ordenar); }
  /* ≥ 5 alternativas de troca: as do catálogo e, completando, as do mesmo ambiente + instalação, pelo tamanho mais perto */
  function alternativasCuba(c) {
    var ids = arr(c.alternativas).filter(function (i) { return cuba(i); });
    var irmas = arr(D().cubas).filter(function (o) { return o.id !== c.id && o.ambiente === c.ambiente && o.instalacao === c.instalacao && ids.indexOf(o.id) < 0; })
      .sort(function (a, b) { return Math.abs(a.externo.L - c.externo.L) + Math.abs(a.externo.P - c.externo.P) - Math.abs(b.externo.L - c.externo.L) - Math.abs(b.externo.P - c.externo.P); });
    irmas.forEach(function (o) { if (ids.length < 8) ids.push(o.id); });
    /* poucas do mesmo tipo: completa com as do mesmo ambiente (outra instalação), pelo tamanho */
    if (ids.length < 5) arr(D().cubas).filter(function (o) { return o.id !== c.id && o.ambiente === c.ambiente && ids.indexOf(o.id) < 0; })
      .sort(function (a, b) { return Math.abs(a.externo.L - c.externo.L) - Math.abs(b.externo.L - c.externo.L); }).forEach(function (o) { if (ids.length < 6) ids.push(o.id); });
    return ids;
  }
  function alternativasTorneira(t) {
    var ids = arr(t.alternativas).filter(function (i) { return torneira(i); });
    arr(D().torneiras).filter(function (o) { return o.id !== t.id && o.ambiente === t.ambiente && o.instalacao === t.instalacao && ids.indexOf(o.id) < 0; }).forEach(function (o) { if (ids.length < 8) ids.push(o.id); });
    return ids;
  }

  /* ------------------------------------------------------------ RECORTE (o gabarito) */
  /* → { forma, L, P, raio (m), fonte: "fabricante"|"regra", aConferir, texto } — L ao longo da bancada, P na profundidade */
  function recorteDe(c) {
    if (!c) return null;
    var e = c.externo, inst = c.instalacao;
    if (inst === "apoio") return { forma: "redondo", L: DES.furoValvulaApoio, P: DES.furoValvulaApoio, raio: DES.furoValvulaApoio / 2, fonte: "regra", aConferir: true, furoValvula: true,
      texto: "furo da válvula da cuba de apoio Ø " + mm(DES.furoValvulaApoio) + " mm (folga de desenho; confira na ficha da válvula)" };
    if (c.recorte) {
      var fr = c.recorte.forma || c.formato, L = num(c.recorte.L, 0) / 1000, P = num(c.recorte.P, 0) / 1000;
      return { forma: /oval|elip/.test(norm(fr)) ? "oval" : (/redond|circ/.test(norm(fr)) ? "redondo" : "retangular"), L: L, P: P, raio: Math.min(num(c.recorte.raio, 0) / 1000, Math.min(L, P) / 2),
        fonte: c.recorteFonte === "loja" ? "loja" : "fabricante", aConferir: false, texto: c.recorteTrecho || "gabarito do fabricante" };
    }
    var forma = /oval/.test(norm(c.formato)) ? "oval" : (/redond/.test(norm(c.formato)) ? "redondo" : "retangular");
    if (num(c.aba, 0) > 0 && (inst === "sobrepor" || inst === "embutir")) {
      var a = num(c.aba, 0) / 1000;
      return { forma: forma, L: num(e.L, 0) / 1000 - 2 * a, P: num(e.P, 0) / 1000 - 2 * a, raio: num(c.raio, 0) / 1000, fonte: "regra", aConferir: true, texto: "externo − 2 × aba (" + num(c.aba, 0) + " mm): sem gabarito do fabricante — a conferir" };
    }
    if (c.bojo && num(c.bojo.L, 0) > 0) return { forma: forma, L: num(c.bojo.L, 0) / 1000, P: num(c.bojo.P, 0) / 1000, raio: num(c.raio, 0) / 1000, fonte: "regra", aConferir: true, texto: "abertura do bojo (sem gabarito do fabricante) — a conferir" };
    return { forma: forma, L: num(e.L, 0) / 1000 - 0.03, P: num(e.P, 0) / 1000 - 0.03, raio: num(c.raio, 0) / 1000, fonte: "regra", aConferir: true, texto: "externo − 15 mm por lado (sem gabarito nem aba na ficha) — a conferir com a cuba na mão" };
  }
  /* contorno do recorte em planta (x, z), em volta de (0, 0), sentido anti-horário */
  function contorno(rec, n) {
    var pts = [], i, hx = rec.L / 2, hz = rec.P / 2;
    if (rec.forma === "redondo" || rec.forma === "oval") { n = n || 32; for (i = 0; i < n; i++) { var a = TAU * i / n; pts.push([Math.cos(a) * hx, Math.sin(a) * hz]); } return pts; }
    var r = Math.min(Math.max(0, rec.raio || 0), hx, hz), k = r > 0.002 ? 4 : 0;
    [[1, 1], [-1, 1], [-1, -1], [1, -1]].forEach(function (s, c) {
      var cx = s[0] * (hx - r), cz = s[1] * (hz - r);
      if (!k) { pts.push([s[0] * hx, s[1] * hz]); return; }
      for (i = 0; i <= k; i++) { var a = c * Math.PI / 2 + (Math.PI / 2) * i / k; pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); }
    });
    return pts;
  }

  /* ------------------------------------------------------------ MONTAR (a bancada resolvida) */
  function lados(txtL, base) { var t = norm(txtL); return { fundo: base === "rb" ? t !== "nenhum" : false, frente: base === "saia", esq: /lateral|esquerda/.test(t), dir: /lateral|direita/.test(t) }; }
  function montar(v, opc) {
    opc = opc || {};
    var amb = opc.ambiente || v.Ambiente || "banheiro", avisos = [], pend = [];
    var L = num(v.Comprimento, 1.2), P = num(v.Profundidade, 0.55), H = num(v.Altura, amb === "cozinha" ? REGRA.alturaCozinha : REGRA.alturaBanho), e = num(v.Espessura, 0.02);
    if (e !== 0.02 && e !== 0.03) { avisos.push("espessura " + mm(e) + " mm fora das chapas usuais (20 e 30 mm)"); }
    var pd = pedra(v.Pedra) || arr(D().pedras)[0] || { id: "?", nome: txt(v.Pedra) || "Pedra", tipo: "granito", render: { cor: "#888", slug: "", rug: 0.2 } };
    if (!pedra(v.Pedra)) avisos.push("pedra \"" + txt(v.Pedra) + "\" fora do catálogo — usada " + pd.nome);
    var sup = SUPERFICIES.indexOf(txt(v.Acabamento_superficie)) >= 0 ? txt(v.Acabamento_superficie) : "Polido";
    var borda = BORDAS.indexOf(txt(v.Borda)) >= 0 ? txt(v.Borda) : "Reta";
    var saiaH = Math.max(0, num(v.Saia_altura, 0)), sl = lados(v.Saia_lados || "Frente", "saia");
    var rbH = Math.max(0, num(v.Rodabanca_altura, 0)), rl = lados(v.Rodabanca_lados || "Fundo", "rb");
    if (!(rbH > 0)) rl = { fundo: false, esq: false, dir: false };
    var apoio = APOIOS.indexOf(txt(v.Apoio)) >= 0 ? txt(v.Apoio) : "Mão-francesa";
    var def = { ambiente: amb, L: L, P: P, H: H, e: e, pedra: pd, superficie: sup, borda: borda, saia: { h: saiaH, lados: sl }, rodabanca: { h: rbH, lados: rl }, apoio: apoio,
      cubas: [], furos: [], pecas: [], conectores: [], avisos: avisos, pendencias: pend, metais3d: v.Metais_3D !== false };
    if (saiaH > 0 && saiaH <= e) { avisos.push("saia de " + mm(saiaH) + " mm não passa da espessura da pedra — sem saia"); def.saia.h = saiaH = 0; }
    var zFundo = rl.fundo ? e : 0;   /* face da rodabanca: o recorte e o furo não entram nela */
    var nC = Math.max(0, Math.min(2, Math.round(num(v.Cubas, 1))));
    var ids = [v.Cuba, v.Cuba_2], poss = [num(v.Posicao_cuba, 0), num(v.Posicao_cuba_2, 0)], tns = [v.Torneira, v.Torneira_2];
    for (var i = 0; i < nC; i++) {
      var c = cuba(ids[i]) || cuba(ids[0]);
      if (!c) { pend.push("cuba " + (i + 1) + ": modelo \"" + txt(ids[i]) + "\" fora do catálogo"); continue; }
      var rec = recorteDe(c), ext = { L: num(c.externo.L, 0) / 1000, P: num(c.externo.P, 0) / 1000, H: num(c.externo.H, 150) / 1000 };
      var semi = c.instalacao === "semi_encaixe", apo = c.instalacao === "apoio";
      /* posição ao longo: distância da ponta ESQUERDA ao eixo da cuba; 0 = automática (centrada; 2 cubas a 1/4 e 3/4) */
      var auto = !(poss[i] > 0), xL = auto ? (nC === 1 ? L / 2 : L * (i === 0 ? 0.25 : 0.75)) : poss[i];
      var meia = Math.max(rec.L, apo ? ext.L : 0) / 2, xMin = meia + DES.margemLateral, xMax = L - meia - DES.margemLateral;
      if (xMax < xMin) { pend.push("cuba " + (i + 1) + " (" + mm(rec.L) + " mm) não cabe na bancada de " + mm(L) + " mm"); xL = L / 2; }
      else if (xL < xMin || xL > xMax) { avisos.push("cuba " + (i + 1) + ": posição ajustada para caber (" + mm(xL) + " → " + mm(Math.min(xMax, Math.max(xMin, xL))) + " mm da ponta esquerda)"); xL = Math.min(xMax, Math.max(xMin, xL)); }
      var tn = tns[i] === "Sem torneira" ? null : (torneira(tns[i]) || (i > 0 ? torneira(tns[0]) : null));
      if (tns[i] && tns[i] !== "Sem torneira" && !tn) avisos.push("torneira \"" + txt(tns[i]) + "\" fora do catálogo");
      var mesa = !!(tn && tn.instalacao === "mesa"), dFuro = mesa ? (num(tn.furo, 0) > 0 ? num(tn.furo, 0) / 1000 : DES.furoTorneiraPadrao) : 0;
      if (mesa && !(num(tn.furo, 0) > 0)) avisos.push("torneira " + rotuloTorneira(tn) + ": a ficha não dá o Ø do furo — Ø " + mm(DES.furoTorneiraPadrao) + " mm a conferir");
      /* recuo frontal: da borda frontal da pedra à frente do recorte (0 = automático: centrado na profundidade útil,
         deixando o furo de torneira atrás) */
      var Putil = P - zFundo, precisaAtras = mesa && !c.furoNaCuba ? dFuro + 2 * DES.folgaFuro : 0;
      var profRec = apo ? ext.P : rec.P, recuo = num(v.Recuo_cuba, 0);
      if (semi) recuo = -Math.max(0, ext.P - rec.P);   /* semi-encaixe: o recorte é um ENTALHE que abre na frente */
      else if (!(recuo > 0)) { recuo = Math.max(DES.recuoMin, (Putil - profRec - precisaAtras) / 2); }
      var sobra = Putil - recuo - profRec;
      if (!semi && sobra < precisaAtras - 1e-6) {
        var r2_ = Math.max(DES.recuoMin, Putil - profRec - precisaAtras);
        if (r2_ < recuo) { avisos.push("cuba " + (i + 1) + ": recuo frontal reduzido para caber o furo de torneira atrás (" + mm(recuo) + " → " + mm(r2_) + " mm)"); recuo = r2_; sobra = Putil - recuo - profRec; }
        if (sobra < precisaAtras - 1e-6) pend.push("cuba " + (i + 1) + ": sem espaço para o furo da torneira de mesa atrás da cuba (sobram " + mm(Math.max(0, sobra)) + " mm) — use torneira de parede ou bancada mais funda");
      }
      if (!semi && sobra < -1e-6) pend.push("cuba " + (i + 1) + " mais funda que a bancada (" + mm(profRec) + " mm em " + mm(Putil) + " mm úteis)");
      var zcPlanta = semi ? (rec.P / 2) : recuo + profRec / 2;   /* da borda FRONTAL ao eixo */
      var xc = xL - L / 2, zc = P - zcPlanta;                    /* local da família */
      var cb = { i: i, suf: i ? "_" + (i + 1) : "", cat: c, rotulo: rotuloCuba(c), instalacao: c.instalacao, rec: rec, ext: ext, xL: xL, zFrente: zcPlanta, xc: xc, zc: zc, recuo: recuo, torneira: tn, furosTorneira: [] };
      if (rec.aConferir) avisos.push("cuba " + (i + 1) + " " + cb.rotulo + ": recorte por " + rec.texto);
      /* furo(s) de torneira de mesa: sobre o eixo da cuba, no meio do espaço entre o recorte e o fundo */
      if (mesa && !c.furoNaCuba) {
        var zBackRec = zc - (apo ? ext.P : rec.P) / 2, zt = (zFundo + zBackRec) / 2;
        var nf = Math.max(1, Math.round(num(tn.nFuros, 1))), dxs = nf >= 3 ? [-DES.entreFurosMisturador, 0, DES.entreFurosMisturador] : (nf === 2 ? [-DES.entreFurosMisturador / 2, DES.entreFurosMisturador / 2] : [0]);
        dxs.forEach(function (dx) { cb.furosTorneira.push({ x: xc + dx, z: zt, d: dFuro }); def.furos.push({ tipo: "torneira", cuba: i, x: xc + dx, z: zt, d: dFuro, xL: xL + dx, zFrente: P - zt }); });
      }
      if (apo) def.furos.push({ tipo: "valvula", cuba: i, x: xc, z: zc, d: rec.L, xL: xL, zFrente: zcPlanta });
      /* ------- CONECTORES do hidro (face da parede, Z = 0): esgoto e águas sobre o eixo da cuba */
      var inox = /inox|aço|aco/.test(norm(c.material)) || amb === "cozinha";
      var Ea = c.instalacao === "tanque" || (inox && !/lou[cç]a|cer[aâ]m|porcel/.test(norm(c.material))) ? ext.H + REGRA.esgotoAbaixoFundo + (c.instalacao === "undermount" ? e : 0) : (REGRA.esgoto[c.instalacao] || REGRA.esgoto.embutir);
      if (apo) Ea = Math.min(Ea, REGRA.esgoto.apoio);
      cb.Ea = Ea; cb.inox = inox;
      var yA, fonteA;
      if (tn && tn.instalacao === "parede") {
        var pp = tn.pontoParede || {}, hS = num(pp.altura_sugerida_mm, 0) / 1000;
        if (hS > 0) { yA = hS > 0.6 ? hS : H + hS; fonteA = "ficha da torneira"; }
        else if (amb === "cozinha") { yA = REGRA.piaParede; fonteA = FONTE_TIGRE + " (PIA 110 cm)"; }
        else { yA = H + REGRA.metalParedeAcimaTampo; fonteA = FONTE_DECA + " (metais de parede 170 a 220 mm acima do tampo; adotado 220)"; }
      } else { yA = H - REGRA.aguaAbaixoTampo; fonteA = FONTE_DECA + " (220 mm abaixo da face do tampo)"; }
      var entre = tn && tn.pontoParede && num(tn.pontoParede.entre_eixos_mm, 0) > 0 ? num(tn.pontoParede.entre_eixos_mm, 0) / 1000 : REGRA.entrePontosAgua;
      cb.yAgua = yA; cb.fonteAgua = fonteA;
      def.conectores.push({ id: "esgoto" + cb.suf, nome: "Esgoto (saída do sifão, cuba " + (i + 1) + ")", sistema: "esgoto", dn: 0, x: r4(xc), y: r4(H - Ea), z: 0 });
      if (tn) {
        var quente = tn.aguaQuente !== false;
        /* a ficha da torneira (vazão e pressão mínima) segue no ponto, para o dimensionamento do hidro conferir */
        var ficha = { vazao_L_min: tn.vazao, pressaoMin_kPa: tn.pressaoMin, pressaoMax_kPa: tn.pressaoMax, torneira: rotuloTorneira(tn) };
        def.conectores.push(Object.assign({ id: "af" + cb.suf, nome: "Água fria (cuba " + (i + 1) + ")", sistema: "agua_fria", dn: 0, x: r4(xc + (quente ? entre / 2 : 0)), y: r4(yA), z: 0 }, ficha));
        if (quente) def.conectores.push(Object.assign({ id: "aq" + cb.suf, nome: "Água quente (cuba " + (i + 1) + ")", sistema: "agua_quente", dn: 0, x: r4(xc - entre / 2), y: r4(yA), z: 0 }, ficha));
      }
      def.cubas.push(cb);
    }
    /* sobreposição de duas cubas */
    if (def.cubas.length === 2) {
      var a0 = def.cubas[0], a1 = def.cubas[1], w0 = Math.max(a0.rec.L, a0.instalacao === "apoio" ? a0.ext.L : 0) / 2, w1 = Math.max(a1.rec.L, a1.instalacao === "apoio" ? a1.ext.L : 0) / 2;
      if (Math.abs(a1.xL - a0.xL) < w0 + w1 + DES.margemLateral) pend.push("as duas cubas se sobrepõem (eixos a " + mm(Math.abs(a1.xL - a0.xL)) + " mm) — afaste as posições ou aumente o comprimento");
    }
    pecas(def);
    return def;
  }

  /* ------------------------------------------------------------ PEÇAS (o que a marmoraria corta) */
  function pecas(def) {
    var L = def.L, P = def.P, e = def.e, s = def.saia, rb = def.rodabanca, out = [];
    function pc(cod, nome, c, l, extra) { var o = { codigo: cod, nome: nome, comprimento: mm(c), largura: mm(l), espessura: mm(e), area: r4(c * l) }; Object.keys(extra || {}).forEach(function (k) { o[k] = extra[k]; }); out.push(o); return o; }
    var recortes = def.cubas.filter(function (c) { return c.instalacao !== "apoio"; }).length, furos = def.furos.length;
    pc("P1", "Tampo", L, P, { recortes: recortes, furos: furos });
    if (s.h > 0) {
      pc("P2", "Saia frontal", L, s.h, { meiaEsquadria: L });
      if (s.lados.esq) pc("P3", "Saia lateral esquerda", P, s.h, { meiaEsquadria: P });
      if (s.lados.dir) pc("P4", "Saia lateral direita", P, s.h, { meiaEsquadria: P });
    }
    if (rb.h > 0 && rb.lados.fundo) pc("P5", "Rodabanca de fundo", L, rb.h);
    if (rb.h > 0 && rb.lados.esq) pc("P6", "Rodabanca lateral esquerda", P - (rb.lados.fundo ? e : 0), rb.h);
    if (rb.h > 0 && rb.lados.dir) pc("P7", "Rodabanca lateral direita", P - (rb.lados.fundo ? e : 0), rb.h);
    def.cubas.forEach(function (c) { if (c.instalacao === "esculpida") { var ex = c.ext; pc("E" + (c.i + 1), "Cuba esculpida " + (c.i + 1) + " (fundo e paredes)", ex.L + 2 * ex.H, ex.P + 2 * ex.H, { esculpida: true }); } });
    def.pecas = out;
    return out;
  }

  /* ------------------------------------------------------------ QUANTITATIVO DA MARMORARIA */
  function quantitativo(def) {
    var L = def.L, P = def.P, rb = def.rodabanca, s = def.saia, q = { m2: 0, m2Tampo: 0, m2Saia: 0, m2Rodabanca: 0, m2Esculpida: 0, mlBorda: 0, borda: def.borda, mlPolimentoReto: 0, mlMeiaEsquadria: 0,
      mlPolidoRecorte: 0, unRecorte: 0, unRecorteUndermount: 0, unFuro: 0, unEsculpida: 0, maosFrancesas: 0 };
    def.pecas.forEach(function (p) {
      q.m2 += p.area;
      if (p.codigo === "P1") q.m2Tampo += p.area; else if (/^P[234]$/.test(p.codigo)) q.m2Saia += p.area; else if (/^P[567]$/.test(p.codigo)) q.m2Rodabanca += p.area; else if (p.esculpida) q.m2Esculpida += p.area;
      q.mlMeiaEsquadria += num(p.meiaEsquadria, 0);
    });
    /* borda com o PERFIL escolhido: a frente (no pé da saia, se houver) + as laterais livres (sem rodabanca lateral) */
    q.mlBorda = L + (rb.lados.esq ? 0 : P) + (rb.lados.dir ? 0 : P);
    /* polimento reto: topo e pontas das rodabancas */
    if (rb.h > 0) { if (rb.lados.fundo) q.mlPolimentoReto += L + 2 * rb.h; if (rb.lados.esq) q.mlPolimentoReto += P + rb.h; if (rb.lados.dir) q.mlPolimentoReto += P + rb.h; }
    if (s.h > 0) q.mlPolimentoReto += 2 * s.h;   /* as pontas da saia */
    def.cubas.forEach(function (c) {
      if (c.instalacao === "apoio") { q.unFuro++; return; }
      if (c.instalacao === "undermount" || c.instalacao === "esculpida") { q.unRecorteUndermount++; q.mlPolidoRecorte += perimetro(c.rec); }
      else q.unRecorte++;
      if (c.instalacao === "esculpida") q.unEsculpida++;
    });
    q.unFuro += def.furos.filter(function (f) { return f.tipo === "torneira"; }).length;
    if (def.apoio === "Mão-francesa") q.maosFrancesas = maosFrancesas(L);
    ["m2", "m2Tampo", "m2Saia", "m2Rodabanca", "m2Esculpida"].forEach(function (k) { q[k] = r4(q[k]); });
    ["mlBorda", "mlPolimentoReto", "mlMeiaEsquadria", "mlPolidoRecorte"].forEach(function (k) { q[k] = r2(q[k]); });
    return q;
  }
  function perimetro(rec) { var c = contorno(rec, 48), s = 0; for (var i = 0; i < c.length; i++) { var a = c[i], b = c[(i + 1) % c.length]; s += Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1])); } return s; }
  /* SINAPI 86895 (0,50 m) e 86889 (1,50 m) = 2 mãos-francesas; 106780 (2,00 m) = 3; 106781 (3,00 m) = 4 → uma a cada 0,75 m, no mínimo 2 */
  function maosFrancesas(L) { return Math.max(2, Math.ceil(L / 0.75 - 1e-9)); }

  /* ------------------------------------------------------------ ORÇAMENTO */
  function sinapi(c) { return (D().sinapi || {})[c] || null; }
  function insumoAnalitico(cod) {
    var S = D().sinapi || {}, ks = Object.keys(S);
    for (var i = 0; i < ks.length; i++) { var l = arr(S[ks[i]].insumos); for (var j = 0; j < l.length; j++) if (l[j].codigo === cod) return { codigo: cod, descricao: l[j].descricao, unidade: l[j].unidade, custo: l[j].custo }; }
    return null;
  }
  function precoMarmoraria(re) {
    var l = arr(D().precosMarmoraria).filter(function (p) { return re.test(norm(p.item)) && num(p.valor, 0) > 0; }).sort(function (a, b) { return num(b.valor, 0) - num(a.valor, 0); });
    return l[0] || null;
  }
  var CINZA_SINAPI = /cinza|corumba|castelo|andorinha|quartz(?!o)/;
  /* m² da pedra: SINAPI (granito 11795 / mármore 11692) ou o preço público da pedra — o MAIOR */
  function precoPedra(pd) {
    var cands = [], s;
    if (pd.tipo === "granito" && (s = sinapi("11795"))) cands.push({ valor: s.custo, fonte: "SINAPI " + s.codigo + " (" + D().sinapiUf + " " + D().sinapiMes + ")", codigo: s.codigo });
    if (pd.tipo === "marmore" && (s = sinapi("11692"))) cands.push({ valor: s.custo, fonte: "SINAPI " + s.codigo + " (" + D().sinapiUf + " " + D().sinapiMes + ")", codigo: s.codigo });
    var propria = pd.preco && num(pd.preco.valor, 0) > 0;
    if (propria) cands.push({ valor: num(pd.preco.valor, 0), fonte: (pd.preco.loja || "preço público") + " " + txt(pd.preco.data) + " " + txt(pd.preco.url), codigo: "" });
    /* REVISOR A3: a SINAPI 11795 é o granito CINZA (Andorinha/Quartz/Castelo/Corumbá) e a 11692 o mármore BRANCO COMUM — para outra
       pedra sem preço próprio ela não é o preço da pedra (Preto Indiano, Arabesco saíam a R$ 504,61 sem aviso). Sem preço
       próprio e fora da descrição da SINAPI: entra também o maior preço conhecido da classe e o item sai PROVISÓRIO. */
    var naSinapi = (pd.tipo === "granito" && CINZA_SINAPI.test(norm(pd.nome))) || (pd.tipo === "marmore" && /branco (comum|extra|moura)|marmore branco/.test(norm(pd.nome)));
    if (!propria && !naSinapi) {
      cands.forEach(function (c) { c.provisorio = true; });
      arr(D().pedras).forEach(function (o) { if (o.tipo === pd.tipo && o.preco && num(o.preco.valor, 0) > 0) cands.push({ valor: num(o.preco.valor, 0), fonte: "maior preço conhecido da classe (" + o.nome + ")", codigo: "", provisorio: true }); });
      /* quartzo/mármore importado sem preço de chapa: a referência pública da classe (instalada — fica do lado alto) */
      var reCl = pd.tipo === "quartzo" ? /quartzo/ : (pd.tipo === "marmore" ? /marmore importado/ : null), pc = reCl ? precoMarmoraria(reCl) : null;
      if (pc) cands.push({ valor: num(pc.valor, 0), fonte: "referência pública da classe: " + pc.item + " (" + txt(pc.data) + ")", codigo: "", provisorio: true });
    }
    if (!cands.length) {
      /* sem preço da pedra: o maior m² conhecido da mesma classe (conservador); vai para as dúvidas internas */
      arr(D().pedras).forEach(function (o) { if (o.tipo === pd.tipo && o.preco && num(o.preco.valor, 0) > 0) cands.push({ valor: num(o.preco.valor, 0), fonte: "maior preço conhecido da classe (" + o.nome + ")", codigo: "", provisorio: true }); });
      if (!cands.length && (s = sinapi("11795"))) cands.push({ valor: s.custo, fonte: "SINAPI 11795 (sem preço próprio da pedra — provisório)", codigo: "11795", provisorio: true });
    }
    return cands.sort(function (a, b) { return b.valor - a.valor; })[0] || null;
  }
  function moDe(cod) { var s = sinapi(cod); return s && s.custoMO != null ? s.custoMO : 0; }
  function orcamento(def) {
    var q = quantitativo(def), itens = [], duvidas = [], pd = def.pedra;
    function item(o) { o.total = r2(num(o.quantidade, 0) * num(o.unitario, 0)); itens.push(o); return o; }
    /* (1) a pedra: SINAPI direta quando a peça É a da composição (granito cinza, 0,60 m de fundo, comprimento da tabela, só tampo) */
    var TAB = { "0.5": "86895", "1.5": "86889", "2": "106780", "3": "106781" }, kL = String(Math.round(def.L * 100) / 100), cod = TAB[kL];
    /* REVISOR A3: a bancada SINAPI é SÓ o tampo (86889: 1,005 m² de chapa para 0,90 m² = 1,1167 × L × P, sem rodabanca) — com
       rodabanca a peça não é a da composição (antes a rodabanca saía sem a pedra) */
    var rbTem = def.rodabanca.h > 0 && (def.rodabanca.lados.fundo || def.rodabanca.lados.esq || def.rodabanca.lados.dir);
    var simples = !(def.saia.h > 0) && !rbTem && !def.cubas.some(function (c) { return c.instalacao === "esculpida"; });
    if (pd.tipo === "granito" && CINZA_SINAPI.test(norm(pd.nome)) && Math.abs(def.P - 0.6) < 0.005 && cod && sinapi(cod) && simples && def.apoio === "Mão-francesa") {
      var s = sinapi(cod);
      item({ grupo: "Bancada", codigo: s.codigo, fonte: "SINAPI", descricao: s.descricao, unidade: "un", quantidade: 1, unitario: s.custo, obs: "composição SINAPI sem cuba, válvula, sifão e abertura (entram à parte)" });
    } else {
      var pp = precoPedra(pd), a = sinapi("86889"), base = 0.9;   /* a 86889 é de 1,50 × 0,60 = 0,90 m² */
      var co = function (c) { var l = a ? arr(a.insumos).filter(function (x) { return x.codigo === c; })[0] : null; return l ? l.coeficiente / base : 0; };
      var cus = function (c) { var l = a ? arr(a.insumos).filter(function (x) { return x.codigo === c; })[0] : null; return l ? l.custo : 0; };
      var fatorChapa = co("11795") || 1.1167;   /* 1,005 m² de chapa por 0,90 m² de tampo (perda e recorte da composição SINAPI) */
      var mo = co("88274") * cus("88274") + co("88316") * cus("88316"), mat = fatorChapa * (pp ? pp.valor : 0) + co("37329") * cus("37329") + co("7568") * cus("7568") + co("4823") * cus("4823");
      var un = r2(mo + mat);
      item({ grupo: "Bancada", codigo: "PROP-MOB-9020", fonte: "PRÓPRIA (coeficientes da SINAPI 86889 por m²)", descricao: "BANCADA/SAIA/RODABANCA EM " + pd.nome.toUpperCase() + " " + def.superficie.toUpperCase() + ", E = " + mm(def.e) / 10 + " CM - FORNECIMENTO E INSTALAÇÃO (por m² de peça)",
        unidade: "m²", quantidade: r4(q.m2), unitario: un, composicao: { chapa: { coef: r4(fatorChapa), preco: pp ? pp.valor : 0, fonte: pp ? pp.fonte : "" }, mo: r2(mo), mat: r2(mat) }, provisorio: !!(pp && pp.provisorio), obs: pp && pp.provisorio ? "PREÇO PROVISÓRIO da pedra: " + pp.fonte + " (o maior conhecido; confirmar com a marmoraria)" : "" });
      if (pp && pp.provisorio) duvidas.push("Pedra " + pd.nome + ": sem preço público lido — adotado " + pp.fonte + " (o maior da classe). Cotar com a marmoraria.");
      if (def.superficie !== "Polido") duvidas.push("Acabamento " + def.superficie + " da " + pd.nome + ": preço do m² igual ao polido (nenhuma fonte separa) — confirmar com a marmoraria.");
    }
    if (def.apoio === "Mão-francesa" && !(itens[0] && itens[0].fonte === "SINAPI")) {
      var mf = insumoAnalitico(def.P > 0.5 ? "37591" : "37590");
      if (mf) item({ grupo: "Bancada", codigo: mf.codigo, fonte: "SINAPI (insumo)", descricao: mf.descricao, unidade: "un", quantidade: q.maosFrancesas, unitario: mf.custo, obs: "uma a cada 0,75 m, mínimo 2 (contagem das composições 86895/86889/106780/106781)" });
    }
    /* (2) recortes e furos (insumos SINAPI de serviço de marmoraria) */
    /* SINAPI 45333/45334 ou o preço público de marmoraria — o MAIOR (orçamento sem "a cotar": na dúvida, o lado mais alto) */
    function servico(cod, re, quant, rot) {
      if (!(quant > 0)) return;
      var s0 = sinapi(cod), pm = precoMarmoraria(re), usaPm = pm && (!s0 || num(pm.valor, 0) > s0.custo);
      if (!s0 && !pm) { duvidas.push(rot + ": sem preço"); return; }
      item({ grupo: "Marmoraria", codigo: usaPm ? (cod === "45333" ? "PROP-9326" : "PROP-9327") : s0.codigo, fonte: usaPm ? "PRÓPRIA (preço público " + txt(pm.data) + "; SINAPI " + cod + " = " + (s0 ? r2(s0.custo) : "-") + ")" : "SINAPI (insumo)",
        descricao: s0 ? s0.descricao : rot.toUpperCase(), unidade: "un", quantidade: quant, unitario: usaPm ? num(pm.valor, 0) : s0.custo, obs: usaPm ? txt(pm.url) : "" });
    }
    servico("45333", /recorte de cuba/, q.unRecorte + q.unRecorteUndermount, "Recorte de cuba");
    servico("45334", /^furo/, q.unFuro, "Furo de torneira/válvula");
    /* (3) acabamento de borda, polimento e meia-esquadria (ml) — preço público de marmoraria (o maior lido) */
    function ml(rotulo, quant, re, codigo) {
      if (!(quant > 0)) return;
      var p = precoMarmoraria(re) || precoMarmoraria(/acabamento|borda|polimento/);
      if (!p) { duvidas.push(rotulo + ": sem preço público lido — item sem valor até cotar"); return; }
      var semProprio = !re.test(norm(p.item));
      item({ grupo: "Marmoraria", codigo: codigo, fonte: "PRÓPRIA (preço público " + txt(p.data) + ")", descricao: rotulo.toUpperCase(), unidade: "m", quantidade: quant, unitario: num(p.valor, 0), provisorio: semProprio, obs: semProprio ? "PREÇO PROVISÓRIO: sem preço próprio; adotado o de \"" + p.item + "\" (o maior lido)" : txt(p.url) });
      if (semProprio) duvidas.push(rotulo + ": sem preço próprio — adotado o de \"" + p.item + "\".");
    }
    var reB = { "Reta": /reto|reta|polimento/, "Meia-cana": /meia.?cana/, "Boleado": /bolead/, "Chanfro": /chanfr/ }[def.borda];
    ml("Acabamento de borda " + def.borda.toLowerCase(), q.mlBorda, reB, "PROP-9321");
    ml("Polimento reto de topo (rodabanca e pontas)", q.mlPolimentoReto, /reto|reta|polimento/, "PROP-9322");
    ml("Colagem em meia-esquadria (saia)", q.mlMeiaEsquadria, /esquadria|saia dupla|espessado/, "PROP-9323");
    ml("Polimento da borda do recorte (cuba por baixo/esculpida)", q.mlPolidoRecorte, /undermount|recorte polido|por baixo|polimento/, "PROP-9324");
    if (q.unEsculpida > 0) { var pe = precoMarmoraria(/esculpid/); if (pe) item({ grupo: "Marmoraria", codigo: "PROP-9325", fonte: "PRÓPRIA (preço público " + txt(pe.data) + ")", descricao: "CUBA ESCULPIDA NA PEDRA (MÃO DE OBRA)", unidade: txt(pe.unidade) || "un", quantidade: q.unEsculpida, unitario: num(pe.valor, 0), obs: txt(pe.url) }); else duvidas.push("Cuba esculpida: sem preço público de mão de obra lido."); }
    /* (4) cuba, torneira, válvula, sifão e flexíveis — o catálogo (o maior preço lido) + a MO da composição SINAPI equivalente; sem dobro */
    def.cubas.forEach(function (c) {
      var k = c.cat, cubaComValvula = false;   /* SINAPI 86900/100852: o insumo 1743/1747 é "CUBA AÇO INOX … COM VÁLVULA" — sem a 86878 em dobro */
      if (k.instalacao !== "esculpida") {
        var moC = moDe(/lou[cç]a|cer[aâ]m|porcel/.test(norm(k.material)) ? "86901" : (k.externo.L >= 500 ? "100852" : "86900"));
        if (k.preco) item({ grupo: "Louças e metais", codigo: txt(k.codigo), fonte: k.fabricante + " (" + (k.preco.loja || "preço público") + " " + txt(k.preco.data) + ")", descricao: "CUBA " + c.rotulo.toUpperCase(), unidade: "un", quantidade: 1, unitario: r2(k.preco.valor + moC), obs: "preço " + r2(k.preco.valor) + " + instalação " + r2(moC) + " (MO da SINAPI " + (/lou/.test(norm(k.material)) ? "86901" : "86900/100852") + "); " + txt(k.preco.url) });
        else {
          /* REVISOR A3: sem preço do modelo, o MAIOR entre a SINAPI equivalente e o maior preço do catálogo da mesma classe
             (ambiente + louça/inox + instalação) — antes uma Kohler por baixo saía a R$ 166,87 (cuba oval de louça SINAPI) */
          var sinInox = /inox|aço|aco/.test(norm(k.material)), sf = sinapi(sinInox ? (k.externo.L >= 500 ? "100852" : "86900") : "86901");
          var louK = /lou[cç]a|cer[aâ]m|porcel/.test(norm(k.material)), mesmaCl = function (o) { return o.preco && num(o.preco.valor, 0) > 0 && o.ambiente === k.ambiente && /lou[cç]a|cer[aâ]m|porcel/.test(norm(o.material)) === louK; };
          var cl = arr(D().cubas).filter(function (o) { return mesmaCl(o) && o.instalacao === k.instalacao; }).sort(function (a, b) { return b.preco.valor - a.preco.valor; })[0] ||
            arr(D().cubas).filter(mesmaCl).sort(function (a, b) { return b.preco.valor - a.preco.valor; })[0];   /* nenhuma da mesma instalação com preço: a mais cara do ambiente e material */
          var vCl = cl ? r2(cl.preco.valor + moC) : 0;
          if (cl && (!sf || vCl > sf.custo)) item({ grupo: "Louças e metais", codigo: txt(k.codigo), fonte: "maior preço do catálogo da classe (" + cl.fabricante + " " + txt(cl.codigo) + ")", descricao: "CUBA " + c.rotulo.toUpperCase(), unidade: "un", quantidade: 1, unitario: vCl, provisorio: true, obs: "PREÇO PROVISÓRIO: o modelo não tem preço público; adotado o maior da classe " + r2(cl.preco.valor) + " + instalação " + r2(moC) + " (confirmar com o fornecedor)" });
          else if (sf) { item({ grupo: "Louças e metais", codigo: sf.codigo, fonte: "SINAPI", descricao: sf.descricao, unidade: "un", quantidade: 1, unitario: sf.custo, provisorio: true, obs: "PREÇO PROVISÓRIO: cuba sem preço público lido — SINAPI equivalente" + (sinInox ? " (a cuba SINAPI já inclui a válvula)" : "") }); if (sinInox) cubaComValvula = true; }
          duvidas.push("Cuba " + c.rotulo + ": sem preço público — adotado o maior entre a SINAPI equivalente e o catálogo da classe. Cotar o modelo.");
        }
      }
      var inclui = cubaComValvula || /v[aá]lvula inclu|acompanha v[aá]lvula|com v[aá]lvula/.test(norm(k.obs + " " + (k.valvula && k.valvula.obs)));
      var sv = sinapi(c.inox ? "86878" : "86877");
      /* REVISOR A3: cuba DUPLA (n_cubas 2) tem duas saídas — duas válvulas (o sifão é um, com a ligação dupla) */
      var nBoj = Math.max(1, Math.round(num(k.n_cubas, 1)));
      if (!inclui && sv) item({ grupo: "Louças e metais", codigo: sv.codigo, fonte: "SINAPI", descricao: sv.descricao, unidade: "un", quantidade: nBoj, unitario: sv.custo, obs: nBoj > 1 ? "cuba dupla: uma válvula por bojo" : "" });
      var ss = sinapi("86883"); if (ss) item({ grupo: "Louças e metais", codigo: ss.codigo, fonte: "SINAPI", descricao: ss.descricao, unidade: "un", quantidade: 1, unitario: ss.custo });
      var t = c.torneira;
      if (t) {
        var moT = moDe(t.ambiente === "cozinha" ? (t.instalacao === "parede" ? "86910" : "86909") : "100853");
        if (t.preco) item({ grupo: "Louças e metais", codigo: txt(t.codigo), fonte: t.fabricante + " (" + (t.preco.loja || "preço público") + " " + txt(t.preco.data) + ")", descricao: "TORNEIRA " + rotuloTorneira(t).toUpperCase(), unidade: "un", quantidade: 1, unitario: r2(t.preco.valor + moT), obs: "preço " + r2(t.preco.valor) + " + instalação " + r2(moT) + "; " + txt(t.preco.url) });
        else {
          /* REVISOR A3: sem preço, a torneira ficava FORA do orçamento — agora o maior preço da classe (ambiente + instalação), provisório */
          var tc = arr(D().torneiras).filter(function (o) { return o.preco && num(o.preco.valor, 0) > 0 && o.ambiente === t.ambiente && o.instalacao === t.instalacao; }).sort(function (a, b) { return b.preco.valor - a.preco.valor; })[0];
          var stn = sinapi(t.ambiente === "cozinha" ? (t.instalacao === "parede" ? "86910" : "86909") : "100853");
          if (tc && (!stn || tc.preco.valor + moT > stn.custo)) item({ grupo: "Louças e metais", codigo: txt(t.codigo), fonte: "maior preço do catálogo da classe (" + tc.fabricante + " " + txt(tc.codigo) + ")", descricao: "TORNEIRA " + rotuloTorneira(t).toUpperCase(), unidade: "un", quantidade: 1, unitario: r2(tc.preco.valor + moT), provisorio: true, obs: "PREÇO PROVISÓRIO: o modelo não tem preço público; adotado o maior da classe (confirmar com o fornecedor)" });
          else if (stn) item({ grupo: "Louças e metais", codigo: stn.codigo, fonte: "SINAPI", descricao: stn.descricao, unidade: "un", quantidade: 1, unitario: stn.custo, provisorio: true, obs: "PREÇO PROVISÓRIO: torneira sem preço público lido — SINAPI equivalente" });
          duvidas.push("Torneira " + rotuloTorneira(t) + ": sem preço público lido — adotado o maior da classe/SINAPI.");
        }
        var eg = sinapi("86887"); if (eg && t.instalacao === "mesa") item({ grupo: "Louças e metais", codigo: eg.codigo, fonte: "SINAPI", descricao: eg.descricao, unidade: "un", quantidade: t.aguaQuente !== false ? 2 : 1, unitario: eg.custo });
      }
    });
    var tot = 0; itens.forEach(function (i) { tot += i.total; });
    return { itens: itens, total: r2(tot), quantitativo: q, duvidas: duvidas, provisorios: itens.filter(function (i) { return i.provisorio; }).length, fonteSinapi: "SINAPI " + D().sinapiUf + " " + D().sinapiMes + " não desonerada" };
  }

  /* ------------------------------------------------------------ QUANTITATIVO NEUTRO (qualquer tabela de preço)
     itensQuantitativo(def) → [{ chave, grupo, descricao, unidade, quantidade, ref }] — a CHAVE é estável e é ela que uma
     tabela de preço própria (a do marmorista, a da loja, a de um módulo vendido à parte) precifica:
       pedra:<id da pedra>:<espessura mm>  m²  · borda:<perfil>  m · polimento:reto  m · polimento:recorte  m
       meia-esquadria  m · recorte:cuba  un · recorte:por-baixo  un · furo  un · cuba-esculpida  un · mao-francesa  un
       cuba:<id do catálogo>  un · torneira:<id do catálogo>  un · valvula:<lavatorio|pia>  un · sifao  un · flexivel  un
       instalacao:bancada  un · frete:bancada  un (a tabela decide se cobra) */
  function itensQuantitativo(def) {
    var q = quantitativo(def), out = [], pd = def.pedra;
    function it(chave, grupo, desc, un, qt, ref) { if (qt > 0) out.push({ chave: chave, grupo: grupo, descricao: desc, unidade: un, quantidade: Math.round(qt * 10000) / 10000, ref: ref || null }); }
    it("pedra:" + pd.id + ":" + mm(def.e), "Pedra", pd.nome + " " + def.superficie.toLowerCase() + ", e = " + mm(def.e) + " mm (tampo, saia e rodabanca)", "m2", q.m2, { pedra: pd.id, superficie: def.superficie });
    it("borda:" + norm(def.borda).replace(/[^a-z]+/g, "-"), "Marmoraria", "Acabamento de borda " + def.borda.toLowerCase(), "m", q.mlBorda);
    it("polimento:reto", "Marmoraria", "Polimento reto de topo", "m", q.mlPolimentoReto);
    it("polimento:recorte", "Marmoraria", "Polimento da borda do recorte (por baixo / esculpida)", "m", q.mlPolidoRecorte);
    it("meia-esquadria", "Marmoraria", "Colagem em meia-esquadria (saia)", "m", q.mlMeiaEsquadria);
    it("recorte:cuba", "Marmoraria", "Recorte de cuba (sobrepor/embutir/semi-encaixe)", "un", q.unRecorte);
    it("recorte:por-baixo", "Marmoraria", "Recorte de cuba por baixo / esculpida", "un", q.unRecorteUndermount);
    it("furo", "Marmoraria", "Furo (torneira/válvula)", "un", q.unFuro);
    it("cuba-esculpida", "Marmoraria", "Cuba esculpida na pedra (mão de obra)", "un", q.unEsculpida);
    it("mao-francesa", "Bancada", "Mão-francesa", "un", q.maosFrancesas);
    def.cubas.forEach(function (c) {
      if (c.instalacao !== "esculpida") it("cuba:" + c.cat.id, "Louças e metais", "Cuba " + c.rotulo, "un", 1, { cuba: c.cat.id });
      it("valvula:" + (c.inox ? "pia" : "lavatorio"), "Louças e metais", "Válvula de escoamento", "un", Math.max(1, Math.round(num(c.cat.n_cubas, 1))));
      it("sifao", "Louças e metais", "Sifão", "un", 1);
      if (c.torneira) { it("torneira:" + c.torneira.id, "Louças e metais", "Torneira " + rotuloTorneira(c.torneira), "un", 1, { torneira: c.torneira.id }); if (c.torneira.instalacao === "mesa") it("flexivel", "Louças e metais", "Engate flexível", "un", c.torneira.aguaQuente !== false ? 2 : 1); }
    });
    it("instalacao:bancada", "Serviços", "Instalação da bancada", "un", 1);
    it("frete:bancada", "Serviços", "Frete da bancada", "un", 1);
    /* junta as chaves repetidas (2 cubas iguais, 2 válvulas) */
    var j = {}, lista = [];
    out.forEach(function (o) { if (j[o.chave]) j[o.chave].quantidade += o.quantidade; else { j[o.chave] = o; lista.push(o); } });
    return lista;
  }
  /* ORÇAMENTO PELA TABELA DO USUÁRIO: tabela = { "<chave>": preço } (chave exata) ou { "<prefixo>*": preço } (ex.: "borda:*",
     "cuba:*"). O que a tabela não tem sai em `semPreco` — nunca preço inventado. */
  function orcamentoTabela(def, tabela) {
    tabela = tabela || {}; var itens = [], sem = [], tot = 0;
    function preco(ch) { if (tabela[ch] != null) return num(tabela[ch], null); var ks = Object.keys(tabela).filter(function (k) { return /\*$/.test(k) && ch.indexOf(k.slice(0, -1)) === 0; }).sort(function (a, b) { return b.length - a.length; }); return ks.length ? num(tabela[ks[0]], null) : null; }
    itensQuantitativo(def).forEach(function (o) {
      var p = preco(o.chave); if (p == null) { sem.push(o.chave); return; }
      var t = r2(p * o.quantidade); tot += t; itens.push({ chave: o.chave, grupo: o.grupo, descricao: o.descricao, unidade: o.unidade, quantidade: o.quantidade, unitario: p, total: t, fonte: "tabela do usuário" });
    });
    return { itens: itens, total: r2(tot), semPreco: sem };
  }

  /* ------------------------------------------------------------ PLANO DE CHAPA */
  function chapaDe(pd) {
    if (pd.chapa_mm && num(pd.chapa_mm.L, 0) > 0) return { comprimento: num(pd.chapa_mm.L, 0), largura: num(pd.chapa_mm.P, 0), fonte: pd.fonte && pd.fonte.url || "ficha da pedra" };
    var l = arr(D().chapas).filter(function (c) { return norm(c.tipo) === pd.tipo || (pd.tipo === "sinterizado" && /sinter|porcel/.test(norm(c.tipo))); });
    var ex = l.filter(function (c) { return norm(c.exemplo).indexOf(norm(pd.nome)) >= 0; })[0];
    /* sem a chapa da pedra: a MENOR chapa conhecida da classe (conservador: mais chapas) */
    /* classe sem chapa com fonte (mármore, travertino): a menor chapa de granito com fonte (pedra natural, mesma serraria) */
    if (!l.length) l = arr(D().chapas).filter(function (c) { return norm(c.tipo) === "granito"; });
    var c = ex || l.filter(function (c) { return num(c.L_mm, 0) > 0; }).sort(function (a, b) { return a.L_mm * a.P_mm - b.L_mm * b.P_mm; })[0];
    return c ? { comprimento: num(c.L_mm, 0), largura: num(c.P_mm, 0), fonte: (c.fonte && c.fonte.url) || "", exemplo: c.exemplo || "", generica: !ex } : null;
  }
  function planoChapa(defs) {
    var M = MC(), porPedra = {}, out = [];
    arr(defs).forEach(function (d, k) { var key = d.pedra.id + "|" + mm(d.e); (porPedra[key] = porPedra[key] || { pedra: d.pedra, e: d.e, pecas: [] }).pecas.push.apply(porPedra[key].pecas, d.pecas.map(function (p) { var o = clone(p); o.codigo = (d.rotulo || ("B" + (k + 1))) + "-" + p.codigo; return o; })); });
    Object.keys(porPedra).forEach(function (key) {
      var g = porPedra[key], ch = chapaDe(g.pedra);
      if (!ch || !M || !M.otimizar) { out.push({ pedra: g.pedra.nome, ok: false, motivo: ch ? "otimizador indisponível" : "tamanho de chapa da pedra sem fonte", pecas: g.pecas }); return; }
      var veio = g.pedra.tipo === "marmore" || g.pedra.tipo === "quartzo" || g.pedra.tipo === "sinterizado";
      var cat = { chapas: [{ id: "chapa", nome: g.pedra.nome, comprimento: ch.comprimento, largura: ch.largura, espessura: mm(g.e), veio: veio }], fitas: [], corte: { kerf: DES.kerf, refilo: DES.refilo, retalhoMin: 100, sobraFita: 0 } };
      var r = M.otimizar(g.pecas.map(function (p) { return { codigo: p.codigo, nome: p.nome, comprimento: p.comprimento, largura: p.largura, quantidade: 1, chapa: "chapa", veio: veio }; }), cat, {});
      var gr = r.grupos[0] || { chapas: [], nChapas: 0, aproveitamento: 0 };
      out.push({ pedra: g.pedra.nome, espessura: mm(g.e), ok: r.ok, chapa: ch, veio: veio, chapas: gr.chapas, nChapas: gr.nChapas, aproveitamento: gr.aproveitamento, naoCouberam: r.naoCouberam, avisos: r.avisos, kerf: DES.kerf, refilo: DES.refilo });
    });
    return out;
  }

  /* ============================================================ GEOMETRIA (3D) */
  /* placa com furos: retângulo [x0,x1]×[z0,z1] (planta), y de yb a yt, furos convexos (contornos em volta do centro) e
     entalhes retangulares na frente. Cada furo ganha um QUADRO retangular próprio; o resto da placa é grade de
     retângulos; o quadro liga o retângulo ao contorno do furo por raios (contorno convexo). Faces laterais no contorno
     de fora e em cada furo. Malha fechada (sem T no contorno; T só dentro do plano). */
  function placaFurada(x0, x1, z0, z1, yb, yt, furos, entalhes) {
    var v = [], f = [];
    function V(x, y, z) { v.push(r4(x), r4(y), r4(z)); return v.length / 3 - 1; }
    function tri(a, b, c, nx, ny, nz) {
      var A = a * 3, B = b * 3, C = c * 3, ux = v[B] - v[A], uy = v[B + 1] - v[A + 1], uz = v[B + 2] - v[A + 2], wx = v[C] - v[A], wy = v[C + 1] - v[A + 1], wz = v[C + 2] - v[A + 2];
      var cx = uy * wz - uz * wy, cy = uz * wx - ux * wz, cz = ux * wy - uy * wx;
      if (cx * cx + cy * cy + cz * cz < 1e-18) return;
      if (cx * nx + cy * ny + cz * nz >= 0) f.push(a, b, c); else f.push(a, c, b);
    }
    function quadH(xa, za, xb, zb, y, up) { var a = V(xa, y, za), b = V(xb, y, za), c = V(xb, y, zb), d = V(xa, y, zb), s = up ? 1 : -1; tri(a, b, c, 0, s, 0); tri(a, c, d, 0, s, 0); }
    function parede(ax, az, bx, bz, nx, nz) { var a = V(ax, yb, az), b = V(bx, yb, bz), c = V(bx, yt, bz), d = V(ax, yt, az); tri(a, b, c, nx, 0, nz); tri(a, c, d, nx, 0, nz); }
    /* quadros: bbox do furo + folga, recortados pela placa e uns pelos outros */
    var Q = furos.map(function (h) {
      var xs = h.pts.map(function (p) { return p[0]; }), zs = h.pts.map(function (p) { return p[1]; });
      return { h: h, x0: Math.min.apply(null, xs), x1: Math.max.apply(null, xs), z0: Math.min.apply(null, zs), z1: Math.max.apply(null, zs) };
    });
    Q.forEach(function (q) { var m = 0.006; q.x0 = Math.max(x0, q.x0 - m); q.x1 = Math.min(x1, q.x1 + m); q.z0 = Math.max(z0, q.z0 - m); q.z1 = Math.min(z1, q.z1 + m); });
    for (var i = 0; i < Q.length; i++) for (var j = i + 1; j < Q.length; j++) {   /* dois quadros não se cruzam: corta no meio do vão */
      var a = Q[i], b = Q[j];
      if (a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1) {
        var gx = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), gz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
        if (gz <= gx) { if (a.z0 < b.z0) { var mz = (a.h.zmax + b.h.zmin) / 2; a.z1 = Math.min(a.z1, mz); b.z0 = Math.max(b.z0, mz); } else { var mz2 = (b.h.zmax + a.h.zmin) / 2; b.z1 = Math.min(b.z1, mz2); a.z0 = Math.max(a.z0, mz2); } }
        else { if (a.x0 < b.x0) { var mx = (a.h.xmax + b.h.xmin) / 2; a.x1 = Math.min(a.x1, mx); b.x0 = Math.max(b.x0, mx); } else { var mx2 = (b.h.xmax + a.h.xmin) / 2; b.x1 = Math.min(b.x1, mx2); a.x0 = Math.max(a.x0, mx2); } }
      }
    }
    var R = Q.map(function (q) { return { x0: q.x0, x1: q.x1, z0: q.z0, z1: q.z1 }; }).concat(arr(entalhes).map(function (t) { return { x0: t.x0, x1: t.x1, z0: t.z0, z1: z1, vazio: true }; }));
    var xs = [x0, x1], zs = [z0, z1];
    R.forEach(function (r) { xs.push(r.x0, r.x1); zs.push(r.z0, r.z1); });
    function uniq(a) { a.sort(function (p, q) { return p - q; }); var o = []; a.forEach(function (x) { if (!o.length || x - o[o.length - 1] > 1e-6) o.push(x); }); return o; }
    xs = uniq(xs); zs = uniq(zs);
    for (var ix = 0; ix + 1 < xs.length; ix++) for (var iz = 0; iz + 1 < zs.length; iz++) {
      var cx = (xs[ix] + xs[ix + 1]) / 2, cz = (zs[iz] + zs[iz + 1]) / 2;
      if (R.some(function (r) { return cx > r.x0 && cx < r.x1 && cz > r.z0 && cz < r.z1; })) continue;
      quadH(xs[ix], zs[iz], xs[ix + 1], zs[iz + 1], yt, true); quadH(xs[ix], zs[iz], xs[ix + 1], zs[iz + 1], yb, false);
    }
    /* anel de cada quadro: raios do centro do furo pelos ângulos dos vértices do furo + os 4 cantos do quadro */
    Q.forEach(function (q) {
      var h = q.h, c = h.c, angs = [];
      h.pts.forEach(function (p) { angs.push(Math.atan2(p[1] - c[1], p[0] - c[0])); });
      [[q.x0, q.z0], [q.x1, q.z0], [q.x1, q.z1], [q.x0, q.z1]].forEach(function (p) { angs.push(Math.atan2(p[1] - c[1], p[0] - c[0])); });
      angs = uniq(angs.map(function (a) { return a < 0 ? a + TAU : a; }));
      function raioCont(a) {   /* ponto do contorno do furo na direção a */
        var dx = Math.cos(a), dz = Math.sin(a), best = null;
        for (var k = 0; k < h.pts.length; k++) {
          var p = h.pts[k], s = h.pts[(k + 1) % h.pts.length], ex = s[0] - p[0], ez = s[1] - p[1], den = dx * ez - dz * ex;
          if (Math.abs(den) < 1e-12) continue;
          var t = ((p[0] - c[0]) * ez - (p[1] - c[1]) * ex) / den, u = ((p[0] - c[0]) * dz - (p[1] - c[1]) * dx) / den;
          if (t > 0 && u >= -1e-9 && u <= 1 + 1e-9 && (best == null || t < best)) best = t;
        }
        return [c[0] + dx * best, c[1] + dz * best];
      }
      function raioQuadro(a) {
        var dx = Math.cos(a), dz = Math.sin(a), t = Infinity;
        if (dx > 1e-12) t = Math.min(t, (q.x1 - c[0]) / dx); if (dx < -1e-12) t = Math.min(t, (q.x0 - c[0]) / dx);
        if (dz > 1e-12) t = Math.min(t, (q.z1 - c[1]) / dz); if (dz < -1e-12) t = Math.min(t, (q.z0 - c[1]) / dz);
        return [c[0] + dx * t, c[1] + dz * t];
      }
      var inn = angs.map(raioCont), out = angs.map(raioQuadro), n = angs.length;
      [[yt, 1], [yb, -1]].forEach(function (Y) {
        for (var k = 0; k < n; k++) {
          var k2 = (k + 1) % n, a = V(inn[k][0], Y[0], inn[k][1]), b = V(out[k][0], Y[0], out[k][1]), cc = V(out[k2][0], Y[0], out[k2][1]), d = V(inn[k2][0], Y[0], inn[k2][1]);
          tri(a, b, cc, 0, Y[1], 0); tri(a, cc, d, 0, Y[1], 0);
        }
      });
      /* parede do furo (normal para DENTRO do furo) — pelo contorno original */
      for (var k3 = 0; k3 < h.pts.length; k3++) {
        var p0 = h.pts[k3], p1 = h.pts[(k3 + 1) % h.pts.length], mx3 = (p0[0] + p1[0]) / 2 - c[0], mz3 = (p0[1] + p1[1]) / 2 - c[1];
        parede(p0[0], p0[1], p1[0], p1[1], -mx3, -mz3);
      }
    });
    /* contorno de fora (com os entalhes da frente), normal para fora */
    var ent = arr(entalhes).slice().sort(function (a, b) { return a.x0 - b.x0; });
    parede(x0, z0, x1, z0, 0, -1); parede(x1, z0, x1, z1, 1, 0); parede(x0, z1, x0, z0, -1, 0);
    var xa = x1;
    for (var t = ent.length - 1; t >= 0; t--) { var en = ent[t]; parede(xa, z1, en.x1, z1, 0, 1); parede(en.x1, z1, en.x1, en.z0, -1, 0); parede(en.x1, en.z0, en.x0, en.z0, 0, 1); parede(en.x0, en.z0, en.x0, z1, 1, 0); xa = en.x0; }
    parede(xa, z1, x0, z1, 0, 1);
    return { v: v, f: f };
  }
  /* cuba de inox (bojo de parede fina, aba em cima): loft fechado — o mesmo jeito da pia do js/hidlouca.js */
  function bojoInox(ext, rec, Hb, aba, k) {
    var F = HL()._f, m = F.Malha(), R = function (y, hx, hz, r) { return F.anelRR(y, 0, 0, hx, hz, r, k); };
    var hx = ext.L / 2, hz = ext.P / 2, bx = Math.max(0.05, (rec ? rec.L : ext.L - 0.02) / 2 - 0.004), bz = Math.max(0.05, (rec ? rec.P : ext.P - 0.02) / 2 - 0.004), rc = Math.min(0.03, bx * 0.3), e = 0.0012, ab = aba ? 0.0015 : 0;
    var an = [];
    if (aba) an.push(R(ab, hx, hz, 0.01), R(ab, bx + 0.006, bz + 0.006, rc + 0.006));
    an.push(R(0, bx, bz, rc), R(-Hb * 0.5, bx - 0.004, bz - 0.004, rc), R(-Hb + 0.02, bx - 0.008, bz - 0.008, rc), R(-Hb, bx - 0.03, bz - 0.03, Math.max(0.005, rc - 0.02)),
      R(-Hb - e, bx - 0.03, bz - 0.03, Math.max(0.005, rc - 0.02)), R(-Hb + 0.02 - e, bx - 0.008 + e, bz - 0.008 + e, rc), R(-e, bx + e, bz + e, rc));
    if (aba) an.push(R(-e, hx, hz, 0.01));
    F.loft(m, an, { fechado: true });
    return m;
  }
  /* cuba esculpida: rebaixo na pedra com o fundo em rampa (caimento para o fundo) e o canal de escoamento atrás */
  function esculpida(rec, Hb, e) {
    var F = HL()._f, m = F.Malha(), hx = rec.L / 2, hz = rec.P / 2, k = 1;
    var R = function (y, x, z, w, d) { return F.anelRR(y, x, z, w, d, 0.004, k); };
    /* frente rasa (Hb·0,35) e fundo fundo (Hb): seções em planta não fazem rampa — a rampa é uma placa inclinada */
    F.loft(m, [R(0, 0, 0, hx, hz), R(-Hb, 0, 0, hx, hz), R(-Hb - e, 0, 0, hx + e, hz + e), R(0, 0, 0, hx + e, hz + e)], { fechado: true });
    /* rampa: do lábio da frente (−0,35 Hb) até o canal atrás (−0,9 Hb), 10 mm acima do fundo do canal */
    var rp = F.Malha(), z0 = hz, z1 = -hz + 0.04, y0 = -Hb * 0.35, y1 = -Hb * 0.9, t = e;
    var P8 = [[-hx, y0, z0], [hx, y0, z0], [hx, y1, z1], [-hx, y1, z1]];
    var vv = []; P8.forEach(function (p) { vv.push(p[0], p[1], p[2]); }); P8.forEach(function (p) { vv.push(p[0], p[1] - t, p[2]); });
    rp.v = vv; rp.f = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
    return { cuba: m, rampa: rp };
  }
  /* torneira (corpo + bica + alavanca), na base (x, y, z) do tampo; parede: sai da parede (z = 0) na altura do ponto */
  function malhaTorneira(t, base, mesa, k) {
    var F = HL()._f, m = F.Malha(), n = 14;
    var alt = num(t && t.altura, mesa ? 160 : 0) / 1000 || 0.16, alc = num(t && t.alcance, 0) / 1000 || (mesa ? 0.12 : 0.2), x = base[0], y = base[1], z = base[2];
    if (mesa) {
      var rb = 0.025, rc = 0.018, hc = Math.max(0.06, alt * 0.55);
      F.torno(m, [[rb, 0], [rb, 0.006], [rc * 1.05, 0.014], [rc, hc], [rc * 0.9, hc + 0.01], [0, hc + 0.012]], n, { c: [x, y, z] });
      var yb = Math.max(hc, alt - 0.012);
      F.tubo(m, [[x, y + hc * 0.8, z], [x, y + yb, z + 0.004], [x, y + yb, z + alc], [x, y + yb - 0.04, z + alc]], 0.011, 12, { rc: Math.min(0.05, alc * 0.35), arco: 4, fim: true });
      F.tubo(m, [[x, y + hc + 0.006, z - 0.004], [x, y + hc + 0.028, z - 0.06]], 0.0055, 8, { rc: 0 });
    } else {
      F.torno(m, [[0.028, 0], [0.028, 0.008], [0.016, 0.012], [0.016, 0.06], [0, 0.062]], n, { c: [x, y, z], eixo: [0, 0, 1] });
      F.tubo(m, [[x, y, z + 0.05], [x, y, z + alc], [x, y - 0.05, z + alc]], 0.011, 12, { rc: 0.03, arco: 4, fim: true });
      F.tubo(m, [[x, y + 0.02, z + 0.04], [x, y + 0.07, z + 0.06]], 0.0055, 8, { rc: 0 });
    }
    return m;
  }
  var MAT_METAL = { cromado: "Metal cromado", preto_fosco: "metal preto", gold: "latão", rose_gold: "Metal rose gold", inox_escovado: "Inox escovado" };
  function materialPedra(def) { return def.pedra.nome + (def.superficie !== "Polido" ? " — " + def.superficie.toLowerCase() : ""); }
  /* registra os materiais das pedras e dos metais no catálogo de acabamento visual (cor + textura da biblioteca) */
  var _reg = {};
  function registrarMateriais(def) {
    var A = global.BimAcabVis; if (!A || !A.registrar) return;
    var nome = materialPedra(def); if (_reg[nome]) return; _reg[nome] = 1;
    var rd = def.pedra.render || {}, rug = num(rd.rug, 0.2) + (def.superficie === "Levigado" ? 0.45 : (def.superficie === "Escovado" ? 0.35 : 0));
    A.registrar([{ id: "marm-" + norm(nome).replace(/[^a-z0-9]+/g, "-"), rotulo: nome, grupo: "pedra", cor: rd.cor || "#cccccc", slug: rd.slug || "", rug: Math.min(0.95, rug), met: 0 },
      { id: "marm-metal-rose-gold", rotulo: "Metal rose gold", grupo: "metal", cor: "#c9907a", slug: "", rug: 0.25, met: 0.9 },
      { id: "marm-inox-escovado", rotulo: "Inox escovado", grupo: "metal", cor: "#c4c8cc", slug: "", rug: 0.38, met: 0.85 }]);
  }
  function malha(def, c) {
    var L = def.L, P = def.P, H = def.H, e = def.e, mat = materialPedra(def), x0 = -L / 2, x1 = L / 2;
    registrarMateriais(def);
    /* TAMPO: furos e entalhes */
    var furos = [], entalhes = [];
    def.cubas.forEach(function (cb) {
      if (cb.instalacao === "apoio") return;   /* o furo da válvula entra na lista de furos */
      if (cb.instalacao === "semi_encaixe") { entalhes.push({ x0: cb.xc - cb.rec.L / 2, x1: cb.xc + cb.rec.L / 2, z0: P - cb.rec.P }); return; }
      var pts = contorno(cb.rec).map(function (p) { return [cb.xc + p[0], cb.zc + p[1]]; });
      furos.push(fur(pts, [cb.xc, cb.zc]));
    });
    def.furos.forEach(function (fu) { var pts = contorno({ forma: "redondo", L: fu.d, P: fu.d }, 20).map(function (p) { return [fu.x + p[0], fu.z + p[1]]; }); furos.push(fur(pts, [fu.x, fu.z])); });
    function fur(pts, cc) { var xs = pts.map(function (p) { return p[0]; }), zs = pts.map(function (p) { return p[1]; }); return { pts: pts, c: cc, xmin: Math.min.apply(null, xs), xmax: Math.max.apply(null, xs), zmin: Math.min.apply(null, zs), zmax: Math.max.apply(null, zs) }; }
    var pl = placaFurada(x0, x1, 0, P, H - e, H, furos, entalhes);
    c._add(mat, pl.v, pl.f, {});
    /* SAIA (meia-esquadria: a peça vai do topo do tampo ao pé da saia; aqui o tampo já ocupa a espessura) */
    var s = def.saia;
    if (s.h > 0) {
      var segs = [[x0, x1]];
      entalhes.forEach(function (en) { var n2 = []; segs.forEach(function (sg) { if (en.x1 <= sg[0] || en.x0 >= sg[1]) n2.push(sg); else { if (en.x0 > sg[0]) n2.push([sg[0], en.x0]); if (en.x1 < sg[1]) n2.push([en.x1, sg[1]]); } }); segs = n2; });
      segs.forEach(function (sg) { if (sg[1] - sg[0] > 0.005) c.caixa(mat, (sg[0] + sg[1]) / 2, H - s.h, P - e / 2, sg[1] - sg[0], s.h - e, e); });
      if (s.lados.esq) c.caixa(mat, x0 + e / 2, H - s.h, P / 2, e, s.h - e, P - 2 * e);
      if (s.lados.dir) c.caixa(mat, x1 - e / 2, H - s.h, P / 2, e, s.h - e, P - 2 * e);
    }
    /* RODABANCA */
    var rb = def.rodabanca;
    if (rb.h > 0) {
      if (rb.lados.fundo) c.caixa(mat, 0, H, e / 2, L, rb.h, e);
      var z0r = rb.lados.fundo ? e : 0, pr = P - z0r;
      if (rb.lados.esq) c.caixa(mat, x0 + e / 2, H, z0r + pr / 2, e, rb.h, pr);
      if (rb.lados.dir) c.caixa(mat, x1 - e / 2, H, z0r + pr / 2, e, rb.h, pr);
    }
    /* APOIO */
    var yBase = H - e - (s.h > 0 ? s.h - e : 0);
    if (def.apoio === "Mão-francesa") {
      var nM = maosFrancesas(L), aba = Math.min(0.4, P * 0.7);
      for (var i = 0; i < nM; i++) {
        var xm = x0 + 0.1 + (L - 0.2) * (nM === 1 ? 0.5 : i / (nM - 1));
        c.caixa("Branco", xm, H - e - 0.004, aba / 2, 0.025, 0.004, aba); c.caixa("Branco", xm, H - e - aba, 0.002, 0.025, aba, 0.004);
        c.caixa("Branco", xm, H - e - aba * 0.5 - 0.01, aba * 0.5 * 0.7, 0.02, 0.004, aba * 0.95, { rotX: -45 });   /* a diagonal do suporte */
      }
    } else if (def.apoio === "Gabinete") {
      var hg = Math.max(0.3, yBase - 0.15);
      c.caixa("laca branca", 0, 0.15, P / 2 - 0.02, L - 0.02, hg, P - 0.06); c.caixa("metal preto", 0, 0.15 - 0.008, P / 2 - 0.05, L - 0.06, 0.008, P - 0.12);
      var nmod = Math.max(1, Math.round(L / 0.5)), wm = (L - 0.02) / nmod;
      for (var g = 1; g < nmod; g++) c.caixa("metal preto", -L / 2 + 0.01 + wm * g, 0.16, P - 0.05 + 0.001, 0.003, hg - 0.02, 0.002);
    } else {
      [x0 + 0.05, x1 - 0.05].forEach(function (xa) { c.caixa("Pintura branca", xa, 0, P / 2, 0.1, yBase, P); });
    }
    /* CUBAS, TORNEIRAS, VÁLVULA, SIFÃO E FLEXÍVEIS (todos terminam nos conectores) */
    var G = HL(), F = G && G._f, k = 3;
    def.cubas.forEach(function (cb) {
      var ext = cb.ext, inst = cb.instalacao, louca = !cb.inox, yFundo;
      if (!F) return;
      if (inst === "esculpida") {
        var es = esculpida(cb.rec, Math.max(0.08, ext.H), e);
        c._add(mat, es.cuba.v, es.cuba.f, { x: cb.xc, y: H, z: cb.zc }); c._add(mat, es.rampa.v, es.rampa.f, { x: cb.xc, y: H, z: cb.zc });
        yFundo = H - Math.max(0.08, ext.H);
      } else if (louca) {
        var modelo = inst === "apoio" ? 0 : 1, r = G.gerar("cuba", { W: ext.L, P: ext.P, Hc: ext.H, Ea: Math.max(0.1, cb.Ea), modelo: modelo, ret: /retang|quadrad/.test(norm(cb.cat.formato)) ? 1 : 0, metais: 0 }, { nivel: 0 });
        var yC = inst === "undermount" ? H - e - 0.009 : (inst === "apoio" ? H : H);
        if (r.ok) r.partes.forEach(function (p) { c._add(p.material === "@" ? "Louça branca" : p.material, p.v, p.f, { x: cb.xc, y: yC, z: cb.zc }); });
        yFundo = inst === "apoio" ? H + 0.01 : yC - ext.H + 0.012;
      } else {
        var aba = inst === "sobrepor" || inst === "embutir" || inst === "tanque";
        var bm = bojoInox(ext, inst === "undermount" ? null : cb.rec, ext.H, aba, k);
        c._add("Inox", bm.v, bm.f, { x: cb.xc, y: inst === "undermount" ? H - e - 0.002 : H, z: cb.zc });
        yFundo = (inst === "undermount" ? H - e - 0.002 : H) - ext.H;
      }
      if (!def.metais3d) return;
      var metal = MAT_METAL[(cb.torneira && cb.torneira.acabamento) || "cromado"] || "Metal cromado", mt = F.Malha(), n = 12;
      /* válvula no fundo (no centro da cuba) e o tubo até o sifão; o sifão termina NO conector de esgoto (parede, z = 0) */
      var yE = H - cb.Ea, xv = cb.xc, zv = cb.zc, rv = cb.inox ? 0.045 : 0.021;
      F.torno(mt, [[rv * 0.3, 0.004], [rv, 0.002], [rv * 1.05, 0], [rv * 0.98, -0.004], [rv * 0.6, -0.006]], n, { c: [xv, yFundo + 0.003, zv] });
      var ySif = Math.min(yFundo - 0.06, yE + 0.08);
      F.tubo(mt, [[xv, yFundo - 0.004, zv], [xv, ySif, zv]], 0.016, n, { rc: 0 });
      F.torno(mt, [[0.02, 0], [0.033, 0.006], [0.034, 0.03], [0.034, 0.1], [0.03, 0.11], [0.018, 0.12], [0, 0.121]], n, { c: [xv, ySif - 0.12, zv] });
      F.tubo(mt, [[xv, yE + 0.0, zv - 0.02], [xv, yE, Math.max(0.03, zv - 0.06)], [xv, yE, 0.0]], 0.016, n, { rc: 0.02, arco: 3 });
      c._add(metal === "Metal cromado" ? "Metal cromado" : metal, mt.v, mt.f, {});
      /* torneira */
      var tn = cb.torneira;
      if (tn) {
        var mesa = tn.instalacao === "mesa", ft = cb.furosTorneira[cb.furosTorneira.length > 1 ? 1 : 0];
        var base = mesa ? (ft ? [ft.x, H, ft.z] : [cb.xc, inst === "apoio" ? H : H, cb.zc - cb.rec.P / 2 - 0.03]) : [cb.xc, cb.yAgua, 0];
        var tm = malhaTorneira(tn, base, mesa, k);
        c._add(metal, tm.v, tm.f, {});
        /* flexíveis: do pé da torneira (embaixo do tampo) até os pontos de água da parede */
        if (mesa) {
          var fl = F.Malha();
          def.conectores.filter(function (k2) { return (k2.id === "af" + cb.suf || k2.id === "aq" + cb.suf); }).forEach(function (k2) {
            var yI = H - e - 0.02;
            F.tubo(fl, [[base[0], yI, base[2]], [base[0], yI - 0.06, base[2]], [k2.x, k2.y + 0.03, Math.max(0.03, base[2] * 0.5)], [k2.x, k2.y, 0.03], [k2.x, k2.y, 0]], 0.0045, 8, { rc: 0.03, arco: 3 });
          });
          if (fl.f.length) c._add("Inox escovado", fl.v, fl.f, {});
        }
      }
    });
    return c;
  }

  /* ============================================================ A FAMÍLIA */
  function completar(fam, tipo, inst, saida) {
    var M = Mob();
    if (!M) { saida.ok = false; saida.erros = (saida.erros || []).concat(["o gerador de geometria (js/mobgeo.js) não carregou"]); return saida; }
    var v = saida.valores || {}, def;
    try { def = montar(v, { ambiente: fam.ambiente }); } catch (e) { saida.ok = false; saida.erros = (saida.erros || []).concat(["bancada: " + e.message]); return saida; }
    var c = M.cena();
    try { malha(def, c); } catch (e2) { saida.ok = false; saida.erros = (saida.erros || []).concat(["bancada (3D): " + e2.message]); return saida; }
    saida.solidos = c.solidos("marm:");
    saida.caixa = c.env ? { x0: c.env.x0, y0: c.env.y0, z0: Math.max(0, c.env.z0), x1: c.env.x1, y1: c.env.y1, z1: c.env.z1 } : null;
    /* a face de trás é a parede: os pontos de ligação ficam nela (biminst.conectoresDe → ponto de parede) */
    if (saida.caixa) saida.caixa.z0 = 0;
    saida.conectores = def.conectores.map(function (k) { var o = { id: k.id, nome: k.nome, sistema: k.sistema, dn: k.dn, x: k.x, y: k.y, z: k.z }; if (k.torneira) { o.vazao_L_min = k.vazao_L_min; o.pressaoMin_kPa = k.pressaoMin_kPa; o.pressaoMax_kPa = k.pressaoMax_kPa; o.torneira = k.torneira; } return o; });
    var q = quantitativo(def);
    saida.quantitativo = { unidade: "m2", quantidade: q.m2, codigo: "", codigoOrigem: "", fonte: "", descricao: "Bancada em " + def.pedra.nome + " (marmoraria: ver orçamento da bancada)" };
    saida.marmoraria = { def: resumo(def), quantitativo: q };
    saida.avisosFamilia = def.avisos.concat(def.pendencias);
    return saida;
  }
  /* o que a prancha e o orçamento precisam, sem os objetos do catálogo inteiros */
  function resumo(def) {
    return { ambiente: def.ambiente, L: def.L, P: def.P, H: def.H, e: def.e, pedra: def.pedra.nome, superficie: def.superficie, borda: def.borda, saia: def.saia, rodabanca: def.rodabanca, apoio: def.apoio,
      cubas: def.cubas.map(function (c) { return { rotulo: c.rotulo, instalacao: c.instalacao, recorte: { forma: c.rec.forma, L: mm(c.rec.L), P: mm(c.rec.P), raio: mm(c.rec.raio), fonte: c.rec.fonte }, xL: mm(c.xL), zFrente: mm(c.zFrente), torneira: c.torneira ? rotuloTorneira(c.torneira) : "" }; }),
      furos: def.furos.map(function (f) { return { tipo: f.tipo, d: mm(f.d), xL: mm(f.xL), zFrente: mm(f.zFrente) }; }), pecas: def.pecas, avisos: def.avisos, pendencias: def.pendencias };
  }

  function P(nome, tipoDado, valor, grupo, descricao, escopo, opcoes) {
    var o = { nome: nome, tipoDado: tipoDado, escopo: escopo || "instancia", valor: valor, grupo: grupo };
    if (descricao) o.descricao = descricao; if (opcoes) o.opcoes = opcoes;
    return o;
  }
  function familia(amb) {
    var cs = cubasDe(amb), ts = torneirasDe(amb), pedras = todasPedras().map(function (p) { return p.nome; });
    var rc = cs.map(rotuloCuba), rt = ["Sem torneira"].concat(ts.map(rotuloTorneira));
    /* a cuba que nasce: com GABARITO do fabricante, uma cuba só, do tipo mais usado no ambiente */
    var comGab = function (c) { return c.recorte && (c.recorteFonte === "fabricante" || c.recorteFonte === "loja") && (c.n_cubas || 1) === 1; };
    var cub0 = cs.filter(function (c) { return comGab(c) && (amb === "cozinha" ? c.instalacao === "embutir" : c.instalacao === "embutir" || c.instalacao === "sobrepor"); })[0] ||
      cs.filter(function (c) { return comGab(c) && c.instalacao !== "tanque"; })[0] || cs[0];
    var tor0 = ts.filter(function (t) { return t.instalacao === "mesa"; })[0] || ts[0];
    var ped0 = pedras.filter(function (n) { return amb === "cozinha" ? /preto s[aã]o gabriel/i.test(n) : /branco|dallas|siena/i.test(n); })[0] || pedras[0] || "";
    var Hp = amb === "cozinha" ? REGRA.alturaCozinha : REGRA.alturaBanho, Lp = amb === "cozinha" ? 1.6 : 1.2, Pp = amb === "cozinha" ? 0.6 : 0.55;
    var nome = amb === "cozinha" ? "Bancada de cozinha em pedra com cuba e torneira" : "Bancada de banheiro em pedra com cuba e torneira";
    return {
      id: "ra-marm-bancada-" + (amb === "cozinha" ? "cozinha" : "banho"), nome: nome, categoria: amb === "cozinha" ? "cozinha" : "banho", hospedagem: "livre", geometria: "marmoraria", ambiente: amb, disciplina: "mobiliario", previa: "modelador",
      descricao: "Conjunto da marmoraria: tampo de pedra recortado de verdade (sobrepor → furo pelo gabarito; por baixo → corte com borda polida; esculpida → rebaixo com caimento), saia, rodabanca, apoio, cuba do catálogo, torneira (furo de mesa pela ficha; de parede sem furo) e os pontos de água e esgoto de cada cuba na parede. Troque a pedra, a cuba e a torneira nas Propriedades. Origem: no piso, no meio do comprimento, com o fundo na parede (Z = 0).",
      parametros: [
        P("Comprimento", "comprimento", Lp, "Dimensões", "Comprimento total da pedra"), P("Profundidade", "comprimento", Pp, "Dimensões", "Da parede à frente da pedra"),
        P("Altura", "comprimento", Hp, "Dimensões", "Do piso ao topo do tampo (Deca p.116: 850 a 900 mm; PNE 780 a 800 mm)"),
        P("Espessura", "comprimento", 0.02, "Pedra", "Espessura da chapa: 0,02 ou 0,03 m", "instancia", ["0,02", "0,03"]),
        P("Pedra", "texto", ped0, "Pedra", "Tipo de pedra (nome comercial, com fonte no catálogo)", "instancia", pedras),
        P("Acabamento_superficie", "texto", "Polido", "Pedra", "Polido, levigado ou escovado", "instancia", SUPERFICIES),
        P("Borda", "texto", "Reta", "Pedra", "Acabamento da borda aparente", "instancia", BORDAS),
        P("Saia_altura", "comprimento", amb === "cozinha" ? 0.04 : 0.10, "Saia e rodabanca", "Altura aparente da frente (0 = sem saia); peça em meia-esquadria"),
        P("Saia_lados", "texto", "Frente", "Saia e rodabanca", "", "instancia", SAIA_LADOS),
        P("Rodabanca_altura", "comprimento", 0.10, "Saia e rodabanca", "Altura do frontão sobre o tampo (0 = sem)"),
        P("Rodabanca_lados", "texto", "Fundo", "Saia e rodabanca", "", "instancia", RB_LADOS),
        P("Apoio", "texto", amb === "cozinha" ? "Gabinete" : "Mão-francesa", "Construção", "", "instancia", APOIOS),
        P("Cubas", "inteiro", 1, "Cuba", "0, 1 ou 2 cubas"),
        P("Cuba", "texto", cub0 ? rotuloCuba(cub0) : "", "Cuba", "Fabricante — instalação e medida (o recorte segue o gabarito do fabricante)", "instancia", rc),
        P("Posicao_cuba", "comprimento", 0, "Cuba", "Da ponta ESQUERDA ao eixo da cuba (0 = automática: centrada)"),
        P("Recuo_cuba", "comprimento", 0, "Cuba", "Da borda frontal da pedra à frente do recorte (0 = automático)"),
        P("Cuba_2", "texto", cub0 ? rotuloCuba(cub0) : "", "Cuba", "Segunda cuba (com Cubas = 2)", "instancia", rc),
        P("Posicao_cuba_2", "comprimento", 0, "Cuba", "Da ponta esquerda ao eixo da 2ª cuba (0 = automática: a 3/4)"),
        P("Torneira", "texto", tor0 ? rotuloTorneira(tor0) : "Sem torneira", "Torneira", "Mesa (furo pela ficha) ou parede (sem furo; o ponto vai para a parede)", "instancia", rt),
        P("Torneira_2", "texto", tor0 ? rotuloTorneira(tor0) : "Sem torneira", "Torneira", "Torneira da 2ª cuba", "instancia", rt),
        P("Metais_3D", "simnao", true, "Construção", "Desenhar válvula, sifão e flexíveis no 3D")
      ],
      tipos: amb === "cozinha"
        ? [{ id: "c160", nome: "1,60 m — 1 cuba", valores: {} }, { id: "c200", nome: "2,00 m — 1 cuba", valores: { Comprimento: 2.0 } }, { id: "c240", nome: "2,40 m — 2 cubas", valores: { Comprimento: 2.4, Cubas: 2 } }]
        : [{ id: "b80", nome: "0,80 m — 1 cuba", valores: { Comprimento: 0.8 } }, { id: "b120", nome: "1,20 m — 1 cuba", valores: {} }, { id: "b160", nome: "1,60 m — 2 cubas", valores: { Comprimento: 1.6, Cubas: 2 } }],
      quantitativo: { unidade: "m2", quantidade: "1", codigo: "", fonte: "", descricao: nome }
    };
  }
  var LISTA = null;
  function lista() { if (!LISTA) LISTA = [familia("banho"), familia("cozinha")]; return clone(LISTA); }
  function registrar() { var RA = global.FamiliasRA || dep("FamiliasRA", "familiasra.js"); if (RA && RA.registrar) RA.registrar(lista()); }
  function ehMarmoraria(famId) { return /^ra-marm-/.test(txt(famId)); }
  /* a bancada resolvida de uma instância do modelo (prancha, orçamento) */
  function deInstancia(fam, inst, tipoId) {
    var F = global.Familia || dep("Familia", "familia.js"); if (!F) return null;
    var av = F.avaliar(fam, tipoId, inst || {}); if (!av || !av.valores) return null;
    return montar(av.valores, { ambiente: fam.ambiente });
  }

  var Marmoraria = {
    REGRA: REGRA, DES: DES, BORDAS: BORDAS, SUPERFICIES: SUPERFICIES, APOIOS: APOIOS, FONTE_DECA: FONTE_DECA, FONTE_TIGRE: FONTE_TIGRE,
    dados: D, cuba: cuba, torneira: torneira, pedra: pedra, pedrasExtras: pedrasExtras, cubasDe: cubasDe, torneirasDe: torneirasDe, rotuloCuba: rotuloCuba, rotuloTorneira: rotuloTorneira,
    alternativasCuba: alternativasCuba, alternativasTorneira: alternativasTorneira,
    recorteDe: recorteDe, contorno: contorno, montar: montar, quantitativo: quantitativo, orcamento: orcamento, itensQuantitativo: itensQuantitativo, orcamentoTabela: orcamentoTabela, planoChapa: planoChapa, chapaDe: chapaDe, maosFrancesas: maosFrancesas,
    malha: malha, placaFurada: placaFurada, completar: completar, familia: familia, lista: lista, registrar: registrar, ehMarmoraria: ehMarmoraria, deInstancia: deInstancia, resumo: resumo,
    materialPedra: materialPedra, _limpar: function () { _rotC = _rotT = null; LISTA = null; }
  };
  global.Marmoraria = Marmoraria;
  registrar();
  if (typeof module !== "undefined" && module.exports) module.exports = Marmoraria;
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
