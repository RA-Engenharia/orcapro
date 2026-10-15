/* =====================================================================
 * blocokpranchas.js — PRANCHAS EXECUTIVAS do sistema Blocok (motor puro, sem tela)
 *
 * BlocokPranchas.gerar(resultado, opcoes) → { ok, folhas:[{id, numero, rotulo, titulo, formato,
 *   escala, svg, ...}], avisos, dados }
 *   resultado = BlocokCalc.calcular(obra) (paredes[].pag = BlocokExec.paginar).
 *   opcoes = { empresa (nome, ou o objeto do cadastro: nome, cnpj, titulo, responsavel, crea, endereco,
 *              cidade, email, telefone), responsavel, registro, tituloProfissional, obra, proprietario,
 *              contratante (ou cliente), local, codigo ("BLK"), revisao ("R00"), data (dd/mm/aaaa, ISO ou
 *              Date), formato ("auto" = escolhe A3/A2/A1 pelo conteúdo; ou um formato fixo), modelo
 *              ("ra" = padrão RA | "blocok" = cores da marca), logo (imagem do carimbo), planta }
 * BlocokPranchas.htmlImpressao(folhas, titulo) → HTML para imprimir/salvar em PDF NO TAMANHO REAL de cada folha.
 *
 * Folhas (carimbo RA INTOCADO de js/prancha.js; formato escolhido pelo conteúdo de cada folha):
 *   LOCAÇÃO   planta de locação dos reforços (1:50) + QUADRO DE PILARETES, VERGAS, CONTRAVERGAS E CINTAS
 *   PAGINAÇÃO paredes distribuídas em grade (1:20 ou 1:25): elevação com cada peça no tamanho real, faixas
 *             de EPS retirado, vãos, cotas, tabela de peças e totais
 *   DETALHES  grade regular: corte da peça, canto L, T com grampo, verga, pilarete, cinta, junta, encunhamento
 *   AÇO       tabela de aço (linha por elemento) em blocos de mesma altura + resumo por bitola
 *
 * O desenho é montado UMA vez em primitivas (mm de papel, y para baixo) e sai em SVG aqui e em DXF
 * (js/blocokdxf.js) — o mesmo desenho nos dois. Regra da casa: NENHUM texto sobre cota ou sobre outro texto
 * (memória "pranchas sem sobreposição") e NENHUM texto fora da sua caixa (área de desenho, coluna, célula
 * de tabela, carimbo): BlocokPranchas.sobreposicoes(folha) confere as duas coisas.
 *
 * ⚠ ES5 puro (UMD), Node-testável, sem DOM. Teste: node tools/test-blocokpranchas.js
 * ⚠ NÃO inventa dado: o que o motor não traz (bitola/Ø do grampo, material do encunhamento, cobrimento
 *   exato) sai como placeholder [a definir], EM VERMELHO, e vai para a lista de pendências. Campo do carimbo
 *   sem dado (responsável técnico, contratante...) também sai como placeholder vermelho, nunca em branco.
 * ===================================================================== */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory(require("./prancha.js"), require("./blocokexec.js"));
  else root.BlocokPranchas = factory(root.Prancha, root.BlocokExec);
})(typeof self !== "undefined" ? self : this, function (Prancha, BlocokExec) {
  "use strict";

  /* ================================================================ PADRÃO
   * Fonte: Padrão RA de Detalhamento v2.4 (padrao_detalhamento_ra.json — penas, layers, textos, cotas,
   * notação TQS, tabelas, carimbo) e as pranchas da metálica (js/acopranchas.js, aprovadas): moldura, coluna
   * da direita com as notas encostadas no carimbo, texto preto com o peso da pena, tabelas com grade.
   * Para ALVENARIA/PAGINAÇÃO o JSON não tem seção: o que está marcado "CRIADO" foi criado aqui, coerente
   * com o JSON (09/10/2026: "tipo sem padrão → criar sem perguntar"), e precisa ir para o JSON como seção
   * "alvenaria_blocok". */
  var PADRAO = {
    versao: "blocok-pranchas 2.0 (14/10/2026)",
    base: "Padrão RA de Detalhamento v2.4 (visual TQS, carimbo RA intocado) + leiaute das pranchas da metálica",
    fonte: "RomanS, ISOCPEUR, Arial, Helvetica, sans-serif",     /* JSON textos.fonte_ttf */
    formato: "A1",                                                /* JSON prancha.formato_padrao (formato fixo pedido) */
    formatos: ["A3", "A2", "A1"],                                 /* CRIADO: "auto" escolhe o menor em que o conteúdo cabe; A0 só se nada couber no A1 */
    /* penas por layer (mm) e cor ACI — valores do JSON (layers + cor_pena_ctb). lt = tipo de linha. */
    layers: {
      "EST-FORMA-VISTA":  { aci: 92,  pena: 0.25, lt: null,          uso: "contorno da peça (concreto/face em vista) — JSON" },
      "EST-FORMA-CORTE":  { aci: 200, pena: 0.50, lt: null,          uso: "concreto cortado: faixas de reforço, seções dos detalhes — JSON" },
      "EST-HACHURA":      { aci: 9,   pena: 0.09, lt: null,          uso: "hachura ANSI31 — JSON" },
      "EST-OCULTA":       { aci: 42,  pena: 0.18, lt: "TRACEJADO",   uso: "vãos (arestas ocultas/projeções) — JSON" },
      "EST-COTA":         { aci: 1,   pena: 0.13, lt: null,          uso: "cotas e linhas de chamada — JSON" },
      "EST-EIXO":         { aci: 1,   pena: 0.13, lt: "TRACO-PONTO", uso: "eixos — JSON" },
      "EST-TEXTO":        { aci: 7,   pena: 0.25, lt: null,          uso: "textos e notas — JSON" },
      "EST-TITULO":       { aci: 150, pena: 0.35, lt: null,          uso: "títulos dos desenhos — JSON" },
      "EST-TABELA":       { aci: 7,   pena: 0.25, lt: null,          uso: "tabelas — JSON" },
      "EST-ARM-TEXTO":    { aci: 42,  pena: 0.18, lt: null,          uso: "notação das barras (letra monolinha) — JSON" },
      "EST-ARM-LONG":     { aci: 30,  pena: 0.60, lt: null,          uso: "barra longitudinal/grampo (a mais grossa do desenho) — JSON" },
      "EST-ARM-ESTRIBO":  { aci: 150, pena: 0.35, lt: null,          uso: "estribos — JSON" },
      "EST-ARM-SECAO":    { aci: 200, pena: 0.50, lt: null,          uso: "barra em seção (ponto cheio) — JSON" },
      "EST-ARM-CHAMADA":  { aci: 1,   pena: 0.13, lt: null,          uso: "chamadas das posições — JSON" },
      "EST-CONTEXTO":     { aci: 8,   pena: 0.13, lt: null,          uso: "contexto (EPS, laje) — JSON" },
      "EST-LINHA-FINA":   { aci: 42,  pena: 0.18, lt: null,          uso: "linhas finas secundárias — JSON" },
      "BLK-NUM":          { aci: 42,  pena: 0.18, lt: null,          uso: "CRIADO: código/dimensões da peça (mesma pena de EST-ARM-TEXTO)" },
      "BLK-EPS":          { aci: 8,   pena: 0.13, lt: null,          uso: "CRIADO: núcleo de EPS nos detalhes (cinza de contexto, pena 0,13)" },
      "BLK-TRATAMENTO":   { aci: 150, pena: 0.35, lt: null,          uso: "CRIADO: camadas do tratamento de junta (mesma pena de estribo)" },
      "BLK-PENDENTE":     { aci: 1,   pena: 0.25, lt: null,          uso: "CRIADO: texto de pendência [a definir], em vermelho (como a metálica)" },
      "BLK-MOLDURA":      { aci: 7,   pena: 0.50, lt: null,          uso: "CRIADO: moldura e linha da coluna (MET-MOLDURA da metálica, 0,5)" },
      /* modelo de folha Blocok: só a moldura/faixa de título, os destaques do carimbo e o cabeçalho das tabelas.
         Cor ACI = a mais próxima do hex da marca (o DXF R2000 não leva cor verdadeira); o PDF sai com o hex. */
      "BLK-MARCA-MARINHO": { aci: 158, pena: 0.50, lt: null, marca: "marinho", uso: "CRIADO: modelo Blocok — faixa da coluna" },
      "BLK-MARCA-AZUL":    { aci: 161, pena: 0.35, lt: null, marca: "azul",    uso: "CRIADO: modelo Blocok — faixa de título e cabeçalho das tabelas" },
      "BLK-MARCA-DOURADO": { aci: 43,  pena: 0.35, lt: null, marca: "dourado", uso: "CRIADO: modelo Blocok — filete sob as faixas" },
      "BLK-MARCA-TEXTO":   { aci: 7,   pena: 0.25, lt: null, uso: "CRIADO: modelo Blocok — texto branco sobre a faixa" }
    },
    /* alturas de texto (CORPO da fonte, mm de papel) — JSON textos.alturas_plotadas_mm */
    textos: {
      titulo: 4.2,           /* titulo_desenho */
      escala: 3.0,           /* escala_sob_titulo */
      nota: 2.5, cota: 2.5, tabela: 2.5, notacao: 2.5,
      cabecalho: 3.1,        /* tabela_cabecalho */
      quadro: 7.5,           /* titulo_quadro ("NOTAS", "LEGENDA") */
      trecho: 2.1,           /* notacao_estribo_trecho — usado nas dimensões da peça e como letra mínima */
      letraCorte: 3.4,
      minimo: 1.8            /* CRIADO: piso para texto DENTRO de peça estreita (só o número da peça) */
    },
    /* cotas — JSON cotas: unidade cm, ponto cheio nos terminais, texto acima da linha, girado 90° na vertical */
    cotas: { pontoRaio: 0.55, extensaoAlem: 1.5, afastamento: 1, textoFolga: 0.8 },
    hachuras: { espaco: 2.0, fino: 1.0 },          /* ANSI31 — JSON hachuras (espaçamento em mm de papel: CRIADO) */
    escalas: {
      paginacao: [20, 25],                          /* CRIADO: elevação da parede — 1:20, senão 1:25 */
      paginacaoReserva: [50],                       /* CRIADO: só se a parede não couber em 1:25 nem no A0 (avisa) */
      planta: [50, 100, 200],                       /* JSON escalas.planta_locacao = 1:50 (maior número só se não couber) */
      detalhe: "1:2 (corte da peça), 1:5 (verga, cinta, pilarete, junta, encunhamento), 1:10 (canto, T)"
    },
    tabelas: {
      aco: ["AÇO", "POS", "BIT (mm)", "QUANT", "COMPR UNIT (cm)", "COMPR TOTAL (cm)", "PESO (kg)"],   /* JSON tabelas.por_elemento + coluna de peso pedida */
      resumo: ["AÇO", "BIT (mm)", "COMPR (m)", "PESO (kg)"],                                           /* JSON tabelas.resumo (sem +10%) */
      acoCodigo: "50A = CA-50; 60B = CA-60 (JSON tabelas.aco_codigo). Bitola 5,0 = 60B (NBR 7480: φ5 só existe em CA-60); demais = 50A (CRIADO, ver pendência)",
      grade: "tabela com grade (célula fechada) e cabeçalho em 3,1 mm, como as tabelas da metálica"
    },
    tiposPeca: {   /* CRIADO: legenda de tipo (sem hachura, para não passar linha sob o número da peça) */
      inteira: { cod: "", nome: "inteira" }, meia: { cod: "M", nome: "meia" },
      recorte: { cod: "R", nome: "recorte" }, "recorte-L": { cod: "L", nome: "recorte em L" }
    },
    folha: {
      margens: "20/10/10/10 mm (carimbo RA, js/prancha.js)",
      organizacao: "CRIADO (14/10/2026): formato escolhido pelo conteúdo de cada folha (o menor de A3/A2/A1 em que tudo cabe na " +
        "escala do padrão, com as notas inteiras na coluna); conteúdo centrado na área de desenho, em grade alinhada, respiro " +
        "mínimo de 15 mm entre desenhos (Padrão RA); título do desenho e escala abaixo dele no canto superior esquerdo de cada " +
        "desenho; coluna da direita com LEGENDA, NOTAS e NORMAS encostadas no carimbo (como a metálica).",
      respiro: 15
    }
  };
  /* MODELOS DE FOLHA. "ra" = o padrão. "blocok" = o mesmo desenho com as cores da marca Blocok SÓ na moldura/faixa
     de título, nos destaques do carimbo e no cabeçalho das tabelas (o desenho técnico continua nas penas do padrão
     e imprime em preto e branco). Cores tiradas do site da marca (blocok.vercel.app, 14/10/2026). */
  var MODELOS = {
    ra: { id: "ra", nome: "RA (padrão)", moldura: "#000", destaque: "#00406A", rotulo: "#444", cabecalho: null, sistema: "" },
    blocok: { id: "blocok", nome: "Blocok", moldura: "#001B2D", destaque: "#5171FD", rotulo: "#001B2D", cabecalho: "azul", sistema: "SISTEMA BLOCOK",
      cores: { marinho: "#001B2D", azul: "#5171FD", azulLogo: "#3AA7E0", azulClaro: "#66BAE6", dourado: "#C2994A", verde: null },
      fontes: {
        marinho: "banner-principal.png do site (cor dominante do fundo)",
        azul: "logo da Blocok (logo-preta.png) = classe .bg-blue-300/.text-blue-300 do CSS do site, rgb(81 113 253)",
        azulLogo: "logo da Blocok (segundo azul)",
        azulClaro: "logo da Blocok = classe .bg-blue-100 do CSS do site, rgb(102 186 230)",
        dourado: "selo ensaios/lg-origi.png do site",
        verde: "PENDENTE: a faixa verde não aparece no CSS nem nas imagens do site; sem o hex oficial, não entra"
      } }
  };
  var VERMELHO = "#c00000", PRETO = "#000";

  /* ================================================================ UTIL */
  function num(v, d) { var n = +v; return isFinite(n) ? n : (d == null ? 0 : d); }
  function arr(a) { return Array.isArray(a) ? a : []; }
  function txt(v) { return v == null ? "" : String(v); }
  function r2(v) { return Math.round(v * 100) / 100; }
  function dois(n) { return (n < 10 ? "0" : "") + n; }
  function esc(s) { return txt(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function br(v, d) {
    var s = num(v).toFixed(d == null ? 2 : d), p = s.split("."), i = p[0], neg = i.charAt(0) === "-";
    if (neg) i = i.slice(1);
    i = i.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return (neg ? "-" : "") + i + (p[1] ? "," + p[1] : "");
  }
  function cmTxt(m) { var v = Math.round(num(m) * 1000) / 10; return String(v).replace(".", ","); }       /* m → cm com até 1 casa */
  function mTxt(m) { return br(m, 2); }
  /* largura do texto: avanço de cada caractere em milésimos do corpo — o MAIOR entre a RomanS (a letra do padrão)
     e a Arial (a reserva do navegador), a mesma tabela da metálica (js/acopranchas.js), + 4 % de folga. A conta
     antiga (0,86 do corpo por letra) exagerava a largura e espalhava as tabelas. */
  var LARG = [751,366,506,751,716,891,926,366,506,506,576,926,366,926,366,786,716,716,716,716,716,716,716,716,716,716,366,366,856,926,856,646,
    1015,667,891,891,751,681,646,778,821,296,576,786,576,856,786,786,751,786,751,716,611,786,667,944,716,667,716,436,786,436,786,891,366,681,
    681,646,681,646,436,681,681,296,366,611,296,1066,681,681,681,681,471,611,436,681,576,786,611,576,611,506,296,506,891,0,0,0,0,0,0,0,0,0,0,
    0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,751,471,646,646,556,786,260,716,333,737,471,646,584,926,737,552,400,926,385,333,333,716,537,
    333,333,333,471,646,996,996,834,646,667,667,667,667,667,667,1000,891,681,681,681,681,296,296,296,296,751,786,778,778,778,786,786,584,786,
    786,786,786,786,667,751,646,681,681,681,681,681,681,889,646,646,646,646,646,401,401,401,401,681,681,681,681,681,681,681,646,716,681,681,
    681,681,576,681,576];
  function larg(s, h) {
    s = txt(s); var w = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i), v = c >= 32 && c < 256 ? LARG[c - 32] : 0;
      if (!v) v = (c === 8212 || c === 8230 || c === 8594) ? 1000 : 760;
      w += v;
    }
    return w / 1000 * h * 1.04;
  }
  function hoje() { var dt = new Date(); return dois(dt.getDate()) + "/" + dois(dt.getMonth() + 1) + "/" + dt.getFullYear(); }
  /* data do carimbo sempre no padrão brasileiro: "2026-10-14" (ISO, como vinha da tela) → "14/10/2026" */
  function dataBR(v) {
    if (v instanceof Date && !isNaN(v.getTime())) return dois(v.getDate()) + "/" + dois(v.getMonth() + 1) + "/" + v.getFullYear();
    var s = txt(v).trim(), m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return m[3] + "/" + m[2] + "/" + m[1];
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
    return hoje();
  }
  function placeholder(s) { return /\[[^\]]+\]/.test(txt(s)); }
  function layer(n) { return PADRAO.layers[n] || PADRAO.layers["EST-TEXTO"]; }

  /* ================================================================ DESENHO (primitivas) */
  function Desenho(modelo) { this.e = []; this.cx = []; this.cs = []; this.keep = []; this.n = 0; this.modelo = modelo || MODELOS.ra; this.zona = "corpo"; }
  var DP = Desenho.prototype;
  DP.add = function (o) { this.e.push(o); return o; };
  DP.linha = function (x1, y1, x2, y2, cam, lt) {
    if (Math.abs(x1 - x2) < 1e-6 && Math.abs(y1 - y2) < 1e-6) return;
    this.add({ t: "L", c: cam, p: [r2(x1), r2(y1), r2(x2), r2(y2)], lt: lt || null });
  };
  DP.poli = function (pts, cam, fechado, lt) { this.add({ t: "P", c: cam, pts: pts.map(function (p) { return [r2(p[0]), r2(p[1])]; }), f: !!fechado, lt: lt || null }); };
  DP.ret = function (x, y, w, h, cam, lt) { this.poli([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], cam, true, lt); };
  DP.circ = function (x, y, r, cam, cheio) { this.add({ t: "C", c: cam, x: r2(x), y: r2(y), r: r2(r * 100) / 100, cheio: !!cheio }); };
  DP.hach = function (pts, cam, esp) { this.add({ t: "H", c: cam || "EST-HACHURA", pts: pts.map(function (p) { return [r2(p[0]), r2(p[1])]; }), esp: esp || PADRAO.hachuras.espaco }); };
  DP.hachRet = function (x, y, w, h, esp) { if (w > 0.2 && h > 0.2) this.hach([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], "EST-HACHURA", esp); };
  /* retângulo cheio (faixa e cabeçalho do modelo Blocok): no DXF vira hachura sólida na camada */
  DP.fundo = function (x, y, w, h, cam) { this.add({ t: "F", c: cam, x: r2(x), y: r2(y), w: r2(w), h: r2(h) }); };
  function caixaTexto(x, y, s, h, al, ang) {
    var w = larg(s, h);
    if (!ang) { var x0 = al === "C" ? x - w / 2 : (al === "D" ? x - w : x); return { x0: x0, x1: x0 + w, y0: y - 0.8 * h, y1: y + 0.25 * h }; }
    var y0 = al === "C" ? y - w / 2 : (al === "D" ? y : y - w);
    return { x0: x - 0.8 * h, x1: x + 0.25 * h, y0: y0, y1: y0 + w };
  }
  /* texto: al E/C/D; ang 0 ou 90 (90 = lê de baixo para cima, como a cota vertical do padrão); o.g = grupo (cota/chamada
     própria); o.cel = a caixa (célula) que o texto não pode passar; o.cor = cor (placeholder [..] sai vermelho sozinho);
     o.peso = contorno (a RomanS é traço único fino: o contorno dá a espessura da pena, como na metálica) */
  DP.texto = function (x, y, s, h, cam, o) {
    o = o || {}; s = txt(s); if (!s.trim()) return null;
    var al = o.al || "E", ang = o.ang ? 90 : 0, cx = caixaTexto(x, y, s, h, al, ang), pend = !o.cor && placeholder(s);
    this.add({ t: "T", c: pend ? "BLK-PENDENTE" : (cam || "EST-TEXTO"), x: r2(x), y: r2(y), s: s, h: h, al: al, ang: ang, w: larg(s, h),
      cor: o.cor || (pend ? VERMELHO : null), peso: o.peso != null ? o.peso : null });
    cx.s = s; cx.g = o.g || null; cx.zona = o.zona || this.zona; cx.cel = o.cel || null; this.cx.push(cx);
    return cx;
  };
  DP.seg = function (x1, y1, x2, y2, g) { this.cs.push({ x1: x1, y1: y1, x2: x2, y2: y2, g: g || null }); };
  DP.novoGrupo = function (p) { return (p || "g") + (++this.n); };
  /* terminal ponto cheio (JSON cotas.terminal) */
  DP.ponto = function (x, y) { this.circ(x, y, PADRAO.cotas.pontoRaio, "EST-COTA", true); };
  /* cota horizontal: xa..xb medidos em yRef; linha de cota em y; texto acima. Devolve o grupo. */
  DP.cotaH = function (xa, xb, y, yRef, texto, g, o) {
    o = o || {}; var C = PADRAO.cotas, h = PADRAO.textos.cota; g = g || this.novoGrupo("c");
    var dir = y >= yRef ? 1 : -1;
    if (!o.semExt) {
      this.linha(xa, yRef + dir * C.afastamento, xa, y + dir * C.extensaoAlem, "EST-COTA"); this.seg(xa, yRef + dir * C.afastamento, xa, y + dir * C.extensaoAlem, g);
      this.linha(xb, yRef + dir * C.afastamento, xb, y + dir * C.extensaoAlem, "EST-COTA"); this.seg(xb, yRef + dir * C.afastamento, xb, y + dir * C.extensaoAlem, g);
    }
    this.linha(xa, y, xb, y, "EST-COTA"); this.seg(xa, y, xb, y, g);
    this.ponto(xa, y); this.ponto(xb, y);
    if (texto) {
      var ty = y - C.textoFolga, wTxt = larg(texto, h);
      if (wTxt <= Math.abs(xb - xa) - 1) this.texto((xa + xb) / 2, ty, texto, h, "EST-COTA", { al: "C", g: g });
      else this.texto((xa + xb) / 2 + h * 0.3, y - C.textoFolga - 0.1, texto, h, "EST-COTA", { al: "E", ang: 90, g: g });
    }
    return g;
  };
  /* cota vertical (xa fixo): ya..yb medidos em xRef; linha em x; texto à esquerda da linha, girado 90° */
  DP.cotaV = function (ya, yb, x, xRef, texto, g, o) {
    o = o || {}; var C = PADRAO.cotas, h = PADRAO.textos.cota; g = g || this.novoGrupo("c");
    var dir = x >= xRef ? 1 : -1;
    if (!o.semExt) {
      this.linha(xRef + dir * C.afastamento, ya, x + dir * C.extensaoAlem, ya, "EST-COTA"); this.seg(xRef + dir * C.afastamento, ya, x + dir * C.extensaoAlem, ya, g);
      this.linha(xRef + dir * C.afastamento, yb, x + dir * C.extensaoAlem, yb, "EST-COTA"); this.seg(xRef + dir * C.afastamento, yb, x + dir * C.extensaoAlem, yb, g);
    }
    this.linha(x, ya, x, yb, "EST-COTA"); this.seg(x, ya, x, yb, g);
    this.ponto(x, ya); this.ponto(x, yb);
    if (texto) this.texto(x - C.textoFolga, (ya + yb) / 2, texto, h, "EST-COTA", { al: "C", ang: 90, g: g });
    return g;
  };
  /* chamada com texto: tenta posições ao redor do ponto até achar lugar sem texto/cota/área reservada; devolve a caixa */
  DP.rotulo = function (ax, ay, s, h, cam, o) {
    o = o || {}; s = txt(s); var self = this, dists = o.dists || [5, 8, 12, 17, 23, 30, 40, 52, 66, 85, 110, 140, 170], angs = (o.angs || []).concat([0, 180, -90, 90, -45, -135, 45, 135, -20, 200, -70, 70, -110, 110]), lim = this.limite;
    var g = this.novoGrupo("r"), folga = 0.8;
    function livre(b, lx1, ly1, lx2, ly2) {
      var bi = { x0: b.x0 - folga, x1: b.x1 + folga, y0: b.y0 - folga, y1: b.y1 + folga }, i;
      for (i = 0; i < self.cx.length; i++) if (boxBox(bi, self.cx[i], 0)) return false;
      for (i = 0; i < self.cs.length; i++) if (segBox(self.cs[i], bi, 0)) return false;
      for (i = 0; i < self.keep.length; i++) if (boxBox(b, self.keep[i], 0)) return false;
      for (i = 0; i < self.cx.length; i++) if (segBox({ x1: lx1, y1: ly1, x2: lx2, y2: ly2 }, self.cx[i], 0.1)) return false;
      return true;
    }
    for (var di = 0; di < dists.length; di++) for (var ai = 0; ai < angs.length; ai++) {
      var a = angs[ai] * Math.PI / 180, d = dists[di], tx = ax + d * Math.cos(a), ty = ay + d * Math.sin(a), al = "C", yb;
      /* âncora do texto: lado direito → começa à direita; esquerdo → termina à esquerda; cima/baixo → centrado */
      if (Math.cos(a) > 0.5) { al = "E"; } else if (Math.cos(a) < -0.5) { al = "D"; }
      yb = ty + 0.35 * h;
      var b = caixaTexto(tx, yb, s, h, al, 0);
      if (lim && (b.x0 < lim.x0 + 1 || b.x1 > lim.x1 - 1 || b.y0 < lim.y0 + 1 || b.y1 > lim.y1 - 1)) continue;
      var px = Math.max(b.x0, Math.min(b.x1, ax)), py = Math.max(b.y0, Math.min(b.y1, ay));   /* ponto da caixa mais próximo da âncora */
      if (px === ax && py === ay) continue;
      if (!livre(b, ax, ay, px, py)) continue;
      this.texto(tx, yb, s, h, cam || "EST-TEXTO", { al: al, g: g });
      this.linha(ax, ay, px, py, "EST-ARM-CHAMADA"); this.seg(ax, ay, px, py, g); this.circ(ax, ay, 0.5, "EST-ARM-CHAMADA", true);
      return b;
    }
    if (!o.silencioso) { this.avisos = this.avisos || []; this.avisos.push("rótulo sem lugar livre: " + s); }
    return null;
  };
  /* caixa que envolve tudo o que foi desenhado (traços, hachuras, textos) */
  DP.bbox = function () {
    var b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    function pt(x, y) { if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y; }
    this.e.forEach(function (o) {
      if (o.t === "L") { pt(o.p[0], o.p[1]); pt(o.p[2], o.p[3]); }
      else if (o.t === "P" || o.t === "H") o.pts.forEach(function (p) { pt(p[0], p[1]); });
      else if (o.t === "C") { pt(o.x - o.r, o.y - o.r); pt(o.x + o.r, o.y + o.r); }
      else if (o.t === "F") { pt(o.x, o.y); pt(o.x + o.w, o.y + o.h); }
    });
    this.cx.forEach(function (c) { pt(c.x0, c.y0); pt(c.x1, c.y1); });
    if (!isFinite(b.x0)) return { x0: 0, y0: 0, x1: 0, y1: 0, w: 0, h: 0 };
    b.w = b.x1 - b.x0; b.h = b.y1 - b.y0; return b;
  };
  /* junta o desenho `o` a este, deslocado de (dx, dy): é como um bloco (planta, detalhe) desenhado na origem entra na folha */
  DP.mesclar = function (o, dx, dy) {
    var self = this;
    function cx(b) { return { x0: b.x0 + dx, x1: b.x1 + dx, y0: b.y0 + dy, y1: b.y1 + dy }; }
    o.e.forEach(function (e) {
      var c = {}; for (var k in e) if (Object.prototype.hasOwnProperty.call(e, k)) c[k] = e[k];
      if (c.t === "L") c.p = [r2(e.p[0] + dx), r2(e.p[1] + dy), r2(e.p[2] + dx), r2(e.p[3] + dy)];
      else if (c.t === "P" || c.t === "H") c.pts = e.pts.map(function (p) { return [r2(p[0] + dx), r2(p[1] + dy)]; });
      else { c.x = r2(e.x + dx); c.y = r2(e.y + dy); }
      self.e.push(c);
    });
    o.cx.forEach(function (b) { var n = cx(b); n.s = b.s; n.g = b.g; n.zona = b.zona; n.cel = b.cel ? cx(b.cel) : null; self.cx.push(n); });
    o.cs.forEach(function (s) { self.cs.push({ x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy, g: s.g }); });
    o.keep.forEach(function (k) { self.keep.push(cx(k)); });
    if (o.avisos) { self.avisos = (self.avisos || []).concat(o.avisos); }
  };
  function boxBox(a, b, t) { t = t || 0; return a.x0 < b.x1 - t && a.x1 > b.x0 + t && a.y0 < b.y1 - t && a.y1 > b.y0 + t; }
  function dentro(a, b, t) { t = t || 0; return a.x0 >= b.x0 - t && a.x1 <= b.x1 + t && a.y0 >= b.y0 - t && a.y1 <= b.y1 + t; }
  /* segmento × caixa (Liang–Barsky), com a caixa encolhida de t */
  function segBox(s, b, t) {
    t = t || 0; var x0 = b.x0 + t, x1 = b.x1 - t, y0 = b.y0 + t, y1 = b.y1 - t; if (x1 <= x0 || y1 <= y0) return false;
    var dx = s.x2 - s.x1, dy = s.y2 - s.y1, p = [-dx, dx, -dy, dy], q = [s.x1 - x0, x1 - s.x1, s.y1 - y0, y1 - s.y1], u0 = 0, u1 = 1;
    for (var i = 0; i < 4; i++) {
      if (Math.abs(p[i]) < 1e-12) { if (q[i] < 0) return false; }
      else { var u = q[i] / p[i]; if (p[i] < 0) { if (u > u1) return false; if (u > u0) u0 = u; } else { if (u < u0) return false; if (u < u1) u1 = u; } }
    }
    return u1 - u0 > 1e-9;
  }
  /* CONFERÊNCIA DA FOLHA:
     - texto × texto e texto × cota/chamada (de outro grupo);
     - FORA DA ÁREA: texto do desenho fora da área de desenho (inclui cruzar a linha da coluna), texto da coluna fora
       da coluna (acima do carimbo), texto de tabela fora da sua célula, texto do carimbo fora do carimbo ou cruzando
       uma linha dele (passou da célula). Tolerância 0,3 mm. */
  function sobreposicoes(f) {
    var cx = f.caixasTexto || [], cs = f.segmentosCota || [], out = [], i, j, tol = 0.3;
    for (i = 0; i < cx.length; i++) for (j = i + 1; j < cx.length; j++) if (boxBox(cx[i], cx[j], 0.1)) out.push({ tipo: "texto-texto", a: cx[i].s, b: cx[j].s, x: r2(cx[i].x0), y: r2(cx[i].y0) });
    for (i = 0; i < cx.length; i++) for (j = 0; j < cs.length; j++) if ((!cx[i].g || cx[i].g !== cs[j].g) && segBox(cs[j], cx[i], 0.1)) out.push({ tipo: "texto-cota", a: cx[i].s, b: cs[j].g || "cota", x: r2(cx[i].x0), y: r2(cx[i].y0) });
    var g = f._geo;
    if (g) {
      var A = { x0: g.area.x, x1: g.area.x + g.area.w, y0: g.area.y, y1: g.area.y + g.area.h }, C = { x0: g.coluna.x, x1: g.coluna.x + g.coluna.w, y0: g.coluna.y, y1: g.carimbo.y };
      var K = { x0: g.carimbo.x, x1: g.carimbo.x + g.carimbo.w, y0: g.carimbo.y, y1: g.carimbo.y + g.carimbo.h };
      cx.forEach(function (c) {
        var caixa = c.cel || (c.zona === "coluna" ? C : A), onde = c.cel ? "célula da tabela" : (c.zona === "coluna" ? "coluna da direita" : "área de desenho");
        if (!dentro(c, caixa, tol)) out.push({ tipo: "fora-da-area", a: c.s, b: onde, x: r2(c.x0), y: r2(c.y0) });
      });
      var lc = f.linhasCarimbo || [];
      (f.caixasCarimbo || []).forEach(function (c) {
        if (!dentro(c, K, 0.05)) { out.push({ tipo: "fora-da-area", a: c.s, b: "carimbo", x: r2(c.x0), y: r2(c.y0) }); return; }
        for (var k = 0; k < lc.length; k++) if (segBox(lc[k], c, 0.15)) { out.push({ tipo: "fora-da-area", a: c.s, b: "linha do carimbo", x: r2(c.x0), y: r2(c.y0) }); return; }
      });
    }
    return out;
  }

  /* ---- SVG ---- */
  var DASH = { TRACEJADO: "3 1.5", "TRACO-PONTO": "9.6 1.6 0.2 1.6" };
  DP.svg = function () {
    var out = [], pats = {}, defs = [], M = this.modelo;
    function corCam(c) { var L = layer(c); if (L.marca) return (M.cores && M.cores[L.marca]) || PRETO; return L.aci === 8 ? "#777" : (L.aci === 9 ? "#888" : (L.aci === 1 && c === "BLK-PENDENTE" ? VERMELHO : PRETO)); }
    function traco(c, lt) { var L = layer(c), d = lt || L.lt; return 'stroke="' + corCam(c) + '" stroke-width="' + L.pena + '" fill="none"' + (d && DASH[d] ? ' stroke-dasharray="' + DASH[d] + '"' : ""); }
    this.e.forEach(function (o) {
      if (o.t === "L") out.push('<line x1="' + o.p[0] + '" y1="' + o.p[1] + '" x2="' + o.p[2] + '" y2="' + o.p[3] + '" ' + traco(o.c, o.lt) + "/>");
      else if (o.t === "P") out.push('<polyline points="' + o.pts.map(function (p) { return p[0] + "," + p[1]; }).join(" ") + (o.f ? " " + o.pts[0][0] + "," + o.pts[0][1] : "") + '" ' + traco(o.c, o.lt) + "/>");
      else if (o.t === "C") out.push('<circle cx="' + o.x + '" cy="' + o.y + '" r="' + o.r + '" ' + (o.cheio ? 'fill="' + corCam(o.c) + '" stroke="none"' : traco(o.c)) + "/>");
      else if (o.t === "F") out.push('<rect x="' + o.x + '" y="' + o.y + '" width="' + o.w + '" height="' + o.h + '" fill="' + corCam(o.c) + '" stroke="none"/>');
      else if (o.t === "H") {
        var id = "h" + String(o.esp).replace(".", "_");
        if (!pats[id]) { pats[id] = 1; defs.push('<pattern id="' + id + '" patternUnits="userSpaceOnUse" width="' + o.esp + '" height="' + o.esp + '" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="' + o.esp + '" stroke="#555" stroke-width="' + layer("EST-HACHURA").pena + '"/></pattern>'); }
        out.push('<polygon points="' + o.pts.map(function (p) { return p[0] + "," + p[1]; }).join(" ") + '" fill="url(#' + id + ')" stroke="none"/>');
      } else if (o.t === "T") {
        /* texto PRETO (o padrão imprime em preto; pendência em vermelho), com o contorno que dá a pena à RomanS */
        var cor = o.cor || PRETO, peso = o.peso != null ? o.peso : Math.round(0.022 * o.h * 1000) / 1000;
        out.push('<text x="' + o.x + '" y="' + o.y + '" font-size="' + o.h + '" fill="' + cor + '"' + (peso > 0 ? ' stroke="' + cor + '" stroke-width="' + peso + '"' : "") +
          (o.al === "C" ? ' text-anchor="middle"' : (o.al === "D" ? ' text-anchor="end"' : "")) +
          (o.ang ? ' transform="rotate(-90 ' + o.x + " " + o.y + ')"' : "") + ">" + esc(o.s) + "</text>");
      }
    });
    return (defs.length ? "<defs>" + defs.join("") + "</defs>" : "") + out.join("");
  };

  /* ================================================================ TÍTULO DE DESENHO (título + escala abaixo, como a metálica) */
  var TITULO_H = 12;   /* altura reservada ao título de uma linha + escala (mm) */
  function linhasTitulo(titulo, wmax) { return wmax ? quebrar(titulo, PADRAO.textos.titulo, wmax) : [titulo]; }
  function alturaTitulo(titulo, wmax) { return TITULO_H + (linhasTitulo(titulo, wmax).length - 1) * PADRAO.textos.titulo * 1.3; }
  function tituloDesenho(D, x, y, titulo, escala, wmax) {
    var T = PADRAO.textos, yy = y + T.titulo * 0.8;
    linhasTitulo(titulo, wmax).forEach(function (s, i) { if (i) yy += T.titulo * 1.3; D.texto(x, yy, s, T.titulo, "EST-TITULO", { al: "E", peso: 0.16 }); });
    if (escala) D.texto(x, yy + T.titulo * 0.25 + 1.4 + T.escala * 0.8, escala, T.escala, "EST-TEXTO", { al: "E" });
    return alturaTitulo(titulo, wmax);
  }

  /* ================================================================ TABELAS (com grade, como as da metálica)
     cab: ["A","B",["COMPR","UNIT"]] (array = cabeçalho em linhas); linhas: arrays, {titulo:"..."} ou {total:[...]};
     o.al: alinhamento por coluna (E/C/D); o.larguras: largura mínima por coluna (blocos lado a lado alinhados).
     Cada texto leva a CÉLULA dele (sobreposicoes confere que não passa dela). Modelo Blocok: cabeçalho com o fundo azul
     da marca e a letra branca. */
  var PAD = 1.3;
  function medirTabela(cab, linhas, o) {
    o = o || {}; var T = PADRAO.textos, h = o.h || T.tabela, hc = o.hc || T.cabecalho, hl = o.hl || Math.max(4.4, h * 1.85), nc = cab.length, cw = [], j;
    function lc(c) { return Array.isArray(c) ? c : [c]; }
    for (j = 0; j < nc; j++) {
      var w = 0; lc(cab[j]).forEach(function (s) { w = Math.max(w, larg(s, hc)); });
      linhas.forEach(function (l) { var c = Array.isArray(l) ? l[j] : (l && l.total ? l.total[j] : null); if (c != null) w = Math.max(w, larg(c, h)); });
      cw.push(w + 2 * PAD);
    }
    if (o.larguras) o.larguras.forEach(function (v, i) { if (v) cw[i] = Math.max(cw[i], v); });
    var W = cw.reduce(function (a, b) { return a + b; }, 0);
    linhas.forEach(function (l) { if (l && l.titulo) { var need = larg(l.titulo, h) + 2 * PAD; if (need > W) { cw[nc - 1] += need - W; W = need; } } });
    var nHc = cab.reduce(function (m, c) { return Math.max(m, lc(c).length); }, 1), hCab = nHc * hc * 1.3 + 2.4;
    return { w: W, h: hCab + linhas.length * hl, cw: cw, hCab: hCab, hl: hl, h0: h, hc: hc, nHc: nHc };
  }
  function tabela(D, x, y, cab, linhas, o) {
    o = o || {}; var m = medirTabela(cab, linhas, o), cw = m.cw, nc = cab.length, al = o.al || [], cam = "EST-TABELA", j, M = D.modelo;
    var h = m.h0, hc = m.hc, hl = m.hl, W = m.w, hCab = m.hCab, xs = [x];
    for (j = 0; j < nc; j++) xs.push(xs[j] + cw[j]);
    function lc(c) { return Array.isArray(c) ? c : [c]; }
    function cel(x0, y0, w, hh) { return { x0: x0, y0: y0, x1: x0 + w, y1: y0 + hh }; }
    var azul = M && M.cabecalho ? "BLK-MARCA-" + M.cabecalho.toUpperCase() : null;
    if (azul) D.fundo(x, y, W, hCab, azul);
    /* cabeçalho */
    D.linha(x, y, x + W, y, cam);
    for (j = 0; j < nc; j++) {
      var ls = lc(cab[j]), c0 = cel(xs[j], y, cw[j], hCab), y0 = y + hCab / 2 - (ls.length - 1) * hc * 1.3 / 2 + 0.3 * hc;
      ls.forEach(function (s, k) { D.texto((xs[j] + xs[j + 1]) / 2, y0 + k * hc * 1.3, s, hc, azul ? "BLK-MARCA-TEXTO" : "EST-TEXTO", { al: "C", cel: c0, cor: azul ? "#fff" : null, peso: azul ? 0.06 : 0.09 }); });
    }
    var yy = y + hCab;
    D.linha(x, yy, x + W, yy, cam);
    for (j = 0; j <= nc; j++) D.linha(xs[j], y, xs[j], yy, cam);
    linhas.forEach(function (l) {
      var by = yy + hl / 2 + 0.3 * h;
      if (l && l.titulo) {
        D.texto(x + PAD, by, l.titulo, h, "EST-TITULO", { al: "E", cel: cel(x, yy, W, hl), peso: 0.1 });
        D.linha(x, yy, x, yy + hl, cam); D.linha(x + W, yy, x + W, yy + hl, cam);
      } else {
        var cl = Array.isArray(l) ? l : l.total;
        for (j = 0; j <= nc; j++) D.linha(xs[j], yy, xs[j], yy + hl, cam);
        for (j = 0; j < nc; j++) {
          var c = cl[j]; if (c == null || c === "") continue; var a = al[j] || "E", cc = cel(xs[j], yy, cw[j], hl), op = { al: a, cel: cc, peso: Array.isArray(l) ? null : 0.1 };
          if (a === "D") D.texto(xs[j + 1] - PAD, by, c, h, "EST-TEXTO", op);
          else if (a === "C") D.texto((xs[j] + xs[j + 1]) / 2, by, c, h, "EST-TEXTO", op);
          else D.texto(xs[j] + PAD, by, c, h, "EST-TEXTO", op);
        }
      }
      yy += hl;
      D.linha(x, yy, x + W, yy, cam);
    });
    return { x: x, y: y, w: W, h: yy - y, cw: cw };
  }

  /* ================================================================ DADOS DA OBRA */
  function parseArm(s) {   /* "4 φ10 (3,14 cm²)" / "2 φ10 (1,57 cm²) por face" → {n, bit, porFace} */
    /* cinta: "inferior 3 φ8 (…) · superior nos apoios 2 φ8 (…) · lateral 2 φ8 (…) por face" → vale o 1º trecho (armadura inferior) */
    var s0 = txt(s).split("·")[0], m = /(\d+)\s*[φØø]\s*([\d.,]+)/.exec(s0); if (!m) return null;
    var por = /\)\s*por face/i.test(s0), n = +m[1] * (por ? 2 : 1);
    return { n: n, bit: +m[2].replace(",", "."), porFace: por, txt: s0.replace(/\s*\(.*?\)/, "") };
  }
  function grau(bit) { return Math.abs(bit - 5) < 1e-9 ? "60B" : "50A"; }
  function nomeTipoPeca(t) { return (PADRAO.tiposPeca[t] || { nome: t }).nome; }
  function codTipo(t) { return (PADRAO.tiposPeca[t] || { cod: "" }).cod; }
  /* armadura do cálculo escrita como no desenho: "2 φ8 (1,01 cm²)" → "2 Ø 8 (1,01 cm²)" */
  function armTxt(s) { return txt(s).replace(/φ\s*/g, "Ø "); }
  /* quantitativo de aço da parede: entradas {elemento, barras, bitola, comprimento, kg} */
  function acoDe(w) { return arr(w.pag && w.pag.quant && w.pag.quant.aco); }
  /* o quantitativo traz o elemento por nome ("pilarete PL1", "estribos PL1", "verga V-PT1", "porta-estribo V-PT1",
     "cinta CR", "estribos cinta"...): agrupa pelo id do reforço da parede (papel: main / porta / estribo) */
  function chaveQuant(w, nome) {
    var mc = /^cinta\s+(.+?)\s+[—-]\s+(inferior|superior|lateral)/.exec(txt(nome));   /* "cinta CR — inferior" / "— superior (negativo)" / "— lateral (vento)" */
    if (mc) return { id: mc[1], papel: mc[2] === "inferior" ? "main" : (mc[2] === "superior" ? "sup" : "lat") };
    var m = /^(pilarete|verga|viga|contraverga|cinta de respaldo|cinta|estribos|porta-estribo)\s+(.+)$/.exec(txt(nome));
    if (!m) return null;
    var papel = m[1] === "estribos" ? "estribo" : (m[1] === "porta-estribo" ? "porta" : "main"), id = m[2], R = (w.pag && w.pag.reforcos) || {};
    if (id === "cinta" || id === "cinta de respaldo") id = (arr(R.cintas)[0] || { id: id }).id;
    return { id: id, papel: papel };
  }
  function entradasDe(w, id) {   /* entradas do quantitativo de um reforço, em ordem, já com a posição Nn */
    var out = { all: [], main: null, estribo: null, porta: null, sup: null, lat: null };
    acoDe(w).forEach(function (a) {
      var k = chaveQuant(w, a.elemento); if (!k || k.id !== id) return;
      var e = { e: a, papel: k.papel, pos: out.all.length + 1 }; out.all.push(e);
      if (!out[k.papel]) out[k.papel] = e;
    });
    return out;
  }
  function deConjunto(w, tipo, id) {
    if (tipo === "pilarete") return arr(w.pilaretes).filter(function (x) { return x.id === id; })[0] || null;
    if (tipo === "verga") return arr(w.vergas).filter(function (x) { return x.id === id; })[0] || null;
    if (tipo === "contraverga") return arr(w.contravergas).filter(function (x) { return x.id === id; })[0] || null;
    return w.cinta || null;
  }
  /* reforços de uma parede, com os dois lados (cálculo e quantitativo) */
  function reforcosDe(w) {
    var R = w.pag.reforcos, out = [];
    function add(tipo, lista) {
      arr(lista).forEach(function (r) {
        if (tipo === "pilarete" && r.dono === false) return;
        var calc = deConjunto(w, tipo, r.id), en = entradasDe(w, r.id), q = en.main ? en.main.e : null, est = en.estribo ? en.estribo.e : null, porta = en.porta ? en.porta.e : null;
        var ac = calc ? parseArm(calc.armadura) : null, status = "sem cálculo";
        if (ac && q) status = (ac.n === q.barras && Math.abs(ac.bit - q.bitola) < 1e-9) ? "confere" : "difere";
        if (status === "confere" && tipo === "cinta" && calc.arranjoNeg) {   /* a armadura superior (negativo) também tem que bater */
          var qs = en.sup ? en.sup.e : null;
          if (!qs || qs.barras !== calc.arranjoNeg.n || Math.abs(qs.bitola - calc.arranjoNeg.phi) > 1e-9) status = "difere";
        }
        if (!ac && !q && tipo === "verga" && calc && calc.naCinta) status = "na cinta";
        out.push({ tipo: tipo, r: r, calc: calc, arm: ac, q: q, est: est, porta: porta, en: en, status: status });
      });
    }
    add("pilarete", R.pilaretes); add("verga", R.vergas); add("contraverga", R.contravergas); add("cinta", R.cintas);
    return out;
  }
  function nomeReforco(tipo) { return { pilarete: "pilarete", verga: "verga", contraverga: "contraverga", cinta: "cinta" }[tipo]; }
  function aviso(av, s) { if (av.indexOf(s) < 0) av.push(s); }

  /* ================================================================ COLUNA DA DIREITA (LEGENDA, NOTAS, NORMAS)
     Encostada no carimbo, como a metálica; letra 2,5 mm (padrão), reduz até 2,1 mm (a menor do padrão) se não couber.
     Modelo Blocok: faixa da marca no topo da coluna ("SISTEMA BLOCOK"). */
  function quebrar(s, h, wmax) {
    var pal = txt(s).split(/\s+/), ls = [], cur = "";
    pal.forEach(function (p) { if (!p) return; var t = cur ? cur + " " + p : p; if (larg(t, h) > wmax && cur) { ls.push(cur); cur = p; } else cur = t; });
    if (cur) ls.push(cur); return ls;
  }
  var BANDA_COLUNA = 14;   /* altura da faixa do modelo Blocok no topo da coluna (mm) */
  function medirColuna(geo, blocos, modelo) {
    var col = geo.coluna, car = geo.carimbo, T = PADRAO.textos, wmax = col.w - 8, yMax = car.y - 3, yMin = col.y + 4 + (modelo && modelo.sistema ? BANDA_COLUNA + 2 : 0);
    function medir(h) {
      var hq = Math.min(T.quadro, h * 3), tot = 0;
      blocos.forEach(function (b) {
        tot += hq * 0.8 + hq * 0.5 + 1.5;
        (b.itens || []).forEach(function (it, i) { var pre = b.numerar ? (i + 1) + "- " : "- "; tot += quebrar(it, h, wmax - larg(pre, h)).length * h * 1.42 + 0.7; });
        if (b.exemplos) tot += b.exemplos(null, 0, 0, h);
        tot += 3.5;
      });
      return tot;
    }
    var tent = [T.nota, 2.3, T.trecho];
    for (var i = 0; i < tent.length; i++) if (medir(tent[i]) <= yMax - yMin) return { cabe: true, h: tent[i], tot: medir(tent[i]), yMax: yMax, wmax: wmax };
    return { cabe: false, h: tent[tent.length - 1], tot: medir(tent[tent.length - 1]), yMax: yMax, wmax: wmax };
  }
  function colunaNotas(D, geo, blocos, avisos, rotuloFolha) {
    var col = geo.coluna, T = PADRAO.textos, x0 = col.x + 4, M = D.modelo, md = medirColuna(geo, blocos, M), h = md.h, hq = Math.min(T.quadro, h * 3), wmax = md.wmax;
    var zona0 = D.zona; D.zona = "coluna";
    if (!md.cabe) aviso(avisos, "Coluna de notas não cabe na folha " + (rotuloFolha || "") + " com a letra mínima do padrão: conferir.");
    if (M && M.sistema) {
      D.fundo(col.x, col.y, col.w, BANDA_COLUNA, "BLK-MARCA-MARINHO");
      D.linha(col.x, col.y + BANDA_COLUNA + 0.6, col.x + col.w, col.y + BANDA_COLUNA + 0.6, "BLK-MARCA-DOURADO");
      D.texto(x0, col.y + 6.6, M.sistema, T.titulo, "BLK-MARCA-TEXTO", { al: "E", cor: "#fff", peso: 0.16 });
      D.texto(x0, col.y + 11.4, "PROJETO EXECUTIVO DE ALVENARIA", T.nota, "BLK-MARCA-TEXTO", { al: "E", cor: "#fff", peso: 0.05 });
    }
    var y = md.yMax - md.tot;
    blocos.forEach(function (b) {
      D.texto(x0, y + hq * 0.8, b.titulo, hq, "EST-TITULO", { al: "E", peso: 0.28 }); y += hq * 0.8 + hq * 0.5 + 1.5;
      (b.itens || []).forEach(function (it, i) {
        var pre = b.numerar ? (i + 1) + "- " : "- ", rec = larg(pre, h);
        D.texto(x0, y + h * 0.8, pre, h, "EST-TEXTO", { al: "E" });
        quebrar(it, h, wmax - rec).forEach(function (s) { D.texto(x0 + rec, y + h * 0.8, s, h, "EST-TEXTO", { al: "E" }); y += h * 1.42; });
        y += 0.7;
      });
      if (b.exemplos) y += b.exemplos(D, x0, y, h);
      y += 3.5;
    });
    D.zona = zona0;
    return md.cabe;
  }

  /* ================================================================ ELEVAÇÃO DA PAREDE (folha de paginação) */
  function subRect(a, b) {   /* a − b (retângulos x,y,w,h em metros) */
    var x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y), x1 = Math.min(a.x + a.w, b.x + b.w), y1 = Math.min(a.y + a.h, b.y + b.h);
    if (x1 - x0 <= 1e-9 || y1 - y0 <= 1e-9) return [a];
    var out = [];
    if (x0 - a.x > 1e-9) out.push({ x: a.x, y: a.y, w: x0 - a.x, h: a.h });
    if (a.x + a.w - x1 > 1e-9) out.push({ x: x1, y: a.y, w: a.x + a.w - x1, h: a.h });
    if (y0 - a.y > 1e-9) out.push({ x: x0, y: a.y, w: x1 - x0, h: y0 - a.y });
    if (a.y + a.h - y1 > 1e-9) out.push({ x: x0, y: y1, w: x1 - x0, h: a.y + a.h - y1 });
    return out;
  }
  function livresDaPeca(p, bloq) {
    var lista = [{ x: p.x, y: p.y, w: p.w, h: p.h }];
    arr(p.furos).concat(bloq).forEach(function (b) {
      var nova = []; lista.forEach(function (f) { nova = nova.concat(subRect(f, b)); }); lista = nova;
    });
    return lista;
  }
  /* contorno da peça: retângulo ou "L" (furo em um canto) */
  function contornoPeca(p) {
    var fs = arr(p.furos).map(function (f) {
      var x0 = Math.max(p.x, f.x), y0 = Math.max(p.y, f.y), x1 = Math.min(p.x + p.w, f.x + f.w), y1 = Math.min(p.y + p.h, f.y + f.h);
      return (x1 - x0 > 1e-6 && y1 - y0 > 1e-6) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
    }).filter(Boolean), e = 1e-6, X0 = p.x, X1 = p.x + p.w, Y0 = p.y, Y1 = p.y + p.h;
    if (fs.length === 1) {
      var f = fs[0], l = Math.abs(f.x - X0) < e, r = Math.abs(f.x + f.w - X1) < e, b = Math.abs(f.y - Y0) < e, t = Math.abs(f.y + f.h - Y1) < e;
      if ((l || r) && (b || t) && !(l && r) && !(b && t)) {
        if (l && b) return { poly: [[f.x + f.w, Y0], [X1, Y0], [X1, Y1], [X0, Y1], [X0, f.y + f.h], [f.x + f.w, f.y + f.h]], extras: [] };
        if (r && b) return { poly: [[X0, Y0], [f.x, Y0], [f.x, f.y + f.h], [X1, f.y + f.h], [X1, Y1], [X0, Y1]], extras: [] };
        if (l && t) return { poly: [[X0, Y0], [X1, Y0], [X1, Y1], [f.x + f.w, Y1], [f.x + f.w, f.y], [X0, f.y]], extras: [] };
        if (r && t) return { poly: [[X0, Y0], [X1, Y0], [X1, f.y], [f.x, f.y], [f.x, Y1], [X0, Y1]], extras: [] };
      }
    }
    return { poly: [[X0, Y0], [X1, Y0], [X1, Y1], [X0, Y1]], extras: fs };
  }

  /* mede o bloco de uma parede numa escala (mm de papel): título, elevação com cotas, tabela de peças (em colunas da
     largura do bloco, todas com as mesmas larguras) e totais. Origem no canto superior esquerdo do bloco. */
  var CAB_PECAS = ["CÓDIGO", "FIADA", "DIMENSÕES (cm)", "TIPO", "PESO (kg)", "REFORÇO"], AL_PECAS = ["E", "C", "C", "E", "D", "E"];
  var CAB_TOT = ["PEÇAS", "PLACAS A COMPRAR", "ÁREA (m²)", "PESO DAS PEÇAS (kg)", "CONCRETO (m³)", "AÇO (kg)"];
  function subtituloParede(pag, esc0) {
    return "ESCALA 1:" + esc0 + "  |  e = " + cmTxt(pag.espessura / 100) + " cm  |  " + mTxt(pag.comprimento) + " x " + mTxt(pag.altura) + " m  |  extremidades: início " + txt(pag.ini && pag.ini.tipo) + ", fim " + txt(pag.fim && pag.fim.tipo);
  }
  function medirParede(w, esc0) {
    var T = PADRAO.textos, s = 1000 / esc0, pag = w.pag, xs = [];
    pag.pecas.forEach(function (p) { xs.push(p.x, p.x + p.w); });
    var R = pag.reforcos; [].concat(R.pilaretes, R.vergas, R.contravergas, R.cintas).forEach(function (r) { xs.push(r.x, r.x + r.w); });
    var xmin = Math.min.apply(null, xs), xmax = Math.max.apply(null, xs);
    var LM = 34, RM = 12, Wmm = (xmax - xmin) * s, Hmm = pag.altura * s, gap = 8;
    var linhas = pag.pecas.map(function (p) {
      var dims = cmTxt(p.w) + " x " + cmTxt(p.h) + (p.tipo === "recorte-L" ? " (L)" : "");
      return [p.cod, String(p.fiada), dims, nomeTipoPeca(p.tipo), br(p.peso, 1), arr(p.reforcos).join(", ") || "-"];
    });
    var q = pag.quant, tot = [[String(q.pecas), String(q.placasCompra), br(q.areaPecas, 2), br(q.pesoPecasKg, 1), br(q.concretoM3, 3), br(q.acoKg, 1)]];
    var t0 = medirTabela(CAB_PECAS, linhas), tt = medirTabela(CAB_TOT, tot), titulo = "PAREDE " + pag.id + (w.nome ? " - " + w.nome : ""), sub = subtituloParede(pag, esc0);
    var wElev = LM + Wmm + RM, wBloco = Math.max(wElev, t0.w, tt.w, larg(titulo, T.titulo), larg(sub, T.escala));
    var nB = Math.max(1, Math.min(linhas.length, Math.floor((wBloco + gap) / (t0.w + gap)))), rows = Math.ceil(linhas.length / nB);
    nB = Math.ceil(linhas.length / rows);
    var hTab = medirTabela(CAB_PECAS, linhas.slice(0, rows), { larguras: t0.cw }).h;
    /* faixas verticais do bloco (mm): título + escala (até 9) · cotas dos pilaretes (yTop − 15,5 a yTop) · elevação ·
       cotas de baixo (até yBase + 22) · título da tabela de peças · tabela · título dos totais · totais */
    var yTop = 25.5, yBase = yTop + Hmm, yTabT = yBase + 25, yTab = yTabT + 4.5, yTotT = yTab + hTab + 6, yTot = yTotT + 4.5;
    return { s: s, esc: esc0, xmin: xmin, xmax: xmax, LM: LM, RM: RM, Wmm: Wmm, Hmm: Hmm, wElev: wElev, w: wBloco, h: yTot + tt.h,
      linhas: linhas, tot: tot, larguras: t0.cw, wTab: t0.w, nB: nB, rows: rows, gap: gap, titulo: titulo, sub: sub,
      yTop: yTop, yBase: yBase, yTabT: yTabT, yTab: yTab, yTotT: yTotT, yTot: yTot };
  }

  function desenharParede(D, w, m, ox, oy, avisos) {
    var T = PADRAO.textos, pag = w.pag, s = m.s, R = pag.reforcos;
    var xw0 = ox + Math.max(0, (m.w - m.wElev) / 2) + m.LM;   /* elevação centrada no bloco */
    var yTop = oy + m.yTop, yBase = oy + m.yBase;
    function X(v) { return xw0 + (v - m.xmin) * s; }
    function Y(v) { return yBase - v * s; }
    /* título e escala (subtítulo) */
    D.texto(ox, oy + T.titulo * 0.8, m.titulo, T.titulo, "EST-TITULO", { al: "E", peso: 0.16 });
    D.texto(ox, oy + T.titulo * 0.8 + T.titulo * 0.25 + 1.4 + T.escala * 0.8, m.sub, T.escala, "EST-TEXTO", { al: "E" });
    /* faixas de reforço (retângulos em m) */
    var bandas = [];
    [["pilarete", R.pilaretes], ["verga", R.vergas], ["contraverga", R.contravergas], ["cinta", R.cintas]].forEach(function (par) {
      arr(par[1]).forEach(function (r) { bandas.push({ tipo: par[0], id: r.id, x: r.x, y: r.y, w: r.w, h: r.h, horiz: r.w > r.h }); });
    });
    /* peças */
    var semLugar = [];
    pag.pecas.forEach(function (p) {
      var c = contornoPeca(p), pts = c.poly.map(function (q) { return [X(q[0]), Y(q[1])]; });
      D.poli(pts, "EST-FORMA-VISTA", true);
      c.extras.forEach(function (f) { D.ret(X(f.x), Y(f.y + f.h), f.w * s, f.h * s, "EST-OCULTA"); });
    });
    /* vãos */
    arr(pag.vaos).forEach(function (v) {
      var x = X(v.x), y = Y(v.y + v.h), W = v.w * s, H = v.h * s;
      D.ret(x, y, W, H, "EST-OCULTA");
      var ls = [{ s: v.id, h: T.nota }, { s: cmTxt(v.w) + " x " + cmTxt(v.h), h: T.trecho }];
      if (v.y > 0.01) ls.push({ s: "peitoril " + cmTxt(v.y), h: T.trecho });
      colocarLinhas(D, { x: x, y: y, w: W, h: H }, ls, "BLK-NUM", { avisos: avisos, ctx: "vão " + v.id });
    });
    /* rótulos das peças (no maior retângulo livre da peça, fora das faixas de reforço) */
    var bloq = bandas.map(function (b) { return { x: b.x, y: b.y, w: b.w, h: b.h }; });
    pag.pecas.forEach(function (p) {
      var frees = livresDaPeca(p, bloq).map(function (f) { return { x: X(f.x), y: Y(f.y + f.h), w: f.w * s, h: f.h * s }; });
      frees.sort(function (a, b) { return b.w * b.h - a.w * a.h; });
      var tp = codTipo(p.tipo), l2 = p.tipo === "inteira" ? "" : cmTxt(p.w) + "x" + cmTxt(p.h) + (tp ? " " + tp : "");
      var ls = [{ s: p.cod, h: T.notacao }]; if (l2) ls.push({ s: l2, h: T.trecho });
      var feito = false;
      for (var i = 0; i < frees.length && !feito; i++) feito = colocarLinhas(D, frees[i], ls, "BLK-NUM", { silencioso: true });
      if (!feito) for (i = 0; i < frees.length && !feito; i++) feito = colocarLinhas(D, frees[i], ls.slice(0, 1), "BLK-NUM", { silencioso: true });
      if (!feito) semLugar.push(p);
    });
    /* faixas de EPS retirado: contorno + hachura; a hachura abre uma janela para o rótulo da faixa e para o número das
       peças que ficam inteiramente atrás de uma faixa vertical (só a face aparece) */
    var restam = semLugar.slice(); semLugar = [];
    bandas.forEach(function (b) {
      var x = X(b.x), y = Y(b.y + b.h), W = b.w * s, H = b.h * s, h = T.nota, lw = larg(b.id, h) + 3, gaps = [];
      D.ret(x, y, W, H, "EST-FORMA-CORTE");
      if (!b.horiz) {
        restam = restam.filter(function (p) {
          var cxp = p.x + p.w / 2;
          if (!(cxp >= b.x - 1e-6 && cxp <= b.x + b.w + 1e-6)) return true;
          var wt = larg(p.cod, T.notacao) + 3, cyp = Y(p.y + p.h / 2);
          if (wt > p.h * s - 1 || T.notacao * 1.2 > W) return true;
          D.texto(x + W / 2 + 0.35 * T.notacao, cyp, p.cod, T.notacao, "BLK-NUM", { al: "C", ang: 90 });
          gaps.push([cyp - wt / 2, cyp + wt / 2]);
          return false;
        });
      }
      /* posição do rótulo da faixa: a primeira que não encosta em outra faixa nem em outro texto */
      var comp = b.horiz ? W : H, ok = false, pos = 0, tries = [0.5, 0.3, 0.7, 0.15, 0.85, 0.4, 0.6, 0.22, 0.78, 0.05, 0.95], k;
      for (k = 0; k < tries.length && !ok; k++) {
        pos = tries[k];
        var ctr = b.horiz ? { x0: x + comp * pos - lw / 2, x1: x + comp * pos + lw / 2, y0: y, y1: y + H } : { x0: x, x1: x + W, y0: y + comp * pos - lw / 2, y1: y + comp * pos + lw / 2 };
        if (comp * pos - lw / 2 < 0.5 || comp * pos + lw / 2 > comp - 0.5) continue;
        ok = true;
        bandas.forEach(function (o) {
          if (o === b) return;
          var ob = { x0: X(o.x), x1: X(o.x) + o.w * s, y0: Y(o.y + o.h), y1: Y(o.y + o.h) + o.h * s };
          if (boxBox(ctr, ob, 0.2)) ok = false;
        });
        D.cx.forEach(function (cxb) { if (boxBox(ctr, cxb, 0.2)) ok = false; });
      }
      if (!ok) { pos = 0.5; aviso(avisos, "Parede " + pag.id + ": faixa " + b.id + " sem lugar livre para o rótulo."); }
      var lo = comp * pos - lw / 2, hi = comp * pos + lw / 2;
      if (b.horiz) { gaps.push([x + lo, x + hi]); D.texto(x + comp * pos, y + H / 2 + 0.35 * h, b.id, h, "EST-ARM-TEXTO", { al: "C" }); }
      else { gaps.push([y + lo, y + hi]); D.texto(x + W / 2 + 0.35 * h, y + comp * pos, b.id, h, "EST-ARM-TEXTO", { al: "C", ang: 90 }); }
      /* hachura nos trechos fora das janelas */
      gaps.sort(function (p, q) { return p[0] - q[0]; });
      var c0 = b.horiz ? x : y, c1 = b.horiz ? x + W : y + H, cur = c0;
      gaps.forEach(function (g) {
        if (g[0] > cur) { if (b.horiz) D.hachRet(cur, y, g[0] - cur, H); else D.hachRet(x, cur, W, g[0] - cur); }
        cur = Math.max(cur, g[1]);
      });
      if (c1 > cur) { if (b.horiz) D.hachRet(cur, y, c1 - cur, H); else D.hachRet(x, cur, W, c1 - cur); }
    });
    semLugar = restam;
    /* fiadas: tag na direita */
    pag.fiadas.forEach(function (f) { D.texto(X(m.xmax) + 3, Y(f.y + f.h / 2) + 0.35 * T.nota, "F" + f.n, T.nota, "EST-TEXTO", { al: "E" }); });
    /* base */
    D.linha(X(m.xmin) - 3, yBase, X(m.xmax) + 3, yBase, "EST-FORMA-CORTE");
    /* cotas verticais à esquerda: alturas acumuladas das fiadas e altura total */
    var xl = X(m.xmin), xc1 = xl - 12, xc2 = xl - 25, g1 = D.novoGrupo("c"), niv = [0].concat(pag.fiadas.map(function (f) { return f.y + f.h; }));
    D.linha(xc1, Y(niv[niv.length - 1]), xc1, Y(0), "EST-COTA"); D.seg(xc1, Y(niv[niv.length - 1]), xc1, Y(0), g1);
    niv.forEach(function (v) {
      D.linha(xl - 1, Y(v), xc1 - 1.5, Y(v), "EST-COTA"); D.seg(xl - 1, Y(v), xc1 - 1.5, Y(v), g1); D.ponto(xc1, Y(v));
      if (v > 0) { var tt = cmTxt(v), g = D.novoGrupo("ta"); D.texto(xc1 - 0.8, Y(v) + 1.2 + larg(tt, T.cota), tt, T.cota, "EST-COTA", { al: "E", ang: 90, g: g }); }
    });
    D.cotaV(Y(pag.altura), yBase, xc2, xl, cmTxt(pag.altura), null);
    /* cotas horizontais embaixo: vãos a partir do eixo inicial; total */
    var pts = [0], i0;
    arr(pag.vaos).slice().sort(function (a, b) { return a.x - b.x; }).forEach(function (v) { pts.push(v.x, v.x + v.w); });
    pts.push(pag.comprimento); pts = pts.filter(function (v, i) { return i === 0 || v - pts[i - 1] > 1e-6; });
    var yc1 = yBase + 9, yc2 = yBase + 20;
    for (i0 = 0; i0 + 1 < pts.length; i0++) D.cotaH(X(pts[i0]), X(pts[i0 + 1]), yc1, yBase, cmTxt(pts[i0 + 1] - pts[i0]), null, i0 === 0 ? {} : { semExt: false });
    D.cotaH(X(0), X(pag.comprimento), yc2, yBase, cmTxt(pag.comprimento) + " (eixo a eixo)", null);
    /* cotas horizontais em cima: eixos dos pilaretes */
    var cs = arr(R.pilaretes).map(function (p) { return p.x + p.w / 2; }).sort(function (a, b) { return a - b; }), ycT = yTop - 9;
    for (i0 = 0; i0 + 1 < cs.length; i0++) D.cotaH(X(cs[i0]), X(cs[i0 + 1]), ycT, yTop, cmTxt(cs[i0 + 1] - cs[i0]), null);
    if (cs.length) D.texto(ox, ycT - 4.5, "eixos dos pilaretes (cm)", T.nota, "EST-TEXTO", { al: "E" });
    /* tabela de peças em blocos de colunas (mesmas larguras: as colunas ficam alinhadas) */
    D.texto(ox, oy + m.yTabT + T.cabecalho * 0.8, "PEÇAS DA PAREDE " + pag.id, T.cabecalho, "EST-TITULO", { al: "E", peso: 0.12 });
    var xt = ox, k;
    for (k = 0; k < m.nB; k++) {
      var parte = m.linhas.slice(k * m.rows, (k + 1) * m.rows); if (!parte.length) break;
      var tb = tabela(D, xt, oy + m.yTab, CAB_PECAS, parte, { al: AL_PECAS, larguras: m.larguras });
      xt += tb.w + m.gap;
    }
    /* totais */
    D.texto(ox, oy + m.yTotT + T.cabecalho * 0.8, "TOTAIS DA PAREDE " + pag.id, T.cabecalho, "EST-TITULO", { al: "E", peso: 0.12 });
    tabela(D, ox, oy + m.yTot, CAB_TOT, m.tot, { al: ["C", "C", "C", "C", "C", "C"] });
    /* peças atrás de faixa de reforço (só a face aparece): número fora da parede, com chamada */
    if (semLugar.length) {
      var kp = { x0: X(m.xmin) - 1, x1: X(m.xmax) + 1, y0: yTop - 1, y1: yBase + 1 };
      D.keep.push(kp);
      semLugar.forEach(function (p) {
        var cxp = X(p.x + p.w / 2), cyp = Y(p.y + p.h / 2), ok = D.rotulo(cxp, cyp, p.cod, T.notacao, "BLK-NUM", { angs: p.fiada <= 1 ? [90, 60, 120] : [-90, -60, -120] });
        if (!ok) aviso(avisos, "Parede " + pag.id + ": peça " + p.cod + " sem lugar livre para o número.");
      });
      D.keep.pop();
    }
  }
  /* coloca linhas de texto centradas num retângulo (mm); horizontal ou girada; reduz o corpo se preciso */
  function colocarLinhas(D, r, ls, cam, o) {
    o = o || {};
    var fat = [1, 0.85, 0.72, 0.6], f;
    for (f = 0; f < fat.length; f++) {
      var hs = ls.map(function (l) { return Math.max(PADRAO.textos.minimo, l.h * fat[f]); });
      if (f > 0 && hs[0] < PADRAO.textos.minimo - 1e-9) break;
      var Wt = 0, Ht = 0; ls.forEach(function (l, k) { Wt = Math.max(Wt, larg(l.s, hs[k])); Ht += hs[k] * 1.3; });
      /* horizontal */
      if (Wt <= r.w - 1.2 && Ht <= r.h - 1.2) {
        var y = r.y + (r.h - Ht) / 2;
        ls.forEach(function (l, k) { D.texto(r.x + r.w / 2, y + hs[k] * 0.95, l.s, hs[k], cam, { al: "C" }); y += hs[k] * 1.3; });
        return true;
      }
      /* girada */
      if (Ht <= r.w - 1.2 && Wt <= r.h - 1.2) {
        var x = r.x + (r.w - Ht) / 2;
        ls.forEach(function (l, k) { D.texto(x + hs[k] * 0.95, r.y + r.h / 2, l.s, hs[k], cam, { al: "C", ang: 90 }); x += hs[k] * 1.3; });
        return true;
      }
    }
    if (!o.silencioso && o.avisos) aviso(o.avisos, "Sem lugar livre para o texto de " + (o.ctx || "elemento") + ".");
    return false;
  }

  /* ================================================================ FORMATO E GRADE
     Cada folha escolhe o formato pelo próprio conteúdo: o menor (A3, A2, A1) em que o conteúdo cabe na escala do
     padrão E as notas cabem inteiras na coluna; A0 só quando nada couber no A1. Formato fixo pedido = só ele. */
  function geoDe(fmt) { var g = Prancha.geometria(fmt, "paisagem", "RA"); g.formato = fmt; return g; }
  function formatosDe(op, ateA0) {
    var f = txt(op.formato).toUpperCase();
    if (Prancha.FORMATOS[f] && f !== "A4") return [f];
    return ateA0 ? PADRAO.formatos.concat(["A0"]) : PADRAO.formatos.slice();
  }
  /* prateleiras: itens [{w, h}] em ordem → linhas; null se a altura passar */
  var RESPIRO = PADRAO.folha.respiro;
  function prateleiras(itens, area) {
    var linhas = [], ln = null, H = 0;
    for (var i = 0; i < itens.length; i++) {
      var it = itens[i];
      if (it.w > area.w + 1e-6) return null;
      if (ln && ln.w + RESPIRO + it.w <= area.w + 1e-6) { ln.itens.push(it); ln.w += RESPIRO + it.w; ln.h = Math.max(ln.h, it.h); continue; }
      ln = { itens: [it], w: it.w, h: it.h }; linhas.push(ln);
    }
    linhas.forEach(function (l, i) { H += (i ? RESPIRO : 0) + l.h; });
    if (H > area.h + 1e-6) return null;
    return { linhas: linhas, h: H, w: linhas.reduce(function (m, l) { return Math.max(m, l.w); }, 0) };
  }
  /* posiciona as prateleiras na área: o conjunto centrado; folga vertical repartida entre as linhas (até 40 mm);
     itens de cada linha encostados à esquerda do conjunto, com a folga horizontal repartida (até 40 mm) */
  function posicionar(pl, area) {
    var n = pl.linhas.length, livreV = area.h - pl.h, gV = n > 1 ? Math.min(40, livreV / (n + 1)) : 0, Htot = pl.h + gV * (n - 1);
    var y = area.y + (area.h - Htot) / 2, out = [];
    pl.linhas.forEach(function (l) {
      var k = l.itens.length, livreH = pl.w - l.w, gH = k > 1 ? Math.min(40, livreH / (k - 1)) : 0, x = area.x + (area.w - pl.w) / 2;
      l.itens.forEach(function (it) { out.push({ it: it, x: x, y: y }); x += it.w + RESPIRO + gH; });
      y += l.h + RESPIRO + gV;
    });
    return out;
  }

  /* ================================================================ FOLHAS DE PAGINAÇÃO */
  function planoPaginacao(r, op, avisos, notasPag, M) {
    var blocos = [], fmts = formatosDe(op, false), fmtsA0 = formatosDe(op, true), maior = fmts[fmts.length - 1];
    r.paredes.forEach(function (w) {
      if (!w.pag || !w.pag.pecas || !w.pag.pecas.length) { aviso(avisos, "Parede " + (w.id || "?") + " sem peças paginadas: sem folha de paginação."); return; }
      var m = null, fmtMin = null, i, j;
      function tenta(escs, lista) {
        for (i = 0; i < escs.length && !m; i++) {
          var t = medirParede(w, escs[i]);
          for (j = 0; j < lista.length; j++) { var a = geoDe(lista[j]).area; if (t.w <= a.w && t.h <= a.h) { m = t; fmtMin = lista[j]; break; } }
        }
      }
      tenta(PADRAO.escalas.paginacao, fmts);
      if (!m && fmtsA0.length > fmts.length) { tenta(PADRAO.escalas.paginacao, ["A0"]); if (m) aviso(avisos, "Parede " + w.pag.id + ": em 1:" + m.esc + " só cabe no A0 (" + mTxt(w.pag.comprimento) + " m)."); }
      if (!m) { tenta(PADRAO.escalas.paginacaoReserva, fmtsA0); if (m) aviso(avisos, "Parede " + w.pag.id + ": escala 1:" + m.esc + " (fora do 1:20/1:25 do padrão) porque o comprimento não cabe na folha."); }
      if (!m) { m = medirParede(w, 50); fmtMin = fmtsA0[fmtsA0.length - 1]; aviso(avisos, "Parede " + w.pag.id + " não cabe nem em 1:50 no " + fmtMin + ": conferir."); }
      blocos.push({ w: w, m: m, fmtMin: fmtMin, iw: m.w, ih: m.h });
    });
    /* agrupa em ordem: a folha recebe a parede seguinte enquanto couber num formato até o maior permitido */
    var ordem = ["A3", "A2", "A1", "A0"];
    function cabeEm(lista, fmt) {
      var g = geoDe(fmt), pl = prateleiras(lista.map(function (b) { return { w: b.m.w, h: b.m.h, b: b }; }), g.area);
      return pl && medirColuna(g, notasPag, M).cabe ? { g: g, pl: pl } : null;
    }
    function menorFormato(lista) {
      var minIdx = 0; lista.forEach(function (b) { minIdx = Math.max(minIdx, ordem.indexOf(b.fmtMin)); });
      var cands = fmtsA0.filter(function (f) { return ordem.indexOf(f) >= minIdx; });
      for (var i = 0; i < cands.length; i++) { var c = cabeEm(lista, cands[i]); if (c) return c; }
      return null;
    }
    var folhas = [], atual = [];
    blocos.forEach(function (b) {
      if (!atual.length) { atual = [b]; return; }
      var teste = atual.concat([b]), c = menorFormato(teste), lim = ordem.indexOf(b.fmtMin === "A0" || atual.some(function (x) { return x.fmtMin === "A0"; }) ? "A0" : maior);
      if (c && ordem.indexOf(c.g.formato) <= lim) atual = teste;
      else { folhas.push(atual); atual = [b]; }
    });
    if (atual.length) folhas.push(atual);
    return folhas.map(function (lista) {
      var c = menorFormato(lista) || (function () {
        /* nem no maior formato permitido: uma parede por linha, a partir do canto (o aviso pede conferência) */
        var g = geoDe(fmtsA0[fmtsA0.length - 1]), its = lista.map(function (b) { return { w: b.m.w, h: b.m.h, b: b }; });
        aviso(avisos, "Paginação de " + lista.map(function (b) { return b.w.pag.id; }).join(", ") + " passa da folha " + g.formato + ": conferir.");
        var ls = its.map(function (it) { return { itens: [it], w: it.w, h: it.h }; });
        return { g: g, pl: { linhas: ls, h: ls.reduce(function (t, l, k) { return t + l.h + (k ? RESPIRO : 0); }, 0), w: ls.reduce(function (t, l) { return Math.max(t, l.w); }, 0) } };
      })();
      return { lista: lista, geo: c.g, pl: c.pl };
    });
  }

  /* ================================================================ PLANTA DE LOCAÇÃO + QUADRO */
  function quadroReforcos(r) {
    var linhas = [];
    r.paredes.forEach(function (w) {
      if (!w.pag || !w.pag.reforcos) return;
      reforcosDe(w).forEach(function (x) {
        var rr = x.r, calc = x.calc, secao = calc && calc.b != null && calc.h != null ? cmTxt(calc.b) + " x " + cmTxt(calc.h) : (x.tipo === "cinta" && calc ? "- x " + cmTxt(calc.h) : cmTxt(rr.w) + " x " + cmTxt(rr.h));
        var pos = x.tipo === "pilarete" ? br(rr.x + rr.w / 2, 2) : (br(rr.x, 2) + " a " + br(rr.x + rr.w, 2));
        var qtxt = x.q ? x.q.barras + " Ø " + x.q.bitola + " C=" + Math.round(x.q.comprimento * 100) : "-";
        if (x.tipo === "cinta") qtxt = [x.en.main, x.en.sup, x.en.lat].filter(Boolean).map(function (en) { return en.e.barras + " Ø " + en.e.bitola + " C=" + Math.round(en.e.comprimento * 100); }).join(" + ") || "-";
        var ctxt = calc && calc.armadura ? calc.armadura.replace(/\s*\([^)]*\)/g, "").replace(/φ/g, "Ø ").replace(/inferior/, "inf.").replace(/superior nos apoios/, "sup.").replace(/lateral/, "lat.") : (calc && calc.naCinta ? "na cinta" : "-");
        var est = "-";
        if (x.est) est = x.est.barras + " Ø " + x.est.bitola + " C=" + Math.round(x.est.comprimento * 100);
        else if (calc && calc.cisalhamento && (x.tipo === "verga" || x.tipo === "cinta")) est = "Ø " + calc.cisalhamento.phi + " C/" + cmTxt(calc.cisalhamento.s) + " (calculado; fora do quantitativo)";
        linhas.push([w.pag.id, rr.id, nomeReforco(x.tipo), pos, secao, ctxt, qtxt, est, x.status]);
      });
    });
    return linhas;
  }
  var QR_CAB = ["PAREDE", "ELEMENTO", "TIPO", ["POSIÇÃO", "(m)"], ["SEÇÃO", "(cm)"], ["ARMADURA", "CALCULADA"], ["ARMADURA NO", "QUANTITATIVO"], "ESTRIBO", "SITUAÇÃO"];
  var QR_AL = ["C", "C", "E", "C", "C", "E", "E", "E", "C"];

  /* a planta (com coordenadas) ou o esquema em lista, desenhados NA ORIGEM numa escala */
  function componentePlanta(r, op, esc0, M) {
    var D = new Desenho(M), T = PADRAO.textos, pl = op.planta && arr(op.planta.paredes).length ? op.planta : null, ws = r.paredes.filter(function (w) { return w.pag && w.pag.comprimento > 0; });
    var sc = 1000 / esc0, av = [];
    function pilaretesDe(w) { return arr(w.pag.reforcos.pilaretes).filter(function (p) { return p.dono !== false; }); }
    function desenhoParede(w, p0, ux, uy) {
      var pag = w.pag, e = pag.espessura / 100, L = pag.comprimento, nx = -uy, ny = ux;
      function P(sv, tv) { return [p0[0] + (sv * ux + tv * nx) * sc, p0[1] + (sv * uy + tv * ny) * sc]; }
      var vs = arr(pag.vaos).slice().sort(function (a1, b1) { return a1.x - b1.x; }), cur = 0;
      function macico(s0, s1) { if (s1 - s0 > 1e-6) D.poli([P(s0, -e / 2), P(s1, -e / 2), P(s1, e / 2), P(s0, e / 2)], "EST-FORMA-CORTE", true); }
      vs.forEach(function (v) { macico(cur, Math.max(cur, v.x)); cur = v.x + v.w; });
      macico(cur, L);
      vs.forEach(function (v) { var a1 = P(v.x, -e / 2), b1 = P(v.x + v.w, -e / 2), a2 = P(v.x, e / 2), b2 = P(v.x + v.w, e / 2); D.linha(a1[0], a1[1], b1[0], b1[1], "EST-OCULTA"); D.linha(a2[0], a2[1], b2[0], b2[1], "EST-OCULTA"); });
      pilaretesDe(w).forEach(function (pl0) {
        var q = [P(pl0.x, -e / 2), P(pl0.x + pl0.w, -e / 2), P(pl0.x + pl0.w, e / 2), P(pl0.x, e / 2)];
        D.hach(q, "EST-HACHURA", 0.8); D.poli(q, "EST-FORMA-CORTE", true);
      });
    }
    if (pl) {
      var pts = [], mapa = {};
      arr(pl.paredes).forEach(function (q) { mapa[q.id] = q; pts.push([q.x1, q.y1], [q.x2, q.y2]); });
      var xs = pts.map(function (q) { return q[0]; }), ys = pts.map(function (q) { return q[1]; });
      var X0 = Math.min.apply(null, xs), X1 = Math.max.apply(null, xs), Y0 = Math.min.apply(null, ys), Y1 = Math.max.apply(null, ys);
      var Wp = (X1 - X0) * sc, Hp = (Y1 - Y0) * sc;
      D.limite = { x0: -70, x1: Wp + 70, y0: -60, y1: Hp + 60 };
      var coord = function (xm, ym) { return [(xm - X0) * sc, (Y1 - ym) * sc]; };
      function eixo(w) { var q = mapa[w.pag.id]; if (!q) return null; var A = coord(q.x1, q.y1), B = coord(q.x2, q.y2), dl = Math.sqrt((B[0] - A[0]) * (B[0] - A[0]) + (B[1] - A[1]) * (B[1] - A[1])); return { A: A, B: B, dl: dl, ux: (B[0] - A[0]) / dl, uy: (B[1] - A[1]) / dl }; }
      ws.forEach(function (w) { var e0 = eixo(w); if (!e0) { aviso(av, "opcoes.planta sem a parede " + w.pag.id + ": ficou fora da planta."); return; } desenhoParede(w, e0.A, e0.ux, e0.uy); });
      /* rótulos depois de todas as paredes (para escolher lugar livre). Cada ponto de chamada vira área proibida para os
         rótulos dos vizinhos: sem isto o rótulo de um pilarete cobria a âncora do seguinte e este ficava sem lugar. */
      ws.forEach(function (w) {
        var e0 = eixo(w); if (!e0) return;
        pilaretesDe(w).forEach(function (p) { var c = [e0.A[0] + (p.x + p.w / 2) * e0.ux * sc, e0.A[1] + (p.x + p.w / 2) * e0.uy * sc]; D.keep.push({ x0: c[0] - 1.2, x1: c[0] + 1.2, y0: c[1] - 1.2, y1: c[1] + 1.2 }); });
      });
      ws.forEach(function (w) {
        var e0 = eixo(w); if (!e0) return;
        function Pt(sv) { return [e0.A[0] + sv * e0.ux * sc, e0.A[1] + sv * e0.uy * sc]; }
        pilaretesDe(w).forEach(function (p) { var c = Pt(p.x + p.w / 2); D.rotulo(c[0], c[1], w.pag.id + "-" + p.id, T.nota, "EST-ARM-TEXTO", { dists: [6, 9, 13, 18, 24, 32, 42, 56] }); });
        /* o nome da parede: no meio dela; cercado pelos rótulos dos pilaretes, em outro ponto ao longo dela */
        var nomeW = w.pag.id + " (" + mTxt(w.pag.comprimento) + " m)", feito = null;
        [0.5, 0.35, 0.65, 0.2, 0.8].forEach(function (fr) { if (feito) return; var mm = Pt(w.pag.comprimento * fr); feito = D.rotulo(mm[0], mm[1], nomeW, T.cabecalho, "EST-TITULO", { dists: [10, 16, 24, 34, 44, 56], silencioso: true }); });
        if (!feito) { D.avisos = D.avisos || []; D.avisos.push("rótulo sem lugar livre: " + nomeW); }
      });
    } else {
      /* lista: cada parede é uma barra horizontal em escala; rótulos dos pilaretes acima */
      var Lmax = Math.max.apply(null, ws.map(function (w) { return w.pag.comprimento; })), linhaH = 30;
      D.limite = { x0: -40, x1: Lmax * sc + 30, y0: -26, y1: ws.length * linhaH };
      ws.forEach(function (w, ix) {
        var yw = ix * linhaH;
        desenhoParede(w, [0, yw], 1, 0);
        D.texto(-4, yw + 0.35 * T.cabecalho, w.pag.id, T.cabecalho, "EST-TITULO", { al: "D", peso: 0.12 });
        D.cotaH(0, w.pag.comprimento * sc, yw + 10, yw + w.pag.espessura / 200 * sc, mTxt(w.pag.comprimento), null);
      });
      ws.forEach(function (w, ix) {
        var yw = ix * linhaH;
        pilaretesDe(w).forEach(function (p) { D.rotulo((p.x + p.w / 2) * sc, yw - w.pag.espessura / 200 * sc, p.id, T.nota, "EST-ARM-TEXTO", { dists: [5, 8, 11, 14, 17, 20], angs: [-90, -60, -120, -45, -135, -30, -150] }); });
      });
    }
    D.avisos = (D.avisos || []).concat(av);
    var b = D.bbox();
    return { D: D, b: b, w: b.w, h: b.h, esc: esc0, coord: !!pl };
  }
  function planoLocacao(r, op, avisos, notas, M) {
    var lin = quadroReforcos(r), plantas = {}, fmts = formatosDe(op, false), fmtsA0 = formatosDe(op, true);
    var tituloP = op.planta && arr(op.planta.paredes).length ? "PLANTA DE LOCAÇÃO DOS REFORÇOS (PILARETES, VERGAS E CINTAS)" : "PLANTA ESQUEMÁTICA DOS REFORÇOS (PAREDES SEM COORDENADAS)";
    var tituloQ = "QUADRO DE PILARETES, VERGAS, CONTRAVERGAS E CINTAS";
    function planta(e0) { return plantas[e0] || (plantas[e0] = componentePlanta(r, op, e0, M)); }
    var mq = medirTabela(QR_CAB, lin, {});
    /* o quadro em k blocos lado a lado, todos com as MESMAS larguras de coluna e o mesmo número de linhas */
    function quadro(k) { var rows = Math.ceil(lin.length / k); return { k: k, rows: rows, w: k * mq.w + (k - 1) * RESPIRO, h: medirTabela(QR_CAB, lin.slice(0, rows), { larguras: mq.cw }).h }; }
    function arranjo(p, q, a) {
      var wPl = Math.max(p.w, larg(tituloP, PADRAO.textos.titulo)), wQ = Math.max(q.w, larg(tituloQ, PADRAO.textos.titulo));
      var hP = TITULO_H + p.h, hQ = TITULO_H + q.h;
      var ops = [];
      if (Math.max(wPl, wQ) <= a.w && hP + RESPIRO + hQ <= a.h) ops.push({ tipo: "pilha", w: Math.max(wPl, wQ), h: hP + RESPIRO + hQ, hP: hP });
      if (wPl + RESPIRO + wQ <= a.w && Math.max(hP, hQ) <= a.h) ops.push({ tipo: "lado", w: wPl + RESPIRO + wQ, h: Math.max(hP, hQ), wPl: wPl });
      /* os dois cabem: fica o que ocupa melhor a folha (o menor dos dois aproveitamentos, largura e altura, maior) */
      ops.forEach(function (o) { o.uso = Math.min(o.w / a.w, o.h / a.h); });
      ops.sort(function (x, y) { return y.uso - x.uso; });
      return ops[0] || null;
    }
    var tentativas = [];
    [1, 2, 3].forEach(function (k) { PADRAO.escalas.planta.forEach(function (e0) { fmts.forEach(function (f) { tentativas.push([e0, f, k]); }); }); });
    if (fmtsA0.length > fmts.length) [1, 2].forEach(function (k) { PADRAO.escalas.planta.forEach(function (e0) { tentativas.push([e0, "A0", k]); }); });
    /* ordem: escala do padrão primeiro, depois o menor formato, depois o quadro inteiro */
    tentativas.sort(function (x, y) { return (x[2] - y[2]) * 1000 + (x[0] - y[0]) * 10 + (["A3", "A2", "A1", "A0"].indexOf(x[1]) - ["A3", "A2", "A1", "A0"].indexOf(y[1])); });
    tentativas.sort(function (x, y) { return (x[0] - y[0]) || (x[2] - y[2]) || (["A3", "A2", "A1", "A0"].indexOf(x[1]) - ["A3", "A2", "A1", "A0"].indexOf(y[1])); });
    for (var i = 0; i < tentativas.length; i++) {
      var t = tentativas[i], g = geoDe(t[1]), p = planta(t[0]), q = quadro(t[2]), arj = arranjo(p, q, g.area);
      if (arj && medirColuna(g, notas, M).cabe) {
        if (t[0] > 50) aviso(avisos, "Planta de locação em 1:" + t[0] + " (o 1:50 do padrão não coube na folha).");
        return { geo: g, planta: p, q: q, arj: arj, lin: lin, mq: mq, tituloP: tituloP, tituloQ: tituloQ };
      }
    }
    var gU = geoDe(fmtsA0[fmtsA0.length - 1]), pU = planta(PADRAO.escalas.planta[PADRAO.escalas.planta.length - 1]), qU = quadro(3);
    aviso(avisos, "Planta de locação e quadro de reforços não cabem juntos no " + gU.formato + ": conferir.");
    return { geo: gU, planta: pU, q: qU, arj: { tipo: "pilha", w: Math.max(pU.w, qU.w), h: TITULO_H * 2 + pU.h + RESPIRO + qU.h, hP: TITULO_H + pU.h }, lin: lin, mq: mq, tituloP: tituloP, tituloQ: tituloQ };
  }
  function desenharLocacao(D, P) {
    var a = P.geo.area, arj = P.arj, x0 = a.x + (a.w - arj.w) / 2, y0 = a.y + (a.h - arj.h) / 2, p = P.planta, q = P.q;
    var xQ = arj.tipo === "pilha" ? x0 : x0 + arj.wPl + RESPIRO, yQ = arj.tipo === "pilha" ? y0 + arj.hP + RESPIRO : y0;
    tituloDesenho(D, x0, y0, P.tituloP, "ESCALA 1:" + p.esc);
    D.mesclar(p.D, x0 - p.b.x0, y0 + TITULO_H - p.b.y0);
    tituloDesenho(D, xQ, yQ, P.tituloQ, "");
    for (var k = 0; k < q.k; k++) {
      var parte = P.lin.slice(k * q.rows, (k + 1) * q.rows); if (!parte.length) break;
      tabela(D, xQ + k * (P.mq.w + RESPIRO), yQ + TITULO_H, QR_CAB, parte, { al: QR_AL, larguras: P.mq.cw });
    }
    return { escala: "1:" + p.esc };
  }

  /* ================================================================ DETALHES */
  function distintas(r) {
    var m = {}; r.paredes.forEach(function (w) { if (w.pag && w.pag.catalogo) m[w.pag.espessura] = w.pag; });
    return Object.keys(m).map(Number).sort(function (a, b) { return a - b; }).map(function (k) { return m[k]; });
  }
  /* cada detalhe desenha SÓ o desenho (na origem) e devolve título, escala e nota em c.meta / c.nota */
  function tituloDet(c, n, titulo, escala) { c.meta = { n: n, titulo: "DETALHE " + n + " - " + titulo, escala: "ESCALA " + escala }; }
  /* faixa de seção vertical (camada) com hachura de concreto */
  function faceSecao(D, x, y, w, h, hach) { D.ret(x, y, w, h, "EST-FORMA-CORTE"); if (hach !== false) D.hachRet(x, y, w, h, 1.2); }
  /* EPS: retângulo cinza com diagonais (símbolo de isolante) */
  function epsSecao(D, x, y, w, h) {
    D.ret(x, y, w, h, "BLK-EPS");
    var n = Math.max(2, Math.floor(h / 6)), i;
    for (i = 0; i < n; i++) { var y0 = y + i * h / n, y1 = y + (i + 1) * h / n; D.poli([[x, y0], [x + w, (y0 + y1) / 2], [x, y1]], "BLK-EPS", false); }
  }

  function detCortePeca(D, c, pags) {
    var T = PADRAO.textos, k = 500, cf = pags[0].cfg, fs = cf.face, y0 = c.y + 32, H = 0.18, x = c.x + 20, lista = [pags[0]];
    if (pags.length > 1) lista.push(pags[pags.length - 1]);
    tituloDet(c, 1, "CORTE DA PEÇA (FACE / EPS / FACE)", "1:2");
    lista.forEach(function (pg) {
      var e = pg.espessura / 100, nuc = e - 2 * fs, W = e * k, hh = H * k;
      D.keep.push({ x0: x - 1, x1: x + W + 1, y0: y0 - 1, y1: y0 + hh + 1 });
      faceSecao(D, x, y0, fs * k, hh); epsSecao(D, x + fs * k, y0, nuc * k, hh); faceSecao(D, x + (fs + nuc) * k, y0, fs * k, hh);
      D.cotaH(x, x + fs * k, y0 - 8, y0, cmTxt(fs), null, {}); D.cotaH(x + fs * k, x + (fs + nuc) * k, y0 - 8, y0, cmTxt(nuc), null, { semExt: true }); D.cotaH(x + (fs + nuc) * k, x + W, y0 - 8, y0, cmTxt(fs), null, { semExt: true });
      D.cotaH(x, x + W, y0 - 17, y0 - 8, cmTxt(e) + " (peça " + pg.espessura + ")", null, { semExt: true });
      D.rotulo(x + (fs + nuc / 2) * k, y0 + hh * 0.7, "núcleo EPS", T.nota, "EST-TEXTO", { angs: [0, 180] });
      x += W + 45;
    });
    D.rotulo(c.x + 20 + fs * k / 2, y0 + H * k * 0.3, "face de microconcreto", T.nota, "EST-TEXTO", { angs: [-90, 90, -135, 135] });
    c.nota = "Peça de 90 x 90 cm com faces de microconcreto de " + cmTxt(fs) + " cm; núcleo de EPS com a espessura da peça menos " + cmTxt(2 * fs) + " cm.";
  }

  function detCanto(D, c, pags) {
    var T = PADRAO.textos, k = 100, pg = pags[pags.length - 1], e = pg.espessura / 100, fs = pg.cfg.face, j = pg.cfg.junta, Lb = 0.60, xo = c.x + 20, yo = c.y + 24;
    tituloDet(c, 2, "AMARRAÇÃO EM CANTO L (VISTA SUPERIOR, FIADAS ALTERNADAS)", "1:10");
    function parede(x0, y0, w0, h0) {      /* retângulo em m → face/EPS/face (linhas) */
      var X = x0 * k, Y = y0 * k, W = w0 * k, H = h0 * k;
      D.ret(X, Y, W, H, "EST-FORMA-VISTA");
      if (w0 >= h0) { D.linha(X, Y + fs * k, X + W, Y + fs * k, "BLK-EPS"); D.linha(X, Y + H - fs * k, X + W, Y + H - fs * k, "BLK-EPS"); }
      else { D.linha(X + fs * k, Y, X + fs * k, Y + H, "BLK-EPS"); D.linha(X + W - fs * k, Y, X + W - fs * k, Y + H, "BLK-EPS"); }
    }
    var xs = [xo, xo + 100], k2;
    for (k2 = 0; k2 < 2; k2++) {
      var bx = xs[k2] / k, by = yo / k;
      if (k2 === 0) { parede(bx, by, Lb, e); parede(bx, by + e + j, e, Lb); }          /* fiada ímpar: A (horizontal) passa */
      else { parede(bx, by, e, Lb); parede(bx + e + j, by, Lb - e - j, e); }           /* fiada par: B (vertical) passa */
      D.keep.push({ x0: xs[k2] - 1, x1: xs[k2] + Lb * k + 1, y0: yo - 1, y1: yo + (k2 === 0 ? e + j + Lb : Lb) * k + 1 });
      D.texto(xs[k2], yo - 6, k2 === 0 ? "FIADA ÍMPAR" : "FIADA PAR", T.letraCorte, "EST-TITULO", { al: "E", peso: 0.12 });
    }
    D.cotaV(yo, yo + e * k, xo - 10, xo, cmTxt(e), null);
    D.rotulo(xo + 100 + (e + j / 2) * k, yo + (e / 2) * k, "junta " + cmTxt(j), T.nota, "EST-TEXTO", { angs: [-30, 30, 0] });
    c.nota = "Em cada fiada uma parede passa e a outra encosta, com junta de " + cmTxt(j) + " cm; a posição inverte na fiada seguinte. Transpasse mínimo: " + Math.round(pg.cfg.transpasseMin * 100) + " % do comprimento da peça.";
  }

  function detT(D, c, pags) {
    var T = PADRAO.textos, k = 100, pg = pags[0], eA = pg.espessura / 100, eB = pags[pags.length - 1].espessura / 100, fs = pg.cfg.face, j = pg.cfg.junta, an = BlocokExec.DIRETRIZ.ancoragemLigacao;
    var xo = c.x + 20, yo = c.y + 26, LA = 1.0, LB = 0.65;
    tituloDet(c, 3, "ENCONTRO EM T COM GRAMPO (VISTA SUPERIOR)", "1:10");
    D.ret(xo, yo, LA * k, eA * k, "EST-FORMA-VISTA"); D.linha(xo, yo + fs * k, xo + LA * k, yo + fs * k, "BLK-EPS"); D.linha(xo, yo + eA * k - fs * k, xo + LA * k, yo + eA * k - fs * k, "BLK-EPS");
    var bx = xo + (LA - eB) / 2 * k, by = yo + (eA + j) * k;
    D.ret(bx, by, eB * k, LB * k, "EST-FORMA-VISTA"); D.linha(bx + fs * k, by, bx + fs * k, by + LB * k, "BLK-EPS"); D.linha(bx + eB * k - fs * k, by, bx + eB * k - fs * k, by + LB * k, "BLK-EPS");
    D.keep.push({ x0: xo - 1, x1: xo + LA * k + 1, y0: yo - 1, y1: by + LB * k + 1 });
    /* grampo em L: perna de 15 cm na parede A (para um lado) e perna de 15 cm descendo na B */
    var cx = bx + eB * k / 2, ya = yo + eA * k / 2, yb = Math.min(by + LB * k - 2, ya + (eA / 2 + j + an) * k);
    D.poli([[cx - an * k, ya], [cx, ya], [cx, yb]], "EST-ARM-LONG", false);
    D.cotaH(cx - an * k, cx, yo - 8, yo, "≥ " + cmTxt(an), null);
    D.cotaV(by, yb, bx + eB * k + 14, bx + eB * k, "≥ " + cmTxt(an), null);
    D.rotulo(cx - an * k / 2, ya, "grampo Ø [a definir]", T.nota, "EST-ARM-TEXTO", { angs: [180, 0, -90] });
    c.nota = ["Um grampo por fiada no encontro, com ancoragem mínima de " + cmTxt(an) + " cm em cada parede.", "Bitola e comprimento do grampo: [a definir]."];
  }

  /* notação TQS "{q} N{pos} Ø {bit} C={comp}" (estribo: "C/{esp}" antes do C=) */
  function notacao(en, esp) {
    if (!en) return null; var a = en.e;
    return a.barras + " N" + en.pos + " Ø " + a.bitola + (esp ? " C/" + cmTxt(esp) : "") + " C=" + Math.round(a.comprimento * 100);
  }
  function espEstribo(x, pg) {
    if (x.tipo === "pilarete") return pg.cfg.aco && pg.cfg.aco.pilarete ? pg.cfg.aco.pilarete.estriboEsp : 0;
    return x.calc && x.calc.cisalhamento ? x.calc.cisalhamento.s : 0;
  }
  /* seção de uma verga/cinta: faces + EPS + bloco de concreto armado com barras e estribo (posição das barras ESQUEMÁTICA) */
  function secaoViga(D, x0, y0, pg, x, hv) {
    var T = PADRAO.textos, k = 200, e = pg.espessura / 100, fs = pg.cfg.face, cw = pg.catalogo.concreto, HJ = 0.36, W = e * k, Hs = HJ * k;
    var h = hv, yb = y0 + (HJ - h) / 2 * k, xb = x0 + (e - cw) / 2 * k, ac = x.arm;
    faceSecao(D, x0, y0, fs * k, Hs); faceSecao(D, x0 + W - fs * k, y0, fs * k, Hs);
    epsSecao(D, x0 + fs * k, y0, (e - 2 * fs) * k, Math.max(0, yb - y0)); epsSecao(D, x0 + fs * k, yb + h * k, (e - 2 * fs) * k, Math.max(0, y0 + Hs - yb - h * k));
    D.ret(xb, yb, cw * k, h * k, "EST-FORMA-CORTE"); D.hachRet(xb, yb, cw * k, h * k, 1.2);
    D.keep.push({ x0: x0 - 1, x1: x0 + W + 1, y0: y0 - 1, y1: y0 + Hs + 1 });
    var ins = 0.03, ex = xb + ins * k, ey = yb + ins * k, ew = (cw - 2 * ins) * k, eh = (h - 2 * ins) * k;
    D.ret(ex, ey, ew, eh, "EST-ARM-ESTRIBO");
    var n = ac ? ac.n : 2, bit = ac ? ac.bit : 8, rr = Math.max(0.8, bit / 1000 * k / 2), i, pos = [];
    var cinta = x.tipo === "cinta" && x.calc, an = cinta ? x.calc.arranjoNeg : null, al = cinta && x.calc.ventoHorizontal ? x.calc.ventoHorizontal.arranjo : null;
    var posSup = [], posLat = [], rrS = an ? Math.max(0.8, an.phi / 1000 * k / 2) : rr, rrL = al ? Math.max(0.8, al.phi / 1000 * k / 2) : rr;
    var linhas = !cinta && n > 3 && eh > 2 * (rr * 2 + 2) ? 2 : 1, nSup = linhas === 2 ? Math.floor(n / 2) : 0, nInf = n - nSup;
    function fila(nn, yy, vet, r1) { if (nn === 1) { vet.push([ex + ew / 2, yy]); return; } for (i = 0; i < nn; i++) vet.push([ex + r1 + 1 + i * (ew - 2 * (r1 + 1)) / (nn - 1), yy]); }
    fila(nInf, ey + eh - rr - 1, pos, rr); if (nSup) fila(nSup, ey + rr + 1, pos, rr);
    /* cinta: inferior (vão) embaixo, superior (negativo, nos apoios) em cima e lateral (vento) nas duas faces do estribo */
    if (an) fila(an.n, ey + rrS + 1, posSup, rrS);
    if (al) for (i = 0; i < al.n; i++) { var yl = ey + eh * (i + 1) / (al.n + 1); posLat.push([ex + rrL + 1, yl], [ex + ew - rrL - 1, yl]); }
    pos.forEach(function (p) { D.circ(p[0], p[1], rr, "EST-ARM-SECAO", true); });
    posSup.forEach(function (p) { D.circ(p[0], p[1], rrS, "EST-ARM-SECAO", true); });
    posLat.forEach(function (p) { D.circ(p[0], p[1], rrL, "EST-ARM-SECAO", true); });
    D.cotaH(xb, xb + cw * k, y0 - 8, y0, cmTxt(cw), null, {});
    D.cotaV(yb, yb + h * k, x0 + W + 12, x0 + W, cmTxt(h), null);
    D.cotaH(x0, x0 + W, y0 + Hs + 9, y0 + Hs, cmTxt(e), null);
    var nt = notacao(x.en.main) || ((ac ? ac.n : "?") + " N1 Ø " + (ac ? ac.bit : "?") + " C=[a definir]");
    D.rotulo(pos[0] ? pos[0][0] : ex, pos[0] ? pos[0][1] : ey, nt, T.notacao, "EST-ARM-TEXTO", { angs: [180, 135, -135] });
    var ns = cinta ? notacao(x.en.sup) : null, nl = cinta ? notacao(x.en.lat) : null;
    if (ns && posSup[0]) D.rotulo(posSup[0][0], posSup[0][1], ns, T.notacao, "EST-ARM-TEXTO", { angs: [180, 135, -135, 90] });
    if (nl && posLat[0]) D.rotulo(posLat[0][0], posLat[0][1], nl + " (por face)", T.notacao, "EST-ARM-TEXTO", { angs: [180, 160, 200] });
    var ne = notacao(x.en.estribo, espEstribo(x, pg)), np = notacao(x.en.porta);
    if (ne) D.rotulo(ex + ew, ey + eh * 0.5, ne, T.notacao, "EST-ARM-TEXTO", { angs: [0, 30, -30] });
    if (np) D.rotulo(ex + ew / 2, ey + 1, np, T.notacao, "EST-ARM-TEXTO", { angs: [-90, -45, -135] });
    return { w: W, h: Hs };
  }
  function achar(r, tipo) {
    var alvo = null;
    r.paredes.forEach(function (w) { if (!alvo && w.pag && w.pag.reforcos) reforcosDe(w).forEach(function (x) { if (!alvo && x.tipo === tipo && x.calc && x.arm) alvo = { w: w, x: x }; }); });
    return alvo;
  }
  function detVerga(D, c, r) {
    var T = PADRAO.textos, alvo = achar(r, "verga");
    tituloDet(c, 4, "VERGA EMBUTIDA (CORTE TRANSVERSAL)", "1:5");
    if (!alvo) { D.texto(c.x, c.y + 30, "Sem verga calculada nesta obra.", T.nota, "EST-TEXTO", { al: "E" }); return; }
    secaoViga(D, c.x + 90, c.y + 30, alvo.w.pag, alvo.x, alvo.x.calc.h || alvo.x.r.h);
    c.nota = "Seção de referência: " + alvo.x.r.id + " (parede " + alvo.w.pag.id + "), " + armTxt(alvo.x.calc.armadura) + "; as demais vergas no quadro de reforços. Disposição das barras esquemática; cobrimento conforme NBR 6118, Tabela 7.2 (CAA " + txt(r.parametros && r.parametros.caa) + ").";
  }
  function detCinta(D, c, r) {
    var T = PADRAO.textos, alvo = achar(r, "cinta");
    tituloDet(c, 6, "CINTA DE RESPALDO (CORTE TRANSVERSAL)", "1:5");
    if (!alvo) { D.texto(c.x, c.y + 30, "Sem cinta calculada nesta obra.", T.nota, "EST-TEXTO", { al: "E" }); return; }
    secaoViga(D, c.x + 90, c.y + 30, alvo.w.pag, alvo.x, alvo.x.calc.h || alvo.x.r.h);
    c.nota = "Seção de referência: " + alvo.x.r.id + " (parede " + alvo.w.pag.id + "), " + armTxt(alvo.x.calc.armadura) + ". Armadura inferior: momento positivo no vão; superior: momento negativo nos apoios; lateral: flexão horizontal por vento, quando não há diafragma no topo. Disposição das barras esquemática.";
  }
  function detPilarete(D, c, r) {
    var T = PADRAO.textos, k = 200, alvo = achar(r, "pilarete");
    tituloDet(c, 5, "PILARETE (SEÇÃO EM PLANTA)", "1:5");
    if (!alvo) { D.texto(c.x, c.y + 30, "Sem pilarete calculado nesta obra.", T.nota, "EST-TEXTO", { al: "E" }); return; }
    var pg = alvo.w.pag, e = pg.espessura / 100, fs = pg.cfg.face, cw = pg.catalogo.concreto, b = alvo.x.calc.b || pg.cfg.pilarete.largura, Wp = 0.50, x0 = c.x + 60, y0 = c.y + 32, ac = alvo.x.arm;
    var xb = x0 + (Wp - b) / 2 * k, yb = y0 + (e - cw) / 2 * k;
    faceSecao(D, x0, y0, Wp * k, fs * k); faceSecao(D, x0, y0 + (e - fs) * k, Wp * k, fs * k);
    epsSecao(D, x0, y0 + fs * k, xb - x0, (e - 2 * fs) * k); epsSecao(D, xb + b * k, y0 + fs * k, x0 + Wp * k - xb - b * k, (e - 2 * fs) * k);
    D.ret(xb, yb, b * k, cw * k, "EST-FORMA-CORTE"); D.hachRet(xb, yb, b * k, cw * k, 1.2);
    D.keep.push({ x0: x0 - 1, x1: x0 + Wp * k + 1, y0: y0 - 1, y1: y0 + e * k + 1 });
    var ins = 0.03, ex = xb + ins * k, ey = yb + ins * k, ew = (b - 2 * ins) * k, eh = (cw - 2 * ins) * k, rr = Math.max(0.9, ac.bit / 1000 * k / 2);
    D.ret(ex, ey, ew, eh, "EST-ARM-ESTRIBO");
    var pos = [[ex + rr + 1, ey + rr + 1], [ex + ew - rr - 1, ey + rr + 1], [ex + rr + 1, ey + eh - rr - 1], [ex + ew - rr - 1, ey + eh - rr - 1]];
    pos.forEach(function (p) { D.circ(p[0], p[1], rr, "EST-ARM-SECAO", true); });
    D.cotaH(xb, xb + b * k, y0 - 8, y0, cmTxt(b), null, {});
    D.cotaV(yb, yb + cw * k, x0 + Wp * k + 12, x0 + Wp * k, cmTxt(cw), null);
    D.cotaV(y0, y0 + e * k, x0 - 12, x0, cmTxt(e), null);
    var q = alvo.x.q, nt1 = notacao(alvo.x.en.main) || (ac.n + " N1 Ø " + ac.bit + " C=[a definir]"), ne = notacao(alvo.x.en.estribo, espEstribo(alvo.x, pg));
    D.rotulo(pos[3][0], pos[3][1], nt1, T.notacao, "EST-ARM-TEXTO", { angs: [30, 0, -30, 60] });
    if (ne) D.rotulo(ex + ew, ey + eh * 0.5, ne, T.notacao, "EST-ARM-TEXTO", { angs: [-30, -60, 0, 20] });
    c.nota = "Seção de referência: " + alvo.x.r.id + " (parede " + pg.id + "), " + armTxt(alvo.x.calc.armadura) + (alvo.x.status === "difere" ? "; o quantitativo traz " + (q ? q.barras + " Ø " + q.bitola : "-") + " (ver quadro de reforços)." : "; os demais pilaretes no quadro de reforços.");
  }
  function detJunta(D, c, pags) {
    var T = PADRAO.textos, k = 500, pg = pags[0], j = pg.cfg.junta, tela = (pg.cfg.tratamento && pg.cfg.tratamento.telaLarguraM) || 0.10;
    tituloDet(c, 7, "TRATAMENTO DE JUNTA (CAMADAS)", "1:5 (espessuras das camadas fora de escala)");
    var x0 = c.x + 20, y0 = c.y + 30, Wp = 0.14, hh = 0.14 * k, xj = x0 + Wp * k;
    /* duas peças separadas pela junta; vista em corte horizontal pela face externa (seção vertical da junta) */
    faceSecao(D, x0, y0, Wp * k, hh, true); faceSecao(D, xj + j * k, y0, Wp * k, hh, true);
    D.ret(xj, y0, j * k, hh, "EST-FORMA-VISTA");
    D.keep.push({ x0: x0 - 1, x1: xj + j * k + Wp * k + 1, y0: y0 - 1, y1: y0 + hh + 1 });
    /* camadas por cima: selador (linha fina), tela (faixa) e AC-III (faixa maior) — esquemáticas, acima da face (y0 - d) */
    var xm = xj + j * k / 2, wt = tela * k, wA = wt + 0.06 * k;
    D.ret(xm - wA / 2, y0 - 5, wA, 2.2, "BLK-TRATAMENTO");                   /* AC-III */
    D.ret(xm - wt / 2, y0 - 2.8, wt, 1.2, "BLK-TRATAMENTO"); D.hachRet(xm - wt / 2, y0 - 2.8, wt, 1.2, 0.8);   /* tela */
    D.linha(x0, y0 - 0.6, xj + j * k + Wp * k, y0 - 0.6, "BLK-TRATAMENTO");   /* selador */
    D.keep.push({ x0: xm - wA / 2 - 1, x1: xm + wA / 2 + 1, y0: y0 - 6, y1: y0 });
    D.cotaH(xj, xj + j * k, y0 + hh + 9, y0 + hh, cmTxt(j), null);
    D.cotaH(xm - wt / 2, xm + wt / 2, y0 - 16, y0 - 5, cmTxt(tela), null);
    D.rotulo(xm + wA / 4, y0 - 3.9, "1) selador; 2) AC-III; 3) tela de fibra de vidro; 4) AC-III", T.nota, "EST-TEXTO", { angs: [0] });
    D.rotulo(xm, y0 + hh * 0.6, "argamassa de assentamento na junta", T.nota, "EST-TEXTO", { angs: [0, 180, -45] });
    c.nota = ["Sequência do tratamento conforme orientação de montagem do fabricante (11/06/2026): selador, argamassa AC-III, tela de fibra de vidro com " + cmTxt(tela) + " cm de largura e nova camada de AC-III.", "Espessura das camadas: [a definir]."];
  }
  function detEncunha(D, c, pags) {
    var T = PADRAO.textos, k = 200, pg = pags[pags.length - 1], D0 = BlocokExec.DIRETRIZ, enc = D0.encunhamentoMin, an = D0.ancoragemLigacao, e = pg.espessura / 100;
    tituloDet(c, 8, "ENCUNHAMENTO E LIGAÇÃO À ESTRUTURA", "1:5");
    var x0 = c.x + 40, yLaje = c.y + 30, Wp = e * k, hLaje = 0.14 * k, hPeca = 0.30 * k, yEnc = yLaje + hLaje;
    /* laje/viga (concreto cortado), vão de encunhamento, peça abaixo */
    D.ret(x0 - 25, yLaje, Wp + 50, hLaje, "EST-FORMA-CORTE"); D.hachRet(x0 - 25, yLaje, Wp + 50, hLaje, 1.6);
    D.ret(x0, yEnc + enc * k, Wp, hPeca, "EST-FORMA-VISTA");
    D.keep.push({ x0: x0 - 26, x1: x0 + Wp + 26, y0: yLaje - 1, y1: yEnc + enc * k + hPeca + 1 });
    D.cotaV(yEnc, yEnc + enc * k, x0 + Wp + 12, x0 + Wp, "≥ " + cmTxt(enc), null);
    /* ferro de ligação: 15 cm na estrutura e 15 cm na peça */
    var xf = x0 + Wp / 2;
    D.poli([[xf, yLaje + 3], [xf, yEnc + enc * k + an * k]], "EST-ARM-LONG", false);
    D.cotaV(yEnc + enc * k, yEnc + enc * k + an * k, x0 - 12, x0, "≥ " + cmTxt(an), null);
    D.cotaV(yLaje + 3, yEnc, x0 - 24, x0, "≥ " + cmTxt(an), null, { semExt: true });
    D.rotulo(xf, yEnc + enc * k / 2, "encunhamento: material [a definir]", T.nota, "EST-TEXTO", { angs: [0, 180] });
    D.rotulo(x0 + Wp / 2, yLaje + hLaje / 2, "laje / viga / cinta", T.nota, "EST-TEXTO", { angs: [90, 0, 180] });
    c.nota = ["Encunhamento mínimo de " + cmTxt(enc) + " cm. Ligação à estrutura em cada fiada, com ancoragem mínima de " + cmTxt(an) + " cm (Diretriz SiNAT nº 019).", "Bitola da barra de ligação e material do encunhamento: [a definir]."];
  }
  var DETALHES = [
    function (D, c, r, pags) { detCortePeca(D, c, pags); }, function (D, c, r, pags) { detCanto(D, c, pags); },
    function (D, c, r, pags) { detT(D, c, pags); }, function (D, c, r) { detVerga(D, c, r); },
    function (D, c, r) { detPilarete(D, c, r); }, function (D, c, r) { detCinta(D, c, r); },
    function (D, c, r, pags) { detJunta(D, c, pags); }, function (D, c, r, pags) { detEncunha(D, c, pags); }
  ];
  /* os 8 detalhes desenhados na origem (cada um no seu desenho) */
  function componentesDetalhes(r, avisos, M) {
    var pags = distintas(r);
    return DETALHES.map(function (fn, i) {
      var D = new Desenho(M), c = { x: 0, y: 0, w: 300, h: 140, meta: { n: i + 1, titulo: "DETALHE " + (i + 1), escala: "" }, nota: "" };
      D.limite = { x0: -2, x1: c.w + 2, y0: 0, y1: c.h + 4 };
      try { fn(D, c, r, pags); } catch (e) { aviso(avisos, "Detalhe " + (i + 1) + ": " + (e && e.message ? e.message : e)); }
      var b = D.bbox();
      return { D: D, b: b, w: Math.max(b.w, 1), h: Math.max(b.h, 1), meta: c.meta, nota: c.nota };
    });
  }
  /* grade regular: colunas × linhas de células iguais; título no canto superior esquerdo da célula, desenho centrado,
     nota abaixo do desenho, quebrada na largura da célula (nunca passa para a célula vizinha nem para a coluna) */
  var GX = 12, GY = 12;
  function linhasNota(nota, w) { var out = []; (Array.isArray(nota) ? nota : (nota ? [nota] : [])).forEach(function (p) { var pend = placeholder(p); quebrar(p, PADRAO.textos.nota, w).forEach(function (l) { out.push({ s: l, pend: pend }); }); }); return out; }
  function planoDetalhes(r, op, avisos, notas, M) {
    var comps = componentesDetalhes(r, avisos, M), T = PADRAO.textos, fmts = formatosDe(op, true), melhor = null;
    function grade(a, cols) {
      var rows = Math.ceil(comps.length / cols), cw = (a.w - (cols - 1) * GX) / cols, hs = [], i;
      for (i = 0; i < comps.length; i++) if (comps[i].w > cw) return null;
      for (var lr = 0; lr < rows; lr++) {
        var it = comps.slice(lr * cols, (lr + 1) * cols), hT = 0, hD = 0, hN = 0;
        it.forEach(function (c) {
          hT = Math.max(hT, alturaTitulo(c.meta.titulo, cw)); hD = Math.max(hD, c.h);
          hN = Math.max(hN, c.nota && c.nota.length ? linhasNota(c.nota, cw).length * T.nota * 1.45 + 4 : 0);
        });
        hs.push({ hT: hT, hD: hD, hN: hN, h: hT + hD + hN });
      }
      var H = hs.reduce(function (s, x) { return s + x.h; }, 0) + (rows - 1) * GY;
      return H <= a.h ? { cols: cols, rows: rows, cw: cw, hs: hs, H: H } : null;
    }
    for (var f = 0; f < fmts.length && !melhor; f++) {
      var g = geoDe(fmts[f]); if (!medirColuna(g, notas, M).cabe) continue;
      [2, 3, 4].forEach(function (cols) { var gr = grade(g.area, cols); if (gr && (!melhor || gr.H / g.area.h > melhor.gr.H / g.area.h)) melhor = { geo: g, gr: gr }; });
    }
    if (!melhor) {
      var gU = geoDe(fmts[fmts.length - 1]);
      aviso(avisos, "Detalhes típicos não cabem na folha " + gU.formato + ": conferir.");
      melhor = { geo: gU, gr: grade({ w: gU.area.w, h: 1e9 }, 2) || { cols: 2, rows: 4, cw: (gU.area.w - GX) / 2, hs: [], H: 0 } };
    }
    return { geo: melhor.geo, gr: melhor.gr, comps: comps };
  }
  function desenharDetalhes(D, P) {
    var a = P.geo.area, gr = P.gr, T = PADRAO.textos, livre = a.h - gr.H, gy = GY + (gr.rows > 1 ? Math.min(30, livre / (gr.rows + 1)) : 0);
    var y = a.y + (a.h - (gr.H + (gy - GY) * (gr.rows - 1))) / 2;
    for (var lr = 0; lr < gr.rows; lr++) {
      var hs = gr.hs[lr] || { hT: TITULO_H, hD: 100, hN: 10, h: 120 };
      for (var cc = 0; cc < gr.cols; cc++) {
        var i = lr * gr.cols + cc, c = P.comps[i]; if (!c) break;
        var x = a.x + cc * (gr.cw + GX);
        tituloDesenho(D, x, y, c.meta.titulo, c.meta.escala, gr.cw);
        D.mesclar(c.D, x + (gr.cw - c.w) / 2 - c.b.x0, y + hs.hT + (hs.hD - c.h) / 2 - c.b.y0);
        if (c.nota && c.nota.length) { var yn = y + hs.hT + hs.hD + 4; linhasNota(c.nota, gr.cw).forEach(function (l, k) { D.texto(x, yn + T.nota * 0.8 + k * T.nota * 1.45, l.s, T.nota, l.pend ? "BLK-PENDENTE" : "EST-TEXTO", { al: "E", cor: l.pend ? VERMELHO : null }); }); }
      }
      y += hs.h + gy;
    }
    return { escala: "INDICADA" };
  }

  /* ================================================================ TABELA DE AÇO (padrão TQS) */
  function montarAco(r) {
    var linhas = [], resumo = {}, tot = { "50A": 0, "60B": 0 }, concreto = 0;
    r.paredes.forEach(function (w) {
      if (!w.pag || !w.pag.quant) return;
      concreto += w.pag.quant.concretoM3;
      var porElem = {}, ordem = [], rotuloEl = {};
      reforcosDe(w).forEach(function (x) { rotuloEl[x.r.id] = x.r.id + " (" + nomeReforco(x.tipo) + ")"; });
      acoDe(w).forEach(function (a) {
        var k = chaveQuant(w, a.elemento), ch = k ? k.id : a.elemento;
        if (!porElem[ch]) { porElem[ch] = []; ordem.push(ch); }
        porElem[ch].push(a);
      });
      ordem.forEach(function (ch) {
        var itens = porElem[ch];
        linhas.push({ titulo: w.pag.id + " - " + (rotuloEl[ch] || ch) });
        itens.forEach(function (a, i) {
          var g = grau(a.bitola), unit = Math.round(a.comprimento * 100), kg = a.kg;
          linhas.push({ aco: g, pos: "N" + (i + 1), bit: a.bitola, quant: a.barras, unit: unit, total: Math.round(a.metros * 100), kg: kg, parede: w.pag.id, elemento: ch, nome: a.elemento });
          var kk = g + "|" + a.bitola; resumo[kk] = resumo[kk] || { aco: g, bit: a.bitola, m: 0, kg: 0 };
          resumo[kk].m += a.metros; resumo[kk].kg += kg; tot[g] += kg;
        });
      });
    });
    return { linhas: linhas, resumo: Object.keys(resumo).map(function (k) { return resumo[k]; }).sort(function (x, y) { return x.aco === y.aco ? x.bit - y.bit : (x.aco < y.aco ? -1 : 1); }), pesoTotal: tot, concretoM3: concreto };
  }
  function linhaAco(l) {
    if (l.titulo) return { titulo: l.titulo };
    return [l.aco, l.pos, String(l.bit).replace(".", ","), String(l.quant), String(l.unit), String(l.total), br(l.kg, 2)];
  }
  var CAB_ACO = ["AÇO", "POS", "BIT (mm)", "QUANT", ["COMPR", "UNIT (cm)"], ["COMPR", "TOTAL (cm)"], "PESO (kg)"], AL_ACO = ["C", "C", "D", "D", "D", "D", "D"];
  /* divide as linhas em n blocos de altura parecida, sem deixar título de elemento órfão no pé do bloco */
  function dividirAco(linhas, n) {
    var alvo = Math.ceil(linhas.length / n), blocos = [], cur = [];
    linhas.forEach(function (l, i) {
      var titulo = l.titulo !== undefined, resta = linhas.length - i;
      if (cur.length && blocos.length < n - 1 && (cur.length >= alvo || (titulo && cur.length >= alvo - 2 && resta > 2))) { blocos.push(cur); cur = []; }
      cur.push(l);
    });
    if (cur.length) blocos.push(cur);
    return blocos;
  }
  /* o resumo (tabela por bitola + pesos + nota) desenhado na origem */
  function componenteResumo(dadosAco, M) {
    var D = new Desenho(M), T = PADRAO.textos, y = 0;
    y += tituloDesenho(D, 0, 0, "RESUMO AÇO CA 50-60", "");
    var rl = dadosAco.resumo.map(function (s) { return [s.aco, String(s.bit).replace(".", ","), br(s.m, 1), br(s.kg, 1)]; });
    var tr = tabela(D, 0, y, PADRAO.tabelas.resumo, rl, { al: ["C", "D", "D", "D"] });
    y += tr.h + 6;
    var linhas = ["Peso Total 50A = " + br(dadosAco.pesoTotal["50A"], 1) + " kg", "Peso Total 60B = " + br(dadosAco.pesoTotal["60B"], 1) + " kg", "Volume de Concreto = " + br(dadosAco.concretoM3, 3) + " m3"];
    linhas.forEach(function (s) { D.texto(0, y + T.tabela * 1.2 * 0.8, s, T.tabela * 1.2, "EST-TEXTO", { al: "E", peso: 0.08 }); y += T.tabela * 1.2 * 1.5; });
    y += 2;
    quebrar("Quantidades sem acréscimo de perda. 50A = aço CA-50; 60B = aço CA-60 (Ø 5,0 mm em CA-60).", T.nota, Math.max(tr.w, 90)).forEach(function (s) { D.texto(0, y + T.nota * 0.8, s, T.nota, "EST-TEXTO", { al: "E" }); y += T.nota * 1.45; });
    var b = D.bbox();
    return { D: D, b: b, w: b.w, h: b.h };
  }
  function planoAco(dados, op, avisos, notas, M) {
    var linhas = dados.linhas.map(linhaAco), m0 = medirTabela(CAB_ACO, linhas), res = componenteResumo(dados, M), fmts = formatosDe(op, false), hl = m0.hl;
    function cabe(g) {
      var a = g.area, hDisp = a.h - TITULO_H, porBloco = Math.floor((hDisp - m0.hCab) / hl);
      if (porBloco < 6) return null;
      for (var n = Math.max(1, Math.ceil(linhas.length / porBloco)); n <= 8; n++) {
        var bl = dividirAco(linhas, n), hMax = 0, ok = true;
        bl.forEach(function (b) { var h = m0.hCab + b.length * hl; hMax = Math.max(hMax, h); if (h > hDisp + 1e-6) ok = false; });
        if (!ok) continue;
        var wTab = bl.length * m0.w + (bl.length - 1) * 8;
        if (wTab + RESPIRO + res.w <= a.w && Math.max(hMax, res.h - TITULO_H) <= hDisp) return { blocos: bl, w: wTab + RESPIRO + res.w, h: TITULO_H + Math.max(hMax, res.h - TITULO_H), resumo: "lado", wTab: wTab };
        if (wTab <= a.w && Math.max(wTab, res.w) <= a.w && TITULO_H + hMax + RESPIRO + res.h <= a.h) return { blocos: bl, w: Math.max(wTab, res.w), h: TITULO_H + hMax + RESPIRO + res.h, resumo: "baixo", wTab: wTab, hTab: hMax };
        if (wTab > a.w) return null;
      }
      return null;
    }
    for (var i = 0; i < fmts.length; i++) {
      var g = geoDe(fmts[i]); if (!medirColuna(g, notas, M).cabe) continue;
      var c = cabe(g); if (c) return [{ geo: g, c: c, res: res, larguras: m0.cw, n: 1, total: 1 }];
    }
    /* não coube numa folha: várias folhas do maior formato, resumo na última */
    var gU = geoDe(fmts[fmts.length - 1]), a = gU.area, porBloco = Math.max(8, Math.floor((a.h - TITULO_H - m0.hCab) / hl)), nB = Math.max(1, Math.floor((a.w + 8) / (m0.w + 8)));
    var todos = dividirAco(linhas, Math.ceil(linhas.length / porBloco) + 1), folhas = [];
    for (var k = 0; k < todos.length; k += nB) folhas.push(todos.slice(k, k + nB));
    return folhas.map(function (bl, j) { return { geo: gU, c: { blocos: bl, w: bl.length * m0.w + (bl.length - 1) * 8, h: a.h, resumo: j === folhas.length - 1 ? "baixo" : null }, res: res, larguras: m0.cw, n: j + 1, total: folhas.length }; });
  }
  function desenharAco(D, P) {
    var a = P.geo.area, c = P.c, x0 = a.x + (a.w - c.w) / 2, y0 = c.h >= a.h - 1 ? a.y : a.y + (a.h - c.h) / 2, T = PADRAO.textos;
    tituloDesenho(D, x0, y0, "TABELA DE AÇO" + (P.total > 1 ? " - " + P.n + "/" + P.total : ""), "");
    var xt = x0, hMax = 0;
    c.blocos.forEach(function (bl) { var tb = tabela(D, xt, y0 + TITULO_H, CAB_ACO, bl, { al: AL_ACO, larguras: P.larguras }); xt += tb.w + 8; hMax = Math.max(hMax, tb.h); });
    if (c.resumo === "lado") D.mesclar(P.res.D, x0 + c.wTab + RESPIRO - P.res.b.x0, y0 - P.res.b.y0);
    else if (c.resumo === "baixo") D.mesclar(P.res.D, x0 - P.res.b.x0, y0 + TITULO_H + hMax + RESPIRO - P.res.b.y0);
    else D.texto(x0, y0 + TITULO_H + hMax + 8, "continua na folha seguinte", T.nota, "EST-TEXTO", { al: "E" });
    return { escala: "INDICADA" };
  }

  /* ================================================================ CARIMBO (o RA de js/prancha.js, INTOCADO) */
  function carimboSvg(pr, folha, geo, empObj, logo, rotuloFolha, M) {
    var L = Prancha.carimboRA(pr, folha, null, empObj || null, geo, { logos: logo ? 1 : 0 }), cam = Prancha.CAMADAS_CARIMBO_RA, A = Prancha.ALT_MAIUSCULA, k = geo.carimbo, s = [];
    var COR_CAMADA = { "RA-CARIMBO-ROTULO": M.rotulo, "RA-CARIMBO-DESTAQUE": M.destaque }, caixas = [], linhas = [];
    function pena(c0) { return r2((cam[c0] || [0, 0.18])[1]); }
    s.push('<g transform="translate(' + r2(k.x) + " " + r2(k.y) + ')" font-family="Arial,Helvetica,sans-serif" data-carimbo="RA" data-modelo="' + M.id + '" style="white-space:pre">');
    s.push('<rect x="0" y="0" width="' + r2(L.w) + '" height="' + r2(L.h) + '" fill="#fff"/>');
    if (logo) L.logos.forEach(function (b) { s.push('<image href="' + esc(logo) + '" x="' + r2(b.x) + '" y="' + r2(b.y) + '" width="' + r2(b.w) + '" height="' + r2(b.h) + '" preserveAspectRatio="xMidYMid meet"/>'); });
    L.retangulos.forEach(function (q) {
      s.push('<rect x="' + r2(q.x) + '" y="' + r2(q.y) + '" width="' + r2(q.w) + '" height="' + r2(q.h) + '" fill="none" stroke="#111" stroke-width="' + pena(q.camada) + '"/>');
      [[q.x, q.y, q.x + q.w, q.y], [q.x + q.w, q.y, q.x + q.w, q.y + q.h], [q.x, q.y + q.h, q.x + q.w, q.y + q.h], [q.x, q.y, q.x, q.y + q.h]].forEach(function (p) { linhas.push({ x1: k.x + p[0], y1: k.y + p[1], x2: k.x + p[2], y2: k.y + p[3] }); });
    });
    L.linhas.forEach(function (l) {
      s.push('<line x1="' + r2(l.x1) + '" y1="' + r2(l.y1) + '" x2="' + r2(l.x2) + '" y2="' + r2(l.y2) + '" stroke="' + (l.camada === "RA-CARIMBO-DESTAQUE" ? M.destaque : "#111") + '" stroke-width="' + pena(l.camada) + '"/>');
      linhas.push({ x1: k.x + l.x1, y1: k.y + l.y1, x2: k.x + l.x2, y2: k.y + l.y2 });
    });
    L.textos.forEach(function (t) {
      var ts = t.campo === "folha" && rotuloFolha ? rotuloFolha : t.s;
      /* campo sem dado = placeholder [..] em VERMELHO (o aviso de propriedade fica na cor dele) */
      var cor = t.campo !== "aviso" && placeholder(ts) ? VERMELHO : (COR_CAMADA[t.camada] || "#111");
      s.push('<text x="' + r2(t.x) + '" y="' + r2(t.y) + '" font-size="' + r2(t.h / A) + '" text-anchor="' + (t.al === "C" ? "middle" : "start") + '" fill="' + cor + '"' +
        (t.negrito ? ' font-weight="bold"' : "") + (t.campo ? ' data-cr="' + t.campo + '"' : "") + ">" + esc(ts) + "</text>");
      /* a caixa do texto (Arial) para a conferência "fora da área": maiúscula acima da linha de base, descendente abaixo */
      var w = Prancha.largTexto ? Prancha.largTexto(ts, t.h, t.negrito) : txt(ts).length * 0.6 * t.h / A, x0 = k.x + (t.al === "C" ? t.x - w / 2 : t.x), yb = k.y + t.y;
      caixas.push({ s: ts, campo: t.campo, x0: x0, x1: x0 + w, y0: yb - t.h, y1: yb + 0.29 * t.h });
    });
    s.push("</g>");
    return { svg: s.join(""), caixas: caixas, linhas: linhas };
  }

  /* ================================================================ COLUNA: LEGENDA, NOTAS E NORMAS */
  function blocosColuna(r, tipo) {
    var cf = (r.paredes[0] && r.paredes[0].pag && r.paredes[0].pag.cfg) || {}, pa = r.parametros || {}, bl = [], F = BlocokExec.FONTES || {}, D0 = BlocokExec.DIRETRIZ || {};
    if (tipo === "pag") {
      bl.push({ titulo: "LEGENDA", exemplos: exemplosLegenda, itens: [
        "Número da peça: parede-ordem (ex.: P1-23). Abaixo dele, em peça cortada: largura x altura em cm e o tipo: M meia, R recorte, L recorte em L (sem indicação = inteira 90 x 90).",
        "Faixa hachurada com identificação: EPS retirado e concreto armado (PL pilarete, V verga, CV contraverga, CR cinta de respaldo).",
        "Retângulo tracejado: vão (PT porta, JN janela). F1, F2...: número da fiada.",
        "Cotas em cm; origem no eixo inicial da parede (x = 0)."
      ] });
    }
    bl.push({ titulo: "NOTAS", numerar: true, itens: [
      "Painel Blocok 90 x 90 cm: núcleo de EPS e duas faces de microconcreto de " + cmTxt(cf.face || 0.015) + " cm; junta de " + cmTxt(cf.junta || 0.015) + " cm nos dois sentidos; assentamento em amarração (transpasse mínimo " + Math.round((cf.transpasseMin || 0.33) * 100) + " % da peça).",
      "Concreto dos reforços fck " + txt(pa.fck) + " MPa; aço CA-50 e CA-60; CAA " + txt(pa.caa) + ". Cobrimento conforme NBR 6118, Tabela 7.2.",
      "Espaçamento máximo entre elementos estruturais " + br(D0.espacamentoEstruturaMax || 4, 1) + " m; encunhamento mínimo " + cmTxt(D0.encunhamentoMin || 0.03) + " cm; ligação à estrutura com ancoragem mínima de " + cmTxt(D0.ancoragemLigacao || 0.15) + " cm.",
      "Pesos das peças: " + txt(F.peso) + ".",
      "A armadura do quantitativo é a calculada pela NBR 6118 para pilaretes, vergas e cinta (inferior, superior nos apoios e lateral). Contravergas e porta-estribos têm armadura construtiva. Divergência entre cálculo e quantitativo aparece na coluna SITUAÇÃO do quadro de reforços."
    ] });
    var nm = r.normas || {}, ns = Object.keys(nm).map(function (k) { return nm[k]; });
    if (ns.length) bl.push({ titulo: "NORMAS UTILIZADAS", numerar: true, itens: ns });
    return bl;
  }
  /* exemplos desenhados da LEGENDA de paginação (faixa hachurada, vão) */
  function exemplosLegenda(D, x, y, h) {
    if (!D) return 12;
    D.ret(x, y + 2, 18, 6, "EST-FORMA-CORTE"); D.hachRet(x, y + 2, 18, 6, PADRAO.hachuras.espaco);
    D.texto(x + 22, y + 6.6, "faixa de reforço", h, "EST-TEXTO", { al: "E" });
    D.ret(x + 70, y + 2, 18, 6, "EST-OCULTA"); D.texto(x + 92, y + 6.6, "vão", h, "EST-TEXTO", { al: "E" });
    return 12;
  }

  /* ================================================================ IMPRESSÃO EM PDF (tamanho real)
     ⚠ "@page{size:A1 landscape}" NÃO funciona: o Chrome/Edge só conhecem A3/A4/A5/B4/B5/carta/ofício e ignoram o
     resto — a A1 saía encolhida numa folha Carta (texto de 2,5 mm virava 0,6 mm; foi o "texto ilegível" de
     14/10/2026). Cada folha vai numa página com NOME e tamanho em mm (como as Pranchas do projeto). */
  function htmlImpressao(folhas, titulo, o) {
    o = o || {}; var css = "", paginas = {}, corpo = "";
    arr(folhas).forEach(function (f) {
      var P = (f._geo && f._geo.papel) || { w: 841, h: 594 }, nm = "p" + P.w + "x" + P.h;
      if (!paginas[nm]) { paginas[nm] = 1; css += "@page " + nm + "{size:" + P.w + "mm " + P.h + "mm;margin:0}"; }
      corpo += '<div class="f" style="page:' + nm + ";width:" + P.w + "mm;height:" + P.h + 'mm">' + f.svg + "</div>";
    });
    return "<!doctype html><html lang=\"pt-BR\"><head><meta charset=\"utf-8\"><title>" + esc(titulo || "Pranchas Blocok") + "</title><style>" + css +
      "html,body{margin:0;padding:0;background:#fff}.f{overflow:hidden;break-after:page;page-break-after:always}.f:last-child{break-after:auto;page-break-after:auto}.f svg{display:block;width:100%;height:100%}" +
      "@media screen{body{background:#666}.f{margin:10px auto;background:#fff;box-shadow:0 2px 12px rgba(0,0,0,.4)}}</style></head><body>" + corpo +
      (o.imprimir ? "<script>setTimeout(function(){print()},500)<\/script>" : "") + "</body></html>";
  }

  /* ================================================================ GERAR */
  function gerar(r, op) {
    op = op || {};
    var avisos = [];
    if (!r || !r.paredes || !r.paredes.length) return { ok: false, folhas: [], avisos: ["Resultado do Blocok vazio: calcule a obra antes de gerar as pranchas."] };
    if (!Prancha || !Prancha.carimboRA) return { ok: false, folhas: [], avisos: ["Motor de pranchas (js/prancha.js) não carregado."] };
    var M = MODELOS[txt(op.modelo).toLowerCase() === "blocok" ? "blocok" : "ra"];
    var fx = txt(op.formato).toUpperCase();
    if (Prancha.FORMATOS[fx] && fx !== "A1" && fx !== "A0") aviso(avisos, "Formato " + fx + " fixo: as pranchas do Blocok escolhem o formato pelo conteúdo quando o formato é automático.");
    var codigo = txt(op.codigo).trim() || "BLK", rev = (txt(op.revisao).trim() || "R00").toUpperCase(), data = dataBR(op.data);
    var emp = op.empresa, empObj = emp && typeof emp === "object" ? emp : null, revNum = rev.replace(/^R/i, "") || "00";
    var aco = montarAco(r), notasPag = blocosColuna(r, "pag"), notas = blocosColuna(r, "geral");
    /* lista de folhas: cada uma com o seu formato e a função que desenha */
    var defs = [], pl = planoLocacao(r, op, avisos, notas, M);
    defs.push({ id: "locacao", titulo: "LOCAÇÃO E QUADRO DOS REFORÇOS", tipo: "loc", geo: pl.geo, fn: function (D) { return desenharLocacao(D, pl); } });
    planoPaginacao(r, op, avisos, notasPag, M).forEach(function (fp, i) {
      var ids = fp.lista.map(function (b) { return b.w.pag.id; }), escs = fp.lista.map(function (b) { return b.m.esc; }), igual = escs.every(function (e0) { return e0 === escs[0]; });
      var nomeIds = ids.length > 1 ? ids.slice(0, -1).join(", ") + " E " + ids[ids.length - 1] : ids[0];
      defs.push({ id: "paginacao-" + (i + 1), titulo: "PAGINAÇÃO - " + (ids.length > 1 ? "PAREDES " : "PAREDE ") + nomeIds, tipo: "pag", geo: fp.geo, escala: igual ? "1:" + escs[0] : "INDICADA",
        fn: function (D) { posicionar(fp.pl, fp.geo.area).forEach(function (p) { desenharParede(D, p.it.b.w, p.it.b.m, p.x, p.y, avisos); }); return { escala: igual ? "1:" + escs[0] : "INDICADA" }; } });
    });
    var pd = planoDetalhes(r, op, avisos, notas, M);
    defs.push({ id: "detalhes", titulo: "DETALHES TÍPICOS", tipo: "det", geo: pd.geo, fn: function (D) { return desenharDetalhes(D, pd); } });
    var pa = planoAco(aco, op, avisos, notas, M);
    pa.forEach(function (p) { defs.push({ id: "aco-" + p.n, titulo: "TABELA DE AÇO" + (p.total > 1 ? " - " + p.n + "/" + p.total : ""), tipo: "aco", geo: p.geo, fn: function (D) { return desenharAco(D, p); } }); });
    var nTot = defs.length;
    /* carimbo: empresa e responsável do cadastro (ou das opções), cliente da obra; faltou = placeholder vermelho */
    var E = empObj || {}, tituloProf = txt(op.tituloProfissional) || txt(E.titulo);
    var resp = txt(op.responsavel).trim() || txt(E.responsavel).trim(), reg = txt(op.registro).trim() || (E.crea ? Prancha.fmtRegistro(E.crea, tituloProf) : "");
    var cliente = txt(op.contratante).trim() || txt(op.cliente).trim() || txt(op.proprietario).trim();
    var nomeEmp = empObj ? txt(E.nome).trim() : txt(emp).trim();
    var pend = [];
    function ou(v, ph, nome) { if (v) return v; pend.push(nome); return ph; }
    var car = { modelo: "RA", empresa: empObj ? (nomeEmp ? "" : "[EMPRESA]") : ou(nomeEmp, "[EMPRESA]", "empresa"), titulo: tituloProf,
      responsavel: ou(resp, "[RESPONSÁVEL TÉCNICO]", "responsável técnico"), registro: ou(reg, "[REGISTRO CREA/CAU]", "registro profissional"),
      obra: ou(txt(op.obra).trim(), "[OBRA]", "obra"), proprietario: ou(txt(op.proprietario).trim() || cliente, "[PROPRIETÁRIO]", "proprietário"),
      contratante: ou(cliente, "[CONTRATANTE]", "contratante"), local: ou(txt(op.local).trim(), "[LOCAL DA OBRA]", "local da obra"),
      codigo: codigo, data: data, revisoes: [[revNum, txt(op.descricaoRevisao) || "EMISSÃO INICIAL - PROJETO EXECUTIVO", data]] };
    if (empObj && !nomeEmp) pend.push("empresa");
    if (pend.length) aviso(avisos, "Carimbo com placeholder em vermelho (sem dado no cadastro da conta ou da obra): " + pend.join(", ") + ".");
    var pr = Prancha.normalizar({ id: "blokpranchas", nome: "Blocok - projeto executivo de alvenaria", formato: defs[0].geo.formato, orientacao: "paisagem", origem: "blocok", carimbo: car,
      folhas: defs.map(function (d, i) { return { id: d.id, n: i + 1, conteudo: d.titulo, escala: d.escala || "INDICADA", numero: codigo + "-" + dois(i + 1) + " " + rev }; }) });
    var empCar = empObj ? (nomeEmp ? empObj : null) : null;
    var folhas = [];
    defs.forEach(function (def, i) {
      var geo = def.geo, D = new Desenho(M), res = {}, rotulo = dois(i + 1), W = geo.papel.w, H = geo.papel.h, Mo = geo.moldura;
      try { res = def.fn(D) || {}; } catch (e) { aviso(avisos, "Folha " + rotulo + " (" + def.titulo + "): " + (e && e.message ? e.message : e) + (e && e.stack ? " @ " + String(e.stack).split("\n")[1] : "")); }
      if (D.avisos) D.avisos.forEach(function (s) { aviso(avisos, "Folha " + rotulo + ": " + s); });
      /* modelo Blocok: faixa de título da marca no topo da moldura (na folga de 3 mm entre a moldura e a área) */
      if (M.sistema) { D.fundo(Mo.x, Mo.y, geo.coluna.x - Mo.x, 1.6, "BLK-MARCA-AZUL"); D.linha(Mo.x, Mo.y + 2.2, geo.coluna.x, Mo.y + 2.2, "BLK-MARCA-DOURADO"); }
      colunaNotas(D, geo, def.tipo === "pag" ? notasPag : notas, avisos, rotulo);
      var fl = pr.folhas[i], escala = (res.escala || def.escala || "INDICADA").toUpperCase();
      fl.escala = escala;
      var numero = codigo + "-" + rotulo, rotuloFolha = rotulo + "/" + dois(nTot);
      var cs = carimboSvg(pr, fl, geo, empCar, op.logo || null, rotuloFolha, M);
      var frame = '<rect x="' + Mo.x + '" y="' + Mo.y + '" width="' + Mo.w + '" height="' + Mo.h + '" fill="none" stroke="' + M.moldura + '" stroke-width="0.5"/>' +
        '<line x1="' + geo.coluna.x + '" y1="' + geo.coluna.y + '" x2="' + geo.coluna.x + '" y2="' + geo.carimbo.y + '" stroke="' + M.moldura + '" stroke-width="0.5"/>';
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + 'mm" height="' + H + 'mm" viewBox="0 0 ' + W + " " + H + '" font-family="' + PADRAO.fonte + '" text-rendering="geometricPrecision" data-folha="' + def.id + '" data-numero="' + esc(numero) + '" data-formato="' + geo.formato + '" data-modelo="' + M.id + '">' +
        "<title>" + esc(numero + " - " + def.titulo + " - " + rev) + "</title>" + '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#fff"/>' +
        '<g data-corpo="1">' + D.svg() + "</g>" + frame + cs.svg + "</svg>";
      var f = { id: def.id, rotulo: rotulo, numero: numero, titulo: def.titulo, formato: geo.formato, modelo: M.id, escala: escala, svg: svg,
        entidades: D.e, caixasTexto: D.cx, segmentosCota: D.cs, caixasCarimbo: cs.caixas, linhasCarimbo: cs.linhas, _pr: pr, _folhaPr: fl, _geo: geo };
      f.sobreposicoes = sobreposicoes(f);
      var so = f.sobreposicoes.filter(function (x) { return x.tipo !== "fora-da-area"; }), fo = f.sobreposicoes.filter(function (x) { return x.tipo === "fora-da-area"; });
      if (so.length) aviso(avisos, "Folha " + numero + ": " + so.length + " sobreposição(ões) de texto (ex.: '" + so[0].a + "' x '" + so[0].b + "').");
      if (fo.length) aviso(avisos, "Folha " + numero + ": " + fo.length + " texto(s) fora da sua caixa (ex.: '" + fo[0].a + "' fora da " + fo[0].b + ").");
      if (/NaN|undefined/.test(svg)) aviso(avisos, "Folha " + numero + ": há valor inválido (NaN/undefined) no desenho.");
      folhas.push(f);
    });
    /* pendências e divergências que o desenho revela (não decide: só informa) */
    var dif = 0, sem = 0;
    r.paredes.forEach(function (w) { if (w.pag && w.pag.reforcos) reforcosDe(w).forEach(function (x) { if (x.status === "difere") dif++; if (x.status === "sem cálculo") sem++; }); });
    if (dif) aviso(avisos, "Armadura calculada (NBR 6118) DIFERE do quantitativo do motor executivo em " + dif + " elemento(s): a tabela de aço usa o quantitativo (confere com BlocokExec.consolidar); o quadro de reforços mostra as duas. Conferir antes de emitir.");
    if (sem) aviso(avisos, sem + " elemento(s) de reforço sem cálculo (ex.: contravergas): armadura só construtiva.");
    aviso(avisos, "Pendências do desenho: bitola/comprimento do grampo, material do encunhamento, espessura das camadas do tratamento, cobrimento exato e disposição das barras — marcados [a definir] (em vermelho) nos detalhes.");
    return { ok: true, folhas: folhas, avisos: avisos, dados: { aco: aco, padrao: PADRAO, modelo: M.id } };
  }

  return { PADRAO: PADRAO, MODELOS: MODELOS, gerar: gerar, sobreposicoes: sobreposicoes, Desenho: Desenho, montarAco: montarAco, quadroReforcos: quadroReforcos,
    parseArm: parseArm, grau: grau, htmlImpressao: htmlImpressao, dataBR: dataBR, larg: larg };
});
