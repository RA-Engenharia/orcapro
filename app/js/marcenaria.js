/* =====================================================================
 * marcenaria.js — CARPINTARIA & MARCENARIA do OrçaPRO Modela (motor puro)
 *
 * Pedido do Rogério (09/10/2026): "o carpinteiro, o marceneiro, quando for
 * utilizar, tem as ferramentas de marcenaria; já tem as FAMÍLIAS
 * configuradas para ele criar ali dentro a marcenaria. O sistema tem que ser
 * capaz de gerar os ARQUIVOS que manda para aquelas empresas que fazem o
 * CORTE das madeiras."
 *
 * ES5, sem DOM, Node-testável (tools/test-marcenaria.js). Tudo em MILÍMETROS
 * (a unidade das empresas de corte); a família do modelo fala em metros.
 *
 * O QUE ESTÁ AQUI
 *   · CATÁLOGO (chapas, fitas de borda, parâmetros de corte e de furação) —
 *     cada número é VALOR DE PARTIDA, EDITÁVEL na tela "Chapas e fitas".
 *     Nada aqui é norma: é medida usual de mercado, para o marceneiro conferir
 *     no catálogo da chapa e no gabarito da ferragem que ele compra.
 *   · MÓDULOS em chapa (armário aéreo, balcão, gaveteiro, roupeiro,
 *     prateleira, painel ripado, nicho): `explodir(modulo)` devolve as PEÇAS
 *     (comprimento = sentido do VEIO × largura × espessura, fita por lado
 *     C1/C2/L1/L2, furos e usinagens com posição) e as FERRAGENS.
 *   · CARPINTARIA (pergolado, deck, tesoura simples): peças serradas com
 *     seção, comprimento e os ÂNGULOS DE CORTE; `otimizarBarras` corta das
 *     barras comerciais.
 *   · PLANO DE CORTE em chapa: guilhotina, refilo, espessura da serra
 *     (kerf), veio respeitado (peça com veio NÃO gira) — determinístico.
 *   · FAMÍLIAS do modelo (FamiliasMarcenaria): a família de js/familia.js com
 *     `geometria: "marcenaria"` — os parâmetros são os de qualquer família
 *     (tipo, instância, Propriedades) e a geometria sai DAQUI (`completar`),
 *     peça a peça: o que se vê no 3D é o que vai para o corte.
 *
 * CONVENÇÕES DA PEÇA (as mesmas da planilha, das etiquetas e do DXF)
 *   u = ao longo do COMPRIMENTO (0 → comprimento), v = ao longo da LARGURA.
 *   C1 = borda v = 0, C2 = borda v = largura (as bordas do comprimento);
 *   L1 = borda u = 0, L2 = borda u = comprimento (as bordas da largura).
 *   Face A = a face usinada (a interna). Lateral e divisória: u de baixo para
 *   cima, C1 = frente. Base, tampo, prateleira: u da esquerda, C1 = frente.
 *   Porta: u de baixo para cima, C1 = borda das DOBRADIÇAS. Gaveta (caixa):
 *   C1 = topo. Frente de gaveta: u da esquerda, C1 = borda de baixo.
 * MÓDULO no modelo: origem no piso, no meio da largura, encostado na parede;
 *   X = largura, Y = para cima, Z = para fora da parede (a frente em Z = P).
 * ===================================================================== */
(function (global) {
  "use strict";

  function arr(a) { return Array.isArray(a) ? a : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function num(v, d) { var n = typeof v === "number" ? v : parseFloat(txt(v).replace(",", ".")); return isFinite(n) ? n : d; }
  function r1(v) { return Math.round(v * 10) / 10; }
  function r2(v) { return Math.round(v * 100) / 100; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function chave(s) { return txt(s).toLowerCase().normalize ? txt(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") : txt(s).toLowerCase(); }

  /* ====================================================== CATÁLOGO
   * VALORES DE PARTIDA, EDITÁVEIS. Chapa 2750 × 1850 mm (MDF) e 2750 × 1830
   * mm (MDP) — os formatos usuais das chapas de 15/18/25 mm no mercado
   * brasileiro; compensado 2200 × 1600 mm. Conferir no fornecedor. */
  var CATALOGO_PADRAO = {
    versao: 1,
    chapas: [
      { id: "mdf-branco-15", nome: "MDF Branco TX 15 mm", tipo: "MDF", espessura: 15, comprimento: 2750, largura: 1850, veio: false, cor: "#f1f1ef", fita: "pvc-branco-045-22" },
      { id: "mdf-branco-18", nome: "MDF Branco TX 18 mm", tipo: "MDF", espessura: 18, comprimento: 2750, largura: 1850, veio: false, cor: "#f1f1ef", fita: "pvc-branco-1-22" },
      { id: "mdf-branco-25", nome: "MDF Branco TX 25 mm", tipo: "MDF", espessura: 25, comprimento: 2750, largura: 1850, veio: false, cor: "#f1f1ef", fita: "pvc-branco-1-35" },
      { id: "mdf-carvalho-18", nome: "MDF Madeirado Carvalho 18 mm", tipo: "MDF", espessura: 18, comprimento: 2750, largura: 1850, veio: true, cor: "#b98b5b", fita: "pvc-carvalho-1-22" },
      { id: "mdp-branco-15", nome: "MDP Branco 15 mm", tipo: "MDP", espessura: 15, comprimento: 2750, largura: 1830, veio: false, cor: "#f4f4f2", fita: "pvc-branco-045-22" },
      { id: "mdp-branco-18", nome: "MDP Branco 18 mm", tipo: "MDP", espessura: 18, comprimento: 2750, largura: 1830, veio: false, cor: "#f4f4f2", fita: "pvc-branco-1-22" },
      { id: "hdf-branco-3", nome: "HDF Branco 3 mm (fundo)", tipo: "HDF", espessura: 3, comprimento: 2750, largura: 1850, veio: false, cor: "#ececea", fita: "" },
      { id: "mdf-branco-6", nome: "MDF Branco 6 mm (fundo)", tipo: "MDF", espessura: 6, comprimento: 2750, largura: 1850, veio: false, cor: "#ececea", fita: "" },
      { id: "compensado-18", nome: "Compensado multilaminado 18 mm", tipo: "Compensado", espessura: 18, comprimento: 2200, largura: 1600, veio: true, cor: "#c9a26b", fita: "pvc-carvalho-1-22" }
    ],
    /* fita de borda de PVC: 22 mm cobre a chapa de 15/18; 35 mm a de 25 */
    fitas: [
      { id: "pvc-branco-045-22", nome: "Fita PVC Branco 22 × 0,45 mm", espessura: 0.45, largura: 22, cor: "#f1f1ef" },
      { id: "pvc-branco-1-22", nome: "Fita PVC Branco 22 × 1 mm", espessura: 1, largura: 22, cor: "#f1f1ef" },
      { id: "pvc-branco-1-35", nome: "Fita PVC Branco 35 × 1 mm", espessura: 1, largura: 35, cor: "#f1f1ef" },
      { id: "pvc-carvalho-1-22", nome: "Fita PVC Carvalho 22 × 1 mm", espessura: 1, largura: 22, cor: "#b98b5b" }
    ],
    /* o CORTE: serra de 4 mm, 10 mm de refilo por borda da chapa, 30 mm de
       sobra de fita por aresta (a coladeira apara), retalho aproveitável a
       partir de 100 mm no menor lado */
    corte: { kerf: 4, refilo: 10, sobraFita: 30, retalhoMin: 100, barra: 4000 },
    /* a FURAÇÃO (mm). Sistema 32: 37 mm da borda, passo 32. Dobradiça de
       caneco 35 mm, 12 mm de fundo, centro a 21,5 mm da borda (4 mm de
       distância da borda ao caneco + 17,5 do raio); 100 mm das pontas.
       Minifix 15 mm a 34 mm da borda, pino em furo de 5 mm. Cavilha 8 mm.
       TUDO valor de partida: conferir no gabarito do fabricante. */
    furacao: {
      dobradica: { d: 35, prof: 12, borda: 21.5, ponta: 100, placaRecuo: 37, placaPasso: 32, placaD: 5, placaProf: 12 },
      cavilha: { d: 8, profFace: 12, profTopo: 20, afasta: 32 },
      minifix: { dCorpo: 15, profCorpo: 13, dist: 34, dTopo: 8, profTopo: 34, dPino: 5, profPino: 11 },
      parafuso: { dFace: 5, dTopo: 3, profTopo: 40 },
      ligacao: { recuo: 37, meio: 600 },
      suporte: { d: 5, prof: 10, recuo: 37, passo: 32 },
      corredica: { d: 3, prof: 10, inicio: 37, passo: 128, centro: 22, folga: 12.5, comprimentos: [250, 300, 350, 400, 450, 500, 550] },
      puxador: { d: 5, borda: 35 },
      canal: { prof: 8, folga: 0.5, entra: 7 },
      gaveta: { folgaTopo: 25, folgaBase: 15, minAltura: 60, folgaFundoCaixa: 10 },
      correr: { trilho: 50, transpasse: 30, folgaAltura: 25 }
    },
    /* nº de dobradiças pela altura da porta (tabela usual de catálogo):
       até 900 mm → 2; até 1600 → 3; até 2000 → 4; acima → 5 */
    dobradicasPorAltura: [[900, 2], [1600, 3], [2000, 4], [99999, 5]]
  };
  var catAtual = clone(CATALOGO_PADRAO);

  /* catálogo do usuário por cima do padrão (o que ele não mexeu fica o de partida) */
  function mesclar(base, novo) {
    if (!novo || typeof novo !== "object") return base;
    Object.keys(novo).forEach(function (k) {
      if (Array.isArray(novo[k])) base[k] = clone(novo[k]);
      else if (novo[k] && typeof novo[k] === "object" && base[k] && typeof base[k] === "object" && !Array.isArray(base[k])) mesclar(base[k], novo[k]);
      else if (novo[k] !== undefined) base[k] = novo[k];
    });
    return base;
  }
  function validarCatalogo(c) {
    var erros = [];
    if (!c || !arr(c.chapas).length) erros.push("o catálogo precisa de pelo menos uma chapa");
    var ids = {};
    arr(c && c.chapas).forEach(function (ch, i) {
      var r = "chapa " + (ch && ch.nome ? "\"" + ch.nome + "\"" : i + 1);
      if (!ch || !txt(ch.id).trim()) { erros.push(r + ": sem identificador"); return; }
      if (ids[ch.id]) erros.push(r + ": identificador repetido"); ids[ch.id] = 1;
      if (!(num(ch.espessura, 0) > 0)) erros.push(r + ": espessura inválida");
      if (!(num(ch.comprimento, 0) > 0) || !(num(ch.largura, 0) > 0)) erros.push(r + ": tamanho da chapa inválido");
    });
    arr(c && c.fitas).forEach(function (f, i) { if (!f || !txt(f.id).trim()) erros.push("fita " + (i + 1) + ": sem identificador"); else if (!(num(f.largura, 0) > 0)) erros.push("fita \"" + f.nome + "\": largura inválida"); });
    var k = c && c.corte ? c.corte : {};
    if (!(num(k.kerf, -1) >= 0)) erros.push("espessura da serra inválida");
    if (!(num(k.refilo, -1) >= 0)) erros.push("refilo inválido");
    return { ok: !erros.length, erros: erros };
  }
  function chapaDe(cat, id) {
    var k = chave(id), l = arr(cat.chapas);
    for (var i = 0; i < l.length; i++) if (l[i].id === id || chave(l[i].nome) === k) return l[i];
    return null;
  }
  function fitaDe(cat, id) {
    if (!id) return null;
    var k = chave(id), l = arr(cat.fitas);
    for (var i = 0; i < l.length; i++) if (l[i].id === id || chave(l[i].nome) === k) return l[i];
    return null;
  }

  /* ====================================================== MÓDULOS */
  var TIPOS_MODULO = {
    aereo: "Armário aéreo", balcao: "Balcão / gabinete", gaveteiro: "Gaveteiro", roupeiro: "Roupeiro",
    prateleira: "Prateleira", painel_ripado: "Painel ripado", nicho: "Nicho"
  };
  /* o que cada tipo traz de partida (mm). Medidas usuais de cozinha e quarto
     — ponto de partida, o marceneiro muda tudo nas Propriedades. */
  var PADRAO_MODULO = {
    nome: "", ambiente: "", L: 800, H: 700, P: 350, cota: 0,
    chapa: "mdf-branco-18", chapaFrente: "mdf-branco-18", chapaFundo: "hdf-branco-3", chapaGaveta: "mdf-branco-15", chapaRipa: "mdf-carvalho-18",
    fita: "", fitaFrente: "",
    fundo: "encaixado", recuoFundo: 10, montagem: "lateral_passante", tampo: "inteiro", travessa: 100,
    rodape: "sem", alturaRodape: 100, recuoRodape: 50,
    prateleiras: 1, prateleiraMovel: true, divisorias: 0,
    portas: 2, tipoPorta: "giro", abertura: "esquerda", folga: 3,
    gavetas: 0, alturaFrenteGaveta: 180,
    puxador: "barra", entreFuros: 128, ligacao: "minifix", cabideiro: false,
    ripaLargura: 40, ripaEspaco: 15
  };
  var PRESETS = {
    aereo: { L: 800, H: 700, P: 350, cota: 1500, portas: 2, prateleiras: 1, rodape: "sem", montagem: "lateral_passante" },
    balcao: { L: 800, H: 850, P: 550, cota: 0, portas: 2, prateleiras: 1, rodape: "soculo", tampo: "travessas", montagem: "lateral_passante" },
    gaveteiro: { L: 500, H: 850, P: 550, cota: 0, portas: 0, prateleiras: 0, gavetas: 4, rodape: "soculo", tampo: "travessas" },
    roupeiro: { L: 1200, H: 2200, P: 550, cota: 0, portas: 2, prateleiras: 2, divisorias: 1, rodape: "soculo", cabideiro: true, montagem: "tampo_passante" },
    prateleira: { L: 800, H: 18, P: 250, cota: 1500, portas: 0, prateleiras: 0, fundo: "sem" },
    painel_ripado: { L: 1200, H: 2400, P: 0, cota: 0, portas: 0, prateleiras: 0, fundo: "sem", chapa: "mdf-branco-15" },
    nicho: { L: 600, H: 300, P: 300, cota: 1500, portas: 0, prateleiras: 0, montagem: "tampo_passante", chapa: "mdf-carvalho-18", fundo: "sobreposto" }
  };
  function modulo(tipo, mud) {
    var m = clone(PADRAO_MODULO);
    m.tipo = TIPOS_MODULO[tipo] ? tipo : "aereo";
    mesclar(m, PRESETS[m.tipo]);
    m.nome = TIPOS_MODULO[m.tipo];
    if (mud) Object.keys(mud).forEach(function (k) { if (mud[k] !== undefined && mud[k] !== null && mud[k] !== "") m[k] = mud[k]; });
    return m;
  }

  /* ------------------------------------------------- ajudantes da peça */
  function novaPeca(o) {
    return { id: o.id, nome: o.nome, funcao: o.funcao || o.id, comprimento: r1(o.c), largura: r1(o.l), espessura: o.chapa.espessura,
      chapa: o.chapa.id, material: o.chapa.nome, veio: !!o.chapa.veio,
      fita: { C1: o.fita && o.fita.C1 || null, C2: o.fita && o.fita.C2 || null, L1: o.fita && o.fita.L1 || null, L2: o.fita && o.fita.L2 || null },
      furos: [], furosTopo: [], usinagens: [], obs: o.obs || "", grupo: o.grupo || "caixa",
      box: o.box ? { x0: r1(o.box[0]), x1: r1(o.box[1]), y0: r1(o.box[2]), y1: r1(o.box[3]), z0: r1(o.box[4]), z1: r1(o.box[5]) } : null };
  }
  function furo(p, u, v, d, prof, face, tipo) { p.furos.push({ u: r1(u), v: r1(v), d: d, prof: prof, face: face || "A", tipo: tipo }); }
  function furoTopo(p, lado, pos, d, prof, tipo) { p.furosTopo.push({ lado: lado, pos: r1(pos), d: d, prof: prof, tipo: tipo }); }
  /* posições dos conectores ao longo de uma junta de D mm (a partir da frente) */
  function posicoesLigacao(D, cat) {
    var lg = cat.furacao.ligacao, rc = num(lg.recuo, 37);
    if (D < 3 * rc) return [D / 2];
    var p = [rc, D - rc];
    if (D > num(lg.meio, 600)) p.splice(1, 0, D / 2);
    return p;
  }
  /* JUNTA de topo: a PONTA (a peça que encosta pela borda `lado`, L1 ou L2)
     contra a FACE de outra peça (face `faceF`, na altura u = uF, com o v da
     face começando em vF0). D = largura da junta (a largura da ponta).
     minifix → corpo na ponta (face A), furo de 8 no topo da ponta, pino na
     face; + cavilha de travamento a 32 mm. cavilha → só cavilha.
     parafuso → furo passante na face (pelo lado de fora) e piloto no topo. */
  function ligar(ponta, lado, face, faceF, uF, vF0, D, cat, ferr, tipoLig) {
    var F = cat.furacao, ps = posicoesLigacao(D, cat), mf = F.minifix, cv = F.cavilha, pf = F.parafuso;
    var uP = lado === "L1" ? num(mf.dist, 34) : ponta.comprimento - num(mf.dist, 34);
    function cavilha(p) {
      furoTopo(ponta, lado, p, cv.d, cv.profTopo, "cavilha");
      furo(face, uF, vF0 + p, cv.d, cv.profFace, faceF, "cavilha");
      ferr("cavilha", 1);
    }
    ps.forEach(function (p, i) {
      if (tipoLig === "cavilha") { cavilha(p); return; }
      if (tipoLig === "parafuso") {
        furo(face, uF, vF0 + p, pf.dFace, face.espessura, faceF === "A" ? "B" : "A", "parafuso");
        furoTopo(ponta, lado, p, pf.dTopo, pf.profTopo, "parafuso");
        ferr("parafuso40", 1);
        return;
      }
      furo(ponta, uP, p, mf.dCorpo, mf.profCorpo, "A", "minifix");
      furoTopo(ponta, lado, p, mf.dTopo, mf.profTopo, "minifix");
      furo(face, uF, vF0 + p, mf.dPino, mf.profPino, faceF, "minifix_pino");
      ferr("minifix", 1);
      /* a cavilha de travamento: para dentro da junta, só se couber */
      if (ps.length > 1 && D >= 4 * num(cv.afasta, 32)) cavilha(i === ps.length - 1 ? p - cv.afasta : p + cv.afasta);
    });
  }
  function nDobradicas(h, cat) {
    var t = arr(cat.dobradicasPorAltura);
    for (var i = 0; i < t.length; i++) if (h <= t[i][0]) return t[i][1];
    return 5;
  }

  /* ======================================================= EXPLODIR */
  function explodir(mIn, catIn) {
    var cat = catIn || catAtual, m = modulo(mIn && mIn.tipo, mIn), erros = [], avisos = [], pecas = [], fer = {};
    var NOMES_FER = {};
    function ferr(id, q, nome, un) { if (!q) return; fer[id] = (fer[id] || 0) + q; if (nome) NOMES_FER[id] = { nome: nome, un: un || "un" }; }
    var ch = chapaDe(cat, m.chapa), chF = chapaDe(cat, m.chapaFrente) || ch, chFu = chapaDe(cat, m.chapaFundo), chG = chapaDe(cat, m.chapaGaveta) || ch;
    if (!ch) return { ok: false, erros: ["a chapa \"" + m.chapa + "\" não está no catálogo"], avisos: [], pecas: [], ferragens: [], modulo: m };
    var fC = fitaDe(cat, m.fita || ch.fita), fF = fitaDe(cat, m.fitaFrente || chF.fita);
    var fitaC = fC ? fC.id : null, fitaF = fF ? fF.id : null;
    [[fC, ch], [fF, chF]].forEach(function (q) { if (q[0] && q[0].largura < q[1].espessura + 2) avisos.push("a fita \"" + q[0].nome + "\" (" + q[0].largura + " mm) é estreita para a chapa de " + q[1].espessura + " mm"); });
    var L = num(m.L, 0), H = num(m.H, 0), P = num(m.P, 0), E = ch.espessura, F = cat.furacao;
    var seq = 0;
    function add(o) { var p = novaPeca(o); p.id = o.id || ("p" + (++seq)); pecas.push(p); return p; }

    /* ---------------- PRATELEIRA AVULSA ---------------- */
    if (m.tipo === "prateleira") {
      if (!(L > 50 && P > 50)) return falha("largura e profundidade da prateleira precisam passar de 50 mm");
      add({ id: "prat", nome: "Prateleira", funcao: "prateleira", c: L, l: P, chapa: ch, fita: { C1: fitaC, L1: fitaC, L2: fitaC }, box: [-L / 2, L / 2, 0, E, 0, P] });
      ferr("suporteParede", L > 900 ? 3 : 2);
      return fechar();
    }
    /* ---------------- PAINEL RIPADO ---------------- */
    if (m.tipo === "painel_ripado") {
      var chR = chapaDe(cat, m.chapaRipa) || ch, rl = num(m.ripaLargura, 40), re = num(m.ripaEspaco, 15);
      if (!(L >= rl && H > 100)) return falha("o painel precisa de pelo menos uma ripa de largura e 100 mm de altura");
      var fR = fitaDe(cat, chR.fita);
      add({ id: "base", nome: "Painel de fundo", funcao: "painel", c: H, l: L, chapa: ch, box: [-L / 2, L / 2, 0, H, 0, E], grupo: "painel" });
      var n = Math.floor((L + re) / (rl + re)), mg = (L - n * rl - (n - 1) * re) / 2;
      for (var i = 0; i < n; i++) {
        var x0 = -L / 2 + mg + i * (rl + re);
        add({ id: "ripa" + (i + 1), nome: "Ripa", funcao: "ripa", c: H, l: rl, chapa: chR, fita: { C1: fR ? fR.id : null, C2: fR ? fR.id : null, L2: fR ? fR.id : null }, box: [x0, x0 + rl, 0, H, E, E + chR.espessura], grupo: "ripa" });
      }
      ferr("parafuso30", 2 * n);
      if (n * rl + (n - 1) * re < L - 0.05) avisos.push("sobram " + r1(2 * mg) + " mm divididos nas duas pontas do painel (" + r1(mg) + " mm de cada lado)");
      return fechar();
    }

    /* ---------------- CAIXA (aéreo, balcão, gaveteiro, roupeiro, nicho) ---------------- */
    var fundo = m.fundo === "sobreposto" || m.fundo === "sem" ? m.fundo : "encaixado";
    if (fundo !== "sem" && !chFu) { avisos.push("chapa do fundo \"" + m.chapaFundo + "\" fora do catálogo — módulo sem fundo"); fundo = "sem"; }
    var eF = fundo === "sem" ? 0 : chFu.espessura, eFr = chF.espessura;
    var rod = m.rodape === "soculo" || m.rodape === "pes" ? m.rodape : "sem";
    var hR = rod === "sem" ? 0 : num(m.alturaRodape, 100);
    var y0 = hR, Hc = H - hR, zB = fundo === "sobreposto" ? eF : 0;
    var lig = m.ligacao === "cavilha" || m.ligacao === "parafuso" ? m.ligacao : "minifix";
    var travessas = m.tampo === "travessas", tp = m.montagem === "tampo_passante";
    if (L < 2 * E + 60) erros.push("largura " + L + " mm é pequena para a chapa de " + E + " mm");
    if (Hc < 2 * E + 60) erros.push("altura da caixa " + Hc + " mm é pequena (altura " + H + " − rodapé " + hR + ")");
    if (P - zB < 80) erros.push("profundidade " + P + " mm é pequena");
    if (erros.length) return falha();
    var Lint = L - 2 * E, xL = -L / 2, xR = L / 2;
    var yTopo = y0 + Hc, yIntBot = y0 + E, yIntTop = yTopo - E;
    var recuo = num(m.recuoFundo, 10), cn = F.canal, cl = eF + 2 * num(cn.folga, 0.5);
    /* z do fundo das peças internas (onde o fundo começa) */
    var zFundoFrente = fundo === "encaixado" ? recuo + eF : zB;
    var correr = m.tipoPorta === "correr" && num(m.portas, 0) > 0;
    if (correr && num(m.gavetas, 0) > 0) { avisos.push("porta de correr com gaveta não entra neste módulo: as gavetas ficaram de fora"); m.gavetas = 0; }
    /* com porta de correr o interno recua o trilho (e nunca menos que as duas folhas) */
    var zFrenteInt = P - (correr ? Math.max(num(F.correr.trilho, 50), 10 + 2 * eFr + 5 + 2) : 0);
    /* fita: a borda da frente (C1) de toda peça da caixa; e a ponta da peça PASSANTE, que aparece por fora */
    var fitaLat = { C1: fitaC, L1: fitaC, L2: fitaC };
    /* laterais */
    var latY0 = y0, latY1 = tp ? yTopo - E : yTopo;
    var latE = add({ id: "lat-e", nome: "Lateral esquerda", funcao: "lateral", c: latY1 - latY0, l: P - zB, chapa: ch, fita: tp ? { C1: fitaC, L1: rod === "sem" ? fitaC : null } : fitaLat, box: [xL, xL + E, latY0, latY1, zB, P] });
    var latD = add({ id: "lat-d", nome: "Lateral direita", funcao: "lateral", c: latY1 - latY0, l: P - zB, chapa: ch, fita: tp ? { C1: fitaC, L1: rod === "sem" ? fitaC : null } : fitaLat, box: [xR - E, xR, latY0, latY1, zB, P] });
    /* base (sempre entre as laterais) */
    var base = add({ id: "base", nome: "Base", funcao: "base", c: Lint, l: P - zB, chapa: ch, fita: { C1: fitaC }, box: [xL + E, xR - E, y0, y0 + E, zB, P] });
    ligar(base, "L1", latE, "A", y0 + E / 2 - latY0, 0, base.largura, cat, ferr, lig);
    ligar(base, "L2", latD, "A", y0 + E / 2 - latY0, 0, base.largura, cat, ferr, lig);
    /* tampo ou travessas */
    var horTopo = [];
    if (travessas) {
      var tv = Math.min(num(m.travessa, 100), (P - zFundoFrente) / 2);
      var t1 = add({ id: "trav-f", nome: "Travessa da frente", funcao: "travessa", c: Lint, l: tv, chapa: ch, fita: { C1: fitaC }, box: [xL + E, xR - E, yIntTop, yTopo, P - tv, P] });
      var t2 = add({ id: "trav-t", nome: "Travessa de trás", funcao: "travessa", c: Lint, l: tv, chapa: ch, box: [xL + E, xR - E, yIntTop, yTopo, zFundoFrente, zFundoFrente + tv] });
      [[t1, 0], [t2, P - zFundoFrente - tv]].forEach(function (q) {
        ligar(q[0], "L1", latE, "A", yIntTop + E / 2 - latY0, q[1], tv, cat, ferr, lig);
        ligar(q[0], "L2", latD, "A", yIntTop + E / 2 - latY0, q[1], tv, cat, ferr, lig);
      });
      horTopo = [t1, t2];
      if (tp) avisos.push("com travessas no lugar do tampo, a montagem é com as laterais até em cima");
    } else if (tp) {
      var tampoP = add({ id: "tampo", nome: "Tampo", funcao: "tampo", c: L, l: P - zB, chapa: ch, fita: { C1: fitaC, L1: fitaC, L2: fitaC }, box: [xL, xR, yTopo - E, yTopo, zB, P] });
      ligar(latE, "L2", tampoP, "A", E / 2, 0, latE.largura, cat, ferr, lig);
      ligar(latD, "L2", tampoP, "A", L - E / 2, 0, latD.largura, cat, ferr, lig);
      horTopo = [tampoP];
    } else {
      var tampo = add({ id: "tampo", nome: "Tampo", funcao: "tampo", c: Lint, l: P - zB, chapa: ch, fita: { C1: fitaC }, box: [xL + E, xR - E, yIntTop, yTopo, zB, P] });
      ligar(tampo, "L1", latE, "A", yIntTop + E / 2 - latY0, 0, tampo.largura, cat, ferr, lig);
      ligar(tampo, "L2", latD, "A", yIntTop + E / 2 - latY0, 0, tampo.largura, cat, ferr, lig);
      horTopo = [tampo];
    }
    /* com travessas a lateral vai até o topo mesmo com "tampo passante" escolhido */
    if (travessas && tp) { latE.comprimento = r1(yTopo - y0); latD.comprimento = latE.comprimento; latE.box.y1 = r1(yTopo); latD.box.y1 = r1(yTopo); }

    /* fundo */
    if (fundo === "encaixado") {
      var entra = num(cn.entra, 7);
      var temCanalTopo = !travessas;
      var fH = (yIntTop - yIntBot) + entra + (temCanalTopo ? entra : 0), fW = Lint + 2 * entra;
      var vC0 = P - zB - recuo - eF - num(cn.folga, 0.5);
      [latE, latD].forEach(function (lt) { lt.usinagens.push({ tipo: "canal_fundo", u0: 0, v0: r1(vC0), u1: lt.comprimento, v1: r1(vC0 + cl), larg: r1(cl), prof: num(cn.prof, 8), face: "A" }); });
      var horCanal = [base].concat(temCanalTopo ? horTopo : []);
      horCanal.forEach(function (hz) { hz.usinagens.push({ tipo: "canal_fundo", u0: 0, v0: r1(vC0), u1: hz.comprimento, v1: r1(vC0 + cl), larg: r1(cl), prof: num(cn.prof, 8), face: "A" }); });
      add({ id: "fundo", nome: "Fundo", funcao: "fundo", c: fH, l: fW, chapa: chFu, box: [-fW / 2, fW / 2, yIntBot - entra, yIntBot - entra + fH, recuo, recuo + eF], grupo: "fundo", obs: "encaixado no canal de " + r1(cl) + " × " + num(cn.prof, 8) + " mm" });
    } else if (fundo === "sobreposto") {
      add({ id: "fundo", nome: "Fundo", funcao: "fundo", c: Hc, l: L, chapa: chFu, box: [xL, xR, y0, yTopo, 0, eF], grupo: "fundo", obs: "sobreposto, pregado ou grampeado atrás" });
      ferr("grampo", Math.ceil(2 * (L + Hc) / 150));
    }

    /* zonas da frente: gavetas em cima, portas embaixo */
    var nG = Math.max(0, Math.round(num(m.gavetas, 0))), nP = Math.max(0, Math.round(num(m.portas, 0)));
    var g = num(m.folga, 3), ge = g / 2;
    var frenteY0 = y0 + ge, frenteY1 = yTopo - ge, zonaPortaY1 = frenteY1;
    var nDiv = Math.max(0, Math.round(num(m.divisorias, 0)));
    if (nG && nDiv) { avisos.push("as gavetas ocupam a largura toda: as divisórias não entram neste módulo"); nDiv = 0; }
    /* divisórias e vãos */
    var vaoW = (Lint - nDiv * E) / (nDiv + 1);
    if (vaoW < 100) { erros.push("os vãos ficaram com " + r1(vaoW) + " mm (menos de 100) — tire divisórias"); return falha(); }
    var bordas = [{ p: latE, face: "A", x: xL + E }];
    var yDivTop = travessas ? yIntTop : yIntTop;
    var dProf = zFrenteInt - zFundoFrente;
    for (var d = 0; d < nDiv; d++) {
      var xd = xL + E + (d + 1) * vaoW + d * E;
      var dv = add({ id: "div" + (d + 1), nome: "Divisória", funcao: "divisoria", c: yDivTop - yIntBot, l: dProf, chapa: ch, fita: { C1: fitaC }, box: [xd, xd + E, yIntBot, yDivTop, zFundoFrente, zFrenteInt] });
      ligar(dv, "L1", base, "A", xd + E / 2 - (xL + E), P - zFrenteInt, dv.largura, cat, ferr, lig);
      if (!travessas) ligar(dv, "L2", horTopo[0], "A", xd + E / 2 - (tp ? xL : xL + E), P - zFrenteInt, dv.largura, cat, ferr, lig);
      else ligar(dv, "L2", horTopo[0], "A", xd + E / 2 - (xL + E), P - zFrenteInt, Math.min(dv.largura, horTopo[0].largura), cat, ferr, lig);
      bordas.push({ p: dv, face: "B", x: xd, dir: true });
      bordas.push({ p: dv, face: "A", x: xd + E });
    }
    bordas.push({ p: latD, face: "A", x: xR - E });

    /* GAVETAS */
    if (nG) {
      var hfg = num(m.alturaFrenteGaveta, 180);
      var Gf = F.gaveta, cr = F.corredica, Eg = chG.espessura;
      var profUtil = P - zB - (fundo === "encaixado" ? recuo + eF - zB : 0) - num(Gf.folgaFundoCaixa, 10);
      var comps = arr(cr.comprimentos).slice().sort(function (a, b) { return b - a; }), corr = 0;
      for (var ci = 0; ci < comps.length; ci++) if (comps[ci] <= profUtil) { corr = comps[ci]; break; }
      if (!corr) { erros.push("profundidade útil " + r1(profUtil) + " mm não cabe a menor corrediça (" + comps[comps.length - 1] + " mm)"); return falha(); }
      var Wb = Lint - 2 * num(cr.folga, 12.5);
      var hf = nP ? hfg - g : (frenteY1 - frenteY0 - (nG - 1) * g) / nG;
      var yF1 = frenteY1;
      for (var k = 0; k < nG; k++) {
        var yfTop = yF1 - k * (hf + g), yfBot = yfTop - hf;
        var fr = add({ id: "gfr" + (k + 1), nome: "Frente de gaveta", funcao: "frente_gaveta", c: L - 2 * ge, l: hf, chapa: chF, fita: { C1: fitaF, C2: fitaF, L1: fitaF, L2: fitaF }, box: [xL + ge, xR - ge, yfBot, yfTop, P, P + eFr], grupo: "frente" });
        puxar(fr, "gaveta");
        /* a caixa da gaveta: base acima da base/da frente de baixo; topo 25 mm abaixo do topo da frente */
        var eFg = (chFu || chG).espessura, yb = Math.max(yfBot + num(Gf.folgaBase, 15), yIntBot + eFg + 2);
        var lim = k === 0 ? yIntTop - 10 : yfTop;
        var hb = Math.min(yfTop - num(Gf.folgaTopo, 25), lim) - yb;
        hb = Math.floor(hb);
        if (hb < num(Gf.minAltura, 60)) { erros.push("a gaveta " + (k + 1) + " ficou com " + hb + " mm de altura (mínimo " + Gf.minAltura + ")"); return falha(); }
        var zg0 = P - corr, xb0 = -Wb / 2;
        add({ id: "glat-e" + (k + 1), nome: "Lateral da gaveta", funcao: "gaveta_lateral", c: corr, l: hb, chapa: chG, fita: { C1: fitaDe(cat, chG.fita) ? chG.fita : fitaC }, box: [xb0, xb0 + Eg, yb, yb + hb, zg0, P], grupo: "gaveta" });
        add({ id: "glat-d" + (k + 1), nome: "Lateral da gaveta", funcao: "gaveta_lateral", c: corr, l: hb, chapa: chG, fita: { C1: fitaDe(cat, chG.fita) ? chG.fita : fitaC }, box: [-xb0 - Eg, -xb0, yb, yb + hb, zg0, P], grupo: "gaveta" });
        add({ id: "gfi" + (k + 1), nome: "Contrafrente da gaveta", funcao: "gaveta_contrafrente", c: Wb - 2 * Eg, l: hb, chapa: chG, fita: { C1: fitaDe(cat, chG.fita) ? chG.fita : fitaC }, box: [xb0 + Eg, -xb0 - Eg, yb, yb + hb, P - Eg, P], grupo: "gaveta" });
        add({ id: "gtr" + (k + 1), nome: "Traseira da gaveta", funcao: "gaveta_traseira", c: Wb - 2 * Eg, l: hb, chapa: chG, fita: { C1: fitaDe(cat, chG.fita) ? chG.fita : fitaC }, box: [xb0 + Eg, -xb0 - Eg, yb, yb + hb, zg0, zg0 + Eg], grupo: "gaveta" });
        add({ id: "gfu" + (k + 1), nome: "Fundo da gaveta", funcao: "gaveta_fundo", c: corr, l: Wb, chapa: chFu || chG, box: [xb0, -xb0, yb - (chFu || chG).espessura, yb, zg0, P], grupo: "gaveta", obs: "pregado por baixo da caixa da gaveta" });
        /* furos da corrediça nas laterais da caixa (lado de dentro) */
        var uc = yb + num(cr.centro, 22) - latY0;
        for (var vv = num(cr.inicio, 37); vv <= corr - 10; vv += num(cr.passo, 128)) { furo(latE, uc, vv, cr.d, cr.prof, "A", "corredica"); furo(latD, uc, vv, cr.d, cr.prof, "A", "corredica"); }
        ferr("corredica" + corr, 1, "Corrediça telescópica " + corr + " mm (par)", "par");
        ferr("parafuso40", 8); ferr("parafuso16", 12);
      }
      zonaPortaY1 = yF1 - nG * (hf + g);
      if (!nP && zonaPortaY1 < frenteY0 - g - 0.5) avisos.push("as frentes de gaveta passaram da altura");
    }

    /* PRATELEIRAS por vão (na zona das portas; com gavetas, abaixo delas) */
    var nPr = Math.max(0, Math.round(num(m.prateleiras, 0))), movel = m.prateleiraMovel !== false && m.prateleiraMovel !== "nao" && m.prateleiraMovel !== 0;
    var zonaTopoInt = nG ? Math.min(yIntTop, zonaPortaY1 - g / 2 - 2) : yIntTop;
    if (nG && nPr && zonaTopoInt - yIntBot < 150) { avisos.push("não sobra altura para prateleira abaixo das gavetas"); nPr = 0; }
    if (nPr) {
      var hLivre = zonaTopoInt - yIntBot, passo = (hLivre - nPr * E) / (nPr + 1);
      if (passo < 80) { avisos.push("prateleiras demais para a altura: ficaram " + r1(passo) + " mm entre elas"); }
      var S = F.suporte, profPrat = zFrenteInt - zFundoFrente - (movel ? 2 : 0);
      for (var vi = 0; vi <= nDiv; vi++) {
        var bE = bordas[vi * 2], bD = bordas[vi * 2 + 1], xa = bE.x, xb = bD.x;
        for (var pi = 0; pi < nPr; pi++) {
          var ys = yIntBot + (pi + 1) * passo + pi * E;
          var cP = movel ? (xb - xa) - 2 : (xb - xa);
          var pr = add({ id: "prat" + (vi + 1) + "-" + (pi + 1), nome: "Prateleira", funcao: "prateleira", c: cP, l: profPrat, chapa: ch, fita: { C1: fitaC }, box: [xa + (movel ? 1 : 0), xb - (movel ? 1 : 0), ys, ys + E, zFundoFrente + (movel ? 2 : 0), zFrenteInt], obs: movel ? "regulável (pino de 5 mm)" : "fixa" });
          var vIni = P - zFrenteInt;
          if (movel) {
            [bE, bD].forEach(function (b) {
              var uB = ys - (b.p.box.y0);
              [-num(S.passo, 32), 0, num(S.passo, 32)].forEach(function (du) {
                [num(S.recuo, 37), profPrat - num(S.recuo, 37)].forEach(function (vS) { furo(b.p, uB + du, (b.p === latE || b.p === latD ? vIni : 0) + vS, S.d, S.prof, b.face, "suporte"); });
              });
            });
            ferr("suporte", 4);
          } else {
            ligar(pr, "L1", bE.p, bE.face, ys + E / 2 - bE.p.box.y0, bE.p === latE ? vIni : 0, pr.largura, cat, ferr, lig);
            ligar(pr, "L2", bD.p, bD.face, ys + E / 2 - bD.p.box.y0, bD.p === latD ? vIni : 0, pr.largura, cat, ferr, lig);
          }
        }
      }
    }
    /* CABIDEIRO (roupeiro) */
    if (m.cabideiro === true || m.cabideiro === "sim" || m.cabideiro === 1) {
      for (var vc = 0; vc <= nDiv; vc++) { var lv = bordas[vc * 2 + 1].x - bordas[vc * 2].x - 4; ferr("cabideiro", r2(lv / 1000), "Tubo cabideiro oval", "m"); ferr("suporteCabideiro", 2); }
    }

    /* PORTAS */
    if (nP) {
      var pyBot = frenteY0, pyTop = nG ? zonaPortaY1 : frenteY1;
      if (pyTop - pyBot < 100) { erros.push("não sobra altura para as portas"); return falha(); }
      if (correr) {
        var Cr = F.correr, wPc = (Lint + num(Cr.transpasse, 30) * (nP - 1)) / nP, hPc = (yIntTop - yIntBot) - num(Cr.folgaAltura, 25);
        for (var pc = 0; pc < nP; pc++) {
          var x0c = xL + E + pc * (wPc - num(Cr.transpasse, 30)), zc = P - 10 - (pc % 2) * (eFr + 5);
          var porC = add({ id: "porta" + (pc + 1), nome: "Porta de correr", funcao: "porta_correr", c: hPc, l: wPc, chapa: chF, fita: { C1: fitaF, C2: fitaF, L1: fitaF, L2: fitaF }, box: [x0c, x0c + wPc, yIntBot + num(Cr.folgaAltura, 25) / 2, yIntBot + num(Cr.folgaAltura, 25) / 2 + hPc, zc - eFr, zc], grupo: "frente" });
          puxar(porC, "correr");
          ferr("roldanas", 1, "Kit de roldanas para porta de correr", "kit");
        }
        ferr("trilhoSup", r2(Lint / 1000), "Trilho superior de porta de correr", "m");
        ferr("trilhoInf", r2(Lint / 1000), "Trilho inferior de porta de correr", "m");
      } else {
        var wP = (L - 2 * ge - (nP - 1) * g) / nP, hP = pyTop - pyBot, D = F.dobradica, nd = nDobradicas(hP, cat);
        for (var pg = 0; pg < nP; pg++) {
          var x0p = xL + ge + pg * (wP + g);
          var lado = nP === 1 ? (m.abertura === "direita" ? "dir" : "esq") : (pg < nP / 2 ? "esq" : "dir");
          var porta = add({ id: "porta" + (pg + 1), nome: "Porta", funcao: "porta", c: hP, l: wP, chapa: chF, fita: { C1: fitaF, C2: fitaF, L1: fitaF, L2: fitaF }, box: [x0p, x0p + wP, pyBot, pyTop, P, P + eFr], grupo: "frente", obs: "dobradiças do lado " + (lado === "esq" ? "esquerdo" : "direito") });
          var ponta = num(D.ponta, 100), us = [];
          for (var hn = 0; hn < nd; hn++) us.push(nd === 1 ? hP / 2 : ponta + hn * (hP - 2 * ponta) / (nd - 1));
          var naLateral = (lado === "esq" && pg === 0) || (lado === "dir" && pg === nP - 1);
          if (!naLateral) avisos.push("a porta " + (pg + 1) + " abre no meio do módulo: as dobradiças precisam de uma divisória atrás");
          var lat = lado === "esq" ? latE : latD;
          us.forEach(function (u) {
            furo(porta, u, num(D.borda, 21.5), D.d, D.prof, "A", "dobradica");
            if (naLateral) { var uL = pyBot + u - latY0; [-D.placaPasso / 2, D.placaPasso / 2].forEach(function (du) { furo(lat, uL + du, num(D.placaRecuo, 37), D.placaD, D.placaProf, "A", "dobradica_placa"); }); }
          });
          ferr("dobradica", nd); ferr("parafuso16", 4 * nd);
          puxar(porta, "porta");
        }
      }
    }

    /* RODAPÉ */
    if (rod === "soculo") {
      var rr = Math.min(num(m.recuoRodape, 50), P - zB - 2 * E - 20), zs0 = zB, zs1 = P - rr;
      add({ id: "soc-f", nome: "Rodapé da frente", funcao: "rodape", c: L, l: hR, chapa: ch, fita: { C1: null }, box: [xL, xR, 0, hR, zs1 - E, zs1], grupo: "rodape" });
      add({ id: "soc-t", nome: "Rodapé de trás", funcao: "rodape", c: L, l: hR, chapa: ch, box: [xL, xR, 0, hR, zs0, zs0 + E], grupo: "rodape" });
      var travS = zs1 - zs0 - 2 * E;
      if (travS > 20) {
        add({ id: "soc-te", nome: "Travessa do rodapé", funcao: "rodape", c: travS, l: hR, chapa: ch, box: [xL, xL + E, 0, hR, zs0 + E, zs1 - E], grupo: "rodape" });
        add({ id: "soc-td", nome: "Travessa do rodapé", funcao: "rodape", c: travS, l: hR, chapa: ch, box: [xR - E, xR, 0, hR, zs0 + E, zs1 - E], grupo: "rodape" });
      }
      ferr("parafuso40", 8);
    } else if (rod === "pes") ferr("pe", L > 1000 ? 6 : 4);

    return fechar();

    function puxar(p, onde) {
      var tipo = m.puxador, Pz = F.puxador, ef = num(m.entreFuros, 128);
      if (tipo === "sem" || !tipo) return;
      if (tipo === "perfil") { ferr("perfil", r2((onde === "gaveta" ? p.comprimento : p.largura) / 1000), "Perfil puxador de alumínio", "m"); return; }
      var pos = [];
      if (onde === "gaveta") { pos = tipo === "botao" ? [[p.comprimento / 2, p.largura / 2]] : [[p.comprimento / 2 - ef / 2, p.largura / 2], [p.comprimento / 2 + ef / 2, p.largura / 2]]; }
      else {
        /* porta: vertical, perto da borda que abre (C2); aéreo embaixo, balcão em cima, o resto no meio */
        var c = m.tipo === "aereo" ? 50 + ef / 2 : (m.tipo === "balcao" || m.tipo === "gaveteiro" ? p.comprimento - 50 - ef / 2 : Math.min(p.comprimento / 2, 1000 - p.box.y0));
        if (c < ef / 2 + 20) c = p.comprimento / 2;
        var vb = onde === "correr" ? num(Pz.borda, 35) + 15 : p.largura - num(Pz.borda, 35);
        pos = tipo === "botao" ? [[c, vb]] : [[c - ef / 2, vb], [c + ef / 2, vb]];
      }
      pos.forEach(function (q) { furo(p, q[0], q[1], Pz.d, p.espessura, "A", "puxador"); });
      if (tipo === "botao") ferr("botao", 1, "Puxador botão", "un");
      else ferr("puxador" + ef, 1, "Puxador barra " + ef + " mm (entre furos)", "un");
      ferr("parafusoPux", pos.length);
    }
    function falha(msg) { if (msg) erros.push(msg); return { ok: false, erros: erros, avisos: avisos, pecas: [], ferragens: [], modulo: m }; }
    function fechar() {
      return { ok: !erros.length, erros: erros, avisos: avisos, pecas: pecas, ferragens: listaFerragens(fer, NOMES_FER), modulo: m,
               dimensoes: { L: L, H: H, P: P } };
    }
  }

  /* nomes das ferragens (o resto é nomeado onde nasce) */
  var FERRAGENS = {
    dobradica: { nome: "Dobradiça de caneco 35 mm com amortecedor (reta)", un: "un" },
    minifix: { nome: "Minifix 15 mm (corpo + pino)", un: "un" },
    cavilha: { nome: "Cavilha 8 × 30 mm", un: "un" },
    parafuso40: { nome: "Parafuso 4,0 × 40 mm", un: "un" },
    parafuso30: { nome: "Parafuso 4,0 × 30 mm", un: "un" },
    parafuso16: { nome: "Parafuso 3,5 × 16 mm (ferragens)", un: "un" },
    parafusoPux: { nome: "Parafuso de puxador M4", un: "un" },
    suporte: { nome: "Suporte de prateleira (pino 5 mm)", un: "un" },
    suporteParede: { nome: "Suporte de prateleira de parede (mão-francesa ou invisível)", un: "un" },
    pe: { nome: "Pé regulável", un: "un" },
    grampo: { nome: "Grampo/prego para o fundo", un: "un" },
    suporteCabideiro: { nome: "Suporte de tubo cabideiro", un: "un" }
  };
  function listaFerragens(fer, nomes) {
    return Object.keys(fer).sort().map(function (k) {
      var n = (nomes && nomes[k]) || FERRAGENS[k] || { nome: k, un: "un" };
      return { id: k, nome: n.nome, unidade: n.un, quantidade: n.un === "m" ? r2(fer[k]) : fer[k] };
    });
  }
  function somarFerragens(listas) {
    var acc = {}, nomes = {};
    arr(listas).forEach(function (l) { arr(l).forEach(function (f) { acc[f.id] = (acc[f.id] || 0) + f.quantidade; nomes[f.id] = { nome: f.nome, un: f.unidade }; }); });
    return listaFerragens(acc, nomes);
  }

  /* ====================================================== PROJETO
   * vários módulos → marcas M01, M02… e o CÓDIGO de cada peça (M01-P01),
   * o que vai na planilha, na etiqueta, no QR e no nome do DXF. */
  function projeto(modulos, cat) {
    var out = { modulos: [], pecas: [], ferragens: [], avisos: [], erros: [], serradas: [] };
    arr(modulos).forEach(function (m, i) {
      var marca = txt(m && m.marca) || ("M" + (i < 9 ? "0" : "") + (i + 1));
      var ex = m && m.serradas ? null : explodir(m, cat);
      if (m && m.serradas) {
        /* carpintaria: peças serradas já calculadas */
        var lst = arr(m.serradas).map(function (s, k) { var c = clone(s); c.codigo = marca + "-S" + (k < 9 ? "0" : "") + (k + 1); c.modulo = marca; c.ambiente = txt(m.ambiente); c.nomeModulo = txt(m.nome); return c; });
        out.serradas = out.serradas.concat(lst);
        out.modulos.push({ marca: marca, nome: txt(m.nome), ambiente: txt(m.ambiente), tipo: m.tipo, pecas: [], serradas: lst, ferragens: arr(m.ferragens) });
        return;
      }
      if (!ex.ok) { out.erros.push(marca + " (" + (m && m.nome || "") + "): " + ex.erros.join("; ")); return; }
      ex.avisos.forEach(function (a) { out.avisos.push(marca + ": " + a); });
      var pecas = ex.pecas.map(function (p, k) {
        p.codigo = marca + "-P" + (k < 9 ? "0" : "") + (k + 1);
        p.modulo = marca; p.nomeModulo = txt(m.nome) || TIPOS_MODULO[ex.modulo.tipo]; p.ambiente = txt(m.ambiente);
        return p;
      });
      out.modulos.push({ marca: marca, nome: txt(m.nome) || TIPOS_MODULO[ex.modulo.tipo], ambiente: txt(m.ambiente), tipo: ex.modulo.tipo, pecas: pecas, ferragens: ex.ferragens, dimensoes: ex.dimensoes });
      out.pecas = out.pecas.concat(pecas);
    });
    out.ferragens = somarFerragens(out.modulos.map(function (x) { return x.ferragens; }));
    return out;
  }

  /* ====================================================== PLANO DE CORTE
   * Guilhotina determinística: as peças em ordem (maior lado, área, código),
   * cada uma no espaço livre de MENOR SOBRA no lado curto (o melhor entre as
   * chapas já abertas), corte de divisão pelo lado de menor sobra. O kerf
   * separa toda peça da vizinha; o refilo tira a borda da chapa. Peça com
   * VEIO não gira: o comprimento dela acompanha o comprimento da chapa. */
  function otimizar(pecas, catIn, opts) {
    var cat = catIn || catAtual, o = opts || {}, k = num(o.kerf, num(cat.corte.kerf, 4)), rf = num(o.refilo, num(cat.corte.refilo, 10));
    var grupos = {}, ordemG = [], naoCouberam = [], avisos = [];
    arr(pecas).forEach(function (p) {
      var qtd = Math.max(1, Math.round(num(p.quantidade, 1)));
      for (var i = 0; i < qtd; i++) {
        var id = p.chapa;
        if (!grupos[id]) { grupos[id] = []; ordemG.push(id); }
        grupos[id].push({ codigo: p.codigo + (qtd > 1 ? "#" + (i + 1) : ""), nome: p.nome, c: num(p.comprimento, 0), l: num(p.largura, 0), veio: !!p.veio, ref: p });
      }
    });
    var saida = [];
    ordemG.forEach(function (gid) {
      var ch = chapaDe(cat, gid);
      if (!ch) { avisos.push("chapa \"" + gid + "\" fora do catálogo — peças sem plano"); grupos[gid].forEach(function (x) { naoCouberam.push(x.codigo); }); return; }
      var W = num(ch.comprimento, 2750), Hh = num(ch.largura, 1850), Wu = W - 2 * rf, Hu = Hh - 2 * rf;
      var lista = grupos[gid].slice().sort(function (a, b) {
        return Math.max(b.c, b.l) - Math.max(a.c, a.l) || b.c * b.l - a.c * a.l || (a.codigo < b.codigo ? -1 : a.codigo > b.codigo ? 1 : 0);
      });
      var chapas = [];
      function nova() { var s = { indice: chapas.length + 1, livres: [{ x: rf, y: rf, w: Wu, h: Hu }], pecas: [] }; chapas.push(s); return s; }
      function cabe(p, f) {
        var op = [];
        if (p.c <= f.w + 1e-6 && p.l <= f.h + 1e-6) op.push({ w: p.c, h: p.l, girada: false });
        if (!p.veio && p.l <= f.w + 1e-6 && p.c <= f.h + 1e-6 && Math.abs(p.c - p.l) > 1e-6) op.push({ w: p.l, h: p.c, girada: true });
        return op;
      }
      lista.forEach(function (p) {
        if (p.c <= 0 || p.l <= 0) { naoCouberam.push(p.codigo); return; }
        var melhor = null;
        chapas.forEach(function (s, si) {
          s.livres.forEach(function (f, fi) {
            cabe(p, f).forEach(function (q) {
              var sc = [Math.min(f.w - q.w, f.h - q.h), Math.max(f.w - q.w, f.h - q.h), si, fi, q.girada ? 1 : 0];
              if (!melhor || menor(sc, melhor.sc)) melhor = { sc: sc, s: s, fi: fi, q: q };
            });
          });
        });
        if (!melhor) {
          var s2 = nova(), f2 = s2.livres[0], op2 = cabe(p, f2);
          if (!op2.length) { chapas.pop(); naoCouberam.push(p.codigo); avisos.push("a peça " + p.codigo + " (" + p.c + " × " + p.l + (p.veio ? ", com veio" : "") + ") não cabe na chapa " + W + " × " + Hh + " com refilo de " + rf + " mm"); return; }
          melhor = { s: s2, fi: 0, q: op2[0] };
        }
        colocar(melhor.s, melhor.fi, p, melhor.q);
      });
      function colocar(s, fi, p, q) {
        var f = s.livres.splice(fi, 1)[0];
        s.pecas.push({ codigo: p.codigo, nome: p.nome, x: r1(f.x), y: r1(f.y), w: q.w, h: q.h, girada: q.girada, comprimento: p.c, largura: p.l, veio: p.veio });
        var sw = f.w - q.w - k, sh = f.h - q.h - k, novos;
        /* corte pelo lado de menor sobra (shorter leftover axis) */
        if (f.w - q.w < f.h - q.h) novos = [{ x: f.x + q.w + k, y: f.y, w: sw, h: q.h }, { x: f.x, y: f.y + q.h + k, w: f.w, h: sh }];
        else novos = [{ x: f.x + q.w + k, y: f.y, w: sw, h: f.h }, { x: f.x, y: f.y + q.h + k, w: q.w, h: sh }];
        novos.forEach(function (n) { if (n.w > 0.05 && n.h > 0.05) s.livres.push(n); });
      }
      var areaTot = 0, areaCh = W * Hh;
      chapas.forEach(function (s) {
        var a = 0; s.pecas.forEach(function (pp) { a += pp.w * pp.h; });
        s.areaPecas = a; s.aproveitamento = r1(100 * a / areaCh); areaTot += a;
        s.largura = W; s.altura = Hh;
        s.sobras = s.livres.filter(function (f) { return Math.min(f.w, f.h) >= num(cat.corte.retalhoMin, 100); }).map(function (f) { return { x: r1(f.x), y: r1(f.y), w: r1(f.w), h: r1(f.h) }; });
        delete s.livres;
      });
      saida.push({ chapa: ch.id, material: ch.nome, espessura: ch.espessura, comprimento: W, largura: Hh, veio: !!ch.veio, chapas: chapas, nChapas: chapas.length,
                   pecas: grupos[gid].length, areaPecasM2: r2(areaTot / 1e6), aproveitamento: chapas.length ? r1(100 * areaTot / (areaCh * chapas.length)) : 0 });
    });
    var fitas = metrosFita(pecas, cat);
    return { ok: !naoCouberam.length, grupos: saida, naoCouberam: naoCouberam, avisos: avisos, fitas: fitas, kerf: k, refilo: rf,
             totalChapas: saida.reduce(function (s, g) { return s + g.nChapas; }, 0) };
  }
  function menor(a, b) { for (var i = 0; i < a.length; i++) { if (a[i] < b[i] - 1e-9) return true; if (a[i] > b[i] + 1e-9) return false; } return false; }
  function metrosFita(pecas, catIn) {
    var cat = catIn || catAtual, acc = {}, sobra = num(cat.corte.sobraFita, 30);
    arr(pecas).forEach(function (p) {
      var q = Math.max(1, Math.round(num(p.quantidade, 1)));
      ["C1", "C2", "L1", "L2"].forEach(function (s) {
        var f = p.fita && p.fita[s]; if (!f) return;
        var l = s.charAt(0) === "C" ? p.comprimento : p.largura;
        var a = acc[f] || (acc[f] = { fita: f, nome: (fitaDe(cat, f) || { nome: f }).nome, mm: 0, arestas: 0 });
        a.mm += l * q; a.arestas += q;
      });
    });
    return Object.keys(acc).sort().map(function (k) { var a = acc[k]; return { fita: a.fita, nome: a.nome, arestas: a.arestas, metros: r2(a.mm / 1000), metrosComSobra: r2((a.mm + a.arestas * sobra) / 1000) }; });
  }

  /* ====================================================== CARPINTARIA
   * Peças SERRADAS (seção b × h em mm, comprimento em mm). As seções de
   * partida são as da biblioteca de madeira do OrçaPRO (js/familiasra.js:
   * seções reais de uma estrutura de madeira executada pela RA). ⚠ NÃO é
   * dimensionamento: a seção e o vão se conferem pela NBR 7190 no projeto
   * estrutural — está dito na tela e no aviso. */
  var ESPECIES = {
    tatajuba: { nome: "Tatajuba (Bagassa guianensis)", massa: 1000, fonte: "NBR 6120:2019 Tab. 1 — 10 kN/m³" },
    pinus: { nome: "Pinus elliottii tratado em autoclave (CCA)", massa: 600, fonte: "NBR 6120:2019 Tab. 1 — coníferas C30, 6 kN/m³ (maior da classe)" }
  };
  var AVISO_NBR = "seções e vãos são valor de partida — conferir pela NBR 7190 no projeto estrutural";
  /* membro reto: eixo de p a q, altura da seção h (no plano), cortes nas pontas
     por retas (ponto + direção). Devolve o contorno (4 pontos), o comprimento
     (ponta a ponta, o maior lado) e o ângulo de cada corte a partir do ESQUADRO
     (0° = corte reto; é o número da serra de meia-esquadria). */
  function membro(p, q, h, cA, cB) {
    var dx = q[0] - p[0], dy = q[1] - p[1], Lm = Math.sqrt(dx * dx + dy * dy), ux = dx / Lm, uy = dy / Lm, nx = -uy, ny = ux;
    function inter(o, d, c) {   /* reta o + t·d com a reta do corte (c.p + s·c.d) */
      var den = d[0] * c.d[1] - d[1] * c.d[0]; if (Math.abs(den) < 1e-12) return null;
      var t = ((c.p[0] - o[0]) * c.d[1] - (c.p[1] - o[1]) * c.d[0]) / den; return [o[0] + t * d[0], o[1] + t * d[1]];
    }
    var lo = [p[0] - nx * h / 2, p[1] - ny * h / 2], hi = [p[0] + nx * h / 2, p[1] + ny * h / 2], d = [ux, uy];
    var a1 = inter(lo, d, cA), a2 = inter(hi, d, cA), b1 = inter(lo, d, cB), b2 = inter(hi, d, cB);
    var pts = [a1, b1, b2, a2];
    function len(x, y) { return Math.sqrt((x[0] - y[0]) * (x[0] - y[0]) + (x[1] - y[1]) * (x[1] - y[1])); }
    function ang(c) { var cl = Math.sqrt(c.d[0] * c.d[0] + c.d[1] * c.d[1]), cs = Math.abs((c.d[0] * ux + c.d[1] * uy) / cl); return r1(Math.asin(Math.min(1, cs)) * 180 / Math.PI); }
    var comp = Math.max(len(a1, b1), len(a2, b2));
    var area = Math.abs((pts[0][0] * pts[1][1] - pts[1][0] * pts[0][1]) + (pts[1][0] * pts[2][1] - pts[2][0] * pts[1][1]) + (pts[2][0] * pts[3][1] - pts[3][0] * pts[2][1]) + (pts[3][0] * pts[0][1] - pts[0][0] * pts[3][1])) / 2;
    return { pts: pts.map(function (x) { return [r1(x[0]), r1(x[1])]; }), comprimento: Math.ceil(comp), corte1: ang(cA), corte2: ang(cB), area: area };
  }
  function descCorte(g) { return g < 0.05 ? "reto (esquadro)" : (Math.abs(g - 45) < 0.05 ? "45° (meia-esquadria)" : r1(g).toString().replace(".", ",") + "° do esquadro"); }
  function serrada(o) {
    var esp = ESPECIES[o.especie] || ESPECIES.tatajuba, vol = o.area != null ? o.area * o.b / 1e9 : o.b * o.h * o.comprimento / 1e9;
    return { nome: o.nome, funcao: o.funcao, b: o.b, h: o.h, comprimento: Math.ceil(o.comprimento), quantidade: o.quantidade || 1, especie: esp.nome, especieId: o.especie || "tatajuba",
      corte1: { graus: o.corte1 || 0, descricao: descCorte(o.corte1 || 0) }, corte2: { graus: o.corte2 || 0, descricao: descCorte(o.corte2 || 0) },
      volume: Math.round(vol * 1e6) / 1e6, massa: Math.round(vol * esp.massa * 10) / 10, obs: o.obs || "",
      box: o.box ? { x0: r1(o.box[0]), x1: r1(o.box[1]), y0: r1(o.box[2]), y1: r1(o.box[3]), z0: r1(o.box[4]), z1: r1(o.box[5]) } : null, poly: o.poly || null, ifc: o.ifc || "MEMBER" };
  }
  var PADRAO_CARP = {
    pergolado: { L: 3000, P: 3000, H: 2600, pilarB: 160, pilarH: 160, vigaB: 70, vigaH: 200, caibroB: 50, caibroH: 160, espacamento: 500, balanco: 300, chanfro: 0, especie: "tatajuba" },
    deck: { L: 3000, P: 2000, barroteB: 50, barroteH: 100, espacamento: 400, tabuaB: 100, tabuaH: 20, junta: 5, barra: 4000, especie: "pinus" },
    tesoura: { vao: 6000, inclinacao: 30, b: 70, linhaH: 200, pernaH: 200, penduralH: 200, escoraH: 160, especie: "tatajuba" }
  };
  function carpintaria(tipo, oIn) {
    var o = clone(PADRAO_CARP[tipo] || {}); mesclar(o, oIn || {});
    var pecas = [], avisos = [AVISO_NBR], erros = [];
    if (tipo === "pergolado") {
      var L = num(o.L, 0), P = num(o.P, 0), H = num(o.H, 0), bl = num(o.balanco, 0);
      if (!(L > 2 * o.pilarB && P > 2 * o.pilarH && H > 500)) return { ok: false, erros: ["medidas do pergolado inválidas"], avisos: [], pecas: [] };
      var cortV = num(o.chanfro, 0);
      [[-1, 0], [1, 0], [-1, 1], [1, 1]].forEach(function (c, i) {
        var x = c[0] * (L / 2 - o.pilarB / 2), z = c[1] ? P - o.pilarH / 2 : o.pilarH / 2;
        pecas.push(serrada({ nome: "Pilar", funcao: "pilar", b: o.pilarB, h: o.pilarH, comprimento: H, especie: o.especie, ifc: "COLUMN", box: [x - o.pilarB / 2, x + o.pilarB / 2, 0, H, z - o.pilarH / 2, z + o.pilarH / 2] }));
      });
      [o.pilarH / 2, P - o.pilarH / 2].forEach(function (z) {
        pecas.push(serrada({ nome: "Viga", funcao: "viga", b: o.vigaB, h: o.vigaH, comprimento: L + 2 * bl, especie: o.especie, corte1: cortV, corte2: cortV, ifc: "BEAM", box: [-L / 2 - bl, L / 2 + bl, H, H + o.vigaH, z - o.vigaB / 2, z + o.vigaB / 2] }));
      });
      var Lc = L + 2 * bl - o.caibroB, n = Math.max(2, Math.floor(Lc / num(o.espacamento, 500)) + 1), passo = Lc / (n - 1);
      for (var i = 0; i < n; i++) {
        var xc = -L / 2 - bl + o.caibroB / 2 + i * passo;
        pecas.push(serrada({ nome: "Caibro", funcao: "caibro", b: o.caibroB, h: o.caibroH, comprimento: P + 2 * bl, especie: o.especie, corte1: cortV, corte2: cortV, ifc: "RAFTER", box: [xc - o.caibroB / 2, xc + o.caibroB / 2, H + o.vigaH, H + o.vigaH + o.caibroH, -bl, P + bl] }));
      }
      return fim([{ id: "parafusoPilar", nome: "Parafuso passante de ligação viga-pilar (com porca e arruelas)", unidade: "un", quantidade: 8 },
                  { id: "parafusoCaibro", nome: "Parafuso de ligação caibro-viga", unidade: "un", quantidade: 2 * n }]);
    }
    if (tipo === "deck") {
      var Ld = num(o.L, 0), Pd = num(o.P, 0), barra = num(o.barra, 4000);
      if (!(Ld > 300 && Pd > 300)) return { ok: false, erros: ["medidas do deck inválidas"], avisos: [], pecas: [] };
      var nb = Math.max(2, Math.ceil((Ld - o.barroteB) / num(o.espacamento, 400)) + 1), pb = (Ld - o.barroteB) / (nb - 1);
      for (var bI = 0; bI < nb; bI++) {
        var xb = -Ld / 2 + o.barroteB / 2 + bI * pb;
        pecas.push(serrada({ nome: "Barrote", funcao: "barrote", b: o.barroteB, h: o.barroteH, comprimento: Pd, especie: o.especie, ifc: "BEAM", box: [xb - o.barroteB / 2, xb + o.barroteB / 2, 0, o.barroteH, 0, Pd] }));
      }
      var nt = Math.ceil((Pd + o.junta) / (o.tabuaB + o.junta));
      for (var t = 0; t < nt; t++) {
        var z0 = t * (o.tabuaB + o.junta), z1 = Math.min(Pd, z0 + o.tabuaB), lt = z1 - z0;
        if (lt < 20) continue;
        /* tábua maior que a barra: emenda sobre o barrote (o trecho até o barrote mais perto do comprimento da barra) */
        var ini = -Ld / 2, fimX = Ld / 2;
        while (ini < fimX - 1) {
          var ate = fimX;
          if (ate - ini > barra) { var lim = ini + barra, melhorX = null; for (var bj = 0; bj < nb; bj++) { var xj = -Ld / 2 + o.barroteB / 2 + bj * pb; if (xj > ini + 1 && xj <= lim) melhorX = xj; } ate = melhorX != null ? melhorX : lim; if (melhorX == null) avisos.push("a tábua passa da barra de " + barra + " mm sem barrote para emendar — aumente a barra ou diminua o espaçamento"); }
          pecas.push(serrada({ nome: "Tábua do deck", funcao: "tabua", b: lt, h: o.tabuaH, comprimento: ate - ini, especie: o.especie, ifc: "PLATE", box: [ini, ate, o.barroteH, o.barroteH + o.tabuaH, z0, z1], obs: ate < fimX ? "emenda sobre o barrote" : "" }));
          ini = ate;
        }
      }
      return fim([{ id: "parafusoDeck", nome: "Parafuso inox para deck (2 por tábua por barrote)", unidade: "un", quantidade: 2 * nb * nt }]);
    }
    if (tipo === "tesoura") {
      var V = num(o.vao, 0), th = Math.atan(num(o.inclinacao, 30) / 100), tg = Math.tan(th), b = num(o.b, 70);
      if (!(V > 1000 && th > 0.05)) return { ok: false, erros: ["vão ou inclinação da tesoura inválidos"], avisos: [], pecas: [] };
      var hL = o.linhaH, hPn = o.pernaH, bP = o.penduralH, hE = o.escoraH, cs = Math.cos(th), sn = Math.sin(th);
      /* nós pela FACE de cima da linha (y = hL): a face de baixo de cada perna
         nasce em (±V/2, hL); o topo da perna corta em prumo contra o pendural */
      var yTopoInf = hL + (V / 2 - bP / 2) * tg, yApex = yTopoInf + hPn / cs;
      var Lt = V + 2 * (hPn / sn + 50);   /* a linha passa 5 cm da ponta da perna */
      var VERT = [0, 1], HOR = [1, 0];
      var linha = membro([-Lt / 2, hL / 2], [Lt / 2, hL / 2], hL, { p: [-Lt / 2, 0], d: VERT }, { p: [Lt / 2, 0], d: VERT });
      pecas.push(serrada({ nome: "Linha (banzo inferior)", funcao: "linha", b: b, h: hL, comprimento: linha.comprimento, especie: o.especie, corte1: linha.corte1, corte2: linha.corte2, area: linha.area, ifc: "CHORD", poly: { pts: linha.pts, z0: -b / 2, z1: b / 2 } }));
      [-1, 1].forEach(function (s) {
        var pA = [s * (V / 2 + (hPn / 2) * sn), hL + (hPn / 2) * cs], dir = [-s * cs, sn], pB = [pA[0] + dir[0] * V / 2, pA[1] + dir[1] * V / 2];
        var pr = membro(pA, pB, hPn, { p: [0, hL], d: HOR }, { p: [s * bP / 2, 0], d: VERT });
        pecas.push(serrada({ nome: "Perna " + (s < 0 ? "esquerda" : "direita"), funcao: "perna", b: b, h: hPn, comprimento: pr.comprimento, especie: o.especie, corte1: pr.corte1, corte2: pr.corte2, area: pr.area, ifc: "RAFTER", poly: { pts: pr.pts, z0: -b / 2, z1: b / 2 }, obs: "pé: corte de nível sobre a linha; topo: corte de prumo contra o pendural" }));
      });
      var pend = membro([0, hL], [0, yApex], bP, { p: [0, hL], d: HOR }, { p: [0, yApex], d: HOR });
      pecas.push(serrada({ nome: "Pendural", funcao: "pendural", b: b, h: bP, comprimento: pend.comprimento, especie: o.especie, corte1: pend.corte1, corte2: pend.corte2, area: pend.area, ifc: "POST", poly: { pts: pend.pts, z0: -b / 2, z1: b / 2 } }));
      [-1, 1].forEach(function (s) {
        /* escora: do pé do pendural até a face de baixo da perna, a um quarto do vão */
        var q1 = [s * bP / 2, hL + hE], q2 = [s * V / 4, hL + (V / 4) * tg];
        var es = membro(q1, q2, hE, { p: [s * bP / 2, 0], d: VERT }, { p: [s * V / 2, hL], d: [1, -s * tg] });
        pecas.push(serrada({ nome: "Escora " + (s < 0 ? "esquerda" : "direita"), funcao: "escora", b: b, h: hE, comprimento: es.comprimento, especie: o.especie, corte1: es.corte1, corte2: es.corte2, area: es.area, ifc: "STRUT", poly: { pts: es.pts, z0: -b / 2, z1: b / 2 }, obs: "pé contra o pendural; cabeça contra a face de baixo da perna" }));
      });
      return fim([{ id: "chapaTesoura", nome: "Chapa/parafuso de ligação dos nós (conforme o projeto)", unidade: "nó", quantidade: 5 }], { yApex: yApex, linha: Lt });
    }
    return { ok: false, erros: ["tipo de carpintaria desconhecido: " + tipo], avisos: [], pecas: [] };
    function fim(fer, extra) { var r = { ok: !erros.length, erros: erros, avisos: avisos, pecas: pecas, ferragens: fer, parametros: o, tipo: tipo }; if (extra) r.extra = extra; return r; }
  }
  /* agrupa peças serradas iguais (nome, seção, comprimento, cortes, espécie) */
  function agruparSerradas(lista) {
    var acc = {}, ordem = [];
    arr(lista).forEach(function (s) {
      var k = [s.nome.replace(/ (esquerda|direita)$/, ""), s.b, s.h, s.comprimento, s.corte1.graus, s.corte2.graus, s.especieId, s.modulo || ""].join("|");
      if (!acc[k]) { acc[k] = clone(s); acc[k].nome = s.nome.replace(/ (esquerda|direita)$/, ""); acc[k].quantidade = 0; acc[k].codigos = []; acc[k].volume = 0; acc[k].massa = 0; ordem.push(k); }
      acc[k].quantidade += s.quantidade || 1; if (s.codigo) acc[k].codigos.push(s.codigo);
      acc[k].volume = Math.round((acc[k].volume + s.volume) * 1e6) / 1e6; acc[k].massa = Math.round((acc[k].massa + s.massa) * 10) / 10;
    });
    return ordem.map(function (k) { var a = acc[k]; delete a.box; delete a.poly; return a; });
  }
  /* corte das BARRAS comerciais (1D): primeiro que couber, das maiores para
     as menores, por seção e espécie; kerf entre os cortes */
  function otimizarBarras(serradas, opts) {
    var o = opts || {}, barra = num(o.barra, num(catAtual.corte.barra, 4000)), k = num(o.kerf, num(catAtual.corte.kerf, 4));
    var grupos = {}, ordem = [], fora = [];
    arr(serradas).forEach(function (s) {
      var key = s.b + "×" + s.h + "|" + s.especieId;
      if (!grupos[key]) { grupos[key] = { secao: s.b + " × " + s.h + " mm", especie: s.especie, pecas: [] }; ordem.push(key); }
      for (var i = 0; i < (s.quantidade || 1); i++) grupos[key].pecas.push({ codigo: s.codigo || s.nome, nome: s.nome, c: s.comprimento });
    });
    return { barra: barra, kerf: k, grupos: ordem.map(function (key) {
      var g = grupos[key], bars = [];
      g.pecas.sort(function (a, b) { return b.c - a.c || (a.codigo < b.codigo ? -1 : 1); }).forEach(function (p) {
        if (p.c > barra) { fora.push(p.codigo); return; }
        for (var i = 0; i < bars.length; i++) { var usado = bars[i].usado + (bars[i].cortes.length ? k : 0); if (usado + p.c <= barra + 1e-6) { bars[i].cortes.push(p); bars[i].usado = usado + p.c; return; } }
        bars.push({ cortes: [p], usado: p.c });
      });
      bars.forEach(function (b) { b.sobra = r1(barra - b.usado); b.aproveitamento = r1(100 * b.cortes.reduce(function (s, c) { return s + c.c; }, 0) / barra); });
      return { secao: g.secao, especie: g.especie, barras: bars, nBarras: bars.length };
    }), maioresQueABarra: fora };
  }

  /* ====================================================== FAMÍLIAS
   * A família de js/familia.js com `geometria: "marcenaria"`: parâmetros e
   * tipos como os de qualquer família; os sólidos saem de `completar`. */
  function P(nome, tipoDado, valor, grupo, descricao, escopo) { var p = { nome: nome, tipoDado: tipoDado, escopo: escopo || "instancia", valor: valor, grupo: grupo }; if (descricao) p.descricao = descricao; return p; }
  var LISTA_SN = "sim/não";
  function paramsModulo(tipo) {
    var d = modulo(tipo), ps = [
      P("Modulo", "texto", tipo, "Marcenaria", "Tipo do módulo (" + Object.keys(TIPOS_MODULO).join(", ") + ")", "tipo"),
      P("Largura", "comprimento", d.L / 1000, "Dimensões", "Largura total (m)"),
      P("Altura", "comprimento", d.H / 1000, "Dimensões", tipo === "prateleira" ? "Espessura (a da chapa vale)" : "Altura total, com o rodapé (m)"),
      P("Profundidade", "comprimento", d.P / 1000, "Dimensões", "Profundidade da caixa, sem a porta (m)"),
      P("Cota_base", "comprimento", d.cota / 1000, "Restrições", "Altura da base do módulo em relação ao nível (aéreo: valor de partida 1,50 m)"),
      P("Ambiente", "texto", "", "Dados de identidade", "Vai na planilha e na etiqueta"),
      P("Chapa_caixa", "texto", d.chapa, "Chapas e fitas", "Identificador ou nome da chapa no catálogo (Chapas e fitas)"),
      P("Chapa_frente", "texto", d.chapaFrente, "Chapas e fitas", "Chapa das portas e frentes"),
      P("Chapa_fundo", "texto", d.chapaFundo, "Chapas e fitas"),
      P("Chapa_gaveta", "texto", d.chapaGaveta, "Chapas e fitas", "Chapa da caixa das gavetas"),
      P("Fita_caixa", "texto", "", "Chapas e fitas", "Vazio = a fita padrão da chapa"),
      P("Fita_frente", "texto", "", "Chapas e fitas", "Vazio = a fita padrão da chapa da frente")
    ];
    if (tipo === "painel_ripado") ps.push(P("Chapa_ripa", "texto", d.chapaRipa, "Chapas e fitas"), P("Ripa_largura_mm", "numero", d.ripaLargura, "Ripas", "valor de partida, editável"), P("Ripa_espaco_mm", "numero", d.ripaEspaco, "Ripas", "valor de partida, editável"));
    if (tipo !== "prateleira" && tipo !== "painel_ripado") ps.push(
      P("Fundo", "texto", d.fundo, "Construção", "encaixado, sobreposto ou sem"),
      P("Recuo_fundo_mm", "numero", d.recuoFundo, "Construção", "Do fundo até a borda de trás (valor de partida 10 mm)"),
      P("Montagem", "texto", d.montagem, "Construção", "lateral_passante ou tampo_passante"),
      P("Tampo", "texto", d.tampo, "Construção", "inteiro ou travessas (2 travessas de 100 mm, para bancada por cima)"),
      P("Rodape", "texto", d.rodape, "Construção", "sem, soculo ou pes"),
      P("Altura_rodape_mm", "numero", d.alturaRodape, "Construção", "valor de partida 100 mm"),
      P("Recuo_rodape_mm", "numero", d.recuoRodape, "Construção", "valor de partida 50 mm"),
      P("Ligacao", "texto", d.ligacao, "Construção", "minifix, cavilha ou parafuso"),
      P("Prateleiras", "inteiro", d.prateleiras, "Interno", "Por vão"),
      P("Prateleira_movel", "simnao", d.prateleiraMovel, "Interno", "Regulável no pino (" + LISTA_SN + ")"),
      P("Divisorias", "inteiro", d.divisorias, "Interno"),
      P("Cabideiro", "simnao", d.cabideiro, "Interno"),
      P("Portas", "inteiro", d.portas, "Frentes"),
      P("Tipo_porta", "texto", d.tipoPorta, "Frentes", "giro ou correr"),
      P("Abertura", "texto", d.abertura, "Frentes", "Uma porta: dobradiças à esquerda ou à direita"),
      P("Gavetas", "inteiro", d.gavetas, "Frentes"),
      P("Altura_frente_gaveta_mm", "numero", d.alturaFrenteGaveta, "Frentes", "Com portas embaixo (valor de partida 180 mm)"),
      P("Folga_mm", "numero", d.folga, "Frentes", "Entre portas/frentes (valor de partida 3 mm)"),
      P("Puxador", "texto", d.puxador, "Frentes", "barra, botao, perfil ou sem"),
      P("Puxador_entre_furos_mm", "numero", d.entreFuros, "Frentes", "valor de partida 128 mm")
    );
    return ps;
  }
  /* valores avaliados da família (m) → módulo (mm) */
  function moduloDeValores(v) {
    function g(k, d) { return v && v[k] !== undefined && v[k] !== "" ? v[k] : d; }
    function mm(k, d) { return Math.round(num(g(k, d / 1000), d / 1000) * 10000) / 10; }
    var tipo = txt(g("Modulo", "aereo")); if (!TIPOS_MODULO[tipo]) tipo = "aereo";
    var d = modulo(tipo);
    var m = modulo(tipo, {
      L: mm("Largura", d.L), H: mm("Altura", d.H), P: mm("Profundidade", d.P), cota: mm("Cota_base", d.cota), ambiente: txt(g("Ambiente", "")),
      chapa: txt(g("Chapa_caixa", d.chapa)), chapaFrente: txt(g("Chapa_frente", d.chapaFrente)), chapaFundo: txt(g("Chapa_fundo", d.chapaFundo)), chapaGaveta: txt(g("Chapa_gaveta", d.chapaGaveta)),
      chapaRipa: txt(g("Chapa_ripa", d.chapaRipa)), fita: txt(g("Fita_caixa", "")), fitaFrente: txt(g("Fita_frente", "")),
      fundo: txt(g("Fundo", d.fundo)), recuoFundo: num(g("Recuo_fundo_mm", d.recuoFundo), d.recuoFundo), montagem: txt(g("Montagem", d.montagem)), tampo: txt(g("Tampo", d.tampo)),
      rodape: txt(g("Rodape", d.rodape)), alturaRodape: num(g("Altura_rodape_mm", d.alturaRodape), 100), recuoRodape: num(g("Recuo_rodape_mm", d.recuoRodape), 50), ligacao: txt(g("Ligacao", d.ligacao)),
      prateleiras: num(g("Prateleiras", d.prateleiras), 0), prateleiraMovel: g("Prateleira_movel", d.prateleiraMovel), divisorias: num(g("Divisorias", d.divisorias), 0), cabideiro: g("Cabideiro", d.cabideiro),
      portas: num(g("Portas", d.portas), 0), tipoPorta: txt(g("Tipo_porta", d.tipoPorta)), abertura: txt(g("Abertura", d.abertura)), gavetas: num(g("Gavetas", d.gavetas), 0),
      alturaFrenteGaveta: num(g("Altura_frente_gaveta_mm", d.alturaFrenteGaveta), 180), folga: num(g("Folga_mm", d.folga), 3),
      puxador: txt(g("Puxador", d.puxador)), entreFuros: num(g("Puxador_entre_furos_mm", d.entreFuros), 128),
      ripaLargura: num(g("Ripa_largura_mm", d.ripaLargura), 40), ripaEspaco: num(g("Ripa_espaco_mm", d.ripaEspaco), 15)
    });
    /* número 0 do usuário vale (o modulo() ignora vazio, não zero) */
    return m;
  }
  /* o inverso: módulo (mm) → parâmetros de instância da família (m) — o que a tela grava na op */
  function instDeModulo(m) {
    var o = { Largura: num(m.L, 0) / 1000, Altura: num(m.H, 0) / 1000, Profundidade: num(m.P, 0) / 1000, Cota_base: num(m.cota, 0) / 1000, Ambiente: txt(m.ambiente),
      Chapa_caixa: txt(m.chapa), Chapa_frente: txt(m.chapaFrente), Chapa_fundo: txt(m.chapaFundo), Chapa_gaveta: txt(m.chapaGaveta), Fita_caixa: txt(m.fita), Fita_frente: txt(m.fitaFrente) };
    if (m.tipo === "painel_ripado") { o.Chapa_ripa = txt(m.chapaRipa); o.Ripa_largura_mm = num(m.ripaLargura, 40); o.Ripa_espaco_mm = num(m.ripaEspaco, 15); }
    if (m.tipo !== "prateleira" && m.tipo !== "painel_ripado") {
      o.Fundo = txt(m.fundo); o.Recuo_fundo_mm = num(m.recuoFundo, 10); o.Montagem = txt(m.montagem); o.Tampo = txt(m.tampo); o.Rodape = txt(m.rodape);
      o.Altura_rodape_mm = num(m.alturaRodape, 100); o.Recuo_rodape_mm = num(m.recuoRodape, 50); o.Ligacao = txt(m.ligacao);
      o.Prateleiras = Math.round(num(m.prateleiras, 0)); o.Prateleira_movel = !(m.prateleiraMovel === false || m.prateleiraMovel === "nao"); o.Divisorias = Math.round(num(m.divisorias, 0));
      o.Cabideiro = m.cabideiro === true || m.cabideiro === "sim"; o.Portas = Math.round(num(m.portas, 0)); o.Tipo_porta = txt(m.tipoPorta); o.Abertura = txt(m.abertura);
      o.Gavetas = Math.round(num(m.gavetas, 0)); o.Altura_frente_gaveta_mm = num(m.alturaFrenteGaveta, 180); o.Folga_mm = num(m.folga, 3); o.Puxador = txt(m.puxador); o.Puxador_entre_furos_mm = num(m.entreFuros, 128);
    }
    return o;
  }
  function familiaModulo(tipo, tipos) {
    return { id: "ra-marc-" + tipo.replace("_", "-"), previa: "modelador", disciplina: "marcenaria", nome: TIPOS_MODULO[tipo] + " (marcenaria)", categoria: "mobiliario", hospedagem: "livre",
      geometria: "marcenaria",
      descricao: "Módulo em chapa que se EXPLODE em peças para o corte: chapa, fita de borda por lado, furação (dobradiça, minifix, cavilha, corrediça) e ferragens. Medidas e folgas são valores de partida, editáveis nas Propriedades.",
      parametros: paramsModulo(tipo),
      tipos: tipos,
      quantitativo: { unidade: "un", quantidade: "1", codigo: "", fonte: "", descricao: TIPOS_MODULO[tipo] + " de marcenaria" } };
  }
  function T(id, nome, v) { return { id: id, nome: nome, valores: v || {} }; }
  var FAMILIAS = [
    familiaModulo("aereo", [T("a60", "60 × 70 × 35 cm, 1 porta", { Largura: 0.6, Portas: 1 }), T("a80", "80 × 70 × 35 cm, 2 portas", {}), T("a120", "120 × 70 × 35 cm, 2 portas", { Largura: 1.2 })]),
    familiaModulo("balcao", [T("b40", "40 × 85 × 55 cm, 1 porta", { Largura: 0.4, Portas: 1 }), T("b80", "80 × 85 × 55 cm, 2 portas", {}), T("b80g", "80 × 85 × 55 cm, 1 gaveta + 2 portas", { Gavetas: 1, Prateleiras: 0 })]),
    familiaModulo("gaveteiro", [T("g3", "50 × 85 × 55 cm, 3 gavetas", { Gavetas: 3 }), T("g4", "50 × 85 × 55 cm, 4 gavetas", {})]),
    familiaModulo("roupeiro", [T("r120", "120 × 220 × 55 cm, 2 portas de giro", {}), T("r180c", "180 × 220 × 60 cm, 2 portas de correr", { Largura: 1.8, Profundidade: 0.6, Tipo_porta: "correr" })]),
    familiaModulo("prateleira", [T("p80", "80 × 25 cm", {}), T("p120", "120 × 30 cm", { Largura: 1.2, Profundidade: 0.3 })]),
    familiaModulo("painel_ripado", [T("pr120", "120 × 240 cm, ripa 4 cm", {})]),
    familiaModulo("nicho", [T("n60", "60 × 30 × 30 cm", {}), T("n30", "30 × 30 × 30 cm", { Largura: 0.3 })])
  ];
  function paramsCarp(tipo) {
    var o = PADRAO_CARP[tipo], ps = [P("Estrutura", "texto", tipo, "Carpintaria", "pergolado, deck ou tesoura", "tipo"), P("Ambiente", "texto", "", "Dados de identidade"),
      P("Especie", "texto", o.especie, "Material", "tatajuba ou pinus")];
    Object.keys(o).forEach(function (k) { if (k === "especie") return; ps.push(P("C_" + k, "numero", o[k], "Medidas (mm)", "valor de partida, editável — " + AVISO_NBR)); });
    return ps;
  }
  /* rótulos dos parâmetros da carpintaria (tela) */
  var PARAMS_CARP_ROT = { L: "Largura (mm)", P: "Profundidade (mm)", H: "Altura dos pilares (mm)", pilarB: "Pilar: base b (mm)", pilarH: "Pilar: altura h (mm)", vigaB: "Viga: base b (mm)", vigaH: "Viga: altura h (mm)",
    caibroB: "Caibro: base b (mm)", caibroH: "Caibro: altura h (mm)", espacamento: "Espaçamento (mm)", balanco: "Balanço das pontas (mm)", chanfro: "Chanfro das pontas (graus; 0 = reto)",
    barroteB: "Barrote: base b (mm)", barroteH: "Barrote: altura h (mm)", tabuaB: "Tábua: largura (mm)", tabuaH: "Tábua: espessura (mm)", junta: "Junta entre tábuas (mm)", barra: "Barra comercial (mm)",
    vao: "Vão entre apoios (mm)", inclinacao: "Inclinação do telhado (%)", b: "Espessura das peças b (mm)", linhaH: "Linha: altura (mm)", pernaH: "Perna: altura (mm)", penduralH: "Pendural: largura (mm)", escoraH: "Escora: altura (mm)" };
  var NOMES_CARP = { pergolado: "Pergolado de madeira", deck: "Deck de madeira", tesoura: "Tesoura simples de madeira" };
  ["pergolado", "deck", "tesoura"].forEach(function (t) {
    FAMILIAS.push({ id: "ra-carp-" + t, previa: "modelador", disciplina: "marcenaria", nome: NOMES_CARP[t] + " (carpintaria)", categoria: "estrutural", hospedagem: "livre", geometria: "marcenaria",
      descricao: "Estrutura de madeira serrada que vira LISTA DE CORTE: cada peça com seção, comprimento e o ângulo de corte das pontas. " + AVISO_NBR + ".",
      parametros: paramsCarp(t), tipos: [T(t + "-1", NOMES_CARP[t] + " (partida)", {})],
      quantitativo: { unidade: "un", quantidade: "1", codigo: "", fonte: "", descricao: NOMES_CARP[t] } });
  });
  function carpDeValores(v) {
    var t = txt(v && v.Estrutura) || "pergolado", o = {};
    Object.keys(PADRAO_CARP[t] || {}).forEach(function (k) { if (k === "especie") o.especie = txt(v && v.Especie) || PADRAO_CARP[t].especie; else o[k] = num(v && v["C_" + k], PADRAO_CARP[t][k]); });
    return { tipo: t, o: o };
  }
  /* o GANCHO de js/familia.js: a geometria da família de marcenaria */
  function completar(fam, tipo, inst, saida) {
    var v = saida.valores || {}, solidos = [], cota = 0;
    if (/^ra-carp-/.test(fam.id) || v.Estrutura) {
      var cv = carpDeValores(v), r = carpintaria(cv.tipo, cv.o);
      if (!r.ok) { saida.ok = false; saida.erros = saida.erros.concat(r.erros); return saida; }
      r.pecas.forEach(function (p, i) { solidos.push(solidoDe(p, "Madeira", "#b88a5a", i, 0)); });
      saida.marcenaria = { carpintaria: cv.tipo, serradas: r.pecas, ferragens: r.ferragens, avisos: r.avisos, parametros: cv.o, ambiente: txt(v.Ambiente) };
    } else {
      var m = moduloDeValores(v), ex = explodir(m);
      if (!ex.ok) { saida.ok = false; saida.erros = saida.erros.concat(ex.erros); return saida; }
      cota = m.cota;
      ex.pecas.forEach(function (p, i) { var ch = chapaDe(catAtual, p.chapa); solidos.push(solidoDe(p, p.material, ch ? ch.cor : "", i, cota)); });
      saida.marcenaria = { modulo: m, pecas: ex.pecas.length, ferragens: ex.ferragens, avisos: ex.avisos };
    }
    saida.solidos = solidos;
    saida.caixa = caixaSol(solidos);
    return saida;
  }
  function solidoDe(p, material, cor, i, cota) {
    /* `peca`: o que o IFC de saída leva de cada parte (Pset OrcaPRO_Marcenaria) */
    var info = p.fita ? { funcao: p.funcao, ifc: null, medidas: p.comprimento + " × " + p.largura + " × " + p.espessura + " mm", veio: !!p.veio,
                          fitas: ["C1", "C2", "L1", "L2"].filter(function (s) { return p.fita[s]; }).join(" ") || "sem fita" }
                      : { funcao: p.funcao, ifc: p.ifc || null, secao: p.b + " × " + p.h + " mm", medidas: p.comprimento + " mm", corte1: p.corte1 && p.corte1.descricao, corte2: p.corte2 && p.corte2.descricao, especie: p.especie };
    var o = { id: "pc" + (i + 1), nome: p.nome, material: material, cor: cor || "", rot: 0, peca: info };
    if (p.box) {
      var b = p.box;
      o.forma = "caixa"; o.x = (b.x0 + b.x1) / 2000; o.y = (b.y0 + cota) / 1000; o.z = (b.z0 + b.z1) / 2000;
      o.dx = (b.x1 - b.x0) / 1000; o.dy = (b.y1 - b.y0) / 1000; o.dz = (b.z1 - b.z0) / 1000;
    } else if (p.poly) {
      o.forma = "extrusao"; o.plano = "frente"; o.x = 0; o.y = cota / 1000; o.z = p.poly.z0 / 1000; o.altura = (p.poly.z1 - p.poly.z0) / 1000;
      o.contorno = p.poly.pts.map(function (q) { return [q[0] / 1000, q[1] / 1000]; });
    }
    return o;
  }
  function caixaSol(sol) {
    var b = { x0: Infinity, y0: Infinity, z0: Infinity, x1: -Infinity, y1: -Infinity, z1: -Infinity };
    sol.forEach(function (s) {
      if (s.forma === "caixa") { b.x0 = Math.min(b.x0, s.x - s.dx / 2); b.x1 = Math.max(b.x1, s.x + s.dx / 2); b.y0 = Math.min(b.y0, s.y); b.y1 = Math.max(b.y1, s.y + s.dy); b.z0 = Math.min(b.z0, s.z - s.dz / 2); b.z1 = Math.max(b.z1, s.z + s.dz / 2); }
      else arr(s.contorno).forEach(function (q) { b.x0 = Math.min(b.x0, q[0]); b.x1 = Math.max(b.x1, q[0]); b.y0 = Math.min(b.y0, s.y + q[1]); b.y1 = Math.max(b.y1, s.y + q[1]); b.z0 = Math.min(b.z0, s.z); b.z1 = Math.max(b.z1, s.z + s.altura); });
    });
    return b.x0 === Infinity ? null : b;
  }
  /* família colocada no modelo → módulo (para o projeto de corte) */
  function deInstancia(av) {
    if (!av || !av.marcenaria) return null;
    if (av.marcenaria.modulo) return clone(av.marcenaria.modulo);
    return { serradas: av.marcenaria.serradas, ferragens: av.marcenaria.ferragens, tipo: av.marcenaria.carpintaria, nome: NOMES_CARP[av.marcenaria.carpintaria], ambiente: av.marcenaria.ambiente };
  }
  /* peças de madeira serrada já colocadas no modelo (as famílias de madeira da biblioteca RA) */
  function serradasDeFamilia(av, famId, especieTxt) {
    var v = av && av.valores; if (!v) return null;
    if (famId !== "ra-madeira-viga" && famId !== "ra-madeira-pilar") return null;
    var esp = /pinus/i.test(txt(v.Especie || especieTxt)) ? "pinus" : "tatajuba";
    return serrada({ nome: famId === "ra-madeira-pilar" ? "Pilar" : "Peça serrada", funcao: famId === "ra-madeira-pilar" ? "pilar" : "viga", b: Math.round(num(v.Base, 0) * 1000), h: Math.round(num(v.Altura, 0) * 1000),
      comprimento: Math.round(num(v.Comprimento, 0) * 1000), especie: esp, ifc: famId === "ra-madeira-pilar" ? "COLUMN" : "BEAM" });
  }

  /* o PROJETO DE CORTE do que está no MODELO: cada família de marcenaria
     colocada vira um módulo (na ordem em que foi colocada: M01, M02…) e as
     peças de madeira serrada da biblioteca RA entram na lista de serradas.
     `avaliar(famId, tipoId, inst)` = a família avaliada (a do visualizador). */
  function doModelo(familias, avaliar, cat) {
    var mods = [], soltas = [], ids = [];
    arr(familias).forEach(function (f) {
      var av = null; try { av = avaliar(f.famId, f.tipoId, f.inst); } catch (e) { av = null; }
      if (!av) return;
      var m = deInstancia(av);
      if (m) { m.idModelo = f.id; mods.push(m); ids.push(f.id); return; }
      var s = serradasDeFamilia(av, f.famId); if (s) { s.idModelo = f.id; soltas.push(s); }
    });
    if (soltas.length) mods.push({ serradas: soltas, nome: "Peças de madeira do modelo", tipo: "serradas" });
    var p = projeto(mods, cat);
    p.idsModelo = ids;
    return p;
  }

  function disciplinaLigada() {
    try {
      var BP = global.BimPrevia;
      if (!BP || !BP.modelador || !BP.modelador()) return false;
      if (typeof BP.disciplina === "function") return !!BP.disciplina("marcenaria");
      return true;
    } catch (e) { return false; }
  }
  var FamiliasMarcenaria = {
    /* `todas` = sem perguntar à prévia (testes) */
    lista: function (todas) { return todas || disciplinaLigada() ? clone(FAMILIAS) : []; },
    obter: function (id, todas) { if (!todas && !disciplinaLigada()) return null; for (var i = 0; i < FAMILIAS.length; i++) if (FAMILIAS[i].id === id) return clone(FAMILIAS[i]); return null; },
    ehMarcenaria: function (famId) { return /^ra-(marc|carp)-/.test(txt(famId)); }
  };

  var Marcenaria = {
    CATALOGO_PADRAO: CATALOGO_PADRAO, TIPOS_MODULO: TIPOS_MODULO, PRESETS: PRESETS, ESPECIES: ESPECIES, PADRAO_CARP: PADRAO_CARP, FERRAGENS: FERRAGENS, AVISO_NBR: AVISO_NBR,
    catalogo: function () { return catAtual; },
    definirCatalogo: function (c) {
      var novo = mesclar(clone(CATALOGO_PADRAO), c || {}), v = validarCatalogo(novo);
      if (!v.ok) return v;
      catAtual = novo; return { ok: true, erros: [] };
    },
    restaurarCatalogo: function () { catAtual = clone(CATALOGO_PADRAO); return catAtual; },
    validarCatalogo: validarCatalogo, chapaDe: chapaDe, fitaDe: fitaDe,
    modulo: modulo, explodir: explodir, projeto: projeto, otimizar: otimizar, metrosFita: metrosFita,
    posicoesLigacao: posicoesLigacao, nDobradicas: nDobradicas, somarFerragens: somarFerragens,
    carpintaria: carpintaria, membro: membro, agruparSerradas: agruparSerradas, otimizarBarras: otimizarBarras, serradasDeFamilia: serradasDeFamilia,
    moduloDeValores: moduloDeValores, completar: completar, deInstancia: deInstancia, disciplinaLigada: disciplinaLigada, doModelo: doModelo, NOMES_CARP: NOMES_CARP, instDeModulo: instDeModulo, PARAMS_CARP: PARAMS_CARP_ROT
  };
  global.Marcenaria = Marcenaria;
  global.FamiliasMarcenaria = FamiliasMarcenaria;
  if (typeof module !== "undefined" && module.exports) { module.exports = Marcenaria; module.exports.FamiliasMarcenaria = FamiliasMarcenaria; }
})(typeof window !== "undefined" ? window : (typeof global !== "undefined" ? global : this));
